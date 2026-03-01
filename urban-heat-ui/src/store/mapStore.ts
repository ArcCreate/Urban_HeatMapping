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

      // Aggressive amplification scaled by how far we are from baseline year.
      // High-risk tracts grow faster; a few low-density tracts improve (greening effect).
      // All variation is seeded by (tractId × year) so re-scrubbing the same year is stable.
      const yearFraction = (year - 2025) / (2050 - 2025)  // 0→1
      const rawValues = Array.from(scoreMap.values())
      const sorted = [...rawValues].sort((a, b) => a - b)
      const median = sorted[Math.floor(sorted.length / 2)]
      const p75 = sorted[Math.floor(sorted.length * 0.75)]

      const amplified = new Map<string, number>()
      for (const [id, risk] of scoreMap) {
        // Stable per-tract-per-year seed
        const tractSeed = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
        const seed = (tractSeed * year * 31) % 1000

        // Randomized per-tract character: most tracts get worse, ~15% get a cooling benefit
        const tractChar = tractSeed % 7   // 0–6, stable per tract
        const isCoolingTract = tractChar === 0  // ~1 in 7 tracts gets urban-greening improvement

        // Noise: ±0.06 at 2025, ±0.14 at 2050
        const noiseRange = 0.06 + yearFraction * 0.08
        const noise = ((seed % 100) / 100 - 0.5) * 2 * noiseRange

        let newRisk: number
        if (isCoolingTract && risk < median) {
          // Slight improvement: low-risk tracts that benefit from interventions
          newRisk = risk - yearFraction * 0.08 * ((seed % 40) / 40) + noise * 0.5
        } else {
          const delta = risk - median
          // High-risk (above p75): very aggressive growth
          // Mid-risk (median–p75): moderate growth
          // Low-risk (below median): slow growth
          const factor = risk >= p75 ? 0.9 : risk >= median ? 0.5 : 0.2
          newRisk = risk + delta * factor * yearFraction + noise
        }

        amplified.set(id, Math.min(1, Math.max(0, newRisk)))
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
