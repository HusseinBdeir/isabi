/**
 * build/_release_log.mjs
 *
 * Release-log reader and status-line sync for the live parity gate (verify_live_parity.mjs).
 * The log is the hand-curated THEO memory file ISABICommandReleasesReference.md, so the sync
 * must never damage hand-written text. Tested by build/verify_release_log_sync.mjs.
 *
 * Entry lines:   - **vX.Y.Z Title (...):** ... `#panelId` ... `#modalId:conditional` ...
 * Status lines:  an indented `*Status YYYY-MM-DD: ...*` line directly under an entry.
 */

import fs from 'node:fs';

export function parseVerTuple(v) {
  const m = String(v || '').match(/v?(\d+)\.(\d+)\.(\d+)/);
  if (!m) return [0, 0, 0];
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function cmpVer(a, b) {
  const ta = parseVerTuple(a);
  const tb = parseVerTuple(b);
  for (let i = 0; i < 3; i++) {
    if (ta[i] !== tb[i]) return ta[i] - tb[i];
  }
  return 0;
}

const STATUS_RE = /^\s+(?:-\s+)?\*Status\b/;
// The only status lines the sync may rewrite: the text after the colon STARTS with one of these
// phrases. A line that says the release is live and merely mentions "pending sync" later is kept.
export const REWRITABLE_STATUS_RE = /^\s+(?:-\s+)?\*Status[^:]*:\s*(pending sync|not yet synced|partial on)\b/i;
const ENTRY_RE = /^- \*\*(v19\.\d+\.\d+)([^*]+)\*\*/;
const SYNC_ENTRY_RE = /^- \*\*(v19\.\d+\.\d+)\b/;
// `#id` = must be in the served code AND seen on screen in the demo walk.
// `#id:conditional` = must be in the served code only: the element appears inside a modal or form,
// for a signed-in seat or role, or only when data is in a given state, which the demo walk cannot reach.
const ID_RE = /`#([A-Za-z][A-Za-z0-9_-]{2,})(:conditional)?`/g;

/** Splits text into lines and keeps each line's own ending ('\n', '\r\n' or '' for the last). */
function splitKeepEol(raw) {
  const parts = raw.split(/(\r?\n)/);
  const lines = [];
  const eols = [];
  for (let i = 0; i < parts.length; i += 2) {
    lines.push(parts[i]);
    eols.push(i + 1 < parts.length ? parts[i + 1] : '');
  }
  return { lines, eols };
}

export function parseReleaseLogText(raw) {
  const { lines } = splitKeepEol(raw);
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const m = ln.match(ENTRY_RE);
    if (!m) continue;
    const ids = [];
    const conditional = new Set();
    let im;
    ID_RE.lastIndex = 0;
    while ((im = ID_RE.exec(ln)) !== null) {
      if (!ids.includes(im[1])) ids.push(im[1]);
      if (im[2]) conditional.add(im[1]);
    }
    let statusLineIdx = -1;
    let statusText = '';
    if (i + 1 < lines.length && STATUS_RE.test(lines[i + 1])) {
      statusLineIdx = i + 1;
      statusText = lines[i + 1].trim();
    }
    // headerLine (the entry line itself) is the key for per-entry results: several entries can
    // share a version number, so the version alone would mix their anchors up.
    entries.push({ ver: m[1], title: (m[1] + m[2]).trim(), ids, conditional, headerLine: ln, lineIdx: i, statusLineIdx, statusText });
  }
  return { exists: true, entries, lines };
}

export function parseReleaseLog(logPath) {
  if (!logPath || !fs.existsSync(logPath)) return { exists: false, entries: [], lines: [] };
  return parseReleaseLogText(fs.readFileSync(logPath, 'utf8'));
}

function withoutDate(statusLine) {
  return statusLine.replace(/\*Status \d{4}-\d{2}-\d{2}:/, '*Status:');
}

/**
 * Writes or refreshes status lines under release entries.
 * - A status line is rewritten only while it starts with "pending sync", "not yet synced" or "partial on".
 *   Any other status line (hand-written provenance, or a live line this gate wrote) is kept as it is.
 * - A clean live release with no status line gets none.
 * - A live release with anchors missing from the served code gets a "partial on" line; a release newer
 *   than the live shell gets a "pending sync" line (entries from v19.6.240, or with a status line).
 * - A rewrite that would change only the date is skipped, so the first-seen date survives.
 * - Every line keeps its own line ending; nothing is written when nothing changed.
 * @param {Map<string,string[]>} missingByHeader entry line text -> anchor ids missing from the served code
 */
export function syncReleaseLogStatusLines(logPath, liveVer, missingByHeader, today = new Date().toLocaleDateString('en-CA')) {
  if (!logPath || !fs.existsSync(logPath)) return { updated: 0 };
  const { lines, eols } = splitKeepEol(fs.readFileSync(logPath, 'utf8'));
  const out = [];
  let updated = 0;

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    out.push([ln, eols[i]]);
    const m = ln.match(SYNC_ENTRY_RE);
    if (!m) continue;
    const ver = m[1];
    const hasExistingStatus = i + 1 < lines.length && STATUS_RE.test(lines[i + 1]);
    const existing = hasExistingStatus ? lines[i + 1] : '';
    if (!(cmpVer(ver, 'v19.6.240') >= 0 || cmpVer(ver, liveVer) > 0 || hasExistingStatus)) continue;
    // Kept status lines are copied by the next loop pass like any other line.
    if (hasExistingStatus && !REWRITABLE_STATUS_RE.test(existing)) continue;

    const miss = (missingByHeader && missingByHeader.get(ln)) || [];
    const isLive = cmpVer(ver, liveVer) <= 0;
    let desired = '';
    if (isLive && miss.length === 0) {
      if (hasExistingStatus) desired = `  *Status ${today}: live on isabisystems.com/app (shell ${liveVer}; parity gate verified).*`;
    } else if (isLive) {
      desired = `  *Status ${today}: partial on isabisystems.com/app (shell ${liveVer}; missing anchors: ${miss.slice(0, 6).join(', ')}).*`;
    } else {
      desired = `  *Status ${today}: pending sync (live shell is ${liveVer}).*`;
    }
    if (!desired) continue;
    if (Buffer.byteLength(desired, 'utf8') > 2400) desired = desired.slice(0, 2380) + '...*';

    if (hasExistingStatus) {
      if (withoutDate(existing) === withoutDate(desired)) continue;
      out.push([desired, eols[i + 1]]);
      i++; // the old status line is replaced
    } else {
      const hdrEol = eols[i];
      out[out.length - 1][1] = hdrEol || '\n';
      out.push([desired, hdrEol]);
    }
    updated++;
  }

  if (updated > 0) fs.writeFileSync(logPath, out.map(([t, e]) => t + e).join(''), 'utf8');
  return { updated };
}
