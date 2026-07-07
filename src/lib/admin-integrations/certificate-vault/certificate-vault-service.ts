import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminConfig } from '../config'
import { AdminIntegrationError } from '../errors'
import type { AuditService } from '../audit/audit-service'
import { fixCertificateTextEncoding } from './cert-text-encoding'
import { parsePfx } from './pfx-parser'
import {
  extractClassificationNifs,
  guessLinkedCompanyForPortfolio,
  resolveCertificateOrigin,
  type AccountCompany,
  type PortfolioScope,
} from './cert-origin-resolver'
import { normalizeCif } from '@/lib/upload-security'
import { normalizeExpiryMilestones } from './cert-expiry-milestones'
import {
  CertificatePermissionService,
  filterViewableCertificates,
  type CertAccessMode,
} from './cert-permission-service'

/** Dias antes de la caducidad en que el certificado pasa a "expiring_soon". */
export const EXPIRING_SOON_DAYS = 30

export type CertificateStatus = 'valid' | 'expiring_soon' | 'expired' | 'revoked'

export interface CertificateMetadata {
  id: string
  alias: string
  holderNif: string | null
  holderName?: string | null
  issuer?: string | null
  serialNumber?: string | null
  certificateType?: string | null
  validFrom?: string | null
  validTo?: string | null
  /** Estado almacenado en BD (active/revoked). */
  rawStatus: string
  /** Estado derivado para UI (semaforo de caducidad). */
  status: CertificateStatus
  daysToExpiry: number | null
  revokedAt?: string | null
  companyId?: string
  companyName?: string | null
  expiryNotificationsEnabled?: boolean
  expiryNotificationMilestones?: number[]
  portfolioScope?: PortfolioScope | null
  linkedCompanyId?: string | null
  accessMode?: CertAccessMode | null
  createdBy?: string | null
  /** Certificado anterior al que sustituye (cadena de renovaciones). */
  renewedFromCertificateId?: string | null
}

export type { AccountCompany }

export interface StoreCertificateInput {
  companyId: string
  alias: string
  pfx: Buffer
  password: string
  createdBy?: string
  /** Origen de alta para trazabilidad: 'manual_upload' | 'windows_import'. */
  source?: string
}

export interface DecryptedCertificate {
  certificateId: string
  holderNif: string | null
  /** PFX descifrado en memoria (no se persiste descifrado). */
  pfx: Buffer
  password: string
}

export interface CertificateVault {
  storeCertificate(input: StoreCertificateInput): Promise<CertificateMetadata>
  useCertificate(
    companyId: string,
    certificateId: string,
    purpose: string,
    actorUserId?: string,
  ): Promise<DecryptedCertificate>
  listCertificates(companyId: string, viewerUserId?: string): Promise<CertificateMetadata[]>
  listAgencyCertificates(agencyCompanyId: string, viewerUserId?: string): Promise<CertificateMetadata[]>
  listAccountCompanies(loggedInCompanyId: string): Promise<AccountCompany[]>
  revokeCertificate(companyId: string, certificateId: string, actorUserId?: string): Promise<void>
  setPortfolioScope(
    companyId: string,
    certificateId: string,
    scope: PortfolioScope,
    loggedInCompanyId: string,
    actorUserId?: string,
  ): Promise<void>
  setExpiryNotificationsEnabled(
    companyId: string,
    certificateId: string,
    enabled: boolean,
    actorUserId?: string,
  ): Promise<void>
  setExpiryNotificationSettings(
    companyId: string,
    certificateId: string,
    settings: { enabled: boolean; milestones: number[] },
    actorUserId?: string,
  ): Promise<void>
  setAccessMode(
    companyId: string,
    certificateId: string,
    accessMode: CertAccessMode,
    actorUserId?: string,
  ): Promise<void>
  /** Certificado anterior del mismo titular que el nuevo podria sustituir. */
  findRenewalCandidate(
    companyId: string,
    newCertificateId: string,
  ): Promise<CertificateMetadata | null>
  /** Sustituye el certificado antiguo por el nuevo heredando configuracion y permisos. */
  replaceCertificate(
    companyId: string,
    newCertificateId: string,
    oldCertificateId: string,
    actorUserId?: string,
  ): Promise<void>
  /** Servicio de permisos por usuario asociado a la boveda. */
  readonly permissions: CertificatePermissionService
}

