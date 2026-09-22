@echo off
title Renombrar URL - Almacen Central DC
cd /d "%~dp0"

echo.
echo ========================================
echo   CAMBIAR URL DE LA WEB PUBLICA
echo ========================================
echo.
echo URL nueva deseada:
echo   https://luisjoserodriguezcorripio-creator.github.io/Almacen-Central-001/
echo.
echo PASO 1 - Se abrira GitHub en tu navegador.
echo En "Repository name" escribe:  Almacen-Central-001
echo Luego pulsa Rename.
echo.
pause

start "" "https://github.com/luisjoserodriguezcorripio-creator/Almacen-Central-001/settings"

echo.
echo PASO 2 - Cuando hayas renombrado, pulsa una tecla
echo para actualizar el enlace local y subir cambios...
pause

git remote set-url origin https://github.com/luisjoserodriguezcorripio-creator/Almacen-Central-001.git
git push origin main

if errorlevel 1 (
    echo.
    echo Si falla el push, renombra primero el repo en GitHub
    echo y vuelve a ejecutar este archivo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   LISTO
echo ========================================
echo.
echo Web publica:
echo   https://luisjoserodriguezcorripio-creator.github.io/Almacen-Central-001/
echo.
pause
