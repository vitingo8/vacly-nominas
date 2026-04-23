-- ============================================================================
-- 20260434_fn_v3_resolve_salary_base_fix_categoria_match.sql
--
-- Problema: la categoría del anexo `grupos_profesionales_y_niveles_funcionales`
-- y la de `salary_table_{provincia}_{año}` tienen textos parecidos pero no
-- idénticos:
--   - grupos: "Personal limpiador (limpiador, peón)"
--   - salary:  "Personal limpiador y peón"
-- El ILIKE unidireccional fallaba.
--
-- Solución: matching de categoría en 4 niveles de scoring:
--   4 → exacto
--   3 → uno contiene al otro (ILIKE bidireccional)
--   2 → ≥1 token de ≥5 chars de r.categoria aparece en p_categoria
--   1 → ≥1 token de ≥5 chars de p_categoria aparece en r.categoria
--   0 → sin match (se excluye)
--
-- Lógica de año: se pasa p_year desde el front (año del start_date del
-- contrato o año actual). La RPC primero intenta ese año; si no hay filas,
-- devuelve el año más reciente disponible (fallback automático por ORDER BY).
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
  WITH rows AS (
    SELECT
      t.id AS source_table_id,
      trim(COALESCE(row_data->>'grupo',    row_data->>'Grupo'))    AS grupo,
      trim(COALESCE(row_data->>'nivel',    row_data->>'Nivel'))    AS nivel,
      trim(COALESCE(
        row_data->>'categoria',
        row_data->>'Categoria',
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
            NULLIF(trim(replace(trim(COALESCE(
              row_data->>'salario_base_mes',
              row_data->>'salario_base',
              row_data->>'importe_mensual',
              row_data->>'importe',
              ''
            )), ',', '.')), '')::numeric
        END
      ) AS salario_base_mes,
      COALESCE(NULLIF(prov, ''), row_data->>'provincia') AS province,
      EXTRACT(YEAR FROM COALESCE(t.effective_from, CURRENT_DATE))::int AS year,
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

    -- Fallback: anexos de ejemplo de retribución anual (concepto "Salario base")
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
            NULLIF(trim(replace(trim(COALESCE(
              row_data->>'importe_mensual',
              row_data->>'salario_base_mes',
              row_data->>'importe',
              ''
            )), ',', '.')), '')::numeric
        END
      ),
      NULL::text,
      EXTRACT(YEAR FROM COALESCE(t.effective_from, CURRENT_DATE))::int,
      COALESCE(t.confidence, 0) * 0.5,
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
      -- ── Scoring grupo ──────────────────────────────────────────────────
      CASE
        WHEN r.src = 'annual_retribution' THEN 1
        WHEN lower(COALESCE(r.grupo,'')) = lower(COALESCE(p_grupo,''))
          AND COALESCE(r.grupo,'') <> ''                                   THEN 4
        WHEN lower(COALESCE(r.grupo,'')) LIKE '%'||lower(COALESCE(p_grupo,''))||'%'
          OR  lower(COALESCE(p_grupo,'')) LIKE '%'||lower(COALESCE(r.grupo,''))||'%'
                                                                           THEN 3
        WHEN regexp_replace(lower(COALESCE(r.grupo,'')), '[^0-9]','','g') <> ''
          AND regexp_replace(lower(COALESCE(p_grupo,'')), '[^0-9]','','g') <> ''
          AND regexp_replace(lower(COALESCE(r.grupo,'')), '[^0-9]','','g')
            = regexp_replace(lower(COALESCE(p_grupo,'')), '[^0-9]','','g') THEN 2
        ELSE 0
      END AS grupo_score,

      -- ── Scoring categoría ──────────────────────────────────────────────
      CASE
        WHEN r.src = 'annual_retribution' THEN 1
        WHEN p_categoria IS NULL OR r.categoria IS NULL                    THEN 3
        WHEN lower(r.categoria) = lower(p_categoria)                       THEN 4
        WHEN lower(r.categoria) LIKE '%'||lower(p_categoria)||'%'
          OR  lower(p_categoria) LIKE '%'||lower(r.categoria)||'%'         THEN 3
        -- tokens de r.categoria que aparecen en p_categoria
        WHEN EXISTS (
          SELECT 1
          FROM regexp_split_to_table(lower(r.categoria), '[^[:alnum:]]+') tok
          WHERE length(btrim(tok)) >= 5
            AND lower(p_categoria) LIKE '%'||btrim(tok)||'%'
        )                                                                   THEN 2
        -- tokens de p_categoria que aparecen en r.categoria
        WHEN EXISTS (
          SELECT 1
          FROM regexp_split_to_table(lower(p_categoria), '[^[:alnum:]]+') tok
          WHERE length(btrim(tok)) >= 5
            AND lower(r.categoria) LIKE '%'||btrim(tok)||'%'
        )                                                                   THEN 1
        ELSE 0
      END AS cat_score
    FROM rows r
  )

  SELECT r.salario_base_mes,
         r.grupo, r.nivel, r.categoria,
         r.source_table_id, r.confidence
    FROM rows_scored r
   WHERE r.salario_base_mes IS NOT NULL
     AND r.grupo_score > 0
     AND r.cat_score  > 0
     AND (p_province IS NULL OR r.province IS NULL
          OR lower(r.province) = lower(p_province))
     AND (p_nivel IS NULL OR r.nivel IS NULL
          OR lower(r.nivel) = lower(p_nivel))
     -- año: preferir el del contrato; si no existe, aceptar cualquiera
     AND (
       p_year IS NULL
       OR r.year IS NULL
       OR r.year = p_year
       OR NOT EXISTS (
         SELECT 1 FROM rows_scored rs2
         WHERE rs2.salario_base_mes IS NOT NULL
           AND rs2.grupo_score > 0
           AND rs2.cat_score  > 0
           AND (p_province IS NULL OR rs2.province IS NULL
                OR lower(rs2.province) = lower(p_province))
           AND (p_nivel IS NULL OR rs2.nivel IS NULL
                OR lower(rs2.nivel) = lower(p_nivel))
           AND rs2.year = p_year
       )
     )
   ORDER BY
     CASE WHEN r.src = 'salary_table' THEN 1 ELSE 0 END DESC,
     r.grupo_score DESC,
     r.cat_score   DESC,
     r.year DESC NULLS LAST,
     r.confidence DESC NULLS LAST
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.fn_v3_resolve_salary_base(uuid, text, int, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_v3_resolve_salary_base(uuid, text, int, text, text, text) TO service_role;
