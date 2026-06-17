import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminConfig } from '../config'
import { AdminIntegrationError } from '../errors'
import type { AuditService } from '../audit/audit-service'
import { parsePfx } from './pfx-parser'

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
}

export interface StoreCertificateInput {
  companyId: string
  alias: string
  pfx: Buffer
  password: string
  createdBy?: string
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
  listCertificates(companyId: string): Promise<CertificateMetadata[]>
  listAgencyCertificates(agencyCompanyId: string): Promise<CertificateMetadata[]>
  revokeCertificate(companyId: string, certificateId: string, actorUserId?: string): Promise<void>
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
  'id, company_id, alias, holder_nif, holder_name, issuer, serial_number, certificate_type, valid_from, valid_to, status, revoked_at'

function rowToMetadata(row: Record<string, any>): CertificateMetadata {
  const { status, daysToExpiry } = deriveCertificateStatus(row.valid_to, row.revoked_at)
  return {
    id: row.id,
    companyId: row.company_id,
    alias: row.alias,
    holderNif: row.holder_nif ?? null,
    holderName: row.holder_name ?? null,
    issuer: row.issuer ?? null,
    serialNumber: row.serial_number ?? null,
    certificateType: row.certificate_type ?? null,
    validFrom: row.valid_from ?? null,
    validTo: row.valid_to ?? null,
    rawStatus: row.status,
    status,
    daysToExpiry,
    revokedAt: row.revoked_at ?? null,
  }
}

export class BaseCertificateVault implements CertificateVault {
  constructor(
    protected supabase: SupabaseClient,
    protected audit: AuditService,
  ) {}

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
    const { companyId, alias, pfx, password, createdBy } = input

    // Valida la contrasena y extrae metadatos del propio certificado.
    const parsed = parsePfx(pfx, password)

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
      })
      .select(LIST_COLUMNS)
      .single()

    if (error || !data) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Error guardando certificado', error)
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
      .select('id, holder_nif, status, revoked_at, valid_to, encrypted_pfx, encrypted_password')
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

    const secret = this.getSecret()
    const pfx = decryptBuffer(bytesFromDb(data.encrypted_pfx), secret)
    const password = decryptBuffer(bytesFromDb(data.encrypted_password), secret).toString('utf8')

    await this.audit.log({
      companyId,
      eventType: 'certificate_used',
      actorUserId,
      metadata: { certificateId, purpose },
    })

    return { certificateId: data.id, holderNif: data.holder_nif, pfx, password }
  }

  async listCertificates(companyId: string): Promise<CertificateMetadata[]> {
    const { data, error } = await this.supabase
      .from('administrative_certificates')
      .select(LIST_COLUMNS)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (error) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Error listando certificados', error)
    }

    return (data || []).map(rowToMetadata)
  }

  async listAgencyCertificates(agencyCompanyId: string): Promise<CertificateMetadata[]> {
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

    return (data || []).map((row) => {
      const meta = rowToMetadata(row)
      meta.companyName = nameById.get(meta.companyId || '') ?? null
      return meta
    })
  }

  async revokeCertificate(companyId: string, certificateId: string, actorUserId?: string): Promise<void> {
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
}

/** Alias de compatibilidad. */
export class EncryptedCertificateVault extends BaseCertificateVault {}

export function createCertificateVault(
  supabase: SupabaseClient,
  audit: AuditService,
): CertificateVault {
  return new BaseCertificateVault(supabase, audit)
}
