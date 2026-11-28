// Offline gate for row sync (store-size plan step 2, stage A): a device fetches only the entries that changed.
//   Server half   functions/_lib/row_sync.js + handleSync in functions/_lib/d1_store.js (the real code, run here)
//   Device half   the <row-sync-client> and <row-sync-glue> blocks of isabi-app js/app.js (the real code, cut out of
//                 the file and run here in node)
// What it proves:
//   1. A device that does not ask for row sync gets the answers it got before, and nothing is indexed for it.
//   2. First read: the whole document plus an anchor; the index describes the stored document.
//   3. After another device saves, a read returns only the changed entries, and the document rebuilt from them
//      equals the whole document the cloud would have sent (add, edit, delete, kiosk punches, top-level parts).
//   4. A writer that does not know the index (the top-up's direct write) leaves the stamps apart and the next read
//      rebuilds the index: still only the changed entries, still equal.
//   5. A company-scoped seat never receives another company's entry in a partial answer, nor its id, loses an entry
//      that leaves its scope, and starts again from the whole document when its scope changes.
//   6. Bounds: wrong epoch, a revision ahead of the cloud or under the floor, too many changes, a read that fell
//      inside a save: the whole document, never a wrong partial answer.
//   7. "Someone saved before you" comes back as changed entries.
//   8. The comparison the cloud asks for: clean ones are counted, one failed comparison switches partial answers off
//      until the counter is reset; `mode` 0 does the same. Only a seat that sees the whole store is asked and believed.
//   9. Edit history: a live entry travels without it, a voided one with it; a device that never held the history
//      saves an entry and the stored history is exactly what an older device would have left (twin stores compared).
//  13. A writer that rewrites the stored text under the stamp it found (a data release) is noticed: the index is
//      anchored on the text itself, not on the stamp.
//  14. What a scoped seat is told about entries it cannot see: nothing. The rule that decides it reads only the
//      fields kept on the index line.
//  15. An attendance entry the device tells apart by its edit history keeps it whenever the device's answer would
//      change without it.
//  16. A database restore (the cloud back at an earlier state): a device holding a copy from the lost timeline fails
//      the digest check and reads the whole document.
//  17. A document a copy keyed by id cannot stand for (a repeated id) gets no partial answers; the `mode` values;
//      a page that cannot follow the cloud twice stops asking.
// Uses in-memory node:sqlite (Node 22.5+). Touches nothing live.
// Run: node build/verify_row_sync_edge.mjs

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { onRequest } from '../functions/app/api/[[route]].js';
import { signEdgeSession } from '../functions/_lib/security.js';
import {
  effectiveMinSyncShellVer, handleSync, isShiftBackfillBloatedSeedAttRow, readEdgeKvDoc, scopedSeatSeesCrRow, scopedSeatSeesKioskPunch, writeEdgeKvDoc
} from '../functions/_lib/d1_store.js';
import { DEPLOYED_SHELL_VER } from '../functions/_lib/deployed_shell.js';
import {
  ROW_SYNC_AUDIT_AFTER, ROW_SYNC_AUDIT_TARGET, ROW_SYNC_MAX_DELTA_ROWS, ROW_VIS_FIELDS, collectRowMaps, docAnchorOf, hashPair, visStubOf
} from '../functions/_lib/row_sync.js';

// ---- the device code, cut out of app.js -----------------------------------------------------------------------------
// The app source this checkout is paired with (ISABI_APP_SRC as build/sync_app.py reads it, else the checkout beside
// this one), then the synced copy under app/. The first that carries the device blocks is the one tested.
const APP_JS_CANDIDATES = [
  process.env.ISABI_APP_SRC ? join(process.env.ISABI_APP_SRC, 'js', 'app.js') : '',
  fileURLToPath(new URL('../../isabi-app/js/app.js', import.meta.url)),
  fileURLToPath(new URL('../app/js/app.js', import.meta.url))
].filter(p => p && existsSync(p));
let APP_JS = '';
let APP_SRC = '';
for (const p of APP_JS_CANDIDATES) {
  const src = readFileSync(p, 'utf8');
  if (src.includes('// <row-sync-client>') && src.includes('// <row-sync-glue>')) { APP_JS = p; APP_SRC = src; break; }
}
if (!APP_JS) {
  console.error(`No app.js with the row sync device blocks found (looked in: ${APP_JS_CANDIDATES.join(', ') || 'nowhere'}).`);
  process.exit(2);
}
function cutBlock(openTag, closeTag) {
  const a = APP_SRC.indexOf(openTag);
  const b = APP_SRC.indexOf(closeTag);
  if (a < 0 || b <= a) { console.error(`${openTag} block not found in ${APP_JS}`); process.exit(2); }
  return APP_SRC.slice(a, b);
}
const CLIENT_SRC = cutBlock('// <row-sync-client>', '// </row-sync-client>');
const GLUE_SRC = cutBlock('// <row-sync-glue>', '// </row-sync-glue>');
const RowSyncClient = new Function(`${CLIENT_SRC}\nreturn RowSyncClient;`)();
const DOC_KEY = 'mfg_web_store';
function makeGlue() {
  return new Function('RowSyncClient', 'CLOUD_DOC_KEY', `
    const ROW_SYNC_CLIENT_ON = true;
    const ROW_MIRROR_MAX_AGE_MS = 12 * 60 * 60 * 1000;
    const ROW_MIRROR_MAX_DELTAS = 400;
    const ROW_SYNC_MAX_STRIKES = 2;
    let _rowMirror = null;
    let _rowAuditReport = null;
    let _rowSyncStrikes = 0;
    let _cloudTrailsOnDemand = false;
    ${GLUE_SRC}
    return {
      attach: attachRowSyncRequest,
      settle: settleRowSyncAnswer,
      mirror: () => _rowMirror,
      report: () => _rowAuditReport,
      strikes: () => _rowSyncStrikes,
      trails: () => _cloudTrailsOnDemand
    };
  `)(RowSyncClient, DOC_KEY);
}

