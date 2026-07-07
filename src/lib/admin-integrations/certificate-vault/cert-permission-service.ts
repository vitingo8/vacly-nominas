import type { SupabaseClient } from '@supabase/supabase-js'
import { AdminIntegrationError } from '../errors'

export type CertAccessMode = 'open' | 'restricted'
export type CertPermissionLevel = 'view' | 'use' | 'manage'

export interface CertificateGrant {
  id: string
  certificateId: string
  userId: string
  canView: boolean
  canUse: boolean
  canManage: boolean
  grantedBy: string | null
  createdAt: string
  userName?: string | null
  userEmail?: string | null
}

export interface CertAccessSubject {
  id: string
  accessMode: CertAccessMode | null | undefined
  createdBy: string | null | undefined
}

function rowToGrant(row: Record<string, any>): CertificateGrant {
  return {
    id: row.id,
    certificateId: row.certificate_id,
    userId: row.user_id,
    canView: row.can_view !== false,
    canUse: row.can_use === true,
    canManage: row.can_manage === true,
    grantedBy: row.granted_by ?? null,
    createdAt: row.created_at,
  }
}

/**
 * Permisos por usuario y certificado.
 *
 * Modelo: cada certificado tiene `access_mode`:
 *  - 'open' (por defecto): cualquier usuario con acceso al modulo puede ver,
 *    usar y gestionar el certificado (comportamiento historico).
 *  - 'restricted': solo el creador y los usuarios con grant explicito, segun
 *    los niveles can_view / can_use / can_manage.
 */
export class CertificatePermissionService {
  constructor(private supabase: SupabaseClient) {}

  /** Grants de un certificado, con nombre/email del usuario resueltos. */
  async listGrants(certificateId: string): Promise<CertificateGrant[]> {
    const { data, error } = await this.supabase
      .from('administrative_certificate_permissions')
      .select('id, certificate_id, user_id, can_view, can_use, can_manage, granted_by, created_at')
      .eq('certificate_id', certificateId)
      .order('created_at', { ascending: true })

    if (error) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Error listando permisos del certificado', error)
    }

