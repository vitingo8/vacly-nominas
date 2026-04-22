-- ============================================================================
-- 20260423_03_employees_fiscal_fields.sql
-- Asegura que public.employees tiene todos los campos fiscales / de nómina
-- que la UI de vacly-app (NewEmpleadoDialog + Empleados) necesita.
--
-- Todos los ALTER son idempotentes (IF NOT EXISTS).
-- ============================================================================

BEGIN;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS social_security_number   text,
  ADD COLUMN IF NOT EXISTS iban                     text,
  ADD COLUMN IF NOT EXISTS address                  text,
  ADD COLUMN IF NOT EXISTS sede                     text,
  ADD COLUMN IF NOT EXISTS internal_employee_code   text,
  ADD COLUMN IF NOT EXISTS family_situation         jsonb,
  ADD COLUMN IF NOT EXISTS compensation             jsonb;

CREATE INDEX IF NOT EXISTS employees_internal_code_idx
  ON public.employees(internal_employee_code);
CREATE INDEX IF NOT EXISTS employees_sede_idx
  ON public.employees(sede);

COMMENT ON COLUMN public.employees.social_security_number IS
  'Número de afiliación a la Seguridad Social (NAF), formato aa/bbbbbbb/cc.';
COMMENT ON COLUMN public.employees.iban IS
  'IBAN donde se abona la nómina (para SEPA).';
COMMENT ON COLUMN public.employees.compensation IS
  'JSON con base_salary_annual, base_salary_monthly, irpf_override_percent, number_of_bonuses, bonus_months.';
COMMENT ON COLUMN public.employees.family_situation IS
  'JSON con marital_status, children_under_25, dependents_disability, descendants_disability.';

COMMIT;
