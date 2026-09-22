@echo off
title Activar nube - Almacen Central DC
cd /d "%~dp0"
echo.
echo Este script ahora activa TODA la web (WMS + Despacho + Averias).
echo Redirigiendo a SETUP-WEB-SYNC.bat ...
echo.
call "%~dp0SETUP-WEB-SYNC.bat"
