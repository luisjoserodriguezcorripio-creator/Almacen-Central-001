@echo off
title Firebase sync - Almacen Central 001
cd /d "%~dp0"
echo.
echo ============================================================
echo   FIREBASE - Sync en vivo (telefono + PC)
echo ============================================================
echo.
echo  Proyecto: almacen-central-001
echo  Base:     Realtime Database (gratis, plan Spark)
echo  URL:      https://almacen-central-001-default-rtdb.firebaseio.com
echo.
echo  Config ya esta en data/site-config.json (firebase.enabled=true).
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
