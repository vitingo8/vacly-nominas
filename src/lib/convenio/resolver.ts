// ============================================================================
// resolver.ts — pass-through sobre la copia local de payroll-core
// ============================================================================

export {
  type AgreementLookup,
  type SeniorityRule,
  type ExtraPay,
  type Plus,
  type LicenciaRetribuida,
  type AgreementContext,
  type ResolveAgreementInput,
  AgreementNotAssignedError,
  AgreementOutOfForceError,
} from '../payroll-core';

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
} from '../payroll-core/resolver';
