// Offline check of the kiosk Edge endpoint (functions/_lib/kiosk_verify.js) against an in-memory
// SQLite database standing in for D1. Covers the two tablet apps that sync through it:
//   - the resort gate till (op pos_sales -> kiosk_pos_sales -> POS till close register, bucket hsp_pos)
//   - the standalone attendance tablet (ops sync / roster / verify)
// and the Command Center write path that must never overwrite a server-totalled till close row.
// Run: node build/verify_kiosk_cloud.mjs      (Node 22.5+ for node:sqlite; touches nothing live)

import { DatabaseSync } from 'node:sqlite';
import { handleKioskPunchFeed, handleKioskVerify } from '../functions/_lib/kiosk_verify.js';
import {
  handleIndustryDomainStore, handleSync, isServerOwnedCustomRow, isServerOwnedRowEditKey,
  mirrorStoreDeltaToD1Tables, stripServerOwnedCustomRows
} from '../functions/_lib/d1_store.js';
import { canAccessCompany, isOwnerOrFullGroupSession } from '../functions/_lib/security.js';

// ---- minimal D1 stand-in ----
class Stmt {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  // D1 refuses a statement with more than 100 bound values; SQLite itself would not.
  bind(...p) { if (p.length > 100) throw new Error(`D1 allows 100 bound values per statement, got ${p.length}`); return new Stmt(this.db, this.sql, p); }
  // D1 binds ?1, ?2 ... by position; node:sqlite treats ?N as named, so pass them by name.
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
  async all() { return { results: this.db.prepare(this.sql).all(...this.args()) }; }
  async run() {
    // Tests can make another request land at the exact moment a stored document is about to be rewritten.
    if (this.db.beforeKvWrite && /UPDATE edge_kv_store SET payload_json/.test(this.sql)) {
      const hook = this.db.beforeKvWrite; this.db.beforeKvWrite = null; await hook();
    }
    if (this.db.beforeKvInsert && /INSERT OR IGNORE INTO edge_kv_store/.test(this.sql)) {
      const hook = this.db.beforeKvInsert; this.db.beforeKvInsert = null; await hook();
    }
    const r = this.db.prepare(this.sql).run(...this.args()); return { success: true, meta: { changes: r.changes } };
  }
}
class D1 {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  prepare(sql) { return new Stmt(this.db, sql); }
  // Tests can make something happen (or fail) at the exact moment a batch of row writes begins.
  async batch(stmts) {
    if (this.beforeBatch) { const hook = this.beforeBatch; this.beforeBatch = null; await hook(); }
    const out = []; for (const s of stmts) out.push(await s.all()); return out;
  }
  exec(sql) { this.db.exec(sql); }
  rows(sql, ...p) { return this.db.prepare(sql).all(...p); }
}

const d1 = new D1();
// Tables that the main schema (migrations/0001_schema.sql) owns in production.
d1.exec(`CREATE TABLE industry_custom_rows (bucket TEXT NOT NULL, row_id TEXT NOT NULL, company TEXT DEFAULT '',
  rev INTEGER DEFAULT 1, voided INTEGER DEFAULT 0, updated_at TEXT DEFAULT '', payload_json TEXT DEFAULT '{}',
  PRIMARY KEY (bucket, row_id));
  CREATE TABLE industry_row_edits (edit_key TEXT PRIMARY KEY, rev INTEGER DEFAULT 1, voided INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT '', payload_json TEXT DEFAULT '{}');
  CREATE TABLE staff_members (id TEXT PRIMARY KEY, name TEXT DEFAULT '', company TEXT DEFAULT '', role TEXT DEFAULT '',
  status TEXT DEFAULT 'Active', voided INTEGER DEFAULT 0);
  INSERT INTO staff_members (id, name, company, role, status, voided) VALUES
   ('stf-1', 'Register Person', 'La Una', 'Lifeguard', 'Active', 0),
   ('stf-2', 'Other Resort', 'Blanca', 'Waiter', 'Active', 0),
   ('stf-3', 'Voided Person', 'La Una', 'Waiter', 'Active', 1),
   ('stf-4', 'Plant Person', 'WTC', 'Driver', 'Active', 0);`);
const env = { DB: d1 };
const helpers = { isOwnerOrFullGroupSession, canAccessCompany };   // the same two checks the live route passes

let ipSeq = 0;
async function call(body, { key, session, ip } = {}) {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip || `10.0.0.${++ipSeq % 250}` };
  if (key) headers['X-Kiosk-Key'] = key;
  const req = new Request('https://example.test/app/api/kiosk/verify', { method: 'POST', headers, body: JSON.stringify(body) });
  const res = await handleKioskVerify(req, env, session || null, body, helpers);
  return { status: res.status, json: await res.json() };
}

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
}

const OWNER = { role: 'Owner', email: 'owner@example.test' };
const KEY_LAUNA = 'station-key-launa-0001';
const KEY_ANY = 'station-key-any-site-02';
const KEY_TILL_ONLY = 'station-key-till-only-03';
const KEY_ATT_ONLY = 'station-key-att-only-004';
const isoDay = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const DAY = isoDay(0);
const DAY_PREV = isoDay(-1);
const DAY_TAG = DAY.replace(/-/g, '');

function sale(id, over = {}) {
  return Object.assign({
    id, num: `LAUNA-${DAY_TAG}-001`, seq: 1, band: 0, till: 1, resort: 'LAUNA', userId: 'user-a', userName: 'Maya',
    day: DAY, time: '10:00', ts: DAY + 'T08:00:00.000Z',
    lines: [{ sku: 'ENT-ADULT', name: 'Entrance - Adult', category: 'Entrance', qty: 1, price: 20, cur: 'USD' }],
    totalUSD: 20, totalLBP: 1800000, tender: { usd: 20, lbp: 0, changeUSD: 0, changeLBP: 0 },
    netUSD: 20, netLBP: 0, rate: 90000, voided: false, rev: 0
  }, over);
}
const tillRows = () => d1.rows("SELECT row_id, company, rev, voided, payload_json FROM industry_custom_rows WHERE bucket = 'hsp_pos' ORDER BY row_id")
  .map(r => Object.assign({ row_id: r.row_id, company: r.company, rowRev: r.rev, rowVoided: r.voided }, JSON.parse(r.payload_json)));
const tillRow = (cashier, day) => tillRows().find(x => x.cashier === cashier && (!day || x.date === day));

console.log('station keys');
{
  let r = await call({ op: 'roster', site: 'LAUNA' });
  ok('no key is refused', r.status === 401, r);
  r = await call({ op: 'provision_station_key', site: 'LAUNA', rawKey: KEY_LAUNA, label: 'La Una gate' }, { session: OWNER });
  ok('owner provisions a site-bound key', r.status === 200 && r.json.ok && r.json.site_key === 'launa', r);
  r = await call({ op: 'provision_station_key', site: '*', rawKey: KEY_ANY, id: 'any' }, { session: OWNER });
  ok('owner provisions an any-site key', r.json.ok && r.json.site_key === '*', r);
  r = await call({ op: 'provision_station_key', site: 'LAUNA', rawKey: KEY_TILL_ONLY, id: 'till-only', scope: 'pos' }, { session: OWNER });
  const r2 = await call({ op: 'provision_station_key', site: 'LAUNA', rawKey: KEY_ATT_ONLY, id: 'att-only', scope: 'attendance' }, { session: OWNER });
  ok('owner provisions keys limited to one kind of tablet', r.json.ok && r.json.scope === 'pos' && r2.json.ok && r2.json.scope === 'attendance', [r, r2]);
  r = await call({ op: 'provision_station_key', site: 'LAUNA', rawKey: 'station-key-typo-000005', id: 'typo', scope: 'till' }, { session: OWNER });
  ok('NEGATIVE: an unknown key kind is refused instead of becoming a key for everything', r.status === 400
    && !d1.rows("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'kiosk_station_keys'")[0].payload_json.includes('"typo"'), r);
  r = await call({ op: 'provision_station_key', site: 'LAUNA', rawKey: 'x'.repeat(20) }, { key: KEY_LAUNA });
  ok('a station key cannot mint keys', r.status === 403, r);
  const stored = d1.rows("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'kiosk_station_keys'")[0].payload_json;
  ok('only key hashes are stored', !stored.includes(KEY_LAUNA) && !stored.includes(KEY_ANY));
}

