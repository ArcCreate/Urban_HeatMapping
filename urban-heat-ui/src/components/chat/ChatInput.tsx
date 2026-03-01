import { useState, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { Send, Paperclip } from 'lucide-react'

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

  return (
    <div style={{
      padding: '10px 12px 8px',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      background: '#12121A',
    }}>
      <div style={{
        display: 'flex',
        gap: '8px',
        alignItems: 'flex-end',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '12px',
        padding: '8px 10px',
      }}>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(229,231,235,0.4)', padding: '2px' }}>
          <Paperclip size={16} />
        </button>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="Ask about heat impact, zoning, or simulations..."
          disabled={disabled}
          rows={1}
          style={{
            flex: 1,
            background: 'none',
            border: 'none',
            outline: 'none',
            color: '#E5E7EB',
            fontSize: '0.82rem',
            resize: 'none',
            fontFamily: '"IBM Plex Sans", sans-serif',
            lineHeight: '1.4',
            maxHeight: '120px',
            overflowY: 'auto',
          }}
        />
        <button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: disabled || !value.trim() ? 'rgba(255,255,255,0.1)' : '#E5E7EB',
            color: disabled || !value.trim() ? 'rgba(229,231,235,0.3)' : '#0A0A0F',
            border: 'none',
            cursor: disabled || !value.trim() ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'background 0.15s',
          }}
        >
          <Send size={14} />
        </button>
      </div>
      <div style={{ textAlign: 'center', marginTop: '6px', fontSize: '0.65rem', color: 'rgba(229,231,235,0.25)', fontFamily: '"IBM Plex Sans", sans-serif' }}>
        AI can make mistakes. Review generated data.
      </div>
    </div>
  )
}
