# Phase 3: Simulation Engine — Context

**Gathered:** 2026-02-28
**Status:** Ready for planning
**Source:** Synthesized from PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md, technical_spec.md

<domain>
## Phase Boundary

Phase 3 delivers two POST endpoints under `/api/v1/simulations/`:

- `POST /api/v1/simulations/what-if` — accepts a set of tract IDs and an interventions payload, applies parametric formulas per tract, returns per-tract `{tract_id, delta_temp, delta_risk}` deltas
- `POST /api/v1/simulations/compare` — wraps two scenario payloads and returns side-by-side per-tract deltas for scenario_a and scenario_b in a single response

This phase does NOT perform live ML model re-inference. All simulation math is rule-based parametric formulas applied to pre-stored tract feature data from DuckDB. The XGBoost/TF models already in `app.state.models` are not called during simulation.

New files:
- `app/routers/simulations.py`
- `app/services/simulations.py`
- `app/schemas/simulations.py`
- `tests/test_simulations.py`
- Wire `simulations.router` into `app/main.py`

</domain>

<decisions>
## Implementation Decisions

### Locked: No live model inference
Parametric formulas only — the what-if engine must NOT call `app.state.models` (XGBoost/TF). Formulas are applied directly to tract feature values fetched from DuckDB. This is a hard v1 constraint from PROJECT.md.

### Locked: Three interventions, exact input field names
Request body must accept exactly these three intervention fields (from SIM-01/SIM-02):
- `tree_canopy_pct` — percentage increase in tree canopy cover (e.g., 5.0 = +5%)
- `albedo_delta` — change in surface albedo (0.0–1.0 scale, unitless)
- `green_space_sqft` — additional green space in square feet

All three are optional per intervention (a planner may set only one or two). Missing fields default to 0.

### Locked: Output shape
What-if returns a list of `{tract_id, delta_temp, delta_risk}` per requested tract.
Compare returns a list of `{tract_id, scenario_a: {delta_temp, delta_risk}, scenario_b: {delta_temp, delta_risk}}` per requested tract.
Units: delta_temp in °F (negative = cooling), delta_risk as a unitless signed float (negative = reduced risk).

### Locked: Physical bounds
Outputs must be physically bounded — delta values must be clamped so absolute predicted temperatures can never go below 0°F and never exceed a reasonable physical maximum (~150°F). delta_risk must be clamped so risk scores never go below 0.0 or above 1.0 after applying the delta.

### Locked: Empty tract_ids → 422, unknown tract_id → 404
- Empty `tract_ids` list → 422 with standard `{error, detail, status_code}` shape (validated at schema layer using `@field_validator`, same pattern as BatchRequest)
- Tract ID not found in DuckDB → 404 with standard error shape (checked in service layer, raises HTTPException)

### Locked: Route prefix and tags
- Router prefix: `/simulations`
- Tags: `["Simulations"]`
- Mounted in main.py under `/api/v1` prefix

### Locked: def handlers (not async def)
Consistent with all Phase 2 routers — DuckDB is synchronous, all route handlers use `def`, not `async def`.

### Locked: get_db dependency injection
Service functions receive `db` via `Depends(get_db)`, same pattern as tracts/blocks/predictions/summary.

### Locked: tree canopy coefficient sourced from technical_spec.md
Seattle canopy research gives: +13% canopy → ~0.5°F cooling.
Therefore: `beta_canopy = 0.04°F per 1% canopy increase` (0.5 / 13 ≈ 0.0385, rounded to 0.04).
This is the canonical coefficient for `tree_canopy_pct` in the parametric formula.

### Locked: Data source for tract features
Simulation lookups use the `tract_features` table in DuckDB — specifically `mean_tree_cov` and `mean_afternoon_temp` columns. Pre-scored risk values come from `tract_outputs_with_preds` columns `xgb_heat_score`, `xgb_risk_score`. Both tables are joined on `tract_id`.

### Locked: max tract_ids cap
`tract_ids` list capped at 200 items maximum (same as BatchRequest) — prevents unbounded DuckDB fan-out queries.

### Claude's Discretion
- Albedo and green space formula coefficients — researcher should derive from literature (e.g., urban heat island studies on cool roofs, park cooling effect per sqft). Must be documented as constants in the service file with citation comments.
- Whether to compute delta_risk via a proportional approximation (e.g., `xgb_risk_score × heat_weight × delta_temp_fraction`) or a fixed sensitivity formula — researcher should propose the most defensible approach given only pre-scored values are available.
- Whether what-if and compare share a single internal compute function (recommended to avoid duplication)
- Test fixtures: whether to reuse `test_db` fixture pattern from Phase 2 or create a dedicated simulation test fixture
- Whether to validate intervention parameter bounds (e.g., tree_canopy_pct must be ≥ 0 and ≤ 100) at the schema layer

</decisions>

<specifics>
## Specific Ideas

**From technical_spec.md:**
- Tree canopy coefficient: `beta_canopy = 0.04°F per 1%` — hardcode this constant in the service file
- Risk formula weight: heat contributes ~40% of risk score (risk = 0.4×heat + 0.3×canopy_gap + 0.2×health + 0.1×equity)
- Models in `app.state.models` are NOT used for simulation — they're for future live inference only

**From STATE.md blocker:**
> "Parametric formula coefficients (delta-T per % tree canopy, per albedo delta, per sqft green space) are not yet documented. Must be sourced before Phase 3 planning begins."
— Tree canopy is now resolved. Researcher must source albedo and green_space coefficients.

**DuckDB tables relevant to Phase 3:**
- `tract_features` — has `mean_tree_cov`, `mean_afternoon_temp`, `mean_morning_temp`, `mean_evening_temp` and all vulnerability/health features
- `tract_outputs_with_preds` — has `xgb_heat_score`, `xgb_risk_score`, `tf_risk_score` pre-scored

**Conda env:**
- All Python must target `/opt/anaconda3/envs/urban-heatmap/` (Python 3.12). Tests run with the conda env pytest.

</specifics>

<deferred>
## Deferred Ideas

- **SIM-V2-01**: Formula transparency endpoint `GET /simulations/formulas` — deferred to v2 per REQUIREMENTS.md
- **SIM-V2-02**: Bounding-box spatial filter on simulation endpoints — deferred to v2
- **Live model re-inference for simulations** — explicitly out of scope for v1; models in memory are for future phases
- Optimization endpoint (`POST /api/optimize_trees` from original technical spec) — not in v1 requirements; budget optimizer deferred
- Stochastic/Monte Carlo simulation — not required; deterministic parametric formulas only for v1

</deferred>

---

*Phase: 03-simulation-engine*
*Context gathered: 2026-02-28 via project file synthesis*
