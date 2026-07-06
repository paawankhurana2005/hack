'use client';

// Public entry point — dynamic-imports the actual Leaflet render with
// `ssr: false`, since Leaflet touches `window` at import time and would break
// Next's server render otherwise. Always import LeafletMap from here, never
// LeafletMapInner directly.

import dynamic from 'next/dynamic';
import type { LeafletMapProps } from './LeafletMapInner';

export type { MapMarker, LeafletMapProps } from './LeafletMapInner';

export const LeafletMap = dynamic<LeafletMapProps>(() => import('./LeafletMapInner'), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 w-full items-center justify-center rounded-2xl bg-secondary text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
});
