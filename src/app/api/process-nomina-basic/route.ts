import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { textContent, documentId } = await request.json()
    
    if (!textContent) {
      return NextResponse.json({ error: 'Text content is required' }, { status: 400 })
    }

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 })
    }

    // Fixed IDs for testing
    const companyId = 'e3605f07-2576-4960-81a5-04184661926d'
    const employeeId = 'de95edea-9322-494a-a693-61e1ac7337f8'
    
    // Get document type ID for nomina
    const { data: documentType } = await supabase
      .from('document_types')
      .select('id')
      .eq('name', 'nomina')
      .single()

    if (!documentType) {
      return NextResponse.json({ error: 'Document type not found' }, { status: 500 })
    }

    // Enhanced Basic Claude prompt for better data extraction
    const basicPrompt = `Ets un assistent especialitzat que interpreta documents de nòmina en text pla amb màxima precisió. A la teva sortida, has d'incloure:

DADES BÀSIQUES:
- company_id: deixar buit ""
- employee_id: deixar buit ""
- period_start: data d'inici del període en format YYYY-MM-DD
- period_end: data de fi del període en format YYYY-MM-DD

EMPLOYEE - objecte JSON obligatori amb:
- name: nom complet del treballador
- dni: DNI/NIF del treballador (busca patrons com "DNI", "N.I.F.", "NIF", "Document", seguits de números i lletres)
- nss: número d'afiliació a la Seguretat Social (busca "Afiliació", "N.S.S.", "Núm. SS", "Seg. Social")
- category: categoria professional del treballador
- code: codi del treballador si existeix

COMPANY - objecte JSON obligatori amb:
- name: nom de l'empresa
- cif: CIF de l'empresa (busca "CIF", "C.I.F.", seguits de números i lletres)
- address: adreça completa de l'empresa
- center_code: codi del centre de treball si existeix

IMPORTS MONETARIS (tots en números decimals):
- base_ss: base de cotització a la seguretat social (busca "Base SS", "Base Cotització", "Base C.C.")
- net_pay: import net a percebre (busca "Líquid a percebre", "Neto a percibir", "Import net")
- gross_salary: salari brut total (suma de percepcions principals sense deduccions - NO incloure "REM.TOTAL")
- cost_empresa: cost total per a l'empresa (salari brut + aportacions empresarials)

ARRAYS OBLIGATORIS:
- perceptions: array d'objectes JSON amb { code, concept, amount } - NOMÉS percepcions, no deduccions
- deductions: array d'objectes JSON amb { code, concept, amount } - NOMÉS deduccions/retencions
- contributions: array d'objectes JSON amb { concept, base, rate, employer_contribution }

BANK - objecte amb:
- iban: número IBAN del compte bancari
- swift_bic: codi SWIFT/BIC si existeix

INSTRUCCIONS ESPECÍFIQUES PER DNI:
1. Busca patrons com: "DNI:", "N.I.F.:", "NIF:", "Document:", seguits d'espais i números/lletres
2. Format típic: 12345678A, 12.345.678-A, 12345678-A
3. Si trobes múltiples DNIs, agafa el del treballador (no de l'empresa)

INSTRUCCIONS ESPECÍFIQUES PER GROSS_SALARY:
1. NO utilitzar "REM.TOTAL" o "Remuneración Total"
2. Buscar conceptes com: "Salari Base", "Sueldo Base", "Salario Bruto", "Base"
3. Si no està explícit, suma NOMÉS les percepcions principals (no complements extraordinaris)
4. El gross_salary ha de ser <= base_ss normalment

INSTRUCCIONS ESPECÍFIQUES PER COST_EMPRESA:
1. Busca primer si apareix directament "Cost Empresa", "Coste Empresa", "Coste Total Empresa"
2. Si NO apareix, calcula'l com: gross_salary + suma de totes les employer_contribution
3. Les aportacions empresarials són: "CC Empresa", "Desocupació Empresa", "FP Empresa", "FOGASA", etc.
4. SEMPRE verifica que cost_empresa >= gross_salary

Respon NOMÉS amb un objecte JSON vàlid, sense text addicional, comentaris o formatació markdown. El JSON ha de ser directament parseable.

Text de la nòmina:
${textContent}`

    console.log('Sending basic prompt to Claude...')

    // Send to Claude API with basic prompt
    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: basicPrompt
        }
      ],
    })

    if (!response.content[0] || response.content[0].type !== 'text') {
      throw new Error('Invalid response from Claude API')
    }

    let processedData
    try {
      // Parse the JSON response from Claude
      const claudeResponse = response.content[0].text.trim()
      
      // Clean the response - remove any markdown formatting or extra text
      let cleanedResponse = claudeResponse
      
      // Remove markdown code blocks if present
      if (cleanedResponse.includes('```json')) {
        cleanedResponse = cleanedResponse.replace(/```json\s*/g, '').replace(/```\s*$/g, '')
      } else if (cleanedResponse.includes('```')) {
        cleanedResponse = cleanedResponse.replace(/```\s*/g, '').replace(/```\s*$/g, '')
      }
      
      // Find the JSON object - look for the first { and last }
      const firstBrace = cleanedResponse.indexOf('{')
      const lastBrace = cleanedResponse.lastIndexOf('}')
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanedResponse = cleanedResponse.substring(firstBrace, lastBrace + 1)
      }
      
      // Additional cleaning - remove any trailing commas before closing braces/brackets
      cleanedResponse = cleanedResponse.replace(/,(\s*[}\]])/g, '$1')
      
      console.log('Attempting to parse Claude response (Basic):', cleanedResponse.substring(0, 200) + '...')
      
      processedData = JSON.parse(cleanedResponse)
      
      // Validate that we got a proper object
      if (!processedData || typeof processedData !== 'object') {
        throw new Error('Parsed data is not a valid object')
      }
      
      // Post-processing validation and correction for all important fields
      if (processedData.perceptions && Array.isArray(processedData.perceptions)) {
        // Calculate gross_salary if missing or incorrect
        let grossSalary = processedData.gross_salary || 0
        
        // If gross_salary is missing or zero, calculate it from perceptions
        if (!grossSalary || grossSalary === 0) {
          grossSalary = processedData.perceptions
            .filter((perception: any) => 
              perception.amount > 0 && (
                !perception.concept || (
                  !perception.concept.toLowerCase().includes('rem.total') &&
                  !perception.concept.toLowerCase().includes('remuneración total') &&
                  !perception.concept.toLowerCase().includes('total remuneracion')
                )
              )
            )
            .reduce((sum: number, perception: any) => sum + (perception.amount || 0), 0)
          
          console.log(`Calculated gross_salary from perceptions: ${grossSalary}`)
          processedData.gross_salary = grossSalary
        }
        
        // Calculate total_contributions from employer contributions
        let totalContributions = 0
        if (processedData.contributions && Array.isArray(processedData.contributions)) {
          totalContributions = processedData.contributions.reduce((sum: number, contribution: any) => {
            return sum + (contribution.employer_contribution || 0)
          }, 0)
        }
        
        // Add total_contributions to the data
        processedData.total_contributions = totalContributions
        console.log(`Calculated total_contributions: ${totalContributions}`)
        
        // Ensure DNI is properly extracted
        if (processedData.employee && (!processedData.employee.dni || processedData.employee.dni === '')) {
          // Try to find DNI in the original text with better patterns
          const dniPatterns = [
            /(?:DNI|N\.I\.F\.|NIF|Document)[\s:]*([0-9]{8}[A-Z])/gi,
            /(?:DNI|N\.I\.F\.|NIF|Document)[\s:]*([0-9]{1,2}\.?[0-9]{3}\.?[0-9]{3}[-\s]?[A-Z])/gi,
            /\b([0-9]{8}[A-Z])\b/g,
            /\b([0-9]{1,2}\.?[0-9]{3}\.?[0-9]{3}[-\s]?[A-Z])\b/g
          ]
          
          for (const pattern of dniPatterns) {
            const matches = textContent.match(pattern)
            if (matches && matches.length > 0) {
              // Clean the DNI (remove dots, spaces, etc.)
              const cleanDni = matches[0].replace(/[^0-9A-Z]/g, '')
              if (cleanDni.length === 9) {
                processedData.employee.dni = cleanDni
                console.log(`Extracted DNI: ${cleanDni}`)
                break
              }
            }
          }
        }
        
        // Recalculate cost_empresa with the corrected gross_salary
        const calculatedCostEmpresa = grossSalary + totalContributions
        
        // If cost_empresa is missing, too low, or seems incorrect, use our calculation
        if (!processedData.cost_empresa || 
            processedData.cost_empresa < grossSalary || 
            Math.abs(processedData.cost_empresa - calculatedCostEmpresa) > grossSalary * 0.1) {
          
          console.log(`Correcting cost_empresa: Original=${processedData.cost_empresa}, Calculated=${calculatedCostEmpresa} (Gross=${grossSalary} + Contributions=${totalContributions})`)
          processedData.cost_empresa = calculatedCostEmpresa
        }
      }
      
    } catch (parseError) {
      console.error('Error parsing Claude response:', parseError)
      return NextResponse.json({ 
        error: 'Failed to parse Claude response',
        details: 'The AI response was not valid JSON'
      }, { status: 500 })
    }

    // Generate UUID for the nomina record
    const nominaId = crypto.randomUUID()
    
    // Prepare data for Supabase
    const nominaData = {
      id: nominaId,
      company_id: companyId,
      employee_id: employeeId,
      period_start: processedData.period_start,
      period_end: processedData.period_end,
      employee: processedData.employee,
      company: processedData.company,
      perceptions: processedData.perceptions,
      deductions: processedData.deductions,
      contributions: processedData.contributions,
      base_ss: processedData.base_ss,
      net_pay: processedData.net_pay,
      gross_salary: processedData.gross_salary,
      total_contributions: processedData.total_contributions,
      dni: processedData.employee?.dni || null,
      iban: processedData.bank?.iban || null,
      swift_bic: processedData.bank?.swift_bic || null,
      cost_empresa: processedData.cost_empresa,
      signed: false,
    }

    // Save to Supabase
    const { data: insertedData, error: insertError } = await supabase
      .from('nominas')
      .insert([nominaData])
      .select()

    if (insertError) {
      console.error('Supabase insert error:', insertError)
      return NextResponse.json({ 
        error: 'Failed to save to database',
        details: insertError.message
      }, { status: 500 })
    }

    // Update processed_documents table with the result (basic mode)
    const { error: updateError } = await supabase
      .from('processed_documents')
      .upsert({
        id: documentId,
        document_type_id: documentType.id,
        company_id: companyId,
        employee_id: employeeId,
        original_filename: `nomina_basic_${documentId}.pdf`,
        extracted_text: textContent,
        processed_data: processedData,
        processing_status: 'completed'
      })

    if (updateError) {
      console.error('Error updating processed_documents:', updateError)
    }

    return NextResponse.json({
      success: true,
      message: 'Nómina processed and saved successfully (Basic Mode)',
      data: {
        nominaId: nominaId,
        processedData: processedData,
        supabaseRecord: insertedData[0],
        mode: 'basic',
        ragContextUsed: false,
        embeddingsStored: false,
        memoryUpdated: false
      }
    })

  } catch (error) {
    console.error('Processing error:', error)
    
    // Update document status to error if we have documentId
    if (request.body) {
      try {
        const { documentId } = await request.json()
        if (documentId) {
          await supabase
            .from('processed_documents')
            .update({
              processing_status: 'error',
              processing_error: error instanceof Error ? error.message : 'Unknown error'
            })
            .eq('id', documentId)
        }
      } catch {
        // Ignore errors in error handling
      }
    }

    return NextResponse.json({ 
      error: 'Failed to process nomina (Basic Mode)',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 