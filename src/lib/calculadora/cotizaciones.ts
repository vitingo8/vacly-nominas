// ============================================================================
// cotizaciones.ts — Cálculo de cotizaciones a la Seguridad Social
// Legislación española 2025
// ============================================================================
//
// Cotizaciones del TRABAJADOR (se descuentan de su nómina):
//   - Contingencias Comunes:       4,70% sobre Base CC
//   - Desempleo:                   1,55% (indefinido) / 1,60% (temporal) sobre Base CP
//   - Formación Profesional:       0,10% sobre Base CP
//   - MEI:                         0,12% sobre Base CC
//   - Horas extras normales:       4,70% sobre importe HE normales
//   - Horas extras fuerza mayor:   2,00% sobre importe HE fuerza mayor
//
// Cotizaciones de la EMPRESA (no se descuentan, coste adicional):
//   - Contingencias Comunes:       23,60% sobre Base CC
//   - AT/EP:                       Variable según actividad (tarifa primas)
//   - Desempleo:                   5,50% (indefinido) / 6,70% (temporal) sobre Base CP
//   - FOGASA:                      0,20% sobre Base CP
//   - Formación Profesional:       0,60% sobre Base CP
//   - MEI:                         0,58% sobre Base CC
//   - Horas extras normales:       23,60% sobre importe HE normales
//   - Horas extras fuerza mayor:   12,00% sobre importe HE fuerza mayor
//
// ============================================================================

import type {
  PayrollConfigInput,
  BasesCalculationResult,
  TipoContrato,
  WorkerCotizationResult,
  CompanyCotizationResult,
} from './tipos';
import { TipoContrato as TipoContratoEnum } from './tipos';

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Redondea a 2 decimales */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Cotizaciones del trabajador
// ---------------------------------------------------------------------------

/**
 * Calcula las cotizaciones a la Seguridad Social del trabajador.
 *
 * Se aplican los tipos vigentes sobre las bases correspondientes:
 * - CC y MEI se calculan sobre la Base CC
 * - Desempleo, FP se calculan sobre la Base CP
 * - Horas extras tienen sus propios tipos
 *
 * @param bases - Bases de cotización calculadas previamente
 * @param contractType - Tipo de contrato (afecta al tipo de desempleo)
 * @param config - Configuración con los tipos vigentes
 */
export function calculateWorkerCotizations(
  bases: BasesCalculationResult,
  contractType: TipoContrato,
  config: PayrollConfigInput
): WorkerCotizationResult {
  const rates = config.workerRates;

  // Contingencias Comunes: 4,70% sobre Base CC
  const contingenciasComunes = round2((bases.baseCC * rates.contingenciasComunes) / 100);

  // Desempleo: depende del tipo de contrato
  // - Indefinido: 1,55% sobre Base CP
  // - Temporal: 1,60% sobre Base CP
  const unemploymentRate = isIndefiniteContract(contractType)
    ? rates.desempleoIndefinido
    : rates.desempleoTemporal;
  const desempleo = round2((bases.baseCP * unemploymentRate) / 100);

  // Formación Profesional: 0,10% sobre Base CP
  const formacionProfesional = round2((bases.baseCP * rates.formacionProfesional) / 100);

  // MEI (Mecanismo de Equidad Intergeneracional): 0,12% sobre Base CC
  // Introducido en 2023, incrementándose progresivamente hasta 2029
  const mei = round2((bases.baseCC * rates.mei) / 100);

  // Horas extras normales: 4,70% (mismo tipo que CC)
  const horasExtrasNormales = round2(
    (bases.baseOvertimeNormal * rates.horasExtrasNormales) / 100
  );

  // Horas extras fuerza mayor: 2,00%
  const horasExtrasFuerzaMayor = round2(
    (bases.baseOvertimeForceMajeure * rates.horasExtrasFuerzaMayor) / 100
  );

  // Total cotizaciones trabajador
  const totalSS = round2(
    contingenciasComunes +
    desempleo +
    formacionProfesional +
    mei +
    horasExtrasNormales +
    horasExtrasFuerzaMayor
  );

  return {
    contingenciasComunes,
    desempleo,
    formacionProfesional,
    mei,
    horasExtrasNormales,
    horasExtrasFuerzaMayor,
    totalSS,
  };
}

