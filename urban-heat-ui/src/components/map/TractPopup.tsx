import { motion } from 'motion/react'
import { X } from 'lucide-react'
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

// Thresholds aligned to the map's interpolation stops: [0, 0.33, 0.66, 0.85, 1.0]
// green → light-green → yellow → orange → deep-red
function getRiskLevel(score: number): { label: string; color: string } {
  if (score >= 0.85) return { label: 'Extreme Heat Risk', color: '#FF5722' }
  if (score >= 0.66) return { label: 'High Heat Risk',    color: '#FB8C00' }
  if (score >= 0.33) return { label: 'Moderate Heat Risk', color: '#FFC107' }
  return { label: 'Low Heat Risk', color: '#66BB6A' }
}

function getZoneType(imperv: number | null): string {
  if (imperv == null) return 'Unclassified'
  if (imperv >= 70)   return 'Dense Urban'
  if (imperv >= 40)   return 'Mixed-Use'
  if (imperv >= 15)   return 'Low-Density Residential'
  return 'Natural / Suburban'
}

// Format 11-digit Census GEOID to human-readable tract label
// e.g. "53033012100" → "Tract 121" | "53033025505" → "Tract 255.5"
export function formatCensusTract(tractId: string): string {
  const raw = tractId.slice(-6)
  const major = parseInt(raw.slice(0, 4), 10)
  const minor = parseInt(raw.slice(4), 10)
  return minor === 0 ? `Tract ${major}` : `Tract ${major}.${minor}`
}

function fmt(val: number | null | undefined, decimals = 1, suffix = ''): string {
  if (val == null) return '—'
  return `${val.toFixed(decimals)}${suffix}`
}

