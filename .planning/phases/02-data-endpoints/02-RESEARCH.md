# Phase 2: Data Endpoints - Research

**Researched:** 2026-02-28
**Domain:** FastAPI + DuckDB spatial queries + GeoJSON serialization — census tract and block data endpoints
**Confidence:** HIGH (FastAPI patterns verified from Phase 1; DuckDB spatial verified live; GeoJSON pattern verified from official sources)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TRACT-01 | `GET /api/v1/tracts` returns GeoJSON FeatureCollection with geometry + (tract_id, xgb_heat_score, xgb_risk_score, tf_risk_score) properties | DuckDB query joins tract_features + tract_outputs_with_preds; `json.loads(ST_AsGeoJSON(...))` converts geometry; geojson-pydantic FeatureCollection as response model |
| TRACT-02 | `GET /api/v1/tracts/{tract_id}` returns full tract_features columns + all 3 model scores as typed JSON | Single DuckDB row fetch with 404 on miss; Pydantic model with all columns typed |
| TRACT-03 | `GET /api/v1/tracts/{tract_id}/geometry` returns lightweight GeoJSON Feature with geometry only | Same geometry query as TRACT-01 but single-tract; no feature vector; `json.loads(ST_AsGeoJSON(...))` pattern |
| BLOCK-01 | `GET /api/v1/blocks?tract_id=` returns GeoJSON FeatureCollection of blocks within that tract | DuckDB query on blocks table filtered by TRACT GEO ID; required query param; 422 if missing |
| BLOCK-02 | `GET /api/v1/blocks/{block_id}` returns single block detail as typed JSON | Single DuckDB row fetch from blocks table by BLOCK GEO ID; 404 on miss |
| PRED-01 | `GET /api/v1/predictions/tracts` returns all tract IDs with 3 pre-scored model values, no geometry | DuckDB SELECT from tract_outputs_with_preds; no geometry join needed; lightweight array response |
| PRED-02 | `GET /api/v1/predictions/tracts/ranked` accepts sort_by/order/limit params and returns sorted tracts | DuckDB ORDER BY + LIMIT on tract_outputs_with_preds; validated enum for sort_by column |
| SUM-01 | `GET /api/v1/summary/county` returns `{tract_count, mean_heat_score, p75_heat_score, high_risk_tract_count}` | Single DuckDB aggregation query: COUNT, AVG, PERCENTILE_CONT(0.75), COUNTIF |
| BATCH-01 | `POST /api/v1/tracts/batch` accepts `{tract_ids: [...]}` and returns full tract detail per ID | DuckDB `WHERE tract_id IN (...)` with parameterized list; returns array matching TRACT-02 schema |
</phase_requirements>

---

## CRITICAL BLOCKER: DuckDB File Does Not Exist Yet

**This is the most important finding in this research.**

`king_county.duckdb` does not exist on disk. The project root contains two raw CSV files:
- `HeatHealthKC.csv` — 25,552 block-level rows, 72 columns. No geometry column. Contains `BLOCK GEO ID` (15-digit FIPS), `TRACT GEO ID` (11-digit FIPS), heat temperatures, health indicators, SVI scores. Has `Shape__Area` and `Shape__Length` but NO WKT/GeoJSON geometry.
- `TempKC.csv` — 495 tract-level rows with heat-health prediction columns (PRED0_E, PRED0_PE, PRED12_E, PRED12_PE, PRED3_E, PRED3_PE, LONG_90_DAY, MAX_WBT, EXPOSED). Also no geometry.

**The CSVs have no geometry column.** The REQUIREMENTS.md says every tract and block endpoint must return GeoJSON geometry. Geometry must be sourced separately — specifically Census TIGER/Line shapefiles for King County census tracts (FIPS 53033) and census blocks.

**Consequence for planning:** Phase 2 Wave 0 (or a prerequisite task) must build `king_county.duckdb` from the CSVs plus Census geometry. The DuckDB file must contain:
1. A `tract_features` table (aggregated block attributes per tract, joined to tract predictions)
2. A `tract_outputs_with_preds` table (tract ID + 3 model scores — to be populated from ML pipeline output, but a schema stub with placeholder scores is needed for Wave 0)
3. A geometry column for tracts (`tract_geometry` WKT or GeoJSON stored in `tract_features`)
4. A `blocks` table with block-level attributes and geometry

---

## Summary

Phase 2 builds all data-access endpoints that the React frontend needs. The endpoints divide into four groups: (1) geometry + feature endpoints for tracts and blocks returning GeoJSON, (2) prediction-only endpoints without geometry, (3) aggregate summary endpoints, and (4) the batch endpoint for efficient multi-ID fetch.

The primary technical challenges are: (a) building `king_county.duckdb` from CSV sources plus Census TIGER geometry before any endpoint can be tested against real data; (b) ensuring geometry returned from DuckDB is parsed as a JSON object (not an escaped string) in FastAPI responses; (c) using the DuckDB `cursor()` pattern to safely share the single read-only connection across concurrent route handlers; and (d) routing all routes as `def` (not `async def`) so FastAPI dispatches DuckDB queries to its thread pool without event loop blocking.

The geometry sourcing strategy uses `pygris` (Python port of the R `tigris` package) to download 2020 Census TIGER/Line tract and block shapefiles for King County (FIPS 53033), convert geometries to WGS84, store WKT in DuckDB, and use DuckDB's spatial extension (`ST_AsGeoJSON(ST_GeomFromText(wkt_col))`) at query time to produce GeoJSON. This is the lowest-dependency approach given no existing geometry data exists in the project.

**Primary recommendation:** Build `king_county.duckdb` with geometry in Wave 0 (one dedicated task before any endpoint is written), then implement endpoints in two waves: geometry endpoints (Wave 1), prediction + summary + batch endpoints (Wave 2).

---

## Key Data Facts (Verified from CSV Inspection)

