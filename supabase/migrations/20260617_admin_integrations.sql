-- ============================================================================
-- 20260617_admin_integrations.sql
-- Capa de integración administrativa TGSS/AEAT: transacciones, ficheros,
-- certificados, autorizaciones y solicitudes de afiliación RED.
-- Idempotente (IF NOT EXISTS).
-- ============================================================================

-- ── 1. Autorizaciones administrativas (RED, AEAT, DEHú) ─────────────────────
CREATE TABLE IF NOT EXISTS public.administrative_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('tgss', 'aeat', 'dehu')),
  authorization_type text NOT NULL,
  holder_nif text NOT NULL,
  representative_nif text,
  red_authorization_number text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_auth_company ON public.administrative_authorizations (company_id);
CREATE INDEX IF NOT EXISTS idx_admin_auth_provider ON public.administrative_authorizations (company_id, provider);

-- ── 2. Certificados (PFX cifrado, nunca texto plano) ────────────────────────
CREATE TABLE IF NOT EXISTS public.administrative_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  alias text NOT NULL,
  holder_nif text NOT NULL,
  encrypted_pfx bytea,
  encrypted_password bytea,
  valid_from date,
  valid_to date,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_cert_company ON public.administrative_certificates (company_id);

-- ── 3. Transacciones administrativas ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.administrative_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('tgss', 'aeat', 'dehu')),
  procedure_code text NOT NULL,
  subject_type text,
  subject_id uuid,
  status text NOT NULL DEFAULT 'created',
  certificate_id uuid REFERENCES public.administrative_certificates(id),
  authorization_id uuid REFERENCES public.administrative_authorizations(id),
  requested_by uuid,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_tx_company ON public.administrative_transactions (company_id);
CREATE INDEX IF NOT EXISTS idx_admin_tx_status ON public.administrative_transactions (company_id, status);
CREATE INDEX IF NOT EXISTS idx_admin_tx_subject ON public.administrative_transactions (subject_type, subject_id);

-- CHECK de estado alineado con la máquina de estados (idempotente).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.administrative_transactions'::regclass
       AND conname = 'administrative_transactions_status_check'
  ) THEN
    ALTER TABLE public.administrative_transactions
      ADD CONSTRAINT administrative_transactions_status_check
      CHECK (status IN (
        'created', 'validated', 'file_generated', 'queued',
        'submitted', 'response_received', 'accepted', 'rejected', 'failed'
      ));
  END IF;
END $$;

-- ── 4. Ficheros generados ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.administrative_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  transaction_id uuid NOT NULL REFERENCES public.administrative_transactions(id) ON DELETE CASCADE,
  file_type text NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_files_tx ON public.administrative_files (transaction_id);

-- ── 5. Respuestas / acuses ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.administrative_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  transaction_id uuid NOT NULL REFERENCES public.administrative_transactions(id) ON DELETE CASCADE,
  response_type text NOT NULL,
  raw_response_path text,
  normalized_status text,
  error_code text,
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_responses_tx ON public.administrative_responses (transaction_id);

-- ── 6. Auditoría ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.administrative_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  transaction_id uuid REFERENCES public.administrative_transactions(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  actor_user_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_company ON public.administrative_audit_events (company_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_tx ON public.administrative_audit_events (transaction_id);

-- ── 7. Solicitudes afiliación TGSS (AFI) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tgss_affiliation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  transaction_id uuid NOT NULL REFERENCES public.administrative_transactions(id) ON DELETE CASCADE,
  employee_id uuid,
  request_type text NOT NULL CHECK (request_type IN ('alta', 'baja', 'variacion')),
  nss text,
  ipf text,
  ccc text,
  fecha_real date,
  fecha_efecto date,
  contract_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tgss_aff_tx ON public.tgss_affiliation_requests (transaction_id);
CREATE INDEX IF NOT EXISTS idx_tgss_aff_employee ON public.tgss_affiliation_requests (company_id, employee_id);

-- ── 8. Ficheros tributarios AEAT (forward-compat) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.aeat_tax_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  transaction_id uuid REFERENCES public.administrative_transactions(id) ON DELETE SET NULL,
  model_type text NOT NULL,
  period_year int NOT NULL,
  period_quarter int,
  period_month int,
  file_content text,
  file_name text,
  status text NOT NULL DEFAULT 'generated',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aeat_tax_company ON public.aeat_tax_files (company_id, model_type, period_year);

-- ── 9. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.administrative_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.administrative_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.administrative_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.administrative_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.administrative_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.administrative_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tgss_affiliation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aeat_tax_files ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl text;
  pol_name text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'administrative_authorizations',
    'administrative_certificates',
    'administrative_transactions',
    'administrative_files',
    'administrative_responses',
    'administrative_audit_events',
    'tgss_affiliation_requests',
    'aeat_tax_files'
  ] LOOP
    pol_name := tbl || '_company_access';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = tbl AND policyname = pol_name
    ) THEN
      EXECUTE format($pol$
        CREATE POLICY %I ON public.%I
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
          )
      $pol$, pol_name, tbl);
    END IF;
  END LOOP;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'RLS helpers no disponibles; políticas admin_integrations omitidas.';
END $$;

-- ── 10. Triggers updated_at ───────────────────────────────────────────────────
-- Reutiliza public.set_updated_at() (NEW.updated_at = now()).
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'administrative_authorizations',
    'administrative_certificates',
    'administrative_transactions'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
       WHERE tgname = 'trg_' || tbl || '_updated_at'
         AND tgrelid = ('public.' || tbl)::regclass
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON public.%I
           FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
        'trg_' || tbl || '_updated_at', tbl
      );
    END IF;
  END LOOP;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'public.set_updated_at() no disponible; triggers updated_at omitidos.';
END $$;

-- ── 11. Storage bucket privado para ficheros administrativos ──────────────────
-- El módulo accede con service_role (omite RLS), por lo que el bucket permanece
-- privado y SIN políticas permisivas para usuarios anon/authenticated.
INSERT INTO storage.buckets (id, name, public)
VALUES ('admin-integrations', 'admin-integrations', false)
ON CONFLICT (id) DO NOTHING;
