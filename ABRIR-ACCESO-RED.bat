@echo off
title WMS - Abrir acceso en red
cd /d "%~dp0"

:: Pedir permisos de Administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Solicitando permisos de Administrador...
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo.
echo ========================================
echo   WMS - Configurar acceso en red LAN
echo ========================================
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0scripts\open-firewall.ps1" -Port 8080
if errorlevel 1 (
    echo.
    echo No se pudo abrir el firewall.
    pause
    exit /b 1
)

echo.
echo Firewall configurado. Iniciando servidor...
echo.
start "WMS Servidor LAN" powershell -ExecutionPolicy Bypass -File "%~dp0serve-dashboard.ps1" -Port 8080

timeout /t 3 /nobreak >nul
start http://localhost:8080

echo.
echo Listo. Comparte el link que aparece en la ventana del servidor.
echo Tambien revisa ACCESO-RED.txt en esta carpeta.
echo.
pause
