import { useState, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { Send } from 'lucide-react'

interface Props {
  onSend: (message: string) => void
  disabled: boolean
}

export function ChatInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleSend() {
    const msg = value.trim()
    if (!msg || disabled) return
    onSend(msg)
    setValue('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleInput() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  const canSend = !disabled && !!value.trim()

  return (
    <div style={{
      padding: '10px 12px 12px',
      borderTop: '1px solid rgba(255,255,255,0.07)',
      background: '#222222',
      flexShrink: 0,
    }}>
      <div style={{
        display: 'flex', gap: '8px', alignItems: 'flex-end',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '12px', padding: '8px 10px',
      }}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="Ask about this zone..."
          disabled={disabled}
          rows={1}
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            color: '#E5E7EB', fontSize: '0.82rem', resize: 'none',
            fontFamily: '"IBM Plex Sans", sans-serif',
            lineHeight: '1.45', maxHeight: '120px', overflowY: 'auto',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          style={{
            width: '32px', height: '32px', borderRadius: '50%',
            background: canSend ? '#00E5FF' : 'rgba(255,255,255,0.08)',
            color: canSend ? '#1A1A1A' : 'rgba(229,231,235,0.25)',
            border: 'none', cursor: canSend ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'background 0.15s, color 0.15s',
          }}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}
