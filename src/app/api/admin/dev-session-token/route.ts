import { NextRequest } from 'next/server'
import { AdminIntegrationError } from '@/lib/admin-integrations/errors'
import { adminErrorResponse, jsonOk } from '@/lib/admin-integrations/api-helpers'
import { assertValidCompanyId, mintCompanyToken } from '@/lib/admin-integrations/request-context'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Acuña un token de sesión para desarrollo local directo (sin iframe de vacly-app).
 * Solo disponible con NODE_ENV=development.
 */
export async function GET(request: NextRequest) {
  try {
    if (process.env.NODE_ENV !== 'development') {
      throw new AdminIntegrationError('UNAUTHORIZED', 'Solo disponible en desarrollo')
    }

    const companyId = request.nextUrl.searchParams.get('company_id')
    assertValidCompanyId(companyId)

    const secret = process.env.ADMIN_SESSION_SECRET
    if (!secret) {
      return jsonOk({ token: null, expires_in: 0, note: 'Sin ADMIN_SESSION_SECRET no se requiere token' })
    }

    const userId = process.env.VACLY_NOMINAS_DEV_USER_ID?.trim()
    if (userId && !UUID_REGEX.test(userId)) {
      throw new AdminIntegrationError('VALIDATION_ERROR', 'VACLY_NOMINAS_DEV_USER_ID debe ser un UUID')
    }

    const ttl = 3600
    const token = mintCompanyToken(companyId!, secret, ttl, userId || undefined)
    return jsonOk({ token, expires_in: ttl })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
