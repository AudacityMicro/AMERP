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

"%NODE%" "%ROOT%node_modules\vite\bin\vite.js" build
