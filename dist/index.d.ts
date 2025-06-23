import { B as BasicNominaInfo } from './pdf-naming-BaHY2ysK.js';
export { A as ApiResponse, E as EmbeddingResult, M as MemoryContext, N as NominaData, P as ProcessingOptions, f as ProcessingResult, S as SplitDocument, V as VaclyConfig, d as correctNameFormat, e as extractBasicNominaInfo, a as extractBasicNominaInfoFromText, c as generateGlobalFileName, g as generateSplitFileName, b as generateTextFileName, s as sanitizeFileName, v as validatePeriod } from './pdf-naming-BaHY2ysK.js';
import { ClassValue } from 'clsx';

/**
 * Extrae información básica de una nómina para generar nombres de archivo
 */
declare function extractBasicNominaInfo(textContent: string): Promise<BasicNominaInfo>;

declare function parsePDF(pdfBuffer: Buffer | ArrayBuffer): Promise<string>;

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
declare class MemoryService {
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
declare const memoryService: MemoryService;

declare function storeDocumentEmbeddings(documentId: string, companyId: string, documentTypeId: string, extractedText: string, employeeId?: string): Promise<boolean>;
declare function updateMemory(companyId: string, documentTypeId: string, processedData: any, conversationId: string, employeeId?: string): Promise<void>;

interface TextChunk {
    text: string;
    index: number;
    metadata?: Record<string, any>;
}
interface TokenUsage {
    totalTokens: number;
    estimatedCost: number;
    chunksProcessed: number;
    duplicatesSkipped: number;
}
declare function generateEmbedding(text: string): Promise<{
    embedding: number[];
    tokenUsage: TokenUsage;
}>;
declare function generateEmbeddings(chunks: TextChunk[]): Promise<{
    results: Array<{
        chunk: TextChunk;
        embedding: number[];
    }>;
    tokenUsage: TokenUsage;
}>;

declare function cn(...inputs: ClassValue[]): string;

declare const VACLY_VERSION = "1.0.0";
declare const SUPPORTED_FORMATS: readonly ["pdf"];
declare const MAX_FILE_SIZE: number;
declare const DEFAULT_PAGE_LIMIT = 50;
declare function createNominaProcessor(config: {
    supabaseUrl: string;
    supabaseServiceKey: string;
    anthropicApiKey: string;
    voyageApiKey?: string;
}): {
    extractBasicInfo: (content: string | Buffer) => Promise<BasicNominaInfo>;
    generateFileName: (employeeName: string, period: string, pageNumber: number) => string;
    processDocument: (file: File | Buffer) => Promise<never>;
};

export { BasicNominaInfo, DEFAULT_PAGE_LIMIT, MAX_FILE_SIZE, MemoryService, SUPPORTED_FORMATS, VACLY_VERSION, cn, createNominaProcessor, extractBasicNominaInfo as extractBasicNominaInfoImproved, generateEmbedding, generateEmbeddings, memoryService, parsePDF, storeDocumentEmbeddings, updateMemory };
