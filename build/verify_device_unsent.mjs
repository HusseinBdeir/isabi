// Offline check of the device report route (functions/_lib/d1_store.js, "Entries held on a device"), driven through
// the real router (functions/app/api/[[route]].js) against an in-memory SQLite database standing in for D1.
//
// Owner 2026-11-18: one device kept a day of entries to itself and they reached the store after the top-up. A device
// now reports what it holds; the Owner reads the list. This gate pins down that:
//   - any signed-in seat may report its own device; nobody without a session, and never the Demo sandbox;
//   - the seat, e-mail and name stored come from the session, whatever the request says;
//   - a seat's report lands in its own row (seat id + device id): it cannot change another seat's row;
//   - only the Owner reads the list; "sent" after an hour or more turns a holding device into "arrived late" for
//     48 hours, and a shorter hold (a signal drop) is simply removed;
//   - a seat whose sync has sent everything closes the reports other seats left open for the same device when it
//     may use every company those seats were limited to (an Owner or full-group seat: any); never otherwise;
//   - bad input is refused, the first reported wait wins while the device keeps holding, old rows drop out;
//   - /api/sync neither serves nor patches these rows.
// Nothing live is touched.   Run: node build/verify_device_unsent.mjs      (Node 22.5+ for node:sqlite)

import { DatabaseSync } from 'node:sqlite';
import { onRequest } from '../functions/app/api/[[route]].js';
import { signEdgeSession } from '../functions/_lib/security.js';
import {
  DEVICE_UNSENT_HOLD_DAYS,
  DEVICE_UNSENT_LATE_HOURS,
  DEVICE_UNSENT_LATE_MIN_MS,
  effectiveMinSyncShellVer,
  isDeviceUnsentDoc,
  listDeviceUnsentRows,
  packSyncVoidRefusals,
  SYNC_VOID_REFUSED_MAX,
  validateDeviceUnsentReport
} from '../functions/_lib/d1_store.js';

// ---- minimal D1 stand-in (same binding rules as build/verify_build_ticket.mjs) ----
class Stmt {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...p) { return new Stmt(this.db, this.sql, p); }
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
  runSync() {
    if (/^\s*(SELECT|WITH)\b/i.test(this.sql)) return { results: this.db.prepare(this.sql).all(...this.args()) };
    const r = this.db.prepare(this.sql).run(...this.args()); return { success: true, results: [], meta: { changes: r.changes } };
  }
}
class D1 {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  prepare(sql) { return new Stmt(this.db, sql); }
  async batch(stmts) {
    this.db.exec('BEGIN');
    try { const out = stmts.map(s => s.runSync()); this.db.exec('COMMIT'); return out; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  exec(sql) { this.db.exec(sql); }
  one(sql, ...p) { return this.db.prepare(sql).get(...p); }
  rows(sql, ...p) { return this.db.prepare(sql).all(...p); }
}

const d1 = new D1();
d1.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, full_name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, pin_code TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'Entry', companies TEXT NOT NULL DEFAULT 'WTC', pbi_access TEXT DEFAULT 'full',
  statements_access TEXT DEFAULT 'full', status TEXT DEFAULT 'Active', last_login_at TEXT DEFAULT '',
  face_samples TEXT DEFAULT '[]', face_thumbs TEXT DEFAULT '[]', face_required INTEGER DEFAULT 0,
  face_updated_at TEXT DEFAULT '', seat_updated_at TEXT DEFAULT '', custom_perms TEXT DEFAULT '{}',
  auth_mode TEXT DEFAULT '', payload_json TEXT DEFAULT '{}');
  CREATE TABLE auth_sessions (id TEXT PRIMARY KEY, user_id TEXT DEFAULT '', email TEXT DEFAULT '', full_name TEXT DEFAULT '',
  role TEXT DEFAULT '', companies TEXT DEFAULT '', device TEXT DEFAULT '', logged_in_at TEXT DEFAULT '', method TEXT DEFAULT 'PIN',
  confidence REAL, ip_hash TEXT DEFAULT '');
  CREATE TABLE fx_rates (id TEXT PRIMARY KEY, name TEXT DEFAULT '', currency TEXT DEFAULT 'LBP', start_date TEXT DEFAULT '', end_date TEXT DEFAULT '',
  amount REAL DEFAULT 89500, source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0,
  voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '',
  rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
  CREATE TABLE vat_rates (id TEXT PRIMARY KEY, name TEXT DEFAULT '', start_date TEXT DEFAULT '', end_date TEXT DEFAULT '',
  amount REAL DEFAULT 11, source TEXT DEFAULT '', entered_by TEXT DEFAULT '', entered_at TEXT DEFAULT '', voided INTEGER DEFAULT 0,
  voided_by TEXT DEFAULT '', voided_at TEXT DEFAULT '', modified_by TEXT DEFAULT '', modified_at TEXT DEFAULT '', notes TEXT DEFAULT '',
  rev INTEGER DEFAULT 1, payload_json TEXT DEFAULT '{}');
  CREATE TABLE edge_kv_store (doc_key TEXT PRIMARY KEY, payload_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL DEFAULT '',
  updated_by TEXT DEFAULT '', rev INTEGER DEFAULT 1);`);
const env = { DB: d1, ISABI_JWT_SECRET: 'device-unsent-offline-test-secret-' + Math.random().toString(36).slice(2) };
const seat = (id, name, email, role, cos) => {
  d1.db.prepare('INSERT INTO users (id, full_name, email, role, companies) VALUES (?,?,?,?,?)').run(id, name, email, role, cos);
  d1.db.prepare('INSERT INTO auth_sessions (id, user_id, email, full_name, role, companies) VALUES (?,?,?,?,?,?)').run('sess-' + id, id, email, name, role, cos);
  return signEdgeSession({ sid: 'sess-' + id, sub: id, email, name, role, companies: cos }, env);
};
const OWNER = await seat('u1', 'Owner Seat', 'owner.seat@example.test', 'Full Access (Owner)', 'All');
const ENTRY = await seat('u7', 'Entry Seat', 'entry.seat@example.test', 'Entry', 'WTC');
const SUP = await seat('u3', 'Supervisor Seat', 'sup.seat@example.test', 'Supervisor', 'WTC');
const BBC = await seat('u9', 'BBC Entry Seat', 'bbc.seat@example.test', 'Entry', 'BBConstruction');
const BOTH = await seat('u8', 'Two Company Seat', 'both.seat@example.test', 'Entry', 'WTC, BBConstruction');

async function api(path, { method = 'GET', body, headers = {}, raw } = {}) {
  const h = Object.assign({ 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.9.0.2', 'X-ISABI-Shell': effectiveMinSyncShellVer() }, headers);
  const req = new Request(`https://example.test/app/api/${path}`, { method, headers: h, body: method === 'GET' ? undefined : (raw !== undefined ? raw : JSON.stringify(body || {})) });
  const res = await onRequest({ request: req, env, params: { route: path.split('?')[0].split('/') } });
  const txt = await res.text();
  let json = null; try { json = JSON.parse(txt); } catch (_) {}
  return { status: res.status, json, txt };
}
const as = tok => ({ 'X-ISABI-Session': tok });
const iso = ms => new Date(ms).toISOString();
const NOW = Date.now();
const DEV_A = 'devaaaaaaaaaaa1', DEV_B = 'devbbbbbbbbbbb2';
const report = (over = {}) => Object.assign({ device_id: DEV_A, label: 'Android Tablet', count: 20, since: iso(NOW - 3600000), reason: 'update', shell: '19.6.390' }, over);
const kv = key => { const r = d1.one('SELECT payload_json FROM edge_kv_store WHERE doc_key = ?', key); return r ? JSON.parse(r.payload_json) : null; };

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail).slice(0, 500) : '')); }
}

