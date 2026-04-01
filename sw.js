// Bullseyer Service Worker - Offline Support
const CACHE_NAME = 'bullseyer-v8';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/logo.svg',
  './js/main.js',
  './js/router.js',
  './js/auth.js',
  './js/scorer.js',
  './js/pairing.js',
  './js/supabase.js',
  './js/supabase-mock.js',
  './js/export.js',
  './js/state/store.js',
  './js/services/match.js',
  './js/services/stats.js',
  './js/utils/constants.js',
  './js/utils/players.js',
  './js/utils/checkouts.js',
  './js/ui/auth.js',
  './js/ui/dashboard.js',
  './js/ui/scorer.js',
  './js/ui/players.js',
  './js/ui/stats.js',
  './js/ui/livescorer/index.js',
  './js/ui/livescorer/score-processor.js',
  './js/ui/livescorer/events.js',
  './js/ui/livescorer/keypad.js',
  './js/ui/livescorer/display.js',
  './js/ui/livescorer/game-logic.js',
  './js/ui/livescorer/dialogs.js'
];

// Install: Cache alle statischen Assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching app assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate: Alte Caches aufräumen
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Lösche alten Cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Cache-first für App-Assets, Network-first für API-Calls
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Supabase API-Calls: immer Netzwerk, kein Cache
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: 'Offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Tailwind CDN: Network-first mit Cache-Fallback
  if (url.hostname === 'cdn.tailwindcss.com') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // App-Assets: Cache-first mit Network-Fallback
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        // Nur gültige Responses cachen
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    }).catch(() => {
      // Offline-Fallback für Navigation
      if (event.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
    })
  );
});
