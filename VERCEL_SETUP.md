# Vercel Setup Notes
> Reference for connecting this project (and future ones) to Vercel with protected API keys.

---

## One-time installs (do once on your machine)

```bash
npm install -g vercel
```

Then log in:

```bash
vercel login
```

---

## Connecting a project to Vercel

From the project root folder:

```bash
vercel
```

It will ask a few questions:
- **Set up and deploy?** → Yes
- **Which scope?** → your account
- **Link to existing project?** → No (first time)
- **Project name** → pick a name (e.g. `datelight`)
- **Directory?** → `./` (current folder)
- **Override settings?** → No

This creates a `.vercel/` folder locally that links the project. Don't commit that folder — it's already gitignored by Vercel's default.

---

## Adding your secret API keys in Vercel

### Option A — Vercel Dashboard (easiest)
1. Go to [vercel.com](https://vercel.com) → your project → **Settings → Environment Variables**
2. Add a new variable:
   - **Name:** `GEMINI_API_KEY`
   - **Value:** your real Gemini key
   - **Environments:** Production, Preview, Development (check all three)
3. Redeploy for it to take effect

### Option B — Vercel CLI
```bash
vercel env add GEMINI_API_KEY
```
It will prompt you to paste the value and choose environments.

---

## Running locally with the proxy working

Create a `.env.local` file in the project root (this file is gitignored):

```
GEMINI_API_KEY=your_real_key_here
```

Then run the dev server:

```bash
vercel dev
```

This runs the app at `http://localhost:3000` AND spins up the `api/gemini.js` serverless function so the full flow works locally.

> ⚠️ Do NOT just open `index.html` directly in a browser — the `/api/gemini` proxy won't work without `vercel dev` running.

---

## Deploying

```bash
vercel --prod
```

Or just push to your connected GitHub branch — Vercel auto-deploys on every push if you connected via the dashboard.

---

## Reusing this pattern on future projects

The key files to copy to any new project that needs server-side API keys:

| File | What it does |
|---|---|
| `api/gemini.js` | Serverless proxy — swap Gemini for any API |
| `vercel.json` | Tells Vercel how to route requests |
| `.env.local` | Local secrets (gitignored, never committed) |
| `.cursor/rules/api-key-safety.mdc` | Reminds AI never to expose keys |

**Pattern for any new API:**
1. Create `api/your-service.js` — reads key from `process.env.YOUR_KEY`, proxies the request
2. Add the key to `.env.local` for local dev and to Vercel's Environment Variables for production
3. Call `/api/your-service` from the browser instead of the real API URL

---

## Site architecture — utilityinfielder.com + subdomains

The plan for utilityinfielder.com is a **hub + subdomain** structure:

```
utilityinfielder.com              ← main portfolio/hub site (its own repo)
datelight.utilityinfielder.com    ← this project (this repo)
tool2.utilityinfielder.com        ← future projects (their own repos)
```

Each project is independent. You update a project's repo → Vercel auto-redeploys that subdomain only. Nothing else is affected.

### Step 1 — Build and deploy the main utilityinfielder.com site first
Set that up as its own Vercel project (its own GitHub repo). It's just a landing/portfolio page that links out to your tools.

### Step 2 — Deploy DateLight to Vercel (follow steps above)
When you run `vercel` in this project folder, give it the project name `datelight`.

### Step 3 — Connect the subdomain in Vercel
1. Go to [vercel.com](https://vercel.com) → the **DateLight project** → **Settings → Domains**
2. Add the domain: `datelight.utilityinfielder.com`
3. Vercel will show you a DNS record to add (a `CNAME` record)

### Step 4 — Add the DNS record at your domain registrar
Wherever you bought `utilityinfielder.com` (GoDaddy, Namecheap, Google Domains, etc.):
1. Go to DNS settings for `utilityinfielder.com`
2. Add a new `CNAME` record:
   - **Name/Host:** `datelight`
   - **Value/Target:** `cname.vercel-dns.com` (Vercel shows you the exact value)
3. Save — DNS changes can take a few minutes to a few hours to propagate

### Step 5 — Add API keys for the subdomain project
Follow the "Adding your secret API keys in Vercel" section above.
Update the Google Maps key restriction to include `datelight.utilityinfielder.com/*`.

### Repeat for each new project
Each new tool gets its own subdomain. Steps 2–5 repeat, takes about 10 minutes per project once you've done it once.

### API key reuse across projects
| Key | How many total | What to do per new project |
|---|---|---|
| Gemini | One key | Add same `GEMINI_API_KEY` to that project's Vercel env vars |
| Google Maps | One key | Add new subdomain to the key's HTTP referrer restrictions in Google Cloud |

---

## Checklist before going live

- [ ] `config.js` is in `.gitignore` and never committed
- [ ] `.env.local` is in `.gitignore` and never committed  
- [ ] `GEMINI_API_KEY` is set in Vercel Environment Variables
- [ ] Google Maps key is restricted by HTTP referrer in [Google Cloud Console](https://console.cloud.google.com/google/maps-apis/credentials)
- [ ] Run `git log --all --full-history -- config.js` to confirm config.js was never committed
