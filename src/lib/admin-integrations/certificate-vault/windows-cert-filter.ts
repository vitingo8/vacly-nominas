import type { WindowsCertificateEntry } from './windows-cert-bridge'

/**
 * Patrones de certificados de sistema Windows / Microsoft que no son DNIe ni .pfx de trámites.
 * Se comparan contra subject, issuer y friendlyName (case-insensitive).
 */
const SYSTEM_CERT_PATTERNS: RegExp[] = [
  /your\s*phone/i,
  /microsoft\s+your\s+phone/i,
  /cross\s*device/i,
  /crossdevice/i,
  /ms-organization[-\s]?access/i,
  /ms-organitzation[-\s]?access/i,
  /windows\s+hello/i,
  /microsoft\s+intune/i,
  /azure\s*ad/i,
  /azuread/i,
  /microsoft\s+entra/i,
  /workplace\s+join/i,
  /deviceid-/i,
  /microsoft\s+account/i,
  /surface\s+access/i,
  /teams\s+device/i,
  /oauth\s*2/i,
  /^cn=.+@microsoft\.com$/i,
]

function certHaystack(cert: Pick<WindowsCertificateEntry, 'subject' | 'issuer' | 'friendlyName' | 'displayName'>): string {
  return [cert.subject, cert.issuer, cert.friendlyName, cert.displayName].filter(Boolean).join(' | ')
}

/** true si el certificado es interno de Windows/Microsoft y no debe mostrarse en Vacly. */
export function isWindowsSystemCertificate(
  cert: Pick<WindowsCertificateEntry, 'subject' | 'issuer' | 'friendlyName' | 'displayName'>,
): boolean {
  const haystack = certHaystack(cert)
  return SYSTEM_CERT_PATTERNS.some((re) => re.test(haystack))
}

export function filterRealWindowsCertificates(certs: WindowsCertificateEntry[]): WindowsCertificateEntry[] {
  return certs.filter((c) => !isWindowsSystemCertificate(c))
}
