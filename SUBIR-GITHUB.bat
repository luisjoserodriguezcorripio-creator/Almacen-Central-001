@echo off
title Subir WMS a GitHub
cd /d "%~dp0"

echo.
echo ========================================
echo   SUBIR TODO A GITHUB
echo   Cuenta: luisjoserodriguezcorripio-creator
echo   Repo:   Almacen-Central-001
echo ========================================
echo.
echo Tu PC esta usando OTRA cuenta (luisjoserodriguezcorripio-creator).
echo Debes borrarla primero (ver instrucciones si falla).
echo.

git remote set-url origin https://github.com/luisjoserodriguezcorripio-creator/Almacen-Central-001.git

echo Subiendo archivos...
git push -u origin main --force

if errorlevel 1 (
    echo.
    echo ========================================
    echo   NO SE PUDO SUBIR - HAZ ESTO:
    echo ========================================
    echo.
    echo 1. Windows - Busca: Administrador de credenciales
    echo 2. Credenciales de Windows
    echo 3. Borra entradas de "github.com"
    echo 4. Vuelve a ejecutar este archivo
    echo 5. Inicia sesion con luisjoserodriguezcorripio-creator
    echo.
    echo O crea un token en:
    echo https://github.com/settings/tokens
    echo y usalo como contraseña cuando pida login.
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   LISTO - Todo subido a GitHub
echo ========================================
echo.
echo Abre: https://github.com/luisjoserodriguezcorripio-creator/Almacen-Central-001
echo Web:  https://luisjoserodriguezcorripio-creator.github.io/Almacen-Central-001/
echo.
pause
