const GEMINI_PROXY = '/api/gemini';

/**
 * Use Gemini to curate mini date plans from a mixed venue/activity list.
 * Returns plan objects with two stops, a transition, and vibe metadata.
 * @param {Array} venues  Normalized venue objects from search.js
 * @param {Object} filters  { vibe, budget, type }
 * @param {Object} [datetime]  { day, time }
 * @param {Object} [options]  { count, avoidIds }
 * @returns {Promise<Array>}
 */
export async function curateDatePlans(venues, filters, datetime = {}, options = {}) {
  const response = await fetch(GEMINI_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildDatePlanPrompt(venues, filters, datetime, options) }] }],
      generationConfig: {
        temperature: 0.98,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini API error ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');

  const picks = parseJsonResponse(text);

  const byId = Object.fromEntries(venues.map(v => [v.id, v]));
  return picks
    .map((pick, planIndex) => mapPlan(pick, byId, venues, planIndex))
    .filter(Boolean)
    .slice(0, options.count || 3);
}

function parseJsonResponse(text) {
  return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
}

function findVenueForStop(stop, byId, venues) {
  if (!stop) return null;
  return byId[stop.id] ?? venues.find(v =>
    v.name.toLowerCase().includes((stop.name ?? '').toLowerCase()) ||
    (stop.name ?? '').toLowerCase().includes(v.name.toLowerCase())
  );
}

function mapStop(stop, byId, venues, planIndex, stopIndex) {
  const venue = findVenueForStop(stop, byId, venues);
  if (!venue && !stop?.name) return null;

  if (!venue) {
    return {
      id: `virtual-${planIndex}-${stopIndex}`,
      name: stop.name,
      type: stop.type || stop.role || 'Activity',
      category: 'activity',
      role: stop.role || 'activity',
      label: stop.label || `Stop ${stopIndex + 1}`,
      note: stop.note || '',
      isVirtual: true,
    };
  }

  return {
    ...venue,
    role: stop.role || venue.category,
    label: stop.label || `Stop ${stopIndex + 1}`,
    note: stop.note || '',
  };
}

function mapPlan(pick, byId, venues, planIndex) {
  const stops = (pick.stops || [])
    .map((stop, stopIndex) => mapStop(stop, byId, venues, planIndex, stopIndex))
    .filter(Boolean)
    .slice(0, 2);

  if (!stops.length) return null;

  return {
    id: pick.id || stops.map(stop => stop.id).join('__'),
    title: pick.title || 'A Little Date Plan',
    summary: pick.summary || '',
    transition: pick.transition || '',
    vibes: pick.vibes || [],
    stretch: pick.stretch === true,
    stops,
  };
}

/**
 * Ask Gemini to pick exactly 1 replacement venue from the remaining pool.
 * @param {Array} remaining  Venues not currently in the curated list
 * @param {Object} filters   { vibe, budget, type }
 * @param {string} apiKey
 * @param {Object} [datetime]  { day, time }
 * @returns {Promise<Object|null>} One enriched venue object, or null on failure
 */
