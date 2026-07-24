# Amendoeira Cup 2026 — Golf Trip Tournament App

A mobile-first web app for scoring your 8-player golf trip. No build step —
just static files. Works standalone on one phone out of the box, and can
optionally sync live across every player's phone via Firebase.

## Scoring rounds

On the Enter Scores tab, every round can be scored either:
- **Hole by Hole** — step through all 18 holes (par and stroke index shown
  for each), with a running total per player/pairing/team as you go, or
- **Quick Total** — just type the final gross number directly

Both feed the exact same scoring math, and you can mix modes freely within
the same round (e.g. some players hole-by-hole, others quick total).
Everything autosaves as you go — there's no separate "save your progress"
step, so nothing is lost if the app closes mid-round on the course.

Hole-by-Hole entry also shows a little emoji next to each score as you type
it, plus a quick toast celebration: 🎉 Hole in One · 🌟 Albatross · 🦅 Eagle ·
🐦 Birdie · 😬 Double Bogey · 🙈 further over par · ⛄ Snowman (any score of 8,
regardless of the hole's par). Plain par and single bogey stay quiet.

## Hosting it (GitHub Pages)

1. Push these 10 files to a GitHub repo (root of the repo, or a subfolder —
   just remember the URL will include that subfolder path): `index.html`,
   `style.css`, `app.js`, `logic.js`, `sync.js`, `firebase-config.js`,
   `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`. (`README.md`
   is just documentation — not required for the app to run.)
2. Repo → **Settings → Pages** → Source: **Deploy from a branch** → pick your
   branch and folder → **Save**
3. Wait a minute, then your app is live at `https://yourusername.github.io/your-repo/`
4. Open that URL in **Safari** on iPhone → Share icon → **Add to Home Screen**

## Turning on live sync across phones (optional, ~5 minutes)

Without this step, the app works fully on a single phone — everything is
saved locally. With it, every player's phone sees the same scores update in
real time.

### 1. Create a free Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and sign in with any Google account
2. **Add project** → give it any name (e.g. "amendoeira-cup") → you can skip Google Analytics → **Create project**

### 2. Create a Realtime Database

1. In the left sidebar: **Build → Realtime Database**
2. **Create Database**
3. Pick any region → start in **test mode** for now (we'll lock it down in step 4)

### 3. Get your config and paste it into the app

1. Click the **⚙️ gear icon** (top left, next to "Project Overview") → **Project settings**
2. Scroll to **Your apps** → click the **`</>`** (web) icon → give it a nickname → **Register app**
3. You'll see a code block with a `firebaseConfig` object — copy those values
4. Open `firebase-config.js` in your repo and paste your values in, replacing the placeholders:

   ```js
   window.FIREBASE_CONFIG = {
     apiKey: "AIza...",
     authDomain: "amendoeira-cup.firebaseapp.com",
     databaseURL: "https://amendoeira-cup-default-rtdb.firebaseio.com",
     projectId: "amendoeira-cup",
     storageBucket: "amendoeira-cup.appspot.com",
     messagingSenderId: "...",
     appId: "..."
   };
   ```
5. Commit and push. Once GitHub Pages redeploys, open the app — the badge in
   the header should switch from **"Local only"** to **"Live sync"**.

### 4. Lock down the database rules

Test mode leaves your database open to anyone on the internet for 30 days,
then it locks automatically. Set it explicitly instead:

1. Realtime Database → **Rules** tab
2. Replace the rules with:

   ```json
   {
     "rules": {
       "amendoeiraCup2026": {
         ".read": true,
         ".write": true
       }
     }
   }
   ```
3. **Publish**

**Security note:** this allows anyone who has your app's URL (and therefore
the config values, which are visible in the page source) to read and write
scores — there's no login. That's a reasonable tradeoff for a private trip
among 8 friends, but don't use this setup for anything sensitive. If you
ever want proper access control, that requires adding Firebase
Authentication, which is a bigger change I can help with separately.

### How the sync works

- Every phone keeps a local cache (works offline), and — when connected —
  also syncs through Firebase in real time
- Whoever enters scores first "seeds" the shared data; after that, all
  phones stay in sync
- If a phone loses signal, it keeps working from its local cache and
  catches up automatically once it reconnects
- Export/Import JSON on the Setup tab still works as a manual backup either way

### Still shows "Local only" after setup?

Work through these in order:

1. **Check `firebase-config.js` on GitHub itself** (open the file on github.com,
   not just locally) — confirm every field, especially `databaseURL`, shows
   your real values and not leftover placeholder text like `YOUR-PROJECT`.
   The app specifically checks `databaseURL` for that placeholder text; if
   it's still there, sync won't turn on even if every other field is correct.
2. **Hard-refresh, or on iPhone: Settings → Safari → Clear History and
   Website Data**, then reload. Both the service worker and the browser
   itself cache files, so an old copy can stick around briefly after a push.
3. **Open the site on a desktop browser and check the console** (Safari:
   enable the Develop menu → Show JavaScript Console; Chrome: F12 →
   Console). A single typo in `firebase-config.js` (missing comma/quote)
   silently breaks the whole file — the console will show a red error if so.
   This is much easier to diagnose on desktop than on the phone.
4. **Double check you created a Realtime Database**, not Firestore — Firebase
   Console → Build → Realtime Database. They're separate products with
   similar names, and this app only talks to Realtime Database.
5. **Make sure you have the latest `sw.js`.** An earlier version of this
   service worker could interfere with the Firebase SDK scripts loading
   from their CDN, which silently produces the exact same "Local only"
   badge. If you set this app up before, re-copy `sw.js` from this package
   and push it — then clear site data once more so the new service worker
   takes over.

## What's in the folder

- `index.html` / `style.css` / `app.js` / `logic.js` — the app itself
- `sync.js` / `firebase-config.js` — optional live-sync layer (safe no-ops if unconfigured)
- `manifest.json` / `sw.js` / `icon-192.png` / `icon-512.png` — PWA install support

## Data & reset buttons

**Reset Scores** clears round scores only (players stay). **Reset
Everything** wipes players and scores too. Both actions sync to every
connected phone when live sync is on — so use them deliberately, not mid-trip
by accident.
