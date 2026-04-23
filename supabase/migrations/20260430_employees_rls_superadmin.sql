-- ============================================================================
-- 20260430_employees_rls_superadmin.sql
--
-- soporte@vacly.es (is_super_admin) cambia de empresa en la app pero su
-- public.users.company_id sigue siendo la empresa "propia". Las políticas
-- RLS de employees solo permitían get_user_company_id() / agencia → 0 filas
-- al consultar empleados de otra empresa.
--
-- Requisito: public.is_super_admin() ya definida (p. ej. 20260428).
-- ============================================================================

DROP POLICY IF EXISTS "users_can_view_company_employees" ON public.employees;
DROP POLICY IF EXISTS "users_can_insert_company_employees" ON public.employees;
DROP POLICY IF EXISTS "users_can_update_company_employees" ON public.employees;
DROP POLICY IF EXISTS "users_can_delete_company_employees" ON public.employees;

CREATE POLICY "users_can_view_company_employees" ON public.employees
  FOR SELECT
  USING (
    public.is_super_admin()
    OR company_id = public.get_user_company_id()
    OR public.user_can_access_company(company_id)
  );

CREATE POLICY "users_can_insert_company_employees" ON public.employees
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR company_id = public.get_user_company_id()
    OR public.user_can_access_company(company_id)
  );

CREATE POLICY "users_can_update_company_employees" ON public.employees
  FOR UPDATE
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

CREATE POLICY "users_can_delete_company_employees" ON public.employees
  FOR DELETE
  USING (
    public.is_super_admin()
    OR company_id = public.get_user_company_id()
    OR public.user_can_access_company(company_id)
  );
