# Urban HeatAI — Design System

Universal style reference for all UI work in this app. Every component, layout, and new feature should align to these specs.

---

## Color Palette

### Background Surfaces
| Token | Value | Usage |
|-------|-------|-------|
| `bg-base` | `#1A1A1A` | App root, fullscreen backgrounds |
| `bg-surface` | `#222222` | Sidebars, header, panel surfaces |
| `bg-elevated` | `#2A2A2A` | Cards, modals, dropdowns on surfaces |
| `bg-overlay` | `rgba(34,34,34,0.92)` | GlassCard backdrop (see below) |

### Accent Colors
| Token | Value | Usage |
|-------|-------|-------|
| `accent-cyan` | `#00E5FF` | Primary action labels, interactive highlights, key data values |
| `accent-teal` | `#00BFA5` | Secondary accents, active state borders, city highlights |
| `accent-blue` | `#1E88E5` | Selected zone outline on map |
| `accent-dark-red` | `#B71C1C` | City boundary outline on map |

### Heat Gradient (map fill, risk indicators)
| Token | Value | Usage |
|-------|-------|-------|
| `heat-low` | `#388E3C` | 0.0 risk score — green, low heat |
| `heat-low-mid` | `#8BC34A` | 0.25 risk |
| `heat-mid` | `#FFF176` | 0.5 risk — yellow warning |
| `heat-high` | `#FB8C00` | 0.75 risk — orange |
| `heat-extreme` | `#BF360C` | 1.0 risk — deep red |

### Semantic Risk / Status Colors
| Token | Value | Usage |
|-------|-------|-------|
| `risk-low` | `#4CAF50` | Low heat badge, tree coverage good |
| `risk-moderate` | `#FFC107` | Moderate heat badge |
| `risk-high` | `#FF5722` | High heat badge |
| `risk-extreme` | `#F44336` | Extreme heat badge |

### Text Colors
| Token | Value | Usage |
|-------|-------|-------|
| `text-primary` | `#E5E7EB` | All primary labels, headings |
| `text-secondary` | `rgba(229,231,235,0.55)` | Secondary metadata |
| `text-muted` | `rgba(229,231,235,0.30)` | Captions, disabled text |
| `text-dim` | `rgba(229,231,235,0.15)` | Background labels, section dividers |

### Borders & Dividers
| Token | Value | Usage |
|-------|-------|-------|
| `border-subtle` | `rgba(255,255,255,0.06)` | Section dividers inside panels |
| `border-default` | `rgba(255,255,255,0.10)` | Panel edges, card borders |
| `border-strong` | `rgba(255,255,255,0.18)` | Active state borders, selected items |

---

## Typography

### Families
| Role | Family | CSS |
|------|--------|-----|
| Display / Headings | DM Sans | `"DM Sans", sans-serif` |
| Body / UI text | IBM Plex Sans | `"IBM Plex Sans", sans-serif` |
| Data / Metrics | IBM Plex Mono | `"IBM Plex Mono", monospace` |

### Type Scale
| Role | Size | Weight | Family |
|------|------|--------|--------|
| Section heading | `0.95rem` | 700 | DM Sans |
| Card title | `0.88–0.92rem` | 700 | DM Sans |
| Body text | `0.8rem` | 400 | IBM Plex Sans |
| Small label | `0.72–0.78rem` | 400–600 | IBM Plex Sans |
| Data value (large) | `1rem` | 700 | IBM Plex Mono |
| Data value (small) | `0.72–0.74rem` | 600 | IBM Plex Mono |
| Caption / eyebrow | `0.57–0.65rem` | 400–700 | IBM Plex Sans / Mono |

### Eyebrow Labels (section headers inside cards)
- All caps: `textTransform: 'uppercase'`
- Letter spacing: `0.08–0.10em`
- Color: `rgba(229,231,235,0.28)`
- Weight: 700, size: `0.57–0.62rem`

---

## GlassCard Component

The base surface for all floating UI panels, overlays, and info cards.

```
background:        rgba(34, 34, 34, 0.92)
backdrop-filter:   blur(16px)
border:            1px solid rgba(255,255,255,0.10)
border-radius:     14px
box-shadow:        0 8px 32px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.05)
```

