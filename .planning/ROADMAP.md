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
| 5. Heat Map Dashboard UI | 2/4 | In Progress|  | — |

### Phase 5: Heat Map Dashboard UI

**Goal:** Build a React frontend with an interactive King County heat-risk heatmap, clickable tract selection with construction-suitability stats, an AI chat panel (right), and a location focus/search panel (left) — enabling city planners to visually identify best/worst construction sites by heat risk.
**Requirements**: REQ-5.1, REQ-5.2, REQ-5.3, REQ-5.4, REQ-5.5
**Depends on:** Phase 4
**Plans:** 2/4 plans executed

Plans:
- [ ] 05-01-PLAN.md — Vite scaffold, Tailwind v4 CSS config, types, Zustand stores, API clients, three-panel layout shell + AppHeader
- [ ] 05-02-PLAN.md — MapLibre choropleth heat map, feature-state hover, tract click popup, county border glow
- [ ] 05-03-PLAN.md — Left location sidebar with ranked tract cards + fly-to, right AI chat panel wired to POST /chat
- [ ] 05-04-PLAN.md — Framer Motion animations, glassmorphism floating map cards, timeline slider, dashboard polish
