-- ============================================================================
-- 20260426_is_super_admin_soporte_and_suggest_rpc.sql
--
-- 1) public.is_super_admin(): la app marca soporte@vacly.es en código
--    (UserContext) pero RLS en Postgres necesita la misma regla. Sin esto,
--    is_super_admin() puede no existir o devolver siempre false → 403 en
--    company_convenios y otras tablas que ya referencian la función.
--
-- 2) fn_v3_suggest_convenios_for_company: NOT EXISTS en lugar de NOT IN
--    (NULLs), documentos sin fila en v3_doc_profile incluidos, y ORDER BY
--    explícito por alias para evitar 400 por errores en tiempo de ejecución.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Super-admin: mismo criterio que vacly-app/components/ui/UserContext.tsx
-- (SUPER_ADMIN_EMAILS). Comprueba JWT, public.users y auth.users.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_email   text;
  public_mail text;
BEGIN
  jwt_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  IF jwt_email IN ('soporte@vacly.es') THEN
    RETURN true;
  END IF;

  IF coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'super_admin' THEN
    RETURN true;
  END IF;

  IF coalesce((auth.jwt() -> 'user_metadata' ->> 'is_super_admin'), '') IN ('true', '1', 'yes') THEN
    RETURN true;
  END IF;

  SELECT lower(trim(coalesce(u.email, '')))
    INTO public_mail
    FROM public.users u
   WHERE u.id = auth.uid()
   LIMIT 1;

  IF public_mail IN ('soporte@vacly.es') THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.is_super_admin() IS
  'Vacly soporte / super-admin para RLS: soporte@vacly.es (email en JWT o public.users), app_metadata.role=super_admin, user_metadata.is_super_admin.';

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Sugerencias de convenios (reemplazo robusto)
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
  IF p_company_id IS NULL THEN
    RETURN;
  END IF;

  -- Solo empresa propia, agencia con acceso, o super-admin
  IF NOT (
    public.is_super_admin()
    OR public.get_user_company_id() = p_company_id
    OR public.user_can_access_company(p_company_id)
  ) THEN
    RAISE EXCEPTION 'not authorized for company %', p_company_id
      USING errcode = '42501';
  END IF;

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
    EXECUTE $q$
      SELECT c.cnae::text FROM public.companies c WHERE c.company_id = $1
    $q$
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
  ),
  scored AS (
    SELECT
      d.id AS sid,
      d.canonical_code AS scode,
      COALESCE(d.canonical_title, d.title) AS stitle,
      d.title AS sdoc_title,
      (
        CASE
          WHEN v_company_province IS NOT NULL
           AND jsonb_typeof(COALESCE(d.canonical_scope_json, '{}'::jsonb) -> 'provinces') = 'array'
           AND EXISTS (
             SELECT 1
               FROM jsonb_array_elements_text(
                      COALESCE(d.canonical_scope_json, '{}'::jsonb) -> 'provinces'
                    ) AS p(txt)
              WHERE lower(trim(both FROM txt)) = v_company_province
           )
          THEN 0.6::numeric
          ELSE 0::numeric
        END
        +
        CASE
          WHEN v_company_cnae IS NOT NULL
           AND COALESCE(d.cnae_codes, '{}'::text[]) <> '{}'::text[]
           AND v_company_cnae = ANY (d.cnae_codes)
          THEN 0.3::numeric
          ELSE 0::numeric
        END
        +
        CASE
          WHEN lower(trim(both FROM coalesce(d.canonical_scope_json ->> 'national', ''))) IN (
            'true', 't', '1', 'yes', 'si', 'sí', 'verdadero'
          )
          THEN 0.1::numeric
          ELSE 0::numeric
        END
      )::numeric AS smatch_score,
      jsonb_build_object(
        'province_match',
          (v_company_province IS NOT NULL
           AND jsonb_typeof(COALESCE(d.canonical_scope_json, '{}'::jsonb) -> 'provinces') = 'array'),
        'cnae_match',
          (v_company_cnae IS NOT NULL
           AND COALESCE(d.cnae_codes, '{}'::text[]) <> '{}'::text[]
           AND v_company_cnae = ANY (d.cnae_codes)),
        'national',
          (lower(trim(both FROM coalesce(d.canonical_scope_json ->> 'national', ''))) IN (
            'true', 't', '1', 'yes', 'si', 'sí', 'verdadero'
          ))
      ) AS sreasons,
      d.version_date AS sversion
    FROM public.v3_docs d
    LEFT JOIN public.v3_doc_profile p ON p.doc_id = d.id
   WHERE (
      p.doc_id IS NULL
      OR COALESCE(p.doc_type, 'unknown'::text) IN (
        'collective_agreement',
        'salary_tables_annex',
        'annex'
      )
    )
     AND NOT EXISTS (SELECT 1 FROM assigned a WHERE a.doc_id = d.id)
  )
  SELECT
    scored.sid,
    scored.scode,
    scored.stitle,
    scored.sdoc_title,
    scored.smatch_score,
    scored.sreasons,
    scored.sversion
    FROM scored
   ORDER BY scored.smatch_score DESC NULLS LAST, scored.sversion DESC NULLS LAST
   LIMIT 20;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_v3_suggest_convenios_for_company(uuid) TO authenticated, service_role;
