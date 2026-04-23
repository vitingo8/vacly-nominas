-- ============================================================================
-- 20260423_05_fn_v3_resolve_salary_base_fuzzy_grupo.sql
--
-- Problema detectado: fn_v3_list_groups lee la tabla
-- `grupos_profesionales_y_niveles_funcionales` y puede devolver valores de
-- `grupo` distintos a los que hay en `salary_table_*`
-- (ej. "1" vs "Grupo 1", o "I" vs "1").
--
-- Solución: ampliar la función para que, si el matching exacto da 0 filas,
-- reintente con matching fuzzy (ILIKE + extracción de número/letra) antes de
-- devolver vacío.
--
-- Estrategia de matching (por orden de prioridad / confidence):
--   1. lower(r.grupo) = lower(p_grupo)              → exact
--   2. lower(r.grupo) LIKE '%' || lower(p_grupo) || '%'  → contiene
--   3. solo_numeros(r.grupo) = solo_numeros(p_grupo) → mismo número (1 = "Grupo 1")
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
  ),
  -- Solo dígitos del valor de grupo para comparación numérica
  -- ej. "Grupo 1" → "1",  "I" → "" (no numérico, queda vacío)
  rows_scored AS (
    SELECT
      r.*,
      CASE
        -- 1. Exacto
        WHEN lower(r.grupo) = lower(p_grupo)
          THEN 3
        -- 2. El campo de la tabla contiene el valor buscado o viceversa
        WHEN lower(r.grupo) LIKE '%' || lower(p_grupo) || '%'
          OR lower(p_grupo) LIKE '%' || lower(r.grupo) || '%'
          THEN 2
        -- 3. El número extraído coincide (cubre "Grupo 1" = "1", "Grupo I" sigue sin coincidir)
        WHEN regexp_replace(lower(r.grupo),   '[^0-9]', '', 'g') <> ''
          AND regexp_replace(lower(p_grupo),  '[^0-9]', '', 'g') <> ''
          AND regexp_replace(lower(r.grupo),  '[^0-9]', '', 'g')
            = regexp_replace(lower(p_grupo),  '[^0-9]', '', 'g')
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
     AND (p_nivel IS NULL OR r.nivel IS NULL OR lower(r.nivel) = lower(p_nivel))
     AND (
       p_categoria IS NULL OR r.categoria IS NULL
       OR lower(r.categoria) LIKE '%' || lower(p_categoria) || '%'
     )
   ORDER BY
     r.grupo_match_score DESC,
     (CASE WHEN p_categoria IS NOT NULL AND lower(r.categoria) = lower(p_categoria) THEN 0 ELSE 1 END),
     r.confidence DESC NULLS LAST,
     r.year DESC NULLS LAST
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.fn_v3_resolve_salary_base(uuid, text, int, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_v3_resolve_salary_base(uuid, text, int, text, text, text) TO service_role;
