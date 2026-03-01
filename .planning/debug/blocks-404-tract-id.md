---
status: diagnosed
trigger: "GET /api/v1/blocks?tract_id=53033010800 returns HTTP 404 instead of GeoJSON FeatureCollection"
created: 2026-02-28T00:00:00Z
updated: 2026-02-28T00:00:00Z
---

## Current Focus

hypothesis: blocks.router is never registered in main.py — the route literally does not exist in the running app
test: read app/main.py include_router calls
expecting: confirmed — line 120 has the include_router call commented out
next_action: DONE — root cause confirmed

## Symptoms

expected: GET /api/v1/blocks?tract_id=53033010800 returns HTTP 200 with GeoJSON FeatureCollection
actual: HTTP 404 {"error": "HTTPException", "detail": "Not Found", "status_code": 404}
errors: 404 Not Found from FastAPI's default handler (no matching route)
reproduction: curl http://localhost:8000/api/v1/blocks?tract_id=53033010800
started: always — route was never wired

## Eliminated

- hypothesis: blocks table missing from DuckDB
  evidence: build_duckdb.py Step 5 explicitly creates the `blocks` table with 25,552 rows; king_county.duckdb exists at project root
  timestamp: 2026-02-28T00:00:00Z

- hypothesis: blocks router file missing or broken
  evidence: app/routers/blocks.py exists, defines router with correct GET "" and GET "/{block_id}" endpoints, imports are valid
  timestamp: 2026-02-28T00:00:00Z

- hypothesis: blocks service file missing or broken
  evidence: app/services/blocks.py exists, implements get_blocks_by_tract and get_block_detail with correct DuckDB queries
  timestamp: 2026-02-28T00:00:00Z

## Evidence

- timestamp: 2026-02-28T00:00:00Z
  checked: app/main.py lines 16 and 114-122
  found: |
    Line 16: `from app.routers import health, tracts, predictions, summary`
    blocks is NOT imported.
    Lines 119-120:
      # Plan 02-04 (blocks) wired here when blocks.py is available:
      # app.include_router(blocks.router, prefix="/api/v1")
    The include_router call is commented out. blocks router is imported nowhere and registered nowhere.
  implication: FastAPI has zero knowledge of /blocks routes — every request to /api/v1/blocks hits the default 404 handler

- timestamp: 2026-02-28T00:00:00Z
  checked: app/routers/blocks.py
  found: router defined as APIRouter(prefix="/blocks", tags=["Blocks"]); two endpoints present and correct
  implication: the router implementation is complete and correct; only wiring is missing

- timestamp: 2026-02-28T00:00:00Z
  checked: app/services/blocks.py
  found: get_blocks_by_tract queries `blocks` table with ST_AsGeoJSON; get_block_detail queries scalar columns
  implication: service layer is complete; depends on `blocks` table existing in DuckDB

- timestamp: 2026-02-28T00:00:00Z
  checked: scripts/build_duckdb.py Step 5 (lines 190-233)
  found: blocks table created from HeatHealthKC.csv joined with TIGER block geometry; 25,552 rows expected
  implication: database schema supports the query; king_county.duckdb exists at project root confirming build was run

## Resolution

root_cause: |
  app/main.py never imports or registers blocks.router.
  The import on line 16 lists only `health, tracts, predictions, summary`.
  The include_router call on line 120 is commented out with a TODO comment.
  FastAPI routes are only discoverable through include_router — any path not registered returns 404.
  The router, service, and database table are all fully implemented; only the two-line wiring in main.py is missing.

fix: |
  1. Add `blocks` to the import on line 16:
     from app.routers import health, tracts, predictions, summary, blocks
  2. Uncomment line 120:
     app.include_router(blocks.router, prefix="/api/v1")

verification: not yet applied — diagnose-only mode
files_changed: []
