/**
 * Copia mínima de admin-integrations para la firma de presentaciones
 * (`/api/filing`, `/api/red`, `/api/sepa`).
 *
 * La copia canónica y completa (notificaciones, TGSS RED, transacciones,
 * puente Windows, certificaciones AEAT…) vive en `vacly-administrativo`.
 * Si cambias la firma aquí, sincroniza el cambio con esa app.
 */
export * from './types'
export * from './config'
export * from './errors'
export * from './state-machine'
export { TransactionService } from './transaction-engine/transaction-service'
export { AuditService } from './audit/audit-service'
export {
  createCertificateVault,
  deriveCertificateStatus,
  EXPIRING_SOON_DAYS,
  type CertificateVault,
  type CertificateMetadata,
  type CertificateStatus,
  type DecryptedCertificate,
  type StoreCertificateInput,
} from './certificate-vault/certificate-vault-service'
export {
  parsePfx,
  extractSigningMaterial,
  type ParsedCertificate,
  type SigningMaterial,
} from './certificate-vault/pfx-parser'
export {
  signContent,
  signSubmission,
  type SignResult,
  type SignSubmissionInput,
  type SignSubmissionResult,
} from './signing/signing-service'
