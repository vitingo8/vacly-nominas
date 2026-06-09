import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import JSZip from 'jszip'
import { buildNominaWorkbook } from '@/lib/nomina-excel'

function sanitizeFilenamePart(value: unknown, fallback: string): string {
  const sanitized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .trim()
  return sanitized || fallback
}

function periodFolderFromDate(periodStart: string): string {
  const [year, month] = periodStart.split('-')
  return `${year}-${month}`
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const body = await request.json()
    const { companyId, nominaIds } = body

    if (!companyId) {
      return NextResponse.json({ success: false, error: 'companyId es requerido' }, { status: 400 })
    }

    const ids: string[] = Array.isArray(nominaIds)
      ? Array.from(new Set(nominaIds.map((id: unknown) => String(id)).filter(Boolean)))
      : []

    if (ids.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Selecciona al menos una nómina para exportar' },
        { status: 400 },
      )
    }

    const { data: nominas, error } = await supabase
      .from('nominas')
      .select('*')
      .eq('company_id', companyId)
      .in('id', ids)
      .order('period_start', { ascending: true })

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Error al obtener nóminas', details: error.message },
        { status: 500 },
      )
    }

    if (!nominas || nominas.length === 0) {
      return NextResponse.json({ success: false, error: 'No se encontraron nóminas' }, { status: 404 })
    }

    const zip = new JSZip()
    const excelBuffer = buildNominaWorkbook(nominas)
    zip.file('resumen_nominas.xlsx', excelBuffer)

    const usedPaths = new Set<string>()
    let pdfCount = 0

    for (const nomina of nominas) {
      if (!nomina.document_name) continue

      const { data: fileBlob, error: dlError } = await supabase.storage
        .from('Nominas')
        .download(nomina.document_name)

      if (dlError || !fileBlob) continue

      const employeeName = sanitizeFilenamePart(
        nomina.employee?.name || nomina.dni || 'Sin_empleado',
        'Sin_empleado',
      )
      const periodFolder = periodFolderFromDate(nomina.period_start || '0000-00')
      const dni = sanitizeFilenamePart(nomina.dni || nomina.employee?.dni, 'SinDNI')
      const baseName = `${periodFolder}_${dni}`

      let filename = `${baseName}.pdf`
      let zipPath = `${employeeName}/${periodFolder}/${filename}`
      let duplicate = 2
      while (usedPaths.has(zipPath)) {
        filename = `${baseName}_${duplicate}.pdf`
        zipPath = `${employeeName}/${periodFolder}/${filename}`
        duplicate++
      }
      usedPaths.add(zipPath)

      const arrayBuffer = await fileBlob.arrayBuffer()
      zip.file(zipPath, Buffer.from(arrayBuffer))
      pdfCount++
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })

    const exportDate = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const filename = `Nominas_export_${exportDate}.zip`

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(zipBuffer.length),
        'X-Nomina-Count': String(nominas.length),
        'X-Pdf-Count': String(pdfCount),
      },
    })
  } catch (error) {
    console.error('POST /api/nominas/export error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Error interno del servidor',
        details: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 },
    )
  }
}
