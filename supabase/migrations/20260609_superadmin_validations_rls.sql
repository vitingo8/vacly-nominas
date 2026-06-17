-- ============================================================================
-- 20260609_superadmin_validations_rls.sql
--
-- soporte@vacly.es (is_super_admin) cambia de empresa en la app pero las
-- políticas RLS de validations solo permitían get_user_company_id() / agencia
-- → 0 solicitudes en Validaciones al consultar otra empresa.
--
-- Requisito: public.is_super_admin() ya definida (p. ej. 20260428).
-- ============================================================================

DROP POLICY IF EXISTS "users_can_view_company_validations" ON public.validations;
DROP POLICY IF EXISTS "users_can_manage_company_validations" ON public.validations;

CREATE POLICY "users_can_view_company_validations" ON public.validations
  FOR SELECT
  USING (
    public.is_super_admin()
    OR company_id = public.get_user_company_id()
    OR public.user_can_access_company(company_id)
    OR user_id = auth.uid()
    OR validator_id = auth.uid()
  );

CREATE POLICY "users_can_manage_company_validations" ON public.validations
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
