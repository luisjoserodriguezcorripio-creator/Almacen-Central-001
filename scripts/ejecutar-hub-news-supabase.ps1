# Ejecuta la migracion del tablon informativo en Supabase
param(
  [string]$AccessToken = '',
  [string]$ProjectRef = 'pjbzbwckcbhmkeidsqjz',
  [string]$AnonKey = 'sb_publishable_TvhOzL5kopTNty1xbNLZ6w_uKnMKJaC',
  [switch]$SkipBrowser
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$sqlPath = Join-Path $root 'supabase\migrations\20250617_hub_news.sql'
$seedPath = Join-Path $root 'supabase\migrations\20250618_hub_news_portal_seed.sql'
$secretsPath = Join-Path $root 'data\supabase-admin.local.json'

function Test-HubNewsTable {
  param([string]$Key)
  $headers = @{
    apikey       = $Key
    Authorization = "Bearer $Key"
  }
  try {
    $null = Invoke-RestMethod -Uri "https://$ProjectRef.supabase.co/rest/v1/hub_news?select=id&limit=1" -Headers $headers -Method Get
    return $true
  } catch {
    return $false
  }
}

function Get-AccessToken {
  if ($AccessToken) { return $AccessToken.Trim() }
  if (Test-Path $secretsPath) {
    try {
      $cfg = Get-Content $secretsPath -Raw | ConvertFrom-Json
      if ($cfg.accessToken) { return [string]$cfg.accessToken.Trim() }
    } catch { }
  }
  if ($env:SUPABASE_ACCESS_TOKEN) { return $env:SUPABASE_ACCESS_TOKEN.Trim() }
  return ''
}

function Invoke-SupabaseSql {
  param([string]$Token, [string]$Sql)
  $uri = "https://api.supabase.com/v1/projects/$ProjectRef/database/query"
  $headers = @{
    Authorization = "Bearer $Token"
    'Content-Type' = 'application/json'
  }
  $body = @{ query = $Sql } | ConvertTo-Json -Compress
  return Invoke-RestMethod -Uri $uri -Headers $headers -Method Post -Body $body
}

if (-not (Test-Path $sqlPath)) {
  Write-Error "No se encontro: $sqlPath"
}

Write-Host ''
Write-Host '=== Tablon informativo — Supabase ===' -ForegroundColor Cyan
Write-Host ''

if (Test-HubNewsTable -Key $AnonKey) {
  Write-Host 'OK — La tabla hub_news ya existe.' -ForegroundColor Green
  exit 0
}

$sql = Get-Content $sqlPath -Raw
if (Test-Path $seedPath) { $sql += "`n`n" + (Get-Content $seedPath -Raw) }
$token = Get-AccessToken

if ($token) {
  Write-Host 'Ejecutando SQL en Supabase...' -ForegroundColor Yellow
  try {
    Invoke-SupabaseSql -Token $token -Sql $sql | Out-Null
    Start-Sleep -Seconds 2
    if (Test-HubNewsTable -Key $AnonKey) {
      Write-Host 'OK — Migracion aplicada correctamente.' -ForegroundColor Green
      exit 0
    }
    Write-Host 'AVISO — SQL enviado pero hub_news aun no responde. Revise el SQL Editor.' -ForegroundColor Yellow
  } catch {
    Write-Host 'No se pudo ejecutar via API:' -ForegroundColor Red
    Write-Host $_.Exception.Message
    if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
  }
}

Write-Host 'Modo manual:' -ForegroundColor Yellow
Write-Host '1. SQL copiado al portapapeles.'
Set-Clipboard -Value $sql
if (-not $SkipBrowser) {
  Start-Process "https://supabase.com/dashboard/project/$ProjectRef/sql/new"
}
Write-Host '2. En Supabase SQL Editor: Ctrl+V y pulse RUN.'
Write-Host '3. Espere confirmacion Success.'
Write-Host ''

if (-not $token) {
  Write-Host 'Tip: Para automatizar la proxima vez, cree data/supabase-admin.local.json con:' -ForegroundColor DarkGray
  Write-Host '  { "accessToken": "sbp_..." }' -ForegroundColor DarkGray
  Write-Host '  Token en: https://supabase.com/dashboard/account/tokens' -ForegroundColor DarkGray
  Write-Host ''
}

$max = 60
for ($i = 1; $i -le $max; $i++) {
  Start-Sleep -Seconds 3
  if (Test-HubNewsTable -Key $AnonKey) {
    Write-Host 'OK — Tabla detectada. Tablon listo para usar.' -ForegroundColor Green
    exit 0
  }
  Write-Host "Esperando migracion... ($i/$max)"
}

Write-Host 'Tiempo agotado. Ejecute el SQL en Supabase y recargue index.html con Ctrl+F5.' -ForegroundColor Yellow
exit 1
