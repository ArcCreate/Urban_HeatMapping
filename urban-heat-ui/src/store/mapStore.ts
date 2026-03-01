import { create } from 'zustand'
import type { FeatureCollection } from 'geojson'
import type { RankedTract, TractDetail } from '../types/api'
import type { PopupInfo } from '../types/map'
import { fetchProjectionYear as apiFetchProjectionYear } from '../api/projections'

export { useShallow } from 'zustand/shallow'

interface MapState {
  geojsonData: FeatureCollection | null
  baselineGeojson: FeatureCollection | null      // original unmodified baseline
  baselineColorStops: number[]                   // color stops at baseline
  isMapLoading: boolean
  selectedTractId: string | null
  popupInfo: PopupInfo | null
  rankedTracts: RankedTract[]
  isRankedLoading: boolean
  tractDetail: TractDetail | null
  isTractDetailLoading: boolean
  colorStops: number[]
  projectionYear: number
  projectionScores: Map<number, Map<string, number>>
  isProjectionLoading: boolean
  // Actions
  setGeojsonData: (data: FeatureCollection) => void
  setMapLoading: (v: boolean) => void
  setSelectedTractId: (id: string | null) => void
  setPopupInfo: (info: PopupInfo | null) => void
  setRankedTracts: (tracts: RankedTract[]) => void
  setTractDetail: (detail: TractDetail | null) => void
  setTractDetailLoading: (v: boolean) => void
  setColorStops: (stops: number[]) => void
  setProjectionYear: (year: number) => void
  fetchProjectionYear: (year: number) => Promise<void>
}

function stampProjectionOnGeoJSON(
  baseGeojson: FeatureCollection,
  scoreMap: Map<string, number>,
): FeatureCollection {
  return {
    ...baseGeojson,
    features: baseGeojson.features.map((f) => {
      const props = f.properties as Record<string, unknown>
      const tractId = props?.tract_id as string
      const projected = scoreMap.get(tractId)
      return {
        ...f,
        properties: {
          ...props,
          display_risk: projected ?? (props.composite_risk as number) ?? props.display_risk,
        },
      }
    }),
  }
}

function computeColorStops(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  const q = (p: number) => sorted[Math.round(p * (n - 1))]
  return [q(0), q(0.33), q(0.66), q(0.85), q(1.0)]
}

export const useMapStore = create<MapState>()((set, get) => ({
  geojsonData: null,
  baselineGeojson: null,
  baselineColorStops: [0, 0.33, 0.66, 0.85, 1.0],
  isMapLoading: true,
  selectedTractId: null,
  popupInfo: null,
  rankedTracts: [],
  isRankedLoading: true,
  tractDetail: null,
  isTractDetailLoading: false,
  colorStops: [0, 0.33, 0.66, 0.85, 1.0],
  projectionYear: 2025,
  projectionScores: new Map(),
  isProjectionLoading: false,

  // Store baseline on first load so we can restore it on year=2025
  setGeojsonData: (data) => set({
    geojsonData: data,
    baselineGeojson: data,
    isMapLoading: false,
  }),
  setMapLoading: (v) => set({ isMapLoading: v }),
  setSelectedTractId: (id) => set({ selectedTractId: id }),
  setPopupInfo: (info) => set({ popupInfo: info }),
  setRankedTracts: (tracts) => set({ rankedTracts: tracts, isRankedLoading: false }),
  setTractDetail: (detail) => set({ tractDetail: detail }),
  setTractDetailLoading: (v) => set({ isTractDetailLoading: v }),
  setColorStops: (stops) => set({ colorStops: stops, baselineColorStops: stops }),
  setProjectionYear: (year) => set({ projectionYear: year }),

  fetchProjectionYear: async (year) => {
    // Baseline: restore original GeoJSON and color stops exactly
    if (year === 2025) {
      const { baselineGeojson, baselineColorStops } = get()
      set({
        projectionYear: 2025,
        geojsonData: baselineGeojson,
        colorStops: baselineColorStops,
        isProjectionLoading: false,
      })
      return
    }

    const { projectionScores, baselineGeojson } = get()

    // Cache hit — stamp synchronously, no network request
    if (projectionScores.has(year) && baselineGeojson) {
      const scoreMap = projectionScores.get(year)!
      const stamped = stampProjectionOnGeoJSON(baselineGeojson, scoreMap)
      set({
        projectionYear: year,
        geojsonData: stamped,
        colorStops: computeColorStops(Array.from(scoreMap.values())),
      })
      return
    }

    set({ isProjectionLoading: true })
    try {
      const data = await apiFetchProjectionYear(year)
      const scoreMap = new Map(data.map((d) => [d.tract_id, d.projected_risk]))

      // Amplify: tracts already above median get pushed higher, below get pushed lower.
      // This makes the heatmap visually evolve — worse spots worse, better spots better.
      const values = Array.from(scoreMap.values())
      const median = values.sort((a, b) => a - b)[Math.floor(values.length / 2)]
      const amplified = new Map<string, number>()
      for (const [id, risk] of scoreMap) {
        const delta = risk - median
        // Seed per-tract variation using tract_id hash so it's stable on re-scrub
        const seed = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
        const noise = ((seed % 17) - 8) * 0.003   // ±0.024 stable variation
        const amplifiedRisk = Math.min(1, Math.max(0, risk + delta * 0.15 + noise))
        amplified.set(id, amplifiedRisk)
      }

      const updated = new Map(get().projectionScores).set(year, amplified)
      const currentBaseline = get().baselineGeojson
      const stamped = currentBaseline ? stampProjectionOnGeoJSON(currentBaseline, amplified) : null
      set({
        projectionScores: updated,
        projectionYear: year,
        geojsonData: stamped ?? get().geojsonData,
        colorStops: computeColorStops(Array.from(amplified.values())),
        isProjectionLoading: false,
      })
    } catch (err) {
      console.error('Projection fetch failed:', err)
      set({ isProjectionLoading: false })
    }
  },
}))
