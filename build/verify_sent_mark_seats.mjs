// Who may change a sent statement mark or the Owner's Rate Changes marks, on the Edge (functions/_lib/d1_store.js),
// driven through the real router (functions/app/api/[[route]].js) against an in-memory SQLite database standing in
// for D1. Owner 2026-11-21: the app already limits these; the server now refuses the same changes from any client.
//   WF::statement_watermark::*  set or move later: a finance seat (modify) or a supervisor seat (void);
//                               remove, void or move to an earlier date: a supervisor seat only.
//   WF::rate_change_review::* and WF::rate_change_settings::*: the Owner only.
// POST /industry_domain_store refuses (403, nothing stored); /sync keeps the stored mark (enforceGuardedWorkflowMarksOnSync,
// checked directly here and found on the route in the source). A mark sent back unchanged never blocks other edits.
// Mirrors isabi-app/build/verify_sent_mark_seats.py. Nothing live is touched.
// Run: node build/verify_sent_mark_seats.mjs      (Node 22.5+ for node:sqlite)

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequest } from '../functions/app/api/[[route]].js';
import { signEdgeSession, getSessionWritePerms } from '../functions/_lib/security.js';
import { enforceGuardedWorkflowMarksOnSync, guardedWorkflowMarkError, isGuardedWorkflowMarkKey } from '../functions/_lib/d1_store.js';

// ---- minimal D1 stand-in (same binding rules as build/verify_device_unsent.mjs) ----
class Stmt {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...p) { return new Stmt(this.db, this.sql, p); }
  args() {
    const used = new Set((this.sql.match(/\?\d+/g) || []));
    if (!used.size) return this.params.map(v => (v === undefined ? null : (typeof v === 'boolean' ? (v ? 1 : 0) : v)));
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
}

const d1 = new D1();
d1.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, full_name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, pin_code TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'Entry', companies TEXT NOT NULL DEFAULT 'WTC', pbi_access TEXT DEFAULT 'full',
  statements_access TEXT DEFAULT 'full', status TEXT DEFAULT 'Active', last_login_at TEXT DEFAULT '', custom_perms TEXT DEFAULT '{}');
  CREATE TABLE auth_sessions (id TEXT PRIMARY KEY, user_id TEXT DEFAULT '', email TEXT DEFAULT '', full_name TEXT DEFAULT '',
  role TEXT DEFAULT '', companies TEXT DEFAULT '', device TEXT DEFAULT '', logged_in_at TEXT DEFAULT '', method TEXT DEFAULT 'PIN',
  confidence REAL, ip_hash TEXT DEFAULT '');
  CREATE TABLE edge_kv_store (doc_key TEXT PRIMARY KEY, payload_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL DEFAULT '',
  updated_by TEXT DEFAULT '', rev INTEGER DEFAULT 1);
  CREATE TABLE industry_custom_rows (bucket TEXT NOT NULL, row_id TEXT NOT NULL, company TEXT DEFAULT '', rev INTEGER DEFAULT 1,
  voided INTEGER DEFAULT 0, updated_at TEXT DEFAULT '', payload_json TEXT DEFAULT '{}', PRIMARY KEY (bucket, row_id));
  CREATE TABLE industry_row_edits (edit_key TEXT PRIMARY KEY, rev INTEGER DEFAULT 1, voided INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT '', payload_json TEXT DEFAULT '{}');`);
const env = { DB: d1, ISABI_JWT_SECRET: 'sent-mark-offline-test-secret-' + Math.random().toString(36).slice(2) };
const FIN_PERMS = JSON.stringify({ rights: { read_ops: true, read_fin: true, enter_dispatch: false, enter_accounting: true, enter_master: false,
  enter_payroll_jv: false, modify_text: true, modify_data: true, void_data: false, manage_users: false } });
const seat = (id, name, email, role, cos, cp = '{}') => {
  d1.db.prepare('INSERT INTO users (id, full_name, email, role, companies, custom_perms) VALUES (?,?,?,?,?,?)').run(id, name, email, role, cos, cp);
  d1.db.prepare('INSERT INTO auth_sessions (id, user_id, email, full_name, role, companies) VALUES (?,?,?,?,?,?)').run('sess-' + id, id, email, name, role, cos);
  return signEdgeSession({ sid: 'sess-' + id, sub: id, email, name, role, companies: cos }, env);
};
const OWNER = await seat('u1', 'Owner Seat', 'owner.seat@example.test', 'Full Access (Owner)', 'All');
const SE = await seat('u4', 'Sup Entry All', 'se.seat@example.test', 'Supervisor + Entry', 'All');
const SUP = await seat('u3', 'Supervisor Seat', 'sup.seat@example.test', 'Supervisor', 'WTC');
const ENTRY = await seat('u7', 'Entry Seat', 'entry.seat@example.test', 'Entry', 'WTC');
const FIN = await seat('u9', 'Finance Seat', 'fin.seat@example.test', 'Custom', 'WTC', FIN_PERMS);

async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const h = Object.assign({ 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.9.0.3' }, headers);
  const req = new Request(`https://example.test/app/api/${path}`, { method, headers: h, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
  const res = await onRequest({ request: req, env, params: { route: path.split('/') }, waitUntil: () => {} });
  const txt = await res.text();
  let json = null; try { json = JSON.parse(txt); } catch (_) {}
  return { status: res.status, json, txt: txt.slice(0, 400) };
}
const post = (tok, edits = {}, purged = []) => api('industry_domain_store', {
  method: 'POST', headers: { 'X-ISABI-Session': tok },
  body: { industryCustomRows: {}, industryRowEdits: edits, purgedRows: [], purgedEditKeys: purged }
});
const stored = ek => {
  const r = d1.one('SELECT rev, voided, payload_json FROM industry_row_edits WHERE edit_key = ?', ek);
  return r ? Object.assign(JSON.parse(r.payload_json || '{}'), { _db_rev: r.rev, _db_voided: r.voided }) : null;
};

