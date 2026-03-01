# Phase 1: Foundation - Research

**Researched:** 2026-02-28
**Domain:** FastAPI application bootstrap — lifespan wiring, shared resource initialization, CORS, global error handling
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | App serves all routes under `/api/v1/` prefix with FastAPI | `APIRouter(prefix="/api/v1")` + `app.include_router()` pattern; verified from FastAPI docs |
| INFRA-02 | CORS is configured to allow all origins (internal use, dev frontend at localhost) | `CORSMiddleware` with `allow_origins=["*"]` and `allow_credentials=False`; verified from FastAPI CORS docs |
| INFRA-03 | `GET /api/v1/health` returns `{status, models_loaded, db_connected}` as a liveness check | Simple router endpoint reading `app.state.db` and `app.state.models`; fully supported by lifespan pattern |
| INFRA-04 | OpenAPI/Swagger UI is available at `/docs` (FastAPI default, not disabled) | FastAPI enables `/docs` by default; must not pass `docs_url=None` to `FastAPI()` constructor |
| INFRA-05 | XGBoost heat model, XGBoost risk model, and TF risk model load at startup via lifespan context manager without blocking the event loop | `asyncio.to_thread(load_fn)` wrapping synchronous model load calls in the lifespan; verified pattern |
| INFRA-06 | DuckDB connection to `king_county.duckdb` is established at startup with `read_only=True` and accessible via dependency injection | Single `duckdb.connect(path, read_only=True)` opened in lifespan, stored as `app.state.db`, exposed via `Depends(get_db)` |
| INFRA-07 | Anthropic client is initialized at startup and reused across chat requests | `AsyncAnthropic()` created once in lifespan, stored as `app.state.anthropic`; reads `ANTHROPIC_API_KEY` from env |
| INFRA-08 | All error responses return consistent JSON shape `{error, detail, status_code}` | `@app.exception_handler(HTTPException)` + `@app.exception_handler(RequestValidationError)` + catch-all `@app.exception_handler(Exception)` returning `JSONResponse` |
</phase_requirements>

---

## Summary

Phase 1 is a pure infrastructure phase: no business logic, no DuckDB queries, no model inference. The goal is a FastAPI application that starts without errors, wires three ML models and a DuckDB connection into `app.state` at startup, and exposes one operational endpoint (`GET /api/v1/health`) plus a consistent error contract. Everything built in Phases 2–4 inherits from what is established here — DuckDB connection threading model, model access pattern, error shape, CORS policy, and the `/api/v1/` prefix.

The technology choices are locked by PROJECT.md. The only implementation decisions are: how to structure the lifespan, how to handle async/sync boundaries for model loading, how to model the DuckDB connection lifecycle, and how to register global exception handlers. All of these have well-documented, verified patterns from official FastAPI sources. This phase has LOW risk: the patterns are stable, the scope is narrow, and all pitfalls are addressable in the initial commit.

The single most important Phase 1 decision is the DuckDB connection lifecycle. Research resolves this as a shared single read-only connection opened at lifespan startup and stored on `app.state.db` — safe for this workload (single Uvicorn worker, read-only analytical queries only). A fresh connection per request via `Depends()` is the safer alternative for concurrent workloads but adds per-request overhead that is unnecessary at v1 scale.

