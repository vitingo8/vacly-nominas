import { NextRequest } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { AdminIntegrationError } from '@/lib/admin-integrations/errors'
import { adminErrorResponse, jsonOk } from '@/lib/admin-integrations/api-helpers'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const companyId = request.nextUrl.searchParams.get('company_id')

    const supabase = getSupabaseClient()
    let query = supabase.from('administrative_responses').select('*').eq('id', id)
    if (companyId) query = query.eq('company_id', companyId)

    const { data, error } = await query.single()
    if (error || !data) {
      throw new AdminIntegrationError('RESPONSE_NOT_FOUND', 'Respuesta no encontrada')
    }

    return jsonOk({ response: data })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
