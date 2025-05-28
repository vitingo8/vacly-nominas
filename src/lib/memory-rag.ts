import { createClient } from '@supabase/supabase-js'
import { generateEmbedding, generateQueryEmbedding, chunkText, generateEmbeddings, calculateVoyageCost } from './embeddings'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface SimilarDocument {
  id: string
  document_id: string
  text_chunk: string
  similarity_score: number
  processed_data?: any
  document_type: string
  employee_id?: string
  metadata: any
}

export interface MemoryContext {
  similar_documents: SimilarDocument[]
  company_patterns: any[]
  employee_patterns: any[]
  learned_keywords: string[]
}

// Buscar documentos similares usando embeddings de Voyage AI
export async function findSimilarDocuments(
  queryText: string,
  companyId: string,
  documentType: string,
  employeeId?: string,
  limit: number = 5,
  threshold: number = 0.7
): Promise<SimilarDocument[]> {
  try {
    // Generar embedding para la consulta usando inputType: 'query'
    const { embedding: queryEmbedding, tokenUsage } = await generateQueryEmbedding(queryText)
    
    console.log(`Query embedding: ${tokenUsage.totalTokens} tokens, ~$${tokenUsage.estimatedCost.toFixed(4)} cost`)
    
    // Construir consulta SQL para búsqueda vectorial con Voyage
    let query = supabase
      .rpc('search_similar_documents_voyage', {
        query_embedding: queryEmbedding,
        company_id: companyId,
        document_type_name: documentType,
        similarity_threshold: threshold,
        match_count: limit
      })

    // Si se especifica empleado, filtrar por él también
    if (employeeId) {
      query = query.eq('employee_id', employeeId)
    }

    const { data, error } = await query
    
    if (error) {
      console.error('Error in findSimilarDocuments:', error)
      throw error
    }
    
    return data || []
  } catch (error) {
    console.error('Error in findSimilarDocuments:', error)
    throw error
  }
}

// Obtener memoria contextual de la empresa y empleado
export async function getMemoryContext(
  companyId: string,
  documentType: string,
  employeeId?: string
): Promise<MemoryContext> {
  try {
    // Get document type ID
    const { data: docType } = await supabase
      .from('document_types')
      .select('id')
      .eq('name', documentType)
      .single()

    if (!docType) {
      throw new Error(`Document type '${documentType}' not found`)
    }

    // Obtener patrones aprendidos de la empresa
    const { data: companyPatterns } = await supabase
      .from('document_memory')
      .select('*')
      .eq('company_id', companyId)
      .eq('document_type_id', docType.id)
      .is('employee_id', null)
      .order('confidence_score', { ascending: false })
      .limit(3)

    // Obtener patrones específicos del empleado si se proporciona
    let employeePatterns = []
    if (employeeId) {
      const { data } = await supabase
        .from('document_memory')
        .select('*')
        .eq('company_id', companyId)
        .eq('document_type_id', docType.id)
        .eq('employee_id', employeeId)
        .order('confidence_score', { ascending: false })
        .limit(2)
      
      employeePatterns = data || []
    }

    // Combinar keywords de todos los patrones
    const allPatterns = [...(companyPatterns || []), ...employeePatterns]
    const learnedKeywords = Array.from(
      new Set(allPatterns.flatMap(p => p.keywords || []))
    )

    return {
      similar_documents: [],
      company_patterns: companyPatterns || [],
      employee_patterns: employeePatterns,
      learned_keywords: learnedKeywords
    }
  } catch (error) {
    console.error('Error getting memory context:', error)
    throw error
  }
}

// Almacenar embeddings de un documento procesado usando Voyage AI
export async function storeDocumentEmbeddings(
  documentId: string,
  companyId: string,
  documentTypeId: string,
  extractedText: string,
  employeeId?: string
): Promise<boolean> {
  try {
    // Dividir texto en chunks optimizados
    const chunks = chunkText(extractedText, 800)
    
    // Generar embeddings para cada chunk usando Voyage con optimización de costos
    const { results: embeddingsData, tokenUsage } = await generateEmbeddings(chunks)
    
    console.log(`Document embeddings: ${tokenUsage.chunksProcessed} chunks processed, ${tokenUsage.duplicatesSkipped} duplicates skipped, ${tokenUsage.totalTokens} tokens, ~$${tokenUsage.estimatedCost.toFixed(4)} cost`)
    
    // Preparar datos para inserción - voyage-3.5-lite retorna vectores de 512 dimensiones
    const embeddings = embeddingsData.map(({ chunk, embedding }) => ({
      document_id: documentId,
      company_id: companyId,
      document_type_id: documentTypeId,
      employee_id: employeeId || null,
      text_chunk: chunk.text,
      chunk_index: chunk.index,
      embedding: embedding, // Vector como array directo para pgvector
      metadata: {
        ...chunk.metadata,
        token_count: chunk.metadata?.tokens || 0,
        cost_estimate: calculateVoyageCost(chunk.metadata?.tokens || 0)
      }
    }))

    // Insertar embeddings en lotes
    const { error } = await supabase
      .from('document_embeddings')
      .insert(embeddings)

    if (error) {
      console.error('Error storing Voyage embeddings:', error)
      throw error
    }

    console.log(`Stored ${embeddings.length} Voyage embeddings for document ${documentId}`)
    return true
  } catch (error) {
    console.error('Error in storeDocumentEmbeddings:', error)
    throw error
  }
}

