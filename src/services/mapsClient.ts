export interface NearbyLandmarkItem {
  name: string;
  distanceMeters: number;
  relationalDescription: string;
  lat?: number;
  lng?: number;
}

export interface ReverseGeocodeResult {
  source: 'openstreetmap_nominatim' | 'coordinate_fallback';
  formattedAddress: string;
  specificSpot: string;
  area: string;
  street: string;
  city: string;
  postalCode: string;
  nearbyLandmarks: NearbyLandmarkItem[];
  matchedLocality: string;
  matchedWardNumber: number;
}

export interface PlaceSearchResult {
  displayName: string;
  mainText: string;
  secondaryText: string;
  lat: number;
  lng: number;
  area: string;
  street: string;
}

export async function searchBengaluruSpots(query: string): Promise<PlaceSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const resp = await fetch(`/api/maps/search?q=${encodeURIComponent(trimmed)}`);
  if (!resp.ok) return [];
  const data = (await resp.json().catch(() => null)) as {
    results?: PlaceSearchResult[];
  } | null;
  return data?.results || [];
}

export async function reverseGeocodeSpot(
  lat: number,
  lng: number
): Promise<ReverseGeocodeResult> {
  const url = `/api/maps/reverse-geocode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`;
  const resp = await fetch(url);
  const data = (await resp.json().catch(() => null)) as
    | (ReverseGeocodeResult & { error?: string })
    | null;

  if (!resp.ok || !data) {
    throw new Error(data?.error || 'Unable to reverse geocode coordinates.');
  }
  return data;
}

/**
 * Formats a concise, complete civic location string within Firestore's 240-char `address` limit.
 */
export function buildCompleteLocationString(params: {
  specificSpot?: string;
  formattedAddress?: string;
  area?: string;
  manualHint?: string;
}): string {
  const spot = (params.specificSpot || '').trim();
  const formatted = (params.formattedAddress || '').trim();
  const hint = (params.manualHint || '').trim();
  const area = (params.area || '').trim();

  const parts: string[] = [];
  if (hint) parts.push(hint);
  if (spot && !hint.toLowerCase().includes(spot.toLowerCase())) {
    parts.push(spot);
  }
  if (formatted) {
    const firstPart = formatted.split(',').slice(0, 4).join(',').trim();
    if (firstPart && !parts.join(' ').toLowerCase().includes(firstPart.toLowerCase())) {
      parts.push(firstPart);
    }
  } else if (area && !parts.join(' ').toLowerCase().includes(area.toLowerCase())) {
    parts.push(`${area}, Bengaluru`);
  }

  return parts.join(' — ').slice(0, 238);
}

export function buildOpenStreetMapExternalUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lng)}#map=18/${encodeURIComponent(lat)}/${encodeURIComponent(lng)}`;
}
