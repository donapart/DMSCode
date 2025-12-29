@echo off
REM DMSCode mit Backend-Services starten
REM Startet Docker-Container und VS Code Insiders

cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "start-dmscode.ps1" -Dev -Backend

pause
