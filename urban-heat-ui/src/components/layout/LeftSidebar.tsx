import { useState, useMemo, useEffect } from 'react'
import { Search, MapPin, ChevronRight, ArrowLeft, Layers, Leaf, Thermometer, Users, Droplets, Building2, Zap, Wind, ShieldAlert, Home } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { useShallow } from 'zustand/shallow'
import type { FeatureCollection } from 'geojson'
import { useMapStore } from '../../store/mapStore'
import { fetchTractDetail } from '../../api/tracts'
import { mapRef } from '../map/HeatMap'
import { formatCensusTract } from '../map/TractPopup'
import type { RankedTract, TractDetail } from '../../types/api'

// ─── Animation variants ────────────────────────────────────────────────────
const slideLeft = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.2 } },
  exit:    { opacity: 0, x: 24, transition: { duration: 0.15 } },
}
const slideRight = {
  initial: { opacity: 0, x: -24 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.2 } },
  exit:    { opacity: 0, x: -24, transition: { duration: 0.15 } },
}
const staggerList = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.03, delayChildren: 0.04 } },
}
const staggerItem = {
  hidden:  { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.18 } },
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function getHeatLabel(score: number): { label: string; color: string; bg: string } {
  if (score >= 0.85) return { label: 'Extreme Heat',  color: '#FF5722', bg: 'rgba(255,87,34,0.18)' }
  if (score >= 0.66) return { label: 'High Heat',     color: '#FB8C00', bg: 'rgba(251,140,0,0.18)' }
  if (score >= 0.33) return { label: 'Moderate Heat', color: '#FFC107', bg: 'rgba(255,193,7,0.18)' }
  return                      { label: 'Low Heat',    color: '#66BB6A', bg: 'rgba(102,187,106,0.18)' }
}

function getZoning(imperv: number | null): string {
  if (imperv == null) return 'Unknown'
  if (imperv >= 70)   return 'Dense Urban'
  if (imperv >= 40)   return 'Mixed-Use'
  if (imperv >= 15)   return 'Low-Density Residential'
  return 'Natural / Suburban'
}

function normalizedRisk(t: Pick<RankedTract, 'display_risk'>): number {
  return t.display_risk * 10
}

function fmt(val: number | null | undefined, decimals = 1, suffix = ''): string {
  if (val == null) return '—'
  return `${val.toFixed(decimals)}${suffix}`
}

