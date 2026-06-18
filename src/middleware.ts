import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { buildNominasCsp } from '@/lib/security/csp'

const BLOCKED_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>No disponible</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f6f8fa;
      color: #1B2A41;
    }
    .card {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 48px 40px;
      max-width: 420px;
      width: 90%;
      text-align: center;
      box-shadow: 0 4px 24px rgba(0,0,0,0.07);
    }
    .icon { font-size: 48px; margin-bottom: 20px; }
    h1 { font-size: 20px; font-weight: 700; margin-bottom: 10px; }
    p { font-size: 14px; color: #64748b; line-height: 1.6; }
    .brand {
      margin-top: 32px;
      font-size: 12px;
      color: #94a3b8;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🔒</div>
    <h1>Acceso no disponible</h1>
    <p>Este servicio solo es accesible desde la plataforma <strong>Vacly</strong>. Accede a través de tu cuenta en vacly-app.</p>
    <div class="brand">Vacly · Nóminas</div>
  </div>
</body>
</html>`

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // Instalador del puente Windows + estáticos internos (sin company_id)
  const publicPaths = new Set([
    '/install-vacly-cert-bridge.ps1',
    '/install-vacly-cert-bridge.bat',
    '/windows-cert-bridge.ps1',
  ])

  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/robots') ||
    pathname.startsWith('/sitemap') ||
    publicPaths.has(pathname)
  ) {
    return NextResponse.next()
  }

  // En desarrollo local, permitir acceso directo (sin iframe desde vacly-app)
  const isDev = process.env.NODE_ENV === 'development'
  const companyId = searchParams.get('company_id')

  if (!companyId) {
    if (isDev) {
      const devCompanyId = process.env.VACLY_NOMINAS_DEV_COMPANY_ID?.trim()
      if (devCompanyId) {
        const url = request.nextUrl.clone()
        url.searchParams.set('company_id', devCompanyId)
        return NextResponse.redirect(url)
      }
    } else {
      return new NextResponse(BLOCKED_HTML, {
        status: 403,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }
  }

  // Añadir CSP headers para permitir iframes de Supabase y visualización de PDFs
  const response = NextResponse.next()

  const csp = buildNominasCsp()

  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Content-Security-Policy', csp)
  response.headers.delete('X-Frame-Options')

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
