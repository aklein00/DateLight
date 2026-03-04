const GEMINI_PROXY = '/api/gemini';

/**
 * Use Gemini to curate exactly 3 date spots from a venue list.
 * Returns enriched venue objects with `tagline`, `reason`, and `vibes` fields added.
 * @param {Array} venues  Normalized venue objects from search.js
 * @param {Object} filters  { vibe, budget, type }
 * @param {string} apiKey  Gemini API key
 * @param {Object} [datetime]  { day, time }
 * @returns {Promise<Array>}
 */
export async function curateVenues(venues, filters, datetime = {}) {
  const response = await fetch(GEMINI_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(venues, filters, datetime) }] }],
      generationConfig: {
        temperature: 0.9,
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

  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const picks = JSON.parse(cleaned);

  const byId = Object.fromEntries(venues.map(v => [v.id, v]));
  return picks
    .map(pick => {
      const venue = byId[pick.id] ?? venues.find(v =>
        v.name.toLowerCase().includes((pick.name ?? '').toLowerCase()) ||
        (pick.name ?? '').toLowerCase().includes(v.name.toLowerCase())
      );
      if (!venue) return null;
      return {
        ...venue,
        tagline: pick.tagline || '',
        reason: pick.reason || '',
        vibes: pick.vibes || [],
      };
    })
    .filter(Boolean)
    .slice(0, 3);
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

function buildDatetimeContext(datetime = {}) {
  const { day, time } = datetime;
  if (!day && !time) return '';
  const parts = [];
  if (day) parts.push(day === 'tonight' ? 'tonight' : `on ${day}`);
  if (time) parts.push(`in the ${time.replace('-', ' ')}`);
  return `Timing: the date is ${parts.join(' ')}. Prioritize places likely to be open and have good energy at this time. If a pick might have limited hours for this time slot, briefly flag it in the reason.`;
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