const J = JSON.stringify;
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail).slice(0, 500) : '')); }
}

const MARK = 'WF::statement_watermark::manufacturing::wtc::customer::acme trading';
const mark = (through, rev, cleared = false, extra = {}) => Object.assign({
  key: 'manufacturing::wtc::customer::acme trading', industry: 'manufacturing', company: 'WTC', party_type: 'customer',
  party_name: 'ACME Trading', report_id: '14', confirmed_through: cleared ? '' : through, cleared, rev,
  updated_at: `2026-11-21T10:00:${String(rev).padStart(2, '0')}.000Z`
}, extra);
const clean = o => { const c = Object.assign({}, o); delete c._db_rev; delete c._db_voided; return c; };

console.log('\n[sent statement mark: who may set it]');
{
  let r = await post(ENTRY, { [MARK]: mark('2026-10-31', 1) });
  ok('an Entry seat cannot mark a statement sent (403, nothing stored)', r.status === 403 && /finance or supervisor/.test(r.json && r.json.error) && !stored(MARK), r);
  r = await post(FIN, { [MARK]: mark('2026-10-31', 1) });
  ok('a finance seat marks it sent through 2026-10-31', r.status === 200 && stored(MARK) && stored(MARK).confirmed_through === '2026-10-31', r);
  r = await post(SUP, { [MARK]: mark('2026-11-15', 2) });
  ok('a read-only Supervisor moves it later (2026-11-15): allowed like a period lock', r.status === 200 && stored(MARK).confirmed_through === '2026-11-15', r);
}

console.log('\n[sent statement mark: removing or moving it earlier]');
{
  let r = await post(FIN, { [MARK]: mark('2026-10-15', 3) });
  ok('a finance seat cannot move it to an earlier date (403, mark kept)', r.status === 403 && /supervisor/.test(r.json.error) && stored(MARK).confirmed_through === '2026-11-15', r);
  r = await post(FIN, { [MARK]: mark('', 3, true) });
  ok('a finance seat cannot remove it (403, mark kept)', r.status === 403 && stored(MARK).confirmed_through === '2026-11-15' && !stored(MARK).cleared, r);
  r = await post(FIN, { [MARK]: mark('2026-11-15', 3, false, { voided: true }) });
  ok('a finance seat cannot void it (403, mark kept)', r.status === 403 && !stored(MARK)._db_voided, r);
  r = await post(FIN, {}, [MARK]);
  ok('a finance seat cannot purge an active mark (403, mark kept)', r.status === 403 && Boolean(stored(MARK)), r);
  r = await post(FIN, { [MARK]: mark('2026-11-20', 3) });
  ok('a finance seat may move it later (2026-11-20)', r.status === 200 && stored(MARK).confirmed_through === '2026-11-20', r);
}