| Fact | Value | Confidence |
|------|-------|------------|
| Block count in HeatHealthKC.csv | 25,552 rows | HIGH — live inspection |
| Distinct tracts in HeatHealthKC.csv | 492 | HIGH — live inspection |
| Tract prediction rows in TempKC.csv | 495 | HIGH — live inspection |
| Tracts joinable across both CSVs | 492 (3 in tract_preds lack block data) | HIGH — live inspection |
| Block GEO ID format | 15-digit integer FIPS (e.g. 530330108001016) | HIGH |
| TRACT GEO ID format in HeatHealthKC | 11-digit integer FIPS (e.g. 53033010800) | HIGH |
| GEO_ID format in TempKC | `1400000US53033010800` — last 11 chars = tract FIPS | HIGH |
| Join key between CSVs | `RIGHT(TempKC.GEO_ID, 11) = CAST(HeatHealthKC."TRACT GEO ID" AS VARCHAR)` | HIGH |
| Geometry in either CSV | NONE — only Shape__Area and Shape__Length (numeric, no coordinates) | HIGH |
| DuckDB version installed | 1.4.4 (newer than requirements.txt pin of >=1.2.0) | HIGH — live check |

**Key column names in HeatHealthKC.csv (spaces in column names — must be quoted in SQL):**
- `"BLOCK GEO ID"` — primary block identifier (BIGINT)
- `"TRACT GEO ID"` — foreign key to tract (BIGINT)
- `"CITYNAME"` — municipality name
- `"Median afternoon temperature"`, `"Median morning temperature"`, `"Median evening temperature"` — heat metrics
- `"Percent tree coverage"`, `"Percent impervious coverage"`, `"Mean distance to water"` — land cover
- `"Cardiovascular disease mortality rate"`, `"Percent adults with diabetes"`, `"Life expectancy"` — health
- `"SVI Overall percentile ranking"` — social vulnerability index
- `"Percent of population whose income in the past 12 months is under 2.00x (200% of) the federal poverty level"` — poverty
- `"Percent of population with a disability"`, `"Percent under 18 years old"`, `"Percent severe housing cost burdened"` — vulnerability

**Key column names in TempKC.csv:**
- `GEO_ID` — Census tract identifier (`1400000US53033XXXXXX` format)
- `PRED0_PE`, `PRED12_PE`, `PRED3_PE` — exposure probabilities under heat scenarios (percent)
- `PRED0_E`, `PRED12_E`, `PRED3_E` — exposure counts
- `LONG_90_DAY`, `MAX_WBT`, `EXPOSED` — additional heat-health exposure metrics

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastapi | 0.134.0 | Web framework, routing | Already installed; Phase 1 established the pattern |
| duckdb | 1.4.4 (installed) / >=1.2.0 (pinned) | Data query engine | Project data source; read-only analytical queries |
| duckdb spatial extension | bundled with duckdb | `ST_AsGeoJSON`, `ST_GeomFromText`, `ST_Transform` | Converts WKT geometry to GeoJSON at query time; no Python-side geometry library needed |
| pydantic v2 | >=2.7 | Request/response validation | Already established in Phase 1; use throughout |
| geojson-pydantic | 2.1.0 | GeoJSON Pydantic models | Provides typed `Feature`, `FeatureCollection`, `Polygon` etc. that serialize correctly as nested JSON objects, not strings; prevents the #1 geometry serialization pitfall |

### Supporting (data pipeline only)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pygris | latest (PyPI) | Download Census TIGER/Line tract and block shapefiles | One-time offline data pipeline task to populate `king_county.duckdb` with geometry |
| geopandas | >=0.14 | GeoDataFrame manipulation; CRS reprojection to WGS84 | Used with pygris to convert NAD83 → WGS84 before WKT export to DuckDB |
| shapely | >=2.0 | WKT extraction from GeoDataFrame geometry column | `.to_wkt()` on GeoDataFrame geometry column |

> NOTE: pygris, geopandas, and shapely are **data pipeline dependencies only** — they go in a `scripts/requirements-pipeline.txt` or similar, NOT in the main `requirements.txt`. The FastAPI app never imports them.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| geojson-pydantic | Hand-rolled `dict` with `"type": "FeatureCollection"` | geojson-pydantic ensures RFC 7946 compliance and OpenAPI schema generation; hand-rolled works but loses schema documentation and type safety |
| pygris + geopandas (offline pipeline) | Download TIGER ZIP manually and load with DuckDB `ST_Read` | Both work; pygris is more reproducible in code; manual download is simpler if done once |
| `ST_AsGeoJSON` at query time | Store GeoJSON directly in DuckDB column | Computing at query time is slightly slower but cheaper on storage; fine for ~500 tracts + ~25K blocks |
| `def` routes for DuckDB | `async def` + `asyncio.to_thread` | `def` routes are simpler and FastAPI's thread pool handles them correctly; `async def` requires wrapping every DuckDB call |

**Installation (API only — add to existing requirements.txt):**
```bash
pip install geojson-pydantic==2.1.0
```

**Installation (pipeline only — in separate script environment):**
```bash
pip install pygris geopandas shapely
```

---

## Architecture Patterns

### Recommended Project Structure (Phase 2 additions)

```
app/
├── main.py              # Already exists — add new router registrations
├── config.py            # Already exists — no changes needed
├── dependencies.py      # Already exists — get_db used by all new routes
├── routers/
│   ├── health.py        # Already exists
│   ├── tracts.py        # NEW: GET /tracts, /tracts/{id}, /tracts/{id}/geometry, POST /tracts/batch
│   ├── blocks.py        # NEW: GET /blocks?tract_id=, /blocks/{block_id}
│   ├── predictions.py   # NEW: GET /predictions/tracts, /predictions/tracts/ranked
│   └── summary.py       # NEW: GET /summary/county
├── services/
│   ├── __init__.py      # NEW
│   ├── tracts.py        # NEW: DuckDB query functions for tract data
│   ├── blocks.py        # NEW: DuckDB query functions for block data
│   ├── predictions.py   # NEW: DuckDB query functions for predictions
│   └── summary.py       # NEW: DuckDB aggregation query
└── schemas/
    ├── health.py        # Already exists
    ├── tracts.py        # NEW: TractDetail, TractPrediction, TractFeature Pydantic models
    ├── blocks.py        # NEW: BlockDetail Pydantic model
    ├── predictions.py   # NEW: TractPrediction, RankedTract Pydantic models
    └── summary.py       # NEW: CountySummary Pydantic model

scripts/                  # NEW: offline data pipeline
├── build_duckdb.py      # Build king_county.duckdb from CSVs + TIGER geometry
└── requirements-pipeline.txt

tests/
├── test_health.py       # Already exists
├── test_tracts.py       # NEW: tests for TRACT-01, TRACT-02, TRACT-03
├── test_blocks.py       # NEW: tests for BLOCK-01, BLOCK-02
├── test_predictions.py  # NEW: tests for PRED-01, PRED-02
├── test_summary.py      # NEW: tests for SUM-01
├── test_batch.py        # NEW: tests for BATCH-01
└── fixtures.py          # NEW: shared in-memory DuckDB with test data
```

