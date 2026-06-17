import type { AdminProvider } from '../../types'
import type { AdapterSyncContext, FetchedNotification } from './types'

export interface AdministrativeNotificationsAdapter {
  readonly provider: AdminProvider
  syncNotifications(ctx: AdapterSyncContext): Promise<FetchedNotification[]>
}
