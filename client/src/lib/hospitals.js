import fallbackHospitals from '../data/hospitals.fallback.json';

/**
 * Public Overpass mirrors, queried in parallel rather than one after another.
 *
 * These instances routinely take 6–11 seconds under load, so trying them in
 * sequence means the slow ones burn the whole budget before a fast one is
 * ever reached. Racing them returns whichever answers first.
 *
 * `overpass.osm.ch` is deliberately absent: it serves a regional extract and
 * answers queries outside its area with an empty result set, which is worse
 * than an error because it looks like success.
 */
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

/** Generous, because the alternative is a useless national fallback list. */
const TIMEOUT_MS = 15000;

/** If the first radius finds nothing, widen once before giving up. */
const WIDEN_MULTIPLIER = 4;

/**
 * A bundled hospital further than this is not "nearby" in any useful sense.
 * Showing someone a hospital 350km away during an emergency is worse than
 * showing nothing and telling them to call the ambulance number.
 */
const FALLBACK_MAX_METRES = 60_000;

const CACHE_KEY = 'medconsult.hospitals';
const CACHE_TTL_MS = 10 * 60 * 1000;

/** Great-circle distance in metres. */
export function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

const buildQuery = (lat, lng, radius) => `
[out:json][timeout:25];
(
  node["amenity"~"^(hospital|clinic|doctors)$"](around:${radius},${lat},${lng});
  way["amenity"~"^(hospital|clinic|doctors)$"](around:${radius},${lat},${lng});
);
out center 40;`;

function normalise(elements, lat, lng) {
  return elements
    .map((el) => {
      // Ways report their centroid under `center`; nodes carry lat/lon directly.
      const elLat = el.lat ?? el.center?.lat;
      const elLon = el.lon ?? el.center?.lon;
      if (elLat == null || elLon == null) return null;

      const tags = el.tags ?? {};
      const amenity = tags.amenity;

      return {
        id: `${el.type}/${el.id}`,
        name: tags.name || tags['name:en'] || 'Unnamed medical facility',
        kind: amenity === 'hospital' ? 'hospital' : 'clinic',
        emergency: tags.emergency === 'yes',
        phone: tags.phone || tags['contact:phone'] || '',
        address: [tags['addr:street'], tags['addr:city']].filter(Boolean).join(', '),
        lat: elLat,
        lng: elLon,
        distance: distanceMeters(lat, lng, elLat, elLon),
      };
    })
    .filter(Boolean)
    // Nearest first. Hospitals outrank clinics at a similar distance, because
    // a clinic is unlikely to help in an emergency.
    .sort((a, b) => {
      if (a.kind !== b.kind && Math.abs(a.distance - b.distance) < 500) {
        return a.kind === 'hospital' ? -1 : 1;
      }
      return a.distance - b.distance;
    });
}

/** One endpoint. Rejects on anything that is not a usable result set. */
async function queryEndpoint(endpoint, lat, lng, radius) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(buildQuery(lat, lng, radius))}`,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status} from ${endpoint}`);

  const data = await response.json();
  const hospitals = normalise(data.elements ?? [], lat, lng);

  // An empty answer is treated as a failure so a regional mirror that returns
  // "0 results" cannot win the race against an instance that has real data.
  if (!hospitals.length) throw new Error(`No results from ${endpoint}`);

  return hospitals;
}

/** First endpoint to return real results wins. */
async function raceEndpoints(lat, lng, radius) {
  return Promise.any(
    OVERPASS_ENDPOINTS.map((endpoint) => queryEndpoint(endpoint, lat, lng, radius))
  );
}

const readCache = (lat, lng) => {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - cached.at > CACHE_TTL_MS) return null;
    // Only reuse if the user has barely moved.
    if (distanceMeters(lat, lng, cached.lat, cached.lng) > 500) return null;
    return cached.hospitals;
  } catch {
    return null;
  }
};

const writeCache = (lat, lng, hospitals) => {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), lat, lng, hospitals }));
  } catch {
    // A full or disabled sessionStorage must not break the emergency screen.
  }
};

/**
 * Finds nearby hospitals from OpenStreetMap, nearest first.
 *
 * Runs in the browser rather than through our API on purpose: a free-tier
 * backend that has gone to sleep would otherwise add a 30-second cold start
 * to the one screen where waiting matters least acceptably.
 *
 * Returns `{ hospitals, source, searchedRadius }` where source is:
 *   'overpass' — real data for this location
 *   'cache'    — the same, from a recent lookup
 *   'fallback' — a bundled list, already filtered to plausible distance
 *   'none'     — nothing usable was found; the caller should say so
 */
export async function findNearbyHospitals(lat, lng, radius = 5000) {
  const cached = readCache(lat, lng);
  if (cached) return { hospitals: cached, source: 'cache', searchedRadius: radius };

  // First pass at the requested radius, then one wider attempt. A rural
  // location legitimately has nothing within 5km.
  for (const attemptRadius of [radius, radius * WIDEN_MULTIPLIER]) {
    try {
      const hospitals = await raceEndpoints(lat, lng, attemptRadius);
      writeCache(lat, lng, hospitals);
      return { hospitals, source: 'overpass', searchedRadius: attemptRadius };
    } catch {
      // Every mirror failed or returned nothing at this radius — widen.
    }
  }

  // Last resort. Anything implausibly far is dropped rather than presented
  // as though it were nearby.
  const nearby = fallbackHospitals
    .map((h) => ({ ...h, distance: distanceMeters(lat, lng, h.lat, h.lng) }))
    .filter((h) => h.distance <= FALLBACK_MAX_METRES)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 10);

  return {
    hospitals: nearby,
    source: nearby.length ? 'fallback' : 'none',
    searchedRadius: radius * WIDEN_MULTIPLIER,
  };
}
