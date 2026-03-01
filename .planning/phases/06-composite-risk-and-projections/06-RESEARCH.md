# Phase 6: Composite Risk Score & Climate Projections — Research

**Researched:** 2026-02-28
**Domain:** Urban heat risk scoring formula + TensorFlow projection model + FastAPI projections router + React timeline slider wiring
**Confidence:** HIGH (codebase analysis) / MEDIUM (domain weights) / MEDIUM (warming scenario inputs)

---

## Summary

Phase 6 has four tightly coupled deliverables that must be built in sequence: (1) a formula-based `composite_risk` column added to DuckDB, (2) a TensorFlow model trained on that composite plus climate-sensitive features to project scores for 2025–2050, (3) a new FastAPI projections router, and (4) wiring the existing timeline slider to fetch and apply those projections live.

The current codebase has a fully operational DuckDB, a working TF model training pipeline (`scripts/train_models.py`), a FastAPI app with 7 routers, and a React frontend with a static `TimelineSlider` that manages its own local `year` state. The existing `useTractData` hook computes `display_risk` in the frontend using arbitrary weights (0.35 heat / 0.40 imperv / 0.25 temp). Phase 6 replaces this entirely: composite_risk is computed in Python/DuckDB with explicit, documented weights, the TF projection model outputs values that become the display_risk source for non-2025 years, and the timeline slider triggers a projection API fetch on year change.

The critical architectural decision is that **all projection data is precomputed** at build time. At 492 tracts × 26 years = 12,792 rows, the `tract_projections` table is small and can be fully precomputed offline in `scripts/build_projections.py`. The API simply queries this table — there is no live inference at request time. This matches the existing project pattern (pre-scored values in `tract_outputs_with_preds`, not live inference in the API).

**Primary recommendation:** Compute `composite_risk` as a weighted sum of min-max-normalized sub-scores across 4 domains (thermal, vegetation/imperviousness, health burden, social vulnerability), add it to `tract_outputs_with_preds` via a new `scripts/score_composite.py`, then train a projection model that takes (composite_risk + climate-sensitive features + year) as inputs and predicts projected_risk for each tract-year pair, storing results in a new `tract_projections` table.

---

## Standard Stack

### Core (all already in requirements.txt — no new installs needed)

| Library | Version | Purpose | Already Present |
|---------|---------|---------|-----------------|
| duckdb | >=1.2.0,<2.0 | composite_risk column, tract_projections table, projections queries | Yes |
| tensorflow | >=2.15,<3.0 | projection model training (`scripts/train_projection.py`) | Yes |
| numpy | (TF dependency) | feature normalization, NaN imputation | Yes (via TF) |
| pandas | (pipeline dep) | data loading for scoring script | Yes (via pipeline) |
| fastapi | 0.134.0 | new projections router | Yes |
| pydantic | v2 (via fastapi) | ProjectedTractScore, ProjectionSeries schemas | Yes |
| zustand | (frontend) | projectionYear, projectionScores store additions | Yes |
| React | (frontend) | timeline slider wiring | Yes |

### Supporting (pipeline only — scripts/requirements-pipeline.txt)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| scikit-learn | any | Min-max normalization in scoring script | If not doing normalization in DuckDB SQL |

No new dependencies are required. All computation runs in the existing conda env (`urban-heatmap`, Python 3.12).

**Installation:** None required — all libraries already installed.

---

## Architecture Patterns

### Recommended File Structure (new files only)

```
scripts/
├── score_composite.py       # Step 1: compute composite_risk, add to tract_outputs_with_preds
├── train_projection.py      # Step 2: train TF projection model → models/tf_projection.keras
└── build_projections.py     # Step 3: run model for all tracts × years → tract_projections table

models/
└── tf_projection.keras      # New TF SavedModel file

app/
├── routers/
│   └── projections.py       # New: GET /api/v1/projections/{year} and /projections/range
├── services/
│   └── projections.py       # New: DuckDB queries for projection endpoints
└── schemas/
    └── projections.py       # New: ProjectedTractScore, ProjectionSeries schemas

urban-heat-ui/src/
├── api/
│   └── projections.ts       # New: fetchProjectionYear(year), fetchProjectionSeries(tractId)
├── store/
│   └── mapStore.ts          # Modified: add projectionYear, projectionScores, fetchProjectionYear
└── components/map/
    └── TimelineSlider.tsx   # Modified: read/write projectionYear from store, trigger fetch
```

---

### Pattern 1: composite_risk Formula (score_composite.py)

**What:** A documented weighted-sum formula across 4 domain groups. Each sub-score is min-max normalized to [0,1] across all 492 tracts before weighting. This ensures no single variable dominates due to scale differences.

**Domain weights (research-justified, see Sources below):**

