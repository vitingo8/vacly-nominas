import { NextRequest, NextResponse } from 'next/server'
import { memoryService } from '@/lib/memory-service'

export async function POST(request: NextRequest) {
  try {
    const { query, searchType = 'hybrid', companyId, limit = 10 } = await request.json()
    
    if (!query) {
      return NextResponse.json({ 
        error: 'Query is required' 
      }, { status: 400 })
    }
    
    if (!process.env.VOYAGE_API_KEY) {
      return NextResponse.json({ 
        error: 'Memory search not available',
        details: 'VOYAGE_API_KEY is not configured'
      }, { status: 500 })
    }
    
    const finalCompanyId = companyId || 'e3605f07-2576-4960-81a5-04184661926d'
    
    console.log(`🔍 Searching for: "${query}" (type: ${searchType}, company: ${finalCompanyId})`)
    
    let results
    let relatedMemories = []
    
    switch (searchType) {
      case 'semantic':
        // Pure semantic search
        results = await memoryService.searchSimilarDocuments(
          query,
          finalCompanyId,
          limit
        )
        break
        
      case 'hybrid':
        // Hybrid search (semantic + keyword)
        results = await memoryService.hybridSearch(
          query,
          finalCompanyId,
          { limit }
        )
        break
        
      case 'memories':
        // Search in learned memories
        results = await memoryService.searchSimilarMemories(
          query,
          finalCompanyId,
          limit
        )
        break
        
      default:
        return NextResponse.json({ 
          error: 'Invalid search type',
          details: 'Valid types are: semantic, hybrid, memories'
        }, { status: 400 })
    }
    
    // For document searches, also get related memories
    if (searchType !== 'memories' && results.length > 0) {
      try {
        relatedMemories = await memoryService.searchSimilarMemories(
          query,
          finalCompanyId,
          3 // Get top 3 related memories
        )
      } catch (error) {
        console.warn('Failed to get related memories:', error)
      }
    }
    
    console.log(`✅ Found ${results.length} results and ${relatedMemories.length} related memories`)
    
    return NextResponse.json({
      success: true,
      query,
      searchType,
      resultsCount: results.length,
      results,
      relatedMemories,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ 
      error: 'Search failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || 'e3605f07-2576-4960-81a5-04184661926d'
    
    if (!process.env.VOYAGE_API_KEY) {
      return NextResponse.json({ 
        error: 'Memory analytics not available',
        details: 'VOYAGE_API_KEY is not configured'
      }, { status: 500 })
    }
    
    // Get memory analytics
    const analytics = await memoryService.getMemoryAnalytics(companyId)
    
    return NextResponse.json({
      success: true,
      companyId,
      analytics,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Analytics error:', error)
    return NextResponse.json({ 
      error: 'Failed to get analytics',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 