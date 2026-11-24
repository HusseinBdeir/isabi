// build/tour_video/capture_plates.mjs
// Captures real 3840x2160 (1920x1080 @2x) Light-Mode UI plates for ISABI_Tour_v1
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
const OUT_DIR = path.join(ISABI_WT, 'exports', 'ISABI_Tour_v1', 'plates');
fs.mkdirSync(OUT_DIR, { recursive: true });

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].find(p => fs.existsSync(p));
if (!EDGE) {
  console.error('msedge.exe not found');
  process.exit(2);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.vtt': 'text/vtt; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

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

function startStaticServer(rootDir, port) {
  const server = http.createServer((req, res) => {
    const reqPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let rel = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
    let full = path.resolve(rootDir, rel);
    if (!full.startsWith(path.resolve(rootDir))) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
      full = path.join(full, 'index.html');
    }
    if (!fs.existsSync(full)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(full).pipe(res);
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
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
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } catch (_) {}
}

function loadBannedPrivateNames() {
  const candidates = [
    path.join(ISABI_APP_WT, 'build', 'private_namebook.json'),
    'C:\\Users\\hbdei\\bhfirms\\isabi-app\\build\\private_namebook.json',
    'C:\\Users\\HusseinBdeir\\bhfirms\\isabi-app\\build\\private_namebook.json'
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

// Script injected right before every screenshot to scrub BHFIRMS names, raw placeholders,
// and exact seed dollar figures so every public tour frame holds purely illustrative demo figures.
const SCRUB_FN_EXPR = `(() => {
  const REPLACEMENTS = [
    [/All Manufacturing Group \\(WTC\\s*·\\s*BBConstruction\\s*·\\s*Lions Transport\\)/gi, 'Meridian Industrial Group (3 Entities)'],
    [/WTC\\s*·\\s*BBConstruction\\s*·\\s*Lions(?:\\s+Transport)?/gi, 'Atlas Ready-Mix · Meridian Aggregates · Cedar Fleet'],
    [/All Manufacturing Group/gi, 'Meridian Industrial Group'],
    [/Manufacturing Group/gi, 'Meridian Industrial Group'],
    [/WTC \\(World Trading & Construction\\)/gi, 'Atlas Ready-Mix'],
    [/\\bWTC\\b/gi, 'Atlas Ready-Mix'],
    [/\\bBBConstruction\\b|\\bBB Construction\\b/gi, 'Meridian Aggregates'],
    [/\\bLions Transport\\b|\\bLions\\b/gi, 'Cedar Fleet Haulage'],
    [/Bdeir Insurance Brokerage/gi, 'Shield Risk Brokerage'],
    [/BHF Insurance Brokerage/gi, 'Shield Risk Brokerage'],
    [/Bdeir Holding \\(Group Treasury & JV\\)/gi, 'Meridian Group Holding'],
    [/\\bBdeir Holding\\b/gi, 'Meridian Group Holding'],
    [/Properties \\(Buzwair & Bdeir Real Estate\\)/gi, 'Harborline Properties'],
    [/Bdeir Family Office|Bdeir Properties/gi, 'Harborline Family Office'],
    [/\\bBdeir\\b/gi, 'Meridian'],
    [/Insurance Company/gi, 'Shield Risk Brokerage'],
    [/Blanca Beach Resort|Blanca Beach|\\bBlanca\\b/gi, 'Azure Bay Resort'],
    [/La Una Resort|\\bLa Una\\b/gi, 'Harbor Beach Club'],
    [/Palms Resort|Palms Beach|\\bPalms\\b/gi, 'Cove Marina Resort'],
    [/Voile Resort|Voile Beach|\\bVoile\\b/gi, 'Crestline Villas'],
    [/Platinum Hospitality|\\bPlatinum\\b/gi, 'Summit Hospitality'],
    [/Korri Auto \\/ Shacman/gi, 'Apex Motors / Titan Trucks'],
    [/Korri Auto SAL|\\bKorri Auto\\b|\\bKorri\\b/gi, 'Apex Commercial Motors'],
    [/Shacman Heavy Trucks|Shacman Lebanon S\\.?A\\.?L\\.?|\\bShacman\\b/gi, 'Titan Heavy Trucks'],
    [/4235 Company S\\.?A\\.?L\\.?|\\b4235 Company\\b/gi, 'Plaza Commercial S.A.L.'],
    [/\\u0645\\u062c\\u0645\\u0648\\u0639\\u0629 \\u0627\\u0644\\u062a\\u0635\\u0646\\u064a\\u0639 \\u0648\\u0627\\u0644\\u0643\\u0633\\u0627\\u0631\\u0627\\u062a\\s*·\\s*\\u0634\\u0631\\u0643\\u0629 \\u0627\\u0644\\u062a\\u062c\\u0627\\u0631\\u0629 \\u0648\\u0627\\u0644\\u0628\\u0646\\u0627\\u0621 \\u0627\\u0644\\u0639\\u0627\\u0644\\u0645\\u064a\\u0629.*/g, '\\u0627\\u0644\\u0645\\u062c\\u0645\\u0648\\u0639\\u0629 \\u0627\\u0644\\u0635\\u0646\\u0627\\u0639\\u064a\\u0629 \\u0627\\u0644\\u0642\\u0627\\u0628\\u0636\\u0629 \\u00b7 \\u0623\\u0637\\u0644\\u0633 \\u0644\\u0644\\u062e\\u0631\\u0633\\u0627\\u0646\\u0629 \\u0648\\u0645\\u064a\\u0631\\u064a\\u062f\\u064a\\u0627\\u0646'],
    [/[\\u0648\\u0628]*\\u0628\\u0648\\u0632\\u0648\\u064a\\u0631|\\u0628\\u0632\\u0648\\u064a\\u0631/g, '\\u0645\\u064a\\u0631\\u064a\\u062f\\u064a\\u0627\\u0646'],
    [/[\\u0648]*\\u0628\\u062f\\u064a\\u0631/g, '\\u0645\\u064a\\u0631\\u064a\\u062f\\u064a\\u0627\\u0646'],
    [/\\bProperties\\b/g, 'Harborline Properties'],
    [/All Group \\(3\\)/g, 'Demo Group (3)'],
    [/Malf 15\\.7%/gi, '98.4% Active'],
    // Scrub real BHFIRMS MoF VAT numbers, street addresses, and telephone numbers
    [/VAT\\s*2585321-601\\s*\\/\\s*601-2372701|VAT\\s*2585321-601|VAT\\s*601-2372701/gi, 'VAT 0000000-001 (Demo Tax ID)'],
    [/2585321-601|601-2372701/g, '0000000-001'],
    [/Ras Beirut\\s*&\\s*Riad El Solh,\\s*Beirut,\\s*Lebanon|Ras Beirut,\\s*Hamra Street\\s*776|Riad El Solh,\\s*Beirut,\\s*Lebanon/gi, 'Sample Industrial District, Sector 4'],
    [/Tel:\\s*03\\/224839\\s*·\\s*01\\/998550-1|Tel:\\s*03\\/224839|Tel:\\s*01\\/998550-1(?:\\s*·\\s*Fax:\\s*01\\/998552)?/gi, 'Tel: +961 01 000 100'],
    [/03\\/224839|01\\/998550-1|01\\/998552/g, '+961 01 000 100'],
    // Exact seed numbers -> consistent synthetic demo figures ($8.4M - $2.9M = $5.5M; $5.5M - $3.6M = $1.9M)
    [/13,655,113/g, '8,420,650'],
    [/\\$13\\.7M/g, '$8.4M'],
    [/1,550,192/g, '1,842,500'],
    [/\\$1\\.6M/g, '$1.8M'],
    [/\\$8\\.8M/g, '$5.5M'],
    [/68\\.5%/g, '65.5%'],
    [/31\\.5%/g, '34.5%'],
    [/\\$4\\.1M/g, '$2.9M'],
    [/\\$3\\.60M/g, '$2.40M'],
    [/\\$7\\.3M/g, '$3.7M'],
    [/Exp \\$6\\.0M \\+ Pay/g, 'Exp $3.1M + Pay'],
    [/56\\.4%/g, '44.0%'],
    [/10,582,509/g, '5,410,200'],
    [/3,072,603/g, '3,010,450'],
    [/4,050,975/g, '2,940,120'],
    [/8,806,288/g, '5,480,530'],
    [/6,007,414/g, '3,120,800'],
    [/1,241,494/g, '517,230'],
    [/10,112,339/g, '6,840,210'],
    [/9,468,602/g, '4,920,400'],
    [/414,353/g, '284,120'],
    [/121,736\\.42/g, '94,620.00'],
    [/121,736/g, '94,620'],
    [/85,674/g, '62,480'],
    [/46,193\\.31/g, '32,480.00'],
    [/27,704\\.09/g, '21,190.00'],
    [/27,121\\.96/g, '18,940.00'],
    [/25,103\\.00/g, '14,250.00'],
    [/8,164\\.30/g, '7,760.00'],
    [/32,820/g, '24,180'],
    [/26,969/g, '18,420'],
    [/hbdeir@isabisystems\\.com/gi, 'contact@isabisystems.com']
  ];

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
const SITE_PORT = await freePort();

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'isabi-tour-cap-'));
const udd = path.join(tmpRoot, 'edge-profile');
fs.mkdirSync(udd, { recursive: true });
const tempDb = path.join(tmpRoot, 'mfg.db');
try {
  const srcDb = path.join(ISABI_APP_WT, 'data', 'mfg.db');
  if (fs.existsSync(srcDb)) fs.copyFileSync(srcDb, tempDb);
} catch (_) {}

let appProc = null;
let edgeProc = null;
let siteServer = null;
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

const BANNED_ENTITY_RE = /\b(wtc|bbconstruction|lions transport|bdeir|blanca|la una|palms|voile|korri|shacman|4235 company)\b|2585321|2372701|224839|998550|998552|Hamra Street 776|Riad El Solh|Ras Beirut/i;

async function snap(filename, label, bannedNames) {
  await evaluate(SCRUB_FN_EXPR);
  await evaluate(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  await sleep(300);
  const meta = await evaluate(`(() => {
    const txt = (document.body.innerText || '').trim();
    const low = txt.toLowerCase();
    return {
      title: document.title,
      url: location.href,
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
  const entHit = meta.rawText.match(BANNED_ENTITY_RE);
  if (entHit) throw new Error(`${filename} leaked BHFIRMS entity token "${entHit[0]}"`);
  if (meta.hasBadTokens) throw new Error(`${filename} has bad tokens (undefined/NaN/[object)`);
  if (leaks.length) throw new Error(`${filename} matched private name(s): ${leaks.slice(0, 5).join(', ')}`);

  const { data } = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const outPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
  console.log(`Captured ${filename} (${label}) | demo=${meta.isDemo} | nb=${meta.namebookLoaded} | ind="${meta.indPill}" | co="${meta.companyPill}" | bytes=${fs.statSync(outPath).size}`);
  return {
    file: filename,
    label,
    isDemo: meta.isDemo,
    namebookLoaded: meta.namebookLoaded,
    theme: meta.theme,
    indPill: meta.indPill,
    companyPill: meta.companyPill,
    overflow: meta.overflow,
    bytes: fs.statSync(outPath).size
  };
}

const bannedNames = loadBannedPrivateNames();
const report = [];

try {
  siteServer = await startStaticServer(ISABI_WT, SITE_PORT);
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
    '--window-size=1920,1080', '--force-device-scale-factor=2', 'about:blank'
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
    width: 1920,
    height: 1080,
    deviceScaleFactor: 2,
    mobile: false
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
    st.textContent = '::-webkit-scrollbar{width:6px;height:6px;} ::-webkit-scrollbar-thumb{background:rgba(120,108,90,0.28);border-radius:3px;}';
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

  // SHOT 1: Executive Overview — Multi-Entity Group (Manufacturing overview, positive metrics, scrubbed to Demo Group)
  await evaluate(`(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById('companySwitchTrigger')?.click();
    await w(80);
    const mfg = document.querySelector('[data-ep-ind*="Manufacturing"]');
    if (mfg) mfg.click();
    await w(80);
    document.getElementById('companySwitchDoneBtn')?.click();
    window.__navToView('overview');
    window.scrollTo(0, 0);
  })()`);
  await sleep(1000);
  report.push(await snap('shot_01.png', 'Executive Overview Consolidated Demo Group', bannedNames));

  // SHOT 2: Multi-Industry Switching (Demo Company bar + Automotive & Heavy Trading, checking for positive metrics)
  await evaluate(`(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById('companySwitchTrigger')?.click();
    await w(80);
    const btn = document.querySelector('.entity-btn[data-company="democompany"]');
    if (btn) btn.click();
    await w(80);
    document.getElementById('companySwitchDoneBtn')?.click();
    window.__navToView('overview');
    await w(450);
    const bar = document.getElementById('demoCompanyVerticalBar');
    if (bar) {
      const trd = Array.from(bar.querySelectorAll('button')).find(b => /Automotive|Trading/i.test(b.textContent || ''));
      if (trd) trd.click();
    }
    window.scrollTo(0, 0);
  })()`);
  await sleep(1000);
  report.push(await snap('shot_02.png', 'Multi-Industry Switching (Automotive & Heavy Trading)', bannedNames));

  // SHOT 3: Guided Smart Entry Modal on Sales Ticket with realistic sample controls populated
  await evaluate(`(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById('companySwitchTrigger')?.click();
    await w(80);
    const mfg = document.querySelector('[data-ep-ind*="Manufacturing"]');
    if (mfg) mfg.click();
    await w(80);
    document.getElementById('companySwitchDoneBtn')?.click();
    window.__navToView('sales');
    await w(350);
    document.getElementById('newEntryBtn')?.click();
    await w(450);
    const saleTab = document.querySelector('#entryModal [data-form="sales"], #entryModal [data-form="sale"], #entryModal [data-entry-form="sales"]');
    if (saleTab) saleTab.click();
    await w(300);
    const setCtrl = (sel, val) => {
      const el = document.querySelector(sel);
      if (!el) return;
      if (el.tagName === 'SELECT') {
        const o = document.createElement('option');
        o.value = val; o.textContent = val; o.selected = true;
        el.appendChild(o);
      }
      el.readOnly = false;
      el.disabled = false;
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setCtrl('#f_ticket, input[placeholder*="pad ticket" i]', '14508');
    setCtrl('#f_product, select[aria-label*="grade" i]', 'Ready-Mix C35');
    setCtrl('#f_customer, select[aria-label*="customer" i]', 'Cedars Infrastructure S.A.L.');
    setCtrl('#f_truck, select[aria-label*="truck" i]', 'UNIT-014');
    setCtrl('#f_truckowner, select[aria-label*="Hauler" i]', 'Cedar Fleet Haulage (Owned)');
    setCtrl('#f_qty, input[placeholder*="Truck m³" i]', '24.0');
    setCtrl('#f_price, input[placeholder*="Agreement" i]', '78.00');
    setCtrl('#f_total, #f_mat_total, input[placeholder="0.00"]', '1,872.00');
    // Populate any remaining visible empty select/input fields cleanly by placeholder
    document.querySelectorAll('#entryModal select').forEach(s => {
      if (s.value) return;
      const ph = (s.options[0] && s.options[0].textContent || '').toLowerCase();
      const pick = ph.includes('grade') || ph.includes('product') ? 'Ready-Mix C35'
        : ph.includes('customer') ? 'Cedars Infrastructure S.A.L.'
        : ph.includes('truck...') || ph.includes('type truck') ? 'UNIT-014'
        : ph.includes('auto-filled from truck') ? 'Cedar Fleet Haulage (Owned)' : '';
      if (pick) {
        const o = document.createElement('option');
        o.value = pick; o.textContent = pick; o.selected = true;
        s.appendChild(o); s.value = pick;
      }
    });
  })()`);
  await sleep(600);
  report.push(await snap('shot_03.png', 'Guided Smart Entry (Sales Ticket)', bannedNames));

  // Close #entryModal
  await evaluate(`(() => {
    document.getElementById('closeModalBtn')?.click();
    const m = document.getElementById('entryModal');
    if (m && !m.hidden) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }
  })()`);
  await sleep(300);

  // SHOT 4: Printable Bilingual Customer Statement of Account (#statements, tab #14)
  await evaluate(`(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    window.__navToView('statements');
    await w(450);
    const s14 = document.querySelector('[data-stmt="14"]');
    if (s14) s14.click();
    await w(650);
    // Ensure a customer parameter is populated if combobox has options
    const custSel = document.querySelector('.rdl-toolbar select, [data-rdl-param="party"]');
    if (custSel && custSel.options && custSel.options.length > 1 && !custSel.value) {
      custSel.selectedIndex = 1;
      custSel.dispatchEvent(new Event('change', { bubbles: true }));
      await w(500);
    }
    window.scrollTo(0, 145);
  })()`);
  await sleep(800);
  report.push(await snap('shot_04.png', 'Printable Bilingual Customer Statement of Account', bannedNames));

  // SHOT 5: Executive Dashboards (#pbi 01 Executive Pulse) framed across action bar, KPIs & charts
  await evaluate(`(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    window.__navToView('pbi');
    await w(700);
    window.scrollTo(0, 210);
  })()`);
  await sleep(900);
  report.push(await snap('shot_05.png', 'Executive Dashboards & Scenario Studio (#pbi)', bannedNames));

  // SHOT 6: Ask ISABI Drawer with voucher-cited overdue receivables response + Listen
  await evaluate(`(async () => {
    window.__navToView('overview');
    window.scrollTo(0, 0);
  })()`);
  await sleep(400);
  await evaluate(`(() => {
    window.MFG_ASK.open('Which customer receivables are overdue over 30 days?');
  })()`);
  for (let i = 0; i < 40; i++) {
    const done = await evaluate(`(() => {
      const d = document.getElementById('aiDrawer');
      if (!d || !d.classList.contains('open')) return false;
      const bots = d.querySelectorAll('.ai-msg.bot, .ai-msg-bot, .ai-turn-bot, [data-role="assistant"]');
      const threadTxt = (document.getElementById('aiThread')?.innerText || '').trim();
      return bots.length >= 1 && threadTxt.length > 140 && !/Thinking\\.\\.\\.|Analyzing\\.\\.\\./.test(threadTxt);
    })()`);
    if (done) break;
    await sleep(250);
  }
  await evaluate(`(() => {
    const th = document.getElementById('aiThread');
    if (th) th.scrollTop = th.scrollHeight;
  })()`);
  await sleep(700);
  report.push(await snap('shot_06.png', 'Ask ISABI Cited Bilingual Intelligence Drawer', bannedNames));

  // SHOT 7: Offline POS Till & Face + PIN Gate Kiosk in Showcase #sandbox pwa mode (with toast hidden)
  await send('Page.navigate', { url: `http://127.0.0.1:${SITE_PORT}/index.html#sandbox` });
  for (let i = 0; i < 60; i++) {
    try {
      const sReady = await evaluate(`Boolean(document.readyState === 'complete' && document.querySelector('[data-sbox-mode="pwa"]'))`);
      if (sReady) break;
    } catch (_) {}
    await sleep(200);
  }
  await evaluate(`(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const st = document.createElement('style');
    st.textContent = '#site-toast { display: none !important; }';
    document.head.appendChild(st);
    const pwaTab = document.querySelector('[data-sbox-mode="pwa"]');
    if (pwaTab) pwaTab.click();
    await w(350);
    const posAdd = document.querySelector('[data-pos-add]');
    if (posAdd) posAdd.click();
    await w(200);
    const kPunch = document.querySelector('[data-kiosk-punch]');
    if (kPunch) kPunch.click();
    await w(250);
    const sec = document.getElementById('sandbox');
    if (sec) {
      const top = Math.max(0, sec.getBoundingClientRect().top + window.scrollY - 68);
      window.scrollTo(0, top);
    }
  })()`);
  await sleep(700);
  await evaluate(SCRUB_FN_EXPR);
  await sleep(200);
  const sMeta = await evaluate(`(() => {
    const txt = (document.body.innerText || '').trim();
    const wrap = document.getElementById('sandbox-mock');
    return {
      isDemo: true,
      namebookLoaded: false,
      theme: document.documentElement.getAttribute('data-theme') || 'light',
      indPill: 'Showcase Sandbox',
      companyPill: 'Field Kiosks & POS Till',
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      hasBadTokens: /\\bundefined\\b|\\bNaN\\b|\\[object/.test(txt),
      mockLen: wrap ? wrap.innerText.length : 0,
      rawText: txt
    };
  })()`);
  const entHit7 = sMeta.rawText.match(BANNED_ENTITY_RE);
  if (entHit7) throw new Error(`shot_07.png leaked BHFIRMS entity token "${entHit7[0]}"`);
  if (sMeta.hasBadTokens || sMeta.mockLen < 80) {
    throw new Error(`shot_07.png showcase sandbox did not render cleanly: ${JSON.stringify(sMeta)}`);
  }
  const { data: shot7B64 } = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const shot7Path = path.join(OUT_DIR, 'shot_07.png');
  fs.writeFileSync(shot7Path, Buffer.from(shot7B64, 'base64'));
  report.push({
    file: 'shot_07.png',
    label: 'Field Kiosks & Offline POS Till',
    isDemo: true,
    namebookLoaded: false,
    theme: sMeta.theme,
    indPill: sMeta.indPill,
    companyPill: sMeta.companyPill,
    overflow: sMeta.overflow,
    bytes: fs.statSync(shot7Path).size
  });
  console.log(`Captured shot_07.png (Field Kiosks & Offline POS Till) | bytes=${fs.statSync(shot7Path).size}`);

  if (runtimeExceptions.length) {
    console.warn(`Runtime exceptions observed (${runtimeExceptions.length}):`, runtimeExceptions.slice(0, 3));
  }

  fs.writeFileSync(path.join(OUT_DIR, 'plates_meta.json'), JSON.stringify({ runtimeExceptions, plates: report }, null, 2));
  console.log('ALL 7 CLEAN PLATES CAPTURED OK ->', OUT_DIR);
} finally {
  if (ws) { try { ws.close(); } catch (_) {} }
  if (edgeProc && edgeProc.pid) killTree(edgeProc.pid);
  if (appProc && appProc.pid) killTree(appProc.pid);
  if (siteServer) { try { siteServer.close(); } catch (_) {} }
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
}
