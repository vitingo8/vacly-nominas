import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { adminErrorResponse } from '@/lib/admin-integrations/api-helpers'
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
    const download = request.nextUrl.searchParams.get('download') === '1'
    assertValidCompanyId(companyId)
    assertCompanyAccess(request, companyId!)

    if (!userConfirmed) {
      throw new AdminIntegrationError(
        'VALIDATION_ERROR',
        'Confirma la apertura de la notificación desde el frontend',
      )
    }

    const supabase = getSupabaseClient()
    const doc = await openNotificationDocument(supabase, companyId!, id, {
      actorUserId: getActorUserId(request),
      certificateId,
      userConfirmed: true,
    })

    return new NextResponse(new Uint8Array(doc.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${doc.fileName.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
        'X-Notification-Comparecida': doc.comparecida ? '1' : '0',
      },
    })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
