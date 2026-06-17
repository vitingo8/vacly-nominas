import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminConfig } from '../config'
import { AdminIntegrationError } from '../errors'
import type { AuditService } from '../audit/audit-service'

export interface CertificateMetadata {
  id: string
  alias: string
  holderNif: string
  validFrom?: string | null
  validTo?: string | null
  status: string
}

export interface CertificateVault {
  storeCertificate(
    companyId: string,
    alias: string,
    holderNif: string,
    pfx: Buffer,
    password: string,
    validFrom?: string,
    validTo?: string,
  ): Promise<CertificateMetadata>
  useCertificate(
    companyId: string,
    certificateId: string,
    purpose: string,
    actorUserId?: string,
  ): Promise<{ certificateId: string; holderNif: string }>
  listCertificates(companyId: string): Promise<CertificateMetadata[]>
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

export class MockCertificateVault implements CertificateVault {
  constructor(private supabase: SupabaseClient, private audit: AuditService) {}

  async storeCertificate(
    companyId: string,
    alias: string,
    holderNif: string,
    pfx: Buffer,
    password: string,
    validFrom?: string,
    validTo?: string,
  ): Promise<CertificateMetadata> {
    const config = getAdminConfig()
    const secret = config.encryptionKey || 'dev-mock-key-not-for-production!!'
    const encryptedPfx = encryptBuffer(pfx, secret)
    const encryptedPassword = encryptBuffer(Buffer.from(password, 'utf8'), secret)

    const { data, error } = await this.supabase
      .from('administrative_certificates')
      .insert({
        company_id: companyId,
        alias,
        holder_nif: holderNif,
        encrypted_pfx: encryptedPfx,
        encrypted_password: encryptedPassword,
        valid_from: validFrom ?? null,
        valid_to: validTo ?? null,
        status: 'active',
      })
      .select('id, alias, holder_nif, valid_from, valid_to, status')
      .single()

    if (error || !data) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Error guardando certificado', error)
    }

    await this.audit.log({
      companyId,
      eventType: 'certificate_stored',
      metadata: { certificateId: data.id, alias, holderNif },
    })

    return {
      id: data.id,
      alias: data.alias,
      holderNif: data.holder_nif,
      validFrom: data.valid_from,
      validTo: data.valid_to,
      status: data.status,
    }
  }

  async useCertificate(
    companyId: string,
    certificateId: string,
    purpose: string,
    actorUserId?: string,
  ): Promise<{ certificateId: string; holderNif: string }> {
    const { data, error } = await this.supabase
      .from('administrative_certificates')
      .select('id, holder_nif, status')
      .eq('id', certificateId)
      .eq('company_id', companyId)
      .single()

    if (error || !data) {
      throw new AdminIntegrationError('CERTIFICATE_NOT_FOUND', 'Certificado no encontrado')
    }
    if (data.status !== 'active') {
      throw new AdminIntegrationError('CERTIFICATE_NOT_FOUND', 'Certificado inactivo')
    }

    await this.audit.log({
      companyId,
      eventType: 'certificate_used',
      actorUserId,
      metadata: { certificateId, purpose },
    })

    return { certificateId: data.id, holderNif: data.holder_nif }
  }

  async listCertificates(companyId: string): Promise<CertificateMetadata[]> {
    const { data, error } = await this.supabase
      .from('administrative_certificates')
      .select('id, alias, holder_nif, valid_from, valid_to, status')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (error) {
      throw new AdminIntegrationError('PROCESSING_ERROR', 'Error listando certificados', error)
    }

    return (data || []).map((row) => ({
      id: row.id,
      alias: row.alias,
      holderNif: row.holder_nif,
      validFrom: row.valid_from,
      validTo: row.valid_to,
      status: row.status,
    }))
  }
}

export class EncryptedCertificateVault extends MockCertificateVault {
  async storeCertificate(
    companyId: string,
    alias: string,
    holderNif: string,
    pfx: Buffer,
    password: string,
    validFrom?: string,
    validTo?: string,
  ): Promise<CertificateMetadata> {
    const config = getAdminConfig()
    if (!config.encryptionKey || config.encryptionKey.length < 32) {
      throw new AdminIntegrationError(
        'PROCESSING_ERROR',
        'ADMIN_ENCRYPTION_KEY requerida en producción (mín. 32 caracteres)',
      )
    }
    return super.storeCertificate(companyId, alias, holderNif, pfx, password, validFrom, validTo)
  }
}

export function createCertificateVault(
  supabase: SupabaseClient,
  audit: AuditService,
): CertificateVault {
  const config = getAdminConfig()
  if (process.env.NODE_ENV === 'production' && config.encryptionKey) {
    return new EncryptedCertificateVault(supabase, audit)
  }
  return new MockCertificateVault(supabase, audit)
}