function distWaterFmt(d: number | null | undefined): string {
  if (d == null) return '—'
  return d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`
}

// Compute bounding box for all tracts in a city from geojsonData
function getCityBbox(
  geojsonData: FeatureCollection | null,
  cityName: string,
): [[number, number], [number, number]] | null {
  if (!geojsonData) return null
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity
  let found = false
  for (const feature of geojsonData.features) {
    if ((feature.properties as Record<string, unknown>)?.city_name !== cityName) continue
    found = true
    collectCoords(feature.geometry, (lng, lat) => {
      if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat
    })
  }
  if (!found || !isFinite(minLng)) return null
  return [[minLng, minLat], [maxLng, maxLat]]
}

// Compute bounding box for a single tract's geometry from geojsonData
function getTractBbox(
  geojsonData: FeatureCollection | null,
  tractId: string,
): [[number, number], [number, number]] | null {
  if (!geojsonData) return null
  const feature = geojsonData.features.find(
    (f) => (f.properties as Record<string, unknown>)?.tract_id === tractId,
  )
  if (!feature?.geometry) return null
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity
  collectCoords(feature.geometry, (lng, lat) => {
    if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat
  })
  if (!isFinite(minLng)) return null
  return [[minLng, minLat], [maxLng, maxLat]]
}

function collectCoords(
  geom: unknown,
  cb: (lng: number, lat: number) => void,
): void {
  if (!geom || typeof geom !== 'object') return
  const g = geom as { type?: string; coordinates?: unknown; geometries?: unknown[] }
  if (g.coordinates) walkCoords(g.coordinates, cb)
  if (g.geometries) g.geometries.forEach((sub) => collectCoords(sub, cb))
}

function walkCoords(c: unknown, cb: (lng: number, lat: number) => void): void {
  if (!Array.isArray(c)) return
  if (typeof c[0] === 'number') { cb(c[0] as number, c[1] as number); return }
  c.forEach((sub) => walkCoords(sub, cb))
}

// ─── Contractor Recommendations ────────────────────────────────────────────

interface Intervention {
  Icon: LucideIcon
  title: string
  detail: string
  priority: 'critical' | 'high' | 'medium'
}

const PRIORITY_COLOR: Record<Intervention['priority'], string> = {
  critical: '#F44336',
  high: '#FF8C00',
  medium: '#FFC107',
}

function getInterventions(
  detail: TractDetail,
  treeCovScore: number | null,
  displayRisk: number,
): Intervention[] {
  const items: Intervention[] = []

  if (treeCovScore != null && treeCovScore < 5) {
    items.push({
      Icon: Leaf,
      title: 'Urban Tree Canopy Expansion',
      detail: `County rank ${treeCovScore.toFixed(1)}/10. Plant street trees every 25 ft along primary corridors and require green roofs on new commercial builds. Target 30%+ canopy — each 10% increase cuts ambient temp by ~1.5°F and reduces AC energy demand 5–10%.`,
      priority: treeCovScore < 2.5 ? 'critical' : 'high',
    })
  }

  if (detail.mean_imperv != null && detail.mean_imperv > 45) {
    const extreme = detail.mean_imperv > 70
    items.push({
      Icon: Building2,
      title: extreme ? 'Permeable Pavement & Bioswales' : 'Cool Pavement Retrofit',
      detail: `${detail.mean_imperv.toFixed(0)}% impervious — ${extreme ? 'critical' : 'elevated'} heat retention. ${extreme ? 'Convert 25–35% of parking lots to permeable pavers; line stormwater channels with vegetated bioswales to reduce runoff heat and surface albedo.' : 'Apply high-albedo reflective coatings to roads and parking (SRI ≥ 29). Target ≤50% imperviousness to meaningfully lower peak surface temps.'}`,
      priority: extreme ? 'critical' : 'high',
    })
  }

  if (detail.mean_afternoon_temp != null && detail.mean_afternoon_temp > 88) {
    items.push({
      Icon: Thermometer,
      title: 'Shade Structure Installation',
      detail: `Surface temp ${detail.mean_afternoon_temp.toFixed(1)}°F — exceeds safe pedestrian threshold. Install tensile shade canopies at bus stops, school drop-off zones, plazas, and pedestrian crossings. Prioritize routes used by elderly and school-age residents. Shade structures reduce perceived temp by 10–15°F.`,
      priority: detail.mean_afternoon_temp > 97 ? 'critical' : 'high',
    })
  }

  if (detail.mean_svi_overall != null && detail.mean_svi_overall > 0.55) {
    items.push({
      Icon: Users,
      title: 'Accessible Cooling Infrastructure',
      detail: `${Math.round(detail.mean_svi_overall * 100)}th SVI percentile. Open ADA-compliant cooling centers within 0.5 mi of every residential block during heat alerts. Partner with Public Health – Seattle & King County for automated robo-call alerts to registered vulnerable residents and multilingual outreach.`,
      priority: detail.mean_svi_overall > 0.75 ? 'critical' : 'high',
    })
  }

  if (detail.mean_dist_water != null && detail.mean_dist_water > 1200) {
    items.push({
      Icon: Droplets,
      title: 'Water Feature & Misting Network',
      detail: `Nearest water ${(detail.mean_dist_water / 1000).toFixed(1)} km away — no passive evaporative cooling. Install misting stations along pedestrian corridors (effective radius ~30 ft, drops ambient temp 5–8°F). Construct retention ponds or splash pads in parks to provide long-duration cooling benefits.`,
      priority: detail.mean_dist_water > 2500 ? 'high' : 'medium',
    })
  }

  if (detail.mean_life_expectancy != null && detail.mean_life_expectancy < 76) {
    items.push({
      Icon: ShieldAlert,
      title: 'Heat-Health Emergency Protocol',
      detail: `Life expectancy ${detail.mean_life_expectancy.toFixed(1)} yrs — significantly below KC average. Develop a tract-level heat emergency action plan with KC EMS: define temperature thresholds for automatic alert, pre-position cooling supply kits, and schedule door-to-door wellness checks for seniors during heat events exceeding 3 consecutive days.`,
      priority: 'critical',
    })
  }

  if (detail.mean_imperv != null && detail.mean_imperv > 60 && treeCovScore != null && treeCovScore < 3) {
    items.push({
      Icon: Wind,
      title: 'Urban Ventilation Corridors',
      detail: `Dense urban form (${detail.mean_imperv.toFixed(0)}% imperv, canopy ${treeCovScore.toFixed(1)}/10) blocks natural airflow. Design N–S green corridors aligned with prevailing Puget Sound sea breeze to channel cool marine air into heat-trapped blocks. Reference Seattle's Green Factor scoring system for implementation.`,
      priority: 'high',
    })
  }

  // Income-targeted cooling — always relevant for moderate+ risk tracts
  if (displayRisk >= 0.35 && items.length < 4) {
    items.push({
      Icon: Home,
      title: 'Weatherization & Cooling Assistance',
      detail: 'Apply for King County Weatherization Plus Health funding to install AC units, attic insulation, reflective window film, and duct sealing in qualifying homes. Program covers up to $10,000 per unit — prioritize multi-family buildings in this tract that lack central cooling.',
      priority: 'medium',
    })
  }

  // Cool roofing mandate — always useful for high-risk zones
  if (displayRisk >= 0.5 && items.length < 4) {
    items.push({
      Icon: Zap,
      title: 'Cool Roof Mandate',
      detail: 'Require cool-roof materials (SRI ≥ 78) on all new construction and major re-roofing permits. White membrane and light-colored metal roofs reduce rooftop surface temps by 50–60°F, cutting building cooling loads 10–15% and reducing the surrounding urban heat island effect.',
      priority: 'high',
    })
  }

  // Minimum 3 — add universal best-practice items to fill
  if (items.length < 3) {
    items.push({
      Icon: Leaf,
      title: 'Green Stormwater Infrastructure',
      detail: 'Install rain gardens, tree pits with structural soil cells, and vegetated swales along residential streets. Green stormwater infrastructure reduces runoff volumes 30–70%, lowers adjacent surface temps 3–5°F, and improves air quality — all with lower lifecycle cost than traditional grey infrastructure.',
      priority: 'medium',
    })
  }
  if (items.length < 3) {
    items.push({
      Icon: Users,
      title: 'Community Heat Preparedness Program',
      detail: 'Establish a neighborhood-level heat emergency network: train block captains in heat illness recognition, distribute free cooling kits (thermometers, electrolyte packets, shade cloth), and set up a buddy system for checking on isolated seniors and individuals with disabilities during heat events.',
      priority: 'medium',
    })
  }

  return items.slice(0, 6)
}

