import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseClient } from '@/lib/supabase'

/**
 * POST: Process complete contract PDF with AI
 * Similar to process-lux for payrolls - extracts ALL data and creates/updates employee + contract automatically
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[process-contract-pdf] Starting full contract processing')

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

    console.log(`[process-contract-pdf] PDF size: ${(bytes.byteLength / 1024).toFixed(1)} KB`)

    // Initialize Claude
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY no está configurada')
    }

    const anthropic = new Anthropic({ apiKey })

    // Enhanced prompt to extract ALL employee and contract data
    const prompt = `Analiza este contrato laboral español en PDF y extrae TODOS los datos del trabajador y del contrato en formato JSON.

IMPORTANTE: Devuelve SOLO el objeto JSON, sin texto adicional antes ni después.

DATOS DEL TRABAJADOR (employee):
- first_name: nombre (string)
- last_name: apellidos (string)
- nif: DNI/NIE (string, formato "12345678A", normalizar mayúsculas)
- social_security_number: número de afiliación a la Seguridad Social (string, ej. "08/0987654321")
- birthdate: fecha de nacimiento (formato YYYY-MM-DD o null)
- address: domicilio personal del trabajador (string o null)
- internal_employee_code: número de empleado interno (string o null, ej. "00027")
- position: puesto o categoría (string o null)
- email: correo electrónico si aparece (string o null)
- mobile: teléfono móvil si aparece (string o null)

DATOS DEL CONTRATO (contract):
- contract_type: tipo de contrato (uno de: "permanent", "temporary", "training", "internship", "specific_work")
- start_date: fecha de inicio (formato YYYY-MM-DD)
- end_date: fecha de fin si es temporal (formato YYYY-MM-DD o null)
- cotization_group: grupo de cotización (número 1-11 o null)
- professional_category: categoría profesional (string o null)
- occupation_code: código de ocupación CNO (string o null)
- agreement_id: convenio colectivo aplicable (nombre o código, string o null)
- full_time: jornada completa (boolean, true si es completa)
- workday_percentage: porcentaje de jornada (número 1-100, default 100)
- weekly_hours: horas semanales (número, típicamente 40)
- shift_type: tipo de turno (uno de: "continuous", "split", "rotating", "night")
- agreed_base_salary: salario base mensual pactado (número sin decimales, si es anual dividir por 12)
- work_center_address: dirección del centro de trabajo (string o null)
- trial_period_months: período de prueba en meses (número o null, ej. 6)
- vacation_days_per_year: días de vacaciones por año (número o null, ej. 30)
- signing_place: lugar de firma (string o null, ej. "Barcelona")
- signing_date: fecha de firma del contrato (formato YYYY-MM-DD o null)
- job_description: descripción breve del puesto o funciones principales (string o null)
- notes: cualquier observación relevante (string o null)

Si no encuentras algún dato, usa null (excepto para boolean y números que tienen defaults).

Responde SOLO con el JSON, ejemplo:
{
  "employee": {
    "first_name": "David",
    "last_name": "Espuny Caballe",
    "nif": "47829860A",
    "social_security_number": "08/0987654321",
    "birthdate": "1993-09-17",
    "address": "Domicilio Empleado,
    "internal_employee_code": "00027",
    "position": "Analista de Datos",
    "email": null,
    "mobile": null
  },
  "contract": {
    "contract_type": "permanent",
    "start_date": "2026-01-01",
    "end_date": null,
    "cotization_group": 2,
    "professional_category": "Técnico/a Superior",
    "occupation_code": null,
    "agreement_id": "Oficinas y Despachos de Barcelona",
    "full_time": true,
    "workday_percentage": 100,
    "weekly_hours": 40,
    "shift_type": "continuous",
    "agreed_base_salary": 3000,
    "work_center_address": "C/ Marina 45, 08005 Barcelona",
    "trial_period_months": 6,
    "vacation_days_per_year": 30,
    "signing_place": "Barcelona",
    "signing_date": "2026-01-01",
    "job_description": "Analista de Datos: análisis y preparación de datos, elaboración de informes...",
    "notes": null
  }
}`

    console.log('[process-contract-pdf] Sending to Claude...')

    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 3000,
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
    console.log('[process-contract-pdf] Claude response:', responseText.substring(0, 300))

    // Parse JSON response
    let extractedData
    try {
      const cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      extractedData = JSON.parse(cleanJson)
    } catch (parseError) {
      console.error('[process-contract-pdf] JSON parse error:', parseError)
      throw new Error('No se pudo parsear la respuesta de la IA')
    }

    if (!extractedData.employee || !extractedData.contract) {
      throw new Error('La IA no devolvió datos completos de employee y contract')
    }

    console.log('[process-contract-pdf] Successfully extracted data')

    // ── Step 2: Create or update employee ───────────────────────────
    const supabase = getSupabaseClient()
    const employeeData = extractedData.employee

    if (!employeeData.nif) {
      throw new Error('No se pudo extraer el NIF del trabajador del contrato')
    }

    // Normalize NIF (uppercase)
    const normalizedNif = employeeData.nif.toUpperCase()

    // Check if employee exists by NIF
    const { data: existingEmployees, error: searchError } = await supabase
      .from('employees')
      .select('id, first_name, last_name, nif, status')
      .eq('company_id', companyId)
      .eq('nif', normalizedNif)
      .limit(1)

    if (searchError) {
      console.error('[process-contract-pdf] Error searching employee:', searchError)
      throw new Error('Error al buscar empleado en la base de datos')
    }

    let employeeId: string
    let employeeCreated = false
    let employeeUpdated = false

    if (existingEmployees && existingEmployees.length > 0) {
      // Employee exists - update with new data
      const existing = existingEmployees[0]
      employeeId = existing.id
      console.log(`[process-contract-pdf] Employee found: ${existing.first_name} ${existing.last_name} (${employeeId})`)

      // Update employee with extracted data (only non-null values)
      const updatePayload: any = {}
      if (employeeData.first_name) updatePayload.first_name = employeeData.first_name
      if (employeeData.last_name) updatePayload.last_name = employeeData.last_name
      if (employeeData.social_security_number) updatePayload.social_security_number = employeeData.social_security_number
      if (employeeData.birthdate) updatePayload.birthdate = employeeData.birthdate
      if (employeeData.address) updatePayload.address = employeeData.address
      if (employeeData.internal_employee_code) updatePayload.internal_employee_code = employeeData.internal_employee_code
      if (employeeData.position) updatePayload.position = employeeData.position
      if (employeeData.email) updatePayload.email = employeeData.email
      if (employeeData.mobile) updatePayload.mobile = employeeData.mobile

      if (Object.keys(updatePayload).length > 0) {
        const { error: updateError } = await supabase
          .from('employees')
          .update(updatePayload)
          .eq('id', employeeId)
          .eq('company_id', companyId)

        if (updateError) {
          console.error('[process-contract-pdf] Error updating employee:', updateError)
          throw new Error('Error al actualizar empleado')
        }

        employeeUpdated = true
        console.log('[process-contract-pdf] Employee updated with extracted data')
      }
    } else {
      // Employee doesn't exist - create new
      console.log('[process-contract-pdf] Employee not found, creating new one')

      const newEmployeeData = {
        company_id: companyId,
        first_name: employeeData.first_name || 'Sin nombre',
        last_name: employeeData.last_name || '',
        nif: normalizedNif,
        social_security_number: employeeData.social_security_number || null,
        birthdate: employeeData.birthdate || null,
        address: employeeData.address || null,
        internal_employee_code: employeeData.internal_employee_code || null,
        position: employeeData.position || null,
        email: employeeData.email || `${normalizedNif}@temp.com`,
        mobile: employeeData.mobile || null,
        entry_date: extractedData.contract.start_date || new Date().toISOString().split('T')[0],
        status: 'Activo',
        type: 'Interno',
        department: '',
        manager: ''
      }

      const { data: newEmployee, error: createError } = await supabase
        .from('employees')
        .insert([newEmployeeData])
        .select('id')
        .single()

      if (createError) {
        console.error('[process-contract-pdf] Error creating employee:', createError)
        throw new Error('Error al crear empleado: ' + createError.message)
      }

      employeeId = newEmployee.id
      employeeCreated = true
      console.log(`[process-contract-pdf] Employee created: ${employeeId}`)
    }

    // ── Step 3: Create contract ─────────────────────────────────────
    const contractData = extractedData.contract

    const newContractPayload = {
      company_id: companyId,
      employee_id: employeeId,
      contract_type: contractData.contract_type || 'permanent',
      start_date: contractData.start_date || new Date().toISOString().split('T')[0],
      end_date: contractData.end_date || null,
      cotization_group: contractData.cotization_group != null ? parseInt(contractData.cotization_group) : null,
      professional_category: contractData.professional_category || null,
      occupation_code: contractData.occupation_code || null,
      agreement_id: contractData.agreement_id || null,
      full_time: contractData.full_time !== false,
      workday_percentage: contractData.workday_percentage != null ? parseFloat(contractData.workday_percentage) : 100,
      weekly_hours: contractData.weekly_hours != null ? parseFloat(contractData.weekly_hours) : 40,
      shift_type: contractData.shift_type || 'continuous',
      agreed_base_salary: contractData.agreed_base_salary != null ? parseFloat(contractData.agreed_base_salary) : 0,
      status: 'active',
      work_center_address: contractData.work_center_address || null,
      trial_period_months: contractData.trial_period_months != null && contractData.trial_period_months !== '' ? parseInt(contractData.trial_period_months) : null,
      vacation_days_per_year: contractData.vacation_days_per_year != null && contractData.vacation_days_per_year !== '' ? parseInt(contractData.vacation_days_per_year) : null,
      signing_place: contractData.signing_place || null,
      signing_date: contractData.signing_date || null,
      job_description: contractData.job_description || null,
      notes: contractData.notes || null,
      signed_pdf_url: null
    }

    const { data: newContract, error: contractError } = await supabase
      .from('contracts')
      .insert([newContractPayload])
      .select('id, contract_type, start_date, agreed_base_salary')
      .single()

    if (contractError) {
      console.error('[process-contract-pdf] Error creating contract:', contractError)
      throw new Error('Error al crear contrato: ' + contractError.message)
    }

    console.log(`[process-contract-pdf] Contract created: ${newContract.id}`)

    // ── Step 4: Update employee.current_contract_id if this is active ──
    if (newContract && newContractPayload.status === 'active') {
      const { error: updateContractRefError } = await supabase
        .from('employees')
        .update({ current_contract_id: newContract.id })
        .eq('id', employeeId)
        .eq('company_id', companyId)

      if (updateContractRefError) {
        console.warn('[process-contract-pdf] Could not update current_contract_id:', updateContractRefError)
      }
    }

    console.log('[process-contract-pdf] ✅ Full process completed successfully')

    return NextResponse.json({
      success: true,
      employee: {
        id: employeeId,
        created: employeeCreated,
        updated: employeeUpdated,
        name: `${employeeData.first_name || ''} ${employeeData.last_name || ''}`.trim(),
        nif: normalizedNif
      },
      contract: {
        id: newContract.id,
        contract_type: newContract.contract_type,
        start_date: newContract.start_date,
        agreed_base_salary: newContract.agreed_base_salary
      },
      message: employeeCreated
        ? 'Empleado creado y contrato registrado correctamente'
        : 'Empleado actualizado y contrato registrado correctamente'
    })
  } catch (error) {
    console.error('[process-contract-pdf] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Error al procesar el contrato',
        details: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    )
  }
}
