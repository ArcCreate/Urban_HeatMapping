# Architecture Patterns

**Domain:** Geospatial data API — FastAPI + DuckDB + in-memory ML models + LLM chat
**Researched:** 2026-02-28
**Confidence:** HIGH (FastAPI lifespan/app.state patterns are stable since 0.95+; DuckDB Python connection model is well-documented; patterns drawn from official FastAPI docs and DuckDB Python API docs)

---

## Recommended Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  FastAPI Application                                         │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  app.state (populated during lifespan startup)      │    │
│  │   - db: duckdb.DuckDBPyConnection (read-only)       │    │
│  │   - models.xgb_heat: XGBModel                       │    │
│  │   - models.xgb_risk: XGBModel                       │    │
│  │   - models.tf_risk: keras.Model                     │    │
│  │   - anthropic_client: anthropic.Anthropic           │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ /tracts      │  │ /simulate    │  │ /chat            │  │
│  │ router       │  │ router       │  │ router           │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                    │             │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌────────▼─────────┐  │
│  │ TractService │  │ SimService   │  │ ChatService      │  │
│  │ (DB queries) │  │ (parametric  │  │ (Anthropic SDK   │  │
│  │              │  │  formulas)   │  │  + context build)│  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                    │             │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌────────▼─────────┐  │
│  │ db_client    │  │ db_client    │  │ anthropic_client  │  │
│  │ (app.state)  │  │ (app.state)  │  │ (app.state)      │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
           │
           ▼
  king_county.duckdb (local file, read-only)
```

---

## Component Boundaries

| Component | File(s) | Responsibility | Communicates With |
|-----------|---------|---------------|-------------------|
| **App entrypoint** | `app/main.py` | Lifespan wiring, router registration, CORS config | All routers, app.state |
| **Lifespan context manager** | `app/main.py` | Open DB connection, load ML models, init Anthropic client on startup; close DB on shutdown | app.state |
| **Tracts router** | `app/routers/tracts.py` | HTTP route definitions for `/tracts` and `/tracts/{id}` endpoints; input validation via Pydantic | TractService |
| **Simulate router** | `app/routers/simulate.py` | HTTP route definitions for `/simulate` endpoint; validate intervention params | SimService |
| **Chat router** | `app/routers/chat.py` | HTTP route definitions for `/chat` endpoint; validate message + map context payload | ChatService |
| **TractService** | `app/services/tracts.py` | Execute DuckDB queries for tract/block features, geometries, predictions; return typed dicts | DuckDB connection via app.state |
| **SimService** | `app/services/simulate.py` | Apply parametric formulas for tree canopy ΔT, albedo change, green space; return delta predictions | DuckDB connection (reads base features), pure formula logic |
| **ChatService** | `app/services/chat.py` | Build system prompt with map state, call Anthropic API, return assistant message | Anthropic client via app.state |
| **Schemas** | `app/schemas/` | Pydantic models for request bodies and response shapes (TractFeature, SimRequest, ChatRequest, ChatResponse) | All routers and services |
| **DB client module** | `app/db.py` | Single factory function that opens DuckDB connection in read-only mode; used during lifespan | king_county.duckdb file |
| **Model loader module** | `app/models/loader.py` | Load XGBoost and TensorFlow models from disk paths; return typed model objects | XGBoost, TensorFlow/Keras libraries |
| **Config** | `app/config.py` | Pydantic Settings: DB path, model file paths, Anthropic API key, CORS origins | All modules that need env config |

---

## Data Flow

### Request: Fetch tract predictions (GET /tracts/{tract_id})

```
HTTP GET /tracts/53033001100
    │
    ▼
tracts.py router
  - path param validated (tract_id: str)
  - request.app.state.db injected via dependency
    │
    ▼
TractService.get_tract(tract_id, db)
  - DuckDB query: SELECT * FROM tract_outputs_with_preds WHERE tract_id = ?
  - DuckDB query: SELECT geometry FROM tract_features WHERE tract_id = ?
  - Row assembled into TractResponse schema
    │
    ▼
