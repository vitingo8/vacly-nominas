// ============================================================================
// resolver-v3.ts — Resuelve el contexto del convenio leyendo DIRECTO de v3_*.
//
// Usa los RPCs de la migración 20260423_01_v3_resolver_rpcs.sql:
//   fn_v3_agreement_for_company
//   fn_v3_resolve_salary_base
//   fn_v3_resolve_seniority
//   fn_v3_resolve_extra_pays
//   fn_v3_resolve_plus  (invocación directa solo cuando hace falta un concepto)
//   fn_v3_resolve_licencias
//
// No usa ya las vistas agreement_*_v (eliminadas en la Fase 0).
// ============================================================================

import type { SupabaseClient } from '../supabase-client';
import {
  AgreementContext,
  AgreementLookup,
  AgreementNotAssignedError,
  AgreementOutOfForceError,
  ExtraPay,
  LicenciaRetribuida,
  Plus,
  ResolveAgreementInput,
  SeniorityRule,
} from '../types';

// ---------------------------------------------------------------------------
// Helpers
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

function isInForce(
  effectiveFrom: string | null,
  effectiveTo: string | null,
  onDate: string,
): boolean {
  const d = new Date(onDate).getTime();
  if (Number.isNaN(d)) return false;
  const from = effectiveFrom ? new Date(effectiveFrom).getTime() : -Infinity;
  const to = effectiveTo ? new Date(effectiveTo).getTime() : Infinity;
  return d >= from && d <= to;
}

// ---------------------------------------------------------------------------
// 1) Lookup del convenio asignado a la empresa
// ---------------------------------------------------------------------------

export async function fetchAgreementForCompany(
  supabase: SupabaseClient,
  companyId: string,
  onDate: string,
): Promise<AgreementLookup | null> {
  const { data, error } = await supabase.rpc('fn_v3_agreement_for_company', {
    p_company_id: companyId,
    p_on_date: onDate,
  });

  if (error) {
    throw new Error(`fn_v3_agreement_for_company: ${error.message}`);
  }
  if (!data || (Array.isArray(data) && data.length === 0)) return null;

  const row = Array.isArray(data) ? data[0] : data;
  return {
    assignmentId: row.assignment_id,
    docId: row.doc_id,
    provinceDefault: row.default_province ?? null,
    docTitle: row.doc_title ?? null,
    docFilename: row.doc_filename ?? null,
    isActive: row.is_active === true,
    effectiveFrom: row.effective_from ?? null,
    effectiveTo: row.effective_to ?? null,
    priority: Number(row.priority ?? 0),
  };
}

// ---------------------------------------------------------------------------
// 2) Salario base
// ---------------------------------------------------------------------------

