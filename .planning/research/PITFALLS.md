# Domain Pitfalls

**Domain:** FastAPI + DuckDB + Geospatial + In-Memory ML Model Serving
**Project:** Urban Heat Mapping — King County Backend API
**Researched:** 2026-02-28
**Confidence:** HIGH (DuckDB threading, FastAPI lifecycle, GeoJSON payload) / MEDIUM (TF/XGBoost interaction, Anthropic context window)

---

## Critical Pitfalls

Mistakes that cause crashes, rewrites, or data correctness failures.

---

### Pitfall 1: DuckDB Connection Used Across Async Boundaries (Thread Unsafety)

**What goes wrong:** DuckDB's Python client is not thread-safe. A single `duckdb.connect()` connection object shared across multiple concurrent FastAPI requests will raise `duckdb.ConnectionException: Connection already in use` or silently return corrupted results because async route handlers run in a thread pool and DuckDB's internal C++ cursor state is not protected by a GIL lock for all operations.

**Why it happens:** FastAPI routes marked `async def` run on the event loop but call into DuckDB's synchronous C++ extension. When two requests touch the same connection object simultaneously — even on "different" async coroutines — they share the same cursor state. Routes marked plain `def` are moved to a thread pool by FastAPI, making the race condition deterministic and immediate.

**Consequences:** Random `ConnectionException` crashes under any load, silent data mixing between responses (worst case: Tract A's geometry returned to Tract B's request), difficult-to-reproduce failures that only appear in staging.

**Prevention:**
- Use `duckdb.connect(read_only=True)` with a **new connection per request** (cheap for read-only analytical queries, DuckDB file is memory-mapped).
- OR: use a connection pool pattern — a `threading.local()` object that creates one connection per OS thread (safe for `def` routes dispatched to thread pool).
- NEVER share a single module-level `duckdb.connect()` instance across requests.
- Preferred pattern for this project (read-only DuckDB): create connection in a `Depends()` function that yields a fresh `duckdb.connect(DB_PATH, read_only=True)` and closes it after the request.

**Warning signs:** Works fine with one Uvicorn worker and no concurrent load. Fails under `pytest-asyncio` parallel tests or `locust` with >2 VUs.

**Detection:** Add a concurrent load test (2+ simultaneous geometry requests) as a smoke test in CI. Any `ConnectionException` is this pitfall.

**Phase:** Address in Phase 1 (DuckDB connection setup). Getting this wrong taints every endpoint built on top.

---

### Pitfall 2: TensorFlow Loaded in Startup Blocks Event Loop / OOM at Worker Scale

**What goes wrong:** `tf.keras.models.load_model()` is a slow, CPU-bound, memory-allocating operation. Running it inside a FastAPI `@app.on_event("startup")` coroutine (or `lifespan`) blocks the entire event loop for several seconds (or tens of seconds for large SavedModel graphs). With multiple Uvicorn workers, each worker loads all three models independently, multiplying RAM usage.

**Why it happens:** TensorFlow's model loading triggers CUDA detection, graph compilation, and memory allocation. In async context it is never awaited (it's sync). FastAPI's `startup` event runs on the event loop — blocking it prevents the health check from responding, confuses process managers (gunicorn marks the worker dead), and delays first response.

**Consequences:** Container startup timeout failures in production. With 4 Uvicorn workers, 3 models × 4 = 12 model copies in RAM. On a 8 GB dev machine this can OOM-kill workers silently.

**Prevention:**
- Wrap model loading in `asyncio.get_event_loop().run_in_executor(None, load_fn)` inside the lifespan/startup handler, or use the `lifespan` context manager with `asyncio.to_thread()` (Python 3.9+).
- Use a single Uvicorn worker for v1 (no horizontal scaling needed per PROJECT.md). This eliminates the multi-worker RAM multiplication problem.
- Store loaded models as module-level singletons (loaded once) — not as class instances re-loaded per request.
- Log model load time explicitly so it's visible in startup logs.

**Warning signs:** `uvicorn` healthcheck fails on first probe after deploy. Startup takes >10s. RSS memory grows linearly with worker count.

**Detection:** Log `time.perf_counter()` around each `load_model()` call. If >2s, it must be offloaded from the event loop.

**Phase:** Address in Phase 1 (application startup / lifespan setup).

---

### Pitfall 3: Large GeoJSON Payloads Sent Whole to Frontend (No Simplification or Pagination)

