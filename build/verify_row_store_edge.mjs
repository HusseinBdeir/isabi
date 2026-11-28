// Offline gate for the row store (store-size plan step 2, stage B): the Manufacturing store kept one entry per row,
// so a save writes the entries that changed instead of the whole document.
//   functions/_lib/row_store.js + readEdgeKvDoc / writeEdgeKvDoc / handleSync / handleRowStore in d1_store.js
//   (the real code, run here), and the row sync device blocks of isabi-app js/app.js for the checks that need a device.
// What it proves:
//   1. The lines are an exact form of any document: assembled back they are the document's JSON text, byte for byte
//      (order, odd shapes, repeated ids, entries without an id, other alphabets).
//   2. Order numbers: an added, removed or moved entry costs the lines that changed, and the order always reads back.
//   3. While the document is the master every save brings the rows in step and a read-back comparison is counted;
//      a writer that does not know the rows leaves them behind (never a failed comparison) and the next save catches up;
//      a row that differs from the document is counted and blocks the switch-over.
//   4. The switch-over is refused unless the rows read back as the stored document; after it the head row is a commit
//      record, the part rows are gone, and every read returns the same document as before.
//   5. With the rows as the master a save writes the changed lines only, and after the same saves the store holds the
//      same document as a store that never switched (twin stores, compared after every step).
//   6. Stale stamps and racing saves are answered "someone saved before you"; the store is never torn.
//   7. Row sync (stage A) goes on unchanged over the rows: partial answers, anchors, digests.
//   8. Rows at odds with their commit record make the store unreadable (never a guess); an Owner's whole save repairs it.
//   9. A document put back at the head by a writer that does not know the rows wins: reads follow it, the next save
//      brings the rows in step, and the Owner is told. A text the rows cannot hold exactly is written as a document.
//  10. restore_document puts the document back as the master with the same text and stamp, and the switch-over can
//      be made again.
//  11. A whole save that lists an id twice stores it once (the row-level guard no longer stores another company's
//      entry twice), and partial answers stay on.
//  12. The Owner notice: what GET /api/row_store reports, who may read it, what Reset clears, and which actions only
//      the build scripts may run.
// Uses in-memory node:sqlite (Node 22.5+). Touches nothing live.
// Run: node build/verify_row_store_edge.mjs

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { onRequest } from '../functions/app/api/[[route]].js';
import { isBuildTicketRoute, signEdgeSession } from '../functions/_lib/security.js';
import { effectiveMinSyncShellVer, handleRowStore, handleSync, readEdgeKvDoc, writeEdgeKvDoc } from '../functions/_lib/d1_store.js';
import { DEPLOYED_SHELL_VER } from '../functions/_lib/deployed_shell.js';
import { collectRowMaps, docAnchorOf, dropRepeatedRowIds, rowSumsOf } from '../functions/_lib/row_sync.js';
import {
  ROWS_HEAD_PREFIX, ROW_STORE_MAX_LINE_CHARS, assembleText, checkShadowRows, forgetRowStoreMemo, isRowsHead, linesOfDoc, planLineDiff, planOrds,
  sortStoredLines, syncShadowRows, writeRowsMasterDoc
} from '../functions/_lib/row_store.js';

// ---- the device code, cut out of app.js (as verify_row_sync_edge.mjs does) -------------------------------------------
const APP_JS_CANDIDATES = [
  process.env.ISABI_APP_SRC ? join(process.env.ISABI_APP_SRC, 'js', 'app.js') : '',
  fileURLToPath(new URL('../../isabi-app/js/app.js', import.meta.url)),
  fileURLToPath(new URL('../app/js/app.js', import.meta.url))
].filter(p => p && existsSync(p));
let APP_SRC = '';
for (const p of APP_JS_CANDIDATES) {
  const src = readFileSync(p, 'utf8');
  if (src.includes('// <row-sync-client>') && src.includes('// <row-sync-glue>')) { APP_SRC = src; break; }
}
if (!APP_SRC) {
  console.error(`No app.js with the row sync device blocks found (looked in: ${APP_JS_CANDIDATES.join(', ') || 'nowhere'}).`);
  process.exit(2);
}
function cutBlock(openTag, closeTag) {
  const a = APP_SRC.indexOf(openTag);
  const b = APP_SRC.indexOf(closeTag);
  if (a < 0 || b <= a) { console.error(`${openTag} block not found`); process.exit(2); }
  return APP_SRC.slice(a, b);
}
const RowSyncClient = new Function(`${cutBlock('// <row-sync-client>', '// </row-sync-client>')}\nreturn RowSyncClient;`)();
const GLUE_SRC = cutBlock('// <row-sync-glue>', '// </row-sync-glue>');
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
    return { attach: attachRowSyncRequest, settle: settleRowSyncAnswer, mirror: () => _rowMirror };
  `)(RowSyncClient, DOC_KEY);
}

// ---- D1 over node:sqlite --------------------------------------------------------------------------------------------
// `withMeta` false leaves the change counts out of batch results, as an older shim does: the code must then find out
// by reading back.
class Stmt {
  constructor(d1, sql, params = []) { this.d1 = d1; this.sql = sql; this.params = params; }
  bind(...p) {
    if (p.length > 100) throw new Error(`D1 allows 100 bound values per statement, got ${p.length}`);
    return new Stmt(this.d1, this.sql, p);
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
  async first() { return this.d1.db.prepare(this.sql).get(...this.args()) || null; }
  async all() {
    if (/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)/i.test(this.sql)) {
      const r = await this.run();
      return this.d1.withMeta ? { results: [], meta: r.meta } : { results: [] };
    }
    return { results: this.d1.db.prepare(this.sql).all(...this.args()) };
  }
  async run() {
    const r = this.d1.db.prepare(this.sql).run(...this.args());
    this.d1.written += 1;
    for (const p of this.params) if (typeof p === 'string') this.d1.writtenChars += p.length;
    return { success: true, meta: { changes: Number(r.changes) } };
  }
}
class D1 {
  constructor() { this.db = new DatabaseSync(':memory:'); this.withMeta = true; this.written = 0; this.writtenChars = 0; this.beforeBatch = null; }
  prepare(sql) { return new Stmt(this, sql); }
  async batch(stmts) {
    if (this.beforeBatch) { const hook = this.beforeBatch; this.beforeBatch = null; await hook(stmts); }
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

// One clock for both twin stores: the server stamps edit history with the time of day, and the twins are compared as
// text. The time only moves when the gate says so (tick), never inside a step.
const RealDate = Date;
let fakeNow = RealDate.now();
class GateDate extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(fakeNow); }
  static now() { return fakeNow; }
}
globalThis.Date = GateDate;
const tick = (ms = 1000) => { fakeNow += ms; };

const SCHEMA_SQL = readFileSync(new URL('../migrations/0001_schema.sql', import.meta.url), 'utf8');
const SHELL = effectiveMinSyncShellVer() || DEPLOYED_SHELL_VER || '19.6.440';
let clock = Date.parse('2026-11-28T08:00:00.000Z');
const nextTs = () => { clock += 1000; return new Date(clock).toISOString(); };
const TICKET = { sub: 'u1', role: 'Full Access (Owner)', companies: 'All', email: 'owner@example.test', build_ticket: true };

async function makeWorld() {
  const d1 = new D1();
  d1.exec(SCHEMA_SQL);
  const env = { DB: d1, ISABI_JWT_SECRET: 'row-store-edge-offline-test-secret-' + Math.random().toString(36).slice(2) };
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
  async function api(routePath, { method = 'POST', body, token = tok.owner, headers = {} } = {}) {
    const tasks = [];
    const raw = body !== undefined ? JSON.stringify(body) : undefined;
    const req = new Request(`https://example.test/app/api/${routePath}`, {
      method,
      headers: Object.assign({ 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.9.0.5', 'X-ISABI-Shell': SHELL, 'X-ISABI-Session': token }, headers),
      body: method === 'GET' ? undefined : raw
    });
    const res = await onRequest({ request: req, env, params: { route: routePath.split('?')[0].split('/') }, waitUntil: p => tasks.push(p) });
    await Promise.all(tasks);
    const txt = await res.text();
    let json = null;
    try { json = JSON.parse(txt); } catch (_) {}
    return { status: res.status, json, txt };
  }
  async function buildTicketPatch(doc) {
    const body = { op: 'patch', key: '', patch: { [DOC_KEY]: doc } };
    const res = await handleSync(
      new Request('https://example.test/app/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ISABI-Shell': SHELL }, body: JSON.stringify(body) }),
      env, TICKET, body, { waitUntil() {} }
    );
    return { status: res.status, json: await res.json() };
  }
  // The build scripts' switches: a build ticket session, straight into the handler.
  async function ticketAction(action, session = TICKET) {
    const body = { action };
    const raw = JSON.stringify(body);
    const res = await handleRowStore(
      new Request('https://example.test/app/api/row_store', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw }),
      env, session, body, raw.length, { parseError: false, emptyBody: false }
    );
    return { status: res.status, json: await res.json() };
  }
  const stored = async () => {
    const row = await readEdgeKvDoc(d1, DOC_KEY);
    return row ? { ts: row.updated_at, text: row.payload_json, row, doc: (() => { try { return JSON.parse(row.payload_json); } catch (_) { return null; } })() } : null;
  };
  const head = () => d1.one("SELECT payload_json, updated_at, rev FROM edge_kv_store WHERE doc_key = 'mfg_web_store'");
  const partCount = () => d1.one("SELECT COUNT(*) AS n FROM edge_kv_store WHERE doc_key LIKE 'mfg_web_store__part_%'").n;
  const state = () => d1.one("SELECT * FROM store_rows_state WHERE doc_key = 'mfg_web_store'");
  const meta = () => d1.one("SELECT * FROM store_row_meta WHERE doc_key = 'mfg_web_store'");
  const lineSnap = () => new Map(d1.rows("SELECT bucket, row_id, kind, ord, hash, json FROM store_rows WHERE doc_key = 'mfg_web_store'").map(r => [`${r.bucket}\u0000${r.row_id}`, `${r.kind}|${r.ord}|${r.hash}|${r.json}`]));
  const rowsText = () => assembleText(sortStoredLines(d1.rows("SELECT bucket, row_id, kind, ord, hash, json FROM store_rows WHERE doc_key = 'mfg_web_store'")));
  const anchor = async () => docAnchorOf(await readEdgeKvDoc(d1, DOC_KEY));
  const legacy = {
    read: async (token = tok.owner) => (await api('sync', { token, body: { op: 'get_mfg', doc: DOC_KEY } })).json,
    patch: async (docPatch, { token = tok.owner, ifMatch = null, delta = true, ts = null } = {}) => {
      const cur = ifMatch || (await stored()).ts;
      const doc = Object.assign({ minShellVer: SHELL, updatedAt: ts || nextTs(), updatedBy: 'gate@example.test' }, delta ? { _deltaPatch: 1 } : {}, docPatch);
      return api('sync', { token, body: { op: 'patch', key: '', ackOnly: true, ifMatchUpdatedAt: cur, patch: { [DOC_KEY]: doc } } });
    }
  };
  return { d1, env, tok, api, buildTicketPatch, ticketAction, stored, head, partCount, state, meta, lineSnap, rowsText, anchor, legacy };
}

