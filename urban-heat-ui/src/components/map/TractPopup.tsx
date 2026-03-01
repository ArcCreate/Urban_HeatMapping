import { motion } from 'motion/react'
import { X, Leaf, Thermometer, Users, Droplets, Building2, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PopupInfo } from '../../types/map'
import type { TractDetail } from '../../types/api'
import { useMapStore, useShallow } from '../../store/mapStore'
import { GlassCard } from '../ui/GlassCard'

// ── Helpers ──────────────────────────────────────────────────────────────────

function treeScore(treeCov: number | null, allValues: (number | null)[]): number | null {
  if (treeCov == null) return null
  const vals = allValues.filter((v): v is number => v != null)
  if (vals.length === 0) return null
  return (vals.filter((v) => v <= treeCov).length / vals.length) * 10
}

function getRiskLevel(score: number): { label: string; color: string } {
  if (score >= 0.75) return { label: 'Extreme Heat Risk', color: '#F44336' }
  if (score >= 0.5)  return { label: 'High Heat Risk',    color: '#FF5722' }
  if (score >= 0.25) return { label: 'Moderate Heat Risk', color: '#FFC107' }
  return { label: 'Low Heat Risk', color: '#4CAF50' }
}

function fmt(val: number | null | undefined, decimals = 1, suffix = ''): string {
  if (val == null) return '—'
  return `${val.toFixed(decimals)}${suffix}`
}

// Returns the dominant environmental risk driver, sorted by severity
function getPrimaryDriver(
  detail: TractDetail,
  treeCovScore: number | null,
): { label: string; color: string } | null {
  const candidates: Array<{ weight: number; label: string; color: string }> = []

  if (detail.mean_imperv != null && detail.mean_imperv > 45)
    candidates.push({ weight: (detail.mean_imperv - 45) / 55, label: 'High Imperviousness', color: '#FF8C00' })

  if (treeCovScore != null && treeCovScore < 4)
    candidates.push({ weight: (4 - treeCovScore) / 4, label: 'Low Tree Canopy', color: '#8BC34A' })

  if (detail.mean_afternoon_temp != null && detail.mean_afternoon_temp > 88)
    candidates.push({ weight: (detail.mean_afternoon_temp - 88) / 22, label: 'Extreme Surface Temp', color: '#FF5722' })

  if (detail.mean_svi_overall != null && detail.mean_svi_overall > 0.6)
    candidates.push({ weight: (detail.mean_svi_overall - 0.6) / 0.4, label: 'High Vulnerability', color: '#7C3AED' })

  if (!candidates.length) return null
  candidates.sort((a, b) => b.weight - a.weight)
  return { label: candidates[0].label, color: candidates[0].color }
}

// ── Interventions ─────────────────────────────────────────────────────────────

interface Intervention {
  Icon: LucideIcon
  title: string
  detail: string
  priority: 'critical' | 'high' | 'medium'
}

function getInterventions(
  detail: TractDetail,
  treeCovScore: number | null,
  displayRisk: number,
): Intervention[] {
  const items: Intervention[] = []

  if (treeCovScore != null && treeCovScore < 4.5) {
    items.push({
      Icon: Leaf,
      title: 'Expand Tree Canopy',
      detail: `County rank ${treeCovScore.toFixed(1)}/10. Plant street trees and incentivize green roofs to reach 30%+ canopy cover.`,
      priority: treeCovScore < 2 ? 'critical' : 'high',
    })
  }

  if (detail.mean_imperv != null && detail.mean_imperv > 50) {
    items.push({
      Icon: Building2,
      title: 'Cool Pavement Program',
      detail: `${detail.mean_imperv.toFixed(0)}% impervious surface. Apply reflective coatings to roads and parking areas — target ≤50%.`,
      priority: detail.mean_imperv > 70 ? 'critical' : 'high',
    })
  }

  if (detail.mean_afternoon_temp != null && detail.mean_afternoon_temp > 90) {
    items.push({
      Icon: Thermometer,
      title: 'Shade Infrastructure',
      detail: `Peak afternoon temp ${detail.mean_afternoon_temp.toFixed(1)}°F. Install canopies at bus stops, plazas, and pedestrian corridors.`,
      priority: detail.mean_afternoon_temp > 97 ? 'critical' : 'high',
    })
  }

  if (detail.mean_svi_overall != null && detail.mean_svi_overall > 0.65) {
    items.push({
      Icon: Users,
      title: 'Priority Cooling Centers',
      detail: `${Math.round(detail.mean_svi_overall * 100)}th SVI percentile. Establish accessible cooling shelter within 0.5 mi for vulnerable residents.`,
      priority: detail.mean_svi_overall > 0.8 ? 'critical' : 'high',
    })
  }

  if (detail.mean_dist_water != null && detail.mean_dist_water > 1500) {
    items.push({
      Icon: Droplets,
      title: 'Water Feature Installation',
      detail: `Nearest water source ${(detail.mean_dist_water / 1000).toFixed(1)} km away. Add misting stations or splash pads at public spaces.`,
      priority: 'medium',
    })
  }

  if (displayRisk >= 0.5 && items.length < 2) {
    items.push({
      Icon: Zap,
      title: 'Reflective Roofing Standards',
      detail: 'Mandate cool-roof materials on new and retrofitted construction to reduce peak radiant heat absorption.',
      priority: 'medium',
    })
  }

  return items.slice(0, 3)
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface StatRowProps {
  label: string
  value: string
  color?: string
}

function StatRow({ label, value, color }: StatRowProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3.5px 0' }}>
      <span style={{ fontSize: '0.72rem', color: 'rgba(229,231,235,0.45)', fontFamily: '"IBM Plex Sans", sans-serif' }}>
        {label}
      </span>
      <span style={{
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: '0.75rem', fontWeight: 600,
        color: color ?? '#E5E7EB',
      }}>
        {value}
      </span>
    </div>
  )
}

