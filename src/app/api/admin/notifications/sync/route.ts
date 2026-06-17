import { NextRequest } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { adminErrorResponse, jsonOk } from '@/lib/admin-integrations/api-helpers'
import {
  assertValidCompanyId,
  assertCompanyAccess,
  getActorUserId,
} from '@/lib/admin-integrations/request-context'
import { AdminIntegrationError } from '@/lib/admin-integrations/errors'
import { syncCompanyNotifications } from '@/lib/admin-integrations/notifications/notification-service'

/**
 * Descarga notificaciones electronicas de la empresa usando un certificado.
 * Body: { company_id, certificate_id }.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const companyId = String(body.company_id || '')
    const certificateId = String(body.certificate_id || '')
    assertValidCompanyId(companyId)
    assertCompanyAccess(request, companyId)
    if (!certificateId) {
      throw new AdminIntegrationError('VALIDATION_ERROR', 'certificate_id es requerido para sincronizar')
    }

    const supabase = getSupabaseClient()
    const result = await syncCompanyNotifications(supabase, {
      companyId,
      certificateId,
      actorUserId: getActorUserId(request),
    })

    return jsonOk({ fetched: result.fetched, stored: result.stored })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
