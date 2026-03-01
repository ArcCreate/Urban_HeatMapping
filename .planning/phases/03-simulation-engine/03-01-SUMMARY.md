---
phase: 03-simulation-engine
plan: 01
subsystem: api
tags: [pydantic, duckdb, simulation, parametric-formulas, fastapi]

# Dependency graph
requires:
  - phase: 02-data-endpoints
    provides: tract_features + tract_outputs_with_preds DuckDB tables with xgb_heat_score, xgb_risk_score, mean_afternoon_temp columns

provides:
  - app/schemas/simulations.py — Interventions, WhatIfRequest, CompareRequest, WhatIfResult, CompareResult, ScenarioDelta Pydantic types
  - app/services/simulations.py — simulate_what_if and simulate_compare service functions with parametric formula engine

affects: [03-simulation-engine-02, 04-chat-interface]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Parametric formula engine: BETA_CANOPY/BETA_ALBEDO/BETA_GREEN_SPACE constants with literature citation comments"
    - "Physical bounds clamping: simulated_temp clamped to [0,150]F, simulated_risk to [0,1] before computing delta"
    - "Key-based compare merge: _compute_simulation called twice, results merged by tract_id key (not position)"
    - "404 before formula: unknown tract IDs caught after fetchall, before any formula application"

key-files:
  created:
    - app/schemas/simulations.py
    - app/services/simulations.py
  modified: []

key-decisions:
  - "delta_risk approximation: HEAT_WEIGHT * xgb_heat_score * (bounded_delta_temp / base_temp_safe) — proportional to heat's share of risk and temperature change fraction"
  - "simulate_compare calls _compute_simulation twice independently — 404 propagates from scenario_a call, no need for separate pre-validation pass"
  - "TEMP_NULL_FALLBACK_F = 85.0 — used when mean_afternoon_temp is NULL in DuckDB; prevents division-by-zero in risk formula"

patterns-established:
  - "Simulation schema pattern: field_validator on tract_ids mirrors BatchRequest (empty list and > 200 items both trigger 422)"
  - "Service constants with citation comments: each BETA_* constant has source, derivation math, and literature range noted inline"

requirements-completed: [SIM-01, SIM-02]

# Metrics
duration: 2min
completed: 2026-03-01
---

# Phase 3 Plan 1: Simulation Engine Schemas and Service Summary

**Pydantic contract layer and parametric formula engine for urban heat simulation — six schema types, _compute_simulation helper, and two public service functions using BETA_CANOPY/BETA_ALBEDO/BETA_GREEN_SPACE coefficients with physical bounds clamping**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-01T00:15:13Z
- **Completed:** 2026-03-01T00:16:52Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Six Pydantic v2 types with field bounds, validators, and proper docstrings — Interventions, ScenarioDelta, WhatIfResult, CompareResult, WhatIfRequest, CompareRequest
- Parametric simulation service with literature-cited BETA constants, NULL fallback handling, and physical bounds clamping on both temperature and risk
- _compute_simulation private helper centralizes DuckDB fetch + formula math — both public functions consume it cleanly
- simulate_compare merges two independent scenario results by tract_id key, not position — safe against any ordering differences

## Task Commits

Each task was committed atomically:

1. **Task 1: Pydantic schemas for simulation request/response contracts** - `cda242f` (feat)
2. **Task 2: Parametric formula service with shared _compute_simulation** - `e867444` (feat)

## Files Created/Modified

- `app/schemas/simulations.py` — Six Pydantic types: Interventions (bounds-validated), WhatIfRequest/CompareRequest (tract_ids validator), WhatIfResult/CompareResult/ScenarioDelta (response shapes)
- `app/services/simulations.py` — _compute_simulation (DuckDB IN-clause + formula engine), simulate_what_if, simulate_compare; module constants with citation comments

## Decisions Made

- `delta_risk` uses `HEAT_WEIGHT * xgb_heat_score * (bounded_delta_temp / base_temp_safe)` — proportional approximation tying risk change to heat's share of the composite risk score scaled by temperature change fraction
- `simulate_compare` calls `_compute_simulation` twice independently — no pre-validation pass needed; 404 from scenario_a automatically prevents scenario_b from running on bad IDs
- `TEMP_NULL_FALLBACK_F = 85.0` — prevents division-by-zero in the risk delta formula when `mean_afternoon_temp` is NULL in DuckDB
- Coefficients derived from peer-reviewed sources (Seattle canopy research, Scientific Reports 2024 PMC10766998, Manchester/Adama City urban studies) with derivation math inline

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- app/schemas/simulations.py and app/services/simulations.py are complete and verified
- Ready for Plan 03-02: simulation router wiring (POST /what-if and POST /compare endpoints in app/routers/simulate.py + include_router in app/main.py)
- No blockers

## Self-Check: PASSED

- FOUND: app/schemas/simulations.py
- FOUND: app/services/simulations.py
- FOUND: .planning/phases/03-simulation-engine/03-01-SUMMARY.md
- FOUND: cda242f (Task 1 schemas commit)
- FOUND: e867444 (Task 2 service commit)

---
*Phase: 03-simulation-engine*
*Completed: 2026-03-01*
