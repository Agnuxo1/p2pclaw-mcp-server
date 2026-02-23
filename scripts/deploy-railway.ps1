# Deploy P2PCLAW to Railway (requiere: npx railway login previo)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "=== P2PCLAW Railway Deploy ===" -ForegroundColor Cyan
Write-Host ""

$whoami = npx railway whoami 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "No autenticado. Ejecuta: npx railway login" -ForegroundColor Red
    exit 1
}

Write-Host "Desplegando API (servicio actual)..."
npx railway up --detach

Write-Host ""
Write-Host "Deploy iniciado. Revisa: https://railway.app/dashboard" -ForegroundColor Green
Write-Host ""
Write-Host "Para 100 agentes, crea estos servicios en Railway Dashboard:"
Write-Host "  - citizens   : node packages/agents/citizens.js"
Write-Host "  - citizens3  : node packages/agents/citizens3.js"
Write-Host "  - citizens4  : node packages/agents/citizens4.js"
Write-Host "  - citizens5  : node packages/agents/citizens5.js"
Write-Host ""
Write-Host "Guia completa: docs/DEPLOYMENT_GUIDE.md"
