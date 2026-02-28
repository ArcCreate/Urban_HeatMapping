# Project Research Summary

**Project:** Urban Heat Mapping — King County Backend API
**Domain:** Geospatial data API — FastAPI + DuckDB + in-memory ML model serving + LLM chat
**Researched:** 2026-02-28
**Confidence:** MEDIUM-HIGH

## Executive Summary

This project is a read-only geospatial analytics API that serves census tract and block data, pre-scored ML predictions, parametric what-if simulations, and an AI chat assistant to a React mapping frontend. The dominant pattern for this class of product is a typed FastAPI application that loads static data from an in-process analytical database (DuckDB), holds ML models in process memory at startup, and delegates LLM work to an external provider (Anthropic). The technology choices are almost entirely pre-decided in PROJECT.md — FastAPI 0.134.0, DuckDB 1.2.x, XGBoost, TensorFlow, and the Anthropic Python SDK 0.84.0 — which significantly narrows implementation decisions. The recommended build approach is a layered architecture: a thin router layer for HTTP concerns, a service layer for business logic (DB queries, formula engine, prompt building), and a lifespan context manager that wires all shared resources (DB connection, models, Anthropic client) into `app.state` at startup.

The single most important architectural decision is the DuckDB connection lifecycle. DuckDB's Python client is not thread-safe for write connections and requires careful handling for concurrent reads. The recommended pattern for this project is a single `read_only=True` connection opened at lifespan startup and shared via FastAPI's dependency injection — acceptable because all API operations are read-only and King County tract scale (~400-500 tracts) does not require connection pooling in v1. The second critical decision is geometry serialization: DuckDB's `ST_AsGeoJSON()` returns a JSON string, not a nested object, and must be parsed with `json.loads()` before Pydantic serialization or the frontend map library will silently fail to render polygons.

The key risks are concentrated in startup wiring and geometry handling. TensorFlow model loading blocks the event loop if not wrapped in an executor; XGBoost and TensorFlow can conflict over OpenMP on macOS arm64; large GeoJSON payloads (5-20 MB for full-county geometry) can freeze the React frontend without simplification; and the Anthropic chat endpoint can overflow the context window if full tract feature vectors are injected for large selections. All of these risks are well-understood and have clear mitigations that must be addressed in the first two build phases.

---

## Key Findings

### Recommended Stack

The stack is substantially fixed by PROJECT.md. FastAPI 0.134.0 (verified) with Pydantic v2 is the web framework; DuckDB 1.2.x with the spatial extension handles all data access; XGBoost (>=2.0) and TensorFlow (>=2.15) serve as in-memory model stores; the Anthropic Python SDK 0.84.0 (verified) powers the AI chat endpoint. The only meaningful implementation choice is the DuckDB connection pattern and the async/sync boundary for route handlers.

**Core technologies:**
- **FastAPI 0.134.0 + Uvicorn 0.41.0**: Web framework and ASGI server — typed, async-native, auto-generates OpenAPI docs, fixed by project spec
- **Pydantic v2 (>=2.7)**: Request/response validation — required by FastAPI 0.134.0; use v2 syntax (`model_dump`, `model_validate`) from day one
- **pydantic-settings**: Config and environment variable management — FastAPI-native pattern for reading `.env` files and validating settings
- **DuckDB 1.2.x + spatial extension**: In-process analytical database — zero infrastructure, single-file, SQL spatial functions (`ST_AsGeoJSON`, `ST_Simplify`) avoid Python-side geometry dependencies
- **XGBoost >=2.0**: Heat and risk model loading — load once at startup via `xgb.Booster.load_model()`; used for what-if inference, not baseline scoring
- **TensorFlow >=2.15**: TF risk model loading — `tf.keras.models.load_model()`; load in executor to avoid blocking event loop
- **anthropic 0.84.0**: Anthropic Claude API client — use `AsyncAnthropic` for the async chat endpoint; reads `ANTHROPIC_API_KEY` from env
- **pytest + httpx + pytest-asyncio**: Test suite — FastAPI's `TestClient` is httpx-backed; use lifespan override for mock model injection

> See `.planning/research/STACK.md` for version verification details and async/sync boundary patterns.

### Expected Features

The frontend requires a specific set of endpoints to function. The product value lives in the what-if simulation and map-context-aware chat — generic data retrieval is table stakes.

