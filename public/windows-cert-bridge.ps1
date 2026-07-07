# Vacly — Puente local de certificados Windows (v2)
# Lista, exporta e instala certificados en CurrentUser\My.
#
# v2: usa TcpListener (sockets) en lugar de HttpListener para no requerir
# reserva de URL (netsh urlacl) ni permisos de administrador.
#
# Uso: powershell -ExecutionPolicy Bypass -File windows-cert-bridge.ps1
#   o: start-cert-bridge.bat

param([int]$Port = 8765)

$ErrorActionPreference = 'Stop'
$BridgeVersion = 2

# --- HTTP helpers sobre TcpListener -----------------------------------------

function Get-CorsHeaderLines {
  @(
    'Access-Control-Allow-Origin: *'
    'Access-Control-Allow-Methods: GET, POST, OPTIONS'
    'Access-Control-Allow-Headers: Content-Type'
    # Chrome Private Network Access / Local Network Access: sin esta cabecera
    # el preflight desde una web HTTPS hacia 127.0.0.1 se bloquea.
    'Access-Control-Allow-Private-Network: true'
    'Access-Control-Max-Age: 600'
  )
}

function Get-StatusText([int]$Code) {
  switch ($Code) {
    200 { 'OK' }
    204 { 'No Content' }
    400 { 'Bad Request' }
    404 { 'Not Found' }
    500 { 'Internal Server Error' }
    default { 'OK' }
  }
}

function Send-RawResponse {
  param(
    [System.IO.Stream]$Stream,
    [int]$StatusCode,
    [byte[]]$Body,
    [string]$ContentType = 'application/json; charset=utf-8'
  )
  if ($null -eq $Body) { $Body = [byte[]]@() }
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add("HTTP/1.1 $StatusCode $(Get-StatusText $StatusCode)")
  foreach ($h in (Get-CorsHeaderLines)) { $lines.Add($h) }
  if ($Body.Length -gt 0) { $lines.Add("Content-Type: $ContentType") }
  $lines.Add("Content-Length: $($Body.Length)")
  $lines.Add('Connection: close')
  $lines.Add('')
  $lines.Add('')
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes(($lines -join "`r`n"))
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($Body.Length -gt 0) { $Stream.Write($Body, 0, $Body.Length) }
  $Stream.Flush()
}

function Send-Json {
  param(
    [System.IO.Stream]$Stream,
    $Object,
    [int]$StatusCode = 200
  )
  $json = $Object | ConvertTo-Json -Depth 6 -Compress
  $body = [System.Text.Encoding]::UTF8.GetBytes($json)
  Send-RawResponse -Stream $Stream -StatusCode $StatusCode -Body $body
}

