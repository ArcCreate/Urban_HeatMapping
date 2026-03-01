---
phase: 05-heat-map-dashboard-ui
plan: "02"
subsystem: ui
tags: [react, maplibre, react-map-gl, zustand, typescript, choropleth, feature-state, geojson]

# Dependency graph
requires:
  - phase: 05-01
    provides: Zustand mapStore with geojsonData/popupInfo/rankedTracts, useTractData hook stub, API clients (fetchTractsGeoJSON, fetchRankedTracts), PopupInfo type
provides:
  - Interactive MapLibre choropleth heat map centered on King County
  - useTractData hook: fetches GeoJSON + ranked tracts into Zustand on mount
  - HeatMap.tsx: fill choropleth with yellow->crimson gradient, feature-state hover (GPU-side), onClick popup
  - TractPopup.tsx: glassmorphism floating popup with zone label, risk badge, score grid, WHY NOT BUILD HERE tags
  - CountyBorderLayer.tsx: glowing cyan dual-line county border approximation
  - mapRef exported at module level for Plan 03 fly-to animations
  - .env.local with VITE_MAPTILER_KEY placeholder and fallback to demotiles
affects:
  - 05-03-PLAN (LeftSidebar imports mapRef from HeatMap for fly-to; mapStore geojsonData/rankedTracts used for tract list)
  - 05-04-PLAN (polish builds on all established map components)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "LayerProps from react-map-gl/maplibre (not FillLayer/LineLayer) — correct type for layer specs without required source field"
    - "FillLayerSpecification/LineLayerSpecification require source field; LayerProps uses OptionalSource<> allowing omission"
    - "Layer style objects defined as module-level constants (stable references) — never inline in JSX"
    - "hoveredTractId as module-level variable (not useState) — eliminates 60fps React re-render on hover"
    - "generateId={true} on Source — required for numeric feature IDs enabling setFeatureState"
    - "mapRef as module-level plain object — exported stable ref for cross-component map access"

key-files:
  created:
    - urban-heat-ui/src/hooks/useTractData.ts
    - urban-heat-ui/src/components/map/CountyBorderLayer.tsx
    - urban-heat-ui/src/components/map/HeatMap.tsx
    - urban-heat-ui/src/components/map/TractPopup.tsx
    - urban-heat-ui/.env.local
  modified:
    - urban-heat-ui/src/App.tsx

key-decisions:
  - "LayerProps (not FillLayer/LineLayer) is the correct react-map-gl/maplibre type for layer spec objects — FillLayerSpecification/LineLayerSpecification require source field which is provided by <Source> wrapper, not inline"
  - "hoveredTractId as module-level var (not useRef/useState) — setFeatureState is GPU-side, no React re-render needed; module var survives component lifecycle without triggering re-renders"
  - "mapRef exported as plain module-level object {current: null} — Plan 03 fly-to imports and calls mapRef.current?.flyTo() without prop drilling"

patterns-established:
  - "Feature-state hover pattern: map.setFeatureState({source, id}, {hover: true/false}) in onMouseMove/onMouseLeave handlers using module-level tracker"
  - "Stable GeoJSON reference: always read from Zustand store via useShallow selector — never pass inline data object to Source"
  - "Map component: interactiveLayerIds={['tract-fill']} to scope click/hover events to only the fill layer"

requirements-completed:
  - REQ-5.1
  - REQ-5.2

# Metrics
duration: 2min
completed: 2026-03-01
---

# Phase 5 Plan 02: Interactive Heat Map Choropleth Summary

**MapLibre choropleth heat map with yellow->crimson gradient fill, GPU-side feature-state hover, glassmorphism TractPopup, and glowing cyan county border — wired into App.tsx as the live center panel**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-01T04:11:43Z
- **Completed:** 2026-03-01T04:13:48Z
- **Tasks:** 2
- **Files modified:** 5 created, 1 modified

## Accomplishments