```
Thermal domain (weight 0.30):
  mean_afternoon_temp         — primary heat exposure signal (normalized)

Vegetation/imperviousness domain (weight 0.25):
  mean_imperv (inverted: 1 - normalized)  — high imperv = high risk
  mean_tree_cov (inverted: 1 - normalized) — low tree cov = high risk
  domain score = 0.5 * imperv_norm_inv + 0.5 * tree_cov_norm_inv

Health burden domain (weight 0.25):
  mean_cvd_rate               — cardiovascular disease mortality
  mean_diabetes               — percent adults with diabetes
  mean_life_expectancy (inv)  — lower life expectancy = higher risk
  domain score = average of normalized individual sub-scores

Social vulnerability domain (weight 0.20):
  mean_svi_overall            — CDC SVI overall percentile (already 0-1)
  mean_poverty2x              — percent at 200% FPL
  mean_disability             — percent with disability
  mean_under18                — percent under 18
  mean_severe_cost            — severe housing cost burdened
  domain score = average of normalized individual sub-scores
```

**Final formula:**
```python
composite_risk = (
    0.30 * thermal_score +
    0.25 * vegetation_score +
    0.25 * health_score +
    0.20 * social_score
)
# Result is in [0,1] by construction (each domain is [0,1], weights sum to 1.0)
```

**Rationale for weights (domain confidence: MEDIUM — supported by literature):**
- Thermal 0.30: Temperature is the direct heat exposure measure. Studies consistently put heat exposure as primary factor (PMC8531084, PNAS canopy study).
- Vegetation/imperviousness 0.25: Tree cover and impervious surface are the two most influential built-environment interventions. PNAS 2019 shows canopy + imperviousness interaction is the dominant modifier of daytime cooling.
- Health burden 0.25: Cardiovascular disease, diabetes, life expectancy are the strongest predictors of heat mortality in HVI literature. 7 of 13 systematic review studies included health factors (PMC8531084).
- Social vulnerability 0.20: SVI, poverty, disability, under-18 are well-established sensitivity factors but secondary to direct heat and health signals for this tool's purpose.

**Note:** No academic consensus exists on exact weight values. These weights are clearly documented in `score_composite.py` with a `WEIGHTS` dict constant for easy tuning. The formula is deliberately transparent and tunable per the phase goal.

**Implementation pattern:**
```python
# scripts/score_composite.py
import duckdb, numpy as np, pandas as pd

WEIGHTS = {"thermal": 0.30, "vegetation": 0.25, "health": 0.25, "social": 0.20}

def minmax(arr: np.ndarray) -> np.ndarray:
    lo, hi = np.nanmin(arr), np.nanmax(arr)
    return (arr - lo) / (hi - lo + 1e-9)

conn = duckdb.connect("king_county.duckdb")  # write mode (no read_only=True)
df = conn.execute("SELECT * FROM tract_features").fetchdf()

# Thermal
t = minmax(df["mean_afternoon_temp"].values)

# Vegetation (inverted — high imperv/low tree = high risk)
imperv = 1.0 - minmax(df["mean_imperv"].values)
tree   = 1.0 - minmax(df["mean_tree_cov"].values)
v = 0.5 * imperv + 0.5 * tree

# Health (life_expectancy inverted)
cvd   = minmax(df["mean_cvd_rate"].values)
diab  = minmax(df["mean_diabetes"].values)
le    = 1.0 - minmax(df["mean_life_expectancy"].values)
h = np.nanmean(np.stack([cvd, diab, le], axis=1), axis=1)

# Social
svi   = minmax(df["mean_svi_overall"].values)
pov   = minmax(df["mean_poverty2x"].values)
dis   = minmax(df["mean_disability"].values)
u18   = minmax(df["mean_under18"].values)
hcost = minmax(df["mean_severe_cost"].values)
s = np.nanmean(np.stack([svi, pov, dis, u18, hcost], axis=1), axis=1)

df["composite_risk"] = (
    WEIGHTS["thermal"]    * t +
    WEIGHTS["vegetation"] * v +
    WEIGHTS["health"]     * h +
    WEIGHTS["social"]     * s
).round(4)

# ALTER TABLE to add column, then UPDATE
conn.execute("""
    ALTER TABLE tract_outputs_with_preds
    ADD COLUMN IF NOT EXISTS composite_risk DOUBLE DEFAULT 0.0
""")
updates = list(zip(df["composite_risk"].tolist(), df["tract_id"].tolist()))
conn.executemany(
    "UPDATE tract_outputs_with_preds SET composite_risk = ? WHERE tract_id = ?",
    updates
)
conn.close()
```

**Critical:** `score_composite.py` must open DuckDB without `read_only=True`. The API still uses `read_only=True`.

---

### Pattern 2: Projection Model Architecture (train_projection.py)

**What:** A TF dense regression model that takes (feature vector + year_normalized) as input and predicts `projected_risk` for a tract in that year. Training data is synthetic: for each of the 492 tracts, generate rows for each year 2025–2050 by applying a linear temperature increase to `mean_afternoon_temp`, then recompute composite_risk.

**Input features (same 15 as current `FEATURE_COLS` + year_norm):**
```python
PROJECTION_FEATURE_COLS = [
    "mean_afternoon_temp",  # climatic — modified by warming scenario
    "mean_morning_temp",    # climatic — modified (smaller coefficient)
    "mean_evening_temp",    # climatic — modified (smaller coefficient)
    "mean_tree_cov",        # stable across years (no model for change)
    "mean_imperv",          # stable across years
    "mean_dist_water",      # stable across years
    "mean_cvd_rate",        # stable across years (demography)
    "mean_diabetes",        # stable across years
    "mean_life_expectancy", # stable across years
    "mean_svi_overall",     # stable across years
    "mean_poverty2x",       # stable across years
    "mean_disability",      # stable across years
    "mean_limited_english", # stable across years
    "mean_under18",         # stable across years
    "mean_severe_cost",     # stable across years
    "year_norm",            # (year - 2025) / 25 — time index [0,1]
]
```

