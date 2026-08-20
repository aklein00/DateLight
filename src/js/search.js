const MILES_TO_METERS = 1609.34;

function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const PRICE_LEVELS = {
  PRICE_LEVEL_FREE:           '',
  PRICE_LEVEL_INEXPENSIVE:    '$',
  PRICE_LEVEL_MODERATE:       '$$',
  PRICE_LEVEL_EXPENSIVE:      '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
};

const TYPE_LABELS = {
  restaurant:          'Restaurant',
  bar:                 'Bar',
  cafe:                'Café',
  night_club:          'Nightclub',
  dessert_restaurant:  'Dessert',
  ice_cream_shop:      'Ice Cream',
  bakery:              'Bakery',
  tourist_attraction:  'Attraction',
  amusement_park:      'Amusement',
  bowling_alley:       'Bowling',
  movie_theater:       'Cinema',
  spa:                 'Spa',
  art_gallery:         'Gallery',
  museum:              'Museum',
  park:                'Park',
};

const SKIP_TYPES = new Set([
  'establishment', 'point_of_interest', 'food', 'store',
  'health', 'beauty_salon', 'lodging',
]);

export function getPrimaryType(types = []) {
  for (const t of types) {
    if (TYPE_LABELS[t]) return TYPE_LABELS[t];
  }
  for (const t of types) {
    if (!SKIP_TYPES.has(t)) {
      return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
  }
  return 'Venue';
}

const FOOD_DRINK_TYPES = [
  'restaurant', 'bar', 'cafe', 'night_club',
  'dessert_restaurant', 'ice_cream_shop', 'bakery',
];

const ACTIVITY_TYPES = [
  'park', 'art_gallery', 'museum',
  'movie_theater', 'bowling_alley', 'amusement_park',
  'tourist_attraction',
];

const DATE_CANDIDATE_TYPES = [...FOOD_DRINK_TYPES, ...ACTIVITY_TYPES];

const PLACE_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.types',
  'places.formattedAddress',
  'places.googleMapsUri',
  'places.businessStatus',
].join(',');

function getVenueCategory(types = []) {
  if (types.some(t => ACTIVITY_TYPES.includes(t))) return 'activity';
  if (types.some(t => FOOD_DRINK_TYPES.includes(t))) return 'food_drink';
  return 'venue';
}

function normalizePlace(p, originLat, originLng) {
  return {
    id: p.id,
    name: p.displayName?.text || 'Unknown',
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    distanceMiles: (p.location?.latitude != null && p.location?.longitude != null)
      ? haversineMiles(originLat, originLng, p.location.latitude, p.location.longitude)
      : null,
    rating: p.rating ?? null,
    ratingCount: p.userRatingCount ?? null,
    price: PRICE_LEVELS[p.priceLevel] ?? null,
    type: getPrimaryType(p.types),
    category: getVenueCategory(p.types),
    rawTypes: p.types || [],
    address: p.formattedAddress ?? null,
    mapsUrl: p.googleMapsUri ?? null,
  };
}

async function fetchNearbyPlaces(lat, lng, radiusMeters, apiKey, includedTypes, maxResultCount) {
  const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': PLACE_FIELD_MASK,
    },
    body: JSON.stringify({
      includedTypes,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusMeters,
        },
      },
      maxResultCount,
      rankPreference: 'POPULARITY',
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Places API error ${response.status}`);
  }

  const data = await response.json();
  return (data.places || []).filter(p => p.businessStatus !== 'CLOSED_PERMANENTLY');
}

function dedupePlaces(places) {
  return Array.from(new Map(places.map(place => [place.id, place])).values());
}

/**
 * Search for date-worthy venues near a location using the Places API (New).
 * @param {number} lat
 * @param {number} lng
 * @param {number} radiusMiles
 * @param {string} apiKey
 * @returns {Promise<Array>} Normalized venue objects sorted by rating.
 */
export async function searchVenues(lat, lng, radiusMiles, apiKey) {
  const radiusMeters = Math.min(radiusMiles * MILES_TO_METERS, 50000); // API max 50km

  const [foodDrink, activities] = await Promise.all([
    fetchNearbyPlaces(lat, lng, radiusMeters, apiKey, FOOD_DRINK_TYPES, 14),
    fetchNearbyPlaces(lat, lng, radiusMeters, apiKey, ACTIVITY_TYPES, 10),
  ]);

  return dedupePlaces([...foodDrink, ...activities])
    .map(p => normalizePlace(p, lat, lng))
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
}

/**
 * Search for add-on venues (dessert, activities, parks, etc.) near a location.
 * Used by the "Extend the Date" feature to find a follow-up stop.
 * @param {number} lat
 * @param {number} lng
 * @param {number} radiusMiles
 * @param {string} apiKey
 * @returns {Promise<Array>} Normalized venue objects sorted by rating.
 */
export async function searchAddons(lat, lng, radiusMiles, apiKey) {
  const radiusMeters = Math.min(radiusMiles * MILES_TO_METERS, 50000);

  const places = await fetchNearbyPlaces(
    lat,
    lng,
    radiusMeters,
    apiKey,
    ['bar', 'night_club', 'cafe', 'dessert_restaurant', 'ice_cream_shop', 'bakery', ...ACTIVITY_TYPES],
    15,
  );

  return places
    .map(p => normalizePlace(p, lat, lng))
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
}

/**
 * Sample venue density at 1 km to recommend a scatter radius.
 * Only requests IDs to minimize billing cost.
 * @returns {Promise<number>} Count of venues found (capped at 20 by the API).
 */
export async function sampleDensity(lat, lng, apiKey) {
  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id',
      },
      body: JSON.stringify({
        includedTypes: DATE_CANDIDATE_TYPES,
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: 1000,
          },
        },
        maxResultCount: 20,
        rankPreference: 'POPULARITY',
      }),
    });
    if (!response.ok) return 0;
    const data = await response.json();
    return (data.places || []).length;
  } catch {
    return 0;
  }
}

// Returns a multiplier based on how broad the selected location type is.
// Specific addresses/neighborhoods use density alone (×1). Cities and broader
// areas scale up so the search covers a meaningful portion of that place.
function locationTypeMultiplier(types = []) {
  const t = new Set(types);
  if (t.has('country') || t.has('administrative_area_level_1')) return 8;
  if (t.has('administrative_area_level_2') || t.has('postal_code')) return 4;
  if (t.has('locality') || t.has('postal_town') || t.has('colloquial_area')) return 2.5;
  return 1; // neighborhood, sublocality, route, premise, establishment, etc.
}

// Base density recommendation (API caps sample at 20).
// 18+ at 1km = very dense city core → 1.25 mi
// 12–17 = dense urban → 2 mi
// 6–11  = suburban    → 3.5 mi
// <6    = sparse/rural → 6 mi
//
// locationTypes (optional) scales the result up for broad searches like
// "Sacramento" (locality) vs "Inner Sunset" (neighborhood).
export function recommendRadius(venueCount, locationTypes = []) {
  let base;
  if (venueCount >= 18) base = 1.25;
  else if (venueCount >= 12) base = 2;
  else if (venueCount >= 6)  base = 3.5;
  else base = 6;

  const scaled = base * locationTypeMultiplier(locationTypes);
  // Round to nearest 0.25 step to match slider; cap at slider max
  return Math.min(Math.round(scaled * 4) / 4, 10);
}
