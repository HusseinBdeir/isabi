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
//   5. A company-scoped seat never receives another company's entry in a partial answer, loses an entry that leaves
//      its scope, and starts again from the whole document when its scope changes.
//   6. Bounds: wrong epoch, a revision ahead of the cloud or under the floor, too many changes, a read that fell
//      inside a save: the whole document, never a wrong partial answer.
//   7. "Someone saved before you" comes back as changed entries.
//   8. The comparison the cloud asks for: clean ones are counted, one failed comparison switches partial answers off
//      until the counter is reset; `mode` 0 does the same.
//   9. Edit history: a live entry travels without it, a voided one with it; a device that never held the history
//      saves an entry and the stored history is exactly what an older device would have left (twin stores compared).
// Uses in-memory node:sqlite (Node 22.5+). Touches nothing live.
// Run: node build/verify_row_sync_edge.mjs

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { onRequest } from '../functions/app/api/[[route]].js';
import { signEdgeSession } from '../functions/_lib/security.js';
import { effectiveMinSyncShellVer, handleSync, readEdgeKvDoc, writeEdgeKvDoc } from '../functions/_lib/d1_store.js';
import { DEPLOYED_SHELL_VER } from '../functions/_lib/deployed_shell.js';
import { ROW_SYNC_AUDIT_AFTER, ROW_SYNC_MAX_DELTA_ROWS, collectRowMaps } from '../functions/_lib/row_sync.js';

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
    let _rowMirror = null;
    let _rowAuditReport = null;
    let _cloudTrailsOnDemand = false;
    ${GLUE_SRC}
    return {
      attach: attachRowSyncRequest,
      settle: settleRowSyncAnswer,
      mirror: () => _rowMirror,
      report: () => _rowAuditReport,
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
  return { d1, env, tok, api, buildTicketPatch, stored, meta, idxLive, legacy };
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
  ok('2a. the first read is the whole document with rowSyncV1 and an anchor (epoch, revision, scope, counts)',
    r.kind === 'whole' && r.json.rowSyncV1 === true && r.json.rowSync.epoch && Number.isInteger(r.json.rowSync.rev) && r.json.rowSync.scope && r.json.rowSync.counts['cr:sales_tickets'] === 301,
    r.json.rowSync);
  ok('2b. the index describes the stored document: one line per entry, its stamp equal to the document stamp',
    m && m.doc_ts === st.ts && Number(m.rev) === 1 && W.idxLive().length === distinct, { meta: m, idx: W.idxLive().length, distinct });
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
    p.status === 200 && !p.json.conflict && m.doc_ts === st.ts && Number(m.rev) === Number(before.rev) + 1 && line && Number(line.rev) === Number(m.rev),
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
  ok('4a. after a direct write the two stamps are apart', mBefore.doc_ts !== ts, mBefore);
  const r = await owner.read();
  const ids = deltaIds(r.delta);
  const mAfter = W.meta();
  ok('4b. the next read rebuilds the index and still returns only the three changes',
    r.kind === 'partial' && sameList(ids.rows, ['sales_tickets/st-wtc-6', 'sales_tickets/st-wtc-direct-1']) && sameList(ids.gone, ['sales_tickets/st-wtc-5']) && mAfter.doc_ts === ts,
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
  ok('5b. another company\'s change reaches the scoped seat as an id only, never as an entry',
    r1.kind === 'partial' && ids1.rows.length === 0 && sameList(ids1.gone, ['sales_tickets/st-bbc-2']) && !r1.txt.includes('BBC-ONLY-MARKER') && !r1.txt.includes('31337'), { ids1 });
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

console.log('\n[12. The index at the end]');
{
  await owner.read();
  const st = await W.stored();
  const m = W.meta();
  const distinct = Array.from(collectRowMaps(st.doc).values()).reduce((n, mm) => n + mm.size, 0);
  ok('12a. stamps together and one live line per stored entry after everything above',
    m.doc_ts === st.ts && W.idxLive().length === distinct, { doc_ts: m.doc_ts, ts: st.ts, live: W.idxLive().length, distinct });
  const legacyAfter = await W.legacy.read();
  ok('12b. an old-protocol read still carries exactly the old fields', sameList(Object.keys(legacyAfter).sort(), ['deltaSyncV1', 'docs', 'edge', 'etag', 'ok', 'updatedAt']), Object.keys(legacyAfter));
}

console.log(`\nSummary: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
