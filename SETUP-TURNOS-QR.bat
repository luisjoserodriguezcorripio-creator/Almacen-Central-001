@echo off
setlocal
cd /d "%~dp0turnos-qr"
echo === Control de Turnos QR ===
echo.
where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js / npm no encontrado. Instale Node 18+ desde https://nodejs.org
  pause
  exit /b 1
)
call npm install
if errorlevel 1 pause & exit /b 1
call npm run build
if errorlevel 1 pause & exit /b 1
echo.
echo Listo. Abra turnos.html o use el portal desde el menu del almacen.
pause
