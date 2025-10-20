# Space Catalog Backend API

Professional Python backend for live astronomical data streaming from ESA Gaia DR3.

## 🚀 Quick Start

### 1. Install Dependencies

```powershell
cd d:\space\backend
pip install -r requirements.txt
```

### 2. Start the API Server

```powershell
python app.py
```

The API will be available at: `http://localhost:5000`

### 3. Access Interactive Docs

Open your browser: `http://localhost:5000/docs`

---

## 📡 API Endpoints

### **GET /** - API Info

Returns API status and available endpoints.

### **GET /health** - Health Check

Returns cache statistics and service status.

### **POST /api/stars/cone** - Cone Search

Query stars in a circular region of the sky.

**Example Request:**

```json
{
  "ra": 266.4,
  "dec": -29.0,
  "radius": 5.0,
  "max_stars": 10000,
  "min_magnitude": 18.0
}
```

### **POST /api/stars/frustum** - Camera Frustum Query

Query stars visible in the viewer's camera frustum (optimized for real-time streaming).

**Example Request:**

```json
{
  "camera_x": 0.0,
  "camera_y": 0.0,
  "camera_z": 0.0,
  "direction_x": 1.0,
  "direction_y": 0.0,
  "direction_z": 0.0,
  "fov": 50.0,
  "max_distance": 1000.0,
  "max_stars": 50000
}
```

### **GET /api/stars/galactic-center** - Galactic Center Quick Query

Pre-configured query for Sagittarius A\* region.

---

## 🏗️ Architecture

```
backend/
├── app.py                      # FastAPI application entry point
├── config.py                   # Configuration management
├── requirements.txt            # Python dependencies
├── .env                        # Environment variables
├── services/
│   ├── gaia_service.py         # ESA Gaia DR3 API integration
│   └── cache_service.py        # Query caching layer
└── routes/
    └── stars_api.py            # Star query endpoints
```

### Key Features:

✅ **Live Gaia DR3 Integration** - Real astronomical data from ESA
✅ **Intelligent Caching** - In-memory + SQLite with TTL
✅ **Async/Await** - High-performance concurrent queries
✅ **CORS Enabled** - Frontend can connect from localhost:8000
✅ **Retry Logic** - Auto-retry failed Gaia queries
✅ **Spatial Queries** - Cone search + frustum culling
✅ **Color Mapping** - BP-RP photometry → RGB colors
✅ **Coordinate Conversion** - Equatorial ↔ Cartesian
✅ **Parallax Distance** - Real 3D positions from parallax
✅ **Proper Motion** - Star velocities for future time simulation

---

## 🔧 Configuration

Edit `.env` file to customize:

- `API_PORT` - Server port (default: 5000)
- `GAIA_MAX_ROWS` - Max stars per query (default: 100,000)
- `CACHE_TTL_SECONDS` - Cache expiration (default: 3600s)
- `MAX_STARS_PER_REQUEST` - Request limit (default: 50,000)

---

## 📊 Data Format

### Star Response Schema:

```json
{
  "count": 10000,
  "cached": false,
  "query_time_ms": 1250.5,
  "stars": [
    {
      "id": 4295806720,
      "ra": 266.41681,
      "dec": -29.00782,
      "x": 123.45,
      "y": -67.89,
      "z": 234.56,
      "parallax": 3.14,
      "distance_pc": 318.47,
      "magnitude": 8.5,
      "color_bp_rp": 1.2,
      "r": 1.0,
      "g": 0.8,
      "b": 0.4,
      "pmra": -2.5,
      "pmdec": 1.3,
      "radial_velocity": -12.5,
      "temperature": 5800
    }
  ]
}
```

### Coordinates:

- **Equatorial**: `ra` (0-360°), `dec` (-90 to 90°)
- **Cartesian**: `x`, `y`, `z` in parsecs (Sun at origin)
- **Distance**: Calculated from parallax (1000/parallax_mas)

### Photometry:

- **magnitude**: Gaia G-band magnitude (lower = brighter)
- **color_bp_rp**: Blue-Red color index
- **r, g, b**: Computed RGB color (0.0-1.0)

---

## 🧪 Testing

### Test the API:

```powershell
# Check health
curl http://localhost:5000/health

# Query galactic center
curl http://localhost:5000/api/stars/galactic-center?radius=2.0&max_stars=5000
```

### Test from Python:

```python
import requests

response = requests.post(
    "http://localhost:5000/api/stars/cone",
    json={
        "ra": 266.4,
        "dec": -29.0,
        "radius": 1.0,
        "max_stars": 1000,
        "min_magnitude": 15.0
    }
)

data = response.json()
print(f"Found {data['count']} stars")
print(f"First star: {data['stars'][0]}")
```

---

## 🔮 Next Steps

1. **Connect Frontend** - Update `viewer/main.js` to query this API instead of CSV
2. **Add Database** - PostgreSQL with spatial indexing for faster queries
3. **LOD System** - Dynamic detail levels based on zoom
4. **Time Simulation** - Animate proper motion over years
5. **Multi-Catalog** - Add nebulae, galaxies, exoplanets

---

## 📝 Development Notes

- Uses **astroquery** library for Gaia Archive TAP+ access
- Queries are cached to avoid hammering ESA servers
- Coordinate system matches Three.js viewer (right-handed)
- All queries run async to avoid blocking
- Automatic retry on network failures (max 3 attempts)

---

## 🐛 Troubleshooting

**"ModuleNotFoundError: No module named 'fastapi'"**
→ Run: `pip install -r requirements.txt`

**"Gaia query timeout"**
→ Reduce `max_stars` or `radius` in query
→ Increase `GAIA_TIMEOUT_SECONDS` in `.env`

**"CORS error in browser"**
→ Check `CORS_ORIGINS` in `.env` matches your frontend URL

**"Port 5000 already in use"**
→ Change `API_PORT` in `.env` file

---

Made with ❤️ for professional astronomical visualization