console.log('\n[who may call]');
{
  let r = await api('device_unsent');
  ok('GET without a sign-in -> 401', r.status === 401, r);
  r = await api('device_unsent', { method: 'POST', body: report() });
  ok('POST without a sign-in -> 401, nothing stored', r.status === 401 && d1.rows("SELECT doc_key FROM edge_kv_store WHERE doc_key LIKE 'device_unsent:%'").length === 0, r);
  r = await api('device_unsent', { headers: { 'X-ISABI-Demo': '1' } });
  ok('GET from the Demo sandbox -> an empty list with minSyncShellVer', r.status === 200 && r.json.demo === true && Array.isArray(r.json.devices) && r.json.devices.length === 0 && r.json.minSyncShellVer === effectiveMinSyncShellVer(), r);
  r = await api('device_unsent', { method: 'POST', body: report(), headers: Object.assign({ 'X-ISABI-Demo': '1' }, as(ENTRY)) });
  ok('POST with the Demo header -> 403, nothing stored', r.status === 403 && d1.rows("SELECT doc_key FROM edge_kv_store WHERE doc_key LIKE 'device_unsent:%'").length === 0, r);
  r = await api('device_unsent', { headers: as(ENTRY) });
  ok('GET as an Entry seat -> 403', r.status === 403, r);
  r = await api('device_unsent', { headers: as(SUP) });
  ok('GET as a Supervisor -> 403', r.status === 403, r);
  r = await api('device_unsent', { headers: as(OWNER) });
  ok('GET as the Owner -> 200 with an empty list and minSyncShellVer', r.status === 200 && r.json.ok === true && r.json.devices.length === 0 && r.json.minSyncShellVer === effectiveMinSyncShellVer(), r);
  r = await api('device_unsent', { method: 'PUT', body: report(), headers: as(OWNER) });
  ok('another method -> 405', r.status === 405, r);
}

console.log('\n[a report]');
{
  let r = await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: report({ email: 'owner.seat@example.test', user_id: 'u1', name: 'Forged Name', state: 'sent_late' }) });
  const row = kv(`device_unsent:u7:${DEV_A}`);
  ok('an Entry seat reports its device -> 200 holding', r.status === 200 && r.json.state === 'holding', r);
  ok('the row is filed under the seat of the session', Boolean(row) && row.user_id === 'u7' && row.email === 'entry.seat@example.test' && row.name === 'Entry Seat', row);
  ok('fields the request tried to set (e-mail, seat, name, state) are ignored', row.state === 'holding' && row.name !== 'Forged Name' && !kv(`device_unsent:u1:${DEV_A}`), row);
  ok('count, since, reason, label and shell are kept', row.count === 20 && row.reason === 'update' && row.label === 'Android Tablet' && row.shell === '19.6.390' && row.since === iso(NOW - 3600000), row);
  r = await api('device_unsent', { headers: as(OWNER) });
  const d = r.json.devices[0];
  ok('the Owner list shows it', r.json.devices.length === 1 && d.state === 'holding' && d.count === 20 && d.email === 'entry.seat@example.test' && d.device_id === DEV_A && d.sent_count === 0, r.json);

  // a later report with a later "since" (the page was reloaded): the first reported wait wins
  r = await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: report({ count: 23, since: iso(NOW - 60000), reason: 'offline' }) });
  let row2 = kv(`device_unsent:u7:${DEV_A}`);
  ok('a later report updates the count and reason and keeps the earlier start of the wait', row2.count === 23 && row2.reason === 'offline' && row2.since === iso(NOW - 3600000), row2);
  r = await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: report({ count: 23, since: iso(NOW - 7200000) }) });
  row2 = kv(`device_unsent:u7:${DEV_A}`);
  ok('an earlier start is taken', row2.since === iso(NOW - 7200000), row2);
}

console.log('\n[one row per seat and device]');
{
  let r = await api('device_unsent', { method: 'POST', headers: as(SUP), body: report({ count: 2, reason: 'sign_in' }) });
  ok('another seat with the same device id gets its own row', r.status === 200 && kv(`device_unsent:u3:${DEV_A}`).count === 2 && kv(`device_unsent:u7:${DEV_A}`).count === 23, r);
  r = await api('device_unsent', { method: 'POST', headers: as(SUP), body: report({ device_id: DEV_A, count: 0 }) });
  ok('its "sent" touches only its own row', kv(`device_unsent:u3:${DEV_A}`).state === 'sent_late' && kv(`device_unsent:u7:${DEV_A}`).state === 'holding', r);
  r = await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: report({ device_id: DEV_B, count: 1, reason: 'retrying' }) });
  ok('a second device of one seat is a second row', kv(`device_unsent:u7:${DEV_B}`).count === 1 && d1.rows("SELECT doc_key FROM edge_kv_store WHERE doc_key LIKE 'device_unsent:%'").length === 3, r);
  r = await api('device_unsent', { headers: as(OWNER) });
  const states = r.json.devices.map(x => x.state);
  ok('the Owner list puts devices still holding first, oldest wait first, then those that arrived late', r.json.devices.length === 3 && states.join() === 'holding,holding,sent_late' && r.json.devices[0].device_id === DEV_A && r.json.devices[2].user_id === 'u3' && r.json.devices[2].sent_count === 2 && r.json.devices[2].count === 0, r.json);
}

