-- ============================================================================
-- 20260609_superadmin_departments_rls.sql
--
-- soporte@vacly.es (is_super_admin) cambia de empresa en la app pero su
-- public.users.company_id sigue siendo la empresa "propia". Las políticas
-- RLS de departments solo permitían get_user_company_id() / agencia → 0 filas
-- al consultar departamentos de otra empresa (pantalla Departamentos y
-- selector de departamento en Editar Empleado).
--
-- Requisito: public.is_super_admin() ya definida (p. ej. 20260428).
-- ============================================================================

DROP POLICY IF EXISTS "users_can_view_company_departments" ON public.departments;
DROP POLICY IF EXISTS "users_can_manage_company_departments" ON public.departments;

CREATE POLICY "users_can_view_company_departments" ON public.departments
  FOR SELECT
  USING (
    public.is_super_admin()
    OR company_id = public.get_user_company_id()
    OR public.user_can_access_company(company_id)
  );

CREATE POLICY "users_can_manage_company_departments" ON public.departments
  FOR ALL
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