**Must have (table stakes — frontend cannot function without these):**
- `GET /tracts` — GeoJSON FeatureCollection with heat/risk scores for choropleth map layer
- `GET /tracts/{tract_id}` — full feature vector + all three model scores for detail panel
- `GET /predictions/tracts` — pre-scored XGBoost heat, XGBoost risk, TF risk scores for all tracts
- `POST /simulations/what-if` — parametric intervention calculator returning delta scores per tract
- `POST /chat` — Claude-powered assistant with map state injected as system prompt context
- `GET /blocks?tract_id=` — block-level drill-down within a selected tract
- `GET /health` — liveness check with `models_loaded` and `db_connected` flags
- CORS configured for React dev server origins (`localhost:3000`, `localhost:5173`)
- Typed JSON error responses with consistent `{error, detail, status_code}` shape
- `/api/v1/` prefix on all routes from day one

**Should have (differentiators that add meaningful value):**
- Multi-score response format — return all three model scores together to expose model agreement signal
- Map-context-aware chat — system prompt includes selected tract IDs, current scores, active scenario (not just a generic LLM chat)
- `GET /predictions/tracts/ranked` — `?sort_by=&order=&limit=` to surface worst tracts without client-side sorting
- `GET /summary/county` — aggregate statistics for dashboard header widgets
- `POST /tracts/batch` — multi-ID fetch to avoid N+1 round trips for selected-set operations
- `GET /simulations/formulas` — formula coefficient transparency endpoint for planner trust

**Defer to v2+:**
- Authentication / API keys / JWT — no external consumers in v1
- Streaming chat responses (WebSocket / SSE) — adds frontend infrastructure complexity
- Persistent server-side conversation history — frontend can own turn history in v1
- Bounding-box spatial filter — full King County tract set (~400-500 tracts) fits in one response
- `POST /simulations/compare` — side-by-side scenario comparison
- Budget allocation optimizer — explicitly out of scope per PROJECT.md
- Vector tile (MVT) serving — GeoJSON is sufficient for single internal frontend
- Write/mutation endpoints — all data comes from the offline pipeline; API is read-only

> See `.planning/research/FEATURES.md` for full feature dependency graph and API convention table.

### Architecture Approach

The recommended architecture is a layered FastAPI application with clear separation between HTTP routing and business logic, all shared resources initialized in the lifespan context manager and accessed via FastAPI's dependency injection. Routers own HTTP parsing and response shaping. Service classes own DuckDB queries, formula computation, and Anthropic API calls. `app.state` holds the DuckDB connection, the `LoadedModels` dataclass, and the Anthropic client — all initialized once at startup and torn down at shutdown.

**Major components:**
1. **App entrypoint (`app/main.py`)** — lifespan wiring, router registration, CORS middleware; the only file that knows about all other modules
2. **Config (`app/config.py`)** — `pydantic-settings` Settings class reading DB path, model file paths, API key, and CORS origins from environment
3. **DB client (`app/db.py`)** — single factory function returning `duckdb.connect(path, read_only=True)`; called once in lifespan, stored as `app.state.db`
4. **Model loader (`app/models/loader.py`)** — `LoadedModels` dataclass + `load_models()` factory; wraps XGBoost and Keras loading; called once in lifespan
5. **Dependencies (`app/dependencies.py`)** — `get_db`, `get_models`, `get_anthropic` functions for `Depends()` injection into route handlers
6. **Tracts router + TractService** — `GET /tracts`, `GET /tracts/{id}`, `GET /tracts/{id}/geometry`, `GET /blocks?tract_id=`; DuckDB query layer
7. **Simulate router + SimService** — `POST /simulations/what-if`; parametric formula engine with physical bounds clipping
8. **Chat router + ChatService** — `POST /chat`; system prompt builder with map context injection + Anthropic API call
9. **Schemas (`app/schemas/`)** — Pydantic v2 models for all request/response shapes; the shared contract between routers and services

> See `.planning/research/ARCHITECTURE.md` for full data flow diagrams, code patterns, and anti-pattern list.

### Critical Pitfalls

1. **DuckDB thread-unsafe shared connection** — A single `duckdb.connect()` object shared across concurrent requests causes `ConnectionException` crashes or silent data mixing. Mitigation: use a per-request `Depends()` that yields a fresh `read_only=True` connection, or validate that a single shared read-only connection is safe for the actual concurrency model (single-worker Uvicorn, analytical reads only). Address in Phase 1.

2. **TensorFlow model loading blocks the event loop** — `tf.keras.models.load_model()` is slow and synchronous. Called in the lifespan startup coroutine it blocks the event loop for seconds, causing healthcheck failures and startup timeouts. Mitigation: wrap in `asyncio.to_thread()` or `run_in_executor`. Address in Phase 1.

