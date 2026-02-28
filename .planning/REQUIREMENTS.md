# Requirements: Urban Heat Mapping — King County Backend API

**Defined:** 2026-02-28
**Core Value:** City planners can explore where heat risk is highest across King County tracts, simulate the impact of interventions, and get AI-assisted reasoning — all through a fast, queryable JSON API.

## v1 Requirements

Requirements for initial release. Each maps to a roadmap phase.

### Infrastructure

- [x] **INFRA-01**: App serves all routes under `/api/v1/` prefix with FastAPI
- [x] **INFRA-02**: CORS is configured to allow all origins (internal use, dev frontend at localhost)
- [x] **INFRA-03**: `GET /api/v1/health` returns `{status, models_loaded, db_connected}` as a liveness check
- [x] **INFRA-04**: OpenAPI/Swagger UI is available at `/docs` (FastAPI default, not disabled)
- [x] **INFRA-05**: XGBoost heat model, XGBoost risk model, and TensorFlow risk model load at startup via lifespan context manager without blocking the event loop
- [x] **INFRA-06**: DuckDB connection to `king_county.duckdb` is established at startup with `read_only=True` and accessible via dependency injection
- [x] **INFRA-07**: Anthropic client is initialized at startup and reused across chat requests
- [x] **INFRA-08**: All error responses return consistent JSON shape `{error, detail, status_code}`

### Tract Data

- [x] **TRACT-01**: `GET /api/v1/tracts` returns a GeoJSON FeatureCollection with all tracts; each Feature includes geometry and properties (tract_id, xgb_heat_score, xgb_risk_score, tf_risk_score)
- [x] **TRACT-02**: `GET /api/v1/tracts/{tract_id}` returns full tract detail (all tract_features columns + all 3 model scores) as typed JSON
- [x] **TRACT-03**: `GET /api/v1/tracts/{tract_id}/geometry` returns a lightweight GeoJSON Feature with geometry only (no feature vector)

### Block Data

- [x] **BLOCK-01**: `GET /api/v1/blocks` with required `?tract_id=` query param returns a GeoJSON FeatureCollection of blocks within that tract
- [x] **BLOCK-02**: `GET /api/v1/blocks/{block_id}` returns single block detail as typed JSON

### Predictions

- [x] **PRED-01**: `GET /api/v1/predictions/tracts` returns all tract IDs with their 3 pre-scored model values (no geometry) for frontend choropleth coloring
- [x] **PRED-02**: `GET /api/v1/predictions/tracts/ranked` accepts `?sort_by=`, `?order=desc|asc`, `?limit=N` params and returns tracts sorted by the chosen score

### Simulations

- [ ] **SIM-01**: `POST /api/v1/simulations/what-if` accepts `{tract_ids, interventions: {tree_canopy_pct, albedo_delta, green_space_sqft}}` and returns per-tract `{tract_id, delta_temp, delta_risk}` using rule-based parametric formulas
- [ ] **SIM-02**: `POST /api/v1/simulations/compare` accepts `{tract_ids, scenario_a, scenario_b}` (each scenario has the same intervention shape as what-if) and returns per-tract deltas for both scenarios side by side

### Chat

- [ ] **CHAT-01**: `POST /api/v1/chat` accepts `{message, map_context: {selected_tract_ids, current_scores, active_scenario}}`, injects map context into Claude system prompt, and returns `{reply, usage}`

### Summary

- [x] **SUM-01**: `GET /api/v1/summary/county` returns county-wide aggregate stats: `{tract_count, mean_heat_score, p75_heat_score, high_risk_tract_count}`

### Batch

- [x] **BATCH-01**: `POST /api/v1/tracts/batch` accepts `{tract_ids: [...]}` and returns full tract detail for each ID in a single round trip

## v2 Requirements

Deferred to future release.

### Simulations

- **SIM-V2-01**: Formula transparency endpoint `GET /simulations/formulas` exposing parametric formula coefficients and units
- **SIM-V2-02**: Bounding-box spatial filter `?bbox=minLon,minLat,maxLon,maxLat` on tract endpoints for viewport-driven queries

### Chat

- **CHAT-V2-01**: Streaming chat responses via SSE for lower perceived latency

### Auth

- **AUTH-V2-01**: API key authentication when the API is exposed beyond localhost

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Live model inference for baseline predictions | Pre-scored values in DuckDB are sufficient and faster; models in memory are for future what-if live inference only |
| Authentication / API keys | No external consumers in v1; single internal React consumer; adds velocity cost with no protection value |
| Rate limiting | Single consumer; no protection value in v1 |
| Persistent chat session history | Frontend manages message history and sends full context per request |
| Budget allocation optimizer | Complex LP/MILP problem; deserves its own phase; what-if data from v1 feeds this |
| Vector tile (MVT) serving | Not justified for single internal consumer; GeoJSON sufficient for King County scale |
| Write/mutation endpoints | DuckDB is read-only for the API; all mutations in offline pipeline scripts |
| External data enrichment at query time | Pre-computed features in DuckDB; API must be offline-capable |
| Multi-county scope | King County only; global scope inflates data model before v1 is validated |
| WebSocket / SSE streaming for chat (v1) | Full reply string sufficient for v1; streaming deferred to v2 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1: Foundation | Complete |
| INFRA-02 | Phase 1: Foundation | Complete |
| INFRA-03 | Phase 1: Foundation | Complete |
| INFRA-04 | Phase 1: Foundation | Complete |
| INFRA-05 | Phase 1: Foundation | Complete (01-01) |
| INFRA-06 | Phase 1: Foundation | Complete (01-01) |
| INFRA-07 | Phase 1: Foundation | Complete (01-01) |
| INFRA-08 | Phase 1: Foundation | Complete |
| TRACT-01 | Phase 2: Data Endpoints | Complete |
| TRACT-02 | Phase 2: Data Endpoints | Complete |
| TRACT-03 | Phase 2: Data Endpoints | Complete |
| BLOCK-01 | Phase 2: Data Endpoints | Complete |
| BLOCK-02 | Phase 2: Data Endpoints | Complete |
| PRED-01 | Phase 2: Data Endpoints | Complete |
| PRED-02 | Phase 2: Data Endpoints | Complete |
| SUM-01 | Phase 2: Data Endpoints | Complete |
| BATCH-01 | Phase 2: Data Endpoints | Complete |
| SIM-01 | Phase 3: Simulation Engine | Pending |
| SIM-02 | Phase 3: Simulation Engine | Pending |
| CHAT-01 | Phase 4: Chat Endpoint | Pending |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-28*
*Last updated: 2026-02-28 after roadmap creation*
