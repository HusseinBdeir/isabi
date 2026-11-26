// build/verify_google_maps_edge.mjs - Edge Functions compiler & Google Maps proxy unit/integration gate
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onRequest } from '../functions/app/api/[[route]].js';
import { resetGoogleMapsEdgeCachesForTest } from '../functions/_lib/google_maps.js';
import { signEdgeSession } from '../functions/_lib/security.js';
import { DEPLOYED_SHELL_VER } from '../functions/_lib/deployed_shell.js';

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
      // verifyActiveEdgeSession reads the session row by id (since the seat-preview rule also its method
      // and start time; the sessions of this gate are ordinary sign-ins, so those two stay empty).
      if (/^SELECT\s+id\b[\w\s,]*\s+FROM\s+auth_sessions\s+WHERE\s+id\s*=\s*\?1/i.test(q)) {
        const row = authSessions.get(String(boundArgs[0] || ''));
        return row ? { id: row.id, method: row.method || '', logged_in_at: row.logged_in_at || '' } : null;
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
      if (/SELECT\s+payload_json(?:\s*,\s*rev(?:\s*,\s*updated_at)?)?\s+FROM\s+edge_kv_store\s+WHERE\s+doc_key/i.test(q)) {
        const litM = q.match(/doc_key\s*=\s*'([^']+)'/i);
        const docKey = litM ? litM[1] : String(boundArgs[0] || '');
        const rec = kvStore.get(docKey);
        return rec ? { payload_json: rec.payload_json, rev: rec.rev, updated_at: rec.updated_at } : null;
      }
      if (/SELECT\s+(?:updated_at,\s*payload_json|updated_at|payload_json)\s+FROM\s+alert_rules(?:\s+WHERE\s+id\s*=\s*\?1)?/i.test(q)) {
        const alertRules = kvStore.__alertRules || (kvStore.__alertRules = new Map());
        const rid = boundArgs.length ? String(boundArgs[0] || '') : 'G_MAPS_QUOTA';
        const row = alertRules.get(rid);
        return row ? Object.assign({}, row) : null;
      }
      if (/INSERT\s+INTO\s+edge_kv_store\s*\(\s*doc_key,\s*payload_json,\s*updated_at,\s*updated_by,\s*rev\s*\)\s*VALUES\s*\(\?1,\s*\?2,\s*\?3/i.test(q)) {
        const docKey = String(boundArgs[0] || '');
        const payload = String(boundArgs[1] || '{}');
        const ts = String(boundArgs[2] || '');
        const cur = kvStore.get(docKey);
        const nextRev = cur ? Number(cur.rev || 0) + 1 : 1;
        const rec = { doc_key: docKey, payload_json: payload, updated_at: ts, rev: nextRev };
        kvStore.set(docKey, rec);
        return { rev: nextRev };
      }
      if (/INSERT\s+INTO\s+edge_kv_store/i.test(q)) {
        const docKey = String(boundArgs[0] || '');
        const cur = kvStore.get(docKey);
        const nextRev = cur ? Number(cur.rev || 0) + 1 : 1;
        const rec = { doc_key: docKey, payload_json: String(nextRev), updated_at: String(boundArgs[1] || ''), rev: nextRev };
        kvStore.set(docKey, rec);
        return { rev: nextRev };
      }
      return null;
    },
    async all() {
      const q = String(sql || '').trim();
      const alertRules = kvStore.__alertRules || (kvStore.__alertRules = new Map());
      if (/FROM\s+alert_rules/i.test(q)) {
        if (/WHERE\s+id\s+IN\s*\(/i.test(q)) {
          const want = new Set(boundArgs.map(v => String(v || '')));
          return { results: Array.from(alertRules.values()).filter(r => want.has(r.id)).map(r => Object.assign({}, r)) };
        }
        return { results: Array.from(alertRules.values()).map(r => Object.assign({}, r)) };
      }
      if (/FROM\s+edge_kv_store\s+WHERE\s+doc_key\s*=\s*\?1/i.test(q)) {
        const key = String(boundArgs[0] || '');
        const rec = kvStore.get(key);
        return { results: rec ? [Object.assign({}, rec)] : [] };
      }
      return { results: [] };
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
      if (/INSERT\s+OR\s+REPLACE\s+INTO\s+alert_rules/i.test(q)) {
        const alertRules = kvStore.__alertRules || (kvStore.__alertRules = new Map());
        const aid = String(boundArgs[0] || '');
        alertRules.set(aid, {
          id: aid,
          kind: String(boundArgs[1] || 'override'),
          payload_json: String(boundArgs[2] || '{}'),
          updated_at: String(boundArgs[3] || '')
        });
        return { success: true };
      }
      if (/^DELETE\s+FROM\s+alert_rules/i.test(q)) {
        const alertRules = kvStore.__alertRules || (kvStore.__alertRules = new Map());
        alertRules.delete(String(boundArgs[0] || ''));
        return { success: true };
      }
      if (/^UPDATE\s+edge_kv_store\s+SET\s+payload_json\s*=\s*\?1,\s*updated_at\s*=\s*\?2,\s*rev\s*=\s*rev\s*\+\s*1\s+WHERE\s+doc_key\s*=\s*'geo_config'/i.test(q)) {
        const cur = kvStore.get('geo_config');
        if (!cur || Number(cur.rev ?? 0) !== Number(boundArgs[2] ?? 0)) {
          return { success: true, meta: { changes: 0 } };
        }
        const nextRev = Number(cur.rev ?? 0) + 1;
        kvStore.set('geo_config', {
          doc_key: 'geo_config',
          payload_json: String(boundArgs[0] || '{}'),
          updated_at: String(boundArgs[1] || ''),
          rev: nextRev
        });
        return { success: true, meta: { changes: 1 } };
      }
      if (/^INSERT\s+INTO\s+edge_kv_store\s*\(\s*doc_key,\s*payload_json,\s*updated_at,\s*rev\s*\)\s*VALUES\s*\(\s*'geo_config'/i.test(q)) {
        if (kvStore.has('geo_config')) {
          return { success: true, meta: { changes: 0 } };
        }
        kvStore.set('geo_config', {
          doc_key: 'geo_config',
          payload_json: String(boundArgs[0] || '{}'),
          updated_at: String(boundArgs[1] || ''),
          rev: 1
        });
        return { success: true, meta: { changes: 1 } };
      }
      if (/^UPDATE\s+edge_kv_store\s+SET\s+payload_json/i.test(q)) {
        const key = String(boundArgs[3] || '');
        const cur = kvStore.get(key);
        if (!cur || String(cur.updated_at || '') !== String(boundArgs[4] || '')) {
          return { success: true, meta: { changes: 0 } };
        }
        const nextRev = Number(cur.rev || 1) + 1;
        kvStore.set(key, {
          doc_key: key,
          payload_json: String(boundArgs[0] || '{}'),
          updated_at: String(boundArgs[1] || ''),
          updated_by: String(boundArgs[2] || ''),
          rev: nextRev
        });
        return { success: true, meta: { changes: 1 } };
      }
      if (/^INSERT\s+OR\s+IGNORE\s+INTO\s+edge_kv_store/i.test(q)) {
        const key = String(boundArgs[0] || '');
        if (kvStore.has(key)) {
          return { success: true, meta: { changes: 0 } };
        }
        kvStore.set(key, {
          doc_key: key,
          payload_json: String(boundArgs[1] || '{}'),
          updated_at: String(boundArgs[2] || ''),
          updated_by: String(boundArgs[3] || ''),
          rev: 1
        });
        return { success: true, meta: { changes: 1 } };
      }
      if (/INSERT\s+INTO\s+edge_kv_store/i.test(q)) {
        const docKey = String(boundArgs[0] || '');
        const hasPayload = /payload_json/i.test(q) && !/VALUES\s*\(\?1,\s*'1'/i.test(q);
        const cur = kvStore.get(docKey);
        const nextRev = cur ? Number(cur.rev || 0) + 1 : 1;
        const payload = hasPayload ? String(boundArgs[1] || '{}') : String(nextRev);
        const ts = hasPayload ? String(boundArgs[2] || '') : String(boundArgs[1] || '');
        kvStore.set(docKey, { doc_key: docKey, payload_json: payload, updated_at: ts, rev: nextRev });
        return { success: true };
      }
      return { success: true };
    }
  });

  return {
    authSessions,
    users,
    kvStore,
    alertRules: (kvStore.__alertRules ||= new Map()),
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
  routesCalls: [],
  elevCalls: [],
  osrmCalls: [],
  openMeteoCalls: [],
  routesStatus: 200,
  elevStatus: 'OK',
  failTileStatusOnce: 0,
  failSessionToken: '',
  customElevFn: null
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
  if (urlStr.startsWith('https://routes.googleapis.com/directions/v2:computeRoutes')) {
    let body = {};
    try { body = JSON.parse(String(init.body || '{}')); } catch (_) {}
    mockUpstream.routesCalls.push({ body });
    if (mockUpstream.routesStatus && mockUpstream.routesStatus !== 200) {
      return new Response(JSON.stringify({ error: { code: mockUpstream.routesStatus, message: 'Routes blocked in test' } }), {
        status: mockUpstream.routesStatus,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({
      routes: [
        {
          distanceMeters: 24600,
          duration: '1980s',
          polyline: { encodedPolyline: 'snpmEcrrwEcvEcuMozDotLwnCwaL' }
        }
      ]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (urlStr.startsWith('https://router.project-osrm.org/route/v1/driving/')) {
    mockUpstream.osrmCalls.push({ url: urlStr });
    return new Response(JSON.stringify({
      code: 'Ok',
      routes: [
        {
          distance: 23800,
          duration: 1920,
          geometry: {
            type: 'LineString',
            coordinates: [
              [35.48978, 33.84058],
              [35.565, 33.875],
              [35.635, 33.905],
              [35.702, 33.928]
            ]
          }
        }
      ]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (urlStr.startsWith('https://maps.googleapis.com/maps/api/elevation/json')) {
    const u = new URL(urlStr);
    const locs = String(u.searchParams.get('locations') || '').split('|').filter(Boolean);
    mockUpstream.elevCalls.push({ url: urlStr, count: locs.length });
    if (mockUpstream.elevStatus !== 'OK') {
      return new Response(JSON.stringify({ status: mockUpstream.elevStatus || 'REQUEST_DENIED', results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const base = [45, 130, 275, 420, 490];
    return new Response(JSON.stringify({
      status: 'OK',
      results: locs.map((_, i) => ({
        elevation: typeof mockUpstream.customElevFn === 'function'
          ? mockUpstream.customElevFn(i, locs.length)
          : base[i % base.length]
      }))
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (urlStr.startsWith('https://api.open-meteo.com/v1/elevation')) {
    const u = new URL(urlStr);
    const lats = String(u.searchParams.get('latitude') || '').split(',').filter(Boolean);
    mockUpstream.openMeteoCalls.push({ url: urlStr, count: lats.length });
    const base = [40, 120, 260, 410, 460];
    return new Response(JSON.stringify({
      elevation: lats.map((_, i) => (typeof mockUpstream.customElevFn === 'function' ? mockUpstream.customElevFn(i, lats.length) : base[i % base.length]))
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
  const hdrs = new Headers(Object.assign({ 'X-ISABI-Shell': DEPLOYED_SHELL_VER }, headers));
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

  // 17. Security/cache headers on 200 tile responses (30-day tile cache, owner 2026-11-17), miss and hit paths
  check(
    tSec.headers.get('Cache-Control') === 'private, max-age=2592000'
    && tHit.headers.get('Cache-Control') === 'private, max-age=2592000'
    && tSec.headers.get('X-Content-Type-Options') === 'nosniff',
    '17. Tile response (cache miss and hit) sets Cache-Control: private, max-age=2592000 (30 days) and X-Content-Type-Options: nosniff',
    JSON.stringify({ cc: tSec.headers.get('Cache-Control'), ccHit: tHit.headers.get('Cache-Control'), xcto: tSec.headers.get('X-Content-Type-Options') })
  );

  // 18. POST /app/api/map-route computes Google Routes + DEM climb/grade/heavy-truck ETA and falls back cleanly on upstream 403
  resetGoogleMapsEdgeCachesForTest();
  db.authSessions.set('s_valid', { id: 's_valid', user_id: 'u1', email: 'husseinbdeir@bhfirms.com' });
  mockUpstream.routesStatus = 200;
  mockUpstream.elevStatus = 'OK';
  const rAuth = await callEdge('POST', '/app/api/map-route', {
    body: {
      origin: { lat: 33.84058, lng: 35.48978 },
      destination: { lat: 33.928, lng: 35.702 }
    },
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  mockUpstream.routesStatus = 403;
  mockUpstream.elevStatus = 'REQUEST_DENIED';
  const rFallback = await callEdge('POST', '/app/api/map-route', {
    body: {
      origin: { lat: 33.8101, lng: 35.4951 },
      destination: { lat: 33.8955, lng: 35.6122 }
    },
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  mockUpstream.routesStatus = 200;
  mockUpstream.elevStatus = 'OK';
  check(
    rAuth.status === 200 && rAuth.json && rAuth.json.ok && rAuth.json.source === 'google_routes'
    && rAuth.json.km === 24.6 && rAuth.json.elevGainM > 0 && rAuth.json.maxGradePct > 0
    && rAuth.json.heavyTruckMins > rAuth.json.mins && Array.isArray(rAuth.json.coords) && rAuth.json.coords.length >= 2
    && rFallback.status === 200 && rFallback.json && rFallback.json.ok
    && rFallback.json.source === 'road_dem_verified' && rFallback.json.googleRoutesStatus === 'enable_in_gcp'
    && rFallback.json.elevSource === 'open_meteo_dem' && rFallback.json.elevGainM > 0,
    '18. POST /app/api/map-route computes Google Routes + DEM climb/grade/heavy-truck ETA and falls back cleanly on upstream 403',
    JSON.stringify({
      primaryStatus: rAuth.status,
      primary: rAuth.json && { source: rAuth.json.source, km: rAuth.json.km, elevGainM: rAuth.json.elevGainM, maxGradePct: rAuth.json.maxGradePct, mins: rAuth.json.mins, heavyTruckMins: rAuth.json.heavyTruckMins },
      fallbackStatus: rFallback.status,
      fallback: rFallback.json && { source: rFallback.json.source, elevSource: rFallback.json.elevSource, status: rFallback.json.googleRoutesStatus }
    })
  );

  // 19. GET/POST /app/api/map-usage tracks monthly tiles/places/routes counters and persists gcpBudgetConfigured
  const uGet1 = await callEdge('GET', '/app/api/map-usage?fresh=1', {
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  const uDemoPost = await callEdge('POST', '/app/api/map-usage', {
    body: { action: 'confirm_gcp_budget', confirmed: true },
    headers: { 'X-ISABI-Demo': '1', Origin: 'https://isabisystems.com' }
  });
  const uPostConfirm = await callEdge('POST', '/app/api/map-usage', {
    body: { action: 'confirm_gcp_budget', confirmed: true },
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  const uGet2 = await callEdge('GET', '/app/api/map-usage?fresh=1', {
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  const m1 = uGet1.json && uGet1.json.metrics;
  check(
    uGet1.status === 200 && Boolean(m1) && m1.routes_compute.used >= 1
    && m1.tiles_2d.used >= 1 && m1.places_text.used >= 1
    && uDemoPost.status === 403
    && uPostConfirm.status === 200 && uPostConfirm.json && uPostConfirm.json.gcpBilling.budgetConfirmed === true
    && uGet2.status === 200 && uGet2.json && uGet2.json.gcpBilling.budgetConfirmed === true,
    '19. GET/POST /app/api/map-usage tracks monthly tiles/places/routes counters and persists gcpBudgetConfigured',
    JSON.stringify({
      status: uGet1.status,
      used: m1 && {
        tiles: m1.tiles_2d.used,
        places: m1.places_text.used,
        routes: m1.routes_compute.used
      },
      demoPost: uDemoPost.status,
      confirmed: uGet2.json && uGet2.json.gcpBilling && uGet2.json.gcpBilling.budgetConfirmed
    })
  );

  // 20. >=95% monthly quota guardrail returns 429 osm fallback on /map-tiles and quota_local_fallback on /map-places
  resetGoogleMapsEdgeCachesForTest();
  const curMonthUtc = new Date().toISOString().slice(0, 7);
  db.kvStore.set(`gmaps_cnt:${curMonthUtc}:tiles_2d`, { doc_key: `gmaps_cnt:${curMonthUtc}:tiles_2d`, payload_json: '96000', updated_at: new Date().toISOString(), rev: 96000 });
  db.kvStore.set(`gmaps_cnt:${curMonthUtc}:places_text`, { doc_key: `gmaps_cnt:${curMonthUtc}:places_text`, payload_json: '9600', updated_at: new Date().toISOString(), rev: 9600 });
  const tCutoff = await callEdge('GET', '/app/api/map-tiles/roadmap/en/16/39240/26630', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const placesBeforeCutoff = mockUpstream.placesCalls.length;
  const pCutoff = await callEdge('POST', '/app/api/map-places', {
    body: { query: 'Zouk Mosbeh Quarry', lang: 'en' },
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  db.kvStore.set(`gmaps_cnt:${curMonthUtc}:places_text`, { doc_key: `gmaps_cnt:${curMonthUtc}:places_text`, payload_json: '8200', updated_at: new Date().toISOString(), rev: 8200 });
  resetGoogleMapsEdgeCachesForTest();
  const u82 = await callEdge('GET', '/app/api/map-usage?fresh=1', {
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  check(
    tCutoff.status === 429 && tCutoff.json && tCutoff.json.quotaFallback === 'osm'
    && tCutoff.headers.get('X-ISABI-Maps-Quota-State') === 'fallback_95'
    && pCutoff.status === 200 && pCutoff.json && pCutoff.json.source === 'quota_local_fallback'
    && mockUpstream.placesCalls.length === placesBeforeCutoff
    && u82.status === 200 && u82.json && u82.json.clientPolicy.placesDebounceMs === 1100 && u82.json.clientPolicy.tileProvider === 'osm',
    '20. >=95% monthly quota guardrail returns 429 osm fallback on /map-tiles and quota_local_fallback on /map-places',
    JSON.stringify({
      tStatus: tCutoff.status,
      tJson: tCutoff.json,
      pJson: pCutoff.json,
      u82Policy: u82.json && u82.json.clientPolicy
    })
  );

  // 21. Demo mode does not call Google Routes or increment routes_compute monthly counter, and unauthenticated /map-route returns 401
  resetGoogleMapsEdgeCachesForTest();
  db.kvStore.set(`gmaps_cnt:${curMonthUtc}:tiles_2d`, { doc_key: `gmaps_cnt:${curMonthUtc}:tiles_2d`, payload_json: '10', updated_at: new Date().toISOString(), rev: 10 });
  const rUnauth = await callEdge('POST', '/app/api/map-route', {
    body: { origin: { lat: 33.84058, lng: 35.48978 }, destination: { lat: 33.928, lng: 35.702 } }
  });
  const routesCountBeforeDemo = Number((db.kvStore.get(`gmaps_cnt:${curMonthUtc}:routes_compute`) || {}).rev || 0);
  const gRoutesCallsBeforeDemo = mockUpstream.routesCalls.length;
  const rDemo = await callEdge('POST', '/app/api/map-route', {
    body: { origin: { lat: 33.8511, lng: 35.5011 }, destination: { lat: 33.9411, lng: 35.6511 } },
    headers: { 'X-ISABI-Demo': '1', Origin: 'https://isabisystems.com' }
  });
  const routesCountAfterDemo = Number((db.kvStore.get(`gmaps_cnt:${curMonthUtc}:routes_compute`) || {}).rev || 0);
  check(
    rUnauth.status === 401
    && rDemo.status === 200 && rDemo.json && rDemo.json.ok && rDemo.json.source === 'road_dem_verified'
    && mockUpstream.routesCalls.length === gRoutesCallsBeforeDemo
    && routesCountAfterDemo === routesCountBeforeDemo,
    '21. Demo mode does not increment production routes_compute counter and unauthenticated /map-route returns 401',
    JSON.stringify({ unauth: rUnauth.status, demoSrc: rDemo.json && rDemo.json.source, before: routesCountBeforeDemo, after: routesCountAfterDemo })
  );

  // 22. /app/api/alert_rules RBAC + ind_hsp_06 threshold propagation + immediate usage cache invalidation + bounds clamp
  db.users.set('u_sup', { id: 'u_sup', status: 'Active', email: 'sup@bhfirms.com', role: 'Supervisor', companies: '["WTC"]', pbi_access: '[]', statements_access: '[]', custom_perms: '' });
  db.authSessions.set('s_sup', { id: 's_sup', user_id: 'u_sup', email: 'sup@bhfirms.com' });
  const supToken = await signEdgeSession({
    sid: 's_sup',
    sub: 'u_sup',
    email: 'sup@bhfirms.com',
    role: 'Supervisor',
    companies: '["WTC"]'
  }, env);
  const arSupRes = await callEdge('POST', '/app/api/alert_rules', {
    body: { overrides: { ind_hsp_06: { enabled: true, params: { warn_pct: 40, fallback_pct: 88 }, updated_at: '2026-11-16T01:00:00Z' } } },
    headers: { Authorization: `Bearer ${supToken}`, Origin: 'https://isabisystems.com' }
  });
  const arOwnRes = await callEdge('POST', '/app/api/alert_rules', {
    body: { overrides: { ind_hsp_06: { enabled: true, params: { warn_pct: 40, fallback_pct: 88 }, updated_at: '2026-11-16T01:01:00Z' } } },
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  // Intentional NO ?fresh=1 to verify handleAlertRules invalidated MONTHLY_USAGE_MEM
  const uAfterSibling = await callEdge('GET', '/app/api/map-usage', {
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  const arClampRes = await callEdge('POST', '/app/api/alert_rules', {
    body: { overrides: { ind_hsp_06: { enabled: true, params: { warn_pct: 95, fallback_pct: 60 }, updated_at: '2026-11-16T01:02:00Z' } } },
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  const uAfterClamp = await callEdge('GET', '/app/api/map-usage', {
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  check(
    arSupRes.status === 403
    && arOwnRes.status === 200
    && uAfterSibling.status === 200 && uAfterSibling.json && uAfterSibling.json.thresholds.warnPct === 40 && uAfterSibling.json.thresholds.fallbackPct === 88
    && arClampRes.status === 200
    && uAfterClamp.status === 200 && uAfterClamp.json && uAfterClamp.json.thresholds.warnPct <= 79 && uAfterClamp.json.thresholds.fallbackPct >= 81,
    '22. /app/api/alert_rules enforces Owner-only built-in overrides, propagates ind_hsp_06 with immediate cache invalidation, and clamps bounds',
    JSON.stringify({
      supStatus: arSupRes.status,
      ownStatus: arOwnRes.status,
      afterSibling: uAfterSibling.json && uAfterSibling.json.thresholds,
      afterClamp: uAfterClamp.json && uAfterClamp.json.thresholds
    })
  );
  db.alertRules.clear();
  resetGoogleMapsEdgeCachesForTest();

  // 23. Per-service quota isolation & headers: routes_compute >= 95% does not block 2D tiles (tiles_2d < warn)
  db.kvStore.set(`gmaps_cnt:${curMonthUtc}:tiles_2d`, { doc_key: `gmaps_cnt:${curMonthUtc}:tiles_2d`, payload_json: '10', updated_at: new Date().toISOString(), rev: 10 });
  db.kvStore.set(`gmaps_cnt:${curMonthUtc}:places_text`, { doc_key: `gmaps_cnt:${curMonthUtc}:places_text`, payload_json: '10', updated_at: new Date().toISOString(), rev: 10 });
  db.kvStore.set(`gmaps_cnt:${curMonthUtc}:routes_compute`, { doc_key: `gmaps_cnt:${curMonthUtc}:routes_compute`, payload_json: '9600', updated_at: new Date().toISOString(), rev: 9600 });
  const rSvcRoute = await callEdge('POST', '/app/api/map-route', {
    body: { origin: { lat: 33.831, lng: 35.511 }, destination: { lat: 33.911, lng: 35.621 } },
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  const tSvcOk = await callEdge('GET', '/app/api/map-tiles/roadmap/en/15/19621/13321', {
    headers: { Authorization: `Bearer ${token}` }
  });
  check(
    rSvcRoute.status === 200
    && rSvcRoute.headers.get('X-ISABI-Maps-Quota-Service') === 'routes_compute'
    && rSvcRoute.headers.get('X-ISABI-Maps-Quota-State') === 'fallback_95'
    && tSvcOk.status === 200
    && tSvcOk.headers.get('X-ISABI-Maps-Quota-Service') === 'tiles_2d'
    && tSvcOk.headers.get('X-ISABI-Maps-Quota-State') === 'ok',
    '23. Per-service quota headers emit X-ISABI-Maps-Quota-Service and routes_compute fallback does not block Google 2D tiles',
    JSON.stringify({
      rSvc: rSvcRoute.headers.get('X-ISABI-Maps-Quota-Service'),
      rState: rSvcRoute.headers.get('X-ISABI-Maps-Quota-State'),
      tStatus: tSvcOk.status,
      tSvc: tSvcOk.headers.get('X-ISABI-Maps-Quota-Service'),
      tState: tSvcOk.headers.get('X-ISABI-Maps-Quota-State')
    })
  );

  // 24. Demo tiles/places/routes leave production counters untouched and Demo routes do not poison prod edgeCache
  resetGoogleMapsEdgeCachesForTest();
  db.kvStore.set(`gmaps_cnt:${curMonthUtc}:tiles_2d`, { doc_key: `gmaps_cnt:${curMonthUtc}:tiles_2d`, payload_json: '5', updated_at: new Date().toISOString(), rev: 5 });
  db.kvStore.set(`gmaps_cnt:${curMonthUtc}:places_text`, { doc_key: `gmaps_cnt:${curMonthUtc}:places_text`, payload_json: '5', updated_at: new Date().toISOString(), rev: 5 });
  db.kvStore.set(`gmaps_cnt:${curMonthUtc}:routes_compute`, { doc_key: `gmaps_cnt:${curMonthUtc}:routes_compute`, payload_json: '5', updated_at: new Date().toISOString(), rev: 5 });
  await callEdge('GET', '/app/api/map-tiles/roadmap/en/15/19622/13322?demo=1', { headers: { Origin: 'https://isabisystems.com' } });
  await callEdge('POST', '/app/api/map-places', { body: { query: 'Demo Quarry Test', lang: 'en' }, headers: { 'X-ISABI-Demo': '1', Origin: 'https://isabisystems.com' } });
  const rDemoPair = await callEdge('POST', '/app/api/map-route', {
    body: { origin: { lat: 33.861, lng: 35.521 }, destination: { lat: 33.951, lng: 35.671 } },
    headers: { 'X-ISABI-Demo': '1', Origin: 'https://isabisystems.com' }
  });
  const tAfterDemo = Number((db.kvStore.get(`gmaps_cnt:${curMonthUtc}:tiles_2d`) || {}).rev || 0);
  const pAfterDemo = Number((db.kvStore.get(`gmaps_cnt:${curMonthUtc}:places_text`) || {}).rev || 0);
  const rcAfterDemo = Number((db.kvStore.get(`gmaps_cnt:${curMonthUtc}:routes_compute`) || {}).rev || 0);
  const rProdSamePair = await callEdge('POST', '/app/api/map-route', {
    body: { origin: { lat: 33.861, lng: 35.521 }, destination: { lat: 33.951, lng: 35.671 } },
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  check(
    rDemoPair.status === 200 && rDemoPair.json && rDemoPair.json.source === 'road_dem_verified'
    && tAfterDemo === 5 && pAfterDemo === 5 && rcAfterDemo === 5
    && rProdSamePair.status === 200 && rProdSamePair.json && rProdSamePair.json.source === 'google_routes',
    '24. Demo requests never increment production D1 counters and Demo route cache stays isolated from production',
    JSON.stringify({ tAfterDemo, pAfterDemo, rcAfterDemo, demoSrc: rDemoPair.json?.source, prodSrc: rProdSamePair.json?.source })
  );

  // 25. Finite-vertex elevation bridging handles [50, null, 80] (climb=30) and [null, null] (elevAvailable=false)
  resetGoogleMapsEdgeCachesForTest();
  mockUpstream.customElevFn = (i, n) => (i === 0 ? 50 : (i === n - 1 ? 80 : null));
  const rElevHole = await callEdge('POST', '/app/api/map-route', {
    body: { origin: { lat: 33.871, lng: 35.531 }, destination: { lat: 33.961, lng: 35.681 } },
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  mockUpstream.customElevFn = () => null;
  const rElevAllNull = await callEdge('POST', '/app/api/map-route', {
    body: { origin: { lat: 33.881, lng: 35.541 }, destination: { lat: 33.971, lng: 35.691 } },
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  mockUpstream.customElevFn = null;
  check(
    rElevHole.status === 200 && rElevHole.json && rElevHole.json.elevAvailable === true && rElevHole.json.elevGainM === 30
    && rElevAllNull.status === 200 && rElevAllNull.json && rElevAllNull.json.elevAvailable === false && !rElevAllNull.json.elevGainM,
    '25. Elevation hole bridging computes 30m climb on [50, null, 80] and returns elevAvailable=false on [null, null]',
    JSON.stringify({
      hole: rElevHole.json && { avail: rElevHole.json.elevAvailable, gain: rElevHole.json.elevGainM, grade: rElevHole.json.maxGradePct },
      allNull: rElevAllNull.json && { avail: rElevAllNull.json.elevAvailable, gain: rElevAllNull.json.elevGainM }
    })
  );

  // 26. Viewer seat blocked from /app/api/map-route (403) + /app/api/sync (patch) alertRules invalidates MONTHLY_USAGE_MEM
  db.users.set('u_vw', { id: 'u_vw', status: 'Active', email: 'vw@bhfirms.com', role: 'Viewer', companies: '["WTC"]', pbi_access: '[]', statements_access: '[]', custom_perms: '' });
  db.authSessions.set('s_vw', { id: 's_vw', user_id: 'u_vw', email: 'vw@bhfirms.com' });
  const vwToken = await signEdgeSession({
    sid: 's_vw',
    sub: 'u_vw',
    email: 'vw@bhfirms.com',
    role: 'Viewer',
    companies: '["WTC"]'
  }, env);
  const rVwRoute = await callEdge('POST', '/app/api/map-route', {
    body: { origin: { lat: 33.881, lng: 35.541 }, destination: { lat: 33.971, lng: 35.691 } },
    headers: { Authorization: `Bearer ${vwToken}`, Origin: 'https://isabisystems.com' }
  });
  await callEdge('GET', '/app/api/map-usage?fresh=1', {
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  const syncPatchRes = await callEdge('POST', '/app/api/sync', {
    body: {
      op: 'patch',
      doc: 'mfg_web_store',
      patch: {
        mfg_web_store: {
          minShellVer: DEPLOYED_SHELL_VER,
          alertRules: {
            overrides: {
              G_MAPS_QUOTA: {
                enabled: true,
                params: { warn_pct: 44, fallback_pct: 87 },
                updated_at: '2026-11-16T02:20:00Z'
              }
            },
            custom: []
          }
        }
      }
    },
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  // Intentional NO ?fresh=1 to assert mirrorStoreDeltaToD1Tables invalidated MONTHLY_USAGE_MEM
  const uAfterSync = await callEdge('GET', '/app/api/map-usage', {
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  db.alertRules.clear();
  db.kvStore.delete('mfg_web_store');
  resetGoogleMapsEdgeCachesForTest();
  check(
    rVwRoute.status === 403 && rVwRoute.json && rVwRoute.json.code === 'forbidden_viewer'
    && syncPatchRes.status === 200
    && uAfterSync.status === 200 && uAfterSync.json && uAfterSync.json.thresholds.warnPct === 44 && uAfterSync.json.thresholds.fallbackPct === 87,
    '26. Viewer /app/api/map-route returns 403 and /app/api/sync (patch) alertRules invalidates MONTHLY_USAGE_MEM without ?fresh=1',
    JSON.stringify({
      vwStatus: rVwRoute.status,
      vwCode: rVwRoute.json && rVwRoute.json.code,
      syncStatus: syncPatchRes.status,
      thAfterSync: uAfterSync.json && uAfterSync.json.thresholds
    })
  );

  // 27. /app/api/map-route returns interpolated elevProfileM + /app/api/geo_config validates coordsLngLat & elevProfileM
  const rSamePt = await callEdge('POST', '/app/api/map-route', {
    body: { origin: { lat: 33.89000, lng: 35.50000 }, destination: { lat: 33.89001, lng: 35.50001 } },
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  const profOk = Array.isArray(rElevHole.json && rElevHole.json.elevProfileM)
    && Array.isArray(rElevHole.json && rElevHole.json.coords)
    && rElevHole.json.elevProfileM.length === rElevHole.json.coords.length
    && rElevHole.json.elevProfileM.every(v => typeof v === 'number' && Number.isFinite(v) && v >= -500 && v <= 9000);
  const badElevGeo = await callEdge('POST', '/app/api/geo_config', {
    body: {
      verifiedRoutes: {
        'bu:WTC|site:BadElev': { km: 10, coordsLngLat: [[35.5, 33.8], [35.6, 33.9]], elevProfileM: [-900, 120] }
      }
    },
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  const badCoordsGeo = await callEdge('POST', '/app/api/geo_config', {
    body: {
      verifiedRoutes: {
        'bu:WTC|site:BadCoord': { km: 10, coordsLngLat: [[205, 33.8], [35.6, 33.9]], elevProfileM: [100, 120] }
      }
    },
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  const mismatchElevGeo = await callEdge('POST', '/app/api/geo_config', {
    body: {
      verifiedRoutes: {
        'bu:WTC|site:MismatchElev': { km: 10, coordsLngLat: [[35.5, 33.8], [35.55, 33.85], [35.6, 33.9]], elevProfileM: [100, 120] }
      }
    },
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  const unpairedElevGeo = await callEdge('POST', '/app/api/geo_config', {
    body: {
      verifiedRoutes: {
        'bu:WTC|site:UnpairedElev': { km: 10, elevProfileM: [100, 120] }
      }
    },
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  const rElevRecover = await callEdge('POST', '/app/api/map-route', {
    body: { origin: { lat: 33.881, lng: 35.541 }, destination: { lat: 33.971, lng: 35.691 } },
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  const validGeo = await callEdge('POST', '/app/api/geo_config', {
    body: {
      verifiedRoutes: {
        'bu:WTC|site:ValidElev': { km: 10, coordsLngLat: [[35.5, 33.8], [35.6, 33.9]], elevProfileM: [80, 240] }
      }
    },
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  await callEdge('POST', '/app/api/geo_config', {
    body: { verifiedRoutes: { 'bu:WTC|site:ValidElev': null } },
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });

  // Pre-patch cache upgrade seam: legacy /v2/ and incomplete /v3/ payload missing elevProfileM must be ignored & upgraded
  const stalePairKey = encodeURIComponent('prod:33.88200,35.54200->33.97200,35.69200');
  const staleCacheBody = JSON.stringify({
    ok: true,
    km: 24.6,
    mins: 33,
    heavyTruckMins: 40,
    elevAvailable: true,
    elevGainM: 320,
    elevDropM: 40,
    maxGradePct: 7.5,
    avgClimbGradePct: 4.2,
    coords: [[35.542, 33.882], [35.692, 33.972]]
  });
  await globalThis.caches.default.put(
    `https://isabi-route-cache.internal/v2/${stalePairKey}`,
    new Response(staleCacheBody, { status: 200, headers: { 'Content-Type': 'application/json' } })
  );
  await globalThis.caches.default.put(
    `https://isabi-route-cache.internal/v3/${stalePairKey}`,
    new Response(staleCacheBody, { status: 200, headers: { 'Content-Type': 'application/json' } })
  );
  const rCacheUpgradeMiss = await callEdge('POST', '/app/api/map-route', {
    body: { origin: { lat: 33.882, lng: 35.542 }, destination: { lat: 33.972, lng: 35.692 } },
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  await new Promise(r => setTimeout(r, 40));
  const rCacheUpgradeHit = await callEdge('POST', '/app/api/map-route', {
    body: { origin: { lat: 33.882, lng: 35.542 }, destination: { lat: 33.972, lng: 35.692 } },
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' }
  });
  // Fresh-DB initial geo_config POST must normalize buckets and strip literal null tombstones
  const freshEnv = Object.assign({}, env, { DB: createMockDb() });
  const freshInitPost = await callEdge('POST', '/app/api/geo_config', {
    body: {
      verifiedRoutes: {
        'bu:WTC|site:NullTomb': null,
        'bu:WTC|site:CleanInit': { km: 12, coordsLngLat: [[35.5, 33.8], [35.6, 33.9]], elevProfileM: [90, 210] }
      }
    },
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' },
    envOverride: freshEnv
  });
  const freshInitGet = await callEdge('GET', '/app/api/geo_config', {
    headers: { Authorization: `Bearer ${token}`, Origin: 'https://isabisystems.com' },
    envOverride: freshEnv
  });
  const freshVr = (freshInitGet.json && freshInitGet.json.config && freshInitGet.json.config.verifiedRoutes) || {};
  const freshRaw = freshEnv.DB.kvStore.get('geo_config');
  const freshStoredVr = (freshRaw && JSON.parse(freshRaw.payload_json).verifiedRoutes) || {};
  const freshNullStrippedOk = freshInitPost.status === 200
    && !Object.prototype.hasOwnProperty.call(freshVr, 'bu:WTC|site:NullTomb')
    && !Object.prototype.hasOwnProperty.call(freshStoredVr, 'bu:WTC|site:NullTomb')
    && Boolean(freshVr['bu:WTC|site:CleanInit'] && freshVr['bu:WTC|site:CleanInit'].km === 12);
  check(
    profOk
    && rSamePt.status === 200 && rSamePt.json && rSamePt.json.elevProfileM === null
    && rElevAllNull.json && rElevAllNull.json.elevProfileM === null
    && rElevRecover.status === 200 && rElevRecover.json && rElevRecover.json.elevAvailable === true && Array.isArray(rElevRecover.json.elevProfileM)
    && rCacheUpgradeMiss.status === 200 && rCacheUpgradeMiss.json && rCacheUpgradeMiss.json.cached !== true && Array.isArray(rCacheUpgradeMiss.json.elevProfileM) && rCacheUpgradeMiss.json.elevProfileM.length === rCacheUpgradeMiss.json.coords.length
    && rCacheUpgradeHit.status === 200 && rCacheUpgradeHit.json && rCacheUpgradeHit.json.cached === true && Array.isArray(rCacheUpgradeHit.json.elevProfileM) && rCacheUpgradeHit.json.elevProfileM.length === rCacheUpgradeHit.json.coords.length
    && freshNullStrippedOk
    && badElevGeo.status === 400 && badCoordsGeo.status === 400
    && mismatchElevGeo.status === 400 && unpairedElevGeo.status === 400
    && validGeo.status === 200,
    '27. /app/api/map-route returns paired elevProfileM, rejects stale /v2/ or incomplete /v3/ cache without elevProfileM, and /app/api/geo_config enforces 400',
    JSON.stringify({
      profLen: rElevHole.json && rElevHole.json.elevProfileM && rElevHole.json.elevProfileM.length,
      samePtProf: rSamePt.json && rSamePt.json.elevProfileM,
      recoverAvail: rElevRecover.json && rElevRecover.json.elevAvailable,
      upgradeMissCached: rCacheUpgradeMiss.json && rCacheUpgradeMiss.json.cached,
      upgradeMissHasProf: Boolean(rCacheUpgradeMiss.json && Array.isArray(rCacheUpgradeMiss.json.elevProfileM)),
      upgradeHitCached: rCacheUpgradeHit.json && rCacheUpgradeHit.json.cached,
      upgradeHitHasProf: Boolean(rCacheUpgradeHit.json && Array.isArray(rCacheUpgradeHit.json.elevProfileM)),
      freshNullStrippedOk,
      badElevSt: badElevGeo.status,
      badCoordSt: badCoordsGeo.status,
      mismatchSt: mismatchElevGeo.status,
      unpairedSt: unpairedElevGeo.status,
      validSt: validGeo.status
    })
  );
} finally {
  mockUpstream.customElevFn = null;
  globalThis.fetch = origFetch;
}

const failed = results.filter(r => !r.ok);
console.log(`\nSummary: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
