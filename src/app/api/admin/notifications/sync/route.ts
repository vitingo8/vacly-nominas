import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { adminErrorResponse, jsonOk } from '@/lib/admin-integrations/api-helpers'
import {
  assertValidCompanyId,
  assertCompanyAccess,
  getActorUserId,
} from '@/lib/admin-integrations/request-context'
import { AdminIntegrationError } from '@/lib/admin-integrations/errors'
import {
  syncCompanyNotifications,
  syncMultipleCompanyNotifications,
} from '@/lib/admin-integrations/notifications/notification-service'

/**
 * Descarga notificaciones electronicas usando uno o varios certificados.
 * Body: { company_id, certificate_id? } o { company_id, certificate_ids?: string[] }.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const companyId = String(body.company_id || '')
    assertValidCompanyId(companyId)
    assertCompanyAccess(request, companyId)

    const certificateIds = Array.isArray(body.certificate_ids)
      ? body.certificate_ids.map((id: unknown) => String(id)).filter(Boolean)
      : body.certificate_id
        ? [String(body.certificate_id)]
        : []

    if (certificateIds.length === 0) {
      throw new AdminIntegrationError('VALIDATION_ERROR', 'certificate_id o certificate_ids es requerido')
    }

    const supabase = getSupabaseClient()
    const actorUserId = getActorUserId(request)

    const result =
      certificateIds.length === 1
        ? await syncCompanyNotifications(supabase, {
            companyId,
            certificateId: certificateIds[0],
            actorUserId,
          })
        : await syncMultipleCompanyNotifications(supabase, {
            companyId,
            certificateIds,
            actorUserId,
          })

    return jsonOk({
      fetched: result.fetched,
      stored: result.stored,
      runs: result.runs,
      certificateResults: result.certificateResults,
    })
  } catch (error) {
    if (error instanceof AdminIntegrationError && error.details) {
      return NextResponse.json(
        {
          success: false,
          ...error.toJSON(),
          runs: (error.details as any)?.runs,
          certificateResults: (error.details as any)?.certificateResults,
        },
        { status: 500 },
      )
    }
    return adminErrorResponse(error)
  }
}
