import { parseCertSubject } from './cert-subject-parser'
import { fixCertificateTextEncoding } from './cert-text-encoding'
import { filterRealWindowsCertificates } from './windows-cert-filter'

/** Puerto por defecto del puente local Vacly (PowerShell en Windows). */
export const WINDOWS_CERT_BRIDGE_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_WINDOWS_CERT_BRIDGE_URL) ||
  'http://127.0.0.1:8765'

export interface WindowsCertificateEntry {
  thumbprint: string
  subject: string
  issuer: string
  notBefore: string
  notAfter: string
  friendlyName?: string
  serialNumber?: string
  /** Campos derivados del subject para búsqueda y UI. */
  displayName?: string
  nif?: string | null
  organization?: string | null
  organizationalUnit?: string | null
}

export function isWindowsClient(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    navigator.platform ||
    ''
  return /win/i.test(platform) || /Windows/i.test(ua)
}

function enrichWindowsCert(raw: WindowsCertificateEntry): WindowsCertificateEntry {
  const subject = fixCertificateTextEncoding(raw.subject)
  const issuer = fixCertificateTextEncoding(raw.issuer)
  const friendlyName = raw.friendlyName ? fixCertificateTextEncoding(raw.friendlyName) : raw.friendlyName
  const parsed = parseCertSubject(subject, friendlyName)
  return {
    ...raw,
    subject,
    issuer,
    friendlyName,
    serialNumber: raw.serialNumber || parsed.serialNumber || undefined,
    displayName: parsed.displayName,
    nif: parsed.nif,
    organization: parsed.organization,
    organizationalUnit: parsed.organizationalUnit,
  }
}

/** Comprueba si el puente local de certificados Windows está activo. */
export async function probeWindowsCertBridge(baseUrl = WINDOWS_CERT_BRIDGE_URL): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2500)
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/health`, {
      signal: controller.signal,
      mode: 'cors',
    })
    clearTimeout(timer)
    if (!res.ok) return false
    const data = await res.json()
    return Boolean(data?.ok)
  } catch {
    return false
  }
}

/** Lista certificados con clave privada del almacén Windows (CurrentUser\\My). */
export async function listWindowsCertificates(baseUrl = WINDOWS_CERT_BRIDGE_URL): Promise<WindowsCertificateEntry[]> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/certificates`, { mode: 'cors' })
  if (!res.ok) {
    throw new Error('No se pudo leer el almacén de certificados de Windows')
  }
  const data = await res.json()
  return filterRealWindowsCertificates(
    ((data?.certificates || []) as WindowsCertificateEntry[]).map(enrichWindowsCert),
  )
}

/** Exporta un certificado del almacén Windows a PKCS#12 (base64). */
export async function exportWindowsCertificate(
  thumbprint: string,
  password: string,
  baseUrl = WINDOWS_CERT_BRIDGE_URL,
): Promise<{ pfxBase64: string; fileName: string }> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/export`, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ thumbprint, password }),
  })
  const data = await res.json()
  if (!res.ok || !data?.pfxBase64) {
    throw new Error(data?.error || 'No se pudo exportar el certificado de Windows')
  }
  return { pfxBase64: data.pfxBase64, fileName: data.fileName || 'certificado.pfx' }
}

/** Instala un .pfx/.p12 en el almacén personal de Windows (CurrentUser\\My). */
export async function installWindowsCertificate(
  pfxBase64: string,
  password: string,
  friendlyName?: string,
  baseUrl = WINDOWS_CERT_BRIDGE_URL,
): Promise<{ thumbprint: string; alreadyInstalled?: boolean }> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/install`, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pfxBase64, password, friendlyName }),
  })
  const data = await res.json()
  if (!res.ok || !data?.thumbprint) {
    throw new Error(data?.error || 'No se pudo instalar el certificado en Windows')
  }
  return { thumbprint: data.thumbprint, alreadyInstalled: data.alreadyInstalled }
}

export function base64ToPfxFile(base64: string, fileName: string): File {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], fileName, { type: 'application/x-pkcs12' })
}

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}
