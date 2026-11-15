// build/verify_google_maps_edge.mjs - Edge Functions compiler & Google Maps proxy unit/integration gate
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onRequest } from '../functions/app/api/[[route]].js';
import { signEdgeSession } from '../functions/_lib/security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const WRANGLER_JS = [
  path.join(os.homedir(), '.local', 'node', 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
  path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
].find(p => fs.existsSync(p));

const NODE_BIN = [
  path.join(os.homedir(), '.local', 'node', 'node.exe'),
  process.execPath
].find(p => fs.existsSync(p));

const results = [];
const pass = (name, detail = '') => {
  results.push({ ok: true, name, detail });
  console.log(`ok    ${name}${detail ? ' :: ' + detail : ''}`);
};
const fail = (name, detail = '') => {
  results.push({ ok: false, name, detail });
  console.log(`FAIL  ${name} :: ${detail}`);
};
const check = (cond, name, detail = '') => (cond ? pass(name, detail) : fail(name, detail));

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);

// 1. Verify Wrangler compiles functions/ bundle cleanly (uses signed esbuild without spawning workerd)
const tmpBuildOut = fs.mkdtempSync(path.join(os.tmpdir(), 'isabi-gmaps-fnbuild-'));
try {
  if (!WRANGLER_JS) throw new Error('wrangler.js not found');
  const buildEnv = Object.assign({}, process.env, { CI: '1', WRANGLER_SEND_METRICS: 'false' });
  delete buildEnv.ELECTRON_RUN_AS_NODE;
  execFileSync(NODE_BIN, [WRANGLER_JS, 'pages', 'functions', 'build', 'functions', '--outdir', tmpBuildOut], {
    cwd: ROOT,
    env: buildEnv,
    stdio: 'pipe',
    windowsHide: true
  });
  pass('1. wrangler pages functions build compiles functions/ with Google Maps proxy cleanly');
} catch (err) {
  fail('1. wrangler pages functions build compiles functions/ with Google Maps proxy cleanly', String(err && err.message || err));
} finally {
  try { fs.rmSync(tmpBuildOut, { recursive: true, force: true }); } catch (_) {}
}

// Install in-memory Cloudflare Cache API (caches.default)
const edgeCacheStore = new Map();
globalThis.caches = {
  default: {
    async match(reqOrUrl) {
      const key = typeof reqOrUrl === 'string' ? reqOrUrl : String(reqOrUrl && reqOrUrl.url || '');
      const hit = edgeCacheStore.get(key);
      return hit ? hit.clone() : undefined;
    },
    async put(reqOrUrl, response) {
      const key = typeof reqOrUrl === 'string' ? reqOrUrl : String(reqOrUrl && reqOrUrl.url || '');
      edgeCacheStore.set(key, response.clone());
    }
  }
};

