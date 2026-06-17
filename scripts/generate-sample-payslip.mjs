import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve('.');
const entry = path.join(root, 'src/lib/generadores/generadorPDF.ts');
const bundleOut = path.join(root, 'scripts/.sample-payslip-bundle.mjs');
const pdfOut = path.join(root, 'public/sample-nomina-prueba.pdf');

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundleOut,
  external: ['pdf-lib'],
});

const { generatePayslipPDF } = await import(pathToFileURL(bundleOut).href);

const data = {
  company: {
    name: 'REPRESENTACIONES F.J.PIÑOL, S.L.',
    cif: 'B43213818',
    ccc: '43007517695',
    address: 'PGIPOL IN BAIX EBRE, CALLE H',
  },
  employee: {
    name: 'SABATE ALCOVERRO, ANA MARIA',
    nif: '40916601S',
    nss: '430044741420',
    category: 'LIMPIADORA',
    cotizationGroup: 9,
    startDate: '2007-09-25',
    job: 'LIMPIADOR',
    cnoCode: '289',
  },
  periodStart: '2026-01-01',
  periodEnd: '2026-01-31',
  workedDays: 30,
  totalDays: 30,
  salaryAccruals: [
    { code: '001', concept: 'Salario Base', amount: 589.28 },
    { code: '002', concept: 'Antigüedad', amount: 176.78 },
    { code: '003', concept: 'Ex.Marzo', amount: 63.84 },
    { code: '004', concept: 'Ex.Nav.', amount: 63.84 },
    { code: '005', concept: 'Ex.Junio', amount: 63.84 },
  ],
  nonSalaryAccruals: [
    { code: '101', concept: 'Seg Acc', amount: 0.27 },
  ],
  deductions: [
    { code: '001', concept: 'Contingencias comunes', base: 957.85, rate: 4.85, amount: 46.46 },
    { code: '002', concept: 'Desempleo', base: 957.85, rate: 1.55, amount: 14.85 },
    { code: '003', concept: 'Formación profesional', base: 957.85, rate: 0.10, amount: 0.95 },
    { code: '004', concept: 'IRPF', base: 957.58, rate: 2.00, amount: 19.15 },
    { code: '005', concept: 'Anticipos', base: 0, rate: 0, amount: 0.27 },
  ],
  companyContributions: [
    { concept: 'Contingencias comunes', base: 957.85, rate: 24.35, amount: 233.23 },
    { concept: 'AT y EP', base: 957.85, rate: 3.60, amount: 34.48 },
    { concept: 'Desempleo', base: 957.85, rate: 5.50, amount: 52.68 },
    { concept: 'Formación Profesional', base: 957.85, rate: 0.60, amount: 5.74 },
    { concept: 'Fondo Garantía Salarial', base: 957.85, rate: 0.20, amount: 1.92 },
  ],
  totalAccruals: 957.85,
  totalDeductions: 81.68,
  netPay: 876.17,
  baseCC: 957.85,
  baseCP: 957.85,
  baseIRPF: 957.58,
  irpfRate: 2.00,
  remuneracionMensualCC: 957.85,
  prorrataPagasCC: 0,
  iban: 'ES0000000000000000000000',
  bankEntity: '',
  bankAccount: '',
  issueDate: '2026-01-31',
  issuePlace: 'TORTOSA',
};

const bytes = await generatePayslipPDF(data);
fs.mkdirSync(path.dirname(pdfOut), { recursive: true });
fs.writeFileSync(pdfOut, bytes);
console.log(`PDF generado: ${pdfOut}`);
