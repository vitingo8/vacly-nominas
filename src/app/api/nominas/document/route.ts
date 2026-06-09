import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'

/**
 * Sirve el PDF de una nómina desde el mismo origen para evitar que Chrome
 * bloquee el iframe con URLs firmadas cross-origin de Supabase Storage.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ success: false, error: 'id es requerido' }, { status: 400 })
    }

    const supabase = getSupabaseClient()

    const { data: nomina, error: fetchError } = await supabase
      .from('nominas')
      .select('id, document_name')
      .eq('id', id)
      .maybeSingle()

    if (fetchError) {
      return NextResponse.json(
        { success: false, error: 'No se pudo cargar la nómina' },
        { status: 500 },
      )
    }

    if (!nomina?.document_name) {
      return NextResponse.json(
        { success: false, error: 'Esta nómina no tiene documento PDF asociado' },
        { status: 404 },
      )
    }

    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('Nominas')
      .download(nomina.document_name)

    if (downloadError || !fileBlob) {
      return NextResponse.json(
        { success: false, error: 'No se pudo descargar el documento' },
        { status: 500 },
      )
    }

    const buffer = Buffer.from(await fileBlob.arrayBuffer())
    const filename = nomina.document_name.split('/').pop() || `nomina_${id}.pdf`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('[nominas/document] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 },
    )
  }
}
