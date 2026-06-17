-- =============================================================================
-- Cron integraciones administrativas (pg_cron + pg_net + Vault)
-- Copia ejecutable de supabase/migrations/20260617_admin_integrations_cron.sql
-- =============================================================================
-- Vault (primera vez; si el nombre ya existe → vault.update_secret):
--   nominas_admin_tgss_process_url       → https://vacly-nominas.vercel.app/api/admin/tgss/process
--   nominas_admin_certificates_expiry_url → .../api/admin/cron/certificates-expiry
--   nominas_admin_cron_secret            → mismo valor que CRON_SECRET en Vercel vacly-nominas
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.invoke_admin_tgss_process()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  process_url text;
  cron_secret text;
  hdrs jsonb;
BEGIN
  SELECT ds.decrypted_secret INTO process_url
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'nominas_admin_tgss_process_url'
  LIMIT 1;

  SELECT ds.decrypted_secret INTO cron_secret
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'nominas_admin_cron_secret'
  LIMIT 1;

  IF process_url IS NULL OR btrim(process_url) = '' THEN
    RAISE WARNING 'invoke_admin_tgss_process: falta vault secret nominas_admin_tgss_process_url';
    RETURN;
  END IF;

  IF cron_secret IS NULL OR btrim(cron_secret) = '' THEN
    RAISE WARNING 'invoke_admin_tgss_process: falta vault secret nominas_admin_cron_secret';
    RETURN;
  END IF;

  hdrs := jsonb_build_object(
    'Authorization', 'Bearer ' || cron_secret,
    'Accept', 'application/json',
    'Content-Type', 'application/json'
  );

  PERFORM net.http_post(
    url := btrim(process_url),
    body := '{"limit":20}'::jsonb,
    headers := hdrs,
    timeout_milliseconds := 120000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_admin_tgss_process() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_admin_tgss_process() TO postgres;

CREATE OR REPLACE FUNCTION public.invoke_admin_certificates_expiry()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  expiry_url text;
  cron_secret text;
  hdrs jsonb;
BEGIN
  SELECT ds.decrypted_secret INTO expiry_url
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'nominas_admin_certificates_expiry_url'
  LIMIT 1;

  SELECT ds.decrypted_secret INTO cron_secret
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'nominas_admin_cron_secret'
  LIMIT 1;

  IF expiry_url IS NULL OR btrim(expiry_url) = '' THEN
    RAISE WARNING 'invoke_admin_certificates_expiry: falta vault secret nominas_admin_certificates_expiry_url';
    RETURN;
  END IF;

  IF cron_secret IS NULL OR btrim(cron_secret) = '' THEN
    RAISE WARNING 'invoke_admin_certificates_expiry: falta vault secret nominas_admin_cron_secret';
    RETURN;
  END IF;

  hdrs := jsonb_build_object(
    'Authorization', 'Bearer ' || cron_secret,
    'Accept', 'application/json',
    'Content-Type', 'application/json'
  );

  PERFORM net.http_post(
    url := btrim(expiry_url),
    body := '{}'::jsonb,
    headers := hdrs,
    timeout_milliseconds := 60000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_admin_certificates_expiry() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_admin_certificates_expiry() TO postgres;

DO $$
DECLARE
  j record;
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE jobname = 'admin-tgss-process' LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
  FOR j IN SELECT jobid FROM cron.job WHERE jobname = 'admin-certificates-expiry' LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'admin-tgss-process',
  '*/5 * * * *',
  $$ SELECT public.invoke_admin_tgss_process(); $$
);

SELECT cron.schedule(
  'admin-certificates-expiry',
  '0 7 * * *',
  $$ SELECT public.invoke_admin_certificates_expiry(); $$
);