**Warming scenario (research-justified, confidence MEDIUM):**

King County projections (official King County Climate Office): +5.5°F by 2050s. This implies approximately +0.22°F/year from 2025 baseline. Use SSP2 "middle of the road" scenario as the basis — not optimistic (RCP2.6) nor catastrophic (RCP8.5).

```python
# Temperature delta applied per year in training data generation
WARMING_RATE_F_PER_YEAR = 5.5 / 25  # ≈ 0.22°F/year (linear interpolation 2025→2050)

def apply_warming(df_tract: pd.DataFrame, year: int) -> pd.DataFrame:
    delta = WARMING_RATE_F_PER_YEAR * (year - 2025)
    df_year = df_tract.copy()
    df_year["mean_afternoon_temp"] += delta
    df_year["mean_morning_temp"]   += delta * 0.7  # morning warms more slowly
    df_year["mean_evening_temp"]   += delta * 0.85
    df_year["year_norm"] = (year - 2025) / 25.0
    return df_year
```

**Training dataset construction:**
1. For each of 492 tracts, generate 26 rows (years 2025–2050)
2. Apply warming delta to thermal columns for each year
3. Recompute `composite_risk` for each row using the same formula
4. That recomputed composite_risk IS the target (`y`)
5. Total training rows: 492 × 26 = 12,792

**Why train TF at all if targets are derived from the formula?** The TF model learns the non-linear relationship between feature-space trajectories and composite_risk so the projection pipeline is extensible. For v1, the model output and the formula output will be nearly identical for interpolated years — this is expected and correct. The model provides the infrastructure to incorporate real observed climate data later.

**Model architecture (extend existing TF risk pattern from train_models.py):**
```python
# scripts/train_projection.py
import tensorflow as tf, numpy as np, duckdb, pandas as pd, pathlib

# Same simple dense architecture as tf_risk — proven pattern for this dataset
model = tf.keras.Sequential([
    tf.keras.layers.Input(shape=(16,)),        # 15 features + year_norm
    tf.keras.layers.Dense(32, activation="relu"),
    tf.keras.layers.Dense(16, activation="relu"),
    tf.keras.layers.Dense(1,  activation="sigmoid"),  # output in [0,1]
])
model.compile(optimizer="adam", loss="mse")
model.fit(X_norm, y, epochs=100, batch_size=64, verbose=0)
model.save("models/tf_projection.keras")

# Save normalization stats (mean/std) — required at inference time
np.save("models/tf_projection_norm.npy", {"mean": X_mean, "std": X_std})
```

---

### Pattern 3: build_projections.py (precompute all rows)

**What:** Load trained model, run inference for all 492 × 26 = 12,792 tract-year pairs, write `tract_projections` table to DuckDB.

```python
# scripts/build_projections.py
con = duckdb.connect("king_county.duckdb")  # write mode

con.execute("""
    CREATE OR REPLACE TABLE tract_projections (
        tract_id   VARCHAR,
        year       INTEGER,
        projected_risk DOUBLE
    )
""")

# Load model + norm stats, run per year, insert batch
model = tf.keras.models.load_model("models/tf_projection.keras")
norm = np.load("models/tf_projection_norm.npy", allow_pickle=True).item()

rows = []
for year in range(2025, 2051):
    X_year = build_features_for_year(df_base, year, norm)  # apply warming, normalize
    preds  = model.predict(X_year, verbose=0).flatten()
    for tract_id, risk in zip(tract_ids, preds):
        rows.append((tract_id, year, round(float(risk), 4)))

con.executemany(
    "INSERT INTO tract_projections VALUES (?, ?, ?)", rows
)
con.execute("CREATE INDEX IF NOT EXISTS idx_proj_year ON tract_projections(year)")
con.execute("CREATE INDEX IF NOT EXISTS idx_proj_tract ON tract_projections(tract_id)")
con.close()
```

---

### Pattern 4: Backend Projections Router

**Endpoints:**
- `GET /api/v1/projections/{year}` — returns all 492 tracts' projected_risk for that year
- `GET /api/v1/projections/range` — query param `tract_id` — returns full 2025–2050 series for one tract

**Router pattern (identical to existing predictions router — def, not async):**

```python
# app/routers/projections.py
from fastapi import APIRouter, Depends, HTTPException, Query
from app.dependencies import get_db
from app.schemas.projections import ProjectedTractScore, ProjectionSeries
import app.services.projections as projection_service

router = APIRouter(prefix="/projections", tags=["Projections"])

@router.get("/range", response_model=ProjectionSeries)
def get_projection_series(
    tract_id: str = Query(..., description="Tract ID for full 2025-2050 series"),
    db=Depends(get_db),
) -> dict:
    # IMPORTANT: register /range BEFORE /{year} to avoid path conflicts
    return projection_service.get_series(db, tract_id)

@router.get("/{year}", response_model=list[ProjectedTractScore])
def get_projections_for_year(
    year: int,
    db=Depends(get_db),
) -> list[dict]:
    if year < 2025 or year > 2050:
        raise HTTPException(status_code=400, detail="Year must be between 2025 and 2050")
    return projection_service.get_year_projections(db, year)
```

