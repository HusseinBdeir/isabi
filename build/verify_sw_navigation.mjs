// build/verify_sw_navigation.mjs - End-to-End Service Worker Navigation, 308 Redirect Stripping, Captive-Portal Defense, Offline & Legacy Reset Verification
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8840 + Math.floor(Math.random() * 40);
const DBG = 9740 + Math.floor(Math.random() * 40);

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

const tmpPersist = fs.mkdtempSync(path.join(os.tmpdir(), 'isabi-sw-persist-'));
const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'isabi-sw-edge-'));
const jwtSecret = crypto.randomBytes(32).toString('hex');

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

const wranglerProc = spawn(NODE_BIN, [
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

function httpGetOrHead(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: PORT, path: urlPath, method }, res => {
      let body = '';
      res.on('data', c => { body += c.toString('utf8'); });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

let ws = null;
let msgId = 0;
const pending = new Map();
const eventListeners = new Map();
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
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        const r = await httpGetOrHead('HEAD', '/app/');
        if (r.status === 200) {
          ready = true;
          break;
        }
      } catch (_) {}
      await sleep(300);
    }
    if (!ready) throw new Error(`Wrangler Pages Dev failed to start on :${PORT}\n${wranglerLog.slice(-1200)}`);

    // Test 0: Cloudflare Pages 308 pretty-URL behavior on index.html + Direct 200 OK (0 redirect) on /app/reset.html & /reset.html
    const redirAppIdx = await httpGetOrHead('HEAD', '/app/index.html?v=test');
    const directSlash = await httpGetOrHead('HEAD', '/app/?v=test');
    const appResetHtml = await httpGetOrHead('GET', '/app/reset.html');
    const appResetPretty = await httpGetOrHead('HEAD', '/app/reset');
    const rootResetHtml = await httpGetOrHead('GET', '/reset.html');
    const rootResetPretty = await httpGetOrHead('HEAD', '/reset');
    const appResetCc = String(appResetHtml.headers['cache-control'] || '');
    const rootResetCc = String(rootResetHtml.headers['cache-control'] || '');
    if (
      redirAppIdx.status === 308 &&
      directSlash.status === 200 &&
      appResetHtml.status === 200 &&
      appResetPretty.status === 200 &&
      rootResetHtml.status === 200 &&
      rootResetPretty.status === 200 &&
      appResetCc.includes('no-store') &&
      rootResetCc.includes('no-store') &&
      appResetHtml.body.includes('navigator.serviceWorker.getRegistrations') &&
      rootResetHtml.body.includes('navigator.serviceWorker.getRegistrations')
    ) {
      pass('sw-nav-00-cf-pages-308-and-direct-200-reset-endpoints', `/app/index.html=308, /app/?v=test=200, /app/reset(.html)=200 no-store, /reset(.html)=200 no-store`);
    } else {
      fail('sw-nav-00-cf-pages-308-and-direct-200-reset-endpoints', JSON.stringify({
        appIdx: redirAppIdx.status,
        slash: directSlash.status,
        appReset: [appResetHtml.status, appResetPretty.status, appResetCc],
        rootReset: [rootResetHtml.status, rootResetPretty.status, rootResetCc]
      }));
    }

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
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data.toString());
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
      } else if (msg.method && eventListeners.has(msg.method)) {
        const fn = eventListeners.get(msg.method);
        try { fn(msg.params); } catch (_) {}
      }
    };

    await sendCdp('Page.enable');
    await sendCdp('Runtime.enable');
    await sendCdp('Network.enable');
    await sendCdp('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.__MFG_HEADLESS_TEST = true; window.__INITIAL_SEARCH = location.search; window.__INITIAL_HREF = location.href;`
    });

    const BASE = `http://127.0.0.1:${PORT}`;

    // Test 1: Root Showcase `/` 1st-visit install -> immediate offline navigation + online reload + direct `/index.html` navigation
    const rootNav1 = await sendCdp('Page.navigate', { url: `${BASE}/` });
    for (let i = 0; i < 30; i++) {
      const ctrl = await evalJs(`Boolean(navigator.serviceWorker && navigator.serviceWorker.controller)`);
      if (ctrl) break;
      await sleep(250);
    }
    await sleep(500);
    const rootCacheState = await evalJs(`(async () => {
      const keys = await caches.keys();
      const swKey = keys.find(k => k.startsWith('isabi-systems-pwa-'));
      if (!swKey) return { found: false };
      const c = await caches.open(swKey);
      const rSlash = await c.match('./');
      const rIdx = await c.match('./index.html');
      return {
        found: true,
        slashOk: Boolean(rSlash && rSlash.status === 200 && rSlash.redirected === false),
        idxOk: Boolean(rIdx && rIdx.status === 200 && rIdx.redirected === false)
      };
    })()`);
    await sendCdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    const rootOfflineNav = await sendCdp('Page.navigate', { url: `${BASE}/` });
    await sleep(800);
    const rootOfflineH1 = await evalJs(`(document.querySelector('h1')?.textContent || '').trim()`);
    await sendCdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const rootIdxNav = await sendCdp('Page.navigate', { url: `${BASE}/index.html` });
    await sleep(700);
    const rootIdxH1 = await evalJs(`(document.querySelector('h1')?.textContent || '').trim()`);
    if (
      !rootNav1.errorText &&
      !rootOfflineNav.errorText &&
      !rootIdxNav.errorText &&
      rootCacheState?.slashOk &&
      rootCacheState?.idxOk &&
      rootOfflineH1.includes('The ERP Your Group') &&
      rootIdxH1.includes('The ERP Your Group')
    ) {
      pass('sw-nav-01-showcase-1st-visit-offline-and-index-html-nav', '0 ERR_FAILED across 1st-visit offline & /index.html, cached redirected=false');
    } else {
      fail('sw-nav-01-showcase-1st-visit-offline-and-index-html-nav', JSON.stringify({ rootOfflineNav, rootIdxNav, rootCacheState, rootOfflineH1, rootIdxH1 }));
    }

    // Test 2: Command Center `/app/` 1st visit -> SW-controlled reload + direct `/app/index.html?kiosk=attendance` query preservation
    const appNav1 = await sendCdp('Page.navigate', { url: `${BASE}/app/` });
    for (let i = 0; i < 40; i++) {
      const ctrl = await evalJs(`Boolean(navigator.serviceWorker && navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL.includes('/app/sw.js'))`);
      if (ctrl) break;
      await sleep(250);
    }
    await sleep(600);
    const appReloadNav = await sendCdp('Page.navigate', { url: `${BASE}/app/` });
    await sleep(800);
    const appKioskIdxNav = await sendCdp('Page.navigate', { url: `${BASE}/app/index.html?kiosk=attendance` });
    await sleep(800);
    const appShellProbe = await evalJs(`(async () => {
      const keys = await caches.keys();
      const shKey = keys.find(k => /^isabi-mfg-v\\d/.test(k));
      const c = shKey ? await caches.open(shKey) : null;
      const rSlash = c ? await c.match('./') : null;
      const rIdx = c ? await c.match('./index.html') : null;
      return {
        initialSearch: window.__INITIAL_SEARCH,
        kioskPrelock: document.documentElement.classList.contains('kiosk-prelock'),
        hasShell: Boolean(document.getElementById('appShell')),
        swActive: Boolean(navigator.serviceWorker?.controller?.scriptURL.includes('/app/sw.js')),
        slashClean: Boolean(rSlash && rSlash.status === 200 && rSlash.redirected === false),
        idxClean: Boolean(rIdx && rIdx.status === 200 && rIdx.redirected === false)
      };
    })()`);
    if (
      !appNav1.errorText &&
      !appReloadNav.errorText &&
      !appKioskIdxNav.errorText &&
      appShellProbe?.initialSearch === '?kiosk=attendance' &&
      appShellProbe?.kioskPrelock === true &&
      appShellProbe?.hasShell &&
      appShellProbe?.swActive &&
      appShellProbe?.slashClean &&
      appShellProbe?.idxClean
    ) {
      pass('sw-nav-02-app-sw-reload-and-index-html-kiosk-query', '0 ERR_FAILED across /app/ reload & /app/index.html?kiosk=attendance (kiosk-prelock=true)');
    } else {
      fail('sw-nav-02-app-sw-reload-and-index-html-kiosk-query', JSON.stringify({ appReloadNav, appKioskIdxNav, appShellProbe }));
    }

    // Test 3 (Adversarial #1 - Upgrade Seam v_old -> v_new): Poison SHELL_CACHE with genuine `redirected === true` Response, go OFFLINE, and reload `/app/`
    const poisonedOk = await evalJs(`(async () => {
      const keys = await caches.keys();
      const shKey = keys.find(k => /^isabi-mfg-v\\d/.test(k));
      const c = await caches.open(shKey);
      const redirRes = await fetch('/app/index.html?poison=1', { cache: 'reload' });
      await c.put('./', redirRes.clone());
      await c.put('./index.html', redirRes.clone());
      const check = await c.match('./index.html');
      return Boolean(check && check.redirected === true);
    })()`);
    await sendCdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    const offlinePoisonNav = await sendCdp('Page.navigate', { url: `${BASE}/app/` });
    await sleep(800);
    const offlinePoisonProbe = await evalJs(`({
      href: location.href,
      hasShell: Boolean(document.getElementById('appShell'))
    })`);
    await sendCdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    // Restore clean shell cache online
    await sendCdp('Page.navigate', { url: `${BASE}/app/` });
    await sleep(700);
    if (poisonedOk === true && !offlinePoisonNav.errorText && offlinePoisonProbe?.hasShell) {
      pass('sw-nav-03-adversarial-poisoned-redirect-cache-offline-recovery', 'redirected=true cache entry sanitized on-the-fly offline (0 ERR_FAILED)');
    } else {
      fail('sw-nav-03-adversarial-poisoned-redirect-cache-offline-recovery', JSON.stringify({ poisonedOk, offlinePoisonNav, offlinePoisonProbe }));
    }

    // Test 4 (Adversarial #2 - Direct Static Asset Top-Level Navigation Non-Hijack & 404 Cache Non-Pollution)
    const pngNav = await sendCdp('Page.navigate', { url: `${BASE}/og-image.png` });
    await sleep(500);
    const pngCt = await evalJs(`document.contentType`);
    const appIconNav = await sendCdp('Page.navigate', { url: `${BASE}/app/icon-512.png` });
    await sleep(500);
    const appIconCt = await evalJs(`document.contentType`);
    const appManifestNav = await sendCdp('Page.navigate', { url: `${BASE}/app/manifest.json` });
    await sleep(500);
    const appManifestCt = await evalJs(`document.contentType`);
    await sendCdp('Page.navigate', { url: `${BASE}/app/nonexistent-404-probe-xyz` });
    await sleep(500);
    await sendCdp('Page.navigate', { url: `${BASE}/app/` });
    await sleep(700);
    const cacheIntactAfter404 = await evalJs(`(async () => {
      const keys = await caches.keys();
      const shKey = keys.find(k => /^isabi-mfg-v\\d/.test(k));
      const c = shKey ? await caches.open(shKey) : null;
      const rIdx = c ? await c.match('./index.html') : null;
      const txt = rIdx ? await rIdx.text() : '';
      return {
        hasShell: Boolean(document.getElementById('appShell')),
        idxHasAppShell: txt.includes('id="appShell"')
      };
    })()`);
    if (
      !pngNav.errorText &&
      !appIconNav.errorText &&
      !appManifestNav.errorText &&
      pngCt === 'image/png' &&
      appIconCt === 'image/png' &&
      appManifestCt.includes('json') &&
      cacheIntactAfter404?.hasShell &&
      cacheIntactAfter404?.idxHasAppShell
    ) {
      pass('sw-nav-04-adversarial-static-asset-non-hijack-and-404-isolation', `og-image=${pngCt}, app/icon-512=${appIconCt}, manifest=${appManifestCt}, 404 isolated`);
    } else {
      fail('sw-nav-04-adversarial-static-asset-non-hijack-and-404-isolation', JSON.stringify({ pngCt, appIconCt, appManifestCt, cacheIntactAfter404 }));
    }

    // Test 5 (Adversarial #3 - Captive-Portal Non-HTML JSON & 503 Upstream Rejection Without SHELL_CACHE Poisoning)
    await sendCdp('Fetch.enable', {
      patterns: [{ urlPattern: `*127.0.0.1:${PORT}/app/?v=*`, requestStage: 'Request' }]
    });
    let interceptMode = 'json_captive';
    eventListeners.set('Fetch.requestPaused', params => {
      if (interceptMode === 'json_captive') {
        const bodyB64 = Buffer.from(JSON.stringify({ captive_portal: true, login_url: 'https://evil.portal.invalid/' })).toString('base64');
        sendCdp('Fetch.fulfillRequest', {
          requestId: params.requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
          body: bodyB64
        }).catch(() => {});
      } else if (interceptMode === 'http_503') {
        const bodyB64 = Buffer.from('Upstream gateway timeout').toString('base64');
        sendCdp('Fetch.fulfillRequest', {
          requestId: params.requestId,
          responseCode: 503,
          responseHeaders: [{ name: 'Content-Type', value: 'text/plain' }],
          body: bodyB64
        }).catch(() => {});
      } else {
        sendCdp('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
      }
    });
    const captiveJsonNav = await sendCdp('Page.navigate', { url: `${BASE}/app/` });
    await sleep(800);
    const afterJsonProbe = await evalJs(`(async () => {
      const keys = await caches.keys();
      const shKey = keys.find(k => /^isabi-mfg-v\\d/.test(k));
      const c = await caches.open(shKey);
      const rIdx = await c.match('./index.html');
      const txt = rIdx ? await rIdx.text() : '';
      return {
        hasShell: Boolean(document.getElementById('appShell')),
        notPoisoned: txt.includes('id="appShell"') && !txt.includes('captive_portal')
      };
    })()`);
    interceptMode = 'http_503';
    const upstream503Nav = await sendCdp('Page.navigate', { url: `${BASE}/app/` });
    await sleep(800);
    const after503HasShell = await evalJs(`Boolean(document.getElementById('appShell'))`);
    eventListeners.delete('Fetch.requestPaused');
    await sendCdp('Fetch.disable');
    if (
      !captiveJsonNav.errorText &&
      !upstream503Nav.errorText &&
      afterJsonProbe?.hasShell &&
      afterJsonProbe?.notPoisoned &&
      after503HasShell === true
    ) {
      pass('sw-nav-05-adversarial-captive-non-html-and-503-rejection', 'Captive non-HTML 200 & 503 rejected; trusted SHELL_CACHE preserved & served');
    } else {
      fail('sw-nav-05-adversarial-captive-non-html-and-503-rejection', JSON.stringify({ captiveJsonNav, upstream503Nav, afterJsonProbe, after503HasShell }));
    }

    // Test 6 (Adversarial #4 - Stuck Legacy `v19.6.217` Browser 1st-Click `/app/reset.html` & `/reset.html` Escape Hatch)
    // Stand up a real HTTP reverse-proxy to wrangler pages dev that initially serves the broken `v19.6.217` `/app/sw.js`
    // (which ONLY bypasses `.endsWith('/reset.html')` and returns `redirected: true` on `/app/reset` & `/app/`),
    // verify Chromium genuinely hits `ERR_FAILED` on `/app/`, then flip the server to the fixed `v19.6.218` `/app/sw.js`
    // while the browser is STILL stuck on `v19.6.217` and prove `/app/reset.html` rescues it on the VERY FIRST CLICK!
    const legacyBrokenSwCode = `
      self.addEventListener('install', e => { self.skipWaiting(); });
      self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
      self.addEventListener('fetch', e => {
        const u = new URL(e.request.url);
        if (u.pathname.endsWith('/reset.html') || u.pathname.includes('/api/')) return;
        if (e.request.mode === 'navigate') {
          e.respondWith(fetch(new Request('/app/index.html?broken=217', { cache: 'no-store' })));
        }
      });
    `;
    let serveBroken217 = true;
    const simServer = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (serveBroken217 && u.pathname === '/app/sw.js') {
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(legacyBrokenSwCode);
        return;
      }
      const proxyReq = http.request({
        hostname: '127.0.0.1',
        port: PORT,
        path: req.url,
        method: req.method,
        headers: Object.assign({}, req.headers, { host: `127.0.0.1:${PORT}` })
      }, proxyRes => {
        const hdrs = Object.assign({}, proxyRes.headers);
        if (hdrs.location) {
          hdrs.location = String(hdrs.location).replace(`:${PORT}`, `:${simServer.address().port}`);
        }
        res.writeHead(proxyRes.statusCode, hdrs);
        proxyRes.pipe(res);
      });
      proxyReq.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      req.pipe(proxyReq);
    });
    await new Promise((resolve, reject) => {
      simServer.listen(0, '127.0.0.1', resolve);
      simServer.on('error', reject);
    });
    const SIM_BASE = `http://127.0.0.1:${simServer.address().port}`;
    try {
      await sendCdp('Page.navigate', { url: `${SIM_BASE}/app/` });
      for (let i = 0; i < 35; i++) {
        const activeBroken = await evalJs(`Boolean(navigator.serviceWorker && navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL.endsWith('/app/sw.js'))`).catch(() => false);
        if (activeBroken) break;
        await sleep(200);
      }
      await sleep(300);
      const brokenAppCheck = await sendCdp('Page.navigate', { url: `${SIM_BASE}/app/` });
      var confirmedBrokenOn217 = Boolean(brokenAppCheck.errorText && brokenAppCheck.errorText.includes('ERR_FAILED'));
      // Flip server to fixed v19.6.218 while browser remains stuck on v19.6.217, then rescue in 1 click via /app/reset.html!
      serveBroken217 = false;
      var rescueAppReset = await sendCdp('Page.navigate', { url: `${SIM_BASE}/app/reset.html` });
      for (let i = 0; i < 30; i++) {
        const initSearch = await evalJs(`window.__INITIAL_SEARCH || ''`).catch(() => '');
        if (initSearch.startsWith('?reset=')) break;
        await sleep(250);
      }
      await sleep(700);
      var rescuedAppProbe = await evalJs(`({
        href: location.href,
        initialSearch: window.__INITIAL_SEARCH || '',
        hasShell: Boolean(document.getElementById('appShell'))
      })`);

      // Also verify `/reset.html` at root unregisters SWs and lands cleanly on `/?reset=...`
      var rescueRootReset = await sendCdp('Page.navigate', { url: `${SIM_BASE}/reset.html` });
      for (let i = 0; i < 30; i++) {
        const curUrl = await evalJs(`location.href`).catch(() => '');
        if (curUrl.includes('/?reset=')) break;
        await sleep(250);
      }
      await sleep(600);
      var rescuedRootProbe = await evalJs(`({
        href: location.href,
        h1: (document.querySelector('h1')?.textContent || '').trim()
      })`);
    } finally {
      try { simServer.close(); } catch (_) {}
    }
    if (
      confirmedBrokenOn217 &&
      !rescueAppReset.errorText &&
      rescuedAppProbe?.initialSearch.startsWith('?reset=') &&
      rescuedAppProbe?.hasShell &&
      !rescueRootReset.errorText &&
      rescuedRootProbe?.href.includes('/?reset=') &&
      rescuedRootProbe?.h1.includes('The ERP Your Group')
    ) {
      pass('sw-nav-06-adversarial-stuck-v217-1st-click-reset-html-rescue', 'Confirmed ERR_FAILED on simulated v19.6.217 -> rescued in 1 click via /app/reset.html & /reset.html');
    } else {
      fail('sw-nav-06-adversarial-stuck-v217-1st-click-reset-html-rescue', JSON.stringify({
        confirmedBrokenOn217,
        rescueAppReset,
        rescuedAppProbe,
        rescueRootReset,
        rescuedRootProbe
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
  console.log(`\nSummary: ${results.length - failed.length}/${results.length} Service Worker navigation checks passed.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL:', err);
  killTree(edgeProc.pid);
  killTree(wranglerProc.pid);
  process.exit(1);
});
