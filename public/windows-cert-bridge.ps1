# Vacly — Puente local de certificados Windows
# Lista, exporta e instala certificados en CurrentUser\My
#
# Uso: powershell -ExecutionPolicy Bypass -File scripts/windows-cert-bridge.ps1
#   o: scripts\start-cert-bridge.bat

param([int]$Port = 8765)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Web

function Add-CorsHeaders([System.Net.HttpListenerResponse]$Response) {
  $Response.Headers.Add('Access-Control-Allow-Origin', '*')
  $Response.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  $Response.Headers.Add('Access-Control-Allow-Headers', 'Content-Type')
}

function Send-Json([System.Net.HttpListenerResponse]$Response, $Object, [int]$StatusCode = 200) {
  Add-CorsHeaders $Response
  $Response.StatusCode = $StatusCode
  $json = $Object | ConvertTo-Json -Depth 6 -Compress
  $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
  $Response.ContentType = 'application/json; charset=utf-8'
  $Response.ContentLength64 = $buffer.Length
  $Response.OutputStream.Write($buffer, 0, $buffer.Length)
  $Response.OutputStream.Close()
}

function Read-JsonBody([System.Net.HttpListenerRequest]$Request) {
  $reader = New-Object System.IO.StreamReader($Request.InputStream, $Request.ContentEncoding)
  $raw = $reader.ReadToEnd()
  if ([string]::IsNullOrWhiteSpace($raw)) { return @{} }
  return $raw | ConvertFrom-Json
}

function Get-CertItem([string]$Thumbprint) {
  Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Thumbprint -eq $Thumbprint -and $_.HasPrivateKey } | Select-Object -First 1
}

$listener = New-Object System.Net.HttpListener
$prefix = "http://127.0.0.1:$Port/"
$listener.Prefixes.Add($prefix)
$listener.Start()

Write-Host "Vacly Windows Cert Bridge escuchando en $prefix"
Write-Host "Ctrl+C para detener."

while ($listener.IsListening) {
  $context = $null
  try {
    $context = $listener.GetContext()
  } catch {
    break
  }

  $request = $context.Request
  $response = $context.Response
  $path = $request.Url.AbsolutePath.TrimEnd('/')
  if ($path -eq '') { $path = '/' }

  try {
    if ($request.HttpMethod -eq 'OPTIONS') {
      Add-CorsHeaders $response
      $response.StatusCode = 204
      $response.Close()
      continue
    }

    if ($path -eq '/health' -and $request.HttpMethod -eq 'GET') {
      Send-Json $response @{ ok = $true; platform = 'windows'; store = 'CurrentUser\My' }
      continue
    }

    if ($path -eq '/certificates' -and $request.HttpMethod -eq 'GET') {
      $items = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.HasPrivateKey } | ForEach-Object {
        @{
          thumbprint   = $_.Thumbprint
          subject      = $_.Subject
          issuer       = $_.Issuer
          notBefore    = $_.NotBefore.ToString('o')
          notAfter     = $_.NotAfter.ToString('o')
          friendlyName = $_.FriendlyName
          serialNumber = $_.SerialNumber
        }
      }
      Send-Json $response @{ certificates = @($items) }
      continue
    }

    if ($path -eq '/export' -and $request.HttpMethod -eq 'POST') {
      $body = Read-JsonBody $request
      $thumb = [string]$body.thumbprint
      $password = [string]$body.password
      if ([string]::IsNullOrWhiteSpace($thumb) -or [string]::IsNullOrWhiteSpace($password)) {
        Send-Json $response @{ error = 'thumbprint y password son requeridos' } 400
        continue
      }

      $cert = Get-CertItem $thumb
      if (-not $cert) {
        Send-Json $response @{ error = 'Certificado no encontrado o sin clave privada' } 404
        continue
      }

      $bytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pkcs12, $password)
      $b64 = [Convert]::ToBase64String($bytes)
      $safeName = ($cert.Subject -replace '[^\w\-]', '_').Substring(0, [Math]::Min(40, ($cert.Subject -replace '[^\w\-]', '_').Length))
      Send-Json $response @{ pfxBase64 = $b64; fileName = "$safeName.pfx"; thumbprint = $cert.Thumbprint }
      continue
    }

    if ($path -eq '/install' -and $request.HttpMethod -eq 'POST') {
      $body = Read-JsonBody $request
      $b64 = [string]$body.pfxBase64
      $password = [string]$body.password
      $friendlyName = [string]$body.friendlyName
      if ([string]::IsNullOrWhiteSpace($b64) -or [string]::IsNullOrWhiteSpace($password)) {
        Send-Json $response @{ error = 'pfxBase64 y password son requeridos' } 400
        continue
      }

      $pfxBytes = [Convert]::FromBase64String($b64)
      $tempPath = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "vacly-cert-$(Get-Random).pfx")
      try {
        [System.IO.File]::WriteAllBytes($tempPath, $pfxBytes)
        $securePwd = ConvertTo-SecureString -String $password -Force -AsPlainText

        $imported = Import-PfxCertificate -FilePath $tempPath -CertStoreLocation Cert:\CurrentUser\My -Password $securePwd -Exportable
        if (-not [string]::IsNullOrWhiteSpace($friendlyName)) {
          $imported.FriendlyName = $friendlyName
        }

        $existing = Get-CertItem $imported.Thumbprint
        Send-Json $response @{
          thumbprint       = $imported.Thumbprint
          subject          = $imported.Subject
          alreadyInstalled = $false
        }
      } finally {
        if (Test-Path $tempPath) { Remove-Item $tempPath -Force -ErrorAction SilentlyContinue }
      }
      continue
    }

    Send-Json $response @{ error = 'Not found' } 404
  } catch {
    try {
      Send-Json $response @{ error = $_.Exception.Message } 500
    } catch {}
  }
}

$listener.Stop()
