// ============================================================================
// solidaridad.ts — Cotización adicional de solidaridad
// ----------------------------------------------------------------------------
// DA 42ª LGSS (introducida por la reforma de pensiones). Desde 2025 se cotiza
// un tipo adicional sobre la parte de retribución que supera la base máxima
// de cotización. Se reparte entre trabajador y empresa en la misma proporción
// que las contingencias comunes (~16,6% trabajador / ~83,4% empresa) y crece
// progresivamente cada año hasta 2045.
// ============================================================================

import type {
  PayrollConfigInput,
  SolidarityConfig,
  SolidarityDetail,
} from './tipos';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Configuración por defecto de solidaridad por ejercicio. */
export function getDefaultSolidarityConfig(year: number): SolidarityConfig | undefined {
  // Reparto igual al de CC: trabajador 4,70 / (4,70+23,60) = 16,61%.
  const workerShare = 4.7 / (4.7 + 23.6);

  if (year >= 2026) {
    // Tipos 2026 (progresión DA 42ª): tramos 0,92 → 1,00 → 1,17 incrementados.
    return {
      workerShare,
      brackets: [
        { fromPercentOverMax: 0, toPercentOverMax: 10, rate: 0.92 },
        { fromPercentOverMax: 10, toPercentOverMax: 50, rate: 1.0 },
        { fromPercentOverMax: 50, toPercentOverMax: null, rate: 1.17 },
      ],
    };
  }
  if (year >= 2025) {
    return {
      workerShare,
      brackets: [
        { fromPercentOverMax: 0, toPercentOverMax: 10, rate: 0.92 },
        { fromPercentOverMax: 10, toPercentOverMax: 50, rate: 1.0 },
        { fromPercentOverMax: 50, toPercentOverMax: null, rate: 1.17 },
      ],
    };
  }
  return undefined;
}

/**
 * Calcula la cotización adicional de solidaridad sobre el exceso de la base de
 * cotización por encima de la base máxima mensual.
 *
 * @param cotizationBase Base de cotización por contingencias comunes del mes (sin tope).
 * @param config Configuración de nómina (base máxima + tramos de solidaridad).
 */
export function calculateSolidarity(
  cotizationBase: number,
  config: PayrollConfigInput,
): SolidarityDetail | null {
  const solidarity = config.solidarity ?? getDefaultSolidarityConfig(config.year);
  if (!solidarity || solidarity.brackets.length === 0) return null;

  const maxBase = config.maxCotizationBase;
  const excess = round2(cotizationBase - maxBase);
  if (excess <= 0) return null;

  const brackets: SolidarityDetail['brackets'] = [];
  let totalRateAmount = 0;

  for (const bracket of solidarity.brackets) {
    const from = round2(maxBase * (1 + bracket.fromPercentOverMax / 100));
    const to =
      bracket.toPercentOverMax == null
        ? Infinity
        : round2(maxBase * (1 + bracket.toPercentOverMax / 100));

    const segmentBase = Math.max(0, Math.min(cotizationBase, to) - from);
    if (segmentBase <= 0) continue;

    const amount = round2((segmentBase * bracket.rate) / 100);
    totalRateAmount += amount;
    brackets.push({
      from,
      to: to === Infinity ? -1 : to,
      rate: bracket.rate,
      base: round2(segmentBase),
      amount,
    });
  }

  const total = round2(totalRateAmount);
  const worker = round2(total * solidarity.workerShare);
  const company = round2(total - worker);

  return {
    excess,
    worker,
    company,
    total,
    brackets,
  };
}
