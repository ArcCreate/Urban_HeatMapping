# Phase 5: Heat Map Dashboard UI - Research

**Researched:** 2026-02-28
**Domain:** React + Vite + MapLibre GL JS + Tailwind CSS v4 — interactive choropleth dashboard
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Layout — Three-Panel Dashboard**
- Full-viewport layout: left sidebar (fixed ~280px), center map (flex fill), right chat panel (fixed ~340px)
- App header: "UrbanHeatAI" logo (grid icon), nav tabs (Dashboard, Analysis, Reports), notification bell, user profile (avatar + name + role)
- No page scroll — single-page app, all panels independently scrollable

**Left Panel — Recent Locations / Location Focus**
- Header: "Recent Locations"
- Search input: "Search cities..." with magnifier icon
- Location list grouped by recency (TODAY, YESTERDAY, etc.)
- Each location card: county name, state/country, timestamp/badge (Active/Xh ago), Avg Temp + Suitability row
- Active location has green "Active" badge and highlighted card
- Suitability shown as colored label: High (green), Medium (yellow), Low (red)
- "+ New Analysis" button pinned to bottom of left panel (dark/black fill)
- Clicking a location flies the map to that county

**Center Panel — Interactive Heat Map**
- Map library: **MapLibre GL JS** (React wrapper: `react-map-gl`)
- Base map: dark terrain/satellite hybrid with topographic detail, county boundary glowing cyan/teal
- Heat overlay: choropleth by `xgb_heat_score` — color scale yellow → orange → red → deep red
- County boundary highlighted with glowing cyan/teal outline
- Map header card (floating, top-center): county name, "Live Terrain Data" badge, "Heatmap" layer toggle
- Clickable tracts: clicking shows a popup
- Tract popup: Zone label, risk level badge, "WHY NOT BUILD HERE" section with pill tags, "Current Density: XX% Built"
- Tract markers: black dot for selected tract, white circle for hovered tract
- Future Projection Timeline (bottom bar, floating): slider 2024→2035 with play/pause
- Map controls: zoom in/out, map style toggle

**Right Panel — AI Chat Assistant**
- Header: robot/AI avatar (purple), "UrbanAI Assistant", "Online & Analyzing" green status dot
- AI messages: avatar + white speech bubble (left-aligned); User messages: dark bubble (right-aligned)
- Quick Insight card embedded in AI turn
- Quick action chips: contextual suggestions
- Chat input: placeholder text, paperclip attach icon, send button
- Footer disclaimer: "AI can make mistakes. Review generated data."
- Chat calls `POST /api/v1/chat` — sends message + selected tract context

**Map-Chat Context Integration**
- Selected tract injects `tract_id`, `xgb_heat_score`, `tf_risk_score`, `xgb_risk_score` into chat context
- Chat panel shows badge: "Analyzing 1 tract"
- "Compare with 2020" chip triggers `POST /api/v1/simulations/compare`

**Design Aesthetic (from skill.md)**
- Dark analytical dashboard — Bloomberg Terminal meets modern SaaS
- Background: #0A0A0F, surfaces: #12121A / #1A1A26
- Heat gradient: #FFE44D → #FF8C00 → #FF2D2D → #8B0000
- County border: glowing cyan #00E5FF
- Accent: teal #00BFA5, green #4CAF50
- Chat: dark cards, purple AI avatar #7C3AED
- Typography: DM Sans (display/logo) + IBM Plex Sans (body) + IBM Plex Mono (scores/IDs)
- Motion: fly-to animation, popup scale+fade, chat slide-in, staggered card load, timeline slider scrub
- Glass-morphism on floating map cards (backdrop-blur, semi-transparent dark bg)
- Glowing border on county outline, smooth heat choropleth color interpolation

**Tech Stack (confirmed)**
- Framework: React (Vite)
- Map: MapLibre GL JS via `react-map-gl`
- Styling: Tailwind CSS (utility-first, dark mode)
- State management: React Context or Zustand (lightweight)
- HTTP client: fetch / axios for `http://localhost:8000/api/v1/`
- Fonts: Google Fonts (DM Sans + IBM Plex Sans + IBM Plex Mono)

**API Endpoints Used by Frontend**
- `GET /api/v1/tracts` — 492 tract GeoJSON for choropleth
- `GET /api/v1/predictions/ranked?sort_by=xgb_heat_score&order=desc` — ranked sidebar
- `GET /api/v1/tracts/{tract_id}/predictions` — on-click popup details
- `GET /api/v1/summary` — county-level summary card
- `POST /api/v1/chat` — chat panel
- `POST /api/v1/simulations/what-if` — simulation from chat/chips
- `POST /api/v1/simulations/compare` — compare two tracts

### Claude's Discretion
- Exact map tile provider (MapTiler free tier recommended — no Mapbox account needed)
- Whether to use Zustand vs React Context for state
- Exact animation library (Framer Motion / CSS transitions)
- Whether timeline slider is purely cosmetic or triggers API calls
- Mobile responsiveness (likely not needed — planner tool)
- Error toast/notification style
- Loading skeleton vs spinner for data fetching