console.log('till sales');
{
  let r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [sale('sale-0001')] });
  ok('sales without a key are refused', r.status === 401, r);
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [sale('sale-0001')] }, { session: { role: 'Supervisor' } });
  ok('a non-owner seat cannot post sales', r.status === 403, r);
  r = await call({ op: 'pos_sales', resort: 'BLANCA', sales: [sale('sale-0001', { resort: 'BLANCA' })] }, { key: KEY_LAUNA });
  ok('a La Una key cannot post for Blanca', r.status === 403, r);
  r = await call({ op: 'pos_sales', sales: [sale('sale-0001')] }, { key: KEY_ANY });
  ok('resort is required', r.status === 400, r);
  r = await call({ op: 'pos_sales', resort: 'launa__att', sales: [sale('sale-0001')] }, { key: KEY_ANY });
  ok('the attendance namespace cannot be addressed as a site', r.status === 400, r);

  // user-a: $20 paid in USD, then $30 paid as 2,790,000 LBP with 90,000 LBP change (net 2,700,000 = $30).
  // user-b: $10 paid with a $20 note, $10 change.
  const batch = [
    sale('sale-0001'),
    sale('sale-0002', { num: `LAUNA-${DAY_TAG}-002`, totalUSD: 30, totalLBP: 2700000, tender: { usd: 0, lbp: 2790000, changeUSD: 0, changeLBP: 90000 }, netUSD: 0, netLBP: 2700000 }),
    sale('sale-0003', { userId: 'user-b', userName: 'Rami', totalUSD: 10, totalLBP: 900000, tender: { usd: 20, lbp: 0, changeUSD: 10, changeLBP: 0 }, netUSD: 10, netLBP: 0 })
  ];
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: batch }, { key: KEY_LAUNA });
  ok('batch accepted', r.json.ok && r.json.sales.length === 3 && r.json.rejected.length === 0 && r.json.mirrored === 2, r.json);
  let rows = tillRows();
  const a = tillRow('Maya'), b = tillRow('Rami');
  ok('one till close row per cashier', rows.length === 2 && a && b, rows);
  ok('cashier A totals', a && a.bills_count === 2 && a.pos_billed_ttc === 50 && a.cash_usd === 50 && a.variance_usd === 0 && a.status === 'Balanced', a);
  ok('cashier B totals', b && b.bills_count === 1 && b.pos_billed_ttc === 10 && b.cash_usd === 10 && b.variance_usd === 0, b);
  ok('row shape matches the register', a && a.company === 'La Una' && a.date === DAY && new RegExp(`^POS-LAUNA-${DAY_TAG}-[0-9A-F]{6}$`).test(a.id)
    && a.terminal === 'La Una Gate Till' && a.card_whish_usd === 0 && a.comp_usd === 0 && a.rev === 1 && a.voided === false && a._customBucket === 'hsp_pos'
    && isServerOwnedCustomRow('hsp_pos', a.id), a);
  ok('no em dash or arrow in stored text', !/[—→]/.test(JSON.stringify(rows)));

  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: batch }, { key: KEY_LAUNA });
  rows = tillRows();
  ok('replay changes nothing', r.json.sales.length === 3 && r.json.mirrored === 0 && rows.every(x => x.rev === 1)
    && d1.rows('SELECT COUNT(*) n FROM kiosk_pos_sales')[0].n === 3, r.json);

  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [Object.assign({}, batch[1], { voided: true, rev: 1 })] }, { key: KEY_LAUNA });
  const a2 = tillRow('Maya');
  ok('a void re-totals the cashier-day', r.json.mirrored === 1 && a2.bills_count === 1 && a2.pos_billed_ttc === 20 && a2.cash_usd === 20 && a2.rev === 2, a2);
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [batch[1]] }, { key: KEY_LAUNA });
  ok('a stale un-voided copy cannot undo the void', d1.rows("SELECT voided, rev FROM kiosk_pos_sales WHERE id = 'sale-0002'")[0].voided === 1
    && tillRow('Maya').bills_count === 1, r.json);
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [Object.assign({}, batch[1], { voided: false, rev: 5 })] }, { key: KEY_LAUNA });
  ok('a newer un-voided copy cannot undo the void either', d1.rows("SELECT voided FROM kiosk_pos_sales WHERE id = 'sale-0002'")[0].voided === 1);

  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [Object.assign({}, batch[2], { voided: true, rev: 1 })] }, { key: KEY_LAUNA });
  const b2 = tillRow('Rami');
  ok('all sales voided leaves a zero row, never a tombstone', b2.voided === false && b2.rowVoided === 0 && b2.bills_count === 0
    && b2.pos_billed_ttc === 0 && b2.cash_usd === 0 && b2.status === 'Balanced' && b2.rev === 2, b2);
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [sale('sale-0003b', { userId: 'user-b', userName: 'Rami', totalUSD: 10, totalLBP: 900000, netUSD: 10 })] }, { key: KEY_LAUNA });
  const b3 = tillRow('Rami');
  ok('a new sale after that brings the row back with a higher rev', b3.voided === false && b3.rowVoided === 0 && b3.bills_count === 1
    && b3.pos_billed_ttc === 10 && b3.rev === 3 && b3.rowRev === 3 && b3.id === b2.id, b3);

  // Short-changed till: billed $20, collected $15 -> variance flagged.
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [sale('sale-0004', { userId: 'user-c', userName: 'Lara', netUSD: 15 })] }, { key: KEY_LAUNA });
  const c = tillRow('Lara');
  ok('a short till is flagged', c.variance_usd === -5 && c.status === 'Close Variance', c);

  // Cent rounding: three sales of $0.10 collected in LBP at 89,500.
  const cents = [1, 2, 3].map(i => sale('sale-cent-' + i, { userId: 'user-d', userName: 'Nour', day: DAY_PREV, totalUSD: 0.1, totalLBP: 9000, netUSD: 0, netLBP: 8950, rate: 89500 }));
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: cents }, { key: KEY_LAUNA });
  const d = tillRow('Nour');
  ok('sums are rounded to cents once', d.pos_billed_ttc === 0.3 && d.cash_usd === 0.3 && d.variance_usd === 0 && d.date === DAY_PREV, d);

  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [
    sale('sale-bad-1', { totalUSD: -1 }), sale('sale-bad-2', { rate: 0 }), sale('sale-bad-3', { day: '10/11/2026' }),
    sale('sale-bad-4', { resort: 'BLANCA' }), sale('x'), sale('sale-bad-6', { totalUSD: 'NaN' }), sale('sale-bad-7', { netLBP: Infinity }),
    sale('sale-bad-8', { lines: new Array(101).fill({}) }), sale('sale-bad-9', { note: 'y'.repeat(25000) }),
    sale('sale-bad-10', { day: '2099-12-31' }), sale('sale-bad-11', { day: isoDay(3) }), sale('sale bad"12'),
    sale('sale-bad-13', { day: '2019-01-01' })
  ] }, { key: KEY_LAUNA });
  ok('bad sales are rejected one by one (amounts, dates far ahead or years back, unsafe ids)', r.json.ok && r.json.sales.length === 0 && r.json.rejected.length === 13, r.json);
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [sale('sale-old-ok', { userId: 'user-old', userName: 'Backlog', day: isoDay(-120) })] }, { key: KEY_LAUNA });
  ok('a backlog sale from a past season is still accepted', r.json.sales.length === 1 && r.json.mirrored === 1, r.json);
  for (const weird of ['constructor', '__proto__', 'toString']) {
    r = await call({ op: 'pos_sales', resort: weird, sales: [sale('sale-proto-' + weird.replace(/_/g, ''), { resort: weird })] }, { key: KEY_ANY });
    ok(`NEGATIVE: a site named "${weird}" is not a company`, r.status === 200 && r.json.ok && r.json.mirrored === 0 && r.json.company === '', r);
  }
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [sale('sale-0001')] }, { key: KEY_ATT_ONLY });
  ok('NEGATIVE: an attendance-only key cannot post till sales', r.status === 403, r);
  r = await call({ op: 'sync_users', resort: 'LAUNA', users: [{ id: 'planted', name: 'Planted', role: 'supervisor', pinhash: 'c'.repeat(64) }] }, { key: KEY_ATT_ONLY });
  ok('NEGATIVE: an attendance-only key cannot plant a till account', r.status === 403
    && d1.rows("SELECT COUNT(*) n FROM kiosk_biometrics WHERE person_id = 'planted'")[0].n === 0, r);
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [sale('sale-0001')] }, { key: KEY_TILL_ONLY });
  ok('a till-only key posts sales', r.status === 200 && r.json.ok, r);
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: new Array(101).fill(0).map((_, i) => sale('sale-many-' + i)) }, { key: KEY_LAUNA });
  ok('more than 100 sales per request is refused', r.status === 413, r.status);

  // The same sale id cannot be claimed by another site.
  r = await call({ op: 'pos_sales', resort: 'PALMS', sales: [sale('sale-0001', { resort: 'PALMS', totalUSD: 999 })] }, { key: KEY_ANY });
  ok('a sale id belongs to its first site', r.json.rejected.length === 1 && r.json.rejected[0].reason === 'other-site'
    && d1.rows("SELECT total_usd FROM kiosk_pos_sales WHERE id = 'sale-0001'")[0].total_usd === 20, r.json);
  r = await call({ op: 'pos_sales', resort: 'TESTSITE', sales: [sale('sale-unk-1', { resort: 'TESTSITE' })] }, { key: KEY_ANY });
  ok('an unknown site stores sales but posts no register row', r.json.sales.length === 1 && r.json.mirrored === 0 && r.json.company === '', r.json);

  // Moving a sale to another cashier re-totals both cashier-days.
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [sale('sale-0004', { userId: 'user-a', userName: 'Maya', netUSD: 20, rev: 1 })] }, { key: KEY_LAUNA });
  ok('re-keyed sale re-totals both rows', tillRow('Lara').bills_count === 0 && tillRow('Lara').voided === false
    && tillRow('Maya', DAY).pos_billed_ttc === 40, tillRows().map(x => [x.cashier, x.pos_billed_ttc, x.voided]));

  // If the register cannot be written, the till is told to send the batch again.
  d1.exec('ALTER TABLE industry_custom_rows RENAME TO industry_custom_rows_gone');
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [sale('sale-0005', { userId: 'user-e', userName: 'Hala' })] }, { key: KEY_LAUNA });
  ok('NEGATIVE: a failed register update is not acknowledged', r.status === 503 && r.json.ok === false && !r.json.sales, r);
  d1.exec('ALTER TABLE industry_custom_rows_gone RENAME TO industry_custom_rows');
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [sale('sale-0005', { userId: 'user-e', userName: 'Hala' })] }, { key: KEY_LAUNA });
  ok('the retry totals the cashier-day', r.json.ok && r.json.mirrored === 1 && tillRow('Hala').pos_billed_ttc === 20
    && d1.rows("SELECT COUNT(*) n FROM kiosk_pos_sales WHERE id = 'sale-0005'")[0].n === 1, r.json);
}

