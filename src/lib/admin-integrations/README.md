# Integraciones administrativas (TGSS / AEAT)

Capa propia de trámites administrativos para Vacly Nóminas: transacciones trazables, ficheros oficiales, certificados cifrados y envío vía SILTRA (cuando esté configurado).

## Modo mock (desarrollo)

Por defecto `TGSS_MODE=mock`. No requiere certificado ni SILTRA.

```env
ADMIN_INTEGRATIONS_ENABLED=true
TGSS_MODE=mock
AEAT_MODE=mock
DEHU_MODE=mock
CRON_SECRET=your-local-secret
```

## Gestor de Certificados Digitales

Almacen cifrado de certificados `.pfx`/`.p12` por empresa, con metadatos
extraidos del propio certificado (titular, NIF, emisor, caducidad), estados de
caducidad, vista de cartera para gestorias, alertas y firma de presentaciones.

> Modulo exclusivo de gestorias: en vacly-app las entradas de sidebar
> (Certificados, Autorizaciones RED, Notificaciones) solo se muestran cuando
> `company.plan === 'agencia'` (o super-admin). Los avisos de caducidad y de
> nuevas notificaciones se dirigen a los usuarios de la gestoria responsable
> (`companies.agency_id`), no a los de la empresa cliente. No requiere columnas
> nuevas como `admin_user_id`.

### Variables de entorno

```env
# Clave maestra de cifrado de certificados (AES-256-GCM). OBLIGATORIA en produccion (min. 32 chars).
ADMIN_ENCRYPTION_KEY=<clave-aleatoria-32-chars-minimo>
# Bucket privado de Supabase Storage para acuses/documentos.
ADMIN_STORAGE_BUCKET=admin-integrations
# Secreto del worker de alertas de caducidad.
CRON_SECRET=<secreto>
# Opcional: secreto compartido con vacly-app para validar el acceso por empresa (HMAC).
ADMIN_SESSION_SECRET=<secreto-compartido-vacly-app>
# Modo del proveedor de notificaciones electronicas (mock | api).
DEHU_MODE=mock
```

### Gestion de la clave de cifrado (rotacion)

- En desarrollo, si no hay `ADMIN_ENCRYPTION_KEY` se usa una clave mock (no apta para produccion).
- En produccion, `EncryptedCertificateVault` exige `ADMIN_ENCRYPTION_KEY` (>= 32 caracteres) o lanza error.
- Cada blob se cifra con un salt e IV aleatorios (formato `salt|iv|tag|ciphertext`).
- Rotacion: para cambiar la clave maestra hay que re-cifrar. Procedimiento recomendado:
  descifrar con la clave antigua y volver a guardar con la nueva (re-subida del `.pfx`),
  o un script de migracion que use ambas claves. Tras rotar, revocar/eliminar los blobs antiguos.

### Seguridad del acceso por empresa

Las APIs `/api/admin/config/certificates` y `/api/admin/notifications` usan el
service role y validan `company_id` (UUID). El aislamiento por empresa lo
refuerza RLS sobre las tablas `administrative_*` y `admin_notifications`.
Para bloquear llamadas con un `company_id` arbitrario, configura
`ADMIN_SESSION_SECRET` en vacly-nominas y haz que vacly-app acune un token por
empresa (helper `mintCompanyToken`) que solo emita para empresas a las que el
usuario tiene acceso; el iframe lo reenvia como `?token=` o cabecera
`x-vacly-company-token`. Si el secreto no esta configurado, la verificacion no
se exige (modo compatible).

### Alertas de caducidad

Worker en `POST /api/admin/cron/certificates-expiry` (protegido con `CRON_SECRET`).
Avisa a 30/15/7 dias y al caducar, creando notificaciones idempotentes en la
tabla `notifications` de vacly-app dirigidas al admin de cada empresa.

