$ErrorActionPreference = "Stop"

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Command
  )
  Write-Host ""
  Write-Host "==> $Name" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE."
  }
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
  $npm = Get-Command npm -ErrorAction SilentlyContinue
}
if (-not $npm) {
  throw "npm was not found. Install Node.js LTS before running release checks."
}

Push-Location $root
try {
  Invoke-Step "Node syntax checks" { & $npm.Source run check:syntax --silent }
  Invoke-Step "Python compile checks" { & $npm.Source run check:python --silent }
  Invoke-Step "Unit tests" { & $npm.Source test --silent }
  Invoke-Step "Dependency audit" { & $npm.Source run audit:deps --silent }
  Invoke-Step "Secret scan" { & $npm.Source run secret:scan --silent }
  Invoke-Step "Production build" { & $npm.Source run build --silent }

  $trivy = Get-Command trivy -ErrorAction SilentlyContinue
  if (-not $trivy) {
    throw "Trivy is required for public beta release checks. Install Trivy and rerun npm run release:check."
  }

  Invoke-Step "Trivy filesystem scan" {
    & $trivy.Source fs `
      --exit-code 1 `
      --severity UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL `
      --ignore-unfixed `
      --skip-dirs node_modules `
      --skip-dirs dist `
      --skip-dirs .git `
      --skip-dirs .tools `
      --skip-dirs .smoke-data-release `
      --skip-dirs .smoke-data-user `
      .
  }

  Write-Host ""
  Write-Host "Release checks passed." -ForegroundColor Green
} finally {
  Pop-Location
}
