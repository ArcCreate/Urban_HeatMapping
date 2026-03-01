---
phase: 05-heat-map-dashboard-ui
plan: "04"
subsystem: ui-animation-polish
tags: [framer-motion, glassmorphism, animation, react, typescript]
dependency_graph:
  requires: ["05-01", "05-02", "05-03"]
  provides: ["animated-dashboard", "glassmorphism-floating-ui"]
  affects: ["HeatMap", "LeftSidebar", "RightChatPanel", "TractPopup"]
tech_stack:
  added: ["motion/react (from motion@12.34.3 — already installed)"]
  patterns:
    - "motion.div stagger variants (listVariants + cardVariants) for sidebar cards"
    - "AnimatePresence(initial=false) + motion.div for chat message slide-in"
    - "motion.div entrance on TractPopup inner content (scale+fade, 0.15s)"
    - "GlassCard reusable wrapper (backdrop-blur-16, rgba 0.88 bg, subtle border)"
    - "Module-level stable variant objects — no re-creation on render"
key_files:
  created:
    - urban-heat-ui/src/components/ui/GlassCard.tsx
    - urban-heat-ui/src/components/map/MapFloatingCard.tsx
    - urban-heat-ui/src/components/map/TimelineSlider.tsx
  modified:
    - urban-heat-ui/src/components/map/HeatMap.tsx
    - urban-heat-ui/src/components/map/TractPopup.tsx
    - urban-heat-ui/src/components/layout/LeftSidebar.tsx
    - urban-heat-ui/src/components/layout/RightChatPanel.tsx
decisions:
  - "motion/react import (not framer-motion) — motion package v12 ships motion/react as canonical subpath"
  - "Stagger variants defined at module level — prevents variant object re-creation on each render"
  - "AnimatePresence initial=false on chat messages — welcome message does not animate on first mount, only new arrivals"
  - "TractPopup wraps inner content div in motion.div — Popup (react-map-gl) owns DOM positioning; we animate the content only"
  - "TimelineSlider is cosmetic in v1.1 — slider updates year label but no API call; deferred per spec"
  - "MapFloatingCard 'Heatmap' toggle is cosmetic in v1.1 — full layer toggle deferred"
metrics:
  duration_minutes: 2
  completed_date: "2026-03-01"
  tasks_completed: 2
  files_created: 3
  files_modified: 4
---

# Phase 05 Plan 04: Animation Polish and Glassmorphism Floating UI Summary

**One-liner:** Framer Motion stagger/slide animations on sidebar cards and chat messages, plus glassmorphism MapFloatingCard and TimelineSlider floating over the heatmap.

## What Was Built

### Task 1 — GlassCard, MapFloatingCard, TimelineSlider, popup animation

**GlassCard (`src/components/ui/GlassCard.tsx`)** — Reusable glassmorphism wrapper component used by both floating map elements. Applies `backdrop-blur(16px)`, `rgba(18,18,26,0.88)` background, 1px `rgba(255,255,255,0.10)` border, and a layered box-shadow. Accepts `style` prop for layout overrides.

**MapFloatingCard (`src/components/map/MapFloatingCard.tsx`)** — Absolutely positioned at `top: 12px, left: 50%, translateX(-50%)` over the map at `z-index: 10`. Shows "King County, WA", a pulsing green/amber status dot reflecting `isMapLoading` from the map store, and a cosmetic "Heatmap" toggle button in cyan glass style.

**TimelineSlider (`src/components/map/TimelineSlider.tsx`)** — Absolutely positioned at `bottom: 20px` center of map. Renders a 2024→2035 gradient track (green to amber) with a custom scrubber knob overlaying an invisible `<input type="range">`. Year label and play/pause button update local state only (cosmetic per v1.1 spec).

**HeatMap.tsx** — Added imports and rendered `<MapFloatingCard />` and `<TimelineSlider />` inside the outer `div.relative` after the `<Map>` block so they float over the map.

**TractPopup.tsx** — Inner content `<div>` replaced with `<motion.div>` adding `initial={{ opacity: 0, scale: 0.9, y: 4 }}` → `animate={{ opacity: 1, scale: 1, y: 0 }}` entrance in 0.15s. Exit variants defined; `Popup` component handles its own DOM lifecycle.

### Task 2 — Stagger animations in LeftSidebar, slide-in in RightChatPanel

**LeftSidebar.tsx** — Added `motion` import from `motion/react`. Defined three module-level stable variant objects: `listVariants` (TODAY group, 0.05s delay), `listVariantsDelayed` (YESTERDAY group, 0.35s delay), `cardVariants` (x: -14 → 0, opacity 0 → 1, 0.2s each). Card lists wrapped in `<motion.div variants={listVariants}>` with each card in `<motion.div variants={cardVariants}>` for staggered slide-from-left.

**RightChatPanel.tsx** — Added `motion, AnimatePresence` imports from `motion/react`. Messages list wrapped in `<AnimatePresence initial={false}>` so the welcome message skips animation on mount. Each `<ChatMessage>` wrapped in `<motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>`. Loading bubble upgraded to `<motion.div>` with `y: 8 → 0` slide-in.

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

- `npm run build` exits 0 — TypeScript clean, all 2187 modules transformed
- No `tailwind.config.js` in project root (Tailwind v4 CSS-first confirmed)
- No `from 'framer-motion'` imports anywhere in `src/` — all use `motion/react`
- GlassCard used by MapFloatingCard and TimelineSlider
- MapFloatingCard renders "King County, WA" with live data badge (reactive to isMapLoading)
- TimelineSlider renders 2024→2035 gradient track with scrubber knob and play/pause
- LeftSidebar TODAY group staggered (0.04s, 0.05s delay), YESTERDAY group staggered (0.04s, 0.35s delay)
- RightChatPanel AnimatePresence initial=false, each message slides in 0.2s

## Self-Check: PASSED

Files exist:
- urban-heat-ui/src/components/ui/GlassCard.tsx: FOUND
- urban-heat-ui/src/components/map/MapFloatingCard.tsx: FOUND
- urban-heat-ui/src/components/map/TimelineSlider.tsx: FOUND

Commits verified:
- 2750ed4: feat(05-04): GlassCard, MapFloatingCard, TimelineSlider, popup motion animation
- 0c819e7: feat(05-04): staggered card animations in LeftSidebar, slide-in messages in RightChatPanel
