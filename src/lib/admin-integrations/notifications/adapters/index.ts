import type { AdministrativeNotificationsAdapter } from '../domain/adapter-interface'
import { getNotificationsConfig } from '../config'
import { AeatNotificationsAdapter } from './aeat/aeat-notifications-adapter'
import { DehuLemaAdapter } from './dehu/dehu-lema-adapter'
import { TgssWscnAdapter } from './tgss/tgss-wscn-adapter'

export function createNotificationAdapters(): AdministrativeNotificationsAdapter[] {
  const config = getNotificationsConfig()
  const adapters: AdministrativeNotificationsAdapter[] = []
  if (config.aeatEnabled) adapters.push(new AeatNotificationsAdapter())
  if (config.tgssEnabled) adapters.push(new TgssWscnAdapter())
  if (config.dehuEnabled) adapters.push(new DehuLemaAdapter())
  return adapters
}
