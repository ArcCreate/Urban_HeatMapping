import { Marker } from 'react-map-gl/maplibre'

// Major King County cities with approximate centers
const CITIES = [
  { name: 'Seattle',       lng: -122.332, lat: 47.606 },
  { name: 'Bellevue',      lng: -122.201, lat: 47.611 },
  { name: 'Redmond',       lng: -122.122, lat: 47.673 },
  { name: 'Kirkland',      lng: -122.209, lat: 47.681 },
  { name: 'Renton',        lng: -122.218, lat: 47.483 },
  { name: 'Kent',          lng: -122.235, lat: 47.381 },
  { name: 'Auburn',        lng: -122.229, lat: 47.307 },
  { name: 'Federal Way',   lng: -122.312, lat: 47.323 },
  { name: 'Burien',        lng: -122.347, lat: 47.470 },
  { name: 'Shoreline',     lng: -122.342, lat: 47.755 },
  { name: 'Bothell',       lng: -122.205, lat: 47.760 },
  { name: 'Sammamish',     lng: -122.036, lat: 47.617 },
  { name: 'Issaquah',      lng: -122.033, lat: 47.530 },
  { name: 'Mercer Island', lng: -122.222, lat: 47.571 },
  { name: 'Tukwila',       lng: -122.261, lat: 47.474 },
  { name: 'Des Moines',    lng: -122.330, lat: 47.402 },
  { name: 'SeaTac',        lng: -122.300, lat: 47.444 },
  { name: 'Kenmore',       lng: -122.242, lat: 47.757 },
  { name: 'Maple Valley',  lng: -122.048, lat: 47.383 },
  { name: 'Covington',     lng: -122.106, lat: 47.364 },
]

export function CityLabelsLayer() {
  return (
    <>
      {CITIES.map((city) => (
        <Marker
          key={city.name}
          longitude={city.lng}
          latitude={city.lat}
          anchor="center"
          style={{ pointerEvents: 'none' }}
        >
          <span style={{
            display: 'block',
            color: '#FFFFFF',
            fontSize: '11.5px',
            fontWeight: 800,
            fontFamily: '"DM Sans", sans-serif',
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            textShadow: '0 0 6px rgba(0,0,0,1), 0 1px 0 rgba(0,0,0,1), 0 2px 8px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.7)',
            pointerEvents: 'none',
            userSelect: 'none',
            whiteSpace: 'nowrap',
          }}>
            {city.name}
          </span>
        </Marker>
      ))}
    </>
  )
}