**Schemas:**
```python
# app/schemas/projections.py
from pydantic import BaseModel

class ProjectedTractScore(BaseModel):
    tract_id: str
    year: int
    projected_risk: float

class ProjectionSeries(BaseModel):
    tract_id: str
    projections: list[ProjectedTractScore]
```

**main.py addition (one line):**
```python
from app.routers import health, tracts, predictions, summary, blocks, simulations, chat, projections
# ...
app.include_router(projections.router, prefix="/api/v1")
```

---

### Pattern 5: Service Functions (projections.py)

```python
# app/services/projections.py
import duckdb

def get_year_projections(db: duckdb.DuckDBPyConnection, year: int) -> list[dict]:
    cursor = db.cursor()
    rows = cursor.execute("""
        SELECT tract_id, year, projected_risk
        FROM tract_projections
        WHERE year = ?
        ORDER BY tract_id
    """, [year]).fetchall()
    return [{"tract_id": r[0], "year": r[1], "projected_risk": r[2]} for r in rows]


def get_series(db: duckdb.DuckDBPyConnection, tract_id: str) -> dict:
    cursor = db.cursor()
    rows = cursor.execute("""
        SELECT tract_id, year, projected_risk
        FROM tract_projections
        WHERE tract_id = ?
        ORDER BY year
    """, [tract_id]).fetchall()
    if not rows:
        return {"tract_id": tract_id, "projections": []}
    return {
        "tract_id": tract_id,
        "projections": [{"tract_id": r[0], "year": r[1], "projected_risk": r[2]} for r in rows]
    }
```

---

### Pattern 6: Frontend Store Additions (mapStore.ts)

Add to the `MapState` interface and store:

```typescript
// New state fields
projectionYear: number          // currently displayed year (2025 = baseline)
projectionScores: Map<number, Map<string, number>>  // year → (tractId → projected_risk)
isProjectionLoading: boolean

// New actions
setProjectionYear: (year: number) => void
fetchProjectionYear: (year: number) => Promise<void>
```

**Implementation:**
```typescript
// Additions to mapStore.ts
projectionYear: 2025,
projectionScores: new Map(),
isProjectionLoading: false,

setProjectionYear: (year) => set({ projectionYear: year }),

fetchProjectionYear: async (year) => {
  const { projectionScores } = get()
  if (projectionScores.has(year)) {
    // Cache hit — no refetch needed
    set({ projectionYear: year })
    return
  }
  set({ isProjectionLoading: true })
  try {
    const data = await fetchProjectionYear(year)  // from api/projections.ts
    const scoreMap = new Map(data.map((d) => [d.tract_id, d.projected_risk]))
    const updated = new Map(projectionScores).set(year, scoreMap)
    set({ projectionScores: updated, projectionYear: year, isProjectionLoading: false })
  } catch (e) {
    set({ isProjectionLoading: false })
  }
},
```

---

### Pattern 7: useTractData + Timeline Wiring

`useTractData` must be updated to recompute `display_risk` from either:
- Baseline (year === 2025): use `composite_risk` from predictions API
- Future year: use `projected_risk` from the cached `projectionScores.get(year)` Map

The GeoJSON features need to be re-stamped with the new `display_risk` values and re-set in the store. The `colorStops` must be recomputed for each year switch.

**HeatMap update:** When `projectionYear` changes in the store, a `useEffect` in `useTractData` (or a new `useProjectionData` hook) must re-stamp GeoJSON features and update colorStops.

**TimelineSlider update:**
```typescript
// TimelineSlider.tsx — replace local state with store
const { projectionYear, fetchProjectionYear } = useMapStore(
  useShallow((s) => ({ projectionYear: s.projectionYear, fetchProjectionYear: s.fetchProjectionYear }))
)

const MIN_YEAR = 2025
const MAX_YEAR = 2050

const handleYearChange = useCallback((newYear: number) => {
  fetchProjectionYear(newYear)  // fetches (or cache-hits) and sets projectionYear in store
}, [fetchProjectionYear])
```

**API client:**
```typescript
// urban-heat-ui/src/api/projections.ts
export interface ProjectedTractScore {
  tract_id: string
  year: number
  projected_risk: number
}

export async function fetchProjectionYear(year: number): Promise<ProjectedTractScore[]> {
  const res = await fetch(`/api/v1/projections/${year}`)
  if (!res.ok) throw new Error(`Projection fetch failed: ${res.status}`)
  return res.json()
}

export async function fetchProjectionSeries(tractId: string): Promise<{ tract_id: string; projections: ProjectedTractScore[] }> {
  const res = await fetch(`/api/v1/projections/range?tract_id=${encodeURIComponent(tractId)}`)
  if (!res.ok) throw new Error(`Projection series fetch failed: ${res.status}`)
  return res.json()
}
```

---

### Anti-Patterns to Avoid

