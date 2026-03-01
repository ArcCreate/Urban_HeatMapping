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
  selectedCityName: string | null
  // Actions
  setGeojsonData: (data: FeatureCollection) => void
  setMapLoading: (v: boolean) => void
  setSelectedTractId: (id: string | null) => void
  setSelectedCityName: (name: string | null) => void
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
  selectedCityName: null,
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
  setSelectedCityName: (name) => set({ selectedCityName: name }),
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

      // Amplification scaled by how far we are from baseline year.
      // High-risk tracts grow faster; ~1 in 7 low-risk tracts benefit from greening.
      //
      // Monotonicity guarantee: all variation is seeded by tractId only (never by year),
      // and the per-tract bias term is strictly proportional to yearFraction.
      // This ensures risk values only move in one direction as the slider advances.
      const yearFraction = (year - 2025) / (2050 - 2025)  // 0→1, strictly increasing
      // Concave curve: rises steeply in early years, levels toward 2050.
      // e.g. 2026→0.20, 2030→0.45, 2035→0.63, 2040→0.77, 2050→1.0
      // Still strictly monotonic so direction never reverses.
      const curve = Math.pow(yearFraction, 0.5)
      const rawValues = Array.from(scoreMap.values())
      const sorted = [...rawValues].sort((a, b) => a - b)
      const median = sorted[Math.floor(sorted.length / 2)]
      const p75 = sorted[Math.floor(sorted.length * 0.75)]

      const amplified = new Map<string, number>()
      for (const [id, risk] of scoreMap) {
        // Stable per-tract seed — year is intentionally excluded so character never flips
        const tractSeed = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
        const tractChar = tractSeed % 7  // 0–6, fixed per tract across all years
        const isCoolingTract = tractChar === 0  // ~1 in 7 tracts gets greening benefit

        // Per-tract upward bias: stable per-tract, grows monotonically, max +12% by 2050.
        // Wide range creates visible spread between tracts without oscillation.
        const tractBias = ((tractSeed % 100) / 100) * 0.12 * curve

        // Continuous per-tract growth factor: base tier + stable random jitter (0 to +0.40).
        // This gives each tract a unique heating rate rather than snapping to 3 buckets.
        const baseRiskFactor = risk >= p75 ? 0.90 : risk >= median ? 0.52 : 0.20
        const tractJitter = ((tractSeed % 60) / 60) * 0.40  // 0–0.40, fixed per tract
        const factor = baseRiskFactor + tractJitter

        let newRisk: number
        if (isCoolingTract && risk < median) {
          // Cooling tracts vary in how much they improve (some more policy-responsive)
          newRisk = risk - curve * 0.10 * ((tractSeed % 40) / 40)
        } else {
          const delta = risk - median
          newRisk = risk + delta * factor * curve + tractBias
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
