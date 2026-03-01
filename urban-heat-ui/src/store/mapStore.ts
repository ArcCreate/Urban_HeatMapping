import { create } from 'zustand'
import type { FeatureCollection } from 'geojson'
import type { RankedTract, TractDetail } from '../types/api'
import type { PopupInfo } from '../types/map'

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
  // Actions
  setGeojsonData: (data: FeatureCollection) => void
  setMapLoading: (v: boolean) => void
  setSelectedTractId: (id: string | null) => void
  setPopupInfo: (info: PopupInfo | null) => void
  setRankedTracts: (tracts: RankedTract[]) => void
  setTractDetail: (detail: TractDetail | null) => void
  setTractDetailLoading: (v: boolean) => void
  setColorStops: (stops: number[]) => void
}

export const useMapStore = create<MapState>()((set) => ({
  geojsonData: null,
  isMapLoading: true,
  selectedTractId: null,
  popupInfo: null,
  rankedTracts: [],
  isRankedLoading: true,
  tractDetail: null,
  isTractDetailLoading: false,
  colorStops: [0, 0.33, 0.66, 0.85, 1.0],
  setGeojsonData: (data) => set({ geojsonData: data, isMapLoading: false }),
  setMapLoading: (v) => set({ isMapLoading: v }),
  setSelectedTractId: (id) => set({ selectedTractId: id }),
  setPopupInfo: (info) => set({ popupInfo: info }),
  setRankedTracts: (tracts) => set({ rankedTracts: tracts, isRankedLoading: false }),
  setTractDetail: (detail) => set({ tractDetail: detail }),
  setTractDetailLoading: (v) => set({ isTractDetailLoading: v }),
  setColorStops: (stops) => set({ colorStops: stops }),
}))
