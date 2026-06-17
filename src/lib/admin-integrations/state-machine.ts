import type { TransactionStatus } from './types'
import { AdminIntegrationError } from './errors'

const TRANSITIONS: Record<TransactionStatus, TransactionStatus[]> = {
  created: ['validated', 'failed'],
  validated: ['file_generated', 'failed'],
  file_generated: ['queued', 'failed'],
  queued: ['submitted', 'failed'],
  submitted: ['response_received', 'failed'],
  response_received: ['accepted', 'rejected'],
  accepted: [],
  rejected: [],
  failed: [],
}

export function canTransition(from: TransactionStatus, to: TransactionStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

export function assertTransition(from: TransactionStatus, to: TransactionStatus): void {
  if (!canTransition(from, to)) {
    throw new AdminIntegrationError(
      'INVALID_STATE_TRANSITION',
      `Transición no permitida: ${from} → ${to}`,
    )
  }
}

export function isTerminalStatus(status: TransactionStatus): boolean {
  return status === 'accepted' || status === 'rejected' || status === 'failed'
}
