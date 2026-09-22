@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\ejecutar-hub-news-supabase.ps1"
pause
