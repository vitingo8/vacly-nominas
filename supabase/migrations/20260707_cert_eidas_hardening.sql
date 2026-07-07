-- Hardening eIDAS del gestor de certificados:
--  1. Cadena de renovación navegable (renewed_from_certificate_id)
--  2. Registro de auditoría inmutable (WORM: solo INSERT/SELECT)

-- ── 1. Cadena de renovación ─────────────────────────────────────────────────
ALTER TABLE public.administrative_certificates
  ADD COLUMN IF NOT EXISTS renewed_from_certificate_id uuid
    REFERENCES public.administrative_certificates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_admin_certs_renewed_from
  ON public.administrative_certificates (renewed_from_certificate_id)
  WHERE renewed_from_certificate_id IS NOT NULL;

COMMENT ON COLUMN public.administrative_certificates.renewed_from_certificate_id IS
  'Certificado anterior al que sustituye (cadena de renovaciones del mismo titular).';

-- ── 2. Auditoría inmutable ──────────────────────────────────────────────────
-- 2a. Sustituir la política ALL por políticas separadas de SELECT e INSERT.
--     Sin política de UPDATE/DELETE, RLS los deniega para `authenticated`.
DROP POLICY IF EXISTS administrative_audit_events_company_access
  ON public.administrative_audit_events;

CREATE POLICY administrative_audit_events_select
  ON public.administrative_audit_events
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR (company_id = get_user_company_id())
    OR user_can_access_company(company_id)
  );

CREATE POLICY administrative_audit_events_insert
  ON public.administrative_audit_events
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR (company_id = get_user_company_id())
    OR user_can_access_company(company_id)
  );

-- 2b. Cinturón y tirantes: revocar los privilegios de modificación.
REVOKE UPDATE, DELETE, TRUNCATE ON public.administrative_audit_events
  FROM authenticated, anon;

-- 2c. Trigger que bloquea UPDATE/DELETE/TRUNCATE incluso para service_role
--     (el backend usa service_role, que ignora RLS; sin esto la garantía
--     de inmutabilidad no sería real).
CREATE OR REPLACE FUNCTION public.forbid_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION
    'administrative_audit_events es un registro de auditoria inmutable (eIDAS): % no permitido', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_events_immutable
  ON public.administrative_audit_events;
CREATE TRIGGER trg_audit_events_immutable
  BEFORE UPDATE OR DELETE ON public.administrative_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.forbid_audit_event_mutation();

DROP TRIGGER IF EXISTS trg_audit_events_no_truncate
  ON public.administrative_audit_events;
CREATE TRIGGER trg_audit_events_no_truncate
  BEFORE TRUNCATE ON public.administrative_audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.forbid_audit_event_mutation();
