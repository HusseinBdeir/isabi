// build/tour_video/capture_whatsapp_plates.mjs
// Captures 12 real 1170x2532 (390x844 @3x mobile portrait) Light-Mode UI plates for ISABI_WhatsApp_Reels_v1
// strictly in isolated Demo Sandbox mode (?demo=1&autologin=1&nosse=1) with public tour scrubbing.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ISABI_WT = path.resolve(__dirname, '..', '..');
const ISABI_APP_WT = path.resolve(ISABI_WT, '..', 'isabi-app');
const OUT_DIR = path.join(ISABI_WT, 'exports', 'ISABI_WhatsApp_Reels_v1', 'plates');
fs.mkdirSync(OUT_DIR, { recursive: true });

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].find(p => fs.existsSync(p));
if (!EDGE) {
  console.error('msedge.exe not found');
  process.exit(2);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJson = url => new Promise((resolve, reject) => http.get(url, res => {
  let b = '';
  res.on('data', c => b += c);
  res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
}).on('error', reject));

async function waitHttp(url, tries = 90) {
  for (let i = 0; i < tries; i++) {
    try { await getJson(url); return true; } catch (_) { await sleep(250); }
  }
  return false;
}

function killTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch (_) {}
}

function loadOptionalPrivateScrubConfig() {
  const candidates = [
    path.join(ISABI_APP_WT, 'build', 'private_reels_scrub.json'),
    path.resolve(__dirname, '..', '..', '..', 'isabi-app', 'build', 'private_reels_scrub.json'),
    path.join(os.homedir(), 'bhfirms', 'isabi-app', 'build', 'private_reels_scrub.json')
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (_) {}
  }
  return { replacements: [], bannedLiterals: [] };
}

function loadBannedPrivateNames() {
  const candidates = [
    path.join(ISABI_APP_WT, 'build', 'private_namebook.json'),
    path.resolve(__dirname, '..', '..', '..', 'isabi-app', 'build', 'private_namebook.json'),
    path.join(os.homedir(), 'bhfirms', 'isabi-app', 'build', 'private_namebook.json')
  ];
  const allowPath = path.join(ISABI_APP_WT, 'build', 'public_names_allow.json');
  const allowed = new Set();
  if (fs.existsSync(allowPath)) {
    try {
      const a = JSON.parse(fs.readFileSync(allowPath, 'utf8'));
      Object.keys(a.names || {}).forEach(k => allowed.add(k.toLowerCase()));
      Object.keys(a.isabi_repo_names || {}).forEach(k => allowed.add(k.toLowerCase()));
    } catch (_) {}
  }
  const banned = new Set();
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const nb = JSON.parse(fs.readFileSync(p, 'utf8'));
      const addVal = v => {
        if (typeof v !== 'string') return;
        const s = v.trim().toLowerCase();
        if (s.length >= 6 && !allowed.has(s) && s.includes(' ')) banned.add(s);
      };
      ['party_aliases', 'driver_aliases'].forEach(k => {
        const m = nb[k] || {};
        Object.keys(m).forEach(addVal);
        Object.values(m).forEach(addVal);
      });
      ['extended_parties', 'bio_quarantine', 'senior_people', 'owner_family'].forEach(k => {
        (nb[k] || []).forEach(item => addVal(typeof item === 'string' ? item : item && item.name));
      });
    } catch (_) {}
    break;
  }
  return Array.from(banned);
}

