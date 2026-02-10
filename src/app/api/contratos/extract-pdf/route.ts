import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

// ─── POST: Extract contract data from PDF using Claude Haiku ─────────
export async function POST(request: NextRequest) {
  try {
    console.log('[extract-pdf] Starting PDF extraction')

    const formData = await request.formData()
    const file = formData.get('file') as File
    const companyId = formData.get('company_id') as string

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No se ha proporcionado archivo PDF' },
        { status: 400 }
      )
    }

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: 'company_id es requerido' },
        { status: 400 }
      )
    }

    // Read PDF as base64
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64 = buffer.toString('base64')

    console.log(`[extract-pdf] PDF size: ${(bytes.byteLength / 1024).toFixed(1)} KB`)

    // Initialize Claude Haiku
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY no está configurada')
    }

    const anthropic = new Anthropic({ apiKey })

    const prompt = `Analiza este contrato laboral español en PDF y extrae los siguientes datos en formato JSON.

IMPORTANTE: Devuelve SOLO el objeto JSON, sin texto adicional antes ni después.

Datos a extraer:
- employee_name: nombre completo del trabajador (string)
- employee_nif: NIF/DNI del trabajador (string, formato "12345678A")
- contract_type: tipo de contrato (uno de: "permanent", "temporary", "training", "internship", "specific_work")
- start_date: fecha de inicio (formato YYYY-MM-DD)
- end_date: fecha de fin si es temporal (formato YYYY-MM-DD o null)
- cotization_group: grupo de cotización (número 1-11 o null)
- professional_category: categoría profesional (string o null)
- occupation_code: código de ocupación CNO (string o null)
- full_time: jornada completa (boolean, true si es completa)
- workday_percentage: porcentaje de jornada (número 1-100, default 100)
- weekly_hours: horas semanales (número, típicamente 40)
- shift_type: tipo de turno (uno de: "continuous", "split", "rotating", "night")
- agreed_base_salary: salario base mensual pactado (número sin decimales)
- notes: cualquier observación relevante (string o null)
- work_center_address: dirección del centro de trabajo (string o null)
- trial_period_months: período de prueba en meses (número o null, ej. 6)
- vacation_days_per_year: días de vacaciones por año (número o null, ej. 30)
- signing_place: lugar de firma (string o null, ej. Barcelona)
- signing_date: fecha de firma (formato YYYY-MM-DD o null)
- job_description: descripción breve del puesto o funciones (string o null)

Si no encuentras algún dato, usa null (excepto para boolean y números que tienen defaults).

Responde SOLO con el JSON, ejemplo:
{
  "employee_name": "Juan García López",
  "employee_nif": "12345678A",
  "contract_type": "permanent",
  "start_date": "2025-01-15",
  "end_date": null,
  "cotization_group": 7,
  "professional_category": "Técnico Administrativo",
  "occupation_code": null,
  "full_time": true,
  "workday_percentage": 100,
  "weekly_hours": 40,
  "shift_type": "continuous",
  "agreed_base_salary": 2100,
  "notes": null,
  "work_center_address": "C/ Marina 45, 08005 Barcelona",
  "trial_period_months": 6,
  "vacation_days_per_year": 30,
  "signing_place": "Barcelona",
  "signing_date": "2026-01-01",
  "job_description": "Analista de datos..."
}`

    console.log('[extract-pdf] Sending to Claude Haiku...')

    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''
    console.log('[extract-pdf] Claude response:', responseText.substring(0, 200))

    // Parse JSON response
    let extractedContract
    try {
      // Remove markdown code blocks if present
      const cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      extractedContract = JSON.parse(cleanJson)
    } catch (parseError) {
      console.error('[extract-pdf] JSON parse error:', parseError)
      throw new Error('No se pudo parsear la respuesta de la IA')
    }

    console.log('[extract-pdf] Successfully extracted contract data')

    return NextResponse.json({
      success: true,
      contract: {
        employee_name: extractedContract.employee_name || null,
        employee_nif: extractedContract.employee_nif || null,
        contract_type: extractedContract.contract_type || 'permanent',
        start_date: extractedContract.start_date || new Date().toISOString().split('T')[0],
        end_date: extractedContract.end_date || '',
        cotization_group: extractedContract.cotization_group?.toString() || '',
        professional_category: extractedContract.professional_category || '',
        occupation_code: extractedContract.occupation_code || '',
        full_time: extractedContract.full_time !== false,
        workday_percentage: extractedContract.workday_percentage?.toString() || '100',
        weekly_hours: extractedContract.weekly_hours?.toString() || '40',
        shift_type: extractedContract.shift_type || 'continuous',
        agreed_base_salary: extractedContract.agreed_base_salary?.toString() || '',
        notes: extractedContract.notes || '',
        work_center_address: extractedContract.work_center_address || '',
        trial_period_months: extractedContract.trial_period_months?.toString() || '',
        vacation_days_per_year: extractedContract.vacation_days_per_year?.toString() || '',
        signing_place: extractedContract.signing_place || '',
        signing_date: extractedContract.signing_date || '',
        job_description: extractedContract.job_description || '',
      },
    })
  } catch (error) {
    console.error('[extract-pdf] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Error al procesar el PDF',
        details: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    )
  }
}
