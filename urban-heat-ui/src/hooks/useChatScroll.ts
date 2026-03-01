import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../store/chatStore'

export function useChatScroll(messages: ChatMessage[]) {
  const containerRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const end = endRef.current
    if (!container || !end) return
    const { scrollTop, scrollHeight, clientHeight } = container
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 120
    if (isNearBottom) {
      end.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  return { containerRef, endRef }
}
