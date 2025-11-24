interface BasicNominaInfo {
    companyName: string;
    employeeName: string;
    period: string;
}
interface ProcessingOptions {
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
interface Employee {
    name?: string;
    dni?: string;
    nss?: string;
    category?: string;
    code?: string;
    social_security_number?: string;
    social_security?: string;
}
interface Company {
    name?: string;
    cif?: string;
    address?: string;
    center_code?: string;
}
interface PerceptionDeduction {
    code?: string;
    concept?: string;
    amount?: number;
}
interface Contribution {
    concept?: string;
    base?: number;
    rate?: number;
    employer_contribution?: number;
    amount?: number;
}
interface BankInfo {
    iban?: string;
    swift_bic?: string;
}
interface NominaData {
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
interface SplitDocument {
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
interface MemoryContext {
    companyId: string;
    documentTypeId: string;
    conversationId: string;
    employeeId?: string;
}
interface EmbeddingResult {
    embedding: number[];
    text: string;
    metadata?: Record<string, any>;
}
interface ProcessingResult {
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
interface VaclyConfig {
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
interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    details?: string;
    message?: string;
}

/**
 * Extrae información básica de una nómina para generar nombres de archivo
 * ACTUALIZADO: Usa Claude 4.5 Haiku con soporte PDF nativo
 */
declare function extractBasicNominaInfo(pdfBuffer: Buffer): Promise<BasicNominaInfo>;
/**
 * DEPRECATED: Función antigua que usa texto OCR
 * Mantenida para compatibilidad hacia atrás
 */
declare function extractBasicNominaInfoFromText(textContent: string): Promise<BasicNominaInfo>;
/**
 * Corrige el formato de nombres de "APELLIDOS, NOMBRE" a "NOMBRE APELLIDOS"
 */
declare function correctNameFormat(name: string): string;
/**
 * Sanitiza un nombre para usarlo como nombre de archivo
 */
declare function sanitizeFileName(name: string): string;
/**
 * Valida y formatea el período en formato YYYYMM
 */
declare function validatePeriod(period: string): string;
/**
 * Genera el nombre del archivo global
 */
declare function generateGlobalFileName(companyName: string, period: string): string;
/**
 * Genera el nombre del archivo split
 */
declare function generateSplitFileName(employeeName: string, period: string, pageNumber: number): string;
/**
 * Genera el nombre del archivo de texto
 */
declare function generateTextFileName(employeeName: string, period: string, pageNumber: number): string;

export { extractBasicNominaInfoFromText as a, generateTextFileName as b, generateGlobalFileName as c, correctNameFormat as d, extractBasicNominaInfo as e, generateSplitFileName as g, sanitizeFileName as s, validatePeriod as v };
export type { ApiResponse as A, BasicNominaInfo as B, EmbeddingResult as E, MemoryContext as M, NominaData as N, ProcessingOptions as P, SplitDocument as S, VaclyConfig as V, ProcessingResult as f };
