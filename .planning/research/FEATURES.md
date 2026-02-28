# Feature Landscape

**Domain:** Geospatial urban heat policy API — census tract/block analytics, ML predictions, what-if simulations, AI chat
**Project:** Urban Heat Mapping — King County Backend API
**Researched:** 2026-02-28
**Confidence:** MEDIUM (web tools unavailable; based on PROJECT.md context + established FastAPI/geospatial API domain knowledge)

---

## Table Stakes

Features users (the React frontend) expect. Missing = frontend cannot function.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `GET /tracts` — list all tracts with heat/risk scores | Frontend map layer requires all tract geometries + scores to render the choropleth | Med | Returns GeoJSON FeatureCollection; geometry from DuckDB WKT/GeoJSON column |
| `GET /tracts/{tract_id}` — single tract detail | Frontend detail panel needs full feature vector + all three model scores for a selected tract | Low | Returns typed JSON; include `tract_features` fields + `tract_outputs_with_preds` |
| `GET /tracts/{tract_id}/geometry` — geometry only | Separate endpoint for geometry avoids re-fetching heavy feature vectors on zoom/pan | Low | Returns GeoJSON Feature; allows lightweight tile-style usage |
| `GET /blocks` with `?tract_id=` filter | Block-level drill-down within a tract; essential for planner investigation workflow | Med | Filter required; full block list without filter likely too large to be useful |
| `GET /blocks/{block_id}` — single block detail | Block detail panel mirrors tract detail panel | Low | Same shape as tract detail response |
| `GET /predictions/tracts` — pre-scored predictions for all tracts | Frontend needs all three model scores (XGBoost heat, XGBoost risk, TF risk) to color the map | Med | Returns array of `{tract_id, xgb_heat_score, xgb_risk_score, tf_risk_score}`; no geometry needed here (frontend joins by ID) |
| `POST /simulations/what-if` — parametric intervention calculator | Core product value; frontend sends scenario params and gets back delta scores per tract | High | Accepts `{tract_ids, interventions: {tree_canopy_pct, albedo_delta, green_space_sqft}}`; returns `{tract_id, delta_temp, delta_risk}` per tract using rule-based formulas |
| `POST /chat` — Claude-powered map context chat | AI assistant is a listed requirement; without it the chat panel is dead | High | Accepts `{message, map_context: {selected_tracts, scenario_params, current_scores}}`; returns `{reply, usage}` |
| GeoJSON output for all geometry endpoints | React map libraries (Mapbox GL, Deck.gl, Leaflet) all consume GeoJSON natively; WKT is not usable by frontend without conversion | Med | DuckDB `ST_AsGeoJSON()` handles WKT → GeoJSON conversion at query time |
| Typed JSON error responses | Frontend must handle errors gracefully; unpredictable error shapes break the UI | Low | Standard `{error: string, detail: string, status_code: int}` envelope at all endpoints |
| CORS configured for React dev server | Without CORS the frontend at `localhost:3000` cannot call `localhost:8000` | Low | FastAPI `CORSMiddleware`; allow all origins in v1 (internal use only) |
| `GET /health` — liveness check | Deployment health checks and frontend "API unavailable" states require this | Low | Returns `{status: "ok", models_loaded: bool, db_connected: bool}` |
| OpenAPI / Swagger UI at `/docs` | FastAPI provides this for free; city planners and developers need it for exploration | Low | Zero implementation cost; do not disable |

---

## Differentiators