class Device {
  constructor(world, token, scopeKey) { this.w = world; this.token = token; this.scopeKey = scopeKey; this.g = makeGlue(); }
  async read({ whole = false } = {}) {
    const body = { op: 'get_mfg', doc: DOC_KEY };
    const sent = this.g.attach(body, this.scopeKey, { cursor: !whole, audit: false, report: true });
    const res = await this.w.api('sync', { token: this.token, body });
    const j = res.json || {};
    const hadDocs = Boolean(j.docs && j.docs[DOC_KEY]);
    const hadDelta = Boolean(j.rowDelta);
    if (!this.g.settle(j, this.scopeKey, sent)) {
      const again = await this.read({ whole: true });
      again.refetched = true;
      return again;
    }
    return { kind: j.notModified ? 'notModified' : (hadDelta ? (hadDocs ? 'audit' : 'partial') : 'whole'), json: j, bytes: res.txt.length };
  }
  copy() { const m = this.g.mirror(); return m ? RowSyncClient.toDoc(m) : null; }
}

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
  for (const k of new Set([...Object.keys(ca.top), ...Object.keys(cb.top)])) if (ca.top[k] !== cb.top[k]) return `top ${k}`;
  for (const s of new Set([...Object.keys(ca.sets), ...Object.keys(cb.sets)])) {
    if (!ca.sets[s] || !cb.sets[s]) return `set ${s} on one side only`;
    for (const id of new Set([...Object.keys(ca.sets[s]), ...Object.keys(cb.sets[s])])) if (ca.sets[s][id] !== cb.sets[s][id]) return `${s}/${id}`;
  }
  return '';
}
function snapDiff(a, b) {
  let n = 0;
  for (const [k, v] of b) if (a.get(k) !== v) n += 1;
  for (const k of a.keys()) if (!b.has(k)) n += 1;
  return n;
}

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail !== undefined ? '  -> ' + JSON.stringify(detail).slice(0, 1600) : ''}`); }
}

function seedDoc() {
  const pad = 'Ready-mix delivery, pump on site, slump checked at the gate. '.repeat(3);
  const sales = [];
  for (let i = 0; i < 240; i++) sales.push({ id: `st-wtc-${i}`, company: 'WTC', date: '2026-11-20', customer: `ZzCust ${i % 17}`, total: 100 + i, notes: pad, source: 'app' });
  for (let i = 0; i < 60; i++) sales.push({ id: `st-bbc-${i}`, company: 'BBConstruction', date: '2026-11-20', customer: `ZzBbcCust ${i % 7}`, total: 300 + i, notes: 'BBC-ONLY-MARKER ' + pad, source: 'app' });
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
        { id: 'ex-plain', company: 'WTC', date: '2026-11-21', supplier: 'ZzSupplier Three', amount: 12, source: 'app' },
        { id: 'ex-bbc', company: 'BBConstruction', date: '2026-11-21', supplier: 'ZzBbcSupplier', amount: 66, notes: 'BBC-ONLY-MARKER', source: 'app' }
      ],
      attendance: [{ id: 'at-app-1', company: 'WTC', date: '2026-11-25', staff: 'ZzStaff One', source: 'app' }],
      receipts: []
    },
    kioskPunches: [
      { id: 'kp-1', company: 'WTC', staff: 'ZzStaff One', date: '2026-11-25', direction: 'IN', time: '08:00', punched_at: '2026-11-25T08:00:00Z' },
      { id: 'kp-bbc-1', company: 'BBConstruction', staff: 'ZzBbcStaff', date: '2026-11-25', direction: 'IN', time: '08:05', punched_at: '2026-11-25T08:05:00Z' }
    ],
    sentinelReviews: { 'sr-1': { company: 'WTC', status: 'reviewed', updated_at: '2026-11-25T08:00:00Z' } }
  };
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('\n[1. The lines are an exact form of any document]');
{
  const exact = d => assembleText(linesOfDoc(d)) === JSON.stringify(d);
  ok('1a. a store document assembles back to its JSON text, byte for byte', exact(seedDoc()));
  const odd = {
    10: 'ten', 2: 'two', b: 1, a: [1, 2, { x: null }],
    'ke"y\\with\nescapes': { 'in"ner': 'v' },
    customRecords: {
      plain: [{ id: 'p1', v: 1 }, { id: 'p2', v: 'عربي نص', nested: { a: [1, { b: 2 }] } }],
      empty: [],
      repeated: [{ id: 'r1', v: 1 }, { id: 'r1', v: 2 }],
      noId: [{ id: 'n1' }, { v: 'nothing to key by' }],
      blankId: [{ id: '  ' }],
      notObjects: [{ id: 'o1' }, 5, null, 'text', [1]],
      notAList: { some: 'object' },
      asNumber: 7,
      numericIds: [{ id: 5, v: 'five' }, { id: '6', v: 'six' }],
      spacedIds: [{ id: ' s1 ', v: 1 }, { id: 's2', v: 2 }],
      'ta"ble': [{ id: 'q1' }],
      withUndefined: [{ id: 'u1', gone: undefined, kept: 0 }]
    },
    kioskPunches: [{ id: 'kp-a', t: 1 }, { id: 'kp-b', t: 2 }],
    emptyObj: {}, emptyArr: [], nul: null, t: true, f: false, num: -0.5, big: 12345678901234567890, undef: undefined
  };
  ok('1b. odd shapes (repeated ids, no id, non-objects, non-lists, numeric keys, escapes, other alphabets) stay exact', exact(odd),
    { got: assembleText(linesOfDoc(odd)).slice(0, 300), want: JSON.stringify(odd).slice(0, 300) });
  ok('1c. a customRecords that is not an object and a kioskPunches that cannot be keyed are stored whole',
    exact({ customRecords: [1, 2], kioskPunches: [{ id: 'a' }, { id: 'a' }] }) && exact({ customRecords: null, kioskPunches: 'x' }) && exact({}) && exact({ kioskPunches: [] }));
  const lines = linesOfDoc(odd);
  const perEntry = lines.filter(l => l.b.startsWith('cr:') || l.b === 'kp').map(l => `${l.b}/${l.id}`);
  ok('1d. only row sets that can be keyed by id become per-entry lines',
    JSON.stringify(perEntry) === JSON.stringify(['cr:plain/p1', 'cr:plain/p2', 'cr:numericIds/5', 'cr:numericIds/6', 'cr:spacedIds/s1', 'cr:spacedIds/s2', 'cr:ta"ble/q1', 'cr:withUndefined/u1', 'kp/kp-a', 'kp/kp-b']), perEntry);
  // Random documents: shuffle, add, drop, edit, and compare after a trip through real rows.
  const d1 = new D1();
  d1.exec(SCHEMA_SQL);
  let seed = 12345;
  const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  let doc = { v: 0, customRecords: { a: [], b: [] }, kioskPunches: [], settings: { x: 1 } };
  let allExact = true;
  let detail = null;
  let nextId = 0;
  for (let step = 0; step < 160 && allExact; step++) {
    const t = rnd(2) ? 'a' : 'b';
    const list = doc.customRecords[t].slice();
    const what = rnd(7);
    if (what === 0 || list.length < 3) list.unshift({ id: `e${nextId++}`, n: step });
    else if (what === 1) list.push({ id: `e${nextId++}`, n: step });
    else if (what === 2) list.splice(rnd(list.length), 0, { id: `e${nextId++}`, n: step });
    else if (what === 3) list.splice(rnd(list.length), 1);
    else if (what === 4) list[rnd(list.length)] = Object.assign({}, list[rnd(list.length)], { id: list[0].id, n: -step });
    else if (what === 5) { const i = rnd(list.length); const [x] = list.splice(i, 1); list.splice(rnd(list.length + 1), 0, x); }
    else list.reverse();
    // `what === 4` can repeat an id: the table is then stored whole, and must still be exact.
    doc = Object.assign({}, doc, { v: step, customRecords: Object.assign({}, doc.customRecords, { [t]: list }) });
    if (step % 9 === 0) doc.kioskPunches = [{ id: `k${step}`, s: step }, ...doc.kioskPunches].slice(0, 5);
    const text = JSON.stringify(doc);
    const ts = nextTs();
    const synced = await syncShadowRows(d1, linesOfDoc(doc), ts, text);
    const back = assembleText(sortStoredLines(d1.rows("SELECT bucket, row_id, kind, ord, hash, json FROM store_rows WHERE doc_key = 'mfg_web_store'")));
    if (!synced || back !== text) { allExact = false; detail = { step, what, back: back.slice(0, 200), text: text.slice(0, 200) }; }
    else if ((await checkShadowRows(d1, text, synced.anchor)) !== 'ok') { allExact = false; detail = { step, what, check: 'not ok' }; }
  }
  ok('1e. 160 random edits (add at the front, the end, the middle; remove; move; reverse; a repeated id) read back from real rows exactly', allExact, detail);
}

console.log('\n[2. Order numbers cost the lines that changed]');
{
  const old = new Map([['a', 0], ['b', 1024], ['c', 2048]]);
  const same = planOrds(['a', 'b', 'c'], old);
  ok('2a. an unchanged order keeps every number', same.get('a') === 0 && same.get('b') === 1024 && same.get('c') === 2048);
  const front = planOrds(['n1', 'n2', 'a', 'b', 'c'], old);
  ok('2b. entries added at the front take numbers below the first, the rest keep theirs',
    front.get('n1') < front.get('n2') && front.get('n2') < 0 && front.get('a') === 0 && front.get('c') === 2048, [...front]);
  const mid = planOrds(['a', 'm', 'b', 'c', 'z'], old);
  ok('2c. an entry in a gap or at the end takes a number of its own', mid.get('m') > 0 && mid.get('m') < 1024 && mid.get('z') > 2048 && mid.get('b') === 1024, [...mid]);
  const tight = planOrds(['a', 'x', 'b'], new Map([['a', 5], ['b', 6]]));
  ok('2d. no gap left: the bucket is numbered afresh, in order', tight.get('a') < tight.get('x') && tight.get('x') < tight.get('b'), [...tight]);
  const moved = planOrds(['c', 'a', 'b'], old);
  ok('2e. a moved entry: numbered afresh, in order', moved.get('c') < moved.get('a') && moved.get('a') < moved.get('b'), [...moved]);
  const doc = seedDoc();
  const stored = new Map();
  const p0 = planLineDiff(stored, linesOfDoc(doc));
  const doc2 = JSON.parse(JSON.stringify(doc));
  doc2.customRecords.sales_tickets.unshift({ id: 'st-new', company: 'WTC', total: 1 });
  doc2.customRecords.sales_tickets[5].total = 999;
  doc2.customRecords.expenses.splice(1, 1);
  const p1 = planLineDiff(p0.next, linesOfDoc(doc2));
  ok('2f. one added, one edited and one removed entry plan exactly two writes, one removal and no moves',
    p1.put.length === 2 && p1.del.length === 1 && p1.move.length === 0, { put: p1.put.length, del: p1.del.length, move: p1.move.length });
}

// ---------------------------------------------------------------------------------------------------------------------
const W = await makeWorld();   // switches to the rows
const T = await makeWorld();   // its twin: the document stays the master

console.log('\n[3. While the document is the master, the rows are kept in step and compared]');
{
  const seed = seedDoc();
  const a = await W.buildTicketPatch(JSON.parse(JSON.stringify(seed)));
  const b = await T.buildTicketPatch(JSON.parse(JSON.stringify(seed)));
  ok('3a. both stores are seeded through a build ticket', a.status === 200 && a.json.ok && b.status === 200 && b.json.ok, { a: a.json, b: b.json });
  const s = await W.stored();
  const st = W.state();
  ok('3b. after the first save the rows assemble to the stored text and say so (anchor)', W.rowsText() === s.text && st.rows_ts === await W.anchor(), { st });
  ok('3c. the read-back comparison ran and was counted clean', st.rows_ok === 1 && st.rows_bad === 0 && st.master === 0 && st.mode === 1, st);
  const before = W.lineSnap();
  // (Every save of this part goes to the twin as well, at the same time of day: the guards also read the per-table
  // copies a save leaves in the database, so the twins must have seen the same saves.)
  const edit1 = { customRecords: { sales_tickets: [{ id: 'st-wtc-3', company: 'WTC', date: '2026-11-20', customer: 'ZzCust Edited', total: 4321, source: 'app' }] } };
  tick();
  const p = await W.legacy.patch(JSON.parse(JSON.stringify(edit1)), { ts: '2026-11-28T08:30:00.000Z' });
  await T.legacy.patch(JSON.parse(JSON.stringify(edit1)), { ts: '2026-11-28T08:30:00.000Z' });
  const after = W.lineSnap();
  const s2 = await W.stored();
  // (The first save from a device also settles the order of the top-level parts, which costs their order numbers.)
  ok('3d. an edited entry: saved, and the rows assemble to the new text', p.status === 200 && p.json.ok && snapDiff(before, after) <= 14 && W.rowsText() === s2.text,
    { changed: snapDiff(before, after), p: p.json });
  const before2 = W.lineSnap();
  const edit2 = { customRecords: { sales_tickets: [{ id: 'st-wtc-4', company: 'WTC', date: '2026-11-20', customer: 'ZzCust Edited Too', total: 4444, source: 'app' }] } };
  tick();
  const p2 = await W.legacy.patch(JSON.parse(JSON.stringify(edit2)), { ts: '2026-11-28T08:30:01.000Z' });
  await T.legacy.patch(JSON.parse(JSON.stringify(edit2)), { ts: '2026-11-28T08:30:01.000Z' });
  ok('3d2. the next edited entry changes that entry\'s line and the stamp lines, nothing else', p2.json.ok && snapDiff(before2, W.lineSnap()) <= 3 && W.rowsText() === (await W.stored()).text,
    { changed: snapDiff(before2, W.lineSnap()) });
  ok('3e. every save is compared while the count is under the target', W.state().rows_ok === 3 && W.state().rows_bad === 0, W.state());
  const s2b = await W.stored();
  // A writer that does not know the rows: the document moves, the rows stay.
  const mine = JSON.parse(s2b.text);
  mine.customRecords.expenses.push({ id: 'ex-by-script', company: 'WTC', amount: 5, source: 'app' });
  mine.updatedAt = nextTs();
  // json.dumps spelling (spaces after separators), as a build script writes.
  const scriptText = JSON.stringify(mine, null, 1);
  const fakeSwap = text => {
    const slices = [];
    for (let i = 0; i < text.length; i += 28000) slices.push(text.slice(i, i + 28000));
    W.d1.db.prepare("UPDATE edge_kv_store SET payload_json = ?, updated_at = ?, rev = rev + 1 WHERE doc_key = 'mfg_web_store'").run(slices[0], mine.updatedAt);
    W.d1.db.prepare("DELETE FROM edge_kv_store WHERE doc_key LIKE 'mfg_web_store__part_%'").run();
    for (let i = 1; i < slices.length; i++) {
      W.d1.db.prepare('INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES (?,?,?,?,1)').run(`mfg_web_store__part_${String(i).padStart(4, '0')}`, slices[i], mine.updatedAt, '');
    }
  };
  fakeSwap(scriptText);
  const okBefore = W.state().rows_ok;
  const chk = await checkShadowRows(W.d1, scriptText, await W.anchor());
  ok('3f. after a writer that does not know the rows they are behind, and that is not counted as a failed comparison',
    chk === 'skipped' && W.state().rows_ts !== await W.anchor() && W.state().rows_bad === 0 && W.state().rows_ok === okBefore, { chk, st: W.state() });
  const c1 = await W.ticketAction('check');
  ok('3g. the build scripts\' check brings the rows in step with a document in another JSON spelling and compares them clean',
    c1.status === 200 && c1.json.ok === true && c1.json.check === 'ok' && c1.json.master === 'document' && W.rowsText() === JSON.stringify(mine), c1.json);
  // Keep the twin identical: the same document, written the same way.
  T.d1.db.prepare("DELETE FROM edge_kv_store WHERE doc_key LIKE 'mfg_web_store%'").run();
  await writeEdgeKvDoc(T.d1, DOC_KEY, JSON.stringify(mine), mine.updatedAt, '');
  await writeEdgeKvDoc(W.d1, DOC_KEY, JSON.stringify(mine), mine.updatedAt, '');
  const off = await W.ticketAction('rows_off');
  tick();
  const snapOff = W.lineSnap();
  const pOff = await W.legacy.patch({ customRecords: { expenses: [{ id: 'ex-while-off', company: 'WTC', amount: 9, source: 'app' }] } }, { ts: '2026-11-28T09:00:00.000Z' });
  await T.legacy.patch({ customRecords: { expenses: [{ id: 'ex-while-off', company: 'WTC', amount: 9, source: 'app' }] } }, { ts: '2026-11-28T09:00:00.000Z' });
  ok('3h. switched off (mode 0), a save leaves the rows alone', off.json.ok && off.json.mode === 0 && pOff.json.ok && snapDiff(snapOff, W.lineSnap()) === 0, { off: off.json, changed: snapDiff(snapOff, W.lineSnap()) });
  const on = await W.ticketAction('rows_on');
  tick();
  const pOn = await W.legacy.patch({ customRecords: { expenses: [{ id: 'ex-back-on', company: 'WTC', amount: 3, source: 'app' }] } }, { ts: '2026-11-28T09:00:01.000Z' });
  await T.legacy.patch({ customRecords: { expenses: [{ id: 'ex-back-on', company: 'WTC', amount: 3, source: 'app' }] } }, { ts: '2026-11-28T09:00:01.000Z' });
  ok('3i. switched back on, the next save brings them in step again', on.json.mode === 1 && pOn.json.ok && W.rowsText() === (await W.stored()).text && W.state().rows_ts === await W.anchor(), W.state());
  // A row that differs from the document.
  W.d1.db.prepare("UPDATE store_rows SET json = replace(json, '4321', '4322') WHERE doc_key = 'mfg_web_store' AND bucket = 'cr:sales_tickets' AND row_id = 'st-wtc-3'").run();
  const sNow = await W.stored();
  const bad = await checkShadowRows(W.d1, sNow.text, await W.anchor());
  const health = await W.api('row_store', { method: 'GET' });
  ok('3j. a row that differs from the document is counted, and the Owner is told',
    bad === 'bad' && W.state().rows_bad === 1 && health.json.row_store.status === 'attention' && health.json.row_store.issues.some(i => i.code === 'rows_mismatch'), { bad, h: health.json });
  const refused = await W.ticketAction('cutover');
  ok('3k. the switch-over is refused while a failed comparison is on record', refused.status === 409 && refused.json.ok === false && !isRowsHead(W.head().payload_json), refused.json);
  const reset = await W.api('row_store', { body: { action: 'reset' } });
  ok('3l. Reset clears the count', reset.json.ok && W.state().rows_bad === 0 && reset.json.row_store.status === 'ok', reset.json);
  // The tampered row still differs; the hash column says it does not. The switch-over must read the text itself.
  const refused2 = await W.ticketAction('cutover');
  ok('3m. the switch-over is refused when the rows do not read back as the stored document, whatever the counters say',
    refused2.status === 409 && /do not assemble/.test(String(refused2.json.error)) && !isRowsHead(W.head().payload_json), refused2.json);
  W.d1.db.prepare("UPDATE store_rows SET hash = 'tampered' WHERE doc_key = 'mfg_web_store' AND bucket = 'cr:sales_tickets' AND row_id = 'st-wtc-3'").run();
  tick();
  const fix = await W.legacy.patch({ lbpFxRate: 89600 }, { ts: '2026-11-28T09:00:02.000Z' });
  await T.legacy.patch({ lbpFxRate: 89600 }, { ts: '2026-11-28T09:00:02.000Z' });
  ok('3n. a save puts a row whose hash is wrong right again', fix.json.ok && W.rowsText() === (await W.stored()).text, { st: W.state() });
}

console.log('\n[4. The switch-over]');
let textBefore = '';
{
  const owner = await W.api('row_store', { body: { action: 'cutover' } });
  ok('4a. an Owner in a browser cannot switch over (the build scripts only)', owner.status === 403 && !isRowsHead(W.head().payload_json), owner.json);
  const scoped = await W.api('row_store', { method: 'GET', token: W.tok.wtc });
  const scopedPost = await W.api('row_store', { body: { action: 'reset' }, token: W.tok.wtc });
  ok('4b. a seat that is not the Owner can neither read the notice nor reset it', scoped.status === 403 && scopedPost.status === 403, { g: scoped.status, p: scopedPost.status });
  ok('4c. a build ticket opens /row_store and nothing new besides', isBuildTicketRoute('/row_store', 'POST') && isBuildTicketRoute('/row_store', 'GET') && !isBuildTicketRoute('/row_store', 'DELETE'));
  const before = await W.stored();
  textBefore = before.text;
  const readBefore = await W.legacy.read();
  const partsBefore = W.partCount();
  const cut = await W.ticketAction('cutover');
  const head = W.head();
  ok('4d. the switch-over goes through once the rows read back as the stored document', cut.status === 200 && cut.json.ok === true && cut.json.chars === textBefore.length, cut.json);
  ok('4e. the head row is a commit record, its stamp unchanged, and the part rows are gone',
    isRowsHead(head.payload_json) && head.payload_json.startsWith(ROWS_HEAD_PREFIX) && head.updated_at === before.ts && partsBefore > 0 && W.partCount() === 0, { head: head.payload_json, partsBefore });
  let parses = true;
  try { JSON.parse(head.payload_json); } catch (_) { parses = false; }
  ok('4f. a commit record is not JSON: a reader that does not know it cannot take it for an empty store', parses === false);
  forgetRowStoreMemo();
  const cold = await W.stored();
  const warm = await W.stored();
  ok('4g. the store reads back as the same text, from the rows (first read) and from memory (second)',
    cold.text === textBefore && warm.text === textBefore && cold.row.rowsMaster === true && cold.row.partsInStep === true && cold.ts === before.ts);
  const readAfter = await W.legacy.read();
  ok('4h. a device reads exactly the document it read before', JSON.stringify(readAfter.docs[DOC_KEY]) === JSON.stringify(readBefore.docs[DOC_KEY]) && readAfter.updatedAt === readBefore.updatedAt);
  const again = await W.ticketAction('cutover');
  ok('4i. switching over twice is refused', again.status === 409 && /already/.test(String(again.json.error)), again.json);
  const st = W.state();
  ok('4j. the state line says the rows are the master', st.master === 1 && Boolean(st.master_at), st);
  const h = await W.api('row_store', { method: 'GET' });
  ok('4k. the notice reports the rows as the master and nothing to look at', h.json.row_store.rows.master === 'rows' && h.json.row_store.status === 'ok', h.json);
  const off = await W.ticketAction('rows_off');
  ok('4l. the rows cannot be switched off while they are the master', off.status === 409, off.json);
}

console.log('\n[5. With the rows as the master a save writes what changed, and the store holds what its twin holds]');
{
  const same = async () => {
    const a = await W.stored();
    const b = await T.stored();
    return a.text === b.text ? '' : `texts differ (${a.text.length} vs ${b.text.length} chars), first entry: ${firstDiff(a.doc, b.doc)}`;
  };
  ok('5a. before any save both stores hold the same text', (await same()) === '', await same());
  const steps = [
    ['an added entry', { customRecords: { sales_tickets: [{ id: 'st-wtc-new-1', company: 'WTC', date: '2026-11-28', customer: 'ZzCust New', total: 77, source: 'app' }] } }],
    ['an edited entry', { customRecords: { sales_tickets: [{ id: 'st-wtc-9', company: 'WTC', date: '2026-11-20', customer: 'ZzCust Nine', total: 909, source: 'app' }] } }],
    ['a removed entry', { customRecords: {}, _deletedCrIds: { expenses: ['ex-plain'] } }],
    ['a new table', { customRecords: { receipts: [{ id: 'rc-1', company: 'WTC', amount: 10, source: 'app' }] } }],
    ['a kiosk punch', { kioskPunches: [{ id: 'kp-2', company: 'WTC', staff: 'ZzStaff One', date: '2026-11-28', direction: 'OUT', time: '16:00', punched_at: '2026-11-28T16:00:00Z' }] }],
    ['a top-level part', { lbpFxRate: 90000, lbpFxUpdatedAt: '2026-11-28T10:00:00.000Z' }],
    ['a voided entry', { customRecords: { expenses: [{ id: 'ex-live-trail', company: 'WTC', date: '2026-11-21', supplier: 'ZzSupplier One', amount: 80, source: 'app', voided: true, void_reason: 'Entered twice by mistake', voided_by: 'Owner Seat', voided_at: '2026-11-28T10:01:00.000Z' }] } }]
  ];
  let i = 0;
  for (const [label, patch] of steps) {
    tick();
    const ts = new Date(Date.parse('2026-11-28T10:00:00.000Z') + (i++) * 1000).toISOString();
    const snap = W.lineSnap();
    const w0 = W.d1.writtenChars;
    const a = await W.legacy.patch(JSON.parse(JSON.stringify(patch)), { ts });
    const wChars = W.d1.writtenChars - w0;
    const b = await T.legacy.patch(JSON.parse(JSON.stringify(patch)), { ts });
    const diff = await same();
    const changed = snapDiff(snap, W.lineSnap());
    ok(`5b.${i} ${label}: saved, the stores still hold the same text, ${changed} line(s) changed`,
      a.status === 200 && a.json.ok === true && !a.json.conflict && b.json.ok === true && diff === '' && changed >= 1 && changed <= 6 && isRowsHead(W.head().payload_json) && W.partCount() === 0,
      { a: a.json, b: b.json, diff, changed, wChars });
  }
  // A whole save from a scoped seat (the row-level guard puts the other company's entries back).
  const wtcDoc = (await W.legacy.read(W.tok.wtc)).docs[DOC_KEY];
  const whole = JSON.parse(JSON.stringify(wtcDoc));
  whole.customRecords.sales_tickets = whole.customRecords.sales_tickets.filter(r => r.id !== 'st-wtc-11');
  whole.customRecords.sales_tickets.push({ id: 'st-wtc-whole', company: 'WTC', date: '2026-11-28', customer: 'ZzCust Whole', total: 5, source: 'app' });
  tick();
  const tsW = '2026-11-28T10:30:00.000Z';
  const aw = await W.legacy.patch(JSON.parse(JSON.stringify(whole)), { token: W.tok.wtc, delta: false, ts: tsW });
  const bw = await T.legacy.patch(JSON.parse(JSON.stringify(whole)), { token: T.tok.wtc, delta: false, ts: tsW });
  ok('5c. a scoped seat\'s whole save: the same text in both stores, the other company\'s entries all still there',
    aw.json.ok === true && bw.json.ok === true && (await same()) === '' && (await W.stored()).doc.customRecords.sales_tickets.filter(r => r.company === 'BBConstruction').length === 60,
    { aw: aw.json, bw: bw.json, diff: await same() });
  // A whole document through a build ticket, as a top-up sends it.
  const big = (await W.stored()).doc;
  big.customRecords.sales_tickets = big.customRecords.sales_tickets.filter(r => !/^st-wtc-1\d$/.test(r.id));
  for (let k = 0; k < 40; k++) big.customRecords.sales_tickets.push({ id: `st-topup-${k}`, company: 'WTC', date: '2026-11-28', customer: 'ZzCust T', total: k, source: 'workbook' });
  tick();
  big.updatedAt = '2026-11-28T10:40:00.000Z';
  const at = await W.buildTicketPatch(JSON.parse(JSON.stringify(big)));
  const bt = await T.buildTicketPatch(JSON.parse(JSON.stringify(big)));
  ok('5d. a top-up\'s whole document through a build ticket: the same text in both stores', at.json.ok === true && bt.json.ok === true && (await same()) === '', { at: at.json, diff: await same() });
  tick();
  const w1 = W.d1.writtenChars;
  const t1 = T.d1.writtenChars;
  const one = { customRecords: { sales_tickets: [{ id: 'st-wtc-30', company: 'WTC', date: '2026-11-20', customer: 'ZzCust Small', total: 1, source: 'app' }] } };
  await W.legacy.patch(JSON.parse(JSON.stringify(one)), { ts: '2026-11-28T10:41:00.000Z' });
  await T.legacy.patch(JSON.parse(JSON.stringify(one)), { ts: '2026-11-28T10:41:00.000Z' });
  const wSpent = W.d1.writtenChars - w1;
  const tSpent = T.d1.writtenChars - t1;
  ok(`5e. one edited entry: the rows store wrote ${wSpent} characters to the database, its twin ${tSpent}`, (await same()) === '' && wSpent * 5 < tSpent, { wSpent, tSpent });
  forgetRowStoreMemo();
  ok('5f. read cold from the rows (nothing remembered), the store still holds its twin\'s text', (await same()) === '', await same());
  const sums = rowSumsOf((await W.stored()).doc);
  ok('5g. every row set is keyed exactly', sums.exact === true);
}

console.log('\n[6. Stale stamps and racing saves]');
{
  const cur = await W.stored();
  const stale = await W.legacy.patch({ lbpFxRate: 1 }, { ifMatch: '2026-11-01T00:00:00.000Z' });
  ok('6a. a save against a stale stamp is answered "someone saved before you" with the document', stale.json.conflict === true && Boolean(stale.json.docs) && (await W.stored()).text === cur.text, { j: Object.keys(stale.json) });
  // Another save lands between this save's head read and its batch.
  let raced = false;
  W.d1.beforeBatch = async stmts => {
    if (!stmts.some(s => /UPDATE edge_kv_store SET payload_json/.test(s.sql))) return;
    raced = true;
    W.d1.db.prepare("UPDATE edge_kv_store SET updated_at = '2026-11-28T11:00:00.500Z', rev = rev + 1 WHERE doc_key = 'mfg_web_store'").run();
  };
  const loser = await W.legacy.patch({ lbpFxRate: 2 }, { ts: '2026-11-28T11:00:01.000Z' });
  W.d1.db.prepare("UPDATE edge_kv_store SET updated_at = ?, rev = rev - 1 WHERE doc_key = 'mfg_web_store'").run(cur.ts);
  forgetRowStoreMemo();
  const after = await W.stored();
  ok('6b. a save that loses the race writes nothing at all: no line, no stamp', raced && loser.json.conflict === true && after.text === cur.text && after.ts === cur.ts, { raced, loser: Object.keys(loser.json), same: after.text === cur.text });
  // The same without change counts in the batch result (found out by reading back).
  tick();
  W.d1.withMeta = false;
  const p = await W.legacy.patch({ lbpFxRate: 90001 }, { ts: '2026-11-28T11:00:02.000Z' });
  await T.legacy.patch({ lbpFxRate: 90001 }, { ts: '2026-11-28T11:00:02.000Z' });
  const direct = await writeRowsMasterDoc(W.d1, (await W.stored()).text, '2026-11-28T11:00:03.000Z', 'x', { updatedAt: 'not-the-stamp' });
  W.d1.withMeta = true;
  ok('6c. a database that reports no change counts: a save still lands, a stale one is still refused',
    p.json.ok === true && !p.json.conflict && (await W.stored()).doc.lbpFxRate === 90001 && direct.conflict === true, { p: p.json, direct });
  ok('6d. the stores still hold the same text', (await W.stored()).text === (await T.stored()).text);
}

console.log('\n[7. Row sync goes on unchanged over the rows]');
{
  const dev = new Device(W, W.tok.owner, 'owner');
  const first = await dev.read();
  ok('7a. a device\'s first read is the whole document with an anchor, and the index describes what the rows hold',
    first.kind === 'whole' && first.json.rowSyncV1 === true && W.meta().doc_ts === await W.anchor(), { kind: first.kind, meta: W.meta() });
  tick();
  await W.legacy.patch({ customRecords: { sales_tickets: [{ id: 'st-wtc-40', company: 'WTC', date: '2026-11-20', customer: 'ZzCust Forty', total: 40, source: 'app' }] } }, { ts: '2026-11-28T11:10:00.000Z' });
  await T.legacy.patch({ customRecords: { sales_tickets: [{ id: 'st-wtc-40', company: 'WTC', date: '2026-11-20', customer: 'ZzCust Forty', total: 40, source: 'app' }] } }, { ts: '2026-11-28T11:10:00.000Z' });
  const second = await dev.read();
  // The whole document as this device is sent it (live entries without their edit history).
  const wholeNow = (await W.api('sync', { body: { op: 'get_mfg', doc: DOC_KEY, noTrails: true } })).json.docs[DOC_KEY];
  ok('7b. after another device saves it is sent the changed entry only, and its copy equals the whole document',
    second.kind === 'partial' && !second.refetched && second.bytes < first.bytes / 20 && firstDiff(dev.copy(), wholeNow) === '', { kind: second.kind, bytes: second.bytes, diff: firstDiff(dev.copy(), wholeNow) });
  ok('7c. the index moved with the save, in step with the rows', W.meta().doc_ts === await W.anchor());
  const wtcDev = new Device(W, W.tok.wtc, 'wtc');
  const wtcFirst = await wtcDev.read();
  ok('7d. a company-scoped seat still receives nothing of another company', wtcFirst.kind === 'whole' && !/BBC-ONLY-MARKER/.test(JSON.stringify(wtcFirst.json)));
}

console.log('\n[8. Rows at odds with their commit record]');
{
  const good = await W.stored();
  const saved = W.d1.one("SELECT * FROM store_rows WHERE doc_key = 'mfg_web_store' AND bucket = 'cr:sales_tickets' AND row_id = 'st-wtc-50'");
  W.d1.db.prepare("DELETE FROM store_rows WHERE doc_key = 'mfg_web_store' AND bucket = 'cr:sales_tickets' AND row_id = 'st-wtc-50'").run();
  const warm = await W.stored();
  forgetRowStoreMemo();
  const cold = await W.stored();
  ok('8a. a missing line is found on the first read from the rows: the store reads as unreadable, never as a shorter document',
    warm.text === good.text && cold.doc === null && cold.row.rowsDamaged === true, { coldParses: cold.doc !== null });
  const g = await W.legacy.read();
  ok('8b. devices are told the store is unreadable', g.storeUnreadable === true, Object.keys(g));
  const scoped = await W.legacy.patch({ customRecords: { sales_tickets: [{ id: 'st-wtc-x', company: 'WTC', total: 1, source: 'app' }] } }, { token: W.tok.wtc, ifMatch: good.ts });
  ok('8c. a company-scoped save onto it is refused', scoped.status === 503 && scoped.json.storeUnreadable === true, scoped.json);
  const ch = await W.ticketAction('check');
  const rs = await W.ticketAction('restore_document');
  ok('8d. the check reports it and the document cannot be restored from damaged rows', ch.status === 409 && ch.json.storeUnreadable === true && rs.status === 409 && isRowsHead(W.head().payload_json), { ch: ch.json, rs: rs.json });
  // A changed line (content differs, the hash column was left alone).
  W.d1.db.prepare('INSERT INTO store_rows (doc_key, bucket, row_id, kind, ord, hash, json) VALUES (?,?,?,?,?,?,?)').run(saved.doc_key, saved.bucket, saved.row_id, saved.kind, saved.ord, saved.hash, saved.json.replace('ZzCust', 'ZzEdit'));
  forgetRowStoreMemo();
  ok('8e. a line whose content was changed under its hash is found as well', (await W.stored()).doc === null);
  W.d1.db.prepare("UPDATE store_rows SET ord = ord + 1 WHERE doc_key = 'mfg_web_store' AND bucket = 'cr:sales_tickets' AND row_id = 'st-wtc-50'").run();
  W.d1.db.prepare("UPDATE store_rows SET json = ? WHERE doc_key = 'mfg_web_store' AND bucket = 'cr:sales_tickets' AND row_id = 'st-wtc-50'").run(saved.json);
  forgetRowStoreMemo();
  ok('8f. and a line that only moved', (await W.stored()).doc === null);
  // The Owner's whole save repairs it, as it repairs an unreadable document.
  tick();
  const repair = await W.legacy.patch(JSON.parse(good.text), { delta: false, ifMatch: good.ts, ts: '2026-11-28T11:20:00.000Z' });
  forgetRowStoreMemo();
  const fixed = await W.stored();
  ok('8g. an Owner\'s whole save repairs the store, still kept as rows', repair.json.ok === true && !repair.json.conflict && fixed.doc !== null && isRowsHead(W.head().payload_json)
    && fixed.doc.customRecords.sales_tickets.some(r => r.id === 'st-wtc-50'), { repair: repair.json });
  // Bring the twin to the same document.
  await T.legacy.patch(JSON.parse(good.text), { delta: false, ts: '2026-11-28T11:20:00.000Z' });
  ok('8h. and it holds its twin\'s text again', fixed.text === (await T.stored()).text, firstDiff(fixed.doc, (await T.stored()).doc));
}

console.log('\n[9. A document put back at the head wins]');
{
  const cur = await W.stored();
  const theirs = JSON.parse(cur.text);
  theirs.customRecords.expenses.push({ id: 'ex-older-server', company: 'WTC', amount: 1, source: 'app' });
  theirs.updatedAt = '2026-11-28T11:30:00.000Z';
  const text = JSON.stringify(theirs);
  // What an older server or a build script's staged swap does: the head row and part rows, nothing else.
  const slices = [];
  for (let i = 0; i < text.length; i += 28000) slices.push(text.slice(i, i + 28000));
  W.d1.db.prepare("UPDATE edge_kv_store SET payload_json = ?, updated_at = ?, rev = rev + 1 WHERE doc_key = 'mfg_web_store'").run(slices[0], theirs.updatedAt);
  for (let i = 1; i < slices.length; i++) {
    W.d1.db.prepare('INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES (?,?,?,?,1)').run(`mfg_web_store__part_${String(i).padStart(4, '0')}`, slices[i], theirs.updatedAt, '');
  }
  const now = await W.stored();
  ok('9a. reads follow the document at once (nothing remembered from the rows is served)', now.text === text && !now.row.rowsMaster, { rowsMaster: now.row.rowsMaster });
  const p = await W.legacy.patch({ lbpFxRate: 90500 }, { ts: '2026-11-28T11:30:01.000Z' });
  const st = W.state();
  ok('9b. the next save is stored as a document, the rows are brought in step with it, and the state says the store fell back',
    p.json.ok === true && !isRowsHead(W.head().payload_json) && W.partCount() > 0 && W.rowsText() === (await W.stored()).text && st.master === 0 && Boolean(st.fell_back_at), st);
  const h = await W.api('row_store', { method: 'GET' });
  ok('9c. the Owner is told', h.json.row_store.status === 'attention' && h.json.row_store.issues.some(i => i.code === 'fell_back') && h.json.row_store.rows.master === 'document', h.json);
  await W.api('row_store', { body: { action: 'reset' } });
  const cut = await W.ticketAction('cutover');
  ok('9d. after a Reset the switch-over can be made again', cut.status === 200 && cut.json.ok === true && isRowsHead(W.head().payload_json) && W.partCount() === 0, cut.json);
  // A text the rows cannot hold exactly (another JSON spelling): written as a document.
  const cur2 = await W.stored();
  const spaced = JSON.stringify(JSON.parse(cur2.text), null, 1);
  const res = await writeEdgeKvDoc(W.d1, DOC_KEY, spaced, '2026-11-28T11:40:00.000Z', 'script');
  const after = await W.stored();
  ok('9e. a text the rows cannot hold exactly is written as a document, and the document is the master again',
    res.ok === true && !res.rowsMaster && !isRowsHead(W.head().payload_json) && after.text === spaced && Boolean(W.state().fell_back_at) && W.state().master === 0, { res, st: W.state() });
  await writeEdgeKvDoc(W.d1, DOC_KEY, JSON.stringify(JSON.parse(spaced)), '2026-11-28T11:40:01.000Z', 'script');
  await W.api('row_store', { body: { action: 'reset' } });
}

console.log('\n[10. Putting the document back as the master]');
{
  const none = await W.ticketAction('restore_document');
  ok('10a. nothing to restore while the document is the master', none.status === 409 && /already/.test(String(none.json.error)), none.json);
  const cut = await W.ticketAction('cutover');
  await W.legacy.patch({ customRecords: { sales_tickets: [{ id: 'st-wtc-60', company: 'WTC', date: '2026-11-20', customer: 'ZzCust Sixty', total: 60, source: 'app' }] } }, { ts: '2026-11-28T11:50:00.000Z' });
  const asRows = await W.stored();
  const owner = await W.api('row_store', { body: { action: 'restore_document' } });
  const rs = await W.ticketAction('restore_document');
  const asDoc = await W.stored();
  ok('10b. an Owner in a browser cannot restore; the build scripts can', cut.json.ok === true && owner.status === 403 && rs.status === 200 && rs.json.ok === true, { owner: owner.status, rs: rs.json });
  ok('10c. the document is back at the head with the same text and the same stamp, in part rows',
    !isRowsHead(W.head().payload_json) && W.partCount() > 0 && !asDoc.row.rowsMaster && asDoc.text === asRows.text && asDoc.ts === asRows.ts && asDoc.row.partsInStep === true);
  const st = W.state();
  const chk = await W.ticketAction('check');
  ok('10d. the rows are still in step with it, and nothing is reported to the Owner', st.master === 0 && !st.fell_back_at && st.rows_ts === await W.anchor() && chk.json.check === 'ok' && chk.json.row_store.status === 'ok', { st, chk: chk.json });
  const p = await W.legacy.patch({ lbpFxRate: 90600 }, { ts: '2026-11-28T11:51:00.000Z' });
  const again = await W.ticketAction('cutover');
  ok('10e. saves go on as a document, and the switch-over can be made again', p.json.ok === true && again.status === 200 && again.json.ok === true && isRowsHead(W.head().payload_json), { p: p.json, again: again.json });
}

console.log('\n[11. An id listed twice in a whole save]');
for (const [label, world] of [['rows', W], ['document', T]]) {
  const other = (await world.stored()).doc.customRecords.sales_tickets.find(r => r.id === 'st-bbc-5');
  const wtcDoc = (await world.legacy.read(world.tok.wtc)).docs[DOC_KEY];
  const whole = JSON.parse(JSON.stringify(wtcDoc));
  // Another company's id twice (a hand-made client), and one of its own ids twice with different content.
  whole.customRecords.sales_tickets.push({ id: 'st-bbc-5', company: 'WTC', total: 1 }, { id: 'st-bbc-5', company: 'WTC', total: 2 });
  whole.customRecords.sales_tickets.push({ id: 'st-wtc-70', company: 'WTC', date: '2026-11-20', customer: 'ZzFirst', total: 1, source: 'app' }, { id: 'st-wtc-70', company: 'WTC', date: '2026-11-20', customer: 'ZzLast', total: 2, source: 'app' });
  const p = await world.legacy.patch(whole, { token: world.tok.wtc, delta: false });
  const now = (await world.stored()).doc;
  const hits = now.customRecords.sales_tickets.filter(r => r.id === 'st-bbc-5');
  const own = now.customRecords.sales_tickets.filter(r => r.id === 'st-wtc-70');
  ok(`11a (${label} master). another company's entry listed twice is stored once, as it was`, p.json.ok === true && hits.length === 1 && JSON.stringify(hits[0]) === JSON.stringify(other), { n: hits.length, p: p.json });
  ok(`11b (${label} master). its own entry listed twice is stored once, the last mention`, own.length === 1 && own[0].customer === 'ZzLast', own);
  ok(`11c (${label} master). every row set is still keyed exactly, so partial answers stay on`, rowSumsOf(now).exact === true);
}
{
  const d = { customRecords: { t: [{ id: 'a', v: 1 }, { v: 'no id' }, { id: 'b', v: 2 }, { id: 'a', v: 3 }, { id: ' b ', v: 4 }], n: 5 }, kioskPunches: [{ id: 'k' }, { id: 'k', x: 1 }] };
  const n = dropRepeatedRowIds(d);
  ok('11d. the last mention takes the place of the first; entries without an id and non-lists are left alone',
    n === 3 && JSON.stringify(d.customRecords.t) === JSON.stringify([{ id: 'a', v: 3 }, { v: 'no id' }, { id: ' b ', v: 4 }]) && d.customRecords.n === 5 && JSON.stringify(d.kioskPunches) === JSON.stringify([{ id: 'k', x: 1 }]), { n, d });
  const whole = (await T.stored()).doc;
  whole.customRecords.expenses.push({ id: 'ex-dup', company: 'WTC', amount: 1, source: 'app' }, { id: 'ex-dup', company: 'WTC', amount: 2, source: 'app' });
  const p = await T.legacy.patch(whole, { delta: false });
  const dups = (await T.stored()).doc.customRecords.expenses.filter(r => r.id === 'ex-dup');
  ok('11e. an Owner\'s whole save with an id twice is stored once as well', p.json.ok === true && dups.length === 1 && dups[0].amount === 2, dups);
}

