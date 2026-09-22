# Abre el puerto en el Firewall de Windows para acceso LAN
# Ejecutar como Administrador: .\scripts\open-firewall.ps1 -Port 8080
param(
    [int]$Port = 8080
)

$ErrorActionPreference = 'Stop'
$ruleName = "WMS Almacen Central LAN ($Port)"

$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Regla ya existe: $ruleName" -ForegroundColor Green
    exit 0
}

try {
    New-NetFirewallRule -DisplayName $ruleName `
        -Direction Inbound `
        -Action Allow `
        -Protocol TCP `
        -LocalPort $Port `
        -Profile Private,Domain,Public `
        -Description "Permite acceso al WMS desde otros dispositivos en la red local."
    Write-Host "Firewall OK: puerto $Port abierto." -ForegroundColor Green
    exit 0
} catch {
    Write-Host "PowerShell falló, intentando netsh..." -ForegroundColor Yellow
}

$netshName = "WMS-LAN-$Port"
netsh advfirewall firewall delete rule name="$netshName" 2>$null | Out-Null
netsh advfirewall firewall add rule name="$netshName" dir=in action=allow protocol=TCP localport=$Port profile=any
if ($LASTEXITCODE -eq 0) {
    Write-Host "Firewall OK (netsh): puerto $Port abierto." -ForegroundColor Green
    exit 0
}

Write-Host "ERROR: Ejecuta este script como Administrador (clic derecho)." -ForegroundColor Red
exit 1
