-- ============================================================================
-- 20260423_01_v3_resolver_rpcs.sql
-- Fase 1 del plan: RPCs que resuelven nómina leyendo DIRECTAMENTE v3_rrhh_*
-- (sin pasar por la capa agreement_*).
--
-- Las funciones son SECURITY DEFINER porque el documento puede pertenecer a
-- otra empresa (quien lo subió). El control de acceso se hace validando que
-- el caller tenga el doc_id asignado vía public.company_convenios.
--
-- Todas las funciones devuelven datos tipados listos para ser consumidos por
-- @vacly/payroll-core.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Helper: ¿la empresa `p_company_id` tiene acceso a `p_doc_id`?
--   - sí, si es dueña del documento en v3_docs
--   - sí, si tiene una asignación activa en company_convenios
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_v3_company_can_read_doc(
  p_company_id uuid,
  p_doc_id     uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.v3_docs d
     WHERE d.id = p_doc_id
       AND d.company_id = p_company_id
  )
  OR EXISTS (
    SELECT 1 FROM public.company_convenios cc
     WHERE cc.company_id = p_company_id
       AND cc.doc_id     = p_doc_id
       AND cc.is_active  = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.fn_v3_company_can_read_doc(uuid, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- fn_v3_agreement_for_company: devuelve el convenio "preferente" (por prioridad)
-- asignado a una empresa en una fecha, con la provincia por defecto y el
-- documento fuente (v3_docs.id).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_v3_agreement_for_company(
  p_company_id  uuid,
  p_on_date     date DEFAULT CURRENT_DATE
) RETURNS TABLE (
  assignment_id     uuid,
  doc_id            uuid,
  default_province  text,
  doc_title         text,
  doc_filename      text,
  is_active         boolean,
  effective_from    date,
  effective_to      date,
  priority          int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cc.id,
    cc.doc_id,
    cc.default_province,
    d.title,
    d.filename,
    cc.is_active,
    cc.effective_from,
    cc.effective_to,
    cc.priority
  FROM public.company_convenios cc
  JOIN public.v3_docs d ON d.id = cc.doc_id
  WHERE cc.company_id = p_company_id
    AND cc.is_active  = true
    AND (cc.effective_from IS NULL OR cc.effective_from <= p_on_date)
    AND (cc.effective_to   IS NULL OR cc.effective_to   >= p_on_date)
  ORDER BY cc.priority DESC, cc.created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.fn_v3_agreement_for_company(uuid, date) TO authenticated;

-- ----------------------------------------------------------------------------
-- fn_v3_resolve_salary_base: busca el salario base mensual para una
-- combinación (provincia, año, grupo, nivel, categoría) en las tablas
-- v3_rrhh_tables cuya `key` empieza por 'salary_table_'.
--
-- Estrategia de matching:
--   - Si no encuentra fila por (grupo, nivel, categoría) exactas, permite
--     categoría parcial (ILIKE).
--   - Filtra por provincia comparando applicability_json.provinces y el
--     propio row_data->>'provincia' si existe.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_v3_resolve_salary_base(
  p_doc_id     uuid,
  p_province   text,
  p_year       int,
  p_grupo      text,
  p_nivel      text,
  p_categoria  text DEFAULT NULL
) RETURNS TABLE (
  salario_base_mes numeric,
  grupo            text,
  nivel            text,
  categoria        text,
  source_table_id  uuid,
  confidence       numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH rows AS (
    SELECT
      t.id AS source_table_id,
      trim(COALESCE(row_data->>'grupo', row_data->>'Grupo'))           AS grupo,
      trim(COALESCE(row_data->>'nivel', row_data->>'Nivel'))           AS nivel,
      trim(COALESCE(
        row_data->>'categoria',    row_data->>'Categoria',
        row_data->>'Denominación', row_data->>'denominacion'
      )) AS categoria,
      NULLIF(REPLACE(REPLACE(COALESCE(
        row_data->>'salario_base_mes',
        row_data->>'salario_base',
        row_data->>'importe_mensual',
        row_data->>'importe'
      ), '.', ''), ',', '.'), '')::numeric                              AS salario_base_mes,
      COALESCE(NULLIF(prov, ''), row_data->>'provincia')                AS province,
      EXTRACT(YEAR FROM COALESCE(t.effective_from, CURRENT_DATE))::int  AS year,
      t.confidence
    FROM public.v3_rrhh_tables t
    CROSS JOIN LATERAL jsonb_array_elements(t.rows_json) AS row_data
    LEFT JOIN LATERAL jsonb_array_elements_text(
      COALESCE(t.applicability_json->'provinces', '[]'::jsonb)
    ) AS prov ON true
    WHERE t.doc_id = p_doc_id
      AND t.key LIKE 'salary_table_%'
  )
  SELECT r.salario_base_mes,
         r.grupo, r.nivel, r.categoria,
         r.source_table_id, r.confidence
    FROM rows r
   WHERE r.salario_base_mes IS NOT NULL
     AND (p_province IS NULL OR r.province IS NULL OR lower(r.province) = lower(p_province))
     AND (p_year     IS NULL OR r.year     IS NULL OR r.year = p_year)
     AND lower(r.grupo) = lower(p_grupo)
     AND (p_nivel IS NULL OR lower(r.nivel) = lower(p_nivel))
     AND (
       p_categoria IS NULL OR r.categoria IS NULL
       OR lower(r.categoria) LIKE '%' || lower(p_categoria) || '%'
     )
   ORDER BY
     (CASE WHEN p_categoria IS NOT NULL AND lower(r.categoria) = lower(p_categoria) THEN 0 ELSE 1 END),
     r.confidence DESC NULLS LAST,
     r.year DESC NULLS LAST
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.fn_v3_resolve_salary_base(uuid, text, int, text, text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- fn_v3_resolve_seniority: devuelve la regla de antigüedad para una provincia.
-- Busca en v3_rrhh_inputs con claves tipo:
--   seniority_<provincia>_percent_per_triennium (5 → 5%)
--   seniority_<provincia>_cuatrienio_percent   (4 → 4% por cuatrienio)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_v3_resolve_seniority(
  p_doc_id   uuid,
  p_province text
) RETURNS TABLE (
  period_years  int,
  percent       numeric,
  key           text,
  label         text,
  confidence    numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT
      i.key,
      i.label,
      CASE
        WHEN i.key ILIKE '%cuatrienio%' OR i.key ILIKE '%quadrenni%' THEN 4
        WHEN i.key ILIKE '%trienio%'    OR i.key ILIKE '%triennium%' THEN 3
        WHEN i.key ILIKE '%bienio%'                                   THEN 2
        ELSE NULL
      END AS period_years,
      CASE
        WHEN jsonb_typeof(i.value_json) = 'number'
          THEN (i.value_json)::text::numeric
        WHEN jsonb_typeof(i.value_json) = 'string'
          THEN NULLIF(
            REPLACE(REPLACE(trim(both '"' from i.value_json::text), '.', ''), ',', '.'),
            ''
          )::numeric
        ELSE NULL
      END AS percent,
      i.confidence
    FROM public.v3_rrhh_inputs i
    WHERE i.doc_id = p_doc_id
      AND i.key ILIKE 'seniority_%'
      AND (
        p_province IS NULL
        OR i.key ILIKE '%' || lower(replace(p_province, ' ', '_')) || '%'
        OR lower(COALESCE(i.label, '')) LIKE '%' || lower(p_province) || '%'
        OR EXISTS (
          SELECT 1
            FROM jsonb_array_elements_text(COALESCE(i.applicability_json->'provinces','[]'::jsonb)) AS prov
           WHERE lower(prov) = lower(p_province)
        )
      )
      AND (i.data_type = 'percent' OR i.key ILIKE '%percent%')
  )
  SELECT period_years, percent, key, label, confidence
    FROM candidates
   WHERE period_years IS NOT NULL AND percent IS NOT NULL
   ORDER BY confidence DESC NULLS LAST, period_years ASC
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.fn_v3_resolve_seniority(uuid, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- fn_v3_resolve_extra_pays: devuelve las pagas extraordinarias de una provincia
-- leyendo v3_rrhh_tables.key = 'pagas_extraordinarias_por_provincia'.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_v3_resolve_extra_pays(
  p_doc_id   uuid,
  p_province text
) RETURNS TABLE (
  paga_nombre        text,
  dias               int,
  periodo_devengo    text,
  fecha_pago         text,
  base_concepts_text text,
  source_table_id    uuid,
  confidence         numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    trim(row_data->>'paga')              AS paga_nombre,
    NULLIF(row_data->>'dias','')::int    AS dias,
    trim(row_data->>'periodo_devengo')   AS periodo_devengo,
    trim(row_data->>'fecha_pago')        AS fecha_pago,
    trim(row_data->>'conceptos')         AS base_concepts_text,
    t.id                                 AS source_table_id,
    t.confidence
  FROM public.v3_rrhh_tables t
  CROSS JOIN LATERAL jsonb_array_elements(t.rows_json) AS row_data
  WHERE t.doc_id = p_doc_id
    AND t.key = 'pagas_extraordinarias_por_provincia'
    AND row_data ? 'paga'
    AND (
      p_province IS NULL
      OR lower(COALESCE(row_data->>'provincia','')) LIKE '%' || lower(p_province) || '%'
    )
  ORDER BY t.confidence DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.fn_v3_resolve_extra_pays(uuid, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- fn_v3_resolve_plus: importe mensual/único de un plus/complemento por
-- provincia + año + concepto. Busca en v3_rrhh_tables (key LIKE 'pluses_%').
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_v3_resolve_plus(
  p_doc_id   uuid,
  p_province text,
  p_year     int,
  p_concepto text
) RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NULLIF(REPLACE(REPLACE(COALESCE(
      row_data->>'importe',
      row_data->>'importe_mensual',
      row_data->>'importe_unitario'
    ), '.', ''), ',', '.'), '')::numeric AS importe
  FROM public.v3_rrhh_tables t
  CROSS JOIN LATERAL jsonb_array_elements(t.rows_json) AS row_data
  LEFT JOIN LATERAL jsonb_array_elements_text(
    COALESCE(t.applicability_json->'provinces','[]'::jsonb)
  ) AS prov ON true
  WHERE t.doc_id = p_doc_id
    AND t.key LIKE 'pluses_%'
    AND lower(trim(row_data->>'concepto')) LIKE '%' || lower(p_concepto) || '%'
    AND (
      p_province IS NULL
      OR lower(COALESCE(row_data->>'provincia','')) LIKE '%' || lower(p_province) || '%'
      OR lower(COALESCE(prov,'')) = lower(p_province)
    )
    AND (
      p_year IS NULL
      OR EXTRACT(YEAR FROM COALESCE(t.effective_from, CURRENT_DATE))::int = p_year
    )
  ORDER BY t.confidence DESC NULLS LAST
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.fn_v3_resolve_plus(uuid, text, int, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- fn_v3_resolve_licencias: devuelve las licencias retribuidas detectadas,
-- para poblar el módulo de "Ausencias" al asignar el convenio.
--
-- Busca en v3_rrhh_tables (key LIKE 'licencias%') y fallback en v3_rrhh_inputs
-- (domain='leaves').
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_v3_resolve_licencias(
  p_doc_id   uuid,
  p_province text DEFAULT NULL
) RETURNS TABLE (
  tipo         text,
  dias         numeric,
  descripcion  text,
  source_kind  text,
  source_id    uuid,
  confidence   numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    trim(COALESCE(row_data->>'tipo', row_data->>'motivo', row_data->>'concepto')) AS tipo,
    NULLIF(REPLACE(REPLACE(COALESCE(
      row_data->>'dias',
      row_data->>'duracion',
      row_data->>'duracion_dias'
    ), '.', ''), ',', '.'), '')::numeric AS dias,
    trim(COALESCE(row_data->>'descripcion', row_data->>'detalle'))                AS descripcion,
    'table'::text                                                                 AS source_kind,
    t.id                                                                          AS source_id,
    t.confidence
  FROM public.v3_rrhh_tables t
  CROSS JOIN LATERAL jsonb_array_elements(t.rows_json) AS row_data
  WHERE t.doc_id = p_doc_id
    AND (t.key LIKE 'licencias%' OR t.domain = 'leaves')
    AND (
      p_province IS NULL
      OR lower(COALESCE(row_data->>'provincia','')) LIKE '%' || lower(p_province) || '%'
    )

  UNION ALL

  SELECT
    COALESCE(i.label, i.key)                                                      AS tipo,
    CASE
      WHEN jsonb_typeof(i.value_json) = 'number' THEN (i.value_json)::text::numeric
      WHEN jsonb_typeof(i.value_json) = 'string'
        THEN NULLIF(REPLACE(REPLACE(trim(both '"' from i.value_json::text),'.',''),',','.'),'')::numeric
      ELSE NULL
    END                                                                            AS dias,
    i.description                                                                  AS descripcion,
    'input'::text                                                                  AS source_kind,
    i.id                                                                           AS source_id,
    i.confidence
  FROM public.v3_rrhh_inputs i
  WHERE i.doc_id = p_doc_id
    AND i.domain = 'leaves'
    AND (
      p_province IS NULL
      OR lower(COALESCE(i.label,'')) LIKE '%' || lower(p_province) || '%'
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(
          COALESCE(i.applicability_json->'provinces','[]'::jsonb)
        ) AS prov
         WHERE lower(prov) = lower(p_province)
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.fn_v3_resolve_licencias(uuid, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- fn_v3_resolve_scalar: helper genérico para leer un valor escalar por clave
-- y provincia. Útil para SMI, IRPF por defecto, topes de antigüedad, etc.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_v3_resolve_scalar(
  p_doc_id  uuid,
  p_key_ilike text,
  p_province text DEFAULT NULL
) RETURNS TABLE (
  key          text,
  label        text,
  value_json   jsonb,
  data_type    text,
  confidence   numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.key, i.label, i.value_json, i.data_type, i.confidence
  FROM public.v3_rrhh_inputs i
  WHERE i.doc_id = p_doc_id
    AND i.key ILIKE p_key_ilike
    AND (
      p_province IS NULL
      OR i.key ILIKE '%' || lower(replace(p_province, ' ', '_')) || '%'
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(
          COALESCE(i.applicability_json->'provinces','[]'::jsonb)
        ) AS prov
         WHERE lower(prov) = lower(p_province)
      )
    )
  ORDER BY i.confidence DESC NULLS LAST
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.fn_v3_resolve_scalar(uuid, text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- fn_v3_list_groups: lista grupos/niveles del convenio (para selectores UI).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_v3_list_groups(
  p_doc_id uuid
) RETURNS TABLE (
  grupo        text,
  nivel        text,
  denominacion text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    trim(COALESCE(row_data->>'Grupo', row_data->>'grupo'))                AS grupo,
    trim(COALESCE(row_data->>'Nivel', row_data->>'nivel'))                AS nivel,
    trim(COALESCE(
      row_data->>'Denominación',
      row_data->>'denominacion',
      row_data->>'categoria'
    ))                                                                     AS denominacion
  FROM public.v3_rrhh_tables t
  CROSS JOIN LATERAL jsonb_array_elements(t.rows_json) AS row_data
  WHERE t.doc_id = p_doc_id
    AND (t.key = 'grupos_profesionales_y_niveles_funcionales'
         OR t.key LIKE 'salary_table_%')
    AND (row_data ? 'grupo' OR row_data ? 'Grupo')
  ORDER BY 1, 2;
$$;

GRANT EXECUTE ON FUNCTION public.fn_v3_list_groups(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- fn_v3_list_provinces: lista las provincias detectadas en un documento
-- (mirando applicability_json.provinces de inputs y tablas).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_v3_list_provinces(
  p_doc_id uuid
) RETURNS TABLE (province text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT prov::text AS province
  FROM (
    SELECT jsonb_array_elements_text(
             COALESCE(i.applicability_json->'provinces','[]'::jsonb)
           ) AS prov
      FROM public.v3_rrhh_inputs i
     WHERE i.doc_id = p_doc_id
    UNION ALL
    SELECT jsonb_array_elements_text(
             COALESCE(t.applicability_json->'provinces','[]'::jsonb)
           ) AS prov
      FROM public.v3_rrhh_tables t
     WHERE t.doc_id = p_doc_id
  ) s
  WHERE prov IS NOT NULL AND prov <> ''
  ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION public.fn_v3_list_provinces(uuid) TO authenticated;

COMMIT;
