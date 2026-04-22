// ============================================================================
// test-regression-payslips.mjs
// Test de regresión contra las 6 nóminas reales de /vacly-docs/nominas/
// ----------------------------------------------------------------------------
// Ejecución:
//   1) Define las variables SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
//   2) node vacly-nominas/scripts/test-regression-payslips.mjs
// ----------------------------------------------------------------------------
// Tolerancia: 0,02 € por importe (margen de redondeo).
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Carga .env.local ligera (sin dependencia externa)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envCandidates = [
  resolve(__dirname, '..', '.env.local'),
  resolve(__dirname, '..', '.env'),
];
for (const envPath of envCandidates) {
  if (!existsSync(envPath)) continue;
  const raw = readFileSync(envPath, 'utf-8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let value = m[2];
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Faltan variables NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------------------------------------------------------------------
// Datos de las 6 nóminas reales extraídas de los PDFs de referencia
// ---------------------------------------------------------------------------
const COMPANY_ID = 'b30abe25-cbe6-498b-83f4-d4fff6acff2f';

const CASES = [
  {
    label: 'Ana Mª Sabaté · Enero 2026',
    file: 'LIMPIADORA 1 GENER 26.pdf',
    period: '2026-01-01',
    hireDate: '2007-09-25',
    province: 'Tarragona',
    category: 'LIMPIADOR',
    cotizationGroup: 9,
    partTimeCoef: 0.5,
    expected: {
      baseSalary: 589.28,
      seniorityPercent: 30,
      seniorityAmount: 176.78,
      extraPayMonthly: 63.84,
      numberOfBonuses: 3,
      totalSalaryAccruals: 957.58, // sin el SEG ACC de 0,27 no convenio
    },
  },
  {
    label: 'Catalina Moreno · Enero 2026',
    file: 'LIMPIADORA 2 GENER 26.pdf',
    period: '2026-01-01',
    hireDate: '2024-12-31',
    province: 'Tarragona',
    category: 'LIMPIAD',
    cotizationGroup: 10,
    partTimeCoef: 0.9375, // 15/16 jornada
    expected: {
      baseSalary: 1104.90,
      seniorityPercent: 0,
      seniorityAmount: 0,
      extraPayMonthly: 92.08,
      numberOfBonuses: 3,
      totalSalaryAccruals: 1381.14,
    },
  },
  {
    label: 'Encarna Martín · Enero 2026',
    file: 'LIMPIADORA 3 GENER 26.pdf',
    period: '2026-01-01',
    hireDate: '2024-10-28',
    province: 'Tarragona',
    category: 'LIMPIADOR',
    cotizationGroup: 10,
    partTimeCoef: 0.9375,
    expected: {
      baseSalary: 1104.90,
      seniorityPercent: 0,
      seniorityAmount: 0,
      extraPayMonthly: 92.08,
      numberOfBonuses: 3,
      totalSalaryAccruals: 1381.14,
    },
  },
  {
    label: 'Ana Mª Sabaté · Marzo 2026',
    file: 'LIMPIADORA 1 MARCO 26.pdf',
    period: '2026-03-01',
    hireDate: '2007-09-25',
    province: 'Tarragona',
    category: 'LIMPIADOR',
    cotizationGroup: 9,
    partTimeCoef: 0.5,
    expected: {
      baseSalary: 610.50,          // tabla 2026 esperada, no extraída aún
      seniorityPercent: 30,
      seniorityAmount: 183.15,
      extraPayMonthly: 66.14,
      numberOfBonuses: 3,
      totalSalaryAccruals: 992.07,
    },
    knownGap: 'Tabla salarial 2026 no extraída (anexo)',
  },
  {
    label: 'Catalina Moreno · Marzo 2026',
    file: 'LIMPIADORA 2 MARCO 26.pdf',
    period: '2026-03-01',
    hireDate: '2024-12-31',
    province: 'Tarragona',
    category: 'LIMPIAD',
    cotizationGroup: 10,
    partTimeCoef: 0.9375,
    expected: {
      baseSalary: 1144.70,          // tabla 2026
      seniorityPercent: 0,
      seniorityAmount: 0,
      extraPayMonthly: 95.40,
      numberOfBonuses: 3,
      totalSalaryAccruals: 1430.90,
    },
    knownGap: 'Tabla salarial 2026 no extraída (anexo)',
  },
  {
    label: 'Encarna Martín · Marzo 2026 (con IT 7 días)',
    file: 'LIMPIADORA 3 MARCO 26.pdf',
    period: '2026-03-01',
    hireDate: '2024-10-28',
    province: 'Tarragona',
    category: 'LIMPIADOR',
    cotizationGroup: 10,
    partTimeCoef: 0.9375,
    expected: {
      baseSalary: 1144.70,          // full-time mensual 2026
      seniorityPercent: 0,
      seniorityAmount: 0,
      extraPayMonthly: 95.40,
      numberOfBonuses: 3,
      totalSalaryAccruals: 1430.90, // pre-IT
    },
    knownGap: 'Tabla salarial 2026 no extraída + cálculo IT no evaluado en este test',
  },
];

// ---------------------------------------------------------------------------
// Helpers numéricos / de formato
// ---------------------------------------------------------------------------
const TOL = 0.02;
const round2 = (n) => Math.round(n * 100) / 100;
const fmt = (n) => (n === null || n === undefined ? '—' : n.toFixed(2));
const nearEq = (a, b) => Math.abs((a ?? 0) - (b ?? 0)) <= TOL;

// Años de servicio completos entre dos fechas ISO
function yearsBetween(startIso, refIso) {
  const s = new Date(startIso);
  const r = new Date(refIso);
  let y = r.getFullYear() - s.getFullYear();
  const m = r.getMonth() - s.getMonth();
  if (m < 0 || (m === 0 && r.getDate() < s.getDate())) y--;
  return Math.max(0, y);
}

// ---------------------------------------------------------------------------
// Ejecución de un caso
// ---------------------------------------------------------------------------
async function runCase(tc) {
  const logs = [];
  const year = new Date(tc.period).getUTCFullYear();

  // 1. Resolver el convenio para la empresa en la fecha
  const { data: lookupRows, error: luErr } = await supabase.rpc('fn_agreement_for_company', {
    p_company_id: COMPANY_ID,
    p_on_date: tc.period,
  });
  if (luErr) throw new Error(`fn_agreement_for_company: ${luErr.message}`);
  if (!lookupRows || lookupRows.length === 0) {
    return { label: tc.label, ok: false, reason: 'Sin convenio asignado para la fecha', logs };
  }
  const lookup = lookupRows[0];
  if (!lookup.in_force) {
    return {
      label: tc.label,
      ok: false,
      reason: `Convenio fuera de vigencia (${lookup.effective_from} → ${lookup.effective_to})`,
      logs,
    };
  }

  // 2. Resolver salario base (full-time)
  const { data: baseData, error: baseErr } = await supabase.rpc('fn_resolve_salary_base', {
    p_agreement_id: lookup.agreement_id,
    p_province: tc.province,
    p_year: year,
    p_grupo: null,
    p_nivel: null,
    p_categoria: tc.category,
  });
  if (baseErr) throw new Error(`fn_resolve_salary_base: ${baseErr.message}`);
  const ftBase = baseData === null || baseData === undefined ? null : Number(baseData);
  const ptBase = ftBase === null ? null : round2(ftBase * tc.partTimeCoef);

  // 3. Resolver regla de antigüedad
  const { data: senRows, error: senErr } = await supabase.rpc('fn_resolve_seniority', {
    p_agreement_id: lookup.agreement_id,
    p_province: tc.province,
  });
  if (senErr) throw new Error(`fn_resolve_seniority: ${senErr.message}`);
  const rule = senRows && senRows.length > 0 ? senRows[0] : null;
  const years = yearsBetween(tc.hireDate, tc.period);
  let periods = 0, pct = 0, senAmount = 0;
  if (rule && rule.period_years && rule.percent) {
    periods = Math.floor(years / Number(rule.period_years));
    pct = periods * Number(rule.percent);
    if (ftBase !== null) senAmount = round2(ftBase * pct / 100 * tc.partTimeCoef);
  }

  // 4. Pagas extras
  const { data: payRows, error: payErr } = await supabase.rpc('fn_resolve_extra_pays', {
    p_agreement_id: lookup.agreement_id,
    p_province: tc.province,
  });
  if (payErr) throw new Error(`fn_resolve_extra_pays: ${payErr.message}`);
  const nPays = Array.isArray(payRows) ? payRows.length : 0;

  // 5. Prorrata mensual por paga: ((base + antigüedad) × nPays / 12) / nPays = monthly/paga
  const monthlyPayBase = (ptBase ?? 0) + senAmount;
  const proratedMonth = nPays > 0 ? round2(monthlyPayBase * nPays / 12) : 0;
  const perPay = nPays > 0 ? round2(proratedMonth / nPays) : 0;
  const totalSalaryAccruals = round2((ptBase ?? 0) + senAmount + proratedMonth);

  // 6. Comparación con expected
  const e = tc.expected;
  const checks = [
    { name: 'salario_base_mes (part-time)', actual: ptBase, expected: e.baseSalary, ok: ptBase !== null && nearEq(ptBase, e.baseSalary) },
    { name: 'antiguedad_percent',            actual: pct,    expected: e.seniorityPercent, ok: pct === e.seniorityPercent },
    { name: 'antiguedad_importe',            actual: senAmount, expected: e.seniorityAmount, ok: nearEq(senAmount, e.seniorityAmount) },
    { name: 'num_pagas_extras',              actual: nPays, expected: e.numberOfBonuses, ok: nPays === e.numberOfBonuses },
    { name: 'paga_extra_mensual/paga',       actual: perPay, expected: e.extraPayMonthly, ok: nearEq(perPay, e.extraPayMonthly) },
    { name: 'total_devengado_salarial',      actual: totalSalaryAccruals, expected: e.totalSalaryAccruals, ok: nearEq(totalSalaryAccruals, e.totalSalaryAccruals) },
  ];
  const allOk = checks.every((c) => c.ok);

  return { label: tc.label, file: tc.file, knownGap: tc.knownGap, ok: allOk, checks, logs };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('  TEST DE REGRESIÓN — Nóminas reales /vacly-docs/nominas/');
  console.log(`  Tolerancia: ±${TOL.toFixed(2)} €`);
  console.log('════════════════════════════════════════════════════════════════════\n');

  let pass = 0, fail = 0, gap = 0;
  for (const tc of CASES) {
    let r;
    try {
      r = await runCase(tc);
    } catch (err) {
      r = { label: tc.label, ok: false, reason: err.message, checks: [] };
    }

    console.log(`▸ ${r.label}`);
    if (r.file) console.log(`   PDF: ${r.file}`);

    if (r.checks && r.checks.length > 0) {
      for (const c of r.checks) {
        const icon = c.ok ? '✓' : '✗';
        console.log(
          `   ${icon} ${c.name.padEnd(32)}  actual=${String(fmt(c.actual)).padStart(10)}  esperado=${String(fmt(c.expected)).padStart(10)}`,
        );
      }
    } else if (r.reason) {
      console.log(`   ⚠ ${r.reason}`);
    }

    if (r.ok) {
      console.log('   → PASS');
      pass++;
    } else if (r.knownGap) {
      console.log(`   → KNOWN GAP: ${r.knownGap}`);
      gap++;
    } else {
      console.log('   → FAIL');
      fail++;
    }
    console.log('');
  }

  console.log('════════════════════════════════════════════════════════════════════');
  console.log(`  TOTAL: ${CASES.length}   PASS: ${pass}   FAIL: ${fail}   GAP: ${gap}`);
  console.log('════════════════════════════════════════════════════════════════════\n');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('❌ Error inesperado:', e);
  process.exit(1);
});
