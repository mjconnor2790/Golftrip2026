// Bump this version string on every deploy that changes app files - it
// forces old caches (and any stale copy stuck on a phone) to be dropped.
const CACHE_NAME = 'amendoeira-cup-v3';

const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './logic.js',
  './sync.js',
  './firebase-config.js',
  './app.js',
  './manifest.json'
];

const STATIC_ASSETS = [
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL.concat(STATIC_ASSETS)))
      .catch((err) => console.warn('SW precache failed', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isAppShellRequest(url) {
  return APP_SHELL.some((path) => url.endsWith(path.replace('./', '/')) || url.endsWith(path));
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Never intercept cross-origin requests (e.g. the Firebase SDK loaded
  // from gstatic.com). Let the browser fetch those natively - proxying
  // cross-origin script requests through a service worker is a common
  // source of silent script-load failures, and there's nothing useful for
  // us to cache there anyway.
  if (new URL(event.request.url).origin !== self.location.origin) return;

  const url = event.request.url;
  const isNavigation = event.request.mode === 'navigate';

  // Network-first for the app shell (HTML/CSS/JS) and page navigations:
  // always try to get the freshest code when online, and only fall back to
  // whatever's cached if the network request fails (offline). This is what
  // prevents a broken/stale first load from getting stuck on a device.
  if (isNavigation || isAppShellRequest(url)) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for static assets that rarely change (icons etc).
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => cached);
    })
  );
});
