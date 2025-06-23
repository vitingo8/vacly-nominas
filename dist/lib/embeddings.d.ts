export interface TextChunk {
    text: string;
    index: number;
    metadata?: Record<string, any>;
}
export interface TokenUsage {
    totalTokens: number;
    estimatedCost: number;
    chunksProcessed: number;
    duplicatesSkipped: number;
}
export declare function estimateTokens(text: string): number;
export declare function calculateVoyageCost(tokens: number): number;
export declare function chunkText(text: string, maxChunkSize?: number, overlap?: number): TextChunk[];
export declare function deduplicateChunks(chunks: TextChunk[], similarityThreshold?: number): TextChunk[];
export declare function generateEmbedding(text: string): Promise<{
    embedding: number[];
    tokenUsage: TokenUsage;
}>;
export declare function generateQueryEmbedding(text: string): Promise<{
    embedding: number[];
    tokenUsage: TokenUsage;
}>;
export declare function generateEmbeddings(chunks: TextChunk[]): Promise<{
    results: Array<{
        chunk: TextChunk;
        embedding: number[];
    }>;
    tokenUsage: TokenUsage;
}>;
export declare function calculateCosineSimilarity(a: number[], b: number[]): number;
//# sourceMappingURL=embeddings.d.ts.map