// Actualizar memoria después de procesar un documento
export async function updateMemory(
  companyId: string,
  documentTypeId: string,
  processedData: any,
  conversationId: string,
  employeeId?: string
): Promise<void> {
  try {
    // Analizar patrones del documento procesado
    const patterns = extractPatterns(processedData)
    const keywords = extractKeywords(processedData)
    const summary = generateSummary(processedData)

    // Buscar memoria existente
    const { data: existingMemory } = await supabase
      .from('document_memory')
      .select('*')
      .eq('company_id', companyId)
      .eq('document_type_id', documentTypeId)
      .eq('employee_id', employeeId || null)
      .eq('conversation_id', conversationId)
      .single()

    if (existingMemory) {
      // Actualizar memoria existente
      const updatedPatterns = mergePatterns(existingMemory.learned_patterns, patterns)
      const updatedKeywords = Array.from(new Set([...(existingMemory.keywords || []), ...keywords]))
      
      await supabase
        .from('document_memory')
        .update({
          summary: summary,
          learned_patterns: updatedPatterns,
          keywords: updatedKeywords,
          usage_count: existingMemory.usage_count + 1,
          last_used_at: new Date().toISOString(),
          confidence_score: Math.min(1.0, existingMemory.confidence_score + 0.1)
        })
        .eq('id', existingMemory.id)
    } else {
      // Crear nueva memoria
      await supabase
        .from('document_memory')
        .insert({
          company_id: companyId,
          employee_id: employeeId || null,
          document_type_id: documentTypeId,
          conversation_id: conversationId,
          summary: summary,
          learned_patterns: patterns,
          keywords: keywords,
          confidence_score: 0.5
        })
    }
  } catch (error) {
    console.error('Error updating memory:', error)
    throw error
  }
}

// Construir contexto completo para Claude con embeddings de Voyage
export async function buildClaudeContext(
  queryText: string,
  companyId: string,
  documentType: string,
  employeeId?: string
): Promise<string> {
  try {
    // Buscar documentos similares usando Voyage embeddings
    const similarDocs = await findSimilarDocuments(queryText, companyId, documentType, employeeId)
    
    // Obtener memoria contextual
    const memoryContext = await getMemoryContext(companyId, documentType, employeeId)
    
    // Construir contexto enriquecido
    let context = `## Context de la empresa y empleado (Powered by Voyage AI):\n\n`
    
    if (memoryContext.company_patterns.length > 0) {
      context += `### Patrones aprendidos de la empresa:\n`
      memoryContext.company_patterns.forEach(pattern => {
        context += `- ${pattern.summary}\n`
        if (pattern.learned_patterns) {
          context += `  Patrones específicos: ${JSON.stringify(pattern.learned_patterns)}\n`
        }
      })
      context += `\n`
    }

    if (memoryContext.employee_patterns.length > 0) {
      context += `### Patrones específicos del empleado:\n`
      memoryContext.employee_patterns.forEach(pattern => {
        context += `- ${pattern.summary}\n`
      })
      context += `\n`
    }

    if (memoryContext.learned_keywords.length > 0) {
      context += `### Palabras clave relevantes: ${memoryContext.learned_keywords.join(', ')}\n\n`
    }

    if (similarDocs.length > 0) {
      context += `### Documentos similares procesados anteriormente (búsqueda semántica con Voyage):\n`
      similarDocs.forEach((doc, index) => {
        context += `${index + 1}. Similaridad: ${(doc.similarity_score * 100).toFixed(1)}%\n`
        context += `   Texto: ${doc.text_chunk.substring(0, 200)}...\n`
        if (doc.processed_data) {
          context += `   Datos procesados: ${JSON.stringify(doc.processed_data).substring(0, 300)}...\n`
        }
        context += `\n`
      })
    }

    return context
  } catch (error) {
    console.error('Error building Claude context:', error)
    throw error
  }
}

// Funciones auxiliares
function extractPatterns(processedData: any): any {
  // Extraer patrones de los datos procesados
  const patterns: any = {}
  
  if (processedData.perceptions) {
    patterns.common_perceptions = Object.keys(processedData.perceptions)
  }
  
  if (processedData.deductions) {
    patterns.common_deductions = Object.keys(processedData.deductions)
  }

  return patterns
}

function extractKeywords(processedData: any): string[] {
  const keywords: string[] = []
  
  // Extraer keywords de los datos estructurados
  const text = JSON.stringify(processedData).toLowerCase()
  const commonPayrollTerms = [
    'salari', 'sou', 'base', 'complement', 'extra', 'hores',
    'irpf', 'seguretat', 'social', 'descompte', 'retenció'
  ]
  
  commonPayrollTerms.forEach(term => {
    if (text.includes(term)) {
      keywords.push(term)
    }
  })

  return keywords
}

function generateSummary(processedData: any): string {
  // Generar resumen automático del documento procesado
  const parts = []
  
  if (processedData.employee?.name) {
    parts.push(`Empleado: ${processedData.employee.name}`)
  }
  
  if (processedData.company?.name) {
    parts.push(`Empresa: ${processedData.company.name}`)
  }
  
  if (processedData.period_start && processedData.period_end) {
    parts.push(`Período: ${processedData.period_start} - ${processedData.period_end}`)
  }
  
  const numPerceptions = processedData.perceptions ? processedData.perceptions.length : 0
  const numDeductions = processedData.deductions ? processedData.deductions.length : 0
  
  parts.push(`${numPerceptions} percepciones, ${numDeductions} deducciones`)

  return parts.join('. ')
}

function mergePatterns(existing: any, newPatterns: any): any {
  const merged = { ...existing }
  
  Object.keys(newPatterns).forEach(key => {
    if (merged[key]) {
      if (Array.isArray(merged[key]) && Array.isArray(newPatterns[key])) {
        merged[key] = Array.from(new Set([...merged[key], ...newPatterns[key]]))
      }
    } else {
      merged[key] = newPatterns[key]
    }
  })

  return merged
}