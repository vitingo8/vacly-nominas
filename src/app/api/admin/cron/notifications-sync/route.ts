import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { isCronAuthorized } from '@/lib/admin-integrations/config'
import { syncAllAgencyNotificationsCron } from '@/lib/admin-integrations/notifications/notification-service'

/**
 * Sincroniza notificaciones administrativas de todas las gestorías.
 * Programar vía pg_cron a las 04:00, 11:00, 16:00 y 19:00 (hora peninsular).
 */
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get('authorization'))) {
    return NextResponse.json({ success: false, code: 'UNAUTHORIZED', message: 'No autorizado' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseClient()
    const result = await syncAllAgencyNotificationsCron(supabase)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { success: false, code: 'PROCESSING_ERROR', message: error instanceof Error ? error.message : 'Error' },
      { status: 500 },
    )
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
