import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import pdf from 'pdf-parse'
import { v4 as uuidv4 } from 'uuid'
import { createClient } from '@supabase/supabase-js'

interface SplitDocument {
  id: string
  filename: string
  pageNumber: number
  textContent: string
  pdfUrl: string
  textUrl: string
  claudeProcessed: boolean
}

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { filename, url } = await request.json()
    
    if (!filename || !url) {
      return NextResponse.json({ error: 'Filename and URL are required' }, { status: 400 })
    }

    // Get document type ID for nomina (default for now)
    const { data: documentType, error: docTypeError } = await supabase
      .from('document_types')
      .select('id')
      .eq('name', 'nomina')
      .single()

    if (docTypeError || !documentType) {
      console.error('Error getting document type:', docTypeError)
      return NextResponse.json({ error: 'Document type not found' }, { status: 500 })
    }

    // Fixed IDs for testing (same as in process-nomina API)
    const companyId = 'e3605f07-2576-4960-81a5-04184661926d'
    const employeeId = 'de95edea-9322-494a-a693-61e1ac7337f8'

    // Download the PDF from Supabase Storage
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error('Failed to download PDF from storage')
    }
    const pdfBuffer = await response.arrayBuffer()

    // Load the PDF document
    const pdfDoc = await PDFDocument.load(pdfBuffer)
    const pageCount = pdfDoc.getPageCount()

    const documents: SplitDocument[] = []

    // Process each page
    for (let i = 0; i < pageCount; i++) {
      const pageNum = i + 1
      const pageId = uuidv4()
      
      // Create a new PDF with just this page
      const newPdf = await PDFDocument.create()
      const [copiedPage] = await newPdf.copyPages(pdfDoc, [i])
      newPdf.addPage(copiedPage)
      
      // Save the single-page PDF
      const pdfBytes = await newPdf.save()
      const baseName = filename.replace('.pdf', '')
      const pagePdfName = `${baseName}_page_${pageNum}.pdf`
      
      // Upload split PDF to Supabase Storage
      const { error: pdfUploadError } = await supabase
        .storage
        .from('split-pdfs')
        .upload(pagePdfName, pdfBytes, {
          contentType: 'application/pdf',
          cacheControl: '3600'
        })

      if (pdfUploadError) {
        console.error(`Error uploading split PDF page ${pageNum}:`, pdfUploadError)
        continue
      }

      // Get the public URL for the split PDF
      const { data: pdfUrlData } = supabase
        .storage
        .from('split-pdfs')
        .getPublicUrl(pagePdfName)

      // Extract text from this single page PDF
      let textContent = ''
      try {
        const pageData = await pdf(Buffer.from(pdfBytes))
        textContent = pageData.text.trim()
      } catch (textError) {
        console.error(`Error extracting text from page ${pageNum}:`, textError)
        textContent = 'Error extracting text from this page'
      }

      // Upload text content to Supabase Storage
      const textFileName = `${baseName}_page_${pageNum}.txt`
      const { error: textUploadError } = await supabase
        .storage
        .from('text-files')
        .upload(textFileName, textContent, {
          contentType: 'text/plain',
          cacheControl: '3600'
        })

      if (textUploadError) {
        console.error(`Error uploading text file for page ${pageNum}:`, textUploadError)
        continue
      }

      // Get the public URL for the text file
      const { data: textUrlData } = supabase
        .storage
        .from('text-files')
        .getPublicUrl(textFileName)

      // Create entry in processed_documents table
      const { error: processedDocError } = await supabase
        .from('processed_documents')
        .insert({
          id: pageId,
          original_filename: pagePdfName,
          document_type_id: documentType.id,
          company_id: companyId,
          employee_id: employeeId,
          extracted_text: textContent,
          processing_status: 'pending',
          split_pdf_paths: [pagePdfName],
          text_file_paths: [textFileName]
        })

      if (processedDocError) {
        console.error(`Error creating processed document entry for page ${pageNum}:`, processedDocError)
        // Continue with processing even if database insert fails
      }

      documents.push({
        id: pageId,
        filename: pagePdfName,
        pageNumber: pageNum,
        pdfUrl: pdfUrlData.publicUrl,
        textUrl: textUrlData.publicUrl,
        textContent,
        claudeProcessed: false
      })
    }

    return NextResponse.json({
      message: 'PDF processed successfully',
      documents,
      totalDocumentsCreated: documents.length
    })

  } catch (error) {
    console.error('Processing error:', error)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
} 