export async function fetchSalaryBase(
  supabase: SupabaseClient,
  params: {
    docId: string;
    province: string;
    year: number;
    grupo: string;
    nivel?: string | null;
    categoria?: string | null;
  },
): Promise<{
  amount: number | null;
  grupo: string | null;
  nivel: string | null;
  categoria: string | null;
  sourceTableId: string | null;
  confidence: number | null;
}> {
  const { data, error } = await supabase.rpc('fn_v3_resolve_salary_base', {
    p_doc_id: params.docId,
    p_province: params.province,
    p_year: params.year,
    p_grupo: params.grupo,
    p_nivel: params.nivel ?? null,
    p_categoria: params.categoria ?? null,
  });

  if (error) {
    throw new Error(`fn_v3_resolve_salary_base: ${error.message}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      amount: null,
      grupo: null,
      nivel: null,
      categoria: null,
      sourceTableId: null,
      confidence: null,
    };
  }
  return {
    amount: toNumber(row.salario_base_mes),
    grupo: row.grupo ?? null,
    nivel: row.nivel ?? null,
    categoria: row.categoria ?? null,
    sourceTableId: row.source_table_id ?? null,
    confidence: toNumber(row.confidence),
  };
}

// ---------------------------------------------------------------------------
// 3) Regla de antigüedad
// ---------------------------------------------------------------------------

export async function fetchSeniorityRule(
  supabase: SupabaseClient,
  docId: string,
  province: string,
): Promise<SeniorityRule | null> {
  const { data, error } = await supabase.rpc('fn_v3_resolve_seniority', {
    p_doc_id: docId,
    p_province: province,
  });

  if (error) {
    throw new Error(`fn_v3_resolve_seniority: ${error.message}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  const period = toNumber(row.period_years);
  const pct = toNumber(row.percent);
  if (period === null || pct === null) return null;

  return {
    periodYears: period,
    percent: pct,
    baseConcepts: [],
    capPercent: null,
    capYears: null,
    sourceKey: row.key ?? null,
    sourceLabel: row.label ?? null,
  };
}

// ---------------------------------------------------------------------------
// 4) Pagas extraordinarias
// ---------------------------------------------------------------------------

export async function fetchExtraPays(
  supabase: SupabaseClient,
  docId: string,
  province: string,
): Promise<ExtraPay[]> {
  const { data, error } = await supabase.rpc('fn_v3_resolve_extra_pays', {
    p_doc_id: docId,
    p_province: province,
  });

  if (error) {
    throw new Error(`fn_v3_resolve_extra_pays: ${error.message}`);
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
// 5) Pluses: fetch vía v3_rrhh_tables directamente
// ---------------------------------------------------------------------------

export async function fetchPluses(
  supabase: SupabaseClient,
  docId: string,
  province: string,
  year: number,
): Promise<Plus[]> {
  const { data, error } = await supabase
    .from('v3_rrhh_tables')
    .select('id, key, rows_json, applicability_json, effective_from, confidence')
    .eq('doc_id', docId)
    .like('key', 'pluses_%');

  if (error) {
    throw new Error(`v3_rrhh_tables.pluses_*: ${error.message}`);
  }

  const provinceLower = province.toLowerCase();
  const latestByConcept = new Map<string, Plus>();

  for (const t of data ?? []) {
    const tableYear = t.effective_from
      ? new Date(t.effective_from).getUTCFullYear()
      : null;
    if (tableYear !== null && tableYear > year) continue;

    const provincesScope: string[] = Array.isArray(
      (t.applicability_json as any)?.provinces,
    )
      ? ((t.applicability_json as any).provinces as string[])
      : [];

    const rows: any[] = Array.isArray(t.rows_json) ? (t.rows_json as any[]) : [];
    for (const row of rows) {
      const rowProv = String(row.provincia ?? '').toLowerCase();
      const matchesProvince =
        provincesScope.some((p) => String(p).toLowerCase() === provinceLower) ||
        rowProv.includes(provinceLower) ||
        provincesScope.length === 0;
      if (!matchesProvince) continue;

      const concepto = String(row.concepto ?? '').trim();
      if (!concepto) continue;

      const importe = toNumber(
        row.importe ?? row.importe_mensual ?? row.importe_unitario,
      );
      if (importe === null) continue;

      // mantenemos la entrada más reciente por concepto
      if (
        !latestByConcept.has(concepto) ||
        (tableYear ?? 0) >
          (latestByConcept.get(concepto)?.year ?? 0)
      ) {
        latestByConcept.set(concepto, {
          concepto,
          importe,
          year: tableYear,
          province,
        });
      }
    }
  }
  return Array.from(latestByConcept.values());
}

// ---------------------------------------------------------------------------
// 6) Licencias retribuidas (para módulo Ausencias)
// ---------------------------------------------------------------------------

export async function fetchLicencias(
  supabase: SupabaseClient,
  docId: string,
  province: string | null = null,
): Promise<LicenciaRetribuida[]> {
  const { data, error } = await supabase.rpc('fn_v3_resolve_licencias', {
    p_doc_id: docId,
    p_province: province,
  });

  if (error) {
    throw new Error(`fn_v3_resolve_licencias: ${error.message}`);
  }
  if (!data) return [];
  const rows = Array.isArray(data) ? data : [data];
  return rows
    .map((r: any) => ({
      tipo: String(r.tipo ?? '').trim(),
      dias: toNumber(r.dias),
      descripcion: r.descripcion ?? null,
      sourceKind: (r.source_kind === 'input' ? 'input' : 'table') as
        | 'table'
        | 'input',
      sourceId: String(r.source_id ?? ''),
    }))
    .filter((l) => l.tipo.length > 0);
}

// ---------------------------------------------------------------------------
// 7) Resolver de alto nivel
// ---------------------------------------------------------------------------

export async function resolveAgreementContext(
  supabase: SupabaseClient,
  input: ResolveAgreementInput,
): Promise<AgreementContext> {
  const warnings: string[] = [];

  // --- 1) Lookup inicial (convenio asignado) ---
  let lookup: AgreementLookup | null = null;
  if (input.docIdOverride) {
    // Si hay override desde el contrato, intentamos leer directamente v3_docs
    const { data, error } = await supabase
      .from('v3_docs')
      .select('id, title, filename')
      .eq('id', input.docIdOverride)
      .maybeSingle();
    if (error) throw new Error(`v3_docs lookup: ${error.message}`);
    if (data) {
      lookup = {
        assignmentId: '',
        docId: data.id,
        provinceDefault: null,
        docTitle: data.title ?? null,
        docFilename: data.filename ?? null,
        isActive: true,
        effectiveFrom: null,
        effectiveTo: null,
        priority: 0,
      };
    }
  }
  if (!lookup) {
    lookup = await fetchAgreementForCompany(supabase, input.companyId, input.onDate);
  }
  if (!lookup) {
    throw new AgreementNotAssignedError(input.companyId);
  }

  // --- 2) Vigencia (solo si la asignación la tiene declarada) ---
  if (
    (lookup.effectiveFrom || lookup.effectiveTo) &&
    !isInForce(lookup.effectiveFrom, lookup.effectiveTo, input.onDate)
  ) {
    throw new AgreementOutOfForceError(
      lookup.docId,
      lookup.effectiveFrom,
      lookup.effectiveTo,
      input.onDate,
    );
  }

  // --- 3) Provincia ---
  const province = (input.province ?? lookup.provinceDefault ?? '').trim();
  if (!province) {
    throw new Error(
      `No se pudo determinar la provincia para el convenio ${lookup.docId}. ` +
        `Configura default_province en company_convenios o pásala en el contrato.`,
    );
  }

  const year = input.year ?? new Date(input.onDate).getUTCFullYear();

  // --- 4) Ejecuciones en paralelo ---
  const [salary, seniority, extraPays, pluses, licencias] = await Promise.all([
    input.grupo
      ? fetchSalaryBase(supabase, {
          docId: lookup.docId,
          province,
          year,
          grupo: input.grupo,
          nivel: input.nivel ?? null,
          categoria: input.categoria ?? null,
        })
      : Promise.resolve({
          amount: null,
          grupo: null,
          nivel: null,
          categoria: null,
          sourceTableId: null,
          confidence: null,
        }),
    fetchSeniorityRule(supabase, lookup.docId, province),
    fetchExtraPays(supabase, lookup.docId, province),
    fetchPluses(supabase, lookup.docId, province, year),
    fetchLicencias(supabase, lookup.docId, province),
  ]);

  if (!input.grupo) {
    warnings.push(
      'No se especificó "grupo" en el contrato: no se puede resolver el salario base automáticamente.',
    );
  } else if (salary.amount === null) {
    warnings.push(
      `Sin fila de salario para (${province}, ${year}, ${input.grupo}/${input.nivel ?? '-'}${input.categoria ? ', ' + input.categoria : ''}).`,
    );
  }
  if (seniority === null) {
    warnings.push(`Sin regla de antigüedad resuelta para ${province}.`);
  }
  if (extraPays.length === 0) {
    warnings.push(`Sin pagas extraordinarias resueltas para ${province}.`);
  }

  const numberOfBonuses = Math.max(2, extraPays.length);

  return {
    lookup,
    province,
    salarioBaseMes: salary.amount,
    salarioBaseMeta: {
      grupo: salary.grupo,
      nivel: salary.nivel,
      categoria: salary.categoria,
      sourceTableId: salary.sourceTableId,
      confidence: salary.confidence,
    },
    seniority,
    extraPays,
    pluses,
    licencias,
    numberOfBonuses,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// 8) Utilidades derivadas (antigüedad, pagas prorrateadas)
// ---------------------------------------------------------------------------

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
  if (rule.capYears !== null && rule.capYears > 0) {
    const maxPeriods = Math.floor(rule.capYears / rule.periodYears);
    periods = Math.min(periods, maxPeriods);
  }
  let pctTotal = periods * rule.percent;
  if (rule.capPercent !== null && rule.capPercent > 0) {
    pctTotal = Math.min(pctTotal, rule.capPercent);
  }
  const amount = Math.round(baseAmount * pctTotal) / 100;
  return { amount, periodsCompleted: periods, percentApplied: pctTotal };
}

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

export function getExtraPaysForMonth(
  context: AgreementContext,
  month: number,
): ExtraPay[] {
  return context.extraPays.filter(
    (p) => extractPaymentMonth(p.paymentDate) === month,
  );
}

export function computeProratedBonuses(
  context: AgreementContext,
  monthlyPayBase: number,
): number {
  if (context.numberOfBonuses <= 0) return 0;
  const allStandard = context.extraPays.every(
    (p) => p.days === null || p.days === 30,
  );
  if (allStandard || context.extraPays.length === 0) {
    return (
      Math.round(((monthlyPayBase * context.numberOfBonuses) / 12) * 100) / 100
    );
  }
  const totalDays = context.extraPays.reduce(
    (acc, p) => acc + (p.days ?? 30),
    0,
  );
  return Math.round(((monthlyPayBase * totalDays) / 360) * 100) / 100;
}
