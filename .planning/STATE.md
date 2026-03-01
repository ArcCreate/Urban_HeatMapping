---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
last_updated: "2026-03-01T00:25:05.636Z"
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 9
  completed_plans: 9
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-28)

**Core value:** City planners can explore where heat risk is highest across King County tracts, simulate the impact of interventions, and get AI-assisted reasoning — all through a fast, queryable JSON API.
**Current focus:** Phase 3 — Simulation Engine

## Current Position

Phase: 3 of 4 (Simulation Engine) — COMPLETE
Plan: 2 of 2 in current phase — COMPLETE
Status: Phase 3 complete — Simulation router (POST /what-if, POST /compare) wired and 12 integration tests passing
Last activity: 2026-02-28 — Completed 03-02: simulation router, main.py wiring, 12 integration tests (SIM-01, SIM-02)

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: 4 min
- Total execution time: 0.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 2 | 8 min | 4 min |
| 2. Data Endpoints | 2 | 8 min | 4 min |

**Recent Trend:**
- Last 5 plans: 01-01 (6 min), 01-02 (2 min), 02-01 (3 min), 02-02 (5 min), 02-04 (2 min)
- Trend: consistent

*Updated after each plan completion*
| Phase 02-data-endpoints P02 | 5 | 2 tasks | 6 files |
| Phase 02-data-endpoints P04 | 2 | 2 tasks | 3 files |
| Phase 02-data-endpoints P03 | 3 | 2 tasks | 5 files |
| Phase 02-data-endpoints P05 | 8 | 2 tasks | 7 files |
| Phase 03-simulation-engine P01 | 2 | 2 tasks | 2 files |
| Phase 03-simulation-engine P02 | 2 | 2 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Pre-scored predictions served from DuckDB — no live baseline inference in v1
- Parametric formulas for what-if (no model re-inference) — formulas sufficient for policy guidance
- Single read-only DuckDB connection opened at lifespan startup, shared via dependency injection
- Python 3.12 required — TensorFlow 2.20.0 segfaults on Python 3.13.5 arm64; all dev and CI must use conda env with python=3.12
- TF imported before XGBoost in app/models/loader.py — prevents macOS arm64 OpenMP conflict
- anthropic_api_key has no default in Settings — raises ValidationError at startup if missing (fail fast)
- [Phase 01-foundation]: Use StarletteHTTPException handler to correctly intercept all 4xx errors including routing-generated 404/405
- [Phase 01-foundation]: allow_credentials=False required with allow_origins=['*'] — setting True raises ValueError at FastAPI startup
- [Phase 01-foundation]: TestClient without context manager does not trigger lifespan — override app.state directly in smoke tests
- [Phase 02-data-endpoints]: Pipeline deps (pygris, geopandas, shapely) in scripts/requirements-pipeline.txt only — not in main requirements.txt
- [Phase 02-data-endpoints]: WKT stored as VARCHAR in geometry_wkt column, converted via ST_GeomFromText() at query time rather than using DuckDB native GEOMETRY type
- [Phase 02-data-endpoints]: All 492 tract GEOIDs and all 25,552 block GEOID20s matched exactly between pygris output and CSV data — no padding/format issues
- [Phase 02-data-endpoints]: Use /opt/anaconda3/envs/urban-heatmap/bin/pip directly (not conda run pip) to ensure deps install into Python 3.12 env, not system Python 3.13
- [Phase 02-data-endpoints]: BatchRequest validates non-empty list and enforces max 200 items — prevents unbounded queries at the schema layer
- [Phase 02-data-endpoints]: SortColumn/SortOrder as str Enum types for FastAPI query parameter validation — prevents SQL injection, returns 422 on bad values
- [Phase 02-data-endpoints]: test_db fixture uses INSTALL/LOAD spatial in-memory DuckDB to mirror production spatial extension behavior without king_county.duckdb file dependency
- [Phase 02-data-endpoints]: tract_id is a required Query(...) param on GET /blocks — FastAPI returns 422 on miss, preventing 25,552-row unfiltered query (~50MB+)
- [Phase 02-data-endpoints]: get_block_detail excludes geometry — BLOCK-02 is typed JSON detail only; geometry lives in the list endpoint filtered by tract_id
- [Phase 02-data-endpoints]: test_blocks.py self-registers blocks router into app if not already wired — allows tests to pass before Plan 02-05 wires main.py (idempotent)
- [Phase 02-data-endpoints]: db.cursor() per service function + json.loads(ST_AsGeoJSON()) for thread-safe DuckDB spatial queries in tract endpoints
- [Phase 02-data-endpoints]: validation_exception_handler _safe_errors() helper: Pydantic v2 exc.errors() ctx contains ValueError objects — stringify ctx values to prevent JSONResponse TypeError
- [Phase 02-data-endpoints]: sort_by/order query params use SortColumn/SortOrder enums — .value safe to interpolate into SQL because it comes from validated Enum allowlist
- [Phase 02-data-endpoints]: High-risk tract threshold: xgb_heat_score > 0.75 per Phase 2 research spec; used in COUNT FILTER in summary query
- [Phase 03-simulation-engine]: delta_risk = HEAT_WEIGHT * xgb_heat_score * (bounded_delta_temp / base_temp_safe) — proportional risk change tied to heat's share of composite score
- [Phase 03-simulation-engine]: simulate_compare calls _compute_simulation twice independently — 404 from scenario_a propagates, no separate pre-validation pass needed
- [Phase 03-simulation-engine]: TEMP_NULL_FALLBACK_F = 85.0 — prevents division-by-zero in risk delta formula when mean_afternoon_temp is NULL
- [Phase 03-simulation-engine]: BETA_CANOPY=0.04, BETA_ALBEDO=5.4, BETA_GREEN_SPACE=5.0e-6 — coefficients from Seattle canopy research, Scientific Reports 2024, Manchester/Adama City urban studies
- [Phase 03-simulation-engine]: def (not async def) handlers in simulations router — DuckDB is synchronous, consistent with Phase 2 router pattern; FastAPI dispatches to threadpool
- [Phase 03-simulation-engine]: Idempotent router registration guard in test file — hasattr(r, 'path') and '/simulations' in path prevents duplicate route registration

### Pending Todos

None.

### Blockers/Concerns

- Python 3.12 env at `/opt/anaconda3/envs/urban-heatmap/` confirmed working (Plan 02 tests passed). pytest installed.
- [RESOLVED 03-01] Phase 3 (Simulation): Parametric formula coefficients sourced and implemented — BETA_CANOPY=0.04, BETA_ALBEDO=5.4, BETA_GREEN_SPACE=5.0e-6 with literature citations.
- [RESOLVED 02-01] Phase 2 (Geometry): `king_county.duckdb` geometry CRS and actual table/column names verified — all 492 tracts and 25,552 blocks match, WGS84, tables are tract_features/tract_outputs_with_preds/blocks.
- Phase 4 (Chat): Claude model selection (Opus vs Sonnet) and context token budget strategy need confirmation before chat endpoint is finalized.

## Session Continuity

Last session: 2026-02-28
Stopped at: Completed 03-02-PLAN.md — Simulation router, main.py wiring, 12 integration tests; Phase 3 complete
Resume file: None