```bash
curl -X POST http://localhost:3000/api/admin/cron/certificates-expiry \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Firma de presentaciones

`signSubmission()` descifra el certificado en memoria, firma el contenido
(PKCS#7 detached; mock por defecto si `AEAT_MODE=mock`), registra una
transaccion en `administrative_transactions` con `certificate_id` y audita.
Integrado de forma opcional en `/api/filing` (Modelo 111/190), `/api/red` y
`/api/sepa`: aporta `certificateId` en el body para firmar.

### Notificaciones electronicas (DEHu/AEAT/TGSS)

`POST /api/admin/notifications/sync` descarga notificaciones con un certificado
(`DEHU_MODE=mock` simula el organismo) y las persiste en `admin_notifications`
(idempotente por `external_id`), creando un aviso en vacly-app por cada nueva.
`GET /api/admin/notifications?scope=agency` devuelve la bandeja unificada de la cartera.

Procesar cola manualmente:

```bash
curl -X POST http://localhost:3000/api/admin/tgss/process \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit": 10}'
```

## Modo SILTRA (producción)

Prerrequisitos operativos:

1. Autorización RED ante la TGSS (Sede Electrónica).
2. Certificado electrónico válido (persona física o representante jurídico).
3. SILTRA instalado en Windows con modo desatendido.
4. Programa de nóminas adaptado (Vacly) generando ficheros conforme a diseños oficiales.

```env
ADMIN_INTEGRATIONS_ENABLED=true
TGSS_MODE=siltra
TGSS_SILTRA_INPUT_DIR=C:\SILTRA\in
TGSS_SILTRA_OUTPUT_DIR=C:\SILTRA\out
TGSS_SILTRA_EXECUTABLE_PATH=C:\SILTRA\siltra.exe
TGSS_CERTIFICATE_ID=<uuid-certificado-en-bd>
ADMIN_ENCRYPTION_KEY=<clave-32-chars-minimo>
CRON_SECRET=<secreto-produccion>
ADMIN_STORAGE_BUCKET=admin-integrations
```

Programar el worker con **Supabase pg_cron** (recomendado; ya activo en el proyecto Vacly):

- Migración: `supabase/migrations/20260617_admin_integrations_cron.sql`
- Script manual: `scripts/supabase-admin-cron.sql`
- Jobs: `admin-tgss-process` cada **5 min** → `POST /api/admin/tgss/process`
- Jobs: `admin-certificates-expiry` diario **07:00 UTC** → `POST /api/admin/cron/certificates-expiry`
- Secretos en **Supabase Vault**: `nominas_admin_tgss_process_url`, `nominas_admin_certificates_expiry_url`, `nominas_admin_cron_secret` (mismo valor que `CRON_SECRET` en Vercel vacly-nominas)

Comprobar ejecuciones:

```sql
select jobname, schedule from cron.job where jobname like 'admin-%';
select status_code, created from net._http_response order by created desc limit 10;
```

Alternativa: GitHub Actions (mismo patrón que otros crons Vacly) llamando al endpoint con `Authorization: Bearer $CRON_SECRET`. **No uses pg_cron y GitHub Actions a la vez** (doble procesamiento).

## Documentación oficial

- Seguridad Social: Acceso al Sistema RED, solicitud de autorización RED, SILTRA (manual instalación/usuario/modo desatendido).
- RED Afiliación: Mensaje AFI, FRA, CFA, IDC, RYC.
- Tablas y formatos comunes del Sistema RED.
- SLD: ficheros bases, cálculo, respuesta, borrador, confirmación.
- AEAT: Modelo 111, Modelo 190 (diseños de registro); SII (WSDL) para fases posteriores.

## Estructura

- `src/lib/admin-integrations/` — lógica de negocio (certificate-vault, signing, notifications, tgss-red, etc.)
- `src/app/api/admin/` — endpoints REST (config/certificates, notifications, cron/certificates-expiry, tgss)
- `src/app/admin/` — UI embebida desde vacly-app
- `supabase/migrations/20260617_admin_integrations.sql` — esquema base
- `supabase/migrations/20260618_certificates_metadata.sql` — metadatos de certificados
- `supabase/migrations/20260619_admin_notifications.sql` — notificaciones electrónicas

## Tests

```bash
npm run test:admin
```

## Estados de transacción

`created` → `validated` → `file_generated` → `queued` → `submitted` → `response_received` → `accepted` | `rejected` | `failed`

## Nota sobre AFI

El generador AFI actual es un **borrador** con segmentos documentados. Validar posiciones exactas contra el PDF oficial "Mensaje AFI" de la TGSS antes de producción.