export async function replaceVenue(remaining, filters, datetime = {}) {
  if (!remaining.length) return null;

  const simplified = remaining.map(v => ({
    id: v.id, name: v.name, type: v.type,
    rating: v.rating, ratingCount: v.ratingCount,
    price: v.price || '?', address: v.address,
  }));

  const vibeCtx = filters.vibe ? `Vibe preference: ${filters.vibe}.` : '';
  const budgetCtx = filters.budget ? `Budget preference: ${filters.budget}.` : '';
  const typeCtx = filters.type ? `Type preference: ${filters.type}.` : '';
  const datetimeCtx = buildDatetimeContext(datetime);
  const prefs = [vibeCtx, budgetCtx, typeCtx, datetimeCtx].filter(Boolean).join(' ');

  const prompt = `You are DateLight. The user dismissed one of their date spot picks and wants a fresh one.
${prefs}

From the list below, pick EXACTLY 1 replacement date spot. Rules:
- NEVER pick a chain (Starbucks, Applebee's, etc.)
- Pick something with date energy and local character
- Write a 4–7 word tagline (Instagram caption style, specific to this place)
- One punchy sentence for the reason

Return EXACTLY 1 item as a JSON array with one object:
[{"id":"exact_id","name":"exact name","tagline":"Short punchy tagline","reason":"One sentence.","vibes":["tag1","tag2"]}]

Allowed vibes: romantic, intimate, lively, trendy, cozy, casual, fancy, quirky, outdoor, speakeasy, neighborhood gem, hidden gem, gritty, dive bar

Venues:
${JSON.stringify(simplified)}`;

  const response = await fetch(GEMINI_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.95, responseMimeType: 'application/json' },
    }),
  });

  if (!response.ok) throw new Error(`Gemini replace error ${response.status}`);

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;

  const picks = JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
  const pick = Array.isArray(picks) ? picks[0] : picks;
  if (!pick) return null;

  const byId = Object.fromEntries(remaining.map(v => [v.id, v]));
  const venue = byId[pick.id] ?? remaining.find(v =>
    v.name.toLowerCase().includes((pick.name ?? '').toLowerCase()) ||
    (pick.name ?? '').toLowerCase().includes(v.name.toLowerCase())
  );
  if (!venue) return null;

  return { ...venue, tagline: pick.tagline || '', reason: pick.reason || '', vibes: pick.vibes || [] };
}

/**
 * Lenient replacement: pick 1 venue that stays as close as possible to the user's
 * preferences even if the pool is thin. Returns the venue with `stretch: true` if
 * it deviates meaningfully from the current filters.
 * @param {Array} remaining
 * @param {Object} filters  { vibe, budget, type }
 * @param {string} apiKey
 * @param {Object} [datetime]  { day, time }
 * @returns {Promise<Object|null>}
 */
export async function replaceVenueLenient(remaining, filters, datetime = {}) {
  if (!remaining.length) return null;

  const simplified = remaining.map(v => ({
    id: v.id, name: v.name, type: v.type,
    rating: v.rating, ratingCount: v.ratingCount,
    price: v.price || '?', address: v.address,
  }));

  const userPrefs = [
    filters.vibe   && `vibe: ${filters.vibe}`,
    filters.budget && `budget: ${filters.budget}`,
    filters.type   && `type: ${filters.type}`,
  ].filter(Boolean).join(', ') || 'no specific preferences';

  const datetimeCtx = buildDatetimeContext(datetime);

  const prompt = `You are DateLight. The user's preferred options are exhausted. Pick the BEST available venue from the list below.

User's original preferences: ${userPrefs}.
${datetimeCtx}

Rules:
- NEVER pick a chain (Starbucks, Applebee's, etc.)
- Pick the option closest in spirit to the user's preferences
- DO NOT make a wild departure — if they wanted casual cheap coffee, don't pick a $$$ romantic dinner. Instead find the least jarring option (e.g. trendy $$ bar)
- Set "stretch": true if this pick meaningfully differs from their preferences
- In the reason, be honest: explain what's different and why it's still worth it
- Write a 4–7 word tagline specific to the place

Return EXACTLY 1 item as a JSON array:
[{"id":"exact_id","name":"exact name","tagline":"Short tagline","reason":"Honest sentence about why this still works.","vibes":["tag1"],"stretch":true}]

Allowed vibes: romantic, intimate, lively, trendy, cozy, casual, fancy, quirky, outdoor, speakeasy, neighborhood gem, hidden gem, gritty, dive bar

Venues:
${JSON.stringify(simplified)}`;

  const response = await fetch(GEMINI_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.85, responseMimeType: 'application/json' },
    }),
  });

  if (!response.ok) throw new Error(`Gemini lenient replace error ${response.status}`);

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;

  const picks = JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
  const pick = Array.isArray(picks) ? picks[0] : picks;
  if (!pick) return null;

  const byId = Object.fromEntries(remaining.map(v => [v.id, v]));
  const venue = byId[pick.id] ?? remaining.find(v =>
    v.name.toLowerCase().includes((pick.name ?? '').toLowerCase()) ||
    (pick.name ?? '').toLowerCase().includes(v.name.toLowerCase())
  );
  if (!venue) return null;

  return {
    ...venue,
    tagline: pick.tagline || '',
    reason: pick.reason || '',
    vibes: pick.vibes || [],
    stretch: pick.stretch === true,
  };
}

