import type { AffiliationRequestType } from '../types'

/** Código de operación AFI según tipo de solicitud (borrador — validar contra doc oficial). */
export const AFI_OPERATION_CODES: Record<AffiliationRequestType, string> = {
  alta: 'MA',
  baja: 'MB',
  variacion: 'MV',
}

export interface AfiAffiliationPayload {
  requestType: AffiliationRequestType
  /** Número de Afiliación a la Seguridad Social (NAF/NSS) — 12 dígitos */
  nss: string
  /** Identificador personal (NIF/NIE) */
  ipf: string
  /** Código Cuenta Cotización empresa — 11 dígitos */
  ccc: string
  /** Fecha real del hecho causante (YYYYMMDD) */
  fechaReal: string
  /** Fecha de efecto (YYYYMMDD) */
  fechaEfecto: string
  /** Razón social / nombre empresa */
  companyName?: string
  /** CIF empresa */
  companyCif?: string
  /** Nombre trabajador */
  employeeName?: string
  /** Grupo cotización (1-11) */
  cotizationGroup?: string
  /** Tipo contrato RED */
  contractType?: string
  /** Snapshot adicional del contrato */
  contractSnapshot?: Record<string, unknown>
}

export interface AfiValidationResult {
  valid: boolean
  errors: Array<{ field: string; message: string }>
}

export interface ParsedAfiResponse {
  normalizedStatus: 'accepted' | 'rejected' | 'failed'
  errorCode?: string
  errorMessage?: string
  rawContent: string
}

export type SubmissionStatus = 'pending' | 'submitted' | 'completed' | 'error'

export interface TransportSubmissionResult {
  externalRef: string
  status: SubmissionStatus
}

export interface TransportPollResult {
  status: SubmissionStatus
  responseContent?: string
}
