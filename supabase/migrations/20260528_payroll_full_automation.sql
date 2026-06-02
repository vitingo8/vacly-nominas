-- ============================================================================
-- 20260528_payroll_full_automation.sql
-- Automatización completa de nóminas: variables mensuales ampliadas,
-- finiquitos y registro de presentaciones oficiales (111/190/RED/SEPA).
-- Idempotente (IF NOT EXISTS) para poder reaplicarse sin romper.
-- ============================================================================

-- ── 1. monthly_variables: nuevas columnas ──────────────────────────────────
ALTER TABLE public.monthly_variables
  ADD COLUMN IF NOT EXISTS paid_leave_days   numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unpaid_leave_days numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS in_kind           jsonb,   -- { amount, repercutido }
  ADD COLUMN IF NOT EXISTS garnishments      jsonb,   -- { familyReductionPercent, pensionAlimentos, fixedAmount, maxAmount }
  ADD COLUMN IF NOT EXISTS erte              jsonb,   -- { type, affectedDays, reductionPercent, exemptionPercent }
  ADD COLUMN IF NOT EXISTS bonifications     numeric DEFAULT 0;

COMMENT ON COLUMN public.monthly_variables.in_kind IS 'Salario en especie del mes: { amount, repercutido }';
COMMENT ON COLUMN public.monthly_variables.garnishments IS 'Orden de embargo (Art. 607 LEC)';
COMMENT ON COLUMN public.monthly_variables.erte IS 'Situación ERTE del mes';
COMMENT ON COLUMN public.monthly_variables.bonifications IS 'Bonificaciones/reducciones de cuota empresarial (€/mes)';

-- ── 2. settlements: finiquitos e indemnizaciones ───────────────────────────
CREATE TABLE IF NOT EXISTS public.settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  causa text NOT NULL,                 -- DESPIDO_IMPROCEDENTE | DESPIDO_OBJETIVO | FIN_TEMPORAL | ...
  termination_date date NOT NULL,
  years_of_service numeric,
  monthly_salary numeric,
  number_of_bonuses int DEFAULT 2,
  pending_vacation_days numeric DEFAULT 0,
  salary_days_worked numeric DEFAULT 0,
  prorated_bonuses numeric DEFAULT 0,
  vacation_settlement numeric DEFAULT 0,
  severance numeric DEFAULT 0,
  taxable_total numeric DEFAULT 0,
  total numeric DEFAULT 0,
  calculation_details jsonb,
  document_name text,
  status text DEFAULT 'generated',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlements_company ON public.settlements (company_id);
CREATE INDEX IF NOT EXISTS idx_settlements_employee ON public.settlements (employee_id);

-- ── 3. filing_submissions: historial de presentaciones oficiales ───────────
CREATE TABLE IF NOT EXISTS public.filing_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  kind text NOT NULL,                  -- 'modelo_111' | 'modelo_190' | 'red' | 'sepa'
  period_type text,                    -- 'monthly' | 'quarterly' | 'annual'
  period_year int NOT NULL,
  period_quarter int,                  -- 1-4 (modelo 111 trimestral)
  period_month int,                    -- 1-12
  total_base numeric,
  total_withholdings numeric,
  employee_count int,
  payload jsonb,                       -- resumen estructurado
  file_content text,                   -- contenido del fichero generado
  file_name text,
  status text DEFAULT 'generated',     -- 'generated' | 'submitted' | 'accepted' | 'rejected'
  submitted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_filing_company_period
  ON public.filing_submissions (company_id, kind, period_year, period_quarter, period_month);

-- ── 4. RLS (alineado con el resto de tablas multi-tenant) ──────────────────
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filing_submissions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'settlements'
      AND policyname = 'settlements_company_access'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY settlements_company_access ON public.settlements
        FOR ALL TO authenticated
        USING (company_id = public.resolve_company_id())
        WITH CHECK (company_id = public.resolve_company_id())
    $pol$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'filing_submissions'
      AND policyname = 'filing_submissions_company_access'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY filing_submissions_company_access ON public.filing_submissions
        FOR ALL TO authenticated
        USING (company_id = public.resolve_company_id())
        WITH CHECK (company_id = public.resolve_company_id())
    $pol$;
  END IF;
EXCEPTION WHEN undefined_function THEN
  -- public.resolve_company_id() no existe en este entorno: se omiten las
  -- políticas (el service-role del backend sigue teniendo acceso completo).
  RAISE NOTICE 'resolve_company_id() no disponible; políticas RLS no creadas.';
END $$;
