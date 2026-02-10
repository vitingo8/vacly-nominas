// ============================================================================
// horas-extra.ts — Cálculo de horas extraordinarias
// Legislación española 2025
// ============================================================================
//
// Regulación (Art. 35 Estatuto de los Trabajadores):
//
// 1. Límite anual: 80 horas extras normales por año.
//    Las horas extras de fuerza mayor NO computan para este límite.
//
// 2. Tipos de horas extras:
//    a) Normales: retribuidas como mínimo igual que la hora ordinaria.
//       - Cotización trabajador: 4,70% (= tipo CC)
//       - Cotización empresa: 23,60% (= tipo CC)
//    b) Fuerza mayor: por siniestros, reparación urgente, riesgo de pérdida
//       de materias primas, etc.
//       - Cotización trabajador: 2,00%
//       - Cotización empresa: 12,00%
//
// 3. Horas extras que EXCEDEN el límite de 80h/año:
//    - Siguen siendo retribuibles al trabajador
//    - Se aplica cotización adicional de fuerza mayor (empresa 12% + trabajador 2%)
//    - Se genera un warning/infracción
//
// 4. Las horas extras se suman a la Base CC para formar la Base CP.
//
// ============================================================================

import type {
  MonthlyVariablesInput,
  PayrollConfigInput,
  OvertimeCalculationResult,
} from './tipos';

/** Redondea a 2 decimales */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calcula el desglose de horas extras del mes, controlando el límite anual.
 *
 * El límite legal de 80h/año se aplica a las horas extras normales.
 * Las horas extras de fuerza mayor NO computan para este límite.
 *
 * Si se superan las 80h acumuladas en el año, las horas excedentes:
 *   - Se retribuyen igualmente al trabajador
 *   - Cotizan al tipo de fuerza mayor (más bajo para el trabajador)
 *   - Se genera un aviso de superación del límite legal
 *
 * @param variables - Variables mensuales (horas extras del mes y acumulado anual)
 * @param config - Configuración con el límite anual
 * @returns Desglose de horas extras con importes y avisos
 */
export function calculateOvertime(
  variables: MonthlyVariablesInput,
  config: PayrollConfigInput
): OvertimeCalculationResult {
  const warnings: string[] = [];
  const maxHoursYear = config.maxOvertimeHoursYear; // 80h por defecto

  // --- Horas extras de fuerza mayor (no tienen límite) ---
  const forceMajeureAmount = round2(variables.overtimeForceMajeureAmount);

  // --- Horas extras normales: comprobar límite anual ---
  const previousAccumulated = variables.accumulatedOvertimeHoursYear;
  const currentMonthHours = variables.overtimeHours;
  const totalAfterThisMonth = previousAccumulated + currentMonthHours;

  let normalAmount: number;
  let excessHours = 0;
  let excessAmount = 0;

  if (totalAfterThisMonth <= maxHoursYear) {
    // --- Caso 1: No se supera el límite ---
    // Todas las horas extras del mes son normales
    normalAmount = round2(variables.overtimeAmount);
  } else if (previousAccumulated >= maxHoursYear) {
    // --- Caso 2: Ya se había superado el límite antes de este mes ---
    // Todas las horas de este mes son excedentes
    normalAmount = 0;
    excessHours = currentMonthHours;
    excessAmount = round2(variables.overtimeAmount);

    warnings.push(
      `Se ha superado el límite legal de ${maxHoursYear}h extras anuales. ` +
      `Acumulado antes de este mes: ${previousAccumulated}h. ` +
      `Este mes: ${currentMonthHours}h (todas excedentes). ` +
      `Total anual: ${totalAfterThisMonth}h.`
    );
  } else {
    // --- Caso 3: Se supera el límite DURANTE este mes ---
    // Parte de las horas son normales y parte son excedentes
    const hoursWithinLimit = maxHoursYear - previousAccumulated;
    excessHours = currentMonthHours - hoursWithinLimit;

    // Calcular el importe proporcional de cada tramo
    // (precio por hora = importe total / horas totales)
    const pricePerHour = currentMonthHours > 0
      ? variables.overtimeAmount / currentMonthHours
      : 0;

    normalAmount = round2(hoursWithinLimit * pricePerHour);
    excessAmount = round2(excessHours * pricePerHour);

    warnings.push(
      `Se supera el límite legal de ${maxHoursYear}h extras anuales en este mes. ` +
      `Acumulado antes: ${previousAccumulated}h + este mes: ${currentMonthHours}h = ` +
      `${totalAfterThisMonth}h. Exceso: ${excessHours}h. ` +
      `Las horas excedentes cotizan al tipo de fuerza mayor.`
    );
  }

  // Aviso preventivo cuando se acerca al límite (>90% consumido)
  if (
    totalAfterThisMonth <= maxHoursYear &&
    totalAfterThisMonth > maxHoursYear * 0.9
  ) {
    warnings.push(
      `Atención: se ha consumido el ${((totalAfterThisMonth / maxHoursYear) * 100).toFixed(0)}% ` +
      `del límite anual de horas extras (${totalAfterThisMonth}h de ${maxHoursYear}h).`
    );
  }

  return {
    normalAmount,
    forceMajeureAmount,
    excessHours,
    excessAmount,
    warnings,
  };
}

/**
 * Calcula el total de horas extras acumuladas tras este mes.
 * Útil para actualizar el acumulado anual en el sistema.
 *
 * Solo computa las horas extras normales (las de fuerza mayor no).
 *
 * @param currentAccumulated - Horas extras normales acumuladas antes del mes
 * @param currentMonthHours - Horas extras normales del mes actual
 * @returns Nuevo acumulado anual de horas extras normales
 */
export function getUpdatedAccumulatedOvertime(
  currentAccumulated: number,
  currentMonthHours: number
): number {
  return currentAccumulated + currentMonthHours;
}

/**
 * Calcula las horas disponibles de extras normales para el resto del año.
 *
 * @param accumulatedHours - Horas extras normales ya realizadas en el año
 * @param maxHoursYear - Límite anual (80h por defecto)
 * @returns Horas disponibles restantes (puede ser 0 si ya se superó)
 */
export function getRemainingOvertimeHours(
  accumulatedHours: number,
  maxHoursYear: number = 80
): number {
  return Math.max(0, maxHoursYear - accumulatedHours);
}
