import { Grid3x3 } from 'lucide-react'

export default function AppHeader() {
  return (
    <header className="h-14 border-b border-white/10 flex items-center px-4 shrink-0 z-50" style={{ background: '#222222' }}>
      {/* Logo */}
      <div className="flex items-center gap-2">
        <Grid3x3 size={20} className="text-[#00E5FF]" />
        <span style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '1.1rem', color: '#E5E7EB' }}>
          Urban<span style={{ color: '#00E5FF' }}>HeatAI</span>
        </span>
      </div>
    </header>
  )
}
