-- ============================================================================
-- 20260707_cert_permissions.sql
-- Permisos por usuario y certificado para la bóveda de certificados.
--  - administrative_certificates.access_mode: 'open' (todos los usuarios con
--    acceso al módulo) | 'restricted' (solo usuarios con grant explícito).
--  - administrative_certificate_permissions: grants por usuario con niveles
--    ver / usar / gestionar.
-- Idempotente (IF NOT EXISTS).
-- ============================================================================

-- ── 1. Modo de acceso del certificado ───────────────────────────────────────
ALTER TABLE public.administrative_certificates
  ADD COLUMN IF NOT EXISTS access_mode text NOT NULL DEFAULT 'open';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.administrative_certificates'::regclass
       AND conname = 'administrative_certificates_access_mode_check'
  ) THEN
    ALTER TABLE public.administrative_certificates
      ADD CONSTRAINT administrative_certificates_access_mode_check
      CHECK (access_mode IN ('open', 'restricted'));
  END IF;
END $$;

-- ── 2. Grants por usuario ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.administrative_certificate_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id uuid NOT NULL REFERENCES public.administrative_certificates(id) ON DELETE CASCADE,
  -- Empresa propietaria del certificado (denormalizado para RLS).
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  can_use boolean NOT NULL DEFAULT false,
  can_manage boolean NOT NULL DEFAULT false,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (certificate_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_cert_perm_cert
  ON public.administrative_certificate_permissions (certificate_id);
CREATE INDEX IF NOT EXISTS idx_admin_cert_perm_user
  ON public.administrative_certificate_permissions (user_id);
CREATE INDEX IF NOT EXISTS idx_admin_cert_perm_company
  ON public.administrative_certificate_permissions (company_id);

-- ── 3. RLS (mismo patrón que administrative_*) ──────────────────────────────
ALTER TABLE public.administrative_certificate_permissions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'administrative_certificate_permissions'
       AND policyname = 'administrative_certificate_permissions_company_access'
  ) THEN
    CREATE POLICY administrative_certificate_permissions_company_access
      ON public.administrative_certificate_permissions
      FOR ALL TO authenticated
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
  END IF;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'RLS helpers no disponibles; política cert_permissions omitida.';
END $$;

-- ── 4. Trigger updated_at ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_administrative_certificate_permissions_updated_at'
       AND tgrelid = 'public.administrative_certificate_permissions'::regclass
  ) THEN
    CREATE TRIGGER trg_administrative_certificate_permissions_updated_at
      BEFORE UPDATE ON public.administrative_certificate_permissions
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'public.set_updated_at() no disponible; trigger omitido.';
END $$;
