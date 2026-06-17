# Vacly — Instalador del asistente de certificados Windows (ejecutar UNA vez)
# Instala en %LOCALAPPDATA%\Vacly\CertBridge y arranca al iniciar sesión (sin ventanas).

param(
  [string]$NominasOrigin = 'https://vacly-nominas.vercel.app',
  [int]$Port = 8765
)

$ErrorActionPreference = 'Stop'

$InstallDir = Join-Path $env:LOCALAPPDATA 'Vacly\CertBridge'
$BridgeScript = Join-Path $InstallDir 'windows-cert-bridge.ps1'
$TaskName = 'VaclyCertBridge'

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

$localBridge = Join-Path $PSScriptRoot 'windows-cert-bridge.ps1'
if (Test-Path $localBridge) {
  Copy-Item $localBridge $BridgeScript -Force
} else {
  $remote = "$($NominasOrigin.TrimEnd('/'))/windows-cert-bridge.ps1"
  Write-Host "Descargando puente desde $remote ..."
  Invoke-WebRequest -Uri $remote -OutFile $BridgeScript -UseBasicParsing
}

$psArgs = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$BridgeScript`" -Port $Port"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $psArgs
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -RunLevel Limited -Force | Out-Null

Start-Process powershell.exe -ArgumentList $psArgs -WindowStyle Hidden
Start-Sleep -Seconds 2

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 5
  if ($health.ok) {
    Write-Host 'Asistente Vacly instalado. Se inicia solo al entrar en Windows.' -ForegroundColor Green
    exit 0
  }
} catch {}

Write-Host 'Instalado. Abre Vacly, pulsa Actualizar desde Windows y, si hace falta, reinicia el navegador.' -ForegroundColor Yellow
