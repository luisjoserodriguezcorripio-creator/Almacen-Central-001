@echo off
title Publicar reglas Firebase - OBLIGATORIO
cd /d "%~dp0"
echo.
echo ============================================================
echo   SIN ESTO NO HAY SYNC EN VIVO ENTRE CELULAR Y PC
echo ============================================================
echo.
echo  1. Se abrira firebase-database.rules.json
echo  2. Copie TODO el contenido (Ctrl+A, Ctrl+C)
echo  3. En Firebase Console - Reglas - pegue y PUBLICAR
echo.
echo  Las reglas deben permitir todo bajo "averias":
echo    "averias": { ".read": true, ".write": true }
echo.
start "" notepad "%~dp0firebase-database.rules.json"
timeout /t 2 /nobreak >nul
start "" "https://console.firebase.google.com/project/janselcastro-cd748/database/janselcastro-cd748-default-rtdb/rules"
echo.
pause
