// ============================================================================
// incapacidad-temporal.ts — Cálculo de la prestación por Incapacidad Temporal
// Legislación española 2025
// ============================================================================
//
// La IT (Incapacidad Temporal) es la situación en la que el trabajador está
// de baja médica y no puede trabajar. La prestación varía según la causa:
//
// ─────────────────────────────────────────────────────────────────────────────
// A) ENFERMEDAD COMÚN / ACCIDENTE NO LABORAL:
// ─────────────────────────────────────────────────────────────────────────────
//   Días 1 a 3:   Sin prestación (0%). El trabajador no cobra.
//                  La empresa no tiene obligación legal de pagar estos días,
//                  aunque puede hacerlo si lo establece el convenio.
//
//   Días 4 a 15:  60% de la base reguladora diaria.
//                  A CARGO DE LA EMPRESA (pago delegado).
//
//   Días 16 a 20: 60% de la base reguladora diaria.
//                  A CARGO DE LA SEGURIDAD SOCIAL
//                  (la empresa paga en pago delegado y compensa).
//
//   Día 21 en adelante: 75% de la base reguladora diaria.
//                        A CARGO DE LA SEGURIDAD SOCIAL.
//
// ─────────────────────────────────────────────────────────────────────────────
// B) ACCIDENTE DE TRABAJO / ENFERMEDAD PROFESIONAL:
// ─────────────────────────────────────────────────────────────────────────────
//   Día del accidente: Salario íntegro a cargo de la empresa.
//
//   Día siguiente en adelante: 75% de la base reguladora diaria.
//                               A CARGO DE LA SEGURIDAD SOCIAL.
//
// ─────────────────────────────────────────────────────────────────────────────
// BASE REGULADORA:
// ─────────────────────────────────────────────────────────────────────────────
//   Base reguladora diaria = BCCC del mes anterior / nº días mes anterior
//   (Simplificación: usamos BCCC del mes actual / días naturales del mes)
//
// ============================================================================

import type {
  TemporaryDisabilityInput,
  MonthlyVariablesInput,
  ITCalculationResult,
  ITDetail,
} from './tipos';
import { TipoContingenciaIT } from './tipos';

/** Redondea a 2 decimales */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Constantes de porcentajes de prestación IT
// ---------------------------------------------------------------------------

/** Porcentajes de prestación por enfermedad común */
const IT_ENFERMEDAD_COMUN = {
  /** Días 1-3: sin prestación */
  DIAS_SIN_PRESTACION: 3,
  /** Días 4-15: 60% a cargo de la empresa */
  DIAS_EMPRESA_FIN: 15,
  /** Porcentaje días 4-20: 60% */
  PORCENTAJE_60: 60,
  /** Días 16-20: 60% a cargo de la SS */
  DIAS_SS_60_FIN: 20,
  /** Día 21+: 75% a cargo de la SS */
  PORCENTAJE_75: 75,
} as const;

/** Porcentajes de prestación por accidente de trabajo */
const IT_ACCIDENTE_TRABAJO = {
  /** Día del accidente: salario íntegro (100%) a cargo de la empresa */
  DIA_ACCIDENTE: 1,
  /** Día 2 en adelante: 75% a cargo de la SS */
  PORCENTAJE_75: 75,
} as const;

// ---------------------------------------------------------------------------
// Función principal de cálculo de IT
// ---------------------------------------------------------------------------

/**
 * Calcula la prestación por Incapacidad Temporal del mes.
 *
 * Determina cuántos días corresponden a cada tramo de prestación,
 * calcula los importes a cargo de empresa y SS, y calcula el
 * descuento salarial por los días de baja.
 *
 * @param disability - Datos de la baja (tipo, días, inicio)
 * @param variables - Variables mensuales (días naturales del mes)
 * @param dailyRegulatoryBase - Base reguladora diaria (BCCC / días del mes)
 * @param dailySalary - Salario bruto diario del trabajador (para descuento)
 * @returns Resultado del cálculo de IT
 */
