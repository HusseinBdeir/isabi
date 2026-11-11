#!/usr/bin/env node
/**
 * build/verify_live_parity.mjs
 *
 * Post-deploy live parity & security verification gate for ISABI Systems.
 *
 * Phases:
 *   A. Release diff: compares live `/app/sw.js` against `isabi` (HEAD + WT),
 *      `isabi-app` (HEAD + WT), and `ISABICommandReleasesReference.md`, failing
 *      on any shell version regression.
 *   B. Edge security & asset hygiene HTTP probes (`401` `/app/api/users`,
 *      `204` `OPTIONS`, `404` internal build/config/seed paths, HSTS + XFO + XCTO).
 *   C. Headless Chromium/Edge 6-industry hub, sub-tab & system-tray walk with
 *      sync quarantine (`__MFG_HEADLESS_TEST = true`) and $0-quota LLM stubbing
 *      by default (`--allow-live-llm` to opt in).
 *   D. Interactive click suite across 30+ studios, modals, forms, inspectors &
 *      drawers (including Mfg `#aieMfgVoiceStrip` + `#aieMfgOpenBatchBtn` ->
 *      `#aiBatchIntakeModal`, sibling `#aieIndVoiceStrip`, `#treasuryForecastModal`,
 *      `#inventoryOptimizerModal`, `#tabletKeysModal`, `#rolePermissionsMatrixPanel`).
 *   E. Release-log `#id` code + DOM/visibility audit across every `live` release,
 *      plus optional `--sync-release-log` status-line updater.
 */

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ISABI_ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const opts = {
    url: 'https://isabisystems.com/app/?demo=1&autologin=1&nosse=1',
    syncReleaseLog: false,
    allowLiveLlm: false,
    skipEdgeHttp: false,
    releaseLogPath: process.env.THEO_RELEASE_LOG || path.join(
      os.homedir(),
      'OneDrive - BHFIRMS',
      'System',
      'System',
      'THEO',
      'ISABICommandReleasesReference.md'
    ),
    devRepoPath: process.env.ISABI_APP_REPO || path.resolve(ISABI_ROOT, '..', 'isabi-app'),
    jsonOut: ''
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url' && argv[i + 1]) opts.url = argv[++i];
    else if (a.startsWith('--url=')) opts.url = a.slice(6);
    else if (a === '--sync-release-log') opts.syncReleaseLog = true;
    else if (a === '--allow-live-llm') opts.allowLiveLlm = true;
    else if (a === '--skip-edge-http') opts.skipEdgeHttp = true;
    else if (a === '--release-log' && argv[i + 1]) opts.releaseLogPath = argv[++i];
    else if (a.startsWith('--release-log=')) opts.releaseLogPath = a.slice(14);
    else if (a === '--dev-repo' && argv[i + 1]) opts.devRepoPath = argv[++i];
    else if (a === '--json-out' && argv[i + 1]) opts.jsonOut = argv[++i];
    else if (a.startsWith('--json-out=')) opts.jsonOut = a.slice(11);
  }
  return opts;
}

const OPTS = parseArgs(process.argv);
const TARGET_URL = new URL(OPTS.url);
const IS_LOCAL_TARGET = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(TARGET_URL.hostname);
const ORIGIN = TARGET_URL.origin;
const APP_BASE_PATH = TARGET_URL.pathname.startsWith('/app') ? '/app/' : '/';
const APP_ORIGIN_BASE = `${ORIGIN}${APP_BASE_PATH}`;

const NON_DOM_PROSE_TOKENS = new Set([
  'idx', // v19.6.240 prose reference to SharePoint workbook `#idx` suffixes
  'hsp_expenses' // Hospitality hub route alias (`targetHubView: 'hsp_expenses'` -> `expenses`)
]);

// Hidden <input type="file"> or master-checkbox sub-controls that live in DOM with 0x0 or clipped styling
const NON_VISUAL_DOM_IDS = new Set([
  'indEntryScanFileInput',
  'permSelectAllTabsPagesCb'
]);

const CONDITIONAL_ROUTE_OR_STATE_IDS = new Set([
  // Auth / logged-out / PIN / step-up / non-demo Owner-only overlays (`canManageTabletKeys` requires `!isDemoSandboxSession()`)
  'authGate', 'loginScreen', 'loginCard', 'loginForm', 'quickSeatList',
  'pinSetupOverlay', 'stepUpAuthModal', 'suaPinInput', 'suaAiBriefBox', 'nuRolePopover', 'nu_auth_mode',
  'tabletKeysModal', 'kioskStationKeysOpenBtn',
  // Mobile-only navigation chrome (desktop viewport is 1440x900)
  'mobileSubnav', 'mobileBottomNav', 'mobileDrawer', 'mobilePageGuideBtn', 'mobileLangBtn', 'mobileSearchBtn',
  // Dedicated `?kiosk=*` URL mode, live WebRTC camera hardware, QR phone scan & split OCR preview
  'thermalPrintModal', 'docCamModal', 'docCamCardSubBar', 'docCamTopDeck', 'docCamConfirmBtn',
  'docCamGuide', 'docCamPhoneQrBtn', 'pscCardSubBar', 'phoneScanCompanionShell',
  'ssPageSwitcher', 'ssSplitPreviewPane', 'faceCamVideo', 'faceEnrollModal',
  'entryUnsavedPrompt', 'telHistoryReconDrawer',
  // Conditional transient states (mutually exclusive reopen toggle, fuzzy hint, pinned cover note, tour spotlight)
  'hldReopenAllEntitiesBtn', 'pgTourSpotlight', 'pgTourCard', 'pgInlineAnswerBox', 'stmtPinnedCoverNote', 'aieFuzzyPartyHint'
]);

// Narrow prefix exemption strictly for dedicated `?kiosk=` mode, biometric camera, and pre-login overlays
// (never matches #tillRecentPanel, #stepUpWatchdogPanel, or #kioskStationKeysOpenBtn)
const KIOSK_OR_AUTH_OVERLAY_PREFIX_RE = /^(kiosk(?!StationKeysOpenBtn)|wall|pump|scale|face|login|pinSetup|nu_|nuRole|stepUpAuth)/;

