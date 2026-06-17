export type AdminProvider = 'tgss' | 'aeat' | 'dehu'

export type TransactionStatus =
  | 'created'
  | 'validated'
  | 'file_generated'
  | 'queued'
  | 'submitted'
  | 'response_received'
  | 'accepted'
  | 'rejected'
  | 'failed'

export type AffiliationRequestType = 'alta' | 'baja' | 'variacion'

export interface AdministrativeTransaction {
  id: string
  company_id: string
  provider: AdminProvider
  procedure_code: string
  subject_type?: string | null
  subject_id?: string | null
  status: TransactionStatus
  certificate_id?: string | null
  authorization_id?: string | null
  requested_by?: string | null
  error_code?: string | null
  error_message?: string | null
  created_at: string
  updated_at: string
}

export interface AdministrativeFile {
  id: string
  company_id: string
  transaction_id: string
  file_type: string
  file_name: string
  storage_path: string
  sha256: string
  created_at: string
}

export interface AdministrativeResponse {
  id: string
  company_id: string
  transaction_id: string
  response_type: string
  raw_response_path?: string | null
  normalized_status?: string | null
  error_code?: string | null
  error_message?: string | null
  received_at: string
}

export interface AdministrativeAuthorization {
  id: string
  company_id: string
  provider: AdminProvider
  authorization_type: string
  holder_nif: string
  representative_nif?: string | null
  red_authorization_number?: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface AdministrativeCertificate {
  id: string
  company_id: string
  alias: string
  holder_nif: string
  valid_from?: string | null
  valid_to?: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface TgssAffiliationRequestRow {
  id: string
  company_id: string
  transaction_id: string
  employee_id?: string | null
  request_type: AffiliationRequestType
  nss?: string | null
  ipf?: string | null
  ccc?: string | null
  fecha_real?: string | null
  fecha_efecto?: string | null
  contract_snapshot: Record<string, unknown>
  created_at: string
}

export interface CreateAffiliationInput {
  companyId: string
  employeeId: string
  requestType: AffiliationRequestType
  nss?: string
  ipf?: string
  ccc?: string
  fechaReal?: string
  fechaEfecto?: string
  contractSnapshot?: Record<string, unknown>
  requestedBy?: string
  certificateId?: string
  authorizationId?: string
}
