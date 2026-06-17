// ============================================================================
// generadorPDF.ts — Recibo oficial de salarios (modelo clásico, Orden ESS/2098/2014)
// ============================================================================
//
// Reproduce el modelo de recibo de salarios "clásico" en escala de grises:
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │  EMPRESA ← datos empresa        │   TRABAJADOR ← datos trabajador     │
// ├─────────────────────────────────────────────────────────────────────┤
// │  Período de Liquidación: del 01 de Enero al 31 de Enero 2026  Total días 30 │
// ├─────────────────────────────────────────────────────────────────────┤
// │  I. DEVENGOS                                                          │
// │  1. Percepciones salariales      │   2. Percepciones no salariales    │
// │  Salario Base ........ 589,28    │   Indemnizaciones o suplidos ....  │
// │  ...                             │   SEG ACC ............ 0,27        │
// │                       A. TOTAL DEVENGADO ............    957,85       │
// │  II DEDUCCIONES                                                       │
// │  1. Aportaciones del trabajador a la Seg. Social ...                  │
// │  Contingencias comunes 4,85% 46,46 │ 1. TOTAL APORTACIONES   62,26    │
// │  ...                               │ 2. I.R.P.F. 2,00% 19,15 ...      │
// │              B. TOTAL A DEDUCIR (1+2+3+4+5) ......       81,68        │
// │              LÍQUIDO TOTAL A PERCIBIR (A-B) ......      876,17        │
// ├─────────────────────────────────────────────────────────────────────┤
// │  Firma y sello empresa     En TORTOSA a 31 de Enero 2.026   RECIBÍ,   │
// │  Entidad: ___                              Cuenta: ___                │
// ├─────────────────────────────────────────────────────────────────────┤
// │  DETERMINACIÓN DE LAS BASES DE COTIZACIÓN ... / IRPF / APORTACIÓN     │
// │  CONCEPTO              BASE        TIPO        APORTACIÓN EMPRESA      │
// │  1. Contingencias comunes ...                                        │
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
  cnoCode?: string;       // Código contrato / CNO
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
// Constantes de diseño (escala de grises, estilo modelo oficial clásico)
// ---------------------------------------------------------------------------

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = { left: 24, right: 24, top: 26, bottom: 26 };

const FONT = {
  title: 9.5,
  head: 8.5,
  normal: 7.6,
  small: 7,
  tiny: 6,
};

const LH = {
  row: 10.2,
  tight: 9,
};

const C = {
  black: rgb(0, 0, 0),
  darkGray: rgb(0.2, 0.2, 0.2),
  midGray: rgb(0.5, 0.5, 0.5),
  line: rgb(0.35, 0.35, 0.35),
  shade: rgb(0.86, 0.86, 0.86),   // relleno de cajas de importe
  headShade: rgb(0.8, 0.8, 0.8),  // relleno de cabeceras grises
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

function monthNameEs(iso: string): string {
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  const idx = parseInt(iso.split('-')[1], 10) - 1;
  return months[idx] ?? '';
}

function fmtDate(iso: string): string {
  if (!iso || !iso.includes('-')) return iso ?? '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
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

function drawBorder(p: PDFPage, x: number, y: number, w: number, h: number, thickness = 0.6, color = C.line) {
  p.drawRectangle({ x, y, width: w, height: h, borderWidth: thickness, borderColor: color, color: undefined });
}

function drawHLine(p: PDFPage, x: number, y: number, w: number, thickness = 0.5, color = C.line) {
  p.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness, color });
}

