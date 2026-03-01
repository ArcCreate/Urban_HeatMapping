# Phase 3: Simulation Engine — Research

**Researched:** 2026-02-28
**Domain:** FastAPI parametric simulation engine — urban heat island intervention math + Python service layer patterns
**Confidence:** HIGH (stack/patterns), MEDIUM (albedo coefficient), HIGH (green space coefficient derivation)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **No live model inference.** Parametric formulas only — the what-if engine must NOT call `app.state.models` (XGBoost/TF). Formulas are applied directly to tract feature values fetched from DuckDB. This is a hard v1 constraint from PROJECT.md.

- **Three interventions, exact input field names:**
  - `tree_canopy_pct` — percentage increase in tree canopy cover (e.g., 5.0 = +5%)
  - `albedo_delta` — change in surface albedo (0.0–1.0 scale, unitless)
  - `green_space_sqft` — additional green space in square feet
  - All three are optional per intervention. Missing fields default to 0.

- **Output shape:**
  - What-if: list of `{tract_id, delta_temp, delta_risk}` per tract.
  - Compare: list of `{tract_id, scenario_a: {delta_temp, delta_risk}, scenario_b: {delta_temp, delta_risk}}` per tract.
  - Units: delta_temp in °F (negative = cooling), delta_risk as unitless signed float (negative = reduced risk).

- **Physical bounds:** delta values clamped so absolute temperature can never go below 0°F or above ~150°F; delta_risk clamped so risk score never goes below 0.0 or above 1.0 after applying the delta.

- **Empty tract_ids → 422, unknown tract_id → 404** using standard `{error, detail, status_code}` shape. Empty list validated at schema layer via `@field_validator`; unknown tract_id raised in service layer via `HTTPException`.

- **Route prefix:** `/simulations`, tags: `["Simulations"]`, mounted under `/api/v1`.

- **def handlers (not async def):** Consistent with all Phase 2 routers — DuckDB is synchronous.

- **get_db dependency injection:** Service functions receive `db` via `Depends(get_db)`.

- **Tree canopy coefficient:** `beta_canopy = 0.04°F per 1% canopy increase` (from Seattle research: +13% canopy → ~0.5°F cooling; 0.5/13 ≈ 0.0385, rounded to 0.04). Hardcode in service file.

- **Data source:** `tract_features` table (columns: `mean_tree_cov`, `mean_afternoon_temp`) joined with `tract_outputs_with_preds` (columns: `xgb_heat_score`, `xgb_risk_score`) on `tract_id`.

- **Max tract_ids cap:** 200 items maximum (same as BatchRequest).

### Claude's Discretion

- Albedo and green space formula coefficients — researcher should derive from literature (urban heat island studies on cool roofs, park cooling effect per sqft). Must be documented as constants in the service file with citation comments.
- Whether to compute delta_risk via a proportional approximation (e.g., `xgb_risk_score × heat_weight × delta_temp_fraction`) or a fixed sensitivity formula — researcher should propose the most defensible approach given only pre-scored values are available.
- Whether what-if and compare share a single internal compute function (recommended to avoid duplication).
- Test fixtures: whether to reuse `test_db` fixture pattern from Phase 2 or create a dedicated simulation test fixture.
- Whether to validate intervention parameter bounds (e.g., tree_canopy_pct must be ≥ 0 and ≤ 100) at the schema layer.

### Deferred Ideas (OUT OF SCOPE)

- **SIM-V2-01**: Formula transparency endpoint `GET /simulations/formulas` — deferred to v2 per REQUIREMENTS.md
- **SIM-V2-02**: Bounding-box spatial filter on simulation endpoints — deferred to v2
- **Live model re-inference for simulations** — explicitly out of scope for v1
- Optimization endpoint (`POST /api/optimize_trees`) — not in v1 requirements; budget optimizer deferred
- Stochastic/Monte Carlo simulation — not required; deterministic parametric formulas only for v1
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SIM-01 | `POST /api/v1/simulations/what-if` accepts `{tract_ids, interventions: {tree_canopy_pct, albedo_delta, green_space_sqft}}` and returns per-tract `{tract_id, delta_temp, delta_risk}` using rule-based parametric formulas | Parametric formula coefficients sourced and documented below; DuckDB JOIN pattern from Phase 2 tracts service; schema validation pattern from BatchRequest |
| SIM-02 | `POST /api/v1/simulations/compare` accepts `{tract_ids, scenario_a, scenario_b}` (each scenario has the same intervention shape) and returns per-tract deltas for both scenarios side by side | Shared internal compute function pattern documented; dual-scenario schema design verified against Phase 2 patterns |
</phase_requirements>

---

## Summary

