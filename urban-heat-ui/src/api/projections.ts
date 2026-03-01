// urban-heat-ui/src/api/projections.ts

export interface ProjectedTractScore {
  tract_id: string
  year: number
  projected_risk: number
}

export async function fetchProjectionYear(year: number): Promise<ProjectedTractScore[]> {
  const res = await fetch(`/api/v1/projections/${year}`)
  if (!res.ok) throw new Error(`Projection fetch failed: ${res.status}`)
  return res.json()
}

export async function fetchProjectionSeries(tractId: string): Promise<{
  tract_id: string
  projections: ProjectedTractScore[]
}> {
  const res = await fetch(`/api/v1/projections/range?tract_id=${encodeURIComponent(tractId)}`)
  if (!res.ok) throw new Error(`Projection series fetch failed: ${res.status}`)
  return res.json()
}
