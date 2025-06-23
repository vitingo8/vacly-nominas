import type { BasicNominaInfo } from '../types/nominas';
/**
 * Extrae información básica de una nómina para generar nombres de archivo
 * ACTUALIZADO: Usa Claude 3.5 Haiku con soporte PDF nativo
 */
export declare function extractBasicNominaInfo(pdfBuffer: Buffer): Promise<BasicNominaInfo>;
/**
 * DEPRECATED: Función antigua que usa texto OCR
 * Mantenida para compatibilidad hacia atrás
 */
export declare function extractBasicNominaInfoFromText(textContent: string): Promise<BasicNominaInfo>;
/**
 * Corrige el formato de nombres de "APELLIDOS, NOMBRE" a "NOMBRE APELLIDOS"
 */
export declare function correctNameFormat(name: string): string;
/**
 * Sanitiza un nombre para usarlo como nombre de archivo
 */
export declare function sanitizeFileName(name: string): string;
/**
 * Valida y formatea el período en formato YYYYMM
 */
export declare function validatePeriod(period: string): string;
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
//# sourceMappingURL=pdf-naming.d.ts.map