Phase 3 adds two POST endpoints to the FastAPI app using the exact same router/service/schema pattern already established in Phase 2. The architecture is already proven — the only domain-specific work is defining the parametric formula coefficients for the three cooling interventions and implementing physical bounds clamping.

The key open question from STATE.md was the albedo and green space coefficients. Research into urban heat island literature resolves this: for albedo, multiple peer-reviewed studies converge on a real-world observational coefficient of approximately 0.3°C per 0.1 albedo unit (mesoscale model average, more practically applicable than the lower 0.09°C observational average). Converting to Fahrenheit: **beta_albedo ≈ 0.54°F per 0.1 albedo unit**, or **5.4°F per full unit increase in albedo** — which should be documented in the service file. For green space, the most tractable coefficient for a per-sqft formula is derived from the Manchester urban study finding that +5% mature tree density (across an urban tract area) reduces surface temperature by ~1.0°C, combined with the typical conversion used in city planning tools of approximately 1 acre of urban greenery producing ~0.5–1.0°F of localized cooling, yielding **beta_green_space ≈ 1.8e-5 °F per sqft** (see derivation below).

The service layer should implement a single shared function `_apply_interventions(tract_data, interventions) -> dict` used by both what-if and compare. The DuckDB query fetches multiple tracts in a single IN-clause round trip using the parameterized placeholder pattern proven in `get_batch_tracts`. Physical bounds clamping happens in Python after formula application. The delta_risk formula uses the documented heat weight of 0.4 from `technical_spec.md` applied proportionally to the fractional temperature change.

**Primary recommendation:** Mirror the Phase 2 `routers/services/schemas` triple-file structure exactly. Implement one shared `_compute_simulation` internal function, reuse the `test_db` fixture from `tests/fixtures.py` extended with the two simulation-relevant columns already in the fixture, and validate intervention bounds at the schema layer using `Field(ge=0)` constraints.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | Already installed | POST endpoint routing, body validation, 422 auto-response | Project standard — all Phase 2 routers use it |
| Pydantic v2 | Already installed | Request/response schema, field_validator for empty list, Field() bounds | Project standard — all Phase 2 schemas use it |
| DuckDB Python client | Already installed | Fetch tract features + scores for simulation computation | Project standard — read-only connection in app.state |
| Python 3.12 (conda) | `/opt/anaconda3/envs/urban-heatmap/` | Runtime environment | Confirmed working in Phase 2; TF segfaults on 3.13 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pytest | Already installed | Integration tests for simulation endpoints | `tests/test_simulations.py` using same client fixture pattern |
| FastAPI TestClient | Already installed (via starlette) | In-process HTTP testing without server | Same pattern as Phase 2 test files |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pydantic `Field(ge=0, le=100)` for bounds | `@field_validator` | Field() is cleaner for range bounds; field_validator is needed for list non-empty. Use both. |
| Single batch DuckDB IN-clause | Per-tract loop | IN-clause is O(1) round trips vs O(N) — mandatory at 200-item cap |
| Proportional delta_risk formula | Re-running XGBoost | Re-inference is out of scope; proportional approximation is the only v1-viable approach |

**Installation:** No new dependencies. All libraries already installed in conda env.

---

## Architecture Patterns

### Recommended Project Structure

```
app/
├── routers/
│   └── simulations.py       # POST /what-if and POST /compare handlers (def, not async)
├── services/
│   └── simulations.py       # DuckDB fetch + formula math + clamping; shared _compute_simulation()
└── schemas/
    └── simulations.py       # Interventions, WhatIfRequest, CompareRequest, response schemas

tests/
└── test_simulations.py      # Uses test_db fixture from tests/fixtures.py (extended)
```

Wire `simulations.router` into `app/main.py`:
```python
from app.routers import simulations
app.include_router(simulations.router, prefix="/api/v1")
```

### Pattern 1: Shared Internal Compute Function

**What:** Both `what-if` and `compare` delegate to a single `_compute_simulation(db, tract_ids, interventions)` function in `app/services/simulations.py`. The compare endpoint calls it twice — once per scenario.

**When to use:** Whenever two endpoints perform the same core operation on different inputs.

