import Anthropic from '@anthropic-ai/sdk';
import type { ProcessingResult, BasicNominaInfo, VaclyConfig, ApiResponse, NominaData } from '../../src/types/nominas';
/**
 * Crea un cliente configurado para el procesamiento de nóminas
 */
export declare function createVaclyClient(config: VaclyConfig): {
    supabase: import("@supabase/supabase-js").SupabaseClient<any, "public", any>;
    anthropic: Anthropic;
    config: VaclyConfig;
};
/**
 * Procesa un archivo PDF de nóminas y retorna documentos divididos
 */
export declare function processNominaFile(file: Buffer | File, config: VaclyConfig): Promise<ApiResponse<ProcessingResult>>;
/**
 * Extrae información básica de una nómina
 */
export declare function extractNominaInfo(content: string | Buffer, config: VaclyConfig): Promise<ApiResponse<BasicNominaInfo>>;
/**
 * Obtiene todas las nóminas de la base de datos
 */
export declare function getNominas(config: VaclyConfig, options?: {
    limit?: number;
    offset?: number;
    companyId?: string;
    employeeId?: string;
}): Promise<ApiResponse<NominaData[]>>;
/**
 * Busca nóminas por filtros específicos
 */
export declare function searchNominas(config: VaclyConfig, filters: {
    employeeName?: string;
    companyName?: string;
    period?: string;
    dni?: string;
}): Promise<ApiResponse<NominaData[]>>;
/**
 * Elimina una nómina por ID
 */
export declare function deleteNomina(config: VaclyConfig, nominaId: string): Promise<ApiResponse<boolean>>;
export { generateSplitFileName, generateTextFileName, sanitizeFileName } from '../../src/lib/pdf-naming';
export type { VaclyConfig, ProcessingOptions, ProcessingResult, BasicNominaInfo, NominaData, ApiResponse } from '../../src/types/nominas';
//# sourceMappingURL=index.d.ts.map