console.log('\n[12. The Owner notice]');
{
  const demo = await W.api('row_store', { method: 'GET', headers: { 'X-ISABI-Demo': '1' } });
  ok('12a. the demo sandbox gets no notice', demo.status === 200 && demo.json.row_store === null, demo.json);
  const h0 = (await W.api('row_store', { method: 'GET' })).json.row_store;
  ok('12b. all well: status ok, no issues, partial answers on, the rows the master',
    h0.status === 'ok' && h0.issues.length === 0 && h0.partial && h0.partial.on === true && h0.rows.master === 'rows', h0);
  // A failed comparison reported by a whole-store device switches partial answers off (row_sync.js).
  const m = W.meta();
  const report = { op: 'get_mfg', doc: DOC_KEY, noTrails: true, rowSync: { v: 1, auditResult: { epoch: m.epoch, ok: false, rev: m.rev, rows: 10, bad: 1, sample: 'differs cr:sales_tickets/st-wtc-1' } } };
  await W.api('sync', { body: report });
  const h1 = (await W.api('row_store', { method: 'GET' })).json.row_store;
  ok('12c. a failed comparison: the notice says partial answers are off, with the day it happened',
    h1.status === 'attention' && h1.partial.on === false && h1.issues.some(i => i.code === 'partial_off' && i.n === 1 && /^\d{4}-\d{2}-\d{2}T/.test(i.at)), h1);
  const dev = new Device(W, W.tok.owner, 'owner-notice');
  const offRead = await dev.read();
  ok('12d. meanwhile devices get whole documents and no row sync fields', offRead.kind === 'whole' && !offRead.json.rowSyncV1);
  for (let k = 0; k < 5; k++) {
    await W.api('sync', { body: { op: 'get_mfg', doc: DOC_KEY, noTrails: true, rowSync: { v: 1, auditResult: { epoch: m.epoch, ok: false, apply: true, rev: m.rev, rows: 10, bad: 1, sample: 'sums differ' } } } });
  }
  const h2 = (await W.api('row_store', { method: 'GET' })).json.row_store;
  ok('12e. copies that could not follow are counted, and reported from the fifth', h2.rows.copiesFailed === 5 && h2.issues.some(i => i.code === 'copies_failing' && i.n === 5), h2);
  const bad = await W.api('row_store', { body: { action: 'nonsense' } });
  const empty = await W.api('row_store', { body: {} });
  ok('12f. an unknown action is refused', bad.status === 403 && empty.status === 403, { bad: bad.status, empty: empty.status });
  const reset = await W.api('row_store', { body: { action: 'reset' } });
  const h3 = reset.json.row_store;
  ok('12g. Reset clears every count and puts partial answers back on, with their comparisons starting again',
    reset.status === 200 && h3.status === 'ok' && h3.issues.length === 0 && h3.partial.on === true && h3.partial.auditOk === 0 && h3.rows.copiesFailed === 0, h3);
  const onRead = await dev.read();
  ok('12h. devices are anchored again', onRead.json.rowSyncV1 === true, { kind: onRead.kind });
}

