const CACHE_NAME = 'isabi-systems-pwa-v6.31';
const CACHE_VER = CACHE_NAME.replace(/^isabi-systems-pwa-v/, '');
const SHELL_DIR = new URL('./', self.location.href).pathname;
const STATIC_ASSETS = [
  './manifest.json?v=6.31',
  './favicon.ico?v=6.31',
  './favicon-dark.ico?v=6.31',
  './icon.svg?v=6.31',
  './icon-dark.svg?v=6.31',
  './icon-180.png?v=6.31',
  './icon-192.png?v=6.31',
  './icon-512.png?v=6.31',
  './icon-512-maskable.png?v=6.31'
];

function isSameOriginUrl(rawUrl) {
  if (!rawUrl) return true;
  try {
    return new URL(rawUrl, self.location.href).origin === self.location.origin;
  } catch (_) {
    return false;
  }
}

function isSameOriginHtmlShell(res) {
  if (!res || res.status !== 200) return false;
  if (!isSameOriginUrl(res.url)) return false;
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  return ct.includes('text/html');
}

async function cleanNavigationResponse(res) {
  if (!res) return Response.error();
  if (!isSameOriginUrl(res.url)) {
    throw new Error('Cross-origin navigation redirect rejected');
  }
  if (!res.redirected) return res;
  if (res.status < 200 || res.status > 599) return res;
  const nullBody = res.status === 204 || res.status === 205 || res.status === 304;
  const body = nullBody ? null : await res.arrayBuffer();
  return new Response(body, {
    status: res.status,
    statusText: res.statusText,
    headers: new Headers(res.headers)
  });
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await Promise.all(
        STATIC_ASSETS.map(u =>
          fetch(new Request(u, { cache: 'reload' }))
            .then(res => (res && res.status === 200 && isSameOriginUrl(res.url) ? cache.put(u, res) : null))
            .catch(() => null)
        )
      );
      try {
        const rawHtml = await fetch(new Request(`./?v=${CACHE_VER}`, { cache: 'reload' }));
        if (isSameOriginHtmlShell(rawHtml)) {
          const cleanHtml = await cleanNavigationResponse(rawHtml);
          await cache.put('./', cleanHtml.clone());
          await cache.put('./index.html', cleanHtml.clone());
        }
      } catch (_) {}
    })
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
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  const url = new URL(req.url);

  // Delegate /app/ (ISABI Command Center PWA), /reset, /api/, and crawler index files to their own service worker / network
  if (
    url.pathname.includes('/app/') ||
    url.pathname.endsWith('/app') ||
    /\/reset(?:\.html)?$/i.test(url.pathname) ||
    url.pathname.includes('/api/') ||
    url.pathname.endsWith('/robots.txt') ||
    url.pathname.endsWith('/sitemap.xml')
  ) return;

  const isAnyNav = req.mode === 'navigate';
  const isShellNav = isAnyNav && (url.pathname === SHELL_DIR || url.pathname === SHELL_DIR + 'index.html');

  if (isShellNav) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const matchCachedShell = async () =>
          (await cache.match('./index.html')) ||
          (await cache.match('./')) ||
          (await caches.match('./index.html')) ||
          (await caches.match('./'));
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 3000);
          let rawRes;
          try {
            const navUrl = new URL(`./?v=${CACHE_VER}`, self.location.href).href;
            rawRes = await fetch(new Request(navUrl, { cache: 'no-store' }), { signal: ctrl.signal });
          } finally {
            clearTimeout(timer);
          }
          if (isSameOriginHtmlShell(rawRes)) {
            const cleanRes = await cleanNavigationResponse(rawRes);
            cache.put('./', cleanRes.clone()).catch(() => {});
            cache.put('./index.html', cleanRes.clone()).catch(() => {});
            return cleanRes;
          }
          const cachedFallback = await matchCachedShell();
          if (cachedFallback) return cleanNavigationResponse(cachedFallback);
          if (rawRes && isSameOriginUrl(rawRes.url)) return cleanNavigationResponse(rawRes);
          return Response.error();
        } catch (_) {
          const fallback = await matchCachedShell();
          if (fallback) return cleanNavigationResponse(fallback);
          return Response.error();
        }
      })()
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(new Request(req.url, { cache: 'no-cache' }))
        .then(async res => {
          if (!isAnyNav && res && res.status === 200 && isSameOriginUrl(res.url)) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, copy).catch(() => {})).catch(() => {});
          }
          return isAnyNav ? cleanNavigationResponse(res) : res;
        })
        .catch(async () => {
          const hit = await caches.match(req);
          if (hit) return isAnyNav ? cleanNavigationResponse(hit) : hit;
          return Response.error();
        })
    );
    return;
  }

  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(req).then(cached => {
        const net = fetch(req).then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, copy).catch(() => {})).catch(() => {});
          }
          return res;
        }).catch(() => cached || Response.error());
        return cached || net;
      })
    );
  }
});
