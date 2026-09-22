param(
  [Parameter(Mandatory = $true)]
  [string]$MasterKey
)

Set-Location -LiteralPath $PSScriptRoot\..

$siteConfigPath = Join-Path $PSScriptRoot "..\data\site-config.json"
if (-not (Test-Path $siteConfigPath)) {
  Write-Error "No se encontró data/site-config.json"
  exit 1
}

function New-JsonBin {
  param(
    [string]$Name,
    [string]$BodyJson
  )
  $headers = @{
    "Content-Type" = "application/json"
    "X-Master-Key" = $MasterKey
    "X-Bin-Name" = $Name
  }
  try {
    return Invoke-RestMethod -Uri "https://api.jsonbin.io/v3/b" -Method Post -Headers $headers -Body $BodyJson
  } catch {
    Write-Error "Error al crear bin '$Name': $_"
    exit 1
  }
}

Write-Host ""
Write-Host "Activando sincronizacion WEB completa (JSONBin)..." -ForegroundColor Cyan
Write-Host ""

$averiasEmpty = @{
  version = 1
  updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  incidences = @()
  damages = @()
  securityIncidents = @()
  audits5s = @()
  equipmentInspections = @()
  equipmentRegistry = @{}
} | ConvertTo-Json -Depth 6

$despachoEmpty = @{
  module = "despacho"
  version = 1
  updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  pedidos = @()
  liveShare = $null
  liveShareLista = $null
} | ConvertTo-Json -Depth 4

$platformEmpty = @{
  version = 1
  updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  operaciones = $null
  productividad = $null
  facturas = $null
} | ConvertTo-Json -Depth 4

Write-Host "1/3 Creando bin Averias..." -ForegroundColor Yellow
$averiasBin = New-JsonBin -Name "Almacen-Central-001-Averias" -BodyJson $averiasEmpty
Write-Host "    OK: $($averiasBin.metadata.id)" -ForegroundColor Green

Write-Host "2/3 Creando bin Despacho..." -ForegroundColor Yellow
$despachoBin = New-JsonBin -Name "Almacen-Central-001-Despacho" -BodyJson $despachoEmpty
Write-Host "    OK: $($despachoBin.metadata.id)" -ForegroundColor Green

Write-Host "3/3 Creando bin WMS (operaciones/facturas/productividad)..." -ForegroundColor Yellow
$platformBin = New-JsonBin -Name "Almacen-Central-001-Platform" -BodyJson $platformEmpty
Write-Host "    OK: $($platformBin.metadata.id)" -ForegroundColor Green

$cfg = Get-Content $siteConfigPath -Raw | ConvertFrom-Json
$cfg.averiasJsonBin = @{
  enabled = $true
  binId = $averiasBin.metadata.id
  accessKey = $MasterKey
  keyType = "master"
}
$cfg.despachoJsonBin = @{
  enabled = $true
  binId = $despachoBin.metadata.id
  accessKey = $MasterKey
  keyType = "master"
}
$cfg.platformJsonBin = @{
  enabled = $true
  binId = $platformBin.metadata.id
  accessKey = $MasterKey
  keyType = "master"
}
$cfg.pollSeconds = 1
$cfg.realtime = $true
$cfg.updatedAt = (Get-Date).ToUniversalTime().ToString("o")
$cfg.help = "Sync web activa: todos ven lo mismo en index.html, despacho.html y averias.html (~1s)."

$json = $cfg | ConvertTo-Json -Depth 8
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($siteConfigPath, $json, $utf8NoBom)

Write-Host ""
Write-Host "site-config.json actualizado." -ForegroundColor Green
Write-Host "Subiendo a GitHub..." -ForegroundColor Cyan

git add data/site-config.json
git commit -m "Activar sincronizacion web completa (JSONBin)"
git push origin main

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " LISTO — TODOS VEN LO MISMO EN LA WEB" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Espere 2 minutos y en TODAS las PCs:" -ForegroundColor Yellow
Write-Host "  1. Abra https://luisjoserodriguezcorripio-creator.github.io/Almacen-Central-001/"
Write-Host "  2. Pulse Ctrl+F5 (recarga forzada)"
Write-Host ""
Write-Host "Despacho: .../despacho.html"
Write-Host "Averias:  .../averias.html"
Write-Host ""