const PRIVATE_SCRUB_CFG = loadOptionalPrivateScrubConfig();
const BUILD_SCRUB_FN_EXPR = extraReplacements => `(() => {
  const REPLACEMENTS = ${JSON.stringify(Array.isArray(extraReplacements) ? extraReplacements : [])}.map(([pat, flags, rep]) => [new RegExp(pat, flags || 'gi'), rep]);

  const CLIENTS = [
    'Cedars Infrastructure S.A.L.',
    'Byblos Structural Works',
    'Metn Civil Contracting',
    'Horizon Foundations S.A.R.L.',
    'Levant Roadworks Co.',
    'Bekaa Precast Concrete',
    'Mount Lebanon Builders'
  ];
  const VENDORS = [
    'Chouf Quarry Supply',
    'Northern Fleet Parts',
    'Eastern Aggregate Hauliers',
    'Litani Fuel & Lubricants',
    'Apex Hydraulics S.A.L.'
  ];
  const STAFF = ['Rami Haddad', 'Karim Mansour', 'Nabil Khoury', 'Tarek Nassar', 'Sami Farah'];

  function scrubText(s) {
    if (!s || typeof s !== 'string') return s;
    let out = s;
    for (let i = 0; i < REPLACEMENTS.length; i++) {
      out = out.replace(REPLACEMENTS[i][0], REPLACEMENTS[i][1]);
    }
    out = out.replace(/Demo Client #(\\d+)/gi, (_, n) => CLIENTS[parseInt(n, 10) % CLIENTS.length]);
    out = out.replace(/Demo Vendor #(\\d+)/gi, (_, n) => VENDORS[parseInt(n, 10) % VENDORS.length]);
    out = out.replace(/Team Member #(\\d+)/gi, (_, n) => STAFF[parseInt(n, 10) % STAFF.length]);
    return out;
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  for (let i = 0; i < nodes.length; i++) {
    const t = nodes[i].nodeValue;
    const next = scrubText(t);
    if (next !== t) nodes[i].nodeValue = next;
  }
  document.querySelectorAll('option').forEach(opt => {
    const nxt = scrubText(opt.textContent);
    if (nxt !== opt.textContent) opt.textContent = nxt;
  });
  document.querySelectorAll('input, textarea').forEach(inp => {
    if (inp.placeholder) {
      const np = scrubText(inp.placeholder);
      if (np !== inp.placeholder) inp.placeholder = np;
    }
    if (inp.value && inp.type !== 'date') {
      const nv = scrubText(inp.value);
      if (nv !== inp.value) inp.value = nv;
    }
  });
  document.querySelectorAll('svg text').forEach(st => {
    const nt = scrubText(st.textContent);
    if (nt !== st.textContent) st.textContent = nt;
  });
  return true;
})()`;

const APP_PORT = await freePort();
const DBG_PORT = await freePort();

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'isabi-wa-cap-'));
const udd = path.join(tmpRoot, 'edge-profile');
fs.mkdirSync(udd, { recursive: true });
const tempDb = path.join(tmpRoot, 'mfg.db');
try {
  const srcDb = path.join(ISABI_APP_WT, 'data', 'mfg.db');
  if (fs.existsSync(srcDb)) fs.copyFileSync(srcDb, tempDb);
} catch (_) {}

let appProc = null;
let edgeProc = null;
let ws = null;
let msgId = 0;
const pending = new Map();
const runtimeExceptions = [];

function send(method, params = {}, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }
    }, timeoutMs);
    pending.set(id, {
      resolve: v => { clearTimeout(timer); resolve(v); },
      reject: e => { clearTimeout(timer); reject(e); }
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expr, timeoutMs = 45000) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, timeoutMs);
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : JSON.stringify(r.exceptionDetails));
  }
  return r.result ? r.result.value : undefined;
}

