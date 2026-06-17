# Integraciones administrativas (TGSS / AEAT)

Capa propia de trámites administrativos para Vacly Nóminas: transacciones trazables, ficheros oficiales, certificados cifrados y envío vía SILTRA (cuando esté configurado).

## Modo mock (desarrollo)

Por defecto `TGSS_MODE=mock`. No requiere certificado ni SILTRA.

```env
ADMIN_INTEGRATIONS_ENABLED=true
TGSS_MODE=mock
AEAT_MODE=mock
CRON_SECRET=your-local-secret
```

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

Programar el worker (ej. Vercel Cron o pg_cron) contra `POST /api/admin/tgss/process`.

## Documentación oficial

- Seguridad Social: Acceso al Sistema RED, solicitud de autorización RED, SILTRA (manual instalación/usuario/modo desatendido).
- RED Afiliación: Mensaje AFI, FRA, CFA, IDC, RYC.
- Tablas y formatos comunes del Sistema RED.
- SLD: ficheros bases, cálculo, respuesta, borrador, confirmación.
- AEAT: Modelo 111, Modelo 190 (diseños de registro); SII (WSDL) para fases posteriores.

## Estructura

- `src/lib/admin-integrations/` — lógica de negocio
- `src/app/api/admin/` — endpoints REST
- `src/app/admin/` — UI embebida desde vacly-app
- `supabase/migrations/20260617_admin_integrations.sql` — esquema

## Tests

```bash
npm run test:admin
```

## Estados de transacción

`created` → `validated` → `file_generated` → `queued` → `submitted` → `response_received` → `accepted` | `rejected` | `failed`

## Nota sobre AFI

El generador AFI actual es un **borrador** con segmentos documentados. Validar posiciones exactas contra el PDF oficial "Mensaje AFI" de la TGSS antes de producción.
