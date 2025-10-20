@echo off
REM start_all.bat - launches backend (uvicorn) and frontend (python simple HTTP server) in new windows
SETLOCAL
SET SCRIPT_DIR=%~dp0
echo Starting Cosmic-Web Explorer from %SCRIPT_DIR%

echo Launching backend (uvicorn on port 5000)...
start "CosmicWeb Backend" cmd /k "cd /d "%SCRIPT_DIR%backend" && echo Running in %%CD%% && python -m uvicorn app:app --host 0.0.0.0 --port 5000"

timeout /t 1 >nul

echo Launching frontend (static server on port 8000)...
start "CosmicWeb Frontend" cmd /k "cd /d "%SCRIPT_DIR%" && echo Serving %%CD%% && python -m http.server 8000"

echo All windows launched. Open http://localhost:8000/viewer/index.html
ENDLOCAL
pause
