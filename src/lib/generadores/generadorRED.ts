// ============================================================================
// generadorRED.ts — Generador de ficheros RED (Remisión Electrónica de Datos)
// Sistema de liquidación directa de la Seguridad Social española
//
// Formato: Fichero de texto plano con registros de longitud fija (posicional)
// Cada línea tiene exactamente un tipo de registro con campos de ancho fijo
//
// Estructura del fichero:
//   Registro tipo 0 — Cabecera del fichero (datos de la empresa y período)
//   Registro tipo 1 — Detalle por trabajador (uno por cada empleado)
//   Registro tipo 9 — Registro de totales (cierre del fichero)
//
// Referencia: Orden TAS/1562/2005, de 25 de mayo (BOE nº 129)
// y actualizaciones posteriores del sistema RED de la TGSS
// ============================================================================

// ---------------------------------------------------------------------------
// Tipos para la generación del fichero RED
// ---------------------------------------------------------------------------

/** Datos de la empresa para el fichero RED */
export interface REDCompanyInfo {
  /** Código de Cuenta de Cotización (CCC) — 11 dígitos */
  ccc: string;
  /** Razón social de la empresa */
  companyName: string;
  /** CIF/NIF de la empresa */
  cif: string;
  /** Código de actividad económica (CNAE) — 4 dígitos */
  cnae?: string;
}

/** Registro de cotización de un trabajador */
export interface REDEmployeeRecord {
  /** Número de afiliación a la Seguridad Social (NSS) — 12 dígitos */
  nss: string;
  /** NIF/DNI del trabajador */
  nif: string;
  /** Apellidos y nombre del trabajador */
  fullName: string;
  /** Grupo de cotización (01-11) */
  cotizationGroup: number;
  /** Tipo de contrato (código numérico, ej: 100 = indefinido ordinario) */
  contractType: string;
  /** Base de cotización por contingencias comunes (céntimos de euro) */
  baseCC: number;
  /** Base de cotización por contingencias profesionales AT/EP (céntimos de euro) */
  baseATEP: number;
  /** Base de cotización por horas extras normales (céntimos de euro) */
  baseOvertimeNormal: number;
  /** Base de cotización por horas extras fuerza mayor (céntimos de euro) */
  baseOvertimeForceMajeure: number;
  /** Días trabajados en el período */
  workedDays: number;
  /** Días totales del período de liquidación */
  totalDays: number;
  /** Importe cotización contingencias comunes trabajador (céntimos) */
  workerCCAmount: number;
  /** Importe cotización desempleo trabajador (céntimos) */
  workerUnemploymentAmount: number;
  /** Importe cotización formación profesional trabajador (céntimos) */
  workerTrainingAmount: number;
  /** Importe cotización MEI trabajador (céntimos) */
  workerMEIAmount: number;
  /** Importe cotización horas extras normales trabajador (céntimos) */
  workerOvertimeNormalAmount: number;
  /** Importe cotización horas extras fuerza mayor trabajador (céntimos) */
  workerOvertimeFMAmount: number;
  /** Importe cotización contingencias comunes empresa (céntimos) */
  companyCCAmount: number;
  /** Importe cotización AT/EP empresa (céntimos) */
  companyATEPAmount: number;
  /** Importe cotización desempleo empresa (céntimos) */
  companyUnemploymentAmount: number;
  /** Importe cotización FOGASA empresa (céntimos) */
  companyFOGASAAmount: number;
  /** Importe cotización formación profesional empresa (céntimos) */
  companyTrainingAmount: number;
  /** Importe cotización MEI empresa (céntimos) */
  companyMEIAmount: number;
  /** Situación de la relación laboral (A=alta, B=baja) */
  employmentStatus?: 'A' | 'B';
  /** Fecha de alta en la empresa (YYYYMMDD) */
  startDate?: string;
  /** Fecha de baja en la empresa (YYYYMMDD) — solo si está de baja */
  endDate?: string;
}

