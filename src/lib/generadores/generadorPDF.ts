// ============================================================================
// generadorPDF.ts — Generador de nóminas en PDF (RECIBO DE SALARIOS)
// Formato oficial español según modelo del Ministerio de Trabajo
// Utiliza pdf-lib para la generación sin dependencias nativas
// ============================================================================

import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb, PDFPageDrawTextOptions } from 'pdf-lib';

// ---------------------------------------------------------------------------
// Tipos para los datos de la nómina PDF
// ---------------------------------------------------------------------------

/** Datos de la empresa */
export interface PayslipCompanyInfo {
  /** Razón social / nombre de la empresa */
  name: string;
  /** CIF de la empresa */
  cif: string;
  /** Código de Cuenta de Cotización (CCC) */
  ccc: string;
  /** Domicilio fiscal */
  address?: string;
}

/** Datos del trabajador */
export interface PayslipEmployeeInfo {
  /** Nombre completo del trabajador */
  name: string;
  /** NIF / DNI del trabajador */
  nif: string;
  /** Número de afiliación a la Seguridad Social (NSS) */
  nss: string;
  /** Categoría profesional */
  category: string;
  /** Grupo de cotización (1-11) */
  cotizationGroup: number;
  /** Antigüedad en la empresa (fecha de alta) */
  startDate?: string;
}

/** Línea de devengo (percepción salarial o no salarial) */
export interface PayslipAccrualLine {
  /** Código del concepto (ej: "001", "002") */
  code: string;
  /** Descripción del concepto (ej: "Salario base", "Plus convenio") */
  concept: string;
  /** Importe en euros */
  amount: number;
}

/** Línea de deducción (cotización SS o IRPF) */
export interface PayslipDeductionLine {
  /** Código del concepto */
  code: string;
  /** Descripción del concepto (ej: "Contingencias comunes") */
  concept: string;
  /** Base sobre la que se aplica el porcentaje */
  base: number;
  /** Porcentaje aplicado (ej: 4.70) */
  rate: number;
  /** Importe resultante */
  amount: number;
}

/** Línea de aportación empresarial a la Seguridad Social */
export interface PayslipContributionLine {
  /** Descripción del concepto */
  concept: string;
  /** Base de cotización */
  base: number;
  /** Porcentaje aplicado */
  rate: number;
  /** Importe de la aportación */
  amount: number;
}

/** Datos completos para generar la nómina en PDF */
export interface PayslipPDFData {
  /** Datos de la empresa */
  company: PayslipCompanyInfo;
  /** Datos del trabajador */
  employee: PayslipEmployeeInfo;
  /** Período de liquidación: fecha de inicio (YYYY-MM-DD) */
  periodStart: string;
  /** Período de liquidación: fecha de fin (YYYY-MM-DD) */
  periodEnd: string;
  /** Días trabajados en el período */
  workedDays: number;
  /** Días totales del período (naturales) */
  totalDays: number;

  // --- Devengos ---
  /** Percepciones salariales */
  salaryAccruals: PayslipAccrualLine[];
  /** Percepciones no salariales */
  nonSalaryAccruals: PayslipAccrualLine[];

  // --- Deducciones del trabajador ---
  /** Deducciones de Seguridad Social + IRPF + otras */
  deductions: PayslipDeductionLine[];

  // --- Aportación empresarial ---
  /** Cotizaciones de la empresa a la Seguridad Social */
  companyContributions: PayslipContributionLine[];

  // --- Totales ---
  /** Total devengos (bruto) */
  totalAccruals: number;
  /** Total deducciones del trabajador */
  totalDeductions: number;
  /** Líquido a percibir (neto) */
  netPay: number;

  // --- Bases de cotización ---
  /** Base de contingencias comunes */
  baseCC: number;
  /** Base de contingencias profesionales (AT/EP) */
  baseCP: number;
  /** Base sujeta a retención de IRPF */
  baseIRPF: number;
  /** Tipo de retención IRPF aplicado (%) */
  irpfRate: number;

