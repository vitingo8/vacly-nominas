import * as _supabase_supabase_js from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { V as VaclyConfig, A as ApiResponse, f as ProcessingResult, B as BasicNominaInfo, N as NominaData } from '../pdf-naming-C9T2A7O1.js';
export { P as ProcessingOptions, g as generateSplitFileName, b as generateTextFileName, s as sanitizeFileName } from '../pdf-naming-C9T2A7O1.js';

/**
 * Crea un cliente configurado para el procesamiento de nóminas
 */
declare function createVaclyClient(config: VaclyConfig): {
    supabase: _supabase_supabase_js.SupabaseClient<any, "public", any>;
    anthropic: Anthropic;
    config: VaclyConfig;
};
/**
 * Procesa un archivo PDF de nóminas y retorna documentos divididos
 */
declare function processNominaFile(file: Buffer | File, config: VaclyConfig): Promise<ApiResponse<ProcessingResult>>;
/**
 * Extrae información básica de una nómina
 */
declare function extractNominaInfo(content: string | Buffer, config: VaclyConfig): Promise<ApiResponse<BasicNominaInfo>>;
/**
 * Obtiene todas las nóminas de la base de datos
 */
declare function getNominas(config: VaclyConfig, options?: {
    limit?: number;
    offset?: number;
    companyId?: string;
    employeeId?: string;
}): Promise<ApiResponse<NominaData[]>>;
/**
 * Busca nóminas por filtros específicos
 */
declare function searchNominas(config: VaclyConfig, filters: {
    employeeName?: string;
    companyName?: string;
    period?: string;
    dni?: string;
}): Promise<ApiResponse<NominaData[]>>;
/**
 * Elimina una nómina por ID
 */
declare function deleteNomina(config: VaclyConfig, nominaId: string): Promise<ApiResponse<boolean>>;

export { ApiResponse, BasicNominaInfo, NominaData, ProcessingResult, VaclyConfig, createVaclyClient, deleteNomina, extractNominaInfo, getNominas, processNominaFile, searchNominas };
