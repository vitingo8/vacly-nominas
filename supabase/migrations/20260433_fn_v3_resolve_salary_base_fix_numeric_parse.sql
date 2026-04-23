-- ============================================================================
-- 20260433_fn_v3_resolve_salary_base_fix_numeric_parse.sql
--
-- Corrige importe: el patrón REPLACE(…, '.', '') rompía decimales tipo 976.24
-- (pasaban a 97624). Se prioriza jsonb numérico y, en texto, solo coma→punto.
-- ============================================================================

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
  WITH tokens AS (
    SELECT lower(btrim(tok)) AS tok
    FROM regexp_split_to_table(
      lower(regexp_replace(coalesce(p_categoria, ''), '[^[:alnum:]]+', ' ', 'g')),
      ' '
    ) AS tok
    WHERE length(btrim(tok)) >= 5
  ),
  rows AS (
    SELECT
      t.id AS source_table_id,
      trim(COALESCE(row_data->>'grupo', row_data->>'Grupo'))           AS grupo,
      trim(COALESCE(row_data->>'nivel', row_data->>'Nivel'))           AS nivel,
      trim(COALESCE(
        row_data->>'categoria',    row_data->>'Categoria',
        row_data->>'denominacion',
        row_data->>E'Denominaci\u00f3n'
      )) AS categoria,
      (
        CASE
          WHEN jsonb_typeof(row_data->'salario_base_mes') = 'number'
            THEN (row_data->>'salario_base_mes')::numeric
          WHEN jsonb_typeof(row_data->'importe_mensual') = 'number'
            THEN (row_data->>'importe_mensual')::numeric
          WHEN jsonb_typeof(row_data->'importe') = 'number'
            THEN (row_data->>'importe')::numeric
          ELSE
            NULLIF(
              trim(
                replace(
                  trim(COALESCE(
                    row_data->>'salario_base_mes',
                    row_data->>'salario_base',
                    row_data->>'importe_mensual',
                    row_data->>'importe',
                    ''
                  )),
                  ',',
                  '.'
                )
              ),
              ''
            )::numeric
        END
      ) AS salario_base_mes,
      COALESCE(NULLIF(prov, ''), row_data->>'provincia')                AS province,
      EXTRACT(YEAR FROM COALESCE(t.effective_from, CURRENT_DATE))::int  AS year,
      t.confidence,
      t.key AS table_key,
      'salary_table'::text AS src
    FROM public.v3_rrhh_tables t
    CROSS JOIN LATERAL jsonb_array_elements(t.rows_json) AS row_data
    LEFT JOIN LATERAL jsonb_array_elements_text(
      COALESCE(t.applicability_json->'provinces', '[]'::jsonb)
    ) AS prov ON true
    WHERE t.doc_id = p_doc_id
      AND t.key LIKE 'salary_table_%'

    UNION ALL

    SELECT
      t.id,
      NULL::text,
      NULL::text,
      trim(COALESCE(row_data->>'concepto', '')),
      (
        CASE
          WHEN jsonb_typeof(row_data->'importe_mensual') = 'number'
            THEN (row_data->>'importe_mensual')::numeric
          WHEN jsonb_typeof(row_data->'salario_base_mes') = 'number'
            THEN (row_data->>'salario_base_mes')::numeric
          WHEN jsonb_typeof(row_data->'importe') = 'number'
            THEN (row_data->>'importe')::numeric
          ELSE
            NULLIF(
              trim(
                replace(
                  trim(COALESCE(
                    row_data->>'importe_mensual',
                    row_data->>'salario_base_mes',
                    row_data->>'importe',
                    ''
                  )),
                  ',',
                  '.'
                )
              ),
              ''
            )::numeric
        END
      ),
      NULL::text,
      EXTRACT(YEAR FROM COALESCE(t.effective_from, CURRENT_DATE))::int,
      COALESCE(t.confidence, 0) * 0.75,
      t.key,
      'annual_retribution'::text
    FROM public.v3_rrhh_tables t
    CROSS JOIN LATERAL jsonb_array_elements(t.rows_json) AS row_data
    WHERE t.doc_id = p_doc_id
      AND t.key LIKE 'annual_retribution_%'
      AND lower(btrim(COALESCE(row_data->>'concepto', ''))) LIKE 'salario base%'
  ),
  rows_scored AS (
    SELECT
      r.*,
      CASE
        WHEN r.src = 'annual_retribution' THEN
          CASE
            WHEN NOT EXISTS (SELECT 1 FROM tokens) THEN 1
            WHEN EXISTS (
              SELECT 1
              FROM tokens x
              WHERE position(x.tok in lower(r.table_key)) > 0
            ) THEN 2
            ELSE 0
          END
        WHEN lower(COALESCE(r.grupo, '')) = lower(COALESCE(p_grupo, ''))
          AND COALESCE(r.grupo, '') <> ''
          THEN 3
        WHEN lower(COALESCE(r.grupo, '')) LIKE '%' || lower(COALESCE(p_grupo, '')) || '%'
          OR lower(COALESCE(p_grupo, '')) LIKE '%' || lower(COALESCE(r.grupo, '')) || '%'
          THEN 2
        WHEN regexp_replace(lower(COALESCE(r.grupo, '')), '[^0-9]', '', 'g') <> ''
          AND regexp_replace(lower(COALESCE(p_grupo, '')), '[^0-9]', '', 'g') <> ''
          AND regexp_replace(lower(COALESCE(r.grupo, '')), '[^0-9]', '', 'g')
            = regexp_replace(lower(COALESCE(p_grupo, '')), '[^0-9]', '', 'g')
          THEN 1
        ELSE 0
      END AS grupo_match_score
    FROM rows r
  )
  SELECT r.salario_base_mes,
         r.grupo, r.nivel, r.categoria,
         r.source_table_id, r.confidence
    FROM rows_scored r
   WHERE r.salario_base_mes IS NOT NULL
     AND r.grupo_match_score > 0
     AND (p_province IS NULL OR r.province IS NULL OR lower(r.province) = lower(p_province))
     AND (p_year     IS NULL OR r.year     IS NULL OR r.year = p_year)
     AND (
       r.src = 'annual_retribution'
       OR (
         (p_nivel IS NULL OR r.nivel IS NULL OR lower(r.nivel) = lower(p_nivel))
         AND (
           p_categoria IS NULL OR r.categoria IS NULL
           OR lower(r.categoria) LIKE '%' || lower(p_categoria) || '%'
         )
       )
     )
   ORDER BY
     CASE WHEN r.src = 'salary_table' THEN 1 ELSE 0 END DESC,
     r.grupo_match_score DESC,
     (CASE
        WHEN r.src <> 'annual_retribution' AND p_categoria IS NOT NULL
          AND lower(r.categoria) = lower(p_categoria)
        THEN 0 ELSE 1 END),
     r.confidence DESC NULLS LAST,
     r.year DESC NULLS LAST
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.fn_v3_resolve_salary_base(uuid, text, int, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_v3_resolve_salary_base(uuid, text, int, text, text, text) TO service_role;
