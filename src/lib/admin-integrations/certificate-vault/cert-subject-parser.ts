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

/** Windows (.NET) devuelve el serial en orden de bytes invertido respecto a OpenSSL/forge. */
function reverseSerialBytes(hex: string): string {
  const pairs = hex.match(/.{1,2}/g)
  if (!pairs?.length) return hex
  return pairs.reverse().join('')
}

export function certSerialsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeCertSerial(a)
  const nb = normalizeCertSerial(b)
  if (!na || !nb) return false
  if (na === nb) return true
  return reverseSerialBytes(na) === nb || na === reverseSerialBytes(nb)
}

export function certExpiryDatesMatch(
  vaultDate?: string | null,
  windowsDate?: string | null,
): boolean {
  if (!vaultDate || !windowsDate) return true
  const a = new Date(vaultDate)
  const b = new Date(windowsDate)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return true
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

export interface VaultCertMatchFields {
  holderNif?: string | null
  serialNumber?: string | null
  validTo?: string | null
  status?: string
}

export interface WindowsCertMatchFields {
  serialNumber?: string
  nif?: string | null
  notAfter?: string
  thumbprint?: string
}

export function vaultCertMatchesWindows(
  vault: VaultCertMatchFields,
  win: WindowsCertMatchFields,
): boolean {
  if (vault.status === 'revoked') return false
  if (certSerialsMatch(vault.serialNumber, win.serialNumber)) return true
  const nif = vault.holderNif?.toUpperCase()
  const winNif = win.nif?.toUpperCase()
  if (!nif || !winNif || nif !== winNif) return false
  return certExpiryDatesMatch(vault.validTo, win.notAfter)
}

/** Empareja un certificado de Windows con su registro en la bóveda Vacly (Supabase). */
export function findVaultMatchForWindows<T extends VaultCertMatchFields>(
  win: WindowsCertMatchFields,
  vaultCerts: T[],
): T | undefined {
  const active = vaultCerts.filter((c) => c.status !== 'revoked')
  if (win.serialNumber) {
    const bySerial = active.find((c) => certSerialsMatch(c.serialNumber, win.serialNumber))
    if (bySerial) return bySerial
  }
  const winNif = win.nif?.toUpperCase()
  if (!winNif) return undefined
  const byNif = active.filter((c) => c.holderNif?.toUpperCase() === winNif)
  if (!byNif.length) return undefined
  if (byNif.length === 1) return byNif[0]
  const byDate = byNif.find((c) => certExpiryDatesMatch(c.validTo, win.notAfter))
  return byDate ?? byNif[0]
}

/** Empareja un certificado de la bóveda con su copia en el almacén de Windows. */
export function findWindowsMatchForVault<T extends WindowsCertMatchFields>(
  vault: VaultCertMatchFields,
  windowsCerts: T[],
): T | undefined {
  if (vault.status === 'revoked') return undefined
  if (vault.serialNumber) {
    const bySerial = windowsCerts.find((wc) => certSerialsMatch(vault.serialNumber, wc.serialNumber))
    if (bySerial) return bySerial
  }
  const nif = vault.holderNif?.toUpperCase()
  if (!nif) return undefined
  const byNif = windowsCerts.filter((wc) => wc.nif?.toUpperCase() === nif)
  if (!byNif.length) return undefined
  if (byNif.length === 1) return byNif[0]
  const byDate = byNif.find((wc) => certExpiryDatesMatch(vault.validTo, wc.notAfter))
  return byDate ?? byNif[0]
}

/** Coincide con DNI, nombre, empresa, emisor, etc. */
export function matchesCertSearch(parsed: ParsedCertSubject, issuer: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = `${parsed.searchBlob} ${issuer.toLowerCase()}`
  const tokens = q.split(/\s+/).filter(Boolean)
  return tokens.every((t) => haystack.includes(t))
}
