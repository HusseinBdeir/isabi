const SHELL_CACHE = 'isabi-mfg-v19.6.331';
const SHELL_VER = SHELL_CACHE.replace(/^isabi-mfg-v/, '');
const DATA_CACHE = 'isabi-mfg-data-v3';
const SHELL_DIR = new URL('./', self.location.href).pathname;

// Lightweight UI shell (~500 KB gz). Heavy seed JSONs (1.7 MB gz) and Face ID models (8.2 MB gz)
// live in persistent DATA_CACHE so UI deploys (?v=...) never bust or duplicate-download them.
const SHELL_ASSETS = [
  './',
  './index.html',
  './css/app.css?v=19.6.331',
  './css/geo_dispatch.css?v=19.6.331',
  './css/daily_ops.css?v=19.6.331',
  './css/ask_isabi.css?v=19.6.331',
  './css/fleet_pnl.css?v=19.6.331',
  './css/smart_scan.css?v=19.6.331',
  './css/doc_scanner.css?v=19.6.331',
  './css/ai_edge.css?v=19.6.331',
  './css/telematics.css?v=19.6.331',
  './css/step_up_auth.css?v=19.6.331',
  './css/command_palette.css?v=19.6.331',
  './css/workflow.css?v=19.6.331',
  './js/face.js?v=19.6.331',
  './js/endpoints.js?v=19.6.331',
  './js/seed_manifest.js?v=19.6.331',
  './js/icons.js?v=19.6.331',
  './js/geo_dispatch.js?v=19.6.331',
  './js/forms_engine.js?v=19.6.331',
  './js/pbi_pages.js?v=19.6.331',
  './js/rdl_reports.js?v=19.6.331',
  './js/kiosk_print.js?v=19.6.331',
  './js/table_columns.js?v=19.6.331',
  './js/daily_ops.js?v=19.6.331',
  './js/i18n.js?v=19.6.331',
  './js/ask_isabi.js?v=19.6.331',
  './js/fleet_pnl.js?v=19.6.331',
  './js/doc_scanner.js?v=19.6.331',
  './js/smart_scan.js?v=19.6.331',
  './js/ai_edge.js?v=19.6.331',
  './js/telematics.js?v=19.6.331',
  './js/local_dev_roster.js?v=19.6.331',
  './js/step_up_auth.js?v=19.6.331',
  './js/command_palette.js?v=19.6.331',
  './js/a11y_dialog.js?v=19.6.331',
  './js/approvals.js?v=19.6.331',
  './js/saved_views.js?v=19.6.331',
  './js/app.js?v=19.6.331',
  './manifest.json?v=19.6.331',
  './favicon.ico?v=19.6.331',
  './favicon-dark.ico?v=19.6.331',
  './icon.svg?v=19.6.331',
  './icon-dark.svg?v=19.6.331',
  './icon-180.png?v=19.6.331',
  './icon-192.png?v=19.6.331',
  './icon-512.png?v=19.6.331',
  './icon-512-maskable.png?v=19.6.331'
];

// Face ID engine + weights (about 13.7 MB): warmed for offline use only on a device that uses Face ID
// (the page says so with `warmFace`); whatever Face ID actually fetches is still cached on first use.
const FACE_ASSETS = [
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
  './vendor/models/ssd_mobilenetv1_model.bin'
];
const MAP_ASSETS = [
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/leaflet.js'
];

// Shell navigation: how long to wait for the network while a cached shell is ready to step in, and how long
// to keep answering from cache straight away after the network has just proved dead.
const NAV_WAIT_MS = 2000;
const NET_DOWN_HOLD_MS = 15000;
const NAV_TIMED_OUT = Symbol('nav-timed-out');
let netDownUntil = 0;

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

