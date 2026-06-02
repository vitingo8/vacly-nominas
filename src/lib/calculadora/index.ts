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
  TipoErte,
} from './tipos';

export type {
  InKindInput,
  GarnishmentInput,
  ErteInput,
  SolidarityConfig,
  SolidarityBracket,
  GarnishmentDetail,
  SolidarityDetail,
  ErteDetail,
} from './tipos';

// ---------------------------------------------------------------------------
// Motor principal
// ---------------------------------------------------------------------------
export {
  calculatePayslip,
  calculateQuickPayslip,
  formatPayslipSummary,
  DEFAULT_CONFIG_2025,
  DEFAULT_CONFIG_2026,
  getDefaultPayrollConfig,
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
  roundUp2,
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
// Cotización adicional de solidaridad
// ---------------------------------------------------------------------------
export {
  calculateSolidarity,
  getDefaultSolidarityConfig,
} from './solidaridad';

// ---------------------------------------------------------------------------
// Salario en especie
// ---------------------------------------------------------------------------
export { calculateInKind } from './especie';
export type { InKindResult } from './especie';

// ---------------------------------------------------------------------------
// Embargos
// ---------------------------------------------------------------------------
export { calculateGarnishment } from './embargos';

// ---------------------------------------------------------------------------
// ERTE
// ---------------------------------------------------------------------------
export { calculateErte } from './erte';
export type { ErteComputation } from './erte';

// ---------------------------------------------------------------------------
// Vacaciones
// ---------------------------------------------------------------------------
export {
  computeAccruedVacationDays,
  computeVacationSettlementAmount,
  dailySalaryForVacation,
} from './vacaciones';

// ---------------------------------------------------------------------------
// Finiquito / indemnizaciones
// ---------------------------------------------------------------------------
export {
  calculateSettlement,
  CausaCese,
} from './finiquito';
export type { SettlementInput, SettlementResult } from './finiquito';

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
