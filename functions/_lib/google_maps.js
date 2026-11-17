/**
 * ISABI Systems — Server-Side Google Maps Platform Proxy
 * (2D Map Tiles, Places Search New, Routes API v2 + DEM Elevation Profile, & Monthly Free-Tier Quota Sentinel)
 * Keeps GOOGLE_MAPS_API_KEY strictly in encrypted Cloudflare Edge Secrets.
 * - Tiles are cached in Cloudflare's Edge Cache (caches.default) under an internal key
 *   after verifying an authenticated session (60s isolate cache) or same-origin demo header/param.
 * - Tile misses, Places searches, Routes calls, and Elevation lookups are tracked per UTC month (YYYY-MM)
 *   in D1 edge_kv_store so client debounce tightens at 50%/80% and auto-falls back to OSM/local at >=95%
 *   before leaving Google's $0 free tier.
 */

import {
  checkD1RateLimit,
  checkSlidingRateLimit,
  getSessionWritePerms,
  hashClientIp,
  isOwnerOrFullGroupSession,
  isSameOriginBrowserRequest,
  jsonResponse,
  verifyActiveEdgeSession
} from './security.js';

const GOOGLE_CREATE_SESSION_URL = 'https://tile.googleapis.com/v1/createSession';
const GOOGLE_TILE_URL_PREFIX = 'https://tile.googleapis.com/v1/2dtiles';
const GOOGLE_PLACES_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText';
const GOOGLE_ROUTES_COMPUTE_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const GOOGLE_ELEVATION_URL = 'https://maps.googleapis.com/maps/api/elevation/json';
const OSRM_PUBLIC_ROUTE_BASE = 'https://router.project-osrm.org/route/v1/driving';
const OPEN_METEO_ELEV_URL = 'https://api.open-meteo.com/v1/elevation';

export const MAPS_GCP_PROJECT_ID = 'gen-lang-client-0240664641';
export const MAPS_GCP_BILLING_ACCOUNT = '01D3FC-354800-7D0DCD';
export const MAPS_FREE_CAPS = Object.freeze({
  tiles_2d: 100000,
  places_text: 10000,
  routes_compute: 10000,
  elevation: 5000
});
const DEFAULT_QUOTA_THRESHOLDS = Object.freeze({
  warnPct: 50,
  tightPct: 80,
  fallbackPct: 95
});

const ALLOWED_LANGS = new Set(['en', 'ar', 'fr']);
// Tiles are cached 30 days (TILE_CACHE_MAX_AGE_SEC) under `isabi-tile-cache.internal/v1/...`:
// whenever a session setting below changes (mapType, layerTypes, region, imageFormat),
// bump that `v1` segment or old tiles keep being served for up to 30 days.
const STYLE_CONFIG = Object.freeze({
  roadmap: Object.freeze({ mapType: 'roadmap', layerTypes: null, imageFormat: 'png', fallbackFormat: 'image/png' }),
  satellite: Object.freeze({ mapType: 'satellite', layerTypes: null, imageFormat: 'jpeg', fallbackFormat: 'image/jpeg' }),
  hybrid: Object.freeze({ mapType: 'satellite', layerTypes: ['layerRoadmap'], imageFormat: 'jpeg', fallbackFormat: 'image/jpeg' })
});

const MAX_TILE_ZOOM = 20;
// Tiles (satellite imagery since the app shows satellite only) are kept 30 days in the
// Edge cache and the browser: a cache hit costs no Google tile request.
const TILE_CACHE_MAX_AGE_SEC = 30 * 24 * 60 * 60;
const SESSION_CACHE_TTL_MS = 60 * 1000;
const SESSION_CACHE_MAX = 2000;
const TILE_SESSION_REFRESH_BUFFER_SEC = 300;
const PLACES_CACHE_TTL_MS = 5 * 60 * 1000;
const PLACES_CACHE_MAX = 400;
const ROUTE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ROUTE_CACHE_MAX = 300;
const USAGE_MEM_TTL_MS = 15 * 1000;

const ACTIVE_SESSION_CACHE = new Map();
const GOOGLE_TILE_SESSIONS = new Map();
const INFLIGHT_TILE_SESSION = new Map();
const PLACES_QUERY_CACHE = new Map();
const ROUTE_QUERY_CACHE = new Map();
let MONTHLY_USAGE_MEM = { month: '', expiresAt: 0, snapshot: null };

function resolveGoogleMapsKey(env) {
  return String((env && (env.GOOGLE_MAPS_API_KEY || env.ISABI_GMAPS_KEY)) || '').trim();
}

function parseTestMocks(env) {
  const raw = env && env.ISABI_TEST_GMAPS_MOCKS;
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch (_) {
    return null;
  }
}

export function invalidateMapsUsageMemCache() {
  MONTHLY_USAGE_MEM = { month: '', expiresAt: 0, snapshot: null };
}

export function resetGoogleMapsEdgeCachesForTest() {
  ACTIVE_SESSION_CACHE.clear();
  GOOGLE_TILE_SESSIONS.clear();
  INFLIGHT_TILE_SESSION.clear();
  PLACES_QUERY_CACHE.clear();
  ROUTE_QUERY_CACHE.clear();
  MONTHLY_USAGE_MEM = { month: '', expiresAt: 0, snapshot: null };
}

function sanitizeLang(raw) {
  const s = String(raw || 'en').trim().toLowerCase();
  return ALLOWED_LANGS.has(s) ? s : 'en';
}

function sanitizeStyle(raw) {
  const s = String(raw || 'roadmap').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(STYLE_CONFIG, s) ? s : '';
}

function currentUsageMonthUtc() {
  return new Date().toISOString().slice(0, 7);
}

function clampThresholdPct(val, min, max, fallback) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export const MAPS_QUOTA_RULE_IDS = ['G_MAPS_QUOTA', 'ind_hld_06', 'ind_hsp_06', 'ind_trd_06', 'ind_re_06', 'ind_ins_06'];

function resolveThresholdConfig(rulePayload) {
  let warnPct = DEFAULT_QUOTA_THRESHOLDS.warnPct;
  let tightPct = DEFAULT_QUOTA_THRESHOLDS.tightPct;
  let fallbackPct = DEFAULT_QUOTA_THRESHOLDS.fallbackPct;
  if (rulePayload && typeof rulePayload === 'object') {
    const p = (rulePayload.params && typeof rulePayload.params === 'object') ? rulePayload.params : rulePayload;
    warnPct = clampThresholdPct(p.warn_pct, 20, 79, warnPct);
    tightPct = clampThresholdPct(p.tight_pct, warnPct + 1, 94, Math.max(warnPct + 1, tightPct));
    fallbackPct = clampThresholdPct(p.fallback_pct, Math.max(81, tightPct + 1), 99, Math.max(81, tightPct + 1, fallbackPct));
  }
  return { warnPct, tightPct, fallbackPct };
}

function computeQuotaBand(pct, thresholds) {
  if (pct >= thresholds.fallbackPct) return 'fallback_95';
  if (pct >= thresholds.tightPct) return 'tight_80';
  if (pct >= thresholds.warnPct) return 'warn_50';
  return 'ok';
}

function bandRank(band) {
  if (band === 'fallback_95') return 3;
  if (band === 'tight_80') return 2;
  if (band === 'warn_50') return 1;
  return 0;
}