### Deferred Ideas (OUT OF SCOPE)
- Mobile/tablet responsive layout — planner tool, desktop only in v1.1
- Reports tab implementation — navigation placeholder only in v1.1
- Analysis tab — navigation placeholder only in v1.1
- Real-time streaming chat (SSE) — full reply sufficient, deferred to v1.2
- Export data functionality — chip visible but not wired in v1.1
- Multi-county support — King County only
- Authentication / login page — not needed for internal tool in v1.1
- Dark/light mode toggle — dark mode only
- PWA / offline mode
- Mapbox vector tiles for blocks layer — tracts only in v1.1
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REQ-5.1 | Interactive choropleth heat-risk map of all 492 King County census tracts with MapLibre GL JS | react-map-gl v8.1 + MapLibre v5 GeoJSON Source+Layer pattern; fill-color interpolate expression on xgb_heat_score; feature-state for hover; promoteId/generateId for tract identity |
| REQ-5.2 | Clickable tract selection showing popup with construction-suitability stats | interactiveLayerIds + onClick event handler to get e.features[0]; Popup component from react-map-gl; mapRef.current.flyTo() for camera |
| REQ-5.3 | Location search / focus sidebar (left panel) with ranked tract list | GET /predictions/ranked API; Zustand store for selected tract; location cards with fly-to on click |
| REQ-5.4 | AI chat panel (right) wired to POST /chat with selected tract context | Full-reply (non-streaming) POST to /api/v1/chat; chat message state in Zustand; auto-scroll pattern; useRef for chat container |
| REQ-5.5 | Dark analytical dashboard aesthetic matching reference UI (DM Sans + IBM Plex, heat gradient, glass-morphism, animated transitions) | Tailwind CSS v4 dark mode; CSS @theme block for custom colors/fonts; backdrop-blur for glassmorphism; Framer Motion 12.x AnimatePresence + stagger |
</phase_requirements>

---

## Summary

Phase 5 is a pure frontend build: a React + Vite single-page dashboard that consumes the complete FastAPI backend (Phases 1–4). The central challenge is rendering a large GeoJSON choropleth (492 tract polygons, potentially 5–15 MB payload) with real-time interaction (hover, click, popup, fly-to) while maintaining 60fps in a dark analytical dashboard aesthetic. The backend is at `localhost:8000/api/v1/` and needs no modification.

The tech stack is locked: `react-map-gl` v8.1 (importing from `react-map-gl/maplibre`) wrapping MapLibre GL JS v5, Tailwind CSS v4 with the Vite plugin, Zustand v5 for map + chat shared state, and Framer Motion 12 (imported as `motion/react`) for animations. Tailwind v4's CSS-first configuration replaces `tailwind.config.js` — a significant setup difference from v3. Vite's built-in server proxy will eliminate CORS in development; no proxy package needed.

The biggest technical risks are GeoJSON payload size (must define Source outside render to avoid MapLibre re-parsing on each React render), feature-state hover management (requires `generateId: true` on the GeoJSON Source so MapLibre can track feature identity), and chat scroll behavior (must auto-scroll to bottom only when user is already at bottom). Map tile access requires a free MapTiler API key or Stadia Maps key — these are free-tier services with no billing required for low-volume internal tools.

**Primary recommendation:** Scaffold with `npm create vite@latest urban-heat-ui -- --template react-ts`, install the stack in one command, configure Vite proxy for `/api` → `localhost:8000`, and build in three waves: (1) map + choropleth + hover/click, (2) left sidebar + chat panel + state wiring, (3) animations, glass-morphism polish, and timeline slider.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.x (via Vite template) | Component model + hooks | Peer dep of react-map-gl; concurrent mode features |
| Vite | 6.x | Dev server + bundler | Fastest HMR, first-class TS; react-map-gl ecosystem targets it |
| react-map-gl | 8.1.0 | React components for MapLibre | Official vis.gl wrapper; `react-map-gl/maplibre` import avoids mapbox-gl dep |
| maplibre-gl | 5.x (5.19.0 latest) | Map rendering engine | Open-source, no Mapbox token; react-map-gl/maplibre requires >=4 |
| Tailwind CSS | 4.x (v4.0 released Jan 2025) | Utility CSS | CSS-first config, 182x faster incremental builds, Vite plugin |
| @tailwindcss/vite | 4.x | Tailwind Vite integration | First-party plugin, tighter than PostCSS for Vite |
| Zustand | 5.0.11 | Map + chat shared state | Lightweight (no Redux boilerplate), v5 requires `useShallow` for object selectors |
| motion (framer-motion) | 12.34.3 | Animations | AnimatePresence, stagger, layout animations; import as `motion/react` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/geojson | latest | GeoJSON TypeScript types | Type safety for FeatureCollection passed to Source |
| lucide-react | latest | Icon set | Icon library with tree, map-pin, chat, bell icons matching design |
| clsx | latest | Conditional class names | Merging Tailwind classes without string interpolation bugs |
| tailwind-merge | latest | Safe Tailwind class merging | Required when merging classes that might conflict |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Zustand | React Context + useReducer | Context fine for small apps; Zustand avoids prop drilling through 3 panels without performance hit |
| Framer Motion (motion/react) | CSS transitions only | CSS transitions cover hover/opacity; Framer Motion needed for AnimatePresence exit animations + stagger |
| MapTiler (free tier) | Stadia Maps alidade_smooth_dark | Both free; MapTiler has better dark satellite style matching the reference image |
| Tailwind v4 | Tailwind v3 | v4 CSS-first config is a breaking change from v3; this project starts fresh, so v4 is correct choice |

