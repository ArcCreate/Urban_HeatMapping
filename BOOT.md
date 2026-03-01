# Boot Instructions — Urban Heat Mapping (King County)

Complete guide to train all models and start the full stack from scratch.

---

## Prerequisites

- **Python 3.12** (required — TensorFlow segfaults on 3.13 arm64)
- **Conda** (recommended) or any venv manager
- **Node.js 18+** and npm
- **Anthropic API key** (`sk-ant-...`)
- CSV source files at project root: `TempKC.csv` (76 MB) and `HeatHealthKC.csv` (12 MB)

---

## Overview

```
Step 1  →  Create Python environment
Step 2  →  Build DuckDB (only if king_county.duckdb is missing or corrupted)
Step 3  →  Train ML models
Step 4  →  Configure .env
Step 5  →  Boot the backend API
Step 6  →  Boot the frontend
```

Steps 2–3 are **one-time setup**. Once `king_county.duckdb` and `models/` exist, go straight to Steps 4–6.

---

## Step 1 — Create Python Environment

```bash
conda create -n urban-heatmap python=3.12 -y
conda activate urban-heatmap

cd /Users/shrey/Desktop/UrbanPlanning/Urban_HeatMapping   # project root

pip install -r requirements.txt
pip install -r scripts/requirements-pipeline.txt
```

> `requirements-pipeline.txt` adds `pygris`, `geopandas`, and `shapely` — needed for Steps 2 & 3, not the API server.

---

## Step 2 — Build the DuckDB Database

> **Skip this step if `king_county.duckdb` already exists** and is intact (35 MB, 3 tables).
> Run it only if you need to rebuild from raw CSVs.

```bash
conda activate urban-heatmap
cd /Users/shrey/Desktop/UrbanPlanning/Urban_HeatMapping

python scripts/build_duckdb.py
```

**What it does:**
- Reads `HeatHealthKC.csv` (25,552 block rows) and `TempKC.csv` (492 tract predictions)
- Downloads 2020 Census TIGER/Line tract and block geometries for King County via `pygris`
- Creates `king_county.duckdb` with 3 tables:
  - `tract_features` — 492 tracts, 15 averaged feature columns + WKT geometry
  - `tract_outputs_with_preds` — 492 tracts, normalized placeholder scores `[0, 1]` (replaced after Step 3)
  - `blocks` — 25,552 blocks with attributes + WKT geometry

**Expected output:**
```
... INFO Connecting to king_county.duckdb
... INFO Loading HeatHealthKC.csv ...
... INFO   blocks_raw: 25552 rows
... INFO Loading TempKC.csv ...
... INFO   tract_preds_raw: 492 rows
... INFO Aggregating blocks to tract level...
... INFO   tract_features: 492 rows
... INFO Downloading Census TIGER tract geometry...
... INFO   Downloaded 492 tract geometries
... INFO   Geometry matched for 492 / 492 tracts
... INFO Downloading Census TIGER block geometry (this may take 1–2 min, ~200MB download)...
... INFO   Downloaded 25552 block geometries
... INFO   Block geometry matched: 25552 / 25552
... INFO   Spatial extension check: OK (type=Polygon)
... INFO Build complete: king_county.duckdb (35.x MB)
```

> The block geometry download can take **1–5 minutes** depending on connection speed.

---

## Step 3 — Train the ML Models

```bash
conda activate urban-heatmap
cd /Users/shrey/Desktop/UrbanPlanning/Urban_HeatMapping

python scripts/train_models.py
```

**What it does:**
- Reads features and placeholder scores from `king_county.duckdb`
- Trains 3 models on 492 tracts using 15 features (temperature, canopy, health, equity indicators)
- Saves trained models to `models/` (directory created automatically)

**Models trained:**

| File | Algorithm | Target |
|------|-----------|--------|
| `models/xgb_heat.json` | XGBoost | `xgb_heat_score` — heat exposure |
| `models/xgb_risk.json` | XGBoost | `xgb_risk_score` — heat + health + equity risk |
| `models/tf_risk.keras` | TensorFlow Dense (32→16→1) | `tf_risk_score` — alternative risk metric |

**Expected output:**
```
Loading data from king_county.duckdb...
  492 tracts, 15 features

Training XGBoost models...
  xgb_heat: RMSE=0.xxxx  range=[0.xx, 0.xx]
  xgb_risk: RMSE=0.xxxx  range=[0.xx, 0.xx]

Training TensorFlow model...
  tf_risk:  RMSE=0.xxxx  range=[0.xx, 0.xx]

Saving models...
  models/xgb_heat.json saved
  models/xgb_risk.json saved
  models/tf_risk.keras saved
```

> Training takes **10–60 seconds** depending on hardware. TF logs suppressed by default (`verbose=0`).