function buildUsageSnapshot(month, counts, thresholds, gcpBudgetCfg, routesApiStatus) {
  const t = thresholds || DEFAULT_QUOTA_THRESHOLDS;
  const metrics = {};
  let maxBand = 'ok';
  for (const [k, cap] of Object.entries(MAPS_FREE_CAPS)) {
    const used = Math.max(0, Math.floor(Number(counts[k] || 0)));
    const pct = cap > 0 ? Math.round((used / cap) * 1000) / 10 : 0;
    const band = computeQuotaBand(pct, t);
    if (bandRank(band) > bandRank(maxBand)) maxBand = band;
    metrics[k] = {
      used,
      cap,
      remaining: Math.max(0, cap - used),
      pct,
      band,
      warnAt: Math.round(cap * t.warnPct / 100),
      tightAt: Math.round(cap * t.tightPct / 100),
      fallbackAt: Math.round(cap * t.fallbackPct / 100)
    };
  }
  const tilesBand = metrics.tiles_2d.band;
  const placesBand = metrics.places_text.band;
  const placesDebounceMs = placesBand === 'fallback_95'
    ? 0
    : (placesBand === 'tight_80' ? 1100 : (placesBand === 'warn_50' ? 600 : 260));
  const placesMinChars = placesBand === 'tight_80' ? 4 : (placesBand === 'warn_50' ? 3 : 2);
  const routesStatus = String((routesApiStatus && routesApiStatus.status) || 'unknown');
  const bCfg = gcpBudgetCfg && typeof gcpBudgetCfg === 'object' ? gcpBudgetCfg : {};
  return {
    month,
    thresholds: t,
    overallBand: maxBand,
    metrics,
    clientPolicy: {
      tileProvider: tilesBand === 'fallback_95' ? 'osm' : 'google',
      placesRemoteEnabled: placesBand !== 'fallback_95',
      placesDebounceMs,
      placesMinChars,
      routesRemoteEnabled: metrics.routes_compute.band !== 'fallback_95'
    },
    routesApi: {
      status: routesStatus,
      checkedAt: String((routesApiStatus && routesApiStatus.updated_at) || ''),
      consoleUrl: `https://console.cloud.google.com/apis/library/routes.googleapis.com?project=${MAPS_GCP_PROJECT_ID}`
    },
    gcpBilling: {
      projectId: MAPS_GCP_PROJECT_ID,
      billingAccountId: MAPS_GCP_BILLING_ACCOUNT,
      thresholdsPct: [t.warnPct, t.tightPct, t.fallbackPct],
      budgetConfirmed: Boolean(bCfg.confirmed),
      budgetConfirmedAt: String(bCfg.updated_at || ''),
      budgetConfirmedBy: String(bCfg.updated_by || ''),
      consoleBudgetUrl: `https://console.cloud.google.com/billing/${MAPS_GCP_BILLING_ACCOUNT}/budgets?project=${MAPS_GCP_PROJECT_ID}`
    }
  };
}

async function readKvJsonAndRev(db, docKey) {
  if (!db) return null;
  try {
    const row = await db.prepare('SELECT payload_json, rev, updated_at FROM edge_kv_store WHERE doc_key = ?1 LIMIT 1').bind(docKey).first();
    if (!row) return null;
    let parsed = null;
    try { parsed = JSON.parse(String(row.payload_json || '{}')); } catch (_) { parsed = null; }
    return { rev: Number(row.rev || 0), updated_at: String(row.updated_at || ''), payload: parsed };
  } catch (_) {
    return null;
  }
}

async function readMapsUsageSnapshot(env, opts = {}) {
  const month = currentUsageMonthUtc();
  const force = Boolean(opts && opts.force);
  const testMock = parseTestMocks(env);
  if (testMock && testMock.usage && typeof testMock.usage === 'object') {
    const u = testMock.usage;
    const t = resolveThresholdConfig(u.thresholds || null);
    return buildUsageSnapshot(month, {
      tiles_2d: Number(u.tiles_2d || 0),
      places_text: Number(u.places_text || 0),
      routes_compute: Number(u.routes_compute || 0),
      elevation: Number(u.elevation || 0)
    }, t, u.gcpBudgetCfg || null, u.routesApiStatus || null);
  }
  const now = Date.now();
  if (!force && MONTHLY_USAGE_MEM.snapshot && MONTHLY_USAGE_MEM.month === month && now < MONTHLY_USAGE_MEM.expiresAt) {
    return MONTHLY_USAGE_MEM.snapshot;
  }
  const db = env && env.DB ? env.DB : null;
  const counts = { tiles_2d: 0, places_text: 0, routes_compute: 0, elevation: 0 };
  let rulePayload = null;
  let bCfg = null;
  let routesStatus = null;
  if (db) {
    try {
      const placeholders = MAPS_QUOTA_RULE_IDS.map((_, i) => `?${i + 1}`).join(',');
      const ruleStmt = db.prepare(`SELECT id, payload_json, updated_at FROM alert_rules WHERE id IN (${placeholders})`).bind(...MAPS_QUOTA_RULE_IDS);
      const rulePromise = typeof ruleStmt.all === 'function'
        ? ruleStmt.all().catch(() => null)
        : (typeof ruleStmt.first === 'function' ? ruleStmt.first().then(r => (r ? { results: [r] } : null)).catch(() => null) : Promise.resolve(null));
      const [rTiles, rPlaces, rRoutes, rElev, rBudget, rRStat, rRuleRows] = await Promise.all([
        readKvJsonAndRev(db, `gmaps_cnt:${month}:tiles_2d`),
        readKvJsonAndRev(db, `gmaps_cnt:${month}:places_text`),
        readKvJsonAndRev(db, `gmaps_cnt:${month}:routes_compute`),
        readKvJsonAndRev(db, `gmaps_cnt:${month}:elevation`),
        readKvJsonAndRev(db, 'gmaps_budget_cfg'),
        readKvJsonAndRev(db, 'gmaps_status:routes_api'),
        rulePromise
      ]);
      counts.tiles_2d = rTiles ? rTiles.rev : 0;
      counts.places_text = rPlaces ? rPlaces.rev : 0;
      counts.routes_compute = rRoutes ? rRoutes.rev : 0;
      counts.elevation = rElev ? rElev.rev : 0;
      bCfg = rBudget && rBudget.payload ? rBudget.payload : null;
      routesStatus = rRStat && rRStat.payload ? rRStat.payload : null;
      const rows = (rRuleRows && Array.isArray(rRuleRows.results)) ? rRuleRows.results : [];
      let bestTs = '';
      let bestIsCanon = false;
      for (const row of rows) {
        if (!row || !row.payload_json) continue;
        let parsed = null;
        try { parsed = JSON.parse(String(row.payload_json)); } catch (_) { parsed = null; }
        if (!parsed || typeof parsed !== 'object') continue;
        const rowTs = String(row.updated_at || parsed.updated_at || '');
        const isCanon = String(row.id || '') === 'G_MAPS_QUOTA';
        if (!rulePayload || rowTs > bestTs || (rowTs === bestTs && isCanon && !bestIsCanon)) {
          rulePayload = parsed;
          bestTs = rowTs;
          bestIsCanon = isCanon;
        }
      }
    } catch (_) {
      // Non-fatal fallback to zero counts
    }
  }
  const snap = buildUsageSnapshot(month, counts, resolveThresholdConfig(rulePayload), bCfg, routesStatus);
  MONTHLY_USAGE_MEM = { month, expiresAt: now + USAGE_MEM_TTL_MS, snapshot: snap };
  return snap;
}

async function incrementMapsMonthlyMetric(env, metric) {
  if (!Object.prototype.hasOwnProperty.call(MAPS_FREE_CAPS, metric)) return null;
  const month = currentUsageMonthUtc();
  const docKey = `gmaps_cnt:${month}:${metric}`;
  const nowIso = new Date().toISOString();
  let newCount = null;
  if (env && env.DB) {
    try {
      const row = await env.DB.prepare(
        `INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, rev)
         VALUES (?1, '1', ?2, 1)
         ON CONFLICT(doc_key) DO UPDATE SET updated_at = excluded.updated_at, rev = edge_kv_store.rev + 1
         RETURNING rev`
      ).bind(docKey, nowIso).first();
      newCount = Number((row && row.rev) || 1);
    } catch (_) {
      newCount = null;
    }
  }
  if (MONTHLY_USAGE_MEM.snapshot && MONTHLY_USAGE_MEM.month === month) {
    const prev = MONTHLY_USAGE_MEM.snapshot;
    const nextCounts = {
      tiles_2d: prev.metrics.tiles_2d.used,
      places_text: prev.metrics.places_text.used,
      routes_compute: prev.metrics.routes_compute.used,
      elevation: prev.metrics.elevation.used
    };
    nextCounts[metric] = newCount != null ? newCount : (nextCounts[metric] + 1);
    MONTHLY_USAGE_MEM.snapshot = buildUsageSnapshot(
      month,
      nextCounts,
      prev.thresholds,
      { confirmed: prev.gcpBilling.budgetConfirmed, updated_at: prev.gcpBilling.budgetConfirmedAt, updated_by: prev.gcpBilling.budgetConfirmedBy },
      prev.routesApi
    );
  }
  return newCount;
}