**Primary recommendation:** Scaffold `app/main.py` with the lifespan context manager first, wire all resources into `app.state`, then add the health router and error handlers as the final two steps. Verify startup with `uvicorn app.main:app` before adding any other route.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastapi | 0.134.0 | Web framework, routing, OpenAPI | Fixed by PROJECT.md; typed, async, auto-generates `/docs`; version verified from GitHub |
| uvicorn[standard] | 0.41.0 | ASGI server (installed by `fastapi[standard]`) | FastAPI's recommended ASGI server; bundles watchfiles for `--reload`; version verified from GitHub |
| pydantic | >=2.7 | Request/response validation and serialization | Required by FastAPI 0.134.0; use v2 syntax (`model_dump`, `model_validate`, `model_config`) from day one |
| pydantic-settings | >=2.0 | Config from env vars / `.env` file | FastAPI-native pattern for `BaseSettings`; replaces manual `os.getenv()` calls; validates config at startup |
| duckdb | >=1.2.0,<2.0 | In-process analytical database | Fixed by PROJECT.md; single-file, zero-infra; `read_only=True` for concurrent-safe API reads |
| xgboost | >=2.0,<3.0 | Heat and risk model loading | Fixed by PROJECT.MD; `xgb.Booster.load_model()` API is stable; in-memory at startup |
| tensorflow | >=2.15,<3.0 | TF risk model loading | Fixed by PROJECT.MD; `tf.keras.models.load_model()` API is stable; in-memory at startup |
| anthropic | 0.84.0 | Anthropic Claude API client | Fixed by PROJECT.MD; `AsyncAnthropic` integrates with async FastAPI endpoints; version verified from GitHub CHANGELOG |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| python-dotenv | >=1.0 | `.env` file loading | Only if `pydantic-settings` is not handling `.env` automatically; pydantic-settings reads `.env` via `model_config = SettingsConfigDict(env_file=".env")` — no explicit dotenv install needed |
| pytest | >=8.0 | Test runner | Phase 1 smoke tests: startup, health endpoint, error shapes |
| httpx | >=0.28 | HTTP test client | Required by FastAPI `TestClient`; installed by `fastapi[standard]` |
| pytest-asyncio | >=0.24 | Async test support | Only needed if writing `async def` test functions; sync `TestClient` tests do not require it |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Single shared `read_only` DuckDB connection | Per-request `Depends()` connection factory | Per-request is safer under high concurrency; shared is simpler and sufficient for single-worker v1. Use shared for Phase 1; upgrade if Phase 2 load testing shows contention. |
| `asyncio.to_thread()` for model loading | `loop.run_in_executor(None, fn)` | Both are equivalent; `asyncio.to_thread` is Python 3.9+ and cleaner; use it. |
| `fastapi[standard]` install | Separate `fastapi`, `uvicorn`, `httpx` installs | `fastapi[standard]` is the recommended install that bundles all three; no reason to separate them in v1. |
| `allow_origins=["*"]` CORS | Explicit origin list | `["*"]` is simpler and correct for internal-only v1 with `allow_credentials=False`; explicit list adds no security value when there is no auth. |

**Installation:**

```bash
pip install "fastapi[standard]==0.134.0" \
            "duckdb>=1.2.0,<2.0" \
            "xgboost>=2.0,<3.0" \
            "tensorflow>=2.15,<3.0" \
            "anthropic==0.84.0" \
            "pydantic-settings>=2.0,<3.0"

# Dev/test
pip install pytest httpx pytest-asyncio
```

**`requirements.txt`:**
```
# Web framework (includes uvicorn[standard] and httpx)
fastapi[standard]==0.134.0

# Database
duckdb>=1.2.0,<2.0

# ML models
xgboost>=2.0,<3.0
tensorflow>=2.15,<3.0

# LLM client
anthropic==0.84.0

# Config
pydantic-settings>=2.0,<3.0

# Dev/test
pytest>=8.0
httpx>=0.28
pytest-asyncio>=0.24
```

> NOTE: Verify exact latest XGBoost and TensorFlow versions before pinning: `pip index versions xgboost tensorflow` — these are LOW confidence from training knowledge (cutoff August 2025).

---

## Architecture Patterns

### Recommended Project Structure

```
app/
├── main.py              # FastAPI app, lifespan, middleware, router registration
├── config.py            # pydantic-settings Settings class (DB path, model paths, API key, CORS)
├── db.py                # DuckDB connection factory function
├── dependencies.py      # Depends() helpers: get_db, get_models, get_anthropic
├── models/
│   ├── __init__.py
│   └── loader.py        # LoadedModels dataclass, load_models() factory
├── routers/
│   ├── __init__.py
│   └── health.py        # GET /api/v1/health
└── schemas/
    ├── __init__.py
    └── health.py        # HealthResponse Pydantic schema
.env                     # ANTHROPIC_API_KEY, DB_PATH, MODEL_PATH_*
.env.example             # Template (committed to git; .env is not)
requirements.txt
```

