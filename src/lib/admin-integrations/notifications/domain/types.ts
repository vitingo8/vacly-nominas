import type { AdminProvider } from '../../types'

export type NotificationSyncStatus = 'running' | 'success' | 'partial_success' | 'failed'

export interface FetchedNotification {
  provider: AdminProvider
  externalId: string
  subject: string
  sender?: string
  concept?: string
  receivedAt: string
  accessDeadline?: string
  readAt?: string
  documentPdf?: Buffer
  certificationPdf?: Buffer
  metadata?: Record<string, unknown>
}

export interface ProviderSyncResult {
  provider: AdminProvider
  status: NotificationSyncStatus
  fetched: number
  stored: number
  errorCode?: string
  errorMessage?: string
}

export interface NotificationSyncResult {
  runs: ProviderSyncResult[]
  fetched: number
  stored: number
}

export interface AdapterSyncContext {
  companyId: string
  certificateId: string
  holderNif: string | null
  pfx: Buffer
  password: string
  actorUserId?: string
}
