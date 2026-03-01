# Roadmap: Urban Heat Mapping — King County Backend API

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-03-01)
- 🔄 **v1.1** — Phase 5 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-4) — SHIPPED 2026-03-01</summary>

- [x] Phase 1: Foundation (2/2 plans) — completed 2026-02-28
- [x] Phase 2: Data Endpoints (5/5 plans) — completed 2026-02-28
- [x] Phase 3: Simulation Engine (2/2 plans) — completed 2026-03-01
- [x] Phase 4: Chat Endpoint (1/1 plan) — completed 2026-03-01

Full archive: `.planning/milestones/v1.0-ROADMAP.md`

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 2/2 | Complete | 2026-02-28 |
| 2. Data Endpoints | v1.0 | 5/5 | Complete | 2026-02-28 |
| 3. Simulation Engine | v1.0 | 2/2 | Complete | 2026-03-01 |
| 4. Chat Endpoint | v1.0 | 1/1 | Complete | 2026-03-01 |
| 5. Heat Map Dashboard UI | 4/4 | Complete   | 2026-03-01 | — |
| 6. Composite Risk Score & Climate Projections | 1/4 | In Progress|  |

### Phase 5: Heat Map Dashboard UI

**Goal:** Build a React frontend with an interactive King County heat-risk heatmap, clickable tract selection with construction-suitability stats, an AI chat panel (right), and a location focus/search panel (left) — enabling city planners to visually identify best/worst construction sites by heat risk.
**Requirements**: REQ-5.1, REQ-5.2, REQ-5.3, REQ-5.4, REQ-5.5
**Depends on:** Phase 4
**Plans:** 4/4 plans complete

Plans:
- [ ] 05-01-PLAN.md — Vite scaffold, Tailwind v4 CSS config, types, Zustand stores, API clients, three-panel layout shell + AppHeader
- [ ] 05-02-PLAN.md — MapLibre choropleth heat map, feature-state hover, tract click popup, county border glow
- [ ] 05-03-PLAN.md — Left location sidebar with ranked tract cards + fly-to, right AI chat panel wired to POST /chat
- [ ] 05-04-PLAN.md — Framer Motion animations, glassmorphism floating map cards, timeline slider, dashboard polish

### Phase 6: Composite Risk Score & Climate Projections

**Goal:** Replace the placeholder CSV-derived scores in DuckDB with a transparent, formula-based composite risk score column computed from the full HeatHealthKC.csv dataset (afternoon temp, tree cover, imperviousness, health burdens, social vulnerability, population density, distance to water, heat mapping coverage, HRA data, life expectancy, climate-change-disadvantaged flags, clean energy disadvantaged, and housing burden) — and train a TensorFlow model to produce tract-level heat risk projections for years 2025–2050, wired to the existing frontend timeline slider so the heatmap updates dynamically as the user scrubs through time.
**Requirements**: REQ-6.1, REQ-6.2, REQ-6.3, REQ-6.4, REQ-6.5
**Depends on:** Phase 5
**Plans:** 1/4 plans executed

Sub-goals:
1. **Composite score (DuckDB)** — New `composite_risk` column in `tract_outputs_with_preds` computed as a documented weighted formula across all relevant data columns; weights are explicit, justified, and tunable; no ML involved.
2. **Projection model (TensorFlow)** — Train a TF model on composite_risk + climate-sensitive features to produce a `tract_projections` table with one row per (tract_id, year) for 2025–2050, representing predicted composite_risk under a warming scenario.
3. **Backend API** — New `GET /api/v1/projections/{year}` endpoint returning per-tract projected risk as GeoJSON-ready scores; `GET /api/v1/projections/range` returning the full 2025–2050 series for a tract.
4. **Frontend timeline** — Timeline slider wired to projection API: scrubbing to any year fetches that year's scores, recomputes display_risk per tract, updates GeoJSON in store, heatmap re-colors live.

Plans:
- [ ] 06-01-PLAN.md — Composite score pipeline: score_composite.py + expose composite_risk via predictions API
- [ ] 06-02-PLAN.md — TF projection model training and precomputation of tract_projections table
- [ ] 06-03-PLAN.md — Backend projections API (GET /projections/{year} and /projections/range)
- [ ] 06-04-PLAN.md — Frontend timeline wiring: store, API client, TimelineSlider, TractPopup
