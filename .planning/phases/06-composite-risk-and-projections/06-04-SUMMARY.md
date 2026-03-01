---
phase: 06-composite-risk-and-projections
plan: 04
subsystem: ui
tags: [react, zustand, typescript, maplibre, projections, timeline]

# Dependency graph
requires:
  - phase: 06-03
    provides: Projections API endpoints /api/v1/projections/{year} and /api/v1/projections/range returning projected_risk per tract per year
  - phase: 06-01
    provides: composite_risk column in tract_outputs_with_preds DuckDB table, served via ranked predictions API
  - phase: 05-heat-map-dashboard-ui
    provides: mapStore, useTractData, TimelineSlider, TractPopup, HeatMap components
provides:
  - End-to-end projection timeline wired to live API — city planners can scrub 2025–2050 and watch choropleth update
  - fetchProjectionYear store action with in-memory cache (Map<year, Map<tractId, risk>>)
  - stampProjectionOnGeoJSON helper that re-stamps display_risk on GeoJSON features without refetching geometry
  - composite_risk as the baseline display metric (replacing JS 0.35/0.40/0.25 formula)
  - TractPopup PROJ {year} label for future years
affects: [future chat context integration, simulation comparison view]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Zustand async action with get() pattern for cache-aware API fetch
    - stampProjectionOnGeoJSON: re-stamp GeoJSON display_risk property without geometry refetch
    - computeColorStops: 5-quantile color calibration recomputed after each year change
    - projectionScores Map<number, Map<string, number>> for O(1) cache lookup by year then tractId

key-files:
  created:
    - urban-heat-ui/src/api/projections.ts
  modified:
    - urban-heat-ui/src/store/mapStore.ts
    - urban-heat-ui/src/hooks/useTractData.ts
    - urban-heat-ui/src/types/api.ts
    - urban-heat-ui/src/types/map.ts
    - urban-heat-ui/src/components/map/TimelineSlider.tsx
    - urban-heat-ui/src/components/map/TractPopup.tsx
    - urban-heat-ui/src/components/map/HeatMap.tsx

key-decisions:
  - "projectionYear=2025 fast path: set({ projectionYear: 2025 }) only — no API call, composite_risk baseline already in GeoJSON"
  - "Cache hit path: re-stamp GeoJSON synchronously from scoreMap, recompute colorStops, no network request"
  - "stampProjectionOnGeoJSON mutates only display_risk property — geometry, tract_id, city_name preserved"
  - "composite_risk stamped as both display_risk and composite_risk on GeoJSON features at baseline load — enables popup to show baseline even after projection re-stamp"
  - "projectionYear in onTractClick dependency array — ensures popupInfo.projectionYear always reflects current slider state"

patterns-established:
  - "Zustand async action with get(): fetch store state after async call with get() to avoid stale closure over initial state"
  - "Year-keyed score cache: Map<number, Map<string, number>> — cache hit avoids redundant API call when scrubbing back to previously loaded year"

requirements-completed: [REQ-6.4, REQ-6.5]

# Metrics
duration: 6min
completed: 2026-03-01
---

# Phase 06 Plan 04: Frontend Timeline Projection Wiring Summary

**Timeline slider wired to projections API with year-keyed score cache, GeoJSON re-stamping, and PROJ {year} popup label — city planners can scrub 2025–2050 and watch the choropleth update live**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-01T07:20:43Z
- **Completed:** 2026-03-01T07:26:43Z
- **Tasks:** 2
- **Files modified:** 7 + 1 created

## Accomplishments
- Replaced JS 0.35/0.40/0.25 composite formula in useTractData with composite_risk from the DuckDB-backed predictions API
- Wired TimelineSlider (2025–2050) to mapStore's fetchProjectionYear action with loading indicator and auto-play
- MapStore projection state: projectionYear, projectionScores cache (Map of Maps), isProjectionLoading, stampProjectionOnGeoJSON helper, computeColorStops recomputation
- TractPopup shows "PROJ 2030" vs "RISK" based on projectionYear from store
- HeatMap passes projectionYear and composite_risk into popupInfo on tract click