const checks = [];
function pass(name, detail = '') {
  checks.push({ ok: true, name, detail });
  console.log(`PASS  ${name}${detail ? ' - ' + detail : ''}`);
}
function fail(name, detail = '') {
  checks.push({ ok: false, name, detail });
  console.error(`FAIL  ${name}${detail ? ' - ' + detail : ''}`);
}
function info(name, detail = '') {
  console.log(`INFO  ${name}${detail ? ' - ' + detail : ''}`);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseVerTuple(v) {
  const m = String(v || '').match(/v?(\d+)\.(\d+)\.(\d+)/);
  if (!m) return [0, 0, 0];
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function cmpVer(a, b) {
  const ta = parseVerTuple(a);
  const tb = parseVerTuple(b);
  for (let i = 0; i < 3; i++) {
    if (ta[i] !== tb[i]) return ta[i] - tb[i];
  }
  return 0;
}

function extractShellVer(text) {
  const m = String(text || '').match(/v19\.\d+\.\d+/);
  return m ? m[0] : '';
}

function readGitFileVer(repoDir, relPath) {
  try {
    if (!fs.existsSync(repoDir)) return '';
    const out = execFileSync('git', ['show', `HEAD:${relPath}`], {
      cwd: repoDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    return extractShellVer(out);
  } catch (_) {
    return '';
  }
}

function readWtFileVer(repoDir, relPath) {
  try {
    const p = path.join(repoDir, relPath);
    if (!fs.existsSync(p)) return '';
    return extractShellVer(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return '';
  }
}

function parseReleaseLog(logPath) {
  if (!logPath || !fs.existsSync(logPath)) return { exists: false, entries: [], lines: [] };
  const raw = fs.readFileSync(logPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const m = ln.match(/^- \*\*(v19\.\d+\.\d+)([^*]+)\*\*/);
    if (!m) continue;
    const ver = m[1];
    const title = (m[1] + m[2]).trim();
    const ids = [];
    const idRe = /`#([A-Za-z][A-Za-z0-9_-]{2,})`/g;
    let im;
    while ((im = idRe.exec(ln)) !== null) {
      if (!ids.includes(im[1])) ids.push(im[1]);
    }
    let statusLineIdx = -1;
    let statusText = '';
    if (i + 1 < lines.length && /^\s+(?:-\s+)?\*Status\b/.test(lines[i + 1])) {
      statusLineIdx = i + 1;
      statusText = lines[i + 1].trim();
    }
    entries.push({ ver, title, ids, lineIdx: i, statusLineIdx, statusText });
  }
  return { exists: true, entries, lines };
}

async function fetchHttpProbe(urlStr, method = 'GET') {
  const res = await fetch(urlStr, {
    method,
    redirect: 'manual',
    headers: {
      'User-Agent': 'ISABI-Live-Parity-Gate/1.0',
      'Cache-Control': 'no-cache'
    }
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const headers = {};
  res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  return { status: res.status, headers, bodyBytes: buf.length, text: buf.toString('utf8') };
}

function findBrowserBinary() {
  const candidates = [
    process.env.BROWSER_BIN,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/microsoft-edge',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ].filter(Boolean);
  return candidates.find(p => fs.existsSync(p)) || '';
}

function getJsonHttp(urlStr) {
  return new Promise((resolve, reject) => {
    http.get(urlStr, res => {
      let b = '';
      res.on('data', c => { b += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(b)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function waitDevtools(port, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      await getJsonHttp(`http://127.0.0.1:${port}/json/version`);
      return true;
    } catch (_) {
      await sleep(250);
    }
  }
  return false;
}

function buildDeterministicAiStubPayload(postBodyStr) {
  let task = 'generic';
  try {
    const parsed = JSON.parse(postBodyStr || '{}');
    task = String(parsed.task || parsed.mode || 'generic');
  } catch (_) {}
  const responseObj = {
    ok: true,
    mode: 'parity_stub_zero_quota',
    task,
    note: 'Deterministic parity stub active. All ledger figures remain 100% rule-computed.',
    summary: 'Deterministic parity stub active. Review variances directly in the table.',
    bullets: [
      'Deterministic ledger figures verified.',
      'Zero external LLM tokens consumed during parity gate.',
      'Review highlighted operational rows.'
    ],
    draft_en: 'Dear Counterparty, kindly confirm the scheduled balance at your earliest convenience.',
    draft_ar: 'يرجى تأكيد الرصيد المجدول في أقرب وقت ممكن.',
    draft_fr: 'Veuillez confirmer le solde prevu dans les meilleurs delais.'
  };
  return JSON.stringify(responseObj);
}

function syncReleaseLogStatusLines(logPath, liveVer, liveCodeMissingByVer) {
  if (!logPath || !fs.existsSync(logPath)) return { updated: 0 };
  const raw = fs.readFileSync(logPath, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  const today = new Date().toISOString().slice(0, 10);
  const out = [];
  let updated = 0;

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    out.push(ln);
    const m = ln.match(/^- \*\*(v19\.\d+\.\d+)\b/);
    if (!m) continue;
    const ver = m[1];
    const hasExistingStatus = (i + 1 < lines.length) && /^\s+(?:-\s+)?\*Status\b/.test(lines[i + 1]);
    const existingStatusLine = hasExistingStatus ? lines[i + 1] : '';
    const isRecentOrPending = cmpVer(ver, 'v19.6.240') >= 0 || cmpVer(ver, liveVer) > 0 || hasExistingStatus;

    if (!isRecentOrPending) continue;

    const miss = liveCodeMissingByVer.get(ver) || [];
    const isLiveClean = cmpVer(ver, liveVer) <= 0 && miss.length === 0;
    // Preserve curated provenance/superseded notes when the release is already marked live/deployed/superseded
    if (
      hasExistingStatus &&
      isLiveClean &&
      !/\b(pending sync|not yet synced|partial on)\b/i.test(existingStatusLine) &&
      /\b(live on|deployed live|deployed as part of|committed and deployed|historical superseded sync|dropped one release later)\b/i.test(existingStatusLine)
    ) {
      out.push(existingStatusLine);
      i++; // consume preserved curated status line
      continue;
    }

    let desiredStatus;
    if (isLiveClean) {
      desiredStatus = `  *Status ${today}: live on isabisystems.com/app (shell ${liveVer}; parity gate verified).*`;
    } else if (cmpVer(ver, liveVer) <= 0 && miss.length > 0) {
      desiredStatus = `  *Status ${today}: partial on isabisystems.com/app (shell ${liveVer}; missing anchors: ${miss.slice(0, 6).join(', ')}).*`;
    } else {
      desiredStatus = `  *Status ${today}: pending sync (live shell is ${liveVer}).*`;
    }

    if (Buffer.byteLength(desiredStatus, 'utf8') > 2400) {
      desiredStatus = desiredStatus.slice(0, 2380) + '...*';
    }

    if (hasExistingStatus) {
      if (existingStatusLine !== desiredStatus) {
        out.push(desiredStatus);
        updated++;
      } else {
        out.push(existingStatusLine);
      }
      i++; // consume old status line
    } else {
      out.push(desiredStatus);
      updated++;
    }
  }

  if (updated > 0) {
    fs.writeFileSync(logPath, out.join(eol), 'utf8');
  }
  return { updated };
}

async function main() {
  const report = {
    timestamp: new Date().toISOString(),
    targetUrl: OPTS.url,
    versions: {},
    edgeSecurity: [],
    walk: null,
    launchers: [],
    releaseAnchorAudit: null,
    runtimeExceptions: []
  };

  // =========================================================================
  // PHASE A: Release & Git/WT Version Diff + Anti-Regression Gate
  // =========================================================================
  const swUrl = `${APP_ORIGIN_BASE}sw.js?t=${Date.now()}`;
  const liveSwProbe = await fetchHttpProbe(swUrl, 'GET');
  const liveVer = extractShellVer(liveSwProbe.text);
  const deployHeadVer = readGitFileVer(ISABI_ROOT, 'app/sw.js');
  const deployWtVer = readWtFileVer(ISABI_ROOT, 'app/sw.js');
  const devHeadVer = readGitFileVer(OPTS.devRepoPath, 'sw.js');
  const devWtVer = readWtFileVer(OPTS.devRepoPath, 'sw.js');

  report.versions = { liveVer, deployHeadVer, deployWtVer, devHeadVer, devWtVer };
  info(
    'version-matrix',
    `live=${liveVer || 'NONE'} | isabi(HEAD=${deployHeadVer || '?'}, WT=${deployWtVer || '?'}) | isabi-app(HEAD=${devHeadVer || '?'}, WT=${devWtVer || '?'})`
  );

  if (!liveVer) {
    fail('phaseA-live-sw-version', `Could not read SHELL_CACHE version from ${swUrl} (HTTP ${liveSwProbe.status})`);
  } else {
    pass('phaseA-live-sw-version', `${swUrl} serving ${liveVer}`);
  }

  const parsedLog = parseReleaseLog(OPTS.releaseLogPath);
  if (parsedLog.exists || !IS_LOCAL_TARGET) {
    let highestRecordedLive = 'v19.6.200';
    for (const e of parsedLog.entries) {
      if (/\blive\b/i.test(e.statusText) && !/\bpending\b/i.test(e.statusText)) {
        if (cmpVer(e.ver, highestRecordedLive) > 0) highestRecordedLive = e.ver;
      }
    }
    if (!IS_LOCAL_TARGET) {
      if (deployHeadVer && cmpVer(deployHeadVer, highestRecordedLive) > 0) highestRecordedLive = deployHeadVer;
      if (deployWtVer && cmpVer(deployWtVer, highestRecordedLive) > 0) highestRecordedLive = deployWtVer;
    }
    if (liveVer && cmpVer(liveVer, highestRecordedLive) < 0) {
      fail('phaseA-anti-regression', `Live version ${liveVer} is behind expected ${highestRecordedLive}`);
    } else {
      pass('phaseA-anti-regression', `Live ${liveVer} >= baseline ${highestRecordedLive}`);
    }

    const pendingCommitted = parsedLog.entries
      .filter(e => cmpVer(e.ver, liveVer) > 0 && (cmpVer(e.ver, devHeadVer || 'v0.0.0') <= 0 || cmpVer(e.ver, deployHeadVer || 'v0.0.0') <= 0))
      .map(e => e.ver);
    const uncommittedVers = [];
    if (devWtVer && devHeadVer && cmpVer(devWtVer, devHeadVer) > 0) uncommittedVers.push(`isabi-app WT=${devWtVer}`);
    if (deployWtVer && deployHeadVer && cmpVer(deployWtVer, deployHeadVer) > 0) uncommittedVers.push(`isabi WT=${deployWtVer}`);

    info('release-status-summary', [
      `LIVE<=${liveVer}`,
      `COMMITTED_PENDING=[${pendingCommitted.join(', ') || 'none'}]`,
      `UNCOMMITTED=[${uncommittedVers.join(', ') || 'none'}]`
    ].join(' | '));
  } else {
    info('phaseA-release-log', `Release log not found at ${OPTS.releaseLogPath} (skipping release-log diff)`);
  }

  // =========================================================================
  // PHASE B: Edge Security & Asset Hygiene HTTP Probes (Suggestion 1 Gate)
  // =========================================================================
  if (!IS_LOCAL_TARGET && !OPTS.skipEdgeHttp) {
    const secProbes = [
      { label: 'showcase-root', method: 'GET', path: '/', expectStatus: [200], requireHsts: true, requireXfo: true, requireXcto: true },
      { label: 'app-sw', method: 'GET', path: '/app/sw.js', expectStatus: [200], requireHsts: true, requireXfo: true, requireXcto: true },
      { label: 'api-users-unauth-401', method: 'GET', path: '/app/api/users', expectStatus: [401], requireHsts: true, requireXfo: true, requireXcto: true },
      { label: 'api-seed-unauth-401', method: 'GET', path: '/app/api/seed/core', expectStatus: [401], requireHsts: true, requireXfo: true, requireXcto: true },
      { label: 'api-options-204', method: 'OPTIONS', path: '/app/api/users', expectStatus: [204], zeroBody: true, requireHsts: true, requireXfo: true, requireXcto: true },
      { label: 'api-kiosk-options-204', method: 'OPTIONS', path: '/app/api/kiosk/verify', expectStatus: [204], zeroBody: true, requireHsts: true, requireXfo: true, requireXcto: true },
      { label: 'block-build-script', method: 'GET', path: '/build/assemble.py', expectStatus: [404], requireHsts: true, requireXfo: true, requireXcto: true },
      { label: 'block-wrangler-toml', method: 'GET', path: '/wrangler.toml', expectStatus: [404], requireHsts: true, requireXfo: true, requireXcto: true },
      { label: 'block-migrations-sql', method: 'GET', path: '/migrations/0001_schema.sql', expectStatus: [404], requireHsts: true, requireXfo: true, requireXcto: true },
      { label: 'block-app-server-py', method: 'GET', path: '/app/server.py', expectStatus: [404], requireHsts: true, requireXfo: true, requireXcto: true },
      { label: 'block-raw-seed-core', method: 'GET', path: '/app/js/seed_core.json', expectStatus: [404], requireHsts: true, requireXfo: true, requireXcto: true },
      { label: 'block-raw-seed-records', method: 'GET', path: '/app/js/seed_records.json', expectStatus: [404], requireHsts: true, requireXfo: true, requireXcto: true },
      { label: 'block-raw-seed-industries', method: 'GET', path: '/app/js/seed_industries.json', expectStatus: [404], requireHsts: true, requireXfo: true, requireXcto: true },
      { label: 'allow-demo-seed-core', method: 'GET', path: '/app/js/seed_demo_core.json', expectStatus: [200], requireHsts: true, requireXfo: true, requireXcto: true }
    ];

    for (const sp of secProbes) {
      const pRes = await fetchHttpProbe(`${ORIGIN}${sp.path}`, sp.method);
      const statusOk = sp.expectStatus.includes(pRes.status);
      const bodyOk = !sp.zeroBody || pRes.bodyBytes === 0;
      const hstsOk = !sp.requireHsts || Boolean(pRes.headers['strict-transport-security']);
      const xfoOk = !sp.requireXfo || /^(DENY|SAMEORIGIN)$/i.test(String(pRes.headers['x-frame-options'] || ''));
      const xctoOk = !sp.requireXcto || /^nosniff$/i.test(String(pRes.headers['x-content-type-options'] || ''));
      const allOk = statusOk && bodyOk && hstsOk && xfoOk && xctoOk;
      report.edgeSecurity.push({
        label: sp.label,
        path: sp.path,
        method: sp.method,
        status: pRes.status,
        hsts: Boolean(pRes.headers['strict-transport-security']),
        xfo: pRes.headers['x-frame-options'] || null,
        xcto: pRes.headers['x-content-type-options'] || null,
        ok: allOk
      });
      if (allOk) {
        pass(`phaseB-${sp.label}`, `${sp.method} ${sp.path} -> ${pRes.status} (HSTS=${Boolean(pRes.headers['strict-transport-security'])}, XFO=${pRes.headers['x-frame-options'] || 'n/a'})`);
      } else {
        fail(`phaseB-${sp.label}`, `${sp.method} ${sp.path} -> status=${pRes.status} bytes=${pRes.bodyBytes} hsts=${Boolean(pRes.headers['strict-transport-security'])} xfo=${pRes.headers['x-frame-options'] || 'none'} xcto=${pRes.headers['x-content-type-options'] || 'none'}`);
      }
    }
  } else {
    info('phaseB-edge-security', 'Skipped remote Edge static/headers probes (local target or --skip-edge-http)');
  }

  // =========================================================================
  // Fetch Live Served Code Bundle Tokens (for Phase E `#id` Code Presence Audit)
  // =========================================================================
  const codeParts = [];
  const appIndexProbe = await fetchHttpProbe(APP_ORIGIN_BASE, 'GET');
  codeParts.push(appIndexProbe.text);
  if (!IS_LOCAL_TARGET) {
    try {
      const rootProbe = await fetchHttpProbe(`${ORIGIN}/`, 'GET');
      if (rootProbe.status === 200) codeParts.push(rootProbe.text);
    } catch (_) {}
  }
  const assetRefs = new Set();
  const assetRe = /(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g;
  let am;
  while ((am = assetRe.exec(appIndexProbe.text)) !== null) {
    const ref = am[1];
    if (/^https?:\/\//i.test(ref) && !ref.startsWith(ORIGIN)) continue;
    if (/seed_.*\.json/i.test(ref)) continue;
    const absUrl = new URL(ref, APP_ORIGIN_BASE).toString();
    assetRefs.add(absUrl);
  }
  for (const aUrl of assetRefs) {
    try {
      const aProbe = await fetchHttpProbe(aUrl, 'GET');
      if (aProbe.status === 200) codeParts.push(aProbe.text);
    } catch (_) {}
  }
  const servedCodeTokens = new Set((codeParts.join('\n').match(/[A-Za-z][A-Za-z0-9_-]{2,}/g)) || []);
  info('served-bundle-indexed', `${assetRefs.size} assets indexed (${servedCodeTokens.size.toLocaleString()} unique tokens)`);

  // =========================================================================
  // PHASE C: Headless CDP Boot + 6-Industry Hub, Sub-Tab & System-Tray Walk
  // =========================================================================
  const browserBin = findBrowserBinary();
  if (!browserBin) {
    fail('phaseC-browser-binary', 'No headless Edge/Chrome binary found');
    process.exit(1);
  }

  const dbgPort = 9420 + Math.floor(Math.random() * 350);
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'isabi-live-parity-'));
  const browserArgs = [
    '--headless=new',
    '--enable-automation',
    '--disable-ipc-flooding-protection',
    `--remote-debugging-port=${dbgPort}`,
    `--user-data-dir=${udd}`,
    '--no-first-run',
    '--disable-gpu',
    '--window-size=1440,900'
  ];
  if (process.platform !== 'win32') browserArgs.push('--no-sandbox', '--disable-dev-shm-usage');
  browserArgs.push('about:blank');
  const browser = spawn(browserBin, browserArgs, { stdio: 'ignore', windowsHide: true });

  let ws = null;
  let msgId = 0;
  const pending = new Map();
  const runtimeExceptions = [];

  function cdpSend(method, params = {}, timeoutMs = 25000) {
    return new Promise((resolve, reject) => {
      const id = ++msgId;
      const timer = setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`CDP timeout on ${method}`));
        }
      }, timeoutMs);
      pending.set(id, {
        resolve: v => { clearTimeout(timer); resolve(v); },
        reject: e => { clearTimeout(timer); reject(e); }
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression, timeoutMs = 45000) {
    const r = await cdpSend('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    }, timeoutMs);
    if (r.exceptionDetails) {
      const desc = r.exceptionDetails.exception
        ? (r.exceptionDetails.exception.description || r.exceptionDetails.text)
        : r.exceptionDetails.text;
      throw new Error(desc || 'Runtime.evaluate exception');
    }
    return r.result ? r.result.value : undefined;
  }

  try {
    if (!(await waitDevtools(dbgPort))) {
      throw new Error('Browser DevTools port did not come up');
    }
    const targets = await getJsonHttp(`http://127.0.0.1:${dbgPort}/json`);
    const pageTarget = targets.find(t => t.type === 'page');
    if (!pageTarget) throw new Error('No page target found in headless browser');

    ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.onmessage = async ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
        return;
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params && msg.params.exceptionDetails;
        const text = (d && ((d.exception && d.exception.description) || d.text)) || 'Unknown exception';
        runtimeExceptions.push(text.slice(0, 300));
      } else if (msg.method === 'Fetch.requestPaused') {
        const { requestId, request } = msg.params;
        try {
          const stubBody = buildDeterministicAiStubPayload(request && request.postData);
          await cdpSend('Fetch.fulfillRequest', {
            requestId,
            responseCode: 200,
            responseHeaders: [
              { name: 'Content-Type', value: 'application/json; charset=utf-8' },
              { name: 'Cache-Control', value: 'no-store' }
            ],
            body: Buffer.from(stubBody, 'utf8').toString('base64')
          });
        } catch (_) {
          try { await cdpSend('Fetch.continueRequest', { requestId }); } catch (__) {}
        }
      }
    };

    await cdpSend('Runtime.enable');
    await cdpSend('Page.enable');
    await cdpSend('Page.addScriptToEvaluateOnNewDocument', {
      source: 'window.__MFG_HEADLESS_TEST = true;'
    });
    await cdpSend('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    if (!OPTS.allowLiveLlm) {
      await cdpSend('Fetch.enable', {
        patterns: [
          { urlPattern: '*/api/ai-edge*', requestStage: 'Request' },
          { urlPattern: '*/api/ask*', requestStage: 'Request' }
        ]
      });
      info('llm-quota-guard', 'Stubbing /api/ai-edge and /api/ask via CDP Fetch ($0 Gemini quota burn)');
    }

    await cdpSend('Page.navigate', { url: OPTS.url });

    // Wait for Command Center boot + seed records ready + #authGate sign-in
    // Note: when window.__MFG_HEADLESS_TEST is true, app.js intentionally pauses on #authGate
    // even with autologin=1 until a quick-seat or demo sandbox button is clicked.
    const bootDeadline = Date.now() + 45000;
    let booted = false;
    while (Date.now() < bootDeadline) {
      try {
        const state = await evaluate(`(() => {
          const seedOk = Boolean(window.MFG_SEED && window.MFG_SEED._recordsReady && window.MFG_ENTERPRISE && window.MFG_AI_EDGE);
          if (!seedOk) return { ready: false };
          const gateEl = document.getElementById('authGate') || document.getElementById('loginScreen');
          const gateLocked = Boolean(document.body.classList.contains('locked') || (gateEl && !gateEl.hidden && getComputedStyle(gateEl).display !== 'none'));
          if (gateLocked) {
            const seat = document.querySelector('[data-quick-seat*="hussein"], [data-quick-seat], #authDemoBtn, #enterDemoBtn, [data-demo-enter]');
            if (seat) seat.click();
            return { ready: false, clickedSeat: Boolean(seat) };
          }
          const wsEl = document.getElementById('workspace');
          return { ready: Boolean(wsEl && wsEl.offsetParent !== null && wsEl.children.length > 0) };
        })()`, 5000);
        if (state && state.ready) {
          booted = true;
          break;
        }
      } catch (_) {}
      await sleep(300);
    }
    if (!booted) {
      throw new Error(`Timed out waiting for Command Center workspace at ${OPTS.url}`);
    }
    pass('phaseC-app-boot', 'Command Center workspace booted & demo Owner session active');

    const allLogIds = parsedLog.exists
      ? Array.from(new Set(parsedLog.entries.flatMap(e => e.ids))).filter(id => !NON_DOM_PROSE_TOKENS.has(id))
      : [];

    // Execute full 6-industry walk inside page
    const walkRes = await evaluate(`(async () => {
      const IDS = ${JSON.stringify(allLogIds)};
      const ent = window.MFG_ENTERPRISE;
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const vis = el => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        let p = el;
        while (p && p !== document.documentElement) {
          const c = getComputedStyle(p);
          if (c.display === 'none' || c.visibility === 'hidden' || Number(c.opacity) === 0) return false;
          p = p.parentElement;
        }
        return true;
      };
      const catalog = typeof ent.getCompanyCatalog === 'function' ? ent.getCompanyCatalog() : [];
      const pickCo = (preferred, industryRe) => {
        if (catalog.some(c => c && c.key === preferred)) return preferred;
        const byInd = catalog.find(c => c && industryRe.test(String(c.industry || '')));
        return byInd ? byInd.key : preferred;
      };
      const COS = [
        'manufacturing-group',
        pickCo('bdeirholding', /Holding/i),
        pickCo('blanca', /Hospitality/i),
        pickCo('shacman', /Trading/i),
        pickCo('4235company', /Real Estate/i),
        pickCo('insurance', /Insurance/i)
      ];
      const seenVisible = {};
      const seenDom = {};
      const walked = [];
      const errors = [];
      const mojibakeHits = [];

      const scan = tag => {
        const ws = document.getElementById('workspace');
        if (ws && /Â·|â€|Ãƒ/.test(ws.textContent || '')) {
          if (mojibakeHits.length < 10) mojibakeHits.push(tag);
        }
        for (const id of IDS) {
          const el = document.getElementById(id);
          if (!el) continue;
          if (!seenDom[id]) seenDom[id] = [];
          if (seenDom[id].length < 3) seenDom[id].push(tag);
          if (vis(el)) {
            if (!seenVisible[id]) seenVisible[id] = [];
            if (seenVisible[id].length < 3) seenVisible[id].push(tag);
          }
        }
      };

      for (const co of COS) {
        try { ent.selectCompanyScope(co); } catch (e) { errors.push(co + ' select: ' + e.message); continue; }
        await sleep(220);
        const hubs = Array.from(document.querySelectorAll('#sidebarNav .nav-item'))
          .filter(n => n.offsetParent)
          .map(n => n.dataset.view)
          .filter(Boolean);
        const tray = Array.from(document.querySelectorAll('#railSystemBar [data-view]'))
          .map(n => n.dataset.view)
          .filter(Boolean);
        const done = new Set();
        for (const hub of hubs.concat(tray)) {
          if (done.has(hub)) continue;
          try { ent.setView(hub); } catch (e) { errors.push(co + '/' + hub + ': ' + e.message); continue; }
          await sleep(90);
          done.add(hub);
          walked.push(co + '/' + hub);
          scan(co + '/' + hub);
          const subs = Array.from(document.querySelectorAll('#hubSubtabBar [data-hub-subtab]'))
            .map(n => n.dataset.hubSubtab)
            .filter(Boolean);
          for (const sv of subs) {
            if (done.has(sv)) continue;
            try { ent.setView(sv); } catch (e) { errors.push(co + '/' + sv + ': ' + e.message); continue; }
            await sleep(75);
            done.add(sv);
            walked.push(co + '/' + sv);
            scan(co + '/' + sv);
          }
        }
      }

      window.__PARITY_WALK = { COS, seenVisible, seenDom, walked };
      return {
        companies: COS,
        walkedCount: walked.length,
        errors,
        mojibakeHits,
        domCount: Object.keys(seenDom).length,
        visCount: Object.keys(seenVisible).length
      };
    })()`, 240000);

    report.walk = walkRes;
    if (walkRes.walkedCount >= 220 && walkRes.errors.length === 0 && walkRes.mojibakeHits.length === 0) {
      pass('phaseC-6-industry-walk', `${walkRes.walkedCount} views walked across 6 industries (0 nav errors, 0 mojibake)`);
    } else {
      fail('phaseC-6-industry-walk', `walked=${walkRes.walkedCount}, errors=${JSON.stringify(walkRes.errors)}, mojibake=${JSON.stringify(walkRes.mojibakeHits)}`);
    }

    // =========================================================================
    // PHASE D: Interactive Studio, Modal, Form & Drawer Click Suite (30+ Launchers)
    // =========================================================================
    const clickSuite = await evaluate(`(async () => {
      const IDS = ${JSON.stringify(allLogIds)};
      const ent = window.MFG_ENTERPRISE;
      const W = window.__PARITY_WALK || { COS: ['manufacturing-group', 'bdeirholding', 'blanca', 'shacman', '4235company', 'insurance'], seenVisible: {}, seenDom: {} };
      const [M, HLD, HSP, TRD, RE, INS] = W.COS;
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const $ = id => document.getElementById(id);
      const vis = el => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        let p = el;
        while (p && p !== document.documentElement) {
          const c = getComputedStyle(p);
          if (c.display === 'none' || c.visibility === 'hidden' || Number(c.opacity) === 0) return false;
          p = p.parentElement;
        }
        return true;
      };
      const recordSeen = (ids, tag) => {
        for (const id of ids) {
          const el = $(id);
          if (!el) continue;
          if (!W.seenDom[id]) W.seenDom[id] = [];
          if (W.seenDom[id].length < 3) W.seenDom[id].push(tag);
          if (vis(el)) {
            if (!W.seenVisible[id]) W.seenVisible[id] = [];
            if (W.seenVisible[id].length < 3) W.seenVisible[id].push(tag);
          }
        }
      };
      const scanAllIds = tag => recordSeen(IDS, tag);
      const closeAll = async () => {
        for (let k = 0; k < 3; k++) {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
          await sleep(60);
        }
        if (window.MFG_AI_EDGE && typeof window.MFG_AI_EDGE.closeBatchIntakeModal === 'function') {
          window.MFG_AI_EDGE.closeBatchIntakeModal();
        }
        for (const sel of ['#closeAiDrawerBtn', '#unsavedEntryDiscardBtn', '#indEntryModalCloseBtn', '#modalCloseBtn', '#entryModalClose', '#inspectorCloseBtn', '#tabletKeysCloseBtn', '[data-close-modal]', '.modal-close-btn', '.wi-close', '.cf-close', '.po-close', '.pg-close', '.popover-close', '[aria-label="Close"]']) {
          document.querySelectorAll(sel).forEach(b => { if (vis(b)) { try { b.click(); } catch (_) {} } });
        }
        await sleep(80);
      };
      const go = async (co, view) => {
        await closeAll();
        if (ent.STATE.company !== co) { ent.selectCompanyScope(co); await sleep(200); }
        ent.setView(view);
        await sleep(160);
      };
      const out = [];
      const test = async (label, co, view, clickTarget, expectIds, opts = {}) => {
        const row = { label, at: co + '/' + view, ok: [], missing: [], mojibake: false };
        try {
          await go(co, view);
          const btn = typeof clickTarget === 'function' ? clickTarget() : $(clickTarget);
          if (!btn || !vis(btn)) {
            row.error = 'launcher not visible: ' + (typeof clickTarget === 'string' ? clickTarget : label);
            out.push(row);
            return;
          }
          recordSeen([btn.id].filter(Boolean), label);
          btn.click();
          await sleep(opts.wait || 280);
          const seenInTest = new Set();
          const captureExpected = subTag => {
            recordSeen(expectIds, subTag);
            scanAllIds(subTag);
            for (const id of expectIds) {
              if (vis($(id))) seenInTest.add(id);
            }
          };
          captureExpected(label);
          const primary = $(expectIds[0]);
          if (primary && /Â·|â€|Ãƒ/.test(primary.textContent || '')) row.mojibake = true;
          if (opts.afterClick) {
            await opts.afterClick(row, captureExpected);
            captureExpected(label + ':after');
          }
          for (const id of expectIds) {
            (seenInTest.has(id) ? row.ok : row.missing).push(id);
          }
        } catch (e) {
          row.error = String(e && e.message ? e.message : e);
        }
        await closeAll();
        out.push(row);
      };

      const toggleIn = panelId => () => {
        const p = $(panelId);
        if (!p) return null;
        return Array.from(p.querySelectorAll('button')).find(b => /Toggle/i.test(b.id) || /^(Open|Show)\b/i.test((b.textContent || '').trim())) || null;
      };
      const newEntryBtn = () => $('newEntryBtn') || Array.from(document.querySelectorAll('button')).find(b => vis(b) && /New Entry/i.test(b.textContent || ''));

      // 1-6: CEO Overview Studios & Variance Brief (including v19.6.243 Treasury & Inventory)
      await test('what-if-studio', M, 'overview', 'ceoWhatIfBtn', ['whatIfSimulatorModal', 'wiBreakEvenBanner', 'wiApplyAlertRuleBtn', 'wiOpenPricingHubBtn', 'wiWhatsappDraftInput']);
      await test('collection-forecast-studio', M, 'overview', 'ceoCollectionForecastBtn', ['collectionForecastModal', 'cfCallListTable', 'cfWhatsappDraftInput']);
      await test('payables-optimizer-studio', M, 'overview', 'ceoPayablesOptimizerBtn', ['payablesOptimizerModal', 'poDisbursementTable', 'poWhatsappDraftInput']);
      await test('treasury-runway-studio', M, 'overview', 'ceoTreasuryForecastBtn', ['treasuryForecastModal']);
      await test('inventory-optimizer-studio', M, 'overview', 'ceoInventoryOptimizerBtn', ['inventoryOptimizerModal']);
      await test('ceo-variance-brief', M, 'overview', 'ceoVarianceBriefBtn', ['ceoPeriodSummaryPopover']);

      // 7: Topbar More menu (#langSwitch) + Page Guide (Key Insights | Interactive Tour | Ask & Share)
      const topMoreBtn = $('topbarMoreBtn');
      if (topMoreBtn && vis(topMoreBtn)) {
        topMoreBtn.click();
        await sleep(140);
        scanAllIds('topbar-more-popover');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        await sleep(80);
      }
      await test('page-guide-and-tour', M, 'cashflow', () => {
        let b = $('topbarPageGuideBtn');
        if (b && vis(b)) {
          recordSeen(['topbarPageGuideBtn', 'topbarPageListenBtn'], 'topbar-direct');
          return b;
        }
        const more = $('topbarMoreBtn') || $('mobileMoreBtn');
        if (more && vis(more)) {
          try { more.click(); } catch (_) {}
          recordSeen(['topbarPageGuideBtn', 'topbarPageListenBtn'], 'topbar-more-menu');
        }
        return $('topbarPageGuideBtn');
      }, ['pageGuidePopover', 'pgAskInput', 'pgMaturityBridgeCard', 'pgOpenWhatIfBtn', 'pgOpenCollectionForecastBtn', 'pgOpenPayablesOptimizerBtn', 'pgOpenTreasuryForecastBtn', 'pgOpenInventoryOptimizerBtn', 'pgWhatsappDraftInput'], {
        wait: 350,
        afterClick: async (row, captureExpected) => {
          const pg = $('pageGuidePopover');
          const askTabBtn = pg && (pg.querySelector('[data-pg-tab="ask"]') || Array.from(pg.querySelectorAll('button')).find(b => vis(b) && /ask|share/i.test(b.textContent || '')));
          if (askTabBtn) {
            askTabBtn.click();
            await sleep(200);
            captureExpected('page-guide-ask');
          }
          const tourBtn = pg && (pg.querySelector('[data-pg-tab="tour"]') || Array.from(pg.querySelectorAll('button')).find(b => vis(b) && /tour|walk/i.test(b.textContent || '')));
          if (tourBtn) {
            tourBtn.click();
            await sleep(220);
            captureExpected('page-guide-tour');
            row.tourStarted = vis($('pgTourNextBtn'));
          }
        }
      });

      // 8: Ask ISABI Drawer (#askIsabiBtn -> #aiDrawer + #aiAutoVoiceBtn)
      await test('ask-isabi-drawer', M, 'overview', 'askIsabiBtn', ['aiDrawer', 'aiAutoVoiceBtn']);

      // 8b: Global Command Palette (v19.6.248: #topbarSearchBtn -> #cmdPaletteModal + zero-match #cmdPaletteAskBtn)
      if ($('topbarSearchBtn') && vis($('topbarSearchBtn'))) {
        await test('command-palette', M, 'overview', 'topbarSearchBtn', ['cmdPaletteModal'], {
          wait: 220,
          afterClick: async () => {
            const inp = document.querySelector('#cmdPaletteModal input');
            if (inp) {
              inp.value = 'zzzz_unmatched_query_999';
              inp.dispatchEvent(new Event('input', { bubbles: true }));
              await sleep(140);
              scanAllIds('cmd-palette-zero-match');
            }
          }
        });
      }

      // 9-13: Operational, Sentinel, Dashboard & Statement Briefs
      await test('daily-ops-handover', M, 'daily_ops', 'dopsHandoverBriefBtn', ['dailyOpsHandoverPopover', 'dopsWhatsappDraftInput']);
      await test('daily-ops-explain-drivers', M, 'daily_ops', 'dopsAiBriefBtn', ['dopsAiBriefCard'], { wait: 350 });
      await test('sentinel-triage-brief', M, 'sentinels', 'snExplainTriageBtn', ['sentinelTriagePopover', 'snWhatsappDraftInput']);
      await test('pbi-explain-outliers', M, 'pbi', 'pbiExplainOutliersBtn', ['pbiVariancePopover']);
      await test('statement-explain-variance', M, 'statements', 'stmtExplainVarianceBtn', ['stmtVariancePopover']);

      // 14-26: All 13 Phase-16 Recon & Phase-17 Period-Close Studios across all 6 verticals
      await test('mfg-statement-recon', M, 'raw', toggleIn('mfgAiStatementReconPanel'), ['mfgAiStatementReconPanel', 'mfgAiPostReconBtn']);
      await test('mfg-period-close', M, 'statements', toggleIn('mfgPeriodClosePanel'), ['mfgPeriodClosePanel', 'mfgAiCutoffSweepBtn', 'mfgConfirmationPackBtn']);
      await test('holding-14-entity-close', HLD, 'entities', toggleIn('hldCloseGatePanel'), ['hldCloseGatePanel', 'hldBoardPackBriefBtn', 'hldBoardPackListenBtn', 'hldSealAll14EntitiesBtn']);
      await test('holding-bank-sweep', HLD, 'hld_interactions', toggleIn('hldAiBankSweepPanel'), ['hldAiBankSweepPanel', 'hldAiPostBankSweepBtn']);
      await test('holding-semantic-matcher', HLD, 'hld_interactions', toggleIn('hldAiMatchPanel'), ['hldAiMatchPanel']);
      await test('hospitality-settlement-recon', HSP, 'hsp_revenue', toggleIn('hspAiSettlementReconPanel'), ['hspAiSettlementReconPanel', 'hspAiPostClearBtn']);
      await test('hospitality-period-close', HSP, 'statements', toggleIn('hspPeriodClosePanel'), ['hspPeriodClosePanel', 'hspAiShrinkageBriefBtn']);
      await test('trading-landed-warranty', TRD, 'trd_sales', toggleIn('trdAiLandedWarrantyPanel'), ['trdAiLandedWarrantyPanel', 'trdAiPostPackBtn']);
      await test('trading-period-close', TRD, 'statements', toggleIn('trdPeriodClosePanel'), ['trdPeriodClosePanel', 'trdAiBottleneckEtaBtn']);
      await test('realestate-cam-recon', RE, 're_leases', toggleIn('reAiCamDepositReconPanel'), ['reAiCamDepositReconPanel', 'reAiPostCamBtn', 'reAiArrearsDraftBtn']);
      await test('realestate-period-close', RE, 'statements', toggleIn('rePeriodClosePanel'), ['rePeriodClosePanel', 'reAiAddendumParserBtn']);
      await test('insurance-bordereau-recon', INS, 'ins_policies', toggleIn('insAiBordereauPanel'), ['insAiBordereauPanel', 'insAiPostBordereauBtn']);
      await test('insurance-period-close', INS, 'statements', toggleIn('insPeriodClosePanel'), ['insPeriodClosePanel', 'insAiRenewalBriefBtn']);

      // 27-29: + New Entry Voice-to-Form & Batch Table (Manufacturing + Sibling Industry across tab switches)
      await test('mfg-new-entry-voice-and-batch', M, 'sales', newEntryBtn, ['entryModal', 'entrySmartScanBar', 'aieMfgVoiceStrip', 'aieMfgOpenBatchBtn', 'entryAttachmentsBar'], {
        wait: 260,
        afterClick: async row => {
          const batchBtn = $('aieMfgOpenBatchBtn');
          if (batchBtn && vis(batchBtn)) {
            batchBtn.click();
            await sleep(180);
            scanAllIds('mfg-batch-intake');
            row.batchModalVisible = vis($('aiBatchIntakeModal'));
            if (!row.batchModalVisible) row.missing.push('aiBatchIntakeModal');
            window.MFG_AI_EDGE.closeBatchIntakeModal();
          } else {
            row.missing.push('aiBatchIntakeModal');
          }
          const clickEntryFormTab = async (formKey, tag) => {
            for (const g of document.querySelectorAll('#entryModal [data-pa-group]')) {
              const t = document.querySelector('#entryModal .modal-tab[data-form="' + formKey + '"]');
              if (t && vis(t)) break;
              g.click();
              await sleep(60);
            }
            const tab = document.querySelector('#entryModal .modal-tab[data-form="' + formKey + '"]');
            if (tab) {
              tab.click();
              await sleep(120);
              const discard = $('unsavedEntryDiscardBtn');
              if (discard && vis(discard)) { discard.click(); await sleep(100); }
              scanAllIds(tag);
            }
          };
          await clickEntryFormTab('fuel', 'mfg-fuel-tab');
          await clickEntryFormTab('companyequipment', 'mfg-coeq-tab');
          if (!$('f_vin') || !vis($('f_vin'))) await clickEntryFormTab('equipment', 'mfg-eq-tab');
          const vinInp = $('f_vin');
          if (vinInp && vis(vinInp)) {
            vinInp.value = 'LZGJLDR4XRX018442';
            vinInp.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(80);
            scanAllIds('mfg-eq-vin-hint');
          }
          const extdGrp = document.querySelector('#entryModal [data-ind-quick-form="extended"], #entryModal [data-pa-group="extended"]');
          if (extdGrp) {
            extdGrp.click();
            await sleep(120);
            const discard = $('unsavedEntryDiscardBtn');
            if (discard && vis(discard)) { discard.click(); await sleep(100); }
            scanAllIds('mfg-extd-group');
          }
        }
      });

      // Extended Movement kind selector (#wrap_ext_kind on Holding / All scope)
      await go('all', 'external');
      const allExtdBtn = newEntryBtn();
      if (allExtdBtn && vis(allExtdBtn)) {
        allExtdBtn.click();
        await sleep(160);
        for (const g of document.querySelectorAll('#entryModal [data-pa-group]')) {
          const extTab = document.querySelector('#entryModal .modal-tab[data-form="external"]');
          if (extTab && vis(extTab)) break;
          g.click();
          await sleep(60);
        }
        const extTab = document.querySelector('#entryModal .modal-tab[data-form="external"]');
        if (extTab) {
          extTab.click();
          await sleep(120);
          const discard = $('unsavedEntryDiscardBtn');
          if (discard && vis(discard)) { discard.click(); await sleep(100); }
        }
        const qExtd = document.querySelector('#entryModal [data-ind-quick-form="extended"]');
        if (qExtd && vis(qExtd)) { qExtd.click(); await sleep(120); }
        const coSelAll = $('f_company');
        if (coSelAll && !vis($('wrap_ext_kind'))) {
          coSelAll.value = 'Bdeir Holding';
          coSelAll.dispatchEvent(new Event('input', { bubbles: true }));
          coSelAll.dispatchEvent(new Event('change', { bubbles: true }));
          await sleep(100);
        }
        scanAllIds('all-extd-kind');
        await closeAll();
      }

      await test('sibling-new-entry-voice-and-tab-switch', HSP, 'hsp_revenue', newEntryBtn, ['indDomainEntryModal', 'indEntrySmartScanBar', 'aieIndVoiceStrip', 'aieIndOpenBatchBtn', 'indEntryAttachmentsBar'], {
        wait: 260,
        afterClick: async row => {
          const altTab = Array.from(document.querySelectorAll('#indDomainEntryModal [data-ide-switch-form]'))
            .find(b => b.getAttribute('data-ide-switch-form') !== 'hsp_revenue');
          if (altTab) {
            altTab.click();
            await sleep(160);
            scanAllIds('ind-alt-tab');
            if (!vis($('aieIndVoiceStrip'))) row.missing.push('aieIndVoiceStripAfterTabSwitch');
          }
        }
      });

      // Touch Trading VIN/Chassis controls + Insurance chrono schedule controls on #indDomainEntryModal
      await test('trading-new-entry-vin-controls', TRD, 'trd_sales', newEntryBtn, ['indDomainEntryModal', 'ide_chassis'], {
        wait: 220,
        afterClick: async () => {
          const trkTab = document.querySelector('#indDomainEntryModal [data-ide-switch-form="trd_trucks"]');
          if (trkTab) { trkTab.click(); await sleep(140); scanAllIds('trd-trucks-tab'); }
        }
      });
      await test('insurance-new-entry-chrono-controls', INS, 'ins_policies', newEntryBtn, ['indDomainEntryModal', 'ideRateSourceHint'], {
        wait: 220,
        afterClick: async () => {
          const agrTab = document.querySelector('#indDomainEntryModal [data-ide-switch-form]') &&
            Array.from(document.querySelectorAll('#indDomainEntryModal [data-ide-switch-form]')).find(b => /agr|carrier|schedule|rate/i.test(b.getAttribute('data-ide-switch-form') || '') || /Agreement|Schedule/i.test(b.textContent || ''));
          if (agrTab) { agrTab.click(); await sleep(140); scanAllIds('ins-agr-tab'); }
        }
      });

      // 31-32: 360 Inspectors (Manufacturing + Sibling Domain)
      await test('mfg-360-inspector', M, 'customers', () => Array.from(document.querySelectorAll('#workspace .rel-link')).find(vis), ['recordInspector', 'inspExplainBriefBtn', 'inspListenReviewBtn', 'inspAiDraftBtn'], {
        wait: 260,
        afterClick: async () => {
          const expBtn = $('inspExplainBriefBtn');
          if (expBtn && vis(expBtn)) {
            expBtn.click();
            await sleep(220);
            scanAllIds('mfg-360-brief');
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
            await sleep(80);
          }
          const modBtn = $('inspModifyRecordBtn');
          if (modBtn && vis(modBtn)) {
            modBtn.click();
            await sleep(160);
            scanAllIds('mfg-360-modify-drawer');
          }
        }
      });
      await test('domain-360-inspector', INS, 'ins_policies', () => Array.from(document.querySelectorAll('#workspace table tbody tr')).find(vis), ['recordInspector', 'indInspExplainBriefBtn', 'indInspListenReviewBtn', 'indInspAiDraftBtn', 'indInspAttachmentsBox', 'indInspSaveChangesBtn', 'indInspVoidRowBtn']);

      // 33: Users & Security Seat Permissions Matrix (#openSeatInspectorBtn -> #checkRolePermsBtn)
      await test('users-seat-permissions-matrix', M, 'users', 'openSeatInspectorBtn', ['rolePermissionsMatrixPanel', 'permSecHubsPages'], {
        wait: 260,
        afterClick: async () => {
          const custBtn = $('checkRolePermsBtn');
          if (custBtn && vis(custBtn)) {
            custBtn.click();
            await sleep(220);
          }
          scanAllIds('users-permissions');
        }
      });

      // 34: Kiosks Tablet Station Keys Window (v19.6.245 — when Owner/Admin button is rendered)
      await go(M, 'kiosks');
      const tkBtn = $('kioskStationKeysOpenBtn');
      if (tkBtn && vis(tkBtn)) {
        await test('kiosks-tablet-station-keys', M, 'kiosks', 'kioskStationKeysOpenBtn', ['tabletKeysModal', 'tabletKeysBody']);
      }

      return out;
    })()`, 180000);

    report.launchers = clickSuite;
    const failedLaunchers = clickSuite.filter(r => r.error || (r.missing && r.missing.length > 0) || r.mojibake);
    if (failedLaunchers.length === 0) {
      pass('phaseD-interactive-launchers', `${clickSuite.length}/${clickSuite.length} studios, modals, forms & inspectors opened cleanly`);
    } else {
      for (const fl of failedLaunchers) {
        fail(`phaseD-${fl.label}`, `at=${fl.at} err=${fl.error || 'none'} missing=[${(fl.missing || []).join(', ')}] mojibake=${fl.mojibake}`);
      }
    }

    // =========================================================================
    // PHASE E: Release-Log `#id` Code & Reachability Gate + --sync-release-log
    // =========================================================================
    if (parsedLog.exists && liveVer) {
      const reachState = await evaluate(`(() => {
        const W = window.__PARITY_WALK || { walked: [], seenVisible: {}, seenDom: {} };
        const viewKeys = Array.from(new Set(W.walked.map(w => w.split('/')[1]).filter(Boolean)));
        return {
          viewKeys,
          seenDomIds: Object.keys(W.seenDom),
          seenVisIds: Object.keys(W.seenVisible)
        };
      })()`, 15000);

      const walkedViewsSet = new Set(reachState.viewKeys);
      const seenDomSet = new Set(reachState.seenDomIds);
      const seenVisSet = new Set(reachState.seenVisIds);

      const liveCodeMissingByVer = new Map();
      const allLiveCodeMissing = [];
      const unreachableLiveIds = [];

      for (const entry of parsedLog.entries) {
        const missInCode = [];
        for (const id of entry.ids) {
          if (NON_DOM_PROSE_TOKENS.has(id)) continue;
          if (!servedCodeTokens.has(id) && !seenDomSet.has(id)) {
            missInCode.push(id);
          }
        }
        liveCodeMissingByVer.set(entry.ver, missInCode);

        if (cmpVer(entry.ver, liveVer) <= 0) {
          for (const mId of missInCode) {
            allLiveCodeMissing.push(`${entry.ver}:#${mId}`);
          }
          for (const id of entry.ids) {
            if (NON_DOM_PROSE_TOKENS.has(id)) continue;
            if (walkedViewsSet.has(id)) continue;
            if (seenVisSet.has(id)) continue;
            if (NON_VISUAL_DOM_IDS.has(id) && seenDomSet.has(id)) continue;
            if (CONDITIONAL_ROUTE_OR_STATE_IDS.has(id)) continue;
            if (KIOSK_OR_AUTH_OVERLAY_PREFIX_RE.test(id)) continue;
            unreachableLiveIds.push(`${entry.ver}:#${id}`);
          }
        }
      }

      report.releaseAnchorAudit = {
        checkedReleases: parsedLog.entries.filter(e => cmpVer(e.ver, liveVer) <= 0).length,
        missingInLiveCode: allLiveCodeMissing,
        unreachableLiveIds
      };

      if (allLiveCodeMissing.length === 0) {
        pass('phaseE-release-log-code-anchors', `0 missing #id anchors in served bundle across all releases <= ${liveVer}`);
      } else {
        fail('phaseE-release-log-code-anchors', `Missing in live code: ${allLiveCodeMissing.join(', ')}`);
      }

      if (unreachableLiveIds.length === 0) {
        pass('phaseE-release-log-dom-reachability', '100% of expected desktop release #id anchors visibly reached in walk/click suite');
      } else {
        fail('phaseE-release-log-dom-reachability', `Unreached #id anchors: ${unreachableLiveIds.join(', ')}`);
      }

      if (OPTS.syncReleaseLog) {
        const syncRes = syncReleaseLogStatusLines(OPTS.releaseLogPath, liveVer, liveCodeMissingByVer);
        info('phaseE-sync-release-log', `Updated ${syncRes.updated} status line(s) in ${OPTS.releaseLogPath}`);
      }
    }

    // Runtime exception check
    report.runtimeExceptions = runtimeExceptions;
    if (runtimeExceptions.length === 0) {
      pass('phaseC-zero-runtime-exceptions', '0 uncaught JS runtime exceptions across entire walk & click suite');
    } else {
      fail('phaseC-zero-runtime-exceptions', `${runtimeExceptions.length} exception(s): ${runtimeExceptions[0]}`);
    }
  } catch (err) {
    fail('phaseC-browser-harness', err && err.message ? err.message : String(err));
  } finally {
    try { if (ws) ws.close(); } catch (_) {}
    if (process.platform === 'win32' && browser && browser.pid) {
      try {
        execFileSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      } catch (_) {}
    } else {
      try { browser.kill('SIGKILL'); } catch (_) {}
    }
    await sleep(250);
    try { fs.rmSync(udd, { recursive: true, force: true }); } catch (_) {}
  }

  if (OPTS.jsonOut) {
    report.passed = checks.filter(c => c.ok).length;
    report.failed = checks.filter(c => !c.ok).length;
    fs.mkdirSync(path.dirname(path.resolve(OPTS.jsonOut)), { recursive: true });
    fs.writeFileSync(path.resolve(OPTS.jsonOut), JSON.stringify(report, null, 2), 'utf8');
  }

  const passCount = checks.filter(c => c.ok).length;
  const failCount = checks.filter(c => !c.ok).length;
  console.log(`\nLive Parity Summary: ${passCount}/${checks.length} passed (${failCount} failed)`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL verify_live_parity error:', err && err.stack ? err.stack : err);
  process.exit(1);
});
