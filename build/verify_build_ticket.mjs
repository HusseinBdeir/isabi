// Offline check of the build-ticket sign-in (functions/_lib/security.js, "Build tickets"), driven through the real
// router (functions/app/api/[[route]].js) against an in-memory SQLite database standing in for D1.
//
// A build script signed in to Cloudflare writes the SHA-256 of a random ticket into D1 `build_tickets` and sends the
// ticket in X-ISABI-Session. This gate pins down that such a ticket:
//   - opens only the routes the builds call, with the methods they use, and nothing else;
//   - dies with its row (expired, missing, unparseable) and is refused when its row would keep it alive too long;
//   - is never honoured on a browser request (Origin or Cookie header), in another header, or in another shape;
//   - acts as seat u1 exactly as the database holds it (suspended, demoted or missing: refused);
//   - never turns a missing table or a failing database into anything but "Authentication required";
//   - leaves ordinary signed sessions exactly as they were.
// Nothing live is touched.   Run: node build/verify_build_ticket.mjs      (Node 22.5+ for node:sqlite)

import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { onRequest } from '../functions/app/api/[[route]].js';
import { BUILD_TICKET_MAX_TTL_SEC, isBuildTicketRoute, redeemBuildTicket, signEdgeSession } from '../functions/_lib/security.js';

