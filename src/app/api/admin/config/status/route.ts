import { NextResponse } from 'next/server'
import { getAdminConfig } from '@/lib/admin-integrations/config'

export async function GET() {
  const config = getAdminConfig()
  return NextResponse.json({
    enabled: config.enabled,
    tgssMode: config.tgssMode,
    aeatMode: config.aeatMode,
    dehuMode: config.dehuMode,
  })
}
