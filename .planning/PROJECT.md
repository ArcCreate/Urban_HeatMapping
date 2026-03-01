# Urban Heat Mapping — King County Backend API

## What This Is

A FastAPI backend that powers a policy tool for King County city planners. It serves census tract and block-level urban heat and risk data from a DuckDB database, exposes pre-scored XGBoost and TensorFlow model predictions, runs parametric what-if simulations for cooling interventions (tree canopy, cool surfaces, green space), and provides a Claude-powered chat assistant that has full awareness of the current map context.

This is the backend only — the React frontend is a separate milestone built on top of this API.

## Core Value

City planners can explore where heat risk is highest across King County tracts, simulate the impact of interventions, and get AI-assisted reasoning — all through a fast, queryable JSON API.

## Requirements

### Validated

- ✓ API serves census tract and block geometries and features from DuckDB — v1.0 (GeoJSON FeatureCollections for 492 tracts + 25,552 blocks)
- ✓ API serves pre-scored heat and risk model predictions per tract — v1.0 (PRED-01/02: ranked, sorted, geometry-free choropleth data)
- ✓ API runs parametric what-if calculations (tree canopy ΔT, albedo, green space) without live model inference — v1.0 (SIM-01/02: coefficients from literature)
- ✓ FastAPI app loads XGBoost and TensorFlow models into memory on startup — v1.0 (INFRA-05: asynccontextmanager lifespan, macOS arm64 OpenMP fix)
- ✓ Chat endpoint sends map context + user message to Claude and returns response — v1.0 (CHAT-01: haiku-4-5, token-budget system prompt)
- ✓ All endpoints return clean JSON (GeoJSON for geometries, typed JSON for predictions/chat) — v1.0 (all 20 v1 requirements complete)

### Active

- [ ] React frontend integration (separate milestone — frontend consumes this API)
- [ ] Streaming chat responses via SSE (SIM-V2-01 / CHAT-V2-01 — deferred to v1.1+)
- [ ] Formula transparency endpoint GET /simulations/formulas (SIM-V2-01)
- [ ] Bounding-box spatial filter ?bbox= on tract endpoints (SIM-V2-02)
- [ ] API key authentication for external exposure (AUTH-V2-01)

### Out of Scope

- Live model inference for baseline predictions — pre-scored values in DuckDB are served directly; models in memory for future use
- Budget allocation optimizer — complex LP/MILP problem, deferred
- Public API exposure / external docs — internal use by React frontend only in v1
- Vector tile (MVT) serving — GeoJSON sufficient for King County scale
- Multi-county scope — King County only; global scope inflates data model before v1 is validated
- WebSocket / SSE streaming for chat (v1) — full reply sufficient for v1

## Context

**Shipped v1.0 with 2,837 LOC Python, 84 files changed.**
Tech stack: FastAPI 0.134, DuckDB ≥1.2, XGBoost ≥2.0, TensorFlow ≥2.15 (Python 3.12 required — TF 2.20 segfaults on 3.13 arm64), Anthropic SDK 0.84.

**Data source:** `king_county.duckdb` (35 MB) — tables: `tract_features` (492 rows), `tract_outputs_with_preds` (492 rows, pre-scored), `blocks` (25,552 rows). All geometry stored as WKT VARCHAR, converted via ST_GeomFromText() at query time.

**Runtime environment:** Python 3.12 conda env at `/opt/anaconda3/envs/urban-heatmap/`. OMP_NUM_THREADS=1 in .env prevents OpenMP conflict.

**Known issues / tech debt:**
- Model scores in DuckDB are placeholder values derived from PRED columns normalized /100; real trained model scores will be loaded via `scripts/train_models.py`
- Chat endpoint has no conversation memory — frontend manages message history, sends full context per request
- No rate limiting or auth — appropriate for single internal consumer; revisit before external exposure

## Constraints

- **Tech Stack**: Python + FastAPI, DuckDB Python client, XGBoost, TensorFlow/Keras — no deviations
- **Python Version**: 3.12 required (TF 2.20.0 incompatible with Python 3.13 arm64)
- **Data**: Single local DuckDB file — no external database, no migrations
- **LLM**: Anthropic Claude via `anthropic` SDK — provider fixed for v1
- **Consumers**: Only the React frontend in v1 — no auth, no rate limiting required yet
- **Geometry**: WKT stored as VARCHAR; ST_GeomFromText() at query time

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Pre-scored predictions, no live baseline inference | Models already scored; querying DB is faster and simpler | ✓ Good — zero latency overhead vs. live inference |
| Parametric formulas for what-if (not live model calls) | Avoids model re-inference complexity in v1; formulas sufficient for policy guidance | ✓ Good — BETA coefficients sourced from literature (Seattle canopy research, Scientific Reports 2024) |
| Claude haiku-4-5-20251001 for chat | Cost-efficient for v1 planner queries; 200K context covers any map state | ✓ Good — 8 tests pass with mocked client |
| FastAPI over Flask | Typed, async, auto OpenAPI docs built-in | ✓ Good — dependency injection via Depends() clean throughout |
| DuckDB as query layer | In-process, fast analytical queries, already has the data | ✓ Good — PERCENTILE_CONT, COUNT FILTER, ST_AsGeoJSON all work natively |
| WKT as VARCHAR (not native GEOMETRY type) | Avoids DuckDB GEOMETRY type compatibility issues at load time | ✓ Good — ST_GeomFromText() at query time works reliably |
| StarletteHTTPException handler (not FastAPI) | Correctly intercepts all 4xx including routing-generated 404/405 | ✓ Good — essential for consistent error shape |
| allow_credentials=False with allow_origins=["*"] | FastAPI raises ValueError if credentials=True with wildcard | ✓ Good — enforced by framework |
| asyncio.to_thread() for load_models() in lifespan | load_models() is synchronous; must not block async event loop | ✓ Good — startup non-blocking |
| Token budget: enumerate ≤50 tracts, summarize >50 | Verbose format for 50 tracts exceeded 3000-char limit (3407 chars) | ✓ Good — compact format (h=, rx=, rt=) keeps 50 tracts at 2607 chars |
| Compact per-tract abbreviations in system prompt | Keeps prompt under token limit for large tract selections | ✓ Good — no context overflow on large map selections |
| test_db fixture with in-memory DuckDB + INSTALL/LOAD spatial | Mirrors production spatial extension behavior without king_county.duckdb | ✓ Good — all endpoint tests pass without the 35MB artifact |
| Pipeline deps in scripts/requirements-pipeline.txt | Keeps pygris/geopandas/shapely out of FastAPI app image | ✓ Good — clean separation of pipeline and API dependencies |

---
*Last updated: 2026-03-01 after v1.0 milestone*
