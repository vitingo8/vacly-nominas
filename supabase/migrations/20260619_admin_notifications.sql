-- ============================================================================
-- 20260619_admin_notifications.sql
-- Notificaciones electronicas descargadas de las administraciones (DEHu/AEAT/
-- TGSS) usando el certificado de cada empresa. Bandeja unificada de la cartera.
-- Idempotente (IF NOT EXISTS).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('tgss', 'aeat', 'dehu')),
  -- Identificador del organismo emisor (para evitar duplicados al sincronizar).
  external_id text NOT NULL,
  subject text NOT NULL,
  sender text,
  concept text,
  received_at timestamptz NOT NULL DEFAULT now(),
  access_deadline timestamptz,
  -- Ruta del PDF/acuse en storage privado (bucket admin-integrations).
  document_path text,
  certificate_id uuid REFERENCES public.administrative_certificates(id) ON DELETE SET NULL,
  read_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_notif_external
  ON public.admin_notifications (company_id, provider, external_id);
CREATE INDEX IF NOT EXISTS idx_admin_notif_company ON public.admin_notifications (company_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notif_unread ON public.admin_notifications (company_id) WHERE read_at IS NULL;

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'admin_notifications'
       AND policyname = 'admin_notifications_company_access'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY admin_notifications_company_access ON public.admin_notifications
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
  RAISE NOTICE 'RLS helpers no disponibles; politica admin_notifications omitida.';
END $$;
