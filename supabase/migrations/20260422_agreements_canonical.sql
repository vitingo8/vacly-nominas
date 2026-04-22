-- ============================================================================
-- 20260422_agreements_canonical.sql
-- Canonical layer bridging extracted collective agreements (v3_rrhh_*)
-- to the payroll engine. No data duplication: everything reads live from
-- v3_rrhh_* via views/functions. Tables added here are only the logical
-- registry + company assignments needed to make the extracted content
-- consumable by the payroll engine and to enforce multi-tenant isolation.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Registry: each extracted collective agreement document becomes one row
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agreement_registry (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_doc_id         uuid NOT NULL REFERENCES public.v3_docs(id) ON DELETE RESTRICT,
  owner_company_id      uuid NOT NULL,
  code                  text NOT NULL,
  name                  text NOT NULL,
  provinces             text[] NOT NULL DEFAULT '{}',
  effective_from        date,
  effective_to          date,
  economic_effects_from date,
  status                text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('draft','active','expired','superseded','archived')),
  requires_review       boolean NOT NULL DEFAULT false,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_company_id, code),
  UNIQUE (source_doc_id)
);

CREATE INDEX IF NOT EXISTS agreement_registry_company_idx
  ON public.agreement_registry(owner_company_id);
CREATE INDEX IF NOT EXISTS agreement_registry_status_idx
  ON public.agreement_registry(status);
CREATE INDEX IF NOT EXISTS agreement_registry_effective_idx
  ON public.agreement_registry(effective_from, effective_to);

COMMENT ON TABLE public.agreement_registry IS
  'Logical registry of collective agreements. Each row points to an ingested document (v3_docs) that has been extracted and reviewed for payroll use.';

-- ----------------------------------------------------------------------------
-- 2. Company assignments: which agreement applies to which company + scope
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_agreement_assignments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL,
  agreement_id     uuid NOT NULL REFERENCES public.agreement_registry(id) ON DELETE CASCADE,
  default_province text,
  scope_filter     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- optional narrowing (center ids, job codes)
  priority         int  NOT NULL DEFAULT 0,
  effective_from   date,
  effective_to     date,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, agreement_id, effective_from)
);

CREATE INDEX IF NOT EXISTS cag_company_idx
  ON public.company_agreement_assignments(company_id);
CREATE INDEX IF NOT EXISTS cag_agreement_idx
  ON public.company_agreement_assignments(agreement_id);

COMMENT ON TABLE public.company_agreement_assignments IS
  'Assigns a registered agreement to a company (tenant), with optional scope filters (center/role) and default province for payroll resolution.';

