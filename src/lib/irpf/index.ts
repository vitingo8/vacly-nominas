// Barrel del módulo IRPF (web service AEAT + estimador offline).
export * from './types';
export { buildInputXML } from './xml-builder';
export { parseOutputXML } from './xml-parser';
export { calcularIRPF } from './aeat-service';
export type { CalcularIRPFOptions } from './aeat-service';
export { estimateWorkerSocialSecurityAnnual, getSsMonthlyLimitsForGroup } from './ss-estimate-annual';
export { estimateIRPFRate } from './fallback-estimator';
export type { FallbackIRPFResult } from './fallback-estimator';
export {
  resolveAnnualIrpfRate,
  buildIrpfInputFromEmployee,
} from './resolve-rate';
export type {
  ResolveIrpfRateParams,
  ResolveIrpfRateResult,
  IrpfRateSource,
} from './resolve-rate';
export {
  getGroupLimitsForYear,
  getMaxBaseForYear,
  getSmiMonthlyForYear,
} from './ss-constants';
