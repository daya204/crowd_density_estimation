# ============================================================
# CrowdSense — FastAPI inference server startup script
# ============================================================
# Usage:  .\start-backend.ps1
# Runs the PET model server on http://localhost:8000
# ============================================================

$ErrorActionPreference = "Stop"

$venvPython = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
$venvUvicorn = Join-Path $PSScriptRoot ".venv\Scripts\uvicorn.exe"

# Verify the venv exists
if (-not (Test-Path $venvPython)) {
    Write-Error "Virtual environment not found. Run: python -m venv .venv && .venv\Scripts\pip install -r requirements-backend.txt"
    exit 1
}

Write-Host ""
Write-Host "  CrowdSense Backend" -ForegroundColor Cyan
Write-Host "  ==================" -ForegroundColor Cyan
Write-Host "  FastAPI + PET inference server" -ForegroundColor Gray
Write-Host ""
Write-Host "  URL    : http://localhost:8000" -ForegroundColor Green
Write-Host "  Health : http://localhost:8000/health" -ForegroundColor Green
Write-Host "  Docs   : http://localhost:8000/docs" -ForegroundColor Green
Write-Host "  Mode   : auto-detects live / demo based on checkpoint presence" -ForegroundColor Gray
Write-Host ""

# Check for checkpoint and inform user
$checkpoint = Join-Path $PSScriptRoot "outputs\SHB\pet_model\best_checkpoint.pth"
if (Test-Path $checkpoint) {
    Write-Host "  Checkpoint : FOUND — will run in LIVE mode" -ForegroundColor Green
} else {
    Write-Host "  Checkpoint : NOT FOUND — will run in DEMO mode" -ForegroundColor Yellow
    Write-Host "  Place best_checkpoint.pth at: outputs\SHB\pet_model\" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Press Ctrl+C to stop." -ForegroundColor Gray
Write-Host ""

# Start uvicorn with hot-reload
& $venvUvicorn api.server:app --reload --port 8000 --host 127.0.0.1
