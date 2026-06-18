-- Sincronización automática de notificaciones administrativas (AEAT, TGSS…)
-- Horarios peninsulares: 04:00, 11:00, 16:00 y 19:00 (UTC+1 → 03, 10, 15, 18 UTC en invierno).
-- Vault: nominas_admin_notifications_sync_url → .../api/admin/cron/notifications-sync

CREATE OR REPLACE FUNCTION public.invoke_admin_notifications_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sync_url text;
  cron_secret text;
  hdrs jsonb;
BEGIN
  SELECT ds.decrypted_secret INTO sync_url
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'nominas_admin_notifications_sync_url'
  LIMIT 1;

  SELECT ds.decrypted_secret INTO cron_secret
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'nominas_admin_cron_secret'
  LIMIT 1;

  IF sync_url IS NULL OR btrim(sync_url) = '' THEN
    RAISE WARNING 'invoke_admin_notifications_sync: falta vault secret nominas_admin_notifications_sync_url';
    RETURN;
  END IF;

  IF cron_secret IS NULL OR btrim(cron_secret) = '' THEN
    RAISE WARNING 'invoke_admin_notifications_sync: falta vault secret nominas_admin_cron_secret';
    RETURN;
  END IF;

  hdrs := jsonb_build_object(
    'Authorization', 'Bearer ' || cron_secret,
    'Accept', 'application/json',
    'Content-Type', 'application/json'
  );

  PERFORM net.http_post(
    url := btrim(sync_url),
    body := '{}'::jsonb,
    headers := hdrs,
    timeout_milliseconds := 300000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_admin_notifications_sync() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_admin_notifications_sync() TO postgres;

COMMENT ON FUNCTION public.invoke_admin_notifications_sync() IS
  'pg_cron: POST /api/admin/cron/notifications-sync (Bearer desde Vault).';

DO $$
DECLARE
  j record;
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE jobname LIKE 'admin-notifications-sync-%' LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'admin-notifications-sync-0400',
  '0 3 * * *',
  $$ SELECT public.invoke_admin_notifications_sync(); $$
);

SELECT cron.schedule(
  'admin-notifications-sync-1100',
  '0 10 * * *',
  $$ SELECT public.invoke_admin_notifications_sync(); $$
);

SELECT cron.schedule(
  'admin-notifications-sync-1600',
  '0 15 * * *',
  $$ SELECT public.invoke_admin_notifications_sync(); $$
);

SELECT cron.schedule(
  'admin-notifications-sync-1900',
  '0 18 * * *',
  $$ SELECT public.invoke_admin_notifications_sync(); $$
);
