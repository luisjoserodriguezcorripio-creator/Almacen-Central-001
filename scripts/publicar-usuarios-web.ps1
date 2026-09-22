# Publica usuarios del personal en GitHub Pages (data/web-users.json)
param(
    [switch]$SkipPush
)

Set-Location -LiteralPath (Join-Path $PSScriptRoot '..')
$root = Get-Location

Write-Host ''
Write-Host 'Publicar usuarios en la web (GitHub Pages)...' -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error 'Instala Node.js para exportar usuarios.'
    exit 1
}

# Intenta exportar desde el servidor LAN si está activo
try {
    $resp = Invoke-RestMethod -Method POST -Uri 'http://localhost:8080/api/publish-web-users-live' -TimeoutSec 90
    if ($resp.ok -and $resp.pushed) {
        Write-Host ('Publicado en GitHub: ' + $resp.count + ' usuario(s)') -ForegroundColor Green
        Write-Host 'https://luisjoserodriguezcorripio-creator.github.io/Almacen-Central-001/' -ForegroundColor White
        exit 0
    }
    if ($resp.ok) {
        Write-Host ('Exportados: ' + $resp.count + ' usuario(s). Push manual pendiente.') -ForegroundColor Yellow
    }
} catch {
    try {
        $resp = Invoke-RestMethod -Method POST -Uri 'http://localhost:8080/api/publish-web-users' -TimeoutSec 5
        if ($resp.ok) {
            Write-Host ('Exportados desde servidor LAN: ' + $resp.count + ' usuario(s)') -ForegroundColor Green
        }
    } catch {
        node (Join-Path $PSScriptRoot 'export-web-users.js')
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
}

$webFile = Join-Path $root 'data\web-users.json'
if (-not (Test-Path -LiteralPath $webFile)) {
    Write-Error 'No se generó data/web-users.json'
    exit 1
}

git add data/web-users.json
git commit -m "Publicar usuarios del personal para acceso web" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Sin cambios nuevos en web-users.json (ya estaba actualizado).' -ForegroundColor Yellow
} else {
    Write-Host 'Commit creado.' -ForegroundColor Green
}

if ($SkipPush) {
    Write-Host 'Omitido push (-SkipPush).'
    exit 0
}

git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host 'No se pudo hacer push. Ejecuta SUBIR-GITHUB.bat o revisa credenciales.' -ForegroundColor Yellow
    exit 1
}

Write-Host ''
Write-Host 'Listo. En 2-5 minutos el personal podrá entrar en:' -ForegroundColor Green
Write-Host 'https://luisjoserodriguezcorripio-creator.github.io/Almacen-Central-001/' -ForegroundColor White
Write-Host ''
