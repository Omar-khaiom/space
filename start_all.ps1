# Space Catalog API - Startup Script
# Run this to start both backend and frontend servers

Write-Host "`n" -NoNewline
Write-Host "================================" -ForegroundColor Cyan
Write-Host "   🌌 Space Catalog System   " -ForegroundColor Yellow
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check Python
Write-Host "Checking Python..." -NoNewline
try {
    $pythonVersion = python --version 2>&1
    Write-Host " ✓ $pythonVersion" -ForegroundColor Green
}
catch {
    Write-Host " ✗ Python not found!" -ForegroundColor Red
    exit 1
}

# Start Backend
Write-Host "`nStarting Backend API (port 5000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd d:\space\backend; `$env:PYTHONPATH='d:\space\backend'; python -m uvicorn app:app --host 0.0.0.0 --port 5000 --reload"

Start-Sleep -Seconds 3

# Check if backend is running
Write-Host "Checking backend health..." -NoNewline
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5000/api/health" -TimeoutSec 5 -ErrorAction Stop
    Write-Host " ✓ Backend ready!" -ForegroundColor Green
}
catch {
    Write-Host " ⚠ Backend starting..." -ForegroundColor Yellow
}

# Start Frontend
Write-Host "`nStarting Frontend Server (port 8000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd d:\space; python -m http.server 8000"

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "================================" -ForegroundColor Green
Write-Host "   ✓ System Running!   " -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""
Write-Host "📡 Backend API:  " -NoNewline
Write-Host "http://localhost:5000" -ForegroundColor Cyan
Write-Host "📚 API Docs:     " -NoNewline
Write-Host "http://localhost:5000/docs" -ForegroundColor Cyan
Write-Host "🌌 Viewer:       " -NoNewline
Write-Host "http://localhost:8000/viewer/" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C in any terminal window to stop servers." -ForegroundColor Yellow
Write-Host ""
