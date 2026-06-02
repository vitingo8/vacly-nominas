// ============================================================================
// vacaciones.ts — Devengo y liquidación de vacaciones
// ----------------------------------------------------------------------------
// Las vacaciones disfrutadas se retribuyen como salario normal (no descuentan).
// Las vacaciones devengadas y NO disfrutadas se abonan en el finiquito.
// Art. 38 ET: mínimo 30 días naturales/año.
// ============================================================================

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calcula los días de vacaciones devengados proporcionalmente al tiempo
 * trabajado en el año.
 *
 * @param annualVacationDays Días de vacaciones/año (convenio o contrato; min 30 naturales).
 * @param daysWorkedInYear Días naturales trabajados en el año (hasta la fecha).
 * @param yearDays Días naturales del año (365/366).
 */
export function computeAccruedVacationDays(
  annualVacationDays: number,
  daysWorkedInYear: number,
  yearDays = 365,
): number {
  if (annualVacationDays <= 0 || daysWorkedInYear <= 0) return 0;
  const accrued = (annualVacationDays * daysWorkedInYear) / yearDays;
  return Math.round(accrued * 100) / 100;
}

/**
 * Calcula el importe de las vacaciones devengadas no disfrutadas (para finiquito).
 *
 * @param pendingDays Días de vacaciones pendientes de disfrute.
 * @param dailySalary Salario diario (incluye prorrata de pagas extra).
 */
export function computeVacationSettlementAmount(
  pendingDays: number,
  dailySalary: number,
): number {
  if (pendingDays <= 0 || dailySalary <= 0) return 0;
  return round2(pendingDays * dailySalary);
}

/**
 * Salario diario para liquidación de vacaciones, con prorrata de pagas extra.
 *
 * @param monthlySalary Salario base + complementos mensuales.
 * @param numberOfBonuses Nº de pagas extra al año.
 */
export function dailySalaryForVacation(monthlySalary: number, numberOfBonuses: number): number {
  const annual = monthlySalary * (12 + Math.max(0, numberOfBonuses));
  return round2(annual / 365);
}
