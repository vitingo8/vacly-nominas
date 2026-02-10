import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import JSZip from 'jszip'

// ─── POST: Download all PDFs for a period as ZIP ─────────────────────
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const body = await request.json()

    const { companyId, month, year } = body

    if (!companyId || !month || !year) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos requeridos: companyId, month, year' },
        { status: 400 }
      )
    }

    // Fetch all generated nominas for the period
    const periodStart = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate()
    const periodEnd = `${year}-${String(month).padStart(2, '0')}-${lastDay}`

    const { data: nominas, error } = await supabase
      .from('nominas')
      .select('id, employee_id, pdf_url, employee, document_name')
      .eq('company_id', companyId)
      .gte('period_start', periodStart)
      .lte('period_start', periodEnd)
      .eq('status', 'generated')

    if (error) {
      console.error('Error fetching nominas:', error)
      return NextResponse.json(
        { success: false, error: 'Error al obtener nóminas', details: error.message },
        { status: 500 }
      )
    }

    if (!nominas || nominas.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No se encontraron nóminas generadas para este período' },
        { status: 404 }
      )
    }

    // Filter nominas with PDF URLs
    const nominasWithPDF = nominas.filter(n => n.pdf_url)

    if (nominasWithPDF.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No hay PDFs disponibles para descargar. Los PDFs se generan automáticamente al crear las nóminas.' },
        { status: 404 }
      )
    }

    // Create ZIP file
    const zip = new JSZip()
    const folder = zip.folder(`Nominas_${year}_${String(month).padStart(2, '0')}`)
    
    if (!folder) {
      throw new Error('Error creating ZIP folder')
    }

    // Download and add each PDF to ZIP
    let successCount = 0
    let errorCount = 0

    for (const nomina of nominasWithPDF) {
      try {
        // For Supabase Storage URLs, we need to use the signed URL approach
        const pdfUrl = nomina.pdf_url
        
        // Fetch PDF from URL
        const response = await fetch(pdfUrl)
        
        if (!response.ok) {
          console.error(`Error downloading PDF for nomina ${nomina.id}: ${response.status}`)
          errorCount++
          continue
        }

        const pdfBuffer = await response.arrayBuffer()
        
        // Create filename
        const employeeName = (nomina.employee?.name || 'Empleado').replace(/[^a-zA-Z0-9]/g, '_')
        const filename = nomina.document_name || `Nomina_${employeeName}_${String(month).padStart(2, '0')}_${year}.pdf`
        
        // Add to ZIP
        folder.file(filename, pdfBuffer)
        successCount++
      } catch (err) {
        console.error(`Error processing PDF for nomina ${nomina.id}:`, err)
        errorCount++
      }
    }

    if (successCount === 0) {
      return NextResponse.json(
        { success: false, error: 'No se pudo descargar ningún PDF' },
        { status: 500 }
      )
    }

    // Generate ZIP
    const zipBuffer = await zip.generateAsync({ 
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    })

    // Return ZIP file
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
      { status: 500 }
    )
  }
}
