import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Security headers
  const response = NextResponse.next()
  
  // Add CORS headers for external API access
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
  
  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: response.headers })
  }
  
  // Security headers (mantener protección del código)
  response.headers.set('X-DNS-Prefetch-Control', 'off')
  response.headers.set('X-Download-Options', 'noopen')
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none')
  response.headers.set('X-Powered-By', 'Vacly-Security')
  
  const userAgent = request.headers.get('user-agent') || ''
  const pathname = request.nextUrl.pathname
  
  // SOLO bloquear acceso a archivos de código fuente, no a las APIs
  const protectedPaths = [
    '/src/', '/.next/', '/pages/', '/components/', '/lib/', '/utils/',
    '.js', '.ts', '.tsx', '.jsx', '.map', '.env'
  ]
  
  // Bloquear solo user agents que intentan acceder a código fuente
  const codeScrapingAgents = [
    'wget', 'curl', 'python-requests', 'python', 'crawler', 'bot', 'spider', 'scraper'
  ]
  
  // Proteger archivos de código pero permitir acceso a APIs
  if (protectedPaths.some(path => pathname.includes(path)) && 
      codeScrapingAgents.some(agent => userAgent.toLowerCase().includes(agent))) {
    return new Response('Access Denied - Code Protection', { 
      status: 403,
      headers: {
        'Content-Type': 'text/plain',
        'X-Block-Reason': 'Code Protection'
      }
    })
  }
  
  // ELIMINAR la restricción de referer/origin para APIs - permitir acceso externo
  // Comentado el bloqueo anterior:
  /*
  if (request.nextUrl.pathname.startsWith('/api/process') || 
      request.nextUrl.pathname.startsWith('/api/memory')) {
    const referer = request.headers.get('referer')
    const origin = request.headers.get('origin')
    
    if (!referer && !origin) {
      return new Response('Access Denied - Invalid Request', { 
        status: 403,
        headers: {
          'Content-Type': 'text/plain',
          'X-Block-Reason': 'No Referer/Origin'
        }
      })
    }
  }
  */
  
  // Add timestamp for request tracking
  response.headers.set('X-Request-Time', Date.now().toString())
  
  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
} 