// ============================================================================
// VACLY NOMINAS PROCESSOR - API FUNCTIONS
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import type { 
  ProcessingOptions, 
  ProcessingResult, 
  BasicNominaInfo,
  VaclyConfig,
  ApiResponse,
  NominaData
} from '../types/nominas';

/**
 * Crea un cliente configurado para el procesamiento de nóminas
 */
export function createVaclyClient(config: VaclyConfig) {
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
  const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
  
  return {
    supabase,
    anthropic,
    config
  };
}

/**
 * Procesa un archivo PDF de nóminas y retorna documentos divididos
 */
export async function processNominaFile(
  file: Buffer | File,
  config: VaclyConfig
): Promise<ApiResponse<ProcessingResult>> {
  try {
    // Aquí iría la lógica de procesamiento usando las funciones internas
    // Por ahora retornamos una respuesta de éxito básica
    
    return {
      success: true,
      data: {
        success: true,
        documents: [],
        totalPages: 0,
        processedPages: 0
      },
      message: 'Archivo procesado exitosamente'
    };
  } catch (error) {
    return {
      success: false,
      error: 'Error procesando archivo',
      details: error instanceof Error ? error.message : 'Error desconocido'
    };
  }
}

/**
 * Extrae información básica de una nómina
 */
export async function extractNominaInfo(
  content: string | Buffer,
  config: VaclyConfig
): Promise<ApiResponse<BasicNominaInfo>> {
  try {
    // Aquí iría la lógica de extracción usando las funciones internas
    
    return {
      success: true,
      data: {
        companyName: 'Empresa Ejemplo',
        employeeName: 'Empleado Ejemplo',
        period: '202401'
      },
      message: 'Información extraída exitosamente'
    };
  } catch (error) {
    return {
      success: false,
      error: 'Error extrayendo información',
      details: error instanceof Error ? error.message : 'Error desconocido'
    };
  }
}

/**
 * Obtiene todas las nóminas de la base de datos
 */
export async function getNominas(
  config: VaclyConfig,
  options?: {
    limit?: number;
    offset?: number;
    companyId?: string;
    employeeId?: string;
  }
): Promise<ApiResponse<NominaData[]>> {
  try {
    const client = createVaclyClient(config);
    
    let query = client.supabase
      .from('nominas')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (options?.companyId) {
      query = query.eq('company_id', options.companyId);
    }
    
    if (options?.employeeId) {
      query = query.eq('employee_id', options.employeeId);
    }
    
    if (options?.limit && options?.offset) {
      query = query.range(options.offset, options.offset + options.limit - 1);
    }
    
    const { data, error } = await query;
    
    if (error) {
      throw error;
    }
    
    return {
      success: true,
      data: data || [],
      message: 'Nóminas obtenidas exitosamente'
    };
  } catch (error) {
    return {
      success: false,
      error: 'Error obteniendo nóminas',
      details: error instanceof Error ? error.message : 'Error desconocido'
    };
  }
}

/**
 * Busca nóminas por filtros específicos
 */
export async function searchNominas(
  config: VaclyConfig,
  filters: {
    employeeName?: string;
    companyName?: string;
    period?: string;
    dni?: string;
  }
): Promise<ApiResponse<NominaData[]>> {
  try {
    const client = createVaclyClient(config);
    
    let query = client.supabase
      .from('nominas')
      .select('*');
    
    if (filters.employeeName) {
      query = query.ilike('employee->>name', `%${filters.employeeName}%`);
    }
    
    if (filters.companyName) {
      query = query.ilike('company->>name', `%${filters.companyName}%`);
    }
    
    if (filters.period) {
      query = query.gte('period_start', `${filters.period}-01`)
                   .lt('period_start', `${filters.period}-32`);
    }
    
    if (filters.dni) {
      query = query.eq('dni', filters.dni);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) {
      throw error;
    }
    
    return {
      success: true,
      data: data || [],
      message: 'Búsqueda completada exitosamente'
    };
  } catch (error) {
    return {
      success: false,
      error: 'Error en la búsqueda',
      details: error instanceof Error ? error.message : 'Error desconocido'
    };
  }
}

/**
 * Elimina una nómina por ID
 */
export async function deleteNomina(
  config: VaclyConfig,
  nominaId: string
): Promise<ApiResponse<boolean>> {
  try {
    const client = createVaclyClient(config);
    
    const { error } = await client.supabase
      .from('nominas')
      .delete()
      .eq('id', nominaId);
    
    if (error) {
      throw error;
    }
    
    return {
      success: true,
      data: true,
      message: 'Nómina eliminada exitosamente'
    };
  } catch (error) {
    return {
      success: false,
      error: 'Error eliminando nómina',
      details: error instanceof Error ? error.message : 'Error desconocido'
    };
  }
}

// Exportar funciones de utilidad adicionales
export { 
  generateSplitFileName,
  generateTextFileName,
  sanitizeFileName 
} from '../lib/pdf-naming';

export type {
  VaclyConfig,
  ProcessingOptions,
  ProcessingResult,
  BasicNominaInfo,
  NominaData,
  ApiResponse
} from '../types/nominas'; 