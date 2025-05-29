import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Security headers
  const response = NextResponse.next()
  
  // Add security headers
  response.headers.set('X-DNS-Prefetch-Control', 'off')
  response.headers.set('X-Download-Options', 'noopen')
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none')
  response.headers.set('X-Powered-By', 'Vacly-Security')
  
  // Rate limiting check (simple implementation)
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
  const userAgent = request.headers.get('user-agent') || ''
  
  // Block suspicious user agents
  const suspiciousAgents = [
    'curl', 'wget', 'postman', 'insomnia', 'httpie', 'python-requests',
    'crawler', 'bot', 'spider', 'scraper'
  ]
  
  if (suspiciousAgents.some(agent => userAgent.toLowerCase().includes(agent))) {
    return new Response('Access Denied', { 
      status: 403,
      headers: {
        'Content-Type': 'text/plain',
        'X-Block-Reason': 'Suspicious User Agent'
      }
    })
  }
  
  // Block direct API access without proper referrer for sensitive endpoints
  if (request.nextUrl.pathname.startsWith('/api/process') || 
      request.nextUrl.pathname.startsWith('/api/memory')) {
    const referer = request.headers.get('referer')
    const origin = request.headers.get('origin')
    
    // Allow same-origin requests
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