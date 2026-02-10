// ============================================================================
// tipos.ts — Interfaces y tipos para el motor de cálculo de nóminas españolas
// Legislación española 2025
// ============================================================================

// ---------------------------------------------------------------------------
// Enumeraciones
// ---------------------------------------------------------------------------

/** Grupo de cotización (1-11) según categoría profesional */
export type GrupoCotizacion = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

/** Tipo de contrato laboral */
export enum TipoContrato {
  /** Contrato indefinido (incluye fijos-discontinuos) */
  INDEFINIDO = 'INDEFINIDO',
  /** Contrato temporal / duración determinada */
  TEMPORAL = 'TEMPORAL',
  /** Contrato de formación en alternancia */
  FORMACION = 'FORMACION',
  /** Contrato en prácticas */
  PRACTICAS = 'PRACTICAS',
}

/** Tipo de jornada laboral */
export enum TipoJornada {
  COMPLETA = 'COMPLETA',
  PARCIAL = 'PARCIAL',
}

/** Tipo de contingencia que causa la Incapacidad Temporal */
export enum TipoContingenciaIT {
  /** Enfermedad común / accidente no laboral */
  ENFERMEDAD_COMUN = 'ENFERMEDAD_COMUN',
  /** Accidente de trabajo / enfermedad profesional */
  ACCIDENTE_TRABAJO = 'ACCIDENTE_TRABAJO',
}

// ---------------------------------------------------------------------------
// Entrada: Datos del empleado (fijos mensuales)
// ---------------------------------------------------------------------------

export interface EmployeePayrollInput {
  /** Salario base mensual bruto (€) */
  baseSalaryMonthly: number;

  /** Grupo de cotización (1-11) */
  cotizationGroup: GrupoCotizacion;

  /** Porcentaje de IRPF aplicable (ej: 15.0 para 15%) */
  irpfPercentage: number;

  /**
   * Complementos salariales fijos mensuales (€)
   * Ej: antigüedad, plus convenio, plus transporte salarial...
   * Se incluyen en base de cotización.
   */
  fixedComplements: number;

  /**
   * Importe mensual prorrateado de las pagas extras (€).
   * Si el empleado cobra 2 pagas extras, el prorrateo mensual = (salarioBase * 2) / 12
   * Se usa para calcular la base de cotización por contingencias comunes.
   */
  proratedBonuses: number;

  /** Número de pagas extras al año (normalmente 2 o 3) */
  numberOfBonuses: number;

  /** Tipo de contrato */
  contractType: TipoContrato;

  /** Tipo de jornada */
  workdayType: TipoJornada;

  /**
   * Coeficiente de parcialidad (0-1). Solo aplica si jornada es PARCIAL.
   * Ej: 0.5 = media jornada. Para jornada completa usar 1.
   */
  partTimeCoefficient: number;

  /**
   * Complementos no salariales exentos de cotización (€/mes).
   * Ej: dietas, plus transporte no salarial, indemnizaciones...
   * NO se incluyen en base de cotización.
   */
  nonSalaryComplements?: number;
}

// ---------------------------------------------------------------------------
// Entrada: Variables mensuales
// ---------------------------------------------------------------------------

export interface TemporaryDisabilityInput {
  /** ¿Está de baja por IT este mes? */
  active: boolean;
  /** Tipo de contingencia */
  contingencyType: TipoContingenciaIT;
  /** Día de inicio de la baja (dentro del mes, 1-31) */
  startDay: number;
  /** Día de fin de la baja (dentro del mes, 1-31). Si continúa, poner último día del mes */
  endDay: number;
  /** Día absoluto de la baja (desde el inicio). Ej: si empezó el mes anterior en día 20 y hoy es día 5, sería 15+5=20 */
  absoluteDaysSinceStart: number;
}

export interface MonthlyVariablesInput {
  /** Días naturales del mes (28-31) */
  calendarDaysInMonth: number;

  /** Días efectivamente trabajados en el mes */
  workedDays: number;

  /** Horas extras normales realizadas en el mes */
  overtimeHours: number;

  /** Importe bruto de las horas extras normales (€) */
  overtimeAmount: number;

  /** Horas extras de fuerza mayor realizadas en el mes */
  overtimeForceMajeureHours: number;

  /** Importe bruto de las horas extras de fuerza mayor (€) */
  overtimeForceMajeureAmount: number;

  /** Horas extras normales acumuladas en el año (antes de este mes) */
  accumulatedOvertimeHoursYear: number;

  /** Días de vacaciones disfrutados en el mes */
  vacationDays: number;

  /** Datos de incapacidad temporal (si aplica) */
  temporaryDisability?: TemporaryDisabilityInput;

  /** Comisiones del mes (€) */
  commissions: number;

  /** Incentivos / primas de producción del mes (€) */
  incentives: number;

  /**
   * Importe de paga extra si se paga en este mes (€).
   * 0 si las pagas se prorratean o no toca paga este mes.
   */
  bonusPayment: number;

