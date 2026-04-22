// ============================================================================
// generadorPDF.ts — Recibo oficial de salarios (modelo Orden ESS/2098/2014)
// ============================================================================
//
// Layout fiel al modelo oficial del Ministerio de Trabajo:
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │  TRABAJADOR ← datos trabajador            EMPRESA ← datos empresa  │
// ├─────────────────────────────────────────────────────────────────────┤
// │  Período de Liquidación: del ...   Total días: 30 / 30             │
// ├─────────────────────────────────────────────────────────────────────┤
// │  I. DEVENGOS                                                         │
// │  1. Percepciones salariales    │   2. Percepciones no salariales   │
// │  Salario Base        1.178,56  │   Indemnizaciones o suplidos      │
// │  Antigüedad            353,57  │   ...                             │
// │  EX.MARZO               63,84  │                                   │
// │  ...                           │                                   │
// ├─────────────────────────────────────────────────────────────────────┤
// │  A. TOTAL DEVENGADO .........................         1.659,81 €   │
// ├─────────────────────────────────────────────────────────────────────┤
// │  II. DEDUCCIONES (tabla con %/importe)                              │
// │  B. TOTAL A DEDUCIR .........................           X,XX €     │
// ├─────────────────────────────────────────────────────────────────────┤
// │  LÍQUIDO TOTAL A PERCIBIR (A - B) ...........           X,XX €     │
// │  En [lugar] a [día] de [mes] de [año]                              │
// │  Firma empresa                     Recibí trabajador                │
// │  Entidad: ___      Cuenta: IBAN_____                                │
// ├─────────────────────────────────────────────────────────────────────┤
// │  DETERMINACIÓN BASES DE COTIZACIÓN / IRPF / APORTACIÓN EMPRESA      │
// └─────────────────────────────────────────────────────────────────────┘
//
// Cumple Orden ESS/2098/2014 de 6 de noviembre (BOE 11/11/2014).
// ============================================================================

import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb } from 'pdf-lib';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface PayslipCompanyInfo {
  name: string;
  cif: string;
  ccc: string;
  address?: string;
}

export interface PayslipEmployeeInfo {
  name: string;
  nif: string;
  nss: string;
  category: string;
  cotizationGroup: number;
  startDate?: string;     // Fecha antigüedad
  address?: string;       // Domicilio trabajador
  job?: string;           // Puesto de trabajo
  cnoCode?: string;       // Código CNO
}

export interface PayslipAccrualLine {
  code: string;
  concept: string;
  amount: number;
}

export interface PayslipDeductionLine {
  code: string;
  concept: string;
  base: number;
  rate: number;
  amount: number;
}

export interface PayslipContributionLine {
  concept: string;
  base: number;
  rate: number;
  amount: number;
}

export interface PayslipPDFData {
  company: PayslipCompanyInfo;
  employee: PayslipEmployeeInfo;
  periodStart: string;    // YYYY-MM-DD
  periodEnd: string;      // YYYY-MM-DD
  workedDays: number;
  totalDays: number;

  salaryAccruals: PayslipAccrualLine[];
  nonSalaryAccruals: PayslipAccrualLine[];
  deductions: PayslipDeductionLine[];
  companyContributions: PayslipContributionLine[];

  totalAccruals: number;
  totalDeductions: number;
  netPay: number;

  baseCC: number;
  baseCP: number;
  baseIRPF: number;
  irpfRate: number;

  // Opcionales para la sección "Determinación bases"
  remuneracionMensualCC?: number;   // base CC sin prorrata
  prorrataPagasCC?: number;         // prorrata mensual pagas extras

  iban: string;
  bankEntity?: string;
  bankAccount?: string;
  issueDate: string;       // YYYY-MM-DD
  issuePlace?: string;     // Ej: "TORTOSA"
}

// ---------------------------------------------------------------------------
// Constantes de diseño
// ---------------------------------------------------------------------------

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = { left: 28, right: 28, top: 28, bottom: 28 };

const FONT = {
  title: 10.5,
  section: 9,
  normal: 8,
  small: 7,
  tiny: 6.5,
};

const LH = {
  normal: 10.5,
  small: 9,
  tiny: 8,
};

