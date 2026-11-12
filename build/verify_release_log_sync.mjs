#!/usr/bin/env node
/**
 * build/verify_release_log_sync.mjs
 *
 * Offline regression test for build/_release_log.mjs (the release-log reader and the status-line
 * sync the live parity gate runs with --sync-release-log against the hand-curated THEO memory file).
 * Works on temporary fixture files only; never touches the real log. Release gate (sync_app.py) + CI.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseReleaseLogText, syncReleaseLogStatusLines, REWRITABLE_STATUS_RE } from './_release_log.mjs';

// What a sync at the newest version must leave alone in ANY log: every line that is not a rewritable
// (pending / partial) status line stays byte-identical, and at most one change per rewritable line.
// A pending or partial line in the log is legitimate (a slow CDN at deploy, a regressed anchor), so it
// must not fail this check.
function checkSyncKeepsCuratedText(text, liveVer) {
  const p = fixture(`keep-${Math.random().toString(36).slice(2)}.md`, text);
  const r = syncReleaseLogStatusLines(p, liveVer, new Map(), TODAY);
  // Lines this sync wrote carry TODAY (a date no real log holds); they replace rewritable lines only.
  const strip = t => t.split(/(?<=\n)/).filter(l => {
    const s = l.replace(/\r?\n$/, '');
    return !REWRITABLE_STATUS_RE.test(s) && !s.includes(`*Status ${TODAY}:`);
  }).join('');
  const rewritable = text.split(/\r?\n/).filter(l => REWRITABLE_STATUS_RE.test(l)).length;
  return { ok: strip(read(p)) === strip(text) && r.updated <= rewritable, updated: r.updated, rewritable };
}

const TODAY = '1999-01-01';
let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`ok   ${name}`); }
  else { failed++; console.error(`FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'isabi-rellog-'));
function fixture(name, text) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, text, 'utf8');
  return p;
}
const read = p => fs.readFileSync(p, 'utf8');
const E = (ver, rest = '') => `- **${ver} Title (\`abc1234\`, 2026-11-01):** change${rest}`;

try {
  // 1. Clean log, newest entry = live shell: nothing changes, bytes identical.
  {
    const text = ['# Log', '', E('v19.6.262', ' `#a`'), '  *Status 2026-11-10: live (shell v19.6.262), deployed from a worktree.*', E('v19.6.261', ' `#b`'), E('v19.6.230'), ''].join('\n');
    const p = fixture('clean.md', text);
    const r = syncReleaseLogStatusLines(p, 'v19.6.262', new Map(), TODAY);
    check('1 clean run: 0 updates', r.updated === 0, `updated=${r.updated}`);
    check('1 clean run: file byte-identical', read(p) === text);
  }

  // 2. Live lines are kept even when the release now has missing anchors (hand-written and gate-written).
  {
    const hand = '  *Status 2026-11-10: live on isabisystems.com/app (shell v19.6.262), R2 seed uploaded.*';
    const gate = '  *Status 2026-11-11: live on isabisystems.com/app (shell v19.6.261; parity gate verified).*';
    const h1 = E('v19.6.262', ' `#a`');
    const h2 = E('v19.6.261', ' `#b`');
    const p = fixture('keep-live.md', [h1, hand, h2, gate, ''].join('\n'));
    const r = syncReleaseLogStatusLines(p, 'v19.6.262', new Map([[h1, ['a']], [h2, ['b']]]), TODAY);
    const out = read(p);
    check('2 live lines kept despite missing anchors', r.updated === 0 && out.includes(hand) && out.includes(gate), `updated=${r.updated}`);
  }

  // 2b. A live line that merely mentions "pending sync" later is still kept.
  {
    const live = '  *Status 2026-11-14: live on isabisystems.com/app (shell v19.6.262); the kiosk half was pending sync until 2026-11-13.*';
    const p = fixture('mention.md', [E('v19.6.262'), live, ''].join('\n'));
    const r = syncReleaseLogStatusLines(p, 'v19.6.263', new Map(), TODAY);
    check('2b live line mentioning "pending sync" kept', r.updated === 0 && read(p).includes(live));
  }

  // 3. A clean live entry with no status line still has none.
  {
    const text = [E('v19.6.250', ' `#c`'), E('v19.6.249'), ''].join('\n');
    const p = fixture('no-status.md', text);
    syncReleaseLogStatusLines(p, 'v19.6.262', new Map(), TODAY);
    check('3 clean live entry gets no status line', read(p) === text);
  }

  // 4. Entry >= v19.6.240 with a missing anchor gets exactly one partial line, under the right entry
  //    even when two entries share the version number.
  {
    const h1 = E('v19.6.266', ' (Edge only)');
    const h2 = E('v19.6.266', ' `#geoDistFrom`');
    const p = fixture('partial.md', [h1, h2, E('v19.6.265'), ''].join('\n'));
    const r = syncReleaseLogStatusLines(p, 'v19.6.266', new Map([[h1, []], [h2, ['geoDistFrom']]]), TODAY);
    const lines = read(p).split('\n');
    const i2 = lines.indexOf(h2);
    check('4 one partial line added', r.updated === 1, `updated=${r.updated}`);
    check('4 partial line sits under the entry that names the anchor', /^\s+\*Status 1999-01-01: partial on .*missing anchors: geoDistFrom\)\.\*$/.test(lines[i2 + 1] || ''), lines[i2 + 1]);
    check('4 sibling entry with the same version untouched', lines[lines.indexOf(h1) + 1] === h2);
  }

  // 5. Newer than the live shell: pending line; older than v19.6.240 without status: nothing.
  {
    const p = fixture('pending.md', [E('v19.6.270'), E('v19.6.262'), E('v19.6.230', ' `#old`'), ''].join('\n'));
    const r = syncReleaseLogStatusLines(p, 'v19.6.262', new Map([[E('v19.6.230', ' `#old`'), ['old']]]), TODAY);
    const lines = read(p).split('\n');
    check('5 pending line for a release newer than live', r.updated === 1 && lines[1] === '  *Status 1999-01-01: pending sync (live shell is v19.6.262).*', lines[1]);
    check('5 entry older than v19.6.240 gets nothing', lines[lines.length - 2] === E('v19.6.230', ' `#old`'));
  }

  // 6. A pending line on a now-clean live release becomes a parity-verified line;
  //    a pending line whose text would not change except the date is left alone.
  {
    const p = fixture('promote.md', [E('v19.6.262'), '  *Status 2026-11-10: pending sync (live shell is v19.6.261).*', E('v19.6.263'), '  *Status 2026-11-10: pending sync (live shell is v19.6.262).*', ''].join('\n'));
    const r = syncReleaseLogStatusLines(p, 'v19.6.262', new Map(), TODAY);
    const lines = read(p).split('\n');
    check('6 pending line promoted to verified', lines[1] === '  *Status 1999-01-01: live on isabisystems.com/app (shell v19.6.262; parity gate verified).*', lines[1]);
    check('6 date-only change skipped (first-seen date kept)', lines[3] === '  *Status 2026-11-10: pending sync (live shell is v19.6.262).*' && r.updated === 1, `updated=${r.updated}`);
  }

  // 7. `#a:conditional` is parsed as id `a` in the conditional set; plain `#b` is not conditional.
  {
    const parsed = parseReleaseLogText(E('v19.6.262', ' `#apvLiveCard:conditional` and `#hubPanel`, prose `#x`') + '\n');
    const e = parsed.entries[0];
    check('7 conditional anchor parsed', e.ids.includes('apvLiveCard') && e.conditional.has('apvLiveCard'));
    check('7 plain anchor not conditional', e.ids.includes('hubPanel') && !e.conditional.has('hubPanel'));
  }

  // 8. CRLF and mixed endings are kept line by line; no line over 2,500 bytes.
  {
    const crlf = [E('v19.6.263'), E('v19.6.262', ' `#a`'), ''].join('\r\n');
    const p = fixture('crlf.md', crlf);
    syncReleaseLogStatusLines(p, 'v19.6.262', new Map([[E('v19.6.262', ' `#a`'), Array.from({ length: 40 }, (_, k) => 'anchor' + 'x'.repeat(200) + k)]]), TODAY);
    const out = read(p);
    check('8 CRLF file stays CRLF only', !/[^\r]\n/.test(out) && out.includes('\r\n'));
    check('8 no line over 2,500 bytes', out.split(/\r?\n/).every(l => Buffer.byteLength(l, 'utf8') <= 2500));
    const mixed = E('v19.6.263') + '\n' + E('v19.6.262') + '\r\n' + '# tail' + '\n';
    const pm = fixture('mixed.md', mixed);
    syncReleaseLogStatusLines(pm, 'v19.6.262', new Map(), TODAY);
    const outM = read(pm);
    check('8 mixed endings kept per line', outM === E('v19.6.263') + '\n  *Status 1999-01-01: pending sync (live shell is v19.6.262).*\n' + E('v19.6.262') + '\r\n# tail\n', JSON.stringify(outM.slice(-80)));
  }

  // 9. Missing file: no throw, nothing written.
  check('9 missing log is a no-op', syncReleaseLogStatusLines(path.join(dir, 'nope.md'), 'v19.6.262', new Map(), TODAY).updated === 0);

  // 10a. A log whose newest entry still carries the gate's own pending line (CDN lag at deploy) passes
  //      check 10's logic: the pending line may be promoted, nothing else may change.
  {
    const text = ['# Log', E('v19.6.274', ' `#a`'), '  *Status 2026-11-13: pending sync (live shell is v19.6.273).*',
      E('v19.6.273'), '  *Status 2026-11-12: live (shell v19.6.273), worktree pair.*', ''].join('\n');
    const r = checkSyncKeepsCuratedText(text, 'v19.6.274');
    check('10a pending line under the newest entry does not fail the real-log check', r.ok && r.updated === 1, `updated=${r.updated}`);
  }

  // 10. The real memory log, when present on this PC, is untouched by a clean sync at its newest version.
  {
    const real = process.env.THEO_RELEASE_LOG || path.join(os.homedir(), 'bhfirms', 'memory', 'ISABICommandReleasesReference.md');
    if (fs.existsSync(real)) {
      const text = read(real);
      const parsed = parseReleaseLogText(text);
      const newest = parsed.entries.map(e => e.ver).sort((a, b) => {
        const pa = a.slice(1).split('.').map(Number), pb = b.slice(1).split('.').map(Number);
        return pb[0] - pa[0] || pb[1] - pa[1] || pb[2] - pa[2];
      })[0];
      const r = checkSyncKeepsCuratedText(text, newest);
      check(`10 real log copy: curated text unchanged by a clean sync at ${newest}`, r.ok, `updated=${r.updated} rewritable=${r.rewritable}`);
    } else {
      console.log('skip 10 real memory log not on this machine (CI)');
    }
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`release-log sync: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
