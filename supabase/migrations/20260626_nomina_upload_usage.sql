-- Contador mensual de páginas de nómina enviadas a procesamiento (Claude).
-- Cuenta intentos al dividir/procesar PDFs, no solo nóminas guardadas en BD.

CREATE TABLE IF NOT EXISTS public.nomina_upload_usage (
  company_id uuid NOT NULL REFERENCES public.companies(company_id) ON DELETE CASCADE,
  period text NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),
  pages_attempted integer NOT NULL DEFAULT 0 CHECK (pages_attempted >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, period)
);

COMMENT ON TABLE public.nomina_upload_usage IS
  'Páginas de nómina enviadas a procesamiento por empresa y mes (independiente del guardado final).';

CREATE INDEX IF NOT EXISTS idx_nomina_upload_usage_period
  ON public.nomina_upload_usage (period);

ALTER TABLE public.nomina_upload_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nomina_upload_usage_select_company ON public.nomina_upload_usage;

CREATE POLICY nomina_upload_usage_select_company
  ON public.nomina_upload_usage
  FOR SELECT
  USING (public.user_can_access_company(company_id));

-- Reserva atómica: comprueba límite e incrementa pages_attempted en una transacción.
CREATE OR REPLACE FUNCTION public.reserve_nomina_upload_pages(
  p_company_id uuid,
  p_period text,
  p_pages integer,
  p_pages_per_employee integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_count integer;
  v_max_pages integer;
  v_current integer;
  v_new_total integer;
BEGIN
  IF p_pages IS NULL OR p_pages <= 0 THEN
    RAISE EXCEPTION 'INVALID_PAGES:El número de páginas debe ser mayor que cero.';
  END IF;

  IF p_pages_per_employee IS NULL OR p_pages_per_employee <= 0 THEN
    RAISE EXCEPTION 'INVALID_PAGES_PER_EMPLOYEE:Configuración de cuota inválida.';
  END IF;

  SELECT count(*)::integer
    INTO v_employee_count
    FROM public.employees
   WHERE company_id = p_company_id
     AND status = 'Activo';

  IF v_employee_count = 0 THEN
    RAISE EXCEPTION 'NO_EMPLOYEES:No hay empleados activos en la empresa. Añade empleados antes de subir nóminas.';
  END IF;

  v_max_pages := v_employee_count * p_pages_per_employee;

  INSERT INTO public.nomina_upload_usage (company_id, period, pages_attempted)
  VALUES (p_company_id, p_period, 0)
  ON CONFLICT (company_id, period) DO NOTHING;

  SELECT pages_attempted
    INTO v_current
    FROM public.nomina_upload_usage
   WHERE company_id = p_company_id
     AND period = p_period
   FOR UPDATE;

  IF v_current + p_pages > v_max_pages THEN
    RAISE EXCEPTION 'QUOTA_EXCEEDED:%|%|%|%|%',
      v_employee_count,
      v_current,
      v_max_pages,
      p_pages,
      GREATEST(0, v_max_pages - v_current);
  END IF;

  UPDATE public.nomina_upload_usage
     SET pages_attempted = pages_attempted + p_pages,
         updated_at = now()
   WHERE company_id = p_company_id
     AND period = p_period
  RETURNING pages_attempted INTO v_new_total;

  RETURN jsonb_build_object(
    'employeeCount', v_employee_count,
    'usedPages', v_new_total,
    'maxPages', v_max_pages,
    'remainingPages', GREATEST(0, v_max_pages - v_new_total),
    'pagesPerEmployee', p_pages_per_employee,
    'period', p_period,
    'reservedPages', p_pages
  );
END;
$$;

COMMENT ON FUNCTION public.reserve_nomina_upload_pages(uuid, text, integer, integer) IS
  'Comprueba la cuota mensual de páginas de nómina e incrementa el contador de intentos de forma atómica.';
