---
phase: 02-data-endpoints
plan: "03"
subsystem: api
tags: [duckdb, geojson, fastapi, spatial, tracts, pydantic, pytest]

# Dependency graph
requires:
  - phase: 02-data-endpoints/02-02
    provides: TractDetail, TractProperties, BatchRequest Pydantic schemas and test_db fixture

provides:
  - DuckDB service functions for tract data (get_all_tracts, get_tract_detail, get_tract_geometry, get_batch_tracts) in app/services/tracts.py
  - FastAPI router with 4 tract routes (POST /batch before GET /{tract_id} for static-path priority) in app/routers/tracts.py
  - 17 pytest tests covering TRACT-01, TRACT-02, TRACT-03, BATCH-01 in tests/test_tracts.py
  - tracts router wired into app/main.py under /api/v1 prefix

affects:
  - 02-04 (blocks endpoints — same DuckDB cursor pattern, spatial LOAD pattern)
  - 02-05 (canonical main.py writer — will include all routers including tracts)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "db.cursor() per function for DuckDB thread safety under FastAPI thread pool"
    - "LOAD spatial per cursor before any ST_* call"
    - "json.loads() on ST_AsGeoJSON() output — function returns VARCHAR not dict"
    - "Static POST /batch registered before dynamic GET /{tract_id} to prevent path conflict"
    - "All route handlers are def not async def — dispatched to thread pool automatically"
    - "_safe_errors() helper to stringify Pydantic v2 ctx values before JSON serialization"

key-files:
  created:
    - app/services/__init__.py
    - app/services/tracts.py
    - app/routers/tracts.py
    - tests/test_tracts.py
  modified:
    - app/main.py

key-decisions:
  - "All DuckDB service functions use db.cursor() (not db.execute()) for thread safety — required for concurrent def route handlers sharing one connection"
  - "ST_AsGeoJSON() returns VARCHAR — json.loads() always called before injecting geometry into response to prevent escaped-string geometry that map libraries reject"
  - "POST /batch registered before GET /{tract_id} in router to prevent FastAPI treating 'batch' as a tract_id path parameter"
  - "validation_exception_handler _safe_errors() helper: Pydantic v2 exc.errors() ctx can contain ValueError objects; stringify ctx values to avoid TypeError in JSONResponse"

patterns-established:
  - "Service-router split: DuckDB queries in app/services/*.py, FastAPI route handlers in app/routers/*.py — service functions return raw dicts, routers apply response_model"
  - "Spatial cursor pattern: cursor = db.cursor(); cursor.execute('LOAD spatial;') before any ST_* query"
  - "Geometry safety: json.loads(ST_AsGeoJSON result) always applied — documented in docstring of each function"

requirements-completed:
  - TRACT-01
  - TRACT-02
  - TRACT-03
  - BATCH-01

# Metrics
duration: 3min
completed: 2026-02-28
---

# Phase 2 Plan 03: Tract Data Endpoints Summary

**DuckDB spatial service layer (db.cursor() thread-safe) and FastAPI tract router (4 routes, correct static-path order) with 17 passing pytest tests covering TRACT-01 through BATCH-01**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-28T23:16:14Z
- **Completed:** 2026-02-28T23:20:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created `app/services/tracts.py` with four DuckDB query functions, all using `db.cursor()` for thread safety and `json.loads()` on `ST_AsGeoJSON()` output to prevent escaped-string geometry bugs
- Created `app/routers/tracts.py` with 4 routes in correct order (POST /batch before GET /{tract_id}) and all handlers as `def` for thread-pool dispatch
- Wrote 17 tests in `tests/test_tracts.py` covering all four requirements including the critical geometry-as-dict assertion, 404 on unknown tract, geometry-only response (no feature vector), and batch partial-match behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Create tract service and router** - `299d949` (feat)
2. **Task 2: Write pytest tests for TRACT-01, TRACT-02, TRACT-03, BATCH-01** - `bc784ac` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `app/services/__init__.py` - Empty package init making services/ a Python package
- `app/services/tracts.py` - Four DuckDB query functions with cursor-per-call pattern, spatial LOAD, and json.loads geometry
- `app/routers/tracts.py` - FastAPI router: POST /batch, GET /, GET /{tract_id}, GET /{tract_id}/geometry — all def handlers
- `tests/test_tracts.py` - 17 pytest tests using test_db fixture injected via app.state.db
- `app/main.py` - Added tracts router import and include_router; fixed validation_exception_handler to stringify Pydantic v2 ctx values

## Decisions Made

- `db.cursor()` called inside every service function (not once at connection time) — required for thread safety when FastAPI dispatches synchronous `def` handlers to its thread pool concurrently
- `json.loads()` applied to every `ST_AsGeoJSON()` result — the function returns a VARCHAR string; injecting it directly into the response dict produces escaped-string geometry that Leaflet/MapLibre silently reject
- POST `/batch` registered before GET `/{tract_id}` in the router — FastAPI matches routes in registration order, and without this ordering, "batch" would be captured as a tract_id path parameter

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wire tracts router into app/main.py to enable TestClient route resolution**
- **Found during:** Task 2 (writing tests)
- **Issue:** `tests/test_tracts.py` creates TestClient from `app.main.app`; without `include_router(tracts.router)` all tract routes return 404
- **Fix:** Added `from app.routers import tracts` and `app.include_router(tracts.router, prefix="/api/v1")` to main.py (Plan 02-05 will do a full clean rewrite with all routers)
- **Files modified:** `app/main.py`
- **Verification:** TestClient resolves all four tract routes in test runs
- **Committed in:** bc784ac (Task 2 commit)

**2. [Rule 1 - Bug] Fix validation_exception_handler: Pydantic v2 ctx contains non-JSON-serializable ValueError**
- **Found during:** Task 2 — `test_empty_tract_ids_returns_422` failed with `TypeError: Object of type ValueError is not JSON serializable`
- **Issue:** `exc.errors()` from Pydantic v2 includes `ctx: {'error': ValueError(...)}` — `JSONResponse` cannot serialize the `ValueError` object
- **Fix:** Added `_safe_errors()` helper that copies each error dict and stringifies all values in `ctx`; also strips Pydantic URL noise from error output
- **Files modified:** `app/main.py`
- **Verification:** `test_empty_tract_ids_returns_422` passes; full test suite 17/17 green
- **Committed in:** bc784ac (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes required for test correctness. Tracts router wiring is a subset of what Plan 02-05 will do canonically — no scope creep. Validation handler fix corrects a pre-existing bug exposed by the 422 test.

## Issues Encountered

None beyond the two auto-fixed deviations documented above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `app/services/tracts.py` DuckDB cursor + spatial pattern is the template for Plans 02-04 (blocks) and 02-05 (predictions/summary)
- All 17 tract endpoint tests pass — TRACT-01, TRACT-02, TRACT-03, BATCH-01 verified against in-memory DuckDB fixture
- Plan 02-05 (canonical main.py writer) will include all routers cleanly; current tracts-only wiring is intentional and non-breaking

---
*Phase: 02-data-endpoints*
*Completed: 2026-02-28*

## Self-Check: PASSED

- FOUND: app/services/__init__.py
- FOUND: app/services/tracts.py
- FOUND: app/routers/tracts.py
- FOUND: tests/test_tracts.py
- FOUND: .planning/phases/02-data-endpoints/02-03-SUMMARY.md
- FOUND commit: 299d949 (Task 1 — service and router)
- FOUND commit: bc784ac (Task 2 — tests + main.py fixes)
