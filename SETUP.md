# 🚀 Configuración de Vacly Nóminas LUX - Version Simplificada

## Cambios Recientes

✅ **Eliminado**: Dependencias innecesarias (pdf-parse, pdf-extraction)  
✅ **Simplificado**: Procesamiento solo con Claude 4.5 Haiku (sin OCR manual)  
✅ **Optimizado**: Configuración de Turbopack/webpack removida  
✅ **Mejorado**: Soporte para múltiples modelos de Claude

## Variables de Entorno

Crea un archivo `.env.local` en la raíz del proyecto:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Anthropic Claude API
ANTHROPIC_API_KEY=your_anthropic_api_key

# Claude Model (opcional - por defecto usa Haiku 3.5)
CLAUDE_MODEL=claude-haiku-4-5-20251001
```

### Opciones de Modelos

| Modelo | Descripción | Costo | Recomendado para |
|--------|-------------|-------|-----------------|
| `claude-haiku-4-5-20251001` | Rápido y económico | Muy bajo | Producción, volumen alto |
| `claude-3-5-sonnet-20241022` | Balance rendimiento/costo | Bajo-Medio | Precisión mejorada |
| `claude-opus-4-1-20250805` | Máxima calidad | Alto | Casos complejos |

## Instalación

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con tus valores

# 3. Ejecutar servidor de desarrollo
npm run dev

# Acceder a: http://localhost:3003
```

## Flujo de Procesamiento

```
1. Subir PDF → 2. Dividir en páginas → 3. Procesar con Claude → 4. Guardar datos → 5. Exportar Excel
```

### Paso a Paso

1. **Subir PDF**
   - Archivo se carga en Supabase Storage (`pdfs/`)
   - Se genera nombre automático basado en contenido

2. **Dividir en Páginas**
   - PDF se divide automáticamente en páginas individuales
   - Cada página se guarda en `split-pdfs/`

3. **Procesar con Claude**
   - Claude 4.5 Haiku procesa cada página
   - Extrae: empleado, empresa, percepciones, deducciones, etc.
   - Envía datos a Supabase (`nominas` y `processed_documents`)

4. **Exportar a Excel**
   - Genera hoja resumen + detalles
   - 5 hojas: General, Percepciones, Deducciones, Contribuciones, KPIs

## API Endpoints

### POST `/api/upload`
Sube un PDF y lo prepara para procesamiento
```json
{
  "success": true,
  "filename": "202401_Empresa.pdf",
  "url": "https://..."
}
```

### POST `/api/process-lux`
Procesa PDF completo (streaming)
```
Content-Type: text/event-stream
```

### POST `/api/export-excel`
Exporta datos procesados a Excel
```json
{
  "documents": [{ id, filename, nominaData }]
}
```

### GET `/api/nominas`
Obtiene nóminas de base de datos
```json
{
  "success": true,
  "data": [...],
  "total": 42
}
```

## Estructura de Datos

### NominaData
```typescript
{
  employee: {
    name: string
    dni: string
    nss: string
    category: string
    code: string
  }
  company: {
    name: string
    cif: string
    address: string
    center_code: string
  }
  perceptions: Array<{ concept, code, amount }>
  deductions: Array<{ concept, code, amount }>
  contributions: Array<{ concept, base, rate, employer_contribution }>
  base_ss: number
  net_pay: number
  gross_salary: number
  cost_empresa: number
  period_start: string (YYYY-MM-DD)
  period_end: string (YYYY-MM-DD)
  iban: string
  swift_bic: string
}
```

## Troubleshooting

### ❌ Error: Port is in use
```bash
# Mata el proceso en el puerto 3000+
# O usa un puerto específico:
npm run dev -- -p 3005
```

### ❌ Error: Anthropic API key not configured
```bash
# Verifica que ANTHROPIC_API_KEY esté en .env.local
# No tiene prefijo NEXT_PUBLIC_, es secreto de servidor
```

### ❌ Error: Supabase connection failed
```bash
# Verifica:
# 1. NEXT_PUBLIC_SUPABASE_URL es correcto
# 2. SUPABASE_SERVICE_ROLE_KEY es válida (no la anon key)
# 3. Proyecto de Supabase está activo
```

### ❌ 404 en assets durante dev
Es un problema conocido de Turbopack. Abre devtools y recarga la página.

## Deployment

### Vercel (Recomendado)
```bash
# Conecta tu repositorio en vercel.com
# Configura variables de entorno en Settings > Environment Variables
# Deploy automático en cada push
```

### Variables de Entorno en Vercel
- `NEXT_PUBLIC_SUPABASE_URL` (público)
- `SUPABASE_SERVICE_ROLE_KEY` (secreto)
- `ANTHROPIC_API_KEY` (secreto)
- `CLAUDE_MODEL` (opcional)

## Performance

- **Tiempo por página**: 5-15 segundos (con Haiku 3.5)
- **Batch de 50 nóminas**: ~2-3 minutos
- **Costo por nómina**: ~$0.001 (Haiku 3.5)

## Mejoras Futuras

- [ ] Caché de resultados similares
- [ ] Webhooks para procesamiento asincrónico
- [ ] Dashboard de estadísticas
- [ ] Soporte para otros formatos (Excel, CSV)
- [ ] Validación de datos mejorada
- [ ] Sistema de auditoría

## Soporte

Para reportar problemas:
1. Revisa los logs en terminal
2. Verifica variables de entorno
3. Consulta la documentación de Claude: https://docs.anthropic.com
4. Contacta al equipo: despuny@vacly.es

