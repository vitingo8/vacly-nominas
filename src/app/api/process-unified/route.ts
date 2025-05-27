/**
 * API UNIFICADA - Procesamiento Completo Corregido
 * 
 * CORRECCIÓN: Error "nomina_data" -> "processed_data"
 * ESTRUCTURA VERIFICADA CON MCP SUPABASE:
 * - processed_documents.processed_data (JSONB) ✅
 * - nominas: todas las columnas verificadas ✅
 */

import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { v4 as uuidv4 } from 'uuid'
import { createClient } from '@supabase/supabase-js'
import { parsePDF } from '@/lib/pdf-utils'
import { extractBasicNominaInfo, generateSplitFileName, generateTextFileName, correctNameFormat } from '@/lib/pdf-naming'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

interface SplitDocument {
  id: string
  filename: string
  pageNumber: number
  textContent: string
  pdfUrl: string
  textUrl: string
  claudeProcessed: boolean
  nominaData?: any
}

interface GlobalFileInfo {
  companyName: string
  period: string
  totalPages: number
}

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Extrae información del archivo global usando Haiku 3.5
 */
async function extractGlobalFileInfo(filename: string, pdfBuffer: Buffer): Promise<GlobalFileInfo> {
  try {
    const prompt = `Analiza este nombre de archivo PDF y el contenido del documento para extraer información global:

Nombre del archivo: "${filename}"

Extrae:
1. Nombre de la empresa principal del documento
2. Período general (YYYYMM) basado en el nombre del archivo o contenido
3. Información general del documento

Responde ÚNICAMENTE con un objeto JSON:
{
  "companyName": "nombre de la empresa principal",
  "period": "YYYYMM"
}

Si no encuentras datos específicos, deduce basándote en el nombre del archivo o usa valores por defecto.`

    const response = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBuffer.toString('base64')
              }
            },
            {
              type: "text",
              text: prompt
            }
          ]
        }
      ],
    })

    if (!response.content[0] || response.content[0].type !== 'text') {
      throw new Error('Invalid response from Claude API')
    }

    let cleanedResponse = response.content[0].text.trim()
    
    // Clean the response
    if (cleanedResponse.includes('```json')) {
      cleanedResponse = cleanedResponse.replace(/```json\s*/g, '').replace(/```\s*$/g, '')
    } else if (cleanedResponse.includes('```')) {
      cleanedResponse = cleanedResponse.replace(/```\s*/g, '').replace(/```\s*$/g, '')
    }
    
    const firstBrace = cleanedResponse.indexOf('{')
    const lastBrace = cleanedResponse.lastIndexOf('}')
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleanedResponse = cleanedResponse.substring(firstBrace, lastBrace + 1)
    }
    
    const globalInfo = JSON.parse(cleanedResponse)
    
    return {
      companyName: globalInfo.companyName || 'Empresa_Desconocida',
      period: globalInfo.period || new Date().getFullYear() + String(new Date().getMonth() + 1).padStart(2, '0'),
      totalPages: 0 // Will be set later
    }

  } catch (error) {
    console.error('Error extracting global file info:', error)
    
    // Fallback: extract from filename
    const currentDate = new Date()
    const fallbackPeriod = `${currentDate.getFullYear()}${String(currentDate.getMonth() + 1).padStart(2, '0')}`
    
    return {
      companyName: filename.replace('.pdf', '').replace(/[^a-zA-Z0-9]/g, '_') || 'Empresa_Desconocida',
      period: fallbackPeriod,
      totalPages: 0
    }
  }
}

/**
 * Procesa cada página con Haiku 3.5 y extrae TODA la información de una vez
 */