/**
 * Ask Gemini to suggest one add-on stop that extends the date after the 3 curated picks.
 * @param {Array}  curatedVenues  The 3 curated venues already shown to the user
 * @param {Array}  addonPool      Nearby venues fetched by searchAddons()
 * @param {Object} filters        { vibe, budget, type }
 * @param {Object} [datetime]     { day, time }
 * @returns {Promise<Object|null>} One enriched venue object, or null on failure
 */
export async function suggestAddon(curatedVenues, addonPool, filters, datetime = {}) {
  if (!addonPool.length) return null;

  const simplified = addonPool.map(v => ({
    id: v.id, name: v.name, type: v.type,
    rating: v.rating, ratingCount: v.ratingCount,
    price: v.price || '?', address: v.address,
  }));

  const context = curatedVenues.map((v, i) => `${i + 1}. ${v.name} (${v.type}${v.price ? `, ${v.price}` : ''})`).join('\n');
  const datetimeCtx = buildDatetimeContext(datetime);
  const vibeCtx = filters.vibe ? `Vibe: ${filters.vibe}.` : '';
  const budgetCtx = filters.budget ? `Budget: ${filters.budget}.` : '';

  const prompt = `You are DateLight. The user has 3 curated date spots:
${context}

They want one more stop to extend the evening. ${vibeCtx} ${budgetCtx}
${datetimeCtx}

From the list below, pick EXACTLY 1 add-on stop that naturally extends this date — a dessert spot, activity, cocktail bar, park walk, gallery, etc. Choose something that contrasts or complements the main picks.

Rules:
- NEVER pick a chain (Starbucks, Applebee's, etc.)
- Pick something with a different energy or category than the 3 main picks
- Write a 4–7 word tagline (specific to this place)
- One punchy sentence for the reason — explain why this is the perfect next stop
- Set "thenLabel" to "Then →"

Return EXACTLY 1 item as a JSON array:
[{"id":"exact_id","name":"exact name","tagline":"Short tagline","reason":"Why this is the perfect next stop.","vibes":["tag1","tag2"],"thenLabel":"Then →"}]

Allowed vibes: romantic, intimate, lively, trendy, cozy, casual, fancy, quirky, outdoor, speakeasy, neighborhood gem, hidden gem, gritty, dive bar, dessert, activity

Venues:
${JSON.stringify(simplified)}`;

  const response = await fetch(GEMINI_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.95, responseMimeType: 'application/json' },
    }),
  });

  if (!response.ok) throw new Error(`Gemini addon error ${response.status}`);

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;

  const picks = JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
  const pick = Array.isArray(picks) ? picks[0] : picks;
  if (!pick) return null;

  const byId = Object.fromEntries(addonPool.map(v => [v.id, v]));
  const venue = byId[pick.id] ?? addonPool.find(v =>
    v.name.toLowerCase().includes((pick.name ?? '').toLowerCase()) ||
    (pick.name ?? '').toLowerCase().includes(v.name.toLowerCase())
  );
  if (!venue) return null;

  return {
    ...venue,
    tagline: pick.tagline || '',
    reason: pick.reason || '',
    vibes: pick.vibes || [],
    thenLabel: pick.thenLabel || 'Then →',
  };
}

