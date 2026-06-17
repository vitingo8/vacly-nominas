import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseAfiResponse } from '../tgss-red/response-parser'

describe('parseAfiResponse', () => {
  it('detects accepted responses', () => {
    const parsed = parseAfiResponse('STATUS:OK\r\nPROCESADO CORRECTAMENTE', 'tx-1')
    assert.equal(parsed.normalizedStatus, 'accepted')
  })

  it('detects rejection', () => {
    const parsed = parseAfiResponse('STATUS:RECHAZADO\r\nERROR: NSS invalido', 'tx-1')
    assert.equal(parsed.normalizedStatus, 'rejected')
    assert.ok(parsed.errorMessage)
  })

  it('detects failure', () => {
    const parsed = parseAfiResponse('FATAL ERROR en procesamiento', 'tx-1')
    assert.equal(parsed.normalizedStatus, 'failed')
  })

  it('fails on empty response', () => {
    const parsed = parseAfiResponse('', 'tx-1')
    assert.equal(parsed.normalizedStatus, 'failed')
  })
})
