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
        background: isAI ? 'rgba(255,107,107,0.12)' : 'rgba(232,235,242,0.10)',
        border: isAI ? '1px solid rgba(255,107,107,0.30)' : '1px solid rgba(232,235,242,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isAI
          ? <Bot size={14} color="#FF6B6B" />
          : <User size={14} color="#C9D1E0" />
        }
      </div>
      <div style={{ maxWidth: '78%' }}>
        <div style={{
          background: isAI ? '#1C1F2A' : 'rgba(255,107,107,0.10)',
          border: isAI ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,107,107,0.22)',
          borderRadius: isAI ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
          padding: '10px 14px', color: '#E8EBF2',
          fontSize: '0.82rem', lineHeight: '1.55',
          fontFamily: '"IBM Plex Sans", sans-serif',
          whiteSpace: 'pre-wrap',
        }}>
          {message.content}
        </div>
        <div style={{
          fontSize: '0.62rem', color: 'rgba(232,235,242,0.35)',
          marginTop: '3px', textAlign: isAI ? 'left' : 'right',
          fontFamily: '"IBM Plex Mono", monospace',
        }}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  )
}
