import forge from 'node-forge'
import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AdminIntegrationError } from '../errors'
import { AuditService } from '../audit/audit-service'
import { createCertificateVault } from '../certificate-vault/certificate-vault-service'
import { extractSigningMaterial } from '../certificate-vault/pfx-parser'
import { TransactionService } from '../transaction-engine/transaction-service'
import type { AdminProvider } from '../types'

export type SignatureFormat = 'pkcs7-detached'

export interface SignResult {
  /** Firma PKCS#7 detached en base64 (DER). */
  signatureB64: string
  format: SignatureFormat
  algorithm: string
  /** Hash SHA-256 del contenido firmado (hex). */
  contentSha256: string
  signedAt: string
}

/**
 * Produce una firma PKCS#7 detached del contenido con la clave/certificado indicados.
 */
export function signContent(
  material: { privateKeyPem: string; certificatePem: string },
  content: Buffer,
): SignResult {
  const contentSha256 = createHash('sha256').update(content).digest('hex')
  const signedAt = new Date().toISOString()

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
    p7.sign({ detached: true })

    const der = forge.asn1.toDer(p7.toAsn1()).getBytes()
    const signatureB64 = forge.util.encode64(der)

    return {
      signatureB64,
      format: 'pkcs7-detached',
      algorithm: 'RSA-SHA256',
      contentSha256,
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

export async function signSubmission(
  supabase: SupabaseClient,
  input: SignSubmissionInput,
): Promise<SignSubmissionResult> {
  const audit = new AuditService(supabase)
  const vault = createCertificateVault(supabase, audit)
  const txService = new TransactionService(supabase)

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
      contentSha256: signature.contentSha256,
    },
  })

  return { ...signature, transactionId: tx.id, certificateId: input.certificateId }
}
