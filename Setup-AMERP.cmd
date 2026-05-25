@echo off
setlocal
set "ROOT=%~dp0"
set "NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "NO_PAUSE="
set "PYTHON="

if /i "%~1"=="--no-pause" set "NO_PAUSE=1"

if not exist "%NODE%" (
  if exist "C:\Program Files\nodejs\node.exe" (
    set "NODE=C:\Program Files\nodejs\node.exe"
  ) else (
    where node >nul 2>nul
    if errorlevel 1 (
      echo Node.js was not found.
      echo Install Node.js LTS from https://nodejs.org, then run Setup-AMERP.cmd again.
      if not defined NO_PAUSE pause
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
    call corepack prepare pnpm@10.33.2 --activate
    if errorlevel 1 (
      echo Failed to prepare pnpm through Corepack.
      if not defined NO_PAUSE pause
      exit /b 1
    )
    set "PNPM=corepack pnpm"
  ) else (
    where npx >nul 2>nul
    if errorlevel 1 (
      echo pnpm, corepack, and npx were not found.
      echo Install Node.js LTS, then run Setup-AMERP.cmd again.
      if not defined NO_PAUSE pause
      exit /b 1
    )
    set "PNPM=npx --yes pnpm@10.33.2"
  )
)

echo Installing AMERP dependencies...
call %PNPM% install --frozen-lockfile
if errorlevel 1 (
  echo Dependency installation failed.
  if not defined NO_PAUSE pause
  exit /b 1
)

where python >nul 2>nul
if not errorlevel 1 (
  set "PYTHON=python"
) else (
  where py >nul 2>nul
  if not errorlevel 1 (
    set "PYTHON=py -3"
  )
)

if defined PYTHON (
  echo Installing optional Python dependency for the legacy material database importer...
  %PYTHON% -m pip install --upgrade pypdf
  if errorlevel 1 (
    echo Optional Python dependency installation failed. The app will still run, but the legacy material database importer may not work until pypdf is installed.
  )
) else (
  echo Python was not found. This is okay for normal AMERP use. Only the legacy material database importer depends on Python and pypdf.
)

echo Building AMERP...
call "%ROOT%Build-App.cmd"
if errorlevel 1 (
  echo Build failed.
  if not defined NO_PAUSE pause
  exit /b 1
)

if not exist "%ROOT%node_modules\electron\dist\electron.exe" (
  echo Electron runtime is still missing after dependency installation.
  if not defined NO_PAUSE pause
  exit /b 1
)

if not exist "%ROOT%dist\index.html" (
  echo Build output is still missing after the build step.
  if not defined NO_PAUSE pause
  exit /b 1
)

echo.
echo AMERP is ready. Run Start-App.cmd to launch the app.
if not defined NO_PAUSE pause
popd