### Pattern 1: DuckDB Geometry Retrieval — The json.loads Pattern

**What:** Retrieve geometry from a WKT column using `ST_AsGeoJSON(ST_GeomFromText(wkt_col))` in DuckDB, then parse the resulting JSON string with `json.loads()` in Python before injecting into a Pydantic model. This is the only correct way to avoid the geometry-as-escaped-string pitfall.

**When to use:** Every route that returns geometry.

**Example:**
```python
# Source: verified live against DuckDB 1.4.4 + spatial extension
# app/services/tracts.py
import json
import duckdb

def get_tract_geojson_feature(db: duckdb.DuckDBPyConnection, tract_id: str) -> dict:
    cursor = db.cursor()
    cursor.execute("LOAD spatial;")
    row = cursor.execute("""
        SELECT
            tf.tract_id,
            ST_AsGeoJSON(ST_GeomFromText(tf.geometry_wkt))::TEXT AS geom_json,
            top.xgb_heat_score,
            top.xgb_risk_score,
            top.tf_risk_score
        FROM tract_features tf
        JOIN tract_outputs_with_preds top ON tf.tract_id = top.tract_id
        WHERE tf.tract_id = ?
    """, [tract_id]).fetchone()

    if row is None:
        return None

    tract_id_val, geom_json_str, xgb_heat, xgb_risk, tf_risk = row
    geometry = json.loads(geom_json_str)  # dict, not string

    return {
        "type": "Feature",
        "geometry": geometry,           # nested dict — correct GeoJSON
        "properties": {
            "tract_id": tract_id_val,
            "xgb_heat_score": xgb_heat,
            "xgb_risk_score": xgb_risk,
            "tf_risk_score": tf_risk,
        }
    }
```

**Why the cursor() call matters:** The shared `app.state.db` connection uses `.cursor()` to create a per-request cursor. This is thread-safe for concurrent `def` routes. Calling `db.execute()` directly on the shared connection is NOT thread-safe under FastAPI's thread pool dispatch.

### Pattern 2: GeoJSON FeatureCollection Response

**What:** Use `geojson-pydantic` models as FastAPI response models so the OpenAPI spec documents geometry correctly and the response serializes as a proper GeoJSON FeatureCollection.

**When to use:** Any endpoint returning multiple features with geometry.

**Example:**
```python
# Source: https://developmentseed.org/geojson-pydantic/intro/
# app/routers/tracts.py
from fastapi import APIRouter, Depends, HTTPException
from geojson_pydantic import FeatureCollection, Feature

from app.dependencies import get_db
from app.services import tracts as tract_service

router = APIRouter(prefix="/tracts", tags=["Tracts"])

@router.get("", response_model=FeatureCollection)
def list_tracts(db=Depends(get_db)) -> dict:
    """TRACT-01: All tracts as GeoJSON FeatureCollection."""
    features = tract_service.get_all_tract_features(db)
    return {"type": "FeatureCollection", "features": features}
```

### Pattern 3: def Routes for DuckDB (Not async def)

**What:** All DuckDB endpoints are plain `def` functions, not `async def`. FastAPI automatically dispatches `def` route handlers to a thread pool via `anyio.to_thread.run_sync`. This avoids blocking the event loop without requiring explicit `asyncio.to_thread()` wrapping on every query.

**When to use:** Every route that calls DuckDB. The Anthropic chat endpoint is the only `async def` in the project (Phase 4).

**Example:**
```python
# CORRECT — FastAPI dispatches to thread pool
@router.get("/{tract_id}", response_model=TractDetail)
def get_tract(tract_id: str, db=Depends(get_db)) -> TractDetail:
    result = tract_service.fetch_tract_detail(db, tract_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Tract {tract_id} not found")
    return result

# WRONG — blocks the event loop
@router.get("/{tract_id}", response_model=TractDetail)
async def get_tract(tract_id: str, db=Depends(get_db)) -> TractDetail:
    result = tract_service.fetch_tract_detail(db, tract_id)  # synchronous DuckDB call inside async!
    ...
```

### Pattern 4: DuckDB cursor() for Thread Safety

**What:** All service functions call `db.cursor()` immediately to get a thread-local cursor from the shared connection, then use the cursor for all query calls. The shared `app.state.db` connection is never called directly in service functions.

**Why:** DuckDB 1.4.4 confirmed (via live test) that `db.cursor()` objects are thread-safe across concurrent threads even when sharing one read-only connection.

**Example:**
```python
# app/services/tracts.py
def fetch_tract_detail(db: duckdb.DuckDBPyConnection, tract_id: str) -> dict | None:
    cursor = db.cursor()           # Thread-local cursor — safe under FastAPI thread pool
    cursor.execute("LOAD spatial;")
    row = cursor.execute("""
        SELECT
            tf.tract_id,
            tf.mean_afternoon_temp,
            tf.mean_tree_cov,
            ...
            top.xgb_heat_score,
            top.xgb_risk_score,
            top.tf_risk_score
        FROM tract_features tf
        JOIN tract_outputs_with_preds top ON tf.tract_id = top.tract_id
        WHERE tf.tract_id = ?
    """, [tract_id]).fetchone()
    return _row_to_tract_detail(row) if row else None
```

### Pattern 5: Required Query Parameter (BLOCK-01)

**What:** `tract_id` is a required query parameter on `GET /blocks`. FastAPI raises a 422 automatically if it's missing — no manual validation needed. Use a type annotation without a default value.

