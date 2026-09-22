@echo off
title Sync tiempo real - Almacen Central DC
cd /d "%~dp0"
color 0A
echo.
echo ============================================================
echo   SINCRONIZACION EN TIEMPO REAL — TODOS LOS CELULARES
echo ============================================================
echo.
echo  OPCION A (recomendada — sync WEB para todos):
echo    1. Doble clic en SETUP-WEB-SYNC.bat
echo    2. Pegue Master Key NUEVA de https://jsonbin.io (cuenta gratis)
echo    3. Espere 2 min y Ctrl+F5 en TODAS las PCs
echo.
echo  OPCION B (PC servidor siempre encendido):
echo    1. Esta ventana inicia el servidor LAN
echo    2. Se abrira otra ventana con tunel publico (Cloudflare)
echo    3. DESPACHO: use http://IP-DEL-PC:8080/despacho.html en TODAS las PCs
echo       Pantalla TV: http://IP-DEL-PC:8080/despacho-pantalla.html
echo.
set /p ELEGIR=Pulse A para JSONBin, B para tunel, Enter para solo LAN: 
if /i "%ELEGIR%"=="A" (
  call "%~dp0SETUP-WEB-SYNC.bat"
  exit /b 0
)
echo.
echo Iniciando servidor...
start "Almacen DC - Servidor" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve-dashboard.ps1" -AutoCloud
if /i "%ELEGIR%"=="B" (
  timeout /t 6 /nobreak >nul
  start "Almacen DC - Tunel" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-public-tunnel.ps1"
  echo Tunel iniciado. Revise la otra ventana para la URL publica.
)
echo.
echo Listo. En WiFi use:
echo   Despacho:  http://IP-DEL-PC:8080/despacho.html
echo   Pantalla:  http://IP-DEL-PC:8080/despacho-pantalla.html
echo   Averias:   http://IP-DEL-PC:8080/averias.html
pause