**Installation:**
```bash
npm create vite@latest urban-heat-ui -- --template react-ts
cd urban-heat-ui
npm install react-map-gl maplibre-gl
npm install tailwindcss @tailwindcss/vite
npm install zustand motion
npm install lucide-react clsx tailwind-merge
npm install --save-dev @types/geojson
```

---

## Architecture Patterns

### Recommended Project Structure
```
urban-heat-ui/
├── src/
│   ├── api/                 # API client functions (fetch wrappers)
│   │   ├── tracts.ts        # GET /tracts, GET /tracts/:id/predictions
│   │   ├── predictions.ts   # GET /predictions/ranked, GET /summary
│   │   ├── chat.ts          # POST /chat
│   │   └── simulations.ts   # POST /simulations/what-if, compare
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppHeader.tsx      # Logo + nav tabs + bell + user profile
│   │   │   ├── LeftSidebar.tsx    # Location search + card list
│   │   │   └── RightChatPanel.tsx # AI chat UI
│   │   ├── map/
│   │   │   ├── HeatMap.tsx          # Main Map component + Source + Layer
│   │   │   ├── TractLayer.tsx       # Fill layer with heat gradient expression
│   │   │   ├── TractPopup.tsx       # Popup on tract click
│   │   │   ├── CountyBorder.tsx     # Glowing cyan county outline layer
│   │   │   ├── MapFloatingCard.tsx  # Top-center floating county info card
│   │   │   └── TimelineSlider.tsx   # Bottom timeline bar (2024-2035)
│   │   ├── chat/
│   │   │   ├── ChatMessage.tsx    # Individual message bubble
│   │   │   ├── ChatInput.tsx      # Textarea + send button
│   │   │   └── QuickChips.tsx     # Suggestion chip buttons
│   │   └── ui/
│   │       ├── Badge.tsx          # Colored pill badges (Active, High Heat Risk)
│   │       ├── LoadingSkeleton.tsx # Shimmer skeleton for loading states
│   │       └── GlassCard.tsx      # Reusable glassmorphism card wrapper
│   ├── store/
│   │   ├── mapStore.ts       # Zustand: selectedTract, hoveredTract, viewState, geojsonData
│   │   └── chatStore.ts      # Zustand: messages[], isLoading, selectedTractContext
│   ├── types/
│   │   ├── api.ts            # Response types matching FastAPI schemas
│   │   └── map.ts            # TractFeature, TractProperties, PredictionResponse
│   ├── hooks/
│   │   ├── useTractData.ts   # Fetch + cache GeoJSON from /api/v1/tracts
│   │   └── useChatScroll.ts  # Auto-scroll chat to bottom on new messages
│   ├── App.tsx               # Root: three-panel layout shell
│   ├── main.tsx              # React DOM mount
│   └── index.css             # @import "tailwindcss" + @theme block
├── vite.config.ts            # Tailwind plugin + /api proxy
├── tsconfig.json
└── index.html                # Google Fonts link tags (DM Sans, IBM Plex Sans, IBM Plex Mono)
```

### Pattern 1: MapLibre Choropleth with GeoJSON Source

**What:** Load all 492 tract polygons as a GeoJSON FeatureCollection, color-fill by `xgb_heat_score` using MapLibre's `interpolate` paint expression.

**When to use:** Any time tract-level heat data needs to be shown as a choropleth overlay.

**Critical rule:** Define `geojsonData` and `fillLayerStyle` OUTSIDE the component or in `useMemo`. MapLibre re-parses the entire source if the data reference changes on every render.

**Example:**
```typescript
// Source: visgl.github.io/react-map-gl/docs/get-started/adding-custom-data
import Map, { Source, Layer } from 'react-map-gl/maplibre';
import type { FillLayer } from 'react-map-gl/maplibre';
import type { FeatureCollection } from 'geojson';

const tractFillLayer: FillLayer = {
  id: 'tract-fill',
  type: 'fill',
  paint: {
    'fill-color': [
      'interpolate', ['linear'],
      ['get', 'xgb_heat_score'],
      0.0,  '#FFE44D',  // yellow — low heat
      0.3,  '#FF8C00',  // orange
      0.6,  '#FF2D2D',  // red
      1.0,  '#8B0000'   // deep crimson — max heat
    ],
    'fill-opacity': [
      'case',
      ['boolean', ['feature-state', 'hover'], false],
      0.85,
      0.65
    ]
  }
};

const tractOutlineLayer: LineLayer = {
  id: 'tract-outline',
  type: 'line',
  paint: {
    'line-color': '#00E5FF',
    'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 0.5],
    'line-opacity': 0.9
  }
};

function HeatMap({ geojsonData }: { geojsonData: FeatureCollection }) {
  return (
    <Map
      mapRef={mapRef}
      initialViewState={{ longitude: -122.2, latitude: 47.5, zoom: 10 }}
      mapStyle="https://api.maptiler.com/maps/dataviz-dark/style.json?key=YOUR_KEY"
      interactiveLayerIds={['tract-fill']}
      onClick={onTractClick}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <Source
        id="tracts"
        type="geojson"
        data={geojsonData}
        generateId={true}
      >
        <Layer {...tractFillLayer} />
        <Layer {...tractOutlineLayer} />
      </Source>
    </Map>
  );
}
```

