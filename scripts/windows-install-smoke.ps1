param(
  [ValidateSet("Source", "Packaged")]
  [string]$Mode = "Source",
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$RepoZipUrl = "",
  [string]$InstallerPath = "",
  [string]$PackagedExePath = "",
  [int]$AutoExitMs = 4000,
  [int]$LaunchTimeoutSec = 60
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function New-TempDir {
  param([string]$Prefix)
  $path = Join-Path $env:TEMP ("$Prefix-" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $path | Out-Null
  return $path
}

function Assert-PathExists {
  param(
    [string]$Path,
    [string]$Label
  )
  if (-not (Test-Path $Path)) {
    throw "$Label was not found: $Path"
  }
}

function New-SourceZip {
  param(
    [string]$RepositoryRoot,
    [string]$DestinationPath
  )
  $git = Get-Command git -ErrorAction SilentlyContinue
  if (-not $git) {
    throw "git is required to build a source ZIP for smoke tests."
  }
  $stagingRoot = New-TempDir -Prefix "amerp-source-zip"
  $files = & $git.Source -C $RepositoryRoot ls-files --cached --others --exclude-standard
  if ($LASTEXITCODE -ne 0) {
    throw "git ls-files failed with exit code $LASTEXITCODE."
  }
  foreach ($relativePath in $files) {
    $source = Join-Path $RepositoryRoot $relativePath
    if (-not (Test-Path $source -PathType Leaf)) {
      continue
    }
    $destination = Join-Path $stagingRoot $relativePath
    New-Item -ItemType Directory -Force -Path (Split-Path -Path $destination -Parent) | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
  }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  if (Test-Path $DestinationPath) {
    Remove-Item -LiteralPath $DestinationPath -Force
  }
  [System.IO.Compression.ZipFile]::CreateFromDirectory($stagingRoot, $DestinationPath)
  Assert-PathExists -Path $DestinationPath -Label "Source ZIP"
  return $DestinationPath
}

function Start-SmokeApp {
  param(
    [string]$ExecutablePath,
    [string]$Arguments,
    [string]$WorkingDirectory,
    [string]$DataDir,
    [string]$UserDataDir,
    [int]$TimeoutSec,
    [int]$ExitAfterMs
  )

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $ExecutablePath
  $psi.Arguments = $Arguments
  $psi.WorkingDirectory = $WorkingDirectory
  $psi.UseShellExecute = $false
  $psi.EnvironmentVariables["AMERP_DATA_FOLDER"] = $DataDir
  $psi.EnvironmentVariables["AMERP_USER_DATA_FOLDER"] = $UserDataDir
  $psi.EnvironmentVariables["AMERP_SMOKE_TEST_EXIT_AFTER_MS"] = [string]$ExitAfterMs

  $process = [System.Diagnostics.Process]::Start($psi)
  if (-not $process) {
    throw "Failed to start AMERP smoke process."
  }
  if (-not $process.WaitForExit($TimeoutSec * 1000)) {
    try {
      $process.Kill()
      $process.WaitForExit(5000) | Out-Null
    } catch {
    }
    throw "AMERP smoke process did not exit within $TimeoutSec seconds."
  }
  if ($process.ExitCode -ne 0) {
    throw "AMERP smoke process exited with code $($process.ExitCode)."
  }
}

function Assert-InitializedDataFolder {
  param([string]$DataDir)
  foreach ($relative in @(
    "config",
    "jobs",
    "employees",
    "time-clock",
    "kanban",
    "materials",
    "nonconformances",
    "audit",
    "cache",
    "locks"
  )) {
    Assert-PathExists -Path (Join-Path $DataDir $relative) -Label "Initialized data folder path '$relative'"
  }
  Assert-PathExists -Path (Join-Path $DataDir "config\preferences.json") -Label "Preferences file"
  Assert-PathExists -Path (Join-Path $DataDir "config\ai-settings.json") -Label "AI settings file"
}

function Find-PackagedExe {
  param([string]$PreferredPath)
  if ($PreferredPath) {
    $resolved = [IO.Path]::GetFullPath($PreferredPath)
    if (Test-Path $resolved) {
      return $resolved
    }
  }

  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\AMERP\AMERP.exe"),
    (Join-Path $env:ProgramFiles "AMERP\AMERP.exe")
  )
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }

  $match = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA "Programs") -Recurse -Filter "AMERP.exe" -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($match) {
    return $match.FullName
  }
  return $null
}

