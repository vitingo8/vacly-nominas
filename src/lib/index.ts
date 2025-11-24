// ============================================================================
// VACLY NOMINAS LUX - Librería Principal
// ============================================================================

// Importar las funciones para usar internamente
import {
  extractBasicNominaInfo as _extractBasicNominaInfo,
  extractBasicNominaInfoFromText as _extractBasicNominaInfoFromText,
  generateSplitFileName as _generateSplitFileName
} from './pdf-naming';

// Exportar funciones de procesamiento de PDFs
export {
  extractBasicNominaInfo,
  extractBasicNominaInfoFromText,
  generateSplitFileName,
  generateTextFileName,
  generateGlobalFileName,
  correctNameFormat,
  sanitizeFileName,
  validatePeriod
} from './pdf-naming';

export {
  extractBasicNominaInfo as extractBasicNominaInfoImproved
} from './pdf-naming-improved';

// Note: parsePDF is deprecated - Claude handles PDFs natively via its document API

// Exportar utilidades generales
export {
  cn
} from './utils';

// Exportar tipos principales
export type {
  BasicNominaInfo,
  ProcessingOptions,
  NominaData,
  SplitDocument,
  ProcessingResult
} from '../types/nominas';

// Exportar constantes y configuraciones
export const VACLY_VERSION = '1.0.0';
export const SUPPORTED_FORMATS = ['pdf'] as const;
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const DEFAULT_PAGE_LIMIT = 50;

// Función de configuración simplificada para procesamiento LUX
export function createNominaProcessor(config: {
  supabaseUrl: string;
  supabaseServiceKey: string;
  anthropicApiKey: string;
}) {
  return {
    extractBasicInfo: (content: string | Buffer) =>
      typeof content === 'string'
        ? _extractBasicNominaInfoFromText(content)
        : _extractBasicNominaInfo(content),

    generateFileName: (employeeName: string, period: string, pageNumber: number) =>
      _generateSplitFileName(employeeName, period, pageNumber),

    // Placeholder para processDocument - se implementará cuando sea necesario
    processDocument: async (file: File | Buffer) => {
      throw new Error('processDocument no implementado aún en la librería');
    }
  };
} 