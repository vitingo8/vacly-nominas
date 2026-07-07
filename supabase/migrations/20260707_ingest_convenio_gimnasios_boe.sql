-- ============================================================================
-- 20260707_ingest_convenio_gimnasios_boe.sql
-- Ingesta manual (sin pipeline de extracción IA) del V Convenio colectivo
-- estatal de instalaciones deportivas y gimnasios (BOE-A-2024-1506,
-- publicado 26/01/2024, código de convenio 99015105012005).
--
-- Los datos (grupos/niveles, tablas salariales 2023-2025 y pagas extra) han
-- sido extraídos y verificados manualmente contra el texto del BOE, y
-- contrastados contra nóminas reales de WETRACKS (Sergi Pujol Grupo 3 Nivel 1
-- = 1.220,13€, Marc Ayuso Grupo 3 Nivel 2 = 1.191,49€, tabla 2025).
--
-- Este convenio NO tiene complemento de antigüedad (no existe artículo de
-- "antigüedad" retributiva en el texto), por lo que deliberadamente no se
-- inserta ninguna fila v3_rrhh_inputs con key ILIKE 'seniority_%'.
--
-- Idempotente: usa DO $$ ... $$ con comprobación de existencia por
-- canonical_code antes de insertar, para poder re-ejecutarse sin duplicar.
-- ============================================================================

BEGIN;

DO $ingest$
DECLARE
  v_wetracks_id uuid := 'a92fef9d-34d6-40ac-8870-c5bc688cbf11';
  v_doc_id      uuid;
  v_existing    uuid;
