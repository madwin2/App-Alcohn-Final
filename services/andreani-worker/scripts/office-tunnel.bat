@echo off
title Andreani office tunnel (NO CERRAR)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0office-tunnel.ps1"
pause
