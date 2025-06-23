interface ChunkMetadata {
    page_number?: number;
    section?: string;
    chunk_position?: number;
    total_chunks?: number;
    has_table?: boolean;
    has_amounts?: boolean;
    keywords?: string[];
}
/**
 * Advanced Memory Service for Enterprise Payroll Processing
 */
export declare class MemoryService {
    private voyageApiKey;
    constructor();
    /**
     * Generate embeddings using Voyage AI
     */
    generateEmbeddings(texts: string[]): Promise<number[][]>;
    /**
     * Advanced text chunking with intelligent splitting
     */
    createSmartChunks(text: string, metadata?: ChunkMetadata): Promise<Array<{
        text: string;
        metadata: ChunkMetadata;
        hash: string;
    }>>;
    /**
     * Extract keywords from text for indexing
     */
    private extractKeywords;
    /**
     * Generate hash for deduplication
     */
    private generateHash;
    /**
     * Store document chunks with embeddings
     */
    storeDocumentChunks(documentId: string, companyId: string, chunks: Array<{
        text: string;
        metadata: ChunkMetadata;
        hash: string;
    }>, documentTypeId?: string): Promise<void>;
    /**
     * Learn patterns from processed document
     */
    learnFromDocument(companyId: string, employeeId: string, documentData: any, confidence?: number): Promise<void>;
    /**
     * Extract patterns from document data
     */
    private extractPatterns;
    /**
     * Create document summary
     */
    private createDocumentSummary;
    /**
     * Extract keywords from document
     */
    private extractDocumentKeywords;
    /**
     * Search similar documents using semantic search
     */
    searchSimilarDocuments(query: string, companyId: string, limit?: number, threshold?: number): Promise<any[]>;
    /**
     * Search similar memories
     */
    searchSimilarMemories(query: string, companyId: string, limit?: number): Promise<any[]>;
    /**
     * Hybrid search combining semantic and keyword search
     */
    hybridSearch(query: string, companyId: string, options?: {
        semanticWeight?: number;
        keywordWeight?: number;
        limit?: number;
        filters?: any;
    }): Promise<any[]>;
    /**
     * Calculate keyword relevance score
     */
    private calculateKeywordScore;
    /**
     * Log search for analytics
     */
    private logSearch;
    /**
     * Get memory analytics for a company
     */
    getMemoryAnalytics(companyId: string): Promise<any>;
    /**
     * Validate and improve memory quality
     */
    validateMemory(memoryId: string, isValid: boolean, feedback?: string): Promise<void>;
}
export declare const memoryService: MemoryService;
export {};
//# sourceMappingURL=memory-service.d.ts.map