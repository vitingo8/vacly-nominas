import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
    // Check that Voyage AI is configured (required for memory system)
    if (!process.env.VOYAGE_API_KEY) {
      return NextResponse.json({ 
        error: 'Voyage AI not configured',
        details: 'VOYAGE_API_KEY environment variable is required for the memory system'
      }, { status: 500 })
    }

    // Check environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({ 
        error: 'Supabase URL not configured',
        details: 'Missing NEXT_PUBLIC_SUPABASE_URL environment variable'
      }, { status: 500 })
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ 
        error: 'Supabase service key not configured',
        details: 'Missing SUPABASE_SERVICE_ROLE_KEY environment variable'
      }, { status: 500 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || 'e3605f07-2576-4960-81a5-04184661926d'
    const employeeId = searchParams.get('employeeId') || 'de95edea-9322-494a-a693-61e1ac7337f8'

    console.log('Fetching memory status for company:', companyId)

    // Get memory statistics with joins
    const { data: memoryStats, error: memoryError } = await supabase
      .from('document_memory')
      .select(`
        *,
        document_types(name)
      `)
      .eq('company_id', companyId)
      .order('confidence_score', { ascending: false })

    if (memoryError) {
      console.error('Error fetching memory stats:', memoryError)
      return NextResponse.json({ 
        error: 'Failed to fetch memory stats',
        details: memoryError.message,
        code: memoryError.code
      }, { status: 500 })
    }

    // Get embedding statistics with joins
    const { data: embeddingStats, error: embeddingError } = await supabase
      .from('document_embeddings')
      .select(`
        document_type_id,
        chunk_index,
        created_at,
        document_types(name)
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (embeddingError) {
      console.error('Error fetching embedding stats:', embeddingError)
      return NextResponse.json({ 
        error: 'Failed to fetch embedding stats',
        details: embeddingError.message,
        code: embeddingError.code
      }, { status: 500 })
    }

    // Get processed documents count with joins
    const { data: processedDocs, error: processedError } = await supabase
      .from('processed_documents')
      .select(`
        document_type_id,
        processing_status,
        created_at,
        original_filename,
        document_types(name)
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (processedError) {
      console.error('Error fetching processed docs:', processedError)
      return NextResponse.json({ 
        error: 'Failed to fetch processed docs',
        details: processedError.message,
        code: processedError.code
      }, { status: 500 })
    }

    // Get recent processing activity
    const recentActivity = (processedDocs || []).slice(0, 10).map(doc => ({
      filename: doc.original_filename,
      status: doc.processing_status,
      date: doc.created_at,
      type: (doc.document_types as any)?.name || 'unknown'
    }))

    // Calculate statistics
    const totalMemories = memoryStats?.length || 0
    const totalEmbeddings = embeddingStats?.length || 0
    const totalProcessed = processedDocs?.length || 0
    
    const avgConfidence = totalMemories > 0 
      ? memoryStats.reduce((acc: number, mem: any) => acc + (mem.confidence_score || 0), 0) / totalMemories
      : 0

    // Group embeddings by document type
    const embeddingsByType = embeddingStats?.reduce((acc: any, emb: any) => {
      const typeName = (emb.document_types as any)?.name || 'unknown'
      acc[typeName] = (acc[typeName] || 0) + 1
      return acc
    }, {}) || {}

    console.log('Memory status fetched successfully')

    return NextResponse.json({
      success: true,
      voyage_ai_enabled: true,
      data: {
        company_id: companyId,
        employee_id: employeeId,
        memory_patterns: memoryStats || [],
        embedding_stats: embeddingStats || [],
        processed_documents: processedDocs || [],
        recent_activity: recentActivity,
        summary: {
          total_memories: totalMemories,
          total_embeddings: totalEmbeddings,
          total_processed: totalProcessed,
          avg_confidence: Math.round(avgConfidence * 100) / 100,
          embeddings_by_type: embeddingsByType
        }
      }
    })

  } catch (error) {
    console.error('Memory status error:', error)
    return NextResponse.json({ 
      error: 'Failed to get memory status',
      details: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined
    }, { status: 500 })
  }
} 