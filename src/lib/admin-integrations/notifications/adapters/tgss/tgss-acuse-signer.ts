import forge from 'node-forge'
import { createHash } from 'crypto'
import { AdminIntegrationError } from '../../../errors'
import { extractSigningMaterial } from '../../../certificate-vault/pfx-parser'

const DS_NS = 'http://www.w3.org/2000/09/xmldsig#'

function sha1Base64(input: string): string {
  return createHash('sha1').update(input, 'utf8').digest('base64')
}

function certBase64FromPem(certPem: string): string {
  return certPem.replace(/-----BEGIN CERTIFICATE-----/g, '').replace(/-----END CERTIFICATE-----/g, '').replace(/\s+/g, '')
}

/**
 * Firma el XML de acuse devuelto por solicitarAcuseNotificacion (nodo ProsaSignatureData)
 * con el certificado del usuario, según WSCN API 2.1.3.
 */
export function signTgssAcuseXml(xml: string, pfx: Buffer, password: string): string {
  const { privateKeyPem, certificatePem } = extractSigningMaterial(pfx, password)
  const certB64 = certBase64FromPem(certificatePem)

  const dataMatch = xml.match(
    /<ProsaSignatureData\b[^>]*\bid=["']ProsaData["'][^>]*>[\s\S]*?<\/ProsaSignatureData>/i,
  )
  if (!dataMatch) {
    throw new AdminIntegrationError('PROCESSING_ERROR', 'XML de acuse TGSS sin nodo ProsaSignatureData')
  }

  let unsigned = xml.replace(/<ds:Signature[\s\S]*?<\/ds:Signature>/gi, '').trim()
  if (!unsigned.includes('ProsaSignatureData')) {
    throw new AdminIntegrationError('PROCESSING_ERROR', 'XML de acuse TGSS inválido')
  }

  const signatureId = `Signature-${forge.util.bytesToHex(forge.random.getBytesSync(4))}`
  const keyInfoId = `${signatureId}-KeyInfo`
  const prosaData = dataMatch[0]
  const prosaDigest = sha1Base64(prosaData)

  const keyInfo = `<ds:KeyInfo Id="${keyInfoId}" xmlns:ds="${DS_NS}">
  <ds:X509Data>
    <ds:X509Certificate>${certB64}</ds:X509Certificate>
  </ds:X509Data>
</ds:KeyInfo>`
  const keyInfoDigest = sha1Base64(keyInfo)

  const signedInfo = `<ds:SignedInfo xmlns:ds="${DS_NS}">
  <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
  <ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
  <ds:Reference URI="#ProsaData">
    <ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
    <ds:DigestValue>${prosaDigest}</ds:DigestValue>
  </ds:Reference>
  <ds:Reference URI="#${keyInfoId}">
    <ds:Transforms>
      <ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
    </ds:Transforms>
    <ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
    <ds:DigestValue>${keyInfoDigest}</ds:DigestValue>
  </ds:Reference>
</ds:SignedInfo>`

  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem)
  const md = forge.md.sha1.create()
  md.update(signedInfo, 'utf8')
  const signatureValue = forge.util.encode64(privateKey.sign(md))

  const signatureBlock = `<ds:Signature Id="${signatureId}" xmlns:ds="${DS_NS}">
  ${signedInfo}
  <ds:SignatureValue>${signatureValue}</ds:SignatureValue>
  ${keyInfo}
</ds:Signature>`

  if (/<\/ProsaSignature>/i.test(unsigned)) {
    return unsigned.replace(/<\/ProsaSignature>/i, `${signatureBlock}</ProsaSignature>`)
  }

  return `${unsigned}${signatureBlock}`
}
