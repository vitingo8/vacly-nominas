import { NextRequest } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { adminErrorResponse, jsonOk } from '@/lib/admin-integrations/api-helpers'
import {
  assertValidCompanyId,
  assertCompanyAccess,
  getActorUserId,
} from '@/lib/admin-integrations/request-context'
import { AdminIntegrationError } from '@/lib/admin-integrations/errors'
import { openNotificationDocument } from '@/lib/admin-integrations/notifications/notification-service'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const companyId = request.nextUrl.searchParams.get('company_id')
    const certificateId = request.nextUrl.searchParams.get('certificate_id') || undefined
    const userConfirmed = request.nextUrl.searchParams.get('confirm') === '1'
    assertValidCompanyId(companyId)
    assertCompanyAccess(request, companyId!)

    if (!userConfirmed) {
      throw new AdminIntegrationError(
        'VALIDATION_ERROR',
        'Confirma la apertura de la notificación desde el frontend',
      )
    }

    const supabase = getSupabaseClient()
    const result = await openNotificationDocument(supabase, companyId!, id, {
      actorUserId: getActorUserId(request),
      certificateId,
      userConfirmed: true,
    })

    return jsonOk(result)
  } catch (error) {
    return adminErrorResponse(error)
  }
}