# Lee una petición HTTP completa (línea de petición, cabeceras y cuerpo).
# Devuelve $null si la conexión no aporta una petición válida.
function Read-HttpRequest {
  param([System.Net.Sockets.TcpClient]$Client)

  $stream = $Client.GetStream()
  $stream.ReadTimeout = 5000

  $buffer = New-Object byte[] 8192
  $ms = New-Object System.IO.MemoryStream
  $headerEnd = -1
  $crlfcrlf = [byte[]]@(13, 10, 13, 10)

  while ($headerEnd -lt 0) {
    $read = 0
    try { $read = $stream.Read($buffer, 0, $buffer.Length) } catch { return $null }
    if ($read -le 0) { return $null }
    $ms.Write($buffer, 0, $read)
    if ($ms.Length -gt 1MB) { return $null }

    $bytes = $ms.ToArray()
    for ($i = 3; $i -lt $bytes.Length; $i++) {
      if ($bytes[$i - 3] -eq 13 -and $bytes[$i - 2] -eq 10 -and $bytes[$i - 1] -eq 13 -and $bytes[$i] -eq 10) {
        $headerEnd = $i + 1
        break
      }
    }
  }

  $all = $ms.ToArray()
  $headerText = [System.Text.Encoding]::ASCII.GetString($all, 0, $headerEnd)
  $headerLines = $headerText -split "`r`n" | Where-Object { $_ -ne '' }
  if ($headerLines.Count -lt 1) { return $null }

  $requestLine = $headerLines[0] -split ' '
  if ($requestLine.Count -lt 2) { return $null }
  $method = $requestLine[0].ToUpperInvariant()
  $rawPath = $requestLine[1]

  $headers = @{}
  foreach ($line in ($headerLines | Select-Object -Skip 1)) {
    $idx = $line.IndexOf(':')
    if ($idx -gt 0) {
      $headers[$line.Substring(0, $idx).Trim().ToLowerInvariant()] = $line.Substring($idx + 1).Trim()
    }
  }

  $contentLength = 0
  if ($headers.ContainsKey('content-length')) {
    [void][int]::TryParse($headers['content-length'], [ref]$contentLength)
  }
  if ($contentLength -gt 8MB) { return $null }

  $bodyBytes = New-Object System.IO.MemoryStream
  if ($all.Length -gt $headerEnd) {
    $bodyBytes.Write($all, $headerEnd, $all.Length - $headerEnd)
  }
  while ($bodyBytes.Length -lt $contentLength) {
    $read = 0
    try { $read = $stream.Read($buffer, 0, $buffer.Length) } catch { return $null }
    if ($read -le 0) { break }
    $bodyBytes.Write($buffer, 0, $read)
  }

  $path = $rawPath
  $qIdx = $path.IndexOf('?')
  if ($qIdx -ge 0) { $path = $path.Substring(0, $qIdx) }
  $path = $path.TrimEnd('/')
  if ($path -eq '') { $path = '/' }

  return @{
    Method = $method
    Path   = $path
    Body   = [System.Text.Encoding]::UTF8.GetString($bodyBytes.ToArray())
    Stream = $stream
  }
}

function Read-JsonBody([string]$Raw) {
  if ([string]::IsNullOrWhiteSpace($Raw)) { return @{} }
  return $Raw | ConvertFrom-Json
}

# --- Certificados ------------------------------------------------------------

function Get-CertItem([string]$Thumbprint) {
  Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Thumbprint -eq $Thumbprint -and $_.HasPrivateKey } | Select-Object -First 1
}

# Detecta si la clave privada permite exportación a PKCS#12 (DNIe, tarjetas y
# claves con política de no exportación devuelven $false). Se basa en la
# política de la clave, sin exportar de verdad (evita prompts de PIN).
function Test-CertExportable([System.Security.Cryptography.X509Certificates.X509Certificate2]$Cert) {
  try {
    $key = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($Cert)
    if ($null -eq $key) {
      $key = [System.Security.Cryptography.X509Certificates.ECDsaCertificateExtensions]::GetECDsaPrivateKey($Cert)
    }
    if ($null -eq $key) { return $false }

    if ($key -is [System.Security.Cryptography.RSACng] -or $key -is [System.Security.Cryptography.ECDsaCng]) {
      $policy = $key.Key.ExportPolicy
      $allowExport = [System.Security.Cryptography.CngExportPolicies]::AllowExport
      $allowPlaintext = [System.Security.Cryptography.CngExportPolicies]::AllowPlaintextExport
      return ((($policy -band $allowExport) -ne 0) -or (($policy -band $allowPlaintext) -ne 0))
    }
    if ($key -is [System.Security.Cryptography.RSACryptoServiceProvider]) {
      return $key.CspKeyContainerInfo.Exportable
    }
    # Proveedor desconocido: no bloquear aquí; /export devolverá el error real.
    return $true
  } catch {
    return $true
  }
}

