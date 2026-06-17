import { NextRequest } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { isCronAuthorized } from '@/lib/admin-integrations/config'
import { TransactionProcessor } from '@/lib/admin-integrations/transaction-engine/processor'
import { adminErrorResponse, jsonOk } from '@/lib/admin-integrations/api-helpers'
import { AdminIntegrationError } from '@/lib/admin-integrations/errors'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!isCronAuthorized(authHeader)) {
      throw new AdminIntegrationError('UNAUTHORIZED', 'No autorizado')
    }

    const body = await request.json().catch(() => ({}))
    const limit = typeof body.limit === 'number' ? body.limit : 20

    const supabase = getSupabaseClient()
    const processor = new TransactionProcessor(supabase)
    const result = await processor.processQueue(limit)

    return jsonOk({ result })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
