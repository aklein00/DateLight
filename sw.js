const CACHE_NAME = 'datelight-v1';

const APP_SHELL = [
  '/',
  '/index.html',
  '/src/css/styles.css',
  '/src/js/app.js',
  '/src/js/state.js',
  '/src/js/ui.js',
  '/src/js/map.js',
  '/src/js/places.js',
  '/src/js/search.js',
  '/src/js/ai.js',
  '/src/assets/icons/DateLight_logo.png',
  '/src/assets/icons/icon-192.png',
  '/src/assets/icons/icon-512.png',
  '/favicon.png',
  '/manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@300;400;500;600&display=swap',
];

// Precache app shell on install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Remove old caches on activate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Cache-first for app shell; network-only for API calls
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Always go to network for API calls (Places, Gemini proxy, config)
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname === 'places.googleapis.com' ||
    url.hostname === 'maps.googleapis.com'
  ) {
    return;
  }

  // Cache-first for everything else
  event.respondWith(
    caches.match(request).then(
      (cached) => cached || fetch(request).catch(() => caches.match('/index.html'))
    )
  );
});