function Handle-Request($Req) {
  $stream = $Req.Stream

  if ($Req.Method -eq 'OPTIONS') {
    Send-RawResponse -Stream $stream -StatusCode 204 -Body $null
    return
  }

  if ($Req.Path -eq '/health' -and $Req.Method -eq 'GET') {
    Send-Json $stream @{ ok = $true; platform = 'windows'; store = 'CurrentUser\My'; version = $BridgeVersion }
    return
  }

  if ($Req.Path -eq '/certificates' -and $Req.Method -eq 'GET') {
    $items = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.HasPrivateKey } | ForEach-Object {
      @{
        thumbprint   = $_.Thumbprint
        subject      = $_.Subject
        issuer       = $_.Issuer
        notBefore    = $_.NotBefore.ToString('o')
        notAfter     = $_.NotAfter.ToString('o')
        friendlyName = $_.FriendlyName
        serialNumber = $_.SerialNumber
        exportable   = (Test-CertExportable $_)
      }
    }
    Send-Json $stream @{ certificates = @($items) }
    return
  }

  if ($Req.Path -eq '/export' -and $Req.Method -eq 'POST') {
    $body = Read-JsonBody $Req.Body
    $thumb = [string]$body.thumbprint
    $password = [string]$body.password
    if ([string]::IsNullOrWhiteSpace($thumb) -or [string]::IsNullOrWhiteSpace($password)) {
      Send-Json $stream @{ error = 'thumbprint y password son requeridos' } 400
      return
    }

    $cert = Get-CertItem $thumb
    if (-not $cert) {
      Send-Json $stream @{ error = 'Certificado no encontrado o sin clave privada' } 404
      return
    }

    if (-not (Test-CertExportable $cert)) {
      Send-Json $stream @{ error = 'La clave privada de este certificado no es exportable (tarjeta/DNIe o política de Windows). Sube el fichero .pfx original.'; code = 'NOT_EXPORTABLE' } 400
      return
    }

    $bytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pkcs12, $password)
    $b64 = [Convert]::ToBase64String($bytes)
    $safeName = ($cert.Subject -replace '[^\w\-]', '_').Substring(0, [Math]::Min(40, ($cert.Subject -replace '[^\w\-]', '_').Length))
    Send-Json $stream @{ pfxBase64 = $b64; fileName = "$safeName.pfx"; thumbprint = $cert.Thumbprint }
    return
  }

  if ($Req.Path -eq '/install' -and $Req.Method -eq 'POST') {
    $body = Read-JsonBody $Req.Body
    $b64 = [string]$body.pfxBase64
    $password = [string]$body.password
    $friendlyName = [string]$body.friendlyName
    if ([string]::IsNullOrWhiteSpace($b64) -or [string]::IsNullOrWhiteSpace($password)) {
      Send-Json $stream @{ error = 'pfxBase64 y password son requeridos' } 400
      return
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

      Send-Json $stream @{
        thumbprint       = $imported.Thumbprint
        subject          = $imported.Subject
        alreadyInstalled = $false
      }
    } finally {
      if (Test-Path $tempPath) { Remove-Item $tempPath -Force -ErrorAction SilentlyContinue }
    }
    return
  }

  Send-Json $stream @{ error = 'Not found' } 404
}

# --- Bucle principal ----------------------------------------------------------

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
try {
  $listener.Start()
} catch {
  Write-Host "No se pudo escuchar en 127.0.0.1:$Port — ¿hay otra instancia en marcha? ($($_.Exception.Message))"
  exit 1
}

Write-Host "Vacly Windows Cert Bridge v$BridgeVersion escuchando en http://127.0.0.1:$Port/"
Write-Host 'Ctrl+C para detener.'

while ($true) {
  $client = $null
  try {
    $client = $listener.AcceptTcpClient()
  } catch {
    break
  }

  try {
    $req = Read-HttpRequest -Client $client
    if ($null -ne $req) {
      try {
        Handle-Request $req
      } catch {
        try { Send-Json $req.Stream @{ error = $_.Exception.Message } 500 } catch {}
      }
    }
  } catch {
    # Conexión defectuosa: ignorar y seguir escuchando.
  } finally {
    try { $client.Close() } catch {}
  }
}

$listener.Stop()
