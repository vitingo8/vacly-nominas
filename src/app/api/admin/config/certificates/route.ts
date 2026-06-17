import { NextRequest } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { AuditService, createCertificateVault } from '@/lib/admin-integrations'
import { adminErrorResponse, jsonOk } from '@/lib/admin-integrations/api-helpers'

export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get('company_id')
    if (!companyId) {
      return adminErrorResponse(new Error('company_id es requerido'))
    }

    const supabase = getSupabaseClient()
    const audit = new AuditService(supabase)
    const vault = createCertificateVault(supabase, audit)
    const certificates = await vault.listCertificates(companyId)

    return jsonOk({ certificates })
  } catch (error) {
    return adminErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const companyId = String(formData.get('company_id') || '')
    const alias = String(formData.get('alias') || '')
    const holderNif = String(formData.get('holder_nif') || '')
    const password = String(formData.get('password') || '')
    const file = formData.get('pfx') as File | null

    if (!companyId || !alias || !holderNif || !file) {
      return adminErrorResponse(new Error('company_id, alias, holder_nif y pfx son requeridos'))
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const supabase = getSupabaseClient()
    const audit = new AuditService(supabase)
    const vault = createCertificateVault(supabase, audit)
    const meta = await vault.storeCertificate(companyId, alias, holderNif, buffer, password)

    return jsonOk({ certificate: meta })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
