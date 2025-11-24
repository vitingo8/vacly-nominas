import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()
  
  // CSP que permite iframes de Supabase para visualizar PDFs
  const csp = [
    "default-src 'self' https://*.supabase.co",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' data:",
    "connect-src 'self' https://api.anthropic.com https://api.voyageai.com https://*.supabase.co",
    "frame-src 'self' https://*.supabase.co blob: data:",
    "object-src 'self' https://*.supabase.co blob: data:",
    "frame-ancestors *"
  ].join('; ')
  
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Content-Security-Policy', csp)
  
  return response
}

export const config = {
  matcher: [
    // Aplicar a todas las páginas excepto API, _next y archivos estáticos
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
} 