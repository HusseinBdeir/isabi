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
//   - an Owner or full-group seat can close the reports other seats left open for the same device, nobody else;
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
  isDeviceUnsentDoc,
  listDeviceUnsentRows,
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
  statements_access TEXT DEFAULT 'full', status TEXT DEFAULT 'Active', last_login_at TEXT DEFAULT '', custom_perms TEXT DEFAULT '{}');
  CREATE TABLE auth_sessions (id TEXT PRIMARY KEY, user_id TEXT DEFAULT '', email TEXT DEFAULT '', full_name TEXT DEFAULT '',
  role TEXT DEFAULT '', companies TEXT DEFAULT '', device TEXT DEFAULT '', logged_in_at TEXT DEFAULT '', method TEXT DEFAULT 'PIN',
  confidence REAL, ip_hash TEXT DEFAULT '');
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

async function api(path, { method = 'GET', body, headers = {}, raw } = {}) {
  const h = Object.assign({ 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.9.0.2' }, headers);
  const req = new Request(`https://example.test/app/api/${path}`, { method, headers: h, body: method === 'GET' ? undefined : (raw !== undefined ? raw : JSON.stringify(body || {})) });
  const res = await onRequest({ request: req, env, params: { route: path.split('/') } });
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
  ok('GET from the Demo sandbox -> an empty list', r.status === 200 && r.json.demo === true && Array.isArray(r.json.devices) && r.json.devices.length === 0, r);
  r = await api('device_unsent', { method: 'POST', body: report(), headers: Object.assign({ 'X-ISABI-Demo': '1' }, as(ENTRY)) });
  ok('POST with the Demo header -> 403, nothing stored', r.status === 403 && d1.rows("SELECT doc_key FROM edge_kv_store WHERE doc_key LIKE 'device_unsent:%'").length === 0, r);
  r = await api('device_unsent', { headers: as(ENTRY) });
  ok('GET as an Entry seat -> 403', r.status === 403, r);
  r = await api('device_unsent', { headers: as(SUP) });
  ok('GET as a Supervisor -> 403', r.status === 403, r);
  r = await api('device_unsent', { headers: as(OWNER) });
  ok('GET as the Owner -> 200 with an empty list', r.status === 200 && r.json.ok === true && r.json.devices.length === 0, r);
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

  // a shared device: the Entry seat reported and left; other seats sign in on the same device
  const DEV_SH = 'devshared000005';
  await api('device_unsent', { method: 'POST', headers: as(ENTRY), body: report({ device_id: DEV_SH, count: 6, since: iso(NOW - 5 * 3600000) }) });
  r = await api('device_unsent', { method: 'POST', headers: as(SUP), body: { device_id: DEV_SH, count: 0, all_seats: true } });
  ok('a Supervisor limited to its companies cannot close another seat\'s report, even asking for all seats', r.json.saved === false && kv(`device_unsent:u7:${DEV_SH}`).state === 'holding', r);
  r = await api('device_unsent', { method: 'POST', headers: as(OWNER), body: { device_id: DEV_SH, count: 0 } });
  ok('the Owner without all_seats touches only its own row', r.json.saved === false && kv(`device_unsent:u7:${DEV_SH}`).state === 'holding', r);
  r = await api('device_unsent', { method: 'POST', headers: as(OWNER), body: { device_id: DEV_SH, count: 0, all_seats: true } });
  const sh = kv(`device_unsent:u7:${DEV_SH}`);
  ok('the Owner, who sends every company\'s rows, closes it: arrived late, still under the seat that held it', r.json.saved === true && r.json.state === 'sent_late' && sh.state === 'sent_late' && sh.sent_count === 6 && sh.user_id === 'u7', { r, sh });
  ok('... and only for that device', kv(`device_unsent:u7:${DEV_A}`).state === 'holding' && kv(`device_unsent:u7:${DEV_B}`).state === 'holding');
  r = await api('device_unsent', { method: 'POST', headers: as(OWNER), body: report({ device_id: DEV_SH, count: 1, all_seats: true }) });
  ok('all_seats means nothing on a holding report', r.json.state === 'holding' && kv(`device_unsent:u1:${DEV_SH}`).count === 1 && kv(`device_unsent:u7:${DEV_SH}`).state === 'sent_late', r);
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

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
