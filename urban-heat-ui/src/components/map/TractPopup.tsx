import { motion } from 'motion/react'
import { Popup } from 'react-map-gl/maplibre'
import type { PopupInfo } from '../../types/map'
import { useMapStore, useShallow } from '../../store/mapStore'

// Returns 0–10 percentile rank of treeCov relative to all county tracts
function treeScore(treeCov: number | null, allValues: (number | null)[]): number | null {
  if (treeCov == null) return null
  const vals = allValues.filter((v): v is number => v != null)
  if (vals.length === 0) return null
  const rank = vals.filter((v) => v <= treeCov).length
  return (rank / vals.length) * 10
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

interface StatRowProps {
  label: string
  value: string
  color?: string
}

function StatRow({ label, value, color }: StatRowProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
      <span style={{ fontSize: '0.72rem', color: 'rgba(229,231,235,0.45)' }}>{label}</span>
      <span style={{
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: '0.75rem',
        fontWeight: 600,
        color: color ?? '#E5E7EB',
      }}>{value}</span>
    </div>
  )
}

interface TractPopupProps {
  popupInfo: PopupInfo
  onClose: () => void
}

export function TractPopup({ popupInfo, onClose }: TractPopupProps) {
  const { tractDetail, isTractDetailLoading, rankedTracts } = useMapStore(
    useShallow((s) => ({ tractDetail: s.tractDetail, isTractDetailLoading: s.isTractDetailLoading, rankedTracts: s.rankedTracts }))
  )

  const normalizedRisk = popupInfo.display_risk * 10

  const risk = getRiskLevel(popupInfo.display_risk)

  const treeCov = tractDetail?.mean_tree_cov
  const allTreeVals = rankedTracts.map((t) => t.mean_tree_cov)
  const treeCovScore = treeScore(treeCov ?? null, allTreeVals)
  const treeCovColor = treeCovScore == null ? '#888' : treeCovScore >= 7 ? '#4CAF50' : treeCovScore >= 4 ? '#FFC107' : '#F44336'

  return (
    <Popup
      longitude={popupInfo.longitude}
      latitude={popupInfo.latitude}
      anchor="bottom-left"
      onClose={onClose}
      closeButton={true}
      offset={12}
      style={{ maxWidth: '300px' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 4 }}
        transition={{ duration: 0.15 }}
        style={{
          background: 'rgba(18, 18, 26, 0.97)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px',
          padding: '14px 16px',
          color: '#E5E7EB',
          fontFamily: '"IBM Plex Sans", sans-serif',
          minWidth: '256px',
          maxWidth: '280px',
        }}
      >
        {/* Zone header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
          <div>
            <div style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '0.95rem', marginBottom: '2px' }}>
              {tractDetail?.city_name
                ? `${tractDetail.city_name}`
                : `Zone ${popupInfo.tractId.slice(-5)}`}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(229,231,235,0.4)', fontFamily: '"IBM Plex Mono", monospace' }}>
              {popupInfo.tractId}
            </div>
          </div>
          {/* Normalized risk badge */}
          <div style={{
            background: 'rgba(0,229,255,0.1)',
            border: '1px solid rgba(0,229,255,0.3)',
            borderRadius: '8px',
            padding: '4px 10px',
            textAlign: 'center',
            flexShrink: 0,
            marginLeft: '10px',
          }}>
            <div style={{ fontSize: '0.6rem', color: 'rgba(229,231,235,0.4)', letterSpacing: '0.06em' }}>RISK</div>
            <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '1rem', fontWeight: 700, color: '#00E5FF', lineHeight: 1.1 }}>
              {normalizedRisk.toFixed(1)}
            </div>
            <div style={{ fontSize: '0.58rem', color: 'rgba(229,231,235,0.35)' }}>/ 10</div>
          </div>
        </div>

        {/* Heat risk badge */}
        <div style={{
          display: 'inline-block',
          background: risk.color + '22',
          color: risk.color,
          border: `1px solid ${risk.color}44`,
          borderRadius: '20px',
          padding: '2px 10px',
          fontSize: '0.72rem',
          fontWeight: 600,
          marginBottom: '12px',
        }}>
          {risk.label}
        </div>

        {/* Metadata section */}
        {isTractDetailLoading ? (
          /* Loading skeleton */
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '10px' }}>
            {[80, 65, 75, 60, 70].map((w, i) => (
              <div key={i} style={{
                height: '14px',
                width: `${w}%`,
                background: 'rgba(255,255,255,0.06)',
                borderRadius: '4px',
                marginBottom: '6px',
                animation: 'pulse 1.4s ease-in-out infinite',
              }} />
            ))}
          </div>
        ) : tractDetail ? (
          <>
            {/* Environment stats */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '10px', marginBottom: '8px' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(229,231,235,0.3)', marginBottom: '6px' }}>
                ENVIRONMENT
              </div>
              <StatRow
                label="Afternoon Temp"
                value={fmt(tractDetail.mean_afternoon_temp, 1, '°F')}
              />
              <StatRow
                label="Tree Coverage"
                value={treeCovScore != null ? `${treeCovScore.toFixed(1)} / 10` : '—'}
                color={treeCovColor}
              />
              <StatRow
                label="Imperviousness"
                value={fmt(tractDetail.mean_imperv, 1, '%')}
              />
            </div>

            {/* Population / health stats */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '10px' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(229,231,235,0.3)', marginBottom: '6px' }}>
                POPULATION STATISTICS
              </div>
              <StatRow
                label="Life Expectancy"
                value={fmt(tractDetail.mean_life_expectancy, 1, ' yrs')}
              />
              <StatRow
                label="Diabetes Rate"
                value={fmt(tractDetail.mean_diabetes, 1, '%')}
              />
              <StatRow
                label="CVD Mortality"
                value={fmt(tractDetail.mean_cvd_rate, 1)}
              />
              <StatRow
                label="Under 18"
                value={fmt(tractDetail.mean_under18, 1, '%')}
              />
              <StatRow
                label="Poverty (2× FPL)"
                value={fmt(tractDetail.mean_poverty2x, 1, '%')}
              />
              <StatRow
                label="SVI Percentile"
                value={tractDetail.mean_svi_overall != null
                  ? `${(tractDetail.mean_svi_overall * 100).toFixed(0)}th`
                  : '—'}
              />
            </div>
          </>
        ) : null}
      </motion.div>
    </Popup>
  )
}
