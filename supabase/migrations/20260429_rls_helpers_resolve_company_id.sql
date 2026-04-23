-- ============================================================================
-- 20260429_rls_helpers_resolve_company_id.sql
--
-- company_convenios (y otras tablas) usan get_user_company_id() y
-- user_can_access_company(). Si public.users.id no coincide con auth.uid()
-- pero el login es el mismo usuario (fila resuelta por email en la app),
-- los helpers devolvían NULL → WITH CHECK fallaba → 403 en REST.
--
-- Resolución: misma prioridad que UserContext — id primero, luego email en
-- JWT (email, user_metadata.email).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid       uuid;
  jwt_mail  text;
  jwt_meta  text;
BEGIN
  SELECT u.company_id
    INTO cid
    FROM public.users u
   WHERE u.id = auth.uid()
   LIMIT 1;

  IF cid IS NOT NULL THEN
    RETURN cid;
  END IF;

  jwt_mail := lower(trim(both FROM coalesce(auth.jwt() ->> 'email', '')));
  jwt_meta := lower(trim(both FROM coalesce(auth.jwt() -> 'user_metadata' ->> 'email', '')));

  IF jwt_mail <> '' THEN
    SELECT u.company_id
      INTO cid
      FROM public.users u
     WHERE lower(trim(both FROM coalesce(u.email, ''))) = jwt_mail
     LIMIT 1;
  END IF;

  IF cid IS NOT NULL THEN
    RETURN cid;
  END IF;

  IF jwt_meta <> '' AND jwt_meta IS DISTINCT FROM jwt_mail THEN
    SELECT u.company_id
      INTO cid
      FROM public.users u
     WHERE lower(trim(both FROM coalesce(u.email, ''))) = jwt_meta
     LIMIT 1;
  END IF;

  RETURN cid;
END;
$$;

COMMENT ON FUNCTION public.get_user_company_id() IS
  'company_id del usuario: public.users por auth.uid(), o por email en JWT si el id no coincide.';

CREATE OR REPLACE FUNCTION public.user_can_access_company(check_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_company_id uuid;
  is_agency         boolean := false;
BEGIN
  user_company_id := public.get_user_company_id();

  IF user_company_id IS NULL THEN
    RETURN false;
  END IF;

  IF user_company_id = check_company_id THEN
    RETURN true;
  END IF;

  BEGIN
    SELECT EXISTS (
      SELECT 1
        FROM public.companies c
       WHERE c.company_id = check_company_id
         AND c.agency_id IS NOT DISTINCT FROM user_company_id
    )
      INTO is_agency;
  EXCEPTION
    WHEN undefined_column THEN
      is_agency := false;
  END;

  RETURN COALESCE(is_agency, false);
END;
$$;

COMMENT ON FUNCTION public.user_can_access_company(uuid) IS
  'Misma empresa que get_user_company_id(), o empresa cliente con companies.agency_id = esa empresa.';

GRANT EXECUTE ON FUNCTION public.get_user_company_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_access_company(uuid) TO authenticated, service_role;