// ---- minimal D1 stand-in (same binding rules as build/verify_phase5_api.mjs) ----
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
  async first() { this.db.reads = (this.db.reads || 0) + 1; return this.db.prepare(this.sql).get(...this.args()) || null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args()) }; }
  async run() { const r = this.db.prepare(this.sql).run(...this.args()); return { success: true, meta: { changes: r.changes } }; }
  runSync() {
    if (/^\s*(SELECT|WITH)\b/i.test(this.sql)) return { results: this.db.prepare(this.sql).all(...this.args()) };
    const r = this.db.prepare(this.sql).run(...this.args()); return { success: true, results: [], meta: { changes: r.changes } };
  }
}
class D1 {
  constructor() { this.db = new DatabaseSync(':memory:'); this.ticketReads = 0; }
  prepare(sql) { if (/build_tickets/.test(sql)) this.ticketReads++; return new Stmt(this.db, sql); }
  async batch(stmts) {
    this.db.exec('BEGIN');
    try { const out = stmts.map(s => s.runSync()); this.db.exec('COMMIT'); return out; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  exec(sql) { this.db.exec(sql); }
  one(sql, ...p) { return this.db.prepare(sql).get(...p); }
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
const env = { DB: d1, ISABI_JWT_SECRET: 'build-ticket-offline-test-secret-' + Math.random().toString(36).slice(2) };
d1.db.prepare("INSERT INTO users (id, full_name, email, role, companies) VALUES ('u1', 'Owner Seat', 'Owner.Seat@Example.Test', 'Full Access (Owner)', 'All')").run();
d1.db.prepare("INSERT INTO users (id, full_name, email, role, companies) VALUES ('u7', 'Entry Seat', 'entry.seat@example.test', 'Entry', 'WTC')").run();
d1.db.prepare("INSERT INTO auth_sessions (id, user_id, email, role, companies) VALUES ('sess-u1', 'u1', 'owner.seat@example.test', 'Full Access (Owner)', 'All')").run();
d1.db.prepare("INSERT INTO auth_sessions (id, user_id, email, role, companies) VALUES ('sess-u7', 'u7', 'entry.seat@example.test', 'Entry', 'WTC')").run();
const OWNER_JWT = await signEdgeSession({ sid: 'sess-u1', sub: 'u1', email: 'owner.seat@example.test', role: 'Full Access (Owner)', companies: 'All' }, env);
const ENTRY_JWT = await signEdgeSession({ sid: 'sess-u7', sub: 'u7', email: 'entry.seat@example.test', role: 'Entry', companies: 'WTC' }, env);
const GONE_JWT = await signEdgeSession({ sid: 'sess-gone', sub: 'u1', email: 'owner.seat@example.test', role: 'Full Access (Owner)', companies: 'All' }, env);

const TICKET_SQL = 'CREATE TABLE IF NOT EXISTS build_tickets (ticket_hash TEXT PRIMARY KEY, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)';
const sha = s => createHash('sha256').update(s, 'ascii').digest('hex');
const newTicket = () => 'bt1_' + randomBytes(32).toString('base64url');
const iso = ms => new Date(ms).toISOString();
function issue(ttlSec = 600, { expiresAt } = {}) {
  d1.exec(TICKET_SQL);
  const t = newTicket();
  d1.db.prepare('INSERT INTO build_tickets (ticket_hash, expires_at, created_at) VALUES (?,?,?)')
    .run(sha(t), expiresAt !== undefined ? expiresAt : iso(Date.now() + ttlSec * 1000), iso(Date.now()));
  return t;
}

async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const h = Object.assign({ 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.9.0.1' }, headers);
  const req = new Request(`https://example.test/app/api/${path}`, { method, headers: h, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
  const res = await onRequest({ request: req, env, params: { route: path.split('/') } });
  const txt = await res.text();
  let json = null; try { json = JSON.parse(txt); } catch (_) {}
  return { status: res.status, json, txt };
}
const withTicket = t => ({ 'X-ISABI-Session': t });

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail).slice(0, 400) : '')); }
}

console.log('\n[shape] the ticket this gate issues is the shape the build scripts send');
{
  const t = newTicket();
  ok('bt1_ + 43 base64url characters', /^bt1_[A-Za-z0-9_-]{43}$/.test(t), t.length);
  ok('the Edge caps a ticket at 15 minutes', BUILD_TICKET_MAX_TTL_SEC === 900);
}

console.log('\n[no table yet] before any build has run');
{
  const r = await api('cashflow_behind', { headers: withTicket(newTicket()) });
  ok('a ticket with no build_tickets table -> 401, not 500', r.status === 401 && r.json && r.json.ok === false, r);
}

console.log('\n[valid ticket] the routes the builds call');
const T = issue();
{
  let r = await api('cashflow_behind');
  ok('no sign-in -> 401', r.status === 401, r);
  r = await api('cashflow_behind', { headers: withTicket(T) });
  ok('GET cashflow_behind with a ticket -> 200', r.status === 200 && r.json.ok === true && 'cashflow_behind' in r.json, r);
  r = await api('source_behind', { headers: withTicket(T) });
  ok('GET source_behind with a ticket -> 200', r.status === 200 && r.json.ok === true && 'source_behind' in r.json, r);
  r = await api('cashflow_behind', { method: 'POST', headers: withTicket(T), body: { cashflow_behind: { status: 'behind', report_date: '2026-11-16' } } });
  ok('POST cashflow_behind with a ticket publishes the notice', r.status === 200 && r.json.ok === true, r);
  r = await api('cashflow_behind', { headers: withTicket(T) });
  ok('...and it reads back', r.status === 200 && r.json.cashflow_behind && r.json.cashflow_behind.status === 'behind', r);
  r = await api('users', { headers: withTicket(T) });
  ok('GET users with a ticket -> 200 with the whole roster (Owner view)', r.status === 200 && Array.isArray(r.json.users) && r.json.users.length === 2, r);
  r = await api('sync', { method: 'POST', headers: withTicket(T), body: { op: 'get_mfg', doc: 'mfg_web_store' } });
  ok('POST sync (read) with a ticket -> 200 with the store document', r.status === 200 && r.json.ok === true && r.json.docs && typeof r.json.docs.mfg_web_store === 'object', r);
  const anon = await api('sync', { method: 'POST', body: { op: 'get_mfg', doc: 'mfg_web_store' } });
  ok('POST sync without a ticket -> 401', anon.status === 401, anon);
  // The write the builds make: a patch through the Edge's own store code, stamped with the Owner seat's email.
  r = await api('sync', { method: 'POST', headers: withTicket(T), body: { op: 'patch', doc: 'control_store', patch: { control_store: { note: 'written by a build' } } } });
  const ctl = d1.one("SELECT payload_json, updated_by FROM edge_kv_store WHERE doc_key = 'control_store'");
  ok('POST sync (patch) with a ticket -> 200 and the document is stored', r.status === 200 && r.json.ok === true && ctl && /written by a build/.test(ctl.payload_json), { r, ctl });
  ok('...stamped with seat u1\'s email, as the signed Owner session was', ctl && ctl.updated_by === 'owner.seat@example.test', ctl);
  const anonPatch = await api('sync', { method: 'POST', body: { op: 'patch', doc: 'control_store', patch: { control_store: { note: 'anonymous' } } } });
  ok('the same patch without a ticket -> 401 and nothing is written', anonPatch.status === 401
    && /written by a build/.test(d1.one("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'control_store'").payload_json), anonPatch);
  r = await api('sync', { method: 'POST', headers: withTicket(T), body: { op: 'patch', patch: { cashflow_behind: { status: 'x' } } } });
  ok('a ticket cannot write an Owner notice through sync either (403, as for any session)', r.status === 403, r);
  ok('the same ticket works again inside its window', (await api('source_behind', { headers: withTicket(T) })).status === 200);
  // The top-up publishes the changed-old-entries notice with the same ticket (owner 2026-11-17).
  r = await api('changed_entries', { method: 'POST', headers: withTicket(T), body: { changed_entries: { status: 'ok', core_hash: 'c1', items: [] } } });
  ok('POST changed_entries with a ticket publishes the notice', r.status === 200 && r.json.ok === true, r);
  r = await api('changed_entries', { headers: withTicket(T) });
  ok('...and it reads back', r.status === 200 && r.json.changed_entries && r.json.changed_entries.core_hash === 'c1', r);
  ok('changed_entries without a ticket -> 401', (await api('changed_entries')).status === 401);
  r = await api('day-close-push', { method: 'POST', headers: withTicket(T), body: { op: 'dispatch_due' } });
  ok('POST day-close-push (dispatch_due) with a ticket -> 200', r.status === 200 && r.json && r.json.ok === true, r);
  r = await api('day-close-push', { method: 'POST', headers: withTicket(T), body: { op: 'subscribe', subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'x', auth: 'y' } } } });
  ok('POST day-close-push (subscribe) with a ticket -> 403', r.status === 403, r);
  ok('POST day-close-push (dispatch_due) without a ticket -> 401', (await api('day-close-push', { method: 'POST', body: { op: 'dispatch_due' } })).status === 401);
}

