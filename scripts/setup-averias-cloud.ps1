param(
  [Parameter(Mandatory = $true)]
  [string]$MasterKey,

  [string]$BinName = "Almacen-Central-001-Averias"
)

Set-Location -LiteralPath $PSScriptRoot\..

$siteConfigPath = Join-Path $PSScriptRoot "..\data\site-config.json"
if (-not (Test-Path $siteConfigPath)) {
  Write-Error "No se encontró data/site-config.json"
  exit 1
}

$emptySnap = @{
  version = 1
  updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  incidences = @()
  damages = @()
  securityIncidents = @()
  audits5s = @()
  equipmentInspections = @()
  equipmentRegistry = @{}
} | ConvertTo-Json -Depth 6

Write-Host "Creando bin en JSONBin.io..." -ForegroundColor Cyan

$headers = @{
  "Content-Type" = "application/json"
  "X-Master-Key" = $MasterKey
  "X-Bin-Name" = $BinName
}

try {
  $create = Invoke-RestMethod -Uri "https://api.jsonbin.io/v3/b" -Method Post -Headers $headers -Body $emptySnap
} catch {
  Write-Error "Error al crear bin JSONBin: $_"
  exit 1
}

$binId = $create.metadata.id
Write-Host "Bin creado: $binId" -ForegroundColor Green

$cfg = Get-Content $siteConfigPath -Raw | ConvertFrom-Json
$cfg.averiasJsonBin = @{
  enabled = $true
  binId = $binId
  accessKey = $MasterKey
  keyType = "master"
}
$cfg.pollSeconds = 2
$cfg.realtime = $true
$cfg.updatedAt = (Get-Date).ToUniversalTime().ToString("o")

$json = $cfg | ConvertTo-Json -Depth 6
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($siteConfigPath, $json, $utf8NoBom)

Write-Host ""
Write-Host "site-config.json actualizado." -ForegroundColor Green
Write-Host "Subiendo a GitHub..." -ForegroundColor Cyan

git add data/site-config.json
git commit -m "Activar sincronizacion cloud de reportes (JSONBin)"
git push origin main

Write-Host ""
Write-Host "Listo. Todos los celulares con internet veran los mismos reportes." -ForegroundColor Green
Write-Host "Espere 2 minutos y recargue averias.html en los dispositivos." -ForegroundColor Yellow