console.log('\n[sent statement mark: switching it off another way]');
{
  let r = await post(FIN, { [MARK]: mark('2026-11-20', 4, false, { party_name: 'zzz' }) });
  ok('a finance seat cannot file the mark under another party (403, party kept)', r.status === 403 && stored(MARK).party_name === 'ACME Trading', r);
  for (const [fld, val] of [['company', 'BBConstruction'], ['party_type', 'supplier'], ['industry', 'trading']]) {
    r = await post(FIN, { [MARK]: mark('2026-11-20', 4, false, { [fld]: val }) });
    ok(`a finance seat cannot change its ${fld} (403)`, r.status === 403 && stored(MARK)[fld] !== val, r);
  }
  for (const val of ['on', 'false', 2, 'yes']) {
    r = await post(FIN, { [MARK]: mark('2026-11-20', 4, false, { cleared: val }) });
    ok(`a finance seat cannot switch it off with cleared=${JSON.stringify(val)} (refused or not written, still active)`,
      (r.status === 403 || (r.status === 200 && r.json && r.json.edits === 0)) && stored(MARK).cleared === false, r);
  }
  r = await post(FIN, { [MARK]: mark('2026-11-20', 4, false, { company: 'wtc' }) });
  ok('re-typing the same company (wtc for WTC) is not a change of party', r.status === 200, r);
  const otherM = 'MFG::Test Register::ROW-M1';
  r = await post(FIN, { [MARK]: mark('2026-10-01', 5), [otherM]: { company: 'WTC', industry: 'Manufacturing', note: 'm', rev: 1 } });
  ok('a refused mark inside a larger save: the rest is saved (200), the mark stays, and the answer names it',
    r.status === 200 && Boolean(stored(otherM)) && stored(MARK).confirmed_through === '2026-11-20'
    && J(((r.json || {}).refusedMarks || []).map(x => x.key)) === J([MARK]), r);
  r = await post(FIN, { [MARK]: mark('2026-10-01', 5) });
  ok('a refused mark on its own: 403 naming it', r.status === 403 && J(((r.json || {}).refusedMarks || []).map(x => x.key)) === J([MARK]), r);
}

console.log('\n[a mark sent back unchanged never blocks other edits]');
{
  const other = 'MFG::Test Register::ROW-A1';
  let r = await post(ENTRY, { [MARK]: clean(stored(MARK)), [other]: { company: 'WTC', industry: 'Manufacturing', note: 'x', rev: 1 } });
  ok('an Entry seat\'s save carrying the unchanged mark goes through', r.status === 200 && Boolean(stored(other)), r);
  r = await post(FIN, { [MARK]: mark('2026-10-31', 1) });
  ok('an older copy of the mark (lower rev) is ignored, not refused', r.status === 200 && stored(MARK).confirmed_through === '2026-11-20', r);
}

console.log('\n[a supervisor removes it]');
{
  let r = await post(SUP, { [MARK]: mark('', 4, true) });
  ok('a read-only Supervisor removes the mark', r.status === 200 && stored(MARK).cleared === true, r);
  r = await post(FIN, {}, [MARK]);
  ok('a removed mark can be purged by a finance seat (nothing it locks)', r.status === 200 && !stored(MARK), r);
}

