-- ============================================================================
-- 20260424_00_drop_all_public_agreement_prefix.sql
-- Elimina en public.schemaname=public las relaciones cuyo nombre comienza por
--   "agreement": materialized views, vistas, tablas (DROP ... CASCADE).
-- Idempotente; sirve a bases con restos aunque falle o no se aplicara
-- 20260423_00_drop_agreement_and_create_company_convenios.sql
-- No afecta: company_convenios, v3_*, company_agreement_assignments, ni
--   funciones (p. ej. fn_v3_agreement_for_company).
-- ============================================================================

-- 1) Materialized views: agreement%
DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'm'
      AND c.relname LIKE 'agreement%'
  LOOP
    EXECUTE format('DROP MATERIALIZED VIEW IF EXISTS public.%I CASCADE', r.name);
  END LOOP;
END
$do$;

-- 2) Vistas: agreement%
DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
      AND c.relname LIKE 'agreement%'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS public.%I CASCADE', r.name);
  END LOOP;
END
$do$;

-- 3) Tablas base: agreement% (bucle: varias o dependencias entre ellas)
DO $do$
DECLARE
  t text;
  n int := 0;
BEGIN
  LOOP
    SELECT c.relname INTO t
    FROM pg_class c
    JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
    WHERE nsp.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname LIKE 'agreement%'
    LIMIT 1;

    EXIT WHEN t IS NULL;
    n := n + 1;
    IF n > 200 THEN
      RAISE EXCEPTION 'Límite al borrar tablas agreement%%; revisa dependencias en public';
    END IF;

    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', t);
  END LOOP;
END
$do$;
