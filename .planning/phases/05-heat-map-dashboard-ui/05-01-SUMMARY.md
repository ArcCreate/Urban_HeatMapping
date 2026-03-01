---
phase: 05-heat-map-dashboard-ui
plan: "01"
subsystem: ui
tags: [react, vite, tailwindcss, zustand, maplibre, typescript, lucide-react]

# Dependency graph
requires: []
provides:
  - Vite + React + TypeScript project scaffolded at urban-heat-ui/
  - Tailwind v4 CSS-first setup with custom design tokens (@theme block)
  - All FastAPI backend types mirrored in src/types/api.ts
  - Zustand v5 mapStore and chatStore with typed state and actions
  - API client functions (tracts, predictions, chat, simulations) with /api/v1/ relative paths
  - Three-panel dark layout shell with AppHeader (UrbanHeatAI logo, nav tabs, user profile)
  - Vite proxy: /api -> localhost:8000
affects:
  - 05-02-PLAN (HeatMap component imports from mapStore, API clients)
  - 05-03-PLAN (LeftSidebar + ChatPanel import from mapStore, chatStore, API clients)
  - 05-04-PLAN (polish imports all established tokens and components)

# Tech tracking
tech-stack:
  added:
    - vite 7.3.1 (react-ts template)
    - react 18 + react-dom
    - "@vitejs/plugin-react"
    - tailwindcss v4 + @tailwindcss/vite (CSS-first, no tailwind.config.js)
    - zustand v5 (create() with Zustand v5 API)
    - zustand/shallow (useShallow re-exported from mapStore)
    - react-map-gl + maplibre-gl
    - lucide-react
    - motion (Framer Motion)
    - clsx + tailwind-merge
    - "@types/geojson"
  patterns:
    - Tailwind v4 CSS-first: @import "tailwindcss" + @theme {} block in index.css (no tailwind.config.js)
    - Zustand v5 create() with inline state + actions in single object
    - All API clients use relative /api/v1/ paths (Vite proxy routes to localhost:8000)
    - Dark mode via class="dark" on <html> element (always-on, no toggle)
    - useShallow re-exported from mapStore for downstream multi-field selectors

key-files:
  created:
    - urban-heat-ui/vite.config.ts
    - urban-heat-ui/src/index.css
    - urban-heat-ui/index.html
    - urban-heat-ui/src/main.tsx
    - urban-heat-ui/src/types/api.ts
    - urban-heat-ui/src/types/map.ts
    - urban-heat-ui/src/store/mapStore.ts
    - urban-heat-ui/src/store/chatStore.ts
    - urban-heat-ui/src/api/tracts.ts
    - urban-heat-ui/src/api/predictions.ts
    - urban-heat-ui/src/api/chat.ts
    - urban-heat-ui/src/api/simulations.ts
    - urban-heat-ui/src/components/layout/AppHeader.tsx
    - urban-heat-ui/src/App.tsx
  modified: []

key-decisions:
  - "Tailwind v4 CSS-first: @import tailwindcss + @theme block instead of tailwind.config.js — required by v4, breaks PostCSS-style config"
  - "maplibre-gl CSS imported in main.tsx before app CSS — ensures map styles load correctly"
  - "useShallow re-exported from mapStore — consumers import from one place, avoids direct zustand/shallow imports scattered across codebase"
  - "class=dark always on html element — dark-mode-always pattern per locked design decision in CONTEXT.md"

patterns-established:
  - "API clients: all use relative /api/v1/ paths — Vite proxy in dev, same origin in prod"
  - "Zustand stores: create<State>()((set) => ({...})) pattern with state + actions in single object"
  - "Three-panel layout: 280px left / flex-1 center / 340px right with shrink-0 on sidebars and overflow-hidden on wrapper"

requirements-completed:
  - REQ-5.5

# Metrics
duration: 2min
completed: 2026-03-01
---

# Phase 5 Plan 01: Scaffold Foundation Summary

