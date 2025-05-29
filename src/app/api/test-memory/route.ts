import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    console.log('🧪 Testing Memory Service instantiation...')
    
    // Test if we can import the memory service
    const { memoryService } = await import('@/lib/memory-service')
    console.log('✅ Memory service imported successfully')
    
    // Test if we can call a simple method
    console.log('🔍 Testing simple method call...')
    const testTexts = ['Test text for embedding']
    const embeddings = await memoryService.generateEmbeddings(testTexts)
    console.log('✅ Embeddings generated:', embeddings[0].length, 'dimensions')
    
    return NextResponse.json({
      success: true,
      message: 'Memory service basic test completed successfully',
      embeddingDimensions: embeddings[0].length
    })
    
  } catch (error) {
    console.error('❌ Error in memory service test:', error)
    
    // More detailed error reporting
    const errorDetails = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : typeof error,
      toString: String(error)
    }
    
    return NextResponse.json({ 
      error: 'Error testing memory service',
      details: errorDetails
    }, { status: 500 })
  }
} 