// A script, style, image or data URL answered with an HTML document is the host's fallback page, not the asset.
// Storing it would pin a broken file under that version until the next release, so only genuine assets are cached.
function isCacheableAsset(rawUrl, res) {
  if (!res || res.status !== 200 || !isSameOriginUrl(res.url)) return false;
  let pathname = '';
  try {
    pathname = new URL(rawUrl, self.location.href).pathname;
  } catch (_) {
    return false;
  }
  if (/(?:\/|\.html?)$/i.test(pathname)) return true;
  return !(res.headers.get('content-type') || '').toLowerCase().includes('text/html');
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
            return cache.match(url).then(async cached => {
              if (cached) return null;
              // The page (or the previous worker) has normally just fetched this exact versioned URL. Take that
              // copy, or revalidate it (a 304 carries no body), instead of downloading the whole shell twice.
              try {
                const prior = await caches.match(new URL(url, self.location.href).href);
                if (prior && isCacheableAsset(url, prior)) {
                  await cache.put(url, prior.clone());
                  return null;
                }
              } catch (_) {}
              return fetchDedup(url, { cache: 'no-cache' })
                .then(res => (isCacheableAsset(url, res) ? cache.put(url, res) : null))
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
      // Earlier versions could store the host's fallback page under an asset URL in the persistent data cache
      // (for example a missing vendor image). Drop those entries; genuine models, seeds and fonts are untouched.
      try {
        const dataCache = await caches.open(DATA_CACHE);
        for (const req of await dataCache.keys()) {
          if (!isSameOriginUrl(req.url)) continue;
          const hit = await dataCache.match(req);
          if (hit && !isCacheableAsset(req.url, hit)) await dataCache.delete(req).catch(() => {});
        }
      } catch (_) {}
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
          if (isCacheableAsset(event.request.url, res)) {
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
          if (isCacheableAsset(event.request.url, res)) {
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
          if (isCacheableAsset(event.request.url, res)) {
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
  // with strict same-origin `text/html` validation and `cleanNavigationResponse`. A cached shell steps in after
  // NAV_WAIT_MS (and at once for NET_DOWN_HOLD_MS after a timeout); with nothing cached the network is awaited.
  if (isShellNav) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const matchCachedShell = async () =>
          (await cache.match('./index.html')) ||
          (await cache.match('./')) ||
          (await caches.match('./index.html')) ||
          (await caches.match('./'));
        const cachedShell = await matchCachedShell();
        let rawRes = null;
        // The network copy is never aborted: when the cached shell answers first, this keeps running.
        const netShell = (async () => {
          const navUrl = new URL(`./?v=${SHELL_VER}`, self.location.href).href;
          rawRes = await fetch(new Request(navUrl, { cache: 'no-cache' }));
          if (!isSameOriginHtmlShell(rawRes)) return null;
          return cleanNavigationResponse(rawRes);
        })();
        netShell.catch(() => {});
        const storeShell = res => Promise.all([
          cache.put('./', res.clone()),
          cache.put('./index.html', res.clone())
        ]).catch(() => {});
        // A shell that arrives after the cached one has already answered was never shown, so the page never
        // fetched that release's assets. Keep it only when it is this worker's own version: a newer release's
        // HTML over this cache's older scripts would be a mixed shell on the next offline start. The newer
        // release arrives through its own Service Worker install instead.
        const finishInBackground = () => event.waitUntil(
          netShell.then(async r => {
            if (!r) return;
            netDownUntil = 0;
            const html = await r.clone().text();
            if (html.includes(`__MFG_SHELL_VER = '${SHELL_VER}'`)) await storeShell(r);
          }).catch(() => {})
        );
        try {
          if (cachedShell && Date.now() < netDownUntil) {
            finishInBackground();
            return cleanNavigationResponse(cachedShell);
          }
          let timer = null;
          const first = cachedShell
            ? await Promise.race([netShell, new Promise(resolve => { timer = setTimeout(() => resolve(NAV_TIMED_OUT), NAV_WAIT_MS); })])
            : await netShell;
          if (timer) clearTimeout(timer);
          if (first === NAV_TIMED_OUT) {
            netDownUntil = Date.now() + NET_DOWN_HOLD_MS;
            finishInBackground();
            return cleanNavigationResponse(cachedShell);
          }
          if (first) {
            netDownUntil = 0;
            event.waitUntil(storeShell(first));
            return first;
          }
          if (cachedShell) return cleanNavigationResponse(cachedShell);
          if (rawRes && isSameOriginUrl(rawRes.url)) return cleanNavigationResponse(rawRes);
          return Response.error();
        } catch (_) {
          if (cachedShell) return cleanNavigationResponse(cachedShell);
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
        if (!isAnyNav && isCacheableAsset(event.request.url, res)) {
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
        MAP_ASSETS.forEach(u => targets.push(u));
        if (data.warmFace) FACE_ASSETS.forEach(u => targets.push(u));
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
              if (isCacheableAsset(absUrl, res)) await cache.put(absUrl, res);
            } catch (_) {}
          }
        }
      } finally {
        warmingInProgress = false;
      }
    })()
  );
});
