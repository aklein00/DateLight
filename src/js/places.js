function debounce(fn, delay) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

/**
 * Load Google Maps JavaScript API with the Places library.
 * @param {string} apiKey
 * @returns {Promise<void>}
 */
export function loadGoogleMaps(apiKey) {
  if (typeof google !== 'undefined' && google.maps) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('script-load-failed'));
    document.head.appendChild(script);
  });
}

/**
 * Attach a custom autocomplete dropdown to an input using the new AutocompleteSuggestion API.
 * Calls onPlaceSelect({ lat, lng, address }) when user picks a suggestion.
 * Calls onError(errorCode) if the API is unavailable.
 * @param {HTMLInputElement} input
 * @param {(location: { lat: number, lng: number, address: string }) => void} onPlaceSelect
 * @param {(errorCode: string) => void} [onError]
 */
export async function initPlacesAutocomplete(input, onPlaceSelect, onError) {
  if (!google.maps.places?.AutocompleteSuggestion) {
    onError?.('places-api-new-disabled');
    return;
  }

  const { AutocompleteSuggestion, AutocompleteSessionToken } = google.maps.places;
  let sessionToken = new AutocompleteSessionToken();
  let dropdown = null;

  async function fetchSuggestions(value) {
    if (value.trim().length < 2) { closeDropdown(); return; }
    try {
      const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: value,
        sessionToken,
      });
      renderDropdown(suggestions);
    } catch (err) {
      const msg = String(err);
      if (msg.includes('has not been used') || msg.includes('disabled') || msg.includes('403')) {
        onError?.('places-api-new-disabled');
      }
    }
  }

  function renderDropdown(suggestions) {
    closeDropdown();
    if (!suggestions.length) return;

    dropdown = document.createElement('ul');
    dropdown.className = 'autocomplete-dropdown';

    suggestions.forEach(s => {
      const pred = s.placePrediction;
      const li = document.createElement('li');
      li.className = 'autocomplete-item';

      const main = document.createElement('span');
      main.className = 'autocomplete-main';
      main.textContent = pred.mainText?.toString() || pred.text?.toString() || '';

      const secondary = document.createElement('span');
      secondary.className = 'autocomplete-secondary';
      secondary.textContent = pred.secondaryText?.toString() || '';

      li.appendChild(main);
      if (secondary.textContent) li.appendChild(secondary);

      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectPrediction(pred);
      });

      dropdown.appendChild(li);
    });

    input.parentNode.style.position = 'relative';
    input.parentNode.appendChild(dropdown);
  }

  async function selectPrediction(prediction) {
    closeDropdown();
    try {
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ['location', 'formattedAddress', 'displayName', 'types'] });

      const lat = typeof place.location.lat === 'function' ? place.location.lat() : place.location.lat;
      const lng = typeof place.location.lng === 'function' ? place.location.lng() : place.location.lng;
      const address = place.formattedAddress || place.displayName?.toString() || `${lat}, ${lng}`;
      const types = place.types || [];

      input.value = address;
      onPlaceSelect({ lat, lng, address, types });
      sessionToken = new AutocompleteSessionToken();
    } catch (err) {
      console.error('Place detail fetch failed', err);
    }
  }

  function closeDropdown() {
    if (dropdown) { dropdown.remove(); dropdown = null; }
  }

  input.addEventListener('input', debounce((e) => fetchSuggestions(e.target.value), 300));
  input.addEventListener('blur', () => setTimeout(closeDropdown, 150));
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDropdown(); });
}
