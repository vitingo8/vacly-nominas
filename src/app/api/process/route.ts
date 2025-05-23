import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { PDFDocument } from 'pdf-lib'
import pdf from 'pdf-parse'
import { v4 as uuidv4 } from 'uuid'

interface SplitDocument {
  id: string
  filename: string
  pageNumber: number
  textContent: string
  pdfPath: string
  textPath: string
}

export async function POST(request: NextRequest) {
  try {
    const { filename } = await request.json()
    
    if (!filename) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 })
    }

    const inputPath = join(process.cwd(), 'public', 'uploads', filename)
    const splitDir = join(process.cwd(), 'public', 'split-pdfs')
    const textDir = join(process.cwd(), 'public', 'text-files')

    // Ensure directories exist
    await mkdir(splitDir, { recursive: true })
    await mkdir(textDir, { recursive: true })

    // Read the uploaded PDF
    const pdfBuffer = await readFile(inputPath)
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
      const pagePdfPath = join(splitDir, pagePdfName)
      await writeFile(pagePdfPath, pdfBytes)

      // Extract text from this single page PDF
      let textContent = ''
      try {
        const pageData = await pdf(Buffer.from(pdfBytes))
        textContent = pageData.text.trim()
      } catch (textError) {
        console.error(`Error extracting text from page ${pageNum}:`, textError)
        textContent = 'Error extracting text from this page'
      }

      // Save the text content
      const textFileName = `${baseName}_page_${pageNum}.txt`
      const textFilePath = join(textDir, textFileName)
      await writeFile(textFilePath, textContent, 'utf8')

      // Add to documents array
      documents.push({
        id: pageId,
        filename: pagePdfName,
        pageNumber: pageNum,
        textContent: textContent,
        pdfPath: `/split-pdfs/${pagePdfName}`,
        textPath: `/text-files/${textFileName}`
      })
    }

    return NextResponse.json({
      message: 'PDF processed successfully',
      totalPages: pageCount,
      documents: documents
    })

  } catch (error) {
    console.error('Processing error:', error)
    return NextResponse.json({ 
      error: 'Failed to process PDF',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 