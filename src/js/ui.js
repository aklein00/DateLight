import { highlightPin, unhighlightPin } from './map.js';

const FAVORITES_KEY = 'datelight-favorites';

function getFavorites() {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); }
  catch { return []; }
}

function toggleFavorite(venueId) {
  const favs = getFavorites();
  const idx = favs.indexOf(venueId);
  if (idx >= 0) { favs.splice(idx, 1); }
  else { favs.push(venueId); }
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
  return idx < 0; // true = just saved
}

const CURATING_PHRASES = [
  'Finding your spark…',
  'Reading the room…',
  'Consulting the vibes…',
  'Looking for chemistry…',
  'Scanning for hidden gems…',
  'Curating tonight\'s magic…',
  'Thinking like a local…',
  'Following the energy…',
  'Asking the stars…',
  'Lighting up the city…',
  'Almost there…',
];

let _phraseInterval = null;

const BULB_SVG = `
<svg class="curating-bulb-svg" viewBox="0 0 80 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="40" cy="38" r="30" fill="rgba(198,168,107,0.07)" class="cl-glow cl-glow-3"/>
  <circle cx="40" cy="38" r="22" fill="rgba(198,168,107,0.11)" class="cl-glow cl-glow-2"/>
  <circle cx="40" cy="38" r="14" fill="rgba(198,168,107,0.18)" class="cl-glow cl-glow-1"/>
  <path d="M40 10C28 10 19 20 19 31C19 38.5 23 44.5 28.5 49L31.5 58H48.5L51.5 49C57 44.5 61 38.5 61 31C61 20 52 10 40 10Z" fill="#C6A86B"/>
  <ellipse cx="40" cy="33" rx="12" ry="13" fill="rgba(255,248,220,0.3)"/>
  <path d="M34 31c0-2.8 2.2-4.2 4.2-2.2.5.5.9 1.1 1.8 2.2.9-1.1 1.3-1.7 1.8-2.2 2-2 4.2-.6 4.2 2.2 0 3.2-6 8.5-6 8.5s-6-5.3-6-8.5z" fill="rgba(255,255,255,0.78)"/>
  <rect x="31" y="58" width="18" height="6" rx="2.5" fill="#9a7030"/>
  <rect x="32.5" y="64" width="15" height="5" rx="2" fill="#845e20"/>
  <rect x="34" y="69" width="12" height="4.5" rx="1.8" fill="#6e4e10"/>
  <line x1="15" y1="17" x2="15" y2="24" stroke="rgba(198,168,107,0.75)" stroke-width="2.2" stroke-linecap="round" class="cl-spark cl-spark-1"/>
  <line x1="11.5" y1="20.5" x2="18.5" y2="20.5" stroke="rgba(198,168,107,0.75)" stroke-width="2.2" stroke-linecap="round" class="cl-spark cl-spark-1"/>
  <line x1="65" y1="12" x2="65" y2="19" stroke="rgba(198,168,107,0.85)" stroke-width="2.2" stroke-linecap="round" class="cl-spark cl-spark-2"/>
  <line x1="61.5" y1="15.5" x2="68.5" y2="15.5" stroke="rgba(198,168,107,0.85)" stroke-width="2.2" stroke-linecap="round" class="cl-spark cl-spark-2"/>
  <line x1="70" y1="40" x2="70" y2="46" stroke="rgba(198,168,107,0.6)" stroke-width="1.8" stroke-linecap="round" class="cl-spark cl-spark-3"/>
  <line x1="67" y1="43" x2="73" y2="43" stroke="rgba(198,168,107,0.6)" stroke-width="1.8" stroke-linecap="round" class="cl-spark cl-spark-3"/>
  <line x1="10" y1="46" x2="10" y2="51" stroke="rgba(198,168,107,0.45)" stroke-width="1.5" stroke-linecap="round" class="cl-spark cl-spark-4"/>
  <line x1="7.5" y1="48.5" x2="12.5" y2="48.5" stroke="rgba(198,168,107,0.45)" stroke-width="1.5" stroke-linecap="round" class="cl-spark cl-spark-4"/>
</svg>`;

