# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-01
**Phases:** 4 | **Plans:** 10 | **Sessions:** 1

### What Was Built

- FastAPI backend with health, CORS, and JSON exception handlers wired via asynccontextmanager lifespan
- DuckDB pipeline producing 492 tracts + 25,552 blocks in WGS84 WKT (35 MB king_county.duckdb)
- Full data API: tract/block GeoJSON endpoints, prediction/summary/batch with enum-validated query params
- Parametric simulation engine (what-if + compare) using literature-sourced Beta coefficients
- Claude haiku-4-5 chat endpoint with token-budget system prompt (enumerate ≤50 / summarize >50 tracts)

### What Worked

- **Layer-by-layer phasing:** Each phase (foundation → data → simulation → chat) built on the last cleanly; no backtracking needed
- **Synchronous DuckDB pattern with db.cursor():** Consistent thread-safety across all data endpoints; FastAPI dispatches to threadpool automatically — no async complexity needed
- **Test isolation via app.state override:** Unit tests with MagicMock/AsyncMock injection allowed testing chat endpoint with zero real API calls; same pattern worked for DuckDB via in-memory test_db fixture
- **Idempotent router registration guards in test files:** Prevented duplicate route registration when tests were run before/after main.py wiring — solved a recurring pain point cleanly
- **Compact system prompt format (h=, rx=, rt= abbreviations):** Kept 50-tract enumeration under 3000 chars (2607 chars vs. 3407 verbose) — discovered via failing test, fixed immediately

### What Was Inefficient

- **Placeholder model scores in DuckDB:** PRED column normalization was expedient but real trained scores need to be loaded separately via `scripts/train_models.py` before production use
- **Python 3.12 env discovery:** TF 2.20.0 segfault on Python 3.13 arm64 was only caught at first import in Plan 01; earlier env validation would have saved a deviation
- **IDE linter interference on main.py:** Background linter reverted edit-tool changes between calls on Plan 02-05; Write tool (full rewrite) worked more reliably than incremental Edit for heavily modified files

### Patterns Established

- `db.cursor()` per service call for thread-safe DuckDB access under FastAPI threadpool
- `async def` only for I/O-bound Anthropic SDK calls; all DuckDB handlers use `def` (synchronous, threadpool)
- `AsyncMock` for AsyncAnthropic in tests — `app.state.anthropic = make_mock_anthropic()` fixture pattern
- In-memory DuckDB test_db with `INSTALL/LOAD spatial` mirrors production without 35MB artifact
- Enum-validated query params (SortColumn, SortOrder) prevent SQL injection, return 422 automatically
- Pipeline deps isolated in `scripts/requirements-pipeline.txt` (pygris, geopandas, shapely) — separate from app
- `StarletteHTTPException` (not `fastapi.HTTPException`) for 4xx handlers — catches routing-generated 404/405

### Key Lessons

1. **TF + Python version gating:** Always verify ML library compatibility before scaffolding on a new machine; TF 2.x pinned to Python 3.12 arm64 — document this in requirements.txt immediately
2. **Token budget strategy belongs in the plan, not discovered at test time:** System prompt character limits should be calculated in the research phase so the format is designed correctly from the start
3. **Write tool > Edit tool for heavily auto-corrected files:** When a file is being modified by background tools (linters, formatters), use Write for atomic full-file replacement rather than incremental Edit calls
4. **Idempotent guards in test files prevent brittle import-order issues:** The `hasattr(r, 'path') and '/simulations' in path` guard pattern should be standard for any router test file

### Cost Observations

- Model mix: ~90% sonnet (execution), ~10% haiku (quick lookups)
- Sessions: 1 (entire v1.0 in a single execution session)
- Notable: All 4 phases completed in ~1 day wall clock time; yolo mode + parallelization kept plan execution at 2-8 min/plan

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | 1 | 4 | Initial — established all core patterns |

### Cumulative Quality

| Milestone | Tests | Zero-Dep Additions |
|-----------|-------|-------------------|
| v1.0 | ~50 (across all phases) | 0 unplanned |

### Top Lessons (Verified Across Milestones)

1. Synchronous DuckDB + FastAPI threadpool (via `def` handlers) is reliable and simpler than async wrappers
2. Test isolation via app.state override is the correct pattern for testing FastAPI apps with shared resources
