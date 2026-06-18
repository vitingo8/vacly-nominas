-- Hitos de aviso de caducidad configurables por certificado (campana en UI).
ALTER TABLE public.administrative_certificates
  ADD COLUMN IF NOT EXISTS expiry_notification_milestones int[] NOT NULL DEFAULT '{60,30}';
