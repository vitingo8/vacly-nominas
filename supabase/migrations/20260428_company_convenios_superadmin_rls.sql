-- ============================================================================
-- 20260428_company_convenios_superadmin_rls.sql
--
-- INSERT en company_convenios usa company_id de la EMPRESA cliente; el
-- super admin suele tener otro company_id en public.users, así que
-- get_user_company_id() = company_id falla y user_can_access_company puede
-- fallar. is_super_admin() debe bastar; si el JWT no trae email donde
-- esperamos, la función devolvía false → 403.
--
-- 1) Refuerza public.is_super_admin() (varias rutas de email en JWT).
-- 2) Política PERMISSIVE explícita en company_convenios para soporte@vacly.es
--    (misma lógica inline + is_super_admin()).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_email       text;
  jwt_meta_email  text;
  public_mail     text;
  v               text := 'soporte@vacly.es';
BEGIN
  jwt_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  IF jwt_email = v THEN
    RETURN true;
  END IF;

  jwt_meta_email := lower(trim(coalesce(auth.jwt() -> 'user_metadata' ->> 'email', '')));
  IF jwt_meta_email = v THEN
    RETURN true;
  END IF;

  IF lower(trim(coalesce(auth.jwt() #>> '{user_metadata,email}', ''))) = v THEN
    RETURN true;
  END IF;

  IF coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'super_admin' THEN
    RETURN true;
  END IF;

  IF coalesce((auth.jwt() -> 'user_metadata' ->> 'is_super_admin'), '') IN ('true', '1', 'yes') THEN
    RETURN true;
  END IF;

  SELECT lower(trim(coalesce(u.email, '')))
    INTO public_mail
    FROM public.users u
   WHERE u.id = auth.uid()
   LIMIT 1;

  IF public_mail = v THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.is_super_admin() IS
  'Super-admin Vacly: soporte@vacly.es vía JWT (email / user_metadata.email), claims, o public.users.email.';

-- Política adicional: bypass explícito por email (por si la función fallara en algún contexto).
DROP POLICY IF EXISTS company_convenios_superadmin_full ON public.company_convenios;

CREATE POLICY company_convenios_superadmin_full ON public.company_convenios
  FOR ALL
  TO public
  USING (
    public.is_super_admin()
    OR lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = 'soporte@vacly.es'
    OR lower(trim(coalesce(auth.jwt() -> 'user_metadata' ->> 'email', ''))) = 'soporte@vacly.es'
    OR EXISTS (
      SELECT 1
        FROM public.users u
       WHERE u.id = auth.uid()
         AND lower(trim(coalesce(u.email, ''))) = 'soporte@vacly.es'
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = 'soporte@vacly.es'
    OR lower(trim(coalesce(auth.jwt() -> 'user_metadata' ->> 'email', ''))) = 'soporte@vacly.es'
    OR EXISTS (
      SELECT 1
        FROM public.users u
       WHERE u.id = auth.uid()
         AND lower(trim(coalesce(u.email, ''))) = 'soporte@vacly.es'
    )
  );
