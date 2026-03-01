import { Bot, User } from 'lucide-react'
import type { ChatMessage as ChatMsg } from '../../store/chatStore'

interface Props { message: ChatMsg }

export function ChatMessage({ message }: Props) {
  const isAI = message.role === 'assistant'
  return (
    <div style={{
      display: 'flex', flexDirection: isAI ? 'row' : 'row-reverse',
      gap: '8px', alignItems: 'flex-end',
      marginBottom: '12px', padding: '0 12px',
    }}>
      <div style={{
        width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
        background: isAI ? 'rgba(124,58,237,0.2)' : 'rgba(0,191,165,0.15)',
        border: isAI ? '1px solid rgba(124,58,237,0.3)' : '1px solid rgba(0,191,165,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isAI
          ? <Bot size={14} color="#7C3AED" />
          : <User size={14} color="#00BFA5" />
        }
      </div>
      <div style={{ maxWidth: '78%' }}>
        <div style={{
          background: isAI ? 'rgba(255,255,255,0.05)' : 'rgba(0,191,165,0.09)',
          border: isAI ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,191,165,0.18)',
          borderRadius: isAI ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
          padding: '10px 14px', color: '#E5E7EB',
          fontSize: '0.82rem', lineHeight: '1.55',
          fontFamily: '"IBM Plex Sans", sans-serif',
          whiteSpace: 'pre-wrap',
        }}>
          {message.content}
        </div>
        <div style={{
          fontSize: '0.62rem', color: 'rgba(229,231,235,0.28)',
          marginTop: '3px', textAlign: isAI ? 'left' : 'right',
          fontFamily: '"IBM Plex Mono", monospace',
        }}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  )
}
