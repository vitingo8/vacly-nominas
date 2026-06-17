-- ============================================================================
-- 20260620_admin_notification_sync.sql
-- Trazabilidad de sincronizaciones y documentos de notificaciones administrativas.
-- Idempotente (IF NOT EXISTS).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_notification_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('tgss', 'aeat', 'dehu')),
  certificate_id uuid REFERENCES public.administrative_certificates(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('running', 'success', 'partial_success', 'failed')),
  fetched integer NOT NULL DEFAULT 0,
  stored integer NOT NULL DEFAULT 0,
  error_code text,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_admin_notif_sync_company
  ON public.admin_notification_sync_runs (company_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_notification_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.admin_notifications(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  document_type text NOT NULL CHECK (
    document_type IN ('notification_pdf', 'receipt_pdf', 'certificate_pdf', 'annex', 'raw_xml')
  ),
  storage_path text NOT NULL,
  sha256 text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/pdf',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, document_type)
);

CREATE INDEX IF NOT EXISTS idx_admin_notif_docs_notification
  ON public.admin_notification_documents (notification_id);

ALTER TABLE public.admin_notification_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notification_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'admin_notification_sync_runs'
       AND policyname = 'admin_notification_sync_runs_company_access'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY admin_notification_sync_runs_company_access ON public.admin_notification_sync_runs
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
    $pol$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'admin_notification_documents'
       AND policyname = 'admin_notification_documents_company_access'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY admin_notification_documents_company_access ON public.admin_notification_documents
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
    $pol$;
  END IF;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'RLS helpers no disponibles; politicas admin_notification_sync omitidas.';
END $$;