console.log('command center cannot overwrite a till close row');
{
  const before = tillRow('Rami');
  const post = async (rowsMap, session) => {
    const body = { industryCustomRows: rowsMap, industryRowEdits: {} };
    const req = new Request('https://example.test/app/api/industry_domain_store', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const res = await handleIndustryDomainStore(req, env, session, body);
    return { status: res.status, json: await res.json() };
  };
  const ownerSeat = { id: 'u1', role: 'Owner', email: 'owner@example.test', full_name: 'Owner', companies: 'ALL', pbi_access: 'full' };
  // The client still holds the older zero copy (rev 2) and also tries a tombstone and a doctored total.
  let r = await post({ hsp_pos: [
    Object.assign({}, before, { rev: 2, bills_count: 0, pos_billed_ttc: 0, cash_usd: 0 }),
    { id: 'POS-CL-999', date: DAY, company: 'La Una', terminal: 'Hand keyed', pos_billed_ttc: 5, rev: 1 }
  ] }, ownerSeat);
  const afterStale = tillRow('Rami');
  ok('a stale client copy does not roll the row back', r.json.ok !== false && afterStale.rev === before.rev && afterStale.pos_billed_ttc === before.pos_billed_ttc, { r, afterStale });
  ok('a hand-keyed register row still saves (control)', d1.rows("SELECT COUNT(*) n FROM industry_custom_rows WHERE bucket = 'hsp_pos' AND row_id = 'POS-CL-999'")[0].n === 1, r);
  r = await post({ hsp_pos: [Object.assign({}, before, { rev: 99, voided: true })] }, ownerSeat);
  ok('NEGATIVE: a client tombstone with a higher rev does not hide the row', tillRow('Rami').rowVoided === 0 && tillRow('Rami').rev === before.rev, r);
  r = await post({ hsp_pos: [Object.assign({}, before, { rev: 100, pos_billed_ttc: 1, cash_usd: 1 })] }, ownerSeat);
  ok('NEGATIVE: a client edit with a higher rev does not change the totals', tillRow('Rami').pos_billed_ttc === before.pos_billed_ttc, r);

  // Row edits and workflow patches aimed at a till row are not stored; an ordinary one is.
  const wfKey = 'WF::hsp_pos::' + before.id;
  const body2 = { industryCustomRows: {}, industryRowEdits: {
    [wfKey]: { company: 'La Una', variance_usd: 0, status: 'Balanced', rev: 5 },
    [before.id]: { company: 'La Una', voided: true, rev: 6 },
    'WF::hsp_pos::POS-CL-999': { company: 'La Una', status: 'Balanced', rev: 1 }
  } };
  const req2 = new Request('https://example.test/app/api/industry_domain_store', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body2) });
  const res2 = await (await handleIndustryDomainStore(req2, env, ownerSeat, body2)).json();
  ok('the Command Center is told how many patches were not stored', res2.ok === true && res2.edits === 1 && res2.ignoredServerOwned === 2, res2);
  const editKeys = d1.rows('SELECT edit_key FROM industry_row_edits').map(x => x.edit_key);
  ok('NEGATIVE: a workflow patch or a void aimed at a till row is not stored, an ordinary one is',
    JSON.stringify(editKeys) === JSON.stringify(['WF::hsp_pos::POS-CL-999']) && isServerOwnedRowEditKey(wfKey) && !isServerOwnedRowEditKey('WF::hsp_pos::POS-CL-999'), editKeys);

  // The /api/sync mirror (second writer of the same table) holds the same line.
  const stats = await mirrorStoreDeltaToD1Tables(d1, {
    industryCustomRows: { hsp_pos: [
      Object.assign({}, before, { rev: 99, voided: true, pos_billed_ttc: 1 }),
      { id: 'POS-CL-950', date: DAY, company: 'La Una', terminal: 'Hand keyed 2', pos_billed_ttc: 7, rev: 1 }
    ] },
    industryRowEdits: { [wfKey]: { company: 'La Una', variance_usd: 0, status: 'Balanced', rev: 9 } }
  }, {}, ownerSeat);
  const afterMirror = tillRow('Rami');
  ok('NEGATIVE: the sync mirror does not overwrite a till row either', !(stats && stats.error) && afterMirror.rev === before.rev && afterMirror.rowVoided === 0
    && afterMirror.pos_billed_ttc === before.pos_billed_ttc && !d1.rows('SELECT edit_key FROM industry_row_edits').some(x => x.edit_key === wfKey), { stats, afterMirror });
  ok('the sync mirror still writes ordinary register rows (control)', d1.rows("SELECT COUNT(*) n FROM industry_custom_rows WHERE row_id = 'POS-CL-950'")[0].n === 1, stats);

  // And a client copy never travels to other clients inside the shared store document.
  const doc = stripServerOwnedCustomRows({
    industryCustomRows: { hsp_pos: [Object.assign({}, before, { rev: 999999, status: 'Balanced' }), { id: 'POS-CL-950' }], hsp_revenue: [{ id: before.id }] },
    industryRowEdits: { [wfKey]: { status: 'Balanced' }, 'WF::hsp_pos::POS-CL-950': { status: 'Balanced' } }
  });
  ok('NEGATIVE: till rows and their patches are stripped from the shared store document',
    JSON.stringify(doc.industryCustomRows.hsp_pos.map(x => x.id)) === JSON.stringify(['POS-CL-950']) && doc.industryCustomRows.hsp_revenue.length === 1
    && JSON.stringify(Object.keys(doc.industryRowEdits)) === JSON.stringify(['WF::hsp_pos::POS-CL-950']), doc);
}

console.log('attendance tablet');
{
  const vec = seed => Array.from({ length: 128 }, (_, i) => Math.sin(seed * 31 + i) * 0.2);
  const faces = [1, 2, 3].map(n => ({ id: `st-1:${n}`, staffId: 'st-1', staffName: 'Door Person', sample: n, descriptor: vec(1 + n * 0.001), pinhash: '', ts: DAY + 'T07:00:00Z' }));
  const evil = 'x" onfocus="alert(1)" autofocus x="';
  let r = await call({ op: 'sync', site: 'LAUNA', siteBu: 'La Una', device: 'gate',
    staff: [{ id: 'st-1', name: 'Door Person' }, { id: 'st-2', name: 'Pin Person' }, { id: evil, name: 'Evil Id' }],
    faces: faces.concat([{ id: 'st-2:0', staffId: 'st-2', sample: 0, descriptor: [], pinhash: 'a'.repeat(64), ts: DAY + 'T07:00:00Z' },
      { id: 'bad:1', staffId: evil, sample: 1, descriptor: vec(9), ts: DAY + 'T07:00:00Z' }]),
    punches: [{ id: 'p-1', staffId: 'st-1', staffName: 'Door Person', ts: DAY + 'T07:01:00Z', day: DAY, direction: 'in', method: 'face' },
      { id: 'p bad"1', staffId: 'st-1', ts: DAY + 'T07:02:00Z', day: DAY, direction: 'in', method: 'face' }] }, { key: KEY_LAUNA });
  ok('sync echoes punches, faces and staff', r.json.ok && r.json.punches.length === 1 && r.json.faces.length === 4
    && r.json.staff.length === 2 && r.json.staff.includes('st-2'), r.json);
  ok('NEGATIVE: ids that are not plain id characters are dropped everywhere',
    !JSON.stringify(r.json).includes('onfocus') && d1.rows("SELECT COUNT(*) n FROM kiosk_biometrics WHERE person_id LIKE '%onfocus%'")[0].n === 0
    && d1.rows('SELECT COUNT(*) n FROM kiosk_punches_ext')[0].n === 1);
  r = await call({ op: 'sync', site: 'LAUNA', punches: [{ id: 'p-1', staffId: 'st-1', staffName: 'Door Person', ts: DAY + 'T07:01:00Z', day: DAY, direction: 'out', method: 'face' }] }, { key: KEY_LAUNA });
  ok('a flipped punch updates in place', d1.rows("SELECT direction FROM kiosk_punches_ext WHERE id = 'p-1'")[0].direction === 'out'
    && d1.rows('SELECT COUNT(*) n FROM kiosk_punches_ext')[0].n === 1);
  r = await call({ op: 'sync', site: 'PALMS', punches: [{ id: 'p-1', staffId: 'zz', ts: DAY + 'T09:00:00Z', day: DAY, direction: 'in', method: 'pin' }] }, { key: KEY_ANY });
  ok('NEGATIVE: a punch id belongs to its first site, and the refusal is named', r.json.punches.length === 0 && r.json.rejectedPunches.includes('p-1')
    && d1.rows("SELECT site_key, staff_id FROM kiosk_punches_ext WHERE id = 'p-1'")[0].staff_id === 'st-1', r.json);

  r = await call({ op: 'roster', site: 'LAUNA', siteBu: 'La Una', restore: true }, { key: KEY_LAUNA });
  const ids = (r.json.faces || []).map(f => f.id).sort();
  ok('roster face ids match the tablet ids', JSON.stringify(ids) === JSON.stringify(['st-1:1', 'st-1:2', 'st-1:3', 'st-2:0']), ids);
  ok('restore returns usable vectors', r.json.faces.filter(f => f.descriptor.length === 128).length === 3);
  const names = r.json.staff.map(s => s.name).sort();
  ok('roster = tablet staff + this company\'s staff register', JSON.stringify(names) === JSON.stringify(['Door Person', 'Pin Person', 'Register Person']), names);

  for (const other of ['Blanca', 'WTC', '']) {
    r = await call({ op: 'roster', site: 'LAUNA', siteBu: other }, { key: KEY_LAUNA });
    const n2 = r.json.staff.map(s => s.name).sort();
    ok(`NEGATIVE: a La Una key asking for company "${other}" still gets only La Una`, JSON.stringify(n2) === JSON.stringify(names), n2);
  }
  // A signed-in seat that is not an Owner reaches only the sites of its own companies.
  const blancaSeat = { role: 'Supervisor', companies: 'Blanca' };
  const bioBefore = JSON.stringify(d1.rows('SELECT site_key, person_id, pinhash, face_samples FROM kiosk_biometrics ORDER BY site_key, person_id'));
  r = await call({ op: 'roster', site: 'LAUNA', restore: true }, { session: blancaSeat });
  ok('NEGATIVE: a Blanca seat cannot read the La Una roster', r.status === 403 && !r.json.staff && !r.json.faces, r);
  r = await call({ op: 'roster', site: 'WTC', restore: true }, { session: { role: 'Manager', companies: 'Blanca' } });
  ok('NEGATIVE: a Blanca seat cannot read the WTC roster', r.status === 403, r);
  r = await call({ op: 'sync', site: 'LAUNA', staff: [{ id: 'st-2', name: 'Pin Person', pinhash: 'd'.repeat(64) }] }, { session: blancaSeat });
  const r3 = await call({ op: 'sync_users', resort: 'LAUNA', users: [{ id: 'planted-2', name: 'Planted', role: 'supervisor', pinhash: 'd'.repeat(64) }] }, { session: blancaSeat });
  const r4 = await call({ op: 'roster', site: 'NOWHERE' }, { session: blancaSeat });
  ok('NEGATIVE: a Blanca seat cannot write La Una people or till accounts, nor reach an unknown site',
    r.status === 403 && r3.status === 403 && r4.status === 403
    && JSON.stringify(d1.rows('SELECT site_key, person_id, pinhash, face_samples FROM kiosk_biometrics ORDER BY site_key, person_id')) === bioBefore, [r.status, r3.status, r4.status]);
  r = await call({ op: 'roster', site: 'LAUNA' }, { session: { role: 'Manager', companies: 'La Una, Blanca' } });
  ok('a La Una seat reads its own site', r.status === 200 && r.json.staff.some(s => s.name === 'Register Person'), r.json.staff && r.json.staff.map(s => s.name));
  r = await call({ op: 'roster', site: 'LAUNA' }, { key: KEY_TILL_ONLY });
  ok('NEGATIVE: a till-only key cannot pull the attendance roster', r.status === 403, r);
  r = await call({ op: 'roster', site: 'LAUNA' }, { key: KEY_ATT_ONLY });
  ok('an attendance-only key reads the roster', r.status === 200 && r.json.staff.length === 3, r.json.staff && r.json.staff.map(s => s.name));
  r = await call({ op: 'roster', site: 'WTC' }, { key: KEY_ANY });
  ok('every attendance site maps to its company', JSON.stringify(r.json.staff.map(s => s.name)) === JSON.stringify(['Plant Person']), r.json.staff);

  r = await call({ op: 'roster', site: 'LAUNA', siteBu: 'La Una', redact: true }, { key: KEY_LAUNA });
  ok('redacted roster carries no vectors or PIN hashes', r.json.redacted === true && r.json.faces.every(f => f.descriptor.length === 0 && !f.pinhash)
    && r.json.staff.every(s => !s.pinhash) && JSON.stringify(r.json.faces.map(f => f.id).sort()) === JSON.stringify(ids), r.json.faces);

  r = await call({ op: 'verify', site: 'LAUNA', method: 'face', descriptor: vec(1.001) }, { key: KEY_LAUNA });
  ok('server-side face match', r.json.matched === true && r.json.staffId === 'st-1' && r.json.distance === undefined, r.json);
  r = await call({ op: 'verify', site: 'LAUNA', method: 'pin', pinhash: 'a'.repeat(64) }, { key: KEY_LAUNA });
  ok('server-side PIN match', r.json.matched === true && r.json.staffId === 'st-2', r.json);
  r = await call({ op: 'roster', site: 'BLANCA' }, { key: KEY_LAUNA });
  ok('a La Una key cannot read Blanca', r.status === 403, r);
  r = await call({ op: 'roster', site: 'PALMS', siteBu: 'Palms' }, { key: KEY_ANY });
  ok('another site sees none of La Una', r.json.staff.length === 0 && r.json.faces.length === 0, r.json);

  // People switched off, on the tablet side or in the staff register, leave the roster.
  d1.exec("INSERT INTO staff_members (id, name, company, role, status, voided) VALUES ('st-2', 'Pin Person', 'La Una', 'Waiter', 'Inactive', 0)");
  r = await call({ op: 'sync', site: 'LAUNA', staff: [{ id: 'st-9', name: 'Left Last Year', active: false }],
    faces: [1, 2, 3].map(n => ({ id: `st-9:${n}`, staffId: 'st-9', sample: n, descriptor: vec(70 + n * 0.001), ts: DAY + 'T07:00:00Z' })) }, { key: KEY_LAUNA });
  r = await call({ op: 'roster', site: 'LAUNA', restore: true }, { key: KEY_LAUNA });
  ok('NEGATIVE: a person made inactive in the staff register, or sent as inactive, is not on the roster',
    !r.json.staff.some(s => s.id === 'st-2' || s.id === 'st-9') && !r.json.faces.some(f => f.staffId === 'st-2' || f.staffId === 'st-9')
    && r.json.staff.some(s => s.id === 'st-1'), r.json.staff.map(s => s.id));
  r = await call({ op: 'verify', site: 'LAUNA', method: 'face', descriptor: vec(70.001) }, { key: KEY_LAUNA });
  ok('NEGATIVE: an inactive person does not clock in by face on the server', r.json.matched === false, r.json);
  r = await call({ op: 'verify', site: 'LAUNA', method: 'pin', pinhash: 'a'.repeat(64) }, { key: KEY_LAUNA });
  ok('NEGATIVE: a person switched off in the staff register does not clock in by PIN on the server either', r.json.matched === false, r.json);
  d1.exec("UPDATE staff_members SET status = ' active ' WHERE id = 'st-2'");
  r = await call({ op: 'roster', site: 'LAUNA' }, { key: KEY_LAUNA });
  const r5 = await call({ op: 'verify', site: 'LAUNA', method: 'pin', pinhash: 'a'.repeat(64) }, { key: KEY_LAUNA });
  ok('a register status of " active " (case, spaces) still counts as on, and the person is listed once',
    r.json.staff.filter(s => s.id === 'st-2').length === 1 && r5.json.matched === true, [r.json.staff.map(s => s.id), r5.json]);
  d1.exec("DELETE FROM staff_members WHERE id = 'st-2'");

  // Till cashiers and attendance staff at the same site are separate lists.
  r = await call({ op: 'sync_users', resort: 'LAUNA', users: [{ id: 'cash-1', name: 'Till Supervisor', role: 'supervisor', pinhash: 'b'.repeat(64), descriptors: [vec(5), vec(5.001), vec(5.002)] }] }, { key: KEY_LAUNA });
  ok('till cashiers sync', r.json.ok && r.json.users.length === 1 && r.json.users[0].id === 'cash-1', r.json);
  r = await call({ op: 'roster', site: 'LAUNA', restore: true }, { key: KEY_LAUNA });
  ok('NEGATIVE: the attendance roster never lists till cashiers or their PIN hashes',
    !r.json.staff.some(s => s.id === 'cash-1') && !JSON.stringify(r.json).includes('b'.repeat(64)), r.json.staff.map(s => s.id));
  r = await call({ op: 'verify', site: 'LAUNA', method: 'face', descriptor: vec(5) }, { key: KEY_LAUNA });
  ok('NEGATIVE: a till cashier face does not clock in on the attendance tablet', r.json.matched === false, r.json);
  r = await call({ op: 'verify_face', resort: 'LAUNA', descriptor: vec(1.001) }, { key: KEY_LAUNA });
  ok('NEGATIVE: an attendance face does not sign in on the till', r.json.matched === false, r.json);
  r = await call({ op: 'verify_face', resort: 'LAUNA', descriptor: vec(5) }, { key: KEY_LAUNA });
  ok('the till still recognises its own cashier', r.json.matched === true && r.json.userId === 'cash-1', r.json);
}