async function saveRoutesApiStatus(env, statusStr) {
  if (!env || !env.DB) return;
  const nowIso = new Date().toISOString();
  const payload = JSON.stringify({ status: String(statusStr || 'unknown'), updated_at: nowIso });
  try {
    await env.DB.prepare(
      `INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, rev)
       VALUES (?1, ?2, ?3, 1)
       ON CONFLICT(doc_key) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at, rev = edge_kv_store.rev + 1`
    ).bind('gmaps_status:routes_api', payload, nowIso).run();
    if (MONTHLY_USAGE_MEM.snapshot) {
      MONTHLY_USAGE_MEM.snapshot.routesApi.status = String(statusStr || 'unknown');
      MONTHLY_USAGE_MEM.snapshot.routesApi.checkedAt = nowIso;
    }
  } catch (_) {}
}

function scheduleWork(opts, promise) {
  if (!promise) return;
  if (opts && opts.context && typeof opts.context.waitUntil === 'function') {
    opts.context.waitUntil(promise);
  }
}

function decodeBase64ToBytes(b64) {
  const bin = atob(String(b64 || ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function setBoundedMap(map, key, value, maxSize) {
  if (map.has(key)) map.delete(key);
  while (map.size >= maxSize) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
  map.set(key, value);
}

export function evictCachedMapSession(rawSession) {
  if (!rawSession) return;
  const sid = String(rawSession.sid || '').trim();
  if (sid) ACTIVE_SESSION_CACHE.delete(sid);
}

async function verifyCachedSession(rawSession, env) {
  if (!rawSession) return null;
  const sid = String(rawSession.sid || '').trim();
  if (!sid) return null;
  const now = Date.now();
  const hit = ACTIVE_SESSION_CACHE.get(sid);
  if (hit && now < hit.expiresAt) {
    return hit.ok ? rawSession : null;
  }
  const verified = await verifyActiveEdgeSession(rawSession, env);
  setBoundedMap(ACTIVE_SESSION_CACHE, sid, { ok: !!verified, expiresAt: now + SESSION_CACHE_TTL_MS }, SESSION_CACHE_MAX);
  return verified;
}

function isSameOriginTileBrowser(request, urlObj, env) {
  const secFetch = String(request.headers.get('Sec-Fetch-Site') || '').trim().toLowerCase();
  if (secFetch === 'cross-site') return false;
  if (isSameOriginBrowserRequest(request, urlObj, env)) return true;
  const hasOrigin = !!request.headers.get('Origin');
  const hasReferer = !!request.headers.get('Referer');
  return !hasOrigin && !hasReferer && secFetch === 'same-origin';
}

async function getOrCreateGoogleTileSession(style, lang, apiKey, testMock, failedSession = '') {
  const cacheKey = `${style}:${lang}:${apiKey.slice(-6)}`;
  const nowSec = Math.floor(Date.now() / 1000);
  const cached = GOOGLE_TILE_SESSIONS.get(cacheKey);
  if (failedSession && cached && cached.session === failedSession) {
    GOOGLE_TILE_SESSIONS.delete(cacheKey);
  } else if (cached && cached.session && cached.expirySec - TILE_SESSION_REFRESH_BUFFER_SEC > nowSec) {
    return cached;
  }

  if (INFLIGHT_TILE_SESSION.has(cacheKey)) {
    return INFLIGHT_TILE_SESSION.get(cacheKey);
  }

  const work = (async () => {
    if (testMock) {
      if (testMock.failSession) {
        throw new Error('Mocked Google session failure');
      }
      const mockRec = {
        session: `mock_session_${style}_${lang}`,
        expirySec: Math.floor(Date.now() / 1000) + 86400,
        imageFormat: STYLE_CONFIG[style].fallbackFormat
      };
      GOOGLE_TILE_SESSIONS.set(cacheKey, mockRec);
      return mockRec;
    }

    const cfg = STYLE_CONFIG[style];
    const reqBody = {
      mapType: cfg.mapType,
      language: lang,
      region: 'LB',
      imageFormat: cfg.imageFormat,
      scale: 'scaleFactor1x'
    };
    if (cfg.layerTypes) {
      reqBody.layerTypes = cfg.layerTypes;
      reqBody.overlay = false;
    }

    const res = await fetch(`${GOOGLE_CREATE_SESSION_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
      signal: AbortSignal.timeout(7000)
    });
    if (!res.ok) {
      throw new Error(`Google tile session creation failed (${res.status})`);
    }
    const data = await res.json();
    const sessToken = String((data && data.session) || '').trim();
    if (!sessToken) {
      throw new Error('Google tile session response missing token');
    }
    const expiryRaw = Number(data && data.expiry);
    const expirySec = Number.isFinite(expiryRaw) && expiryRaw > nowSec ? expiryRaw : nowSec + 3600 * 24;
    const rawFmt = String((data && data.imageFormat) || '').toLowerCase();
    const imageFormat = rawFmt === 'jpeg' || rawFmt === 'jpg'
      ? 'image/jpeg'
      : (rawFmt === 'png' ? 'image/png' : cfg.fallbackFormat);
    const rec = { session: sessToken, expirySec, imageFormat };
    GOOGLE_TILE_SESSIONS.set(cacheKey, rec);
    return rec;
  })();

  INFLIGHT_TILE_SESSION.set(cacheKey, work);
  try {
    return await work;
  } finally {
    if (INFLIGHT_TILE_SESSION.get(cacheKey) === work) {
      INFLIGHT_TILE_SESSION.delete(cacheKey);
    }
  }
}

async function fetchUpstreamTile(style, lang, z, x, y, apiKey, testMock, retried = false, failedSession = '') {
  const sessRec = await getOrCreateGoogleTileSession(style, lang, apiKey, testMock, failedSession);
  if (testMock && !testMock.useUpstreamTile) {
    if (testMock.failTile) return { ok: false, status: 502 };
    const b64 = testMock.tileBytesB64 || 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    return {
      ok: true,
      status: 200,
      contentType: testMock.tileContentType || sessRec.imageFormat || 'image/png',
      bytes: decodeBase64ToBytes(b64)
    };
  }
  if (testMock && testMock.failTile) {
    return { ok: false, status: 502 };
  }

  const upstreamUrl = `${GOOGLE_TILE_URL_PREFIX}/${z}/${x}/${y}?session=${encodeURIComponent(sessRec.session)}&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(upstreamUrl, { method: 'GET', signal: AbortSignal.timeout(7000) });
  if ((res.status === 400 || res.status === 401 || res.status === 403) && !retried) {
    return fetchUpstreamTile(style, lang, z, x, y, apiKey, testMock, true, sessRec.session);
  }
  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  const ct = String(res.headers.get('Content-Type') || sessRec.imageFormat || 'image/png').split(';')[0].trim().toLowerCase();
  const safeCt = (ct === 'image/jpeg' || ct === 'image/png' || ct === 'image/webp') ? ct : sessRec.imageFormat;
  const buf = await res.arrayBuffer();
  return { ok: true, status: 200, contentType: safeCt, bytes: new Uint8Array(buf) };
}

export async function handleGoogleMapTile(request, env, rawSession, parts, opts = {}) {
  if (request.method !== 'GET') {
    return jsonResponse({ ok: false, code: 'method_not_allowed', error: 'GET required.' }, 405);
  }
  if (!Array.isArray(parts) || parts.length !== 6) {
    return jsonResponse({ ok: false, code: 'invalid_tile_path', error: 'Invalid map tile path.' }, 400);
  }

  const style = sanitizeStyle(parts[1]);
  const langRaw = String(parts[2] || '').trim().toLowerCase();
  if (!style || !ALLOWED_LANGS.has(langRaw)) {
    return jsonResponse({ ok: false, code: 'invalid_tile_params', error: 'Unsupported tile style or language.' }, 400);
  }

  if (!/^\d+$/.test(String(parts[3])) || !/^\d+$/.test(String(parts[4])) || !/^\d+$/.test(String(parts[5]))) {
    return jsonResponse({ ok: false, code: 'invalid_tile_coords', error: 'Tile coordinates must be non-negative integers.' }, 400);
  }
  const z = Number(parts[3]);
  const x = Number(parts[4]);
  const y = Number(parts[5]);
  if (!Number.isInteger(z) || z < 0 || z > MAX_TILE_ZOOM) {
    return jsonResponse({ ok: false, code: 'invalid_zoom', error: 'Zoom out of range.' }, 400);
  }
  const maxCoord = Math.pow(2, z) - 1;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > maxCoord || y > maxCoord) {
    return jsonResponse({ ok: false, code: 'invalid_tile_coords', error: 'Tile coordinates out of range for zoom.' }, 400);
  }

  const urlObj = opts.url || new URL(request.url);
  const secFetch = String(request.headers.get('Sec-Fetch-Site') || '').trim().toLowerCase();
  if (secFetch === 'cross-site') {
    return jsonResponse({ ok: false, code: 'cross_site_forbidden', error: 'Cross-site tile access forbidden.' }, 403);
  }

  const session = rawSession ? await verifyCachedSession(rawSession, env) : null;
  const hasDemoFlag = urlObj.searchParams.get('demo') === '1' || request.headers.get('X-ISABI-Demo') === '1';
  if (!session) {
    if (!hasDemoFlag) {
      return jsonResponse({ ok: false, error: 'Authentication required' }, 401);
    }
    if (!isSameOriginTileBrowser(request, urlObj, env)) {
      return jsonResponse({ ok: false, code: 'same_origin_required', error: 'Demo map tiles require same-origin browser context.' }, 403);
    }
  }
  const isDemoContext = !session || hasDemoFlag;

  const testMock = parseTestMocks(env);
  const apiKey = resolveGoogleMapsKey(env);
  if (!apiKey && !testMock) {
    return jsonResponse({ ok: false, code: 'maps_not_configured', error: 'Google Maps service not configured on edge.' }, 503);
  }

  const cacheUrl = `https://isabi-tile-cache.internal/v1/${style}/${langRaw}/${z}/${x}/${y}`;
  let edgeCache = null;
  try {
    if (typeof caches !== 'undefined' && caches.default) {
      edgeCache = caches.default;
      const cachedResp = await edgeCache.match(cacheUrl);
      if (cachedResp) {
        const memBand = (MONTHLY_USAGE_MEM.snapshot && MONTHLY_USAGE_MEM.snapshot.metrics.tiles_2d.band) || 'ok';
        return new Response(cachedResp.body, {
          status: 200,
          headers: {
            'Content-Type': cachedResp.headers.get('Content-Type') || 'image/png',
            'Cache-Control': `private, max-age=${TILE_CACHE_MAX_AGE_SEC}`,
            'X-Content-Type-Options': 'nosniff',
            'X-ISABI-Tile-Cache': 'HIT',
            'X-ISABI-Maps-Quota-State': memBand,
            'X-ISABI-Maps-Quota-Service': 'tiles_2d'
          }
        });
      }
    }
  } catch (_) {
    edgeCache = null;
  }

  const snap = await readMapsUsageSnapshot(env);
  const tileBand = snap.metrics.tiles_2d.band;
  if (tileBand === 'fallback_95') {
    return jsonResponse({
      ok: false,
      code: 'quota_guard_fallback',
      error: 'Monthly Google 2D Map Tiles free-tier guard active; switching to OpenStreetMap.',
      quotaFallback: 'osm',
      quotaState: 'fallback_95'
    }, 429, {
      'Retry-After': '3600',
      'X-ISABI-Maps-Quota-State': 'fallback_95',
      'X-ISABI-Maps-Quota-Service': 'tiles_2d',
      'X-ISABI-Maps-Fallback': 'osm'
    });
  }

  // Rate limit only misses so panned cached tiles remain instant and zero-quota.
  const ipHash = await hashClientIp(request);
  const rl = checkSlidingRateLimit(`gtiles:${ipHash}`, session ? 800 : 300, 60000);
  if (!rl.allowed) {
    const retrySec = rl.resetAt ? Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000)) : 15;
    return jsonResponse({ ok: false, code: 'rate_limited', error: 'Map tile rate limit reached.' }, 429, {
      'Retry-After': String(retrySec)
    });
  }

  let fetched;
  try {
    fetched = await fetchUpstreamTile(style, langRaw, z, x, y, apiKey, testMock, false);
  } catch (_) {
    return jsonResponse({ ok: false, code: 'upstream_tile_error', error: 'Map tile provider unavailable.' }, 502);
  }
  if (!fetched || !fetched.ok) {
    const codeStatus = fetched && fetched.status === 404 ? 404 : 502;
    return jsonResponse({ ok: false, code: 'upstream_tile_error', error: 'Map tile unavailable.' }, codeStatus);
  }

  if (!isDemoContext) {
    if (opts.context && typeof opts.context.waitUntil === 'function') {
      opts.context.waitUntil(incrementMapsMonthlyMetric(env, 'tiles_2d'));
    } else {
      await incrementMapsMonthlyMetric(env, 'tiles_2d');
    }
  }

  if (edgeCache && !testMock) {
    try {
      const toCache = new Response(fetched.bytes, {
        status: 200,
        headers: {
          'Content-Type': fetched.contentType,
          'Cache-Control': `public, max-age=${TILE_CACHE_MAX_AGE_SEC}`
        }
      });
      const putPromise = edgeCache.put(cacheUrl, toCache);
      if (opts.context && typeof opts.context.waitUntil === 'function') {
        opts.context.waitUntil(putPromise);
      } else {
        await putPromise;
      }
    } catch (_) {
      // Cache write failure is non-fatal
    }
  }

  const nextBand = (MONTHLY_USAGE_MEM.snapshot && MONTHLY_USAGE_MEM.snapshot.metrics.tiles_2d.band) || tileBand;
  const respHeaders = {
    'Content-Type': fetched.contentType,
    'Cache-Control': `private, max-age=${TILE_CACHE_MAX_AGE_SEC}`,
    'X-Content-Type-Options': 'nosniff',
    'X-ISABI-Tile-Cache': 'MISS',
    'X-ISABI-Maps-Quota-State': nextBand,
    'X-ISABI-Maps-Quota-Service': 'tiles_2d'
  };
  if (nextBand === 'fallback_95') respHeaders['X-ISABI-Maps-Fallback'] = 'osm';
  return new Response(fetched.bytes, {
    status: 200,
    headers: respHeaders
  });
}

function normalizePlacesPayload(rawPlaces) {
  if (!Array.isArray(rawPlaces)) return [];
  const out = [];
  for (const p of rawPlaces) {
    if (!p || typeof p !== 'object') continue;
    const loc = p.location && typeof p.location === 'object' ? p.location : null;
    const lat = Number(loc ? loc.latitude : p.lat);
    const lng = Number(loc ? loc.longitude : p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    const name = String(
      (p.displayName && typeof p.displayName === 'object' ? p.displayName.text : p.displayName)
      || p.name
      || ''
    ).trim();
    if (!name) continue;
    const address = String(p.formattedAddress || p.address || '').trim();
    const type = String(
      (p.primaryTypeDisplayName && typeof p.primaryTypeDisplayName === 'object' ? p.primaryTypeDisplayName.text : p.primaryTypeDisplayName)
      || p.type
      || ''
    ).trim();
    const id = String(p.id || '').trim();
    out.push({ id, name, address, lat, lng, type });
  }
  return out;
}

export async function handleGoogleMapPlaces(request, env, body, session, opts = {}) {
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, code: 'method_not_allowed', error: 'POST required.' }, 405);
  }
  const urlObj = opts.url || new URL(request.url);
  const secFetch = String(request.headers.get('Sec-Fetch-Site') || '').trim().toLowerCase();
  if (secFetch === 'cross-site') {
    return jsonResponse({ ok: false, code: 'cross_site_forbidden', error: 'Cross-site places access forbidden.' }, 403);
  }

  const isDemoReq = request.headers.get('X-ISABI-Demo') === '1' || urlObj.searchParams.get('demo') === '1';
  if (!session) {
    if (!isDemoReq) {
      return jsonResponse({ ok: false, error: 'Authentication required' }, 401);
    }
    if (!isSameOriginBrowserRequest(request, urlObj, env)) {
      return jsonResponse({ ok: false, code: 'same_origin_required', error: 'Demo places search requires same-origin browser request.' }, 403);
    }
  } else if ((request.headers.get('Origin') || request.headers.get('Referer')) && !isSameOriginBrowserRequest(request, urlObj, env)) {
    return jsonResponse({ ok: false, code: 'same_origin_required', error: 'Cross-origin browser request forbidden.' }, 403);
  }
  const isDemoContext = !session || isDemoReq;

  if (opts.parseError || !body || typeof body !== 'object') {
    return jsonResponse({ ok: false, code: 'invalid_json', error: 'Malformed JSON body.' }, 400);
  }

  const rawQuery = typeof body.query === 'string' ? body.query.trim() : '';
  if (rawQuery.length > 120) {
    return jsonResponse({ ok: false, code: 'query_too_long', error: 'Search query must be 120 characters or fewer.' }, 400);
  }
  if (rawQuery.length < 2) {
    return jsonResponse({ ok: true, source: 'empty', places: [] });
  }

  const lang = sanitizeLang(body && body.lang);
  const latNum = body && typeof body.lat !== 'boolean' && body.lat !== undefined && body.lat !== null && body.lat !== '' ? Number(body.lat) : NaN;
  const lngNum = body && typeof body.lng !== 'boolean' && body.lng !== undefined && body.lng !== null && body.lng !== '' ? Number(body.lng) : NaN;
  const hasBias = Number.isFinite(latNum) && Number.isFinite(lngNum) && latNum >= -90 && latNum <= 90 && lngNum >= -180 && lngNum <= 180;

  const ipHash = await hashClientIp(request);
  const memRl = checkSlidingRateLimit(`gplaces:${ipHash}`, session ? 60 : 25, 60000);
  if (!memRl.allowed) {
    const retrySec = memRl.resetAt ? Math.max(1, Math.ceil((memRl.resetAt - Date.now()) / 1000)) : 15;
    return jsonResponse({ ok: false, code: 'rate_limited', error: 'Too many place searches. Please wait a moment.' }, 429, {
      'Retry-After': String(retrySec)
    });
  }
  const d1Rl = await checkD1RateLimit(env, `gplaces_d1:${ipHash}`, session ? 240 : 60, 3600);
  if (!d1Rl.allowed) {
    return jsonResponse({ ok: false, code: 'rate_limited', error: 'Hourly place search limit reached.' }, 429, {
      'Retry-After': String(d1Rl.retryAfterSec || 120)
    });
  }

  const snap = await readMapsUsageSnapshot(env);
  const placesBand = snap.metrics.places_text.band;

  const cacheKey = `${lang}:${rawQuery.toLowerCase()}:${hasBias ? latNum.toFixed(2) : '_'}:${hasBias ? lngNum.toFixed(2) : '_'}`;
  const cached = PLACES_QUERY_CACHE.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return jsonResponse(
      { ok: true, source: 'google_places_cache', places: cached.places, quotaState: placesBand },
      200,
      { 'X-ISABI-Maps-Quota-State': placesBand, 'X-ISABI-Maps-Quota-Service': 'places_text' }
    );
  }

  if (placesBand === 'fallback_95') {
    return jsonResponse(
      { ok: true, source: 'quota_local_fallback', places: [], quotaState: 'fallback_95' },
      200,
      { 'X-ISABI-Maps-Quota-State': 'fallback_95', 'X-ISABI-Maps-Quota-Service': 'places_text' }
    );
  }

  const testMock = parseTestMocks(env);
  const apiKey = resolveGoogleMapsKey(env);
  if (!apiKey && !testMock) {
    return jsonResponse({ ok: false, code: 'maps_not_configured', error: 'Google Places service not configured on edge.' }, 503);
  }

  if (testMock && testMock.places !== undefined) {
    if (testMock.failPlaces) {
      return jsonResponse({ ok: false, code: 'upstream_places_error', error: 'Places provider unavailable.', places: [] }, 502);
    }
    const normalized = normalizePlacesPayload(testMock.places || []);
    setBoundedMap(PLACES_QUERY_CACHE, cacheKey, { places: normalized, expiresAt: Date.now() + PLACES_CACHE_TTL_MS }, PLACES_CACHE_MAX);
    if (!isDemoContext) {
      await incrementMapsMonthlyMetric(env, 'places_text');
    }
    const nxtBand = (MONTHLY_USAGE_MEM.snapshot && MONTHLY_USAGE_MEM.snapshot.metrics.places_text.band) || placesBand;
    return jsonResponse(
      { ok: true, source: 'google_places', places: normalized, quotaState: nxtBand },
      200,
      { 'X-ISABI-Maps-Quota-State': nxtBand, 'X-ISABI-Maps-Quota-Service': 'places_text' }
    );
  }
  if (testMock && testMock.failPlaces) {
    return jsonResponse({ ok: false, code: 'upstream_places_error', error: 'Places provider unavailable.', places: [] }, 502);
  }

  const payload = {
    textQuery: rawQuery,
    languageCode: lang,
    regionCode: 'LB',
    maxResultCount: 6
  };
  if (hasBias) {
    payload.locationBias = {
      circle: {
        center: { latitude: latNum, longitude: lngNum },
        radius: 50000.0
      }
    };
  }

  let gRes;
  try {
    gRes = await fetch(GOOGLE_PLACES_TEXT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.primaryTypeDisplayName'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(7000)
    });
  } catch (_) {
    return jsonResponse({ ok: false, code: 'upstream_places_error', error: 'Places provider unreachable.', places: [] }, 502);
  }

  if (!gRes.ok) {
    return jsonResponse({ ok: false, code: 'upstream_places_error', error: 'Places search failed.', places: [] }, 502);
  }

  let data = null;
  try {
    data = await gRes.json();
  } catch (_) {
    return jsonResponse({ ok: false, code: 'upstream_places_error', error: 'Invalid Places response.', places: [] }, 502);
  }

  if (!isDemoContext) {
    await incrementMapsMonthlyMetric(env, 'places_text');
  }
  const nxtBand = (MONTHLY_USAGE_MEM.snapshot && MONTHLY_USAGE_MEM.snapshot.metrics.places_text.band) || placesBand;

  const places = normalizePlacesPayload(data && data.places);
  setBoundedMap(PLACES_QUERY_CACHE, cacheKey, { places, expiresAt: Date.now() + PLACES_CACHE_TTL_MS }, PLACES_CACHE_MAX);
  return jsonResponse(
    { ok: true, source: 'google_places', places, quotaState: nxtBand },
    200,
    { 'X-ISABI-Maps-Quota-State': nxtBand, 'X-ISABI-Maps-Quota-Service': 'places_text' }
  );
}

