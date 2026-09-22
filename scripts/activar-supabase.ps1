# Activa Supabase en data/site-config.json y opcionalmente publica en GitHub
param(
  [Parameter(Mandatory = $true)][string]$Url,
  [Parameter(Mandatory = $true)][string]$AnonKey,
  [switch]$Push
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

$Url = $Url.Trim()
$AnonKey = $AnonKey.Trim()

if (-not $Url -or -not $AnonKey) {
  Write-Error 'URL y Anon Key son obligatorios.'
}

node "$root\scripts\setup-inventario-supabase.js" $Url $AnonKey
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'Probando conexion a Supabase...' -ForegroundColor Cyan

$headers = @{
  apikey = $AnonKey
  Authorization = "Bearer $AnonKey"
}

try {
  $test = Invoke-RestMethod -Uri "$Url/rest/v1/web_snapshots?select=module&limit=1" -Headers $headers -Method Get
  Write-Host 'OK — web_snapshots accesible.' -ForegroundColor Green
} catch {
  Write-Host 'AVISO — No se pudo leer web_snapshots. Ejecute schema.sql en SQL Editor si aun no lo hizo.' -ForegroundColor Yellow
  Write-Host $_.Exception.Message
}

if ($Push) {
  Push-Location $root
  git add data/site-config.json
  git commit -m "Activar Supabase para toda la web (WMS, averias, despacho, inventario)"
  git push origin main
  Pop-Location
  Write-Host 'Publicado en GitHub Pages. Ctrl+F5 en la web.' -ForegroundColor Green
}

Write-Host 'Listo.' -ForegroundColor Green
