import { NextRequest } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { TransactionService } from '@/lib/admin-integrations/transaction-engine/transaction-service'
import { adminErrorResponse, jsonOk } from '@/lib/admin-integrations/api-helpers'
import type { TransactionStatus } from '@/lib/admin-integrations/types'

export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get('company_id')
    if (!companyId) {
      return adminErrorResponse(new Error('company_id es requerido'))
    }

    const status = request.nextUrl.searchParams.get('status') as TransactionStatus | null
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10)
    const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0', 10)

    const supabase = getSupabaseClient()
    const txService = new TransactionService(supabase)
    const { data, total } = await txService.listByCompany(companyId, {
      status: status || undefined,
      limit,
      offset,
    })

    return jsonOk({ data, total, limit, offset })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
