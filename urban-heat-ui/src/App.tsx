import AppHeader from './components/layout/AppHeader'
import { HeatMap } from './components/map/HeatMap'
import { useTractData } from './hooks/useTractData'

export default function App() {
  // Initiate GeoJSON + ranked tracts fetch on mount
  useTractData()

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: '#0A0A0F' }}>
      <AppHeader />
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — filled in Plan 03 */}
        <aside
          className="shrink-0 overflow-y-auto border-r border-white/10"
          style={{ width: '280px', background: '#12121A' }}
        >
          <div className="p-4 text-white/30 text-sm" style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}>
            Location sidebar — coming soon
          </div>
        </aside>

        {/* Center map — live! */}
        <main className="flex-1 relative overflow-hidden">
          <HeatMap />
        </main>

        {/* Right chat panel — filled in Plan 03 */}
        <aside
          className="shrink-0 overflow-y-auto border-l border-white/10 flex flex-col"
          style={{ width: '340px', background: '#12121A' }}
        >
          <div className="p-4 text-white/30 text-sm" style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}>
            AI chat — coming soon
          </div>
        </aside>
      </div>
    </div>
  )
}