console.log('\n[scope] nothing but those routes and methods');
{
  const blocked = [
    ['GET', 'sync'], ['GET', 'day-close-push'], ['POST', 'users'], ['GET', 'auth/me'], ['GET', 'saved-views'], ['POST', 'saved-views'], ['GET', 'records'], ['POST', 'records'],
    ['GET', 'work_schedules'], ['POST', 'work_schedules'], ['GET', 'geo_config'], ['GET', 'sentinel_reviews'], ['GET', 'alert_rules'], ['POST', 'alert_rules'],
    ['GET', 'staff_biometrics'], ['GET', 'industry_domain_store'], ['POST', 'industry_domain_store'], ['POST', 'kiosk/punches'], ['GET', 'blobs'],
    ['GET', 'telematics'], ['POST', 'ask'], ['POST', 'tts'], ['POST', 'ai-edge'], ['POST', 'auth/verify-override'], ['GET', 'auth/override-requests'],
    ['GET', 'seed/core'], ['GET', 'seed/records'], ['POST', 'map-usage'], ['GET', 'not-a-route']
  ];
  const leaks = [];
  for (const [method, path] of blocked) {
    const withT = await api(path, { method, headers: withTicket(T), body: {} });
    const without = await api(path, { method, body: {} });
    if (withT.status !== without.status || withT.txt !== without.txt) leaks.push([method, path, withT.status, without.status]);
  }
  ok(`a ticket changes nothing on ${blocked.length} other route and method pairs`, leaks.length === 0, leaks);
  const otherMethods = [];
  for (const method of ['PUT', 'DELETE', 'PATCH']) {
    for (const path of ['sync', 'users', 'cashflow_behind', 'source_behind', 'changed_entries', 'day-close-push']) {
      const withT = await api(path, { method, headers: withTicket(T), body: {} });
      const without = await api(path, { method, body: {} });
      if (withT.status !== without.status || withT.txt !== without.txt || withT.status === 200) otherMethods.push([method, path, withT.status, without.status]);
    }
  }
  ok('PUT, DELETE and PATCH on the six routes: a ticket changes nothing and nothing answers 200', otherMethods.length === 0, otherMethods);
  // The router builds its path from the route array: odd arrays must not reach a listed route.
  const oddRoutes = [];
  for (const route of [['sync', ''], ['', 'sync'], ['sync', 'x'], ['SYNC'], ['users', ''], ['cashflow_behind', '..', 'sync']]) {
    const req = new Request('https://example.test/app/api/' + route.join('/'), { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, withTicket(T)), body: JSON.stringify({ op: 'get_mfg' }) });
    const res = await onRequest({ request: req, env, params: { route } });
    if (res.status === 200) oddRoutes.push([route, res.status]);
  }
  ok('odd route arrays (empty parts, extra parts, upper case) never sign a ticket in', oddRoutes.length === 0, oddRoutes);
  const loginBody = { email: 'entry.seat@example.test', method: 'Owner Impersonation' };
  const login = await api('auth/login', { method: 'POST', headers: withTicket(T), body: loginBody });
  const loginAnon = await api('auth/login', { method: 'POST', body: loginBody });
  ok('a ticket cannot impersonate a seat at sign-in (answered exactly as nobody is, and refused)', login.status === loginAnon.status && login.txt === loginAnon.txt
    && login.status !== 200 && !(login.json && login.json.ok), [login, loginAnon]);
  const st = await api('status', { headers: withTicket(T) });
  const stAnon = await api('status');
  ok('status answers a ticket exactly as it answers nobody', st.status === stAnon.status && st.txt === stAnon.txt, [st, stAnon]);
  ok('route table: exact paths only', isBuildTicketRoute('/sync', 'POST') && isBuildTicketRoute('/users', 'get') && isBuildTicketRoute('/day-close-push', 'POST')
    && !isBuildTicketRoute('/day-close-push', 'GET') && !isBuildTicketRoute('/day-close-push/', 'POST')
    && !isBuildTicketRoute('/sync/', 'POST') && !isBuildTicketRoute('/sync', 'GET') && !isBuildTicketRoute('/users', 'POST') && !isBuildTicketRoute('/SYNC', 'POST') && !isBuildTicketRoute('', 'POST'));
  ok('route table: object built-ins are not routes', !isBuildTicketRoute('constructor', 'POST') && !isBuildTicketRoute('__proto__', 'GET')
    && !isBuildTicketRoute('toString', 'GET') && !isBuildTicketRoute('hasOwnProperty', 'POST'));
}

