// ============================================================================
// calculadora.ts — Motor principal de cálculo de nóminas españolas
// Legislación española 2025
// ============================================================================
//
// Función principal: calculatePayslip()
//
// Orquesta todo el proceso de cálculo de una nómina mensual:
//
// 1. Validar datos de entrada
// 2. Calcular horas extras (control límite 80h/año)
// 3. Calcular bases de cotización (CC, CP, IRPF, reguladora IT)
// 4. Calcular IT si hay baja activa
// 5. Calcular devengos (importes brutos)
// 6. Calcular cotizaciones del trabajador (SS)
// 7. Calcular IRPF
// 8. Calcular cotizaciones de la empresa
// 9. Calcular salario neto y coste total empresa
// 10. Ensamblar el resultado completo (PayslipResult)
//
// ============================================================================

import type {
  EmployeePayrollInput,
  MonthlyVariablesInput,
  PayrollConfigInput,
  PayslipResult,
  PayslipAccruals,
  PayslipBases,
  WorkerDeductions,
  CompanyDeductions,
  ITCalculationResult,
  BasesCalculationResult,
  WorkerCotizationResult,
  CompanyCotizationResult,
  OvertimeCalculationResult,
} from './tipos';

import { validateAll } from './validadores';
import { calculateBases, calculateProratedBonuses, round2, roundUp2 } from './bases';
import { calculateWorkerCotizations, calculateCompanyCotizations } from './cotizaciones';
import { calculateIRPF, validateIRPFPercentage } from './irpf';
import { calculateOvertime } from './horas-extra';
import { calculateIT, calculateDailySalary } from './incapacidad-temporal';
import { calculateSolidarity } from './solidaridad';
import { calculateInKind } from './especie';
import { calculateGarnishment } from './embargos';
import { calculateErte } from './erte';
import type {
  GarnishmentDetail,
  SolidarityDetail,
  ErteDetail,
} from './tipos';

// ---------------------------------------------------------------------------
// Configuración por defecto 2025
// ---------------------------------------------------------------------------

/**
 * Configuración por defecto con los parámetros de 2025.
 *
 * Fuentes:
 * - SMI 2025: 1.184,00€/mes (14 pagas) — RD 87/2025
 * - Base máxima cotización: 4.720,50€/mes — LGSS / Orden TMS
 * - Bases mínimas por grupo: Orden ISM/56/2025
 * - Tipos de cotización: Orden ISM/56/2025
 */
export const DEFAULT_CONFIG_2025: PayrollConfigInput = {
  year: 2025,
  smiMonthly: 1184.00,
  maxCotizationBase: 4720.50,

  groupLimits: [
    { group: 1,  minBase: 1903.50, maxBase: 4720.50 },
    { group: 2,  minBase: 1578.30, maxBase: 4720.50 },
    { group: 3,  minBase: 1373.40, maxBase: 4720.50 },
    { group: 4,  minBase: 1362.00, maxBase: 4720.50 },
    { group: 5,  minBase: 1362.00, maxBase: 4720.50 },
    { group: 6,  minBase: 1362.00, maxBase: 4720.50 },
    { group: 7,  minBase: 1362.00, maxBase: 4720.50 },
    { group: 8,  minBase: 1362.00, maxBase: 4720.50 },
    { group: 9,  minBase: 1362.00, maxBase: 4720.50 },
    { group: 10, minBase: 1362.00, maxBase: 4720.50 },
    { group: 11, minBase: 1362.00, maxBase: 4720.50 },
  ],

  workerRates: {
    contingenciasComunes: 4.70,
    desempleoIndefinido: 1.55,
    desempleoTemporal: 1.60,
    formacionProfesional: 0.10,
    mei: 0.12,
    horasExtrasNormales: 4.70,
    horasExtrasFuerzaMayor: 2.00,
  },

  companyRates: {
    contingenciasComunes: 23.60,
    desempleoIndefinido: 5.50,
    desempleoTemporal: 6.70,
    fogasa: 0.20,
    formacionProfesional: 0.60,
    atEp: 3.60,  // Valor por defecto — varía según CNAE de la empresa
    mei: 0.58,
    horasExtrasNormales: 23.60,
    horasExtrasFuerzaMayor: 12.00,
  },

  maxOvertimeHoursYear: 80,
};

