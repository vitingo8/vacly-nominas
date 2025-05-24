import { VoyageAIClient } from 'voyageai'

const voyageClient = process.env.VOYAGE_API_KEY ? new VoyageAIClient({
  apiKey: process.env.VOYAGE_API_KEY,
}) : null

export interface TextChunk {
  text: string
  index: number
  metadata?: Record<string, any>
}

// Dividir texto en chunks para embeddings
export function chunkText(text: string, maxChunkSize: number = 1000): TextChunk[] {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
  const chunks: TextChunk[] = []
  let currentChunk = ''
  let chunkIndex = 0

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim()
    if (currentChunk.length + trimmedSentence.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        index: chunkIndex,
        metadata: { sentence_count: currentChunk.split(/[.!?]+/).length }
      })
      currentChunk = trimmedSentence
      chunkIndex++
    } else {
      currentChunk += (currentChunk.length > 0 ? '. ' : '') + trimmedSentence
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      index: chunkIndex,
      metadata: { sentence_count: currentChunk.split(/[.!?]+/).length }
    })
  }

  return chunks
}

// Generar embedding para un texto usando Voyage 3 Lite
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!voyageClient) {
    throw new Error('Voyage AI client not initialized. Please set VOYAGE_API_KEY environment variable.')
  }

  try {
    const response = await voyageClient.embed({
      input: [text],
      model: 'voyage-3-lite', // Optimizado para Claude, más económico
      inputType: 'document' // Para indexar documentos
    })

    if (!response.data || !response.data[0] || !response.data[0].embedding) {
      throw new Error('Invalid response from Voyage AI')
    }

    return response.data[0].embedding as number[]
  } catch (error) {
    console.error('Error generating Voyage embedding:', error)
    throw new Error('Failed to generate Voyage embedding')
  }
}

// Generar embedding para consultas (diferente tipo de input)
export async function generateQueryEmbedding(text: string): Promise<number[]> {
  if (!voyageClient) {
    throw new Error('Voyage AI client not initialized. Please set VOYAGE_API_KEY environment variable.')
  }

  try {
    const response = await voyageClient.embed({
      input: [text],
      model: 'voyage-3-lite',
      inputType: 'query' // Para búsquedas semánticas
    })

    if (!response.data || !response.data[0] || !response.data[0].embedding) {
      throw new Error('Invalid response from Voyage AI')
    }

    return response.data[0].embedding as number[]
  } catch (error) {
    console.error('Error generating Voyage query embedding:', error)
    throw new Error('Failed to generate Voyage query embedding')
  }
}

// Generar embeddings para múltiples chunks
export async function generateEmbeddings(chunks: TextChunk[]): Promise<Array<{ chunk: TextChunk; embedding: number[] }>> {
  if (!voyageClient) {
    throw new Error('Voyage AI client not initialized. Please set VOYAGE_API_KEY environment variable.')
  }

  const results = []
  
  // Procesar en lotes para eficiencia
  const batchSize = 128 // Voyage AI soporta hasta 128 inputs por request
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    
    try {
      const response = await voyageClient.embed({
        input: batch.map(chunk => chunk.text),
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
    } catch (error) {
      console.error(`Error generating embeddings for batch starting at ${i}:`, error)
      // Continuar con el siguiente lote si uno falla
    }
  }

  return results
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