// ---------------------------------------------------------------------------
// Google Routes API v2 + Elevation DEM Profile (with OSRM/Open-Meteo fallback)
// ---------------------------------------------------------------------------

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371008.8;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function decodeEncodedPolyline(encoded) {
  const str = String(encoded || '');
  const pts = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < str.length) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      if (index >= str.length) break;
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dLat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dLat;

    shift = 0;
    result = 0;
    do {
      if (index >= str.length) break;
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dLng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dLng;
    pts.push([lat / 1e5, lng / 1e5]);
  }
  return pts;
}

function downsampleCoords(coords, maxCount = 32) {
  if (!Array.isArray(coords) || !coords.length) return [];
  const clean = coords
    .filter(pt => Array.isArray(pt) && Number.isFinite(Number(pt[0])) && Number.isFinite(Number(pt[1])))
    .map(pt => [Math.round(Number(pt[0]) * 1e5) / 1e5, Math.round(Number(pt[1]) * 1e5) / 1e5]);
  if (clean.length <= maxCount) return clean;
  const out = [];
  const step = (clean.length - 1) / (maxCount - 1);
  for (let i = 0; i < maxCount - 1; i++) {
    out.push(clean[Math.round(i * step)]);
  }
  out.push(clean[clean.length - 1]);
  return out;
}

