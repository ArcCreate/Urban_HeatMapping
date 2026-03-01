import { useState, useMemo } from 'react'
import { Search, Plus } from 'lucide-react'
import { useShallow } from 'zustand/shallow'
import { useMapStore } from '../../store/mapStore'
import { useChatStore } from '../../store/chatStore'
import { mapRef } from '../map/HeatMap'
import type { RankedTract } from '../../types/api'

function getSuitability(score: number): { label: string; color: string; bg: string } {
  if (score >= 0.65) return { label: 'Low', color: '#F44336', bg: 'rgba(244,67,54,0.15)' }
  if (score >= 0.35) return { label: 'Medium', color: '#FFC107', bg: 'rgba(255,193,7,0.15)' }
  return { label: 'High', color: '#4CAF50', bg: 'rgba(76,175,80,0.15)' }
}

interface LocationCardProps {
  tract: RankedTract
  isActive: boolean
  onClick: () => void
}

function LocationCard({ tract, isActive, onClick }: LocationCardProps) {
  const suit = getSuitability(tract.xgb_heat_score)
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: isActive ? 'rgba(0,191,165,0.08)' : 'transparent',
        borderLeft: isActive ? '2px solid #00BFA5' : '2px solid transparent',
        borderRadius: '0 8px 8px 0',
        padding: '10px 12px',
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
        <div>
          <div style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '0.85rem', color: '#E5E7EB' }}>
            Zone {tract.tract_id.slice(-5)}
          </div>
          <div style={{ fontFamily: '"IBM Plex Sans", sans-serif', fontSize: '0.72rem', color: 'rgba(229,231,235,0.45)' }}>
            King County, WA
          </div>
        </div>
        <div style={{ display: 'flex', gap: '4px', flexDirection: 'column', alignItems: 'flex-end' }}>
          {isActive && (
            <span style={{
              background: 'rgba(76,175,80,0.2)',
              color: '#4CAF50',
              border: '1px solid rgba(76,175,80,0.4)',
              borderRadius: '10px',
              padding: '1px 7px',
              fontSize: '0.65rem',
              fontWeight: 600,
            }}>Active</span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', color: 'rgba(229,231,235,0.6)' }}>
          Heat: {(tract.xgb_heat_score * 100).toFixed(0)}
        </div>
        <span style={{
          background: suit.bg,
          color: suit.color,
          borderRadius: '10px',
          padding: '1px 8px',
          fontSize: '0.68rem',
          fontWeight: 600,
        }}>
          {suit.label}
        </span>
      </div>
    </button>
  )
}

export function LeftSidebar() {
  const [search, setSearch] = useState('')

  const { rankedTracts, isRankedLoading, selectedTractId, setSelectedTractId } = useMapStore(
    useShallow((s) => ({
      rankedTracts: s.rankedTracts,
      isRankedLoading: s.isRankedLoading,
      selectedTractId: s.selectedTractId,
      setSelectedTractId: s.setSelectedTractId,
    }))
  )

  const updateMapContext = useChatStore((s) => s.updateMapContext)

  const filtered = useMemo(() => {
    if (!search) return rankedTracts.slice(0, 20)
    return rankedTracts
      .filter((t) => t.tract_id.toLowerCase().includes(search.toLowerCase()))
      .slice(0, 20)
  }, [rankedTracts, search])

  const today = filtered.slice(0, 8)
  const yesterday = filtered.slice(8, 16)

  function handleCardClick(tract: RankedTract) {
    setSelectedTractId(tract.tract_id)
    // Fly to King County center (all tracts are here)
    mapRef.current?.flyTo({
      center: [-122.1, 47.5],
      zoom: 10,
      duration: 1500,
      essential: true,
    })
    // Inject tract context into chat
    updateMapContext({
      selected_tract_ids: [tract.tract_id],
      current_scores: {
        [tract.tract_id]: {
          xgb_heat_score: tract.xgb_heat_score,
          xgb_risk_score: tract.xgb_risk_score,
          tf_risk_score: tract.tf_risk_score,
        }
      }
    })
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#12121A',
      fontFamily: '"IBM Plex Sans", sans-serif',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <h2 style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '0.95rem', color: '#E5E7EB', margin: '0 0 12px' }}>
          Recent Locations
        </h2>
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(229,231,235,0.4)' }} />
          <input
            type="text"
            placeholder="Search cities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              padding: '7px 10px 7px 30px',
              color: '#E5E7EB',
              fontSize: '0.8rem',
              outline: 'none',
              fontFamily: '"IBM Plex Sans", sans-serif',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Location list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {isRankedLoading ? (
          /* Loading skeletons */
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ margin: '4px 12px', height: '60px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px' }} />
          ))
        ) : (
          <>
            {today.length > 0 && (
              <>
                <div style={{ padding: '4px 14px 2px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(229,231,235,0.3)' }}>
                  TODAY
                </div>
                {today.map((tract) => (
                  <LocationCard
                    key={tract.tract_id}
                    tract={tract}
                    isActive={tract.tract_id === selectedTractId}
                    onClick={() => handleCardClick(tract)}
                  />
                ))}
              </>
            )}
            {yesterday.length > 0 && (
              <>
                <div style={{ padding: '8px 14px 2px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(229,231,235,0.3)' }}>
                  YESTERDAY
                </div>
                {yesterday.map((tract) => (
                  <LocationCard
                    key={tract.tract_id}
                    tract={tract}
                    isActive={tract.tract_id === selectedTractId}
                    onClick={() => handleCardClick(tract)}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>

      {/* New Analysis button */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button style={{
          width: '100%',
          background: '#E5E7EB',
          color: '#0A0A0F',
          border: 'none',
          borderRadius: '8px',
          padding: '10px',
          fontSize: '0.85rem',
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          fontFamily: '"DM Sans", sans-serif',
        }}>
          <Plus size={15} />
          New Analysis
        </button>
      </div>
    </div>
  )
}