export function showCuratingScreen() {
  const list = document.getElementById('results-list');
  const resultsArea = document.getElementById('results-area');
  const heading = document.getElementById('results-heading');

  if (heading) heading.textContent = '';

  list.innerHTML = `
    <div class="curating-screen">
      <div class="curating-bulb-wrap">${BULB_SVG}</div>
      <p class="curating-phrase" id="curating-phrase">${CURATING_PHRASES[0]}</p>
    </div>`;
  resultsArea.classList.add('is-visible');

  if (_phraseInterval) clearInterval(_phraseInterval);
  let idx = 0;
  _phraseInterval = setInterval(() => {
    idx = (idx + 1) % CURATING_PHRASES.length;
    const el = document.getElementById('curating-phrase');
    if (!el) return;
    el.classList.add('phrase-out');
    setTimeout(() => {
      el.textContent = CURATING_PHRASES[idx];
      el.classList.remove('phrase-out');
    }, 300);
  }, 2200);
}

export function hideCuratingScreen() {
  if (_phraseInterval) {
    clearInterval(_phraseInterval);
    _phraseInterval = null;
  }
}

function starRating(rating) {
  if (rating == null) return '';
  const full = Math.floor(rating);
  const half = rating - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

/**
 * Render venue cards into #results-list.
 * @param {Array} venues  Normalized venue objects from search.js
 */
export function renderResults(venues) {
  const list = document.getElementById('results-list');
  const resultsArea = document.getElementById('results-area');

  if (!venues.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="32" cy="28" r="20" stroke="rgba(198,168,107,0.4)" stroke-width="2" fill="rgba(198,168,107,0.06)"/>
            <path d="M32 8C22 8 14 16 14 26c0 7 4 12 9 16l3 8h12l3-8c5-4 9-9 9-16 0-10-8-18-18-18z" stroke="rgba(198,168,107,0.5)" stroke-width="1.5" fill="none"/>
            <path d="M28 24c0-1.5 1-2.5 2-2.5.3.3.5.7 1 1.2.5-.5.7-1 1-1.2 1-.5 2 1 2 2.5 0 2-4 5-4 5s-4-3-4-5z" fill="rgba(198,168,107,0.35)"/>
          </svg>
        </div>
        <p class="empty-state-title">No spots in this radius</p>
        <p class="empty-state-copy">Try widening your scatter radius or picking a different area — date-worthy spots are out there.</p>
      </div>`;
    resultsArea.classList.add('is-visible');
    return;
  }

  list.innerHTML = '';
  venues.forEach((v, i) => {
    const card = document.createElement('a');
    card.href = v.mapsUrl || '#';
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.className = 'venue-card';
    card.style.animationDelay = `${i * 40}ms`;

    const topRow = document.createElement('div');
    topRow.className = 'flex items-start justify-between gap-3';

    const nameEl = document.createElement('div');
    nameEl.className = 'venue-name';
    nameEl.textContent = v.name;

    const priceEl = document.createElement('div');
    priceEl.className = 'venue-price';
    priceEl.textContent = v.price || '';

    topRow.appendChild(nameEl);
    if (v.price) topRow.appendChild(priceEl);

    const metaRow = document.createElement('div');
    metaRow.className = 'venue-meta';

    if (v.rating != null) {
      const stars = document.createElement('span');
      stars.className = 'venue-stars';
      stars.textContent = starRating(v.rating);
      const ratingNum = document.createElement('span');
      ratingNum.textContent = v.rating.toFixed(1);
      if (v.ratingCount) ratingNum.textContent += ` (${v.ratingCount.toLocaleString()})`;
      metaRow.appendChild(stars);
      metaRow.appendChild(ratingNum);
    }

    const typeTag = document.createElement('span');
    typeTag.className = 'venue-type-tag';
    typeTag.textContent = v.type;
    metaRow.appendChild(typeTag);

    const addressEl = document.createElement('p');
    addressEl.className = 'venue-address';
    addressEl.textContent = v.address || '';

    card.appendChild(topRow);
    card.appendChild(metaRow);
    if (v.address) card.appendChild(addressEl);

    list.appendChild(card);
  });

  resultsArea.classList.add('is-visible');
}

// Stored so the toggle re-render and future calls can reuse it without re-passing
let _onDismiss = null;

/**
 * Render AI-curated venue cards. Adds a toggle to show all raw results.
 * @param {Array}    curatedVenues  Enriched with `tagline`, `reason`, `vibes` from ai.js
 * @param {Array}    allVenues      Full raw results for toggle
 * @param {Function} [onDismiss]    Called with a venue object when the user hits ✕
 * @param {boolean}  [poolEmpty]    When true, appends an "out of options" notice card
 * @param {string}   [newVenueId]   ID of the just-added replacement card (gets slide-in animation)
 */
export function renderCuratedResults(curatedVenues, allVenues, onDismiss, poolEmpty = false, newVenueId = null) {
  if (onDismiss) _onDismiss = onDismiss;
  const list = document.getElementById('results-list');
  const resultsArea = document.getElementById('results-area');
  const heading = document.getElementById('results-heading');
  const toggleBtn = document.getElementById('view-toggle-btn');

  if (heading) heading.textContent = 'DateLight Bright Ideas';

  if (toggleBtn) {
    toggleBtn.textContent = `See all ${allVenues.length} nearby`;
    toggleBtn.classList.remove('hidden');
    toggleBtn.dataset.mode = 'curated';
    toggleBtn.onclick = () => {
      if (toggleBtn.dataset.mode === 'curated') {
        renderResults(allVenues);
        if (heading) heading.textContent = 'Nearby spots';
        toggleBtn.textContent = '← Back to picks';
        toggleBtn.dataset.mode = 'all';
      } else {
        renderCuratedResults(curatedVenues, allVenues);
      }
    };
  }

  // Copy plan button in heading row
  let copyBtn = document.getElementById('copy-plan-btn');
  if (!copyBtn) {
    copyBtn = document.createElement('button');
    copyBtn.id = 'copy-plan-btn';
    copyBtn.className = 'copy-plan-btn';
    copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" style="width:12px;height:12px"><path d="M5.5 3.5A1.5 1.5 0 0 1 7 2h2.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 1 .44 1.061V12.5A1.5 1.5 0 0 1 12 14H7a1.5 1.5 0 0 1-1.5-1.5v-9Z"/><path d="M4.085 3.5c-.426.14-.718.54-.718.985v8.03a1.5 1.5 0 0 0 1.5 1.485h5.118a1.5 1.5 0 0 0 1.482-1.25H4.5A1.5 1.5 0 0 1 3 11.25V5c0-.627.383-1.165.938-1.39A1.5 1.5 0 0 0 4.085 3.5Z"/></svg> Copy plan`;
    const headingRow = heading?.parentElement;
    if (headingRow) headingRow.appendChild(copyBtn);
  }
  copyBtn.onclick = () => {
    const text = curatedVenues.map((v, i) => {
      const parts = [`${i + 1}. "${v.tagline || v.name}"\n   @${v.name}`];
      if (v.mapsUrl) parts.push(`   ${v.mapsUrl}`);
      return parts.join('\n');
    }).join('\n\n');
    navigator.clipboard.writeText(`DateLight picks:\n\n${text}`).then(() => {
      copyBtn.textContent = '✓ Copied!';
      copyBtn.classList.add('copy-plan-btn--copied');
      setTimeout(() => {
        copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" style="width:12px;height:12px"><path d="M5.5 3.5A1.5 1.5 0 0 1 7 2h2.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 1 .44 1.061V12.5A1.5 1.5 0 0 1 12 14H7a1.5 1.5 0 0 1-1.5-1.5v-9Z"/><path d="M4.085 3.5c-.426.14-.718.54-.718.985v8.03a1.5 1.5 0 0 0 1.5 1.485h5.118a1.5 1.5 0 0 0 1.482-1.25H4.5A1.5 1.5 0 0 1 3 11.25V5c0-.627.383-1.165.938-1.39A1.5 1.5 0 0 0 4.085 3.5Z"/></svg> Copy plan`;
        copyBtn.classList.remove('copy-plan-btn--copied');
      }, 2000);
    });
  };

  const favorites = getFavorites();

  list.innerHTML = '';
  curatedVenues.forEach((v, i) => {
    const card = document.createElement('div');
    card.className = 'venue-card venue-card--curated';
    // New replacement card slides in from right; all others fan in up
    if (v.id === newVenueId) {
      card.style.animation = 'cardSlideInRight 0.4s cubic-bezier(0.22,1,0.36,1) both';
    } else {
      card.style.animationDelay = `${i * 120 + 60}ms`;
    }
    card.dataset.venueId = v.id;

    // Pin hover linkage
    card.addEventListener('mouseenter', () => highlightPin(v.id));
    card.addEventListener('mouseleave', () => unhighlightPin(v.id));

    // Dismiss button
    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'venue-dismiss-btn';
    dismissBtn.title = 'Not feeling this one';
    dismissBtn.innerHTML = '&times;';
    dismissBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!_onDismiss) return;
      card.classList.add('venue-card--dismissing');
      setTimeout(() => {
        card.classList.remove('venue-card--dismissing');
        card.classList.add('venue-card--replacing');
        card.innerHTML = `<p class="venue-replacing-text">Finding a replacement…</p>`;
        _onDismiss(v);
      }, 280);
    });
    card.appendChild(dismissBtn);

    // Tagline
    if (v.tagline) {
      const taglineEl = document.createElement('p');
      taglineEl.className = 'venue-tagline';
      taglineEl.textContent = `"${v.tagline}"`;
      card.appendChild(taglineEl);
    }

    // @VenueName row
    const nameRow = document.createElement('div');
    nameRow.className = 'flex items-center justify-between gap-2';

    const nameEl = document.createElement('div');
    nameEl.className = 'venue-handle';
    nameEl.textContent = `@${v.name}`;

    const aiBadge = document.createElement('span');
    aiBadge.className = v.stretch ? 'ai-badge ai-badge--stretch' : 'ai-badge';
    aiBadge.textContent = v.stretch ? '~ nearby option' : '✦ pick';

    nameRow.appendChild(nameEl);
    nameRow.appendChild(aiBadge);
    card.appendChild(nameRow);

    // Reason sentence
    if (v.reason) {
      const reasonEl = document.createElement('p');
      reasonEl.className = 'venue-reason';
      reasonEl.textContent = v.reason;
      card.appendChild(reasonEl);
    }

    // Vibe pills + price + rating row
    const metaRow = document.createElement('div');
    metaRow.className = 'venue-meta flex-wrap gap-y-1 mt-1';

    if (v.rating != null) {
      const ratingEl = document.createElement('span');
      ratingEl.className = 'venue-stars';
      ratingEl.textContent = starRating(v.rating);
      const ratingNum = document.createElement('span');
      ratingNum.textContent = v.rating.toFixed(1);
      metaRow.appendChild(ratingEl);
      metaRow.appendChild(ratingNum);
    }

    if (v.price) {
      const priceEl = document.createElement('span');
      priceEl.className = 'venue-price';
      priceEl.textContent = v.price;
      metaRow.appendChild(priceEl);
    }

    (v.vibes || []).forEach(vibe => {
      const pill = document.createElement('span');
      pill.className = 'vibe-pill';
      pill.textContent = vibe;
      metaRow.appendChild(pill);
    });

    card.appendChild(metaRow);

    // Footer: Maps link + heart
    const footer = document.createElement('div');
    footer.className = 'venue-footer';

    if (v.mapsUrl) {
      const linkEl = document.createElement('a');
      linkEl.href = v.mapsUrl;
      linkEl.target = '_blank';
      linkEl.rel = 'noopener noreferrer';
      linkEl.className = 'venue-maps-link';
      linkEl.textContent = '↗ Open in Maps';
      footer.appendChild(linkEl);
    } else {
      footer.appendChild(document.createElement('span')); // spacer
    }

    const heartBtn = document.createElement('button');
    const isSaved = favorites.includes(v.id);
    heartBtn.className = `venue-heart-btn${isSaved ? ' venue-heart-btn--saved' : ''}`;
    heartBtn.title = isSaved ? 'Remove from favorites' : 'Save this spot';
    heartBtn.textContent = isSaved ? '♥' : '♡';
    heartBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const saved = toggleFavorite(v.id);
      heartBtn.textContent = saved ? '♥' : '♡';
      heartBtn.classList.toggle('venue-heart-btn--saved', saved);
      heartBtn.title = saved ? 'Remove from favorites' : 'Save this spot';
    });
    footer.appendChild(heartBtn);

    card.appendChild(footer);

    list.appendChild(card);
  });

  // Pool-empty notice: shown when all remaining venues are exhausted
  if (poolEmpty) {
    const notice = document.createElement('div');
    notice.className = 'pool-empty-notice';
    notice.innerHTML = `
      <p class="pool-empty-title">That's all the options nearby.</p>
      <p class="pool-empty-copy">No more spots match your filters in this area. Try widening the scatter radius or adjusting your vibe.</p>`;
    list.appendChild(notice);
  }

  resultsArea.classList.add('is-visible');
}

