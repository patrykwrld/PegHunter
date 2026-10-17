# Peg Hunter

Snap a Hot Wheels car in its pack. Peg Hunter tells you if it is a Treasure Hunt or Super Treasure Hunt, what it is worth in pounds, and keeps it in your album.

## How it works

| Part | Where | What it does |
|---|---|---|
| Web app | `public/` | Plain HTML, CSS and JS. No build step. Installable as an app (PWA) and works offline. |
| Scanner | `api/scan.js` → `lib/scan.js` | One serverless function. Sends the photo to Claude and returns the car type, a price-list match and evidence. The API key stays on the server. |
| Price list | `public/data/prices.json` | The 2026 Supers and Treasure Hunts. Edit this file to update prices; the app and the scanner both read it. |
| Album | `public/js/store.js` | Saved in IndexedDB on the device, with photos. Export and Import backup move it between phones. |

## Run it locally

```bash
npm install
cp .env.example .env      # add your ANTHROPIC_API_KEY
npm run dev               # http://localhost:3000
```

Without a key the site still runs: the scanner shows as off and cars can be added from the Prices tab.

## Deploy (Vercel)

1. Import this repo in Vercel. No framework, no build command; `vercel.json` sets the output folder to `public`.
2. Add the environment variable `ANTHROPIC_API_KEY` (Project → Settings → Environment Variables).
3. Deploy. Phones can then install it from the browser menu ("Add to Home Screen").

Optional variables: `SCAN_MODEL` (default `claude-opus-5-5`; `claude-haiku-5-5` is much cheaper per scan) and `SCAN_RATE_PER_MIN` (default 8 scans per minute per visitor).

### Cost control

The scan endpoint is public. The built-in rate limit runs per server instance, so it slows abuse but does not stop it. Before you share the link widely, set a monthly spend limit on your Anthropic account, and turn on Vercel's firewall rate limiting for `/api/scan`.

## Updating

- **Prices:** edit `public/data/prices.json` and change `saved`. Visitors get the new prices on their next online visit.
- **App code:** after changing files in `public/`, bump `VERSION` in `public/sw.js` so installed apps pick up the new version.
- **Icons:** `npm run icons` redraws the PNG icons (needs Python with Pillow).

## Road to the app

The site is built so the app is a wrapper, not a rewrite:

1. **Now:** installable PWA (home-screen icon, full screen, offline album).
2. **Next:** accounts and cloud sync. The store in `public/js/store.js` already has the `list / add / remove` shape a cloud store (for example Supabase) would implement.
3. **Then:** App Store and Play Store builds with Capacitor, wrapping `public/` and calling the same `/api/scan`.
