// ============================================================================
// test-engine-units.ts — Tests offline del motor (sin Supabase)
// Ejecución: npx tsx vacly-nominas/scripts/test-engine-units.ts
// Valida los nuevos conceptos: solidaridad, especie, embargos, ERTE, finiquito.
// ============================================================================

import {
  calculatePayslip,
  calculateSolidarity,
  calculateGarnishment,
  calculateInKind,
  calculateSettlement,
  CausaCese,
  getDefaultPayrollConfig,
  TipoContrato,
  TipoJornada,
  TipoErte,
} from '../src/lib/calculadora/index'
import type { EmployeePayrollInput, MonthlyVariablesInput } from '../src/lib/calculadora/index'

let passed = 0
let failed = 0

function approx(a: number, b: number, tol = 0.02): boolean {
  return Math.abs(a - b) <= tol
}
function assert(cond: boolean, label: string, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label} ${extra}`) }
}

const config = getDefaultPayrollConfig(2026)

const baseEmployee: EmployeePayrollInput = {
  baseSalaryMonthly: 2000,
  cotizationGroup: 5,
  irpfPercentage: 15,
  fixedComplements: 0,
  proratedBonuses: 0,
  numberOfBonuses: 2,
  contractType: TipoContrato.INDEFINIDO,
  workdayType: TipoJornada.COMPLETA,
  partTimeCoefficient: 1,
}
const baseVars: MonthlyVariablesInput = {
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
}

console.log('\n── Nómina base (sin extras) ──')
{
  const r = calculatePayslip(baseEmployee, { ...baseVars, otherSalaryAccruals: 333.33 }, config, 1)
  // devengo salarial = 2000 + 333.33 prorrata = 2333.33
  assert(approx(r.accruals.totalSalaryAccruals, 2333.33), 'devengo salarial = 2.333,33', `got ${r.accruals.totalSalaryAccruals}`)
  assert(r.workerDeductions.irpf > 0, 'IRPF > 0')
  assert(r.netSalary > 0 && r.netSalary < r.accruals.totalAccruals, 'líquido coherente')
}

console.log('\n── Salario en especie ──')
{
  const inKind = calculateInKind({ amount: 200, repercutido: true }, 15)
  assert(approx(inKind.ingresoACuenta, 30), 'ingreso a cuenta = 30 (15% de 200)', `got ${inKind.ingresoACuenta}`)
  const r = calculatePayslip(baseEmployee, { ...baseVars, inKind: { amount: 200, repercutido: true } }, config, 1)
  assert(approx(r.accruals.inKind, 200), 'especie en devengos = 200', `got ${r.accruals.inKind}`)
  assert(approx(r.workerDeductions.inKindValue, 200), 'valor especie descontado = 200')
  // líquido no debe incluir el valor en especie
  const cash = r.accruals.totalAccruals - r.workerDeductions.totalDeductions
  assert(approx(r.netSalary, cash), 'líquido = devengo - deducciones')
}

console.log('\n── Cotización de solidaridad ──')
{
  const sol = calculateSolidarity(6000, config) // > base máxima 5101,20
  assert(sol !== null, 'solidaridad aplica sobre exceso de base máxima')
  assert(sol!.total > 0 && approx(sol!.worker + sol!.company, sol!.total), 'reparto trabajador+empresa = total')
  const none = calculateSolidarity(3000, config)
  assert(none === null, 'sin solidaridad por debajo de base máxima')
}

console.log('\n── Embargo (Art. 607 LEC) ──')
{
  const g = calculateGarnishment(3000, 1184, { active: true })
  assert(g !== null && g.total > 0, 'embargo calcula importe sobre exceso del SMI')
  const none = calculateGarnishment(1000, 1184, { active: true })
  assert(none !== null && none.total === 0, 'inembargable: líquido < SMI → 0')
  const ali = calculateGarnishment(1000, 1184, { active: true, pensionAlimentos: 150 })
  assert(ali !== null && approx(ali.total, 150), 'pensión alimentos sin límite de inembargabilidad')
}

console.log('\n── ERTE ──')
{
  const r = calculatePayslip(baseEmployee, { ...baseVars, erte: { type: TipoErte.SUSPENSION, affectedDays: 15, exemptionPercent: 50 } }, config, 1)
  assert(r.erteDetail != null && r.erteDetail.salaryReduction > 0, 'ERTE suspensión reduce salario')
  assert(r.erteDetail!.companyExemption >= 0, 'exoneración cuota empresa calculada')
  assert(r.accruals.baseSalary < 2000, 'salario base reducido por suspensión')
}

console.log('\n── Finiquito / indemnización ──')
{
  const s = calculateSettlement({
    causa: CausaCese.DESPIDO_IMPROCEDENTE,
    monthlySalary: 2000,
    numberOfBonuses: 2,
    yearsOfService: 5,
    daysWorkedThisMonth: 15,
    calendarDaysInMonth: 30,
    pendingVacationDays: 10,
    bonusAccrualMonths: 6,
  })
  // indemnización improcedente: 33 días/año × 5 años × (2000/30)
  assert(approx(s.severance, 33 * 5 * (2000 / 30)), 'indemnización 33 días/año', `got ${s.severance}`)
  assert(s.salaryDaysWorked > 0 && s.vacationSettlement > 0 && s.total > s.taxableTotal, 'finiquito coherente')
}

console.log(`\n──────────────\nResultado: ${passed} OK, ${failed} KO\n`)
process.exit(failed === 0 ? 0 : 1)
