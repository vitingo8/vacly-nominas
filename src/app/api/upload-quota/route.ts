import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { getUploadQuota } from '@/lib/upload-quota'

export async function GET(request: NextRequest) {
  try {
    const companyId = new URL(request.url).searchParams.get('company_id')

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: 'company_id es requerido' },
        { status: 400 },
      )
    }

    const supabase = getSupabaseClient()
    const quota = await getUploadQuota(supabase, companyId)

    return NextResponse.json({ success: true, quota })
  } catch (error) {
    console.error('[upload-quota] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 },
    )
  }
}
