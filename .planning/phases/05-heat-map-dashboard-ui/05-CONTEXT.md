# Phase 5: Heat Map Dashboard UI - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning
**Source:** UI reference image + skill.md + project markdown files

<domain>
## Phase Boundary

Build a React frontend dashboard for city planners to visualize King County heat-risk data. The UI connects to the existing FastAPI backend (Phases 1–4) and delivers three main panels: a location/search sidebar (left), an interactive heat-risk choropleth map (center), and an AI chat assistant (right). City planners use this to identify best/worst construction sites by heat risk and run natural-language simulations.

This is a frontend-only phase. The backend API is complete at `/api/v1/`.

</domain>

<decisions>
## Implementation Decisions

### Layout — Three-Panel Dashboard
- Full-viewport layout: left sidebar (fixed ~280px), center map (flex fill), right chat panel (fixed ~340px)
- App header: "UrbanHeatAI" logo (grid icon), nav tabs (Dashboard, Analysis, Reports), notification bell, user profile (avatar + name + role)
- No page scroll — single-page app, all panels independently scrollable

### Left Panel — Recent Locations / Location Focus
- Header: "Recent Locations"
- Search input: "Search cities..." with magnifier icon
- Location list grouped by recency (TODAY, YESTERDAY, etc.)
- Each location card: county name, state/country, timestamp/badge (Active/Xh ago), Avg Temp + Suitability row
- Active location has green "Active" badge and highlighted card
- Suitability shown as colored label: High (green), Medium (yellow), Low (red)
- "+ New Analysis" button pinned to bottom of left panel (dark/black fill)
- Clicking a location flies the map to that county

### Center Panel — Interactive Heat Map
- Map library: **MapLibre GL JS** (React wrapper: `react-map-gl`)
- Base map: dark terrain/satellite hybrid — the reference image shows a dark basemap with topographic detail and the county boundary glowing with cyan/teal border
- Heat overlay: choropleth by `xgb_heat_score` — color scale yellow (low) → orange → red → deep red (high)
- County boundary highlighted with glowing cyan/teal outline
- Map header card (floating, top-center): county name, "Live Terrain Data" badge (green dot), "Heatmap" layer toggle button
- Clickable tracts: clicking a tract shows a popup
- Tract popup (floating card): Zone label (e.g., "Zone A-42: Residential"), risk level badge ("High Heat Risk Alert" in red), "WHY NOT BUILD HERE" section with reason tags (e.g., "Low Tree Coverage", "Heat Illness Spike"), "Current Density: XX% Built"
- Tract markers: black dot for selected tract, white circle for hovered tract
- Future Projection Timeline (bottom bar, floating): clock icon, "FUTURE PROJECTION TIMELINE" label, slider from 2024 → 2035 with play/pause button, colored gradient track (green → yellow)
- Map controls: zoom in/out, map style toggle

### Right Panel — AI Chat Assistant
- Header: robot/AI avatar (purple), "UrbanAI Assistant" name, "Online & Analyzing" green status dot
- Chat messages:
  - AI messages: avatar + white speech bubble (left-aligned)
  - User messages: dark/black speech bubble (right-aligned) + user avatar
  - Timestamps below each message
- Quick Insight card (embedded in AI turn): icon + metric ("+4.5°C Proj. Temp Rise"), "View Detailed Report" button
- Quick action chips (contextual suggestions): e.g., "Show zoning map", "Compare with 2020", "Export data"
- Chat input: placeholder "Ask about heat impact, zoning, or simulations...", paperclip attach icon, send button (dark circle with up-arrow)
- Footer disclaimer: "AI can make mistakes. Review generated data."
- Chat calls `POST /api/v1/chat` — sends message + selected tract context (tract_id list + scores)

### Map-Chat Context Integration
- When a tract is selected on the map, its `tract_id`, `xgb_heat_score`, `tf_risk_score`, `xgb_risk_score` are injected into the chat context
- Chat panel shows visual indication of which tracts are selected (e.g., "Analyzing 1 tract" header badge)
- "Compare with 2020" chip triggers simulation: `POST /api/v1/simulations/compare`

