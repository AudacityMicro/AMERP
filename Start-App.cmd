@echo off
setlocal
set "ROOT=%~dp0"
set "ELECTRON=%ROOT%node_modules\electron\dist\electron.exe"
set "DIST=%ROOT%dist\index.html"

if not exist "%ELECTRON%" (
  echo Electron runtime was not found.
  echo Expected: %ELECTRON%
  echo.
  echo Run this from the completed project folder after dependencies have been installed.
  pause
  exit /b 1
)

if not exist "%DIST%" (
  echo Built app files were not found.
  echo Expected: %DIST%
  echo.
  echo Run Build-App.cmd first, then run Start-App.cmd again.
  pause
  exit /b 1
)

pushd "%ROOT%"
start "Setup Sheet Generator" "%ELECTRON%" "."
popd
