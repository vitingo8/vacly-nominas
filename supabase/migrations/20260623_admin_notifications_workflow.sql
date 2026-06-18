-- ============================================================================
-- 20260623_admin_notifications_workflow.sql
-- Estado Vacly, categoría y responsable asignado en notificaciones admin.
-- ============================================================================

ALTER TABLE public.admin_notifications
  ADD COLUMN IF NOT EXISTS vacly_status text NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.admin_notifications
  DROP CONSTRAINT IF EXISTS admin_notifications_vacly_status_check;

ALTER TABLE public.admin_notifications
  ADD CONSTRAINT admin_notifications_vacly_status_check
  CHECK (vacly_status IN ('pendiente', 'abierta', 'correo_enviado', 'en_tramite', 'cerrada'));

CREATE INDEX IF NOT EXISTS idx_admin_notif_vacly_status
  ON public.admin_notifications (company_id, vacly_status);

CREATE INDEX IF NOT EXISTS idx_admin_notif_assigned_user
  ON public.admin_notifications (assigned_user_id)
  WHERE assigned_user_id IS NOT NULL;

UPDATE public.admin_notifications
SET vacly_status = 'abierta'
WHERE read_at IS NOT NULL AND vacly_status = 'pendiente';
