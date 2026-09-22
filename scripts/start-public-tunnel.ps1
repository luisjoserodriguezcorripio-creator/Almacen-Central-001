param(
  [int]$Port = 8080,
  [switch]$SkipGitPush
)

Set-Location -LiteralPath $PSScriptRoot\..

$cloudflared = $null
foreach ($cmd in @('cloudflared', 'cloudflared.exe')) {
  if (Get-Command $cmd -ErrorAction SilentlyContinue) {
    $cloudflared = (Get-Command $cmd).Source
    break
  }
}

if (-not $cloudflared) {
  Write-Host ''
  Write-Host 'cloudflared no esta instalado.' -ForegroundColor Yellow
  Write-Host 'Opcion A (recomendada): SETUP-AVERIAS-CLOUD.bat con Master Key de jsonbin.io'
  Write-Host 'Opcion B: instale cloudflared para tunel publico gratis:'
  Write-Host '  winget install Cloudflare.cloudflared'
  Write-Host ''
  exit 1
}

Write-Host ''
Write-Host 'Iniciando tunel publico (Cloudflare Quick Tunnel)...' -ForegroundColor Cyan
Write-Host "Puerto local: $Port"
Write-Host ''

$logFile = Join-Path $env:TEMP 'almacen-dc-tunnel.log'
if (Test-Path $logFile) { Remove-Item $logFile -Force }

$proc = Start-Process -FilePath $cloudflared -ArgumentList @(
  'tunnel', '--url', "http://127.0.0.1:$Port", '--logfile', $logFile, '--loglevel', 'info'
) -PassThru -WindowStyle Hidden

$publicUrl = $null
$deadline = (Get-Date).AddSeconds(45)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 2
  if (-not (Test-Path $logFile)) { continue }
  $log = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
  if ($log -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
    $publicUrl = $Matches[0]
    break
  }
}

if (-not $publicUrl) {
  try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
  Write-Error 'No se obtuvo URL del tunel. Revise $env:TEMP\almacen-dc-tunnel.log'
  exit 1
}

Write-Host "URL publica: $publicUrl" -ForegroundColor Green
Write-Host 'Los celulares con internet pueden sincronizar en tiempo real via esta URL.' -ForegroundColor Green
Write-Host ''

$urlFile = Join-Path $PSScriptRoot '..\data\public-tunnel-url.txt'
Set-Content -Path $urlFile -Value $publicUrl -Encoding UTF8

if (-not $SkipGitPush) {
  if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host 'Actualizando site-config.json y GitHub...' -ForegroundColor Cyan
    node -e "require('./scripts/update-public-sync-url.js').updatePublicSyncUrl(process.cwd(), process.argv[1]).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exit(1)})" $publicUrl
  } else {
    Write-Host 'Node no disponible — copie esta URL en data/site-config.json → publicSyncBaseUrl:' -ForegroundColor Yellow
    Write-Host $publicUrl
  }
}

Write-Host ''
Write-Host 'Mantenga esta ventana abierta. Ctrl+C detiene el tunel.' -ForegroundColor Yellow
Write-Host ''

try {
  Wait-Process -Id $proc.Id
} finally {
  try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
}
