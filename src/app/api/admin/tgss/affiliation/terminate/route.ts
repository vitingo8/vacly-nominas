import { NextRequest } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { TgssAffiliationService } from '@/lib/admin-integrations/tgss-red/tgss-affiliation-service'
import { adminErrorResponse, jsonOk } from '@/lib/admin-integrations/api-helpers'

async function handleAffiliation(request: NextRequest) {
  try {
    const body = await request.json()
    const companyId = body.company_id || body.companyId
    const employeeId = body.employee_id || body.employeeId

    if (!companyId || !employeeId) {
      return adminErrorResponse(new Error('company_id y employee_id son requeridos'))
    }

    const supabase = getSupabaseClient()
    const service = new TgssAffiliationService(supabase)
    const result = await service.createAffiliationRequest({
      companyId,
      employeeId,
      requestType: 'baja',
      nss: body.nss,
      ipf: body.ipf,
      ccc: body.ccc,
      fechaReal: body.fecha_real || body.fechaReal,
      fechaEfecto: body.fecha_efecto || body.fechaEfecto,
      contractSnapshot: body.contract_snapshot || body.contractSnapshot,
      requestedBy: body.requested_by || body.requestedBy,
      certificateId: body.certificate_id || body.certificateId,
      authorizationId: body.authorization_id || body.authorizationId,
    })

    return jsonOk({
      transactionId: result.transaction.id,
      status: result.transaction.status,
      fileId: result.fileId,
    })
  } catch (error) {
    return adminErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  return handleAffiliation(request)
}