> Phase 1 creates only `health.py` router and schema. The `routers/tracts.py`, `routers/simulate.py`, `routers/chat.py`, and corresponding services and schemas are scaffolded in Phases 2–4.

### Pattern 1: Lifespan Context Manager

**What:** The `@asynccontextmanager` lifespan function runs setup code before the app accepts requests and teardown code after it stops. Resources stored on `app.state` are available in every request handler.

**When to use:** All shared resource initialization (DB connections, model loading, third-party clients). Replaces deprecated `@app.on_event("startup")`.

**Example:**
```python
# app/main.py
# Source: https://fastapi.tiangolo.com/advanced/events/
from contextlib import asynccontextmanager
import asyncio
import duckdb
from anthropic import AsyncAnthropic
from fastapi import FastAPI
from app.config import settings
from app.models.loader import load_models

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- STARTUP ---
    # 1. Open DuckDB (synchronous, but fast for a single connection open)
    app.state.db = duckdb.connect(str(settings.duckdb_path), read_only=True)

    # 2. Load ML models — TF and XGBoost are CPU-bound and slow;
    #    wrap in asyncio.to_thread() to avoid blocking the event loop
    app.state.models = await asyncio.to_thread(load_models, settings)

    # 3. Init Anthropic async client (reads ANTHROPIC_API_KEY from env automatically)
    app.state.anthropic = AsyncAnthropic()

    yield  # app is now running and accepting requests

    # --- SHUTDOWN ---
    app.state.db.close()

app = FastAPI(lifespan=lifespan, title="Urban Heat Mapping API")
```

### Pattern 2: pydantic-settings Config

**What:** A `BaseSettings` subclass that reads environment variables and `.env` files, validates types at startup, and raises clear errors for missing required values.

**When to use:** Any config value that differs between dev/prod or should not be hardcoded (API keys, file paths, CORS origins).

**Example:**
```python
# app/config.py
# Source: https://fastapi.tiangolo.com/advanced/settings/
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Database
    duckdb_path: Path = Path("king_county.duckdb")

    # ML model file paths
    xgb_heat_model_path: Path = Path("models/xgb_heat.json")
    xgb_risk_model_path: Path = Path("models/xgb_risk.json")
    tf_risk_model_path: Path = Path("models/tf_risk")

    # Anthropic (required — no default)
    anthropic_api_key: str

    # CORS origins (allow all for internal v1 use)
    cors_origins: list[str] = ["*"]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

settings = Settings()
```

### Pattern 3: ML Model Loader

**What:** A `LoadedModels` dataclass holding all three model instances, loaded by a synchronous factory function called once inside `asyncio.to_thread()` in the lifespan.

**When to use:** Any CPU-bound initialization (model loading, large data deserialization) called from an async lifespan handler.

**Example:**
```python
# app/models/loader.py
import asyncio
import logging
import time
from dataclasses import dataclass
import xgboost as xgb
import tensorflow as tf

logger = logging.getLogger(__name__)

@dataclass
class LoadedModels:
    xgb_heat: xgb.Booster
    xgb_risk: xgb.Booster
    tf_risk: tf.keras.Model

def load_models(settings) -> LoadedModels:
    """Synchronous model loader — called via asyncio.to_thread() in lifespan."""
    t0 = time.perf_counter()

    xgb_heat = xgb.Booster()
    xgb_heat.load_model(str(settings.xgb_heat_model_path))

    xgb_risk = xgb.Booster()
    xgb_risk.load_model(str(settings.xgb_risk_model_path))

    tf_risk = tf.keras.models.load_model(str(settings.tf_risk_model_path))

    elapsed = time.perf_counter() - t0
    logger.info(f"All models loaded in {elapsed:.2f}s")

    return LoadedModels(xgb_heat=xgb_heat, xgb_risk=xgb_risk, tf_risk=tf_risk)
```

