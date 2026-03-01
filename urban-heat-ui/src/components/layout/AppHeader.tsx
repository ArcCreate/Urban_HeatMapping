import { Grid3x3 } from 'lucide-react'

export default function AppHeader() {
  return (
    <header
      className="h-14 flex items-center px-4 shrink-0 z-50"
      style={{ background: '#111318', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="flex items-center gap-2">
        <Grid3x3 size={20} color="#FF6B6B" />
        <span style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '1.1rem', color: '#E8EBF2' }}>
          <span style={{ color: '#FF6B6B' }}>OASIS</span>
        </span>
      </div>
    </header>
  )
}
