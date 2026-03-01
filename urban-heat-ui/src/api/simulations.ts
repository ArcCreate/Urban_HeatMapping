import type { WhatIfRequest, SimulationResult } from '../types/api'

export async function postWhatIf(req: WhatIfRequest): Promise<SimulationResult> {
  const res = await fetch('/api/v1/simulations/what-if', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error(`Simulation failed: ${res.status}`)
  return res.json()
}
