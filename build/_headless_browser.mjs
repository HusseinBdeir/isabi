/**
 * build/_headless_browser.mjs
 *
 * Cross-platform headless Chromium/Edge launcher and CDP target resolver for ISABI
 * CI and local verification gates. Handles Linux Ubuntu 24.04 AppArmor/D-Bus stalls,
 * direct-binary selection (avoiding wrapper `cat` orphans), dynamic free port
 * allocation, DevToolsActivePort/stderr fallback, and multi-binary fallback.
 */

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Resolves candidate Chromium/Edge executable paths in priority order.
 * If BROWSER_BIN is explicitly set, fails closed (returns [] when missing) instead
 * of silently falling back to another browser.
 */
export function findBrowserBinaries({ env = process.env, platform = process.platform, existsSync = fs.existsSync } = {}) {
  const explicit = String((env && env.BROWSER_BIN) || '').trim();
  if (explicit) {
    return existsSync(explicit) ? [explicit] : [];
  }

  const ordered = [];
  for (const hintKey of ['CHROME_BIN', 'CHROME_PATH']) {
    const hint = String((env && env[hintKey]) || '').trim();
    if (hint) ordered.push(hint);
  }

  if (platform === 'win32') {
    ordered.push(
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    );
  } else {
    ordered.push(
      // Direct ELF binaries first so wrapper scripts (`exec > >(exec cat)`) do not leave orphan processes.
      '/opt/google/chrome/chrome',
      '/opt/microsoft/msedge/msedge',
      '/usr/lib/chromium/chromium',
      '/usr/lib/chromium-browser/chromium-browser',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/microsoft-edge-stable',
      '/usr/bin/microsoft-edge',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    );
  }

  const seen = new Set();
  const found = [];
  for (const candidate of ordered) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    if (existsSync(candidate)) found.push(candidate);
  }
  return found;
}

/**
 * Claims an ephemeral free TCP port on 127.0.0.1 from the OS.
 */
export function allocateFreeLocalPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = addr && typeof addr === 'object' ? addr.port : 0;
      srv.close(err => {
        if (err) reject(err);
        else if (!port) reject(new Error('Could not allocate free local port'));
        else resolve(port);
      });
    });
  });
}

/**
 * Builds Chrome/Edge CLI flags tuned per platform (avoiding `--no-zygote` which
 * causes Chrome 130+ crashes when combined with `--headless=new`).
 */
export function buildBrowserArgs({ dbgPort, userDataDir, width = 1440, height = 900, platform = process.platform }) {
  const args = [
    '--headless=new',
    '--enable-automation',
    '--disable-ipc-flooding-protection',
    `--remote-debugging-port=${dbgPort}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    `--window-size=${width},${height}`
  ];
  if (platform !== 'win32') {
    args.push(
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--password-store=basic',
      '--use-mock-keychain',
      '--disable-crash-reporter',
      '--disable-breakpad',
      '--disable-background-networking',
      '--disable-extensions',
      '--disable-sync',
      '--disable-software-rasterizer'
    );
  }
  args.push('about:blank');
  return args;
}

/**
 * Builds child process environment; disables D-Bus session lookup on POSIX to prevent
 * 25s synchronous `org.freedesktop.secrets` startup hangs in headless Linux CI.
 */
export function buildBrowserEnv(baseEnv = process.env, platform = process.platform) {
  if (platform === 'win32') return { ...baseEnv };
  return {
    ...baseEnv,
    DBUS_SESSION_BUS_ADDRESS: '/dev/null',
    GNOME_DISABLE_CRASH_DIALOG: '1'
  };
}

/**
 * Terminates a spawned browser process tree cleanly across Windows and POSIX process groups.
 */
export function killBrowserProcess(child, platform = process.platform) {
  if (!child || !child.pid) return;
  if (platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true
      });
    } catch (_) {}
    return;
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch (_) {
    try { child.kill('SIGKILL'); } catch (__) {}
  }
}

export function getJsonHttp(urlStr, timeoutMs = 1500, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(urlStr, { method, timeout: timeoutMs }, res => {
      const chunks = [];
      res.on('data', c => { chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} on ${method} ${urlStr}`));
          return;
        }
        try {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error(`HTTP timeout after ${timeoutMs}ms on ${method} ${urlStr}`));
    });
    req.on('error', reject);
    req.end();
  });
}

function resolvePortFromDiagnostics(stderrBuf, userDataDir, fallbackPort) {
  const m = String(stderrBuf || '').match(/DevTools listening on ws:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):(\d+)\//i);
  if (m) {
    const p = Number(m[1]);
    if (p > 0) return p;
  }
  try {
    const dtap = path.join(userDataDir, 'DevToolsActivePort');
    if (fs.existsSync(dtap)) {
      const firstLine = fs.readFileSync(dtap, 'utf8').split(/\r?\n/)[0].trim();
      if (/^\d+$/.test(firstLine)) {
        const p = Number(firstLine);
        if (p > 0) return p;
      }
    }
  } catch (_) {}
  return fallbackPort;
}

/**
 * Launches a headless Chromium/Edge browser, trying each candidate until CDP responds.
 * Returns { browser, browserBin, dbgPort, pageTarget, udd, close }.
 */
