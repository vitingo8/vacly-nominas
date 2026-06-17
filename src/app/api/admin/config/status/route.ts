import { NextResponse } from 'next/server'
import { getAdminConfig } from '@/lib/admin-integrations/config'
import { getNotificationsConfig } from '@/lib/admin-integrations/notifications/config'

export async function GET() {
  const config = getAdminConfig()
  const notifications = getNotificationsConfig()
  return NextResponse.json({
    enabled: config.enabled,
    tgssMode: config.tgssMode,
    aeatMode: config.aeatMode,
    notifications: {
      enabled: notifications.enabled,
      environment: notifications.environment,
      aeatEnabled: notifications.aeatEnabled,
      tgssEnabled: notifications.tgssEnabled,
      dehuEnabled: notifications.dehuEnabled,
      endpoints: notifications.endpoints,
    },
  })
}
