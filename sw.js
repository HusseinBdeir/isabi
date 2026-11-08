const CACHE_NAME = 'isabi-systems-pwa-v6.26';
const ASSETS = [
  './',
  './index.html',
  './manifest.json?v=6.26',
  './favicon.ico?v=6.26',
  './favicon-dark.ico?v=6.26',
  './icon.svg?v=6.26',
  './icon-dark.svg?v=6.26',
  './icon-180.png?v=6.26',
  './icon-192.png?v=6.26',
  './icon-512.png?v=6.26',
  './icon-512-maskable.png?v=6.26'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('isabi-systems-pwa-') && k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Delegate /app/ (ISABI Command Center PWA), /api/, and crawler index files to their own service worker / network
  if (
    url.pathname.includes('/app/') ||
    url.pathname.endsWith('/app') ||
    url.pathname.includes('/api/') ||
    url.pathname.endsWith('/robots.txt') ||
    url.pathname.endsWith('/sitemap.xml')
  ) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => {
          if (res && res.status === 200 && (res.headers.get('content-type') || '').includes('text/html')) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(req).then(cached => {
        const net = fetch(req).then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          }
          return res;
        }).catch(() => cached);
        return cached || net;
      })
    );
  }
});
