# Servidor Almacén Central DC — sync en tiempo real (LAN + internet)
param(
  [int]$Port = 8080,
  [switch]$AutoCloud
)

Set-Location -LiteralPath $PSScriptRoot
$lanServer = Join-Path $PSScriptRoot 'server\lan-server.js'

if (-not (Test-Path -LiteralPath $lanServer)) {
  Write-Error "No se encontró server\lan-server.js"
  exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error 'Instala Node.js (https://nodejs.org) para el servidor LAN.'
  exit 1
}

if ($AutoCloud) {
  Write-Host 'Comprobando sincronizacion cloud (JSONBin)...' -ForegroundColor Cyan
  node (Join-Path $PSScriptRoot 'scripts\ensure-averias-cloud.js')
  Write-Host ''
}

Write-Host ''
Write-Host '========================================' -ForegroundColor Green
Write-Host '  SYNC TIEMPO REAL — Almacen Central DC' -ForegroundColor Green
Write-Host '========================================' -ForegroundColor Green
Write-Host ''
Write-Host 'WiFi (LAN):  http://IP-DE-ESTE-PC:' $Port '/averias.html'
Write-Host 'Internet:    ejecute scripts\start-public-tunnel.ps1 (otra ventana)'
Write-Host '             O una vez: SETUP-AVERIAS-CLOUD.bat (jsonbin.io gratis)'
Write-Host ''
Write-Host 'Detener: Ctrl+C'
Write-Host ''

node $lanServer --port $Port
exit $LASTEXITCODE
