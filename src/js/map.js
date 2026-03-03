const MILES_TO_METERS = 1609.34;

let map = null;
let radiusCircle = null;
let centerMarker = null;

// Each entry: { marker, venueId, index }
let venueMarkers = [];

/**
 * Initialize (or re-center) the Leaflet map.
 * Shows #map-section, creates the map if first call, otherwise re-centers.
 * Uses double-rAF to ensure the container has painted before Leaflet measures it.
 */
export function initMap(lat, lng, radiusMiles) {
  const L = window.L;
  if (!L) return;

  const mapSection = document.getElementById('map-section');
  mapSection.classList.add('is-visible');

  // Double rAF: first frame removes display:none, second frame has real layout dimensions
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (map) {
      _updatePosition(lat, lng, radiusMiles);
      map.invalidateSize();
      return;
    }

    map = L.map('map', {
      center: [lat, lng],
      zoom: 14,
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
    });

    // CartoDB Positron — clean, light tiles that match the warm-white palette
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    // Center dot
    centerMarker = L.circleMarker([lat, lng], {
      radius: 7,
      fillColor: '#1C1C1E',
      color: '#F7F5F2',
      weight: 2.5,
      fillOpacity: 1,
    }).addTo(map);

    // Scatter radius circle
    radiusCircle = L.circle([lat, lng], {
      radius: radiusMiles * MILES_TO_METERS,
      color: '#7FA38A',
      weight: 2,
      fillColor: '#7FA38A',
      fillOpacity: 0.08,
      dashArray: '6 4',
    }).addTo(map);

    map.fitBounds(radiusCircle.getBounds(), { padding: [24, 24] });
  }));
}

/**
 * Update the circle radius (and optionally re-center) without reinitializing the map.
 */
export function updateRadius(lat, lng, radiusMiles) {
  if (!map || !radiusCircle) return;
  _updatePosition(lat, lng, radiusMiles);
}

const PIN_STAGGER_MS = 80;

function makePinIcon(label, active = false) {
  return window.L.divIcon({
    html: `<div class="map-pin-num${active ? ' map-pin-num--active' : ''}">${label}</div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

/**
 * Drop numbered pins for each venue on the map. Replaces any existing pins.
 * Pins animate in with a staggered delay.
 * @param {Array<{lat: number, lng: number, name: string, id: string}>} venues
 */
export function dropPins(venues) {
  if (!map) return;

  venueMarkers.forEach(({ marker }) => map.removeLayer(marker));
  venueMarkers = [];

  const valid = venues.filter(v => v.lat != null && v.lng != null);
  valid.forEach((venue, i) => {
    setTimeout(() => {
      const label = String(i + 1);
      const marker = window.L.marker([venue.lat, venue.lng], {
        icon: makePinIcon(label),
      });
      marker.bindPopup(`<strong style="font-family: 'Playfair Display', serif">${venue.name}</strong>`);
      marker.addTo(map);
      venueMarkers.push({ marker, venueId: venue.id, index: i, label });
    }, i * PIN_STAGGER_MS);
  });
}

/**
 * Highlight the map pin for the given venue (e.g. on card hover).
 */
export function highlightPin(venueId) {
  venueMarkers.forEach(({ marker, venueId: id, label }) => {
    if (id !== venueId) return;
    marker.setIcon(makePinIcon(label, true));
  });
}

/**
 * Restore a pin to its default state.
 */
export function unhighlightPin(venueId) {
  venueMarkers.forEach(({ marker, venueId: id, label }) => {
    if (id !== venueId) return;
    marker.setIcon(makePinIcon(label, false));
  });
}

function _updatePosition(lat, lng, radiusMiles) {
  const latlng = [lat, lng];
  radiusCircle.setLatLng(latlng);
  radiusCircle.setRadius(radiusMiles * MILES_TO_METERS);
  centerMarker.setLatLng(latlng);
  map.fitBounds(radiusCircle.getBounds(), { padding: [24, 24] });
}
