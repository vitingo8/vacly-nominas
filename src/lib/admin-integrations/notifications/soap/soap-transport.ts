import https from 'https'
import { AdminIntegrationError } from '../../errors'
import { createMtlsAgent } from './mtls-agent'
import type { DecryptedCertificate } from '../../certificate-vault/certificate-vault-service'

export interface SoapRequestOptions {
  endpoint: string
  soapAction?: string
  envelope: string
  certificate: Pick<DecryptedCertificate, 'pfx' | 'password'>
  timeoutMs?: number
}

export interface SoapResponse {
  statusCode: number
  body: string
  headers: Record<string, string | string[] | undefined>
}

export async function postSoap(options: SoapRequestOptions): Promise<SoapResponse> {
  const url = new URL(options.endpoint)
  const agent = createMtlsAgent(options.certificate)
  const payload = Buffer.from(options.envelope, 'utf8')

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        agent,
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Content-Length': payload.length,
          ...(options.soapAction ? { SOAPAction: options.soapAction } : {}),
        },
        timeout: options.timeoutMs ?? 120_000,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8')
          if (res.statusCode && res.statusCode >= 400) {
            reject(
              new AdminIntegrationError(
                'TRANSPORT_ERROR',
                `SOAP HTTP ${res.statusCode}: ${body.slice(0, 500)}`,
                { endpoint: options.endpoint, statusCode: res.statusCode },
              ),
            )
            return
          }
          resolve({
            statusCode: res.statusCode || 0,
            body,
            headers: res.headers,
          })
        })
      },
    )

    req.on('timeout', () => {
      req.destroy()
      reject(new AdminIntegrationError('TRANSPORT_ERROR', `Timeout SOAP (${options.endpoint})`))
    })
    req.on('error', (err) => {
      reject(new AdminIntegrationError('TRANSPORT_ERROR', `Error SOAP: ${err.message}`, err))
    })
    req.write(payload)
    req.end()
  })
}

export function extractSoapFault(body: string): { code?: string; message?: string } | null {
  if (!/:(Fault|fault)/i.test(body)) return null
  return {
    code: body.match(/<(?:[\w-]+:)?faultcode[^>]*>([\s\S]*?)<\//i)?.[1]?.trim(),
    message: body.match(/<(?:[\w-]+:)?faultstring[^>]*>([\s\S]*?)<\//i)?.[1]?.trim(),
  }
}

export function assertSoapOk(body: string, provider: string): void {
  const fault = extractSoapFault(body)
  if (fault) {
    throw new AdminIntegrationError(
      'TRANSPORT_ERROR',
      `${provider} SOAP Fault: ${fault.message || fault.code || 'error desconocido'}`,
      fault,
    )
  }
}

export function buildSoapEnvelope(body: string, header = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header>${header}</soapenv:Header>
  <soapenv:Body>${body}</soapenv:Body>
</soapenv:Envelope>`
}
