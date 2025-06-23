export interface SimilarDocument {
    id: string;
    document_id: string;
    text_chunk: string;
    similarity_score: number;
    processed_data?: any;
    document_type: string;
    employee_id?: string;
    metadata: any;
}
export interface MemoryContext {
    similar_documents: SimilarDocument[];
    company_patterns: any[];
    employee_patterns: any[];
    learned_keywords: string[];
}
export declare function findSimilarDocuments(queryText: string, companyId: string, documentType: string, employeeId?: string, limit?: number, threshold?: number): Promise<SimilarDocument[]>;
export declare function getMemoryContext(companyId: string, documentType: string, employeeId?: string): Promise<MemoryContext>;
export declare function storeDocumentEmbeddings(documentId: string, companyId: string, documentTypeId: string, extractedText: string, employeeId?: string): Promise<boolean>;
export declare function updateMemory(companyId: string, documentTypeId: string, processedData: any, conversationId: string, employeeId?: string): Promise<void>;
export declare function buildClaudeContext(queryText: string, companyId: string, documentType: string, employeeId?: string): Promise<string>;
//# sourceMappingURL=memory-rag.d.ts.map