function buildDatetimeContext(datetime = {}) {
  const { day, time } = datetime;
  if (!day && !time) return '';
  const parts = [];
  if (day) parts.push(day === 'tonight' ? 'tonight' : `on ${day}`);
  if (time) parts.push(`in the ${time.replace('-', ' ')}`);
  return `Timing: the date is ${parts.join(' ')}. Prioritize places likely to be open and have good energy at this time. If a pick might have limited hours for this time slot, briefly flag it in the reason.`;
}

const STYLE_DEFINITIONS = {
  romantic: 'Soft Romance: intimate, pretty, warm lighting, scenic parks/gardens/water when available, and a gentle pace.',
  casual: 'Easygoing: low-pressure, walkable, unfussy, coffee/drinks/snacks, no-reservation energy.',
  trendy: 'Buzzy: stylish, lively, current, good people-watching, and a little scene-y without feeling generic.',
  fancy: 'Dress Up: polished, elevated, reservation-worthy, beautiful rooms, cocktails, dinner, or a special-feeling activity.',
  gritty: 'Divey: local, unpretentious, weird charm, personality over polish, no-frills bars or neighborhood institutions.',
  mix: 'Surprise Me: make the three plans deliberately different from each other in pace, cost, and energy.',
};

const TYPE_DEFINITIONS = {
  dinner: 'Anchor at least one stop around dinner or substantial food.',
  drinks: 'Anchor at least one stop around drinks, cocktails, wine, beer, or a bar.',
  coffee: 'Anchor at least one stop around coffee, tea, bakery, dessert, or an afternoon-friendly hang.',
  activity: 'Lead with the activity, walk, gallery, museum, park, movie, bowling, or other do-something energy.',
};

function buildDatePlanPrompt(venues, filters, datetime = {}, options = {}) {
  const count = options.count || 3;
  const avoidIds = Array.from(options.avoidIds || []);
  const datetimeCtx = buildDatetimeContext(datetime);
  const styleCtx = filters.vibe ? STYLE_DEFINITIONS[filters.vibe] || `Style: ${filters.vibe}.` : '';
  const budgetCtx = filters.budget ? `Budget preference: ${filters.budget}.` : '';
  const typeCtx = filters.type ? TYPE_DEFINITIONS[filters.type] || `Type preference: ${filters.type}.` : '';

  const simplified = venues.map(v => ({
    id: v.id,
    name: v.name,
    type: v.type,
    category: v.category || 'venue',
    rating: v.rating,
    ratingCount: v.ratingCount,
    price: v.price || '?',
    distanceMiles: v.distanceMiles,
    address: v.address,
  }));

  const avoidCtx = avoidIds.length
    ? `Avoid reusing these venue ids if at all possible because the user has already seen them: ${avoidIds.join(', ')}. If the pool is too thin, reuse at most one and set "stretch": true.`
    : '';

  const mixCtx = filters.vibe === 'mix'
    ? 'Because this is Surprise Me mode, make each plan feel meaningfully different: one low-key, one buzzy, one elevated or romantic.'
    : 'Make the plans distinct from each other. Do not repeat the same formula three times.';

  return `You are DateLight, an opinionated local dating concierge. The user wants small date itineraries, not a restaurant directory.
${styleCtx}
${budgetCtx}
${typeCtx}
${datetimeCtx}
${avoidCtx}

From the candidates below, create EXACTLY ${count} mini date ${count === 1 ? 'plan' : 'plans'}.

Planning rules:
- Each plan should have exactly 2 stops.
- At least one stop should be an activity or movement moment when the candidate pool supports it: park walk, gallery, museum, movie, bowling, dessert stroll, scenic wander, bookstore browse, or neighborhood walk.
- Pair the activity with a food or drink stop when possible.
- If no concrete activity venue fits, create a simple virtual activity stop with id:null, like "Walk the neighborhood" or "Take a golden-hour stroll nearby".
- Prefer walkable pairings and explain the connection in "transition".
- NEVER pick chains (Starbucks, Applebee's, Chili's, McDonald's, etc.).
- ${mixCtx}
- Write like a confident friend planning the date. Specific beats generic.

Return EXACTLY this JSON shape and no markdown:
[{
  "id": "short_plan_id",
  "title": "Rose Garden + Margaritas",
  "summary": "Start with a slow lap through the roses, then settle into margaritas nearby.",
  "transition": "Walk a few blocks after the garden so the date has a natural second act.",
  "vibes": ["soft romance", "walkable"],
  "stretch": false,
  "stops": [
    {"id":"exact_id_or_null","name":"exact venue name or virtual activity","role":"activity","label":"Start","note":"What to do here in one sentence."},
    {"id":"exact_id_or_null","name":"exact venue name","role":"food_drink","label":"Then","note":"Why this is the right follow-up in one sentence."}
  ]
}]

Allowed stop roles: activity, food_drink.
Allowed vibes: soft romance, easygoing, buzzy, dress up, divey, surprise, intimate, lively, cozy, outdoor, walkable, hidden gem, dessert, cocktails, coffee, dinner.

Candidates:
${JSON.stringify(simplified)}`;
}

