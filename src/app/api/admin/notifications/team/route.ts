import { NextRequest } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { adminErrorResponse, jsonOk } from '@/lib/admin-integrations/api-helpers'
import { assertValidCompanyId, assertCompanyAccess } from '@/lib/admin-integrations/request-context'
import { listNotificationTeamMembers } from '@/lib/admin-integrations/notifications/notification-service'

export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get('company_id')
    assertValidCompanyId(companyId)
    assertCompanyAccess(request, companyId!)

    const supabase = getSupabaseClient()
    const forCompaniesRaw = request.nextUrl.searchParams.get('for_companies')
    const forCompanyId = request.nextUrl.searchParams.get('for_company_id')

    if (forCompaniesRaw) {
      const ids = [...new Set(forCompaniesRaw.split(',').map((id) => id.trim()).filter(Boolean))]
      const teams: Record<string, Awaited<ReturnType<typeof listNotificationTeamMembers>>> = {}
      await Promise.all(
        ids.map(async (id) => {
          teams[id] = await listNotificationTeamMembers(supabase, id)
        }),
      )
      return jsonOk({ teams })
    }

    const targetCompanyId = forCompanyId || companyId!
    const members = await listNotificationTeamMembers(supabase, targetCompanyId)
    return jsonOk({ members })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