function SidebarInterventionCard({ item }: { item: Intervention }) {
  const bar = PRIORITY_COLOR[item.priority]
  return (
    <div style={{
      borderLeft: `3px solid ${bar}`,
      paddingLeft: '10px',
      padding: '7px 0 7px 10px',
      marginBottom: '9px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '3px' }}>
        <item.Icon size={13} style={{ color: bar, flexShrink: 0 }} />
        <div style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '0.78rem', color: '#E8EBF2' }}>
          {item.title}
        </div>
        <span style={{
          marginLeft: 'auto', flexShrink: 0,
          fontSize: '0.57rem', fontWeight: 700, color: bar,
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          {item.priority}
        </span>
      </div>
      <div style={{ fontSize: '0.67rem', color: 'rgba(232,235,242,0.55)', lineHeight: 1.55, paddingLeft: '20px' }}>
        {item.detail}
      </div>
    </div>
  )
}

// ─── Region card (View 1) ──────────────────────────────────────────────────
interface RegionCardProps {
  city: string
  tracts: RankedTract[]
  onClick: () => void
}

function RegionCard({ city, tracts, onClick }: RegionCardProps) {
  const avgRisk = tracts.reduce((s, t) => s + t.display_risk, 0) / tracts.length
  const heat = getHeatLabel(avgRisk)

  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        background: '#1C1F2A',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '8px',
        padding: '10px 12px',
        margin: '0 0 6px',
        cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.background = '#252836'
        el.style.borderColor = 'rgba(255,255,255,0.13)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.background = '#1C1F2A'
        el.style.borderColor = 'rgba(255,255,255,0.07)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
            <div style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '0.88rem', color: '#E8EBF2' }}>
              {city}
            </div>
            <span style={{
              background: heat.bg, color: heat.color,
              border: `1px solid ${heat.color}55`,
              borderRadius: '20px', padding: '1px 8px',
              fontSize: '0.65rem', fontWeight: 600,
            }}>
              {heat.label}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.72rem', color: 'rgba(232,235,242,0.45)' }}>
              {tracts.length} zone{tracts.length !== 1 ? 's' : ''}
            </span>
            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.72rem', color: 'rgba(232,235,242,0.45)' }}>
              Risk {(avgRisk * 10).toFixed(1)}/10
            </span>
          </div>
        </div>
        <ChevronRight size={14} style={{ color: 'rgba(232,235,242,0.25)', flexShrink: 0, marginLeft: '8px' }} />
      </div>
    </button>
  )
}