function parseFiniteElevation(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function computeElevationGradeMetrics(samplePts, elevArr) {
  const empty = { elevAvailable: false, elevStartM: 0, elevEndM: 0, elevGainM: 0, elevDropM: 0, maxGradePct: 0, avgClimbGradePct: 0 };
  if (!Array.isArray(samplePts) || !Array.isArray(elevArr) || elevArr.length < 2 || elevArr.length !== samplePts.length) {
    return empty;
  }
  let gain = 0;
  let drop = 0;
  let climbHoriz = 0;
  let maxGrade = 0;
  let validCount = 0;
  let firstValidVal = NaN;
  let lastValidVal = NaN;
  let lastValidIdx = -1;
  for (let i = 0; i < samplePts.length; i++) {
    const eCurr = parseFiniteElevation(elevArr[i]);
    if (!Number.isFinite(eCurr)) continue;
    validCount += 1;
    if (!Number.isFinite(firstValidVal)) firstValidVal = eCurr;
    if (lastValidIdx >= 0) {
      const dh = eCurr - lastValidVal;
      let dx = 0;
      for (let k = lastValidIdx; k < i; k++) {
        dx += haversineMeters(samplePts[k][0], samplePts[k][1], samplePts[k + 1][0], samplePts[k + 1][1]);
      }
      if (dh > 0) {
        gain += dh;
        if (dx >= 40) climbHoriz += dx;
      } else if (dh < 0) {
        drop += Math.abs(dh);
      }
      if (dx >= 60) {
        const segGrade = Math.min(28, (Math.abs(dh) / dx) * 100);
        if (segGrade > maxGrade) maxGrade = segGrade;
      }
    }
    lastValidVal = eCurr;
    lastValidIdx = i;
  }
  if (validCount < 2) return empty;
  const avgClimbGradePct = climbHoriz > 0 ? Math.min(25, (gain / climbHoriz) * 100) : 0;
  return {
    elevAvailable: true,
    elevStartM: Math.round(firstValidVal),
    elevEndM: Math.round(lastValidVal),
    elevGainM: Math.round(gain),
    elevDropM: Math.round(drop),
    maxGradePct: Math.round(maxGrade * 10) / 10,
    avgClimbGradePct: Math.round(avgClimbGradePct * 10) / 10
  };
}

function interpolateRouteElevations(compactCoords, elevSamples, elevArr) {
  if (!Array.isArray(compactCoords) || compactCoords.length < 2) return null;
  if (!Array.isArray(elevSamples) || !Array.isArray(elevArr) || elevSamples.length < 2 || elevArr.length !== elevSamples.length) return null;
  const M = elevSamples.length;
  const cumSamp = new Array(M);
  cumSamp[0] = 0;
  for (let i = 1; i < M; i++) {
    const d = haversineMeters(elevSamples[i - 1][0], elevSamples[i - 1][1], elevSamples[i][0], elevSamples[i][1]);
    cumSamp[i] = cumSamp[i - 1] + (Number.isFinite(d) && d > 0 ? d : 0);
  }
  const totalSamp = cumSamp[M - 1];
  const validPairs = [];
  for (let i = 0; i < M; i++) {
    const raw = elevArr[i];
    if (raw === null || raw === undefined || typeof raw === 'boolean' || raw === '') continue;
    const v = Number(raw);
    if (!Number.isFinite(v)) continue;
    const s = totalSamp > 0 ? (cumSamp[i] / totalSamp) : (i / Math.max(1, M - 1));
    validPairs.push({ s, elev: v });
  }
  if (validPairs.length < 2) return null;
  const N = compactCoords.length;
  const cumComp = new Array(N);
  cumComp[0] = 0;
  for (let i = 1; i < N; i++) {
    const d = haversineMeters(compactCoords[i - 1][0], compactCoords[i - 1][1], compactCoords[i][0], compactCoords[i][1]);
    cumComp[i] = cumComp[i - 1] + (Number.isFinite(d) && d > 0 ? d : 0);
  }
  const totalComp = cumComp[N - 1];
  const out = new Array(N);
  let ptr = 0;
  for (let i = 0; i < N; i++) {
    const t = totalComp > 0 ? (cumComp[i] / totalComp) : (i / Math.max(1, N - 1));
    let val;
    if (t <= validPairs[0].s) {
      val = validPairs[0].elev;
    } else if (t >= validPairs[validPairs.length - 1].s) {
      val = validPairs[validPairs.length - 1].elev;
    } else {
      while (ptr + 1 < validPairs.length - 1 && validPairs[ptr + 1].s < t) ptr++;
      const a = validPairs[ptr];
      const b = validPairs[ptr + 1];
      const span = b.s - a.s;
      const frac = span > 1e-9 ? Math.max(0, Math.min(1, (t - a.s) / span)) : 0;
      val = a.elev + frac * (b.elev - a.elev);
    }
    const rounded = Math.round(val * 10) / 10;
    out[i] = Math.max(-500, Math.min(9000, rounded));
  }
  return out;
}

function parseRouteCoord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.lat === 'boolean' || typeof raw.lng === 'boolean') return null;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -85 || lat > 85 || lng < -180 || lng > 180) return null;
  if (Math.abs(lat) < 1e-4 && Math.abs(lng) < 1e-4) return null;
  return { lat, lng };
}

