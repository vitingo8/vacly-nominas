// ============================================================================
// index.ts — Barrel file del motor de cálculo de nóminas españolas
// Re-exporta todos los módulos para uso externo
// ============================================================================

// ---------------------------------------------------------------------------
// Tipos e interfaces
// ---------------------------------------------------------------------------
export type {
  GrupoCotizacion,
  EmployeePayrollInput,
  TemporaryDisabilityInput,
  MonthlyVariablesInput,
  CotizationGroupLimits,
  WorkerCotizationRates,
  CompanyCotizationRates,
  PayrollConfigInput,
  PayslipAccruals,
  PayslipBases,
  WorkerDeductions,
  CompanyDeductions,
  ITDetail,
  PayslipResult,
  BasesCalculationResult,
  WorkerCotizationResult,
  CompanyCotizationResult,
  OvertimeCalculationResult,
  ITCalculationResult,
  ValidationError,
  ValidationResult,
} from './tipos';

export {
  TipoContrato,
  TipoJornada,
  TipoContingenciaIT,
} from './tipos';

// ---------------------------------------------------------------------------
// Motor principal
// ---------------------------------------------------------------------------
export {
  calculatePayslip,
  calculateQuickPayslip,
  formatPayslipSummary,
  DEFAULT_CONFIG_2025,
} from './calculadora';

// ---------------------------------------------------------------------------
// Bases de cotización
// ---------------------------------------------------------------------------
export {
  calculateBases,
  calculateMonthlySalaryAccruals,
  calculateProratedBonuses,
  getGroupLimits,
  clampBase,
  round2,
} from './bases';

// ---------------------------------------------------------------------------
// Cotizaciones Seguridad Social
// ---------------------------------------------------------------------------
export {
  calculateWorkerCotizations,
  calculateCompanyCotizations,
  isIndefiniteContract,
} from './cotizaciones';

// ---------------------------------------------------------------------------
// IRPF
// ---------------------------------------------------------------------------
export {
  calculateIRPF,
  calculateIRPFBase,
  validateIRPFPercentage,
  IRPF_MINIMUM_RATES,
} from './irpf';

// ---------------------------------------------------------------------------
// Horas extras
// ---------------------------------------------------------------------------
export {
  calculateOvertime,
  getUpdatedAccumulatedOvertime,
  getRemainingOvertimeHours,
} from './horas-extra';

// ---------------------------------------------------------------------------
// Incapacidad Temporal
// ---------------------------------------------------------------------------
export {
  calculateIT,
  calculateDailySalary,
} from './incapacidad-temporal';

// ---------------------------------------------------------------------------
// Validadores
// ---------------------------------------------------------------------------
export {
  validateAll,
  validateEmployee,
  validateMonthlyVariables,
  validateTemporaryDisability,
  validateConfig,
  validateCrossFields,
  createValidationError,
  createValidationSuccess,
} from './validadores';