  // --- Datos bancarios y firma ---
  /** IBAN de la cuenta del trabajador */
  iban: string;
  /** Fecha de emisión del recibo (YYYY-MM-DD) */
  issueDate: string;
}

// ---------------------------------------------------------------------------
// Constantes de diseño del documento
// ---------------------------------------------------------------------------

/** Márgenes del documento en puntos (1 punto = 1/72 pulgadas) */
const MARGIN = {
  left: 40,
  right: 40,
  top: 40,
  bottom: 40,
} as const;

/** Tamaños de fuente */
const FONT_SIZE = {
  title: 12,
  sectionHeader: 9,
  normal: 7.5,
  small: 6.5,
  footer: 7,
} as const;

/** Colores */
const COLORS = {
  black: rgb(0, 0, 0),
  darkGray: rgb(0.3, 0.3, 0.3),
  mediumGray: rgb(0.5, 0.5, 0.5),
  lightGray: rgb(0.85, 0.85, 0.85),
  headerBg: rgb(0.92, 0.92, 0.92),
  white: rgb(1, 1, 1),
  accentBlue: rgb(0.15, 0.25, 0.45),
} as const;

/** Altura de línea por tamaño de fuente */
const LINE_HEIGHT = {
  title: 16,
  sectionHeader: 14,
  normal: 11,
  small: 9,
  footer: 10,
} as const;

// ---------------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------------

/**
 * Formatea un número como moneda española (2 decimales, separador de miles)
 * Ej: 1234.50 → "1.234,50"
 */
function formatCurrency(amount: number): string {
  const fixed = Math.abs(amount).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = amount < 0 ? '-' : '';
  return `${sign}${withThousands},${decPart}`;
}

/**
 * Formatea un porcentaje con 2 decimales
 * Ej: 4.7 → "4,70"
 */
function formatRate(rate: number): string {
  return rate.toFixed(2).replace('.', ',');
}

/**
 * Formatea una fecha YYYY-MM-DD al formato español DD/MM/YYYY
 */
function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Extrae el nombre del mes en español a partir de una fecha YYYY-MM-DD
 */
function getMonthName(dateStr: string): string {
  const months = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
  ];
  const monthIndex = parseInt(dateStr.split('-')[1], 10) - 1;
  return months[monthIndex] ?? '';
}

/**
 * Extrae el año de una fecha YYYY-MM-DD
 */
function getYear(dateStr: string): string {
  return dateStr.split('-')[0];
}

/**
 * Dibuja un rectángulo de fondo en la página
 */
function drawRect(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  color: ReturnType<typeof rgb>,
) {
  page.drawRectangle({ x, y, width, height, color });
}

/**
 * Dibuja una línea horizontal
 */
function drawHLine(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  thickness = 0.5,
  color = COLORS.darkGray,
) {
  page.drawLine({
    start: { x, y },
    end: { x: x + width, y },
    thickness,
    color,
  });
}

/**
 * Dibuja texto alineado a la derecha en una posición dada
 */
function drawTextRight(
  page: PDFPage,
  text: string,
  font: PDFFont,
  fontSize: number,
  rightX: number,
  y: number,
  color = COLORS.black,
) {
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  page.drawText(text, { x: rightX - textWidth, y, size: fontSize, font, color });
}

/**
 * Trunca un texto para que no exceda un ancho dado
 */
function truncateText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && font.widthOfTextAtSize(truncated + '…', fontSize) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '…';
}

// ---------------------------------------------------------------------------
// Función principal: Generación del PDF de nómina
// ---------------------------------------------------------------------------

/**
 * Genera un PDF con el recibo de salarios (nómina) en formato oficial español.
 *
 * El documento sigue la estructura del modelo oficial del Ministerio de Trabajo:
 * 1. Cabecera con datos de empresa y trabajador
 * 2. Período de liquidación
 * 3. Devengos (percepciones salariales y no salariales)
 * 4. Deducciones (cotizaciones SS + IRPF)
 * 5. Aportación empresarial a la Seguridad Social
 * 6. Totales y firma
 *
 * @param payslipData - Todos los datos necesarios para generar la nómina
 * @returns Buffer con el PDF generado en formato Uint8Array
 */
