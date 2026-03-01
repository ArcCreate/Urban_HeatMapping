import { useRef, useCallback, useMemo } from 'react'
import { AnimatePresence } from 'motion/react'
import Map, { Source, Layer, NavigationControl } from 'react-map-gl/maplibre'
import type { MapRef, MapLayerMouseEvent, LayerProps } from 'react-map-gl/maplibre'
import type { Geometry } from 'geojson'
import { Home } from 'lucide-react'
import { useMapStore, useShallow } from '../../store/mapStore'
import { fetchTractDetail } from '../../api/tracts'
import { CountyBorderLayer } from './CountyBorderLayer'
import { CityLabelsLayer } from './CityLabelsLayer'
import { TractPopup } from './TractPopup'
import { TimelineSlider } from './TimelineSlider'
import { GlassCard } from '../ui/GlassCard'

// King County hard bounds — prevents panning/zooming outside the county
const KING_COUNTY_BOUNDS: [[number, number], [number, number]] = [
  [-122.56, 47.04],  // SW corner
  [-121.06, 47.82],  // NE corner
]

// Derive bounding box from any GeoJSON geometry for fly-to on zone click
function getGeometryBbox(geom: Geometry): [number, number, number, number] | null {
  const coords: number[][] = []
  function collect(c: unknown) {
    if (!Array.isArray(c)) return
    if (typeof c[0] === 'number') { coords.push(c as number[]); return }
    c.forEach(collect)
  }
  if ('coordinates' in geom) collect(geom.coordinates)
  else if ('geometries' in geom) geom.geometries.forEach((g) => collect((g as Geometry & { coordinates?: unknown }).coordinates))
  if (!coords.length) return null
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat
  }
  return [minLng, minLat, maxLng, maxLat]
}

const tractOutlineLayer: LayerProps = {
  id: 'tract-outline',
  type: 'line',
  paint: {
    'line-color': 'rgba(255,255,255,0.12)',
    'line-width': 0.4,
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
    selectedTractId, selectedCityName,
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
      selectedTractId: s.selectedTractId,
      selectedCityName: s.selectedCityName,
    }))
  )

  const tractFillLayer: LayerProps = useMemo(() => ({
    id: 'tract-fill',
    type: 'fill',
    paint: {
      'fill-color': [
        'interpolate', ['linear'],
        ['get', 'display_risk'],
        colorStops[0], '#388E3C',
        colorStops[1], '#8BC34A',
        colorStops[2], '#FFF176',
        colorStops[3], '#FB8C00',
        colorStops[4], '#BF360C',
      ],
      'fill-opacity': [
        'case',
        ['boolean', ['feature-state', 'hover'], false], 0.88,
        ['boolean', ['feature-state', 'selected'], false], 0.82,
        0.68,
      ],
    },
  }), [colorStops])

  // selectedCityName is set directly by sidebar region clicks; tractDetail.city_name
  // is set when a tract is selected on the map. Either source triggers city highlighting.
  const selectedCity = selectedCityName ?? tractDetail?.city_name ?? null
  const cityHighlightFilter: [string, ...unknown[]] = selectedCity
    ? ['==', ['get', 'city_name'], selectedCity]
    : ['==', ['literal', false], true]

  const selectedTractFilter: [string, ...unknown[]] = selectedTractId
    ? ['==', ['get', 'tract_id'], selectedTractId]
    : ['==', ['literal', false], true]

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

  const handleResetView = useCallback(() => {
    internalMapRef.current?.flyTo({
      center: [-122.1, 47.45],
      zoom: 9.5,
      duration: 900,
      essential: true,
    })
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

    // Fly to the clicked zone's bounds
    if (map && feature.geometry) {
      const bbox = getGeometryBbox(feature.geometry as Geometry)
      if (bbox) {
        map.fitBounds(
          [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
          { padding: 100, duration: 800, maxZoom: 11 }
        )
      }
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
        initialViewState={{ longitude: -122.1, latitude: 47.45, zoom: 9.5 }}
        mapStyle={MAP_STYLE}
        // Restrict to King County — no zooming out past county view
        maxBounds={KING_COUNTY_BOUNDS}
        minZoom={8.5}
        maxZoom={14}
        // Disable all rotation and pitch
        dragRotate={false}
        touchPitch={false}
        pitchWithRotate={false}
        keyboard={false}
        interactiveLayerIds={['tract-fill']}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onClick={onTractClick}
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <CountyBorderLayer />

        {geojsonData && (
          <Source id="tracts" type="geojson" data={geojsonData} generateId={true}>
            <Layer {...tractFillLayer} />

            {/* City group: subtle fill tint */}
            <Layer
              id="city-fill"
              type="fill"
              filter={cityHighlightFilter}
              paint={{ 'fill-color': 'rgba(183, 28, 28, 0.06)' }}
            />

            {/* Default tract borders */}
            <Layer {...tractOutlineLayer} />

            {/* City limits: dark red border on all tracts in selected city */}
            <Layer
              id="city-outline"
              type="line"
              filter={cityHighlightFilter}
              paint={{
                'line-color': '#B71C1C',
                'line-width': 2,
                'line-opacity': 0.85,
              }}
            />

            {/* Selected zone: blue outline, clearly distinct from city red */}
            <Layer
              id="tract-selected-outline"
              type="line"
              filter={selectedTractFilter}
              paint={{
                'line-color': '#1E88E5',
                'line-width': 3.5,
                'line-opacity': 1,
              }}
            />
          </Source>
        )}

        <CityLabelsLayer />
      </Map>

      {/* Tract detail card — fixed overlay, never leaves screen */}
      <AnimatePresence>
        {popupInfo && (
          <TractPopup popupInfo={popupInfo} onClose={clearSelection} />
        )}
      </AnimatePresence>

      {/* Reset View — pinned top-left, never leaves screen */}
      <div style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 10 }}>
        <GlassCard>
          <button
            onClick={handleResetView}
            style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '7px 14px',
              color: '#00E5FF',
              fontSize: '0.78rem', fontWeight: 600,
              fontFamily: '"IBM Plex Sans", sans-serif',
              whiteSpace: 'nowrap',
            }}
          >
            <Home size={13} />
            Reset View
          </button>
        </GlassCard>
      </div>

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