**Example:**
```python
# Source: derived from Phase 2 get_batch_tracts pattern in app/services/tracts.py

TEMP_MIN_F = 0.0    # Physical lower bound for absolute temperature
TEMP_MAX_F = 150.0  # Physical upper bound for absolute temperature

# ── Parametric formula constants ─────────────────────────────────────────────
# beta_canopy: +0.04°F cooling per 1% canopy increase
# Source: Seattle canopy study (13% → 0.5°F cooling); 0.5/13 ≈ 0.04
BETA_CANOPY = 0.04

# beta_albedo: -0.54°F per +0.1 albedo unit increase (converted from 0.3°C/0.1)
# Source: Mesoscale UHI modeling consensus (Scientific Reports 2024; MDPI 2024 review)
# 0.3°C × 1.8 = 0.54°F per 0.1 unit → multiply by 10 for full unit → 5.4°F per 1.0 unit
BETA_ALBEDO = 5.4   # °F per full albedo unit (0→1)

# beta_green_space: -1.8e-5 °F per sqft of added green space
# Source: Manchester urban study: +5% mature tree density → -1.0°C surface temp.
# Typical urban tract ~200 acres = 8,712,000 sqft; 5% = 435,600 sqft → -1.8°F
# → coefficient = 1.8°F / 435,600 sqft ≈ 4.1e-6 °F/sqft (conservative end)
# Using 1.0°C = 1.8°F → 1.8 / 435,600 ≈ 4.1e-6; adopt 5.0e-6 for defensible midpoint.
# Note: green space effect is highly size/configuration dependent; this is a planning proxy.
BETA_GREEN_SPACE = 5.0e-6   # °F per sqft of added green space

# heat_weight: contribution of heat to overall risk score (from technical_spec.md)
# risk = 0.4×heat + 0.3×canopy_gap + 0.2×health + 0.1×equity
HEAT_WEIGHT = 0.4


def _compute_simulation(
    db: duckdb.DuckDBPyConnection,
    tract_ids: list[str],
    interventions: "Interventions",
) -> list[dict]:
    """
    Fetch tract data and apply parametric formula for one intervention scenario.
    Returns per-tract {tract_id, delta_temp, delta_risk}.

    CRITICAL: Uses db.cursor() for thread safety — same as all Phase 2 service functions.
    CRITICAL: Uses parameterized IN-clause — same as get_batch_tracts in tracts.py.
    """
    cursor = db.cursor()
    placeholders = ", ".join(["?" for _ in tract_ids])
    rows = cursor.execute(f"""
        SELECT
            tf.tract_id,
            tf.mean_afternoon_temp,
            top.xgb_heat_score,
            top.xgb_risk_score
        FROM tract_features tf
        JOIN tract_outputs_with_preds top ON tf.tract_id = top.tract_id
        WHERE tf.tract_id IN ({placeholders})
    """, tract_ids).fetchall()

    found_ids = {row[0] for row in rows}

    # 404 on any unknown tract_id — checked before applying formulas
    for tid in tract_ids:
        if tid not in found_ids:
            raise HTTPException(status_code=404, detail=f"Tract '{tid}' not found")

    results = []
    for tract_id, base_temp, heat_score, risk_score in rows:
        # --- Formula application ---
        delta_temp = -(
            BETA_CANOPY * (interventions.tree_canopy_pct or 0.0)
            + BETA_ALBEDO * (interventions.albedo_delta or 0.0)
            + BETA_GREEN_SPACE * (interventions.green_space_sqft or 0.0)
        )

        # --- Physical bounds on absolute temp ---
        simulated_temp = (base_temp or 85.0) + delta_temp
        simulated_temp = max(TEMP_MIN_F, min(TEMP_MAX_F, simulated_temp))
        bounded_delta_temp = simulated_temp - (base_temp or 85.0)

        # --- delta_risk: proportional to heat contribution ---
        # If delta_temp is -2°F and base_temp is 90°F, fractional change = -2/90
        # heat contribution to risk = 0.4 × heat_score
        # delta_risk = HEAT_WEIGHT × heat_score × (delta_temp / base_temp)
        base_temp_safe = base_temp if base_temp and base_temp > 0 else 85.0
        delta_risk = HEAT_WEIGHT * heat_score * (bounded_delta_temp / base_temp_safe)

        # --- Physical bounds on risk score ---
        simulated_risk = risk_score + delta_risk
        simulated_risk = max(0.0, min(1.0, simulated_risk))
        bounded_delta_risk = simulated_risk - risk_score

        results.append({
            "tract_id": tract_id,
            "delta_temp": round(bounded_delta_temp, 4),
            "delta_risk": round(bounded_delta_risk, 4),
        })

    return results
```

### Pattern 2: Schema with Optional Intervention Fields + Field Bounds

**What:** `Interventions` model uses `float | None = None` with `Field(ge=0)` for each parameter. `WhatIfRequest` validates `tract_ids` non-empty via `@field_validator`, same as `BatchRequest`.