const ALGO = 'aes-256-gcm'

function deriveKey(secret: string, salt: Buffer): Buffer {
  return scryptSync(secret, salt, 32)
}

function encryptBuffer(plain: Buffer, secret: string): Buffer {
  const salt = randomBytes(16)
  const key = deriveKey(secret, salt)
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([salt, iv, tag, encrypted])
}

function decryptBuffer(payload: Buffer, secret: string): Buffer {
  const salt = payload.subarray(0, 16)
  const iv = payload.subarray(16, 28)
  const tag = payload.subarray(28, 44)
  const encrypted = payload.subarray(44)
  const key = deriveKey(secret, salt)
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()])
}

/** Normaliza el campo bytea devuelto por PostgREST (hex string \x... o base64). */
function bytesFromDb(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  if (typeof value === 'string') {
    if (value.startsWith('\\x')) return Buffer.from(value.slice(2), 'hex')
    return Buffer.from(value, 'base64')
  }
  throw new AdminIntegrationError('PROCESSING_ERROR', 'Formato de blob cifrado no reconocido')
}

/** Deriva el estado de caducidad a partir de la fecha de fin y la revocacion. */
export function deriveCertificateStatus(
  validTo: string | null | undefined,
  revokedAt: string | null | undefined,
): { status: CertificateStatus; daysToExpiry: number | null } {
  if (revokedAt) return { status: 'revoked', daysToExpiry: null }
  if (!validTo) return { status: 'valid', daysToExpiry: null }

  const now = Date.now()
  const end = new Date(validTo).getTime()
  const daysToExpiry = Math.floor((end - now) / (1000 * 60 * 60 * 24))

  if (daysToExpiry < 0) return { status: 'expired', daysToExpiry }
  if (daysToExpiry <= EXPIRING_SOON_DAYS) return { status: 'expiring_soon', daysToExpiry }
  return { status: 'valid', daysToExpiry }
}

const LIST_COLUMNS =
  'id, company_id, alias, holder_nif, holder_name, issuer, serial_number, certificate_type, valid_from, valid_to, status, revoked_at, expiry_notifications_enabled, expiry_notification_milestones, portfolio_scope, linked_company_id, access_mode, created_by, renewed_from_certificate_id'

function rowToMetadata(row: Record<string, any>): CertificateMetadata {
  const { status, daysToExpiry } = deriveCertificateStatus(row.valid_to, row.revoked_at)
  return {
    id: row.id,
    companyId: row.company_id,
    alias: row.alias,
    holderNif: row.holder_nif ?? null,
    holderName: row.holder_name ? fixCertificateTextEncoding(row.holder_name) : null,
    issuer: row.issuer ? fixCertificateTextEncoding(row.issuer) : null,
    serialNumber: row.serial_number ?? null,
    certificateType: row.certificate_type ?? null,
    validFrom: row.valid_from ?? null,
    validTo: row.valid_to ?? null,
    rawStatus: row.status,
    status,
    daysToExpiry,
    revokedAt: row.revoked_at ?? null,
    expiryNotificationsEnabled: row.expiry_notifications_enabled !== false,
    expiryNotificationMilestones: normalizeExpiryMilestones(row.expiry_notification_milestones),
    portfolioScope: (row.portfolio_scope as PortfolioScope | null) ?? null,
    linkedCompanyId: row.linked_company_id ?? null,
    accessMode: (row.access_mode as CertAccessMode | null) ?? 'open',
    createdBy: row.created_by ?? null,
    renewedFromCertificateId: row.renewed_from_certificate_id ?? null,
  }
}

export class BaseCertificateVault implements CertificateVault {
  readonly permissions: CertificatePermissionService

  constructor(
    protected supabase: SupabaseClient,
    protected audit: AuditService,
  ) {
    this.permissions = new CertificatePermissionService(supabase)
  }