- **Don't do live TF inference in the API router:** The existing pattern is pre-scored data in DuckDB queried at request time. The new projections endpoint follows the same pattern — data precomputed in `build_projections.py`, served from `tract_projections` table.
- **Don't use `async def` for the projections router:** DuckDB handlers use `def` throughout this project. FastAPI dispatches to threadpool automatically.
- **Don't open DuckDB with `read_only=True` in scripts:** Scripts write to the database. The API still uses `read_only=True`.
- **Don't add `population_density` to `tract_features` via ALTER TABLE:** Instead compute `pop_density = Total Pop / ALAND20` inside `score_composite.py` during pandas processing. The `tract_features` table does not have `Total Pop` or `ALAND20` — these columns were not aggregated in `build_duckdb.py`. The scoring script can query `blocks_raw` directly for these if needed, or skip `pop_density` since SVI already captures density effects.
- **Don't add year as a feature to composite_risk:** The composite score is a static baseline. Year is only an input to the projection model.
- **Don't use the TF projection model at API request time:** Load the model only in `build_projections.py` (offline script), not in the API lifespan.
- **Don't break the existing display_risk computation:** For year 2025 (baseline), `useTractData` should still produce `composite_risk`-derived `display_risk`. Only for years 2026–2050 does the projection API replace the score source.
- **Don't use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` with DuckDB <1.2:** The `IF NOT EXISTS` variant is available in DuckDB 1.2+; the project uses `>=1.2.0`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Min-max normalization | Custom loop in SQL | numpy `(x - min) / (max - min)` in pandas | Already in-memory during scoring; SQL NTILE/percentile would require subqueries for each column |
| NaN imputation | Custom pandas fillna logic | Same column-median pattern as existing `train_models.py` (lines 40-43) | Proven pattern already in codebase |
| TF model serialization | Custom pickle/JSON | `model.save("path.keras")` + `tf.keras.models.load_model("path.keras")` | Already used in `train_models.py` line 108 |
| Normalization stats persistence | Hardcoded constants | `np.save("models/tf_projection_norm.npy", {...})` | Train-time stats needed at inference time in `build_projections.py` |
| Route conflict resolution | Complex path matching | Register `/range` before `/{year}` in router | FastAPI matches routes in registration order — static paths must precede dynamic |
| GeoJSON re-stamping in React | Full re-fetch of tracts GeoJSON | Re-map existing `geojsonData.features` in store action | Tract geometry never changes; only `display_risk` property changes per year |
| Year bounds validation | Custom middleware | `HTTPException(400)` in route handler | Simple integer range check |

---

## Common Pitfalls

### Pitfall 1: Population Density Column Missing from tract_features
**What goes wrong:** `score_composite.py` tries to read `pop_density` from `tract_features` and gets a column error. The columns `Total Pop` and `ALAND20` were NOT aggregated in `build_duckdb.py`'s `tract_features` query.
**Why it happens:** `build_duckdb.py` Step 2 aggregated only temperature, tree cover, imperviousness, health, SVI, and economic columns. Population totals and land area were omitted.
**How to avoid:** Either (a) skip population density from the composite formula — SVI already captures density-related vulnerability — or (b) query `blocks_raw` directly for `SUM("Total Pop")` and `SUM("ALAND20")` grouped by tract_id in `score_composite.py`, merge it into the dataframe, and compute `pop_density = total_pop / land_area`. Option (a) is simpler for v1.
**Warning signs:** `KeyError: 'Total Pop'` when loading `tract_features` dataframe.

### Pitfall 2: DuckDB Read-Only Mode Prevents ALTER TABLE
**What goes wrong:** `score_composite.py` or `build_projections.py` fails with `duckdb.InvalidInputException: Cannot write to read-only database` when trying to ALTER TABLE or CREATE TABLE.
**Why it happens:** The API opens DuckDB with `read_only=True`. If scripts accidentally use the same settings object, they inherit this.
**How to avoid:** Scripts always use `duckdb.connect("king_county.duckdb")` without `read_only=True`. Never import `settings` (which defaults to `read_only=True` behavior) in pipeline scripts.
**Warning signs:** Exception on `ALTER TABLE` or `CREATE TABLE` with "read-only" in the message.

### Pitfall 3: Route Conflict — /range vs /{year}
**What goes wrong:** `GET /api/v1/projections/range?tract_id=...` gets interpreted as `year="range"` (a string), causing a 422 validation error on the integer `year` path parameter.
**Why it happens:** FastAPI route matching is order-dependent. If `/{year}` is registered first, "range" matches it as a path parameter.
**How to avoid:** Register `/range` BEFORE `/{year}` in the router. Follow the same note in `predictions.py` which registers `/tracts/ranked` before `/tracts`.
**Warning signs:** `GET /projections/range` returns a 422 with "value is not a valid integer" error on the `year` field.

### Pitfall 4: Timeline Slider Year Out of Phase with Projection Data
**What goes wrong:** User scrubs to year 2030 but the map still shows 2025 data. Or the map flickers because every slider `onChange` triggers a new fetch without debouncing.
**Why it happens:** The current `TimelineSlider` uses local `year` state not connected to the store. If the store update and GeoJSON re-stamp happen asynchronously, there's a render gap.
**How to avoid:** (a) On year change, check cache first — if projection scores are already in `projectionScores.get(year)`, re-stamp GeoJSON synchronously (no fetch needed). (b) Only fetch from API if year is not cached. (c) Show `isProjectionLoading` spinner in the slider label while fetching.
**Warning signs:** Console shows repeated fetch calls for the same year; map visual does not update after slider change.

