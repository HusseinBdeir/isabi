#!/usr/bin/env node
/**
 * build/verify_parity_browser.mjs
 *
 * Offline unit gate for build/_headless_browser.mjs, verify_live_parity.mjs --smoke-browser,
 * and deploy.yml CI browser wiring. Spawns zero real browsers and finishes in < 2 s.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  allocateFreeLocalPort,
  buildBrowserArgs,
  buildBrowserEnv,
  findBrowserBinaries,
  launchHeadlessBrowser
} from './_headless_browser.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ISABI_ROOT = path.resolve(HERE, '..');

let passed = 0;
let failed = 0;
function check(label, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.error(`  FAIL ${label}${detail ? ' — ' + detail : ''}`);
  }
}

// 1. findBrowserBinaries: Linux direct-ELF priority, hints, and fail-closed BROWSER_BIN
{
  const linuxFs = new Set([
    '/usr/bin/google-chrome',
    '/opt/google/chrome/chrome',
    '/opt/microsoft/msedge/msedge',
    '/usr/bin/chromium'
  ]);
  const bins = findBrowserBinaries({
    platform: 'linux',
    env: {},
    existsSync: p => linuxFs.has(p)
  });
  check(
    'linux prefers direct ELF binaries (/opt/google/chrome/chrome, /opt/microsoft/msedge/msedge) before /usr/bin wrapper',
    bins[0] === '/opt/google/chrome/chrome' && bins[1] === '/opt/microsoft/msedge/msedge' && bins[2] === '/usr/bin/google-chrome',
    JSON.stringify(bins)
  );

  const hinted = findBrowserBinaries({
    platform: 'linux',
    env: { CHROME_BIN: '/custom/chrome' },
    existsSync: p => linuxFs.has(p) || p === '/custom/chrome'
  });
  check('CHROME_BIN env hint takes priority when present', hinted[0] === '/custom/chrome' && hinted.includes('/opt/google/chrome/chrome'), JSON.stringify(hinted));

  const explicitMissing = findBrowserBinaries({
    platform: 'linux',
    env: { BROWSER_BIN: '/does/not/exist' },
    existsSync: p => linuxFs.has(p)
  });
  check('explicit BROWSER_BIN fails closed when missing', explicitMissing.length === 0, JSON.stringify(explicitMissing));

  const explicitFound = findBrowserBinaries({
    platform: 'linux',
    env: { BROWSER_BIN: '/usr/bin/chromium' },
    existsSync: p => linuxFs.has(p)
  });
  check('explicit BROWSER_BIN returns only that binary when present', explicitFound.length === 1 && explicitFound[0] === '/usr/bin/chromium', JSON.stringify(explicitFound));
}

// 2. findBrowserBinaries: Windows order
{
  const winFs = new Set([
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  ]);
  const bins = findBrowserBinaries({
    platform: 'win32',
    env: {},
    existsSync: p => winFs.has(p)
  });
  check(
    'win32 returns Edge before Chrome',
    bins[0] === 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe' && bins[1] === 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    JSON.stringify(bins)
  );
}

// 3. buildBrowserArgs & buildBrowserEnv: Linux CI flags and D-Bus isolation
{
  const args = buildBrowserArgs({ dbgPort: 12345, userDataDir: '/tmp/udd', width: 1440, height: 900, platform: 'linux' });
  const requiredLinuxFlags = [
    '--headless=new',
    '--remote-debugging-port=12345',
    '--remote-debugging-address=127.0.0.1',
    '--user-data-dir=/tmp/udd',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--password-store=basic',
    '--use-mock-keychain',
    '--disable-crash-reporter'
  ];
  check(
    'linux browser args include AppArmor/D-Bus/shm CI flags and exclude --no-zygote',
    requiredLinuxFlags.every(f => args.includes(f)) && !args.includes('--no-zygote') && args[args.length - 1] === 'about:blank',
    JSON.stringify(args)
  );

  const winArgs = buildBrowserArgs({ dbgPort: 12345, userDataDir: 'C:\\tmp\\udd', width: 1440, height: 900, platform: 'win32' });
  check(
    'win32 browser args omit Linux-only sandbox/shm/keyring flags and keep --remote-debugging-address=127.0.0.1',
    winArgs.includes('--headless=new')
      && winArgs.includes('--remote-debugging-address=127.0.0.1')
      && !winArgs.includes('--no-sandbox')
      && !winArgs.includes('--disable-setuid-sandbox')
      && !winArgs.includes('--disable-dev-shm-usage')
      && !winArgs.includes('--no-zygote'),
    JSON.stringify(winArgs)
  );

  const lEnv = buildBrowserEnv({ PATH: '/usr/bin' }, 'linux');
  check('linux env sets DBUS_SESSION_BUS_ADDRESS=/dev/null and GNOME_DISABLE_CRASH_DIALOG=1', lEnv.DBUS_SESSION_BUS_ADDRESS === '/dev/null' && lEnv.GNOME_DISABLE_CRASH_DIALOG === '1', JSON.stringify(lEnv));

  const wEnv = buildBrowserEnv({ PATH: 'C:\\Windows' }, 'win32');
  check('win32 env does not inject DBUS_SESSION_BUS_ADDRESS', !('DBUS_SESSION_BUS_ADDRESS' in wEnv), JSON.stringify(wEnv));
}

// 4. allocateFreeLocalPort returns usable port
{
  const p = await allocateFreeLocalPort();
  check('allocateFreeLocalPort allocates valid ephemeral port', Number.isInteger(p) && p > 1024 && p <= 65535, String(p));
}

// 5. launchHeadlessBrowser: empty candidates -> NO_BROWSER_BINARY
{
  let errCode = '';
  try {
    await launchHeadlessBrowser({ candidates: [] });
  } catch (e) {
    errCode = e && e.code ? e.code : '';
  }
  check('empty candidates fails with NO_BROWSER_BINARY', errCode === 'NO_BROWSER_BINARY', errCode);
}

// 6. launchHeadlessBrowser: multi-candidate fallback, stderr diagnostics, and udd cleanup
const tmpHelperDir = fs.mkdtempSync(path.join(os.tmpdir(), 'isabi-parity-mock-'));
try {
  const badScript = path.join(tmpHelperDir, 'mock-bad.mjs');
  const goodScript = path.join(tmpHelperDir, 'mock-good.mjs');

  fs.writeFileSync(badScript, [
    "process.stderr.write('mock dbus fatal: org.freedesktop.secrets unavailable\\n');",
    'process.exit(1);'
  ].join('\n'), 'utf8');

  fs.writeFileSync(goodScript, [
    "import http from 'node:http';",
    'const srv = http.createServer((req, res) => {',
    "  res.setHeader('Content-Type', 'application/json');",
    "  if (req.url === '/json/version') { res.end(JSON.stringify({ Browser: 'MockChrome/1.0' })); return; }",
    "  if (req.url === '/json') { const port = srv.address().port; res.end(JSON.stringify([{ type: 'page', webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/1` }])); return; }",
    '  res.statusCode = 404; res.end(\'{}\');',
    '});',
    "srv.listen(0, '127.0.0.1', () => {",
    '  const port = srv.address().port;',
    '  process.stderr.write(`DevTools listening on ws://127.0.0.1:${port}/devtools/browser/mock\\n`);',
    '});',
    'setInterval(() => {}, 1000);'
  ].join('\n'), 'utf8');

  const seenUdds = [];
  const failedAttempts = [];
  const mockSpawn = (bin, args, opts) => {
    const uddArg = args.find(a => a.startsWith('--user-data-dir='));
    if (uddArg) seenUdds.push(uddArg.slice('--user-data-dir='.length));
    const script = bin.includes('bad') ? badScript : goodScript;
    return spawn(process.execPath, [script, ...args], {
      stdio: opts.stdio,
      windowsHide: true,
      env: opts.env
    });
  };

  const session = await launchHeadlessBrowser({
    candidates: ['/mock/bad-chrome', '/mock/good-chrome'],
    waitMs: 5000,
    platform: process.platform,
    spawnFn: mockSpawn,
    onCandidateFailed: a => failedAttempts.push(a)
  });

  check(
    'fallback skips exited candidate #1 and connects to candidate #2 via stderr DevTools port',
    failedAttempts.length === 1
      && failedAttempts[0].bin === '/mock/bad-chrome'
      && failedAttempts[0].exitInfo && failedAttempts[0].exitInfo.code === 1
      && failedAttempts[0].stderr.includes('mock dbus fatal')
      && session.browserBin === '/mock/good-chrome'
      && String(session.pageTarget.webSocketDebuggerUrl || '').includes(`127.0.0.1:${session.dbgPort}/devtools/page/1`),
    JSON.stringify({ failedAttempts, bin: session.browserBin, ws: session.pageTarget && session.pageTarget.webSocketDebuggerUrl })
  );

  const firstUddCleaned = seenUdds[0] && !fs.existsSync(seenUdds[0]);
  await session.close();
  const secondUddCleaned = seenUdds[1] && !fs.existsSync(seenUdds[1]);
  check('failed attempt udd and closed session udd are both removed', Boolean(firstUddCleaned && secondUddCleaned), JSON.stringify(seenUdds));

  // All candidates fail -> combined diagnostic error, udd removed
  const failUdds = [];
  let allFailErr = '';
  try {
    await launchHeadlessBrowser({
      candidates: ['/mock/bad-1', '/mock/bad-2'],
      waitMs: 4000,
      platform: process.platform,
      spawnFn: (bin, args, opts) => {
        const u = args.find(a => a.startsWith('--user-data-dir='));
        if (u) failUdds.push(u.slice('--user-data-dir='.length));
        return spawn(process.execPath, [badScript], { stdio: opts.stdio, windowsHide: true, env: opts.env });
      }
    });
  } catch (e) {
    allFailErr = e && e.message ? e.message : String(e);
  }
  check(
    'all-failing candidates surface stderr and exit codes for every binary and clean temp dirs',
    allFailErr.includes('/mock/bad-1')
      && allFailErr.includes('/mock/bad-2')
      && allFailErr.includes('mock dbus fatal')
      && failUdds.length === 2
      && failUdds.every(d => !fs.existsSync(d)),
    allFailErr
  );

  // DevToolsActivePort file fallback + PUT /json/new?about:blank when /json returns [] + sync spawn throw cleanup
  const dtapScript = path.join(tmpHelperDir, 'mock-dtap.mjs');
  fs.writeFileSync(dtapScript, [
    "import fs from 'node:fs';",
    "import http from 'node:http';",
    "import path from 'node:path';",
    "const uddArg = process.argv.find(a => a.startsWith('--user-data-dir='));",
    "const udd = uddArg ? uddArg.slice('--user-data-dir='.length) : '';",
    'const srv = http.createServer((req, res) => {',
    "  res.setHeader('Content-Type', 'application/json');",
    "  if (req.url === '/json/version') { res.end(JSON.stringify({ Browser: 'MockDtap/1.0' })); return; }",
    "  if (req.url === '/json') { res.end('[]'); return; }",
    "  if (req.method === 'PUT' && String(req.url || '').startsWith('/json/new')) {",
    '    const port = srv.address().port;',
    "    res.end(JSON.stringify({ type: 'page', webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/new1` }));",
    '    return;',
    '  }',
    "  res.statusCode = 404; res.end('{}');",
    '});',
    "srv.listen(0, '127.0.0.1', () => {",
    '  const port = srv.address().port;',
    "  if (udd) fs.writeFileSync(path.join(udd, 'DevToolsActivePort'), `${port}\\n/devtools/browser/dtap\\n`, 'utf8');",
    '});',
    'setInterval(() => {}, 1000);'
  ].join('\n'), 'utf8');

  const dtapUdds = [];
  const dtapSession = await launchHeadlessBrowser({
    candidates: ['/mock/sync-throw', '/mock/dtap-new'],
    waitMs: 5000,
    platform: process.platform,
    spawnFn: (bin, args, opts) => {
      const u = args.find(a => a.startsWith('--user-data-dir='));
      if (u) dtapUdds.push(u.slice('--user-data-dir='.length));
      if (bin.includes('sync-throw')) throw new Error('EACCES mock spawn failure');
      return spawn(process.execPath, [dtapScript, ...args], { stdio: opts.stdio, windowsHide: true, env: opts.env });
    }
  });
  check(
    'sync spawn throw cleans udd and DevToolsActivePort fallback + PUT /json/new?about:blank resolves target',
    dtapUdds.length === 2
      && !fs.existsSync(dtapUdds[0])
      && dtapSession.browserBin === '/mock/dtap-new'
      && String(dtapSession.pageTarget.webSocketDebuggerUrl || '').includes('/devtools/page/new1'),
    JSON.stringify({ dtapUdds, ws: dtapSession.pageTarget && dtapSession.pageTarget.webSocketDebuggerUrl })
  );
  await dtapSession.close();
  check('DevToolsActivePort mock udd removed on close', !fs.existsSync(dtapUdds[1]), dtapUdds[1]);
} finally {
  fs.rmSync(tmpHelperDir, { recursive: true, force: true });
}

// 7. CI workflow, sync_app.py and verify_live_parity.mjs wiring
{
  const wf = fs.readFileSync(path.join(ISABI_ROOT, '.github', 'workflows', 'deploy.yml'), 'utf8');
  const syncPy = fs.readFileSync(path.join(ISABI_ROOT, 'build', 'sync_app.py'), 'utf8');
  const parityJs = fs.readFileSync(path.join(ISABI_ROOT, 'build', 'verify_live_parity.mjs'), 'utf8');

  check('deploy.yml runs verify_parity_browser.mjs and verify_live_parity.mjs --smoke-browser in Offline checks',
    wf.includes('build/verify_parity_browser.mjs') && wf.includes('build/verify_live_parity.mjs --smoke-browser'));
  check('sync_app.py RELEASE_GATES includes verify_parity_browser.mjs',
    syncPy.includes('build/verify_parity_browser.mjs'));
  check('verify_live_parity.mjs uses _headless_browser.mjs and supports --smoke-browser',
    parityJs.includes('./_headless_browser.mjs') && parityJs.includes('--smoke-browser'));
}

console.log(`verify_parity_browser: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