/**
 * Append the "Extend the evening →" CTA below the curated results list.
 * Replaces itself with a loading state while the AI call runs.
 * @param {Function} onExtend  Called when the user taps the CTA
 */
export function renderExtendCTA(onExtend) {
  const list = document.getElementById('results-list');
  if (!list) return;

  // Remove any stale CTA or addon card from a previous search
  list.querySelector('.extend-cta')?.remove();
  list.querySelector('.addon-card-wrap')?.remove();

  const btn = document.createElement('button');
  btn.className = 'extend-cta';
  btn.innerHTML = `<span class="extend-cta-label">Extend the evening</span><span class="extend-cta-arrow">→</span>`;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.innerHTML = `<span class="extend-cta-label">Finding the perfect next stop…</span>`;
    btn.classList.add('extend-cta--loading');
    try {
      await onExtend();
    } catch {
      btn.innerHTML = `<span class="extend-cta-label">Extend the evening</span><span class="extend-cta-arrow">→</span>`;
      btn.disabled = false;
      btn.classList.remove('extend-cta--loading');
    }
  });

  list.appendChild(btn);
}

/**
 * Replace the extend CTA with the AI-suggested add-on card.
 * @param {Object} addon  Enriched venue with tagline, reason, vibes, thenLabel
 */
export function renderAddonCard(addon) {
  const list = document.getElementById('results-list');
  if (!list) return;

  list.querySelector('.extend-cta')?.remove();

  const wrap = document.createElement('div');
  wrap.className = 'addon-card-wrap';

  const thenLabel = document.createElement('div');
  thenLabel.className = 'addon-then-label';
  thenLabel.textContent = addon.thenLabel || 'Then →';
  wrap.appendChild(thenLabel);

  const card = document.createElement('div');
  card.className = 'venue-card venue-card--curated addon-card';

  if (addon.tagline) {
    const taglineEl = document.createElement('p');
    taglineEl.className = 'venue-tagline';
    taglineEl.textContent = `"${addon.tagline}"`;
    card.appendChild(taglineEl);
  }

  const nameRow = document.createElement('div');
  nameRow.className = 'flex items-center justify-between gap-2';
  const nameEl = document.createElement('div');
  nameEl.className = 'venue-handle';
  nameEl.textContent = `@${addon.name}`;
  const badge = document.createElement('span');
  badge.className = 'ai-badge ai-badge--addon';
  badge.textContent = '✦ add-on';
  nameRow.appendChild(nameEl);
  nameRow.appendChild(badge);
  card.appendChild(nameRow);

  if (addon.reason) {
    const reasonEl = document.createElement('p');
    reasonEl.className = 'venue-reason';
    reasonEl.textContent = addon.reason;
    card.appendChild(reasonEl);
  }

  const metaRow = document.createElement('div');
  metaRow.className = 'venue-meta flex-wrap gap-y-1 mt-1';

  if (addon.rating != null) {
    const ratingEl = document.createElement('span');
    ratingEl.className = 'venue-stars';
    ratingEl.textContent = starRating(addon.rating);
    const ratingNum = document.createElement('span');
    ratingNum.textContent = addon.rating.toFixed(1);
    metaRow.appendChild(ratingEl);
    metaRow.appendChild(ratingNum);
  }

  if (addon.price) {
    const priceEl = document.createElement('span');
    priceEl.className = 'venue-price';
    priceEl.textContent = addon.price;
    metaRow.appendChild(priceEl);
  }

  (addon.vibes || []).forEach(vibe => {
    const pill = document.createElement('span');
    pill.className = 'vibe-pill';
    pill.textContent = vibe;
    metaRow.appendChild(pill);
  });

  card.appendChild(metaRow);

  if (addon.mapsUrl) {
    const footer = document.createElement('div');
    footer.className = 'venue-footer';
    const linkEl = document.createElement('a');
    linkEl.href = addon.mapsUrl;
    linkEl.target = '_blank';
    linkEl.rel = 'noopener noreferrer';
    linkEl.className = 'venue-maps-link';
    linkEl.textContent = '↗ Open in Maps';
    footer.appendChild(linkEl);
    card.appendChild(footer);
  }

  wrap.appendChild(card);
  list.appendChild(wrap);
}

export function showLoading() {
  const list = document.getElementById('results-list');
  const resultsArea = document.getElementById('results-area');
  list.innerHTML = Array.from({ length: 3 }, () => `
    <div class="venue-card venue-skeleton">
      <div class="skeleton-line skeleton-name"></div>
      <div class="skeleton-line skeleton-meta"></div>
      <div class="skeleton-line skeleton-address"></div>
    </div>`).join('');
  resultsArea.classList.add('is-visible');
}

export function hideResults() {
  document.getElementById('results-area').classList.remove('is-visible');
}
