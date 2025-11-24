/**
 * API de análisis de tickets con Claude Vision
 * Analiza imágenes de tickets y extrae información relevante
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

interface AnalysisRequest {
  imageData: string
  mediaType: string
  previousAnalysis?: any
}

export async function POST(request: NextRequest) {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] [API] 📥 Nueva petición de análisis de Vision`)

  try {
    // Verificar API key
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error(`[${timestamp}] [API] ❌ ANTHROPIC_API_KEY no configurada`)
      return NextResponse.json({
        success: false,
        error: 'API Key de Anthropic no configurada en el servidor'
      }, { status: 500 })
    }

    const { imageData, mediaType, previousAnalysis }: AnalysisRequest = await request.json()

    if (!imageData) {
      console.error(`[${timestamp}] [API] ❌ Imagen no proporcionada`)
      return NextResponse.json({
        success: false,
        error: 'Imagen no proporcionada'
      }, { status: 400 })
    }

    console.log(`[${timestamp}] [API] 🔍 Procesando imagen...`)
    console.log(`[${timestamp}] [API]   - Tipo: ${mediaType}`)
    console.log(`[${timestamp}] [API]   - Tamaño: ${Math.round(imageData.length / 1024)} KB`)
    
    if (previousAnalysis) {
      console.log(`[${timestamp}] [API]   - Re-análisis con contexto anterior`)
    }

    // Extraer el base64 sin el prefijo data:image/...;base64,
    const base64Image = imageData.includes('base64,')
      ? imageData.split('base64,')[1]
      : imageData

    // Determinar el tipo de media
    let mediaTypeFormatted = mediaType || 'image/jpeg'
    if (imageData.includes('data:image/')) {
      const match = imageData.match(/data:(image\/[^;]+);/)
      if (match) {
        mediaTypeFormatted = match[1]
      }
    }

    console.log(`[${timestamp}] [API] 🚀 Enviando a Claude Vision...`)
    const claudeStartTime = Date.now()

    // Construir el prompt
    let prompt = `Analiza esta imagen de ticket o recibo y extrae la siguiente información en formato JSON:

{
  "amount": número del importe total (solo número, sin símbolo €),
  "category": "Gasto" (siempre "Gasto"),
  "subcategory": categoría específica del gasto (ej: "Material Oficina", "Comida", "Transporte", "Servicios", "Mantenimiento", "Otro"),
  "concept": descripción breve del gasto,
  "merchant": nombre del establecimiento o comercio,
  "date": fecha del ticket en formato YYYY-MM-DD si está visible,
  "notes": observaciones adicionales relevantes,
  "confidence": "high", "medium" o "low" según la claridad de la imagen,
  "time": hora del ticket si está visible (formato HH:MM),
  "items": array de productos si son legibles [{name, quantity, unitPrice, total}],
  "taxes": {subtotal, iva, ivaPercentage} si están visibles,
  "paymentMethod": método de pago si está visible (efectivo, tarjeta, etc),
  "ticketNumber": número de ticket si está visible
}

Responde ÚNICAMENTE con el JSON, sin texto adicional.`

    if (previousAnalysis) {
      prompt = `Analiza nuevamente esta imagen de ticket o recibo con más detalle.

Análisis anterior:
${JSON.stringify(previousAnalysis, null, 2)}

Proporciona un análisis mejorado en formato JSON con los mismos campos:
{
  "amount": número del importe total,
  "category": "Gasto",
  "subcategory": categoría específica,
  "concept": descripción detallada,
  "merchant": nombre del establecimiento,
  "date": fecha YYYY-MM-DD,
  "notes": observaciones adicionales,
  "confidence": "high", "medium" o "low",
  "time": hora HH:MM,
  "items": productos detallados,
  "taxes": información de impuestos,
  "paymentMethod": método de pago,
  "ticketNumber": número de ticket
}

Responde ÚNICAMENTE con el JSON, sin texto adicional.`
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaTypeFormatted as any,
                data: base64Image,
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

    const claudeDuration = Date.now() - claudeStartTime
    console.log(`[${timestamp}] [API] ✅ Respuesta de Claude recibida en ${claudeDuration}ms`)

    if (!response.content[0] || response.content[0].type !== 'text') {
      console.error(`[${timestamp}] [API] ❌ Respuesta inválida de Claude`)
      return NextResponse.json({
        success: false,
        error: 'Respuesta inválida de Claude API'
      }, { status: 500 })
    }

    let analysisText = response.content[0].text.trim()
    console.log(`[${timestamp}] [API] 📦 Texto de respuesta:`, analysisText.substring(0, 200))

    // Limpiar la respuesta - remover markdown si existe
    if (analysisText.startsWith('```json')) {
      analysisText = analysisText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
    } else if (analysisText.startsWith('```')) {
      analysisText = analysisText.replace(/```\n?/g, '')
    }

    // Parsear el JSON
    let analysis
    try {
      analysis = JSON.parse(analysisText)
    } catch (parseError: any) {
      console.error(`[${timestamp}] [API] ❌ Error parseando JSON:`, parseError.message)
      console.error(`[${timestamp}] [API] Texto recibido:`, analysisText)
      return NextResponse.json({
        success: false,
        error: 'Error parseando respuesta de Claude',
        details: { parseError: parseError.message, rawText: analysisText.substring(0, 500) }
      }, { status: 500 })
    }

    console.log(`[${timestamp}] [API] ✅ Análisis exitoso`)
    console.log(`[${timestamp}] [API]   - Importe: €${analysis.amount}`)
    console.log(`[${timestamp}] [API]   - Concepto: ${analysis.concept}`)
    console.log(`[${timestamp}] [API]   - Categoría: ${analysis.subcategory}`)

    // Preparar respuesta
    const result = {
      success: true,
      data: {
        amount: parseFloat(analysis.amount) || 0,
        category: analysis.category || 'Gasto',
        subcategory: analysis.subcategory || 'Otro',
        concept: analysis.concept || 'Gasto sin descripción',
        merchant: analysis.merchant || undefined,
        date: analysis.date || undefined,
        notes: analysis.notes || '',
        confidence: analysis.confidence || 'medium',
        rawAnalysis: analysisText,
        // Campos adicionales opcionales
        time: analysis.time || undefined,
        items: analysis.items || undefined,
        taxes: analysis.taxes || undefined,
        paymentMethod: analysis.paymentMethod || undefined,
        ticketNumber: analysis.ticketNumber || undefined,
      }
    }

    console.log(`[${timestamp}] [API] 📤 Enviando respuesta al cliente`)
    return NextResponse.json(result)

  } catch (error: any) {
    const errorTimestamp = new Date().toISOString()
    console.error(`[${errorTimestamp}] [API] ❌ ERROR en análisis`)
    console.error(`[${errorTimestamp}] [API] Tipo: ${error.name || 'Unknown'}`)
    console.error(`[${errorTimestamp}] [API] Mensaje: ${error.message || 'Sin mensaje'}`)
    console.error(`[${errorTimestamp}] [API] Stack:`, error.stack)

    return NextResponse.json({
      success: false,
      error: error.message || 'Error desconocido al analizar la imagen',
      details: {
        type: error.name,
        message: error.message,
      }
    }, { status: 500 })
  }
}