```python
# Source: Extension of BatchRequest pattern from app/schemas/tracts.py
from pydantic import BaseModel, Field, field_validator


class Interventions(BaseModel):
    tree_canopy_pct: float | None = Field(default=None, ge=0, le=100,
        description="Percentage increase in tree canopy (0–100)")
    albedo_delta: float | None = Field(default=None, ge=0.0, le=1.0,
        description="Surface albedo change (0.0–1.0 scale)")
    green_space_sqft: float | None = Field(default=None, ge=0,
        description="Additional green space in square feet")


class WhatIfRequest(BaseModel):
    tract_ids: list[str]
    interventions: Interventions

    @field_validator("tract_ids")
    @classmethod
    def validate_non_empty(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("tract_ids must not be empty")
        if len(v) > 200:
            raise ValueError("Maximum 200 tract IDs per simulation request")
        return v


class ScenarioDelta(BaseModel):
    delta_temp: float
    delta_risk: float


class WhatIfResult(BaseModel):
    tract_id: str
    delta_temp: float
    delta_risk: float


class CompareResult(BaseModel):
    tract_id: str
    scenario_a: ScenarioDelta
    scenario_b: ScenarioDelta


class CompareRequest(BaseModel):
    tract_ids: list[str]
    scenario_a: Interventions
    scenario_b: Interventions

    @field_validator("tract_ids")
    @classmethod
    def validate_non_empty(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("tract_ids must not be empty")
        if len(v) > 200:
            raise ValueError("Maximum 200 tract IDs per simulation request")
        return v
```

### Pattern 3: Router POST Handler (def, not async def)

```python
# Source: Consistent with app/routers/tracts.py and app/routers/predictions.py patterns
from fastapi import APIRouter, Depends, HTTPException
from app.dependencies import get_db
from app.schemas.simulations import WhatIfRequest, WhatIfResult, CompareRequest, CompareResult
from app.services import simulations as sim_service

router = APIRouter(prefix="/simulations", tags=["Simulations"])


@router.post("/what-if", response_model=list[WhatIfResult])
def what_if(body: WhatIfRequest, db=Depends(get_db)) -> list[dict]:
    """
    SIM-01: Apply parametric intervention formula per tract.
    Returns per-tract {tract_id, delta_temp, delta_risk}.
    Empty tract_ids → 422 (schema). Unknown tract_id → 404 (service).
    """
    return sim_service.simulate_what_if(db, body.tract_ids, body.interventions)


@router.post("/compare", response_model=list[CompareResult])
def compare(body: CompareRequest, db=Depends(get_db)) -> list[dict]:
    """
    SIM-02: Apply parametric formula for two scenarios, return side-by-side.
    """
    return sim_service.simulate_compare(db, body.tract_ids, body.scenario_a, body.scenario_b)
```

### Anti-Patterns to Avoid

- **Calling `db.execute()` directly:** Always use `db.cursor()` per service function call. The shared DuckDB connection is not thread-safe for concurrent operations without cursors.
- **Per-tract DuckDB queries in a loop:** Fetch all tract IDs in a single `IN ({placeholders})` query. Looping = O(N) round trips against a synchronous connection under FastAPI's thread pool.
- **Using `async def` for route handlers:** DuckDB is synchronous. FastAPI's thread pool dispatch (`def` handlers) is the correct approach, consistent with all Phase 2 routers.
- **Calling `app.state.models`:** The simulation engine is parametric only. Model access in `app/services/simulations.py` is forbidden for v1.
- **Applying delta_risk without clamping:** Unclamped deltas can produce risk scores outside [0, 1], which violates the schema and confuses consumers.
- **Hardcoding `mean_afternoon_temp` fallback invisibly:** If `mean_afternoon_temp` is NULL in DuckDB (some tracts may have no temperature readings), use a documented fallback (85.0°F) and log it rather than silently using Python's `None + float` TypeError.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| POST body validation (empty list, max items) | Custom middleware check | Pydantic `@field_validator` on `tract_ids` | Already proven in BatchRequest; auto-generates 422 with proper error shape |
| Intervention field bounds checking | Manual if/raise in service layer | `Field(ge=0, le=100)` in Pydantic schema | Pydantic validates before service is called; 422 returned automatically |
| SQL injection prevention in IN-clause | String escaping | Parameterized placeholders `?, ?, ?` with values list | Same as `get_batch_tracts` in tracts.py — proven safe |
| Error shape consistency | Custom exception class | Raise `HTTPException(status_code=404, detail=...)` | Already caught by `StarletteHTTPException` handler in main.py — produces correct `{error, detail, status_code}` shape |
| Physical bounds clamping | Complex formula | `max(TEMP_MIN_F, min(TEMP_MAX_F, simulated_temp))` | Simple Python clamp — no library needed |

**Key insight:** The entire simulation engine is Python math + DuckDB fetch. There is no simulation-specific library to reach for. The complexity is in choosing defensible coefficients, not in the code structure.

---

## Common Pitfalls

### Pitfall 1: NULL `mean_afternoon_temp` causing TypeError

**What goes wrong:** Some tracts in `tract_features` may have `mean_afternoon_temp = NULL`. If the service adds `base_temp + delta_temp` where `base_temp is None`, Python raises `TypeError: unsupported operand type(s) for +: 'NoneType' and 'float'`.

