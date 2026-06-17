import type { AdministrativeNotificationsAdapter } from '../domain/adapter-interface'
import { AeatNotificationsAdapter } from './aeat/aeat-notifications-adapter'
import { DehuLemaAdapter } from './dehu/dehu-lema-adapter'
import { TgssWscnAdapter } from './tgss/tgss-wscn-adapter'

export function createNotificationAdapters(): AdministrativeNotificationsAdapter[] {
  return [new AeatNotificationsAdapter(), new TgssWscnAdapter(), new DehuLemaAdapter()]
}
