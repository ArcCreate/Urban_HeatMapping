import type { ReactNode, CSSProperties } from 'react'

interface GlassCardProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
}

export function GlassCard({ children, style = {} }: GlassCardProps) {
  return (
    <div style={{
      background: 'rgba(22, 25, 34, 0.92)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(255, 255, 255, 0.10)',
      borderRadius: '14px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.40), 0 1px 3px rgba(0,0,0,0.25)',
      ...style,
    }}>
      {children}
    </div>
  )
}