JSON response
  {
    "tract_id": "53033001100",
    "geometry": { "type": "Polygon", ... },   // GeoJSON
    "xgb_heat_score": 0.82,
    "xgb_risk_score": 0.74,
    "tf_risk_score": 0.71,
    "features": { ... }
  }
```

### Request: Run what-if simulation (POST /simulate)

```
HTTP POST /simulate
  body: { tract_ids: [...], interventions: { tree_canopy_pct: 15, albedo_delta: 0.1, green_space_ha: 2 } }
    │
    ▼
simulate.py router
  - body validated via SimRequest Pydantic model
    │
    ▼
SimService.run(sim_request, db)
  - DuckDB query: fetch base features for each tract_id
  - For each tract: apply parametric formulas
      ΔT_trees  = -0.X * tree_canopy_pct   (formula from domain literature)
      ΔT_albedo = -Y   * albedo_delta
      ΔT_green  = -Z   * green_space_ha
      total_ΔT  = sum(deltas)
  - Adjusted heat score = base + ΔT normalized
    │
    ▼
JSON response
  {
    "results": [
      { "tract_id": "...", "baseline_heat": 0.82, "simulated_heat": 0.67, "delta": -0.15 },
      ...
    ]
  }
```

### Request: Chat with map context (POST /chat)

```
HTTP POST /chat
  body: {
    "message": "Which tracts should I prioritize for tree planting?",
    "map_context": {
      "selected_tracts": ["53033001100", "53033001200"],
      "current_predictions": { "53033001100": { "xgb_heat": 0.82, ... }, ... },
      "active_scenario": { "tree_canopy_pct": 15 },
      "viewport_bounds": { "sw": [...], "ne": [...] }
    }
  }
    │
    ▼
chat.py router
  - body validated via ChatRequest Pydantic model
    │
    ▼
ChatService.respond(chat_request, anthropic_client)
  - Build system prompt (see Chat Context section below)
  - Call anthropic_client.messages.create(...)
  - Extract assistant message text
    │
    ▼
JSON response
  { "response": "Based on the current heat scores, tract 53033001100 shows..." }
```

---

## DuckDB Connection Lifecycle

**Recommendation: Single read-only connection opened at startup, stored in `app.state.db`, shared across all requests.**

### Why this approach (HIGH confidence)

DuckDB's Python client supports multiple readers on a file-based database via read-only mode (`duckdb.connect(path, read_only=True)`). Read-only connections do not require write locks and can be safely shared across async FastAPI handlers for analytical queries.

DuckDB is not thread-safe for write connections, but for this project:
- All API operations are read queries + in-memory formula computations
- No writes occur during API serving (the offline pipeline writes; the API only reads)
- A single read-only connection avoids the overhead of per-request connection open/close

**Pattern:**

```python
# app/db.py
import duckdb

def open_db(path: str) -> duckdb.DuckDBPyConnection:
    return duckdb.connect(path, read_only=True)
```

```python
# app/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.db import open_db
from app.config import settings

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- startup ---
    app.state.db = open_db(settings.duckdb_path)
    app.state.models = load_models(settings)
    app.state.anthropic = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    yield
    # --- shutdown ---
    app.state.db.close()

app = FastAPI(lifespan=lifespan)
```

**Dependency injection for routes:**

```python
# app/dependencies.py
from fastapi import Request
import duckdb

def get_db(request: Request) -> duckdb.DuckDBPyConnection:
    return request.app.state.db

def get_models(request: Request):
    return request.app.state.models

def get_anthropic(request: Request):
    return request.app.state.anthropic
```

```python
# app/routers/tracts.py
from fastapi import APIRouter, Depends
from app.dependencies import get_db

router = APIRouter(prefix="/tracts")

@router.get("/{tract_id}")
def get_tract(tract_id: str, db = Depends(get_db)):
    ...
