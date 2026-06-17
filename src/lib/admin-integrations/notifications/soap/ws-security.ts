import forge from 'node-forge'
import { createHash } from 'crypto'
import { extractSigningMaterial } from '../../certificate-vault/pfx-parser'

const WSSE_NS = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd'
const WSU_NS = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd'
const DS_NS = 'http://www.w3.org/2000/09/xmldsig#'

function sha1Base64(input: string): string {
  return createHash('sha1').update(input, 'utf8').digest('base64')
}

function certBase64FromPem(certPem: string): string {
  return certPem.replace(/-----BEGIN CERTIFICATE-----/g, '').replace(/-----END CERTIFICATE-----/g, '').replace(/\s+/g, '')
}

/**
 * Envelope SOAP con WS-Security (BinarySecurityToken + firma del Body) para DEHú/LEMA.
 */
export function buildWsSecurityEnvelope(
  bodyInnerXml: string,
  pfx: Buffer,
  password: string,
): string {
  const { privateKeyPem, certificatePem } = extractSigningMaterial(pfx, password)
  const bodyId = `id-${forge.util.bytesToHex(forge.random.getBytesSync(8))}`
  const tokenId = `Cert-${forge.util.bytesToHex(forge.random.getBytesSync(4))}`
  const certB64 = certBase64FromPem(certificatePem)

  const body = `<soapenv:Body xmlns:wsu="${WSU_NS}" wsu:Id="${bodyId}">${bodyInnerXml}</soapenv:Body>`
  const bodyDigest = sha1Base64(body)

  const signedInfo = `<ds:SignedInfo xmlns:ds="${DS_NS}">
  <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
  <ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
  <ds:Reference URI="#${bodyId}">
    <ds:Transforms>
      <ds:Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
    </ds:Transforms>
    <ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
    <ds:DigestValue>${bodyDigest}</ds:DigestValue>
  </ds:Reference>
</ds:SignedInfo>`

  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem)
  const md = forge.md.sha1.create()
  md.update(signedInfo, 'utf8')
  const signatureValue = forge.util.encode64(privateKey.sign(md))

  const header = `<wsse:Security xmlns:wsse="${WSSE_NS}" xmlns:wsu="${WSU_NS}" soapenv:mustUnderstand="1">
  <wsse:BinarySecurityToken EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary"
    ValueType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3"
    wsu:Id="${tokenId}">${certB64}</wsse:BinarySecurityToken>
  <ds:Signature xmlns:ds="${DS_NS}">
    ${signedInfo}
    <ds:SignatureValue>${signatureValue}</ds:SignatureValue>
    <ds:KeyInfo>
      <wsse:SecurityTokenReference>
        <wsse:Reference URI="#${tokenId}" ValueType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3"/>
      </wsse:SecurityTokenReference>
    </ds:KeyInfo>
  </ds:Signature>
</wsse:Security>`

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header>${header}</soapenv:Header>
  ${body}
</soapenv:Envelope>`
}
