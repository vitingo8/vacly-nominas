-- ============================================================================
-- 20260621_admin_notifications_email.sql
-- Cachea el borrador de correo al cliente generado por IA para evitar volver a
-- llamar a la API de Anthropic, y guarda el idioma elegido para reutilizarlo.
-- Idempotente (IF NOT EXISTS).
-- ============================================================================

ALTER TABLE public.admin_notifications
  ADD COLUMN IF NOT EXISTS email_proposal jsonb,
  ADD COLUMN IF NOT EXISTS email_language text,
  ADD COLUMN IF NOT EXISTS email_generated_at timestamptz;
