# DateLight — New Machine Setup

Follow these steps any time you clone this repo onto a new computer.

---

## 1. Prerequisites

- [ ] **Node.js installed** — needed to run the local dev server
  - Check: `node -v` in terminal
  - Install from: https://nodejs.org (LTS version)

---

## 2. API Keys

The `config.js` file is not in the repo (it's gitignored). You must create it manually.

- [ ] **Copy the template**
  ```bash
  cp config.example.js config.js
  ```

- [ ] **Add your Google Maps API key**
  - Get it from: https://console.cloud.google.com/google/maps-apis/credentials
  - Make sure these two APIs are enabled for the key:
    - **Maps JavaScript API**
    - **Places API (New)**
  - Add `http://localhost:8080/*` to the key's HTTP referrer restrictions

- [ ] **Add your Gemini API key**
  - Get it from: https://aistudio.google.com/apikey
  - Paste into `config.js` as `window.GEMINI_API_KEY`

- [ ] **Verify `config.js` looks like this:**
  ```js
  window.GOOGLE_MAPS_API_KEY = 'AIza...';
  window.GEMINI_API_KEY = 'AIza...';
  ```

---

## 3. Run the Local Server

- [ ] **Start the dev server on port 8080:**
  ```bash
  npx serve . -p 8080
  ```
- [ ] **Open in browser:** http://localhost:8080

---

## 4. Sanity Checks

- [ ] Logo appears in the header
- [ ] Typing a location shows autocomplete suggestions
- [ ] Clicking "Find date spots" shows the lightbulb curating animation
- [ ] 3 curated picks appear with taglines and @ handles
- [ ] Map pins are numbered and the map is visible

---

## Notes

- Never commit `config.js` — it's in `.gitignore` for a reason
- If Google auto-revokes your Gemini key, generate a new one at https://aistudio.google.com/apikey
- See `MILESTONES.md` for the full feature roadmap
