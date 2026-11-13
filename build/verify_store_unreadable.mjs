// Offline gate for the store read in functions/_lib/d1_store.js (incident 2026-11-13).
// The `mfg_web_store` document is kept as a head row plus `__part_NNNN` rows. When two writes mixed their parts the
// stitched JSON did not parse and `get_mfg` served it as an empty store, which a script then pushed back.
// Now an unparseable store is flagged (`storeUnreadable: true`), while the document stays `{}` so a browser that
// holds the full store can still sync and its next save rewrites every part.
// Run: node build/verify_store_unreadable.mjs      (Node 22.5+ for node:sqlite; touches nothing live)

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleSync } from '../functions/_lib/d1_store.js';

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
}
class D1 {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  prepare(sql) { return new Stmt(this.db, sql); }
  async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.all()); return out; }
  exec(sql) { this.db.exec(sql); }
}

const d1 = new D1();
d1.exec(readFileSync(new URL('../migrations/0001_schema.sql', import.meta.url), 'utf8'));
const env = { DB: d1 };
const OWNER = { sub: 'u1', email: 'owner@example.test', role: 'Full Access (Owner)', companies: 'All' };

let pass = 0; let fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}`, extra ?? ''); } };

const getMfg = async () => {
  const body = { op: 'get_mfg', doc: 'mfg_web_store' };
  const req = new Request('https://example.test/app/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const res = await handleSync(req, env, OWNER, body, {});
  return { status: res.status, json: await res.json() };
};
const putParts = (slices, ts) => {
  d1.exec("DELETE FROM edge_kv_store WHERE doc_key LIKE 'mfg_web_store%'");
  slices.forEach((s, i) => {
    const key = i === 0 ? 'mfg_web_store' : `mfg_web_store__part_${String(i).padStart(4, '0')}`;
    d1.db.prepare('INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES (?, ?, ?, ?, 1)').run(key, s, ts, 'test');
  });
};
const cut = (str, n) => { const out = []; for (let i = 0; i < str.length; i += n) out.push(str.slice(i, i + n)); return out; };

const docA = { users: [{ id: 'u1', full_name: 'Owner', role: 'Full Access (Owner)' }], customRecords: { expenses: Array.from({ length: 40 }, (_, i) => ({ id: `ex-a-${i}`, amount: i, note: 'first write' })) } };
const docB = { users: [{ id: 'u1', full_name: 'Owner', role: 'Full Access (Owner)' }, { id: 'u2', full_name: 'Second' }], customRecords: { expenses: Array.from({ length: 41 }, (_, i) => ({ id: `ex-b-${i}`, amount: i * 2, note: 'second, longer write' })) } };

// 1. A healthy multi-part store reads in full and carries no flag.
putParts(cut(JSON.stringify(docA), 300), '2026-11-13T08:27:40.199Z');
let r = await getMfg();
ok('healthy store: full document, no storeUnreadable flag', r.status === 200 && r.json.ok && !('storeUnreadable' in r.json)
  && r.json.docs.mfg_web_store.users.length === 1 && r.json.docs.mfg_web_store.customRecords.expenses.length === 40, r.json);

// 2. Torn: head and early parts from write B, middle parts left over from write A (what D1 held on 2026-11-13).
const a = cut(JSON.stringify(docA), 300); const b = cut(JSON.stringify(docB), 300);
const torn = b.map((s, i) => (i >= 3 && i <= 5 && a[i] ? a[i] : s));
putParts(torn, '2026-11-13T08:36:54.758Z');
let parses = true; try { JSON.parse(torn.join('')); } catch { parses = false; }
ok('fixture really is unparseable when stitched', !parses);
r = await getMfg();
ok('torn store: response flags storeUnreadable: true', r.status === 200 && r.json.ok === true && r.json.storeUnreadable === true, r.json);
const doc = r.json.docs.mfg_web_store;
ok('torn store: document stays {} plus updatedAt (browsers keep syncing, so the next full save heals it)',
  doc && !doc.users && !doc.customRecords && doc.updatedAt === '2026-11-13T08:36:54.758Z', doc);
ok('NEGATIVE: the flag never lands inside the document (it would be saved back by a browser)', !('storeUnreadable' in doc) && !('_storeUnreadable' in doc));

// 3. No store row at all is a new workspace, not an unreadable one.
d1.exec("DELETE FROM edge_kv_store WHERE doc_key LIKE 'mfg_web_store%'");
r = await getMfg();
ok('no stored document: empty store without the flag', r.status === 200 && r.json.ok && !('storeUnreadable' in r.json), r.json);

// 4. A head that parses to something other than an object (array / scalar) is unreadable too.
putParts(['[1,2,3]'], '2026-11-13T09:00:00.000Z');
r = await getMfg();
ok('head that parses to an array is flagged, document served as {}', r.json.storeUnreadable === true && !Array.isArray(r.json.docs.mfg_web_store), r.json);

// 5. Damaged shapes that used to read as a new workspace: parts without a head row, and an empty head.
d1.exec("DELETE FROM edge_kv_store WHERE doc_key LIKE 'mfg_web_store%'");
d1.db.prepare('INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES (?, ?, ?, ?, 1)').run('mfg_web_store__part_0001', '"tail"}', 't', 'test');
r = await getMfg();
ok('parts without a head row are flagged (not a new workspace)', r.json.storeUnreadable === true, r.json);
putParts([''], '2026-11-13T09:00:00.000Z');
r = await getMfg();
ok('empty head payload is flagged', r.json.storeUnreadable === true, r.json);

// 6. Saves onto a torn store.
const patch = async (session, doc, ifMatch) => {
  const body = { op: 'patch', ackOnly: true, patch: { mfg_web_store: doc } };
  if (ifMatch) body.ifMatchUpdatedAt = ifMatch;
  const req = new Request('https://example.test/app/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const res = await handleSync(req, env, session, body, {});
  return { status: res.status, json: await res.json() };
};
const storedText = () => d1.db.prepare("SELECT group_concat(payload_json, '') AS t FROM (SELECT payload_json FROM edge_kv_store WHERE doc_key LIKE 'mfg_web_store%' ORDER BY doc_key)").get().t;
putParts(torn, '2026-11-13T08:36:54.758Z');
const tornText = storedText();
r = await patch(OWNER, { updatedAt: 'x', users: [{ id: 'u1' }] }, '2026-11-13T08:00:00.000Z');
ok('stale If-Match onto a torn store: conflict response carries storeUnreadable', r.json.conflict === true && r.json.storeUnreadable === true, r.json);
const SCOPED = { sub: 'u9', email: 'sup@example.test', role: 'Supervisor', companies: 'WTC' };
r = await patch(SCOPED, { users: [{ id: 'u9' }], customRecords: { expenses: [{ id: 'ex-wtc-1', company: 'WTC', amount: 5 }] } }, '2026-11-13T08:36:54.758Z');
ok('NEGATIVE: a company-scoped save onto a torn store is refused with 503 + storeUnreadable', r.status === 503 && r.json.ok === false && r.json.storeUnreadable === true, r);
ok('NEGATIVE: and the stored parts are left exactly as they were', storedText() === tornText);
d1.exec("DELETE FROM edge_kv_store WHERE doc_key LIKE 'mfg_web_store%'");
d1.db.prepare('INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES (?, ?, ?, ?, 1)').run('mfg_web_store__part_0001', '"tail"}', 't', 'test');
r = await patch(SCOPED, { users: [{ id: 'u9' }] }, '');
ok('NEGATIVE: a company-scoped save onto parts without a head is refused too', r.status === 503 && r.json.storeUnreadable === true, r);
putParts(torn, '2026-11-13T08:36:54.758Z');
const fullDoc = { users: docB.users, customRecords: docB.customRecords, updatedAt: '2026-11-13T08:56:17.253Z' };
r = await patch(OWNER, fullDoc, '2026-11-13T08:36:54.758Z');
ok('an Owner save onto a torn store goes through', r.status === 200 && r.json.ok === true && !r.json.conflict, r.json);
let healed = null; try { healed = JSON.parse(storedText()); } catch { healed = null; }
ok('and heals it: the stitched parts parse and hold the Owner document', healed && healed.customRecords && healed.customRecords.expenses.length === 41);
r = await getMfg();
ok('after healing, get_mfg reads in full with no flag', !('storeUnreadable' in r.json) && r.json.docs.mfg_web_store.customRecords.expenses.length === 41, r.json);

console.log(`verify_store_unreadable: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
