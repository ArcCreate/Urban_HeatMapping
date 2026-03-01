import { useState } from 'react'
import { Play, Pause, Clock } from 'lucide-react'
import { GlassCard } from '../ui/GlassCard'

const MIN_YEAR = 2024
const MAX_YEAR = 2035

export function TimelineSlider() {
  const [year, setYear] = useState(MIN_YEAR)
  const [playing, setPlaying] = useState(false)

  // Progress percentage for gradient track
  const pct = ((year - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100

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
          {/* Clock icon + label */}
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
            {/* Gradient track */}
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
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
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

          {/* Year label */}
          <span style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: '0.85rem',
            fontWeight: 700,
            color: '#E5E7EB',
            minWidth: '40px',
            textAlign: 'center',
          }}>
            {year}
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