console.log('station keys made in the Command Center');
{
  const SUP = { role: 'Supervisor', companies: 'La Una' };
  const keyDoc = () => d1.rows("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'kiosk_station_keys'")[0].payload_json;
  await call({ op: 'roster', site: 'LAUNA', device: 'gate', version: '0.6.0' }, { key: KEY_LAUNA });
  let r = await call({ op: 'list_station_keys' }, { session: OWNER });
  ok('the Owner lists the keys, with the site list', r.status === 200 && r.json.keys.length >= 4 && r.json.sites.length === 11
    && r.json.sites.find(s => s.code === 'LAUNA').till === true && r.json.sites.find(s => s.code === 'WTC').till === false, r.json);
  ok('NEGATIVE: the list carries no key and no hash', !/key_hash|[0-9a-f]{64}/.test(JSON.stringify(r.json)) && !JSON.stringify(r.json).includes(KEY_LAUNA), r.json);
  ok('the list shows when a tablet was last heard from', r.json.keys.some(k => k.last_seen_at && k.device === 'gate'), r.json.keys.map(k => [k.id, k.last_seen_at, k.device]));

  r = await call({ op: 'create_station_key', site: 'blanca', scope: 'pos', label: '  Blanca gate till  ' }, { session: OWNER });
  const made = r.json;
  ok('the Owner makes a till key for Blanca', r.status === 200 && made.ok && /^[A-HJ-NP-Za-km-z2-9]{24}$/.test(made.key)
    && made.site === 'BLANCA' && made.company === 'Blanca' && made.scope === 'pos' && made.label === 'Blanca gate till'
    && made.qr === `ISABIKEY1|BLANCA|pos|${made.key}`, made);
  ok('only the hash of the new key is stored', !keyDoc().includes(made.key) && keyDoc().includes(made.id));
  r = await call({ op: 'pos_sales', resort: 'BLANCA', sales: [sale('sale-blanca-1', { resort: 'BLANCA', userId: 'bl-1', userName: 'Blanca Cashier' })] }, { key: made.key });
  ok('the new key posts sales for its own resort', r.status === 200 && r.json.ok && r.json.company === 'Blanca', r);
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [sale('sale-blanca-2')] }, { key: made.key });
  const rr = await call({ op: 'roster', site: 'BLANCA' }, { key: made.key });
  ok('NEGATIVE: it works for no other resort and for no attendance roster', r.status === 403 && rr.status === 403, [r.status, rr.status]);
  const twin = await Promise.all([1, 2].map(n => call({ op: 'create_station_key', site: 'PALMS', scope: 'attendance', label: 'Palms door ' + n }, { session: OWNER })));
  ok('two keys made in the same instant get different ids and keys', twin[0].json.ok && twin[1].json.ok && twin[0].json.id !== twin[1].json.id && twin[0].json.key !== twin[1].json.key, twin.map(t => t.json.id));
  const twinWork = await Promise.all(twin.map(t => call({ op: 'roster', site: 'PALMS' }, { key: t.json.key })));
  ok('and neither overwrote the other: both are on file and both work', keyDoc().includes(twin[0].json.id) && keyDoc().includes(twin[1].json.id)
    && twinWork.every(w => w.status === 200), twinWork.map(w => w.status));
  const mix = await Promise.all([
    call({ op: 'revoke_station_key', id: twin[0].json.id }, { session: OWNER }),
    call({ op: 'create_station_key', site: 'VOILE', scope: 'attendance', label: 'Voile door' }, { session: OWNER }),
    call({ op: 'revoke_station_key', id: twin[1].json.id }, { session: OWNER })
  ]);
  const afterMix = (await call({ op: 'list_station_keys' }, { session: OWNER })).json.keys;
  ok('switching keys off while another is made loses none of the three changes', mix.every(m => m.json.ok)
    && afterMix.find(k => k.id === twin[0].json.id).revoked === true && afterMix.find(k => k.id === twin[1].json.id).revoked === true
    && afterMix.some(k => k.id === mix[1].json.id && !k.revoked)
    && (await call({ op: 'roster', site: 'PALMS' }, { key: twin[0].json.key })).status === 401
    && (await call({ op: 'roster', site: 'VOILE' }, { key: mix[1].json.key })).status === 200, afterMix.map(k => [k.id, k.revoked]));
  // Another Owner window switches a key off at the very moment this one is about to save a new key.
  let innerRevoke = null;
  d1.db.beforeKvWrite = async () => { innerRevoke = await call({ op: 'revoke_station_key', id: mix[1].json.id }, { session: OWNER }); };
  r = await call({ op: 'create_station_key', site: 'PLATINUM', scope: 'pos', label: 'Platinum gate till' }, { session: OWNER });
  const afterRace = (await call({ op: 'list_station_keys' }, { session: OWNER })).json.keys;
  ok('NEGATIVE: saving a new key never brings a key back that was switched off in the same moment', r.json.ok && innerRevoke && innerRevoke.json.ok
    && afterRace.find(k => k.id === mix[1].json.id).revoked === true && afterRace.some(k => k.id === r.json.id && !k.revoked)
    && (await call({ op: 'roster', site: 'VOILE' }, { key: mix[1].json.key })).status === 401, afterRace.map(k => [k.id, k.revoked]));
  // The general store route (/api/sync) can reach any stored document by name. The kiosk documents are shut to it.
  const viaSync = async (body, session) => {
    const req = new Request('https://example.test/app/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const res = await handleSync(req, env, session, body, {});
    return { status: res.status, text: await res.text() };
  };
  const groupSeat = { sub: 'u9', role: 'Group Supervisor', companies: 'ALL' };
  const docBeforeSync = keyDoc();
  const syncTries = [];
  for (const who of [groupSeat, { sub: 'u1', role: 'Owner', companies: 'ALL' }]) {
    for (const body of [
      { op: 'get_mfg', doc: 'kiosk_station_keys' },
      { op: 'patch', patch: { kiosk_station_keys: { keys: [{ id: 'planted', site_key: '*', scope: '', key_hash: 'f'.repeat(64) }] } } },
      { op: 'patch', doc: 'mfg_web_store', patch: { pos_revenue_posting: { sites: { launa: { from: '2020-01-01' } } } } },
      { op: 'get_mfg', doc: 'pos_revenue_posting' },
      { op: 'get_mfg', doc: 'kiosk_key_seen:any' }
    ]) {
      const x = await viaSync(body, who);
      syncTries.push(x.status === 403 && !/key_hash|[0-9a-f]{64}/.test(x.text));
    }
  }
  ok('NEGATIVE: the general store route neither serves nor patches the key list, the last-seen marks or the posting dates, for any seat',
    syncTries.every(Boolean) && keyDoc() === docBeforeSync && !keyDoc().includes('planted')
    && d1.rows("SELECT COUNT(*) n FROM edge_kv_store WHERE doc_key = 'pos_revenue_posting'")[0].n === 0, syncTries);
  r = await call({ op: 'provision_station_key', site: '*', rawKey: 'station-key-group-seat-06', id: 'group-seat' }, { session: { role: 'Group Supervisor', companies: 'ALL' } });
  ok('NEGATIVE: the older provisioning op also refuses a non-Owner seat that has every company', r.status === 403 && !keyDoc().includes('group-seat'), r);

  for (const [name, body] of [
    ['an unknown site', { site: 'NOWHERE', scope: 'pos', label: 'Typo site' }],
    ['no kind of tablet', { site: 'LAUNA', scope: '', label: 'No kind' }],
    ['a key for everything', { site: '*', scope: 'pos', label: 'Any site' }],
    ['a till key for a plant', { site: 'WTC', scope: 'pos', label: 'Plant till' }],
    ['a nameless tablet', { site: 'LAUNA', scope: 'attendance', label: ' ' }]
  ]) {
    r = await call(Object.assign({ op: 'create_station_key' }, body), { session: OWNER });
    ok(`NEGATIVE: ${name} is refused`, r.status === 400 && !r.json.key, r);
  }
  const before = keyDoc();
  const tries = [];
  for (const op of ['list_station_keys', 'create_station_key', 'revoke_station_key']) {
    const body = { op, site: 'LAUNA', scope: 'attendance', label: 'Sneaky', id: made.id };
    tries.push((await call(body, { key: KEY_LAUNA })).status, (await call(body, { key: KEY_ANY })).status,
      (await call(body, { session: SUP })).status, (await call(body)).status, (await call(body, { session: { role: 'Group Supervisor', companies: 'ALL' } })).status);
  }
  ok('NEGATIVE: a station key, a Supervisor seat, a stranger and a non-Owner seat with every company cannot list, make or switch off keys',
    JSON.stringify(tries) === JSON.stringify([403, 403, 403, 401, 403, 403, 403, 403, 401, 403, 403, 403, 403, 401, 403]) && keyDoc() === before, tries);

  r = await call({ op: 'revoke_station_key', id: made.id }, { session: OWNER });
  const again = await call({ op: 'revoke_station_key', id: made.id }, { session: OWNER });
  const gone = await call({ op: 'revoke_station_key', id: 'ksk-nope' }, { session: OWNER });
  ok('the Owner switches a key off (twice is harmless, an unknown id is named)', r.json.ok && again.json.ok && gone.status === 404, [r.json, again.json, gone.status]);
  r = await call({ op: 'pos_sales', resort: 'BLANCA', sales: [sale('sale-blanca-3', { resort: 'BLANCA' })] }, { key: made.key });
  ok('NEGATIVE: a switched-off key stops working', r.status === 401
    && d1.rows("SELECT COUNT(*) n FROM kiosk_pos_sales WHERE id = 'sale-blanca-3'")[0].n === 0, r);
  r = await call({ op: 'list_station_keys' }, { session: OWNER });
  const listed = r.json.keys.find(k => k.id === made.id);
  ok('the list shows it as switched off, and the older keys still work', listed && listed.revoked === true && listed.revoked_at
    && (await call({ op: 'roster', site: 'LAUNA' }, { key: KEY_LAUNA })).status === 200, listed);
}

