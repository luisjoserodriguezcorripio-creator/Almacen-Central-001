@echo off
setlocal
cd /d "%~dp0"
echo.
echo === Configurar Turnos en Supabase (datos en vivo) ===
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ejecutar-turnos-supabase.ps1"
echo.
pause