const PRIORITY_COLOR: Record<Intervention['priority'], string> = {
  critical: '#F44336',
  high: '#FF8C00',
  medium: '#FFC107',
}

function InterventionCard({ item }: { item: Intervention }) {
  const bar = PRIORITY_COLOR[item.priority]
  return (
    <div style={{
      display: 'flex', gap: '10px',
      borderLeft: `3px solid ${bar}`,
      paddingLeft: '10px',
      padding: '6px 0 6px 10px',
      marginBottom: '7px',
    }}>
      <item.Icon size={14} style={{ color: bar, flexShrink: 0, marginTop: '2px' }} />
      <div>
        <div style={{
          fontFamily: '"DM Sans", sans-serif', fontWeight: 700,
          fontSize: '0.77rem', color: '#E5E7EB', marginBottom: '3px',
        }}>
          {item.title}
        </div>
        <div style={{ fontSize: '0.67rem', color: 'rgba(229,231,235,0.5)', lineHeight: 1.5 }}>
          {item.detail}
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface TractPopupProps {
  popupInfo: PopupInfo
  onClose: () => void
}

export function TractPopup({ popupInfo, onClose }: TractPopupProps) {
  const { tractDetail, isTractDetailLoading, rankedTracts, projectionYear } = useMapStore(
    useShallow((s) => ({
      tractDetail: s.tractDetail,
      isTractDetailLoading: s.isTractDetailLoading,
      rankedTracts: s.rankedTracts,
      projectionYear: s.projectionYear,
    }))
  )

  const normalizedRisk = popupInfo.display_risk * 10
  const risk = getRiskLevel(popupInfo.display_risk)

  const allTreeVals = rankedTracts.map((t) => t.mean_tree_cov)
  const treeCovScore = treeScore(tractDetail?.mean_tree_cov ?? null, allTreeVals)
  const treeCovColor = treeCovScore == null ? '#888'
    : treeCovScore >= 7 ? '#4CAF50'
    : treeCovScore >= 4 ? '#FFC107'
    : '#F44336'

  const primaryDriver = tractDetail ? getPrimaryDriver(tractDetail, treeCovScore) : null
  const interventions = tractDetail ? getInterventions(tractDetail, treeCovScore, popupInfo.display_risk) : []

  const distWaterFmt = (d: number | null | undefined) => {
    if (d == null) return '—'
    return d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`
  }

  const tempColor = (t: number | null | undefined) => {
    if (t == null) return undefined
    if (t > 97) return '#F44336'
    if (t > 90) return '#FF8C00'
    return '#4CAF50'
  }

  const impervColor = (v: number | null | undefined) => {
    if (v == null) return undefined
    if (v > 70) return '#F44336'
    if (v > 50) return '#FFC107'
    return '#4CAF50'
  }

  const sviColor = (v: number | null | undefined) => {
    if (v == null) return undefined
    if (v > 0.75) return '#FF5722'
    if (v > 0.5) return '#FFC107'
    return undefined
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -12, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -12, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      style={{
        position: 'absolute',
        bottom: '112px',
        left: '12px',
        zIndex: 20,
        width: '318px',
        pointerEvents: 'auto',
      }}
    >
      <GlassCard style={{ overflow: 'hidden' }}>
        <div style={{
          maxHeight: 'calc(100vh - 260px)',
          overflowY: 'auto',
          padding: '14px 16px',
        }}>

          {/* ── Header ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: '"DM Sans", sans-serif', fontWeight: 700,
                fontSize: '0.97rem', color: '#E5E7EB', marginBottom: '2px',
              }}>
                {tractDetail?.city_name ?? `Zone ${popupInfo.tractId.slice(-5)}`}
              </div>
              <div style={{
                fontSize: '0.67rem', color: 'rgba(229,231,235,0.35)',
                fontFamily: '"IBM Plex Mono", monospace',
              }}>
                {popupInfo.tractId}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0, marginLeft: '10px' }}>
              {/* Risk score */}
              <div style={{
                background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.3)',
                borderRadius: '8px', padding: '4px 10px', textAlign: 'center',
              }}>
                <div style={{
                  fontSize: '0.55rem', color: 'rgba(229,231,235,0.4)',
                  letterSpacing: '0.06em', fontFamily: '"IBM Plex Mono", monospace',
                }}>
                  {projectionYear > 2025 ? String(projectionYear) : 'RISK'}
                </div>
                <div style={{
                  fontFamily: '"IBM Plex Mono", monospace', fontSize: '1rem',
                  fontWeight: 700, color: '#00E5FF', lineHeight: 1.1,
                }}>
                  {normalizedRisk.toFixed(1)}
                </div>
                <div style={{ fontSize: '0.55rem', color: 'rgba(229,231,235,0.35)', fontFamily: '"IBM Plex Mono", monospace' }}>
                  / 10
                </div>
              </div>
              {/* Close */}
              <button
                onClick={onClose}
                style={{
                  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px', width: '26px', height: '26px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'rgba(229,231,235,0.6)', flexShrink: 0,
                }}
              >
                <X size={12} />
              </button>
            </div>
          </div>

          {/* ── Risk label + primary driver ── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '12px' }}>
            <span style={{
              background: risk.color + '22', color: risk.color,
              border: `1px solid ${risk.color}44`,
              borderRadius: '20px', padding: '2px 10px',
              fontSize: '0.69rem', fontWeight: 600,
              fontFamily: '"IBM Plex Sans", sans-serif',
            }}>
              {risk.label}
            </span>
            {primaryDriver && (
              <span style={{
                background: primaryDriver.color + '18', color: primaryDriver.color,
                border: `1px solid ${primaryDriver.color}33`,
                borderRadius: '20px', padding: '2px 10px',
                fontSize: '0.69rem', fontWeight: 600,
                fontFamily: '"IBM Plex Sans", sans-serif',
              }}>
                {primaryDriver.label}
              </span>
            )}
          </div>

          {/* ── Loading skeleton ── */}
          {isTractDetailLoading && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '10px' }}>
              {[80, 65, 75, 55, 70, 60, 72].map((w, i) => (
                <div key={i} style={{
                  height: '13px', width: `${w}%`,
                  background: 'rgba(255,255,255,0.06)', borderRadius: '4px', marginBottom: '7px',
                }} />
              ))}
            </div>
          )}

          {/* ── Sections: only after data loads ── */}
          {!isTractDetailLoading && tractDetail && (
            <>
              {/* ENVIRONMENT */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '10px', marginBottom: '10px' }}>
                <div style={{
                  fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em',
                  color: 'rgba(229,231,235,0.28)', marginBottom: '6px',
                }}>
                  ENVIRONMENT
                </div>
                <StatRow
                  label="Afternoon Surface Temp"
                  value={fmt(tractDetail.mean_afternoon_temp, 1, '°F')}
                  color={tempColor(tractDetail.mean_afternoon_temp)}
                />
                <StatRow
                  label="Tree Canopy"
                  value={treeCovScore != null ? `${treeCovScore.toFixed(1)} / 10` : '—'}
                  color={treeCovColor}
                />
                <StatRow
                  label="Imperviousness"
                  value={fmt(tractDetail.mean_imperv, 0, '%')}
                  color={impervColor(tractDetail.mean_imperv)}
                />
                <StatRow
                  label="Distance to Water"
                  value={distWaterFmt(tractDetail.mean_dist_water)}
                />
              </div>

              {/* POPULATION */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '10px', marginBottom: '10px' }}>
                <div style={{
                  fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em',
                  color: 'rgba(229,231,235,0.28)', marginBottom: '6px',
                }}>
                  POPULATION
                </div>
                <StatRow
                  label="Life Expectancy"
                  value={fmt(tractDetail.mean_life_expectancy, 1, ' yrs')}
                />
                <StatRow
                  label="Poverty Rate (2× FPL)"
                  value={fmt(tractDetail.mean_poverty2x, 1, '%')}
                />
                <StatRow
                  label="SVI Percentile"
                  value={tractDetail.mean_svi_overall != null
                    ? `${(tractDetail.mean_svi_overall * 100).toFixed(0)}th`
                    : '—'}
                  color={sviColor(tractDetail.mean_svi_overall)}
                />
                <StatRow
                  label="Disability Rate"
                  value={fmt(tractDetail.mean_disability, 1, '%')}
                />
              </div>

              {/* CONTRACTOR RECOMMENDATIONS */}
              {interventions.length > 0 && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '10px' }}>
                  <div style={{
                    fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em',
                    color: 'rgba(229,231,235,0.28)', marginBottom: '8px',
                  }}>
                    CONTRACTOR RECOMMENDATIONS
                  </div>
                  {interventions.map((item, i) => (
                    <InterventionCard key={i} item={item} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </GlassCard>
    </motion.div>
  )
}
