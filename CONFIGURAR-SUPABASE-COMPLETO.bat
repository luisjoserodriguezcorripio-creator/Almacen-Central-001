@echo off
chcp 65001 >nul
echo.
echo  === Configurar Supabase — TODA la web ===
echo.

powershell -NoProfile -Command "Get-Content '%~dp0supabase\schema.sql' -Raw | Set-Clipboard"
echo  [1/4] SQL copiado al portapapeles.
echo        En Supabase SQL Editor: Ctrl+V y pulsa Corre.
echo.
start "" "https://supabase.com/dashboard"
timeout /t 2 >nul

set /p DONE="  Ya ejecutaste el SQL en Supabase? (S/N): "
if /i not "%DONE%"=="S" (
  echo  Ejecute el SQL primero y vuelva a correr este archivo.
  pause
  exit /b 0
)

echo.
set /p SB_URL="  [2/4] Project URL (https://xxx.supabase.co): "
set /p SB_KEY="  [3/4] Anon Key publica (eyJ...): "
if "%SB_URL%"=="" goto :error
if "%SB_KEY%"=="" goto :error

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\activar-supabase.ps1" -Url "%SB_URL%" -AnonKey "%SB_KEY%" -Push
if errorlevel 1 goto :error

echo.
echo  [4/4] Hecho. Abra la web con Ctrl+F5.
pause
exit /b 0

:error
echo Error en la configuracion.
pause
exit /b 1
