@echo off
title Vacly - Instalar asistente de certificados
cd /d "%~dp0"
echo.
echo Instalando asistente Vacly para certificados de Windows...
echo Solo necesitas hacer esto UNA vez en este PC.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-cert-bridge.ps1"
echo.
pause
