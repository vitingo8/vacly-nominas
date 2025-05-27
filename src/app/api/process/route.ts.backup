import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { v4 as uuidv4 } from 'uuid'
import { createClient } from '@supabase/supabase-js'
import { parsePDF } from '@/lib/pdf-utils'
import { extractBasicNominaInfo, generateSplitFileName, generateTextFileName } from '@/lib/pdf-naming'

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
    console.log('🔄 Starting PDF processing...')
    
    const { filename, url } = await request.json()
    
    if (!filename || !url) {
      console.error('❌ Missing filename or URL:', { filename, url })
      return NextResponse.json({ error: 'Filename and URL are required' }, { status: 400 })
    }

    console.log('📄 Processing file:', filename, 'from URL:', url)

    // Check environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL')
      return NextResponse.json({ error: 'Supabase configuration missing' }, { status: 500 })
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY')
      return NextResponse.json({ error: 'Supabase service key missing' }, { status: 500 })
    }

    console.log('✅ Environment variables validated')

    // Get document type ID for nomina (default for now)
    console.log('🔍 Fetching document type...')
    const { data: documentType, error: docTypeError } = await supabase
      .from('document_types')
      .select('id')
      .eq('name', 'nomina')
      .single()

    if (docTypeError || !documentType) {
      console.error('❌ Error getting document type:', docTypeError)
      return NextResponse.json({ error: 'Document type not found' }, { status: 500 })
    }

    console.log('✅ Document type found:', documentType.id)

    // Fixed IDs for testing (same as in process-nomina API)
    const companyId = 'e3605f07-2576-4960-81a5-04184661926d'
    const employeeId = 'de95edea-9322-494a-a693-61e1ac7337f8'

    // Download the PDF from Supabase Storage
    console.log('⬇️ Downloading PDF from storage...')
    const response = await fetch(url)
    if (!response.ok) {
      console.error('❌ Failed to download PDF:', response.status, response.statusText)
      console.error('❌ URL that failed:', url)
      throw new Error(`Failed to download PDF from storage: ${response.status} ${response.statusText}`)
    }
    
    console.log('✅ PDF downloaded successfully')
    const pdfBuffer = await response.arrayBuffer()
    console.log('📊 PDF buffer size:', pdfBuffer.byteLength, 'bytes')

    // Load the PDF document
    console.log('📖 Loading PDF document...')
    const pdfDoc = await PDFDocument.load(pdfBuffer)
    const pageCount = pdfDoc.getPageCount()
    console.log('📄 PDF has', pageCount, 'pages')

    const documents: SplitDocument[] = []

    // Process each page
    for (let i = 0; i < pageCount; i++) {
      const pageNum = i + 1
      const pageId = uuidv4()
      
      console.log(`🔄 Processing page ${pageNum}/${pageCount}...`)
      
      try {
        // Create a new PDF with just this page
        const newPdf = await PDFDocument.create()
        const [copiedPage] = await newPdf.copyPages(pdfDoc, [i])
        newPdf.addPage(copiedPage)
        
        // Save the single-page PDF
        const pdfBytes = await newPdf.save()
        
        // Extract text from this specific page to get individual naming info
        let pageBasicInfo = {
          companyName: 'Desconocido',
          employeeName: 'Desconocido', 
          period: new Date().getFullYear() + String(new Date().getMonth() + 1).padStart(2, '0')
        }

        console.log(`📝 Extracting text from page ${pageNum}...`)
        let textContent = ''
        try {
          textContent = await parsePDF(Buffer.from(pdfBytes))
          console.log(`✅ Text extracted from page ${pageNum}: ${textContent.length} characters`)
          
          // Extract specific info for this page
          if (textContent && textContent.length > 50) {
            try {
              console.log(`🔍 Extracting specific info for page ${pageNum}...`)
              pageBasicInfo = await extractBasicNominaInfo(textContent)
              console.log(`✅ Page ${pageNum} info extracted:`, pageBasicInfo)
            } catch (namingError) {
              console.error(`❌ Error extracting naming info for page ${pageNum}:`, namingError)
              // Use default values for this page
            }
          }
        } catch (textError) {
          console.error(`❌ Error extracting text from page ${pageNum}:`, textError)
          textContent = 'Error extracting text from this page'
        }

        // Generate proper filenames using extracted info from this specific page
        const pagePdfName = generateSplitFileName(pageBasicInfo.employeeName, pageBasicInfo.period, pageNum)
        
        console.log(`📤 Uploading split PDF: ${pagePdfName}`)
        
        // Upload split PDF to Supabase Storage
        const { error: pdfUploadError } = await supabase
          .storage
          .from('split-pdfs')
          .upload(pagePdfName, pdfBytes, {
            contentType: 'application/pdf',
            cacheControl: '3600'
          })

        if (pdfUploadError) {
          console.error(`❌ Error uploading split PDF page ${pageNum}:`, pdfUploadError)
          continue
        }

        console.log(`✅ Split PDF uploaded successfully: ${pagePdfName}`)

        // Get the public URL for the split PDF
        const { data: pdfUrlData } = supabase
          .storage
          .from('split-pdfs')
          .getPublicUrl(pagePdfName)

        // Upload text content to Supabase Storage
        const textFileName = generateTextFileName(pageBasicInfo.employeeName, pageBasicInfo.period, pageNum)
        console.log(`📤 Uploading text file: ${textFileName}`)
        
        const { error: textUploadError } = await supabase
          .storage
          .from('text-files')
          .upload(textFileName, textContent, {
            contentType: 'text/plain',
            cacheControl: '3600'
          })

        if (textUploadError) {
          console.error(`❌ Error uploading text file for page ${pageNum}:`, textUploadError)
          continue
        }

        console.log(`✅ Text file uploaded successfully: ${textFileName}`)

        // Get the public URL for the text file
        const { data: textUrlData } = supabase
          .storage
          .from('text-files')
          .getPublicUrl(textFileName)

        // Create entry in processed_documents table
        console.log(`💾 Creating database entry for page ${pageNum}...`)
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
          console.error(`❌ Error creating processed document entry for page ${pageNum}:`, processedDocError)
          // Continue with processing even if database insert fails
        } else {
          console.log(`✅ Database entry created for page ${pageNum}`)
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

        console.log(`✅ Page ${pageNum} processed successfully`)

      } catch (pageError) {
        console.error(`❌ Error processing page ${pageNum}:`, pageError)
        // Continue with next page
      }
    }

    console.log(`🎉 PDF processing completed! Created ${documents.length} documents`)

    return NextResponse.json({
      message: 'PDF processed successfully',
      documents,
      totalDocumentsCreated: documents.length
    })

  } catch (error) {
    console.error('💥 Critical processing error:', error)
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return NextResponse.json({ 
      error: 'Processing failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 