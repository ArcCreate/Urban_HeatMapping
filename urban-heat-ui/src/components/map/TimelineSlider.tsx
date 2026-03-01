import { useState, useEffect, useRef } from 'react'
import { Play, Pause, Clock } from 'lucide-react'
import { GlassCard } from '../ui/GlassCard'
import { useMapStore, useShallow } from '../../store/mapStore'

const MIN_YEAR = 2025
const MAX_YEAR = 2050

export function TimelineSlider() {
  const { projectionYear, fetchProjectionYear, isProjectionLoading } = useMapStore(
    useShallow((s) => ({
      projectionYear: s.projectionYear,
      fetchProjectionYear: s.fetchProjectionYear,
      isProjectionLoading: s.isProjectionLoading,
    }))
  )
  const [playing, setPlaying] = useState(false)
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auto-play: advance one year per 1.5s, wrap back to MIN_YEAR at MAX_YEAR
  useEffect(() => {
    if (playing) {
      playIntervalRef.current = setInterval(() => {
        const next = projectionYear < MAX_YEAR ? projectionYear + 1 : MIN_YEAR
        fetchProjectionYear(next)
      }, 1500)
    } else {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current)
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current)
    }
  }, [playing, projectionYear, fetchProjectionYear])

  // Progress percentage for gradient track
  const pct = ((projectionYear - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100

  return (
    <div style={{
      position: 'absolute',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 10,
      width: 'calc(100% - 40px)',
      maxWidth: '480px',
      pointerEvents: 'auto',
    }}>
      <GlassCard style={{ padding: '12px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Clock size={14} color="rgba(229,231,235,0.5)" />
          <span style={{
            fontSize: '0.65rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'rgba(229,231,235,0.5)',
            fontFamily: '"IBM Plex Mono", monospace',
            whiteSpace: 'nowrap',
          }}>
            FUTURE PROJECTION TIMELINE
          </span>

          {/* Slider */}
          <div style={{ flex: 1, position: 'relative', height: '6px', margin: '0 6px' }}>
            <div style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '3px',
              background: `linear-gradient(to right, #4CAF50 0%, #4CAF50 ${pct}%, #FFC107 ${pct}%, #FF8C00 100%)`,
            }} />
            <input
              type="range"
              min={MIN_YEAR}
              max={MAX_YEAR}
              value={projectionYear}
              onChange={(e) => fetchProjectionYear(Number(e.target.value))}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                opacity: 0,
                cursor: 'pointer',
                margin: 0,
              }}
            />
            {/* Scrubber knob */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: `${pct}%`,
              transform: 'translate(-50%, -50%)',
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              background: '#E5E7EB',
              boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
              pointerEvents: 'none',
            }} />
          </div>

          {/* Year label — shows loading indicator when fetching */}
          <span style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: '0.85rem',
            fontWeight: 700,
            color: isProjectionLoading ? '#FFC107' : '#E5E7EB',
            minWidth: '40px',
            textAlign: 'center',
          }}>
            {isProjectionLoading ? '···' : projectionYear}
          </span>

          {/* Play/pause */}
          <button
            onClick={() => setPlaying((p) => !p)}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: '50%',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#E5E7EB',
              flexShrink: 0,
            }}
          >
            {playing ? <Pause size={12} /> : <Play size={12} />}
          </button>
        </div>
      </GlassCard>
    </div>
  )
}
