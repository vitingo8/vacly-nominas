// ============================================================================
// generadorSEPA.ts — Generador de ficheros SEPA XML (pain.001.003.03)
// Transferencias de crédito para el pago de nóminas
//
// Formato: ISO 20022 - pain.001.003.03 (SCT - SEPA Credit Transfer)
// Esquema XSD: urn:iso:std:iso:20022:tech:xsd:pain.001.003.03
//
// Estructura del XML:
//   <Document>
//     <CstmrCdtTrfInitn>          → Raíz de la iniciación de transferencia
//       <GrpHdr>                   → Cabecera del grupo (datos del ordenante)
//       <PmtInf>                   → Información de pago (instrucciones)
//         <CdtTrfTxInf>           → Detalle de cada transferencia individual
// ============================================================================

// ---------------------------------------------------------------------------
// Tipos para la generación SEPA
// ---------------------------------------------------------------------------

/** Datos de una transferencia individual (un empleado) */
export interface SEPATransfer {
  /** Nombre completo del empleado (beneficiario) */
  employeeName: string;
  /** IBAN del empleado (cuenta de destino) */
  employeeIBAN: string;
  /** Importe neto a transferir (en euros, 2 decimales) */
  amount: number;
  /** Referencia del pago (ej: "NOMINA GARCIA LOPEZ ENE2025") */
  reference: string;
  /** BIC/SWIFT del banco del empleado (opcional, SEPA no lo requiere) */
  employeeBIC?: string;
}

/** Datos de la empresa ordenante */
export interface SEPACompanyData {
  /** Razón social de la empresa */
  companyName: string;
  /** IBAN de la empresa (cuenta de cargo) */
  companyIBAN: string;
  /** BIC/SWIFT del banco de la empresa */
  companyBIC: string;
  /** Fecha de ejecución de los pagos (YYYY-MM-DD) */
  executionDate: string;
  /** CIF de la empresa (identificación del ordenante) */
  companyCIF?: string;
}

// ---------------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------------

/**
 * Escapa caracteres especiales para XML
 * Necesario para evitar inyección de XML en campos de texto libre
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Formatea un importe para SEPA (2 decimales, punto como separador)
 * Según el esquema XSD, los importes deben tener exactamente 2 decimales
 * Ej: 1234.50 → "1234.50"
 */
function formatSEPAAmount(amount: number): string {
  return amount.toFixed(2);
}

/**
 * Genera un identificador único para el mensaje SEPA
 * Formato: VACLY-YYYYMMDD-HHmmssSSS (máx. 35 caracteres según ISO 20022)
 */
function generateMessageId(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => n.toString().padStart(len, '0');
  return `VACLY-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(now.getMilliseconds(), 3)}`;
}

/**
 * Genera un identificador único para la información de pago
 * Formato: PMT-YYYYMMDD-HHmmssSSS
 */
function generatePaymentInfoId(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => n.toString().padStart(len, '0');
  return `PMT-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(now.getMilliseconds(), 3)}`;
}

/**
 * Genera la fecha/hora ISO 8601 actual para la cabecera del mensaje
 * Formato: YYYY-MM-DDThh:mm:ss
 */
function getCreationDateTime(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, '');
}

/**
 * Genera un identificador único para cada transacción individual
 * Formato: TXN-XXXXX (máx. 35 caracteres)
 */
function generateEndToEndId(index: number): string {
  const now = new Date();
  const pad = (n: number, len = 2) => n.toString().padStart(len, '0');
  return `TXN-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${(index + 1).toString().padStart(5, '0')}`;
}

/**
 * Limpia un IBAN eliminando espacios y convirtiendo a mayúsculas
 */
function cleanIBAN(iban: string): string {
  return iban.replace(/\s/g, '').toUpperCase();
}

/**
 * Trunca un texto al máximo de caracteres permitido por SEPA
 * Los campos de texto en SEPA tienen límites estrictos
 */
