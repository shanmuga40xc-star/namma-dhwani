import { BENGALURU_BOUNDS, KARNATAKA_BOUNDS } from './constants.ts';
import type { ConstituencyBoundary } from './types.ts';

export function isInsideKarnataka(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return (
    lat >= KARNATAKA_BOUNDS.south &&
    lat <= KARNATAKA_BOUNDS.north &&
    lng >= KARNATAKA_BOUNDS.west &&
    lng <= KARNATAKA_BOUNDS.east
  );
}

export function isInsideBengaluru(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return (
    lat >= BENGALURU_BOUNDS.south &&
    lat <= BENGALURU_BOUNDS.north &&
    lng >= BENGALURU_BOUNDS.west &&
    lng <= BENGALURU_BOUNDS.east
  );
}

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return Math.round(R * c * 100) / 100;
}

/** Ray-casting point-in-polygon check where polygon vertices are [lng, lat]. */
export function pointInPolygon(
  lat: number,
  lng: number,
  polygon: Array<[number, number]>
): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export interface ConstituencyLookupResult {
  insideServiceArea: boolean;
  constituency: ConstituencyBoundary | null;
  nearBoundary: boolean;
  boundaryDistanceMeters: number | null;
}

/**
 * Matches a coordinate pair across all of Karnataka against active constituencies (polygon first, then rectangle bounds).
 * Returns insideServiceArea=false only when outside Karnataka; areas in Karnataka without imported polygons
 * return insideServiceArea=true with constituency=null so the app can route to a regional Karnataka desk cleanly.
 */
export function lookupConstituency(
  lat: number,
  lng: number,
  constituencies: ConstituencyBoundary[]
): ConstituencyLookupResult {
  if (!isInsideKarnataka(lat, lng)) {
    return {
      insideServiceArea: false,
      constituency: null,
      nearBoundary: false,
      boundaryDistanceMeters: null,
    };
  }

  if (constituencies.length === 0) {
    return {
      insideServiceArea: true,
      constituency: null,
      nearBoundary: false,
      boundaryDistanceMeters: null,
    };
  }

  let matched: ConstituencyBoundary | null = null;

  for (const c of constituencies) {
    if (c.polygon && c.polygon.length >= 3) {
      if (pointInPolygon(lat, lng, c.polygon)) {
        matched = c;
        break;
      }
    } else if (
      lat >= c.bounds.south &&
      lat <= c.bounds.north &&
      lng >= c.bounds.west &&
      lng <= c.bounds.east
    ) {
      matched = c;
      break;
    }
  }

  // If point is inside Bengaluru metropolitan bounds (or within 2.5km of a loaded constituency center gap)
  // assign it to the nearest constituency instead of snapping far-away Karnataka cities to a Bengaluru ward.
  if (!matched && isInsideBengaluru(lat, lng)) {
    let bestDist = Infinity;
    for (const c of constituencies) {
      const centerLat = (c.bounds.south + c.bounds.north) / 2;
      const centerLng = (c.bounds.west + c.bounds.east) / 2;
      const d = haversineMeters(lat, lng, centerLat, centerLng);
      if (d < bestDist) {
        bestDist = d;
        matched = c;
      }
    }
  }

  if (!matched) {
    return {
      insideServiceArea: true,
      constituency: null,
      nearBoundary: false,
      boundaryDistanceMeters: null,
    };
  }

  // Approximate distance to nearest bounding box edge in meters (~180m threshold = near boundary)
  const distSouth = haversineMeters(lat, lng, matched.bounds.south, lng);
  const distNorth = haversineMeters(lat, lng, matched.bounds.north, lng);
  const distWest = haversineMeters(lat, lng, lat, matched.bounds.west);
  const distEast = haversineMeters(lat, lng, lat, matched.bounds.east);
  const minEdgeDist = Math.min(distSouth, distNorth, distWest, distEast);

  return {
    insideServiceArea: true,
    constituency: matched,
    nearBoundary: minEdgeDist <= 180,
    boundaryDistanceMeters: Math.round(minEdgeDist),
  };
}

const CIVIC_SYNONYMS: Record<string, string> = {
  lamp: 'streetlight',
  lamps: 'streetlight',
  light: 'streetlight',
  lights: 'streetlight',
  streetlights: 'streetlight',
  bulb: 'streetlight',
  pole: 'streetlight',
  dark: 'streetlight',
  darkness: 'streetlight',
  outage: 'streetlight',
  flickering: 'streetlight',
  trash: 'garbage',
  waste: 'garbage',
  rubbish: 'garbage',
  litter: 'garbage',
  dump: 'garbage',
  dumpster: 'garbage',
  dustbin: 'garbage',
  bin: 'garbage',
  filth: 'garbage',
  dirt: 'garbage',
  stink: 'garbage',
  smell: 'garbage',
  odor: 'garbage',
  odour: 'garbage',
  debris: 'garbage',
  pile: 'garbage',
  heap: 'garbage',
  leak: 'leakage',
  leaking: 'leakage',
  burst: 'leakage',
  pipe: 'leakage',
  pipeline: 'leakage',
  waterlog: 'leakage',
  waterlogged: 'leakage',
  flood: 'leakage',
  flooded: 'leakage',
  flooding: 'leakage',
  puddle: 'leakage',
  drain: 'leakage',
  drainage: 'leakage',
  gutter: 'leakage',
  sewage: 'leakage',
  sewer: 'leakage',
  overflow: 'leakage',
  overflowing: 'leakage',
  choked: 'leakage',
  clogged: 'leakage',
  manhole: 'leakage',
  potholes: 'pothole',
  pit: 'pothole',
  crater: 'pothole',
  cavity: 'pothole',
  ditch: 'pothole',
  cavein: 'pothole',
  tarmac: 'pothole',
  asphalt: 'pothole',
  bitumen: 'pothole',
  road: 'pothole',
};

export function tokenizeCivicText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .map((w) => CIVIC_SYNONYMS[w] ?? w);
}

export function computeCivicTextSimilarity(textA: string, textB: string): number {
  const tokensA = new Set(tokenizeCivicText(textA));
  const tokensB = new Set(tokenizeCivicText(textB));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let overlap = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) overlap += 1;
  }
  const union = tokensA.size + tokensB.size - overlap;
  const jaccard = union === 0 ? 0 : overlap / union;
  return Math.round(jaccard * 1000) / 1000;
}