---

## Step 4 — Configure Environment Variables

```bash
cd /Users/shrey/Desktop/UrbanPlanning/Urban_HeatMapping
cp .env.example .env
```

Edit `.env` and fill in your real values:

```dotenv
ANTHROPIC_API_KEY=sk-ant-<your-key-here>

DUCKDB_PATH=king_county.duckdb
XGB_HEAT_MODEL_PATH=models/xgb_heat.json
XGB_RISK_MODEL_PATH=models/xgb_risk.json
TF_RISK_MODEL_PATH=models/tf_risk.keras    # note: .keras extension (not models/tf_risk)

# macOS arm64 — prevents OpenMP conflict between TF and XGBoost
OMP_NUM_THREADS=1
TF_NUM_INTRAOP_THREADS=1
```

> **Note:** `.env.example` shows `TF_RISK_MODEL_PATH=models/tf_risk` (without extension).
> Use `models/tf_risk.keras` to match the file the training script actually saves.

---

## Step 5 — Boot the Backend API

```bash
conda activate urban-heatmap
cd /Users/shrey/Desktop/UrbanPlanning/Urban_HeatMapping

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Expected startup output:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process ...
INFO:     Startup: connecting to DuckDB at king_county.duckdb...
INFO:     Startup: loading ML models (this may take several seconds)...
INFO:     Loading XGBoost heat model from models/xgb_heat.json
INFO:     Loading XGBoost risk model from models/xgb_risk.json
INFO:     Loading TensorFlow risk model from models/tf_risk.keras
INFO:     All models loaded in x.xxs
INFO:     Startup: initializing Anthropic client...
INFO:     Startup complete. API is ready.
INFO:     Application startup complete.
```

**Verify it's working:**
```bash
curl http://localhost:8000/api/v1/health
# Expected: {"status":"ok","models_loaded":true,"db_connected":true}
```

**API docs:** http://localhost:8000/docs

---

## Step 6 — Boot the Frontend

Open a **second terminal:**

```bash
cd /Users/shrey/Desktop/UrbanPlanning/Urban_HeatMapping/urban-heat-ui

npm install        # first time only

npm run dev
```

**Expected output:**
```
  VITE vx.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://xxx.xxx.x.x:5173/
```

Open **http://localhost:5173** in your browser.

The frontend connects to the backend at `http://localhost:8000/api/v1` (set in `urban-heat-ui/vite.config.ts` or via `VITE_API_BASE_URL` in `urban-heat-ui/.env.local`).

---

## Full Start-from-Scratch Sequence (copy-paste)

```bash
# 1. Environment
conda create -n urban-heatmap python=3.12 -y
conda activate urban-heatmap
cd /Users/shrey/Desktop/UrbanPlanning/Urban_HeatMapping
pip install -r requirements.txt
pip install -r scripts/requirements-pipeline.txt

# 2. Build database (skip if king_county.duckdb exists)
python scripts/build_duckdb.py

# 3. Train models
python scripts/train_models.py

# 4. Configure secrets
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY and fix TF_RISK_MODEL_PATH=models/tf_risk.keras

# 5. Boot backend (keep running in this terminal)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 6. Boot frontend (open a new terminal)
cd urban-heat-ui
npm install
npm run dev
```

---

## Subsequent Starts (models already trained)

```bash
# Terminal 1 — Backend
conda activate urban-heatmap
cd /Users/shrey/Desktop/UrbanPlanning/Urban_HeatMapping
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 — Frontend
cd /Users/shrey/Desktop/UrbanPlanning/Urban_HeatMapping/urban-heat-ui
npm run dev
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `FileNotFoundError: models/xgb_heat.json` | Models not trained | Run Step 3 |
| `FileNotFoundError: models/tf_risk.keras` | Wrong path in `.env` | Set `TF_RISK_MODEL_PATH=models/tf_risk.keras` |
| `FileNotFoundError: king_county.duckdb` | DB not built | Run Step 2 |
| TensorFlow segfault on startup | Python 3.13 | Use Python 3.12 |
| XGBoost/TF OpenMP conflict (macOS) | Missing env vars | Add `OMP_NUM_THREADS=1` and `TF_NUM_INTRAOP_THREADS=1` to `.env` |
| `ANTHROPIC_API_KEY not set` | Missing `.env` | Copy `.env.example` → `.env` and fill in key |
| Frontend shows no map data | Backend not running | Ensure Step 5 is running on port 8000 |
| `pygris` download fails | No internet or Census API down | Retry; block geometry download is ~200 MB |

---

## Ports Reference

| Service | URL |
|---------|-----|
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| Health check | http://localhost:8000/api/v1/health |
| Frontend | http://localhost:5173 |
