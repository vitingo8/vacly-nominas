/** Orígenes permitidos para el puente local de certificados Windows (solo localhost). */
export const CSP_LOCALHOST_BRIDGE =
  'http://127.0.0.1:8765 http://localhost:8765 ws://127.0.0.1:8765 ws://localhost:8765'

export function buildNominasCsp(): string {
  return [
    "default-src 'self' https://*.supabase.co",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' data:",
    `connect-src 'self' https://api.anthropic.com https://api.voyageai.com https://*.supabase.co ${CSP_LOCALHOST_BRIDGE}`,
    "frame-src 'self' https://*.supabase.co blob: data:",
    "object-src 'self' https://*.supabase.co blob: data:",
    'frame-ancestors *',
  ].join('; ')
}
