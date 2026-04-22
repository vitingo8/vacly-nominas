-- ============================================================================
-- 20260423_00_drop_agreement_and_create_company_convenios.sql
-- Fase 0 del plan "Rehacer pipeline convenios v3":
--   1) Elimina la capa intermedia agreement_* (tablas "fantasma" + vistas _v
--      + agreement_registry + company_agreement_assignments).
--   2) Crea el puente mínimo public.company_convenios que apunta directamente
--      a public.v3_docs.
--   3) Ajusta public.contracts para referenciar v3_docs vía convenio_doc_id
--      y conserva la provincia de cálculo en convenio_province.
--   4) Hace backfill de los contratos existentes cuando es posible.
--
-- Esta migración es IDEMPOTENTE: se pueden volver a ejecutar los DROP sin
-- error gracias a IF EXISTS.
--
-- IMPORTANTE: se recomienda ejecutar en una ventana de mantenimiento porque
-- elimina objetos que pudieran estar siendo leídos por procesos heredados.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) DROP de las funciones RPC legacy que leían la capa agreement_*
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_agreement_for_company(uuid, date)            CASCADE;
DROP FUNCTION IF EXISTS public.fn_resolve_salary_base(uuid, text, int, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.fn_resolve_seniority(uuid, text)                CASCADE;
DROP FUNCTION IF EXISTS public.fn_resolve_extra_pays(uuid, text)               CASCADE;
DROP FUNCTION IF EXISTS public.fn_resolve_plus(uuid, text, int, text)          CASCADE;
DROP FUNCTION IF EXISTS public.fn_normalize_agreement(uuid)                    CASCADE;
DROP FUNCTION IF EXISTS public.fn_seed_salary_concepts_from_agreement(uuid)    CASCADE;

-- ----------------------------------------------------------------------------
-- 2) DROP de las vistas agreement_*_v (proyectaban sobre v3_rrhh_*; las
--    sustituimos por funciones/consultas directas v3).
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.agreement_salary_tables_v CASCADE;
DROP VIEW IF EXISTS public.agreement_pluses_v        CASCADE;
DROP VIEW IF EXISTS public.agreement_extra_pays_v    CASCADE;
DROP VIEW IF EXISTS public.agreement_scalar_inputs_v CASCADE;
DROP VIEW IF EXISTS public.agreement_groups_v        CASCADE;

-- ----------------------------------------------------------------------------
-- 3) DROP de las tablas físicas "fantasma" agreement_* (valores creados
--    manualmente, no extraídos del documento).
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.agreement_scalar_inputs CASCADE;
DROP TABLE IF EXISTS public.agreement_salary_tables CASCADE;
DROP TABLE IF EXISTS public.agreement_pluses        CASCADE;
DROP TABLE IF EXISTS public.agreement_extra_pays    CASCADE;
DROP TABLE IF EXISTS public.agreement_groups        CASCADE;

-- ----------------------------------------------------------------------------
-- 4) Crear la nueva tabla puente public.company_convenios
--    (antes de borrar agreement_registry para poder hacer el backfill).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_convenios (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(company_id) ON DELETE CASCADE,
  doc_id            uuid NOT NULL REFERENCES public.v3_docs(id)           ON DELETE RESTRICT,
  default_province  text        NULL,
  is_active         boolean     NOT NULL DEFAULT true,
  priority          int         NOT NULL DEFAULT 0,
  effective_from    date        NULL,
  effective_to      date        NULL,
  notes             text        NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, doc_id)
);

CREATE INDEX IF NOT EXISTS company_convenios_company_idx
  ON public.company_convenios(company_id);
CREATE INDEX IF NOT EXISTS company_convenios_doc_idx
  ON public.company_convenios(doc_id);
CREATE INDEX IF NOT EXISTS company_convenios_active_idx
  ON public.company_convenios(company_id, is_active);

COMMENT ON TABLE public.company_convenios IS
  'Asignación convenio → empresa. doc_id apunta directamente a v3_docs (fuente única). Sustituye a agreement_registry + company_agreement_assignments.';

-- Trigger updated_at (reutiliza helper si existe; sino lo crea)
CREATE OR REPLACE FUNCTION public.set_updated_at_col()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_convenios_updated ON public.company_convenios;
CREATE TRIGGER trg_company_convenios_updated
  BEFORE UPDATE ON public.company_convenios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_col();

-- ----------------------------------------------------------------------------
-- 5) ALTER public.contracts: añadir convenio_doc_id y convenio_province.
--    Conservamos las columnas legacy (agreement_id / agreement_ref_id) hasta
--    que todo el código migre; la FK antigua se dropea al final.
-- ----------------------------------------------------------------------------
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS convenio_doc_id  uuid,
  ADD COLUMN IF NOT EXISTS convenio_province text;

