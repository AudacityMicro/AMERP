@echo off
setlocal
set "ROOT=%~dp0"
set "NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not exist "%NODE%" (
  if exist "C:\Program Files\nodejs\node.exe" (
    set "NODE=C:\Program Files\nodejs\node.exe"
  ) else (
    where node >nul 2>nul
    if errorlevel 1 (
      echo Node.js was not found.
      echo Install Node.js LTS from https://nodejs.org, then run Setup-AMERP.cmd again.
      pause
      exit /b 1
    )
    set "NODE=node"
  )
)

pushd "%ROOT%"

where pnpm >nul 2>nul
if not errorlevel 1 (
  set "PNPM=pnpm"
) else (
  where corepack >nul 2>nul
  if not errorlevel 1 (
    echo Preparing pnpm through Corepack...
    corepack prepare pnpm@10.33.2 --activate
    if errorlevel 1 (
      echo Failed to prepare pnpm through Corepack.
      pause
      exit /b 1
    )
    set "PNPM=pnpm"
  ) else (
    where npx >nul 2>nul
    if errorlevel 1 (
      echo pnpm, corepack, and npx were not found.
      echo Install Node.js LTS, then run Setup-AMERP.cmd again.
      pause
      exit /b 1
    )
    set "PNPM=npx --yes pnpm@10.33.2"
  )
)

echo Installing AMERP dependencies...
%PNPM% install --frozen-lockfile
if errorlevel 1 (
  echo Dependency installation failed.
  pause
  exit /b 1
)

echo Building AMERP...
call "%ROOT%Build-App.cmd"
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

echo.
echo AMERP is ready. Run Start-App.cmd to launch the app.
pause
popd
