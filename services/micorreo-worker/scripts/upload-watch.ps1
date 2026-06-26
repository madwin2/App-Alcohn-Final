# Abre Chromium visible y ejecuta el flujo MiCorreo paso a paso.
# Uso:
#   npm run upload:watch -- --file fixtures/sample-sucursal.csv --pay

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$env:MICORREO_HEADLESS = 'false'
if (-not $env:MICORREO_SLOW_MO_MS) {
  $env:MICORREO_SLOW_MO_MS = '400'
}

Write-Host "[watch] MICORREO_HEADLESS=false, SLOW_MO=$($env:MICORREO_SLOW_MO_MS)ms"
Write-Host "[watch] Se abre Chromium. No cierres la ventana hasta que termine."

npx tsx src/scripts/cli-upload.ts @args
exit $LASTEXITCODE
