import { useState, useMemo, useEffect } from 'react'
import { Search, Plus, MapPin, ChevronRight, ArrowLeft, Layers } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { useShallow } from 'zustand/shallow'
import { useMapStore } from '../../store/mapStore'
import { useChatStore } from '../../store/chatStore'
import { fetchTractDetail } from '../../api/tracts'
import { mapRef } from '../map/HeatMap'
import type { RankedTract } from '../../types/api'

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
  if (score >= 0.75) return { label: 'Extreme Heat',  color: '#F44336', bg: 'rgba(244,67,54,0.15)' }
  if (score >= 0.5)  return { label: 'High Heat',     color: '#FF5722', bg: 'rgba(255,87,34,0.15)' }
  if (score >= 0.25) return { label: 'Moderate Heat', color: '#FFC107', bg: 'rgba(255,193,7,0.15)' }
  return                      { label: 'Low Heat',    color: '#4CAF50', bg: 'rgba(76,175,80,0.15)' }
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
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '8px',
        padding: '10px 12px',
        margin: '0 0 6px',
        cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.background = 'rgba(255,255,255,0.06)'
        el.style.borderColor = 'rgba(255,255,255,0.14)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.background = 'rgba(255,255,255,0.03)'
        el.style.borderColor = 'rgba(255,255,255,0.07)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
            <div style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '0.88rem', color: '#E5E7EB' }}>
              {city}
            </div>
            <span style={{
              background: heat.bg, color: heat.color,
              border: `1px solid ${heat.color}44`,
              borderRadius: '20px', padding: '1px 8px',
              fontSize: '0.65rem', fontWeight: 600,
            }}>
              {heat.label}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.72rem', color: 'rgba(229,231,235,0.45)' }}>
              {tracts.length} zone{tracts.length !== 1 ? 's' : ''}
            </span>
            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.72rem', color: 'rgba(229,231,235,0.45)' }}>
              Risk {(avgRisk * 10).toFixed(1)}/10
            </span>
          </div>
        </div>
        <ChevronRight size={14} style={{ color: 'rgba(229,231,235,0.3)', flexShrink: 0, marginLeft: '8px' }} />
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
        background: isActive ? 'rgba(0,191,165,0.08)' : 'transparent',
        borderLeft: isActive ? '2px solid #00BFA5' : '2px solid transparent',
        borderRadius: '0 8px 8px 0',
        padding: '9px 12px',
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'
      }}
      onMouseLeave={(e) => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '0.83rem', color: '#E5E7EB', marginBottom: '2px' }}>
            Zone {tract.tract_id.slice(-5)}
            {isActive && (
              <span style={{
                marginLeft: '7px',
                background: 'rgba(76,175,80,0.2)', color: '#4CAF50',
                border: '1px solid rgba(76,175,80,0.35)',
                borderRadius: '10px', padding: '0 6px',
                fontSize: '0.6rem', fontWeight: 600,
              }}>Active</span>
            )}
          </div>
          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.7rem', color: 'rgba(229,231,235,0.35)' }}>
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
    }))
  )
  const updateMapContext = useChatStore((s) => s.updateMapContext)

  // When a tract is selected (e.g. via map click), auto-navigate sidebar to its city
  useEffect(() => {
    if (tractDetail?.city_name) {
      setSelectedRegion(tractDetail.city_name)
    }
  }, [tractDetail?.city_name])

  // Group ranked tracts by city_name
  const cityGroups = useMemo(() => {
    const groups: Record<string, RankedTract[]> = {}
    for (const t of rankedTracts) {
      const city = t.city_name?.trim() || 'Unincorporated'
      if (!groups[city]) groups[city] = []
      groups[city].push(t)
    }
    return Object.entries(groups)
      .map(([city, tracts]) => ({
        city,
        tracts,
        avgHeat: tracts.reduce((s, t) => s + t.display_risk, 0) / tracts.length,
      }))
      .sort((a, b) => b.avgHeat - a.avgHeat)
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

  function handleZoneClick(tract: RankedTract) {
    setSelectedTractId(tract.tract_id)
    mapRef.current?.flyTo({ center: [-122.1, 47.5], zoom: 10, duration: 1500, essential: true })
    updateMapContext({
      selected_tract_ids: [tract.tract_id],
      current_scores: {
        [tract.tract_id]: {
          xgb_heat_score: tract.xgb_heat_score,
          xgb_risk_score: tract.xgb_risk_score,
          tf_risk_score: tract.tf_risk_score,
        },
      },
    })
    setTractDetailLoading(true)
    setTractDetail(null)
    fetchTractDetail(tract.tract_id)
      .then(setTractDetail)
      .catch(() => {})
      .finally(() => setTractDetailLoading(false))
  }

  function handleBackToRegions() {
    setSelectedRegion(null)
    setSelectedTractId(null)
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

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: '#12121A', fontFamily: '"IBM Plex Sans", sans-serif',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          {selectedRegion ? (
            <button
              onClick={handleBackToRegions}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '5px',
                color: '#00BFA5', fontSize: '0.8rem', fontWeight: 600,
                fontFamily: '"IBM Plex Sans", sans-serif', padding: 0,
              }}
            >
              <ArrowLeft size={13} />
              Regions
            </button>
          ) : (
            <Layers size={14} style={{ color: 'rgba(229,231,235,0.4)' }} />
          )}
          <h2 style={{
            fontFamily: '"DM Sans", sans-serif', fontWeight: 700,
            fontSize: '0.95rem', color: '#E5E7EB', margin: 0,
          }}>
            {selectedRegion ?? 'Regions'}
          </h2>
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(229,231,235,0.4)' }} />
          <input
            type="text"
            placeholder={selectedRegion ? 'Search zones...' : 'Search cities...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
              padding: '7px 10px 7px 30px', color: '#E5E7EB', fontSize: '0.8rem',
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
                  <div style={{ padding: '2px 2px 8px', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.09em', color: 'rgba(229,231,235,0.28)' }}>
                    {filteredRegions.length} {filteredRegions.length === 1 ? 'CITY' : 'CITIES'}
                  </div>
                  <motion.div variants={staggerList} initial="hidden" animate="visible">
                    {filteredRegions.map((g) => (
                      <motion.div key={g.city} variants={staggerItem}>
                        <RegionCard
                          city={g.city}
                          tracts={g.tracts}
                          onClick={() => { setSearch(''); setSelectedRegion(g.city) }}
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
                background: 'rgba(0,191,165,0.06)',
                border: '1px solid rgba(0,191,165,0.18)',
                borderRadius: '10px',
                padding: '12px 14px',
              }}>
                {/* City name */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                  <MapPin size={13} style={{ color: '#00BFA5', marginTop: '2px', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: '"DM Sans", sans-serif', fontWeight: 700,
                      fontSize: '0.92rem', color: '#E5E7EB', marginBottom: '2px',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {selectedRegion}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'rgba(229,231,235,0.38)', fontFamily: '"IBM Plex Mono", monospace' }}>
                      {regionTracts.length} zones · King County, WA
                    </div>
                  </div>
                </div>

                {/* Heat + zoning badges */}
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <span style={{
                    background: heatBadge.bg, color: heatBadge.color,
                    border: `1px solid ${heatBadge.color}44`,
                    borderRadius: '20px', padding: '2px 9px',
                    fontSize: '0.67rem', fontWeight: 600,
                  }}>
                    {heatBadge.label}
                  </span>
                  {!isTractDetailLoading && tractDetail && (
                    <span style={{
                      background: 'rgba(255,255,255,0.06)', color: 'rgba(229,231,235,0.55)',
                      border: '1px solid rgba(255,255,255,0.1)',
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
                    flex: 1, background: 'rgba(0,229,255,0.07)',
                    border: '1px solid rgba(0,229,255,0.14)',
                    borderRadius: '7px', padding: '7px 10px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '0.57rem', letterSpacing: '0.08em', color: 'rgba(229,231,235,0.32)', marginBottom: '2px' }}>RISK</div>
                    <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 700, fontSize: '1rem', color: '#00E5FF', lineHeight: 1 }}>
                      {avgRisk != null ? avgRisk.toFixed(1) : '—'}
                    </div>
                    <div style={{ fontSize: '0.57rem', color: 'rgba(229,231,235,0.28)', marginTop: '2px' }}>out of 10</div>
                  </div>
                  <div style={{
                    flex: 1, background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '7px', padding: '7px 10px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '0.57rem', letterSpacing: '0.08em', color: 'rgba(229,231,235,0.32)', marginBottom: '2px' }}>TREE COVER</div>
                    {isTractDetailLoading ? (
                      <div style={{ height: '16px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', margin: '2px 0' }} />
                    ) : (
                      <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 700, fontSize: '1rem', color: treeCovColor, lineHeight: 1 }}>
                        {treeCovScore != null ? `${treeCovScore.toFixed(1)}/10` : '—'}
                      </div>
                    )}
                    <div style={{ fontSize: '0.57rem', color: 'rgba(229,231,235,0.28)', marginTop: '2px' }}>coverage</div>
                  </div>
                </div>

                {/* Demographics — shown after a sub-zone is selected */}
                {!isTractDetailLoading && tractDetail ? (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
                    <div style={{ fontSize: '0.57rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(229,231,235,0.24)', marginBottom: '6px' }}>
                      DEMOGRAPHICS · ZONE {selectedTractId?.slice(-5)}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px' }}>
                      {[
                        { label: 'Life Expect.', value: tractDetail.mean_life_expectancy != null ? `${tractDetail.mean_life_expectancy.toFixed(1)} yrs` : '—' },
                        { label: 'Poverty 2×',   value: tractDetail.mean_poverty2x != null ? `${tractDetail.mean_poverty2x.toFixed(1)}%` : '—' },
                        { label: 'SVI Pctile',   value: tractDetail.mean_svi_overall != null ? `${(tractDetail.mean_svi_overall * 100).toFixed(0)}th` : '—' },
                        { label: 'Disability',   value: tractDetail.mean_disability != null ? `${tractDetail.mean_disability.toFixed(1)}%` : '—' },
                        { label: 'Diabetes',     value: tractDetail.mean_diabetes != null ? `${tractDetail.mean_diabetes.toFixed(1)}%` : '—' },
                        { label: 'Under 18',     value: tractDetail.mean_under18 != null ? `${tractDetail.mean_under18.toFixed(1)}%` : '—' },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <div style={{ fontSize: '0.58rem', color: 'rgba(229,231,235,0.3)' }}>{label}</div>
                          <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.74rem', color: '#E5E7EB', fontWeight: 600 }}>
                            {value}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : isTractDetailLoading ? (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
                    {[85, 65, 75].map((w, i) => (
                      <div key={i} style={{ height: '11px', width: `${w}%`, background: 'rgba(255,255,255,0.05)', borderRadius: '3px', marginBottom: '5px' }} />
                    ))}
                  </div>
                ) : (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(229,231,235,0.3)', fontStyle: 'italic' }}>
                      Select a zone below to view demographics
                    </div>
                  </div>
                )}
              </div>

              {/* Sub-zones list */}
              <div style={{ padding: '10px 10px 0' }}>
                <div style={{ padding: '0 2px 6px', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.09em', color: 'rgba(229,231,235,0.28)' }}>
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

      {/* Footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <button style={{
          width: '100%', background: '#E5E7EB', color: '#0A0A0F',
          border: 'none', borderRadius: '8px', padding: '10px',
          fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '6px', fontFamily: '"DM Sans", sans-serif',
        }}>
          <Plus size={15} />
          New Analysis
        </button>
      </div>
    </div>
  )
}
