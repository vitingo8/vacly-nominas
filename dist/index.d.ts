import { B as BasicNominaInfo } from './pdf-naming-D4vpOmx8.js';
export { N as NominaData, P as ProcessingOptions, f as ProcessingResult, S as SplitDocument, d as correctNameFormat, e as extractBasicNominaInfo, a as extractBasicNominaInfoFromText, c as generateGlobalFileName, g as generateSplitFileName, b as generateTextFileName, s as sanitizeFileName, v as validatePeriod } from './pdf-naming-D4vpOmx8.js';
import { ClassValue } from 'clsx';

/**
 * Extrae información básica de una nómina para generar nombres de archivo
 */
declare function extractBasicNominaInfo(textContent: string): Promise<BasicNominaInfo>;

declare function cn(...inputs: ClassValue[]): string;

declare const VACLY_VERSION = "1.0.0";
declare const SUPPORTED_FORMATS: readonly ["pdf"];
declare const MAX_FILE_SIZE: number;
declare const DEFAULT_PAGE_LIMIT = 50;
declare function createNominaProcessor(config: {
    supabaseUrl: string;
    supabaseServiceKey: string;
    anthropicApiKey: string;
}): {
    extractBasicInfo: (content: string | Buffer) => Promise<BasicNominaInfo>;
    generateFileName: (employeeName: string, period: string, pageNumber: number) => string;
    processDocument: (file: File | Buffer) => Promise<never>;
};

export { BasicNominaInfo, DEFAULT_PAGE_LIMIT, MAX_FILE_SIZE, SUPPORTED_FORMATS, VACLY_VERSION, cn, createNominaProcessor, extractBasicNominaInfo as extractBasicNominaInfoImproved };
