import { NextRequest } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { adminErrorResponse, jsonOk } from '@/lib/admin-integrations/api-helpers'
import {
  assertValidCompanyId,
  assertCompanyAccess,
} from '@/lib/admin-integrations/request-context'
import { listNotificationSyncRuns } from '@/lib/admin-integrations/notifications/notification-service'

export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get('company_id')
    assertValidCompanyId(companyId)
    assertCompanyAccess(request, companyId!)

    const supabase = getSupabaseClient()
    const runs = await listNotificationSyncRuns(supabase, companyId!)
    return jsonOk({ runs })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