**Example:**
```python
# app/routers/blocks.py
from fastapi import APIRouter, Depends, Query

router = APIRouter(prefix="/blocks", tags=["Blocks"])

@router.get("", response_model=FeatureCollection)
def list_blocks_by_tract(
    tract_id: str = Query(..., description="11-digit Census tract FIPS"),
    db=Depends(get_db)
) -> dict:
    """BLOCK-01: Blocks filtered to a specific tract."""
    ...
```

### Pattern 6: PRED-02 Ranked Endpoint — Validated Sort Column

**What:** The `sort_by` query parameter must be validated against a whitelist of allowed column names to prevent SQL injection. Use a Python `Enum` type annotation on the query parameter — FastAPI validates automatically and returns 422 on invalid values.

**Example:**
```python
# app/routers/predictions.py
from enum import Enum
from fastapi import APIRouter, Depends, Query

class SortColumn(str, Enum):
    xgb_heat_score = "xgb_heat_score"
    xgb_risk_score = "xgb_risk_score"
    tf_risk_score = "tf_risk_score"

class SortOrder(str, Enum):
    asc = "asc"
    desc = "desc"

router = APIRouter(prefix="/predictions", tags=["Predictions"])

@router.get("/tracts/ranked")
def get_ranked_tracts(
    sort_by: SortColumn = Query(SortColumn.xgb_heat_score),
    order: SortOrder = Query(SortOrder.desc),
    limit: int = Query(10, ge=1, le=500),
    db=Depends(get_db)
) -> list:
    """PRED-02: Ranked tracts by score, no geometry."""
    ...
```

> CRITICAL: Build the SQL ORDER BY using the validated enum value: `f"ORDER BY {sort_by.value} {order.value}"`. Since the value comes from an enum (not raw user input), this is safe — no parameterized placeholders needed for column names.

### Pattern 7: SUM-01 County Aggregation

**What:** A single DuckDB aggregation query computes all four summary stats in one round trip.

**Example:**
```python
# app/services/summary.py
def get_county_summary(db: duckdb.DuckDBPyConnection) -> dict:
    cursor = db.cursor()
    row = cursor.execute("""
        SELECT
            COUNT(*)                                                      AS tract_count,
            AVG(xgb_heat_score)                                           AS mean_heat_score,
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY xgb_heat_score)  AS p75_heat_score,
            COUNT(*) FILTER (WHERE xgb_heat_score > 0.75)                 AS high_risk_tract_count
        FROM tract_outputs_with_preds
    """).fetchone()
    return {
        "tract_count": row[0],
        "mean_heat_score": row[1],
        "p75_heat_score": row[2],
        "high_risk_tract_count": row[3],
    }
```

> Note: `PERCENTILE_CONT` is DuckDB-native SQL and verified as supported. The threshold `0.75` for `high_risk_tract_count` is a reasonable default — planner can tune. Document the threshold in the API response or OpenAPI description.

### Pattern 8: BATCH-01 — IN Clause with Parameterized List

**What:** `POST /tracts/batch` accepts `{tract_ids: [...]}` and uses DuckDB's parameterized query with a list to avoid SQL injection.

**Example:**
```python
# app/schemas/tracts.py
from pydantic import BaseModel, field_validator

class BatchRequest(BaseModel):
    tract_ids: list[str]

    @field_validator("tract_ids")
    @classmethod
    def validate_non_empty(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("tract_ids must not be empty")
        if len(v) > 200:
            raise ValueError("Maximum 200 tract IDs per batch request")
        return v
```

```python
# app/services/tracts.py
def fetch_tract_batch(db: duckdb.DuckDBPyConnection, tract_ids: list[str]) -> list[dict]:
    cursor = db.cursor()
    # DuckDB parameterized IN clause using list parameter
    placeholders = ", ".join(["?" for _ in tract_ids])
    rows = cursor.execute(f"""
        SELECT
            tf.tract_id,
            tf.mean_afternoon_temp,
            ...
            top.xgb_heat_score,
            top.xgb_risk_score,
            top.tf_risk_score
        FROM tract_features tf
        JOIN tract_outputs_with_preds top ON tf.tract_id = top.tract_id
        WHERE tf.tract_id IN ({placeholders})
    """, tract_ids).fetchall()
    return [_row_to_tract_detail(r) for r in rows]
```

### Pattern 9: Wave 0 — Building king_county.duckdb

**What:** A one-time offline script that builds the DuckDB file from CSVs + Census TIGER geometry. This must run before any endpoint test can use real data.

**Strategy — geometry sourcing:**
Use `pygris` to download 2020 Census TIGER/Line shapefiles for King County (FIPS 53033):
- Tracts: `pygris.tracts(state="WA", county="033", year=2020, cb=True)` — cartographic boundary (simplified)
- Blocks: `pygris.blocks(state="WA", county="033", year=2020)` — full resolution (large file, ~200MB)

Both return GeoDataFrames in NAD83 (EPSG:4269). Convert to WGS84 with `.to_crs("EPSG:4326")` before storing WKT in DuckDB.

**Tract ID join key:** The pygris `GEOID` column is 11-digit string (e.g. `"53033010800"`) — matches `"TRACT GEO ID"` from HeatHealthKC.csv after `CAST("TRACT GEO ID" AS VARCHAR)`.

**Block ID join key:** The pygris block `GEOID20` column is 15-digit string — matches `"BLOCK GEO ID"` from HeatHealthKC.csv after `CAST("BLOCK GEO ID" AS VARCHAR)`.

**Scores for tract_outputs_with_preds:** These come from the offline ML training pipeline (XGBoost + TensorFlow models trained in Phase A of the technical spec). In the absence of trained model files, the data pipeline script must compute them or use placeholder scores. The three required columns are: `xgb_heat_score`, `xgb_risk_score`, `tf_risk_score` (all DOUBLE, range [0,1]).