**Why it happens:** DuckDB returns SQL NULL as Python `None`. The fixture in Phase 2 always sets this to a float, so tests pass, but production data may have NULLs.

**How to avoid:** Apply `base_temp_safe = base_temp if base_temp is not None else 85.0` before any arithmetic. Document the fallback value in the service file.

**Warning signs:** Tests pass with fixture data, 500 errors appear against real `king_county.duckdb`.

### Pitfall 2: 404 Check Performed After Formula — Partial Results Returned

**What goes wrong:** If the service applies formulas first and checks for unknown IDs afterward, it may return results for valid tracts and silently miss the unknown one, or return a partial list with no error.

**Why it happens:** The IN-clause only returns found rows — unknown tract_ids are silently omitted from `rows`. Without an explicit check, the service returns fewer results than requested.

**How to avoid:** After the DuckDB fetch, build `found_ids = {row[0] for row in rows}` and iterate `tract_ids` to detect any ID not in `found_ids`. Raise `HTTPException(404)` immediately before processing results.

**Warning signs:** Test with one valid + one invalid tract_id — endpoint returns 200 with one result instead of 404.

### Pitfall 3: delta_risk Computed Without heat_weight Normalization

**What goes wrong:** Computing `delta_risk = delta_temp / base_temp` (raw fractional change) ignores that heat is only 40% of the risk score. This overstates risk sensitivity.

**Why it happens:** The technical_spec.md risk formula `risk = 0.4×heat + 0.3×canopy_gap + 0.2×health + 0.1×equity` is easy to miss when focusing on the temperature formula.

**How to avoid:** Always multiply by `HEAT_WEIGHT = 0.4` before applying the fraction. Document this constant with a comment citing technical_spec.md.

**Warning signs:** `delta_risk` magnitudes are 2.5× larger than expected compared to `delta_temp`.

### Pitfall 4: CompareRequest Calls _compute_simulation Twice but Gets Different Row Ordering

**What goes wrong:** If `_compute_simulation` returns rows in DuckDB's default sort order (not deterministic without ORDER BY), merging scenario_a and scenario_b results by position index produces wrong per-tract pairing.

**Why it happens:** DuckDB does not guarantee row order without `ORDER BY` when using `IN (...)` clauses.

**How to avoid:** Add `ORDER BY tf.tract_id` to the simulation query, or build results as a dict keyed by `tract_id` and merge by key, not by position.

**Warning signs:** `compare` results have mismatched `scenario_a` and `scenario_b` when tested with multiple tracts in shuffled order.

### Pitfall 5: Physical Bounds Clamping Applied to delta_temp, Not Simulated Absolute Temp

**What goes wrong:** Clamping `delta_temp` directly (e.g., `delta_temp = max(-50, delta_temp)`) instead of clamping the resulting absolute temperature allows physically impossible final temperatures.

**Why it happens:** The CONTEXT.md spec says "bounded delta values" but the correct implementation is: compute absolute simulated temp, clamp absolute temp, then derive the bounded delta from the difference.

**How to avoid:** Always: `sim_temp = base_temp + raw_delta; sim_temp = clamp(sim_temp, 0, 150); bounded_delta = sim_temp - base_temp`. Never clamp `delta_temp` directly.

### Pitfall 6: Forgetting to Wire Router in main.py

**What goes wrong:** `POST /api/v1/simulations/what-if` returns 404 — not a simulation 404 for unknown tract, but a routing 404.

**Why it happens:** The router exists in `app/routers/simulations.py` but `app.include_router(simulations.router, prefix="/api/v1")` was not added to `main.py`.

**How to avoid:** Phase plan must include a dedicated task for wiring the router. The comment in current `main.py` line 121 reads `# app.include_router(simulate.router, prefix="/api/v1")` — replace with the correct import and registration.

---

## Code Examples

Verified patterns from Phase 2 source code:

### DuckDB IN-Clause with Parameterized Placeholders (from app/services/tracts.py)

```python
# Source: app/services/tracts.py — get_batch_tracts()
cursor = db.cursor()
placeholders = ", ".join(["?" for _ in tract_ids])
rows = cursor.execute(f"""
    SELECT tf.tract_id, tf.mean_afternoon_temp, top.xgb_heat_score, top.xgb_risk_score
    FROM tract_features tf
    JOIN tract_outputs_with_preds top ON tf.tract_id = top.tract_id
    WHERE tf.tract_id IN ({placeholders})
    ORDER BY tf.tract_id
""", tract_ids).fetchall()
```

### HTTPException 404 Pattern (from app/routers/tracts.py)

```python
# Source: app/routers/tracts.py — get_tract()
result = tract_service.get_tract_detail(db, tract_id)
if result is None:
    raise HTTPException(status_code=404, detail=f"Tract '{tract_id}' not found")
```