async function processPageWithFullData(pdfBytes: Uint8Array, pageNum: number): Promise<{
  basicInfo: any,
  fullNominaData: any,
  textContent: string
}> {
  try {
    // Extract text content for storage
    const textContent = await parsePDF(Buffer.from(pdfBytes))
    
    // Use Haiku 3.5 to extract ALL information at once
    const prompt = `Analiza este documento PDF de nómina y extrae TODA la información de forma completa:

INFORMACIÓN BÁSICA PARA NOMBRES:
1. Nombre de la empresa
2. Nombre del empleado (formato NOMBRE APELLIDOS si aparece como "APELLIDOS, NOMBRE")
3. Período en formato YYYYMM

INFORMACIÓN COMPLETA DE LA NÓMINA:
4. Datos del empleado (DNI, NSS, categoría, código)
5. Datos de la empresa (CIF, dirección, código centro)
6. Período detallado (fechas inicio y fin)
7. Percepciones (conceptos y cantidades)
8. Deducciones (conceptos y cantidades) 
9. Cotizaciones sociales (incluye contribuciones del empleador)
10. Base SS y neto a pagar
11. Datos bancarios si están disponibles
12. Coste empresa: Si no aparece explícitamente, CALCÚLALO sumando el sueldo bruto + todas las contribuciones del empleador
13. Estado de firma: Por defecto siempre false (pendiente de firma)

IMPORTANTE PARA COSTE EMPRESA:
- Si encuentras "Coste empresa" o "Coste total empresa" explícito, úsalo
- Si NO aparece, calcúlalo automáticamente: gross_salary + suma de todas las employer_contribution
- Las contribuciones del empleador suelen incluir: Seguridad Social empresa, desempleo empresa, formación profesional empresa, etc.

Responde ÚNICAMENTE con un objeto JSON en este formato:
{
  "basicInfo": {
    "companyName": "nombre empresa",
    "employeeName": "NOMBRE APELLIDOS", 
    "period": "YYYYMM"
  },
  "fullData": {
    "employee": {
      "name": "nombre completo",
      "dni": "DNI",
      "nss": "NSS", 
      "category": "categoría",
      "code": "código empleado"
    },
    "company": {
      "name": "nombre empresa",
      "cif": "CIF",
      "address": "dirección",
      "center_code": "código centro"
    },
    "period_start": "fecha inicio YYYY-MM-DD",
    "period_end": "fecha fin YYYY-MM-DD", 
    "perceptions": [
      {"concept": "concepto", "code": "código", "amount": cantidad}
    ],
    "deductions": [
      {"concept": "concepto", "code": "código", "amount": cantidad}
    ],
    "contributions": [
      {"concept": "concepto", "base": base, "rate": tasa, "employer_contribution": contribución_empleador}
    ],
    "base_ss": base_seguridad_social,
    "net_pay": neto_a_pagar,
    "gross_salary": sueldo_bruto,
    "bank": {
      "iban": "IBAN si disponible",
      "swift_bic": "SWIFT/BIC si disponible"
    },
    "cost_empresa": coste_empresa_calculado_o_encontrado,
    "signed": false
  }
}`

    const response = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: Buffer.from(pdfBytes).toString('base64')
              }
            },
            {
              type: "text",
              text: prompt
            }
          ]
        }
      ],
    })

    if (!response.content[0] || response.content[0].type !== 'text') {
      throw new Error('Invalid response from Claude API')
    }

    let cleanedResponse = response.content[0].text.trim()
    
    // Clean the response
    if (cleanedResponse.includes('```json')) {
      cleanedResponse = cleanedResponse.replace(/```json\s*/g, '').replace(/```\s*$/g, '')
    } else if (cleanedResponse.includes('```')) {
      cleanedResponse = cleanedResponse.replace(/```\s*/g, '').replace(/```\s*$/g, '')
    }
    
    const firstBrace = cleanedResponse.indexOf('{')
    const lastBrace = cleanedResponse.lastIndexOf('}')
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleanedResponse = cleanedResponse.substring(firstBrace, lastBrace + 1)
    }
    
    const result = JSON.parse(cleanedResponse)
    
    return {
      basicInfo: result.basicInfo || {
        companyName: 'Desconocido',
        employeeName: 'Desconocido',
        period: new Date().getFullYear() + String(new Date().getMonth() + 1).padStart(2, '0')
      },
      fullNominaData: result.fullData || {},
      textContent
    }

  } catch (error) {
    console.error(`Error processing page ${pageNum} with full data:`, error)
    
    // Fallback to basic extraction
    try {
      const textContent = await parsePDF(Buffer.from(pdfBytes))
      const basicInfo = await extractBasicNominaInfo(textContent)
      
      return {
        basicInfo,
        fullNominaData: {},
        textContent
      }
    } catch (fallbackError) {
      console.error(`Fallback also failed for page ${pageNum}:`, fallbackError)
      
      return {
        basicInfo: {
          companyName: 'Desconocido',
          employeeName: 'Desconocido',
          period: new Date().getFullYear() + String(new Date().getMonth() + 1).padStart(2, '0')
        },
        fullNominaData: {},
        textContent: 'Error extracting text from this page'
      }
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Starting UNIFIED PDF processing (CORRECTED VERSION)...')
    
    const { filename, url } = await request.json()
    
    if (!filename || !url) {
      console.error('❌ Missing filename or URL:', { filename, url })
      return NextResponse.json({ error: 'Filename and URL are required' }, { status: 400 })
    }

    console.log('📄 Processing file:', filename, 'from URL:', url)

    // Get document type ID for nomina
    const { data: documentType, error: docTypeError } = await supabase
      .from('document_types')
      .select('id')
      .eq('name', 'nomina')
      .single()

    if (docTypeError || !documentType) {
      console.error('❌ Error getting document type:', docTypeError)
      return NextResponse.json({ error: 'Document type not found' }, { status: 500 })
    }

    // Fixed IDs for testing
    const companyId = 'e3605f07-2576-4960-81a5-04184661926d'
    const employeeId = 'de95edea-9322-494a-a693-61e1ac7337f8'

    // Create a readable stream for Server-Sent Events
    const encoder = new TextEncoder()
    
    const stream = new ReadableStream({
      start(controller) {
        const sendProgress = (progress: number, message: string, currentPage?: number, totalPages?: number) => {
          const data = JSON.stringify({ 
            progress, 
            message, 
            currentPage, 
            totalPages,
            type: 'progress' 
          })
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
        }

        const sendError = (error: string) => {
          const data = JSON.stringify({ error, type: 'error' })
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
          controller.close()
        }

        const sendComplete = (documents: SplitDocument[]) => {
          const data = JSON.stringify({ 
            documents, 
            type: 'complete',
            totalDocumentsCreated: documents.length,
            unified: true
          })
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
          controller.close()
        }

        // Start unified processing
        (async () => {
          try {
            sendProgress(5, 'Descargando PDF desde almacenamiento...')

            // Download the PDF from Supabase Storage
            const response = await fetch(url)
            if (!response.ok) {
              sendError(`Failed to download PDF from storage: ${response.status} ${response.statusText}`)
              return
            }
            
            sendProgress(10, 'PDF descargado, extrayendo información global...')
            const pdfBuffer = await response.arrayBuffer()
            
            // PASO 1: Extraer información global del archivo
            const globalInfo = await extractGlobalFileInfo(filename, Buffer.from(pdfBuffer))
            console.log('📋 Global file info extracted:', globalInfo)

            sendProgress(15, `Archivo global analizado (${globalInfo.companyName}). Dividiendo en páginas...`)

            // Load the PDF document
            const pdfDoc = await PDFDocument.load(pdfBuffer)
            const pageCount = pdfDoc.getPageCount()
            globalInfo.totalPages = pageCount
            
            console.log('📄 PDF has', pageCount, 'pages')

            sendProgress(20, `Documento dividido: ${pageCount} páginas. Procesando con IA unificada...`, 0, pageCount)

            const documents: SplitDocument[] = []

            // PASO 2 y 3: Process each page with UNIFIED processing (Haiku 3.5 for everything)
            for (let i = 0; i < pageCount; i++) {
              const pageNum = i + 1
              const pageId = uuidv4()
              
              // Calculate progress: 20% (setup) + 75% (pages processing) + 5% (completion)
              const pageProgress = 20 + Math.round((i / pageCount) * 75)
              sendProgress(pageProgress, `Procesando con IA unificada - página ${pageNum}/${pageCount}...`, pageNum, pageCount)
              
              console.log(`🔄 UNIFIED processing page ${pageNum}/${pageCount}...`)
              
              try {
                // Create a new PDF with just this page
                const newPdf = await PDFDocument.create()
                const [copiedPage] = await newPdf.copyPages(pdfDoc, [i])
                newPdf.addPage(copiedPage)
                
                // Save the single-page PDF
                const pdfBytes = await newPdf.save()
                
                // PASO 3: Extraer TODA la información con Haiku 3.5 de una vez
                const { basicInfo, fullNominaData, textContent } = await processPageWithFullData(pdfBytes, pageNum)
                
                // Corregir formato de nombres: "APELLIDOS, NOMBRE" -> "NOMBRE APELLIDOS"
                const correctedBasicInfo = {
                  ...basicInfo,
                  employeeName: correctNameFormat(basicInfo.employeeName)
                }
                
                console.log(`✅ Page ${pageNum} UNIFIED processing complete:`, { 
                  basicInfo: correctedBasicInfo, 
                  hasFullData: !!Object.keys(fullNominaData).length 
                })

                // Generate intelligent filenames using corrected extracted info
                const pagePdfName = generateSplitFileName(correctedBasicInfo.employeeName, correctedBasicInfo.period, pageNum)
                const textFileName = generateTextFileName(correctedBasicInfo.employeeName, correctedBasicInfo.period, pageNum)
                
                // Upload split PDF to Supabase Storage
                const { error: pdfUploadError } = await supabase
                  .storage
                  .from('split-pdfs')
                  .upload(pagePdfName, pdfBytes, {
                    contentType: 'application/pdf',
                    cacheControl: "3600", 
                    upsert: true
                  })

                if (pdfUploadError) {
                  console.error(`❌ Error uploading split PDF page ${pageNum}:`, pdfUploadError)
                }

                // Get PDF URL
                const { data: pdfUrlData } = supabase
                  .storage
                  .from('split-pdfs')
                  .getPublicUrl(pagePdfName)

                // Upload text content
                const { error: textUploadError } = await supabase
                  .storage
                  .from('text-files')
                  .upload(textFileName, textContent, {
                    contentType: 'text/plain',
                    cacheControl: "3600", 
                    upsert: true
                  })

                if (textUploadError) {
                  console.error(`❌ Error uploading text file for page ${pageNum}:`, textUploadError)
                }

                // Get text URL
                const { data: textUrlData } = supabase
                  .storage
                  .from('text-files')
                  .getPublicUrl(textFileName)

                // PASO 4: Guardar directamente en las tablas correctas si tenemos datos completos
                let dbSaved = false
                let nominaRecord = null

                if (Object.keys(fullNominaData).length > 0) {
                  try {
                    // Generate UUID for the nomina record
                    const nominaId = uuidv4()
                    
                    // NORMALIZACIÓN DE DATOS
                    // Normalizar NSS/Social Security Number
                    const normalizedEmployee = {
                      ...fullNominaData.employee,
                      nss: fullNominaData.employee?.nss || 
                           fullNominaData.employee?.social_security_number || 
                           fullNominaData.employee?.social_security || 
                           null
                    }
                    
                    // Calcular sueldo bruto si no está disponible
                    const grossSalary = fullNominaData.gross_salary || 
                                       fullNominaData.perceptions?.reduce((sum: number, p: any) => sum + (p.amount || 0), 0) || 0
                    
                    // Calcular coste empresa automáticamente si no está disponible
                    let costEmpresa = fullNominaData.cost_empresa || fullNominaData.employer_cost || 0
                    
                    if (!costEmpresa && grossSalary > 0) {
                      // Calcular coste empresa: sueldo bruto + cotizaciones patronales
                      const employerContributions = fullNominaData.contributions?.reduce((sum: number, c: any) => 
                        sum + (c.employer_contribution || 0), 0) || 0
                      
                      costEmpresa = grossSalary + employerContributions
                      console.log(`💰 Auto-calculated cost_empresa for ${correctedBasicInfo.employeeName}: Gross(${grossSalary}) + Contributions(${employerContributions}) = ${costEmpresa}`)
                    }
                    
                    // Prepare data for nominas table (VERIFICADO CON MCP SUPABASE + NORMALIZADO)
                    const nominaData = {
                      id: nominaId,
                      company_id: companyId,
                      employee_id: employeeId,
                      period_start: fullNominaData.period_start || '2024-01-01',
                      period_end: fullNominaData.period_end || '2024-01-31',
                      employee: normalizedEmployee,
                      company: fullNominaData.company || {},
                      perceptions: fullNominaData.perceptions || [],
                      deductions: fullNominaData.deductions || [],
                      contributions: fullNominaData.contributions || [],
                      base_ss: fullNominaData.base_ss || 0,
                      net_pay: fullNominaData.net_pay || 0,
                      gross_salary: grossSalary, // Agregar campo de sueldo bruto
                      iban: fullNominaData.bank?.iban || null,
                      swift_bic: fullNominaData.bank?.swift_bic || null,
                      cost_empresa: costEmpresa, // Usar valor calculado
                      signed: false, // Siempre false por defecto (pendiente de firma)
                    }

                    // Save to nominas table
                    const { data: insertedData, error: insertError } = await supabase
                      .from('nominas')
                      .insert([nominaData])
                      .select()

                    if (insertError) {
                      console.error(`❌ Error saving to nominas table page ${pageNum}:`, insertError)
                    } else {
                      nominaRecord = insertedData[0]
                      console.log(`✅ Page ${pageNum} saved to nominas table`)
                    }

                    // CORRECCIÓN: Update processed_documents table with CORRECT column name
                    const processedDocumentData = {
                      id: pageId,
                      original_filename: pagePdfName,
                      document_type_id: documentType.id,
                      company_id: companyId,
                      employee_id: employeeId,
                      extracted_text: textContent,
                      processed_data: fullNominaData, // ✅ CORRECTO: processed_data (NO nomina_data)
                      processing_status: 'completed',
                      split_pdf_paths: [pagePdfName],
                      text_file_paths: [textFileName]
                    }

                    console.log(`💾 Saving processed_documents with data:`, {
                      id: pageId,
                      original_filename: pagePdfName,
                      hasProcessedData: !!fullNominaData && Object.keys(fullNominaData).length > 0
                    })

                    const { error: processedDocError } = await supabase
                      .from('processed_documents')
                      .upsert(processedDocumentData)

                    if (!processedDocError) {
                      dbSaved = true
                      console.log(`✅ Page ${pageNum} saved to processed_documents with correct processed_data column`)
                    } else {
                      console.error(`❌ Error saving page ${pageNum} to processed_documents:`, processedDocError)
                    }

                  } catch (dbError) {
                    console.error(`❌ Database error for page ${pageNum}:`, dbError)
                  }
                } else {
                  // If no full data, still create processed_documents entry for tracking
                  const basicProcessedDocumentData = {
                    id: pageId,
                    original_filename: pagePdfName,
                    document_type_id: documentType.id,
                    company_id: companyId,
                    employee_id: employeeId,
                    extracted_text: textContent,
                    processing_status: 'pending',
                    split_pdf_paths: [pagePdfName],
                    text_file_paths: [textFileName]
                    // NO processed_data if no full data extracted
                  }

                  const { error: processedDocError } = await supabase
                    .from('processed_documents')
                    .insert(basicProcessedDocumentData)

                  if (!processedDocError) {
                    console.log(`✅ Page ${pageNum} saved to processed_documents (tracking only)`)
                  } else {
                    console.error(`❌ Error saving basic processed_documents entry for page ${pageNum}:`, processedDocError)
                  }
                }

                // Add to documents array with proper structure
                documents.push({
                  id: pageId,
                  filename: pagePdfName,
                  pageNumber: pageNum,
                  pdfUrl: pdfUrlData.publicUrl,
                  textUrl: textUrlData.publicUrl,
                  textContent,
                  claudeProcessed: Object.keys(fullNominaData).length > 0,
                  nominaData: Object.keys(fullNominaData).length > 0 ? {
                    id: nominaRecord?.id || pageId, // Use nominaRecord ID if available, otherwise pageId
                    nominaId: nominaRecord?.id || pageId,
                    period_start: fullNominaData.period_start || '',
                    period_end: fullNominaData.period_end || '',
                    employee: fullNominaData.employee || {},
                    company: fullNominaData.company || {},
                    perceptions: fullNominaData.perceptions || [],
                    deductions: fullNominaData.deductions || [],
                    contributions: fullNominaData.contributions || [],
                    base_ss: fullNominaData.base_ss || 0,
                    net_pay: fullNominaData.net_pay || 0,
                    gross_salary: fullNominaData.gross_salary || 
                                 fullNominaData.perceptions?.reduce((sum: number, p: any) => sum + (p.amount || 0), 0) || 0,
                    iban: fullNominaData.bank?.iban || fullNominaData.iban || '',
                    swift_bic: fullNominaData.bank?.swift_bic || fullNominaData.swift_bic || '',
                    cost_empresa: fullNominaData.cost_empresa || fullNominaData.employer_cost || 
                                 (fullNominaData.gross_salary || 0) + 
                                 (fullNominaData.contributions?.reduce((sum: number, c: any) => sum + (c.employer_contribution || 0), 0) || 0),
                    signed: false
                  } : undefined
                })

                // Update progress
                const completedProgress = 20 + Math.round(((i + 1) / pageCount) * 75)
                sendProgress(completedProgress, `Página ${pageNum} completada (${correctedBasicInfo.employeeName})`, pageNum, pageCount)

              } catch (pageError) {
                console.error(`❌ Error in unified processing for page ${pageNum}:`, pageError)
                // Continue with next page instead of failing completely
              }
            }

            sendProgress(100, `¡Procesamiento unificado completado! ${documents.length} documentos procesados`)
            console.log(`🎉 UNIFIED PDF processing completed! Created ${documents.length} documents`)

            // Send completion event
            sendComplete(documents)

          } catch (error) {
            console.error('💥 Critical unified processing error:', error)
            sendError(error instanceof Error ? error.message : 'Unknown error')
          }
        })()
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })

  } catch (error) {
    console.error('💥 Critical processing error:', error)
    return NextResponse.json({ 
      error: 'Processing failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 