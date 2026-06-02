// ============================================================================
// IRPF — Estimador de retención OFFLINE (fallback)
// ----------------------------------------------------------------------------
// Implementa una aproximación del "procedimiento general" para determinar el
// tipo de retención (arts. 80-85 RIRPF). Se usa cuando el web service de la
// AEAT no está disponible, para que la nómina siga siendo 100% automática.
//
// NO sustituye al cálculo oficial: redondeos y casos particulares (Ceuta y
// Melilla, regularizaciones, etc.) pueden diferir. Marcado siempre como
// 'estimated' para trazabilidad.
// ============================================================================

import type { IRPFInput } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Escala de retención general (estatal + complementaria), 2025/2026. */
const ESCALA_RETENCION: Array<{ hasta: number; tipo: number }> = [
  { hasta: 12450, tipo: 19 },
  { hasta: 20200, tipo: 24 },
  { hasta: 35200, tipo: 30 },
  { hasta: 60000, tipo: 37 },
  { hasta: 300000, tipo: 45 },
  { hasta: Infinity, tipo: 47 },
];

/** Aplica la escala progresiva y devuelve la cuota íntegra. */
function aplicarEscala(base: number): number {
  if (base <= 0) return 0;
  let cuota = 0;
  let anterior = 0;
  for (const tramo of ESCALA_RETENCION) {
    const tope = Math.min(base, tramo.hasta);
    if (tope > anterior) {
      cuota += (tope - anterior) * (tramo.tipo / 100);
      anterior = tope;
    }
    if (base <= tramo.hasta) break;
  }
  return cuota;
}

/** Reducción por obtención de rendimientos del trabajo (art. 20 LIRPF). */
function reduccionRendimientosTrabajo(rendimientoNeto: number): number {
  if (rendimientoNeto <= 14852) return 7302;
  if (rendimientoNeto <= 17673.52) {
    return Math.max(0, 7302 - 1.75 * (rendimientoNeto - 14852));
  }
  return 0;
}

/** Mínimo personal y familiar estatal (valores generales). */
function minimoPersonalFamiliar(input: IRPFInput, year: number): number {
  let minimo = 5550; // contribuyente

  const edad = year - (input.anioNacimiento || year);
  if (edad >= 75) minimo += 1150 + 1400;
  else if (edad >= 65) minimo += 1150;

  // Discapacidad del contribuyente
  if (input.discapacidad) {
    minimo += input.discapacidad.grado === 'Grado2' ? 12000 : 3000;
    if (input.discapacidad.movilidadReducida || input.discapacidad.grado === 'Grado2') {
      minimo += 3000; // gastos de asistencia
    }
  }

  // Descendientes
  const descImportes = [2400, 2700, 4000, 4500];
  (input.descendientes ?? []).forEach((d, idx) => {
    const base = descImportes[Math.min(idx, descImportes.length - 1)];
    const coef = d.computadoEntero ? 1 : 0.5;
    let aporta = base * coef;
    const nac = d.anioNacimiento || year;
    if (year - nac < 3) aporta += 2800 * coef; // menores de 3 años
    if (d.discapacidad) {
      aporta += (d.discapacidad.grado === 'Grado2' ? 12000 : 3000) * coef;
    }
    minimo += aporta;
  });

  // Ascendientes
  (input.ascendientes ?? []).forEach((a) => {
    const nac = a.anioNacimiento || year;
    const ed = year - nac;
    let aporta = 0;
    if (ed >= 65) aporta += 1150;
    if (ed >= 75) aporta += 1400;
    const coef = a.convivencia > 1 ? 1 / a.convivencia : 1;
    aporta *= coef;
    if (a.discapacidad) {
      aporta += (a.discapacidad.grado === 'Grado2' ? 12000 : 3000) * coef;
    }
    minimo += aporta;
  });

  return minimo;
}

/** Tipo mínimo legal por tipo de contrato. */
function tipoMinimoLegal(input: IRPFInput): number {
  if (input.situacionLaboral === 'TrabajadorActivo') {
    if (input.tipoContrato === '2') return 2; // temporal < 1 año
    if (input.tipoContrato === '3') return 15; // relaciones especiales
  }
  return 0;
}

export interface FallbackIRPFResult {
  tipoRetencion: number;
  baseRetencion: number;
  minimoPersonalFamiliar: number;
  importeAnualRetenciones: number;
}

/**
 * Estima el tipo de retención IRPF anual (procedimiento general aproximado).
 */
export function estimateIRPFRate(input: IRPFInput, year = 2026): FallbackIRPFResult {
  const retrib = Math.max(0, input.retribAnuales || 0);
  if (retrib <= 0) {
    return { tipoRetencion: 0, baseRetencion: 0, minimoPersonalFamiliar: 0, importeAnualRetenciones: 0 };
  }

  // ── Gastos deducibles ──
  const cotizaciones = Math.max(0, input.cotizaciones || 0);
  let otrosGastos = 2000;
  if (input.movilidadGeografica) otrosGastos += 2000;
  if (input.discapacidad) {
    otrosGastos += input.discapacidad.grado === 'Grado2' || input.discapacidad.movilidadReducida ? 7750 : 3500;
  }
  const reducciones = Math.max(0, (input.irregularidad1 || 0) + (input.irregularidad2 || 0));

  // Rendimiento neto previo (para calcular reducción art. 20).
  const rendimientoNetoPrevio = Math.max(0, retrib - cotizaciones - otrosGastos - reducciones);
  const redTrabajo = reduccionRendimientosTrabajo(rendimientoNetoPrevio);

  // Base para calcular el tipo de retención.
  let base = Math.max(0, retrib - cotizaciones - otrosGastos - reducciones - redTrabajo);

  // Pensión compensatoria / anualidades reducen la base (simplificado).
  base = Math.max(0, base - Math.max(0, input.pensionCompensatoria || 0));

  const mpf = minimoPersonalFamiliar(input, year);

  // Cuota 1 (sobre base) - Cuota 2 (sobre mínimo personal y familiar).
  const cuota1 = aplicarEscala(base);
  const cuota2 = aplicarEscala(Math.min(mpf, base));
  const cuotaRetencion = Math.max(0, cuota1 - cuota2);

  let tipo = retrib > 0 ? (cuotaRetencion / retrib) * 100 : 0;
  tipo = Math.round(tipo * 100) / 100;

  const minimo = tipoMinimoLegal(input);
  if (tipo < minimo) tipo = minimo;
  if (tipo < 0) tipo = 0;
  if (tipo > 47) tipo = 47;

  return {
    tipoRetencion: tipo,
    baseRetencion: round2(base),
    minimoPersonalFamiliar: round2(mpf),
    importeAnualRetenciones: round2((retrib * tipo) / 100),
  };
}
