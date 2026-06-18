-- Toggle de avisos de caducidad por certificado (campana en UI).
ALTER TABLE public.administrative_certificates
  ADD COLUMN IF NOT EXISTS expiry_notifications_enabled boolean NOT NULL DEFAULT true;
