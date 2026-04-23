-- Nota: is_super_admin() queda definida/actualizada en
-- 20260426_is_super_admin_soporte_and_suggest_rpc.sql (soporte@vacly.es).
--
-- ============================================================================
-- 20260425_fix_convenios_suggest_rpc_and_rls_helpers.sql
--
-- 1) fn_v3_suggest_convenios_for_company: evita 400 por casts inválidos
--    (p.ej. canonical_scope_json->>'national' = '' o texto no booleano).
-- 2) get_user_company_id / user_can_access_company: SECURITY DEFINER con
--    search_path fijo y lectura de agency_id tolerante si falta la columna.
--    Así las políticas RLS de company_convenios dejan de fallar en silencio
--    o denegar inserciones cuando el helper no resolvía bien public.users.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helpers RLS (alineados con vacly-app/database/rls_security_migration.sql)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT u.company_id
    FROM public.users u
    WHERE u.id = auth.uid()
    LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_company(check_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_company_id uuid;
  is_agency        boolean := false;
BEGIN
  SELECT u.company_id
    INTO user_company_id
    FROM public.users u
   WHERE u.id = auth.uid()
   LIMIT 1;

  IF user_company_id IS NULL THEN
    RETURN false;
  END IF;

  IF user_company_id = check_company_id THEN
    RETURN true;
  END IF;

  BEGIN
    SELECT EXISTS (
      SELECT 1
        FROM public.companies c
       WHERE c.company_id = check_company_id
         AND c.agency_id IS NOT DISTINCT FROM user_company_id
    )
      INTO is_agency;
  EXCEPTION
    WHEN undefined_column THEN
      is_agency := false;
  END;

  RETURN COALESCE(is_agency, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_company_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_access_company(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPC sugerencias: casts seguros sobre JSON y "national"
-- ---------------------------------------------------------------------------

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
  BEGIN
    EXECUTE $q$
      SELECT lower(coalesce(c.province::text, c.city::text, c.province_name::text))
        FROM public.companies c
       WHERE c.company_id = $1
    $q$
      INTO v_company_province
     USING p_company_id;
  EXCEPTION
    WHEN undefined_column THEN
      v_company_province := NULL;
  END;

  BEGIN
    EXECUTE $q$ SELECT c.cnae::text FROM public.companies c WHERE c.company_id = $1 $q$
      INTO v_company_cnae
     USING p_company_id;
  EXCEPTION
    WHEN undefined_column THEN
      v_company_cnae := NULL;
  END;

  RETURN QUERY
  WITH assigned AS (
    SELECT cc.doc_id
      FROM public.company_convenios cc
     WHERE cc.company_id = p_company_id
  )
  SELECT
    d.id,
    d.canonical_code,
    COALESCE(d.canonical_title, d.title) AS canonical_title,
    d.title AS doc_title,
    (
      CASE
        WHEN v_company_province IS NOT NULL
         AND jsonb_typeof(COALESCE(d.canonical_scope_json, '{}'::jsonb) -> 'provinces') = 'array'
         AND EXISTS (
           SELECT 1
             FROM jsonb_array_elements_text(
                    COALESCE(d.canonical_scope_json, '{}'::jsonb) -> 'provinces'
                  ) AS p(txt)
            WHERE lower(trim(both from txt)) = v_company_province
         )
        THEN 0.6
        ELSE 0::numeric
      END
      +
      CASE
        WHEN v_company_cnae IS NOT NULL
         AND COALESCE(d.cnae_codes, '{}'::text[]) <> '{}'::text[]
         AND v_company_cnae = ANY (d.cnae_codes)
        THEN 0.3
        ELSE 0::numeric
      END
      +
      CASE
        WHEN lower(trim(both FROM coalesce(d.canonical_scope_json->>'national', ''))) IN (
          'true', 't', '1', 'yes', 'si', 'sí', 'verdadero'
        )
        THEN 0.1
        ELSE 0::numeric
      END
    )::numeric AS match_score,
    jsonb_build_object(
      'province_match',
        (v_company_province IS NOT NULL
         AND jsonb_typeof(COALESCE(d.canonical_scope_json, '{}'::jsonb) -> 'provinces') = 'array'),
      'cnae_match',
        (v_company_cnae IS NOT NULL
         AND COALESCE(d.cnae_codes, '{}'::text[]) <> '{}'::text[]
         AND v_company_cnae = ANY (d.cnae_codes)),
      'national',
        (lower(trim(both FROM coalesce(d.canonical_scope_json->>'national', ''))) IN (
          'true', 't', '1', 'yes', 'si', 'sí', 'verdadero'
        ))
    ) AS match_reasons,
    d.version_date
  FROM public.v3_docs d
  LEFT JOIN public.v3_doc_profile p ON p.doc_id = d.id
 WHERE COALESCE(p.doc_type, 'unknown'::text) IN (
         'collective_agreement',
         'salary_tables_annex',
         'annex'
       )
   AND d.id NOT IN (SELECT a.doc_id FROM assigned a WHERE a.doc_id IS NOT NULL)
 ORDER BY 5 DESC NULLS LAST, d.version_date DESC NULLS LAST
 LIMIT 20;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_v3_suggest_convenios_for_company(uuid) TO authenticated, service_role;