-- ----------------------------------------------------------------------------
-- 3. Contracts: add a proper FK to the agreement registry (keeps legacy
--    agreement_id text for backwards compatibility, gradual migration).
-- ----------------------------------------------------------------------------
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS agreement_ref_id uuid
    REFERENCES public.agreement_registry(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS contracts_agreement_ref_idx
  ON public.contracts(agreement_ref_id);

-- ----------------------------------------------------------------------------
-- 4. updated_at trigger helper
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at_col()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agreement_registry_updated ON public.agreement_registry;
CREATE TRIGGER trg_agreement_registry_updated
  BEFORE UPDATE ON public.agreement_registry
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_col();

DROP TRIGGER IF EXISTS trg_cag_updated ON public.company_agreement_assignments;
CREATE TRIGGER trg_cag_updated
  BEFORE UPDATE ON public.company_agreement_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_col();

-- ============================================================================
-- 5. Canonical views over v3_rrhh_* (read-only projections, no data copy)
-- ============================================================================

-- 5.1 Salary base tables flattened:
--     one row per (agreement, province, year, grupo, nivel, categoria)
CREATE OR REPLACE VIEW public.agreement_salary_tables_v AS
SELECT
  ar.id                                                        AS agreement_id,
  ar.owner_company_id                                          AS owner_company_id,
  t.id                                                         AS source_table_id,
  COALESCE(NULLIF(prov, ''), arp)                              AS province,
  COALESCE(t.effective_from, ar.effective_from)                AS effective_from,
  COALESCE(t.effective_to,   ar.effective_to)                  AS effective_to,
  EXTRACT(YEAR FROM COALESCE(t.effective_from, ar.effective_from))::int AS year,
  trim(COALESCE(row_data->>'grupo', row_data->>'Grupo'))       AS grupo,
  trim(COALESCE(row_data->>'nivel', row_data->>'Nivel'))       AS nivel,
  trim(COALESCE(row_data->>'categoria', row_data->>'Categoria',
                row_data->>'Denominación', row_data->>'denominacion')) AS categoria,
  NULLIF(REPLACE(REPLACE(COALESCE(
    row_data->>'salario_base_mes',
    row_data->>'salario_base',
    row_data->>'importe_mensual',
    row_data->>'importe'
  ), '.', ''), ',', '.'), '')::numeric                         AS salario_base_mes,
  t.confidence                                                 AS confidence
FROM public.agreement_registry ar
JOIN public.v3_rrhh_tables t
  ON t.doc_id = ar.source_doc_id
 AND t.key LIKE 'salary_table_%'
CROSS JOIN LATERAL jsonb_array_elements(t.rows_json) AS row_data
LEFT JOIN LATERAL jsonb_array_elements_text(COALESCE(t.applicability_json->'provinces', '[]'::jsonb)) AS prov ON true
LEFT JOIN LATERAL unnest(ar.provinces) AS arp ON true
WHERE (row_data ? 'grupo' OR row_data ? 'Grupo')
  AND (
    row_data ? 'salario_base_mes' OR row_data ? 'salario_base' OR
    row_data ? 'importe_mensual'  OR row_data ? 'importe'
  );

COMMENT ON VIEW public.agreement_salary_tables_v IS
  'Flattened salary tables. One row per (agreement, province, year, grupo, nivel, categoria).';

-- 5.2 Pluses / complementos (dietas, kilometraje, plus festivo, horas extra...)
CREATE OR REPLACE VIEW public.agreement_pluses_v AS
SELECT
  ar.id                                                        AS agreement_id,
  ar.owner_company_id                                          AS owner_company_id,
  t.id                                                         AS source_table_id,
  COALESCE(NULLIF(prov, ''), arp)                              AS province,
  COALESCE(t.effective_from, ar.effective_from)                AS effective_from,
  COALESCE(t.effective_to,   ar.effective_to)                  AS effective_to,
  EXTRACT(YEAR FROM COALESCE(t.effective_from, ar.effective_from))::int AS year,
  trim(row_data->>'concepto')                                  AS concepto,
  NULLIF(REPLACE(REPLACE(COALESCE(
    row_data->>'importe',
    row_data->>'importe_mensual',
    row_data->>'importe_unitario'
  ), '.', ''), ',', '.'), '')::numeric                         AS importe,
  t.confidence                                                 AS confidence
FROM public.agreement_registry ar
JOIN public.v3_rrhh_tables t
  ON t.doc_id = ar.source_doc_id
 AND t.key LIKE 'pluses_complementos_%'
CROSS JOIN LATERAL jsonb_array_elements(t.rows_json) AS row_data
LEFT JOIN LATERAL jsonb_array_elements_text(COALESCE(t.applicability_json->'provinces', '[]'::jsonb)) AS prov ON true
LEFT JOIN LATERAL unnest(ar.provinces) AS arp ON true
WHERE row_data ? 'concepto';

-- 5.3 Pagas extraordinarias (count, provinces, devengo, base concepts)
CREATE OR REPLACE VIEW public.agreement_extra_pays_v AS
SELECT
  ar.id                                                        AS agreement_id,
  ar.owner_company_id                                          AS owner_company_id,
  t.id                                                         AS source_table_id,
  trim(row_data->>'provincia')                                 AS province,
  trim(row_data->>'paga')                                      AS paga_nombre,
  NULLIF(row_data->>'dias', '')::int                           AS dias,
  trim(row_data->>'periodo_devengo')                           AS periodo_devengo,
  trim(row_data->>'fecha_pago')                                AS fecha_pago,
  trim(row_data->>'conceptos')                                 AS base_concepts_text,
  t.confidence                                                 AS confidence
FROM public.agreement_registry ar
JOIN public.v3_rrhh_tables t
  ON t.doc_id = ar.source_doc_id
 AND t.key = 'pagas_extraordinarias_por_provincia'
CROSS JOIN LATERAL jsonb_array_elements(t.rows_json) AS row_data
WHERE row_data ? 'provincia' AND row_data ? 'paga';

-- 5.4 Scalar payroll inputs (percents, rules, formulas) indexed by key
CREATE OR REPLACE VIEW public.agreement_scalar_inputs_v AS
SELECT
  ar.id            AS agreement_id,
  ar.owner_company_id AS owner_company_id,
  i.id             AS source_input_id,
  i.key            AS key,
  i.label          AS label,
  i.domain         AS domain,
  i.data_type      AS data_type,
  i.unit           AS unit,
  i.value_json     AS value_json,
  i.formula_text   AS formula_text,
  i.applicability_json AS applicability_json,
  i.effective_from AS effective_from,
  i.effective_to   AS effective_to,
  i.confidence     AS confidence
FROM public.agreement_registry ar
JOIN public.v3_rrhh_inputs i ON i.doc_id = ar.source_doc_id;

-- 5.5 Professional groups + niveles (18 rows for cleaning convenio)
CREATE OR REPLACE VIEW public.agreement_groups_v AS
SELECT
  ar.id                                                        AS agreement_id,
  ar.owner_company_id                                          AS owner_company_id,
  trim(COALESCE(row_data->>'Grupo', row_data->>'grupo'))       AS grupo,
  trim(COALESCE(row_data->>'Nivel', row_data->>'nivel'))       AS nivel,
  trim(COALESCE(row_data->>'Denominación', row_data->>'denominacion',
                row_data->>'categoria'))                       AS denominacion,
  t.confidence                                                 AS confidence
FROM public.agreement_registry ar
JOIN public.v3_rrhh_tables t
  ON t.doc_id = ar.source_doc_id
 AND t.key = 'grupos_profesionales_y_niveles_funcionales'
CROSS JOIN LATERAL jsonb_array_elements(t.rows_json) AS row_data
WHERE row_data ? 'Grupo' OR row_data ? 'grupo';

-- ============================================================================
-- 6. Resolution functions (the stable API that the payroll engine consumes)
-- ============================================================================

-- 6.1 fn_agreement_for_company: picks the active agreement for (company, date)
CREATE OR REPLACE FUNCTION public.fn_agreement_for_company(
  p_company_id  uuid,
  p_on_date     date DEFAULT CURRENT_DATE
) RETURNS TABLE (
  agreement_id     uuid,
  default_province text,
  registry_status  text,
  effective_from   date,
  effective_to     date,
  requires_review  boolean,
  in_force         boolean
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    ar.id,
    cag.default_province,
    ar.status,
    ar.effective_from,
    ar.effective_to,
    ar.requires_review,
    (p_on_date >= COALESCE(ar.effective_from, p_on_date)
      AND p_on_date <= COALESCE(ar.effective_to, p_on_date)) AS in_force
  FROM public.company_agreement_assignments cag
  JOIN public.agreement_registry ar ON ar.id = cag.agreement_id
  WHERE cag.company_id = p_company_id
    AND (cag.effective_from IS NULL OR cag.effective_from <= p_on_date)
    AND (cag.effective_to   IS NULL OR cag.effective_to   >= p_on_date)
    AND ar.status IN ('active','expired')
  ORDER BY cag.priority DESC, ar.effective_from DESC NULLS LAST
  LIMIT 1;
$$;

-- 6.2 fn_resolve_salary_base: lookup monthly base for (agreement, province, year, grupo, nivel)
CREATE OR REPLACE FUNCTION public.fn_resolve_salary_base(
  p_agreement_id uuid,
  p_province     text,
  p_year         int,
  p_grupo        text,
  p_nivel        text,
  p_categoria    text DEFAULT NULL
) RETURNS numeric
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT v.salario_base_mes
  FROM public.agreement_salary_tables_v v
  WHERE v.agreement_id = p_agreement_id
    AND lower(v.province) = lower(p_province)
    AND v.year = p_year
    AND lower(v.grupo) = lower(p_grupo)
    AND lower(v.nivel) = lower(p_nivel)
    AND (p_categoria IS NULL OR lower(v.categoria) LIKE '%' || lower(p_categoria) || '%')
  ORDER BY v.confidence DESC NULLS LAST
  LIMIT 1;
$$;

-- 6.3 fn_resolve_seniority: lookup % per period (trienio/cuatrienio) by province
CREATE OR REPLACE FUNCTION public.fn_resolve_seniority(
  p_agreement_id uuid,
  p_province     text
) RETURNS TABLE (
  period_years    int,
  percent         numeric,
  base_concepts   text,
  cap_percent     numeric,
  cap_years       int
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH cfg AS (
    SELECT
      lower(p_province) AS prov,
      p_agreement_id    AS aid
  ),
  pct AS (
    SELECT
      CASE
        WHEN i.key ILIKE '%cuatrienio%' THEN 4
        WHEN i.key ILIKE '%trienio%'    THEN 3
        WHEN i.key ILIKE '%bienio%'     THEN 2
        ELSE NULL
      END AS period_years,
      (i.value_json)::text::numeric AS percent
    FROM public.agreement_scalar_inputs_v i, cfg
    WHERE i.agreement_id = cfg.aid
      AND i.key ILIKE 'seniority_%'
      AND i.key ILIKE '%' || cfg.prov || '%'
      AND i.data_type = 'percent'
    ORDER BY i.confidence DESC NULLS LAST
    LIMIT 1
  )
  SELECT
    pct.period_years,
    pct.percent,
    NULL::text,
    NULL::numeric,
    NULL::int
  FROM pct;
$$;

-- 6.4 fn_resolve_extra_pays: returns the extra pays (number, base concepts) for a province
CREATE OR REPLACE FUNCTION public.fn_resolve_extra_pays(
  p_agreement_id uuid,
  p_province     text
) RETURNS TABLE (
  paga_nombre        text,
  dias               int,
  periodo_devengo    text,
  fecha_pago         text,
  base_concepts_text text
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    e.paga_nombre,
    e.dias,
    e.periodo_devengo,
    e.fecha_pago,
    e.base_concepts_text
  FROM public.agreement_extra_pays_v e
  WHERE e.agreement_id = p_agreement_id
    AND lower(e.province) LIKE '%' || lower(p_province) || '%';
$$;

-- 6.5 fn_resolve_plus: lookup amount of a named plus (diet, km, festivo) for (province, year)
CREATE OR REPLACE FUNCTION public.fn_resolve_plus(
  p_agreement_id uuid,
  p_province     text,
  p_year         int,
  p_concepto     text
) RETURNS numeric
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT p.importe
  FROM public.agreement_pluses_v p
  WHERE p.agreement_id = p_agreement_id
    AND lower(p.province) = lower(p_province)
    AND p.year = p_year
    AND lower(p.concepto) LIKE '%' || lower(p_concepto) || '%'
  ORDER BY p.confidence DESC NULLS LAST
  LIMIT 1;
$$;

-- ============================================================================
-- 7. RLS policies (consistent with salary_concepts / payroll_config)
-- ============================================================================
ALTER TABLE public.agreement_registry              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_agreement_assignments   ENABLE ROW LEVEL SECURITY;

-- service role bypass
CREATE POLICY agreement_registry_service_all ON public.agreement_registry
  FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY cag_service_all ON public.company_agreement_assignments
  FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- user access: only own company (or agency / super_admin)
CREATE POLICY agreement_registry_select ON public.agreement_registry
  FOR SELECT TO public
  USING (
    public.is_super_admin()
    OR owner_company_id = public.get_user_company_id()
    OR public.user_can_access_company(owner_company_id)
  );

CREATE POLICY agreement_registry_ins_upd_del ON public.agreement_registry
  FOR ALL TO public
  USING (
    public.is_super_admin()
    OR owner_company_id = public.get_user_company_id()
    OR public.user_can_access_company(owner_company_id)
  )
  WITH CHECK (
    public.is_super_admin()
    OR owner_company_id = public.get_user_company_id()
    OR public.user_can_access_company(owner_company_id)
  );

CREATE POLICY cag_select ON public.company_agreement_assignments
  FOR SELECT TO public
  USING (
    public.is_super_admin()
    OR company_id = public.get_user_company_id()
    OR public.user_can_access_company(company_id)
  );

CREATE POLICY cag_ins_upd_del ON public.company_agreement_assignments
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

-- Grants to authenticated role (views and functions are invoker-secured via
-- underlying tables' RLS; functions are STABLE and non-definer).
GRANT SELECT ON public.agreement_registry            TO authenticated;
GRANT SELECT ON public.company_agreement_assignments TO authenticated;
GRANT SELECT ON public.agreement_salary_tables_v     TO authenticated;
GRANT SELECT ON public.agreement_pluses_v            TO authenticated;
GRANT SELECT ON public.agreement_extra_pays_v        TO authenticated;
GRANT SELECT ON public.agreement_scalar_inputs_v     TO authenticated;
GRANT SELECT ON public.agreement_groups_v            TO authenticated;

GRANT EXECUTE ON FUNCTION public.fn_agreement_for_company(uuid, date)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_resolve_salary_base(uuid, text, int, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_resolve_seniority(uuid, text)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_resolve_extra_pays(uuid, text)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_resolve_plus(uuid, text, int, text)            TO authenticated;
