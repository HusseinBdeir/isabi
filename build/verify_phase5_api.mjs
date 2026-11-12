// Offline check of the Phase 5 Edge endpoints, driven through the real router (functions/app/api/[[route]].js)
// against an in-memory SQLite database standing in for D1:
//   - ./api/auth/override-requests  (remote override approval: create / list / get / decide / cancel / expiry)
//   - ./api/saved-views             (per-seat saved table views)
// Sessions are real HS256 tokens signed with a throwaway test secret; nothing live is touched.
// Run: node build/verify_phase5_api.mjs      (Node 22.5+ for node:sqlite)

import { DatabaseSync } from 'node:sqlite';
import { onRequest } from '../functions/app/api/[[route]].js';
import { handleOverrideRequests } from '../functions/_lib/d1_store.js';
import { signEdgeSession } from '../functions/_lib/security.js';

// ---- minimal D1 stand-in (same binding rules as build/verify_kiosk_cloud.mjs; batch is one transaction) ----
class Stmt {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...p) { if (p.length > 100) throw new Error(`D1 allows 100 bound values per statement, got ${p.length}`); return new Stmt(this.db, this.sql, p); }
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
    if (this.beforeBatch) { const hook = this.beforeBatch; this.beforeBatch = null; await hook(); }
    this.db.exec('BEGIN');
    try { const out = stmts.map(s => s.runSync()); this.db.exec('COMMIT'); return out; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  exec(sql) { this.db.exec(sql); }
  rows(sql, ...p) { return this.db.prepare(sql).all(...p); }
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
const env = { DB: d1, ISABI_JWT_SECRET: 'phase5-offline-test-secret-' + Math.random().toString(36).slice(2) };

const SEATS = [
  // id, name, role, companies, custom_perms
  ['t-owner1', 'Owner One', 'Owner', 'All', '{}'],
  ['t-owner2', 'Owner Two', 'Full Access (Owner)', 'All', '{}'],
  ['t-sup-wtc', 'Sup WTC', 'Supervisor', 'WTC', '{}'],
  ['t-sup-wtc2', 'Sup WTC Two', 'Supervisor + Entry', 'WTC, Lions Transport', '{}'],
  ['t-sup-bbc', 'Sup BBC', 'Supervisor', 'BBConstruction', '{}'],
  ['t-entry-wtc', 'Entry WTC', 'Entry', 'WTC', '{}'],
  ['t-entry-wtc2', 'Entry WTC Two', 'Entry', 'WTC', '{}'],
  ['t-entry-rate', 'Entry Rate', 'Entry', 'WTC', '{}'],
  ['t-custom-wtc', 'Custom WTC', 'Custom', 'WTC', JSON.stringify({ unlocks: { unlock_unit_price: true } })],
  ['t-sup-susp', 'Sup Suspended Later', 'Supervisor', 'WTC', '{}'],
  ['t-view-a', 'View A', 'Entry', 'WTC', '{}'],
  ['t-view-b', 'View B', 'Entry', 'WTC', '{}']
];
for (const [id, name, role, cos, cp] of SEATS) {
  d1.db.prepare('INSERT INTO users (id, full_name, email, role, companies, custom_perms) VALUES (?,?,?,?,?,?)')
    .run(id, name, `${id}@example.test`, role, cos, cp);
}
const TOK = {};
for (const [id, name, role, cos] of SEATS) {
  const sid = `sess-${id}`;
  d1.db.prepare('INSERT INTO auth_sessions (id, user_id, email, full_name, role, companies) VALUES (?,?,?,?,?,?)').run(sid, id, `${id}@example.test`, name, role, cos);
  TOK[id] = await signEdgeSession({ sid, sub: id, email: `${id}@example.test`, name, role, companies: cos }, env);
}

let ipSeq = 0;
async function api(path, { method = 'GET', body, as, demo = false, query = '' } = {}) {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.1.0.${++ipSeq % 250}` };
  if (as) headers.Authorization = 'Bearer ' + TOK[as];
  if (demo) headers['X-ISABI-Demo'] = '1';
  const req = new Request(`https://example.test/app/api/${path}${query}`, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
  const res = await onRequest({ request: req, env, params: { route: path.split('/') } });
  const txt = await res.text();
  let json = null; try { json = JSON.parse(txt); } catch (_) {}
  return { status: res.status, json, txt };
}
const ovr = (as, body) => api('auth/override-requests', { method: 'POST', as, body });
const ovrGet = (as, query) => api('auth/override-requests', { as, query });
const sv = (as, body) => api('saved-views', { method: 'POST', as, body });

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail).slice(0, 400) : '')); }
}
// override_audit is created lazily by the Edge code (ensureOverrideAuditSchema) until the first approval.
const auditCount = () => { try { return d1.one('SELECT COUNT(*) AS n FROM override_audit').n; } catch (_) { return 0; } };
const REQ_KEYS = ['id', 'created_at', 'expires_at', 'status', 'company', 'form_key', 'field_id', 'field_label', 'unlock_all', 'record_id', 'reason', 'caller', 'decided_by', 'decided_at', 'decision_note', 'audit_id'].sort().join(',');
const VIEW_KEYS = ['id', 'table_key', 'name', 'payload', 'use_count', 'last_used_at', 'created_at', 'updated_at'].sort().join(',');
const BASE = { op: 'create', company: 'WTC', form_key: 'sales_ticket', field_id: 'f_unitprice', field_label: 'Unit Price', record_id: 'st-test-1', reason: 'Customer agreed a special price' };