// ---- D1 over node:sqlite (same shim as verify_sync_delta_edge.mjs) --------------------------------------------------
class Stmt {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...p) {
    if (p.length > 100) throw new Error(`D1 allows 100 bound values per statement, got ${p.length}`);
    return new Stmt(this.db, this.sql, p);
  }
  args() {
    const used = new Set((this.sql.match(/\?\d+/g) || []));
    if (!used.size) return this.params;
    const o = {};
    for (const k of used) {
      const v = this.params[Number(k.slice(1)) - 1];
      o[k] = v === undefined ? null : (typeof v === 'boolean' ? (v ? 1 : 0) : v);
    }
    return [o];
  }
  async first() { return this.db.prepare(this.sql).get(...this.args()) || null; }
  async all() {
    if (/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)/i.test(this.sql)) {
      await this.run();
      return { results: [] };
    }
    return { results: this.db.prepare(this.sql).all(...this.args()) };
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.args());
    return { success: true, meta: { changes: r.changes } };
  }
}
class D1 {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  prepare(sql) { return new Stmt(this.db, sql); }
  // One transaction, as D1 runs a batch.
  async batch(stmts) {
    this.db.exec('BEGIN');
    try {
      const out = [];
      for (const s of stmts) out.push(await s.all());
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  exec(sql) { this.db.exec(sql); }
  one(sql, ...p) { return this.db.prepare(sql).get(...p) || null; }
  rows(sql, ...p) { return this.db.prepare(sql).all(...p); }
}

const SCHEMA_SQL = readFileSync(new URL('../migrations/0001_schema.sql', import.meta.url), 'utf8');
const SHELL = effectiveMinSyncShellVer() || DEPLOYED_SHELL_VER || '19.6.440';

let clock = Date.parse('2026-11-28T08:00:00.000Z');
const nextTs = () => { clock += 1000; return new Date(clock).toISOString(); };

async function makeWorld() {
  const d1 = new D1();
  d1.exec(SCHEMA_SQL);
  const env = { DB: d1, ISABI_JWT_SECRET: 'row-sync-edge-offline-test-secret-' + Math.random().toString(36).slice(2) };
  const seat = async (id, name, email, role, cos) => {
    d1.db.prepare('INSERT INTO users (id, full_name, email, role, companies) VALUES (?,?,?,?,?)').run(id, name, email, role, cos);
    d1.db.prepare('INSERT INTO auth_sessions (id, user_id, email, full_name, role, companies) VALUES (?,?,?,?,?,?)').run('sess-' + id, id, email, name, role, cos);
    return signEdgeSession({ sid: 'sess-' + id, sub: id, email, name, role, companies: cos }, env);
  };
  const tok = {
    owner: await seat('u1', 'Owner Seat', 'owner@example.test', 'Full Access (Owner)', 'All'),
    wtc: await seat('u7', 'WTC Entry', 'wtc.entry@example.test', 'Entry', 'WTC'),
    bbc: await seat('u8', 'BBC Entry', 'bbc.entry@example.test', 'Entry', 'BBConstruction')
  };
  async function api(routePath, { method = 'POST', body, token = tok.owner } = {}) {
    const tasks = [];
    const raw = body !== undefined ? JSON.stringify(body) : undefined;
    const req = new Request(`https://example.test/app/api/${routePath}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.9.0.5', 'X-ISABI-Shell': SHELL, 'X-ISABI-Session': token },
      body: raw
    });
    const res = await onRequest({ request: req, env, params: { route: routePath.split('?')[0].split('/') }, waitUntil: p => tasks.push(p) });
    await Promise.all(tasks);
    const txt = await res.text();
    let json = null;
    try { json = JSON.parse(txt); } catch (_) {}
    return { status: res.status, json, txt };
  }
  // The top-up's sign-in: a build ticket session, straight into handleSync.
  async function buildTicketPatch(doc) {
    const tasks = [];
    const body = { op: 'patch', key: '', patch: { [DOC_KEY]: doc } };
    const res = await handleSync(
      new Request('https://example.test/app/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ISABI-Shell': SHELL }, body: JSON.stringify(body) }),
      env,
      { sub: 'build', role: 'Owner', companies: 'ALL', email: 'build@example.test', build_ticket: true },
      body,
      { waitUntil: p => tasks.push(p) }
    );
    await Promise.all(tasks);
    return { status: res.status, json: await res.json() };
  }
  const stored = async () => {
    const row = await readEdgeKvDoc(d1, DOC_KEY);
    return row ? { ts: row.updated_at, doc: JSON.parse(row.payload_json), chars: row.payload_json.length, row } : null;
  };
  const meta = () => d1.one("SELECT * FROM store_row_meta WHERE doc_key = 'mfg_web_store'");
  // The anchor the index must carry to describe the stored document: its stamp, its length, a SHA-256 of its text.
  const anchor = async () => docAnchorOf(await readEdgeKvDoc(d1, DOC_KEY));
  const idxLive = () => d1.rows("SELECT bucket, row_id, rev, hash FROM store_row_index WHERE doc_key = 'mfg_web_store' AND deleted = 0");
  // A device on the older protocol: whole reads, delta or whole saves, no row sync fields.
  const legacy = {
    read: async (token = tok.owner) => (await api('sync', { token, body: { op: 'get_mfg', doc: DOC_KEY } })).json,
    patch: async (docPatch, { token = tok.owner, ifMatch = null, delta = true, extra = {} } = {}) => {
      const ts = ifMatch || (await stored()).ts;
      const doc = Object.assign({ minShellVer: SHELL, updatedAt: nextTs(), updatedBy: 'gate@example.test' }, delta ? { _deltaPatch: 1 } : {}, docPatch);
      return api('sync', { token, body: Object.assign({ op: 'patch', key: '', ackOnly: true, ifMatchUpdatedAt: ts, patch: { [DOC_KEY]: doc } }, extra) });
    }
  };
  return { d1, env, tok, api, buildTicketPatch, stored, meta, anchor, idxLive, legacy };
}

// A device on the new protocol, driven by the glue cut out of app.js.
class Device {
  constructor(world, token, scopeKey) {
    this.w = world;
    this.token = token;
    this.scopeKey = scopeKey;
    this.g = makeGlue();
    this.etag = '';
    this.last = null;
  }
  async read({ etag = false, whole = false } = {}) {
    const body = { op: 'get_mfg', doc: DOC_KEY };
    if (etag && this.etag) body.ifNoneMatchEtag = this.etag;
    const sent = this.g.attach(body, this.scopeKey, { cursor: !whole, audit: !whole, report: true });
    const res = await this.w.api('sync', { token: this.token, body });
    const j = res.json || {};
    const rawHadDocs = Boolean(j.docs && j.docs[DOC_KEY]);
    const rawHadDelta = Boolean(j.rowDelta);
    const rawDelta = j.rowDelta ? JSON.parse(JSON.stringify(j.rowDelta)) : null;
    if (!this.g.settle(j, this.scopeKey, sent)) {
      const again = await this.read({ whole: true });
      again.refetched = true;
      again.refusedDelta = rawDelta;
      return again;
    }
    if (j.etag && !j.notModified) this.etag = j.etag;
    const kind = j.notModified ? 'notModified' : (rawHadDelta ? (rawHadDocs ? 'audit' : 'partial') : 'whole');
    this.last = { kind, req: body, json: j, bytes: res.txt.length, txt: res.txt, doc: j.docs ? j.docs[DOC_KEY] : null, delta: rawDelta, status: res.status };
    return this.last;
  }
  // A save as the app sends it: changed entries, the stamp it read, and the row sync fields.
  async patch(docPatch, { ifMatch = null, delta = true } = {}) {
    const ts = ifMatch || (await this.w.stored()).ts;
    const doc = Object.assign({ minShellVer: SHELL, updatedAt: nextTs(), updatedBy: 'gate@example.test' }, delta ? { _deltaPatch: 1 } : {}, docPatch);
    const body = { op: 'patch', key: '', ackOnly: true, ifMatchUpdatedAt: ts, patch: { [DOC_KEY]: doc } };
    this.g.attach(body, this.scopeKey, { cursor: true, audit: false, report: false });
    const res = await this.w.api('sync', { token: this.token, body });
    return { status: res.status, json: res.json, txt: res.txt, req: body };
  }
}

// ---- comparison helpers ---------------------------------------------------------------------------------------------
// A document as the device's merge sees it: keyed row sets by id (order is not part of the contract), the rest whole.
function canon(doc) {
  const out = { top: {}, sets: {} };
  for (const k of Object.keys(doc || {})) {
    if (k === 'customRecords' || k === 'kioskPunches') continue;
    out.top[k] = JSON.stringify(doc[k]);
  }
  for (const [setName, m] of collectRowMaps(doc || {})) {
    out.sets[setName] = {};
    for (const [id, r] of m) out.sets[setName][id] = JSON.stringify(r);
  }
  return out;
}
function firstDiff(a, b) {
  const ca = canon(a);
  const cb = canon(b);
  for (const k of new Set([...Object.keys(ca.top), ...Object.keys(cb.top)])) {
    if (ca.top[k] !== cb.top[k]) return `top ${k}`;
  }
  for (const s of new Set([...Object.keys(ca.sets), ...Object.keys(cb.sets)])) {
    if (!ca.sets[s] || !cb.sets[s]) return `set ${s} on one side only`;
    for (const id of new Set([...Object.keys(ca.sets[s]), ...Object.keys(cb.sets[s])])) {
      if (ca.sets[s][id] !== cb.sets[s][id]) return `${s}/${id}`;
    }
  }
  return '';
}
const deltaIds = d => {
  const rows = [];
  const gone = [];
  for (const [k, list] of Object.entries((d && d.rows && d.rows.customRecords) || {})) for (const r of list) rows.push(`${k}/${r.id}`);
  for (const r of ((d && d.rows && d.rows.kioskPunches) || [])) rows.push(`kp/${r.id}`);
  for (const [k, list] of Object.entries((d && d.gone && d.gone.customRecords) || {})) for (const id of list) gone.push(`${k}/${id}`);
  for (const id of ((d && d.gone && d.gone.kioskPunches) || [])) gone.push(`kp/${id}`);
  return { rows: rows.sort(), gone: gone.sort() };
};
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail !== undefined ? '  -> ' + JSON.stringify(detail).slice(0, 1600) : ''}`); }
}

// ---- seed -----------------------------------------------------------------------------------------------------------
function seedDoc() {
  const pad = 'Ready-mix delivery, pump on site, slump checked at the gate. '.repeat(3);
  const sales = [];
  for (let i = 0; i < 240; i++) {
    sales.push({ id: `st-wtc-${i}`, company: 'WTC', date: '2026-11-20', customer: `ZzCust ${i % 17}`, total: 100 + i, notes: pad, source: 'app' });
  }
  for (let i = 0; i < 60; i++) {
    sales.push({ id: `st-bbc-${i}`, company: 'BBConstruction', date: '2026-11-20', customer: `ZzBbcCust ${i % 7}`, total: 300 + i, notes: 'BBC-ONLY-MARKER ' + pad, source: 'app' });
  }
  return {
    minShellVer: SHELL,
    updatedAt: nextTs(),
    updatedBy: 'build@example.test',
    lbpFxRate: 89500,
    lbpFxUpdatedAt: '2026-11-01T00:00:00.000Z',
    customRecords: {
      sales_tickets: sales,
      expenses: [
        { id: 'ex-live-trail', company: 'WTC', date: '2026-11-21', supplier: 'ZzSupplier One', amount: 80, source: 'app', modified_at: '2026-11-22T09:00:00.000Z',
          _pre_void_orig: { supplier: 'ZzSupplier One', amount: 75 },
          _pre_void_edits: [{ at: '2026-11-22T09:00:00.000Z', by: 'Owner Seat', changes: { amount: { from: 75, to: 80 } } }] },
        { id: 'ex-void-trail', company: 'WTC', date: '2026-11-21', supplier: 'ZzSupplier Two', amount: 40, source: 'app', voided: true,
          void_reason: 'Entered twice by mistake', voided_by: 'Owner Seat', voided_at: '2026-11-23T10:00:00.000Z',
          _pre_void_orig: { supplier: 'ZzSupplier Two', amount: 45 },
          _pre_void_edits: [{ at: '2026-11-22T11:00:00.000Z', by: 'Owner Seat', changes: { amount: { from: 45, to: 40 } } }] },
        { id: 'ex-plain', company: 'WTC', date: '2026-11-21', supplier: 'ZzSupplier Three', amount: 12, source: 'app' },
        { id: 'ex-bbc', company: 'BBConstruction', date: '2026-11-21', supplier: 'ZzBbcSupplier', amount: 66, notes: 'BBC-ONLY-MARKER', source: 'app' }
      ],
      attendance: [
        { id: 'at-app-1', company: 'WTC', date: '2026-11-25', staff: 'ZzStaff One', source: 'app' },
        // A bloated shift-backfill row: the device recognises it by its history, so it must travel whole.
        { id: 'at_0000000000aa', company: 'WTC', date: '2026-10-05', staff: 'ZzStaff Two',
          _pre_void_edits: [{ at: '2026-11-24T13:26:15.123Z', by: 'System', changes: { shift_id: { from: 'a', to: 'b' } } }] }
      ]
    },
    kioskPunches: [
      { id: 'kp-1', company: 'WTC', staff: 'ZzStaff One', date: '2026-11-25', direction: 'IN', time: '08:00', punched_at: '2026-11-25T08:00:00Z' },
      { id: 'kp-bbc-1', company: 'BBConstruction', staff: 'ZzBbcStaff', date: '2026-11-25', direction: 'IN', time: '08:05', punched_at: '2026-11-25T08:05:00Z' }
    ],
    sentinelReviews: { 'sr-1': { company: 'WTC', status: 'reviewed', updated_at: '2026-11-25T08:00:00Z' } }
  };
}

const W = await makeWorld();

console.log('\n[1. A device that does not ask gets what it got before]');
{
  const seed = await W.buildTicketPatch(seedDoc());
  ok('1a. the store is seeded through a build ticket, as a top-up does', seed.status === 200 && seed.json.ok === true, seed.json);
  const g = await W.legacy.read();
  const keys = Object.keys(g || {}).sort();
  ok('1b. an old-protocol read carries the same fields as before and the whole document',
    sameList(keys, ['deltaSyncV1', 'docs', 'edge', 'etag', 'ok', 'updatedAt']) && g.docs[DOC_KEY].customRecords.sales_tickets.length === 300, keys);
  const exLive = g.docs[DOC_KEY].customRecords.expenses.find(r => r.id === 'ex-live-trail');
  ok('1c. an old-protocol read still carries the edit history of a live entry', Array.isArray(exLive._pre_void_edits) && exLive._pre_void_edits.length === 1, exLive);
  const p = await W.legacy.patch({ customRecords: { sales_tickets: [{ id: 'st-wtc-legacy-add', company: 'WTC', date: '2026-11-26', customer: 'ZzCust L', total: 5, source: 'app' }] } });
  ok('1d. an old-protocol save works and nothing is indexed while no device has asked for row sync',
    p.status === 200 && p.json.ok === true && !p.json.conflict && !W.meta() && W.idxLive().length === 0, { p: p.json, meta: W.meta() });
}

const owner = new Device(W, W.tok.owner, 'owner');
const wtc = new Device(W, W.tok.wtc, 'wtc');
let wholeBytes = 0;

console.log('\n[2. First read: the whole document and an anchor]');
{
  const r = await owner.read();
  wholeBytes = r.bytes;
  const st = await W.stored();
  const m = W.meta();
  const distinct = Array.from(collectRowMaps(st.doc).values()).reduce((n, mm) => n + mm.size, 0);
  ok('2a. the first read is the whole document with rowSyncV1 and an anchor (epoch, revision, scope, a count and digest per row set)',
    r.kind === 'whole' && r.json.rowSyncV1 === true && r.json.rowSync.epoch && Number.isInteger(r.json.rowSync.rev) && r.json.rowSync.scope
      && /^301\.[0-9a-z]+\.[0-9a-z]+$/.test(String(r.json.rowSync.sums['cr:sales_tickets'])) && r.json.rowSync.counts === undefined,
    r.json.rowSync);
  ok('2b. the index describes the stored document: one line per entry, anchored on the stamp, length and hash of the stored text',
    m && m.doc_ts === await W.anchor() && m.doc_ts.startsWith(st.ts + '|' + st.chars.toString(36) + '|') && Number(m.rev) === 1 && W.idxLive().length === distinct,
    { meta: m, idx: W.idxLive().length, distinct });
  ok('2c. the device holds a copy and the document rebuilt from it equals the one it was sent',
    Boolean(owner.g.mirror()) && firstDiff(RowSyncClient.toDoc(owner.g.mirror()), r.doc) === '', firstDiff(RowSyncClient.toDoc(owner.g.mirror() || { top: {}, sets: new Map() }), r.doc));
  const nm = await owner.read({ etag: true });
  ok('2d. a second read with nothing changed is "not modified" and keeps the copy', nm.kind === 'notModified' && Boolean(owner.g.mirror()), nm.json);
}

// Reads the whole document the same seat would get right now (new protocol, no copy), to compare a rebuilt one against.
async function wholeNow(token) {
  const j = (await W.api('sync', { token, body: { op: 'get_mfg', doc: DOC_KEY, noTrails: true, rowSync: { v: 1 } } })).json;
  return j.docs[DOC_KEY];
}

console.log('\n[3. After another device saves: only the changed entries]');
{
  const before = W.meta();
  const p = await W.legacy.patch({ customRecords: { sales_tickets: [{ id: 'st-wtc-new-1', company: 'WTC', date: '2026-11-27', customer: 'ZzCust New', total: 777, source: 'app' }] } });
  const st = await W.stored();
  const m = W.meta();
  const line = W.d1.one("SELECT rev, deleted FROM store_row_index WHERE bucket = 'cr:sales_tickets' AND row_id = 'st-wtc-new-1'");
  ok('3a. the save moved the index and its stamp together (old-protocol device saving)',
    p.status === 200 && !p.json.conflict && m.doc_ts === await W.anchor() && m.doc_ts.startsWith(st.ts + '|') && Number(m.rev) === Number(before.rev) + 1 && line && Number(line.rev) === Number(m.rev),
    { p: p.json, meta: m, line });
  const r = await owner.read({ etag: true });
  const ids = deltaIds(r.delta);
  ok('3b. the read returns that one entry and no whole document', r.kind === 'partial' && sameList(ids.rows, ['sales_tickets/st-wtc-new-1']) && ids.gone.length === 0, ids);
  ok('3c. the partial answer is a small fraction of the whole one', r.bytes * 10 < wholeBytes, { partial: r.bytes, whole: wholeBytes });
  ok('3d. the document rebuilt on the device equals the whole document the cloud would send', firstDiff(r.doc, await wholeNow(W.tok.owner)) === '', firstDiff(r.doc, await wholeNow(W.tok.owner)));

  const p2 = await W.legacy.patch({
    customRecords: { sales_tickets: [{ id: 'st-wtc-3', company: 'WTC', date: '2026-11-20', customer: 'ZzCust 3', total: 9999, notes: 'edited', source: 'app', modified_at: nextTs() }] },
    _deletedCrIds: { attendance: ['at-app-1'] }
  });
  const r2 = await owner.read();
  const ids2 = deltaIds(r2.delta);
  ok('3e. an edit and a delete arrive as one changed entry and one gone id',
    p2.status === 200 && r2.kind === 'partial' && sameList(ids2.rows, ['sales_tickets/st-wtc-3']) && sameList(ids2.gone, ['attendance/at-app-1']), { p2: p2.json, ids2 });
  ok('3f. rebuilt document equals the whole one after an edit and a delete', firstDiff(r2.doc, await wholeNow(W.tok.owner)) === '', firstDiff(r2.doc, await wholeNow(W.tok.owner)));
}

console.log('\n[4. A writer that does not know the index (the top-up writing the store directly)]');
{
  const st = await W.stored();
  const doc = JSON.parse(JSON.stringify(st.doc));
  doc.customRecords.sales_tickets = doc.customRecords.sales_tickets.filter(r => r.id !== 'st-wtc-5');
  doc.customRecords.sales_tickets.find(r => r.id === 'st-wtc-6').total = 4242;
  doc.customRecords.sales_tickets.unshift({ id: 'st-wtc-direct-1', company: 'WTC', date: '2026-11-27', customer: 'ZzDirect', total: 1, source: 'app' });
  const ts = nextTs();
  doc.updatedAt = ts;
  await writeEdgeKvDoc(W.d1, DOC_KEY, JSON.stringify(doc), ts, 'system-reconcile');
  const mBefore = W.meta();
  ok('4a. after a direct write the index no longer carries the document\'s anchor', mBefore.doc_ts !== await W.anchor() && !mBefore.doc_ts.startsWith(ts + '|'), mBefore);
  const r = await owner.read();
  const ids = deltaIds(r.delta);
  const mAfter = W.meta();
  ok('4b. the next read rebuilds the index and still returns only the three changes',
    r.kind === 'partial' && sameList(ids.rows, ['sales_tickets/st-wtc-6', 'sales_tickets/st-wtc-direct-1']) && sameList(ids.gone, ['sales_tickets/st-wtc-5']) && mAfter.doc_ts === await W.anchor(),
    { kind: r.kind, ids, mAfter });
  ok('4c. rebuilt document equals the whole one after the direct write', firstDiff(r.doc, await wholeNow(W.tok.owner)) === '', firstDiff(r.doc, await wholeNow(W.tok.owner)));
  const live = W.idxLive().length;
  const distinct = Array.from(collectRowMaps((await W.stored()).doc).values()).reduce((n, mm) => n + mm.size, 0);
  ok('4d. the index again holds one live line per stored entry', live === distinct, { live, distinct });
}

console.log('\n[5. A company-scoped seat]');
{
  const r0 = await wtc.read();
  const hasBbc = r0.txt.includes('BBC-ONLY-MARKER');
  ok('5a. the scoped seat starts from a whole document holding its own company only',
    r0.kind === 'whole' && r0.doc._scopedForSession === true && !hasBbc && r0.doc.customRecords.sales_tickets.every(x => x.company === 'WTC'), { kind: r0.kind, hasBbc });
  await W.legacy.patch({ customRecords: { sales_tickets: [{ id: 'st-bbc-2', company: 'BBConstruction', date: '2026-11-20', customer: 'ZzBbcCust 2', total: 31337, notes: 'BBC-ONLY-MARKER edited', source: 'app', modified_at: nextTs() }] } });
  const r1 = await wtc.read();
  const ids1 = deltaIds(r1.delta);
  ok('5b. another company\'s change does not reach the scoped seat at all: no entry, no id, no trace of it in the answer',
    r1.kind === 'partial' && ids1.rows.length === 0 && ids1.gone.length === 0 && !r1.txt.includes('st-bbc-') && !r1.txt.includes('BBC-ONLY-MARKER') && !r1.txt.includes('31337'), { ids1 });
  ok('5c. the scoped seat\'s rebuilt document equals its whole one', firstDiff(r1.doc, await wholeNow(W.tok.wtc)) === '', firstDiff(r1.doc, await wholeNow(W.tok.wtc)));

  await W.legacy.patch({ customRecords: { sales_tickets: [{ id: 'st-wtc-9', company: 'BBConstruction', date: '2026-11-20', customer: 'ZzCust 9', total: 109, source: 'app', modified_at: nextTs() }] } });
  const r2 = await wtc.read();
  const ids2 = deltaIds(r2.delta);
  const stillHas = r2.doc.customRecords.sales_tickets.some(x => x.id === 'st-wtc-9');
  ok('5d. an entry that moves to another company is gone for the scoped seat', r2.kind === 'partial' && sameList(ids2.gone, ['sales_tickets/st-wtc-9']) && !stillHas, { ids2, stillHas });
  await W.legacy.patch({ customRecords: { sales_tickets: [{ id: 'st-wtc-9', company: 'WTC', date: '2026-11-20', customer: 'ZzCust 9', total: 109, source: 'app', modified_at: nextTs() }] } });
  const r3 = await wtc.read();
  ok('5e. when it moves back the scoped seat receives it again',
    r3.kind === 'partial' && sameList(deltaIds(r3.delta).rows, ['sales_tickets/st-wtc-9']) && firstDiff(r3.doc, await wholeNow(W.tok.wtc)) === '', deltaIds(r3.delta));

  // An entry that left the seat's company some time ago: the other company's later edits to it are not reported.
  await W.legacy.patch({ customRecords: { sales_tickets: [{ id: 'st-wtc-11', company: 'BBConstruction', date: '2026-11-20', customer: 'ZzCust 11', total: 111, source: 'app', modified_at: nextTs() }] } });
  const rMoved = await wtc.read();
  await W.legacy.patch({ customRecords: { sales_tickets: [{ id: 'st-wtc-11', company: 'BBConstruction', date: '2026-11-20', customer: 'ZzCust 11', total: 112, notes: 'BBC-ONLY-MARKER later edit', source: 'app', modified_at: nextTs() }] } });
  const rLater = await wtc.read();
  ok('5e2. once the seat has been told an entry left its company, the other company\'s later edits to it are not mentioned',
    sameList(deltaIds(rMoved.delta).gone, ['sales_tickets/st-wtc-11']) && rLater.kind === 'partial' && deltaIds(rLater.delta).gone.length === 0 && deltaIds(rLater.delta).rows.length === 0
      && !rLater.txt.includes('st-wtc-11') && firstDiff(rLater.doc, await wholeNow(W.tok.wtc)) === '', { moved: deltaIds(rMoved.delta), later: deltaIds(rLater.delta) });
  // Deletes: the seat's own entry is reported gone, another company's is not mentioned.
  await W.legacy.patch({ _deletedCrIds: { sales_tickets: ['st-bbc-7', 'st-wtc-12'], expenses: ['ex-bbc'] }, _deletedPunchIds: ['kp-bbc-1'] });
  const rDel = await wtc.read();
  ok('5e3. a deleted entry is reported gone to the seat that could see it, and another company\'s deleted entries and punches are not mentioned',
    rDel.kind === 'partial' && sameList(deltaIds(rDel.delta).gone, ['sales_tickets/st-wtc-12']) && !rDel.txt.includes('st-bbc-7') && !rDel.txt.includes('ex-bbc') && !rDel.txt.includes('kp-bbc-1')
      && firstDiff(rDel.doc, await wholeNow(W.tok.wtc)) === '', deltaIds(rDel.delta));
  ok('5e4. the size of the whole store is told to a seat that sees the whole store only', rDel.json.storeChars === undefined && r0.json.storeChars === undefined, { a: rDel.json.storeChars, b: r0.json.storeChars });

  W.d1.db.prepare("UPDATE users SET companies = 'WTC,BBConstruction' WHERE id = 'u7'").run();
  const r4 = await wtc.read();
  ok('5f. a change of the seat\'s companies starts it again from the whole document, now with both companies',
    r4.kind === 'whole' && r4.txt.includes('BBC-ONLY-MARKER') && Boolean(wtc.g.mirror()), { kind: r4.kind });
  W.d1.db.prepare("UPDATE users SET companies = 'WTC' WHERE id = 'u7'").run();
  const r5 = await wtc.read();
  ok('5g. and back: whole document again, the other company gone from it', r5.kind === 'whole' && !r5.txt.includes('BBC-ONLY-MARKER'), { kind: r5.kind });

  // A scoped seat's save runs every stored entry through the row-level guard, which rewrites an entry the first time
  // it meets it (default fields added from its database row). Those are real changes to the stored document and the
  // index reports them; the second scoped save finds nothing left to rewrite.
  await owner.read();
  const sv1 = await W.legacy.patch({ customRecords: { sales_tickets: [{ id: 'st-wtc-scoped-1', company: 'WTC', date: '2026-11-27', customer: 'ZzScoped', total: 11, source: 'app' }] } }, { token: W.tok.wtc });
  const o1 = await owner.read();
  ok('5h. after a scoped seat\'s first save the owner\'s rebuilt document still equals the whole one (many entries were rewritten)',
    sv1.status === 200 && !sv1.json.conflict && firstDiff(o1.doc, await wholeNow(W.tok.owner)) === '', { kind: o1.kind, diff: firstDiff(o1.doc, await wholeNow(W.tok.owner)) });
  const sv2 = await W.legacy.patch({ customRecords: { sales_tickets: [{ id: 'st-wtc-scoped-2', company: 'WTC', date: '2026-11-27', customer: 'ZzScoped', total: 12, source: 'app' }] } }, { token: W.tok.wtc });
  const o2 = await owner.read();
  const ids2b = deltaIds(o2.delta);
  ok('5i. the scoped seat\'s next save changes only its new entry and the one from before (rewritten once), and the owner receives just those',
    sv2.status === 200 && o2.kind === 'partial' && sameList(ids2b.rows, ['sales_tickets/st-wtc-scoped-1', 'sales_tickets/st-wtc-scoped-2']) && firstDiff(o2.doc, await wholeNow(W.tok.owner)) === '', ids2b);
}

console.log('\n[6. Kiosk punches and top-level parts]');
{
  await owner.read();
  await W.legacy.patch({ kioskPunches: [{ id: 'kp-2', company: 'WTC', staff: 'ZzStaff One', date: '2026-11-25', direction: 'OUT', time: '16:00', punched_at: '2026-11-25T16:00:00Z' }], _deletedPunchIds: ['kp-1'] });
  const r = await owner.read();
  const ids = deltaIds(r.delta);
  ok('6a. a new punch and a removed punch arrive as one entry and one gone id', r.kind === 'partial' && sameList(ids.rows, ['kp/kp-2']) && sameList(ids.gone, ['kp/kp-1']), ids);
  ok('6b. rebuilt document equals the whole one after punches changed', firstDiff(r.doc, await wholeNow(W.tok.owner)) === '', firstDiff(r.doc, await wholeNow(W.tok.owner)));

  await W.legacy.patch({ lbpFxRate: 90000, lbpFxUpdatedAt: nextTs() });
  const r2 = await owner.read();
  const topKeys = Object.keys(r2.delta.top).sort();
  ok('6c. a settings change arrives as the changed top-level parts only',
    r2.kind === 'partial' && topKeys.includes('lbpFxRate') && topKeys.includes('updatedAt') && !topKeys.includes('users') && !topKeys.includes('sentinelReviews') && deltaIds(r2.delta).rows.length === 0, topKeys);
  ok('6d. rebuilt document equals the whole one after a settings change', firstDiff(r2.doc, await wholeNow(W.tok.owner)) === '', firstDiff(r2.doc, await wholeNow(W.tok.owner)));

  // A part of the answer that is not in the stored document at all: work schedules live in their own row.
  const wsDoc = { shiftTypes: [{ id: 'ws-gate-1', name: 'Gate Shift', company: 'WTC', start_time: '08:00', end_time: '16:00', hours: 8, updated_at: nextTs() }], policyGroups: [], companyPolicyDefaults: {}, staffRules: {} };
  W.d1.db.prepare("INSERT OR REPLACE INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES ('work_schedules', ?, ?, 'gate', 1)").run(JSON.stringify(wsDoc), nextTs());
  const r3 = await owner.read({ etag: true });
  ok('6e. a change outside the stored document (work schedules) still reaches the device, with no entries resent',
    r3.kind === 'partial' && Object.keys(r3.delta.top).includes('workSchedules') && deltaIds(r3.delta).rows.length === 0 && firstDiff(r3.doc, await wholeNow(W.tok.owner)) === '',
    { kind: r3.kind, top: r3.delta ? Object.keys(r3.delta.top) : null });
}

console.log('\n[7. Bounds: the whole document, never a wrong partial answer]');
{
  await owner.read();
  const realEpoch = owner.g.mirror().epoch;
  owner.g.mirror().epoch = 'not-the-epoch';
  const r1 = await owner.read();
  ok('7a. a copy from another epoch is answered with the whole document', r1.kind === 'whole' && owner.g.mirror().epoch === realEpoch, { kind: r1.kind });
  owner.g.mirror().rev += 100;
  const r2 = await owner.read();
  ok('7b. a revision ahead of the cloud is answered with the whole document', r2.kind === 'whole', { kind: r2.kind });

  const many = [];
  for (let i = 0; i < ROW_SYNC_MAX_DELTA_ROWS + 50; i++) many.push({ id: `st-bulk-${i}`, company: 'WTC', date: '2026-11-27', customer: 'ZzBulk', total: i, source: 'app' });
  const stB = await W.stored();
  const bulkDoc = JSON.parse(JSON.stringify(stB.doc));
  bulkDoc.customRecords.sales_tickets = bulkDoc.customRecords.sales_tickets.concat(many);
  bulkDoc.updatedAt = nextTs();
  const bulk = await W.buildTicketPatch(bulkDoc);
  const r3 = await owner.read();
  ok('7c. more changes than the limit are answered with the whole document', bulk.status === 200 && r3.kind === 'whole' && r3.doc.customRecords.sales_tickets.length > ROW_SYNC_MAX_DELTA_ROWS, { bulk: bulk.json, kind: r3.kind });

  const mNow = W.meta();
  await W.legacy.patch({ lbpFxRate: 90100, lbpFxUpdatedAt: nextTs() });
  W.d1.db.prepare("UPDATE store_row_meta SET floor_rev = ? WHERE doc_key = 'mfg_web_store'").run(Number(mNow.rev) + 1);
  const r4 = await owner.read();
  ok('7d. a revision under the floor (deleted-entry lines already pruned) is answered with the whole document', r4.kind === 'whole', { kind: r4.kind, rev: mNow.rev });
  W.d1.db.prepare("UPDATE store_row_meta SET floor_rev = 0 WHERE doc_key = 'mfg_web_store'").run();

  // A read that falls inside a save: the head row already carries the new stamp, a part still the old one.
  await owner.read();
  const partRow = W.d1.one("SELECT doc_key, updated_at FROM edge_kv_store WHERE doc_key LIKE 'mfg_web_store__part_%' ORDER BY doc_key DESC LIMIT 1");
  const metaBefore = W.meta();
  W.d1.db.prepare('UPDATE edge_kv_store SET updated_at = ? WHERE doc_key = ?').run('2020-01-01T00:00:00.000Z', partRow.doc_key);
  const r5 = await owner.read();
  const metaMid = W.meta();
  ok('7e. a read that fell inside a save anchors nothing: whole document, no row sync fields, index untouched',
    Boolean(partRow) && r5.kind === 'whole' && r5.json.rowSyncV1 === undefined && !owner.g.mirror() && Number(metaMid.rev) === Number(metaBefore.rev), { kind: r5.kind, rs: r5.json.rowSyncV1, metaBefore, metaMid });
  W.d1.db.prepare('UPDATE edge_kv_store SET updated_at = ? WHERE doc_key = ?').run(partRow.updated_at, partRow.doc_key);
  const r6 = await owner.read();
  ok('7f. once the save is whole the device is anchored again', r6.kind === 'whole' && r6.json.rowSyncV1 === true && Boolean(owner.g.mirror()), { kind: r6.kind });
}

console.log('\n[8. "Someone saved before you" comes back as changed entries]');
{
  await owner.read();
  const staleTs = (await W.stored()).ts;
  await W.legacy.patch({ customRecords: { sales_tickets: [{ id: 'st-wtc-conflict-other', company: 'WTC', date: '2026-11-27', customer: 'ZzOther', total: 3, source: 'app' }] } });
  const p = await owner.patch({ customRecords: { sales_tickets: [{ id: 'st-wtc-conflict-mine', company: 'WTC', date: '2026-11-27', customer: 'ZzMine', total: 4, source: 'app' }] } }, { ifMatch: staleTs });
  const hadDocs = Boolean(p.json.docs);
  const ids = deltaIds(p.json.rowDelta);
  ok('8a. a save against a stale stamp is answered with the changed entries, not the whole document',
    p.status === 200 && p.json.conflict === true && !hadDocs && sameList(ids.rows, ['sales_tickets/st-wtc-conflict-other']), { conflict: p.json.conflict, hadDocs, ids });
  const settled = owner.g.settle(p.json, 'owner', null);
  ok('8b. the device rebuilds the whole document from that answer and it equals the cloud\'s',
    settled === true && firstDiff(p.json.docs[DOC_KEY], await wholeNow(W.tok.owner)) === '', firstDiff((p.json.docs || {})[DOC_KEY], await wholeNow(W.tok.owner)));
  const p2 = await owner.patch({ customRecords: { sales_tickets: [{ id: 'st-wtc-conflict-mine', company: 'WTC', date: '2026-11-27', customer: 'ZzMine', total: 4, source: 'app' }] } }, { ifMatch: p.json.updatedAt });
  const r = await owner.read();
  ok('8c. the retry lands and the device then receives its own entry back as a changed entry',
    p2.status === 200 && !p2.json.conflict && r.kind === 'partial' && sameList(deltaIds(r.delta).rows, ['sales_tickets/st-wtc-conflict-mine']), { p2: p2.json, ids: deltaIds(r.delta) });
}

console.log('\n[9. The comparison the cloud asks for, and the switches]');
{
  const dev = new Device(W, W.tok.owner, 'owner-audit');
  await dev.read();
  let auditRead = null;
  for (let i = 0; i < ROW_SYNC_AUDIT_AFTER + 2 && !auditRead; i++) {
    await W.legacy.patch({ customRecords: { sales_tickets: [{ id: `st-wtc-audit-${i}`, company: 'WTC', date: '2026-11-27', customer: 'ZzAudit', total: i, source: 'app' }] } });
    const r = await dev.read();
    if (r.kind === 'audit') auditRead = r;
  }
  const rep = dev.g.report();
  ok('9a. after a few partial answers one read carries both the changed entries and the whole document, and they agree',
    Boolean(auditRead) && rep && rep.ok === true && rep.rows > 300 && rep.bad === 0, { got: Boolean(auditRead), rep });
  const okBefore = Number(W.meta().audit_ok);
  await W.legacy.patch({ lbpFxRate: 90200, lbpFxUpdatedAt: nextTs() });
  const rNext = await dev.read();
  ok('9b. the clean comparison is counted by the cloud and partial answers go on',
    Number(W.meta().audit_ok) === okBefore + 1 && dev.g.report() === null && rNext.kind === 'partial', { meta: W.meta(), kind: rNext.kind });

  // A copy that has drifted (here: tampered with) must be caught by the next comparison.
  const dev2 = new Device(W, W.tok.owner, 'owner-drift');
  await dev2.read();
  let drift = null;
  for (let i = 0; i < ROW_SYNC_AUDIT_AFTER + 2 && !drift; i++) {
    await W.legacy.patch({ customRecords: { sales_tickets: [{ id: `st-wtc-drift-${i}`, company: 'WTC', date: '2026-11-27', customer: 'ZzDrift', total: i, source: 'app' }] } });
    if (i === ROW_SYNC_AUDIT_AFTER - 1) dev2.g.mirror().sets.get('cr:sales_tickets').set('st-wtc-1', JSON.stringify({ id: 'st-wtc-1', company: 'WTC', total: -1 }));
    const r = await dev2.read();
    if (r.kind === 'audit') drift = r;
  }
  const rep2 = dev2.g.report();
  ok('9c. a drifted copy fails its comparison, and the device starts again from the whole document it was sent',
    Boolean(drift) && rep2 && rep2.ok === false && rep2.bad >= 1 && /st-wtc-1/.test(rep2.sample) && firstDiff(RowSyncClient.toDoc(dev2.g.mirror()), drift.doc) === '', { rep2 });
  await W.legacy.patch({ lbpFxRate: 90300, lbpFxUpdatedAt: nextTs() });
  const rOff = await dev2.read();
  const mOff = W.meta();
  ok('9d. one failed comparison switches partial answers off for every device: whole documents, no row sync fields',
    Number(mOff.audit_bad) === 1 && rOff.kind === 'whole' && rOff.json.rowSyncV1 === undefined && !dev2.g.mirror(), { mOff, kind: rOff.kind });
  const rOwnerOff = await owner.read();
  ok('9e. another device holding a copy also falls back to whole documents', rOwnerOff.kind === 'whole' && !owner.g.mirror(), { kind: rOwnerOff.kind });
  W.d1.db.prepare("UPDATE store_row_meta SET audit_bad = 0 WHERE doc_key = 'mfg_web_store'").run();
  const rOn = await owner.read();
  ok('9f. resetting the counter switches them back on', rOn.kind === 'whole' && rOn.json.rowSyncV1 === true && Boolean(owner.g.mirror()), { kind: rOn.kind });
  W.d1.db.prepare("UPDATE store_row_meta SET mode = 0 WHERE doc_key = 'mfg_web_store'").run();
  await W.legacy.patch({ lbpFxRate: 90400, lbpFxUpdatedAt: nextTs() });
  const rMode0 = await owner.read();
  ok('9g. mode 0 switches partial answers off', rMode0.kind === 'whole' && rMode0.json.rowSyncV1 === undefined, { kind: rMode0.kind });
  W.d1.db.prepare("UPDATE store_row_meta SET mode = 2 WHERE doc_key = 'mfg_web_store'").run();
  await owner.read();
  await W.legacy.patch({ lbpFxRate: 90500, lbpFxUpdatedAt: nextTs() });
  const rMode2 = await owner.read();
  ok('9h. mode 2 switches them back on, and the index kept up while they were off', rMode2.kind === 'partial' && firstDiff(rMode2.doc, await wholeNow(W.tok.owner)) === '', { kind: rMode2.kind });
}

console.log('\n[10. Edit history: live entries travel without it, voided ones with it]');
{
  const r = await new Device(W, W.tok.owner, 'owner-trails').read();
  const ex = id => r.doc.customRecords.expenses.find(x => x.id === id);
  ok('10a. a live entry arrives without its edit history and the answer says so',
    r.json.trailsOnDemand === true && ex('ex-live-trail') && ex('ex-live-trail')._pre_void_edits === undefined && ex('ex-live-trail')._pre_void_orig === undefined && ex('ex-live-trail').amount === 80, ex('ex-live-trail'));
  ok('10b. a voided entry arrives with its edit history (the Void Log reads it)',
    Array.isArray(ex('ex-void-trail')._pre_void_edits) && ex('ex-void-trail')._pre_void_edits.length === 1 && ex('ex-void-trail')._pre_void_orig.amount === 45, ex('ex-void-trail'));
  const bloated = r.doc.customRecords.attendance.find(x => x.id === 'at_0000000000aa');
  ok('10c. an entry the device classifies by its history travels unchanged', !bloated || Array.isArray(bloated._pre_void_edits), bloated);
  const st = await W.stored();
  const stEx = st.doc.customRecords.expenses.find(x => x.id === 'ex-live-trail');
  ok('10d. the stored document keeps the history of the live entry', Array.isArray(stEx._pre_void_edits) && stEx._pre_void_edits.length === 1, stEx);
  ok('10e. the answer reports the size of the document as stored', Number(r.json.storeChars) === st.chars, { storeChars: r.json.storeChars, chars: st.chars });
}

console.log('\n[11. A device without the history saves: the stored history is what an older device would have left]');
{
  // Two stores with the same content. In one an older device (it holds the history and sends it) edits and then voids
  // an entry; in the other a new device (it never held the history) does the same. The stored entries must agree.
  const mk = async () => {
    const w = await makeWorld();
    const doc = seedDoc();
    doc.customRecords.sales_tickets = doc.customRecords.sales_tickets.slice(0, 5);
    await w.buildTicketPatch(doc);
    return w;
  };
  const A = await mk();
  const B = await mk();
  const editAt = nextTs();
  const voidAt = nextTs();
  const base = (await A.stored()).doc.customRecords.expenses.find(x => x.id === 'ex-live-trail');

  // Older device: sends the entry with the history it holds plus the line it wrote itself.
  const oldEdit = Object.assign({}, base, { amount: 95, modified_at: editAt, modified_by: 'owner@example.test' });
  oldEdit._pre_void_edits = base._pre_void_edits.concat([{ at: editAt, by: 'Owner Seat', changes: { amount: { from: 80, to: 95 } } }]);
  const a1 = await A.legacy.patch({ customRecords: { expenses: [oldEdit] } });

  // New device: reads (no history on the live entry), edits, sends the entry without any history.
  const devB = new Device(B, B.tok.owner, 'owner-b');
  const rB = await devB.read();
  const liveB = rB.doc.customRecords.expenses.find(x => x.id === 'ex-live-trail');
  const newEdit = Object.assign({}, liveB, { amount: 95, modified_at: editAt, modified_by: 'owner@example.test' });
  const b1 = await devB.patch({ customRecords: { expenses: [newEdit] } });

  const norm = row => {
    const c = JSON.parse(JSON.stringify(row));
    (c._pre_void_edits || []).forEach((e, i) => { if (i > 0) e.at = 'T'; });
    for (const k of ['voided_at', 'modified_at', 'updated_at']) if (c[k]) c[k] = 'T';
    return JSON.stringify(c, Object.keys(c).sort());
  };
  const sA1 = (await A.stored()).doc.customRecords.expenses.find(x => x.id === 'ex-live-trail');
  const sB1 = (await B.stored()).doc.customRecords.expenses.find(x => x.id === 'ex-live-trail');
  ok('11a. both saves land', a1.status === 200 && !a1.json.conflict && b1.status === 200 && !b1.json.conflict, { a1: a1.json, b1: b1.json });
  ok('11b. after the edit the stored history holds the earlier line and the new one in both stores, and they agree',
    Array.isArray(sB1._pre_void_edits) && sB1._pre_void_edits.length === 2 && sB1._pre_void_orig.amount === 75 && sB1.amount === 95 && norm(sA1) === norm(sB1),
    { a: sA1, b: sB1 });

  const oldVoid = Object.assign({}, sA1, { voided: true, void_reason: 'Supplier invoice cancelled', voided_at: voidAt, voided_by: 'Owner Seat' });
  const a2 = await A.legacy.patch({ customRecords: { expenses: [oldVoid] } });
  const rB2 = await devB.read();
  const liveB2 = rB2.doc.customRecords.expenses.find(x => x.id === 'ex-live-trail');
  const newVoid = Object.assign({}, liveB2, { voided: true, void_reason: 'Supplier invoice cancelled', voided_at: voidAt, voided_by: 'Owner Seat' });
  const b2 = await devB.patch({ customRecords: { expenses: [newVoid] } });
  const sA2 = (await A.stored()).doc.customRecords.expenses.find(x => x.id === 'ex-live-trail');
  const sB2 = (await B.stored()).doc.customRecords.expenses.find(x => x.id === 'ex-live-trail');
  ok('11c. after the void the stored entry and its history agree in both stores',
    a2.status === 200 && b2.status === 200 && sB2.voided === true && Array.isArray(sB2._pre_void_edits) && sB2._pre_void_edits.length >= 2 && norm(sA2) === norm(sB2),
    { a2: a2.json, b2: b2.json, a: sA2, b: sB2 });
  const rB3 = await devB.read();
  const got = rB3.doc.customRecords.expenses.find(x => x.id === 'ex-live-trail');
  ok('11d. the device that voided it then receives the entry with its full history, as a changed entry',
    rB3.kind === 'partial' && got.voided === true && Array.isArray(got._pre_void_edits) && got._pre_void_edits.length === sB2._pre_void_edits.length && got._pre_void_orig.amount === 75,
    { kind: rB3.kind, got });
  ok('11e. the history of the live entry was not in the new device\'s first read', liveB._pre_void_edits === undefined && liveB._pre_void_orig === undefined, liveB);
}

console.log('\n[13. A writer that rewrites the stored text under the stamp it found (a data release)]');
{
  const dev = new Device(W, W.tok.owner, 'owner-samestamp');
  await dev.read();
  const metaBefore = W.meta();
  const st = await W.stored();
  const doc = JSON.parse(JSON.stringify(st.doc));
  // Same stamp, same number of entries, same length of text: one entry's content rewritten (the release keeping
  // the newer of two rows). Only the hash of the text tells the two documents apart.
  doc.customRecords.sales_tickets.find(r => r.id === 'st-wtc-20').total = 921;
  await writeEdgeKvDoc(W.d1, DOC_KEY, JSON.stringify(doc), st.ts, 'seed-export');
  const stAfter = await W.stored();
  ok('13a. the store was rewritten under the same stamp, to a text of the same length',
    stAfter.ts === st.ts && stAfter.chars === st.chars && stAfter.doc.customRecords.sales_tickets.find(r => r.id === 'st-wtc-20').total === 921, { ts: stAfter.ts, chars: [st.chars, stAfter.chars] });
  const r = await dev.read();
  const ids = deltaIds(r.delta);
  const mAfter = W.meta();
  ok('13b. the next read notices (the anchor is the text, not the stamp), rebuilds the index and returns the rewritten entry',
    r.kind === 'partial' && !r.refetched && sameList(ids.rows, ['sales_tickets/st-wtc-20']) && Number(mAfter.rev) === Number(metaBefore.rev) + 1 && mAfter.doc_ts === await W.anchor(),
    { kind: r.kind, ids, rev: [metaBefore.rev, mAfter.rev] });
  ok('13c. the device\'s rebuilt document equals the whole one', firstDiff(r.doc, await wholeNow(W.tok.owner)) === '', firstDiff(r.doc, await wholeNow(W.tok.owner)));

  // Same stamp again, this time entries removed (the release dropping purged rows): gone ids, no failed comparison.
  const doc2 = JSON.parse(JSON.stringify(stAfter.doc));
  doc2.customRecords.sales_tickets = doc2.customRecords.sales_tickets.filter(x => x.id !== 'st-wtc-21' && x.id !== 'st-wtc-22');
  await writeEdgeKvDoc(W.d1, DOC_KEY, JSON.stringify(doc2), st.ts, 'seed-export');
  const r2 = await dev.read();
  const m2 = W.meta();
  ok('13d. entries removed under the same stamp arrive as gone ids; nothing is reported as a failed comparison and partial answers stay on',
    r2.kind === 'partial' && !r2.refetched && sameList(deltaIds(r2.delta).gone, ['sales_tickets/st-wtc-21', 'sales_tickets/st-wtc-22']) && Number(m2.audit_bad) === 0 && dev.g.report() === null && dev.g.strikes() === 0
      && firstDiff(r2.doc, await wholeNow(W.tok.owner)) === '', { kind: r2.kind, ids: deltaIds(r2.delta), m2 });

  // A save after such a rewrite (again of the same length): the save does not take the stale index for current.
  const doc3 = JSON.parse(JSON.stringify(doc2));
  doc3.customRecords.sales_tickets.find(x => x.id === 'st-wtc-23').total = 321;
  await writeEdgeKvDoc(W.d1, DOC_KEY, JSON.stringify(doc3), st.ts, 'seed-export');
  const p = await W.legacy.patch({ customRecords: { sales_tickets: [{ id: 'st-wtc-after-rewrite', company: 'WTC', date: '2026-11-27', customer: 'ZzAfter', total: 8, source: 'app' }] } });
  const r3 = await dev.read();
  const ids3 = deltaIds(r3.delta);
  ok('13e. a save that follows a same-stamp rewrite leaves the index behind, and the next read hands out both the rewritten entry and the saved one',
    p.status === 200 && !p.json.conflict && r3.kind === 'partial' && !r3.refetched && ids3.rows.includes('sales_tickets/st-wtc-23') && ids3.rows.includes('sales_tickets/st-wtc-after-rewrite')
      && firstDiff(r3.doc, await wholeNow(W.tok.owner)) === '', { kind: r3.kind, ids3 });

  // A seat that chooses its own stamp cannot make a stale index look current: a direct write leaves the index behind
  // at stamp T1; a save then asks for a stamp the index once carried.
  const stA = await W.stored();
  const mA = W.meta();
  const oldStamp = mA.doc_ts.split('|')[0];
  const docA = JSON.parse(JSON.stringify(stA.doc));
  docA.customRecords.sales_tickets.find(x => x.id === 'st-wtc-24').total = 2424242;
  const tsDirect = nextTs();
  docA.updatedAt = tsDirect;
  await writeEdgeKvDoc(W.d1, DOC_KEY, JSON.stringify(docA), tsDirect, 'system-reconcile');
  const pA = await W.api('sync', { token: W.tok.owner, body: { op: 'patch', key: '', ackOnly: true, ifMatchUpdatedAt: tsDirect,
    patch: { [DOC_KEY]: { _deltaPatch: 1, minShellVer: SHELL, updatedAt: oldStamp, updatedBy: 'gate@example.test', lbpFxRate: 90600, lbpFxUpdatedAt: nextTs() } } } });
  const stB = await W.stored();
  const r4 = await dev.read();
  ok('13f. a save that puts an earlier stamp back on the store does not make the stale index pass for current',
    pA.status === 200 && !pA.json.conflict && stB.ts === oldStamp && (r4.kind === 'partial' || r4.kind === 'audit') && !r4.refetched && deltaIds(r4.delta).rows.includes('sales_tickets/st-wtc-24')
      && firstDiff(r4.doc, await wholeNow(W.tok.owner)) === '' && W.meta().doc_ts === await W.anchor(), { p: pA.json, ts: stB.ts, oldStamp, kind: r4.kind, ids: deltaIds(r4.delta) });
}

console.log('\n[14. What decides who sees an entry is on the index line, and the rule reads nothing else]');
{
  // The scoping rule answers the same for an entry and for the fields kept on its index line. Every other field is
  // set to a company the seat CAN see, so a rule that starts reading one of them fails here.
  const seats = [
    { sub: 'u7', email: 'a@example.test', role: 'Entry', companies: 'WTC' },
    { sub: 'u8', email: 'b@example.test', role: 'Entry', companies: 'BBConstruction' },
    { sub: 'u9', email: 'c@example.test', role: 'Supervisor', companies: 'WTC,Lions Transport' },
    { sub: 'u10', email: 'd@example.test', role: 'Entry', companies: 'Blanca' },
    { sub: 'u11', email: 'e@example.test', role: 'Entry', companies: 'Bdeir Holding' }
  ];
  const cos = ['', 'WTC', 'BBConstruction', 'Lions Transport', 'Blanca', 'Bdeir Holding', 'All', 'shared', ' wtc ', 'BBC'];
  const inds = ['', 'Manufacturing', 'Hospitality & Resorts', 'Holding & Treasury'];
  const tables = ['sales_tickets', 'expenses', 'attendance', 'receipts', 'customers', 'suppliers', 'sites', 'regions', 'equipment', 'fx_rates', 'vat_rates', 'zz_unknown_table'];
  const decoy = seat => {
    const mine = String(seat.companies).split(',')[0];
    return { id: 'zz-1', fromCo: mine, toCo: mine, site: mine, region: mine, branch: mine, owner: mine, customer: mine, supplier: mine, party: mine, staff: mine, name: mine, notes: mine, created_by: seat.email, entered_by: seat.email };
  };
  let cases = 0;
  const differ = [];
  for (const seat of seats) {
    for (const t of tables) {
      for (const f of ['company', 'resort', 'entity']) {
        for (const co of cos) {
          for (const indF of ['_industry', 'industry', 'ind']) {
            for (const ind of inds) {
              const row = Object.assign(decoy(seat), co ? { [f]: co } : {}, ind ? { [indF]: ind } : {});
              const stubText = visStubOf(row);
              const stub = JSON.parse(stubText);
              cases += 1;
              if (scopedSeatSeesCrRow(seat, t, row) !== scopedSeatSeesCrRow(seat, t, stub)) differ.push(`${seat.companies}|${t}|${stubText}`);
              if (scopedSeatSeesKioskPunch(seat, row) !== scopedSeatSeesKioskPunch(seat, stub)) differ.push(`kp|${seat.companies}|${stubText}`);
            }
          }
        }
      }
    }
  }
  ok(`14a. the scoping rule gives the same answer for an entry and for the fields kept on its index line (${cases} cases, decoy fields set to the seat's own company)`,
    cases > 5000 && differ.length === 0, differ.slice(0, 5));
  const stubKeys = Object.keys(JSON.parse(visStubOf(Object.assign({ id: 'x', total: 5, notes: 'n', customer: 'ZzCust' }, Object.fromEntries(ROW_VIS_FIELDS.map(f => [f, 'v']))))));
  ok('14b. the index line keeps those fields and nothing else of the entry (no amounts, names or notes)',
    sameList(stubKeys.sort(), ROW_VIS_FIELDS.slice().sort()) && visStubOf({ id: 'x', company: 'Z'.repeat(500) }) === '*', stubKeys);
  const lines = W.d1.rows("SELECT bucket, row_id, vis, pvis, vrev, deleted FROM store_row_index WHERE row_id IN ('st-wtc-9', 'st-wtc-11', 'st-wtc-12', 'st-bbc-7')");
  const by = Object.fromEntries(lines.map(l => [l.row_id, l]));
  ok('14c. the index remembers an entry\'s earlier company when it moves, and a deleted entry\'s last one',
    by['st-wtc-11'] && JSON.parse(by['st-wtc-11'].vis).company === 'BBConstruction' && by['st-wtc-11'].pvis.includes('"WTC"')
      && by['st-wtc-9'] && JSON.parse(by['st-wtc-9'].vis).company === 'WTC' && by['st-wtc-9'].pvis.includes('"BBConstruction"')
      && by['st-wtc-12'] && Number(by['st-wtc-12'].deleted) === 1 && JSON.parse(by['st-wtc-12'].vis).company === 'WTC'
      && by['st-bbc-7'] && Number(by['st-bbc-7'].deleted) === 1 && JSON.parse(by['st-bbc-7'].vis).company === 'BBConstruction', lines);

  // Universal tables (customers, sites): a shared entry is every seat's, a company's own is that company's.
  const wtc2 = new Device(W, W.tok.wtc, 'wtc-universal');
  const bbc2 = new Device(W, W.tok.bbc, 'bbc-universal');
  await W.legacy.patch({ customRecords: { customers: [
    { id: 'cu-shared', name: 'ZzShared Customer', source: 'app' },
    { id: 'cu-wtc', name: 'ZzWtc Customer', company: 'WTC', source: 'app' },
    { id: 'cu-bbc', name: 'ZzBbc Customer BBC-ONLY-MARKER', company: 'BBConstruction', source: 'app' }
  ] } });
  await wtc2.read();
  await bbc2.read();
  await W.legacy.patch({ _deletedCrIds: { customers: ['cu-shared', 'cu-wtc', 'cu-bbc'] } });
  const rw = await wtc2.read();
  const rb = await bbc2.read();
  ok('14d. deleted shared and own-company customers are reported gone to each seat that could see them, and only to it',
    rw.kind === 'partial' && sameList(deltaIds(rw.delta).gone, ['customers/cu-shared', 'customers/cu-wtc']) && !rw.txt.includes('cu-bbc')
      && rb.kind === 'partial' && sameList(deltaIds(rb.delta).gone, ['customers/cu-bbc', 'customers/cu-shared']) && !rb.txt.includes('cu-wtc')
      && firstDiff(rw.doc, await wholeNow(W.tok.wtc)) === '' && firstDiff(rb.doc, await wholeNow(W.tok.bbc)) === '', { w: deltaIds(rw.delta), b: deltaIds(rb.delta) });
}

console.log('\n[15. Attendance entries the device tells apart by their edit history]');
{
  const backfill = { at: '2026-11-24T13:25:10.000Z', by: 'System', changes: { shift_id: { from: 'a', to: 'b' } } };
  const later = { at: '2026-11-26T10:00:00.000Z', by: 'Owner Seat', changes: { out_time: { from: '16:00', to: '17:00' } } };
  const st = await W.stored();
  const doc = JSON.parse(JSON.stringify(st.doc));
  doc.customRecords.attendance = (doc.customRecords.attendance || []).concat([
    // Real: a backfill line and a later one, no entered_by / modified_at. Bare, the device's test would call it bloated.
    { id: 'at_0000000000b1', company: 'WTC', date: '2026-10-06', staff: 'ZzStaff Three', _pre_void_edits: [backfill, later] },
    // Real and safe to lighten: it carries entered_by, so the test answers the same with or without history.
    { id: 'at_0000000000b2', company: 'WTC', date: '2026-10-06', staff: 'ZzStaff Four', entered_by: 'owner@example.test', _pre_void_edits: [backfill, later] },
    // Not a seeded id at all.
    { id: 'at-app-2', company: 'WTC', date: '2026-10-06', staff: 'ZzStaff Five', source: 'app', _pre_void_edits: [later] }
  ]);
  doc.updatedAt = nextTs();
  const seeded = await W.buildTicketPatch(doc);
  const r = await new Device(W, W.tok.owner, 'owner-att').read();
  const att = id => r.doc.customRecords.attendance.find(x => x.id === id);
  const storedAtt = (await W.stored()).doc.customRecords.attendance;
  ok('15a. an entry the device would misjudge without its history travels with it',
    seeded.status === 200 && att('at_0000000000b1') && Array.isArray(att('at_0000000000b1')._pre_void_edits) && att('at_0000000000b1')._pre_void_edits.length === 2, att('at_0000000000b1'));
  ok('15b. entries whose verdict does not depend on the history still travel without it',
    att('at_0000000000b2') && att('at_0000000000b2')._pre_void_edits === undefined && att('at-app-2') && att('at-app-2')._pre_void_edits === undefined, { b2: att('at_0000000000b2'), app: att('at-app-2') });
  const verdicts = storedAtt.map(x => [x.id, isShiftBackfillBloatedSeedAttRow(x), att(x.id) ? isShiftBackfillBloatedSeedAttRow(att(x.id)) : null]);
  const b1 = verdicts.find(v => v[0] === 'at_0000000000b1');
  ok('15c. for every stored attendance entry the device\'s verdict on what it received equals the verdict on the stored entry (the real one stays real)',
    verdicts.length >= 3 && verdicts.every(v => v[1] === v[2]) && Boolean(b1) && b1[1] === false && b1[2] === false, verdicts);
}

console.log('\n[16. A database restore: the cloud back at an earlier state]');
{
  const dev = new Device(W, W.tok.owner, 'owner-restore');
  await dev.read();
  // Snapshot the store and the index, as a point-in-time restore would bring them back.
  W.d1.exec("DROP TABLE IF EXISTS zz_kv; DROP TABLE IF EXISTS zz_idx; DROP TABLE IF EXISTS zz_meta;");
  W.d1.exec("CREATE TABLE zz_kv AS SELECT * FROM edge_kv_store WHERE doc_key = 'mfg_web_store' OR doc_key LIKE 'mfg_web_store__part_%'; CREATE TABLE zz_idx AS SELECT * FROM store_row_index; CREATE TABLE zz_meta AS SELECT * FROM store_row_meta;");
  await W.legacy.patch({ customRecords: { sales_tickets: [{ id: 'st-wtc-lost-timeline', company: 'WTC', date: '2026-11-27', customer: 'ZzLost', total: 1, source: 'app' }] } });
  const rLost = await dev.read();
  const revLost = dev.g.mirror().rev;
  const epochLost = dev.g.mirror().epoch;
  W.d1.exec("DELETE FROM edge_kv_store WHERE doc_key = 'mfg_web_store' OR doc_key LIKE 'mfg_web_store__part_%'; INSERT INTO edge_kv_store SELECT * FROM zz_kv; DELETE FROM store_row_index; INSERT INTO store_row_index SELECT * FROM zz_idx; DELETE FROM store_row_meta; INSERT INTO store_row_meta SELECT * FROM zz_meta;");
  // The new timeline: another entry, at the revision number the lost one had.
  await W.legacy.patch({ customRecords: { sales_tickets: [{ id: 'st-wtc-new-timeline', company: 'WTC', date: '2026-11-27', customer: 'ZzNew', total: 2, source: 'app' }] } });
  const mNew = W.meta();
  const r = await dev.read();
  const has = id => r.doc.customRecords.sales_tickets.some(x => x.id === id);
  ok('16a. the device held an entry from the lost timeline at a revision the new timeline reached again',
    (rLost.kind === 'partial' || rLost.kind === 'audit') && Number(mNew.rev) === revLost && mNew.epoch === epochLost, { kind: rLost.kind, revLost, mNew });
  ok('16b. its copy fails the digest check on the next answer and it reads the whole document: no entry of the lost timeline is kept, the new one is there',
    r.refetched === true && r.kind === 'whole' && !has('st-wtc-lost-timeline') && has('st-wtc-new-timeline') && firstDiff(r.doc, await wholeNow(W.tok.owner)) === '' && dev.g.strikes() === 1,
    { refetched: r.refetched, kind: r.kind, lost: has('st-wtc-lost-timeline'), fresh: has('st-wtc-new-timeline'), strikes: dev.g.strikes() });
  // The copy that could not follow is told to the cloud as that, not as a failed comparison: it is noted, the kill
  // switch stays untouched and the device carries on with partial answers from its fresh copy.
  await W.legacy.patch({ lbpFxRate: 90650, lbpFxUpdatedAt: nextTs() });
  const rNext = await dev.read();
  const m16 = W.meta();
  ok('16c. that failure is noted by the cloud (kind "apply") and not counted as a failed comparison: partial answers stay on for every device',
    Number(m16.audit_bad) === 0 && /"kind":"apply"/.test(String(m16.audit_note)) && /apply sums/.test(String(m16.audit_note)) && r.json.rowSyncV1 === true && rNext.kind === 'partial' && dev.g.report() === null,
    { m16, kind: rNext.kind });
  W.d1.db.prepare("UPDATE store_row_meta SET audit_note = NULL WHERE doc_key = 'mfg_web_store'").run();
  W.d1.exec("DROP TABLE zz_kv; DROP TABLE zz_idx; DROP TABLE zz_meta;");
}

console.log('\n[17. Scoped seats and the comparison; repeated ids; the mode values; a page that cannot follow]');
{
  // A company-scoped seat is never asked to compare, and whatever it reports changes nothing.
  const sc = new Device(W, W.tok.wtc, 'wtc-audit');
  const first = await sc.read();
  const before = W.meta();
  for (let i = 0; i < ROW_SYNC_AUDIT_AFTER + 2; i++) {
    await W.legacy.patch({ customRecords: { sales_tickets: [{ id: `st-wtc-sc-${i}`, company: 'WTC', date: '2026-11-27', customer: 'ZzSc', total: i, source: 'app' }] } });
    await sc.read();
  }
  const kinds = [];
  const forged = async result => (await W.api('sync', { token: W.tok.wtc, body: { op: 'get_mfg', doc: DOC_KEY, noTrails: true, rowSync: { v: 1, auditResult: result } } })).json;
  const fOk = [];
  for (let i = 0; i < ROW_SYNC_AUDIT_TARGET + 5; i++) fOk.push((await forged({ epoch: before.epoch, rev: 1, ok: true, rows: 9, bad: 0, sample: '' })).rowAuditNoted);
  const fBad = await forged({ epoch: before.epoch, rev: 1, ok: false, rows: 0, bad: 1, sample: 'forged' });
  const askAudit = (await W.api('sync', { token: W.tok.wtc, body: { op: 'get_mfg', doc: DOC_KEY, noTrails: true, rowSync: Object.assign(RowSyncClient.request(sc.g.mirror(), { audit: true }), {}) } })).json;
  const after = W.meta();
  await W.legacy.patch({ lbpFxRate: 90700, lbpFxUpdatedAt: nextTs() });
  const still = await sc.read();
  ok('17a. a company-scoped seat is never asked for a comparison', first.json.rowSync.auditAfter === 0 && still.json.rowSync.auditAfter === 0 && sc.g.report() === null, { a: first.json.rowSync.auditAfter });
  ok('17b. its reports, clean or failed, are acknowledged and counted nowhere: the counters stand and partial answers go on for everyone',
    fOk.every(x => x === true) && fBad.rowAuditNoted === true && Number(after.audit_ok) === Number(before.audit_ok) && Number(after.audit_bad) === 0 && still.kind === 'partial',
    { before: [before.audit_ok, before.audit_bad], after: [after.audit_ok, after.audit_bad], kind: still.kind });
  ok('17c. asking for the whole document beside a partial answer is a whole-store seat\'s to ask: the scoped seat gets the partial answer alone',
    Boolean(askAudit.rowDelta) && askAudit.docs === undefined, Object.keys(askAudit));

  // A repeated id in a row set: a copy keyed by id cannot stand for that document.
  const stD = await W.stored();
  const docD = JSON.parse(JSON.stringify(stD.doc));
  docD.customRecords.sales_tickets.push(Object.assign({}, docD.customRecords.sales_tickets.find(x => x.id === 'st-wtc-30'), { total: 303030 }));
  const tsD = nextTs();
  docD.updatedAt = tsD;
  await writeEdgeKvDoc(W.d1, DOC_KEY, JSON.stringify(docD), tsD, 'system-reconcile');
  const dup = new Device(W, W.tok.owner, 'owner-dup');
  const rD = await dup.read();
  const rOwnerD = await owner.read();
  ok('17d. a document holding a repeated id gets whole answers and no anchor: no device keeps a copy of it',
    rD.kind === 'whole' && rD.json.rowSyncV1 === undefined && !dup.g.mirror() && rD.doc.customRecords.sales_tickets.filter(x => x.id === 'st-wtc-30').length === 2
      && rOwnerD.kind === 'whole' && !owner.g.mirror(), { kind: rD.kind, rs: rD.json.rowSyncV1, ownerKind: rOwnerD.kind });
  docD.customRecords.sales_tickets.pop();
  const tsD2 = nextTs();
  docD.updatedAt = tsD2;
  await writeEdgeKvDoc(W.d1, DOC_KEY, JSON.stringify(docD), tsD2, 'system-reconcile');
  const rD2 = await dup.read();
  ok('17e. once the repeated id is gone the anchor is offered again', rD2.kind === 'whole' && rD2.json.rowSyncV1 === true && Boolean(dup.g.mirror()), { kind: rD2.kind });

  // The mode values.
  const modeDev = new Device(W, W.tok.owner, 'owner-mode');
  const setMode = n => W.d1.db.prepare("UPDATE store_row_meta SET mode = ? WHERE doc_key = 'mfg_web_store'").run(n);
  const trailOf = r => (r.doc.customRecords.expenses.find(x => x.id === 'ex-live-trail') || {})._pre_void_edits;
  setMode(1);
  const m1 = await modeDev.read();
  setMode(3);
  const m3a = await modeDev.read();
  await W.legacy.patch({ lbpFxRate: 90800, lbpFxUpdatedAt: nextTs() });
  const m3b = await modeDev.read();
  const m3bDiff = firstDiff(m3b.doc, await wholeNow(W.tok.owner));
  setMode(0);
  const m0 = await modeDev.read();
  const legacyMode0 = await W.legacy.read();
  setMode(2);
  // A copy made while history was left out is not patched once history travels again (and the other way round):
  // the whole document, and nothing counted against the page or the cloud.
  const flip = new Device(W, W.tok.owner, 'owner-flip');
  await flip.read();
  setMode(3);
  await W.legacy.patch({ lbpFxRate: 90850, lbpFxUpdatedAt: nextTs() });
  const f3 = await flip.read();
  setMode(2);
  await W.legacy.patch({ lbpFxRate: 90860, lbpFxUpdatedAt: nextTs() });
  const f2 = await flip.read();
  await W.legacy.patch({ lbpFxRate: 90870, lbpFxUpdatedAt: nextTs() });
  const f2b = await flip.read();
  ok('17h2. switching the lighter entries on or off sends every device the whole document once (its copy was made under the other rule), with no failed comparison',
    f3.kind === 'whole' && !f3.refetched && Array.isArray(trailOf(f3)) && f2.kind === 'whole' && !f2.refetched && trailOf(f2) === undefined && f2b.kind !== 'whole'
      && flip.g.strikes() === 0 && flip.g.report() === null && Number(W.meta().audit_bad) === 0, { f3: f3.kind, f2: f2.kind, f2b: f2b.kind, strikes: flip.g.strikes() });
  ok('17f. mode 1: lighter entries only (whole documents, live entries without history)', m1.kind === 'whole' && m1.json.rowSyncV1 === undefined && m1.json.trailsOnDemand === true && trailOf(m1) === undefined, { kind: m1.kind, t: m1.json.trailsOnDemand });
  ok('17g. mode 3: partial answers only (history travels as before)',
    m3a.kind === 'whole' && m3a.json.rowSyncV1 === true && m3a.json.trailsOnDemand === undefined && Array.isArray(trailOf(m3a)) && m3b.kind === 'partial' && m3bDiff === '' && Array.isArray(trailOf(m3b)),
    { a: m3a.kind, b: m3b.kind, t: m3a.json.trailsOnDemand, m3bDiff });
  ok('17h. mode 0: everything off (whole documents with history, the same entries an older device gets)',
    m0.kind === 'whole' && m0.json.rowSyncV1 === undefined && m0.json.trailsOnDemand === undefined && Array.isArray(trailOf(m0))
      && JSON.stringify(m0.doc.customRecords) === JSON.stringify(legacyMode0.docs[DOC_KEY].customRecords), { kind: m0.kind, t: m0.json.trailsOnDemand });

  // A page whose copy cannot follow the cloud twice stops asking for partial answers.
  const bad = new Device(W, W.tok.wtc, 'wtc-strikes');
  await bad.read();
  const breakCopy = () => { const s = bad.g.mirror().sets.get('cr:sales_tickets'); s.delete(Array.from(s.keys())[0]); };
  breakCopy();
  await W.legacy.patch({ lbpFxRate: 90900, lbpFxUpdatedAt: nextTs() });
  const s1 = await bad.read();
  breakCopy();
  await W.legacy.patch({ lbpFxRate: 91000, lbpFxUpdatedAt: nextTs() });
  const s2 = await bad.read();
  const s2Diff = firstDiff(s2.doc, await wholeNow(W.tok.wtc));
  await W.legacy.patch({ lbpFxRate: 91100, lbpFxUpdatedAt: nextTs() });
  const s3 = await bad.read();
  await W.legacy.patch({ lbpFxRate: 91200, lbpFxUpdatedAt: nextTs() });
  const s4 = await bad.read();
  ok('17i. a copy that cannot follow an answer is dropped and the whole document read, each time',
    s1.refetched === true && s2.refetched === true && s2Diff === '' && bad.g.strikes() === 2, { s1: s1.refetched, s2: s2.refetched, s2Diff, strikes: bad.g.strikes() });
  ok('17j. after the second time the page keeps no copy and asks for whole documents only; a scoped seat\'s failures switch nothing off for others',
    !bad.g.mirror() && s4.kind === 'whole' && s4.req.rowSync === undefined && s4.req.noTrails === true && s4.json.rowSyncV1 === undefined && Number(W.meta().audit_bad) === 0
      && firstDiff(s4.doc, await wholeNow(W.tok.wtc)) === '', { kind: s4.kind, req: s4.req.rowSync, bad: W.meta().audit_bad });

  // The digest the device checks is the one the cloud computes: same function, same text.
  const probe = ['', 'a', '{"id":"x","n":1.5,"s":"éم😀"}', 'x'.repeat(70000)];
  ok('17k. the device and the cloud hash a text to the same pair', probe.every(t => sameList(RowSyncClient.hashPair(t), hashPair(t))), probe.map(t => [RowSyncClient.hashPair(t), hashPair(t)]).slice(0, 2));

  // A top-level part that does not hash to what the cloud says it hashes to is refused.
  const tp = new Device(W, W.tok.owner, 'owner-top');
  await tp.read();
  await W.legacy.patch({ lbpFxRate: 91300, lbpFxUpdatedAt: nextTs() });
  const rawTop = (await W.api('sync', { token: W.tok.owner, body: { op: 'get_mfg', doc: DOC_KEY, noTrails: true, rowSync: RowSyncClient.request(tp.g.mirror(), {}) } })).json;
  const goodCopy = RowSyncClient.seed(RowSyncClient.toDoc(tp.g.mirror()), Object.assign({}, rawTop.rowSync, { rev: tp.g.mirror().rev, sums: tp.last.json.rowSync.sums, topEtags: tp.g.mirror().topEtags }), 'owner-top', Date.now());
  const bent = JSON.parse(JSON.stringify(rawTop.rowDelta));
  bent.top.lbpFxRate = 1;
  const resBent = goodCopy ? RowSyncClient.apply(goodCopy, bent, rawTop.rowSync) : null;
  const resTrue = RowSyncClient.apply(tp.g.mirror(), rawTop.rowDelta, rawTop.rowSync);
  ok('17k2. a top-level part altered on the way is refused by the device; the unaltered answer is accepted',
    Boolean(rawTop.rowDelta) && rawTop.rowDelta.top.lbpFxRate === 91300 && resBent && resBent.ok === false && resBent.reason === 'top' && resTrue && resTrue.ok === true, { resBent, resTrue });

  // More than the limit changed, all of it another company's: the scoped seat's answer must not show it.
  const sc2 = new Device(W, W.tok.wtc, 'wtc-volume');
  const own2 = new Device(W, W.tok.owner, 'owner-volume');
  await sc2.read();
  await own2.read();
  const stV = await W.stored();
  const docV = JSON.parse(JSON.stringify(stV.doc));
  for (let i = 0; i < ROW_SYNC_MAX_DELTA_ROWS + 60; i++) docV.customRecords.sales_tickets.push({ id: `st-bbc-vol-${i}`, company: 'BBConstruction', date: '2026-11-27', customer: 'ZzVol', total: i, notes: 'BBC-ONLY-MARKER', source: 'app' });
  const tsV = nextTs();
  docV.updatedAt = tsV;
  await writeEdgeKvDoc(W.d1, DOC_KEY, JSON.stringify(docV), tsV, 'system-reconcile');
  const rScV = await sc2.read();
  const rOwnV = await own2.read();
  ok('17m. when more entries than the limit changed and none is the scoped seat\'s, it gets an ordinary partial answer with nothing in it; a whole-store seat gets the whole document',
    rScV.kind === 'partial' && !rScV.refetched && deltaIds(rScV.delta).rows.length === 0 && deltaIds(rScV.delta).gone.length === 0 && !rScV.txt.includes('st-bbc-vol-') && !rScV.txt.includes('BBC-ONLY-MARKER')
      && rOwnV.kind === 'whole' && firstDiff(rScV.doc, await wholeNow(W.tok.wtc)) === '', { sc: rScV.kind, own: rOwnV.kind, ids: deltaIds(rScV.delta) });
  docV.customRecords.sales_tickets = docV.customRecords.sales_tickets.filter(x => !String(x.id).startsWith('st-bbc-vol-'));
  const tsV2 = nextTs();
  docV.updatedAt = tsV2;
  await writeEdgeKvDoc(W.d1, DOC_KEY, JSON.stringify(docV), tsV2, 'system-reconcile');

  // The limit applied to what the scoped seat is itself sent: exactly the limit of its own entries is still a
  // partial answer, one more is the whole document.
  const scCap = new Device(W, W.tok.wtc, 'wtc-cap');
  await scCap.read();
  const addOwn = async (tag, n) => {
    const stC = await W.stored();
    const docC = JSON.parse(JSON.stringify(stC.doc));
    for (let i = 0; i < n; i++) docC.customRecords.sales_tickets.push({ id: `st-wtc-${tag}-${i}`, company: 'WTC', date: '2026-11-27', customer: 'ZzCap', total: i, source: 'app' });
    const tsC = nextTs();
    docC.updatedAt = tsC;
    await writeEdgeKvDoc(W.d1, DOC_KEY, JSON.stringify(docC), tsC, 'system-reconcile');
  };
  await addOwn('capa', ROW_SYNC_MAX_DELTA_ROWS);
  const rAt = await scCap.read();
  await addOwn('capb', ROW_SYNC_MAX_DELTA_ROWS + 1);
  const rOver = await scCap.read();
  ok('17m2. a scoped seat with exactly the limit of its own entries changed gets them as a partial answer; with one more it gets the whole document and no partial answer',
    rAt.kind === 'partial' && !rAt.refetched && deltaIds(rAt.delta).rows.length === ROW_SYNC_MAX_DELTA_ROWS && rAt.delta.size === ROW_SYNC_MAX_DELTA_ROWS
      && rOver.kind === 'whole' && !rOver.refetched && rOver.delta === null && rOver.json.rowSyncV1 === true && firstDiff(rOver.doc, await wholeNow(W.tok.wtc)) === '',
    { at: rAt.kind, atRows: deltaIds(rAt.delta).rows.length, atSize: rAt.delta && rAt.delta.size, over: rOver.kind, overDelta: rOver.delta === null });
  {
    const stC = await W.stored();
    const docC = JSON.parse(JSON.stringify(stC.doc));
    docC.customRecords.sales_tickets = docC.customRecords.sales_tickets.filter(x => !/^st-wtc-cap[ab]-/.test(String(x.id)));
    const tsC = nextTs();
    docC.updatedAt = tsC;
    await writeEdgeKvDoc(W.d1, DOC_KEY, JSON.stringify(docC), tsC, 'system-reconcile');
  }

  // A table key with a line break in it is indexed under its own name.
  const stN = await W.stored();
  const docN = JSON.parse(JSON.stringify(stN.doc));
  docN.customRecords['zz\nodd'] = [{ id: 'odd-1', company: 'WTC', note: 'first' }];
  const tsN = nextTs();
  docN.updatedAt = tsN;
  await writeEdgeKvDoc(W.d1, DOC_KEY, JSON.stringify(docN), tsN, 'system-reconcile');
  const nd = new Device(W, W.tok.owner, 'owner-odd');
  await nd.read();
  docN.customRecords['zz\nodd'][0].note = 'second';
  const tsN2 = nextTs();
  docN.updatedAt = tsN2;
  await writeEdgeKvDoc(W.d1, DOC_KEY, JSON.stringify(docN), tsN2, 'system-reconcile');
  const rN = await nd.read();
  ok('17l. a table key holding a line break is indexed under its own name and its change arrives as a changed entry',
    rN.kind === 'partial' && sameList(deltaIds(rN.delta).rows, ['zz\nodd/odd-1']) && firstDiff(rN.doc, await wholeNow(W.tok.owner)) === '', deltaIds(rN.delta));
  delete docN.customRecords['zz\nodd'];
  const tsN3 = nextTs();
  docN.updatedAt = tsN3;
  await writeEdgeKvDoc(W.d1, DOC_KEY, JSON.stringify(docN), tsN3, 'system-reconcile');
}

console.log('\n[18. The clean-up of old deleted-entry lines]');
{
  // Its own store: the revision counter is moved by hand to where the clean-up starts (5,000 revisions kept).
  const P = await makeWorld();
  const docP = seedDoc();
  docP.customRecords.sales_tickets = docP.customRecords.sales_tickets.slice(0, 12);
  await P.buildTicketPatch(docP);
  const early = new Device(P, P.tok.owner, 'owner-early');
  const dev = new Device(P, P.tok.owner, 'owner-floor');
  await early.read();
  await dev.read();
  await P.legacy.patch({ _deletedCrIds: { sales_tickets: ['st-wtc-1'] } });
  await dev.read();
  const lineOf = id => P.d1.one("SELECT rev, deleted FROM store_row_index WHERE bucket = 'cr:sales_tickets' AND row_id = ?", id);
  const oldLine = lineOf('st-wtc-1');
  P.d1.db.prepare("UPDATE store_row_meta SET rev = 5098 WHERE doc_key = 'mfg_web_store'").run();
  const rJump = await dev.read();
  await P.legacy.patch({ _deletedCrIds: { sales_tickets: ['st-wtc-2'] } });
  const m5099 = P.meta();
  const stillThere = lineOf('st-wtc-1');
  await P.legacy.patch({ customRecords: { sales_tickets: [{ id: 'st-wtc-p-1', company: 'WTC', date: '2026-11-27', customer: 'ZzPrune', total: 1, source: 'app' }] } });
  const m5100 = P.meta();
  const afterPrune = lineOf('st-wtc-1');
  const justAbove = lineOf('st-wtc-2');
  ok('18a. a save landing on a revision that is not a hundredth leaves old deleted-entry lines and the floor alone',
    oldLine && Number(oldLine.deleted) === 1 && Number(oldLine.rev) < 100 && Number(m5099.rev) === 5099 && Number(m5099.floor_rev) === 0 && Boolean(stillThere), { oldLine, m5099, stillThere });
  ok('18b. the save landing on revision 5,100 removes deleted-entry lines below revision 100 and moves the floor to 100; a deletion above the floor keeps its line',
    Number(m5100.rev) === 5100 && Number(m5100.floor_rev) === 100 && !afterPrune && justAbove && Number(justAbove.deleted) === 1 && Number(justAbove.rev) === 5099, { m5100, afterPrune, justAbove });
  await P.legacy.patch({ customRecords: { sales_tickets: [{ id: 'st-wtc-p-2', company: 'WTC', date: '2026-11-27', customer: 'ZzPrune', total: 2, source: 'app' }] } });
  const m5101 = P.meta();
  ok('18c. the next save (5,101) leaves the floor and the remaining lines alone', Number(m5101.rev) === 5101 && Number(m5101.floor_rev) === 100 && Boolean(lineOf('st-wtc-2')), { m5101 });
  const r = await dev.read();
  const ids = deltaIds(r.delta);
  ok('18d. a device at a revision above the floor is still sent the deletion made just above it, as a partial answer',
    rJump.kind === 'partial' && r.kind === 'partial' && !r.refetched && sameList(ids.gone, ['sales_tickets/st-wtc-2']) && sameList(ids.rows, ['sales_tickets/st-wtc-p-1', 'sales_tickets/st-wtc-p-2'])
      && firstDiff(r.doc, (await P.api('sync', { token: P.tok.owner, body: { op: 'get_mfg', doc: DOC_KEY, noTrails: true, rowSync: { v: 1 } } })).json.docs[DOC_KEY]) === '', { jump: rJump.kind, kind: r.kind, ids });
  const rEarly = await early.read();
  ok('18e. a device whose revision is under the floor gets the whole document', rEarly.kind === 'whole' && !rEarly.refetched && !rEarly.doc.customRecords.sales_tickets.some(x => x.id === 'st-wtc-1' || x.id === 'st-wtc-2'), { kind: rEarly.kind });
}

console.log('\n[12. The index at the end]');
{
  await owner.read();
  const st = await W.stored();
  const m = W.meta();
  const distinct = Array.from(collectRowMaps(st.doc).values()).reduce((n, mm) => n + mm.size, 0);
  ok('12a. stamps together and one live line per stored entry after everything above',
    m.doc_ts === await W.anchor() && W.idxLive().length === distinct, { doc_ts: m.doc_ts, ts: st.ts, live: W.idxLive().length, distinct });
  const legacyAfter = await W.legacy.read();
  ok('12b. an old-protocol read still carries exactly the old fields', sameList(Object.keys(legacyAfter).sort(), ['deltaSyncV1', 'docs', 'edge', 'etag', 'ok', 'updatedAt']), Object.keys(legacyAfter));
}

console.log(`\nSummary: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
