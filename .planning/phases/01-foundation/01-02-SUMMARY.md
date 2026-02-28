---
phase: 01-foundation
plan: "02"
subsystem: api

tags: [fastapi, pydantic-v2, duckdb, pytest, cors, lifespan, exception-handlers]

# Dependency graph
requires:
  - phase: 01-01
    provides: app/config.py (Settings), app/models/loader.py (LoadedModels, load_models), app/dependencies.py (get_db, get_models, get_anthropic)
provides:
  - FastAPI app entry point with lifespan context manager (DuckDB + ML model loading + Anthropic client)
  - CORSMiddleware configured with allow_origins=["*"] and allow_credentials=False
  - Three global exception handlers returning {error, detail, status_code} JSON shape
  - GET /api/v1/health endpoint returning {status, models_loaded, db_connected}
  - Pydantic v2 HealthResponse schema
  - Pytest smoke test suite (8 tests, no real files required)
affects: [02-geometry, 03-simulation, 04-chat, all future routers registered under /api/v1]

# Tech tracking
tech-stack:
  added: [pytest-9.0.2, pluggy, iniconfig]
  patterns:
    - asynccontextmanager lifespan for startup/shutdown (replaces deprecated @app.on_event)
    - StarletteHTTPException handler (not fastapi.HTTPException) for correct 4xx interception
    - app.state injection pattern for shared resources (db, models, anthropic)
    - TestClient with raise_server_exceptions=False for error handler smoke tests
    - MagicMock + in-memory DuckDB for unit tests without real files

key-files:
  created:
    - app/main.py
    - app/routers/health.py
    - app/schemas/health.py
    - tests/__init__.py
    - tests/test_health.py
  modified: []

key-decisions:
  - "Use StarletteHTTPException (not fastapi.HTTPException) in exception handler to correctly intercept all 4xx errors including 404 and 405"
  - "allow_credentials=False required with allow_origins=['*'] — setting True raises ValueError at startup"
  - "TestClient without context manager does not trigger lifespan — intentional for unit smoke tests that override app.state directly"

patterns-established:
  - "Exception handler shape: {error: ClassName, detail: ..., status_code: N} — all three handlers return this shape"
  - "All API routes registered under /api/v1 prefix via app.include_router(router, prefix='/api/v1')"
  - "Shared resources accessed via request.app.state in route handlers"

requirements-completed: [INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-08]

# Metrics
duration: 2min
completed: 2026-02-28
---

# Phase 1 Plan 02: FastAPI App Wiring Summary

**FastAPI app with asynccontextmanager lifespan, CORS, three JSON exception handlers, GET /api/v1/health endpoint, and 8 pytest smoke tests that run without real model files or DuckDB**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-28T21:56:52Z
- **Completed:** 2026-02-28T21:58:43Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- FastAPI app entry point (app/main.py) with asynccontextmanager lifespan, CORS middleware, and three global exception handlers covering HTTP errors, validation errors, and unhandled exceptions
- Health router (GET /api/v1/health) reading from app.state with graceful fallback when db or models are missing
- Complete pytest smoke test suite (8 tests) covering all Phase 1 INFRA requirements with no real files required

## Task Commits

Each task was committed atomically:

1. **Task 1: Create HealthResponse schema and health router** - `ff0268a` (feat)
2. **Task 2: Create main.py with lifespan, CORS, exception handlers, and router registration** - `d2ed41c` (feat)
3. **Task 3: Write pytest smoke tests for health endpoint and error handlers** - `f9d6abb` (test)

**Plan metadata:** (docs commit — see final commit)

## Files Created/Modified
- `app/main.py` - FastAPI app with lifespan context manager, CORSMiddleware, three exception handlers, health router registered at /api/v1
- `app/routers/health.py` - GET /health endpoint reading from app.state, graceful fallback on missing db/models
- `app/schemas/health.py` - Pydantic v2 HealthResponse model with status, models_loaded, db_connected
- `tests/__init__.py` - Empty package init
- `tests/test_health.py` - 8 pytest smoke tests covering INFRA-01 through INFRA-04 and INFRA-08

## Decisions Made
- Used `StarletteHTTPException` (not `fastapi.HTTPException`) as the exception handler target — this correctly intercepts all HTTP errors including 404/405 generated internally by Starlette routing
- Set `allow_credentials=False` with `allow_origins=["*"]` — FastAPI/Starlette raises ValueError if credentials=True with wildcard origins
- TestClient instantiated without context manager in smoke tests so lifespan does not run — app.state overridden directly per test

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing pytest dependency in conda env**
- **Found during:** Task 3 (smoke test execution)
- **Issue:** pytest not installed in `/opt/anaconda3/envs/urban-heatmap/` conda env; `python -m pytest` returned "No module named pytest"
- **Fix:** Ran `/opt/anaconda3/envs/urban-heatmap/bin/pip install pytest httpx` — installed pytest-9.0.2 and dependencies
- **Files modified:** conda env packages (no project files modified)
- **Verification:** All 8 tests pass with exit code 0
- **Committed in:** f9d6abb (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — missing test dependency)
**Impact on plan:** Required for test execution. No scope creep.

## Issues Encountered
None beyond the missing pytest dependency (handled automatically above).

## User Setup Required
None - no external service configuration required for this plan.

## Next Phase Readiness
- Phase 1 is fully complete: all INFRA requirements (01-08) verified by automated tests
- All Phase 1 imports resolve cleanly: app.main, app.schemas.health, app.routers.health, app.config, app.models.loader, app.dependencies
- Phase 2 (Geometry/Tracts) can register new routers via `app.include_router(tracts.router, prefix="/api/v1")` in main.py
- Blocker remains: `king_county.duckdb` geometry CRS and table/column names must be verified before Phase 2 DuckDB queries are written

---
*Phase: 01-foundation*
*Completed: 2026-02-28*

## Self-Check: PASSED

- FOUND: app/main.py
- FOUND: app/routers/health.py
- FOUND: app/schemas/health.py
- FOUND: tests/__init__.py
- FOUND: tests/test_health.py
- FOUND: .planning/phases/01-foundation/01-02-SUMMARY.md
- FOUND commit: ff0268a (Task 1)
- FOUND commit: d2ed41c (Task 2)
- FOUND commit: f9d6abb (Task 3)