/**
 * Parámetros oficiales 2026 (Orden ministerial tipos cotización; bases cotización).
 * SMI: 1.221 €/mes (14 pagas) = 17.094 € brutos/año.
 * Base máxima mensual: 5.101,20 €. Grupos 8–11: equivalente mensual 30 días (47,48–170,04 €/día).
 */
export const DEFAULT_CONFIG_2026: PayrollConfigInput = {
  year: 2026,
  smiMonthly: 1221.0,
  maxCotizationBase: 5101.2,

  groupLimits: [
    { group: 1, minBase: 1989.3, maxBase: 5101.2 },
    { group: 2, minBase: 1649.7, maxBase: 5101.2 },
    { group: 3, minBase: 1435.2, maxBase: 5101.2 },
    { group: 4, minBase: 1424.4, maxBase: 5101.2 },
    { group: 5, minBase: 1424.4, maxBase: 5101.2 },
    { group: 6, minBase: 1424.4, maxBase: 5101.2 },
    { group: 7, minBase: 1424.4, maxBase: 5101.2 },
    { group: 8, minBase: 1424.4, maxBase: 5101.2 },
    { group: 9, minBase: 1424.4, maxBase: 5101.2 },
    { group: 10, minBase: 1424.4, maxBase: 5101.2 },
    { group: 11, minBase: 1424.4, maxBase: 5101.2 },
  ],

  workerRates: {
    contingenciasComunes: 4.7,
    desempleoIndefinido: 1.55,
    desempleoTemporal: 1.6,
    formacionProfesional: 0.1,
    mei: 0.15,
    horasExtrasNormales: 4.7,
    horasExtrasFuerzaMayor: 2.0,
  },

  companyRates: {
    contingenciasComunes: 23.6,
    desempleoIndefinido: 5.5,
    desempleoTemporal: 6.7,
    fogasa: 0.2,
    formacionProfesional: 0.6,
    atEp: 3.6,
    mei: 0.75,
    horasExtrasNormales: 23.6,
    horasExtrasFuerzaMayor: 12.0,
  },

  maxOvertimeHoursYear: 80,
};

/** Configuración por defecto según ejercicio (nómina). */
export function getDefaultPayrollConfig(year: number): PayrollConfigInput {
  if (year >= 2026) return { ...DEFAULT_CONFIG_2026 };
  return { ...DEFAULT_CONFIG_2025 };
}

// ---------------------------------------------------------------------------
// Función principal
// ---------------------------------------------------------------------------

/**
 * Calcula la nómina completa de un trabajador para un mes.
 *
 * Esta función orquesta todo el proceso de cálculo:
 *
 * 1. **Validación**: Comprueba que todos los datos de entrada sean correctos.
 *    Si hay errores de validación, lanza una excepción con los detalles.
 *
 * 2. **Horas extras**: Calcula el desglose de horas extras controlando
 *    el límite anual de 80h (Art. 35 ET).
 *
 * 3. **Bases de cotización**: Calcula la Base CC, Base CP, base IRPF
 *    y base reguladora de IT, ajustando a los topes min/max del grupo.
 *
 * 4. **Incapacidad Temporal**: Si el trabajador está de baja, calcula
 *    la prestación por tramos (empresa / SS) según el tipo de contingencia.
 *
 * 5. **Devengos**: Totaliza los importes brutos a favor del trabajador.
 *
 * 6. **Cotizaciones trabajador**: Calcula las cuotas de SS del trabajador
 *    (CC, desempleo, FP, MEI, horas extras).
 *
 * 7. **IRPF**: Aplica la retención fiscal sobre la base IRPF.
 *
 * 8. **Cotizaciones empresa**: Calcula el coste de SS de la empresa
 *    (CC, AT/EP, desempleo, FOGASA, FP, MEI, horas extras).
 *
 * 9. **Salario neto**: Devengos - deducciones del trabajador.
 *
 * 10. **Coste empresa**: Total devengos salariales + cotizaciones empresa.
 *
 * @param employee - Datos fijos del empleado (salario, grupo, contrato...)
 * @param variables - Variables mensuales (días trabajados, extras, IT...)
 * @param config - Parámetros anuales y tipos de cotización
 * @param month - Mes del periodo (1-12)
 * @returns Resultado completo de la nómina (PayslipResult)
 * @throws Error si la validación de datos falla
 */
