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
$LogFile = Join-Path $InstallDir 'install.log'

function Write-InstallLog([string]$Message) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue
  Write-Host $Message
}

function Ensure-UrlReservation([int]$ListenPort) {
  $url = "http://127.0.0.1:$ListenPort/"
  try {
    $existing = netsh http show urlacl url=$url 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $existing) {
      netsh http add urlacl url=$url user="$env:USERDOMAIN\$env:USERNAME" | Out-Null
      Write-InstallLog "Reserva URL registrada: $url"
    }
  } catch {
    Write-InstallLog "Aviso: no se pudo reservar $url ($($_.Exception.Message)). Se intentará arrancar igualmente."
  }
}

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
Write-InstallLog "Instalando Vacly CertBridge en $InstallDir"

$localBridge = Join-Path $PSScriptRoot 'windows-cert-bridge.ps1'
if (Test-Path $localBridge) {
  Copy-Item $localBridge $BridgeScript -Force
  Write-InstallLog "Script copiado desde $localBridge"
} else {
  $remote = "$($NominasOrigin.TrimEnd('/'))/windows-cert-bridge.ps1"
  Invoke-WebRequest -Uri $remote -OutFile $BridgeScript -UseBasicParsing
  Write-InstallLog "Script descargado desde $remote"
}

Ensure-UrlReservation -ListenPort $Port

Register-VaclyBridgeProtocol -ScriptPath $BridgeScript -ListenPort $Port
Write-InstallLog "Protocolo vacly-bridge:// registrado"

$psArgs = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$BridgeScript`" -Port $Port"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $psArgs
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -RunLevel Limited -Force | Out-Null
Write-InstallLog "Tarea programada '$TaskName' registrada"

Start-Process powershell.exe -ArgumentList $psArgs -WindowStyle Hidden
Write-InstallLog "Puente iniciado en http://127.0.0.1:$Port"
Start-Sleep -Seconds 2

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 5
  if ($health.ok) {
    Write-InstallLog 'Puente activo y respondiendo.'
    exit 0
  }
  Write-InstallLog 'Puente arrancado pero /health no devolvió ok.'
} catch {
  Write-InstallLog "Error comprobando /health: $($_.Exception.Message)"
  exit 1
}

exit 1
