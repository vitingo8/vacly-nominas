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
    const { textContent } = await request.json()
    
    if (!textContent) {
      return NextResponse.json({ error: 'Text content is required' }, { status: 400 })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 })
    }

    // Claude prompt for payroll processing
    const prompt = `Ets un assistent que interpreta documents de nòmina en text pla. A la teva sortida, has d'incloure:

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

Respon NOMÉS amb un objecte JSON vàlid, sense text addicional, comentaris o formatació markdown. El JSON ha de ser directament parseable.

Text de la nòmina:
${textContent}`

    // Send to Claude API
    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: prompt
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
      processedData = JSON.parse(claudeResponse)
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
      company_id: 'e3605f07-2576-4960-81a5-04184661926d', // Fixed for testing
      employee_id: 'de95edea-9322-494a-a693-61e1ac7337f8', // Fixed for testing
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

    return NextResponse.json({
      success: true,
      message: 'Nómina processed and saved successfully',
      data: {
        nominaId: nominaId,
        processedData: processedData,
        supabaseRecord: insertedData[0]
      }
    })

  } catch (error) {
    console.error('Processing error:', error)
    return NextResponse.json({ 
      error: 'Failed to process nomina',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 