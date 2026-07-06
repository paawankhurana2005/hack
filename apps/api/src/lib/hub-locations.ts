// Spec 023: illustrative destination coordinates for the Intelligent Bridge map —
// one representative point per (decision type × region cluster), NOT real facility
// addresses. Mirrors the existing PINCODE_TABLE/PREFIX_FALLBACK convention in
// regionCluster.ts: honest demo data, not a claim of real infrastructure. Does not
// feed any EV/economics number — purely a map visualization of an existing decision.

import type { RegionCluster } from './regionCluster.js';
import type { LatLng } from './regionCluster.js';

export type HubDecisionType = 'local_resale' | 'refurbish' | 'liquidate' | 'donate' | 'recycle';

interface HubEntry extends LatLng {
  label: string;
}

const HUB_LOCATIONS: Record<RegionCluster, Partial<Record<HubDecisionType, HubEntry>>> = {
  'Delhi-NCR': {
    local_resale: { lat: 28.6139, lng: 77.209, label: 'ReLoop Local Hub — Delhi NCR' },
    refurbish: { lat: 28.535, lng: 77.391, label: 'Refurb Partner — Noida' },
    liquidate: { lat: 28.4595, lng: 77.0266, label: 'Liquidation Pallet Yard — Gurugram' },
    donate: { lat: 28.6304, lng: 77.2177, label: 'Donation Partner — Central Delhi' },
    recycle: { lat: 28.6692, lng: 77.101, label: 'Recycling Facility — West Delhi' },
  },
  Bengaluru: {
    local_resale: { lat: 12.9716, lng: 77.5946, label: 'ReLoop Local Hub — Bengaluru' },
    refurbish: { lat: 12.9352, lng: 77.6146, label: 'Refurb Partner — Koramangala' },
    liquidate: { lat: 12.9698, lng: 77.75, label: 'Liquidation Pallet Yard — Whitefield' },
    donate: { lat: 12.9166, lng: 77.6101, label: 'Donation Partner — HSR Layout' },
    recycle: { lat: 12.8452, lng: 77.6602, label: 'Recycling Facility — Electronic City' },
  },
  Mumbai: {
    local_resale: { lat: 19.076, lng: 72.8777, label: 'ReLoop Local Hub — Mumbai' },
    refurbish: { lat: 19.0596, lng: 72.8656, label: 'Refurb Partner — Bandra' },
    liquidate: { lat: 19.1136, lng: 72.9081, label: 'Liquidation Pallet Yard — Andheri East' },
    donate: { lat: 18.9322, lng: 72.8264, label: 'Donation Partner — South Mumbai' },
    recycle: { lat: 19.0596, lng: 72.9008, label: 'Recycling Facility — Chembur' },
  },
  other: {
    local_resale: { lat: 28.6139, lng: 77.209, label: 'ReLoop Local Hub' },
    refurbish: { lat: 28.535, lng: 77.391, label: 'Refurb Partner' },
    liquidate: { lat: 28.4595, lng: 77.0266, label: 'Liquidation Pallet Yard' },
    donate: { lat: 28.6304, lng: 77.2177, label: 'Donation Partner' },
    recycle: { lat: 28.6692, lng: 77.101, label: 'Recycling Facility' },
  },
};

/** Illustrative destination for the Bridge map. Returns null for decisions with
 *  no physical destination (restock/warehouse/return_to_seller/returnless_refund). */
export function hubLocationFor(
  region: RegionCluster,
  decision: HubDecisionType,
): (HubEntry & { lat: number; lng: number }) | null {
  return HUB_LOCATIONS[region][decision] ?? HUB_LOCATIONS.other[decision] ?? null;
}