-- Backfill 1: si contracts.agreement_ref_id apuntaba a agreement_registry y
-- podemos recuperar source_doc_id, lo copiamos a convenio_doc_id.
-- (Lo hacemos ANTES de eliminar agreement_registry)
DO $mig$
DECLARE
  has_registry boolean;
  has_agreement_ref boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'agreement_registry'
  ) INTO has_registry;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'contracts'
       AND column_name  = 'agreement_ref_id'
  ) INTO has_agreement_ref;

  IF has_registry AND has_agreement_ref THEN
    EXECUTE $sql$
      UPDATE public.contracts c
         SET convenio_doc_id = ar.source_doc_id
        FROM public.agreement_registry ar
       WHERE c.agreement_ref_id = ar.id
         AND c.convenio_doc_id IS NULL
    $sql$;
  END IF;
END
$mig$;

-- Backfill 2: copiar la provincia del centro de trabajo a convenio_province
-- si no está definida (heurística simple, el usuario puede sobreescribir).
UPDATE public.contracts
   SET convenio_province = NULL
 WHERE false; -- placeholder no-op; ajusta cuando tengas reglas específicas.

-- FK + índice sobre v3_docs
ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_convenio_doc_id_fkey
  FOREIGN KEY (convenio_doc_id) REFERENCES public.v3_docs(id) ON DELETE SET NULL
  NOT VALID;

ALTER TABLE public.contracts VALIDATE CONSTRAINT contracts_convenio_doc_id_fkey;

CREATE INDEX IF NOT EXISTS contracts_convenio_doc_idx
  ON public.contracts(convenio_doc_id);

-- ----------------------------------------------------------------------------
-- 6) DROP de las tablas legacy agreement_registry y company_agreement_assignments
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.company_agreement_assignments CASCADE;
DROP TABLE IF EXISTS public.agreement_registry            CASCADE;

-- ----------------------------------------------------------------------------
-- 7) Limpiar columnas legacy en public.contracts tras el DROP de registry.
--    El código aplicativo deja de leer agreement_ref_id; si alguna integración
--    externa aún lo necesita, mantenla comentando este bloque.
-- ----------------------------------------------------------------------------
ALTER TABLE public.contracts DROP COLUMN IF EXISTS agreement_ref_id;
-- agreement_id (text) se conserva temporalmente para compatibilidad con
-- importaciones históricas; se eliminará en un ciclo posterior.

-- ----------------------------------------------------------------------------
-- 8) RLS en company_convenios (consistente con v3_docs y payroll_config)
-- ----------------------------------------------------------------------------
ALTER TABLE public.company_convenios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_convenios_service_all   ON public.company_convenios;
DROP POLICY IF EXISTS company_convenios_select        ON public.company_convenios;
DROP POLICY IF EXISTS company_convenios_ins_upd_del   ON public.company_convenios;

CREATE POLICY company_convenios_service_all ON public.company_convenios
  FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY company_convenios_select ON public.company_convenios
  FOR SELECT TO public
  USING (
    public.is_super_admin()
    OR company_id = public.get_user_company_id()
    OR public.user_can_access_company(company_id)
  );

CREATE POLICY company_convenios_ins_upd_del ON public.company_convenios
  FOR ALL TO public
  USING (
    public.is_super_admin()
    OR company_id = public.get_user_company_id()
    OR public.user_can_access_company(company_id)
  )
  WITH CHECK (
    public.is_super_admin()
    OR company_id = public.get_user_company_id()
    OR public.user_can_access_company(company_id)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_convenios TO authenticated;

-- ----------------------------------------------------------------------------
-- 9) Vistas de conveniencia para el visor de convenios asignados.
--    NO son vistas "fantasma": únicamente JOINEAN v3_docs + company_convenios
--    para exponer el catálogo de forma eficiente desde el frontend.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_company_convenios AS
SELECT
  cc.id                 AS assignment_id,
  cc.company_id         AS company_id,
  cc.doc_id             AS doc_id,
  cc.default_province   AS default_province,
  cc.is_active          AS is_active,
  cc.priority           AS priority,
  cc.effective_from     AS assignment_effective_from,
  cc.effective_to       AS assignment_effective_to,
  cc.notes              AS notes,
  d.title               AS doc_title,
  d.filename            AS doc_filename,
  d.language            AS doc_language,
  d.page_count          AS doc_page_count,
  p.doc_type            AS doc_type,
  p.effective_from      AS doc_effective_from,
  p.effective_to        AS doc_effective_to,
  p.scope_functional    AS doc_scope_functional,
  p.scope_personal      AS doc_scope_personal
FROM public.company_convenios cc
JOIN public.v3_docs d         ON d.id      = cc.doc_id
LEFT JOIN public.v3_doc_profile p ON p.doc_id = cc.doc_id;

COMMENT ON VIEW public.v_company_convenios IS
  'Vista JOIN entre company_convenios y v3_docs/v3_doc_profile para listar convenios asignados con metadatos.';

GRANT SELECT ON public.v_company_convenios TO authenticated;

COMMIT;