    const grants = (data || []).map(rowToGrant)
    const userIds = Array.from(new Set(grants.map((g) => g.userId)))
    if (userIds.length) {
      const { data: users } = await this.supabase
        .from('users')
        .select('id, nombre, apellidos, email')
        .in('id', userIds)
      const byId = new Map<string, { name: string; email: string | null }>()
      for (const u of users || []) {
        const row = u as { id: string; nombre?: string; apellidos?: string; email?: string }
        byId.set(row.id, {
          name: [row.nombre, row.apellidos].filter(Boolean).join(' ').trim(),
          email: row.email ?? null,
        })
      }
      for (const g of grants) {
        const info = byId.get(g.userId)
        g.userName = info?.name || null
        g.userEmail = info?.email || null
      }
    }
    return grants
  }

  /** Grants de varios certificados a la vez (para filtrar listados). */
  async getGrantsByCertificate(certificateIds: string[]): Promise<Map<string, CertificateGrant[]>> {
    const map = new Map<string, CertificateGrant[]>()
    if (!certificateIds.length) return map

    const { data, error } = await this.supabase
      .from('administrative_certificate_permissions')
      .select('id, certificate_id, user_id, can_view, can_use, can_manage, granted_by, created_at')
      .in('certificate_id', certificateIds)

    if (error) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Error consultando permisos de certificados', error)
    }

    for (const row of data || []) {
      const grant = rowToGrant(row as Record<string, any>)
      const list = map.get(grant.certificateId) || []
      list.push(grant)
      map.set(grant.certificateId, list)
    }
    return map
  }

  /** Crea o actualiza el grant de un usuario sobre un certificado. */
  async upsertGrant(input: {
    certificateId: string
    companyId: string
    userId: string
    canView: boolean
    canUse: boolean
    canManage: boolean
    grantedBy?: string
  }): Promise<void> {
    const { error } = await this.supabase
      .from('administrative_certificate_permissions')
      .upsert(
        {
          certificate_id: input.certificateId,
          company_id: input.companyId,
          user_id: input.userId,
          can_view: input.canView,
          can_use: input.canUse,
          can_manage: input.canManage,
          granted_by: input.grantedBy ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'certificate_id,user_id' },
      )

    if (error) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Error guardando permiso del certificado', error)
    }
  }

  async removeGrant(certificateId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('administrative_certificate_permissions')
      .delete()
      .eq('certificate_id', certificateId)
      .eq('user_id', userId)

    if (error) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Error eliminando permiso del certificado', error)
    }
  }

  /**
   * Comprueba si un usuario tiene el nivel pedido sobre un certificado.
   * `actorUserId` undefined significa proceso automatico (cron/sistema): se
   * permite pero debe quedar reflejado en auditoria por el llamante.
   */
  async checkAccess(
    cert: CertAccessSubject,
    actorUserId: string | undefined,
    level: CertPermissionLevel,
  ): Promise<boolean> {
    if ((cert.accessMode || 'open') !== 'restricted') return true
    if (!actorUserId) return true
    if (cert.createdBy && cert.createdBy === actorUserId) return true

    const { data, error } = await this.supabase
      .from('administrative_certificate_permissions')
      .select('can_view, can_use, can_manage')
      .eq('certificate_id', cert.id)
      .eq('user_id', actorUserId)
      .maybeSingle()

    if (error || !data) return false
    if (level === 'view') return data.can_view !== false
    if (level === 'use') return data.can_use === true
    return data.can_manage === true
  }

  /** Lanza UNAUTHORIZED si el usuario no tiene el nivel pedido. */
  async assertAccess(
    cert: CertAccessSubject,
    actorUserId: string | undefined,
    level: CertPermissionLevel,
  ): Promise<void> {
    const allowed = await this.checkAccess(cert, actorUserId, level)
    if (!allowed) {
      throw new AdminIntegrationError(
        'UNAUTHORIZED',
        level === 'use'
          ? 'No tienes permiso para usar este certificado'
          : level === 'manage'
            ? 'No tienes permiso para gestionar este certificado'
            : 'No tienes permiso para ver este certificado',
      )
    }
  }

  /** Usuarios activos de la empresa (candidatos a recibir permisos). */
  async listEligibleUsers(companyId: string): Promise<Array<{ id: string; name: string; email: string | null }>> {
    const { data, error } = await this.supabase
      .from('users')
      .select('id, nombre, apellidos, email')
      .eq('company_id', companyId)
      .eq('state', true)
      .order('nombre')

    if (error) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Error listando usuarios de la empresa', error)
    }

    return (data || []).map((u: any) => ({
      id: u.id,
      name: [u.nombre, u.apellidos].filter(Boolean).join(' ').trim() || u.email || u.id,
      email: u.email ?? null,
    }))
  }
}

/**
 * Filtra certificados 'restricted' que el usuario no puede ver. Los
 * certificados 'open' y los propios (creados por el usuario) siempre pasan.
 */
export async function filterViewableCertificates<
  T extends { id: string; accessMode?: CertAccessMode | null; createdBy?: string | null },
>(permissions: CertificatePermissionService, certs: T[], viewerUserId: string | undefined): Promise<T[]> {
  if (!viewerUserId) return certs
  const restricted = certs.filter(
    (c) => (c.accessMode || 'open') === 'restricted' && c.createdBy !== viewerUserId,
  )
  if (!restricted.length) return certs

  const grants = await permissions.getGrantsByCertificate(restricted.map((c) => c.id))
  const hidden = new Set<string>()
  for (const cert of restricted) {
    const grant = (grants.get(cert.id) || []).find((g) => g.userId === viewerUserId)
    if (!grant || grant.canView === false) hidden.add(cert.id)
  }
  return certs.filter((c) => !hidden.has(c.id))
}
