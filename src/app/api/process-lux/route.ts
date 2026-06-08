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
import { getSupabaseClient } from '@/lib/supabase'
import { assertUploadQuota } from '@/lib/upload-quota'
import { parsePDF } from '@/lib/pdf-utils'
import { extractBasicNominaInfo, generateSplitFileName, generateTextFileName, correctNameFormat, generateGlobalFileName } from '@/lib/pdf-naming'
import Anthropic from '@anthropic-ai/sdk'

interface SplitDocument {
  id: string
  filename: string
  pageNumber: number
  textContent: string
  pdfUrl: string
  textUrl: string
  claudeProcessed: boolean
  savedToDb?: boolean
  nominaData?: any
}

interface GlobalFileInfo {
  companyName: string
  period: string
  totalPages: number
}

type EmployeeLookup = { id: string; image_url: string | null }

/**
 * Resuelve el empleado por DNI/NIF dentro de la empresa.
 * La tabla `nominas` exige `employee_id` NOT NULL, así que sin match no se puede persistir.
 */
async function lookupEmployeeByDni(
  supabase: ReturnType<typeof getSupabaseClient>,
  companyId: string | null,
  dni: string | null | undefined,
): Promise<EmployeeLookup | null> {
  if (!companyId || !dni) return null
  const dniLimpio = String(dni).trim().toUpperCase()
  const { data: employee, error } = await supabase
    .from('employees')
    .select('id, nif, image_url, company_id')
    .eq('nif', dniLimpio)
    .eq('company_id', companyId)
    .maybeSingle()
  if (error) {
    console.error('[PROCESS_LUX] Error buscando empleado por DNI:', error)
    return null
  }
  return employee?.id ? { id: employee.id, image_url: employee.image_url || null } : null
}

/**
 * Helper para logs con timestamp y duración
 */
function logWithTime(label: string, startTime?: number) {
  const now = Date.now()
  const timestamp = new Date(now).toISOString()
  if (startTime) {
    const duration = now - startTime
    console.log(`[${timestamp}] ⏱️ ${label} - Duración: ${duration}ms`)
    return duration
  } else {
    console.log(`[${timestamp}] 🚀 ${label}`)
    return now
  }
}

/**
 * Extrae información del archivo global usando Haiku 3.5
 */
async function extractGlobalFileInfo(filename: string, pdfBuffer: Buffer): Promise<GlobalFileInfo> {
  const startTime = logWithTime(`Extrayendo información global del archivo: ${filename}`)
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    })
    
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

    const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001"
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
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
    logWithTime(`Información global extraída: ${globalInfo.companyName}`, startTime)
    
    return {
      companyName: globalInfo.companyName || 'Empresa_Desconocida',
      period: globalInfo.period || new Date().getFullYear() + String(new Date().getMonth() + 1).padStart(2, '0'),
      totalPages: 0 // Will be set later
    }

  } catch (error) {
    logWithTime(`ERROR extrayendo información global`, startTime)
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
  const startTime = logWithTime(`Procesando página ${pageNum} con Claude`)
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    })
    
    // Extract text content for storage
    const parseStart = logWithTime(`Extrayendo texto de página ${pageNum}`)
    const textContent = await parsePDF(Buffer.from(pdfBytes))
    logWithTime(`Texto extraído de página ${pageNum}`, parseStart)
    
    // Use Haiku 3.5 to extract ALL information at once
    const claudeStart = logWithTime(`Enviando página ${pageNum} a Claude API`)
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
9. Cotizaciones sociales (SOLO contribuciones empresariales, NO del empleado)
10. Base SS y neto a pagar
11. Datos bancarios si están disponibles
12. Coste empresa: gross_salary + suma total de contribuciones empresariales
13. Estado de firma: Por defecto siempre false (pendiente de firma)

DIFERENCIA IMPORTANTE:
- CONTRIBUCIONES (contributions): SOLO lo que paga la empresa (Seg. Social empresa, desempleo empresa, etc.)
- DEDUCCIONES (deductions): Lo que se DESCUENTA del sueldo del empleado (IRPF, Seg. Social empleado, etc.)

