const SHELL_CACHE = 'isabi-mfg-v19.6.254';
const SHELL_VER = SHELL_CACHE.replace(/^isabi-mfg-v/, '');
const DATA_CACHE = 'isabi-mfg-data-v3';
const SHELL_DIR = new URL('./', self.location.href).pathname;

// Lightweight UI shell (~500 KB gz). Heavy seed JSONs (1.7 MB gz) and Face ID models (8.2 MB gz)
// live in persistent DATA_CACHE so UI deploys (?v=...) never bust or duplicate-download them.
const SHELL_ASSETS = [
  './',
  './index.html',
  './css/app.css?v=19.6.254',
  './css/geo_dispatch.css?v=19.6.254',
  './css/daily_ops.css?v=19.6.254',
  './css/ask_isabi.css?v=19.6.254',
  './css/fleet_pnl.css?v=19.6.254',
  './css/smart_scan.css?v=19.6.254',
  './css/doc_scanner.css?v=19.6.254',
  './css/ai_edge.css?v=19.6.254',
  './css/telematics.css?v=19.6.254',
  './css/step_up_auth.css?v=19.6.254',
  './css/command_palette.css?v=19.6.254',
  './js/face.js?v=19.6.254',
  './js/endpoints.js?v=19.6.254',
  './js/seed_manifest.js?v=19.6.254',
  './js/icons.js?v=19.6.254',
  './js/geo_dispatch.js?v=19.6.254',
  './js/forms_engine.js?v=19.6.254',
  './js/pbi_pages.js?v=19.6.254',
  './js/rdl_reports.js?v=19.6.254',
  './js/kiosk_print.js?v=19.6.254',
  './js/table_columns.js?v=19.6.254',
  './js/daily_ops.js?v=19.6.254',
  './js/i18n.js?v=19.6.254',
  './js/ask_isabi.js?v=19.6.254',
  './js/fleet_pnl.js?v=19.6.254',
  './js/doc_scanner.js?v=19.6.254',
  './js/smart_scan.js?v=19.6.254',
  './js/ai_edge.js?v=19.6.254',
  './js/telematics.js?v=19.6.254',
  './js/local_dev_roster.js?v=19.6.254',
  './js/step_up_auth.js?v=19.6.254',
  './js/command_palette.js?v=19.6.254',
  './js/app.js?v=19.6.254',
  './manifest.json?v=19.6.254',
  './favicon.ico?v=19.6.254',
  './favicon-dark.ico?v=19.6.254',
  './icon.svg?v=19.6.254',
  './icon-dark.svg?v=19.6.254',
  './icon-180.png?v=19.6.254',
  './icon-192.png?v=19.6.254',
  './icon-512.png?v=19.6.254',
  './icon-512-maskable.png?v=19.6.254'
];

const VENDOR_ASSETS = [
  './vendor/face-api.js?v=1',
  './vendor/models/tiny_face_detector_model-weights_manifest.json',
  './vendor/models/tiny_face_detector_model.bin',
  './vendor/models/face_landmark_68_tiny_model-weights_manifest.json',
  './vendor/models/face_landmark_68_tiny_model.bin',
  './vendor/models/face_recognition_model-weights_manifest.json',
  './vendor/models/face_recognition_model.bin',
  './vendor/models/face_landmark_68_model-weights_manifest.json',
  './vendor/models/face_landmark_68_model.bin',
  './vendor/models/ssd_mobilenetv1_model-weights_manifest.json',
  './vendor/models/ssd_mobilenetv1_model.bin',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/leaflet.js'
];

// Exact byte-length integrity map for Face ID neural weights: prevents truncated/aborted
// streams from ever being stored in or served from DATA_CACHE.
const MODEL_BIN_SIZES = {
  'face_recognition_model.bin': 6444032,
  'ssd_mobilenetv1_model.bin': 5616957,
  'face_landmark_68_model.bin': 356840,
  'tiny_face_detector_model.bin': 193321,
  'face_landmark_68_tiny_model.bin': 77224
};

function expectedModelBinBytes(rawUrl) {
  try {
    const pathname = new URL(rawUrl, self.location.href).pathname;
    const base = pathname.split('/').pop() || '';
    return MODEL_BIN_SIZES[base] || 0;
  } catch (_) {
    return 0;
  }
}

