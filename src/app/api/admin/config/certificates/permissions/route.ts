import { NextRequest } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { AuditService, createCertificateVault } from '@/lib/admin-integrations'
import { adminErrorResponse, jsonOk } from '@/lib/admin-integrations/api-helpers'
import {
  assertValidCompanyId,
  assertCompanyAccess,
} from '@/lib/admin-integrations/request-context'
import { AdminIntegrationError } from '@/lib/admin-integrations/errors'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Permisos por usuario de un certificado.
 *  GET    ?company_id&certificate_id  → grants + usuarios elegibles + access_mode
 *  PUT    { company_id, certificate_id, user_id, can_view, can_use, can_manage }
 *  DELETE ?company_id&certificate_id&user_id
 */
export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get('company_id')
    const certificateId = request.nextUrl.searchParams.get('certificate_id')
    assertValidCompanyId(companyId)
    const ctx = assertCompanyAccess(request, companyId!)
    if (!certificateId || !UUID_REGEX.test(certificateId)) {
      throw new AdminIntegrationError('VALIDATION_ERROR', 'certificate_id es requerido')
    }

    const supabase = getSupabaseClient()
    const audit = new AuditService(supabase)
    const vault = createCertificateVault(supabase, audit)

    // El certificado debe pertenecer a la empresa (o su cartera).
    const { data: cert, error } = await supabase
      .from('administrative_certificates')
      .select('id, company_id, access_mode, created_by')
      .eq('id', certificateId)
      .maybeSingle()

    if (error || !cert) {
      throw new AdminIntegrationError('CERTIFICATE_NOT_FOUND', 'Certificado no encontrado')
    }

    await vault.permissions.assertAccess(
      { id: cert.id, accessMode: cert.access_mode, createdBy: cert.created_by },
      ctx.actorUserId,
      'view',
    )

    const [grants, users] = await Promise.all([
      vault.permissions.listGrants(certificateId),
      vault.permissions.listEligibleUsers(companyId!),
    ])

    return jsonOk({
      access_mode: cert.access_mode || 'open',
      created_by: cert.created_by || null,
      grants,
      users,
    })
  } catch (error) {
    return adminErrorResponse(error)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const companyId = String(body.company_id || '')
    const certificateId = String(body.certificate_id || '')
    const userId = String(body.user_id || '')

    assertValidCompanyId(companyId)
    const ctx = assertCompanyAccess(request, companyId)
    if (!UUID_REGEX.test(certificateId) || !UUID_REGEX.test(userId)) {
      throw new AdminIntegrationError('VALIDATION_ERROR', 'certificate_id y user_id son requeridos')
    }

    const supabase = getSupabaseClient()
    const audit = new AuditService(supabase)
    const vault = createCertificateVault(supabase, audit)

    const { data: cert, error } = await supabase
      .from('administrative_certificates')
      .select('id, company_id, access_mode, created_by')
      .eq('id', certificateId)
      .maybeSingle()

    if (error || !cert) {
      throw new AdminIntegrationError('CERTIFICATE_NOT_FOUND', 'Certificado no encontrado')
    }

    await vault.permissions.assertAccess(
      { id: cert.id, accessMode: cert.access_mode, createdBy: cert.created_by },
      ctx.actorUserId,
      'manage',
    )

    const grant = {
      canView: body.can_view !== false,
      canUse: body.can_use === true,
      canManage: body.can_manage === true,
    }

    await vault.permissions.upsertGrant({
      certificateId,
      companyId: cert.company_id,
      userId,
      ...grant,
      grantedBy: ctx.actorUserId,
    })

    await audit.log({
      companyId,
      eventType: 'certificate_permission_granted',
      actorUserId: ctx.actorUserId,
      metadata: { certificateId, targetUserId: userId, ...grant },
    })

    return jsonOk({ granted: true })
  } catch (error) {
    return adminErrorResponse(error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get('company_id')
    const certificateId = request.nextUrl.searchParams.get('certificate_id')
    const userId = request.nextUrl.searchParams.get('user_id')

    assertValidCompanyId(companyId)
    const ctx = assertCompanyAccess(request, companyId!)
    if (!certificateId || !UUID_REGEX.test(certificateId) || !userId || !UUID_REGEX.test(userId)) {
      throw new AdminIntegrationError('VALIDATION_ERROR', 'certificate_id y user_id son requeridos')
    }

    const supabase = getSupabaseClient()
    const audit = new AuditService(supabase)
    const vault = createCertificateVault(supabase, audit)

    const { data: cert, error } = await supabase
      .from('administrative_certificates')
      .select('id, company_id, access_mode, created_by')
      .eq('id', certificateId)
      .maybeSingle()

    if (error || !cert) {
      throw new AdminIntegrationError('CERTIFICATE_NOT_FOUND', 'Certificado no encontrado')
    }

    await vault.permissions.assertAccess(
      { id: cert.id, accessMode: cert.access_mode, createdBy: cert.created_by },
      ctx.actorUserId,
      'manage',
    )

    await vault.permissions.removeGrant(certificateId, userId)

    await audit.log({
      companyId: companyId!,
      eventType: 'certificate_permission_revoked',
      actorUserId: ctx.actorUserId,
      metadata: { certificateId, targetUserId: userId },
    })

    return jsonOk({ removed: true })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
