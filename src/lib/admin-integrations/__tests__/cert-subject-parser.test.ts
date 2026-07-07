import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  certSerialsMatch,
  findVaultMatchForWindows,
  matchesCertSearch,
  parseCertSubject,
} from '../certificate-vault/cert-subject-parser'

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

describe('certificate matching', () => {
  it('matches serials when Windows byte order is reversed', () => {
    const vaultSerial = '5988800904372ba5688a010e444a5815'
    const windowsSerial = '15584a440e018a68a52b370409808859'
    assert.equal(certSerialsMatch(vaultSerial, windowsSerial), true)
  })

  it('prefers vault match by NIF when serial differs', () => {
    const vault = [
      {
        holderNif: 'B22657407',
        serialNumber: '5988800904372ba5688a010e444a5815',
        validTo: '2027-07-30',
        status: 'valid',
      },
    ]
    const win = {
      nif: 'B22657407',
      serialNumber: '15584a440e018a68a52b370409808859',
      notAfter: '2027-07-30T22:59:59.0000000+02:00',
    }
    const match = findVaultMatchForWindows(win, vault)
    assert.equal(match?.holderNif, 'B22657407')
  })
})
