// build/verify_cloudflare_edge.mjs - End-to-End Verification for ISABI Option A (Cloudflare Pages + Workers + D1 + R2)
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    const rawBody = bodyObj != null ? JSON.stringify(bodyObj) : null;
    const headers = Object.assign({}, extraHeaders);
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
  path.join(ROOT, '.wrangler', 'state'),
  path.resolve(ROOT, '..', '..', 'isabi', '.wrangler', 'state'),
  path.resolve(ROOT, '..', 'isabi', '.wrangler', 'state')
].find(p => fs.existsSync(p));
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
  path.resolve(ROOT, '..', '..', 'isabi-app', 'js')
].find(p => fs.existsSync(p)) || path.resolve(ROOT, '..', 'isabi-app', 'js');
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

const wranglerProc = spawn(NODE_BIN, [
  WRANGLER_JS,
  'pages', 'dev', tmpBundle,
  '--ip', '127.0.0.1',
  '--port', String(PORT),
  '--persist-to', tmpPersist,
  '--r2', 'BUCKET=isabi-vault',
  '-b', `ISABI_JWT_SECRET=${jwtSecret}`,
  '-b', 'VT_TEST_FIXTURE=1',
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
    // Wait for Wrangler Pages Dev server
    let ready = false;
    for (let i = 0; i < 80; i++) {
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
    const entryLogin = await httpReq('POST', '/app/api/auth/login', { email: 'sabahkassab@bhfirms.com', pin: '3333', method: 'PIN', device: 'Verify Suite' });
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
      record: { id: validWriteId, company: 'WTC', date: '2026-11-08', name: 'Edge Verified Expense', total_usd: 125.5, voided: true }
    }, { 'X-ISABI-Session': entryToken });
    if (rlsForbiddenWrite.status === 403 && demoForbiddenWrite.status === 403 && allowedWrite.status === 200 && allowedWrite.json?.ok) {
      pass('edge-05-bu-rls-write-and-demo-guard', `Cross-BU write=403, Demo write=403, Authorized WTC write=200`);
    } else {
      fail('edge-05-bu-rls-write-and-demo-guard', JSON.stringify({ cross: rlsForbiddenWrite.status, demo: demoForbiddenWrite.status, ok: allowedWrite.status }));
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
      patch: { mfg_web_store: { updatedAt: new Date().toISOString() } }
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
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    for (let i = 0; i < 25; i++) {
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
      patch: { mfg_web_store: docStep1 }
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
      patch: { mfg_web_store: docStep2 }
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
        String(u.email || '').toLowerCase() === 'sabahkassab@bhfirms.com'
          ? Object.assign({}, u, { role: 'Full Access (Owner)', companies: 'All' })
          : u
      );
    }
    const syncTamper = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: String(syncStep2.json?.updatedAt || ''),
      awaitMirror: true,
      patch: { mfg_web_store: docTamper }
    }, { 'X-ISABI-Session': entryToken });
    const checkBbcUntouched = await httpReq('GET', '/app/api/records?table=sales_tickets&company=BBConstruction&limit=5', null, { 'X-ISABI-Session': ownerToken });
    const bbcStillIntact = (checkBbcUntouched.json?.rows || []).some(r => r.id === bbcId && r.company === 'BBConstruction' && Number(r.total) === Number(bbcRow.total));
    const postTamperStore = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const ptDoc = postTamperStore.json?.docs?.mfg_web_store || {};
    const sabahSeat = (ptDoc.users || []).find(u => String(u.email || '').toLowerCase() === 'sabahkassab@bhfirms.com');
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
      patch: { mfg_web_store: docStep4 }
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
      sabahSeat &&
      !String(sabahSeat.role || '').includes('Owner') &&
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
        ms2, row0Code: row0InD1?.code, bbcStillIntact, blancaInjected, sabahRole: sabahSeat?.role, ms4, voided: row0Voided?.voided
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
    eds.fetch_live_cloud_store = lambda offline=False: store_v1

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
    eds.fetch_live_cloud_store = lambda offline=False: store_v2
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
    eds.fetch_live_cloud_store = lambda offline=False: {"updatedAt": "2026-11-08T10:00:00.000Z"}
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
    eds.fetch_live_cloud_store = lambda offline=False: {
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
    }
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
    eds.fetch_live_cloud_store = lambda offline=False: m_users
    files6, _ = eds.export_all(delta=False, offline=True, manifest_path=tmp / "m6.json", db_path=dbp, out_dir=tmp / "b6", include_snapshot=False)
    sql6 = "\\n".join(bf.read_text(encoding="utf-8") for bf in files6)
    assert sql6.find("DELETE FROM edge_kv_store WHERE doc_key LIKE 'mfg_web_store__part_%'") > sql6.find("'mfg_web_store__part_0001'") > 0
    for bf in files6:
        d1_sim.executescript(bf.read_text(encoding="utf-8"))
    d1_sim.commit()
    r_u1 = d1_sim.execute("SELECT id, pin_code, role, face_samples, last_login_at FROM users WHERE email='husseinbdeir@bhfirms.com'").fetchone()
    r_op = d1_sim.execute("SELECT id, pin_code, status, companies, face_samples FROM users WHERE email='ops@bhfirms.com'").fetchone()
    stale_cnt = d1_sim.execute("SELECT COUNT(*) FROM edge_kv_store WHERE doc_key='mfg_web_store__part_0005'").fetchone()[0]
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
        email: 'sabahkassab@bhfirms.com',
        full_name: 'Sabah Kassab',
        pin_code: '0000'
      }
    }, { 'X-ISABI-Session': entryToken });
    const entrySelfEscalate = await httpReq('POST', '/app/api/users', {
      user: {
        email: 'sabahkassab@bhfirms.com',
        full_name: 'Sabah Kassab',
        role: 'Full Access (Owner)',
        companies: 'All',
        pin_redacted: true,
        pbi_access: 'full',
        custom_perms: { admin: true },
        last_login_at: new Date().toISOString()
      }
    }, { 'X-ISABI-Session': entryToken });
    const usersAfterSelf = await httpReq('GET', '/app/api/users', null, { 'X-ISABI-Session': ownerToken });
    const sabahAfterSelf = (usersAfterSelf.json?.users || []).find(u => String(u.email || '').toLowerCase() === 'sabahkassab@bhfirms.com');
    const sabahPinStill3333 = await httpReq('POST', '/app/api/auth/login', {
      email: 'sabahkassab@bhfirms.com',
      pin: '3333',
      method: 'PIN'
    });
    const bbcSupLogin = await httpReq('POST', '/app/api/auth/login', {
      email: 'site.bbc@bhfirms.com',
      pin: '6666',
      method: 'PIN'
    });
    const bbcSupToken = String(bbcSupLogin.json?.token || '');
    const supEditOwner = await httpReq('POST', '/app/api/users', {
      user: { id: 'u1', email: 'husseinbdeir@bhfirms.com', full_name: 'Hussein Bdeir', role: 'Full Access (Owner)', companies: 'All' }
    }, { 'X-ISABI-Session': bbcSupToken });
    const supGrantOutScope = await httpReq('POST', '/app/api/users', {
      user: { id: 'u-sup-escape', email: 'escape@bhfirms.com', full_name: 'Scope Escape', role: 'Supervisor', companies: 'WTC' }
    }, { 'X-ISABI-Session': bbcSupToken });

    // Server-side 128-d Euclidean L2 Face ID + PIN verification (remote web never issues JWT on Face ID vector alone)
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
      sabahAfterSelf?.role === 'Entry' &&
      sabahAfterSelf?.companies === 'WTC' &&
      sabahAfterSelf?.pin_code === undefined &&
      sabahAfterSelf?.pin_redacted === true &&
      sabahPinStill3333.status === 200 &&
      supEditOwner.status === 403 &&
      supGrantOutScope.status === 403 &&
      faceNoVec.status === 401 &&
      faceWrongVec.status === 401 &&
      faceNoPin.status === 401 &&
      faceNoPin.json?.two_factor_pin_required === true &&
      !faceNoPin.json?.token &&
      faceGoodVec.status === 200 &&
      Boolean(faceGoodVec.json?.token) &&
      faceGoodVec.json?.user?.pin_code === undefined
    ) {
      pass(
        'edge-17-unauth-401-privilege-lock-faceid-and-cors',
        '7 unauth endpoints=401, CSRF/CORS locked, weak PIN=400, Entry/Supervisor escalation blocked, Face ID requires PIN+128-d match'
      );
    } else {
      fail('edge-17-unauth-401-privilege-lock-faceid-and-cors', JSON.stringify({
        unauth: [unauthUsersPost.status, unauthRecordsGet.status, unauthRecordsPost.status, unauthSyncGet.status, unauthSyncPatch.status, unauthBlobsDel.status, unauthSentinelsGet.status],
        anonLeakedBio,
        evilCookie: evilCookiePost.status,
        evilCors: evilCookiePost.headers['access-control-allow-origin'],
        goodCors: goodOriginGet.headers['access-control-allow-origin'],
        weakPin: weakPinAttempt17.status,
        entrySelf: [entrySelfEscalate.status, sabahAfterSelf?.pin_code, sabahAfterSelf?.pin_redacted, sabahPinStill3333.status],
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
      patch: { mfg_web_store: doc18 }
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

    // 19b (Adversarial + Positive): Cold-browser descriptor-only Face ID block + `auth_mode: 'both'` step-up 2FA enforcement
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
        role: 'Supervisor',
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
    }, { 'X-ISABI-Session': bbcSupToken });
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
      coldFaceOnly.status === 400 &&
      !coldFaceOnly.json?.token &&
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
        'Demo JWT quarantined, Demo AI same-origin gated, vector-only Face ID blocked (400), both-2FA verified, geo_config merged, empty-co blob scoped'
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
      patch: { mfg_web_store: doc20 }
    }, { 'X-ISABI-Session': ownerToken });

    // 20a (Adversarial): WTC Entry seat reads `/app/api/sync` (`get_mfg` + CAS `conflict` + `get_control`)
    const entrySyncGet20 = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': entryToken });
    const entryDoc20 = entrySyncGet20.json?.docs?.mfg_web_store || {};
    const entryConflict20 = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: '1999-01-01T00:00:00.000Z',
      patch: { mfg_web_store: { updatedAt: new Date().toISOString(), customRecords: {} } }
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
      patch: { mfg_web_store: entryPushDoc20 }
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
      patch: { mfg_web_store: ownerDoc20b }
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
      email: 'sabahkassab@bhfirms.com',
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
      email: 'sabahkassab@bhfirms.com',
      method: 'Owner Impersonation'
    }, { 'X-ISABI-Session': tempOwnerTok26 });
    await httpReq('POST', '/app/api/auth/logout', {}, { 'X-ISABI-Session': tempOwnerTok26 });
    const impersAfterLogout = await httpReq('POST', '/app/api/auth/login', {
      email: 'sabahkassab@bhfirms.com',
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
      email: 'sabahkassab@bhfirms.com',
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
        staffRules: { ali_bbc_27: { company: 'BBConstruction', shift_id: 'shf-bbc-27', updated_at: ts27a } }
      }
    }, { 'X-ISABI-Session': ownerToken });

    // WTC Supervisor reads `/app/api/alert_rules`, `/app/api/work_schedules`, and `/app/api/sync` (`get_mfg`) -> 0 BBC leaks
    const wtcArGet27 = await httpReq('GET', '/app/api/alert_rules', null, { 'X-ISABI-Session': wtcSupTok });
    const wtcWsGet27 = await httpReq('GET', '/app/api/work_schedules', null, { 'X-ISABI-Session': wtcSupTok });
    const wtcSyncGet27a = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': wtcSupTok });
    const wtcSyncDoc27a = wtcSyncGet27a.json?.docs?.mfg_web_store || {};
    const leakArDirect = (wtcArGet27.json?.custom || []).some(c => c && c.company === 'BBConstruction');
    const leakWsShiftDirect = (wtcWsGet27.json?.work_schedules?.shiftTypes || []).some(s => s && s.company === 'BBConstruction');
    const leakWsRuleDirect = Boolean(wtcWsGet27.json?.work_schedules?.staffRules?.ali_bbc_27);
    const leakWsDefDirect = Boolean(wtcWsGet27.json?.work_schedules?.companyPolicyDefaults?.BBConstruction);
    const leakSyncAr = (wtcSyncDoc27a.alertRules?.custom || []).some(c => c && c.company === 'BBConstruction');
    const leakSyncWs = (wtcSyncDoc27a.workSchedules?.shiftTypes || []).some(s => s && s.company === 'BBConstruction') || Boolean(wtcSyncDoc27a.workSchedules?.staffRules?.ali_bbc_27);

    // WTC Supervisor posts read-scoped `work_schedules` adding WTC shift + rule -> merges cleanly without clobbering BBC
    const wtcWsPayload27 = JSON.parse(JSON.stringify(wtcWsGet27.json?.work_schedules || { shiftTypes: [], policyGroups: [], companyPolicyDefaults: {}, staffRules: {} }));
    wtcWsPayload27.shiftTypes = [...(wtcWsPayload27.shiftTypes || []), { id: 'shf-wtc-direct-27', company: 'WTC', name: 'WTC Direct Shift', start_time: '08:00', end_time: '16:00', updated_at: ts27b }];
    wtcWsPayload27.staffRules = Object.assign({}, wtcWsPayload27.staffRules || {}, {
      rami_wtc_27: { company: 'WTC', shift_id: 'shf-wtc-direct-27', updated_at: ts27b }
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
        staffRules: { ali_bbc_27: { company: 'WTC', shift_id: 'shf-wtc-direct-27', updated_at: ts27c } }
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
      patch: { mfg_web_store: wtcPushDoc27 }
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
      ows.staffRules?.ali_bbc_27?.company === 'BBConstruction' &&
      ows.staffRules?.rami_wtc_27?.company === 'WTC' &&
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
        aliCo: ows.staffRules?.ali_bbc_27?.company,
        ramiCo: ows.staffRules?.rami_wtc_27?.company,
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
    await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      patch: {
        mfg_web_store: Object.assign({}, baseMfgDoc28, {
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

      // Negative Assertion 0: Pre-credential Face ID scan holds at awaiting-credentials (never unlocks on vector alone)
      window.MFG_FACE_TEST.resetLiveness();
      await window.MFG_FACE_TEST.feedLiveAuthFrame(vecBoundary, { ear: 0.29, yaw: -0.03, parallax3d: -0.014 });
      await window.MFG_FACE_TEST.feedLiveAuthFrame(vecBoundary, { ear: 0.18, yaw: 0.0, parallax3d: 0.0 });
      const fNoCreds = await window.MFG_FACE_TEST.feedLiveAuthFrame(vecBoundary, { ear: 0.29, yaw: 0.03, parallax3d: 0.014 });
      const stAfterNoCreds = window.MFG_FACE_TEST.state();

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
          const isSyntheticTestName = txt => /^(EF|ET|EP|ES|FV|WQ)$|Verify Suite|WTC Quarry Dispatch|Empty Scope Seat|Edge Test|Edge Face|Edge TwoFactor|Edge PinOnly|Edge SixDigit|Face Verify|Both 2FA|Scope Escape/i.test(String(txt || '').trim());
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
          await new Promise(r => setTimeout(r, 350));
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

      return {
        bootOk: true,
        stBoot,
        preAuthDeferred,
        recordsReadyBefore,
        fNoCredsStatus: fNoCreds?.status,
        stAfterNoCreds,
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

    if (remoteScript28 && remoteScript28.identifier) {
      try { await sendCdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: remoteScript28.identifier }); } catch (_) {}
    }

    const unexpectedErrors28 = consoleErrors.filter(
      e => !/status of 401.*\/app\/api\/(users|auth\/login|staff_biometrics|work_schedules|geo_config|industry_domain_store|sentinel_reviews|alert_rules|sync)/i.test(String(e || ''))
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
      e28Flow?.bootOk === true &&
      e28Flow.stBoot?.authed === false &&
      e28Flow.stBoot?.enrolledSeats?.length === 0 &&
      e28Flow.preAuthDeferred === true &&
      e28Flow.recordsReadyBefore === false &&
      e28Flow.stBoot?.confirmFrames === 3 &&
      e28Flow.fNoCredsStatus === 'awaiting-credentials' &&
      e28Flow.stAfterNoCreds?.authed === false &&
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
      e28Flow.sixDigitActiveEmail === 'edge28inherit@bhfirms.com'
    ) {
      pass(
        'edge-28-remote-tdz-boot-and-redacted-faceid-e2e',
        `0 TDZ, cookie-only auth (0 localStorage JWT), R2 seed hydrated & purged on logout, Email+PIN+Face ID d=${e28Flow.fOkDist} OK`
      );
    } else {
      fail('edge-28-remote-tdz-boot-and-redacted-faceid-e2e', JSON.stringify({
        consoleErrors,
        wsBoth: [wsDefaultBothPinOnlyRes.status, wsDefaultBothPinOnlyRes.json?.two_factor_face_required],
        rateLim: [rateLimitFirstStatus, rateLimitNinthStatus, rateLimitNinthFlag],
        verify2fa: [verifyOnly2faUnauthRes.status, verifyOnly2faAuthRes.status, Boolean(verifyOnly2faAuthRes.json?.token)],
        full2fa: [fullLogin2faNoPinRes.status, fullLogin2faNoPinRes.json?.two_factor_pin_required],
        pinOnly: [unauthAllowPinOnlyRes.status, authAllowPinOnlyRes.status],
        impOracle: [imposterHttpRes.status, imposterHttpRes.json?.face_dist],
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
      patch: { mfg_web_store: e32Doc }
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
    for (let i = 0; i < 25; i++) {
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
    const e34OvSelfEntry = await httpReq('POST', '/app/api/auth/verify-override', { email: 'sabahkassab@bhfirms.com', pin: '3333', company: 'WTC', field_id: 'f_price' }, { 'X-ISABI-Session': entryToken });
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
      String(e36UsersEntry.json.users[0]?.email || '').toLowerCase() === 'sabahkassab@bhfirms.com' &&
      e36UsersEntry.json.users[0]?.pin_code === undefined &&
      e36UsersEntry.json.users[0]?.face_samples === undefined;
    const e36OwnerRedacted = Array.isArray(e36UsersOwner.json?.users) &&
      e36UsersOwner.json.users.length >= 10 &&
      e36UsersOwner.json.users.every(u => u && u.pin_code === undefined && u.face_samples === undefined);
    const e36EntryTakeoverU1 = await httpReq('POST', '/app/api/users', {
      user: { id: 'u1', email: 'sabahkassab@bhfirms.com', full_name: 'Sabah Takeover', role: 'Full Access (Owner)', companies: '*' }
    }, { 'X-ISABI-Session': entryToken });

    // Strict CORS on OPTIONS across /app/api/ask, /app/api/kiosk/verify, and /api/status
    const e36OptAskEvil = await httpReq('OPTIONS', '/app/api/ask', null, { Origin: 'https://evil.example' });
    const e36OptKioskEvil = await httpReq('OPTIONS', '/app/api/kiosk/verify', null, { Origin: 'https://evil.example' });
    const e36OptStatusEvil = await httpReq('OPTIONS', '/api/status', null, { Origin: 'https://evil.example' });
    const e36OptKioskGh = await httpReq('OPTIONS', '/app/api/kiosk/verify', null, { Origin: 'https://husseinbdeir.github.io' });
    const e36OptUsersGh = await httpReq('OPTIONS', '/app/api/users', null, { Origin: 'https://husseinbdeir.github.io' });
    const e36CorsStrictOk =
      e36OptAskEvil.status === 204 && !e36OptAskEvil.headers['access-control-allow-origin'] &&
      e36OptKioskEvil.status === 204 && !e36OptKioskEvil.headers['access-control-allow-origin'] &&
      e36OptStatusEvil.status === 204 && !e36OptStatusEvil.headers['access-control-allow-origin'] &&
      e36OptKioskGh.status === 204 && e36OptKioskGh.headers['access-control-allow-origin'] === 'https://husseinbdeir.github.io' &&
      e36OptUsersGh.status === 204 && !e36OptUsersGh.headers['access-control-allow-origin'];

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
          usersGh: [e36OptUsersGh.status, e36OptUsersGh.headers['access-control-allow-origin']]
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