// ─── Sub-zone card (View 2) ────────────────────────────────────────────────
interface ZoneCardProps {
  tract: RankedTract
  isActive: boolean
  onClick: () => void
}

function ZoneCard({ tract, isActive, onClick }: ZoneCardProps) {
  const heat = getHeatLabel(tract.display_risk)
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        background: isActive ? 'rgba(255,107,107,0.10)' : 'transparent',
        borderLeft: isActive ? '2px solid #FF6B6B' : '2px solid transparent',
        borderRadius: '0 8px 8px 0',
        padding: '9px 12px',
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'
      }}
      onMouseLeave={(e) => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '0.83rem', color: '#E8EBF2', marginBottom: '2px' }}>
            {formatCensusTract(tract.tract_id)}
            {isActive && (
              <span style={{
                marginLeft: '7px',
                background: 'rgba(76,175,80,0.18)', color: '#4CAF50',
                border: '1px solid rgba(76,175,80,0.35)',
                borderRadius: '10px', padding: '0 6px',
                fontSize: '0.6rem', fontWeight: 600,
              }}>Active</span>
            )}
          </div>
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.7rem', color: 'rgba(232,235,242,0.38)' }}>
            {tract.tract_id}
          </div>
        </div>
        <span style={{
          background: heat.bg, color: heat.color,
          borderRadius: '10px', padding: '2px 8px',
          fontSize: '0.68rem', fontWeight: 600, flexShrink: 0,
        }}>
          {Math.round(tract.display_risk * 100)}
        </span>
      </div>
    </button>
  )
}