function buildPrompt(venues, filters, datetime = {}) {
  const isMix    = filters.vibe === 'mix';
  const isGritty = filters.vibe === 'gritty';

  const datetimeCtx = buildDatetimeContext(datetime);

  const prefs = [
    !isMix && filters.vibe   && `vibe: ${filters.vibe}`,
    filters.budget && `budget: ${filters.budget}`,
    filters.type   && `type: ${filters.type}`,
  ].filter(Boolean).join(', ');

  const simplified = venues.map(v => ({
    id: v.id,
    name: v.name,
    type: v.type,
    rating: v.rating,
    ratingCount: v.ratingCount,
    price: v.price || '?',
    address: v.address,
  }));

  const pickInstruction = isMix
    ? `SPECIAL — Mix mode: Pick EXACTLY 3 spots with deliberately different energies:
  1. One casual/neighborhood gem (low-key, unpretentious)
  2. One trendy/buzzy spot (current, lively)
  3. One elevated/romantic pick (intimate, special-feeling)
Label the vibes to reflect each energy tier.`
    : isGritty
    ? `Pick EXACTLY 3 spots with genuine grit and local character — dive bars, no-frills spots, places with personality over polish. Avoid anything that feels upscale or trendy. Price should be $ or $$. Real locals go here.`
    : `Pick EXACTLY 3 date spots with variety of mood. Never pick the same vibe twice if avoidable.`;

  return `You are DateLight — an opinionated local dating concierge. You don't hedge. You pick.
${prefs ? `User is looking for: ${prefs}.` : ''}
${datetimeCtx}

From the venues below, ${pickInstruction}

Universal rules:
- NEVER pick chains (Starbucks, Applebee's, Chili's, McDonald's, etc.)
- Prioritize: atmosphere, local character, date energy
- Higher ratings + more reviews = reliable, but a hidden gem beats a mediocre chain
- Write a 4–7 word tagline that sounds like an Instagram caption. Specific to the place, not generic.
- Write one punchy sentence for the reason — tell them WHY this place, not just what it is

Return EXACTLY 3 items as a JSON array (no markdown, no extra text):
[{
  "id": "exact_id_from_list",
  "name": "exact venue name",
  "tagline": "Moody cocktails above the fog",
  "reason": "One specific sentence about why this works for a date.",
  "vibes": ["intimate", "cozy"]
}]

Allowed vibes: romantic, intimate, lively, trendy, cozy, casual, fancy, quirky, outdoor, speakeasy, neighborhood gem, hidden gem, gritty, dive bar

Venues:
${JSON.stringify(simplified)}`;
}
