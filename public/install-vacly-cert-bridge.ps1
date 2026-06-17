# Vacly — Instalador del asistente de certificados Windows (ejecutar UNA vez)
# Instala en %LOCALAPPDATA%\Vacly\CertBridge, arranca al logon y registra vacly-bridge://

param(
  [string]$NominasOrigin = 'https://vacly-nominas.vercel.app',
  [int]$Port = 8765
)

$ErrorActionPreference = 'Stop'

$InstallDir = Join-Path $env:LOCALAPPDATA 'Vacly\CertBridge'
$BridgeScript = Join-Path $InstallDir 'windows-cert-bridge.ps1'
$TaskName = 'VaclyCertBridge'

function Register-VaclyBridgeProtocol {
  param([string]$ScriptPath, [int]$ListenPort)
  $launch = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`" -Port $ListenPort"
  $urlKey = 'HKCU:\Software\Classes\vacly-bridge'
  New-Item -Path $urlKey -Force | Out-Null
  Set-ItemProperty -Path $urlKey -Name '(Default)' -Value 'URL:Vacly Certificate Bridge'
  New-ItemProperty -Path $urlKey -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
  $cmdKey = Join-Path $urlKey 'shell\open\command'
  New-Item -Path $cmdKey -Force | Out-Null
  Set-ItemProperty -Path $cmdKey -Name '(Default)' -Value $launch
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

$localBridge = Join-Path $PSScriptRoot 'windows-cert-bridge.ps1'
if (Test-Path $localBridge) {
  Copy-Item $localBridge $BridgeScript -Force
} else {
  $remote = "$($NominasOrigin.TrimEnd('/'))/windows-cert-bridge.ps1"
  Invoke-WebRequest -Uri $remote -OutFile $BridgeScript -UseBasicParsing
}

Register-VaclyBridgeProtocol -ScriptPath $BridgeScript -ListenPort $Port

$psArgs = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$BridgeScript`" -Port $Port"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $psArgs
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -RunLevel Limited -Force | Out-Null

Start-Process powershell.exe -ArgumentList $psArgs -WindowStyle Hidden
Start-Sleep -Seconds 2

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 5
  if ($health.ok) { exit 0 }
} catch {}

exit 0