export function calculateIT(
  disability: TemporaryDisabilityInput,
  variables: MonthlyVariablesInput,
  dailyRegulatoryBase: number,
  dailySalary: number
): ITCalculationResult {
  if (!disability.active) {
    return createEmptyResult();
  }

  // Días naturales de baja en este mes
  const daysInMonth = disability.endDay - disability.startDay + 1;

  // Día absoluto de inicio y fin del período de baja
  const absoluteStart = disability.absoluteDaysSinceStart;
  const absoluteEnd = absoluteStart + daysInMonth - 1;

  let companyBenefitAmount = 0;
  let ssBenefitAmount = 0;
  let daysNoBenefit = 0;
  let daysCompanyPays = 0;
  let daysSSPays = 0;
  let percentageApplied = 0;

  if (disability.contingencyType === TipoContingenciaIT.ENFERMEDAD_COMUN) {
    // ─── ENFERMEDAD COMÚN / ACCIDENTE NO LABORAL ───
    const result = calculateEnfermedadComun(
      absoluteStart,
      absoluteEnd,
      dailyRegulatoryBase
    );
    companyBenefitAmount = result.companyAmount;
    ssBenefitAmount = result.ssAmount;
    daysNoBenefit = result.daysNoBenefit;
    daysCompanyPays = result.daysCompanyPays;
    daysSSPays = result.daysSSPays;
    percentageApplied = result.lastPercentage;
  } else {
    // ─── ACCIDENTE DE TRABAJO / ENFERMEDAD PROFESIONAL ───
    const result = calculateAccidenteTrabajo(
      absoluteStart,
      absoluteEnd,
      dailyRegulatoryBase,
      dailySalary
    );
    companyBenefitAmount = result.companyAmount;
    ssBenefitAmount = result.ssAmount;
    daysNoBenefit = result.daysNoBenefit;
    daysCompanyPays = result.daysCompanyPays;
    daysSSPays = result.daysSSPays;
    percentageApplied = result.lastPercentage;
  }

  // Descuento salarial: los días de baja no se cobran como salario normal.
  // Se sustituyen por la prestación de IT.
  const salaryDeductionForIT = round2(daysInMonth * dailySalary);

  const detail: ITDetail = {
    daysNoBenefit,
    daysCompanyPays,
    daysSSPays,
    companyBenefitAmount: round2(companyBenefitAmount),
    ssBenefitAmount: round2(ssBenefitAmount),
    dailyRegulatoryBase: round2(dailyRegulatoryBase),
    percentageApplied,
  };

  return {
    companyBenefitAmount: round2(companyBenefitAmount),
    ssBenefitAmount: round2(ssBenefitAmount),
    salaryDeductionForIT: round2(salaryDeductionForIT),
    detail,
  };
}

// ---------------------------------------------------------------------------
// Cálculo por tipo de contingencia
// ---------------------------------------------------------------------------

interface ITTramoResult {
  companyAmount: number;
  ssAmount: number;
  daysNoBenefit: number;
  daysCompanyPays: number;
  daysSSPays: number;
  lastPercentage: number;
}

/**
 * Calcula la prestación por enfermedad común / accidente no laboral.
 *
 * Tramos:
 *   Días absolutos 1-3:   0% (sin prestación)
 *   Días absolutos 4-15:  60% base reguladora → a cargo de la EMPRESA
 *   Días absolutos 16-20: 60% base reguladora → a cargo de la SS
 *   Días absolutos 21+:   75% base reguladora → a cargo de la SS
 *
 * Se calcula día a día cuántos días de cada tramo caen en el mes actual.
 */
