import { VoyageAIClient } from 'voyageai'

const voyageClient = process.env.VOYAGE_API_KEY ? new VoyageAIClient({
  apiKey: process.env.VOYAGE_API_KEY,
}) : null

export interface TextChunk {
  text: string
  index: number
  metadata?: Record<string, any>
}

export interface TokenUsage {
  totalTokens: number
  estimatedCost: number
  chunksProcessed: number
  duplicatesSkipped: number
}

// Token counting for cost estimation (approximate)
export function estimateTokens(text: string): number {
  // Rough estimation: 1 token ≈ 4 characters for most languages
  return Math.ceil(text.length / 4)
}

// Calculate estimated cost for Voyage AI
export function calculateVoyageCost(tokens: number): number {
  // Voyage 3 Lite: ~$0.10 per 1M tokens
  return (tokens / 1000000) * 0.10
}

// Optimized text chunking with overlap for better context
export function chunkText(text: string, maxChunkSize: number = 800, overlap: number = 100): TextChunk[] {
  // Remove excessive whitespace and normalize
  const cleanText = text.replace(/\s+/g, ' ').trim()
  
  if (cleanText.length <= maxChunkSize) {
    return [{
      text: cleanText,
      index: 0,
      metadata: { 
        length: cleanText.length,
        tokens: estimateTokens(cleanText)
      }
    }]
  }

  const chunks: TextChunk[] = []
  let start = 0
  let chunkIndex = 0

  while (start < cleanText.length) {
    let end = Math.min(start + maxChunkSize, cleanText.length)
    
    // Try to break at sentence boundaries
    if (end < cleanText.length) {
      const lastSentence = cleanText.lastIndexOf('.', end)
      const lastQuestion = cleanText.lastIndexOf('?', end)
      const lastExclamation = cleanText.lastIndexOf('!', end)
      
      const bestBreak = Math.max(lastSentence, lastQuestion, lastExclamation)
      if (bestBreak > start + maxChunkSize * 0.7) {
        end = bestBreak + 1
      }
    }

    const chunkText = cleanText.slice(start, end).trim()
    
    if (chunkText.length > 0) {
      chunks.push({
        text: chunkText,
        index: chunkIndex,
        metadata: { 
          length: chunkText.length,
          tokens: estimateTokens(chunkText),
          start_pos: start,
          end_pos: end
        }
      })
      chunkIndex++
    }

    // Move start position with overlap
    start = Math.max(start + maxChunkSize - overlap, end)
  }

  return chunks
}

// Deduplicate similar chunks to save tokens
export function deduplicateChunks(chunks: TextChunk[], similarityThreshold: number = 0.9): TextChunk[] {
  const uniqueChunks: TextChunk[] = []
  
  for (const chunk of chunks) {
    const isDuplicate = uniqueChunks.some(existing => {
      const similarity = calculateTextSimilarity(chunk.text, existing.text)
      return similarity > similarityThreshold
    })
    
    if (!isDuplicate) {
      uniqueChunks.push(chunk)
    }
  }
  
  return uniqueChunks
}

// Simple text similarity calculation
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/))
  const words2 = new Set(text2.toLowerCase().split(/\s+/))
  
  const intersection = new Set([...words1].filter(x => words2.has(x)))
  const union = new Set([...words1, ...words2])
  
  return intersection.size / union.size
}

// Generar embedding para un texto usando Voyage 3 Lite with monitoreo de tokens
export async function generateEmbedding(text: string): Promise<{ embedding: number[], tokenUsage: TokenUsage }> {
  if (!voyageClient) {
    throw new Error('Voyage AI client not initialized. Please set VOYAGE_API_KEY environment variable.')
  }

  const tokens = estimateTokens(text)
  
  try {
    const response = await voyageClient.embed({
      input: [text],
      model: 'voyage-3-lite', // Optimizado para Claude, más económico
      inputType: 'document' // Para indexar documentos
    })

    if (!response.data || !response.data[0] || !response.data[0].embedding) {
      throw new Error('Invalid response from Voyage AI')
    }

    const tokenUsage: TokenUsage = {
      totalTokens: tokens,
      estimatedCost: calculateVoyageCost(tokens),
      chunksProcessed: 1,
      duplicatesSkipped: 0
    }

    return {
      embedding: response.data[0].embedding as number[],
      tokenUsage
    }
  } catch (error) {
    console.error('Error generating Voyage embedding:', error)
    throw new Error('Failed to generate Voyage embedding')
  }
}

