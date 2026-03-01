import { create } from 'zustand'
import type { FeatureCollection } from 'geojson'
import type { RankedTract } from '../types/api'
import type { PopupInfo } from '../types/map'

export { useShallow } from 'zustand/shallow'

interface MapState {
  geojsonData: FeatureCollection | null
  isMapLoading: boolean
  selectedTractId: string | null
  popupInfo: PopupInfo | null
  rankedTracts: RankedTract[]
  isRankedLoading: boolean
  // Actions
  setGeojsonData: (data: FeatureCollection) => void
  setMapLoading: (v: boolean) => void
  setSelectedTractId: (id: string | null) => void
  setPopupInfo: (info: PopupInfo | null) => void
  setRankedTracts: (tracts: RankedTract[]) => void
}

export const useMapStore = create<MapState>()((set) => ({
  geojsonData: null,
  isMapLoading: true,
  selectedTractId: null,
  popupInfo: null,
  rankedTracts: [],
  isRankedLoading: true,
  setGeojsonData: (data) => set({ geojsonData: data, isMapLoading: false }),
  setMapLoading: (v) => set({ isMapLoading: v }),
  setSelectedTractId: (id) => set({ selectedTractId: id }),
  setPopupInfo: (info) => set({ popupInfo: info }),
  setRankedTracts: (tracts) => set({ rankedTracts: tracts, isRankedLoading: false }),
}))
