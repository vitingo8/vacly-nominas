import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Voyage AI Configuration
const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings'
const VOYAGE_MODEL = 'voyage-3' // Latest model for best quality
const OPTIMAL_CHUNK_SIZE = 400 // Characters - optimal for Spanish payroll documents
const CHUNK_OVERLAP = 50 // Characters overlap between chunks

interface ChunkMetadata {
  page_number?: number
  section?: string
  chunk_position?: number
  total_chunks?: number
  has_table?: boolean
  has_amounts?: boolean
  keywords?: string[]
}

interface MemoryPattern {
  type: 'perception' | 'deduction' | 'contribution' | 'employee' | 'company'
  pattern: string
  confidence: number
  examples: string[]
}

/**
 * Advanced Memory Service for Enterprise Payroll Processing
 */
export class MemoryService {
  private voyageApiKey: string

  constructor() {
    if (!process.env.VOYAGE_API_KEY) {
      throw new Error('VOYAGE_API_KEY is required for memory service')
    }
    this.voyageApiKey = process.env.VOYAGE_API_KEY
  }

  /**
   * Generate embeddings using Voyage AI
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const response = await fetch(VOYAGE_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.voyageApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          input: texts,
          model: VOYAGE_MODEL,
          input_type: 'document' // Optimized for document retrieval
        })
      })

      if (!response.ok) {
        throw new Error(`Voyage AI error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      return data.data.map((item: any) => item.embedding)
    } catch (error) {
      console.error('Error generating embeddings:', error)
      throw error
    }
  }

  /**
   * Advanced text chunking with intelligent splitting
   */
  async createSmartChunks(text: string, metadata: ChunkMetadata = {}): Promise<Array<{
    text: string
    metadata: ChunkMetadata
    hash: string
  }>> {
    const chunks: Array<{ text: string; metadata: ChunkMetadata; hash: string }> = []
    
    // Normalize text
    const normalizedText = text.replace(/\s+/g, ' ').trim()
    
    // Split by semantic boundaries (periods, double newlines, section headers)
    const semanticBoundaries = /(?<=[.!?])\s+(?=[A-Z])|(?:\n\s*\n)|(?=(?:PERCEPCIONES|DEDUCCIONES|DEVENGOS|RETRIBUCIONES|DATOS DEL TRABAJADOR|DATOS DE LA EMPRESA))/g
    const segments = normalizedText.split(semanticBoundaries)
    
    let currentChunk = ''
    let chunkIndex = 0
    
    for (const segment of segments) {
      // If adding this segment exceeds optimal size, save current chunk
      if (currentChunk.length > 0 && (currentChunk.length + segment.length) > OPTIMAL_CHUNK_SIZE) {
        // Add chunk with overlap from next segment
        const overlapText = segment.substring(0, CHUNK_OVERLAP)
        const finalChunk = currentChunk + (overlapText.length > 0 ? ' ' + overlapText : '')
        
        chunks.push({
          text: finalChunk,
          metadata: {
            ...metadata,
            chunk_position: chunkIndex,
            has_amounts: /\d+[,.]?\d*\s*€/.test(finalChunk),
            has_table: /\|/.test(finalChunk) || /\t/.test(finalChunk),
            keywords: this.extractKeywords(finalChunk)
          },
          hash: this.generateHash(finalChunk)
        })
        
        currentChunk = segment
        chunkIndex++
      } else {
        currentChunk += (currentChunk.length > 0 ? ' ' : '') + segment
      }
    }
    
    // Don't forget the last chunk
    if (currentChunk.trim().length > 0) {
      chunks.push({
        text: currentChunk,
        metadata: {
          ...metadata,
          chunk_position: chunkIndex,
          has_amounts: /\d+[,.]?\d*\s*€/.test(currentChunk),
          has_table: /\|/.test(currentChunk) || /\t/.test(currentChunk),
          keywords: this.extractKeywords(currentChunk)
        },
        hash: this.generateHash(currentChunk)
      })
    }
    
    // Update total_chunks in all chunks
    chunks.forEach(chunk => {
      chunk.metadata.total_chunks = chunks.length
    })
    
    return chunks
  }