async function validateCachedVendorResponse(rawUrl, res) {
  if (!res || res.status !== 200) return null;
  const expected = expectedModelBinBytes(rawUrl);
  if (!expected) return res;
  try {
    const buf = await res.clone().arrayBuffer();
    if (!buf || buf.byteLength !== expected) return null;
  } catch (_) {
    return null;
  }
  return res;
}

function buildResponseFromBufferedEntry(entry) {
  const r = new Response(entry.buf ? entry.buf.slice(0) : null, {
    status: entry.status,
    statusText: entry.statusText,
    headers: new Headers(entry.headers)
  });
  try {
    Object.defineProperty(r, 'url', { value: entry.url });
    Object.defineProperty(r, 'redirected', { value: Boolean(entry.redirected) });
  } catch (_) {}
  return r;
}

// Deduplicate concurrent network fetches between install/warmers and active page requests
// without leaving an unconsumed ReadableStream tee branch on 6.44 MB binary responses.
const inflight = new Map();
function fetchDedup(reqOrUrl, init) {
  const key = typeof reqOrUrl === 'string' ? new URL(reqOrUrl, self.location.href).href : reqOrUrl.url;
  const existing = inflight.get(key);
  if (existing) return existing.then(buildResponseFromBufferedEntry);
  const p = (async () => {
    const res = await fetch(init ? new Request(key, init) : reqOrUrl);
    if (!res) throw new Error('Empty fetch response');
    const nullBody = res.status === 204 || res.status === 205 || res.status === 304 || res.status < 200 || res.status > 599;
    const buf = nullBody ? null : await res.arrayBuffer();
    const expected = expectedModelBinBytes(key);
    if (expected && res.status === 200 && (!buf || buf.byteLength !== expected)) {
      throw new Error(`Truncated Face ID model binary (${key}): got ${buf ? buf.byteLength : 0}, expected ${expected}`);
    }
    return {
      buf,
      status: res.status,
      statusText: res.statusText,
      headers: Array.from(res.headers.entries()),
      url: res.url || key,
      redirected: Boolean(res.redirected)
    };
  })().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, p);
  return p.then(buildResponseFromBufferedEntry);
}

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

// Strip same-origin URL redirect history (`res.redirected === true` from Cloudflare Pages `308 /index.html -> /`)
// while rejecting cross-origin captive-portal redirects and guarding status `0`/`204`/`205`/`304`.
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
    caches.open(SHELL_CACHE).then(cache =>
      Promise.all(
        SHELL_ASSETS.map(url => {
          if (url.includes('?v=')) {
            return cache.match(url).then(cached => {
              if (cached) return null;
              return fetchDedup(url, { cache: 'reload' })
                .then(res => (res && res.status === 200 && isSameOriginUrl(res.url) ? cache.put(url, res) : null))
                .catch(() => null);
            });
          }
          const fetchUrl = (url === './' || url === './index.html') ? `./?v=${SHELL_VER}` : url;
          return fetchDedup(fetchUrl, { cache: 'reload' })
            .then(async res => (isSameOriginHtmlShell(res) ? cache.put(url, await cleanNavigationResponse(res)) : null))
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
      const legacyCaches = keys.filter(k => k.startsWith('isabi-mfg-') && k !== SHELL_CACHE && k !== DATA_CACHE);
      for (const oldKey of legacyCaches) {
        await caches.delete(oldKey).catch(() => {});
      }
      await self.clients.claim();
      try {
        const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const c of allClients) {
          c.postMessage({ type: 'SW_UPDATED', ver: SHELL_CACHE });
        }
      } catch (_) {}
    })()
  );
});

