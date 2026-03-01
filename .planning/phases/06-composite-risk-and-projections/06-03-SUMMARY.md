---
phase: 06-composite-risk-and-projections
plan: "03"
subsystem: backend-api
tags: [fastapi, duckdb, projections, api]
dependency_graph:
  requires: [06-01, 06-02]
  provides: [projections-api]
  affects: [app/main.py]
tech_stack:
  added: []
  patterns: [def-handler-threadpool, db-cursor-per-function, route-ordering-range-before-year]
key_files:
  created:
    - app/schemas/projections.py
    - app/services/projections.py
    - app/routers/projections.py
  modified:
    - app/main.py
decisions:
  - "/range registered before /{year} in projections router — FastAPI matches routes in registration order; string 'range' would shadow as {year} param if ordering were reversed"
  - "def (not async def) handlers in projections router — DuckDB is synchronous, consistent with all other project routers"
  - "get_series returns empty projections list (not raises) for missing tract_id — router translates empty list to 404 with actionable error message"
metrics:
  duration_minutes: 4
  completed_date: "2026-03-01"
  tasks_completed: 2
  files_created: 3
  files_modified: 1
---

# Phase 06 Plan 03: Projections API Summary

FastAPI projections router with `/range` (per-tract series) and `/{year}` (all-tracts snapshot) endpoints querying the precomputed `tract_projections` DuckDB table.

## What Was Built

Three new files + one update to wire in the projections router:

- **`app/schemas/projections.py`** — `ProjectedTractScore` (tract_id, year, projected_risk) and `ProjectionSeries` (tract_id + list of scores) Pydantic response schemas.
- **`app/services/projections.py`** — `get_year_projections(db, year)` and `get_series(db, tract_id)` using `db.cursor()` per call for thread safety.
- **`app/routers/projections.py`** — Two endpoints with `/range` registered before `/{year}` (critical for correct FastAPI path matching).
- **`app/main.py`** — Added `projections` import and `include_router(projections.router, prefix="/api/v1")`.

## Endpoints Delivered

| Endpoint | Behavior | Validation |
|---|---|---|
| `GET /api/v1/projections/{year}` | Returns 492 tract scores for given year | 400 if year outside 2025–2050 |
| `GET /api/v1/projections/range?tract_id=` | Returns 26-year series (2025–2050) for one tract | 404 if tract not found; 422 if tract_id missing |

## Smoke Test Results

- `GET /api/v1/projections/2030` → 492 rows, sample `{tract_id: '53033000101', year: 2030, projected_risk: 0.5105}`
- `GET /api/v1/projections/range?tract_id=53033000101` → 26 projections, first `{year: 2025, projected_risk: 0.4582}`
- `GET /api/v1/projections/2024` → `400` "Year must be between 2025 and 2050 (got 2024)."
- `GET /api/v1/projections/2051` → `400` "Year must be between 2025 and 2050 (got 2051)."
- `GET /api/v1/projections/range` (no tract_id) → `422` RequestValidationError

## Deviations from Plan

None — plan executed exactly as written.

Note: The plan's example tract_id `53033000100` doesn't exist in the actual data (tracts start at `53033000101`). The plan used it as a format example only. All endpoint logic behaves correctly for real tract IDs.

## Commits

| Task | Commit | Description |
|---|---|---|
| Task 1 | `2fdb960` | feat(06-03): add projections schemas, service, and router |
| Task 2 | `5851b80` | feat(06-03): wire projections router into app/main.py |

## Self-Check: PASSED

All files confirmed on disk:
- app/schemas/projections.py — FOUND
- app/services/projections.py — FOUND
- app/routers/projections.py — FOUND
- .planning/phases/06-composite-risk-and-projections/06-03-SUMMARY.md — FOUND

All commits verified in git log:
- 2fdb960 (Task 1) — FOUND
- 5851b80 (Task 2) — FOUND
