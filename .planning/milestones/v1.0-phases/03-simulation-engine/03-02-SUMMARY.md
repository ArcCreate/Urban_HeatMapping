---
phase: 03-simulation-engine
plan: 02
subsystem: api
tags: [fastapi, router, integration-tests, simulation, duckdb, parametric-formulas]

# Dependency graph
requires:
  - phase: 03-simulation-engine
    plan: 01
    provides: app/schemas/simulations.py + app/services/simulations.py (schema types and formula service)

provides:
  - app/routers/simulations.py — FastAPI router with POST /what-if and POST /compare handlers
  - tests/test_simulations.py — 12-test integration suite for SIM-01 and SIM-02
  - app/main.py — simulations router wired under /api/v1 prefix

affects: [04-chat-interface]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "def (not async def) handlers for DuckDB-backed simulation endpoints — consistent with Phase 2 synchronous router pattern"
    - "Idempotent router self-registration in test file: checks app.routes before include_router to prevent duplicate registration"
    - "TestClient with raise_server_exceptions=True — propagates service 404s through FastAPI exception handler correctly"

key-files:
  created:
    - app/routers/simulations.py
    - tests/test_simulations.py
  modified:
    - app/main.py

key-decisions:
  - "def (not async def) handlers match all Phase 2 router conventions — DuckDB is synchronous, FastAPI runs sync handlers in threadpool automatically"
  - "Idempotent router check in test file uses hasattr(r, 'path') and '/simulations' in path — guards against duplicate route registration when main.py already wires it"

patterns-established:
  - "Simulation router pattern: thin handler delegates entirely to sim_service — no business logic in router layer"
  - "Compare test asserts scenario_b delta_temp < scenario_a delta_temp — stronger intervention produces more negative (cooling) delta"

requirements-completed: [SIM-01, SIM-02]

# Metrics
duration: 2min
completed: 2026-02-28
---

# Phase 3 Plan 2: Simulation Router and Integration Tests Summary

**FastAPI simulation router exposing POST /what-if and POST /compare endpoints wired into main.py, with 12-test integration suite confirming all SIM-01/SIM-02 behaviors including 200 success, 422 validation, and 404 unknown-tract cases**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-28T04:39:18Z
- **Completed:** 2026-02-28T04:40:47Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- app/routers/simulations.py created with def (not async) POST /what-if and POST /compare handlers that delegate entirely to sim_service functions
- app/main.py updated: simulations added to router imports (line 16) and include_router call added under /api/v1 prefix replacing placeholder comment
- tests/test_simulations.py created with 12 integration tests: 8 for TestWhatIf (success cases, zero-delta, bounds violations, unknown tract) and 4 for TestCompare (success, scenario inequality, empty list, unknown tract)
- All 12 tests pass with pytest in urban-heatmap conda env — no failures, no errors, only benign Starlette deprecation warnings

## Task Commits

Each task was committed atomically:

1. **Task 1: Simulation router and main.py wiring** - `1a2fae9` (feat)
2. **Task 2: Integration tests for simulation endpoints** - `fe01cee` (feat)

## Files Created/Modified

- `app/routers/simulations.py` — FastAPI APIRouter with prefix="/simulations", tags=["Simulations"]; two def handlers: what_if and compare; both delegate to sim_service via Depends(get_db) injection
- `tests/test_simulations.py` — 12 integration tests across TestWhatIf and TestCompare classes; idempotent router registration guard; client fixture injects test_db into app.state.db
- `app/main.py` — simulations added to import line 16; app.include_router(simulations.router, prefix="/api/v1") added (line 120); placeholder comment removed

## Decisions Made

- `def` (not `async def`) handlers used throughout — DuckDB is synchronous and Phase 2 established this pattern; FastAPI dispatches sync handlers to threadpool automatically
- Idempotent router check in test file uses `hasattr(r, 'path') and '/simulations' in path` — safely guards against double-registration when main.py already wires it at import time

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Simulation endpoints /api/v1/simulations/what-if and /api/v1/simulations/compare are live and tested
- Phase 3 (Simulation Engine) is fully complete — SIM-01 and SIM-02 requirements satisfied across Plans 01 and 02
- Ready for Phase 4 (Chat Interface)
- No blockers

## Self-Check: PASSED

- FOUND: app/routers/simulations.py
- FOUND: tests/test_simulations.py
- FOUND: app/main.py (modified)
- FOUND: 1a2fae9 (Task 1 router commit)
- FOUND: fe01cee (Task 2 tests commit)

---
*Phase: 03-simulation-engine*
*Completed: 2026-02-28*
