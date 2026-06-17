-- ============================================================================
-- 20260618_certificates_metadata.sql
-- Metadatos parseados del certificado (.pfx) y soporte de revocacion.
-- Las columnas se rellenan automaticamente al subir el certificado a partir
-- del propio PKCS#12 (node-forge), no se introducen a mano.
-- Idempotente (IF NOT EXISTS).
-- ============================================================================

ALTER TABLE public.administrative_certificates
  ADD COLUMN IF NOT EXISTS holder_name text,
  ADD COLUMN IF NOT EXISTS issuer text,
  ADD COLUMN IF NOT EXISTS serial_number text,
  ADD COLUMN IF NOT EXISTS certificate_type text,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- Indice para barrido de caducidades (worker de alertas).
CREATE INDEX IF NOT EXISTS idx_admin_cert_valid_to
  ON public.administrative_certificates (valid_to)
  WHERE revoked_at IS NULL;
