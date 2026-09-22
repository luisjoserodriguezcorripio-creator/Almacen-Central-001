# Verifica que el WMS sea accesible por red local
param([int]$Port = 8080)

$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path $PSScriptRoot -Parent
$ok = $true

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Verificacion de acceso WMS (LAN)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Servidor escuchando
$listen = netstat -an | Select-String "0.0.0.0:$Port.*LISTENING"
if ($listen) {
    Write-Host "[OK] Servidor escuchando en puerto $Port" -ForegroundColor Green
} else {
    Write-Host "[FALLO] No hay servidor en puerto $Port" -ForegroundColor Red
    Write-Host "       Ejecuta: .\serve-dashboard.ps1" -ForegroundColor Yellow
    $ok = $false
}

# 2. IPs LAN
$ips = @()
Get-NetIPAddress -AddressFamily IPv4 | ForEach-Object {
    if ($_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown') {
        $ips += @{ Alias = $_.InterfaceAlias; IP = $_.IPAddress }
    }
}

if ($ips.Count -eq 0) {
    Write-Host "[FALLO] No se detecto IP de red" -ForegroundColor Red
    $ok = $false
} else {
    Write-Host "[OK] IPs detectadas:" -ForegroundColor Green
    foreach ($n in $ips) {
        Write-Host "     $($n.Alias): $($n.IP)" -ForegroundColor White
        Write-Host "     Link WMS:      http://$($n.IP):$Port" -ForegroundColor Cyan
        Write-Host "     Link Despacho: http://$($n.IP):$Port/despacho.html" -ForegroundColor Cyan
    }
}

# 3. Probar localhost
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 5
    if ($r.StatusCode -eq 200) {
        Write-Host "[OK] API responde en localhost" -ForegroundColor Green
    }
} catch {
    Write-Host "[FALLO] API no responde en localhost" -ForegroundColor Red
    $ok = $false
}

# 4. Probar cada IP
foreach ($n in $ips) {
    $ip = $n.IP
    try {
        $r = Invoke-WebRequest -Uri "http://${ip}:$Port/api/health" -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode -eq 200) {
            Write-Host "[OK] API responde en http://${ip}:$Port" -ForegroundColor Green
        }
    } catch {
        Write-Host "[FALLO] No responde en http://${ip}:$Port" -ForegroundColor Red
        $ok = $false
    }
}

# 5. Firewall
$fw = Get-NetFirewallRule -DisplayName "*WMS*" -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -eq 'True' }
if ($fw) {
    Write-Host "[OK] Regla de firewall WMS encontrada" -ForegroundColor Green
} else {
    Write-Host "[AVISO] Sin regla de firewall para WMS" -ForegroundColor Yellow
    Write-Host "       Ejecuta como Admin: .\ABRIR-ACCESO-RED.bat" -ForegroundColor Yellow
    Write-Host "       (Sin esto, otros equipos suelen dar error de conexion)" -ForegroundColor Yellow
}

Write-Host ""
if ($ok) {
    Write-Host "RESULTADO: Tu PC sirve la web correctamente." -ForegroundColor Green
    Write-Host "Si otros aun fallan: misma red, firewall abierto, no uses WiFi invitado." -ForegroundColor White
} else {
    Write-Host "RESULTADO: Hay problemas. Corrige los puntos en FALLO/AVISO." -ForegroundColor Red
}
Write-Host ""
