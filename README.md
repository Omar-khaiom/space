# 🌌 Real-Time Cosmic-Web Visualization

**Interactive 3D galaxy viewer using SDSS data with structure-preserving LOD and Jarvis UX**

## 🚀 Quick Start

```bash
# 1. Setup environment
python -m pip install --upgrade pip
pip install numpy pandas astropy scikit-learn matplotlib

# 2. Process data (use sample if no SDSS data)
python scripts/preprocess_sdss.py --input data/galaxies_raw.csv --output data/galaxies_final.csv

# 3. Build tiles and LOD sets
python scripts/build_voxel_tiles.py --input data/galaxies_final.csv --voxel 3.0 --out data/tiles
python scripts/build_lod_sets.py --tiles data/tiles --lod0 50000 --lod1 250000

# 4. Launch viewer
cd viewer && python -m http.server 5500
# Open http://localhost:5500
```

## 📊 SDSS Data Query

Use SDSS SkyServer SQL (DR17 or DR19):

```sql
SELECT TOP 10000
  ra, dec, z, modelMag_r
FROM SpecPhoto
WHERE ra BETWEEN 150 AND 160
  AND dec BETWEEN 2 AND 12
  AND z BETWEEN 0.02 AND 0.2
  AND zWarning = 0
```

Save as `data/galaxies_raw.csv`.

## 🎯 Performance Targets

- **≥30 FPS** at ≥250k visible points
- **≤1s refine** after camera movement stops
- Structure-preserving LOD with **≥70% k-NN edge overlap** at 25% sampling

## 📁 Project Structure

```
cosmic-web/
├── data/
│   ├── galaxies_raw.csv      # SDSS query results
│   ├── galaxies_final.csv    # Processed 3D coordinates
│   └── tiles/                # Voxel tiles with LOD sets
│       ├── lod0/             # ~50k points (coarse)
│       ├── lod1/             # ~250k points (medium)
│       ├── lod2/             # Full detail
│       └── manifest.json     # Tile metadata
├── scripts/
│   ├── preprocess_sdss.py    # RA/Dec/z → 3D coordinates
│   ├── build_voxel_tiles.py  # Spatial tiling system
│   ├── build_lod_sets.py     # Structure-preserving LOD
│   └── sample_data.csv       # Fallback test data
├── viewer/
│   ├── index.html            # Main application
│   ├── main.js               # Three.js visualization
│   └── shaders/              # Custom point shaders
│       ├── points.vert.glsl
│       └── points.frag.glsl
├── eval/
│   ├── graph_metrics.py      # k-NN graph analysis
│   ├── fps_bench.js          # Performance benchmarks
│   └── metrics.ipynb         # Analysis notebook
└── docs/
    ├── draft.md              # Research paper draft
    └── figures/              # Generated plots
```

## 🎮 Features

### Core Visualization

- **Three.js WebGL2** rendering with OrbitControls
- **Round point sprites** with distance attenuation
- **Progressive LOD** with smooth cross-fade transitions
- **Frustum culling** for optimal performance

### Jarvis UX

- **Click-to-focus** with smooth fly-to animations
- **HUD display** showing z, magnitude, local density
- **Bookmarks** for saving favorite viewpoints
- **Quality/Performance** toggle

### Scientific Accuracy

- **Proper cosmology** using astropy.cosmology.Planck18
- **Structure-preserving sampling** based on local density
- **Graph-theoretic evaluation** with baseline comparisons

## 🔬 Evaluation

- **FPS benchmarks** across different point counts
- **k-NN graph overlap** metrics vs random/uniform sampling
- **Connected component** preservation analysis

## 🛠️ Troubleshooting

**CORS Errors:** Always use local server, never open HTML directly
**Performance Issues:** Try Quality→Performance mode or reduce LOD thresholds
**Missing Data:** System auto-falls back to sample_data.csv if SDSS data unavailable

---

**Built with:** Python scientific stack + Three.js WebGL2
**Target:** Real-time exploration of cosmic large-scale structure
