import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Permitir todas las peticiones de API sin restricciones
  const response = NextResponse.next()
  
  // Agregar headers básicos de seguridad (no restrictivos)
  response.headers.set('X-Content-Type-Options', 'nosniff')
  
  // Permitir que se cargue en iframe desde cualquier origen
  response.headers.set('X-Frame-Options', 'ALLOWALL')
  response.headers.set('Content-Security-Policy', "frame-ancestors *;")
  
  return response
}

export const config = {
  matcher: [
    // Solo aplicar middleware a rutas específicas que realmente lo necesiten
    // Esto evita interferencias con Vercel y otros servicios
    '/admin/:path*',
  ],
} 