> Import TensorFlow before XGBoost in files that use both to avoid OpenMP symbol conflict on macOS arm64 (see Pitfalls).

### Pattern 4: Dependency Injection Helpers

**What:** Functions decorated or used with `Depends()` that extract shared resources from `app.state`. Routers import these functions and declare them as typed parameters.

**When to use:** Every route handler that needs the DuckDB connection, loaded models, or Anthropic client.

**Example:**
```python
# app/dependencies.py
import duckdb
from anthropic import AsyncAnthropic
from fastapi import Request
from app.models.loader import LoadedModels

def get_db(request: Request) -> duckdb.DuckDBPyConnection:
    return request.app.state.db

def get_models(request: Request) -> LoadedModels:
    return request.app.state.models

def get_anthropic(request: Request) -> AsyncAnthropic:
    return request.app.state.anthropic
```

```python
# Usage in a router:
from fastapi import APIRouter, Depends
from app.dependencies import get_db

router = APIRouter()

@router.get("/example")
def example_endpoint(db: duckdb.DuckDBPyConnection = Depends(get_db)):
    ...
```

### Pattern 5: Global Exception Handler

**What:** Three exception handlers registered on the app that intercept `HTTPException`, `RequestValidationError`, and all other `Exception` instances and return a consistent `{error, detail, status_code}` JSON shape. This satisfies INFRA-08.

**When to use:** Register once in `main.py` before any routers are included.

**Example:**
```python
# app/main.py (add after FastAPI() instantiation)
# Source: https://fastapi.tiangolo.com/tutorial/handling-errors/
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

def register_exception_handlers(app: FastAPI) -> None:

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": exc.__class__.__name__,
                "detail": exc.detail,
                "status_code": exc.status_code,
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": "RequestValidationError",
                "detail": exc.errors(),
                "status_code": 422,
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": "InternalServerError",
                "detail": "An unexpected error occurred.",
                "status_code": 500,
            },
        )
```

### Pattern 6: Health Router

**What:** A single route that reads boolean flags from `app.state` to report liveness without performing any new I/O.

**Example:**
```python
# app/routers/health.py
from fastapi import APIRouter, Request
from app.schemas.health import HealthResponse

router = APIRouter()

@router.get("/health", response_model=HealthResponse)
def get_health(request: Request) -> HealthResponse:
    db_connected = False
    models_loaded = False

    try:
        # Cheap query to confirm DuckDB connection is live
        request.app.state.db.execute("SELECT 1").fetchone()
        db_connected = True
    except Exception:
        db_connected = False

    try:
        models = request.app.state.models
        models_loaded = (
            models is not None
            and models.xgb_heat is not None
            and models.xgb_risk is not None
            and models.tf_risk is not None
        )
    except AttributeError:
        models_loaded = False

    return HealthResponse(
        status="ok",
        models_loaded=models_loaded,
        db_connected=db_connected,
    )
```

```python
# app/schemas/health.py
from pydantic import BaseModel

class HealthResponse(BaseModel):
    status: str
    models_loaded: bool
    db_connected: bool
```

### Pattern 7: Router Registration with `/api/v1/` Prefix

**What:** All routers are included with the `/api/v1` prefix to satisfy INFRA-01.

**Example:**
```python
# app/main.py (after lifespan, after exception handlers)
from app.routers import health

app.include_router(health.router, prefix="/api/v1")
# Future phases add:
# app.include_router(tracts.router, prefix="/api/v1")
# app.include_router(simulate.router, prefix="/api/v1")
# app.include_router(chat.router, prefix="/api/v1")
```

### Pattern 8: CORS Middleware

**What:** `CORSMiddleware` added to the app in `main.py`, before routers, to satisfy INFRA-02.