3. **WKT vs GeoJSON serialization mismatch** — `ST_AsGeoJSON()` returns a VARCHAR containing a JSON string, not a nested object. Pydantic serializes it as an escaped string inside the response, which map libraries cannot render. Mitigation: always call `json.loads(row["geom_geojson"])` before constructing the Pydantic response model, and type the geometry field as `dict`. Address at the start of Phase 2.

4. **Large GeoJSON payload size** — Full King County tract geometry at source resolution can produce a 5-20 MB response. Block-level geometry can exceed 100 MB. Mitigation: use `ST_SimplifyPreserveTopology` in the DuckDB query (tolerance ~0.0001 degrees is imperceptible at county zoom); measure actual payload sizes against `king_county.duckdb` before frontend integration. Address in Phase 2.

5. **Anthropic context window overflow for large tract selections** — If the full `tract_features` row is serialized into the system prompt for 50+ selected tracts, the prompt can reach 25,000+ tokens before the user's question is included. Mitigation: project each tract to a minimal summary (tract ID, heat score, risk score, top 3 features) and apply an aggregate fallback when selection exceeds N tracts. Add a token count assertion in tests. Address in Phase 3.

> Additional pitfalls: XGBoost+TF OpenMP conflict on macOS arm64 (set `OMP_NUM_THREADS=1` before import), ML models loaded at import time breaking test suite (use `app.state` via lifespan), parametric formula outputs requiring physical bounds clipping, CRS verification for DuckDB geometry before first geometry endpoint. See `.planning/research/PITFALLS.md`.

---

## Implications for Roadmap

Based on combined research, the dependency graph is clear and strongly constrains phase ordering. The DuckDB connection and startup wiring must be correct before any endpoint is built on top of it. Geometry serialization must be verified before any frontend work proceeds. The formula engine is independent of the Anthropic chat. Suggested phase structure:

### Phase 1: Foundation and Startup Wiring

**Rationale:** Every subsequent phase depends on correct startup behavior. DuckDB connection threading, ML model loading without blocking the event loop, and config management must be settled first. Errors here corrupt all downstream work.

**Delivers:** A running FastAPI app that starts cleanly, connects to DuckDB, loads all three models into `app.state`, initializes the Anthropic client, and serves `GET /health` with accurate `models_loaded` and `db_connected` status.

**Addresses:** `GET /health`, CORS setup, `/api/v1/` prefix, Pydantic v2 schema foundation

**Avoids:**
- Pitfall 1 (DuckDB thread safety) — establish the connection pattern before any routes use it
- Pitfall 2 (TF blocking event loop) — wrap model loading in executor in this phase
- Pitfall 6 (models loaded at import time) — enforce `app.state` pattern from the start
- Pitfall 10 (XGBoost + TF OpenMP conflict) — test import order on target platform
- Pitfall 11 (Pydantic v1 syntax mixing) — pin v2 and use v2 syntax from day one
- Pitfall 7 (CORS missing) — add middleware before any frontend connection is attempted

**Research flag:** Standard patterns — no additional research needed. FastAPI lifespan and `app.state` are well-documented. See STACK.md and ARCHITECTURE.md for verified code patterns.

---

### Phase 2: Data Access and Geometry Endpoints

**Rationale:** The frontend's primary function (rendering the choropleth map) requires tract geometry and scores. These endpoints form the foundation the frontend team needs to begin integration. Geometry serialization is the highest-risk implementation detail and must be validated with real `king_county.duckdb` data before proceeding.

**Delivers:** `GET /tracts` (GeoJSON FeatureCollection with scores), `GET /tracts/{tract_id}`, `GET /tracts/{tract_id}/geometry`, `GET /blocks?tract_id=`, `GET /blocks/{block_id}`, `GET /predictions/tracts`

**Uses:** DuckDB spatial extension (`ST_AsGeoJSON`, `ST_SimplifyPreserveTopology`, `ST_Transform`), Pydantic v2 schemas for GeoJSON types, `def` route handlers (not `async def`) for DuckDB queries

**Implements:** TractService (DuckDB query logic), schemas/tracts.py, schemas/blocks.py, GET routes in tracts.py router

**Avoids:**
- Pitfall 3 (large payload) — apply `ST_SimplifyPreserveTopology` from the first query; measure response size
- Pitfall 4 (WKT/GeoJSON mismatch) — `json.loads(ST_AsGeoJSON())` pattern enforced; unit test asserts geometry is a dict not a string
- Pitfall 13 (async event loop blocking) — use `def` route handlers for all DuckDB endpoints
- Pitfall 14 (wrong CRS) — run `ST_SRID` check at start of this phase before writing endpoint code

