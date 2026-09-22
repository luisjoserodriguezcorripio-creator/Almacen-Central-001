# Genera carteles profesionales QR + pasos (PDF y PNG) para auditores de temperatura
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $env:USERPROFILE 'Desktop\Temperatura-Imprimir-DC'
$gen = Join-Path $dir '_gen'
New-Item -ItemType Directory -Force -Path $gen | Out-Null

$auditorUrl = 'https://luisjoserodriguezcorripio-creator.github.io/Almacen-Central-001/temperatura-auditor.html'

Write-Host 'Generando codigo QR...'
Invoke-WebRequest -Uri ("https://quickchart.io/qr?size=900&margin=2&dark=003882&light=ffffff&text=" + [uri]::EscapeDataString($auditorUrl)) -OutFile (Join-Path $gen 'temperatura-qr-auditor.png') -UseBasicParsing
Copy-Item (Join-Path $gen 'temperatura-qr-auditor.png') (Join-Path $root 'assets\img\temperatura-qr-auditor.png') -Force

$logoSrc = Join-Path $root 'assets\img\jc-logo.png'
if (-not (Test-Path $logoSrc)) { $logoSrc = Join-Path $root 'assets\img\jc-logo-64.png' }
Copy-Item $logoSrc (Join-Path $gen 'jc-logo.png') -Force

$repoGen = Join-Path $root 'scripts\carteles-temperatura'
if (Test-Path $repoGen) {
  Copy-Item (Join-Path $repoGen '*.html') $gen -Force
}

$edge = @(
  "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $edge) { throw 'Instale Microsoft Edge o Chrome para generar PDF y PNG.' }

$templates = @(
  @{ src = '1-qr-auditor.html'; pdf = '1-CARTEL-QR-AUDITOR-TEMPERATURA.pdf'; png = '1-CARTEL-QR-AUDITOR-TEMPERATURA.png' },
  @{ src = '2-pasos-auditor.html'; pdf = '2-CARTEL-PASOS-AUDITOR-TEMPERATURA.pdf'; png = '2-CARTEL-PASOS-AUDITOR-TEMPERATURA.png' }
)

foreach ($t in $templates) {
  $htmlPath = Join-Path $gen $t.src
  if (-not (Test-Path $htmlPath)) { throw "Falta plantilla: $($t.src)" }
  $pdfPath = Join-Path $dir $t.pdf
  $pngPath = Join-Path $dir $t.png
  $uri = [Uri]::new((Resolve-Path $htmlPath).Path).AbsoluteUri

  if (Test-Path $pdfPath) { Remove-Item $pdfPath -Force }
  Write-Host "PDF $($t.pdf)..."
  & $edge --headless --disable-gpu --no-pdf-header-footer --run-all-compositor-stages-before-draw --virtual-time-budget=10000 --print-to-pdf="$pdfPath" "$uri" | Out-Null
  Start-Sleep -Seconds 2
  if (-not (Test-Path $pdfPath)) { throw "No se creo $($t.pdf)" }

  if (Test-Path $pngPath) { Remove-Item $pngPath -Force }
  Write-Host "PNG $($t.png)..."
  & $edge --headless --disable-gpu --window-size=1275,1650 --screenshot="$pngPath" "$uri" | Out-Null
  Start-Sleep -Seconds 1
  if (-not (Test-Path $pngPath)) { throw "No se creo $($t.png)" }
  Write-Host "OK $($t.pdf) + $($t.png)"
}

Copy-Item (Join-Path $dir '1-CARTEL-QR-AUDITOR-TEMPERATURA.png') (Join-Path $root 'assets\img\cartel-qr-auditor-temperatura.png') -Force -ErrorAction SilentlyContinue

Remove-Item $gen -Recurse -Force
Write-Host ''
Write-Host "Listo en: $dir"
Write-Host "QR URL: $auditorUrl"