console.log('\n[override requests] auth gates');
{
  let r = await ovrGet(null, '?status=pending');
  ok('unauthenticated GET -> 401', r.status === 401, r);
  r = await ovr(null, BASE);
  ok('unauthenticated POST -> 401', r.status === 401, r);
  r = await api('auth/override-requests', { method: 'POST', as: 't-entry-wtc', body: BASE, demo: true });
  ok('demo header with a session -> 403', r.status === 403 && r.json.ok === false, r);
  r = await api('auth/override-requests', { as: 't-sup-wtc', query: '?status=pending', demo: true });
  ok('demo header on GET -> 403', r.status === 403, r);
  ok('demo create wrote nothing', d1.one("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'override_requests'").n === 0
    || d1.one('SELECT COUNT(*) AS n FROM override_requests').n === 0);
}

console.log('\n[override requests] create + shape');
let reqA;
{
  const r = await ovr('t-entry-wtc', Object.assign({}, BASE, { company: '  WTC  ', reason: 'x'.repeat(500), field_label: 'L'.repeat(300) }));
  reqA = r.json && r.json.request;
  ok('Entry seat creates a request', r.status === 200 && r.json.ok === true && reqA && /^ovr-\d+-[0-9a-f]{8}$/.test(reqA.id), r);
  ok('response has exactly the contract keys', reqA && Object.keys(reqA).sort().join(',') === REQ_KEYS, reqA && Object.keys(reqA));
  ok('caller block is the session seat', reqA && reqA.caller.user_id === 't-entry-wtc' && reqA.caller.full_name === 'Entry WTC' && reqA.caller.role === 'Entry'
    && Object.keys(reqA.caller).sort().join(',') === 'email,full_name,role,user_id', reqA && reqA.caller);
  ok('pending, undecided, trimmed and capped', reqA && reqA.status === 'pending' && reqA.decided_by === null && reqA.audit_id === null && reqA.decided_at === null
    && reqA.company === 'WTC' && reqA.reason.length === 200 && reqA.field_label.length === 120 && reqA.unlock_all === false, reqA);
  ok('expires 10 minutes after creation', reqA && (Date.parse(reqA.expires_at) - Date.parse(reqA.created_at)) === 600000, reqA);
  ok('no ip_hash or pin in the response', !/ip_hash|pin_code|"pin"/.test(r.txt), r.txt);
  const stored = d1.one('SELECT ip_hash FROM override_requests WHERE id = ?', reqA.id);
  ok('ip hash is stored server-side only', stored && stored.ip_hash && stored.ip_hash.length >= 8);
  let r2 = await ovr('t-entry-wtc', Object.assign({}, BASE, { company: 'BBConstruction' }));
  ok('NEGATIVE: caller without scope on the company -> 403', r2.status === 403, r2);
  r2 = await ovr('t-entry-wtc', Object.assign({}, BASE, { company: 'all' }));
  ok('NEGATIVE: non-owner group-wide request -> 403', r2.status === 403, r2);
  r2 = await ovr('t-entry-wtc', Object.assign({}, BASE, { field_id: '', unlock_all: false }));
  ok('NEGATIVE: neither field_id nor unlock_all -> 400', r2.status === 400, r2);
  r2 = await ovr('t-entry-wtc', { op: 'nope' });
  ok('NEGATIVE: unknown op -> 400', r2.status === 400, r2);
  r2 = await ovrGet('t-entry-wtc', '');
  ok('NEGATIVE: GET with no selector -> 400', r2.status === 400, r2);
}

