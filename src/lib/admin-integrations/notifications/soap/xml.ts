export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function stripXmlPrefix(tag: string): string {
  const idx = tag.indexOf(':')
  return idx >= 0 ? tag.slice(idx + 1) : tag
}

export function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function unwrapXmlTextContent(raw: string): string | null {
  let inner = raw.trim()
  const cdata = inner.match(/^<!\[CDATA\[([\s\S]*?)]]>$/i)
  if (cdata) inner = cdata[1].trim()
  if (!inner || inner.startsWith('<')) return null
  const text = decodeXmlEntities(inner).trim()
  return text || null
}

/** Extrae el texto del primer elemento con nombre local `tag` (ignora prefijo). */
export function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(
    `<(?:[A-Za-z0-9_.-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_.-]+:)?${tag}>`,
    'i',
  )
  const match = xml.match(re)
  if (!match) return null
  return unwrapXmlTextContent(match[1])
}

/** Extrae bloques XML completos del primer nivel para un tag local. */
export function extractBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(
    `<(?:[A-Za-z0-9_.-]+:)?${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/(?:[A-Za-z0-9_.-]+:)?${tag}>`,
    'gi',
  )
  return xml.match(re) || []
}

export function extractAllTags(xml: string, tag: string): string[] {
  const re = new RegExp(
    `<(?:[A-Za-z0-9_.-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_.-]+:)?${tag}>`,
    'gi',
  )
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const inner = unwrapXmlTextContent(m[1])
    if (inner) out.push(inner)
  }
  return out
}

export function formatAeatDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

export function parseIsoOrAeatDate(value: string | null | undefined): string {
  if (!value) return new Date().toISOString()
  const trimmed = value.trim()
  const aeat = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (aeat) {
    return new Date(`${aeat[3]}-${aeat[2]}-${aeat[1]}T00:00:00.000Z`).toISOString()
  }
  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
}

/** TGSS WSCN: dd-mm-yyyy hh:mm[:ss] */
export function parseTgssDatetime(value: string | null | undefined): string {
  if (!value) return new Date().toISOString()
  const trimmed = value.trim()
  const tgss = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (tgss) {
    const parsed = new Date(
      `${tgss[3]}-${tgss[2]}-${tgss[1]}T${tgss[4]}:${tgss[5]}:${tgss[6] || '00'}`,
    )
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  return parseIsoOrAeatDate(value)
}

export function decodeBase64Field(value: string | null | undefined): Buffer | undefined {
  if (!value?.trim()) return undefined
  try {
    return Buffer.from(value.replace(/\s+/g, ''), 'base64')
  } catch {
    return undefined
  }
}

export function normalizeNif(value: string | null | undefined): string | null {
  if (!value) return null
  const nif = value.replace(/[\s-]/g, '').toUpperCase()
  return nif.length === 9 ? nif : null
}

/** AEAT WS Envíos: éxito = "00" (doc oficial); aceptamos "0" por compatibilidad. */
export function isAeatSuccessCode(cod: string | null | undefined): boolean {
  if (!cod) return true
  return cod === '00' || cod === '0'
}
