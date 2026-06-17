import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { MockTgssTransportAdapter } from '../tgss-red/transport/transport-adapter'
import { parseMockAfiResponse } from '../tgss-red/response-parser'

describe('MockTgssTransportAdapter', () => {
  it('submits and polls to completion', async () => {
    const adapter = new MockTgssTransportAdapter()
    const txId = '00000000-0000-4000-8000-000000000001'

    const submit = await adapter.submitFile(txId, '/path/afi.txt')
    assert.equal(submit.status, 'submitted')
    assert.ok(submit.externalRef.startsWith('MOCK-REF-'))

    await new Promise((r) => setTimeout(r, 150))
    const poll = await adapter.pollResponse(txId)
    assert.equal(poll.status, 'completed')
    assert.ok(poll.responseContent?.includes('STATUS:OK'))

    const parsed = parseMockAfiResponse(poll.responseContent!, txId)
    assert.equal(parsed.normalizedStatus, 'accepted')
  })

  it('parseMockAfiResponse detects rejection', () => {
    const parsed = parseMockAfiResponse('STATUS:RECHAZ ERROR', 'tx-1')
    assert.equal(parsed.normalizedStatus, 'rejected')
  })
})