console.log('\n[sent]');
{
  let r = await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: { device_id: DEV_A, count: 0, shell: '19.6.391' } });
  const row = kv(`device_unsent:u7:${DEV_A}`);
  ok('"sent" on a holding device -> arrived late, with how many and when', r.json.state === 'sent_late' && row.state === 'sent_late' && row.sent_count === 23 && row.count === 0 && /^\d{4}-/.test(row.sent_at) && row.since === iso(NOW - 7200000), row);
  r = await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: { device_id: DEV_A, count: 0 } });
  ok('"sent" again changes nothing', r.status === 200 && r.json.saved === false && kv(`device_unsent:u7:${DEV_A}`).sent_at === row.sent_at, r);
  r = await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: { device_id: 'neverreported01', count: 0 } });
  ok('"sent" from a device that never reported stores nothing', r.status === 200 && r.json.saved === false && !kv('device_unsent:u7:neverreported01'), r);
  r = await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: report({ count: 4, since: iso(NOW - 600000) }) });
  const again = kv(`device_unsent:u7:${DEV_A}`);
  ok('holding again after that starts a new wait', again.state === 'holding' && again.count === 4 && again.since === iso(NOW - 600000) && !('sent_at' in again), again);
}

console.log('\n[a short hold, and a shared device]');
{
  ok('a hold counts as late from one hour', DEVICE_UNSENT_LATE_MIN_MS === 3600000);
  const DEV_S = 'devssssssssss04';
  let r = await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: report({ device_id: DEV_S, count: 2, since: iso(Date.now() - 20 * 60000), reason: 'retrying' }) });
  ok('a device that has held entries for 20 minutes is listed as holding', r.json.state === 'holding' && kv(`device_unsent:u7:${DEV_S}`).count === 2, r);
  r = await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: { device_id: DEV_S, count: 0 } });
  ok('... and once sent it is removed, not listed as late (a signal drop is no Owner alert)', r.json.saved === true && r.json.state === 'cleared' && !kv(`device_unsent:u7:${DEV_S}`), r);

  // a shared device: the WTC Entry seat reported and left; other seats sign in on the same device
  const DEV_SH = 'devshared000005';
  const openRows = () => d1.rows("SELECT doc_key, payload_json FROM edge_kv_store WHERE doc_key LIKE ?", `%:${DEV_SH}`).filter(x => JSON.parse(x.payload_json).state === 'holding').map(x => x.doc_key).sort();
  await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: report({ device_id: DEV_SH, count: 6, since: iso(NOW - 5 * 3600000) }) });
  ok('a holding report keeps the companies its seat is limited to', JSON.stringify(kv(`device_unsent:u7:${DEV_SH}`).companies) === '["WTC"]', kv(`device_unsent:u7:${DEV_SH}`));
  r = await api('device_unsent', { method: 'POST', headers: as(BBC), body: { device_id: DEV_SH, count: 0, all_seats: true } });
  ok('a seat of another company cannot close it, even asking for all seats; the answer says one report is still open', r.json.saved === false && r.json.open === 1 && kv(`device_unsent:u7:${DEV_SH}`).state === 'holding', r);
  r = await api('device_unsent', { method: 'POST', headers: as(SUP), body: { device_id: DEV_SH, count: 0 } });
  ok('a seat of the same company without all_seats touches only its own row', r.json.saved === false && r.json.open === 1 && kv(`device_unsent:u7:${DEV_SH}`).state === 'holding', r);
  r = await api('device_unsent', { method: 'POST', headers: as(SUP), body: { device_id: DEV_SH, count: 0, all_seats: true } });
  let sh = kv(`device_unsent:u7:${DEV_SH}`);
  ok('a seat of the same company, whose sync sent that company\'s rows, closes it: arrived late, still under the seat that held it', r.json.saved === true && r.json.state === 'sent_late' && r.json.open === 0 && sh.state === 'sent_late' && sh.sent_count === 6 && sh.user_id === 'u7', { r, sh });
  ok('... and only for that device', kv(`device_unsent:u7:${DEV_A}`).state === 'holding' && kv(`device_unsent:u7:${DEV_B}`).state === 'holding');

  // a seat limited to two companies reported; a seat limited to one of them cannot vouch for the other
  await api('device_unsent', { method: 'POST', headers: as(BOTH), body: report({ device_id: DEV_SH, count: 4, since: iso(NOW - 3 * 3600000) }) });
  r = await api('device_unsent', { method: 'POST', headers: as(SUP), body: { device_id: DEV_SH, count: 0, all_seats: true } });
  ok('a report of a two-company seat is not closed by a seat limited to one of them', r.json.saved === false && r.json.open === 1 && kv(`device_unsent:u8:${DEV_SH}`).state === 'holding', r);
  r = await api('device_unsent', { method: 'POST', headers: as(OWNER), body: { device_id: DEV_SH, count: 0 } });
  ok('the Owner without all_seats touches only its own row', r.json.saved === false && r.json.open === 1 && kv(`device_unsent:u8:${DEV_SH}`).state === 'holding', r);
  await api('device_unsent', { method: 'POST', headers: as(BBC), body: report({ device_id: DEV_SH, count: 2, since: iso(NOW - 2 * 3600000) }) });
  ok('two reports are open for the device', openRows().length === 2, openRows());
  r = await api('device_unsent', { method: 'POST', headers: as(OWNER), body: { device_id: DEV_SH, count: 0, all_seats: true } });
  ok('the Owner, who sends every company\'s rows, closes them all', r.json.saved === true && r.json.open === 0 && openRows().length === 0 && kv(`device_unsent:u8:${DEV_SH}`).sent_count === 4 && kv(`device_unsent:u9:${DEV_SH}`).sent_count === 2, { r, open: openRows() });
  await api('device_unsent', { method: 'POST', headers: as(OWNER), body: report({ device_id: DEV_SH, count: 1 }) });
  ok('an Owner\'s own report says it covers every company, so no limited seat closes it', JSON.stringify(kv(`device_unsent:u1:${DEV_SH}`).companies) === '["*"]'
    && (await api('device_unsent', { method: 'POST', headers: as(BOTH), body: { device_id: DEV_SH, count: 0, all_seats: true } })).json.open === 1 && kv(`device_unsent:u1:${DEV_SH}`).state === 'holding');
  r = await api('device_unsent', { method: 'POST', headers: as(OWNER), body: report({ device_id: DEV_SH, count: 1, all_seats: true }) });
  ok('all_seats means nothing on a holding report', r.json.state === 'holding' && kv(`device_unsent:u8:${DEV_SH}`).state === 'sent_late', r);
}