console.log('\n[override requests] visibility');
{
  let r = await ovrGet('t-sup-wtc', '?status=pending');
  ok('WTC Supervisor sees the pending request', r.status === 200 && r.json.requests.some(x => x.id === reqA.id), r.json);
  r = await ovrGet('t-owner1', '?status=pending');
  ok('full-group Owner sees it', r.json.requests.some(x => x.id === reqA.id), r.json);
  r = await ovrGet('t-custom-wtc', '?status=pending');
  ok('Custom seat with unlock_unit_price sees an f_unitprice request', r.json.requests.some(x => x.id === reqA.id), r.json);
  r = await ovrGet('t-sup-bbc', '?status=pending');
  ok('NEGATIVE: cross-company Supervisor does not see it', r.status === 200 && !r.json.requests.some(x => x.id === reqA.id), r.json);
  r = await ovrGet('t-entry-wtc2', '?status=pending');
  ok('NEGATIVE: another Entry seat does not see it', r.status === 200 && r.json.requests.length === 0, r.json);
  r = await ovrGet('t-entry-wtc', '?status=pending');
  ok('NEGATIVE: the caller is not offered its own request to approve', !r.json.requests.some(x => x.id === reqA.id), r.json);
  r = await ovrGet('t-entry-wtc', `?id=${reqA.id}`);
  ok('caller can GET by id', r.status === 200 && r.json.request.id === reqA.id, r);
  r = await ovrGet('t-sup-wtc', `?id=${reqA.id}`);
  ok('eligible approver can GET by id', r.status === 200 && r.json.request.id === reqA.id, r);
  r = await ovrGet('t-sup-bbc', `?id=${reqA.id}`);
  ok('NEGATIVE: ineligible seat GET by id -> 404 (no oracle)', r.status === 404, r);
  const r404 = await ovrGet('t-sup-bbc', '?id=ovr-0-deadbeef');
  ok('unknown id and forbidden id answer identically', r404.status === 404 && r404.json.error === r.json.error, [r404.json, r.json]);
  r = await ovrGet('t-entry-wtc', '?mine=1');
  ok('?mine=1 lists the caller\'s own requests', r.status === 200 && r.json.requests.length === 1 && r.json.requests[0].id === reqA.id, r.json);
  r = await ovrGet('t-sup-wtc', '?mine=1');
  ok('?mine=1 is empty for a seat that sent nothing', r.json.requests.length === 0, r.json);
}

