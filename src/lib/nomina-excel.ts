import * as XLSX from 'xlsx'

function calculateTax(grossSalary: number, deductions: Array<{ concept?: string; amount?: number }>): string {
  const irpf = deductions.find((d) => d.concept?.includes('IRPF'))
  if (!irpf || !grossSalary) return '0'
  return ((irpf.amount! / grossSalary) * 100).toFixed(2)
}

function calculateSSPercentage(costEmpresa: number, grossSalary: number): string {
  if (!grossSalary) return '0'
  return (((costEmpresa - grossSalary) / grossSalary) * 100).toFixed(2)
}

export function buildNominaWorkbook(nominas: Array<Record<string, unknown>>): Buffer {
  const documents = nominas.map((nomina) => ({
    nominaData: {
      employee: nomina.employee as Record<string, unknown> | undefined,
      company: nomina.company as Record<string, unknown> | undefined,
      period_start: nomina.period_start,
      period_end: nomina.period_end,
      gross_salary: nomina.gross_salary,
      net_pay: nomina.net_pay,
      cost_empresa: nomina.cost_empresa,
      base_ss: nomina.base_ss,
      perceptions: nomina.perceptions,
      deductions: nomina.deductions,
      contributions: nomina.contributions,
    },
  }))

  const workbook = XLSX.utils.book_new()

  const summaryData = documents.map((doc) => ({
    Empleado: (doc.nominaData?.employee as { name?: string })?.name || 'N/A',
    DNI: (doc.nominaData?.employee as { dni?: string })?.dni || 'N/A',
    Empresa: (doc.nominaData?.company as { name?: string })?.name || 'N/A',
    Período: `${doc.nominaData?.period_start || 'N/A'} - ${doc.nominaData?.period_end || 'N/A'}`,
    'Salario Bruto': doc.nominaData?.gross_salary || 0,
    'Salario Neto': doc.nominaData?.net_pay || 0,
    'Coste Empresa': doc.nominaData?.cost_empresa || 0,
    'Base SS': doc.nominaData?.base_ss || 0,
  }))
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryData), 'Resumen')

  const perceptionsData: Array<Record<string, unknown>> = []
  documents.forEach((doc, index) => {
    const employeeName = (doc.nominaData?.employee as { name?: string })?.name || `Empleado ${index + 1}`
    const perceptions = (doc.nominaData?.perceptions as Array<{ concept?: string; code?: string; amount?: number }>) || []
    perceptions.forEach((p) => {
      perceptionsData.push({
        Empleado: employeeName,
        Concepto: p.concept || 'N/A',
        Código: p.code || '-',
        Importe: p.amount || 0,
      })
    })
  })
  if (perceptionsData.length > 0) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(perceptionsData), 'Percepciones')
  }

  const deductionsData: Array<Record<string, unknown>> = []
  documents.forEach((doc, index) => {
    const employeeName = (doc.nominaData?.employee as { name?: string })?.name || `Empleado ${index + 1}`
    const deductions = (doc.nominaData?.deductions as Array<{ concept?: string; code?: string; amount?: number }>) || []
    deductions.forEach((d) => {
      deductionsData.push({
        Empleado: employeeName,
        Concepto: d.concept || 'N/A',
        Código: d.code || '-',
        Importe: d.amount || 0,
      })
    })
  })
  if (deductionsData.length > 0) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(deductionsData), 'Deducciones')
  }

  const contributionsData: Array<Record<string, unknown>> = []
  documents.forEach((doc, index) => {
    const employeeName = (doc.nominaData?.employee as { name?: string })?.name || `Empleado ${index + 1}`
    const contributions = (doc.nominaData?.contributions as Array<{
      concept?: string
      base?: number
      rate?: number
      employer_contribution?: number
    }>) || []
    contributions.forEach((c) => {
      contributionsData.push({
        Empleado: employeeName,
        Concepto: c.concept || 'N/A',
        Base: c.base || 0,
        'Tasa %': c.rate ? (c.rate * 100).toFixed(2) : '0',
        'Contribución Empresa': c.employer_contribution || 0,
      })
    })
  })
  if (contributionsData.length > 0) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(contributionsData), 'Contribuciones')
  }

  const kpisData = documents.map((doc) => ({
    Empleado: (doc.nominaData?.employee as { name?: string })?.name || 'N/A',
    Empresa: (doc.nominaData?.company as { name?: string })?.name || 'N/A',
    'Retención IRPF (%)': calculateTax(
      (doc.nominaData?.gross_salary as number) || 0,
      (doc.nominaData?.deductions as Array<{ concept?: string; amount?: number }>) || [],
    ),
    'Desempeño Coste/Salario': (
      ((doc.nominaData?.cost_empresa as number) || 0) / ((doc.nominaData?.gross_salary as number) || 1)
    ).toFixed(2),
    'Aportación SS Empresa (%)': calculateSSPercentage(
      (doc.nominaData?.cost_empresa as number) || 0,
      (doc.nominaData?.gross_salary as number) || 1,
    ),
    'Neto/Bruto (%)': (
      (((doc.nominaData?.net_pay as number) || 0) / ((doc.nominaData?.gross_salary as number) || 1)) * 100
    ).toFixed(2),
  }))
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(kpisData), 'KPIs')

  return Buffer.from(XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }))
}
