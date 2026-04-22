-- ============================================================================
-- 20260423_02_convenio_versioning.sql
-- Fase 11: Sugerencia de convenios candidatos por provincia/CNAE y
-- detección de nuevas versiones de un convenio ya asignado.
--
-- Amplía v3_docs con campos canónicos (canonical_code, canonical_title,
-- canonical_scope_json, version_date, supersedes_doc_id) sin romper nada
-- existente, e introduce:
--   - fn_v3_suggest_convenios_for_company(company_id)
--   - fn_v3_detect_newer_versions(company_id)
-- La asignación NO es automática: estas funciones se usan desde el UI para
-- proponer y el usuario confirma explícitamente.
-- ============================================================================

BEGIN;

-- 1) Campos canónicos en v3_docs -------------------------------------------
ALTER TABLE public.v3_docs
  ADD COLUMN IF NOT EXISTS canonical_code        text,
  ADD COLUMN IF NOT EXISTS canonical_title       text,
  ADD COLUMN IF NOT EXISTS canonical_scope_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS version_date          date,
  ADD COLUMN IF NOT EXISTS supersedes_doc_id     uuid REFERENCES public.v3_docs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cnae_codes            text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS v3_docs_canonical_code_idx
  ON public.v3_docs(canonical_code);

CREATE INDEX IF NOT EXISTS v3_docs_cnae_idx
  ON public.v3_docs USING gin (cnae_codes);

CREATE INDEX IF NOT EXISTS v3_docs_canonical_scope_idx
  ON public.v3_docs USING gin (canonical_scope_json);

COMMENT ON COLUMN public.v3_docs.canonical_code IS
  'Código canónico del convenio (slug estable entre versiones, p.ej. hosteleria_nacional_2024).';
COMMENT ON COLUMN public.v3_docs.canonical_title IS
  'Título canónico (lo que verá el usuario en el selector).';
COMMENT ON COLUMN public.v3_docs.canonical_scope_json IS
  'Ámbito estructurado: {provinces:[], sectors:[], national:bool, functional:text}.';
COMMENT ON COLUMN public.v3_docs.version_date IS
  'Fecha de la versión (effective_from del documento).';
COMMENT ON COLUMN public.v3_docs.supersedes_doc_id IS
  'Si este doc reemplaza a otro, referencia al anterior.';
COMMENT ON COLUMN public.v3_docs.cnae_codes IS
  'Lista de códigos CNAE que cubre el convenio (para sugerencia por sector).';

-- 2) Historial de reemplazos explícitos -------------------------------------
CREATE TABLE IF NOT EXISTS public.convenio_version_history (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(company_id) ON DELETE CASCADE,
  old_doc_id         uuid NOT NULL REFERENCES public.v3_docs(id),
  new_doc_id         uuid NOT NULL REFERENCES public.v3_docs(id),
  replaced_at        timestamptz NOT NULL DEFAULT now(),
  replaced_by_user   uuid NULL,
  notes              text NULL
);

CREATE INDEX IF NOT EXISTS convenio_version_history_company_idx
  ON public.convenio_version_history(company_id);

ALTER TABLE public.convenio_version_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cvh_service_all ON public.convenio_version_history;
DROP POLICY IF EXISTS cvh_rw          ON public.convenio_version_history;
CREATE POLICY cvh_service_all ON public.convenio_version_history
  FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY cvh_rw ON public.convenio_version_history
  FOR ALL TO public
  USING (
    public.is_super_admin()
    OR company_id = public.get_user_company_id()
    OR public.user_can_access_company(company_id)
  )
  WITH CHECK (
    public.is_super_admin()
    OR company_id = public.get_user_company_id()
    OR public.user_can_access_company(company_id)
  );

GRANT SELECT, INSERT ON public.convenio_version_history TO authenticated;