console.log('\n[override requests] decide');
{
  const before = auditCount();
  let r = await ovr('t-entry-wtc', { op: 'decide', id: reqA.id, decision: 'approve' });
  ok('NEGATIVE: self-approval -> 403', r.status === 403 && auditCount() === before, r);
  r = await ovr('t-entry-wtc2', { op: 'decide', id: reqA.id, decision: 'approve' });
  ok('NEGATIVE: Entry seat cannot approve (404)', r.status === 404 && auditCount() === before, r);
  r = await ovr('t-sup-bbc', { op: 'decide', id: reqA.id, decision: 'approve' });
  ok('NEGATIVE: cross-company Supervisor cannot approve (404)', r.status === 404 && auditCount() === before, r);
  r = await ovr('t-sup-wtc', { op: 'decide', id: reqA.id, decision: 'maybe' });
  ok('NEGATIVE: bad decision value -> 400', r.status === 400, r);
  r = await ovr('t-sup-wtc', { op: 'decide', id: reqA.id, decision: 'approve', note: 'ok ' + 'n'.repeat(400) });
  const dec = r.json && r.json.request;
  ok('eligible Supervisor approves', r.status === 200 && dec && dec.status === 'approved' && dec.decided_by && dec.decided_by.user_id === 't-sup-wtc'
    && dec.decided_by.full_name === 'Sup WTC' && dec.decision_note.length === 200 && /^ova-\d+-[0-9a-f]{8}$/.test(dec.audit_id || ''), r);
  const aud = dec && d1.one('SELECT * FROM override_audit WHERE id = ?', dec.audit_id);
  ok('approval wrote exactly one override_audit row', auditCount() === before + 1 && aud, aud);
  ok('audit row: caller from the request, supervisor = approver, same columns as the PIN path', aud
    && aud.caller_user_id === 't-entry-wtc' && aud.caller_email === 't-entry-wtc@example.test' && aud.caller_role === 'Entry'
    && aud.supervisor_user_id === 't-sup-wtc' && aud.supervisor_email === 't-sup-wtc@example.test' && aud.supervisor_name === 'Sup WTC'
    && aud.supervisor_role === 'Supervisor' && aud.company === 'WTC' && aud.form_key === 'sales_ticket' && aud.field_id === 'f_unitprice'
    && aud.field_label === 'L'.repeat(120) && aud.unlock_all === 0 && aud.record_id === 'st-test-1' && aud.ip_hash, aud);
  r = await api('auth/verify-override', { as: 't-owner1' });
  ok('the approval shows in the existing override audit log', r.status === 200 && r.json.audits.some(a => a.id === dec.audit_id), r.json);
  r = await ovr('t-owner1', { op: 'decide', id: reqA.id, decision: 'approve' });
  ok('double decide -> 409 with the contract message', r.status === 409 && r.json.error === 'This request was already decided or has expired.' && auditCount() === before + 1, r);
  r = await ovr('t-sup-wtc2', { op: 'decide', id: reqA.id, decision: 'deny' });
  ok('deny after approve -> 409', r.status === 409, r);
  r = await ovr('t-entry-wtc', { op: 'cancel', id: reqA.id });
  ok('cancel after approve -> 409', r.status === 409, r);
  r = await ovrGet('t-entry-wtc', `?id=${reqA.id}`);
  ok('caller polls and sees approved + audit id', r.json.request.status === 'approved' && r.json.request.audit_id === dec.audit_id, r.json);
  r = await ovrGet('t-sup-wtc', '?status=pending');
  ok('approved request leaves the pending list', !r.json.requests.some(x => x.id === reqA.id), r.json);
}

