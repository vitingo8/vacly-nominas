// ============================================================================
// Estimación anual de la cotización SS del trabajador
// ----------------------------------------------------------------------------
// Alineado con el motor de cálculo (bases CC/CP + tipos trabajador).
// Sirve para rellenar el campo <Cotizaciones> del XML AEAT (cuota anual).
// ============================================================================

import {
  getGroupLimitsForYear,
  getMaxBaseForYear,
  type GrupoCotizacion,
} from './ss-constants';

/** Tipos trabajador (sin cot. adicional solidaridad). */
const TRAB_CC = 4.7;
const TRAB_DESEMP_INDEF = 1.55;
const TRAB_DESEMP_TEMP = 1.6;
const TRAB_FP = 0.1;
const MEI_BY_YEAR: Record<number, number> = { 2025: 0.12, 2026: 0.15 };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export function getSsMonthlyLimitsForGroup(group: number, year: number): { min: number; max: number } {
  const limits = getGroupLimitsForYear(year);
  const g = limits.find((x) => x.group === (group as GrupoCotizacion));
  if (g) return { min: g.minBase, max: g.maxBase };
  return { min: limits[limits.length - 1].minBase, max: getMaxBaseForYear(year) };
}

/**
 * Estima la cuota anual de SS del trabajador (cotización obligatoria habitual).
 *
 * @param retribAnuales — retribución bruta anual total (dinerario + especie).
 * @param grupo — grupo de cotización 1–11.
 * @param contratoIndefinido — si false, aplica tipo desempleo temporal.
 * @param numeroPagasExtras — pagas extra al año (por defecto 2) para prorrata en base CC.
 * @param year — ejercicio (para bases/tipos MEI).
 */
export function estimateWorkerSocialSecurityAnnual(
  retribAnuales: number,
  grupo: number,
  contratoIndefinido = true,
  numeroPagasExtras = 2,
  year = 2026,
): number {
  if (!retribAnuales || retribAnuales <= 0) return 0;

  const monthlySalary = retribAnuales / 12;
  const prorrata = round2((monthlySalary * numeroPagasExtras) / 12);
  const rawCc = round2(monthlySalary + prorrata);

  const { min, max } = getSsMonthlyLimitsForGroup(grupo, year);
  const baseCC = clamp(rawCc, min, max);
  const baseCP = Math.min(round2(baseCC), max);

  const des = contratoIndefinido ? TRAB_DESEMP_INDEF : TRAB_DESEMP_TEMP;
  const mei = MEI_BY_YEAR[year] ?? 0.15;
  const monthlyWorker =
    (baseCC * TRAB_CC) / 100 +
    (baseCP * des) / 100 +
    (baseCP * TRAB_FP) / 100 +
    (baseCC * mei) / 100;

  return round2(round2(monthlyWorker) * 12);
}