function drawVLine(p: PDFPage, x: number, yTop: number, h: number, thickness = 0.5, color = C.line) {
  p.drawLine({ start: { x, y: yTop }, end: { x, y: yTop - h }, thickness, color });
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

// Línea de puntos (leader) entre etiqueta y valor
function drawLeader(p: PDFPage, x1: number, x2: number, y: number, color = C.midGray) {
  if (x2 - x1 < 6) return;
  p.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.5, color, dashArray: [0.6, 1.7] });
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
  const midX = xL + W / 2;
  let y = PAGE.height - MARGIN.top;

  // Helper: fila "etiqueta ........... valor"
  const percRow = (
    label: string,
    value: string,
    x: number,
    valRightX: number,
    yPos: number,
    bold = false,
  ) => {
    const f = bold ? fBold : fReg;
    drawText(page, label, x, yPos, f, FONT.normal);
    const labW = f.widthOfTextAtSize(label, FONT.normal);
    const valW = value ? fReg.widthOfTextAtSize(value, FONT.normal) : 0;
    drawLeader(page, x + labW + 4, valRightX - (value ? valW + 6 : 0), yPos + 1.8);
    if (value) drawTextRight(page, value, valRightX, yPos, fReg, FONT.normal);
  };

  // Helper: caja de importe sombreada con borde (totales del modelo)
  const valueBox = (rightX: number, yBaseline: number, boxW: number, text: string) => {
    const h = 11;
    const bx = rightX - boxW;
    const by = yBaseline - 2.5;
    drawRect(page, bx, by, boxW, h, C.shade);
    drawBorder(page, bx, by, boxW, h, 0.6, C.line);
    drawTextRight(page, text, rightX - 4, yBaseline, fBold, FONT.head);
  };

  // ==========================================================================
  // Código de modelo (encima del marco)
  // ==========================================================================
  drawText(page, '6.013', xL, y - 7, fReg, FONT.tiny, C.midGray);
  y -= 11;

  const frameTop = y;

  // ==========================================================================
  // BLOQUE 1: EMPRESA (izquierda) · TRABAJADOR (derecha)
  // ==========================================================================
  const headH = 96;
  const headTop = y;
  drawVLine(page, midX, headTop, headH);

  // --- EMPRESA (izquierda)
  let yc = headTop - 9;
  drawText(page, 'EMPRESA', xL + 5, yc, fBold, FONT.head);
  yc -= LH.row;
  drawText(page, truncate(data.company.name || '', fBold, FONT.normal, W / 2 - 12), xL + 5, yc, fBold, FONT.normal);
  yc -= LH.row;
  drawText(page, 'Domicilio', xL + 5, yc, fReg, FONT.small, C.midGray);
  yc -= LH.row;
  drawText(page, truncate(data.company.address || '', fBold, FONT.normal, W / 2 - 12), xL + 5, yc, fBold, FONT.normal);
  yc -= LH.row;
  drawText(page, 'C.I.F.', xL + 5, yc, fReg, FONT.small, C.midGray);
  drawText(page, data.company.cif || '', xL + 55, yc, fBold, FONT.normal);
  yc -= LH.row;
  drawText(page, 'Cod.cta. de cotización a la Seg.Social', xL + 5, yc, fReg, FONT.small, C.midGray);
  drawTextRight(page, data.company.ccc || '', midX - 6, yc, fBold, FONT.normal);

  // --- TRABAJADOR (derecha)
  const xT = midX + 6;
  const labelValT = (label: string, value: string, yPos: number, valBold = true) => {
    drawText(page, label, xT, yPos, fReg, FONT.small, C.midGray);
    if (value) drawTextRight(page, value, xR - 6, yPos, valBold ? fBold : fReg, FONT.normal);
  };
  let yt = headTop - 9;
  drawText(page, 'TRABAJADOR', xT, yt, fBold, FONT.head);
  yt -= LH.row;
  drawText(page, truncate(data.employee.name || '', fBold, FONT.normal, W / 2 - 12), xT, yt, fBold, FONT.normal);
  yt -= LH.row;
  labelValT('N.I.F.:', data.employee.nif || '', yt);
  yt -= LH.row;
  labelValT('Núm. afiliación Seg.Social', data.employee.nss || '', yt);
  yt -= LH.row;
  labelValT('Categoría o grupo profesional', truncate(data.employee.category || '', fBold, FONT.normal, W / 4), yt);
  yt -= LH.row;
  // Grupo de cotización + Fecha antigüedad en la misma fila
  drawText(page, 'Grupo de cotización', xT, yt, fReg, FONT.small, C.midGray);
  drawText(page, String(data.employee.cotizationGroup ?? ''), xT + 100, yt, fBold, FONT.normal);
  drawText(page, 'Fecha antig.', xT + 130, yt, fReg, FONT.small, C.midGray);
  drawTextRight(page, data.employee.startDate ? fmtDate(data.employee.startDate) : '', xR - 6, yt, fBold, FONT.normal);
  yt -= LH.row;
  // Puesto de trabajo + Código contrato
  drawText(page, 'Puesto de trabajo', xT, yt, fReg, FONT.small, C.midGray);
  drawText(page, truncate(data.employee.job || '', fBold, FONT.normal, 90), xT + 88, yt, fBold, FONT.normal);
  drawText(page, 'Código cto', xT + 188, yt, fReg, FONT.small, C.midGray);
  drawTextRight(page, data.employee.cnoCode || '', xR - 6, yt, fBold, FONT.normal);

  y = headTop - headH;
  drawHLine(page, xL, y, W);

  // ==========================================================================
  // BLOQUE 2: Período de liquidación
  // ==========================================================================
  const periodH = 14;
  drawRect(page, xL, y - periodH, W, periodH, C.white);
  // recuadro gris para "Total días"
  drawRect(page, xR - 42, y - periodH, 42, periodH, C.shade);
  const periodTxt =
    `Período de Liquidación: del  ${getDay(data.periodStart)}  de  ${monthNameEs(data.periodStart)}  ` +
    `al  ${getDay(data.periodEnd)}  de  ${monthNameEs(data.periodEnd)}    ${getYear(data.periodEnd)}`;
  drawText(page, periodTxt, xL + 5, y - 10, fBold, FONT.normal);
  drawText(page, 'Total días', xR - 120, y - 10, fReg, FONT.small, C.midGray);
  drawTextCenter(page, String(data.workedDays ?? data.totalDays), xR - 21, y - 10, fBold, FONT.normal);
  y -= periodH;
  drawHLine(page, xL, y, W, 0.8);

  // ==========================================================================
  // BLOQUE 3: I. DEVENGOS
  // ==========================================================================
  drawText(page, 'I. DEVENGOS', xL + 4, y - 10, fBold, FONT.title);
  y -= 13;
  drawHLine(page, xL, y, W);

  // Subcabeceras de columnas
  drawText(page, '1. Percepciones salariales', xL + 5, y - 9, fBold, FONT.small);
  drawText(page, '2. Percepciones no salariales', midX + 6, y - 9, fBold, FONT.small);
  y -= 12;

  // Columnas de devengos
  const leftValRight = midX - 8;
  const rightValRight = xR - 6;

  // Concepts: arrancamos con el skeleton estándar y volcamos importes por palabra clave
  const stdSalary = ['Salario Base', 'Horas extraordinarias', 'Gratificaciones extraordinarias', 'Salario en especie'];
  const stdNonSalary = [
    'Indemnizaciones o suplidos',
    'Prestaciones e Indemnizaciones de la Seg.Soc.',
    'Indemnizaciones por traslados, suspensiones o despidos',
    'Otras percepciones no salariales',
  ];

  // Importes que no encajan en el skeleton se listan a continuación
  const matchStd = (concept: string, std: string[]): number => {
    const norm = (s: string) => s.toLowerCase().replace(/[.\s]/g, '');
    const c = norm(concept);
    return std.findIndex((s) => {
      const ks = norm(s).slice(0, 8);
      return c.includes(ks) || ks.includes(c.slice(0, 8));
    });
  };

  const salaryValues: string[] = new Array(stdSalary.length).fill('');
  const extraSalary: PayslipAccrualLine[] = [];
  for (const line of data.salaryAccruals) {
    const i = matchStd(line.concept, stdSalary);
    if (i >= 0 && !salaryValues[i]) salaryValues[i] = fmtMoney(line.amount);
    else extraSalary.push(line);
  }

  const nonSalaryValues: string[] = new Array(stdNonSalary.length).fill('');
  const extraNonSalary: PayslipAccrualLine[] = [];
  for (const line of data.nonSalaryAccruals) {
    const i = matchStd(line.concept, stdNonSalary);
    if (i >= 0 && !nonSalaryValues[i]) nonSalaryValues[i] = fmtMoney(line.amount);
    else extraNonSalary.push(line);
  }

  // Render columna izquierda (salariales)
  let lY = y - 4;
  stdSalary.forEach((label, i) => {
    percRow(label, salaryValues[i], xL + 5, leftValRight, lY);
    lY -= LH.row;
  });
  extraSalary.forEach((line) => {
    percRow(line.concept.toUpperCase(), fmtMoney(line.amount), xL + 5, leftValRight, lY);
    lY -= LH.row;
  });

  // Render columna derecha (no salariales)
  let rY = y - 4;
  stdNonSalary.forEach((label, i) => {
    percRow(truncate(label, fReg, FONT.normal, W / 2 - 70), nonSalaryValues[i], midX + 6, rightValRight, rY);
    rY -= LH.row;
  });
  extraNonSalary.forEach((line) => {
    percRow(line.concept.toUpperCase(), fmtMoney(line.amount), midX + 6, rightValRight, rY);
    rY -= LH.row;
  });

  // Altura de la zona de devengos (la mayor de las dos columnas, mínimo 8 filas)
  const devRows = Math.max(stdSalary.length + extraSalary.length, stdNonSalary.length + extraNonSalary.length, 9);
  const devBottom = y - 4 - devRows * LH.row;
  drawVLine(page, midX, y, y - devBottom);
  y = devBottom - 2;

  // A. TOTAL DEVENGADO
  drawHLine(page, xL, y, W);
  y -= 3;
  drawTextRight(page, 'A. TOTAL DEVENGADO', midX + 150, y - 9, fBold, FONT.title);
  drawLeader(page, midX + 156, xR - 70, y - 7.5);
  valueBox(xR - 4, y - 9, 64, fmtMoney(data.totalAccruals));
  y -= 15;
  drawHLine(page, xL, y, W, 0.8);

  // ==========================================================================
  // BLOQUE 4: II DEDUCCIONES
  // ==========================================================================
  drawText(page, 'II DEDUCCIONES', xL + 4, y - 10, fBold, FONT.title);
  y -= 13;
  drawText(page, '1. Aportaciones del trabajador a la Seg.Social y conceptos de recaudación conjunta', xL + 5, y - 8, fBold, FONT.small);
  y -= 11;
  drawHLine(page, xL, y, W, 0.4, C.midGray);

  // Clasificar deducciones
  const isSS = (c: string) => /contingencias comunes|desempleo|formaci[oó]n|horas extra/i.test(c);
  const isIRPF = (c: string) => /irpf|i\.r\.p\.f|retenci/i.test(c);
  const isAnticipo = (c: string) => /anticipo/i.test(c);
  const isEspecie = (c: string) => /especie/i.test(c);

  const ssDeductions = data.deductions.filter((d) => isSS(d.concept));
  const irpfDeduction = data.deductions.find((d) => isIRPF(d.concept));
  const otherDeductions = data.deductions.filter((d) => !isSS(d.concept) && !isIRPF(d.concept));
  const anticipos = otherDeductions.filter((d) => isAnticipo(d.concept));
  const especie = otherDeductions.filter((d) => isEspecie(d.concept));
  const otras = otherDeductions.filter((d) => !isAnticipo(d.concept) && !isEspecie(d.concept));

  const sum = (arr: PayslipDeductionLine[]) => arr.reduce((s, d) => s + (d.amount || 0), 0);
  const totalAportaciones = sum(ssDeductions);

  // --- Columna izquierda: aportaciones SS (concepto · tipo% · importe)
  const dLeftLabelX = xL + 8;
  const dRateRight = xL + W * 0.30;
  const dAmtRight = midX - 10;
  let dlY = y - 11;
  const ssRows: Array<{ label: string; rate: number; amount: number }> = [
    { label: 'Contingencias comunes', rate: 0, amount: 0 },
    { label: 'Desempleo', rate: 0, amount: 0 },
    { label: 'Formación profesional', rate: 0, amount: 0 },
    { label: 'Horas extraordinarias', rate: 0, amount: 0 },
  ];
  for (const d of ssDeductions) {
    const norm = d.concept.toLowerCase();
    const idx = /contingencias comunes/.test(norm) ? 0
      : /desempleo/.test(norm) ? 1
      : /formaci/.test(norm) ? 2
      : /horas extra/.test(norm) ? 3 : -1;
    if (idx >= 0) { ssRows[idx].rate = d.rate; ssRows[idx].amount = d.amount; }
  }
  for (const r of ssRows) {
    drawText(page, r.label, dLeftLabelX, dlY, fReg, FONT.normal);
    const labW = fReg.widthOfTextAtSize(r.label, FONT.normal);
    const rateStr = r.rate ? fmtRate(r.rate) : '';
    drawLeader(page, dLeftLabelX + labW + 4, dRateRight - 14, dlY + 1.8);
    if (rateStr) {
      drawTextRight(page, rateStr, dRateRight, dlY, fReg, FONT.normal);
      drawText(page, '%', dRateRight + 2, dlY, fReg, FONT.small, C.midGray);
    }
    if (r.amount) drawTextRight(page, fmtMoney(r.amount), dAmtRight, dlY, fReg, FONT.normal);
    dlY -= LH.row;
  }

  // --- Columna derecha: ítems numerados 1..5
  const rLabelX = midX + 6;
  const rAmtRight = xR - 6;
  let drY = y - 11;
  // 1. TOTAL APORTACIONES (caja sombreada)
  drawText(page, '1. TOTAL APORTACIONES', rLabelX, drY, fReg, FONT.normal);
  valueBox(rAmtRight, drY, 58, fmtMoney(totalAportaciones));
  drY -= LH.row;
  // 2. I.R.P.F.
  drawText(page, '2. I.R.P.F.', rLabelX, drY, fReg, FONT.normal);
  const irpfRateStr = data.irpfRate ? fmtRate(data.irpfRate) : '';
  if (irpfRateStr) {
    drawTextRight(page, irpfRateStr, rLabelX + 150, drY, fReg, FONT.normal);
    drawText(page, '%', rLabelX + 152, drY, fReg, FONT.small, C.midGray);
  }
  if (irpfDeduction) drawTextRight(page, fmtMoney(irpfDeduction.amount), rAmtRight, drY, fReg, FONT.normal);
  drY -= LH.row;
  // 3. Anticipos
  drawText(page, '3. Anticipos', rLabelX, drY, fReg, FONT.normal);
  if (anticipos.length) drawTextRight(page, fmtMoney(sum(anticipos)), rAmtRight, drY, fReg, FONT.normal);
  drY -= LH.row;
  // 4. Valor de productos en especie
  drawText(page, '4. Valor de productos en especie', rLabelX, drY, fReg, FONT.normal);
  if (especie.length) drawTextRight(page, fmtMoney(sum(especie)), rAmtRight, drY, fReg, FONT.normal);
  drY -= LH.row;
  // 5. Otras deducciones
  drawText(page, '5. Otras deducciones', rLabelX, drY, fReg, FONT.normal);
  if (otras.length) drawTextRight(page, fmtMoney(sum(otras)), rAmtRight, drY, fReg, FONT.normal);
  drY -= LH.row;

  const dedBottom = Math.min(dlY, drY);
  drawVLine(page, midX, y, y - dedBottom);
  y = dedBottom - 2;
  drawHLine(page, xL, y, W);

  // ==========================================================================
  // BLOQUE 5: Totales (B. TOTAL A DEDUCIR / LÍQUIDO)
  // ==========================================================================
  y -= 3;
  drawTextRight(page, 'B. TOTAL A DEDUCIR (1+2+3+4+5)', midX + 150, y - 9, fBold, FONT.head);
  drawLeader(page, midX + 156, xR - 70, y - 7.5);
  valueBox(xR - 4, y - 9, 64, fmtMoney(data.totalDeductions));
  y -= 14;
  drawTextRight(page, 'LÍQUIDO TOTAL A PERCIBIR (A-B)', midX + 150, y - 9, fBold, FONT.title);
  drawLeader(page, midX + 156, xR - 70, y - 7.5);
  valueBox(xR - 4, y - 9, 64, fmtMoney(data.netPay));
  y -= 16;
  drawHLine(page, xL, y, W, 0.8);

  // ==========================================================================
  // BLOQUE 6: Firma / Fecha / RECIBÍ
  // ==========================================================================
  const signH = 34;
  drawVLine(page, midX, y, signH);
  drawText(page, 'Firma y sello de', xL + 5, y - 10, fReg, FONT.small, C.midGray);
  drawText(page, 'la empresa', xL + 5, y - 20, fReg, FONT.small, C.midGray);
  const lugar = data.issuePlace ?? '';
  drawText(page, 'En', midX + 6, y - 10, fReg, FONT.small, C.midGray);
  drawText(page, lugar, midX + 24, y - 10, fBold, FONT.normal);
  const dateLine = `a  ${getDay(data.issueDate)}  de  ${monthNameEs(data.issueDate)}    ${getYear(data.issueDate)}`;
  drawText(page, dateLine, midX + 6, y - 21, fReg, FONT.normal);
  drawText(page, 'RECIBÍ,', xR - 60, y - 28, fReg, FONT.small, C.midGray);
  y -= signH;
  drawHLine(page, xL, y, W);

  // Entidad / Cuenta
  const bankH = 13;
  drawRect(page, xL, y - bankH, W, bankH, C.shade);
  drawText(page, 'Entidad:', xL + 5, y - 9, fReg, FONT.small, C.darkGray);
  drawText(page, data.bankEntity || '', xL + 42, y - 9, fBold, FONT.small);
  drawText(page, 'Cuenta:', midX + 6, y - 9, fReg, FONT.small, C.darkGray);
  drawText(page, data.bankAccount || data.iban || '', midX + 44, y - 9, fBold, FONT.small);
  y -= bankH;
  drawHLine(page, xL, y, W, 0.8);

  // ==========================================================================
  // BLOQUE 7: Determinación de las bases de cotización
  // ==========================================================================
  const detHeadH = 20;
  drawRect(page, xL, y - detHeadH, W, detHeadH, C.headShade);
  drawTextCenter(
    page,
    'DETERMINACIÓN DE LAS BASES DE COTIZACIÓN A LA SEGURIDAD SOCIAL Y CONCEPTOS DE RECAUDACIÓN',
    midX, y - 8, fBold, FONT.small,
  );
  drawTextCenter(
    page,
    'CONJUNTA Y DE LA BASE SUJETA A RETENCIÓN DEL IRPF Y APORTACIÓN DE LA EMPRESA',
    midX, y - 16, fBold, FONT.small,
  );
  y -= detHeadH;
  drawHLine(page, xL, y, W);

  // Cabecera de columnas
  const bConceptX = xL + 5;
  const bBaseRight = xL + W * 0.55;
  const bRateRight = xL + W * 0.76;
  const bAportRight = xR - 6;
  drawText(page, 'CONCEPTO', bConceptX, y - 9, fBold, FONT.small);
  drawTextCenter(page, 'BASE', bBaseRight - 28, y - 9, fBold, FONT.small);
  drawTextCenter(page, 'TIPO', bRateRight - 22, y - 9, fBold, FONT.small);
  drawTextCenter(page, 'APORTACIÓN', bAportRight - 35, y - 4, fBold, FONT.tiny);
  drawTextCenter(page, 'EMPRESA', bAportRight - 35, y - 12, fBold, FONT.tiny);
  y -= 16;

  // Localizar contribuciones de empresa por palabra clave
  const findContrib = (rx: RegExp) => data.companyContributions.find((c) => rx.test(c.concept));
  const ccC = findContrib(/contingencias comunes|\bcc\b/i);
  const atepC = findContrib(/at\s*\/?\s*y?\s*ep|atep|accidente/i);
  const desC = findContrib(/desempleo/i);
  const fpC = findContrib(/formaci[oó]n|\bfp\b/i);
  const fogasaC = findContrib(/fogasa|fondo garant/i);
  const hxC = findContrib(/horas extra/i);

  const bRow = (
    label: string,
    base: string,
    rate: string,
    aport: string,
    bold = false,
    indent = 0,
  ) => {
    const f = bold ? fBold : fReg;
    drawText(page, label, bConceptX + indent, y, f, FONT.normal);
    if (base) drawTextRight(page, base, bBaseRight, y, fReg, FONT.normal);
    if (rate) drawTextRight(page, rate, bRateRight, y, fReg, FONT.normal);
    if (aport) drawTextRight(page, aport, bAportRight, y, fReg, FONT.normal);
    y -= LH.row;
  };

  // 1. Contingencias comunes
  bRow('1. Contingencias comunes', '', '', '', true);
  bRow('Importe remuneración Mensual', fmtMoney(data.remuneracionMensualCC), '', '', false, 6);
  bRow('Importe prorrata pagas extraordinarias', fmtMoney(data.prorrataPagasCC), '', '', false, 6);
  bRow(
    'TOTAL',
    fmtMoney(ccC?.base ?? data.baseCC),
    fmtRate(ccC?.rate),
    fmtMoney(ccC?.amount),
    true,
    24,
  );
  // Cotización adicional de solidaridad
  bRow('Cotización adicional de solidaridad', '', '', '', false);
  bRow('Primer tramo', '', '', '', false, 24);
  bRow('Segundo tramo', '', '', '', false, 24);
  bRow('Tercer tramo', '', '', '', false, 24);
  // 2. Contingencias profesionales
  bRow('2. Contingencias profesionales y conceptos de recaudación conjunta', '', '', '', true);
  bRow('AT y EP', fmtMoney(atepC?.base), fmtRate(atepC?.rate), fmtMoney(atepC?.amount), false, 24);
  bRow('Desempleo', fmtMoney(desC?.base), fmtRate(desC?.rate), fmtMoney(desC?.amount), false, 24);
  bRow('Formación Profesional', fmtMoney(fpC?.base), fmtRate(fpC?.rate), fmtMoney(fpC?.amount), false, 24);
  bRow('Fondo Garantía Salarial', fmtMoney(fogasaC?.base), fmtRate(fogasaC?.rate), fmtMoney(fogasaC?.amount), false, 24);
  // 3. Cotización adicional horas extraordinarias
  bRow('3. Cotización adicional horas extraordinarias', fmtMoney(hxC?.base), fmtRate(hxC?.rate), fmtMoney(hxC?.amount), true);
  // 4. Base sujeta a retención del IRPF
  drawText(page, '4. Base sujeta a retención del IRPF', bConceptX, y, fBold, FONT.normal);
  drawTextRight(page, fmtMoney(data.baseIRPF), bBaseRight, y, fBold, FONT.normal);
  drawText(page, 'Bonificaciones/Reducciones', bRateRight + 4, y, fReg, FONT.small, C.midGray);
  y -= LH.row;

  // ==========================================================================
  // Marco exterior + pie legal
  // ==========================================================================
  const frameBottom = y - 2;
  drawBorder(page, xL, frameBottom, W, frameTop - frameBottom, 0.8, C.line);

  y = frameBottom - 9;
  drawText(
    page,
    'Este recibo se ajusta al modelo oficial aprobado por Orden ESS/2098/2014, de 6 de noviembre (BOE 11/11/2014).',
    xL + 2, y, fReg, FONT.tiny, C.midGray,
  );

  return pdf.save();
}
