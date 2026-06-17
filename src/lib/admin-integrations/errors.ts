export type AdminErrorCode =
  | 'INTEGRATIONS_DISABLED'
  | 'VALIDATION_ERROR'
  | 'INVALID_STATE_TRANSITION'
  | 'TRANSACTION_NOT_FOUND'
  | 'FILE_NOT_FOUND'
  | 'RESPONSE_NOT_FOUND'
  | 'CERTIFICATE_NOT_FOUND'
  | 'AUTHORIZATION_NOT_FOUND'
  | 'EMPLOYEE_NOT_FOUND'
  | 'STORAGE_ERROR'
  | 'TRANSPORT_ERROR'
  | 'PROCESSING_ERROR'
  | 'LANGUAGE_REQUIRED'
  | 'UNAUTHORIZED'

export class AdminIntegrationError extends Error {
  readonly code: AdminErrorCode
  readonly details?: unknown

  constructor(code: AdminErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'AdminIntegrationError'
    this.code = code
    this.details = details
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    }
  }
}