**What goes wrong:** King County has ~400 census tracts. Each tract geometry serialized as GeoJSON can be 5–50 KB of coordinate arrays depending on resolution. Returning all tracts in one `/tracts/geojson` response can produce a 5–20 MB JSON payload. At block level (thousands of blocks) this can exceed 100 MB. The React frontend's map library (Mapbox/Leaflet) will freeze trying to render this.

**Why it happens:** DuckDB stores the full-resolution WKT/GeoJSON as loaded from the source shapefile. There is no automatic simplification. FastAPI serializes the full geometry string into the response without size awareness.

**Consequences:** 10–30 second page load times. Browser tab memory spikes. Mobile clients crash. Map interactions become unresponsive.

**Prevention:**
- Use `ST_Simplify` / `ST_SimplifyPreserveTopology` via DuckDB's spatial extension to reduce geometry vertex count on query (tolerance ~0.0001 degrees for tract level is imperceptible at county zoom).
- Return geometry and feature data as separate endpoints so the frontend can request features without re-downloading geometry on every filter change.
- Add a `simplify` query param (default: true) that applies simplification — full resolution available for export use cases.
- Cap response at a configurable `limit` + `offset` for block-level queries.

**Warning signs:** `/tracts/geojson` response size >2 MB in dev with real data. Browser network tab shows multi-second TTFB for geometry endpoints.

**Detection:** Measure response size of all geometry endpoints against the actual `king_county.duckdb` before writing frontend integration. Add a response-size assertion in API tests (>5 MB = fail).

**Phase:** Address in Phase 2 (geometry endpoints). Design simplification in from the start — retrofitting after frontend is built is painful.

---

### Pitfall 4: WKT vs GeoJSON Geometry Serialization Mismatch

**What goes wrong:** DuckDB stores geometries as either WKT strings or binary (internal geometry type). Querying `geom::TEXT` returns WKT (e.g., `POLYGON ((...))`). GeoJSON requires `{"type": "Polygon", "coordinates": [...]}`. If the API returns WKT strings inside a GeoJSON `Feature.geometry` field, the frontend map library silently fails to render (Mapbox/Leaflet expect GeoJSON, not WKT). Alternatively, if `ST_AsGeoJSON()` is used, the result is a JSON string inside a string field — requiring double-deserialization.

**Why it happens:** DuckDB's spatial extension has both `ST_AsWKT()` and `ST_AsGeoJSON()`. `ST_AsGeoJSON()` returns a `VARCHAR` containing a JSON string, not a nested JSON object. When FastAPI serializes this via Pydantic, the geometry field becomes an escaped JSON string inside the response JSON, not a nested object.

**Consequences:** Frontend receives `"geometry": "{\"type\": \"Polygon\"...}"` (a string) instead of `"geometry": {"type": "Polygon"...}` (an object). Mapbox silently ignores it. Hard to debug without inspecting raw network response.

**Prevention:**
- In DuckDB query, use `ST_AsGeoJSON(geom)` to get the GeoJSON string, then parse it in Python with `json.loads()` before injecting into the Pydantic response model.
- OR: use `json.loads(row["geom_geojson"])` in the response builder and type the Pydantic field as `dict` (not `str`).
- Define a `GeometryField = Union[dict, None]` Pydantic type and always parse geometry strings on the Python side before response serialization.
- Write a unit test asserting `response["features"][0]["geometry"]["type"]` is a string (not the whole object being a string).

**Warning signs:** Map renders no polygons despite 200 OK responses with geometry data. `typeof feature.geometry === 'string'` in browser console.

**Detection:** Automated test that asserts geometry is a nested dict, not a string, before any frontend work begins.

**Phase:** Address in Phase 2 (geometry endpoints). Document the serialization contract explicitly.

---

### Pitfall 5: Anthropic API Context Window Overflow for Dense Map State

**What goes wrong:** The chat endpoint injects map context (selected tracts, current predictions, scenario parameters) into the Claude system prompt or user message. If the planner has selected 50+ tracts each with 10+ feature columns, the context can exceed 10,000–30,000 tokens before the user's question is even included. This causes `anthropic.BadRequestError: prompt is too long` at runtime, crashing the chat endpoint.