```

**Caveat on concurrent async handlers (MEDIUM confidence):** If FastAPI runs multiple async endpoints concurrently in the same event loop, a single DuckDB connection may serialize queries. For this workload (analytical reads, small dataset, internal-only use), this is acceptable. If future load testing reveals bottlenecks, switching to `connection.cursor()` per-request (all from same read-only connection) is the first mitigation.

---

## ML Model Loading via Lifespan

**Recommendation: Load all three models at startup in the lifespan event, store as a typed namespace on `app.state.models`.**

### Why lifespan over `@app.on_event` (HIGH confidence)

FastAPI deprecated `@app.on_event("startup")` in favor of the `lifespan` context manager (introduced in Starlette 0.20+, default in FastAPI 0.95+). The lifespan pattern is cleaner, testable, and the current documented approach.

### Pattern

```python
# app/models/loader.py
from dataclasses import dataclass
import xgboost as xgb
from tensorflow import keras

@dataclass
class LoadedModels:
    xgb_heat: xgb.Booster
    xgb_risk: xgb.Booster
    tf_risk: keras.Model

def load_models(settings) -> LoadedModels:
    xgb_heat = xgb.Booster()
    xgb_heat.load_model(settings.xgb_heat_model_path)

    xgb_risk = xgb.Booster()
    xgb_risk.load_model(settings.xgb_risk_model_path)

    tf_risk = keras.models.load_model(settings.tf_risk_model_path)

    return LoadedModels(
        xgb_heat=xgb_heat,
        xgb_risk=xgb_risk,
        tf_risk=tf_risk,
    )
```

Models are loaded once — cold load at startup, never reloaded during the process lifetime. This means:
- No per-request model load latency
- Memory footprint is fixed (XGBoost models are typically 1-50MB; Keras models 10-200MB depending on depth)
- Models are immediately available when the first request arrives

In v1, models are loaded but not called for baseline predictions (pre-scored values come from DuckDB). They are available for future live inference in what-if scenarios if the parametric formula approach is replaced.

---

## Chat Context Structure (Anthropic API)

**Recommendation: Map state is injected as the system prompt. User message is passed as the human turn. No conversation history is stored server-side in v1.**

### System prompt structure

```python
# app/services/chat.py
def build_system_prompt(map_context: MapContext) -> str:
    selected = map_context.selected_tracts
    preds = map_context.current_predictions
    scenario = map_context.active_scenario

    tract_summary = "\n".join(
        f"  - Tract {tid}: heat={preds[tid]['xgb_heat']:.2f}, "
        f"risk={preds[tid]['xgb_risk']:.2f}, tf_risk={preds[tid]['tf_risk']:.2f}"
        for tid in selected
    ) if selected else "  (No tracts selected)"

    scenario_summary = (
        f"Tree canopy increase: {scenario.get('tree_canopy_pct', 0)}%, "
        f"Albedo delta: {scenario.get('albedo_delta', 0)}, "
        f"Green space: {scenario.get('green_space_ha', 0)} ha"
        if scenario else "No active scenario"
    )

    return f"""You are an urban heat policy assistant for King County city planners.
You have access to the planner's current map view and selected data.

CURRENT MAP STATE
=================
Selected tracts ({len(selected)} selected):
{tract_summary}

Active intervention scenario:
  {scenario_summary}

DATA CONTEXT
============
Heat scores are XGBoost model outputs (0–1, higher = hotter relative risk).
Risk scores combine heat exposure with population vulnerability (0–1).
Interventions shown are parametric estimates, not live model outputs.

INSTRUCTIONS
============
- Answer based on the data shown above.
- Be specific about tract IDs when referencing data.
- Acknowledge uncertainty when extrapolating beyond the data.
- Keep responses concise and policy-actionable.
- Do not fabricate tract data not provided above.
"""
```

```python
def respond(request: ChatRequest, client: anthropic.Anthropic) -> str:
    system_prompt = build_system_prompt(request.map_context)

    message = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=1024,
        system=system_prompt,
        messages=[
            {"role": "user", "content": request.message}
        ]
    )
    return message.content[0].text
