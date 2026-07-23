# Amendoeira Cup 2026 — Golf Trip Tournament App

A self-contained, mobile-first web app for scoring your 8-player golf trip.
No backend, no build step — just static files.

## How to use it

**Easiest: host it somewhere with HTTPS** (needed for "Add to Home Screen" / PWA
install on iPhone). Good free options:

- **GitHub Pages**: create a repo, drop these files in, enable Pages.
- **Netlify / Vercel drop**: drag the folder onto netlify.com/drop (no account needed for a quick share link).

Once hosted, open the link in Safari on iPhone, tap the Share icon, then
**Add to Home Screen**. It'll launch full-screen like a native app and keep
working offline after the first load.

**Quickest local test:** from this folder, run a tiny local server, e.g.
`python3 -m http.server 8080`, then open `http://localhost:8080` — the PWA
install step needs a real HTTPS host, but everything else works locally too.

Don't just double-click `index.html` (a `file://` URL) — the service worker
won't register there. Use a local server or a real host.

## What's in the folder

- `index.html` / `style.css` / `app.js` / `logic.js` — the app itself
- `manifest.json` / `sw.js` / `icon-192.png` / `icon-512.png` — PWA install support

## Data

Everything is saved in the phone's browser storage (localStorage), scoped
to whichever device/URL you use it from. Use **Export JSON** on the Setup
tab to back up the tournament, and **Import JSON** to restore it or move it
to another device. **Reset Scores** clears round scores only; **Reset
Everything** wipes players and scores.