## Task Commits

Each task was committed atomically:

1. **Task 1: Create API client, update types, extend store with projection state** - `6b38e6b` (feat)
2. **Task 2: Wire TimelineSlider and TractPopup to projection store** - `431fb7b` (feat)

**Plan metadata:** *(docs commit follows)*

## Files Created/Modified
- `urban-heat-ui/src/api/projections.ts` - API client: fetchProjectionYear(year) and fetchProjectionSeries(tractId)
- `urban-heat-ui/src/store/mapStore.ts` - Extended with projectionYear, projectionScores, isProjectionLoading state + fetchProjectionYear async action, stampProjectionOnGeoJSON, computeColorStops helpers
- `urban-heat-ui/src/hooks/useTractData.ts` - Replaced JS formula with composite_risk from API; stamps composite_risk on GeoJSON features
- `urban-heat-ui/src/types/api.ts` - Added composite_risk: number to RankedTract
- `urban-heat-ui/src/types/map.ts` - Added composite_risk?: number and projectionYear?: number to PopupInfo
- `urban-heat-ui/src/components/map/TimelineSlider.tsx` - Connected to store projectionYear/fetchProjectionYear; year range 2025–2050; loading indicator
- `urban-heat-ui/src/components/map/TractPopup.tsx` - Reads projectionYear from store; shows "PROJ {year}" vs "RISK" in risk badge
- `urban-heat-ui/src/components/map/HeatMap.tsx` - Passes composite_risk and projectionYear into popupInfo on tract click

## Decisions Made
- `projectionYear=2025` fast path: no API call, just `set({ projectionYear: 2025 })` — composite_risk baseline already stamped in GeoJSON
- Cache hit path: re-stamp synchronously from Map, recompute colorStops — no network request on repeat scrub
- `stampProjectionOnGeoJSON` only mutates `display_risk` property — geometry and other fields preserved
- Both `display_risk` and `composite_risk` stamped at baseline — popup can show baseline composite_risk even after projection re-stamp
- `projectionYear` added to `onTractClick` dependency array so `popupInfo.projectionYear` stays in sync with slider

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Two pre-existing TypeScript errors existed before this plan and were not caused by these changes:
- `LeftSidebar.tsx(47)`: unused `normalizedRisk` variable (TS6133)
- `HeatMap.tsx cityHighlightFilter`: `[string, ...unknown[]]` type vs `FilterSpecification` (TS2322)

Both confirmed pre-existing via `git stash` test. Deferred per scope boundary rule (out-of-plan files).

## User Setup Required

None - all changes are frontend wiring to the existing projections API (completed in Plan 06-03).

## Next Phase Readiness
- Phase 06 complete — all 4 plans executed
- Projection timeline is fully functional end-to-end pending manual verification at the checkpoint
- Cache prevents redundant network requests when scrubbing back to previously loaded years
- Baseline (2025) always uses composite_risk without any API call

## Self-Check: PASSED

- FOUND: urban-heat-ui/src/api/projections.ts
- FOUND: urban-heat-ui/src/store/mapStore.ts (extended with projection state)
- FOUND: urban-heat-ui/src/hooks/useTractData.ts (composite_risk formula)
- FOUND: urban-heat-ui/src/components/map/TimelineSlider.tsx (2025–2050 range)
- FOUND: urban-heat-ui/src/components/map/TractPopup.tsx (PROJ year label)
- FOUND: .planning/phases/06-composite-risk-and-projections/06-04-SUMMARY.md
- FOUND commit 6b38e6b: feat(06-04): create projections API client, extend types and store with projection state
- FOUND commit 431fb7b: feat(06-04): wire TimelineSlider and TractPopup to projection store

---
*Phase: 06-composite-risk-and-projections*
*Completed: 2026-03-01*