console.log('\n[never able to report: arrived late]');
{
  const DEV_L = 'devlate00000006';
  let r = await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: { device_id: DEV_L, label: 'Android Tablet', count: 20, since: iso(Date.now() - 20 * 3600000), sent_late: true, shell: '19.6.391' } });
  const row = kv(`device_unsent:u7:${DEV_L}`);
  ok('a device that was offline for 20 hours files its entries as arrived late once they are sent', r.json.saved === true && r.json.state === 'sent_late' && row.state === 'sent_late' && row.sent_count === 20 && row.count === 0 && row.user_id === 'u7' && /^\d{4}-/.test(row.sent_at), { r, row });
  r = await api('device_unsent', { headers: as(OWNER) });
  const d = r.json.devices.find(x => x.device_id === DEV_L);
  ok('the Owner list shows it as arrived late', Boolean(d) && d.state === 'sent_late' && d.sent_count === 20, d);
  r = await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: { device_id: 'devlate00000007', count: 3, since: iso(Date.now() - 30 * 60000), sent_late: true } });
  ok('a wait under an hour is no late arrival: nothing stored', r.status === 200 && r.json.saved === false && !kv('device_unsent:u7:devlate00000007'), r);
  r = await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: { device_id: 'devlate00000008', count: 0, since: iso(Date.now() - 5 * 3600000), sent_late: true } });
  ok('arrived late with nothing sent stores nothing', r.status === 200 && r.json.saved === false && !kv('device_unsent:u7:devlate00000008'), r);
  r = await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: { device_id: 'devlate00000009', count: 3, since: 'long ago', sent_late: true } });
  ok('arrived late still needs a real start time', r.status === 400, r);
}