console.log('\n[lifetime] a ticket dies with its row');
{
  let r = await api('cashflow_behind', { headers: withTicket(newTicket()) });
  ok('a ticket that was never issued -> 401', r.status === 401, r);
  r = await api('cashflow_behind', { headers: withTicket(issue(-5)) });
  ok('an expired ticket -> 401', r.status === 401, r);
  r = await api('cashflow_behind', { headers: withTicket(issue(BUILD_TICKET_MAX_TTL_SEC + 120)) });
  ok('a row that would keep a ticket alive past the cap -> 401', r.status === 401, r);
  r = await api('cashflow_behind', { headers: withTicket(issue(BUILD_TICKET_MAX_TTL_SEC - 30)) });
  ok('a row just inside the cap -> 200', r.status === 200, r);
  r = await api('cashflow_behind', { headers: withTicket(issue(0, { expiresAt: 'never' })) });
  ok('an unparseable expiry -> 401', r.status === 401, r);
  r = await api('cashflow_behind', { headers: withTicket(issue(0, { expiresAt: '' })) });
  ok('an empty expiry -> 401', r.status === 401, r);
  r = await api('cashflow_behind', { headers: withTicket(issue(0, { expiresAt: '9999-12-31T00:00:00.000Z' })) });
  ok('a far-future expiry -> 401', r.status === 401, r);
  const gone = issue();
  d1.db.prepare('DELETE FROM build_tickets WHERE ticket_hash = ?').run(sha(gone));
  r = await api('cashflow_behind', { headers: withTicket(gone) });
  ok('a ticket whose row was deleted -> 401', r.status === 401, r);
  const stored = d1.one('SELECT COUNT(*) AS n FROM build_tickets WHERE ticket_hash = ?', T).n;
  ok('the database never holds a ticket itself, only its hash', stored === 0 && d1.one('SELECT COUNT(*) AS n FROM build_tickets WHERE ticket_hash = ?', sha(T)).n === 1);
}

