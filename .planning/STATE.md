# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-28)

**Core value:** City planners can explore where heat risk is highest across King County tracts, simulate the impact of interventions, and get AI-assisted reasoning — all through a fast, queryable JSON API.
**Current focus:** Phase 1 — Foundation

## Current Position

Phase: 1 of 4 (Foundation)
Plan: 1 of 2 in current phase
Status: In progress
Last activity: 2026-02-28 — Completed 01-01: foundation scaffold (requirements.txt, config, model loader, DI helpers)

Progress: [█░░░░░░░░░] 10%

## Performance Metrics

**Velocity:**
- Total plans completed: 1
- Average duration: 6 min
- Total execution time: 0.1 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 1 | 6 min | 6 min |

**Recent Trend:**
- Last 5 plans: 01-01 (6 min)
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Pre-scored predictions served from DuckDB — no live baseline inference in v1
- Parametric formulas for what-if (no model re-inference) — formulas sufficient for policy guidance
- Single read-only DuckDB connection opened at lifespan startup, shared via dependency injection
- Python 3.12 required — TensorFlow 2.20.0 segfaults on Python 3.13.5 arm64; all dev and CI must use conda env with python=3.12
- TF imported before XGBoost in app/models/loader.py — prevents macOS arm64 OpenMP conflict
- anthropic_api_key has no default in Settings — raises ValidationError at startup if missing (fail fast)

### Pending Todos

None.

### Blockers/Concerns

- **CRITICAL for Plan 02:** Python 3.12 env required (`/opt/anaconda3/envs/urban-heatmap/bin/python`). System Python 3.13 will segfault on `import tensorflow`.
- Phase 3 (Simulation): Parametric formula coefficients (delta-T per % tree canopy, per albedo delta, per sqft green space) are not yet documented. Must be sourced before Phase 3 planning begins.
- Phase 2 (Geometry): `king_county.duckdb` geometry CRS and actual table/column names must be verified against the real file before writing DuckDB queries.
- Phase 4 (Chat): Claude model selection (Opus vs Sonnet) and context token budget strategy need confirmation before chat endpoint is finalized.

## Session Continuity

Last session: 2026-02-28
Stopped at: Completed 01-01-PLAN.md — foundation scaffold (requirements.txt, config, model loader, DI helpers); Python 3.12 env created at /opt/anaconda3/envs/urban-heatmap/
Resume file: None