### Pitfall 5: GeoJSON Features Not Updated After Year Change
**What goes wrong:** `projectionYear` changes in the store but `geojsonData` features still have the old `display_risk` values from 2025.
**Why it happens:** `useTractData` only runs its effect once (no deps on `projectionYear`). The GeoJSON features are stamped in that one-time `useEffect`.
**How to avoid:** Add a second `useEffect` (or modify the store `fetchProjectionYear` action) that re-derives `display_risk` from `projectionScores.get(projectionYear)` and calls `setGeojsonData` with the re-stamped features. The `rankedTracts` and `colorStops` also need to be updated.
**Warning signs:** Map color does not change when slider moves; console shows `projectionYear` updating correctly in store but map is static.

### Pitfall 6: TF Normalization Stats Not Saved
**What goes wrong:** `build_projections.py` normalizes features using different mean/std values than `train_projection.py`, causing model to receive out-of-distribution inputs.
**Why it happens:** If normalization is re-computed from the projected training data rather than loaded from the saved stats file, distribution shift occurs.
**How to avoid:** Save `X_mean` and `X_std` from training to `models/tf_projection_norm.npy`. Load these same stats in `build_projections.py` before normalizing inference inputs.
**Warning signs:** Model predictions are all clustered near 0.5 regardless of input variation (sign of distribution shift).

### Pitfall 7: composite_risk Column Added to Wrong Table
**What goes wrong:** `composite_risk` is added to `tract_features` instead of `tract_outputs_with_preds`.
**Why it happens:** `tract_features` contains the raw feature columns and the scoring script reads from it — it may seem natural to write back to it.
**How to avoid:** `composite_risk` is a model output/score, not a raw feature. It belongs in `tract_outputs_with_preds` alongside `xgb_heat_score`, `xgb_risk_score`, `tf_risk_score`. Existing API service `get_all_predictions()` queries `tract_outputs_with_preds` — adding `composite_risk` there makes it immediately available via the existing predictions endpoint with a one-line query change.
**Warning signs:** The predictions API returns `composite_risk: null` because `tract_outputs_with_preds` was not updated.

### Pitfall 8: SortColumn Enum Not Updated
**What goes wrong:** After adding `composite_risk` to `tract_outputs_with_preds`, users want to sort ranked tracts by it, but `GET /predictions/tracts/ranked?sort_by=composite_risk` returns 422.
**Why it happens:** `SortColumn` enum in `app/schemas/predictions.py` only has `xgb_heat_score`, `xgb_risk_score`, `tf_risk_score`.
**How to avoid:** Add `composite_risk = "composite_risk"` to `SortColumn` enum as part of Phase 6. Update `SortColumn` docstring.
**Warning signs:** 422 on `sort_by=composite_risk`; frontend sidebar cannot sort by the new column.

---

## Code Examples

### DuckDB: Add composite_risk Column (safe idempotent pattern)
```python
# Source: DuckDB official docs — ALTER TABLE ADD COLUMN
conn = duckdb.connect("king_county.duckdb")  # NO read_only=True
try:
    conn.execute("ALTER TABLE tract_outputs_with_preds ADD COLUMN composite_risk DOUBLE DEFAULT 0.0")
except Exception:
    pass  # Column already exists — safe to ignore on re-run
# Then UPDATE with computed values
conn.executemany(
    "UPDATE tract_outputs_with_preds SET composite_risk = ? WHERE tract_id = ?",
    list(zip(scores, tract_ids))
)
conn.close()
```

### DuckDB: Create tract_projections Table with Indices
```python
# Source: DuckDB official docs — CREATE OR REPLACE TABLE, CREATE INDEX
conn.execute("""
    CREATE OR REPLACE TABLE tract_projections (
        tract_id       VARCHAR NOT NULL,
        year           INTEGER NOT NULL,
        projected_risk DOUBLE  NOT NULL
    )
""")
conn.execute("CREATE INDEX idx_proj_year  ON tract_projections(year)")
conn.execute("CREATE INDEX idx_proj_tract ON tract_projections(tract_id)")
```

### FastAPI: Projections Router (def handler pattern)
```python
# Source: existing app/routers/predictions.py pattern
@router.get("/{year}", response_model=list[ProjectedTractScore])
def get_projections_for_year(
    year: int,
    db=Depends(get_db),
) -> list[dict]:
    if not (2025 <= year <= 2050):
        raise HTTPException(status_code=400, detail="Year must be 2025–2050")
    return projection_service.get_year_projections(db, year)
```

### React: GeoJSON Re-stamp on Year Change
```typescript
// Pattern: derive display_risk from projection cache, re-stamp features
function stampProjectionOnGeoJSON(
  geojson: FeatureCollection,
  scoreMap: Map<string, number>,
): FeatureCollection {
  return {
    ...geojson,
    features: geojson.features.map((f) => {
      const tractId = (f.properties as Record<string, unknown>)?.tract_id as string
      return {
        ...f,
        properties: {
          ...f.properties,
          display_risk: scoreMap.get(tractId) ?? (f.properties as Record<string, unknown>).display_risk,
        },
      }
    }),
  }
}
```