export function calculatePayslip(
  employee: EmployeePayrollInput,
  variables: MonthlyVariablesInput,
  config: PayrollConfigInput = getDefaultPayrollConfig(new Date().getFullYear()),
  month: number = new Date().getMonth() + 1
): PayslipResult {
  const allWarnings: string[] = [];

  // ─── PASO 1: Validación de datos de entrada ───
  const validation = validateAll(employee, variables, config);
  if (!validation.isValid) {
    const errorMessages = validation.errors
      .map((e) => `[${e.code}] ${e.field}: ${e.message}`)
      .join('\n');
    throw new Error(
      `Errores de validación en los datos de la nómina:\n${errorMessages}`
    );
  }

  // Validar IRPF (genera warnings, no errores bloqueantes)
  const irpfWarnings = validateIRPFPercentage(employee.irpfPercentage);
  allWarnings.push(...irpfWarnings);

  // ─── PASO 2: Cálculo de horas extras ───
  // Controla el límite anual de 80h y desglosa normales/excedentes/fuerza mayor
  const overtimeResult: OvertimeCalculationResult = calculateOvertime(variables, config);
  allWarnings.push(...overtimeResult.warnings);

  // ─── PASO 3: Cálculo de bases de cotización ───
  // Base CC = devengos salariales + prorrata pagas extras (ajustada a topes)
  // Base CP = Base CC + horas extras (ajustada a topes)
  const basesResult: BasesCalculationResult = calculateBases(employee, variables, config);

  // ─── PASO 4: Cálculo de Incapacidad Temporal (si aplica) ───
  let itResult: ITCalculationResult | null = null;
  let itCompanyBenefit = 0;
  let itSSBenefit = 0;
  let salaryDeductionForIT = 0;

  if (variables.temporaryDisability?.active) {
    const dailySalary = calculateDailySalary(
      employee.baseSalaryMonthly,
      employee.fixedComplements,
      variables.calendarDaysInMonth
    );

    const dailyRegulatoryBase =
      variables.temporaryDisability.dailyRegulatoryBaseOverride && variables.temporaryDisability.dailyRegulatoryBaseOverride > 0
        ? variables.temporaryDisability.dailyRegulatoryBaseOverride
        : basesResult.baseReguladoraIT;

    itResult = calculateIT(
      variables.temporaryDisability,
      variables,
      dailyRegulatoryBase,
      dailySalary
    );

    itCompanyBenefit = itResult.companyBenefitAmount;
    itSSBenefit = itResult.ssBenefitAmount;
    salaryDeductionForIT = itResult.salaryDeductionForIT;
  }

  // ─── PASO 5a: Ajustes de salario por ERTE y permisos no retribuidos ───
  const monthlySalaryBaseForReduction = round2(
    employee.baseSalaryMonthly + employee.fixedComplements,
  );
  const erteComp = calculateErte(variables.erte, monthlySalaryBaseForReduction, variables.calendarDaysInMonth);
  let erteDetail: ErteDetail | undefined = erteComp ? { ...erteComp.detail } : undefined;

  const unpaidLeaveDays = Math.max(0, variables.unpaidLeaveDays ?? 0);
  const unpaidLeaveReduction = unpaidLeaveDays > 0
    ? round2((monthlySalaryBaseForReduction * unpaidLeaveDays) / variables.calendarDaysInMonth)
    : 0;
  if (unpaidLeaveReduction > 0) {
    allWarnings.push(
      `${unpaidLeaveDays} día(s) de permiso no retribuido: se descuentan ${unpaidLeaveReduction.toFixed(2)}€.`,
    );
  }

  const extraSalaryReduction = round2((erteComp?.salaryReduction ?? 0) + unpaidLeaveReduction);

  // ─── PASO 5b: Salario en especie ───
  const inKind = calculateInKind(variables.inKind, employee.irpfPercentage);

  // ─── PASO 5c: Cálculo de devengos ───
  const proratedBonuses = calculateProratedBonuses(employee);
  const accruals = calculateAccruals(
    employee,
    variables,
    overtimeResult,
    proratedBonuses,
    itCompanyBenefit,
    itSSBenefit,
    variables.temporaryDisability?.agreementComplementAmount ?? 0,
    salaryDeductionForIT,
    extraSalaryReduction,
    inKind.amount,
  );

  // Las deducciones porcentuales se liquidan sobre el mismo devengado
  // salarial que se usa para IRPF, de forma que preview, PDF y nómina
  // muestran una única base de cálculo.
  const cotizationBase = round2(accruals.totalSalaryAccruals);
  const cotizationBases: BasesCalculationResult = {
    ...basesResult,
    baseCC: cotizationBase,
    baseCP: cotizationBase,
    baseIRPF: cotizationBase,
  };

  // ─── PASO 6: Cotizaciones del trabajador ───
  const workerCotizations: WorkerCotizationResult = calculateWorkerCotizations(
    cotizationBases,
    employee.contractType,
    config
  );

  // ─── PASO 6b: Cotización adicional de solidaridad (exceso de base máxima) ───
  const solidarity: SolidarityDetail | null = calculateSolidarity(cotizationBase, config);
  const workerSolidarity = solidarity?.worker ?? 0;
  const companySolidarity = solidarity?.company ?? 0;
  if (solidarity) {
    allWarnings.push(
      `Base de cotización (${cotizationBase.toFixed(2)}€) supera la base máxima: ` +
      `se aplica cotización adicional de solidaridad (trab. ${workerSolidarity.toFixed(2)}€ / emp. ${companySolidarity.toFixed(2)}€).`,
    );
  }

  // ─── PASO 7: Retención IRPF ───
  // El IRPF dinerario se calcula sobre los devengos salariales en metálico
  // (excluida la valoración en especie, que genera ingreso a cuenta aparte).
  const cashSalaryAccruals = round2(accruals.totalSalaryAccruals - inKind.amount);
  const irpfAmount = calculateIRPF(cashSalaryAccruals, employee.irpfPercentage);

  // ─── PASO 8: Cotizaciones de la empresa ───
  const companyCotizations: CompanyCotizationResult = calculateCompanyCotizations(
    cotizationBases,
    employee.contractType,
    config
  );

  // Exoneración de cuota empresarial por ERTE.
  const erteCompanyExemption = erteComp
    ? round2(companyCotizations.totalCompanySS * erteComp.companyExemptionFactor)
    : 0;
  if (erteDetail) erteDetail.companyExemption = erteCompanyExemption;

  // ─── PASO 9: Ensamblar deducciones del trabajador (sin embargo aún) ───
  const workerDeductionsBeforeGarnishment = round2(
    workerCotizations.totalSS +
    workerSolidarity +
    irpfAmount +
    inKind.deductedValue +
    inKind.ingresoACuentaRepercutido +
    variables.advances +
    variables.otherDeductions
  );
  const netBeforeGarnishment = round2(accruals.totalAccruals - workerDeductionsBeforeGarnishment);

  // ─── PASO 9b: Embargo (Art. 607 LEC) sobre el líquido ───
  const garnishmentDetail: GarnishmentDetail | null = variables.garnishment
    ? calculateGarnishment(netBeforeGarnishment, config.smiMonthly, variables.garnishment)
    : null;
  const garnishmentAmount = garnishmentDetail?.total ?? 0;
  if (garnishmentDetail && garnishmentAmount > 0) {
    allWarnings.push(
      `Embargo aplicado: ${garnishmentAmount.toFixed(2)}€ (inembargable ${config.smiMonthly.toFixed(2)}€).`,
    );
  }

  const workerDeductions: WorkerDeductions = {
    contingenciasComunes: workerCotizations.contingenciasComunes,
    desempleo: workerCotizations.desempleo,
    formacionProfesional: workerCotizations.formacionProfesional,
    mei: workerCotizations.mei,
    horasExtrasNormales: workerCotizations.horasExtrasNormales,
    horasExtrasFuerzaMayor: workerCotizations.horasExtrasFuerzaMayor,
    solidaridad: workerSolidarity,
    totalSS: round2(workerCotizations.totalSS + workerSolidarity),
    irpf: irpfAmount,
    inKindValue: inKind.deductedValue,
    inKindIngresoACuenta: inKind.ingresoACuentaRepercutido,
    advances: round2(variables.advances),
    garnishment: garnishmentAmount,
    otherDeductions: round2(variables.otherDeductions),
    totalDeductions: round2(workerDeductionsBeforeGarnishment + garnishmentAmount),
  };

  // ─── PASO 10: Ensamblar aportaciones de la empresa ───
  const companyBonifications = round2(employee.companyBonifications ?? 0);
  const companyTotalGross = round2(
    companyCotizations.totalCompanySS +
    companySolidarity +
    inKind.ingresoACuentaEmpresa
  );
  const companyTotalNet = round2(
    companyTotalGross - companyBonifications - erteCompanyExemption,
  );
  const companyDeductions: CompanyDeductions = {
    contingenciasComunes: companyCotizations.contingenciasComunes,
    atEp: companyCotizations.atEp,
    desempleo: companyCotizations.desempleo,
    fogasa: companyCotizations.fogasa,
    formacionProfesional: companyCotizations.formacionProfesional,
    mei: companyCotizations.mei,
    horasExtrasNormales: companyCotizations.horasExtrasNormales,
    horasExtrasFuerzaMayor: companyCotizations.horasExtrasFuerzaMayor,
    solidaridad: companySolidarity,
    inKindIngresoACuenta: inKind.ingresoACuentaEmpresa,
    bonifications: companyBonifications,
    totalCompanySS: Math.max(0, companyTotalNet),
  };

  // ─── PASO 11: Bases de cotización para el resultado ───
  const bases: PayslipBases = {
    baseCC: cotizationBases.baseCC,
    baseCP: cotizationBases.baseCP,
    baseOvertimeNormal: basesResult.baseOvertimeNormal,
    baseOvertimeForceMajeure: basesResult.baseOvertimeForceMajeure,
    baseIRPF: cotizationBases.baseIRPF,
    baseReguladoraIT: basesResult.baseReguladoraIT,
  };

  // ─── PASO 12: Salario neto y coste total empresa ───
  // Líquido = Total devengos - Total deducciones trabajador
  const netSalary = round2(accruals.totalAccruals - workerDeductions.totalDeductions);

  // Coste empresa = Devengos salariales brutos + cotizaciones empresa (neto de
  // bonificaciones y exoneraciones). La retribución en especie ya está en los
  // devengos; el ingreso a cuenta a cargo de la empresa es coste adicional.
  const totalCostCompany = round2(
    accruals.totalAccruals - inKind.amount + companyDeductions.totalCompanySS,
  );

  // ─── Ensamblar resultado final ───
  const result: PayslipResult = {
    month,
    year: config.year,
    accruals,
    bases,
    workerDeductions,
    companyDeductions,
    netSalary,
    totalCostCompany,
    warnings: allWarnings,
  };

  // Incluir detalle de IT si aplica
  if (itResult) {
    result.itDetail = itResult.detail;
  }
  if (garnishmentDetail && garnishmentAmount > 0) {
    result.garnishmentDetail = garnishmentDetail;
  }
  if (solidarity) {
    result.solidarityDetail = solidarity;
  }
  if (erteDetail) {
    result.erteDetail = erteDetail;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Cálculo de devengos
// ---------------------------------------------------------------------------

/**
 * Calcula todos los devengos (importes brutos) del mes.
 *
 * Los devengos se dividen en:
 *
 * **Salariales** (cotizan a SS y tributan IRPF):
 * - Salario base (proporcional a días trabajados si hay IT)
 * - Complementos salariales fijos
 * - Comisiones e incentivos
 * - Horas extras (normales + fuerza mayor)
 * - Paga extra (si se paga este mes)
 * - Prestación IT a cargo de la empresa
 * - Otros devengos salariales
 *
 * **No salariales** (exentos de cotización e IRPF):
 * - Complementos no salariales (dietas, transporte exento...)
 * - Prestación IT a cargo de la SS
 * - Otros devengos no salariales
 *
 * @returns Desglose completo de devengos con totales
 */
function calculateAccruals(
  employee: EmployeePayrollInput,
  variables: MonthlyVariablesInput,
  overtime: OvertimeCalculationResult,
  proratedBonuses: number,
  itCompanyBenefit: number,
  itSSBenefit: number,
  itAgreementComplement: number,
  salaryDeductionForIT: number,
  extraSalaryReduction: number = 0,
  inKindAmount: number = 0
): PayslipAccruals {
  // Salario base ajustado por IT, ERTE y permisos no retribuidos:
  // Se descuenta la parte proporcional del salario base (sustituida por la
  // prestación de IT, la prestación por desempleo del ERTE, o sin retribución).
  const baseSalary = round2(employee.baseSalaryMonthly - salaryDeductionForIT - extraSalaryReduction);

  // Complementos salariales fijos (se pagan íntegros aunque haya IT)
  // Nota: algunos convenios descuentan complementos en IT, pero por defecto
  // se mantienen íntegros
  const fixedComplements = round2(employee.fixedComplements);

  // Complementos no salariales
  const nonSalaryComplements = round2(employee.nonSalaryComplements ?? 0);

  // Variables mensuales
  const commissions = round2(variables.commissions);
  const incentives = round2(variables.incentives);

  // Horas extras: importe total (normales dentro de límite + excedentes)
  // Las horas excedentes se retribuyen igual, solo cambia la cotización
  const overtimeNormal = round2(overtime.normalAmount + overtime.excessAmount);
  const overtimeForceMajeure = round2(overtime.forceMajeureAmount);

  // Paga extra (si se paga este mes)
  const bonusPayment = round2(variables.bonusPayment);

  // Otros devengos
  const otherSalaryAccruals = round2(variables.otherSalaryAccruals);
  const otherNonSalaryAccruals = round2(variables.otherNonSalaryAccruals);

  // Salario en especie (cotiza y tributa; se descuenta su valor en deducciones)
  const inKind = round2(Math.max(0, inKindAmount));

  // ─── Totales ───

  // Total devengos salariales (base para cotización e IRPF)
  const totalSalaryAccruals = round2(
    baseSalary +
    fixedComplements +
    commissions +
    incentives +
    overtimeNormal +
    overtimeForceMajeure +
    bonusPayment +
    itCompanyBenefit +
    itAgreementComplement +
    otherSalaryAccruals +
    inKind
  );

  // Total devengos = salariales + no salariales + IT SS
  const totalAccruals = roundUp2(
    totalSalaryAccruals +
    nonSalaryComplements +
    itSSBenefit +
    otherNonSalaryAccruals
  );

  return {
    baseSalary,
    fixedComplements,
    nonSalaryComplements,
    commissions,
    incentives,
    overtimeNormal,
    overtimeForceMajeure,
    bonusPayment,
    proratedBonuses,
    itCompanyBenefit,
    itSSBenefit,
    itAgreementComplement: round2(itAgreementComplement),
    otherSalaryAccruals,
    otherNonSalaryAccruals,
    inKind,
    totalAccruals,
    totalSalaryAccruals,
  };
}

// ---------------------------------------------------------------------------
// Utilidades de conveniencia
// ---------------------------------------------------------------------------

/**
 * Calcula una nómina rápida con valores mínimos de entrada.
 * Útil para estimaciones rápidas o demos.
 *
 * Usa la configuración del año en curso (2025 / 2026…) por defecto y asume:
 * - Jornada completa
 * - Contrato indefinido
 * - Sin horas extras, IT, comisiones ni incentivos
 * - 30 días naturales, todos trabajados
 * - 2 pagas extras
 *
 * @param baseSalary - Salario base mensual bruto (€)
 * @param cotizationGroup - Grupo de cotización (1-11)
 * @param irpfPercentage - Porcentaje de IRPF (ej: 15.0)
 * @param fixedComplements - Complementos fijos mensuales (€), default 0
 * @returns PayslipResult completo
 */
export function calculateQuickPayslip(
  baseSalary: number,
  cotizationGroup: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11,
  irpfPercentage: number,
  fixedComplements: number = 0
): PayslipResult {
  const employee: EmployeePayrollInput = {
    baseSalaryMonthly: baseSalary,
    cotizationGroup,
    irpfPercentage,
    fixedComplements,
    proratedBonuses: round2((baseSalary * 2) / 12),
    numberOfBonuses: 2,
    contractType: 'INDEFINIDO' as any,
    workdayType: 'COMPLETA' as any,
    partTimeCoefficient: 1,
  };

  const variables: MonthlyVariablesInput = {
    calendarDaysInMonth: 30,
    workedDays: 30,
    overtimeHours: 0,
    overtimeAmount: 0,
    overtimeForceMajeureHours: 0,
    overtimeForceMajeureAmount: 0,
    accumulatedOvertimeHoursYear: 0,
    vacationDays: 0,
    commissions: 0,
    incentives: 0,
    bonusPayment: 0,
    advances: 0,
    otherSalaryAccruals: 0,
    otherNonSalaryAccruals: 0,
    otherDeductions: 0,
  };

  return calculatePayslip(employee, variables, getDefaultPayrollConfig(new Date().getFullYear()));
}

/**
 * Devuelve un resumen legible de la nómina calculada.
 * Útil para depuración y logs.
 *
 * @param result - Resultado de calculatePayslip()
 * @returns String formateado con el resumen
 */
export function formatPayslipSummary(result: PayslipResult): string {
  const lines: string[] = [
    `═══════════════════════════════════════════════════`,
    `  NÓMINA — ${String(result.month).padStart(2, '0')}/${result.year}`,
    `═══════════════════════════════════════════════════`,
    ``,
    `── DEVENGOS ──`,
    `  Salario base:          ${fmt(result.accruals.baseSalary)}`,
    `  Complementos fijos:    ${fmt(result.accruals.fixedComplements)}`,
    `  Comisiones:            ${fmt(result.accruals.commissions)}`,
    `  Incentivos:            ${fmt(result.accruals.incentives)}`,
    `  HE normales:           ${fmt(result.accruals.overtimeNormal)}`,
    `  HE fuerza mayor:       ${fmt(result.accruals.overtimeForceMajeure)}`,
    `  Paga extra:            ${fmt(result.accruals.bonusPayment)}`,
    `  IT empresa:            ${fmt(result.accruals.itCompanyBenefit)}`,
    `  IT SS:                 ${fmt(result.accruals.itSSBenefit)}`,
    `  Comp. no salariales:   ${fmt(result.accruals.nonSalaryComplements)}`,
    `  Otros salariales:      ${fmt(result.accruals.otherSalaryAccruals)}`,
    `  Otros no salariales:   ${fmt(result.accruals.otherNonSalaryAccruals)}`,
    `  ─────────────────────────────────`,
    `  TOTAL DEVENGOS:        ${fmt(result.accruals.totalAccruals)}`,
    ``,
    `── BASES DE COTIZACIÓN ──`,
    `  Base CC:               ${fmt(result.bases.baseCC)}`,
    `  Base CP:               ${fmt(result.bases.baseCP)}`,
    `  Base HE normales:      ${fmt(result.bases.baseOvertimeNormal)}`,
    `  Base HE fuerza mayor:  ${fmt(result.bases.baseOvertimeForceMajeure)}`,
    `  Base IRPF:             ${fmt(result.bases.baseIRPF)}`,
    `  Base reguladora IT:    ${fmt(result.bases.baseReguladoraIT)}`,
    ``,
    `── DEDUCCIONES TRABAJADOR ──`,
    `  CC (4,70%):            ${fmt(result.workerDeductions.contingenciasComunes)}`,
    `  Desempleo:             ${fmt(result.workerDeductions.desempleo)}`,
    `  FP (0,10%):            ${fmt(result.workerDeductions.formacionProfesional)}`,
    `  MEI (0,12%):           ${fmt(result.workerDeductions.mei)}`,
    `  HE normales:           ${fmt(result.workerDeductions.horasExtrasNormales)}`,
    `  HE fuerza mayor:       ${fmt(result.workerDeductions.horasExtrasFuerzaMayor)}`,
    `  Total SS trabajador:   ${fmt(result.workerDeductions.totalSS)}`,
    `  IRPF:                  ${fmt(result.workerDeductions.irpf)}`,
    `  Anticipos:             ${fmt(result.workerDeductions.advances)}`,
    `  Otras deducciones:     ${fmt(result.workerDeductions.otherDeductions)}`,
    `  ─────────────────────────────────`,
    `  TOTAL DEDUCCIONES:     ${fmt(result.workerDeductions.totalDeductions)}`,
    ``,
    `── APORTACIONES EMPRESA ──`,
    `  CC (23,60%):           ${fmt(result.companyDeductions.contingenciasComunes)}`,
    `  AT/EP:                 ${fmt(result.companyDeductions.atEp)}`,
    `  Desempleo:             ${fmt(result.companyDeductions.desempleo)}`,
    `  FOGASA (0,20%):        ${fmt(result.companyDeductions.fogasa)}`,
    `  FP (0,60%):            ${fmt(result.companyDeductions.formacionProfesional)}`,
    `  MEI (0,58%):           ${fmt(result.companyDeductions.mei)}`,
    `  HE normales:           ${fmt(result.companyDeductions.horasExtrasNormales)}`,
    `  HE fuerza mayor:       ${fmt(result.companyDeductions.horasExtrasFuerzaMayor)}`,
    `  ─────────────────────────────────`,
    `  TOTAL EMPRESA:         ${fmt(result.companyDeductions.totalCompanySS)}`,
    ``,
    `══════════════════════════════════════════════`,
    `  LÍQUIDO A PERCIBIR:    ${fmt(result.netSalary)}`,
    `  COSTE TOTAL EMPRESA:   ${fmt(result.totalCostCompany)}`,
    `══════════════════════════════════════════════`,
  ];

  // Añadir detalle de IT si aplica
  if (result.itDetail) {
    lines.push(
      ``,
      `── DETALLE IT ──`,
      `  Días sin prestación:   ${result.itDetail.daysNoBenefit}`,
      `  Días empresa:          ${result.itDetail.daysCompanyPays}`,
      `  Días SS:               ${result.itDetail.daysSSPays}`,
      `  Importe empresa:       ${fmt(result.itDetail.companyBenefitAmount)}`,
      `  Importe SS:            ${fmt(result.itDetail.ssBenefitAmount)}`,
      `  Base reguladora/día:   ${fmt(result.itDetail.dailyRegulatoryBase)}`,
      `  Porcentaje aplicado:   ${result.itDetail.percentageApplied}%`
    );
  }

  // Añadir warnings
  if (result.warnings.length > 0) {
    lines.push(
      ``,
      `── AVISOS ──`,
      ...result.warnings.map((w) => `  ⚠ ${w}`)
    );
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/**
 * Formatea un número como importe en euros con 2 decimales.
 * Ej: 1234.56 → "1.234,56 €"
 */
function fmt(value: number): string {
  return (
    value.toLocaleString('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' €'
  );
}