### Pattern 2: Feature-State Hover (setFeatureState)

**What:** Use MapLibre's `feature-state` system to highlight hovered tracts without triggering a React re-render.

**When to use:** Hover effects on fill layers. Do NOT use React state for this — it causes 60fps re-renders.

**Example:**
```typescript
// Source: maplibre.org/maplibre-gl-js/docs/examples/create-a-hover-effect/
const mapRef = useRef<MapRef>(null);
let hoveredTractId: string | number | null = null;

const onMouseMove = useCallback((event: MapLayerMouseEvent) => {
  if (event.features && event.features.length > 0) {
    const map = mapRef.current?.getMap();
    if (hoveredTractId !== null) {
      map?.setFeatureState({ source: 'tracts', id: hoveredTractId }, { hover: false });
    }
    hoveredTractId = event.features[0].id ?? null;
    if (hoveredTractId !== null) {
      map?.setFeatureState({ source: 'tracts', id: hoveredTractId }, { hover: true });
    }
  }
}, []);

const onMouseLeave = useCallback(() => {
  const map = mapRef.current?.getMap();
  if (hoveredTractId !== null) {
    map?.setFeatureState({ source: 'tracts', id: hoveredTractId }, { hover: false });
    hoveredTractId = null;
  }
}, []);
```

**Note:** `generateId: true` on the Source is required for `setFeatureState` to work with GeoJSON (MapLibre needs integer IDs).

### Pattern 3: Programmatic Camera Fly-To

**What:** Fly the map camera to a location when user clicks a location card in the left sidebar.

**When to use:** Any time the map should navigate programmatically.

**Example:**
```typescript
// Source: visgl.github.io/react-map-gl/docs/get-started/state-management
const mapRef = useRef<MapRef>(null);

function flyToTract(longitude: number, latitude: number) {
  mapRef.current?.flyTo({
    center: [longitude, latitude],
    zoom: 13,
    duration: 1500,
    essential: true
  });
}
```

### Pattern 4: Tract Click → Popup

**What:** On clicking a tract fill layer, fetch that tract's prediction details and show a floating popup anchored to the click location.

**Example:**
```typescript
// Source: visgl.github.io/react-map-gl/docs/api-reference/mapbox/map
const [popupInfo, setPopupInfo] = useState<{
  longitude: number;
  latitude: number;
  tractId: string;
  properties: TractProperties;
} | null>(null);

const onTractClick = useCallback((event: MapLayerMouseEvent) => {
  if (!event.features?.length) return;
  const feature = event.features[0];
  const tractId = feature.properties?.GEOID;
  setPopupInfo({
    longitude: event.lngLat.lng,
    latitude: event.lngLat.lat,
    tractId,
    properties: feature.properties as TractProperties
  });
  // Fetch full predictions for detail panel
  fetchTractPredictions(tractId);
}, [fetchTractPredictions]);

// In JSX:
{popupInfo && (
  <Popup
    longitude={popupInfo.longitude}
    latitude={popupInfo.latitude}
    anchor="bottom-left"
    onClose={() => setPopupInfo(null)}
    closeButton={true}
    offset={12}
  >
    <TractPopup tractId={popupInfo.tractId} properties={popupInfo.properties} />
  </Popup>
)}
```

### Pattern 5: Tailwind CSS v4 Setup (CSS-first)

**What:** v4 replaces `tailwind.config.js` with a CSS `@theme` block and a single `@import`.

**When to use:** All new projects starting 2025+.

**vite.config.ts:**
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    }
  }
});
```

**index.css:**
```css
@import "tailwindcss";

@theme {
  /* Custom colors */
  --color-bg-base: #0A0A0F;
  --color-bg-surface: #12121A;
  --color-bg-elevated: #1A1A26;
  --color-accent-cyan: #00E5FF;
  --color-accent-teal: #00BFA5;
  --color-accent-green: #4CAF50;
  --color-heat-low: #FFE44D;
  --color-heat-high: #8B0000;
  --color-chat-ai: #7C3AED;

  /* Custom fonts */
  --font-display: "DM Sans", sans-serif;
  --font-body: "IBM Plex Sans", sans-serif;
  --font-mono: "IBM Plex Mono", monospace;
}
```

**Dark mode (class-based in v4):**
```css
/* In index.css - declare custom dark variant */
@custom-variant dark (&:is(.dark *));
```

Then add `.dark` class to `<html>` element in `index.html` or `App.tsx`. Since this is dark-only, put `dark` on `<html>` once and never toggle it.

### Pattern 6: Zustand Store Structure

**What:** Single store slice for map state, separate slice for chat state.

**Example:**
```typescript
// Source: zustand.docs.pmnd.rs + verified against v5 API
import { create } from 'zustand';
import { useShallow } from 'zustand/shallow';

