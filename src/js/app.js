import { state } from './state.js';
import { loadGoogleMaps, initPlacesAutocomplete } from './places.js';
import { initMap, updateRadius, dropPins } from './map.js';
import { searchVenues, searchAddons, sampleDensity, recommendRadius } from './search.js';
import { renderResults, renderCuratedResults, showLoading, showCuratingScreen, hideCuratingScreen, renderExtendCTA, renderAddonCard } from './ui.js';
import { curateVenues, replaceVenue, replaceVenueLenient, suggestAddon } from './ai.js';

const DAY_LABELS = { tonight: 'Tonight', friday: 'Fri', saturday: 'Sat', sunday: 'Sun', monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu' };
const TIME_LABELS = { afternoon: 'Afternoon', evening: 'Evening', 'late-night': 'Late night' };

const USE_MY_LOCATION_HTML = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v4.59L7.3 7.64a.75.75 0 00-1.1 1.02l3.25 3.5a.75.75 0 001.1 0l3.25-3.5a.75.75 0 10-1.1-1.02l-1.95 2.1V5z" clip-rule="evenodd" />
  </svg>
  Use my location`;

const LOCATION_SET_HTML = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
    <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
  </svg>
  Location set`;

function resetUseLocationButton(btn) {
  btn.innerHTML = USE_MY_LOCATION_HTML;
  btn.disabled = false;
}

const API_ERROR_MESSAGES = {
  'script-load-failed':       'Could not load Google Maps. Check your API key and that Maps JavaScript API is enabled in Google Cloud Console.',
  'places-api-new-disabled':  'Address autocomplete is disabled. Enable "Places API (New)" at console.cloud.google.com → APIs & Services → Library.',
  'geo-unsupported':          'Location access isn\'t available in this browser — try typing your address.',
  'geo-failed':               'Couldn\'t get your location — try entering your address above.',
};

function showApiError(card, errorCode) {
  hideApiError(card);
  const banner = document.createElement('div');
  banner.id = 'api-error-banner';
  banner.className = 'api-error-banner';
  banner.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style="width:16px;height:16px;flex-shrink:0;margin-top:1px">
      <path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/>
    </svg>
    <span>${API_ERROR_MESSAGES[errorCode] || errorCode}</span>`;
  card.appendChild(banner);
}

function hideApiError(card) {
  card.querySelector('#api-error-banner')?.remove();
}

function init() {
  const locationInput = document.getElementById('location-input');
  const useLocationBtn = document.getElementById('use-location-btn');
  const radiusSlider = document.getElementById('radius-slider');
  const radiusValue = document.getElementById('radius-value');
  const searchBtn = document.getElementById('search-btn');
  const resultsArea = document.getElementById('results-area');
  const locationCard = locationInput.closest('.card');

  const apiKey = typeof window !== 'undefined' ? window.GOOGLE_MAPS_API_KEY : '';
  if (!apiKey || apiKey.trim() === '') {
    const hint = document.createElement('p');
    hint.className = 'text-sm text-[#C6A86B] mt-3';
    hint.innerHTML = 'Add your Google API key in <code class="bg-[#F7F5F2] px-1 rounded">config.js</code> to enable address search.';
    locationCard.appendChild(hint);
  } else {
    loadGoogleMaps(apiKey).then(() => {
      initPlacesAutocomplete(
        locationInput,
        (location) => {
          state.location = location;
          locationInput.value = location.address;
          resetUseLocationButton(useLocationBtn);
          hideApiError(locationCard);
          applySmartRadius(location.lat, location.lng, location.types || []);
        },
        (errorCode) => showApiError(locationCard, errorCode),
      );
    }).catch(() => {
      showApiError(locationCard, 'script-load-failed');
    });
  }

  // Sync radius slider → display + state + live map update
  radiusSlider.addEventListener('input', () => {
    const val = parseFloat(radiusSlider.value);
    radiusValue.textContent = val % 1 === 0 ? val.toFixed(0) : val;
    state.radius = val;
    if (state.location?.lat != null) {
      updateRadius(state.location.lat, state.location.lng, val);
    }
    // Show override note if user adjusts away from recommendation
    if (state.recommendedRadius != null && val !== state.recommendedRadius) {
      radiusHint.textContent = `Recommended: ${state.recommendedRadius} mi · You set: ${val} mi`;
      radiusHint.classList.remove('hidden');
    } else if (state.recommendedRadius != null) {
      radiusHint.textContent = `Recommended for this area: ${state.recommendedRadius} mi`;
    }
  });

  // Dismiss geo error when user starts typing an address
  locationInput.addEventListener('input', () => hideApiError(locationCard));

  // Use current location
  useLocationBtn.addEventListener('click', () => {
    if (!navigator.geolocation) {
      showApiError(locationCard, 'geo-unsupported');
      return;
    }
    hideApiError(locationCard);
    useLocationBtn.textContent = 'Locating…';
    useLocationBtn.disabled = true;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.location = { lat: pos.coords.latitude, lng: pos.coords.longitude, address: 'Current location' };
        locationInput.value = 'Current location';
        useLocationBtn.innerHTML = LOCATION_SET_HTML;
        useLocationBtn.disabled = false;
        hideApiError(locationCard);
        applySmartRadius(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        resetUseLocationButton(useLocationBtn);
        showApiError(locationCard, 'geo-failed');
      }
    );
  });

  const radiusBadge = radiusSlider.closest('.card').querySelector('.radius-badge');
  const filtersUpdateBtn = document.getElementById('filters-update-btn');

  // When? collapsible
  const whenSummary = document.getElementById('when-summary');
  const whenPills = document.getElementById('when-pills');
  const whenChevron = document.getElementById('when-chevron');
  const whenDisplay = document.getElementById('when-display');

  whenSummary?.addEventListener('click', () => {
    whenPills.classList.toggle('is-open');
    whenChevron?.classList.toggle('when-chevron--open');
  });

  function updateWhenDisplay() {
    if (!whenDisplay) return;
    const parts = [];
    if (state.datetime.day) parts.push(DAY_LABELS[state.datetime.day] || state.datetime.day);
    if (state.datetime.time) parts.push(TIME_LABELS[state.datetime.time] || state.datetime.time);
    whenDisplay.textContent = parts.length ? parts.join(' · ') : 'Tap to set';
  }

  // Gray out incompatible budget pills based on selected vibe
  function updateBudgetExclusions() {
    const vibe = state.filters.vibe;
    const dollarPill   = document.querySelector('.filter-pill[data-group="budget"][data-value="$"]');
    const triplePill   = document.querySelector('.filter-pill[data-group="budget"][data-value="$$$"]');

    const disable = (pill) => {
      if (!pill) return;
      pill.classList.add('filter-pill--disabled');
      pill.disabled = true;
      if (state.filters.budget === pill.dataset.value) {
        state.filters.budget = null;
        pill.classList.remove('active');
      }
    };
    const enable = (pill) => {
      if (!pill) return;
      pill.classList.remove('filter-pill--disabled');
      pill.disabled = false;
    };

    if (vibe === 'gritty') {
      disable(triplePill);
      enable(dollarPill);
    } else if (vibe === 'fancy') {
      disable(dollarPill);
      enable(triplePill);
    } else {
      enable(dollarPill);
      enable(triplePill);
    }
  }

  // Dismiss one curated pick and fetch a single AI replacement from leftover venues
  async function dismissAndReplace(dismissedVenue) {
    state.curatedVenues = state.curatedVenues.filter(v => v.id !== dismissedVenue.id);
    const usedIds = new Set(state.curatedVenues.map(v => v.id));
    const remaining = state.venues.filter(v => !usedIds.has(v.id));

    if (!remaining.length) {
      // Pool is truly empty — render a notice card
      renderCuratedResults(state.curatedVenues, state.venues, dismissAndReplace, true /* poolEmpty */);
      dropPins(state.curatedVenues.length ? state.curatedVenues : state.venues);
      return;
    }

    let newPick = null;
    try {
      // First try a strict match; if it returns nothing, fall back to lenient
      newPick = await replaceVenue(remaining, state.filters, state.datetime);
      if (!newPick) {
        newPick = await replaceVenueLenient(remaining, state.filters, state.datetime);
      }
      if (newPick) state.curatedVenues.push(newPick);
    } catch (err) {
      console.warn('Replace venue failed:', err.message);
      // Last resort: lenient
      try {
        const fallback = await replaceVenueLenient(remaining, state.filters, state.datetime);
        if (fallback) { newPick = fallback; state.curatedVenues.push(fallback); }
      } catch (e) {
        console.warn('Lenient replace also failed:', e.message);
      }
    }

    renderCuratedResults(state.curatedVenues, state.venues, dismissAndReplace, false, newPick?.id ?? null);
    dropPins(state.curatedVenues.length ? state.curatedVenues : state.venues);
  }

  // Re-run AI curation with current venues + updated filters (no re-fetch)
  async function reCurate() {
    if (!state.venues.length) return;
    showCuratingScreen();
    try {
      const curated = await curateVenues(state.venues, state.filters, state.datetime);
      state.curatedVenues = curated;
      state.addonVenue = null;
      hideCuratingScreen();
      renderCuratedResults(curated, state.venues, dismissAndReplace);
      dropPins(curated.length ? curated : state.venues);
      if (curated.length) renderExtendCTA(onExtend);
    } catch (aiErr) {
      hideCuratingScreen();
      console.warn('Re-curation failed:', aiErr.message);
      document.getElementById('results-heading').textContent = 'Nearby spots';
    }
  }

  // "Extend the Date" — fetch a new nearby search around the last pick and ask AI for one add-on
  async function onExtend() {
    const picks = state.curatedVenues;
    if (!picks.length) return;

    // Use the last pick's coordinates as the epicenter; fall back to search origin
    const anchor = picks[picks.length - 1];
    const lat = anchor.lat ?? state.location.lat;
    const lng = anchor.lng ?? state.location.lng;

    const addonPool = await searchAddons(lat, lng, 0.5, apiKey);

    // Filter out venues already curated
    const usedIds = new Set(picks.map(v => v.id));
    const candidates = addonPool.filter(v => !usedIds.has(v.id));

    if (!candidates.length) {
      throw new Error('No add-on candidates found nearby');
    }

    const addon = await suggestAddon(picks, candidates, state.filters, state.datetime);
    if (!addon) throw new Error('AI returned no add-on suggestion');

    state.addonVenue = addon;
    renderAddonCard(addon);
  }

  const DATETIME_GROUPS = new Set(['day', 'time']);

  // Filter pills — toggle active state, apply exclusions, mark update button pending
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      if (pill.disabled) return;
      const group = pill.dataset.group;
      const value = pill.dataset.value;

      // Route day/time pills to state.datetime; everything else to state.filters
      const target = DATETIME_GROUPS.has(group) ? state.datetime : state.filters;

      if (target[group] === value) {
        target[group] = null;
        pill.classList.remove('active');
      } else {
        document.querySelectorAll(`.filter-pill[data-group="${group}"]`)
          .forEach(p => p.classList.remove('active'));
        target[group] = value;
        pill.classList.add('active');
      }

      if (DATETIME_GROUPS.has(group)) {
        updateWhenDisplay();
      } else {
        updateBudgetExclusions();
      }

      // Only mark pending if there are results to re-curate
      if (state.venues.length) {
        filtersUpdateBtn.classList.add('filters-update-btn--pending');
        filtersUpdateBtn.textContent = 'Re-curate with new mood ✦';
      }
    });
  });

  // Update button — triggers re-curation on demand
  filtersUpdateBtn.addEventListener('click', async () => {
    filtersUpdateBtn.classList.remove('filters-update-btn--pending');
    filtersUpdateBtn.textContent = 'Update picks';
    filtersUpdateBtn.disabled = true;
    await reCurate();
    filtersUpdateBtn.disabled = false;
  });

  // Inject the hint element once, update its text as needed
  const radiusHint = document.createElement('p');
  radiusHint.id = 'radius-hint';
  radiusHint.className = 'radius-hint hidden';
  radiusSlider.closest('.card').appendChild(radiusHint);

  function setRadiusValue(miles, animate = false) {
    radiusSlider.value = miles;
    radiusValue.textContent = miles % 1 === 0 ? miles.toFixed(0) : miles;
    state.radius = miles;
    if (animate) {
      radiusBadge.classList.add('radius-badge--pop');
      radiusBadge.addEventListener('animationend', () => radiusBadge.classList.remove('radius-badge--pop'), { once: true });
    }
    if (state.location?.lat != null) {
      updateRadius(state.location.lat, state.location.lng, miles);
    }
  }

  async function applySmartRadius(lat, lng, locationTypes = []) {
    radiusHint.textContent = 'Detecting area density…';
    radiusHint.classList.remove('hidden');
    const count = await sampleDensity(lat, lng, apiKey);
    const recommended = recommendRadius(count, locationTypes);
    state.recommendedRadius = recommended;
    setRadiusValue(recommended, true);
    radiusHint.textContent = `Recommended for this area: ${recommended} mi`;
  }

  async function runSearch() {
    const { lat, lng } = state.location;

    const mainEl = document.querySelector('main');
    mainEl.classList.remove('search-has-results');

    initMap(lat, lng, state.radius);
    showLoading();
    // Let the map transition start, then scroll up to reveal it
    setTimeout(() => {
      document.getElementById('map-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
    searchBtn.disabled = true;
    searchBtn.textContent = 'Searching…';

    // Reset toggle
    const toggleBtn = document.getElementById('view-toggle-btn');
    const heading = document.getElementById('results-heading');
    if (toggleBtn) toggleBtn.classList.add('hidden');
    if (heading) heading.textContent = 'Nearby spots';
    state.curatedVenues = [];

    try {
      const venues = await searchVenues(lat, lng, state.radius, apiKey);
      state.venues = venues;

      // Hide first-run hint after first successful search
      document.getElementById('onboarding-hint')?.classList.add('hidden');

      if (venues.length) {
        showCuratingScreen();
        try {
          const curated = await curateVenues(venues, state.filters, state.datetime);
          state.curatedVenues = curated;
          state.addonVenue = null;
          hideCuratingScreen();
          renderCuratedResults(curated, venues, dismissAndReplace);
          dropPins(curated.length ? curated : venues);
          if (curated.length) renderExtendCTA(onExtend);
        } catch (aiErr) {
          hideCuratingScreen();
          console.warn('AI curation failed, showing raw results:', aiErr.message);
          renderResults(venues);
          dropPins(venues);
        }
        // Reveal Update button now that results exist
        filtersUpdateBtn.classList.remove('hidden');
        filtersUpdateBtn.textContent = 'Update picks';
        filtersUpdateBtn.classList.remove('filters-update-btn--pending');
        document.querySelector('main').classList.add('search-has-results');
      } else {
        renderResults(venues);
        dropPins(venues);
      }
    } catch (err) {
      document.getElementById('results-list').innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="32" cy="32" r="22" stroke="rgba(198,168,107,0.4)" stroke-width="2" fill="rgba(198,168,107,0.06)"/>
              <path d="M32 20v14M32 38v3" stroke="rgba(198,168,107,0.7)" stroke-width="2.5" stroke-linecap="round"/>
            </svg>
          </div>
          <p class="empty-state-title">Something went wrong</p>
          <p class="empty-state-copy">We couldn't complete that search. Check your connection and try again.</p>
        </div>`;
      document.getElementById('results-area').classList.add('is-visible');
    } finally {
      searchBtn.disabled = false;
      searchBtn.textContent = 'Find date spots';
    }
  }

  // Search button
  searchBtn.addEventListener('click', () => {
    if (!state.location?.lat || !state.location?.lng) {
      locationInput.focus();
      locationInput.style.outline = '2px solid #D8A7A1';
      setTimeout(() => { locationInput.style.outline = ''; }, 1500);
      return;
    }
    runSearch();
  });

}

document.addEventListener('DOMContentLoaded', init);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}
