import forge from 'node-forge'
import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminConfig } from '../config'
import { AdminIntegrationError } from '../errors'
import { AuditService } from '../audit/audit-service'
import { createCertificateVault } from '../certificate-vault/certificate-vault-service'
import { extractSigningMaterial } from '../certificate-vault/pfx-parser'
import { TransactionService } from '../transaction-engine/transaction-service'
import type { AdminProvider } from '../types'

export type SignatureFormat = 'pkcs7-detached' | 'mock'

export interface SignResult {
  /** Firma en base64 (PKCS#7 detached DER, o firma simulada en modo mock). */
  signatureB64: string
  format: SignatureFormat
  algorithm: string
  /** Hash SHA-256 del contenido firmado (hex). */
  contentSha256: string
  mock: boolean
  signedAt: string
}

/** Modo de firma: por defecto mock salvo que AEAT_MODE != mock. */
function isMockMode(): boolean {
  return getAdminConfig().aeatMode === 'mock'
}

/**
 * Produce una firma PKCS#7 detached del contenido con la clave/certificado
 * indicados. En modo mock no usa el certificado real: genera una firma
 * deterministica para trazar el flujo sin material sensible.
 */
export function signContent(
  material: { privateKeyPem: string; certificatePem: string },
  content: Buffer,
  opts?: { forceMock?: boolean },
): SignResult {
  const contentSha256 = createHash('sha256').update(content).digest('hex')
  const signedAt = new Date().toISOString()
  const mock = opts?.forceMock ?? isMockMode()

  if (mock) {
    const sig = createHash('sha256').update(content).update('|mock-signature').digest('base64')
    return {
      signatureB64: sig,
      format: 'mock',
      algorithm: 'sha256-mock',
      contentSha256,
      mock: true,
      signedAt,
    }
  }

  try {
    const privateKey = forge.pki.privateKeyFromPem(material.privateKeyPem)
    const certificate = forge.pki.certificateFromPem(material.certificatePem)

    const p7 = forge.pkcs7.createSignedData()
    p7.content = forge.util.createBuffer(content.toString('binary'))
    p7.addCertificate(certificate)
    p7.addSigner({
      key: privateKey,
      certificate,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest },
        { type: forge.pki.oids.signingTime, value: signedAt },
      ],
    })
    // Detached: no se incluye el contenido en la estructura firmada.
    p7.sign({ detached: true })

    const der = forge.asn1.toDer(p7.toAsn1()).getBytes()
    const signatureB64 = forge.util.encode64(der)

    return {
      signatureB64,
      format: 'pkcs7-detached',
      algorithm: 'RSA-SHA256',
      contentSha256,
      mock: false,
      signedAt,
    }
  } catch (error) {
    throw new AdminIntegrationError('PROCESSING_ERROR', 'Error firmando el contenido', error)
  }
}

export interface SignSubmissionInput {
  companyId: string
  provider: AdminProvider
  procedureCode: string
  certificateId: string
  content: Buffer
  subjectType?: string
  subjectId?: string
  actorUserId?: string
}

export interface SignSubmissionResult extends SignResult {
  transactionId: string
  certificateId: string
}

/**
 * Orquesta la firma de una presentacion: descifra el certificado en memoria,
 * firma el contenido, registra una transaccion administrativa con el
 * certificate_id y deja traza en auditoria. Pensado para usarse desde las
 * rutas de filing/RED/SEPA cuando el llamante aporta un certificateId.
 */
export async function signSubmission(
  supabase: SupabaseClient,
  input: SignSubmissionInput,
): Promise<SignSubmissionResult> {
  const audit = new AuditService(supabase)
  const vault = createCertificateVault(supabase, audit)
  const txService = new TransactionService(supabase)

  // Descifra el PFX en memoria (audita certificate_used).
  const decrypted = await vault.useCertificate(
    input.companyId,
    input.certificateId,
    `sign:${input.provider}:${input.procedureCode}`,
    input.actorUserId,
  )

  const material = extractSigningMaterial(decrypted.pfx, decrypted.password)
  const signature = signContent(material, input.content)

  const tx = await txService.create({
    companyId: input.companyId,
    provider: input.provider,
    procedureCode: input.procedureCode,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    requestedBy: input.actorUserId,
    certificateId: input.certificateId,
  })

  // created -> validated -> file_generated (presentacion firmada lista).
  await txService.transition(tx.id, 'validated')
  await txService.transition(tx.id, 'file_generated')

  await audit.log({
    companyId: input.companyId,
    transactionId: tx.id,
    eventType: 'submission_signed',
    actorUserId: input.actorUserId,
    metadata: {
      provider: input.provider,
      procedureCode: input.procedureCode,
      certificateId: input.certificateId,
      format: signature.format,
      mock: signature.mock,
      contentSha256: signature.contentSha256,
    },
  })

  return { ...signature, transactionId: tx.id, certificateId: input.certificateId }
}