**Research flag:** Standard patterns for DuckDB + FastAPI. CRS verification (`ST_SRID`, `ST_Transform`) may require a quick lookup in DuckDB spatial docs if the database geometry CRS is unknown.

---

### Phase 3: What-If Simulation Engine

**Rationale:** This is the core product differentiator. It is independent of the Anthropic chat and can be built and validated before the chat endpoint. The parametric formula coefficients must be defined and documented before implementation.

**Delivers:** `POST /simulations/what-if` returning delta heat and risk scores per tract for given interventions (tree canopy, albedo, green space)

**Uses:** SimService (parametric formula engine), SimRequest/SimResponse Pydantic schemas, DuckDB for baseline feature fetch, `numpy.clip` for physical bounds enforcement

**Implements:** services/simulate.py, routers/simulate.py, schemas/simulate.py

**Avoids:**
- Pitfall 8 (physically impossible output values) — define and document physical bounds for every output before writing formula code; apply `np.clip` to all outputs; unit test edge cases

**Research flag:** The parametric formula coefficients (ΔT per % tree canopy, ΔT per albedo delta, ΔT per ha green space) are not in the research files. These must come from the PROJECT.md domain data or project stakeholders before implementation. This is a content gap, not a technical gap. Confirm coefficient source before starting this phase.

---

### Phase 4: AI Chat Endpoint

**Rationale:** The chat endpoint has the most external dependencies (Anthropic API key, live network call) and the most context-design work (system prompt structure, token budget). Building it last means the DuckDB data and simulation results it references are already implemented and can be tested together.

**Delivers:** `POST /chat` — Claude-powered assistant with map context (selected tract IDs, current scores, active scenario parameters) injected as system prompt; stateless per request

**Uses:** ChatService (system prompt builder + Anthropic API call), AsyncAnthropic client, ChatRequest/ChatResponse Pydantic schemas, `app.state.anthropic` via dependency injection

**Implements:** services/chat.py, routers/chat.py, schemas/chat.py

**Avoids:**
- Pitfall 5 (context window overflow) — design the context projection schema (minimal per-tract summary, aggregate fallback for large selections) before writing prompt code; unit test with 100 tracts selected; log token counts in production
- Anti-pattern: persistent server-side conversation history — frontend owns turn history in v1; backend is stateless

**Research flag:** Context budget design needs attention. The token projection schema (which tract fields to include, how to summarize large selections) should be validated with a test call to the Anthropic API before the endpoint is considered complete. The Claude model version (`claude-opus-4-6` vs `claude-sonnet-4-6`) and cost implications should be confirmed with project stakeholders.

---

### Phase 5: Polish, Validation, and Differentiator Features

**Rationale:** Once all core endpoints are functional, the remaining differentiator features (ranked predictions, county summary, batch lookup, formula transparency) add value without blocking the frontend. This phase also covers integration testing and response size validation.

**Delivers:**
- `GET /predictions/tracts/ranked` (`?sort_by=&order=&limit=`)
- `GET /summary/county` (aggregate statistics)
- `POST /tracts/batch` (multi-ID fetch)
- `GET /simulations/formulas` (coefficient transparency)
- Float precision optimization (round geometry coordinates to 6 decimal places)
- Response size assertions in test suite
- Integration tests covering concurrent request handling

**Research flag:** Standard patterns — no additional research needed. These are all simple DuckDB query variations or hardcoded metadata endpoints.

---

### Phase Ordering Rationale

- **Phase 1 before everything**: Startup wiring bugs (DuckDB threading, TF event loop blocking) corrupt every endpoint built on top. Fixing them after 4 endpoints exist is expensive.
- **Phase 2 before Phase 4**: The chat endpoint references prediction scores and simulation results. Those must exist and be tested before context injection is designed.
- **Phase 3 before Phase 4**: The what-if simulation results are a key input to the chat context. The map state injected into chat prompts includes `active_scenario` results.
- **Phase 5 last**: Differentiator features are additive and non-blocking. Frontend integration can begin after Phase 2 completes.
- **Geometry verification in Phase 2 day one**: CRS and payload size issues discovered late in development require retroactive fixes to every geometry endpoint. Verify before writing endpoint code.

### Research Flags

**Needs additional research or validation during planning:**
- **Phase 3 (What-If Engine):** Parametric formula coefficients (ΔT per intervention unit) are not documented in research files. Must be sourced from PROJECT.md domain context, academic literature, or project stakeholders before implementation begins.
- **Phase 4 (Chat):** Context token budget and Claude model selection (Opus vs Sonnet) need stakeholder confirmation. Cost-per-request varies significantly between models.
- **Phase 2 (Geometry):** `king_county.duckdb` geometry CRS must be verified before writing the first geometry endpoint. Cannot be determined from research alone — requires querying the actual database file.