/** Datos completos para generar el fichero RED */
export interface REDFileData {
  /** Datos de la empresa */
  company: REDCompanyInfo;
  /** Período de liquidación: mes (1-12) */
  month: number;
  /** Período de liquidación: año (YYYY) */
  year: number;
  /** Registros de cotización (uno por trabajador) */
  employees: REDEmployeeRecord[];
  /** Tipo de liquidación: L00 = Liquidación normal, L13 = Complementaria */
  liquidationType?: string;
}

// ---------------------------------------------------------------------------
// Utilidades internas para formato posicional
// ---------------------------------------------------------------------------

/**
 * Rellena un texto por la derecha con espacios hasta la longitud indicada.
 * Si el texto es más largo, lo trunca.
 * Campos alfanuméricos se alinean a la izquierda.
 */
function padRight(text: string, length: number): string {
  return text.substring(0, length).padEnd(length, ' ');
}

/**
 * Rellena un número por la izquierda con ceros hasta la longitud indicada.
 * Campos numéricos se alinean a la derecha con ceros.
 */
function padLeft(value: string | number, length: number, fillChar = '0'): string {
  return String(value).substring(0, length).padStart(length, fillChar);
}

/**
 * Convierte un importe en euros a céntimos y lo formatea como string
 * rellenado con ceros a la izquierda.
 * Ej: 1234.56 → "000000123456" (12 posiciones)
 */
function formatAmountCents(amountEuros: number, length: number): string {
  const cents = Math.round(Math.abs(amountEuros) * 100);
  return padLeft(cents, length);
}

/**
 * Formatea un importe que ya está en céntimos como string posicional.
 * Ej: 123456 → "000000123456" (12 posiciones)
 */
function formatCentsRaw(amountCents: number, length: number): string {
  return padLeft(Math.round(Math.abs(amountCents)), length);
}

// ---------------------------------------------------------------------------
// Función principal: Generación del fichero RED
// ---------------------------------------------------------------------------

/**
 * Genera un fichero RED (Remisión Electrónica de Datos) para la Seguridad Social.
 *
 * El fichero sigue el formato posicional establecido por la TGSS (Tesorería
 * General de la Seguridad Social) para la presentación de liquidaciones
 * de cotizaciones.
 *
 * Cada registro es una línea de texto con campos de longitud fija:
 * - Registro tipo 0 (Cabecera): Identifica la empresa y el período
 * - Registro tipo 1 (Detalle): Un registro por cada trabajador con sus bases y cuotas
 * - Registro tipo 9 (Totales): Suma de control de todas las bases y cuotas
 *
 * NOTA: Los importes se expresan en céntimos de euro (sin punto decimal).
 * Las bases y cuotas en los campos de entrada (REDEmployeeRecord) ya deben
 * estar en euros. La función realiza la conversión a céntimos internamente.
 *
 * @param data - Datos completos de la liquidación (empresa + trabajadores)
 * @returns String con el contenido del fichero RED (texto plano posicional)
 *
 * @example
 * ```typescript
 * const red = generateREDFile({
 *   company: { ccc: '28123456789', companyName: 'MI EMPRESA SL', cif: 'B12345678' },
 *   month: 1, year: 2025,
 *   employees: [{ nss: '281234567890', nif: '12345678A', fullName: 'GARCIA LOPEZ JUAN', ... }],
 * });
 * ```
 */
