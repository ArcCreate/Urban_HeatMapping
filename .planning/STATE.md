---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
last_updated: "2026-03-01T07:37:09.668Z"
progress:
  total_phases: 2
  completed_phases: 2
  total_plans: 8
  completed_plans: 8
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-01)

**Core value:** City planners can explore where heat risk is highest across King County tracts, simulate the impact of interventions, and get AI-assisted reasoning — all through a fast, queryable JSON API.
**Current focus:** Planning next milestone (v1.1) — run `/gsd:new-milestone`

## Current Position

Phase: 06-composite-risk-and-projections — 4/4 plans complete
Plan: 4/4 plans complete
Status: Phase 06 complete. Plan 04 complete — frontend timeline slider wired to projections API; mapStore extended with projection cache; TractPopup shows PROJ {year} label.
Last activity: 2026-03-01 — 06-04 Frontend projection wiring: api/projections.ts, mapStore cache + stampProjectionOnGeoJSON, TimelineSlider 2025–2050, TractPopup PROJ label

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
| Phase 04-chat-endpoint P01 | 2 | 2 tasks | 5 files |
| Phase 05-heat-map-dashboard-ui P01 | 2 | 2 tasks | 14 files |
| Phase 05-heat-map-dashboard-ui P02 | 2 | 2 tasks | 6 files |
| Phase 05-heat-map-dashboard-ui P03 | 5 | 2 tasks | 7 files |
| Phase 05-heat-map-dashboard-ui P04 | 2 | 2 tasks | 7 files |
| Phase 06-composite-risk-and-projections P01 | 2 | 2 tasks | 3 files |
| Phase 06-composite-risk-and-projections P02 | 3 | 2 tasks | 2 files |
| Phase 06-composite-risk-and-projections P03 | 4 | 2 tasks | 4 files |
| Phase 06-composite-risk-and-projections P04 | 6 | 2 tasks | 8 files |

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
- [Phase 04-chat-endpoint]: async def (not def) for chat handler — await anthropic.messages.create() requires async; first and only async router in project
- [Phase 04-chat-endpoint]: claude-haiku-4-5-20251001 selected — current non-deprecated haiku model, cost-efficient for v1 planner queries
- [Phase 04-chat-endpoint]: Compact per-tract format (h=, rx=, rt=) keeps 50-tract prompt under 3000 chars; verbose format exceeded limit (3407 chars)
- [Phase 04-chat-endpoint]: System prompt budget: enumerate <= 50 tracts with IDs+scores; summarize > 50 with min/max/mean statistics
- [Phase 05-heat-map-dashboard-ui]: Tailwind v4 CSS-first: @import tailwindcss + @theme block in index.css (no tailwind.config.js)
- [Phase 05-heat-map-dashboard-ui]: useShallow re-exported from mapStore — consumers import from one place
- [Phase 05-heat-map-dashboard-ui]: class=dark always on html element — dark-mode-always pattern per locked design decision
- [Phase 05-heat-map-dashboard-ui]: LayerProps (not FillLayer/LineLayer) is the correct react-map-gl/maplibre type for layer spec objects — FillLayerSpecification requires source field; LayerProps uses OptionalSource wrapper
- [Phase 05-heat-map-dashboard-ui]: hoveredTractId as module-level var (not useRef/useState) for GPU-side feature-state hover — eliminates 60fps React re-renders on map hover
- [Phase 05-heat-map-dashboard-ui]: mapRef exported as plain module-level object for Plan 03 fly-to — no Context or prop drilling required
- [Phase 05-heat-map-dashboard-ui]: Fly-to uses King County center (-122.1, 47.5) at zoom 10 for all tract cards — all tracts are in King County
- [Phase 05-heat-map-dashboard-ui]: useChatScroll only auto-scrolls when within 120px of bottom — preserves user scroll position when reading chat history
- [Phase 05-heat-map-dashboard-ui]: motion/react (not framer-motion) is the canonical import — motion package v12 ships motion/react as subpath
- [Phase 05-heat-map-dashboard-ui]: Stagger variants defined at module level — stable object references prevent re-creation on each render
- [Phase 05-heat-map-dashboard-ui]: AnimatePresence initial=false on chat list — welcome message does not animate on mount, only new messages do
- [Phase 05-heat-map-dashboard-ui]: TractPopup motion.div wraps inner content only — react-map-gl Popup owns DOM positioning
- [Phase 06-composite-risk-and-projections]: composite_risk formula: 4 domains — thermal 0.30, vegetation 0.25 (imperv+tree_cov equal 0.5 split), health 0.25 (CVD+diabetes+life_expectancy mean), social 0.20 (SVI+poverty+disability+under18+housing_cost mean)
- [Phase 06-composite-risk-and-projections]: minmax() uses 1e-9 epsilon denominator — prevents division-by-zero when all values in a column are identical
- [Phase 06-composite-risk-and-projections]: Idempotent ALTER TABLE via try/except (not IF NOT EXISTS) — broader DuckDB version compatibility
- [Phase 06-composite-risk-and-projections]: life_expectancy inverted in health domain (higher = better health); CVD rate and diabetes rate not inverted (higher = worse risk already)
- [Phase 06-composite-risk-and-projections]: WARMING_RATE_F_PER_YEAR = 5.5/25 = 0.22F/year — King County official SSP2 middle-road projection; morning at 0.7x, evening at 0.85x afternoon rate
- [Phase 06-composite-risk-and-projections]: Normalization stats saved at training time (.npy) and loaded at inference time — prevents distribution shift when scoring future-year warmed feature vectors
- [Phase 06-composite-risk-and-projections]: tract_projections uses CREATE OR REPLACE TABLE for idempotent re-runs; year+tract_id indexes added for fast API queries
- [Phase 06-composite-risk-and-projections]: models/ directory is gitignored (large binaries); scripts committed to git, models regenerated by running train_projection.py then build_projections.py
- [Phase 06-composite-risk-and-projections]: /range before /{year} in projections router — FastAPI matches routes in registration order; prevents 'range' being shadowed as {year} path param
- [Phase 06-composite-risk-and-projections]: def (not async def) handlers in projections router — DuckDB synchronous, dispatched to threadpool by FastAPI
- [Phase 06-composite-risk-and-projections]: projectionYear=2025 fast path: no API call, composite_risk baseline already in GeoJSON; cache hit path: re-stamp synchronously from scoreMap without network request
- [Phase 06-composite-risk-and-projections]: stampProjectionOnGeoJSON only mutates display_risk property preserving geometry; composite_risk stamped as both display_risk and composite_risk at baseline load

### Roadmap Evolution

- Phase 5 added: Heat Map Dashboard UI — React frontend with interactive heatmap, tract selection/stats, AI chat panel, and location focus panel (v1.1)

### Pending Todos

None.

### Blockers/Concerns

None — all v1.0 blockers resolved. See PROJECT.md Known Issues for tech debt items carried forward.

## Session Continuity

Last session: 2026-03-01T09:06:38Z
Stopped at: Ad-hoc UI polish complete — Reset View button, TractPopup contractor refactor, GlassCard grey theme, STYLE.md created. All committed. Working tree clean.
Resume file: .continue-here.md (project root) — status: complete. Next: /gsd:new-milestone for v1.2.
