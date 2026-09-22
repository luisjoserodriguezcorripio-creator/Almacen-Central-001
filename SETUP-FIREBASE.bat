@echo off
title Firebase sync - Almacen Central DC
cd /d "%~dp0"
echo.
echo ============================================================
echo   FIREBASE - Sync en vivo (telefono + PC)
echo ============================================================
echo.
echo  Proyecto: janselcastro-cd748
echo  Base:     Realtime Database (gratis, plan Spark)
echo.
echo  IMPORTANTE - API Key valida (opcional pero recomendada):
echo    1. Abra https://console.firebase.google.com/
echo    2. Proyecto janselcastro - Configuracion del proyecto
echo    3. Copie la "apiKey" de la app Web
echo    4. Peguela en data/site-config.json - firebase.apiKey
echo.
echo  La sync REST funciona aun sin API key valida.
echo  Reglas RTDB deben permitir lectura/escritura en:
echo    despacho/snapshot, platform/snapshot, averias/snapshot
echo.
echo  Para publicar:
echo    1. SUBIR-GITHUB.bat o git push
echo    2. Espere 1-2 minutos
echo    3. Ctrl+F5 en telefono Y PC (misma URL GitHub)
echo.
echo  URL: https://luisjoserodriguezcorripio-creator.github.io/Almacen-Central-001/despacho.html
echo.
pause