// ─── Sidebar ───────────────────────────────────────────────────────────────
export function LeftSidebar() {
  const [search, setSearch] = useState('')
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)

  const {
    rankedTracts,
    isRankedLoading,
    selectedTractId,
    setSelectedTractId,
    tractDetail,
    isTractDetailLoading,
    setTractDetail,
    setTractDetailLoading,
    setPopupInfo,
    setSelectedCityName,
    geojsonData,
  } = useMapStore(
    useShallow((s) => ({
      rankedTracts: s.rankedTracts,
      isRankedLoading: s.isRankedLoading,
      selectedTractId: s.selectedTractId,
      setSelectedTractId: s.setSelectedTractId,
      tractDetail: s.tractDetail,
      isTractDetailLoading: s.isTractDetailLoading,
      setTractDetail: s.setTractDetail,
      setTractDetailLoading: s.setTractDetailLoading,
      setPopupInfo: s.setPopupInfo,
      setSelectedCityName: s.setSelectedCityName,
      geojsonData: s.geojsonData,
    }))
  )

  // When a tract is selected (e.g. via map click), auto-navigate sidebar to its group.
  // Named-city tracts navigate to the city group; unincorporated tracts navigate to
  // their individual group (keyed by formatted tract name).
  useEffect(() => {
    if (!tractDetail) return
    if (tractDetail.city_name?.trim()) {
      setSelectedRegion(tractDetail.city_name.trim())
    } else {
      setSelectedRegion(formatCensusTract(tractDetail.tract_id))
    }
  }, [tractDetail?.city_name, tractDetail?.tract_id])

  // Group ranked tracts by city_name.
  // Tracts with no city each become their own group so averages are never
  // polluted by unrelated unincorporated tracts.
  const cityGroups = useMemo(() => {
    const namedGroups: Record<string, RankedTract[]> = {}
    const soloTracts: RankedTract[] = []

    for (const t of rankedTracts) {
      const city = t.city_name?.trim()
      if (city) {
        if (!namedGroups[city]) namedGroups[city] = []
        namedGroups[city].push(t)
      } else {
        soloTracts.push(t)
      }
    }

    const named = Object.entries(namedGroups).map(([city, tracts]) => ({
      city,
      tracts,
      avgHeat: tracts.reduce((s, t) => s + t.display_risk, 0) / tracts.length,
      isUnincorporated: false,
    }))

    // Each unincorporated tract is its own entry; key = formatted name (unique)
    const solo = soloTracts.map((t) => ({
      city: formatCensusTract(t.tract_id),
      tracts: [t],
      avgHeat: t.display_risk,
      isUnincorporated: true,
    }))

    return [...named, ...solo].sort((a, b) => b.avgHeat - a.avgHeat)
  }, [rankedTracts])

  // Filter cities or zones based on search
  const filteredRegions = useMemo(() => {
    if (!search) return cityGroups
    const q = search.toLowerCase()
    return cityGroups
      .map((g) => ({
        ...g,
        tracts: g.tracts.filter((t) => t.tract_id.toLowerCase().includes(q)),
      }))
      .filter((g) => g.city.toLowerCase().includes(q) || g.tracts.length > 0)
  }, [cityGroups, search])

  const zonesInRegion = useMemo(() => {
    if (!selectedRegion) return []
    const group = cityGroups.find((g) => g.city === selectedRegion)
    if (!group) return []
    if (!search) return group.tracts
    const q = search.toLowerCase()
    return group.tracts.filter((t) => t.tract_id.toLowerCase().includes(q))
  }, [cityGroups, selectedRegion, search])

  function handleRegionClick(city: string) {
    setSearch('')
    setSelectedRegion(city)

    const group = cityGroups.find((g) => g.city === city)

    if (group?.isUnincorporated) {
      // Solo unincorporated tract — no city highlight, zoom + auto-select the tract
      setSelectedCityName(null)
      const tract = group.tracts[0]
      const bbox = getTractBbox(geojsonData, tract.tract_id)
      if (bbox) {
        mapRef.current?.fitBounds(bbox, { padding: 80, maxZoom: 11, duration: 1000, essential: true })
      }
      handleZoneClick(tract)
    } else {
      // Named city — zoom to encompass all tracts
      setSelectedCityName(city)
      const bbox = getCityBbox(geojsonData, city)
      if (bbox) {
        mapRef.current?.fitBounds(bbox, { padding: 48, maxZoom: 12, duration: 1000, essential: true })
      }
    }
  }

  function handleZoneClick(tract: RankedTract) {
    setSelectedTractId(tract.tract_id)
    setSelectedCityName(tract.city_name ?? null)
    setTractDetailLoading(true)
    setTractDetail(null)

    // Show TractPopup immediately with scores from rankedTracts data
    setPopupInfo({
      longitude: -122.1,
      latitude: 47.45,
      tractId: tract.tract_id,
      xgb_heat_score: tract.xgb_heat_score,
      xgb_risk_score: tract.xgb_risk_score,
      tf_risk_score: tract.tf_risk_score,
      display_risk: tract.display_risk,
      composite_risk: tract.composite_risk,
    })

    // Fly to the tract's actual geometry bounds; fall back to city bounds
    const tractBbox = getTractBbox(geojsonData, tract.tract_id)
    if (tractBbox) {
      mapRef.current?.fitBounds(tractBbox, { padding: 80, maxZoom: 11, duration: 1000, essential: true })
    } else {
      const cityBbox = getCityBbox(geojsonData, tract.city_name ?? '')
      if (cityBbox) {
        mapRef.current?.fitBounds(cityBbox, { padding: 48, maxZoom: 12, duration: 1000, essential: true })
      }
    }

    fetchTractDetail(tract.tract_id)
      .then((detail) => { setTractDetail(detail) })
      .catch(() => {})
      .finally(() => setTractDetailLoading(false))
  }

  function handleBackToRegions() {
    setSelectedRegion(null)
    setSelectedTractId(null)
    setSelectedCityName(null)
    setPopupInfo(null)
    setTractDetail(null)
  }

  // City overview card values
  const regionTracts = selectedRegion ? (cityGroups.find((g) => g.city === selectedRegion)?.tracts ?? []) : []
  const avgDisplayRisk = regionTracts.length
    ? regionTracts.reduce((s, t) => s + t.display_risk, 0) / regionTracts.length
    : null
  const avgRisk = avgDisplayRisk != null ? avgDisplayRisk * 10 : null
  const heatBadge = getHeatLabel(avgDisplayRisk ?? 0)
  const treeCov = tractDetail?.mean_tree_cov ?? null
  const allTreeVals = rankedTracts.map((t) => t.mean_tree_cov)
  const treeCovVals = allTreeVals.filter((v): v is number => v != null)
  const treeCovScore = treeCov != null && treeCovVals.length
    ? (treeCovVals.filter((v) => v <= treeCov).length / treeCovVals.length) * 10
    : null
  const treeCovColor = treeCovScore == null ? '#888' : treeCovScore >= 7 ? '#4CAF50' : treeCovScore >= 4 ? '#FFC107' : '#F44336'
  const zoning = getZoning(tractDetail?.mean_imperv ?? null)
  const isUnincorporatedView = selectedRegion != null &&
    (cityGroups.find((g) => g.city === selectedRegion)?.isUnincorporated ?? false)

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: '#111318', fontFamily: '"IBM Plex Sans", sans-serif',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          {selectedRegion ? (
            <button
              onClick={handleBackToRegions}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '5px',
                color: '#FF6B6B', fontSize: '0.8rem', fontWeight: 600,
                fontFamily: '"IBM Plex Sans", sans-serif', padding: 0,
              }}
            >
              <ArrowLeft size={13} />
              Regions
            </button>
          ) : (
            <Layers size={14} style={{ color: 'rgba(232,235,242,0.30)' }} />
          )}
          <h2 style={{
            fontFamily: '"DM Sans", sans-serif', fontWeight: 700,
            fontSize: '0.95rem', color: '#E8EBF2', margin: 0,
          }}>
            {selectedRegion ?? 'Regions'}
          </h2>
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(232,235,242,0.35)' }} />
          <input
            type="text"
            placeholder={selectedRegion ? 'Search zones...' : 'Search cities...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%', background: '#1C1F2A',
              border: '1px solid rgba(255,255,255,0.09)', borderRadius: '8px',
              padding: '7px 10px 7px 30px', color: '#E8EBF2', fontSize: '0.8rem',
              outline: 'none', fontFamily: '"IBM Plex Sans", sans-serif',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <AnimatePresence mode="wait" initial={false}>

          {/* ── VIEW 1: Region list ── */}
          {!selectedRegion && (
            <motion.div key="regions" {...slideRight} style={{ padding: '8px 10px' }}>
              {isRankedLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{ height: '62px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', marginBottom: '6px' }} />
                ))
              ) : (
                <>
                  <div style={{ padding: '2px 2px 8px', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.09em', color: 'rgba(232,235,242,0.35)' }}>
                    {filteredRegions.length} {filteredRegions.length === 1 ? 'REGION' : 'REGIONS'}
                  </div>
                  <motion.div variants={staggerList} initial="hidden" animate="visible">
                    {filteredRegions.map((g) => (
                      <motion.div key={g.city} variants={staggerItem}>
                        <RegionCard
                          city={g.city}
                          tracts={g.tracts}
                          onClick={() => handleRegionClick(g.city)}
                        />
                      </motion.div>
                    ))}
                  </motion.div>
                </>
              )}
            </motion.div>
          )}

          {/* ── VIEW 2: City overview + sub-zones ── */}
          {selectedRegion && (
            <motion.div key={`region-${selectedRegion}`} {...slideLeft}>

              {/* City overview card */}
              <div style={{
                margin: '10px 10px 0',
                background: 'rgba(255,107,107,0.07)',
                border: '1px solid rgba(255,107,107,0.20)',
                borderRadius: '10px',
                padding: '12px 14px',
              }}>
                {/* City name */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                  <MapPin size={13} style={{ color: '#FF6B6B', marginTop: '2px', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: '"DM Sans", sans-serif', fontWeight: 700,
                      fontSize: '0.92rem', color: '#E8EBF2', marginBottom: '2px',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {selectedRegion}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'rgba(232,235,242,0.45)', fontFamily: '"IBM Plex Mono", monospace' }}>
                      {isUnincorporatedView ? 'Unincorporated · King County, WA' : `${regionTracts.length} zones · King County, WA`}
                    </div>
                  </div>
                </div>

                {/* Heat + zoning badges */}
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <span style={{
                    background: heatBadge.bg, color: heatBadge.color,
                    border: `1px solid ${heatBadge.color}55`,
                    borderRadius: '20px', padding: '2px 9px',
                    fontSize: '0.67rem', fontWeight: 600,
                  }}>
                    {heatBadge.label}
                  </span>
                  {!isTractDetailLoading && tractDetail && (
                    <span style={{
                      background: 'rgba(255,255,255,0.07)', color: 'rgba(232,235,242,0.65)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '20px', padding: '2px 9px',
                      fontSize: '0.67rem', fontWeight: 600,
                    }}>
                      {zoning}
                    </span>
                  )}
                </div>

                {/* Risk + tree cover tiles */}
                <div style={{ display: 'flex', gap: '7px', marginBottom: '10px' }}>
                  <div style={{
                    flex: 1, background: 'rgba(255,107,107,0.08)',
                    border: '1px solid rgba(255,107,107,0.20)',
                    borderRadius: '7px', padding: '7px 10px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '0.57rem', letterSpacing: '0.08em', color: 'rgba(232,235,242,0.38)', marginBottom: '2px' }}>RISK</div>
                    <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 700, fontSize: '1rem', color: '#FF6B6B', lineHeight: 1 }}>
                      {avgRisk != null ? avgRisk.toFixed(1) : '—'}
                    </div>
                    <div style={{ fontSize: '0.57rem', color: 'rgba(232,235,242,0.38)', marginTop: '2px' }}>out of 10</div>
                  </div>
                  <div style={{
                    flex: 1, background: '#1C1F2A',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '7px', padding: '7px 10px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '0.57rem', letterSpacing: '0.08em', color: 'rgba(232,235,242,0.38)', marginBottom: '2px' }}>TREE COVER</div>
                    {isTractDetailLoading ? (
                      <div style={{ height: '16px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', margin: '2px 0' }} />
                    ) : (
                      <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 700, fontSize: '1rem', color: treeCovColor, lineHeight: 1 }}>
                        {treeCovScore != null ? `${treeCovScore.toFixed(1)}/10` : '—'}
                      </div>
                    )}
                    <div style={{ fontSize: '0.57rem', color: 'rgba(232,235,242,0.38)', marginTop: '2px' }}>coverage</div>
                  </div>
                </div>

              </div>

              {/* Contractor Recommendations */}
              {!isTractDetailLoading && tractDetail && (() => {
                const allTreeVals = rankedTracts.map((t) => t.mean_tree_cov)
                const treeCovVals = allTreeVals.filter((v): v is number => v != null)
                const tc = tractDetail.mean_tree_cov
                const tcScore = tc != null && treeCovVals.length
                  ? (treeCovVals.filter((v) => v <= tc).length / treeCovVals.length) * 10
                  : null
                const activeRanked = rankedTracts.find((t) => t.tract_id === selectedTractId)
                const dr = activeRanked?.display_risk ?? 0.5
                const recs = getInterventions(tractDetail, tcScore, dr)
                return (
                  <div style={{ margin: '10px 10px 0', padding: '12px 14px', background: '#1C1F2A', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px' }}>
                    <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(232,235,242,0.38)', marginBottom: '10px' }}>
                      CONTRACTOR RECOMMENDATIONS · {formatCensusTract(selectedTractId ?? '')}
                    </div>
                    {recs.map((item, i) => <SidebarInterventionCard key={i} item={item} />)}
                  </div>
                )
              })()}

              {/* Sub-zones list */}
              <div style={{ padding: '10px 10px 0' }}>
                <div style={{ padding: '0 2px 6px', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.09em', color: 'rgba(232,235,242,0.35)' }}>
                  {zonesInRegion.length} ZONE{zonesInRegion.length !== 1 ? 'S' : ''}
                </div>
                <motion.div variants={staggerList} initial="hidden" animate="visible">
                  {zonesInRegion.map((tract) => (
                    <motion.div key={tract.tract_id} variants={staggerItem}>
                      <ZoneCard
                        tract={tract}
                        isActive={tract.tract_id === selectedTractId}
                        onClick={() => handleZoneClick(tract)}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

    </div>
  )
}
