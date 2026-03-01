import { Popup } from 'react-map-gl/maplibre'
import type { PopupInfo } from '../../types/map'

function getRiskLevel(score: number): { label: string; color: string } {
  if (score >= 0.75) return { label: 'High Heat Risk Alert', color: '#F44336' }
  if (score >= 0.5) return { label: 'Moderate Heat Risk', color: '#FFC107' }
  return { label: 'Low Heat Risk', color: '#4CAF50' }
}

function getRiskTags(props: PopupInfo): string[] {
  const tags: string[] = []
  if (props.xgb_heat_score >= 0.75) tags.push('Extreme Heat Zone')
  if (props.xgb_risk_score >= 0.75) tags.push('High Health Risk')
  if (props.tf_risk_score >= 0.75) tags.push('Model Consensus Risk')
  if (props.xgb_heat_score >= 0.6) tags.push('Low Tree Coverage')
  if (props.xgb_risk_score >= 0.6) tags.push('Vulnerable Population')
  if (tags.length === 0) tags.push('Below Average Risk')
  return tags.slice(0, 4)
}

interface TractPopupProps {
  popupInfo: PopupInfo
  onClose: () => void
}

export function TractPopup({ popupInfo, onClose }: TractPopupProps) {
  const risk = getRiskLevel(popupInfo.xgb_heat_score)
  const tags = getRiskTags(popupInfo)

  return (
    <Popup
      longitude={popupInfo.longitude}
      latitude={popupInfo.latitude}
      anchor="bottom-left"
      onClose={onClose}
      closeButton={true}
      offset={12}
      style={{ maxWidth: '280px' }}
    >
      <div
        style={{
          background: 'rgba(18, 18, 26, 0.95)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px',
          padding: '16px',
          color: '#E5E7EB',
          fontFamily: '"IBM Plex Sans", sans-serif',
          minWidth: '240px',
        }}
      >
        {/* Zone label */}
        <div style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '0.95rem', marginBottom: '4px' }}>
          Zone {popupInfo.tractId.slice(-5)}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'rgba(229,231,235,0.5)', marginBottom: '10px', fontFamily: '"IBM Plex Mono", monospace' }}>
          {popupInfo.tractId}
        </div>

        {/* Risk badge */}
        <div style={{
          display: 'inline-block',
          background: risk.color + '22',
          color: risk.color,
          border: `1px solid ${risk.color}44`,
          borderRadius: '20px',
          padding: '2px 10px',
          fontSize: '0.75rem',
          fontWeight: 600,
          marginBottom: '12px',
        }}>
          {risk.label}
        </div>

        {/* Scores row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
          {[
            { label: 'Heat', value: popupInfo.xgb_heat_score },
            { label: 'XGB Risk', value: popupInfo.xgb_risk_score },
            { label: 'TF Risk', value: popupInfo.tf_risk_score },
          ].map(({ label, value }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.65rem', color: 'rgba(229,231,235,0.4)', marginBottom: '2px' }}>{label}</div>
              <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.9rem', fontWeight: 600, color: '#E5E7EB' }}>
                {(value * 100).toFixed(0)}
              </div>
            </div>
          ))}
        </div>

        {/* WHY NOT BUILD HERE */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '10px' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(229,231,235,0.4)', marginBottom: '8px' }}>
            WHY NOT BUILD HERE
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {tags.map((tag) => (
              <span key={tag} style={{
                background: 'rgba(255,45,45,0.15)',
                color: '#FF6B6B',
                border: '1px solid rgba(255,45,45,0.3)',
                borderRadius: '20px',
                padding: '2px 8px',
                fontSize: '0.7rem',
              }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Popup>
  )
}
