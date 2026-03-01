import { useRef, useCallback } from 'react'
import Map, { Source, Layer, NavigationControl } from 'react-map-gl/maplibre'
import type { MapRef, MapLayerMouseEvent, LayerProps } from 'react-map-gl/maplibre'
import { useMapStore, useShallow } from '../../store/mapStore'
import { CountyBorderLayer } from './CountyBorderLayer'
import { TractPopup } from './TractPopup'
import { MapFloatingCard } from './MapFloatingCard'
import { TimelineSlider } from './TimelineSlider'

// CRITICAL: Layer style objects defined OUTSIDE component — stable references
const tractFillLayer: LayerProps = {
  id: 'tract-fill',
  type: 'fill',
  paint: {
    'fill-color': [
      'interpolate', ['linear'],
      ['get', 'xgb_heat_score'],
      0.0, '#FFE44D',   // yellow — low heat
      0.33, '#FF8C00', // orange
      0.66, '#FF2D2D', // red
      1.0, '#8B0000'   // deep crimson — max heat
    ],
    'fill-opacity': [
      'case',
      ['boolean', ['feature-state', 'hover'], false], 0.85,
      ['boolean', ['feature-state', 'selected'], false], 0.80,
      0.65
    ]
  }
}

const tractOutlineLayer: LayerProps = {
  id: 'tract-outline',
  type: 'line',
  paint: {
    'line-color': [
      'case',
      ['boolean', ['feature-state', 'selected'], false], '#00E5FF',
      'rgba(255,255,255,0.15)'
    ],
    'line-width': [
      'case',
      ['boolean', ['feature-state', 'selected'], false], 2,
      0.5
    ]
  }
}

// Maptiler dark style — use env var; fall back to demotiles if not set
const MAP_STYLE = import.meta.env.VITE_MAPTILER_KEY
  ? `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${import.meta.env.VITE_MAPTILER_KEY}`
  : 'https://demotiles.maplibre.org/style.json'

// Module-level hover tracker — NOT React state (avoids 60fps re-renders)
let hoveredTractId: string | number | null = null

export const mapRef = { current: null as MapRef | null }

export function HeatMap() {
  const internalMapRef = useRef<MapRef>(null)

  // Sync internal ref to exported ref for Plan 03 fly-to
  const onMapLoad = useCallback(() => {
    mapRef.current = internalMapRef.current
  }, [])

  const { geojsonData, isMapLoading, popupInfo, setPopupInfo, setSelectedTractId } = useMapStore(
    useShallow((s) => ({
      geojsonData: s.geojsonData,
      isMapLoading: s.isMapLoading,
      popupInfo: s.popupInfo,
      setPopupInfo: s.setPopupInfo,
      setSelectedTractId: s.setSelectedTractId,
    }))
  )

  // HOVER: setFeatureState on GPU — zero React re-renders
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

  // CLICK: show popup with tract data
  const onTractClick = useCallback((event: MapLayerMouseEvent) => {
    if (!event.features?.length) return
    const feature = event.features[0]
    const props = feature.properties as {
      tract_id: string
      xgb_heat_score: number
      xgb_risk_score: number
      tf_risk_score: number
    }

    // Set selected feature-state for outline highlight
    const map = internalMapRef.current?.getMap()
    if (map && feature.id !== undefined) {
      map.setFeatureState({ source: 'tracts', id: feature.id }, { selected: true })
    }

    setSelectedTractId(props.tract_id)
    setPopupInfo({
      longitude: event.lngLat.lng,
      latitude: event.lngLat.lat,
      tractId: props.tract_id,
      xgb_heat_score: props.xgb_heat_score,
      xgb_risk_score: props.xgb_risk_score,
      tf_risk_score: props.tf_risk_score,
    })
  }, [setPopupInfo, setSelectedTractId])

  return (
    <div className="relative w-full h-full">
      <Map
        ref={internalMapRef}
        onLoad={onMapLoad}
        initialViewState={{
          longitude: -122.1,
          latitude: 47.5,
          zoom: 9.5
        }}
        mapStyle={MAP_STYLE}
        interactiveLayerIds={['tract-fill']}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onClick={onTractClick}
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="top-right" />

        {/* County border glow */}
        <CountyBorderLayer />

        {/* Tract choropleth — only render when data is loaded */}
        {geojsonData && (
          <Source
            id="tracts"
            type="geojson"
            data={geojsonData}
            generateId={true}
          >
            <Layer {...tractFillLayer} />
            <Layer {...tractOutlineLayer} />
          </Source>
        )}

        {/* Tract click popup */}
        {popupInfo && (
          <TractPopup
            popupInfo={popupInfo}
            onClose={() => setPopupInfo(null)}
          />
        )}
      </Map>

      {/* Floating UI elements — positioned over map */}
      <MapFloatingCard />
      <TimelineSlider />

      {/* Loading overlay */}
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