IMPORTANTE PARA COSTE EMPRESA:
- Coste empresa = gross_salary + suma de todas las contribuciones empresariales
- Las contribuciones DE LA EMPRESA incluyen: Seguridad Social a cargo empresa, desempleo a cargo empresa, formación profesional a cargo empresa, etc.
- NO incluyas las contribuciones que descuentan al empleado (esas van en deductions)

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
      {"concept": "concepto", "base": base, "rate": tasa, "employer_contribution": contribución_a_cargo_empresa}
    ],
    "base_ss": base_seguridad_social,
    "net_pay": neto_a_pagar,
    "gross_salary": sueldo_bruto,
    "total_contributions": suma_total_contribuciones_empresariales,
    "bank": {
      "iban": "IBAN si disponible",
      "swift_bic": "SWIFT/BIC si disponible"
    },
    "cost_empresa": coste_empresa_calculado_o_encontrado,
    "signed": false
  }
}`

    const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001"
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
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
    const claudeDuration = logWithTime(`Claude API respondió para página ${pageNum}`, claudeStart)
    
    // Clean the response - más robusto
    if (cleanedResponse.includes('```json')) {
      cleanedResponse = cleanedResponse.replace(/```json\s*/g, '').replace(/```\s*$/g, '')
    } else if (cleanedResponse.includes('```')) {
      cleanedResponse = cleanedResponse.replace(/```\s*/g, '').replace(/```\s*$/g, '')
    }
    
    const firstBrace = cleanedResponse.indexOf('{')
    const lastBrace = cleanedResponse.lastIndexOf('}')
    
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      console.error(`❌ JSON inválido recibido para página ${pageNum}:`, cleanedResponse.substring(0, 200))
      throw new Error(`Invalid JSON response from Claude for page ${pageNum}`)
    }
    
    cleanedResponse = cleanedResponse.substring(firstBrace, lastBrace + 1)
    
    let result
    try {
      result = JSON.parse(cleanedResponse)
    } catch (parseError) {
      console.error(`❌ Error parseando JSON para página ${pageNum}:`, cleanedResponse.substring(0, 500))
      throw new Error(`JSON parse error for page ${pageNum}: ${parseError instanceof Error ? parseError.message : 'Unknown'}`)
    }
    
    logWithTime(`Página ${pageNum} procesada completamente`, startTime)
    
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
    logWithTime(`ERROR procesando página ${pageNum}`, startTime)
    console.error(`Error processing page ${pageNum} with full data:`, error)
    
    // Fallback to basic extraction
    try {
      const textContent = await parsePDF(Buffer.from(pdfBytes))
      const basicInfo = await extractBasicNominaInfo(Buffer.from(pdfBytes))
      
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
    const body = await request.json()

    console.log('📥 Endpoint process-lux recibió:', {
      hasTextContent: !!body.textContent,
      textLength: body.textContent?.length || 0,
      hasDocumentId: !!body.documentId,
      hasFilename: !!body.filename,
      hasUrl: !!body.url
    })

    // Handle cases:
    // 1) Reproceso individual a partir del PDF (documentId + filename, sin url) -> recomendado
    // 2) Reproceso individual a partir de texto (textContent + documentId) -> legacy
    // 3) Procesamiento completo (filename + url)
    if (body.documentId && body.filename && !body.url) {
      console.log('✅ Reprocesando documento individual a partir del PDF')
      return await processIndividualDocumentByPdf(body.documentId, body.filename, body.companyId ?? null)
    } else if (body.textContent && body.documentId) {
      console.log('✅ Procesando documento individual con Claude (texto)')
      // Individual document processing with Claude
      return await processIndividualDocument(body.textContent, body.documentId)
    } else if (body.filename && body.url) {
      if (!body.companyId) {
        return NextResponse.json({
          error: 'companyId requerido',
          details: 'Para procesar un PDF completo se debe enviar companyId (empresa actual) en el body.'
        }, { status: 400 })
      }
      console.log('✅ Procesando PDF completo con streaming')
      return await processFullPDF(body.filename, body.url, body.companyId, body.employeeId ?? null)
    } else {
      console.error('❌ Parámetros inválidos:', { body })
      return NextResponse.json({ 
        error: 'Parámetros inválidos',
        details: 'Se requiere (textContent + documentId) para documento individual o (filename + url) para PDF completo',
        received: {
          hasTextContent: !!body.textContent,
          hasDocumentId: !!body.documentId,
          hasFilename: !!body.filename,
          hasUrl: !!body.url
        }
      }, { status: 400 })
    }
  } catch (error) {
    console.error('💥 Critical processing error:', error)
    return NextResponse.json({
      error: 'Processing failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * Reprocesa un documento individual descargando su PDF del bucket `Nominas`
 * y enviándolo a Claude (no depende del texto extraído, que ya no se genera).
 * Persiste el resultado en `nominas` y `processed_documents`.
 */
async function processIndividualDocumentByPdf(documentId: string, filename: string, companyIdFromBody: string | null) {
  const startTime = logWithTime(`🧠 Reprocesando documento por PDF: ${documentId} (${filename})`)

  try {
    const supabase = getSupabaseClient()

    // Resolver company_id y employee_id desde processed_documents si es posible
    let companyId: string | null = companyIdFromBody
    let employeeId: string | null = null
    try {
      const { data: docRow } = await supabase
        .from('processed_documents')
        .select('company_id, employee_id')
        .eq('id', documentId)
        .maybeSingle()
      if (docRow) {
        companyId = companyId || docRow.company_id || null
        employeeId = docRow.employee_id || null
      }
    } catch (e) {
      console.warn('[PROCESS_LUX] No se pudo leer processed_documents:', e)
    }

    // Descargar el PDF de la página desde el bucket Nominas
    const { data: fileData, error: dlError } = await supabase.storage.from('Nominas').download(filename)
    if (dlError || !fileData) {
      logWithTime(`ERROR descargando PDF para reproceso`, startTime)
      return NextResponse.json({
        success: false,
        error: 'No se pudo descargar el PDF del documento.',
        details: dlError?.message,
      }, { status: 400 })
    }

    const pdfBytes = new Uint8Array(await fileData.arrayBuffer())

    // Extraer datos con Claude (extracción completa, igual que el flujo de subida)
    const { fullNominaData } = await processPageWithFullData(pdfBytes, 1)

    if (!fullNominaData || Object.keys(fullNominaData).length === 0) {
      logWithTime(`ERROR: Claude no devolvió datos`, startTime)
      return NextResponse.json({
        success: false,
        error: 'No se pudieron extraer los datos de la nómina. Inténtalo de nuevo.',
      }, { status: 422 })
    }

    // Cálculos derivados
    const grossSalary = fullNominaData.gross_salary ||
      fullNominaData.perceptions?.reduce((sum: number, p: any) => sum + (p.amount || 0), 0) || 0
    const totalContributions = fullNominaData.contributions?.reduce((sum: number, c: any) =>
      sum + (c.employer_contribution || c.amount || 0), 0) || 0
    const costEmpresa = grossSalary + totalContributions

    const normalizedEmployee = {
      ...fullNominaData.employee,
      nss: fullNominaData.employee?.nss ||
           fullNominaData.employee?.social_security_number ||
           fullNominaData.employee?.social_security || null,
    }

    const employeeMatch = await lookupEmployeeByDni(supabase, companyId, normalizedEmployee.dni)
    const resolvedEmployeeId = employeeId ?? employeeMatch?.id ?? null
    const employeeAvatar = employeeMatch?.image_url ?? null

    if (!resolvedEmployeeId) {
      logWithTime(`ERROR: employee_id no resuelto (DNI: ${normalizedEmployee.dni ?? 'sin DNI'})`, startTime)
      return NextResponse.json({
        success: false,
        error: 'No se pudo guardar la nómina: el empleado no está registrado en la empresa.',
        details: normalizedEmployee.dni
          ? `No hay ningún empleado con NIF ${normalizedEmployee.dni} en esta empresa. Créalo primero en Empleados.`
          : 'Claude no extrajo el DNI/NIF del documento.',
      }, { status: 422 })
    }

    // Guardar en nominas: actualizar si ya existe por document_name, si no insertar
    const nominaPayload = {
      company_id: companyId,
      employee_id: resolvedEmployeeId,
      period_start: fullNominaData.period_start || '2024-01-01',
      period_end: fullNominaData.period_end || '2024-01-31',
      employee: normalizedEmployee,
      company: fullNominaData.company || {},
      perceptions: fullNominaData.perceptions || [],
      deductions: fullNominaData.deductions || [],
      contributions: fullNominaData.contributions || [],
      base_ss: fullNominaData.base_ss || 0,
      net_pay: fullNominaData.net_pay || 0,
      gross_salary: grossSalary,
      total_contributions: totalContributions,
      dni: normalizedEmployee.dni || null,
      iban: fullNominaData.bank?.iban || fullNominaData.iban || null,
      swift_bic: fullNominaData.bank?.swift_bic || fullNominaData.swift_bic || null,
      cost_empresa: costEmpresa,
      signed: false,
      document_name: filename,
    }

    let nominaRecord: any = null
    try {
      const { data: existing } = await supabase
        .from('nominas')
        .select('id')
        .eq('document_name', filename)
        .maybeSingle()

      if (existing?.id) {
        const { data: updated, error: updErr } = await supabase
          .from('nominas')
          .update(nominaPayload)
          .eq('id', existing.id)
          .select()
        if (updErr) console.error('[PROCESS_LUX] Error actualizando nomina:', updErr)
        else nominaRecord = updated?.[0] || null
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from('nominas')
          .insert([{ id: uuidv4(), ...nominaPayload }])
          .select()
        if (insErr) console.error('[PROCESS_LUX] Error insertando nomina:', insErr)
        else nominaRecord = inserted?.[0] || null
      }
    } catch (dbError) {
      console.error('[PROCESS_LUX] Error guardando nomina (reproceso):', dbError)
    }

    // Actualizar processed_documents a completed con los datos extraídos
    try {
      await supabase
        .from('processed_documents')
        .update({
          processed_data: { ...fullNominaData, page_number: 1 },
          processing_status: 'completed',
        })
        .eq('id', documentId)
    } catch (pdErr) {
      console.error('[PROCESS_LUX] Error actualizando processed_documents (reproceso):', pdErr)
    }

    logWithTime(`✅ Documento reprocesado por PDF`, startTime)

    return NextResponse.json({
      success: true,
      data: {
        processedData: {
          ...fullNominaData,
          employee: normalizedEmployee,
          gross_salary: grossSalary,
          total_contributions: totalContributions,
          cost_empresa: costEmpresa,
          iban: nominaPayload.iban || '',
          swift_bic: nominaPayload.swift_bic || '',
          id: nominaRecord?.id,
          nominaId: nominaRecord?.id,
          employee_avatar: employeeAvatar,
          signed: false,
        },
        documentId,
        mode: 'lux-pdf',
      },
    })

  } catch (error) {
    logWithTime(`❌ ERROR reprocesando documento por PDF`, startTime)
    console.error('Error en processIndividualDocumentByPdf:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido al reprocesar el documento.',
    }, { status: 500 })
  }
}

async function processIndividualDocument(textContent: string, documentId: string) {
  const startTime = logWithTime(`🧠 Procesando documento individual: ${documentId}`)
  console.log(`📝 Longitud del texto: ${textContent.length} caracteres`)

  // Validar que el texto tenga suficiente contenido
  if (!textContent || textContent.trim().length < 100) {
    logWithTime(`ERROR: Texto insuficiente (${textContent.length} caracteres)`, startTime)
    return NextResponse.json({
      success: false,
      error: 'Texto insuficiente para procesar',
      details: `El documento tiene solo ${textContent.length} caracteres. Se requiere al menos 100 caracteres. Por favor, vuelve a subir el PDF completo.`
    }, { status: 400 })
  }

  const RETRY_ATTEMPTS = 3
  const RETRY_DELAY_BASE = 3000

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY!,
      })
    
      // Use Claude 3.5 Haiku to process the document
      const prompt = `TAREA: Analizar nómina española y extraer datos estructurados con máxima precisión.

✅ INSTRUCCIONES CRÍTICAS:
1. Responder SOLO con JSON válido, sin explicaciones adicionales
2. Si no encuentras un campo, usa null o [] según el tipo
3. Nunca dejar comillas sin cerrar
4. Validar que gross_salary >= net_pay
5. Incluir TODOS los campos incluso si están vacíos

📋 DATOS OBLIGATORIOS DEL EMPLEADO:
- name: "APELLIDOS, NOMBRE" → convertir a "NOMBRE APELLIDOS" 
- dni: Buscar DNI/NIF (patrones: 12345678A, 12.345.678-A, etc)
- nss: Número Seguridad Social (buscar en "NSS", "Afiliación", "Núm. SS")
- category: Categoría profesional
- code: Código del empleado si existe

🏢 DATOS OBLIGATORIOS DE LA EMPRESA:
- name: Nombre completo de la empresa
- cif: CIF (formato: A12345678)
- address: Dirección completa
- center_code: Código del centro si existe

📅 PERÍODO:
- period_start: Fecha inicio (YYYY-MM-DD) - buscar "Del" o primera fecha
- period_end: Fecha fin (YYYY-MM-DD) - buscar "Al" o última fecha

💰 CONCEPTOS FINANCIEROS - MUY IMPORTANTE:
PERCEPCIONES: Todos los ingresos (salario base, pluses, horas extra)
DEDUCCIONES: IRPF, Seg. Social empleado, descuentos voluntarios
CONTRIBUCIONES: SOLO aportes de la EMPRESA (CC Empresa, Desempleo Empresa, FP Empresa)

Fórmula clave:
- gross_salary = suma de percepciones principales
- net_pay = gross_salary - deducciones del empleado
- cost_empresa = gross_salary + contribuciones empresariales

🏦 DATOS OPCIONALES:
- iban: Si aparece número de cuenta IBAN
- swift_bic: Si aparece código SWIFT/BIC

⚠️ SI ALGO NO ESTÁ CLARO:
- Para números: usar 0
- Para texto: usar ""
- Para arrays: usar []
- NUNCA dejar valores undefined o faltantes

Responde ÚNICAMENTE con este JSON válido:
{
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
  "period_start": "YYYY-MM-DD",
  "period_end": "YYYY-MM-DD",
  "perceptions": [
    {"concept": "concepto", "code": "código", "amount": cantidad}
  ],
  "deductions": [
    {"concept": "concepto", "code": "código", "amount": cantidad}
  ],
  "contributions": [
    {"concept": "concepto", "base": base, "rate": tasa, "employer_contribution": contribución_empresa}
  ],
  "base_ss": base_seguridad_social,
  "net_pay": neto_a_pagar,
  "gross_salary": sueldo_bruto,
  "cost_empresa": coste_empresa_total,
  "iban": "IBAN si disponible",
  "swift_bic": "SWIFT/BIC si disponible",
  "signed": false
}`

    const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001"
    const claudeStart = logWithTime(`Enviando a Claude API (${MODEL})`)
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: prompt + "\n\nTexto del documento:\n" + textContent
        }
      ]
    })
    const claudeDuration = logWithTime(`Claude API respondió`, claudeStart)

    const responseText = response.content[0].type === 'text' ? response.content[0].text : ''
    console.log(`📊 Respuesta Claude: ${responseText.length} caracteres`)

    // Parse JSON response
    const parseStart = logWithTime('Parseando respuesta JSON de Claude')
    let processedData
    try {
      processedData = JSON.parse(responseText)
      logWithTime('JSON parseado correctamente', parseStart)
    } catch (parseError) {
      logWithTime('ERROR parseando JSON', parseStart)
      console.error('Error parsing Claude response:', parseError)
      throw new Error('Invalid JSON response from Claude')
    }

      // Buscar avatar del empleado en la tabla employees por DNI y company_id
      let employeeAvatar = null
      const dni = processedData?.employee?.dni
      console.log(`[PROCESS_LUX] 🔍 Buscando avatar para documento ${documentId}`)
      console.log(`[PROCESS_LUX] DNI extraído:`, dni)
      console.log(`[PROCESS_LUX] processedData.employee:`, processedData?.employee)
      
      // Obtener company_id del documento procesado
      let companyId = null
      try {
        const supabase = getSupabaseClient()
        const { data: document } = await supabase
          .from('processed_documents')
          .select('company_id')
          .eq('id', documentId)
          .maybeSingle()
        
        companyId = document?.company_id || null
        console.log(`[PROCESS_LUX] company_id obtenido del documento:`, companyId)
      } catch (docError) {
        console.error(`[PROCESS_LUX] Error obteniendo company_id:`, docError)
      }
      
      if (dni && companyId) {
        try {
          const supabase = getSupabaseClient()
          const dniLimpio = dni.trim().toUpperCase()
          console.log(`[PROCESS_LUX] Buscando en employees.nif = "${dniLimpio}" y company_id = "${companyId}"`)
          const { data: employee, error } = await supabase
            .from('employees')
            .select('nif, image_url, company_id')
            .eq('nif', dniLimpio)
            .eq('company_id', companyId)
            .maybeSingle()
          
          console.log(`[PROCESS_LUX] Resultado búsqueda:`, {
            dniBuscado: dniLimpio,
            companyId: companyId,
            encontrado: !!employee,
            employeeNif: employee?.nif,
            employeeCompanyId: employee?.company_id,
            imageUrl: employee?.image_url,
            error: error?.message
          })
          
          employeeAvatar = employee?.image_url || null
          if (employeeAvatar) {
            console.log(`[PROCESS_LUX] ✅ Avatar encontrado para DNI ${dniLimpio} y company ${companyId}:`, employeeAvatar)
          } else {
            console.warn(`[PROCESS_LUX] ⚠️ No se encontró avatar para DNI ${dniLimpio} y company ${companyId}`)
          }
        } catch (avatarError) {
          console.error(`[PROCESS_LUX] ❌ Error buscando avatar:`, avatarError)
        }
      } else {
        if (!dni) {
          console.warn(`[PROCESS_LUX] ⚠️ No hay DNI disponible en processedData`)
        }
        if (!companyId) {
          console.warn(`[PROCESS_LUX] ⚠️ No hay company_id disponible`)
        }
      }
      
      console.log(`[PROCESS_LUX] Avatar final asignado:`, employeeAvatar)

      logWithTime(`✅ Documento individual procesado completamente`, startTime)
      return NextResponse.json({
        success: true,
        data: {
          processedData: {
            ...processedData,
            employee_avatar: employeeAvatar
          },
          documentId,
          mode: 'lux'
        }
      })

    } catch (error: any) {
      const isRateLimit = error?.status === 429 || error?.status === 529 || 
        error?.message?.includes('rate') || error?.message?.includes('overloaded')
      
      console.error(`⚠️ Error procesando documento (intento ${attempt}/${RETRY_ATTEMPTS}):`, error?.message || error)
      
      if (attempt < RETRY_ATTEMPTS) {
        // Backoff exponencial para rate limiting
        const delay = isRateLimit 
          ? RETRY_DELAY_BASE * Math.pow(2, attempt - 1) 
          : RETRY_DELAY_BASE
        console.log(`⏳ Esperando ${delay}ms antes de reintentar...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      } else {
        logWithTime(`❌ ERROR procesando documento individual después de ${RETRY_ATTEMPTS} intentos`, startTime)
        return NextResponse.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          retryExhausted: true
        }, { status: 500 })
      }
    }
  }

  // Fallback final
  return NextResponse.json({
    success: false,
    error: 'Error desconocido después de todos los reintentos'
  }, { status: 500 })
}

async function processFullPDF(filename: string, url: string, companyId: string, employeeId: string | null) {
  const processStartTime = logWithTime(`🚀 INICIO procesamiento completo PDF: ${filename}`)
  console.log('📄 URL:', url, 'companyId:', companyId)

  try {
    const supabase = getSupabaseClient()
    
    // Get document type ID for nomina (with fallback)
    const dbStart = logWithTime('Buscando document_type en DB')
    let documentTypeId = 'nomina-type-id'
    const { data: documentType, error: docTypeError } = await supabase
      .from('document_types')
      .select('id')
      .eq('name', 'nomina')
      .single()

    if (documentType?.id) {
      documentTypeId = documentType.id
      logWithTime(`Document type encontrado: ${documentTypeId}`, dbStart)
    } else {
      logWithTime('Document type NO encontrado, usando fallback', dbStart)
      console.warn('⚠️ Document type not found in DB, using fallback:', documentTypeId)
    }

    // employeeId opcional: si no se envía, las nóminas se asocian a la company; el empleado puede resolverse después por DNI
    const effectiveEmployeeId = employeeId ?? undefined

    // Create a readable stream for Server-Sent Events
    const encoder = new TextEncoder()
    
    const stream = new ReadableStream({
      start(controller) {
        let streamClosed = false
        
        const sendProgress = (progress: number, message: string, currentPage?: number, totalPages?: number) => {
          if (streamClosed) return
          try {
            const data = JSON.stringify({ 
              progress, 
              message, 
              currentPage, 
              totalPages,
              type: 'progress' 
            })
            controller.enqueue(encoder.encode(`data: ${data}\n\n`))
          } catch (error) {
            console.error('Error sending progress:', error)
          }
        }

        const sendError = (error: string) => {
          if (streamClosed) return
          try {
            streamClosed = true
            const data = JSON.stringify({ error, type: 'error' })
            controller.enqueue(encoder.encode(`data: ${data}\n\n`))
            controller.close()
          } catch (closeError) {
            console.error('Error sending error:', closeError)
          }
        }

        const sendComplete = (documents: SplitDocument[]) => {
          if (streamClosed) return
          try {
            streamClosed = true
            const data = JSON.stringify({ 
              documents, 
              type: 'complete',
              totalDocumentsCreated: documents.length,
              unified: true
            })
            controller.enqueue(encoder.encode(`data: ${data}\n\n`))
            controller.close()
          } catch (closeError) {
            console.error('Error sending completion:', closeError)
          }
        }

        // Start unified processing
        (async () => {
          try {
            sendProgress(5, 'Descargando PDF desde almacenamiento...')
            const downloadStart = logWithTime('Descargando PDF desde Supabase Storage')

            // Download the PDF from Supabase Storage
            const response = await fetch(url)
            if (!response.ok) {
              logWithTime('ERROR descargando PDF', downloadStart)
              sendError(`Failed to download PDF from storage: ${response.status} ${response.statusText}`)
              return
            }
            
            const pdfBuffer = await response.arrayBuffer()
            const downloadDuration = logWithTime(`PDF descargado (${(pdfBuffer.byteLength / 1024 / 1024).toFixed(2)} MB)`, downloadStart)
            sendProgress(10, 'PDF descargado, extrayendo información global...')
            
            // PASO 1: Extraer información global del archivo con timeout y fallback
            let globalInfo
            try {
              const globalInfoPromise = extractGlobalFileInfo(filename, Buffer.from(pdfBuffer))
              const timeoutPromise = new Promise<never>((_, reject) => 
                setTimeout(() => reject(new Error('Global info extraction timeout')), 30000)
              )
              
              globalInfo = await Promise.race([globalInfoPromise, timeoutPromise])
              console.log('📋 Global file info extracted:', globalInfo)
            } catch (globalError) {
              logWithTime('ERROR extrayendo info global, usando fallback')
              console.error('⚠️ Error extracting global info, using fallback:', globalError)
              globalInfo = {
                companyName: filename.replace('.pdf', '').replace(/[^a-zA-Z0-9]/g, '_') || 'Empresa_Desconocida',
                period: new Date().getFullYear() + String(new Date().getMonth() + 1).padStart(2, '0'),
                totalPages: 0
              }
            }

            sendProgress(15, `Archivo global analizado (${globalInfo.companyName}). Dividiendo en páginas...`)

            // Load the PDF document
            const pdfLoadStart = logWithTime('Cargando PDF con pdf-lib')
            const pdfDoc = await PDFDocument.load(pdfBuffer)
            const pageCount = pdfDoc.getPageCount()
            globalInfo.totalPages = pageCount
            logWithTime(`PDF cargado: ${pageCount} páginas`, pdfLoadStart)
            
            console.log('📄 PDF has', pageCount, 'pages')

            try {
              await assertUploadQuota(supabase, companyId, pageCount)
            } catch (quotaError) {
              const message = quotaError instanceof Error ? quotaError.message : 'Límite de subida alcanzado'
              logWithTime(`ERROR cuota de subida: ${message}`, pdfLoadStart)
              sendError(message)
              return
            }

            sendProgress(20, `Documento dividido: ${pageCount} páginas. Procesando en paralelo...`, 0, pageCount)

            const documents: SplitDocument[] = []
            // Procesamiento secuencial con rate limiting - PRIORIDAD: CALIDAD sobre VELOCIDAD
            // Claude tiene límites de 50 RPM para Haiku, procesamos de 2 en 2 con delays
            const MAX_PARALLEL = Math.min(2, pageCount) // Máximo 2 en paralelo para evitar rate limiting
            const DELAY_BETWEEN_BATCHES = 2000 // 2 segundos entre batches para evitar rate limiting
            const RETRY_ATTEMPTS = 3 // Más reintentos
            const RETRY_DELAY_BASE = 3000 // 3 segundos base para retry
            
            logWithTime(`Iniciando procesamiento controlado: ${pageCount} páginas, batches de ${MAX_PARALLEL} con ${DELAY_BETWEEN_BATCHES}ms delay`)

            // Función helper para procesar una página con reintentos y backoff exponencial
            async function processPageWithRetry(pdfDoc: any, pageIndex: number, globalInfo: any): Promise<any> {
              const pageNum = pageIndex + 1
              const pageId = uuidv4()
              
              for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
                try {
                  console.log(`🔄 Procesando página ${pageNum}/${pageCount} (intento ${attempt}/${RETRY_ATTEMPTS})...`)
                  
                  // Create a new PDF with just this page
                  const newPdf = await PDFDocument.create()
                  const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageIndex])
                  newPdf.addPage(copiedPage)
                  const pdfBytes = await newPdf.save()
                  
                  // Procesar con timeout
                  const processPromise = processPageWithFullData(pdfBytes, pageNum)
                  const timeoutPromise = new Promise<never>((_, reject) => 
                    setTimeout(() => reject(new Error(`Page ${pageNum} processing timeout`)), 90000) // 90s timeout
                  )
                  
                  const processResult = await Promise.race([processPromise, timeoutPromise])
                  return { pageNum, pageId, pdfBytes, processResult, index: pageIndex }
                  
                } catch (error: any) {
                  const isRateLimit = error?.status === 429 || error?.status === 529 || 
                    error?.message?.includes('rate') || error?.message?.includes('overloaded')
                  
                  console.error(`⚠️ Error página ${pageNum} (intento ${attempt}):`, error?.message || error)
                  
                  if (attempt < RETRY_ATTEMPTS) {
                    // Backoff exponencial: 3s, 6s, 12s...
                    const delay = isRateLimit 
                      ? RETRY_DELAY_BASE * Math.pow(2, attempt - 1) 
                      : RETRY_DELAY_BASE
                    console.log(`⏳ Esperando ${delay}ms antes de reintentar página ${pageNum}...`)
                    await new Promise(resolve => setTimeout(resolve, delay))
                  } else {
                    // Último intento falló, usar fallback
                    console.error(`❌ Página ${pageNum} falló después de ${RETRY_ATTEMPTS} intentos, usando fallback`)
                    const newPdf = await PDFDocument.create()
                    const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageIndex])
                    newPdf.addPage(copiedPage)
                    const pdfBytes = await newPdf.save()
                    
                    return {
                      pageNum,
                      pageId,
                      pdfBytes,
                      processResult: {
                        basicInfo: {
                          companyName: globalInfo.companyName,
                          employeeName: 'Empleado_Desconocido',
                          period: globalInfo.period
                        },
                        fullNominaData: {},
                        textContent: `Error procesando página ${pageNum}: ${error instanceof Error ? error.message : 'Error desconocido'}`
                      },
                      index: pageIndex
                    }
                  }
                }
              }
              return null
            }

            // PASO 2 y 3: Process pages in controlled batches
            for (let batchStart = 0; batchStart < pageCount; batchStart += MAX_PARALLEL) {
              const batchEnd = Math.min(batchStart + MAX_PARALLEL, pageCount)
              const batchNumber = Math.floor(batchStart / MAX_PARALLEL) + 1
              const totalBatches = Math.ceil(pageCount / MAX_PARALLEL)
              
              // Delay entre batches (excepto el primero) para evitar rate limiting
              if (batchStart > 0) {
                console.log(`⏳ Esperando ${DELAY_BETWEEN_BATCHES}ms antes del batch ${batchNumber}...`)
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES))
              }
              
              const batchStartTime = logWithTime(`🔄 BATCH ${batchNumber}/${totalBatches}: Procesando páginas ${batchStart + 1}-${batchEnd}`)
              const batchPromises = []

              // Create promises for each page in batch
              for (let i = batchStart; i < batchEnd; i++) {
                batchPromises.push(processPageWithRetry(pdfDoc, i, globalInfo))
              }

              // Wait for all promises in batch with error handling
              const batchSettled = await Promise.allSettled(batchPromises)
              const batchResults = batchSettled
                .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
                .map(r => r.value)
              
              const batchDuration = logWithTime(`✅ BATCH ${batchNumber} completado: ${batchResults.length}/${batchEnd - batchStart} páginas`, batchStartTime)
              const failed = batchSettled.filter(r => r.status === 'rejected').length
              if (failed > 0) {
                console.warn(`⚠️ BATCH ${batchNumber}: ${failed} páginas fallaron`)
              }
              
              // Process results
              for (const result of batchResults) {
                if (!result) continue
                
                try {
                  const { pageNum, pageId, pdfBytes, processResult, index: i } = result
                  const { basicInfo, fullNominaData, textContent } = processResult
                  
                  // Calculate progress
                  const pageProgress = 20 + Math.round(((i + 1) / pageCount) * 75)
                  sendProgress(pageProgress, `Procesado ${i + 1}/${pageCount} páginas...`, pageNum, pageCount)
                  
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
                  const storageStart = logWithTime(`Subiendo archivos de página ${pageNum} a Storage`)
                  const { error: pdfUploadError } = await supabase
                    .storage
                    .from('Nominas')
                    .upload(pagePdfName, pdfBytes, {
                      contentType: 'application/pdf',
                      cacheControl: "3600", 
                      upsert: true
                    })

                  if (pdfUploadError) {
                    logWithTime(`ERROR subiendo PDF página ${pageNum}`, storageStart)
                    console.error(`❌ Error uploading split PDF page ${pageNum}:`, pdfUploadError)
                  }

                  // Get PDF URL - usar signed URL para producción (evita problemas de políticas)
                  let pdfUrl = ''
                  try {
                    const { data: signedUrlData, error: signedError } = await supabase
                      .storage
                      .from('Nominas')
                      .createSignedUrl(pagePdfName, 3600) // 1 hora de validez
                    
                    if (signedError || !signedUrlData) {
                      // Fallback a public URL si falla la signed
                      const { data: publicUrlData } = supabase
                        .storage
                        .from('Nominas')
                        .getPublicUrl(pagePdfName)
                      pdfUrl = publicUrlData.publicUrl
                    } else {
                      pdfUrl = signedUrlData.signedUrl
                    }
                  } catch (urlError) {
                    // Fallback a public URL en caso de error
                    const { data: publicUrlData } = supabase
                      .storage
                      .from('Nominas')
                      .getPublicUrl(pagePdfName)
                    pdfUrl = publicUrlData.publicUrl
                  }
                  
                  const pdfUrlData = { publicUrl: pdfUrl }

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
                    logWithTime(`ERROR subiendo texto página ${pageNum}`, storageStart)
                    console.error(`❌ Error uploading text file for page ${pageNum}:`, textUploadError)
                  } else {
                    logWithTime(`Archivos de página ${pageNum} subidos a Storage`, storageStart)
                  }

                  // Get text URL - usar signed URL para producción
                  let textUrl = ''
                  try {
                    const { data: signedTextUrlData, error: signedTextError } = await supabase
                      .storage
                      .from('text-files')
                      .createSignedUrl(textFileName, 3600) // 1 hora de validez
                    
                    if (signedTextError || !signedTextUrlData) {
                      // Fallback a public URL si falla la signed
                      const { data: publicTextUrlData } = supabase
                        .storage
                        .from('text-files')
                        .getPublicUrl(textFileName)
                      textUrl = publicTextUrlData.publicUrl
                    } else {
                      textUrl = signedTextUrlData.signedUrl
                    }
                  } catch (urlError) {
                    // Fallback a public URL en caso de error
                    const { data: publicTextUrlData } = supabase
                      .storage
                      .from('text-files')
                      .getPublicUrl(textFileName)
                    textUrl = publicTextUrlData.publicUrl
                  }
                  
                  const textUrlData = { publicUrl: textUrl }

                  // PASO 4: Guardar directamente en las tablas correctas si tenemos datos completos
                  let dbSaved = false
                  let nominaRecord = null
                  let employeeAvatar: string | null = null

                  if (Object.keys(fullNominaData).length > 0) {
                    const dbSaveStart = logWithTime(`Guardando página ${pageNum} en base de datos`)
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
                      
                      // Calcular total de contribuciones empresariales
                      const totalContributions = fullNominaData.contributions?.reduce((sum: number, c: any) => 
                        sum + (c.employer_contribution || c.amount || 0), 0) || 0
                      
                      // Calcular coste empresa: sueldo bruto + total contribuciones empresariales
                      const costEmpresa = grossSalary + totalContributions
                      
                      console.log(`💰 Calculated for ${correctedBasicInfo.employeeName}: Gross(${grossSalary}) + Contributions(${totalContributions}) = Cost Empresa(${costEmpresa})`)

                      const employeeMatch = await lookupEmployeeByDni(
                        supabase,
                        companyId,
                        normalizedEmployee.dni,
                      )
                      const resolvedEmployeeId = effectiveEmployeeId ?? employeeMatch?.id ?? null
                      employeeAvatar = employeeMatch?.image_url ?? null

                      if (!resolvedEmployeeId) {
                        logWithTime(
                          `ERROR: employee_id no resuelto página ${pageNum} (DNI: ${normalizedEmployee.dni ?? 'sin DNI'})`,
                          dbSaveStart,
                        )
                        console.error(
                          `❌ No se guardó la nómina de la página ${pageNum}: empleado no encontrado en la empresa (DNI: ${normalizedEmployee.dni ?? 'sin DNI'})`,
                        )
                      } else {
                      // Prepare data for nominas table (VERIFICADO CON MCP SUPABASE + NORMALIZADO)
                      const nominaData = {
                        id: nominaId,
                        company_id: companyId,
                        employee_id: resolvedEmployeeId,
                        period_start: fullNominaData.period_start || '2024-01-01',
                        period_end: fullNominaData.period_end || '2024-01-31',
                        employee: normalizedEmployee,
                        company: fullNominaData.company || {},
                        perceptions: fullNominaData.perceptions || [],
                        deductions: fullNominaData.deductions || [],
                        contributions: fullNominaData.contributions || [],
                        base_ss: fullNominaData.base_ss || 0,
                        net_pay: fullNominaData.net_pay || 0,
                        gross_salary: grossSalary,
                        total_contributions: totalContributions,
                        dni: normalizedEmployee.dni || null,
                        iban: fullNominaData.bank?.iban || null,
                        swift_bic: fullNominaData.bank?.swift_bic || null,
                        cost_empresa: costEmpresa,
                        signed: false,
                        document_name: pagePdfName,
                      }

                      // Save to nominas table
                      const nominaInsertStart = logWithTime(`Insertando en tabla nominas página ${pageNum}`)
                      const { data: insertedData, error: insertError } = await supabase
                        .from('nominas')
                        .insert([nominaData])
                        .select()

                      if (insertError) {
                        logWithTime(`ERROR insertando en nominas página ${pageNum}`, nominaInsertStart)
                        console.error(`❌ Error saving to nominas table page ${pageNum}:`, insertError)
                      } else {
                        nominaRecord = insertedData[0]
                        dbSaved = true
                        logWithTime(`Insertado en nominas página ${pageNum}`, nominaInsertStart)
                        console.log(`✅ Page ${pageNum} saved to nominas table`)

                        try {
                          if (companyId && resolvedEmployeeId) {
                            const { data: employeeRow } = await supabase
                              .from('employees')
                              .select('user_id')
                              .eq('id', resolvedEmployeeId)
                              .maybeSingle()

                            if (employeeRow?.user_id) {
                              await supabase
                                .from('notifications')
                                .insert([{
                                  company_id: companyId,
                                  user_id: employeeRow.user_id,
                                  type: 'nominas_new',
                                  level: 'info',
                                  title: 'Nueva nómina disponible',
                                  message: 'Tienes una nueva nómina disponible para consultar.',
                                  status: 'pendiente',
                                  action_url: '/mobile/nominas',
                                  entity_type: 'nominas',
                                  entity_id: nominaId,
                                  dedupe_key: `nomina-${nominaId}`,
                                  metadata: { status: 'nueva' }
                                }])
                            }
                          }
                        } catch (notificationError) {
                          console.error('❌ Error creando notificación de nómina:', notificationError)
                        }
                      }

                      // CORRECCIÓN: Update processed_documents table with CORRECT column name
                      const processedDocumentData = {
                        id: pageId,
                        original_filename: pagePdfName,
                        document_type_id: documentTypeId,
                        company_id: companyId,
                        employee_id: resolvedEmployeeId,
                        extracted_text: textContent,
                        processed_data: { ...fullNominaData, page_number: pageNum },
                        processing_status: 'completed',
                        split_pdf_paths: [pagePdfName],
                        text_file_paths: [textFileName],
                        page_number: pageNum
                      }

                      console.log(`💾 Saving processed_documents with data:`, {
                        id: pageId,
                        original_filename: pagePdfName,
                        page_number: pageNum,
                        hasProcessedData: !!fullNominaData && Object.keys(fullNominaData).length > 0
                      })

                      // ✅ SOLUCIÓN: Usar insert con ON CONFLICT basado en filename + page_number
                      const processedDocStart = logWithTime(`Upsert en processed_documents página ${pageNum}`)
                      const { error: processedDocError } = await supabase
                        .from('processed_documents')
                        .upsert(processedDocumentData, {
                          onConflict: 'original_filename,page_number',
                          ignoreDuplicates: false
                        })
                        .select()

                      if (!processedDocError) {
                        logWithTime(`Upsert en processed_documents página ${pageNum} OK`, processedDocStart)
                        console.log(`✅ Page ${pageNum} saved to processed_documents successfully`)
                      } else {
                        logWithTime(`ERROR upsert processed_documents página ${pageNum}`, processedDocStart)
                        console.error(`❌ Error saving page ${pageNum} to processed_documents:`, processedDocError)
                      }
                      } // resolvedEmployeeId

                    } catch (dbError) {
                      console.error(`❌ Database error for page ${pageNum}:`, dbError)
                    }
                  } else {
                    // If no full data, still create processed_documents entry for tracking
                    const basicProcessedDocumentData = {
                      id: pageId,
                      original_filename: pagePdfName,
                      document_type_id: documentTypeId,
                      company_id: companyId,
                      employee_id: effectiveEmployeeId ?? null,
                      extracted_text: textContent,
                      processed_data: { page_number: pageNum },
                      processing_status: 'pending',
                      split_pdf_paths: [pagePdfName],
                      text_file_paths: [textFileName],
                      page_number: pageNum
                    }

                    const { error: processedDocError } = await supabase
                      .from('processed_documents')
                      .upsert(basicProcessedDocumentData, {
                        onConflict: 'original_filename,page_number',
                        ignoreDuplicates: false
                      })
                      .select()

                    if (!processedDocError) {
                      console.log(`✅ Page ${pageNum} saved to processed_documents (tracking only)`)
                    } else {
                      console.error(`❌ Error saving basic processed_documents entry for page ${pageNum}:`, processedDocError)
                    }
                  }

                  // Add to documents array with proper structure
                  const hasExtractedData = Object.keys(fullNominaData).length > 0
                  documents.push({
                    id: pageId,
                    filename: pagePdfName,
                    pageNumber: pageNum,
                    pdfUrl: pdfUrlData.publicUrl,
                    textUrl: textUrlData.publicUrl,
                    textContent,
                    claudeProcessed: hasExtractedData,
                    savedToDb: dbSaved,
                    nominaData: Object.keys(fullNominaData).length > 0 ? {
                      id: nominaRecord?.id || pageId,
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
                      total_contributions: fullNominaData.contributions?.reduce((sum: number, c: any) => 
                                          sum + (c.employer_contribution || c.amount || 0), 0) || 0,
                      iban: fullNominaData.bank?.iban || fullNominaData.iban || '',
                      swift_bic: fullNominaData.bank?.swift_bic || fullNominaData.swift_bic || '',
                      cost_empresa: (fullNominaData.gross_salary || 
                                   fullNominaData.perceptions?.reduce((sum: number, p: any) => sum + (p.amount || 0), 0) || 0) +
                                   (fullNominaData.contributions?.reduce((sum: number, c: any) => 
                                   sum + (c.employer_contribution || c.amount || 0), 0) || 0),
                      signed: false,
                      employee_avatar: employeeAvatar
                    } : undefined
                  })

                  console.log(`📄 Document created for page ${pageNum}:`, {
                    id: pageId,
                    filename: pagePdfName,
                    processed: Object.keys(fullNominaData).length > 0,
                    employeeName: correctedBasicInfo.employeeName
                  })

                  // Update progress
                  const completedProgress = 20 + Math.round(((i + 1) / pageCount) * 75)
                  sendProgress(completedProgress, `Página ${pageNum} completada (${correctedBasicInfo.employeeName})`, pageNum, pageCount)

                } catch (pageError) {
                  console.error(`❌ Error in result processing:`, pageError)
                }
              }
            }

            const totalDuration = logWithTime(`🎉 PROCESAMIENTO COMPLETO: ${documents.length} documentos procesados`, processStartTime)
            console.log(`📊 RESUMEN DE RENDIMIENTO:`)
            console.log(`   - Total tiempo: ${(totalDuration / 1000).toFixed(2)}s`)
            console.log(`   - Páginas procesadas: ${documents.length}`)
            console.log(`   - Tiempo promedio por página: ${(totalDuration / documents.length).toFixed(0)}ms`)
            console.log(`   - Páginas por segundo: ${(documents.length / (totalDuration / 1000)).toFixed(2)}`)
            
            sendProgress(100, `¡Procesamiento unificado completado! ${documents.length} documentos procesados`)
            console.log(`🎉 UNIFIED PDF processing completed! Created ${documents.length} documents`)

            // Send completion event with validation
            if (!streamClosed && documents.length > 0) {
              sendComplete(documents)
            } else if (!streamClosed) {
              sendError('No documents were successfully processed')
            }

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