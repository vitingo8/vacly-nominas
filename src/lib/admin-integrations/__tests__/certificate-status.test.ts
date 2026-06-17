import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { deriveCertificateStatus } from '../certificate-vault/certificate-vault-service'

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString()
}

describe('deriveCertificateStatus', () => {
  it('revoked takes precedence over dates', () => {
    const { status } = deriveCertificateStatus(daysFromNow(100), new Date().toISOString())
    assert.equal(status, 'revoked')
  })

  it('expired when valid_to is in the past', () => {
    const { status, daysToExpiry } = deriveCertificateStatus(daysFromNow(-1), null)
    assert.equal(status, 'expired')
    assert.ok(daysToExpiry !== null && daysToExpiry < 0)
  })

  it('expiring_soon within 30 days', () => {
    const { status } = deriveCertificateStatus(daysFromNow(10), null)
    assert.equal(status, 'expiring_soon')
  })

  it('valid when far from expiry', () => {
    const { status } = deriveCertificateStatus(daysFromNow(200), null)
    assert.equal(status, 'valid')
  })

  it('valid when no expiry date', () => {
    const { status, daysToExpiry } = deriveCertificateStatus(null, null)
    assert.equal(status, 'valid')
    assert.equal(daysToExpiry, null)
  })
})
