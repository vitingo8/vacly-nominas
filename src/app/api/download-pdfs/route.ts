import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import JSZip from 'jszip'

function sanitizeFilenamePart(value: unknown, fallback: string): string {
  const sanitized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .trim()
  return sanitized || fallback
}

function periodKeyFromDate(periodStart: string): string {
  const [year, month] = periodStart.split('-')
  return `${year}${month}`
}

// ─── POST: Download all PDFs for a period as ZIP ─────────────────────
// Las nóminas sólo guardan `document_name` (ruta del objeto en el bucket
// "Nominas" de Supabase Storage). Usamos Storage directamente con el
// service role para descargar el PDF; no dependemos de URLs públicas.
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const body = await request.json()

    const { companyId, month, year } = body
    const requestedNominaIds = Array.isArray(body.nominaIds)
      ? Array.from(new Set(body.nominaIds.map((id: unknown) => String(id)).filter(Boolean)))
      : []

    if (!companyId || (requestedNominaIds.length === 0 && (!month || !year))) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos requeridos: companyId y nominaIds o month/year' },
        { status: 400 },
      )
    }

    let query = supabase
      .from('nominas')
      .select('id, employee_id, employee, company, dni, document_name, period_start, status')
      .eq('company_id', companyId)

    if (requestedNominaIds.length > 0) {
      query = query.in('id', requestedNominaIds)
    } else {
      const periodStart = `${year}-${String(month).padStart(2, '0')}-01`
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate()
      const periodEnd = `${year}-${String(month).padStart(2, '0')}-${lastDay}`
      query = query
        .gte('period_start', periodStart)
        .lte('period_start', periodEnd)
        .eq('status', 'generated')
    }

    const { data: nominas, error } = await query.order('period_start', { ascending: true })

    // Intenta localizar PDFs huérfanos en Storage (nóminas cuyo `document_name`
    // quedó vacío por un bug anterior). Lista el prefijo del período y empareja
    // por id de nómina en el nombre del fichero.
    const storageListingsByFolder = new Map<string, { name: string }[]>()
    const getStorageListing = async (folderPath: string) => {
      if (storageListingsByFolder.has(folderPath)) {
        return storageListingsByFolder.get(folderPath) ?? []
      }
      try {
        const { data: files } = await supabase.storage
          .from('Nominas')
          .list(folderPath, { limit: 1000 })
        const listing = (files || []).filter((f: any) => f.name?.endsWith('.pdf'))
        storageListingsByFolder.set(folderPath, listing)
        return listing
      } catch (lsErr) {
        console.warn('[download-pdfs] Could not list storage folder:', lsErr)
        storageListingsByFolder.set(folderPath, [])
        return []
      }
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

    const { data: companyRow } = await supabase
      .from('companies')
      .select('cif')
      .eq('company_id', companyId)
      .maybeSingle()
    const fallbackCompanyCif = (companyRow as any)?.cif ?? null

    // Resolver `document_name` definitivo para cada nómina.
    type NominaDl = {
      id: string
      employee: any
      company: any
      dni: string | null
      document_name: string | null
      period_start: string
    }
    const resolved: Array<{ id: string; employee: any; company: any; dni: string | null; periodStart: string; objectPath: string }> = []
    const backfill: Array<{ id: string; objectPath: string }> = []

    for (const n of nominas as NominaDl[]) {
      if (n.document_name && n.document_name.length > 0) {
        resolved.push({
          id: n.id,
          employee: n.employee,
          company: n.company,
          dni: n.dni,
          periodStart: n.period_start,
          objectPath: n.document_name,
        })
        continue
      }
      const periodFolder = `${companyId}/${n.period_start.slice(0, 4)}/${n.period_start.slice(5, 7)}`
      const storageListing = await getStorageListing(periodFolder)
      // Matching por id: el nombre del fichero lo incluye al final ("_<id>.pdf").
      const match = storageListing.find((f) => f.name.includes(n.id))
      if (match) {
        const fullPath = `${periodFolder}/${match.name}`
        resolved.push({
          id: n.id,
          employee: n.employee,
          company: n.company,
          dni: n.dni,
          periodStart: n.period_start,
          objectPath: fullPath,
        })
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
    const usedZipPaths = new Set<string>()

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
        const periodKey = periodKeyFromDate(item.periodStart)
        const monthFolder = zip.folder(periodKey)
        if (!monthFolder) {
          throw new Error(`Error creando carpeta ZIP ${periodKey}`)
        }

        const dni = sanitizeFilenamePart(item.dni ?? item.employee?.dni, 'SinDNI')
        const cif = sanitizeFilenamePart(item.company?.cif ?? fallbackCompanyCif, 'SinCIF')
        const baseName = `${periodKey}_${dni}_${cif}`
        let filename = `${baseName}.pdf`
        let zipPath = `${periodKey}/${filename}`
        let duplicate = 2
        while (usedZipPaths.has(zipPath)) {
          filename = `${baseName}_${duplicate}.pdf`
          zipPath = `${periodKey}/${filename}`
          duplicate++
        }
        usedZipPaths.add(zipPath)

        monthFolder.file(filename, Buffer.from(arrayBuffer))
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

    const filename = requestedNominaIds.length > 0
      ? `Nominas_seleccionadas_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.zip`
      : `Nominas_${year}${String(month).padStart(2, '0')}.zip`

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
