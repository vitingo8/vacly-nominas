import { fixCertificateTextEncoding } from './cert-text-encoding'

/** NIF/CIF/NIE español en subject DN o CN. */
const NIF_REGEX = /\b([0-9]{8}[A-Z]|[XYZ][0-9]{7}[A-Z]|[A-Z][0-9]{7}[0-9A-J]|[A-HJ-NP-SUVW][0-9]{7}[0-9A-J])\b/i

export interface ParsedCertSubject {
  cn: string | null
  organization: string | null
  organizationalUnit: string | null
  serialNumber: string | null
  nif: string | null
  /** Texto combinado para búsqueda libre. */
  searchBlob: string
  displayName: string
}

function dnField(subject: string, key: string): string | null {
  const re = new RegExp(`(?:^|,\\s*)${key}=([^,]+)`, 'i')
  const m = subject.match(re)
  return m ? m[1].trim() : null
}

function extractNif(...candidates: (string | null | undefined)[]): string | null {
  for (const raw of candidates) {
    if (!raw) continue
    const upper = raw.toUpperCase().replace(/\s/g, '')
    const cleaned = upper.replace(/^IDC?ES-?/, '')
    const match = cleaned.match(NIF_REGEX)
    if (match) return match[1].toUpperCase()
  }
  return null
}

/** Parsea un subject DN de certificado (formato Windows / X.509). */
export function parseCertSubject(subject: string, friendlyName?: string | null): ParsedCertSubject {
  const normalizedSubject = fixCertificateTextEncoding(subject)
  const normalizedFriendly = friendlyName ? fixCertificateTextEncoding(friendlyName) : null
  const cn = dnField(normalizedSubject, 'CN')
  const organization = dnField(normalizedSubject, 'O')
  const organizationalUnit = dnField(normalizedSubject, 'OU')
  const serialNumberRaw = dnField(normalizedSubject, 'SERIALNUMBER') || dnField(normalizedSubject, 'SN')
  const nif = extractNif(serialNumberRaw, cn, organization)

  let displayName = normalizedFriendly?.trim() || cn || organization || 'Certificado'
  if (cn && cn.includes(' - ')) {
    const [namePart] = cn.split(' - ')
    if (namePart.trim()) displayName = namePart.trim()
  }

  const searchBlob = [displayName, cn, organization, organizationalUnit, serialNumberRaw, nif, normalizedFriendly, normalizedSubject]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return {
    cn,
    organization,
    organizationalUnit,
    serialNumber: serialNumberRaw,
    nif,
    searchBlob,
    displayName,
  }
}

export function normalizeCertSerial(value: string | null | undefined): string | null {
  if (!value) return null
  return value.replace(/[\s:]/g, '').toUpperCase()
}

/** Coincide con DNI, nombre, empresa, emisor, etc. */
export function matchesCertSearch(parsed: ParsedCertSubject, issuer: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = `${parsed.searchBlob} ${issuer.toLowerCase()}`
  const tokens = q.split(/\s+/).filter(Boolean)
  return tokens.every((t) => haystack.includes(t))
}
