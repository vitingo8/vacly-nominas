// ============================================================================
// resolver.ts — ahora es un pass-through sobre @vacly/payroll-core
// ============================================================================
// Todo el cálculo + resolución vive en packages/payroll-core. Mantenemos esta
// fachada para no romper los imports existentes en src/**.
// ============================================================================

export {
  // Types
  type AgreementLookup,
  type SeniorityRule,
  type ExtraPay,
  type Plus,
  type LicenciaRetribuida,
  type AgreementContext,
  type ResolveAgreementInput,
  AgreementNotAssignedError,
  AgreementOutOfForceError,
} from '@vacly/payroll-core';

export {
  fetchAgreementForCompany,
  fetchSalaryBase,
  fetchSeniorityRule,
  fetchExtraPays,
  fetchPluses,
  fetchLicencias,
  resolveAgreementContext,
  computeSeniorityAmount,
  extractPaymentMonth,
  getExtraPaysForMonth,
  computeProratedBonuses,
} from '@vacly/payroll-core/resolver';
