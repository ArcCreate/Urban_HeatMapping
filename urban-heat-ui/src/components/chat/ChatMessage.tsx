import type { ChatMessage as ChatMsg } from '../../store/chatStore'

interface Props { message: ChatMsg }

export function ChatMessage({ message }: Props) {
  const isAI = message.role === 'assistant'
  return (
    <div style={{
      display: 'flex',
      flexDirection: isAI ? 'row' : 'row-reverse',
      gap: '8px',
      alignItems: 'flex-end',
      marginBottom: '12px',
      padding: '0 12px',
    }}>
      {/* Avatar */}
      <div style={{
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        background: isAI ? '#7C3AED' : '#00BFA5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.75rem',
        fontWeight: 700,
        color: 'white',
        flexShrink: 0,
      }}>
        {isAI ? '🤖' : 'AM'}
      </div>
      {/* Bubble */}
      <div style={{ maxWidth: '75%' }}>
        <div style={{
          background: isAI ? 'rgba(255,255,255,0.07)' : '#1F2937',
          border: isAI ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.05)',
          borderRadius: isAI ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
          padding: '10px 14px',
          color: '#E5E7EB',
          fontSize: '0.82rem',
          lineHeight: '1.5',
          fontFamily: '"IBM Plex Sans", sans-serif',
          whiteSpace: 'pre-wrap',
        }}>
          {message.content}
        </div>
        <div style={{
          fontSize: '0.65rem',
          color: 'rgba(229,231,235,0.3)',
          marginTop: '4px',
          textAlign: isAI ? 'left' : 'right',
          fontFamily: '"IBM Plex Mono", monospace',
        }}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  )
}
