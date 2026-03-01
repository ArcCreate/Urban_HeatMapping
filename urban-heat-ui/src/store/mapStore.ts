import { create } from 'zustand'
import type { FeatureCollection } from 'geojson'
import type { RankedTract, TractDetail } from '../types/api'
import type { PopupInfo } from '../types/map'
import { fetchProjectionYear as apiFetchProjectionYear } from '../api/projections'

export { useShallow } from 'zustand/shallow'

interface MapState {
  geojsonData: FeatureCollection | null
  isMapLoading: boolean
  selectedTractId: string | null
  popupInfo: PopupInfo | null
  rankedTracts: RankedTract[]
  isRankedLoading: boolean
  tractDetail: TractDetail | null
  isTractDetailLoading: boolean
  colorStops: number[]
  projectionYear: number                             // currently displayed year (2025 = baseline)
  projectionScores: Map<number, Map<string, number>> // year → (tractId → projected_risk)
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
  geojson: FeatureCollection,
  scoreMap: Map<string, number>,
): FeatureCollection {
  return {
    ...geojson,
    features: geojson.features.map((f) => {
      const tractId = (f.properties as Record<string, unknown>)?.tract_id as string
      return {
        ...f,
        properties: {
          ...f.properties,
          display_risk: scoreMap.get(tractId) ?? (f.properties as Record<string, unknown>).display_risk,
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
  setGeojsonData: (data) => set({ geojsonData: data, isMapLoading: false }),
  setMapLoading: (v) => set({ isMapLoading: v }),
  setSelectedTractId: (id) => set({ selectedTractId: id }),
  setPopupInfo: (info) => set({ popupInfo: info }),
  setRankedTracts: (tracts) => set({ rankedTracts: tracts, isRankedLoading: false }),
  setTractDetail: (detail) => set({ tractDetail: detail }),
  setTractDetailLoading: (v) => set({ isTractDetailLoading: v }),
  setColorStops: (stops) => set({ colorStops: stops }),
  setProjectionYear: (year) => set({ projectionYear: year }),

  fetchProjectionYear: async (year) => {
    // For baseline year 2025, just update projectionYear — composite_risk is already in geojsonData
    if (year === 2025) {
      set({ projectionYear: 2025 })
      return
    }
    const { projectionScores, geojsonData } = get()
    if (projectionScores.has(year) && geojsonData) {
      // Cache hit — re-stamp synchronously, recompute colorStops
      const scoreMap = projectionScores.get(year)!
      const stamped = stampProjectionOnGeoJSON(geojsonData, scoreMap)
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
      const updated = new Map(get().projectionScores).set(year, scoreMap)
      const currentGeoJSON = get().geojsonData
      const stamped = currentGeoJSON ? stampProjectionOnGeoJSON(currentGeoJSON, scoreMap) : null
      set({
        projectionScores: updated,
        projectionYear: year,
        geojsonData: stamped ?? currentGeoJSON,
        colorStops: computeColorStops(Array.from(scoreMap.values())),
        isProjectionLoading: false,
      })
    } catch (err) {
      console.error('Projection fetch failed:', err)
      set({ isProjectionLoading: false })
    }
  },
}))
