-- ============================================================================
-- 20260431_fn_v3_list_groups_solo_grupos_profesionales.sql
--
-- fn_v3_list_groups incluía también filas de salary_table_* con Grupo/Nivel,
-- duplicando y variando denominaciones respecto al anexo oficial
-- grupos_profesionales_y_niveles_funcionales en v3_rrhh_tables.
--
-- La UI de contratos debe listar solo ese anexo (coincidir con rows_json del
-- convenio). Las tablas salariales siguen usándose en fn_v3_resolve_salary_base.
-- ============================================================================

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
    AND t.key = 'grupos_profesionales_y_niveles_funcionales'
    AND (row_data ? 'grupo' OR row_data ? 'Grupo')
  ORDER BY 1, 2;
$$;

COMMENT ON FUNCTION public.fn_v3_list_groups(uuid) IS
  'Grupos/niveles/denominación solo del anexo grupos_profesionales_y_niveles_funcionales (sin salary_table_*).';

GRANT EXECUTE ON FUNCTION public.fn_v3_list_groups(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_v3_list_groups(uuid) TO service_role;