**Example:**
```python
# app/main.py
# Source: https://fastapi.tiangolo.com/tutorial/cors/
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,  # ["*"] for v1 internal use
    allow_credentials=False,  # Must be False when allow_origins=["*"]
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Accept"],
)
```

> `allow_credentials=True` combined with `allow_origins=["*"]` is invalid (Starlette raises a runtime error). Since v1 has no auth, `allow_credentials=False` is correct.

### Anti-Patterns to Avoid

- **`@app.on_event("startup")`**: Deprecated since FastAPI 0.95+. Use `lifespan` context manager exclusively.
- **Module-level model loading**: `model = xgb.Booster(); model.load_model("...")` at the top of a module. This executes at import time, breaking tests and CI (model files don't exist in CI). All loading must happen inside `load_models()` called from lifespan.
- **Sharing a DuckDB write connection across requests**: Only applicable if someone opens the DB without `read_only=True`. Never do this — the API must always use `read_only=True`.
- **Fat routers**: Business logic (DuckDB queries, formula math, Anthropic calls) belongs in service modules, not inside `@router.get(...)` decorated functions. Routers handle HTTP concerns only.
- **Pydantic v1 syntax**: Any `class Config:`, `.dict()`, `@validator` usage means Pydantic v1 syntax leaked in. Use `model_config = ConfigDict(...)`, `.model_dump()`, `@field_validator`.
- **Missing catch-all exception handler**: Without `@app.exception_handler(Exception)`, unhandled Python exceptions return an HTML traceback (500) instead of JSON, breaking INFRA-08.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Request/response validation | Custom validator functions | Pydantic v2 model declarations | Pydantic handles type coercion, required fields, optional fields, nested models, and generates JSON schema for OpenAPI — thousands of edge cases |
| Config loading from env/`.env` | Manual `os.getenv()` + dotenv calls | `pydantic-settings BaseSettings` | Validates config at startup, raises clear errors for missing required vars, type-converts automatically |
| CORS headers | Custom middleware writing headers | `fastapi.middleware.cors.CORSMiddleware` | Handles preflight OPTIONS requests, vary headers, credential semantics — all of which custom implementations typically get wrong |
| Error response formatting | `try/except` in every route | `@app.exception_handler()` decorators | Exception handlers intercept at the framework level, including errors raised by Pydantic validation before the route body runs |
| OpenAPI/Swagger UI | Custom docs endpoint | FastAPI default (nothing to do) | FastAPI generates the full OpenAPI schema and serves `/docs` automatically from route decorators and Pydantic models |
| Model path/API key config | Hardcoded paths | `pydantic-settings Settings` | Hardcoded paths break across dev machines; Settings validates at startup, not at first use |

**Key insight:** In FastAPI, the framework does the heavy lifting for documentation, validation, and serialization. The job is to declare types correctly and wire resources in lifespan — not to build infrastructure.

---

## Common Pitfalls

### Pitfall 1: TensorFlow Loading Blocks the Event Loop

**What goes wrong:** `tf.keras.models.load_model()` is a synchronous, CPU-bound call. Called directly in the `lifespan` async function body (without `asyncio.to_thread`), it blocks the entire event loop for seconds, preventing health checks from responding and causing process managers to mark the worker dead.

**Why it happens:** The `lifespan` coroutine runs on the event loop. Synchronous blocking calls within it halt all other async operations for their duration.

**How to avoid:** Wrap the entire synchronous `load_models()` function in `asyncio.to_thread()`:
```python
app.state.models = await asyncio.to_thread(load_models, settings)
```

**Warning signs:** Startup takes >5s. Health check times out on first probe. `uvicorn` logs show no activity during model loading.

---

### Pitfall 2: XGBoost + TensorFlow OpenMP Conflict (macOS arm64)

**What goes wrong:** TensorFlow bundles its own OpenMP runtime. XGBoost links against the system OpenMP. On macOS arm64, importing both in the same process causes `OMP: Error #15: Initializing libiomp5.dylib, but found libomp.dylib already initialized`. This crashes the process at startup.

**Why it happens:** Both libraries ship with or link to different OpenMP implementations that conflict when both are loaded into the same process address space.

**How to avoid:**
1. Import TensorFlow before XGBoost in `loader.py` (TF's bundled runtime wins).
2. Set `OMP_NUM_THREADS=1` and `TF_NUM_INTRAOP_THREADS=1` in the environment before starting uvicorn (in `.env` or the run script).
3. Test startup smoke on the target platform (macOS arm64 is the most affected).

**Warning signs:** `ImportError` or `OMP:` error messages at process startup. Only appears on macOS arm64, not Linux CI.

---

### Pitfall 3: ML Models Loaded at Module Import Time

**What goes wrong:** Placing `model = xgb.Booster(); model.load_model(...)` at module top level causes every test that imports anything from the app to load model files. CI doesn't have model files. Tests take 30+ seconds. Mocking is impossible without `sys.modules` hacks.

**Why it happens:** Python executes module top-level statements on import. ML libraries execute expensive operations during model load.

**How to avoid:** Never load model files outside of `load_models()`. Only call `load_models()` inside the lifespan context manager. In tests, override `app.state.models` after startup using `TestClient` or a lifespan fixture.

**Warning signs:** `import app.main` in a test takes >1s. CI fails with `FileNotFoundError` for model files.

---

### Pitfall 4: DuckDB `read_only=True` + DDL on Startup

**What goes wrong:** Running `CREATE TABLE IF NOT EXISTS` or any schema-validation DDL from a `read_only=True` connection raises `duckdb.PermissionException`. This breaks the startup if any schema-check code uses DDL.

**Why it happens:** `read_only=True` mode disallows all writes and DDL operations at the driver level.

**How to avoid:** Use SELECT-only schema validation:
```python
# Verify required table exists at startup
def verify_db_schema(conn: duckdb.DuckDBPyConnection) -> None:
    tables = conn.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
    ).fetchall()
    table_names = {row[0] for row in tables}
    required = {"tract_features", "tract_outputs_with_preds"}
    missing = required - table_names
    if missing:
        raise RuntimeError(f"Required tables missing from DuckDB: {missing}")
```

**Warning signs:** `PermissionException` or `ReadOnlyException` on startup instead of a clear missing-table error.

---

### Pitfall 5: Missing `allow_credentials=False` with `allow_origins=["*"]`

**What goes wrong:** Setting `allow_credentials=True` together with `allow_origins=["*"]` causes Starlette to raise a `ValueError` at app startup: "Wildcard not allowed with credentials."

**Why it happens:** The CORS specification prohibits `Access-Control-Allow-Origin: *` when credentials are being sent — Starlette enforces this at startup.

**How to avoid:** v1 has no auth, so always use `allow_credentials=False` (the default). Document this explicitly so future developers don't inadvertently set credentials without also switching to explicit origin lists.

---

### Pitfall 6: Pydantic v1 Syntax in a v2 Project

**What goes wrong:** Mixing Pydantic v1 syntax (`.dict()`, `class Config:`, `@validator`) with v2 causes silent failures or deprecation warnings that become errors in future FastAPI releases. Dependencies that still require Pydantic v1 cause version conflicts.

**How to avoid:** Pin `pydantic>=2.7` in requirements.txt. Always use v2 syntax:
- `model.model_dump()` not `model.dict()`
- `model_config = ConfigDict(...)` not `class Config:`
- `@field_validator` not `@validator`
- `model.model_validate(data)` not `model.parse_obj(data)`

---

### Pitfall 7: `app.state` Not Set Before First Request Arrives

**What goes wrong:** If the lifespan startup raises an exception midway (e.g., model file not found), some `app.state` attributes may be set while others are not. A request arriving before full startup completes would get an `AttributeError` on `request.app.state.models` with no clear error message.

**How to avoid:**
1. Validate all required file paths in `Settings` at startup (pydantic-settings can validate file existence with a `@field_validator`).
2. Let startup exceptions propagate — uvicorn will exit rather than serve requests from a partially-initialized state.
3. The health endpoint should handle `AttributeError` gracefully (the Pattern 6 example above does this with `try/except`).

---

## Code Examples

Verified patterns from official sources:

### Complete `main.py` for Phase 1

```python
# app/main.py
import asyncio
import logging
from contextlib import asynccontextmanager

import duckdb
from anthropic import AsyncAnthropic
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.models.loader import load_models
from app.routers import health

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Startup: connecting to DuckDB...")
    app.state.db = duckdb.connect(str(settings.duckdb_path), read_only=True)

    logger.info("Startup: loading ML models (this may take a few seconds)...")
    app.state.models = await asyncio.to_thread(load_models, settings)

    logger.info("Startup: initializing Anthropic client...")
    app.state.anthropic = AsyncAnthropic()

    logger.info("Startup complete. API ready.")
    yield

    logger.info("Shutdown: closing DuckDB connection.")
    app.state.db.close()


app = FastAPI(
    lifespan=lifespan,
    title="Urban Heat Mapping API",
    version="1.0.0",
)

# CORS — allow all origins for internal v1 use (INFRA-02)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,  # ["*"]
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Accept"],
)


# Global exception handlers — consistent {error, detail, status_code} shape (INFRA-08)
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.__class__.__name__, "detail": exc.detail, "status_code": exc.status_code},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"error": "RequestValidationError", "detail": exc.errors(), "status_code": 422},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error": "InternalServerError", "detail": "An unexpected error occurred.", "status_code": 500},
    )


# Routers — all under /api/v1/ prefix (INFRA-01)
app.include_router(health.router, prefix="/api/v1")
```

### Run Command (Development)

```bash
# FastAPI CLI (recommended for dev — auto-reload enabled)
fastapi dev app/main.py

# OR uvicorn directly
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Smoke Test Startup Verification

```bash
# After starting the server:
curl http://localhost:8000/api/v1/health
# Expected: {"status":"ok","models_loaded":true,"db_connected":true}

curl http://localhost:8000/docs
# Expected: 200 OK with Swagger UI HTML

curl -X POST http://localhost:8000/api/v1/health -d "bad"
# Expected: {"error":"RequestValidationError","detail":[...],"status_code":422} or 405 Method Not Allowed
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@app.on_event("startup")` | `@asynccontextmanager async def lifespan(app)` | FastAPI 0.93+ (deprecated), removed in future | Lifespan is cleaner, testable, the only documented approach as of 0.134.0 |
| Pydantic v1 (`class Config:`, `.dict()`) | Pydantic v2 (`model_config = ConfigDict(...)`, `.model_dump()`) | FastAPI 0.100+ requires Pydantic v2 | Breaking API change; must use v2 syntax throughout |
| Global module-level model variables | `app.state` initialized in lifespan | Best practice formalized with lifespan pattern | Required for testability and correct startup ordering |
| `pip` + `venv` for package management | `uv` (optional, faster) | 2023–present | `uv` is significantly faster but not required; standard `pip` works fine |
| `loop.run_in_executor(None, fn)` | `await asyncio.to_thread(fn, *args)` | Python 3.9+ | `asyncio.to_thread` is cleaner and the standard approach on 3.9+ |

**Deprecated/outdated:**
- `@app.on_event("startup")` / `@app.on_event("shutdown")`: Deprecated in FastAPI 0.95+. Do not use.
- Pydantic v1 `BaseModel.dict()`: Returns `DeprecationWarning` in Pydantic v2; will become an error in a future version.
- `fastapi.testclient.TestClient` importing from pre-0.100 path patterns: Use `from fastapi.testclient import TestClient` only.

---

## Open Questions

1. **Do ML model files exist in the repository yet?**
   - What we know: PROJECT.md mentions `models/xgb_heat.json`, `models/xgb_risk.json`, `models/tf_risk` as expected paths.
   - What's unclear: The project root currently has no `models/` directory and no `.duckdb` file. These must be populated before Phase 1 startup can be fully verified.
   - Recommendation: Phase 1 should validate that model paths exist in `Settings` at startup using `@field_validator` and raise a clear `RuntimeError` if absent, rather than failing silently at inference time. The planner should confirm whether model files are to be created as stubs or will be provided out of band.

2. **Does `king_county.duckdb` exist yet?**
   - What we know: Project root contains no `.duckdb` file as of 2026-02-28.
   - What's unclear: Is this an offline pipeline artifact that will be provided, or does Phase 1 need to create a stub DuckDB file for testing?
   - Recommendation: Phase 1 should create a minimal stub `king_county.duckdb` with the expected tables and a few sample rows so the health check (`SELECT 1`) and startup schema validation can run. The real data file replaces the stub before Phase 2 testing.

3. **Exact XGBoost and TensorFlow versions**
   - What we know: Project specifies `>=2.0` for XGBoost and `>=2.15` for TensorFlow; both confirmed as working versions but exact latest is from training knowledge (August 2025 cutoff).
   - What's unclear: Whether there are breaking API changes in very recent releases (post-August 2025).
   - Recommendation: Run `pip index versions xgboost tensorflow` on the target machine before pinning in `requirements.txt`. Use the latest stable patch within the `>=2.0,<3.0` and `>=2.15,<3.0` ranges.

---

## Sources

### Primary (HIGH confidence)
- FastAPI official docs — lifespan events: https://fastapi.tiangolo.com/advanced/events/
- FastAPI official docs — handling errors (exception handlers): https://fastapi.tiangolo.com/tutorial/handling-errors/
- FastAPI official docs — CORS: https://fastapi.tiangolo.com/tutorial/cors/
- FastAPI official docs — settings / pydantic-settings: https://fastapi.tiangolo.com/advanced/settings/
- FastAPI official docs — dependency injection: https://fastapi.tiangolo.com/tutorial/dependencies/
- FastAPI official docs — app.state: https://fastapi.tiangolo.com/advanced/application-state/
- FastAPI 0.134.0 version — `fastapi/__init__.py` on GitHub main branch (verified 2026-02-28)
- Uvicorn 0.41.0 version — `uvicorn/__init__.py` on GitHub main branch (verified 2026-02-28)
- Anthropic SDK 0.84.0 — CHANGELOG.md on GitHub (released 2026-02-25, verified)
- pydantic-settings pyproject.toml — pydantic >=2.7 requirement verified from GitHub

### Secondary (MEDIUM confidence)
- DuckDB Python API docs — `duckdb.org/docs/stable/clients/python/overview` — `read_only=True` connection semantics and `DuckDBPyConnection` object; DuckDB 1.2.0 tag confirmed from GitHub CMakeLists.txt
- Project research files (STACK.md, ARCHITECTURE.md, PITFALLS.md) — consolidated from earlier verified research; patterns cross-referenced with official FastAPI sources

### Tertiary (LOW confidence)
- XGBoost exact latest version — training knowledge (August 2025 cutoff); run `pip index versions xgboost` before pinning
- TensorFlow exact latest version — training knowledge (August 2025 cutoff); run `pip index versions tensorflow` before pinning
- macOS arm64 OpenMP conflict behavior — multiple community reports; not an official documented constraint; verify on target platform

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — FastAPI, Uvicorn, Pydantic, Anthropic versions all verified from GitHub sources. DuckDB 1.2.0 confirmed. XGBoost and TensorFlow versions LOW (training knowledge).
- Architecture: HIGH — lifespan, app.state, dependency injection, CORS, exception handlers all verified from FastAPI official docs. These patterns are stable across FastAPI 0.95+.
- Pitfalls: HIGH (event loop blocking, module-level import, Pydantic v1 mixing, CORS credentials conflict) / MEDIUM (macOS arm64 OpenMP conflict — platform-specific, not in official docs).

**Research date:** 2026-02-28
**Valid until:** 2026-03-30 (FastAPI and Pydantic are stable; Anthropic SDK moves faster — re-verify if >30 days pass before implementation)
