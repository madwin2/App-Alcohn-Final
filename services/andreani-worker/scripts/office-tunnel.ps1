# Túnel oficina → Hetzner: crea un SOCKS en el VPS que sale por ESTE WiFi.
# Dejá esta ventana abierta mientras quieras generar links Andreani.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts\office-tunnel.ps1

param(
  [string]$HetznerHost = "188.245.218.22",
  [string]$User = "root",
  [int]$RemoteSocksPort = 11080,
  [string]$IdentityFile = "$env:USERPROFILE\.ssh\id_rsa"
)

$ErrorActionPreference = "Stop"

function Test-Ssh {
  Get-Command ssh -ErrorAction SilentlyContinue | Out-Null
  if (-not $?) {
    throw "No está instalado OpenSSH Client. En Windows: Configuración → Aplicaciones → Características opcionales → OpenSSH Client."
  }
}

Test-Ssh

Write-Host ""
Write-Host "=== Andreani office tunnel ===" -ForegroundColor Cyan
Write-Host "VPS:   ${User}@${HetznerHost}"
Write-Host "SOCKS: 127.0.0.1:${RemoteSocksPort} en el VPS (sale por este WiFi)"
Write-Host "Dejá esta ventana ABIERTA. Ctrl+C para cortar."
Write-Host ""

# Si el puerto remoto quedó colgado de un túnel viejo, liberarlo antes.
Write-Host "Liberando puerto remoto $RemoteSocksPort (si estaba ocupado)..." -ForegroundColor DarkGray
& ssh @(
  "-o", "BatchMode=yes",
  "-o", "ConnectTimeout=10",
  "-i", $IdentityFile,
  "${User}@${HetznerHost}",
  "fuser -k ${RemoteSocksPort}/tcp 2>/dev/null; true"
) | Out-Null
Start-Sleep -Seconds 1

$sshArgs = @(
  "-N",
  "-o", "BatchMode=yes",
  "-o", "ExitOnForwardFailure=yes",
  "-o", "ServerAliveInterval=30",
  "-o", "ServerAliveCountMax=3",
  "-o", "StrictHostKeyChecking=accept-new",
  "-i", $IdentityFile,
  "-R", "127.0.0.1:${RemoteSocksPort}",
  "${User}@${HetznerHost}"
)

while ($true) {
  Write-Host ("[{0}] Conectando túnel..." -f (Get-Date -Format "HH:mm:ss")) -ForegroundColor Yellow
  try {
    & ssh @sshArgs
    $code = $LASTEXITCODE
  } catch {
    $code = 1
    Write-Host $_ -ForegroundColor Red
  }
  Write-Host ("[{0}] Túnel caído (exit {1}). Reintento en 5s..." -f (Get-Date -Format "HH:mm:ss"), $code) -ForegroundColor Red
  Start-Sleep -Seconds 5
}