function Invoke-SourceSmokeTest {
  param(
    [string]$RepositoryRoot,
    [string]$ZipUrl,
    [int]$ExitAfterMs,
    [int]$TimeoutSec
  )

  $tempRoot = New-TempDir -Prefix "amerp-source-smoke"
  $zipPath = Join-Path $tempRoot "amerp-source.zip"
  $installDir = Join-Path $tempRoot "install"
  $dataDir = Join-Path $tempRoot "data"
  $userDataDir = Join-Path $tempRoot "user-data"
  $installerScript = Join-Path $RepositoryRoot "Install-AMERP.ps1"

  Assert-PathExists -Path $installerScript -Label "Installer script"
  New-SourceZip -RepositoryRoot $RepositoryRoot -DestinationPath $zipPath | Out-Null

  $args = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $installerScript,
    "-InstallDir", $installDir,
    "-DataDir", $dataDir,
    "-RepoZipPath", $zipPath,
    "-NoLaunch",
    "-NoShortcut"
  )
  if ($ZipUrl) {
    $args += @("-RepoZipUrl", $ZipUrl)
  }

  Write-Step "Running source installer smoke test"
  & powershell @args
  if ($LASTEXITCODE -ne 0) {
    throw "Install-AMERP.ps1 failed with exit code $LASTEXITCODE."
  }

  $electronPath = Join-Path $installDir "node_modules\electron\dist\electron.exe"
  $startScript = Join-Path $installDir "Start-App.cmd"
  $distPath = Join-Path $installDir "dist\index.html"
  Assert-PathExists -Path $startScript -Label "Installed Start-App.cmd"
  Assert-PathExists -Path $electronPath -Label "Installed Electron runtime"
  Assert-PathExists -Path $distPath -Label "Installed dist index"

  Write-Step "Launching source install"
  Start-SmokeApp -ExecutablePath $electronPath -Arguments "." -WorkingDirectory $installDir -DataDir $dataDir -UserDataDir $userDataDir -TimeoutSec $TimeoutSec -ExitAfterMs $ExitAfterMs
  Assert-InitializedDataFolder -DataDir $dataDir
}

function Invoke-PackagedSmokeTest {
  param(
    [string]$Installer,
    [string]$Executable,
    [int]$ExitAfterMs,
    [int]$TimeoutSec
  )

  if (-not $Installer) {
    throw "InstallerPath is required for packaged smoke tests."
  }
  $resolvedInstaller = [IO.Path]::GetFullPath($Installer)
  Assert-PathExists -Path $resolvedInstaller -Label "Packaged installer"

  $tempRoot = New-TempDir -Prefix "amerp-packaged-smoke"
  $dataDir = Join-Path $tempRoot "data"
  $userDataDir = Join-Path $tempRoot "user-data"

  Write-Step "Running packaged installer smoke test"
  $install = Start-Process -FilePath $resolvedInstaller -ArgumentList "/S" -Wait -PassThru
  if ($install.ExitCode -ne 0) {
    throw "Packaged installer failed with exit code $($install.ExitCode)."
  }

  $resolvedExe = Find-PackagedExe -PreferredPath $Executable
  if (-not $resolvedExe) {
    throw "Unable to find the installed AMERP executable after running the packaged installer."
  }

  Write-Step "Launching packaged install"
  Start-SmokeApp -ExecutablePath $resolvedExe -Arguments "" -WorkingDirectory (Split-Path -Path $resolvedExe -Parent) -DataDir $dataDir -UserDataDir $userDataDir -TimeoutSec $TimeoutSec -ExitAfterMs $ExitAfterMs
  Assert-InitializedDataFolder -DataDir $dataDir
}

Push-Location $ProjectRoot
try {
  if ($Mode -eq "Source") {
    Invoke-SourceSmokeTest -RepositoryRoot $ProjectRoot -ZipUrl $RepoZipUrl -ExitAfterMs $AutoExitMs -TimeoutSec $LaunchTimeoutSec
  } else {
    Invoke-PackagedSmokeTest -Installer $InstallerPath -Executable $PackagedExePath -ExitAfterMs $AutoExitMs -TimeoutSec $LaunchTimeoutSec
  }

  Write-Host ""
  Write-Host "$Mode Windows install smoke test passed." -ForegroundColor Green
} finally {
  Pop-Location
}
