# Roadmap: Urban Heat Mapping — King County Backend API

## Overview

Four phases that build the FastAPI backend layer by layer: first get the server starting cleanly with all shared resources wired (DuckDB, models, Anthropic client), then deliver every data-access and geometry endpoint the React frontend needs, then implement the what-if simulation engine that is the product's core differentiator, and finally add the Claude-powered chat assistant that ties map context to AI reasoning. Each phase produces independently testable, verifiable endpoints. The frontend can begin integration after Phase 2.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - FastAPI app starts cleanly with DuckDB, models, and Anthropic client wired into app.state; health endpoint live (completed 2026-02-28)
- [x] **Phase 2: Data Endpoints** - All tract, block, prediction, summary, and batch endpoints return correct GeoJSON and typed JSON from DuckDB (completed 2026-02-28)
- [x] **Phase 3: Simulation Engine** - What-if and scenario-compare endpoints apply parametric formulas and return per-tract delta scores (completed 2026-03-01)
- [x] **Phase 4: Chat Endpoint** - Claude assistant accepts map context and returns reasoned responses for planner questions (completed 2026-03-01)

## Phase Details

### Phase 1: Foundation
**Goal**: The FastAPI application starts without errors, all shared resources are wired into app.state, and a caller can verify the app is healthy via a single endpoint
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07, INFRA-08
**Success Criteria** (what must be TRUE):
  1. `GET /api/v1/health` returns `{status: "ok", models_loaded: true, db_connected: true}` within 2 seconds of startup completing
  2. All three ML models (XGBoost heat, XGBoost risk, TensorFlow risk) are accessible via `app.state` without blocking the event loop during startup
  3. DuckDB connection to `king_county.duckdb` is open in read-only mode and reachable via FastAPI dependency injection
  4. Any endpoint that receives a malformed request returns `{error, detail, status_code}` JSON (not an HTML traceback or untyped 500)
  5. The OpenAPI docs UI at `/docs` renders all registered routes
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md — Scaffold layer: requirements.txt, .env.example, app/config.py, app/models/loader.py, app/dependencies.py
- [x] 01-02-PLAN.md — App wiring: app/main.py (lifespan, CORS, exception handlers, router), app/routers/health.py, app/schemas/health.py, smoke tests

### Phase 2: Data Endpoints
**Goal**: City planners (via the React frontend) can retrieve all tract and block geometries, pre-scored model predictions, county-wide summary stats, and batch tract details from a single running API
**Depends on**: Phase 1
**Requirements**: TRACT-01, TRACT-02, TRACT-03, BLOCK-01, BLOCK-02, PRED-01, PRED-02, SUM-01, BATCH-01
**Success Criteria** (what must be TRUE):
  1. `GET /api/v1/tracts` returns a valid GeoJSON FeatureCollection where each Feature has a geometry object (not an escaped string) and properties containing tract_id, xgb_heat_score, xgb_risk_score, tf_risk_score
  2. `GET /api/v1/tracts/{tract_id}` returns the full tract_features column set plus all three model scores as typed JSON for a given tract ID
  3. `GET /api/v1/blocks?tract_id={id}` returns a GeoJSON FeatureCollection of blocks scoped to that tract
  4. `GET /api/v1/predictions/tracts/ranked?sort_by=xgb_heat_score&order=desc&limit=10` returns the 10 highest-heat tracts without geometry
  5. `GET /api/v1/summary/county` returns `{tract_count, mean_heat_score, p75_heat_score, high_risk_tract_count}` as aggregate stats
**Plans**: 5 plans

Plans:
- [ ] 02-01-PLAN.md — DuckDB build pipeline: scripts/build_duckdb.py creates king_county.duckdb from CSVs + TIGER geometry
- [ ] 02-02-PLAN.md — Interface contracts: all Pydantic schemas + shared pytest fixture (geojson-pydantic added to requirements.txt)
- [ ] 02-03-PLAN.md — Tract endpoints: GET /tracts, /tracts/{id}, /tracts/{id}/geometry, POST /tracts/batch (TRACT-01, TRACT-02, TRACT-03, BATCH-01)
- [ ] 02-04-PLAN.md — Block endpoints: GET /blocks?tract_id=, /blocks/{block_id} (BLOCK-01, BLOCK-02)
- [ ] 02-05-PLAN.md — Prediction, summary endpoints: GET /predictions/tracts, /predictions/tracts/ranked, /summary/county (PRED-01, PRED-02, SUM-01)

### Phase 3: Simulation Engine
**Goal**: Planners can submit one or two cooling intervention scenarios for a set of tracts and receive quantified delta heat and risk scores that reflect the parametric formula logic
**Depends on**: Phase 2
**Requirements**: SIM-01, SIM-02
**Success Criteria** (what must be TRUE):
  1. `POST /api/v1/simulations/what-if` with `{tract_ids, interventions: {tree_canopy_pct, albedo_delta, green_space_sqft}}` returns per-tract `{tract_id, delta_temp, delta_risk}` with physically bounded values (no output below absolute zero or above physical maximum)
  2. `POST /api/v1/simulations/compare` with two scenario payloads returns side-by-side per-tract deltas for scenario_a and scenario_b in a single response
  3. Sending an empty `tract_ids` list or a tract ID not present in DuckDB returns a 422 or 404 with the standard `{error, detail, status_code}` shape (not a 500)
**Plans**: 2 plans

Plans:
- [ ] 03-01-PLAN.md — Schemas + service: app/schemas/simulations.py, app/services/simulations.py (parametric formula engine with shared _compute_simulation)
- [ ] 03-02-PLAN.md — Router + tests + wiring: app/routers/simulations.py, tests/test_simulations.py, app/main.py (SIM-01, SIM-02)

### Phase 4: Chat Endpoint
**Goal**: Planners can ask natural-language questions about the heat data currently visible on the map and receive a contextually grounded response from Claude
**Depends on**: Phase 3
**Requirements**: CHAT-01
**Success Criteria** (what must be TRUE):
  1. `POST /api/v1/chat` with `{message, map_context: {selected_tract_ids, current_scores, active_scenario}}` returns `{reply, usage}` where reply is a non-empty string from Claude
  2. The system prompt injected into Claude includes the selected tract IDs, their current scores, and active scenario parameters — not raw full feature vectors
  3. Selecting more than 50 tracts does not cause a context window overflow; the system prompt remains under the model's token limit
**Plans**: 1 plan

Plans:
- [ ] 04-01-PLAN.md — Schemas, service, async router, tests, and main.py wiring: app/schemas/chat.py, app/services/chat.py, app/routers/chat.py, tests/test_chat.py, app/main.py (CHAT-01)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 2/2 | Complete   | 2026-02-28 |
| 2. Data Endpoints | 5/5 | Complete   | 2026-02-28 |
| 3. Simulation Engine | 2/2 | Complete   | 2026-03-01 |
| 4. Chat Endpoint | 1/1 | Complete   | 2026-03-01 |