function isPersistentDataUrl(url) {
  return url.pathname.includes('/vendor/') || /\/seed_(?:demo_)?(core|records|industries)\.json$/.test(url.pathname);
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') return;
  const url = new URL(event.request.url);

  // Cache Google Fonts stylesheets & WOFF2 files in persistent DATA_CACHE (instant warm font load + offline support)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(DATA_CACHE).then(async cache => {
        const cached = await cache.match(event.request);
        const netPromise = fetch(event.request).then(res => {
          if (res && res.status === 200) cache.put(event.request, res.clone()).catch(() => {});
          return res;
        }).catch(() => cached || Response.error());
        return cached || netPromise;
      })
    );
    return;
  }

  // Never cache cross-origin APIs (Dataverse relay), reset.html / Cloudflare `/reset`, or local SQLite REST endpoints
  if (url.origin !== self.location.origin) return;
  if (/\/reset(?:\.html)?$/i.test(url.pathname) || url.pathname.includes('/api/')) return;

  const isAnyNav = event.request.mode === 'navigate';
  const isShellNav = isAnyNav && (url.pathname === SHELL_DIR || url.pathname === SHELL_DIR + 'index.html');

  // Persistent DATA_CACHE: content-addressed seed_*.json?d=<hash> + immutable /vendor/ Face ID weights
  if (!isAnyNav && isPersistentDataUrl(url)) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async cache => {
        const forceBypass = url.searchParams.has('cb');
        if (!forceBypass) {
          const exact = await cache.match(event.request);
          if (exact) {
            const validExact = await validateCachedVendorResponse(url.href, exact);
            if (validExact) return validExact;
            await cache.delete(event.request).catch(() => {});
          }
          if (url.pathname.includes('/vendor/')) {
            const ignoreQ = await cache.match(event.request, { ignoreSearch: true });
            if (ignoreQ) {
              const validIgnoreQ = await validateCachedVendorResponse(url.href, ignoreQ);
              if (validIgnoreQ) return validIgnoreQ;
              await cache.delete(event.request, { ignoreSearch: true }).catch(() => {});
            }
          }
        } else {
          await cache.delete(event.request, { ignoreSearch: true }).catch(() => {});
        }
        try {
          const res = await fetchDedup(forceBypass ? new Request(event.request.url, { cache: 'no-store' }) : event.request);
          if (res && res.status === 200 && isSameOriginUrl(res.url)) {
            const canonicalKey = (url.pathname.includes('/vendor/') && forceBypass)
              ? new URL(url.pathname, self.location.origin).href
              : event.request;
            cache.put(canonicalKey, res.clone()).catch(() => {});
          }
          return res;
        } catch (_) {
          const fallback = await cache.match(event.request, { ignoreSearch: true });
          const validFallback = fallback ? await validateCachedVendorResponse(url.href, fallback) : null;
          return validFallback || Response.error();
        }
      })
    );
    return;
  }

  // Explicit cache-busting hot-reload (?cb=...): network-first bypassing edge cache
  if (!isAnyNav && url.searchParams.has('cb')) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async cache => {
        try {
          const res = await fetch(new Request(event.request.url, { cache: 'no-store' }));
          if (res && res.status === 200 && isSameOriginUrl(res.url)) {
            if (url.pathname.endsWith('/js/i18n.js')) {
              cache.put(`./js/i18n.js?v=${SHELL_VER}`, res.clone()).catch(() => {});
            }
            return res;
          }
        } catch (_) {}
        return (await cache.match(event.request, { ignoreSearch: true })) || fetch(event.request).catch(() => Response.error());
      })
    );
    return;
  }

  // Versioned UI shell assets (?v=...): exact cache match first, network on version bump, ignoreSearch ONLY offline
  if (!isAnyNav && url.searchParams.has('v')) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async cache => {
        const exact = await cache.match(event.request);
        if (exact) return exact;
        try {
          const res = await fetchDedup(event.request);
          if (res && res.status === 200 && isSameOriginUrl(res.url)) {
            cache.put(event.request, res.clone()).catch(() => {});
          }
          return res;
        } catch (_) {
          return (await cache.match(event.request, { ignoreSearch: true })) || Response.error();
        }
      })
    );
    return;
  }

  // Shell HTML navigation (`/app/` or `/app/index.html`): network-first against canonical `./?v=...`
  // with strict same-origin `text/html` validation, `cleanNavigationResponse`, and 3s offline/captive-portal fallback
  if (isShellNav) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
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
            const navUrl = new URL(`./?v=${SHELL_VER}`, self.location.href).href;
            rawRes = await fetch(new Request(navUrl, { cache: 'no-cache' }), { signal: ctrl.signal });
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

  // Unversioned assets & direct non-shell navigations (e.g. viewing `/app/icon-512.png` or `/app/manifest.json` directly)
  event.respondWith(
    (event.request.cache === 'reload' ? fetch(event.request) : fetchDedup(event.request.url, { cache: 'no-cache' }))
      .then(async res => {
        if (!isAnyNav && res && res.status === 200 && isSameOriginUrl(res.url)) {
          const clone = res.clone();
          caches.open(SHELL_CACHE).then(c => c.put(event.request, clone).catch(() => {})).catch(() => {});
        }
        return isAnyNav ? cleanNavigationResponse(res) : res;
      })
      .catch(async () => {
        const hit = await caches.match(event.request);
        if (hit) return isAnyNav ? cleanNavigationResponse(hit) : hit;
        return Response.error();
      })
  );
});

