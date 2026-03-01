import type { ReactNode, CSSProperties } from 'react'

interface GlassCardProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
}

export function GlassCard({ children, style = {} }: GlassCardProps) {
  return (
    <div style={{
      background: 'rgba(34, 34, 34, 0.92)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(255, 255, 255, 0.10)',
      borderRadius: '14px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 0.5px rgba(255,255,255,0.05)',
      ...style,
    }}>
      {children}
    </div>
  )
}
