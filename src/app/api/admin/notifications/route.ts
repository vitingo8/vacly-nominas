import { NextRequest } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { adminErrorResponse, jsonOk } from '@/lib/admin-integrations/api-helpers'
import {
  assertValidCompanyId,
  assertCompanyAccess,
} from '@/lib/admin-integrations/request-context'
import { AdminIntegrationError } from '@/lib/admin-integrations/errors'
import {
  listAgencyNotifications,
  listCompanyNotifications,
  markNotificationRead,
} from '@/lib/admin-integrations/notifications/notification-service'

export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get('company_id')
    const scope = request.nextUrl.searchParams.get('scope')
    assertValidCompanyId(companyId)
    assertCompanyAccess(request, companyId!)

    const supabase = getSupabaseClient()
    const notifications =
      scope === 'agency'
        ? await listAgencyNotifications(supabase, companyId!)
        : await listCompanyNotifications(supabase, companyId!)

    return jsonOk({ notifications })
  } catch (error) {
    return adminErrorResponse(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const companyId = String(body.company_id || '')
    const notificationId = String(body.id || '')
    assertValidCompanyId(companyId)
    assertCompanyAccess(request, companyId)
    if (!notificationId) {
      throw new AdminIntegrationError('VALIDATION_ERROR', 'id de la notificacion es requerido')
    }

    const supabase = getSupabaseClient()
    await markNotificationRead(supabase, companyId, notificationId)
    return jsonOk({ read: true })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
