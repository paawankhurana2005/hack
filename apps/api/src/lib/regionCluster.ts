// Region clustering — maps an Indian PIN code to a coarse demand "zone".
//
// Demand is aggregated per zone × category, so zones must be coarse enough that
// each one accumulates real activity (a single 6-digit PIN would be far too
// granular). For now this is a simple prefix bucket over the first 3 digits of
// the PIN, covering the three launch hotspots (Delhi NCR, Bengaluru, Mumbai)
// with an "other" fallback for everything else.
//
// Intentionally a single, well-documented pure function: the mapping is expected
// to get richer later (finer sub-zones, a real geo lookup) without any caller
// having to change — they always just receive a stable zone string.

/** The coarse demand zones we recognise. Kept as a const so callers/tests can
 * reference the canonical names rather than stringly-typed literals. */
export const REGION_CLUSTERS = ['Delhi-NCR', 'Bengaluru', 'Mumbai', 'other'] as const;
export type RegionCluster = (typeof REGION_CLUSTERS)[number];

// First-3-digit PIN prefix → zone. Delhi NCR spans several postal circles
// (Delhi 110, Faridabad 121, Gurugram 122, Ghaziabad/Noida 201/203), so multiple
// prefixes fan into the same zone. Add prefixes here to refine the map.
const PREFIX_TO_CLUSTER: Record<string, RegionCluster> = {
  '110': 'Delhi-NCR', // Delhi
  '121': 'Delhi-NCR', // Faridabad
  '122': 'Delhi-NCR', // Gurugram
  '201': 'Delhi-NCR', // Ghaziabad / Noida
  '203': 'Delhi-NCR', // Greater Noida
  '560': 'Bengaluru',
  '400': 'Mumbai',
};

/**
 * Map a PIN code to its coarse demand zone. Anything we don't explicitly know
 * (or any malformed/empty input) buckets to "other" so callers never have to
 * handle a null — they always get a usable zone string.
 */
export function getRegionCluster(pincode: string): RegionCluster {
  const digits = pincode.trim().slice(0, 3);
  return PREFIX_TO_CLUSTER[digits] ?? 'other';
}

// ── Buyer-matching geo utilities ─────────────────────────────────────────────
// Finer-grained than getRegionCluster (which only buckets to 3 metro zones):
// local buyer matching needs an actual point to run $nearSphere against, and a
// "city" tighter than "Delhi-NCR" so within-city matching means something.

export interface LatLng {
  lat: number;
  lng: number;
}

interface PincodeEntry extends LatLng {
  city: string;
}

