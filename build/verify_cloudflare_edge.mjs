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
    if (appProbe && appProbe.edgeFlag === true && appProbe.ver === '19.6.213' && appProbe.statusOk === true && appProbe.wsLen > 200 && msCloudRequests.length === 0 && consoleErrors.length === 0) {
      pass('edge-12-browser-command-center-e2e', `ver=${appProbe.ver}, edge=true, msCloudCalls=0, consoleErrors=0`);
    } else {
      fail('edge-12-browser-command-center-e2e', JSON.stringify({ appProbe, msCloudRequests, consoleErrors }));
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
