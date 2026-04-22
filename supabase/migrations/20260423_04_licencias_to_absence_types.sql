-- ============================================================================
-- 20260423_04_licencias_to_absence_types
-- ----------------------------------------------------------------------------
-- Integra Licencias Retribuidas del convenio (v3_rrhh_inputs con
-- domain='leaves') en el módulo de Ausencias de la empresa (absence_types).
--
-- Idempotente: si ya existe un absence_type con el mismo nombre para la
-- empresa, se actualizan los campos derivados (dias, pagado); no se duplica.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_v3_sync_licencias_to_absence_types(
  p_company_id uuid,
  p_on_date    date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  inserted   int,
  updated    int,
  total_found int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted int := 0;
  v_updated  int := 0;
  v_total    int := 0;
  r record;
BEGIN
  -- Recorremos inputs de dominio 'leaves' de todos los convenios activos
  -- asignados a la empresa.
  FOR r IN
    SELECT
      i.id,
      i.label,
      i.description,
      i.data_type,
      i.unit,
      i.value_json,
      i.applicability_json
    FROM public.company_convenios cc
    JOIN public.v3_rrhh_inputs   i
      ON i.doc_id = cc.doc_id
     AND (i.company_id = cc.company_id OR i.company_id = p_company_id)
    WHERE cc.company_id = p_company_id
      AND cc.is_active
      AND i.domain = 'leaves'
      AND (i.effective_from IS NULL OR i.effective_from <= p_on_date)
      AND (i.effective_to   IS NULL OR i.effective_to   >= p_on_date)
  LOOP
    v_total := v_total + 1;
    DECLARE
      v_name text := COALESCE(NULLIF(trim(r.label), ''), 'Licencia retribuida');
      v_dias int  := NULL;
    BEGIN
      -- Intentamos extraer un nº de días si el data_type lo permite.
      IF r.data_type IN ('duration_days', 'number') THEN
        v_dias := (r.value_json->>'value')::numeric::int;
      END IF;

      -- Upsert por (company_id, name)
      IF EXISTS (
        SELECT 1 FROM public.absence_types
        WHERE company_id = p_company_id AND name = v_name
      ) THEN
        UPDATE public.absence_types
           SET dias   = COALESCE(v_dias, dias),
               pagado = TRUE
         WHERE company_id = p_company_id AND name = v_name;
        v_updated := v_updated + 1;
      ELSE
        INSERT INTO public.absence_types (company_id, name, color, icono, pagado, dias)
        VALUES (p_company_id, v_name, '#3b82f6', '📄', TRUE, v_dias);
        v_inserted := v_inserted + 1;
      END IF;
    END;
  END LOOP;

  RETURN QUERY SELECT v_inserted, v_updated, v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_v3_sync_licencias_to_absence_types(uuid, date)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_v3_sync_licencias_to_absence_types(uuid, date) IS
  'Sincroniza Licencias Retribuidas (v3_rrhh_inputs.domain=leaves) de los '
  'convenios asignados a la empresa al módulo de Ausencias (absence_types). '
  'Llamable desde la UI tras asignar un convenio o al detectar nueva versión.';
