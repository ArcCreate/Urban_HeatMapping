# Technology Stack

**Project:** Urban Heat Mapping — King County Backend API
**Researched:** 2026-02-28
**Overall confidence:** MEDIUM-HIGH (core framework versions verified; ML library versions from training data)

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Python | 3.12 | Runtime | FastAPI and pydantic-settings both require >=3.10; 3.12 is stable, fast, and widely supported by all ML libraries in this stack |
| FastAPI | 0.134.0 | Web framework | Declared as fixed in PROJECT.md; typed, async, auto-OpenAPI docs; version verified from GitHub |
| Uvicorn | 0.41.0 | ASGI server | FastAPI's recommended ASGI server; ships with `fastapi[standard]`; version verified from GitHub |
| Pydantic | 2.x (>=2.7) | Request/response validation | FastAPI now requires Pydantic v2; required by FastAPI 0.134.0 per pyproject.toml |
| pydantic-settings | 2.x | Config/env management | Standard FastAPI pattern for `BaseSettings`; reads env vars + `.env` file; requires pydantic >=2.7 |

**Confidence:** HIGH (FastAPI 0.134.0 and Uvicorn 0.41.0 verified from GitHub `main` branch; pydantic requirement verified from FastAPI pyproject.toml)

---

### Database / Query Layer

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| duckdb | 1.2.x | In-process analytical query engine | Declared fixed in PROJECT.md; `king_county.duckdb` is the data source; single-file, zero-infra, fast for analytical queries over census tracts |
| duckdb-spatial extension | bundled with DuckDB | WKT -> GeoJSON conversion in SQL | `ST_AsGeoJSON(ST_GeomFromText(wkt_column))` converts stored WKT to GeoJSON fragment in a single SQL call; avoids Python-side geometry processing |

**DuckDB threading note:** DuckDB's in-process model means a single database connection should not be shared across concurrent requests. The correct pattern is to create one `duckdb.connect(read_only=True)` connection per request (cheap operation for read-only; no lock contention) or maintain a small per-thread connection pool. The `read_only=True` flag allows multiple simultaneous readers.

**Spatial SQL pattern (verified from duckdb_spatial README and function reference):**
```sql
LOAD spatial;
SELECT
  tract_id,
  ST_AsGeoJSON(ST_GeomFromText(geometry_wkt)) AS geometry
FROM census_tracts;
```

**Confidence:** MEDIUM — DuckDB 1.2.0 tag confirmed on GitHub; exact latest patch version (1.2.x) not pinned because DuckDB uses git-tag versioning and no static version file was found; spatial extension functions `ST_AsGeoJSON` and `ST_GeomFromText` confirmed from official function reference docs.

---

### ML Model Serving

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| xgboost | >=2.0 | XGBoost heat/risk model loading | Declared fixed in PROJECT.md; v2.x API is stable; load with `xgb.Booster.load_model()`; in-memory at startup |
| tensorflow | >=2.15 | TF risk model loading | Declared fixed in PROJECT.md; load with `tf.keras.models.load_model()`; in-memory at startup |

**Model loading pattern (use FastAPI lifespan):**
```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
import xgboost as xgb
import tensorflow as tf

ml_models = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: load all models into shared dict
    ml_models["xgb_heat"] = xgb.Booster()
    ml_models["xgb_heat"].load_model("models/xgb_heat.json")
    ml_models["xgb_risk"] = xgb.Booster()
    ml_models["xgb_risk"].load_model("models/xgb_risk.json")
    ml_models["tf_risk"] = tf.keras.models.load_model("models/tf_risk")
    yield
    ml_models.clear()

app = FastAPI(lifespan=lifespan)
```

The `lifespan` parameter (available since FastAPI 0.93+) replaces the deprecated `@app.on_event("startup")` pattern. Models loaded once at startup are thread-safe for read-only inference.

**Confidence:** LOW on exact versions — XGBoost and TensorFlow versions from training knowledge (cutoff August 2025); verify with `pip index versions xgboost tensorflow` before pinning in requirements.txt. The loading pattern (lifespan context manager) is HIGH confidence — verified from FastAPI official docs.

---

### LLM Chat Endpoint

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| anthropic | 0.84.0 | Anthropic Claude API client | Declared fixed in PROJECT.md; async client (`AsyncAnthropic`) integrates cleanly with FastAPI async endpoints |

**Async client pattern:**
```python
from anthropic import AsyncAnthropic

client = AsyncAnthropic()  # reads ANTHROPIC_API_KEY from env

# In an async FastAPI endpoint:
message = await client.messages.create(
    model="claude-sonnet-4-6",  # or claude-opus-4-6 for more capable
    max_tokens=1024,
    system="You are an urban heat expert...",
    messages=[{"role": "user", "content": user_message}]
)
return {"response": message.content[0].text}
```

