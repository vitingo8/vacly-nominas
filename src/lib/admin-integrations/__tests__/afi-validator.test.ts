import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateAfiPayload } from '../tgss-red/afi-validator'
import type { AfiAffiliationPayload } from '../tgss-red/afi-types'

const validPayload: AfiAffiliationPayload = {
  requestType: 'alta',
  nss: '123456789012',
  ipf: '12345678Z',
  ccc: '12345678901',
  fechaReal: '2026-01-15',
  fechaEfecto: '2026-01-15',
}

describe('validateAfiPayload', () => {
  it('accepts valid payload', () => {
    const result = validateAfiPayload(validPayload)
    assert.equal(result.valid, true)
    assert.equal(result.errors.length, 0)
  })

  it('rejects invalid nss', () => {
    const result = validateAfiPayload({ ...validPayload, nss: '123' })
    assert.equal(result.valid, false)
    assert.ok(result.errors.some((e) => e.field === 'nss'))
  })

  it('rejects invalid ccc', () => {
    const result = validateAfiPayload({ ...validPayload, ccc: 'abc' })
    assert.equal(result.valid, false)
  })

  it('rejects missing dates', () => {
    const result = validateAfiPayload({ ...validPayload, fechaReal: '' })
    assert.equal(result.valid, false)
  })
})
