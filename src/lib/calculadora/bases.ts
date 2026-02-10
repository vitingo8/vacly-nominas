// ============================================================================
// bases.ts — Cálculo de bases de cotización
// Legislación española 2025
// ============================================================================
//
// Fórmulas principales:
//
// Base CC (Contingencias Comunes):
//   BCCC = Devengos salariales del mes + Prorrata pagas extras
//   Ajustada a los topes mínimo (grupo) y máximo (general)
//
// Base CP (Contingencias Profesionales):
//   BCP = BCCC + Horas extras (normales + fuerza mayor)
//   Ajustada a los topes mínimo (grupo) y máximo (general)
//
// Base Reguladora IT:
//   BR diaria = BCCC del mes anterior / días del mes anterior
//   (Simplificación: usamos la BCCC del mes actual / días naturales)
//
// ============================================================================

import type {
  EmployeePayrollInput,
  MonthlyVariablesInput,
  PayrollConfigInput,
  BasesCalculationResult,
  GrupoCotizacion,
} from './tipos';

/**
 * Obtiene los topes mínimo y máximo de cotización para un grupo.
 *
 * Grupos 1-3: bases mínimas diferenciadas (mensual).
 * Grupos 4-11: base mínima = SMI (con prorrata).
 * Base máxima: tope único para todos los grupos.
 */
export function getGroupLimits(
  group: GrupoCotizacion,
  config: PayrollConfigInput
): { minBase: number; maxBase: number } {
  const groupConfig = config.groupLimits.find((g) => g.group === group);

  if (groupConfig) {
    return {
      minBase: groupConfig.minBase,
      maxBase: groupConfig.maxBase,
    };
  }

  // Fallback: si no se encuentra el grupo, usar SMI como mínimo
  return {
    minBase: config.smiMonthly,
    maxBase: config.maxCotizationBase,
  };
}

/**
 * Ajusta una base de cotización a los topes mínimo y máximo.
 * Art. 19 LGSS: la base no puede ser inferior al mínimo del grupo
 * ni superior al máximo general.
 */
export function clampBase(base: number, min: number, max: number): number {
  if (base < min) return min;
  if (base > max) return max;
  return base;
}

/**
 * Calcula los devengos salariales computables para la base de cotización.
 *
 * Incluye: salario base + complementos salariales fijos + comisiones +
 * incentivos + otros devengos salariales.
 *
 * NO incluye: complementos no salariales (dietas, transporte exento, etc.)
 * NO incluye: horas extras (se suman aparte en la base CP)
 * NO incluye: prorrata de pagas extras (se suma aparte en la base CC)
 */
export function calculateMonthlySalaryAccruals(
  employee: EmployeePayrollInput,
  variables: MonthlyVariablesInput
): number {
  const salaryAccruals =
    employee.baseSalaryMonthly +
    employee.fixedComplements +
    variables.commissions +
    variables.incentives +
    variables.otherSalaryAccruals;

  return round2(salaryAccruals);
}

/**
 * Calcula la prorrata mensual de pagas extras para la base CC.
 *
 * Fórmula: Importe anual pagas extras / 12
 *
 * Si el empleado ya tiene el prorrateo precalculado, lo usamos directamente.
 * Si no, calculamos: (salarioBase * numPagas) / 12
 */
export function calculateProratedBonuses(employee: EmployeePayrollInput): number {
  if (employee.proratedBonuses > 0) {
    return round2(employee.proratedBonuses);
  }

  // Cálculo automático si no viene precalculado
  const annualBonuses = employee.baseSalaryMonthly * employee.numberOfBonuses;
  return round2(annualBonuses / 12);
}

/**
 * Cálculo principal de todas las bases de cotización del mes.
 *
 * Pasos:
 * 1. Calcular devengos salariales mensuales (sin extras ni prorrata)
 * 2. Sumar prorrata de pagas extras → Base CC bruta
 * 3. Ajustar Base CC a topes del grupo
 * 4. Calcular Base CP = Base CC + horas extras
 * 5. Ajustar Base CP a topes
 * 6. Calcular base reguladora IT
 * 7. Calcular base IRPF
 */