**Confidence:** HIGH — Anthropic SDK 0.84.0 verified from GitHub CHANGELOG (released 2026-02-25). `AsyncAnthropic` with `messages.create(system=..., messages=...)` signature verified from SDK source.

---

### CORS and HTTP

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| starlette (via FastAPI) | >=0.46.0 | CORSMiddleware | Bundled with FastAPI; zero extra install; `CORSMiddleware` covers all needs for single React frontend consumer |

**CORS setup for React dev frontend:**
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],  # React dev servers
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    allow_credentials=False,  # No auth in v1
)
```

Note from official docs: wildcards (`["*"]`) cannot be used when `allow_credentials=True`. Since v1 has no auth, keep `allow_credentials=False` and use explicit origins.

**Confidence:** HIGH — CORS parameter list verified from FastAPI tutorial docs.

---

### Testing

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| pytest | >=8.0 | Test runner | Standard Python testing; integrates with FastAPI's TestClient |
| httpx | >=0.28 | HTTP test client | Required by FastAPI's `TestClient`; also enables async test patterns |
| pytest-asyncio | >=0.24 | Async test support | Needed when testing async endpoints with `anyio` marker |

FastAPI's `TestClient` wraps `httpx` for synchronous tests. Use `AsyncClient` + `pytest-asyncio` only when you need to test truly async behavior (e.g., streaming endpoints).

**Confidence:** MEDIUM — pytest and httpx versions from training knowledge; patterns confirmed from FastAPI testing docs.

---

## Dev Environment

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| uv | latest | Fast Python package manager | Replaces pip+venv; dramatically faster installs; compatible with requirements.txt and pyproject.toml |
| fastapi[standard] | 0.134.0 | FastAPI + Uvicorn + httpx bundle | Installs FastAPI + uvicorn[standard] + httpx in one command |

**Development server:**
```bash
fastapi dev app/main.py
# OR
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

`fastapi dev` auto-enables reload and is the recommended dev command as of FastAPI 0.111+.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Framework | FastAPI | Flask, Django REST | Fixed in PROJECT.md; FastAPI has native async, typed, auto-docs |
| DB query | DuckDB native | SQLAlchemy + PostGIS | DuckDB is fixed in PROJECT.md; in-process is zero-infra |
| GeoJSON conversion | DuckDB spatial (SQL) | Shapely (Python) | Doing conversion in SQL (ST_AsGeoJSON) avoids loading Shapely and keeps conversion close to data; one fewer dependency |
| ML serving | In-process (loaded at startup) | TorchServe, TF Serving | Overkill for v1; pre-scored predictions mean models only serve what-if inference, not high-QPS baseline scoring |
| LLM provider | anthropic SDK | OpenAI SDK, LangChain | Fixed in PROJECT.md (Anthropic/Claude); LangChain adds abstraction overhead not needed here |
| Response JSON | Standard JSONResponse | ORJSONResponse | Standard Pydantic v2 serialization is already Rust-backed and fast enough; orjson adds a dependency for marginal gain at v1 scale |
| ASGI server | Uvicorn (single process) | Gunicorn + Uvicorn workers | v1 internal-only tool; single process is simpler; if ML models are loaded in memory, multi-worker would require loading models N times |
| Config | pydantic-settings | python-decouple, dynaconf | pydantic-settings is the FastAPI-native pattern; integrates with Pydantic validation automatically |

---

## Installation

```bash
# Create and activate virtual environment
python3.12 -m venv .venv
source .venv/bin/activate

# Core framework
pip install "fastapi[standard]==0.134.0"

# Database
pip install "duckdb>=1.2.0"

# ML libraries (pin versions after verifying latest)
pip install "xgboost>=2.0"
pip install "tensorflow>=2.15"

# LLM
pip install "anthropic==0.84.0"

# Config
pip install "pydantic-settings>=2.0"

# Dev/testing
pip install pytest httpx pytest-asyncio

# Environment variables
cp .env.example .env
# Set ANTHROPIC_API_KEY in .env
```

**Recommended `requirements.txt` structure:**
```
# Web framework
fastapi[standard]==0.134.0

# Database
duckdb>=1.2.0,<2.0

# ML
xgboost>=2.0,<3.0
tensorflow>=2.15,<3.0

# LLM
anthropic==0.84.0

# Config
pydantic-settings>=2.0,<3.0

# Dev
pytest>=8.0
httpx>=0.28
pytest-asyncio>=0.24
```