const SCRUB_FN_EXPR = BUILD_SCRUB_FN_EXPR(PRIVATE_SCRUB_CFG.replacements);
const BANNED_LITERALS = Array.isArray(PRIVATE_SCRUB_CFG.bannedLiterals) ? PRIVATE_SCRUB_CFG.bannedLiterals : [];
const BANNED_ENTITY_RE = BANNED_LITERALS.length
  ? new RegExp(BANNED_LITERALS.map(s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i')
  : null;

async function setLanguage(lang) {
  await evaluate(`(async () => {
    if (window.MFG_I18N && typeof window.MFG_I18N.setLang === 'function') {
      window.MFG_I18N.setLang(${JSON.stringify(lang)});
    }
    await new Promise(r => setTimeout(r, 450));
  })()`);
}

async function selectManufacturingDemoScope() {
  await evaluate(`(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById('companySwitchTrigger')?.click();
    await w(100);
    const mfg = document.querySelector('[data-ep-ind*="Manufacturing"]');
    if (mfg) mfg.click();
    await w(100);
    document.getElementById('companySwitchDoneBtn')?.click();
    await w(350);
  })()`);
}

async function selectHospitalityDemoScope() {
  await evaluate(`(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById('companySwitchTrigger')?.click();
    await w(100);
    const btn = document.querySelector('.entity-btn[data-company="democompany"]');
    if (btn) btn.click();
    await w(100);
    document.getElementById('companySwitchDoneBtn')?.click();
    window.__navToView('overview');
    await w(500);
    const bar = document.getElementById('demoCompanyVerticalBar');
    if (bar) {
      const hsp = Array.from(bar.querySelectorAll('button')).find(b => /Hospitality|Resort|الضيافة|المنتجع/i.test(b.textContent || ''));
      if (hsp) hsp.click();
    }
    await w(450);
  })()`);
}

async function snap(filename, label, expectLang, bannedNames) {
  await evaluate(SCRUB_FN_EXPR);
  await evaluate(`(() => {
    if (window.MFG_HUBS && typeof window.MFG_HUBS.releaseLaterBlocks === 'function') {
      window.MFG_HUBS.releaseLaterBlocks();
    }
  })()`);
  await evaluate(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  await sleep(350);

  const meta = await evaluate(`(() => {
    const txt = (document.body.innerText || '').trim();
    const low = txt.toLowerCase();
    return {
      title: document.title,
      dir: document.documentElement.dir || 'ltr',
      lang: document.documentElement.lang || '',
      isDemo: typeof window.__ISABI_IS_DEMO === 'function' ? window.__ISABI_IS_DEMO() : null,
      namebookLoaded: Boolean(window.MFG_NAMEBOOK && window.MFG_NAMEBOOK.loaded),
      theme: document.documentElement.getAttribute('data-theme') || 'light',
      companyPill: (document.getElementById('companySwitchCoText')?.textContent || '').trim(),
      indPill: (document.getElementById('companySwitchIndText')?.textContent || '').trim(),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      textLen: txt.length,
      hasBadTokens: /\\bundefined\\b|\\bNaN\\b|\\[object/.test(txt),
      rawText: txt,
      textSample: low
    };
  })()`);

  const leaks = [];
  if (meta && meta.textSample) {
    for (const nm of bannedNames) {
      if (meta.textSample.includes(nm)) leaks.push(nm);
    }
  }
  const entHit = BANNED_ENTITY_RE ? meta.rawText.match(BANNED_ENTITY_RE) : null;
  if (entHit) throw new Error(`${filename} leaked BHFIRMS entity token "${entHit[0]}"`);
  if (meta.hasBadTokens) throw new Error(`${filename} has bad tokens (undefined/NaN/[object)`);
  if (leaks.length) throw new Error(`${filename} matched private name(s): ${leaks.slice(0, 5).join(', ')}`);
  if (meta.overflow > 2) throw new Error(`${filename} has horizontal overflow=${meta.overflow}px`);
  if (meta.textLen <= 120) throw new Error(`${filename} rendered too little text (${meta.textLen})`);
  if (expectLang === 'ar' && meta.dir !== 'rtl') {
    throw new Error(`${filename} expected dir="rtl" for Arabic, got "${meta.dir}"`);
  }

  const { data } = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const outPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
  console.log(`Captured ${filename} (${label}) | dir=${meta.dir} | overflow=${meta.overflow} | textLen=${meta.textLen} | ind="${meta.indPill}" | co="${meta.companyPill}" | bytes=${fs.statSync(outPath).size}`);
  return {
    file: filename,
    label,
    lang: expectLang,
    dir: meta.dir,
    isDemo: meta.isDemo,
    namebookLoaded: meta.namebookLoaded,
    theme: meta.theme,
    indPill: meta.indPill,
    companyPill: meta.companyPill,
    overflow: meta.overflow,
    textLen: meta.textLen,
    bytes: fs.statSync(outPath).size
  };
}

const bannedNames = loadBannedPrivateNames();
const report = [];

try {
  appProc = spawn('python', ['server.py', String(APP_PORT)], {
    cwd: ISABI_APP_WT,
    env: Object.assign({}, process.env, { MFG_DB_PATH: tempDb }),
    stdio: 'ignore',
    windowsHide: true
  });
  if (!(await waitHttp(`http://127.0.0.1:${APP_PORT}/api/status`))) {
    throw new Error('isabi-app server.py did not start');
  }

  edgeProc = spawn(EDGE, [
    '--headless=new', '--enable-automation', `--remote-debugging-port=${DBG_PORT}`,
    `--user-data-dir=${udd}`, '--no-first-run', '--disable-gpu',
    '--window-size=390,844', '--force-device-scale-factor=3', 'about:blank'
  ], { stdio: 'ignore', windowsHide: true });

  if (!(await waitHttp(`http://127.0.0.1:${DBG_PORT}/json/version`))) {
    throw new Error('Edge DevTools did not start');
  }
  const page = (await getJson(`http://127.0.0.1:${DBG_PORT}/json`)).find(t => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params && m.params.exceptionDetails;
      runtimeExceptions.push(d && d.exception ? (d.exception.description || d.text) : JSON.stringify(d));
    }
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'light' }]
  });
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true
  });

  await send('Page.navigate', { url: `http://127.0.0.1:${APP_PORT}/?demo=1&autologin=1&nosse=1` });

  let ready = false;
  for (let i = 0; i < 150; i++) {
    try {
      ready = await evaluate(`(() => {
        if (document.readyState !== 'complete') return false;
        if (!window.MFG_SEED || !window.MFG_SEED._recordsReady) return false;
        if (!window.MFG_ASK || !window.__navToView) return false;
        const ag = document.getElementById('authGate');
        return Boolean(ag && ag.hidden === true);
      })()`, 4000);
      if (ready) break;
    } catch (_) {}
    await sleep(250);
  }
  if (!ready) throw new Error('Timed out waiting for autologin + demo seed ready');

  await evaluate(`(() => {
    if (window.MFG_HUBS && typeof window.MFG_HUBS.releaseLaterBlocks === 'function') {
      window.MFG_HUBS.releaseLaterBlocks();
    }
    const html = document.documentElement;
    if (html.getAttribute('data-theme') === 'dark') {
      document.getElementById('themeToggleBtn')?.click();
    }
    const st = document.createElement('style');
    st.textContent = '::-webkit-scrollbar{width:0px;height:0px;}';
    document.head.appendChild(st);
  })()`);
  await sleep(900);

  const demoGuard = await evaluate(`({
    isDemo: typeof window.__ISABI_IS_DEMO === 'function' && window.__ISABI_IS_DEMO(),
    namebookLoaded: Boolean(window.MFG_NAMEBOOK && window.MFG_NAMEBOOK.loaded)
  })`);
  if (!demoGuard.isDemo || demoGuard.namebookLoaded) {
    throw new Error(`Demo isolation invariant failed: ${JSON.stringify(demoGuard)}`);
  }

  for (const lang of ['en', 'ar']) {
    await setLanguage(lang);

    // Ready-Mix & Manufacturing
    await selectManufacturingDemoScope();
    await evaluate(`window.__navToView('overview'); window.scrollTo(0, 0);`);
    await sleep(900);
    report.push(await snap(`readymix_${lang}_shot_01.png`, `Ready-Mix Overview (${lang})`, lang, bannedNames));

    await evaluate(`window.__navToView('raw_pricing'); window.scrollTo(0, 0);`);
    await sleep(900);
    const rawPricingLen = await evaluate(`(document.getElementById('workspace')?.innerText || '').trim().length`);
    if (rawPricingLen < 220) {
      await evaluate(`window.__navToView('raw'); window.scrollTo(0, 0);`);
      await sleep(900);
      report.push(await snap(`readymix_${lang}_shot_02.png`, `Ready-Mix Material & Quarry (${lang})`, lang, bannedNames));
    } else {
      report.push(await snap(`readymix_${lang}_shot_02.png`, `Ready-Mix Quarry & Haulage Rates (${lang})`, lang, bannedNames));
    }

    await evaluate(`window.__navToView('fleet'); window.scrollTo(0, 260); document.querySelectorAll('.main, #workspace, main').forEach(el => { el.scrollTop = 250; });`);
    await sleep(900);
    report.push(await snap(`readymix_${lang}_shot_03.png`, `Ready-Mix Fleet & Profit (${lang})`, lang, bannedNames));

    // Resorts & Hospitality
    await selectHospitalityDemoScope();
    await evaluate(`window.__navToView('overview'); window.scrollTo(0, 0);`);
    await sleep(900);
    report.push(await snap(`resorts_${lang}_shot_01.png`, `Resorts Overview (${lang})`, lang, bannedNames));

    await evaluate(`window.__navToView('hsp_revenue'); window.scrollTo(0, 0);`);
    await sleep(900);
    report.push(await snap(`resorts_${lang}_shot_02.png`, `Resorts POS & Daily Closings (${lang})`, lang, bannedNames));

    await evaluate(`window.__navToView('hsp_memberships'); window.scrollTo(0, 0);`);
    await sleep(900);
    report.push(await snap(`resorts_${lang}_shot_03.png`, `Resorts Memberships & Splits (${lang})`, lang, bannedNames));
  }

  if (runtimeExceptions.length) {
    console.warn(`Runtime exceptions observed (${runtimeExceptions.length}):`, runtimeExceptions.slice(0, 3));
  }

  fs.writeFileSync(path.join(OUT_DIR, 'plates_meta.json'), JSON.stringify({ runtimeExceptions, plates: report }, null, 2));
  console.log('ALL 12 CLEAN MOBILE PORTRAIT PLATES CAPTURED OK ->', OUT_DIR);
} finally {
  if (ws) { try { ws.close(); } catch (_) {} }
  if (edgeProc && edgeProc.pid) killTree(edgeProc.pid);
  if (appProc && appProc.pid) killTree(appProc.pid);
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
}
