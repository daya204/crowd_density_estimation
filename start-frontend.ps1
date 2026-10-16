# ============================================================
# CrowdSense — Next.js dashboard startup script
# ============================================================
# Usage:  .\start-frontend.ps1
# Runs the Next.js dev server on http://localhost:3000
# ============================================================

$ErrorActionPreference = "Stop"

# Prefer pnpm, fall back to npm
$pkgManager = "pnpm"
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    $pkgManager = "npm"
}

Write-Host ""
Write-Host "  CrowdSense Frontend" -ForegroundColor Cyan
Write-Host "  ===================" -ForegroundColor Cyan
Write-Host "  Next.js dashboard" -ForegroundColor Gray
Write-Host ""
Write-Host "  URL         : http://localhost:3000" -ForegroundColor Green
Write-Host "  Package mgr : $pkgManager" -ForegroundColor Gray
Write-Host ""
Write-Host "  Tip: start the backend first (.\start-backend.ps1) for live inference." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Press Ctrl+C to stop." -ForegroundColor Gray
Write-Host ""

Set-Location $PSScriptRoot
& $pkgManager run dev
