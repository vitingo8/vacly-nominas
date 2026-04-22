// ============================================================================
// resolver.ts — Resuelve el contexto de un convenio colectivo para nómina
// ============================================================================
//
// Lee el convenio asignado a la empresa desde Supabase (canonical layer
// definida en migration 20260422_agreements_canonical.sql) y devuelve un
// AgreementContext totalmente tipado para alimentar al motor de cálculo.
//
// Ningún valor se asume: si la información no existe en la BD, se propaga
// como null y el caller decide si bloquear o continuar.
//
// Todas las consultas usan RPCs SECURITY INVOKER que respetan RLS.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface AgreementLookup {
  agreementId: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  inForce: boolean;
  provinceDefault: string | null;
  scope: Record<string, unknown> | null;
}

export interface SeniorityRule {
  periodYears: number;      // 3 = trienio, 4 = cuatrienio…
  percent: number;          // % sobre salario base (o base+compl. según convenio)
  baseConcepts: string[];   // conceptos sobre los que se aplica el %
  capPercent: number | null;
  capYears: number | null;
}

export interface ExtraPay {
  name: string;
  days: number | null;         // días de devengo si están definidos
  accrualPeriod: string | null;
  paymentDate: string | null;  // ej. "30 marzo"
  baseConcepts: string[];      // conceptos que componen la paga
}

export interface Plus {
  concepto: string;
  importe: number;
  year: number | null;
  province: string | null;
}

export interface AgreementContext {
  lookup: AgreementLookup;
  province: string;            // provincia resuelta (override > default)
  salarioBaseMes: number | null;
  seniority: SeniorityRule | null;
  extraPays: ExtraPay[];
  pluses: Plus[];
  numberOfBonuses: number;     // derivado de extraPays.length (mín 2 por ET)
  warnings: string[];          // avisos no bloqueantes
}

export interface ResolveAgreementInput {
  companyId: string;
  onDate: string;              // ISO yyyy-mm-dd (fecha del periodo)
  province?: string | null;    // override explícito (contrato/centro)
  year?: number;
  grupo?: string | null;
  nivel?: string | null;
  categoria?: string | null;
}

export class AgreementOutOfForceError extends Error {
  constructor(
    public readonly agreementId: string,
    public readonly effectiveFrom: string | null,
    public readonly effectiveTo: string | null,
    public readonly onDate: string,
  ) {
    super(
      `El convenio ${agreementId} no está en vigor para ${onDate} ` +
      `(vigencia: ${effectiveFrom ?? 'n/a'} → ${effectiveTo ?? 'n/a'}). ` +
      `Política vigente: bloquear generación fuera de ultraactividad.`,
    );
    this.name = 'AgreementOutOfForceError';
  }
}