---

## Key Async Patterns

DuckDB's Python client is **synchronous** (no async query API). In a FastAPI `async def` endpoint, calling DuckDB directly would block the event loop. The correct pattern:

**Option A (recommended for v1 simplicity): Use `def` endpoints for DuckDB routes**
```python
# FastAPI runs def endpoints in a thread pool automatically
@app.get("/tracts")
def get_tracts():
    conn = duckdb.connect("king_county.duckdb", read_only=True)
    result = conn.execute("SELECT ...").fetchall()
    conn.close()
    return result
```

**Option B: Use `asyncio.get_event_loop().run_in_executor` for async endpoints that also need non-blocking behavior**
```python
import asyncio

@app.get("/tracts")
async def get_tracts():
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _query_tracts)
    return result

def _query_tracts():
    conn = duckdb.connect("king_county.duckdb", read_only=True)
    data = conn.execute("SELECT ...").fetchall()
    conn.close()
    return data
```

Option A is preferred for v1: FastAPI already runs `def` functions in a thread pool, and DuckDB read-only connections are cheap to create per-request. Option B is only needed if you need to combine DuckDB queries with other `await` calls in the same endpoint.

**The Anthropic chat endpoint must use `async def`** because `AsyncAnthropic.messages.create()` is a coroutine.

---

## Recommended Project Structure

```
app/
  main.py           # FastAPI app, lifespan, middleware
  routers/
    tracts.py       # GET /tracts, GET /tracts/{id}
    predictions.py  # GET /predictions
    whatif.py       # POST /whatif
    chat.py         # POST /chat
  db.py             # DuckDB connection factory
  models.py         # Pydantic response models
  ml_models.py      # Model loading helpers
  config.py         # pydantic-settings Settings class
models/             # XGBoost and TF model files
king_county.duckdb  # Data file
```

---

## Sources

| Source | URL | Confidence |
|--------|-----|------------|
| FastAPI version (0.134.0) | https://raw.githubusercontent.com/tiangolo/fastapi/master/fastapi/__init__.py | HIGH |
| FastAPI pyproject.toml (pydantic >=2.7 requirement) | https://raw.githubusercontent.com/tiangolo/fastapi/master/pyproject.toml | HIGH |
| FastAPI lifespan docs | https://raw.githubusercontent.com/tiangolo/fastapi/master/docs/en/docs/advanced/events.md | HIGH |
| FastAPI async/def docs | https://raw.githubusercontent.com/tiangolo/fastapi/master/docs/en/docs/async.md | HIGH |
| FastAPI CORS docs | https://raw.githubusercontent.com/tiangolo/fastapi/master/docs/en/docs/tutorial/cors.md | HIGH |
| FastAPI release notes | https://raw.githubusercontent.com/tiangolo/fastapi/master/docs/en/docs/release-notes.md | HIGH |
| FastAPI dev server docs | https://raw.githubusercontent.com/tiangolo/fastapi/master/docs/en/docs/index.md | HIGH |
| FastAPI settings docs | https://raw.githubusercontent.com/tiangolo/fastapi/master/docs/en/docs/advanced/settings.md | HIGH |
| Uvicorn version (0.41.0) | https://raw.githubusercontent.com/encode/uvicorn/master/uvicorn/__init__.py | HIGH |
| Pydantic version (2.13.0b2) | https://raw.githubusercontent.com/pydantic/pydantic/main/pydantic/version.py | HIGH |
| pydantic-settings requirements | https://raw.githubusercontent.com/pydantic/pydantic-settings/main/pyproject.toml | HIGH |
| Anthropic SDK version (0.84.0) | https://raw.githubusercontent.com/anthropics/anthropic-sdk-python/main/CHANGELOG.md | HIGH |
| Anthropic messages.create API | https://raw.githubusercontent.com/anthropics/anthropic-sdk-python/main/src/anthropic/resources/messages/messages.py | HIGH |
| DuckDB v1.2.0 tag confirmed | https://raw.githubusercontent.com/duckdb/duckdb/v1.2.0/CMakeLists.txt | MEDIUM |
| DuckDB spatial ST_AsGeoJSON | https://raw.githubusercontent.com/duckdb/duckdb_spatial/main/docs/functions.md | HIGH |
| DuckDB spatial extension README | https://raw.githubusercontent.com/duckdb/duckdb_spatial/main/README.md | HIGH |
| XGBoost version | Training knowledge (August 2025 cutoff) — verify before pinning | LOW |
| TensorFlow version | Training knowledge (August 2025 cutoff) — verify before pinning | LOW |
