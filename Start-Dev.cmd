@echo off
setlocal
set "ROOT=%~dp0"
set "NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not exist "%NODE%" (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Node.js was not found. Install Node.js or run from Codex after workspace dependencies are available.
    exit /b 1
  )
  set "NODE=node"
)

if not exist "%ROOT%node_modules\electron\cli.js" (
  echo Dependencies are missing. Run dependency installation before starting the app.
  exit /b 1
)

"%NODE%" "%ROOT%scripts\dev.mjs"
