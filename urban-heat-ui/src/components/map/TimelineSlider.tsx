import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, Clock } from 'lucide-react'
import { GlassCard } from '../ui/GlassCard'
import { useMapStore, useShallow } from '../../store/mapStore'

const MIN_YEAR = 2025
const MAX_YEAR = 2050
const DEBOUNCE_MS = 160   // feels instant but avoids hammering the API on every px

export function TimelineSlider() {
  const { projectionYear, fetchProjectionYear, isProjectionLoading } = useMapStore(
    useShallow((s) => ({
      projectionYear: s.projectionYear,
      fetchProjectionYear: s.fetchProjectionYear,
      isProjectionLoading: s.isProjectionLoading,
    }))
  )

  // localYear drives the knob and label instantly; store update is debounced
  const [localYear, setLocalYear] = useState(projectionYear)
  const [playing, setPlaying] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Keep localYear in sync when store changes externally (e.g. autoplay)
  useEffect(() => { setLocalYear(projectionYear) }, [projectionYear])

  const debouncedFetch = useCallback((year: number) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchProjectionYear(year), DEBOUNCE_MS)
  }, [fetchProjectionYear])

  function handleSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const year = Number(e.target.value)
    setLocalYear(year)       // instant — knob + label snap immediately
    debouncedFetch(year)     // map updates after short pause
  }

  // Autoplay: advance one year every 900ms, pause while loading
  useEffect(() => {
    if (playing) {
      playIntervalRef.current = setInterval(() => {
        if (isProjectionLoading) return   // skip tick if previous fetch still pending
        setLocalYear((prev) => {
          const next = prev < MAX_YEAR ? prev + 1 : MIN_YEAR
          fetchProjectionYear(next)
          return next
        })
      }, 900)
    } else {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current)
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current)
    }
  }, [playing, isProjectionLoading, fetchProjectionYear])

  const pct = ((localYear - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100

  // Gradient shifts from green → amber → red as years progress
  const trackGradient = `linear-gradient(to right,
    #4CAF50 0%,
    #8BC34A ${pct * 0.4}%,
    #FFC107 ${pct * 0.7}%,
    #FF8C00 ${pct}%,
    rgba(255,255,255,0.12) ${pct}%,
    rgba(255,255,255,0.12) 100%
  )`

  return (
    <div style={{
      position: 'absolute',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 10,
      width: 'calc(100% - 40px)',
      maxWidth: '520px',
      pointerEvents: 'auto',
    }}>
      <GlassCard style={{ padding: '12px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Clock size={14} color="rgba(229,231,235,0.5)" />
          <span style={{
            fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em',
            color: 'rgba(232,235,242,0.50)', fontFamily: '"IBM Plex Mono", monospace',
            whiteSpace: 'nowrap',
          }}>
            {localYear === 2025 ? 'BASELINE 2025' : 'PROJECTION'}
          </span>

          {/* Track + knob */}
          <div style={{ flex: 1, position: 'relative', height: '6px', margin: '0 4px' }}>
            <div style={{
              position: 'absolute', inset: 0,
              borderRadius: '3px',
              background: trackGradient,
            }} />
            <input
              type="range"
              min={MIN_YEAR}
              max={MAX_YEAR}
              value={localYear}
              onChange={handleSliderChange}
              style={{
                position: 'absolute', inset: 0, width: '100%',
                opacity: 0, cursor: 'pointer', margin: 0,
              }}
            />
            <div style={{
              position: 'absolute', top: '50%', left: `${pct}%`,
              transform: 'translate(-50%, -50%)',
              width: '14px', height: '14px', borderRadius: '50%',
              background: isProjectionLoading ? '#FFC107' : '#E5E7EB',
              boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
              pointerEvents: 'none',
              transition: 'background 0.2s',
            }} />
          </div>

          {/* Year label */}
          <span style={{
            fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.9rem', fontWeight: 700,
            color: localYear === 2025 ? '#4CAF50' : isProjectionLoading ? '#FFC107' : '#E5E7EB',
            minWidth: '44px', textAlign: 'center',
            transition: 'color 0.2s',
          }}>
            {localYear}
          </span>

          {/* Play/pause */}
          <button
            onClick={() => setPlaying((p) => !p)}
            style={{
              background: playing ? 'rgba(0,229,255,0.15)' : 'rgba(255,255,255,0.1)',
              border: playing ? '1px solid rgba(0,229,255,0.3)' : '1px solid transparent',
              borderRadius: '50%', width: '28px', height: '28px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#E5E7EB', flexShrink: 0,
              transition: 'background 0.2s, border 0.2s',
            }}
          >
            {playing ? <Pause size={12} /> : <Play size={12} />}
          </button>
        </div>

        {/* Year markers */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          marginTop: '5px', paddingLeft: '24px', paddingRight: '68px',
        }}>
          {[2025, 2030, 2035, 2040, 2045, 2050].map((y) => (
            <span key={y} style={{
              fontSize: '0.58rem', fontFamily: '"IBM Plex Mono", monospace',
              color: y === localYear ? '#E5E7EB' : 'rgba(229,231,235,0.28)',
              fontWeight: y === localYear ? 700 : 400,
              transition: 'color 0.15s',
            }}>
              {y}
            </span>
          ))}
        </div>
      </GlassCard>
    </div>
  )
}
