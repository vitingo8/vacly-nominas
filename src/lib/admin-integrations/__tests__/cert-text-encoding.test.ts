import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { fixCertificateTextEncoding, formatCertIssuer } from '../certificate-vault/cert-text-encoding'

describe('cert-text-encoding', () => {
  it('fixes UTF-8 mojibake from Latin-1 misread', () => {
    assert.equal(fixCertificateTextEncoding('RepresentaciÃ³n'), 'Representación')
    assert.equal(fixCertificateTextEncoding('AC Camerfirma'), 'AC Camerfirma')
  })

  it('extracts CN from issuer DN', () => {
    assert.equal(
      formatCertIssuer('CN=AC RepresentaciÃ³n, OU=PKI, O=AC Camerfirma'),
      'AC Representación',
    )
    assert.equal(formatCertIssuer('AC FNMT Usuarios'), 'AC FNMT Usuarios')
  })
})
