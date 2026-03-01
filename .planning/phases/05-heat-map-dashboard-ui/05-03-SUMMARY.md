---
phase: 05-heat-map-dashboard-ui
plan: "03"
subsystem: ui

tags: [react, typescript, zustand, maplibre, lucide-react, tailwind]

# Dependency graph
requires:
  - phase: 05-heat-map-dashboard-ui/05-01
    provides: Zustand stores (mapStore, chatStore), API clients, AppHeader skeleton
  - phase: 05-heat-map-dashboard-ui/05-02
    provides: HeatMap choropleth + mapRef exported, useTractData, CountyBorderLayer

provides:
  - LeftSidebar with ranked tract cards, search filter, fly-to animation, chat context injection
  - RightChatPanel with AI header, message bubbles, quick chips, auto-scroll, /api/v1/chat wiring
  - ChatMessage component with AI/user bubble styles
  - ChatInput component with auto-resizing textarea and send button
  - QuickChips component with contextual action chips
  - useChatScroll hook for near-bottom auto-scroll
  - Fully wired three-panel App.tsx layout (sidebar + map + chat)

affects:
  - 05-04 (future plans using the completed dashboard)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - useShallow for all multi-field Zustand selectors to prevent extra re-renders
    - mapRef module-level export for cross-component flyTo without prop drilling
    - Inline style objects for themed dark-mode-always UI components
    - useChatScroll near-bottom detection (scrollHeight - scrollTop - clientHeight < 120)

key-files:
  created:
    - urban-heat-ui/src/components/layout/LeftSidebar.tsx
    - urban-heat-ui/src/components/layout/RightChatPanel.tsx
    - urban-heat-ui/src/components/chat/ChatMessage.tsx
    - urban-heat-ui/src/components/chat/ChatInput.tsx
    - urban-heat-ui/src/components/chat/QuickChips.tsx
    - urban-heat-ui/src/hooks/useChatScroll.ts
  modified:
    - urban-heat-ui/src/App.tsx

key-decisions:
  - "Fly-to uses King County center (-122.1, 47.5) at zoom 10 for all tract cards — all tracts are in King County, no per-tract coordinates needed"
  - "TODAY/YESTERDAY grouping is mock — first 8 cards as TODAY, next 8 as YESTERDAY for visual hierarchy without real timestamps"
  - "useChatScroll only scrolls when within 120px of bottom — preserves user scroll position when reading history"
  - "Error fallback in handleSend shows friendly message pointing to localhost:8000 — no crash on offline backend"

patterns-established:
  - "Chat sub-components (ChatMessage, ChatInput, QuickChips) are pure presentational — no Zustand access, all props"
  - "RightChatPanel owns chat orchestration — calls postChat, manages message append, handles loading state"
  - "LeftSidebar injects map context on card click via chatStore.updateMapContext — sidebar-to-chat coupling via Zustand only"

requirements-completed: [REQ-5.3, REQ-5.4]

# Metrics
duration: 5min
completed: 2026-03-01
---

# Phase 05 Plan 03: Heat Map Dashboard UI — Left Sidebar + Right Chat Panel Summary

**Three-panel dashboard complete: LeftSidebar renders ranked tract cards with fly-to, RightChatPanel sends messages to /api/v1/chat with selected tract context injection via Zustand**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-01T04:15:59Z
- **Completed:** 2026-03-01T04:21:34Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- LeftSidebar reads rankedTracts from mapStore, renders location cards with zone label, suitability badge (High/Medium/Low based on xgb_heat_score threshold), and heat score
- Clicking a location card calls mapRef.current.flyTo() to King County center and injects the tract's scores into chatStore.mapContext
- Search input filters cards by tract_id (case-insensitive)
- Loading skeleton shown while rankedTracts are fetching
- RightChatPanel renders AI header with purple Bot avatar and green "Online & Analyzing" status dot
- Quick action chips (4 default) trigger chat sends directly
- Auto-resizing textarea (max 120px) with Enter-to-send (Shift+Enter for newline)
- Auto-scroll to bottom only when user is within 120px of bottom — preserves scroll position when reading history
- "Analyzing N tract(s)" badge appears in chat header when selectedTractId is set
- Error fallback message when backend is offline

## Task Commits

Each task was committed atomically:

1. **Task 1: LeftSidebar — location cards from ranked tracts with fly-to, search filter** - `15b64f3` (feat)
2. **Task 2: RightChatPanel, ChatMessage, ChatInput, QuickChips, useChatScroll, wire App.tsx** - `737ca29` (feat)

## Files Created/Modified
- `urban-heat-ui/src/components/layout/LeftSidebar.tsx` - Ranked tract location cards, search, fly-to, chat context injection
- `urban-heat-ui/src/components/layout/RightChatPanel.tsx` - AI chat panel with header, messages, chips, input, /api/v1/chat wiring
- `urban-heat-ui/src/components/chat/ChatMessage.tsx` - Single message bubble, AI left/user right alignment
- `urban-heat-ui/src/components/chat/ChatInput.tsx` - Auto-resizing textarea with send button (Enter-to-send)
- `urban-heat-ui/src/components/chat/QuickChips.tsx` - 4 default action chips as shortcut prompts
- `urban-heat-ui/src/hooks/useChatScroll.ts` - Near-bottom scroll detection and smooth scroll-to-end
- `urban-heat-ui/src/App.tsx` - Wires LeftSidebar and RightChatPanel into three-panel layout

## Decisions Made
- Fly-to uses King County center coordinates (-122.1, 47.5) at zoom 10 for all tract clicks — all tracts are in King County, eliminating need for per-tract geocoding
- TODAY/YESTERDAY grouping is mock (first 8 vs next 8 cards) — provides visual hierarchy without real timestamps
- useChatScroll only auto-scrolls when within 120px of bottom — preserves user position when reading history
- Chat error fallback message mentions localhost:8000 explicitly — helps developers diagnose offline backend issues

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Three-panel dashboard fully functional with all layout components in place
- Chat wired to /api/v1/chat endpoint — requires backend running at localhost:8000 with ANTHROPIC_API_KEY
- Map fly-to ready for plan 04 if additional location features are added
- All Zustand stores correctly use useShallow — no infinite re-render risk

---
*Phase: 05-heat-map-dashboard-ui*
*Completed: 2026-03-01*
