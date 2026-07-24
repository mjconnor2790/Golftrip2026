# Amendoeira Cup 2026 — Golf Trip Tournament App

A mobile-first web app for scoring your 8-player golf trip. No build step —
just static files. Works standalone on one phone out of the box, and can
optionally sync live across every player's phone via Firebase.

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

## What's in the folder

- `index.html` / `style.css` / `app.js` / `logic.js` — the app itself
- `sync.js` / `firebase-config.js` — optional live-sync layer (safe no-ops if unconfigured)
- `manifest.json` / `sw.js` / `icon-192.png` / `icon-512.png` — PWA install support

## Data & reset buttons

**Reset Scores** clears round scores only (players stay). **Reset
Everything** wipes players and scores too. Both actions sync to every
connected phone when live sync is on — so use them deliberately, not mid-trip
by accident.