  /**
   * Extract keywords from text for indexing
   */
  private extractKeywords(text: string): string[] {
    const keywords = new Set<string>()
    
    // Common payroll terms
    const payrollTerms = [
      'salario', 'nómina', 'percepciones', 'deducciones', 'irpf', 'seguridad social',
      'base cotización', 'contingencias', 'empresa', 'trabajador', 'dni', 'nss',
      'categoria', 'convenio', 'plus', 'extra', 'prorrata', 'líquido', 'bruto'
    ]
    
    // Extract found payroll terms
    payrollTerms.forEach(term => {
      if (text.toLowerCase().includes(term)) {
        keywords.add(term)
      }
    })
    
    // Extract monetary amounts
    const amounts = text.match(/\d+[,.]?\d*\s*€/g)
    if (amounts) {
      amounts.slice(0, 3).forEach(amount => keywords.add(amount))
    }
    
    // Extract dates
    const dates = text.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/g)
    if (dates) {
      dates.slice(0, 2).forEach(date => keywords.add(date))
    }
    
    // Extract uppercase words (likely headers or important terms)
    const uppercaseWords = text.match(/\b[A-Z]{2,}\b/g)
    if (uppercaseWords) {
      uppercaseWords.slice(0, 5).forEach(word => keywords.add(word))
    }
    
