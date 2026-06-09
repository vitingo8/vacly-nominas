import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'id es requerido' },
        { status: 400 },
      )
    }

    const supabase = getSupabaseClient()

    const { data: nomina, error: fetchError } = await supabase
      .from('nominas')
      .select('id, document_name, company_id')
      .eq('id', id)
      .maybeSingle()

    if (fetchError) {
      console.error('[document-url] Error fetching nomina:', fetchError)
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

    const { data: signedData, error: signError } = await supabase.storage
      .from('Nominas')
      .createSignedUrl(nomina.document_name, 3600)

    if (signError || !signedData?.signedUrl) {
      console.error('[document-url] Error creating signed URL:', signError)
      return NextResponse.json(
        { success: false, error: 'No se pudo generar la URL del documento' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      url: signedData.signedUrl,
      filename: nomina.document_name,
    })
  } catch (error) {
    console.error('[document-url] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 },
    )
  }
}