Features that make this tool compelling versus a generic data-access layer.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Multi-score prediction response (XGBoost heat + XGBoost risk + TF risk together) | Exposes model disagreement/ensemble signal; a planner seeing two models agree has higher confidence than one | Low | Return all three scores in every prediction response rather than forcing separate calls; comparison value is immediate |
| Scenario comparison endpoint — `POST /simulations/compare` | Lets frontend render side-by-side or overlay of baseline vs. scenario without storing state server-side | Med | Accepts `{tract_ids, scenarios: [scenario_A, scenario_B]}`; returns delta arrays for both; deferred to v2 if needed |
| Map-context-aware chat (full context injection) | Generic LLM chat is table stakes today; chat that knows which tracts are selected and what scenario is active is genuinely useful for policy work | High | System prompt includes serialized map state: selected tract IDs, current scores, active intervention params, county summary stats |
| Tract ranking endpoint — `GET /predictions/tracts/ranked` | Planners need to know "worst 20 tracts" without sorting client-side on a large payload | Low | `?sort_by=xgb_heat_score&order=desc&limit=20`; simple DuckDB `ORDER BY` + `LIMIT` |
| Bounding-box spatial filter — `?bbox=minLon,minLat,maxLon,maxLat` | Map viewport-driven queries; frontend only fetches tracts visible in current map view | Med | Requires DuckDB spatial extension `ST_Within` or `ST_Intersects`; avoids sending all 400+ tracts on every viewport change |
| Intervention formula transparency endpoint — `GET /simulations/formulas` | City planners and their managers will ask "how is this calculated?"; returning the formula coefficients builds trust | Low | Returns `{tree_canopy: {formula: "delta_T = -0.07 * canopy_pct_increase", unit: "°C"}, ...}`; hardcoded metadata, not computed |
| Batch tract lookup — `POST /tracts/batch` with `{tract_ids: [...]}` | Frontend selected-set operations (user draws a polygon, selects 15 tracts) need efficient multi-ID fetch | Low | Avoids N+1 round trips; DuckDB `WHERE tract_id IN (...)` |
| Summary statistics endpoint — `GET /summary/county` | Dashboard header widgets (county-wide avg heat score, count of high-risk tracts) need aggregated stats | Low | Returns `{tract_count, mean_heat_score, p75_heat_score, high_risk_tract_count}`; single DuckDB aggregation query |

---

## Anti-Features

Features to explicitly NOT build in v1.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Live model re-inference for baseline predictions | Models already scored; re-running XGBoost/TF on every `/predictions` request adds latency with zero accuracy benefit | Query `tract_outputs_with_preds` from DuckDB directly; models stay in memory for future what-if live inference only |
| Authentication / API keys / JWT | No external consumers in v1; auth adds implementation surface and blocks frontend development velocity | Trust network boundary (localhost only); add auth in the phase when external access is required |
| Rate limiting | Single internal consumer; rate limiting has no protection value here and adds complexity | Add in the phase when this becomes a public or multi-tenant API |
| WebSocket / server-sent events for streaming chat | Claude streaming is compelling UX but HTTP streaming requires frontend infrastructure changes that are out of scope for v1 | Return full `reply` string in single POST response; add streaming in v2 |
| Persistent chat sessions / conversation history | Session management requires state storage (Redis, DB table); adds significant complexity for a v1 feature the frontend can handle client-side | Frontend maintains message history and passes full conversation context in each POST request |
| Budget allocation optimizer | Explicitly out of scope per PROJECT.md; complex optimization problem (LP/MILP) that deserves its own phase | Defer; the what-if simulation data produced in v1 feeds this optimizer when it's built |
| Vector tile (MVT) serving | Proper vector tile serving requires a tile cache pipeline (MBTiles, pg_tileserve, or Martin); not justified for a single internal consumer | Return GeoJSON from DuckDB; React frontend can render a few hundred tracts without tile infrastructure |
| Write / mutation endpoints (POST/PUT/DELETE on data) | The data pipeline is out of scope; DuckDB is treated as read-only for the API phase | All data mutations happen in the offline pipeline scripts/notebooks, not via the API |
| External data enrichment at query time (live Census API, live weather) | Introduces network dependency and latency into every request; breaks offline usage | Pre-compute all features in the DuckDB pipeline; API is offline-capable |
| Multi-county or national scope | King County scope is explicit in the project; scope creep here inflates the data model before v1 is validated | Pin all geometry queries to King County FIPS; add multi-county as a future scope expansion |

---

## Feature Dependencies