function getPrimaryDriver(
  detail: TractDetail,
  treeCovScore: number | null,
): { label: string; color: string } | null {
  const candidates: Array<{ weight: number; label: string; color: string }> = []

  if (detail.mean_imperv != null && detail.mean_imperv > 45)
    candidates.push({ weight: (detail.mean_imperv - 45) / 55, label: 'High Imperviousness', color: '#FB8C00' })

  if (treeCovScore != null && treeCovScore < 4)
    candidates.push({ weight: (4 - treeCovScore) / 4, label: 'Low Tree Canopy', color: '#8BC34A' })

  if (detail.mean_afternoon_temp != null && detail.mean_afternoon_temp > 88)
    candidates.push({ weight: (detail.mean_afternoon_temp - 88) / 22, label: 'Extreme Surface Temp', color: '#FF5722' })

  if (detail.mean_svi_overall != null && detail.mean_svi_overall > 0.6)
    candidates.push({ weight: (detail.mean_svi_overall - 0.6) / 0.4, label: 'High Vulnerability', color: '#9C6FE4' })

  if (!candidates.length) return null
  candidates.sort((a, b) => b.weight - a.weight)
  return { label: candidates[0].label, color: candidates[0].color }
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
      <span style={{ fontSize: '0.72rem', color: 'rgba(232,235,242,0.58)', fontFamily: '"IBM Plex Sans", sans-serif' }}>
        {label}
      </span>
      <span style={{
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: '0.75rem', fontWeight: 600,
        color: color ?? '#E8EBF2',
      }}>
        {value}
      </span>
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
  const compositeRisk = popupInfo.composite_risk
  const tractLabel = formatCensusTract(popupInfo.tractId)

  const allTreeVals = rankedTracts.map((t) => t.mean_tree_cov)
  const treeCovScore = treeScore(tractDetail?.mean_tree_cov ?? null, allTreeVals)
  const treeCovColor = treeCovScore == null ? 'rgba(232,235,242,0.45)'
    : treeCovScore >= 7 ? '#66BB6A'
    : treeCovScore >= 4 ? '#FFC107'
    : '#FF5722'

  const primaryDriver = tractDetail ? getPrimaryDriver(tractDetail, treeCovScore) : null

  const distWaterFmt = (d: number | null | undefined) => {
    if (d == null) return '—'
    return d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`
  }

  const tempColor = (t: number | null | undefined) => {
    if (t == null) return undefined
    if (t > 97) return '#FF5722'
    if (t > 90) return '#FB8C00'
    return '#66BB6A'
  }

  const impervColor = (v: number | null | undefined) => {
    if (v == null) return undefined
    if (v > 70) return '#FF5722'
    if (v > 50) return '#FFC107'
    return '#66BB6A'
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
        width: '310px',
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: '"DM Sans", sans-serif', fontWeight: 700,
                fontSize: '0.97rem', color: '#E8EBF2', marginBottom: '1px',
              }}>
                {tractDetail?.city_name
                  ? `${tractDetail.city_name} · ${tractLabel}`
                  : tractLabel}
              </div>
              <div style={{
                fontSize: '0.62rem', color: 'rgba(232,235,242,0.45)',
                fontFamily: '"IBM Plex Mono", monospace',
              }}>
                King County, WA · {popupInfo.tractId}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', flexShrink: 0, marginLeft: '10px' }}>
              {/* Display risk tile */}
              <div style={{
                background: 'rgba(255,107,107,0.10)', border: '1px solid rgba(255,107,107,0.25)',
                borderRadius: '8px', padding: '4px 10px', textAlign: 'center',
              }}>
                <div style={{ fontSize: '0.52rem', color: 'rgba(232,235,242,0.45)', letterSpacing: '0.06em', fontFamily: '"IBM Plex Mono", monospace' }}>
                  {projectionYear > 2025 ? String(projectionYear) : 'RISK'}
                </div>
                <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '1rem', fontWeight: 700, color: '#FF6B6B', lineHeight: 1.1 }}>
                  {normalizedRisk.toFixed(1)}
                </div>
                <div style={{ fontSize: '0.52rem', color: 'rgba(232,235,242,0.40)', fontFamily: '"IBM Plex Mono", monospace' }}>/ 10</div>
              </div>

              {/* Composite / baseline tile */}
              {compositeRisk != null && (
                <div style={{
                  background: 'rgba(255,193,7,0.10)', border: '1px solid rgba(255,193,7,0.25)',
                  borderRadius: '8px', padding: '4px 10px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '0.52rem', color: 'rgba(232,235,242,0.45)', letterSpacing: '0.06em', fontFamily: '"IBM Plex Mono", monospace' }}>
                    BASE
                  </div>
                  <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '1rem', fontWeight: 700, color: '#FFC107', lineHeight: 1.1 }}>
                    {(compositeRisk * 10).toFixed(1)}
                  </div>
                  <div style={{ fontSize: '0.52rem', color: 'rgba(232,235,242,0.40)', fontFamily: '"IBM Plex Mono", monospace' }}>/ 10</div>
                </div>
              )}

              <button
                onClick={onClose}
                style={{
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '6px', width: '26px', height: '26px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'rgba(232,235,242,0.60)', flexShrink: 0,
                }}
              >
                <X size={12} />
              </button>
            </div>
          </div>

          {/* ── Badges ── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '12px' }}>
            <span style={{
              background: risk.color + '22', color: risk.color,
              border: `1px solid ${risk.color}55`,
              borderRadius: '20px', padding: '2px 10px',
              fontSize: '0.69rem', fontWeight: 600, fontFamily: '"IBM Plex Sans", sans-serif',
            }}>
              {risk.label}
            </span>
            {primaryDriver && (
              <span style={{
                background: primaryDriver.color + '20', color: primaryDriver.color,
                border: `1px solid ${primaryDriver.color}44`,
                borderRadius: '20px', padding: '2px 10px',
                fontSize: '0.69rem', fontWeight: 600, fontFamily: '"IBM Plex Sans", sans-serif',
              }}>
                {primaryDriver.label}
              </span>
            )}
            {tractDetail && (
              <span style={{
                background: 'rgba(255,255,255,0.07)', color: 'rgba(232,235,242,0.65)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '20px', padding: '2px 10px',
                fontSize: '0.69rem', fontWeight: 600, fontFamily: '"IBM Plex Sans", sans-serif',
              }}>
                {getZoneType(tractDetail.mean_imperv)}
              </span>
            )}
          </div>

          {/* ── Loading skeleton ── */}
          {isTractDetailLoading && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '10px' }}>
              {[80, 65, 75, 55, 70, 60].map((w, i) => (
                <div key={i} style={{
                  height: '13px', width: `${w}%`,
                  background: 'rgba(255,255,255,0.08)', borderRadius: '4px', marginBottom: '7px',
                }} />
              ))}
            </div>
          )}

          {/* ── Data sections ── */}
          {!isTractDetailLoading && tractDetail && (
            <>
              {/* ENVIRONMENT */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '10px', marginBottom: '10px' }}>
                <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(232,235,242,0.38)', marginBottom: '6px' }}>
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
                <StatRow label="Zone Type" value={getZoneType(tractDetail.mean_imperv)} />
              </div>

              {/* HEALTH */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '10px' }}>
                <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(232,235,242,0.38)', marginBottom: '6px' }}>
                  HEALTH & VULNERABILITY
                </div>
                <StatRow label="Life Expectancy" value={fmt(tractDetail.mean_life_expectancy, 1, ' yrs')} />
                <StatRow
                  label="SVI Percentile"
                  value={tractDetail.mean_svi_overall != null ? `${(tractDetail.mean_svi_overall * 100).toFixed(0)}th` : '—'}
                  color={sviColor(tractDetail.mean_svi_overall)}
                />
                <StatRow label="CVD Mortality Rate" value={fmt(tractDetail.mean_cvd_rate, 0)} />
                <StatRow label="Diabetes Rate" value={fmt(tractDetail.mean_diabetes, 1, '%')} />
              </div>
            </>
          )}
        </div>
      </GlassCard>
    </motion.div>
  )
}
