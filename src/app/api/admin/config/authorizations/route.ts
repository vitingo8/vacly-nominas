import { NextRequest } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { adminErrorResponse, jsonOk } from '@/lib/admin-integrations/api-helpers'

export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get('company_id')
    if (!companyId) {
      return adminErrorResponse(new Error('company_id es requerido'))
    }

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('administrative_authorizations')
      .select('id, provider, authorization_type, holder_nif, representative_nif, red_authorization_number, status, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (error) {
      return adminErrorResponse(error)
    }

    return jsonOk({ authorizations: data ?? [] })
  } catch (error) {
    return adminErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const companyId = body.company_id || body.companyId
    if (!companyId) {
      return adminErrorResponse(new Error('company_id es requerido'))
    }

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('administrative_authorizations')
      .insert({
        company_id: companyId,
        provider: body.provider || 'tgss',
        authorization_type: body.authorization_type || body.authorizationType || 'red',
        holder_nif: body.holder_nif || body.holderNif,
        representative_nif: body.representative_nif || body.representativeNif || null,
        red_authorization_number: body.red_authorization_number || body.redAuthorizationNumber || null,
        status: 'active',
      })
      .select('*')
      .single()

    if (error) {
      return adminErrorResponse(error)
    }

    return jsonOk({ authorization: data })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
