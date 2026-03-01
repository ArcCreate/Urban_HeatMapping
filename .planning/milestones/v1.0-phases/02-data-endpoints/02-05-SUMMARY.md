---
phase: 02-data-endpoints
plan: "05"
subsystem: api
tags: [fastapi, duckdb, pydantic, pytest, predictions, summary, choropleth]

# Dependency graph
requires:
  - phase: 02-02
    provides: Pydantic schemas (TractPrediction, RankedTract, SortColumn, SortOrder, CountySummary) and test_db fixture

provides:
  - get_all_predictions: returns all tract IDs with 3 model scores, no geometry (PRED-01)
  - get_ranked_predictions: sorted, limited tract list using enum-validated sort params (PRED-02)
  - get_county_summary: single-query aggregation with PERCENTILE_CONT and COUNT FILTER (SUM-01)
  - GET /api/v1/predictions/tracts — all prediction scores, no geometry
  - GET /api/v1/predictions/tracts/ranked — sorted with enum validation, 422 on bad sort_by
  - GET /api/v1/summary/county — county-wide aggregate stats with 0.75 threshold

affects:
  - Phase 03 simulation (uses prediction scores as baseline)
  - Phase 04 chat (references prediction endpoint for context)
  - Frontend choropleth layer (consumes /predictions/tracts for coloring)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "db.cursor() for every DuckDB call — thread safety under FastAPI thread pool"
    - "Enum-validated query params (SortColumn/SortOrder) prevent SQL injection, return 422 on bad input"
    - "PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ...) for DuckDB-native percentile computation"
    - "COUNT(*) FILTER (WHERE xgb_heat_score > 0.75) for threshold-based aggregation in single pass"
    - "def (not async def) route handlers — FastAPI dispatches to thread pool automatically"
    - "Static path /tracts/ranked registered before /tracts to avoid future dynamic path conflicts"

key-files:
  created:
    - app/services/predictions.py
    - app/services/summary.py
    - app/routers/predictions.py
    - app/routers/summary.py
    - tests/test_predictions.py
    - tests/test_summary.py
  modified:
    - app/main.py

key-decisions:
  - "sort_by and order query params use SortColumn/SortOrder enums — .value is safe to interpolate into SQL because it comes from an allowlist Enum validated by FastAPI"
  - "High-risk tract threshold is xgb_heat_score > 0.75 per Phase 2 research spec"
  - "Single aggregation query computes all 4 county stats (COUNT, AVG, PERCENTILE_CONT, COUNT FILTER) in one DuckDB round trip"
  - "blocks router deferred to plan 02-04 — 02-05 wires health/tracts/predictions/summary, with blocks comment placeholder"

patterns-established:
  - "All prediction/summary service functions use cursor = db.cursor() for thread safety"
  - "Routers import services as modules (from app.services import predictions as prediction_service)"

requirements-completed: [PRED-01, PRED-02, SUM-01]

# Metrics
duration: 8min
completed: 2026-02-28
---

# Phase 2 Plan 05: Prediction and Summary Endpoints Summary

**DuckDB-backed prediction and summary endpoints — PRED-01/02 for choropleth coloring data, SUM-01 for county-wide aggregation using PERCENTILE_CONT and enum-validated sort params returning 422 on invalid input**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-28T23:16:24Z
- **Completed:** 2026-02-28T23:24:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Prediction service with `get_all_predictions` (no geometry, ordered by tract_id) and `get_ranked_predictions` (enum-safe SQL interpolation with ORDER BY + LIMIT)
- Summary service with `get_county_summary` using single-pass PERCENTILE_CONT and COUNT FILTER WHERE xgb_heat_score > 0.75
- Prediction and summary routers registered under /api/v1 in app/main.py; /tracts/ranked registered before /tracts to avoid future dynamic conflicts
- 21 passing tests covering 200 responses, enum validation 422s, limit bounds, sort order correctness, geometry absence, and threshold accuracy

## Task Commits

Each task was committed atomically:

1. **Task 1: Create prediction and summary services and routers** - `dcb4d9a` (feat) + `596b7a9` (feat — main.py wiring fix)
2. **Task 2: Write pytest tests for PRED-01, PRED-02, SUM-01** - `4dd5803` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `app/services/predictions.py` - `get_all_predictions` and `get_ranked_predictions` using db.cursor()
- `app/services/summary.py` - `get_county_summary` with PERCENTILE_CONT(0.75) and COUNT FILTER
- `app/routers/predictions.py` - FastAPI router: /tracts/ranked (static first), /tracts; SortColumn/SortOrder enums; limit ge=1 le=500
- `app/routers/summary.py` - FastAPI router: /county returning CountySummary
- `app/main.py` - Imports and registers predictions.router and summary.router under /api/v1
- `tests/test_predictions.py` - 14 tests: PRED-01 (5 tests) and PRED-02 (9 tests)
- `tests/test_summary.py` - 7 tests: SUM-01 including threshold, p75 range, type correctness

## Decisions Made
- `sort_by.value` and `order.value` are safe to f-string-interpolate into SQL because both come from validated Enum allowlists — raw user strings are never interpolated
- High-risk threshold is strictly xgb_heat_score > 0.75 (not >=) per Phase 2 research spec
- blocks router deferred to plan 02-04 — this plan wires health/tracts/predictions/summary, leaving a comment placeholder for blocks

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] IDE linter repeatedly reverted main.py edits**
- **Found during:** Task 1 (main.py update)
- **Issue:** Background linter reverted import line (`from app.routers import health, tracts, predictions, summary` back to separate imports) and router registration lines between edit and commit, causing git to capture the old state
- **Fix:** Used Write tool to produce a complete main.py rewrite in one atomic operation, ensuring linter-applied changes (the `_safe_errors` helper added by linter) were preserved while adding predictions/summary wiring
- **Files modified:** app/main.py
- **Verification:** `python -c "from app.main import app; ..."` confirmed all routes present; 21 tests passed
- **Committed in:** 4dd5803 (Task 2 commit, bundled with test files)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug: linter interference)
**Impact on plan:** Required extra main.py commit (596b7a9) and bundling main.py into Task 2 commit. No scope creep.

## Issues Encountered
- IDE linter reverted edits to main.py between Edit tool calls and git staging. Resolved by using Write tool for a complete atomic file rewrite preserving all linter-added content.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- PRED-01, PRED-02, SUM-01 routes fully operational with tests
- Plan 02-04 (blocks) still needs to run — blocks.py router not yet wired in main.py
- Phase 3 (Simulation) can use /predictions/tracts as baseline data source
- All prediction endpoints are geometry-free — lightweight for frontend choropleth coloring

---
*Phase: 02-data-endpoints*
*Completed: 2026-02-28*