export async function handleGoogleMapRoute(request, env, body, session, opts = {}) {
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, code: 'method_not_allowed', error: 'POST required.' }, 405);
  }
  const urlObj = opts.url || new URL(request.url);
  const secFetch = String(request.headers.get('Sec-Fetch-Site') || '').trim().toLowerCase();
  if (secFetch === 'cross-site') {
    return jsonResponse({ ok: false, code: 'cross_site_forbidden', error: 'Cross-site route lookup forbidden.' }, 403);
  }

  const isDemoReq = request.headers.get('X-ISABI-Demo') === '1' || urlObj.searchParams.get('demo') === '1';
  if (!session) {
    if (!isDemoReq) {
      return jsonResponse({ ok: false, error: 'Authentication required' }, 401);
    }
    if (!isSameOriginBrowserRequest(request, urlObj, env)) {
      return jsonResponse({ ok: false, code: 'same_origin_required', error: 'Demo route verification requires same-origin browser request.' }, 403);
    }
  } else if ((request.headers.get('Origin') || request.headers.get('Referer')) && !isSameOriginBrowserRequest(request, urlObj, env)) {
    return jsonResponse({ ok: false, code: 'same_origin_required', error: 'Cross-origin browser request forbidden.' }, 403);
  }
  if (session && !isDemoReq) {
    const perms = getSessionWritePerms(session);
    if (perms.roleKey === 'Viewer' || (!perms.modifyData && !perms.modifyText && !perms.voidData && !perms.canEnterAny)) {
      return jsonResponse({ ok: false, code: 'forbidden_viewer', error: 'Read-only Viewer seats cannot run route verification.' }, 403);
    }
  }
  const isDemoContext = !session || isDemoReq;

  if (opts.parseError || !body || typeof body !== 'object') {
    return jsonResponse({ ok: false, code: 'invalid_json', error: 'Malformed JSON body.' }, 400);
  }

  const origin = parseRouteCoord(body.origin);
  const destination = parseRouteCoord(body.destination);
  if (!origin || !destination) {
    return jsonResponse({ ok: false, code: 'invalid_coords', error: 'Valid origin and destination {lat, lng} coordinates are required.' }, 400);
  }

  const ipHash = await hashClientIp(request);
  const memRl = checkSlidingRateLimit(`groutes:${ipHash}`, session ? 45 : 20, 60000);
  if (!memRl.allowed) {
    const retrySec = memRl.resetAt ? Math.max(1, Math.ceil((memRl.resetAt - Date.now()) / 1000)) : 15;
    return jsonResponse({ ok: false, code: 'rate_limited', error: 'Too many route verification requests.' }, 429, {
      'Retry-After': String(retrySec)
    });
  }
  const d1Rl = await checkD1RateLimit(env, `groutes_d1:${ipHash}`, session ? 240 : 60, 3600);
  if (!d1Rl.allowed) {
    return jsonResponse({ ok: false, code: 'rate_limited', error: 'Hourly route verification limit reached.' }, 429, {
      'Retry-After': String(d1Rl.retryAfterSec || 120)
    });
  }

  const straightM = haversineMeters(origin.lat, origin.lng, destination.lat, destination.lng);
  if (straightM < 15) {
    return jsonResponse({
      ok: true,
      cached: false,
      source: 'same_point',
      km: 0,
      distanceMeters: 0,
      mins: 0,
      carMins: 0,
      heavyTruckMins: 0,
      elevAvailable: false,
      elevStartM: 0,
      elevEndM: 0,
      elevGainM: 0,
      elevDropM: 0,
      maxGradePct: 0,
      avgClimbGradePct: 0,
      elevProfileM: null,
      coords: [[origin.lat, origin.lng], [destination.lat, destination.lng]],
      verifiedAt: new Date().toISOString()
    });
  }

  const snap = await readMapsUsageSnapshot(env);
  const routesBand = snap.metrics.routes_compute.band;

  const hasValidRouteElev = payload => Boolean(
    payload && payload.ok
    && (!payload.elevAvailable || (Array.isArray(payload.elevProfileM) && Array.isArray(payload.coords) && payload.elevProfileM.length === payload.coords.length))
  );
  const modePrefix = isDemoContext ? 'demo' : 'prod';
  const rKey = `${modePrefix}:${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}->${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}`;
  const cacheUrl = `https://isabi-route-cache.internal/v3/${encodeURIComponent(rKey)}`;
  const memHit = ROUTE_QUERY_CACHE.get(rKey);
  if (memHit && Date.now() < memHit.expiresAt && hasValidRouteElev(memHit.payload)) {
    return jsonResponse(Object.assign({}, memHit.payload, { cached: true, quotaState: routesBand }), 200, {
      'X-ISABI-Maps-Quota-State': routesBand,
      'X-ISABI-Maps-Quota-Service': 'routes_compute'
    });
  }
  let edgeCache = null;
  if (!isDemoContext) {
    try {
      if (typeof caches !== 'undefined' && caches.default) {
        edgeCache = caches.default;
        const cachedResp = await edgeCache.match(cacheUrl);
        if (cachedResp) {
          const cPayload = await cachedResp.json().catch(() => null);
          if (hasValidRouteElev(cPayload)) {
            return jsonResponse(Object.assign({}, cPayload, { cached: true, quotaState: routesBand }), 200, {
              'X-ISABI-Maps-Quota-State': routesBand,
              'X-ISABI-Maps-Quota-Service': 'routes_compute'
            });
          }
        }
      }
    } catch (_) {
      edgeCache = null;
    }
  }

  const testMock = parseTestMocks(env);
  const apiKey = resolveGoogleMapsKey(env);
  let routeData = null;
  let googleRoutesStatus = snap.routesApi.status || 'unknown';

  // 1. Primary: Google Routes API v2 computeRoutes (authenticated only, below 95% free-tier cap)
  if (!isDemoContext && routesBand !== 'fallback_95' && (apiKey || (testMock && testMock.routes !== undefined))) {
    if (testMock && testMock.routes !== undefined) {
      if (testMock.routes403) {
        googleRoutesStatus = 'enable_in_gcp';
        scheduleWork(opts, saveRoutesApiStatus(env, 'enable_in_gcp'));
      } else if (testMock.routes && !testMock.failRoutes) {
        routeData = {
          distanceMeters: Number(testMock.routes.distanceMeters || 0),
          durationSec: Number(String(testMock.routes.duration || '0s').replace(/s$/i, '')) || 60,
          coords: Array.isArray(testMock.routes.coords) ? testMock.routes.coords : [[origin.lat, origin.lng], [destination.lat, destination.lng]],
          source: 'google_routes'
        };
        googleRoutesStatus = 'active';
        scheduleWork(opts, Promise.all([
          incrementMapsMonthlyMetric(env, 'routes_compute'),
          saveRoutesApiStatus(env, 'active')
        ]));
      }
    } else if (apiKey) {
      try {
        const gRes = await fetch(GOOGLE_ROUTES_COMPUTE_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline'
          },
          body: JSON.stringify({
            origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
            destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
            travelMode: 'DRIVE',
            routingPreference: 'TRAFFIC_UNAWARE',
            computeAlternativeRoutes: false,
            units: 'METRIC'
          }),
          signal: AbortSignal.timeout(5500)
        });
        if (gRes.status === 403 || gRes.status === 401) {
          googleRoutesStatus = 'enable_in_gcp';
          scheduleWork(opts, saveRoutesApiStatus(env, 'enable_in_gcp'));
        } else if (gRes.ok) {
          const j = await gRes.json().catch(() => null);
          const rt = j && Array.isArray(j.routes) && j.routes[0];
          const dm = Number(rt && rt.distanceMeters);
          const durSec = Number(String((rt && rt.duration) || '0s').replace(/s$/i, ''));
          if (Number.isFinite(dm) && dm > 0) {
            const poly = decodeEncodedPolyline(rt && rt.polyline && rt.polyline.encodedPolyline);
            routeData = {
              distanceMeters: dm,
              durationSec: Number.isFinite(durSec) && durSec > 0 ? durSec : Math.round((dm / 1000) / 42 * 3600),
              coords: poly.length >= 2 ? poly : [[origin.lat, origin.lng], [destination.lat, destination.lng]],
              source: 'google_routes'
            };
            googleRoutesStatus = 'active';
            scheduleWork(opts, Promise.all([
              incrementMapsMonthlyMetric(env, 'routes_compute'),
              saveRoutesApiStatus(env, 'active')
            ]));
          }
        }
      } catch (_) {
        // Fall through cleanly to OSRM road router
      }
    }
  }

  // 2. Road-network fallback: OSRM public driving router (no Google key quota impact)
  if (!routeData) {
    if (testMock && testMock.osrmRoute) {
      routeData = {
        distanceMeters: Number(testMock.osrmRoute.distance || straightM * 1.25),
        durationSec: Number(testMock.osrmRoute.duration || 600),
        coords: Array.isArray(testMock.osrmRoute.coords) ? testMock.osrmRoute.coords : [[origin.lat, origin.lng], [destination.lat, destination.lng]],
        source: 'road_dem_verified'
      };
    } else if (!testMock || !testMock.skipExternalFallback) {
      try {
        const osrmUrl = `${OSRM_PUBLIC_ROUTE_BASE}/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=simplified&geometries=geojson`;
        const oRes = await fetch(osrmUrl, { method: 'GET', signal: AbortSignal.timeout(4500) });
        if (oRes.ok) {
          const oj = await oRes.json().catch(() => null);
          const ort = oj && Array.isArray(oj.routes) && oj.routes[0];
          if (ort && Number(ort.distance) > 0) {
            const rawCoords = ort.geometry && Array.isArray(ort.geometry.coordinates)
              ? ort.geometry.coordinates.map(c => [Number(c[1]), Number(c[0])])
              : [];
            routeData = {
              distanceMeters: Number(ort.distance),
              durationSec: Number(ort.duration) > 0 ? Number(ort.duration) : Math.round((Number(ort.distance) / 1000) / 42 * 3600),
              coords: rawCoords.length >= 2 ? rawCoords : [[origin.lat, origin.lng], [destination.lat, destination.lng]],
              source: 'road_dem_verified'
            };
          }
        }
      } catch (_) {}
    }
  }

  // 3. Last-resort deterministic straight-road fallback if all external routers fail
  if (!routeData) {
    const estMeters = Math.round(straightM * 1.24);
    routeData = {
      distanceMeters: estMeters,
      durationSec: Math.max(60, Math.round((estMeters / 1000) / 42 * 3600)),
      coords: [[origin.lat, origin.lng], [destination.lat, destination.lng]],
      source: 'deterministic_fallback'
    };
  }

  // Sample up to 16 vertices for elevation & road-grade profile
  const elevSamples = downsampleCoords(routeData.coords, 16);
  let elevArr = null;
  let elevSource = 'unavailable';
  if (elevSamples.length >= 2) {
    if (testMock && Array.isArray(testMock.elevations)) {
      elevArr = testMock.elevations.slice(0, elevSamples.length).map(parseFiniteElevation);
      elevSource = 'dem_mock';
    } else {
      // Prefer Google Elevation only when Google Routes is active and below 95%
      if (!isDemoContext && apiKey && googleRoutesStatus === 'active' && snap.metrics.elevation.band !== 'fallback_95') {
        try {
          const locParam = elevSamples.map(p => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join('|');
          const geRes = await fetch(`${GOOGLE_ELEVATION_URL}?locations=${encodeURIComponent(locParam)}&key=${encodeURIComponent(apiKey)}`, {
            method: 'GET',
            signal: AbortSignal.timeout(3500)
          });
          if (geRes.ok) {
            const gej = await geRes.json().catch(() => null);
            if (gej && gej.status === 'OK' && Array.isArray(gej.results) && gej.results.length === elevSamples.length) {
              elevArr = gej.results.map(r => parseFiniteElevation(r && r.elevation));
              elevSource = 'google_elevation';
              scheduleWork(opts, incrementMapsMonthlyMetric(env, 'elevation'));
            }
          }
        } catch (_) {}
      }
      if (!elevArr && (!testMock || !testMock.skipExternalFallback)) {
        try {
          const lats = elevSamples.map(p => p[0].toFixed(5)).join(',');
          const lngs = elevSamples.map(p => p[1].toFixed(5)).join(',');
          const omRes = await fetch(`${OPEN_METEO_ELEV_URL}?latitude=${lats}&longitude=${lngs}`, {
            method: 'GET',
            signal: AbortSignal.timeout(3500)
          });
          if (omRes.ok) {
            const omj = await omRes.json().catch(() => null);
            if (omj && Array.isArray(omj.elevation) && omj.elevation.length === elevSamples.length) {
              elevArr = omj.elevation.map(parseFiniteElevation);
              elevSource = 'open_meteo_dem';
            }
          }
        } catch (_) {}
      }
    }
  }

  const elevStats = computeElevationGradeMetrics(elevSamples, elevArr);
  const km = Math.round((routeData.distanceMeters / 1000) * 10) / 10;
  const carMins = Math.max(1, Math.round(routeData.durationSec / 60));
  const heavyTruckMins = Math.max(
    carMins,
    Math.round(carMins * 1.28 + (elevStats.elevGainM / 100) * 1.35 + (elevStats.maxGradePct >= 8 ? (elevStats.maxGradePct - 7) * 0.8 : 0))
  );
  const compactCoords = downsampleCoords(routeData.coords, 32);
  const elevProfileM = elevStats.elevAvailable ? interpolateRouteElevations(compactCoords, elevSamples, elevArr) : null;
  const verifiedAt = new Date().toISOString();
  const resPayload = {
    ok: true,
    cached: false,
    source: routeData.source,
    elevSource,
    googleRoutesStatus,
    km,
    distanceMeters: Math.round(routeData.distanceMeters),
    mins: carMins,
    carMins,
    heavyTruckMins,
    elevAvailable: elevStats.elevAvailable,
    elevStartM: elevStats.elevStartM,
    elevEndM: elevStats.elevEndM,
    elevGainM: elevStats.elevGainM,
    elevDropM: elevStats.elevDropM,
    maxGradePct: elevStats.maxGradePct,
    avgClimbGradePct: elevStats.avgClimbGradePct,
    elevProfileM,
    coords: compactCoords,
    verifiedAt
  };

  if (routeData.source !== 'deterministic_fallback' && elevStats.elevAvailable) {
    setBoundedMap(ROUTE_QUERY_CACHE, rKey, { payload: resPayload, expiresAt: Date.now() + ROUTE_CACHE_TTL_MS }, ROUTE_CACHE_MAX);
    if (!isDemoContext && edgeCache && !testMock) {
      try {
        const toCache = new Response(JSON.stringify(resPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1209600' }
        });
        scheduleWork(opts, edgeCache.put(cacheUrl, toCache));
      } catch (_) {}
    }
  }

  const latestBand = (MONTHLY_USAGE_MEM.snapshot && MONTHLY_USAGE_MEM.snapshot.metrics.routes_compute.band) || routesBand;
  return jsonResponse(Object.assign({}, resPayload, { quotaState: latestBand }), 200, {
    'X-ISABI-Maps-Quota-State': latestBand,
    'X-ISABI-Maps-Quota-Service': 'routes_compute'
  });
}

