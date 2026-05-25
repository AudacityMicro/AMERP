@echo off
setlocal
set "ROOT=%~dp0"
set "NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "ELECTRON=%ROOT%node_modules\electron\dist\electron.exe"
set "DIST=%ROOT%dist\index.html"
set "DIST_ASSETS=%ROOT%dist\assets"
set "SETUP=%ROOT%Setup-AMERP.cmd"

if not exist "%NODE%" (
  if exist "C:\Program Files\nodejs\node.exe" (
    set "NODE=C:\Program Files\nodejs\node.exe"
  ) else (
    where node >nul 2>nul
    if errorlevel 1 (
      echo Node.js was not found.
      echo Install Node.js or run from Codex after workspace dependencies are available.
      pause
      exit /b 1
    )
    set "NODE=node"
  )
)

if not exist "%ELECTRON%" (
  if exist "%SETUP%" (
    echo Electron runtime was not found. Repairing this AMERP install...
    call "%SETUP%" --no-pause
    if errorlevel 1 (
      echo.
      echo Repair failed. AMERP was not started.
      pause
      exit /b 1
    )
  )
)

if not exist "%ELECTRON%" (
  echo Electron runtime was not found.
  echo Expected: %ELECTRON%
  echo.
  echo Run Install-AMERP.cmd to repair this installation.
  pause
  exit /b 1
)

if not exist "%DIST%" (
  echo Built app files were not found. Repairing this AMERP install...
  call "%SETUP%" --no-pause
  if errorlevel 1 (
    echo.
    echo Repair failed. AMERP was not started.
    pause
    exit /b 1
  )
)

if not exist "%DIST%" (
  echo Built app files were not found.
  echo Expected: %DIST%
  echo.
  echo Run Install-AMERP.cmd to repair this installation.
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
start "AMERP" "%ELECTRON%" "."
popd
