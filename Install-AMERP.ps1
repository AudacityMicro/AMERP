param(
  [string]$InstallDir = (Join-Path $env:USERPROFILE "AMERP"),
  [string]$DataDir = (Join-Path ([Environment]::GetFolderPath("MyDocuments")) "AMERP-Data"),
  [string]$RepoZipUrl = "https://github.com/AudacityMicro/AMERP/archive/refs/heads/main.zip",
  [switch]$NoLaunch,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-Command {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Refresh-Path {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machinePath;$userPath"
}

function Ensure-Node {
  if ((Test-Command "node") -and (Test-Command "npm")) {
    Write-Host "Node.js found: $(node --version)"
    return
  }

  if (Test-Command "winget") {
    Write-Step "Node.js was not found. Trying to install Node.js LTS with winget"
    $wingetArgs = @(
      "install",
      "--id", "OpenJS.NodeJS.LTS",
      "--exact",
      "--accept-package-agreements",
      "--accept-source-agreements",
      "--silent"
    )
    $process = Start-Process -FilePath "winget" -ArgumentList $wingetArgs -Wait -PassThru
    Refresh-Path
    if ($process.ExitCode -eq 0 -and (Test-Command "node") -and (Test-Command "npm")) {
      Write-Host "Node.js installed: $(node --version)"
      return
    }
  }

  throw "Node.js LTS is required. Install it from https://nodejs.org, then run Install-AMERP.cmd again."
}

function Test-PythonReady {
  if (-not (Test-Command "python")) {
    return $false
  }
  try {
    & python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)" *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Ensure-Python {
  if (Test-PythonReady) {
    Write-Host "Python found: $(python --version)"
    return
  }

  if (Test-Command "winget") {
    Write-Step "Python was not found. Trying to install Python 3 with winget"
    $wingetArgs = @(
      "install",
      "--id", "Python.Python.3.12",
      "--exact",
      "--accept-package-agreements",
      "--accept-source-agreements",
      "--silent"
    )
    $process = Start-Process -FilePath "winget" -ArgumentList $wingetArgs -Wait -PassThru
    Refresh-Path
    if ($process.ExitCode -eq 0 -and (Test-PythonReady)) {
      Write-Host "Python installed: $(python --version)"
      return
    }
  }

  throw "Python 3.9 or newer is required for PDF import parsers. Install Python from https://www.python.org/downloads/, check Add python.exe to PATH, then run Install-AMERP.cmd again."
}

function Ensure-PythonDependencies {
  Write-Step "Installing Python PDF parser dependency"
  & python -m ensurepip --upgrade
  if ($LASTEXITCODE -ne 0) {
    throw "Python ensurepip failed."
  }
  & python -m pip install --upgrade pip pypdf
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to install Python dependency pypdf."
  }
}

function Copy-SourceToInstallDir {
  param(
    [string]$SourceRoot,
    [string]$TargetRoot
  )

  New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null
  $excluded = @(".git", "node_modules", "dist", ".smoke-data", ".smoke-data-old")
  Get-ChildItem -LiteralPath $SourceRoot -Force | Where-Object {
    $excluded -notcontains $_.Name
  } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $TargetRoot -Recurse -Force
  }
}

function Create-DesktopShortcut {
  param([string]$TargetRoot)

  $desktop = [Environment]::GetFolderPath("Desktop")
  $shortcutPath = Join-Path $desktop "AMERP.lnk"
  $targetPath = Join-Path $TargetRoot "Start-App.cmd"
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $targetPath
  $shortcut.WorkingDirectory = $TargetRoot
  $shortcut.Description = "Start AMERP"
  $shortcut.Save()
  Write-Host "Desktop shortcut created: $shortcutPath"
}

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

  $InstallDir = [IO.Path]::GetFullPath($InstallDir)
  $DataDir = [IO.Path]::GetFullPath($DataDir)

  Write-Host "AMERP installer"
  Write-Host "Repository: $RepoZipUrl"
  Write-Host "Install folder: $InstallDir"
  Write-Host "Suggested data folder: $DataDir"

  if ($DryRun) {
    Write-Host ""
    Write-Host "Dry run only. No files were downloaded, installed, or launched."
    exit 0
  }

  Ensure-Node
  Ensure-Python
  Ensure-PythonDependencies

  $tempRoot = Join-Path $env:TEMP ("amerp-install-" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
  $zipPath = Join-Path $tempRoot "amerp.zip"
  $extractRoot = Join-Path $tempRoot "extract"

  Write-Step "Downloading AMERP from GitHub"
  Invoke-WebRequest -Uri $RepoZipUrl -OutFile $zipPath

  Write-Step "Extracting AMERP"
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractRoot -Force
  $sourceRoot = Get-ChildItem -LiteralPath $extractRoot -Directory | Where-Object {
    Test-Path (Join-Path $_.FullName "package.json")
  } | Select-Object -First 1
  if (-not $sourceRoot) {
    throw "The downloaded GitHub archive did not contain package.json."
  }

  Write-Step "Installing files"
  Copy-SourceToInstallDir -SourceRoot $sourceRoot.FullName -TargetRoot $InstallDir
  New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

  Write-Step "Installing dependencies and building AMERP"
  $setupPath = Join-Path $InstallDir "Setup-AMERP.cmd"
  if (-not (Test-Path $setupPath)) {
    throw "Setup-AMERP.cmd was not found in $InstallDir."
  }
  $setupArgs = "/c `"$setupPath`" --no-pause"
  $setup = Start-Process -FilePath $env:ComSpec -ArgumentList $setupArgs -WorkingDirectory $InstallDir -Wait -PassThru
  if ($setup.ExitCode -ne 0) {
    throw "Setup-AMERP.cmd failed with exit code $($setup.ExitCode)."
  }

  Write-Step "Creating desktop shortcut"
  Create-DesktopShortcut -TargetRoot $InstallDir

  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue

  Write-Host ""
  Write-Host "AMERP is installed."
  Write-Host "On first launch, choose or create this data folder: $DataDir"
  Write-Host "You can start AMERP from the desktop shortcut or from: $(Join-Path $InstallDir "Start-App.cmd")"

  if (-not $NoLaunch) {
    Write-Step "Starting AMERP"
    Start-Process -FilePath (Join-Path $InstallDir "Start-App.cmd") -WorkingDirectory $InstallDir
  }
} catch {
  Write-Host ""
  Write-Host "AMERP installation failed:" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