Use `GlassCard` from `src/components/ui/GlassCard.tsx` — never hard-code these styles inline. Pass a `style` prop for padding and layout overrides.

---

## Spacing

| Name | Value | Usage |
|------|-------|-------|
| xs | 4px | Icon gaps, tight inline spacing |
| sm | 8px | Inner padding, small gaps |
| md | 12–14px | Card padding, section gaps |
| lg | 16px | Header padding |
| xl | 24px | Section separation |

---

## Badges / Pills

```
border-radius:  20px
padding:        2px 8–9px
font-size:      0.65–0.68rem
font-weight:    600
```

Always use a background derived from the semantic color at 12–20% opacity, with a border at 27% opacity (`color + '44'` hex suffix):
```
background: rgba(R, G, B, 0.15)
border:     1px solid rgba(R, G, B, 0.27)
color:      full opaque accent color
```

---

## Buttons

### Primary action (e.g., Reset View)
```
color:         #00E5FF (accent-cyan)
background:    none (transparent — inherits GlassCard or surface)
border:        none
font-size:     0.78rem, weight 600
font-family:   IBM Plex Sans
cursor:        pointer
padding:       7px 14px
```

### Accent button (e.g., toggle, Heatmap)
```
background:    rgba(0,229,255,0.12)
color:         #00E5FF
border:        1px solid rgba(0,229,255,0.30)
border-radius: 8px
padding:       4px 12px
font-size:     0.75rem, weight 600
```

---

## Map Layer Z-Index (absolute overlay stack within map container)

| Layer | z-index | Notes |
|-------|---------|-------|
| Map canvas | 0 | Base |
| Timeline slider | 5 | Bottom overlay, full-width |
| Reset View button | 10 | Top-left, always visible |
| Loading overlay | 10 | Centered, pointer-events none |
| Popups / TractPopup | 20 | React-map-gl managed |

---

## Map Layer Colors

| Layer | Color | Notes |
|-------|-------|-------|
| Tract fill | heat gradient (green→red) | Interpolated on `display_risk` |
| Tract border | `rgba(255,255,255,0.12)`, 0.4px | Subtle grid |
| City fill tint | `rgba(183,28,28,0.06)` | Low-opacity fill for selected city |
| City outline | `#B71C1C`, 2px | Dark red border for city limits |
| Selected zone outline | `#1E88E5`, 3.5px | Blue, clearly distinct from city |
| County border | see `CountyBorderLayer` | White/dim outer county edge |

---

## Panel Layout

```
App root:         flex column, h-screen, bg #1A1A1A
Header:           h-14, bg #222222, border-b rgba(255,255,255,0.10)
Left sidebar:     280px wide, shrink-0, bg #222222, border-r rgba(255,255,255,0.10)
Map area:         flex-1, relative, overflow hidden
Right chat panel: 340px wide, shrink-0, border-l rgba(255,255,255,0.10)
```

---

## Animation Conventions

- **Panel transitions**: `duration: 0.15–0.20s`, slide X ±24px + fade opacity 0→1
- **Map fly-to**: `duration: 900ms`, `essential: true`
- **Stagger list items**: `staggerChildren: 0.03s`, `delayChildren: 0.04s`
- **Hover state transitions**: `transition: background 0.15s, border-color 0.15s`

---

## Icon Library

Use **lucide-react** exclusively. Common icons in use:
- `Grid3x3` — app logo
- `Search` — search inputs
- `MapPin` — location / city
- `ChevronRight` — list item arrow
- `ArrowLeft` — back navigation
- `Layers` — region/layer UI
- `Home` — Reset View button

Icon sizes: `13–14px` for inline UI; `20px` for header/logo.

---

## Do's and Don'ts

**Do:**
- Use `GlassCard` for every floating overlay on the map
- Use DM Sans for all headings and city/zone names
- Use IBM Plex Mono for all numeric data values
- Pin map overlays with `position: absolute` + explicit `zIndex` + `left`/`top` offsets anchored away from edges

**Don't:**
- Hard-code dark navy (`#12121A`) — use grey bg-base/surface tokens instead
- Use `transform: translateX(-50%)` for centered overlays that could clip near the sidebar
- Add rotation or pitch controls to the map (dragRotate and touchPitch are disabled)
- Clear the tract selection when resetting the map view