**Standard patterns (no additional research needed):**
- **Phase 1 (Foundation):** FastAPI lifespan, `app.state`, Pydantic v2 settings, CORS — all verified from official docs.
- **Phase 2 (Data Endpoints):** DuckDB read-only connection pattern, `ST_AsGeoJSON` + `json.loads` serialization, `def` vs `async def` routing — all verified.
- **Phase 5 (Polish):** DuckDB `ORDER BY + LIMIT`, aggregation queries, float coordinate rounding — trivial variations on established patterns.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | FastAPI 0.134.0, Uvicorn 0.41.0, Anthropic 0.84.0 verified from GitHub. DuckDB 1.2.0 tag confirmed. XGBoost and TensorFlow versions unverified (training knowledge, LOW on exact version). Lifespan and async patterns HIGH. |
| Features | MEDIUM | No web research available; derived from PROJECT.md + established geospatial API domain knowledge. Feature list is complete and internally consistent but not validated against a similar live system. |
| Architecture | HIGH | FastAPI lifespan, `app.state`, dependency injection, DuckDB read-only connection model all derived from official documentation. Patterns are stable across FastAPI 0.95+. |
| Pitfalls | HIGH (DuckDB, FastAPI) / MEDIUM (TF/XGB conflict, payload sizes) | DuckDB thread safety, FastAPI async blocking, GeoJSON serialization, Pydantic v2 breaking changes all HIGH confidence. XGBoost + TF OpenMP conflict is platform-specific (macOS arm64). GeoJSON payload sizes are estimated from tract count — actual sizes depend on `king_county.duckdb` source resolution. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Formula coefficients for what-if engine**: No coefficient values (ΔT per % tree canopy, etc.) appear in the research. These are required to implement Phase 3. Source from domain literature or project stakeholders before planning Phase 3.
- **Exact XGBoost and TensorFlow versions**: Training knowledge cutoff August 2025. Run `pip index versions xgboost tensorflow` to confirm latest stable versions before pinning in `requirements.txt`.
- **`king_county.duckdb` schema and CRS**: The actual table names, column names, geometry column type (WKT string vs DuckDB native geometry), and CRS are not confirmed in research. Run schema discovery queries against the real database file before writing any DuckDB queries. The assumed table names (`tract_features`, `tract_outputs_with_preds`) come from PROJECT.md and should be verified.
- **Claude model selection for chat**: The architecture research uses `claude-opus-4-6` in example code but `claude-sonnet-4-6` in STACK.md. The cost and capability tradeoff should be confirmed with project stakeholders before the chat endpoint is finalized.
- **Block-level data availability**: The existence of a block-level geometry table in `king_county.duckdb` is assumed but not confirmed. Verify before building block endpoints in Phase 2.

---

## Sources

### Primary (HIGH confidence)
- FastAPI 0.134.0 source (`fastapi/__init__.py`, GitHub) — version, lifespan, CORS, async docs
- Uvicorn 0.41.0 source (`uvicorn/__init__.py`, GitHub) — version confirmed
- Anthropic SDK 0.84.0 CHANGELOG (GitHub) — version and `AsyncAnthropic` signature confirmed
- FastAPI official docs — lifespan events, dependency injection, `app.state`, CORS, async/def routing, settings
- DuckDB spatial extension docs — `ST_AsGeoJSON`, `ST_Simplify`, `ST_Transform`, `ST_SRID`
- DuckDB Python API docs — connection modes, read-only semantics
- Anthropic Messages API docs — `messages.create` signature, system prompt structure

### Secondary (MEDIUM confidence)
- Pydantic v2 source (`pydantic/version.py`, GitHub) — version 2.13.0b2 (pre-release at research time)
- DuckDB v1.2.0 CMakeLists.txt (GitHub) — tag confirmed, patch version not pinned
- PROJECT.md — feature requirements, out-of-scope decisions, technology constraints

### Tertiary (LOW confidence)
- XGBoost version — training knowledge (August 2025 cutoff); verify before pinning
- TensorFlow version — training knowledge (August 2025 cutoff); verify before pinning
- GeoJSON payload size estimates — calculated from King County tract count (~400-500) and typical shapefile vertex density; must be validated against actual `king_county.duckdb`

---
*Research completed: 2026-02-28*
*Ready for roadmap: yes*
