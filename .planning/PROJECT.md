# Urban Heat Mapping — King County Backend API

## What This Is

A FastAPI backend that powers a policy tool for King County city planners. It serves census tract and block-level urban heat and risk data from a DuckDB database, exposes pre-scored XGBoost and TensorFlow model predictions, runs parametric what-if simulations for cooling interventions (tree canopy, cool surfaces, green space), and provides a Claude-powered chat assistant that has full awareness of the current map context.

This is the backend only — the React frontend is a separate phase built on top of this API.

## Core Value

City planners can explore where heat risk is highest across King County tracts, simulate the impact of interventions, and get AI-assisted reasoning — all through a fast, queryable JSON API.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] API serves census tract and block geometries and features from DuckDB
- [ ] API serves pre-scored heat and risk model predictions per tract
- [ ] API runs parametric what-if calculations (tree canopy ΔT, cool surfaces/albedo, green space) without live model inference
- [ ] FastAPI app loads XGBoost and TensorFlow models into memory on startup (ready for future live inference)
- [ ] Chat endpoint sends map context + user message to Claude and returns response
- [ ] All endpoints return clean JSON (GeoJSON for geometries, typed JSON for predictions/chat)

### Out of Scope

- Live model inference for baseline predictions — pre-scored values in DuckDB are served directly
- Budget allocation optimizer — deferred, not in v1
- Public API exposure / external docs — internal use by React frontend only in v1
- React frontend — separate phase

## Context

- **Data source**: `king_county.duckdb` — a local DuckDB file containing census tract and block geometries (WKT/GeoJSON), `tract_features` (derived ML input features per tract), and `tract_outputs_with_preds` (pre-scored XGBoost heat score, XGBoost risk score, TensorFlow risk score).
- **Models in memory**: XGBoost heat model, XGBoost risk model, TensorFlow risk model — loaded at startup. In v1 they're not used for live inference (predictions are pre-scored), but loaded and ready for what-if live inference in future phases.
- **What-if engine**: Rule-based parametric formulas applied to tract features. No model re-inference. Supported interventions: tree canopy increase (ΔT), cool surfaces/albedo change, green space addition.
- **Chat**: Claude (Anthropic API) receives map state as context (selected tracts, current predictions, scenario params) and answers planner questions.
- **Offline pipeline**: Separate Python scripts/notebooks handle model training, feature engineering, and regenerating DuckDB tables. This is out of scope for the API phase.

## Constraints

- **Tech Stack**: Python + FastAPI, DuckDB Python client, XGBoost, TensorFlow/Keras — no deviations
- **Data**: Single local DuckDB file — no external database, no migrations
- **LLM**: Anthropic Claude via `anthropic` SDK — provider is fixed for v1
- **Consumers**: Only the React frontend in v1 — no auth, no rate limiting required yet
- **Geometry**: GeoJSON or WKT output from DuckDB for tract/block geometries

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Pre-scored predictions, no live baseline inference | Models already scored; querying DB is faster and simpler | — Pending |
| Parametric formulas for what-if (not live model calls) | Avoids model re-inference complexity in v1; formulas sufficient for policy guidance | — Pending |
| Claude as LLM for chat | Anthropic API; map context injected as system prompt | — Pending |
| FastAPI over Flask | Typed, async, auto OpenAPI docs built-in | — Pending |
| DuckDB as query layer | In-process, fast analytical queries, already has the data | — Pending |

---
*Last updated: 2026-02-28 after initialization*
