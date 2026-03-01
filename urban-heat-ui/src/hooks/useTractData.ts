import { useEffect } from 'react'
import { fetchTractsGeoJSON } from '../api/tracts'
import { fetchRankedTracts } from '../api/predictions'
import { useMapStore } from '../store/mapStore'

export function useTractData() {
  const setGeojsonData = useMapStore((s) => s.setGeojsonData)
  const setRankedTracts = useMapStore((s) => s.setRankedTracts)

  useEffect(() => {
    fetchTractsGeoJSON()
      .then(setGeojsonData)
      .catch(console.error)

    fetchRankedTracts()
      .then(setRankedTracts)
      .catch(console.error)
  }, [setGeojsonData, setRankedTracts])
}
