-- ============================================================================
-- 20260609_superadmin_registers_rls.sql
--
-- soporte@vacly.es (is_super_admin) cambia de empresa en la app pero su
-- public.users.company_id sigue siendo la empresa "propia". La política SELECT
-- de registers solo permitía get_user_company_id() / agencia → 0 fichajes en
-- Control de tiempo al consultar empleados de otra empresa.
--
-- Requisito: public.is_super_admin() ya definida (p. ej. 20260428).
-- ============================================================================

DROP POLICY IF EXISTS "users_can_view_own_registers" ON public.registers;

CREATE POLICY "users_can_view_own_registers" ON public.registers
  FOR SELECT
  USING (
    public.is_super_admin()
    OR user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.user_id = registers.user_id
        AND (
          e.company_id = public.get_user_company_id()
          OR public.user_can_access_company(e.company_id)
        )
    )
  );
