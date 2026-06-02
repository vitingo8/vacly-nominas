// ============================================================================
// finiquito.ts — Liquidación de fin de contrato (finiquito) e indemnizaciones
// ----------------------------------------------------------------------------
// Incluye:
//   - Salario de los días trabajados del mes de cese.
//   - Parte proporcional de pagas extras no prorrateadas.
//   - Vacaciones devengadas y no disfrutadas.
//   - Indemnización según la causa de extinción.
// Indemnizaciones (Estatuto de los Trabajadores):
//   - Despido improcedente: 33 días/año (45 días para tramos anteriores a
//     12/02/2012), tope 24 mensualidades.
//   - Despido objetivo / colectivo: 20 días/año, tope 12 mensualidades.
//   - Fin de contrato temporal: 12 días/año.
//   - Baja voluntaria / despido procedente: sin indemnización.
// ============================================================================

import { computeVacationSettlementAmount, dailySalaryForVacation } from './vacaciones';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export enum CausaCese {
  DESPIDO_IMPROCEDENTE = 'DESPIDO_IMPROCEDENTE',
  DESPIDO_OBJETIVO = 'DESPIDO_OBJETIVO',
  FIN_TEMPORAL = 'FIN_TEMPORAL',
  BAJA_VOLUNTARIA = 'BAJA_VOLUNTARIA',
  DESPIDO_PROCEDENTE = 'DESPIDO_PROCEDENTE',
  JUBILACION = 'JUBILACION',
  FIN_PERIODO_PRUEBA = 'FIN_PERIODO_PRUEBA',
}

export interface SettlementInput {
  causa: CausaCese;
  /** Salario mensual (base + complementos fijos). */
  monthlySalary: number;
  /** Nº de pagas extra al año. */
  numberOfBonuses: number;
  /** Antigüedad en años (puede ser decimal). */
  yearsOfService: number;
  /** Fecha de inicio del periodo de cese (día 1 del mes de baja). */
  daysWorkedThisMonth: number;
  /** Días naturales del mes de cese. */
  calendarDaysInMonth: number;
  /** Días de vacaciones devengadas y no disfrutadas. */
  pendingVacationDays: number;
  /**
   * Meses transcurridos desde el último abono de cada paga extra (para la
   * parte proporcional). Si las pagas están prorrateadas, usar 0.
   */
  bonusAccrualMonths?: number;
  /** Salario diario regulador para la indemnización (si difiere del salario/30). */
  dailySalaryForSeverance?: number;
}

export interface SettlementResult {
  /** Salario de los días trabajados del mes de cese. */
  salaryDaysWorked: number;
  /** Parte proporcional de pagas extra. */
  proratedBonuses: number;
  /** Vacaciones no disfrutadas. */
  vacationSettlement: number;
  /** Indemnización por cese (exenta de IRPF hasta los topes legales). */
  severance: number;
  /** Días de indemnización por año aplicados. */
  severanceDaysPerYear: number;
  /** Total finiquito (salario + pagas + vacaciones, sujeto a tributación). */
  taxableTotal: number;
  /** Total a percibir (taxableTotal + indemnización). */
  total: number;
}

function severanceDaysPerYearFor(causa: CausaCese): { days: number; capMonths: number | null } {
  switch (causa) {
    case CausaCese.DESPIDO_IMPROCEDENTE:
      return { days: 33, capMonths: 24 };
    case CausaCese.DESPIDO_OBJETIVO:
      return { days: 20, capMonths: 12 };
    case CausaCese.FIN_TEMPORAL:
      return { days: 12, capMonths: null };
    default:
      return { days: 0, capMonths: null };
  }
}

/**
 * Calcula el finiquito y la indemnización por extinción del contrato.
 */
export function calculateSettlement(input: SettlementInput): SettlementResult {
  const salaryDaysWorked = round2(
    (input.monthlySalary * input.daysWorkedThisMonth) / input.calendarDaysInMonth,
  );

  const bonusMonths = Math.max(0, Math.min(12, input.bonusAccrualMonths ?? 0));
  const proratedBonuses = round2(
    (input.monthlySalary * input.numberOfBonuses * bonusMonths) / 12,
  );

  const vacationSettlement = computeVacationSettlementAmount(
    input.pendingVacationDays,
    dailySalaryForVacation(input.monthlySalary, input.numberOfBonuses),
  );

  // Indemnización. Se usa el salario diario sin redondeo intermedio para
  // evitar desviaciones al multiplicar por días × años.
  const { days, capMonths } = severanceDaysPerYearFor(input.causa);
  const dailySeverance = input.dailySalaryForSeverance ?? input.monthlySalary / 30;
  let severance = round2(days * input.yearsOfService * dailySeverance);
  if (capMonths != null) {
    const cap = round2(capMonths * input.monthlySalary);
    if (severance > cap) severance = cap;
  }

  const taxableTotal = round2(salaryDaysWorked + proratedBonuses + vacationSettlement);
  const total = round2(taxableTotal + severance);

  return {
    salaryDaysWorked,
    proratedBonuses,
    vacationSettlement,
    severance,
    severanceDaysPerYear: days,
    taxableTotal,
    total,
  };
}
