import forge from 'node-forge'
import { AdminIntegrationError } from '../errors'

export interface ParsedCertificate {
  /** NIF/CIF del titular extraido del subject (serialNumber o CN). */
  holderNif: string | null
  /** Nombre legible del titular (CN del subject). */
  holderName: string | null
  /** Emisor (CN del issuer, p. ej. AC FNMT Usuarios). */
  issuer: string | null
  /** Numero de serie del certificado (hex). */
  serialNumber: string | null
  /** Inicio de validez (ISO date). */
  validFrom: string
  /** Fin de validez (ISO date). */
  validTo: string
  /** Tipo aproximado: persona fisica, representante, sello, etc. */
  certificateType: string
}

const NIF_REGEX = /\b([0-9]{8}[A-Z]|[XYZ][0-9]{7}[A-Z]|[A-Z][0-9]{7}[0-9A-J])\b/

/**
 * node-forge devuelve los textos (UTF8String) como cadena "binaria" latin1,
 * por lo que "ó" (UTF-8 0xC3 0xB3) aparece como "Ã³". Se reinterpretan los
 * bytes latin1 como UTF-8 para recuperar el texto original.
 */
function decodeForgeString(value: string): string {
  // Solo hace falta corregir si hay bytes altos (no ASCII).
  if (!/[\u0080-\u00ff]/.test(value)) return value
  try {
    const decoded = Buffer.from(value, 'latin1').toString('utf8')
    // Si la decodificación produce U+FFFD no era UTF-8 válido: conservar original.
    return decoded.includes('\ufffd') ? value : decoded
  } catch {
    return value
  }
}

/** Localiza el primer atributo de un campo X.509 (subject/issuer) por shortName o name. */
function getAttr(
  field: forge.pki.Certificate['subject'] | forge.pki.Certificate['issuer'],
  names: string[],
): string | null {
  for (const name of names) {
    const attr = field.getField(name)
    if (attr?.value) return decodeForgeString(String(attr.value))
  }
  return null
}

/** Normaliza un NIF/CIF candidato (mayusculas, sin prefijos tipo IDCES-). */
function extractNif(value: string | null): string | null {
  if (!value) return null
  const upper = value.toUpperCase().replace(/\s/g, '')
  const cleaned = upper.replace(/^IDC?ES-?/, '')
  const match = cleaned.match(NIF_REGEX)
  return match ? match[1] : null
}

function classifyType(subjectCn: string | null, oids: string[]): string {
  const cn = (subjectCn || '').toUpperCase()
  if (oids.includes('2.5.4.97') || cn.includes('SELLO')) return 'sello_empresa'
  if (cn.includes('REPRESENTANTE')) return 'representante'
  return 'persona_fisica'
}

/**
 * Abre un PKCS#12 (.pfx/.p12) con su contrasena, validandola, y extrae los
 * metadatos del certificado de cliente. Lanza VALIDATION_ERROR si la
 * contrasena es incorrecta o el fichero no es un PKCS#12 valido.
 */
export function parsePfx(pfx: Buffer, password: string): ParsedCertificate {
  let p12: forge.pkcs12.Pkcs12Pfx
  try {
    const der = forge.util.createBuffer(pfx.toString('binary'))
    const asn1 = forge.asn1.fromDer(der)
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password)
  } catch {
    throw new AdminIntegrationError(
      'VALIDATION_ERROR',
      'No se pudo abrir el certificado: contrasena incorrecta o fichero no valido (.pfx/.p12).',
    )
  }

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []
  const cert = certBags
    .map((bag) => bag.cert)
    .filter((c): c is forge.pki.Certificate => Boolean(c))
    // El certificado de cliente es el primero no auto-firmado (issuer != subject).
    .sort((a, b) => {
      const aSelf = a.subject.hash === a.issuer.hash ? 1 : 0
      const bSelf = b.subject.hash === b.issuer.hash ? 1 : 0
      return aSelf - bSelf
    })[0]

  if (!cert) {
    throw new AdminIntegrationError(
      'VALIDATION_ERROR',
      'El fichero no contiene ningun certificado.',
    )
  }

  const subjectCn = getAttr(cert.subject, ['commonName', 'CN'])
  const subjectSerial = getAttr(cert.subject, ['serialNumber'])
  const issuerCn = getAttr(cert.issuer, ['commonName', 'CN', 'organizationName', 'O'])
  const oids = cert.subject.attributes.map((a) => a.type).filter(Boolean) as string[]

  const holderNif =
    extractNif(subjectSerial) ||
    extractNif(subjectCn) ||
    extractNif(getAttr(cert.subject, ['2.5.4.5']))

  return {
    holderNif,
    holderName: subjectCn,
    issuer: issuerCn,
    serialNumber: cert.serialNumber || null,
    validFrom: cert.validity.notBefore.toISOString(),
    validTo: cert.validity.notAfter.toISOString(),
    certificateType: classifyType(subjectCn, oids),
  }
}

export interface SigningMaterial {
  privateKeyPem: string
  certificatePem: string
  /** Cadena de certificacion (sin el de cliente), en PEM. */
  chainPem: string[]
}

/**
 * Extrae la clave privada y el certificado de cliente de un PKCS#12 para firmar.
 * El material vive solo en memoria; nunca debe persistirse descifrado.
 */
export function extractSigningMaterial(pfx: Buffer, password: string): SigningMaterial {
  let p12: forge.pkcs12.Pkcs12Pfx
  try {
    const der = forge.util.createBuffer(pfx.toString('binary'))
    const asn1 = forge.asn1.fromDer(der)
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password)
  } catch {
    throw new AdminIntegrationError(
      'VALIDATION_ERROR',
      'No se pudo abrir el certificado para firmar: contrasena incorrecta o fichero no valido.',
    )
  }

  const keyBagsArr = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
  ]
  const key = keyBagsArr.map((b) => b.key).find(Boolean)
  if (!key) {
    throw new AdminIntegrationError('VALIDATION_ERROR', 'El certificado no contiene una clave privada')
  }

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []
  const certs = certBags
    .map((bag) => bag.cert)
    .filter((c): c is forge.pki.Certificate => Boolean(c))

  const clientCert =
    certs.find((c) => c.subject.hash !== c.issuer.hash) || certs[0]
  if (!clientCert) {
    throw new AdminIntegrationError('VALIDATION_ERROR', 'El certificado no contiene certificado de cliente')
  }

  const chain = certs.filter((c) => c !== clientCert).map((c) => forge.pki.certificateToPem(c))

  return {
    privateKeyPem: forge.pki.privateKeyToPem(key),
    certificatePem: forge.pki.certificateToPem(clientCert),
    chainPem: chain,
  }
}
