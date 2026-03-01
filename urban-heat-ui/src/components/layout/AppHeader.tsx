import { Grid3x3, Bell } from 'lucide-react'

export default function AppHeader() {
  return (
    <header className="h-14 bg-[#12121A] border-b border-white/10 flex items-center px-4 gap-4 shrink-0 z-50">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-4">
        <Grid3x3 size={20} className="text-[#00E5FF]" />
        <span style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '1.1rem', color: '#E5E7EB' }}>
          Urban<span style={{ color: '#00E5FF' }}>HeatAI</span>
        </span>
      </div>
      {/* Nav tabs */}
      <nav className="flex gap-1">
        {['Dashboard', 'Analysis', 'Reports'].map((tab) => (
          <button
            key={tab}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              tab === 'Dashboard'
                ? 'bg-white/10 text-white'
                : 'text-white/50 hover:text-white/80'
            }`}
            style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
          >
            {tab}
          </button>
        ))}
      </nav>
      {/* Spacer */}
      <div className="flex-1" />
      {/* Bell */}
      <button className="p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors">
        <Bell size={18} />
      </button>
      {/* User profile */}
      <div className="flex items-center gap-2 pl-2 border-l border-white/10">
        <div className="w-8 h-8 rounded-full bg-[#00BFA5] flex items-center justify-center text-sm font-semibold text-[#0A0A0F]">
          AM
        </div>
        <div className="hidden sm:block">
          <div className="text-sm font-medium text-white/90" style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}>Alex Morgan</div>
          <div className="text-xs text-white/40" style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}>Lead Planner</div>
        </div>
      </div>
    </header>
  )
}