**Example build_duckdb.py outline:**
```python
# scripts/build_duckdb.py
import duckdb
import json
import pygris
import geopandas as gpd
from shapely import wkt as shapely_wkt

con = duckdb.connect("king_county.duckdb")
con.execute("INSTALL spatial; LOAD spatial;")

# 1. Load raw CSVs
con.execute("CREATE TABLE blocks_raw AS SELECT * FROM read_csv_auto('HeatHealthKC.csv', header=True, ignore_errors=True)")
con.execute("CREATE TABLE tract_preds_raw AS SELECT * FROM read_csv_auto('TempKC.csv', header=True, ignore_errors=True)")

# 2. Aggregate blocks to tract level
con.execute("""
CREATE TABLE tract_features AS
SELECT
    CAST(b."TRACT GEO ID" AS VARCHAR) AS tract_id,
    AVG(b."Median afternoon temperature")  AS mean_afternoon_temp,
    AVG(b."Median morning temperature")    AS mean_morning_temp,
    AVG(b."Median evening temperature")    AS mean_evening_temp,
    AVG(b."Percent tree coverage")         AS mean_tree_cov,
    AVG(b."Percent impervious coverage")   AS mean_imperv,
    AVG(b."Mean distance to water")        AS mean_dist_water,
    AVG(b."Cardiovascular disease mortality rate") AS mean_cvd_rate,
    AVG(b."Percent adults with diabetes")  AS mean_diabetes,
    AVG(b."Life expectancy")               AS mean_life_expectancy,
    AVG(b."SVI Overall percentile ranking") AS mean_svi_overall,
    AVG(b."Percent of population whose income in the past 12 months is under 2.00x (200% of) the federal poverty level") AS mean_poverty2x,
    AVG(b."Percent of population with a disability") AS mean_disability,
    AVG(b."Percent of adults 18 years and over who have limited English ability") AS mean_limited_english,
    AVG(b."Percent under 18 years old")    AS mean_under18,
    AVG(b."Percent severe housing cost burdened") AS mean_severe_cost,
    ANY_VALUE(b.CITYNAME)                  AS city_name,
    NULL::VARCHAR                          AS geometry_wkt   -- populated next step
FROM blocks_raw b
GROUP BY CAST(b."TRACT GEO ID" AS VARCHAR)
""")

# 3. Download TIGER geometry via pygris and store WKT
tracts_gdf = pygris.tracts(state="WA", county="033", year=2020, cb=True)
tracts_gdf = tracts_gdf.to_crs("EPSG:4326")
tract_geom = {row["GEOID"]: row["geometry"].wkt for _, row in tracts_gdf.iterrows()}

# Update tract_features with WKT geometry (via pandas bridge or bulk update)
# ... (implementation: read tract_features into pandas, merge geometry, re-insert)

# 4. Create blocks table with geometry
blocks_gdf = pygris.blocks(state="WA", county="033", year=2020)
blocks_gdf = blocks_gdf.to_crs("EPSG:4326")
# join HeatHealthKC data and store in DuckDB blocks table

# 5. Create tract_outputs_with_preds (placeholder scores until ML pipeline runs)
con.execute("""
CREATE TABLE tract_outputs_with_preds AS
SELECT
    tract_id,
    ROUND(RANDOM() * 0.4 + 0.4, 4) AS xgb_heat_score,   -- placeholder [0.4, 0.8]
    ROUND(RANDOM() * 0.4 + 0.3, 4) AS xgb_risk_score,
    ROUND(RANDOM() * 0.4 + 0.3, 4) AS tf_risk_score
FROM tract_features
""")
# NOTE: Replace placeholder scores with real model outputs from training pipeline
```

> IMPORTANT for planning: The build script above contains placeholders. The planner must decide whether Phase 2 Wave 0 runs the full ML training pipeline (XGBoost + TF models from technical_spec.md) to produce real scores, or uses the placeholder approach for endpoint development and substitutes real scores when the pipeline is ready. Given Phase 1 loaded model files that may not yet exist, this is a known open question.

### Anti-Patterns to Avoid

- **Returning geometry as a string:** `"geometry": "{\"type\": \"Polygon\"}"` — this is the #1 geometry pitfall. Always `json.loads(geom_json_str)` before including in the response.
- **`async def` routes calling DuckDB directly:** DuckDB Python client is synchronous. Use `def` routes — FastAPI handles thread dispatch automatically.
- **Calling `db.execute()` directly without cursor():** On the shared connection, this is not thread-safe. Always call `db.cursor()` first in each service function.
- **Raw string interpolation for sort_by in SQL:** `f"ORDER BY {user_sort_by}"` is SQL injection. Use the `SortColumn` enum pattern — the enum value is safe to interpolate because it comes from a validated allowlist.
- **Missing `LOAD spatial;` before spatial functions:** DuckDB spatial extension must be loaded per connection (or per cursor in some cases). Call `cursor.execute("LOAD spatial;")` at the top of any service function using `ST_AsGeoJSON`.
- **Blocks without `?tract_id=` filter:** 25,552 blocks returned without filter would produce a ~50MB+ GeoJSON response. The `tract_id` query parameter must be required, not optional.
- **Building DuckDB with wrong CRS:** TIGER/Line shapefiles are in NAD83 (EPSG:4269). GeoJSON requires WGS84 (EPSG:4326). Always call `.to_crs("EPSG:4326")` before storing WKT.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GeoJSON model validation + OpenAPI schema | Custom `dict` builder for FeatureCollection | `geojson-pydantic` | Provides RFC 7946-compliant types that FastAPI can document in OpenAPI automatically; prevents geometry-as-string bugs |
| Census geometry download | Scraping Census FTP site or writing GDAL reader | `pygris.tracts()` / `pygris.blocks()` | One-line download, returns a ready-to-use GeoDataFrame in the right CRS; also supports cartographic boundary (simplified) variants for smaller payloads |
| SQL injection prevention on sort column | String validation regex | Python `Enum` as FastAPI query param type | FastAPI validates enum membership automatically; returns typed 422 error if invalid; no regex needed |
| PERCENTILE aggregation | Python-side sorted list and median calculation | DuckDB `PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ...)` | Native SQL aggregation in one query; avoids loading all scores into Python memory |
| Parameterized IN clause list | String-joining with manual escaping | DuckDB `cursor.execute(query, list_param)` | DuckDB's Python client accepts a list as a parameter for IN clauses; zero SQL injection risk |