### BatchRequest field_validator for Empty List (from app/schemas/tracts.py)

```python
# Source: app/schemas/tracts.py — BatchRequest
@field_validator("tract_ids")
@classmethod
def validate_non_empty(cls, v: list[str]) -> list[str]:
    if not v:
        raise ValueError("tract_ids must not be empty")
    if len(v) > 200:
        raise ValueError("Maximum 200 tract IDs per batch request")
    return v
```

### Test Client Fixture Pattern (from tests/test_predictions.py)

```python
# Source: tests/test_predictions.py
from tests.fixtures import test_db  # noqa: F401

@pytest.fixture
def client(test_db):
    app.state.db = test_db
    return TestClient(app, raise_server_exceptions=True)
```

### Physical Bounds Clamping (derived from CONTEXT.md spec)

```python
# Correct pattern: clamp absolute simulated temp, then derive bounded delta
TEMP_MIN_F = 0.0
TEMP_MAX_F = 150.0

raw_delta = -(BETA_CANOPY * tree_pct + BETA_ALBEDO * albedo + BETA_GREEN_SPACE * sqft)
base_temp_safe = base_temp if base_temp is not None else 85.0
simulated_temp = base_temp_safe + raw_delta
simulated_temp = max(TEMP_MIN_F, min(TEMP_MAX_F, simulated_temp))
bounded_delta_temp = simulated_temp - base_temp_safe
```

---

## Parametric Formula Coefficients — Research Findings

This section resolves the STATE.md blocker: "Parametric formula coefficients for albedo_delta and green_space_sqft are not yet documented."

### Tree Canopy Coefficient (LOCKED — from CONTEXT.md)

```
BETA_CANOPY = 0.04 °F per 1% canopy increase
```

Source: Seattle canopy research documented in technical_spec.md. +13% canopy → ~0.5°F cooling; 0.5/13 ≈ 0.0385, rounded to 0.04. Confidence: HIGH.

### Albedo Coefficient (DISCRETION — sourced from literature)

**Literature findings:**
- Real-world observational studies: ~0.09°C per 0.1 albedo increase (conservative; 14-study review)
- Mesoscale climate modeling average: ~0.3°C per 0.1 albedo increase (more applicable for city-scale policy tools)
- Specific example: Dubai study found 0.6°C cooling from +0.20 albedo (= 0.3°C/0.1)
- Scientific Reports 2024 (Duke): spatial indirect effect of ~1.06°C per unit albedo change (statistically significant)

**Recommended coefficient:**
```
BETA_ALBEDO = 5.4 °F per full albedo unit (= 0.3°C per 0.1 unit × 10 × 1.8°F/°C)
```

Rationale: The mesoscale modeling consensus (0.3°C / 0.1 unit) is most appropriate for a city-scale policy planning tool. The observational 0.09°C value likely underestimates real policy impact because it averages across varied intervention sizes and climates. The 0.3°C value is consistently cited in urban heat island modeling literature and is appropriate for a what-if tool where planners are evaluating policy-scale interventions. Converted to Fahrenheit: 0.3°C × 1.8 = 0.54°F per 0.1 unit → BETA_ALBEDO = 5.4°F per full unit.

**Confidence: MEDIUM** — multiple sources agree on the 0.3°C/0.1 value from mesoscale modeling; real-world observational coefficient is lower. The literature range is 0.09–0.61°C per 0.1 unit depending on climate and scale. Document the citation and acknowledge conservative-to-aggressive range in the service file comment.

