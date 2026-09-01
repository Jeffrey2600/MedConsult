import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from 'react-i18next';

/**
 * Leaflet's default marker icons are referenced by a relative path that a
 * bundler rewrites, so they 404 unless the URLs are set explicitly. These are
 * inline SVG data URIs — no CDN request, and they work offline.
 */
const pin = (fill) =>
  L.divIcon({
    className: '',
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 26 34">
             <path d="M13 0C5.8 0 0 5.8 0 13c0 9.7 13 21 13 21s13-11.3 13-21C26 5.8 20.2 0 13 0z" fill="${fill}"/>
             <circle cx="13" cy="13" r="5" fill="#fff"/>
           </svg>`,
    iconSize: [26, 34],
    iconAnchor: [13, 34],
    popupAnchor: [0, -30],
  });

const HOSPITAL_ICON = pin('#dc2626');
const CLINIC_ICON = pin('#0d9488');
const YOU_ICON = pin('#2563eb');

/**
 * OpenStreetMap tiles rendered with Leaflet — no API key and no billing
 * account, which is why this is used instead of Google Maps.
 */
export function HospitalMap({ center, hospitals = [], height = 320 }) {
  const { t } = useTranslation();
  const position = [center.latitude, center.longitude];

  return (
    <MapContainer
      center={position}
      zoom={14}
      style={{ height, width: '100%' }}
      scrollWheelZoom={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />

      {/* Rough accuracy of the fix, so a large circle explains an imprecise pin. */}
      {center.accuracyMeters > 0 && (
        <Circle
          center={position}
          radius={center.accuracyMeters}
          pathOptions={{ color: '#2563eb', fillOpacity: 0.08, weight: 1 }}
        />
      )}

      <Marker position={position} icon={YOU_ICON}>
        <Popup>{t('sos.youAreHere')}</Popup>
      </Marker>

      {hospitals.map((h) => (
        <Marker
          key={h.id}
          position={[h.lat, h.lng]}
          icon={h.kind === 'clinic' ? CLINIC_ICON : HOSPITAL_ICON}
        >
          <Popup>
            <strong>{h.name}</strong>
            <br />
            {h.distance < 1000 ? `${h.distance} m` : `${(h.distance / 1000).toFixed(1)} km`}
            {h.phone && (
              <>
                <br />
                <a href={`tel:${h.phone}`}>{h.phone}</a>
              </>
            )}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
