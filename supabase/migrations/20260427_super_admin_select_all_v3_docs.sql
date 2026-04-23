-- ============================================================================
-- 20260427_super_admin_select_all_v3_docs.sql
--
-- El catálogo de Configuración → Convenios lee public.v3_docs (+ perfil).
-- Las políticas originales solo permiten filas donde company_id coincide con
-- el usuario; soporte@vacly.es (is_super_admin) suele tener otra company_id
-- y solo veía documentos de “su” empresa, no todos los convenios del SaaS.
--
-- Políticas PERMISSIVE adicionales: si is_super_admin() → SELECT global.
-- ============================================================================

DROP POLICY IF EXISTS super_admin_select_all_v3_docs ON public.v3_docs;
CREATE POLICY super_admin_select_all_v3_docs ON public.v3_docs
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS super_admin_select_all_v3_doc_profile ON public.v3_doc_profile;
CREATE POLICY super_admin_select_all_v3_doc_profile ON public.v3_doc_profile
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());
