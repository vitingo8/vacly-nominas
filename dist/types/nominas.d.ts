export interface BasicNominaInfo {
    companyName: string;
    employeeName: string;
    period: string;
}
export interface ProcessingOptions {
    file: File | Buffer;
    supabaseConfig: {
        url: string;
        serviceKey: string;
    };
    anthropicApiKey: string;
    voyageApiKey?: string;
    options?: {
        maxPages?: number;
        enableMemory?: boolean;
        enableEmbeddings?: boolean;
    };
}
export interface Employee {
    name?: string;
    dni?: string;
    nss?: string;
    category?: string;
    code?: string;
    social_security_number?: string;
    social_security?: string;
}
export interface Company {
    name?: string;
    cif?: string;
    address?: string;
    center_code?: string;
}
export interface PerceptionDeduction {
    code?: string;
    concept?: string;
    amount?: number;
}
export interface Contribution {
    concept?: string;
    base?: number;
    rate?: number;
    employer_contribution?: number;
    amount?: number;
}
export interface BankInfo {
    iban?: string;
    swift_bic?: string;
}
export interface NominaData {
    id?: string;
    nominaId?: string;
    period_start?: string;
    period_end?: string;
    employee?: Employee;
    company?: Company;
    perceptions?: PerceptionDeduction[];
    deductions?: PerceptionDeduction[];
    contributions?: Contribution[];
    base_ss?: number;
    net_pay?: number;
    gross_salary?: number;
    total_contributions?: number;
    iban?: string;
    swift_bic?: string;
    cost_empresa?: number;
    employer_cost?: number;
    signed?: boolean;
    bank?: BankInfo;
    document_name?: string;
}
export interface SplitDocument {
    id: string;
    filename: string;
    pageNumber: number;
    textContent: string;
    pdfUrl: string;
    textUrl: string;
    pdfPath?: string;
    textPath?: string;
    claudeProcessed?: boolean;
    nominaData?: NominaData;
}
export interface MemoryContext {
    companyId: string;
    documentTypeId: string;
    conversationId: string;
    employeeId?: string;
}
export interface EmbeddingResult {
    embedding: number[];
    text: string;
    metadata?: Record<string, any>;
}
export interface ProcessingResult {
    success: boolean;
    documents: SplitDocument[];
    errors?: Array<{
        pageNumber?: number;
        error: string;
        details?: string;
    }>;
    totalPages: number;
    processedPages: number;
    globalInfo?: {
        companyName: string;
        period: string;
        totalPages: number;
    };
}
export interface MemoryPattern {
    id: string;
    pattern: string;
    confidence: number;
    usage_count: number;
    company_id: string;
    document_type_id: string;
    employee_id?: string;
    metadata?: Record<string, any>;
}
export interface VaclyConfig {
    supabaseUrl: string;
    supabaseServiceKey: string;
    anthropicApiKey: string;
    voyageApiKey?: string;
    options?: {
        enableMemory?: boolean;
        enableEmbeddings?: boolean;
        maxFileSize?: number;
        maxPages?: number;
    };
}
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    details?: string;
    message?: string;
}
export interface ProgressInfo {
    progress: number;
    message: string;
    currentPage?: number;
    totalPages?: number;
    stage?: 'uploading' | 'splitting' | 'processing' | 'saving' | 'complete';
}
export interface UnifiedProcessingOptions extends ProcessingOptions {
    onProgress?: (info: ProgressInfo) => void;
    onError?: (error: string) => void;
    onComplete?: (result: ProcessingResult) => void;
}
export interface ProcessorInstance {
    processDocument: (file: File | Buffer, options?: Partial<ProcessingOptions>) => Promise<ProcessingResult>;
    extractBasicInfo: (content: string | Buffer) => Promise<BasicNominaInfo>;
    generateFileName: (employeeName: string, period: string, pageNumber: number) => string;
    searchMemory: (query: string, context: MemoryContext) => Promise<MemoryPattern[]>;
    storeEmbeddings: (text: string, metadata: Record<string, any>) => Promise<void>;
}
//# sourceMappingURL=nominas.d.ts.map