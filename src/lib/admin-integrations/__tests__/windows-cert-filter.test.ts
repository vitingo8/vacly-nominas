import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isWindowsSystemCertificate } from '../certificate-vault/windows-cert-filter'

describe('windows-cert-filter', () => {
  it('excludes Microsoft Your Phone', () => {
    assert.equal(
      isWindowsSystemCertificate({
        subject: 'CN=Microsoft Your Phone',
        issuer: 'CN=Microsoft Your Phone',
      }),
      true,
    )
  })

  it('excludes Cross Device and MS-Organization-Access', () => {
    assert.equal(
      isWindowsSystemCertificate({
        subject: 'CN=Cross Device',
        issuer: 'CN=Microsoft',
      }),
      true,
    )
    assert.equal(
      isWindowsSystemCertificate({
        subject: 'CN=MS-Organization-Access',
        issuer: 'CN=Microsoft Azure Federated SSO Certificate',
      }),
      true,
    )
  })

  it('keeps real Spanish ID certs', () => {
    assert.equal(
      isWindowsSystemCertificate({
        subject: 'CN=APELLIDO NOMBRE - 12345678Z, SERIALNUMBER=IDCES-12345678Z',
        issuer: 'CN=AC Representación, O=AC Camerfirma',
        friendlyName: 'Certificado FNMT',
      }),
      false,
    )
  })
})
