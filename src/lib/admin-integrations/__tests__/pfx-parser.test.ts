import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import forge from 'node-forge'
import { parsePfx, extractSigningMaterial } from '../certificate-vault/pfx-parser'
import { AdminIntegrationError } from '../errors'

const PASSWORD = 'test-pass-123'
const HOLDER_NIF = '12345678Z'

/** Genera un PKCS#12 auto-firmado en memoria para las pruebas. */
function buildPfx(): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(1024)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '0123456789ABCDEF'
  cert.validity.notBefore = new Date(Date.now() - 86400000)
  cert.validity.notAfter = new Date(Date.now() + 365 * 86400000)

  const attrs = [
    { name: 'commonName', value: `APELLIDO NOMBRE - ${HOLDER_NIF}` },
    { name: 'serialNumber', value: HOLDER_NIF },
    { name: 'organizationName', value: 'Empresa Test SL' },
  ]
  cert.setSubject(attrs)
  cert.setIssuer([{ name: 'commonName', value: 'AC FNMT Usuarios' }])
  cert.sign(keys.privateKey, forge.md.sha256.create())

  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], PASSWORD, {
    algorithm: '3des',
  })
  const der = forge.asn1.toDer(asn1).getBytes()
  return Buffer.from(der, 'binary')
}

describe('pfx-parser', () => {
  const pfx = buildPfx()

  it('extracts metadata with the correct password', () => {
    const parsed = parsePfx(pfx, PASSWORD)
    assert.equal(parsed.holderNif, HOLDER_NIF)
    assert.ok(parsed.holderName && parsed.holderName.includes('APELLIDO'))
    assert.ok(parsed.issuer && parsed.issuer.includes('FNMT'))
    assert.ok(new Date(parsed.validTo).getTime() > Date.now())
    assert.ok(new Date(parsed.validFrom).getTime() < Date.now())
  })

  it('throws VALIDATION_ERROR with a wrong password', () => {
    assert.throws(
      () => parsePfx(pfx, 'wrong-password'),
      (err: unknown) => err instanceof AdminIntegrationError && err.code === 'VALIDATION_ERROR',
    )
  })

  it('extracts signing material (private key + certificate)', () => {
    const material = extractSigningMaterial(pfx, PASSWORD)
    assert.ok(material.privateKeyPem.includes('PRIVATE KEY'))
    assert.ok(material.certificatePem.includes('CERTIFICATE'))
  })
})