-- 3) fn_v3_suggest_convenios_for_company ------------------------------------
-- Busca en v3_docs (clasificados como collective_agreement) convenios
-- cuyo canonical_scope_json coincida con la provincia/CNAE de la empresa y
-- que todavía no estén asignados a ésta.
CREATE OR REPLACE FUNCTION public.fn_v3_suggest_convenios_for_company(
  p_company_id uuid
) RETURNS TABLE (
  doc_id            uuid,
  canonical_code    text,
  canonical_title   text,
  doc_title         text,
  match_score       numeric,
  match_reasons     jsonb,
  version_date      date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_province text;
  v_company_cnae     text;
BEGIN
  -- Datos básicos de la empresa (tolerante a columnas inexistentes)
  BEGIN
    EXECUTE $q$ SELECT lower(coalesce(c.province, c.city, c.province_name))
                FROM public.companies c WHERE c.company_id = $1 $q$
      INTO v_company_province USING p_company_id;
  EXCEPTION WHEN undefined_column THEN v_company_province := NULL;
  END;

  BEGIN
    EXECUTE $q$ SELECT c.cnae FROM public.companies c WHERE c.company_id = $1 $q$
      INTO v_company_cnae USING p_company_id;
  EXCEPTION WHEN undefined_column THEN v_company_cnae := NULL;
  END;

  RETURN QUERY
  WITH assigned AS (
    SELECT cc.doc_id FROM public.company_convenios cc WHERE cc.company_id = p_company_id
  )
  SELECT
    d.id,
    d.canonical_code,
    COALESCE(d.canonical_title, d.title)               AS canonical_title,
    d.title                                            AS doc_title,
    (
      CASE WHEN v_company_province IS NOT NULL
        AND d.canonical_scope_json ? 'provinces'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(d.canonical_scope_json->'provinces') AS p
          WHERE lower(p) = v_company_province
        ) THEN 0.6 ELSE 0 END
      +
      CASE WHEN v_company_cnae IS NOT NULL
        AND v_company_cnae = ANY (d.cnae_codes) THEN 0.3 ELSE 0 END
      +
      CASE WHEN COALESCE(d.canonical_scope_json->>'national','false')::boolean THEN 0.1 ELSE 0 END
    )::numeric                                          AS match_score,
    jsonb_build_object(
      'province_match', (v_company_province IS NOT NULL
                         AND d.canonical_scope_json ? 'provinces'),
      'cnae_match',     (v_company_cnae     IS NOT NULL
                         AND v_company_cnae = ANY (d.cnae_codes)),
      'national',       COALESCE(d.canonical_scope_json->>'national','false')::boolean
    )                                                    AS match_reasons,
    d.version_date
  FROM public.v3_docs d
  LEFT JOIN public.v3_doc_profile p ON p.doc_id = d.id
  WHERE COALESCE(p.doc_type, 'unknown') IN ('collective_agreement','salary_tables_annex','annex')
    AND d.id NOT IN (SELECT doc_id FROM assigned)
  ORDER BY match_score DESC, d.version_date DESC NULLS LAST
  LIMIT 20;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_v3_suggest_convenios_for_company(uuid) TO authenticated;

-- 4) fn_v3_detect_newer_versions --------------------------------------------
-- Para cada convenio asignado a la empresa, busca en v3_docs si existe otro
-- documento con el mismo canonical_code y version_date posterior.
CREATE OR REPLACE FUNCTION public.fn_v3_detect_newer_versions(
  p_company_id uuid
) RETURNS TABLE (
  assignment_id   uuid,
  current_doc_id  uuid,
  current_title   text,
  current_version date,
  newer_doc_id    uuid,
  newer_title     text,
  newer_version   date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cc.id           AS assignment_id,
    cur.id          AS current_doc_id,
    COALESCE(cur.canonical_title, cur.title) AS current_title,
    cur.version_date AS current_version,
    new_d.id        AS newer_doc_id,
    COALESCE(new_d.canonical_title, new_d.title) AS newer_title,
    new_d.version_date AS newer_version
  FROM public.company_convenios cc
  JOIN public.v3_docs cur ON cur.id = cc.doc_id
  JOIN LATERAL (
    SELECT d.*
    FROM public.v3_docs d
    WHERE d.canonical_code IS NOT NULL
      AND d.canonical_code = cur.canonical_code
      AND d.id <> cur.id
      AND COALESCE(d.version_date, '1900-01-01') > COALESCE(cur.version_date, '1900-01-01')
    ORDER BY d.version_date DESC NULLS LAST
    LIMIT 1
  ) new_d ON true
  WHERE cc.company_id = p_company_id
    AND cc.is_active  = true;
$$;

GRANT EXECUTE ON FUNCTION public.fn_v3_detect_newer_versions(uuid) TO authenticated;

-- 5) fn_v3_replace_version: acción explícita de reemplazo con historial.
CREATE OR REPLACE FUNCTION public.fn_v3_replace_version(
  p_company_id uuid,
  p_old_doc_id uuid,
  p_new_doc_id uuid,
  p_notes      text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_history_id uuid;
  v_assignment uuid;
BEGIN
  -- Validar que el caller puede operar sobre la empresa
  IF NOT (public.is_super_admin()
          OR public.get_user_company_id() = p_company_id
          OR public.user_can_access_company(p_company_id))
  THEN
    RAISE EXCEPTION 'not authorized for company %', p_company_id;
  END IF;

  -- Reemplaza en company_convenios (mantiene prioridad/provincia)
  UPDATE public.company_convenios
     SET doc_id     = p_new_doc_id,
         updated_at = now()
   WHERE company_id = p_company_id
     AND doc_id     = p_old_doc_id
  RETURNING id INTO v_assignment;

  IF v_assignment IS NULL THEN
    -- Si no existía asignación previa, crea una nueva
    INSERT INTO public.company_convenios(company_id, doc_id, is_active)
      VALUES (p_company_id, p_new_doc_id, true)
      RETURNING id INTO v_assignment;
  END IF;

  INSERT INTO public.convenio_version_history(company_id, old_doc_id, new_doc_id, notes)
       VALUES (p_company_id, p_old_doc_id, p_new_doc_id, p_notes)
    RETURNING id INTO v_history_id;

  -- Marca el doc antiguo como superseded (si no lo estaba)
  UPDATE public.v3_docs
     SET supersedes_doc_id = NULL -- el antiguo no supersedes nada nuevo
   WHERE id = p_old_doc_id;

  UPDATE public.v3_docs
     SET supersedes_doc_id = p_old_doc_id
   WHERE id = p_new_doc_id;

  RETURN v_history_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_v3_replace_version(uuid, uuid, uuid, text) TO authenticated;

COMMIT;