// Exact 6-digit PIN → centroid + city. Not exhaustive — covers a representative
// spread of major pincodes across Delhi NCR (split into sub-zones, since a
// single "Delhi-NCR" bucket is too coarse for within-city buyer matching),
// Bengaluru, and Mumbai.
const PINCODE_TABLE: Record<string, PincodeEntry> = {
  // Delhi-South
  '110017': { lat: 28.5494, lng: 77.2001, city: 'Delhi-South' },
  '110019': { lat: 28.5355, lng: 77.2507, city: 'Delhi-South' },
  '110024': { lat: 28.5355, lng: 77.291, city: 'Delhi-South' },
  '110049': { lat: 28.5581, lng: 77.1588, city: 'Delhi-South' },
  '110062': { lat: 28.5245, lng: 77.2066, city: 'Delhi-South' },
  // Delhi-West
  '110018': { lat: 28.6469, lng: 77.1201, city: 'Delhi-West' },
  '110026': { lat: 28.6692, lng: 77.1312, city: 'Delhi-West' },
  '110058': { lat: 28.6219, lng: 77.0587, city: 'Delhi-West' },
  '110064': { lat: 28.6692, lng: 77.101, city: 'Delhi-West' },
  // Delhi-North
  '110007': { lat: 28.6819, lng: 77.2069, city: 'Delhi-North' },
  '110009': { lat: 28.6608, lng: 77.1855, city: 'Delhi-North' },
  '110033': { lat: 28.7096, lng: 77.1929, city: 'Delhi-North' },
  '110054': { lat: 28.6774, lng: 77.2213, city: 'Delhi-North' },
  // NCR-Noida
  '201301': { lat: 28.5708, lng: 77.326, city: 'NCR-Noida' },
  '201304': { lat: 28.6139, lng: 77.3648, city: 'NCR-Noida' },
  '201310': { lat: 28.4744, lng: 77.504, city: 'NCR-Noida' },
  // NCR-Gurgaon
  '122001': { lat: 28.4595, lng: 77.0266, city: 'NCR-Gurgaon' },
  '122002': { lat: 28.4808, lng: 77.0868, city: 'NCR-Gurgaon' },
  '122009': { lat: 28.4645, lng: 77.0868, city: 'NCR-Gurgaon' },
  '122018': { lat: 28.4089, lng: 77.0453, city: 'NCR-Gurgaon' },
  // Bengaluru
  '560001': { lat: 12.9757, lng: 77.6079, city: 'Bengaluru' },
  '560034': { lat: 12.9352, lng: 77.6146, city: 'Bengaluru' },
  '560066': { lat: 12.9698, lng: 77.75, city: 'Bengaluru' },
  '560095': { lat: 12.9166, lng: 77.6101, city: 'Bengaluru' },
  '560100': { lat: 12.8452, lng: 77.6602, city: 'Bengaluru' },
  // Mumbai
  '400001': { lat: 18.9322, lng: 72.8264, city: 'Mumbai' },
  '400051': { lat: 19.0596, lng: 72.8656, city: 'Mumbai' },
  '400070': { lat: 19.0596, lng: 72.9008, city: 'Mumbai' },
  '400099': { lat: 19.1136, lng: 72.9081, city: 'Mumbai' },
};

// Fallback when the exact 6-digit PIN isn't in the table above: coarser
// 3-digit-prefix city centroid. Covers the same postal circles as
// PREFIX_TO_CLUSTER, split further where it maps to more than one city.
const PREFIX_FALLBACK: Record<string, PincodeEntry> = {
  '110': { lat: 28.6139, lng: 77.209, city: 'Delhi-South' },
  '121': { lat: 28.4089, lng: 77.3178, city: 'NCR-Faridabad' },
  '122': { lat: 28.4595, lng: 77.0266, city: 'NCR-Gurgaon' },
  '201': { lat: 28.5708, lng: 77.326, city: 'NCR-Noida' },
  '203': { lat: 28.4744, lng: 77.504, city: 'NCR-Noida' },
  '560': { lat: 12.9716, lng: 77.5946, city: 'Bengaluru' },
  '400': { lat: 19.076, lng: 72.8777, city: 'Mumbai' },
};

// Last-resort default when nothing matches at all (malformed/unknown PIN):
// centers the search on Delhi NCR rather than failing the caller.
const DEFAULT_ENTRY: PincodeEntry = { lat: 28.6139, lng: 77.209, city: 'other' };

function lookupPincodeEntry(pincode: string): PincodeEntry {
  const trimmed = pincode.trim();
  return PINCODE_TABLE[trimmed] ?? PREFIX_FALLBACK[trimmed.slice(0, 3)] ?? DEFAULT_ENTRY;
}

/**
 * Approximate centroid coordinates for a PIN code, for use in geospatial
 * queries ($nearSphere). Pure in-memory lookup, no database access. Falls back
 * to the city-center coordinates when the exact PIN isn't in the table.
 */
export function getPincodeCoordinates(pincode: string): LatLng {
  const { lat, lng } = lookupPincodeEntry(pincode);
  return { lat, lng };
}

/**
 * The city/sub-zone a PIN code belongs to — finer-grained than
 * getRegionCluster (e.g. "Delhi-South" vs "Delhi-West" rather than one shared
 * "Delhi-NCR" bucket), so within-city buyer matching means something.
 */
export function getCityForPincode(pincode: string): string {
  return lookupPincodeEntry(pincode).city;
}

const EARTH_RADIUS_KM = 6371;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance between two coordinates, in kilometers. Implemented
 * once here so every distance computation in buyer matching reuses it rather
 * than each caller reimplementing Haversine.
 */
export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