    return Array.from(keywords).slice(0, 10) // Limit to 10 keywords
  }

  /**
   * Generate hash for deduplication
   */
  private generateHash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex').substring(0, 16)
  }

  /**
   * Store document chunks with embeddings
   */
  async storeDocumentChunks(
    documentId: string,
    companyId: string,
    chunks: Array<{ text: string; metadata: ChunkMetadata; hash: string }>,
    documentTypeId?: string
  ): Promise<void> {
    try {
      // Check for existing chunks to avoid duplicates
      const { data: existingChunks } = await supabase
        .from('document_embeddings')
        .select('chunk_hash')
        .eq('document_id', documentId)
      
      const existingHashes = new Set(existingChunks?.map(c => c.chunk_hash) || [])
      
      // Filter out duplicate chunks
      const newChunks = chunks.filter(chunk => !existingHashes.has(chunk.hash))
      
      if (newChunks.length === 0) {
        console.log('No new chunks to store (all duplicates)')
        return
      }
      
      // Generate embeddings for new chunks
      const texts = newChunks.map(chunk => chunk.text)
      const embeddings = await this.generateEmbeddings(texts)
      
      // Prepare data for insertion
      const embeddingRecords = newChunks.map((chunk, index) => ({
        id: uuidv4(),
        document_id: documentId,
        company_id: companyId,
        document_type_id: documentTypeId,
        text_chunk: chunk.text,
        chunk_index: chunk.metadata.chunk_position || index,
        chunk_size: chunk.text.length,
        token_count: Math.ceil(chunk.text.length / 4), // Approximate
        embedding: JSON.stringify(embeddings[index]), // Store as JSON for now
        embedding_vector: embeddings[index], // Store as vector
        metadata_jsonb: chunk.metadata,
        chunk_hash: chunk.hash,
        processing_model: VOYAGE_MODEL,
        created_at: new Date().toISOString()
      }))
      
      // Batch insert
      const { error } = await supabase
        .from('document_embeddings')
        .insert(embeddingRecords)
      
      if (error) {
        console.error('Error storing embeddings:', error)
        throw error
      }
      
      console.log(`✅ Stored ${embeddingRecords.length} new chunks with embeddings`)
    } catch (error) {
      console.error('Error in storeDocumentChunks:', error)
      throw error
    }
  }

  /**
   * Learn patterns from processed document
   */
  async learnFromDocument(
    companyId: string,
    employeeId: string,
    documentData: any,
    confidence: number = 0.75
  ): Promise<void> {
    try {
      // Extract patterns
      const patterns = this.extractPatterns(documentData)
      
      // Create summary
      const summary = this.createDocumentSummary(documentData)
      
      // Extract keywords
      const keywords = this.extractDocumentKeywords(documentData)
      
      // Generate embeddings for summary and patterns
      const [summaryEmbedding] = await this.generateEmbeddings([summary])
      const patternsText = JSON.stringify(patterns)
      const [patternsEmbedding] = await this.generateEmbeddings([patternsText])
      
      // Store memory
      const memoryRecord = {
        id: uuidv4(),
        company_id: companyId,
        employee_id: employeeId,
        summary: summary,
        summary_embedding: summaryEmbedding,
        learned_patterns: patternsText, // Keep for compatibility
        learned_patterns_jsonb: patterns,
        patterns_embedding: patternsEmbedding,
        keywords: keywords.join(','), // Keep for compatibility
        keywords_array: keywords,
        confidence_score: confidence,
        usage_count: 1,
        processing_model: 'claude-3.5-haiku',
        validation_status: confidence > 0.9 ? 'validated' : 'pending',
        created_at: new Date().toISOString(),
        last_used_at: new Date().toISOString()
      }
      
      const { error } = await supabase
        .from('document_memory')
        .insert(memoryRecord)
      
      if (error) {
        console.error('Error storing memory:', error)
        throw error
      }
      
      console.log('✅ Learned new patterns from document')
    } catch (error) {
      console.error('Error in learnFromDocument:', error)
      throw error
    }
  }

  /**
   * Extract patterns from document data
   */
  private extractPatterns(documentData: any): MemoryPattern[] {
    const patterns: MemoryPattern[] = []
    
    // Employee patterns
    if (documentData.employee) {
      patterns.push({
        type: 'employee',
        pattern: `Employee: ${documentData.employee.name}, DNI: ${documentData.employee.dni}`,
        confidence: 0.95,
        examples: [documentData.employee]
      })
    }
    
    // Company patterns
    if (documentData.company) {
      patterns.push({
        type: 'company',
        pattern: `Company: ${documentData.company.name}, CIF: ${documentData.company.cif}`,
        confidence: 0.95,
        examples: [documentData.company]
      })
    }
    
    // Perception patterns
    if (documentData.perceptions?.length > 0) {
      const perceptionCodes = documentData.perceptions.map((p: any) => p.code).filter(Boolean)
      patterns.push({
        type: 'perception',
        pattern: `Common perception codes: ${perceptionCodes.join(', ')}`,
        confidence: 0.85,
        examples: documentData.perceptions.slice(0, 3)
      })
    }
    
    // Deduction patterns
    if (documentData.deductions?.length > 0) {
      const deductionCodes = documentData.deductions.map((d: any) => d.code).filter(Boolean)
      patterns.push({
        type: 'deduction',
        pattern: `Common deduction codes: ${deductionCodes.join(', ')}`,
        confidence: 0.85,
        examples: documentData.deductions.slice(0, 3)
      })
    }
    
    return patterns
  }

  /**
   * Create document summary
   */
  private createDocumentSummary(documentData: any): string {
    const parts = []
    
    if (documentData.employee?.name) {
      parts.push(`Empleado: ${documentData.employee.name}`)
    }
    if (documentData.company?.name) {
      parts.push(`Empresa: ${documentData.company.name}`)
    }
    if (documentData.period_start && documentData.period_end) {
      parts.push(`Período: ${documentData.period_start} - ${documentData.period_end}`)
    }
    if (documentData.net_pay) {
      parts.push(`Neto: €${documentData.net_pay}`)
    }
    if (documentData.gross_salary) {
      parts.push(`Bruto: €${documentData.gross_salary}`)
    }
    
    return parts.join('. ')
  }

  /**
   * Extract keywords from document
   */
  private extractDocumentKeywords(documentData: any): string[] {
    const keywords = new Set<string>()
    
    // Add company name
    if (documentData.company?.name) {
      keywords.add(documentData.company.name)
    }
    
    // Add employee category
    if (documentData.employee?.category) {
      keywords.add(documentData.employee.category)
    }
    
    // Add period
    if (documentData.period_start) {
      keywords.add(documentData.period_start)
    }
    
    // Add significant amounts
    if (documentData.net_pay) {
      keywords.add(`€${documentData.net_pay}`)
    }
    
    // Add perception/deduction concepts
    if (documentData.perceptions) {
      documentData.perceptions.slice(0, 3).forEach((p: any) => {
        if (p.concept) keywords.add(p.concept)
      })
    }
    
    return Array.from(keywords).slice(0, 15)
  }

  /**
   * Search similar documents using semantic search
   */
  async searchSimilarDocuments(
    query: string,
    companyId: string,
    limit: number = 10,
    threshold: number = 0.7
  ): Promise<any[]> {
    try {
      const startTime = Date.now()
      
      // Generate query embedding
      const [queryEmbedding] = await this.generateEmbeddings([query])
      const embeddingTime = Date.now() - startTime
      
      // Search using the SQL function
      const { data, error } = await supabase
        .rpc('search_similar_chunks', {
          query_embedding: queryEmbedding,
          company_id_param: companyId,
          limit_param: limit,
          threshold: threshold
        })
      
      const dbTime = Date.now() - startTime - embeddingTime
      
      if (error) {
        console.error('Error searching documents:', error)
        throw error
      }
      
      // Log search for analytics
      await this.logSearch({
        company_id: companyId,
        query_text: query,
        query_embedding: queryEmbedding,
        search_type: 'semantic',
        results_count: data?.length || 0,
        search_latency_ms: Date.now() - startTime,
        embedding_latency_ms: embeddingTime,
        db_latency_ms: dbTime,
        top_results: data?.slice(0, 5).map((r: any) => ({
          id: r.chunk_id,
          similarity: r.similarity,
          text_preview: r.text_chunk.substring(0, 100)
        }))
      })
      
      return data || []
    } catch (error) {
      console.error('Error in searchSimilarDocuments:', error)
      throw error
    }
  }

  /**
   * Search similar memories
   */
  async searchSimilarMemories(
    query: string,
    companyId: string,
    limit: number = 5
  ): Promise<any[]> {
    try {
      // Generate query embedding
      const [queryEmbedding] = await this.generateEmbeddings([query])
      
      // Search using the SQL function
      const { data, error } = await supabase
        .rpc('search_similar_memories', {
          query_embedding: queryEmbedding,
          company_id_param: companyId,
          limit_param: limit,
          threshold: 0.7
        })
      
      if (error) {
        console.error('Error searching memories:', error)
        throw error
      }
      
      // Update usage count for retrieved memories
      if (data && data.length > 0) {
        const memoryIds = data.map((m: any) => m.memory_id)
        await supabase
          .from('document_memory')
          .update({ 
            usage_count: "usage_count + 1",
            last_used_at: new Date().toISOString()
          })
          .in('id', memoryIds)
      }
      
      return data || []
    } catch (error) {
      console.error('Error in searchSimilarMemories:', error)
      throw error
    }
  }

  /**
   * Hybrid search combining semantic and keyword search
   */
  async hybridSearch(
    query: string,
    companyId: string,
    options: {
      semanticWeight?: number
      keywordWeight?: number
      limit?: number
      filters?: any
    } = {}
  ): Promise<any[]> {
    const {
      semanticWeight = 0.7,
      keywordWeight = 0.3,
      limit = 10,
      filters = {}
    } = options
    
    try {
      // Semantic search
      const semanticResults = await this.searchSimilarDocuments(query, companyId, limit * 2)
      
      // Keyword search
      const keywords = query.toLowerCase().split(/\s+/)
      const { data: keywordResults } = await supabase
        .from('document_embeddings')
        .select('*, document_types(name)')
        .eq('company_id', companyId)
        .or(keywords.map(k => `text_chunk.ilike.%${k}%`).join(','))
        .limit(limit * 2)
      
      // Combine and rank results
      const combinedResults = new Map()
      
      // Add semantic results
      semanticResults.forEach(result => {
        combinedResults.set(result.chunk_id, {
          ...result,
          semantic_score: result.similarity * semanticWeight,
          keyword_score: 0,
          combined_score: result.similarity * semanticWeight
        })
      })
      
      // Add keyword results
      keywordResults?.forEach(result => {
        const existing = combinedResults.get(result.id)
        const keywordScore = this.calculateKeywordScore(result.text_chunk, keywords) * keywordWeight
        
        if (existing) {
          existing.keyword_score = keywordScore
          existing.combined_score = existing.semantic_score + keywordScore
        } else {
          combinedResults.set(result.id, {
            chunk_id: result.id,
            document_id: result.document_id,
            text_chunk: result.text_chunk,
            metadata: result.metadata_jsonb,
            chunk_index: result.chunk_index,
            document_type: result.document_types?.name,
            semantic_score: 0,
            keyword_score: keywordScore,
            combined_score: keywordScore
          })
        }
      })
      
      // Sort by combined score and return top results
      const sortedResults = Array.from(combinedResults.values())
        .sort((a, b) => b.combined_score - a.combined_score)
        .slice(0, limit)
      
      return sortedResults
    } catch (error) {
      console.error('Error in hybridSearch:', error)
      throw error
    }
  }

  /**
   * Calculate keyword relevance score
   */
  private calculateKeywordScore(text: string, keywords: string[]): number {
    const lowerText = text.toLowerCase()
    let score = 0
    
    keywords.forEach(keyword => {
      const occurrences = (lowerText.match(new RegExp(keyword, 'g')) || []).length
      score += occurrences * (1 / keywords.length)
    })
    
    return Math.min(score, 1) // Cap at 1
  }

  /**
   * Log search for analytics
   */
  private async logSearch(logData: any): Promise<void> {
    try {
      await supabase
        .from('memory_search_logs')
        .insert(logData)
    } catch (error) {
      // Don't fail the search if logging fails
      console.error('Error logging search:', error)
    }
  }

  /**
   * Get memory analytics for a company
   */
  async getMemoryAnalytics(companyId: string): Promise<any> {
    try {
      // Get latest analytics
      const { data: analytics } = await supabase
        .from('memory_analytics')
        .select('*')
        .eq('company_id', companyId)
        .order('calculated_at', { ascending: false })
        .limit(1)
        .single()
      
      // Get memory stats dashboard
      const { data: dashboard } = await supabase
        .from('memory_stats_dashboard')
        .select('*')
        .eq('company_id', companyId)
        .single()
      
      // Get recent search logs
      const { data: recentSearches } = await supabase
        .from('memory_search_logs')
        .select('query_text, search_type, results_count, search_latency_ms, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(10)
      
      return {
        analytics,
        dashboard,
        recentSearches
      }
    } catch (error) {
      console.error('Error getting memory analytics:', error)
      throw error
    }
  }

  /**
   * Validate and improve memory quality
   */
  async validateMemory(memoryId: string, isValid: boolean, feedback?: string): Promise<void> {
    try {
      const validationScore = isValid ? 1.0 : 0.0
      const newConfidence = isValid ? 0.95 : 0.3
      
      await supabase
        .from('document_memory')
        .update({
          validation_status: isValid ? 'validated' : 'rejected',
          validation_score: validationScore,
          confidence_score: newConfidence,
          feedback_score: validationScore,
          updated_at: new Date().toISOString()
        })
        .eq('id', memoryId)
      
      console.log(`✅ Memory ${memoryId} validated: ${isValid}`)
    } catch (error) {
      console.error('Error validating memory:', error)
      throw error
    }
  }
}

// Export singleton instance
export const memoryService = new MemoryService() 