let warmingInProgress = false;
self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'PURGE_SEED_CACHE') {
    event.waitUntil(
      caches.open(DATA_CACHE).then(async cache => {
        const keys = await cache.keys();
        for (const req of keys) {
          if (/\/api\/seed\/|\/seed_(core|records|industries)\.json\b/.test(req.url)) {
            await cache.delete(req).catch(() => {});
          }
        }
      }).catch(() => {})
    );
    return;
  }
  if (data.type !== 'WARM_DATA_CACHE' || warmingInProgress) return;
  warmingInProgress = true;
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(DATA_CACHE);
        const manifest = data.manifest || {};
        const targets = [];
        VENDOR_ASSETS.forEach(u => targets.push(u));
        let activeCoreHref = '';
        let activeRecHref = '';
        let activeIndHref = '';
        if (data.isDemo) {
          if (manifest.demoCore) { targets.push(manifest.demoCore); activeCoreHref = new URL(manifest.demoCore, self.location.href).href; }
          if (manifest.demoRecords) { targets.push(manifest.demoRecords); activeRecHref = new URL(manifest.demoRecords, self.location.href).href; }
          if (manifest.demoIndustries) { targets.push(manifest.demoIndustries); activeIndHref = new URL(manifest.demoIndustries, self.location.href).href; }
        } else if (data.isServerHeld) {
          if (data.authed === true) {
            if (manifest.apiCore) { targets.push(manifest.apiCore); activeCoreHref = new URL(manifest.apiCore, self.location.href).href; }
            if (manifest.apiRecords) { targets.push(manifest.apiRecords); activeRecHref = new URL(manifest.apiRecords, self.location.href).href; }
            if (manifest.apiIndustries) { targets.push(manifest.apiIndustries); activeIndHref = new URL(manifest.apiIndustries, self.location.href).href; }
          }
        } else {
          if (manifest.core) { targets.push(manifest.core); activeCoreHref = new URL(manifest.core, self.location.href).href; }
          if (manifest.records) { targets.push(manifest.records); activeRecHref = new URL(manifest.records, self.location.href).href; }
          if (manifest.industries) { targets.push(manifest.industries); activeIndHref = new URL(manifest.industries, self.location.href).href; }
        }

        // Prune superseded seed_*.json?d=<old> or /api/seed/*?d=<old> entries so DATA_CACHE stays lean across snapshots
        const existingKeys = await cache.keys();
        for (const req of existingKeys) {
          if ((/\/seed_(?:demo_)?core\.json\b|\/api\/seed\/core\b/.test(req.url)) && activeCoreHref && req.url !== activeCoreHref) {
            await cache.delete(req);
          } else if ((/\/seed_(?:demo_)?records\.json\b|\/api\/seed\/records\b/.test(req.url)) && activeRecHref && req.url !== activeRecHref) {
            await cache.delete(req);
          } else if ((/\/seed_(?:demo_)?industries\.json\b|\/api\/seed\/industries\b/.test(req.url)) && activeIndHref && req.url !== activeIndHref) {
            await cache.delete(req);
          }
        }

        // Sequentially warm any missing offline assets at idle so active browsing never contends for bandwidth
        for (const relUrl of targets) {
          const absUrl = new URL(relUrl, self.location.href).href;
          const isVendor = absUrl.includes('/vendor/');
          const hit = await cache.match(absUrl, isVendor ? { ignoreSearch: true } : undefined);
          const validHit = hit && isVendor ? await validateCachedVendorResponse(absUrl, hit) : hit;
          if (!validHit) {
            if (hit) await cache.delete(absUrl, isVendor ? { ignoreSearch: true } : undefined).catch(() => {});
            try {
              const res = await fetchDedup(absUrl, absUrl.includes('/api/seed/') ? { credentials: 'same-origin' } : undefined);
              if (res && res.status === 200 && isSameOriginUrl(res.url)) await cache.put(absUrl, res);
            } catch (_) {}
          }
        }
      } finally {
        warmingInProgress = false;
      }
    })()
  );
});
