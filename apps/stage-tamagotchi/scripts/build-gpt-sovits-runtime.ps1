<#
.SYNOPSIS
    Build GPT-SoVITS Python 3.10+ embeddable runtime for Windows.

.DESCRIPTION
    Downloads Python 3.10 embeddable zip, enables pip, installs required packages.
    The resulting runtime/ directory is self-contained and gitignored.

.PARAMETER PythonVersion
    Python version to install. Default: 3.10.11

.PARAMETER RuntimeDir
    Output directory. Default: ../resources/gpt-sovits/runtime

.EXAMPLE
    .\build-gpt-sovits-runtime.ps1
    .\build-gpt-sovits-runtime.ps1 -PythonVersion 3.10.11
#>

param(
    [string]$PythonVersion = "3.10.11",
    [string]$RuntimeDir = ""
)

$ErrorActionPreference = "Stop"

if (-not $RuntimeDir) {
    $RuntimeDir = Join-Path $PSScriptRoot "..\resources\gpt-sovits\runtime"
}

$RuntimeDir = Resolve-Path $RuntimeDir
Write-Host "=== Building GPT-SoVITS runtime ===" -ForegroundColor Cyan
Write-Host "Python: $PythonVersion"
Write-Host "Target: $RuntimeDir"

# Clean existing runtime
if (Test-Path $RuntimeDir) {
    Write-Host "Cleaning existing runtime..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $RuntimeDir
}
New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null

# Download Python embeddable zip
$major, $minor, $patch = $PythonVersion.Split(".")
$zipName = "python-$PythonVersion-embed-amd64.zip"
$zipUrl = "https://www.python.org/ftp/python/$PythonVersion/$zipName"
$zipPath = Join-Path $env:TEMP $zipName

Write-Host "Downloading $zipName..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing

# Extract
Write-Host "Extracting..." -ForegroundColor Cyan
Expand-Archive -Path $zipPath -DestinationPath $RuntimeDir -Force
Remove-Item $zipPath -Force

# Enable pip: uncomment import site in python310._pth
$pthFile = Get-ChildItem -Path $RuntimeDir -Filter "python*._pth" | Select-Object -First 1
if ($pthFile) {
    Write-Host "Enabling pip in $($pthFile.Name)..." -ForegroundColor Cyan
    $content = Get-Content $pthFile.FullName -Raw
    $content = $content -replace "#import site", "import site"
    Set-Content -Path $pthFile.FullName -Value $content -NoNewline
}

# Get pip bootstrap script
$pipUrl = "https://bootstrap.pypa.io/get-pip.py"
$pipScript = Join-Path $env:TEMP "get-pip.py"
Write-Host "Downloading pip bootstrap..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $pipUrl -OutFile $pipScript -UseBasicParsing

# Find python.exe
$pythonExe = Get-ChildItem -Path $RuntimeDir -Filter "python.exe" | Select-Object -First 1
if (-not $pythonExe) {
    Write-Error "python.exe not found in $RuntimeDir"
    exit 1
}

# Install pip
Write-Host "Installing pip..." -ForegroundColor Cyan
& $pythonExe.FullName $pipScript
Remove-Item $pipScript -Force

# Install required packages
$packages = @(
    "torch>=2.0.0",
    "torchaudio>=2.0.0",
    "transformers>=4.30.0",
    "peft>=0.4.0",
    "librosa>=0.10.0",
    "soundfile>=0.12.0",
    "fastapi>=0.100.0",
    "uvicorn[standard]>=0.20.0",
    "huggingface_hub>=0.14.0",
    "pytorch-lightning>=1.9.0",
    "kaldi-native-fbank>=1.0.0",
    "pyyaml>=6.0",
    "numpy>=1.24.0",
    "scipy>=1.10.0",
    "cn2an>=0.5.0",
    "jieba_fast>=0.53",
    "pypinyin>=0.49.0",
    "jieba>=0.42.0",
    "gruut>=2.0.0",
    "gruut-ipa>=0.3.0",
    "jamo>=0.4.1",
    "g2p-pypinyin>=0.1.0",
    "pydantic>=2.0.0",
    "requests>=2.28.0",
    "tqdm>=4.65.0",
)

Write-Host "Installing packages (this may take a while)..." -ForegroundColor Cyan
foreach ($pkg in $packages) {
    Write-Host "  Installing $pkg..." -ForegroundColor Gray
    & $pythonExe.FullName -m pip install $pkg --quiet --no-warn-script-location
}

# Verify
Write-Host "=== Verifying runtime ===" -ForegroundColor Cyan
& $pythonExe.FullName --version
& $pythonExe.FullName -c "import torch, transformers, peft, fastapi, uvicorn, librosa, soundfile, huggingface_hub; print('All packages OK')"

# Clean up pip cache to reduce size
Write-Host "Cleaning pip cache..." -ForegroundColor Cyan
& $pythonExe.FullName -m pip cache purge 2>$null

Write-Host "=== Runtime built successfully ===" -ForegroundColor Green
Write-Host "Location: $RuntimeDir"
Write-Host "Size: $([math]::Round((Get-ChildItem -Path $RuntimeDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB, 1)) MB"