```
GET /tracts (geometry + scores)
  └── requires: DuckDB tables tract_features + tract_outputs_with_preds
  └── requires: ST_AsGeoJSON() conversion at query time

GET /blocks?tract_id=
  └── requires: GET /tracts (tract must exist to drill into blocks)
  └── requires: block geometry table in DuckDB

POST /simulations/what-if
  └── requires: GET /tracts/{tract_id} (need current feature values as baseline)
  └── requires: parametric formula coefficients defined and documented
  └── inputs feed: GET /predictions/tracts/ranked (post-scenario ranking)

POST /chat
  └── requires: GET /predictions/tracts (scores to inject as context)
  └── requires: POST /simulations/what-if results (scenario context for chat)
  └── requires: Anthropic API key + anthropic SDK installed
  └── depends on: map_context shape agreed with frontend team

GET /predictions/tracts/ranked
  └── requires: GET /predictions/tracts (same underlying query, adds ORDER BY + LIMIT)

GET /summary/county
  └── requires: GET /predictions/tracts (same table, aggregation query)

CORS
  └── required by: all endpoints (must be configured before any frontend call works)

GET /health
  └── models_loaded flag: requires XGBoost + TF models loaded at startup
  └── db_connected flag: requires DuckDB connection pooling/singleton
```

---

## MVP Recommendation

**Prioritize (must ship for frontend to be buildable):**

1. `GET /health` — zero risk, validates startup wiring
2. `GET /tracts` — GeoJSON FeatureCollection with scores; this is the map layer
3. `GET /tracts/{tract_id}` — detail panel
4. `GET /predictions/tracts` — all model scores; powers choropleth coloring
5. `POST /simulations/what-if` — core product differentiator; must be functional for any planner demo
6. `POST /chat` — AI assistant; high value, medium-high implementation effort
7. `GET /blocks?tract_id=` — block drill-down; needed for block-level analysis

**Defer to v1.1 / v2 (valuable but not blocking):**

- `GET /predictions/tracts/ranked` — frontend can sort client-side in v1
- `GET /summary/county` — frontend can compute from full tract payload in v1
- `POST /tracts/batch` — N+1 is acceptable in v1 for small selected sets
- Bounding-box spatial filter — sending all tracts is fine for King County scale (~400-500 tracts)
- `POST /simulations/compare` — single-scenario comparison is sufficient for v1 demos
- `GET /simulations/formulas` — important for trust but not blocking

---

## API Design Conventions (Applies Across All Features)

These are not individual features but apply uniformly and are table stakes for a usable API.

| Convention | Standard | Rationale |
|------------|----------|-----------|
| Response envelope for geometry | GeoJSON `FeatureCollection` for list endpoints, GeoJSON `Feature` for single-item geometry endpoints | Mapbox GL / Deck.gl consume FeatureCollections directly |
| Response envelope for non-geometry | `{data: [...], meta: {count, total}}` for lists; `{data: {...}}` for single items | Consistent shape lets frontend handle all responses uniformly |
| Error shape | `{error: "Not Found", detail: "Tract 53033012345 not found", status_code: 404}` | FastAPI `HTTPException` handles this automatically |
| Pagination | `?limit=100&offset=0` for list endpoints that could grow | King County tract count (~500) fits in one page; pagination prep is low cost |
| Filtering | `?tract_id=`, `?min_heat_score=`, `?risk_tier=high|medium|low` query params | Frontend map interactions are filter-driven |
| Content-Type | `application/json` for all responses (including GeoJSON) | GeoJSON is valid JSON; no separate content-type negotiation needed |
| HTTP methods | `GET` for reads, `POST` for simulations/chat (stateful input), no `PUT/DELETE` | Simulations and chat have non-trivial request bodies; POST is appropriate |
| Versioning | `/api/v1/` prefix on all routes | Zero cost to add now; avoids breaking frontend when v2 routes change |
| Null handling | Return `null` for missing scores, not omit the key | Frontend code must not crash on undefined property access |

---

## Sources

- **PROJECT.md** (primary): `/Users/shrey/Desktop/UrbanPlanning/Urban_HeatMapping/.planning/PROJECT.md` — project requirements, constraints, out-of-scope decisions
- **Domain knowledge (HIGH confidence)**: FastAPI REST API design conventions, GeoJSON RFC 7946 specification, standard geospatial API patterns (OGC API Features, ESRI REST API conventions), urban analytics tool design patterns (EPA EJScreen, CalEnviroScreen, EJAM API patterns)
- **Domain knowledge (MEDIUM confidence)**: DuckDB spatial extension capabilities (`ST_AsGeoJSON`, `ST_Within`), Anthropic API chat context injection patterns
- **Web research**: Not available in this session (permissions restricted); claims above derived from training knowledge of geospatial API ecosystems as of August 2025
