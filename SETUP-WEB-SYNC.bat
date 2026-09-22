@echo off
title Sync en vivo - Almacen Central DC
cd /d "%~dp0"
echo.
echo ============================================================
echo   SYNC EN TIEMPO REAL — FIREBASE (YA CONFIGURADO)
echo ============================================================
echo.
echo  NO necesita JSONBin ni Master Key.
echo.
echo  La web usa Firebase Realtime Database (gratis).
echo  Todos los modulos sincronizan en menos de 1 segundo:
echo    - Centro de mando WMS  (index.html)
echo    - Despacho             (despacho.html)
echo    - Operaciones / Averias (averias.html)
echo.
echo  PASOS:
echo    1. Publique en GitHub (SUBIR-GITHUB.bat o git push)
echo    2. Espere 2 minutos
echo    3. Ctrl+F5 en telefono Y PC
echo    4. Misma URL en todos:
echo       https://luisjoserodriguezcorripio-creator.github.io/Almacen-Central-001/
echo.
echo  Reglas RTDB (OBLIGATORIO — sin esto no guarda en celular):
echo    Ejecute CONFIGURAR-FIREBASE-REGLAS.bat y publique las reglas
echo.
echo  Opcional LAN sin internet: INICIAR-SYNC-TIEMPO-REAL.bat
echo.
pause
