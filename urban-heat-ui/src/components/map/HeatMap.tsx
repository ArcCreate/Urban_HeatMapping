import { useRef, useCallback, useMemo } from 'react'
import Map, { Source, Layer, NavigationControl } from 'react-map-gl/maplibre'
import type { MapRef, MapLayerMouseEvent, LayerProps } from 'react-map-gl/maplibre'
import { useMapStore, useShallow } from '../../store/mapStore'
import { fetchTractDetail } from '../../api/tracts'
import { CountyBorderLayer } from './CountyBorderLayer'
import { CityLabelsLayer } from './CityLabelsLayer'
import { TractPopup } from './TractPopup'
import { MapFloatingCard } from './MapFloatingCard'
import { TimelineSlider } from './TimelineSlider'

const tractOutlineLayer: LayerProps = {
  id: 'tract-outline',
  type: 'line',
  paint: {
    'line-color': [
      'case',
      ['boolean', ['feature-state', 'selected'], false], '#00E5FF',
      'rgba(255,255,255,0.12)'
    ],
    'line-width': [
      'case',
      ['boolean', ['feature-state', 'selected'], false], 2,
      0.4
    ]
  }
}

const MAP_STYLE = import.meta.env.VITE_MAPTILER_KEY
  ? `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${import.meta.env.VITE_MAPTILER_KEY}`
  : 'https://demotiles.maplibre.org/style.json'

let hoveredTractId: string | number | null = null
let selectedFeatureId: string | number | null = null

export const mapRef = { current: null as MapRef | null }

