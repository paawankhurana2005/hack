'use client';

// Actual Leaflet render — imported ONLY via next/dynamic({ ssr: false }) from
// LeafletMap.tsx. Leaflet touches `window` at import time, which breaks Next's
// server render; this file must never be imported directly outside that
// dynamic wrapper.

import 'leaflet/dist/leaflet.css';
import './leaflet-theme.css';
import { MapContainer, Marker, Polyline, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';

export interface MapMarker {
  lat: number;
  lng: number;
  label: string;
  popup?: string;
  tone?: 'brand' | 'success' | 'warning';
}

export interface LeafletMapProps {
  center: { lat: number; lng: number };
  zoom?: number;
  markers: MapMarker[];
  /** Draws a line between two points, e.g. origin → destination. */
  line?: [{ lat: number; lng: number }, { lat: number; lng: number }];
  className?: string;
}

// Solid-fill CSS colors (not Tailwind classes — this file's CSS is plain,
// loaded via leaflet-theme.css) matching the app's brand/success/warning tones.
const PIN_COLOR: Record<NonNullable<MapMarker['tone']>, string> = {
  brand: '#e47911', // --orange
  success: '#2e7d4f', // --success
  warning: '#e47911',
};

function pinIcon(tone: MapMarker['tone'] = 'brand'): L.DivIcon {
  const color = PIN_COLOR[tone];
  return L.divIcon({
    className: 'reloop-map-pin',
    html: `<span style="display:block;width:16px;height:16px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.35);"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 16],
    popupAnchor: [0, -16],
  });
}

export default function LeafletMapInner({ center, zoom = 12, markers, line, className }: LeafletMapProps) {
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={zoom}
      scrollWheelZoom={false}
      className={className ?? 'h-64 w-full rounded-2xl'}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {markers.map((m, i) => (
        <Marker key={i} position={[m.lat, m.lng]} icon={pinIcon(m.tone)}>
          <Popup>
            <span className="font-semibold">{m.label}</span>
            {m.popup ? <><br />{m.popup}</> : null}
          </Popup>
        </Marker>
      ))}
      {line && (
        <Polyline
          positions={[
            [line[0].lat, line[0].lng],
            [line[1].lat, line[1].lng],
          ]}
          pathOptions={{ color: '#e47911', weight: 3, dashArray: '6 6' }}
        />
      )}
    </MapContainer>
  );
}