### Design Aesthetic (from skill.md)
- **Aesthetic direction:** "dark analytical dashboard" — professional, data-dense, refined dark mode. Think Bloomberg Terminal meets modern SaaS.
- **Color palette:**
  - Background: near-black (#0A0A0F) with subtle dark surfaces (#12121A, #1A1A26)
  - Map: dark satellite base with bright heat gradients (yellow #FFE44D → orange #FF8C00 → red #FF2D2D → deep crimson #8B0000)
  - County border: glowing cyan #00E5FF with glow effect
  - Accent: teal #00BFA5 for active states, green #4CAF50 for suitability/online
  - Chat: dark cards, purple AI avatar (#7C3AED), user messages in #1F2937
- **Typography:**
  - Display/logo: distinctive sans — "DM Sans" or "Syne" for the app name
  - Body: "IBM Plex Sans" (technical, crisp, appropriate for data dashboards)
  - Monospace for tract IDs, scores: "IBM Plex Mono"
  - Avoid Inter, Roboto, Arial
- **Motion:**
  - Map fly-to animation on location change
  - Smooth popup entrance (scale + fade)
  - Chat message slide-in animation
  - Timeline slider with smooth scrub
  - Staggered card load on initial render
- **Details:**
  - Glass-morphism on floating map cards (backdrop-blur, semi-transparent dark bg)
  - Subtle gradient borders on active/selected states
  - Glowing border on county outline
  - Smooth color interpolation on the heat choropleth

### Tech Stack (confirmed from technical_spec.md + project context)
- **Framework:** React (Vite)
- **Map:** MapLibre GL JS via `react-map-gl` (Mapbox-compatible API)
- **Styling:** Tailwind CSS (utility-first, easy dark mode)
- **State management:** React Context or Zustand (lightweight)
- **HTTP client:** fetch / axios for API calls to `http://localhost:8000/api/v1/`
- **Map tiles:** free basemap — MapTiler or Stadia Maps dark style OR Mapbox dark (token required)
- **Fonts:** Google Fonts (DM Sans + IBM Plex Sans + IBM Plex Mono)

### API Endpoints Used by Frontend
- `GET /api/v1/tracts` — load all 492 tract GeoJSON for choropleth layer
- `GET /api/v1/predictions/ranked?sort_by=xgb_heat_score&order=desc` — for ranked sidebar list
- `GET /api/v1/tracts/{tract_id}/predictions` — on tract click for popup details
- `GET /api/v1/summary` — county-level summary card
- `POST /api/v1/chat` — chat panel messages
- `POST /api/v1/simulations/what-if` — from chat or action chips (tree canopy, albedo)
- `POST /api/v1/simulations/compare` — compare two tracts

### Claude's Discretion
- Exact map tile provider (MapTiler free tier recommended — no Mapbox account needed)
- Whether to use Zustand vs React Context for state
- Exact animation library (Framer Motion / CSS transitions)
- Whether timeline slider is purely cosmetic or triggers API calls
- Mobile responsiveness (likely not needed — planner tool)
- Error toast/notification style
- Loading skeleton vs spinner for data fetching

</decisions>

<specifics>
## Specific Ideas

### From UI Reference Image
- App name: "UrbanHeatAI" (or "UrbanHeat**AI**" with bold/italic AI suffix)
- Header nav pills: "Dashboard" (active/selected pill style), "Analysis", "Reports" — pill group with rounded pill container
- User profile in header: avatar circle, name "Alex Morgan", subtitle "Lead Planner"
- Left panel location cards: tree icon for parks/green areas, wave/water icon for coastal areas — distinct icons per location type
- Zone popup label format: "Zone A-42: Residential" — uses census tract GEOID as zone label
- "WHY NOT BUILD HERE" section in popup uses colored pill tags for risk factors
- Bottom timeline bar uses two-tone gradient track: green left portion → yellow/orange right portion with a scrubber knob
- Chat quick insights use a temperature/thermometer icon in red for heat metrics
- AI chat header shows robot emoji / purple avatar icon

### Layout Proportions (estimated from reference)
- Left sidebar: ~20% width (~280px at 1440px viewport)
- Center map: ~55% width
- Right chat: ~25% width (~340px)
- Header height: ~56px
- Map fills full remaining height below header

### Popup Position
- Popup appears anchored to the clicked tract, offset slightly above-right
- Popup has a small drop shadow and rounded corners
- Popup has a close (×) button in top-right

</specifics>

<deferred>
## Deferred Ideas

- Mobile/tablet responsive layout — planner tool, desktop only in v1.1
- Reports tab implementation — navigation placeholder only in v1.1
- Analysis tab — navigation placeholder only in v1.1
- Real-time streaming chat (SSE) — full reply sufficient, deferred to v1.2
- Export data functionality — chip visible but not wired in v1.1
- Multi-county support — King County only
- Authentication / login page — not needed for internal tool in v1.1
- Dark/light mode toggle — dark mode only matches the reference aesthetic
- PWA / offline mode
- Mapbox vector tiles for blocks layer — tracts only in v1.1 (blocks layer deferred)

</deferred>

---

*Phase: 05-heat-map-dashboard-ui*
*Context gathered: 2026-02-28 via UI reference image + skill.md + project docs*