  /** Anticipos ya entregados al trabajador este mes (€) */
  advances: number;

  /** Otros devengos salariales del mes (€) */
  otherSalaryAccruals: number;

  /** Otros devengos no salariales del mes (€) */
  otherNonSalaryAccruals: number;

  /** Deducciones adicionales del trabajador (préstamos, embargos...) (€) */
  otherDeductions: number;
}

// ---------------------------------------------------------------------------
// Configuración: Parámetros anuales y tipos de cotización
// ---------------------------------------------------------------------------

/** Bases mínimas y máximas por grupo de cotización (€/mes) */
export interface CotizationGroupLimits {
  group: GrupoCotizacion;
  minBase: number;
  maxBase: number;
}

/** Tipos de cotización del trabajador (%) */
export interface WorkerCotizationRates {
  /** Contingencias comunes: 4.70% */
  contingenciasComunes: number;
  /** Desempleo indefinido: 1.55% / temporal: 1.60% */
  desempleoIndefinido: number;
  desempleoTemporal: number;
  /** Formación profesional: 0.10% */
  formacionProfesional: number;
  /** Mecanismo de Equidad Intergeneracional (MEI): 0.12% */
  mei: number;
  /** Horas extras normales: 4.70% (mismo tipo que CC) */
  horasExtrasNormales: number;
  /** Horas extras fuerza mayor: 2.00% */
  horasExtrasFuerzaMayor: number;
}

/** Tipos de cotización de la empresa (%) */
export interface CompanyCotizationRates {
  /** Contingencias comunes: 23.60% */
  contingenciasComunes: number;
  /** Desempleo indefinido: 5.50% / temporal: 6.70% */
  desempleoIndefinido: number;
  desempleoTemporal: number;
  /** FOGASA: 0.20% */
  fogasa: number;
  /** Formación profesional: 0.60% */
  formacionProfesional: number;
  /** Accidentes de trabajo y enfermedades profesionales (AT/EP) - varía por actividad */
  atEp: number;
  /** Mecanismo de Equidad Intergeneracional (MEI): 0.58% */
  mei: number;
  /** Horas extras normales: 23.60% (mismo tipo que CC) */
  horasExtrasNormales: number;
  /** Horas extras fuerza mayor: 12.00% */
  horasExtrasFuerzaMayor: number;
}

export interface PayrollConfigInput {
  /** Año fiscal */
  year: number;

  /** Salario Mínimo Interprofesional mensual (14 pagas) - 2025: 1.184,00€ */
  smiMonthly: number;

  /** Base máxima de cotización mensual - 2025: 4.720,50€ */
  maxCotizationBase: number;

  /** Bases mínimas y máximas por grupo */
  groupLimits: CotizationGroupLimits[];

  /** Tipos de cotización del trabajador */
  workerRates: WorkerCotizationRates;

  /** Tipos de cotización de la empresa */
  companyRates: CompanyCotizationRates;

  /** Límite anual de horas extras normales (80h) */
  maxOvertimeHoursYear: number;
}

// ---------------------------------------------------------------------------
// Resultado: Desglose completo de la nómina
// ---------------------------------------------------------------------------

/** Devengos (importes brutos a favor del trabajador) */
export interface PayslipAccruals {
  /** Salario base del mes */
  baseSalary: number;
  /** Complementos salariales fijos */
  fixedComplements: number;
  /** Complementos no salariales */
  nonSalaryComplements: number;
  /** Comisiones */
  commissions: number;
  /** Incentivos */
  incentives: number;
  /** Horas extras normales */
  overtimeNormal: number;
  /** Horas extras fuerza mayor */
  overtimeForceMajeure: number;
  /** Paga extra (si se paga este mes) */
  bonusPayment: number;
  /** Prorrateo de pagas extras (incluido en base CC) */
  proratedBonuses: number;
  /** Prestación IT a cargo de la empresa */
  itCompanyBenefit: number;
  /** Prestación IT a cargo de la Seguridad Social */
  itSSBenefit: number;
  /** Otros devengos salariales */
  otherSalaryAccruals: number;
  /** Otros devengos no salariales */
  otherNonSalaryAccruals: number;
  /** TOTAL DEVENGOS */
  totalAccruals: number;
  /** Total devengos salariales (sujetos a cotización e IRPF) */
  totalSalaryAccruals: number;
}

/** Bases de cotización calculadas */
export interface PayslipBases {
  /** Base de cotización por contingencias comunes (BCCC) */
  baseCC: number;
  /** Base de cotización por contingencias profesionales (BCP) = BCCC + horas extras */
  baseCP: number;
  /** Base de cotización por horas extras normales */
  baseOvertimeNormal: number;
  /** Base de cotización por horas extras fuerza mayor */
  baseOvertimeForceMajeure: number;
  /** Base sujeta a IRPF */
  baseIRPF: number;
  /** Base reguladora diaria para IT */
  baseReguladoraIT: number;
}

