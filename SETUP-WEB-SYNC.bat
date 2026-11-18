@echo off
title Sync nube - Almacen Central 001
cd /d "%~dp0"
echo.
echo ============================================================
echo   SYNC NUBE ENTRE PCS (JSONBin — gratis)
echo ============================================================
echo.
echo  Para que Despacho / Averias / WMS vean lo mismo en todas
echo  las PCs y celulares (GitHub Pages):
echo.
echo  1. Cree cuenta gratis en https://jsonbin.io
echo  2. Entre a API Keys y copie la Master Key
echo  3. Peguela aqui abajo (no se muestra al escribir)
echo.
set /p MASTERKEY=Master Key JSONBin: 
if "%MASTERKEY%"=="" (
  echo.
  echo Cancelado: no se ingreso Master Key.
  pause
  exit /b 1
)
echo.
echo Activando bins Averias + Despacho + Platform...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-web-sync.ps1" -MasterKey "%MASTERKEY%"
if errorlevel 1 (
  echo.
  echo Fallo la activacion. Revise la Master Key y la conexion a internet.
  pause
  exit /b 1
)
echo.
echo ============================================================
echo  LISTO
echo ============================================================
echo  Espere ~2 min (GitHub Pages) y en TODAS las PCs:
echo    Ctrl+F5 en despacho.html / averias.html / index.html
echo  Debe aparecer sync en vivo (ya no "Sin sync entre PCs").
echo.
echo  Alternativa solo WiFi local (sin nube):
echo    INICIAR-SYNC-TIEMPO-REAL.bat  -^> opcion B / Enter
echo.
pause