// ---------------------------------------------------------------------------
// Monthly Map Quota & GCP Budget Sentinel API (GET / POST /app/api/map-usage)
// ---------------------------------------------------------------------------

export async function handleGoogleMapUsage(request, env, body, session, opts = {}) {
  const urlObj = opts.url || new URL(request.url);
  const secFetch = String(request.headers.get('Sec-Fetch-Site') || '').trim().toLowerCase();
  if (secFetch === 'cross-site') {
    return jsonResponse({ ok: false, code: 'cross_site_forbidden', error: 'Cross-site access forbidden.' }, 403);
  }
  const isDemoReq = request.headers.get('X-ISABI-Demo') === '1'
    || (request.method === 'GET' && urlObj.searchParams.get('demo') === '1');

  if (request.method === 'GET') {
    if (!session) {
      if (!isDemoReq) {
        return jsonResponse({ ok: false, error: 'Authentication required' }, 401);
      }
      if (!isSameOriginBrowserRequest(request, urlObj, env)) {
        return jsonResponse({ ok: false, code: 'same_origin_required', error: 'Demo quota read requires same-origin browser request.' }, 403);
      }
    }
    const force = urlObj.searchParams.get('fresh') === '1';
    const snap = await readMapsUsageSnapshot(env, { force });
    const out = session
      ? Object.assign({ ok: true }, snap)
      : Object.assign({ ok: true, demo: true }, snap, {
          gcpBilling: Object.assign({}, snap.gcpBilling, { budgetConfirmedBy: '' })
        });
    return jsonResponse(out, 200, { 'X-ISABI-Maps-Quota-State': snap.overallBand });
  }

  if (request.method === 'POST') {
    if (isDemoReq) {
      return jsonResponse({ ok: false, error: 'Demo sandbox is read-only' }, 403);
    }
    if (!session) {
      return jsonResponse({ ok: false, error: 'Authentication required' }, 401);
    }
    if ((request.headers.get('Origin') || request.headers.get('Referer')) && !isSameOriginBrowserRequest(request, urlObj, env)) {
      return jsonResponse({ ok: false, code: 'same_origin_required', error: 'Cross-origin browser request forbidden.' }, 403);
    }
    if (!isOwnerOrFullGroupSession(session)) {
      return jsonResponse({ ok: false, error: 'Owner permissions required to update Google Cloud budget confirmation.' }, 403);
    }
    if (opts.parseError || !body || typeof body !== 'object') {
      return jsonResponse({ ok: false, code: 'invalid_json', error: 'Malformed JSON body.' }, 400);
    }
    const action = String(body.action || '').trim();
    if (action !== 'confirm_gcp_budget') {
      return jsonResponse({ ok: false, code: 'invalid_action', error: 'Unsupported map-usage action.' }, 400);
    }
    const confirmed = body.confirmed !== false;
    const nowIso = new Date().toISOString();
    const who = String(session.name || session.email || session.sub || 'Owner').slice(0, 80);
    const cfgObj = {
      confirmed,
      project_id: MAPS_GCP_PROJECT_ID,
      billing_account: MAPS_GCP_BILLING_ACCOUNT,
      thresholds_pct: [DEFAULT_QUOTA_THRESHOLDS.warnPct, DEFAULT_QUOTA_THRESHOLDS.tightPct, DEFAULT_QUOTA_THRESHOLDS.fallbackPct],
      updated_at: nowIso,
      updated_by: who
    };
    if (env && env.DB) {
      await env.DB.prepare(
        `INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev)
         VALUES (?1, ?2, ?3, ?4, 1)
         ON CONFLICT(doc_key) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by, rev = edge_kv_store.rev + 1`
      ).bind('gmaps_budget_cfg', JSON.stringify(cfgObj), nowIso, who).run();
    }
    MONTHLY_USAGE_MEM = { month: '', expiresAt: 0, snapshot: null };
    const snap = await readMapsUsageSnapshot(env, { force: true });
    return jsonResponse(Object.assign({ ok: true }, snap), 200, { 'X-ISABI-Maps-Quota-State': snap.overallBand });
  }

  return jsonResponse({ ok: false, code: 'method_not_allowed', error: 'GET or POST required.' }, 405);
}
