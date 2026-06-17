import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { canTransition, assertTransition, isTerminalStatus } from '../state-machine'
import { AdminIntegrationError } from '../errors'

describe('state-machine', () => {
  it('allows created -> validated', () => {
    assert.equal(canTransition('created', 'validated'), true)
  })

  it('allows response_received -> accepted', () => {
    assert.equal(canTransition('response_received', 'accepted'), true)
  })

  it('blocks accepted -> queued', () => {
    assert.equal(canTransition('accepted', 'queued'), false)
  })

  it('assertTransition throws on invalid', () => {
    assert.throws(
      () => assertTransition('accepted', 'queued'),
      (err: unknown) => err instanceof AdminIntegrationError,
    )
  })

  it('terminal statuses', () => {
    assert.equal(isTerminalStatus('accepted'), true)
    assert.equal(isTerminalStatus('queued'), false)
  })
})