/** Deducciones del trabajador */
export interface WorkerDeductions {
  /** Cotización CC trabajador */
  contingenciasComunes: number;
  /** Cotización desempleo trabajador */
  desempleo: number;
  /** Cotización formación profesional trabajador */
  formacionProfesional: number;
  /** Cotización MEI trabajador */
  mei: number;
  /** Cotización horas extras normales trabajador */
  horasExtrasNormales: number;
  /** Cotización horas extras fuerza mayor trabajador */
  horasExtrasFuerzaMayor: number;
  /** Total cotizaciones SS trabajador */
  totalSS: number;
  /** Retención IRPF */
  irpf: number;
  /** Anticipos */
  advances: number;
  /** Otras deducciones */
  otherDeductions: number;
  /** TOTAL DEDUCCIONES TRABAJADOR */
  totalDeductions: number;
}

/** Aportaciones de la empresa */
export interface CompanyDeductions {
  /** Cotización CC empresa */
  contingenciasComunes: number;
  /** AT/EP empresa */
  atEp: number;
  /** Cotización desempleo empresa */
  desempleo: number;
  /** Cotización FOGASA empresa */
  fogasa: number;
  /** Cotización formación profesional empresa */
  formacionProfesional: number;
  /** Cotización MEI empresa */
  mei: number;
  /** Cotización horas extras normales empresa */
  horasExtrasNormales: number;
  /** Cotización horas extras fuerza mayor empresa */
  horasExtrasFuerzaMayor: number;
  /** TOTAL COTIZACIONES EMPRESA */
  totalCompanySS: number;
}

/** Detalle de IT si aplica */
export interface ITDetail {
  /** Días sin prestación (1-3 enfermedad común) */
  daysNoBenefit: number;
  /** Días a cargo de la empresa */
  daysCompanyPays: number;
  /** Días a cargo de la SS */
  daysSSPays: number;
  /** Importe prestación empresa */
  companyBenefitAmount: number;
  /** Importe prestación SS */
  ssBenefitAmount: number;
  /** Base reguladora diaria usada */
  dailyRegulatoryBase: number;
  /** Porcentaje aplicado */
  percentageApplied: number;
}

/** Resultado completo de la nómina */
export interface PayslipResult {
  /** Período: mes (1-12) */
  month: number;
  /** Período: año */
  year: number;

  /** Devengos */
  accruals: PayslipAccruals;

  /** Bases de cotización */
  bases: PayslipBases;

  /** Deducciones del trabajador */
  workerDeductions: WorkerDeductions;

  /** Aportaciones de la empresa */
  companyDeductions: CompanyDeductions;

  /** Salario neto (líquido a percibir) */
  netSalary: number;

  /** Coste total empresa = salario bruto + cotizaciones empresa */
  totalCostCompany: number;

  /** Detalle de IT (si hay baja en el mes) */
  itDetail?: ITDetail;

  /** Warnings / avisos generados durante el cálculo */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Tipos auxiliares para funciones internas
// ---------------------------------------------------------------------------

/** Resultado intermedio del cálculo de bases */
export interface BasesCalculationResult {
  baseCC: number;
  baseCP: number;
  baseOvertimeNormal: number;
  baseOvertimeForceMajeure: number;
  baseIRPF: number;
  baseReguladoraIT: number;
  warnings: string[];
}

/** Resultado intermedio del cálculo de cotizaciones del trabajador */
export interface WorkerCotizationResult {
  contingenciasComunes: number;
  desempleo: number;
  formacionProfesional: number;
  mei: number;
  horasExtrasNormales: number;
  horasExtrasFuerzaMayor: number;
  totalSS: number;
}

/** Resultado intermedio del cálculo de cotizaciones de la empresa */
export interface CompanyCotizationResult {
  contingenciasComunes: number;
  atEp: number;
  desempleo: number;
  fogasa: number;
  formacionProfesional: number;
  mei: number;
  horasExtrasNormales: number;
  horasExtrasFuerzaMayor: number;
  totalCompanySS: number;
}

/** Resultado intermedio del cálculo de horas extras */
export interface OvertimeCalculationResult {
  /** Importe horas extras normales dentro del límite */
  normalAmount: number;
  /** Importe horas extras fuerza mayor */
  forceMajeureAmount: number;
  /** Horas normales que exceden el límite anual de 80h */
  excessHours: number;
  /** Importe de las horas que exceden el límite (cotización especial) */
  excessAmount: number;
  warnings: string[];
}

/** Resultado intermedio del cálculo de IT */
export interface ITCalculationResult {
  /** Importe a cargo de la empresa */
  companyBenefitAmount: number;
  /** Importe a cargo de la SS */
  ssBenefitAmount: number;
  /** Descuento del salario por días de baja */
  salaryDeductionForIT: number;
  /** Detalle completo */
  detail: ITDetail;
}

/** Errores de validación */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}
