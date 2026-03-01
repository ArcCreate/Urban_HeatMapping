import { Source, Layer } from 'react-map-gl/maplibre'
import type { LayerProps } from 'react-map-gl/maplibre'

// Approximate King County outer boundary (rough convex hull — good enough for visual glow)
const KING_COUNTY_BOUNDARY = {
  type: 'Feature' as const,
  geometry: {
    type: 'Polygon' as const,
    coordinates: [[
      [-122.6, 47.1], [-121.1, 47.1], [-121.1, 47.8],
      [-122.1, 47.9], [-122.6, 47.7], [-122.6, 47.1]
    ]]
  },
  properties: {}
}

const glowLayerOuter: LayerProps = {
  id: 'county-glow-outer',
  type: 'line',
  paint: {
    'line-color': '#00E5FF',
    'line-width': 6,
    'line-opacity': 0.2,
    'line-blur': 4
  }
}

const glowLayerInner: LayerProps = {
  id: 'county-glow-inner',
  type: 'line',
  paint: {
    'line-color': '#00E5FF',
    'line-width': 2,
    'line-opacity': 0.9
  }
}

export function CountyBorderLayer() {
  return (
    <Source id="county-border" type="geojson" data={KING_COUNTY_BOUNDARY}>
      <Layer {...glowLayerOuter} />
      <Layer {...glowLayerInner} />
    </Source>
  )
}