// ---------------------------------------------------------------------------
// Cotizaciones de la empresa
// ---------------------------------------------------------------------------

/**
 * Calcula las cotizaciones a la Seguridad Social de la empresa.
 *
 * La empresa asume un coste de cotización significativamente mayor
 * que el trabajador. Estas cantidades NO se descuentan de la nómina
 * del trabajador, sino que son un coste adicional para la empresa.
 *
 * @param bases - Bases de cotización calculadas previamente
 * @param contractType - Tipo de contrato (afecta al tipo de desempleo)
 * @param config - Configuración con los tipos vigentes y AT/EP
 */
export function calculateCompanyCotizations(
  bases: BasesCalculationResult,
  contractType: TipoContrato,
  config: PayrollConfigInput
): CompanyCotizationResult {
  const rates = config.companyRates;

  // Contingencias Comunes: 23,60% sobre Base CC
  const contingenciasComunes = round2((bases.baseCC * rates.contingenciasComunes) / 100);

  // AT/EP: tipo variable según actividad económica (tarifa de primas RD 1299/2006)
  // Se aplica sobre la Base CP (incluye horas extras)
  const atEp = round2((bases.baseCP * rates.atEp) / 100);

  // Desempleo: depende del tipo de contrato
  // - Indefinido: 5,50% sobre Base CP
  // - Temporal: 6,70% sobre Base CP
  const unemploymentRate = isIndefiniteContract(contractType)
    ? rates.desempleoIndefinido
    : rates.desempleoTemporal;
  const desempleo = round2((bases.baseCP * unemploymentRate) / 100);

  // FOGASA (Fondo de Garantía Salarial): 0,20% sobre Base CP
  // Solo lo paga la empresa, sirve para garantizar salarios en caso de insolvencia
  const fogasa = round2((bases.baseCP * rates.fogasa) / 100);

  // Formación Profesional: 0,60% sobre Base CP
  const formacionProfesional = round2((bases.baseCP * rates.formacionProfesional) / 100);

  // MEI (Mecanismo de Equidad Intergeneracional): 0,58% sobre Base CC
  const mei = round2((bases.baseCC * rates.mei) / 100);

  // Horas extras normales: 23,60% (mismo tipo que CC empresa)
  const horasExtrasNormales = round2(
    (bases.baseOvertimeNormal * rates.horasExtrasNormales) / 100
  );

  // Horas extras fuerza mayor: 12,00%
  const horasExtrasFuerzaMayor = round2(
    (bases.baseOvertimeForceMajeure * rates.horasExtrasFuerzaMayor) / 100
  );

  // Total cotizaciones empresa
  const totalCompanySS = round2(
    contingenciasComunes +
    atEp +
    desempleo +
    fogasa +
    formacionProfesional +
    mei +
    horasExtrasNormales +
    horasExtrasFuerzaMayor
  );

  return {
    contingenciasComunes,
    atEp,
    desempleo,
    fogasa,
    formacionProfesional,
    mei,
    horasExtrasNormales,
    horasExtrasFuerzaMayor,
    totalCompanySS,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determina si un contrato es indefinido (para seleccionar el tipo de desempleo).
 * Los contratos indefinidos y de formación/prácticas usan el tipo reducido.
 */
function isIndefiniteContract(contractType: TipoContrato): boolean {
  return (
    contractType === TipoContratoEnum.INDEFINIDO ||
    contractType === TipoContratoEnum.FORMACION ||
    contractType === TipoContratoEnum.PRACTICAS
  );
}

export { isIndefiniteContract };
