import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || 'e3605f07-2576-4960-81a5-04184661926d'
    const employeeId = searchParams.get('employeeId') || 'de95edea-9322-494a-a693-61e1ac7337f8'

    // Get memory statistics
    const { data: memoryStats, error: memoryError } = await supabase
      .from('document_memory')
      .select(`
        id,
        document_type_id,
        summary,
        learned_patterns,
        keywords,
        confidence_score,
        usage_count,
        last_used_at,
        document_types(name)
      `)
      .eq('company_id', companyId)
      .order('confidence_score', { ascending: false })

    if (memoryError) {
      console.error('Error fetching memory stats:', memoryError)
      return NextResponse.json({ error: 'Failed to fetch memory stats' }, { status: 500 })
    }

    // Get embedding statistics
    const { data: embeddingStats, error: embeddingError } = await supabase
      .from('document_embeddings')
      .select(`
        document_type_id,
        count(*),
        document_types(name)
      `)
      .eq('company_id', companyId)

    if (embeddingError) {
      console.error('Error fetching embedding stats:', embeddingError)
      return NextResponse.json({ error: 'Failed to fetch embedding stats' }, { status: 500 })
    }

    // Get processed documents count
    const { data: processedDocs, error: processedError } = await supabase
      .from('processed_documents')
      .select(`
        document_type_id,
        processing_status,
        count(*),
        document_types(name)
      `)
      .eq('company_id', companyId)

    if (processedError) {
      console.error('Error fetching processed docs:', processedError)
      return NextResponse.json({ error: 'Failed to fetch processed docs' }, { status: 500 })
    }

    // Get recent processing activity
    const { data: recentActivity, error: activityError } = await supabase
      .from('processed_documents')
      .select(`
        original_filename,
        processing_status,
        created_at,
        document_types(name)
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(10)

    if (activityError) {
      console.error('Error fetching recent activity:', activityError)
    }

    return NextResponse.json({
      success: true,
      data: {
        company_id: companyId,
        employee_id: employeeId,
        memory_patterns: memoryStats || [],
        embedding_stats: embeddingStats || [],
        processed_documents: processedDocs || [],
        recent_activity: recentActivity || [],
        summary: {
          total_memories: memoryStats?.length || 0,
          total_embeddings: embeddingStats?.reduce((acc: number, stat: any) => acc + (stat.count || 0), 0) || 0,
          total_processed: processedDocs?.reduce((acc: number, stat: any) => acc + (stat.count || 0), 0) || 0,
          avg_confidence: memoryStats?.length > 0 
            ? memoryStats.reduce((acc: number, mem: any) => acc + (mem.confidence_score || 0), 0) / memoryStats.length 
            : 0
        }
      }
    })

  } catch (error) {
    console.error('Memory status error:', error)
    return NextResponse.json({ 
      error: 'Failed to get memory status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 