interface MapStore {
  selectedTractId: string | null;
  geojsonData: FeatureCollection | null;
  isMapLoading: boolean;
  setSelectedTract: (id: string | null) => void;
  setGeojsonData: (data: FeatureCollection) => void;
}

export const useMapStore = create<MapStore>()((set) => ({
  selectedTractId: null,
  geojsonData: null,
  isMapLoading: true,
  setSelectedTract: (id) => set({ selectedTractId: id }),
  setGeojsonData: (data) => set({ geojsonData: data, isMapLoading: false }),
}));

// Usage — useShallow required for object destructuring in v5:
const { selectedTractId, setSelectedTract } = useMapStore(
  useShallow((s) => ({ selectedTractId: s.selectedTractId, setSelectedTract: s.setSelectedTract }))
);
```

**CRITICAL v5 breaking change:** Object selectors without `useShallow` cause React maximum update depth errors. Always use `useShallow` when destructuring multiple fields.

### Pattern 7: Framer Motion Animations

**What:** Import from `motion/react` (not `framer-motion`) for the latest package. Use AnimatePresence for popup enter/exit and stagger for card lists.

**Example:**
```typescript
// Source: motion.dev/docs/react
import { motion, AnimatePresence } from 'motion/react';

// Popup entrance animation (scale + fade)
<AnimatePresence>
  {showPopup && (
    <motion.div
      key="tract-popup"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15 }}
    >
      {/* popup content */}
    </motion.div>
  )}
</AnimatePresence>

// Chat message slide-in
<motion.div
  initial={{ opacity: 0, y: 12 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2 }}
>
  {/* message bubble */}
</motion.div>

// Staggered location card list
const containerVariants = {
  visible: { transition: { staggerChildren: 0.05 } }
};
const itemVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0 }
};

<motion.ul variants={containerVariants} initial="hidden" animate="visible">
  {locations.map(loc => (
    <motion.li key={loc.id} variants={itemVariants}>
      <LocationCard {...loc} />
    </motion.li>
  ))}
</motion.ul>
```

### Pattern 8: Glassmorphism Cards

**What:** Floating map cards (header card, timeline bar, popup) use backdrop-blur + semi-transparent bg.

**Example (Tailwind v4 classes):**
```tsx
// Glass card component
function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white/5 backdrop-blur-md border border-white/10 rounded-xl shadow-xl ${className}`}>
      {children}
    </div>
  );
}
```

**CSS glowing border for county outline:**
```css
/* Add to index.css — can't do drop-shadow on SVG layers directly, use box-shadow workaround */
.county-glow {
  filter: drop-shadow(0 0 8px #00E5FF) drop-shadow(0 0 20px rgba(0,229,255,0.4));
}
```

### Pattern 9: Chat Auto-Scroll

**What:** Chat container scrolls to bottom on new messages, but only if user hasn't scrolled up.

**Example:**
```typescript
// Source: davelage.com/posts/chat-scroll-react/
const chatEndRef = useRef<HTMLDivElement>(null);
const containerRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const container = containerRef.current;
  const end = chatEndRef.current;
  if (!container || !end) return;

  // Only auto-scroll if user is within 100px of bottom
  const { scrollTop, scrollHeight, clientHeight } = container;
  const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
  if (isNearBottom) {
    end.scrollIntoView({ behavior: 'smooth' });
  }
}, [messages]);

// In JSX:
<div ref={containerRef} className="overflow-y-auto flex-1">
  {messages.map(m => <ChatMessage key={m.id} {...m} />)}
  <div ref={chatEndRef} />
</div>
```

### Pattern 10: Vite Proxy for Backend API

**What:** Vite dev server proxies `/api/*` to `localhost:8000` eliminating CORS in development.

**vite.config.ts server.proxy:**
```typescript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:8000',
      changeOrigin: true
      // No rewrite needed — FastAPI routes are at /api/v1/ already
    }
  }
}
```

Then in `src/api/tracts.ts`:
```typescript
// Use relative URL — Vite proxy handles the redirect
const response = await fetch('/api/v1/tracts');
```

### Anti-Patterns to Avoid