### Zustand: Async Action with Cache Check
```typescript
// Source: Zustand docs — async actions with get() state access
fetchProjectionYear: async (year: number) => {
  const { projectionScores, geojsonData } = get()
  if (projectionScores.has(year) && geojsonData) {
    const scoreMap = projectionScores.get(year)!
    set({
      projectionYear: year,
      geojsonData: stampProjectionOnGeoJSON(geojsonData, scoreMap),
    })
    return
  }
  set({ isProjectionLoading: true })
  try {
    const data = await fetchProjectionYear(year)
    const scoreMap = new Map(data.map((d) => [d.tract_id, d.projected_risk]))
    const updated = new Map(get().projectionScores).set(year, scoreMap)
    const stamped = geojsonData ? stampProjectionOnGeoJSON(geojsonData, scoreMap) : null
    set({
      projectionScores: updated,
      projectionYear: year,
      geojsonData: stamped ?? geojsonData,
      isProjectionLoading: false,
    })
  } catch {
    set({ isProjectionLoading: false })
  }
},
```

---

## Data Column Inventory (Existing tract_features columns)

All columns available in DuckDB `tract_features` for use in composite formula:

| Column | Source CSV column | Units | Use in Formula |
|--------|------------------|-------|----------------|
| `mean_afternoon_temp` | Median afternoon temperature | °F | Thermal domain (primary) |
| `mean_morning_temp` | Median morning temperature | °F | Projection warming (secondary) |
| `mean_evening_temp` | Median evening temperature | °F | Projection warming (secondary) |
| `mean_tree_cov` | Percent tree coverage | % (0–100) | Vegetation domain (inverted) |
| `mean_imperv` | Percent impervious coverage | % (0–100) | Vegetation domain (inverted) |
| `mean_dist_water` | Mean distance to water | meters | Not included in v1 composite (low direct mortality signal) |
| `mean_cvd_rate` | Cardiovascular disease mortality rate | per 100k | Health domain |
| `mean_diabetes` | Percent adults with diabetes | % | Health domain |
| `mean_life_expectancy` | Life expectancy | years | Health domain (inverted) |
| `mean_svi_overall` | SVI Overall percentile ranking | 0–1 | Social domain |
| `mean_poverty2x` | Percent income under 200% FPL | % | Social domain |
| `mean_disability` | Percent with disability | % | Social domain |
| `mean_limited_english` | Percent limited English ability | % | Social domain |
| `mean_under18` | Percent under 18 | % | Social domain |
| `mean_severe_cost` | Percent severe housing cost burdened | % | Social domain |
| `city_name` | CITYNAME | string | Not scored |
| `geometry_wkt` | (computed) | WKT | Not scored |

**Columns from HeatHealthKC.csv NOT in tract_features (not aggregated):**
- Total Pop, ALAND20 → population density not available without querying `blocks_raw`
- HRA name/ID, FEMA Community Disaster Resilience Zone, Climate Change Disadvantaged flags → categorical/binary; not aggregated
- Percent heat mapping coverage, Percent LCI opportunity area coverage → not aggregated
- Percent single/multi-family homes → not aggregated

For v1, use only the 14 numeric columns already in `tract_features`. The SVI already captures population-density-related vulnerability through its component variables.

---

## Warming Scenario Reference

| Scenario | Temperature Delta by 2050 | Notes |
|----------|--------------------------|-------|
| King County official projection (all RCPs) | +5.5°F | Source: kingcounty.gov climate office — used for this phase |
| Optimistic (RCP2.6/SSP1) | ~2–3°F | Not used — too optimistic for policy tool |
| Moderate (RCP4.5/SSP2) | ~3–4°F | King County projection aligns with moderate-to-high scenario |
| High (RCP8.5/SSP5) | ~6–8°F | Available as optional scenario parameter in future |

**Implementation:** 5.5°F over 25 years = 0.22°F/year linear interpolation. This is sufficient for a transparent policy planning tool. The `WARMING_RATE_F_PER_YEAR` constant must be documented in `train_projection.py`.

---

## State of the Art

| Old Approach | New Approach in Phase 6 | Impact |
|--------------|------------------------|--------|
| `xgb_heat_score = PRED0_PE/100` (raw CSV column rename) | `composite_risk` = documented weighted formula across 4 domains | Transparent, tunable, domain-justified |
| `display_risk` computed in frontend JS with arbitrary 0.35/0.40/0.25 weights | `display_risk` = `composite_risk` (baseline) or `projected_risk` (future years) from DB | Single source of truth, consistent across API and UI |
| `TimelineSlider` is local state, disconnected from map | `TimelineSlider` reads/writes `projectionYear` in Zustand store, triggers fetch | Map colors update when slider scrubs |
| No future projection data | 12,792 precomputed rows in `tract_projections` | 26 years of per-tract risk data available at O(1) query time |

---

## Execution Order (Critical)

Scripts must run in this order before starting the API:

```
1. python scripts/score_composite.py      # adds composite_risk to tract_outputs_with_preds
2. python scripts/train_projection.py     # trains TF model, saves models/tf_projection.keras + norm stats
3. python scripts/build_projections.py    # creates/populates tract_projections table
```

Then restart the API:
```
uvicorn app.main:app --reload
```

The API does NOT need to load `tf_projection.keras` at startup — it only queries the precomputed `tract_projections` table. The existing `load_models()` in `app/models/loader.py` is unchanged.

---

## Open Questions

1. **Population density inclusion**
   - What we know: `Total Pop` and `ALAND20` are in `blocks_raw` but not `tract_features`
   - What's unclear: Whether the planner should add a `tract_features` migration step to include `pop_density`, or skip it for v1
   - Recommendation: Skip for v1. SVI sub-themes already capture density-correlated vulnerability. Document the omission in `score_composite.py` with a TODO comment.

2. **Baseline year: 2025 or use composite_risk directly?**
   - What we know: The projection model generates rows for 2025–2050. Year 2025 will be nearly identical to `composite_risk` (only minor model approximation error).
   - What's unclear: Should `useTractData` use `composite_risk` from predictions API for 2025, or fetch projection data for 2025 and use that?
   - Recommendation: Use `composite_risk` from predictions API for year 2025 (same as today's baseline). Only switch to projection API for 2026–2050. This avoids any model approximation error in the baseline view.

3. **SortColumn enum update scope**
   - What we know: Adding `composite_risk` to `tract_outputs_with_preds` makes it queryable.
   - What's unclear: Whether Phase 6 scope includes updating the ranked tracts sort-by to include `composite_risk`.
   - Recommendation: Yes — add `composite_risk = "composite_risk"` to the `SortColumn` enum. The planner should include this as a task.

4. **TractPopup: show composite_risk or projected_risk?**
   - What we know: `TractPopup` shows `xgb_heat_score`, `xgb_risk_score`, `tf_risk_score`, `display_risk`.
   - What's unclear: Should the popup show `composite_risk` instead of the individual scores for Phase 6, and show `projected_risk` when a future year is selected?
   - Recommendation: Add `composite_risk` to the popup properties and show it as "Composite Risk Score". When future year is selected, show "Projected Risk (year)" instead of or alongside composite_risk. Requires updating `TractPopup.tsx` and `PopupInfo` type in `types/map.ts`.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `/scripts/build_duckdb.py` — exact column names in tract_features, DuckDB table structure
- `/scripts/train_models.py` — existing TF model architecture, FEATURE_COLS, normalization pattern
- `/app/services/predictions.py` — service function pattern (def, cursor, fetchall)
- `/app/routers/predictions.py` — router pattern (prefix, APIRouter, Depends)
- `/app/main.py` — lifespan, router registration, def vs async pattern
- `/urban-heat-ui/src/store/mapStore.ts` — current Zustand store structure
- `/urban-heat-ui/src/hooks/useTractData.ts` — current display_risk computation + GeoJSON stamping pattern
- `/urban-heat-ui/src/components/map/TimelineSlider.tsx` — local state that needs to move to store
- `/urban-heat-ui/src/components/map/HeatMap.tsx` — display_risk consumption via MapLibre interpolation

### Secondary (MEDIUM confidence — official sources)
- [King County Climate Office: Our Changing Climate](https://kingcounty.gov/en/dept/executive/governance-leadership/climate-office/focus-areas/climate-preparedness/our-changing-climate) — +5.5°F by 2050s projection
- [DuckDB ALTER TABLE docs](https://duckdb.org/docs/stable/sql/statements/alter_table) — ADD COLUMN syntax, DEFAULT values
- [PMC8531084: Systematic Review of HVI Development and Validation](https://pmc.ncbi.nlm.nih.gov/articles/PMC8531084/) — weight methodology (PCA-based, no consensus on absolute weights), factor frequency
- [PMC9756927: Urban Heat Island Vulnerability Mapping](https://pmc.ncbi.nlm.nih.gov/articles/PMC9756927/) — domain weights: exposure 40% (UHI hotspot), 30% imperviousness, 30% vegetation

### Tertiary (LOW confidence — single-source or indirect)
- [PNAS: Tree canopy and impervious surface interaction](https://www.pnas.org/doi/10.1073/pnas.1817561116) — confirms imperviousness × canopy interaction as dominant modifier; supports weighting these together
- [Zustand async actions docs](https://awesomedevin.github.io/zustand-vue/en/docs/basic/async) — async action with get() state access pattern

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries required; all tools already in the project
- Composite formula weights: MEDIUM — no academic consensus on exact values; justified by literature patterns; documented as tunable constants
- Warming scenario inputs: MEDIUM — King County official projection (+5.5°F/2050s) used; linear interpolation is a simplification
- DuckDB schema patterns: HIGH — inspected actual build_duckdb.py, columns verified
- FastAPI router patterns: HIGH — inspected existing 7 routers; pattern is highly consistent
- Frontend store/hook patterns: HIGH — inspected mapStore.ts, useTractData.ts, TimelineSlider.tsx

**Research date:** 2026-02-28
**Valid until:** 2026-03-30 (stack is stable; composite weights can be revisited anytime)
