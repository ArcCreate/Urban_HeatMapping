---
phase: 02-data-endpoints
plan: "01"
subsystem: database
tags: [duckdb, pygris, geopandas, tiger, census, geometry, wkt, geojson, spatial]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: FastAPI app structure, DuckDB connection infrastructure, project root layout
provides:
  - king_county.duckdb with tract_features (492 rows, geometry_wkt in WGS84), tract_outputs_with_preds (492 rows, placeholder XGBoost/TF scores in [0,1]), and blocks (25,552 rows, geometry_wkt in WGS84)
  - scripts/build_duckdb.py: offline pipeline that regenerates king_county.duckdb from CSVs + TIGER geometry
  - scripts/requirements-pipeline.txt: pipeline-only deps (pygris, geopandas, shapely) kept separate from app requirements
affects:
  - 02-data-endpoints (plans 02, 03, 04, 05 — all endpoints query the tables built here)
  - 03-simulation (what-if engine reads tract_features columns produced here)
  - 04-chat (chat endpoint may reference tract data from these tables)

# Tech tracking
tech-stack:
  added: [pygris>=0.1.7, geopandas>=1.1.2, shapely>=2.1.2, pyogrio, pyproj]
  patterns:
    - Pipeline deps in scripts/requirements-pipeline.txt — NOT in main requirements.txt
    - Census TIGER geometry downloaded via pygris (cartographic boundary cb=True for tracts, full boundary for blocks)
    - WKT geometry stored as VARCHAR in DuckDB — ST_GeomFromText used at query time to avoid DuckDB GEOMETRY type compatibility issues
    - Block-to-tract aggregation via GROUP BY on TRACT GEO ID, joined to TempKC.csv via RIGHT(GEO_ID, 11)
    - Placeholder model scores derived from PRED0_PE/PRED12_PE/PRED3_PE normalized to [0,1] by dividing by 100

key-files:
  created:
    - scripts/build_duckdb.py
    - scripts/requirements-pipeline.txt
  modified: []

key-decisions:
  - "Pipeline deps (pygris, geopandas, shapely) kept in scripts/requirements-pipeline.txt only — not added to main requirements.txt to avoid bloating the FastAPI app image"
  - "WKT stored as VARCHAR in DuckDB geometry_wkt column — converted via ST_GeomFromText at query time rather than native GEOMETRY type"
  - "Placeholder model scores derived from PRED columns in TempKC.csv (normalized /100) — all 492 tracts matched, 0 fallbacks needed"
  - "100% block geometry match achieved (25,552 / 25,552) — GEOID20 from pygris blocks matches BLOCK GEO ID from HeatHealthKC.csv exactly"

patterns-established:
  - "Offline pipeline pattern: scripts/ directory for data pipeline scripts, separate requirements file"
  - "WKT geometry storage pattern: VARCHAR column + ST_GeomFromText() at query time"
  - "Tract aggregation pattern: AVG() across block-level features grouped by TRACT GEO ID"

requirements-completed: [TRACT-01, TRACT-02, TRACT-03, BLOCK-01, BLOCK-02, PRED-01, PRED-02, SUM-01, BATCH-01]

# Metrics
duration: 3min
completed: 2026-02-28
---

# Phase 2 Plan 01: Build DuckDB from TIGER Geometry + CSV Data

**Offline pipeline (build_duckdb.py) producing king_county.duckdb with 492 tracts + 25,552 blocks in WGS84 WKT, XGBoost/TF placeholder scores in [0,1], and DuckDB spatial extension verified**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-28T23:02:11Z
- **Completed:** 2026-02-28T23:05:28Z
- **Tasks:** 2
- **Files modified:** 2 created (scripts/build_duckdb.py, scripts/requirements-pipeline.txt); 1 generated artifact (king_county.duckdb, gitignored)

## Accomplishments
- Created offline DuckDB pipeline script that fetches Census TIGER/Line geometry via pygris and merges it with HeatHealthKC.csv (25,552 block rows) and TempKC.csv (495 tract rows)
- Built king_county.duckdb (35 MB) with 3 queryable tables: tract_features (492 rows, all geometry matched), tract_outputs_with_preds (492 rows, scores in [0.081, 0.564] range), and blocks (25,552 rows, 100% geometry match)
- Verified DuckDB spatial extension can execute ST_AsGeoJSON(ST_GeomFromText(geometry_wkt)) on both tract and block geometries without errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create pipeline requirements and build_duckdb.py script** - `0ccd4f6` (feat)
2. **Task 2: Install pipeline deps and run build_duckdb.py** - No separate commit (king_county.duckdb is gitignored per .gitignore `*.duckdb`; artifact exists on disk)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `scripts/build_duckdb.py` - Offline pipeline: loads CSVs, downloads TIGER tract/block geometry via pygris, aggregates to tract level, creates placeholder scores, writes all tables to king_county.duckdb
- `scripts/requirements-pipeline.txt` - Pipeline-only deps: pygris>=0.1.7, geopandas>=0.14, shapely>=2.0

## Decisions Made
- Pipeline deps kept in `scripts/requirements-pipeline.txt` — separate from `requirements.txt` to avoid adding ~50MB of geospatial libs to the FastAPI app environment
- WKT stored as VARCHAR (not native DuckDB GEOMETRY type) so geometry_wkt can be safely loaded and converted via ST_GeomFromText at query time in the API endpoints
- Placeholder scores derived by normalizing PRED0_PE/PRED12_PE/PRED3_PE columns from TempKC.csv by dividing by 100; all 492 tracts matched via RIGHT(GEO_ID, 11) join key — no fallback (0.5) values needed

## Deviations from Plan

None - plan executed exactly as written.

The one noted concern from STATE.md ("geometry CRS and actual table/column names must be verified against the real file before writing DuckDB queries") was resolved during execution: all 492 tract geometries matched and all 25,552 block geometries matched — GEOID formats align perfectly between pygris output and the CSV data.

## Issues Encountered
- `conda run -n urban-heatmap pip install` resolved to system Python 3.13 pip rather than the conda env's Python 3.12 pip. Fixed by using `/opt/anaconda3/envs/urban-heatmap/bin/pip` directly to ensure deps installed into the correct Python 3.12 environment.

## User Setup Required
None - no external service configuration required. The pipeline runs offline using Census TIGER data downloaded via pygris.

## Next Phase Readiness
- `king_county.duckdb` is present at project root and validated
- All three tables (tract_features, tract_outputs_with_preds, blocks) are ready for the data endpoint plans (02-02 through 02-05)
- WKT geometry confirmed working with DuckDB spatial extension for GeoJSON serialization
- The blocker from STATE.md ("geometry CRS and actual table/column names must be verified") is now resolved

---
*Phase: 02-data-endpoints*
*Completed: 2026-02-28*

## Self-Check: PASSED

- scripts/build_duckdb.py: FOUND
- scripts/requirements-pipeline.txt: FOUND
- king_county.duckdb (on disk, gitignored): FOUND
- 02-01-SUMMARY.md: FOUND
- Commit 0ccd4f6: FOUND
