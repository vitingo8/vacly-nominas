# 🚀 Setup en Vercel

## Paso 1: Configurar Secretos en Vercel Dashboard

1. Ve a https://vercel.com/dashboard
2. Selecciona tu proyecto `vacly-nominas`
3. Ve a **Settings → Environment Variables**
4. Agrega las siguientes variables:

### Variables de Configuración

| Variable | Descripción | Tipo |
|----------|-------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL pública de tu proyecto Supabase | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Llave anón pública de Supabase (de `.env.local`) | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | Llave secreta de service role (de `.env.local`) | Secret |
| `ANTHROPIC_API_KEY` | Tu API key de Anthropic (de `.env.local`) | Secret |
| `CLAUDE_MODEL` | `claude-haiku-4-5-20251001` | Public |

**Obtén los valores de tu `.env.local`** en la raíz del proyecto.

### Paso 2: Aplicar a Entornos

Para cada variable, selecciona:
- ✅ **Production** (requerido)
- ✅ **Preview** (recomendado)
- ✅ **Development** (opcional)

### Paso 3: Guardar y Redeployar

1. Haz clic en **Save**
2. Vercel automáticamente redeployará con las nuevas variables
3. O manualmente: ir a **Deployments** → **Redeploy**

## Paso 4: Verificar Deploy

```bash
# Ver logs de deployment
vercel logs

# O via dashboard:
# https://vercel.com/dashboard/projects/vacly-nominas
```

## 🔐 Notas de Seguridad

⚠️ **IMPORTANTE**: 
- `SUPABASE_SERVICE_ROLE_KEY` es confidencial - marcar como **Secret**
- `ANTHROPIC_API_KEY` es confidencial - marcar como **Secret**
- Las variables públicas (NEXT_PUBLIC_*) se exponen en el cliente

## 🧪 Testing Local

Para verificar que las variables funcionan localmente:

```bash
# Verificar que .env.local tiene formato correcto
cat .env.local

# Debe verse así (con saltos de línea):
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# SUPABASE_SERVICE_ROLE_KEY=...
# ANTHROPIC_API_KEY=...
# CLAUDE_MODEL=claude-haiku-4-5-20251001
```

## 📝 Referencia vercel.json

El archivo `vercel.json` está configurado para:
- Buscar secretos con prefijo `@` en el dashboard
- Ej: `"@anthropic_api_key"` busca variable `ANTHROPIC_API_KEY`
- Máximo timeout: 300 segundos (5 minutos) para funciones

## ✅ Checklist

- [ ] Agregadas todas las variables en Vercel Dashboard
- [ ] Marcadas como Secret las sensibles
- [ ] Aplicadas a Production/Preview
- [ ] Deployment completado sin errores
- [ ] Funciona en https://vacly-nominas.vercel.app


