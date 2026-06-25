$ErrorActionPreference = "Stop"

$Repo = "YOUR_ORG/openclaw-installer"
$BinaryPrefix = "openclaw-install"
$Platform = "win32-x64"
$BinaryName = "${BinaryPrefix}-${Platform}.exe"
$DownloadUrl = "https://github.com/${Repo}/releases/latest/download/${BinaryName}"

$TmpDir = Join-Path $env:TEMP "openclaw-installer"
New-Item -ItemType Directory -Force -Path $TmpDir | Out-Null

$DestPath = Join-Path $TmpDir $BinaryName

Write-Host "Downloading ${BinaryName}..."
Invoke-WebRequest -Uri $DownloadUrl -OutFile $DestPath -UseBasicParsing

Write-Host "Running installer..."
& $DestPath @args