- **Defining GeoJSON inside component render:** Every re-render creates a new object reference, causing MapLibre to re-parse 492 polygons. Define `data` prop via `useMemo` or module-level constant.
- **Using React state for hover effect:** Setting `useState` on mouse move causes 60fps React re-renders. Use `map.setFeatureState()` directly via `mapRef.current.getMap()`.
- **Object selector without useShallow in Zustand v5:** Causes infinite re-render loop. Always wrap multi-field selectors in `useShallow`.
- **Importing from `framer-motion` package name:** The `motion` package (imported as `motion/react`) is the current API. `framer-motion` still works but is the legacy name.
- **Tailwind v4 with `tailwind.config.js`:** v4 does not use `tailwind.config.js` by default. Use CSS `@theme` block. The `darkMode: 'class'` config option is removed — use `@custom-variant dark` in CSS.
- **Loading all 492 tract GeoJSON before map renders:** Fetch asynchronously, show loading state, then set data on the Source. Do not block map initialization.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Map rendering + WebGL choropleth | Custom WebGL canvas or SVG-based map | react-map-gl + MapLibre GL JS | MapLibre handles tile loading, WebGL rendering, zoom/pan, touch events, projection math |
| Animation orchestration with stagger + exit | Custom CSS class toggling | Framer Motion (motion/react) | AnimatePresence handles DOM removal timing; stagger system handles sequencing |
| Feature hover state on map | React `useState` on mouse move | MapLibre `feature-state` + `map.setFeatureState()` | Feature-state updates bypass React render cycle entirely; 0 re-renders per hover move |
| Choropleth color scale | Custom `d3-scale` color function | MapLibre paint expression (`interpolate`) | Server-side color mapping means no client JS; GPU-computed in WebGL shader |
| GeoJSON data fetch + cache | Custom hook with complex state | Simple `useMemo` + `useEffect` fetch | GeoJSON is loaded once at mount; no real-time updates needed; simple fetch suffices |
| Panel state synchronization | Prop drilling or custom event bus | Zustand store | Selected tract must be shared between map, left panel, and chat panel — Zustand avoids 3-level prop drilling |
| Responsive text input in chat | Contenteditable div | `<textarea>` with `rows={1}` + CSS `field-sizing: content` | Native textarea handles keyboard events, paste, IME; `field-sizing: content` enables auto-expand in modern browsers |

**Key insight:** MapLibre's paint expression system (`interpolate`, `step`, `feature-state`) handles most visual computation on the GPU. Hand-rolling color mapping in JavaScript and re-rendering to SVG would be 10-100x slower and lose smooth zoom/pan.

---

## Common Pitfalls

### Pitfall 1: GeoJSON Source Object Reference Instability

**What goes wrong:** The choropleth flickers or re-parses on every React state update, causing visible reloads.

**Why it happens:** Passing an inline object literal `data={{ ... }}` or inline array to the `data` prop creates a new reference on every render. MapLibre detects data change and re-tiles the entire source.

**How to avoid:** Store GeoJSON in Zustand state (a stable reference) or define it with `useMemo`. Only update the store once after the initial fetch.

**Warning signs:** Network tab shows `/api/v1/tracts` called repeatedly; map flickers when typing in chat input.

### Pitfall 2: Zustand v5 Object Selector Without useShallow

**What goes wrong:** React throws "Maximum update depth exceeded" error.

**Why it happens:** In v5, the `useStore(selector, equalityFn)` signature was removed. Returning a new object from a selector without shallow comparison causes infinite re-renders.

**How to avoid:** Always use `useShallow` from `'zustand/shallow'` when destructuring multiple fields:
```typescript
const { a, b } = useMyStore(useShallow(s => ({ a: s.a, b: s.b })));
```

**Warning signs:** Immediate crash in development with "Maximum update depth" in console.

### Pitfall 3: MapTiler API Key Missing → Map Fails to Load

**What goes wrong:** Map renders a blank/gray canvas with no tiles.

**Why it happens:** The MapTiler style URL requires a valid API key as a query parameter. Without it, all tile requests return 401.

**How to avoid:** Get a free MapTiler API key at maptiler.com/cloud. Store in `.env.local` as `VITE_MAPTILER_KEY`. Reference as `import.meta.env.VITE_MAPTILER_KEY`.

**Warning signs:** Browser network tab shows 401 on `api.maptiler.com` requests.

### Pitfall 4: Tailwind v4 Dark Mode Not Working

**What goes wrong:** `dark:bg-slate-900` classes have no effect.

**Why it happens:** Tailwind v4 removes `darkMode: 'class'` from config. The custom variant must be declared in CSS.

**How to avoid:** Add to `index.css`:
```css
@custom-variant dark (&:is(.dark *));
```
Then ensure `<html>` has class `dark` (or `document.documentElement.classList.add('dark')`).

**Warning signs:** Dark-prefixed classes in DevTools show no matching rules.

### Pitfall 5: react-map-gl Import from Wrong Endpoint

**What goes wrong:** TypeScript errors about incompatible types, or `mapbox-gl` package not found error.

**Why it happens:** Default `import Map from 'react-map-gl'` uses the Mapbox endpoint and requires `mapbox-gl` as a peer dep. Using `react-map-gl/maplibre` avoids this.

**How to avoid:** Always import from `react-map-gl/maplibre`:
```typescript
import Map, { Source, Layer, Popup, NavigationControl } from 'react-map-gl/maplibre';
import type { MapRef, MapLayerMouseEvent, FillLayer, LineLayer } from 'react-map-gl/maplibre';
```

**Warning signs:** Error: "Cannot find module 'mapbox-gl'" or type errors about `mapboxgl.Map`.

### Pitfall 6: feature-state Not Working Without generateId

**What goes wrong:** Hover highlight doesn't appear. `setFeatureState` silently fails.

**Why it happens:** MapLibre's feature-state system requires each feature to have a numeric `id` field. GeoJSON features from the API don't have `id` by default.

**How to avoid:** Add `generateId={true}` to the Source component. This auto-assigns sequential integer IDs based on feature index.

**Warning signs:** No hover effect; browser console shows "Feature id: undefined" in setFeatureState.

### Pitfall 7: GeoJSON Payload Size (5–15 MB)

**What goes wrong:** Initial page load hangs; map layers appear after several seconds.

