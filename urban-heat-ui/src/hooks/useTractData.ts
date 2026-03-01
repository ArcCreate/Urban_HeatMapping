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
        // Use composite_risk directly — pre-computed in DuckDB (already [0,1])
        const displayRisks = ranked.map((t) => t.composite_risk ?? 0)

        // Build lookup maps
        const cityMap = new Map(ranked.map((t) => [t.tract_id, t.city_name]))
        const displayRiskMap = new Map(ranked.map((t, i) => [t.tract_id, displayRisks[i]]))

        // Stamp composite_risk as display_risk on each RankedTract for sidebar + popup
        const rankedWithRisk = ranked.map((t, i) => ({ ...t, display_risk: displayRisks[i] }))

        // Compute 5-quantile color stops
        const sorted = [...displayRisks].sort((a, b) => a - b)
        const n = sorted.length
        const quantile = (p: number) => sorted[Math.round(p * (n - 1))]
        setColorStops([quantile(0), quantile(0.33), quantile(0.66), quantile(0.85), quantile(1.0)])

        // Stamp display_risk + city_name + composite_risk onto each GeoJSON feature
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
                composite_risk: displayRiskMap.get(tractId) ?? 0,  // same as display_risk at baseline
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
