@echo off
REM Dagnara dev server launcher.
REM Runs the keep-alive supervisor in a visible window so you keep the QR code
REM and Expo's interactive shortcuts (r=reload, j=debug, etc.).
REM The supervisor auto-restarts Expo on crash/hang and blocks system sleep.

cd /d "%~dp0"
title Dagnara Expo Keep-Alive
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\expo-keepalive.ps1"
