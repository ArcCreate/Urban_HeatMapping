import type { ChatRequest, ChatResponse } from '../types/api'

export async function postChat(req: ChatRequest): Promise<ChatResponse> {
  const res = await fetch('/api/v1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error(`Chat request failed: ${res.status}`)
  return res.json()
}