console.log('switching a person off and on at the door');
{
  const vec = seed => Array.from({ length: 128 }, (_, i) => Math.sin(seed * 31 + i) * 0.2);
  const rosterOf = async extra => (await call(Object.assign({ op: 'roster', site: 'LAUNA', restore: true }, extra || {}), { key: KEY_LAUNA })).json;
  let r = await call({ op: 'sync', site: 'LAUNA', staff: [{ id: 'st-1', name: 'Door Person', active: false }] }, { key: KEY_LAUNA });
  let plain = await rosterOf();
  let full = await rosterOf({ includeInactive: true });
  ok('a person switched off at the door leaves the roster an older tablet gets', r.json.staff.includes('st-1') && !plain.staff.some(s => s.id === 'st-1')
    && !plain.faces.some(f => f.staffId === 'st-1'), plain.staff.map(s => s.id));
  const off = full.staff.find(s => s.id === 'st-1');
  ok('a tablet that asks sees them as switched off, without their enrolments', off && off.active === false && !off.pinhash
    && !full.faces.some(f => f.staffId === 'st-1'), off);
  r = await call({ op: 'verify', site: 'LAUNA', method: 'face', descriptor: vec(1.001) }, { key: KEY_LAUNA });
  ok('NEGATIVE: they do not clock in on the server', r.json.matched === false, r.json);
  r = await call({ op: 'sync', site: 'LAUNA', staff: [{ id: 'st-1', name: 'Door Person' }] }, { key: KEY_LAUNA });
  ok('NEGATIVE: an ordinary sync that says nothing about the switch does not switch them back on',
    !(await rosterOf()).staff.some(s => s.id === 'st-1'));
  r = await call({ op: 'sync', site: 'LAUNA', staff: [{ id: 'st-1', name: 'Door Person', active: true }] }, { key: KEY_LAUNA });
  plain = await rosterOf();
  ok('switching them back on restores the person with their enrolments', plain.staff.some(s => s.id === 'st-1' && s.active === true)
    && plain.faces.filter(f => f.staffId === 'st-1' && f.descriptor.length === 128).length === 3, plain.staff.map(s => s.id));
  r = await call({ op: 'verify', site: 'LAUNA', method: 'face', descriptor: vec(1.001) }, { key: KEY_LAUNA });
  ok('and they clock in again', r.json.matched === true && r.json.staffId === 'st-1', r.json);
  r = await call({ op: 'sync', site: 'LAUNA', staff: [{ id: 'stf-3', name: 'Voided Person', active: true }] }, { key: KEY_LAUNA });
  full = await rosterOf({ includeInactive: true });
  ok('NEGATIVE: a person voided in the staff register cannot be switched on from the tablet', !full.staff.some(s => s.id === 'stf-3'), full.staff.map(s => s.id));
  r = await call({ op: 'sync', site: 'LAUNA', staff: [{ id: 'st-1', name: 'Door Person', active: false }] }, { key: KEY_TILL_ONLY });
  ok('NEGATIVE: a till key cannot switch attendance staff', r.status === 403 && (await rosterOf()).staff.some(s => s.id === 'st-1'), r);
}