console.log('\n[shape and transport] only the exact ticket, only in X-ISABI-Session, never from a browser');
{
  const bad = {
    'hash sent instead of the ticket': sha(T),
    'one character short': T.slice(0, -1),
    'one character long': T + 'A',
    'another version prefix': 'bt2_' + T.slice(4),
    'no prefix': T.slice(4),
    'upper-case prefix': 'BT1_' + T.slice(4),
    'a dot inside': T.slice(0, 20) + '.' + T.slice(21),
    'a space inside': T.slice(0, 20) + ' ' + T.slice(21),
    'SQL in place of a ticket': "bt1_' OR '1'='1",
    'empty': ''
  };
  const before = d1.ticketReads;
  const wrong = [];
  for (const [label, val] of Object.entries(bad)) {
    const r = await api('cashflow_behind', { headers: withTicket(val) });
    if (r.status !== 401) wrong.push([label, r.status]);
  }
  ok(`${Object.keys(bad).length} malformed tickets -> 401`, wrong.length === 0, wrong);
  ok('...without one database lookup', d1.ticketReads === before, d1.ticketReads - before);
  let r = await api('cashflow_behind', { headers: { Authorization: 'Bearer ' + T } });
  ok('a ticket in Authorization: Bearer -> 401', r.status === 401, r);
  r = await api('cashflow_behind', { headers: { Cookie: 'isabi_edge_sess=' + T } });
  ok('a ticket in the session cookie -> 401', r.status === 401, r);
  r = await api('cashflow_behind', { headers: Object.assign({ Origin: 'https://example.test' }, withTicket(T)) });
  ok('a ticket on a request with an Origin header (a browser) -> 401', r.status === 401, r);
  r = await api('cashflow_behind', { headers: Object.assign({ Origin: 'https://evil.example' }, withTicket(T)) });
  ok('...from another site too', r.status === 401, r);
  r = await api('cashflow_behind', { headers: Object.assign({ Cookie: 'theme=dark' }, withTicket(T)) });
  ok('a ticket on a request that carries cookies -> 401', r.status === 401, r);
  r = await api('cashflow_behind', { headers: withTicket('  ' + T + '  ') });
  ok('surrounding spaces are trimmed, as for a signed session', r.status === 200, r);
  r = await api('cashflow_behind', { headers: Object.assign({ 'X-ISABI-Demo': '1' }, withTicket(T)) });
  ok('the demo header still answers the demo notice, not the live one', r.status === 200 && r.json.demo === true && r.json.cashflow_behind === null, r);
  r = await api('cashflow_behind', { method: 'POST', headers: Object.assign({ 'X-ISABI-Demo': '1' }, withTicket(T)), body: { cashflow_behind: null } });
  ok('the demo header still refuses a write', r.status === 403, r);
}

