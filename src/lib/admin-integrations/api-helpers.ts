import { NextResponse } from 'next/server'
import { AdminIntegrationError } from '@/lib/admin-integrations/errors'

export function adminErrorResponse(error: unknown) {
  if (error instanceof AdminIntegrationError) {
    const status =
      error.code === 'VALIDATION_ERROR'
        ? 400
        : error.code === 'TRANSACTION_NOT_FOUND' ||
            error.code === 'FILE_NOT_FOUND' ||
            error.code === 'RESPONSE_NOT_FOUND' ||
            error.code === 'EMPLOYEE_NOT_FOUND' ||
            error.code === 'CERTIFICATE_NOT_FOUND'
          ? 404
          : error.code === 'UNAUTHORIZED'
            ? 401
            : error.code === 'INTEGRATIONS_DISABLED'
              ? 503
              : 500

    return NextResponse.json({ success: false, ...error.toJSON() }, { status })
  }

  console.error('[admin-api]', error)
  return NextResponse.json(
    {
      success: false,
      code: 'PROCESSING_ERROR',
      message: error instanceof Error ? error.message : 'Error desconocido',
    },
    { status: 500 },
  )
}

export function jsonOk<T extends Record<string, unknown>>(data: T, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status })
}