export class AgreementNotAssignedError extends Error {
  constructor(public readonly companyId: string) {
    super(`La empresa ${companyId} no tiene convenio asignado para la fecha indicada.`);
    this.name = 'AgreementNotAssignedError';
  }
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function splitConcepts(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/[,;+/]|\sy\s/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Lookup del convenio activo para una empresa/fecha
// ---------------------------------------------------------------------------

export async function fetchAgreementForCompany(
  supabase: SupabaseClient,
  companyId: string,
  onDate: string,
): Promise<AgreementLookup | null> {
  const { data, error } = await supabase.rpc('fn_agreement_for_company', {
    p_company_id: companyId,
    p_on_date: onDate,
  });

  if (error) {
    throw new Error(`fn_agreement_for_company: ${error.message}`);
  }
  if (!data || (Array.isArray(data) && data.length === 0)) {
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    agreementId: row.agreement_id,
    effectiveFrom: row.effective_from ?? null,
    effectiveTo: row.effective_to ?? null,
    inForce: row.in_force === true,
    provinceDefault: row.default_province ?? null,
    scope: row.scope ?? null,
  };
}

// ---------------------------------------------------------------------------
// Salario base por grupo/nivel/categoría
// ---------------------------------------------------------------------------

export async function fetchSalaryBase(
  supabase: SupabaseClient,
  params: {
    agreementId: string;
    province: string;
    year: number;
    grupo?: string | null;
    nivel?: string | null;
    categoria?: string | null;
  },
): Promise<number | null> {
  const { data, error } = await supabase.rpc('fn_resolve_salary_base', {
    p_agreement_id: params.agreementId,
    p_province: params.province,
    p_year: params.year,
    p_grupo: params.grupo ?? null,
    p_nivel: params.nivel ?? null,
    p_categoria: params.categoria ?? null,
  });

  if (error) {
    throw new Error(`fn_resolve_salary_base: ${error.message}`);
  }
  return toNumber(data);
}

// ---------------------------------------------------------------------------
// Antigüedad
// ---------------------------------------------------------------------------

export async function fetchSeniorityRule(
  supabase: SupabaseClient,
  agreementId: string,
  province: string,
): Promise<SeniorityRule | null> {
  const { data, error } = await supabase.rpc('fn_resolve_seniority', {
    p_agreement_id: agreementId,
    p_province: province,
  });

  if (error) {
    throw new Error(`fn_resolve_seniority: ${error.message}`);
  }
  if (!data || (Array.isArray(data) && data.length === 0)) {
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  const period = toNumber(row.period_years);
  const pct = toNumber(row.percent);
  if (period === null || pct === null) return null;

  return {
    periodYears: period,
    percent: pct,
    baseConcepts: splitConcepts(row.base_concepts),
    capPercent: toNumber(row.cap_percent),
    capYears: (() => {
      const n = toNumber(row.cap_years);
      return n === null ? null : Math.round(n);
    })(),
  };
}

// ---------------------------------------------------------------------------
// Pagas extraordinarias
// ---------------------------------------------------------------------------

export async function fetchExtraPays(
  supabase: SupabaseClient,
  agreementId: string,
  province: string,
): Promise<ExtraPay[]> {
  const { data, error } = await supabase.rpc('fn_resolve_extra_pays', {
    p_agreement_id: agreementId,
    p_province: province,
  });

  if (error) {
    throw new Error(`fn_resolve_extra_pays: ${error.message}`);
  }
  if (!data) return [];

  const rows = Array.isArray(data) ? data : [data];
  return rows.map((r: any) => ({
    name: String(r.paga_nombre ?? '').trim(),
    days: (() => {
      const n = toNumber(r.dias);
      return n === null ? null : Math.round(n);
    })(),
    accrualPeriod: r.periodo_devengo ?? null,
    paymentDate: r.fecha_pago ?? null,
    baseConcepts: splitConcepts(r.base_concepts_text),
  }));
}

// ---------------------------------------------------------------------------
// Pluses/complementos por provincia y año
// ---------------------------------------------------------------------------

export async function fetchPluses(
  supabase: SupabaseClient,
  agreementId: string,
  province: string,
  year: number,
): Promise<Plus[]> {
  // Usamos la vista directamente para obtener todos los pluses del año.
  // fn_resolve_plus devuelve solo un concepto puntual.
  const { data, error } = await supabase
    .from('agreement_pluses_v')
    .select('concepto, importe, year, province')
    .eq('agreement_id', agreementId)
    .ilike('province', province)
    .lte('year', year)
    .order('year', { ascending: false });

  if (error) {
    throw new Error(`agreement_pluses_v: ${error.message}`);
  }

  // Nos quedamos con el importe más reciente por concepto (año ≤ year)
  const latestByConcept = new Map<string, Plus>();
  for (const row of data ?? []) {
    const concepto = String((row as any).concepto ?? '').trim();
    if (!concepto) continue;
    if (latestByConcept.has(concepto)) continue; // ya tenemos la entrada más reciente
    const importe = toNumber((row as any).importe);
    if (importe === null) continue;
    latestByConcept.set(concepto, {
      concepto,
      importe,
      year: toNumber((row as any).year),
      province: (row as any).province ?? null,
    });
  }
  return Array.from(latestByConcept.values());
}

// ---------------------------------------------------------------------------
// Resolver de alto nivel
// ---------------------------------------------------------------------------

/**
 * Resuelve el contexto completo del convenio para una empresa/fecha/trabajador.
 *
 * - Lanza `AgreementNotAssignedError` si la empresa no tiene convenio vinculado.
 * - Lanza `AgreementOutOfForceError` si el convenio existe pero la fecha está
 *   fuera de vigencia (política de ultraactividad = bloquear).
 *
 * Nunca aplica IPC, nunca devuelve defaults de 2025 y no mezcla datos de otros
 * convenios: todo proviene de las funciones/vistas canonical.
 */
export async function resolveAgreementContext(
  supabase: SupabaseClient,
  input: ResolveAgreementInput,
): Promise<AgreementContext> {
  const warnings: string[] = [];
  const lookup = await fetchAgreementForCompany(
    supabase,
    input.companyId,
    input.onDate,
  );

  if (!lookup) {
    throw new AgreementNotAssignedError(input.companyId);
  }
  if (!lookup.inForce) {
    throw new AgreementOutOfForceError(
      lookup.agreementId,
      lookup.effectiveFrom,
      lookup.effectiveTo,
      input.onDate,
    );
  }

  const province = (input.province ?? lookup.provinceDefault ?? '').trim();
  if (!province) {
    throw new Error(
      `No se pudo determinar la provincia para el convenio ${lookup.agreementId}. ` +
      `Asigna default_province en company_agreement_assignments o pásala en el contrato.`,
    );
  }

  const year = input.year ?? new Date(input.onDate).getUTCFullYear();

  // Ejecuciones en paralelo — ninguna depende de otra.
  const [salarioBaseMes, seniority, extraPays, pluses] = await Promise.all([
    fetchSalaryBase(supabase, {
      agreementId: lookup.agreementId,
      province,
      year,
      grupo: input.grupo ?? null,
      nivel: input.nivel ?? null,
      categoria: input.categoria ?? null,
    }),
    fetchSeniorityRule(supabase, lookup.agreementId, province),
    fetchExtraPays(supabase, lookup.agreementId, province),
    fetchPluses(supabase, lookup.agreementId, province, year),
  ]);

  if (salarioBaseMes === null) {
    warnings.push(
      `No se encontró salario base para ${JSON.stringify({
        province,
        year,
        grupo: input.grupo,
        nivel: input.nivel,
        categoria: input.categoria,
      })}. Se usará el salario acordado del contrato si existe.`,
    );
  }
  if (seniority === null) {
    warnings.push(`Sin regla de antigüedad resuelta para ${province}.`);
  }
  if (extraPays.length === 0) {
    warnings.push(`Sin pagas extraordinarias resueltas para ${province}.`);
  }

  // Por convenio nunca menos de 2 pagas (Art. 31 ET) — pero no inventamos
  // pagas si el convenio declara más, respetamos la cifra real.
  const numberOfBonuses = Math.max(2, extraPays.length);

  return {
    lookup,
    province,
    salarioBaseMes,
    seniority,
    extraPays,
    pluses,
    numberOfBonuses,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Utilidades de cálculo que derivan del contexto
// ---------------------------------------------------------------------------

/**
 * Calcula el importe mensual de antigüedad, aplicando cap si existe.
 *
 * @param context Contexto del convenio (seniority)
 * @param yearsOfService Años completos de servicio del trabajador
 * @param baseAmount Importe sobre el que se aplica el %
 * @returns Importe mensual de antigüedad (€), 0 si no hay regla
 */
export function computeSeniorityAmount(
  context: AgreementContext,
  yearsOfService: number,
  baseAmount: number,
): { amount: number; periodsCompleted: number; percentApplied: number } {
  const rule = context.seniority;
  if (!rule || rule.periodYears <= 0) {
    return { amount: 0, periodsCompleted: 0, percentApplied: 0 };
  }

  let periods = Math.floor(Math.max(0, yearsOfService) / rule.periodYears);

  // Cap por años si el convenio lo establece
  if (rule.capYears !== null && rule.capYears > 0) {
    const maxPeriods = Math.floor(rule.capYears / rule.periodYears);
    periods = Math.min(periods, maxPeriods);
  }

  let pctTotal = periods * rule.percent;

  // Cap porcentual (ej. máximo 60%)
  if (rule.capPercent !== null && rule.capPercent > 0) {
    pctTotal = Math.min(pctTotal, rule.capPercent);
  }

  const amount = Math.round(baseAmount * pctTotal) / 100;
  return { amount, periodsCompleted: periods, percentApplied: pctTotal };
}

/**
 * Extrae el mes de pago de una fecha textual del convenio.
 * Ej. "30 marzo" → 3, "15 julio" → 7, "20 diciembre" → 12.
 * Devuelve null si no se puede interpretar sin ambigüedad.
 */
export function extractPaymentMonth(paymentDate: string | null): number | null {
  if (!paymentDate) return null;
  const normalized = paymentDate
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const months: Record<string, number> = {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, setiembre: 9,
    octubre: 10, noviembre: 11, diciembre: 12,
    verano: 7, navidad: 12,
  };

  for (const [name, num] of Object.entries(months)) {
    if (normalized.includes(name)) return num;
  }
  return null;
}

/**
 * Devuelve las pagas extraordinarias que se devengan o abonan en el mes dado.
 * Usa el texto de fecha de pago; si es null, asume mensualización por prorrateo
 * (la paga no debe aparecer como línea en este mes).
 */
export function getExtraPaysForMonth(
  context: AgreementContext,
  month: number,
): ExtraPay[] {
  return context.extraPays.filter((p) => extractPaymentMonth(p.paymentDate) === month);
}

/**
 * Calcula el importe prorrateado mensual de las pagas extra (para base CC).
 *
 * Fórmula estándar española: (salario base + antigüedad) × nº pagas / 12
 * Si el convenio declara `days` por paga y estos no son estándar, se recalcula
 * proporcionalmente.
 *
 * @param context Contexto del convenio
 * @param monthlyPayBase Salario base + antigüedad mensual
 * @returns Importe mensual de prorrateo
 */
export function computeProratedBonuses(
  context: AgreementContext,
  monthlyPayBase: number,
): number {
  if (context.numberOfBonuses <= 0) return 0;

  // Si todas las pagas declaran días = 30 (o no declaran), usamos la fórmula estándar
  const allStandard = context.extraPays.every(
    (p) => p.days === null || p.days === 30,
  );

  if (allStandard || context.extraPays.length === 0) {
    return Math.round(((monthlyPayBase * context.numberOfBonuses) / 12) * 100) / 100;
  }

  // Fórmula con días específicos: sum(dias_i) / 360 × base
  const totalDays = context.extraPays.reduce((acc, p) => acc + (p.days ?? 30), 0);
  return Math.round((monthlyPayBase * totalDays / 360) * 100) / 100;
}
