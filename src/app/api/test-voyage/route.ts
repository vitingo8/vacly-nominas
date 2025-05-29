import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    console.log('🧪 Testing Voyage 3.5 Lite...')
    
    const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings'
    const VOYAGE_MODEL = 'voyage-3.5-lite'
    
    if (!process.env.VOYAGE_API_KEY) {
      return NextResponse.json({ error: 'VOYAGE_API_KEY not configured' }, { status: 400 })
    }
    
    const response = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: ['Test text for embedding dimensions with Voyage 3.5 Lite'],
        model: VOYAGE_MODEL,
        input_type: 'document'
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Voyage AI error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const data = await response.json()
    const embedding = data.data[0].embedding
    
    console.log('✅ Voyage 3.5 Lite response received')
    console.log(`📏 Embedding dimensions: ${embedding.length}`)
    
    const result = {
      success: true,
      model: VOYAGE_MODEL,
      dimensions: embedding.length,
      first5Values: embedding.slice(0, 5),
      last5Values: embedding.slice(-5),
      compatible: embedding.length === 1024,
      message: embedding.length === 1024 
        ? '🎉 Perfect! Voyage 3.5 Lite produces 1024 dimensions as expected'
        : `⚠️ Unexpected dimension count: ${embedding.length}`
    }
    
    return NextResponse.json(result)
    
  } catch (error) {
    console.error('❌ Error testing Voyage:', error)
    return NextResponse.json({ 
      error: 'Error testing Voyage API',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 