export function HeatMap() {
  const internalMapRef = useRef<MapRef>(null)

  const onMapLoad = useCallback(() => {
    mapRef.current = internalMapRef.current
  }, [])

  const {
    geojsonData, isMapLoading, popupInfo,
    setPopupInfo, setSelectedTractId,
    setTractDetail, setTractDetailLoading,
    tractDetail, colorStops, projectionYear,
  } = useMapStore(
    useShallow((s) => ({
      geojsonData: s.geojsonData,
      isMapLoading: s.isMapLoading,
      popupInfo: s.popupInfo,
      setPopupInfo: s.setPopupInfo,
      setSelectedTractId: s.setSelectedTractId,
      setTractDetail: s.setTractDetail,
      setTractDetailLoading: s.setTractDetailLoading,
      tractDetail: s.tractDetail,
      colorStops: s.colorStops,
      projectionYear: s.projectionYear,
    }))
  )

  // Green → light yellow → dark orange mapped to quantile breakpoints of display_risk
  const tractFillLayer: LayerProps = useMemo(() => ({
    id: 'tract-fill',
    type: 'fill',
    paint: {
      'fill-color': [
        'interpolate', ['linear'],
        ['get', 'display_risk'],
        colorStops[0], '#388E3C',  // p0   — dark green
        colorStops[1], '#8BC34A',  // p33  — light green
        colorStops[2], '#FFF176',  // p66  — light yellow
        colorStops[3], '#FB8C00',  // p85  — orange
        colorStops[4], '#BF360C',  // p100 — dark orange
      ],
      'fill-opacity': [
        'case',
        ['boolean', ['feature-state', 'hover'], false], 0.88,
        ['boolean', ['feature-state', 'selected'], false], 0.82,
        0.68,
      ],
    },
  }), [colorStops])

  // City highlight layer — filters to all tracts sharing the selected city_name
  const selectedCity = tractDetail?.city_name ?? null
  const cityHighlightFilter: [string, ...unknown[]] = selectedCity
    ? ['==', ['get', 'city_name'], selectedCity]
    : ['==', ['literal', false], true]  // matches nothing

  const onMouseMove = useCallback((event: MapLayerMouseEvent) => {
    if (!event.features?.length) return
    const map = internalMapRef.current?.getMap()
    if (!map) return
    if (hoveredTractId !== null) {
      map.setFeatureState({ source: 'tracts', id: hoveredTractId }, { hover: false })
    }
    hoveredTractId = event.features[0].id ?? null
    if (hoveredTractId !== null) {
      map.setFeatureState({ source: 'tracts', id: hoveredTractId }, { hover: true })
    }
  }, [])

  const onMouseLeave = useCallback(() => {
    const map = internalMapRef.current?.getMap()
    if (map && hoveredTractId !== null) {
      map.setFeatureState({ source: 'tracts', id: hoveredTractId }, { hover: false })
      hoveredTractId = null
    }
  }, [])

  const clearSelection = useCallback(() => {
    const map = internalMapRef.current?.getMap()
    if (map && selectedFeatureId !== null) {
      map.setFeatureState({ source: 'tracts', id: selectedFeatureId }, { selected: false })
    }
    selectedFeatureId = null
    setSelectedTractId(null)
    setPopupInfo(null)
    setTractDetail(null)
  }, [setPopupInfo, setSelectedTractId, setTractDetail])

  const onTractClick = useCallback((event: MapLayerMouseEvent) => {
    const map = internalMapRef.current?.getMap()
    if (map && selectedFeatureId !== null) {
      map.setFeatureState({ source: 'tracts', id: selectedFeatureId }, { selected: false })
    }
    if (!event.features?.length) {
      selectedFeatureId = null
      setSelectedTractId(null)
      setPopupInfo(null)
      setTractDetail(null)
      return
    }
    const feature = event.features[0]
    const props = feature.properties as {
      tract_id: string; xgb_heat_score: number; xgb_risk_score: number; tf_risk_score: number;
      display_risk: number; composite_risk?: number
    }
    if (map && feature.id !== undefined) {
      selectedFeatureId = feature.id
      map.setFeatureState({ source: 'tracts', id: feature.id }, { selected: true })
    }
    setSelectedTractId(props.tract_id)
    setPopupInfo({
      longitude: event.lngLat.lng, latitude: event.lngLat.lat,
      tractId: props.tract_id,
      xgb_heat_score: props.xgb_heat_score,
      xgb_risk_score: props.xgb_risk_score,
      tf_risk_score: props.tf_risk_score,
      display_risk: props.display_risk ?? 0,
      composite_risk: props.composite_risk,
      projectionYear: projectionYear > 2025 ? projectionYear : undefined,
    })
    setTractDetailLoading(true)
    setTractDetail(null)
    fetchTractDetail(props.tract_id)
      .then(setTractDetail)
      .catch(() => {})
      .finally(() => setTractDetailLoading(false))
  }, [setPopupInfo, setSelectedTractId, setTractDetail, setTractDetailLoading, projectionYear])

  return (
    <div className="relative w-full h-full">
      <Map
        ref={internalMapRef}
        onLoad={onMapLoad}
        initialViewState={{ longitude: -122.1, latitude: 47.5, zoom: 9.5 }}
        mapStyle={MAP_STYLE}
        interactiveLayerIds={['tract-fill']}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onClick={onTractClick}
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="top-right" />
        <CountyBorderLayer />

        {geojsonData && (
          <Source id="tracts" type="geojson" data={geojsonData} generateId={true}>
            <Layer {...tractFillLayer} />
            <Layer {...tractOutlineLayer} />
            {/* City boundary highlight — glows the outer edge of all tracts in the selected city */}
            <Layer
              id="city-highlight"
              type="line"
              filter={cityHighlightFilter}
              paint={{
                'line-color': '#00E5FF',
                'line-width': 2.5,
                'line-opacity': 0.75,
              }}
            />
          </Source>
        )}

        <CityLabelsLayer />

        {popupInfo && (
          <TractPopup popupInfo={popupInfo} onClose={clearSelection} />
        )}
      </Map>

      <MapFloatingCard />
      <TimelineSlider />

      {isMapLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/60 backdrop-blur-sm rounded-lg px-4 py-2 text-white/70 text-sm"
               style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}>
            Loading 492 tracts...
          </div>
        </div>
      )}
    </div>
  )
}
