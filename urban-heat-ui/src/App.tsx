import AppHeader from './components/layout/AppHeader'

export default function App() {
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
        {/* Center map — filled in Plan 02 */}
        <main className="flex-1 relative overflow-hidden" style={{ background: '#0A0A0F' }}>
          <div className="absolute inset-0 flex items-center justify-center text-white/20 text-sm" style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}>
            Heat map — coming soon
          </div>
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
