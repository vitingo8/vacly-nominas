import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AdminIntegrationError } from '@/lib/admin-integrations/errors'
import { adminErrorResponse, jsonOk } from '@/lib/admin-integrations/api-helpers'
import { assertValidCompanyId, mintCompanyToken } from '@/lib/admin-integrations/request-context'
import { userHasCompanyAccess } from '@/lib/admin-company-access'

/**
 * Acuña token de sesión admin a partir de un JWT de Supabase (Bearer).
 * Fallback para el iframe cuando vacly-app aún no tiene desplegado nominas-token:
 * el padre envía el access_token por postMessage y nominas emite el token firmado.
 */
export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get('company_id')
    assertValidCompanyId(companyId)

    const secret = process.env.ADMIN_SESSION_SECRET
    if (!secret) {
      throw new AdminIntegrationError(
        'UNAUTHORIZED',
        'ADMIN_SESSION_SECRET no configurado: el acceso a certificados requiere sesion firmada',
      )
    }

    const authHeader = request.headers.get('authorization') || ''
    const match = authHeader.match(/^Bearer\s+(.+)$/i)
    const accessToken = match?.[1]?.trim()
    if (!accessToken) {
      throw new AdminIntegrationError('UNAUTHORIZED', 'Sesion de Vacly requerida')
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Supabase no configurado')
    }

    const authClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(accessToken)
    if (userError || !user?.id) {
      throw new AdminIntegrationError('UNAUTHORIZED', 'Sesion de Vacly no valida')
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Supabase service role no configurado')
    }
    const db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const hasAccess = await userHasCompanyAccess(db, user.id, user.email, companyId!)
    if (!hasAccess) {
      throw new AdminIntegrationError('UNAUTHORIZED', 'No tienes acceso a esta empresa')
    }

    const ttl = 8 * 3600
    const token = mintCompanyToken(companyId!, secret, ttl, user.id)
    return jsonOk({ token, expires_in: ttl, company_id: companyId })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
