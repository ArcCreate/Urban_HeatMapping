# Milestones

## v1.0 MVP (Shipped: 2026-03-01)

**Phases completed:** 4 phases, 10 plans
**Git range:** 662aa6c → 5451f17 (57 commits)
**Python LOC:** 2,837 | **Files changed:** 84 | **Timeline:** 1 day (2026-02-28)

**Delivered:** Full FastAPI backend for King County urban heat mapping — data endpoints, simulation engine, and Claude-powered chat assistant, all served from DuckDB with 492 tracts and 25,552 blocks.

**Key accomplishments:**
1. FastAPI scaffold with pydantic-settings config, XGBoost+TF model loader (macOS arm64 OpenMP fix), and DI helpers — importable without model files
2. App wiring: asynccontextmanager lifespan, CORS, JSON exception handlers (`{error, detail, status_code}`), health endpoint + 8 smoke tests
3. Offline DuckDB pipeline producing `king_county.duckdb` with 492 tracts + 25,552 blocks in WGS84 WKT from TIGER Census data (100% geometry match)
4. Complete data API: tract/block GeoJSON endpoints, prediction/summary/batch endpoints — all DuckDB-backed with enum-validated query params (422 on bad input)
5. Parametric simulation engine: `POST /simulations/what-if` and `/compare` using literature-sourced coefficients (BETA_CANOPY=0.04, BETA_ALBEDO=5.4, BETA_GREEN_SPACE=5.0e-6)
6. Claude chat endpoint: `POST /api/v1/chat` with context-aware system prompt (enumerate ≤50 tracts / summarize >50), async haiku-4-5 integration

---

