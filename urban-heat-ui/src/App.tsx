import AppHeader from './components/layout/AppHeader'
import { LeftSidebar } from './components/layout/LeftSidebar'
import { HeatMap } from './components/map/HeatMap'
import { RightChatPanel } from './components/layout/RightChatPanel'
import { useTractData } from './hooks/useTractData'

export default function App() {
  useTractData()

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: '#0A0A0F' }}>
      <AppHeader />
      <div className="flex flex-1 overflow-hidden">
        <aside
          className="shrink-0 border-r border-white/10 overflow-hidden"
          style={{ width: '280px' }}
        >
          <LeftSidebar />
        </aside>
        <main className="flex-1 relative overflow-hidden">
          <HeatMap />
        </main>
        <aside
          className="shrink-0 border-l border-white/10 overflow-hidden flex flex-col"
          style={{ width: '340px' }}
        >
          <RightChatPanel />
        </aside>
      </div>
    </div>
  )
}