console.log('\n[bad input]');
{
  const bad = async (over, raw) => (await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: raw === undefined ? report(over) : undefined, raw })).status;
  ok('device id with other characters -> 400', await bad({ device_id: '../../etc/passwd' }) === 400);
  ok('device id too short -> 400', await bad({ device_id: 'abc' }) === 400);
  ok('a colon in the device id (another key) -> 400', await bad({ device_id: 'u1:devaaaaaaaaaaa1' }) === 400);
  ok('negative count -> 400', await bad({ count: -1 }) === 400);
  ok('fractional count -> 400', await bad({ count: 2.5 }) === 400);
  ok('count as text -> 400', await bad({ count: '7' }) === 400);
  ok('unknown reason -> 400', await bad({ reason: 'because' }) === 400);
  ok('since in the future -> 400', await bad({ since: iso(NOW + 3600000) }) === 400);
  ok('since older than 90 days -> 400', await bad({ since: iso(NOW - 91 * 86400000) }) === 400);
  ok('since not a date -> 400', await bad({ since: 'yesterday' }) === 400);
  ok('an empty body -> 400', await bad(null, '') === 400);
  ok('broken JSON -> 400', await bad(null, '{"device_id":') === 400);
  ok('a list instead of an object -> 400', await bad(null, '[1,2]') === 400);
  ok('a body over 2 KB -> 413', await bad({ label: 'x'.repeat(4000) }) === 413);
  const r = await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: report({ device_id: 'devccccccccccc3', label: '<img src=x onerror=1> "Tab" & co', shell: 'v<script>' }) });
  const row = kv('device_unsent:u7:devccccccccccc3');
  ok('markup in the label is taken out and an odd version is dropped', r.status === 200 && !/[<>"'&]/.test(row.label) && row.shell === '', row);
}

console.log('\n[the list ages]');
{
  ok('holding rows stay 7 days, arrived-late rows 48 hours', DEVICE_UNSENT_HOLD_DAYS === 7 && DEVICE_UNSENT_LATE_HOURS === 48);
  const mk = o => ({ payload_json: JSON.stringify(Object.assign({ device_id: 'x', label: '', user_id: 'u9', email: 'a@b', name: 'N', since: iso(NOW - 86400000) }, o)) });
  const rows = [
    mk({ state: 'holding', count: 3, reported_at: iso(NOW - 6 * 86400000) }),
    mk({ state: 'holding', count: 3, reported_at: iso(NOW - 8 * 86400000) }),
    mk({ state: 'sent_late', sent_count: 5, count: 0, sent_at: iso(NOW - 47 * 3600000) }),
    mk({ state: 'sent_late', sent_count: 5, count: 0, sent_at: iso(NOW - 49 * 3600000) }),
    mk({ state: 'holding', count: 0, reported_at: iso(NOW) }),
    { payload_json: 'not json' },
    { payload_json: '[]' }
  ];
  const out = listDeviceUnsentRows(rows, NOW);
  ok('rows past their time, rows with nothing held and unreadable rows are left out', out.length === 2 && out[0].state === 'holding' && out[1].state === 'sent_late' && out[1].sent_count === 5, out);
  ok('validateDeviceUnsentReport accepts a plain "sent"', validateDeviceUnsentReport({ device_id: DEV_A, count: 0 }, NOW).ok === true);
}

console.log('\n[/api/sync keeps out]');
{
  ok('isDeviceUnsentDoc knows its keys', isDeviceUnsentDoc('device_unsent') && isDeviceUnsentDoc(`device_unsent:u7:${DEV_A}`) && !isDeviceUnsentDoc('mfg_web_store') && !isDeviceUnsentDoc('device'));
  let r = await api('sync', { method: 'POST', headers: as(OWNER), body: { op: 'get', doc: `device_unsent:u7:${DEV_A}` } });
  ok('sync get of a device row -> 403, even for the Owner', r.status === 403, r);
  const before = kv(`device_unsent:u7:${DEV_A}`);
  r = await api('sync', { method: 'POST', headers: as(ENTRY), body: { op: 'patch', doc: 'mfg_web_store', patch: { [`device_unsent:u7:${DEV_A}`]: { state: 'holding', count: 0 } } } });
  ok('sync patch naming a device row -> 403, row unchanged', r.status === 403 && JSON.stringify(kv(`device_unsent:u7:${DEV_A}`)) === JSON.stringify(before), r);
  r = await api('sync', { method: 'POST', headers: as(ENTRY), body: { op: 'patch', doc: `device_unsent:u1:${DEV_A}`, patch: {} } });
  ok('sync patch addressed to a device row -> 403', r.status === 403, r);
}

console.log('\n[owner dismiss]');
{
  const DEV_D = 'devdismiss00010';
  const since0 = iso(NOW - 3 * 3600000);
  await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: report({ device_id: DEV_D, count: 3, since: since0, reason: 'update' }) });

  let r = await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: { action: 'dismiss', user_id: 'u7', device_id: DEV_D } });
  ok('an Entry seat cannot dismiss a holding row -> 403', r.status === 403 && Boolean(kv(`device_unsent:u7:${DEV_D}`)), r);
  r = await api('device_unsent', { method: 'POST', headers: as(SUP), body: { action: 'dismiss', user_id: 'u7', device_id: DEV_D } });
  ok('a Supervisor cannot dismiss a holding row -> 403', r.status === 403, r);

  ok('unknown action -> 400', (await api('device_unsent', { method: 'POST', headers: as(OWNER), body: { action: 'remove', user_id: 'u7', device_id: DEV_D } })).status === 400);
  ok('bad user_id in dismiss -> 400', (await api('device_unsent', { method: 'POST', headers: as(OWNER), body: { action: 'dismiss', user_id: '../u7', device_id: DEV_D } })).status === 400);
  ok('bad device_id in dismiss -> 400', (await api('device_unsent', { method: 'POST', headers: as(OWNER), body: { action: 'dismiss', user_id: 'u7', device_id: 'short' } })).status === 400);

  r = await api('device_unsent', { method: 'POST', headers: as(OWNER), body: { action: 'dismiss', user_id: 'u7', device_id: 'missingdev00001' } });
  ok('dismissing a missing row returns dismissed: false', r.status === 200 && r.json && r.json.ok === true && r.json.dismissed === false, r);

  r = await api('device_unsent', { method: 'POST', headers: as(OWNER), body: { action: 'dismiss', user_id: 'u7', device_id: DEV_D } });
  const listAfterDismiss = await api('device_unsent', { headers: as(OWNER) });
  const storedAfterDismiss = kv(`device_unsent:u7:${DEV_D}`);
  ok('Owner dismisses a holding row -> hidden from Owner list while row retains dismissed_at/count/since',
    r.status === 200 && r.json.dismissed === true && r.json.state === 'holding'
    && Boolean(storedAfterDismiss && storedAfterDismiss.dismissed_at && storedAfterDismiss.dismissed_count === 3 && storedAfterDismiss.dismissed_since === since0)
    && !(listAfterDismiss.json.devices || []).some(d => d.user_id === 'u7' && d.device_id === DEV_D),
    { r, storedAfterDismiss });

  // Repeat heartbeat at <= count and later since keeps row dismissed; earlier since or higher count resurfaces.
  await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: report({ device_id: DEV_D, count: 3, since: iso(NOW - 60000), reason: 'offline' }) });
  const listAfterSame = await api('device_unsent', { headers: as(OWNER) });
  ok('repeat heartbeat with <= count stays dismissed', !(listAfterSame.json.devices || []).some(d => d.user_id === 'u7' && d.device_id === DEV_D), listAfterSame.json);

  await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: report({ device_id: DEV_D, count: 4, since: since0, reason: 'offline' }) });
  const listAfterMore = await api('device_unsent', { headers: as(OWNER) });
  const resurfMore = (listAfterMore.json.devices || []).find(d => d.user_id === 'u7' && d.device_id === DEV_D);
  ok('heartbeat with higher count resurfaces the row in Owner list', Boolean(resurfMore && resurfMore.count === 4 && !kv(`device_unsent:u7:${DEV_D}`).dismissed_at), { resurfMore });

  await api('device_unsent', { method: 'POST', headers: as(OWNER), body: { action: 'dismiss', user_id: 'u7', device_id: DEV_D } });
  const earlierSince = iso(NOW - 5 * 3600000);
  await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: report({ device_id: DEV_D, count: 4, since: earlierSince, reason: 'offline' }) });
  const resurfEarlier = ((await api('device_unsent', { headers: as(OWNER) })).json.devices || []).find(d => d.user_id === 'u7' && d.device_id === DEV_D);
  ok('heartbeat with earlier since resurfaces the dismissed row', Boolean(resurfEarlier && resurfEarlier.since === earlierSince), resurfEarlier);

  // Dismissed holding row cleared after >= 1h still surfaces as sent_late, and dismissing sent_late deletes it.
  await api('device_unsent', { method: 'POST', headers: as(OWNER), body: { action: 'dismiss', user_id: 'u7', device_id: DEV_D } });
  r = await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: { device_id: DEV_D, count: 0 } });
  const lateAfterDismiss = ((await api('device_unsent', { headers: as(OWNER) })).json.devices || []).find(d => d.user_id === 'u7' && d.device_id === DEV_D);
  ok('clearing a dismissed >=1h holding row surfaces as sent_late without dismissed_at', r.json && r.json.state === 'sent_late' && Boolean(lateAfterDismiss && lateAfterDismiss.state === 'sent_late' && !kv(`device_unsent:u7:${DEV_D}`).dismissed_at), { r, lateAfterDismiss });

  r = await api('device_unsent', { method: 'POST', headers: as(OWNER), body: { action: 'dismiss', user_id: 'u7', device_id: DEV_D } });
  ok('dismissing a sent_late row deletes it from edge_kv_store', r.status === 200 && r.json.dismissed === true && r.json.state === 'sent_late' && !kv(`device_unsent:u7:${DEV_D}`), r);

  // Bulk dismiss_late: Owner-only, validated keys, deletes ONLY targeted sent_late rows and preserves holding + untargeted late rows.
  const DEV_BL1 = 'devbulklate0001';
  const DEV_BL2 = 'devbulklate0002';
  const DEV_BL_KEEP = 'devbulklate0003';
  const DEV_BH_HOLD = 'devbulkhold0004';
  const lateSince = iso(NOW - 3 * 3600000);
  await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: { device_id: DEV_BL1, label: 'Tab 1', count: 2, since: lateSince, sent_late: true } });
  await api('device_unsent', { method: 'POST', headers: as(SUP), body: { device_id: DEV_BL2, label: 'Tab 2', count: 4, since: lateSince, sent_late: true } });
  await api('device_unsent', { method: 'POST', headers: as(BBC), body: { device_id: DEV_BL_KEEP, label: 'Tab 3', count: 1, since: lateSince, sent_late: true } });
  await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: report({ device_id: DEV_BH_HOLD, count: 5, since: lateSince, reason: 'offline' }) });

  ok('Entry cannot bulk dismiss_late -> 403', (await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: { action: 'dismiss_late', keys: [`u7:${DEV_BL1}`] } })).status === 403 && Boolean(kv(`device_unsent:u7:${DEV_BL1}`)));
  ok('Supervisor cannot bulk dismiss_late -> 403', (await api('device_unsent', { method: 'POST', headers: as(SUP), body: { action: 'dismiss_late', keys: [`u7:${DEV_BL1}`] } })).status === 403 && Boolean(kv(`device_unsent:u7:${DEV_BL1}`)));
  ok('dismiss_late rejects empty keys -> 400', (await api('device_unsent', { method: 'POST', headers: as(OWNER), body: { action: 'dismiss_late', keys: [] } })).status === 400);
  ok('dismiss_late rejects non-array keys -> 400', (await api('device_unsent', { method: 'POST', headers: as(OWNER), body: { action: 'dismiss_late', keys: `u7:${DEV_BL1}` } })).status === 400);
  ok('dismiss_late rejects > 40 keys -> 400', (await api('device_unsent', { method: 'POST', headers: as(OWNER), body: { action: 'dismiss_late', keys: Array.from({ length: 41 }, (_, i) => `u7:devkey0000000${String(i).padStart(2, '0')}`) } })).status === 400);
  ok('dismiss_late rejects malformed key -> 400', (await api('device_unsent', { method: 'POST', headers: as(OWNER), body: { action: 'dismiss_late', keys: ['../u7:abc'] } })).status === 400);
  ok('dismiss_late rejects non-string element -> 400', (await api('device_unsent', { method: 'POST', headers: as(OWNER), body: { action: 'dismiss_late', keys: [123] } })).status === 400);

  const bulkRes = await api('device_unsent', {
    method: 'POST',
    headers: as(OWNER),
    body: { action: 'dismiss_late', keys: [`u7:${DEV_BL1}`, `u3:${DEV_BL2}`, `u7:${DEV_BL1}`, `u7:${DEV_BH_HOLD}`, 'u7:missingdev00002'] }
  });
  ok('Owner dismiss_late deletes only targeted sent_late rows while keeping active holding and untargeted sent_late rows',
    bulkRes.status === 200 && bulkRes.json && bulkRes.json.ok === true && bulkRes.json.dismissed === 2 && bulkRes.json.state === 'sent_late'
    && !kv(`device_unsent:u7:${DEV_BL1}`) && !kv(`device_unsent:u3:${DEV_BL2}`)
    && Boolean(kv(`device_unsent:u9:${DEV_BL_KEEP}`) && kv(`device_unsent:u9:${DEV_BL_KEEP}`).state === 'sent_late')
    && Boolean(kv(`device_unsent:u7:${DEV_BH_HOLD}`) && kv(`device_unsent:u7:${DEV_BH_HOLD}`).state === 'holding'),
    bulkRes);

  // 40 max-length (40:32 = 73 chars, ~3.07 KB) keys succeed under the 4 KB dismiss_late limit; >4 KB returns 413.
  const maxUid = 'u' + 'x'.repeat(39);
  const maxKeys = [];
  for (let i = 0; i < 40; i++) {
    const devMax = 'devmax' + String(i).padStart(26, '0');
    const rowPayload = JSON.stringify({ state: 'sent_late', device_id: devMax, user_id: maxUid, sent_count: 1, count: 0, since: lateSince, sent_at: iso(NOW) });
    d1.db.prepare("INSERT OR REPLACE INTO edge_kv_store (doc_key, payload_json, updated_at) VALUES (?,?,?)").run(`device_unsent:${maxUid}:${devMax}`, rowPayload, iso(NOW));
    maxKeys.push(`${maxUid}:${devMax}`);
  }
  const max40Res = await api('device_unsent', { method: 'POST', headers: as(OWNER), body: { action: 'dismiss_late', keys: maxKeys } });
  const tooBigLateRes = await api('device_unsent', { method: 'POST', headers: as(OWNER), body: { action: 'dismiss_late', keys: maxKeys, pad: 'z'.repeat(1500) } });
  ok('Owner dismiss_late accepts 40 max-length (40:32, ~3 KB) keys and rejects >4 KB with 413',
    max40Res.status === 200 && max40Res.json && max40Res.json.dismissed === 40
    && d1.rows("SELECT doc_key FROM edge_kv_store WHERE doc_key LIKE ?", `device_unsent:${maxUid}:%`).length === 0
    && tooBigLateRes.status === 413,
    { max40Res, tooBigLateRes });
  // Alias parity on shared-device closing: short aliases ('4235', 'bdeir holding · consolidated jv') canonicalize identically.
  const DEV_AL = 'devalias0000007';
  const S_4235_SHORT = await seat('u10', '4235 Short Seat', 'short4235@example.test', 'Entry', '4235');
  const S_4235_CANON = await seat('u11', '4235 Canon Seat', 'canon4235@example.test', 'Entry', '4235 Company S.A.L');
  const S_HLD_JV = await seat('u12', 'Holding JV Seat', 'hldjv@example.test', 'Entry', 'bdeir holding · consolidated jv');
  const S_HLD_CANON = await seat('u13', 'Holding Canon Seat', 'hldcanon@example.test', 'Entry', 'Bdeir Holding');
  await api('device_unsent', { method: 'POST', headers: as(S_4235_CANON), body: report({ device_id: DEV_AL, count: 3, since: iso(NOW - 2 * 3600000) }) });
  const r4235Close = await api('device_unsent', { method: 'POST', headers: as(S_4235_SHORT), body: { device_id: DEV_AL, count: 0, all_seats: true } });
  await api('device_unsent', { method: 'POST', headers: as(S_HLD_JV), body: report({ device_id: DEV_AL, count: 2, since: iso(NOW - 2 * 3600000) }) });
  const rHldClose = await api('device_unsent', { method: 'POST', headers: as(S_HLD_CANON), body: { device_id: DEV_AL, count: 0, all_seats: true } });
  ok('company aliases ("4235", "bdeir holding · consolidated jv") close canonical holding rows on shared devices',
    r4235Close.json && r4235Close.json.saved === true && r4235Close.json.open === 0 && kv(`device_unsent:u11:${DEV_AL}`).state === 'sent_late'
    && rHldClose.json && rHldClose.json.saved === true && rHldClose.json.open === 0 && kv(`device_unsent:u12:${DEV_AL}`).state === 'sent_late',
    { r4235Close, rHldClose });
}

