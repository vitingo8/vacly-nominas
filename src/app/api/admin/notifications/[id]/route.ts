import { NextRequest } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { adminErrorResponse, jsonOk } from '@/lib/admin-integrations/api-helpers'
import {
  assertValidCompanyId,
  assertCompanyAccess,
} from '@/lib/admin-integrations/request-context'
import { AdminIntegrationError } from '@/lib/admin-integrations/errors'
import { updateNotificationWorkflow } from '@/lib/admin-integrations/notifications/notification-service'
import type {
  NotificationCategory,
  VaclyNotificationStatus,
} from '@/lib/admin-integrations/notifications/notification-workflow'

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const body = await request.json()
    const companyId = String(body.company_id || '')
    const agencyCompanyId = String(body.agency_company_id || companyId)
    assertValidCompanyId(companyId)
    assertCompanyAccess(request, companyId)

    const vaclyStatus = body.vacly_status !== undefined ? String(body.vacly_status) : undefined
    const category = body.category !== undefined ? String(body.category) : undefined
    const assignedUserId =
      body.assigned_user_id === null || body.assigned_user_id === ''
        ? null
        : body.assigned_user_id !== undefined
          ? String(body.assigned_user_id)
          : undefined

    if (!vaclyStatus && !category && assignedUserId === undefined) {
      throw new AdminIntegrationError('VALIDATION_ERROR', 'No hay campos para actualizar')
    }

    const supabase = getSupabaseClient()
    const notification = await updateNotificationWorkflow(supabase, {
      companyId,
      notificationId: id,
      agencyCompanyId,
      vaclyStatus: vaclyStatus as VaclyNotificationStatus | undefined,
      category: category as NotificationCategory | undefined,
      assignedUserId,
    })

    return jsonOk({ notification })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
