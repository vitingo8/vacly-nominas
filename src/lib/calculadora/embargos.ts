// ============================================================================
// embargos.ts — Cálculo de embargos sobre el salario (Art. 607 LEC)
// ----------------------------------------------------------------------------
// El salario inembargable equivale al SMI. Sobre el exceso se aplica una escala
// progresiva por tramos de SMI:
//   - 1er SMI adicional (entre 1 y 2 SMI):   30%
//   - 2º   SMI adicional (entre 2 y 3 SMI):  50%
//   - 3er  SMI adicional (entre 3 y 4 SMI):  60%
//   - 4º   SMI adicional (entre 4 y 5 SMI):  75%
//   - resto (a partir de 5 SMI):             90%
// El juzgado puede rebajar entre un 10% y un 15% por cargas familiares.
// Las pensiones de alimentos a hijos (Art. 608 LEC) no tienen límite.
// ============================================================================

import type { GarnishmentInput, GarnishmentDetail } from './tipos';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const SCALE_RATES = [30, 50, 60, 75, 90];

/**
 * Calcula el importe a retener por embargo sobre la nómina.
 *
 * @param netBeforeGarnishment Líquido del trabajador ANTES del embargo
 *        (devengos - SS - IRPF - anticipos), que es la base embargable.
 * @param smiMonthly SMI mensual de referencia (importe inembargable).
 * @param input Datos de la orden de embargo.
 */
export function calculateGarnishment(
  netBeforeGarnishment: number,
  smiMonthly: number,
  input: GarnishmentInput,
): GarnishmentDetail | null {
  if (!input.active) return null;

  const netBase = round2(Math.max(0, netBeforeGarnishment));
  const pensionAlimentos = round2(Math.max(0, input.pensionAlimentos ?? 0));

  // Importe fijo fijado por el juzgado: respeta el inembargable salvo alimentos.
  if (input.fixedAmount != null && input.fixedAmount > 0) {
    const embargable = Math.max(0, netBase - smiMonthly);
    const scaleAmount = round2(Math.min(input.fixedAmount, embargable));
    let total = round2(scaleAmount + pensionAlimentos);
    if (input.maxAmount != null) total = round2(Math.min(total, input.maxAmount));
    return {
      netBase,
      smiReference: round2(smiMonthly),
      scaleAmount,
      pensionAlimentos,
      familyReductionPercent: 0,
      total,
      brackets: [],
    };
  }

  const familyReductionPercent = Math.max(0, Math.min(15, input.familyReductionPercent ?? 0));
  const reductionFactor = 1 - familyReductionPercent / 100;

  const brackets: GarnishmentDetail['brackets'] = [];
  let scaleAmount = 0;

  // Tramos de SMI sobre el exceso del inembargable.
  const excess = Math.max(0, netBase - smiMonthly);
  if (excess > 0 && smiMonthly > 0) {
    for (let i = 0; i < SCALE_RATES.length; i++) {
      const from = smiMonthly * (i + 1);
      const to = i < SCALE_RATES.length - 1 ? smiMonthly * (i + 2) : Infinity;
      const segment = Math.max(0, Math.min(netBase, to) - from);
      if (segment <= 0) continue;
      const effectiveRate = SCALE_RATES[i] * reductionFactor;
      const amount = round2((segment * effectiveRate) / 100);
      scaleAmount += amount;
      brackets.push({
        from: round2(from),
        to: to === Infinity ? -1 : round2(to),
        rate: round2(effectiveRate),
        amount,
      });
    }
  }

  scaleAmount = round2(scaleAmount);
  let total = round2(scaleAmount + pensionAlimentos);
  if (input.maxAmount != null && input.maxAmount >= 0) {
    total = round2(Math.min(total, input.maxAmount));
  }

  return {
    netBase,
    smiReference: round2(smiMonthly),
    scaleAmount,
    pensionAlimentos,
    familyReductionPercent,
    total,
    brackets,
  };
}