const C = {
  black: rgb(0, 0, 0),
  darkGray: rgb(0.25, 0.25, 0.25),
  midGray: rgb(0.5, 0.5, 0.5),
  lightGray: rgb(0.88, 0.88, 0.88),
  headerBg: rgb(0.93, 0.93, 0.93),
  accent: rgb(0.12, 0.22, 0.42),
  white: rgb(1, 1, 1),
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function fmtMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '';
  const v = Math.abs(amount).toFixed(2);
  const [int, dec] = v.split('.');
  const intWithDots = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${amount < 0 ? '-' : ''}${intWithDots},${dec}`;
}

function fmtRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return '';
  return rate.toFixed(2).replace('.', ',');
}

function fmtDate(iso: string): string {
  if (!iso || !iso.includes('-')) return iso ?? '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function monthNameEs(iso: string): string {
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  const idx = parseInt(iso.split('-')[1], 10) - 1;
  return months[idx] ?? '';
}

function getYear(iso: string): string {
  return iso.split('-')[0] ?? '';
}

function getDay(iso: string): string {
  return iso.split('-')[2] ?? '';
}

function truncate(text: string, font: PDFFont, size: number, maxW: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxW) return text;
  let t = text;
  while (t.length > 0 && font.widthOfTextAtSize(t + '…', size) > maxW) t = t.slice(0, -1);
  return t + '…';
}

function drawRect(p: PDFPage, x: number, y: number, w: number, h: number, color: ReturnType<typeof rgb>) {
  p.drawRectangle({ x, y, width: w, height: h, color });
}

function drawBorder(p: PDFPage, x: number, y: number, w: number, h: number, thickness = 0.5, color = C.darkGray) {
  p.drawRectangle({ x, y, width: w, height: h, borderWidth: thickness, borderColor: color, color: undefined });
}

function drawHLine(p: PDFPage, x: number, y: number, w: number, thickness = 0.4, color = C.darkGray) {
  p.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness, color });
}

function drawVLine(p: PDFPage, x: number, y: number, h: number, thickness = 0.4, color = C.darkGray) {
  p.drawLine({ start: { x, y }, end: { x, y: y - h }, thickness, color });
}

function drawText(p: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, color = C.black) {
  p.drawText(text, { x, y, size, font, color });
}

function drawTextRight(p: PDFPage, text: string, rightX: number, y: number, font: PDFFont, size: number, color = C.black) {
  const w = font.widthOfTextAtSize(text, size);
  p.drawText(text, { x: rightX - w, y, size, font, color });
}

function drawTextCenter(p: PDFPage, text: string, centerX: number, y: number, font: PDFFont, size: number, color = C.black) {
  const w = font.widthOfTextAtSize(text, size);
  p.drawText(text, { x: centerX - w / 2, y, size, font, color });
}

// Dibuja una línea "etiqueta .............. valor" dentro de una celda
function drawLabelValue(
  p: PDFPage,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  font: PDFFont,
  size: number,
  color = C.black,
) {
  drawText(p, label, x, y, font, size, color);
  if (value) drawTextRight(p, value, x + width, y, font, size, color);
}

// ---------------------------------------------------------------------------
// Generador principal
// ---------------------------------------------------------------------------

export async function generatePayslipPDF(data: PayslipPDFData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const fReg = await pdf.embedFont(StandardFonts.Helvetica);
  const fBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const W = PAGE.width - MARGIN.left - MARGIN.right;
  const xL = MARGIN.left;
  const xR = MARGIN.left + W;
  let y = PAGE.height - MARGIN.top;

  // ==========================================================================
  // BLOQUE 1: Título
  // ==========================================================================
  drawRect(page, xL, y - 14, W, 14, C.accent);
  drawTextCenter(
    page,
    'RECIBO INDIVIDUAL JUSTIFICATIVO DEL PAGO DE SALARIOS',
    xL + W / 2,
    y - 10,
    fBold,
    FONT.title,
    C.white,
  );
  y -= 18;

  // ==========================================================================
  // BLOQUE 2: Trabajador (izquierda) · Empresa (derecha)
  // ==========================================================================
  const halfW = W / 2 - 2;
  const blockH = 80;

  drawBorder(page, xL, y - blockH, halfW, blockH);
  drawBorder(page, xL + halfW + 4, y - blockH, halfW, blockH);

  // Títulos de bloque
  drawRect(page, xL, y - 11, halfW, 11, C.headerBg);
  drawRect(page, xL + halfW + 4, y - 11, halfW, 11, C.headerBg);
  drawText(page, 'TRABAJADOR', xL + 4, y - 8, fBold, FONT.small, C.accent);
  drawText(page, 'EMPRESA', xL + halfW + 8, y - 8, fBold, FONT.small, C.accent);

  // --- Trabajador
  let yT = y - 21;
  const workerRows: Array<[string, string]> = [
    ['Nombre:', data.employee.name || ''],
    ['Domicilio:', data.employee.address || ''],
    ['N.I.F.:', data.employee.nif || ''],
    ['Núm. afiliación Seg. Social:', data.employee.nss || ''],
    ['Categoría / grupo prof.:', data.employee.category || ''],
    ['Grupo cotización:', String(data.employee.cotizationGroup ?? '')],
    ['Puesto de trabajo:', data.employee.job || ''],
  ];
  if (data.employee.startDate) {
    workerRows.push(['Fecha antigüedad:', fmtDate(data.employee.startDate)]);
  }
  if (data.employee.cnoCode) {
    workerRows.push(['Código CNO:', data.employee.cnoCode]);
  }
  for (const [label, value] of workerRows) {
    const fullLine = `${label} ${value}`.trim();
    const display = truncate(fullLine, fReg, FONT.small, halfW - 8);
    drawText(page, display, xL + 4, yT, fReg, FONT.small);
    yT -= LH.small;
    if (yT < y - blockH + 4) break;
  }

  // --- Empresa
  let yE = y - 21;
  const companyRows: Array<[string, string]> = [
    ['Razón social:', data.company.name || ''],
    ['C.I.F.:', data.company.cif || ''],
    ['Cód. cuenta cotización (CCC):', data.company.ccc || ''],
    ['Domicilio:', data.company.address || ''],
  ];
  for (const [label, value] of companyRows) {
    const fullLine = `${label} ${value}`.trim();
    const display = truncate(fullLine, fReg, FONT.small, halfW - 8);
    drawText(page, display, xL + halfW + 8, yE, fReg, FONT.small);
    yE -= LH.small;
    if (yE < y - blockH + 4) break;
  }

  y -= blockH + 4;

  // ==========================================================================
  // BLOQUE 3: Período de liquidación
  // ==========================================================================
  const periodH = 14;
  drawRect(page, xL, y - periodH, W, periodH, C.headerBg);
  drawBorder(page, xL, y - periodH, W, periodH);
  const periodTxt =
    `Período de Liquidación: del ${getDay(data.periodStart)} de ${monthNameEs(data.periodStart)} de ${getYear(data.periodStart)} ` +
    `al ${getDay(data.periodEnd)} de ${monthNameEs(data.periodEnd)} de ${getYear(data.periodEnd)}`;
  drawText(page, periodTxt, xL + 4, y - 10, fBold, FONT.normal, C.accent);
  drawTextRight(
    page,
    `Total días: ${data.workedDays} / ${data.totalDays}`,
    xR - 4, y - 10, fBold, FONT.normal, C.accent,
  );
  y -= periodH + 2;

  // ==========================================================================
  // BLOQUE 4: I. DEVENGOS (2 columnas)
  // ==========================================================================
  const devengosHeadH = 12;
  drawRect(page, xL, y - devengosHeadH, W, devengosHeadH, C.accent);
  drawText(page, 'I. DEVENGOS', xL + 4, y - 9, fBold, FONT.section, C.white);
  y -= devengosHeadH;

  // Subcabeceras de columnas
  const colH = 10;
  drawRect(page, xL, y - colH, halfW + 2, colH, C.headerBg);
  drawRect(page, xL + halfW + 2, y - colH, halfW + 2, colH, C.headerBg);
  drawText(page, '1. Percepciones salariales', xL + 4, y - 8, fBold, FONT.small);
  drawText(page, '2. Percepciones no salariales', xL + halfW + 6, y - 8, fBold, FONT.small);
  drawTextRight(page, 'Importe (€)', xL + halfW - 2, y - 8, fBold, FONT.tiny, C.midGray);
  drawTextRight(page, 'Importe (€)', xR - 4, y - 8, fBold, FONT.tiny, C.midGray);
  y -= colH;

  // Caja del grid
  const maxRows = Math.max(data.salaryAccruals.length, data.nonSalaryAccruals.length, 8);
  const rowH = LH.small;
  const gridH = maxRows * rowH + 4;
  drawBorder(page, xL, y - gridH, halfW + 2, gridH);
  drawBorder(page, xL + halfW + 2, y - gridH, halfW + 2, gridH);

  // Filas izquierda (salariales) — con código numérico 001/002/… como en el modelo oficial
  let rowY = y - rowH;
  data.salaryAccruals.forEach((line, idx) => {
    if (rowY < y - gridH + 4) return;
    const code = String(idx + 1).padStart(3, '0');
    drawText(page, code, xL + 4, rowY, fReg, FONT.tiny, C.midGray);
    drawText(
      page,
      truncate(line.concept, fReg, FONT.normal, halfW - 75),
      xL + 22,
      rowY,
      fReg,
      FONT.normal,
    );
    drawTextRight(page, fmtMoney(line.amount), xL + halfW - 2, rowY, fReg, FONT.normal);
    rowY -= rowH;
  });
  // Filas derecha (no salariales)
  rowY = y - rowH;
  data.nonSalaryAccruals.forEach((line, idx) => {
    if (rowY < y - gridH + 4) return;
    const code = String(100 + idx + 1).padStart(3, '0');
    drawText(page, code, xL + halfW + 6, rowY, fReg, FONT.tiny, C.midGray);
    drawText(
      page,
      truncate(line.concept, fReg, FONT.normal, halfW - 75),
      xL + halfW + 24,
      rowY,
      fReg,
      FONT.normal,
    );
    drawTextRight(page, fmtMoney(line.amount), xR - 4, rowY, fReg, FONT.normal);
    rowY -= rowH;
  });

  y -= gridH;

  // Total devengado
  const totalH = 13;
  drawRect(page, xL, y - totalH, W, totalH, C.accent);
  drawText(page, 'A. TOTAL DEVENGADO', xL + 4, y - 10, fBold, FONT.section, C.white);
  drawTextRight(page, `${fmtMoney(data.totalAccruals)} €`, xR - 4, y - 10, fBold, FONT.section, C.white);
  y -= totalH + 2;

  // ==========================================================================
  // BLOQUE 5: II. DEDUCCIONES
  // ==========================================================================
  drawRect(page, xL, y - devengosHeadH, W, devengosHeadH, C.accent);
  drawText(page, 'II. DEDUCCIONES', xL + 4, y - 9, fBold, FONT.section, C.white);
  y -= devengosHeadH;

  // Subcabecera: Concepto | Base | % | Importe
  const dedColBaseX = xL + W * 0.50;
  const dedColRateX = xL + W * 0.72;
  const dedColImporteX = xR - 4;

  drawRect(page, xL, y - colH, W, colH, C.headerBg);
  drawText(page, 'Concepto', xL + 4, y - 8, fBold, FONT.small);
  drawTextRight(page, 'Base (€)', dedColBaseX + 50, y - 8, fBold, FONT.tiny, C.midGray);
  drawTextRight(page, 'Tipo %', dedColRateX + 35, y - 8, fBold, FONT.tiny, C.midGray);
  drawTextRight(page, 'Importe (€)', dedColImporteX, y - 8, fBold, FONT.tiny, C.midGray);
  y -= colH;

  const dedRowH = LH.normal;
  const dedRows = data.deductions.length;
  const dedGridH = Math.max(dedRows, 5) * dedRowH + 4;
  drawBorder(page, xL, y - dedGridH, W, dedGridH);

  rowY = y - dedRowH;
  data.deductions.forEach((d, idx) => {
    if (rowY < y - dedGridH + 4) return;
    const code = String(idx + 1).padStart(3, '0');
    drawText(page, code, xL + 4, rowY, fReg, FONT.tiny, C.midGray);
    drawText(
      page,
      truncate(d.concept, fReg, FONT.normal, dedColBaseX - xL - 30),
      xL + 22,
      rowY,
      fReg,
      FONT.normal,
    );
    if (d.base > 0) drawTextRight(page, fmtMoney(d.base), dedColBaseX + 50, rowY, fReg, FONT.normal, C.darkGray);
    if (d.rate > 0) drawTextRight(page, fmtRate(d.rate), dedColRateX + 35, rowY, fReg, FONT.normal, C.darkGray);
    drawTextRight(page, fmtMoney(d.amount), dedColImporteX, rowY, fReg, FONT.normal);
    rowY -= dedRowH;
  });

  y -= dedGridH;

  // Total deducciones
  drawRect(page, xL, y - totalH, W, totalH, C.accent);
  drawText(page, 'B. TOTAL A DEDUCIR (1+2+3+4+5)', xL + 4, y - 10, fBold, FONT.section, C.white);
  drawTextRight(page, `${fmtMoney(data.totalDeductions)} €`, xR - 4, y - 10, fBold, FONT.section, C.white);
  y -= totalH + 2;

  // ==========================================================================
  // BLOQUE 6: LÍQUIDO A PERCIBIR
  // ==========================================================================
  const liqH = 22;
  drawRect(page, xL, y - liqH, W, liqH, C.accent);
  drawText(page, 'LÍQUIDO TOTAL A PERCIBIR (A - B)', xL + 6, y - 15, fBold, FONT.title + 1, C.white);
  drawTextRight(page, `${fmtMoney(data.netPay)} €`, xR - 6, y - 15, fBold, FONT.title + 2, C.white);
  y -= liqH + 4;

  // ==========================================================================
  // BLOQUE 7: Firma + Lugar/Fecha + IBAN
  // ==========================================================================
  const lugar = data.issuePlace ?? '';
  const dateTxt =
    `En ${lugar ? lugar + ' ' : ''}a ${getDay(data.issueDate)} de ${monthNameEs(data.issueDate)} de ${getYear(data.issueDate)}`;
  drawText(page, dateTxt, xL + 4, y - 8, fBold, FONT.normal);
  y -= 12;

  // Dos columnas: Firma empresa (izq) | Recibí trabajador (der)
  const signH = 36;
  drawBorder(page, xL, y - signH, halfW, signH);
  drawBorder(page, xL + halfW + 4, y - signH, halfW, signH);
  drawText(page, 'Firma y sello de la empresa', xL + 4, y - 10, fReg, FONT.small, C.midGray);
  drawText(page, 'RECIBÍ, el trabajador', xL + halfW + 8, y - 10, fReg, FONT.small, C.midGray);
  y -= signH + 4;

  // Entidad / Cuenta
  const bankH = 14;
  drawBorder(page, xL, y - bankH, W, bankH);
  const entidad = data.bankEntity ?? '';
  const cuenta = data.bankAccount ?? data.iban ?? '';
  drawText(page, `Entidad: ${entidad}`, xL + 4, y - 10, fReg, FONT.small);
  drawText(page, `Cuenta: ${cuenta}`, xL + W * 0.4, y - 10, fBold, FONT.small);
  y -= bankH + 6;

  // ==========================================================================
  // BLOQUE 8: Determinación de las bases + Aportación empresa
  // ==========================================================================
  const basesHeadH = 18;
  drawRect(page, xL, y - basesHeadH, W, basesHeadH, C.accent);
  drawTextCenter(
    page,
    'DETERMINACIÓN DE LAS BASES DE COTIZACIÓN A LA SEGURIDAD SOCIAL Y CONCEPTOS DE',
    xL + W / 2, y - 8, fBold, FONT.small, C.white,
  );
  drawTextCenter(
    page,
    'RECAUDACIÓN CONJUNTA Y DE LA BASE SUJETA A RETENCIÓN DEL IRPF · APORTACIÓN DE LA EMPRESA',
    xL + W / 2, y - 16, fBold, FONT.small, C.white,
  );
  y -= basesHeadH;

  // Sub-cabecera CONCEPTO | BASE | TIPO | APORTACIÓN EMPRESA
  const bColConcept = xL + 4;
  const bColBase = xL + W * 0.55;
  const bColRate = xL + W * 0.75;
  const bColImporte = xR - 4;
  drawRect(page, xL, y - colH, W, colH, C.headerBg);
  drawText(page, 'Concepto', bColConcept, y - 8, fBold, FONT.small);
  drawTextRight(page, 'Base (€)', bColBase + 50, y - 8, fBold, FONT.tiny, C.midGray);
  drawTextRight(page, 'Tipo %', bColRate + 35, y - 8, fBold, FONT.tiny, C.midGray);
  drawTextRight(page, 'Aportación empresa (€)', bColImporte, y - 8, fBold, FONT.tiny, C.midGray);
  y -= colH;

  // Filas de contingencias y recaudación conjunta
  const bRowH = LH.normal;
  const numRows = Math.max(data.companyContributions.length, 6) + 4;
  const bGridH = numRows * bRowH + 4;
  drawBorder(page, xL, y - bGridH, W, bGridH);

  rowY = y - bRowH;

  // 1. Contingencias comunes — desglose específico si hay datos
  drawText(page, '1. Contingencias comunes', bColConcept, rowY, fBold, FONT.normal);
  rowY -= bRowH;
  if (data.remuneracionMensualCC !== undefined) {
    drawText(page, '   Importe remuneración Mensual', bColConcept, rowY, fReg, FONT.normal);
    drawTextRight(page, fmtMoney(data.remuneracionMensualCC), bColBase + 50, rowY, fReg, FONT.normal, C.darkGray);
    rowY -= bRowH;
  }
  if (data.prorrataPagasCC !== undefined && data.prorrataPagasCC > 0) {
    drawText(page, '   Importe prorrata pagas extraordinarias', bColConcept, rowY, fReg, FONT.normal);
    drawTextRight(page, fmtMoney(data.prorrataPagasCC), bColBase + 50, rowY, fReg, FONT.normal, C.darkGray);
    rowY -= bRowH;
  }
  // Línea TOTAL CC (encontrar la contribution de CC)
  const ccContrib = data.companyContributions.find((c) =>
    /contingencias comunes|\bCC\b/i.test(c.concept),
  );
  if (ccContrib) {
    drawText(page, '   TOTAL', bColConcept, rowY, fBold, FONT.normal);
    drawTextRight(page, fmtMoney(ccContrib.base), bColBase + 50, rowY, fBold, FONT.normal);
    drawTextRight(page, fmtRate(ccContrib.rate), bColRate + 35, rowY, fBold, FONT.normal);
    drawTextRight(page, fmtMoney(ccContrib.amount), bColImporte, rowY, fBold, FONT.normal);
    rowY -= bRowH;
  }

  // 2. Contingencias profesionales y conceptos de recaudación conjunta
  drawText(page, '2. Contingencias profesionales y recaudación conjunta', bColConcept, rowY, fBold, FONT.normal);
  rowY -= bRowH;
  const cpKeys = [
    /AT\s*\/?\s*EP|AT\s*y\s*EP|atep/i,
    /desempleo/i,
    /formaci[oó]n profesional|\bFP\b/i,
    /fogasa|fondo garant/i,
  ];
  for (const rx of cpKeys) {
    const c = data.companyContributions.find((x) => rx.test(x.concept));
    if (!c) continue;
    drawText(page, `   ${c.concept}`, bColConcept, rowY, fReg, FONT.normal);
    drawTextRight(page, fmtMoney(c.base), bColBase + 50, rowY, fReg, FONT.normal, C.darkGray);
    drawTextRight(page, fmtRate(c.rate), bColRate + 35, rowY, fReg, FONT.normal, C.darkGray);
    drawTextRight(page, fmtMoney(c.amount), bColImporte, rowY, fReg, FONT.normal);
    rowY -= bRowH;
    if (rowY < y - bGridH + 20) break;
  }

  // 3. Cotización adicional horas extraordinarias (si hay)
  const hxContrib = data.companyContributions.find((c) => /horas extra/i.test(c.concept));
  if (hxContrib) {
    drawText(page, '3. Cotización adicional horas extraordinarias', bColConcept, rowY, fReg, FONT.normal);
    drawTextRight(page, fmtMoney(hxContrib.base), bColBase + 50, rowY, fReg, FONT.normal, C.darkGray);
    drawTextRight(page, fmtRate(hxContrib.rate), bColRate + 35, rowY, fReg, FONT.normal, C.darkGray);
    drawTextRight(page, fmtMoney(hxContrib.amount), bColImporte, rowY, fReg, FONT.normal);
    rowY -= bRowH;
  }

  // 4. Base IRPF
  drawText(page, '4. Base sujeta a retención del IRPF', bColConcept, rowY, fBold, FONT.normal);
  drawTextRight(page, fmtMoney(data.baseIRPF), bColBase + 50, rowY, fBold, FONT.normal);
  drawTextRight(page, fmtRate(data.irpfRate), bColRate + 35, rowY, fBold, FONT.normal);
  rowY -= bRowH;

  y -= bGridH;

  // ==========================================================================
  // Pie legal
  // ==========================================================================
  drawHLine(page, xL, y, W, 0.3, C.midGray);
  y -= 8;
  drawText(
    page,
    'Este recibo se ajusta al modelo oficial aprobado por Orden ESS/2098/2014, de 6 de noviembre (BOE 11/11/2014).',
    xL + 2, y, fReg, FONT.tiny, C.midGray,
  );

  return pdf.save();
}
