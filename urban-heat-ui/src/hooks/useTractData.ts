import { useEffect } from 'react'
import { fetchTractsGeoJSON } from '../api/tracts'
import { fetchRankedTracts } from '../api/predictions'
import { useMapStore } from '../store/mapStore'

export function useTractData() {
  const setGeojsonData = useMapStore((s) => s.setGeojsonData)
  const setRankedTracts = useMapStore((s) => s.setRankedTracts)
  const setColorStops = useMapStore((s) => s.setColorStops)

  useEffect(() => {
    Promise.all([fetchTractsGeoJSON(), fetchRankedTracts()])
      .then(([geojson, ranked]) => {
        // --- Composite urban heat penalty score ---
        // Normalize mean_afternoon_temp across the dataset first
        const temps = ranked.map((t) => t.mean_afternoon_temp ?? 0)
        const tempMin = Math.min(...temps)
        const tempMax = Math.max(...temps)
        const tempRange = tempMax - tempMin || 1

        // Raw composite per tract
        const rawComposites = ranked.map((t) => {
          const heat = t.xgb_heat_score
          const imperv = (t.mean_imperv ?? 0) / 100
          const tempNorm = ((t.mean_afternoon_temp ?? tempMin) - tempMin) / tempRange
          return 0.35 * heat + 0.40 * imperv + 0.25 * tempNorm
        })

        // Min-max normalize composites to [0, 1]
        const compMin = Math.min(...rawComposites)
        const compMax = Math.max(...rawComposites)
        const compRange = compMax - compMin || 1
        const normalized = rawComposites.map((v) => (v - compMin) / compRange)

        // Build lookup maps
        const cityMap = new Map(ranked.map((t) => [t.tract_id, t.city_name]))
        const displayRiskMap = new Map(ranked.map((t, i) => [t.tract_id, normalized[i]]))

        // Stamp display_risk onto each RankedTract so sidebar + popup read the same value
        const rankedWithRisk = ranked.map((t, i) => ({ ...t, display_risk: normalized[i] }))

        // Compute 5-quantile color stops from the sorted distribution
        const sorted = [...normalized].sort((a, b) => a - b)
        const n = sorted.length
        const quantile = (p: number) => sorted[Math.round(p * (n - 1))]
        setColorStops([
          quantile(0),    // p0
          quantile(0.33), // p33
          quantile(0.66), // p66
          quantile(0.85), // p85
          quantile(1.0),  // p100
        ])

        // Stamp display_risk + city_name onto each GeoJSON feature
        const enriched = {
          ...geojson,
          features: geojson.features.map((f) => {
            const tractId = (f.properties as Record<string, unknown>)?.tract_id as string
            return {
              ...f,
              properties: {
                ...f.properties,
                city_name: cityMap.get(tractId) ?? null,
                display_risk: displayRiskMap.get(tractId) ?? 0,
              },
            }
          }),
        }

        setGeojsonData(enriched)
        setRankedTracts(rankedWithRisk)
      })
      .catch(console.error)
  }, [setGeojsonData, setRankedTracts, setColorStops])
}
