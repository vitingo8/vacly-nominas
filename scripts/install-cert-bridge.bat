@echo off
title Vacly - Instalar asistente de certificados
set NOMINAS_ORIGIN=https://vacly-nominas.vercel.app
echo.
echo Instalando asistente Vacly (solo una vez en este PC)...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$installer = Join-Path $env:TEMP 'install-vacly-cert-bridge.ps1'; Invoke-WebRequest '%NOMINAS_ORIGIN%/install-vacly-cert-bridge.ps1' -OutFile $installer -UseBasicParsing; & $installer -NominasOrigin '%NOMINAS_ORIGIN%'"
echo.
pause