BEGIN
  SELECT id INTO v_existing
    FROM public.v3_docs
   WHERE canonical_code = '99015105012005'
     AND company_id = v_wetracks_id
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE NOTICE 'Convenio ya ingerido (doc_id=%), no se duplica.', v_existing;
    RETURN;
  END IF;

  v_doc_id := gen_random_uuid();

  -- --------------------------------------------------------------------
  -- 1) v3_docs: metadatos canónicos del convenio
  -- --------------------------------------------------------------------
  INSERT INTO public.v3_docs (
    id, company_id, title, filename, mime_type, storage_bucket, storage_path,
    hash_sha256, page_count, language, canonical_code, canonical_title,
    canonical_scope_json, version_date, cnae_codes
  ) VALUES (
    v_doc_id,
    v_wetracks_id,
    'V Convenio colectivo estatal de instalaciones deportivas y gimnasios',
    'BOE-A-2024-1506.pdf',
    'application/pdf',
    'docs',
    'external/boe/BOE-A-2024-1506.pdf',
    md5('BOE-A-2024-1506-99015105012005'),
    12,
    'es',
    '99015105012005',
    'V Convenio colectivo estatal de instalaciones deportivas y gimnasios',
    jsonb_build_object(
      'functional', 'Instalaciones deportivas, gimnasios, clubes deportivos, campos de golf y actividades de ejercicio físico',
      'territorial', 'Todo el territorio del Estado español',
      'personal', 'Todas las personas trabajadoras de empresas del sector, excepto arrendamiento de servicios y relaciones laborales especiales',
      'temporal', 'Vigencia desde 22/06/2023 (efectos económicos 01/05/2023) hasta 31/12/2025, prorrogable tácitamente'
    ),
    '2024-01-26',
    ARRAY['9311','9312','9313']
  );

  -- --------------------------------------------------------------------
  -- 2) v3_rrhh_tables: grupos profesionales y niveles (Art. 44)
  -- --------------------------------------------------------------------
  INSERT INTO public.v3_rrhh_tables (
    doc_id, company_id, key, domain, label, description,
    schema_json, rows_json, applicability_json, applicability_hash,
    status, confidence
  ) VALUES (
    v_doc_id, v_wetracks_id,
    'grupos_profesionales_y_niveles_funcionales',
    'payroll',
    'Grupos profesionales y niveles funcionales',
    'Clasificación del personal en grupos 1 a 5 y niveles funcionales, según el artículo 44 del convenio.',
    jsonb_build_array(
      jsonb_build_object('name','Grupo','type','text'),
      jsonb_build_object('name','Nivel','type','text'),
      jsonb_build_object('name','Denominación','type','text')
    ),
    jsonb_build_array(
      jsonb_build_object('Grupo','1','Nivel',null,'Denominación','Directores/as Generales, Gerentes de gimnasios o centros de actividad físico-deportiva, Gerentes de campos de golf'),
      jsonb_build_object('Grupo','2','Nivel','1','Denominación','Directores/as de departamento (financiero, RRHH, comercial, marketing, actividades técnicas, médico, etc.)'),
      jsonb_build_object('Grupo','2','Nivel','2','Denominación','Fisioterapeutas, DUE, Contable, Secretaria/o de Dirección, Jefe/a de Mantenimiento'),
      jsonb_build_object('Grupo','3','Nivel','1','Denominación','Coordinador/a fitness, actividades aeróbicas, piscina, raqueta, clases colectivas, mantenimiento de instalaciones, oficial administrativo 1.ª, oficial 1.ª mantenimiento, coordinador/a recepción, profesor/a de golf, Head Caddie Master'),
      jsonb_build_object('Grupo','3','Nivel','2','Denominación','Monitor/a multidisciplinar, comercial de campo de golf, asistente de golf, Caddie Master'),
      jsonb_build_object('Grupo','4','Nivel','1','Denominación','Masajista, oficial 2.ª mantenimiento, oficial administrativo 2.ª, recepcionista, taquillero/a, socorrista, monitor/a unidisciplinar, dependiente tienda, encargado/a limpieza, monitor/a de golf, starter, Marshall, personal reservas campos de golf'),
      jsonb_build_object('Grupo','4','Nivel','2','Denominación','Auxiliares administrativos, telefonistas, control de acceso, portero/a, esteticista'),
      jsonb_build_object('Grupo','5','Nivel',null,'Denominación','Personal de limpieza, peón de mantenimiento de instalaciones, personal de vestuarios, mozo de cuadra, personal de cuarto de palos')
    ),
    jsonb_build_object('provinces', '[]'::jsonb),
    md5(jsonb_build_object('provinces', '[]'::jsonb)::text),
    'extracted', 1.0
  );

  -- --------------------------------------------------------------------
  -- 3) v3_rrhh_tables: tablas salariales 2023 / 2024 / 2025 (Anexo II)
  --    Salario base mensual (14 pagas), sin restricción de provincia
  --    (convenio de ámbito estatal).
  -- --------------------------------------------------------------------
  INSERT INTO public.v3_rrhh_tables (
    doc_id, company_id, key, domain, label, description,
    schema_json, rows_json, applicability_json, applicability_hash,
    effective_from, effective_to, status, confidence
  ) VALUES
  (
    v_doc_id, v_wetracks_id, 'salary_table_2023', 'payroll',
    'Tabla salarial 2023', 'Salario base mensual (14 pagas) por grupo y nivel, Anexo II, año 2023.',
    jsonb_build_array(
      jsonb_build_object('name','grupo','type','text'),
      jsonb_build_object('name','nivel','type','text'),
      jsonb_build_object('name','salario_base_mes','type','number','unit','EUR/mes')
    ),
    jsonb_build_array(
      jsonb_build_object('grupo','1','nivel',null,'salario_base_mes',1360.80),
      jsonb_build_object('grupo','2','nivel','1','salario_base_mes',1247.40),
      jsonb_build_object('grupo','2','nivel','2','salario_base_mes',1208.52),
      jsonb_build_object('grupo','3','nivel','1','salario_base_mes',1150.20),
      jsonb_build_object('grupo','3','nivel','2','salario_base_mes',1123.20),
      jsonb_build_object('grupo','4','nivel','1','salario_base_mes',1096.20),
      jsonb_build_object('grupo','4','nivel','2','salario_base_mes',1085.40),
      jsonb_build_object('grupo','5','nivel',null,'salario_base_mes',1082.14)
    ),
    jsonb_build_object('provinces', '[]'::jsonb, 'years', jsonb_build_array(2023)),
    md5(jsonb_build_object('provinces', '[]'::jsonb, 'years', jsonb_build_array(2023))::text),
    '2023-01-01', '2023-12-31', 'extracted', 1.0
  ),
  (
    v_doc_id, v_wetracks_id, 'salary_table_2024', 'payroll',
    'Tabla salarial 2024', 'Salario base mensual (14 pagas) por grupo y nivel, Anexo II, año 2024.',
    jsonb_build_array(
      jsonb_build_object('name','grupo','type','text'),
      jsonb_build_object('name','nivel','type','text'),
      jsonb_build_object('name','salario_base_mes','type','number','unit','EUR/mes')
    ),
    jsonb_build_array(
      jsonb_build_object('grupo','1','nivel',null,'salario_base_mes',1381.21),
      jsonb_build_object('grupo','2','nivel','1','salario_base_mes',1266.11),
      jsonb_build_object('grupo','2','nivel','2','salario_base_mes',1226.65),
      jsonb_build_object('grupo','3','nivel','1','salario_base_mes',1173.20),
      jsonb_build_object('grupo','3','nivel','2','salario_base_mes',1145.66),
      jsonb_build_object('grupo','4','nivel','1','salario_base_mes',1118.12),
      jsonb_build_object('grupo','4','nivel','2','salario_base_mes',1107.11),
      jsonb_build_object('grupo','5','nivel',null,'salario_base_mes',1103.79)
    ),
    jsonb_build_object('provinces', '[]'::jsonb, 'years', jsonb_build_array(2024)),
    md5(jsonb_build_object('provinces', '[]'::jsonb, 'years', jsonb_build_array(2024))::text),
    '2024-01-01', '2024-12-31', 'extracted', 1.0
  ),
  (
    v_doc_id, v_wetracks_id, 'salary_table_2025', 'payroll',
    'Tabla salarial 2025', 'Salario base mensual (14 pagas) por grupo y nivel, Anexo II, año 2025.',
    jsonb_build_array(
      jsonb_build_object('name','grupo','type','text'),
      jsonb_build_object('name','nivel','type','text'),
      jsonb_build_object('name','salario_base_mes','type','number','unit','EUR/mes')
    ),
    jsonb_build_array(
      jsonb_build_object('grupo','1','nivel',null,'salario_base_mes',1422.65),
      jsonb_build_object('grupo','2','nivel','1','salario_base_mes',1304.09),
      jsonb_build_object('grupo','2','nivel','2','salario_base_mes',1263.45),
      jsonb_build_object('grupo','3','nivel','1','salario_base_mes',1220.13),
      jsonb_build_object('grupo','3','nivel','2','salario_base_mes',1191.49),
      jsonb_build_object('grupo','4','nivel','1','salario_base_mes',1162.85),
      jsonb_build_object('grupo','4','nivel','2','salario_base_mes',1151.39),
      jsonb_build_object('grupo','5','nivel',null,'salario_base_mes',1147.94)
    ),
    jsonb_build_object('provinces', '[]'::jsonb, 'years', jsonb_build_array(2025)),
    md5(jsonb_build_object('provinces', '[]'::jsonb, 'years', jsonb_build_array(2025))::text),
    '2025-01-01', '2025-12-31', 'extracted', 1.0
  );

  -- --------------------------------------------------------------------
  -- 4) v3_rrhh_tables: pagas extraordinarias (Art. 38)
  --    2 pagas de 30 días de salario base, devengo semestral, prorrateables.
  -- --------------------------------------------------------------------
  INSERT INTO public.v3_rrhh_tables (
    doc_id, company_id, key, domain, label, description,
    schema_json, rows_json, applicability_json, applicability_hash,
    status, confidence
  ) VALUES (
    v_doc_id, v_wetracks_id,
    'pagas_extraordinarias_por_provincia',
    'payroll',
    'Pagas extraordinarias',
    'Dos pagas extraordinarias de 30 días de salario base cada una, devengo semestral (Art. 38). Prorrateables mensualmente si se acuerda entre empresa y persona trabajadora.',
    jsonb_build_array(
      jsonb_build_object('name','provincia','type','text'),
      jsonb_build_object('name','paga','type','text'),
      jsonb_build_object('name','dias','type','number'),
      jsonb_build_object('name','periodo_devengo','type','text'),
      jsonb_build_object('name','fecha_pago','type','text'),
      jsonb_build_object('name','conceptos','type','text')
    ),
    jsonb_build_array(
      jsonb_build_object('provincia','Tarragona','paga','junio','dias',30,'periodo_devengo','01/01-30/06','fecha_pago','30/06','conceptos','salario base'),
      jsonb_build_object('provincia','Tarragona','paga','diciembre','dias',30,'periodo_devengo','01/07-31/12','fecha_pago','20/12','conceptos','salario base')
    ),
    jsonb_build_object('provinces', jsonb_build_array('Tarragona')),
    md5(jsonb_build_object('provinces', jsonb_build_array('Tarragona'))::text),
    'extracted', 1.0
  );

  RAISE NOTICE 'Convenio de gimnasios ingerido con doc_id=%', v_doc_id;
END
$ingest$;

COMMIT;
