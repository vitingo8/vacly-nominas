// ============================================================================
// erte.ts — Expediente de Regulación Temporal de Empleo
// ----------------------------------------------------------------------------
// SUSPENSION: el contrato se suspende ciertos días; el trabajador percibe
//   prestación por desempleo (a cargo del SEPE) por los días afectados y la
//   empresa solo abona los días efectivamente trabajados.
// REDUCCION: se reduce la jornada un % determinado; el salario se reduce en
//   esa proporción.
// La empresa puede tener exoneraciones en la cuota empresarial a la SS.
// ============================================================================

import type { ErteInput, ErteDetail } from './tipos';
import { TipoErte } from './tipos';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface ErteComputation {
  detail: ErteDetail;
  /** Importe de salario que se reduce de los devengos a cargo de la empresa. */
  salaryReduction: number;
  /** Factor de exoneración (0-1) a aplicar sobre la cuota empresarial. */
  companyExemptionFactor: number;
}

/**
 * Calcula el efecto de un ERTE sobre la nómina.
 *
 * @param input Datos del ERTE del mes.
 * @param monthlySalaryBase Salario base + complementos del mes (a cargo de la empresa).
 * @param calendarDays Días naturales del mes.
 */
export function calculateErte(
  input: ErteInput | undefined,
  monthlySalaryBase: number,
  calendarDays: number,
): ErteComputation | null {
  if (!input) return null;

  const exemptionPercent = Math.max(0, Math.min(100, input.exemptionPercent ?? 0));
  let salaryReduction = 0;
  let affectedDays = 0;
  let reductionPercent = 0;

  if (input.type === TipoErte.SUSPENSION) {
    affectedDays = Math.max(0, Math.min(calendarDays, input.affectedDays ?? 0));
    salaryReduction = round2((monthlySalaryBase * affectedDays) / calendarDays);
  } else {
    reductionPercent = Math.max(0, Math.min(100, input.reductionPercent ?? 0));
    salaryReduction = round2((monthlySalaryBase * reductionPercent) / 100);
  }

  const companyExemptionFactor = exemptionPercent / 100;

  return {
    detail: {
      type: input.type,
      affectedDays,
      reductionPercent,
      exemptionPercent,
      salaryReduction,
      companyExemption: 0, // se rellena tras conocer la cuota empresarial
    },
    salaryReduction,
    companyExemptionFactor,
  };
}
