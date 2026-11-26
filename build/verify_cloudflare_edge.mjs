// build/verify_cloudflare_edge.mjs - End-to-End Verification for ISABI Option A (Cloudflare Pages + Workers + D1 + R2)
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIN_SYNC_SHELL_VER } from '../functions/_lib/d1_store.js';
import { onRequest as onApiRequest } from '../functions/app/api/[[route]].js';
import { walkShortMapRedirects } from '../functions/_lib/map_link.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8788 + Math.floor(Math.random() * 40);
const DBG = 9640 + Math.floor(Math.random() * 50);

const WRANGLER_JS = [
  path.join(os.homedir(), '.local', 'node', 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
  path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
].find(p => fs.existsSync(p));
if (!WRANGLER_JS) {
  console.error('wrangler.js not found');
  process.exit(2);
}

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].find(p => fs.existsSync(p));
if (!EDGE) {
  console.error('msedge.exe not found');
  process.exit(2);
}

const results = [];
const pass = (name, detail = '') => {
  results.push({ ok: true, name, detail });
  console.log(`ok    ${name}${detail ? ' - ' + detail : ''}`);
};
const fail = (name, detail = '') => {
  results.push({ ok: false, name, detail });
  console.log(`FAIL  ${name} - ${detail}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

function httpReq(method, urlPath, bodyObj = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const rawBody = typeof bodyObj === 'string' ? bodyObj : (bodyObj != null ? JSON.stringify(bodyObj) : null);
    const headers = Object.assign({ 'X-ISABI-Shell': MIN_SYNC_SHELL_VER }, extraHeaders);
    if (Object.prototype.hasOwnProperty.call(extraHeaders, 'X-ISABI-Shell') && extraHeaders['X-ISABI-Shell'] == null) {
      delete headers['X-ISABI-Shell'];
    }
    if (rawBody != null && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(rawBody);
    }
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: urlPath,
      method,
      headers
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const text = buf.toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, text, json, buf });
      });
    });
    req.on('error', reject);
    if (rawBody != null) req.write(rawBody);
    req.end();
  });
}

// Copy local D1 state into an isolated temp persistence dir so verification never mutates .wrangler/state
const tmpPersist = fs.mkdtempSync(path.join(os.tmpdir(), 'isabi-cf-persist-'));
const srcWranglerState = [
  process.env.ISABI_WRANGLER_STATE || '',
  path.join(ROOT, '.wrangler', 'state'),
  path.resolve(ROOT, '..', '..', '..', 'isabi', '.wrangler', 'state'),
  path.resolve(ROOT, '..', '..', 'isabi', '.wrangler', 'state'),
  path.resolve(ROOT, '..', 'isabi', '.wrangler', 'state'),
  path.join(os.homedir(), 'bhfirms', 'isabi', '.wrangler', 'state')
].find(p => p && fs.existsSync(p));
if (srcWranglerState) {
  fs.cpSync(srcWranglerState, tmpPersist, { recursive: true });
}
const tmpBundle = fs.mkdtempSync(path.join(os.tmpdir(), 'isabi-cf-bundle-'));
const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'isabi-cf-edge-'));
const jwtSecret = crypto.randomBytes(32).toString('hex');

const PY_SETUP = [
  path.join(os.homedir(), '.local', 'python312', 'python.exe'),
  'python'
].find(p => p === 'python' || fs.existsSync(p));

// Seed synthetic edge-48 system-topup + Workbook Match fixtures into local D1 SQLite before wrangler spawns
execFileSync(PY_SETUP, [
  '-c',
  `import glob, json, os, sqlite3, sys
d1_root = sys.argv[1]
sqls = glob.glob(os.path.join(d1_root, '**', '*.sqlite'), recursive=True)
if not sqls:
  raise SystemExit('D1 sqlite not found under ' + d1_root)
c = sqlite3.connect(sqls[0])
exp_cols = {r[1] for r in c.execute('PRAGMA table_info(expenses)').fetchall()}
topup_pj = {'id':'exp-e48-topup-bbc','company':'BBConstruction','date':'2026-11-12','amount':95,'notes':'Sync Topup Edge48','voided':True,'voided_by':'system-topup-20261117','voided_at':'2026-11-17T19:48:00Z'}
ins_cols = [k for k in topup_pj if k in exp_cols]
ins_vals = [1 if isinstance(topup_pj[k], bool) and topup_pj[k] else (0 if isinstance(topup_pj[k], bool) else topup_pj[k]) for k in ins_cols]
if 'payload_json' in exp_cols:
  ins_cols.append('payload_json')
  ins_vals.append(json.dumps(topup_pj))
c.execute(f"INSERT OR REPLACE INTO expenses ({','.join(ins_cols)}) VALUES ({','.join('?' for _ in ins_cols)})", ins_vals)
for bk, rid, pj in [
  ('mfg_sites', 'dom-e48-topup-bbc', {'id':'dom-e48-topup-bbc','ind':'Manufacturing','company':'BBConstruction','name':'E48 Topup Dom','voided':True,'voided_by':'system-topup-20261117','voided_at':'2026-11-17T19:48:00Z','rev':1})
]:
  c.execute("INSERT OR REPLACE INTO industry_custom_rows (bucket, row_id, company, rev, voided, updated_at, payload_json) VALUES (?,?,?,?,?,?,?)", (bk, rid, 'BBConstruction', 1, 1, '2026-11-17T19:48:00Z', json.dumps(pj)))
for ek, pj in [
  ('Manufacturing::Sites::E48-TOPUP', {'ind':'Manufacturing','tableTitle':'Sites','primaryId':'E48-TOPUP','company':'BBConstruction','voided':True,'voided_by':'system-topup-20261117','voided_at':'2026-11-17T19:48:00Z','rev':1})
]:
  c.execute("INSERT OR REPLACE INTO industry_row_edits (edit_key, rev, voided, updated_at, payload_json) VALUES (?,?,?,?,?)", (ek, 1, 1, '2026-11-17T19:48:00Z', json.dumps(pj)))
# edge-26c: two seat-preview session rows, one started 13 hours ago (as a preview left from before the 12-hour rule) and one just now
import datetime as _dt
_now = _dt.datetime.now(_dt.timezone.utc)
for sid, started in [('sess-e26c-old-preview', _now - _dt.timedelta(hours=13)), ('sess-e26c-fresh-preview', _now)]:
  c.execute("INSERT OR REPLACE INTO auth_sessions (id, user_id, email, full_name, role, companies, device, logged_in_at, method, confidence) VALUES (?,?,?,?,?,?,?,?,?,?)", (sid, 'u1', 'husseinbdeir@bhfirms.com', 'Edge 26c', 'Full Access (Owner)', 'All', 'Gate', started.strftime('%Y-%m-%d %H:%M:%S'), 'Owner Impersonation', 100))
c.commit()
c.close()`,
  path.join(tmpPersist, 'v3', 'd1')
], { cwd: ROOT, stdio: 'inherit', windowsHide: true });
execFileSync(PY_SETUP, [path.join(ROOT, 'build', 'stage_pages_bundle.py'), tmpBundle], {
  cwd: ROOT,
  stdio: 'inherit',
  windowsHide: true
});

const NODE_BIN = [
  path.join(os.homedir(), '.local', 'node', 'node.exe'),
  process.execPath
].find(p => fs.existsSync(p));
const wranglerEnv = {};
for (const [ek, ev] of Object.entries(process.env)) {
  if (!/^electron_run_as_node$/i.test(ek)) wranglerEnv[ek] = ev;
}
wranglerEnv.CI = '1';
wranglerEnv.WRANGLER_SEND_METRICS = 'false';

// Populate local R2 `isabi-vault/seeds/seed_*.json` for Phase 1B authenticated seed gating
const appJsSrcDir = [
  path.resolve(ROOT, '..', 'isabi-app', 'js'),
  path.resolve(ROOT, '..', '..', 'isabi-app', 'js'),
  path.join(os.homedir(), 'bhfirms', 'isabi-app', 'js')
].find(p => fs.existsSync(path.join(p, 'seed_core.json'))) || path.resolve(ROOT, '..', 'isabi-app', 'js');
const TEST_SEATS_PATH = path.resolve(appJsSrcDir, '..', 'build', 'test_seats.json');
const TEST_SEATS = fs.existsSync(TEST_SEATS_PATH) ? JSON.parse(fs.readFileSync(TEST_SEATS_PATH, 'utf8')) : {};
const ENTRY_TEST_EMAIL = String(process.env.ISABI_TEST_ENTRY_EMAIL || TEST_SEATS.entry_email || 'entry@example.invalid').trim();
for (const kind of ['core', 'records', 'industries']) {
  const seedFile = path.join(appJsSrcDir, `seed_${kind}.json`);
  if (fs.existsSync(seedFile)) {
    execFileSync(NODE_BIN, [
      WRANGLER_JS,
      'r2', 'object', 'put',
      `isabi-vault/seeds/seed_${kind}.json`,
      `--file=${seedFile}`,
      '--content-type=application/json',
      '--local',
      '--persist-to', tmpPersist
    ], {
      cwd: ROOT,
      env: wranglerEnv,
      stdio: 'ignore',
      windowsHide: true
    });
  }
}

const E43_MAP_LINK_MOCKS = {
  'https://maps.app.goo.gl/edge1hop': {
    status: 302,
    location: 'https://www.google.com/maps?q=33.8938,35.5018'
  },
  'https://maps.app.goo.gl/edge3hop1': { status: 302, location: 'https://maps.app.goo.gl/edge3hop2' },
  'https://maps.app.goo.gl/edge3hop2': { status: 302, location: 'https://goo.gl/maps/edge3hop3' },
  'https://goo.gl/maps/edge3hop3': {
    status: 302,
    location: 'https://www.google.com/maps?q=34.1234,35.6512'
  },
  'https://maps.app.goo.gl/edgeLoop1': { status: 302, location: 'https://maps.app.goo.gl/edgeLoop2' },
  'https://maps.app.goo.gl/edgeLoop2': { status: 302, location: 'https://maps.app.goo.gl/edgeLoop3' },
  'https://maps.app.goo.gl/edgeLoop3': { status: 302, location: 'https://maps.app.goo.gl/edgeLoop4' },
  'https://maps.app.goo.gl/edgeLoop4': { status: 302, location: 'https://maps.app.goo.gl/edgeLoop5' },
  'https://maps.app.goo.gl/edgePriv': { status: 302, location: 'https://127.0.0.1/admin' }
};

const E45_GMAPS_MOCKS = {
  places: [
    {
      id: 'ChIJ_edge_ahed',
      displayName: { text: 'Al Ahed Stadium' },
      formattedAddress: 'Airport Rd, Beirut',
      location: { latitude: 33.840576, longitude: 35.489775 },
      primaryTypeDisplayName: { text: 'Stadium' }
    }
  ]
};

const wranglerProc = spawn(NODE_BIN, [
  WRANGLER_JS,
  'pages', 'dev', tmpBundle,
  '--ip', '127.0.0.1',
  '--port', String(PORT),
  '--persist-to', tmpPersist,
  '--r2', 'BUCKET=isabi-vault',
  '-b', `ISABI_JWT_SECRET=${jwtSecret}`,
  '-b', 'VT_TEST_FIXTURE=1',
  '-b', `ISABI_TEST_MAP_LINK_MOCKS=${JSON.stringify(E43_MAP_LINK_MOCKS)}`,
  '-b', `ISABI_TEST_GMAPS_MOCKS=${JSON.stringify(E45_GMAPS_MOCKS)}`,
  '--live-reload=false'
], {
  cwd: ROOT,
  env: wranglerEnv,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
});

let wranglerLog = '';
wranglerProc.stdout.on('data', d => { wranglerLog += d.toString(); });
wranglerProc.stderr.on('data', d => { wranglerLog += d.toString(); });

const edgeProc = spawn(EDGE, [
  '--headless=new', '--enable-automation', '--disable-ipc-flooding-protection',
  `--remote-debugging-port=${DBG}`, `--user-data-dir=${udd}`,
  '--no-first-run', '--disable-gpu', '--window-size=1366,768', 'about:blank'
], { stdio: 'ignore', windowsHide: true });

function killTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch (_) {}
}

let ws = null;
let msgId = 0;
const pending = new Map();
function sendCdp(method, params = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }
    }, timeoutMs);
    pending.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalJs(expression) {
  const r = await sendCdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r && r.exceptionDetails) {
    throw new Error(r.exceptionDetails.text || 'Runtime.evaluate exception');
  }
  return r && r.result ? r.result.value : undefined;
}

async function main() {
  try {
    // Wait for Wrangler Pages Dev server (up to 90 s: on a PC busy with other suites the local server
    // compiled in seconds but took longer than the old 24 s to start listening)
    let ready = false;
    for (let i = 0; i < 300; i++) {
      try {
        const r = await httpReq('GET', '/api/health');
        if (r.status === 200 && r.json && r.json.ok) {
          ready = true;
          break;
        }
      } catch (_) {}
      await sleep(300);
    }
    if (!ready) {
      throw new Error(`Wrangler Pages Dev failed to start on :${PORT}\n${wranglerLog.slice(-1500)}`);
    }

    // 1. Showcase /api/health + _headers X-ISABI-Edge
    const hRes = await httpReq('GET', '/api/health');
    const mRes = await httpReq('HEAD', '/manifest.json');
    if (hRes.status === 200 && hRes.json?.edge === true && hRes.json?.d1 === true && hRes.json?.r2 === true && mRes.headers['x-isabi-edge'] === '1') {
      pass('edge-01-showcase-health', `d1=${hRes.json.d1} r2=${hRes.json.r2} x-isabi-edge=${mRes.headers['x-isabi-edge']}`);
    } else {
      fail('edge-01-showcase-health', JSON.stringify({ status: hRes.status, body: hRes.json, hdr: mRes.headers['x-isabi-edge'] }));
    }

    // 2. Command Center /app/api/status (anon omits row counts) & HMAC-SHA256 JWT + HttpOnly Cookie
    const stRes = await httpReq('GET', '/app/api/status');
    const badLogin = await httpReq('POST', '/app/api/auth/login', { email: 'husseinbdeir@bhfirms.com', pin: '9999', method: 'PIN' });
    const ownerLogin = await httpReq('POST', '/app/api/auth/login', { email: 'husseinbdeir@bhfirms.com', pin: '1111', method: 'PIN', device: 'Verify Suite' });
    const entryLogin = await httpReq('POST', '/app/api/auth/login', { email: ENTRY_TEST_EMAIL, pin: '3333', method: 'PIN', device: 'Verify Suite' });
    const ownerToken = ownerLogin.json?.token || '';
    const entryToken = entryLogin.json?.token || '';
    const setCookieHdr = String(ownerLogin.headers['set-cookie'] || '');
    const meRes = await httpReq('GET', '/app/api/auth/me', null, { 'X-ISABI-Session': ownerToken });
    const stOwnerRes = await httpReq('GET', '/app/api/status', null, { 'X-ISABI-Session': ownerToken });
    const cnt = stOwnerRes.json?.counts || {};
    if (stRes.status === 200 && stRes.json?.ok && stRes.json?.d1_ready && stRes.json?.r2_ready && stRes.json?.counts === undefined && Number(cnt.sales_tickets) >= 26553 && Number(cnt.raw_purchases) >= 24826 && Number(cnt.users) >= 16) {
      pass('edge-02-app-status-d1-seeded', `anon counts=undefined; Owner sales=${cnt.sales_tickets} raw=${cnt.raw_purchases} users=${cnt.users}`);
    } else {
      fail('edge-02-app-status-d1-seeded', JSON.stringify({ anon: stRes.json, owner: stOwnerRes.json }).slice(0, 350));
    }

    if (badLogin.status === 401 && ownerLogin.status === 200 && ownerToken && setCookieHdr.includes('isabi_edge_sess=') && setCookieHdr.includes('HttpOnly') && entryLogin.status === 200 && entryToken && meRes.json?.authenticated === true) {
      pass('edge-03-auth-hmac-jwt-pin', `401 bad PIN, HttpOnly cookie + HMAC JWT verified for Owner & Entry`);
    } else {
      fail('edge-03-auth-hmac-jwt-pin', JSON.stringify({ bad: badLogin.status, owner: ownerLogin.status, entry: entryLogin.status, cookie: setCookieHdr, me: meRes.json }));
    }

    // 4. Server-Side BU Row-Level Security (Read Isolation)
    const rlsForbiddenRead = await httpReq('GET', '/app/api/records?table=sales_tickets&company=BBConstruction&limit=5', null, { 'X-ISABI-Session': entryToken });
    const rlsAllowedRead = await httpReq('GET', '/app/api/records?table=sales_tickets&company=WTC&limit=5', null, { 'X-ISABI-Session': entryToken });
    const ownerCrossRead = await httpReq('GET', '/app/api/records?table=sales_tickets&company=BBConstruction&limit=5', null, { 'X-ISABI-Session': ownerToken });
    if (rlsForbiddenRead.status === 403 && rlsAllowedRead.status === 200 && (rlsAllowedRead.json?.rows || []).length === 5 && ownerCrossRead.status === 200 && (ownerCrossRead.json?.rows || []).length === 5) {
      pass('edge-04-bu-rls-read-isolation', `WTC Entry -> BBC=403, WTC=200(5); Owner -> BBC=200(5)`);
    } else {
      fail('edge-04-bu-rls-read-isolation', JSON.stringify({ f: rlsForbiddenRead.status, a: rlsAllowedRead.status, o: ownerCrossRead.status }));
    }

    // 5. Server-Side BU RLS Write Isolation + Demo Sandbox Guard
    const rlsForbiddenWrite = await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: 'test-rls-deny-1', company: 'Blanca', date: '2026-11-08', name: 'Unauthorized Resort Expense', total_usd: 50 }
    }, { 'X-ISABI-Session': entryToken });
    const demoForbiddenWrite = await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: 'test-demo-deny-1', company: 'WTC', date: '2026-11-08', name: 'Demo Blocked Expense', total_usd: 50 }
    }, { 'X-ISABI-Session': ownerToken, 'X-ISABI-Demo': '1' });
    const validWriteId = 'test-edge-wtc-' + Date.now();
    const allowedWrite = await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: validWriteId, company: 'WTC', date: '2026-11-08', name: 'Edge Verified Expense', total_usd: 125.5, voided: false }
    }, { 'X-ISABI-Session': entryToken });
    const voidWithoutReason400 = await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: validWriteId, company: 'WTC', voided: true }
    }, { 'X-ISABI-Session': ownerToken });
    const voidWithReason200 = await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: validWriteId, company: 'WTC', voided: true, void_reason: 'Edge cleanup void' }
    }, { 'X-ISABI-Session': ownerToken });
    if (
      rlsForbiddenWrite.status === 403 && demoForbiddenWrite.status === 403 && allowedWrite.status === 200 && allowedWrite.json?.ok
      && voidWithoutReason400.status === 400 && voidWithoutReason400.json?.code === 'void_reason_required'
      && voidWithReason200.status === 200
    ) {
      pass('edge-05-bu-rls-write-and-demo-guard', `Cross-BU write=403, Demo write=403, Authorized WTC write=200, Backdated void w/o reason=400, w/ reason=200`);
    } else {
      fail('edge-05-bu-rls-write-and-demo-guard', JSON.stringify({ cross: rlsForbiddenWrite.status, demo: demoForbiddenWrite.status, ok: allowedWrite.status, vr400: [voidWithoutReason400.status, voidWithoutReason400.json], vr200: voidWithReason200.status }));
    }

    // 6. Seat Security: Unauthenticated /app/api/users=401 + Authenticated PIN stripping + Entry privilege-escalation block
    const anonUsers = await httpReq('GET', '/app/api/users');
    const ownerUsers06 = await httpReq('GET', '/app/api/users', null, { 'X-ISABI-Session': ownerToken });
    const anyLeakedPin = (ownerUsers06.json?.users || []).some(u => u && u.pin_code);
    const entryEscalate = await httpReq('POST', '/app/api/users', {
      user: { id: 'u1', email: 'husseinbdeir@bhfirms.com', full_name: 'Hussein Bdeir', role: 'Full Access (Owner)', pin_code: '4918' }
    }, { 'X-ISABI-Session': entryToken });
    if (anonUsers.status === 401 && !anonUsers.json?.users && ownerUsers06.status === 200 && (ownerUsers06.json?.users || []).length >= 16 && !anyLeakedPin && entryEscalate.status === 403) {
      pass('edge-06-users-seat-security', `Anon /users=401, Owner /users PINs redacted (0 leaked), Entry -> Owner seat edit=403`);
    } else {
      fail('edge-06-users-seat-security', JSON.stringify({ anon: anonUsers.status, ownerStatus: ownerUsers06.status, leaked: anyLeakedPin, escalate: entryEscalate.status }));
    }

    // 7. Multi-Device CAS Sync (`mfg_web_store`)
    const syncGet = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const mfgStore = syncGet.json?.docs?.mfg_web_store || {};
    const syncConflict = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: '1999-01-01T00:00:00.000Z',
      patch: { mfg_web_store: { minShellVer: MIN_SYNC_SHELL_VER, updatedAt: new Date().toISOString() } }
    }, { 'X-ISABI-Session': ownerToken });
    if (syncGet.status === 200 && Array.isArray(mfgStore.users) && mfgStore.users.length >= 16 && syncConflict.status === 200 && syncConflict.json?.conflict === true) {
      pass('edge-07-sync-cas-and-mfg-store', `mfg_web_store users=${mfgStore.users.length}, stale CAS conflict=true`);
    } else {
      fail('edge-07-sync-cas-and-mfg-store', JSON.stringify({ status: syncGet.status, users: mfgStore.users?.length, conflict: syncConflict.json?.conflict }));
    }

    // 8. Cloudflare R2 Binary Vault Round-Trip (`/app/api/blobs`)
    const tinyPngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const blobId = 'att-edge-test-' + Date.now();
    const blobPut = await httpReq('POST', '/app/api/blobs', { id: blobId, company: 'WTC', dataUrl: tinyPngDataUrl }, { 'X-ISABI-Session': ownerToken });
    const blobGetJson = await httpReq('GET', `/app/api/blobs?id=${encodeURIComponent(blobId)}`, null, { 'X-ISABI-Session': ownerToken });
    const blobGetBin = await httpReq('GET', `/app/api/blobs?id=${encodeURIComponent(blobId)}&raw=1`, null, { 'X-ISABI-Session': ownerToken });
    if (blobPut.status === 200 && blobPut.json?.storage === 'r2' && blobGetJson.json?.dataUrl === tinyPngDataUrl && String(blobGetBin.headers['content-type'] || '').includes('image/png') && blobGetBin.buf.length > 40) {
      pass('edge-08-r2-vault-blob-roundtrip', `storage=${blobPut.json.storage} bytes=${blobGetBin.buf.length}`);
    } else {
      fail('edge-08-r2-vault-blob-roundtrip', JSON.stringify({ put: blobPut.json, jsonOk: blobGetJson.json?.ok, ct: blobGetBin.headers['content-type'] }));
    }

    // 9. Cross-Network Phone QR Scan via D1 + R2 (`/app/api/phone-scan`)
    const psSid = 'ps' + Date.now();
    const psTok = 'tok' + Math.random().toString(36).slice(2, 10);
    await httpReq('POST', '/app/api/phone-scan', {
      sid: psSid,
      k: psTok,
      status: 'waiting'
    }, { 'X-ISABI-Session': ownerToken });
    const psPush = await httpReq('POST', '/app/api/phone-scan', {
      sid: psSid,
      k: psTok,
      pages: [{ id: 'pg1', mimeType: 'image/png', dataUrl: tinyPngDataUrl }]
    });
    const psWrongTok = await httpReq('GET', `/app/api/phone-scan?sid=${psSid}&k=wrongtok`);
    const psPoll = await httpReq('GET', `/app/api/phone-scan?sid=${psSid}&k=${psTok}`);
    await httpReq('POST', '/app/api/phone-scan', { sid: psSid, k: psTok, op: 'clear' });
    if (psPush.status === 200 && psPush.json?.pageCount === 1 && psWrongTok.json?.found === false && psPoll.json?.found === true && psPoll.json?.session?.pages?.[0]?.dataUrl === tinyPngDataUrl) {
      pass('edge-09-phone-scan-r2-d1-handoff', `R2 page hydrated & token-isolated`);
    } else {
      fail('edge-09-phone-scan-r2-d1-handoff', JSON.stringify({ push: psPush.json, wrong: psWrongTok.json, poll: psPoll.json }));
    }

    // 10. Showcase Leads & Anonymized Ask Telemetry (`/api/leads`, `/api/log`)
    const leadRes = await httpReq('POST', '/api/leads', {
      name: 'Edge Verify Executive',
      company: 'Test Holding Group',
      industry: 'Holding',
      scale: '15 Seats',
      contact: '+96170000000',
      notes: 'Option A Cloudflare D1 lead capture check',
      lang: 'en'
    });
    const logRes = await httpReq('POST', '/api/log', {
      surface: 'showcase',
      lang: 'en',
      industry: 'holding',
      q: 'How fast is implementation?',
      replyTitle: '1 to 2 Weeks'
    });
    if (leadRes.status === 200 && leadRes.json?.stored === true && logRes.status === 200 && logRes.json?.ok === true) {
      pass('edge-10-showcase-leads-and-logs', `stored lead & ask_log in D1`);
    } else {
      fail('edge-10-showcase-leads-and-logs', JSON.stringify({ lead: leadRes.json, log: logRes.json }));
    }

    // Connect CDP to Headless Edge for Browser E2E Verification
    let targets = null;
    for (let i = 0; i < 40; i++) {
      try {
        targets = await new Promise((resolve, reject) => {
          http.get(`http://127.0.0.1:${DBG}/json/list`, res => {
            let b = '';
            res.on('data', c => b += c);
            res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
          }).on('error', reject);
        });
        if (Array.isArray(targets) && targets.length) break;
      } catch (_) {}
      await sleep(200);
    }
    const pageTarget = (targets || []).find(t => t.type === 'page');
    if (!pageTarget) throw new Error('No headless Edge page target');

    ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const consoleErrors = [];
    const msCloudRequests = [];
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data.toString());
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        consoleErrors.push(msg.params?.exceptionDetails?.text || 'exception');
      } else if (msg.method === 'Log.entryAdded' && msg.params?.entry?.level === 'error') {
        const u = msg.params?.entry?.url || '';
        if (!u.includes('favicon')) consoleErrors.push(`${msg.params.entry.text} (${u})`);
      } else if (msg.method === 'Network.requestWillBeSent') {
        const reqUrl = String(msg.params?.request?.url || '');
        if (/powerplatform\.com|logic\.azure\.com|dynamics\.com/i.test(reqUrl)) {
          msCloudRequests.push(reqUrl);
        }
      }
    };

    await sendCdp('Page.enable');
    await sendCdp('Runtime.enable');
    await sendCdp('Log.enable');
    await sendCdp('Network.enable');

    // 11. Browser E2E: Public Showcase on Wrangler Pages Dev
    await sendCdp('Page.addScriptToEvaluateOnNewDocument', {
      source: `try { localStorage.setItem('isabi_edge_active_v1', '1'); } catch (_) {}`
    });
    await httpReq('GET', '/').catch(() => null);
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    for (let i = 0; i < 80; i++) {
      const rdy11 = await evalJs(`Boolean(window.ISABI_I18N && document.querySelector('h1'))`).catch(() => false);
      if (rdy11) break;
      await sleep(250);
    }
    await sleep(300);
    const sboxProbe = await evalJs(`(() => ({
      edgeFlag: Boolean(window.ISABI_HAS_EDGE_API),
      h1: (document.querySelector('h1')?.textContent || '').trim().replace(/\\s+/g, ' '),
      i18nAr: window.ISABI_I18N ? window.ISABI_I18N.auditDom(document.body, 'ar').count : -1,
      i18nFr: window.ISABI_I18N ? window.ISABI_I18N.auditDom(document.body, 'fr').count : -1
    }))()`);
    if (sboxProbe && sboxProbe.edgeFlag === true && sboxProbe.h1.includes('The ERP Your Group') && sboxProbe.i18nAr === 0 && sboxProbe.i18nFr === 0 && consoleErrors.length === 0) {
      pass('edge-11-browser-showcase-e2e', `ISABI_HAS_EDGE_API=true, 0 console errors, 0 missing AR/FR`);
    } else {
      fail('edge-11-browser-showcase-e2e', JSON.stringify({ sboxProbe, consoleErrors }));
    }

    // 12. Browser E2E: Command Center `/app/` on Wrangler Pages Dev (Zero Microsoft Runtime Calls)
    consoleErrors.length = 0;
    msCloudRequests.length = 0;
    await sendCdp('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.__ISABI_TEST_EDGE = true; try { localStorage.setItem('isabi_edge_active_v1', '1'); } catch (_) {}`
    });
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/app/?demo=1&autologin=1` });
    for (let i = 0; i < 30; i++) {
      const rdy = await evalJs(`Boolean(window.MFG_SEED && window.MFG_SEED._recordsReady && document.querySelector('#workspace'))`);
      if (rdy) break;
      await sleep(300);
    }
    await sleep(900);
    const appProbe = await evalJs(`(async () => {
      const st = await fetch('./api/status').then(r => r.json());
      return {
        edgeFlag: Boolean(window.ISABI_HAS_EDGE_API),
        ver: window.__MFG_SHELL_VER,
        statusOk: Boolean(st && st.ok && st.edge),
        wsLen: (document.getElementById('workspace')?.innerText || '').length
      };
    })()`);
    if (appProbe && appProbe.edgeFlag === true && typeof appProbe.ver === 'string' && appProbe.ver.startsWith('19.') && appProbe.statusOk === true && appProbe.wsLen > 200 && msCloudRequests.length === 0 && consoleErrors.length === 0) {
      pass('edge-12-browser-command-center-e2e', `ver=${appProbe.ver}, edge=true, msCloudCalls=0, consoleErrors=0`);
    } else {
      fail('edge-12-browser-command-center-e2e', JSON.stringify({ appProbe, msCloudRequests, consoleErrors }));
    }

    // 13. Canonical Index-Seek (`company = ?1`), `manufacturing-group` RLS, & Adversarial Empty/Substring Scope Blocks
    const mintTestJwt = (claims) => {
      const nowSec = Math.floor(Date.now() / 1000);
      const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
      const hdr = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const pld = b64u(JSON.stringify(Object.assign({}, claims, { iat: nowSec, exp: nowSec + 3600, iss: 'isabi-edge-v1' })));
      const sig = b64u(crypto.createHmac('sha256', jwtSecret).update(`${hdr}.${pld}`).digest());
      return `${hdr}.${pld}.${sig}`;
    };
    await httpReq('POST', '/app/api/users', {
      user: {
        id: 'u-empty-rls',
        email: 'empty@bhfirms.com',
        full_name: 'Empty Scope Seat',
        role: 'Entry',
        companies: '',
        pin_code: '4919',
        status: 'Active'
      }
    }, { 'X-ISABI-Session': ownerToken });
    const emptyCoLogin = await httpReq('POST', '/app/api/auth/login', {
      email: 'empty@bhfirms.com',
      pin: '4919',
      method: 'PIN'
    });
    const emptyCoToken = String(emptyCoLogin.json?.token || '');
    const wtcLower = await httpReq('GET', '/app/api/records?table=sales_tickets&company=wtc&limit=5', null, { 'X-ISABI-Session': entryToken });
    const wtcCanon = await httpReq('GET', '/app/api/records?table=sales_tickets&company=WTC&limit=5', null, { 'X-ISABI-Session': entryToken });
    const mfgGrpEntry = await httpReq('GET', '/app/api/records?table=sales_tickets&company=manufacturing-group&limit=10', null, { 'X-ISABI-Session': entryToken });
    const negEmptyCompanies = await httpReq('GET', '/app/api/records?table=sales_tickets&company=all&limit=5', null, { 'X-ISABI-Session': emptyCoToken });
    const negSubstringCo = await httpReq('GET', '/app/api/records?table=sales_tickets&company=w&limit=5', null, { 'X-ISABI-Session': entryToken });
    const lowerIds = (wtcLower.json?.rows || []).map(r => r.id).join(',');
    const canonIds = (wtcCanon.json?.rows || []).map(r => r.id).join(',');
    const mfgGrpAllWtc = (mfgGrpEntry.json?.rows || []).length === 10 && (mfgGrpEntry.json?.rows || []).every(r => r.company === 'WTC');
    if (
      wtcLower.status === 200 &&
      wtcCanon.status === 200 &&
      (wtcLower.json?.rows || []).length === 5 &&
      lowerIds === canonIds &&
      mfgGrpAllWtc &&
      negEmptyCompanies.status === 403 &&
      negSubstringCo.status === 403
    ) {
      pass('edge-13-canonical-index-seek-and-rls-scope-guards', `wtc===WTC(5), mfg-group WTC-only(10), empty-companies=403, substring-co=403`);
    } else {
      fail('edge-13-canonical-index-seek-and-rls-scope-guards', JSON.stringify({
        wtcLower: wtcLower.status, wtcCanon: wtcCanon.status, sameIds: lowerIds === canonIds,
        mfgGrpAllWtc, negEmpty: negEmptyCompanies.status, negSub: negSubstringCo.status
      }));
    }

    // 14. Adversarial Write Blocks: Cross-BU Existing ID Overwrite, Blank-Company Write, & `company='All'` Write
    const bbcSeedFetch = await httpReq('GET', '/app/api/records?table=sales_tickets&company=BBConstruction&limit=1', null, { 'X-ISABI-Session': ownerToken });
    const bbcRow = (bbcSeedFetch.json?.rows || [])[0] || {};
    const bbcId = String(bbcRow.id || 'st0');
    const negOverwriteBbc = await httpReq('POST', '/app/api/records', {
      table: 'sales_tickets',
      record: { id: bbcId, company: 'WTC', date: '2026-11-08', total: 1 }
    }, { 'X-ISABI-Session': entryToken });
    const negBlankCoWrite = await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: 'test-blank-co-' + Date.now(), company: '', date: '2026-11-08', name: 'Unscoped Expense', amount: 15 }
    }, { 'X-ISABI-Session': entryToken });
    const negAllCoWrite = await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: 'test-all-co-' + Date.now(), company: 'All', date: '2026-11-08', name: 'All-Scope Bypass Attempt', amount: 15 }
    }, { 'X-ISABI-Session': entryToken });
    if (negOverwriteBbc.status === 403 && negBlankCoWrite.status === 403 && negAllCoWrite.status === 403) {
      pass('edge-14-adversarial-rls-write-blocks', `cross-BU id overwrite(${bbcId})=403, blank-co=403, company=All=403`);
    } else {
      fail('edge-14-adversarial-rls-write-blocks', JSON.stringify({
        bbcId, overwrite: negOverwriteBbc.status, blank: negBlankCoWrite.status, allCo: negAllCoWrite.status
      }));
    }

    // 15. Dirty-Row-Only `mirrorStoreDeltaToD1Tables` (Full 95-Row Diff Without Rev Bump + Removal Void + Lateral Sync RLS Guard)
    const baseSync = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const baseDoc = JSON.parse(JSON.stringify(baseSync.json?.docs?.mfg_web_store || {}));
    const baseExpenses = Array.isArray(baseDoc.customRecords?.expenses) ? baseDoc.customRecords.expenses : [];
    const batch95 = [];
    for (let i = 0; i < 95; i++) {
      batch95.push({
        id: `exp-dirty-diff-${i}`,
        company: 'WTC',
        date: '2026-11-08',
        code: `EXP-CODE-${i}`,
        name: `Dirty Diff Expense ${i}`,
        amount: 10 + i,
        rev: 1,
        updated_at: '2026-11-08T10:00:00.000Z'
      });
    }
    batch95.push({
      id: 'ex_a1b2c3d4e5f6',
      company: 'WTC',
      date: '2026-11-08',
      code: 'EXP-STABLE-SEED-OVR',
      name: 'Stable Seed Override Protected From Void',
      amount: 42,
      rev: 1,
      updated_at: '2026-11-08T10:00:00.000Z'
    });
    const docStep1 = Object.assign({}, baseDoc, {
      updatedAt: new Date(Date.now() + 1000).toISOString(),
      customRecords: Object.assign({}, baseDoc.customRecords || {}, {
        expenses: [...batch95, ...baseExpenses]
      })
    });
    const syncStep1 = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: String(baseDoc.updatedAt || ''),
      awaitMirror: true,
      patch: { mfg_web_store: Object.assign({}, docStep1, { minShellVer: MIN_SYNC_SHELL_VER }) }
    }, { 'X-ISABI-Session': ownerToken });

    // Step 2: Modify ONLY index #0 (outside old `.slice(-80)` window!) WITHOUT bumping `rev` or `updated_at`
    const docStep2 = JSON.parse(JSON.stringify(docStep1));
    docStep2.updatedAt = new Date(Date.now() + 2000).toISOString();
    docStep2.customRecords.expenses[0].code = 'EXP-MODIFIED-CODE-999';
    docStep2.customRecords.expenses[0].name = 'Modified Without Rev Bump';
    const syncStep2 = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: String(syncStep1.json?.updatedAt || ''),
      awaitMirror: true,
      patch: { mfg_web_store: Object.assign({}, docStep2, { minShellVer: MIN_SYNC_SHELL_VER }) }
    }, { 'X-ISABI-Session': ownerToken });
    const checkExpAfterEdit = await httpReq('GET', '/app/api/records?table=expenses&company=WTC&limit=400', null, { 'X-ISABI-Session': ownerToken });
    const row0InD1 = (checkExpAfterEdit.json?.rows || []).find(r => r.id === 'exp-dirty-diff-0');

    // Step 3 (Adversarial Lateral Sync RLS): Entry seat tries to overwrite BBC `bbcId`, inject `Blanca` expense, & escalate own role in `users`
    const docTamper = JSON.parse(JSON.stringify(docStep2));
    docTamper.updatedAt = new Date(Date.now() + 3000).toISOString();
    docTamper.customRecords.sales_tickets = [
      { id: bbcId, company: 'WTC', date: '2026-11-08', total: 0.01 },
      ...(Array.isArray(docTamper.customRecords.sales_tickets) ? docTamper.customRecords.sales_tickets : [])
    ];
    docTamper.customRecords.expenses.push({ id: 'exp-tamper-blanca', company: 'Blanca', date: '2026-11-08', amount: 9999 });
    if (Array.isArray(docTamper.users)) {
      docTamper.users = docTamper.users.map(u =>
        String(u.email || '').toLowerCase() === ENTRY_TEST_EMAIL.toLowerCase()
          ? Object.assign({}, u, { role: 'Full Access (Owner)', companies: 'All' })
          : u
      );
    }
    const syncTamper = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: String(syncStep2.json?.updatedAt || ''),
      awaitMirror: true,
      patch: { mfg_web_store: Object.assign({}, docTamper, { minShellVer: MIN_SYNC_SHELL_VER }) }
    }, { 'X-ISABI-Session': entryToken });
    const checkBbcUntouched = await httpReq('GET', '/app/api/records?table=sales_tickets&company=BBConstruction&limit=5', null, { 'X-ISABI-Session': ownerToken });
    const bbcStillIntact = (checkBbcUntouched.json?.rows || []).some(r => r.id === bbcId && r.company === 'BBConstruction' && Number(r.total) === Number(bbcRow.total));
    const postTamperStore = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const ptDoc = postTamperStore.json?.docs?.mfg_web_store || {};
    const entrySeat = (ptDoc.users || []).find(u => String(u.email || '').toLowerCase() === ENTRY_TEST_EMAIL.toLowerCase());
    const blancaInjected = (ptDoc.customRecords?.expenses || []).some(r => r.id === 'exp-tamper-blanca');

    // Step 4: Hard-remove `exp-dirty-diff-0` AND stable-seed override `ex_a1b2c3d4e5f6` from `customRecords.expenses`;
    // assert D1 voids `exp-dirty-diff-0` while `POS_SEED_ID_RE` protects `ex_a1b2c3d4e5f6` from being voided!
    const docStep4 = JSON.parse(JSON.stringify(ptDoc));
    docStep4.updatedAt = new Date(Date.now() + 4000).toISOString();
    docStep4.customRecords.expenses = (docStep4.customRecords.expenses || []).filter(r => r.id !== 'exp-dirty-diff-0' && r.id !== 'ex_a1b2c3d4e5f6');
    const syncStep4 = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: String(syncTamper.json?.updatedAt || ''),
      awaitMirror: true,
      patch: { mfg_web_store: Object.assign({}, docStep4, { minShellVer: MIN_SYNC_SHELL_VER }) }
    }, { 'X-ISABI-Session': ownerToken });
    const checkExpAfterVoid = await httpReq('GET', '/app/api/records?table=expenses&company=WTC&limit=400', null, { 'X-ISABI-Session': ownerToken });
    const row0Voided = (checkExpAfterVoid.json?.rows || []).find(r => r.id === 'exp-dirty-diff-0');
    const seedOvrRow = (checkExpAfterVoid.json?.rows || []).find(r => r.id === 'ex_a1b2c3d4e5f6');

    const ms2 = syncStep2.json?.mirrorStats || {};
    const ms4 = syncStep4.json?.mirrorStats || {};
    if (
      ms2.upsertedRecords === 1 &&
      ms2.skippedRecords >= 94 &&
      row0InD1?.code === 'EXP-MODIFIED-CODE-999' &&
      bbcStillIntact &&
      !blancaInjected &&
      entrySeat &&
      !String(entrySeat.role || '').includes('Owner') &&
      ms4.voidedRemoved >= 1 &&
      row0Voided?.voided === true &&
      seedOvrRow &&
      !seedOvrRow.voided
    ) {
      pass(
        'edge-15-dirty-row-only-sync-void-and-lateral-rls',
        `1 dirty upserted / ${ms2.skippedRecords} skipped (idx #0 code persisted), lateral BBC/Blanca/role tamper blocked, removed row voided`
      );
    } else {
      fail('edge-15-dirty-row-only-sync-void-and-lateral-rls', JSON.stringify({
        ms2, row0Code: row0InD1?.code, bbcStillIntact, blancaInjected, entryRole: entrySeat?.role, ms4, voided: row0Voided?.voided
      }));
    }

    // 16. Python SHA-256 Delta Manifest (0 Unchanged Writes, Code-Edit Upsert, Vanished-Row DELETE, Composite PK) & Dual-Store Union-Merge
    const pyBin = [
      path.join(os.homedir(), '.local', 'python312', 'python.exe'),
      'python'
    ].find(p => p === 'python' || fs.existsSync(p));
    const pyScript = `
import json, pathlib, shutil, sqlite3, sys, tempfile
sys.path.insert(0, r"${path.join(ROOT, 'build').replace(/\\/g, '\\\\')}")
import export_d1_seed as eds

def live(doc):
    # stands in for a live Edge pull: the export only writes the store from a head it just pulled
    def _f(offline=False):
        eds._LIVE_EDGE_HEAD_TS = str(doc.get("updatedAt") or "")
        eds._STORE_RUN_ID = eds.new_store_run_id()
        return doc
    return _f

tmp = pathlib.Path(tempfile.mkdtemp(prefix="isabi-d1-delta-test-"))
try:
    dbp = tmp / "mini.db"
    man = tmp / "manifest.json"
    out = tmp / "batches"
    conn = sqlite3.connect(str(dbp))
    conn.execute("CREATE TABLE sales_tickets (id TEXT PRIMARY KEY, company TEXT, date TEXT, ticket_no TEXT, customer TEXT, total REAL, voided INTEGER)")
    conn.execute("INSERT INTO sales_tickets VALUES ('st0', 'wtc', '2026-11-08', '1001', 'Alpha Co', 250.0, 0)")
    conn.execute("INSERT INTO sales_tickets VALUES ('st1', 'BBConstruction', '2026-11-07', '1002', 'Beta Co', 500.0, 0)")
    conn.commit()
    conn.close()

    # Monkeypatch fetch_live_cloud_store for deterministic isolated testing
    eds_orig_fetch = eds.fetch_live_cloud_store
    store_v1 = {
        "updatedAt": "2026-11-08T10:00:00.000Z",
        "industryCustomRows": {"hosp_folios": [{"id": "fol-1", "code": "F-100", "company": "blanca", "rev": 1}]}
    }
    eds.fetch_live_cloud_store = live(store_v1)

    # Run 1: Full seed + promote manifest
    files1, meta1 = eds.export_all(delta=True, manifest_path=man, db_path=dbp, out_dir=out)
    assert meta1["delta_mode"] is False and meta1["emitted_upserts"] == 4, f"run1: {meta1}"
    eds.promote_pending_manifest(out_dir=out, manifest_path=man)

    # Run 2: Identical state -> 0 SQL statements, 0 batch files!
    files2, meta2 = eds.export_all(delta=True, manifest_path=man, db_path=dbp, out_dir=out)
    assert meta2["delta_mode"] is True and len(files2) == 0 and meta2["emitted_upserts"] == 0 and meta2["emitted_deletes"] == 0, f"run2: {meta2}"

    # Run 3: Modify code/customer on st0 in SQLite + delete st1 + vanish industryCustomRows fol-1
    conn = sqlite3.connect(str(dbp))
    conn.execute("UPDATE sales_tickets SET ticket_no = '1001-MOD', customer = 'Alpha Modified' WHERE id = 'st0'")
    conn.execute("DELETE FROM sales_tickets WHERE id = 'st1'")
    conn.commit()
    conn.close()
    store_v2 = {"updatedAt": "2026-11-08T10:05:00.000Z", "industryCustomRows": {"hosp_folios": []}}
    eds.fetch_live_cloud_store = live(store_v2)
    files3, meta3 = eds.export_all(delta=True, manifest_path=man, db_path=dbp, out_dir=out)
    sql3 = "\\n".join(f.read_text(encoding="utf-8") for f in files3)
    assert meta3["emitted_upserts"] == 2, f"expected st0 + mfg_web_store upserts, got {meta3}"
    assert meta3["emitted_deletes"] == 2, f"expected st1 + composite industry_custom_rows deletes, got {meta3}"
    assert "1001-MOD" in sql3 and "'WTC'" in sql3, "canonicalized WTC + modified code missing"
    assert "DELETE FROM sales_tickets WHERE id = 'st1';" in sql3, f"missing st1 delete: {sql3}"
    assert "DELETE FROM industry_custom_rows WHERE bucket = 'hosp_folios' AND row_id = 'fol-1';" in sql3, f"missing composite delete: {sql3}"

    # Run 3b: Stable content-derived seed IDs (st_<12hex>) — deleting 3 middle rows emits ONLY 3 deletes & 0 cascade upserts,
    # and >= 10 vanished single-PK rows collapse into compact WHERE id IN (...) statement(s).
    dbp_s = tmp / "mfg_stable.db"
    man_s = tmp / "manifest_stable.json"
    out_s = tmp / "batches_stable"
    conn_s = sqlite3.connect(str(dbp_s))
    conn_s.executescript("""
        CREATE TABLE companies (key TEXT PRIMARY KEY, name TEXT, code TEXT);
        CREATE TABLE sales_tickets (id TEXT PRIMARY KEY, name TEXT, ticket_no TEXT, date TEXT, company TEXT, customer TEXT, total REAL);
        CREATE TABLE users (id TEXT PRIMARY KEY, full_name TEXT, email TEXT, pin_code TEXT, role TEXT, companies TEXT, status TEXT, face_samples TEXT, face_thumbs TEXT, face_required INTEGER, face_updated_at TEXT);
    """)
    for idx_t in range(25):
        sid = f"st_{idx_t:012x}"
        conn_s.execute(
            "INSERT INTO sales_tickets VALUES (?, ?, ?, '2026-11-08', 'WTC', 'Alpha', ?)",
            (sid, f"SALE {idx_t}", str(2000 + idx_t), float(100 + idx_t)),
        )
    conn_s.commit()
    conn_s.close()
    eds.fetch_live_cloud_store = live({"updatedAt": "2026-11-08T10:00:00.000Z"})
    eds.export_all(delta=True, manifest_path=man_s, db_path=dbp_s, out_dir=out_s)
    eds.promote_pending_manifest(out_dir=out_s, manifest_path=man_s)

    # Delete 3 middle rows -> 3 deletes, 0 upserts!
    conn_s = sqlite3.connect(str(dbp_s))
    for drop_i in (4, 11, 19):
        conn_s.execute("DELETE FROM sales_tickets WHERE id = ?", (f"st_{drop_i:012x}",))
    conn_s.commit()
    conn_s.close()
    files_3del, meta_3del = eds.export_all(delta=True, manifest_path=man_s, db_path=dbp_s, out_dir=out_s)
    assert meta_3del["emitted_deletes"] == 3 and meta_3del["emitted_upserts"] == 0, f"expected 3 deletes & 0 upserts, got {meta_3del}"
    eds.promote_pending_manifest(out_dir=out_s, manifest_path=man_s)

    # Delete 12 more rows -> 12 deletes collapsed into 1 IN (...) statement, 0 upserts!
    conn_s = sqlite3.connect(str(dbp_s))
    for drop_i in (0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 12, 13):
        conn_s.execute("DELETE FROM sales_tickets WHERE id = ?", (f"st_{drop_i:012x}",))
    conn_s.commit()
    conn_s.close()
    files_12del, meta_12del = eds.export_all(delta=True, manifest_path=man_s, db_path=dbp_s, out_dir=out_s)
    sql_12del = "\\n".join(f.read_text(encoding="utf-8") for f in files_12del)
    assert meta_12del["emitted_deletes"] == 12 and meta_12del["emitted_upserts"] == 0, f"expected 12 deletes & 0 upserts, got {meta_12del}"
    assert "DELETE FROM sales_tickets WHERE id IN (" in sql_12del, f"expected batched IN delete: {sql_12del}"

    # Run 3c: Legacy positional override auto-upgrade in export_d1_seed.py (void, edit, & split expense_items -i1/-i2 without duplicate positional rows)
    dbp_u = tmp / "mfg_upgrade.db"
    man_u = tmp / "manifest_upgrade.json"
    out_u = tmp / "batches_upgrade"
    conn_u = sqlite3.connect(str(dbp_u))
    conn_u.executescript("""
        CREATE TABLE companies (key TEXT PRIMARY KEY, name TEXT, code TEXT);
        CREATE TABLE sales_tickets (id TEXT PRIMARY KEY, name TEXT, ticket_no TEXT, date TEXT, company TEXT, customer TEXT, total REAL);
        CREATE TABLE expenses (id TEXT PRIMARY KEY, name TEXT, date TEXT, company TEXT, supplier TEXT, category TEXT, amount REAL, equipment TEXT);
        CREATE TABLE expense_items (id TEXT PRIMARY KEY, expense_id TEXT, date TEXT, company TEXT, item TEXT, total REAL);
        CREATE TABLE users (id TEXT PRIMARY KEY, full_name TEXT, email TEXT, pin_code TEXT, role TEXT, companies TEXT, status TEXT, face_samples TEXT, face_thumbs TEXT, face_required INTEGER, face_updated_at TEXT);
    """)
    conn_u.execute("INSERT INTO sales_tickets VALUES ('st_000000000000', 'SALE U0', '3000', '2026-11-08', 'WTC', 'Alpha', 250.0)")
    conn_u.execute("INSERT INTO sales_tickets VALUES ('st_000000000001', 'SALE U1', '3001', '2026-11-08', 'WTC', 'Beta', 400.0)")
    conn_u.execute("INSERT INTO expenses VALUES ('ex_000000000001', 'EXP U1', '2026-11-08', 'WTC', 'FuelCo', 'Maintenance', 180.0, '')")
    conn_u.commit()
    conn_u.close()
    (tmp / "industry_legacy_id_map.json").write_text(
        json.dumps({"MEM-2025-001": "MEM-2025-a1b2c3d4e5", "AGR-001": "AGR-2026-f1e2d3c4b5"}),
        encoding="utf-8",
    )
    eds.fetch_live_cloud_store = live({
        "updatedAt": "2026-11-08T10:20:00.000Z",
        "industryRowEdits": {
            "Hospitality & Resorts::Memberships Register::MEM-2025-001": {
                "primaryId": "MEM-2025-001", "cells": ["MEM-2025-001", "Gold"], "rev": 2, "updated_at": "2026-11-08T10:18:00Z"
            },
            "WF::hsp_memberships::MEM-2025-001": {"status": "Paid", "rev": 2, "updated_at": "2026-11-08T10:19:00Z"}
        },
        "industryCustomRows": {
            "hsp_memberships": [{"id": "MEM-2025-001", "status": "Paid", "rev": 2, "updated_at": "2026-11-08T10:19:00Z"}],
            "ins_agreements": [{"id": "AGR-NEW-9", "autoClosePriorIds": ["AGR-001"], "rev": 1, "updated_at": "2026-11-08T10:19:30Z"}]
        },
        "customRecords": {
            "sales_tickets": [
                {
                    "id": "st99", "name": "SALE U0", "ticket_no": "3000", "date": "2026-11-08", "company": "WTC", "customer": "Alpha",
                    "total": 250.0, "voided": True, "voided_at": "2026-11-08T10:15:00Z",
                    "_seed_orig": {"id": "st99", "name": "SALE U0", "ticket_no": "3000", "date": "2026-11-08", "company": "WTC", "customer": "Alpha", "total": 250.0}
                },
                {
                    "id": "st98", "name": "SALE U1", "ticket_no": "3001", "date": "2026-11-08", "company": "WTC", "customer": "Beta",
                    "total": 777.0, "modified_at": "2026-11-08T10:16:00Z",
                    "_seed_orig": {"id": "st98", "name": "SALE U1", "ticket_no": "3001", "date": "2026-11-08", "company": "WTC", "customer": "Beta", "total": 400.0}
                }
            ],
            "expenses": [
                {
                    "id": "ex99", "name": "EXP U1", "date": "2026-11-08", "company": "WTC", "supplier": "FuelCo", "category": "Maintenance",
                    "amount": 180.0, "equipment": "TRK-09", "modified_at": "2026-11-08T10:17:00Z",
                    "_seed_orig": {"id": "ex99", "name": "EXP U1", "date": "2026-11-08", "company": "WTC", "supplier": "FuelCo", "category": "Maintenance", "amount": 180.0}
                }
            ],
            "expense_items": [
                {"id": "ex99-i1", "expense_id": "ex99", "date": "2026-11-08", "company": "WTC", "item": "Filter", "total": 100.0},
                {"id": "ex99-i2", "expense_id": "ex99", "date": "2026-11-08", "company": "WTC", "item": "Gasket", "total": 80.0}
            ]
        }
    })
    files_u, _meta_u = eds.export_all(delta=False, manifest_path=man_u, db_path=dbp_u, out_dir=out_u)
    sql_u = "\\n".join(f.read_text(encoding="utf-8") for f in files_u)
    d1_u = sqlite3.connect(str(tmp / "d1_upgrade_check.db"))
    d1_u.executescript(eds.SCHEMA_SQL.read_text(encoding="utf-8"))
    for f_u in files_u:
        d1_u.executescript(f_u.read_text(encoding="utf-8"))
    st_u_rows = {r[0]: (r[1], r[2]) for r in d1_u.execute("SELECT id, total, voided FROM sales_tickets").fetchall()}
    assert "st99" not in st_u_rows and "st98" not in st_u_rows, f"leaked positional sales_tickets into D1: {st_u_rows}"
    assert st_u_rows.get("st_000000000000") == (250.0, 1), f"legacy void failed to upgrade onto st_000000000000: {st_u_rows}"
    assert st_u_rows.get("st_000000000001") == (777.0, 0), f"legacy edit failed to upgrade onto st_000000000001: {st_u_rows}"
    ei_u_rows = {r[0]: r[1] for r in d1_u.execute("SELECT id, expense_id FROM expense_items").fetchall()}
    assert ei_u_rows == {"ex_000000000001-i1": "ex_000000000001", "ex_000000000001-i2": "ex_000000000001"}, f"split expense_items upgrade mismatch: {ei_u_rows}"
    kv_u_raw = d1_u.execute("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'mfg_web_store'").fetchone()[0]
    kv_u_doc = json.loads(kv_u_raw)
    assert "expenses:ex99" in (kv_u_doc.get("_purgedOverrideIds") or []), f"missing expenses:ex99 in _purgedOverrideIds: {kv_u_doc.get('_purgedOverrideIds')}"
    assert "sales_tickets:st99" in (kv_u_doc.get("_purgedOverrideIds") or []) and "sales_tickets:st98" in (kv_u_doc.get("_purgedOverrideIds") or []), "missing st99/st98 in _purgedOverrideIds"
    ire_keys = {r[0] for r in d1_u.execute("SELECT edit_key FROM industry_row_edits").fetchall()}
    assert ire_keys == {
        "Hospitality & Resorts::Memberships Register::MEM-2025-a1b2c3d4e5",
        "WF::hsp_memberships::MEM-2025-a1b2c3d4e5",
    }, f"industry_row_edits failed to upgrade: {ire_keys}"
    icr_rows = {(r[0], r[1]): json.loads(r[2]) for r in d1_u.execute("SELECT bucket, row_id, payload_json FROM industry_custom_rows").fetchall()}
    assert ("hsp_memberships", "MEM-2025-a1b2c3d4e5") in icr_rows and ("hsp_memberships", "MEM-2025-001") not in icr_rows, f"industry_custom_rows upgrade mismatch: {icr_rows}"
    assert icr_rows[("ins_agreements", "AGR-NEW-9")]["autoClosePriorIds"] == ["AGR-2026-f1e2d3c4b5"], f"autoClosePriorIds failed to upgrade: {icr_rows}"
    assert "WF::hsp_memberships::MEM-2025-a1b2c3d4e5" in (kv_u_doc.get("industryRowEdits") or {}), "mfg_web_store KV industryRowEdits not upgraded"
    # Verify delta=True also deletes live pre-upgrade rows absent from previous manifest_upgrade.json
    shutil.copyfile(out_u / "pending_manifest.json", man_u)
    d1_u.execute("INSERT OR REPLACE INTO industry_custom_rows (bucket, row_id, company, rev, voided, updated_at, payload_json) VALUES ('hsp_memberships', 'MEM-2025-001', 'Blanca', 1, 0, '2026-11-08T10:00:00Z', '{}')")
    d1_u.execute("INSERT OR REPLACE INTO industry_row_edits (edit_key, rev, voided, updated_at, payload_json) VALUES ('WF::hsp_memberships::MEM-2025-001', 1, 0, '2026-11-08T10:00:00Z', '{}')")
    d1_u.execute("INSERT OR REPLACE INTO expense_items (id, expense_id, date, company) VALUES ('ex99-i1', 'ex99', '2026-11-08', 'WTC')")
    d1_u.commit()
    files_ud, _meta_ud = eds.export_all(delta=True, manifest_path=man_u, db_path=dbp_u, out_dir=tmp / "batches_upgrade_delta")
    for f_ud in files_ud:
        d1_u.executescript(f_ud.read_text(encoding="utf-8"))
    rem_icr = {r[1] for r in d1_u.execute("SELECT bucket, row_id FROM industry_custom_rows WHERE bucket = 'hsp_memberships'").fetchall()}
    rem_ire = {r[0] for r in d1_u.execute("SELECT edit_key FROM industry_row_edits").fetchall()}
    rem_ei = {r[0] for r in d1_u.execute("SELECT id FROM expense_items").fetchall()}
    assert "MEM-2025-001" not in rem_icr and "MEM-2025-a1b2c3d4e5" in rem_icr, f"delta failed to delete un-manifested legacy industry_custom_rows: {rem_icr}"
    assert "WF::hsp_memberships::MEM-2025-001" not in rem_ire and "WF::hsp_memberships::MEM-2025-a1b2c3d4e5" in rem_ire, f"delta failed to delete un-manifested legacy industry_row_edits: {rem_ire}"
    assert "ex99-i1" not in rem_ei and "ex_000000000001-i1" in rem_ei, f"delta failed to delete un-manifested legacy expense_items: {rem_ei}"
    d1_u.close()

    # Run 4: Dual-store union-merge preserves newer ISABI code edit across Edge D1 + Legacy Relay
    edge_doc = {
        "updatedAt": "2026-11-08T08:00:00.000Z",
        "customRecords": {"expenses": [
            {"id": "ex-edge-only", "company": "WTC", "code": "E-EDGE", "rev": 1, "updated_at": "2026-11-08T08:00:00.000Z"},
            {"id": "ex-shared", "company": "WTC", "code": "CODE-NEWER-ON-EDGE", "rev": 3, "updated_at": "2026-11-08T09:00:00.000Z"}
        ]}
    }
    relay_doc = {
        "updatedAt": "2026-11-08T11:00:00.000Z",
        "customRecords": {"expenses": [
            {"id": "ex-relay-only", "company": "WTC", "code": "E-RELAY", "rev": 1, "updated_at": "2026-11-08T11:00:00.000Z"},
            {"id": "ex-shared", "company": "WTC", "code": "CODE-STALE-ON-RELAY", "rev": 1, "updated_at": "2026-11-08T07:00:00.000Z"}
        ]}
    }
    merged = eds.merge_mfg_web_stores(edge_doc, relay_doc)
    by_id = {r["id"]: r for r in merged["customRecords"]["expenses"]}
    assert set(by_id.keys()) == {"ex-edge-only", "ex-relay-only", "ex-shared"}
    assert by_id["ex-shared"]["code"] == "CODE-NEWER-ON-EDGE"

    # Run 5: Purged override IDs stay suppressed across merge & tied-(rev,ts) prefers closed end_date
    d_new = {"updatedAt": "2026-11-08T12:00:00.000Z", "_purgedOverrideIds": ["price_rules:pr0"], "customRecords": {"price_rules": [{"id": "pr-tie", "rev": 1, "updated_at": "2026-11-08T01:00:00Z", "end_date": ""}]}}
    d_old = {"updatedAt": "2026-11-08T11:00:00.000Z", "customRecords": {"price_rules": [{"id": "pr0", "rev": 1}, {"id": "pr-tie", "rev": 1, "updated_at": "2026-11-08T01:00:00Z", "end_date": "2026-10-31", "_reconciled_at": "2026-11-08T11:00:00Z"}]}}
    m_tie = eds.merge_mfg_web_stores(d_new, d_old)
    pr_map = {r["id"]: r for r in m_tie["customRecords"]["price_rules"]}
    assert "pr0" not in pr_map and pr_map["pr-tie"]["end_date"] == "2026-10-31", f"tie/purge failed: {pr_map}"

    # Run 6 (Adversarial): Duplicate-email Edge+Relay seats preserve D1 authoritative ID/Suspended status/PIN/FaceID & multi-chunk tail DELETE executes last
    d1_sim = sqlite3.connect(str(tmp / "d1_sim.db"))
    d1_sim.executescript(eds.SCHEMA_SQL.read_text(encoding="utf-8"))
    d1_sim.execute("INSERT INTO users (id, full_name, email, pin_code, role, companies, status, face_samples, face_updated_at, seat_updated_at) VALUES ('u1', 'Owner', 'husseinbdeir@bhfirms.com', '9876', 'Full Access (Owner)', 'All', 'Active', '[[0.9,0.8]]', '2026-11-08T12:00:00Z', '2026-11-08T12:00:00Z')")
    d1_sim.execute("INSERT INTO users (id, full_name, email, pin_code, role, companies, status, face_samples, face_updated_at, seat_updated_at) VALUES ('u-edge-1', 'Ops Seat', 'ops@bhfirms.com', '4321', 'Entry', 'WTC', 'Suspended', '[[0.5,0.5]]', '2026-11-08T12:05:00Z', '2026-11-08T12:30:00Z')")
    d1_sim.execute("INSERT INTO edge_kv_store (doc_key, payload_json, updated_at) VALUES ('mfg_web_store__part_0005', 'stale', '2026-10-01')")
    d1_sim.commit()
    m_users = eds.merge_mfg_web_stores(
        {"updatedAt": "2026-11-08T12:15:00Z", "users": [
            {"id": "u1", "_d1_authoritative_id": True, "full_name": "Owner", "email": "husseinbdeir@bhfirms.com", "pin_code": "9876", "role": "Full Access (Owner)", "companies": "All", "status": "Active", "face_redacted": True, "face_enrolled": True, "face_updated_at": "2026-11-08T12:00:00Z", "seat_updated_at": "2026-11-08T12:00:00Z"},
            {"id": "u-edge-1", "_d1_authoritative_id": True, "full_name": "Ops Seat", "email": "ops@bhfirms.com", "pin_code": "4321", "role": "Entry", "companies": "WTC, BBConstruction", "status": "Active", "face_redacted": True, "face_thumbs": ["data:image/jpeg;base64,AAA"], "face_updated_at": "2026-11-08T12:05:00Z", "seat_updated_at": "2026-11-08T12:10:00Z"},
        ], "customRecords": {"expenses": [{"id": f"exp-pad-{i}", "company": "WTC", "notes": "X" * 900} for i in range(45)]}},
        {"updatedAt": "2026-11-08T12:12:00Z", "users": [
            {"id": "u-hussein", "full_name": "Owner", "email": "husseinbdeir@bhfirms.com", "pin_redacted": True, "role": "Entry", "seat_updated_at": "", "last_login_at": "2026-11-08 14:00:00"},
            {"id": "u-relay-9", "full_name": "Ops Seat", "email": "ops@bhfirms.com", "pin_redacted": True, "role": "Supervisor", "seat_updated_at": "", "last_login_at": "2026-11-08 14:05:00"},
        ]}
    )
    assert len(m_users["users"]) == 2
    eds.fetch_live_cloud_store = live(m_users)
    files6, _ = eds.export_all(delta=False, offline=False, manifest_path=tmp / "m6.json", db_path=dbp, out_dir=tmp / "b6", include_snapshot=False)
    sql6 = "\\n".join(bf.read_text(encoding="utf-8") for bf in files6)
    # the live store changes in one guarded swap statement, in the last batch file, after every staged chunk
    assert "__part_' || substr" in files6[-1].read_text(encoding="utf-8") and sql6.find("__part_' || substr") > sql6.find("mfg_web_store__next_") > 0
    for bf in files6:
        d1_sim.executescript(bf.read_text(encoding="utf-8"))
    d1_sim.commit()
    r_u1 = d1_sim.execute("SELECT id, pin_code, role, face_samples, last_login_at FROM users WHERE email='husseinbdeir@bhfirms.com'").fetchone()
    r_op = d1_sim.execute("SELECT id, pin_code, status, companies, face_samples FROM users WHERE email='ops@bhfirms.com'").fetchone()
    stale_cnt = d1_sim.execute("SELECT COUNT(*) FROM edge_kv_store WHERE doc_key='mfg_web_store__part_0005' AND payload_json <> ''").fetchone()[0]
    kv6 = "".join(r[0] for r in d1_sim.execute("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'mfg_web_store' OR doc_key LIKE 'mfg_web_store__part_%' ORDER BY doc_key").fetchall())
    assert len(json.loads(kv6)["users"]) == 2, "store does not parse after the swap"
    d1_sim.close()
    assert r_u1[1].startswith("pbkdf2$sha256$100000$") and r_u1 == ("u1", eds._hash_seed_pin("9876", "u1", "husseinbdeir@bhfirms.com"), "Full Access (Owner)", "[[0.9,0.8]]", "2026-11-08 14:00:00"), f"u1: {r_u1}"
    assert r_op == ("u-edge-1", "4321", "Suspended", "WTC", "[[0.5,0.5]]") and stale_cnt == 0, f"ops: {r_op}, stale={stale_cnt}"
    print("PY_DELTA_MERGE_OK")
finally:
    shutil.rmtree(tmp, ignore_errors=True)
`;
    try {
      const pyOut = execFileSync(pyBin, ['-c', pyScript], { encoding: 'utf8', windowsHide: true });
      if (pyOut.includes('PY_DELTA_MERGE_OK')) {
        pass('edge-16-python-delta-manifest-and-dual-store-merge', '0 writes unchanged, code-edit upsert + vanished/composite DELETE + dual-store union-merge + PBKDF2 seed hash');
      } else {
        fail('edge-16-python-delta-manifest-and-dual-store-merge', pyOut.slice(0, 300));
      }
    } catch (pyErr) {
      fail('edge-16-python-delta-manifest-and-dual-store-merge', String(pyErr.stderr || pyErr.message || pyErr).slice(0, 400));
    }

    // 17. Unauthenticated 401 Wall, CSRF/CORS Lock, Self-Escalation & Supervisor Scope Locks, Weak-PIN Reject, and 128-d Face ID + PIN Auth
    const unauthUsersPost = await httpReq('POST', '/app/api/users', { user: { id: 'u1', email: 'husseinbdeir@bhfirms.com', full_name: 'Anon Tamper', role: 'Full Access (Owner)' } });
    const unauthRecordsGet = await httpReq('GET', '/app/api/records?table=sales_tickets&company=WTC&limit=5');
    const unauthRecordsPost = await httpReq('POST', '/app/api/records', { table: 'expenses', record: { id: 'anon-exp', company: 'WTC', amount: 1 } });
    const unauthSyncGet = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' });
    const unauthSyncPatch = await httpReq('POST', '/app/api/sync', { op: 'patch', doc: 'mfg_web_store', patch: { mfg_web_store: {} } });
    const unauthBlobsDel = await httpReq('DELETE', `/app/api/blobs?id=${encodeURIComponent(blobId)}`);
    const unauthSentinelsGet = await httpReq('GET', '/app/api/sentinel_reviews');
    const anonLeakedBio = (anonUsers.json?.users || []).some(u => (Array.isArray(u?.face_samples) && u.face_samples.length > 0) || (Array.isArray(u?.face_thumbs) && u.face_thumbs.length > 0) || u?.custom_perms);

    // CSRF Cookie + Evil Origin block & CORS allowlist check
    const evilCookiePost = await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: 'csrf-test', company: 'WTC', amount: 1 }
    }, {
      Cookie: `isabi_edge_sess=${encodeURIComponent(ownerToken)}`,
      Origin: 'https://evil-attacker.example.com'
    });
    const goodOriginGet = await httpReq('GET', '/app/api/records?table=sales_tickets&company=WTC&limit=1', null, {
      'X-ISABI-Session': ownerToken,
      Origin: 'https://isabisystems.com'
    });

    // Entry self-POST privilege lock + weak PIN reject + single-BU Supervisor cross-BU/Owner escalation block
    const weakPinAttempt17 = await httpReq('POST', '/app/api/users', {
      user: {
        email: ENTRY_TEST_EMAIL,
        full_name: 'Entry Test Seat',
        pin_code: '0000'
      }
    }, { 'X-ISABI-Session': entryToken });
    const entrySelfEscalate = await httpReq('POST', '/app/api/users', {
      user: {
        email: ENTRY_TEST_EMAIL,
        full_name: 'Entry Test Seat',
        role: 'Full Access (Owner)',
        companies: 'All',
        pin_redacted: true,
        pbi_access: 'full',
        custom_perms: { admin: true },
        last_login_at: new Date().toISOString()
      }
    }, { 'X-ISABI-Session': entryToken });
    const usersAfterSelf = await httpReq('GET', '/app/api/users', null, { 'X-ISABI-Session': ownerToken });
    const entryAfterSelf = (usersAfterSelf.json?.users || []).find(u => String(u.email || '').toLowerCase() === ENTRY_TEST_EMAIL.toLowerCase());
    const entryPinStill3333 = await httpReq('POST', '/app/api/auth/login', {
      email: ENTRY_TEST_EMAIL,
      pin: '3333',
      method: 'PIN'
    });
    const bbcSupLogin = await httpReq('POST', '/app/api/auth/login', {
      email: 'site.bbc@bhfirms.com',
      pin: '6666',
      method: 'PIN'
    });
    const bbcSupToken = String(bbcSupLogin.json?.token || '');
    // Pre-edge-18 domain sync-twin unvoid 403 checks (before edge-18 bulk snapshot replaces mfg_sites)
    const e48OwnDomTopup403 = await httpReq('POST', '/app/api/industry_domain_store', {
      industryCustomRows: { mfg_sites: [{ id: 'dom-e48-topup-bbc', company: 'BBConstruction', ind: 'Manufacturing', voided: false, rev: 2 }] }
    }, { 'X-ISABI-Session': ownerToken });
    const e48OwnEditTopup403 = await httpReq('POST', '/app/api/industry_domain_store', {
      industryRowEdits: { 'Manufacturing::Sites::E48-TOPUP': { ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'E48-TOPUP', company: 'BBConstruction', voided: false, rev: 2 } }
    }, { 'X-ISABI-Session': ownerToken });
    const e48SupDomTopup403 = await httpReq('POST', '/app/api/industry_domain_store', {
      industryCustomRows: { mfg_sites: [{ id: 'dom-e48-topup-bbc', company: 'BBConstruction', ind: 'Manufacturing', voided: false, rev: 2 }] }
    }, { 'X-ISABI-Session': bbcSupToken });
    const e48SupEditTopup403 = await httpReq('POST', '/app/api/industry_domain_store', {
      industryRowEdits: { 'Manufacturing::Sites::E48-TOPUP': { ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'E48-TOPUP', company: 'BBConstruction', voided: false, rev: 2 } }
    }, { 'X-ISABI-Session': bbcSupToken });
    const supEditOwner = await httpReq('POST', '/app/api/users', {
      user: { id: 'u1', email: 'husseinbdeir@bhfirms.com', full_name: 'Hussein Bdeir', role: 'Full Access (Owner)', companies: 'All' }
    }, { 'X-ISABI-Session': bbcSupToken });
    const supGrantOutScope = await httpReq('POST', '/app/api/users', {
      user: { id: 'u-sup-escape', email: 'escape@bhfirms.com', full_name: 'Scope Escape', role: 'Supervisor', companies: 'WTC' }
    }, { 'X-ISABI-Session': bbcSupToken });

    // Server-side 128-d Euclidean L2 Face ID verification. Face ID or PIN, never both (owner decision 2026-11-12):
    // under the `either` default a matching Face ID alone signs in, with or without a typed email.
    const vecBase = Array.from({ length: 128 }, (_, i) => Number((Math.sin(i + 1) * 0.12).toFixed(5)));
    const vecNear = vecBase.map((v, i) => Number((v + (i % 2 === 0 ? 0.002 : -0.002)).toFixed(5)));
    const vecFar = Array.from({ length: 128 }, (_, i) => Number((Math.cos(i + 1) * 0.25).toFixed(5)));
    await httpReq('POST', '/app/api/users', {
      user: {
        id: 'u-face-verify',
        email: 'faceverify@bhfirms.com',
        full_name: 'Face Verify Seat',
        role: 'Entry',
        companies: 'WTC',
        pin_code: '7412',
        status: 'Active',
        face_samples: [vecBase]
      }
    }, { 'X-ISABI-Session': ownerToken });
    const faceNoVec = await httpReq('POST', '/app/api/auth/login', { email: 'faceverify@bhfirms.com', method: 'Face ID' });
    const faceWrongVec = await httpReq('POST', '/app/api/auth/login', { email: 'faceverify@bhfirms.com', pin: '7412', method: 'Face ID + PIN 2FA', face_descriptor: vecFar });
    const faceNoPin = await httpReq('POST', '/app/api/auth/login', { email: 'faceverify@bhfirms.com', method: 'Face ID', face_descriptor: vecNear });
    const faceGoodVec = await httpReq('POST', '/app/api/auth/login', { email: 'faceverify@bhfirms.com', pin: '7412', method: 'Face ID + PIN 2FA', face_descriptor: vecNear });
    const faceNoEmail = await httpReq('POST', '/app/api/auth/login', { method: 'Face ID', face_descriptor: vecNear });
    const faceStrangerNoEmail = await httpReq('POST', '/app/api/auth/login', { method: 'Face ID', face_descriptor: vecFar });

    if (
      unauthUsersPost.status === 401 &&
      unauthRecordsGet.status === 401 &&
      unauthRecordsPost.status === 401 &&
      unauthSyncGet.status === 401 &&
      unauthSyncPatch.status === 401 &&
      unauthBlobsDel.status === 401 &&
      unauthSentinelsGet.status === 401 &&
      !anonLeakedBio &&
      evilCookiePost.status === 401 &&
      !evilCookiePost.headers['access-control-allow-origin'] &&
      goodOriginGet.headers['access-control-allow-origin'] === 'https://isabisystems.com' &&
      weakPinAttempt17.status === 400 &&
      entrySelfEscalate.status === 200 &&
      entrySelfEscalate.json?.lockedPrivileges === true &&
      entryAfterSelf?.role === 'Entry' &&
      entryAfterSelf?.companies === 'WTC' &&
      entryAfterSelf?.pin_code === undefined &&
      entryAfterSelf?.pin_redacted === true &&
      entryAfterSelf?.custom_perms === null &&
      entryPinStill3333.status === 200 &&
      entryPinStill3333.json?.user?.custom_perms === null &&
      bbcSupLogin.json?.user?.custom_perms === null &&
      supEditOwner.status === 403 &&
      supGrantOutScope.status === 403 &&
      faceNoVec.status === 401 &&
      faceWrongVec.status === 401 &&
      faceNoPin.status === 200 &&
      Boolean(faceNoPin.json?.token) &&
      faceNoPin.json?.user?.email === 'faceverify@bhfirms.com' &&
      faceGoodVec.status === 200 &&
      Boolean(faceGoodVec.json?.token) &&
      faceGoodVec.json?.user?.pin_code === undefined &&
      faceNoEmail.status === 200 &&
      Boolean(faceNoEmail.json?.token) &&
      faceNoEmail.json?.user?.email === 'faceverify@bhfirms.com' &&
      faceStrangerNoEmail.status === 401 &&
      !faceStrangerNoEmail.json?.token &&
      !faceStrangerNoEmail.json?.user
    ) {
      pass(
        'edge-17-unauth-401-privilege-lock-faceid-and-cors',
        '7 unauth endpoints=401, CSRF/CORS locked, weak PIN=400, Entry/Supervisor escalation blocked, Face ID alone signs in on a 128-d match (email optional), unknown face refused'
      );
    } else {
      fail('edge-17-unauth-401-privilege-lock-faceid-and-cors', JSON.stringify({
        unauth: [unauthUsersPost.status, unauthRecordsGet.status, unauthRecordsPost.status, unauthSyncGet.status, unauthSyncPatch.status, unauthBlobsDel.status, unauthSentinelsGet.status],
        anonLeakedBio,
        evilCookie: evilCookiePost.status,
        evilCors: evilCookiePost.headers['access-control-allow-origin'],
        goodCors: goodOriginGet.headers['access-control-allow-origin'],
        weakPin: weakPinAttempt17.status,
        entrySelf: [entrySelfEscalate.status, entryAfterSelf?.pin_code, entryAfterSelf?.pin_redacted, entryPinStill3333.status],
        supEditOwner: supEditOwner.status,
        supGrantOutScope: supGrantOutScope.status,
        face: [faceNoVec.status, faceWrongVec.status, faceNoPin.status, faceGoodVec.status, faceGoodVec.json?.user?.pin_code]
      }));
    }

    // 18. Scale (>260 Dirty Rows in Single Sync Patch) + Full SharePoint Snapshot & Multi-Industry Spine Coverage
    const curSync18 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const doc18 = JSON.parse(JSON.stringify(curSync18.json?.docs?.mfg_web_store || {}));
    const bulk275 = [];
    for (let i = 0; i < 275; i++) {
      bulk275.push({
        id: `exp-bulk275-${i}`,
        company: 'WTC',
        date: '2026-11-08',
        code: `BLK-${i}`,
        name: `Bulk Dirty Expense ${i}`,
        amount: 20 + (i % 50),
        rev: 1,
        updated_at: '2026-11-08T12:00:00.000Z'
      });
    }
    doc18.updatedAt = new Date(Date.now() + 8000).toISOString();
    doc18.customRecords = Object.assign({}, doc18.customRecords || {}, {
      expenses: [...bulk275, ...(doc18.customRecords?.expenses || [])]
    });
    const sync275 = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: String(curSync18.json?.docs?.mfg_web_store?.updatedAt || ''),
      awaitMirror: true,
      patch: { mfg_web_store: Object.assign({}, doc18, { minShellVer: MIN_SYNC_SHELL_VER }) }
    }, { 'X-ISABI-Session': ownerToken });
    const verifyBulkExp = await httpReq('GET', '/app/api/records?table=expenses&company=WTC&limit=600', null, { 'X-ISABI-Session': ownerToken });
    const bulkRows = verifyBulkExp.json?.rows || [];
    const hasBulk0 = bulkRows.some(r => r.id === 'exp-bulk275-0');
    const hasBulk274 = bulkRows.some(r => r.id === 'exp-bulk275-274');

    const custSnap = await httpReq('GET', '/app/api/records?table=customers&company=all&limit=1200', null, { 'X-ISABI-Session': ownerToken });
    const attSnap = await httpReq('GET', '/app/api/records?table=attendance&company=WTC&limit=500', null, { 'X-ISABI-Session': ownerToken });
    const eqSnap = await httpReq('GET', '/app/api/records?table=equipment&company=all&limit=200', null, { 'X-ISABI-Session': ownerToken });
    const richEqOk = (eqSnap.json?.rows || []).some(r => Array.isArray(r.adj_windows) || Boolean(r.model));
    const spineInsExp = await httpReq('GET', '/app/api/records?table=expenses&company=Insurance%20Company&limit=40', null, { 'X-ISABI-Session': ownerToken });
    const salariesAlias = await httpReq('GET', '/app/api/records?table=salaries&company=WTC&limit=5', null, { 'X-ISABI-Session': ownerToken });

    if (
      sync275.status === 200 &&
      sync275.json?.mirrorStats?.upsertedRecords === 275 &&
      hasBulk0 &&
      hasBulk274 &&
      (custSnap.json?.rows || []).length >= 1000 &&
      (attSnap.json?.rows || []).length >= 100 &&
      richEqOk &&
      (spineInsExp.json?.rows || []).length >= 30 &&
      salariesAlias.status === 200 &&
      (salariesAlias.json?.rows || []).length === 5
    ) {
      pass(
        'edge-18-bulk-275-dirty-sync-and-full-snapshot-spine-coverage',
        `mirrored 275/275 dirty rows, customers=${custSnap.json.rows.length}, attendance=${attSnap.json.rows.length}, richEq=true, Insurance spine=${spineInsExp.json.rows.length}, salaries alias=5`
      );
    } else {
      fail('edge-18-bulk-275-dirty-sync-and-full-snapshot-spine-coverage', JSON.stringify({
        ms275: sync275.json?.mirrorStats,
        hasBulk0,
        hasBulk274,
        cust: (custSnap.json?.rows || []).length,
        att: (attSnap.json?.rows || []).length,
        richEqOk,
        insSpine: (spineInsExp.json?.rows || []).length,
        salAlias: [salariesAlias.status, (salariesAlias.json?.rows || []).length]
      }));
    }

    // 19. Demo Sandbox Auth Quarantine + Cold-Browser Face ID + `both` 2FA + `geo_config` 0-KM/Tombstone Merge + Scoped R2 Blob Fallback
    // 19a (Adversarial): Demo Sandbox login must NEVER mint an Owner JWT or Set-Cookie, and browser Demo session must attach X-ISABI-Demo: 1
    const demoLoginAttempt = await httpReq('POST', '/app/api/auth/login', {
      email: 'husseinbdeir@bhfirms.com',
      pin: '1111',
      method: 'PIN'
    }, { 'X-ISABI-Demo': '1' });
    const demoUnauthWrite = await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: 'demo-write-blocked', company: 'WTC', amount: 99 }
    }, { 'X-ISABI-Demo': '1' });
    const demoAskAllowed = await httpReq('POST', '/app/api/ask', { prompt: 'ping' }, {
      'X-ISABI-Demo': '1',
      'Origin': `http://127.0.0.1:${PORT}`
    });
    const demoAskNoOriginBlocked = await httpReq('POST', '/app/api/ask', { prompt: 'ping' }, { 'X-ISABI-Demo': '1' });
    const demoUnauthAskBlocked = await httpReq('POST', '/app/api/ask', { prompt: 'ping' });
    const browserDemoCheck = await evalJs(`(async () => {
      const r = await window.ISABI_EDGE_FETCH('./api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'husseinbdeir@bhfirms.com', pin: '1111', method: 'PIN' })
      }).then(x => x.json());
      return {
        isDemoFn: Boolean(window.__ISABI_IS_DEMO && window.__ISABI_IS_DEMO()),
        demoQuarantined: Boolean(r && r.demo === true && !r.token),
        storedSessTok: String(localStorage.getItem('isabi_mfg_edge_sess_tok_v1') || '')
      };
    })()`);

    // 19b: Cold-browser descriptor-only Face ID signs in under `either` (Face ID or PIN, owner decision 2026-11-12)
    // + `auth_mode: 'both'` seats still need the two
    const coldFaceOnly = await httpReq('POST', '/app/api/auth/login', {
      method: 'Face ID',
      face_descriptor: vecNear
    });
    const vecBothBase = Array.from({ length: 128 }, (_, i) => Number((Math.sin(i * 2 + 3) * 0.14 + 0.05).toFixed(5)));
    const vecBothNear = vecBothBase.map((v, i) => Number((v + (i % 2 === 0 ? 0.0015 : -0.0015)).toFixed(5)));
    await httpReq('POST', '/app/api/users', {
      user: {
        id: 'u-both-2fa',
        email: 'both2fa@bhfirms.com',
        full_name: 'Both 2FA Supervisor',
        role: 'Supervisor + Entry',
        companies: 'WTC',
        pin_code: '8520',
        auth_mode: 'both',
        status: 'Active',
        face_samples: [vecBothBase]
      }
    }, { 'X-ISABI-Session': ownerToken });
    const bothPinOnly = await httpReq('POST', '/app/api/auth/login', {
      email: 'both2fa@bhfirms.com',
      pin: '8520',
      method: 'PIN'
    });
    const bothFaceOnlyCold = await httpReq('POST', '/app/api/auth/login', {
      email: 'both2fa@bhfirms.com',
      method: 'Face ID',
      face_descriptor: vecBothNear
    });
    const bothCombinedOk = await httpReq('POST', '/app/api/auth/login', {
      email: 'both2fa@bhfirms.com',
      pin: '8520',
      method: 'Face ID + PIN 2FA',
      face_descriptor: vecBothNear
    });

    // 19c: Concurrent `geo_config` Timestamp Merge + `0` KM Override Boundary + `_deletedKeys` Tombstone Delete
    const tGeo1 = '2026-11-08T13:00:00.000Z';
    const tGeo2 = '2026-11-08T13:05:00.000Z';
    const tGeo3 = '2026-11-08T13:10:00.000Z';
    await httpReq('POST', '/app/api/geo_config', {
      config: {
        sites: {
          sitea: { lat: 33.89, lng: 35.50, updated_at: tGeo2 },
          sitestale: { lat: 33.80, lng: 35.48, updated_at: tGeo1 }
        },
        pairKmOverrides: { 'site:wtc|site:sitea': 0, 'site:wtc|site:readded': 4.5 },
        _pairKmTs: { 'site:wtc|site:sitea': tGeo2, 'site:wtc|site:readded': tGeo3 },
        _deletedKeys: {},
        updatedAt: tGeo3
      }
    }, { 'X-ISABI-Session': ownerToken });
    // Second supervisor pushes `siteb` + deletes `sitestale` at tGeo2 + carries a STALE tGeo1 tombstone for `readded`
    await httpReq('POST', '/app/api/geo_config', {
      config: {
        sites: {
          siteb: { lat: 34.12, lng: 35.65, updated_at: tGeo3 }
        },
        pairKmOverrides: {},
        _pairKmTs: {},
        _deletedKeys: {
          'sites:sitestale': tGeo2,
          'pairKmOverrides:site:wtc|site:readded': tGeo1
        },
        updatedAt: tGeo3
      }
    }, { 'X-ISABI-Session': String(bothCombinedOk.json?.token || '') });
    const geoMergedRes = await httpReq('GET', '/app/api/geo_config', null, { 'X-ISABI-Session': ownerToken });
    const gm = geoMergedRes.json?.config || {};

    // 19d: Scoped `putDocBlob` Empty-Company Fallback -> WTC & Cross-BU Read Block
    const autoScopedBlobId = 'att-autoscope-' + Date.now();
    const autoScopedPut = await httpReq('POST', '/app/api/blobs', {
      id: autoScopedBlobId,
      company: '',
      dataUrl: tinyPngDataUrl
    }, { 'X-ISABI-Session': entryToken });
    const autoScopedEntryGet = await httpReq('GET', `/app/api/blobs?id=${encodeURIComponent(autoScopedBlobId)}`, null, { 'X-ISABI-Session': entryToken });
    const autoScopedBbcGet = await httpReq('GET', `/app/api/blobs?id=${encodeURIComponent(autoScopedBlobId)}`, null, { 'X-ISABI-Session': bbcSupToken });

    if (
      demoLoginAttempt.status === 200 &&
      demoLoginAttempt.json?.demo === true &&
      !demoLoginAttempt.json?.token &&
      !demoLoginAttempt.headers['set-cookie'] &&
      (demoUnauthWrite.status === 401 || demoUnauthWrite.status === 403) &&
      demoAskAllowed.status !== 401 &&
      demoAskAllowed.status !== 403 &&
      demoAskNoOriginBlocked.status === 403 &&
      demoUnauthAskBlocked.status === 401 &&
      browserDemoCheck?.isDemoFn === true &&
      browserDemoCheck?.demoQuarantined === true &&
      browserDemoCheck?.storedSessTok === '' &&
      coldFaceOnly.status === 200 &&
      Boolean(coldFaceOnly.json?.token) &&
      coldFaceOnly.json?.user?.email === 'faceverify@bhfirms.com' &&
      coldFaceOnly.json?.user?.pin_code === undefined &&
      bothPinOnly.status === 401 &&
      bothPinOnly.json?.two_factor_face_required === true &&
      !bothPinOnly.json?.token &&
      bothFaceOnlyCold.status === 401 &&
      bothFaceOnlyCold.json?.two_factor_pin_required === true &&
      bothFaceOnlyCold.json?.email === 'both2fa@bhfirms.com' &&
      !bothFaceOnlyCold.json?.user &&
      !bothFaceOnlyCold.json?.token &&
      bothCombinedOk.status === 200 &&
      Boolean(bothCombinedOk.json?.token) &&
      Boolean(gm.sites?.sitea) &&
      Boolean(gm.sites?.siteb) &&
      !gm.sites?.sitestale &&
      gm.pairKmOverrides?.['site:wtc|site:sitea'] === 0 &&
      gm.pairKmOverrides?.['site:wtc|site:readded'] === 4.5 &&
      autoScopedPut.status === 200 &&
      autoScopedPut.json?.storage === 'r2' &&
      autoScopedEntryGet.status === 200 &&
      autoScopedEntryGet.json?.found === true &&
      autoScopedBbcGet.status === 403
    ) {
      pass(
        'edge-19-demo-quarantine-2fa-coldface-geomerged-and-scoped-r2',
        'Demo JWT quarantined, Demo AI same-origin gated, Face ID alone signs in an either seat (200), both-2FA verified, geo_config merged, empty-co blob scoped'
      );
    } else {
      fail('edge-19-demo-quarantine-2fa-coldface-geomerged-and-scoped-r2', JSON.stringify({
        demoLogin: [demoLoginAttempt.status, demoLoginAttempt.json, Boolean(demoLoginAttempt.headers['set-cookie'])],
        demoWrite: demoUnauthWrite.status,
        demoAsk: [demoAskAllowed.status, demoAskNoOriginBlocked.status, demoUnauthAskBlocked.status],
        browserDemoCheck,
        coldFace: [coldFaceOnly.status, coldFaceOnly.json],
        both2fa: [bothPinOnly.status, bothPinOnly.json?.two_factor_face_required, bothFaceOnlyCold.status, bothFaceOnlyCold.json?.two_factor_pin_required, bothCombinedOk.status],
        gm: { a: Boolean(gm.sites?.sitea), b: Boolean(gm.sites?.siteb), stale: Boolean(gm.sites?.sitestale), p0: gm.pairKmOverrides?.['site:wtc|site:sitea'], pre: gm.pairKmOverrides?.['site:wtc|site:readded'] },
        blob: [autoScopedPut.status, autoScopedEntryGet.status, autoScopedBbcGet.status]
      }));
    }

    // 20. Scoped Sync Read RLS (`scopeStoreDocForSession`), Sub-Store Vanished-Key DELETEs, Users Sync Mirror & Missing-Secret Fail-Closed
    const preUsers20 = await httpReq('GET', '/app/api/users', null, { 'X-ISABI-Session': ownerToken });
    const curSync20 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const doc20 = JSON.parse(JSON.stringify(curSync20.json?.docs?.mfg_web_store || {}));
    doc20.users = preUsers20.json?.users || doc20.users || [];
    doc20.updatedAt = new Date(Date.now() + 12000).toISOString();
    doc20.customRecords = Object.assign({}, doc20.customRecords || {}, {
      expenses: [
        { id: 'exp-bbc-secret-20', company: 'BBConstruction', date: '2026-11-08', code: 'BBC-SEC', name: 'BBC Confidential', amount: 777, rev: 1, updated_at: doc20.updatedAt },
        { id: 'ex_a1b2c3d4e5f6', company: 'BBConstruction', date: '2026-11-08', code: 'BBC-STBL', name: 'BBC Stable Override', amount: 888, rev: 1, updated_at: doc20.updatedAt },
        { id: 'ex77777', company: 'BBConstruction', date: '2026-11-08', code: 'BBC-LEG', name: 'BBC Legacy Override', amount: 444, rev: 1, updated_at: doc20.updatedAt },
        ...(doc20.customRecords?.expenses || [])
      ]
    });
    doc20.industryCustomRows = Object.assign({}, doc20.industryCustomRows || {}, {
      hsp_memberships: [{ id: 'MEM-2025-001', company: 'Blanca', status: 'Legacy', rev: 1, updated_at: doc20.updatedAt }]
    });
    doc20.industryRowEdits = Object.assign({}, doc20.industryRowEdits || {}, {
      'WF::hsp_memberships::MEM-2025-001': { company: 'Blanca', status: 'Legacy', rev: 1, updated_at: doc20.updatedAt }
    });
    doc20.sentinelReviews = Object.assign({}, doc20.sentinelReviews || {}, {
      'sr-r3-bbc': { company: 'BBConstruction', status: 'Reviewed', note: 'BBC only', updated_at: doc20.updatedAt },
      'sr-r3-wtc-del': { company: 'WTC', status: 'Flagged', note: 'To delete', updated_at: doc20.updatedAt }
    });
    doc20.alertRules = {
      overrides: Object.assign({}, doc20.alertRules?.overrides || {}),
      custom: [
        ...(doc20.alertRules?.custom || []),
        { id: 'cr-r3-del', company: 'WTC', title: 'Temp Rule', updated_at: doc20.updatedAt }
      ]
    };
    const seed20Res = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: String(curSync20.json?.docs?.mfg_web_store?.updatedAt || ''),
      awaitMirror: true,
      patch: { mfg_web_store: Object.assign({}, doc20, { minShellVer: MIN_SYNC_SHELL_VER }) }
    }, { 'X-ISABI-Session': ownerToken });

    // 20a (Adversarial): WTC Entry seat reads `/app/api/sync` (`get_mfg` + CAS `conflict` + `get_control`)
    const entrySyncGet20 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': entryToken });
    const entryDoc20 = entrySyncGet20.json?.docs?.mfg_web_store || {};
    const entryConflict20 = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: '1999-01-01T00:00:00.000Z',
      patch: { mfg_web_store: { minShellVer: MIN_SYNC_SHELL_VER, updatedAt: new Date().toISOString(), customRecords: {} } }
    }, { 'X-ISABI-Session': entryToken });
    const conflictDoc20 = entryConflict20.json?.docs?.mfg_web_store || {};
    const entryControl20 = await httpReq('POST', '/app/api/sync', { op: 'get_control', doc: 'control_store' }, { 'X-ISABI-Session': entryToken });
    const leakedBbcGet = (entryDoc20.customRecords?.expenses || []).some(r => r && r.company === 'BBConstruction');
    const leakedBbcConflict = (conflictDoc20.customRecords?.expenses || []).some(r => r && r.company === 'BBConstruction');
    const leakedSrGet = Boolean(entryDoc20.sentinelReviews && entryDoc20.sentinelReviews['sr-r3-bbc']);
    const otherSeatInSync = (entryDoc20.users || []).find(u => u && u.email === 'faceverify@bhfirms.com');

    // Entry pushes scoped doc back (including adversarial cross-BU/non-legacy _purgedOverrideIds) -> BBConstruction rows must remain 100% intact in D1
    const entryPushDoc20 = JSON.parse(JSON.stringify(entryDoc20));
    entryPushDoc20.updatedAt = new Date(Date.now() + 14000).toISOString();
    entryPushDoc20._purgedOverrideIds = ['expenses:exp-bbc-secret-20', 'expenses:ex_a1b2c3d4e5f6', 'expenses:ex77777'];
    entryPushDoc20.customRecords = Object.assign({}, entryPushDoc20.customRecords || {}, {
      expenses: [
        { id: 'exp-wtc-entry-20', company: 'WTC', date: '2026-11-08', code: 'WTC-E20', name: 'Entry WTC', amount: 55, rev: 1, updated_at: entryPushDoc20.updatedAt },
        ...(entryPushDoc20.customRecords?.expenses || [])
      ]
    });
    const entryPatch20 = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: String(entryDoc20.updatedAt || ''),
      awaitMirror: true,
      patch: { mfg_web_store: Object.assign({}, entryPushDoc20, { minShellVer: MIN_SYNC_SHELL_VER }) }
    }, { 'X-ISABI-Session': entryToken });

    // 20b: Owner removes `sr-r3-wtc-del` + `cr-r3-del`, upgrades `MEM-2025-001` -> `MEM-2025-a1b2c3d4e5`, and updates `both2fa@bhfirms.com`
    const ownerAfterEntry = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const ownerDoc20b = JSON.parse(JSON.stringify(ownerAfterEntry.json?.docs?.mfg_web_store || {}));
    const ownerPurged20b = Array.isArray(ownerDoc20b._purgedOverrideIds) ? ownerDoc20b._purgedOverrideIds : [];
    const ownerExp20b = ownerDoc20b.customRecords?.expenses || [];
    const bbcStillIntact20 = ownerExp20b.some(r => r && r.id === 'exp-bbc-secret-20')
      && ownerExp20b.some(r => r && r.id === 'ex_a1b2c3d4e5f6')
      && ownerExp20b.some(r => r && r.id === 'ex77777')
      && !ownerPurged20b.includes('expenses:exp-bbc-secret-20')
      && !ownerPurged20b.includes('expenses:ex_a1b2c3d4e5f6')
      && !ownerPurged20b.includes('expenses:ex77777');
    ownerDoc20b.industryCustomRows = Object.assign({}, ownerDoc20b.industryCustomRows || {}, {
      hsp_memberships: [{ id: 'MEM-2025-a1b2c3d4e5', company: 'Blanca', status: 'Upgraded', rev: 2, updated_at: new Date(Date.now() + 15000).toISOString() }]
    });
    ownerDoc20b.industryRowEdits = Object.assign({}, ownerDoc20b.industryRowEdits || {});
    delete ownerDoc20b.industryRowEdits['WF::hsp_memberships::MEM-2025-001'];
    ownerDoc20b.industryRowEdits['WF::hsp_memberships::MEM-2025-a1b2c3d4e5'] = { company: 'Blanca', status: 'Upgraded', rev: 2, updated_at: new Date(Date.now() + 15000).toISOString() };
    delete ownerDoc20b.sentinelReviews['sr-r3-wtc-del'];
    ownerDoc20b.alertRules.custom = (ownerDoc20b.alertRules?.custom || []).filter(c => c && c.id !== 'cr-r3-del');
    const ownerUsersRes = await httpReq('GET', '/app/api/users', null, { 'X-ISABI-Session': ownerToken });
    ownerDoc20b.users = (ownerUsersRes.json?.users || []).map(u => {
      if (u && u.email === 'both2fa@bhfirms.com') {
        return Object.assign({}, u, { pbi_access: 'ops_only', pin_code: '', face_redacted: true, face_samples: undefined });
      }
      return u;
    });
    ownerDoc20b.updatedAt = new Date(Date.now() + 16000).toISOString();
    const ownerDelSync20 = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: String(ownerAfterEntry.json?.docs?.mfg_web_store?.updatedAt || ''),
      awaitMirror: true,
      patch: { mfg_web_store: Object.assign({}, ownerDoc20b, { minShellVer: MIN_SYNC_SHELL_VER }) }
    }, { 'X-ISABI-Session': ownerToken });

    const arAfterDel = await httpReq('GET', '/app/api/alert_rules', null, { 'X-ISABI-Session': ownerToken });
    const srAfterDel = await httpReq('GET', '/app/api/sentinel_reviews', null, { 'X-ISABI-Session': ownerToken });
    const indDomAfterDel = await httpReq('GET', '/app/api/industry_domain_store', null, { 'X-ISABI-Session': ownerToken });
    const indDomCleaned = !(indDomAfterDel.json?.industryCustomRows?.hsp_memberships || []).some(r => r && r.id === 'MEM-2025-001')
      && (indDomAfterDel.json?.industryCustomRows?.hsp_memberships || []).some(r => r && r.id === 'MEM-2025-a1b2c3d4e5')
      && !(indDomAfterDel.json?.industryRowEdits && indDomAfterDel.json.industryRowEdits['WF::hsp_memberships::MEM-2025-001'])
      && Boolean(indDomAfterDel.json?.industryRowEdits && indDomAfterDel.json.industryRowEdits['WF::hsp_memberships::MEM-2025-a1b2c3d4e5']);
    const usersAfterSyncMirror = await httpReq('GET', '/app/api/users', null, { 'X-ISABI-Session': ownerToken });
    const unauthUsers20 = await httpReq('GET', '/app/api/users');
    const mirroredBothSeat = (usersAfterSyncMirror.json?.users || []).find(u => u.email === 'both2fa@bhfirms.com');
    const mirroredBothStillLogsIn = await httpReq('POST', '/app/api/auth/login', {
      email: 'both2fa@bhfirms.com',
      pin: '8520',
      method: 'Face ID + PIN 2FA',
      face_descriptor: vecBothNear
    });

    // 20c (Adversarial): Missing `ISABI_JWT_SECRET` fails closed against retired dev fallback secret
    const secMod = await import('../functions/_lib/security.js');
    const b64u = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const forgedHdr = b64u({ alg: 'HS256', typ: 'JWT' });
    const forgedBdy = b64u({ sub: 'u1', email: 'husseinbdeir@bhfirms.com', role: 'Full Access (Owner)', companies: 'All', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600, iss: 'isabi-edge-v1' });
    const forgedSig = crypto.createHmac('sha256', 'isabi-edge-dev-fallback-secret-change-in-prod').update(`${forgedHdr}.${forgedBdy}`).digest('base64url');
    const forgedVerify = await secMod.verifyEdgeSession(`${forgedHdr}.${forgedBdy}.${forgedSig}`, {});
    let signEmptyThrew = false;
    try { await secMod.signEdgeSession({ sub: 'u1' }, {}); } catch (_) { signEmptyThrew = true; }

    if (
      seed20Res.status === 200 &&
      entryDoc20._scopedForSession === true &&
      conflictDoc20._scopedForSession === true &&
      !leakedBbcGet &&
      !leakedBbcConflict &&
      !leakedSrGet &&
      otherSeatInSync?.face_redacted === true &&
      otherSeatInSync?.face_samples === undefined &&
      otherSeatInSync?.custom_perms === null &&
      entryControl20.status === 403 &&
      entryPatch20.status === 200 &&
      bbcStillIntact20 &&
      ownerDelSync20.status === 200 &&
      indDomCleaned &&
      !(arAfterDel.json?.custom || []).some(c => c.id === 'cr-r3-del') &&
      !(srAfterDel.json?.reviews && srAfterDel.json.reviews['sr-r3-wtc-del']) &&
      mirroredBothSeat?.pbi_access === 'ops_only' &&
      mirroredBothSeat?.pin_code === undefined &&
      mirroredBothSeat?.pin_redacted === true &&
      mirroredBothSeat?.face_enrolled === true &&
      mirroredBothSeat?.face_sample_count === 1 &&
      mirroredBothSeat?.face_redacted === true &&
      mirroredBothSeat?.face_samples === undefined &&
      mirroredBothStillLogsIn.status === 200 &&
      Boolean(mirroredBothStillLogsIn.json?.token) &&
      unauthUsers20.status === 401 &&
      !unauthUsers20.json?.users &&
      forgedVerify === null &&
      signEmptyThrew === true
    ) {
      pass(
        'edge-20-scoped-sync-rls-substore-deletes-user-mirror-and-jwt-failclosed',
        'Read-side sync RLS scoped, control_store=403, cross-BU preserved, sub-store deletes + PIN-redacted user mirror verified, anon /users=401, empty JWT secret fails closed'
      );
    } else {
      fail('edge-20-scoped-sync-rls-substore-deletes-user-mirror-and-jwt-failclosed', JSON.stringify({
        scoped: [entryDoc20._scopedForSession, conflictDoc20._scopedForSession, leakedBbcGet, leakedBbcConflict, leakedSrGet, entryControl20.status],
        otherSeat: [otherSeatInSync?.face_redacted, otherSeatInSync?.face_samples, otherSeatInSync?.custom_perms],
        bbcStillIntact20,
        delOk: [!(arAfterDel.json?.custom || []).some(c => c.id === 'cr-r3-del'), !(srAfterDel.json?.reviews && srAfterDel.json.reviews['sr-r3-wtc-del'])],
        mirrored: [mirroredBothSeat?.pbi_access, mirroredBothSeat?.pin_code, mirroredBothSeat?.pin_redacted, mirroredBothStillLogsIn.status],
        unauthUsers: [unauthUsers20.status, Boolean(unauthUsers20.json?.users)],
        jwt: [forgedVerify, signEmptyThrew]
      }));
    }

    // 21. Round-4 Negative Probes: `PIN + Face ID 2FA` Wrong-Face & Coworker-Face Block + Single-BU Supervisor Coworker PIN Redaction/Write-Lock
    const pinPlusWrongFace = await httpReq('POST', '/app/api/auth/login', {
      email: 'faceverify@bhfirms.com',
      pin: '7412',
      method: 'PIN + Face ID 2FA',
      face_descriptor: vecFar
    }, { 'CF-Connecting-IP': '198.51.100.20' });
    const pinPlusCoworkerFace = await httpReq('POST', '/app/api/auth/login', {
      email: 'both2fa@bhfirms.com',
      pin: '8520',
      method: 'PIN + Face ID 2FA',
      face_descriptor: vecNear
    }, { 'CF-Connecting-IP': '198.51.100.20' });
    const pinPlusRightFace = await httpReq('POST', '/app/api/auth/login', {
      email: 'faceverify@bhfirms.com',
      pin: '7412',
      method: 'PIN + Face ID 2FA',
      face_descriptor: vecNear
    });
    const wtcSupTok = String(bothCombinedOk.json?.token || '');
    const wtcSupUsersGet = await httpReq('GET', '/app/api/users', null, { 'X-ISABI-Session': wtcSupTok });
    const wtcSupCoworker = (wtcSupUsersGet.json?.users || []).find(u => u.email === 'faceverify@bhfirms.com');
    const wtcSupSyncGet = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': wtcSupTok });
    const wtcSupSyncCoworker = (wtcSupSyncGet.json?.docs?.mfg_web_store?.users || []).find(u => u && u.email === 'faceverify@bhfirms.com');
    const wtcSupPinTamper = await httpReq('POST', '/app/api/users', {
      user: {
        id: 'u-face-verify',
        email: 'faceverify@bhfirms.com',
        full_name: 'Face Verify Seat',
        role: 'Entry',
        companies: 'WTC',
        pin_code: '9482',
        custom_perms: JSON.stringify({ rights: { modify_text: true } })
      }
    }, { 'X-ISABI-Session': wtcSupTok });
    const ownerCheck21 = await httpReq('GET', '/app/api/users', null, { 'X-ISABI-Session': ownerToken });
    const faceSeatAfterSup = (ownerCheck21.json?.users || []).find(u => u.email === 'faceverify@bhfirms.com');
    const faceSeatTamper9999Denied = await httpReq('POST', '/app/api/auth/login', {
      email: 'faceverify@bhfirms.com',
      pin: '9482',
      method: 'PIN + Face ID 2FA',
      face_descriptor: vecNear
    }, { 'CF-Connecting-IP': '198.51.100.21' });
    const faceSeatOrig7412Ok = await httpReq('POST', '/app/api/auth/login', {
      email: 'faceverify@bhfirms.com',
      pin: '7412',
      method: 'PIN + Face ID 2FA',
      face_descriptor: vecNear
    });

    if (
      pinPlusWrongFace.status === 401 &&
      pinPlusCoworkerFace.status === 401 &&
      pinPlusRightFace.status === 200 &&
      wtcSupCoworker?.pin_code === undefined &&
      wtcSupCoworker?.pin_redacted === true &&
      wtcSupCoworker?.face_enrolled === true &&
      wtcSupCoworker?.face_redacted === true &&
      wtcSupCoworker?.face_samples === undefined &&
      wtcSupSyncCoworker?.pin_code === undefined &&
      wtcSupSyncCoworker?.pin_redacted === true &&
      wtcSupPinTamper.status === 200 &&
      faceSeatAfterSup?.pin_code === undefined &&
      faceSeatAfterSup?.pin_redacted === true &&
      faceSeatTamper9999Denied.status === 401 &&
      faceSeatOrig7412Ok.status === 200
    ) {
      pass(
        'edge-21-pin-plus-face2fa-enforcement-and-supervisor-pin-isolation',
        'PIN+Face 2FA blocks wrong & coworker faces (401), all seats pin_redacted=true over HTTP, Supervisor cannot overwrite coworker PIN (7412 preserved)'
      );
    } else {
      fail('edge-21-pin-plus-face2fa-enforcement-and-supervisor-pin-isolation', JSON.stringify({
        twoFa: [pinPlusWrongFace.status, pinPlusCoworkerFace.status, pinPlusRightFace.status],
        supGet: [wtcSupCoworker?.pin_code, wtcSupCoworker?.pin_redacted, wtcSupCoworker?.face_redacted, wtcSupCoworker?.face_samples],
        supSync: [wtcSupSyncCoworker?.pin_code, wtcSupSyncCoworker?.pin_redacted],
        afterTamperPin: [faceSeatAfterSup?.pin_code, faceSeatAfterSup?.pin_redacted, faceSeatTamper9999Denied.status, faceSeatOrig7412Ok.status]
      }));
    }

    // 22. C1 + L1: Block `GET /app/api/records?table=users`, Zero Raw `face_samples` in All HTTP Responses, Auth-Gated `verify_only` Face Check, & Server-Side Logout Revocation
    const entryUsersTableLeak = await httpReq('GET', '/app/api/records?table=users', null, { 'X-ISABI-Session': entryToken });
    const ownerUsersTableLeak = await httpReq('GET', '/app/api/records?table=users', null, { 'X-ISABI-Session': ownerToken });
    const ownerUsers22 = await httpReq('GET', '/app/api/users', null, { 'X-ISABI-Session': ownerToken });
    const ownerSync22 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const anyRawFaceUsers = (ownerUsers22.json?.users || []).some(u => Array.isArray(u && u.face_samples));
    const anyRawFaceSync = (ownerSync22.json?.docs?.mfg_web_store?.users || []).some(u => Array.isArray(u && u.face_samples));
    const verifyOnlyFaceUnauth = await httpReq('POST', '/app/api/auth/login', {
      method: 'Face ID',
      verify_only: true,
      face_descriptor: vecNear
    });
    const verifyOnlyFaceAuth = await httpReq('POST', '/app/api/auth/login', {
      method: 'Face ID',
      verify_only: true,
      face_descriptor: vecNear
    }, { 'X-ISABI-Session': ownerToken });
    const logoutLogin = await httpReq('POST', '/app/api/auth/login', {
      email: ENTRY_TEST_EMAIL,
      pin: '3333',
      method: 'PIN'
    });
    const revocableTok = String(logoutLogin.json?.token || '');
    const preLogoutGet = await httpReq('GET', '/app/api/records?table=expenses&company=WTC&limit=2', null, { 'X-ISABI-Session': revocableTok });
    const doLogoutRes = await httpReq('POST', '/app/api/auth/logout', {}, { 'X-ISABI-Session': revocableTok });
    const postLogoutReplay = await httpReq('GET', '/app/api/records?table=expenses&company=WTC&limit=2', null, { 'X-ISABI-Session': revocableTok });
    if (
      entryUsersTableLeak.status === 403 &&
      ownerUsersTableLeak.status === 403 &&
      !anyRawFaceUsers &&
      !anyRawFaceSync &&
      verifyOnlyFaceUnauth.status === 401 &&
      !verifyOnlyFaceUnauth.json?.user &&
      verifyOnlyFaceAuth.status === 200 &&
      verifyOnlyFaceAuth.json?.verify_only === true &&
      !verifyOnlyFaceAuth.json?.token &&
      !verifyOnlyFaceAuth.headers['set-cookie'] &&
      preLogoutGet.status === 200 &&
      doLogoutRes.status === 200 &&
      postLogoutReplay.status === 401
    ) {
      pass(
        'edge-22-users-table-block-biometric-redaction-and-logout-revocation',
        'records?table=users=403, 0 raw face_samples over HTTP, unauth verify_only=401, authed verify_only=200, replayed JWT after logout=401'
      );
    } else {
      fail('edge-22-users-table-block-biometric-redaction-and-logout-revocation', JSON.stringify({
        tbl: [entryUsersTableLeak.status, ownerUsersTableLeak.status],
        rawFace: [anyRawFaceUsers, anyRawFaceSync],
        verifyOnly: [verifyOnlyFaceUnauth.status, verifyOnlyFaceAuth.status, verifyOnlyFaceAuth.json?.verify_only, Boolean(verifyOnlyFaceAuth.json?.token), Boolean(verifyOnlyFaceAuth.headers['set-cookie'])],
        logout: [preLogoutGet.status, doLogoutRes.status, postLogoutReplay.status]
      }));
    }

    // 23. H1 + M1: Single-BU Supervisor RLS on `geo_config.companyHubs`, `work_schedules` (`{ op, work_schedules }` envelope), & `alert_rules`
    const bbcGeoCrossHub = await httpReq('POST', '/app/api/geo_config', {
      config: {
        companyHubs: {
          wtc: { lat: 33.01, lng: 35.01, updated_at: '2026-11-08T16:00:00.000Z' }
        }
      }
    }, { 'X-ISABI-Session': bbcSupToken });
    const bbcWsGlobalPolicy = await httpReq('POST', '/app/api/work_schedules', {
      op: 'upsert_policy_group',
      work_schedules: {
        shiftTypes: [],
        policyGroups: [{ id: 'pkg_tamper', name: 'Tampered Global Policy', updated_at: '2026-11-08T16:00:00.000Z' }],
        companyPolicyDefaults: {},
        staffRules: {}
      }
    }, { 'X-ISABI-Session': bbcSupToken });
    const bbcWsCrossShift = await httpReq('POST', '/app/api/work_schedules', {
      op: 'upsert_shift',
      work_schedules: {
        shiftTypes: [{ id: 'shf_wtc_tamper', company: 'WTC', name: 'Cross-BU Shift', updated_at: '2026-11-08T16:00:00.000Z' }],
        policyGroups: [],
        companyPolicyDefaults: {},
        staffRules: {}
      }
    }, { 'X-ISABI-Session': bbcSupToken });
    const ownerWsEnvelope = await httpReq('POST', '/app/api/work_schedules', {
      op: 'upsert_shift',
      id: 'shf_owner_ok',
      work_schedules: {
        shiftTypes: [{ id: 'shf_owner_ok', company: 'WTC', name: 'Owner Valid Shift', start_time: '07:00', end_time: '15:00', updated_at: '2026-11-08T16:01:00.000Z' }],
        policyGroups: [{ id: 'pkg_owner_ok', name: 'Owner Policy', updated_at: '2026-11-08T16:01:00.000Z' }],
        companyPolicyDefaults: { WTC: { policy_group_id: 'pkg_owner_ok', updated_at: '2026-11-08T16:01:00.000Z' } },
        staffRules: {}
      }
    }, { 'X-ISABI-Session': ownerToken });
    const ownerWsRead = await httpReq('GET', '/app/api/work_schedules', null, { 'X-ISABI-Session': ownerToken });
    const wsSaved = ownerWsRead.json?.work_schedules || {};
    const bbcArGlobalOverride = await httpReq('POST', '/app/api/alert_rules', {
      overrides: { 'mfg.margin_drop': { enabled: false, updated_at: '2026-11-08T16:02:00.000Z' } },
      custom: []
    }, { 'X-ISABI-Session': bbcSupToken });
    const bbcArCrossCustom = await httpReq('POST', '/app/api/alert_rules', {
      overrides: {},
      custom: [{ id: 'ar-wtc-tamper', company: 'WTC', title: 'Unauthorized WTC Rule', updated_at: '2026-11-08T16:02:00.000Z' }]
    }, { 'X-ISABI-Session': bbcSupToken });
    const bbcArOwnCustom = await httpReq('POST', '/app/api/alert_rules', {
      overrides: {},
      custom: [{ id: 'ar-bbc-ok', company: 'BBConstruction', title: 'Valid BBC Rule', updated_at: '2026-11-08T16:02:00.000Z' }]
    }, { 'X-ISABI-Session': bbcSupToken });
    if (
      bbcGeoCrossHub.status === 403 &&
      bbcWsGlobalPolicy.status === 403 &&
      bbcWsCrossShift.status === 403 &&
      ownerWsEnvelope.status === 200 &&
      !wsSaved.op &&
      Array.isArray(wsSaved.shiftTypes) &&
      wsSaved.shiftTypes.some(s => s && s.id === 'shf_owner_ok') &&
      Array.isArray(wsSaved.policyGroups) &&
      wsSaved.policyGroups.some(g => g && g.id === 'pkg_owner_ok') &&
      bbcArGlobalOverride.status === 403 &&
      bbcArCrossCustom.status === 403 &&
      bbcArOwnCustom.status === 200
    ) {
      pass(
        'edge-23-supervisor-rls-on-geoconfig-workschedules-and-alertrules',
        'Cross-BU companyHubs=403, global/cross-BU work_schedules=403, {op,work_schedules} envelope unwrapped cleanly, cross-BU/global alert_rules=403'
      );
    } else {
      fail('edge-23-supervisor-rls-on-geoconfig-workschedules-and-alertrules', JSON.stringify({
        geo: bbcGeoCrossHub.status,
        ws: [bbcWsGlobalPolicy.status, bbcWsCrossShift.status, ownerWsEnvelope.status, Boolean(wsSaved.op), (wsSaved.shiftTypes || []).length, (wsSaved.policyGroups || []).length],
        ar: [bbcArGlobalOverride.status, bbcArCrossCustom.status, bbcArOwnCustom.status]
      }));
    }

    // 24. H2 + M3: Phone-Scan Unauthenticated `sid` Block + Companion Upload Cap (`413`) + Injective R2 Key (`att/1` vs `att_1`) & DELETE Symmetry
    const psSid24 = 'pssec_' + Date.now();
    const psTok24 = 'pstok_' + Date.now();
    const unauthNewSid = await httpReq('POST', '/app/api/phone-scan', {
      sid: psSid24,
      k: psTok24,
      pages: [{ id: 'rogue1', mimeType: 'image/png', dataUrl: tinyPngDataUrl }]
    });
    const authedInitSid = await httpReq('POST', '/app/api/phone-scan', {
      sid: psSid24,
      k: psTok24,
      status: 'waiting'
    }, { 'X-ISABI-Session': ownerToken });
    const companionValidPush = await httpReq('POST', '/app/api/phone-scan', {
      sid: psSid24,
      k: psTok24,
      pages: [{ id: 'page1', mimeType: 'image/png', dataUrl: tinyPngDataUrl }]
    });
    const oversizedPageUrl = 'data:image/jpeg;base64,' + 'A'.repeat(5_700_000);
    const companionOversized = await httpReq('POST', '/app/api/phone-scan', {
      sid: psSid24,
      k: psTok24,
      pages: [{ id: 'huge1', mimeType: 'image/jpeg', dataUrl: oversizedPageUrl }]
    });
    const blobSlashId = `att/${Date.now()}`;
    const blobUnderId = blobSlashId.replace('/', '_');
    const dataUrlA = 'data:text/plain;base64,' + Buffer.from('payload-slash-A').toString('base64');
    const dataUrlB = 'data:text/plain;base64,' + Buffer.from('payload-under-B').toString('base64');
    await httpReq('POST', '/app/api/blobs', { id: blobSlashId, company: 'WTC', dataUrl: dataUrlA }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/blobs', { id: blobUnderId, company: 'WTC', dataUrl: dataUrlB }, { 'X-ISABI-Session': ownerToken });
    const getSlashBefore = await httpReq('GET', `/app/api/blobs?id=${encodeURIComponent(blobSlashId)}`, null, { 'X-ISABI-Session': ownerToken });
    const getUnderBefore = await httpReq('GET', `/app/api/blobs?id=${encodeURIComponent(blobUnderId)}`, null, { 'X-ISABI-Session': ownerToken });
    const delSlashRes = await httpReq('DELETE', `/app/api/blobs?id=${encodeURIComponent(blobSlashId)}`, null, { 'X-ISABI-Session': ownerToken });
    const getSlashAfter = await httpReq('GET', `/app/api/blobs?id=${encodeURIComponent(blobSlashId)}`, null, { 'X-ISABI-Session': ownerToken });
    const getUnderAfter = await httpReq('GET', `/app/api/blobs?id=${encodeURIComponent(blobUnderId)}`, null, { 'X-ISABI-Session': ownerToken });
    if (
      unauthNewSid.status === 401 &&
      authedInitSid.status === 200 &&
      companionValidPush.status === 200 &&
      companionOversized.status === 413 &&
      getSlashBefore.json?.dataUrl === dataUrlA &&
      getUnderBefore.json?.dataUrl === dataUrlB &&
      delSlashRes.status === 200 &&
      getSlashAfter.json?.found === false &&
      getUnderAfter.json?.found === true &&
      getUnderAfter.json?.dataUrl === dataUrlB
    ) {
      pass(
        'edge-24-phonescan-auth-quota-and-injective-r2-blob-delete-symmetry',
        'Unauth new sid=401, companion push=200, >4MB page=413, att/X vs att_X collision-free & DELETE purges only target R2 key'
      );
    } else {
      fail('edge-24-phonescan-auth-quota-and-injective-r2-blob-delete-symmetry', JSON.stringify({
        ps: [unauthNewSid.status, authedInitSid.status, companionValidPush.status, companionOversized.status],
        blobs: [getSlashBefore.json?.dataUrl === dataUrlA, getUnderBefore.json?.dataUrl === dataUrlB, delSlashRes.status, getSlashAfter.json?.found, getUnderAfter.json?.found]
      }));
    }

    // 25. H3 + C2: Browser Demo Sandbox `localStorage` & Session Token Isolation + Zero External Relay Config
    await evalJs(`(() => {
      localStorage.setItem('isabi_mfg_custom_recs_v2', JSON.stringify({ expenses: [{ id: 'prod-real-row', amount: 12345 }] }));
      localStorage.setItem('isabi_mfg_edge_sess_tok_v1', 'prod-real-jwt-sentinel');
      localStorage.setItem('isabi_mfg_last_seat', 'husseinbdeir@bhfirms.com');
      return true;
    })()`);
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/app/?demo=1&autologin=1` });
    for (let i = 0; i < 30; i++) {
      const rdy = await evalJs(`Boolean(window.MFG_SEED && window.MFG_SEED._recordsReady && document.querySelector('#workspace'))`);
      if (rdy) break;
      await sleep(300);
    }
    await sleep(600);
    const demoIsolationProbe = await evalJs(`(() => {
      const prodRecsBefore = localStorage.getItem('isabi_mfg_custom_recs_v2');
      const prodTokBefore = localStorage.getItem('isabi_mfg_edge_sess_tok_v1');
      // Trigger a Demo Sandbox state save + signOut click
      if (window.GEO_DISPATCH && typeof window.GEO_DISPATCH.persistHubPin === 'function') {
        window.GEO_DISPATCH.persistHubPin('wtc', 33.88, 35.51, 'Demo Hub Move');
      }
      const signOutBtn = document.getElementById('signOutBtn');
      if (signOutBtn) signOutBtn.click();
      return {
        isDemo: Boolean(window.__ISABI_IS_DEMO && window.__ISABI_IS_DEMO()),
        cloudCfgU: window.MFG_CLOUD_CFG && window.MFG_CLOUD_CFG.u,
        askCfgU: window.MFG_ASK_CFG && window.MFG_ASK_CFG.u,
        prodRecsBefore,
        prodRecsAfter: localStorage.getItem('isabi_mfg_custom_recs_v2'),
        prodTokAfter: localStorage.getItem('isabi_mfg_edge_sess_tok_v1'),
        prodLastSeatAfter: localStorage.getItem('isabi_mfg_last_seat'),
        prodGeoHubs: localStorage.getItem('isabi_mfg_geo_hubs_v1')
      };
    })()`);
    if (
      demoIsolationProbe?.isDemo === true &&
      !demoIsolationProbe?.cloudCfgU &&
      !demoIsolationProbe?.askCfgU &&
      demoIsolationProbe?.prodRecsAfter === JSON.stringify({ expenses: [{ id: 'prod-real-row', amount: 12345 }] }) &&
      demoIsolationProbe?.prodTokAfter === 'prod-real-jwt-sentinel' &&
      demoIsolationProbe?.prodLastSeatAfter === 'husseinbdeir@bhfirms.com' &&
      demoIsolationProbe?.prodGeoHubs === null
    ) {
      pass(
        'edge-25-demo-sandbox-localstorage-isolation-and-zero-relay-config',
        'Demo Sandbox writes strictly to sessionStorage, signOut preserves real JWT & localStorage, MFG_CLOUD_CFG/MFG_ASK_CFG zeroed'
      );
    } else {
      fail('edge-25-demo-sandbox-localstorage-isolation-and-zero-relay-config', JSON.stringify(demoIsolationProbe));
    }

    // 26. H-NEW-1: Fail-Closed `verifyActiveEdgeSession` on Logged-Out Owner Impersonation, `sid`-Less JWTs, & Suspended Seats
    const tempOwnerLogin26 = await httpReq('POST', '/app/api/auth/login', {
      email: 'husseinbdeir@bhfirms.com',
      pin: '1111',
      method: 'PIN'
    });
    const tempOwnerTok26 = String(tempOwnerLogin26.json?.token || '');
    const impersBeforeLogout = await httpReq('POST', '/app/api/auth/login', {
      email: ENTRY_TEST_EMAIL,
      method: 'Owner Impersonation'
    }, { 'X-ISABI-Session': tempOwnerTok26 });
    // 26b. A seat preview (Owner Impersonation) is reported by /auth/me and lasts 12 hours, not two weeks;
    //      an ordinary sign-in is neither (the app never resumes a preview on a fresh open).
    const impersTok26 = String(impersBeforeLogout.json?.token || '');
    const impersMe26 = await httpReq('GET', '/app/api/auth/me?pv=1', null, { 'X-ISABI-Session': impersTok26 });
    const ownerMe26 = await httpReq('GET', '/app/api/auth/me?pv=1', null, { 'X-ISABI-Session': tempOwnerTok26 });
    // An app version from before the rule asks without ?pv=1: a preview is no session to resume for it,
    // an ordinary sign-in still is.
    const impersMeOldApp26 = await httpReq('GET', '/app/api/auth/me', null, { 'X-ISABI-Session': impersTok26 });
    const ownerMeOldApp26 = await httpReq('GET', '/app/api/auth/me', null, { 'X-ISABI-Session': tempOwnerTok26 });
    // 26c. The 12 hours are counted from the session's start, whatever the token says: a preview started
    //      13 hours ago is no session at all (a token issued before the rule ran for 14 days), a fresh one is.
    const previewTok26c = sid => mintTestJwt({ sid, sub: 'u1', email: 'husseinbdeir@bhfirms.com', role: 'Full Access (Owner)', companies: 'All' });
    const oldPreviewMe26 = await httpReq('GET', '/app/api/auth/me?pv=1', null, { 'X-ISABI-Session': previewTok26c('sess-e26c-old-preview') });
    const oldPreviewRecs26 = await httpReq('GET', '/app/api/records?table=expenses&company=WTC&limit=1', null, { 'X-ISABI-Session': previewTok26c('sess-e26c-old-preview') });
    const freshPreviewMe26 = await httpReq('GET', '/app/api/auth/me?pv=1', null, { 'X-ISABI-Session': previewTok26c('sess-e26c-fresh-preview') });
    const freshPreviewRecs26 = await httpReq('GET', '/app/api/records?table=expenses&company=WTC&limit=1', null, { 'X-ISABI-Session': previewTok26c('sess-e26c-fresh-preview') });
    const cookieOf26 = res => [].concat(res.headers['set-cookie'] || []).join('; ');
    const jwtLife26 = tok => {
      try {
        const p = JSON.parse(Buffer.from(String(tok).split('.')[1], 'base64url').toString('utf8'));
        return Number(p.exp) - Number(p.iat);
      } catch (_) { return -1; }
    };
    const preview26 = {
      impersMe: [impersMe26.status, impersMe26.json?.authenticated, impersMe26.json?.impersonated, String(impersMe26.json?.user?.email || '').toLowerCase()],
      ownerMe: [ownerMe26.status, ownerMe26.json?.authenticated, ownerMe26.json?.impersonated],
      impersLife: jwtLife26(impersTok26),
      ownerLife: jwtLife26(tempOwnerTok26),
      impersCookie12h: /isabi_edge_sess=[^;]+;.*Max-Age=43200\b/.test(cookieOf26(impersBeforeLogout)),
      ownerCookie14d: /isabi_edge_sess=[^;]+;.*Max-Age=1209600\b/.test(cookieOf26(tempOwnerLogin26)),
      oldApp: [impersMeOldApp26.json?.authenticated, impersMeOldApp26.json?.user == null, ownerMeOldApp26.json?.authenticated],
      oldPreview: [oldPreviewMe26.json?.authenticated, oldPreviewRecs26.status],
      freshPreview: [freshPreviewMe26.json?.authenticated, freshPreviewMe26.json?.impersonated, freshPreviewRecs26.status]
    };
    if (
      preview26.oldApp[0] === false && preview26.oldApp[1] === true && preview26.oldApp[2] === true &&
      preview26.oldPreview[0] === false && preview26.oldPreview[1] === 401 &&
      preview26.freshPreview[0] === true && preview26.freshPreview[1] === true && preview26.freshPreview[2] === 200
    ) {
      pass(
        'edge-26c-seat-preview-12h-from-start-and-hidden-from-older-apps',
        'a preview started 13 h ago is no session (401) though its token is valid; a fresh one is; /auth/me without ?pv=1 shows a preview as no session and an ordinary sign-in as before'
      );
    } else {
      fail('edge-26c-seat-preview-12h-from-start-and-hidden-from-older-apps', JSON.stringify(preview26));
    }
    if (
      preview26.impersMe[0] === 200 && preview26.impersMe[1] === true && preview26.impersMe[2] === true &&
      preview26.impersMe[3] === String(ENTRY_TEST_EMAIL).toLowerCase() &&
      preview26.ownerMe[0] === 200 && preview26.ownerMe[1] === true && preview26.ownerMe[2] === false &&
      preview26.impersLife === 43200 && preview26.ownerLife === 1209600 &&
      preview26.impersCookie12h && preview26.ownerCookie14d
    ) {
      pass(
        'edge-26b-seat-preview-session-flagged-and-short-lived',
        '/auth/me impersonated=true for a seat preview and false for an ordinary sign-in; preview token and cookie 12 h, ordinary 14 d'
      );
    } else {
      fail('edge-26b-seat-preview-session-flagged-and-short-lived', JSON.stringify(preview26));
    }
    await httpReq('POST', '/app/api/auth/logout', {}, { 'X-ISABI-Session': tempOwnerTok26 });
    const impersAfterLogout = await httpReq('POST', '/app/api/auth/login', {
      email: ENTRY_TEST_EMAIL,
      method: 'Owner Impersonation'
    }, { 'X-ISABI-Session': tempOwnerTok26 });
    const sidlessOwnerTok = mintTestJwt({
      sub: 'u1',
      email: 'husseinbdeir@bhfirms.com',
      role: 'Full Access (Owner)',
      companies: 'All'
    });
    const sidlessRecsRes = await httpReq('GET', '/app/api/records?table=expenses&company=WTC&limit=1', null, {
      'X-ISABI-Session': sidlessOwnerTok
    });
    const sidlessImpersRes = await httpReq('POST', '/app/api/auth/login', {
      email: ENTRY_TEST_EMAIL,
      method: 'Owner Impersonation'
    }, { 'X-ISABI-Session': sidlessOwnerTok });
    await httpReq('POST', '/app/api/users', {
      user: {
        id: 'u-suspend-26',
        email: 'suspend26@bhfirms.com',
        full_name: 'Suspend Test Seat',
        role: 'Supervisor',
        companies: 'WTC',
        pin_code: '5184',
        status: 'Active'
      }
    }, { 'X-ISABI-Session': ownerToken });
    const suspLogin26 = await httpReq('POST', '/app/api/auth/login', {
      email: 'suspend26@bhfirms.com',
      pin: '5184',
      method: 'PIN'
    });
    const suspTok26 = String(suspLogin26.json?.token || '');
    const suspBefore = await httpReq('GET', '/app/api/records?table=expenses&company=WTC&limit=1', null, { 'X-ISABI-Session': suspTok26 });
    await httpReq('POST', '/app/api/users', {
      user: {
        id: 'u-suspend-26',
        email: 'suspend26@bhfirms.com',
        full_name: 'Suspend Test Seat',
        role: 'Supervisor',
        companies: 'WTC',
        pin_code: '5184',
        status: 'Suspended'
      }
    }, { 'X-ISABI-Session': ownerToken });
    const suspAfter = await httpReq('GET', '/app/api/records?table=expenses&company=WTC&limit=1', null, { 'X-ISABI-Session': suspTok26 });
    if (
      impersBeforeLogout.status === 200 &&
      Boolean(impersBeforeLogout.json?.token) &&
      impersAfterLogout.status === 401 &&
      !impersAfterLogout.json?.token &&
      sidlessRecsRes.status === 401 &&
      sidlessImpersRes.status === 401 &&
      suspBefore.status === 200 &&
      suspAfter.status === 401
    ) {
      pass(
        'edge-26-failclosed-active-session-impersonation-sidless-and-suspended',
        'Logged-out Owner Impersonation=401, sid-less Owner JWT=401, newly Suspended seat immediately revoked=401'
      );
    } else {
      fail('edge-26-failclosed-active-session-impersonation-sidless-and-suspended', JSON.stringify({
        impersBefore: impersBeforeLogout.status,
        impersAfter: impersAfterLogout.status,
        sidlessRecs: sidlessRecsRes.status,
        sidlessImpers: sidlessImpersRes.status,
        susp: [suspBefore.status, suspAfter.status]
      }));
    }

    // 27. H-NEW-2 + M-NEW-1 + M-NEW-2: Sub-Store Split-Brain Prevention, Read-Side RLS, & Timestamp Merge (`alert_rules` + `work_schedules` <-> `sync`)
    const ts27a = '2026-11-08T17:00:00.000Z';
    const ts27b = '2026-11-08T17:05:00.000Z';
    const ts27c = '2026-11-08T17:10:00.000Z';
    await httpReq('POST', '/app/api/alert_rules', {
      overrides: {},
      custom: [{ id: 'ar-bbc-27', company: 'BBConstruction', title: 'BBC Direct Rule 27', updated_at: ts27a }]
    }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/work_schedules', {
      op: 'upsert_shift',
      work_schedules: {
        shiftTypes: [{ id: 'shf-bbc-27', company: 'BBConstruction', name: 'BBC Shift 27', start_time: '06:00', end_time: '14:00', updated_at: ts27a }],
        policyGroups: [],
        companyPolicyDefaults: { BBConstruction: { policy_group_id: 'pkg_owner_ok', updated_at: ts27a } },
        staffRules: { 'bbconstruction|ali_bbc_27': { company: 'BBConstruction', shift_id: 'shf-bbc-27', updated_at: ts27a } }
      }
    }, { 'X-ISABI-Session': ownerToken });

    // WTC Supervisor reads `/app/api/alert_rules`, `/app/api/work_schedules`, and `/app/api/sync` (`get_mfg`) -> 0 BBC leaks
    const wtcArGet27 = await httpReq('GET', '/app/api/alert_rules', null, { 'X-ISABI-Session': wtcSupTok });
    const wtcWsGet27 = await httpReq('GET', '/app/api/work_schedules', null, { 'X-ISABI-Session': wtcSupTok });
    const wtcSyncGet27a = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': wtcSupTok });
    const wtcSyncDoc27a = wtcSyncGet27a.json?.docs?.mfg_web_store || {};
    const leakArDirect = (wtcArGet27.json?.custom || []).some(c => c && c.company === 'BBConstruction');
    const leakWsShiftDirect = (wtcWsGet27.json?.work_schedules?.shiftTypes || []).some(s => s && s.company === 'BBConstruction');
    const leakWsRuleDirect = Boolean(wtcWsGet27.json?.work_schedules?.staffRules?.['bbconstruction|ali_bbc_27']);
    const leakWsDefDirect = Boolean(wtcWsGet27.json?.work_schedules?.companyPolicyDefaults?.BBConstruction);
    const leakSyncAr = (wtcSyncDoc27a.alertRules?.custom || []).some(c => c && c.company === 'BBConstruction');
    const leakSyncWs = (wtcSyncDoc27a.workSchedules?.shiftTypes || []).some(s => s && s.company === 'BBConstruction') || Boolean(wtcSyncDoc27a.workSchedules?.staffRules?.['bbconstruction|ali_bbc_27']);

    // WTC Supervisor posts read-scoped `work_schedules` adding WTC shift + rule -> merges cleanly without clobbering BBC
    const wtcWsPayload27 = JSON.parse(JSON.stringify(wtcWsGet27.json?.work_schedules || { shiftTypes: [], policyGroups: [], companyPolicyDefaults: {}, staffRules: {} }));
    wtcWsPayload27.shiftTypes = [...(wtcWsPayload27.shiftTypes || []), { id: 'shf-wtc-direct-27', company: 'WTC', name: 'WTC Direct Shift', start_time: '08:00', end_time: '16:00', updated_at: ts27b }];
    wtcWsPayload27.staffRules = Object.assign({}, wtcWsPayload27.staffRules || {}, {
      'wtc|rami_wtc_27': { company: 'WTC', shift_id: 'shf-wtc-direct-27', updated_at: ts27b }
    });
    const wtcWsPost27 = await httpReq('POST', '/app/api/work_schedules', {
      op: 'upsert_shift',
      work_schedules: wtcWsPayload27
    }, { 'X-ISABI-Session': wtcSupTok });
    // Adversarial: WTC Supervisor tries to spoof `company: 'WTC'` onto existing `ali_bbc_27` (`BBConstruction`) -> 403
    const wtcSpoofBbcRule27 = await httpReq('POST', '/app/api/work_schedules', {
      op: 'upsert_staff_rule',
      work_schedules: {
        shiftTypes: [],
        policyGroups: [],
        companyPolicyDefaults: {},
        staffRules: { 'bbconstruction|ali_bbc_27': { company: 'WTC', shift_id: 'shf-wtc-direct-27', updated_at: ts27c } }
      }
    }, { 'X-ISABI-Session': wtcSupTok });

    // WTC Supervisor now runs `POST /app/api/sync` (`op: 'patch'`) adding `ar-wtc-sync-27` + `shf-wtc-sync-27` -> BBC entries MUST survive in SQL + KV!
    const wtcSyncGet27b = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': wtcSupTok });
    const wtcPushDoc27 = JSON.parse(JSON.stringify(wtcSyncGet27b.json?.docs?.mfg_web_store || {}));
    wtcPushDoc27.updatedAt = new Date(Date.now() + 25000).toISOString();
    wtcPushDoc27.alertRules = {
      overrides: Object.assign({}, wtcPushDoc27.alertRules?.overrides || {}),
      custom: [...(wtcPushDoc27.alertRules?.custom || []), { id: 'ar-wtc-sync-27', company: 'WTC', title: 'WTC Sync Rule 27', updated_at: ts27c }]
    };
    wtcPushDoc27.workSchedules = Object.assign({}, wtcPushDoc27.workSchedules || {}, {
      shiftTypes: [...(wtcPushDoc27.workSchedules?.shiftTypes || []), { id: 'shf-wtc-sync-27', company: 'WTC', name: 'WTC Sync Shift 27', start_time: '09:00', end_time: '17:00', updated_at: ts27c }]
    });
    const wtcSyncPatch27 = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: String(wtcSyncGet27b.json?.docs?.mfg_web_store?.updatedAt || ''),
      awaitMirror: true,
      patch: { mfg_web_store: Object.assign({}, wtcPushDoc27, { minShellVer: MIN_SYNC_SHELL_VER }) }
    }, { 'X-ISABI-Session': wtcSupTok });

    const ownerArAfter27 = await httpReq('GET', '/app/api/alert_rules', null, { 'X-ISABI-Session': ownerToken });
    const ownerWsAfter27 = await httpReq('GET', '/app/api/work_schedules', null, { 'X-ISABI-Session': ownerToken });
    const ownerSyncAfter27 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const oaCust = ownerArAfter27.json?.custom || [];
    const ows = ownerWsAfter27.json?.work_schedules || {};
    const osDoc = ownerSyncAfter27.json?.docs?.mfg_web_store || {};
    if (
      !leakArDirect &&
      !leakWsShiftDirect &&
      !leakWsRuleDirect &&
      !leakWsDefDirect &&
      !leakSyncAr &&
      !leakSyncWs &&
      wtcWsPost27.status === 200 &&
      wtcSpoofBbcRule27.status === 403 &&
      wtcSyncPatch27.status === 200 &&
      oaCust.some(c => c && c.id === 'ar-bbc-27') &&
      oaCust.some(c => c && c.id === 'ar-wtc-sync-27') &&
      (ows.shiftTypes || []).some(s => s && s.id === 'shf-bbc-27') &&
      (ows.shiftTypes || []).some(s => s && s.id === 'shf-wtc-direct-27') &&
      (ows.shiftTypes || []).some(s => s && s.id === 'shf-wtc-sync-27') &&
      ows.staffRules?.['bbconstruction|ali_bbc_27']?.company === 'BBConstruction' &&
      ows.staffRules?.['wtc|rami_wtc_27']?.company === 'WTC' &&
      Boolean(ows.companyPolicyDefaults?.BBConstruction) &&
      (osDoc.alertRules?.custom || []).some(c => c && c.id === 'ar-bbc-27') &&
      (osDoc.workSchedules?.shiftTypes || []).some(s => s && s.id === 'shf-bbc-27')
    ) {
      pass(
        'edge-27-substore-sync-splitbrain-prevention-read-rls-and-ws-merge',
        '0 cross-BU leaks on alert_rules/work_schedules/sync, spoofed BBC staffRule=403, WTC Supervisor sync + direct writes preserve BBC rules & shifts 100%'
      );
    } else {
      fail('edge-27-substore-sync-splitbrain-prevention-read-rls-and-ws-merge', JSON.stringify({
        leaks: [leakArDirect, leakWsShiftDirect, leakWsRuleDirect, leakWsDefDirect, leakSyncAr, leakSyncWs],
        statuses: [wtcWsPost27.status, wtcSpoofBbcRule27.status, wtcSyncPatch27.status],
        arIds: oaCust.map(c => c.id),
        wsShifts: (ows.shiftTypes || []).map(s => s.id),
        aliCo: ows.staffRules?.['bbconstruction|ali_bbc_27']?.company,
        ramiCo: ows.staffRules?.['wtc|rami_wtc_27']?.company,
        bbcDef: Boolean(ows.companyPolicyDefaults?.BBConstruction)
      }));
    }

    // 28. Non-Local TDZ Boot Guard, Cookie-Only Auth, R2 Seed Gate & Redacted Edge 128-d Face ID + PIN Browser E2E
    const vec28 = Array.from({ length: 128 }, (_, i) => Number((Math.sin((i + 1) * 0.41) * 0.22).toFixed(5)));
    // Boundary vector at Euclidean L2 distance d = 0.490 (strictly inside 0.48 < d <= 0.50)
    const vec28Boundary = vec28.map((v, i) => (i === 0 ? Number((v + 0.49).toFixed(5)) : v));
    const vec28Both = vec28.map(v => Number((-v).toFixed(5)));
    const vec28PinOnly = Array.from({ length: 128 }, (_, i) => Number((Math.sin((i + 7) * 0.29) * 0.21).toFixed(5)));
    const vec28Inherit = Array.from({ length: 128 }, (_, i) => Number((Math.cos((i + 11) * 0.37) * 0.23).toFixed(5)));
    const vec28Imposter = Array.from({ length: 128 }, (_, i) => Number((Math.cos((i + 1) * 0.53) * 0.25).toFixed(5)));

    await httpReq('POST', '/app/api/users', {
      user: {
        id: 'u-edge28-face',
        email: 'edge28face@bhfirms.com',
        full_name: 'Edge Face Owner',
        role: 'Full Access (Owner)',
        companies: 'All',
        auth_mode: 'either',
        pin_code: '2847',
        status: 'Active',
        face_samples: [vec28],
        face_thumbs: [tinyPngDataUrl],
        face_updated_at: '2026-11-08T18:00:00.000Z'
      }
    }, { 'X-ISABI-Session': ownerToken });

    await httpReq('POST', '/app/api/users', {
      user: {
        id: 'u-edge28-both',
        email: 'edge28both@bhfirms.com',
        full_name: 'Edge TwoFactor Admin',
        role: 'Full Access (Owner)',
        companies: 'All',
        auth_mode: 'both',
        pin_code: '8249',
        status: 'Active',
        face_samples: [vec28Both],
        face_thumbs: [tinyPngDataUrl],
        face_updated_at: '2026-11-08T18:01:00.000Z'
      }
    }, { 'X-ISABI-Session': ownerToken });

    await httpReq('POST', '/app/api/users', {
      user: {
        id: 'u-edge28-pinonly',
        email: 'edge28pinonly@bhfirms.com',
        full_name: 'Edge PinOnly Seat',
        role: 'Entry',
        companies: 'WTC',
        auth_mode: 'pin_only',
        pin_code: '2947',
        status: 'Active',
        face_samples: [vec28PinOnly],
        face_updated_at: '2026-11-08T18:02:00.000Z'
      }
    }, { 'X-ISABI-Session': ownerToken });

    await httpReq('POST', '/app/api/users', {
      user: {
        id: 'u-edge28-inherit',
        email: 'edge28inherit@bhfirms.com',
        full_name: 'Edge SixDigit Inherit',
        role: 'Entry',
        companies: 'WTC',
        auth_mode: '',
        pin_code: '482915',
        status: 'Active',
        face_samples: [vec28Inherit],
        face_thumbs: [tinyPngDataUrl],
        face_updated_at: '2026-11-08T18:03:00.000Z'
      }
    }, { 'X-ISABI-Session': ownerToken });

    // API-level adversarial & parity checks on verify_only, 2FA, pin_only, workspace-default 'both', 429 rate-limit, and 401 zero-oracle
    const curSync28 = await httpReq('GET', '/app/api/sync?doc=mfg_web_store', null, { 'X-ISABI-Session': ownerToken });
    const baseMfgDoc28 = (curSync28.json && curSync28.json.docs && curSync28.json.docs.mfg_web_store) || {};
    await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      patch: {
        mfg_web_store: Object.assign({}, baseMfgDoc28, {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: '2026-11-08T18:04:00.000Z',
          faceSettings: { authMode: 'both', enforce2FA: true, authModeV8Explicit: true, updated_at: '2026-11-08T18:04:00.000Z' }
        })
      }
    }, { 'X-ISABI-Session': ownerToken });
    const wsDefaultBothPinOnlyRes = await httpReq('POST', '/app/api/auth/login', {
      email: 'edge28inherit@bhfirms.com',
      pin: '482915',
      method: 'PIN'
    });
    // Workspace `both`: a face alone (no email, no PIN) on an inheriting seat gets no session.
    const wsDefaultBothFaceAloneRes = await httpReq('POST', '/app/api/auth/login', {
      method: 'Face ID',
      face_descriptor: vec28Inherit
    }, { 'CF-Connecting-IP': '198.51.100.93' });
    await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      patch: {
        mfg_web_store: Object.assign({}, baseMfgDoc28, {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: '2026-11-08T18:04:05.000Z',
          faceSettings: { authMode: 'either', enforce2FA: false, authModeV8Explicit: true, updated_at: '2026-11-08T18:04:05.000Z' }
        })
      }
    }, { 'X-ISABI-Session': ownerToken });

    let rateLimitFirstStatus = 0;
    let rateLimitNinthStatus = 0;
    let rateLimitNinthFlag = false;
    for (let attempt = 1; attempt <= 9; attempt++) {
      const rlRes = await httpReq('POST', '/app/api/auth/login', {
        email: 'edge28face@bhfirms.com',
        pin: '0000',
        method: 'PIN'
      }, { 'CF-Connecting-IP': '198.51.100.88' });
      if (attempt === 1) rateLimitFirstStatus = rlRes.status;
      if (attempt === 9) {
        rateLimitNinthStatus = rlRes.status;
        rateLimitNinthFlag = Boolean(rlRes.json && rlRes.json.rate_limited);
      }
    }

    const verifyOnly2faUnauthRes = await httpReq('POST', '/app/api/auth/login', {
      method: 'Face ID',
      verify_only: true,
      face_descriptor: vec28Both
    });
    const verifyOnly2faAuthRes = await httpReq('POST', '/app/api/auth/login', {
      method: 'Face ID',
      verify_only: true,
      face_descriptor: vec28Both
    }, { 'X-ISABI-Session': ownerToken });
    const fullLogin2faNoPinRes = await httpReq('POST', '/app/api/auth/login', {
      email: 'edge28both@bhfirms.com',
      method: 'Face ID',
      face_descriptor: vec28Both
    }, { 'CF-Connecting-IP': '198.51.100.89' });
    const unauthAllowPinOnlyRes = await httpReq('POST', '/app/api/auth/login', {
      method: 'Face ID',
      verify_only: true,
      allow_pin_only_verify: true,
      face_descriptor: vec28PinOnly
    });
    const authAllowPinOnlyRes = await httpReq('POST', '/app/api/auth/login', {
      method: 'Face ID',
      verify_only: true,
      allow_pin_only_verify: true,
      face_descriptor: vec28PinOnly
    }, { 'X-ISABI-Session': ownerToken });
    const imposterHttpRes = await httpReq('POST', '/app/api/auth/login', {
      email: 'edge28face@bhfirms.com',
      pin: '2847',
      method: 'Face ID + PIN 2FA',
      face_descriptor: vec28Imposter
    }, { 'CF-Connecting-IP': '198.51.100.90' });

    // Face ID or PIN (owner decision 2026-11-12): anonymous face probes (no email, no PIN)
    // (a) `both` seat: face verified, PIN still required, no token and no email leaked;
    const probeBothRes = await httpReq('POST', '/app/api/auth/login', {
      method: 'Face ID',
      face_descriptor: vec28Both
    }, { 'CF-Connecting-IP': '198.51.100.91' });
    // (b) `pin_only` seat: refused with the same message as an unknown face (no seat oracle);
    const probePinOnlyRes = await httpReq('POST', '/app/api/auth/login', {
      method: 'Face ID',
      face_descriptor: vec28PinOnly
    }, { 'CF-Connecting-IP': '198.51.100.91' });
    // (c) unknown faces lock only face probes on that IP, never PIN sign-in from the same IP.
    let probeLockStatus = 0;
    for (let k = 0; k < 6; k++) {
      const pr = await httpReq('POST', '/app/api/auth/login', {
        method: 'Face ID',
        face_descriptor: vec28Imposter
      }, { 'CF-Connecting-IP': '198.51.100.92' });
      probeLockStatus = pr.status;
    }
    const pinAfterFaceLockRes = await httpReq('POST', '/app/api/auth/login', {
      email: 'edge28pinonly@bhfirms.com',
      pin: '2947',
      method: 'PIN'
    }, { 'CF-Connecting-IP': '198.51.100.92' });
    // (d) same with an email but no PIN (the sign-in box pre-fills the last seat): still face-key only.
    let probeEmailLockStatus = 0;
    for (let k = 0; k < 6; k++) {
      const pr = await httpReq('POST', '/app/api/auth/login', {
        email: 'edge28face@bhfirms.com',
        method: 'Face ID',
        face_descriptor: vec28Imposter
      }, { 'CF-Connecting-IP': '198.51.100.94' });
      probeEmailLockStatus = pr.status;
    }
    const pinAfterEmailFaceLockRes = await httpReq('POST', '/app/api/auth/login', {
      email: 'edge28pinonly@bhfirms.com',
      pin: '2947',
      method: 'PIN'
    }, { 'CF-Connecting-IP': '198.51.100.94' });
    // (e) a verified `both` face is never counted as a failure: six face-first checks in a row from one IP
    // all ask for the PIN (never 429), and the PIN step then signs in.
    const bothFaceFirstStatuses = [];
    for (let k = 0; k < 6; k++) {
      const p1 = await httpReq('POST', '/app/api/auth/login', {
        method: 'Face ID',
        face_descriptor: vec28Both
      }, { 'CF-Connecting-IP': '198.51.100.95' });
      bothFaceFirstStatuses.push(`${p1.status}${p1.json?.two_factor_pin_required ? 'p' : ''}`);
    }
    const bothPinStep = await httpReq('POST', '/app/api/auth/login', {
      email: 'edge28both@bhfirms.com',
      pin: '8249',
      method: 'Face ID + PIN 2FA',
      face_descriptor: vec28Both
    }, { 'CF-Connecting-IP': '198.51.100.95' });
    bothFaceFirstStatuses.push(`pin:${bothPinStep.status}`);
    // (f) a face sign-in without a PIN never resets the office-wide IP lock: 4 wrong PINs (4 different
    // emails, so only the IP key reaches 5), a face sign-in (200), then the 5th wrong PIN is 429.
    const ipKeepStatuses = [];
    for (let k = 1; k <= 4; k++) {
      const wp = await httpReq('POST', '/app/api/auth/login', { email: `nobody${k}@example.test`, pin: '0000', method: 'PIN' }, { 'CF-Connecting-IP': '198.51.100.96' });
      ipKeepStatuses.push(wp.status);
    }
    const ipKeepFace = await httpReq('POST', '/app/api/auth/login', { method: 'Face ID', face_descriptor: vec28 }, { 'CF-Connecting-IP': '198.51.100.96' });
    ipKeepStatuses.push(`face:${ipKeepFace.status}`);
    const ipKeepFifth = await httpReq('POST', '/app/api/auth/login', { email: 'nobody5@example.test', pin: '0000', method: 'PIN' }, { 'CF-Connecting-IP': '198.51.100.96' });
    ipKeepStatuses.push(ipKeepFifth.status);
    // (f2) a dummy PIN sent with an `either` face is never checked, so it must not reset the IP lock either.
    for (let k = 11; k <= 14; k++) {
      const wp = await httpReq('POST', '/app/api/auth/login', { email: `nobody${k}@example.test`, pin: '0000', method: 'PIN' }, { 'CF-Connecting-IP': '198.51.100.98' });
      ipKeepStatuses.push(`d${wp.status}`);
    }
    const ipKeepDummy = await httpReq('POST', '/app/api/auth/login', { method: 'Face ID', pin: '1', face_descriptor: vec28 }, { 'CF-Connecting-IP': '198.51.100.98' });
    const ipKeepAfterDummy = await httpReq('POST', '/app/api/auth/login', { email: 'nobody15@example.test', pin: '0000', method: 'PIN' }, { 'CF-Connecting-IP': '198.51.100.98' });
    ipKeepStatuses.push(`dummy:${ipKeepDummy.status}`, ipKeepAfterDummy.status);
    // (g) a face sign-in clears the face-only lock: 4 imposter probes, the enrolled face (200), then 4 more
    // imposter probes are all 401 (never 429).
    const faceClearStatuses = [];
    for (let k = 0; k < 4; k++) {
      const ip1 = await httpReq('POST', '/app/api/auth/login', { method: 'Face ID', face_descriptor: vec28Imposter }, { 'CF-Connecting-IP': '198.51.100.97' });
      faceClearStatuses.push(ip1.status);
    }
    const faceClearOk = await httpReq('POST', '/app/api/auth/login', { method: 'Face ID', face_descriptor: vec28 }, { 'CF-Connecting-IP': '198.51.100.97' });
    faceClearStatuses.push(`face:${faceClearOk.status}`);
    for (let k = 0; k < 4; k++) {
      const ip2 = await httpReq('POST', '/app/api/auth/login', { method: 'Face ID', face_descriptor: vec28Imposter }, { 'CF-Connecting-IP': '198.51.100.97' });
      faceClearStatuses.push(ip2.status);
    }
    // (h) a wrong PIN sent with a matching face (`Face ID + PIN 2FA`) counts on the PIN keys, so a face
    // sign-in in between cannot reset PIN guessing: 4 wrong, face sign-in (200), 5th wrong = 429.
    const pinViaFaceStatuses = [];
    for (let k = 0; k < 4; k++) {
      const wp = await httpReq('POST', '/app/api/auth/login', { email: 'edge28both@bhfirms.com', method: 'Face ID + PIN 2FA', face_descriptor: vec28Both, pin: '0000' }, { 'CF-Connecting-IP': '198.51.100.99' });
      pinViaFaceStatuses.push(wp.status);
    }
    const pinViaFaceReset = await httpReq('POST', '/app/api/auth/login', { method: 'Face ID', face_descriptor: vec28 }, { 'CF-Connecting-IP': '198.51.100.99' });
    pinViaFaceStatuses.push(`face:${pinViaFaceReset.status}`);
    const pinViaFaceFifth = await httpReq('POST', '/app/api/auth/login', { email: 'edge28both@bhfirms.com', method: 'Face ID + PIN 2FA', face_descriptor: vec28Both, pin: '0000' }, { 'CF-Connecting-IP': '198.51.100.99' });
    pinViaFaceStatuses.push(pinViaFaceFifth.status);
    // (i) signed-in verify_only Face ID misses (enrolment check) never lock PIN sign-in for the IP.
    const verifyMissStatuses = [];
    for (let k = 0; k < 5; k++) {
      const vm = await httpReq('POST', '/app/api/auth/login', { method: 'Face ID', verify_only: true, face_descriptor: vec28Imposter }, { 'X-ISABI-Session': ownerToken, 'CF-Connecting-IP': '198.51.100.100' });
      verifyMissStatuses.push(vm.status);
    }
    const pinAfterVerifyMiss = await httpReq('POST', '/app/api/auth/login', { email: 'edge28pinonly@bhfirms.com', pin: '2947', method: 'PIN' }, { 'CF-Connecting-IP': '198.51.100.100' });
    verifyMissStatuses.push(`pin:${pinAfterVerifyMiss.status}`);
    // (j) email-less `Face ID + PIN 2FA` (seat found by face) still hits that seat's own PIN lock, even when
    // other people's PIN sign-ins keep resetting the office IP key: the correct PIN after 5 misses is 429.
    const emaillessPinStatuses = [];
    for (let k = 0; k < 5; k++) {
      const wp = await httpReq('POST', '/app/api/auth/login', { method: 'Face ID + PIN 2FA', face_descriptor: vec28Both, pin: '0000' }, { 'CF-Connecting-IP': '198.51.100.101' });
      emaillessPinStatuses.push(wp.status);
      await httpReq('POST', '/app/api/auth/login', { email: 'edge28pinonly@bhfirms.com', pin: '2947', method: 'PIN' }, { 'CF-Connecting-IP': '198.51.100.101' });
    }
    const emaillessRight = await httpReq('POST', '/app/api/auth/login', { method: 'Face ID + PIN 2FA', face_descriptor: vec28Both, pin: '8249' }, { 'CF-Connecting-IP': '198.51.100.101' });
    emaillessPinStatuses.push(`right:${emaillessRight.status}`);
    // (k) a face-only verify success never resets a seat's PIN lock: 4 wrong PINs, verify_only face (200),
    // then the 5th wrong PIN is 429.
    const verifyKeepStatuses = [];
    for (let k = 0; k < 4; k++) {
      const wp = await httpReq('POST', '/app/api/auth/login', { email: 'edge28face@bhfirms.com', pin: '0000', method: 'PIN' }, { 'CF-Connecting-IP': '198.51.100.102' });
      verifyKeepStatuses.push(wp.status);
    }
    const verifyKeepFace = await httpReq('POST', '/app/api/auth/login', { email: 'edge28face@bhfirms.com', method: 'Face ID', verify_only: true, face_descriptor: vec28 }, { 'X-ISABI-Session': ownerToken, 'CF-Connecting-IP': '198.51.100.102' });
    verifyKeepStatuses.push(`verify:${verifyKeepFace.status}`);
    // Another seat's checked PIN resets the IP key, so the 429 below can only come from the seat's own key.
    const verifyKeepReset = await httpReq('POST', '/app/api/auth/login', { email: 'edge28pinonly@bhfirms.com', pin: '2947', method: 'PIN' }, { 'CF-Connecting-IP': '198.51.100.102' });
    verifyKeepStatuses.push(`reset:${verifyKeepReset.status}`);
    const verifyKeepFifth = await httpReq('POST', '/app/api/auth/login', { email: 'edge28face@bhfirms.com', pin: '0000', method: 'PIN' }, { 'CF-Connecting-IP': '198.51.100.102' });
    verifyKeepStatuses.push(verifyKeepFifth.status);
    // (l) same for a face-alone SIGN-IN of that seat: it never resets the seat's own PIN key.
    const signinKeepStatuses = [];
    for (let k = 0; k < 4; k++) {
      const wp = await httpReq('POST', '/app/api/auth/login', { email: 'edge28face@bhfirms.com', pin: '0000', method: 'PIN' }, { 'CF-Connecting-IP': '198.51.100.103' });
      signinKeepStatuses.push(wp.status);
    }
    const signinKeepFace = await httpReq('POST', '/app/api/auth/login', { method: 'Face ID', face_descriptor: vec28 }, { 'CF-Connecting-IP': '198.51.100.103' });
    signinKeepStatuses.push(`face:${signinKeepFace.status}`);
    const signinKeepReset = await httpReq('POST', '/app/api/auth/login', { email: 'edge28pinonly@bhfirms.com', pin: '2947', method: 'PIN' }, { 'CF-Connecting-IP': '198.51.100.103' });
    signinKeepStatuses.push(`reset:${signinKeepReset.status}`);
    const signinKeepFifth = await httpReq('POST', '/app/api/auth/login', { email: 'edge28face@bhfirms.com', pin: '0000', method: 'PIN' }, { 'CF-Connecting-IP': '198.51.100.103' });
    signinKeepStatuses.push(signinKeepFifth.status);
    // (m) a seat with a blank email has no PIN key to throttle on: a PIN is never checked through the face
    // lookup for it (401 even with its correct PIN), while Face ID alone still signs it in.
    const vecBlank = Array.from({ length: 128 }, (_, i) => Number((Math.sin((i + 3) * 0.71) * 0.2).toFixed(5)));
    await httpReq('POST', '/app/api/users', {
      user: {
        id: 'u-edge28-blank',
        email: ' ',
        full_name: 'Edge Blank Email',
        role: 'Entry',
        companies: 'WTC',
        auth_mode: 'either',
        pin_code: '5938',
        status: 'Active',
        face_samples: [vecBlank],
        face_updated_at: '2026-11-08T18:05:00.000Z'
      }
    }, { 'X-ISABI-Session': ownerToken });
    const blankPin = await httpReq('POST', '/app/api/auth/login', { method: 'Face ID + PIN 2FA', face_descriptor: vecBlank, pin: '5938' }, { 'CF-Connecting-IP': '198.51.100.104' });
    const blankFace = await httpReq('POST', '/app/api/auth/login', { method: 'Face ID', face_descriptor: vecBlank }, { 'CF-Connecting-IP': '198.51.100.104' });
    const blankEmailStatuses = [`pin:${blankPin.status}${blankPin.json?.token ? '+token' : ''}`, `face:${blankFace.status}`];

    consoleErrors.length = 0;
    await sendCdp('Network.clearBrowserCookies');
    const remoteScript28 = await sendCdp('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        window.__ISABI_SIMULATE_REMOTE_HOST = true;
        window.__ISABI_TEST_EDGE = true;
        window.ISABI_HAS_EDGE_API = true;
        try {
          if (!sessionStorage.getItem('edge28_seeded_v1')) {
            sessionStorage.setItem('edge28_seeded_v1', '1');
            localStorage.setItem('isabi_edge_active_v1', '1');
            localStorage.removeItem('isabi_mfg_edge_sess_tok_v1');
            localStorage.removeItem('isabi_mfg_active_email');
            localStorage.setItem('isabi_mfg_face_settings_v2', JSON.stringify({
              threshold: 0.50,
              margin: 0.08,
              confirmFrames: 3,
              liveness: true,
              livenessMode: 'blink_or_turn'
            }));
          }
        } catch (_) {}
      `
    });

    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/app/` });
    for (let i = 0; i < 40; i++) {
      const bootReady = await evalJs(`Boolean(
        window.MFG_FACE_TEST &&
        typeof window.MFG_FACE_TEST.state === 'function' &&
        document.getElementById('authEmailInput') &&
        document.getElementById('authPinInput')
      )`);
      if (bootReady) break;
      await sleep(250);
    }

    const bootConsoleErrors28 = consoleErrors.slice();

    const e28Flow = await evalJs(`(async () => {
      if (!window.MFG_FACE_TEST || !window.Face) return { bootOk: false };
      await window.Face.load('./vendor/models');
      const vp = document.getElementById('authCamViewport');
      if (vp) vp.classList.add('is-video-ready');
      window.dispatchEvent(new CustomEvent('mfg:face-models-ready'));

      const stBoot = window.MFG_FACE_TEST.state();
      const preAuthDeferred = Boolean(window.MFG_SEED && window.MFG_SEED._preAuthDeferred);
      const recordsReadyBefore = Boolean(window.MFG_SEED && window.MFG_SEED._recordsReady);
      const vecBoundary = ${JSON.stringify(vec28Boundary)};
      const vecImp = ${JSON.stringify(vec28Imposter)};

      // (Face ID alone with no email and no PIN is checked at the end of this flow: it now signs in.)

      // Enter Email + PIN on the server-held sign-in gate before scanning Face ID
      const emGateInp = document.getElementById('authEmailInput');
      const pinGateInp = document.getElementById('authPinInput');
      if (emGateInp) { emGateInp.value = 'edge28face@bhfirms.com'; emGateInp.dispatchEvent(new Event('input', { bubbles: true })); }
      if (pinGateInp) { pinGateInp.value = '2847'; pinGateInp.dispatchEvent(new Event('input', { bubbles: true })); }

      // Negative Assertion 1: Single frame builds streak without false "Face not recognized" or premature unlock
      window.MFG_FACE_TEST.resetLiveness();
      const f1 = await window.MFG_FACE_TEST.feedLiveAuthFrame(vecBoundary, { ear: 0.29, yaw: -0.025, parallax3d: -0.012 });
      const hintAfterF1 = (document.getElementById('authFaceHint')?.textContent || '').trim();
      const stAfterF1 = window.MFG_FACE_TEST.state();

      // Negative Assertion 2: Static 2D photo/screenshot (0 blink, 0 3D parallax) blocked at awaiting-blink
      window.MFG_FACE_TEST.resetLiveness();
      let fStatic = null;
      for (let k = 0; k < 4; k++) {
        fStatic = await window.MFG_FACE_TEST.feedLiveAuthFrame(vecBoundary, { ear: 0.28, yaw: 0, parallax3d: 0 });
      }
      const stAfterStatic = window.MFG_FACE_TEST.state();
      const tokAfterStatic = localStorage.getItem('isabi_mfg_edge_sess_tok_v1') || '';

      // Negative Assertion 3: Unrecognized imposter with valid blink+3D turn rejected (401) + cooldown active
      window.MFG_FACE_TEST.resetLiveness();
      await window.MFG_FACE_TEST.feedLiveAuthFrame(vecImp, { ear: 0.29, yaw: -0.03, parallax3d: -0.014 });
      await window.MFG_FACE_TEST.feedLiveAuthFrame(vecImp, { ear: 0.18, yaw: 0.0, parallax3d: 0.0 });
      const fImp = await window.MFG_FACE_TEST.feedLiveAuthFrame(vecImp, { ear: 0.29, yaw: 0.03, parallax3d: 0.014 });
      const hintAfterImp = (document.getElementById('authFaceHint')?.textContent || '').trim();
      const fCooldown = await window.MFG_FACE_TEST.feedLiveAuthFrame(vecImp, { ear: 0.29, yaw: 0.03, parallax3d: 0.014 });
      const stAfterImp = window.MFG_FACE_TEST.state();

      await new Promise(r => setTimeout(r, 820));

      // Positive Boundary Assertion 4: Enrolled vector at d=0.490 (0.48 < d <= 0.50) + Email + PIN + live blink/turn unlocks via HttpOnly cookie
      window.MFG_FACE_TEST.resetLiveness();
      await window.MFG_FACE_TEST.feedLiveAuthFrame(vecBoundary, { ear: 0.29, yaw: -0.03, parallax3d: -0.014 });
      await window.MFG_FACE_TEST.feedLiveAuthFrame(vecBoundary, { ear: 0.18, yaw: 0.0, parallax3d: 0.0 });
      const fOk = await window.MFG_FACE_TEST.feedLiveAuthFrame(vecBoundary, { ear: 0.29, yaw: 0.03, parallax3d: 0.014 });
      const stAfterOk = window.MFG_FACE_TEST.state();
      const gateHidden = Boolean(document.getElementById('authGate')?.hidden);
      const tokMinted = localStorage.getItem('isabi_mfg_edge_sess_tok_v1') || '';
      const meCheck = await window.ISABI_EDGE_FETCH('./api/auth/me').then(r => r.json());

      // Wait for post-login R2 seed hydration & authenticated /api/users hydration
      for (let w = 0; w < 40; w++) {
        const readyNow = Boolean(
          window.MFG_SEED &&
          window.MFG_SEED._recordsReady &&
          Array.isArray(window.STATE?.users) &&
          window.STATE.users.some(u => u && u.id === 'u-edge28-face')
        );
        if (readyNow) break;
        await new Promise(r => setTimeout(r, 150));
      }
      const recordsReadyAfterLogin = Boolean(window.MFG_SEED && window.MFG_SEED._recordsReady);

      // Navigate to #users and verify Edge-redacted pose parity, thumb preservation, AR/FR i18n, clear tombstone, re-enrol, and logout seed purge
      location.hash = '#users';
      await new Promise(r => setTimeout(r, 280));
      const sel = document.getElementById('enrolUserSelect');
      let badgeTxt = '';
      let dirHasEnrolled = false;
      let thumbImgCount = 0;
      let arAuditCount = -1;
      let frAuditCount = -1;
      let arAuditSample = [];
      let frAuditSample = [];
      let clearedStaysFalse = false;
      let reenrolledStaysTrue = false;
      let seedCacheCountBeforeLogout = 0;
      let seedCacheCountAfterLogout = -1;
      let unauthUsersStatusAfterLogout = 0;
      let usersLenAfterLogout = -1;
      if (sel) {
        sel.value = 'u-edge28-face';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 80));
        badgeTxt = (document.getElementById('enrolHeaderBadge')?.textContent || '').trim();
        dirHasEnrolled = (document.getElementById('usersDirectoryTbody')?.innerText || '').includes('1/3 · PIN/Face');
        thumbImgCount = document.querySelectorAll('#enrolThumbStrip img').length;

        if (window.MFG_I18N && typeof window.MFG_I18N.setLang === 'function' && typeof window.MFG_I18N.auditDom === 'function') {
          const isSyntheticTestName = txt => /^(EF|ET|EP|ES|FV|WQ)$|Verify Suite|WTC Quarry Dispatch|Empty Scope Seat|Edge Test|Edge Face|Edge TwoFactor|Edge PinOnly|Edge SixDigit|Edge Blank Email|Face Verify|Both 2FA|Scope Escape/i.test(String(txt || '').trim());
          const arItems = window.MFG_I18N.auditDom(document.getElementById('workspace'), 'ar').items.filter(it => !isSyntheticTestName(it.text));
          const frItems = window.MFG_I18N.auditDom(document.getElementById('workspace'), 'fr').items.filter(it => !isSyntheticTestName(it.text));
          arAuditCount = arItems.length;
          frAuditCount = frItems.length;
          arAuditSample = arItems.slice(0, 6).map(x => x.text);
          frAuditSample = frItems.slice(0, 6).map(x => x.text);
          window.MFG_I18N.setLang('ar');
          await new Promise(r => setTimeout(r, 40));
          window.MFG_I18N.setLang('fr');
          await new Promise(r => setTimeout(r, 40));
          window.MFG_I18N.setLang('en');
          await new Promise(r => setTimeout(r, 40));
        }

        const clearBtn = document.getElementById('enrolClearBtn');
        if (clearBtn) {
          clearBtn.click();
          await new Promise(r => setTimeout(r, 320));
          const uResAfterClear = await window.ISABI_EDGE_FETCH('./api/users').then(r => r.json());
          const srvClearedSeat = (uResAfterClear.users || []).find(u => u.id === 'u-edge28-face');
          const localFaceSeat = window.STATE.users.find(u => u.id === 'u-edge28-face');
          if (localFaceSeat && srvClearedSeat) {
            clearedStaysFalse = Boolean(srvClearedSeat.face_enrolled === false && srvClearedSeat.face_redacted === false && localFaceSeat.face_enrolled === false && localFaceSeat.face_cleared === true);
          }
          // Re-enrol on server at newer timestamp and verify via authenticated /api/users BEFORE logout
          await window.ISABI_EDGE_FETCH('./api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user: Object.assign({}, localFaceSeat, {
                face_samples: [${JSON.stringify(vec28)}],
                face_thumbs: [${JSON.stringify(tinyPngDataUrl)}],
                face_cleared: false,
                face_enrolled: true,
                face_updated_at: new Date(Date.now() + 60000).toISOString()
              })
            })
          });
          const authedUsersAfterReenrol = await window.ISABI_EDGE_FETCH('./api/users').then(r => r.json());
          const srvReenrolled = (authedUsersAfterReenrol.users || []).find(u => u.id === 'u-edge28-face');
          reenrolledStaysTrue = Boolean(
            srvReenrolled &&
            srvReenrolled.face_enrolled === true &&
            srvReenrolled.face_redacted === true &&
            srvReenrolled.pin_code === undefined &&
            srvReenrolled.pin_redacted === true
          );

          const dataCacheBefore = await caches.open('isabi-mfg-data-v3');
          seedCacheCountBeforeLogout = (await dataCacheBefore.keys()).filter(rq => rq.url.includes('/api/seed/')).length;

          // Sign out: clears session cookie, wipes STATE.users, and purges cached /api/seed/* responses
          const signOutBtn = document.getElementById('signOutBtn') || document.querySelector('[data-action="signout"]');
          if (signOutBtn) signOutBtn.click();
          await new Promise(r => setTimeout(r, 250));
          const unauthUsersAfterRes = await fetch('./api/users');
          unauthUsersStatusAfterLogout = unauthUsersAfterRes.status;
          usersLenAfterLogout = (window.STATE?.users || []).length;
          const dataCacheAfter = await caches.open('isabi-mfg-data-v3');
          seedCacheCountAfterLogout = (await dataCacheAfter.keys()).filter(rq => rq.url.includes('/api/seed/')).length;
        }
      }

      // Test 6-digit PIN ('482915') on server-held #authGate: typing 4 digits does NOT auto-submit or wipe input; submitting form signs in
      const emInp = document.getElementById('authEmailInput');
      if (emInp) {
        emInp.value = 'edge28inherit@bhfirms.com';
        emInp.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const pinInp = document.getElementById('authPinInput');
      let pinAtDigit4 = '';
      let sixDigitAuthed = false;
      let sixDigitActiveEmail = '';
      if (pinInp) {
        pinInp.value = '';
        for (const ch of ['4', '48', '482', '4829']) {
          pinInp.value = ch;
          pinInp.dispatchEvent(new Event('input', { bubbles: true }));
        }
        await new Promise(r => setTimeout(r, 260));
        pinAtDigit4 = pinInp.value;
        for (const ch of ['48291', '482915']) {
          pinInp.value = ch;
          pinInp.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const loginForm = document.getElementById('authLoginForm');
        if (loginForm) loginForm.requestSubmit();
        await new Promise(r => setTimeout(r, 600));
        const st6 = window.MFG_FACE_TEST.state();
        sixDigitAuthed = Boolean(st6 && st6.authed);
        sixDigitActiveEmail = (st6 && st6.activeEmail) || '';
      }

      // Face ID or PIN, never both (owner decision 2026-11-12): sign out, leave ANOTHER seat's email in the
      // box (the sign-in screen pre-fills the last seat) and no PIN, then a live Face ID alone signs the
      // person in front of the camera in through the server.
      let fNoCreds = null;
      let stAfterNoCreds = null;
      let noCredsSignedOut = false;
      {
        const signOutBtn2 = document.getElementById('signOutBtn') || document.querySelector('[data-action="signout"]');
        if (signOutBtn2) signOutBtn2.click();
        await new Promise(r => setTimeout(r, 400));
        noCredsSignedOut = !window.MFG_FACE_TEST.state().authed;
        const em2 = document.getElementById('authEmailInput');
        const pin2 = document.getElementById('authPinInput');
        if (em2) { em2.value = 'edge28inherit@bhfirms.com'; em2.dispatchEvent(new Event('input', { bubbles: true })); }
        if (pin2) { pin2.value = ''; pin2.dispatchEvent(new Event('input', { bubbles: true })); }
        await new Promise(r => setTimeout(r, 820));
        window.MFG_FACE_TEST.resetLiveness();
        await window.MFG_FACE_TEST.feedLiveAuthFrame(vecBoundary, { ear: 0.29, yaw: -0.03, parallax3d: -0.014 });
        await window.MFG_FACE_TEST.feedLiveAuthFrame(vecBoundary, { ear: 0.18, yaw: 0.0, parallax3d: 0.0 });
        fNoCreds = await window.MFG_FACE_TEST.feedLiveAuthFrame(vecBoundary, { ear: 0.29, yaw: 0.03, parallax3d: 0.014 });
        await new Promise(r => setTimeout(r, 300));
        stAfterNoCreds = window.MFG_FACE_TEST.state();
      }

      return {
        bootOk: true,
        stBoot,
        preAuthDeferred,
        recordsReadyBefore,
        fNoCredsStatus: fNoCreds?.status,
        stAfterNoCreds,
        noCredsSignedOut,
        f1Status: f1?.status,
        stAfterF1,
        hintAfterF1,
        fStaticStatus: fStatic?.status,
        stAfterStatic,
        tokAfterStaticLen: tokAfterStatic.length,
        fImpStatus: fImp?.status,
        hintAfterImp,
        fCooldownStatus: fCooldown?.status,
        stAfterImp,
        fOkStatus: fOk?.status,
        fOkDist: fOk?.dist,
        stAfterOk,
        gateHidden,
        tokMintedLen: tokMinted.length,
        meAuth: Boolean(meCheck && meCheck.authenticated),
        recordsReadyAfterLogin,
        badgeTxt,
        dirHasEnrolled,
        thumbImgCount,
        arAuditCount,
        frAuditCount,
        arAuditSample,
        frAuditSample,
        clearedStaysFalse,
        reenrolledStaysTrue,
        seedCacheCountBeforeLogout,
        seedCacheCountAfterLogout,
        unauthUsersStatusAfterLogout,
        usersLenAfterLogout,
        pinAtDigit4,
        sixDigitAuthed,
        sixDigitActiveEmail
      };
    })()`);

    // Capture active cookie before rapid sign-out -> immediate (<50ms) re-login race + immediate unload reload
    const cookiesBeforeRapid28 = await sendCdp('Network.getCookies', { urls: [`http://127.0.0.1:${PORT}/app/`] });
    const cookieBeforeRapid28 = String((cookiesBeforeRapid28.cookies || []).find(c => c.name === 'isabi_edge_sess')?.value || '');
    const preRapidReplayRes = cookieBeforeRapid28
      ? await httpReq('GET', '/app/api/users', null, { Cookie: `isabi_edge_sess=${cookieBeforeRapid28}` })
      : { status: 0 };

    const rapidReloginRes28 = await evalJs(`(async () => {
      const btn = document.getElementById('signOutBtn') || document.querySelector('[data-action="signout"]');
      if (btn) btn.click();
      const em = document.getElementById('authEmailInput');
      const pin = document.getElementById('authPinInput');
      const form = document.getElementById('authLoginForm');
      if (em) { em.value = 'edge28inherit@bhfirms.com'; em.dispatchEvent(new Event('input', { bubbles: true })); }
      if (pin) { pin.value = '482915'; pin.dispatchEvent(new Event('input', { bubbles: true })); }
      if (form) form.requestSubmit();
      return true;
    })()`);
    await sleep(950);
    const rapidStateAfter28 = await evalJs(`(async () => {
      const st = window.MFG_FACE_TEST && typeof window.MFG_FACE_TEST.state === 'function' ? window.MFG_FACE_TEST.state() : null;
      const r = await fetch('./api/users');
      return { authed: Boolean(st && st.authed), activeEmail: (st && st.activeEmail) || '', usersStatus: r.status };
    })()`);
    const oldCookieAfterRapidRes28 = cookieBeforeRapid28
      ? await httpReq('GET', '/app/api/users', null, { Cookie: `isabi_edge_sess=${cookieBeforeRapid28}` })
      : { status: 0 };

    const cookiesBeforeReload28 = await sendCdp('Network.getCookies', { urls: [`http://127.0.0.1:${PORT}/app/`] });
    const cookieBeforeReload28 = String((cookiesBeforeReload28.cookies || []).find(c => c.name === 'isabi_edge_sess')?.value || '');
    const preReloadReplayRes = cookieBeforeReload28
      ? await httpReq('GET', '/app/api/users', null, { Cookie: `isabi_edge_sess=${cookieBeforeReload28}` })
      : { status: 0 };
    await evalJs(`(() => {
      const btn = document.getElementById('signOutBtn') || document.querySelector('[data-action="signout"]');
      if (btn) btn.click();
      location.reload();
      return true;
    })()`);
    await sleep(300);
    for (let i = 0; i < 40; i++) {
      const reloadedReady = await evalJs(`Boolean(window.MFG_FACE_TEST && typeof window.MFG_FACE_TEST.state === 'function' && document.getElementById('authEmailInput'))`).catch(() => false);
      if (reloadedReady) break;
      await sleep(200);
    }
    await sleep(400);
    const reloadState28 = await evalJs(`(async () => {
      const st = window.MFG_FACE_TEST && typeof window.MFG_FACE_TEST.state === 'function' ? window.MFG_FACE_TEST.state() : null;
      const r = await fetch('./api/users');
      return { authed: Boolean(st && st.authed), usersStatus: r.status };
    })()`).catch(() => ({ authed: true, usersStatus: 0 }));
    const oldCookieAfterReloadRes28 = cookieBeforeReload28
      ? await httpReq('GET', '/app/api/users', null, { Cookie: `isabi_edge_sess=${cookieBeforeReload28}` })
      : { status: 0 };

    if (remoteScript28 && remoteScript28.identifier) {
      try { await sendCdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: remoteScript28.identifier }); } catch (_) {}
    }

    const unexpectedErrors28 = consoleErrors.filter(
      e => !/status of 401.*\/app\/api\/(users|auth\/login|auth\/override-requests|geo\/gate-suggestions|geo\/audit|staff_biometrics|work_schedules|geo_config|industry_domain_store|sentinel_reviews|alert_rules|sync|seed\/(?:core|records|industries)|map-usage|telematics)/i.test(String(e || ''))
    );

    if (
      bootConsoleErrors28.length === 0 &&
      unexpectedErrors28.length === 0 &&
      wsDefaultBothPinOnlyRes.status === 401 &&
      wsDefaultBothPinOnlyRes.json?.two_factor_face_required === true &&
      rateLimitFirstStatus === 401 &&
      rateLimitNinthStatus === 429 &&
      rateLimitNinthFlag === true &&
      verifyOnly2faUnauthRes.status === 401 &&
      !verifyOnly2faUnauthRes.json?.user &&
      verifyOnly2faAuthRes.status === 200 &&
      verifyOnly2faAuthRes.json?.verify_only === true &&
      !verifyOnly2faAuthRes.json?.token &&
      fullLogin2faNoPinRes.status === 401 &&
      fullLogin2faNoPinRes.json?.two_factor_pin_required === true &&
      !fullLogin2faNoPinRes.json?.user &&
      unauthAllowPinOnlyRes.status === 401 &&
      authAllowPinOnlyRes.status === 200 &&
      authAllowPinOnlyRes.json?.verify_only === true &&
      imposterHttpRes.status === 401 &&
      imposterHttpRes.json?.face_dist === undefined &&
      wsDefaultBothFaceAloneRes.status === 401 &&
      wsDefaultBothFaceAloneRes.json?.two_factor_pin_required === true &&
      !wsDefaultBothFaceAloneRes.json?.token &&
      wsDefaultBothFaceAloneRes.json?.email === undefined &&
      probeBothRes.status === 401 &&
      probeBothRes.json?.two_factor_pin_required === true &&
      !probeBothRes.json?.token &&
      probeBothRes.json?.email === undefined &&
      !probeBothRes.headers['set-cookie'] &&
      probePinOnlyRes.status === 401 &&
      probePinOnlyRes.json?.error === 'Face ID not recognized.' &&
      !probePinOnlyRes.json?.token &&
      probeLockStatus === 429 &&
      pinAfterFaceLockRes.status === 200 &&
      probeEmailLockStatus === 429 &&
      pinAfterEmailFaceLockRes.status === 200 &&
      bothFaceFirstStatuses.join(',') === '401p,401p,401p,401p,401p,401p,pin:200' &&
      ipKeepStatuses.join(',') === '401,401,401,401,face:200,429,d401,d401,d401,d401,dummy:200,429' &&
      faceClearStatuses.join(',') === '401,401,401,401,face:200,401,401,401,401' &&
      pinViaFaceStatuses.join(',') === '401,401,401,401,face:200,429' &&
      verifyMissStatuses[5] === 'pin:200' &&
      emaillessPinStatuses.join(',') === '401,401,401,401,429,right:429' &&
      verifyKeepStatuses.join(',') === '401,401,401,401,verify:200,reset:200,429' &&
      signinKeepStatuses.join(',') === '401,401,401,401,face:200,reset:200,429' &&
      blankEmailStatuses.join(',') === 'pin:401,face:200' &&
      e28Flow?.bootOk === true &&
      e28Flow.stBoot?.authed === false &&
      e28Flow.stBoot?.enrolledSeats?.length === 0 &&
      e28Flow.preAuthDeferred === true &&
      e28Flow.recordsReadyBefore === false &&
      e28Flow.stBoot?.confirmFrames === 3 &&
      e28Flow.noCredsSignedOut === true &&
      e28Flow.fNoCredsStatus === 'verified' &&
      e28Flow.stAfterNoCreds?.authed === true &&
      e28Flow.stAfterNoCreds?.activeEmail === 'edge28face@bhfirms.com' &&
      e28Flow.f1Status === 'edge-streak' &&
      e28Flow.stAfterF1?.authed === false &&
      !/not recognized/i.test(e28Flow.hintAfterF1 || '') &&
      e28Flow.fStaticStatus === 'awaiting-blink' &&
      e28Flow.stAfterStatic?.authed === false &&
      e28Flow.tokAfterStaticLen === 0 &&
      e28Flow.fImpStatus === 'unknown' &&
      /not recognized/i.test(e28Flow.hintAfterImp || '') &&
      e28Flow.fCooldownStatus === 'cooldown' &&
      e28Flow.stAfterImp?.authed === false &&
      e28Flow.fOkStatus === 'verified' &&
      Number(e28Flow.fOkDist) > 0.48 &&
      Number(e28Flow.fOkDist) <= 0.50 &&
      e28Flow.stAfterOk?.authed === true &&
      e28Flow.stAfterOk?.activeEmail === 'edge28face@bhfirms.com' &&
      e28Flow.gateHidden === true &&
      e28Flow.tokMintedLen === 0 &&
      e28Flow.meAuth === true &&
      e28Flow.recordsReadyAfterLogin === true &&
      e28Flow.badgeTxt.includes('1/3 Poses Saved') &&
      e28Flow.dirHasEnrolled === true &&
      e28Flow.thumbImgCount >= 1 &&
      e28Flow.arAuditCount === 0 &&
      e28Flow.frAuditCount === 0 &&
      e28Flow.clearedStaysFalse === true &&
      e28Flow.reenrolledStaysTrue === true &&
      e28Flow.seedCacheCountBeforeLogout >= 1 &&
      e28Flow.seedCacheCountAfterLogout === 0 &&
      e28Flow.unauthUsersStatusAfterLogout === 401 &&
      e28Flow.usersLenAfterLogout === 0 &&
      e28Flow.pinAtDigit4 === '4829' &&
      e28Flow.sixDigitAuthed === true &&
      e28Flow.sixDigitActiveEmail === 'edge28inherit@bhfirms.com' &&
      Boolean(cookieBeforeRapid28) &&
      preRapidReplayRes.status === 200 &&
      rapidReloginRes28 === true &&
      rapidStateAfter28?.authed === true &&
      rapidStateAfter28?.activeEmail === 'edge28inherit@bhfirms.com' &&
      rapidStateAfter28?.usersStatus === 200 &&
      oldCookieAfterRapidRes28.status === 401 &&
      Boolean(cookieBeforeReload28) &&
      cookieBeforeReload28 !== cookieBeforeRapid28 &&
      preReloadReplayRes.status === 200 &&
      reloadState28?.authed === false &&
      reloadState28?.usersStatus === 401 &&
      oldCookieAfterReloadRes28.status === 401
    ) {
      pass(
        'edge-28-remote-tdz-boot-and-redacted-faceid-e2e',
        `0 TDZ, cookie-only auth (0 localStorage JWT), R2 seed hydrated & purged on logout, Email+PIN+Face ID d=${e28Flow.fOkDist}, rapid re-login & unload cookie revocation OK`
      );
    } else {
      fail('edge-28-remote-tdz-boot-and-redacted-faceid-e2e', JSON.stringify({
        bootConsoleErrors28,
        unexpectedErrors28,
        consoleErrors,
        rapidCheck: {
          hasCookie: Boolean(cookieBeforeRapid28),
          preStatus: preRapidReplayRes.status,
          rapidStateAfter28,
          oldCookieAfterRapidStatus: oldCookieAfterRapidRes28.status
        },
        reloadCheck: {
          hasCookie: Boolean(cookieBeforeReload28),
          rotated: cookieBeforeReload28 !== cookieBeforeRapid28,
          preStatus: preReloadReplayRes.status,
          reloadState28,
          oldCookieAfterReloadStatus: oldCookieAfterReloadRes28.status
        },
        wsBoth: [wsDefaultBothPinOnlyRes.status, wsDefaultBothPinOnlyRes.json?.two_factor_face_required],
        rateLim: [rateLimitFirstStatus, rateLimitNinthStatus, rateLimitNinthFlag],
        verify2fa: [verifyOnly2faUnauthRes.status, verifyOnly2faAuthRes.status, Boolean(verifyOnly2faAuthRes.json?.token)],
        full2fa: [fullLogin2faNoPinRes.status, fullLogin2faNoPinRes.json?.two_factor_pin_required],
        pinOnly: [unauthAllowPinOnlyRes.status, authAllowPinOnlyRes.status],
        impOracle: [imposterHttpRes.status, imposterHttpRes.json?.face_dist],
        faceProbes: {
          wsBothFace: [wsDefaultBothFaceAloneRes.status, wsDefaultBothFaceAloneRes.json],
          both: [probeBothRes.status, probeBothRes.json, Boolean(probeBothRes.headers['set-cookie'])],
          pinOnly: [probePinOnlyRes.status, probePinOnlyRes.json],
          lock: probeLockStatus,
          pinAfterLock: [pinAfterFaceLockRes.status, pinAfterFaceLockRes.json?.error],
          emailLock: probeEmailLockStatus,
          pinAfterEmailLock: [pinAfterEmailFaceLockRes.status, pinAfterEmailFaceLockRes.json?.error],
          bothFaceFirst: bothFaceFirstStatuses,
          ipKeep: ipKeepStatuses,
          faceClear: faceClearStatuses,
          pinViaFace: pinViaFaceStatuses,
          verifyMiss: verifyMissStatuses,
          emaillessPin: emaillessPinStatuses,
          verifyKeep: verifyKeepStatuses,
          signinKeep: signinKeepStatuses,
          blankEmail: blankEmailStatuses
        },
        e28Flow
      }));
    }

    // 29. Sentinel Reviews Edge D1 Reviewer-Role Guard, Multi-BU Supervisor Group/Industry Scope & Cross-BU Key Forgery Block
    await httpReq('POST', '/app/api/users', {
      user: {
        id: 'u-edge29-entry',
        email: 'edge29entry@wtc-lb.com',
        full_name: 'Edge29 Entry Clerk',
        role: 'Entry',
        companies: 'WTC',
        auth_mode: 'pin',
        pin_code: '2911',
        status: 'Active'
      }
    }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/users', {
      user: {
        id: 'u-edge29-sup',
        email: 'edge29sup@wtc-lb.com',
        full_name: 'Edge29 MultiBU Supervisor',
        role: 'Supervisor',
        companies: 'WTC, Lions Transport, Blanca, La Una',
        auth_mode: 'pin',
        pin_code: '2922',
        status: 'Active'
      }
    }, { 'X-ISABI-Session': ownerToken });

    const e29EntryLogin = await httpReq('POST', '/app/api/auth/login', { email: 'edge29entry@wtc-lb.com', pin: '2911', method: 'PIN' });
    const e29SupLogin = await httpReq('POST', '/app/api/auth/login', { email: 'edge29sup@wtc-lb.com', pin: '2922', method: 'PIN' });
    const e29EntryTok = e29EntryLogin.json?.token || '';
    const e29SupTok = e29SupLogin.json?.token || '';

    const e29EntryPost = await httpReq('POST', '/app/api/sentinel_reviews', {
      review: { id: 'wtc|S4', rule_id: 'S4', company: 'wtc', active: true, updated_at: '2026-11-08T19:10:00Z' }
    }, { 'X-ISABI-Session': e29EntryTok });

    const e29SupMfgGroup = await httpReq('POST', '/app/api/sentinel_reviews', {
      review: { id: 'manufacturing-group|S4', rule_id: 'S4', company: 'manufacturing-group', active: true, note: 'Checked WTC+Lions', updated_at: '2026-11-08T19:11:00Z' }
    }, { 'X-ISABI-Session': e29SupTok });

    const e29SupHspInd = await httpReq('POST', '/app/api/sentinel_reviews', {
      review: { id: 'industry:Hospitality & Resorts|R2', rule_id: 'R2', company: 'industry:Hospitality & Resorts', active: true, updated_at: '2026-11-08T19:12:00Z' }
    }, { 'X-ISABI-Session': e29SupTok });

    const e29SupCrossForgery = await httpReq('POST', '/app/api/sentinel_reviews', {
      reviews: {
        'bbconstruction|S4': { id: 'bbconstruction|S4', rule_id: 'S4', company: 'wtc', active: true, updated_at: '2026-11-08T19:13:00Z' },
        'insurance|I3': { id: 'insurance|I3', rule_id: 'I3', company: 'insurance', active: true, updated_at: '2026-11-08T19:13:00Z' }
      }
    }, { 'X-ISABI-Session': e29SupTok });

    const e29SupGet = await httpReq('GET', '/app/api/sentinel_reviews', null, { 'X-ISABI-Session': e29SupTok });
    const e29Reviews = e29SupGet.json?.reviews || {};

    if (
      e29EntryPost.status === 403 &&
      e29SupMfgGroup.status === 200 &&
      e29SupMfgGroup.json?.saved === 1 &&
      e29SupHspInd.status === 200 &&
      e29SupHspInd.json?.saved === 1 &&
      e29SupCrossForgery.status === 200 &&
      e29SupCrossForgery.json?.saved === 0 &&
      Boolean(e29Reviews['manufacturing-group|S4']) &&
      Boolean(e29Reviews['industry:Hospitality & Resorts|R2']) &&
      !e29Reviews['bbconstruction|S4'] &&
      !e29Reviews['insurance|I3']
    ) {
      pass('edge-29-sentinel-reviews-rls-and-multibu-supervisor', 'Entry 403 + Multi-BU Supervisor manufacturing-group & industry:* saved=1 + cross-BU key forgery saved=0');
    } else {
      fail('edge-29-sentinel-reviews-rls-and-multibu-supervisor', JSON.stringify({
        entry: e29EntryPost.status,
        mfgGroup: [e29SupMfgGroup.status, e29SupMfgGroup.json],
        hspInd: [e29SupHspInd.status, e29SupHspInd.json],
        forgery: [e29SupCrossForgery.status, e29SupCrossForgery.json],
        keys: Object.keys(e29Reviews)
      }));
    }

    // 30. Server-Side Telematics Proxy (`/app/api/telematics`): 401 Anon, 403 Cross-BU RLS, Demo Sandbox, Device-ID Override, Secret Scrub & Slosh Physics
    await httpReq('POST', '/app/api/users', {
      user: {
        id: 'u-bbc-only-tel',
        email: 'bbc.tel@bhfirms.com',
        full_name: 'BBC Only Seat',
        role: 'Entry',
        companies: 'BBConstruction',
        pin_code: '5839',
        status: 'Active'
      }
    }, { 'X-ISABI-Session': ownerToken });
    const bbcTelLogin = await httpReq('POST', '/app/api/auth/login', {
      email: 'bbc.tel@bhfirms.com',
      pin: '5839',
      method: 'PIN'
    });
    const bbcTelTok = String(bbcTelLogin.json?.token || '');

    const telAnon = await httpReq('GET', '/app/api/telematics');
    const telCrossSnap = await httpReq('GET', '/app/api/telematics?company=WTC', null, { 'X-ISABI-Session': bbcTelTok });
    const telCrossHist = await httpReq('GET', '/app/api/telematics?action=history&device_id=17733&from_date=2026-11-08&to_date=2026-11-08', null, { 'X-ISABI-Session': bbcTelTok });
    const telBbcDefault = await httpReq('GET', '/app/api/telematics', null, { 'X-ISABI-Session': bbcTelTok });
    const telDemo = await httpReq('GET', '/app/api/telematics', null, { 'X-ISABI-Demo': '1' });
    const telWtcSnap = await httpReq('GET', '/app/api/telematics?company=WTC', null, { 'X-ISABI-Session': entryToken });
    const telWtcHist = await httpReq('GET', '/app/api/telematics?action=history&device_id=17733&from_date=2026-11-08&to_date=2026-11-08', null, { 'X-ISABI-Session': entryToken });
    const telUnknownWtcSeat = await httpReq('GET', '/app/api/telematics?action=history&device_id=999999&from_date=2026-11-08&to_date=2026-11-08', null, { 'X-ISABI-Session': entryToken });
    const telUnknownOwner = await httpReq('GET', '/app/api/telematics?action=history&device_id=999999&from_date=2026-11-08&to_date=2026-11-08', null, { 'X-ISABI-Session': ownerToken });

    const telSloshCheck = await httpReq('POST', '/app/api/telematics?action=verify_physics', {
      tank_cap_l: 400,
      points: [
        { ts: 1000, speed: 65, acc_on: true, io89: 4, io83: 5000, io87: 100000 },
        { ts: 1060, speed: 68, acc_on: true, io89: 33, io83: 5008, io87: 101100 },
        { ts: 1120, speed: 62, acc_on: true, io89: 6, io83: 5015, io87: 102200 }
      ]
    }, { 'X-ISABI-Session': entryToken });

    const telMixedOdoShortStopCheck = await httpReq('POST', '/app/api/telematics?action=verify_physics', {
      tank_cap_l: 400,
      points: [
        { time: '08-11-2026 06:00:00 AM', lat: 33.8403, lng: 35.4919, speed: 0, other: '<info><totaldistance>42100000</totaldistance><io89>50</io89><di1>0</di1></info>' },
        { time: '08-11-2026 06:00:10 AM', lat: 33.8403, lng: 35.4919, speed: 0, other: '<info><totaldistance>42100000</totaldistance><io89>38</io89><di1>0</di1></info>' },
        { time: '08-11-2026 07:15:00 AM', lat: 33.7600, lng: 35.4800, speed: 62, other: '<info><io87>345510000</io87><totaldistance>42112000</totaldistance><io89>48</io89><di1>1</di1></info>' },
        { time: '08-11-2026 08:00:00 AM', lat: 33.6308, lng: 35.4265, speed: 55, other: '<info><io87>345535000</io87><totaldistance>42137000</totaldistance><io89>47</io89><di1>1</di1></info>' }
      ]
    }, { 'X-ISABI-Session': entryToken });

    const telSiphonCheck = await httpReq('POST', '/app/api/telematics?action=verify_physics', {
      tank_cap_l: 400,
      points: [
        { ts: 2000, speed: 0, acc_on: false, io89: 55, io83: 6000, io87: 200000 },
        { ts: 2120, speed: 0, acc_on: false, io89: 55, io83: 6000, io87: 200000 },
        { ts: 2240, speed: 0, acc_on: false, io89: 43, io83: 6000, io87: 200000 },
        { ts: 2360, speed: 0, acc_on: false, io89: 43, io83: 6000, io87: 200000 }
      ]
    }, { 'X-ISABI-Session': entryToken });

    const wtcUnits = telWtcSnap.json?.units || [];
    const tb3Unit = wtcUnits.find(u => u.device_id === 17733);
    const tb4Unit = wtcUnits.find(u => u.device_id === 18460);
    const tb9Unit = wtcUnits.find(u => u.device_id === 18571);
    const noSecretLeak = !/user_api_hash|Gps@1234|vt-lb\.com/i.test(telWtcSnap.text + ' ' + telDemo.text);

    if (
      telAnon.status === 401 &&
      telCrossSnap.status === 403 &&
      telCrossHist.status === 403 &&
      telUnknownWtcSeat.status === 403 &&
      telUnknownOwner.status === 404 &&
      telBbcDefault.status === 200 &&
      (telBbcDefault.json?.units || []).length === 0 &&
      telDemo.status === 200 &&
      telDemo.json?.demo === true &&
      telWtcSnap.status === 200 &&
      wtcUnits.length === 7 &&
      tb3Unit?.equipment === 'TB3' &&
      tb3Unit?.plate_no === '358599' &&
      tb9Unit?.equipment === 'Tb9' &&
      tb9Unit?.plate_no === '364168' &&
      tb4Unit?.status_code === 'power_cut' &&
      telWtcHist.status === 200 &&
      telWtcHist.json?.history?.ecu_burn_l > 0 &&
      noSecretLeak &&
      telSloshCheck.status === 200 &&
      (telSloshCheck.json?.recon?.siphon_alerts || []).length === 0 &&
      (telSloshCheck.json?.recon?.refill_events || []).length === 0 &&
      telMixedOdoShortStopCheck.status === 200 &&
      Math.abs((telMixedOdoShortStopCheck.json?.recon?.km_gps || 0) - 25) < 0.2 &&
      (telMixedOdoShortStopCheck.json?.recon?.siphon_alerts || []).length === 0 &&
      telSiphonCheck.status === 200 &&
      (telSiphonCheck.json?.recon?.siphon_alerts || []).length === 1
    ) {
      pass('edge-30-telematics-rls-demo-and-slosh-physics', '401 anon + 403 cross-BU/unknown device_id + 0 BBC leak + Demo sandbox + 7 WTC device_id overrides + mixed CAN/GPS odo & 10s stop guard + siphon physics');
    } else {
      fail('edge-30-telematics-rls-demo-and-slosh-physics', JSON.stringify({
        anon: telAnon.status,
        crossSnap: telCrossSnap.status,
        crossHist: telCrossHist.status,
        bbcLen: (telBbcDefault.json?.units || []).length,
        demo: [telDemo.status, telDemo.json?.demo],
        wtcLen: wtcUnits.length,
        tb3: [tb3Unit?.equipment, tb3Unit?.plate_no],
        tb9: [tb9Unit?.equipment, tb9Unit?.plate_no],
        tb4: tb4Unit?.status_code,
        hist: [telWtcHist.status, telWtcHist.json?.history?.ecu_burn_l],
        noSecretLeak,
        slosh: telSloshCheck.json?.recon,
        siphon: telSiphonCheck.json?.recon
      }));
    }

    // 31. Step-Up Bound-Seat Identity Gate (`step_up: true`), Server-Redacted Kiosk Verify (`/app/api/kiosk/verify`), & Append-Only `stepUpAudits` RLS
    const suNoSess = await httpReq('POST', '/app/api/auth/login', {
      email: 'husseinbdeir@bhfirms.com',
      pin: '1111',
      verify_only: true,
      step_up: true
    }, { 'CF-Connecting-IP': '198.51.100.31' });
    const suCrossSeat = await httpReq('POST', '/app/api/auth/login', {
      email: 'bbc.tel@bhfirms.com',
      pin: '5839',
      verify_only: true,
      step_up: true,
      redact_dist: true
    }, { 'X-ISABI-Session': ownerToken });
    const suOwnSeat = await httpReq('POST', '/app/api/auth/login', {
      email: 'husseinbdeir@bhfirms.com',
      pin: '1111',
      verify_only: true,
      step_up: true,
      redact_dist: true
    }, { 'X-ISABI-Session': ownerToken });

    const kvAnon = await httpReq('POST', '/app/api/kiosk/verify', { op: 'verify_pin', pin: '1234' });
    const kskKey31 = 'kiosk-edge31-station-secret-key';
    const kvProv = await httpReq('POST', '/app/api/kiosk/verify', {
      op: 'provision_station_key',
      site: '*',
      rawKey: kskKey31
    }, { 'X-ISABI-Session': ownerToken });

    const mkVec31 = (idx, v = 0.72) => {
      const a = new Array(128).fill(0.01);
      a[idx % 128] = v;
      return a;
    };
    const vecK1 = mkVec31(11, 0.75);
    const vecK2 = mkVec31(67, 0.75);
    const kvEnrol1 = await httpReq('POST', '/app/api/kiosk/verify', {
      op: 'enrol_user',
      site: 'LAUNA',
      user: { id: 'pos-c1', name: 'Cashier One', role: 'supervisor' },
      descriptors: [vecK1, vecK1, vecK1]
    }, { 'X-Kiosk-Key': kskKey31 });
    const kvDupEnrol = await httpReq('POST', '/app/api/kiosk/verify', {
      op: 'enrol_user',
      site: 'LAUNA',
      user: { id: 'pos-c2-dup', name: 'Impostor Cashier', role: 'cashier' },
      descriptors: [vecK1, vecK1, vecK1]
    }, { 'X-Kiosk-Key': kskKey31 });
    const kvMatch1 = await httpReq('POST', '/app/api/kiosk/verify', {
      op: 'verify_face',
      site: 'LAUNA',
      descriptor: vecK1
    }, { 'X-Kiosk-Key': kskKey31 });
    const badVec31 = new Array(128).fill(0); badVec31[0] = 'NaN';
    const kvNan = await httpReq('POST', '/app/api/kiosk/verify', {
      op: 'verify_face',
      site: 'LAUNA',
      descriptor: badVec31
    }, { 'X-Kiosk-Key': kskKey31 });
    // 6 unused PIN probes with checkOnly: true must return 200 (matched: false, checkOnly: true) without 429 lockout
    const checkOnlyRes = [];
    for (let ci = 0; ci < 6; ci++) {
      const r = await httpReq('POST', '/app/api/kiosk/verify', {
        op: 'verify_pin',
        site: 'LAUNA',
        pinhash: `unused-pin-hash-${ci}`,
        checkOnly: true
      }, { 'X-Kiosk-Key': kskKey31 });
      checkOnlyRes.push(r);
    }

    const kvAttSync = await httpReq('POST', '/app/api/kiosk/verify', {
      op: 'sync',
      resort: 'BLANCA',
      faces: [
        { id: 'stf-1:1', staffId: 'stf-1', staffName: 'Rami Guard', role: 'Security', sample: 1, descriptor: vecK2 },
        { id: 'stf-1:2', staffId: 'stf-1', staffName: 'Rami Guard', role: 'Security', sample: 2, descriptor: vecK2 },
        { id: 'stf-1:3', staffId: 'stf-1', staffName: 'Rami Guard', role: 'Security', sample: 3, descriptor: vecK2 }
      ],
      staff: [{ id: 'stf-1', name: 'Rami Guard', dept: 'Gate Ops', role: 'Security' }],
      punches: [{ id: 'p-att-31', staffId: 'stf-1', staffName: 'Rami Guard', ts: new Date().toISOString(), day: '2026-11-08', dir: 'IN', method: 'face' }]
    }, { 'X-Kiosk-Key': kskKey31 });
    // Partial pose sync (sample 2 only) must preserve poses 1 and 3
    await httpReq('POST', '/app/api/kiosk/verify', {
      op: 'sync',
      resort: 'BLANCA',
      faces: [
        { id: 'stf-1:2', staffId: 'stf-1', staffName: 'Rami Guard', role: 'Security', sample: 2, descriptor: vecK2 }
      ]
    }, { 'X-Kiosk-Key': kskKey31 });
    const kvAttRoster = await httpReq('POST', '/app/api/kiosk/verify', {
      op: 'roster',
      resort: 'BLANCA',
      restore: true,
      redact: true
    }, { 'X-Kiosk-Key': kskKey31 });
    const kvAttVerify = await httpReq('POST', '/app/api/kiosk/verify', {
      op: 'verify',
      resort: 'BLANCA',
      method: 'face',
      descriptor: vecK2
    }, { 'X-Kiosk-Key': kskKey31 });

    // Append-only stepUpAudits RLS via /app/api/sync
    await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          stepUpAudits: [{
            id: 'sua-owner-31',
            ts: '2026-11-08T23:15:00Z',
            user_id: 'u1',
            email: 'husseinbdeir@bhfirms.com',
            user_name: 'Hussein Bdeir',
            role: 'Owner',
            company: 'WTC',
            action_code: 'reopen_period',
            action_label: 'Reopen Sealed Accounting Period',
            off_hours: true,
            burst_anomaly: false
          }]
        }
      }
    }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          // BBC entry seat attempts to wipe owner audit & forge another seat's audit
          stepUpAudits: [{
            id: 'sua-forged-31',
            ts: '2026-11-08T23:16:00Z',
            user_id: 'u1',
            email: 'husseinbdeir@bhfirms.com',
            user_name: 'Forged Owner',
            company: 'WTC',
            action_code: 'void_record'
          }]
        }
      }
    }, { 'X-ISABI-Session': bbcTelTok });
    const syncOwnerAfter31 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const syncBbcAfter31 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': bbcTelTok });
    const ownerAudits31 = syncOwnerAfter31.json?.docs?.mfg_web_store?.stepUpAudits || [];
    const bbcAudits31 = syncBbcAfter31.json?.docs?.mfg_web_store?.stepUpAudits || [];

    if (
      suNoSess.status === 401 &&
      suCrossSeat.status === 403 &&
      suOwnSeat.status === 200 &&
      suOwnSeat.json?.step_up === true &&
      !('face_dist' in (suOwnSeat.json || {})) &&
      kvAnon.status === 401 &&
      kvProv.status === 200 &&
      kvEnrol1.status === 200 &&
      kvDupEnrol.status === 409 &&
      kvDupEnrol.json?.reason === 'duplicate-face' &&
      kvMatch1.status === 200 &&
      kvMatch1.json?.matched === true &&
      kvMatch1.json?.userId === 'pos-c1' &&
      !('distance' in (kvMatch1.json || {})) &&
      kvNan.status === 400 &&
      checkOnlyRes.length === 6 &&
      checkOnlyRes.every(r => r.status === 200 && r.json?.matched === false && r.json?.checkOnly === true) &&
      kvAttSync.status === 200 &&
      (kvAttSync.json?.syncedPunches || kvAttSync.json?.punches || []).length === 1 &&
      kvAttRoster.status === 200 &&
      (kvAttRoster.json?.faces || []).length === 3 &&
      (kvAttRoster.json?.staff || []).some(s => s.id === 'stf-1' && s.dept === 'Gate Ops') &&
      (kvAttRoster.json?.faces || []).every(f => (!f.descriptor || f.descriptor.length === 0) && !f.pinhash) &&
      kvAttVerify.status === 200 &&
      kvAttVerify.json?.matched === true &&
      (kvAttVerify.json?.staffId || kvAttVerify.json?.staff?.id) === 'stf-1' &&
      ownerAudits31.some(a => a.id === 'sua-owner-31') &&
      !ownerAudits31.some(a => a.id === 'sua-forged-31') &&
      !bbcAudits31.some(a => a.id === 'sua-owner-31')
    ) {
      pass(
        'edge-31-step-up-auth-and-kiosk-verify',
        'Step-Up 401/403/200 + 0 face_dist leak + /kiosk/verify POS & Attendance 1:N + 409 dup + 400 NaN + redacted roster + append-only stepUpAudits RLS'
      );
    } else {
      fail('edge-31-step-up-auth-and-kiosk-verify', JSON.stringify({
        su: [suNoSess.status, suCrossSeat.status, suOwnSeat.status, suOwnSeat.json],
        kv: [kvAnon.status, kvProv.status, kvEnrol1.status, kvDupEnrol.status, kvMatch1.json, kvNan.status, kvAttSync.json, kvAttRoster.json, kvAttVerify.json],
        aud: [ownerAudits31.map(a => a.id), bbcAudits31.map(a => a.id)]
      }));
    }

    // 32. No default PIN + Zero Bare-PIN Seat Enumeration: a seat saved without a PIN cannot sign in with any PIN;
    //     blank and redacted saves keep the PBKDF2 PIN on file; sync mirror stores no default; bare-PIN login returns 400.
    const e32Seat = { id: 'u-edge32-nopin', email: 'edge32nopin@wtc-lb.com', full_name: 'Edge32 No PIN', role: 'Entry', companies: 'WTC', status: 'Active' };
    const e32Hdr = { 'X-ISABI-Session': ownerToken };
    const e32IpHdr = { 'CF-Connecting-IP': '198.51.100.32' };
    const e32PinOnlyBefore = await httpReq('POST', '/app/api/auth/login', { pin: '1111', method: 'PIN', verify_only: true }, e32IpHdr);
    const e32Create = await httpReq('POST', '/app/api/users', { user: e32Seat }, e32Hdr);
    const e32Default = await httpReq('POST', '/app/api/auth/login', { email: e32Seat.email, pin: '1111', method: 'PIN' }, e32IpHdr);
    const e32Empty = await httpReq('POST', '/app/api/auth/login', { email: e32Seat.email, pin: '', method: 'PIN' }, e32IpHdr);
    const e32SetPin = await httpReq('POST', '/app/api/users', { user: Object.assign({}, e32Seat, { pin_code: '640275' }) }, e32Hdr);
    const e32Good = await httpReq('POST', '/app/api/auth/login', { email: e32Seat.email, pin: '640275', method: 'PIN' }, e32IpHdr);
    const e32BlankSave = await httpReq('POST', '/app/api/users', { user: Object.assign({}, e32Seat, { pin_code: '' }) }, e32Hdr);
    const e32StillGood = await httpReq('POST', '/app/api/auth/login', { email: e32Seat.email, pin: '640275', method: 'PIN' }, e32IpHdr);
    const e32RedactedSave = await httpReq('POST', '/app/api/users', { user: Object.assign({}, e32Seat, { pin_redacted: true, pin_code: '491827' }) }, e32Hdr);
    const e32AfterRedacted = await httpReq('POST', '/app/api/auth/login', { email: e32Seat.email, pin: '640275', method: 'PIN' }, e32IpHdr);
    const e32RedactedPinRefused = await httpReq('POST', '/app/api/auth/login', { email: e32Seat.email, pin: '491827', method: 'PIN' }, e32IpHdr);
    const e32PinOnlyUnique = await httpReq('POST', '/app/api/auth/login', { pin: '640275', method: 'PIN' }, e32IpHdr);

    // Sync mirror: an Owner patch that carries a new seat with no pin_code must store no PIN for it
    const e32Mirror = { id: 'u-edge32-mirror', email: 'edge32mirror@wtc-lb.com', full_name: 'Edge32 Mirror Seat', role: 'Entry', companies: 'WTC', status: 'Active' };
    const e32Cur = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, e32Hdr);
    const e32Doc = JSON.parse(JSON.stringify(e32Cur.json?.docs?.mfg_web_store || {}));
    const e32UsersNow = await httpReq('GET', '/app/api/users', null, e32Hdr);
    e32Doc.users = (e32UsersNow.json?.users || []).concat([e32Mirror]);
    const e32PrevTs = Date.parse(String(e32Doc.updatedAt || '')) || 0;
    e32Doc.updatedAt = new Date(Math.max(e32PrevTs, Date.now()) + 60000).toISOString();
    const e32Patch = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: String(e32Cur.json?.docs?.mfg_web_store?.updatedAt || ''),
      awaitMirror: true,
      patch: { mfg_web_store: Object.assign({}, e32Doc, { minShellVer: MIN_SYNC_SHELL_VER }) }
    }, e32Hdr);
    const e32UsersAfter = await httpReq('GET', '/app/api/users', null, e32Hdr);
    const e32MirrorRow = (e32UsersAfter.json?.users || []).find(u => u && u.email === e32Mirror.email);
    const e32MirrorDefault = await httpReq('POST', '/app/api/auth/login', { email: e32Mirror.email, pin: '1111', method: 'PIN' }, { 'CF-Connecting-IP': '198.51.100.33' });
    const e32PinOnlyAfter = await httpReq('POST', '/app/api/auth/login', { pin: '1111', method: 'PIN', verify_only: true }, { 'CF-Connecting-IP': '198.51.100.33' });

    const e32Denied = r => r.status === 401 && !(r.json && r.json.ok) && !(r.json && r.json.token);
    if (
      e32Create.status === 200 &&
      e32Denied(e32Default) &&
      e32Denied(e32Empty) &&
      e32SetPin.status === 200 &&
      e32Good.status === 200 && Boolean(e32Good.json?.token) &&
      e32BlankSave.status === 200 &&
      e32StillGood.status === 200 && Boolean(e32StillGood.json?.token) &&
      e32RedactedSave.status === 200 &&
      e32AfterRedacted.status === 200 && Boolean(e32AfterRedacted.json?.token) &&
      e32Denied(e32RedactedPinRefused) &&
      e32PinOnlyUnique.status === 400 && !e32PinOnlyUnique.json?.token &&
      e32Patch.status === 200 &&
      Boolean(e32MirrorRow) && !String(e32MirrorRow.pin_code || '').trim() &&
      e32Denied(e32MirrorDefault) &&
      e32PinOnlyBefore.status === 401 && e32PinOnlyAfter.status === 401
    ) {
      pass('edge-32-no-default-pin', 'No-PIN seat rejects 1111 and empty PIN (401); owner-set PBKDF2 PIN signs in; blank and redacted saves keep PIN; sync mirror stores no default; bare-PIN login blocked (400)');
    } else {
      fail('edge-32-no-default-pin', JSON.stringify({
        create: e32Create.status,
        denied: [e32Default.status, e32Empty.status, e32RedactedPinRefused.status, e32MirrorDefault.status],
        set: [e32SetPin.status, e32BlankSave.status, e32RedactedSave.status],
        good: [e32Good.status, e32StillGood.status, e32AfterRedacted.status],
        pinOnly: [e32PinOnlyBefore.status, e32PinOnlyAfter.status, e32PinOnlyUnique.status, e32PinOnlyUnique.json],
        mirror: [e32Patch.status, e32Patch.json?.error, e32MirrorRow ? String(e32MirrorRow.pin_code || '') : 'missing']
      }));
    }

    // 33. Phase 1 + 1B Edge Hardening: Showcase OPTIONS CORS, Static Bundle Lockdown, R2 Seed Gate, Vault HTML XSS Sandbox, Security Headers & Showcase AI Escaping
    const e33CorsOpt = await httpReq('OPTIONS', '/api/ask', null, {
      Origin: 'https://isabisystems.com',
      'Access-Control-Request-Method': 'POST'
    });
    const e33BlockedPaths = [
      '/wrangler.toml',
      '/app/server.py',
      '/build/assemble.py',
      '/exports/cloudflare_edge_meta.json',
      '/functions/_lib/security.js',
      '/app/js/seed_core.json',
      '/app/js/seed_records.json',
      '/app/js/seed_industries.json'
    ];
    const e33BlockedRes = await Promise.all(e33BlockedPaths.map(p => httpReq('GET', p)));
    const e33DemoSeedRes = await httpReq('GET', '/app/js/seed_demo_core.json');
    const e33SeedAnon = await httpReq('GET', '/app/api/seed/core');
    const e33SeedDemo = await httpReq('GET', '/app/api/seed/core', null, { 'X-ISABI-Session': ownerToken, 'X-ISABI-Demo': '1' });
    const e33SeedOwner = await httpReq('GET', '/app/api/seed/core', null, { 'X-ISABI-Session': ownerToken });
    const e33SeedBadKind = await httpReq('GET', '/app/api/seed/unknown', null, { 'X-ISABI-Session': ownerToken });

    // Vault raw HTML attachment quarantine (forces octet-stream + attachment + CSP sandbox + nosniff)
    const e33HtmlPut = await httpReq('POST', '/app/api/blobs', {
      id: 'att-xss-html-33',
      company: 'WTC',
      dataUrl: 'data:text/html;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64')
    }, { 'X-ISABI-Session': ownerToken });
    const e33HtmlRaw = await httpReq('GET', '/app/api/blobs?id=att-xss-html-33&raw=1', null, { 'X-ISABI-Session': ownerToken });

    // Security headers on `/` + `/reset.html` X-Robots-Tag + Showcase AI output HTML escaping
    const e33RootRes = await httpReq('GET', '/');
    const e33ResetRes = await httpReq('GET', '/reset.html');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    for (let i = 0; i < 80; i++) {
      const hasHelper = await evalJs(`typeof window.__ISABI_TEST_AI_REPLY === 'function'`);
      if (hasHelper) break;
      await sleep(250);
    }
    const e33AiXss = await evalJs(`(() => {
      const r = window.__ISABI_TEST_AI_REPLY(JSON.stringify({
        title: '<img src=x onerror=alert(1)>',
        answer: '**Safe** <script>evil()</script>',
        bullets: ['<b>tag</b>'],
        actionInd: 'javascript:alert(1)'
      }));
      if (!r) return null;
      return {
        html: String(r.html || ''),
        actionInd: String(r.parsed?.actionInd || '')
      };
    })()`);

    const rootCsp = String(e33RootRes.headers['content-security-policy'] || '');
    const htmlCt = String(e33HtmlRaw.headers['content-type'] || '');
    const htmlCd = String(e33HtmlRaw.headers['content-disposition'] || '');
    const htmlCsp = String(e33HtmlRaw.headers['content-security-policy'] || '');
    if (
      e33CorsOpt.status === 204 &&
      e33CorsOpt.headers['access-control-allow-origin'] === 'https://isabisystems.com' &&
      e33BlockedRes.every(r => r.status === 404) &&
      e33DemoSeedRes.status === 200 &&
      e33SeedAnon.status === 401 &&
      e33SeedDemo.status === 403 &&
      e33SeedOwner.status === 200 &&
      String(e33SeedOwner.headers['cache-control'] || '').includes('no-store') &&
      Boolean(e33SeedOwner.json && typeof e33SeedOwner.json === 'object') &&
      e33SeedBadKind.status === 400 &&
      e33HtmlPut.status === 200 &&
      e33HtmlRaw.status === 200 &&
      htmlCt.includes('application/octet-stream') &&
      htmlCd.includes('attachment') &&
      htmlCsp.includes('sandbox') &&
      e33HtmlRaw.headers['x-content-type-options'] === 'nosniff' &&
      Boolean(e33RootRes.headers['strict-transport-security']) &&
      rootCsp.includes("frame-ancestors 'none'") &&
      rootCsp.includes("object-src 'none'") &&
      e33RootRes.headers['x-frame-options'] === 'DENY' &&
      e33RootRes.headers['x-content-type-options'] === 'nosniff' &&
      e33ResetRes.status === 200 &&
      String(e33ResetRes.headers['x-robots-tag'] || '').includes('noindex') &&
      Boolean(e33AiXss) &&
      !e33AiXss.html.includes('<img') &&
      !e33AiXss.html.includes('<script') &&
      e33AiXss.html.includes('&lt;img') &&
      e33AiXss.html.includes('<b>Safe</b>') &&
      e33AiXss.actionInd === ''
    ) {
      pass(
        'edge-33-phase1-bundle-seed-gate-headers-and-xss-quarantine',
        'OPTIONS /api/ask=204 + 8 internal/seed paths=404 + R2 /seed/core 401/403/200(no-store) + HTML blob sandboxed + HSTS/CSP/XFO/Robots + Showcase AI XSS escaped'
      );
    } else {
      fail('edge-33-phase1-bundle-seed-gate-headers-and-xss-quarantine', JSON.stringify({
        cors: [e33CorsOpt.status, e33CorsOpt.headers['access-control-allow-origin']],
        blocked: e33BlockedRes.map((r, i) => [e33BlockedPaths[i], r.status]),
        demoSeed: e33DemoSeedRes.status,
        seedGate: [e33SeedAnon.status, e33SeedDemo.status, e33SeedOwner.status, e33SeedBadKind.status, e33SeedOwner.headers['cache-control']],
        blobXss: [e33HtmlPut.status, e33HtmlRaw.status, htmlCt, htmlCd, htmlCsp, e33HtmlRaw.headers['x-content-type-options']],
        hdrs: [Boolean(e33RootRes.headers['strict-transport-security']), rootCsp.slice(0, 120), e33RootRes.headers['x-frame-options'], e33ResetRes.status, e33ResetRes.headers['x-robots-tag']],
        aiXss: e33AiXss
      }));
    }

    // 34. Phase 1.3–1.4: Public PII/2401 scrub + ?demo=1 Demo Workspace badge + D1 /app/api/auth/verify-override RLS, Audit & 5-attempt Lockout
    const e34AppJsDir = path.join(ROOT, 'app', 'js');
    const e34JsFiles = fs.readdirSync(e34AppJsDir).filter(f => f.endsWith('.js'));
    const e34LeakedBhfirms = [];
    const e34LeakedPin2401 = [];
    for (const jf of e34JsFiles) {
      const txt = fs.readFileSync(path.join(e34AppJsDir, jf), 'utf8');
      if (/@bhfirms\.com/i.test(txt)) e34LeakedBhfirms.push(jf);
      if (/PIN\s*\(?2401\)?|===\s*['"]2401['"]/i.test(txt)) e34LeakedPin2401.push(jf);
    }
    const e34OvAnon = await httpReq('POST', '/app/api/auth/verify-override', { email: 'fleet.lions@bhfirms.com', pin: '7777', company: 'WTC', field_id: 'f_price' });
    const e34OvDemo = await httpReq('POST', '/app/api/auth/verify-override', { email: 'fleet.lions@bhfirms.com', pin: '7777', company: 'WTC', field_id: 'f_price' }, { 'X-ISABI-Session': entryToken, 'X-ISABI-Demo': '1' });
    const e34OvSelfEntry = await httpReq('POST', '/app/api/auth/verify-override', { email: ENTRY_TEST_EMAIL, pin: '3333', company: 'WTC', field_id: 'f_price' }, { 'X-ISABI-Session': entryToken });
    const e34OvCrossBu = await httpReq('POST', '/app/api/auth/verify-override', { email: 'site.bbc@bhfirms.com', pin: '6666', company: 'WTC', field_id: 'f_price' }, { 'X-ISABI-Session': entryToken });
    const e34Ov2401 = await httpReq('POST', '/app/api/auth/verify-override', { email: 'fleet.lions@bhfirms.com', pin: '2401', company: 'WTC', field_id: 'f_price' }, { 'X-ISABI-Session': entryToken });
    const e34OvOk = await httpReq('POST', '/app/api/auth/verify-override', { email: 'fleet.lions@bhfirms.com', pin: '7777', company: 'WTC', form_tab: 'sales', field_id: 'f_price', record_id: 'ST-TEST-1' }, { 'X-ISABI-Session': entryToken });
    const e34AuditEntryDenied = await httpReq('GET', '/app/api/auth/verify-override?company=WTC', null, { 'X-ISABI-Session': entryToken });
    const e34AuditOwner = await httpReq('GET', '/app/api/auth/verify-override?company=WTC', null, { 'X-ISABI-Session': ownerToken });
    const e34HasAuditRow = (e34AuditOwner.json?.audits || []).some(r => r && r.id === e34OvOk.json?.audit_id && r.supervisor_email === 'fleet.lions@bhfirms.com');
    let e34FifthStatus = 0;
    for (let i = 0; i < 5; i++) {
      const r = await httpReq('POST', '/app/api/auth/verify-override', { email: 'fleet.lions@bhfirms.com', pin: '9999', company: 'WTC', field_id: 'f_price' }, { 'X-ISABI-Session': entryToken, 'CF-Connecting-IP': '198.51.100.219' });
      e34FifthStatus = r.status;
    }
    const e34LockedValid = await httpReq('POST', '/app/api/auth/verify-override', { email: 'fleet.lions@bhfirms.com', pin: '7777', company: 'WTC', field_id: 'f_price' }, { 'X-ISABI-Session': entryToken, 'CF-Connecting-IP': '198.51.100.219' });

    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/app/?demo=1&autologin=1` });
    let e34DemoDom = null;
    for (let i = 0; i < 60; i++) {
      e34DemoDom = await evalJs(`(() => {
        const b = document.getElementById('topbarDemoBadge');
        const rn = document.getElementById('railUserName');
        const gate = document.getElementById('authGate');
        if (!b || !rn || !gate || !gate.hidden) return null;
        return {
          badgeHidden: Boolean(b.hidden),
          badgeText: String(b.textContent || '').trim(),
          railUser: String(rn.textContent || '').trim(),
          topbarTitle: String((document.getElementById('topbarTitle') || {}).textContent || '').trim()
        };
      })()`).catch(() => null);
      if (e34DemoDom) break;
      await sleep(250);
    }

    if (
      e34LeakedBhfirms.length === 0 &&
      e34LeakedPin2401.length === 0 &&
      e34OvAnon.status === 401 &&
      e34OvDemo.status === 403 &&
      e34OvSelfEntry.status === 403 &&
      e34OvCrossBu.status === 403 &&
      e34Ov2401.status === 401 &&
      e34OvOk.status === 200 &&
      e34OvOk.json?.ok === true &&
      e34AuditEntryDenied.status === 403 &&
      e34HasAuditRow &&
      e34FifthStatus === 429 &&
      e34LockedValid.status === 429 &&
      Boolean(e34DemoDom) &&
      e34DemoDom.badgeHidden === false &&
      e34DemoDom.badgeText === 'Demo Workspace' &&
      !/Hussein Bdeir/i.test(e34DemoDom.railUser)
    ) {
      pass(
        'edge-34-phase1-override-rls-audit-lockout-pii-scrub-and-demo-badge',
        `0 @bhfirms.com & 0 PIN 2401 in /app/js | D1 verify-override 401/403/200(audit=${e34OvOk.json.audit_id})/429 | Demo badge="${e34DemoDom.badgeText}" persona="${e34DemoDom.railUser}"`
      );
    } else {
      fail('edge-34-phase1-override-rls-audit-lockout-pii-scrub-and-demo-badge', JSON.stringify({
        leakedBhfirms: e34LeakedBhfirms,
        leakedPin2401: e34LeakedPin2401,
        anon: e34OvAnon.status,
        demo: e34OvDemo.status,
        entry: e34OvSelfEntry.status,
        crossBu: e34OvCrossBu.status,
        p2401: e34Ov2401.status,
        ok: [e34OvOk.status, e34OvOk.json],
        auditEntry: e34AuditEntryDenied.status,
        hasAuditRow: e34HasAuditRow,
        fifth: e34FifthStatus,
        lockedValid: e34LockedValid.status,
        demoDom: e34DemoDom
      }));
    }

    // 35. Red-Team Upgrade, Concurrent CAS Sync Race, Multi-IP DoS Resistance & Cold-Reload Cookie Resume
    const pyHashesStdout = execFileSync('python', [
      '-c',
      [
        'import sys, json, hashlib',
        'sys.path.insert(0, "build")',
        'import export_d1_seed as eds, deploy_cloudflare as dc',
        'h_seed = eds._hash_seed_pin("5739", "u-edge34-seed", "edge34seed@bhfirms.com")',
        'h_rand = dc._hash_random_pbkdf2("8426")',
        'salt_hex = b"0123456789abcdef".hex()',
        'dk_hex = hashlib.pbkdf2_hmac("sha256", b"6183", bytes.fromhex(salt_hex), 100000, dklen=32).hex()',
        'h_hex_legacy = f"pbkdf2$sha256$100000${salt_hex}${dk_hex}"',
        'print(json.dumps({"seed": h_seed, "rand": h_rand, "hex": h_hex_legacy}))'
      ].join('; ')
    ], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
    const pyHashes = JSON.parse((pyHashesStdout || '{}').trim() || '{}');

    await httpReq('POST', '/app/api/users', {
      user: { id: 'u-edge34-seed', email: 'edge34seed@bhfirms.com', full_name: 'Edge34 Seed Hash', role: 'Entry', companies: 'WTC', auth_mode: 'pin_only', pin_code: pyHashes.seed, status: 'Active' }
    }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/users', {
      user: { id: 'u-edge34-rand', email: 'edge34rand@bhfirms.com', full_name: 'Edge34 Deploy Hash', role: 'Entry', companies: 'WTC', auth_mode: 'pin_only', pin_code: pyHashes.rand, status: 'Active' }
    }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/users', {
      user: { id: 'u-edge34-hex', email: 'edge34hex@bhfirms.com', full_name: 'Edge34 Legacy Hex', role: 'Entry', companies: 'WTC', auth_mode: 'pin_only', pin_code: pyHashes.hex, status: 'Active' }
    }, { 'X-ISABI-Session': ownerToken });

    const e34LoginSeed = await httpReq('POST', '/app/api/auth/login', {
      email: 'edge34seed@bhfirms.com', pin: '5739', method: 'PIN'
    }, { 'CF-Connecting-IP': '198.51.100.181' });
    const e34LoginRand = await httpReq('POST', '/app/api/auth/login', {
      email: 'edge34rand@bhfirms.com', pin: '8426', method: 'PIN'
    }, { 'CF-Connecting-IP': '198.51.100.182' });
    const e34LoginHex1 = await httpReq('POST', '/app/api/auth/login', {
      email: 'edge34hex@bhfirms.com', pin: '6183', method: 'PIN'
    }, { 'CF-Connecting-IP': '198.51.100.183' });
    const e34LoginHex2 = await httpReq('POST', '/app/api/auth/login', {
      email: 'edge34hex@bhfirms.com', pin: '6183', method: 'PIN'
    }, { 'CF-Connecting-IP': '198.51.100.184' });

    // Concurrent `Promise.all` sync patches sharing the exact same `ifMatchUpdatedAt`
    const curSync34 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const baseDoc34 = curSync34.json?.docs?.mfg_web_store || {};
    const sharedIfMatch34 = String(baseDoc34.updatedAt || '');
    const doc34A = JSON.parse(JSON.stringify(baseDoc34));
    const doc34B = JSON.parse(JSON.stringify(baseDoc34));
    const ts34A = new Date(Date.now() + 90000).toISOString();
    const ts34B = new Date(Date.now() + 91000).toISOString();
    doc34A.updatedAt = ts34A;
    doc34B.updatedAt = ts34B;
    doc34A.minShellVer = MIN_SYNC_SHELL_VER;
    doc34B.minShellVer = MIN_SYNC_SHELL_VER;
    doc34A.customRecords = Object.assign({}, doc34A.customRecords || {}, {
      expenses: [{ id: 'exp-cas-race-34-A', company: 'WTC', date: '2026-11-11', code: 'CAS-A', name: 'CAS Winner A', amount: 111, rev: 1, updated_at: ts34A }, ...(doc34A.customRecords?.expenses || [])]
    });
    doc34B.customRecords = Object.assign({}, doc34B.customRecords || {}, {
      expenses: [{ id: 'exp-cas-race-34-B', company: 'WTC', date: '2026-11-11', code: 'CAS-B', name: 'CAS Winner B', amount: 222, rev: 1, updated_at: ts34B }, ...(doc34B.customRecords?.expenses || [])]
    });

    const [raceResA, raceResB] = await Promise.all([
      httpReq('POST', '/app/api/sync', { op: 'patch', doc: 'mfg_web_store', ifMatchUpdatedAt: sharedIfMatch34, awaitMirror: true, patch: { mfg_web_store: doc34A } }, { 'X-ISABI-Session': ownerToken }),
      httpReq('POST', '/app/api/sync', { op: 'patch', doc: 'mfg_web_store', ifMatchUpdatedAt: sharedIfMatch34, awaitMirror: true, patch: { mfg_web_store: doc34B } }, { 'X-ISABI-Session': ownerToken })
    ]);
    const aWon = raceResA.status === 200 && !raceResA.json?.conflict;
    const bWon = raceResB.status === 200 && !raceResB.json?.conflict;
    const aConflict = raceResA.status === 200 && raceResA.json?.conflict === true;
    const bConflict = raceResB.status === 200 && raceResB.json?.conflict === true;
    const exactlyOneCasWinner = (aWon && bConflict) || (bWon && aConflict);
    const expTable34 = await httpReq('GET', '/app/api/records?table=expenses&limit=500', null, { 'X-ISABI-Session': ownerToken });
    const expRows34 = expTable34.json?.rows || [];
    const hasRowA = expRows34.some(r => r && r.id === 'exp-cas-race-34-A');
    const hasRowB = expRows34.some(r => r && r.id === 'exp-cas-race-34-B');
    const zeroCasLoserLeak = (aWon && hasRowA && !hasRowB) || (bWon && hasRowB && !hasRowA);

    // Multi-IP global lockout DoS resistance: 16 bad PINs across 4 distinct source IPs must NOT lock out a 5th legitimate IP
    for (const attackerIp of ['198.51.100.201', '198.51.100.202', '198.51.100.203', '198.51.100.204']) {
      for (let k = 0; k < 4; k++) {
        await httpReq('POST', '/app/api/auth/login', {
          email: 'husseinbdeir@bhfirms.com', pin: '0000', method: 'PIN'
        }, { 'CF-Connecting-IP': attackerIp });
      }
    }
    const legitOwnerAfterSpray = await httpReq('POST', '/app/api/auth/login', {
      email: 'husseinbdeir@bhfirms.com', pin: '1111', method: 'PIN'
    }, { 'CF-Connecting-IP': '198.51.100.205' });

    // Cold-reload HttpOnly cookie resume on `/app/` (zero localStorage JWT, zero sessionStorage sw_resume)
    const remoteScript35 = await sendCdp('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        window.__ISABI_SIMULATE_REMOTE_HOST = true;
        window.__ISABI_TEST_EDGE = true;
        window.ISABI_HAS_EDGE_API = true;
        try {
          localStorage.removeItem('isabi_mfg_edge_sess_tok_v1');
          sessionStorage.removeItem('isabi_mfg_sw_resume');
        } catch (_) {}
      `
    });
    await sendCdp('Network.clearBrowserCookies');
    await sendCdp('Network.setCookie', {
      name: 'isabi_edge_sess',
      value: ownerToken,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true
    });
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/app/` });
    let e34ReloadResume = { authed: false, gateHidden: false, recordsReady: false, lsTok: '' };
    for (let w = 0; w < 50; w++) {
      e34ReloadResume = await evalJs(`({
        authed: Boolean(window.MFG_FACE_TEST && window.MFG_FACE_TEST.state().authed),
        gateHidden: Boolean(document.getElementById('authGate')?.hidden),
        recordsReady: Boolean(window.MFG_SEED && window.MFG_SEED._recordsReady),
        lsTok: localStorage.getItem('isabi_mfg_edge_sess_tok_v1') || ''
      })`).catch(() => e34ReloadResume);
      if (e34ReloadResume.authed && e34ReloadResume.gateHidden && e34ReloadResume.recordsReady) break;
      await sleep(200);
    }
    if (remoteScript35 && remoteScript35.identifier) {
      await sendCdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: remoteScript35.identifier }).catch(() => {});
    }

    // Multi-IP callerLockKey D1 lockout persistence on `/app/api/auth/verify-override`
    const seedEntryTok = String(e34LoginSeed.json?.token || '');
    let ovFifthStatus = 0;
    for (let k = 1; k <= 5; k++) {
      const ovBad = await httpReq('POST', '/app/api/auth/verify-override', {
        email: 'husseinbdeir@bhfirms.com',
        pin: '0000',
        company: 'WTC',
        form_key: 'sales',
        field_id: 'f_unitprice'
      }, { 'X-ISABI-Session': seedEntryTok, 'CF-Connecting-IP': `198.51.100.${210 + k}` });
      if (k === 5) ovFifthStatus = ovBad.status;
    }
    const ovSixthValidBlocked = await httpReq('POST', '/app/api/auth/verify-override', {
      email: 'husseinbdeir@bhfirms.com',
      pin: '1111',
      company: 'WTC',
      form_key: 'sales',
      field_id: 'f_unitprice'
    }, { 'X-ISABI-Session': seedEntryTok, 'CF-Connecting-IP': '198.51.100.216' });

    if (
      e34LoginSeed.status === 200 &&
      Boolean(e34LoginSeed.headers['set-cookie']) &&
      e34LoginRand.status === 200 &&
      Boolean(e34LoginRand.headers['set-cookie']) &&
      e34LoginHex1.status === 200 &&
      e34LoginHex2.status === 200 &&
      exactlyOneCasWinner &&
      zeroCasLoserLeak &&
      legitOwnerAfterSpray.status === 200 &&
      ovFifthStatus === 429 &&
      ovSixthValidBlocked.status === 429 &&
      e34ReloadResume.authed &&
      e34ReloadResume.gateHidden &&
      e34ReloadResume.recordsReady &&
      e34ReloadResume.lsTok === ''
    ) {
      pass(
        'edge-35-redteam-pbkdf2-seam-cas-race-dos-and-cookie-resume',
        'Python Base64URL + legacy-hex PBKDF2 login=200 + Promise.all CAS race=0 loser leak + 4-IP spray=0 legit DoS + callerLockKey D1 429 + cold reload HttpOnly cookie resume OK'
      );
    } else {
      fail('edge-35-redteam-pbkdf2-seam-cas-race-dos-and-cookie-resume', JSON.stringify({
        logins: [e34LoginSeed.status, e34LoginRand.status, e34LoginHex1.status, e34LoginHex2.status],
        casRace: { aStatus: raceResA.status, bStatus: raceResB.status, aWon, bWon, aConflict, bConflict, hasRowA, hasRowB },
        legitAfterSpray: legitOwnerAfterSpray.status,
        ovLock: [ovFifthStatus, ovSixthValidBlocked.status],
        reloadResume: e34ReloadResume
      }));
    }

    // 36. Red-Team Phase 1 Negative & Boundary Suite: Self-Only Entry /app/api/users, Strict Edge CORS (incl. /app/api/kiosk/verify), Cross-Company Modal Unlock Reset, Custom Unlock Keys & Override Lockout/Oracle Isolation
    const e36UsersAnon = await httpReq('GET', '/app/api/users');
    const e36UsersDemo = await httpReq('GET', '/app/api/users', null, { 'X-ISABI-Session': entryToken, 'X-ISABI-Demo': '1' });
    const e36UsersEntry = await httpReq('GET', '/app/api/users', null, { 'X-ISABI-Session': entryToken });
    const e36UsersOwner = await httpReq('GET', '/app/api/users', null, { 'X-ISABI-Session': ownerToken });
    const e36EntrySelfOnly = Array.isArray(e36UsersEntry.json?.users) &&
      e36UsersEntry.json.users.length === 1 &&
      String(e36UsersEntry.json.users[0]?.email || '').toLowerCase() === ENTRY_TEST_EMAIL.toLowerCase() &&
      e36UsersEntry.json.users[0]?.pin_code === undefined &&
      e36UsersEntry.json.users[0]?.face_samples === undefined;
    const e36OwnerRedacted = Array.isArray(e36UsersOwner.json?.users) &&
      e36UsersOwner.json.users.length >= 10 &&
      e36UsersOwner.json.users.every(u => u && u.pin_code === undefined && u.face_samples === undefined);
    const e36EntryTakeoverU1 = await httpReq('POST', '/app/api/users', {
      user: { id: 'u1', email: ENTRY_TEST_EMAIL, full_name: 'Entry Takeover', role: 'Full Access (Owner)', companies: '*' }
    }, { 'X-ISABI-Session': entryToken });

    // Strict CORS on OPTIONS across /app/api/ask, /app/api/kiosk/verify, and /api/status
    const e36OptAskEvil = await httpReq('OPTIONS', '/app/api/ask', null, { Origin: 'https://evil.example' });
    const e36OptKioskEvil = await httpReq('OPTIONS', '/app/api/kiosk/verify', null, { Origin: 'https://evil.example' });
    const e36OptStatusEvil = await httpReq('OPTIONS', '/api/status', null, { Origin: 'https://evil.example' });
    const e36OptKioskGh = await httpReq('OPTIONS', '/app/api/kiosk/verify', null, { Origin: 'https://husseinbdeir.github.io' });
    const e36OptUsersGh = await httpReq('OPTIONS', '/app/api/users', null, { Origin: 'https://husseinbdeir.github.io' });
    const e36OptKioskPos = await httpReq('OPTIONS', '/app/api/kiosk/verify', null, { Origin: 'https://pos.isabisystems.com' });
    const e36OptUsersPos = await httpReq('OPTIONS', '/app/api/users', null, { Origin: 'https://pos.isabisystems.com' });
    const e36OptKioskAtt = await httpReq('OPTIONS', '/app/api/kiosk/verify', null, { Origin: 'https://attendance.isabisystems.com' });
    const e36OptUsersAtt = await httpReq('OPTIONS', '/app/api/users', null, { Origin: 'https://attendance.isabisystems.com' });
    const e36OptRootKioskPos = await httpReq('OPTIONS', '/api/kiosk/verify', null, { Origin: 'https://pos.isabisystems.com' });
    const e36OptKioskPrefixEvil = await httpReq('OPTIONS', '/app/api/kiosk-evil', null, { Origin: 'https://pos.isabisystems.com' });
    const e36OptKioskHttpPos = await httpReq('OPTIONS', '/app/api/kiosk/verify', null, { Origin: 'http://pos.isabisystems.com' });
    const e36OptKioskSpoofPos = await httpReq('OPTIONS', '/app/api/kiosk/verify', null, { Origin: 'https://pos.isabisystems.com.evil.example' });
    const e36PostKioskPos = await httpReq('POST', '/app/api/kiosk/verify', { op: 'list_station_keys' }, {
      Origin: 'https://pos.isabisystems.com',
      Cookie: `isabi_edge_sess=${encodeURIComponent(ownerToken)}`
    });
    const e36PostKioskAtt = await httpReq('POST', '/app/api/kiosk/verify', { op: 'list_station_keys' }, {
      Origin: 'https://attendance.isabisystems.com',
      Cookie: `isabi_edge_sess=${encodeURIComponent(ownerToken)}`
    });
    const e36PostAskPosDemo = await httpReq('POST', '/api/ask', { question: 'hello' }, {
      Origin: 'https://pos.isabisystems.com',
      'X-ISABI-Demo': '1'
    });
    const e36CorsStrictOk =
      e36OptAskEvil.status === 204 && !e36OptAskEvil.headers['access-control-allow-origin'] &&
      e36OptKioskEvil.status === 204 && !e36OptKioskEvil.headers['access-control-allow-origin'] &&
      e36OptStatusEvil.status === 204 && !e36OptStatusEvil.headers['access-control-allow-origin'] &&
      e36OptKioskGh.status === 204 && e36OptKioskGh.headers['access-control-allow-origin'] === 'https://husseinbdeir.github.io' &&
      e36OptUsersGh.status === 204 && !e36OptUsersGh.headers['access-control-allow-origin'] &&
      e36OptKioskPos.status === 204 && e36OptKioskPos.headers['access-control-allow-origin'] === 'https://pos.isabisystems.com' &&
      e36OptUsersPos.status === 204 && !e36OptUsersPos.headers['access-control-allow-origin'] &&
      e36OptKioskAtt.status === 204 && e36OptKioskAtt.headers['access-control-allow-origin'] === 'https://attendance.isabisystems.com' &&
      e36OptUsersAtt.status === 204 && !e36OptUsersAtt.headers['access-control-allow-origin'] &&
      e36OptRootKioskPos.status === 204 && e36OptRootKioskPos.headers['access-control-allow-origin'] === 'https://pos.isabisystems.com' &&
      e36OptKioskPrefixEvil.status === 204 && !e36OptKioskPrefixEvil.headers['access-control-allow-origin'] &&
      e36OptKioskHttpPos.status === 204 && !e36OptKioskHttpPos.headers['access-control-allow-origin'] &&
      e36OptKioskSpoofPos.status === 204 && !e36OptKioskSpoofPos.headers['access-control-allow-origin'] &&
      e36PostKioskPos.status === 401 && e36PostKioskPos.headers['access-control-allow-origin'] === 'https://pos.isabisystems.com' && /Origin/i.test(String(e36PostKioskPos.headers['vary'] || '')) &&
      e36PostKioskAtt.status === 401 && e36PostKioskAtt.headers['access-control-allow-origin'] === 'https://attendance.isabisystems.com' && /Origin/i.test(String(e36PostKioskAtt.headers['vary'] || '')) &&
      e36PostAskPosDemo.status === 403 && !e36PostAskPosDemo.headers['access-control-allow-origin'];

    // Seed multi-BU clerk + Custom unlock seat for override boundary checks
    await httpReq('POST', '/app/api/users', {
      user: { id: 'u-edge36-clerk', email: 'edge36clerk@bhfirms.com', full_name: 'Edge36 Clerk', role: 'Entry', companies: 'WTC, BBConstruction', auth_mode: 'pin_only', pin_code: '5839', status: 'Active' }
    }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/users', {
      user: {
        id: 'u-edge36-custom',
        email: 'edge36custom@bhfirms.com',
        full_name: 'Edge36 Custom Authorizer',
        role: 'Custom',
        companies: 'WTC',
        auth_mode: 'pin_only',
        pin_code: '4927',
        custom_perms: { unlocksCustomized: true, unlocks: { unlock_uom: true, unlock_formula_totals: true, unlock_unit_price: false } },
        status: 'Active'
      }
    }, { 'X-ISABI-Session': ownerToken });
    const e36ClerkLogin = await httpReq('POST', '/app/api/auth/login', {
      email: 'edge36clerk@bhfirms.com', pin: '5839', method: 'PIN'
    }, { 'CF-Connecting-IP': '198.51.100.240' });
    const e36ClerkTok = String(e36ClerkLogin.json?.token || '');

    // Custom unlock keys f_malf_uom & f_amount -> 200, while ungranted f_unitprice -> 403
    const e36CustomMalfUom = await httpReq('POST', '/app/api/auth/verify-override', {
      email: 'edge36custom@bhfirms.com', pin: '4927', company: 'WTC', form_key: 'malfunction', field_id: 'f_malf_uom'
    }, { 'X-ISABI-Session': e36ClerkTok, 'CF-Connecting-IP': '198.51.100.241' });
    const e36CustomAmount = await httpReq('POST', '/app/api/auth/verify-override', {
      email: 'edge36custom@bhfirms.com', pin: '4927', company: 'WTC', form_key: 'receipt', field_id: 'f_amount'
    }, { 'X-ISABI-Session': e36ClerkTok, 'CF-Connecting-IP': '198.51.100.241' });
    const e36CustomPriceDenied = await httpReq('POST', '/app/api/auth/verify-override', {
      email: 'edge36custom@bhfirms.com', pin: '4927', company: 'WTC', form_key: 'sales', field_id: 'f_unitprice'
    }, { 'X-ISABI-Session': e36ClerkTok, 'CF-Connecting-IP': '198.51.100.242' });

    // Reset clerk counter with a valid WTC override, then verify cross-BU wrong PIN ('0000') returns 403 (not 401 -> 0 PIN oracle)
    await httpReq('POST', '/app/api/auth/verify-override', {
      email: 'fleet.lions@bhfirms.com', pin: '7777', company: 'WTC', form_key: 'sales', field_id: 'f_unitprice'
    }, { 'X-ISABI-Session': e36ClerkTok, 'CF-Connecting-IP': '198.51.100.242' });
    const e36CrossBuWrongPin = await httpReq('POST', '/app/api/auth/verify-override', {
      email: 'site.bbc@bhfirms.com', pin: '0000', company: 'WTC', form_key: 'sales', field_id: 'f_unitprice'
    }, { 'X-ISABI-Session': e36ClerkTok, 'CF-Connecting-IP': '198.51.100.243' });
    // Clear clerk counter again before DOM cross-company modal check
    await httpReq('POST', '/app/api/auth/verify-override', {
      email: 'fleet.lions@bhfirms.com', pin: '7777', company: 'WTC', form_key: 'sales', field_id: 'f_unitprice'
    }, { 'X-ISABI-Session': e36ClerkTok, 'CF-Connecting-IP': '198.51.100.243' });

    // Cross-company #f_company switch inside #entryModal must wipe Supervisor override & re-lock f_unitprice
    const remoteScript36 = await sendCdp('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        window.__ISABI_SIMULATE_REMOTE_HOST = true;
        window.__ISABI_TEST_EDGE = true;
        window.ISABI_HAS_EDGE_API = true;
        try {
          localStorage.removeItem('isabi_mfg_users_v2');
          localStorage.removeItem('isabi_mfg_current_user_v2');
          localStorage.removeItem('isabi_mfg_edge_sess_tok_v1');
          sessionStorage.removeItem('isabi_mfg_sw_resume');
        } catch (_) {}
      `
    });
    await sendCdp('Network.clearBrowserCookies');
    await sendCdp('Network.setCookie', {
      name: 'isabi_edge_sess',
      value: e36ClerkTok,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true
    });
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/app/` });
    for (let w = 0; w < 50; w++) {
      const ready = await evalJs(`Boolean(window.MFG_FACE_TEST && window.MFG_FACE_TEST.state().authed && window.MFG_SEED && window.MFG_SEED._recordsReady)`).catch(() => false);
      if (ready) break;
      await sleep(200);
    }
    const e36ModalCrossCo = await evalJs(`(async () => {
      const addBtn = document.getElementById('newEntryBtn') || document.getElementById('mobileNewEntryBtn') || document.querySelector('[data-open-entry]');
      if (addBtn) addBtn.click();
      await new Promise(r => setTimeout(r, 120));
      const salesGroup = document.querySelector('[data-pa-group="sales"]');
      if (salesGroup) salesGroup.click();
      const salesTab = document.querySelector('.modal-tab[data-form="sales"]');
      if (salesTab) salesTab.click();
      await new Promise(r => setTimeout(r, 120));
      const coEl = document.getElementById('f_company');
      if (!coEl) return { err: 'no f_company', activeRole: String((window.MFG_FACE_TEST?.state()?.currentUser || '')) };
      coEl.value = 'BBConstruction';
      coEl.dispatchEvent(new Event('input', { bubbles: true }));
      coEl.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 120));
      const pill = document.querySelector('[data-lock-pill="f_unitprice"]');
      if (pill) pill.click();
      await new Promise(r => setTimeout(r, 80));
      const emInp = document.getElementById('paAdminEmailInput');
      const pinInp = document.getElementById('paAdminPinInput');
      const btnAll = document.getElementById('paConfirmAllUnlockBtn');
      if (!emInp || !pinInp || !btnAll) {
        return {
          err: 'missing unlock prompt inputs',
          boxHtml: String(document.getElementById('paAdminUnlockBox')?.innerHTML || '').slice(0, 220),
          pillExists: Boolean(pill)
        };
      }
      emInp.value = 'site.bbc@bhfirms.com';
      pinInp.value = '6666';
      btnAll.click();
      for (let i = 0; i < 30; i++) {
        const pEl = document.getElementById('f_unitprice');
        if (pEl && !pEl.readOnly && pEl.dataset.policyLockedNow !== '1') break;
        await new Promise(r => setTimeout(r, 100));
      }
      const pAfterBbcUnlock = document.getElementById('f_unitprice');
      const dEl = document.getElementById('f_date');
      const nEl = document.getElementById('f_notes');
      const unlockedOnBbc = Boolean(pAfterBbcUnlock && !pAfterBbcUnlock.readOnly && dEl && !dEl.readOnly);
      if (dEl) {
        dEl.value = '2026-09-01';
        dEl.dispatchEvent(new Event('input', { bubbles: true }));
        dEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const bbcStampPresent = /\\[Supervisor Override by/i.test(String(nEl?.value || ''));
      coEl.value = 'WTC';
      coEl.dispatchEvent(new Event('input', { bubbles: true }));
      coEl.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 150));
      const pAfterWtcSwitch = document.getElementById('f_unitprice');
      const dAfterWtcSwitch = document.getElementById('f_date');
      const nAfterWtcSwitch = document.getElementById('f_notes');
      const relockedOnWtc = Boolean(
        pAfterWtcSwitch && (pAfterWtcSwitch.readOnly || pAfterWtcSwitch.dataset.policyLockedNow === '1') &&
        dAfterWtcSwitch && dAfterWtcSwitch.readOnly && dAfterWtcSwitch.value !== '2026-09-01' &&
        !/\\[Supervisor Override by/i.test(String(nAfterWtcSwitch?.value || ''))
      );
      return {
        unlockedOnBbc,
        bbcStampPresent,
        relockedOnWtc,
        dateAfterWtc: dAfterWtcSwitch?.value || '',
        notesAfterWtc: nAfterWtcSwitch?.value || ''
      };
    })()`);
    if (remoteScript36 && remoteScript36.identifier) {
      await sendCdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: remoteScript36.identifier }).catch(() => {});
    }

    // Shared-NAT Login DoS isolation: 5 bad overrides on IP 198.51.100.244 lock override (429) WITHOUT 429-blocking login on same IP
    let e36SharedNatOv5 = 0;
    for (let k = 1; k <= 5; k++) {
      const r = await httpReq('POST', '/app/api/auth/verify-override', {
        email: 'fleet.lions@bhfirms.com', pin: '0000', company: 'WTC', form_key: 'sales', field_id: 'f_unitprice'
      }, { 'X-ISABI-Session': e36ClerkTok, 'CF-Connecting-IP': '198.51.100.244' });
      e36SharedNatOv5 = r.status;
    }
    const e36SharedNatLoginOk = await httpReq('POST', '/app/api/auth/login', {
      email: 'husseinbdeir@bhfirms.com', pin: '1111', method: 'PIN'
    }, { 'CF-Connecting-IP': '198.51.100.244' });

    if (
      e36UsersAnon.status === 401 &&
      e36UsersDemo.status === 401 &&
      e36UsersEntry.status === 200 &&
      e36EntrySelfOnly &&
      e36OwnerRedacted &&
      e36EntryTakeoverU1.status === 403 &&
      e36CorsStrictOk &&
      e36CustomMalfUom.status === 200 &&
      e36CustomAmount.status === 200 &&
      e36CustomPriceDenied.status === 403 &&
      e36CrossBuWrongPin.status === 403 &&
      e36ModalCrossCo &&
      e36ModalCrossCo.unlockedOnBbc === true &&
      e36ModalCrossCo.bbcStampPresent === true &&
      e36ModalCrossCo.relockedOnWtc === true &&
      e36SharedNatOv5 === 429 &&
      e36SharedNatLoginOk.status === 200
    ) {
      pass(
        'edge-36-phase1-redteam-users-rls-cors-cross-co-relock-and-ov-isolation',
        'Entry /app/api/users=1 self-only + evil OPTIONS ACAO=none (kiosk+ask+status) + BBC->WTC modal switch relocks f_unitprice + cross-BU wrong PIN=403 + shared-NAT login=200 after ov-429'
      );
    } else {
      fail('edge-36-phase1-redteam-users-rls-cors-cross-co-relock-and-ov-isolation', JSON.stringify({
        users: [e36UsersAnon.status, e36UsersDemo.status, e36UsersEntry.status, e36EntrySelfOnly, e36OwnerRedacted, e36EntryTakeoverU1.status],
        cors: {
          askEvil: [e36OptAskEvil.status, e36OptAskEvil.headers['access-control-allow-origin']],
          kioskEvil: [e36OptKioskEvil.status, e36OptKioskEvil.headers['access-control-allow-origin']],
          statusEvil: [e36OptStatusEvil.status, e36OptStatusEvil.headers['access-control-allow-origin']],
          kioskGh: [e36OptKioskGh.status, e36OptKioskGh.headers['access-control-allow-origin']],
          usersGh: [e36OptUsersGh.status, e36OptUsersGh.headers['access-control-allow-origin']],
          kioskPos: [e36OptKioskPos.status, e36OptKioskPos.headers['access-control-allow-origin']],
          usersPos: [e36OptUsersPos.status, e36OptUsersPos.headers['access-control-allow-origin']],
          kioskAtt: [e36OptKioskAtt.status, e36OptKioskAtt.headers['access-control-allow-origin']],
          usersAtt: [e36OptUsersAtt.status, e36OptUsersAtt.headers['access-control-allow-origin']],
          rootKioskPos: [e36OptRootKioskPos.status, e36OptRootKioskPos.headers['access-control-allow-origin']],
          prefixEvil: [e36OptKioskPrefixEvil.status, e36OptKioskPrefixEvil.headers['access-control-allow-origin']],
          httpPos: [e36OptKioskHttpPos.status, e36OptKioskHttpPos.headers['access-control-allow-origin']],
          spoofPos: [e36OptKioskSpoofPos.status, e36OptKioskSpoofPos.headers['access-control-allow-origin']],
          postKioskPos: [e36PostKioskPos.status, e36PostKioskPos.headers['access-control-allow-origin'], e36PostKioskPos.headers['vary']],
          postKioskAtt: [e36PostKioskAtt.status, e36PostKioskAtt.headers['access-control-allow-origin'], e36PostKioskAtt.headers['vary']],
          postAskPosDemo: [e36PostAskPosDemo.status, e36PostAskPosDemo.headers['access-control-allow-origin']]
        },
        customKeys: [e36CustomMalfUom.status, e36CustomAmount.status, e36CustomPriceDenied.status],
        crossBuWrongPin: e36CrossBuWrongPin.status,
        modalCrossCo: e36ModalCrossCo,
        sharedNat: [e36SharedNatOv5, e36SharedNatLoginOk.status]
      }));
    }

    // =========================================================================
    // 37. Universal Security Headers across JSON, OPTIONS, Kiosk, Seed, Blobs & 404 Middleware
    // =========================================================================
    function hasUniversalSecHeaders(hdrs) {
      if (!hdrs) return false;
      const hsts = String(hdrs['strict-transport-security'] || '');
      const xfo = String(hdrs['x-frame-options'] || '').toUpperCase();
      const xcto = String(hdrs['x-content-type-options'] || '').toLowerCase();
      const refp = String(hdrs['referrer-policy'] || '').toLowerCase();
      const edge = String(hdrs['x-isabi-edge'] || '');
      return (
        hsts.includes('max-age=31536000') &&
        hsts.includes('includeSubDomains') &&
        (xfo === 'DENY' || xfo === 'SAMEORIGIN') &&
        xcto === 'nosniff' &&
        refp.includes('origin') &&
        edge === '1'
      );
    }
    const e37Status = await httpReq('GET', '/app/api/status');
    const e37OptStatus = await httpReq('OPTIONS', '/app/api/status');
    const e37OptKiosk = await httpReq('OPTIONS', '/app/api/kiosk/verify');
    const e37KioskPost = await httpReq('POST', '/app/api/kiosk/verify', {});
    const e37SeedAnon = await httpReq('GET', '/app/api/seed/core');
    const e37SeedAuth = await httpReq('GET', '/app/api/seed/core', null, { 'X-ISABI-Session': ownerToken });
    const e37BlobsRaw = await httpReq('GET', '/app/api/blobs?raw=1&id=nonexistent', null, { 'X-ISABI-Session': ownerToken });
    const e37BlockedWrangler = await httpReq('GET', '/wrangler.toml');
    const e37BlockedSeedJson = await httpReq('GET', '/app/js/seed_core.json');
    const e37ResetPage = await httpReq('GET', '/app/reset');
    if (
      e37Status.status === 200 && hasUniversalSecHeaders(e37Status.headers) &&
      e37OptStatus.status === 204 && hasUniversalSecHeaders(e37OptStatus.headers) &&
      e37OptKiosk.status === 204 && hasUniversalSecHeaders(e37OptKiosk.headers) &&
      hasUniversalSecHeaders(e37KioskPost.headers) &&
      e37SeedAnon.status === 401 && hasUniversalSecHeaders(e37SeedAnon.headers) &&
      (e37SeedAuth.status === 200 || e37SeedAuth.status === 404) && hasUniversalSecHeaders(e37SeedAuth.headers) &&
      hasUniversalSecHeaders(e37BlobsRaw.headers) &&
      e37BlockedWrangler.status === 404 && hasUniversalSecHeaders(e37BlockedWrangler.headers) &&
      e37BlockedSeedJson.status === 404 && hasUniversalSecHeaders(e37BlockedSeedJson.headers) &&
      e37ResetPage.status === 200 && hasUniversalSecHeaders(e37ResetPage.headers)
    ) {
      pass(
        'edge-37-universal-security-headers',
        'HSTS + X-Frame-Options: DENY + nosniff + Referrer-Policy + X-ISABI-Edge: 1 across JSON, 204 OPTIONS, kiosk, seed, blobs?raw=1, /reset & 404 middleware'
      );
    } else {
      fail('edge-37-universal-security-headers', JSON.stringify({
        status: [e37Status.status, hasUniversalSecHeaders(e37Status.headers)],
        optStatus: [e37OptStatus.status, hasUniversalSecHeaders(e37OptStatus.headers)],
        optKiosk: [e37OptKiosk.status, hasUniversalSecHeaders(e37OptKiosk.headers)],
        kioskPost: [e37KioskPost.status, hasUniversalSecHeaders(e37KioskPost.headers)],
        seedAnon: [e37SeedAnon.status, hasUniversalSecHeaders(e37SeedAnon.headers)],
        seedAuth: [e37SeedAuth.status, hasUniversalSecHeaders(e37SeedAuth.headers)],
        blobsRaw: [e37BlobsRaw.status, hasUniversalSecHeaders(e37BlobsRaw.headers)],
        wrangler: [e37BlockedWrangler.status, hasUniversalSecHeaders(e37BlockedWrangler.headers)],
        seedJson: [e37BlockedSeedJson.status, hasUniversalSecHeaders(e37BlockedSeedJson.headers)],
        resetPage: [e37ResetPage.status, hasUniversalSecHeaders(e37ResetPage.headers)]
      }));
    }

    // =========================================================================
    // 38. SEO & Crawl Hygiene: Legacy /isabi/* & Host 301s, Open-Redirect Guard, 404 + Preview noindex & IndexNow Key
    // =========================================================================
    const e38IndexNow = await httpReq('GET', '/c4b9e2a7d18f406395e1a82c7d3f6b90.txt');
    const e38LegacyRoot = await httpReq('GET', '/isabi');
    const e38LegacySub = await httpReq('GET', '/isabi/pricing?ref=legacy');
    const e38LegacyApp = await httpReq('GET', '/isabi/app');
    const e38LegacyAppDeep = await httpReq('GET', '/isabi/app/tickets?bu=WTC');
    const e38OpenRedir1 = await httpReq('GET', '/isabi//evil.example/phish');
    const e38OpenRedir2 = await httpReq('GET', '/isabi/app//evil.example/phish');
    const e38PagesHost = await httpReq('GET', '/?utm_source=test', null, { Host: 'isabi-systems.pages.dev' });
    const e38WwwHost = await httpReq('GET', '/?utm_source=www', null, { Host: 'www.isabisystems.com' });
    const e38PagesSw = await httpReq('GET', '/sw.js', null, { Host: 'isabi-systems.pages.dev' });
    const e38PagesAppSw = await httpReq('GET', '/app/sw.js', null, { Host: 'isabi-systems.pages.dev' });
    const e38WwwSw = await httpReq('GET', '/sw.js', null, { Host: 'www.isabisystems.com' });
    const e38WwwAppSw = await httpReq('GET', '/app/sw.js', null, { Host: 'www.isabisystems.com' });
    const e38PagesApi = await httpReq('GET', '/api/health', null, { Host: 'isabi-systems.pages.dev' });
    const e38PagesAppApi = await httpReq('GET', '/app/api/status', null, { Host: 'isabi-systems.pages.dev' });
    const e38WwwApi = await httpReq('GET', '/api/health', null, { Host: 'www.isabisystems.com' });
    const e38WwwAppApi = await httpReq('GET', '/app/api/status', null, { Host: 'www.isabisystems.com' });
    const e38PagesReset = await httpReq('GET', '/reset', null, { Host: 'isabi-systems.pages.dev' });
    const e38WwwAppReset = await httpReq('GET', '/app/reset', null, { Host: 'www.isabisystems.com' });
    const e38LegacyPostApi = await httpReq('POST', '/isabi/app/api/status', {});
    const e38Ipv6Local = await httpReq('GET', '/isabi', null, { Host: `[::1]:${PORT}` });
    const e38PagesTrailingDot = await httpReq('GET', '/?utm_source=fqdn', null, { Host: 'isabi-systems.pages.dev.' });
    const e38PreviewHost = await httpReq('GET', '/robots.txt', null, { Host: 'preview-abc.isabi-systems.pages.dev' });
    const e38PreviewTrailingDot = await httpReq('GET', '/robots.txt', null, { Host: 'preview-abc.isabi-systems.pages.dev.' });
    const e38Unknown404 = await httpReq('GET', '/nonexistent-seo-hygiene-probe');
    const e38Direct404 = await httpReq('GET', '/404');
    const e38Direct404Slash = await httpReq('GET', '/404/');
    const e38Direct404Html = await httpReq('GET', '/404.html');
    const e38AppCssMissing404 = await httpReq('GET', '/app/css/missing-probe.css');
    const e38PagesAppCss = await httpReq('GET', '/app/css/app.css', null, { Host: 'isabi-systems.pages.dev' });
    const locOrigin = `http://127.0.0.1:${PORT}`;
    if (
      e38IndexNow.status === 200 &&
      e38IndexNow.text.trim() === 'c4b9e2a7d18f406395e1a82c7d3f6b90' &&
      e38LegacyRoot.status === 301 &&
      e38LegacyRoot.headers['location'] === `${locOrigin}/` &&
      e38LegacySub.status === 301 &&
      e38LegacySub.headers['location'] === `${locOrigin}/?ref=legacy` &&
      e38LegacyApp.status === 301 &&
      e38LegacyApp.headers['location'] === `${locOrigin}/app/` &&
      e38LegacyAppDeep.status === 301 &&
      e38LegacyAppDeep.headers['location'] === `${locOrigin}/app/tickets?bu=WTC` &&
      e38LegacyPostApi.status === 308 &&
      e38LegacyPostApi.headers['location'] === `${locOrigin}/app/api/status` &&
      e38OpenRedir1.status === 301 &&
      String(e38OpenRedir1.headers['location'] || '').startsWith(`${locOrigin}/`) &&
      !String(e38OpenRedir1.headers['location'] || '').includes('//evil.example') &&
      e38OpenRedir2.status === 301 &&
      String(e38OpenRedir2.headers['location'] || '').startsWith(`${locOrigin}/app/`) &&
      !String(e38OpenRedir2.headers['location'] || '').includes('//evil.example') &&
      e38PagesHost.status === 301 &&
      e38PagesHost.headers['location'] === 'https://isabisystems.com/?utm_source=test' &&
      e38WwwHost.status === 301 &&
      e38WwwHost.headers['location'] === 'https://isabisystems.com/?utm_source=www' &&
      e38PagesSw.status === 200 &&
      String(e38PagesSw.headers['content-type'] || '').includes('javascript') &&
      e38PagesSw.text.includes('client.navigate(client.url)') &&
      !e38PagesSw.text.includes("navigate('https://") &&
      e38PagesSw.text.includes('registration.unregister()') &&
      e38PagesAppSw.status === 200 &&
      e38PagesAppSw.headers['service-worker-allowed'] === '/app/' &&
      e38PagesAppSw.text.includes('client.navigate(client.url)') &&
      e38WwwSw.status === 200 &&
      e38WwwSw.text.includes('client.navigate(client.url)') &&
      e38WwwAppSw.status === 200 &&
      e38WwwAppSw.headers['service-worker-allowed'] === '/app/' &&
      e38PagesApi.status === 200 &&
      e38PagesAppApi.status === 200 &&
      e38WwwApi.status === 200 &&
      e38WwwAppApi.status === 200 &&
      e38PagesReset.status === 200 &&
      e38PagesReset.text.includes('https://isabisystems.com/?reset=') &&
      e38WwwAppReset.status === 200 &&
      e38WwwAppReset.text.includes('https://isabisystems.com/app/?reset=') &&
      e38Ipv6Local.status === 301 &&
      !String(e38Ipv6Local.headers['location'] || '').startsWith('https://isabisystems.com') &&
      e38PagesTrailingDot.status === 301 &&
      e38PagesTrailingDot.headers['location'] === 'https://isabisystems.com/?utm_source=fqdn' &&
      e38PreviewHost.status === 200 &&
      String(e38PreviewHost.headers['x-robots-tag'] || '').includes('noindex') &&
      e38PreviewTrailingDot.status === 200 &&
      String(e38PreviewTrailingDot.headers['x-robots-tag'] || '').includes('noindex') &&
      e38Unknown404.status === 404 &&
      String(e38Unknown404.headers['x-robots-tag'] || '').includes('noindex') &&
      String(e38Unknown404.headers['cache-control'] || '').includes('no-store') &&
      e38Unknown404.text.includes('This page does not exist') &&
      e38Direct404.status === 404 &&
      String(e38Direct404.headers['x-robots-tag'] || '').includes('noindex') &&
      String(e38Direct404.headers['cache-control'] || '').includes('no-store') &&
      e38Direct404.text.includes('This page does not exist') &&
      e38Direct404Slash.status === 404 &&
      String(e38Direct404Slash.headers['x-robots-tag'] || '').includes('noindex') &&
      e38Direct404Slash.text.includes('This page does not exist') &&
      e38Direct404Html.status === 404 &&
      String(e38Direct404Html.headers['x-robots-tag'] || '').includes('noindex') &&
      String(e38Direct404Html.headers['cache-control'] || '').includes('no-store') &&
      e38Direct404Html.text.includes('This page does not exist') &&
      e38AppCssMissing404.status === 404 &&
      String(e38AppCssMissing404.headers['x-robots-tag'] || '').includes('noindex') &&
      String(e38AppCssMissing404.headers['cache-control'] || '').includes('no-store') &&
      String(e38AppCssMissing404.headers['content-security-policy'] || '').includes("default-src 'self'") &&
      e38PagesAppCss.status === 301 &&
      e38PagesAppCss.headers['location'] === 'https://isabisystems.com/app/css/app.css' &&
      String(e38PagesAppCss.headers['x-robots-tag'] || '').includes('noindex')
    ) {
      pass(
        'edge-38-seo-hygiene-redirects-404-noindex-and-indexnow',
        'IndexNow=200, /isabi(/*) 301/308, pages.dev+www 301s, /api+/reset+/sw.js same-origin=200, /404(.html)=404 noindex'
      );
    } else {
      fail('edge-38-seo-hygiene-redirects-404-noindex-and-indexnow', JSON.stringify({
        indexNow: [e38IndexNow.status, e38IndexNow.text.slice(0, 40)],
        legacyRoot: [e38LegacyRoot.status, e38LegacyRoot.headers['location']],
        legacySub: [e38LegacySub.status, e38LegacySub.headers['location']],
        legacyApp: [e38LegacyApp.status, e38LegacyApp.headers['location']],
        legacyAppDeep: [e38LegacyAppDeep.status, e38LegacyAppDeep.headers['location']],
        legacyPostApi: [e38LegacyPostApi.status, e38LegacyPostApi.headers['location']],
        openRedir1: [e38OpenRedir1.status, e38OpenRedir1.headers['location']],
        openRedir2: [e38OpenRedir2.status, e38OpenRedir2.headers['location']],
        pagesHost: [e38PagesHost.status, e38PagesHost.headers['location']],
        wwwHost: [e38WwwHost.status, e38WwwHost.headers['location']],
        pagesSw: [e38PagesSw.status, e38PagesSw.headers['content-type']],
        pagesAppSw: [e38PagesAppSw.status, e38PagesAppSw.headers['service-worker-allowed']],
        wwwSw: [e38WwwSw.status, e38WwwAppSw.status],
        legacyApis: [e38PagesApi.status, e38PagesAppApi.status, e38WwwApi.status, e38WwwAppApi.status],
        legacyResets: [e38PagesReset.status, e38WwwAppReset.status],
        previewRobots: [e38PreviewHost.status, e38PreviewHost.headers['x-robots-tag']],
        unknown404: [e38Unknown404.status, e38Unknown404.headers['x-robots-tag'], e38Unknown404.headers['cache-control']],
        direct404: [e38Direct404.status, e38Direct404.headers['x-robots-tag']],
        direct404Html: [e38Direct404Html.status, e38Direct404Html.headers['x-robots-tag']]
      }));
    }

    // 39. Owner-only /app/api/cashflow_behind + /app/api/sync 'cashflow_behind' 403 isolation
    const cbUnauth = await httpReq('GET', '/app/api/cashflow_behind');
    const cbDemoGet = await httpReq('GET', '/app/api/cashflow_behind', null, { 'X-ISABI-Demo': '1' });
    const cbDemoUnauthPost = await httpReq('POST', '/app/api/cashflow_behind', { cashflow_behind: { status: 'ok' } }, { 'X-ISABI-Demo': '1' });
    const cbDemoOwnerPost = await httpReq('POST', '/app/api/cashflow_behind', { cashflow_behind: { status: 'ok' } }, { 'X-ISABI-Session': ownerToken, 'X-ISABI-Demo': '1' });
    const cbSupGet = await httpReq('GET', '/app/api/cashflow_behind', null, { 'X-ISABI-Session': bbcSupToken });
    const cbSupPost = await httpReq('POST', '/app/api/cashflow_behind', { cashflow_behind: { status: 'ok' } }, { 'X-ISABI-Session': bbcSupToken });
    const cbAllSupGet = typeof e29SupTok === 'string' && e29SupTok
      ? await httpReq('GET', '/app/api/cashflow_behind', null, { 'X-ISABI-Session': e29SupTok })
      : { status: 403 };
    const cbSyncGet = await httpReq('POST', '/app/api/sync', { op: 'get', doc: 'cashflow_behind' }, { 'X-ISABI-Session': ownerToken });
    const cbSyncPatch = await httpReq('POST', '/app/api/sync', { op: 'patch', doc: 'mfg_web_store', patch: { cashflow_behind: { status: 'ok' } } }, { 'X-ISABI-Session': ownerToken });
    const cbTooBig = await httpReq('POST', '/app/api/cashflow_behind', { cashflow_behind: { status: 'ok', pad: 'x'.repeat(35000) } }, { 'X-ISABI-Session': ownerToken });
    const cbUtf8Big = await httpReq('POST', '/app/api/cashflow_behind', { cashflow_behind: { status: 'ok', pad: 'ش'.repeat(18000) } }, { 'X-ISABI-Session': ownerToken });
    const cbBadJson = await fetch(`http://127.0.0.1:${PORT}/app/api/cashflow_behind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-ISABI-Session': ownerToken },
      body: '{bad'
    });
    const cbEmptyStr = await fetch(`http://127.0.0.1:${PORT}/app/api/cashflow_behind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-ISABI-Session': ownerToken },
      body: ''
    });
    const cbEmptyObj = await httpReq('POST', '/app/api/cashflow_behind', {}, { 'X-ISABI-Session': ownerToken });
    const cbEmptyWrap = await httpReq('POST', '/app/api/cashflow_behind', { cashflow_behind: {} }, { 'X-ISABI-Session': ownerToken });
    const cbArr = await httpReq('POST', '/app/api/cashflow_behind', [], { 'X-ISABI-Session': ownerToken });
    const cbClearPost = await httpReq('POST', '/app/api/cashflow_behind', { cashflow_behind: null }, { 'X-ISABI-Session': ownerToken });
    const cbClearGet = await httpReq('GET', '/app/api/cashflow_behind', null, { 'X-ISABI-Session': ownerToken });
    const cbNoticeSample = {
      status: 'ok',
      report_date: '2026-11-13',
      cutoff: '2026-11-12',
      core_hash: 'testcore01',
      companies: [{ company: 'WTC', company_key: 'wtc', cutoff: '2026-11-12', edited_day_count: 1, edited_net_usd: -1100.0, edited_net_lbp: 0, added_day_count: 0, edited_days: [{ date: '2026-08-24', diff_in_usd: 0, diff_out_usd: 1100.0, diff_net_usd: -1100.0, diff_net_lbp: 0, parties: ['Sample Concrete Co'] }] }]
    };
    const cbOwnerPost = await httpReq('POST', '/app/api/cashflow_behind', { cashflow_behind: cbNoticeSample }, { 'X-ISABI-Session': ownerToken });
    const cbOwnerGet = await httpReq('GET', '/app/api/cashflow_behind', null, { 'X-ISABI-Session': ownerToken });
    if (
      cbUnauth.status === 401 &&
      cbDemoGet.status === 200 && cbDemoGet.json?.demo === true && cbDemoGet.json?.cashflow_behind === null &&
      (cbDemoUnauthPost.status === 401 || cbDemoUnauthPost.status === 403) &&
      cbDemoOwnerPost.status === 403 &&
      cbSupGet.status === 403 && cbSupPost.status === 403 && cbAllSupGet.status === 403 &&
      cbSyncGet.status === 403 && cbSyncPatch.status === 403 &&
      cbTooBig.status === 413 && cbUtf8Big.status === 413 &&
      cbBadJson.status === 400 && cbEmptyStr.status === 400 &&
      cbEmptyObj.status === 400 && cbEmptyWrap.status === 400 && cbArr.status === 400 &&
      cbClearPost.status === 200 && cbClearGet.status === 200 && cbClearGet.json?.cashflow_behind === null &&
      cbOwnerPost.status === 200 &&
      cbOwnerGet.status === 200 &&
      cbOwnerGet.json?.cashflow_behind?.companies?.[0]?.edited_net_usd === -1100
    ) {
      pass(
        'edge-39-cashflow-behind-owner-only-and-sync-guard',
        'unauth=401, demo GET=200(null)/POST=401+403, Supervisors=403, /api/sync=403, invalid=400, >32KB ASCII+UTF8=413, clear=200(null), Owner POST+GET=200'
      );
    } else {
      fail('edge-39-cashflow-behind-owner-only-and-sync-guard', JSON.stringify({
        unauth: cbUnauth.status,
        demo: [cbDemoGet.status, cbDemoGet.json, cbDemoUnauthPost.status, cbDemoOwnerPost.status],
        sup: [cbSupGet.status, cbSupPost.status, cbAllSupGet.status],
        sync: [cbSyncGet.status, cbSyncPatch.status],
        big: [cbTooBig.status, cbUtf8Big.status],
        bad: [cbBadJson.status, cbEmptyStr.status, cbEmptyObj.status, cbEmptyWrap.status, cbArr.status],
        clear: [cbClearPost.status, cbClearGet.status, cbClearGet.json],
        owner: [cbOwnerPost.status, cbOwnerGet.status, cbOwnerGet.json]
      }));
    }

    // 40. Owner-only /app/api/source_behind (sibling Source workbook notice): same guards, own document
    const sbUnauth = await httpReq('GET', '/app/api/source_behind');
    const sbUnauthPost = await httpReq('POST', '/app/api/source_behind', { source_behind: { status: 'ok' } });
    const sbAllSupGet = typeof e29SupTok === 'string' && e29SupTok
      ? await httpReq('GET', '/app/api/source_behind', null, { 'X-ISABI-Session': e29SupTok })
      : { status: 403 };
    const sbDemoGet = await httpReq('GET', '/app/api/source_behind', null, { 'X-ISABI-Demo': '1' });
    const sbDemoOwnerPost = await httpReq('POST', '/app/api/source_behind', { source_behind: { status: 'ok' } }, { 'X-ISABI-Session': ownerToken, 'X-ISABI-Demo': '1' });
    const sbSupGet = await httpReq('GET', '/app/api/source_behind', null, { 'X-ISABI-Session': bbcSupToken });
    const sbSupPost = await httpReq('POST', '/app/api/source_behind', { source_behind: { status: 'ok' } }, { 'X-ISABI-Session': bbcSupToken });
    const sbSyncGet = await httpReq('POST', '/app/api/sync', { op: 'get', doc: 'source_behind' }, { 'X-ISABI-Session': ownerToken });
    const sbSyncPatch = await httpReq('POST', '/app/api/sync', { op: 'patch', doc: 'mfg_web_store', patch: { source_behind: { status: 'ok' } } }, { 'X-ISABI-Session': ownerToken });
    const sbTooBig = await httpReq('POST', '/app/api/source_behind', { source_behind: { status: 'ok', pad: 'x'.repeat(35000) } }, { 'X-ISABI-Session': ownerToken });
    const sbWrongWrap = await httpReq('POST', '/app/api/source_behind', { cashflow_behind: null }, { 'X-ISABI-Session': ownerToken });
    const sbEmptyWrap = await httpReq('POST', '/app/api/source_behind', { source_behind: {} }, { 'X-ISABI-Session': ownerToken });
    const sbSample = {
      status: 'ok', report_date: '2026-11-13', cutoff: '2026-11-06', industries_hash: 'testind001',
      businesses: [{ business: 'Blanca', industry_key: 'hospitality', changed_rows: 2, edited_rows: 2, added_rows: 0, removed_rows: 0, changed_date_count: 1, changed_dates: ['2026-11-02'], labels: ['Chalet 4'] }]
    };
    const sbOwnerPost = await httpReq('POST', '/app/api/source_behind', { source_behind: sbSample }, { 'X-ISABI-Session': ownerToken });
    const sbOwnerGet = await httpReq('GET', '/app/api/source_behind', null, { 'X-ISABI-Session': ownerToken });
    const cbAfterSb = await httpReq('GET', '/app/api/cashflow_behind', null, { 'X-ISABI-Session': ownerToken });
    const sbClearPost = await httpReq('POST', '/app/api/source_behind', { source_behind: null }, { 'X-ISABI-Session': ownerToken });
    const sbClearGet = await httpReq('GET', '/app/api/source_behind', null, { 'X-ISABI-Session': ownerToken });
    const cbAfterSbClear = await httpReq('GET', '/app/api/cashflow_behind', null, { 'X-ISABI-Session': ownerToken });
    if (
      sbUnauth.status === 401 && sbUnauthPost.status === 401 && sbAllSupGet.status === 403 &&
      sbDemoGet.status === 200 && sbDemoGet.json?.demo === true && sbDemoGet.json?.source_behind === null &&
      sbDemoOwnerPost.status === 403 &&
      sbSupGet.status === 403 && sbSupPost.status === 403 &&
      sbSyncGet.status === 403 && sbSyncPatch.status === 403 &&
      sbTooBig.status === 413 && sbWrongWrap.status === 400 && sbEmptyWrap.status === 400 &&
      sbOwnerPost.status === 200 && sbOwnerGet.status === 200 &&
      sbOwnerGet.json?.source_behind?.businesses?.[0]?.business === 'Blanca' &&
      cbAfterSb.json?.cashflow_behind?.core_hash === 'testcore01' &&
      sbClearPost.status === 200 && sbClearGet.json?.source_behind === null &&
      cbAfterSbClear.json?.cashflow_behind?.core_hash === 'testcore01'
    ) {
      pass(
        'edge-40-source-behind-owner-only-and-sync-guard',
        'unauth=401, demo GET=200(null)/POST=403, Supervisor=403, /api/sync=403, invalid=400, >32KB=413, Owner POST+GET=200, own document (cashflow_behind untouched by its writes and clears)'
      );
    } else {
      fail('edge-40-source-behind-owner-only-and-sync-guard', JSON.stringify({
        unauth: [sbUnauth.status, sbUnauthPost.status, sbAllSupGet.status],
        demo: [sbDemoGet.status, sbDemoGet.json, sbDemoOwnerPost.status],
        sup: [sbSupGet.status, sbSupPost.status],
        sync: [sbSyncGet.status, sbSyncPatch.status],
        bad: [sbTooBig.status, sbWrongWrap.status, sbEmptyWrap.status],
        owner: [sbOwnerPost.status, sbOwnerGet.status, sbOwnerGet.json],
        cf: [cbAfterSb.json, cbAfterSbClear.json],
        clear: [sbClearPost.status, sbClearGet.json]
      }));
    }

    // 40b. Owner-only /app/api/changed_entries (workbook edits to already-loaded entries, owner 2026-11-17)
    const ceUnauth = await httpReq('GET', '/app/api/changed_entries');
    const ceDemoGet = await httpReq('GET', '/app/api/changed_entries', null, { 'X-ISABI-Demo': '1' });
    const ceSupGet = await httpReq('GET', '/app/api/changed_entries', null, { 'X-ISABI-Session': bbcSupToken });
    const ceSupPost = await httpReq('POST', '/app/api/changed_entries', { changed_entries: { status: 'ok' } }, { 'X-ISABI-Session': bbcSupToken });
    const ceSyncGet = await httpReq('POST', '/app/api/sync', { op: 'get', doc: 'changed_entries' }, { 'X-ISABI-Session': ownerToken });
    const ceSyncPatch = await httpReq('POST', '/app/api/sync', { op: 'patch', doc: 'mfg_web_store', patch: { changed_entries: { status: 'ok' } } }, { 'X-ISABI-Session': ownerToken });
    const ceTooBig = await httpReq('POST', '/app/api/changed_entries', { changed_entries: { status: 'ok', pad: 'x'.repeat(35000) } }, { 'X-ISABI-Session': ownerToken });
    const ceWrongWrap = await httpReq('POST', '/app/api/changed_entries', { source_behind: null }, { 'X-ISABI-Session': ownerToken });
    const ceSample = { status: 'ok', until: '2026-11-17', core_hash: 'testcore01', listed_count: 1, items: [{ kind: 'edit', table: 'expenses', company: 'BBConstruction', date: '2026-10-30', party: 'Phoenicia Logistics SAL', old_usd: 9200, new_usd: 700, fields: ['amount'] }] };
    const ceOwnerPost = await httpReq('POST', '/app/api/changed_entries', { changed_entries: ceSample }, { 'X-ISABI-Session': ownerToken });
    const ceOwnerGet = await httpReq('GET', '/app/api/changed_entries', null, { 'X-ISABI-Session': ownerToken });
    const sbAfterCe = await httpReq('GET', '/app/api/source_behind', null, { 'X-ISABI-Session': ownerToken });
    const ceClearPost = await httpReq('POST', '/app/api/changed_entries', { changed_entries: null }, { 'X-ISABI-Session': ownerToken });
    const ceClearGet = await httpReq('GET', '/app/api/changed_entries', null, { 'X-ISABI-Session': ownerToken });
    const cbAfterCe = await httpReq('GET', '/app/api/cashflow_behind', null, { 'X-ISABI-Session': ownerToken });
    if (
      ceUnauth.status === 401 &&
      ceDemoGet.status === 200 && ceDemoGet.json?.demo === true && ceDemoGet.json?.changed_entries === null &&
      ceSupGet.status === 403 && ceSupPost.status === 403 &&
      ceSyncGet.status === 403 && ceSyncPatch.status === 403 &&
      ceTooBig.status === 413 && ceWrongWrap.status === 400 &&
      ceOwnerPost.status === 200 && ceOwnerGet.json?.changed_entries?.items?.[0]?.party === 'Phoenicia Logistics SAL' &&
      sbAfterCe.json?.source_behind === null &&
      ceClearPost.status === 200 && ceClearGet.json?.changed_entries === null &&
      cbAfterCe.json?.cashflow_behind?.core_hash === 'testcore01'
    ) {
      pass('edge-40b-changed-entries-owner-only-and-sync-guard', 'unauth=401, demo GET=200(null), Supervisor=403, /api/sync=403, invalid=400, >32KB=413, Owner POST+GET+clear=200, own document');
    } else {
      fail('edge-40b-changed-entries-owner-only-and-sync-guard', JSON.stringify({
        unauth: ceUnauth.status, demo: [ceDemoGet.status, ceDemoGet.json], sup: [ceSupGet.status, ceSupPost.status],
        sync: [ceSyncGet.status, ceSyncPatch.status], bad: [ceTooBig.status, ceWrongWrap.status],
        owner: [ceOwnerPost.status, ceOwnerGet.json], others: [sbAfterCe.json, cbAfterCe.json], clear: [ceClearPost.status, ceClearGet.json]
      }));
    }

    // 41. R2->D1 seed restoration, @ISO purge chronology & >2k tail promotion, Supervisor D1 company fallback, & CDP mid-flight auth/seed rehydrate
    const e41Seat = {
      id: 'u-edge41-sup',
      email: 'e41seat@bhfirms.com',
      full_name: 'Edge41 WTC Supervisor',
      role: 'Supervisor',
      companies: 'WTC',
      auth_mode: 'pin_only',
      face_required: false,
      pin_code: '7391',
      status: 'Active'
    };
    const e41SeatRes = await httpReq('POST', '/app/api/users', { user: e41Seat }, { 'X-ISABI-Session': ownerToken });
    const e41SupLogin = await httpReq('POST', '/app/api/auth/login', {
      email: e41Seat.email,
      pin: '7391',
      method: 'PIN'
    }, { 'CF-Connecting-IP': '198.51.100.245' });
    const e41SupTok = String(e41SupLogin.json?.token || '');

    const unpackR2Rows = (tblSpec, pool) => {
      if (!tblSpec) return [];
      if (Array.isArray(tblSpec)) return tblSpec.filter(Boolean);
      const cols = Array.isArray(tblSpec.c) ? tblSpec.c : (Array.isArray(tblSpec.cols) ? tblSpec.cols : []);
      const rows = Array.isArray(tblSpec.r) ? tblSpec.r : (Array.isArray(tblSpec.rows) ? tblSpec.rows : []);
      const sc = Array.isArray(tblSpec.sc) ? tblSpec.sc : [];
      const out = [];
      for (const row of rows) {
        if (!Array.isArray(row)) continue;
        const obj = {};
        for (let i = 0; i < cols.length && i < row.length; i++) {
          let v = row[i];
          if (sc[i] === 1 && typeof v === 'number' && Array.isArray(pool)) v = pool[v];
          obj[cols[i]] = v;
        }
        if (obj.id) out.push(obj);
      }
      return out;
    };

    const e41SeedRecs = await httpReq('GET', '/app/api/seed/records', null, { 'X-ISABI-Session': ownerToken });
    const e41SeedCore = await httpReq('GET', '/app/api/seed/core', null, { 'X-ISABI-Session': ownerToken });
    const e41R2RpRows = unpackR2Rows(e41SeedRecs.json?.records?.raw_purchases, e41SeedRecs.json?._s);
    const e41R2RpIds = new Set(e41R2RpRows.map(r => String(r.id).trim()));
    const e41R2CustIds = new Set(unpackR2Rows(e41SeedCore.json?.records?.customers, e41SeedCore.json?._s).map(r => String(r.id).trim()));

    const e41WtcRp0 = await httpReq('GET', '/app/api/records?table=raw_purchases&company=WTC&limit=200', null, { 'X-ISABI-Session': ownerToken });
    const e41BbcRp0 = await httpReq('GET', '/app/api/records?table=raw_purchases&company=BBConstruction&limit=200', null, { 'X-ISABI-Session': ownerToken });
    const e41Cust0 = await httpReq('GET', '/app/api/records?table=customers&company=all&limit=2000', null, { 'X-ISABI-Session': ownerToken });
    const e41Store0 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const doc41Base = JSON.parse(JSON.stringify(e41Store0.json?.docs?.mfg_web_store || {}));
    const cr41Base = (doc41Base.customRecords && typeof doc41Base.customRecords === 'object') ? doc41Base.customRecords : {};
    const existingRp41 = new Set((cr41Base.raw_purchases || []).map(r => String(r?.id || '').trim()));
    const existingCust41 = new Set((cr41Base.customers || []).map(r => String(r?.id || '').trim()));

    const byNewestDate = (a, b) => String(b?.date || '').localeCompare(String(a?.date || ''));
    let wtcSeedCands = (e41WtcRp0.json?.rows || []).filter(
      r => r && !r.voided && r.id && e41R2RpIds.has(String(r.id).trim()) && !existingRp41.has(String(r.id).trim())
    );
    if (wtcSeedCands.length < 2) {
      const wtcFromR2 = e41R2RpRows
        .filter(r => r.company === 'WTC' && !r.voided && !existingRp41.has(String(r.id).trim()))
        .sort(byNewestDate)
        .slice(0, 2);
      for (const row of wtcFromR2) {
        await httpReq('POST', '/app/api/records', { table: 'raw_purchases', record: row }, { 'X-ISABI-Session': ownerToken });
      }
      const wtcRefetch = await httpReq('GET', '/app/api/records?table=raw_purchases&company=WTC&limit=200', null, { 'X-ISABI-Session': ownerToken });
      wtcSeedCands = (wtcRefetch.json?.rows || []).filter(
        r => r && !r.voided && r.id && e41R2RpIds.has(String(r.id).trim()) && !existingRp41.has(String(r.id).trim())
      );
    }
    const wtcRpA = wtcSeedCands[0];
    const wtcRpB = wtcSeedCands[1];
    let bbcRp = (e41BbcRp0.json?.rows || []).find(
      r => r && !r.voided && r.id && e41R2RpIds.has(String(r.id).trim()) && !existingRp41.has(String(r.id).trim())
    );
    if (!bbcRp) {
      const bbcFromR2 = e41R2RpRows
        .filter(r => r.company === 'BBConstruction' && !r.voided && !existingRp41.has(String(r.id).trim()))
        .sort(byNewestDate)[0];
      if (bbcFromR2) {
        await httpReq('POST', '/app/api/records', { table: 'raw_purchases', record: bbcFromR2 }, { 'X-ISABI-Session': ownerToken });
        const bbcRefetch = await httpReq('GET', '/app/api/records?table=raw_purchases&company=BBConstruction&limit=200', null, { 'X-ISABI-Session': ownerToken });
        bbcRp = (bbcRefetch.json?.rows || []).find(
          r => r && !r.voided && r.id === bbcFromR2.id
        );
      }
    }
    const custSeed = (e41Cust0.json?.rows || []).find(
      r => r && !r.voided && r.id && r.name && e41R2CustIds.has(String(r.id).trim()) && !existingCust41.has(String(r.id).trim())
    );
    const appRpId = 'e41-app-rp-0001';
    if (!e41SupTok || !wtcRpA || !wtcRpB || !bbcRp || !custSeed) {
      fail('edge-41-r2-d1-seed-restore-iso-purge-rls-and-epoch-rehydrate', JSON.stringify({
        e41SeatStatus: e41SeatRes.status,
        hasSupTok: Boolean(e41SupTok),
        wtcCands: wtcSeedCands.length,
        hasBbcRp: Boolean(bbcRp),
        hasCustSeed: Boolean(custSeed)
      }));
    } else {

    const nextIsoAfter = (prevTs, offsetMs = 1000) => {
      const p = Date.parse(prevTs || 0);
      return new Date(Math.max(Date.now(), (Number.isFinite(p) ? p : 0) + offsetMs)).toISOString();
    };

    // (a.1) Owner overrides on wtcRpA, wtcRpB, custSeed + app-entered appRpId
    const doc41S1 = JSON.parse(JSON.stringify(doc41Base));
    doc41S1.minShellVer = MIN_SYNC_SHELL_VER;
    doc41S1.updatedAt = nextIsoAfter(doc41Base.updatedAt, 1000);
    doc41S1.customRecords = Object.assign({}, doc41S1.customRecords);
    doc41S1.customRecords.raw_purchases = [
      ...(Array.isArray(doc41S1.customRecords.raw_purchases) ? doc41S1.customRecords.raw_purchases : []),
      Object.assign({}, wtcRpA, { ticket_no: 'E41-OVR-A', voided: false }),
      Object.assign({}, wtcRpB, { ticket_no: 'E41-OVR-B', voided: false }),
      { id: appRpId, company: 'WTC', date: '2099-01-01', rep_date: '2099-01-01', ticket_no: 'E41-APP-1', site_owner: 'E41 Test', total: 111 }
    ];
    doc41S1.customRecords.customers = [
      ...(Array.isArray(doc41S1.customRecords.customers) ? doc41S1.customRecords.customers : []),
      Object.assign({}, custSeed, { name: 'E41 OVERRIDDEN CUST', official_name: 'E41 OVR OFFICIAL', voided: false })
    ];
    const sync41S1 = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: String(doc41Base.updatedAt || ''),
      awaitMirror: true,
      patch: { mfg_web_store: doc41S1 }
    }, { 'X-ISABI-Session': ownerToken });
    const d1Wtc1 = await httpReq('GET', '/app/api/records?table=raw_purchases&company=WTC&limit=200', null, { 'X-ISABI-Session': ownerToken });
    const d1Cust1 = await httpReq('GET', '/app/api/records?table=customers&company=all&limit=2000', null, { 'X-ISABI-Session': ownerToken });
    const s1OvrOk =
      sync41S1.status === 200 &&
      (d1Wtc1.json?.rows || []).some(r => r.id === wtcRpA.id && r.ticket_no === 'E41-OVR-A' && !r.voided) &&
      (d1Wtc1.json?.rows || []).some(r => r.id === wtcRpB.id && r.ticket_no === 'E41-OVR-B' && !r.voided) &&
      (d1Wtc1.json?.rows || []).some(r => r.id === appRpId && r.ticket_no === 'E41-APP-1' && !r.voided) &&
      (d1Cust1.json?.rows || []).some(r => r.id === custSeed.id && r.name === 'E41 OVERRIDDEN CUST' && !r.voided);

    // (a.2) Owner purges wtcRpA@12:00Z + wtcRpB@12:00Z + forbidden bare wtcRpB, updates wtcRpB@13:00Z, omits custSeed & appRpId
    const e41Get1 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const doc41S2 = JSON.parse(JSON.stringify(e41Get1.json?.docs?.mfg_web_store || {}));
    doc41S2.minShellVer = MIN_SYNC_SHELL_VER;
    doc41S2.updatedAt = nextIsoAfter(sync41S1.json?.updatedAt || doc41S2.updatedAt, 1000);
    doc41S2._purgedOverrideIds = [
      ...(Array.isArray(doc41S2._purgedOverrideIds) ? doc41S2._purgedOverrideIds : []),
      `raw_purchases:${wtcRpA.id}@2026-11-14T12:00:00Z`,
      `raw_purchases:${wtcRpB.id}@2026-11-14T12:00:00Z`,
      `raw_purchases:${wtcRpB.id}`
    ];
    doc41S2.customRecords.raw_purchases = (doc41S2.customRecords?.raw_purchases || [])
      .filter(r => r && r.id !== wtcRpA.id && r.id !== appRpId)
      .map(r => (r.id === wtcRpB.id ? Object.assign({}, wtcRpB, { ticket_no: 'E41-OVR-B-13Z', modified_at: '2026-11-14T13:00:00Z', voided: false }) : r));
    doc41S2.customRecords.customers = (doc41S2.customRecords?.customers || []).filter(r => r && r.id !== custSeed.id);
    const sync41S2 = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: String(sync41S1.json?.updatedAt || ''),
      awaitMirror: true,
      patch: { mfg_web_store: doc41S2 }
    }, { 'X-ISABI-Session': ownerToken });
    const e41Get2 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const kv2 = e41Get2.json?.docs?.mfg_web_store || {};
    const d1Wtc2 = await httpReq('GET', '/app/api/records?table=raw_purchases&company=WTC&limit=200', null, { 'X-ISABI-Session': ownerToken });
    const d1Cust2 = await httpReq('GET', '/app/api/records?table=customers&company=all&limit=2000', null, { 'X-ISABI-Session': ownerToken });
    const r2RpARestored = (d1Wtc2.json?.rows || []).find(r => r.id === wtcRpA.id);
    const d1RpB13 = (d1Wtc2.json?.rows || []).find(r => r.id === wtcRpB.id);
    const d1AppVoided = (d1Wtc2.json?.rows || []).find(r => r.id === appRpId);
    const r2CustRestored = (d1Cust2.json?.rows || []).find(r => r.id === custSeed.id);
    const kvPurged2 = Array.isArray(kv2._purgedOverrideIds) ? kv2._purgedOverrideIds : [];
    const s2RestoreOk =
      sync41S2.status === 200 &&
      kvPurged2.includes(`raw_purchases:${wtcRpA.id}@2026-11-14T12:00:00Z`) &&
      kvPurged2.includes(`raw_purchases:${wtcRpB.id}@2026-11-14T12:00:00Z`) &&
      !kvPurged2.includes(`raw_purchases:${wtcRpB.id}`) &&
      !(kv2.customRecords?.raw_purchases || []).some(r => r && r.id === wtcRpA.id) &&
      (kv2.customRecords?.raw_purchases || []).some(r => r && r.id === wtcRpB.id && r.ticket_no === 'E41-OVR-B-13Z') &&
      r2RpARestored && !r2RpARestored.voided && String(r2RpARestored.ticket_no || '') === String(wtcRpA.ticket_no || '') &&
      d1RpB13 && !d1RpB13.voided && d1RpB13.ticket_no === 'E41-OVR-B-13Z' &&
      d1AppVoided?.voided === true &&
      r2CustRestored && !r2CustRestored.voided && r2CustRestored.name === custSeed.name;

    // (a.3) Follow-up Owner sync purges wtcRpB@14:00Z & omits it -> wtcRpB restores in D1
    const doc41S3 = JSON.parse(JSON.stringify(kv2));
    doc41S3.minShellVer = MIN_SYNC_SHELL_VER;
    doc41S3.updatedAt = nextIsoAfter(sync41S2.json?.updatedAt || doc41S3.updatedAt, 1000);
    doc41S3._purgedOverrideIds = [
      ...(Array.isArray(doc41S3._purgedOverrideIds) ? doc41S3._purgedOverrideIds : []),
      `raw_purchases:${wtcRpB.id}@2026-11-14T14:00:00Z`
    ];
    doc41S3.customRecords.raw_purchases = (doc41S3.customRecords?.raw_purchases || []).filter(r => r && r.id !== wtcRpB.id);
    const sync41S3 = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: String(sync41S2.json?.updatedAt || ''),
      awaitMirror: true,
      patch: { mfg_web_store: doc41S3 }
    }, { 'X-ISABI-Session': ownerToken });
    const e41Get3 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const kv3 = e41Get3.json?.docs?.mfg_web_store || {};
    const d1Wtc3 = await httpReq('GET', '/app/api/records?table=raw_purchases&company=WTC&limit=200', null, { 'X-ISABI-Session': ownerToken });
    const r2RpBRestored = (d1Wtc3.json?.rows || []).find(r => r.id === wtcRpB.id);
    const kvPurged3 = Array.isArray(kv3._purgedOverrideIds) ? kv3._purgedOverrideIds : [];
    const s3RestoreOk =
      sync41S3.status === 200 &&
      kvPurged3.includes(`raw_purchases:${wtcRpB.id}@2026-11-14T14:00:00Z`) &&
      !kvPurged3.includes(`raw_purchases:${wtcRpB.id}@2026-11-14T12:00:00Z`) &&
      !(kv3.customRecords?.raw_purchases || []).some(r => r && r.id === wtcRpB.id) &&
      r2RpBRestored && !r2RpBRestored.voided && String(r2RpBRestored.ticket_no || '') === String(wtcRpB.ticket_no || '');

    // (b) Supervisor (WTC-only) cross-BU @ISO D1 company fallback:
    // Both wtcRpA & bbcRp are omitted from customRecords; D1 lookup keeps wtcRpA@15:00Z and drops bbcRp@15:00Z & nonexistent ID.
    const e41SupGet = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': e41SupTok });
    const doc41Sup = JSON.parse(JSON.stringify(e41SupGet.json?.docs?.mfg_web_store || {}));
    doc41Sup.minShellVer = MIN_SYNC_SHELL_VER;
    doc41Sup.updatedAt = nextIsoAfter(sync41S3.json?.updatedAt || doc41Sup.updatedAt, 1000);
    doc41Sup._purgedOverrideIds = [
      ...(Array.isArray(doc41Sup._purgedOverrideIds) ? doc41Sup._purgedOverrideIds : []),
      `raw_purchases:${wtcRpA.id}@2026-11-14T15:00:00Z`,
      `raw_purchases:${bbcRp.id}@2026-11-14T15:00:00Z`,
      'raw_purchases:rp_deadbeef9999@2026-11-14T15:00:00Z'
    ];
    const sync41Sup = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: String(sync41S3.json?.updatedAt || ''),
      awaitMirror: true,
      patch: { mfg_web_store: doc41Sup }
    }, { 'X-ISABI-Session': e41SupTok });
    const e41GetSupVerify = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const kvSupVerify = e41GetSupVerify.json?.docs?.mfg_web_store || {};
    const kvPurgedSup = Array.isArray(kvSupVerify._purgedOverrideIds) ? kvSupVerify._purgedOverrideIds : [];
    const supD1RlsOk =
      sync41Sup.status === 200 &&
      kvPurgedSup.includes(`raw_purchases:${wtcRpA.id}@2026-11-14T15:00:00Z`) &&
      !kvPurgedSup.some(x => String(x).includes(bbcRp.id)) &&
      !kvPurgedSup.some(x => String(x).includes('rp_deadbeef9999'));

    // (a.4) >2,000-entry _purgedOverrideIds tail promotion through /app/api/sync
    const curPurgedCount = kvPurgedSup.length;
    const fill1Count = Math.max(10, 1995 - curPurgedCount);
    const fillTokens1 = Array.from({ length: fill1Count }, (_, i) => `raw_purchases:rp_e41f${i.toString(16).padStart(8, '0')}@2026-11-14T10:00:00Z`);
    const doc41F1 = JSON.parse(JSON.stringify(kvSupVerify));
    doc41F1.minShellVer = MIN_SYNC_SHELL_VER;
    doc41F1.updatedAt = nextIsoAfter(sync41Sup.json?.updatedAt || doc41F1.updatedAt, 1000);
    doc41F1._purgedOverrideIds = [...kvPurgedSup, ...fillTokens1];
    const sync41F1 = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: String(sync41Sup.json?.updatedAt || ''),
      patch: { mfg_web_store: doc41F1 }
    }, { 'X-ISABI-Session': ownerToken });
    const e41GetF1 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const kvF1 = e41GetF1.json?.docs?.mfg_web_store || {};
    const kvPurgedF1 = Array.isArray(kvF1._purgedOverrideIds) ? kvF1._purgedOverrideIds : [];
    const fillTokens2 = Array.from({ length: 80 }, (_, i) => `raw_purchases:rp_e41f${(fill1Count + i).toString(16).padStart(8, '0')}@2026-11-14T10:00:00Z`);
    const doc41F2 = JSON.parse(JSON.stringify(kvF1));
    doc41F2.minShellVer = MIN_SYNC_SHELL_VER;
    doc41F2.updatedAt = nextIsoAfter(sync41F1.json?.updatedAt || doc41F2.updatedAt, 1000);
    doc41F2._purgedOverrideIds = [...kvPurgedF1, ...fillTokens2, `raw_purchases:${wtcRpA.id}@2026-11-14T16:00:00Z`];
    const sync41F2 = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: String(sync41F1.json?.updatedAt || ''),
      patch: { mfg_web_store: doc41F2 }
    }, { 'X-ISABI-Session': ownerToken });
    const e41GetF2 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const kvPurgedF2 = Array.isArray(e41GetF2.json?.docs?.mfg_web_store?._purgedOverrideIds) ? e41GetF2.json.docs.mfg_web_store._purgedOverrideIds : [];
    const tailPromoteOk =
      sync41F1.status === 200 &&
      sync41F2.status === 200 &&
      kvPurgedF1.indexOf(`raw_purchases:${wtcRpA.id}@2026-11-14T15:00:00Z`) >= 0 &&
      kvPurgedF1.indexOf(`raw_purchases:${wtcRpA.id}@2026-11-14T15:00:00Z`) < 80 &&
      kvPurgedF2.length === 2000 &&
      kvPurgedF2[kvPurgedF2.length - 1] === `raw_purchases:${wtcRpA.id}@2026-11-14T16:00:00Z` &&
      !kvPurgedF2.includes(`raw_purchases:${wtcRpA.id}@2026-11-14T15:00:00Z`);

    // (c) CDP mid-flight /api/seed/records abort via openAuthGate + post-relogin & sign-out rehydration
    await evalJs(`(async () => { if (window.caches) await caches.delete('isabi-mfg-data-v3'); })()`).catch(() => {});
    const remoteScript41 = await sendCdp('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        window.__ISABI_SIMULATE_REMOTE_HOST = true;
        window.__ISABI_TEST_EDGE = true;
        window.ISABI_HAS_EDGE_API = true;
        try {
          localStorage.removeItem('isabi_mfg_edge_sess_tok_v1');
          sessionStorage.removeItem('isabi_mfg_sw_resume');
        } catch (_) {}
        const __e41OrigFetch = window.fetch.bind(window);
        window.__e41MidRecordsHit = false;
        window.__e41MidRecordsDone = false;
        window.__e41ReleaseRecords = null;
        window.fetch = function(input, init) {
          const url = (typeof input === 'string') ? input : (input && input.url ? input.url : '');
          if (!window.__e41MidRecordsDone && url.includes('/api/seed/records')) {
            window.__e41MidRecordsDone = true;
            window.__e41MidRecordsHit = true;
            return __e41OrigFetch(input, init).then(resp => new Promise(resolve => {
              window.__e41ReleaseRecords = () => resolve(resp);
            }));
          }
          return __e41OrigFetch(input, init);
        };
      `
    });
    let midState = { authed: true, recordsReady: true, recordKeys: -1 };
    let relogin1 = { authed: false, recordsReady: false, salesCount: 0 };
    let afterSignOut = { authed: true, recordsReady: true };
    let relogin2 = { authed: false, recordsReady: false, salesCount: 0 };
    try {
      await sendCdp('Network.clearBrowserCookies');
      await sendCdp('Network.setCookie', {
        name: 'isabi_edge_sess',
        value: e41SupTok,
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true
      });
      await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/app/?nosse=1` });
      let midReady = false;
      for (let w = 0; w < 60; w++) {
        midReady = await evalJs(`Boolean(window.__e41MidRecordsHit === true && typeof window.MFG_FACE_TEST?.openAuthGate === 'function')`).catch(() => false);
        if (midReady) break;
        await sleep(200);
      }
      if (midReady) {
        await evalJs(`window.MFG_FACE_TEST.openAuthGate('')`);
        await evalJs(`if (typeof window.__e41ReleaseRecords === 'function') window.__e41ReleaseRecords()`);
        await sleep(250);
        midState = await evalJs(`({
          authed: Boolean(window.MFG_FACE_TEST?.state()?.authed),
          recordsReady: Boolean(window.MFG_SEED?._recordsReady),
          recordKeys: Object.keys(window.MFG_SEED?.records || {}).length
        })`);
        await evalJs(`(async () => await window.MFG_FACE_TEST.performLogin('e41seat@bhfirms.com', '7391'))()`);
        for (let w = 0; w < 60; w++) {
          relogin1 = await evalJs(`({
            authed: Boolean(window.MFG_FACE_TEST?.state()?.authed),
            recordsReady: Boolean(window.MFG_SEED?._recordsReady),
            salesCount: Array.isArray(window.MFG_SEED?.records?.sales_tickets) ? window.MFG_SEED.records.sales_tickets.length : 0
          })`).catch(() => relogin1);
          if (relogin1.authed && relogin1.recordsReady && relogin1.salesCount > 0) break;
          await sleep(200);
        }
        await evalJs(`(async () => { await window.MFG_FACE_TEST.signOut(); })()`);
        await sleep(250);
        afterSignOut = await evalJs(`({
          authed: Boolean(window.MFG_FACE_TEST?.state()?.authed),
          recordsReady: Boolean(window.MFG_SEED?._recordsReady)
        })`);
        await evalJs(`(async () => await window.MFG_FACE_TEST.performLogin('e41seat@bhfirms.com', '7391'))()`);
        for (let w = 0; w < 60; w++) {
          relogin2 = await evalJs(`({
            authed: Boolean(window.MFG_FACE_TEST?.state()?.authed),
            recordsReady: Boolean(window.MFG_SEED?._recordsReady),
            salesCount: Array.isArray(window.MFG_SEED?.records?.sales_tickets) ? window.MFG_SEED.records.sales_tickets.length : 0
          })`).catch(() => relogin2);
          if (relogin2.authed && relogin2.recordsReady && relogin2.salesCount > 0) break;
          await sleep(200);
        }
      }
    } finally {
      if (remoteScript41 && remoteScript41.identifier) {
        await sendCdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: remoteScript41.identifier }).catch(() => {});
      }
    }
    const cdpEpochOk =
      !midState.authed && !midState.recordsReady && midState.recordKeys === 0 &&
      relogin1.authed && relogin1.recordsReady && relogin1.salesCount > 0 &&
      !afterSignOut.authed && !afterSignOut.recordsReady &&
      relogin2.authed && relogin2.recordsReady && relogin2.salesCount > 0;

    if (s1OvrOk && s2RestoreOk && s3RestoreOk && supD1RlsOk && tailPromoteOk && cdpEpochOk) {
      pass(
        'edge-41-r2-d1-seed-restore-iso-purge-rls-and-epoch-rehydrate',
        `R2->D1 restore (raw_purchases + UUID customers + appRpId void) + @13Z>@12Z>@14Z chronology + Supervisor D1 company RLS + 2000-tail promote + CDP mid-flight openAuthGate/signOut rehydrate (${relogin2.salesCount} sales)`
      );
    } else {
      fail('edge-41-r2-d1-seed-restore-iso-purge-rls-and-epoch-rehydrate', JSON.stringify({
        s1OvrOk,
        s2RestoreOk,
        s3RestoreOk,
        supD1RlsOk,
        tailPromoteOk,
        cdpEpochOk,
        midState,
        relogin1,
        afterSignOut,
        relogin2,
        kvF2Len: kvPurgedF2.length,
        kvF2Tail: kvPurgedF2[kvPurgedF2.length - 1]
      }));
    }
    }

    // 42. Server-side < minSyncShellVer sync floor (426), same-name guard (409), and father_name persistence on Edge D1
    const e42_426 = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      patch: { mfg_web_store: { minShellVer: '19.6.345', updatedAt: '2026-11-14T09:00:00.000Z' } }
    }, { 'X-ISABI-Session': ownerToken });
    const e42_sm1 = await httpReq('POST', '/app/api/records', {
      table: 'staff_members',
      record: { id: 'edge42-sm-1', name: 'Zz Edge Same Guard', father_name: 'Hassan', company: 'WTC', role: 'Driver', status: 'Active' }
    }, { 'X-ISABI-Session': ownerToken });
    const e42_sm2 = await httpReq('POST', '/app/api/records', {
      table: 'staff_members',
      record: { id: 'edge42-sm-2', name: '  zz edge same  guard ', company: 'WTC', status: 'Active' }
    }, { 'X-ISABI-Session': ownerToken });
    const e42_smRead = await httpReq('GET', '/app/api/records?table=staff_members&limit=5000', null, { 'X-ISABI-Session': ownerToken });
    const e42_row = (e42_smRead.json?.rows || []).find(r => r && r.id === 'edge42-sm-1');
    const e42_sync409 = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: '2026-11-14T09:01:00.000Z',
          customRecords: {
            staff_members: [{ id: 'edge42-sm-3', name: 'Zz Edge Same Guard', company: 'WTC', status: 'Active' }]
          }
        }
      }
    }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/records', {
      table: 'staff_members',
      record: { id: 'edge42-sm-1', name: 'Zz Edge Same Guard', company: 'WTC', status: 'Active', voided: true }
    }, { 'X-ISABI-Session': ownerToken });
    if (
      e42_426.status === 426 && e42_426.json?.code === 'shell_outdated' &&
      e42_sm1.status === 200 && e42_sm1.json?.ok === true &&
      e42_sm2.status === 409 && e42_sm2.json?.code === 'same_name_conflict' &&
      e42_row?.father_name === 'Hassan' &&
      e42_sync409.status === 409 && e42_sync409.json?.code === 'same_name_conflict'
    ) {
      pass('edge-42-sync-min-shell-426-and-same-name-409', 'sync <minSyncShellVer=426 shell_outdated, records+sync duplicate=409 same_name_conflict, father_name saved in D1');
    } else {
      fail('edge-42-sync-min-shell-426-and-same-name-409', JSON.stringify({
        s426: [e42_426.status, e42_426.json],
        sm1: [e42_sm1.status, e42_sm1.json],
        sm2: [e42_sm2.status, e42_sm2.json],
        row: e42_row,
        sync409: [e42_sync409.status, e42_sync409.json]
      }));
    }

    // 43. /app/api/resolve-map-link Auth, Same-Origin Demo Gate & SSRF Guards
    const e43Get = await httpReq('GET', '/app/api/resolve-map-link', null, { 'X-ISABI-Session': ownerToken });
    const e43Anon = await httpReq('POST', '/app/api/resolve-map-link', { url: 'https://maps.app.goo.gl/abc' });
    const e43CrossDemo = await httpReq('POST', '/app/api/resolve-map-link', { url: 'https://maps.app.goo.gl/abc' }, {
      'X-ISABI-Demo': '1',
      'Origin': 'https://evil.example'
    });
    const e43SsrfUrls = [
      'http://maps.app.goo.gl/abc',
      'https://127.0.0.1/abc',
      'https://169.254.169.254/latest/meta-data/',
      'https://[::1]/abc',
      'https://evil.example/abc',
      'https://user:pass@maps.app.goo.gl/abc',
      'https://maps.app.goo.gl:8443/abc'
    ];
    const e43SsrfRes = [];
    for (const badUrl of e43SsrfUrls) {
      const r = await httpReq('POST', '/app/api/resolve-map-link', { url: badUrl }, { 'X-ISABI-Session': ownerToken });
      e43SsrfRes.push({ badUrl, status: r.status, ok: r.json?.ok, code: r.json?.code });
    }
    const e43SameOriginDemo = await httpReq('POST', '/app/api/resolve-map-link', { url: 'https://evil.example/abc' }, {
      'X-ISABI-Demo': '1',
      'Origin': `http://127.0.0.1:${PORT}`
    });
    const e43Hop1 = await httpReq('POST', '/app/api/resolve-map-link', { url: 'https://maps.app.goo.gl/edge1hop' }, { 'X-ISABI-Session': ownerToken });
    const e43Hop3 = await httpReq('POST', '/app/api/resolve-map-link', { url: 'https://maps.app.goo.gl/edge3hop1' }, { 'X-ISABI-Session': ownerToken });
    const e43Loop = await httpReq('POST', '/app/api/resolve-map-link', { url: 'https://maps.app.goo.gl/edgeLoop1' }, { 'X-ISABI-Session': ownerToken });
    const e43Priv = await httpReq('POST', '/app/api/resolve-map-link', { url: 'https://maps.app.goo.gl/edgePriv' }, { 'X-ISABI-Session': ownerToken });
    if (
      e43Get.status === 405 &&
      e43Anon.status === 401 &&
      e43CrossDemo.status === 403 &&
      e43SsrfRes.every(x => x.status === 400 && x.ok === false) &&
      e43SameOriginDemo.status === 400 && e43SameOriginDemo.json?.ok === false &&
      e43Hop1.status === 200 && /33\.8938/.test(String(e43Hop1.json?.resolvedUrl || '')) &&
      e43Hop3.status === 200 && Number(e43Hop3.json?.hops) === 3 && /34\.1234/.test(String(e43Hop3.json?.resolvedUrl || '')) &&
      e43Loop.status === 422 && e43Loop.json?.code === 'too_many_redirects' &&
      e43Priv.status === 422
    ) {
      pass('edge-43-resolve-map-link-ssrf-and-guards', 'GET=405, anon=401, cross-origin Demo=403, 7 SSRF=400, 1-hop=200, 3-hop=200, 4-hop=422 too_many_redirects, private redirect=422');
    } else {
      fail('edge-43-resolve-map-link-ssrf-and-guards', JSON.stringify({
        get: [e43Get.status, e43Get.json],
        anon: [e43Anon.status, e43Anon.json],
        crossDemo: [e43CrossDemo.status, e43CrossDemo.json],
        ssrf: e43SsrfRes,
        sameOriginDemo: [e43SameOriginDemo.status, e43SameOriginDemo.json],
        hop1: [e43Hop1.status, e43Hop1.json],
        hop3: [e43Hop3.status, e43Hop3.json],
        loop: [e43Loop.status, e43Loop.json],
        priv: [e43Priv.status, e43Priv.json]
      }));
    }

    // 44. Sync round-trip for industryRowEdits geo metadata & _pinCleared across industryRowEdits and customRecords.sites
    const e44Base = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const e44Doc0 = JSON.parse(JSON.stringify(e44Base.json?.docs?.mfg_web_store || {}));
    const e44Key = 'Real Estate & Property::Master Property & Cadastral Plot Registry::PLOT-EDGE-44';
    const e44Ts1 = new Date(Math.max(Date.now(), Date.parse(e44Doc0.updatedAt || 0) + 1000)).toISOString();
    const e44Ire1 = Object.assign({}, e44Doc0.industryRowEdits || {}, {
      [e44Key]: {
        ind: 'Real Estate & Property',
        tableTitle: 'Master Property & Cadastral Plot Registry',
        primaryId: 'PLOT-EDGE-44',
        company: '4235 Company S.A.L',
        isReProperty: true,
        siteName: 'Edge 44 Test Plot',
        latitude: 33.89512,
        longitude: 35.50512,
        region: 'Beirut',
        _pinCleared: false,
        rev: 1,
        updatedAt: e44Ts1
      }
    });
    const e44Sites1 = (Array.isArray(e44Doc0.customRecords?.sites) ? e44Doc0.customRecords.sites.filter(s => s && s.id !== 'site-edge-44') : []).concat([{
      id: 'site-edge-44',
      name: 'Edge 44 Test Site',
      company: 'WTC',
      region: 'Beirut',
      latitude: 33.89111,
      longitude: 35.50111,
      _pinCleared: false,
      voided: false,
      rev: 1,
      modified_at: e44Ts1
    }]);
    const e44Patch1 = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: String(e44Doc0.updatedAt || ''),
      awaitMirror: true,
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: e44Ts1,
          industryRowEdits: e44Ire1,
          customRecords: Object.assign({}, e44Doc0.customRecords || {}, { sites: e44Sites1 })
        }
      }
    }, { 'X-ISABI-Session': ownerToken });
    const e44Ts2 = new Date(Date.parse(e44Ts1) + 1000).toISOString();
    const e44Ire2 = Object.assign({}, e44Ire1, {
      [e44Key]: Object.assign({}, e44Ire1[e44Key], {
        latitude: null,
        longitude: null,
        _pinCleared: true,
        rev: 2,
        updatedAt: e44Ts2
      })
    });
    const e44Sites2 = e44Sites1.map(s => s.id === 'site-edge-44' ? Object.assign({}, s, {
      latitude: null,
      longitude: null,
      _pinCleared: true,
      rev: 2,
      modified_at: e44Ts2
    }) : s);
    const e44Patch2 = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: String(e44Patch1.json?.updatedAt || ''),
      awaitMirror: true,
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: e44Ts2,
          industryRowEdits: e44Ire2,
          customRecords: Object.assign({}, e44Doc0.customRecords || {}, { sites: e44Sites2 })
        }
      }
    }, { 'X-ISABI-Session': ownerToken });
    const e44Read = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const e44ReadDoc = e44Read.json?.docs?.mfg_web_store || {};
    const e44SavedIre = e44ReadDoc.industryRowEdits?.[e44Key];
    const e44SavedSite = (e44ReadDoc.customRecords?.sites || []).find(s => s && s.id === 'site-edge-44');
    // Also verify D1 normalized sites table hydrated _pinCleared cleanly
    const e44D1Sites = await httpReq('GET', '/app/api/records?table=sites&company=WTC&limit=5000', null, { 'X-ISABI-Session': ownerToken });
    const e44D1Site = (e44D1Sites.json?.rows || []).find(s => s && s.id === 'site-edge-44');
    // Clean up test records (void rev 3)
    const e44Ts3 = new Date(Date.parse(e44Ts2) + 1000).toISOString();
    await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: String(e44Patch2.json?.updatedAt || ''),
      awaitMirror: true,
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: e44Ts3,
          industryRowEdits: Object.assign({}, e44Ire2, {
            [e44Key]: Object.assign({}, e44Ire2[e44Key], { voided: true, rev: 3, updatedAt: e44Ts3 })
          }),
          customRecords: Object.assign({}, e44Doc0.customRecords || {}, {
            sites: e44Sites2.map(s => s.id === 'site-edge-44' ? Object.assign({}, s, { voided: true, rev: 3, modified_at: e44Ts3 }) : s)
          })
        }
      }
    }, { 'X-ISABI-Session': ownerToken });
    if (
      e44Patch1.status === 200 && e44Patch2.status === 200 &&
      e44SavedIre?.isReProperty === true &&
      e44SavedIre?.siteName === 'Edge 44 Test Plot' &&
      e44SavedIre?._pinCleared === true && e44SavedIre?.latitude == null &&
      e44SavedSite?._pinCleared === true && e44SavedSite?.latitude == null &&
      e44D1Site?._pinCleared === true && e44D1Site?.latitude == null
    ) {
      pass('edge-44-sync-ire-and-pin-cleared-roundtrip', 'industryRowEdits geo metadata + _pinCleared + customRecords.sites & D1 sites._pinCleared persisted across sync');
    } else {
      fail('edge-44-sync-ire-and-pin-cleared-roundtrip', JSON.stringify({
        p1: [e44Patch1.status, e44Patch1.json],
        p2: [e44Patch2.status, e44Patch2.json],
        savedIre: e44SavedIre,
        savedSite: e44SavedSite,
        d1Site: e44D1Site
      }));
    }

    // 44b: Server-side Words-Only & Read-Only write/GPS locks + blank-company industryRowEdits RLS
    const e44bWordsNewSite = await httpReq('POST', '/app/api/records', {
      table: 'sites',
      record: { id: 'site-e44b-words', name: 'Site E44b Words', company: 'WTC', region: 'Beirut', latitude: 33.88888, longitude: 35.55555, voided: 0 }
    }, { 'X-ISABI-Session': entryToken });
    const e44bWordsTextEdit = await httpReq('POST', '/app/api/records', {
      table: 'sites',
      record: { id: 'site-e44b-words', name: 'Site E44b Renamed', company: 'WTC', region: 'Beirut', latitude: 33.88888, longitude: 35.55555, voided: 0 }
    }, { 'X-ISABI-Session': entryToken });
    const e44bWordsGps403 = await httpReq('POST', '/app/api/records', {
      table: 'sites',
      record: { id: 'site-e44b-words', name: 'Site E44b Renamed', company: 'WTC', region: 'Beirut', latitude: 34.11111, longitude: 35.61111, voided: 0 }
    }, { 'X-ISABI-Session': entryToken });
    const e44bWordsIreGps403 = await httpReq('POST', '/app/api/industry_domain_store', {
      industryRowEdits: {
        'Manufacturing::Sites::E44B-GPS': { ind: 'Manufacturing', primaryId: 'E44B-GPS', company: 'WTC', latitude: 33.91111, longitude: 35.51111, rev: 1 }
      }
    }, { 'X-ISABI-Session': entryToken });

    // Supervisor Read-Only tests (bbcSupToken on BBConstruction)
    await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: 'exp-e44b-bbc', company: 'BBConstruction', date: '2026-11-12', amount: 55, notes: 'Supervisor void target', voided: 0 }
    }, { 'X-ISABI-Session': ownerToken });
    const e44bSupCreate403 = await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: 'exp-e44b-sup-new', company: 'BBConstruction', date: '2026-11-12', amount: 10, voided: 0 }
    }, { 'X-ISABI-Session': bbcSupToken });
    const e44bSupEdit403 = await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: 'exp-e44b-bbc', company: 'BBConstruction', date: '2026-11-12', amount: 99, notes: 'Supervisor void target', voided: 0 }
    }, { 'X-ISABI-Session': bbcSupToken });
    const e44bSupDom403 = await httpReq('POST', '/app/api/industry_domain_store', {
      industryRowEdits: {
        'Manufacturing::Audit::SUP-E44B': { ind: 'Manufacturing', primaryId: 'SUP-E44B', company: 'BBConstruction', siteName: 'Blocked', rev: 1 }
      }
    }, { 'X-ISABI-Session': bbcSupToken });
    const e44bSupPureVoid = await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: 'exp-e44b-bbc', company: 'BBConstruction', date: '2026-11-12', amount: 55, notes: 'Supervisor void target', voided: 1, void_reason: 'Supervisor void target' }
    }, { 'X-ISABI-Session': bbcSupToken });

    // /app/api/sync blank-company overwrite + Words-Only GPS tamper sanitization
    const e44bSyncRead0 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const e44bDoc0 = JSON.parse(JSON.stringify(e44bSyncRead0.json?.docs?.mfg_web_store || {}));
    const e44bTs1 = new Date(Math.max(Date.now(), Date.parse(e44bDoc0.updatedAt || 0) + 1000)).toISOString();
    const e44bOwnerSet = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: String(e44bDoc0.updatedAt || ''),
      awaitMirror: true,
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: e44bTs1,
          industryRowEdits: Object.assign({}, e44bDoc0.industryRowEdits || {}, {
            'blank-co-e44b': { ind: 'Manufacturing', primaryId: 'BLANK-44B', company: '', siteName: 'Owner Blank', rev: 1, updatedAt: e44bTs1 }
          }),
          customRecords: Object.assign({}, e44bDoc0.customRecords || {}, {
            sites: (e44bDoc0.customRecords?.sites || []).filter(s => s && s.id !== 'site-e44b-words').concat([
              { id: 'site-e44b-words', name: 'Site E44b Renamed', company: 'WTC', region: 'Beirut', latitude: 33.88888, longitude: 35.55555, voided: false, rev: 1 }
            ])
          })
        }
      }
    }, { 'X-ISABI-Session': ownerToken });
    const e44bTs2 = new Date(Date.parse(e44bTs1) + 1000).toISOString();
    const e44bEntryTamper = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: String(e44bOwnerSet.json?.updatedAt || ''),
      awaitMirror: true,
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: e44bTs2,
          industryRowEdits: Object.assign({}, e44bDoc0.industryRowEdits || {}, {
            'blank-co-e44b': { ind: 'Manufacturing', primaryId: 'BLANK-44B', company: 'WTC', siteName: 'HIJACKED', rev: 2, updatedAt: e44bTs2 },
            'words-gps-e44b': { ind: 'Manufacturing', primaryId: 'WORDS-GPS-44B', company: 'WTC', siteName: 'GPS Tamper', latitude: 34.22222, longitude: 35.77777, rev: 1, updatedAt: e44bTs2 }
          }),
          customRecords: Object.assign({}, e44bDoc0.customRecords || {}, {
            sites: (e44bDoc0.customRecords?.sites || []).filter(s => s && s.id !== 'site-e44b-words').concat([
              { id: 'site-e44b-words', name: 'Site E44b SyncText', company: 'WTC', region: 'Beirut', latitude: 34.44444, longitude: 35.99999, _pinCleared: true, voided: false, rev: 2 }
            ])
          })
        }
      }
    }, { 'X-ISABI-Session': entryToken });
    const e44bVerifyDoc = (await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken })).json?.docs?.mfg_web_store || {};
    const e44bBlankAfter = e44bVerifyDoc.industryRowEdits?.['blank-co-e44b'];
    const e44bWordsNewAfter = e44bVerifyDoc.industryRowEdits?.['words-gps-e44b'];
    const e44bSiteAfter = (e44bVerifyDoc.customRecords?.sites || []).find(s => s && s.id === 'site-e44b-words');

    // Clean up 44b test artifacts
    const e44bTs3 = new Date(Date.parse(e44bTs2) + 1000).toISOString();
    const cleanIre44b = Object.assign({}, e44bVerifyDoc.industryRowEdits || {});
    delete cleanIre44b['blank-co-e44b'];
    delete cleanIre44b['words-gps-e44b'];
    await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: String(e44bEntryTamper.json?.updatedAt || e44bVerifyDoc.updatedAt || ''),
      awaitMirror: true,
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: e44bTs3,
          industryRowEdits: cleanIre44b,
          customRecords: Object.assign({}, e44bVerifyDoc.customRecords || {}, {
            sites: (e44bVerifyDoc.customRecords?.sites || []).map(s => s.id === 'site-e44b-words' ? Object.assign({}, s, { voided: true, rev: 3 }) : s)
          })
        }
      }
    }, { 'X-ISABI-Session': ownerToken });

    if (
      e44bWordsNewSite.status === 200 &&
      e44bWordsTextEdit.status === 200 &&
      e44bWordsGps403.status === 403 &&
      e44bWordsIreGps403.status === 403 &&
      e44bSupCreate403.status === 403 &&
      e44bSupEdit403.status === 403 &&
      e44bSupDom403.status === 403 &&
      e44bSupPureVoid.status === 200 &&
      e44bOwnerSet.status === 200 &&
      e44bEntryTamper.status === 200 &&
      e44bBlankAfter?.siteName === 'Owner Blank' &&
      e44bWordsNewAfter && e44bWordsNewAfter.latitude === undefined &&
      Math.abs(Number(e44bSiteAfter?.latitude || 0) - 33.88888) < 1e-4 &&
      !e44bSiteAfter?._pinCleared
    ) {
      pass('edge-44b-role-write-locks-and-blank-company-rls', 'Words-Only GPS=403 vs new site/text=200, Read-Only non-void=403 vs pure void=200, /sync sanitized blank-company + GPS mutations');
    } else {
      fail('edge-44b-role-write-locks-and-blank-company-rls', JSON.stringify({
        wordsNew: [e44bWordsNewSite.status, e44bWordsNewSite.json],
        wordsText: [e44bWordsTextEdit.status, e44bWordsTextEdit.json],
        wordsGps: [e44bWordsGps403.status, e44bWordsGps403.json],
        wordsIreGps: [e44bWordsIreGps403.status, e44bWordsIreGps403.json],
        supCreate: e44bSupCreate403.status,
        supEdit: e44bSupEdit403.status,
        supDom: e44bSupDom403.status,
        supVoid: e44bSupPureVoid.status,
        ownerSet: e44bOwnerSet.status,
        entryTamper: [e44bEntryTamper.status, e44bEntryTamper.json],
        blankAfter: e44bBlankAfter,
        wordsNewAfter: e44bWordsNewAfter,
        siteAfter: e44bSiteAfter
      }));
    }

    // 44c: Gate #2 remediation parity (Sec-Fetch-Site CSRF, Geo RLS, sparse pure-void, Supervisor purge lock, Sales missing-pin & partial /sync)
    const e44cSecFetchOnly = await httpReq('POST', '/app/api/resolve-map-link', { url: 'https://maps.app.goo.gl/testGate1' }, {
      'X-ISABI-Demo': '1',
      'Sec-Fetch-Site': 'same-origin'
    });
    const lionsLogin = await httpReq('POST', '/app/api/auth/login', {
      email: 'fleet.lions@bhfirms.com', pin: '7777', method: 'PIN', device: 'Verify Suite'
    });
    const lionsToken = String(lionsLogin.json?.token || '');
    const salesLogin = await httpReq('POST', '/app/api/auth/login', {
      email: 'ar.mfg@bhfirms.com', pin: '8888', method: 'PIN', device: 'Verify Suite'
    });
    const salesToken = String(salesLogin.json?.token || '');

    const e44cDelTs = new Date().toISOString();
    await httpReq('POST', '/app/api/geo_config', {
      regions: { 'Hospitality::Blanca:44cReg': { id: '44cr', name: '44cReg', company: 'Blanca', center_lat: 33.89, center_lng: 35.50, radius_km: 1 } },
      sites: { 'Hospitality::Blanca:44cSite': { id: '44cs', name: '44cSite', company: 'Blanca', lat: 33.89, lng: 35.50 } },
      pairKmOverrides: { 'Hospitality::Blanca::A::B': 5.5 },
      _deletedKeys: { 'sites:Hospitality::Blanca:44cDel': e44cDelTs }
    }, { 'X-ISABI-Session': ownerToken });

    const e44cLionsGeoReg403 = await httpReq('POST', '/app/api/geo_config', {
      regions: { 'Hospitality::Blanca:attackReg': { id: 'atk1', name: 'AtkReg', company: 'Blanca', center_lat: 33.8, center_lng: 35.5, radius_km: 1 } }
    }, { 'X-ISABI-Session': lionsToken });
    const e44cLionsGeoSite403 = await httpReq('POST', '/app/api/geo_config', {
      sites: { 'Hospitality::Blanca:attackSite': { id: 'atk2', name: 'AtkSite', company: 'Blanca', lat: 33.8, lng: 35.5 } }
    }, { 'X-ISABI-Session': lionsToken });
    const e44cLionsGeoKm403 = await httpReq('POST', '/app/api/geo_config', {
      pairKmOverrides: { 'Hospitality::Blanca::X::Y': 9.9 }
    }, { 'X-ISABI-Session': lionsToken });
    const e44cLionsGeoGet = await httpReq('GET', '/app/api/geo_config', null, { 'X-ISABI-Session': lionsToken });
    const e44cLionsGeoDoc = e44cLionsGeoGet.json?.config || e44cLionsGeoGet.json || {};
    const e44cLionsHasHosp = ['regions', 'sites', 'pairKmOverrides', '_pairKmTs', '_deletedKeys'].some(b =>
      Object.keys(e44cLionsGeoDoc[b] || {}).some(k => /Hospitality::/i.test(k))
    );

    const e44cBbcSiteId = 'site-edge-44c-bbc';
    const e44cBbcDomKey = 'Manufacturing::Sites::BBC-44C';
    await httpReq('POST', '/app/api/records', {
      table: 'sites',
      record: { id: e44cBbcSiteId, name: '__44C_BBC_VOID__', company: 'BBConstruction', latitude: 33.8915, longitude: 35.5015, region: 'Beirut', notes: 'edge-keep' }
    }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/industry_domain_store', {
      industryRowEdits: {
        [e44cBbcDomKey]: { ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'BBC-44C', company: 'BBConstruction', latitude: 33.8916, longitude: 35.5016, region: 'Beirut', rev: 1 }
      }
    }, { 'X-ISABI-Session': ownerToken });

    const e44cSupVoidSite = await httpReq('POST', '/app/api/records', {
      table: 'sites', record: { id: e44cBbcSiteId, company: 'BBConstruction', voided: 1 }
    }, { 'X-ISABI-Session': bbcSupToken });
    const e44cSupSitesList = await httpReq('GET', '/app/api/records?table=sites', null, { 'X-ISABI-Session': bbcSupToken });
    const e44cVoidedSite = ((e44cSupSitesList.json?.rows || e44cSupSitesList.json?.records || []).find(r => String(r.id) === e44cBbcSiteId)) || {};

    const e44cLionsInd403 = await httpReq('POST', '/app/api/industry_domain_store', {
      industryRowEdits: { 'Manufacturing::Sites::BBC-ONLY': { ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'BBC-ONLY', company: 'BBConstruction', rev: 1 } }
    }, { 'X-ISABI-Session': lionsToken });
    const e44cSupMixed403 = await httpReq('POST', '/app/api/industry_domain_store', {
      industryRowEdits: {
        [e44cBbcDomKey]: { ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'BBC-44C', company: 'BBConstruction', latitude: 33.8916, longitude: 35.5016, region: 'Beirut', voided: true, rev: 2 },
        'Hospitality::Blanca::ECHO-IGNORED': { ind: 'Hospitality', tableTitle: 'Venues', primaryId: 'ECHO-IGNORED', company: 'Blanca', rev: 1 }
      }
    }, { 'X-ISABI-Session': bbcSupToken });
    const e44cOwnPreGet = await httpReq('GET', '/app/api/industry_domain_store', null, { 'X-ISABI-Session': ownerToken });
    const e44cHospEchoPersisted = Boolean((e44cOwnPreGet.json?.industryRowEdits || {})['Hospitality::Blanca::ECHO-IGNORED']);
    const e44cMixBbcPreVoided = Boolean(((e44cOwnPreGet.json?.industryRowEdits || {})[e44cBbcDomKey] || {}).voided);
    const e44cSupVoidInd = await httpReq('POST', '/app/api/industry_domain_store', {
      industryRowEdits: {
        [e44cBbcDomKey]: { ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'BBC-44C', company: 'BBConstruction', latitude: 33.8916, longitude: 35.5016, region: 'Beirut', voided: true, rev: 2 }
      }
    }, { 'X-ISABI-Session': bbcSupToken });
    const e44cSupIndGet = await httpReq('GET', '/app/api/industry_domain_store', null, { 'X-ISABI-Session': bbcSupToken });
    const e44cVoidedDom = (e44cSupIndGet.json?.industryRowEdits || {})[e44cBbcDomKey] || {};
    const e44cSupPurge403 = await httpReq('POST', '/app/api/industry_domain_store', { purgedEditKeys: [e44cBbcDomKey] }, { 'X-ISABI-Session': bbcSupToken });

    const e44cSalesSiteId = 'site-edge-44c-sales';
    const e44cSalesCreate = await httpReq('POST', '/app/api/records', {
      table: 'sites', record: { id: e44cSalesSiteId, name: '__44C_SALES_SITE__', company: 'WTC', region: 'Beirut', site_category: 'Project' }
    }, { 'X-ISABI-Session': salesToken });
    const e44cSalesFillPin = await httpReq('POST', '/app/api/records', {
      table: 'sites', record: { id: e44cSalesSiteId, name: '__44C_SALES_SITE__', company: 'WTC', region: 'Beirut', latitude: 33.8925, longitude: 35.5025 }
    }, { 'X-ISABI-Session': salesToken });
    const e44cSalesRePin403 = await httpReq('POST', '/app/api/records', {
      table: 'sites', record: { id: e44cSalesSiteId, name: '__44C_SALES_SITE__', company: 'WTC', region: 'Beirut', latitude: 33.8111, longitude: 35.4111 }
    }, { 'X-ISABI-Session': salesToken });

    const e44cSyncSnap0 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const e44cDoc0 = e44cSyncSnap0.json?.docs?.mfg_web_store || {};
    const e44cKeySeed = 'Manufacturing::Sites::WTC-44C-SEED';
    const e44cKeyNew = 'Manufacturing::Sites::WTC-44C-NEW';
    const e44cSyncKeepSiteId = 'site-edge-44c-keep';
    const e44cOrigCustomSites = Array.isArray(e44cDoc0.customRecords?.sites) ? e44cDoc0.customRecords.sites.slice() : [];
    const e44cSeedPatch = await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: new Date().toISOString(),
          industryRowEdits: Object.assign({}, e44cDoc0.industryRowEdits || {}, {
            [e44cKeySeed]: { ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'WTC-44C-SEED', company: 'WTC', rev: 1 }
          }),
          customRecords: Object.assign({}, e44cDoc0.customRecords || {}, {
            sites: e44cOrigCustomSites.concat([{ id: e44cSyncKeepSiteId, name: '__44C_SYNC_KEEP__', company: 'WTC' }])
          })
        }
      }
    }, { 'X-ISABI-Session': ownerToken });
    const e44cEntryPartialSync = await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: new Date(Date.now() + 500).toISOString(),
          industryRowEdits: {
            [e44cKeyNew]: { ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'WTC-44C-NEW', company: 'WTC', rev: 1 }
          }
        }
      }
    }, { 'X-ISABI-Session': entryToken });
    const e44cSyncAfter = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const e44cDocAfter = e44cSyncAfter.json?.docs?.mfg_web_store || {};
    const e44cKeptSiblingKey = Boolean(e44cDocAfter.industryRowEdits && e44cDocAfter.industryRowEdits[e44cKeySeed]);
    const e44cKeptCustomSite = Boolean(Array.isArray(e44cDocAfter.customRecords?.sites) && e44cDocAfter.customRecords.sites.some(s => String(s.id) === e44cSyncKeepSiteId));

    // Clean up 44c test rows & keys with ownerToken
    await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44cBbcSiteId, company: 'BBConstruction', voided: 1 } }, { 'X-ISABI-Session': ownerToken }).catch(() => {});
    await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44cSalesSiteId, company: 'WTC', voided: 1 } }, { 'X-ISABI-Session': ownerToken }).catch(() => {});
    await httpReq('POST', '/app/api/industry_domain_store', { purgedEditKeys: [e44cBbcDomKey, e44cKeySeed, e44cKeyNew] }, { 'X-ISABI-Session': ownerToken }).catch(() => {});
    await httpReq('POST', '/app/api/geo_config', {
      _deletedKeys: { 'regions:Hospitality::Blanca:44cReg': e44cDelTs, 'sites:Hospitality::Blanca:44cSite': e44cDelTs }
    }, { 'X-ISABI-Session': ownerToken }).catch(() => {});
    await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: new Date(Date.now() + 1000).toISOString(),
          customRecords: Object.assign({}, e44cDoc0.customRecords || {}, { sites: e44cOrigCustomSites })
        }
      }
    }, { 'X-ISABI-Session': ownerToken }).catch(() => {});

    const e44cOk = (
      e44cSecFetchOnly.status === 403 &&
      Boolean(lionsToken) &&
      e44cLionsGeoReg403.status === 403 &&
      e44cLionsGeoSite403.status === 403 &&
      e44cLionsGeoKm403.status === 403 &&
      !e44cLionsHasHosp &&
      e44cSupVoidSite.status === 200 &&
      Math.abs(Number(e44cVoidedSite.latitude) - 33.8915) < 1e-4 &&
      Math.abs(Number(e44cVoidedSite.longitude) - 35.5015) < 1e-4 &&
      e44cVoidedSite.region === 'Beirut' &&
      e44cLionsInd403.status === 403 &&
      e44cSupMixed403.status === 403 &&
      !e44cMixBbcPreVoided &&
      e44cSupVoidInd.status === 200 &&
      Math.abs(Number(e44cVoidedDom.latitude) - 33.8916) < 1e-4 &&
      Math.abs(Number(e44cVoidedDom.longitude) - 35.5016) < 1e-4 &&
      e44cVoidedDom.region === 'Beirut' &&
      !e44cHospEchoPersisted &&
      e44cSupPurge403.status === 403 &&
      e44cSalesCreate.status === 200 &&
      e44cSalesFillPin.status === 200 &&
      e44cSalesRePin403.status === 403 &&
      e44cSeedPatch.status === 200 &&
      e44cEntryPartialSync.status === 200 &&
      e44cKeptSiblingKey &&
      e44cKeptCustomSite
    );
    if (e44cOk) {
      pass('edge-44c-gate2-remediation-parity', 'Sec-Fetch-Site CSRF=403, u8 Geo RLS hidden/403, sparse pure-void preserves GPS, Supervisor purge=403, Sales missing-pin=200/re-pin=403, partial /sync preserved');
    } else {
      fail('edge-44c-gate2-remediation-parity', JSON.stringify({
        secFetchOnly: e44cSecFetchOnly.status,
        lionsGeo403: [e44cLionsGeoReg403.status, e44cLionsGeoSite403.status, e44cLionsGeoKm403.status],
        lionsHasHosp: e44cLionsHasHosp,
        supVoidSite: [e44cSupVoidSite.status, e44cVoidedSite],
        lionsInd403: e44cLionsInd403.status,
        supMixed403: [e44cSupMixed403.status, e44cMixBbcPreVoided],
        supVoidInd: [e44cSupVoidInd.status, e44cVoidedDom],
        hospEchoPersisted: e44cHospEchoPersisted,
        supPurge403: e44cSupPurge403.status,
        salesPin: [e44cSalesCreate.status, e44cSalesFillPin.status, e44cSalesRePin403.status],
        syncStatus: [e44cSeedPatch.status, e44cEntryPartialSync.status],
        keptSiblingKey: e44cKeptSiblingKey,
        keptCustomSite: e44cKeptCustomSite
      }));
    }

    // 44d. Gate #3 Remediation Parity (HEAD-first redirect walk, GPS bounds/(0,0)/boolean validation, void/create lock parity, non-Owner geo_config RLS)
    const e44dHeadCalls = [];
    const e44dHeadRes = await walkShortMapRedirects('https://maps.app.goo.gl/e44dHead1', {
      maxHops: 3,
      timeoutMs: 3000,
      fetchImpl: async (_u, init = {}) => {
        e44dHeadCalls.push({ method: init.method, range: (init.headers && init.headers.Range) || '' });
        if (init.method === 'HEAD') {
          return new Response(null, { status: 302, headers: { Location: 'https://www.google.com/maps?q=33.8938,35.5018' } });
        }
        return new Response(null, { status: 500 });
      }
    });
    const e44d405Calls = [];
    const e44d405Res = await walkShortMapRedirects('https://maps.app.goo.gl/e44dHead405', {
      maxHops: 3,
      timeoutMs: 3000,
      fetchImpl: async (_u, init = {}) => {
        e44d405Calls.push({ method: init.method, range: (init.headers && init.headers.Range) || '' });
        if (init.method === 'HEAD') return new Response(null, { status: 405 });
        if (init.method === 'GET' && init.headers && init.headers.Range === 'bytes=0-0') {
          return new Response(null, { status: 302, headers: { Location: 'https://www.google.com/maps?q=33.8555,35.5155' } });
        }
        return new Response(null, { status: 500 });
      }
    });
    const e44d403Calls = [];
    const e44d403Res = await walkShortMapRedirects('https://maps.app.goo.gl/e44dHead403', {
      maxHops: 3,
      timeoutMs: 3000,
      fetchImpl: async (_u, init = {}) => {
        e44d403Calls.push({ method: init.method });
        if (init.method === 'HEAD') return new Response(null, { status: 403 });
        return new Response(null, { status: 302, headers: { Location: 'https://www.google.com/maps?q=33.8555,35.5155' } });
      }
    });
    const e44dHeadUnitOk = (
      e44dHeadRes.ok === true && /33\.8938,35\.5018/.test(String(e44dHeadRes.resolvedUrl || '')) &&
      e44dHeadCalls.length === 1 && e44dHeadCalls[0].method === 'HEAD' &&
      e44d405Res.ok === true && /33\.8555,35\.5155/.test(String(e44d405Res.resolvedUrl || '')) &&
      e44d405Calls.length === 2 && e44d405Calls[0].method === 'HEAD' && e44d405Calls[1].method === 'GET' && e44d405Calls[1].range === 'bytes=0-0' &&
      e44d403Res.ok === false && e44d403Res.status === 422 && e44d403Calls.length === 1 && e44d403Calls[0].method === 'HEAD'
    );

    const e44dBadCoords = [
      { latitude: 0, longitude: 0 },
      { latitude: 999, longitude: 999 },
      { latitude: true, longitude: false }
    ];
    let e44dRecBad400 = true;
    let e44dIndBad400 = true;
    for (let bi = 0; bi < e44dBadCoords.length; bi++) {
      const bc = e44dBadCoords[bi];
      const rBad = await httpReq('POST', '/app/api/records', {
        table: 'sites',
        record: Object.assign({ id: `s_e44d_bad_${bi}`, name: `E44D_BAD_${bi}`, company: 'WTC', region: 'Beirut' }, bc)
      }, { 'X-ISABI-Session': ownerToken });
      if (rBad.status !== 400) e44dRecBad400 = false;
      const iBad = await httpReq('POST', '/app/api/industry_domain_store', {
        industryRowEdits: {
          [`Hospitality::Test::E44D_BAD_${bi}`]: Object.assign({ ind: 'Hospitality & Resorts', tableTitle: 'Test', primaryId: `E44D_BAD_${bi}`, company: 'Blanca', updated_at: new Date().toISOString() }, bc)
        }
      }, { 'X-ISABI-Session': ownerToken });
      if (iBad.status !== 400) e44dIndBad400 = false;
    }

    const e44dUnpinId = 's_44d_unpin';
    const e44dPinnedId = 's_44d_pinned';
    const e44dPinnedNm = '__E44D_PINNED__';
    const e44dHydPinId = 's_44d_hyd_pin';
    await httpReq('POST', '/app/api/records', {
      table: 'sites',
      record: { id: e44dUnpinId, name: '__E44D_UNPIN__', company: 'WTC', region: 'Choueifat', site_category: 'customer', voided: 0 }
    }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/records', {
      table: 'sites',
      record: { id: e44dPinnedId, name: e44dPinnedNm, company: 'WTC', region: 'Choueifat', site_category: 'customer', latitude: 33.891, longitude: 35.501, voided: 0 }
    }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/records', {
      table: 'sites',
      record: { id: e44dHydPinId, name: '__E44D_HYD_PIN__', company: 'WTC', region: 'Choueifat', site_category: 'customer', voided: 0 }
    }, { 'X-ISABI-Session': ownerToken });

    // Sales: initial pin + voided -> 403; initial pin + bundled flag change -> 403; initial pin + default client hydrated keys -> 200 without persisting _seed_orig/geo_zone; salaries -> 403; customers+GPS -> 403; new-ID dup sites overwrite -> 409/403
    const e44dSalesPinVoid403 = await httpReq('POST', '/app/api/records', {
      table: 'sites',
      record: { id: e44dUnpinId, name: '__E44D_UNPIN__', company: 'WTC', region: 'Choueifat', site_category: 'customer', latitude: 33.89, longitude: 35.50, voided: 1 }
    }, { 'X-ISABI-Session': salesToken });
    const e44dSalesHydSmuggle403 = await httpReq('POST', '/app/api/records', {
      table: 'sites',
      record: { id: e44dHydPinId, name: '__E44D_HYD_PIN__', company: 'WTC', region: 'Choueifat', site_category: 'customer', includes_transport: true, haulage_mode: 'supplier_delivered', latitude: 33.892, longitude: 35.502 }
    }, { 'X-ISABI-Session': salesToken });
    const e44dSalesHydOk200 = await httpReq('POST', '/app/api/records', {
      table: 'sites',
      record: { id: e44dHydPinId, name: '__E44D_HYD_PIN__', company: 'WTC', region: 'Choueifat', site_category: 'customer', includes_transport: false, haulage_mode: 'separate', geo_zone: 'Choueifat', _seed_orig: { id: e44dHydPinId }, latitude: 33.892, longitude: 35.502 }
    }, { 'X-ISABI-Session': salesToken });
    const e44dSitesGet = await httpReq('GET', '/app/api/records?table=sites&limit=5000', null, { 'X-ISABI-Session': ownerToken });
    const e44dHydRow = (e44dSitesGet.json?.rows || []).find(r => r && r.id === e44dHydPinId);
    const e44dSalesSal403 = await httpReq('POST', '/app/api/records', {
      table: 'salaries',
      record: { id: 'sal_44d_deny', company: 'WTC', staff: 'Test', net_usd: 100 }
    }, { 'X-ISABI-Session': salesToken });
    const e44dSalesCustGps403 = await httpReq('POST', '/app/api/records', {
      table: 'customers',
      record: { id: 'cust_44d_gps', name: 'Cust44dGps', company: 'WTC', latitude: 33.89, longitude: 35.50 }
    }, { 'X-ISABI-Session': salesToken });
    const e44dSalesDupSite = await httpReq('POST', '/app/api/records', {
      table: 'sites',
      record: { id: 's_44d_sales_dup', name: e44dPinnedNm, company: 'WTC', region: 'Choueifat', latitude: 33.82, longitude: 35.42 }
    }, { 'X-ISABI-Session': salesToken });

    // Entry: voided in /industry_domain_store (custom & edit) -> 403
    const e44dTs = new Date(Date.now() + 5000).toISOString();
    const e44dEntIndCustom403 = await httpReq('POST', '/app/api/industry_domain_store', {
      industryCustomRows: {
        mfg_custom: [{ id: 'ic_44d_ent_void', company: 'WTC', voided: true, updated_at: e44dTs }]
      }
    }, { 'X-ISABI-Session': entryToken });
    const e44dEntIndEdit403 = await httpReq('POST', '/app/api/industry_domain_store', {
      industryRowEdits: {
        'Manufacturing::WTC Register::ENT_44D_VOID': { ind: 'Manufacturing', tableTitle: 'WTC Register', primaryId: 'ENT_44D_VOID', company: 'WTC', voided: true, updated_at: e44dTs }
      }
    }, { 'X-ISABI-Session': entryToken });

    // /sync locks: seed base customRecords.sites row as Owner, then test Sales voided strip + salaries strip + Entry industry voided strip
    await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          customRecords: {
            sites: [{ id: e44dUnpinId, name: '__E44D_UNPIN__', company: 'WTC', region: 'Choueifat', voided: false, modified_at: new Date().toISOString() }]
          }
        }
      }
    }, { 'X-ISABI-Session': ownerToken });
    const e44dSyncTs = new Date(Date.now() + 10000).toISOString();
    await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          customRecords: {
            sites: [{ id: e44dUnpinId, name: '__E44D_UNPIN__', company: 'WTC', region: 'Choueifat', voided: true, modified_at: e44dSyncTs }],
            salaries: [{ id: 'sal_44d_sync_deny', company: 'WTC', staff: 'X', net_usd: 100, modified_at: e44dSyncTs }],
            customers: [{ id: 'cust_44d_sync_gps', name: 'Cust44dSync', company: 'WTC', latitude: 33.89, longitude: 35.50, modified_at: e44dSyncTs }]
          }
        }
      }
    }, { 'X-ISABI-Session': salesToken });
    await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          industryCustomRows: {
            mfg_custom: [{ id: 'ic_44d_sync_ent', company: 'WTC', voided: true, updated_at: e44dSyncTs }]
          },
          industryRowEdits: {
            'Manufacturing::WTC Register::ENT_44D_SYNC': { ind: 'Manufacturing', tableTitle: 'WTC Register', primaryId: 'ENT_44D_SYNC', company: 'WTC', voided: true, updated_at: e44dSyncTs }
          }
        }
      }
    }, { 'X-ISABI-Session': entryToken });
    const e44dSyncAfter = await httpReq('POST', '/app/api/sync', { op: 'get_mfg' }, { 'X-ISABI-Session': ownerToken });
    const e44dMfgDoc = e44dSyncAfter.json?.docs?.mfg_web_store || {};
    const e44dSyncSiteRow = ((e44dMfgDoc.customRecords && e44dMfgDoc.customRecords.sites) || []).find(x => x && x.id === e44dUnpinId);
    const e44dSyncSalDenied = !(((e44dMfgDoc.customRecords && e44dMfgDoc.customRecords.salaries) || []).some(x => x && x.id === 'sal_44d_sync_deny'));
    const e44dSyncCustRow = ((e44dMfgDoc.customRecords && e44dMfgDoc.customRecords.customers) || []).find(x => x && x.id === 'cust_44d_sync_gps');
    const e44dSyncCustNoGps = !e44dSyncCustRow || (e44dSyncCustRow.latitude == null && e44dSyncCustRow.longitude == null);
    const e44dSyncEntCustomRow = ((e44dMfgDoc.industryCustomRows && e44dMfgDoc.industryCustomRows.mfg_custom) || []).find(x => x && x.id === 'ic_44d_sync_ent');
    const e44dSyncEntEditRow = (e44dMfgDoc.industryRowEdits || {})['Manufacturing::WTC Register::ENT_44D_SYNC'];

    // Non-Owner geoIndStorePrefix RLS + pairKmOverrides bu: checks
    await httpReq('POST', '/app/api/users', {
      user: { id: 'u-blanca-sup', email: 'blanca.sup@bhfirms.com', full_name: 'Blanca Resort Supervisor', role: 'Supervisor + Entry', companies: 'Blanca', pin_code: '4927', status: 'Active' }
    }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/users', {
      user: { id: 'u-re-sup', email: 're4235.sup@bhfirms.com', full_name: '4235 Property Supervisor', role: 'Supervisor + Entry', companies: '4235 Company S.A.L', pin_code: '5839', status: 'Active' }
    }, { 'X-ISABI-Session': ownerToken });
    const blancaLogin44d = await httpReq('POST', '/app/api/auth/login', { email: 'blanca.sup@bhfirms.com', pin: '4927', method: 'PIN' });
    const blancaToken44d = String(blancaLogin44d.json?.token || '');
    const reLogin44d = await httpReq('POST', '/app/api/auth/login', { email: 're4235.sup@bhfirms.com', pin: '5839', method: 'PIN' });
    const reToken44d = String(reLogin44d.json?.token || '');

    const e44dBlancaKey = 'hospitality & resorts::customer:blanca_44d';
    const e44dLaUnaKey = 'hospitality & resorts::La Una:launa_44d';
    const e44dReKey = 'real estate & property::customer:re4235_44d';
    const e44dBlancaWrite = await httpReq('POST', '/app/api/geo_config', {
      sites: { [e44dBlancaKey]: { name: 'Blanca 44d', company: 'Blanca', latitude: 33.7654, longitude: 35.4456, updated_at: e44dSyncTs } }
    }, { 'X-ISABI-Session': blancaToken44d });
    const e44dBlancaLaUna403 = await httpReq('POST', '/app/api/geo_config', {
      sites: { [e44dLaUnaKey]: { name: 'La Una 44d', company: 'Blanca', latitude: 33.7654, longitude: 35.4456, updated_at: e44dSyncTs } }
    }, { 'X-ISABI-Session': blancaToken44d });
    const e44dReWrite = await httpReq('POST', '/app/api/geo_config', {
      sites: { [e44dReKey]: { name: 'RE 4235 44d', company: '4235 Company S.A.L', latitude: 33.8812, longitude: 35.5123, updated_at: e44dSyncTs } }
    }, { 'X-ISABI-Session': reToken44d });
    const e44dBlancaGet = await httpReq('GET', '/app/api/geo_config', null, { 'X-ISABI-Session': blancaToken44d });
    const e44dReGet = await httpReq('GET', '/app/api/geo_config', null, { 'X-ISABI-Session': reToken44d });
    const e44dLionsGet = await httpReq('GET', '/app/api/geo_config', null, { 'X-ISABI-Session': lionsToken });
    const e44dLionsPair403 = await httpReq('POST', '/app/api/geo_config', {
      pairKmOverrides: { 'bu:bbconstruction||site:test_44d': 8.4 }
    }, { 'X-ISABI-Session': lionsToken });

    // Clean up 44d test artifacts
    for (const vid of [e44dUnpinId, e44dPinnedId, e44dHydPinId]) {
      await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: vid, company: 'WTC', voided: 1 } }, { 'X-ISABI-Session': ownerToken }).catch(() => {});
    }
    const del44dTs = new Date(Date.now() + 60000).toISOString();
    await httpReq('POST', '/app/api/geo_config', {
      _deletedKeys: {
        [`sites:${e44dBlancaKey}`]: del44dTs,
        [`sites:${e44dReKey}`]: del44dTs
      }
    }, { 'X-ISABI-Session': ownerToken }).catch(() => {});
    await httpReq('POST', '/app/api/users', {
      user: { id: 'u-blanca-sup', email: 'blanca.sup@bhfirms.com', full_name: 'Blanca Resort Supervisor', role: 'Supervisor + Entry', companies: 'Blanca', status: 'Inactive' }
    }, { 'X-ISABI-Session': ownerToken }).catch(() => {});
    await httpReq('POST', '/app/api/users', {
      user: { id: 'u-re-sup', email: 're4235.sup@bhfirms.com', full_name: '4235 Property Supervisor', role: 'Supervisor + Entry', companies: '4235 Company S.A.L', status: 'Inactive' }
    }, { 'X-ISABI-Session': ownerToken }).catch(() => {});

    const e44dBlancaSites = (e44dBlancaGet.json?.config || e44dBlancaGet.json?.geoConfig)?.sites || {};
    const e44dReSites = (e44dReGet.json?.config || e44dReGet.json?.geoConfig)?.sites || {};
    const e44dLionsSites = (e44dLionsGet.json?.config || e44dLionsGet.json?.geoConfig)?.sites || {};
    const e44dHydPinOk = Boolean(
      e44dSalesHydSmuggle403.status === 403 &&
      e44dSalesHydOk200.status === 200 &&
      e44dHydRow &&
      Math.abs(Number(e44dHydRow.latitude) - 33.892) < 1e-4 &&
      Math.abs(Number(e44dHydRow.longitude) - 35.502) < 1e-4 &&
      e44dHydRow._seed_orig === undefined &&
      e44dHydRow.geo_zone === undefined
    );
    const e44dOk = (
      e44dHeadUnitOk &&
      e44dRecBad400 &&
      e44dIndBad400 &&
      e44dSalesPinVoid403.status === 403 &&
      e44dHydPinOk &&
      e44dSalesSal403.status === 403 &&
      e44dSalesCustGps403.status === 403 &&
      (e44dSalesDupSite.status === 409 || e44dSalesDupSite.status === 403) &&
      e44dEntIndCustom403.status === 403 &&
      e44dEntIndEdit403.status === 403 &&
      Boolean(e44dSyncSiteRow && !e44dSyncSiteRow.voided) &&
      e44dSyncSalDenied &&
      e44dSyncCustNoGps &&
      (!e44dSyncEntCustomRow || !e44dSyncEntCustomRow.voided) &&
      (!e44dSyncEntEditRow || !e44dSyncEntEditRow.voided) &&
      e44dBlancaWrite.status === 200 &&
      e44dBlancaLaUna403.status === 403 &&
      Boolean(e44dBlancaSites[e44dBlancaKey]) &&
      e44dReWrite.status === 200 &&
      Boolean(e44dReSites[e44dReKey]) &&
      !(e44dLionsSites[e44dBlancaKey]) &&
      !(e44dLionsSites[e44dReKey]) &&
      e44dLionsPair403.status === 403
    );
    if (e44dOk) {
      pass('edge-44d-gate3-remediation-parity', 'HEAD-first+405/403 unit, (0,0)/(999,999)/bool=400, Sales/Entry void+create+GPS+dup blocked/stripped across /records+/industry_domain_store+/sync, non-Owner Blanca/4235 geo RLS & bu: pairKmOverrides=403');
    } else {
      fail('edge-44d-gate3-remediation-parity', JSON.stringify({
        headUnit: e44dHeadUnitOk,
        headCalls: e44dHeadCalls,
        c405Calls: e44d405Calls,
        c403Calls: e44d403Calls,
        recBad400: e44dRecBad400,
        indBad400: e44dIndBad400,
        salesStatuses: [e44dSalesPinVoid403.status, e44dSalesHydSmuggle403.status, e44dSalesHydOk200.status, e44dSalesSal403.status, e44dSalesCustGps403.status, e44dSalesDupSite.status],
        hydPinRow: e44dHydRow ? { lat: e44dHydRow.latitude, seedOrig: e44dHydRow._seed_orig !== undefined, geoZone: e44dHydRow.geo_zone !== undefined } : null,
        entryStatuses: [e44dEntIndCustom403.status, e44dEntIndEdit403.status],
        syncChecks: { siteVoid: e44dSyncSiteRow?.voided, salDenied: e44dSyncSalDenied, custNoGps: e44dSyncCustNoGps, entC: e44dSyncEntCustomRow?.voided, entE: e44dSyncEntEditRow?.voided },
        geoStatuses: [e44dBlancaWrite.status, e44dBlancaLaUna403.status, e44dReWrite.status, e44dLionsPair403.status],
        geoGets: {
          blancaHas: Boolean(e44dBlancaSites[e44dBlancaKey]),
          reHas: Boolean(e44dReSites[e44dReKey]),
          lionsBlanca: Boolean(e44dLionsSites[e44dBlancaKey]),
          lionsRe: Boolean(e44dLionsSites[e44dReKey])
        }
      }));
    }

    // E45: Google Maps 2D Tiles + Places proxy endpoints
    const e45UnauthTile = await httpReq('GET', '/app/api/map-tiles/roadmap/en/15/19614/13318');
    const e45CrossSiteTile = await httpReq('GET', '/app/api/map-tiles/roadmap/en/15/19614/13318?demo=1', null, {
      'Sec-Fetch-Site': 'cross-site',
      Referer: `http://127.0.0.1:${PORT}/app/`
    });
    const e45DemoTileRef = await httpReq('GET', '/app/api/map-tiles/roadmap/en/15/19614/13318?demo=1', null, {
      Referer: `http://127.0.0.1:${PORT}/app/`
    });
    const e45DemoTileSec = await httpReq('GET', '/app/api/map-tiles/roadmap/en/15/19614/13318?demo=1', null, {
      'Sec-Fetch-Site': 'same-origin'
    });
    const e45AuthedHybrid = await httpReq('GET', '/app/api/map-tiles/hybrid/ar/15/19614/13318', null, {
      'X-ISABI-Session': ownerToken
    });
    const e45BadZoom = await httpReq('GET', '/app/api/map-tiles/roadmap/en/21/0/0', null, {
      'X-ISABI-Session': ownerToken
    });
    const e45PostTile = await httpReq('POST', '/app/api/map-tiles/roadmap/en/15/19614/13318', {}, {
      'X-ISABI-Session': ownerToken
    });
    const e45UnauthPlaces = await httpReq('POST', '/app/api/map-places', { query: 'Al Ahed' });
    const e45UnauthMalformed = await fetch(`http://127.0.0.1:${PORT}/app/api/map-places`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad-json'
    });
    const e45BareSecPlaces = await httpReq('POST', '/app/api/map-places', { query: 'Al Ahed' }, {
      'X-ISABI-Demo': '1',
      'Sec-Fetch-Site': 'same-origin'
    });
    const e45DemoPlaces = await httpReq('POST', '/app/api/map-places', { query: 'Al Ahed', lang: 'en' }, {
      'X-ISABI-Demo': '1',
      Origin: `http://127.0.0.1:${PORT}`
    });
    const e45AuthedPlaces = await httpReq('POST', '/app/api/map-places', { query: 'Al Ahed', lang: 'ar' }, {
      'X-ISABI-Session': ownerToken
    });
    const e45Ok = (
      e45UnauthTile.status === 401
      && e45CrossSiteTile.status === 403
      && e45DemoTileRef.status === 200
      && /^image\/png/i.test(String(e45DemoTileRef.headers['content-type'] || ''))
      && e45DemoTileRef.buf && e45DemoTileRef.buf.length > 20
      && e45DemoTileSec.status === 200
      && e45AuthedHybrid.status === 200
      && /^image\/jpeg/i.test(String(e45AuthedHybrid.headers['content-type'] || ''))
      && e45AuthedHybrid.headers['cache-control'] === 'private, max-age=2592000'
      && e45BadZoom.status === 400
      && e45PostTile.status === 405
      && e45UnauthPlaces.status === 401
      && e45UnauthMalformed.status === 401
      && e45BareSecPlaces.status === 403
      && e45DemoPlaces.status === 200 && e45DemoPlaces.json?.places?.[0]?.name === 'Al Ahed Stadium'
      && e45AuthedPlaces.status === 200 && e45AuthedPlaces.json?.places?.[0]?.name === 'Al Ahed Stadium'
    );
    if (e45Ok) {
      pass('edge-45-google-maps-proxy', 'Tiles 401/403/200 (PNG + hybrid JPEG, 30-day cache) + zoom/method guards + Places 401/403/200');
    } else {
      fail('edge-45-google-maps-proxy', JSON.stringify({
        t401: e45UnauthTile.status,
        t403: e45CrossSiteTile.status,
        tDemoRef: [e45DemoTileRef.status, e45DemoTileRef.headers['content-type'], e45DemoTileRef.buf?.length],
        tDemoSec: e45DemoTileSec.status,
        tHyb: [e45AuthedHybrid.status, e45AuthedHybrid.headers['content-type'], e45AuthedHybrid.headers['cache-control']],
        tBadZoom: e45BadZoom.status,
        tPost: e45PostTile.status,
        pUnauth: e45UnauthPlaces.status,
        pBadJson: e45UnauthMalformed.status,
        pBareSec: e45BareSecPlaces.status,
        pDemo: [e45DemoPlaces.status, e45DemoPlaces.json],
        pAuth: [e45AuthedPlaces.status, e45AuthedPlaces.json]
      }));
    }

    // E46: Single-use QR HR ID card handoff + 3-scan smart-scan cap + consume tombstone + 8 HR fields persistence in D1
    const psSid46 = 'psid46_' + Date.now();
    const psTok46 = 'tok46_' + Math.random().toString(16).slice(2, 12);
    const e46UnauthInit = await httpReq('POST', '/app/api/phone-scan', {
      sid: psSid46, k: psTok46, op: 'init_id_card', company: 'WTC'
    });
    const e46AuthInit = await httpReq('POST', '/app/api/phone-scan', {
      sid: psSid46, k: psTok46, op: 'init_id_card', company: 'WTC'
    }, { 'X-ISABI-Session': ownerToken });
    const e46SmartBody = {
      scanMode: 'id_card',
      phoneScanSid: psSid46,
      phoneScanTok: psTok46,
      company: 'WTC',
      extractedText: 'Lebanese ID\nNSSF: 882190\nWork Permit: WP-7722\nExpiry: 2026-12-15\nMother: Salwa Karam'
    };
    const e46Scan1 = await httpReq('POST', '/app/api/smart-scan', e46SmartBody);
    const e46Scan2 = await httpReq('POST', '/app/api/smart-scan', e46SmartBody);
    const e46Scan3 = await httpReq('POST', '/app/api/smart-scan', e46SmartBody);
    const e46Scan4 = await httpReq('POST', '/app/api/smart-scan', e46SmartBody);
    const e46Complete = await httpReq('POST', '/app/api/phone-scan', {
      sid: psSid46,
      k: psTok46,
      op: 'complete_id_card',
      extracted: { fullNameLatin: 'Edge HR Test', nssfNumber: '882190', workPermitNumber: 'WP-7722', motherNameLatin: 'Salwa Karam' },
      pages: [{ id: 'p1', mimeType: 'image/png', dataUrl: tinyPngDataUrl }]
    });
    const e46WrongTok = await httpReq('GET', `/app/api/phone-scan?sid=${psSid46}&k=wrongtok`);
    const e46GoodPoll = await httpReq('GET', `/app/api/phone-scan?sid=${psSid46}&k=${psTok46}`);
    const e46Consume = await httpReq('POST', '/app/api/phone-scan', { sid: psSid46, k: psTok46, op: 'consume' });
    const e46ReplayGet = await httpReq('GET', `/app/api/phone-scan?sid=${psSid46}&k=${psTok46}`);
    const e46ReplayComp = await httpReq('POST', '/app/api/phone-scan', {
      sid: psSid46, k: psTok46, op: 'complete_id_card', extracted: { fullNameLatin: 'Replay' }
    });
    const e46ReplayScan = await httpReq('POST', '/app/api/smart-scan', e46SmartBody);
    const e46StaffId = 'sm_edge46_' + Date.now();
    const e46StaffPost = await httpReq('POST', '/app/api/records', {
      table: 'staff_members',
      record: {
        id: e46StaffId,
        name: 'Edge HR Compliance Test',
        company: 'WTC',
        role: 'Operator',
        status: 'Active',
        nssf_no: '882190',
        id_expiry_date: '2028-04-01',
        work_permit_no: 'WP-7722',
        work_permit_expiry: '2026-12-15',
        residency_no: 'RES-9901',
        residency_expiry: '2027-06-01',
        mother_name: 'Salwa Karam',
        mother_name_ar: 'سلوى كرم'
      }
    }, { 'X-ISABI-Session': ownerToken });
    const e46StaffGet = await httpReq('GET', '/app/api/records?table=staff_members&company=WTC&limit=5000', null, {
      'X-ISABI-Session': ownerToken
    });
    const e46Saved = (e46StaffGet.json?.rows || []).find(r => r && r.id === e46StaffId);
    const e46Ok = (
      e46UnauthInit.status === 401
      && e46AuthInit.status === 200
      && e46Scan1.status === 200 && e46Scan2.status === 200 && e46Scan3.status === 200
      && e46Scan4.status === 429
      && e46Complete.status === 200
      && e46WrongTok.json?.found === false
      && e46GoodPoll.status === 200 && e46GoodPoll.json?.found === true && e46GoodPoll.json?.session?.extracted?.nssfNumber === '882190'
      && e46Consume.status === 200
      && (e46ReplayGet.status === 403 || (e46ReplayGet.status === 200 && e46ReplayGet.json?.session?.status === 'consumed' && e46ReplayGet.json?.session?.consumed === true))
      && !e46ReplayGet.json?.session?.extracted && (!e46ReplayGet.json?.session?.pages || e46ReplayGet.json.session.pages.length === 0)
      && e46ReplayComp.status === 403
      && e46ReplayScan.status === 403
      && e46StaffPost.status === 200
      && e46Saved?.nssf_no === '882190'
      && e46Saved?.id_expiry_date === '2028-04-01'
      && e46Saved?.work_permit_no === 'WP-7722'
      && e46Saved?.work_permit_expiry === '2026-12-15'
      && e46Saved?.residency_no === 'RES-9901'
      && e46Saved?.residency_expiry === '2027-06-01'
      && e46Saved?.mother_name === 'Salwa Karam'
      && e46Saved?.mother_name_ar === 'سلوى كرم'
    );
    if (e46Ok) {
      pass('edge-46-hr-phone-id-card-and-schema', 'init_id_card 401/200 + smart-scan 3-scan limit + consume 403 replay PII scrub + 8 HR fields persisted');
    } else {
      fail('edge-46-hr-phone-id-card-and-schema', JSON.stringify({
        statuses: [e46UnauthInit.status, e46AuthInit.status, e46Scan1.status, e46Scan2.status, e46Scan3.status, e46Scan4.status, e46Complete.status, e46GoodPoll.status, e46Consume.status, e46ReplayGet.status, e46ReplayComp.status, e46ReplayScan.status, e46StaffPost.status],
        e46ReplayGet: e46ReplayGet.json,
        e46Saved
      }));
    }

    // 44e. Map-Write Controls Across All 6 Verticals & Roles (/geo_config, /records, /industry_domain_store, /sync, 400 validation)
    const e44eUsers = [
      { id: 'u-44e-viewer', email: 'viewer.44e@bhfirms.com', full_name: 'Viewer 44e', role: 'Viewer', companies: 'All', pin_code: '4719', status: 'Active' },
      { id: 'u-44e-disp', email: 'disp.44e@bhfirms.com', full_name: 'Dispatch 44e', role: 'Custom', companies: 'All', pin_code: '4721', status: 'Active', custom_perms: { rights: { read_ops: true, enter_dispatch: true, modify_data: true } } },
      { id: 'u-44e-words', email: 'words.44e@bhfirms.com', full_name: 'Words 44e', role: 'Custom', companies: 'WTC', pin_code: '4722', status: 'Active', custom_perms: { rights: { read_ops: true, modify_text: true, modify_data: false } } },
      { id: 'u-44e-wtc-se', email: 'wtcse.44e@bhfirms.com', full_name: 'WTC SupEntry 44e', role: 'Supervisor + Entry', companies: 'WTC', pin_code: '4723', status: 'Active' },
      { id: 'u-44e-supall', email: 'supall.44e@bhfirms.com', full_name: 'SupAll 44e', role: 'Supervisor', companies: 'All', pin_code: '4724', status: 'Active' },
      { id: 'u-44e-blanca-se', email: 'blancase.44e@bhfirms.com', full_name: 'Blanca SupEntry 44e', role: 'Supervisor + Entry', companies: 'Blanca', pin_code: '4725', status: 'Active' },
      { id: 'u-44e-sales', email: 'sales.44e@bhfirms.com', full_name: 'Sales 44e', role: 'Sales', companies: 'WTC', pin_code: '4726', status: 'Active' },
      { id: 'u-44e-bbc-se', email: 'bbcse.44e@bhfirms.com', full_name: 'BBC SupEntry 44e', role: 'Supervisor + Entry', companies: 'BBConstruction', pin_code: '4727', status: 'Active' },
      { id: 'u-44e-hld', email: 'hld.44e@bhfirms.com', full_name: 'Hld 44e', role: 'Supervisor + Entry', companies: 'Bdeir Holding', pin_code: '4729', status: 'Active' },
      { id: 'u-44e-ins', email: 'ins.44e@bhfirms.com', full_name: 'Ins 44e', role: 'Supervisor + Entry', companies: 'Insurance Company', pin_code: '4730', status: 'Active' },
      { id: 'u-44e-co12', email: 'co12.44e@bhfirms.com', full_name: 'Co12 44e', role: 'Supervisor + Entry', companies: 'WTC, BBConstruction, Lions Transport, Bdeir Holding, Blanca, Palms, Voile, Platinum, Korri Auto, Shacman, Properties, 4235 Company S.A.L', pin_code: '4728', status: 'Active' },
      { id: 'u-44e-noent', email: 'noent.44e@bhfirms.com', full_name: 'NoEnt 44e', role: 'Custom', companies: 'WTC', pin_code: '4731', status: 'Active', custom_perms: { rights: { read_ops: true, modify_data: true } } }
    ];
    for (const u of e44eUsers) {
      await httpReq('POST', '/app/api/users', { user: u }, { 'X-ISABI-Session': ownerToken });
    }
    const e44eTok = {};
    for (const u of e44eUsers) {
      const lr = await httpReq('POST', '/app/api/auth/login', { email: u.email, pin: u.pin_code, method: 'PIN' });
      e44eTok[u.id] = String(lr.json?.token || '');
    }
    const viewer44e = e44eTok['u-44e-viewer'];
    const disp44e = e44eTok['u-44e-disp'];
    const words44e = e44eTok['u-44e-words'];
    const wtcSe44e = e44eTok['u-44e-wtc-se'];
    const supAll44e = e44eTok['u-44e-supall'];
    const blancaSe44e = e44eTok['u-44e-blanca-se'];
    const sales44e = e44eTok['u-44e-sales'];
    const bbcSe44e = e44eTok['u-44e-bbc-se'];
    const hld44e = e44eTok['u-44e-hld'];
    const ins44e = e44eTok['u-44e-ins'];
    const co12_44e = e44eTok['u-44e-co12'];
    const noent44e = e44eTok['u-44e-noent'];

    // Seed baseline records for 44e
    const e44ePinnedWtcId = 's_44e_pinned_wtc';
    const e44ePinnedBbcId = 's_44e_pinned_bbc';
    const e44eUnpinWtcId = 's_44e_unpin_wtc';
    const e44eUnpinAliasId = 's_44e_unpin_alias';
    const e44eClearedWtcId = 's_44e_cleared_wtc';
    const e44eShapedRegId = 'r_44e_shaped';
    const e44eVoidSiteId = 's_44e_void_target';
    const e44eVoidRegId = 'r_44e_void_target';
    const e44eNoRegSiteId = 's_44e_unpin_noreg';
    const e44eRegOnlySiteId = 's_44e_regonly';
    const e44eRegOnly2SiteId = 's_44e_regonly2';
    const e44eDbRegSiteId = 's_44e_dbreg';
    const e44eTs0 = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44ePinnedWtcId, name: '__E44E_PINNED_WTC__', company: 'WTC', region: 'Beirut', site_category: 'customer', latitude: 33.8911, longitude: 35.5011, entered_by: 'husseinbdeir@bhfirms.com', entered_at: e44eTs0, voided: 0 } }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44ePinnedBbcId, name: '__E44E_PINNED_BBC__', company: 'BBConstruction', region: 'Beirut', site_category: 'customer', latitude: 33.8922, longitude: 35.5022, entered_by: 'husseinbdeir@bhfirms.com', entered_at: e44eTs0, voided: 0 } }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44eUnpinWtcId, name: '__E44E_UNPIN_WTC__', company: 'WTC', region: 'Beirut', notes: 'keep-44e', site_category: 'customer', entered_by: 'husseinbdeir@bhfirms.com', entered_at: e44eTs0, voided: 0 } }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44eUnpinAliasId, name: '__E44E_UNPIN_ALIAS__', company: 'WTC', region: 'Beirut', site_category: 'customer', entered_by: 'husseinbdeir@bhfirms.com', entered_at: e44eTs0, voided: 0 } }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44eClearedWtcId, name: '__E44E_CLEARED_WTC__', company: 'WTC', region: 'Beirut', site_category: 'customer', _pinCleared: true, entered_by: 'husseinbdeir@bhfirms.com', entered_at: e44eTs0, voided: 0 } }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44eVoidSiteId, name: '__E44E_VOID_SITE__', company: 'WTC', region: 'Beirut', latitude: 33.8933, longitude: 35.5033, voided: 0 } }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44eNoRegSiteId, name: '__E44E_NOREG_WTC__', company: 'WTC', region: '', site_category: 'customer', entered_by: 'husseinbdeir@bhfirms.com', entered_at: e44eTs0, voided: 0 } }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44eRegOnlySiteId, name: '__E44E_REGONLY__', company: 'WTC', region: 'Choueifat', site_category: 'customer', entered_by: 'husseinbdeir@bhfirms.com', entered_at: e44eTs0, voided: 0 } }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44eRegOnly2SiteId, name: '__E44E_REGONLY2__', company: 'WTC', region: 'Choueifat', notes: 'keep-ro2', site_category: 'customer', entered_by: 'husseinbdeir@bhfirms.com', entered_at: e44eTs0, voided: 0 } }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44eDbRegSiteId, name: '__E44E_DBREG__', company: 'WTC', region: 'Choueifat', site_category: 'customer', entered_by: 'husseinbdeir@bhfirms.com', entered_at: e44eTs0, voided: 0 } }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/records', { table: 'regions', record: { id: e44eShapedRegId, name: '__E44E_SHAPED_REG__', corridor: 'Mount Lebanon', zone_type: 'circle', center_lat: 33.855, center_lng: 35.515, radius_km: 2.5, distance_km: 8.5, entered_by: 'husseinbdeir@bhfirms.com', entered_at: e44eTs0, voided: 0 } }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/records', { table: 'regions', record: { id: e44eVoidRegId, name: '__E44E_VOID_REG__', corridor: 'Mount Lebanon', zone_type: 'circle', center_lat: 33.856, center_lng: 35.516, radius_km: 1.8, distance_km: 12.4, voided: 0 } }, { 'X-ISABI-Session': ownerToken });
    const e44eNow = new Date().toISOString();
    await httpReq('POST', '/app/api/geo_config', {
      sites: {
        'customer:__e44e_pinned_wtc__': { name: '__E44E_PINNED_WTC__', company: 'WTC', latitude: 33.8911, longitude: 35.5011, updated_at: e44eTs0 },
        'customer:__e44e_pinned_bbc__': { name: '__E44E_PINNED_BBC__', company: 'BBConstruction', latitude: 33.8922, longitude: 35.5022, updated_at: e44eTs0 },
        'customer:__e44e_regonly__': { name: '__E44E_REGONLY__', company: 'WTC', region: 'Choueifat', updated_at: e44eTs0 },
        'customer:__e44e_regonly2__': { name: '__E44E_REGONLY2__', company: 'WTC', region: 'Choueifat', updated_at: e44eTs0 },
        '__e44e_geoonly_pin__': { name: '__E44E_GEOONLY_PIN__', company: 'WTC', region: 'Beirut', latitude: 33.8919, longitude: 35.5019, updated_at: e44eTs0 },
        '__e44e_geoonly_clr__': { name: '__E44E_GEOONLY_CLR__', company: 'WTC', region: 'Beirut', _pinCleared: true, updated_at: e44eTs0 }
      },
      regions: {
        '__e44e_shaped_reg__': { name: '__E44E_SHAPED_REG__', zone_type: 'circle', center_lat: 33.855, center_lng: 35.515, radius_km: 2.5, updated_at: e44eTs0 },
        '__e44e_geoonly_reg__': { name: '__E44E_GEOONLY_REG__', zone_type: 'circle', center_lat: 33.854, center_lng: 35.514, radius_km: 1.9, updated_at: e44eTs0 }
      }
    }, { 'X-ISABI-Session': ownerToken });

    // A: Read-only & non-geo roles (Supervisor, Viewer, Dispatch-only Custom, Words-Only) -> 403 on geo_config & records/domain GPS+zone mutations
    const e44eNonGeoTokens = [
      { tok: supAll44e, name: 'sup' },
      { tok: viewer44e, name: 'viewer' },
      { tok: disp44e, name: 'disp' },
      { tok: words44e, name: 'words' }
    ];
    let e44eNonGeoBlockedAll = true;
    const e44eNonGeoFails = [];
    for (const nt of e44eNonGeoTokens) {
      const r1 = await httpReq('POST', '/app/api/geo_config', { companyHubs: { wtc: { lat: 33.891, lng: 35.501, updated_at: e44eNow } } }, { 'X-ISABI-Session': nt.tok });
      const r2 = await httpReq('POST', '/app/api/geo_config', { sites: { 'customer:__e44e_unpin_wtc__': { name: '__E44E_UNPIN_WTC__', company: 'WTC', latitude: 33.881, longitude: 35.491, updated_at: e44eNow } } }, { 'X-ISABI-Session': nt.tok });
      const r3 = await httpReq('POST', '/app/api/geo_config', { regions: { '__e44e_shaped_reg__': { name: '__E44E_SHAPED_REG__', zone_type: 'circle', center_lat: 33.859, center_lng: 35.519, radius_km: 3.1, updated_at: e44eNow } } }, { 'X-ISABI-Session': nt.tok });
      const r4 = await httpReq('POST', '/app/api/geo_config', { pairKmOverrides: { 'bu:WTC||site:__E44E_PINNED_WTC__': 9.5 } }, { 'X-ISABI-Session': nt.tok });
      const r5 = await httpReq('POST', '/app/api/geo_config', { _deletedKeys: { 'sites:customer:__e44e_pinned_wtc__': e44eNow } }, { 'X-ISABI-Session': nt.tok });
      const r6 = await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44ePinnedWtcId, name: '__E44E_PINNED_WTC__', company: 'WTC', latitude: 33.8999, longitude: 35.5099 } }, { 'X-ISABI-Session': nt.tok });
      const r7 = await httpReq('POST', '/app/api/records', { table: 'regions', record: { id: e44eShapedRegId, name: '__E44E_SHAPED_REG__', zone_type: 'circle', center_lat: 33.861, center_lng: 35.521, radius_km: 4.0 } }, { 'X-ISABI-Session': nt.tok });
      const r8 = await httpReq('POST', '/app/api/industry_domain_store', {
        industryRowEdits: { 'Hospitality::Venues::V44E': { ind: 'Hospitality & Resorts', company: 'Blanca', primaryId: 'V44E', latitude: 33.765, longitude: 35.445, rev: 1, updated_at: e44eNow } }
      }, { 'X-ISABI-Session': nt.tok });
      const statuses = [r1.status, r2.status, r3.status, r4.status, r5.status, r6.status, r7.status, r8.status];
      if (!statuses.every(st => st === 403)) {
        e44eNonGeoBlockedAll = false;
        e44eNonGeoFails.push({ name: nt.name, statuses });
      }
    }

    // B: Supervisor sparse pure-void on pinned site & shaped region -> 200 preserving GPS & REGION_ZONE_KEYS (incl. distance_km)
    const e44eSupVoidSite = await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44eVoidSiteId, company: 'WTC', voided: 1, void_reason: '44e void test' } }, { 'X-ISABI-Session': supAll44e });
    const e44eSupVoidRegTamper403 = await httpReq('POST', '/app/api/records', { table: 'regions', record: { id: e44eVoidRegId, voided: 1, distance_km: 999, void_reason: '44e void tamper' } }, { 'X-ISABI-Session': supAll44e });
    const e44eSupVoidReg = await httpReq('POST', '/app/api/records', { table: 'regions', record: { id: e44eVoidRegId, voided: 1, void_reason: '44e void test' } }, { 'X-ISABI-Session': supAll44e });
    const e44eSupRestoreSite200 = await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44eVoidSiteId, voided: 0, restored_at: e44eNow } }, { 'X-ISABI-Session': supAll44e });
    const e44eSupRestoreSiteRow = ((await httpReq('GET', '/app/api/records?table=sites&limit=5000', null, { 'X-ISABI-Session': ownerToken })).json?.rows || []).find(r => r && r.id === e44eVoidSiteId);
    await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44eVoidSiteId, voided: 1, void_reason: '44e re-void' } }, { 'X-ISABI-Session': supAll44e });
    const e44eDispDist403 = await httpReq('POST', '/app/api/records', { table: 'regions', record: { id: e44eShapedRegId, name: '__E44E_SHAPED_REG__', distance_km: 777 } }, { 'X-ISABI-Session': disp44e });
    const e44eDispSal403 = await httpReq('POST', '/app/api/records', { table: 'salaries', record: { id: 'sal_44e_disp_deny', company: 'WTC', staff: 'Denied 44e', amount: 100 } }, { 'X-ISABI-Session': disp44e });
    const e44eNoentExp403 = await httpReq('POST', '/app/api/records', { table: 'expenses', record: { id: 'exp_44e_noent_deny', company: 'WTC', amount: 50 } }, { 'X-ISABI-Session': noent44e });
    const e44eNoentSal403 = await httpReq('POST', '/app/api/records', { table: 'salaries', record: { id: 'sal_44e_noent_deny', company: 'WTC', staff: 'NoEnt Denied', amount: 100 } }, { 'X-ISABI-Session': noent44e });
    const e44eSitesVoidChk = await httpReq('GET', '/app/api/records?table=sites&limit=5000', null, { 'X-ISABI-Session': ownerToken });
    const e44eVoidedSiteRow = (e44eSitesVoidChk.json?.rows || []).find(r => r && r.id === e44eVoidSiteId);
    const e44eRegsVoidChk = await httpReq('GET', '/app/api/records?table=regions&limit=5000', null, { 'X-ISABI-Session': ownerToken });
    const e44eVoidedRegRow = (e44eRegsVoidChk.json?.rows || []).find(r => r && r.id === e44eVoidRegId);

    // C: Words-Only text edit on sites & regions -> 200 preserving GPS & zone; /sync strips tampered GPS, distance_km & unpermitted rows
    const e44eWordsSiteTxt = await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44ePinnedWtcId, name: '__E44E_PINNED_WTC__', company: 'WTC', region: 'Beirut', site_category: 'customer', notes: 'Words 44e site note', latitude: 33.8911, longitude: 35.5011, voided: 0 } }, { 'X-ISABI-Session': words44e });
    const e44eWordsRegTxt = await httpReq('POST', '/app/api/records', { table: 'regions', record: { id: e44eShapedRegId, name: '__E44E_SHAPED_REG__', corridor: 'Mount Lebanon', notes: 'Words 44e reg note', zone_type: 'circle', center_lat: 33.855, center_lng: 35.515, radius_km: 2.5, voided: 0 } }, { 'X-ISABI-Session': words44e });
    const e44eSyncRead0 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const e44eDoc0 = JSON.parse(JSON.stringify(e44eSyncRead0.json?.docs?.mfg_web_store || {}));
    const e44eSyncTs1 = new Date(Math.max(Date.now() + 2000, Date.parse(e44eDoc0.updatedAt || 0) + 1000)).toISOString();
    await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'mfg_web_store', ifMatchUpdatedAt: String(e44eDoc0.updatedAt || ''), awaitMirror: true,
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: e44eSyncTs1,
          customRecords: Object.assign({}, e44eDoc0.customRecords || {}, {
            regions: (e44eDoc0.customRecords?.regions || []).filter(x => x && x.id !== e44eShapedRegId).concat([
              { id: e44eShapedRegId, name: '__E44E_SHAPED_REG__', corridor: 'Mount Lebanon', zone_type: 'circle', center_lat: 33.855, center_lng: 35.515, radius_km: 2.5, distance_km: 8.5, voided: false, rev: 1 }
            ])
          })
        }
      }
    }, { 'X-ISABI-Session': ownerToken });
    const e44eSyncTs1b = new Date(Date.parse(e44eSyncTs1) + 500).toISOString();
    await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: e44eSyncTs1b,
          customRecords: {
            regions: [{ id: e44eShapedRegId, name: '__E44E_SHAPED_REG__', corridor: 'Mount Lebanon', zone_type: 'circle', center_lat: 33.855, center_lng: 35.515, radius_km: 2.5, distance_km: 777, voided: false, rev: 2 }]
          }
        }
      }
    }, { 'X-ISABI-Session': disp44e });
    const e44eSyncTs2 = new Date(Date.parse(e44eSyncTs1) + 1000).toISOString();
    await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: e44eSyncTs2,
          customRecords: Object.assign({}, e44eDoc0.customRecords || {}, {
            regions: (e44eDoc0.customRecords?.regions || []).filter(x => x && x.id !== e44eShapedRegId).concat([
              { id: e44eShapedRegId, name: '__E44E_SHAPED_REG__', corridor: 'Mount Lebanon', notes: 'Tampered Words Sync', zone_type: 'circle', center_lat: 34.111, center_lng: 35.777, radius_km: 9.9, distance_km: 999, voided: false, rev: 3 }
            ])
          }),
          industryCustomRows: { mfg_custom: [{ id: 'ic_44e_words_sync_deny', company: 'WTC', name: 'Denied Sync 44e' }] }
        }
      }
    }, { 'X-ISABI-Session': words44e });
    const e44eSyncTs3 = new Date(Date.parse(e44eSyncTs1) + 1500).toISOString();
    await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: e44eSyncTs3,
          customRecords: { expenses: [{ id: 'exp_44e_noent_sync', company: 'WTC', amount: 55 }], salaries: [{ id: 'sal_44e_noent_sync', company: 'WTC', staff: 'NoEnt Denied', amount: 88 }] }
        }
      }
    }, { 'X-ISABI-Session': noent44e });
    const e44eSyncVerify = (await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken })).json?.docs?.mfg_web_store || {};
    const e44eSyncRegAfter = (e44eSyncVerify.customRecords?.regions || []).find(x => x && x.id === e44eShapedRegId);
    const e44eWordsSyncDrop = !(e44eSyncVerify.industryCustomRows?.mfg_custom || []).some(r => r && r.id === 'ic_44e_words_sync_deny');
    const e44eNoentSyncDrop = !(e44eSyncVerify.customRecords?.expenses || []).some(r => r && r.id === 'exp_44e_noent_sync') && !(e44eSyncVerify.customRecords?.salaries || []).some(r => r && r.id === 'sal_44e_noent_sync');

    // D: Entry -> 200 on new site + geo_config.sites, initial missing-pin fill + geo_config.sites, new region + geo_config.regions; 403 on hubs, pairKm, _deletedKeys, repin existing/cleared site, edit existing region
    const e44eEntNewSiteId = 's_44e_ent_new';
    const e44eEntNewRegId = 'r_44e_ent_new';
    const e44eEntNewSite = await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44eEntNewSiteId, name: '__E44E_ENT_NEW__', company: 'WTC', region: 'Beirut', site_category: 'customer', latitude: 33.8711, longitude: 35.4911, voided: 0 } }, { 'X-ISABI-Session': entryToken });
    const e44eEntNewSiteGeo = await httpReq('POST', '/app/api/geo_config', { sites: { 'customer:__e44e_ent_new__': { name: '__E44E_ENT_NEW__', company: 'WTC', latitude: 33.8711, longitude: 35.4911, updated_at: e44eNow } } }, { 'X-ISABI-Session': entryToken });
    const e44eEntMissingRec = await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44eUnpinWtcId, name: '__E44E_UNPIN_WTC__', company: 'WTC', region: 'Beirut', site_category: 'customer', latitude: 33.8722, longitude: 35.4922, voided: 0 } }, { 'X-ISABI-Session': entryToken });
    const e44eEntMissingGeo = await httpReq('POST', '/app/api/geo_config', { sites: { 'customer:__e44e_unpin_wtc__': { name: '__E44E_UNPIN_WTC__', company: 'WTC', latitude: 33.8722, longitude: 35.4922, updated_at: e44eNow } } }, { 'X-ISABI-Session': entryToken });
    const e44eEntNewReg = await httpReq('POST', '/app/api/records', { table: 'regions', record: { id: e44eEntNewRegId, name: '__E44E_ENT_NEW_REG__', corridor: 'Beirut', zone_type: 'circle', center_lat: 33.8733, center_lng: 35.4933, radius_km: 1.5, voided: 0 } }, { 'X-ISABI-Session': entryToken });
    const e44eEntNewRegGeo = await httpReq('POST', '/app/api/geo_config', { regions: { '__e44e_ent_new_reg__': { name: '__E44E_ENT_NEW_REG__', zone_type: 'circle', center_lat: 33.8733, center_lng: 35.4933, radius_km: 1.5, updated_at: e44eNow } } }, { 'X-ISABI-Session': entryToken });
    const e44eEntHub403 = await httpReq('POST', '/app/api/geo_config', { companyHubs: { wtc: { lat: 33.895, lng: 35.505, updated_at: e44eNow } } }, { 'X-ISABI-Session': entryToken });
    const e44eEntKm403 = await httpReq('POST', '/app/api/geo_config', { pairKmOverrides: { 'bu:WTC||site:__E44E_PINNED_WTC__': 6.6 } }, { 'X-ISABI-Session': entryToken });
    const e44eEntDel403 = await httpReq('POST', '/app/api/geo_config', { _deletedKeys: { 'sites:customer:__e44e_pinned_wtc__': e44eNow } }, { 'X-ISABI-Session': entryToken });
    const e44eEntRepin403 = await httpReq('POST', '/app/api/geo_config', { sites: { 'customer:__e44e_pinned_wtc__': { name: '__E44E_PINNED_WTC__', company: 'WTC', latitude: 33.8888, longitude: 35.5088, updated_at: e44eNow } } }, { 'X-ISABI-Session': entryToken });
    const e44eEntCleared403 = await httpReq('POST', '/app/api/geo_config', { sites: { 'customer:__e44e_cleared_wtc__': { name: '__E44E_CLEARED_WTC__', company: 'WTC', latitude: 33.875, longitude: 35.495, updated_at: e44eNow } } }, { 'X-ISABI-Session': entryToken });
    const e44eEntEditReg403 = await httpReq('POST', '/app/api/geo_config', { regions: { '__e44e_shaped_reg__': { name: '__E44E_SHAPED_REG__', zone_type: 'circle', center_lat: 33.865, center_lng: 35.525, radius_km: 3.3, updated_at: e44eNow } } }, { 'X-ISABI-Session': entryToken });

    // E: Single-BU Supervisor + Entry (WTC vs BBConstruction/Hospitality) + Blanca (Hospitality vs La Una)
    const e44eWtcHub200 = await httpReq('POST', '/app/api/geo_config', { companyHubs: { wtc: { lat: 33.8938, lng: 35.482, company: 'WTC', updated_at: e44eNow } } }, { 'X-ISABI-Session': wtcSe44e });
    const e44eWtcKm200 = await httpReq('POST', '/app/api/geo_config', { pairKmOverrides: { 'bu:WTC||site:__E44E_PINNED_WTC__': 7.2 } }, { 'X-ISABI-Session': wtcSe44e });
    const e44eWtcBbcHub403 = await httpReq('POST', '/app/api/geo_config', { companyHubs: { bbconstruction: { lat: 33.811, lng: 35.481, company: 'BBConstruction', updated_at: e44eNow } } }, { 'X-ISABI-Session': wtcSe44e });
    const e44eWtcBbcKm403 = await httpReq('POST', '/app/api/geo_config', { pairKmOverrides: { 'bu:WTC||site:__E44E_PINNED_BBC__': 9.9 } }, { 'X-ISABI-Session': wtcSe44e });
    const e44eWtcBbcDel403 = await httpReq('POST', '/app/api/geo_config', { _deletedKeys: { 'sites:customer:__e44e_pinned_bbc__': e44eNow } }, { 'X-ISABI-Session': wtcSe44e });
    const e44eWtcHosp403 = await httpReq('POST', '/app/api/geo_config', { regions: { 'hospitality & resorts::hsp_44e': { name: 'Hsp 44e', zone_type: 'circle', center_lat: 33.76, center_lng: 35.44, radius_km: 1.5, updated_at: e44eNow } } }, { 'X-ISABI-Session': wtcSe44e });
    const e44eWtcHspHub403 = await httpReq('POST', '/app/api/geo_config', { companyHubs: { blanca: { lat: 33.76, lng: 35.44, company: 'Blanca', updated_at: e44eNow } } }, { 'X-ISABI-Session': wtcSe44e });
    const e44eBlancaReg200 = await httpReq('POST', '/app/api/geo_config', { regions: { 'hospitality & resorts::hsp_blanca_44e': { name: 'Hsp Blanca 44e', zone_type: 'circle', center_lat: 33.76, center_lng: 35.44, radius_km: 1.5, updated_at: e44eNow } } }, { 'X-ISABI-Session': blancaSe44e });
    const e44eBlancaLaUna403 = await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: 's_44e_launa_atk', name: 'LaUna 44e', _industry: 'Hospitality & Resorts', company: 'La Una', latitude: 33.77, longitude: 35.45 } }, { 'X-ISABI-Session': blancaSe44e });

    // F: 400 validation bounds (0,0), out-of-range, circle radius <=0 or >500, pairKm <0 or >5000
    const e44eBadZero = await httpReq('POST', '/app/api/geo_config', { sites: { 'customer:__e44e_bad0__': { name: 'Bad0', company: 'WTC', latitude: 0, longitude: 0 } } }, { 'X-ISABI-Session': ownerToken });
    const e44eBadRange = await httpReq('POST', '/app/api/geo_config', { companyHubs: { wtc: { lat: 95, lng: 200 } } }, { 'X-ISABI-Session': ownerToken });
    const e44eBadRad0 = await httpReq('POST', '/app/api/geo_config', { regions: { badrad0: { name: 'BadRad0', shape_type: 'circle', center_lat: 33.85, center_lng: 35.51, radius_km: 0 } } }, { 'X-ISABI-Session': ownerToken });
    const e44eBadRad600 = await httpReq('POST', '/app/api/records', { table: 'regions', record: { id: 'r_44e_bad600', name: 'BadRad600', zone_type: 'circle', center_lat: 33.85, center_lng: 35.51, radius_km: 600 } }, { 'X-ISABI-Session': ownerToken });
    const e44eBadKmNeg = await httpReq('POST', '/app/api/geo_config', { pairKmOverrides: { 'bu:WTC||site:__E44E_PINNED_WTC__': -1 } }, { 'X-ISABI-Session': ownerToken });
    const e44eBadKm5001 = await httpReq('POST', '/app/api/geo_config', { pairKmOverrides: { 'bu:WTC||site:__E44E_PINNED_WTC__': 5001 } }, { 'X-ISABI-Session': ownerToken });

    // G: Words-Only create 403, Sales tamper 403 vs blank-reg/region-only 200, Entry combined text+pin & region-only 200, 12-co non-Owner 403, GET /records deferred LIMIT + manufacturing-group, /sync 6-vertical preserve, & 6-vertical domain 403
    const e44eWordsCreate403 = await httpReq('POST', '/app/api/industry_domain_store', { industryCustomRows: { mfg_custom: [{ id: 'ic_44e_words_deny', company: 'WTC', name: 'Denied 44e', updated_at: e44eNow }] } }, { 'X-ISABI-Session': words44e });
    const e44eEntCombined200 = await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44eUnpinWtcId, name: '__E44E_UNPIN_WTC__', company: 'WTC', region: 'Beirut', notes: 'Entry text+pin 44e', latitude: 33.8722, longitude: 35.4922, voided: 0 } }, { 'X-ISABI-Session': entryToken });
    const e44eEntAliasFill200 = await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44eUnpinAliasId, name: '__E44E_UNPIN_ALIAS__', company: 'WTC', region: 'Beirut', lat: 33.8726, lng: 35.4926, voided: 0 } }, { 'X-ISABI-Session': entryToken });
    const e44eAliasChk = await httpReq('GET', '/app/api/records?table=sites&limit=5000', null, { 'X-ISABI-Session': ownerToken });
    const e44eAliasRow = (e44eAliasChk.json?.rows || []).find(r => r && r.id === e44eUnpinAliasId);
    const e44eEntRegOnly200 = await httpReq('POST', '/app/api/geo_config', { sites: { 'customer:__e44e_regonly__': { name: '__E44E_REGONLY__', company: 'WTC', region: 'Choueifat', latitude: 33.8725, longitude: 35.4925, updated_at: e44eNow } } }, { 'X-ISABI-Session': entryToken });
    const e44eSalesTamperText403 = await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44eRegOnly2SiteId, name: '__E44E_REGONLY2__', company: 'WTC', region: 'Choueifat', notes: 'tamper', latitude: 33.8741, longitude: 35.4941, voided: 0 } }, { 'X-ISABI-Session': sales44e });
    const e44eSalesOverwriteReg403 = await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44eRegOnly2SiteId, name: '__E44E_REGONLY2__', company: 'WTC', region: 'Beirut', notes: 'keep-ro2', latitude: 33.8741, longitude: 35.4941, voided: 0 } }, { 'X-ISABI-Session': sales44e });
    const e44eSalesBlankReg200 = await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44eNoRegSiteId, name: '__E44E_NOREG_WTC__', company: 'WTC', region: 'Choueifat', latitude: 33.8742, longitude: 35.4942, voided: 0 } }, { 'X-ISABI-Session': sales44e });
    const e44eSalesRegOnly200 = await httpReq('POST', '/app/api/geo_config', { sites: { 'customer:__e44e_regonly2__': { name: '__E44E_REGONLY2__', company: 'WTC', region: 'Choueifat', latitude: 33.8743, longitude: 35.4943, updated_at: e44eNow } } }, { 'X-ISABI-Session': sales44e });
    const e44eSalesRepin403 = await httpReq('POST', '/app/api/geo_config', { sites: { 'customer:__e44e_regonly2__': { name: '__E44E_REGONLY2__', company: 'WTC', region: 'Choueifat', latitude: 33.8843, longitude: 35.5043, updated_at: new Date(Date.now() + 5000).toISOString() } } }, { 'X-ISABI-Session': sales44e });
    const e44eSalesNewSiteId = 's_44e_sales_new';
    const e44eSalesNewRegId = 'r_44e_sales_new';
    const e44eSalesNewSite200 = await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44eSalesNewSiteId, name: '__E44E_SALES_NEW__', company: 'WTC', region: 'Beirut', site_category: 'customer', latitude: 33.8744, longitude: 35.4944, voided: 0 } }, { 'X-ISABI-Session': sales44e });
    const e44eSalesNewSiteGeo200 = await httpReq('POST', '/app/api/geo_config', { sites: { 'customer:__e44e_sales_new__': { name: '__E44E_SALES_NEW__', company: 'WTC', latitude: 33.8744, longitude: 35.4944, updated_at: e44eNow } } }, { 'X-ISABI-Session': sales44e });
    const e44eSalesNewReg200 = await httpReq('POST', '/app/api/records', { table: 'regions', record: { id: e44eSalesNewRegId, name: '__E44E_SALES_NEW_REG__', corridor: 'Beirut', zone_type: 'circle', center_lat: 33.8745, center_lng: 35.4945, radius_km: 1.4, voided: 0 } }, { 'X-ISABI-Session': sales44e });
    const e44eSalesNewRegGeo200 = await httpReq('POST', '/app/api/geo_config', { regions: { '__e44e_sales_new_reg__': { name: '__E44E_SALES_NEW_REG__', zone_type: 'circle', center_lat: 33.8745, center_lng: 35.4945, radius_km: 1.4, updated_at: e44eNow } } }, { 'X-ISABI-Session': sales44e });
    const e44eSalesBbc403 = await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: 's_44e_sales_bbc_403', name: '__E44E_SALES_BBC_403__', company: 'BBConstruction', region: 'Beirut', latitude: 33.8746, longitude: 35.4946, voided: 0 } }, { 'X-ISABI-Session': sales44e });
    const e44eSalesHsp403 = await httpReq('POST', '/app/api/geo_config', { sites: { 'hospitality & resorts::blanca:customer:__e44e_sales_hsp__': { name: '__E44E_SALES_HSP__', company: 'Blanca', latitude: 33.765, longitude: 35.445, updated_at: e44eNow } } }, { 'X-ISABI-Session': sales44e });
    const e44eSalesAliasPlain403 = await httpReq('POST', '/app/api/geo_config', { sites: { '__e44e_regonly__': { name: '__E44E_REGONLY__', company: 'WTC', region: 'Akkar', latitude: 33.8743, longitude: 35.4943, updated_at: e44eNow } } }, { 'X-ISABI-Session': sales44e });
    const e44eEntAliasInd403 = await httpReq('POST', '/app/api/geo_config', { sites: { 'manufacturing::customer:__e44e_regonly__': { name: '__E44E_REGONLY__', company: 'WTC', region: 'Akkar', latitude: 33.8743, longitude: 35.4943, updated_at: e44eNow } } }, { 'X-ISABI-Session': entryToken });
    const e44eSalesDbRegTamper403 = await httpReq('POST', '/app/api/geo_config', { sites: { 'customer:__e44e_dbreg__': { name: '__E44E_DBREG__', company: 'WTC', region: 'Akkar', latitude: 33.8747, longitude: 35.4947, updated_at: e44eNow } } }, { 'X-ISABI-Session': sales44e });
    const e44eEntGeoPinAlias403 = await httpReq('POST', '/app/api/geo_config', { sites: { 'customer:__e44e_geoonly_pin__': { name: '__E44E_GEOONLY_PIN__', company: 'WTC', region: 'Beirut', latitude: 33.9111, longitude: 35.5111, updated_at: e44eNow } } }, { 'X-ISABI-Session': entryToken });
    const e44eSalesGeoClrAlias403 = await httpReq('POST', '/app/api/geo_config', { sites: { 'customer:__e44e_geoonly_clr__': { name: '__E44E_GEOONLY_CLR__', company: 'WTC', region: 'Beirut', latitude: 33.9112, longitude: 35.5112, updated_at: e44eNow } } }, { 'X-ISABI-Session': sales44e });
    const e44eSalesRecentAliasReg403 = await httpReq('POST', '/app/api/geo_config', { sites: { '__e44e_sales_new__': { name: '__E44E_SALES_NEW__', company: 'WTC', region: 'Akkar', latitude: 33.8744, longitude: 35.4944, updated_at: new Date(Date.now() + 2000).toISOString() } } }, { 'X-ISABI-Session': sales44e });
    const e44eEntRegAlias403 = await httpReq('POST', '/app/api/geo_config', { regions: { 'manufacturing::__e44e_shaped_reg__': { name: '__E44E_SHAPED_REG__', zone_type: 'circle', center_lat: 33.866, center_lng: 35.526, radius_km: 3.4, updated_at: e44eNow } } }, { 'X-ISABI-Session': entryToken });
    const e44eSalesGeoRegAlias403 = await httpReq('POST', '/app/api/geo_config', { regions: { 'manufacturing::__e44e_geoonly_reg__': { name: '__E44E_GEOONLY_REG__', zone_type: 'circle', center_lat: 33.867, center_lng: 35.527, radius_km: 3.5, updated_at: e44eNow } } }, { 'X-ISABI-Session': sales44e });
    const e44eAliases403 = [
      e44eSalesAliasPlain403.status,
      e44eEntAliasInd403.status,
      e44eSalesDbRegTamper403.status,
      e44eEntGeoPinAlias403.status,
      e44eSalesGeoClrAlias403.status,
      e44eSalesRecentAliasReg403.status,
      e44eEntRegAlias403.status,
      e44eSalesGeoRegAlias403.status
    ].every(st => st === 403);
    const e44eCo12Hub403 = await httpReq('POST', '/app/api/geo_config', { companyHubs: { blanca: { lat: 33.765, lng: 35.445, company: 'Blanca', updated_at: e44eNow } } }, { 'X-ISABI-Session': co12_44e });
    const e44eCo12LaUna403 = await httpReq('POST', '/app/api/geo_config', { sites: { 'hospitality & resorts::La Una:atk44e': { name: 'Atk44e', company: 'La Una', latitude: 33.77, longitude: 35.45, updated_at: e44eNow } } }, { 'X-ISABI-Session': co12_44e });
    const e44eCo12Ins403 = await httpReq('POST', '/app/api/industry_domain_store', { industryRowEdits: { 'Insurance & Brokerage::Policies::POL44E': { ind: 'Insurance & Brokerage', tableTitle: 'Policies', primaryId: 'POL44E', company: 'Insurance Company', latitude: 33.87, longitude: 35.49, rev: 1, updated_at: e44eNow } } }, { 'X-ISABI-Session': co12_44e });
    const e44eBbcMfgGrpGet = await httpReq('GET', '/app/api/records?table=sites&company=manufacturing-group&limit=1', null, { 'X-ISABI-Session': bbcSe44e });
    const e44eBbcRows = e44eBbcMfgGrpGet.json?.rows || [];
    const e44eBbcMfgGrpOk = e44eBbcMfgGrpGet.status === 200 && e44eBbcRows.length === 1 && e44eBbcRows.every(r => String(r.company || '') === 'BBConstruction');
    const e44eSib6Keys = [
      ['Holding & Group Treasury::Partners::HLD_44E', 'Holding & Group Treasury', 'Partners', 'HLD_44E', 'Bdeir Holding'],
      ['Hospitality & Resorts::Memberships::HSP_44E', 'Hospitality & Resorts', 'Memberships', 'HSP_44E', 'Blanca'],
      ['Automotive & Heavy Trading::Trucks::TRD_44E', 'Automotive & Heavy Trading', 'Trucks', 'TRD_44E', 'Korri Auto'],
      ['Real Estate & Property::Properties::RE_44E', 'Real Estate & Property', 'Properties', 'RE_44E', 'Properties'],
      ['Insurance & Brokerage::Policies::INS_44E', 'Insurance & Brokerage', 'Policies', 'INS_44E', 'Insurance Company']
    ];
    const e44eSyncSeedMap = {};
    for (const [k, ind, tbl, pid, co] of e44eSib6Keys) e44eSyncSeedMap[k] = { ind, tableTitle: tbl, primaryId: pid, company: co, rev: 1, updated_at: e44eNow };
    await httpReq('POST', '/app/api/sync', { op: 'patch', doc: 'mfg_web_store', awaitMirror: true, patch: { mfg_web_store: { minShellVer: MIN_SYNC_SHELL_VER, updatedAt: new Date(Date.now() + 8000).toISOString(), industryRowEdits: e44eSyncSeedMap } } }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/sync', { op: 'patch', doc: 'mfg_web_store', awaitMirror: true, patch: { mfg_web_store: { minShellVer: MIN_SYNC_SHELL_VER, updatedAt: new Date(Date.now() + 9000).toISOString(), industryRowEdits: { 'Manufacturing::Sites::BBC_44E_NEW': { ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'BBC_44E_NEW', company: 'BBConstruction', rev: 1 }, 'Insurance & Brokerage::Policies::INS_HIJACK': { ind: 'Insurance & Brokerage', tableTitle: 'Policies', primaryId: 'INS_HIJACK', company: 'Insurance Company', rev: 1 } } } } }, { 'X-ISABI-Session': bbcSe44e });
    const e44eSyncAfter6 = (await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken })).json?.docs?.mfg_web_store?.industryRowEdits || {};
    const e44eSync6Ok = e44eSib6Keys.every(([k]) => Boolean(e44eSyncAfter6[k])) && Boolean(e44eSyncAfter6['Manufacturing::Sites::BBC_44E_NEW']) && !e44eSyncAfter6['Insurance & Brokerage::Policies::INS_HIJACK'];
    const e44eCross6Statuses = [];
    for (const [k, ind, tbl, pid, co] of e44eSib6Keys.concat([['Manufacturing::Sites::BBC_ATK_44E', 'Manufacturing', 'Sites', 'BBC_ATK_44E', 'BBConstruction']])) {
      const rIndAtk = await httpReq('POST', '/app/api/industry_domain_store', { industryRowEdits: { [k + '_ATK']: { ind, tableTitle: tbl, primaryId: pid + '_ATK', company: co, latitude: 33.87, longitude: 35.49, rev: 1, updated_at: e44eNow } } }, { 'X-ISABI-Session': wtcSe44e });
      e44eCross6Statuses.push(rIndAtk.status);
    }
    const e44eInsAgr200 = await httpReq('POST', '/app/api/industry_domain_store', {
      industryCustomRows: { ins_agreements: [{ id: 'agr_44e_ins', company: 'Insurance Company', partner_name: 'Partner 44e', updated_at: e44eNow }] }
    }, { 'X-ISABI-Session': ins44e });
    const e44eHldJvs200 = await httpReq('POST', '/app/api/industry_domain_store', {
      industryCustomRows: {
        hld_partners: [{ id: 'prt_44e_hld', entity: 'Bdeir Holding · Consolidated JV', name: 'JV Partner 44e', updated_at: e44eNow }],
        hld_interactions: [{ id: 'int_44e_hld', fromCo: 'Bdeir Holding', note: 'Int 44e', updated_at: e44eNow }]
      }
    }, { 'X-ISABI-Session': hld44e });
    const e44eHldGet = await httpReq('GET', '/app/api/industry_domain_store', null, { 'X-ISABI-Session': hld44e });
    const e44eHldFromCoIndOk = (e44eHldGet.json?.industryCustomRows?.hld_interactions || []).some(r => r && r.id === 'int_44e_hld' && r.fromCo === 'Bdeir Holding');
    await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: new Date(Date.now() + 14000).toISOString(),
          industryCustomRows: { hld_interactions: [{ id: 'int_44e_hld_sync', fromCo: 'Bdeir Holding', note: 'Sync Hld 44e', updated_at: e44eNow }] },
          industryRowEdits: { 'Holding & Group Treasury::Partners::HLD_FROMCO_44E': { ind: 'Holding & Group Treasury', tableTitle: 'Partners', primaryId: 'HLD_FROMCO_44E', fromCo: 'Bdeir Holding', rev: 1, updated_at: e44eNow } }
        }
      }
    }, { 'X-ISABI-Session': ownerToken });
    const e44eHldSyncGet = (await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': hld44e })).json?.docs?.mfg_web_store || {};
    const e44eHldFromCoSyncOk = (e44eHldSyncGet.industryCustomRows?.hld_interactions || []).some(r => r && r.id === 'int_44e_hld_sync') && Boolean((e44eHldSyncGet.industryRowEdits || {})['Holding & Group Treasury::Partners::HLD_FROMCO_44E']);
    const e44eMixed403 = await httpReq('POST', '/app/api/industry_domain_store', {
      industryRowEdits: {
        'Manufacturing::Sites::WTC_MIX_44E': { ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'WTC_MIX_44E', company: 'WTC', rev: 1, updated_at: e44eNow },
        'Manufacturing::Sites::BBC_MIX_44E': { ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'BBC_MIX_44E', company: 'BBConstruction', rev: 1, updated_at: e44eNow }
      }
    }, { 'X-ISABI-Session': wtcSe44e });
    const e44eMixedGet = await httpReq('GET', '/app/api/industry_domain_store', null, { 'X-ISABI-Session': ownerToken });
    const e44eMixedPersisted = Boolean((e44eMixedGet.json?.industryRowEdits || {})['Manufacturing::Sites::WTC_MIX_44E']);

    // H: {lat,lng} alias create -> Tier 3 re-pin 403 -> Tier 1 update 200, Tier 3 +New Region distance_km -> geo_config 200, non-geo purge pinned domain 403, rollback tokens
    const e44eAliasNewId = 's_44e_alias_new';
    const e44eAliasCreate200 = await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44eAliasNewId, name: '__E44E_ALIAS_NEW__', company: 'WTC', region: 'Beirut', site_category: 'customer', lat: 33.8615, lng: 35.5115, voided: 0 } }, { 'X-ISABI-Session': entryToken });
    const e44eAliasGeo200 = await httpReq('POST', '/app/api/geo_config', { sites: { 'customer:__e44e_alias_new__': { name: '__E44E_ALIAS_NEW__', company: 'WTC', region: 'Beirut', latitude: 33.8615, longitude: 35.5115, updated_at: e44eNow } } }, { 'X-ISABI-Session': entryToken });
    const e44eAliasRepin403 = await httpReq('POST', '/app/api/geo_config', { sites: { 'customer:__e44e_alias_new__': { name: '__E44E_ALIAS_NEW__', company: 'WTC', region: 'Beirut', latitude: 33.8715, longitude: 35.5215, updated_at: new Date(Date.now() + 2000).toISOString() } } }, { 'X-ISABI-Session': entryToken });
    const e44eAliasTier1Upd200 = await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44eAliasNewId, name: '__E44E_ALIAS_NEW__', company: 'WTC', region: 'Beirut', site_category: 'customer', lat: 33.8645, lng: 35.5145, voided: 0 } }, { 'X-ISABI-Session': wtcSe44e });
    const e44eAliasNewChk = await httpReq('GET', '/app/api/records?table=sites&limit=5000', null, { 'X-ISABI-Session': ownerToken });
    const e44eAliasNewRow = (e44eAliasNewChk.json?.rows || []).find(r => r && r.id === e44eAliasNewId);
    const e44eEntDistRegId = 'r_44e_ent_dist';
    const e44eEntDistRec200 = await httpReq('POST', '/app/api/records', { table: 'regions', record: { id: e44eEntDistRegId, name: '__E44E_ENT_DIST__', corridor: 'Mount Lebanon', zone_type: 'circle', center_lat: 33.852, center_lng: 35.512, radius_km: 1.6, distance_km: 14.2, voided: 0 } }, { 'X-ISABI-Session': entryToken });
    const e44eEntDistGeo200 = await httpReq('POST', '/app/api/geo_config', { regions: { '__e44e_ent_dist__': { name: '__E44E_ENT_DIST__', corridor: 'Mount Lebanon', zone_type: 'circle', center_lat: 33.852, center_lng: 35.512, radius_km: 1.6, updated_at: e44eNow } } }, { 'X-ISABI-Session': entryToken });
    const e44eEntDistTamper403 = await httpReq('POST', '/app/api/geo_config', { regions: { '__e44e_ent_dist__': { name: '__E44E_ENT_DIST__', corridor: 'Mount Lebanon', zone_type: 'circle', center_lat: 33.852, center_lng: 35.512, radius_km: 1.6, distance_km: 999, updated_at: new Date(Date.now() + 2500).toISOString() } } }, { 'X-ISABI-Session': entryToken });

    await httpReq('POST', '/app/api/industry_domain_store', {
      industryCustomRows: { mfg_custom: [{ id: 'ic_44e_pin_purge', company: 'WTC', name: 'Pin Purge 44e', latitude: 33.891, longitude: 35.501, updated_at: e44eNow }] },
      industryRowEdits: { 'Manufacturing::Sites::MC44E_PIN_PURGE': { ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'MC44E_PIN_PURGE', company: 'WTC', latitude: 33.892, longitude: 35.502, rev: 1, updated_at: e44eNow } }
    }, { 'X-ISABI-Session': ownerToken });
    const e44eNoEntPurgeRow403 = await httpReq('POST', '/app/api/industry_domain_store', {
      purgedRows: [{ bucket: 'mfg_custom', row_id: 'ic_44e_pin_purge', company: 'WTC' }]
    }, { 'X-ISABI-Session': noent44e });
    const e44eNoEntPurgeEdit403 = await httpReq('POST', '/app/api/industry_domain_store', {
      purgedEditKeys: ['Manufacturing::Sites::MC44E_PIN_PURGE']
    }, { 'X-ISABI-Session': noent44e });
    const e44eAfterPurgeChk = await httpReq('GET', '/app/api/industry_domain_store', null, { 'X-ISABI-Session': ownerToken });
    const e44ePinnedDomIntact = Boolean((e44eAfterPurgeChk.json?.industryCustomRows?.mfg_custom || []).some(r => r && r.id === 'ic_44e_pin_purge') && (e44eAfterPurgeChk.json?.industryRowEdits || {})['Manufacturing::Sites::MC44E_PIN_PURGE']);

    const e44eRbCreate = await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: 's_44e_rb_create', name: '__E44E_RB_CREATE__', company: 'WTC', region: 'Beirut', site_category: 'customer', latitude: 33.861, longitude: 35.501, voided: 0 } }, { 'X-ISABI-Session': entryToken });
    const e44eTokRbCreate = e44eRbCreate.json?.rollbackToken || '';
    const e44eRbCreateDo200 = await httpReq('POST', '/app/api/records', { op: 'rollback', rollbackToken: e44eTokRbCreate }, { 'X-ISABI-Session': entryToken });
    const e44eRbCreateReplay404 = await httpReq('POST', '/app/api/records', { op: 'rollback', rollbackToken: e44eTokRbCreate }, { 'X-ISABI-Session': entryToken });
    const e44eRbCreateChk = await httpReq('GET', '/app/api/records?table=sites&limit=5000', null, { 'X-ISABI-Session': ownerToken });
    const e44eRbCreateDeleted = !(e44eRbCreateChk.json?.rows || []).some(r => r && r.id === 's_44e_rb_create');

    const e44eRbUnpinId = 's_44e_rb_unpin';
    await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44eRbUnpinId, name: '__E44E_RB_UNPIN__', company: 'WTC', region: 'Beirut', notes: 'keep-44e-rb', site_category: 'customer', voided: 0 } }, { 'X-ISABI-Session': ownerToken });
    const e44eRbFill = await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44eRbUnpinId, name: '__E44E_RB_UNPIN__', company: 'WTC', region: 'Beirut', latitude: 33.8811, longitude: 35.5011, voided: 0 } }, { 'X-ISABI-Session': entryToken });
    const e44eTokRbFill = e44eRbFill.json?.rollbackToken || '';
    const e44eRbFillDo200 = await httpReq('POST', '/app/api/records', { op: 'rollback', rollbackToken: e44eTokRbFill }, { 'X-ISABI-Session': entryToken });
    const e44eRbFillRow = ((await httpReq('GET', '/app/api/records?table=sites&limit=5000', null, { 'X-ISABI-Session': ownerToken })).json?.rows || []).find(r => r && r.id === e44eRbUnpinId);
    const e44eRbFillRestored = Boolean(e44eRbFillRow && e44eRbFillRow.latitude == null && e44eRbFillRow.longitude == null && e44eRbFillRow.notes === 'keep-44e-rb');

    const e44eRbXActorCreate = await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: 's_44e_rb_xactor', name: '__E44E_RB_XACTOR__', company: 'WTC', region: 'Beirut', latitude: 33.862, longitude: 35.502, voided: 0 } }, { 'X-ISABI-Session': entryToken });
    const e44eTokXActor = e44eRbXActorCreate.json?.rollbackToken || '';
    const e44eRbXActor403 = await httpReq('POST', '/app/api/records', { op: 'rollback', rollbackToken: e44eTokXActor }, { 'X-ISABI-Session': sales44e });
    const e44eRbXActor200 = await httpReq('POST', '/app/api/records', { op: 'rollback', rollbackToken: e44eTokXActor }, { 'X-ISABI-Session': entryToken });

    const e44eRbCasId = 's_44e_rb_cas';
    const e44eRbCasCreate = await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44eRbCasId, name: '__E44E_RB_CAS__', company: 'WTC', region: 'Beirut', latitude: 33.863, longitude: 35.503, voided: 0 } }, { 'X-ISABI-Session': entryToken });
    const e44eTokCas = e44eRbCasCreate.json?.rollbackToken || '';
    await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: e44eRbCasId, name: '__E44E_RB_CAS__', company: 'WTC', region: 'Beirut', notes: 'concurrent edit', latitude: 33.863, longitude: 35.503, voided: 0 } }, { 'X-ISABI-Session': ownerToken });
    const e44eRbCas409 = await httpReq('POST', '/app/api/records', { op: 'rollback', rollbackToken: e44eTokCas }, { 'X-ISABI-Session': entryToken });

    const e44eDomRbWrite = await httpReq('POST', '/app/api/industry_domain_store', { industryCustomRows: { mfg_custom: [{ id: 'ic_44e_rb_dom', company: 'WTC', name: 'RB Dom 44e', updated_at: e44eNow }] } }, { 'X-ISABI-Session': wtcSe44e });
    const e44eTokDomRb = e44eDomRbWrite.json?.rollbackToken || '';
    const e44eDomRbDo200 = await httpReq('POST', '/app/api/industry_domain_store', { op: 'rollback', rollbackToken: e44eTokDomRb }, { 'X-ISABI-Session': wtcSe44e });
    const e44eDomRbReplay404 = await httpReq('POST', '/app/api/industry_domain_store', { op: 'rollback', rollbackToken: e44eTokDomRb }, { 'X-ISABI-Session': wtcSe44e });
    const e44eDomAfterRb = (await httpReq('GET', '/app/api/industry_domain_store', null, { 'X-ISABI-Session': ownerToken })).json || {};
    const e44eDomRbDeleted = !(e44eDomAfterRb.industryCustomRows?.mfg_custom || []).some(r => r && r.id === 'ic_44e_rb_dom');

    // Cleanup 44e test rows, geo_config keys, sync doc & users
    const e44eDelTs = new Date(Date.now() + 90000).toISOString();
    for (const sid of [e44ePinnedWtcId, e44ePinnedBbcId, e44eUnpinWtcId, e44eUnpinAliasId, e44eClearedWtcId, e44eVoidSiteId, e44eEntNewSiteId, e44eNoRegSiteId, e44eRegOnlySiteId, e44eRegOnly2SiteId, e44eDbRegSiteId, e44eSalesNewSiteId, e44eAliasNewId, e44eRbUnpinId, e44eRbCasId]) {
      await httpReq('POST', '/app/api/records', { table: 'sites', record: { id: sid, voided: 1 } }, { 'X-ISABI-Session': ownerToken }).catch(() => {});
    }
    for (const rid of [e44eShapedRegId, e44eVoidRegId, e44eEntNewRegId, e44eSalesNewRegId, e44eEntDistRegId]) {
      await httpReq('POST', '/app/api/records', { table: 'regions', record: { id: rid, voided: 1 } }, { 'X-ISABI-Session': ownerToken }).catch(() => {});
    }
    await httpReq('POST', '/app/api/geo_config', {
      _deletedKeys: {
        'sites:customer:__e44e_pinned_wtc__': e44eDelTs,
        'sites:customer:__e44e_pinned_bbc__': e44eDelTs,
        'sites:customer:__e44e_ent_new__': e44eDelTs,
        'sites:customer:__e44e_unpin_wtc__': e44eDelTs,
        'sites:customer:__e44e_sales_new__': e44eDelTs,
        'sites:customer:__e44e_alias_new__': e44eDelTs,
        'sites:__e44e_geoonly_pin__': e44eDelTs,
        'sites:__e44e_geoonly_clr__': e44eDelTs,
        'regions:__e44e_shaped_reg__': e44eDelTs,
        'regions:__e44e_geoonly_reg__': e44eDelTs,
        'regions:__e44e_ent_new_reg__': e44eDelTs,
        'regions:__e44e_sales_new_reg__': e44eDelTs,
        'regions:__e44e_ent_dist__': e44eDelTs,
        'regions:hospitality & resorts::hsp_blanca_44e': e44eDelTs,
        'sites:customer:__e44e_regonly__': e44eDelTs,
        'sites:customer:__e44e_regonly2__': e44eDelTs,
        'pairKmOverrides:bu:WTC||site:__E44E_PINNED_WTC__': e44eDelTs
      }
    }, { 'X-ISABI-Session': ownerToken }).catch(() => {});
    await httpReq('POST', '/app/api/industry_domain_store', {
      purgedEditKeys: e44eSib6Keys.map(x => x[0]).concat(['Manufacturing::Sites::BBC_44E_NEW', 'Holding & Group Treasury::Partners::HLD_FROMCO_44E', 'Manufacturing::Sites::MC44E_PIN_PURGE']),
      purgedCustomRowIds: { ins_agreements: ['agr_44e_ins'], hld_partners: ['prt_44e_hld'], hld_interactions: ['int_44e_hld', 'int_44e_hld_sync'], mfg_custom: ['ic_44e_pin_purge'] }
    }, { 'X-ISABI-Session': ownerToken }).catch(() => {});
    const e44eDocClean = (await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken })).json?.docs?.mfg_web_store || {};
    await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: new Date(Math.max(Date.now() + 90000, Date.parse(e44eDocClean.updatedAt || 0) + 1000)).toISOString(),
          customRecords: Object.assign({}, e44eDocClean.customRecords || {}, {
            regions: (e44eDocClean.customRecords?.regions || []).map(r => r && r.id === e44eShapedRegId ? Object.assign({}, r, { voided: true, rev: 99 }) : r)
          })
        }
      }
    }, { 'X-ISABI-Session': ownerToken }).catch(() => {});
    for (const u of e44eUsers) {
      await httpReq('POST', '/app/api/users', { user: { id: u.id, email: u.email, full_name: u.full_name, role: u.role, companies: u.companies, status: 'Inactive' } }, { 'X-ISABI-Session': ownerToken }).catch(() => {});
    }

    const e44eSupVoidOk = Boolean(
      e44eSupVoidSite.status === 200 && e44eSupVoidRegTamper403.status === 403 && e44eSupVoidReg.status === 200 &&
      e44eSupRestoreSite200.status === 200 && Boolean(e44eSupRestoreSiteRow && !e44eSupRestoreSiteRow.voided && Math.abs(Number(e44eSupRestoreSiteRow.latitude) - 33.8933) < 1e-4) &&
      e44eDispDist403.status === 403 && e44eDispSal403.status === 403 &&
      e44eNoentExp403.status === 403 && e44eNoentSal403.status === 403 &&
      e44eVoidedSiteRow && e44eVoidedSiteRow.voided && Math.abs(Number(e44eVoidedSiteRow.latitude) - 33.8933) < 1e-4 &&
      e44eVoidedRegRow && e44eVoidedRegRow.voided && Math.abs(Number(e44eVoidedRegRow.radius_km) - 1.8) < 1e-3 &&
      Math.abs(Number(e44eVoidedRegRow.distance_km) - 12.4) < 1e-3 &&
      Math.abs(Number(e44eVoidedRegRow.center_lat) - 33.856) < 1e-4
    );
    const e44eWordsOk = Boolean(
      e44eWordsSiteTxt.status === 200 && e44eWordsRegTxt.status === 200 &&
      e44eSyncRegAfter && Math.abs(Number(e44eSyncRegAfter.center_lat) - 33.855) < 1e-4 && Math.abs(Number(e44eSyncRegAfter.radius_km) - 2.5) < 1e-3 &&
      Math.abs(Number(e44eSyncRegAfter.distance_km) - 8.5) < 1e-3 &&
      e44eWordsSyncDrop && e44eNoentSyncDrop
    );
    const e44eEntryOk = Boolean(
      e44eEntNewSite.status === 200 && e44eEntNewSiteGeo.status === 200 &&
      e44eEntMissingRec.status === 200 && e44eEntMissingGeo.status === 200 &&
      e44eEntAliasFill200.status === 200 &&
      e44eAliasRow && Math.abs(Number(e44eAliasRow.latitude) - 33.8726) < 1e-4 && Math.abs(Number(e44eAliasRow.longitude) - 35.4926) < 1e-4 &&
      e44eEntNewReg.status === 200 && e44eEntNewRegGeo.status === 200 &&
      e44eEntHub403.status === 403 && e44eEntKm403.status === 403 && e44eEntDel403.status === 403 &&
      e44eEntRepin403.status === 403 && e44eEntCleared403.status === 403 && e44eEntEditReg403.status === 403
    );
    const e44eBuIndOk = Boolean(
      e44eWtcHub200.status === 200 && e44eWtcKm200.status === 200 &&
      e44eWtcBbcHub403.status === 403 && e44eWtcBbcKm403.status === 403 && e44eWtcBbcDel403.status === 403 &&
      e44eWtcHosp403.status === 403 && e44eWtcHspHub403.status === 403 &&
      e44eBlancaReg200.status === 200 && e44eBlancaLaUna403.status === 403
    );
    const e44eBad400Ok = [e44eBadZero.status, e44eBadRange.status, e44eBadRad0.status, e44eBadRad600.status, e44eBadKmNeg.status, e44eBadKm5001.status].every(st => st === 400);
    const e44eParityG = Boolean(
      e44eWordsCreate403.status === 403 &&
      e44eEntCombined200.status === 200 && e44eEntRegOnly200.status === 200 &&
      e44eSalesTamperText403.status === 403 && e44eSalesOverwriteReg403.status === 403 &&
      e44eSalesBlankReg200.status === 200 && e44eSalesRegOnly200.status === 200 && e44eSalesRepin403.status === 403 &&
      e44eSalesNewSite200.status === 200 && e44eSalesNewSiteGeo200.status === 200 &&
      e44eSalesNewReg200.status === 200 && e44eSalesNewRegGeo200.status === 200 &&
      e44eSalesBbc403.status === 403 && e44eSalesHsp403.status === 403 && e44eAliases403 &&
      e44eCo12Hub403.status === 403 && e44eCo12LaUna403.status === 403 && e44eCo12Ins403.status === 403 &&
      e44eBbcMfgGrpOk && e44eSync6Ok && e44eCross6Statuses.every(st => st === 403) &&
      e44eInsAgr200.status === 200 && e44eHldJvs200.status === 200 && e44eHldFromCoIndOk && e44eHldFromCoSyncOk &&
      e44eMixed403.status === 403 && !e44eMixedPersisted
    );

    const e44eRun4Ok = Boolean(
      e44eAliasCreate200.status === 200 && e44eAliasGeo200.status === 200 && e44eAliasRepin403.status === 403 && e44eAliasTier1Upd200.status === 200 &&
      e44eAliasNewRow && !('lat' in e44eAliasNewRow) && !('lng' in e44eAliasNewRow) &&
      Math.abs(Number(e44eAliasNewRow.latitude) - 33.8645) < 1e-4 && Math.abs(Number(e44eAliasNewRow.longitude) - 35.5145) < 1e-4 &&
      e44eEntDistRec200.status === 200 && e44eEntDistGeo200.status === 200 && e44eEntDistTamper403.status === 403 &&
      e44eNoEntPurgeRow403.status === 403 && e44eNoEntPurgeEdit403.status === 403 && e44ePinnedDomIntact &&
      Boolean(e44eTokRbCreate) && e44eRbCreateDo200.status === 200 && e44eRbCreateReplay404.status === 404 && e44eRbCreateDeleted &&
      Boolean(e44eTokRbFill) && e44eRbFillDo200.status === 200 && e44eRbFillRestored &&
      Boolean(e44eTokXActor) && e44eRbXActor403.status === 403 && e44eRbXActor200.status === 200 &&
      Boolean(e44eTokCas) && e44eRbCas409.status === 409 &&
      Boolean(e44eTokDomRb) && e44eDomRbDo200.status === 200 && e44eDomRbReplay404.status === 404 && e44eDomRbDeleted
    );

    if (e44eNonGeoBlockedAll && e44eSupVoidOk && e44eWordsOk && e44eEntryOk && e44eBuIndOk && e44eBad400Ok && e44eParityG && e44eRun4Ok) {
      pass('edge-44e-map-write-controls', 'Supervisor/Viewer/Dispatch-Custom/Words-Only=403 on geo writes, Supervisor pure-void & Words-Only text preserve GPS/zone, Entry/Sales additive-only + region-only initial pin, >=12-co RLS, deferred LIMIT & 6-vertical /sync+/industry_domain_store parity, 400 validation');
    } else {
      fail('edge-44e-map-write-controls', JSON.stringify({
        nonGeoFails: e44eNonGeoFails,
        supVoidOk: e44eSupVoidOk,
        wordsOk: e44eWordsOk,
        run4Ok: e44eRun4Ok,
        syncRegAfter: e44eSyncRegAfter,
        entryStatuses: [e44eEntNewSite.status, e44eEntNewSiteGeo.status, e44eEntMissingRec.status, e44eEntMissingGeo.status, e44eEntNewReg.status, e44eEntNewRegGeo.status, e44eEntHub403.status, e44eEntKm403.status, e44eEntDel403.status, e44eEntRepin403.status, e44eEntCleared403.status, e44eEntEditReg403.status],
        buIndStatuses: [e44eWtcHub200.status, e44eWtcKm200.status, e44eWtcBbcHub403.status, e44eWtcBbcKm403.status, e44eWtcBbcDel403.status, e44eWtcHosp403.status, e44eWtcHspHub403.status, e44eBlancaReg200.status, e44eBlancaLaUna403.status],
        bad400: [e44eBadZero.status, e44eBadRange.status, e44eBadRad0.status, e44eBadRad600.status, e44eBadKmNeg.status, e44eBadKm5001.status],
        parityG: {
          wordsCreate403: e44eWordsCreate403.status,
          entExtra: [e44eEntCombined200.status, e44eEntRegOnly200.status],
          sales: [e44eSalesTamperText403.status, e44eSalesOverwriteReg403.status, e44eSalesBlankReg200.status, e44eSalesRegOnly200.status, e44eSalesRepin403.status],
          co12: [e44eCo12Hub403.status, e44eCo12LaUna403.status, e44eCo12Ins403.status],
          e44eBbcMfgGrpOk, e44eSync6Ok, e44eCross6Statuses
        }
      }));
    }

    // 47. Close-of-Day Needs Attention Web Push (/app/api/day-close-push + /api/sync 403 guard + SSRF validation + Owner dispatch_due RLS)
    const ePushAnonGet = await httpReq('GET', '/app/api/day-close-push');
    const ePushDemoGet = await httpReq('GET', '/app/api/day-close-push', null, { 'X-ISABI-Demo': '1' });
    const ePushDemoPost = await httpReq('POST', '/app/api/day-close-push', { op: 'prefs', closeHourBeirut: 18 }, { 'X-ISABI-Demo': '1' });
    const ePushDemoAuthPost = await httpReq('POST', '/app/api/day-close-push', { op: 'prefs', closeHourBeirut: 18 }, { 'X-ISABI-Session': ownerToken, 'X-ISABI-Demo': '1' });
    const ePushOwnerGet0 = await httpReq('GET', '/app/api/day-close-push', null, { 'X-ISABI-Session': ownerToken });
    const ePushSyncVapid403 = await httpReq('POST', '/app/api/sync', { op: 'patch', doc: 'vapid_keypair_v1', patch: { vapid_keypair_v1: { x: 1 } } }, { 'X-ISABI-Session': ownerToken });
    const ePushSyncSubs403 = await httpReq('POST', '/app/api/sync', { op: 'patch', doc: 'day_close_push_subs_v1', patch: { day_close_push_subs_v1: { byUser: {} } } }, { 'X-ISABI-Session': ownerToken });
    const ePushSyncRead = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });

    const ePushEcdh = crypto.createECDH('prime256v1');
    ePushEcdh.generateKeys();
    const ePushP256dh = ePushEcdh.getPublicKey('base64url');
    const ePushAuth = crypto.randomBytes(16).toString('base64url');
    const ePushSubKeys = { p256dh: ePushP256dh, auth: ePushAuth };

    const ePushHttp400 = await httpReq('POST', '/app/api/day-close-push', { op: 'subscribe', subscription: { endpoint: 'http://fcm.googleapis.com/fcm/send/abc', keys: ePushSubKeys } }, { 'X-ISABI-Session': ownerToken });
    const ePushMeta400 = await httpReq('POST', '/app/api/day-close-push', { op: 'subscribe', subscription: { endpoint: 'https://169.254.169.254/latest/meta-data', keys: ePushSubKeys } }, { 'X-ISABI-Session': ownerToken });
    const ePushEvil400 = await httpReq('POST', '/app/api/day-close-push', { op: 'subscribe', subscription: { endpoint: 'https://evil.example.com/push', keys: ePushSubKeys } }, { 'X-ISABI-Session': ownerToken });
    const ePushBadB64_400 = await httpReq('POST', '/app/api/day-close-push', { op: 'subscribe', subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/badb64', keys: { p256dh: '!!!', auth: 'x' } } }, { 'X-ISABI-Session': ownerToken });
    const ePushBadScope_400 = await httpReq('POST', '/app/api/day-close-push', { op: 'subscribe', scopeKey: 'bogus_scope', subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/badscope', keys: ePushSubKeys } }, { 'X-ISABI-Session': ownerToken });

    const ePushEntryShac403 = await httpReq('POST', '/app/api/day-close-push', { op: 'subscribe', scopeKey: 'shacman', subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/e-shac', keys: ePushSubKeys } }, { 'X-ISABI-Session': entryToken });
    const ePushEntryProps403 = await httpReq('POST', '/app/api/day-close-push', { op: 'subscribe', scopeKey: 'properties', subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/e-prop', keys: ePushSubKeys } }, { 'X-ISABI-Session': entryToken });
    const ePushEntryEmpty403 = await httpReq('POST', '/app/api/day-close-push', { op: 'subscribe', scopeKey: '', subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/e-empty', keys: ePushSubKeys } }, { 'X-ISABI-Session': entryToken });
    const ePushEntryMfgGrp403 = await httpReq('POST', '/app/api/day-close-push', { op: 'subscribe', scopeKey: 'manufacturing-group', subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/e-grp', keys: ePushSubKeys } }, { 'X-ISABI-Session': entryToken });
    const ePushEntryWtc200 = await httpReq('POST', '/app/api/day-close-push', { op: 'subscribe', scopeKey: 'wtc', subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/e-wtc', keys: ePushSubKeys } }, { 'X-ISABI-Session': entryToken });
    const ePushEntryUnsub200 = await httpReq('POST', '/app/api/day-close-push', { op: 'unsubscribe', endpoint: 'https://fcm.googleapis.com/fcm/send/e-wtc' }, { 'X-ISABI-Session': entryToken });

    const ePushSub200 = await httpReq('POST', '/app/api/day-close-push', {
      op: 'subscribe',
      closeHourBeirut: 18,
      whatsappPhone: '+961 3 111 222',
      lang: 'en',
      scopeKey: 'wtc',
      subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/ePush-test-token', keys: ePushSubKeys }
    }, { 'X-ISABI-Session': ownerToken });
    const ePushPrefs200 = await httpReq('POST', '/app/api/day-close-push', {
      op: 'prefs',
      closeHourBeirut: 19,
      whatsappPhone: '+961 3 555 777',
      lang: 'fr',
      scopeKey: 'wtc'
    }, { 'X-ISABI-Session': ownerToken });
    const ePushOwnerGet1 = await httpReq('GET', '/app/api/day-close-push', null, { 'X-ISABI-Session': ownerToken });
    const ePushPrefsReset200 = await httpReq('POST', '/app/api/day-close-push', {
      op: 'prefs',
      closeHourBeirut: 19,
      whatsappPhone: '+961 3 555 777',
      lang: 'fr',
      scopeKey: ''
    }, { 'X-ISABI-Session': ownerToken });
    const ePushOwnerGetReset = await httpReq('GET', '/app/api/day-close-push', null, { 'X-ISABI-Session': ownerToken });
    const ePushEntryTakeover200 = await httpReq('POST', '/app/api/day-close-push', {
      op: 'subscribe',
      scopeKey: 'wtc',
      subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/ePush-test-token', keys: ePushSubKeys }
    }, { 'X-ISABI-Session': entryToken });
    const ePushOwnerLostGet = await httpReq('GET', '/app/api/day-close-push', null, { 'X-ISABI-Session': ownerToken });
    const ePushEntryAfterUn200 = await httpReq('POST', '/app/api/day-close-push', { op: 'unsubscribe', endpoint: 'https://fcm.googleapis.com/fcm/send/ePush-test-token' }, { 'X-ISABI-Session': entryToken });
    const ePushEntryDisp403 = await httpReq('POST', '/app/api/day-close-push', { op: 'dispatch_due' }, { 'X-ISABI-Session': entryToken });
    const ePushOwnerGet2 = await httpReq('GET', '/app/api/day-close-push', null, { 'X-ISABI-Session': ownerToken });

    const ePushDocs = ePushSyncRead.json?.docs || {};
    const ePushOk = Boolean(
      ePushAnonGet.status === 401 &&
      ePushDemoGet.status === 200 && ePushDemoGet.json?.demo === true && ePushDemoGet.json?.subscribed === false && ePushDemoGet.json?.vapidPublicKey === '' &&
      ePushDemoPost.status === 401 && ePushDemoAuthPost.status === 403 &&
      ePushOwnerGet0.status === 200 && typeof ePushOwnerGet0.json?.vapidPublicKey === 'string' && ePushOwnerGet0.json.vapidPublicKey.length >= 80 &&
      !('privateJwk' in (ePushOwnerGet0.json || {})) && !/privateJwk/.test(ePushOwnerGet0.text || '') &&
      ePushSyncVapid403.status === 403 && ePushSyncSubs403.status === 403 &&
      !('vapid_keypair_v1' in ePushDocs) && !('day_close_push_subs_v1' in ePushDocs) &&
      ePushHttp400.status === 400 && ePushMeta400.status === 400 && ePushEvil400.status === 400 &&
      ePushBadB64_400.status === 400 && ePushBadScope_400.status === 400 &&
      ePushEntryShac403.status === 403 && ePushEntryProps403.status === 403 && ePushEntryEmpty403.status === 403 && ePushEntryMfgGrp403.status === 403 &&
      ePushEntryWtc200.status === 200 && ePushEntryUnsub200.status === 200 &&
      ePushSub200.status === 200 && ePushSub200.json?.subscribed === true && Number(ePushSub200.json?.endpointCount) === 1 &&
      ePushPrefs200.status === 200 &&
      ePushOwnerGet1.status === 200 && ePushOwnerGet1.json?.subscribed === true && Number(ePushOwnerGet1.json?.closeHourBeirut) === 19 && ePushOwnerGet1.json?.lang === 'fr' && ePushOwnerGet1.json?.scopeKey === 'wtc' &&
      ePushPrefsReset200.status === 200 && ePushOwnerGetReset.status === 200 && ePushOwnerGetReset.json?.scopeKey === '' &&
      ePushEntryTakeover200.status === 200 && ePushEntryTakeover200.json?.subscribed === true &&
      ePushOwnerLostGet.status === 200 && ePushOwnerLostGet.json?.subscribed === false && Number(ePushOwnerLostGet.json?.endpointCount) === 0 &&
      ePushEntryAfterUn200.status === 200 && ePushEntryAfterUn200.json?.subscribed === false &&
      ePushEntryDisp403.status === 403 &&
      ePushOwnerGet2.status === 200 && ePushOwnerGet2.json?.subscribed === false
    );
    if (ePushOk) {
      pass('edge-47-day-close-push', 'VAPID public key without privateJwk, demo GET 200 / POST 401+403, /sync 403 push guards, malformed b64/scopeKey 400, entryToken RLS 403/200, owner prefs scopeKey reset, HTTPS/allowlist SSRF 400s, subscribe+prefs+unsubscribe round-trip & Entry dispatch_due 403');
    } else {
      fail('edge-47-day-close-push', JSON.stringify({
        anon: ePushAnonGet.status, demoGet: ePushDemoGet.status, demoPost: ePushDemoPost.status, demoAuthPost: ePushDemoAuthPost.status,
        get0: { st: ePushOwnerGet0.status, len: (ePushOwnerGet0.json?.vapidPublicKey || '').length },
        sync403: [ePushSyncVapid403.status, ePushSyncSubs403.status],
        ssrf: [ePushHttp400.status, ePushMeta400.status, ePushEvil400.status, ePushBadB64_400.status, ePushBadScope_400.status],
        entryRls: [ePushEntryShac403.status, ePushEntryProps403.status, ePushEntryEmpty403.status, ePushEntryMfgGrp403.status, ePushEntryWtc200.status, ePushEntryUnsub200.status],
        sub: { st: ePushSub200.status, j: ePushSub200.json }, prefs: { st: ePushPrefs200.status, j: ePushPrefs200.json },
        get1: ePushOwnerGet1.json, getReset: ePushOwnerGetReset.json, entry403: ePushEntryDisp403.status,
        unsub: { st: ePushUnsub200.status, j: ePushUnsub200.json }, get2: ePushOwnerGet2.json
      }).slice(0, 800));
    }

    // 48. Workbook match reopenable restore by read-only Supervisor + anti-forgery _reopenedExplicitly strip
    const e48WbId = 'exp-e48-wb-bbc';
    const e48NormId = 'exp-e48-norm-bbc';
    const e48WbSeed = await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: {
        id: e48WbId, company: 'BBConstruction', date: '2026-11-12', amount: 120,
        notes: 'Workbook Match Edge48', voided: 1, void_reason: 'Workbook match Edge48', twin_of: 'exp-e48-live-bbc', twin_difference: -10
      }
    }, { 'X-ISABI-Session': ownerToken });
    const e48NormSeed = await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: e48NormId, company: 'BBConstruction', date: '2026-11-12', amount: 75, notes: 'Normal Void Edge48', voided: 1, void_reason: 'Normal Void Edge48' }
    }, { 'X-ISABI-Session': ownerToken });
    const e48SupWbRestore = await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: e48WbId, company: 'BBConstruction', voided: 0 }
    }, { 'X-ISABI-Session': bbcSupToken });
    const e48SupForgeRestore = await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: e48NormId, company: 'BBConstruction', voided: 0, _reopenedExplicitly: true }
    }, { 'X-ISABI-Session': bbcSupToken });
    const e48ReadBack = await httpReq('GET', '/app/api/records?table=expenses&company=BBConstruction&limit=500', null, { 'X-ISABI-Session': bbcSupToken });
    const e48Rows = Array.isArray(e48ReadBack.json?.rows) ? e48ReadBack.json.rows : [];
    const e48WbAfter = e48Rows.find(r => r && r.id === e48WbId);
    const e48NormAfter = e48Rows.find(r => r && r.id === e48NormId);
    const e48Ok = Boolean(
      e48WbSeed.status === 200 && e48NormSeed.status === 200 &&
      e48SupWbRestore.status === 200 && e48SupForgeRestore.status === 200 &&
      e48WbAfter && !e48WbAfter.voided && e48WbAfter._reopenedExplicitly === true &&
      !e48WbAfter.twin_of && !e48WbAfter.twin_difference && Number(e48WbAfter.rev || 0) >= 2 &&
      e48NormAfter && !e48NormAfter.voided && e48NormAfter._reopenedExplicitly === undefined
    );

    // 48b. system-topup unvoid guards across /records (Owner/Sup 403), /sync (Owner/Sup keep voided), and /industry_domain_store (custom rows & edits 403 + Workbook match _reopenedExplicitly)
    const e48OwnRecTopup403 = await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: 'exp-e48-topup-bbc', company: 'BBConstruction', voided: false }
    }, { 'X-ISABI-Session': ownerToken });
    const e48SupRecTopup403 = await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: 'exp-e48-topup-bbc', company: 'BBConstruction', voided: false }
    }, { 'X-ISABI-Session': bbcSupToken });

    const e48SyncRead = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const e48Doc = e48SyncRead.json?.docs?.mfg_web_store || {};
    const e48Exps0 = (e48Doc.customRecords?.expenses || []).filter(x => x && x.id !== 'exp-e48-topup-bbc');
    const e48OwnSyncPatch = await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
      ifMatchUpdatedAt: String(e48Doc.updatedAt || ''),
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: new Date(Math.max(Date.now(), Date.parse(e48Doc.updatedAt || 0) + 1000)).toISOString(),
          customRecords: Object.assign({}, e48Doc.customRecords || {}, {
            expenses: e48Exps0.concat([{ id: 'exp-e48-topup-bbc', company: 'BBConstruction', date: '2026-11-12', amount: 95, voided: false }])
          })
        }
      }
    }, { 'X-ISABI-Session': ownerToken });
    const e48SyncTopupRead = await httpReq('GET', '/app/api/records?table=expenses&company=BBConstruction&limit=500', null, { 'X-ISABI-Session': ownerToken });
    const e48TopupAfterSync = (e48SyncTopupRead.json?.rows || []).find(r => r && r.id === 'exp-e48-topup-bbc');

    const e48DomWbSeed = await httpReq('POST', '/app/api/industry_domain_store', {
      industryCustomRows: { mfg_sites: [{ id: 'dom-e48-wb-bbc', company: 'BBConstruction', ind: 'Manufacturing', name: 'E48 WB Dom', voided: true, twin_of: 'dom-e48-live-bbc', twin_difference: -5, rev: 1 }] },
      industryRowEdits: { 'Manufacturing::Sites::E48-WB': { ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'E48-WB', company: 'BBConstruction', voided: true, twin_of: 'site-e48-live', twin_difference: 'km', rev: 1 } }
    }, { 'X-ISABI-Session': ownerToken });
    const e48SupDomWbRestore = await httpReq('POST', '/app/api/industry_domain_store', {
      industryCustomRows: { mfg_sites: [{ id: 'dom-e48-wb-bbc', company: 'BBConstruction', ind: 'Manufacturing', voided: false, rev: 2 }] },
      industryRowEdits: { 'Manufacturing::Sites::E48-WB': { ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'E48-WB', company: 'BBConstruction', voided: false, rev: 2 } }
    }, { 'X-ISABI-Session': bbcSupToken });
    const e48DomRead = await httpReq('GET', '/app/api/industry_domain_store', null, { 'X-ISABI-Session': bbcSupToken });
    const e48DomWbAfter = ((e48DomRead.json?.industryCustomRows || {}).mfg_sites || []).find(r => r && r.id === 'dom-e48-wb-bbc');
    const e48EditWbAfter = (e48DomRead.json?.industryRowEdits || {})['Manufacturing::Sites::E48-WB'];

    const e48FullOk = Boolean(
      e48Ok &&
      e48OwnRecTopup403.status === 403 && e48SupRecTopup403.status === 403 &&
      e48OwnSyncPatch.status === 200 && e48TopupAfterSync && e48TopupAfterSync.voided === true && /^system-topup/i.test(String(e48TopupAfterSync.voided_by || '')) &&
      e48OwnDomTopup403.status === 403 && e48OwnEditTopup403.status === 403 &&
      e48SupDomTopup403.status === 403 && e48SupEditTopup403.status === 403 &&
      e48DomWbSeed.status === 200 && e48SupDomWbRestore.status === 200 &&
      e48DomWbAfter && !e48DomWbAfter.voided && e48DomWbAfter._reopenedExplicitly === true && !e48DomWbAfter.twin_of &&
      e48EditWbAfter && !e48EditWbAfter.voided && e48EditWbAfter._reopenedExplicitly === true && !e48EditWbAfter.twin_of
    );
    if (e48FullOk) {
      pass('edge-48-void-workbook-match-and-sync-twin-guards', 'Read-only Supervisor Workbook match restore (/records + /industry_domain_store) sets _reopenedExplicitly=true + strips twins; /records + /sync + /industry_domain_store lock system-topup for Owner & Supervisor');
    } else {
      fail('edge-48-void-workbook-match-and-sync-twin-guards', JSON.stringify({
        e48Ok,
        rec403: [e48OwnRecTopup403.status, e48SupRecTopup403.status],
        syncStatus: e48OwnSyncPatch.status, topupAfterSync: e48TopupAfterSync,
        dom403: [e48OwnDomTopup403.status, e48OwnEditTopup403.status, e48SupDomTopup403.status, e48SupEditTopup403.status],
        domSeedSt: e48DomWbSeed.status, domWbSt: e48SupDomWbRestore.status, domWbAfter: e48DomWbAfter, editWbAfter: e48EditWbAfter
      }).slice(0, 800));
    }

    // 48c. A dated schedule's id reached on two devices (/industry_domain_store, 1:1 with isabi-app server.py and its
    //      gate verify_dated_log_server_save.mjs 38, 45-48). Device A saves a tariff from a later day and undoes it:
    //      the voided row stays under "<id>-YYYYMMDD". Device B then posts its own live row under that id: refused
    //      whole (409 voided_id_conflict), where the answer used to be OK with the voided row kept.
    const e48cDom = body => httpReq('POST', '/app/api/industry_domain_store', body, { 'X-ISABI-Session': ownerToken });
    const e48cRow = async (bk, id) => {
      const g = await httpReq('GET', '/app/api/industry_domain_store', null, { 'X-ISABI-Session': ownerToken });
      return ((g.json?.industryCustomRows || {})[bk] || []).find(r => r && r.id === id) || null;
    };
    // Stamps as a device writes them (this PC's clock, as the local Edge's)
    const e48cNow = () => new Date().toISOString();
    const e48cAgo = sec => new Date(Date.now() - sec * 1000).toISOString();
    const e48cMadeA = e48cAgo(600);
    const e48cId = 'TRF-E48C-20261201';
    const e48cA = { id: e48cId, company: 'Blanca', tier: 'E48C Cabana', season: 'E48C', start_date: '2026-12-01', end_date: 'Open', nightly_rate_usd: 480, _continues_id: 'TRF-E48C', _createdAt: e48cMadeA };
    const e48cLiveA = await e48cDom({ industryCustomRows: { hsp_tariffs: [Object.assign({}, e48cA, { rev: 1, updated_at: e48cMadeA })] } });
    const e48cTombBody = Object.assign({}, e48cA, { voided: true, _scheduleVoided: true, void_reason: 'gate undo', rev: 2, updated_at: e48cNow() });
    const e48cVoidA = await e48cDom({ industryCustomRows: { hsp_tariffs: [e48cTombBody] } });
    const e48cTomb = await e48cRow('hsp_tariffs', e48cId);
    await sleep(30);
    // Device B: the same id, live, made after the void, with another good row in the same request
    const e48cMadeB = e48cNow();
    const e48cB = Object.assign({}, e48cA, { nightly_rate_usd: 490, _createdAt: e48cMadeB, rev: 1, updated_at: e48cMadeB });
    const e48cClash = await e48cDom({ industryCustomRows: { hsp_tariffs: [
      { id: 'TRF-E48C-HALF', company: 'Blanca', tier: 'E48C Cabana Half', season: 'E48C', start_date: '2027-01-01', end_date: 'Open', nightly_rate_usd: 100, _createdAt: e48cMadeB, rev: 1, updated_at: e48cMadeB },
      e48cB
    ] } });
    const e48cAfterClash = await e48cRow('hsp_tariffs', e48cId);
    const e48cHalf = await e48cRow('hsp_tariffs', 'TRF-E48C-HALF');
    // Left as it was: the same voided row again; a device's own older live copy of it (same stamp, or none); a row
    // keyed under that id in the form (no _continues_id); a row made before the void
    const e48cSame = await e48cDom({ industryCustomRows: { hsp_tariffs: [e48cTomb || e48cTombBody] } });
    const e48cOlder = await e48cDom({ industryCustomRows: { hsp_tariffs: [Object.assign({}, e48cA, { nightly_rate_usd: 999, rev: 1, updated_at: e48cMadeA })] } });
    const e48cNoStampRow = Object.assign({}, e48cA, { nightly_rate_usd: 998, rev: 1, updated_at: e48cMadeA });
    delete e48cNoStampRow._createdAt;
    const e48cNoStamp = await e48cDom({ industryCustomRows: { hsp_tariffs: [e48cNoStampRow] } });
    const e48cTypedRow = Object.assign({}, e48cB, { nightly_rate_usd: 996 });
    delete e48cTypedRow._continues_id;
    const e48cTyped = await e48cDom({ industryCustomRows: { hsp_tariffs: [e48cTypedRow] } });
    const e48cBefore = await e48cDom({ industryCustomRows: { hsp_tariffs: [Object.assign({}, e48cB, { nightly_rate_usd: 995, _createdAt: e48cAgo(300) })] } });
    // Another device's voided copy with other values and its own void time, written over the stored voided row:
    // the time it was first voided stays (the refusal reads it)
    const e48cVoidedOver = await e48cDom({ industryCustomRows: { hsp_tariffs: [Object.assign({}, e48cTomb || e48cTombBody, { notes: 'Voided copy from another device', voided_at: '2099-01-01T00:00:00.000Z' })] } });
    const e48cAfterOlder = await e48cRow('hsp_tariffs', e48cId);
    // Another bucket is not refused (answered OK, the voided row kept, as before)
    const e48cMem = { id: 'MEM-E48C-TOMB', company: 'Blanca', unit: 'E48C Cabana', member: 'E48C Member', start_date: '2026-07-01', end_date: '2026-07-31', contract_usd: 100, _continues_id: 'MEM-E48C', _createdAt: e48cMadeA };
    const e48cMem1 = await e48cDom({ industryCustomRows: { hsp_memberships: [Object.assign({}, e48cMem, { rev: 1, updated_at: e48cMadeA })] } });
    const e48cMem2 = await e48cDom({ industryCustomRows: { hsp_memberships: [Object.assign({}, e48cMem, { voided: true, void_reason: 'gate undo', rev: 2, updated_at: e48cNow() })] } });
    await sleep(30);
    const e48cMem3 = await e48cDom({ industryCustomRows: { hsp_memberships: [Object.assign({}, e48cMem, { contract_usd: 200, _createdAt: e48cNow(), rev: 1, updated_at: e48cNow() })] } });
    const e48cMemAfter = await e48cRow('hsp_memberships', 'MEM-E48C-TOMB');
    // The other order: B's schedule stored first, A's same save over it (both live), then A's undo. B still holds its
    // own live copy and sends it with every save: made before the void, so not refused. One made after the void is.
    const e48cTwinId = 'TRF-E48C-TWIN-20261201';
    const e48cTwinB0 = e48cAgo(240);
    const e48cTwinA0 = e48cAgo(120);
    const e48cTwin = { id: e48cTwinId, company: 'Blanca', tier: 'E48C Cabana Twin', season: 'E48C', start_date: '2026-12-01', end_date: 'Open', nightly_rate_usd: 810, _continues_id: 'TRF-E48C-TWIN' };
    const e48cTwin1 = await e48cDom({ industryCustomRows: { hsp_tariffs: [Object.assign({}, e48cTwin, { _createdAt: e48cTwinB0, rev: 1, updated_at: e48cTwinB0 })] } });
    const e48cTwin2 = await e48cDom({ industryCustomRows: { hsp_tariffs: [Object.assign({}, e48cTwin, { nightly_rate_usd: 820, _createdAt: e48cTwinA0, rev: 1, updated_at: e48cTwinA0 })] } });
    const e48cTwin3 = await e48cDom({ industryCustomRows: { hsp_tariffs: [Object.assign({}, e48cTwin, { nightly_rate_usd: 820, _createdAt: e48cTwinA0, voided: true, _scheduleVoided: true, void_reason: 'gate undo', rev: 2, updated_at: e48cNow() })] } });
    const e48cTwinTomb = await e48cRow('hsp_tariffs', e48cTwinId);
    const e48cTwin4 = await e48cDom({ industryCustomRows: { hsp_tariffs: [Object.assign({}, e48cTwin, { _createdAt: e48cTwinB0, rev: 1, updated_at: e48cTwinB0 })] } });
    const e48cTwinAfter4 = await e48cRow('hsp_tariffs', e48cTwinId);
    await sleep(30);
    const e48cTwin5 = await e48cDom({ industryCustomRows: { hsp_tariffs: [Object.assign({}, e48cTwin, { nightly_rate_usd: 830, _createdAt: e48cNow(), rev: 1, updated_at: e48cNow() })] } });
    const e48cTwinAfter5 = await e48cRow('hsp_tariffs', e48cTwinId);
    // Device B saves again under the next free id; then the voided row is restored (live, a higher rev)
    const e48cNext = await e48cDom({ industryCustomRows: { hsp_tariffs: [Object.assign({}, e48cB, { id: e48cId + '-2' })] } });
    const e48cNextAfter = await e48cRow('hsp_tariffs', e48cId + '-2');
    const e48cRestore = await e48cDom({ industryCustomRows: { hsp_tariffs: [Object.assign({}, e48cA, { voided: false, _scheduleVoided: false, restored_at: e48cNow(), rev: 3, updated_at: e48cNow() })] } });
    const e48cRestored = await e48cRow('hsp_tariffs', e48cId);
    const e48cOk = Boolean(
      e48cLiveA.status === 200 && e48cVoidA.status === 200 && e48cTomb && e48cTomb.voided === true && Number(e48cTomb.rev) === 2 &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(String(e48cTomb.voided_at || '')) &&
      e48cClash.status === 409 && e48cClash.json?.ok === false && e48cClash.json?.code === 'voided_id_conflict' && e48cClash.json?.id === e48cId &&
      e48cClash.json?.bucket === 'hsp_tariffs' && /saved and undone on another device/.test(String(e48cClash.json?.error || '')) &&
      e48cAfterClash && e48cAfterClash.voided === true && Number(e48cAfterClash.nightly_rate_usd) === 480 && Number(e48cAfterClash.rev) === 2 && !e48cHalf &&
      e48cSame.status === 200 && e48cSame.json?.ok === true && e48cOlder.status === 200 && e48cNoStamp.status === 200 && e48cTyped.status === 200 && e48cBefore.status === 200 &&
      e48cAfterOlder && e48cAfterOlder.voided === true && Number(e48cAfterOlder.nightly_rate_usd) === 480 &&
      e48cVoidedOver.status === 200 && e48cAfterOlder.notes === 'Voided copy from another device' && e48cAfterOlder.voided_at === e48cTomb.voided_at &&
      e48cMem1.status === 200 && e48cMem2.status === 200 && e48cMem3.status === 200 && e48cMemAfter && e48cMemAfter.voided === true && Number(e48cMemAfter.contract_usd) === 100 &&
      e48cTwin1.status === 200 && e48cTwin2.status === 200 && e48cTwin3.status === 200 && e48cTwinTomb && e48cTwinTomb.voided === true && e48cTwinTomb._createdAt === e48cTwinA0 &&
      e48cTwin4.status === 200 && e48cTwin4.json?.ok === true && e48cTwinAfter4 && e48cTwinAfter4.voided === true && Number(e48cTwinAfter4.nightly_rate_usd) === 820 &&
      e48cTwin5.status === 409 && e48cTwin5.json?.code === 'voided_id_conflict' && e48cTwin5.json?.id === e48cTwinId && e48cTwinAfter5 && e48cTwinAfter5.voided === true && Number(e48cTwinAfter5.nightly_rate_usd) === 820 &&
      e48cNext.status === 200 && e48cNextAfter && !e48cNextAfter.voided && Number(e48cNextAfter.nightly_rate_usd) === 490 &&
      e48cRestore.status === 200 && e48cRestored && !e48cRestored.voided && Number(e48cRestored.rev) === 3
    );
    if (e48cOk) {
      pass('edge-48c-voided-schedule-id-conflict', 'live schedule kept apart by a save, made after another device\'s same-id schedule was voided = 409 voided_id_conflict, nothing of the request stored; same voided row again, a device\'s own older copy (same or no first-made stamp), a row keyed under that id in the form, a row made before the void (incl. the stored-first then overwritten order) and other buckets answered OK as before; a voided copy written over the voided row keeps the time it was first voided; next free id and Void Log restore (higher rev) accepted');
    } else {
      fail('edge-48c-voided-schedule-id-conflict', JSON.stringify({
        seed: [e48cLiveA.status, e48cVoidA.status, e48cTomb && [e48cTomb.voided, e48cTomb.rev, e48cTomb.voided_at]],
        clash: [e48cClash.status, e48cClash.json], afterClash: e48cAfterClash && [e48cAfterClash.voided, e48cAfterClash.nightly_rate_usd, e48cAfterClash.rev], half: Boolean(e48cHalf),
        same: [e48cSame.status, e48cOlder.status, e48cNoStamp.status, e48cTyped.status, e48cBefore.status, e48cVoidedOver.status], afterOlder: e48cAfterOlder && [e48cAfterOlder.voided, e48cAfterOlder.nightly_rate_usd, e48cAfterOlder.notes, e48cAfterOlder.voided_at],
        mem: [e48cMem1.status, e48cMem2.status, e48cMem3.status, e48cMemAfter && [e48cMemAfter.voided, e48cMemAfter.contract_usd]],
        twin: [e48cTwin1.status, e48cTwin2.status, e48cTwin3.status, e48cTwin4.status, e48cTwin5.status, e48cTwin5.json?.code, e48cTwinAfter5 && [e48cTwinAfter5.voided, e48cTwinAfter5.nightly_rate_usd]],
        next: [e48cNext.status, e48cNextAfter && [e48cNextAfter.voided, e48cNextAfter.nightly_rate_usd]],
        restore: [e48cRestore.status, e48cRestored && [e48cRestored.voided, e48cRestored.rev]]
      }).slice(0, 1600));
    }

    // 49. /app/api/records RBAC Parity for items, gl_accounts, equipment_oil_logs & sales_tickets
    const e49Ts = Date.now();
    const e49Users = [
      { id: 'u-49-disp', email: 'disp.49@bhfirms.com', full_name: 'Edge 49 Dispatch', role: 'Custom', companies: 'WTC', pin_code: '6294', status: 'Active', custom_perms: { rights: { read_ops: true, enter_dispatch: true, modify_data: true } } },
      { id: 'u-49-mast', email: 'mast.49@bhfirms.com', full_name: 'Edge 49 Master', role: 'Custom', companies: 'WTC', pin_code: '7385', status: 'Active', custom_perms: { rights: { read_ops: true, enter_master: true, modify_data: true } } },
      { id: 'u-49-mv', email: 'mv.49@bhfirms.com', full_name: 'Edge 49 Master Void', role: 'Custom', companies: 'WTC', pin_code: '7496', status: 'Active', custom_perms: { rights: { read_ops: true, enter_master: true, modify_data: true, void_data: true } } },
      { id: 'u-49-sales', email: 'sales.49@bhfirms.com', full_name: 'Edge 49 Sales', role: 'Sales', companies: 'WTC', pin_code: '8419', status: 'Active' },
      { id: 'u-49-sup', email: 'sup.49@bhfirms.com', full_name: 'Edge 49 Supervisor', role: 'Supervisor', companies: 'WTC', pin_code: '9527', status: 'Active' }
    ];
    for (const u of e49Users) {
      await httpReq('POST', '/app/api/users', { user: u }, { 'X-ISABI-Session': ownerToken });
    }
    const e49Login = async (email, pin) => {
      const r = await httpReq('POST', '/app/api/auth/login', { email, pin, method: 'PIN' });
      return String(r.json?.token || '');
    };
    const disp49 = await e49Login('disp.49@bhfirms.com', '6294');
    const mast49 = await e49Login('mast.49@bhfirms.com', '7385');
    const mastVoid49 = await e49Login('mv.49@bhfirms.com', '7496');
    const sales49 = await e49Login('sales.49@bhfirms.com', '8419');
    const sup49 = await e49Login('sup.49@bhfirms.com', '9527');
    const e49Post = (tok, table, record) => httpReq('POST', '/app/api/records', { table, record }, { 'X-ISABI-Session': tok });

    const e49OilDispId = `oil_49_d_${e49Ts}`;
    const e49ItmDispId = `itm_49_d_${e49Ts}`;
    const e49StDispId = `st_49_d_${e49Ts}`;
    const e49DispOil = await e49Post(disp49, 'equipment_oil_logs', { id: e49OilDispId, company: 'WTC', date: '2026-11-18', equipment: 'Volvo 19', notes: 'e49 disp oil', voided: 0 });
    const e49DispItm = await e49Post(disp49, 'items', { id: e49ItmDispId, name: `Edge49 Disp Item ${e49Ts}`, voided: 0 });
    const e49DispGl403 = await e49Post(disp49, 'gl_accounts', { id: `gl_49_d403_${e49Ts}`, name: `Edge49 Disp GL ${e49Ts}`, code: '619941', voided: 0 });
    const e49DispSt = await e49Post(disp49, 'sales_tickets', { id: e49StDispId, company: 'WTC', date: '2026-11-18', item: 'Edge49 Concrete', qty: 4, voided: 0 });

    const e49OilMastId = `oil_49_m_${e49Ts}`;
    const e49ItmMastId = `itm_49_m_${e49Ts}`;
    const e49GlMastId = `gl_49_m_${e49Ts}`;
    const e49MastOil = await e49Post(mast49, 'equipment_oil_logs', { id: e49OilMastId, company: 'WTC', date: '2026-11-18', equipment: 'Volvo 19', notes: 'e49 mast oil', voided: 0 });
    const e49MastItm = await e49Post(mast49, 'items', { id: e49ItmMastId, name: `Edge49 Mast Item ${e49Ts}`, voided: 0 });
    const e49MastGl = await e49Post(mast49, 'gl_accounts', { id: e49GlMastId, name: `Edge49 Mast GL ${e49Ts}`, code: '619942', voided: 0 });
    const e49MastSt403 = await e49Post(mast49, 'sales_tickets', { id: `st_49_m403_${e49Ts}`, company: 'WTC', date: '2026-11-18', item: 'Edge49 Concrete', qty: 4, voided: 0 });

    const e49ItmSalesId = `itm_49_s_${e49Ts}`;
    const e49StSalesId = `st_49_s_${e49Ts}`;
    const e49SalesItm = await e49Post(sales49, 'items', { id: e49ItmSalesId, name: `Edge49 Sales Item ${e49Ts}`, voided: 0 });
    const e49SalesSt = await e49Post(sales49, 'sales_tickets', { id: e49StSalesId, company: 'WTC', date: '2026-11-18', item: 'Edge49 Concrete', qty: 6, voided: 0 });
    const e49SalesGl403 = await e49Post(sales49, 'gl_accounts', { id: `gl_49_s403_${e49Ts}`, name: `Edge49 Sales GL ${e49Ts}`, code: '619943', voided: 0 });
    const e49SalesOil403 = await e49Post(sales49, 'equipment_oil_logs', { id: `oil_49_s403_${e49Ts}`, company: 'WTC', date: '2026-11-18', equipment: 'Volvo 19', notes: 'e49 sales oil', voided: 0 });

    const e49SupOil403 = await e49Post(sup49, 'equipment_oil_logs', { id: `oil_49_p403_${e49Ts}`, company: 'WTC', date: '2026-11-18', equipment: 'Volvo 19', notes: 'e49 sup oil', voided: 0 });
    const e49SupItm403 = await e49Post(sup49, 'items', { id: `itm_49_p403_${e49Ts}`, name: `Edge49 Sup Item ${e49Ts}`, voided: 0 });
    const e49SupGl403 = await e49Post(sup49, 'gl_accounts', { id: `gl_49_p403_${e49Ts}`, name: `Edge49 Sup GL ${e49Ts}`, code: '619944', voided: 0 });
    const e49SupSt403 = await e49Post(sup49, 'sales_tickets', { id: `st_49_p403_${e49Ts}`, company: 'WTC', date: '2026-11-18', item: 'Edge49 Concrete', qty: 2, voided: 0 });
    const e49EntryGl403 = await e49Post(entryToken, 'gl_accounts', { id: `gl_49_e403_${e49Ts}`, name: `Edge49 Entry GL ${e49Ts}`, code: '619945', voided: 0 });
    const e49EntryJv403 = await e49Post(entryToken, 'jv_distributions', { id: `jv_49_e403_${e49Ts}`, company: 'WTC', date: '2026-11-18', basis: 'Stock', amount: 100, voided: 0 });
    const e49JvSeedId = `jv_49_seed_${e49Ts}`;
    const e49OwnerJvSeed = await e49Post(ownerToken, 'jv_distributions', { id: e49JvSeedId, company: 'WTC', date: '2026-11-18', basis: 'Stock', amount: 100, voided: 0 });
    const e49EntryUpdGl403 = await e49Post(entryToken, 'gl_accounts', { id: e49GlMastId, name: `Edge49 Mast GL ${e49Ts}`, code: '999999', voided: 0 });
    const e49EntryUpdJv403 = await e49Post(entryToken, 'jv_distributions', { id: e49JvSeedId, company: 'WTC', amount: 999999 });
    const e49DispUpdGl403 = await e49Post(disp49, 'gl_accounts', { id: e49GlMastId, name: `Edge49 Mast GL ${e49Ts}`, code: '999998', voided: 0 });
    const e49DispUpdJv403 = await e49Post(disp49, 'jv_distributions', { id: e49JvSeedId, company: 'WTC', amount: 888888 });
    const e49MvUpdSt403 = await e49Post(mastVoid49, 'sales_tickets', { id: e49StDispId, company: 'WTC', qty: 777 });
    const e49MvVoidSt403 = await e49Post(mastVoid49, 'sales_tickets', { id: e49StDispId, company: 'WTC', voided: 1, void_reason: 'hack' });

    const e49SyncGet1 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const e49BaseDoc1 = e49SyncGet1.json?.docs?.mfg_web_store || {};
    const e49EntrySync = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: String(e49BaseDoc1.updatedAt || ''),
      awaitMirror: true,
      patch: {
        mfg_web_store: Object.assign({}, e49BaseDoc1, {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: new Date(Date.now() + 25000).toISOString(),
          customRecords: Object.assign({}, e49BaseDoc1.customRecords || {}, {
            gl_accounts: [{ id: e49GlMastId, name: 'SyncHacked', code: '999997' }],
            jv_distributions: [{ id: e49JvSeedId, company: 'WTC', date: '2026-11-18', basis: 'Stock', amount: 777777 }]
          })
        })
      }
    }, { 'X-ISABI-Session': entryToken });
    const e49SyncGet2 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const e49BaseDoc2 = e49SyncGet2.json?.docs?.mfg_web_store || {};
    const e49MvSync = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: String(e49BaseDoc2.updatedAt || ''),
      awaitMirror: true,
      patch: {
        mfg_web_store: Object.assign({}, e49BaseDoc2, {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: new Date(Date.now() + 27000).toISOString(),
          customRecords: Object.assign({}, e49BaseDoc2.customRecords || {}, {
            sales_tickets: [{ id: e49StDispId, company: 'WTC', date: '2026-11-18', qty: 666 }],
            jv_distributions: [{ id: e49JvSeedId, company: 'WTC', date: '2026-11-18', basis: 'Stock', amount: 666666 }]
          })
        })
      }
    }, { 'X-ISABI-Session': mastVoid49 });
    const e49SyncGet3 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const e49CrAfterSync = e49SyncGet3.json?.docs?.mfg_web_store?.customRecords || {};

    const e49OilGet = await httpReq('GET', '/app/api/records?table=equipment_oil_logs&company=WTC&limit=5000', null, { 'X-ISABI-Session': ownerToken });
    const e49ItmGet = await httpReq('GET', '/app/api/records?table=items&limit=5000', null, { 'X-ISABI-Session': ownerToken });
    const e49GlGet = await httpReq('GET', '/app/api/records?table=gl_accounts&limit=5000', null, { 'X-ISABI-Session': ownerToken });
    const e49JvGet = await httpReq('GET', '/app/api/records?table=jv_distributions&company=WTC&limit=5000', null, { 'X-ISABI-Session': ownerToken });
    const e49StGet = await httpReq('GET', '/app/api/records?table=sales_tickets&company=WTC&limit=5000', null, { 'X-ISABI-Session': ownerToken });

    const e49GlRow = (e49GlGet.json?.rows || []).find(r => r && r.id === e49GlMastId);
    const e49JvRow = (e49JvGet.json?.rows || []).find(r => r && r.id === e49JvSeedId);
    const e49StRow = (e49StGet.json?.rows || []).find(r => r && r.id === e49StDispId);
    const e49Persisted = Boolean(
      (e49OilGet.json?.rows || []).some(r => r && r.id === e49OilMastId)
      && (e49ItmGet.json?.rows || []).some(r => r && r.id === e49ItmSalesId)
      && e49GlRow && e49GlRow.code === '619942'
      && e49JvRow && Number(e49JvRow.amount) === 100
      && e49StRow && Number(e49StRow.qty) === 4 && !e49StRow.voided
      && (e49StGet.json?.rows || []).some(r => r && r.id === e49StSalesId)
      && !(e49CrAfterSync.gl_accounts || []).some(r => r && r.id === e49GlMastId && r.code === '999997')
      && !(e49CrAfterSync.jv_distributions || []).some(r => r && r.id === e49JvSeedId && (Number(r.amount) === 777777 || Number(r.amount) === 666666))
      && !(e49CrAfterSync.sales_tickets || []).some(r => r && r.id === e49StDispId && Number(r.qty) === 666)
    );

    const e49Cleanups = [
      [disp49, 'equipment_oil_logs', e49OilDispId, 'WTC', e49DispOil],
      [disp49, 'items', e49ItmDispId, '', e49DispItm],
      [disp49, 'sales_tickets', e49StDispId, 'WTC', e49DispSt],
      [mast49, 'equipment_oil_logs', e49OilMastId, 'WTC', e49MastOil],
      [mast49, 'items', e49ItmMastId, '', e49MastItm],
      [mast49, 'gl_accounts', e49GlMastId, '', e49MastGl],
      [sales49, 'items', e49ItmSalesId, '', e49SalesItm],
      [sales49, 'sales_tickets', e49StSalesId, 'WTC', e49SalesSt],
      [ownerToken, 'jv_distributions', e49JvSeedId, 'WTC', e49OwnerJvSeed]
    ];
    for (const [tok, tbl, rid, co, res] of e49Cleanups) {
      const rbTok = res?.json?.rollbackToken;
      if (rbTok && tok) {
        await httpReq('POST', '/app/api/records', { op: 'rollback', rollbackToken: rbTok }, { 'X-ISABI-Session': tok }).catch(() => {});
      } else if (res?.status === 200) {
        const rec = co ? { id: rid, company: co, voided: 1 } : { id: rid, voided: 1 };
        await httpReq('POST', '/app/api/records', { table: tbl, record: rec }, { 'X-ISABI-Session': ownerToken }).catch(() => {});
      }
    }
    for (const u of e49Users) {
      await httpReq('POST', '/app/api/users', { user: Object.assign({}, u, { status: 'Inactive' }) }, { 'X-ISABI-Session': ownerToken }).catch(() => {});
    }

    const e49Ok = Boolean(
      disp49 && mast49 && mastVoid49 && sales49 && sup49
      && e49DispOil.status === 200 && e49DispItm.status === 200 && e49DispGl403.status === 403 && e49DispSt.status === 200
      && e49MastOil.status === 200 && e49MastItm.status === 200 && e49MastGl.status === 200 && e49MastSt403.status === 403
      && e49SalesItm.status === 200 && e49SalesSt.status === 200 && e49SalesGl403.status === 403 && e49SalesOil403.status === 403
      && e49SupOil403.status === 403 && e49SupItm403.status === 403 && e49SupGl403.status === 403 && e49SupSt403.status === 403
      && e49EntryGl403.status === 403 && e49EntryJv403.status === 403
      && e49OwnerJvSeed.status === 200
      && e49EntryUpdGl403.status === 403 && e49EntryUpdJv403.status === 403
      && e49DispUpdGl403.status === 403 && e49DispUpdJv403.status === 403
      && e49MvUpdSt403.status === 403 && e49MvVoidSt403.status === 403
      && e49EntrySync.status === 200 && e49MvSync.status === 200
      && e49Persisted
    );
    if (e49Ok) {
      pass('edge-49-records-rbac-items-gl-oillog', 'CustomDispatch/Master/MasterVoid/Sales/Supervisor/Entry create, existing-row update & /api/sync fast-path RBAC + D1 persistence verified');
    } else {
      fail('edge-49-records-rbac-items-gl-oillog', JSON.stringify({
        tokens: [Boolean(disp49), Boolean(mast49), Boolean(mastVoid49), Boolean(sales49), Boolean(sup49)],
        disp: [e49DispOil.status, e49DispItm.status, e49DispGl403.status, e49DispSt.status],
        mast: [e49MastOil.status, e49MastItm.status, e49MastGl.status, e49MastSt403.status],
        sales: [e49SalesItm.status, e49SalesSt.status, e49SalesGl403.status, e49SalesOil403.status],
        sup: [e49SupOil403.status, e49SupItm403.status, e49SupGl403.status, e49SupSt403.status],
        entryDenied: [e49EntryGl403.status, e49EntryJv403.status],
        updDenied: [e49OwnerJvSeed.status, e49EntryUpdGl403.status, e49EntryUpdJv403.status, e49DispUpdGl403.status, e49DispUpdJv403.status, e49MvUpdSt403.status, e49MvVoidSt403.status, e49EntrySync.status, e49MvSync.status],
        persisted: e49Persisted
      }));
      }

    // 50. Mandatory Void Reason Rule (G_VOID_REASON) across /records, /industry_domain_store, RBAC precedence & alert_rules override tuning
    const todayBeirut = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Beirut' }).format(new Date());
    const vrBigId = 'exp-vr-big-' + Date.now();
    const vrSmallId = 'exp-vr-small-' + Date.now();
    await httpReq('POST', '/app/api/records', { table: 'expenses', record: { id: vrBigId, company: 'WTC', date: todayBeirut, amount_usd: 600, voided: false } }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/records', { table: 'expenses', record: { id: vrSmallId, company: 'WTC', date: todayBeirut, amount_usd: 45, voided: false } }, { 'X-ISABI-Session': ownerToken });
    const vrEntry403 = await httpReq('POST', '/app/api/records', { table: 'expenses', record: { id: vrBigId, company: 'WTC', voided: true } }, { 'X-ISABI-Session': entryToken });
    const vrBig400 = await httpReq('POST', '/app/api/records', { table: 'expenses', record: { id: vrBigId, company: 'WTC', voided: true } }, { 'X-ISABI-Session': ownerToken });
    const preAr48 = await httpReq('GET', '/app/api/alert_rules', null, { 'X-ISABI-Session': ownerToken });
    const preOv48 = (preAr48.json && preAr48.json.overrides) || {};
    const preCust48 = (preAr48.json && preAr48.json.custom) || [];
    const arTsNow = new Date().toISOString();
    await httpReq('POST', '/app/api/alert_rules', {
      overrides: Object.assign({}, preOv48, { G_VOID_REASON: { enabled: true, params: { min_usd: 30, backdated_days: 0 }, updated_at: arTsNow } }),
      custom: preCust48
    }, { 'X-ISABI-Session': ownerToken });
    const vrTunedSmall400 = await httpReq('POST', '/app/api/records', { table: 'expenses', record: { id: vrSmallId, company: 'WTC', voided: true } }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/alert_rules', {
      overrides: Object.assign({}, preOv48, { G_VOID_REASON: { enabled: true, params: { min_usd: 500, backdated_days: 1 }, updated_at: new Date(Date.now() + 1000).toISOString() } }),
      custom: preCust48
    }, { 'X-ISABI-Session': ownerToken });
    const vrSmall200 = await httpReq('POST', '/app/api/records', { table: 'expenses', record: { id: vrSmallId, company: 'WTC', voided: true } }, { 'X-ISABI-Session': ownerToken });
    const vrBig200 = await httpReq('POST', '/app/api/records', { table: 'expenses', record: { id: vrBigId, company: 'WTC', voided: true, void_reason: 'Edge high-value void' } }, { 'X-ISABI-Session': ownerToken });

    // Industry domain vertical USD key (gross_prem_usd >= 500) + note clear on already-voided row
    const polId48 = 'POL-EDGE-VR-' + Date.now();
    await httpReq('POST', '/app/api/industry_domain_store', {
      industryCustomRows: { ins_policies: [{ id: polId48, company: 'Insurance Company', date: todayBeirut, carrier: 'MedGulf', gross_prem_usd: 750, rev: 1, voided: false }] }
    }, { 'X-ISABI-Session': ownerToken });
    const domEntry403 = await httpReq('POST', '/app/api/industry_domain_store', {
      industryCustomRows: { ins_policies: [{ id: polId48, company: 'Insurance Company', date: todayBeirut, carrier: 'MedGulf', gross_prem_usd: 750, rev: 2, voided: true }] }
    }, { 'X-ISABI-Session': entryToken });
    const domVert400 = await httpReq('POST', '/app/api/industry_domain_store', {
      industryCustomRows: { ins_policies: [{ id: polId48, company: 'Insurance Company', date: todayBeirut, carrier: 'MedGulf', gross_prem_usd: 750, rev: 2, voided: true }] }
    }, { 'X-ISABI-Session': ownerToken });
    const domVert200 = await httpReq('POST', '/app/api/industry_domain_store', {
      industryCustomRows: { ins_policies: [{ id: polId48, company: 'Insurance Company', date: todayBeirut, carrier: 'MedGulf', gross_prem_usd: 750, rev: 2, voided: true, void_reason: 'Edge vertical audit void' }] }
    }, { 'X-ISABI-Session': ownerToken });
    const domVertClear200 = await httpReq('POST', '/app/api/industry_domain_store', {
      industryCustomRows: { ins_policies: [{ id: polId48, company: 'Insurance Company', date: todayBeirut, carrier: 'MedGulf', gross_prem_usd: 750, rev: 3, voided: true, void_reason: '' }] }
    }, { 'X-ISABI-Session': ownerToken });

    // 50b. Anti-spoofing: incoming voided_by="Workbook match" or twin_of="fake" cannot bypass G_VOID_REASON (#30), and non-Owner twin_of is stripped
    const spoofByRecId = 'exp-vr-spoof-by-' + Date.now();
    const spoofTwinRecId = 'exp-vr-spoof-tw-' + Date.now();
    await httpReq('POST', '/app/api/records', { table: 'expenses', record: { id: spoofByRecId, company: 'BBConstruction', date: todayBeirut, amount_usd: 820, voided: false } }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/records', { table: 'expenses', record: { id: spoofTwinRecId, company: 'BBConstruction', date: todayBeirut, amount_usd: 820, voided: false } }, { 'X-ISABI-Session': ownerToken });
    const spoofSupBy400 = await httpReq('POST', '/app/api/records', { table: 'expenses', record: { id: spoofByRecId, company: 'BBConstruction', voided: true, voided_by: 'Workbook match' } }, { 'X-ISABI-Session': bbcSupToken });
    const spoofSupTwin400 = await httpReq('POST', '/app/api/records', { table: 'expenses', record: { id: spoofTwinRecId, company: 'BBConstruction', voided: true, twin_of: 'fake-twin-1' } }, { 'X-ISABI-Session': bbcSupToken });
    const spoofOwnBy400 = await httpReq('POST', '/app/api/records', { table: 'expenses', record: { id: spoofByRecId, company: 'BBConstruction', voided: true, voided_by: 'Workbook match' } }, { 'X-ISABI-Session': ownerToken });
    const spoofOwnTwin400 = await httpReq('POST', '/app/api/records', { table: 'expenses', record: { id: spoofTwinRecId, company: 'BBConstruction', voided: true, twin_of: 'fake-twin-1' } }, { 'X-ISABI-Session': ownerToken });
    const spoofSupTwinWithReason200 = await httpReq('POST', '/app/api/records', { table: 'expenses', record: { id: spoofTwinRecId, company: 'BBConstruction', voided: true, void_reason: 'Valid reason with forged twin', twin_of: 'fake-twin-1', voided_by: 'Workbook match' } }, { 'X-ISABI-Session': bbcSupToken });
    const spoofReadBack = await httpReq('GET', '/app/api/records?table=expenses&company=BBConstruction&limit=500', null, { 'X-ISABI-Session': bbcSupToken });
    const spoofRowAfter = (spoofReadBack.json?.rows || []).find(r => r && r.id === spoofTwinRecId);

    // 50c. Domain row print metadata persists on /api/industry_domain_store & read-only seat cannot tamper with print count on void
    const printPolId = 'POL-EDGE-PRT-' + Date.now();
    await httpReq('POST', '/app/api/industry_domain_store', {
      industryCustomRows: { ins_policies: [{ id: printPolId, company: 'Insurance Company', date: todayBeirut, carrier: 'MedGulf', gross_prem_usd: 220, rev: 1, voided: false }] }
    }, { 'X-ISABI-Session': ownerToken });
    const domPrintStamp200 = await httpReq('POST', '/app/api/industry_domain_store', {
      industryCustomRows: { ins_policies: [{ id: printPolId, company: 'Insurance Company', date: todayBeirut, carrier: 'MedGulf', gross_prem_usd: 220, rev: 2, voided: false, printed_at: new Date().toISOString(), last_printed_at: new Date().toISOString(), print_count: 1 }] }
    }, { 'X-ISABI-Session': ownerToken });
    const domPrintRead = await httpReq('GET', '/app/api/industry_domain_store', null, { 'X-ISABI-Session': ownerToken });
    const domPrintRow = ((domPrintRead.json?.industryCustomRows || {}).ins_policies || []).find(r => r && r.id === printPolId);
    const spoofPrintSupClear403 = await httpReq('POST', '/app/api/records', {
      table: 'expenses', record: { id: spoofByRecId, company: 'BBConstruction', voided: true, void_reason: 'Attempt print tamper', print_count: 99 }
    }, { 'X-ISABI-Session': bbcSupToken });

    // 50d. /api/sync op=patch enforces G_VOID_REASON (#30) on active->void transitions and strips non-Owner twin_of/twin_difference
    const sync49Read0 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const sync49Doc0 = sync49Read0.json?.docs?.mfg_web_store || {};
    const sync49Ts0 = String(sync49Doc0.updatedAt || '');
    const sync49Exps0 = (sync49Doc0.customRecords?.expenses || []).filter(x => x && x.id !== spoofByRecId);
    const ownSyncVr400 = await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'mfg_web_store', ifMatchUpdatedAt: sync49Ts0,
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: new Date(Math.max(Date.now(), (Date.parse(sync49Ts0) || 0) + 1000)).toISOString(),
          customRecords: Object.assign({}, sync49Doc0.customRecords || {}, {
            expenses: sync49Exps0.concat([{ id: spoofByRecId, company: 'BBConstruction', date: todayBeirut, amount_usd: 820, voided: true, voided_by: 'Workbook match', twin_of: 'fake-sync-twin' }])
          })
        }
      }
    }, { 'X-ISABI-Session': ownerToken });

    const sync49Pol400 = await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'mfg_web_store', ifMatchUpdatedAt: sync49Ts0,
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: new Date(Math.max(Date.now(), (Date.parse(sync49Ts0) || 0) + 1500)).toISOString(),
          industryCustomRows: Object.assign({}, sync49Doc0.industryCustomRows || {}, {
            ins_policies: ((sync49Doc0.industryCustomRows || {}).ins_policies || []).filter(x => x && x.id !== 'POL-SYNC-VR-49D').concat([
              { id: 'POL-SYNC-VR-49D', company: 'Insurance Company', date: todayBeirut, carrier: 'MedGulf', gross_prem_usd: 750, voided: true, rev: 1 }
            ])
          })
        }
      }
    }, { 'X-ISABI-Session': ownerToken });

    const supSync49Read0 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': bbcSupToken });
    const supSync49Doc0 = supSync49Read0.json?.docs?.mfg_web_store || {};
    const supSync49Ts0 = String(supSync49Doc0.updatedAt || '');
    const supSync49Exps0 = (supSync49Doc0.customRecords?.expenses || []).filter(x => x && x.id !== spoofByRecId);
    const supSyncVr400 = await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'mfg_web_store', ifMatchUpdatedAt: supSync49Ts0,
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: new Date(Math.max(Date.now(), (Date.parse(supSync49Ts0) || 0) + 2000)).toISOString(),
          customRecords: Object.assign({}, supSync49Doc0.customRecords || {}, {
            expenses: supSync49Exps0.concat([{ id: spoofByRecId, company: 'BBConstruction', date: todayBeirut, amount_usd: 820, voided: true, twin_of: 'fake-sup-sync-twin' }])
          })
        }
      }
    }, { 'X-ISABI-Session': bbcSupToken });

    const supSyncValid200 = await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'mfg_web_store', awaitMirror: true, ifMatchUpdatedAt: supSync49Ts0,
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: new Date(Math.max(Date.now(), (Date.parse(supSync49Ts0) || 0) + 3000)).toISOString(),
          customRecords: Object.assign({}, supSync49Doc0.customRecords || {}, {
            expenses: supSync49Exps0.concat([{ id: spoofByRecId, company: 'BBConstruction', date: todayBeirut, amount_usd: 820, voided: true, void_reason: 'Valid sync void note', voided_by: 'Workbook match', twin_of: 'fake-sup-sync-twin', twin_difference: 9 }])
          })
        }
      }
    }, { 'X-ISABI-Session': bbcSupToken });
    const supSyncReadBack = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': bbcSupToken });
    const supSyncExpAfter = ((supSyncReadBack.json?.docs?.mfg_web_store?.customRecords || {}).expenses || []).find(r => r && r.id === spoofByRecId);

    const entSyncRead0 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': entryToken });
    const entSyncDoc0 = entSyncRead0.json?.docs?.mfg_web_store || {};
    const entSyncTs0 = String(entSyncDoc0.updatedAt || '');
    const entTwinExpId = 'exp-sync-ent-tw-' + Date.now();
    const entSyncTwin200 = await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'mfg_web_store', awaitMirror: true, ifMatchUpdatedAt: entSyncTs0,
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: new Date(Math.max(Date.now(), (Date.parse(entSyncTs0) || 0) + 4000)).toISOString(),
          customRecords: Object.assign({}, entSyncDoc0.customRecords || {}, {
            expenses: (entSyncDoc0.customRecords?.expenses || []).concat([{ id: entTwinExpId, company: 'WTC', date: todayBeirut, amount_usd: 115, voided: false, twin_of: 'fake-entry-sync-twin', twin_difference: -4 }])
          })
        }
      }
    }, { 'X-ISABI-Session': entryToken });
    const entSyncReadBack = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': entryToken });
    const entSyncExpAfter = ((entSyncReadBack.json?.docs?.mfg_web_store?.customRecords || {}).expenses || []).find(r => r && r.id === entTwinExpId);
    const syncGuardsOk = Boolean(
      ownSyncVr400.status === 400 && ownSyncVr400.json?.code === 'void_reason_required' &&
      sync49Pol400.status === 400 && sync49Pol400.json?.code === 'void_reason_required' &&
      supSyncVr400.status === 400 && supSyncVr400.json?.code === 'void_reason_required' &&
      supSyncValid200.status === 200 && supSyncExpAfter && supSyncExpAfter.voided === true &&
      !supSyncExpAfter.twin_of && supSyncExpAfter.twin_difference === undefined &&
      !/workbook/i.test(String(supSyncExpAfter.voided_by || '')) &&
      entSyncTwin200.status === 200 && entSyncExpAfter && !entSyncExpAfter.twin_of && entSyncExpAfter.twin_difference === undefined
    );

    if (
      vrEntry403.status === 403 && domEntry403.status === 403 &&
      vrBig400.status === 400 && vrBig400.json?.code === 'void_reason_required' &&
      vrTunedSmall400.status === 400 && vrTunedSmall400.json?.code === 'void_reason_required' &&
      vrSmall200.status === 200 && vrBig200.status === 200 &&
      domVert400.status === 400 && domVert400.json?.code === 'void_reason_required' &&
      domVert200.status === 200 && domVertClear200.status === 200 &&
      spoofSupBy400.status === 400 && spoofSupTwin400.status === 400 &&
      spoofOwnBy400.status === 400 && spoofOwnTwin400.status === 400 &&
      spoofSupTwinWithReason200.status === 200 && spoofRowAfter && !spoofRowAfter.twin_of &&
      !/workbook/i.test(String(spoofRowAfter.voided_by || '')) &&
      domPrintStamp200.status === 200 && domPrintRow && Number(domPrintRow.print_count) === 1 && Boolean(domPrintRow.printed_at) &&
      spoofPrintSupClear403.status === 403 &&
      syncGuardsOk
    ) {
      pass('edge-50-mandatory-void-reason', '403-before-400 + alert_rules min_usd=30 + vertical gross_prem_usd + Workbook/twin_of spoof blocked + domain print_count persisted + read-only print tamper 403 + /api/sync guards');
    } else {
      fail('edge-50-mandatory-void-reason', JSON.stringify({
        entry403: [vrEntry403.status, domEntry403.status],
        big400: [vrBig400.status, vrBig400.json],
        tuned400: [vrTunedSmall400.status, vrTunedSmall400.json],
        small200: vrSmall200.status,
        big200: vrBig200.status,
        domVert400: [domVert400.status, domVert400.json],
        domVert200: domVert200.status,
        domClear200: domVertClear200.status,
        spoof400s: [spoofSupBy400.status, spoofSupTwin400.status, spoofOwnBy400.status, spoofOwnTwin400.status],
        spoofRowAfter,
        domPrint: [domPrintStamp200.status, domPrintRow],
        spoofPrintSupClear403: spoofPrintSupClear403.status,
        syncGuardsOk,
        sync49Statuses: [ownSyncVr400.status, sync49Pol400.status, supSyncVr400.status, supSyncValid200.status, entSyncTwin200.status],
        supSyncExpAfter,
        entSyncExpAfter
      }).slice(0, 900));
    }

    // 51. D1 Pre-Void Field Edit Lock, Anti-Tamper (/records, /sync, /industry_domain_store) & Read-Only Supervisor Void/Restore
    const e51TodayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Beirut' }).format(new Date());
    const e51ForgedNewCreate = await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: {
        id: 'exp-e51-forged-new', company: 'BBConstruction', date: e51TodayIso, supplier: 'E51 Forge',
        category: 'Supply', amount: 40, amount_usd: 40, total: 40, voided: false,
        _pre_void_orig: { amount: 9999 },
        _pre_void_edits: [{ at: '2020-01-01T00:00:00Z', by: 'Forager', changes: { amount: { from: 9999, to: 40 } } }]
      }
    }, { 'X-ISABI-Session': ownerToken });

    const e51Id = 'exp-e51-diff-bbc';
    const e51Create = await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: e51Id, company: 'BBConstruction', date: e51TodayIso, supplier: 'E51 Supplier', category: 'Supply', amount: 580, amount_usd: 580, total: 580, voided: false }
    }, { 'X-ISABI-Session': ownerToken });
    const e51Edit = await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: e51Id, company: 'BBConstruction', date: e51TodayIso, supplier: 'E51 Supplier', category: 'Supply', amount: 95, amount_usd: 95, total: 95, voided: false }
    }, { 'X-ISABI-Session': ownerToken });
    const e51TamperRec = await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: e51Id, company: 'BBConstruction', amount: 95, _pre_void_orig: { amount: 1 }, _pre_void_edits: [] }
    }, { 'X-ISABI-Session': ownerToken });
    const e51SupVoid = await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: e51Id, company: 'BBConstruction', voided: true, void_reason: 'E51 sup void after edit', discount: 0, vat: 0, mat_indiff: false }
    }, { 'X-ISABI-Session': bbcSupToken });
    const e51SupRestore = await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: e51Id, company: 'BBConstruction', voided: false, discount: 0, vat: 0, mat_indiff: false }
    }, { 'X-ISABI-Session': bbcSupToken });
    const e51SyncRead2 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const e51Doc2 = e51SyncRead2.json?.docs?.mfg_web_store || {};
    const e51Exps2 = (e51Doc2.customRecords?.expenses || []).filter(x => x && x.id !== e51Id);
    const e51SyncTamper = await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
      ifMatchUpdatedAt: String(e51Doc2.updatedAt || ''),
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: new Date(Math.max(Date.now(), Date.parse(e51Doc2.updatedAt || 0) + 1000)).toISOString(),
          customRecords: Object.assign({}, e51Doc2.customRecords || {}, {
            expenses: e51Exps2.concat([{ id: e51Id, company: 'BBConstruction', date: e51TodayIso, supplier: 'E51 Supplier', category: 'Supply', amount: 95, amount_usd: 95, total: 95, voided: false, _pre_void_orig: { amount: 2 }, _pre_void_edits: [] }])
          })
        }
      }
    }, { 'X-ISABI-Session': ownerToken });
    const e51Get = await httpReq('GET', '/app/api/records?table=expenses&company=BBConstruction&limit=500', null, { 'X-ISABI-Session': bbcSupToken });
    const e51Row = (e51Get.json?.rows || []).find(r => r && r.id === e51Id);
    const e51ForgedNewRow = (e51Get.json?.rows || []).find(r => r && r.id === 'exp-e51-forged-new');

    const e51DomKey = 'Manufacturing::Sites::E51-CELL-BBC';
    await httpReq('POST', '/app/api/industry_domain_store', {
      industryRowEdits: { [e51DomKey]: { ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'E51-CELL-BBC', company: 'BBConstruction', headers: ['Site', 'Total'], cells: ['E51-CELL-BBC', '720'], rev: 1, voided: false } }
    }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/industry_domain_store', {
      industryRowEdits: { [e51DomKey]: { ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'E51-CELL-BBC', company: 'BBConstruction', headers: ['Site', 'Total'], cells: ['E51-CELL-BBC', '110'], rev: 2, voided: true, void_reason: 'E51 cell void' } }
    }, { 'X-ISABI-Session': ownerToken });
    const e51DomGet = await httpReq('GET', '/app/api/industry_domain_store', null, { 'X-ISABI-Session': bbcSupToken });
    const e51CellAfter = (e51DomGet.json?.industryRowEdits || {})[e51DomKey];

    // Read-Only Supervisor /api/sync attempt to tamper D1-only E51-CELL-BBC cells -> reverted; pure unvoid -> 200 & voided=false
    const e51SyncRead3 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': bbcSupToken });
    const e51Doc3 = e51SyncRead3.json?.docs?.mfg_web_store || {};
    const e51SupSyncTamper = await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
      ifMatchUpdatedAt: String(e51Doc3.updatedAt || ''),
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: new Date(Math.max(Date.now(), Date.parse(e51Doc3.updatedAt || 0) + 1000)).toISOString(),
          industryRowEdits: Object.assign({}, e51Doc3.industryRowEdits || {}, {
            [e51DomKey]: { ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'E51-CELL-BBC', company: 'BBConstruction', headers: ['Site', 'Total'], cells: ['E51-CELL-BBC', '9999'], rev: 3, voided: false }
          })
        }
      }
    }, { 'X-ISABI-Session': bbcSupToken });
    const e51DomAfterSupTamper = ((await httpReq('GET', '/app/api/industry_domain_store', null, { 'X-ISABI-Session': bbcSupToken })).json?.industryRowEdits || {})[e51DomKey];

    const e51SyncRead4 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': bbcSupToken });
    const e51Doc4 = e51SyncRead4.json?.docs?.mfg_web_store || {};
    const e51SupSyncUnvoid = await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
      ifMatchUpdatedAt: String(e51Doc4.updatedAt || ''),
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: new Date(Math.max(Date.now(), Date.parse(e51Doc4.updatedAt || 0) + 1000)).toISOString(),
          industryRowEdits: Object.assign({}, e51Doc4.industryRowEdits || {}, {
            [e51DomKey]: { ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'E51-CELL-BBC', company: 'BBConstruction', headers: ['Site', 'Total'], cells: ['E51-CELL-BBC', '110'], rev: 4, voided: false, void_reason: '' }
          })
        }
      }
    }, { 'X-ISABI-Session': bbcSupToken });
    const e51DomAfterSupUnvoid = ((await httpReq('GET', '/app/api/industry_domain_store', null, { 'X-ISABI-Session': bbcSupToken })).json?.industryRowEdits || {})[e51DomKey];

    // Finding #1: Read-Only Supervisor initial void via /app/api/sync preserves void_reason on customRecords + industryCustomRows
    await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: 'exp-e51-ro-init', company: 'BBConstruction', date: e51TodayIso, supplier: 'E51 RO Init', category: 'Supply', amount: 120, amount_usd: 120, total: 120, voided: false }
    }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/industry_domain_store', {
      industryCustomRows: { mfg_sites: [{ id: 'DOM-E51-RO-INIT', company: 'BBConstruction', ind: 'Manufacturing', name: 'E51 RO Dom Init', amount_usd: 220, rev: 1, voided: false }] }
    }, { 'X-ISABI-Session': ownerToken });
    const e51SyncRead5 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': bbcSupToken });
    const e51Doc5 = e51SyncRead5.json?.docs?.mfg_web_store || {};
    const e51Exps5 = (e51Doc5.customRecords?.expenses || []).filter(x => x && x.id !== 'exp-e51-ro-init');
    const e51Sites5 = (e51Doc5.industryCustomRows?.mfg_sites || []).filter(x => x && x.id !== 'DOM-E51-RO-INIT');
    const e51RoInitSync = await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
      ifMatchUpdatedAt: String(e51Doc5.updatedAt || ''),
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: new Date(Math.max(Date.now(), Date.parse(e51Doc5.updatedAt || 0) + 1000)).toISOString(),
          customRecords: Object.assign({}, e51Doc5.customRecords || {}, {
            expenses: e51Exps5.concat([{ id: 'exp-e51-ro-init', company: 'BBConstruction', date: e51TodayIso, supplier: 'E51 RO Init', category: 'Supply', amount: 120, amount_usd: 120, total: 120, voided: true, void_reason: 'E51 RO initial reason' }])
          }),
          industryCustomRows: Object.assign({}, e51Doc5.industryCustomRows || {}, {
            mfg_sites: e51Sites5.concat([{ id: 'DOM-E51-RO-INIT', company: 'BBConstruction', ind: 'Manufacturing', name: 'E51 RO Dom Init', amount_usd: 220, rev: 2, voided: true, void_reason: 'E51 DOM RO init reason' }])
          })
        }
      }
    }, { 'X-ISABI-Session': bbcSupToken });
    const e51RoInitRecRow = ((await httpReq('GET', '/app/api/records?table=expenses&company=BBConstruction&limit=500', null, { 'X-ISABI-Session': bbcSupToken })).json?.rows || []).find(r => r && r.id === 'exp-e51-ro-init');
    const e51RoInitDomRow = (((await httpReq('GET', '/app/api/industry_domain_store', null, { 'X-ISABI-Session': bbcSupToken })).json?.industryCustomRows || {}).mfg_sites || []).find(r => r && r.id === 'DOM-E51-RO-INIT');
    const e51RoInitReasonOk = Boolean(
      e51RoInitSync.status === 200 &&
      e51RoInitRecRow && e51RoInitRecRow.voided === true && e51RoInitRecRow.void_reason === 'E51 RO initial reason' &&
      e51RoInitDomRow && e51RoInitDomRow.voided === true && e51RoInitDomRow.void_reason === 'E51 DOM RO init reason'
    );

    // Finding #2: Stale-KV /api/sync after /api/records edit preserves D1 edited amount & _pre_void_* history
    const e51SyncRead6 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const e51Doc6 = e51SyncRead6.json?.docs?.mfg_web_store || {};
    const e51Exps6 = (e51Doc6.customRecords?.expenses || []).filter(x => x && x.id !== 'exp-e51-stale-sync');
    await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
      ifMatchUpdatedAt: String(e51Doc6.updatedAt || ''),
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: new Date(Math.max(Date.now(), Date.parse(e51Doc6.updatedAt || 0) + 1000)).toISOString(),
          customRecords: Object.assign({}, e51Doc6.customRecords || {}, {
            expenses: e51Exps6.concat([{ id: 'exp-e51-stale-sync', company: 'BBConstruction', date: e51TodayIso, supplier: 'Stale Sync V', category: 'Supply', amount: 500, amount_usd: 500, total: 500, voided: false }])
          })
        }
      }
    }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: 'exp-e51-stale-sync', company: 'BBConstruction', date: e51TodayIso, supplier: 'Stale Sync V', category: 'Supply', amount: 90, amount_usd: 90, total: 90, voided: false }
    }, { 'X-ISABI-Session': ownerToken });
    const e51SyncRead7 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const e51Doc7 = e51SyncRead7.json?.docs?.mfg_web_store || {};
    const e51Exps7 = (e51Doc7.customRecords?.expenses || []).filter(x => x && x.id !== 'exp-e51-stale-sync');
    await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
      ifMatchUpdatedAt: String(e51Doc7.updatedAt || ''),
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: new Date(Math.max(Date.now(), Date.parse(e51Doc7.updatedAt || 0) + 1000)).toISOString(),
          customRecords: Object.assign({}, e51Doc7.customRecords || {}, {
            expenses: e51Exps7.concat([{ id: 'exp-e51-stale-sync', company: 'BBConstruction', date: e51TodayIso, supplier: 'Stale Sync V', category: 'Supply', amount: 500, amount_usd: 500, total: 500, modified_at: '2026-11-18T23:59:59Z', voided: false }])
          })
        }
      }
    }, { 'X-ISABI-Session': ownerToken });
    const e51StaleAfter = ((await httpReq('GET', '/app/api/records?table=expenses&company=BBConstruction&limit=500', null, { 'X-ISABI-Session': ownerToken })).json?.rows || []).find(r => r && r.id === 'exp-e51-stale-sync');
    const e51StaleNoClobberOk = Boolean(
      e51StaleAfter && Number(e51StaleAfter.amount) === 90 &&
      Number(e51StaleAfter._pre_void_orig?.amount || 0) === 500 &&
      Array.isArray(e51StaleAfter._pre_void_edits) && e51StaleAfter._pre_void_edits.length === 1
    );

    // Finding #5: D1 16 sequential /api/records edits cap at 15 (keeping edit #1 orig) + industryCustomRows anti-tamper & actor binding
    await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: 'exp-e51-cap15', company: 'BBConstruction', date: e51TodayIso, supplier: 'Cap15 V', category: 'Supply', amount: 100, amount_usd: 100, total: 100, voided: false }
    }, { 'X-ISABI-Session': ownerToken });
    for (let ci = 1; ci <= 16; ci++) {
      await httpReq('POST', '/app/api/records', {
        table: 'expenses',
        record: { id: 'exp-e51-cap15', company: 'BBConstruction', date: e51TodayIso, supplier: 'Cap15 V', category: 'Supply', amount: 100 + ci * 10, amount_usd: 100 + ci * 10, total: 100 + ci * 10, voided: false }
      }, { 'X-ISABI-Session': ownerToken });
    }
    const e51CapRow = ((await httpReq('GET', '/app/api/records?table=expenses&company=BBConstruction&limit=500', null, { 'X-ISABI-Session': ownerToken })).json?.rows || []).find(r => r && r.id === 'exp-e51-cap15');
    await httpReq('POST', '/app/api/industry_domain_store', {
      industryCustomRows: { mfg_sites: [{ id: 'E51-ICR-TAMPER', company: 'BBConstruction', ind: 'Manufacturing', name: 'E51 ICR Site', amount_usd: 410, rev: 1, voided: false }] }
    }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/industry_domain_store', {
      industryCustomRows: { mfg_sites: [{ id: 'E51-ICR-TAMPER', company: 'BBConstruction', ind: 'Manufacturing', name: 'E51 ICR Site', amount_usd: 130, rev: 2, voided: false }] }
    }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/industry_domain_store', {
      industryCustomRows: { mfg_sites: [{ id: 'E51-ICR-TAMPER', company: 'BBConstruction', ind: 'Manufacturing', name: 'E51 ICR Site', amount_usd: 130, rev: 3, voided: false, _pre_void_orig: { amount_usd: 1 }, _pre_void_edits: [{ at: '2020-01-01T00:00:00Z', by: 'Attacker', changes: { amount_usd: { from: 1, to: 130 } } }] }] }
    }, { 'X-ISABI-Session': ownerToken });
    const e51IcrAfter = (((await httpReq('GET', '/app/api/industry_domain_store', null, { 'X-ISABI-Session': ownerToken })).json?.industryCustomRows || {}).mfg_sites || []).find(r => r && r.id === 'E51-ICR-TAMPER');
    const e51CapAndIcrOk = Boolean(
      e51CapRow && Number(e51CapRow._pre_void_orig?.amount || 0) === 100 &&
      Array.isArray(e51CapRow._pre_void_edits) && e51CapRow._pre_void_edits.length === 15 &&
      Number(e51CapRow._pre_void_edits[14]?.changes?.amount?.to || 0) === 260 &&
      e51IcrAfter && Number(e51IcrAfter._pre_void_orig?.amount_usd || 0) === 410 &&
      Array.isArray(e51IcrAfter._pre_void_edits) && e51IcrAfter._pre_void_edits.length === 1 &&
      !/Attacker/i.test(String(e51IcrAfter._pre_void_edits[0]?.by || ''))
    );

    // First-edit sibling seed row (!ex) in /api/industry_domain_store preserves verified single-step _pre_void_* with server actor & blocks forged multi-edit/voided creates
    const e51SeedInitKey = 'Manufacturing::Sites::E51-SEED-FIRST';
    const e51SeedBadKey = 'Manufacturing::Sites::E51-SEED-FORGED';
    await httpReq('POST', '/app/api/industry_domain_store', {
      industryRowEdits: {
        [e51SeedInitKey]: {
          ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'E51-SEED-FIRST', company: 'BBConstruction',
          headers: ['Site', 'Total'], cells: ['E51-SEED-FIRST', '310'], rev: 1, voided: false,
          _pre_void_orig: { site: 'E51-SEED-FIRST', total: '640' },
          _pre_void_edits: [{ at: '2020-01-01T00:00:00Z', by: 'SpoofActor', changes: { total: { from: '640', to: '310' } } }]
        },
        [e51SeedBadKey]: {
          ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'E51-SEED-FORGED', company: 'BBConstruction',
          headers: ['Site', 'Total'], cells: ['E51-SEED-FORGED', '40'], rev: 1, voided: true, void_reason: 'forged create',
          _pre_void_orig: { site: 'E51-SEED-FORGED', total: '9999' },
          _pre_void_edits: [{ at: '2020-01-01T00:00:00Z', by: 'SpoofActor', changes: { total: { from: '9999', to: '40' } } }]
        }
      }
    }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/industry_domain_store', {
      industryRowEdits: {
        [e51SeedInitKey]: {
          ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'E51-SEED-FIRST', company: 'BBConstruction',
          headers: ['Site', 'Total'], cells: ['E51-SEED-FIRST', '310'], rev: 2, voided: true, void_reason: 'seed edit then void'
        }
      }
    }, { 'X-ISABI-Session': ownerToken });
    const e51SeedGet = await httpReq('GET', '/app/api/industry_domain_store', null, { 'X-ISABI-Session': ownerToken });
    const e51SeedGood = (e51SeedGet.json?.industryRowEdits || {})[e51SeedInitKey];
    const e51SeedBad = (e51SeedGet.json?.industryRowEdits || {})[e51SeedBadKey];
    const e51SeedInitEditOk = Boolean(
      e51SeedGood && e51SeedGood.voided === true && String(e51SeedGood._pre_void_orig?.total || '') === '640' &&
      Array.isArray(e51SeedGood._pre_void_edits) && e51SeedGood._pre_void_edits.length === 1 &&
      !/SpoofActor/i.test(String(e51SeedGood._pre_void_edits[0]?.by || '')) &&
      !/^2020/.test(String(e51SeedGood._pre_void_edits[0]?.at || '')) &&
      e51SeedBad && !e51SeedBad._pre_void_orig && !(Array.isArray(e51SeedBad._pre_void_edits) && e51SeedBad._pre_void_edits.length)
    );

    // Concurrent /api/sync vs /api/records Case A (stale pre-edit void preserves $90 + edits) & Case B (stale notes edit does not unvoid DB void)
    await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: 'exp-e51-race-a', company: 'BBConstruction', date: e51TodayIso, supplier: 'Race A', category: 'Supply', amount: 500, amount_usd: 500, total: 500, voided: false }
    }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: 'exp-e51-race-b', company: 'BBConstruction', date: e51TodayIso, supplier: 'Race B', category: 'Supply', amount: 500, amount_usd: 500, total: 500, voided: false }
    }, { 'X-ISABI-Session': ownerToken });
    const e51RaceRead0 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const e51RaceDoc0 = e51RaceRead0.json?.docs?.mfg_web_store || {};
    const e51RaceExps0 = (e51RaceDoc0.customRecords?.expenses || []).filter(x => x && x.id !== 'exp-e51-race-a' && x.id !== 'exp-e51-race-b');
    await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
      ifMatchUpdatedAt: String(e51RaceDoc0.updatedAt || ''),
      patch: {
        mfg_web_store: Object.assign({}, e51RaceDoc0, {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: new Date(Math.max(Date.now(), Date.parse(e51RaceDoc0.updatedAt || 0) + 1000)).toISOString(),
          customRecords: Object.assign({}, e51RaceDoc0.customRecords || {}, {
            expenses: e51RaceExps0.concat([
              { id: 'exp-e51-race-a', company: 'BBConstruction', date: e51TodayIso, supplier: 'Race A', category: 'Supply', amount: 500, amount_usd: 500, total: 500, voided: false },
              { id: 'exp-e51-race-b', company: 'BBConstruction', date: e51TodayIso, supplier: 'Race B', category: 'Supply', amount: 500, amount_usd: 500, total: 500, voided: false }
            ])
          })
        })
      }
    }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: 'exp-e51-race-a', company: 'BBConstruction', date: e51TodayIso, supplier: 'Race A', category: 'Supply', amount: 90, amount_usd: 90, total: 90, voided: false }
    }, { 'X-ISABI-Session': ownerToken });
    await httpReq('POST', '/app/api/records', {
      table: 'expenses',
      record: { id: 'exp-e51-race-b', company: 'BBConstruction', date: e51TodayIso, supplier: 'Race B', category: 'Supply', amount: 90, amount_usd: 90, total: 90, voided: true, void_reason: 'E51 race B void' }
    }, { 'X-ISABI-Session': ownerToken });
    const e51RaceRead1 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const e51RaceDoc1 = e51RaceRead1.json?.docs?.mfg_web_store || {};
    const e51RaceExps1 = (e51RaceDoc1.customRecords?.expenses || []).filter(x => x && x.id !== 'exp-e51-race-a' && x.id !== 'exp-e51-race-b');
    await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
      ifMatchUpdatedAt: String(e51RaceDoc1.updatedAt || ''),
      patch: {
        mfg_web_store: Object.assign({}, e51RaceDoc1, {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: new Date(Math.max(Date.now(), Date.parse(e51RaceDoc1.updatedAt || 0) + 1000)).toISOString(),
          customRecords: Object.assign({}, e51RaceDoc1.customRecords || {}, {
            expenses: e51RaceExps1.concat([
              { id: 'exp-e51-race-a', company: 'BBConstruction', date: e51TodayIso, supplier: 'Race A', category: 'Supply', amount: 500, amount_usd: 500, total: 500, voided: true, void_reason: 'stale void', modified_at: '2020-01-01T00:00:00Z' },
              { id: 'exp-e51-race-b', company: 'BBConstruction', date: e51TodayIso, supplier: 'Race B', category: 'Supply', amount: 500, amount_usd: 500, total: 500, notes: 'stale late note', voided: false }
            ])
          })
        })
      }
    }, { 'X-ISABI-Session': ownerToken });
    const e51RaceRows = (await httpReq('GET', '/app/api/records?table=expenses&company=BBConstruction&limit=500', null, { 'X-ISABI-Session': ownerToken })).json?.rows || [];
    const e51RaceAAfter = e51RaceRows.find(r => r && r.id === 'exp-e51-race-a');
    const e51RaceBAfter = e51RaceRows.find(r => r && r.id === 'exp-e51-race-b');
    const e51SyncRaceOk = Boolean(
      e51RaceAAfter && Number(e51RaceAAfter.amount) === 90 && !e51RaceAAfter.voided &&
      Array.isArray(e51RaceAAfter._pre_void_edits) && e51RaceAAfter._pre_void_edits.length === 1 &&
      e51RaceBAfter && e51RaceBAfter.voided === true && Number(e51RaceBAfter.amount) === 90
    );

    const e51Ok = Boolean(
      e51ForgedNewCreate.status === 200 && e51ForgedNewRow && !e51ForgedNewRow._pre_void_orig && !(Array.isArray(e51ForgedNewRow._pre_void_edits) && e51ForgedNewRow._pre_void_edits.length) &&
      e51Create.status === 200 && e51Edit.status === 200 && e51TamperRec.status === 200 &&
      e51SupVoid.status === 200 && e51SupRestore.status === 200 && e51SyncTamper.status === 200 &&
      e51Row && !e51Row.voided && Number(e51Row._pre_void_orig?.amount || 0) === 580 &&
      Array.isArray(e51Row._pre_void_edits) && e51Row._pre_void_edits.length === 1 &&
      e51CellAfter && e51CellAfter.voided === true && String(e51CellAfter._pre_void_orig?.total || '') === '720' &&
      Array.isArray(e51CellAfter._pre_void_edits) && e51CellAfter._pre_void_edits.length === 1 &&
      (e51SupSyncTamper.status === 403 || (e51DomAfterSupTamper && String(e51DomAfterSupTamper.cells?.[1] || '') === '110')) &&
      e51SupSyncUnvoid.status === 200 && e51DomAfterSupUnvoid && e51DomAfterSupUnvoid.voided === false && String(e51DomAfterSupUnvoid._pre_void_orig?.total || '') === '720' &&
      e51RoInitReasonOk && e51StaleNoClobberOk && e51CapAndIcrOk && e51SeedInitEditOk && e51SyncRaceOk
    );
    if (e51Ok) {
      pass('edge-51-pre-void-edit-lock-and-d1-parity', 'D1 locks _pre_void_orig/_pre_void_edits across /records, /sync, and /industry_domain_store cell edits + seed first-edit + sync/void race + Read-Only Supervisor 200 void/restore parity');
    } else {
      fail('edge-51-pre-void-edit-lock-and-d1-parity', JSON.stringify({
        statuses: [e51ForgedNewCreate.status, e51Create.status, e51Edit.status, e51TamperRec.status, e51SupVoid.status, e51SupRestore.status, e51SyncTamper.status, e51SupSyncTamper.status, e51SupSyncUnvoid.status, e51RoInitSync.status],
        e51RoInitReasonOk, e51StaleNoClobberOk, e51CapAndIcrOk, e51SeedInitEditOk, e51SyncRaceOk,
        e51ForgedNewRow, e51Row, e51CellAfter, e51DomAfterSupTamper, e51DomAfterSupUnvoid, e51RoInitRecRow, e51RoInitDomRow, e51StaleAfter, e51IcrAfter, e51SeedGood, e51SeedBad, e51RaceAAfter, e51RaceBAfter
      }).slice(0, 800));
    }

    // 52. Strict 503 (!DB) -> Demo 403 -> Auth 401 -> Role 403 -> 426 shell_outdated precedence & headerless control_store vs outdated mfg_web_store minShellVer
    const e52NoDbCall = async (routePath, bodyObj) => {
      const req = new Request(`https://example.test/app/api/${routePath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-ISABI-Demo': '1', 'CF-Connecting-IP': '10.9.52.1' },
        body: JSON.stringify(bodyObj)
      });
      const res = await onApiRequest({ request: req, env: { ISABI_JWT_SECRET: jwtSecret }, params: { route: routePath.split('/') }, waitUntil() {} });
      return res.status;
    };
    const e52_503 = await Promise.all([
      e52NoDbCall('records', { table: 'sales_tickets', record: { id: 'x', company: 'WTC' } }),
      e52NoDbCall('industry_domain_store', {}),
      e52NoDbCall('geo_config', { config: {} }),
      e52NoDbCall('sync', { op: 'patch', patch: { mfg_web_store: {} } })
    ]);
    const demoHdr = { 'X-ISABI-Demo': '1', 'X-ISABI-Shell': null };
    const e52Demo = await Promise.all([
      httpReq('POST', '/app/api/records', { table: 'sales_tickets', record: { id: 'x', company: 'WTC' } }, demoHdr),
      httpReq('POST', '/app/api/industry_domain_store', {}, demoHdr),
      httpReq('POST', '/app/api/geo_config', { config: {} }, demoHdr),
      httpReq('POST', '/app/api/sync', { op: 'patch', patch: { mfg_web_store: {} } }, demoHdr),
      httpReq('POST', '/app/api/sync', { op: 'delete', doc: 'mfg_web_store' }, demoHdr),
      httpReq('POST', '/app/api/sync', { op: 'get', doc: 'mfg_web_store' }, demoHdr),
      httpReq('POST', '/app/api/sync', '{not-json', demoHdr)
    ]);
    const unauthHdr = { 'X-ISABI-Shell': null };
    const e52Auth = await Promise.all([
      httpReq('POST', '/app/api/records', { table: 'sales_tickets', record: { id: 'x', company: 'WTC' } }, unauthHdr),
      httpReq('POST', '/app/api/industry_domain_store', {}, unauthHdr),
      httpReq('POST', '/app/api/geo_config', { config: {} }, unauthHdr),
      httpReq('POST', '/app/api/sync', '{not-json', unauthHdr)
    ]);
    const e52SupCreate = await httpReq('POST', '/app/api/users', {
      user: { id: 'u-e52-sup', email: 'e52-sup@isabi.test', full_name: 'Edge52 Supervisor', role: 'Supervisor', companies: 'WTC', pin_code: '6482', status: 'Active' }
    }, { 'X-ISABI-Session': ownerToken });
    const e52SupLogin = await httpReq('POST', '/app/api/auth/login', {
      email: 'e52-sup@isabi.test', pin: '6482', method: 'PIN'
    });
    const e52SupTok = e52SupLogin.json?.token || '';
    const e52SupEntCreate = await httpReq('POST', '/app/api/users', {
      user: { id: 'u-e52-supent', email: 'e52-supent@isabi.test', full_name: 'Edge52 Sup Entry', role: 'Supervisor + Entry', companies: 'WTC', pin_code: '6483', status: 'Active' }
    }, { 'X-ISABI-Session': ownerToken });
    const e52SupEntLogin = await httpReq('POST', '/app/api/auth/login', {
      email: 'e52-supent@isabi.test', pin: '6483', method: 'PIN'
    });
    const e52SupEntTok = e52SupEntLogin.json?.token || '';
    const e52SupGeo403 = await httpReq('POST', '/app/api/geo_config', {
      config: { companyHubs: { WTC: { lat: 33.89, lng: 35.50 } } }
    }, { 'X-ISABI-Session': e52SupTok, 'X-ISABI-Shell': '19.6.1' });
    const e52EntryGeoHub403 = await httpReq('POST', '/app/api/geo_config', {
      config: { companyHubs: { WTC: { lat: 33.89, lng: 35.50 } } }
    }, { 'X-ISABI-Session': entryToken, 'X-ISABI-Shell': '19.6.1' });
    const e52EntryGeoClr403 = await httpReq('POST', '/app/api/geo_config', {
      config: { sites: { 'wtc::customer:s1': { _pinCleared: true } } }
    }, { 'X-ISABI-Session': entryToken, 'X-ISABI-Shell': '19.6.1' });
    const e52SupEntGeo403 = await httpReq('POST', '/app/api/geo_config', {
      config: { companyHubs: { BBConstruction: { lat: 33.89, lng: 35.50 } } }
    }, { 'X-ISABI-Session': e52SupEntTok, 'X-ISABI-Shell': '19.6.1' });
    const e52EntryBadLat403 = await httpReq('POST', '/app/api/geo_config', {
      config: { companyHubs: { WTC: { lat: 999, lng: 35.50 } } }
    }, { 'X-ISABI-Session': entryToken, 'X-ISABI-Shell': MIN_SYNC_SHELL_VER });
    const e52SupEntBadLat403 = await httpReq('POST', '/app/api/geo_config', {
      config: { companyHubs: { BBConstruction: { lat: 999, lng: 35.50 } } }
    }, { 'X-ISABI-Session': e52SupEntTok, 'X-ISABI-Shell': MIN_SYNC_SHELL_VER });
    const e52Audit = await httpReq('GET', '/app/api/geo/audit?outcome=blocked_403&limit=200', null, { 'X-ISABI-Session': ownerToken });
    const e52AuditList = e52Audit.status === 200 ? (e52Audit.json?.audits || []) : [];
    const e52HasSupAudit = e52AuditList.some(a =>
      a && a.outcome === 'blocked_403' && String(a.actor_email || '').toLowerCase() === 'e52-sup@isabi.test'
    );
    const e52HasEntAudit = e52AuditList.some(a =>
      a && a.outcome === 'blocked_403' && String(a.actor_email || '').toLowerCase() === ENTRY_TEST_EMAIL.toLowerCase()
    );
    const e52HasSupEntAudit = e52AuditList.some(a =>
      a && a.outcome === 'blocked_403' && String(a.actor_email || '').toLowerCase() === 'e52-supent@isabi.test'
    );
    const e52EntryCtrl403 = await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'control_store', patch: { control_store: { _probe: 1 } }
    }, { 'X-ISABI-Session': entryToken, 'X-ISABI-Shell': '19.6.1' });
    const e52EntryMultiCtrl403 = await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'mfg_web_store', patch: { mfg_web_store: { minShellVer: MIN_SYNC_SHELL_VER }, control_store: { _probe: 1 } }
    }, { 'X-ISABI-Session': entryToken, 'X-ISABI-Shell': '19.6.1' });
    const e52RoleBefore426 = await Promise.all([
      httpReq('POST', '/app/api/records', { table: 'fx_rates', record: { id: 'fx-e52-403', rate: 89500 } }, { 'X-ISABI-Session': entryToken, 'X-ISABI-Shell': '19.6.1' }),
      httpReq('POST', '/app/api/records', { table: 'sales_tickets', record: { id: 'st-e52-bbc-403', company: 'BBConstruction' } }, { 'X-ISABI-Session': entryToken, 'X-ISABI-Shell': '19.6.1' }),
      httpReq('POST', '/app/api/records', { table: 'sales_tickets', record: { id: 'st-e52-sup-403', company: 'WTC' } }, { 'X-ISABI-Session': e52SupTok, 'X-ISABI-Shell': '19.6.1' }),
      httpReq('POST', '/app/api/industry_domain_store', { industryCustomRows: { re_invoicing: [{ id: 'dom-e52-sup-403', company: 'WTC' }] } }, { 'X-ISABI-Session': e52SupTok, 'X-ISABI-Shell': '19.6.1' }),
      httpReq('POST', '/app/api/industry_domain_store', { industryRowEdits: { 'WF::period_close::wtc::2026-11': { company: 'WTC', locked: true, rev: 1 } } }, { 'X-ISABI-Session': entryToken, 'X-ISABI-Shell': '19.6.1' })
    ]);
    const oldHdr = { 'X-ISABI-Session': ownerToken, 'X-ISABI-Shell': '19.6.1' };
    const e52_426 = await Promise.all([
      httpReq('POST', '/app/api/records', { table: 'sales_tickets', record: { id: 'st-e52-426', company: 'WTC' } }, oldHdr),
      httpReq('POST', '/app/api/records', { op: 'rollback', rollbackToken: 'tok-x' }, oldHdr),
      httpReq('POST', '/app/api/industry_domain_store', { industryCustomRows: { re_invoicing: [{ id: 'dom-e52-426', company: '4235 Company S.A.L' }] } }, oldHdr),
      httpReq('POST', '/app/api/industry_domain_store', { op: 'rollback', rollbackToken: 'tok-x' }, oldHdr),
      httpReq('POST', '/app/api/geo_config', { config: { companyHubs: { WTC: { lat: 33.89, lng: 35.50 } } } }, oldHdr),
      httpReq('POST', '/app/api/sync', { op: 'patch', doc: 'mfg_web_store', patch: { mfg_web_store: { minShellVer: MIN_SYNC_SHELL_VER, customRecords: {} } } }, oldHdr)
    ]);
    const hdrlessOwner = { 'X-ISABI-Session': ownerToken, 'X-ISABI-Shell': null };
    const stampedOwner = { 'X-ISABI-Session': ownerToken, 'X-ISABI-Shell': MIN_SYNC_SHELL_VER };
    const e52AuthGet200 = await httpReq('POST', '/app/api/sync', { op: 'get', doc: 'mfg_web_store' }, hdrlessOwner);
    const ctrlGet = await httpReq('POST', '/app/api/sync', { op: 'get_control', doc: 'control_store' }, hdrlessOwner);
    const ctrlDoc = (ctrlGet.json?.docs && ctrlGet.json.docs.control_store) || {};
    const ctrlUpd = String(ctrlGet.json?.updatedAt || '');
    const e52HdrlessCtrl426 = await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'control_store',
      ifMatchUpdatedAt: ctrlUpd || undefined,
      patch: { control_store: Object.assign({}, ctrlDoc, { _edge52Probe: 1 }) }
    }, hdrlessOwner);
    const e52HdrlessMfgValidBody426 = await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'mfg_web_store',
      patch: { mfg_web_store: { minShellVer: MIN_SYNC_SHELL_VER, customRecords: {} } }
    }, hdrlessOwner);
    const ctrlPatch200 = await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'control_store',
      ifMatchUpdatedAt: ctrlUpd || undefined,
      patch: { control_store: Object.assign({}, ctrlDoc, { _edge52Probe: 1 }) }
    }, stampedOwner);
    const ctrlRestore = await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'control_store',
      ifMatchUpdatedAt: String(ctrlPatch200.json?.updatedAt || '') || undefined,
      patch: { control_store: ctrlDoc }
    }, stampedOwner);
    const hdrlessMfgOutdated = await httpReq('POST', '/app/api/sync', {
      op: 'patch', doc: 'mfg_web_store',
      patch: { mfg_web_store: { minShellVer: '19.6.1', customRecords: {} } }
    }, hdrlessOwner);

    const e52Ok = Boolean(
      e52_503.every(s => s === 503) &&
      e52Demo.every(r => r.status === 403) &&
      e52Auth.every(r => r.status === 401) &&
      e52SupTok && e52SupGeo403.status === 403 && e52HasSupAudit &&
      e52SupEntTok && e52EntryGeoHub403.status === 403 && e52EntryGeoClr403.status === 403 && e52SupEntGeo403.status === 403 &&
      e52EntryBadLat403.status === 403 && e52SupEntBadLat403.status === 403 &&
      e52HasEntAudit && e52HasSupEntAudit &&
      e52EntryCtrl403.status === 403 && e52EntryMultiCtrl403.status === 403 &&
      e52RoleBefore426.every(r => r.status === 403) &&
      e52_426.every(r => r.status === 426 && r.json?.code === 'shell_outdated') &&
      e52AuthGet200.status === 200 &&
      ctrlGet.status === 200 &&
      e52HdrlessCtrl426.status === 426 && e52HdrlessCtrl426.json?.code === 'shell_outdated' &&
      e52HdrlessMfgValidBody426.status === 426 && e52HdrlessMfgValidBody426.json?.code === 'shell_outdated' &&
      ctrlPatch200.status === 200 && !ctrlPatch200.json?.conflict && ctrlRestore.status === 200 &&
      hdrlessMfgOutdated.status === 426 && hdrlessMfgOutdated.json?.code === 'shell_outdated'
    );
    if (e52Ok) {
      pass('edge-52-strict-precedence-and-sync-floor-headers', '503 -> Demo 403 -> Auth 401 -> Role 403 (before 426) -> 426 across all mutating routes (incl. headerless /sync patch) & stamped control_store 200');
    } else {
      fail('edge-52-strict-precedence-and-sync-floor-headers', JSON.stringify({
        e52_503,
        e52Demo: e52Demo.map(r => r.status),
        e52Auth: e52Auth.map(r => r.status),
        supGeo: [e52SupCreate.status, e52SupGeo403.status, e52HasSupAudit, e52SupLogin.status],
        entryCtrl: [e52EntryCtrl403.status, e52EntryMultiCtrl403.status],
        roleBefore426: e52RoleBefore426.map(r => r.status),
        e52_426: e52_426.map(r => [r.status, r.json?.code]),
        authGet200: e52AuthGet200.status,
        hdrlessCtrl: [e52HdrlessCtrl426.status, e52HdrlessCtrl426.json?.code],
        hdrlessMfg: [e52HdrlessMfgValidBody426.status, e52HdrlessMfgValidBody426.json?.code],
        ctrl: [ctrlGet.status, ctrlPatch200.status, ctrlPatch200.json?.conflict, ctrlRestore.status],
        hdrlessMfgOutdated: [hdrlessMfgOutdated.status, hdrlessMfgOutdated.json?.code]
      }));
    }
  } finally {
    try { if (ws) ws.close(); } catch (_) {}
    killTree(edgeProc.pid);
    killTree(wranglerProc.pid);
    await sleep(300);
    try { fs.rmSync(udd, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(tmpPersist, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(tmpBundle, { recursive: true, force: true }); } catch (_) {}
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\nSummary: ${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL:', err);
  killTree(edgeProc.pid);
  killTree(wranglerProc.pid);
  try { fs.rmSync(udd, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(tmpPersist, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(tmpBundle, { recursive: true, force: true }); } catch (_) {}
  process.exit(1);
});
