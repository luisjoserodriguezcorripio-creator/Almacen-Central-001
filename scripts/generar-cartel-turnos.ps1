# Regenera los 4 PDF de carteles en Escritorio\Turnos-Imprimir-DC
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $env:USERPROFILE 'Desktop\Turnos-Imprimir-DC'
$gen = Join-Path $dir '_gen'
New-Item -ItemType Directory -Force -Path $gen | Out-Null

$choferUrl = 'https://luisjoserodriguezcorripio-creator.github.io/Almacen-Central-001/tc.html'
$supUrl = 'https://luisjoserodriguezcorripio-creator.github.io/Almacen-Central-001/sv.html'

Invoke-WebRequest -Uri ("https://quickchart.io/qr?size=800&margin=2&text=" + [uri]::EscapeDataString($choferUrl)) -OutFile (Join-Path $gen 'turnos-qr-chofer.png') -UseBasicParsing
Invoke-WebRequest -Uri ("https://quickchart.io/qr?size=800&margin=2&text=" + [uri]::EscapeDataString($supUrl)) -OutFile (Join-Path $gen 'turnos-qr-supervisor.png') -UseBasicParsing
Copy-Item (Join-Path $gen 'turnos-qr-chofer.png') (Join-Path $root 'assets\img\turnos-qr-portal.png') -Force

$templates = @(
  @{ src = '1-qr-chofer.html'; pdf = '1-CARTEL-QR.pdf' },
  @{ src = '2-pasos-chofer.html'; pdf = '2-CARTEL-PASOS.pdf' },
  @{ src = '3-qr-supervisor.html'; pdf = '3-CARTEL-QR-SUPERVISOR.pdf' },
  @{ src = '4-pasos-supervisor.html'; pdf = '4-CARTEL-PASOS-SUPERVISOR.pdf' }
)

$repoGen = Join-Path $root 'scripts\carteles-turnos'
if (Test-Path $repoGen) {
  Copy-Item (Join-Path $repoGen '*.html') $gen -Force
}

$edge = @(
  "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $edge) { throw 'Instale Microsoft Edge o Chrome para generar PDF.' }

foreach ($t in $templates) {
  $htmlPath = Join-Path $gen $t.src
  if (-not (Test-Path $htmlPath)) { throw "Falta plantilla: $($t.src)" }
  $pdfPath = Join-Path $dir $t.pdf
  $uri = [Uri]::new((Resolve-Path $htmlPath).Path).AbsoluteUri
  if (Test-Path $pdfPath) { Remove-Item $pdfPath -Force }
  & $edge --headless --disable-gpu --no-pdf-header-footer --run-all-compositor-stages-before-draw --virtual-time-budget=8000 --print-to-pdf="$pdfPath" "$uri" | Out-Null
  Start-Sleep -Seconds 2
  if (-not (Test-Path $pdfPath)) { throw "No se creó $($t.pdf)" }
  Write-Host "OK $($t.pdf)"
}

Remove-Item $gen -Recurse -Force
Write-Host "Listo: $dir"
