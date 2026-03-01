import { useCallback } from 'react'
import { Bot } from 'lucide-react'
import { useShallow } from 'zustand/shallow'
import { useChatStore } from '../../store/chatStore'
import { useMapStore } from '../../store/mapStore'
import { postChat } from '../../api/chat'
import { ChatMessage } from '../chat/ChatMessage'
import { ChatInput } from '../chat/ChatInput'
import { QuickChips } from '../chat/QuickChips'
import { useChatScroll } from '../../hooks/useChatScroll'

export function RightChatPanel() {
  const { messages, isLoading, mapContext, addMessage, setLoading } = useChatStore(
    useShallow((s) => ({
      messages: s.messages,
      isLoading: s.isLoading,
      mapContext: s.mapContext,
      addMessage: s.addMessage,
      setLoading: s.setLoading,
    }))
  )

  const selectedTractId = useMapStore((s) => s.selectedTractId)
  const { containerRef, endRef } = useChatScroll(messages)

  const handleSend = useCallback(async (text: string) => {
    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user' as const,
      content: text,
      timestamp: new Date(),
    }
    addMessage(userMsg)
    setLoading(true)

    try {
      const response = await postChat({
        message: text,
        map_context: mapContext,
      })
      addMessage({
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: response.reply,
        timestamp: new Date(),
      })
    } catch {
      addMessage({
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, I could not reach the AI assistant. Please ensure the backend is running at localhost:8000.',
        timestamp: new Date(),
      })
    } finally {
      setLoading(false)
    }
  }, [addMessage, setLoading, mapContext])

  const selectedCount = mapContext.selected_tract_ids.length

  // selectedTractId used for future expansion (e.g. single-tract highlighting)
  void selectedTractId

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#12121A',
      fontFamily: '"IBM Plex Sans", sans-serif',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <div style={{
            width: '34px', height: '34px', borderRadius: '50%',
            background: 'rgba(124,58,237,0.2)',
            border: '2px solid rgba(124,58,237,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1rem',
          }}>
            <Bot size={18} color="#7C3AED" />
          </div>
          <div>
            <div style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '0.9rem', color: '#E5E7EB' }}>
              UrbanAI Assistant
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4CAF50', display: 'inline-block' }} />
              <span style={{ fontSize: '0.7rem', color: '#4CAF50' }}>Online & Analyzing</span>
            </div>
          </div>
          {selectedCount > 0 && (
            <div style={{
              marginLeft: 'auto',
              background: 'rgba(0,229,255,0.1)',
              color: '#00E5FF',
              border: '1px solid rgba(0,229,255,0.25)',
              borderRadius: '12px',
              padding: '2px 8px',
              fontSize: '0.68rem',
              fontWeight: 600,
            }}>
              Analyzing {selectedCount} tract{selectedCount > 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={containerRef}
        style={{ flex: 1, overflowY: 'auto', padding: '12px 0 4px' }}
      >
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {isLoading && (
          <div style={{ padding: '0 12px 8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%',
              background: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.75rem', flexShrink: 0,
            }}>🤖</div>
            <div style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '4px 12px 12px 12px',
              padding: '10px 14px',
              color: 'rgba(229,231,235,0.5)',
              fontSize: '0.82rem',
            }}>
              Analyzing...
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Quick chips */}
      <QuickChips onChip={handleSend} />

      {/* Input */}
      <ChatInput onSend={handleSend} disabled={isLoading} />
    </div>
  )
}