export function generateREDFile(data: REDFileData): string {
  const lines: string[] = [];
  const liquidationType = data.liquidationType ?? 'L00';

  // =========================================================================
  // Registro tipo 0 — CABECERA DEL FICHERO
  // =========================================================================
  //
  // Posiciones del registro de cabecera:
  //   01-01: Tipo de registro ("0")
  //   02-12: Código Cuenta de Cotización (CCC) — 11 dígitos
  //   13-52: Razón social de la empresa — 40 caracteres alfanuméricos
  //   53-61: CIF/NIF de la empresa — 9 caracteres
  //   62-65: Período: año (YYYY)
  //   66-67: Período: mes (MM)
  //   68-71: Total de trabajadores — 4 dígitos numéricos
  //   72-74: Tipo de liquidación — 3 caracteres (L00, L13, etc.)
  //   75-78: CNAE — 4 dígitos
  //   79-250: Reservado — espacios en blanco
  // =========================================================================

  const headerFields: string[] = [
    '0',                                              // Pos 01: Tipo de registro
    padLeft(data.company.ccc, 11),                    // Pos 02-12: CCC
    padRight(data.company.companyName.toUpperCase(), 40), // Pos 13-52: Razón social
    padRight(data.company.cif.toUpperCase(), 9),      // Pos 53-61: CIF
    padLeft(data.year, 4),                            // Pos 62-65: Año
    padLeft(data.month, 2),                           // Pos 66-67: Mes
    padLeft(data.employees.length, 4),                // Pos 68-71: Nº trabajadores
    padRight(liquidationType, 3),                     // Pos 72-74: Tipo liquidación
    padRight(data.company.cnae ?? '', 4),             // Pos 75-78: CNAE
    padRight('', 172),                                // Pos 79-250: Reservado
  ];
  lines.push(headerFields.join(''));

  // =========================================================================
  // Registros tipo 1 — DETALLE POR TRABAJADOR
  // =========================================================================
  //
  // Posiciones del registro de detalle:
  //   001-001: Tipo de registro ("1")
  //   002-012: CCC de la empresa — 11 dígitos
  //   013-024: NSS del trabajador — 12 dígitos
  //   025-033: NIF del trabajador — 9 caracteres
  //   034-073: Apellidos y nombre — 40 caracteres
  //   074-075: Grupo de cotización — 2 dígitos
  //   076-078: Tipo de contrato — 3 caracteres
  //   079-079: Situación laboral (A=alta, B=baja) — 1 carácter
  //   080-087: Fecha de alta (YYYYMMDD) — 8 dígitos
  //   088-095: Fecha de baja (YYYYMMDD) — 8 dígitos (espacios si no aplica)
  //   096-097: Días trabajados — 2 dígitos
  //   098-099: Días totales del período — 2 dígitos
  //   100-110: Base CC (céntimos, 11 dígitos)
  //   111-121: Base AT/EP (céntimos, 11 dígitos)
  //   122-132: Base horas extras normales (céntimos, 11 dígitos)
  //   133-143: Base horas extras fuerza mayor (céntimos, 11 dígitos)
  //   144-154: Cuota CC trabajador (céntimos, 11 dígitos)
  //   155-165: Cuota desempleo trabajador (céntimos, 11 dígitos)
  //   166-176: Cuota FP trabajador (céntimos, 11 dígitos)
  //   177-187: Cuota MEI trabajador (céntimos, 11 dígitos)
  //   188-198: Cuota HE normales trabajador (céntimos, 11 dígitos)
  //   199-209: Cuota HE FM trabajador (céntimos, 11 dígitos)
  //   210-220: Cuota CC empresa (céntimos, 11 dígitos)
  //   221-231: Cuota AT/EP empresa (céntimos, 11 dígitos)
  //   232-242: Cuota desempleo empresa (céntimos, 11 dígitos)
  //   243-253: Cuota FOGASA empresa (céntimos, 11 dígitos)
  //   254-264: Cuota FP empresa (céntimos, 11 dígitos)
  //   265-275: Cuota MEI empresa (céntimos, 11 dígitos)
  //   276-300: Reservado — espacios en blanco
  // =========================================================================

  // Acumuladores para el registro de totales
  let totalBaseCC = 0;
  let totalBaseATEP = 0;
  let totalBaseOvertimeNormal = 0;
  let totalBaseOvertimeFM = 0;
  let totalWorkerCC = 0;
  let totalWorkerUnemployment = 0;
  let totalWorkerTraining = 0;
  let totalWorkerMEI = 0;
  let totalWorkerOvertimeNormal = 0;
  let totalWorkerOvertimeFM = 0;
  let totalCompanyCC = 0;
  let totalCompanyATEP = 0;
  let totalCompanyUnemployment = 0;
  let totalCompanyFOGASA = 0;
  let totalCompanyTraining = 0;
  let totalCompanyMEI = 0;

  for (const emp of data.employees) {
    // Acumular totales
    totalBaseCC += emp.baseCC;
    totalBaseATEP += emp.baseATEP;
    totalBaseOvertimeNormal += emp.baseOvertimeNormal;
    totalBaseOvertimeFM += emp.baseOvertimeForceMajeure;
    totalWorkerCC += emp.workerCCAmount;
    totalWorkerUnemployment += emp.workerUnemploymentAmount;
    totalWorkerTraining += emp.workerTrainingAmount;
    totalWorkerMEI += emp.workerMEIAmount;
    totalWorkerOvertimeNormal += emp.workerOvertimeNormalAmount;
    totalWorkerOvertimeFM += emp.workerOvertimeFMAmount;
    totalCompanyCC += emp.companyCCAmount;
    totalCompanyATEP += emp.companyATEPAmount;
    totalCompanyUnemployment += emp.companyUnemploymentAmount;
    totalCompanyFOGASA += emp.companyFOGASAAmount;
    totalCompanyTraining += emp.companyTrainingAmount;
    totalCompanyMEI += emp.companyMEIAmount;

    const detailFields: string[] = [
      '1',                                                   // Pos 001: Tipo de registro
      padLeft(data.company.ccc, 11),                         // Pos 002-012: CCC
      padLeft(emp.nss, 12),                                  // Pos 013-024: NSS
      padRight(emp.nif.toUpperCase(), 9),                    // Pos 025-033: NIF
      padRight(emp.fullName.toUpperCase(), 40),              // Pos 034-073: Nombre
      padLeft(emp.cotizationGroup, 2),                       // Pos 074-075: Grupo cotización
      padRight(emp.contractType, 3),                         // Pos 076-078: Tipo contrato
      emp.employmentStatus ?? 'A',                           // Pos 079: Situación laboral
      padRight(emp.startDate ?? '', 8),                      // Pos 080-087: Fecha alta
      padRight(emp.endDate ?? '', 8),                        // Pos 088-095: Fecha baja
      padLeft(emp.workedDays, 2),                            // Pos 096-097: Días trabajados
      padLeft(emp.totalDays, 2),                             // Pos 098-099: Días totales
      formatAmountCents(emp.baseCC, 11),                     // Pos 100-110: Base CC
      formatAmountCents(emp.baseATEP, 11),                   // Pos 111-121: Base AT/EP
      formatAmountCents(emp.baseOvertimeNormal, 11),         // Pos 122-132: Base HE normales
      formatAmountCents(emp.baseOvertimeForceMajeure, 11),   // Pos 133-143: Base HE FM
      formatAmountCents(emp.workerCCAmount, 11),             // Pos 144-154: Cuota CC trab.
      formatAmountCents(emp.workerUnemploymentAmount, 11),   // Pos 155-165: Cuota desemp. trab.
      formatAmountCents(emp.workerTrainingAmount, 11),       // Pos 166-176: Cuota FP trab.
      formatAmountCents(emp.workerMEIAmount, 11),            // Pos 177-187: Cuota MEI trab.
      formatAmountCents(emp.workerOvertimeNormalAmount, 11), // Pos 188-198: Cuota HE norm. trab.
      formatAmountCents(emp.workerOvertimeFMAmount, 11),     // Pos 199-209: Cuota HE FM trab.
      formatAmountCents(emp.companyCCAmount, 11),            // Pos 210-220: Cuota CC emp.
      formatAmountCents(emp.companyATEPAmount, 11),          // Pos 221-231: Cuota AT/EP emp.
      formatAmountCents(emp.companyUnemploymentAmount, 11),  // Pos 232-242: Cuota desemp. emp.
      formatAmountCents(emp.companyFOGASAAmount, 11),        // Pos 243-253: Cuota FOGASA emp.
      formatAmountCents(emp.companyTrainingAmount, 11),      // Pos 254-264: Cuota FP emp.
      formatAmountCents(emp.companyMEIAmount, 11),           // Pos 265-275: Cuota MEI emp.
      padRight('', 25),                                      // Pos 276-300: Reservado
    ];
    lines.push(detailFields.join(''));
  }

  // =========================================================================
  // Registro tipo 9 — TOTALES DEL FICHERO
  // =========================================================================
  //
  // Posiciones del registro de totales:
  //   001-001: Tipo de registro ("9")
  //   002-012: CCC de la empresa — 11 dígitos
  //   013-016: Total de trabajadores — 4 dígitos
  //   017-029: Suma base CC (céntimos, 13 dígitos)
  //   030-042: Suma base AT/EP (céntimos, 13 dígitos)
  //   043-055: Suma base HE normales (céntimos, 13 dígitos)
  //   056-068: Suma base HE fuerza mayor (céntimos, 13 dígitos)
  //   069-081: Suma cuota CC trabajador (céntimos, 13 dígitos)
  //   082-094: Suma cuota desempleo trabajador (céntimos, 13 dígitos)
  //   095-107: Suma cuota FP trabajador (céntimos, 13 dígitos)
  //   108-120: Suma cuota MEI trabajador (céntimos, 13 dígitos)
  //   121-133: Suma cuota HE normales trabajador (céntimos, 13 dígitos)
  //   134-146: Suma cuota HE FM trabajador (céntimos, 13 dígitos)
  //   147-159: Suma cuota CC empresa (céntimos, 13 dígitos)
  //   160-172: Suma cuota AT/EP empresa (céntimos, 13 dígitos)
  //   173-185: Suma cuota desempleo empresa (céntimos, 13 dígitos)
  //   186-198: Suma cuota FOGASA empresa (céntimos, 13 dígitos)
  //   199-211: Suma cuota FP empresa (céntimos, 13 dígitos)
  //   212-224: Suma cuota MEI empresa (céntimos, 13 dígitos)
  //   225-250: Reservado — espacios en blanco
  // =========================================================================

  const totalFields: string[] = [
    '9',                                                 // Pos 001: Tipo de registro
    padLeft(data.company.ccc, 11),                       // Pos 002-012: CCC
    padLeft(data.employees.length, 4),                   // Pos 013-016: Nº trabajadores
    formatAmountCents(totalBaseCC, 13),                  // Pos 017-029: Σ Base CC
    formatAmountCents(totalBaseATEP, 13),                // Pos 030-042: Σ Base AT/EP
    formatAmountCents(totalBaseOvertimeNormal, 13),      // Pos 043-055: Σ Base HE norm.
    formatAmountCents(totalBaseOvertimeFM, 13),          // Pos 056-068: Σ Base HE FM
    formatAmountCents(totalWorkerCC, 13),                // Pos 069-081: Σ Cuota CC trab.
    formatAmountCents(totalWorkerUnemployment, 13),      // Pos 082-094: Σ Cuota desemp. trab.
    formatAmountCents(totalWorkerTraining, 13),          // Pos 095-107: Σ Cuota FP trab.
    formatAmountCents(totalWorkerMEI, 13),               // Pos 108-120: Σ Cuota MEI trab.
    formatAmountCents(totalWorkerOvertimeNormal, 13),    // Pos 121-133: Σ Cuota HE norm. trab.
    formatAmountCents(totalWorkerOvertimeFM, 13),        // Pos 134-146: Σ Cuota HE FM trab.
    formatAmountCents(totalCompanyCC, 13),               // Pos 147-159: Σ Cuota CC emp.
    formatAmountCents(totalCompanyATEP, 13),             // Pos 160-172: Σ Cuota AT/EP emp.
    formatAmountCents(totalCompanyUnemployment, 13),     // Pos 173-185: Σ Cuota desemp. emp.
    formatAmountCents(totalCompanyFOGASA, 13),           // Pos 186-198: Σ Cuota FOGASA emp.
    formatAmountCents(totalCompanyTraining, 13),         // Pos 199-211: Σ Cuota FP emp.
    formatAmountCents(totalCompanyMEI, 13),              // Pos 212-224: Σ Cuota MEI emp.
    padRight('', 26),                                    // Pos 225-250: Reservado
  ];
  lines.push(totalFields.join(''));

  return lines.join('\n');
}
