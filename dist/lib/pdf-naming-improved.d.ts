import type { BasicNominaInfo } from '../types/nominas';
/**
 * Extrae información básica de una nómina para generar nombres de archivo
 */
export declare function extractBasicNominaInfo(textContent: string): Promise<BasicNominaInfo>;
/**
 * Genera el nombre del archivo global
 */
export declare function generateGlobalFileName(companyName: string, period: string): string;
/**
 * Genera el nombre del archivo split
 */
export declare function generateSplitFileName(employeeName: string, period: string, pageNumber: number): string;
/**
 * Genera el nombre del archivo de texto
 */
export declare function generateTextFileName(employeeName: string, period: string, pageNumber: number): string;
//# sourceMappingURL=pdf-naming-improved.d.ts.map