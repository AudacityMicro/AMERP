@echo off
setlocal
set "ROOT=%~dp0"
set "ELECTRON=%ROOT%node_modules\electron\dist\electron.exe"
set "DIST=%ROOT%dist\index.html"
set "DIST_ASSETS=%ROOT%dist\assets"

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

set "NEEDS_BUILD="
if not exist "%DIST_ASSETS%" set "NEEDS_BUILD=1"
if not defined NEEDS_BUILD (
  dir /b "%DIST_ASSETS%\*.js" >nul 2>nul || set "NEEDS_BUILD=1"
)
if not defined NEEDS_BUILD (
  dir /b "%DIST_ASSETS%\*.css" >nul 2>nul || set "NEEDS_BUILD=1"
)

if defined NEEDS_BUILD (
  echo Build output is incomplete. Rebuilding the app...
  call "%ROOT%Build-App.cmd"
  if errorlevel 1 (
    echo.
    echo Build failed. The app was not started.
    pause
    exit /b 1
  )
)

pushd "%ROOT%"
start "Setup Sheet Generator" "%ELECTRON%" "."
popd
