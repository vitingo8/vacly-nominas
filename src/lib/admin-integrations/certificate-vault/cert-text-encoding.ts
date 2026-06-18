/**
 * Corrige mojibake típico en DN de certificados (UTF-8 leído como Latin-1).
 * Ej.: "RepresentaciÃ³n" → "Representación"
 */
export function fixCertificateTextEncoding(value: string | null | undefined): string {
  if (!value) return ''
  if (!/[\u0080-\u00ff]/.test(value)) return value
  try {
    const decoded = Buffer.from(value, 'latin1').toString('utf8')
    return decoded.includes('\ufffd') ? value : decoded
  } catch {
    return value
  }
}

/** Emisor legible: CN del DN, con encoding corregido. */
export function formatCertIssuer(issuer: string | null | undefined): string {
  if (!issuer?.trim()) return '—'
  const fixed = fixCertificateTextEncoding(issuer.trim())
  const cnMatch = fixed.match(/(?:^|,\s*)CN=([^,]+)/i)
  if (cnMatch) return cnMatch[1].trim()
  const stripped = fixed.replace(/^CN=/i, '').split(',')[0]?.trim()
  return stripped || fixed
}