console.log('\n[global fx_rates & vat_rates access]');
{
  const fxRec = { id: 'fx-test-01', name: 'LBP @ 90,000', currency: 'LBP', start_date: '2026-11-20', end_date: 'Open', amount: 90000, rate: 90000, status: 'Current', source: 'app', voided: false };
  const vatRec = { id: 'vat-test-01', name: '11% VAT @ 89,500', start_date: '2026-11-20', end_date: 'Open', amount: 11, vat_percent: 11, vat_fx_rate: 89500, status: 'Current', source: 'app', voided: false };
  const TWELVE_COS = await seat('u14', 'Twelve Co NonOwner', 'twelve.seat@example.test', 'Supervisor + Entry',
    'WTC, BBConstruction, Lions Transport, Bdeir Holding, Blanca, La Una, Palms, Voile, Platinum, Korri Auto, Shacman, Properties');

  let r = await api('records', { method: 'POST', headers: as(OWNER), body: { table: 'fx_rates', record: fxRec } });
  ok('Owner posts fx_rates via POST /api/records -> 200', r.status === 200 && r.json && r.json.ok === true, r);
  r = await api('records', { method: 'POST', headers: as(OWNER), body: { table: 'vat_rates', record: vatRec } });
  ok('Owner posts vat_rates via POST /api/records -> 200', r.status === 200 && r.json && r.json.ok === true, r);

  // Reads stay open to company-limited seats so Owner-posted global rates sync down cleanly.
  const entryFxGet = await api('records?table=fx_rates', { headers: as(ENTRY) });
  const entryVatGet = await api('records?table=vat_rates', { headers: as(ENTRY) });
  ok('Entry/WTC seat reads fx_rates and vat_rates via GET /api/records',
    entryFxGet.status === 200 && (entryFxGet.json.rows || []).some(x => x.id === 'fx-test-01')
    && entryVatGet.status === 200 && (entryVatGet.json.rows || []).some(x => x.id === 'vat-test-01'),
    { entryFxGet, entryVatGet });

  // Seed mfg_web_store with Owner rate rows and verify /api/sync get_mfg serves them while patch blocks limited seats.
  const ownSyncSeed = await api('sync', { method: 'POST', headers: as(OWNER), body: { op: 'patch', doc: 'mfg_web_store', patch: { mfg_web_store: { minShellVer: effectiveMinSyncShellVer(), customRecords: { fx_rates: [fxRec], vat_rates: [vatRec] } } } } });
  const syncGet = await api('sync', { method: 'POST', headers: as(ENTRY), body: { op: 'get_mfg', doc: 'mfg_web_store' } });
  const gotCr = (syncGet.json && syncGet.json.docs && syncGet.json.docs.mfg_web_store && syncGet.json.docs.mfg_web_store.customRecords) || {};
  ok('Entry/WTC seat reads Owner fx_rates & vat_rates through /api/sync get_mfg',
    ownSyncSeed.status === 200 && ownSyncSeed.json && ownSyncSeed.json.ok === true
    && syncGet.status === 200 && Array.isArray(gotCr.fx_rates) && gotCr.fx_rates.some(x => x.id === 'fx-test-01')
    && Array.isArray(gotCr.vat_rates) && gotCr.vat_rates.some(x => x.id === 'vat-test-01'),
    { ownSyncSeed, syncGet: syncGet.json });

  // Writes (including forged company: WTC, >=12-company non-Owner seats, edits, voids, sync patches) are blocked.
  const forgedFx = Object.assign({}, fxRec, { id: 'fx-forged-01', company: 'WTC' });
  const forgedVat = Object.assign({}, vatRec, { id: 'vat-forged-01', company: 'WTC' });
  const p1 = await api('records', { method: 'POST', headers: as(ENTRY), body: { table: 'fx_rates', record: { id: 'fx-forged-00', name: 'Bad', currency: 'LBP', start_date: '2026-11-21', rate: 100 } } });
  const p2 = await api('records', { method: 'POST', headers: as(ENTRY), body: { table: 'fx_rates', record: forgedFx } });
  const p3 = await api('records', { method: 'POST', headers: as(ENTRY), body: { table: 'vat_rates', record: forgedVat } });
  const p4 = await api('records', { method: 'POST', headers: as(SUP), body: { table: 'fx_rates', record: forgedFx } });
  const p5 = await api('records', { method: 'POST', headers: as(TWELVE_COS), body: { table: 'fx_rates', record: fxRec } });
  const p6 = await api('records', { method: 'POST', headers: as(TWELVE_COS), body: { table: 'vat_rates', record: vatRec } });
  ok('company-limited seats (incl. >=12 explicit entities non-Owner) cannot write fx_rates or vat_rates via POST /api/records',
    p1.status === 403 && p2.status === 403 && p3.status === 403 && p4.status === 403 && p5.status === 403 && p6.status === 403,
    { p1: p1.status, p2: p2.status, p3: p3.status, p4: p4.status, p5: p5.status, p6: p6.status });

  const sPatch = await api('sync', {
    method: 'POST',
    headers: as(TWELVE_COS),
    body: {
      op: 'patch',
      doc: 'mfg_web_store',
      patch: {
        mfg_web_store: {
          minShellVer: effectiveMinSyncShellVer(),
          customRecords: {
            fx_rates: [Object.assign({}, fxRec, { rate: 12345, voided: true }), forgedFx],
            vat_rates: []
          }
        }
      }
    }
  });
  const afterSync = await api('sync', { method: 'POST', headers: as(OWNER), body: { op: 'get_mfg', doc: 'mfg_web_store' } });
  const afterCr = (afterSync.json && afterSync.json.docs && afterSync.json.docs.mfg_web_store && afterSync.json.docs.mfg_web_store.customRecords) || {};
  const fxRowD1 = d1.one('SELECT amount, voided FROM fx_rates WHERE id = ?', 'fx-test-01');
  const forgedRowD1 = d1.one('SELECT id FROM fx_rates WHERE id = ?', 'fx-forged-01');
  const vatRowD1 = d1.one('SELECT id FROM vat_rates WHERE id = ?', 'vat-test-01');
  ok('company-limited /api/sync patch cannot edit, void, delete, or insert fx_rates or vat_rates in D1 or mfg_web_store',
    sPatch.status === 200
    && afterCr.fx_rates.length === 1 && afterCr.fx_rates[0].rate === 90000 && !afterCr.fx_rates[0].voided
    && afterCr.vat_rates.length === 1 && afterCr.vat_rates[0].id === 'vat-test-01'
    && fxRowD1 && fxRowD1.amount === 90000 && !fxRowD1.voided && !forgedRowD1 && Boolean(vatRowD1),
    { sPatch, afterCr, fxRowD1, forgedRowD1, vatRowD1 });
}