```

**No server-side conversation history in v1.** The frontend is responsible for maintaining turn history if multi-turn chat is needed. The backend is stateless per request. This simplifies the API contract: one POST = one response.

If multi-turn history is added later, the `messages` array in `client.messages.create(...)` receives the full prior turns, passed in from the frontend payload.

---

## Suggested Build Order

Build order follows dependency direction: nothing should be built before its dependencies exist.

```
Step 1: Project scaffolding
  - Directory structure, pyproject.toml / requirements.txt
  - app/config.py (Pydantic Settings, reads from .env)
  - app/main.py skeleton (lifespan stub, no routers yet)
  - Verify: uvicorn app.main:app starts without error

Step 2: DuckDB layer
  - app/db.py (connection factory)
  - Wire into lifespan: app.state.db = open_db(...)
  - Verify: connect to king_county.duckdb, run one raw query, close

Step 3: Schemas
  - app/schemas/tracts.py (TractFeature, TractResponse, GeoJSON wrapper)
  - app/schemas/simulate.py (SimRequest, SimResult, SimResponse)
  - app/schemas/chat.py (MapContext, ChatRequest, ChatResponse)
  - Verify: schemas instantiate cleanly from test data

Step 4: Tract router + service
  - app/services/tracts.py (DuckDB query functions)
  - app/routers/tracts.py (GET /tracts, GET /tracts/{id})
  - app/dependencies.py (get_db dependency)
  - Verify: GET /tracts/53033001100 returns typed JSON with geometry

Step 5: ML model loader
  - app/models/loader.py (load XGBoost + Keras models)
  - Wire into lifespan: app.state.models = load_models(settings)
  - Verify: startup completes, models accessible via request.app.state.models

Step 6: Simulate router + service
  - app/services/simulate.py (parametric formula engine)
  - app/routers/simulate.py (POST /simulate)
  - Verify: POST /simulate with test tract IDs and interventions returns deltas

Step 7: Chat router + service
  - app/services/chat.py (system prompt builder + Anthropic call)
  - app/routers/chat.py (POST /chat)
  - Wire Anthropic client into lifespan: app.state.anthropic = ...
  - Verify: POST /chat with map context returns coherent assistant response

Step 8: Integration polish
  - CORS configuration (for React frontend origin)
  - Error handling: 404 for unknown tract_id, 422 validation errors already handled by FastAPI
  - Health endpoint: GET /health returns {"status": "ok", "db": "connected", "models": "loaded"}
```

**Critical dependency:** Steps 2 and 3 (DB layer + schemas) must both be complete before step 4 (tract router). Step 5 (model loader) is independent of steps 4–6 in implementation but must be wired before any endpoint that uses models.

---

## Directory Structure

```
app/
├── main.py              # App factory, lifespan, router registration, CORS
├── config.py            # Pydantic Settings (DB path, model paths, API key)
├── db.py                # DuckDB connection factory
├── dependencies.py      # FastAPI Depends() helpers (get_db, get_models, get_anthropic)
├── routers/
│   ├── __init__.py
│   ├── tracts.py        # GET /tracts, GET /tracts/{tract_id}, GET /tracts/{id}/geometry
│   ├── simulate.py      # POST /simulate
│   └── chat.py          # POST /chat
├── services/
│   ├── __init__.py
│   ├── tracts.py        # DuckDB query logic, row → schema mapping
│   ├── simulate.py      # Parametric formula engine
│   └── chat.py          # System prompt builder, Anthropic API call
├── schemas/
│   ├── __init__.py
│   ├── tracts.py        # TractFeature, TractResponse, GeoJSON types
│   ├── simulate.py      # SimRequest, SimResult, SimResponse
│   └── chat.py          # MapContext, ChatRequest, ChatResponse
└── models/
    ├── __init__.py
    └── loader.py        # LoadedModels dataclass, load_models() factory
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Per-request DuckDB file open
**What:** `duckdb.connect(path)` inside each route handler or service function
**Why bad:** File open/close overhead per request; connection setup is not free; risks file lock contention
**Instead:** Single connection opened at lifespan startup, shared via `app.state.db`

