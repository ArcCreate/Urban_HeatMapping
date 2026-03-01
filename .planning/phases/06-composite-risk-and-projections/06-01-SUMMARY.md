---
phase: 06-composite-risk-and-projections
plan: "01"
subsystem: api
tags: [duckdb, python, predictions, composite-risk, scoring, numpy, pandas]

# Dependency graph
requires:
  - phase: 02-data-endpoints
    provides: tract_outputs_with_preds table with xgb_heat_score, xgb_risk_score, tf_risk_score; predictions schemas and service layer
  - phase: 05-heat-map-dashboard-ui
    provides: frontend using prediction scores for choropleth coloring

provides:
  - composite_risk DOUBLE column in tract_outputs_with_preds for all 492 tracts, values in [0, 1]
  - scripts/score_composite.py — offline pipeline with documented domain weights (thermal 0.30, vegetation 0.25, health 0.25, social 0.20)
  - WEIGHTS dict constant and minmax() function exported from script
  - SortColumn.composite_risk enum value enabling sort_by=composite_risk API parameter
  - composite_risk field in TractPrediction and RankedTract schemas
  - Updated get_all_predictions() and get_ranked_predictions() returning composite_risk

affects:
  - 06-02-PLAN (climate projections — will read composite_risk as baseline)
  - 06-03-PLAN (backend API — composite_risk now queryable via predictions endpoints)
  - 06-04-PLAN (frontend timeline — composite_risk as the risk metric to display)

# Tech tracking
tech-stack:
  added: [numpy, pandas (used in offline script only — already in pipeline requirements)]
  patterns:
    - Formula-based composite scoring with minmax normalization per domain
    - NaN-safe numpy operations via np.nanmin/nanmax/nanmean
    - Idempotent DuckDB migration via try/except on ALTER TABLE
    - Offline script opens DuckDB without read_only; API opens with read_only=True

key-files:
  created:
    - scripts/score_composite.py
  modified:
    - app/schemas/predictions.py
    - app/services/predictions.py

key-decisions:
  - "composite_risk formula: 4 domains — thermal 0.30, vegetation 0.25 (imperv+tree_cov equal split), health 0.25 (CVD+diabetes+life_expectancy mean), social 0.20 (SVI+poverty+disability+under18+housing_cost mean). Weights documented with literature citations in script docstring."
  - "minmax() uses 1e-9 epsilon denominator to prevent division-by-zero when all values in a column are identical"
  - "Vegetation domain: BOTH imperv and tree_cov are inverted (1.0 - minmax) — high imperv and high tree_cov both indicate opposite risk directions; equal 0.5 split within domain"
  - "Health domain: life_expectancy inverted so higher score = higher risk; CVD rate and diabetes rate not inverted (already: higher = worse)"
  - "Idempotent ALTER TABLE: try/except pattern (not IF NOT EXISTS) for broader DuckDB version compatibility"
  - "Row with 0 zeros in verification — all 492 tract_id values matched between tract_features and tract_outputs_with_preds"

patterns-established:
  - "Offline scoring scripts: open DuckDB without read_only flag; never import app.config.settings"
  - "Column extension pattern: scripts/score_composite.py -> ALTER TABLE + executemany UPDATE -> verify via SELECT COUNT/MIN/MAX"
  - "Enum-guarded SQL interpolation: sort_by.value safe because FastAPI validates against SortColumn enum allowlist before service layer sees it"

requirements-completed: [REQ-6.1]

# Metrics
duration: 2min
completed: "2026-03-01"
---

# Phase 06 Plan 01: Composite Risk Scoring Pipeline Summary

**Formula-based composite_risk score (thermal 0.30 / vegetation 0.25 / health 0.25 / social 0.20) computed for all 492 King County tracts and persisted to DuckDB, exposed via updated predictions API.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-01T07:04:18Z
- **Completed:** 2026-03-01T07:06:16Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `scripts/score_composite.py` with documented 4-domain weighted formula, minmax normalization, and idempotent DuckDB writes
- Scored all 492 tracts: composite_risk min=0.2375, max=0.7546, mean=0.4711 — all within [0, 1], zero null rows
- Updated `SortColumn` enum with `composite_risk`, `TractPrediction` schema, and `RankedTract` schema
- Updated both prediction service queries to SELECT and return composite_risk
- `GET /api/v1/predictions/tracts/ranked?sort_by=composite_risk` now returns 200 instead of 422

## Task Commits

Each task was committed atomically:

1. **Task 1: Create scripts/score_composite.py** - `1d06de6` (feat)
2. **Task 2: Update predictions schemas and service to expose composite_risk** - `36c2815` (feat)

## Files Created/Modified

- `scripts/score_composite.py` — Offline pipeline: reads tract_features, computes composite risk via 4 domains, writes composite_risk column to tract_outputs_with_preds; WEIGHTS dict and minmax() exported
- `app/schemas/predictions.py` — Added composite_risk to SortColumn enum, TractPrediction, and RankedTract
- `app/services/predictions.py` — Both query functions updated: SELECT includes composite_risk, row index mapping updated accordingly

## Decisions Made

- **4-domain formula weights** (thermal 0.30, vegetation 0.25, health 0.25, social 0.20): Documented with literature citations (PMC8531084, PNAS 2019, CDC SVI methodology) in script docstring — makes weight rationale auditable without external docs
- **minmax() with 1e-9 epsilon**: Prevents silent NaN propagation when all values in a feature are identical (degenerate column edge case)
- **Vegetation domain equal 0.5/0.5 split**: imperv and tree_cov are symmetric opposite risk signals; no evidence from literature to weight one more than the other within the domain
- **life_expectancy inverted, CVD/diabetes not**: life_expectancy is coded such that higher = better health; other two are rates where higher = worse — direction correction applied per column semantics
- **try/except for ALTER TABLE**: Preferred over `IF NOT EXISTS` for broader DuckDB version compatibility (IF NOT EXISTS support varies across patch versions)

## Deviations from Plan

None — plan executed exactly as written. The DuckDB lock conflict (PID 83940 from a background multiprocessing spawn) was a transient environment issue resolved by killing the orphaned process; the script code required no modification.

## Issues Encountered

- DuckDB file locked by orphaned background Python process (PID 83940, multiprocessing spawn from previous session). Resolved by killing the process; script ran cleanly on second attempt. Script code was correct as written.

## User Setup Required

None — no external service configuration required. Script uses the existing `king_county.duckdb` file.

## Next Phase Readiness

- `composite_risk` column is populated in `tract_outputs_with_preds` — Plans 02, 03, and 04 can query it immediately
- `SortColumn.composite_risk` enum in place — Plan 03 API extensions inherit it automatically
- Plan 02 (climate projections via TF) can build on this composite_risk baseline
- No blockers

---
*Phase: 06-composite-risk-and-projections*
*Completed: 2026-03-01*

## Self-Check: PASSED

- FOUND: scripts/score_composite.py
- FOUND: app/schemas/predictions.py
- FOUND: app/services/predictions.py
- FOUND: .planning/phases/06-composite-risk-and-projections/06-01-SUMMARY.md
- FOUND commit 1d06de6: feat(06-01): create composite risk scoring pipeline script
- FOUND commit 36c2815: feat(06-01): expose composite_risk in predictions schemas and service
