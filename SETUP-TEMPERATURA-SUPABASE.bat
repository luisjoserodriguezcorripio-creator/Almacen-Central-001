@echo off
title Configurar Temperatura en Supabase
cd /d "%~dp0"
chcp 65001 >nul

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ejecutar-temperatura-supabase.ps1"
set ERR=%ERRORLEVEL%

echo.
if %ERR%==0 (
  echo Listo. Abra temperatura.html con Ctrl+F5.
) else (
  echo Complete el paso RUN en Supabase y vuelva a ejecutar este archivo.
)
echo.
pause
exit /b %ERR%