**Why it happens:** `/api/v1/tracts` returns full GeoJSON with unsimplified polygon geometries for 492 tracts. Backend uses `ST_Simplify` but the payload may still be large.

**How to avoid:** Fetch GeoJSON in a `useEffect` at mount. Show a loading skeleton/spinner on the map area. Once loaded, set into Zustand and pass as `data` prop. The API's existing `ST_Simplify` should keep payload manageable.

**Warning signs:** Network tab shows `/api/v1/tracts` response >5 MB; React DevTools shows map component mounting before data arrives.

### Pitfall 8: Chat Panel POST Body Format

**What goes wrong:** `POST /api/v1/chat` returns 422 Unprocessable Entity.

**Why it happens:** The FastAPI chat endpoint expects a specific request body schema (message string + optional list of tract IDs with scores). Frontend must match the Pydantic model exactly.

**How to avoid:** Inspect the backend schema at `localhost:8000/docs` (FastAPI auto-docs). The chat endpoint accepts:
```json
{
  "message": "Why is this tract high risk?",
  "selected_tracts": [
    { "tract_id": "53033...", "xgb_heat_score": 0.87, "tf_risk_score": 0.79, "xgb_risk_score": 0.82 }
  ]
}
```
Type the request body in `src/api/chat.ts` to match FastAPI's schema.

**Warning signs:** 422 response in browser Network tab; FastAPI logs show validation error.

---

## Code Examples

Verified patterns from official sources:

### MapLibre Source with generateId + Feature-State Paint
```typescript
// Source: maplibre.org/maplibre-gl-js/docs/examples/create-a-hover-effect/
// + visgl.github.io/react-map-gl/docs/get-started/adding-custom-data
<Source
  id="tracts"
  type="geojson"
  data={geojsonData}       // FeatureCollection from Zustand (stable reference)
  generateId={true}        // Required: assigns integer id to each feature for feature-state
>
  <Layer
    id="tract-fill"
    type="fill"
    paint={{
      'fill-color': [
        'interpolate', ['linear'], ['get', 'xgb_heat_score'],
        0.0, '#FFE44D',
        0.33, '#FF8C00',
        0.66, '#FF2D2D',
        1.0, '#8B0000'
      ],
      'fill-opacity': [
        'case',
        ['boolean', ['feature-state', 'hover'], false], 0.9,
        ['boolean', ['feature-state', 'selected'], false], 0.85,
        0.65
      ]
    }}
  />
</Source>
```

### Tailwind v4 Complete Setup (vite.config.ts + index.css)
```typescript
// vite.config.ts
// Source: tailwindcss.com/blog/tailwindcss-v4
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true }
    }
  }
});
```

```css
/* index.css */
/* Source: tailwindcss.com/blog/tailwindcss-v4 */
@import "tailwindcss";
@custom-variant dark (&:is(.dark *));

@theme {
  --font-display: "DM Sans", sans-serif;
  --font-body: "IBM Plex Sans", sans-serif;
  --font-mono: "IBM Plex Mono", monospace;
  --color-bg-base: #0A0A0F;
  --color-bg-surface: #12121A;
  --color-bg-elevated: #1A1A26;
  --color-accent-cyan: #00E5FF;
  --color-accent-teal: #00BFA5;
  --color-suitability-high: #4CAF50;
  --color-suitability-med: #FFC107;
  --color-suitability-low: #F44336;
}
```

### Zustand Store (v5 TypeScript)
```typescript
// Source: zustand.docs.pmnd.rs/migrations/migrating-to-v5
import { create } from 'zustand';
import { useShallow } from 'zustand/shallow';
import type { FeatureCollection } from 'geojson';

interface MapState {
  geojsonData: FeatureCollection | null;
  selectedTractId: string | null;
  isLoading: boolean;
  setGeojsonData: (d: FeatureCollection) => void;
  setSelectedTractId: (id: string | null) => void;
}

export const useMapStore = create<MapState>()((set) => ({
  geojsonData: null,
  selectedTractId: null,
  isLoading: true,
  setGeojsonData: (d) => set({ geojsonData: d, isLoading: false }),
  setSelectedTractId: (id) => set({ selectedTractId: id }),
}));

// Always use useShallow for object destructuring:
const { geojsonData, selectedTractId } = useMapStore(
  useShallow((s) => ({ geojsonData: s.geojsonData, selectedTractId: s.selectedTractId }))
);
```

### Three-Panel Layout Shell (Tailwind v4 + dark mode)
```tsx
// App.tsx
export default function App() {
  return (
    <div className="bg-[#0A0A0F] h-screen w-screen flex flex-col overflow-hidden dark">
      <AppHeader className="h-14 shrink-0" />
      <div className="flex flex-1 overflow-hidden">
        <LeftSidebar className="w-[280px] shrink-0 overflow-y-auto" />
        <main className="flex-1 relative overflow-hidden">
          <HeatMap />
        </main>
        <RightChatPanel className="w-[340px] shrink-0 overflow-y-auto" />
      </div>
    </div>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tailwind.config.js` + `@tailwind directives` | CSS `@import "tailwindcss"` + `@theme {}` block | Jan 2025 (v4.0) | No JS config needed; faster builds |
