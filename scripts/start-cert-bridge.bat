@echo off
title Vacly - Puente certificados Windows
cd /d "%~dp0.."
echo Iniciando puente de certificados en http://127.0.0.1:8765
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows-cert-bridge.ps1"
pause