export async function launchHeadlessBrowser({
  width = 1440,
  height = 900,
  waitMs = 25000,
  candidates,
  env = process.env,
  platform = process.platform,
  onCandidateFailed,
  spawnFn = spawn
} = {}) {
  const bins = Array.isArray(candidates) ? candidates : findBrowserBinaries({ env, platform });
  if (bins.length === 0) {
    const err = new Error('No headless Edge/Chrome binary found');
    err.code = 'NO_BROWSER_BINARY';
    throw err;
  }

  const attempts = [];
  for (const bin of bins) {
    const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'isabi-live-parity-'));
    let activePort = 0;
    let stderrBuf = '';
    let exitInfo = null;
    let child = null;
    let versionReady = false;
    let pageTarget = null;
    let failureMsg = '';

    try {
      const requestedPort = await allocateFreeLocalPort();
      activePort = requestedPort;
      const args = buildBrowserArgs({ dbgPort: requestedPort, userDataDir: udd, width, height, platform });
      const childEnv = buildBrowserEnv(env, platform);
      child = spawnFn(bin, args, {
        stdio: ['ignore', 'ignore', 'pipe'],
        detached: platform !== 'win32',
        windowsHide: true,
        env: childEnv
      });

      if (child && child.stderr) {
        if (typeof child.stderr.setEncoding === 'function') child.stderr.setEncoding('utf8');
        child.stderr.on('data', chunk => {
          stderrBuf = (stderrBuf + String(chunk)).slice(-4096);
        });
      }
      if (child && typeof child.on === 'function') {
        child.on('exit', (code, signal) => {
          if (!exitInfo) exitInfo = { code, signal };
        });
        child.on('error', err => {
          if (!exitInfo) exitInfo = { code: null, signal: null, error: err && err.message ? err.message : String(err) };
        });
      }

      const deadline = Date.now() + waitMs;
      while (Date.now() < deadline) {
        activePort = resolvePortFromDiagnostics(stderrBuf, udd, activePort);
        try {
          const verInfo = await getJsonHttp(`http://127.0.0.1:${activePort}/json/version`, 1500);
          if (verInfo && typeof verInfo === 'object') {
            versionReady = true;
            break;
          }
        } catch (_) {}
        if (exitInfo) {
          await sleep(100);
          activePort = resolvePortFromDiagnostics(stderrBuf, udd, activePort);
          try {
            const verInfo = await getJsonHttp(`http://127.0.0.1:${activePort}/json/version`, 1500);
            if (verInfo && typeof verInfo === 'object') {
              versionReady = true;
              break;
            }
          } catch (_) {}
          break;
        }
        await sleep(200);
      }

      if (versionReady) {
        const targetDeadline = Date.now() + 4000;
        let createdTarget = false;
        while (Date.now() < targetDeadline) {
          try {
            const targets = await getJsonHttp(`http://127.0.0.1:${activePort}/json`, 1500);
            if (Array.isArray(targets)) {
              const found = targets.find(t => t && t.type === 'page' && t.webSocketDebuggerUrl);
              if (found) {
                pageTarget = found;
                break;
              }
            }
          } catch (_) {}
          if (!createdTarget && Date.now() > targetDeadline - 2500) {
            createdTarget = true;
            try {
              const created = await getJsonHttp(`http://127.0.0.1:${activePort}/json/new?about:blank`, 1500, 'PUT');
              if (created && created.webSocketDebuggerUrl) {
                pageTarget = created;
                break;
              }
            } catch (_) {
              try {
                const createdGet = await getJsonHttp(`http://127.0.0.1:${activePort}/json/new?about:blank`, 1500, 'GET');
                if (createdGet && createdGet.webSocketDebuggerUrl) {
                  pageTarget = createdGet;
                  break;
                }
              } catch (__) {}
            }
          }
          await sleep(150);
        }
        if (!pageTarget) {
          failureMsg = 'No page target found in headless browser';
        }
      }
    } catch (err) {
      failureMsg = err && err.message ? err.message : String(err);
    }

    if (versionReady && pageTarget) {
      let closed = false;
      const close = async () => {
        if (closed) return;
        closed = true;
        killBrowserProcess(child, platform);
        await sleep(200);
        try { fs.rmSync(udd, { recursive: true, force: true }); } catch (_) {}
      };
      return {
        browser: child,
        browserBin: bin,
        dbgPort: activePort,
        pageTarget,
        udd,
        close
      };
    }

    killBrowserProcess(child, platform);
    await sleep(100);
    try { fs.rmSync(udd, { recursive: true, force: true }); } catch (_) {}
    const attempt = {
      bin,
      exitInfo,
      failureMsg,
      stderr: stderrBuf.trim().replace(/\s+/g, ' ').slice(-400)
    };
    attempts.push(attempt);
    if (typeof onCandidateFailed === 'function') {
      try { onCandidateFailed(attempt); } catch (_) {}
    }
  }

  const summary = attempts.map(a => {
    const exitLabel = a.exitInfo
      ? (a.exitInfo.code !== null && a.exitInfo.code !== undefined
        ? a.exitInfo.code
        : (a.exitInfo.signal || a.exitInfo.error || 'err'))
      : 'timeout';
    const detail = [a.failureMsg, a.stderr].filter(Boolean).join(' | ');
    return `${a.bin} [exit=${exitLabel}${detail ? ': ' + detail : ''}]`;
  }).join(' ; ');
  throw new Error(`Browser DevTools port did not come up: ${summary}`);
}