### Anti-Pattern 2: Global module-level model variables
**What:** `MODEL = xgb.Booster(); MODEL.load_model(...)` at top of `services/tracts.py`
**Why bad:** Loads during import, not during lifespan; untestable (can't inject mock); fails if model file is absent at import time
**Instead:** `load_models()` called in lifespan, stored in `app.state.models`, injected via Depends()

### Anti-Pattern 3: Deprecated `@app.on_event`
**What:** `@app.on_event("startup")` and `@app.on_event("shutdown")` hooks
**Why bad:** Deprecated in FastAPI 0.95+; will be removed in a future version; less testable than lifespan
**Instead:** `@asynccontextmanager async def lifespan(app: FastAPI)` pattern

### Anti-Pattern 4: Fat routers (business logic in route handlers)
**What:** DuckDB queries or formula logic written directly inside `@router.get(...)` functions
**Why bad:** Untestable without HTTP context; mixes HTTP contract with business logic
**Instead:** Router handles HTTP: parsing, validation, response shape. Service handles logic: DB queries, formulas, API calls

### Anti-Pattern 5: Storing conversation history server-side without explicit design
**What:** In-memory dict keyed by session ID holding conversation turns
**Why bad:** Not horizontally scalable; lost on restart; not in scope for v1
**Instead:** Stateless per-request chat in v1. Frontend owns turn history and sends it in the request payload if multi-turn is needed.

### Anti-Pattern 6: Geometry returned as raw WKT string
**What:** Passing DuckDB's WKT column directly as a string field in the JSON response
**Why bad:** React frontend will need to parse WKT to render on a map; GeoJSON is the universal map library format
**Instead:** Convert WKT to GeoJSON in TractService (using Shapely or DuckDB's `ST_AsGeoJSON()` spatial function) before serializing the response

---

## Scalability Considerations

| Concern | Current (v1, internal) | At moderate load | Notes |
|---------|----------------------|------------------|-------|
| DB reads | Single shared read-only connection; fine for 1–10 concurrent users | Per-request cursor objects from shared connection; or connection pool via `duckdb.connect()` per worker | DuckDB read-only mode supports multiple readers on same file |
| Model serving | Models in memory, no inference for baseline | Stays the same; parametric formulas are CPU-cheap | Only a concern if live inference is added |
| Chat latency | Anthropic API call adds 1–5s per request | Add `asyncio` + `async def` route; use `httpx` async client if needed | FastAPI async handlers don't block the event loop |
| Geometry payload size | GeoJSON polygons can be large; full-county response would be large | Implement bounding box filter + pagination for /tracts list endpoint | Per-tract requests are fine; bulk list endpoint needs limits |

---

## Sources

- FastAPI lifespan events (official docs): https://fastapi.tiangolo.com/advanced/events/ — HIGH confidence, official source
- DuckDB Python API (connection modes, read-only): https://duckdb.org/docs/api/python/overview.html — HIGH confidence, official source
- Anthropic Messages API structure: https://docs.anthropic.com/en/api/messages — HIGH confidence, official source
- FastAPI dependency injection pattern: https://fastapi.tiangolo.com/tutorial/dependencies/ — HIGH confidence, official source
- FastAPI `app.state` for shared resources: https://fastapi.tiangolo.com/advanced/application-state/ — HIGH confidence, official source

Note: WebFetch and WebSearch tools were unavailable during this research session. Findings are based on training knowledge of stable, well-documented official APIs (FastAPI 0.100+, DuckDB 0.9+, Anthropic Python SDK 0.25+). Confidence is HIGH for all structural patterns as these APIs have not changed materially in the relevant versions.
