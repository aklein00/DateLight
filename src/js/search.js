const MILES_TO_METERS = 1609.34;

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

  const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': [
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
      ].join(','),
    },
    body: JSON.stringify({
      includedTypes: ['restaurant', 'bar', 'cafe', 'night_club'],
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusMeters,
        },
      },
      maxResultCount: 20,
      rankPreference: 'POPULARITY',
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Places API error ${response.status}`);
  }

  const data = await response.json();
  const places = (data.places || []).filter(p => p.businessStatus !== 'CLOSED_PERMANENTLY');

  return places.map(p => ({
    id: p.id,
    name: p.displayName?.text || 'Unknown',
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    rating: p.rating ?? null,
    ratingCount: p.userRatingCount ?? null,
    price: PRICE_LEVELS[p.priceLevel] ?? null,
    type: getPrimaryType(p.types),
    address: p.formattedAddress ?? null,
    mapsUrl: p.googleMapsUri ?? null,
  })).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
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
        includedTypes: ['restaurant', 'bar', 'cafe', 'night_club'],
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