function calculateEnfermedadComun(
  absoluteStart: number,
  absoluteEnd: number,
  dailyBase: number
): ITTramoResult {
  let companyAmount = 0;
  let ssAmount = 0;
  let daysNoBenefit = 0;
  let daysCompanyPays = 0;
  let daysSSPays = 0;
  let lastPercentage = 0;

  for (let day = absoluteStart; day <= absoluteEnd; day++) {
    if (day <= IT_ENFERMEDAD_COMUN.DIAS_SIN_PRESTACION) {
      // Días 1-3: sin prestación
      daysNoBenefit++;
    } else if (day <= IT_ENFERMEDAD_COMUN.DIAS_EMPRESA_FIN) {
      // Días 4-15: 60% a cargo de la empresa
      const amount = round2((dailyBase * IT_ENFERMEDAD_COMUN.PORCENTAJE_60) / 100);
      companyAmount += amount;
      daysCompanyPays++;
      lastPercentage = IT_ENFERMEDAD_COMUN.PORCENTAJE_60;
    } else if (day <= IT_ENFERMEDAD_COMUN.DIAS_SS_60_FIN) {
      // Días 16-20: 60% a cargo de la SS
      const amount = round2((dailyBase * IT_ENFERMEDAD_COMUN.PORCENTAJE_60) / 100);
      ssAmount += amount;
      daysSSPays++;
      lastPercentage = IT_ENFERMEDAD_COMUN.PORCENTAJE_60;
    } else {
      // Días 21+: 75% a cargo de la SS
      const amount = round2((dailyBase * IT_ENFERMEDAD_COMUN.PORCENTAJE_75) / 100);
      ssAmount += amount;
      daysSSPays++;
      lastPercentage = IT_ENFERMEDAD_COMUN.PORCENTAJE_75;
    }
  }

  return {
    companyAmount: round2(companyAmount),
    ssAmount: round2(ssAmount),
    daysNoBenefit,
    daysCompanyPays,
    daysSSPays,
    lastPercentage,
  };
}

/**
 * Calcula la prestación por accidente de trabajo / enfermedad profesional.
 *
 * Tramos:
 *   Día 1 (día del accidente): Salario íntegro a cargo de la empresa
 *   Día 2 en adelante:         75% base reguladora → a cargo de la SS
 *
 * En accidentes de trabajo la prestación comienza desde el día siguiente
 * al accidente (el día del accidente la empresa paga el salario completo).
 */
function calculateAccidenteTrabajo(
  absoluteStart: number,
  absoluteEnd: number,
  dailyBase: number,
  dailySalary: number
): ITTramoResult {
  let companyAmount = 0;
  let ssAmount = 0;
  let daysNoBenefit = 0;
  let daysCompanyPays = 0;
  let daysSSPays = 0;
  let lastPercentage = 0;

  for (let day = absoluteStart; day <= absoluteEnd; day++) {
    if (day <= IT_ACCIDENTE_TRABAJO.DIA_ACCIDENTE) {
      // Día del accidente: salario íntegro a cargo de la empresa
      companyAmount += round2(dailySalary);
      daysCompanyPays++;
      lastPercentage = 100;
    } else {
      // Día 2 en adelante: 75% a cargo de la SS
      const amount = round2((dailyBase * IT_ACCIDENTE_TRABAJO.PORCENTAJE_75) / 100);
      ssAmount += amount;
      daysSSPays++;
      lastPercentage = IT_ACCIDENTE_TRABAJO.PORCENTAJE_75;
    }
  }

  return {
    companyAmount: round2(companyAmount),
    ssAmount: round2(ssAmount),
    daysNoBenefit,
    daysCompanyPays,
    daysSSPays,
    lastPercentage,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Crea un resultado vacío de IT (cuando no hay baja activa).
 */
function createEmptyResult(): ITCalculationResult {
  return {
    companyBenefitAmount: 0,
    ssBenefitAmount: 0,
    salaryDeductionForIT: 0,
    detail: {
      daysNoBenefit: 0,
      daysCompanyPays: 0,
      daysSSPays: 0,
      companyBenefitAmount: 0,
      ssBenefitAmount: 0,
      dailyRegulatoryBase: 0,
      percentageApplied: 0,
    },
  };
}

/**
 * Calcula el salario bruto diario del trabajador.
 * Se usa para determinar el descuento por los días de baja
 * y para la prestación del día del accidente de trabajo.
 *
 * Fórmula: (salario base + complementos fijos) / días naturales del mes
 *
 * @param baseSalary - Salario base mensual
 * @param fixedComplements - Complementos salariales fijos mensuales
 * @param calendarDays - Días naturales del mes
 * @returns Salario bruto diario
 */
export function calculateDailySalary(
  baseSalary: number,
  fixedComplements: number,
  calendarDays: number
): number {
  if (calendarDays <= 0) return 0;
  return round2((baseSalary + fixedComplements) / calendarDays);
}
