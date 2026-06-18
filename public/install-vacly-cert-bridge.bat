@echo off
title Vacly CertBridge
set NOMINAS_ORIGIN=https://vacly-nominas.vercel.app
echo.
echo Instalando asistente de certificados Vacly...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$installer = Join-Path $env:TEMP 'install-vacly-cert-bridge.ps1'; Invoke-WebRequest '%NOMINAS_ORIGIN%/install-vacly-cert-bridge.ps1' -OutFile $installer -UseBasicParsing; & $installer -NominasOrigin '%NOMINAS_ORIGIN%'"
if errorlevel 1 pause
exit /b 0