export async function generatePayslipPDF(payslipData: PayslipPDFData): Promise<Uint8Array> {
  // Crear documento PDF (tamaño A4: 595.28 x 841.89 puntos)
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);

  // Incrustar fuentes estándar
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = page.getWidth();
  const contentWidth = pageWidth - MARGIN.left - MARGIN.right;

  // Cursor vertical (empieza arriba y baja)
  let y = page.getHeight() - MARGIN.top;

  // =========================================================================
  // 1. TÍTULO: RECIBO INDIVIDUAL JUSTIFICATIVO DEL PAGO DE SALARIOS
  // =========================================================================

  drawRect(page, MARGIN.left, y - 18, contentWidth, 20, COLORS.accentBlue);
  page.drawText('RECIBO INDIVIDUAL JUSTIFICATIVO DEL PAGO DE SALARIOS', {
    x: MARGIN.left + 6,
    y: y - 14,
    size: FONT_SIZE.title,
    font: fontBold,
    color: COLORS.white,
  });
  y -= 28;

  // =========================================================================
  // 2. CABECERA: DATOS DE LA EMPRESA Y DEL TRABAJADOR
  // =========================================================================

  const headerStartY = y;
  const halfWidth = contentWidth / 2 - 4;

  // --- Bloque empresa (izquierda) ---
  drawRect(page, MARGIN.left, y - 62, halfWidth, 62, COLORS.headerBg);
  drawHLine(page, MARGIN.left, y, halfWidth, 0.75, COLORS.accentBlue);

  page.drawText('EMPRESA', {
    x: MARGIN.left + 4,
    y: y - 10,
    size: FONT_SIZE.sectionHeader,
    font: fontBold,
    color: COLORS.accentBlue,
  });

  const companyLines = [
    `Nombre: ${payslipData.company.name}`,
    `CIF: ${payslipData.company.cif}`,
    `CCC: ${payslipData.company.ccc}`,
    payslipData.company.address ? `Domicilio: ${payslipData.company.address}` : '',
  ].filter(Boolean);

  let companyY = y - 22;
  for (const line of companyLines) {
    const display = truncateText(line, fontRegular, FONT_SIZE.normal, halfWidth - 10);
    page.drawText(display, {
      x: MARGIN.left + 6,
      y: companyY,
      size: FONT_SIZE.normal,
      font: fontRegular,
      color: COLORS.black,
    });
    companyY -= LINE_HEIGHT.normal;
  }

  // --- Bloque trabajador (derecha) ---
  const rightBlockX = MARGIN.left + halfWidth + 8;
  drawRect(page, rightBlockX, y - 62, halfWidth, 62, COLORS.headerBg);
  drawHLine(page, rightBlockX, y, halfWidth, 0.75, COLORS.accentBlue);

  page.drawText('TRABAJADOR', {
    x: rightBlockX + 4,
    y: y - 10,
    size: FONT_SIZE.sectionHeader,
    font: fontBold,
    color: COLORS.accentBlue,
  });

  const employeeLines = [
    `Nombre: ${payslipData.employee.name}`,
    `NIF: ${payslipData.employee.nif}    NSS: ${payslipData.employee.nss}`,
    `Categoría: ${payslipData.employee.category}    Grupo: ${payslipData.employee.cotizationGroup}`,
    payslipData.employee.startDate ? `Antigüedad: ${formatDate(payslipData.employee.startDate)}` : '',
  ].filter(Boolean);

  let employeeY = y - 22;
  for (const line of employeeLines) {
    const display = truncateText(line, fontRegular, FONT_SIZE.normal, halfWidth - 10);
    page.drawText(display, {
      x: rightBlockX + 6,
      y: employeeY,
      size: FONT_SIZE.normal,
      font: fontRegular,
      color: COLORS.black,
    });
    employeeY -= LINE_HEIGHT.normal;
  }

  y -= 70;

  // =========================================================================
  // 3. PERÍODO DE LIQUIDACIÓN
  // =========================================================================

  drawRect(page, MARGIN.left, y - 16, contentWidth, 16, COLORS.accentBlue);
  const periodText = `PERÍODO DE LIQUIDACIÓN: ${getMonthName(payslipData.periodStart)} ${getYear(payslipData.periodStart)}`;
  page.drawText(periodText, {
    x: MARGIN.left + 6,
    y: y - 12,
    size: FONT_SIZE.sectionHeader,
    font: fontBold,
    color: COLORS.white,
  });

  const daysText = `Del ${formatDate(payslipData.periodStart)} al ${formatDate(payslipData.periodEnd)}    |    Días trabajados: ${payslipData.workedDays} / ${payslipData.totalDays}`;
  drawTextRight(page, daysText, fontRegular, FONT_SIZE.small, pageWidth - MARGIN.right - 6, y - 12, COLORS.white);

  y -= 24;

  // =========================================================================
  // 4. DEVENGOS (PERCEPCIONES)
  // =========================================================================

  // Cabecera de la sección
  drawRect(page, MARGIN.left, y - 14, contentWidth, 14, COLORS.headerBg);
  drawHLine(page, MARGIN.left, y, contentWidth, 0.5);

  page.drawText('I. DEVENGOS', {
    x: MARGIN.left + 4,
    y: y - 10,
    size: FONT_SIZE.sectionHeader,
    font: fontBold,
    color: COLORS.accentBlue,
  });
  y -= 14;

  // Subcabecera de columnas: Código | Concepto | Importe
  drawHLine(page, MARGIN.left, y, contentWidth, 0.3);
  y -= 2;

  const colCode = MARGIN.left + 4;
  const colConcept = MARGIN.left + 50;
  const colAmount = pageWidth - MARGIN.right - 6;

  page.drawText('Cód.', { x: colCode, y: y - 8, size: FONT_SIZE.small, font: fontBold, color: COLORS.mediumGray });
  page.drawText('Concepto', { x: colConcept, y: y - 8, size: FONT_SIZE.small, font: fontBold, color: COLORS.mediumGray });
  drawTextRight(page, 'Importe (€)', fontBold, FONT_SIZE.small, colAmount, y - 8, COLORS.mediumGray);
  y -= 12;
  drawHLine(page, MARGIN.left, y, contentWidth, 0.3, COLORS.lightGray);

  // --- Percepciones salariales ---
  if (payslipData.salaryAccruals.length > 0) {
    y -= 2;
    page.drawText('A) Percepciones salariales', {
      x: colCode,
      y: y - 8,
      size: FONT_SIZE.small,
      font: fontBold,
      color: COLORS.darkGray,
    });
    y -= LINE_HEIGHT.small + 2;

    for (const item of payslipData.salaryAccruals) {
      page.drawText(item.code, { x: colCode, y: y - 8, size: FONT_SIZE.normal, font: fontRegular, color: COLORS.darkGray });
      const conceptText = truncateText(item.concept, fontRegular, FONT_SIZE.normal, colAmount - colConcept - 80);
      page.drawText(conceptText, { x: colConcept, y: y - 8, size: FONT_SIZE.normal, font: fontRegular, color: COLORS.black });
      drawTextRight(page, formatCurrency(item.amount), fontRegular, FONT_SIZE.normal, colAmount, y - 8);
      y -= LINE_HEIGHT.normal;
    }
  }

  // --- Percepciones no salariales ---
  if (payslipData.nonSalaryAccruals.length > 0) {
    y -= 2;
    page.drawText('B) Percepciones no salariales', {
      x: colCode,
      y: y - 8,
      size: FONT_SIZE.small,
      font: fontBold,
      color: COLORS.darkGray,
    });
    y -= LINE_HEIGHT.small + 2;

    for (const item of payslipData.nonSalaryAccruals) {
      page.drawText(item.code, { x: colCode, y: y - 8, size: FONT_SIZE.normal, font: fontRegular, color: COLORS.darkGray });
      const conceptText = truncateText(item.concept, fontRegular, FONT_SIZE.normal, colAmount - colConcept - 80);
      page.drawText(conceptText, { x: colConcept, y: y - 8, size: FONT_SIZE.normal, font: fontRegular, color: COLORS.black });
      drawTextRight(page, formatCurrency(item.amount), fontRegular, FONT_SIZE.normal, colAmount, y - 8);
      y -= LINE_HEIGHT.normal;
    }
  }

  // --- Total devengos ---
  y -= 2;
  drawHLine(page, MARGIN.left, y, contentWidth, 0.5);
  y -= 2;
  drawRect(page, MARGIN.left, y - 12, contentWidth, 12, COLORS.headerBg);

  page.drawText('A. TOTAL DEVENGOS', {
    x: colCode,
    y: y - 9,
    size: FONT_SIZE.normal,
    font: fontBold,
    color: COLORS.accentBlue,
  });
  drawTextRight(page, `${formatCurrency(payslipData.totalAccruals)} €`, fontBold, FONT_SIZE.normal, colAmount, y - 9, COLORS.accentBlue);
  y -= 18;

  // =========================================================================
  // 5. DEDUCCIONES DEL TRABAJADOR
  // =========================================================================

  drawRect(page, MARGIN.left, y - 14, contentWidth, 14, COLORS.headerBg);
  drawHLine(page, MARGIN.left, y, contentWidth, 0.5);

  page.drawText('II. DEDUCCIONES', {
    x: MARGIN.left + 4,
    y: y - 10,
    size: FONT_SIZE.sectionHeader,
    font: fontBold,
    color: COLORS.accentBlue,
  });
  y -= 14;

  // Subcabecera: Código | Concepto | Base | Tipo% | Importe
  drawHLine(page, MARGIN.left, y, contentWidth, 0.3);
  y -= 2;

  const colBase = pageWidth - MARGIN.right - 150;
  const colRate = pageWidth - MARGIN.right - 80;

  page.drawText('Cód.', { x: colCode, y: y - 8, size: FONT_SIZE.small, font: fontBold, color: COLORS.mediumGray });
  page.drawText('Concepto', { x: colConcept, y: y - 8, size: FONT_SIZE.small, font: fontBold, color: COLORS.mediumGray });
  drawTextRight(page, 'Base (€)', fontBold, FONT_SIZE.small, colBase + 60, y - 8, COLORS.mediumGray);
  drawTextRight(page, 'Tipo %', fontBold, FONT_SIZE.small, colRate + 40, y - 8, COLORS.mediumGray);
  drawTextRight(page, 'Importe (€)', fontBold, FONT_SIZE.small, colAmount, y - 8, COLORS.mediumGray);
  y -= 12;
  drawHLine(page, MARGIN.left, y, contentWidth, 0.3, COLORS.lightGray);

  for (const item of payslipData.deductions) {
    page.drawText(item.code, { x: colCode, y: y - 8, size: FONT_SIZE.normal, font: fontRegular, color: COLORS.darkGray });
    const conceptText = truncateText(item.concept, fontRegular, FONT_SIZE.normal, colBase - colConcept - 10);
    page.drawText(conceptText, { x: colConcept, y: y - 8, size: FONT_SIZE.normal, font: fontRegular, color: COLORS.black });
    drawTextRight(page, formatCurrency(item.base), fontRegular, FONT_SIZE.normal, colBase + 60, y - 8, COLORS.darkGray);
    drawTextRight(page, formatRate(item.rate), fontRegular, FONT_SIZE.normal, colRate + 40, y - 8, COLORS.darkGray);
    drawTextRight(page, formatCurrency(item.amount), fontRegular, FONT_SIZE.normal, colAmount, y - 8);
    y -= LINE_HEIGHT.normal;
  }

  // --- Total deducciones ---
  y -= 2;
  drawHLine(page, MARGIN.left, y, contentWidth, 0.5);
  y -= 2;
  drawRect(page, MARGIN.left, y - 12, contentWidth, 12, COLORS.headerBg);

  page.drawText('B. TOTAL DEDUCCIONES', {
    x: colCode,
    y: y - 9,
    size: FONT_SIZE.normal,
    font: fontBold,
    color: COLORS.accentBlue,
  });
  drawTextRight(page, `${formatCurrency(payslipData.totalDeductions)} €`, fontBold, FONT_SIZE.normal, colAmount, y - 9, COLORS.accentBlue);
  y -= 18;

  // =========================================================================
  // 6. APORTACIÓN EMPRESARIAL A LA SEGURIDAD SOCIAL
  // =========================================================================

  drawRect(page, MARGIN.left, y - 14, contentWidth, 14, COLORS.headerBg);
  drawHLine(page, MARGIN.left, y, contentWidth, 0.5);

  page.drawText('III. APORTACIÓN EMPRESARIAL A LA SEGURIDAD SOCIAL', {
    x: MARGIN.left + 4,
    y: y - 10,
    size: FONT_SIZE.sectionHeader,
    font: fontBold,
    color: COLORS.accentBlue,
  });
  y -= 14;

  // Subcabecera
  drawHLine(page, MARGIN.left, y, contentWidth, 0.3);
  y -= 2;

  page.drawText('Concepto', { x: colCode, y: y - 8, size: FONT_SIZE.small, font: fontBold, color: COLORS.mediumGray });
  drawTextRight(page, 'Base (€)', fontBold, FONT_SIZE.small, colBase + 60, y - 8, COLORS.mediumGray);
  drawTextRight(page, 'Tipo %', fontBold, FONT_SIZE.small, colRate + 40, y - 8, COLORS.mediumGray);
  drawTextRight(page, 'Importe (€)', fontBold, FONT_SIZE.small, colAmount, y - 8, COLORS.mediumGray);
  y -= 12;
  drawHLine(page, MARGIN.left, y, contentWidth, 0.3, COLORS.lightGray);

  let totalContributions = 0;
  for (const item of payslipData.companyContributions) {
    const conceptText = truncateText(item.concept, fontRegular, FONT_SIZE.normal, colBase - colCode - 10);
    page.drawText(conceptText, { x: colCode, y: y - 8, size: FONT_SIZE.normal, font: fontRegular, color: COLORS.black });
    drawTextRight(page, formatCurrency(item.base), fontRegular, FONT_SIZE.normal, colBase + 60, y - 8, COLORS.darkGray);
    drawTextRight(page, formatRate(item.rate), fontRegular, FONT_SIZE.normal, colRate + 40, y - 8, COLORS.darkGray);
    drawTextRight(page, formatCurrency(item.amount), fontRegular, FONT_SIZE.normal, colAmount, y - 8);
    totalContributions += item.amount;
    y -= LINE_HEIGHT.normal;
  }

  // --- Total aportación empresarial ---
  y -= 2;
  drawHLine(page, MARGIN.left, y, contentWidth, 0.5);
  y -= 2;
  drawRect(page, MARGIN.left, y - 12, contentWidth, 12, COLORS.headerBg);

  page.drawText('TOTAL APORTACIÓN EMPRESARIAL', {
    x: colCode,
    y: y - 9,
    size: FONT_SIZE.normal,
    font: fontBold,
    color: COLORS.accentBlue,
  });
  drawTextRight(page, `${formatCurrency(totalContributions)} €`, fontBold, FONT_SIZE.normal, colAmount, y - 9, COLORS.accentBlue);
  y -= 24;

  // =========================================================================
  // 7. BASES DE COTIZACIÓN
  // =========================================================================

  drawRect(page, MARGIN.left, y - 14, contentWidth, 14, COLORS.headerBg);
  drawHLine(page, MARGIN.left, y, contentWidth, 0.5);

  page.drawText('DETERMINACIÓN DE LAS BASES DE COTIZACIÓN Y CONCEPTOS DE RECAUDACIÓN CONJUNTA', {
    x: MARGIN.left + 4,
    y: y - 10,
    size: FONT_SIZE.small,
    font: fontBold,
    color: COLORS.accentBlue,
  });
  y -= 18;

  // Líneas de bases
  const basesLines = [
    { label: 'Base contingencias comunes', value: payslipData.baseCC },
    { label: 'Base contingencias profesionales (AT/EP)', value: payslipData.baseCP },
    { label: 'Base sujeta a retención IRPF', value: payslipData.baseIRPF },
    { label: 'Tipo retención IRPF aplicado', value: payslipData.irpfRate, isRate: true },
  ];

  for (const baseLine of basesLines) {
    page.drawText(baseLine.label, { x: colCode, y: y - 8, size: FONT_SIZE.normal, font: fontRegular, color: COLORS.darkGray });
    const valueText = baseLine.isRate ? `${formatRate(baseLine.value)} %` : `${formatCurrency(baseLine.value)} €`;
    drawTextRight(page, valueText, fontRegular, FONT_SIZE.normal, colAmount, y - 8);
    y -= LINE_HEIGHT.normal;
  }

  y -= 6;

  // =========================================================================
  // 8. PIE: LÍQUIDO A PERCIBIR, IBAN, FECHA Y FIRMA
  // =========================================================================

  drawHLine(page, MARGIN.left, y, contentWidth, 1, COLORS.accentBlue);
  y -= 4;

  // Caja de LÍQUIDO A PERCIBIR (neto)
  drawRect(page, MARGIN.left, y - 24, contentWidth, 24, COLORS.accentBlue);

  page.drawText('LÍQUIDO TOTAL A PERCIBIR (A - B)', {
    x: MARGIN.left + 8,
    y: y - 16,
    size: FONT_SIZE.title,
    font: fontBold,
    color: COLORS.white,
  });
  drawTextRight(page, `${formatCurrency(payslipData.netPay)} €`, fontBold, 14, colAmount, y - 17, COLORS.white);

  y -= 34;

  // Datos bancarios
  page.drawText(`Forma de pago: Transferencia bancaria`, {
    x: MARGIN.left + 4,
    y: y - 8,
    size: FONT_SIZE.normal,
    font: fontRegular,
    color: COLORS.darkGray,
  });

  page.drawText(`IBAN: ${payslipData.iban}`, {
    x: MARGIN.left + 4,
    y: y - 20,
    size: FONT_SIZE.normal,
    font: fontBold,
    color: COLORS.black,
  });

  y -= 34;

  // Fecha y firmas
  drawHLine(page, MARGIN.left, y, contentWidth, 0.3, COLORS.lightGray);
  y -= 4;

  page.drawText(`Fecha: ${formatDate(payslipData.issueDate)}`, {
    x: MARGIN.left + 4,
    y: y - 10,
    size: FONT_SIZE.normal,
    font: fontRegular,
    color: COLORS.darkGray,
  });

  // Línea de firma empresa
  const signLineWidth = 150;
  const signCompanyX = MARGIN.left + 80;
  const signEmployeeX = pageWidth - MARGIN.right - signLineWidth - 20;

  y -= 40;
  drawHLine(page, signCompanyX, y, signLineWidth, 0.5, COLORS.mediumGray);
  page.drawText('Sello y firma de la empresa', {
    x: signCompanyX + 20,
    y: y - 10,
    size: FONT_SIZE.small,
    font: fontRegular,
    color: COLORS.mediumGray,
  });

  drawHLine(page, signEmployeeX, y, signLineWidth, 0.5, COLORS.mediumGray);
  page.drawText('Recibí (firma del trabajador)', {
    x: signEmployeeX + 15,
    y: y - 10,
    size: FONT_SIZE.small,
    font: fontRegular,
    color: COLORS.mediumGray,
  });

  // Nota legal al pie
  y -= 30;
  page.drawText(
    'Este recibo se ajusta al modelo oficial aprobado por la Orden ESS/2098/2014, de 6 de noviembre.',
    { x: MARGIN.left + 4, y: y, size: FONT_SIZE.small, font: fontRegular, color: COLORS.mediumGray },
  );

  // =========================================================================
  // Serializar y devolver el PDF
  // =========================================================================

  return pdfDoc.save();
}
