import { NextRequest } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { adminErrorResponse, jsonOk } from '@/lib/admin-integrations/api-helpers'
import {
  assertValidCompanyId,
  assertCompanyAccess,
  getActorUserId,
} from '@/lib/admin-integrations/request-context'
import {
  analyzeNotificationForClientEmail,
  buildNotificationMailto,
} from '@/lib/admin-integrations/notifications/notification-email-analysis'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const body = await request.json()
    const companyId = String(body.company_id || '')
    const certificateId = body.certificate_id ? String(body.certificate_id) : undefined
    const userConfirmed = body.confirm === true || body.confirm === 1 || body.confirm === '1'
    const language = body.language ? String(body.language) : undefined
    const regenerate = body.regenerate === true || body.regenerate === 1 || body.regenerate === '1'

    assertValidCompanyId(companyId)
    assertCompanyAccess(request, companyId)

    const supabase = getSupabaseClient()
    const proposal = await analyzeNotificationForClientEmail(supabase, companyId, id, {
      actorUserId: getActorUserId(request),
      certificateId,
      userConfirmed,
      language,
      regenerate,
    })

    return jsonOk({
      analysis: proposal,
      mailto: buildNotificationMailto(proposal),
    })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