export function calculateBases(
  employee: EmployeePayrollInput,
  variables: MonthlyVariablesInput,
  config: PayrollConfigInput
): BasesCalculationResult {
  const warnings: string[] = [];
  const limits = getGroupLimits(employee.cotizationGroup, config);

  // --- 1. Devengos salariales computables ---
  const monthlySalaryAccruals = calculateMonthlySalaryAccruals(employee, variables);

  // --- 2. Prorrata de pagas extras ---
  const prorrata = calculateProratedBonuses(employee);

  // --- 3. Base CC bruta = devengos salariales + prorrata ---
  // Art. 147 LGSS: la base de cotización está integrada por la remuneración
  // total, cualquiera que sea su forma o denominación, que mensualmente
  // tenga derecho a percibir el trabajador.
  let baseCCRaw = monthlySalaryAccruals + prorrata;

  // Ajuste por jornada parcial: la base mínima se aplica proporcionalmente
  let effectiveMinBase = limits.minBase;
  if (employee.workdayType === 'PARCIAL' && employee.partTimeCoefficient < 1) {
    effectiveMinBase = round2(limits.minBase * employee.partTimeCoefficient);
  }

  // Ajustar a topes
  const baseCC = clampBase(baseCCRaw, effectiveMinBase, limits.maxBase);

  if (baseCCRaw < effectiveMinBase) {
    warnings.push(
      `Base CC (${baseCCRaw.toFixed(2)}€) inferior al mínimo del grupo ${employee.cotizationGroup} ` +
      `(${effectiveMinBase.toFixed(2)}€). Se ha ajustado al mínimo.`
    );
  }
  if (baseCCRaw > limits.maxBase) {
    warnings.push(
      `Base CC (${baseCCRaw.toFixed(2)}€) superior al máximo (${limits.maxBase.toFixed(2)}€). ` +
      `Se ha ajustado al máximo.`
    );
  }

  // --- 4. Bases de horas extras ---
  const baseOvertimeNormal = round2(variables.overtimeAmount);
  const baseOvertimeForceMajeure = round2(variables.overtimeForceMajeureAmount);

  // --- 5. Base CP = Base CC + horas extras ---
  // Para contingencias profesionales (AT/EP, desempleo, FOGASA, FP)
  // la base incluye las horas extras.
  // La base CP también se ajusta a topes, pero con las horas extras incluidas.
  let baseCPRaw = baseCC + baseOvertimeNormal + baseOvertimeForceMajeure;
  // Nota: la normativa establece que las horas extras se suman a la base CC
  // para obtener la base CP, y esta se ajusta al tope máximo pero NO al mínimo
  // (el mínimo ya está garantizado en la base CC).
  const baseCP = Math.min(baseCPRaw, limits.maxBase);

  if (baseCPRaw > limits.maxBase) {
    warnings.push(
      `Base CP (${baseCPRaw.toFixed(2)}€) superior al máximo (${limits.maxBase.toFixed(2)}€). ` +
      `Se ha ajustado al máximo.`
    );
  }

  // --- 6. Base reguladora IT ---
  // La base reguladora diaria = BCCC / días del mes
  // (Simplificación: usamos la base CC del mes actual)
  const baseReguladoraIT = round2(baseCC / variables.calendarDaysInMonth);

  // --- 7. Base IRPF ---
  // La retención de IRPF se calcula sobre el total de devengos salariales
  // (incluidas pagas extras si se cobran, horas extras, y prestaciones IT empresa)
  // No incluye complementos no salariales exentos.
  const baseIRPF = round2(
    monthlySalaryAccruals +
    variables.overtimeAmount +
    variables.overtimeForceMajeureAmount +
    variables.bonusPayment +
    variables.otherSalaryAccruals
  );

  return {
    baseCC: round2(baseCC),
    baseCP: round2(baseCP),
    baseOvertimeNormal: round2(baseOvertimeNormal),
    baseOvertimeForceMajeure: round2(baseOvertimeForceMajeure),
    baseIRPF,
    baseReguladoraIT,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Redondea a 2 decimales (céntimos de euro) */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export { round2 };
