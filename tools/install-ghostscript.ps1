$ErrorActionPreference = 'Stop'

$version = '10.06.0'
$shortTag = '10060'
$repoRoot = Split-Path -Parent $PSScriptRoot
$targetRoot = Join-Path $repoRoot 'tools\ghostscript'
$targetDir = Join-Path $targetRoot "gs$version"
$binPath = Join-Path $targetDir 'bin\gswin64c.exe'

if (Test-Path $binPath) {
  Write-Host "Ghostscript already installed: $binPath"
  exit 0
}

$sevenZip = @(
  "${env:ProgramFiles}\7-Zip\7z.exe",
  "${env:ProgramFiles(x86)}\7-Zip\7z.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $sevenZip) {
  Write-Error '7-Zip not found. Install from https://www.7-zip.org/ or install Ghostscript manually.'
}

$installerName = "gs${shortTag}w64.exe"
$downloadUrl = "https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/gs$shortTag/$installerName"
$cacheDir = Join-Path $repoRoot '.cache'
$installerPath = Join-Path $cacheDir $installerName

New-Item -ItemType Directory -Force -Path $cacheDir, $targetRoot | Out-Null

if (-not (Test-Path $installerPath)) {
  Write-Host "Downloading Ghostscript $version..."
  Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath -UseBasicParsing
}

Write-Host "Extracting to $targetDir ..."
if (Test-Path $targetDir) {
  Remove-Item -Recurse -Force $targetDir
}
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

& $sevenZip x -y -o"$targetDir" "$installerPath" | Out-Null

if (-not (Test-Path $binPath)) {
  Write-Error "gswin64c.exe not found after extract: $binPath"
}

Write-Host ''
Write-Host "Done: $binPath"
Write-Host 'Restart worker. Optional apps/worker/.env:'
Write-Host ('GHOSTSCRIPT_BIN=' + $binPath)
