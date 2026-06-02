// ============================================================================
// index.ts — Barrel file de los generadores de documentos de nóminas
// Re-exporta todos los generadores y sus tipos asociados
// ============================================================================

// ---------------------------------------------------------------------------
// Generador de PDF (Recibo de Salarios)
// ---------------------------------------------------------------------------
export { generatePayslipPDF } from './generadorPDF';
export type {
  PayslipPDFData,
  PayslipCompanyInfo,
  PayslipEmployeeInfo,
  PayslipAccrualLine,
  PayslipDeductionLine,
  PayslipContributionLine,
} from './generadorPDF';

// ---------------------------------------------------------------------------
// Generador de SEPA XML (Transferencias bancarias)
// ---------------------------------------------------------------------------
export { generateSEPAFile } from './generadorSEPA';
export type {
  SEPATransfer,
  SEPACompanyData,
} from './generadorSEPA';

// ---------------------------------------------------------------------------
// Generador de fichero RED (Seguridad Social)
// ---------------------------------------------------------------------------
export { generateREDFile } from './generadorRED';
export type {
  REDFileData,
  REDCompanyInfo,
  REDEmployeeRecord,
} from './generadorRED';

// ---------------------------------------------------------------------------
// Modelo 111 — Retenciones IRPF (trabajo) trimestral/mensual
// ---------------------------------------------------------------------------
export { generateModelo111 } from './generador111';
export type {
  Modelo111Input,
  Modelo111Result,
  Modelo111Perceptor,
} from './generador111';

// ---------------------------------------------------------------------------
// Modelo 190 — Resumen anual de retenciones IRPF
// ---------------------------------------------------------------------------
export { generateModelo190 } from './generador190';
export type {
  Modelo190Input,
  Modelo190Result,
  Modelo190Perceptor,
} from './generador190';