const REV = 'WF::rate_change_review::price_rules::PR-1::change::2026-11-21T09:00:00.000Z';
const SET = 'WF::rate_change_settings::alert';
const review = { reviewed_at: '2026-11-21T10:00:00.000Z', reviewed_by: 'Someone', rev: 1 };
console.log('\n[Rate Changes marks: Owner only]');
{
  let r = await post(SE, { [REV]: review });
  ok('a Supervisor + Entry seat cannot mark a rate change reviewed (403)', r.status === 403 && /Owner/.test(r.json.error) && !stored(REV), r);
  r = await post(SE, { [SET]: { usd: 999999, rev: 1 } });
  ok('a Supervisor + Entry seat cannot change the alert amount (403)', r.status === 403 && !stored(SET), r);
  r = await post(OWNER, { [REV]: review, [SET]: { usd: 2500, rev: 1 } });
  ok('the Owner marks it reviewed and sets the alert amount', r.status === 200 && Boolean(stored(REV)) && stored(SET).usd === 2500, r);
  r = await post(SE, { [REV]: Object.assign({}, review), 'MFG::Test Register::ROW-A2': { company: 'WTC', note: 'y', rev: 1 } });
  ok('a Supervisor + Entry save carrying the Owner\'s unchanged review goes through', r.status === 200 && Boolean(stored('MFG::Test Register::ROW-A2')), r);
  r = await post(SE, { [SET]: { usd: 1, rev: 2 } });
  ok('a Supervisor + Entry seat cannot lower the Owner\'s alert amount (403, kept)', r.status === 403 && stored(SET).usd === 2500, r);
  r = await post(SE, {}, [REV]);
  ok('a Supervisor + Entry seat cannot purge a review (403, kept)', r.status === 403 && Boolean(stored(REV)), r);
}

