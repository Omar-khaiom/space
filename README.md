# Cosmic-Web Explorer (Live Gaia DR3)

Explore the Milky Way with real, live data from ESA Gaia DR3. This repo contains:

- Backend: FastAPI service that queries Gaia DR3 (TAP+) and returns stars for a sky region
- Frontend: Three.js viewer with planetarium mode, constellation overlays, and live star streaming

## Features

- **Live Gaia DR3 Data**: Real star positions, magnitudes, and colors from ESA's Gaia mission
- **Planetarium Mode**: View stars on a celestial sphere with recognizable patterns
- **Constellation Overlays**: Toggle 10 major constellations (Orion, Ursa Major, Cassiopeia, etc.) with lines
- **Bright Star Labels**: Named stars (Sirius, Betelgeuse, Vega, Polaris, etc.)
- **Magnitude-Based Rendering**: Bright stars appear larger and more prominent
- **Smart Caching**: First queries take 1-3s; cached repeats are 5-20ms

This is a trimmed, production-friendly setup with minimal dependencies and a simple start flow.

## Requirements

- Windows with PowerShell
- Python 3.10+ (3.12 OK)

## Quick Start (recommended)

Run the helper script that starts both servers (backend on 5000, frontend on 8000):

```powershell
cd d:\space
./start_all.ps1
```

Open the viewer:

- http://localhost:8000/viewer/index.html

Windows quick start (one-click)

If you prefer a double-clickable launcher, use the included `start_all.bat` from the repo root. It opens two command windows: one for the backend and one for the static frontend.

Steps:

1. Double-click `d:\space\start_all.bat` or run it from PowerShell/CMD:

cd d:\space
.\start_all.bat

2. Open http://localhost:8000/viewer/index.html

PowerShell gotcha & Troubleshooting

- "the term 'start_all.ps1' is not recognized" when typing `start_all.ps1` in PowerShell usually means one of:

  1. You're not in the repository directory. Run `cd d:\space` first.
  2. PowerShell requires `.`/`\` prefix to run local scripts: use `.\\start_all.ps1` or `./start_all.ps1`.
  3. Execution policy blocks scripts. Temporarily allow scripts for the current PowerShell session:

  Open PowerShell as Administrator or for the current session run:

  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

  Then run: `./start_all.ps1`

- If you still can't run the PowerShell script, use `start_all.bat` (double-click) or start the backend and frontend manually (see Manual start above).

If anything fails, collect the single-window output and paste the logs here and I will help troubleshoot further.

You should see “Viewing XXXX stars from Gaia DR3”. As you move, new regions will stream in. The console shows when data is cached vs live.

## Manual Start

Backend API (FastAPI + Uvicorn):

```powershell
cd d:\space\backend
pip install -r requirements.txt
python -m uvicorn app:app --host 0.0.0.0 --port 5000 --reload
```

Frontend (static server):

```powershell
cd d:\space
python -m http.server 8000
```

Open the viewer:

- http://localhost:8000/viewer/index.html

## API

- GET /health – Health check
- GET /api/stars/region?ra=<deg>&dec=<deg>&radius=<deg>&limit=<n>

Example:

```
http://localhost:5000/api/stars/region?ra=266.4&dec=-29.0&radius=5&limit=1000
```

Response (fields abbreviated):

```
{
  "count": 1000,
  "cached": false,
  "query_time_ms": 1450.2,
  "stars": [
    {
      "source_id": "123456789",
      "ra": 266.41, "dec": -29.00,
      "x": 123.4, "y": -56.7, "z": 234.5,
      "parallax": 0.78, "distance_pc": 1282.1,
      "magnitude": 12.3, "color_bp_rp": 0.9,
      "r": 1, "g": 0.9, "b": 0.5,
      "pm_ra": -2.1, "pm_dec": 0.7
    }
  ]
}
```

## Notes

- Data is real from ESA Gaia DR3. First-time queries take ~1–3s; cached repeats are ~5–20ms.
- If the live query fails, the viewer falls back to a small CSV sample for demo only.
- Logs are written to `d:\space\logs` and ignored by Git; the folder will be created on start.

## Troubleshooting

- Port in use: change ports in `start_all.ps1` or run uvicorn with a different `--port`.
- CORS: backend allows http://localhost:8000 by default (see `backend/config.py`).
- Gaia 500 errors: transient. The service auto-retries; try again or move slightly to trigger a new region.

## Project Structure

```
d:\space
├─ backend/                # FastAPI app
│  ├─ app.py               # Entry point
│  ├─ config.py            # Settings (CORS, logging, Gaia)
│  ├─ requirements.txt     # Minimal deps
│  ├─ routes/
│  │  └─ stars_api.py      # /api/stars endpoints
│  └─ services/
│     ├─ gaia_service.py   # Gaia DR3 TAP+ integration
│     └─ cache_service.py  # In-memory + SQLite cache
├─ viewer/                 # Three.js viewer
│  ├─ index.html
│  ├─ main.js
│  └─ three.min.js
├─ data/
│  └─ milky_way_stars.csv  # Small fallback sample
├─ start_all.ps1           # Starts both servers
├─ .gitignore              # Ignores logs, cache.db, etc.
└─ LICENSE
```

Enjoy exploring!

How to start (Windows PowerShell)

One-click (recommended):

Open PowerShell and run:
cd d:\space
start_all.ps1 # if this fails, use the .bat launcher below or see Troubleshooting section
Opens:
Backend: http://localhost:5000
API Docs: http://localhost:5000/docs
Viewer: http://localhost:8000/viewer/index.html
Manual start:

Backend:
cd d:\space\backend
pip install -r requirements.txt
python -m uvicorn app:app --host 0.0.0.0 --port 5000 --reload
Frontend:
cd d:\space
python -m http.server 8000
Open http://localhost:8000/viewer/index.html
