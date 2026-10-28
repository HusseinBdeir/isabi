const SHELL_CACHE = 'isabi-mfg-v19.5.8';
const DATA_CACHE = 'isabi-mfg-data-v1';

// Lightweight UI shell (~500 KB gz). Heavy seed JSONs (1.7 MB gz) and Face ID models (8.2 MB gz)
// live in persistent DATA_CACHE so UI deploys (?v=...) never bust or duplicate-download them.
const SHELL_ASSETS = [
  './',
  './index.html',
  './css/app.css?v=19.5.8',
  './js/face.js?v=19.5.8',
  './js/endpoints.js?v=19.5.8',
  './js/seed_manifest.js?v=19.5.8',
  './js/icons.js?v=19.5.8',
  './js/forms_engine.js?v=19.5.8',
  './js/pbi_pages.js?v=19.5.8',
  './js/rdl_reports.js?v=19.5.8',
  './js/kiosk_print.js?v=19.5.8',
  './js/table_columns.js?v=19.5.8',
  './js/app.js?v=19.5.8',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

const VENDOR_ASSETS = [
  './vendor/face-api.js?v=1',
  './vendor/models/tiny_face_detector_model-weights_manifest.json',
  './vendor/models/tiny_face_detector_model.bin',
  './vendor/models/face_landmark_68_model-weights_manifest.json',
  './vendor/models/face_landmark_68_model.bin',
  './vendor/models/face_landmark_68_tiny_model-weights_manifest.json',
  './vendor/models/face_landmark_68_tiny_model.bin',
  './vendor/models/face_recognition_model-weights_manifest.json',
  './vendor/models/face_recognition_model.bin',
  './vendor/models/ssd_mobilenetv1_model-weights_manifest.json',
  './vendor/models/ssd_mobilenetv1_model.bin'
];

// Deduplicate concurrent network fetches between install/warmers and active page requests
const inflight = new Map();
function fetchDedup(reqOrUrl, init) {
  const key = typeof reqOrUrl === 'string' ? new URL(reqOrUrl, self.location.href).href : reqOrUrl.url;
  const existing = inflight.get(key);
  if (existing) return existing.then(res => res.clone());
  const p = fetch(init ? new Request(key, init) : reqOrUrl).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, p);
  return p.then(res => res.clone());
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache =>
      Promise.all(
        SHELL_ASSETS.map(url => {
          if (url.includes('?v=')) {
            return caches.match(url).then(cached => {
              if (cached) return cache.put(url, cached.clone());
              return fetchDedup(url, { cache: 'no-cache' })
                .then(res => (res && res.status === 200 ? cache.put(url, res) : null))
                .catch(() => null);
            });
          }
          return fetchDedup(url, { cache: 'reload' })
            .then(res => (res && res.status === 200 ? cache.put(url, res) : null))
            .catch(() => null);
        })
      )
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const legacyShells = keys.filter(k => k.startsWith('isabi-mfg-') && k !== SHELL_CACHE && k !== DATA_CACHE);
      if (legacyShells.length) {
        const dataCache = await caches.open(DATA_CACHE);
        for (const oldKey of legacyShells) {
          try {
            const oldCache = await caches.open(oldKey);
            const reqs = await oldCache.keys();
            for (const req of reqs) {
              if (req.url.includes('/vendor/')) {
                const already = await dataCache.match(req, { ignoreSearch: true });
                if (!already) {
                  const hit = await oldCache.match(req);
                  if (hit) await dataCache.put(req.url.includes('face-api.js') ? './vendor/face-api.js?v=1' : req, hit.clone());
                }
              }
            }
          } catch (_) {}
          await caches.delete(oldKey);
        }
      }
      await self.clients.claim();
    })()
  );
});

function isPersistentDataUrl(url) {
  return url.pathname.includes('/vendor/') || /\/seed_(core|records)\.json$/.test(url.pathname);
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Cache Google Fonts stylesheets & WOFF2 files in persistent DATA_CACHE (instant warm font load + offline support)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(DATA_CACHE).then(async cache => {
        const cached = await cache.match(event.request);
        const netPromise = fetch(event.request).then(res => {
          if (res && res.status === 200) cache.put(event.request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || netPromise;
      })
    );
    return;
  }

  // Never cache cross-origin APIs (Dataverse relay), reset.html, or local SQLite REST endpoints
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/reset.html') || url.pathname.includes('/api/')) return;

  const isNav = event.request.mode === 'navigate';

  // Persistent DATA_CACHE: content-addressed seed_*.json?d=<hash> + immutable /vendor/ Face ID weights
  if (!isNav && isPersistentDataUrl(url)) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async cache => {
        const exact = await cache.match(event.request);
        if (exact) return exact;
        if (url.pathname.includes('/vendor/')) {
          const ignoreQ = await cache.match(event.request, { ignoreSearch: true });
          if (ignoreQ) return ignoreQ;
        }
        const res = await fetchDedup(event.request);
        if (res && res.status === 200) {
          cache.put(event.request, res.clone());
        }
        return res;
      })
    );
    return;
  }

  // Versioned UI shell assets (?v=...): cache-first in SHELL_CACHE
  if (!isNav && url.searchParams.has('v')) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async cache => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const res = await fetchDedup(event.request);
        if (res && res.status === 200) {
          cache.put(event.request, res.clone());
        }
        return res;
      })
    );
    return;
  }

  // HTML navigation & unversioned icons/manifest: network-first with 3s timeout fallback to cached shell
  if (isNav) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 3000);
          const res = await fetch(new Request(event.request, { cache: 'no-cache' }), { signal: ctrl.signal });
          clearTimeout(timer);
          if (res && res.status === 200) {
            cache.put('./index.html', res.clone());
          }
          return res;
        } catch (_) {
          return (await cache.match(event.request)) || (await cache.match('./index.html')) || (await caches.match('./index.html'));
        }
      })()
    );
    return;
  }

  event.respondWith(
    fetchDedup(event.request)
      .then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(SHELL_CACHE).then(c => c.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

let warmingInProgress = false;
self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type !== 'WARM_DATA_CACHE' || warmingInProgress) return;
  warmingInProgress = true;
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(DATA_CACHE);
        const manifest = data.manifest || {};
        const targets = [];
        if (manifest.core) targets.push(manifest.core);
        if (manifest.records) targets.push(manifest.records);
        VENDOR_ASSETS.forEach(u => targets.push(u));

        // Prune superseded seed_*.json?d=<old> entries so DATA_CACHE stays lean across future snapshots
        const existingKeys = await cache.keys();
        const activeCoreHref = manifest.core ? new URL(manifest.core, self.location.href).href : '';
        const activeRecHref = manifest.records ? new URL(manifest.records, self.location.href).href : '';
        for (const req of existingKeys) {
          if (/\/seed_core\.json\b/.test(req.url) && activeCoreHref && req.url !== activeCoreHref) {
            await cache.delete(req);
          } else if (/\/seed_records\.json\b/.test(req.url) && activeRecHref && req.url !== activeRecHref) {
            await cache.delete(req);
          }
        }

        // Sequentially warm any missing offline assets at idle so active browsing never contends for bandwidth
        for (const relUrl of targets) {
          const absUrl = new URL(relUrl, self.location.href).href;
          const isVendor = absUrl.includes('/vendor/');
          const hit = await cache.match(absUrl, isVendor ? { ignoreSearch: true } : undefined);
          if (!hit) {
            try {
              const res = await fetchDedup(absUrl);
              if (res && res.status === 200) await cache.put(absUrl, res);
            } catch (_) {}
          }
        }
      } finally {
        warmingInProgress = false;
      }
    })()
  );
});