// Owner 2026-11-25: a hold the Owner could only read as "refused by the cloud". The report now carries the status
// and the server's own words; voids refused for having no reason are named one by one so the device can set them
// aside (reason `set_aside`) and send the rest.
console.log('\n[why the cloud refused]');
{
  const DEV_R = 'devrefused00006';
  const vrText = 'Void reason required (min 3 chars): amount $900 >= $500.';
  let r = await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: report({ device_id: DEV_R, count: 3, reason: 'blocked', refusal: { status: 400, code: 'void_reason_required', error: vrText } }) });
  let row = kv(`device_unsent:u7:${DEV_R}`);
  ok('a blocked report keeps the status, code and the server text (">=" kept as a sign, no markup characters)',
    r.status === 200 && row.refusal_status === 400 && row.refusal_code === 'void_reason_required'
    && row.refusal_text === 'Void reason required (min 3 chars): amount $900 ≥ $500.', row);
  r = await api('device_unsent', { headers: as(OWNER) });
  const d = (r.json.devices || []).find(x => x.device_id === DEV_R);
  ok('the Owner list carries the refusal', d && d.refusal_status === 400 && d.refusal_code === 'void_reason_required' && /≥ \$500/.test(d.refusal_text), d);

  r = await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: report({ device_id: DEV_R, count: 2, reason: 'set_aside', refusal: { status: 400, code: 'void_reason_required', error: vrText } }) });
  row = kv(`device_unsent:u7:${DEV_R}`);
  ok('reason set_aside is accepted with its refusal', r.status === 200 && row.reason === 'set_aside' && row.count === 2 && row.refusal_status === 400, row);

  r = await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: report({ device_id: DEV_R, count: 2, reason: 'offline', refusal: { status: 400, code: 'x', error: 'nope' } }) });
  row = kv(`device_unsent:u7:${DEV_R}`);
  ok('a refusal on any other reason is dropped', r.status === 200 && row.reason === 'offline' && !('refusal_status' in row), row);

  r = await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: report({ device_id: DEV_R, count: 2, reason: 'blocked', refusal: { status: 200, code: 'ok', error: 'fine' } }) });
  row = kv(`device_unsent:u7:${DEV_R}`);
  ok('a refusal whose status is not 4xx/5xx is dropped', r.status === 200 && !('refusal_status' in row), row);
  r = await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: report({ device_id: DEV_R, count: 2, reason: 'blocked', refusal: { status: 503, code: 'Bad Code!', error: '<b>repair</b> "now" ' + 'x'.repeat(400) } }) });
  row = kv(`device_unsent:u7:${DEV_R}`);
  ok('a bad code is blanked and the text is cleaned and cut to 240 characters',
    row.refusal_status === 503 && row.refusal_code === '' && !/[<>"]/.test(row.refusal_text) && row.refusal_text.length <= 240 && row.refusal_text.startsWith('b repair /b now'), row);
  ok('a report from an older device (no refusal) still works', validateDeviceUnsentReport(report({ reason: 'blocked' }), NOW).ok === true
    && validateDeviceUnsentReport(report({ reason: 'blocked' }), NOW).val.refusal === null);

  // The sync names every void it refuses (not only the first)
  const old = '2026-10-01';
  const sp = await api('sync', {
    method: 'POST', headers: as(OWNER),
    body: { op: 'patch', doc: 'mfg_web_store', patch: { mfg_web_store: {
      minShellVer: effectiveMinSyncShellVer(),
      customRecords: {
        expenses: [
          { id: 'exp-vr-1', company: 'WTC', date: old, amount_usd: 900, voided: true },
          { id: 'exp-vr-2', company: 'WTC', date: old, amount_usd: 950, voided: true },
          { id: 'exp-vr-ok', company: 'WTC', date: old, amount_usd: 900, voided: true, void_reason: 'Duplicate entry' }
        ]
      },
      industryRowEdits: { 'Hospitality::Zz Table::r1': { company: 'Blanca', voided: true, domainTblKey: 'hsp_zz', amount_usd: 900, date: old } }
    } } }
  });
  const ref = (sp.json && sp.json.refused) || [];
  const keys = ref.map(x => `${x.kind}:${x.table}:${x.id}`).sort();
  ok('a sync with voids that lack a reason -> 400 naming each refused void (kind, table, id, error), first one kept on top for older devices',
    sp.status === 400 && sp.json.code === 'void_reason_required' && sp.json.refusedTotal === 3
    && JSON.stringify(keys) === JSON.stringify(['customRecords:expenses:exp-vr-1', 'customRecords:expenses:exp-vr-2', 'industryRowEdits:hsp_zz:Hospitality::Zz Table::r1'])
    && ref.every(x => /Void reason required/.test(x.error))
    && sp.json.table === ref[0].table && sp.json.id === ref[0].id && sp.json.error === ref[0].error, sp.json);
  const many = Array.from({ length: 60 }, (_, i) => ({ kind: 'customRecords', table: 'expenses', id: 'e' + i, error: 'x' }));
  const packed = packSyncVoidRefusals(many);
  ok('at most 50 are listed, with the total', packed.refused.length === SYNC_VOID_REFUSED_MAX && SYNC_VOID_REFUSED_MAX === 50 && packed.refusedTotal === 60 && packSyncVoidRefusals([]) === null, { n: packed.refused.length, t: packed.refusedTotal });
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
