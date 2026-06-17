import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { DocumentStorageService } from '@/lib/admin-integrations/document-storage/document-storage-service'
import { adminErrorResponse } from '@/lib/admin-integrations/api-helpers'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const companyId = request.nextUrl.searchParams.get('company_id') || undefined

    const supabase = getSupabaseClient()
    const storage = new DocumentStorageService(supabase)
    const file = await storage.getById(id, companyId ?? undefined)
    const buffer = await storage.download(file)

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${file.file_name}"`,
        'X-File-SHA256': file.sha256,
      },
    })
  } catch (error) {
    return adminErrorResponse(error)
  }
}