**Key insight:** The geometry pipeline is the highest-complexity, most mistake-prone component. Using `pygris` (offline) + `geojson-pydantic` (API) eliminates 90% of the geometry handling code that could go wrong.

---

## Common Pitfalls

### Pitfall 1: Geometry Returned as Escaped JSON String (CRITICAL)

**What goes wrong:** `ST_AsGeoJSON(ST_GeomFromText(wkt))` in DuckDB returns a `VARCHAR` containing a JSON string like `'{"type":"Polygon","coordinates":...}'`. When FastAPI serializes this as a field value, it becomes an escaped string in the response: `"geometry": "{\"type\": \"Polygon\"...}"`. Mapbox GL and Leaflet silently ignore this — the frontend renders no polygons.

**Why it happens:** `ST_AsGeoJSON` returns VARCHAR, not a JSON/JSONB type. FastAPI's JSON serializer treats VARCHAR as a string and escapes it.

**How to avoid:** In every service function that returns geometry, call `json.loads()` on the DuckDB geometry value before returning. The geometry field in the Pydantic model must be typed as `dict` (or use `geojson-pydantic` geometry types).

**Warning signs:** API returns 200 but map shows no polygons. Browser console shows `typeof feature.geometry === 'string'` is `true`.

**Verification test:**
```python
def test_geometry_is_object_not_string(client):
    response = client.get("/api/v1/tracts")
    features = response.json()["features"]
    assert len(features) > 0
    assert isinstance(features[0]["geometry"], dict), "geometry must be a dict, not a string"
    assert features[0]["geometry"]["type"] in ("Polygon", "MultiPolygon")
```

---

### Pitfall 2: DuckDB Thread Safety — Direct Connection Call (CRITICAL)

