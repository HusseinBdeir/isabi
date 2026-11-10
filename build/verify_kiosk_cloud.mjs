// Offline check of the kiosk Edge endpoint (functions/_lib/kiosk_verify.js) against an in-memory
// SQLite database standing in for D1. Covers the two tablet apps that sync through it:
//   - the resort gate till (op pos_sales -> kiosk_pos_sales -> POS till close register, bucket hsp_pos)
//   - the standalone attendance tablet (ops sync / roster / verify)
// and the Command Center write path that must never overwrite a server-totalled till close row.
// Run: node build/verify_kiosk_cloud.mjs      (Node 22.5+ for node:sqlite; touches nothing live)

import { DatabaseSync } from 'node:sqlite';
import { handleKioskVerify } from '../functions/_lib/kiosk_verify.js';
import {
  handleIndustryDomainStore, isServerOwnedCustomRow, isServerOwnedRowEditKey,
  mirrorStoreDeltaToD1Tables, stripServerOwnedCustomRows
} from '../functions/_lib/d1_store.js';
import { canAccessCompany, isOwnerOrFullGroupSession } from '../functions/_lib/security.js';

// ---- minimal D1 stand-in ----
class Stmt {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...p) { return new Stmt(this.db, this.sql, p); }
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
  async run() { const r = this.db.prepare(this.sql).run(...this.args()); return { success: true, meta: { changes: r.changes } }; }
}
class D1 {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  prepare(sql) { return new Stmt(this.db, sql); }
  async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.all()); return out; }
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
