param(
  [string]$InstallDir = (Join-Path $env:USERPROFILE "AMERP"),
  [string]$DataDir = (Join-Path ([Environment]::GetFolderPath("MyDocuments")) "AMERP-Data"),
  [string]$RepoZipUrl = "https://github.com/AudacityMicro/AMERP/archive/refs/heads/main.zip",
  [string]$RepoZipPath = "",
  [switch]$NoLaunch,
  [switch]$NoShortcut,
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
  foreach ($candidate in @(
    @{ Command = "python"; Arguments = @("-c", "import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)") },
    @{ Command = "py"; Arguments = @("-3", "-c", "import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)") }
  )) {
    if (-not (Test-Command $candidate.Command)) {
      continue
    }
    try {
      & $candidate.Command @($candidate.Arguments) *> $null
      if ($LASTEXITCODE -eq 0) {
        return $true
      }
    } catch {
    }
  }
  return $false
}

function Resolve-PythonCommand {
  foreach ($candidate in @(
    @{ Command = "python"; PrefixArgs = @(); VersionArgs = @("--version") },
    @{ Command = "py"; PrefixArgs = @("-3"); VersionArgs = @("-3", "--version") }
  )) {
    if (-not (Test-Command $candidate.Command)) {
      continue
    }
    try {
      & $candidate.Command @($candidate.VersionArgs) *> $null
      if ($LASTEXITCODE -eq 0) {
        return $candidate
      }
    } catch {
    }
  }
  return $null
}

function Ensure-OptionalPython {
  if (Test-PythonReady) {
    $pythonCommand = Resolve-PythonCommand
    if ($pythonCommand) {
      Write-Host "Optional Python found: $(& $pythonCommand.Command @($pythonCommand.VersionArgs))"
    }
    return
  }

  if (Test-Command "winget") {
    Write-Step "Optional Python was not found. Trying to install Python 3 with winget for the legacy material database importer"
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
      $pythonCommand = Resolve-PythonCommand
      if ($pythonCommand) {
        Write-Host "Optional Python installed: $(& $pythonCommand.Command @($pythonCommand.VersionArgs))"
      }
      return
    }
  }

  Write-Host "Python 3.9+ is optional. The app will install and run without it, but the legacy Materials-Database SQLite importer will stay unavailable until Python is installed." -ForegroundColor Yellow
}

