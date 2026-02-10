// ============================================================================
// validadores.ts - Validacion de datos de entrada para el calculo de nominas
// Legislacion espanola 2025
// ============================================================================
//
// Valida los datos de entrada antes de procesarlos en el motor de calculo.
// Se comprueban:
//   - Rangos numericos (no negativos, dentro de limites legales)
//   - Grupos de cotizacion validos (1-11)
//   - Tipos de contrato y jornada validos
//   - Coherencia entre campos (ej: parcialidad solo si jornada parcial)
//   - Parametros de configuracion completos y correctos
//
// ============================================================================

import type {
  EmployeePayrollInput,
  MonthlyVariablesInput,
  PayrollConfigInput,
  TemporaryDisabilityInput,
  ValidationError,
  ValidationResult,
  GrupoCotizacion,
} from './tipos';
import { TipoContrato, TipoJornada, TipoContingenciaIT } from './tipos';

// ---------------------------------------------------------------------------
// Constantes de validacion
// ---------------------------------------------------------------------------

/** Grupos de cotizacion validos */
const VALID_GROUPS: GrupoCotizacion[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** Tipos de contrato validos */
const VALID_CONTRACT_TYPES = Object.values(TipoContrato);

/** Tipos de jornada validos */
const VALID_WORKDAY_TYPES = Object.values(TipoJornada);

/** Tipos de contingencia IT validos */
const VALID_CONTINGENCY_TYPES = Object.values(TipoContingenciaIT);

/** Porcentaje maximo razonable de IRPF */
const MAX_IRPF_PERCENTAGE = 50;

/** Maximo de dias naturales en un mes */
const MAX_CALENDAR_DAYS = 31;

/** Maximo de pagas extras razonable */
const MAX_BONUS_PAYMENTS = 6;

// ---------------------------------------------------------------------------
// Validacion principal
// ---------------------------------------------------------------------------

/**
 * Valida todos los datos de entrada para el calculo de una nomina.
 *
 * Ejecuta las validaciones de empleado, variables mensuales y configuracion.
 * Devuelve un resultado con isValid=true si no hay errores, o isValid=false
 * con la lista de errores encontrados.
 *
 * @param employee - Datos fijos del empleado
 * @param variables - Variables mensuales
 * @param config - Configuracion de parametros y tipos
 * @returns Resultado de la validacion con lista de errores
 */
export function validateAll(
  employee: EmployeePayrollInput,
  variables: MonthlyVariablesInput,
  config: PayrollConfigInput
): ValidationResult {
  const errors: ValidationError[] = [
    ...validateEmployee(employee),
    ...validateMonthlyVariables(variables),
    ...validateConfig(config),
    ...validateCrossFields(employee, variables),
  ];

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Validacion de datos del empleado
// ---------------------------------------------------------------------------

/**
 * Valida los datos fijos del empleado.
 *
 * Comprueba:
 * - Salario base > 0
 * - Grupo de cotizacion valido (1-11)
 * - IRPF entre 0 y 50%
 * - Complementos fijos >= 0
 * - Prorrateo de pagas extras >= 0
 * - Numero de pagas extras entre 0 y 6
 * - Tipo de contrato valido
 * - Tipo de jornada valido
 * - Coeficiente de parcialidad coherente con el tipo de jornada
 */
export function validateEmployee(employee: EmployeePayrollInput): ValidationError[] {
  const errors: ValidationError[] = [];

  // Salario base
  if (employee.baseSalaryMonthly == null || employee.baseSalaryMonthly < 0) {
    errors.push({
      field: 'baseSalaryMonthly',
      message: 'El salario base mensual debe ser un numero >= 0.',
      code: 'INVALID_BASE_SALARY',
    });
  }

  if (employee.baseSalaryMonthly === 0) {
    errors.push({
      field: 'baseSalaryMonthly',
      message: 'El salario base mensual es 0. Verifique que es correcto.',
      code: 'ZERO_BASE_SALARY',
    });
  }

  // Grupo de cotizacion
  if (!VALID_GROUPS.includes(employee.cotizationGroup)) {
    errors.push({
      field: 'cotizationGroup',
      message: `Grupo de cotizacion invalido: ${employee.cotizationGroup}. Debe ser un valor entre 1 y 11.`,
      code: 'INVALID_COTIZATION_GROUP',
    });
  }

  // IRPF
  if (employee.irpfPercentage < 0) {
    errors.push({
      field: 'irpfPercentage',
      message: 'El porcentaje de IRPF no puede ser negativo.',
      code: 'NEGATIVE_IRPF',
    });
  }

  if (employee.irpfPercentage > MAX_IRPF_PERCENTAGE) {
    errors.push({
      field: 'irpfPercentage',
      message: `El porcentaje de IRPF (${employee.irpfPercentage}%) supera el maximo razonable (${MAX_IRPF_PERCENTAGE}%).`,
      code: 'EXCESSIVE_IRPF',
    });
  }

  // Complementos fijos
  if (employee.fixedComplements < 0) {
    errors.push({
      field: 'fixedComplements',
      message: 'Los complementos salariales fijos no pueden ser negativos.',
      code: 'NEGATIVE_FIXED_COMPLEMENTS',
    });
  }

  // Prorrateo pagas extras
  if (employee.proratedBonuses < 0) {
    errors.push({
      field: 'proratedBonuses',
      message: 'El prorrateo de pagas extras no puede ser negativo.',
      code: 'NEGATIVE_PRORATED_BONUSES',
    });
  }

  // Numero de pagas extras
  if (employee.numberOfBonuses < 0 || employee.numberOfBonuses > MAX_BONUS_PAYMENTS) {
    errors.push({
      field: 'numberOfBonuses',
      message: `El numero de pagas extras debe estar entre 0 y ${MAX_BONUS_PAYMENTS}.`,
      code: 'INVALID_NUMBER_OF_BONUSES',
    });
  }

  // Tipo de contrato
  if (!VALID_CONTRACT_TYPES.includes(employee.contractType)) {
    errors.push({
      field: 'contractType',
      message: `Tipo de contrato invalido: ${employee.contractType}. Valores validos: ${VALID_CONTRACT_TYPES.join(', ')}.`,
      code: 'INVALID_CONTRACT_TYPE',
    });
  }

  // Tipo de jornada
  if (!VALID_WORKDAY_TYPES.includes(employee.workdayType)) {
    errors.push({
      field: 'workdayType',
      message: `Tipo de jornada invalido: ${employee.workdayType}. Valores validos: ${VALID_WORKDAY_TYPES.join(', ')}.`,
      code: 'INVALID_WORKDAY_TYPE',
    });
  }

  // Coeficiente de parcialidad
  if (employee.partTimeCoefficient < 0 || employee.partTimeCoefficient > 1) {
    errors.push({
      field: 'partTimeCoefficient',
      message: 'El coeficiente de parcialidad debe estar entre 0 y 1.',
      code: 'INVALID_PART_TIME_COEFFICIENT',
    });
  }

  // Coherencia jornada-parcialidad
  if (
    employee.workdayType === TipoJornada.COMPLETA &&
    employee.partTimeCoefficient !== 1
  ) {
    errors.push({
      field: 'partTimeCoefficient',
      message: 'Para jornada completa, el coeficiente de parcialidad debe ser 1.',
      code: 'PART_TIME_MISMATCH_FULL',
    });
  }

  if (
    employee.workdayType === TipoJornada.PARCIAL &&
    employee.partTimeCoefficient >= 1
  ) {
    errors.push({
      field: 'partTimeCoefficient',
      message: 'Para jornada parcial, el coeficiente de parcialidad debe ser < 1.',
      code: 'PART_TIME_MISMATCH_PARTIAL',
    });
  }

  // Complementos no salariales (opcional)
  if (
    employee.nonSalaryComplements != null &&
    employee.nonSalaryComplements < 0
  ) {
    errors.push({
      field: 'nonSalaryComplements',
      message: 'Los complementos no salariales no pueden ser negativos.',
      code: 'NEGATIVE_NON_SALARY_COMPLEMENTS',
    });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Validacion de variables mensuales
// ---------------------------------------------------------------------------

/**
 * Valida las variables mensuales del periodo de nomina.
 *
 * Comprueba:
 * - Dias naturales del mes (28-31)
 * - Dias trabajados >= 0 y <= dias naturales
 * - Horas extras >= 0
 * - Importes >= 0
 * - Datos de IT coherentes si activa
 */
export function validateMonthlyVariables(
  variables: MonthlyVariablesInput
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Dias naturales del mes
  if (
    variables.calendarDaysInMonth < 28 ||
    variables.calendarDaysInMonth > MAX_CALENDAR_DAYS
  ) {
    errors.push({
      field: 'calendarDaysInMonth',
      message: `Los dias naturales del mes deben estar entre 28 y ${MAX_CALENDAR_DAYS}.`,
      code: 'INVALID_CALENDAR_DAYS',
    });
  }

  // Dias trabajados
  if (variables.workedDays < 0) {
    errors.push({
      field: 'workedDays',
      message: 'Los dias trabajados no pueden ser negativos.',
      code: 'NEGATIVE_WORKED_DAYS',
    });
  }

  if (variables.workedDays > variables.calendarDaysInMonth) {
    errors.push({
      field: 'workedDays',
      message: `Los dias trabajados (${variables.workedDays}) no pueden superar los dias naturales del mes (${variables.calendarDaysInMonth}).`,
      code: 'EXCESSIVE_WORKED_DAYS',
    });
  }

  // Horas extras normales
  if (variables.overtimeHours < 0) {
    errors.push({
      field: 'overtimeHours',
      message: 'Las horas extras no pueden ser negativas.',
      code: 'NEGATIVE_OVERTIME_HOURS',
    });
  }

  if (variables.overtimeAmount < 0) {
    errors.push({
      field: 'overtimeAmount',
      message: 'El importe de horas extras no puede ser negativo.',
      code: 'NEGATIVE_OVERTIME_AMOUNT',
    });
  }

  // Coherencia: si hay horas extras, debe haber importe y viceversa
  if (variables.overtimeHours > 0 && variables.overtimeAmount <= 0) {
    errors.push({
      field: 'overtimeAmount',
      message: 'Se indican horas extras pero el importe es 0. Debe especificar el importe.',
      code: 'OVERTIME_HOURS_WITHOUT_AMOUNT',
    });
  }

  // Horas extras fuerza mayor
  if (variables.overtimeForceMajeureHours < 0) {
    errors.push({
      field: 'overtimeForceMajeureHours',
      message: 'Las horas extras de fuerza mayor no pueden ser negativas.',
      code: 'NEGATIVE_OVERTIME_FM_HOURS',
    });
  }

  if (variables.overtimeForceMajeureAmount < 0) {
    errors.push({
      field: 'overtimeForceMajeureAmount',
      message: 'El importe de horas extras de fuerza mayor no puede ser negativo.',
      code: 'NEGATIVE_OVERTIME_FM_AMOUNT',
    });
  }

  // Acumulado anual de horas extras
  if (variables.accumulatedOvertimeHoursYear < 0) {
    errors.push({
      field: 'accumulatedOvertimeHoursYear',
      message: 'El acumulado anual de horas extras no puede ser negativo.',
      code: 'NEGATIVE_ACCUMULATED_OVERTIME',
    });
  }

  // Dias de vacaciones
  if (variables.vacationDays < 0) {
    errors.push({
      field: 'vacationDays',
      message: 'Los dias de vacaciones no pueden ser negativos.',
      code: 'NEGATIVE_VACATION_DAYS',
    });
  }

  // Comisiones
  if (variables.commissions < 0) {
    errors.push({
      field: 'commissions',
      message: 'Las comisiones no pueden ser negativas.',
      code: 'NEGATIVE_COMMISSIONS',
    });
  }

  // Incentivos
  if (variables.incentives < 0) {
    errors.push({
      field: 'incentives',
      message: 'Los incentivos no pueden ser negativos.',
      code: 'NEGATIVE_INCENTIVES',
    });
  }

  // Paga extra
  if (variables.bonusPayment < 0) {
    errors.push({
      field: 'bonusPayment',
      message: 'El importe de paga extra no puede ser negativo.',
      code: 'NEGATIVE_BONUS_PAYMENT',
    });
  }

  // Anticipos
  if (variables.advances < 0) {
    errors.push({
      field: 'advances',
      message: 'Los anticipos no pueden ser negativos.',
      code: 'NEGATIVE_ADVANCES',
    });
  }

  // Otros devengos
  if (variables.otherSalaryAccruals < 0) {
    errors.push({
      field: 'otherSalaryAccruals',
      message: 'Los otros devengos salariales no pueden ser negativos.',
      code: 'NEGATIVE_OTHER_SALARY_ACCRUALS',
    });
  }

  if (variables.otherNonSalaryAccruals < 0) {
    errors.push({
      field: 'otherNonSalaryAccruals',
      message: 'Los otros devengos no salariales no pueden ser negativos.',
      code: 'NEGATIVE_OTHER_NON_SALARY_ACCRUALS',
    });
  }

  // Otras deducciones
  if (variables.otherDeductions < 0) {
    errors.push({
      field: 'otherDeductions',
      message: 'Las otras deducciones no pueden ser negativas.',
      code: 'NEGATIVE_OTHER_DEDUCTIONS',
    });
  }

  // Incapacidad temporal
  if (variables.temporaryDisability) {
    errors.push(...validateTemporaryDisability(variables.temporaryDisability, variables));
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Validacion de IT
// ---------------------------------------------------------------------------

/**
 * Valida los datos de incapacidad temporal.
 *
 * Comprueba:
 * - Tipo de contingencia valido
 * - Dias de inicio/fin dentro del mes
 * - Dia absoluto >= 1
 * - Coherencia inicio <= fin
 */
export function validateTemporaryDisability(
  disability: TemporaryDisabilityInput,
  variables: MonthlyVariablesInput
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!disability.active) {
    return errors; // Si no esta activa, no se valida
  }

  // Tipo de contingencia
  if (!VALID_CONTINGENCY_TYPES.includes(disability.contingencyType)) {
    errors.push({
      field: 'temporaryDisability.contingencyType',
      message: `Tipo de contingencia IT invalido: ${disability.contingencyType}. Valores validos: ${VALID_CONTINGENCY_TYPES.join(', ')}.`,
      code: 'INVALID_IT_CONTINGENCY_TYPE',
    });
  }

  // Dia de inicio
  if (disability.startDay < 1 || disability.startDay > variables.calendarDaysInMonth) {
    errors.push({
      field: 'temporaryDisability.startDay',
      message: `El dia de inicio de IT (${disability.startDay}) debe estar entre 1 y ${variables.calendarDaysInMonth}.`,
      code: 'INVALID_IT_START_DAY',
    });
  }

  // Dia de fin
  if (disability.endDay < 1 || disability.endDay > variables.calendarDaysInMonth) {
    errors.push({
      field: 'temporaryDisability.endDay',
      message: `El dia de fin de IT (${disability.endDay}) debe estar entre 1 y ${variables.calendarDaysInMonth}.`,
      code: 'INVALID_IT_END_DAY',
    });
  }

  // Coherencia inicio <= fin
  if (disability.startDay > disability.endDay) {
    errors.push({
      field: 'temporaryDisability.startDay',
      message: `El dia de inicio de IT (${disability.startDay}) no puede ser posterior al dia de fin (${disability.endDay}).`,
      code: 'IT_START_AFTER_END',
    });
  }

  // Dia absoluto
  if (disability.absoluteDaysSinceStart < 1) {
    errors.push({
      field: 'temporaryDisability.absoluteDaysSinceStart',
      message: 'El dia absoluto de la baja debe ser >= 1.',
      code: 'INVALID_IT_ABSOLUTE_DAY',
    });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Validacion de configuracion
// ---------------------------------------------------------------------------

/**
 * Valida la configuracion de parametros anuales y tipos de cotizacion.
 *
 * Comprueba:
 * - Anno fiscal > 2000
 * - SMI > 0
 * - Base maxima > 0 y > SMI
 * - Todos los tipos de cotizacion >= 0
 * - Existen limites para todos los grupos (1-11)
 * - Limite de horas extras > 0
 */
export function validateConfig(config: PayrollConfigInput): ValidationError[] {
  const errors: ValidationError[] = [];

  // Anno fiscal
  if (config.year < 2000 || config.year > 2100) {
    errors.push({
      field: 'year',
      message: `Anno fiscal fuera de rango: ${config.year}. Debe estar entre 2000 y 2100.`,
      code: 'INVALID_YEAR',
    });
  }

  // SMI
  if (config.smiMonthly <= 0) {
    errors.push({
      field: 'smiMonthly',
      message: 'El SMI mensual debe ser mayor que 0.',
      code: 'INVALID_SMI',
    });
  }

  // Base maxima
  if (config.maxCotizationBase <= 0) {
    errors.push({
      field: 'maxCotizationBase',
      message: 'La base maxima de cotizacion debe ser mayor que 0.',
      code: 'INVALID_MAX_BASE',
    });
  }

  if (config.maxCotizationBase <= config.smiMonthly) {
    errors.push({
      field: 'maxCotizationBase',
      message: `La base maxima (${config.maxCotizationBase}) debe ser superior al SMI (${config.smiMonthly}).`,
      code: 'MAX_BASE_BELOW_SMI',
    });
  }

  // Limites por grupo
  if (!config.groupLimits || config.groupLimits.length === 0) {
    errors.push({
      field: 'groupLimits',
      message: 'Debe especificar los limites de cotizacion para al menos un grupo.',
      code: 'MISSING_GROUP_LIMITS',
    });
  } else {
    // Verificar que existen todos los grupos 1-11
    const definedGroups = config.groupLimits.map((g) => g.group);
    for (const group of VALID_GROUPS) {
      if (!definedGroups.includes(group)) {
        errors.push({
          field: `groupLimits[${group}]`,
          message: `Falta la configuracion de limites para el grupo ${group}.`,
          code: 'MISSING_GROUP_CONFIG',
        });
      }
    }

    // Validar cada grupo
    for (const groupLimit of config.groupLimits) {
      if (groupLimit.minBase < 0) {
        errors.push({
          field: `groupLimits[${groupLimit.group}].minBase`,
          message: `La base minima del grupo ${groupLimit.group} no puede ser negativa.`,
          code: 'NEGATIVE_GROUP_MIN_BASE',
        });
      }
      if (groupLimit.maxBase <= 0) {
        errors.push({
          field: `groupLimits[${groupLimit.group}].maxBase`,
          message: `La base maxima del grupo ${groupLimit.group} debe ser mayor que 0.`,
          code: 'INVALID_GROUP_MAX_BASE',
        });
      }
      if (groupLimit.minBase > groupLimit.maxBase) {
        errors.push({
          field: `groupLimits[${groupLimit.group}]`,
          message: `La base minima (${groupLimit.minBase}) del grupo ${groupLimit.group} no puede superar la maxima (${groupLimit.maxBase}).`,
          code: 'GROUP_MIN_EXCEEDS_MAX',
        });
      }
    }
  }

  // Tipos de cotizacion del trabajador
  errors.push(...validateRatesObject(config.workerRates as unknown as Record<string, number>, 'workerRates'));

  // Tipos de cotizacion de la empresa
  errors.push(...validateRatesObject(config.companyRates as unknown as Record<string, number>, 'companyRates'));

  // Limite horas extras
  if (config.maxOvertimeHoursYear <= 0) {
    errors.push({
      field: 'maxOvertimeHoursYear',
      message: 'El limite anual de horas extras debe ser mayor que 0.',
      code: 'INVALID_MAX_OVERTIME_HOURS',
    });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Validacion cruzada entre campos
// ---------------------------------------------------------------------------

/**
 * Valida la coherencia entre los datos del empleado y las variables mensuales.
 *
 * Comprueba:
 * - Dias trabajados + vacaciones + IT <= dias del mes
 * - Paga extra coherente con el prorrateo
 */
export function validateCrossFields(
  employee: EmployeePayrollInput,
  variables: MonthlyVariablesInput
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Los dias trabajados + vacaciones + IT no deberian superar los dias del mes
  let itDays = 0;
  if (variables.temporaryDisability?.active) {
    itDays =
      variables.temporaryDisability.endDay -
      variables.temporaryDisability.startDay +
      1;
  }

  const totalDays = variables.workedDays + variables.vacationDays + itDays;
  if (totalDays > variables.calendarDaysInMonth) {
    errors.push({
      field: 'workedDays',
      message:
        `La suma de dias trabajados (${variables.workedDays}) + vacaciones (${variables.vacationDays}) ` +
        `+ IT (${itDays}) = ${totalDays} supera los dias del mes (${variables.calendarDaysInMonth}).`,
      code: 'EXCESSIVE_TOTAL_DAYS',
    });
  }

  // Si hay prorrateo de pagas extras Y paga extra en este mes, avisar
  // (puede ser correcto si el convenio lo establece, pero es inusual)
  if (employee.proratedBonuses > 0 && variables.bonusPayment > 0) {
    errors.push({
      field: 'bonusPayment',
      message:
        'Se ha indicado prorrateo de pagas extras Y paga extra en este mes. ' +
        'Normalmente es una cosa u otra. Verifique que es correcto.',
      code: 'PRORATED_AND_BONUS_BOTH',
    });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Valida que todos los valores de un objeto de tipos de cotizacion sean >= 0.
 * Se usa tanto para workerRates como para companyRates.
 */
function validateRatesObject(
  rates: Record<string, number>,
  prefix: string
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [key, value] of Object.entries(rates)) {
    if (typeof value !== 'number') {
      errors.push({
        field: `${prefix}.${key}`,
        message: `El tipo de cotizacion ${prefix}.${key} debe ser un numero.`,
        code: 'INVALID_RATE_TYPE',
      });
    } else if (value < 0) {
      errors.push({
        field: `${prefix}.${key}`,
        message: `El tipo de cotizacion ${prefix}.${key} no puede ser negativo (valor: ${value}).`,
        code: 'NEGATIVE_RATE',
      });
    }
  }

  return errors;
}

/**
 * Crea un resultado de validacion rapido indicando un error unico.
 * Util para validaciones simples antes de ejecutar el motor completo.
 */
export function createValidationError(
  field: string,
  message: string,
  code: string
): ValidationResult {
  return {
    isValid: false,
    errors: [{ field, message, code }],
  };
}

/**
 * Resultado de validacion exitosa.
 */
export function createValidationSuccess(): ValidationResult {
  return {
    isValid: true,
    errors: [],
  };
}
