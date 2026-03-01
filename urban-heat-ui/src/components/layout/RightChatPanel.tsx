import { useCallback, useEffect } from 'react'
import { Bot } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { useShallow } from 'zustand/shallow'
import { useChatStore } from '../../store/chatStore'
import { useMapStore } from '../../store/mapStore'
import { postChat } from '../../api/chat'
import { ChatMessage } from '../chat/ChatMessage'
import { ChatInput } from '../chat/ChatInput'
import { useChatScroll } from '../../hooks/useChatScroll'

export function RightChatPanel() {
  const { messages, isLoading, mapContext, addMessage, setLoading, updateMapContext } = useChatStore(
    useShallow((s) => ({
      messages: s.messages,
      isLoading: s.isLoading,
      mapContext: s.mapContext,
      addMessage: s.addMessage,
      setLoading: s.setLoading,
      updateMapContext: s.updateMapContext,
    }))
  )

  const { tractDetail, selectedTractId } = useMapStore(
    useShallow((s) => ({
      tractDetail: s.tractDetail,
      selectedTractId: s.selectedTractId,
    }))
  )

  const { containerRef, endRef } = useChatScroll(messages)

  // Reactively sync full tract data into chat context whenever selection or detail changes
  useEffect(() => {
    if (!selectedTractId) {
      updateMapContext({ selected_tract_ids: [], current_scores: {}, tract_data: [] })
      return
    }
    // Tract selected but detail not yet loaded (or stale from previous selection)
    if (!tractDetail || tractDetail.tract_id !== selectedTractId) {
      updateMapContext({ selected_tract_ids: [selectedTractId], current_scores: {}, tract_data: [] })
      return
    }
    // Full data available — pass everything to the backend
    updateMapContext({
      selected_tract_ids: [selectedTractId],
      current_scores: {
        [selectedTractId]: {
          xgb_heat_score: tractDetail.xgb_heat_score,
          xgb_risk_score: tractDetail.xgb_risk_score,
          tf_risk_score: tractDetail.tf_risk_score,
        },
      },
      tract_data: [{
        tract_id: selectedTractId,
        city_name: tractDetail.city_name ?? undefined,
        xgb_heat_score: tractDetail.xgb_heat_score,
        xgb_risk_score: tractDetail.xgb_risk_score,
        tf_risk_score: tractDetail.tf_risk_score,
        mean_afternoon_temp: tractDetail.mean_afternoon_temp ?? undefined,
        mean_tree_cov: tractDetail.mean_tree_cov ?? undefined,
        mean_imperv: tractDetail.mean_imperv ?? undefined,
        mean_dist_water: tractDetail.mean_dist_water ?? undefined,
        mean_life_expectancy: tractDetail.mean_life_expectancy ?? undefined,
        mean_svi_overall: tractDetail.mean_svi_overall ?? undefined,
        mean_poverty2x: tractDetail.mean_poverty2x ?? undefined,
        mean_disability: tractDetail.mean_disability ?? undefined,
        mean_cvd_rate: tractDetail.mean_cvd_rate ?? undefined,
        mean_diabetes: tractDetail.mean_diabetes ?? undefined,
      }],
    })
  }, [tractDetail, selectedTractId, updateMapContext])

  const handleSend = useCallback(async (text: string) => {
    addMessage({ id: `user-${Date.now()}`, role: 'user', content: text, timestamp: new Date() })
    setLoading(true)
    try {
      const response = await postChat({ message: text, map_context: mapContext })
      addMessage({ id: `ai-${Date.now()}`, role: 'assistant', content: response.reply, timestamp: new Date() })
    } catch {
      addMessage({
        id: `err-${Date.now()}`, role: 'assistant',
        content: 'Could not reach the AI assistant. Ensure the backend is running at localhost:8000.',
        timestamp: new Date(),
      })
    } finally {
      setLoading(false)
    }
  }, [addMessage, setLoading, mapContext])

  const selectedCount = mapContext.selected_tract_ids.length

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: '#222222', fontFamily: '"IBM Plex Sans", sans-serif',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '34px', height: '34px', borderRadius: '50%',
            background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Bot size={17} color="#7C3AED" />
          </div>
          <div>
            <div style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: '0.9rem', color: '#E5E7EB' }}>
              UrbanAI Assistant
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4CAF50', display: 'inline-block' }} />
              <span style={{ fontSize: '0.68rem', color: '#4CAF50' }}>Dataset connected</span>
            </div>
          </div>
          {selectedCount > 0 && (
            <div style={{
              marginLeft: 'auto',
              background: 'rgba(0,229,255,0.08)', color: '#00E5FF',
              border: '1px solid rgba(0,229,255,0.2)',
              borderRadius: '12px', padding: '2px 9px',
              fontSize: '0.67rem', fontWeight: 600, flexShrink: 0,
            }}>
              {selectedCount} tract{selectedCount > 1 ? 's' : ''} selected
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={containerRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 0 4px' }}>
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <ChatMessage message={msg} />
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ padding: '0 12px 8px', display: 'flex', gap: '8px', alignItems: 'center' }}
          >
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%',
              background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Bot size={14} color="#7C3AED" />
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '4px 12px 12px 12px', padding: '10px 14px',
              color: 'rgba(229,231,235,0.45)', fontSize: '0.8rem',
              fontFamily: '"IBM Plex Sans", sans-serif',
            }}>
              Querying dataset...
            </div>
          </motion.div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} disabled={isLoading} />
    </div>
  )
}