function Ensure-OptionalPythonDependencies {
  if (-not (Test-PythonReady)) {
    return
  }

  $pythonCommand = Resolve-PythonCommand
  if (-not $pythonCommand) {
    return
  }

  Write-Step "Installing optional Python dependency for the legacy material database importer"
  try {
    & $pythonCommand.Command @($pythonCommand.PrefixArgs + @("-m", "ensurepip", "--upgrade")) *> $null
    if ($LASTEXITCODE -ne 0) {
      throw "Python ensurepip failed."
    }
    & $pythonCommand.Command @($pythonCommand.PrefixArgs + @("-m", "pip", "install", "--upgrade", "pip", "pypdf")) *> $null
    if ($LASTEXITCODE -ne 0) {
      throw "Unable to install Python dependency pypdf."
    }
  } catch {
    Write-Host "Skipping optional Python dependency installation: $($_.Exception.Message)" -ForegroundColor Yellow
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
  $electronPath = Join-Path $TargetRoot "node_modules\electron\dist\electron.exe"
  if (-not (Test-Path $electronPath)) {
    throw "Electron runtime was not found after setup: $electronPath"
  }
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $electronPath
  $shortcut.Arguments = "."
  $shortcut.WorkingDirectory = $TargetRoot
  $shortcut.Description = "Start AMERP"
  $shortcut.IconLocation = $electronPath
  $shortcut.Save()
  Write-Host "Desktop shortcut created: $shortcutPath"
}

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

  $InstallDir = [IO.Path]::GetFullPath($InstallDir)
  $DataDir = [IO.Path]::GetFullPath($DataDir)

  Write-Host "AMERP installer"
  Write-Host "Public beta install path: GitHub ZIP -> local build -> desktop shortcut"
  if ($RepoZipPath) {
    Write-Host "Source ZIP: $([IO.Path]::GetFullPath($RepoZipPath))"
  } else {
    Write-Host "Repository: $RepoZipUrl"
  }
  Write-Host "Install folder: $InstallDir"
  Write-Host "Suggested data folder: $DataDir"
  Write-Host "This installer will verify or install Node.js LTS, install AMERP dependencies, build the app, and create a desktop shortcut."
  Write-Host "It is safe to rerun this installer to refresh the application files; your ERP data folder is separate."
  Write-Host "Python is optional and is only used by the legacy Materials-Database SQLite importer."

  if ($DryRun) {
    Write-Host ""
    Write-Host "Dry run only. No files were downloaded, installed, or launched."
    exit 0
  }

  Ensure-Node
  Ensure-OptionalPython
  Ensure-OptionalPythonDependencies

  $tempRoot = Join-Path $env:TEMP ("amerp-install-" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
  $zipPath = Join-Path $tempRoot "amerp.zip"
  $extractRoot = Join-Path $tempRoot "extract"

  if ($RepoZipPath) {
    $resolvedRepoZipPath = [IO.Path]::GetFullPath($RepoZipPath)
    if (-not (Test-Path $resolvedRepoZipPath)) {
      throw "The local source ZIP was not found: $resolvedRepoZipPath"
    }
    Write-Step "Copying AMERP source ZIP"
    Copy-Item -LiteralPath $resolvedRepoZipPath -Destination $zipPath -Force
  } else {
    Write-Step "Downloading AMERP from GitHub"
    Invoke-WebRequest -Uri $RepoZipUrl -OutFile $zipPath
  }

  Write-Step "Extracting AMERP"
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractRoot -Force
  $sourceRoot = $null
  if (Test-Path (Join-Path $extractRoot "package.json")) {
    $sourceRoot = Get-Item -LiteralPath $extractRoot
  } else {
    $sourceRoot = Get-ChildItem -LiteralPath $extractRoot -Directory | Where-Object {
    Test-Path (Join-Path $_.FullName "package.json")
    } | Select-Object -First 1
  }
  if (-not $sourceRoot) {
    throw "The downloaded GitHub archive did not contain package.json."
  }

  Write-Step "Installing files"
  Copy-SourceToInstallDir -SourceRoot $sourceRoot.FullName -TargetRoot $InstallDir
  New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

  Write-Step "Installing dependencies and building AMERP"
  Write-Host "Running Setup-AMERP.cmd in: $InstallDir"
  $setupPath = Join-Path $InstallDir "Setup-AMERP.cmd"
  if (-not (Test-Path $setupPath)) {
    throw "Setup-AMERP.cmd was not found in $InstallDir."
  }
  $setupArgs = "/c `"$setupPath`" --no-pause"
  $setup = Start-Process -FilePath $env:ComSpec -ArgumentList $setupArgs -WorkingDirectory $InstallDir -Wait -PassThru
  if ($setup.ExitCode -ne 0) {
    throw "Setup-AMERP.cmd failed with exit code $($setup.ExitCode)."
  }
  if (-not (Test-Path (Join-Path $InstallDir "node_modules\electron\dist\electron.exe"))) {
    throw "Setup finished without installing the Electron runtime."
  }
  if (-not (Test-Path (Join-Path $InstallDir "dist\index.html"))) {
    throw "Setup finished without creating the built app files."
  }

  if (-not $NoShortcut) {
    Write-Step "Creating desktop shortcut"
    Create-DesktopShortcut -TargetRoot $InstallDir
  } else {
    Write-Host "Desktop shortcut creation skipped."
  }

  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue

  Write-Host ""
  Write-Host "AMERP is installed."
  Write-Host "On first launch, choose or create this data folder: $DataDir"
  Write-Host "You can start AMERP from the desktop shortcut or from: $(Join-Path $InstallDir "Start-App.cmd")"
  Write-Host "To update later, download the latest GitHub ZIP and run Install-AMERP.cmd again."

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
