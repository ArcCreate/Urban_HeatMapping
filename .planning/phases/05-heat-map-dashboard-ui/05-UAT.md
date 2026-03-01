---
status: testing
phase: 05-heat-map-dashboard-ui
source: [05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md, 05-04-SUMMARY.md]
started: 2026-03-01T05:00:00Z
updated: 2026-03-01T05:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Dashboard Layout
expected: |
  Navigate to the app (npm run dev in urban-heat-ui/, open http://localhost:5173).
  You should see a full-height dark UI with three panels side-by-side:
  - Left panel (~280px) — location sidebar
  - Center panel (flex-1) — map area
  - Right panel (~340px) — chat panel
  A top AppHeader spans the full width with "UrbanHeatAI" logo (cyan accent), nav tabs, a bell icon, and a user profile avatar.
awaiting: user response

## Tests

### 1. Dashboard Layout
expected: Navigate to the app (npm run dev in urban-heat-ui/, open http://localhost:5173). You should see a full-height dark UI with three panels side-by-side: left location sidebar (~280px), center map area (flex-1), right chat panel (~340px). A top AppHeader spans the full width with "UrbanHeatAI" logo in cyan, nav tabs, bell icon, and user profile avatar.
result: [pending]

### 2. Heat Map Renders
expected: The center panel shows a MapLibre map centered on King County, WA (zoom ~9.5). Census tracts are filled with a yellow (#FFE44D) to deep crimson (#8B0000) choropleth gradient based on heat score — cooler areas appear yellow, hotter areas appear crimson/red. While the GeoJSON is loading a loading overlay is shown; once loaded tracts appear.
result: [pending]

### 3. Tract Hover
expected: Hover your mouse over any census tract on the map. The hovered tract should visibly brighten (opacity increases to 0.85) compared to surrounding tracts, without any React re-renders or jank — the effect should be smooth and GPU-driven.
result: [pending]

### 4. Tract Click Popup
expected: Click any census tract on the map. A glassmorphism popup appears showing: zone label (e.g. "Zone 53033..."), a colored risk badge (Low/Medium/High), a grid of 3 scores (XGB heat, XGB risk, TF risk), and "WHY NOT BUILD HERE" pill tags. Clicking elsewhere or the X closes the popup.
result: [pending]

### 5. County Border
expected: A glowing dual-line cyan border outlines the King County boundary on the map, visible against the dark basemap. The border has a subtle glow/blur effect.
result: [pending]

### 6. Location Sidebar Cards
expected: The left sidebar shows a list of ranked census tract location cards. Each card shows a zone label, a suitability badge (High/Medium/Low, color-coded), and a heat score number. Cards are grouped under "TODAY" and "YESTERDAY" section headers. A loading skeleton appears while tracts are fetching.
result: [pending]

### 7. Sidebar Search Filter
expected: Type any characters into the search input at the top of the left sidebar. The tract cards below should filter in real-time to show only cards matching the typed tract ID (case-insensitive). Clearing the input restores all cards.
result: [pending]

### 8. Sidebar Card Fly-to
expected: Click any location card in the left sidebar. The map should smoothly fly/zoom to King County center. The clicked tract's scores should be injected into the chat context (the chat header should show "Analyzing 1 tract(s)" badge after click).
result: [pending]

### 9. Chat Panel UI
expected: The right panel shows an AI chat interface with: a purple Bot avatar header with "Online & Analyzing" green status dot, a welcome message already in the conversation, 4 quick-action chip buttons below the messages area, and an auto-resizing textarea at the bottom with a send button.
result: [pending]

### 10. Send a Chat Message
expected: Type a message in the chat input and press Enter (or click send). A user message bubble appears right-aligned in cyan. A loading indicator (animated bubble) appears while waiting. Once the backend responds (/api/v1/chat), an AI response appears left-aligned. If the backend is offline, a friendly error message mentioning localhost:8000 appears instead of crashing.
result: [pending]

### 11. Quick Chips
expected: Click any of the 4 quick-action chips below the chat messages. The chip text should be sent as a chat message (appears as a user message bubble), and the backend is called just as if you had typed it.
result: [pending]

### 12. Floating Map UI Cards
expected: Two glassmorphism floating cards are visible over the map: (1) A top-center card showing "King County, WA" with a pulsing green/amber status dot and a cosmetic "Heatmap" toggle button. (2) A bottom-center timeline slider showing "2024" → "2035" gradient track with a scrubber knob and a play/pause button. Both have the frosted-glass backdrop-blur appearance.
result: [pending]

### 13. Sidebar Card Animations
expected: Reload the page (Cmd+R). As the location cards load into the sidebar, they should stagger-animate in from the left (sliding from x:-14 to x:0 with a fade-in). TODAY group cards appear first with a slight delay between each, then YESTERDAY group cards appear with a longer initial delay. The animation should be smooth (~0.2s per card, 0.04s stagger).
result: [pending]

### 14. Chat Message Slide-in
expected: Send a new chat message. The new message bubble should slide in from slightly below (y:12 → y:0) with a fade-in over ~0.2s. The welcome message should NOT animate on initial page load — only new messages should animate in.
result: [pending]

## Summary

total: 14
passed: 0
issues: 0
pending: 14
skipped: 0

## Gaps

[none yet]
