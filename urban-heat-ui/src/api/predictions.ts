import type { RankedTract, CountySummary } from '../types/api'

export async function fetchRankedTracts(
  sortBy: 'xgb_heat_score' | 'xgb_risk_score' | 'tf_risk_score' = 'xgb_heat_score',
  order: 'asc' | 'desc' = 'desc'
): Promise<RankedTract[]> {
  const res = await fetch(`/api/v1/predictions/ranked?sort_by=${sortBy}&order=${order}`)
  if (!res.ok) throw new Error(`Ranked tracts fetch failed: ${res.status}`)
  return res.json()
}

export async function fetchCountySummary(): Promise<CountySummary> {
  const res = await fetch('/api/v1/summary/county')
  if (!res.ok) throw new Error(`Summary fetch failed: ${res.status}`)
  return res.json()
}
