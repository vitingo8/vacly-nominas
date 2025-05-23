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
      documents
    })

  } catch (error) {
    console.error('Processing error:', error)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
} 