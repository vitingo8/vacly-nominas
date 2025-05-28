import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { memoryService } from '@/lib/memory-service'

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

    console.log('Fetching enhanced memory status for company:', companyId)

    // Get enhanced analytics from memory service
    const analytics = await memoryService.getMemoryAnalytics(companyId)

    // Get memory statistics with joins and better metadata
    const { data: memoryStats, error: memoryError } = await supabase
      .from('document_memory')
      .select(`
        *,
        document_types(name)
      `)
      .eq('company_id', companyId)
      .order('confidence_score', { ascending: false })
      .limit(20) // Get top 20 memories

    if (memoryError) {
      console.error('Error fetching memory stats:', memoryError)
      return NextResponse.json({ 
        error: 'Failed to fetch memory stats',
        details: memoryError.message,
        code: memoryError.code
      }, { status: 500 })
    }

    // Get embedding statistics with enhanced data
    const { data: embeddingStats, error: embeddingError } = await supabase
      .from('document_embeddings')
      .select(`
        document_type_id,
        chunk_index,
        chunk_size,
        token_count,
        processing_model,
        created_at,
        metadata_jsonb,
        document_types(name)
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(100) // Get more for better statistics

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
      original_filename: doc.original_filename,
      processing_status: doc.processing_status,
      created_at: doc.created_at,
      document_type: (doc.document_types as any)?.name || 'unknown'
    }))

    // Calculate enhanced statistics
    const totalMemories = memoryStats?.length || 0
    const totalEmbeddings = embeddingStats?.length || 0
    const totalProcessed = processedDocs?.length || 0
    
    const avgConfidence = totalMemories > 0 
      ? memoryStats.reduce((acc: number, mem: any) => acc + (mem.confidence_score || 0), 0) / totalMemories
      : 0

    // Calculate chunk size distribution
    const chunkSizes = embeddingStats?.map(e => e.chunk_size || 0) || []
    const avgChunkSize = chunkSizes.length > 0 
      ? Math.round(chunkSizes.reduce((a, b) => a + b, 0) / chunkSizes.length)
      : 0
    const minChunkSize = chunkSizes.length > 0 ? Math.min(...chunkSizes) : 0
    const maxChunkSize = chunkSizes.length > 0 ? Math.max(...chunkSizes) : 0

    // Group embeddings by document type
    const embeddingsByType = embeddingStats?.reduce((acc: any, emb: any) => {
      const typeName = (emb.document_types as any)?.name || 'unknown'
      acc[typeName] = (acc[typeName] || 0) + 1
      return acc
    }, {}) || {}

    // Extract unique companies and employees from memories
    const uniqueCompanies = new Set<string>()
    const uniqueEmployees = new Set<string>()
    
    memoryStats?.forEach((memory: any) => {
      try {
        if (memory.learned_patterns_jsonb) {
          const patterns = memory.learned_patterns_jsonb
          patterns.forEach((pattern: any) => {
            if (pattern.type === 'company' && pattern.examples?.[0]?.name) {
              uniqueCompanies.add(pattern.examples[0].name)
            }
            if (pattern.type === 'employee' && pattern.examples?.[0]?.name) {
              uniqueEmployees.add(pattern.examples[0].name)
            }
          })
        }
      } catch (e) {
        // Ignore parsing errors
      }
    })

    // Memory quality distribution
    const memoryQualityDistribution = {
      high: memoryStats?.filter((m: any) => m.confidence_score >= 0.8).length || 0,
      medium: memoryStats?.filter((m: any) => m.confidence_score >= 0.6 && m.confidence_score < 0.8).length || 0,
      low: memoryStats?.filter((m: any) => m.confidence_score < 0.6).length || 0
    }

    // Validation status distribution
    const validationDistribution = {
      validated: memoryStats?.filter((m: any) => m.validation_status === 'validated').length || 0,
      pending: memoryStats?.filter((m: any) => m.validation_status === 'pending').length || 0,
      rejected: memoryStats?.filter((m: any) => m.validation_status === 'rejected').length || 0
    }

    console.log('Enhanced memory status fetched successfully')

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
          embeddings_by_type: embeddingsByType,
          unique_companies: Array.from(uniqueCompanies),
          unique_employees: Array.from(uniqueEmployees),
          companies_count: uniqueCompanies.size,
          employees_count: uniqueEmployees.size
        },
        chunk_analytics: {
          total_chunks: totalEmbeddings,
          avg_chunk_size: avgChunkSize,
          min_chunk_size: minChunkSize,
          max_chunk_size: maxChunkSize,
          optimal_chunk_size: 400 // Our target
        },
        memory_quality: {
          distribution: memoryQualityDistribution,
          validation_status: validationDistribution,
          avg_usage_count: totalMemories > 0
            ? Math.round(memoryStats.reduce((acc: number, m: any) => acc + (m.usage_count || 0), 0) / totalMemories)
            : 0
        },
        advanced_analytics: analytics // From memory service
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

export async function DELETE(request: NextRequest) {
  try {
    if (!process.env.VOYAGE_API_KEY) {
      return NextResponse.json({ 
        error: 'Voyage AI not configured',
        details: 'VOYAGE_API_KEY environment variable is required for the memory system'
      }, { status: 500 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || 'e3605f07-2576-4960-81a5-04184661926d'
    const type = searchParams.get('type') // 'all', 'patterns', 'embeddings', 'documents'
    const patternId = searchParams.get('patternId') // specific pattern to delete

    console.log('Deleting memory data for company:', companyId, 'type:', type)

    if (patternId) {
      // Delete specific pattern
      const { error } = await supabase
        .from('document_memory')
        .delete()
        .eq('id', patternId)
        .eq('company_id', companyId)

      if (error) {
        console.error('Error deleting pattern:', error)
        return NextResponse.json({ 
          error: 'Failed to delete pattern',
          details: error.message
        }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: 'Patrón eliminado exitosamente'
      })
    }

    switch (type) {
      case 'all':
        // Delete all memory data for the company
        await Promise.all([
          supabase.from('document_memory').delete().eq('company_id', companyId),
          supabase.from('document_embeddings').delete().eq('company_id', companyId),
          supabase.from('processed_documents').delete().eq('company_id', companyId)
        ])
        break

      case 'patterns':
        // Delete only memory patterns
        await supabase.from('document_memory').delete().eq('company_id', companyId)
        break

      case 'embeddings':
        // Delete only embeddings
        await supabase.from('document_embeddings').delete().eq('company_id', companyId)
        break

      case 'documents':
        // Delete only processed documents history
        await supabase.from('processed_documents').delete().eq('company_id', companyId)
        break

      default:
        return NextResponse.json({ 
          error: 'Invalid deletion type',
          details: 'Type must be: all, patterns, embeddings, documents, or provide patternId'
        }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: 'Datos de memoria eliminados exitosamente'
    })

  } catch (error) {
    console.error('Memory deletion error:', error)
    return NextResponse.json({ 
      error: 'Failed to delete memory data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 