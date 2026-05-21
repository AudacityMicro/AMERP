$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
  throw "Python was not found on PATH."
}

$files = Get-ChildItem -LiteralPath (Join-Path $root "scripts") -Filter "*.py" -File | Sort-Object FullName
if (-not $files) {
  throw "No Python scripts found to check."
}

foreach ($file in $files) {
  & $python.Source -m py_compile $file.FullName
  if ($LASTEXITCODE -ne 0) {
    throw "Python compile failed for $($file.FullName)."
  }
}

Write-Host "Python compile check passed for $($files.Count) files."
