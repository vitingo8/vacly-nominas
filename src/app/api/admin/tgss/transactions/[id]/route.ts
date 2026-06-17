import { NextRequest } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { TransactionService } from '@/lib/admin-integrations/transaction-engine/transaction-service'
import { adminErrorResponse, jsonOk } from '@/lib/admin-integrations/api-helpers'
import type { TransactionStatus } from '@/lib/admin-integrations/types'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const companyId = request.nextUrl.searchParams.get('company_id') || undefined

    const supabase = getSupabaseClient()
    const txService = new TransactionService(supabase)
    const tx = await txService.getById(id, companyId)

    const { data: affiliation } = await supabase
      .from('tgss_affiliation_requests')
      .select('*')
      .eq('transaction_id', id)
      .maybeSingle()

    const { data: files } = await supabase
      .from('administrative_files')
      .select('id, file_type, file_name, sha256, created_at')
      .eq('transaction_id', id)

    const { data: responses } = await supabase
      .from('administrative_responses')
      .select('*')
      .eq('transaction_id', id)
      .order('received_at', { ascending: false })

    return jsonOk({
      transaction: tx,
      affiliation: affiliation ?? null,
      files: files ?? [],
      responses: responses ?? [],
    })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
