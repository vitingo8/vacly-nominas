// ============================================================================
// especie.ts — Salario en especie (Art. 42 ET / Arts. 42-43 LIRPF)
// ----------------------------------------------------------------------------
// La retribución en especie (vivienda, vehículo, seguros, etc.):
//   - Cotiza a la Seguridad Social: se suma a la base de cotización.
//   - Tributa en IRPF: se suma a la base de retención.
//   - NO se percibe en metálico: se descuenta su valoración del líquido.
//   - Genera un "ingreso a cuenta" del IRPF, que la empresa ingresa por el
//     trabajador. Si se repercute, se descuenta también del líquido.
// ============================================================================

import type { InKindInput } from './tipos';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface InKindResult {
  /** Valoración (devengo en especie, cotiza y tributa). */
  amount: number;
  /** Valor descontado del líquido (no se paga en metálico). */
  deductedValue: number;
  /** Ingreso a cuenta IRPF (= valoración × tipo IRPF). */
  ingresoACuenta: number;
  /** Parte del ingreso a cuenta repercutida al trabajador. */
  ingresoACuentaRepercutido: number;
  /** Parte del ingreso a cuenta asumida por la empresa. */
  ingresoACuentaEmpresa: number;
}

/**
 * Calcula el tratamiento del salario en especie.
 *
 * @param input Valoración del salario en especie del mes.
 * @param irpfPercentage Tipo de retención del trabajador (para el ingreso a cuenta).
 */
export function calculateInKind(
  input: InKindInput | undefined,
  irpfPercentage: number,
): InKindResult {
  const amount = round2(Math.max(0, input?.amount ?? 0));
  if (amount <= 0) {
    return {
      amount: 0,
      deductedValue: 0,
      ingresoACuenta: 0,
      ingresoACuentaRepercutido: 0,
      ingresoACuentaEmpresa: 0,
    };
  }

  const ingresoACuenta = round2((amount * irpfPercentage) / 100);
  const repercutido = input?.repercutido ?? true;

  return {
    amount,
    deductedValue: amount,
    ingresoACuenta,
    ingresoACuentaRepercutido: repercutido ? ingresoACuenta : 0,
    ingresoACuentaEmpresa: repercutido ? 0 : ingresoACuenta,
  };
}
