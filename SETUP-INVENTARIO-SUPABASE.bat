@echo off
chcp 65001 >nul
echo.
echo  Configurar Supabase — TODA la web (WMS, averías, despacho, inventario)
echo  ===================================
echo.
set /p SB_URL="URL de Supabase (https://xxx.supabase.co): "
set /p SB_KEY="Anon Key (public): "
if "%SB_URL%"=="" goto :error
if "%SB_KEY%"=="" goto :error
node "%~dp0scripts\setup-inventario-supabase.js" "%SB_URL%" "%SB_KEY%"
if errorlevel 1 goto :error
echo.
pause
exit /b 0
:error
echo Datos incompletos.
pause
exit /b 1
