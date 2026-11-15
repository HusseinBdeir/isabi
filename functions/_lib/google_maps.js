/**
 * ISABI Systems — Server-Side Google Maps Platform Proxy (2D Map Tiles + Places Search New)
 * Keeps GOOGLE_MAPS_API_KEY strictly in encrypted Cloudflare Edge Secrets.
 * - Tiles are cached in Cloudflare's Edge Cache (caches.default) under an internal key
 *   after verifying an authenticated session (60s isolate cache) or same-origin demo header/param.
 * - Tile sessions are cached per (style, lang) in isolate memory and deduplicated across
 *   concurrent tile bursts.
 */

import {
  checkD1RateLimit,
  checkSlidingRateLimit,
  hashClientIp,
  isSameOriginBrowserRequest,
  jsonResponse,
  verifyActiveEdgeSession
} from './security.js';

const GOOGLE_CREATE_SESSION_URL = 'https://tile.googleapis.com/v1/createSession';
const GOOGLE_TILE_URL_PREFIX = 'https://tile.googleapis.com/v1/2dtiles';
const GOOGLE_PLACES_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText';

const ALLOWED_LANGS = new Set(['en', 'ar', 'fr']);
const STYLE_CONFIG = Object.freeze({
  roadmap: Object.freeze({ mapType: 'roadmap', layerTypes: null, fallbackFormat: 'image/png' }),
  satellite: Object.freeze({ mapType: 'satellite', layerTypes: null, fallbackFormat: 'image/jpeg' }),
  hybrid: Object.freeze({ mapType: 'satellite', layerTypes: ['layerRoadmap'], fallbackFormat: 'image/jpeg' })
});

const MAX_TILE_ZOOM = 20;
const SESSION_CACHE_TTL_MS = 60 * 1000;
const SESSION_CACHE_MAX = 2000;
const TILE_SESSION_REFRESH_BUFFER_SEC = 300;
const PLACES_CACHE_TTL_MS = 5 * 60 * 1000;
const PLACES_CACHE_MAX = 400;

const ACTIVE_SESSION_CACHE = new Map();
const GOOGLE_TILE_SESSIONS = new Map();
const INFLIGHT_TILE_SESSION = new Map();
const PLACES_QUERY_CACHE = new Map();

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

function sanitizeLang(raw) {
  const s = String(raw || 'en').trim().toLowerCase();
  return ALLOWED_LANGS.has(s) ? s : 'en';
}

function sanitizeStyle(raw) {
  const s = String(raw || 'roadmap').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(STYLE_CONFIG, s) ? s : '';
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
      region: 'LB'
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
  if (testMock) {
    if (testMock.failTile) return { ok: false, status: 502 };
    // 1x1 transparent PNG default mock
    const b64 = testMock.tileBytesB64 || 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    return {
      ok: true,
      status: 200,
      contentType: testMock.tileContentType || sessRec.imageFormat || 'image/png',
      bytes: decodeBase64ToBytes(b64)
    };
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
  if (!session) {
    const isDemoTile = urlObj.searchParams.get('demo') === '1' || request.headers.get('X-ISABI-Demo') === '1';
    if (!isDemoTile) {
      return jsonResponse({ ok: false, error: 'Authentication required' }, 401);
    }
    if (!isSameOriginTileBrowser(request, urlObj, env)) {
      return jsonResponse({ ok: false, code: 'same_origin_required', error: 'Demo map tiles require same-origin browser context.' }, 403);
    }
  }

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
        return new Response(cachedResp.body, {
          status: 200,
          headers: {
            'Content-Type': cachedResp.headers.get('Content-Type') || 'image/png',
            'Cache-Control': 'private, max-age=86400',
            'X-Content-Type-Options': 'nosniff',
            'X-ISABI-Tile-Cache': 'HIT'
          }
        });
      }
    }
  } catch (_) {
    edgeCache = null;
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

  if (edgeCache && !testMock) {
    try {
      const toCache = new Response(fetched.bytes, {
        status: 200,
        headers: {
          'Content-Type': fetched.contentType,
          'Cache-Control': 'public, max-age=86400'
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

  return new Response(fetched.bytes, {
    status: 200,
    headers: {
      'Content-Type': fetched.contentType,
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'X-ISABI-Tile-Cache': 'MISS'
    }
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

  const isDemoReq = request.headers.get('X-ISABI-Demo') === '1';
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

  const cacheKey = `${lang}:${rawQuery.toLowerCase()}:${hasBias ? latNum.toFixed(2) : '_'}:${hasBias ? lngNum.toFixed(2) : '_'}`;
  const cached = PLACES_QUERY_CACHE.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return jsonResponse({ ok: true, source: 'google_places_cache', places: cached.places });
  }

  const testMock = parseTestMocks(env);
  const apiKey = resolveGoogleMapsKey(env);
  if (!apiKey && !testMock) {
    return jsonResponse({ ok: false, code: 'maps_not_configured', error: 'Google Places service not configured on edge.' }, 503);
  }

  if (testMock) {
    if (testMock.failPlaces) {
      return jsonResponse({ ok: false, code: 'upstream_places_error', error: 'Places provider unavailable.', places: [] }, 502);
    }
    const normalized = normalizePlacesPayload(testMock.places || []);
    setBoundedMap(PLACES_QUERY_CACHE, cacheKey, { places: normalized, expiresAt: Date.now() + PLACES_CACHE_TTL_MS }, PLACES_CACHE_MAX);
    return jsonResponse({ ok: true, source: 'google_places', places: normalized });
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

  const places = normalizePlacesPayload(data && data.places);
  setBoundedMap(PLACES_QUERY_CACHE, cacheKey, { places, expiresAt: Date.now() + PLACES_CACHE_TTL_MS }, PLACES_CACHE_MAX);
  return jsonResponse({ ok: true, source: 'google_places', places });
}