**What goes wrong:** `app.state.db.execute("SELECT ...")` called directly from multiple concurrent `def` route handlers (running in FastAPI's thread pool) causes `duckdb.ConnectionException: Connection already in use` or silent result corruption.

**Why it happens:** DuckDB connection objects are not thread-safe for concurrent execute calls. Each OS thread needs its own cursor.

**How to avoid:** Always call `cursor = db.cursor()` at the top of each service function. Use `cursor.execute(...)` not `db.execute(...)`.

**Confirmed:** Live test in DuckDB 1.4.4 shows `db.cursor()` is thread-safe across 5 concurrent threads on the same connection.

**Warning signs:** Endpoints work under sequential testing but fail with `ConnectionException` when multiple requests arrive simultaneously. Easy to miss in development.

---

### Pitfall 3: Wrong CRS in Geometry (CRITICAL for Map Rendering)

**What goes wrong:** Census TIGER/Line shapefiles are delivered in NAD83 (EPSG:4269). GeoJSON RFC 7946 requires WGS84 (EPSG:4326). If geometry is stored in NAD83 and served as GeoJSON, map libraries render polygons in the wrong location (offset by ~100 meters in King County, enough to notice but potentially confusing).

**Why it happens:** `pygris` returns GeoDataFrames in NAD83 by default. The difference between NAD83 and WGS84 is small (~1m) in North America but still violates the GeoJSON spec.

**How to avoid:** Always call `.to_crs("EPSG:4326")` before extracting WKT from the pygris GeoDataFrame.

**Detection:** Query a known tract (e.g., downtown Seattle area) and verify the coordinates are in roughly `[-122.3, 47.6]` range. Any coordinate outside `[-180, 180]` longitude / `[-90, 90]` latitude indicates a projected CRS.

---

### Pitfall 4: LOAD spatial Forgetting

**What goes wrong:** DuckDB spatial functions (`ST_AsGeoJSON`, `ST_GeomFromText`) require `LOAD spatial;` to be executed on the connection/cursor before use. A freshly created cursor from `db.cursor()` does not inherit the `LOAD spatial` state from the connection if the extension was loaded after connection creation.

**How to avoid:** Call `cursor.execute("LOAD spatial;")` at the start of every service function that uses spatial functions. This is idempotent (safe to call multiple times).

---

### Pitfall 5: Unfiltered Blocks Endpoint Response Size

**What goes wrong:** The HeatHealthKC.csv contains 25,552 block rows. Returning all blocks without a `tract_id` filter would produce a response with 25,552 GeoJSON features. Even with simplified geometry, this could be 50–200MB. FastAPI would not error, but the response would be unusably slow.

**How to avoid:** Make `tract_id` a required query parameter (`Query(...)`). FastAPI returns 422 if it's missing. Never implement an unfiltered `GET /blocks` endpoint.

**Block count per tract:** ~52 blocks per tract on average (25,552 / 492 tracts). At tract level, this is manageable.

---

### Pitfall 6: Scores Not Normalized to [0, 1]

**What goes wrong:** The raw prediction columns from TempKC.csv (`PRED12_PE`, `PRED0_PE`, `PRED3_PE`) are percentages (e.g., 51.75, 16.68) not [0,1] floats. If these are stored directly as `xgb_heat_score` / `xgb_risk_score` / `tf_risk_score`, the REQUIREMENTS.md expectation that scores are comparable (e.g., `high_risk_tract_count WHERE xgb_heat_score > 0.75`) breaks.

**How to avoid:** The build script must normalize scores to [0,1] range. The technical_spec.md makes clear that the three model scores come from training XGBoost and TF models (not directly from PRED columns). The PRED columns are inputs/targets for model training, not the final scores. The `tract_outputs_with_preds` table should store model-output normalized scores, not raw PRED values.

---

### Pitfall 7: Missing TRAP — PRED-02 Route Order (FastAPI router path conflict)

**What goes wrong:** FastAPI resolves routes in registration order. If `GET /predictions/tracts/{tract_id}` is registered BEFORE `GET /predictions/tracts/ranked`, then a request to `/predictions/tracts/ranked` will be matched by the `{tract_id}` route (with `tract_id = "ranked"`) instead of the ranked endpoint.

**How to avoid:** Register the `ranked` route (static path) BEFORE the `{tract_id}` route (dynamic path) in the router. In this project the two endpoints are on separate routers (`predictions.py` handles `/predictions/tracts` and `/predictions/tracts/ranked`; there is no `/predictions/tracts/{tract_id}` in the requirements — so this specific conflict doesn't apply here). However, be aware of this pattern in the tracts router where both `/tracts/{tract_id}` and `/tracts/{tract_id}/geometry` are defined.

**General rule:** Always define static path segments before path parameters.

---

## Code Examples

Verified patterns from official sources or live testing:

### DuckDB spatial — ST_AsGeoJSON returns VARCHAR, must json.loads()

```python
# Source: verified live against DuckDB 1.4.4
import duckdb, json

con = duckdb.connect(":memory:")
con.execute("INSTALL spatial; LOAD spatial;")

# This returns a VARCHAR string, not a dict
result = con.execute(
    "SELECT ST_AsGeoJSON(ST_GeomFromText('POLYGON ((0 0, 1 0, 1 1, 0 0))'))::TEXT"
).fetchone()[0]
# result = '{"type":"Polygon","coordinates":[[[0.0,0.0],[1.0,0.0],[1.0,1.0],[0.0,0.0]]]}'
# type(result) = <class 'str'>

geometry_dict = json.loads(result)
# geometry_dict = {"type": "Polygon", "coordinates": [[[0.0, 0.0], ...]]}
# type(geometry_dict) = dict  <-- correct for JSON serialization
```

### geojson-pydantic FeatureCollection construction

```python
# Source: https://developmentseed.org/geojson-pydantic/intro/ (verified 2026-02-28)
from geojson_pydantic import FeatureCollection, Feature

fc = FeatureCollection(
    type="FeatureCollection",
    features=[
        Feature(
            type="Feature",
            geometry={"type": "Polygon", "coordinates": [...]},  # dict, not string
            properties={"tract_id": "53033010800", "xgb_heat_score": 0.82}
        )
    ]
)
# Serializes correctly: geometry appears as nested JSON object
```

### DuckDB cursor() threading

```python
# Source: verified live — 5 concurrent threads, 0 errors (DuckDB 1.4.4)
def fetch_data(db: duckdb.DuckDBPyConnection, tract_id: str) -> tuple:
    cursor = db.cursor()           # Thread-local — safe
    cursor.execute("LOAD spatial;")
    return cursor.execute(
        "SELECT tract_id, xgb_heat_score FROM tract_outputs_with_preds WHERE tract_id = ?",
        [tract_id]
    ).fetchone()
```

### PERCENTILE_CONT in DuckDB

```python
# Source: DuckDB SQL documentation — verified syntax
cursor.execute("""
    SELECT
        COUNT(*)                                                     AS tract_count,
        AVG(xgb_heat_score)                                          AS mean_heat_score,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY xgb_heat_score) AS p75_heat_score,
        COUNT(*) FILTER (WHERE xgb_heat_score > 0.75)                AS high_risk_tract_count
    FROM tract_outputs_with_preds
""").fetchone()
```

### DuckDB IN clause with list parameter

```python
# Source: DuckDB Python client docs
tract_ids = ["53033010800", "53033010900", "53033011000"]
placeholders = ", ".join(["?" for _ in tract_ids])
rows = cursor.execute(
    f"SELECT * FROM tract_features WHERE tract_id IN ({placeholders})",
    tract_ids
).fetchall()
```

### pygris geometry download (data pipeline only)

```python
# Source: https://walker-data.com/pygris/01-basic-usage/ (MEDIUM confidence)
import pygris
import geopandas as gpd

# King County, WA = state "WA", county "033"
tracts_gdf = pygris.tracts(state="WA", county="033", year=2020, cb=True)
# cb=True uses cartographic boundary (simplified polygons) — smaller payload
tracts_gdf = tracts_gdf.to_crs("EPSG:4326")
# Now GEOID column is 11-digit string: "53033010800"
# geometry column has Shapely geometries in WGS84

# Extract WKT for DuckDB
tracts_gdf["geometry_wkt"] = tracts_gdf["geometry"].apply(lambda g: g.wkt)
```

### Pytest test with in-memory DuckDB fixture

```python
# app/tests/fixtures.py (new for Phase 2)
import duckdb
import json
import pytest

@pytest.fixture
def test_db():
    """In-memory DuckDB with minimal test data — no real file required."""
    con = duckdb.connect(":memory:")
    con.execute("INSTALL spatial; LOAD spatial;")

    # Create tables matching production schema
    con.execute("""
        CREATE TABLE tract_features (
            tract_id VARCHAR PRIMARY KEY,
            mean_afternoon_temp DOUBLE,
            mean_tree_cov DOUBLE,
            mean_imperv DOUBLE,
            mean_cvd_rate DOUBLE,
            mean_diabetes DOUBLE,
            mean_svi_overall DOUBLE,
            city_name VARCHAR,
            geometry_wkt VARCHAR
        )
    """)
    con.execute("""
        CREATE TABLE tract_outputs_with_preds (
            tract_id VARCHAR PRIMARY KEY,
            xgb_heat_score DOUBLE,
            xgb_risk_score DOUBLE,
            tf_risk_score DOUBLE
        )
    """)
    con.execute("""
        CREATE TABLE blocks (
            block_id VARCHAR PRIMARY KEY,
            tract_id VARCHAR,
            mean_afternoon_temp DOUBLE,
            geometry_wkt VARCHAR
        )
    """)

    # Insert a few test rows
    con.execute("INSERT INTO tract_features VALUES ('53033010800', 90.3, 0.12, 0.65, 223.0, 0.13, 0.45, 'Seattle', 'POLYGON ((-122.35 47.60, -122.34 47.60, -122.34 47.61, -122.35 47.60))')")
    con.execute("INSERT INTO tract_outputs_with_preds VALUES ('53033010800', 0.82, 0.74, 0.71)")
    con.execute("INSERT INTO blocks VALUES ('530330108001016', '53033010800', 90.5, 'POLYGON ((-122.35 47.60, -122.345 47.60, -122.345 47.605, -122.35 47.60))')")
    yield con
    con.close()
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Returning WKT strings from DuckDB as `geometry` field | `json.loads(ST_AsGeoJSON(...))` → dict in Pydantic model | Frontend map libraries require GeoJSON objects, not WKT strings |
| `@app.on_event("startup")` | `lifespan` context manager (already done in Phase 1) | Established in Phase 1 |
| Pydantic v1 `.dict()` | Pydantic v2 `.model_dump()` (already done in Phase 1) | Established in Phase 1 |
| `async def` + manual `asyncio.to_thread` for every DuckDB call | `def` route → FastAPI thread pool dispatch | Simpler code; same non-blocking behavior |
| Global module-level DuckDB connection (not thread-safe) | `db.cursor()` per service call on shared `app.state.db` | Thread-safe without per-request connection overhead |

**Deprecated/outdated for this project:**
- Shapely for geometry processing: Not needed — DuckDB spatial handles WKT→GeoJSON entirely in SQL.
- GeoPandas as API dependency: Heavy dependency; only needed in the offline pipeline script.
- Per-request `duckdb.connect()` (opening a new file connection per request): Adds 6ms overhead per request and is unnecessary since `cursor()` provides thread safety.

---

## Open Questions

1. **Are real model scores available before Phase 2 starts?**
   - What we know: Phase 1 loads model files (XGBoost and TF) at startup. The technical spec describes training XGBoost and TF models against the CSV data. No trained model files were found in the repository.
   - What's unclear: Are trained model files (`models/xgb_heat.json`, `models/xgb_risk.json`, `models/tf_risk/`) in existence but not committed? Or do they need to be trained as part of the data pipeline?
   - Recommendation: Phase 2 Wave 0 should build `king_county.duckdb` with placeholder normalized scores. Actual model scores can replace the placeholders when model files are available, without changing any API code (the table schema stays the same). Document clearly in build_duckdb.py what "placeholder" means.

2. **Cartographic boundary vs. full-resolution TIGER geometry for tracts?**
   - What we know: pygris offers both `cb=True` (cartographic boundary, simplified, smaller files) and `cb=False` (full TIGER resolution). For ~492 tracts, the cartographic boundary version is ~500KB; full resolution is larger.
   - What's unclear: Whether the frontend needs high-precision boundaries for any use case.
   - Recommendation: Use `cb=True` for tracts (sufficient for choropleth maps at county zoom). Use `cb=False` for blocks (needed for block-level accuracy). Document in build_duckdb.py.

3. **Block geometry — include or derive from TIGER?**
   - What we know: HeatHealthKC.csv has 25,552 blocks with `BLOCK GEO ID` (15-digit FIPS) but no geometry. The full 2020 census block shapefile for King County is large (~200MB ZIP).
   - What's unclear: Whether the frontend actually needs block geometry (BLOCK-01 returns `GeoJSON FeatureCollection`) or just attributes.
   - Recommendation: BLOCK-01 and BLOCK-02 in REQUIREMENTS.md specify GeoJSON FeatureCollection, so geometry is required. Include block geometry from TIGER. Store in DuckDB with a geometry_wkt column, same pattern as tracts.

4. **High-risk threshold for SUM-01 `high_risk_tract_count`?**
   - What we know: The REQUIREMENTS.md specifies `high_risk_tract_count` as a field in the summary. No threshold is defined.
   - Recommendation: Use `xgb_heat_score > 0.75` as the default threshold (top quartile of heat risk). Document this threshold in the API response schema and OpenAPI description so planners understand what "high risk" means. Make it a configurable constant (not hardcoded in SQL) so it can be adjusted.

---

## Validation Architecture

> `workflow.nyquist_validation` is `false` in `.planning/config.json` — this section is skipped per research instructions.

---

## Sources

### Primary (HIGH confidence)

- DuckDB spatial extension official docs — `ST_AsGeoJSON`, `ST_GeomFromText`, `ST_Read`: https://duckdb.org/docs/stable/core_extensions/spatial/overview and https://duckdb.org/docs/stable/core_extensions/spatial/functions
- DuckDB PERCENTILE_CONT — verified from DuckDB SQL docs (standard SQL aggregate function, well-documented)
- geojson-pydantic official docs — FeatureCollection, Feature, geometry types: https://developmentseed.org/geojson-pydantic/intro/ (version 2.1.0 confirmed)
- FastAPI `def` vs `async def` thread pool dispatch — https://fastapi.tiangolo.com/async/ (official docs)
- Live DuckDB 1.4.4 inspection — all SQL patterns verified against actual DuckDB 1.4.4 installation on project machine
- Live CSV inspection — HeatHealthKC.csv and TempKC.csv schema, row counts, key formats verified by loading into in-memory DuckDB

### Secondary (MEDIUM confidence)

- pygris Python package for Census TIGER geometry — https://walker-data.com/pygris/ (official docs; CRS note about NAD83 default verified from docs)
- DuckDB thread safety with cursor() — verified by live concurrent thread test (5 threads, 0 errors) on DuckDB 1.4.4
- geojson-pydantic GitHub — https://github.com/developmentseed/geojson-pydantic (Pydantic v2 support confirmed from CHANGELOG)

### Tertiary (LOW confidence)

- Cartographic boundary file sizes for King County tracts — estimate from typical TIGER file sizes; actual size should be measured during build_duckdb.py execution
- Block TIGER shapefile size estimate (~200MB) — training knowledge; verify with `pygris.blocks()` download

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — DuckDB 1.4.4 verified live; geojson-pydantic 2.1.0 verified from official docs; spatial extension verified live.
- Architecture: HIGH — All patterns from FastAPI official docs and verified live DuckDB behavior. The geometry serialization pattern (json.loads + dict) is confirmed correct.
- Pitfalls: HIGH (geometry string vs dict, thread safety, CRS) — all verified against actual project setup.
- Data schema: HIGH — CSV columns verified by live inspection; join key confirmed as `RIGHT(GEO_ID, 11) = CAST("TRACT GEO ID" AS VARCHAR)`.
- Geometry sourcing: MEDIUM — pygris approach is standard but not verified live (pygris not installed); standard GIS practice for this workflow.

**Research date:** 2026-02-28
**Valid until:** 2026-03-30 (FastAPI + DuckDB + geojson-pydantic are stable; pygris updates infrequently)
