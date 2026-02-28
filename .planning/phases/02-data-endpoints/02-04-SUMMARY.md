---
phase: 02-data-endpoints
plan: "04"
subsystem: api
tags: [duckdb, geojson, fastapi, blocks, spatial, pytest, geojson-pydantic]

# Dependency graph
requires:
  - phase: 02-data-endpoints/02-02
    provides: BlockDetail, BlockProperties Pydantic schemas and test_db in-memory DuckDB fixture

provides:
  - get_blocks_by_tract DuckDB query function — returns GeoJSON Feature list filtered by tract_id (app/services/blocks.py)
  - get_block_detail DuckDB query function — returns typed block detail dict or None (app/services/blocks.py)
  - FastAPI router for GET /blocks (required tract_id Query param) and GET /blocks/{block_id} (app/routers/blocks.py)
  - 11 pytest tests covering BLOCK-01 (GeoJSON FeatureCollection) and BLOCK-02 (typed detail + 404) (tests/test_blocks.py)

affects:
  - 02-05 (canonical main.py writer — will wire blocks router alongside tracts, predictions, summary)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Required Query param pattern for safety-critical filters — tract_id must be present or FastAPI auto-returns 422
    - db.cursor() for thread safety — service functions never call db.execute() directly
    - ST_AsGeoJSON returns VARCHAR; always json.loads() before injecting geometry into response dict
    - Pre-02-05 test compat — test file self-registers router into app if not already wired

key-files:
  created:
    - app/services/blocks.py
    - app/routers/blocks.py
    - tests/test_blocks.py
  modified: []

key-decisions:
  - "tract_id is a required Query param (Query(...)) — FastAPI returns 422 on missing param, preventing 25,552-row unfiltered query (~50MB+)"
  - "get_block_detail does not return geometry — BLOCK-02 is a typed JSON detail endpoint, not GeoJSON"
  - "test_blocks.py self-registers blocks router into app if not already wired — allows tests to pass before Plan 02-05 runs"

patterns-established:
  - "Required-param safety gate: Query(...) with no default makes missing param a 422 FastAPI validation error — enforces filter at the HTTP layer"
  - "Spatial-only in list endpoint: geometry included in list (BLOCK-01), excluded from detail (BLOCK-02) — mirrors tract pattern from 02-03"

requirements-completed:
  - BLOCK-01
  - BLOCK-02

# Metrics
duration: 2min
completed: 2026-02-28
---

# Phase 2 Plan 04: Block Data Endpoints Summary

**DuckDB spatial query functions and FastAPI router for 25,552-block dataset — tract_id required Query param prevents 50MB+ unfiltered responses; geometry parsed from VARCHAR via json.loads()**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-28T23:16:20Z
- **Completed:** 2026-02-28T23:18:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Implemented `get_blocks_by_tract` and `get_block_detail` DuckDB service functions with correct cursor-based thread safety, spatial extension loading, and json.loads() on ST_AsGeoJSON VARCHAR output
- Created blocks FastAPI router with GET /blocks (tract_id required Query param — 422 on miss) and GET /blocks/{block_id} (404 on unknown ID) — both plain `def` handlers for thread-pool dispatch
- All 11 pytest tests pass using in-memory test_db fixture with 3 test blocks across 2 tracts — no king_county.duckdb dependency

## Task Commits

Each task was committed atomically:

1. **Task 1: Create block service and router** - `e2f4346` (feat)
2. **Task 2: Write pytest tests for BLOCK-01 and BLOCK-02** - `186b14c` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `app/services/blocks.py` - `get_blocks_by_tract` (LOAD spatial, ST_AsGeoJSON, json.loads() geometry, ordered by block_id) and `get_block_detail` (typed dict or None, no geometry)
- `app/routers/blocks.py` - GET /blocks (FeatureCollection, tract_id required Query param) and GET /blocks/{block_id} (BlockDetail, 404 on miss); both def not async def
- `tests/test_blocks.py` - 11 tests: BLOCK-01 (200, 422, FeatureCollection, 2-block count, geometry-as-dict, required props, empty for unknown tract) and BLOCK-02 (200, 404, required fields, no geometry in detail)

## Decisions Made

- `tract_id` is a required `Query(...)` parameter with no default — FastAPI auto-validates and returns 422 if omitted, enforcing the safety constraint at the HTTP layer rather than in service code
- `get_block_detail` deliberately omits geometry — BLOCK-02 is a typed JSON detail endpoint; clients wanting geometry use the list endpoint with a specific tract filter
- `test_blocks.py` self-registers the blocks router into `app` if not already wired, allowing tests to pass before Plan 02-05 (the canonical main.py writer) runs

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Self-register blocks router in test file for pre-02-05 compatibility**
- **Found during:** Task 2 (test verification)
- **Issue:** `tests/test_blocks.py` imports `from app.main import app` and calls `/api/v1/blocks*` routes. Since Plan 02-05 is the canonical main.py writer, blocks router is not yet registered, causing all route tests to return 404.
- **Fix:** Added idempotent `app.include_router(blocks_router_module.router, prefix="/api/v1")` call at module level in test file — only registers if `/api/v1/blocks` routes are not already present, so it's a no-op after Plan 02-05 runs.
- **Files modified:** tests/test_blocks.py
- **Verification:** All 11 tests pass (pytest exit code 0)
- **Committed in:** `186b14c` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix necessary for tests to pass before Plan 02-05 wires main.py. Idempotent — no duplicate registration after 02-05 runs. No scope creep.

## Issues Encountered

The plan verification step expects `pytest tests/test_blocks.py` to pass immediately, but the plan also explicitly prohibits modifying `app/main.py` (reserved for Plan 02-05). These two constraints are in tension for Wave 3 plans that run before 02-05. The fix — self-registering the router in the test module — is idempotent and does not violate the main.py constraint.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `app/services/blocks.py` and `app/routers/blocks.py` are ready for Plan 02-05 to wire via `app.include_router(blocks.router, prefix="/api/v1")`
- `tests/test_blocks.py` passes standalone and will continue to pass after 02-05 wires main.py (self-registration is idempotent)
- All BLOCK-01 and BLOCK-02 requirements satisfied

---
*Phase: 02-data-endpoints*
*Completed: 2026-02-28*