// Generar embedding para consultas (diferente tipo de input)
export async function generateQueryEmbedding(text: string): Promise<{ embedding: number[], tokenUsage: TokenUsage }> {
  if (!voyageClient) {
    throw new Error('Voyage AI client not initialized. Please set VOYAGE_API_KEY environment variable.')
  }

  const tokens = estimateTokens(text)

  try {
    const response = await voyageClient.embed({
      input: [text],
      model: 'voyage-3-lite',
      inputType: 'query' // Para búsquedas semánticas
    })

    if (!response.data || !response.data[0] || !response.data[0].embedding) {
      throw new Error('Invalid response from Voyage AI')
    }

    const tokenUsage: TokenUsage = {
      totalTokens: tokens,
      estimatedCost: calculateVoyageCost(tokens),
      chunksProcessed: 1,
      duplicatesSkipped: 0
    }

    return {
      embedding: response.data[0].embedding as number[],
      tokenUsage
    }
  } catch (error) {
    console.error('Error generating Voyage query embedding:', error)
    throw new Error('Failed to generate Voyage query embedding')
  }
}

// Generar embeddings para múltiples chunks with optimización de costos
export async function generateEmbeddings(chunks: TextChunk[]): Promise<{ 
  results: Array<{ chunk: TextChunk; embedding: number[] }>,
  tokenUsage: TokenUsage 
}> {
  if (!voyageClient) {
    throw new Error('Voyage AI client not initialized. Please set VOYAGE_API_KEY environment variable.')
  }

  // Optimize chunks by removing duplicates
  const originalCount = chunks.length
  const optimizedChunks = deduplicateChunks(chunks, 0.85)
  const duplicatesSkipped = originalCount - optimizedChunks.length

  const results = []
  let totalTokens = 0
  
  // Procesar en lotes para eficiencia
  const batchSize = 64 // Reduced from 128 to be more conservative
  for (let i = 0; i < optimizedChunks.length; i += batchSize) {
    const batch = optimizedChunks.slice(i, i + batchSize)
    const batchTexts = batch.map(chunk => chunk.text)
    const batchTokens = batchTexts.reduce((sum, text) => sum + estimateTokens(text), 0)
    
    try {
      console.log(`Processing Voyage batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(optimizedChunks.length/batchSize)}: ${batch.length} chunks, ~${batchTokens} tokens, ~$${calculateVoyageCost(batchTokens).toFixed(4)}`)
      
      const response = await voyageClient.embed({
        input: batchTexts,
        model: 'voyage-3-lite',
        inputType: 'document'
      })

      if (!response.data || response.data.length !== batch.length) {
        throw new Error('Invalid response from Voyage AI - data length mismatch')
      }

      // Combinar chunks con sus embeddings
      for (let j = 0; j < batch.length; j++) {
        if (!response.data[j] || !response.data[j].embedding) {
          console.error(`Missing embedding for chunk ${j} in batch starting at ${i}`)
          continue
        }
        
        results.push({
          chunk: batch[j],
          embedding: response.data[j].embedding as number[]
        })
      }

      totalTokens += batchTokens
      
      // Small delay between batches to be respectful
      if (i + batchSize < optimizedChunks.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    } catch (error) {
      console.error(`Error generating embeddings for batch starting at ${i}:`, error)
      throw error
    }
  }

  const tokenUsage: TokenUsage = {
    totalTokens,
    estimatedCost: calculateVoyageCost(totalTokens),
    chunksProcessed: optimizedChunks.length,
    duplicatesSkipped
  }

  console.log(`Voyage AI usage summary: ${tokenUsage.chunksProcessed} chunks, ${tokenUsage.totalTokens} tokens, ~$${tokenUsage.estimatedCost.toFixed(4)} cost, ${tokenUsage.duplicatesSkipped} duplicates skipped`)

  return { results, tokenUsage }
}

// Buscar documentos similares usando similitud coseno
export function calculateCosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length')
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
} 