import { NextRequest, NextResponse } from 'next/server'

/** Genera un .bat con el origin correcto (localhost en dev, producción en prod). */
export async function GET(request: NextRequest) {
  const originParam = request.nextUrl.searchParams.get('origin')?.trim()
  const origin = (originParam || request.nextUrl.origin).replace(/\/$/, '')

  const bat = `@echo off
title Vacly CertBridge
echo.
echo Instalando asistente de certificados Vacly...
echo Origen: ${origin}
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$installer = Join-Path $env:TEMP 'install-vacly-cert-bridge.ps1'; Invoke-WebRequest '${origin}/install-vacly-cert-bridge.ps1' -OutFile $installer -UseBasicParsing; & $installer -NominasOrigin '${origin}'"
if errorlevel 1 (
  echo.
  echo Error durante la instalacion. Revisa el mensaje anterior.
  pause
  exit /b 1
)
echo.
echo Instalacion completada. Puedes cerrar esta ventana.
timeout /t 3 >nul
exit /b 0
`

  return new NextResponse(bat, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="VaclyCertBridge.bat"',
      'Cache-Control': 'no-store',
    },
  })
}
