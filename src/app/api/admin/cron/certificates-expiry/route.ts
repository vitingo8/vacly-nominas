import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { isCronAuthorized } from '@/lib/admin-integrations/config'
import { notifyExpiringCertificates } from '@/lib/admin-integrations/notifications/expiry-notifier'

/**
 * Worker de alertas de caducidad de certificados. Protegido con CRON_SECRET.
 * Programar via Vercel Cron / pg_cron (p. ej. diario).
 */
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get('authorization'))) {
    return NextResponse.json({ success: false, code: 'UNAUTHORIZED', message: 'No autorizado' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseClient()
    const result = await notifyExpiringCertificates(supabase)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { success: false, code: 'PROCESSING_ERROR', message: error instanceof Error ? error.message : 'Error' },
      { status: 500 },
    )
  }
}

// Permite disparo manual via GET en desarrollo (mismo control de auth).
export async function GET(request: NextRequest) {
  return POST(request)
}
