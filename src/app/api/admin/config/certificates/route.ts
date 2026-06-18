import { NextRequest } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { AuditService, createCertificateVault } from '@/lib/admin-integrations'
import { adminErrorResponse, jsonOk } from '@/lib/admin-integrations/api-helpers'
import {
  assertValidCompanyId,
  assertCompanyAccess,
  getActorUserId,
} from '@/lib/admin-integrations/request-context'
import { AdminIntegrationError } from '@/lib/admin-integrations/errors'
import { corporateBrandForPlan } from '@/lib/corporate-brand'

// Tamano maximo aceptado para un .pfx/.p12 (defensa basica).
const MAX_PFX_BYTES = 256 * 1024

export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get('company_id')
    const scope = request.nextUrl.searchParams.get('scope')
    assertValidCompanyId(companyId)
    assertCompanyAccess(request, companyId!)

    const supabase = getSupabaseClient()
    const audit = new AuditService(supabase)
    const vault = createCertificateVault(supabase, audit)

    const certificates =
      scope === 'agency'
        ? await vault.listAgencyCertificates(companyId!)
        : await vault.listCertificates(companyId!)

    if (scope === 'agency') {
      const accountCompanies = await vault.listAccountCompanies(companyId!)
      const { data: companyRow } = await supabase
        .from('companies')
        .select('plan')
        .eq('company_id', companyId!)
        .maybeSingle()
      const brand = corporateBrandForPlan((companyRow as { plan?: string } | null)?.plan)
      return jsonOk({ certificates, accountCompanies, brand })
    }

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
    const password = String(formData.get('password') || '')
    const file = formData.get('pfx') as File | null

    assertValidCompanyId(companyId)
    assertCompanyAccess(request, companyId)
    if (!alias || !file) {
      throw new AdminIntegrationError('VALIDATION_ERROR', 'alias y pfx son requeridos')
    }
    if (!password) {
      throw new AdminIntegrationError('VALIDATION_ERROR', 'La contrasena del certificado es requerida')
    }
    if (file.size === 0 || file.size > MAX_PFX_BYTES) {
      throw new AdminIntegrationError('VALIDATION_ERROR', 'El fichero del certificado no es valido (tamano)')
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const supabase = getSupabaseClient()
    const audit = new AuditService(supabase)
    const vault = createCertificateVault(supabase, audit)

    // El NIF/titular/fechas se extraen del propio certificado, no del formulario.
    const meta = await vault.storeCertificate({
      companyId,
      alias,
      pfx: buffer,
      password,
      createdBy: getActorUserId(request),
    })

    return jsonOk({ certificate: meta })
  } catch (error) {
    return adminErrorResponse(error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get('company_id')
    const certificateId = request.nextUrl.searchParams.get('id')
    assertValidCompanyId(companyId)
    assertCompanyAccess(request, companyId!)
    if (!certificateId) {
      throw new AdminIntegrationError('VALIDATION_ERROR', 'id del certificado es requerido')
    }

    const supabase = getSupabaseClient()
    const audit = new AuditService(supabase)
    const vault = createCertificateVault(supabase, audit)

    await vault.revokeCertificate(companyId!, certificateId, getActorUserId(request))

    return jsonOk({ revoked: true })
  } catch (error) {
    return adminErrorResponse(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const companyId = String(body.company_id || '')
    const certificateId = String(body.id || '')

    assertValidCompanyId(companyId)
    assertCompanyAccess(request, companyId)
    if (!certificateId) {
      throw new AdminIntegrationError('VALIDATION_ERROR', 'id del certificado es requerido')
    }

    const supabase = getSupabaseClient()
    const audit = new AuditService(supabase)
    const vault = createCertificateVault(supabase, audit)

    if (typeof body.portfolio_scope === 'string') {
      const scope = body.portfolio_scope
      if (scope !== 'own' && scope !== 'portfolio') {
        throw new AdminIntegrationError('VALIDATION_ERROR', 'portfolio_scope debe ser own o portfolio')
      }
      await vault.setPortfolioScope(
        companyId,
        certificateId,
        scope,
        companyId,
        getActorUserId(request),
      )
      return jsonOk({ portfolio_scope: scope })
    }

    if (
      typeof body.expiry_notifications_enabled === 'boolean' ||
      Array.isArray(body.expiry_notification_milestones)
    ) {
      const enabled =
        typeof body.expiry_notifications_enabled === 'boolean'
          ? body.expiry_notifications_enabled
          : true
      const milestones = Array.isArray(body.expiry_notification_milestones)
        ? body.expiry_notification_milestones.map(Number).filter((n: number) => Number.isFinite(n))
        : undefined

      if (milestones !== undefined) {
        await vault.setExpiryNotificationSettings(
          companyId,
          certificateId,
          { enabled, milestones },
          getActorUserId(request),
        )
        return jsonOk({
          expiry_notifications_enabled: enabled,
          expiry_notification_milestones: milestones,
        })
      }

      await vault.setExpiryNotificationsEnabled(
        companyId,
        certificateId,
        enabled,
        getActorUserId(request),
      )
      return jsonOk({ expiry_notifications_enabled: enabled })
    }

    const enabled = body.expiry_notifications_enabled
    if (typeof enabled !== 'boolean') {
      throw new AdminIntegrationError('VALIDATION_ERROR', 'expiry_notifications_enabled debe ser boolean')
    }

    await vault.setExpiryNotificationsEnabled(
      companyId,
      certificateId,
      enabled,
      getActorUserId(request),
    )

    return jsonOk({ expiry_notifications_enabled: enabled })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
