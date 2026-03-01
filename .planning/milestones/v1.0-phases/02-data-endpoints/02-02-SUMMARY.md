---
phase: 02-data-endpoints
plan: "02"
subsystem: api
tags: [pydantic, duckdb, geojson, testing, schemas, fixtures]

# Dependency graph
requires:
  - phase: 02-data-endpoints/02-01
    provides: DuckDB table schema (tract_features, tract_outputs_with_preds, blocks) and column names used in schemas

provides:
  - TractDetail, TractProperties, BatchRequest Pydantic models (app/schemas/tracts.py)
  - BlockDetail, BlockProperties Pydantic models (app/schemas/blocks.py)
  - TractPrediction, RankedTract, SortColumn, SortOrder Pydantic models/enums (app/schemas/predictions.py)
  - CountySummary Pydantic model (app/schemas/summary.py)
  - test_db pytest fixture with in-memory DuckDB seeded with 2 tracts and 3 blocks (tests/fixtures.py)

affects:
  - 02-03 (tract endpoints — TractDetail, TractProperties, BatchRequest contracts)
  - 02-04 (block endpoints — BlockDetail, BlockProperties contracts)
  - 02-05 (prediction/summary endpoints — TractPrediction, RankedTract, SortColumn, SortOrder, CountySummary contracts)

# Tech tracking
tech-stack:
  added:
    - geojson-pydantic==2.1.0
  patterns:
    - Interface-first schema definition before service implementation
    - SortColumn/SortOrder enums for SQL injection prevention in sort parameters
    - In-memory DuckDB fixture pattern — no file dependency for tests
    - float | None = None for optional feature columns in Pydantic models

key-files:
  created:
    - app/schemas/tracts.py
    - app/schemas/blocks.py
    - app/schemas/predictions.py
    - app/schemas/summary.py
    - tests/fixtures.py
  modified:
    - requirements.txt

key-decisions:
  - "BatchRequest validates non-empty list and enforces max 200 items — prevents unbounded queries"
  - "SortColumn enum restricts sort_by parameter to known column names — prevents SQL injection without parameterized sort columns"
  - "test_db fixture uses in-memory DuckDB with INSTALL/LOAD spatial — mirrors production spatial extension behavior without king_county.duckdb file"

patterns-established:
  - "Schema-first: All Pydantic types defined before service/route implementation so Plans 03-05 have exact field names"
  - "Enum-guarded sort: SortColumn/SortOrder enums used as query parameter types in prediction endpoints"
  - "Shared fixture import: from tests.fixtures import test_db in each test file"

requirements-completed:
  - TRACT-01
  - TRACT-02
  - TRACT-03
  - BLOCK-01
  - BLOCK-02
  - PRED-01
  - PRED-02
  - SUM-01
  - BATCH-01

# Metrics
duration: 5min
completed: 2026-02-28
---

# Phase 2 Plan 02: Pydantic Schemas and Shared Test Fixture Summary

**Typed Pydantic contracts for all 9 data endpoint requirements plus an in-memory DuckDB pytest fixture seeding 2 tracts and 3 blocks — eliminating field-name guesswork from Plans 03-05**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-28T23:08:17Z
- **Completed:** 2026-02-28T23:13:17Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Defined all Pydantic response/request schemas covering TRACT-01 through BATCH-01 requirements, establishing the type contracts that Plans 03-05 implement against
- Created `tests/fixtures.py` with a `test_db` pytest fixture that spins up an in-memory DuckDB with the production table schema, avoiding any dependency on the `king_county.duckdb` file during tests
- Added `geojson-pydantic==2.1.0` to `requirements.txt` and installed it into the conda env for RFC 7946-compliant GeoJSON model support

## Task Commits

Each task was committed atomically:

1. **Task 1: Add geojson-pydantic and create all Pydantic schemas** - `8de048f` (feat)
2. **Task 2: Create shared pytest fixture with in-memory DuckDB test data** - `a1c9f18` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `app/schemas/tracts.py` - TractDetail (full feature vector + 3 model scores), TractProperties (GeoJSON properties), BatchRequest (with empty/201 validation)
- `app/schemas/blocks.py` - BlockDetail (all block columns), BlockProperties (GeoJSON properties)
- `app/schemas/predictions.py` - TractPrediction, RankedTract, SortColumn enum, SortOrder enum
- `app/schemas/summary.py` - CountySummary (tract_count, mean/p75 heat_score, high_risk_tract_count)
- `tests/fixtures.py` - test_db fixture: in-memory DuckDB with tract_features (2 rows), tract_outputs_with_preds (2 rows), blocks (3 rows)
- `requirements.txt` - Added geojson-pydantic==2.1.0

## Decisions Made

- `BatchRequest` enforces non-empty and max-200 limits to prevent unbounded queries at the schema layer, not the service layer
- `SortColumn`/`SortOrder` as `str, Enum` types allow FastAPI to use them directly as query parameter types — FastAPI auto-validates and returns 422 on bad values
- `test_db` fixture runs `INSTALL spatial; LOAD spatial;` so spatial extension behavior matches production even in memory

## Deviations from Plan

None — plan executed exactly as written.

The verification script in the plan attempted to call `test_db()` directly, which modern pytest rejects with a fixture guard. This was handled by invoking `test_db.__wrapped__()` to access the raw generator function — the fixture itself is correct and was verified to yield a proper DuckDB connection with the expected row counts.

## Issues Encountered

- Plan verification script called `test_db()` directly, which pytest 8.x blocks. Verified via `test_db.__wrapped__()` instead — the fixture implementation is correct and the test_db fixture will work normally when invoked by pytest's fixture injection mechanism.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plans 03, 04, 05 can now import schemas directly from `app/schemas.*` — no field-name discovery needed
- `tests/fixtures.py` is ready for import in all Phase 2 test files
- `geojson-pydantic` is installed and available for GeoJSON FeatureCollection responses in Plans 03-04
- Phase 3 (simulation) still requires parametric formula coefficients before planning

---
*Phase: 02-data-endpoints*
*Completed: 2026-02-28*

## Self-Check: PASSED

- FOUND: app/schemas/tracts.py
- FOUND: app/schemas/blocks.py
- FOUND: app/schemas/predictions.py
- FOUND: app/schemas/summary.py
- FOUND: tests/fixtures.py
- FOUND: .planning/phases/02-data-endpoints/02-02-SUMMARY.md
- FOUND commit: 8de048f (schemas)
- FOUND commit: a1c9f18 (fixture)
