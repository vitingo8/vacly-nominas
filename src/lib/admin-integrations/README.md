# Integraciones administrativas (TGSS / AEAT)

Capa de trámites administrativos para Vacly Nóminas: transacciones trazables, ficheros oficiales, certificados cifrados y envío vía **SILTRA** en Windows.

## Requisitos

1. **Autorización RED** ante la TGSS (Sede Electrónica).
2. **Certificado electrónico** válido (persona física o representante jurídico), subido en Vacly.
3. **SILTRA** instalado en Windows con modo desatendido.
4. Carpetas de entrada/salida configuradas y accesibles desde el servidor que procesa la cola.

## Variables de entorno

```env
ADMIN_INTEGRATIONS_ENABLED=true
TGSS_SILTRA_INPUT_DIR=C:\SILTRA\in
TGSS_SILTRA_OUTPUT_DIR=C:\SILTRA\out
TGSS_SILTRA_EXECUTABLE_PATH=C:\SILTRA\siltra.exe
TGSS_CERTIFICATE_ID=<uuid-certificado-en-bd>
AEAT_MODE=soap
ADMIN_ENCRYPTION_KEY=<clave-32-chars-minimo>
CRON_SECRET=<secreto-produccion>
ADMIN_STORAGE_BUCKET=admin-integrations
```

> **Importante:** el procesador de cola (`POST /api/admin/tgss/process`) debe ejecutarse en un entorno Windows con SILTRA instalado. Si despliegas en Vercel, configura el cron para llamar a un servidor local o a una máquina Windows con SILTRA.

## Gestor de Certificados Digitales

Almacén cifrado de certificados `.pfx`/`.p12` por empresa, con metadatos extraídos del propio certificado (titular, NIF, emisor, caducidad), estados de caducidad, vista de cartera para gestorías, alertas y firma de presentaciones.

> Módulo exclusivo de gestorías: en vacly-app las entradas de sidebar (Certificados, Autorizaciones RED, Notificaciones) solo se muestran cuando `company.plan === 'agencia'`.

### Clave de cifrado

- `ADMIN_ENCRYPTION_KEY` es **obligatoria** (>= 32 caracteres).
- Cada blob se cifra con salt e IV aleatorios (formato `salt|iv|tag|ciphertext`).

### Alertas de caducidad

```bash
curl -X POST http://localhost:3000/api/admin/cron/certificates-expiry \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Firma de presentaciones

`signSubmission()` descifra el certificado en memoria y firma con **PKCS#7 detached** real. Integrado en `/api/filing` (Modelo 111/190), `/api/red` y `/api/sepa`.

### Notificaciones electrónicas (DEHu)

`POST /api/admin/notifications/sync` requiere integración real con el servicio PAU/DEHu (pendiente de implementación completa).

## Procesar cola TGSS

```bash
curl -X POST http://localhost:3000/api/admin/tgss/process \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit": 10}'
```

Programar con **Supabase pg_cron** (migración `supabase/migrations/20260617_admin_integrations_cron.sql`):
- `admin-tgss-process` cada **5 min**
- `admin-certificates-expiry` diario **07:00 UTC**

## Documentación oficial

- Seguridad Social: Acceso al Sistema RED, autorización RED, SILTRA (manual instalación/modo desatendido).
- RED Afiliación: Mensaje AFI, FRA, CFA, IDC, RYC.
- AEAT: Modelo 111, Modelo 190.

## Estructura

- `src/lib/admin-integrations/` — lógica de negocio
- `src/app/api/admin/` — endpoints REST
- `src/app/admin/` — UI embebida desde vacly-app

## Tests

```bash
npm run test:admin
```

## Estados de transacción

`created` → `validated` → `file_generated` → `queued` → `submitted` → `response_received` → `accepted` | `rejected` | `failed`

## Nota sobre AFI

El generador AFI actual es un **borrador**. Validar posiciones exactas contra el PDF oficial "Mensaje AFI" de la TGSS antes de producción.