function truncateSEPA(text: string, maxLength: number): string {
  // SEPA solo permite ciertos caracteres (alfanuméricos básicos + algunos especiales)
  const cleaned = text.replace(/[^a-zA-Z0-9 \/\-?:().,'+ ñÑáéíóúÁÉÍÓÚüÜ]/g, '');
  return cleaned.substring(0, maxLength);
}

// ---------------------------------------------------------------------------
// Función principal: Generación del fichero SEPA XML
// ---------------------------------------------------------------------------

/**
 * Genera un fichero SEPA XML (pain.001.003.03) para transferencias de nóminas.
 *
 * El fichero generado cumple con el esquema ISO 20022 para iniciación de
 * transferencias de crédito SEPA (SCT). Cada empleado genera una transacción
 * individual dentro del mismo bloque de pago.
 *
 * Estructura del fichero:
 * - GrpHdr: Cabecera con ID del mensaje, fecha de creación, nº de transacciones
 *   y suma de control
 * - PmtInf: Información de pago con datos del ordenante (empresa), método de pago
 *   (TRF = transferencia), fecha de ejecución y cuenta de cargo
 * - CdtTrfTxInf: Una entrada por cada transferencia con importe, datos del
 *   beneficiario (empleado), cuenta IBAN de destino y concepto del pago
 *
 * @param transfers - Array de transferencias (una por empleado)
 * @param companyData - Datos de la empresa ordenante
 * @returns String con el contenido XML SEPA completo
 *
 * @example
 * ```typescript
 * const xml = generateSEPAFile(
 *   [{ employeeName: 'Juan García', employeeIBAN: 'ES12 3456 7890 1234 5678 90', amount: 1850.45, reference: 'NOMINA ENE2025' }],
 *   { companyName: 'Mi Empresa SL', companyIBAN: 'ES98 7654 3210 9876 5432 10', companyBIC: 'BBVAESMMXXX', executionDate: '2025-01-31' }
 * );
 * ```
 */
export function generateSEPAFile(
  transfers: SEPATransfer[],
  companyData: SEPACompanyData,
): string {
  // Validaciones básicas
  if (transfers.length === 0) {
    throw new Error('Se requiere al menos una transferencia para generar el fichero SEPA.');
  }

  const messageId = generateMessageId();
  const paymentInfoId = generatePaymentInfoId();
  const creationDateTime = getCreationDateTime();
  const numberOfTransactions = transfers.length;
  const controlSum = transfers.reduce((sum, t) => sum + t.amount, 0);

  const cleanCompanyIBAN = cleanIBAN(companyData.companyIBAN);
  const companyBIC = companyData.companyBIC.toUpperCase();

  // --- Construcción del XML ---
  const lines: string[] = [];

  // Declaración XML y raíz del documento
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.003.03"');
  lines.push('  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">');
  lines.push('  <CstmrCdtTrfInitn>');

  // =====================================================================
  // GrpHdr — Cabecera del grupo
  // Contiene la identificación del mensaje, fecha de creación,
  // número total de transacciones y la suma de control
  // =====================================================================
  lines.push('    <GrpHdr>');
  lines.push(`      <MsgId>${escapeXml(messageId)}</MsgId>`);
  lines.push(`      <CreDtTm>${creationDateTime}</CreDtTm>`);
  lines.push(`      <NbOfTxs>${numberOfTransactions}</NbOfTxs>`);
  lines.push(`      <CtrlSum>${formatSEPAAmount(controlSum)}</CtrlSum>`);
  // InitgPty — Parte iniciadora (la empresa)
  lines.push('      <InitgPty>');
  lines.push(`        <Nm>${escapeXml(truncateSEPA(companyData.companyName, 70))}</Nm>`);
  if (companyData.companyCIF) {
    lines.push('        <Id>');
    lines.push('          <OrgId>');
    lines.push('            <Othr>');
    lines.push(`              <Id>${escapeXml(companyData.companyCIF)}</Id>`);
    lines.push('              <SchmeNm>');
    lines.push('                <Cd>TXID</Cd>');
    lines.push('              </SchmeNm>');
    lines.push('            </Othr>');
    lines.push('          </OrgId>');
    lines.push('        </Id>');
  }
  lines.push('      </InitgPty>');
  lines.push('    </GrpHdr>');

  // =====================================================================
  // PmtInf — Información de pago
  // Define el método de pago, la fecha de ejecución y la cuenta
  // del ordenante (empresa). Contiene todas las transferencias individuales.
  // =====================================================================
  lines.push('    <PmtInf>');
  lines.push(`      <PmtInfId>${escapeXml(paymentInfoId)}</PmtInfId>`);
  // PmtMtd: TRF = Transferencia de crédito
  lines.push('      <PmtMtd>TRF</PmtMtd>');
  // BtchBookg: true = agrupar en un solo apunte contable
  lines.push('      <BtchBookg>true</BtchBookg>');
  lines.push(`      <NbOfTxs>${numberOfTransactions}</NbOfTxs>`);
  lines.push(`      <CtrlSum>${formatSEPAAmount(controlSum)}</CtrlSum>`);

  // PmtTpInf — Información del tipo de pago
  lines.push('      <PmtTpInf>');
  // InstrPrty: NORM = Prioridad normal
  lines.push('        <InstrPrty>NORM</InstrPrty>');
  // SvcLvl/Cd: SEPA = Servicio SEPA
  lines.push('        <SvcLvl>');
  lines.push('          <Cd>SEPA</Cd>');
  lines.push('        </SvcLvl>');
  // CtgyPurp/Cd: SALA = Pago de salarios
  lines.push('        <CtgyPurp>');
  lines.push('          <Cd>SALA</Cd>');
  lines.push('        </CtgyPurp>');
  lines.push('      </PmtTpInf>');

  // ReqdExctnDt — Fecha de ejecución solicitada
  lines.push(`      <ReqdExctnDt>${companyData.executionDate}</ReqdExctnDt>`);

  // Dbtr — Deudor (la empresa que paga)
  lines.push('      <Dbtr>');
  lines.push(`        <Nm>${escapeXml(truncateSEPA(companyData.companyName, 70))}</Nm>`);
  lines.push('      </Dbtr>');

  // DbtrAcct — Cuenta del deudor (IBAN de la empresa)
  lines.push('      <DbtrAcct>');
  lines.push('        <Id>');
  lines.push(`          <IBAN>${cleanCompanyIBAN}</IBAN>`);
  lines.push('        </Id>');
  // EUR = Moneda de la cuenta
  lines.push('        <Ccy>EUR</Ccy>');
  lines.push('      </DbtrAcct>');

  // DbtrAgt — Agente del deudor (banco de la empresa)
  lines.push('      <DbtrAgt>');
  lines.push('        <FinInstnId>');
  lines.push(`          <BIC>${companyBIC}</BIC>`);
  lines.push('        </FinInstnId>');
  lines.push('      </DbtrAgt>');

  // ChrgBr — Quién asume los gastos: SLEV = compartidos según acuerdo de servicio SEPA
  lines.push('      <ChrgBr>SLEV</ChrgBr>');

  // =====================================================================
  // CdtTrfTxInf — Transferencias individuales (una por empleado)
  // Cada bloque contiene el importe, identificación end-to-end,
  // datos del beneficiario y concepto del pago
  // =====================================================================
  transfers.forEach((transfer, index) => {
    const cleanEmployeeIBAN = cleanIBAN(transfer.employeeIBAN);
    const endToEndId = generateEndToEndId(index);

    lines.push('      <CdtTrfTxInf>');

    // PmtId — Identificación del pago
    lines.push('        <PmtId>');
    lines.push(`          <EndToEndId>${escapeXml(endToEndId)}</EndToEndId>`);
    lines.push('        </PmtId>');

    // Amt — Importe de la transferencia
    lines.push('        <Amt>');
    lines.push(`          <InstdAmt Ccy="EUR">${formatSEPAAmount(transfer.amount)}</InstdAmt>`);
    lines.push('        </Amt>');

    // CdtrAgt — Agente del acreedor (banco del empleado), si se conoce el BIC
    if (transfer.employeeBIC) {
      lines.push('        <CdtrAgt>');
      lines.push('          <FinInstnId>');
      lines.push(`            <BIC>${transfer.employeeBIC.toUpperCase()}</BIC>`);
      lines.push('          </FinInstnId>');
      lines.push('        </CdtrAgt>');
    }

    // Cdtr — Acreedor (el empleado que recibe el pago)
    lines.push('        <Cdtr>');
    lines.push(`          <Nm>${escapeXml(truncateSEPA(transfer.employeeName, 70))}</Nm>`);
    lines.push('        </Cdtr>');

    // CdtrAcct — Cuenta del acreedor (IBAN del empleado)
    lines.push('        <CdtrAcct>');
    lines.push('          <Id>');
    lines.push(`            <IBAN>${cleanEmployeeIBAN}</IBAN>`);
    lines.push('          </Id>');
    lines.push('        </CdtrAcct>');

    // RmtInf — Información de la remesa (concepto del pago)
    lines.push('        <RmtInf>');
    lines.push(`          <Ustrd>${escapeXml(truncateSEPA(transfer.reference, 140))}</Ustrd>`);
    lines.push('        </RmtInf>');

    lines.push('      </CdtTrfTxInf>');
  });

  lines.push('    </PmtInf>');
  lines.push('  </CstmrCdtTrfInitn>');
  lines.push('</Document>');

  return lines.join('\n');
}
