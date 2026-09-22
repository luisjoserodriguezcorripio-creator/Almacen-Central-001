@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist "data\sync-secrets.local.json" (
  copy /Y "scripts\sync-secrets.example.json" "data\sync-secrets.local.json" >nul
)

echo.
echo  ========================================
echo   Turnstile — pegar SECRET KEY (1 minuto)
echo  ========================================
echo.
echo  1. Se abrira Cloudflare Turnstile en el navegador
echo  2. Clic en su widget "Almacen Central DC Login"
echo  3. Copie la SECRET KEY (no la Site Key)
echo  4. Peguela en turnstileSecretKey en el Bloc de notas
echo  5. Guarde (Ctrl+S) y cierre el Bloc de notas
echo.
echo  La Secret Key NO se sube a GitHub — solo queda en este PC.
echo.

start "" "https://dash.cloudflare.com/?to=/:account/turnstile"
timeout /t 2 /nobreak >nul
notepad "data\sync-secrets.local.json"

echo.
echo  Listo. Reinicie serve-dashboard.ps1 si el servidor LAN estaba abierto.
echo.
pause
