import { create } from 'zustand'
import type { MapContext } from '../types/api'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface ChatState {
  messages: ChatMessage[]
  isLoading: boolean
  mapContext: MapContext
  // Actions
  addMessage: (msg: ChatMessage) => void
  setLoading: (v: boolean) => void
  updateMapContext: (ctx: MapContext) => void
}

export const useChatStore = create<ChatState>()((set) => ({
  messages: [{
    id: 'welcome',
    role: 'assistant',
    content: 'Hello! I\'m your UrbanAI Assistant. Click any tract on the map to analyze heat risk, or ask me about King County heat patterns.',
    timestamp: new Date(),
  }],
  isLoading: false,
  mapContext: { selected_tract_ids: [], current_scores: {} },
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setLoading: (v) => set({ isLoading: v }),
  updateMapContext: (ctx) => set({ mapContext: ctx }),
}))
