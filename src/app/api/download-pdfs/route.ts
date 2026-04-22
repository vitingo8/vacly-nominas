import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import JSZip from 'jszip'

// ─── POST: Download all PDFs for a period as ZIP ─────────────────────
// Las nóminas sólo guardan `document_name` (ruta del objeto en el bucket
// "Nominas" de Supabase Storage). Usamos Storage directamente con el
// service role para descargar el PDF; no dependemos de URLs públicas.
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const body = await request.json()

    const { companyId, month, year } = body

    if (!companyId || !month || !year) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos requeridos: companyId, month, year' },
        { status: 400 },
      )
    }

    const periodStart = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate()
    const periodEnd = `${year}-${String(month).padStart(2, '0')}-${lastDay}`

    const { data: nominas, error } = await supabase
      .from('nominas')
      .select('id, employee_id, employee, document_name, period_start')
      .eq('company_id', companyId)
      .gte('period_start', periodStart)
      .lte('period_start', periodEnd)
      .eq('status', 'generated')

    // Intenta localizar PDFs huérfanos en Storage (nóminas cuyo `document_name`
    // quedó vacío por un bug anterior). Lista el prefijo del período y empareja
    // por id de nómina en el nombre del fichero.
    const monthFolder = `${companyId}/${year}/${String(month).padStart(2, '0')}`
    let storageListing: { name: string }[] = []
    try {
      const { data: files } = await supabase.storage
        .from('Nominas')
        .list(monthFolder, { limit: 1000 })
      storageListing = (files || []).filter((f: any) => f.name?.endsWith('.pdf'))
    } catch (lsErr) {
      console.warn('[download-pdfs] Could not list storage folder:', lsErr)
    }

    if (error) {
      console.error('Error fetching nominas:', error)
      return NextResponse.json(
        { success: false, error: 'Error al obtener nóminas', details: error.message },
        { status: 500 },
      )
    }

    if (!nominas || nominas.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No se encontraron nóminas generadas para este período' },
        { status: 404 },
      )
    }

    // Resolver `document_name` definitivo para cada nómina.
    type NominaDl = { id: string; employee: any; document_name: string | null }
    const resolved: Array<{ id: string; employee: any; objectPath: string }> = []
    const backfill: Array<{ id: string; objectPath: string }> = []

    for (const n of nominas as NominaDl[]) {
      if (n.document_name && n.document_name.length > 0) {
        resolved.push({ id: n.id, employee: n.employee, objectPath: n.document_name })
        continue
      }
      // Matching por id: el nombre del fichero lo incluye al final ("_<id>.pdf").
      const match = storageListing.find((f) => f.name.includes(n.id))
      if (match) {
        const fullPath = `${monthFolder}/${match.name}`
        resolved.push({ id: n.id, employee: n.employee, objectPath: fullPath })
        backfill.push({ id: n.id, objectPath: fullPath })
      }
    }

    // Backfill asincrónico del `document_name` para futuras descargas.
    if (backfill.length > 0) {
      await Promise.all(
        backfill.map((b) =>
          supabase.from('nominas').update({ document_name: b.objectPath }).eq('id', b.id),
        ),
      )
    }

    if (resolved.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No hay PDFs disponibles para descargar. Vuelve a generar las nóminas para crear los PDFs en Storage.',
        },
        { status: 404 },
      )
    }

    const zip = new JSZip()
    const folderName = `Nominas_${year}_${String(month).padStart(2, '0')}`
    const folder = zip.folder(folderName)
    if (!folder) {
      throw new Error('Error creating ZIP folder')
    }

    let successCount = 0
    let errorCount = 0
    const errors: string[] = []

    for (const item of resolved) {
      const { objectPath } = item
      try {
        const { data: fileBlob, error: dlError } = await supabase.storage
          .from('Nominas')
          .download(objectPath)

        if (dlError || !fileBlob) {
          console.error(`Error downloading PDF ${objectPath}:`, dlError)
          errors.push(`${item.employee?.name || item.id}: ${dlError?.message || 'no encontrado'}`)
          errorCount++
          continue
        }

        const arrayBuffer = await fileBlob.arrayBuffer()
        const safeName = (item.employee?.name || 'Empleado')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9]+/g, '_')
        const filename =
          objectPath.split('/').pop()
          || `Nomina_${safeName}_${String(month).padStart(2, '0')}_${year}.pdf`

        folder.file(filename, Buffer.from(arrayBuffer))
        successCount++
      } catch (err) {
        console.error(`Error processing PDF ${objectPath}:`, err)
        errors.push(`${item.employee?.name || item.id}: ${err instanceof Error ? err.message : 'unknown'}`)
        errorCount++
      }
    }

    if (successCount === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No se pudo descargar ningún PDF',
          details: errors.slice(0, 10),
        },
        { status: 500 },
      )
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })

    const filename = `Nominas_${year}${String(month).padStart(2, '0')}.zip`

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(zipBuffer.length),
        'X-Success-Count': String(successCount),
        'X-Error-Count': String(errorCount),
      },
    })
  } catch (error) {
    console.error('POST /api/download-pdfs error:', error)
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    )
  }
}