console.log('\n[identity] a ticket is seat u1 as the database holds it today');
{
  const direct = async () => redeemBuildTicket(new Request('https://example.test/app/api/users', { headers: withTicket(T) }), env, '/users');
  let s = await direct();
  ok('the session names seat u1, its stored role and its lower-cased email', s && s.sub === 'u1' && s.role === 'Full Access (Owner)' && s.email === 'owner.seat@example.test'
    && s.companies === 'All' && s.build_ticket === true && s.sid === 'build-ticket', s);
  ok('called for a route off the list it returns nothing', (await redeemBuildTicket(new Request('https://example.test/app/api/records', { headers: withTicket(T) }), env, '/records')) === null);
  ok('called with no database it returns nothing', (await redeemBuildTicket(new Request('https://example.test/app/api/users', { headers: withTicket(T) }), {}, '/users')) === null);
  d1.db.prepare("UPDATE users SET status = 'Suspended' WHERE id = 'u1'").run();
  let r = await api('cashflow_behind', { headers: withTicket(T) });
  ok('seat u1 suspended -> 401', r.status === 401, r);
  d1.db.prepare("UPDATE users SET status = 'Active', role = 'Supervisor' WHERE id = 'u1'").run();
  r = await api('cashflow_behind', { headers: withTicket(T) });
  ok('seat u1 no longer an Owner -> 401', r.status === 401, r);
  d1.db.prepare("UPDATE users SET role = 'Homeowner Liaison' WHERE id = 'u1'").run();
  r = await api('cashflow_behind', { headers: withTicket(T) });
  ok('a role that only contains the letters of "owner" inside another word -> 401', r.status === 401, r);
  d1.db.prepare("UPDATE users SET id = 'u1-moved' WHERE id = 'u1'").run();
  r = await api('cashflow_behind', { headers: withTicket(T) });
  ok('no seat u1 -> 401', r.status === 401, r);
  d1.db.prepare("UPDATE users SET id = 'u1', role = 'Full Access (Owner)' WHERE id = 'u1-moved'").run();
  r = await api('cashflow_behind', { headers: withTicket(T) });
  ok('seat u1 restored -> 200', r.status === 200, r);
}

console.log('\n[database trouble] never anything but "Authentication required"');
{
  const realPrepare = d1.prepare.bind(d1);
  d1.prepare = sql => { if (/build_tickets/.test(sql)) throw new Error('D1_ERROR: boom'); return realPrepare(sql); };
  const r = await api('cashflow_behind', { headers: withTicket(T) });
  d1.prepare = realPrepare;
  ok('a failing ticket lookup -> 401', r.status === 401 && r.json.error === 'Authentication required.', r);
}

console.log('\n[signed sessions] exactly as before');
{
  let r = await api('cashflow_behind', { headers: withTicket(OWNER_JWT) });
  ok('an Owner session in X-ISABI-Session -> 200', r.status === 200, r);
  r = await api('cashflow_behind', { headers: { Authorization: 'Bearer ' + OWNER_JWT } });
  ok('an Owner session in Authorization -> 200', r.status === 200, r);
  r = await api('cashflow_behind', { headers: withTicket(ENTRY_JWT) });
  ok('an Entry session is still refused the Owner notice (403)', r.status === 403, r);
  r = await api('cashflow_behind', { headers: withTicket(GONE_JWT) });
  ok('a signed session whose session row is gone -> 401', r.status === 401, r);
  r = await api('cashflow_behind', { headers: { Authorization: 'Bearer ' + GONE_JWT, 'X-ISABI-Session': T } });
  ok('a dead signed session is not rescued by a ticket beside it', r.status === 401, r);
  r = await api('cashflow_behind', { headers: { Authorization: 'Bearer ' + ENTRY_JWT, 'X-ISABI-Session': T } });
  ok('a live Entry session is not raised to Owner by a ticket beside it', r.status === 403, r);
  r = await api('saved-views', { headers: withTicket(OWNER_JWT) });
  ok('a signed session still reaches routes a ticket cannot', r.status !== 401, r);
}

console.log(`\nverify_build_ticket: ${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
