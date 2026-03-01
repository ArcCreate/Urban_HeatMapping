import { GlassCard } from '../ui/GlassCard'
import { useMapStore } from '../../store/mapStore'

export function MapFloatingCard() {
  const isLoading = useMapStore((s) => s.isMapLoading)

  return (
    <div style={{
      position: 'absolute',
      top: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 10,
      pointerEvents: 'auto',
    }}>
      <GlassCard style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* County label */}
        <div>
          <div style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '0.9rem', color: '#E5E7EB' }}>
            King County, WA
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
            <span style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: isLoading ? '#FFC107' : '#4CAF50',
              display: 'inline-block',
              boxShadow: isLoading ? '0 0 6px #FFC107' : '0 0 6px #4CAF50',
            }} />
            <span style={{ fontSize: '0.68rem', color: isLoading ? '#FFC107' : '#4CAF50', fontFamily: '"IBM Plex Sans", sans-serif' }}>
              {isLoading ? 'Loading Data...' : 'Live Terrain Data'}
            </span>
          </div>
        </div>
        {/* Divider */}
        <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.1)' }} />
        {/* Heatmap toggle button (cosmetic in v1.1) */}
        <button style={{
          background: 'rgba(0,229,255,0.12)',
          color: '#00E5FF',
          border: '1px solid rgba(0,229,255,0.3)',
          borderRadius: '8px',
          padding: '4px 12px',
          fontSize: '0.75rem',
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: '"IBM Plex Sans", sans-serif',
        }}>
          Heatmap
        </button>
      </GlassCard>
    </div>
  )
}
