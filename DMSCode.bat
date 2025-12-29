@echo off
REM DMSCode Quick Launcher
REM Doppelklick zum Starten von DMSCode

cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "start-dmscode.ps1" -Dev

pause
