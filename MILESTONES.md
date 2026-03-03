# DateLight — Milestones

> **Goal:** Decide on a date location in under 60 seconds.
> **Approach:** Ship each phase as a usable increment. Don't polish until Phase 4.

---

## Phase 1 — Core Prototype (3–5 hrs)

The app works end-to-end with manual controls. You can type a location, set a radius, and see venues on a map.

- [ ] **1.1 Project scaffold**
  - `index.html` shell with Tailwind CDN, Playfair Display + Inter fonts
  - Basic layout: location input → radius slider → search button → results area
  - Wire up `app.js` as the entry point (ES modules)

- [ ] **1.2 Location input**
  - Text input with Google Places Autocomplete (address/neighborhood/city)
  - "Use my location" button via `navigator.geolocation`
  - Store selected coordinates in app state

- [ ] **1.3 Map display**
  - Initialize Mapbox GL JS (or Leaflet) centered on selected location
  - Draw a circle overlay representing the scatter radius
  - Map resizes to fit the radius circle

- [ ] **1.4 Radius slider**
  - Slider (0.25–10 mi) with numeric readout
  - Changing the slider redraws the circle on the map
  - Default to 1.5 mi

- [ ] **1.5 Venue search**
  - Hit Google Places API (Nearby Search) with location + radius
  - Filter to relevant types: `restaurant`, `bar`, `cafe`, `night_club`
  - Return top 20 results sorted by rating

- [ ] **1.6 Display results**
  - Render results as cards below the map: name, rating, price level, type
  - Drop map pins for each result
  - Card click opens Google Maps link in new tab
  - "Randomize" button picks 3–5 random results from the set

**Done when:** You can search any address and get usable date spot suggestions.

---

## Phase 2 — Smart Radius (2–3 hrs)

The app recommends an intelligent radius so you don't have to guess.

- [ ] **2.1 Density sampling**
  - On location select, fire a Places query at 1 km radius
  - Count results to determine venue density

- [ ] **2.2 Auto radius recommendation**
  - Map density → radius:
    - 60+ venues → 0.5 mi
    - 30–60 → 1.5 mi
    - 10–30 → 3 mi
    - <10 → 5–10 mi
  - Set slider to recommended value automatically

- [ ] **2.3 Recommendation UI**
  - Show label: *"Recommended radius for this area: X miles"*
  - User can still override via slider
  - Subtle animation when auto-radius sets

**Done when:** Searching in Manhattan gives a tight radius; searching in suburbs gives a wide one.

---

## Phase 3 — AI Curation (3–4 hrs)

Raw results become curated recommendations with personality.

- [ ] **3.1 AI pipeline**
  - Send top 20 Places results to Google AI Studio (Gemini)
  - Prompt: select best 3–5 for a date, avoid chains, explain why each is good
  - Parse structured response (JSON)

- [ ] **3.2 Filter controls**
  - Vibe selector: romantic · casual · trendy · fancy
  - Budget: $ · $$ · $$$
  - Type: dinner · drinks · coffee · activity
  - Pass selections into AI prompt context

- [ ] **3.3 Curated result cards**
  - Replace raw list with AI-curated cards
  - Each card: name, one-line AI reason, vibe tags, price, links
  - "Why this spot" expandable blurb
  - Keep "Show all results" toggle for raw list

**Done when:** Results feel hand-picked, not like a Yelp dump.

---

## Phase 4 — UX Polish (4–6 hrs)

Make it feel like an app, not a prototype.

- [ ] **4.1 Visual design pass**
  - Apply full color palette (charcoal, warm white, sage, dusty rose, gold)
  - Card styling: rounded corners (16–24px), soft shadows, generous spacing
  - Typography hierarchy: Playfair Display headlines, Inter body

- [ ] **4.2 Loading & empty states**
  - Skeleton cards while searching
  - Empty state illustration + copy when no results
  - Error handling with friendly messages

- [ ] **4.3 Animations & micro-interactions**
  - Map pins animate in (staggered)
  - Cards fade up on load
  - Radius slider glow effect
  - "Surprise me" shuffle animation

- [ ] **4.4 Mobile responsive**
  - Stack layout for <768px
  - Map goes full-width on mobile
  - Touch-friendly slider and cards
  - Bottom sheet for results on small screens

**Done when:** You'd show this to someone without disclaimers.

---

## Phase 5 — PWA & Install (1–2 hrs)

Put it on your home screen.

- [ ] **5.1 PWA setup**
  - `manifest.json` with app name, icons, theme color
  - `service-worker.js` for offline shell caching
  - App icons at required sizes (192px, 512px)

- [ ] **5.2 Deploy**
  - Push to Vercel or Netlify
  - Custom domain (optional)
  - Verify "Add to Home Screen" works on iOS Safari

**Done when:** Tap an icon on your phone, app launches full-screen.

---

## API Keys & Services Needed

| Service | Purpose | Free Tier |
|---------|---------|-----------|
| Google Places API | Venue search + autocomplete | $200/mo credit |
| Google AI Studio (Gemini) | AI curation | Free tier available |
| Mapbox GL JS | Map display | 50k loads/mo free |

> **Alternative (no cost):** Leaflet + OpenStreetMap for maps, Foursquare for venues.

---

## Architecture Notes

```
Browser (Vanilla JS + Tailwind)
  ├── Google Places Autocomplete → location coords
  ├── Google Places Nearby Search → venue list
  ├── Gemini API → curated picks
  └── Mapbox GL JS → map + pins
```

Client-only for personal use. No backend needed until you share it.

---

## Guiding Principles

1. **Each phase is shippable.** Don't start Phase 2 until Phase 1 is usable.
2. **Don't design ahead.** Ugly-but-working beats pretty-but-broken.
3. **API calls are expensive.** Cache aggressively, debounce inputs.
4. **Trust the AI prompt.** Spend time crafting the curation prompt — it's the product differentiator.

---

## V2 Feature: "Extend the Date" — Multi-Stop Date Planning

*After the user confirms their 3 curated picks, offer a single "Extend the date?" prompt. One add-on option appears — an activity, dessert spot, or park nearby — chosen by re-reading the vibe from the active filters and the selected venue.*

*The add-on is intentionally non-food-only: if picks are trendy restaurants, suggest a nearby cocktail bar or rooftop. If the vibe is casual/gritty, suggest a late-night diner or park walk with a nearby deli for sandwiches. The add-on is AI-generated, clearly labeled (e.g. "Then head here →"), and includes the same tagline + Maps link format.*

*Implementation notes:*
- *Trigger: after user locks in their picks (or after the curating animation settles), show a single subtle CTA: "Extend the evening →"*
- *API call: one additional Gemini call with context: the chosen 3 venues + active filters + "suggest one nearby add-on that extends the date naturally"*
- *Return format: same as curated cards (tagline, @name, reason, Maps link) with a "Then →" sequence label*
- *No pool from the existing venue list — this is a new nearby search scoped to a tighter radius around pick #3*

---

## Future — Investigate: Making This Marketable for the Public

*Not planned yet. Research: what would it take to make DateLight marketable for public use? (e.g. serverless proxy for API keys, billing, terms of service, etc.)*