| `import { motion } from 'framer-motion'` | `import { motion } from 'motion/react'` | 2024 (Motion renamed) | Same API, lighter bundle; framer-motion still works as alias |
| Mapbox GL JS (paid token required) | MapLibre GL JS (fully open-source) | 2021 (MapLibre fork) | No token required for tiles from MapTiler/Stadia; free for dev |
| `import Map from 'react-map-gl'` | `import Map from 'react-map-gl/maplibre'` | Jan 2025 (v8.0) | No mapbox-gl peer dep; proper MapLibre TypeScript types |
| Zustand `useStore(selector, shallow)` | `useStore(useShallow(selector))` | 2024 (v5.0) | Breaking change; `shallow` param removed from useStore signature |
| ChoroplethOverlay (built-in) | Custom Source + Layer with paint expression | 2019+ | ChoroplethOverlay removed from react-map-gl; use native MapLibre layers |
| Mapbox darkV10 style | MapTiler `dataviz-dark` or `streets-dark` style | 2022+ | Free alternative to Mapbox-gated styles |

**Deprecated/outdated:**
- `LinearInterpolator` / `FlyToInterpolator` from react-map-gl: removed; use `mapRef.current.flyTo()` directly
- `darkMode: 'class'` in tailwind.config.js: removed from v4; use `@custom-variant`
- `import Map from 'react-map-gl'` without subpath: works but uses Mapbox endpoint and requires mapbox-gl

---

## Open Questions

1. **MapTiler API Key Access**
   - What we know: MapTiler free tier provides dark styles (`dataviz-dark`, `streets-dark`); free registration required
   - What's unclear: Whether the user has a MapTiler account or prefers Stadia Maps (equally free, `alidade_smooth_dark` style)
   - Recommendation: Use MapTiler `dataviz-dark` as the default. Document the `.env.local` variable `VITE_MAPTILER_KEY=YOUR_KEY` in a `README_FRONTEND.md`. Planner should create a Wave 0 task to set this up.

2. **Exact FastAPI Chat Request Schema**
   - What we know: Chat endpoint accepts message + selected tract context (from Phase 4 implementation)
   - What's unclear: Exact field names and optional/required status of `selected_tracts` array
   - Recommendation: Consult `localhost:8000/docs` OpenAPI spec during implementation. Add a task to type the chat request body from the live spec.

3. **Actual GeoJSON Payload Size**
   - What we know: 492 tracts with `ST_Simplify` applied; backend uses `tolerance=0.001` (from Phase 2)
   - What's unclear: Whether payload is under the 5 MB smooth-loading threshold
   - Recommendation: The planner should include a task to measure the `/api/v1/tracts` response size and add tile-based fallback only if >8 MB.

4. **Timeline Slider Behavior**
   - What we know: CONTEXT.md marks this as Claude's discretion
   - Recommendation: Make it cosmetic in v1.1 — the slider updates a year label and re-colors a gradient track, but does NOT trigger API calls. Connecting to `/simulations/what-if` is v1.2 scope.

---

## Sources

### Primary (HIGH confidence)
- `react-map-gl` v8.1 docs (visgl.github.io/react-map-gl) — choropleth GeoJSON pattern, interactiveLayerIds + onClick API, MapLibre import endpoint
- MapLibre GL JS v5 docs (maplibre.org) — feature-state hover effect, setFeatureState, generateId
- Tailwind CSS v4 official blog (tailwindcss.com/blog/tailwindcss-v4) — CSS-first config, @theme block, @tailwindcss/vite plugin, dark mode @custom-variant
- Zustand v5 docs (zustand.docs.pmnd.rs) — store creation, useShallow requirement, v5 breaking changes
- Motion official docs (motion.dev/docs/react) — AnimatePresence, stagger, motion/react import path

### Secondary (MEDIUM confidence)
- MapTiler docs (docs.maptiler.com) — MapLibre React integration, free API key, dark style URLs
- Vite docs (vite.dev/config/server-options) — server.proxy configuration for CORS
- MapLibre large data guide (maplibre.org/maplibre-gl-js/docs/guides/large-data/) — GeoJSON performance optimization strategies

### Tertiary (LOW confidence)
- Community blog posts on chat auto-scroll patterns (davelage.com) — scroll-to-bottom with near-bottom detection
- Community guides on Tailwind v4 dark mode (webxlearner.com, medium.com) — @custom-variant usage in v4 projects

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — react-map-gl v8.1, MapLibre v5.19, Tailwind v4, Zustand v5.0.11, Framer Motion 12.34.3 all verified from official sources or npm
- Architecture: HIGH — three-panel layout, Vite proxy, feature-state pattern all verified from official docs
- Pitfalls: HIGH — Zustand v5 useShallow, Tailwind v4 dark mode, generateId, import endpoint pitfalls all confirmed by official migration guides
- MapTiler tile provider: MEDIUM — free tier confirmed, specific dark style name verified from docs; API key registration is a manual step
- Chat schema: MEDIUM — FastAPI schema visible at /docs but exact field names not pinned here

**Research date:** 2026-02-28
**Valid until:** 2026-04-28 (30 days; all libraries are stable, not fast-moving at patch level)
