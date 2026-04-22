// ============================================================================
// @vacly/payroll-core — tipos compartidos entre apps
// ============================================================================

export interface AgreementLookup {
  /** id de la asignación en company_convenios */
  assignmentId: string;
  /** v3_docs.id del convenio usado como fuente */
  docId: string;
  /** provincia por defecto configurada en company_convenios */
  provinceDefault: string | null;
  docTitle: string | null;
  docFilename: string | null;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  priority: number;
}

export interface SeniorityRule {
  /** 3 = trienio, 4 = cuatrienio, 2 = bienio */
  periodYears: number;
  /** % sobre salario base (o base + complementos, según convenio) */
  percent: number;
  /** Conceptos sobre los que se aplica el % (texto libre del convenio) */
  baseConcepts: string[];
  capPercent: number | null;
  capYears: number | null;
  /** Clave / label del input v3 que lo resolvió (para trazabilidad/UI) */
  sourceKey?: string | null;
  sourceLabel?: string | null;
}

export interface ExtraPay {
  name: string;
  days: number | null;
  accrualPeriod: string | null;
  paymentDate: string | null;
  baseConcepts: string[];
}

export interface Plus {
  concepto: string;
  importe: number;
  year: number | null;
  province: string | null;
}

export interface LicenciaRetribuida {
  tipo: string;
  dias: number | null;
  descripcion: string | null;
  sourceKind: 'table' | 'input';
  sourceId: string;
}

export interface AgreementContext {
  lookup: AgreementLookup;
  /** Provincia resuelta (override > default). */
  province: string;
  salarioBaseMes: number | null;
  /** Metadatos del salario base: grupo/nivel/categoría realmente matcheados. */
  salarioBaseMeta: {
    grupo: string | null;
    nivel: string | null;
    categoria: string | null;
    sourceTableId: string | null;
    confidence: number | null;
  } | null;
  seniority: SeniorityRule | null;
  extraPays: ExtraPay[];
  pluses: Plus[];
  licencias: LicenciaRetribuida[];
  numberOfBonuses: number;
  /** Avisos no bloqueantes que la UI debe mostrar. */
  warnings: string[];
}

export interface ResolveAgreementInput {
  companyId: string;
  onDate: string;
  province?: string | null;
  year?: number;
  grupo?: string | null;
  nivel?: string | null;
  categoria?: string | null;
  /** Si se fuerza un doc_id concreto (override desde el contrato). */
  docIdOverride?: string | null;
}

export class AgreementOutOfForceError extends Error {
  constructor(
    public readonly docId: string,
    public readonly effectiveFrom: string | null,
    public readonly effectiveTo: string | null,
    public readonly onDate: string,
  ) {
    super(
      `El convenio ${docId} no está en vigor para ${onDate} ` +
        `(vigencia: ${effectiveFrom ?? 'n/a'} → ${effectiveTo ?? 'n/a'}).`,
    );
    this.name = 'AgreementOutOfForceError';
  }
}

export class AgreementNotAssignedError extends Error {
  constructor(public readonly companyId: string) {
    super(
      `La empresa ${companyId} no tiene convenio asignado (company_convenios vacío para la fecha indicada).`,
    );
    this.name = 'AgreementNotAssignedError';
  }
}