**Why it happens:** Each tract's features include numeric values for dozens of ML input columns (tree canopy %, impervious surface %, LST values, etc.). If the entire `tract_features` row is serialized as JSON into the prompt, 50 tracts × ~500 tokens per tract = 25,000 tokens of context alone.

**Consequences:** Chat endpoint returns 400 error when planner selects many tracts. Error is confusing (no user-facing explanation). Hard to reproduce in development where planners typically test with 1-2 tracts.

**Prevention:**
- Define a strict maximum context budget (e.g., 4,000 tokens for map context, leaving room for conversation history and response).
- For selected tracts, include only: tract ID, heat score, risk score, top 3 features by magnitude — not the full feature vector.
- If more than N tracts are selected, summarize as aggregate statistics (min/max/mean heat score across selection) rather than per-tract detail.
- Add a `count_tokens()` check before sending to Anthropic (use `anthropic` SDK's token counting or a simple tiktoken approximation). If over budget, truncate gracefully with a note to Claude.
- Never send raw `tract_features` columns verbatim — project to a summary schema designed for the prompt.

**Warning signs:** Chat works in dev with 1-2 tracts selected but fails in UAT when planner loads a full neighborhood. Errors appearing only under specific map states.

**Detection:** Unit test the context builder with 100 tracts selected. Assert token count stays under 6,000. Log token count for every chat request.

**Phase:** Address in Phase 3 (chat endpoint). Context budget must be designed before the prompt template is finalized.

---

### Pitfall 6: ML Models Loaded at Import Time (Not in Lifespan), Breaking Tests

**What goes wrong:** Placing `model = xgb.XGBRegressor(); model.load_model("heat_model.json")` at module top-level (outside any function) causes the model files to be loaded the moment any test imports anything from the module. This slows test suite startup by 10–30 seconds, and fails entirely if model files don't exist in the CI environment.

**Why it happens:** FastAPI apps are often structured with global state at module level for convenience. ML models seem like good global singletons but they have side effects at import time.

**Consequences:** Test suite requires model files to exist everywhere (CI, developer machines without data). Tests take much longer to run. Mocking becomes impossible without `sys.modules` hacks.

**Prevention:**
- Load models inside the `lifespan` async context manager (FastAPI 0.95+) and store in `app.state.models` dict.
- In tests, override `app.state.models` with mock objects using `TestClient` and lifespan override patterns.
- Never load model files at module import time.

**Warning signs:** `import app.main` in a test takes >5s. Tests fail with `FileNotFoundError` for model files in CI.

**Detection:** Measure `import time` in tests. Any import taking >1s is loading a model at import time.

**Phase:** Address in Phase 1 (application structure / lifespan setup).

---

## Moderate Pitfalls

---

### Pitfall 7: CORS Misconfiguration Blocking React Frontend

**What goes wrong:** FastAPI's `CORSMiddleware` default is to block all cross-origin requests. The React frontend (likely served on `localhost:3000` or a different domain) cannot call the API without explicit CORS headers. Additionally, adding `allow_origins=["*"]` with `allow_credentials=True` is an invalid combination that raises a runtime error from Starlette.

**Prevention:**
- Add `CORSMiddleware` at app creation time, not as an afterthought.
- For development: `allow_origins=["http://localhost:3000", "http://localhost:5173"]` (Vite default).
- For production: explicit origin list from environment variable, never `"*"` with credentials.
- Test CORS from a browser (not curl — curl doesn't enforce CORS) before frontend integration.

**Phase:** Address in Phase 1 (app setup). Takes 5 minutes but blocks all frontend work if missed.

---

### Pitfall 8: Parametric What-If Formulas Return Physically Impossible Values

**What goes wrong:** The what-if engine applies parametric deltas (e.g., `ΔT = -0.8°C per 10% tree canopy increase`) to tract features. Without clipping, the formula can produce: temperature below absolute zero (unclipped negative ΔT accumulation), heat score >1.0 or <0.0 (if score is normalized), tree canopy >100%, impervious surface <0%.

**Why it happens:** Parametric formulas are linear approximations. Stacking multiple interventions (max tree canopy + max cool surfaces + max green space) can push the formula outside its valid domain.

**Consequences:** Planners see nonsensical results like "-20°C cooling effect" or "heat risk: -0.3". Erodes trust in the tool. Could cause policy decisions based on incorrect data.

**Prevention:**
- Define explicit physical bounds for every output variable (e.g., `tree_canopy_pct` ∈ [0, 100], `heat_score` ∈ [0, 1], ΔT bounded by physical plausibility ±5°C).
- Apply `np.clip()` to all formula outputs before returning.
- Return the applied bounds alongside the result so the frontend can show "intervention capped at physical limit" messaging.
- Unit test edge cases: all-max intervention, all-min intervention, interventions applied to already-extreme tracts.

**Phase:** Address in Phase 2 (what-if engine). Bounds must be defined before formula coefficients are finalized.

---

### Pitfall 9: DuckDB `read_only=True` Prevents Startup Schema Checks

**What goes wrong:** Opening DuckDB in read-only mode (recommended for concurrent access) prevents running `CREATE TABLE IF NOT EXISTS` or any DDL. If startup code tries to verify schema existence by running DDL, it will fail with a read-only exception.

**Prevention:**
- Use `SELECT` queries to validate schema on startup (e.g., `SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'tract_features'`).
- Never run DDL from the FastAPI app — all schema management belongs to the offline pipeline scripts.
- Raise a clear `RuntimeError("Required table tract_features not found in king_county.duckdb")` at startup if validation fails, rather than letting queries fail at request time.

**Phase:** Address in Phase 1 (startup validation).

---

### Pitfall 10: XGBoost and TensorFlow Import Conflicts (Threading / OpenMP)

**What goes wrong:** XGBoost and TensorFlow both link against OpenMP and/or MKL for CPU parallelism. On some platforms (particularly macOS arm64), importing both in the same process causes symbol conflicts or thread count competition that degrades performance or crashes with `OMP: Error #15: Initializing libiomp5.dylib, but found libomp.dylib already initialized`.

**Why it happens:** TensorFlow bundles its own OpenMP runtime. XGBoost links against the system OpenMP. When both are loaded in one process, the runtimes collide.

**Prevention:**
- Set `OMP_NUM_THREADS=1` and `TF_NUM_INTRAOP_THREADS=1` in environment before importing either library (appropriate for an API server where parallelism is across requests, not within a single prediction).
- Import TensorFlow before XGBoost (TF's bundled runtime takes precedence).
- Test the import order on the target platform (macOS arm64 is the most problematic).
- In v1 (no live inference), model loading happens once and no prediction runs — so this only surfaces at startup, not per-request.

**Phase:** Address in Phase 1 (startup validation). Add a startup smoke test that imports both and logs "models loaded OK."

---

### Pitfall 11: Pydantic v2 Breaking Changes if Migrating from v1

**What goes wrong:** FastAPI 0.100+ uses Pydantic v2 by default. Pydantic v2 has breaking changes from v1: `class Config` is replaced by `model_config = ConfigDict(...)`, `.dict()` is replaced by `.model_dump()`, validators use `@field_validator` not `@validator`. If any tutorial code or dependency assumes Pydantic v1, mixing versions causes silent validation failures or import errors.

**Prevention:**
- Pin to Pydantic v2 from the start. Do not mix v1 and v2 syntax.
- Use `model_dump()` and `model_validate()` throughout.
- If a library dependency requires Pydantic v1, use `pydantic.v1` compatibility shim — but avoid this situation by checking library compatibility before adding the dependency.

**Phase:** Address in Phase 1 (project setup / dependency pinning).

---

## Minor Pitfalls

---

### Pitfall 12: Float Precision in JSON Responses for Coordinates

**What goes wrong:** Python's default JSON serialization of floats uses full double precision (e.g., `-122.33456789012345`). Geometry coordinates at 15 decimal places add significant payload size with no practical benefit for map rendering (6 decimal places ≈ 0.1m precision, more than sufficient for census tracts).

**Prevention:** Round geometry coordinates to 6 decimal places in the DuckDB query or in the Python serialization layer. This can reduce GeoJSON payload size by 20–40%.

**Phase:** Optimization pass after Phase 2.

---

### Pitfall 13: Missing `asyncio.to_thread` for DuckDB Queries in Async Routes

**What goes wrong:** DuckDB queries are synchronous (they block). Calling them directly in an `async def` route blocks the event loop for the duration of the query. Under concurrent load, all other requests wait.

**Prevention:**
- Wrap DuckDB calls with `await asyncio.to_thread(connection.execute, query, params)` in async routes.
- OR: Define DuckDB routes as `def` (not `async def`) — FastAPI dispatches them to the thread pool automatically.
- The `def` approach is simpler for this project since there are no true async I/O operations within the DuckDB routes (no awaitable calls inside them).

**Phase:** Address in Phase 2 (geometry/prediction endpoints). Establish the pattern on the first endpoint and apply consistently.

---

### Pitfall 14: `ST_AsGeoJSON` Returns Geometry Without CRS (No `crs` Field)

**What goes wrong:** DuckDB's `ST_AsGeoJSON()` returns GeoJSON geometry objects without a `crs` field. If the source data is in a projected CRS (e.g., Washington State Plane, EPSG:2926) rather than WGS84 (EPSG:4326), the frontend map library will plot polygons in the wrong location (ocean, or far from King County).

**Prevention:**
- Verify the CRS of geometries in `king_county.duckdb` before writing the first geometry endpoint.
- Run `SELECT ST_SRID(geom) FROM tract_features LIMIT 1` (if SRID is stored) or visually verify a known-location tract against its expected coordinates.
- If geometries are in a projected CRS, use DuckDB's `ST_Transform(geom, 'EPSG:2926', 'EPSG:4326')` to reproject to WGS84 before `ST_AsGeoJSON()`.
- Document the CRS decision in the API schema.

**Phase:** Address at the very start of Phase 2 (first geometry query). Wrong CRS compounds every subsequent geometry test.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| App startup / lifespan | TF/XGBoost blocking event loop (Pitfall 2) | Run model loads in executor; log load time |
| App startup / lifespan | Models at import time breaking tests (Pitfall 6) | Use `app.state.models` via lifespan |
| App startup / lifespan | XGBoost + TF OpenMP conflict (Pitfall 10) | Set OMP env vars before import |
| DuckDB connection setup | Thread-unsafe shared connection (Pitfall 1) | Per-request `Depends()` connection |
| DuckDB connection setup | read_only DDL failure (Pitfall 9) | SELECT-only schema validation |
| Geometry endpoints | WKT vs GeoJSON mismatch (Pitfall 4) | `json.loads(ST_AsGeoJSON())` pattern |
| Geometry endpoints | Payload too large (Pitfall 3) | ST_Simplify in query; measure sizes against real data |
| Geometry endpoints | Wrong CRS in source data (Pitfall 14) | Verify SRID before first endpoint |
| Geometry endpoints | Async event loop blocking (Pitfall 13) | Use `def` routes or `asyncio.to_thread` |
| What-if engine | Physically impossible output values (Pitfall 8) | Clip all outputs to physical bounds |
| Chat endpoint | Context window overflow (Pitfall 5) | Token budget + summary projection |
| Project setup | CORS missing for React frontend (Pitfall 7) | Add middleware in Phase 1 |
| Project setup | Pydantic v2 version mixing (Pitfall 11) | Pin Pydantic v2 from day one |

---

## Sources

**Confidence assessment:**

- DuckDB thread safety (HIGH): DuckDB documentation explicitly states connection objects are not thread-safe. The `read_only` multi-connection pattern is the documented recommendation for concurrent readers. Verified against DuckDB 0.9+ docs.
- FastAPI async blocking (HIGH): FastAPI/Starlette official docs document that `async def` routes run on the event loop and synchronous blocking calls must be dispatched via `run_in_executor` or `asyncio.to_thread`. This is a well-documented FastAPI gotcha.
- TF/XGBoost startup blocking (HIGH): Standard Python ML serving pattern — well-documented in FastAPI ML deployment guides and TensorFlow serving documentation.
- GeoJSON payload sizes (MEDIUM): Based on King County census tract count (~400 tracts) and typical shapefile vertex density. Actual sizes depend on `king_county.duckdb` source resolution.
- Anthropic context window (HIGH): Anthropic API documentation specifies token limits per model. Claude 3.5 Sonnet has 200K context window but at high cost per token; practical budget constraint is cost and latency, not hard limit.
- XGBoost/TF OpenMP conflict (MEDIUM): Known macOS arm64 issue reported in XGBoost GitHub issues and TensorFlow forums. May not reproduce on Linux CI.
- Pydantic v2 breaking changes (HIGH): FastAPI changelog and Pydantic v2 migration guide document all breaking changes explicitly.
- CRS verification (HIGH): Standard GIS practice; DuckDB spatial extension supports `ST_SRID()` and `ST_Transform()` per DuckDB spatial docs.