  /** Lee los campos minimos para decidir permisos sobre un certificado. */
  protected async getAccessSubject(
    companyId: string,
    certificateId: string,
  ): Promise<{ id: string; accessMode: CertAccessMode | null; createdBy: string | null }> {
    const { data, error } = await this.supabase
      .from('administrative_certificates')
      .select('id, access_mode, created_by')
      .eq('id', certificateId)
      .eq('company_id', companyId)
      .maybeSingle()

    if (error) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Error leyendo certificado', error)
    }
    if (!data) {
      throw new AdminIntegrationError('CERTIFICATE_NOT_FOUND', 'Certificado no encontrado')
    }
    return {
      id: data.id,
      accessMode: (data.access_mode as CertAccessMode | null) ?? 'open',
      createdBy: data.created_by ?? null,
    }
  }

  protected getSecret(): string {
    const config = getAdminConfig()
    if (!config.encryptionKey || config.encryptionKey.length < 32) {
      throw new AdminIntegrationError(
        'PROCESSING_ERROR',
        'ADMIN_ENCRYPTION_KEY requerida (min. 32 caracteres)',
      )
    }
    return config.encryptionKey
  }

  async storeCertificate(input: StoreCertificateInput): Promise<CertificateMetadata> {
    const { companyId, alias, pfx, password, createdBy, source } = input

    // Valida la contrasena y extrae metadatos del propio certificado.
    const parsed = parsePfx(pfx, password)

    const accountCompanies = await this.listAccountCompanies(companyId)
    const resolved = resolveCertificateOrigin(
      { holderNif: parsed.holderNif, holderName: parsed.holderName },
      companyId,
      accountCompanies,
    )
    let portfolioScope: PortfolioScope | null = null
    let linkedCompanyId: string | null = null
    if (resolved.origin === 'own') {
      portfolioScope = 'own'
      linkedCompanyId = companyId
    } else if (resolved.origin === 'portfolio') {
      portfolioScope = 'portfolio'
      linkedCompanyId = resolved.linkedCompanyId ?? null
    }

    const secret = this.getSecret()
    const encryptedPfx = encryptBuffer(pfx, secret)
    const encryptedPassword = encryptBuffer(Buffer.from(password, 'utf8'), secret)

    const { data, error } = await this.supabase
      .from('administrative_certificates')
      .insert({
        company_id: companyId,
        alias,
        holder_nif: parsed.holderNif ?? '',
        holder_name: parsed.holderName,
        issuer: parsed.issuer,
        serial_number: parsed.serialNumber,
        certificate_type: parsed.certificateType,
        encrypted_pfx: `\\x${encryptedPfx.toString('hex')}`,
        encrypted_password: `\\x${encryptedPassword.toString('hex')}`,
        valid_from: parsed.validFrom,
        valid_to: parsed.validTo,
        status: 'active',
        created_by: createdBy ?? null,
        portfolio_scope: portfolioScope,
        linked_company_id: linkedCompanyId,
      })
      .select(LIST_COLUMNS)
      .single()

    if (error || !data) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Error guardando certificado', error)
    }

    // El creador recibe grant completo: si el certificado pasa a modo
    // 'restricted' mas adelante, no pierde el acceso.
    if (createdBy) {
      try {
        await this.permissions.upsertGrant({
          certificateId: data.id,
          companyId,
          userId: createdBy,
          canView: true,
          canUse: true,
          canManage: true,
          grantedBy: createdBy,
        })
      } catch (grantError) {
        console.error('[CertificateVault] No se pudo crear el grant del creador:', grantError)
      }
    }

    await this.audit.log({
      companyId,
      eventType: 'certificate_stored',
      actorUserId: createdBy,
      metadata: {
        certificateId: data.id,
        alias,
        holderNif: parsed.holderNif,
        issuer: parsed.issuer,
        validTo: parsed.validTo,
        source: source || 'manual_upload',
      },
    })

    return rowToMetadata(data)
  }

  async useCertificate(
    companyId: string,
    certificateId: string,
    purpose: string,
    actorUserId?: string,
  ): Promise<DecryptedCertificate> {
    const { data, error } = await this.supabase
      .from('administrative_certificates')
      .select(
        'id, holder_nif, status, revoked_at, valid_to, encrypted_pfx, encrypted_password, access_mode, created_by',
      )
      .eq('id', certificateId)
      .eq('company_id', companyId)
      .single()

    if (error || !data) {
      throw new AdminIntegrationError('CERTIFICATE_NOT_FOUND', 'Certificado no encontrado')
    }
    if (data.status !== 'active' || data.revoked_at) {
      throw new AdminIntegrationError('CERTIFICATE_NOT_FOUND', 'Certificado inactivo o revocado')
    }
    if (!data.encrypted_pfx || !data.encrypted_password) {
      throw new AdminIntegrationError('CERTIFICATE_NOT_FOUND', 'Certificado sin material criptografico')
    }

    // Permisos por usuario: en modo 'restricted' se exige grant de uso.
    const allowed = await this.permissions.checkAccess(
      { id: data.id, accessMode: data.access_mode, createdBy: data.created_by },
      actorUserId,
      'use',
    )
    if (!allowed) {
      await this.audit.log({
        companyId,
        eventType: 'certificate_use_denied',
        actorUserId,
        metadata: { certificateId, purpose, reason: 'sin permiso de uso' },
      })
      throw new AdminIntegrationError('UNAUTHORIZED', 'No tienes permiso para usar este certificado')
    }

    // Fail-closed (control eIDAS): sin traza de auditoria no se descifra la clave.
    await this.audit.logStrict({
      companyId,
      eventType: 'certificate_used',
      actorUserId,
      metadata: { certificateId, purpose, actor: actorUserId ? 'user' : 'system' },
    })

    const secret = this.getSecret()
    const pfx = decryptBuffer(bytesFromDb(data.encrypted_pfx), secret)
    const password = decryptBuffer(bytesFromDb(data.encrypted_password), secret).toString('utf8')

    return { certificateId: data.id, holderNif: data.holder_nif, pfx, password }
  }

  async listCertificates(companyId: string, viewerUserId?: string): Promise<CertificateMetadata[]> {
    const { data, error } = await this.supabase
      .from('administrative_certificates')
      .select(LIST_COLUMNS)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (error) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Error listando certificados', error)
    }

    const certs = (data || []).map(rowToMetadata)
    return filterViewableCertificates(this.permissions, certs, viewerUserId)
  }

  async listAccountCompanies(loggedInCompanyId: string): Promise<AccountCompany[]> {
    const { data: self, error } = await this.supabase
      .from('companies')
      .select('company_id, company, company_short, cif, agency_id')
      .eq('company_id', loggedInCompanyId)
      .single()

    if (error || !self) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Empresa no encontrada', error)
    }

    const mapRow = (row: Record<string, unknown>): AccountCompany => ({
      companyId: row.company_id as string,
      name: String(row.company_short || row.company || ''),
      cif: (row.cif as string | null) ?? null,
    })

    const selfRow = self as Record<string, unknown>
    const agencyId = selfRow.agency_id as string | null | undefined

    const { data: directClients, error: clientsError } = await this.supabase
      .from('companies')
      .select('company_id, company, company_short, cif')
      .eq('agency_id', loggedInCompanyId)
      .order('company')

    if (clientsError) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Error listando cartera de empresas', clientsError)
    }

    let portfolioRows: Record<string, unknown>[] = [...(directClients || [])]

    if (agencyId) {
      const { data: siblings, error: siblingsError } = await this.supabase
        .from('companies')
        .select('company_id, company, company_short, cif')
        .eq('agency_id', agencyId)
        .neq('company_id', loggedInCompanyId)
        .order('company')

      if (siblingsError) {
        throw new AdminIntegrationError('PROCESSING_ERROR', 'Error listando empresas de la gestoría', siblingsError)
      }

      const seen = new Set(portfolioRows.map((r) => r.company_id as string))
      for (const row of siblings || []) {
        const id = (row as { company_id: string }).company_id
        if (!seen.has(id)) {
          portfolioRows.push(row as Record<string, unknown>)
          seen.add(id)
        }
      }
    }

    return [mapRow(selfRow), ...portfolioRows.map((r) => mapRow(r))]
  }

  private async findCompanyIdByClassificationNifs(nifs: string[]): Promise<string | null> {
    if (!nifs.length) return null
    const { data: companies, error } = await this.supabase
      .from('companies')
      .select('company_id, cif')
      .not('cif', 'is', null)

    if (error || !companies?.length) return null

    const wanted = new Set(nifs)
    for (const row of companies) {
      const cif = normalizeCif((row as { cif?: string }).cif)
      if (cif && wanted.has(cif)) return (row as { company_id: string }).company_id
    }
    return null
  }

  async listAgencyCertificates(
    agencyCompanyId: string,
    viewerUserId?: string,
  ): Promise<CertificateMetadata[]> {
    // Empresas gestionadas por la agencia + la propia agencia.
    const { data: companies, error: companiesError } = await this.supabase
      .from('companies')
      .select('company_id')
      .eq('agency_id', agencyCompanyId)

    if (companiesError) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Error listando empresas de la cartera', companiesError)
    }

    const companyIds = [agencyCompanyId, ...(companies || []).map((c: any) => c.company_id)]

    const { data, error } = await this.supabase
      .from('administrative_certificates')
      .select(LIST_COLUMNS)
      .in('company_id', companyIds)
      .order('valid_to', { ascending: true })

    if (error) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Error listando certificados de la cartera', error)
    }

    // Mapa de nombres de empresa para mostrar en la vista de cartera.
    const { data: names } = await this.supabase
      .from('companies')
      .select('company_id, company, company_short')
      .in('company_id', companyIds)

    const nameById = new Map<string, string>()
    for (const row of names || []) {
      nameById.set((row as any).company_id, (row as any).company_short || (row as any).company || '')
    }

    const linkedIds = Array.from(
      new Set((data || []).map((row) => (row as { linked_company_id?: string }).linked_company_id).filter(Boolean)),
    ) as string[]
    if (linkedIds.length) {
      const { data: linkedNames } = await this.supabase
        .from('companies')
        .select('company_id, company, company_short')
        .in('company_id', linkedIds)
      for (const row of linkedNames || []) {
        nameById.set((row as any).company_id, (row as any).company_short || (row as any).company || '')
      }
    }

    const certs = (data || []).map((row) => {
      const meta = rowToMetadata(row)
      meta.companyName =
        (meta.linkedCompanyId ? nameById.get(meta.linkedCompanyId) : null) ??
        nameById.get(meta.companyId || '') ??
        null
      return meta
    })
    return filterViewableCertificates(this.permissions, certs, viewerUserId)
  }

  async revokeCertificate(companyId: string, certificateId: string, actorUserId?: string): Promise<void> {
    const subject = await this.getAccessSubject(companyId, certificateId)
    await this.permissions.assertAccess(subject, actorUserId, 'manage')

    const { data, error } = await this.supabase
      .from('administrative_certificates')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        // Borrado seguro del material criptografico al revocar.
        encrypted_pfx: null,
        encrypted_password: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', certificateId)
      .eq('company_id', companyId)
      .select('id')
      .maybeSingle()

    if (error) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Error revocando certificado', error)
    }
    if (!data) {
      throw new AdminIntegrationError('CERTIFICATE_NOT_FOUND', 'Certificado no encontrado')
    }

    await this.audit.log({
      companyId,
      eventType: 'certificate_revoked',
      actorUserId,
      metadata: { certificateId },
    })
  }

  async setExpiryNotificationsEnabled(
    companyId: string,
    certificateId: string,
    enabled: boolean,
    actorUserId?: string,
  ): Promise<void> {
    const subject = await this.getAccessSubject(companyId, certificateId)
    await this.permissions.assertAccess(subject, actorUserId, 'manage')

    const { data, error } = await this.supabase
      .from('administrative_certificates')
      .update({
        expiry_notifications_enabled: enabled,
        updated_at: new Date().toISOString(),
      })
      .eq('id', certificateId)
      .eq('company_id', companyId)
      .select('id')
      .maybeSingle()

    if (error) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Error actualizando avisos de caducidad', error)
    }
    if (!data) {
      throw new AdminIntegrationError('CERTIFICATE_NOT_FOUND', 'Certificado no encontrado')
    }

    await this.audit.log({
      companyId,
      eventType: 'certificate_expiry_notifications_toggled',
      actorUserId,
      metadata: { certificateId, enabled },
    })
  }

  async setExpiryNotificationSettings(
    companyId: string,
    certificateId: string,
    settings: { enabled: boolean; milestones: number[] },
    actorUserId?: string,
  ): Promise<void> {
    const subject = await this.getAccessSubject(companyId, certificateId)
    await this.permissions.assertAccess(subject, actorUserId, 'manage')

    const milestones = normalizeExpiryMilestones(settings.milestones)
    const { data, error } = await this.supabase
      .from('administrative_certificates')
      .update({
        expiry_notifications_enabled: settings.enabled,
        expiry_notification_milestones: milestones,
        updated_at: new Date().toISOString(),
      })
      .eq('id', certificateId)
      .eq('company_id', companyId)
      .select('id')
      .maybeSingle()

    if (error) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Error actualizando avisos de caducidad', error)
    }
    if (!data) {
      throw new AdminIntegrationError('CERTIFICATE_NOT_FOUND', 'Certificado no encontrado')
    }

    await this.audit.log({
      companyId,
      eventType: 'certificate_expiry_notifications_toggled',
      actorUserId,
      metadata: { certificateId, enabled: settings.enabled, milestones },
    })
  }

  async setPortfolioScope(
    companyId: string,
    certificateId: string,
    scope: PortfolioScope,
    loggedInCompanyId: string,
    actorUserId?: string,
  ): Promise<void> {
    const subject = await this.getAccessSubject(companyId, certificateId)
    await this.permissions.assertAccess(subject, actorUserId, 'manage')

    const { data: cert, error: readError } = await this.supabase
      .from('administrative_certificates')
      .select('id, holder_nif, holder_name')
      .eq('id', certificateId)
      .eq('company_id', companyId)
      .maybeSingle()

    if (readError) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Error leyendo certificado', readError)
    }
    if (!cert) {
      throw new AdminIntegrationError('CERTIFICATE_NOT_FOUND', 'Certificado no encontrado')
    }

    let linkedCompanyId: string | null = loggedInCompanyId
    if (scope === 'portfolio') {
      const accountCompanies = await this.listAccountCompanies(loggedInCompanyId)
      const nifs = extractClassificationNifs(
        (cert as { holder_nif?: string }).holder_nif,
        (cert as { holder_name?: string }).holder_name,
      )
      const guessed =
        guessLinkedCompanyForPortfolio(nifs, accountCompanies, loggedInCompanyId) ??
        null
      linkedCompanyId =
        guessed?.companyId ??
        (await this.findCompanyIdByClassificationNifs(nifs))
    }

    const { data, error } = await this.supabase
      .from('administrative_certificates')
      .update({
        portfolio_scope: scope,
        linked_company_id: linkedCompanyId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', certificateId)
      .eq('company_id', companyId)
      .select('id')
      .maybeSingle()

    if (error) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Error clasificando certificado', error)
    }
    if (!data) {
      throw new AdminIntegrationError('CERTIFICATE_NOT_FOUND', 'Certificado no encontrado')
    }

    await this.audit.log({
      companyId,
      eventType: 'certificate_portfolio_scope_set',
      actorUserId,
      metadata: { certificateId, scope, linkedCompanyId },
    })
  }

  async setAccessMode(
    companyId: string,
    certificateId: string,
    accessMode: CertAccessMode,
    actorUserId?: string,
  ): Promise<void> {
    const subject = await this.getAccessSubject(companyId, certificateId)
    await this.permissions.assertAccess(subject, actorUserId, 'manage')

    // Quien restringe el certificado conserva acceso completo.
    if (accessMode === 'restricted' && actorUserId) {
      await this.permissions.upsertGrant({
        certificateId,
        companyId,
        userId: actorUserId,
        canView: true,
        canUse: true,
        canManage: true,
        grantedBy: actorUserId,
      })
    }

    const { data, error } = await this.supabase
      .from('administrative_certificates')
      .update({ access_mode: accessMode, updated_at: new Date().toISOString() })
      .eq('id', certificateId)
      .eq('company_id', companyId)
      .select('id')
      .maybeSingle()

    if (error) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Error cambiando el modo de acceso', error)
    }
    if (!data) {
      throw new AdminIntegrationError('CERTIFICATE_NOT_FOUND', 'Certificado no encontrado')
    }

    await this.audit.log({
      companyId,
      eventType: 'certificate_access_mode_set',
      actorUserId,
      metadata: { certificateId, accessMode },
    })
  }

  async findRenewalCandidate(
    companyId: string,
    newCertificateId: string,
  ): Promise<CertificateMetadata | null> {
    const { data: newCert, error } = await this.supabase
      .from('administrative_certificates')
      .select('id, holder_nif, serial_number')
      .eq('id', newCertificateId)
      .eq('company_id', companyId)
      .maybeSingle()

    if (error || !newCert?.holder_nif) return null

    const { data: candidates } = await this.supabase
      .from('administrative_certificates')
      .select(LIST_COLUMNS)
      .eq('company_id', companyId)
      .eq('holder_nif', newCert.holder_nif)
      .neq('id', newCertificateId)
      .is('revoked_at', null)
      .order('valid_to', { ascending: false })
      .limit(1)

    const candidate = candidates?.[0]
    if (!candidate) return null
    // Mismo numero de serie = mismo certificado re-subido, no una renovacion.
    if (
      candidate.serial_number &&
      newCert.serial_number &&
      candidate.serial_number === newCert.serial_number
    ) {
      return null
    }
    return rowToMetadata(candidate)
  }

  async replaceCertificate(
    companyId: string,
    newCertificateId: string,
    oldCertificateId: string,
    actorUserId?: string,
  ): Promise<void> {
    const oldSubject = await this.getAccessSubject(companyId, oldCertificateId)
    await this.permissions.assertAccess(oldSubject, actorUserId, 'manage')

    const { data: oldCert, error } = await this.supabase
      .from('administrative_certificates')
      .select(
        'id, alias, portfolio_scope, linked_company_id, access_mode, expiry_notifications_enabled, expiry_notification_milestones',
      )
      .eq('id', oldCertificateId)
      .eq('company_id', companyId)
      .maybeSingle()

    if (error || !oldCert) {
      throw new AdminIntegrationError('CERTIFICATE_NOT_FOUND', 'Certificado anterior no encontrado')
    }

    // El nuevo hereda alias, clasificacion, avisos y modo de acceso, y queda
    // enlazado a su predecesor (cadena de renovaciones navegable).
    const { error: updateError } = await this.supabase
      .from('administrative_certificates')
      .update({
        alias: oldCert.alias,
        portfolio_scope: oldCert.portfolio_scope,
        linked_company_id: oldCert.linked_company_id,
        access_mode: oldCert.access_mode || 'open',
        expiry_notifications_enabled: oldCert.expiry_notifications_enabled,
        expiry_notification_milestones: oldCert.expiry_notification_milestones,
        renewed_from_certificate_id: oldCertificateId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', newCertificateId)
      .eq('company_id', companyId)

    if (updateError) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Error heredando la configuracion', updateError)
    }

    // Copiar los permisos por usuario del antiguo al nuevo.
    const grants = await this.permissions.listGrants(oldCertificateId)
    for (const grant of grants) {
      await this.permissions.upsertGrant({
        certificateId: newCertificateId,
        companyId,
        userId: grant.userId,
        canView: grant.canView,
        canUse: grant.canUse,
        canManage: grant.canManage,
        grantedBy: grant.grantedBy ?? actorUserId,
      })
    }

    // Archivar el anterior (revocado y con material criptografico eliminado).
    const { error: revokeError } = await this.supabase
      .from('administrative_certificates')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        encrypted_pfx: null,
        encrypted_password: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', oldCertificateId)
      .eq('company_id', companyId)

    if (revokeError) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Error archivando el certificado anterior', revokeError)
    }

    await this.audit.log({
      companyId,
      eventType: 'certificate_renewed',
      actorUserId,
      metadata: {
        certificateId: newCertificateId,
        replacedCertificateId: oldCertificateId,
        inheritedAlias: oldCert.alias,
      },
    })
  }
}

/** Alias de compatibilidad. */
export class EncryptedCertificateVault extends BaseCertificateVault {}

export function createCertificateVault(
  supabase: SupabaseClient,
  audit: AuditService,
): CertificateVault {
  return new BaseCertificateVault(supabase, audit)
}
