import https from 'https'
import type { DecryptedCertificate } from '../../certificate-vault/certificate-vault-service'

export function createMtlsAgent(cert: Pick<DecryptedCertificate, 'pfx' | 'password'>): https.Agent {
  return new https.Agent({
    pfx: cert.pfx,
    passphrase: cert.password,
    rejectUnauthorized: true,
    keepAlive: true,
  })
}
