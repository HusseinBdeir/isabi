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
const srcWranglerState = path.join(ROOT, '.wrangler', 'state');
if (fs.existsSync(srcWranglerState)) {
  fs.cpSync(srcWranglerState, tmpPersist, { recursive: true });
}
const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'isabi-cf-edge-'));
const jwtSecret = crypto.randomBytes(32).toString('hex');

const wranglerProc = spawn(process.execPath, [
  WRANGLER_JS,
  'pages', 'dev', '.',
  '--ip', '127.0.0.1',
  '--port', String(PORT),
  '--persist-to', tmpPersist,
  '--r2', 'BUCKET=isabi-vault',
  '-b', `ISABI_JWT_SECRET=${jwtSecret}`,
  '--live-reload=false'
], {
  cwd: ROOT,
  env: Object.assign({}, process.env, { CI: '1', WRANGLER_SEND_METRICS: 'false' }),
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

    // 2. Command Center /app/api/status & D1 row counts
    const stRes = await httpReq('GET', '/app/api/status');
    const cnt = stRes.json?.counts || {};
    if (stRes.status === 200 && stRes.json?.ok && stRes.json?.d1_ready && stRes.json?.r2_ready && Number(cnt.sales_tickets) >= 26553 && Number(cnt.raw_purchases) >= 24826 && Number(cnt.users) >= 16) {
      pass('edge-02-app-status-d1-seeded', `sales=${cnt.sales_tickets} raw=${cnt.raw_purchases} users=${cnt.users}`);
    } else {
      fail('edge-02-app-status-d1-seeded', JSON.stringify(stRes.json).slice(0, 300));
    }

    // 3. HMAC-SHA256 JWT + HttpOnly Cookie + Constant-Time PIN Verification
    const badLogin = await httpReq('POST', '/app/api/auth/login', { email: 'husseinbdeir@bhfirms.com', pin: '9999', method: 'PIN' });
    const ownerLogin = await httpReq('POST', '/app/api/auth/login', { email: 'husseinbdeir@bhfirms.com', pin: '1111', method: 'PIN', device: 'Verify Suite' });
    const entryLogin = await httpReq('POST', '/app/api/auth/login', { email: 'sabahkassab@bhfirms.com', pin: '3333', method: 'PIN', device: 'Verify Suite' });
    const ownerToken = ownerLogin.json?.token || '';
    const entryToken = entryLogin.json?.token || '';
    const setCookieHdr = String(ownerLogin.headers['set-cookie'] || '');
    const meRes = await httpReq('GET', '/app/api/auth/me', null, { 'X-ISABI-Session': ownerToken });

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

    // 6. Seat Security: Unauthenticated PIN stripping + Entry privilege-escalation block
    const anonUsers = await httpReq('GET', '/app/api/users');
    const anyLeakedPin = (anonUsers.json?.users || []).some(u => u && u.pin_code);
    const entryEscalate = await httpReq('POST', '/app/api/users', {
      user: { id: 'u1', email: 'husseinbdeir@bhfirms.com', full_name: 'Hussein Bdeir', role: 'Full Access (Owner)', pin_code: '0000' }
    }, { 'X-ISABI-Session': entryToken });
    if (anonUsers.status === 200 && !anyLeakedPin && entryEscalate.status === 403) {
      pass('edge-06-users-seat-security', `Anon PINs redacted (0 leaked), Entry -> Owner seat edit=403`);
    } else {
      fail('edge-06-users-seat-security', JSON.stringify({ leaked: anyLeakedPin, escalate: entryEscalate.status }));
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
    await sleep(1600);
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
    const emptyCoToken = mintTestJwt({ sub: 'u-empty-rls', email: 'empty@bhfirms.com', role: 'Entry', companies: '' });
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

    // Step 4: Hard-remove `exp-dirty-diff-0` from `customRecords.expenses` and assert D1 voids it
    const docStep4 = JSON.parse(JSON.stringify(ptDoc));
    docStep4.updatedAt = new Date(Date.now() + 4000).toISOString();
    docStep4.customRecords.expenses = (docStep4.customRecords.expenses || []).filter(r => r.id !== 'exp-dirty-diff-0');
    const syncStep4 = await httpReq('POST', '/app/api/sync', {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: String(syncTamper.json?.updatedAt || ''),
      awaitMirror: true,
      patch: { mfg_web_store: docStep4 }
    }, { 'X-ISABI-Session': ownerToken });
    const checkExpAfterVoid = await httpReq('GET', '/app/api/records?table=expenses&company=WTC&limit=400', null, { 'X-ISABI-Session': ownerToken });
    const row0Voided = (checkExpAfterVoid.json?.rows || []).find(r => r.id === 'exp-dirty-diff-0');

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
      row0Voided?.voided === true
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
    print("PY_DELTA_MERGE_OK")
finally:
    shutil.rmtree(tmp, ignore_errors=True)
`;
    try {
      const pyOut = execFileSync(pyBin, ['-c', pyScript], { encoding: 'utf8', windowsHide: true });
      if (pyOut.includes('PY_DELTA_MERGE_OK')) {
        pass('edge-16-python-delta-manifest-and-dual-store-merge', '0 writes unchanged, code-edit upsert + vanished/composite DELETE + dual-store union-merge');
      } else {
        fail('edge-16-python-delta-manifest-and-dual-store-merge', pyOut.slice(0, 300));
      }
    } catch (pyErr) {
      fail('edge-16-python-delta-manifest-and-dual-store-merge', String(pyErr.stderr || pyErr.message || pyErr).slice(0, 400));
    }

    // 17. Unauthenticated 401 Wall, CSRF/CORS Lock, Self-Escalation & Supervisor Scope Locks, and 128-d Face ID Auth
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

    // Entry self-POST privilege lock + single-BU Supervisor cross-BU/Owner escalation block
    const entrySelfEscalate = await httpReq('POST', '/app/api/users', {
      user: {
        email: 'sabahkassab@bhfirms.com',
        full_name: 'Sabah Kassab',
        role: 'Full Access (Owner)',
        companies: 'All',
        pin_code: '0000',
        pbi_access: 'full',
        custom_perms: { admin: true },
        last_login_at: new Date().toISOString()
      }
    }, { 'X-ISABI-Session': entryToken });
    const usersAfterSelf = await httpReq('GET', '/app/api/users', null, { 'X-ISABI-Session': ownerToken });
    const sabahAfterSelf = (usersAfterSelf.json?.users || []).find(u => String(u.email || '').toLowerCase() === 'sabahkassab@bhfirms.com');
    const bbcSupToken = mintTestJwt({ sub: 'u7', email: 'site.bbc@bhfirms.com', role: 'Supervisor', companies: 'BBConstruction' });
    const supEditOwner = await httpReq('POST', '/app/api/users', {
      user: { id: 'u1', email: 'husseinbdeir@bhfirms.com', full_name: 'Hussein Bdeir', role: 'Full Access (Owner)', companies: 'All' }
    }, { 'X-ISABI-Session': bbcSupToken });
    const supGrantOutScope = await httpReq('POST', '/app/api/users', {
      user: { id: 'u-sup-escape', email: 'escape@bhfirms.com', full_name: 'Scope Escape', role: 'Supervisor', companies: 'WTC' }
    }, { 'X-ISABI-Session': bbcSupToken });

    // Server-side 128-d Euclidean L2 Face ID verification
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
    const faceWrongVec = await httpReq('POST', '/app/api/auth/login', { email: 'faceverify@bhfirms.com', method: 'Face ID', face_descriptor: vecFar });
    const faceGoodVec = await httpReq('POST', '/app/api/auth/login', { email: 'faceverify@bhfirms.com', method: 'Face ID', face_descriptor: vecNear });

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
      entrySelfEscalate.status === 200 &&
      entrySelfEscalate.json?.lockedPrivileges === true &&
      sabahAfterSelf?.role === 'Entry' &&
      sabahAfterSelf?.companies === 'WTC' &&
      sabahAfterSelf?.pin_code === '3333' &&
      supEditOwner.status === 403 &&
      supGrantOutScope.status === 403 &&
      faceNoVec.status === 401 &&
      faceWrongVec.status === 401 &&
      faceGoodVec.status === 200 &&
      Boolean(faceGoodVec.json?.token) &&
      faceGoodVec.json?.user?.pin_code === undefined
    ) {
      pass(
        'edge-17-unauth-401-privilege-lock-faceid-and-cors',
        '7 unauth endpoints=401, CSRF/CORS locked, Entry/Supervisor escalation blocked, 128-d Face ID verified'
      );
    } else {
      fail('edge-17-unauth-401-privilege-lock-faceid-and-cors', JSON.stringify({
        unauth: [unauthUsersPost.status, unauthRecordsGet.status, unauthRecordsPost.status, unauthSyncGet.status, unauthSyncPatch.status, unauthBlobsDel.status, unauthSentinelsGet.status],
        anonLeakedBio,
        evilCookie: evilCookiePost.status,
        evilCors: evilCookiePost.headers['access-control-allow-origin'],
        goodCors: goodOriginGet.headers['access-control-allow-origin'],
        entrySelf: entrySelfEscalate.json?.user,
        supEditOwner: supEditOwner.status,
        supGrantOutScope: supGrantOutScope.status,
        face: [faceNoVec.status, faceWrongVec.status, faceGoodVec.status, faceGoodVec.json?.user?.pin_code]
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
    const demoAskAllowed = await httpReq('POST', '/app/api/ask', { prompt: 'ping' }, { 'X-ISABI-Demo': '1' });
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

    // 19b (Adversarial + Positive): Cold-browser descriptor-only Face ID lookup + `auth_mode: 'both'` step-up 2FA enforcement
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
      demoUnauthAskBlocked.status === 401 &&
      browserDemoCheck?.isDemoFn === true &&
      browserDemoCheck?.demoQuarantined === true &&
      browserDemoCheck?.storedSessTok === '' &&
      coldFaceOnly.status === 200 &&
      Boolean(coldFaceOnly.json?.token) &&
      coldFaceOnly.json?.user?.email === 'faceverify@bhfirms.com' &&
      bothPinOnly.status === 401 &&
      bothPinOnly.json?.two_factor_face_required === true &&
      !bothPinOnly.json?.token &&
      bothFaceOnlyCold.status === 401 &&
      bothFaceOnlyCold.json?.two_factor_pin_required === true &&
      bothFaceOnlyCold.json?.email === 'both2fa@bhfirms.com' &&
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
        'Demo JWT quarantined, Demo AI routed, cold Face ID + both-2FA verified, geo_config 0-KM + tombstones merged, empty-co blob scoped to WTC'
      );
    } else {
      fail('edge-19-demo-quarantine-2fa-coldface-geomerged-and-scoped-r2', JSON.stringify({
        demoLogin: [demoLoginAttempt.status, demoLoginAttempt.json, Boolean(demoLoginAttempt.headers['set-cookie'])],
        demoWrite: demoUnauthWrite.status,
        demoAsk: [demoAskAllowed.status, demoUnauthAskBlocked.status],
        browserDemoCheck,
        coldFace: [coldFaceOnly.status, coldFaceOnly.json?.user?.email],
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
        ...(doc20.customRecords?.expenses || [])
      ]
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

    // Entry pushes scoped doc back -> BBConstruction rows must remain 100% intact in D1
    const entryPushDoc20 = JSON.parse(JSON.stringify(entryDoc20));
    entryPushDoc20.updatedAt = new Date(Date.now() + 14000).toISOString();
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

    // 20b: Owner removes `sr-r3-wtc-del` + `cr-r3-del` and updates `both2fa@bhfirms.com` via `users` sync mirror (preserving redacted PIN/Face)
    const ownerAfterEntry = await httpReq('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, { 'X-ISABI-Session': ownerToken });
    const ownerDoc20b = JSON.parse(JSON.stringify(ownerAfterEntry.json?.docs?.mfg_web_store || {}));
    const bbcStillIntact20 = (ownerDoc20b.customRecords?.expenses || []).some(r => r && r.id === 'exp-bbc-secret-20');
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
    const usersAfterSyncMirror = await httpReq('GET', '/app/api/users', null, { 'X-ISABI-Session': ownerToken });
    const unauthUsers20 = await httpReq('GET', '/app/api/users');
    const mirroredBothSeat = (usersAfterSyncMirror.json?.users || []).find(u => u.email === 'both2fa@bhfirms.com');
    const unauthFaceSeat = (unauthUsers20.json?.users || []).find(u => u.email === 'faceverify@bhfirms.com');

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
      !(arAfterDel.json?.custom || []).some(c => c.id === 'cr-r3-del') &&
      !(srAfterDel.json?.reviews && srAfterDel.json.reviews['sr-r3-wtc-del']) &&
      mirroredBothSeat?.pbi_access === 'ops_only' &&
      mirroredBothSeat?.pin_code === '8520' &&
      Array.isArray(mirroredBothSeat?.face_samples) &&
      mirroredBothSeat.face_samples.length === 1 &&
      unauthFaceSeat?.face_enrolled === true &&
      unauthFaceSeat?.face_redacted === true &&
      unauthFaceSeat?.face_samples === undefined &&
      forgedVerify === null &&
      signEmptyThrew === true
    ) {
      pass(
        'edge-20-scoped-sync-rls-substore-deletes-user-mirror-and-jwt-failclosed',
        'Read-side sync RLS scoped, control_store=403, cross-BU preserved on scoped patch, sub-store deletes + redacted-safe user mirror verified, empty JWT secret fails closed'
      );
    } else {
      fail('edge-20-scoped-sync-rls-substore-deletes-user-mirror-and-jwt-failclosed', JSON.stringify({
        scoped: [entryDoc20._scopedForSession, conflictDoc20._scopedForSession, leakedBbcGet, leakedBbcConflict, leakedSrGet, entryControl20.status],
        otherSeat: [otherSeatInSync?.face_redacted, otherSeatInSync?.face_samples, otherSeatInSync?.custom_perms],
        bbcStillIntact20,
        delOk: [!(arAfterDel.json?.custom || []).some(c => c.id === 'cr-r3-del'), !(srAfterDel.json?.reviews && srAfterDel.json.reviews['sr-r3-wtc-del'])],
        mirrored: [mirroredBothSeat?.pbi_access, mirroredBothSeat?.pin_code, mirroredBothSeat?.face_samples?.length],
        unauthFace: [unauthFaceSeat?.face_enrolled, unauthFaceSeat?.face_redacted, unauthFaceSeat?.face_samples],
        jwt: [forgedVerify, signEmptyThrew]
      }));
    }

    // 21. Round-4 Negative Probes: `PIN + Face ID 2FA` Wrong-Face & Coworker-Face Block + Single-BU Supervisor Coworker PIN Redaction/Write-Lock
    const pinPlusWrongFace = await httpReq('POST', '/app/api/auth/login', {
      email: 'faceverify@bhfirms.com',
      pin: '7412',
      method: 'PIN + Face ID 2FA',
      face_descriptor: vecFar
    });
    const pinPlusCoworkerFace = await httpReq('POST', '/app/api/auth/login', {
      email: 'both2fa@bhfirms.com',
      pin: '8520',
      method: 'PIN + Face ID 2FA',
      face_descriptor: vecNear
    });
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
        pin_code: '9999',
        custom_perms: JSON.stringify({ rights: { modify_text: true } })
      }
    }, { 'X-ISABI-Session': wtcSupTok });
    const ownerCheck21 = await httpReq('GET', '/app/api/users', null, { 'X-ISABI-Session': ownerToken });
    const faceSeatAfterSup = (ownerCheck21.json?.users || []).find(u => u.email === 'faceverify@bhfirms.com');

    if (
      pinPlusWrongFace.status === 401 &&
      pinPlusCoworkerFace.status === 401 &&
      pinPlusRightFace.status === 200 &&
      wtcSupCoworker?.pin_code === undefined &&
      wtcSupCoworker?.pin_redacted === true &&
      Array.isArray(wtcSupCoworker?.face_samples) &&
      wtcSupSyncCoworker?.pin_code === undefined &&
      wtcSupSyncCoworker?.pin_redacted === true &&
      wtcSupPinTamper.status === 200 &&
      faceSeatAfterSup?.pin_code === '7412'
    ) {
      pass(
        'edge-21-pin-plus-face2fa-enforcement-and-supervisor-pin-isolation',
        'PIN+Face 2FA blocks wrong & coworker faces (401), Supervisor sees pin_redacted=true & cannot overwrite coworker PIN (7412 preserved)'
      );
    } else {
      fail('edge-21-pin-plus-face2fa-enforcement-and-supervisor-pin-isolation', JSON.stringify({
        twoFa: [pinPlusWrongFace.status, pinPlusCoworkerFace.status, pinPlusRightFace.status],
        supGet: [wtcSupCoworker?.pin_code, wtcSupCoworker?.pin_redacted, Array.isArray(wtcSupCoworker?.face_samples)],
        supSync: [wtcSupSyncCoworker?.pin_code, wtcSupSyncCoworker?.pin_redacted],
        afterTamperPin: faceSeatAfterSup?.pin_code
      }));
    }
  } finally {
    try { if (ws) ws.close(); } catch (_) {}
    killTree(edgeProc.pid);
    killTree(wranglerProc.pid);
    await sleep(300);
    try { fs.rmSync(udd, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(tmpPersist, { recursive: true, force: true }); } catch (_) {}
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\nSummary: ${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL:', err);
  killTree(edgeProc.pid);
  killTree(wranglerProc.pid);
  process.exit(1);
});