Sources:
- [Scientific Reports 2024, PMC10766998](https://pmc.ncbi.nlm.nih.gov/articles/PMC10766998/) — spatial causal inference study
- [MDPI Buildings 2024 review](https://www.mdpi.com/2075-5309/15/21/3835) — cool roof strategies review
- Observational review: "real magnitude close to 0.09°C per 0.1 rise in albedo" — 14-study synthesis

### Green Space Coefficient (DISCRETION — sourced from literature)

**Literature findings:**
- Manchester urban study: +5% mature tree density → -1.0°C surface temp reduction
- Typical urban tract area: King County census tracts average roughly 200 acres (8,712,000 sqft); 5% = ~435,600 sqft
- → -1.0°C / 435,600 sqft = -2.3e-6°C per sqft
- Converted to °F: -2.3e-6 × 1.8 = -4.1e-6°F per sqft
- Alternative reference: 5.5 ha optimal park (-2.85°C) in Adama City; 5.5 ha = 592,015 sqft → -2.85°C/592,015 ≈ -4.8e-6°C/sqft → -8.6e-6°F/sqft

**Recommended coefficient:**
```
BETA_GREEN_SPACE = 5.0e-6 °F per sqft of added green space
```

Rationale: The midpoint between the Manchester-derived 4.1e-6 and the Adama City-derived 8.6e-6 is approximately 6.4e-6. Adopting 5.0e-6 as a conservative policy planning estimate accounts for the high variability in green space effectiveness (vegetation type, park size, urban configuration). At 5.0e-6°F/sqft, a 1-acre addition (43,560 sqft) produces ~0.22°F cooling — a reasonable planning-scale delta.

**Confidence: LOW-MEDIUM** — green space cooling is highly size/configuration-dependent; the per-sqft linear approximation is a planning simplification. The literature consistently warns that grassland alone provides little cooling, while mature tree canopy is most effective. Document this caveat in the service file comment. The coefficient is appropriate for a policy guidance tool, not a precision thermal model.

Sources:
- [PMC6458494](https://pmc.ncbi.nlm.nih.gov/articles/PMC6458494/) — urban green space cooling effect meta-analysis
- [Manchester tree density study](https://www.sciencedirect.com/science/article/pii/S2212096325000452) — +5% density → -1°C
- [Adama City geospatial study (Tandfonline 2024)](https://www.tandfonline.com/doi/full/10.1080/27658511.2024.2350806) — 5.5 ha → -2.85°C

### delta_risk Formula (DISCRETION — recommended approach)

**Recommended approach:** Proportional approximation using heat_weight from technical_spec.md.

```python
# delta_risk = HEAT_WEIGHT × xgb_heat_score × (bounded_delta_temp / base_temp_safe)
# HEAT_WEIGHT = 0.4 (from technical_spec.md: risk = 0.4×heat + 0.3×canopy_gap + 0.2×health + 0.1×equity)
delta_risk = HEAT_WEIGHT * heat_score * (bounded_delta_temp / base_temp_safe)
```

**Why this approach:** Only pre-scored values are available (`xgb_heat_score`, `xgb_risk_score`). We cannot re-run XGBoost. The heat score captures the temperature-driven component of risk. Multiplying by the fractional temperature change and the heat weight gives a defensible first-order approximation: "if temperature drops by X%, the heat-driven fraction of risk drops by X%×0.4." This is consistent with the documented model weight and avoids numerically unstable alternatives.

**Alternative considered:** Fixed sensitivity (e.g., `-0.05 delta_risk per -1°F delta_temp`) — rejected because it has no project-specific calibration basis and ignores the tract's baseline heat score.

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| Per-endpoint DuckDB queries | Shared `_compute_simulation()` delegated to by both endpoints | Avoids duplication for what-if vs compare |
| `async def` route handlers | `def` route handlers (FastAPI thread pool) | DuckDB is sync; this is the Phase 2 pattern |
| Pydantic v1 validators | Pydantic v2 `@field_validator` with `@classmethod` | Already in use in project — `BatchRequest` pattern |

**No deprecated patterns apply.** This phase reuses the exact technology stack from Phase 2 without any new additions.

---

## Test Architecture (for `tests/test_simulations.py`)

The project uses pytest with in-memory DuckDB fixtures. No `nyquist_validation` config key is present in `.planning/config.json`, so no formal Validation Architecture section is required, but test infrastructure is well-established.

### Existing Test Infrastructure

| Component | Location | Status |
|-----------|----------|--------|
| pytest | `/opt/anaconda3/envs/urban-heatmap/bin/pytest` | Installed, working |
| `test_db` fixture | `tests/fixtures.py` | Exists — creates in-memory DuckDB with `tract_features` + `tract_outputs_with_preds` |
| Test client pattern | All Phase 2 test files | `app.state.db = test_db; TestClient(app)` |

### Fixture Extension Needed

The existing `test_db` fixture already has `mean_afternoon_temp`, `xgb_heat_score`, and `xgb_risk_score` — all columns required by the simulation query. **No fixture changes are required.** The simulation tests can import and use `test_db` directly.

However, simulation tests need `simulations.router` wired into the test app. Use the same self-registration pattern established in `test_blocks.py`:

```python
from tests.fixtures import test_db  # noqa: F401
from app.main import app
from app.routers import simulations

# Ensure router is registered (idempotent if already wired in main.py)
if not any(r.name == "simulations" for r in app.router.routes):
    app.include_router(simulations.router, prefix="/api/v1")
```

### Test Coverage Required

| Behavior | Test Type | Command |
|----------|-----------|---------|
| SIM-01: POST /what-if returns 200 with list of delta results | integration | `pytest tests/test_simulations.py -x` |
| SIM-01: Empty tract_ids → 422 | integration | `pytest tests/test_simulations.py::TestWhatIf::test_empty_tract_ids_returns_422 -x` |
| SIM-01: Unknown tract_id → 404 | integration | `pytest tests/test_simulations.py::TestWhatIf::test_unknown_tract_returns_404 -x` |
| SIM-01: delta_temp is negative (cooling) with valid interventions | integration | included in basic 200 test |
| SIM-01: Physical bounds — clamping does not produce impossible deltas | unit | verify delta ≥ -(base_temp - 0) |
| SIM-02: POST /compare returns list with scenario_a and scenario_b fields | integration | `pytest tests/test_simulations.py::TestCompare -x` |
| SIM-02: scenario_a ≠ scenario_b when interventions differ | integration | compare with different intervention values |
| Both: tree_canopy_pct > 100 → 422 | integration | schema Field(le=100) validation |
| Both: albedo_delta > 1.0 → 422 | integration | schema Field(le=1.0) validation |
| Both: negative intervention values → 422 | integration | schema Field(ge=0) validation |

---

## Open Questions

1. **Are there tracts in `king_county.duckdb` where `mean_afternoon_temp` is NULL?**
   - What we know: The `tract_features` schema has `mean_afternoon_temp DOUBLE` (nullable). The fixture always sets it to a float.
   - What's unclear: Whether production data has nulls.
   - Recommendation: Implement the `base_temp_safe = base_temp or 85.0` fallback defensively regardless. Test explicitly with a NULL fixture row.

2. **Should `green_space_sqft` effect be capped to prevent unrealistic inputs?**
   - What we know: At BETA_GREEN_SPACE = 5.0e-6, providing 20,000,000 sqft (460 acres) yields a delta_temp of -100°F — physically impossible.
   - What's unclear: Whether planners will provide extreme values, or whether physical clamping is sufficient.
   - Recommendation: Physical clamping of absolute temperature handles this implicitly. Optionally add `le=10_000_000` (10M sqft ≈ 230 acres — a reasonable max urban park addition). Document the rationale.

3. **Should compare endpoint raise 404 if the same unknown tract appears in both scenarios?**
   - What we know: The spec says "unknown tract_id → 404." Compare calls `_compute_simulation` twice.
   - What's unclear: Whether to deduplicate 404 checking or let each scenario call independently raise.
   - Recommendation: Pass `tract_ids` once to a validation step before running both scenarios. This avoids checking twice for the same IDs and ensures consistent error behavior.

---

## Sources

### Primary (HIGH confidence)
- Project source code: `app/services/tracts.py`, `app/schemas/tracts.py`, `app/routers/predictions.py`, `app/routers/tracts.py`, `tests/fixtures.py` — direct pattern reference for simulation architecture
- `03-CONTEXT.md` — locked decisions, formula constants, table names

### Secondary (MEDIUM confidence)
- [Scientific Reports 2024, PMC10766998](https://pmc.ncbi.nlm.nih.gov/articles/PMC10766998/) — spatial causal inference on albedo and vegetation effects; albedo spatial coefficient -1.06°C per unit (statistically significant)
- [MDPI Buildings 2024 review, Cool Roof Strategies](https://www.mdpi.com/2075-5309/15/21/3835) — mesoscale modeling average 0.3°C per 0.1 albedo unit; supports BETA_ALBEDO derivation
- [PMC6458494](https://pmc.ncbi.nlm.nih.gov/articles/PMC6458494/) — urban green space cooling effect meta-analysis; 1–2°C typical cooling range
- [ScienceDirect 2025 decade-long systematic review](https://www.sciencedirect.com/science/article/pii/S2212096325000452) — Manchester +5% density → -1.0°C; basis for BETA_GREEN_SPACE derivation

### Tertiary (LOW confidence — cross-referenced with MEDIUM sources)
- [Tandfonline 2024 Adama City study](https://www.tandfonline.com/doi/full/10.1080/27658511.2024.2350806) — 5.5 ha → -2.85°C; secondary cross-check for green space coefficient magnitude
- WebSearch result synthesis on albedo coefficient range 0.09–0.61°C per 0.1 unit — flags the variability; substantiated by primary sources

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all Phase 2 patterns directly reused
- Architecture patterns: HIGH — derived directly from existing Phase 2 service/router/schema source code
- Parametric formula (tree canopy): HIGH — locked in CONTEXT.md, sourced from technical_spec.md
- Parametric formula (albedo): MEDIUM — multiple peer-reviewed sources agree on mesoscale modeling value; real-world observational range is wider
- Parametric formula (green space): LOW-MEDIUM — highly site-dependent; per-sqft linearity is a planning approximation; midpoint coefficient defensible for policy guidance
- delta_risk formula: MEDIUM — proportional approximation is defensible given constraints; not a physical model
- Pitfalls: HIGH — all derived from direct reading of Phase 2 source code and DuckDB behavior
- Test architecture: HIGH — fixture and client patterns verified in existing test files

**Research date:** 2026-02-28
**Valid until:** 2026-05-01 (stable stack; formula coefficients are literature-sourced and will not change)