// In-memory D1 mock supporting auth_sessions, users, and edge_kv_store rate limits
function createMockDb() {
  const authSessions = new Map([
    ['s_valid', { id: 's_valid', user_id: 'u1', email: 'husseinbdeir@bhfirms.com' }]
  ]);
  const users = new Map([
    ['u1', {
      id: 'u1',
      email: 'husseinbdeir@bhfirms.com',
      status: 'Active',
      role: 'Full Access (Owner)',
      companies: 'ALL',
      pbi_access: 'ALL',
      statements_access: 'ALL',
      custom_perms: ''
    }]
  ]);
  const kvStore = new Map();

  const makeStmt = (sql, boundArgs = []) => ({
    bind(...args) {
      return makeStmt(sql, args);
    },
    async first() {
      const q = String(sql || '').trim();
      if (/^SELECT\s+id\s+FROM\s+auth_sessions\s+WHERE\s+id\s*=\s*\?1/i.test(q)) {
        const row = authSessions.get(String(boundArgs[0] || ''));
        return row ? { id: row.id } : null;
      }
      if (/FROM\s+users\s+WHERE\s+id\s*=\s*\?1\s+OR\s+lower\(email\)\s*=\s*\?2/i.test(q)) {
        const sub = String(boundArgs[0] || '');
        const email = String(boundArgs[1] || '').toLowerCase();
        for (const u of users.values()) {
          if (u.id === sub || u.email.toLowerCase() === email) return Object.assign({}, u);
        }
        return null;
      }
      if (/^SELECT\s+1\s+AS\s+ok\s+FROM\s+users\s+LIMIT\s+1/i.test(q)) {
        return users.size > 0 ? { ok: 1 } : null;
      }
      if (/INSERT\s+INTO\s+edge_kv_store/i.test(q)) {
        const docKey = String(boundArgs[0] || '');
        const cur = kvStore.get(docKey);
        const nextRev = cur ? Number(cur.rev || 0) + 1 : 1;
        const rec = { doc_key: docKey, payload_json: '1', updated_at: String(boundArgs[1] || ''), rev: nextRev };
        kvStore.set(docKey, rec);
        return { rev: nextRev };
      }
      return null;
    },
    async run() {
      const q = String(sql || '').trim();
      if (/^DELETE\s+FROM\s+auth_sessions\s+WHERE\s+id\s*=\s*\?1/i.test(q)) {
        authSessions.delete(String(boundArgs[0] || ''));
        return { success: true };
      }
      if (/^DELETE\s+FROM\s+edge_kv_store/i.test(q)) {
        return { success: true };
      }
      return { success: true };
    }
  });

  return {
    authSessions,
    prepare(sql) {
      return makeStmt(sql, []);
    },
    async batch(stmts) {
      const out = [];
      for (const s of stmts || []) out.push(await s.run());
      return out;
    }
  };
}

const mockUpstream = {
  createSessionCalls: [],
  tileCalls: [],
  placesCalls: [],
  failTileStatusOnce: 0,
  failSessionToken: ''
};

const origFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const urlStr = typeof input === 'string' ? input : String(input && input.url || '');
  if (urlStr.startsWith('https://tile.googleapis.com/v1/createSession')) {
    let body = {};
    try { body = JSON.parse(String(init.body || '{}')); } catch (_) {}
    mockUpstream.createSessionCalls.push({ url: urlStr, body });
    const mt = String(body.mapType || 'roadmap');
    const lg = String(body.language || 'en');
    const tok = `up_sess_${mt}_${lg}_${mockUpstream.createSessionCalls.length}`;
    return new Response(JSON.stringify({
      session: tok,
      expiry: String(Math.floor(Date.now() / 1000) + 86400),
      imageFormat: mt === 'satellite' ? 'jpeg' : 'png'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (urlStr.startsWith('https://tile.googleapis.com/v1/2dtiles/')) {
    const u = new URL(urlStr);
    const sessTok = u.searchParams.get('session') || '';
    mockUpstream.tileCalls.push({ pathname: u.pathname, sess: sessTok });
    if (mockUpstream.failSessionToken && sessTok === mockUpstream.failSessionToken) {
      return new Response('session expired', { status: 401 });
    }
    if (mockUpstream.failTileStatusOnce > 0) {
      const st = mockUpstream.failTileStatusOnce;
      mockUpstream.failTileStatusOnce = 0;
      return new Response('session expired', { status: st });
    }
    const isHybrid = String(u.searchParams.get('session') || '').includes('_satellite_');
    return new Response(isHybrid ? JPEG_BYTES : PNG_1X1, {
      status: 200,
      headers: { 'Content-Type': isHybrid ? 'image/jpeg' : 'image/png' }
    });
  }
  if (urlStr.startsWith('https://places.googleapis.com/v1/places:searchText')) {
    let body = {};
    try { body = JSON.parse(String(init.body || '{}')); } catch (_) {}
    const hdrObj = {};
    const h = new Headers(init.headers || {});
    h.forEach((v, k) => { hdrObj[k.toLowerCase()] = v; });
    mockUpstream.placesCalls.push({ headers: hdrObj, body });
    return new Response(JSON.stringify({
      places: [
        {
          id: 'ChIJ_ahed_01',
          displayName: { text: 'Al Ahed Stadium' },
          formattedAddress: 'Airport Rd, Bourj El Brajneh, Beirut',
          location: { latitude: 33.840576, longitude: 35.489775 },
          primaryTypeDisplayName: { text: 'Stadium' }
        }
      ]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return origFetch(input, init);
};

const db = createMockDb();
const env = {
  DB: db,
  ISABI_JWT_SECRET: 'unit-test-jwt-secret-key-32-chars!!', // secret-scan: allow
  GOOGLE_MAPS_API_KEY: 'test-dummy-key-not-real-0001' // secret-scan: allow
};

async function callEdge(method, pathAndQuery, { body = null, headers = {}, envOverride = null } = {}) {
  const fullUrl = `https://isabisystems.com${pathAndQuery}`;
  const urlObj = new URL(fullUrl);
  const routeParts = urlObj.pathname.replace(/^\/app\/api\/?/, '').split('/').filter(Boolean);
  const hdrs = new Headers(headers);
  let reqBody = undefined;
  if (body !== null) {
    reqBody = typeof body === 'string' ? body : JSON.stringify(body);
    if (!hdrs.has('Content-Type')) hdrs.set('Content-Type', 'application/json');
  }
  const request = new Request(fullUrl, { method, headers: hdrs, body: reqBody });
  const waits = [];
  const res = await onRequest({
    request,
    env: envOverride || env,
    params: { route: routeParts },
    waitUntil(p) { waits.push(Promise.resolve(p)); }
  });
  await Promise.all(waits);
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  const text = buf.toString('utf8');
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return { status: res.status, headers: res.headers, buf, text, json };
}

try {
  const token = await signEdgeSession({
    sid: 's_valid',
    sub: 'u1',
    email: 'husseinbdeir@bhfirms.com',
    role: 'Full Access (Owner)',
    companies: 'ALL'
  }, env);

  // 2. Unauthenticated tile -> 401
  const tUnauth = await callEdge('GET', '/app/api/map-tiles/roadmap/en/15/19614/13318');
  check(tUnauth.status === 401, '2. Unauthenticated map tile returns 401', `got ${tUnauth.status}`);

  // 3. Cross-site tile -> 403
  const tCross = await callEdge('GET', '/app/api/map-tiles/roadmap/en/15/19614/13318?demo=1', {
    headers: { 'Sec-Fetch-Site': 'cross-site' }
  });
  check(tCross.status === 403, '3. Cross-site map tile returns 403', `got ${tCross.status}`);

  // 4. Bare demo tile without Origin/Referer/Sec-Fetch-Site -> 403
  const tBare = await callEdge('GET', '/app/api/map-tiles/roadmap/en/15/19614/13318?demo=1');
  check(tBare.status === 403, '4. Bare demo tile without same-origin browser context returns 403', `got ${tBare.status}`);

  // 5. Demo roadmap/en MISS -> HIT + single createSession across concurrent burst
  const sessBeforeBurst = mockUpstream.createSessionCalls.length;
  const burst = await Promise.all([
    callEdge('GET', '/app/api/map-tiles/roadmap/en/15/19614/13318?demo=1', { headers: { Referer: 'https://isabisystems.com/app/' } }),
    callEdge('GET', '/app/api/map-tiles/roadmap/en/15/19614/13319?demo=1', { headers: { Referer: 'https://isabisystems.com/app/' } }),
    callEdge('GET', '/app/api/map-tiles/roadmap/en/15/19615/13318?demo=1', { headers: { Referer: 'https://isabisystems.com/app/' } }),
    callEdge('GET', '/app/api/map-tiles/roadmap/en/15/19615/13319?demo=1', { headers: { Referer: 'https://isabisystems.com/app/' } }),
    callEdge('GET', '/app/api/map-tiles/roadmap/en/15/19616/13318?demo=1', { headers: { Referer: 'https://isabisystems.com/app/' } })
  ]);
  const tHit = await callEdge('GET', '/app/api/map-tiles/roadmap/en/15/19614/13318?demo=1', {
    headers: { Referer: 'https://isabisystems.com/app/' }
  });
  const sessCreatedInBurst = mockUpstream.createSessionCalls.length - sessBeforeBurst;
  check(
    burst.every(r => r.status === 200 && r.headers.get('Content-Type') === 'image/png' && r.headers.get('X-ISABI-Tile-Cache') === 'MISS')
    && tHit.status === 200 && tHit.headers.get('X-ISABI-Tile-Cache') === 'HIT'
    && sessCreatedInBurst === 1,
    '5. Demo roadmap/en MISS -> HIT with single deduplicated createSession across 5-tile burst',
    `burstStatuses=${burst.map(b => b.status).join(',')} hit=${tHit.headers.get('X-ISABI-Tile-Cache')} sessCreated=${sessCreatedInBurst}`
  );

  // 6. Demo tile with Sec-Fetch-Site: same-origin (no Origin/Referer) -> 200
  const tSec = await callEdge('GET', '/app/api/map-tiles/roadmap/en/15/19617/13318?demo=1', {
    headers: { 'Sec-Fetch-Site': 'same-origin' }
  });
  check(tSec.status === 200, '6. Demo tile accepts Sec-Fetch-Site: same-origin without Referer', `got ${tSec.status}`);

  // 7. Authenticated hybrid/ar tile -> 200 JPEG + satellite+layerRoadmap LB payload
  const tHyb = await callEdge('GET', '/app/api/map-tiles/hybrid/ar/15/19614/13318', {
    headers: { 'X-ISABI-Session': token }
  });
  const hybSess = mockUpstream.createSessionCalls[mockUpstream.createSessionCalls.length - 1]?.body || {};
  check(
    tHyb.status === 200
    && tHyb.headers.get('Content-Type') === 'image/jpeg'
    && hybSess.mapType === 'satellite'
    && hybSess.language === 'ar'
    && hybSess.region === 'LB'
    && Array.isArray(hybSess.layerTypes) && hybSess.layerTypes[0] === 'layerRoadmap'
    && hybSess.overlay === false,
    '7. Authenticated hybrid/ar tile returns JPEG and creates satellite+layerRoadmap LB session',
    JSON.stringify(hybSess)
  );

  // 8. Upstream 401 on tile triggers one session refresh and returns 200
  const sessBefore401 = mockUpstream.createSessionCalls.length;
  mockUpstream.failTileStatusOnce = 401;
  const tRetry = await callEdge('GET', '/app/api/map-tiles/hybrid/ar/15/19618/13318', {
    headers: { 'X-ISABI-Session': token }
  });
  check(
    tRetry.status === 200 && mockUpstream.createSessionCalls.length === sessBefore401 + 1,
    '8. Upstream 401 on 2dtiles refreshes Google tile session once and serves 200',
    `status=${tRetry.status} sessDelta=${mockUpstream.createSessionCalls.length - sessBefore401}`
  );

  // 9. Validation & misconfiguration guards
  const tBadZoom = await callEdge('GET', '/app/api/map-tiles/roadmap/en/21/0/0', { headers: { 'X-ISABI-Session': token } });
  const tBadCoord = await callEdge('GET', '/app/api/map-tiles/roadmap/en/1/9/0', { headers: { 'X-ISABI-Session': token } });
  const tPost = await callEdge('POST', '/app/api/map-tiles/roadmap/en/15/19614/13318', { headers: { 'X-ISABI-Session': token } });
  const envNoKey = Object.assign({}, env, { GOOGLE_MAPS_API_KEY: '' });
  const tNoKey = await callEdge('GET', '/app/api/map-tiles/roadmap/en/15/19619/13318', {
    headers: { 'X-ISABI-Session': token },
    envOverride: envNoKey
  });
  check(
    tBadZoom.status === 400 && tBadCoord.status === 400 && tPost.status === 405 && tNoKey.status === 503,
    '9. Tile endpoint enforces zoom<=20 (400), bounds (400), GET-only (405), and missing key (503)',
    JSON.stringify([tBadZoom.status, tBadCoord.status, tPost.status, tNoKey.status])
  );

  // 10. Unauth POST /map-places (valid JSON & malformed JSON) -> both 401
  const pUnauth = await callEdge('POST', '/app/api/map-places', { body: { query: 'Al Ahed' } });
  const pUnauthBad = await callEdge('POST', '/app/api/map-places', { body: '{bad-json' });
  check(
    pUnauth.status === 401 && pUnauthBad.status === 401,
    '10. Unauthenticated /api/map-places returns 401 before JSON validation',
    JSON.stringify([pUnauth.status, pUnauthBad.status])
  );

  // 11. Demo POST /map-places origin checks -> 403
  const pEvil = await callEdge('POST', '/app/api/map-places', {
    body: { query: 'Al Ahed' },
    headers: { 'X-ISABI-Demo': '1', Origin: 'https://evil.example' }
  });
  const pBareSec = await callEdge('POST', '/app/api/map-places', {
    body: { query: 'Al Ahed' },
    headers: { 'X-ISABI-Demo': '1', 'Sec-Fetch-Site': 'same-origin' }
  });
  check(
    pEvil.status === 403 && pBareSec.status === 403,
    '11. Demo /api/map-places blocks cross-origin and bare Sec-Fetch-Site (403)',
    JSON.stringify([pEvil.status, pBareSec.status])
  );

  // 12. Body > 4096 bytes -> 413
  const pBig = await callEdge('POST', '/app/api/map-places', {
    body: JSON.stringify({ query: 'A'.repeat(4200) }),
    headers: { 'X-ISABI-Demo': '1', Origin: 'https://isabisystems.com' }
  });
  check(pBig.status === 413, '12. /api/map-places rejects >4KB payload with 413', `got ${pBig.status}`);

  // 13. Places search with boolean lat/lng omits bias, sends key+fieldMask, normalizes & caches
  const p1 = await callEdge('POST', '/app/api/map-places', {
    body: { query: 'Al Ahed', lang: 'en', lat: true, lng: false },
    headers: { 'X-ISABI-Demo': '1', Origin: 'https://isabisystems.com' }
  });
  const lastPlaceUp = mockUpstream.placesCalls[mockUpstream.placesCalls.length - 1] || {};
  const p2 = await callEdge('POST', '/app/api/map-places', {
    body: { query: 'Al Ahed', lang: 'en' },
    headers: { 'X-ISABI-Demo': '1', Origin: 'https://isabisystems.com' }
  });
  check(
    p1.status === 200
    && p1.json?.source === 'google_places'
    && p1.json?.places?.[0]?.name === 'Al Ahed Stadium'
    && !lastPlaceUp.body?.locationBias
    && lastPlaceUp.headers?.['x-goog-api-key'] === env.GOOGLE_MAPS_API_KEY
    && /places\.location/.test(String(lastPlaceUp.headers?.['x-goog-fieldmask'] || ''))
    && p2.status === 200
    && p2.json?.source === 'google_places_cache',
    '13. Places search omits boolean lat/lng bias, sends server key+fieldMask, and caches repeat query',
    JSON.stringify({ s1: p1.json?.source, s2: p2.json?.source, p0: p1.json?.places?.[0]?.name })
  );

  // 14. Cookie isabi_edge_sess unlocks tiles/places, and logout evicts ACTIVE_SESSION_CACHE immediately
  const cookieHdr = `isabi_edge_sess=${encodeURIComponent(token)}`;
  const tCookie = await callEdge('GET', '/app/api/map-tiles/roadmap/en/15/19620/13318', { headers: { Cookie: cookieHdr } });
  const pCookie = await callEdge('POST', '/app/api/map-places', {
    body: { query: 'Beirut Port', lang: 'fr' },
    headers: { Cookie: cookieHdr, Origin: 'https://isabisystems.com' }
  });
  const logoutRes = await callEdge('POST', '/app/api/auth/logout', {
    headers: { Cookie: cookieHdr, Origin: 'https://isabisystems.com' }
  });
  const tAfterLogout = await callEdge('GET', '/app/api/map-tiles/roadmap/en/15/19621/13318', {
    headers: { Cookie: cookieHdr }
  });
  check(
    tCookie.status === 200 && pCookie.status === 200 && logoutRes.status === 200 && tAfterLogout.status === 401,
    '14. isabi_edge_sess unlocks tiles/places and logout immediately evicts ACTIVE_SESSION_CACHE (401)',
    JSON.stringify([tCookie.status, pCookie.status, logoutRes.status, tAfterLogout.status])
  );

  // 15. Concurrent 6-tile 401 session-refresh burst coalesces into exactly +1 createSession call
  const primeSessRes = await callEdge('GET', '/app/api/map-tiles/roadmap/fr/15/19625/13318?demo=1', {
    headers: { 'Sec-Fetch-Site': 'same-origin' }
  });
  const expiredTok = mockUpstream.tileCalls[mockUpstream.tileCalls.length - 1]?.sess || '';
  const sessBeforeCoalesce = mockUpstream.createSessionCalls.length;
  mockUpstream.failSessionToken = expiredTok;
  const refreshBurst = await Promise.all([
    callEdge('GET', '/app/api/map-tiles/roadmap/fr/15/19626/13318?demo=1', { headers: { 'Sec-Fetch-Site': 'same-origin' } }),
    callEdge('GET', '/app/api/map-tiles/roadmap/fr/15/19627/13318?demo=1', { headers: { 'Sec-Fetch-Site': 'same-origin' } }),
    callEdge('GET', '/app/api/map-tiles/roadmap/fr/15/19628/13318?demo=1', { headers: { 'Sec-Fetch-Site': 'same-origin' } }),
    callEdge('GET', '/app/api/map-tiles/roadmap/fr/15/19629/13318?demo=1', { headers: { 'Sec-Fetch-Site': 'same-origin' } }),
    callEdge('GET', '/app/api/map-tiles/roadmap/fr/15/19630/13318?demo=1', { headers: { 'Sec-Fetch-Site': 'same-origin' } }),
    callEdge('GET', '/app/api/map-tiles/roadmap/fr/15/19631/13318?demo=1', { headers: { 'Sec-Fetch-Site': 'same-origin' } })
  ]);
  mockUpstream.failSessionToken = '';
  const refreshSessDelta = mockUpstream.createSessionCalls.length - sessBeforeCoalesce;
  check(
    primeSessRes.status === 200 && refreshBurst.every(r => r.status === 200) && refreshSessDelta === 1,
    '15. 6 concurrent 401 tile refreshes coalesce into a single createSession upstream call',
    `expiredTok=${expiredTok} statuses=${refreshBurst.map(r => r.status).join(',')} sessDelta=${refreshSessDelta}`
  );

  // 16. Validation guards: query > 120 chars -> 400, negative/non-int tile coords -> 400, invalid style/lang -> 400
  const pTooLong = await callEdge('POST', '/app/api/map-places', {
    body: { query: 'A'.repeat(121), lang: 'en' },
    headers: { 'X-ISABI-Demo': '1', Origin: 'https://isabisystems.com' }
  });
  const tNegCoord = await callEdge('GET', '/app/api/map-tiles/roadmap/en/15/-1/13318?demo=1', {
    headers: { 'Sec-Fetch-Site': 'same-origin' }
  });
  const tNonIntCoord = await callEdge('GET', '/app/api/map-tiles/roadmap/en/15/196.5/13318?demo=1', {
    headers: { 'Sec-Fetch-Site': 'same-origin' }
  });
  const tBadStyle = await callEdge('GET', '/app/api/map-tiles/terrain/en/15/19614/13318?demo=1', {
    headers: { 'Sec-Fetch-Site': 'same-origin' }
  });
  const tBadLang = await callEdge('GET', '/app/api/map-tiles/roadmap/de/15/19614/13318?demo=1', {
    headers: { 'Sec-Fetch-Site': 'same-origin' }
  });
  check(
    pTooLong.status === 400 && tNegCoord.status === 400 && tNonIntCoord.status === 400 && tBadStyle.status === 400 && tBadLang.status === 400,
    '16. Overlength query (>120), negative/non-int tile coords, and invalid style/lang all return 400',
    JSON.stringify([pTooLong.status, tNegCoord.status, tNonIntCoord.status, tBadStyle.status, tBadLang.status])
  );

  // 17. Security/cache headers on 200 tile responses
  check(
    tSec.headers.get('Cache-Control') === 'private, max-age=86400'
    && tSec.headers.get('X-Content-Type-Options') === 'nosniff',
    '17. Tile response sets Cache-Control: private, max-age=86400 and X-Content-Type-Options: nosniff',
    JSON.stringify({ cc: tSec.headers.get('Cache-Control'), xcto: tSec.headers.get('X-Content-Type-Options') })
  );
} finally {
  globalThis.fetch = origFetch;
}

const failed = results.filter(r => !r.ok);
console.log(`\nSummary: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
