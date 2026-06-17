import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { matchesCertSearch, parseCertSubject } from '../certificate-vault/cert-subject-parser'

describe('parseCertSubject', () => {
  it('extracts NIF from FNMT-style subject', () => {
    const parsed = parseCertSubject(
      'CN=APELLIDOS NOMBRE - 12345678Z, SERIALNUMBER=IDCES-12345678Z, O=MI EMPRESA SL',
    )
    assert.equal(parsed.nif, '12345678Z')
    assert.equal(parsed.organization, 'MI EMPRESA SL')
    assert.ok(parsed.searchBlob.includes('12345678z'))
  })

  it('filters by DNI and company', () => {
    const parsed = parseCertSubject('CN=JUAN GARCIA - 11111111H, O=ACME SA')
    assert.equal(matchesCertSearch(parsed, 'AC FNMT', '11111111H'), true)
    assert.equal(matchesCertSearch(parsed, 'AC FNMT', 'ACME'), true)
    assert.equal(matchesCertSearch(parsed, 'AC FNMT', '99999999Z'), false)
  })
})