console.log('door tablet punches read by the Command Center');
{
  const feed = async (body, session, opts) => {
    const req = new Request('https://example.test/app/api/kiosk/punches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const res = await handleKioskPunchFeed(req, env, session || null, body || {}, Object.assign({ settleMs: 0 }, helpers, opts || {}));
    return { status: res.status, json: await res.json(), cors: res.headers.get('Access-Control-Allow-Origin') };
  };
  await call({ op: 'sync', site: 'LAUNA', punches: [
    { id: 'p-2', staffId: 'st-2', staffName: 'Pin Person', ts: DAY + 'T05:02:00.000Z', tzOffsetMin: 120, day: DAY, direction: 'in', method: 'pin', confidence: 0.4123456, snapshot: 'data:image/jpeg;base64,AAAA', note: 'weak match 0.47' }
  ] }, { key: KEY_LAUNA });
  await call({ op: 'sync', site: 'WTC', punches: [
    { id: 'p-wtc-1', staffId: 'stf-4', staffName: 'Plant Person', ts: DAY + 'T04:00:00.000Z', day: DAY, direction: 'in', method: 'face' }
  ] }, { key: KEY_ANY });
  let r = await feed({});
  ok('NEGATIVE: the punch list needs a signed-in seat', r.status === 401 && !r.json.punches, r);
  r = await feed({}, OWNER);
  const p2 = r.json.punches.find(p => p.id === 'p-2');
  ok('the Owner reads every site, each punch with its company', r.status === 200 && r.json.punches.length === 3 && p2 && p2.company === 'La Una' && p2.site === 'LAUNA'
    && p2.staffName === 'Pin Person' && p2.direction === 'in' && p2.tzOffsetMin === 120 && p2.confidence === 0.412 && p2.note === 'weak match 0.47'
    && r.json.punches.find(p => p.id === 'p-wtc-1').company === 'WTC', r.json);
  ok('NEGATIVE: the audit photo never travels in the list', !JSON.stringify(r.json).includes('data:image') && !('snapshot' in p2));
  ok('the list is same-origin only', r.cors === null, r.cors);
  const cursor = r.json.cursor;
  r = await feed({}, { role: 'Entry', companies: 'La Una' });
  ok('a La Una seat reads La Una only', r.json.punches.length === 2 && r.json.punches.every(p => p.company === 'La Una'), r.json.punches.map(p => p.id));
  r = await feed({}, { role: 'Supervisor', companies: 'Blanca' });
  ok('NEGATIVE: a Blanca seat reads none of them', r.status === 200 && r.json.punches.length === 0, r.json);
  r = await feed({ since: cursor.since, sinceId: cursor.sinceId }, OWNER);
  ok('a second pull from the cursor brings nothing', r.json.punches.length === 0 && r.json.more === false, r.json);
  await new Promise(res => setTimeout(res, 5));
  await call({ op: 'sync', site: 'LAUNA', punches: [{ id: 'p-2', staffId: 'st-2', staffName: 'Pin Person', ts: DAY + 'T05:02:00.000Z', tzOffsetMin: 120, day: DAY, direction: 'out', method: 'pin', rev: 1 }] }, { key: KEY_LAUNA });
  r = await feed({ since: cursor.since, sinceId: cursor.sinceId }, OWNER);
  ok('a punch corrected on the tablet comes again with its new direction', r.json.punches.length === 1 && r.json.punches[0].id === 'p-2'
    && r.json.punches[0].direction === 'out' && r.json.punches[0].rev === 1, r.json.punches);
  // A clock-out arrives in a later pull than its clock-in: the clock-in comes along as context.
  await call({ op: 'sync', site: 'BLANCA', punches: [{ id: 'p-bl-in', staffId: 'bl-9', staffName: 'Late Out', ts: DAY_PREV + 'T20:00:00.000Z', tzOffsetMin: 120, day: DAY_PREV, direction: 'in', method: 'face', snapshot: 'data:image/jpeg;base64,BBBB' }] }, { key: KEY_ANY });
  const afterIn = (await feed({}, OWNER)).json.cursor;
  await new Promise(res => setTimeout(res, 5));
  await call({ op: 'sync', site: 'BLANCA', punches: [{ id: 'p-bl-out', staffId: 'bl-9', staffName: 'Late Out', ts: DAY + 'T04:00:00.000Z', tzOffsetMin: 120, day: DAY, direction: 'out', method: 'face' },
    { id: 'p-bl-other', staffId: 'bl-8', staffName: 'Someone Else', ts: DAY_PREV + 'T20:05:00.000Z', day: DAY_PREV, direction: 'in', method: 'pin' }] }, { key: KEY_ANY });
  await call({ op: 'sync', site: 'PALMS', punches: [{ id: 'p-pa-in', staffId: 'bl-9', staffName: 'Same Id Other Site', ts: DAY_PREV + 'T20:00:00.000Z', day: DAY_PREV, direction: 'in', method: 'face' }] }, { key: KEY_ANY });
  r = await feed({ since: afterIn.since, sinceId: afterIn.sinceId }, { role: 'Supervisor', companies: 'Blanca' });
  ok('a later clock-out brings its earlier clock-in along, and nobody else\'s', r.json.punches.some(p => p.id === 'p-bl-out') && r.json.context.length === 1
    && r.json.context[0].id === 'p-bl-in' && r.json.context[0].direction === 'in' && r.json.context[0].company === 'Blanca'
    && !JSON.stringify(r.json).includes('data:image') && !JSON.stringify(r.json).includes('p-pa-in'), r.json);
  r = await feed({ since: afterIn.since, sinceId: afterIn.sinceId, noContext: true }, { role: 'Supervisor', companies: 'Blanca' });
  ok('a first pull that asks for no context gets none', r.json.punches.some(p => p.id === 'p-bl-out') && r.json.context.length === 0, r.json.context);
  // Context is the days around the change only, and people with no staff id are told apart by name.
  const beforeNamed = (await feed({}, OWNER)).json.cursor;
  await call({ op: 'sync', site: 'VOILE', punches: [
    { id: 'p-vo-old', staffId: 'vo-1', staffName: 'Voile One', ts: isoDay(-3) + 'T06:00:00.000Z', day: isoDay(-3), direction: 'in', method: 'face' },
    { id: 'p-vo-yday', staffId: 'vo-1', staffName: 'Voile One', ts: DAY_PREV + 'T06:00:00.000Z', day: DAY_PREV, direction: 'in', method: 'face' },
    { id: 'p-vo-2ago', staffId: 'vo-1', staffName: 'Voile One', ts: isoDay(-2) + 'T06:00:00.000Z', day: isoDay(-2), direction: 'in', method: 'face' },
    { id: 'p-vo3-5ago', staffId: 'vo-3', staffName: 'Voile Three', ts: isoDay(-5) + 'T06:00:00.000Z', day: isoDay(-5), direction: 'in', method: 'face' },
    { id: 'p-na-1', staffId: '', staffName: 'No Id Anna', ts: DAY_PREV + 'T06:00:00.000Z', day: DAY_PREV, direction: 'in', method: 'pin' },
    { id: 'p-nb-1', staffId: '', staffName: 'No Id Bassam', ts: DAY_PREV + 'T06:10:00.000Z', day: DAY_PREV, direction: 'in', method: 'pin' }] }, { key: KEY_ANY });
  const mid = (await feed({ since: beforeNamed.since, sinceId: beforeNamed.sinceId }, OWNER)).json.cursor;
  await new Promise(res => setTimeout(res, 5));
  await call({ op: 'sync', site: 'VOILE', punches: [
    { id: 'p-vo-today', staffId: 'vo-1', staffName: 'Voile One', ts: DAY + 'T06:00:00.000Z', day: DAY, direction: 'in', method: 'face' },
    { id: 'p-na-2', staffId: '', staffName: 'No Id Anna', ts: DAY + 'T06:00:00.000Z', day: DAY, direction: 'out', method: 'pin' },
    { id: 'p-void', staffId: 'vo-2', staffName: 'Voile Void', ts: DAY + 'T07:00:00.000Z', day: DAY, direction: 'in', method: 'face', void: true },
    // someone else's late punch from three days back is in the same pull: it must not widen the first person's days
    { id: 'p-vo3-late', staffId: 'vo-3', staffName: 'Voile Three', ts: isoDay(-3) + 'T08:00:00.000Z', day: isoDay(-3), direction: 'in', method: 'face' }] }, { key: KEY_ANY });
  r = await feed({ since: mid.since, sinceId: mid.sinceId }, OWNER);
  const ctxIds = r.json.context.map(p => p.id).sort();
  ok('context is two days either side of a changed punch: the edge days are sent, a punch three days back is not',
    ctxIds.includes('p-vo-yday') && ctxIds.includes('p-vo-2ago') && ctxIds.includes('p-vo3-5ago') && !ctxIds.includes('p-vo-old'), ctxIds);
  ok('NEGATIVE: two people with no staff id are told apart by name, neither gets the other\'s punches', ctxIds.includes('p-na-1') && !ctxIds.includes('p-nb-1'), ctxIds);
  ok('a punch voided on the tablet arrives marked as voided', r.json.punches.find(p => p.id === 'p-void').voided === true
    && r.json.punches.find(p => p.id === 'p-vo-today').voided === false, r.json.punches.map(p => [p.id, p.voided]));
  // A big pull: 95 people at one site, each with a punch today and one two days ago, and one person with
  // punches on 15 different days. The day list is too long for one statement and the people do not fit in
  // one either, so the range form and the chunking are both used. Everyone still gets exactly their own.
  const beforeBig = (await feed({}, OWNER)).json.cursor;
  const crowd = Array.from({ length: 95 }, (_, i) => 'pl-' + String(i).padStart(3, '0'));
  await call({ op: 'sync', site: 'PLATINUM', punches: crowd.map(id => ({ id: 'old-' + id, staffId: id, staffName: 'Crowd ' + id, ts: isoDay(-2) + 'T06:00:00.000Z', day: isoDay(-2), direction: 'in', method: 'face' }))
    .concat(crowd.slice(0, 3).map(id => ({ id: 'far-' + id, staffId: id, staffName: 'Crowd ' + id, ts: isoDay(-9) + 'T06:00:00.000Z', day: isoDay(-9), direction: 'in', method: 'face' }))) }, { key: KEY_ANY });
  const afterOld = (await feed({ since: beforeBig.since, sinceId: beforeBig.sinceId }, OWNER)).json.cursor;
  await new Promise(res => setTimeout(res, 5));
  await call({ op: 'sync', site: 'PLATINUM', punches: crowd.map(id => ({ id: 'new-' + id, staffId: id, staffName: 'Crowd ' + id, ts: DAY + 'T06:00:00.000Z', day: DAY, direction: 'out', method: 'face' })) }, { key: KEY_ANY });
  await call({ op: 'sync', site: 'PLATINUM', punches: Array.from({ length: 15 }, (_, k) => ({ id: 'span-' + k, staffId: 'pl-span', staffName: 'Many Days', ts: isoDay(-40 + k * 2) + 'T06:00:00.000Z', day: isoDay(-40 + k * 2), direction: 'in', method: 'face' })) }, { key: KEY_ANY });
  r = await feed({ since: afterOld.since, sinceId: afterOld.sinceId }, OWNER);
  const bigCtx = new Set(r.json.context.map(p => p.id));
  ok('a pull too big for one statement still gives every person their own neighbouring punches, and nothing else',
    r.json.punches.length === 110 && crowd.every(id => bigCtx.has('old-' + id)) && !r.json.context.some(p => p.id.startsWith('far-'))
    && r.json.context.length === 95 && r.json.context.every(p => p.site === 'PLATINUM'), [r.json.punches.length, r.json.context.length, [...bigCtx].filter(x => !x.startsWith('old-')).slice(0, 5)]);
  // One person entered on two tablets before either had the roster: same name, two staff ids, one site.
  const beforeTwoIds = (await feed({}, OWNER)).json.cursor;
  await call({ op: 'sync', site: 'KORRI', punches: [
    { id: 'p-2id-in', staffId: 'loc-aaa', staffName: 'Two Ids', ts: DAY_PREV + 'T06:00:00.000Z', day: DAY_PREV, direction: 'in', method: 'face' },
    { id: 'p-2id-out', staffId: 'loc-aaa', staffName: 'Two Ids', ts: DAY_PREV + 'T15:00:00.000Z', day: DAY_PREV, direction: 'out', method: 'face' },
    { id: 'p-2id-other', staffId: 'loc-ccc', staffName: 'Somebody Else', ts: DAY_PREV + 'T06:00:00.000Z', day: DAY_PREV, direction: 'in', method: 'face' }] }, { key: KEY_ANY });
  const afterTwoIds = (await feed({ since: beforeTwoIds.since, sinceId: beforeTwoIds.sinceId }, OWNER)).json.cursor;
  await new Promise(res => setTimeout(res, 5));
  await call({ op: 'sync', site: 'KORRI', punches: [
    { id: 'p-2id-next', staffId: 'loc-bbb', staffName: '  TWO   ids ', ts: DAY + 'T06:00:00.000Z', day: DAY, direction: 'in', method: 'face' }] }, { key: KEY_ANY });
  r = await feed({ since: afterTwoIds.since, sinceId: afterTwoIds.sinceId }, OWNER);
  const twoIds = r.json.context.map(p => p.id).sort();
  ok('a person under two staff ids at one site still gets all their own punches as context, by name, whatever the capitals and spaces',
    JSON.stringify(twoIds) === '["p-2id-in","p-2id-out"]', twoIds);
  // The other way round: the untidy name (double space, a tab) is on the punch stored first.
  const beforeMessy = (await feed({}, OWNER)).json.cursor;
  await call({ op: 'sync', site: 'PROPS', punches: [
    { id: 'p-messy-in', staffId: 'loc-m1', staffName: 'Rana  \t Saad', ts: DAY_PREV + 'T06:00:00.000Z', day: DAY_PREV, direction: 'in', method: 'face' }] }, { key: KEY_ANY });
  const afterMessy = (await feed({ since: beforeMessy.since, sinceId: beforeMessy.sinceId }, OWNER)).json;
  await new Promise(res => setTimeout(res, 5));
  await call({ op: 'sync', site: 'PROPS', punches: [
    { id: 'p-messy-out', staffId: 'loc-m2', staffName: 'rana saad', ts: DAY_PREV + 'T15:00:00.000Z', day: DAY_PREV, direction: 'out', method: 'face' }] }, { key: KEY_ANY });
  r = await feed({ since: afterMessy.cursor.since, sinceId: afterMessy.cursor.sinceId }, OWNER);
  ok('and the same when the untidy name was stored first: it is kept with single spaces and still found',
    afterMessy.punches.find(p => p.id === 'p-messy-in').staffName === 'Rana Saad' && JSON.stringify(r.json.context.map(p => p.id)) === '["p-messy-in"]'
    && d1.rows("SELECT staff_name FROM kiosk_punches_ext WHERE id = 'p-messy-in'")[0].staff_name === 'Rana Saad', r.json.context.map(p => p.id));
  r = await feed({ limit: 1 }, OWNER);
  const r2 = await feed({ limit: 1, since: r.json.cursor.since, sinceId: r.json.cursor.sinceId }, OWNER);
  ok('pages follow each other without repeating a punch', r.json.more === true && r.json.punches.length === 1 && r2.json.punches.length === 1
    && r.json.punches[0].id !== r2.json.punches[0].id, [r.json.punches.map(p => p.id), r2.json.punches.map(p => p.id)]);
  r = await feed({ fromDay: isoDay(1) }, OWNER);
  ok('a first pull can be limited to recent days', r.json.punches.length === 0, r.json.punches.map(p => p.id));
  r = await feed({}, OWNER, { settleMs: undefined });
  ok('a punch still inside the one-minute settling window is not handed out yet, so a cursor cannot pass a half-written upload', r.status === 200 && r.json.punches.length === 0 && r.json.more === false, r.json);
  r = await feed({ since: "' OR 1=1 --", sinceId: 'x', fromDay: "2026' OR '1'='1", limit: 'abc' }, { role: 'Supervisor', companies: 'Shacman' });
  ok('NEGATIVE: odd cursor values change nothing about what a seat may read', r.status === 200 && r.json.punches.length === 0, r.json);
}

console.log('till sales posted to venue revenue from a date the Owner sets');
{
  const revRows = () => d1.rows("SELECT row_id, company, rev, voided, payload_json FROM industry_custom_rows WHERE bucket = 'hsp_revenue' AND row_id LIKE 'HSP-REV-POS-%' ORDER BY row_id")
    .map(x => Object.assign({ row_id: x.row_id, rowCompany: x.company, rowRev: x.rev, rowVoided: x.voided }, JSON.parse(x.payload_json)));
  const live = (site, day) => revRows().filter(x => x.rowVoided === 0 && x.row_id.startsWith(`HSP-REV-POS-${site}-`) && (!day || x.date === day));
  const cents = n => Math.round(n * 100);
  const billed = (site, day) => cents(d1.rows('SELECT COALESCE(SUM(total_usd), 0) t FROM kiosk_pos_sales WHERE site_key = ? AND day = ? AND voided = 0', site.toLowerCase(), day)[0].t);
  const posted = (site, day) => live(site, day).reduce((a, x) => a + cents(x.ttc_usd), 0);
  const tillBilled = (company, day) => tillRows().filter(x => x.company === company && x.date === day && x.source === 'pos_till').reduce((a, x) => a + cents(x.pos_billed_ttc), 0);
  const setFrom = (site, from, who) => call({ op: 'set_pos_revenue_posting', site, from }, who || { session: OWNER });

  ok('nothing is posted to venue revenue until a date is set', revRows().length === 0 && billed('LAUNA', DAY) > 0);
  let r = await call({ op: 'get_pos_revenue_posting' }, { session: OWNER });
  ok('the Owner sees the five resorts, all without a date', r.status === 200 && r.json.sites.length === 5 && r.json.sites.every(s => s.from === ''), r.json);
  const sneaky = [(await setFrom('LAUNA', DAY, { key: KEY_LAUNA })).status, (await setFrom('LAUNA', DAY, { session: { role: 'Supervisor', companies: 'La Una' } })).status,
    (await setFrom('LAUNA', DAY, {})).status, (await call({ op: 'get_pos_revenue_posting' }, { key: KEY_ANY })).status,
    (await setFrom('LAUNA', DAY, { session: { role: 'Group Supervisor', companies: 'ALL' } })).status];
  ok('NEGATIVE: a station key, a Supervisor seat and a stranger cannot set or read the date', JSON.stringify(sneaky) === '[403,403,401,403,403]' && revRows().length === 0, sneaky);
  for (const [name, site, from] of [['a plant', 'WTC', DAY], ['a date in another format', 'LAUNA', '10/11/2026'], ['an impossible date', 'LAUNA', '2026-13-45'], ['an unknown site', 'NOWHERE', DAY]]) {
    r = await setFrom(site, from);
    ok(`NEGATIVE: ${name} is refused`, r.status === 400 && revRows().length === 0, r);
  }

  // Two Owner windows save the very first date at the same moment, when no dates are stored yet.
  let firstInner = null;
  d1.db.beforeKvInsert = async () => { firstInner = await setFrom('VOILE', DAY); };
  r = await setFrom('PALMS', DAY);
  const both = (await call({ op: 'get_pos_revenue_posting' }, { session: OWNER })).json.sites;
  ok('two first dates saved in the same moment are both kept', r.json.ok && firstInner && firstInner.json.ok
    && both.find(s => s.code === 'PALMS').from === DAY && both.find(s => s.code === 'VOILE').from === DAY, both);
  await setFrom('PALMS', ''); await setFrom('VOILE', '');

  r = await setFrom('LAUNA', DAY);
  let rows = live('LAUNA');
  ok('setting the date posts the stored sales of that day onward', r.json.ok && r.json.changedRows === rows.length && rows.length >= 1
    && r.json.sites.find(s => s.code === 'LAUNA').from === DAY && rows.every(x => x.date >= DAY), [r.json, rows.map(x => [x.row_id, x.ttc_usd])]);
  ok('venue revenue for the day equals the billed total of the stored sales, to the cent', posted('LAUNA', DAY) === billed('LAUNA', DAY) && posted('LAUNA', DAY) > 0, [posted('LAUNA', DAY), billed('LAUNA', DAY)]);
  ok('and equals the billed total of the till close rows', posted('LAUNA', DAY) === tillBilled('La Una', DAY), [posted('LAUNA', DAY), tillBilled('La Una', DAY)]);
  ok('days before the date are not posted', posted('LAUNA', DAY_PREV) === 0 && billed('LAUNA', DAY_PREV) > 0);
  const e = rows.find(x => x.category === 'Beach Entrance' && x.date === DAY);
  ok('row shape matches venue revenue', e && e.company === 'La Una' && e.rowCompany === 'La Una' && e.outlet === 'La Una Gate Till' && e.method === 'Gate Till'
    && e.source === 'pos_till' && e._customBucket === 'hsp_revenue' && e.voided === false && e.rooms === 0 && e.covers >= 1
    && new RegExp(`^HSP-REV-POS-LAUNA-${DAY_TAG}-[0-9A-F]{6}$`).test(e.id) && isServerOwnedCustomRow('hsp_revenue', e.id) && !isServerOwnedCustomRow('hsp_revenue', 'HSP-REV-900'), e);
  ok('the price includes 11% VAT: net plus VAT is the total', rows.every(x => cents(x.ht_usd) + cents(x.vat_usd) === cents(x.ttc_usd) && cents(x.ht_usd) === Math.round(cents(x.ttc_usd) / 1.11)), rows.map(x => [x.ht_usd, x.vat_usd, x.ttc_usd]));
  ok('Blanca, with no date, posts nothing', live('BLANCA').length === 0 && billed('BLANCA', DAY) > 0);

  // A sale with two categories, one priced in LBP: 2 x $20 entrance + 3 x 100,000 LBP snacks at 90,000 = $43.33.
  const mixed = sale('sale-mix-1', { userId: 'user-m', userName: 'Mix', totalUSD: 43.33, totalLBP: 3900000, netUSD: 43.33, lines: [
    { sku: 'ENT-ADULT', name: 'Entrance - Adult', category: 'Entrance', qty: 2, price: 20, cur: 'USD' },
    { sku: 'SNK-1', name: 'Snack', category: 'Snack Bar', qty: 3, price: 100000, cur: 'LBP' }] });
  const entBefore = cents(live('LAUNA', DAY).find(x => x.category === 'Beach Entrance').ttc_usd);
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [mixed] }, { key: KEY_LAUNA });
  const snack = live('LAUNA', DAY).find(x => x.category === 'Snack Bar');
  const entAfter = cents(live('LAUNA', DAY).find(x => x.category === 'Beach Entrance').ttc_usd);
  ok('a sale is split across its categories by value, and the parts add up to the sale', r.json.ok && r.json.revenueRows === 2 && snack && snack.covers === 3
    && cents(snack.ttc_usd) + (entAfter - entBefore) === 4333 && cents(snack.ttc_usd) === 333 && posted('LAUNA', DAY) === billed('LAUNA', DAY), [snack, entAfter - entBefore]);
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [mixed] }, { key: KEY_LAUNA });
  ok('a replay changes nothing', r.json.revenueRows === 0 && live('LAUNA', DAY).find(x => x.category === 'Snack Bar').rev === snack.rev, r.json);
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [Object.assign({}, mixed, { voided: true, rev: 1 })] }, { key: KEY_LAUNA });
  const snackGone = revRows().find(x => x.row_id === snack.row_id);
  ok('voiding the only sale of a category withdraws its row, and the day still ties', snackGone.rowVoided === 1 && snackGone.voided === true && snackGone.rev === snack.rev + 1
    && posted('LAUNA', DAY) === billed('LAUNA', DAY) && posted('LAUNA', DAY) === tillBilled('La Una', DAY), snackGone);
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [sale('sale-nolines', { userId: 'user-m', userName: 'Mix', lines: [], totalUSD: 7, netUSD: 7 })] }, { key: KEY_LAUNA });
  ok('a sale with no lines is still counted, under its own heading', live('LAUNA', DAY).some(x => x.category === 'Gate Till Sales' && cents(x.ttc_usd) === 700)
    && posted('LAUNA', DAY) === billed('LAUNA', DAY), live('LAUNA', DAY).map(x => [x.category, x.ttc_usd]));

  // The Command Center cannot restate or hide these rows, by either write path.
  const target = live('LAUNA', DAY).find(x => x.category === 'Beach Entrance');
  const ownerSeat = { id: 'u1', role: 'Owner', email: 'owner@example.test', full_name: 'Owner', companies: 'ALL', pbi_access: 'full' };
  const body = { industryCustomRows: { hsp_revenue: [
    Object.assign({}, target, { rev: 999, ttc_usd: 1, ht_usd: 1, vat_usd: 0 }),
    { id: 'HSP-REV-900', date: DAY, company: 'La Una', outlet: 'Hand keyed', category: 'Restaurant F&B', ht_usd: 9.01, vat_usd: 0.99, ttc_usd: 10, rev: 1 }
  ] }, industryRowEdits: { ['WF::hsp_revenue::' + target.id]: { company: 'La Una', ttc_usd: 1, rev: 9 }, [target.id]: { company: 'La Una', voided: true, rev: 9 } } };
  const req = new Request('https://example.test/app/api/industry_domain_store', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const res = await (await handleIndustryDomainStore(req, env, ownerSeat, body)).json();
  const afterPost = revRows().find(x => x.row_id === target.row_id);
  ok('NEGATIVE: a Command Center copy with a higher rev does not change a posted row, a hand-keyed row still saves', afterPost.rev === target.rev && cents(afterPost.ttc_usd) === cents(target.ttc_usd)
    && res.ignoredServerOwned === 3 && d1.rows("SELECT COUNT(*) n FROM industry_custom_rows WHERE row_id = 'HSP-REV-900'")[0].n === 1
    && !d1.rows('SELECT edit_key FROM industry_row_edits').some(x => x.edit_key.includes(target.id)), [res, afterPost.rev]);
  await mirrorStoreDeltaToD1Tables(d1, { industryCustomRows: { hsp_revenue: [Object.assign({}, target, { rev: 999, voided: true })] }, industryRowEdits: {} }, {}, ownerSeat);
  const doc = stripServerOwnedCustomRows({ industryCustomRows: { hsp_revenue: [Object.assign({}, target, { rev: 999 }), { id: 'HSP-REV-900' }] }, industryRowEdits: { ['WF::hsp_revenue::' + target.id]: {}, 'WF::hsp_revenue::HSP-REV-900': {} } });
  ok('NEGATIVE: the sync mirror and the shared store document hold the same line', revRows().find(x => x.row_id === target.row_id).rowVoided === 0
    && JSON.stringify(doc.industryCustomRows.hsp_revenue.map(x => x.id)) === '["HSP-REV-900"]' && JSON.stringify(Object.keys(doc.industryRowEdits)) === '["WF::hsp_revenue::HSP-REV-900"]', doc);

  // Two tills of the same resort send at the same instant: the day's revenue rows still tie to the sales.
  const pair = await Promise.all(['a', 'b', 'c'].map(x => call({ op: 'pos_sales', resort: 'LAUNA', sales: [
    sale('sale-same-instant-' + x, { userId: 'user-' + x + x, userName: 'Twin ' + x, totalUSD: 11.11, netUSD: 11.11 })] }, { key: KEY_LAUNA })));
  ok('batches landing together leave venue revenue equal to the stored sales', pair.every(p => p.json.ok) && posted('LAUNA', DAY) === billed('LAUNA', DAY)
    && posted('LAUNA', DAY) === tillBilled('La Una', DAY), [posted('LAUNA', DAY), billed('LAUNA', DAY), tillBilled('La Una', DAY)]);

  // A second till batch lands between the moment the first one read the day's sales and the moment it
  // writes the rows: the first one must notice and total the day again.
  let nested = null;
  d1.beforeBatch = async () => {
    nested = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [sale('sale-race-inner', { userId: 'user-ri', userName: 'Race In', totalUSD: 7.77, netUSD: 7.77 })] }, { key: KEY_LAUNA });
  };
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [sale('sale-race-outer', { userId: 'user-ro', userName: 'Race Out', totalUSD: 5.55, netUSD: 5.55 })] }, { key: KEY_LAUNA });
  ok('a batch that lands mid-write is not lost from venue revenue', r.json.ok && nested && nested.json.ok && posted('LAUNA', DAY) === billed('LAUNA', DAY)
    && posted('LAUNA', DAY) === tillBilled('La Una', DAY), [posted('LAUNA', DAY), billed('LAUNA', DAY)]);

  // The Owner clears the date at the moment a till batch is writing that day's rows.
  let cleared = null;
  d1.beforeBatch = async () => { cleared = await setFrom('LAUNA', ''); };
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [sale('sale-date-race', { userId: 'user-ro', userName: 'Race Out', totalUSD: 3.33, netUSD: 3.33 })] }, { key: KEY_LAUNA });
  ok('NEGATIVE: a date cleared during a till batch leaves no revenue row behind', r.json.ok && cleared && cleared.json.ok && live('LAUNA').length === 0, live('LAUNA').map(x => x.row_id));
  r = await setFrom('LAUNA', DAY);
  ok('setting the date again posts the day in full', posted('LAUNA', DAY) === billed('LAUNA', DAY) && posted('LAUNA', DAY) > 0, [posted('LAUNA', DAY), billed('LAUNA', DAY)]);

  // Sales keep landing through every attempt to total the day: the till is told to send again, never a wrong total.
  let storm = 0;
  const rearm = async () => {
    storm++;
    d1.beforeBatch = rearm;
    d1.exec(`INSERT INTO kiosk_pos_sales (id, site_key, day, num, user_id, user_name, total_usd, total_lbp, net_usd, net_lbp, rate, voided, rev, payload_json, updated_at)
      VALUES ('sale-storm-${storm}', 'launa', '${DAY}', '', 'user-st', 'Storm', 1, 90000, 1, 0, 90000, 0, 0, '{"lines":[]}', '${new Date().toISOString()}-${storm}')`);
  };
  d1.beforeBatch = rearm;
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [sale('sale-unsettled', { userId: 'user-ro', userName: 'Race Out', totalUSD: 2.22, netUSD: 2.22 })] }, { key: KEY_LAUNA });
  d1.beforeBatch = null;
  ok('NEGATIVE: a day that never settles is not acknowledged', r.status === 503 && r.json.ok === false && storm >= 4, [r.status, storm]);
  d1.exec("DELETE FROM kiosk_pos_sales WHERE id LIKE 'sale-storm-%'");   // the stand-in sales never went through a till
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [sale('sale-unsettled', { userId: 'user-ro', userName: 'Race Out', totalUSD: 2.22, netUSD: 2.22 })] }, { key: KEY_LAUNA });
  ok('and the resend settles it', r.json.ok && posted('LAUNA', DAY) === billed('LAUNA', DAY), [posted('LAUNA', DAY), billed('LAUNA', DAY)]);

  // If the revenue rows cannot be written, the till is told to send the batch again.
  d1.beforeBatch = async () => { throw new Error('rows table unavailable'); };
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [sale('sale-rev-fail', { userId: 'user-ro', userName: 'Race Out', totalUSD: 4.44, netUSD: 4.44 })] }, { key: KEY_LAUNA });
  ok('NEGATIVE: a failed venue revenue write is not acknowledged', r.status === 503 && r.json.ok === false && !r.json.sales && posted('LAUNA', DAY) !== billed('LAUNA', DAY), r);
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [sale('sale-rev-fail', { userId: 'user-ro', userName: 'Race Out', totalUSD: 4.44, netUSD: 4.44 })] }, { key: KEY_LAUNA });
  ok('the resend brings venue revenue back in line', r.json.ok && posted('LAUNA', DAY) === billed('LAUNA', DAY), [posted('LAUNA', DAY), billed('LAUNA', DAY)]);

  // A date whose re-total was cut short is repaired by saving the same date again.
  await setFrom('LAUNA', '');
  d1.beforeBatch = async () => { throw new Error('rows table unavailable'); };
  let threw = false;
  try { r = await setFrom('LAUNA', DAY); } catch (_) { threw = true; }
  const stuck = (await call({ op: 'get_pos_revenue_posting' }, { session: OWNER })).json.sites.find(s => s.code === 'LAUNA').from;
  ok('a re-total that fails is reported, not passed off as saved', !threw && r.status === 503 && r.json.ok === false && posted('LAUNA', DAY) === 0 && stuck === DAY, { threw, status: r && r.status, stuck });
  r = await setFrom('LAUNA', DAY);
  ok('saving the same date again completes it', r.json.ok && r.json.changedRows > 0 && posted('LAUNA', DAY) === billed('LAUNA', DAY) && posted('LAUNA', DAY) > 0, [r.json.changedRows, posted('LAUNA', DAY), billed('LAUNA', DAY)]);

  // Totals that are not whole cents are rounded when the sale is taken in, so the day still ties.
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [1, 2, 3].map(n => sale('sale-subcent-' + n, { userId: 'user-sc', userName: 'Sub Cent', totalUSD: 10.004, netUSD: 10.004 })) }, { key: KEY_LAUNA });
  ok('sub-cent totals still tie to the cent', r.json.ok && posted('LAUNA', DAY) === billed('LAUNA', DAY) && posted('LAUNA', DAY) === tillBilled('La Una', DAY)
    && cents(tillRow('Sub Cent', DAY).pos_billed_ttc) === 3000, [posted('LAUNA', DAY), billed('LAUNA', DAY), tillBilled('La Una', DAY)]);

  // Moving the date.
  const revBefore = revRows().find(x => x.row_id === target.row_id).rev;
  r = await setFrom('LAUNA', isoDay(1));
  ok('moving the date later withdraws the days before it', r.json.ok && r.json.changedRows >= 1 && live('LAUNA').length === 0
    && revRows().find(x => x.row_id === target.row_id).rev === revBefore + 1, [r.json.changedRows, live('LAUNA').length]);
  r = await call({ op: 'pos_sales', resort: 'LAUNA', sales: [sale('sale-after-move', { userId: 'user-m', userName: 'Mix' })] }, { key: KEY_LAUNA });
  ok('a sale on a day before the date posts no revenue row', r.json.ok && r.json.revenueRows === 0 && live('LAUNA').length === 0, r.json);
  r = await setFrom('LAUNA', DAY_PREV);
  ok('moving it earlier posts both days, each tying to its sales', posted('LAUNA', DAY) === billed('LAUNA', DAY) && posted('LAUNA', DAY_PREV) === billed('LAUNA', DAY_PREV)
    && posted('LAUNA', DAY_PREV) === 30 && revRows().find(x => x.row_id === target.row_id).rev === revBefore + 2, [posted('LAUNA', DAY), billed('LAUNA', DAY), posted('LAUNA', DAY_PREV)]);
  r = await setFrom('LAUNA', DAY_PREV);
  ok('saving the same date again changes nothing', r.json.ok && r.json.changedRows === 0, r.json);
  r = await call({ op: 'set_pos_revenue_posting', site: 'LAUNA', from: isoDay(1), expect: DAY }, { session: OWNER });
  ok('NEGATIVE: a window that still shows an older date cannot move it without seeing the current one', r.status === 409 && r.json.ok === false
    && r.json.sites.find(s => s.code === 'LAUNA').from === DAY_PREV
    && (await call({ op: 'get_pos_revenue_posting' }, { session: OWNER })).json.sites.find(s => s.code === 'LAUNA').from === DAY_PREV, r);
  r = await call({ op: 'set_pos_revenue_posting', site: 'LAUNA', from: DAY_PREV, expect: DAY_PREV }, { session: OWNER });
  ok('a window that shows the current date saves as before', r.json.ok === true, r.json);
  r = await setFrom('LAUNA', '');
  ok('clearing the date withdraws every posted row and stops posting', r.json.ok && live('LAUNA').length === 0 && r.json.sites.find(s => s.code === 'LAUNA').from === ''
    && (await call({ op: 'pos_sales', resort: 'LAUNA', sales: [sale('sale-after-clear', { userId: 'user-m', userName: 'Mix' })] }, { key: KEY_LAUNA })).json.revenueRows === 0
    && live('LAUNA').length === 0, r.json);
  ok('the till close register was never touched by any of this', tillBilled('La Una', DAY) === billed('LAUNA', DAY), [tillBilled('La Una', DAY), billed('LAUNA', DAY)]);
  ok('no em dash or arrow in stored text', !/[—→]/.test(JSON.stringify(revRows())));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