- HeatMap.tsx renders full-height MapLibre map centered on King County (lng -122.1, lat 47.5, zoom 9.5) with dark dataviz style
- Yellow (#FFE44D) to deep crimson (#8B0000) choropleth via interpolate fill-color expression on xgb_heat_score
- Hover brightens opacity to 0.85 using feature-state pattern (module-level hoveredTractId, zero React re-renders)
- Clicking a tract shows TractPopup: zone label, risk badge (color-coded), 3-score grid, WHY NOT BUILD HERE pill tags
- CountyBorderLayer renders glowing dual-line cyan county approximation border
- mapRef exported at module level so Plan 03 LeftSidebar can trigger fly-to animations
- Loading overlay shown while GeoJSON is fetching (before data arrives); map tiles load immediately

## Task Commits

Each task was committed atomically:

1. **Task 1: useTractData hook, HeatMap choropleth + feature-state hover, CountyBorderLayer, TractPopup** - `8f47761` (feat)
2. **Task 2: Wire HeatMap into App.tsx, useTractData at root, .env.local placeholder** - `806f1df` (feat)

## Files Created/Modified

- `urban-heat-ui/src/hooks/useTractData.ts` - Fetches GeoJSON + ranked tracts into Zustand store on mount
- `urban-heat-ui/src/components/map/CountyBorderLayer.tsx` - Dual-line cyan glow approximation of King County border
- `urban-heat-ui/src/components/map/HeatMap.tsx` - Main MapLibre map with choropleth, feature-state hover/selected, click handler, popup, loading overlay
- `urban-heat-ui/src/components/map/TractPopup.tsx` - Glassmorphism popup with zone label, risk badge, score grid, WHY NOT BUILD HERE tags
- `urban-heat-ui/.env.local` - VITE_MAPTILER_KEY placeholder (empty = falls back to demotiles.maplibre.org)
- `urban-heat-ui/src/App.tsx` - Replaced center panel placeholder with HeatMap; calls useTractData() at root

## Decisions Made

- Used `LayerProps` (not `FillLayer`/`LineLayer`) as TypeScript type for layer spec objects — `FillLayerSpecification`/`LineLayerSpecification` require a `source` field since they are full maplibre layer specs; `LayerProps` from react-map-gl uses `OptionalSource<>` wrapper allowing omission (source is provided by parent `<Source>` component)
- `hoveredTractId` stored as module-level variable (not `useRef` or `useState`) — `setFeatureState` is GPU-side with no React involvement; module var avoids triggering re-renders while surviving component re-mounts
- `mapRef` exported as plain module-level `{ current: null as MapRef | null }` object — clean cross-component access pattern without Context or prop drilling; Plan 03 imports and calls `mapRef.current?.flyTo()`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected TypeScript types for layer spec objects**
- **Found during:** Task 1 (HeatMap.tsx, CountyBorderLayer.tsx creation)
- **Issue:** Plan specified `FillLayer` and `LineLayer` as types, but react-map-gl/maplibre v8 exports `FillLayerSpecification`/`LineLayerSpecification` (which require `source` field) not `FillLayer`/`LineLayer`. Correct type for react-map-gl Layer objects (where source is on the `<Source>` wrapper) is `LayerProps`
- **Fix:** Changed type annotations from `FillLayer`/`LineLayer` to `LayerProps` from `react-map-gl/maplibre`
- **Files modified:** `HeatMap.tsx`, `CountyBorderLayer.tsx`
- **Verification:** `npm run build` exits 0, no TypeScript errors
- **Committed in:** `8f47761` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (type annotation correction)
**Impact on plan:** Necessary for TypeScript compilation. No behavior or scope change.

## Issues Encountered

- react-map-gl v8 re-exports from @vis.gl/react-maplibre which changed layer type naming convention — `FillLayer`/`LineLayer` no longer exist; `LayerProps` is the correct type for react-map-gl layer prop objects

## User Setup Required

Optional: Add a free MapTiler API key to `urban-heat-ui/.env.local` for the dark dataviz basemap style. Without a key, the map falls back to `https://demotiles.maplibre.org/style.json` (basic tiles, suitable for development).

```
VITE_MAPTILER_KEY=your_key_here
```

Get a free key at https://cloud.maptiler.com/auth/widget

## Next Phase Readiness

- HeatMap component is live in the center panel — choropleth renders when backend is running
- `mapRef` is exported and ready for Plan 03 LeftSidebar fly-to calls
- `rankedTracts` are fetched and stored in Zustand by `useTractData` — ready for Plan 03 location sidebar list
- No tailwind.config.js present (Tailwind v4 CSS-first confirmed)
- TypeScript strict mode compiles cleanly

---
*Phase: 05-heat-map-dashboard-ui*
*Completed: 2026-03-01*