console.log('\n[13. What the rows cannot hold, or the database refuses, is saved the old way]');
{
  const X = await makeWorld();
  await X.buildTicketPatch(seedDoc());
  const huge = 'x'.repeat(ROW_STORE_MAX_LINE_CHARS + 10);
  const okBefore = X.state().rows_ok;
  const p = await X.legacy.patch({ customRecords: { expenses: [{ id: 'ex-huge', company: 'WTC', amount: 1, source: 'app', notes: huge }] } });
  const st = X.state();
  ok('13a. document master: an entry larger than one row holds is saved; the rows are left behind, nothing is counted as failed',
    p.json.ok === true && st.rows_ts !== await X.anchor() && st.rows_bad === 0 && st.rows_ok === okBefore && (await X.stored()).doc.customRecords.expenses.some(r => r.id === 'ex-huge'), st);
  const cut = await X.ticketAction('cutover');
  ok('13b. and the switch-over is refused while it is there', cut.status === 409 && !isRowsHead(X.head().payload_json), cut.json);
  await X.legacy.patch({ customRecords: {}, _deletedCrIds: { expenses: ['ex-huge'] } });
  const cut2 = await X.ticketAction('cutover');
  ok('13c. once it is gone the rows catch up and the switch-over goes through', cut2.status === 200 && cut2.json.ok === true && isRowsHead(X.head().payload_json), cut2.json);
  const p2 = await X.legacy.patch({ customRecords: { expenses: [{ id: 'ex-huge-2', company: 'WTC', amount: 1, source: 'app', notes: huge }] } });
  const after = await X.stored();
  ok('13d. rows master: the same entry is saved as a document, the document is the master again and the Owner is told',
    p2.json.ok === true && !p2.json.conflict && !isRowsHead(X.head().payload_json) && X.partCount() > 0 && after.doc.customRecords.expenses.some(r => r.id === 'ex-huge-2') && Boolean(X.state().fell_back_at), { p2: p2.json, st: X.state() });
  await X.legacy.patch({ customRecords: {}, _deletedCrIds: { expenses: ['ex-huge-2'] } });
  await X.api('row_store', { body: { action: 'reset' } });
  const cut3 = await X.ticketAction('cutover');
  // The database refuses the batch that would write the rows.
  let threw = false;
  X.d1.beforeBatch = async stmts => {
    if (!stmts.some(s => /UPDATE edge_kv_store SET payload_json/.test(s.sql))) return;
    threw = true;
    throw new Error('D1_ERROR: simulated');
  };
  const p3 = await X.legacy.patch({ customRecords: { expenses: [{ id: 'ex-after-error', company: 'WTC', amount: 2, source: 'app' }] } });
  const end = await X.stored();
  ok('13e. rows master: a batch the database refuses writes nothing, and the save goes through as a document',
    cut3.json.ok === true && threw && p3.json.ok === true && !p3.json.conflict && !isRowsHead(X.head().payload_json) && end.doc.customRecords.expenses.some(r => r.id === 'ex-after-error') && Boolean(X.state().fell_back_at), { p3: p3.json, st: X.state() });
  const again = await X.legacy.patch({ lbpFxRate: 5 });
  ok('13f. the next save brings the rows in step with that document', again.json.ok === true && X.rowsText() === (await X.stored()).text && X.state().rows_ts === await X.anchor(), X.state());
}

console.log(`\nSummary: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
