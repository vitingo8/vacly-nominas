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
