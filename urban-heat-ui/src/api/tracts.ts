import type { TractsGeoJSON, TractDetail } from '../types/api'

export async function fetchTractsGeoJSON(): Promise<TractsGeoJSON> {
  const res = await fetch('/api/v1/tracts')
  if (!res.ok) throw new Error(`Tracts fetch failed: ${res.status}`)
  return res.json()
}

export async function fetchTractDetail(tractId: string): Promise<TractDetail> {
  const res = await fetch(`/api/v1/tracts/${tractId}`)
  if (!res.ok) throw new Error(`Tract detail fetch failed: ${res.status}`)
  return res.json()
}
