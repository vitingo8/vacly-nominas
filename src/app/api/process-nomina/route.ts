import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { buildClaudeContext, storeDocumentEmbeddings, updateMemory } from '@/lib/memory-rag'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    // Check that Voyage AI is configured (required for memory system)
    if (!process.env.VOYAGE_API_KEY) {
      return NextResponse.json({ 
        error: 'Voyage AI not configured',
        details: 'VOYAGE_API_KEY environment variable is required for the memory system'
      }, { status: 500 })
    }

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

    // Build enriched context using RAG memory
    console.log('Building Claude context with RAG memory...')
    const ragContext = await buildClaudeContext(
      textContent,
      companyId,
      'nomina',
      employeeId
    )

    // Enhanced Claude prompt with memory context
    const basePrompt = `Ets un assistent que interpreta documents de nòmina en text pla. A la teva sortida, has d'incloure:

- company_id: deixar buit ""
- employee_id: deixar buit ""
- period_start: data d'inici del període en format YYYY-MM-DD
- period_end: data de fi del període en format YYYY-MM-DD
- employee: objecte JSON amb totes les dades del treballador (nom, dni, afiliació social, etc.)
- company: objecte JSON amb totes les dades de l'empresa (nom, adreça, codi centre, etc.)
- perceptions: array d'objectes JSON amb { code, concept, amount }
- deductions: array d'objectes JSON amb { code, concept, amount }
- contributions: array d'objectes JSON amb { concept, base, rate, employer_contribution }
- base_ss: base de cotització a la seguretat social
- net_pay: import net a percebre
- bank: objecte amb { iban, swift_bic }
- cost_empresa: cost total per a l'empresa

IMPORTANT per al càlcul de cost_empresa:
1. Busca primer si apareix directament el concepte "cost empresa", "coste empresa", "coste total empresa" o similar
2. Si NO apareix directament, calcula'l com: SALARI BRUT + APORTACIONS EMPRESARIALS
3. El salari brut és la suma de totes les percepcions (abans de deduccions)
4. Les aportacions empresarials són les cotitzacions que paga l'empresa a la Seguretat Social
5. Exemples d'aportacions empresarials: "Contingències comunes empresa", "Desocupació empresa", "Formació professional empresa", "FOGASA", etc.
6. Si veus conceptes com "Empresa aporta", "Aportació patronal", "Cotització empresa" - suma'ls tots
7. SEMPRE verifica que cost_empresa >= salari brut (mai pot ser menor)

Respon NOMÉS amb un objecte JSON vàlid, sense text addicional, comentaris o formatació markdown. El JSON ha de ser directament parseable.`

    // Combine base prompt with RAG context
    const enhancedPrompt = ragContext 
      ? `${ragContext}\n\n${basePrompt}\n\nText de la nòmina:\n${textContent}`
      : `${basePrompt}\n\nText de la nòmina:\n${textContent}`

    console.log('Sending enhanced prompt to Claude...')

    // Send to Claude API with enhanced context
    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: enhancedPrompt
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
      
      console.log('Attempting to parse Claude response:', cleanedResponse.substring(0, 200) + '...')
      
      processedData = JSON.parse(cleanedResponse)
      
      // Validate that we got a proper object
      if (!processedData || typeof processedData !== 'object') {
        throw new Error('Parsed data is not a valid object')
      }
      
      // Post-processing validation and correction for cost_empresa
      if (processedData.perceptions && Array.isArray(processedData.perceptions)) {
        // Find the appropriate base for gross salary calculation
        // Look for bases like "Base SS", "Base Cotización", etc. but NOT "REM.TOTAL"
        let grossSalary = 0
        
        // First try to find it in contributions bases
        if (processedData.contributions && Array.isArray(processedData.contributions)) {
          const validBase = processedData.contributions.find((contrib: any) => 
            contrib.base && contrib.base > 0 && 
            contrib.concept && 
            !contrib.concept.toLowerCase().includes('rem.total') &&
            !contrib.concept.toLowerCase().includes('remuneración total')
          )
          if (validBase) {
            grossSalary = validBase.base
          }
        }
        
        // If not found in contributions, try base_ss
        if (grossSalary === 0 && processedData.base_ss && processedData.base_ss > 0) {
          grossSalary = processedData.base_ss
        }
        
        // If still not found, look for specific perception concepts that represent gross salary
        if (grossSalary === 0) {
          const grossPerception = processedData.perceptions.find((perception: any) => 
            perception.concept && (
              perception.concept.toLowerCase().includes('salari brut') ||
              perception.concept.toLowerCase().includes('salario bruto') ||
              perception.concept.toLowerCase().includes('base') ||
              perception.concept.toLowerCase().includes('sueldo base')
            ) && !perception.concept.toLowerCase().includes('rem.total')
          )
          if (grossPerception) {
            grossSalary = grossPerception.amount || 0
          }
        }
        
        // Fallback: sum all perceptions except REM.TOTAL
        if (grossSalary === 0) {
          grossSalary = processedData.perceptions
            .filter((perception: any) => 
              !perception.concept || (
                !perception.concept.toLowerCase().includes('rem.total') &&
                !perception.concept.toLowerCase().includes('remuneración total')
              )
            )
            .reduce((sum: number, perception: any) => sum + (perception.amount || 0), 0)
        }
        
        const employerContributions = processedData.contributions 
          ? processedData.contributions.reduce((sum: number, contribution: any) => {
              return sum + (contribution.employer_contribution || 0)
            }, 0)
          : 0
        
        const calculatedCostEmpresa = grossSalary + employerContributions
        
        // If cost_empresa is missing, too low, or seems incorrect, use our calculation
        if (!processedData.cost_empresa || 
            processedData.cost_empresa < grossSalary || 
            Math.abs(processedData.cost_empresa - calculatedCostEmpresa) > grossSalary * 0.1) {
          
          console.log(`Correcting cost_empresa: Original=${processedData.cost_empresa}, Calculated=${calculatedCostEmpresa} (Gross=${grossSalary} + Contributions=${employerContributions})`)
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

    // Update processed_documents table with the result
    const { error: updateError } = await supabase
      .from('processed_documents')
      .upsert({
        id: documentId,
        document_type_id: documentType.id,
        company_id: companyId,
        employee_id: employeeId,
        original_filename: `nomina_${documentId}.pdf`,
        extracted_text: textContent,
        processed_data: processedData,
        processing_status: 'completed'
      })

    if (updateError) {
      console.error('Error updating processed_documents:', updateError)
    }

    // Store document embeddings for future RAG searches
    console.log('Storing document embeddings...')
    try {
      await storeDocumentEmbeddings(
        documentId,
        companyId,
        documentType.id,
        textContent,
        employeeId
      )
      console.log('Embeddings stored successfully')
    } catch (embeddingError) {
      console.error('Error storing embeddings:', embeddingError)
      // Don't fail the request if embeddings fail
    }

    // Update memory with learned patterns
    console.log('Updating memory with learned patterns...')
    const conversationId = crypto.randomUUID() // Generate new conversation ID
    try {
      await updateMemory(
        companyId,
        documentType.id,
        processedData,
        conversationId,
        employeeId
      )
      console.log('Memory updated successfully')
    } catch (memoryError) {
      console.error('Error updating memory:', memoryError)
      // Don't fail the request if memory update fails
    }

    return NextResponse.json({
      success: true,
      message: 'Nómina processed and saved successfully with RAG memory',
      data: {
        nominaId: nominaId,
        processedData: processedData,
        supabaseRecord: insertedData[0],
        ragContextUsed: !!ragContext,
        embeddingsStored: true,
        memoryUpdated: true
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
      error: 'Failed to process nomina',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 