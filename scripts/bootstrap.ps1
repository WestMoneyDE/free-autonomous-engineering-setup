param(
    [switch]$Apply
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $Name"
    }
}

Require-Command git
Require-Command node
Require-Command npm
Require-Command npx

$nodeVersion = (& node --version).Trim()
$nodeMajor = [int](($nodeVersion -replace '^v','').Split('.')[0])
if ($nodeMajor -lt 20) {
    throw "Node.js 20+ is recommended by this starter; found $nodeVersion"
}

Write-Host "[OK] git  $(& git --version)"
Write-Host "[OK] node $nodeVersion"
Write-Host "[OK] npm  $(& npm --version)"
Write-Host ""
Write-Host "Planned integration:"
Write-Host "  OmniRoute endpoint: http://localhost:20128/v1"
Write-Host "  DeepSeek Harness UI: http://127.0.0.1:3080"
Write-Host "  DSH provider template: config/dsh-omniroute.settings.example.yaml"

if ($Apply) {
    Write-Host ""
    Write-Host "[APPLY] Installing OmniRoute globally through npm..."
    & npm install -g omniroute
    if ($LASTEXITCODE -ne 0) { throw "OmniRoute npm installation failed." }
    & omniroute --version
    if ($LASTEXITCODE -ne 0) { throw "OmniRoute version check failed." }
} else {
    Write-Host ""
    Write-Host "Dry run only. No package was installed and no settings were modified."
    Write-Host "Run with -Apply to install OmniRoute globally, or use 'npx omniroute' without installation."
}

Write-Host ""
Write-Host "Next terminals:"
Write-Host "  1) npx omniroute"
Write-Host "  2) npx @deepseek-ai/dsh web"
Write-Host ""
Write-Host "Then add OmniRoute in DSH Settings -> Models as documented in docs/INSTALLATION.md."
