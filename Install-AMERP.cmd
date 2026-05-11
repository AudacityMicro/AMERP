@echo off
setlocal
set "ROOT=%~dp0"
set "SCRIPT=%ROOT%Install-AMERP.ps1"

if not exist "%SCRIPT%" (
  echo Install-AMERP.ps1 was not found next to this file.
  echo Download the full AMERP ZIP from GitHub, extract it, then run Install-AMERP.cmd again.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
if errorlevel 1 (
  echo.
  echo AMERP installation failed. Review the messages above.
  pause
  exit /b 1
)