console.log('\n[/sync keeps the stored mark]');
{
  const perms = s => getSessionWritePerms(s);
  const pEntry = perms({ user_id: 'u7', role: 'Entry', companies: 'WTC' });
  const pFin = perms({ user_id: 'u9', role: 'Custom', companies: 'WTC', custom_perms: FIN_PERMS });
  const pSe = perms({ user_id: 'u4', role: 'Supervisor + Entry', companies: 'All' });
  const pOwn = perms({ user_id: 'u1', role: 'Full Access (Owner)', companies: 'All' });
  ok('test seats resolve to the expected rights', pEntry.roleKey === 'Entry' && pFin.modifyData && !pFin.voidData && pSe.roleKey === 'Supervisor + Entry' && pOwn.roleKey === 'Full Access (Owner)',
    { pEntry: pEntry.roleKey, pFin: [pFin.modifyData, pFin.voidData], pSe: pSe.roleKey, pOwn: pOwn.roleKey });
  const prev = { industryRowEdits: { [MARK]: mark('2026-11-15', 2), [REV]: review, [SET]: { usd: 2500, rev: 1 } } };
  const NEW = 'WF::statement_watermark::manufacturing::wtc::customer::new co';
  let inc = { industryRowEdits: { [MARK]: mark('2026-11-20', 3), [NEW]: mark('2026-11-01', 1) } };
  enforceGuardedWorkflowMarksOnSync(inc, prev, pEntry);
  ok('sync: an Entry seat\'s moved mark goes back to the stored one', inc.industryRowEdits[MARK].confirmed_through === '2026-11-15', inc);
  ok('sync: an Entry seat\'s new mark is dropped', !(NEW in inc.industryRowEdits), inc);
  inc = { industryRowEdits: { [MARK]: mark('2026-10-01', 3) } };
  enforceGuardedWorkflowMarksOnSync(inc, prev, pFin);
  ok('sync: a finance seat\'s earlier date goes back to the stored one', inc.industryRowEdits[MARK].confirmed_through === '2026-11-15', inc);
  inc = { industryRowEdits: { [MARK]: mark('2026-11-30', 3) } };
  enforceGuardedWorkflowMarksOnSync(inc, prev, pFin);
  ok('sync: a finance seat\'s later date is kept', inc.industryRowEdits[MARK].confirmed_through === '2026-11-30', inc);
  inc = { industryRowEdits: { [MARK]: mark('2026-11-15', 2), [REV]: review } };
  enforceGuardedWorkflowMarksOnSync(inc, prev, pSe);
  ok('sync: a Supervisor + Entry save that leaves the alert amount out gets it back', inc.industryRowEdits[SET] && inc.industryRowEdits[SET].usd === 2500, inc);
  inc = { industryRowEdits: { [MARK]: mark('2026-11-15', 2), [REV]: review, [SET]: { usd: 1, rev: 2 } } };
  enforceGuardedWorkflowMarksOnSync(inc, prev, pSe);
  ok('sync: a Supervisor + Entry change to the alert amount goes back', inc.industryRowEdits[SET].usd === 2500, inc);
  inc = { industryRowEdits: { [MARK]: mark('2026-11-15', 3, false, { party_name: 'zzz' }) } };
  enforceGuardedWorkflowMarksOnSync(inc, prev, pFin);
  ok('sync: a finance seat\'s change of party goes back to the stored mark', inc.industryRowEdits[MARK].party_name === 'ACME Trading', inc);
  inc = { industryRowEdits: { [MARK]: mark('2026-11-15', 3, false, { cleared: 'on' }) } };
  enforceGuardedWorkflowMarksOnSync(inc, prev, pFin);
  ok('sync: a finance seat\'s cleared="on" goes back to the stored mark', inc.industryRowEdits[MARK].cleared === false, inc);
  inc = { customRecords: {} };
  enforceGuardedWorkflowMarksOnSync(inc, prev, pSe);
  ok('sync: a Supervisor + Entry save with no row edits at all keeps the stored marks',
    inc.industryRowEdits && inc.industryRowEdits[SET] && inc.industryRowEdits[SET].usd === 2500 && Boolean(inc.industryRowEdits[MARK]), inc);
  inc = { customRecords: {} };
  enforceGuardedWorkflowMarksOnSync(inc, prev, pOwn);
  ok('sync: the Owner\'s save with no row edits is left as it is', !('industryRowEdits' in inc), inc);
  // The table holds a later mark than the sync document (POST /industry_domain_store writes only the table)
  const d1m = new Map([[MARK, mark('2026-12-31', 9)]]);
  inc = { industryRowEdits: { [MARK]: mark('2026-11-20', 10) } };
  enforceGuardedWorkflowMarksOnSync(inc, prev, pFin, d1m);
  ok('sync: checked against the table row too: a finance seat cannot pull the table\'s 2026-12-31 mark back to 2026-11-20',
    inc.industryRowEdits[MARK].confirmed_through === '2026-12-31', inc);
  inc = { industryRowEdits: { [MARK]: mark('2026-12-31', 10) } };
  enforceGuardedWorkflowMarksOnSync(inc, prev, pFin, d1m);
  ok('sync: ... and keeping the table\'s date passes', inc.industryRowEdits[MARK].confirmed_through === '2026-12-31' && inc.industryRowEdits[MARK].rev === 10, inc);
  inc = { industryRowEdits: { [MARK]: mark('', 3, true), [REV]: review, [SET]: { usd: 5000, rev: 2 } } };
  enforceGuardedWorkflowMarksOnSync(inc, prev, pOwn);
  ok('sync: the Owner removes the mark and changes the alert amount', inc.industryRowEdits[MARK].cleared === true && inc.industryRowEdits[SET].usd === 5000, inc);
  ok('only the two mark families are guarded', isGuardedWorkflowMarkKey(MARK) && isGuardedWorkflowMarkKey(SET) && !isGuardedWorkflowMarkKey('WF::period_close::wtc')
    && guardedWorkflowMarkError('WF::period_close::wtc', null, {}, pEntry) === '');
}

console.log('\n[source]');
{
  const src = readFileSync(new URL('../functions/_lib/d1_store.js', import.meta.url), 'utf8');
  ok('the /sync route calls the guard right after the role write locks',
    /await enforceSyncRoleWriteLocks\(env\.DB, incomingDoc, prevDoc, session, syncAuditBlocked\);\s*\n\s*if \(session\) await enforceGuardedWorkflowMarksOnSyncDb\(env\.DB, incomingDoc, prevDoc, getSessionWritePerms\(session\)\);/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