**Vite + React + TypeScript frontend scaffolded with Tailwind v4 CSS-first config, Zustand v5 stores, typed FastAPI-mirroring API clients, and three-panel dark layout shell at urban-heat-ui/**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-01T04:06:40Z
- **Completed:** 2026-03-01T04:09:27Z
- **Tasks:** 2
- **Files modified:** 14 created, 0 modified (all new)

## Accomplishments

- Vite project scaffolded with all required dependencies: react-map-gl, maplibre-gl, tailwindcss @tailwindcss/vite, zustand, motion, lucide-react, clsx, tailwind-merge, @types/geojson
- TypeScript types in src/types/api.ts mirror all FastAPI Pydantic schemas exactly (field names match backend)
- Zustand v5 mapStore and chatStore with useShallow re-export pattern for downstream consumers
- All 4 API client files (tracts, predictions, chat, simulations) use relative /api/v1/ paths with Vite proxy
- Three-panel dark shell (280px/flex-1/340px) with AppHeader showing UrbanHeatAI logo (DM Sans, cyan accent), nav tabs, bell, user profile
- npm run build exits 0 with no TypeScript errors on both tasks

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold Vite project with Tailwind v4, MapLibre stack, Zustand, Framer Motion** - `ada6b93` (feat)
2. **Task 2: Types, Zustand stores, API clients, App shell layout, AppHeader** - `4d28efa` (feat)

## Files Created/Modified

- `urban-heat-ui/vite.config.ts` - @tailwindcss/vite plugin + /api proxy to localhost:8000
- `urban-heat-ui/index.html` - class="dark" on html, Google Fonts preconnect + link tags
- `urban-heat-ui/src/index.css` - @import "tailwindcss" + @theme block with all custom tokens
- `urban-heat-ui/src/main.tsx` - maplibre-gl CSS import, React 18 StrictMode mount
- `urban-heat-ui/src/types/api.ts` - TractProperties, TractDetail, RankedTract, CountySummary, ChatRequest, ChatResponse, MapContext, WhatIfRequest, SimulationResult, TractsGeoJSON
- `urban-heat-ui/src/types/map.ts` - PopupInfo, ViewState
- `urban-heat-ui/src/store/mapStore.ts` - Zustand v5 map state + useShallow re-export
- `urban-heat-ui/src/store/chatStore.ts` - Zustand v5 chat state with welcome message
- `urban-heat-ui/src/api/tracts.ts` - fetchTractsGeoJSON, fetchTractDetail
- `urban-heat-ui/src/api/predictions.ts` - fetchRankedTracts, fetchCountySummary
- `urban-heat-ui/src/api/chat.ts` - postChat
- `urban-heat-ui/src/api/simulations.ts` - postWhatIf
- `urban-heat-ui/src/components/layout/AppHeader.tsx` - logo, nav tabs, bell, user profile
- `urban-heat-ui/src/App.tsx` - three-panel layout shell with placeholder sidebars and map area

## Decisions Made

- Tailwind v4 uses CSS-first configuration — no tailwind.config.js, all tokens in @theme block in index.css
- maplibre-gl CSS imported before app CSS in main.tsx to ensure map layers render correctly
- useShallow re-exported from mapStore so downstream components import from one consistent location
- class="dark" always set on html element (dark mode always-on per CONTEXT.md locked decision)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — build passed on both tasks without errors.

## User Setup Required

None — no external service configuration required. Vite dev server starts with `npm run dev` inside urban-heat-ui/.

## Next Phase Readiness

- All types, stores, and API clients are ready for Plan 02 (HeatMap) and Plan 03 (Sidebar + Chat)
- Vite proxy configured — backend at localhost:8000 required for actual data; placeholder UI works without backend
- No tailwind.config.js present (Tailwind v4 CSS-first confirmed)
- TypeScript strict mode compiles cleanly

---
*Phase: 05-heat-map-dashboard-ui*
*Completed: 2026-03-01*