console.log('\n[override requests] deny, cancel, expiry, custom perms, group-wide');
{
  let c = await ovr('t-entry-wtc', Object.assign({}, BASE, { field_id: 'f_qty', field_label: 'Quantity' }));
  const qid = c.json.request.id;
  let r = await ovr('t-custom-wtc', { op: 'decide', id: qid, decision: 'approve' });
  ok('NEGATIVE: Custom seat without unlock_qty_cap cannot approve f_qty (404)', r.status === 404, r);
  const before = auditCount();
  r = await ovr('t-sup-wtc2', { op: 'decide', id: qid, decision: 'deny', note: 'Not agreed' });
  ok('deny works', r.status === 200 && r.json.request.status === 'denied' && r.json.request.decided_by.user_id === 't-sup-wtc2'
    && r.json.request.decision_note === 'Not agreed' && r.json.request.audit_id === null, r);
  ok('deny writes no audit row', auditCount() === before);

  c = await ovr('t-entry-wtc', BASE);
  const cid = c.json.request.id;
  r = await ovr('t-sup-wtc', { op: 'cancel', id: cid });
  ok('NEGATIVE: an approver cannot cancel the caller\'s request (403)', r.status === 403, r);
  r = await ovr('t-sup-bbc', { op: 'cancel', id: cid });
  ok('NEGATIVE: an unrelated seat gets 404 on cancel', r.status === 404, r);
  r = await ovr('t-entry-wtc', { op: 'cancel', id: cid });
  ok('caller cancels its pending request', r.status === 200 && r.json.request.status === 'cancelled', r);
  r = await ovr('t-sup-wtc', { op: 'decide', id: cid, decision: 'approve' });
  ok('approve after cancel -> 409', r.status === 409 && auditCount() === before, r);

  c = await ovr('t-entry-wtc', Object.assign({}, BASE, { field_id: '', unlock_all: true, field_label: 'All fields' }));
  const eid = c.json.request.id;
  d1.db.prepare('UPDATE override_requests SET expires_at = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), eid);
  r = await ovrGet('t-entry-wtc', `?id=${eid}`);
  ok('a pending row past expiry reads back as expired', r.json.request.status === 'expired', r.json);
  r = await ovr('t-sup-wtc', { op: 'decide', id: eid, decision: 'approve' });
  ok('approve after expiry -> 409, no audit row', r.status === 409 && auditCount() === before, r);
  r = await ovr('t-entry-wtc', { op: 'cancel', id: eid });
  ok('cancel after expiry -> 409', r.status === 409, r);
  r = await ovrGet('t-sup-wtc', '?status=pending');
  ok('expired request is not in the pending list', !r.json.requests.some(x => x.id === eid), r.json);
  ok('expiry is persisted by the list sweep', d1.one('SELECT status FROM override_requests WHERE id = ?', eid).status === 'expired');

  c = await ovr('t-entry-wtc', Object.assign({}, BASE, { field_id: '', unlock_all: true, field_label: 'All fields' }));
  const uid = c.json.request.id;
  r = await ovr('t-custom-wtc', { op: 'decide', id: uid, decision: 'approve' });
  ok('NEGATIVE: Custom seat without every unlock cannot approve unlock_all (404)', r.status === 404, r);
  r = await ovr('t-sup-wtc', { op: 'decide', id: uid, decision: 'approve' });
  const a2 = r.json.request && d1.one('SELECT field_id, unlock_all FROM override_audit WHERE id = ?', r.json.request.audit_id);
  ok('unlock_all approval writes field_id __all like the PIN path', r.status === 200 && a2 && a2.field_id === '__all' && a2.unlock_all === 1, [r.json, a2]);

  c = await ovr('t-owner1', Object.assign({}, BASE, { company: 'all' }));
  const gid = c.json.request && c.json.request.id;
  ok('full-group Owner may send a group-wide request', c.status === 200 && gid, c);
  r = await ovr('t-sup-wtc', { op: 'decide', id: gid, decision: 'approve' });
  ok('NEGATIVE: group-wide needs a full-group Owner approver (404)', r.status === 404, r);
  r = await ovr('t-owner2', { op: 'decide', id: gid, decision: 'approve' });
  ok('another full-group Owner approves the group-wide request', r.status === 200 && r.json.request.status === 'approved', r);

  c = await ovr('t-entry-wtc', Object.assign({}, BASE, { company: '' }));
  const sid = c.json.request.id;
  r = await ovrGet('t-sup-bbc', `?id=${sid}`);
  ok('NEGATIVE: no-company request is hidden from a seat sharing no company', r.status === 404, r);
  r = await ovr('t-sup-wtc2', { op: 'decide', id: sid, decision: 'approve' });
  ok('no-company request: an approver sharing a company can approve', r.status === 200, r);
}

console.log('\n[override requests] suspended approver');
{
  const c = await ovr('t-entry-wtc', BASE);
  const id = c.json.request.id;
  let r = await ovrGet('t-sup-susp', '?status=pending');
  ok('before suspension the seat sees the request', r.json.requests.some(x => x.id === id), r.json);
  d1.db.prepare("UPDATE users SET status = 'Suspended' WHERE id = 't-sup-susp'").run();
  r = await ovr('t-sup-susp', { op: 'decide', id, decision: 'approve' });
  ok('NEGATIVE: suspended approver session is refused at the router (401)', r.status === 401, r);
  const fakeSess = { sid: 'sess-t-sup-susp', sub: 't-sup-susp', email: 't-sup-susp@example.test', role: 'Supervisor', companies: 'WTC' };
  const raw = await handleOverrideRequests(new Request('https://example.test/app/api/auth/override-requests', { method: 'POST' }), env, fakeSess,
    { op: 'decide', id, decision: 'approve' }, new URL('https://example.test/'));
  ok('NEGATIVE: even with a stale session object the users row decides (suspended -> 404)', raw.status === 404);
  const rawList = await handleOverrideRequests(new Request('https://example.test/app/api/auth/override-requests?status=pending'), env, fakeSess, {},
    new URL('https://example.test/app/api/auth/override-requests?status=pending'));
  ok('NEGATIVE: suspended seat lists nothing', (await rawList.json()).requests.length === 0);
  const roleLie = { sid: 'x', sub: 't-entry-wtc2', email: 't-entry-wtc2@example.test', role: 'Owner', companies: 'All' };
  const rawLie = await handleOverrideRequests(new Request('https://example.test/x', { method: 'POST' }), env, roleLie, { op: 'decide', id, decision: 'approve' }, new URL('https://example.test/'));
  ok('NEGATIVE: session.role is never trusted (Entry row with an Owner claim -> 404)', rawLie.status === 404);
  ok('request is still pending and unaudited', d1.one('SELECT status, audit_id FROM override_requests WHERE id = ?', id).status === 'pending');
  r = await ovr('t-entry-wtc', { op: 'cancel', id });
  ok('caller cleans up', r.status === 200);
}

console.log('\n[override requests] race + rate limits');
{
  const c = await ovr('t-entry-wtc', BASE);
  const id = c.json.request.id;
  const before = auditCount();
  const [x, y] = await Promise.all([
    ovr('t-sup-wtc', { op: 'decide', id, decision: 'approve' }),
    ovr('t-owner1', { op: 'decide', id, decision: 'approve' })
  ]);
  const statuses = [x.status, y.status].sort().join(',');
  ok('two concurrent approvals: one wins, one gets 409, one audit row', statuses === '200,409' && auditCount() === before + 1, [x.status, y.status, auditCount() - before]);

  const made = [];
  for (let i = 0; i < 3; i++) made.push(await ovr('t-entry-rate', BASE));
  ok('three pending requests are allowed', made.every(m => m.status === 200), made.map(m => m.status));
  let r = await ovr('t-entry-rate', BASE);
  ok('a fourth pending request -> 429', r.status === 429 && r.json.ok === false && r.json.error, r);
  await ovr('t-entry-rate', { op: 'cancel', id: made[0].json.request.id });
  r = await ovr('t-entry-rate', BASE);
  ok('after cancelling one, a new request is allowed', r.status === 200, r);
  // 4 created so far this hour; cancel/create until the hourly cap of 20.
  const live = [made[1], made[2], r].map(m => m.json.request.id);
  for (const lid of live) await ovr('t-entry-rate', { op: 'cancel', id: lid });
  let created = 4, lastOk = true;
  while (created < 20) {
    const m = await ovr('t-entry-rate', BASE);
    if (m.status !== 200) { lastOk = false; break; }
    created++;
    await ovr('t-entry-rate', { op: 'cancel', id: m.json.request.id });
  }
  ok('20 creates in an hour are allowed', lastOk && created === 20, created);
  r = await ovr('t-entry-rate', BASE);
  ok('the 21st create in an hour -> 429', r.status === 429 && /per hour/.test(r.json.error), r);
  r = await ovrGet('t-entry-rate', '?mine=1');
  ok('?mine=1 caps at 20 newest first', r.json.requests.length === 20
    && r.json.requests.every((q, i, a) => i === 0 || a[i - 1].created_at >= q.created_at), r.json.requests.length);
  d1.db.prepare("UPDATE override_requests SET created_at = ? WHERE caller_user_id = 't-entry-rate'").run(new Date(Date.now() - 2 * 86400000).toISOString());
  r = await ovrGet('t-entry-rate', '?mine=1');
  ok('?mine=1 drops requests older than 24 h', r.json.requests.length === 0, r.json.requests.length);
}

console.log('\n[saved views]');
{
  let r = await api('saved-views', {});
  ok('unauthenticated GET -> 401', r.status === 401, r);
  r = await api('saved-views', { method: 'POST', body: { op: 'save' } });
  ok('unauthenticated POST -> 401', r.status === 401, r);
  r = await api('saved-views', { as: 't-view-a', demo: true });
  ok('demo header -> 403', r.status === 403, r);
  r = await api('saved-views', { method: 'POST', as: 't-view-a', demo: true, body: { op: 'save', table_key: 'sales', name: 'x', payload: {} } });
  ok('demo header on save -> 403', r.status === 403, r);

  r = await api('saved-views', { as: 't-view-a' });
  ok('empty list for a new seat', r.status === 200 && Array.isArray(r.json.views) && r.json.views.length === 0, r);
  r = await sv('t-view-a', { op: 'save', table_key: 'sales_tickets', name: '  WTC this month  ', payload: { filters: { company: 'WTC' }, sort: ['date', 'desc'], cols: ['a', 'b'] } });
  const v1 = r.json && r.json.view;
  ok('save creates a view', r.status === 200 && v1 && /^sv-\d+-[0-9a-f]{8}$/.test(v1.id) && v1.name === 'WTC this month' && v1.use_count === 0, r);
  ok('view has exactly the contract keys, payload parsed', v1 && Object.keys(v1).sort().join(',') === VIEW_KEYS && v1.payload.filters.company === 'WTC', v1);
  r = await sv('t-view-a', { op: 'save', id: v1.id, table_key: 'sales_tickets', name: 'Renamed', payload: { filters: { company: 'BBC' } } });
  ok('save with own id updates in place', r.status === 200 && r.json.view.id === v1.id && r.json.view.name === 'Renamed' && r.json.view.payload.filters.company === 'BBC'
    && r.json.view.created_at === v1.created_at, r);
  r = await sv('t-view-a', { op: 'save', table_key: 'expenses', name: 'Second', payload: {} });
  const v2 = r.json.view;
  r = await sv('t-view-a', { op: 'used', id: v2.id });
  ok('used bumps use_count and last_used_at', r.status === 200 && r.json.view.use_count === 1 && r.json.view.last_used_at, r);
  await sv('t-view-a', { op: 'used', id: v2.id });
  r = await api('saved-views', { as: 't-view-a' });
  ok('GET lists the seat\'s views, most used first', r.json.views.length === 2 && r.json.views[0].id === v2.id && r.json.views[0].use_count === 2, r.json);

  r = await api('saved-views', { as: 't-view-b' });
  ok('ISOLATION: another seat sees none of them', r.json.views.length === 0, r.json);
  r = await sv('t-view-b', { op: 'save', id: v1.id, table_key: 'sales_tickets', name: 'Hijack', payload: {} });
  ok('ISOLATION: saving over a foreign id -> 404', r.status === 404, r);
  r = await sv('t-view-b', { op: 'used', id: v1.id });
  ok('ISOLATION: used on a foreign id -> 404', r.status === 404, r);
  r = await sv('t-view-b', { op: 'delete', id: v1.id });
  ok('ISOLATION: delete on a foreign id -> 404', r.status === 404, r);
  ok('ISOLATION: the owner\'s view is untouched', d1.one('SELECT name FROM saved_views WHERE id = ?', v1.id).name === 'Renamed');
  r = await sv('t-view-a', { op: 'save', id: 'sv-0-00000000', table_key: 'sales_tickets', name: 'Ghost', payload: {} });
  ok('save with an unknown id -> 404', r.status === 404, r);

  r = await sv('t-view-a', { op: 'save', table_key: 'bad key!', name: 'x', payload: {} });
  ok('NEGATIVE: invalid table_key -> 400', r.status === 400, r);
  r = await sv('t-view-a', { op: 'save', table_key: 'k'.repeat(81), name: 'x', payload: {} });
  ok('NEGATIVE: table_key over 80 chars -> 400', r.status === 400, r);
  r = await sv('t-view-a', { op: 'save', table_key: 'ok_key', name: '   ', payload: {} });
  ok('NEGATIVE: blank name -> 400', r.status === 400, r);
  r = await sv('t-view-a', { op: 'save', table_key: 'ok_key', name: 'n'.repeat(61), payload: {} });
  ok('NEGATIVE: 61-char name -> 400', r.status === 400, r);
  r = await sv('t-view-a', { op: 'save', table_key: 'ok_key', name: 'n'.repeat(60), payload: {} });
  ok('60-char name is accepted', r.status === 200, r);
  r = await sv('t-view-a', { op: 'save', table_key: 'ok_key', name: 'arr', payload: [1, 2] });
  ok('NEGATIVE: array payload -> 400', r.status === 400, r);
  r = await sv('t-view-a', { op: 'save', table_key: 'ok_key', name: 'str', payload: 'x' });
  ok('NEGATIVE: string payload -> 400', r.status === 400, r);
  r = await sv('t-view-a', { op: 'save', table_key: 'ok_key', name: 'big', payload: { blob: 'x'.repeat(16 * 1024) } });
  ok('NEGATIVE: payload over 16 KB -> 400', r.status === 400 && /16 KB/.test(r.json.error), r.json);
  r = await sv('t-view-a', { op: 'save', table_key: 'ok_key', name: 'fits', payload: { blob: 'x'.repeat(16 * 1024 - 20) } });
  ok('payload just under 16 KB is accepted', r.status === 200, r.json);
  r = await sv('t-view-a', { op: 'bogus' });
  ok('NEGATIVE: unknown op -> 400', r.status === 400, r);

  r = await sv('t-view-a', { op: 'delete', id: v2.id });
  ok('delete own view', r.status === 200 && r.json.ok === true && !d1.one('SELECT id FROM saved_views WHERE id = ?', v2.id), r);
  r = await sv('t-view-a', { op: 'delete', id: v2.id });
  ok('delete again -> 404', r.status === 404, r);

  // Count limits on a fresh seat: 30 per table_key, 200 per seat.
  let okCount = 0;
  for (let i = 0; i < 30; i++) if ((await sv('t-view-b', { op: 'save', table_key: 'tbl0', name: `v${i}`, payload: { i } })).status === 200) okCount++;
  ok('30 views on one table are allowed', okCount === 30, okCount);
  r = await sv('t-view-b', { op: 'save', table_key: 'tbl0', name: 'v30', payload: {} });
  ok('NEGATIVE: the 31st view on one table -> 400', r.status === 400 && /30/.test(r.json.error), r.json);
  const other = d1.one("SELECT id FROM saved_views WHERE user_id = 't-view-b' AND table_key = 'tbl0' LIMIT 1").id;
  r = await sv('t-view-b', { op: 'save', id: other, table_key: 'tbl0', name: 'edit within full table', payload: {} });
  ok('editing a view on a full table is still allowed', r.status === 200, r.json);
  for (let t = 1; t < 7; t++) for (let i = 0; i < 30; i++) {
    if (d1.one("SELECT COUNT(*) AS n FROM saved_views WHERE user_id = 't-view-b'").n >= 200) break;
    await sv('t-view-b', { op: 'save', table_key: `tbl${t}`, name: `v${i}`, payload: {} });
  }
  ok('seat reached 200 views', d1.one("SELECT COUNT(*) AS n FROM saved_views WHERE user_id = 't-view-b'").n === 200);
  r = await sv('t-view-b', { op: 'save', table_key: 'tbl_new', name: 'one more', payload: {} });
  ok('NEGATIVE: the 201st view on a seat -> 400', r.status === 400 && /200/.test(r.json.error), r.json);
  r = await sv('t-view-a', { op: 'save', table_key: 'tbl_new', name: 'seat A unaffected', payload: {} });
  ok('limits are per seat (seat A can still save)', r.status === 200, r.json);
}

console.log('\n[general]');
{
  const allTxt = JSON.stringify(d1.rows('SELECT * FROM override_requests')) + JSON.stringify(d1.rows('SELECT * FROM saved_views'));
  ok('no em dash or arrow in stored text', !/[—→]/.test(allTxt));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
