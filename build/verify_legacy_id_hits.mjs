// Offline check of the legacy seed id counter (functions/_lib/legacy_ids.js) and its two hooks:
// /api/sync (op patch) and /api/industry_domain_store (POST). In-memory SQLite stands in for D1 and a
// small object stands in for the private R2 seed vault. Touches nothing live.
// Run: node build/verify_legacy_id_hits.mjs      (Node 22.5+ for node:sqlite)

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  capMinShellVerForRead, compareShellVer, handleIndustryDomainStore, handleSync, holdMinShellVer,
  stripServerOwnedCustomRows
} from '../functions/_lib/d1_store.js';
import { DEPLOYED_SHELL_VER } from '../functions/_lib/deployed_shell.js';
import {
  _resetLegacyIdHitsForTests, collectLegacyCandidates, isLegacyShapedId, isMfgLegacyPosId, recordLegacyIdHits,
  takeMfgLegacySignals
} from '../functions/_lib/legacy_ids.js';

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
  async all() {
    if (/^\s*(INSERT|UPDATE|DELETE|CREATE)/i.test(this.sql)) { await this.run(); return { results: [] }; }
    return { results: this.db.prepare(this.sql).all(...this.args()) };
  }
  async run() { const r = this.db.prepare(this.sql).run(...this.args()); return { success: true, meta: { changes: r.changes } }; }
}
class D1 {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  prepare(sql) { return new Stmt(this.db, sql); }
  async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.all()); return out; }
  exec(sql) { this.db.exec(sql); }
  rows(sql, ...p) { return this.db.prepare(sql).all(...p); }
}

const SEED = {
  _s: ['HSP-REV-4f5afc807f', 'STK-KO-b780fef882', 'MEM-2026-43a0aca968'],
  tables: {},
  legacy_id_map: { 'HSP-REV-0012': 0, 'STK-KO-041': 1, 'MEM-2026-001': 2 }
};
function bucketWith(seed, { failGet = false } = {}) {
  let gets = 0;
  return {
    get gets() { return gets; },
    async get(key) {
      gets++;
      if (failGet) throw new Error('R2 unavailable');
      if (key !== 'seeds/seed_industries.json' || !seed) return null;
      const txt = JSON.stringify(seed);
      return { async text() { return txt; } };
    }
  };
}

function freshEnv(opts = {}) {
  _resetLegacyIdHitsForTests();
  const d1 = new D1();
  d1.exec(readFileSync(new URL('../migrations/0001_schema.sql', import.meta.url), 'utf8'));
  const env = { DB: d1 };
  if (opts.bucket !== null) env.BUCKET = opts.bucket || bucketWith(SEED);
  return { env, d1 };
}
function hits(d1) {
  const out = {};
  for (const r of d1.rows("SELECT kind, SUM(hits) AS n FROM legacy_id_hits WHERE day <> 'since' GROUP BY kind")) out[r.kind] = r.n;
  return out;
}
function ctxCollector() {
  const tasks = [];
  return { ctx: { waitUntil(p) { tasks.push(p); } }, settle: () => Promise.all(tasks) };
}

let pass = 0, fail = 0;
function ok(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`); }
}

const OWNER = { sub: 'u1', role: 'Owner', companies: 'ALL', email: 'owner@example.test' };
const domainReq = body => new Request('https://example.test/app/api/industry_domain_store', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
});
const syncReq = body => new Request('https://example.test/app/api/sync', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
});

console.log('Legacy seed id counter');

// 1. Shape filter
ok('old positional ids look old', ['HSP-REV-0012', 'STK-KO-041', 'NRG-0007', 'hsp-ext-blanca-0001', 'MEM-2026-001'].every(isLegacyShapedId));
ok('NEGATIVE: content-derived ids, curated memberships and till rows never look old',
  !['HSP-REV-4f5afc807f', 'STK-KO-b780fef882', 'MEM-2026-901', 'POS-LAUNA-20261111-0A1B2C', 'HSP-REV-POS-LAUNA-20261111-0A1B2C', '', 'x'.repeat(80) + '-1']
    .some(isLegacyShapedId));
const cands = collectLegacyCandidates({
  industryRowEdits: { 'IND::hsp_revenue::HSP-REV-0012': {}, 'WF::trd_stock::STK-KO-b780fef882': {} },
  industryCustomRows: { hsp_members: [{ id: 'MEM-2026-001' }, { id: 'MEM-2026-43a0aca968', autoClosePriorId: 'STK-KO-041' }] },
  purgedEditKeys: ['IND::hsp_revenue::HSP-REV-0012'],
  purgedRows: [{ bucket: 'trd_stock', row_id: 'STK-KO-041' }]
});
ok('candidates come from edit keys, custom row ids, prior ids and the purge lists',
  cands.submit.size === 3 && cands.upgrade.size === 2 && cands.submit.has('HSP-REV-0012') && cands.upgrade.has('STK-KO-041'),
  { submit: [...cands.submit], upgrade: [...cands.upgrade] });

// 2. /industry_domain_store from a browser still on old ids
{
  const { env, d1 } = freshEnv();
  const { ctx, settle } = ctxCollector();
  const body = {
    industryRowEdits: { 'IND::hsp_revenue::HSP-REV-0012': { company: 'Platinum', rev: 1 } },
    industryCustomRows: { trd_stock: [{ id: 'STK-KO-041', company: 'Korri Auto' }] }
  };
  const res = await handleIndustryDomainStore(domainReq(body), env, OWNER, body, ctx);
  await settle();
  const j = await res.json();
  ok('an old-id write still saves as before (counting changes nothing else)', res.status === 200 && j.ok && j.edits === 1 && j.rows === 1, j);
  ok('two old ids from that write are counted as submit', hits(d1).submit === 2, hits(d1));
  const stored = d1.rows('SELECT * FROM legacy_id_hits');
  ok('the table holds counts only: no id, company or email anywhere in it',
    !JSON.stringify(stored).match(/HSP-REV|STK-KO|Platinum|Korri|owner@/), stored);
  ok('the tracking start row is written once', d1.rows("SELECT * FROM legacy_id_hits WHERE day = 'since'").length === 1);
  const day = new Date().toISOString().slice(0, 10);
  ok('hits land on today (UTC)', d1.rows('SELECT day FROM legacy_id_hits WHERE kind = ?', 'submit')[0]?.day === day);
}

// 3. Look-alikes, padding and the upgrade path
{
  const { env, d1 } = freshEnv();
  const { ctx, settle } = ctxCollector();
  const body = {
    industryRowEdits: {
      'IND::hsp_revenue::HSP-REV-99999': { company: 'Platinum' },   // looks old, not in the map
      'IND::hsp_revenue::HSP-REV-12': { company: 'Platinum' }       // unpadded form of HSP-REV-0012
    },
    purgedEditKeys: ['IND::trd_stock::STK-KO-041']
  };
  await handleIndustryDomainStore(domainReq(body), env, OWNER, body, ctx);
  await settle();
  const h = hits(d1);
  ok('NEGATIVE: an id that only looks old is not counted', (h.submit || 0) === 1, h);
  ok('an unpadded old id is matched like the browser matches it', (h.submit || 0) === 1, h);
  ok('a browser purging upgraded old copies counts as upgrade', h.upgrade === 1, h);
}

// 4. Clean traffic counts nothing but still starts the window
{
  const { env, d1 } = freshEnv();
  const bucket = env.BUCKET;
  const { ctx, settle } = ctxCollector();
  const body = { industryRowEdits: { 'IND::hsp_revenue::HSP-REV-4f5afc807f': { company: 'Platinum' } } };
  await handleIndustryDomainStore(domainReq(body), env, OWNER, body, ctx);
  await settle();
  ok('NEGATIVE: a write with only new ids adds no hit', Object.keys(hits(d1)).length === 0, hits(d1));
  ok('and never reads the seed from R2', bucket.gets === 0, bucket.gets);
  ok('but the tracking start row exists', d1.rows("SELECT * FROM legacy_id_hits WHERE day = 'since'").length === 1);
}

// 5. Map unreadable: candidates count as unverified, so the sunset waits
for (const [label, opts] of [['no R2 binding', { bucket: null }], ['R2 read fails', { bucket: bucketWith(SEED, { failGet: true }) }], ['seed missing from R2', { bucket: bucketWith(null) }]]) {
  const { env, d1 } = freshEnv(opts);
  const r = await recordLegacyIdHits(env, collectLegacyCandidates({ industryRowEdits: { 'IND::x::HSP-REV-0012': {} } }));
  ok(`${label}: an old-looking id counts as unverified (never silently dropped)`, r.unverified === 1 && hits(d1).unverified === 1, { r, h: hits(d1) });
}

// 6. Seed without a map (faulty upload, or after the sunset): never reads as clean
for (const [label, mapVal] of [['no legacy_id_map key', undefined], ['an empty legacy_id_map', {}]]) {
  const { env, d1 } = freshEnv({ bucket: bucketWith(Object.assign({}, SEED, { legacy_id_map: mapVal })) });
  const r = await recordLegacyIdHits(env, collectLegacyCandidates({ industryRowEdits: { 'IND::x::HSP-REV-0012': {} } }));
  ok(`NEGATIVE: a seed with ${label} counts candidates as unverified, never as clean`, r.submit === 0 && r.unverified === 1 && hits(d1).unverified === 1, r);
}

// 6a. A map-less seed is remembered: five requests read R2 once, and all still count as unverified
{
  const { env, d1 } = freshEnv({ bucket: bucketWith(Object.assign({}, SEED, { legacy_id_map: undefined })) });
  for (let i = 0; i < 5; i++) await recordLegacyIdHits(env, collectLegacyCandidates({ industryRowEdits: { 'IND::x::HSP-REV-0012': {} } }));
  ok('NEGATIVE: after the sunset the 2 MB seed is not re-read per request (one R2 read for five requests)', env.BUCKET.gets === 1, env.BUCKET.gets);
  ok('and every one of those requests still counts as unverified', hits(d1).unverified === 5, hits(d1));
}

// 6b. Old ids nested inside a row with a new id (the fields the browser also translates)
{
  const { env, d1 } = freshEnv();
  const { ctx, settle } = ctxCollector();
  const body = { industryCustomRows: {
    trd_stock: [
      { id: 'STK-KO-b780fef882', company: 'Korri Auto', autoClosePriorIds: ['STK-KO-041'] },
      { id: 'HSP-REV-4f5afc807f', company: 'Platinum', _auto_closed_by_id: 'HSP-REV-0012' },
      { id: 'MEM-2026-43a0aca968', code: 'MEM-2026-001', company: 'Blanca' }
    ]
  } };
  await handleIndustryDomainStore(domainReq(body), env, OWNER, body, ctx);
  await settle();
  ok('an old id only inside autoClosePriorIds, _auto_closed_by_id or code is still counted', hits(d1).submit === 3, hits(d1));
}

// 6c. More old-looking ids than the cap: the overflow is reported, not dropped
{
  const { env, d1 } = freshEnv();
  const edits = {};
  for (let i = 0; i < 5005; i++) edits[`IND::x::NEW-2026-${String(i).padStart(5, '0')}`] = {};   // look old, are not in the map
  edits['IND::x::HSP-REV-0012'] = {};
  const c = collectLegacyCandidates({ industryRowEdits: edits });
  const r = await recordLegacyIdHits(env, c);
  ok('NEGATIVE: past the candidate cap the request counts as unverified (a real old id may be hidden there)',
    c.overflow === true && r.unverified >= 1 && hits(d1).unverified >= 1, { overflow: c.overflow, r });
}

// 7. The map is read once per isolate, not per request
{
  const { env } = freshEnv();
  for (let i = 0; i < 5; i++) await recordLegacyIdHits(env, collectLegacyCandidates({ industryRowEdits: { 'IND::x::HSP-REV-0012': {} } }));
  ok('five requests with old ids read the seed from R2 once', env.BUCKET.gets === 1, env.BUCKET.gets);
}

// 8. /api/sync patch from an old browser
{
  const { env, d1 } = freshEnv();
  const { ctx, settle } = ctxCollector();
  const body = {
    op: 'patch', doc: 'mfg_web_store',
    patch: { mfg_web_store: {
      updatedAt: '2026-11-11T10:00:00.000Z',
      industryRowEdits: { 'IND::hsp_revenue::HSP-REV-0012': { company: 'Platinum', rev: 1 } },
      industryCustomRows: { trd_stock: [{ id: 'STK-KO-b780fef882', company: 'Korri Auto' }] }
    } }
  };
  const res = await handleSync(syncReq(body), env, OWNER, body, ctx);
  await settle();
  const j = await res.json();
  ok('the sync itself is unchanged (saved, no conflict)', res.status === 200 && j.ok && !j.conflict, j);
  ok('the one old id it carried is counted', hits(d1).submit === 1, hits(d1));
  const body2 = { op: 'patch', doc: 'mfg_web_store', ifMatchUpdatedAt: j.updatedAt, patch: { mfg_web_store: {
    updatedAt: '2026-11-11T10:05:00.000Z',
    industryRowEdits: { 'IND::hsp_revenue::HSP-REV-4f5afc807f': { company: 'Platinum', rev: 2 } }
  } } };
  const { ctx: ctx2, settle: settle2 } = ctxCollector();
  const res2 = await handleSync(syncReq(body2), env, OWNER, body2, ctx2);
  await settle2();
  ok('NEGATIVE: a later sync with only new ids adds nothing', (await res2.json()).ok && hits(d1).submit === 1, hits(d1));
  const conflictBody = { op: 'patch', doc: 'mfg_web_store', ifMatchUpdatedAt: '1999-01-01T00:00:00.000Z', patch: { mfg_web_store: {
    industryRowEdits: { 'IND::hsp_revenue::HSP-REV-0012': { company: 'Platinum', rev: 3 } }
  } } };
  const { ctx: ctx3, settle: settle3 } = ctxCollector();
  const res3 = await (await handleSync(syncReq(conflictBody), env, OWNER, conflictBody, ctx3)).json();
  await settle3();
  ok('NEGATIVE: a patch refused as a conflict is not counted (the browser will resend it)', res3.conflict === true && hits(d1).submit === 1, { res3: res3.conflict, h: hits(d1) });
}

// 9. Without waitUntil the count still lands before the reply
{
  const { env, d1 } = freshEnv();
  const body = { industryRowEdits: { 'IND::hsp_revenue::HSP-REV-0012': { company: 'Platinum' } } };
  await handleIndustryDomainStore(domainReq(body), env, OWNER, body);
  ok('a caller that passes no context still gets the hit recorded', hits(d1).submit === 1, hits(d1));
}

// 10. Manufacturing positional ids (separate kinds and window)
console.log('\nManufacturing positional ids');
ok('positional Manufacturing ids are recognised (st123, ex45-i2, wbmalf-wtc-7, wbrecur-bbc-3, dv-hld-exp-12)',
  ['st123', 'ex45-i2', 'wbmalf-wtc-7', 'wbrecur-bbc-3', 'dv-hld-exp-12', 'exi9'].every(isMfgLegacyPosId));
ok('NEGATIVE: stable and app ids never are (st_<hex>, wbmalf-wtc-<hex>, ex_<hex>-i2, ei-..., ex-...)',
  !['st_ab12cd34ef56', 'wbmalf-wtc-a1b2c3d4e5', 'ex_0a1b2c3d4e5f-i2', 'ei-mwbxkr7q-trdm53', 'ex-mwalh9n6-2ciiy0', 'dv-hld-exp-0a1b2c3d', 'ST123', ''].some(isMfgLegacyPosId));
{
  const doc = { _legacyPosUpgrades: 1e9, customRecords: { expenses: [{ id: 'ex12' }, { id: 'ex_0a1b2c3d4e5f' }] } };
  const s = takeMfgLegacySignals(doc);
  ok('a huge reported count is clamped and the field is removed from the document',
    s.reported && s.upgrade === 100000 && s.submit === 1 && !('_legacyPosUpgrades' in doc), s);
  const s2 = takeMfgLegacySignals({ _legacyPosUpgrades: 'abc' });
  const s3 = takeMfgLegacySignals({ _legacyPosUpgrades: -4 });
  ok('NEGATIVE: a non-number is not a report; a negative counts as 0', !s2.reported && s3.reported && s3.upgrade === 0, { s2, s3 });
}
const mfgPatch = (extra, ts) => ({ op: 'patch', doc: 'mfg_web_store', ...(ts ? { ifMatchUpdatedAt: ts } : {}), patch: { mfg_web_store: Object.assign({
  updatedAt: new Date().toISOString(),
  customRecords: { sentinel_dummy: [{ id: 'st123' }, { id: 'st_ab12cd34ef56' }] }
}, extra) } });
{
  const { env, d1 } = freshEnv();
  const { ctx, settle } = ctxCollector();
  const body = mfgPatch({ _legacyPosUpgrades: 3 });
  const res = await handleSync(syncReq(body), env, OWNER, body, ctx);
  await settle();
  const j = await res.json();
  ok('a reporting sync saves as before', res.status === 200 && j.ok && !j.conflict, j);
  const h = hits(d1);
  ok('the browser report lands as mfg_upgrade and the positional row as mfg_submit', h.mfg_upgrade === 3 && h.mfg_submit === 1, h);
  ok('and NEGATIVE: Manufacturing ids never reach the sibling-industry kinds', !h.submit && !h.upgrade && !h.unverified, h);
  ok('the Manufacturing window starts at that first report', d1.rows("SELECT * FROM legacy_id_hits WHERE day = 'since' AND kind = 'mfg_tracking'").length === 1);
  const stored = d1.rows("SELECT payload_json FROM edge_kv_store WHERE doc_key LIKE 'mfg_web_store%'").map(r => r.payload_json).join('');
  ok('NEGATIVE: _legacyPosUpgrades is never stored in the document', stored.length > 0 && !stored.includes('_legacyPosUpgrades'), stored.slice(0, 120));
  const body2 = mfgPatch({ _legacyPosUpgrades: 0, customRecords: {} }, j.updatedAt);
  const { ctx: c2, settle: s2 } = ctxCollector();
  await handleSync(syncReq(body2), env, OWNER, body2, c2);
  await s2();
  ok('a clean report (0) adds nothing and keeps one window start', hits(d1).mfg_upgrade === 3 && d1.rows("SELECT * FROM legacy_id_hits WHERE day = 'since' AND kind = 'mfg_tracking'").length === 1, hits(d1));
  const conflict = mfgPatch({ _legacyPosUpgrades: 5 }, '1999-01-01T00:00:00.000Z');
  const { ctx: c3, settle: s3 } = ctxCollector();
  const r3 = await (await handleSync(syncReq(conflict), env, OWNER, conflict, c3)).json();
  await s3();
  ok('NEGATIVE: a report in a patch refused as a conflict is not counted (the browser resends it)', r3.conflict === true && hits(d1).mfg_upgrade === 3, hits(d1));
}
{
  // A scoped (non-Owner) seat goes through enforceSyncRlsOnStoreDoc: the report must still be counted and never stored.
  const { env, d1 } = freshEnv();
  const ENTRY = { sub: 'u10', role: 'Entry', companies: 'WTC', email: 'entry@example.test' };
  const { ctx, settle } = ctxCollector();
  const body = mfgPatch({ _legacyPosUpgrades: 3, customRecords: { expenses: [{ id: 'ex12', company: 'WTC', date: '2026-11-10', amount: 5 }] } });
  const res = await handleSync(syncReq(body), env, ENTRY, body, ctx);
  await settle();
  const j = await res.json();
  const stored = d1.rows("SELECT payload_json FROM edge_kv_store WHERE doc_key LIKE 'mfg_web_store%'").map(r => r.payload_json).join('');
  ok('non-Owner seat: the sync saves, the report is counted, and it is never stored',
    res.status === 200 && j.ok && !j.conflict && hits(d1).mfg_upgrade === 3 && stored.length > 0 && !stored.includes('_legacyPosUpgrades'),
    { status: res.status, j, h: hits(d1), storedHasField: stored.includes('_legacyPosUpgrades') });
}
{
  const { env, d1 } = freshEnv();
  const { ctx, settle } = ctxCollector();
  const body = mfgPatch({});
  delete body.patch.mfg_web_store.customRecords;
  await handleSync(syncReq(body), env, OWNER, body, ctx);
  await settle();
  ok('NEGATIVE: a shell that does not report never starts the Manufacturing window',
    d1.rows("SELECT * FROM legacy_id_hits WHERE kind = 'mfg_tracking'").length === 0 && d1.rows("SELECT * FROM legacy_id_hits WHERE kind = 'tracking'").length === 1);
}

// minShellVer is a floor: a push from an older shell never lowers it (so newer devices keep nudging old ones to update).
{
  ok('shell versions compare numerically, not as text',
    compareShellVer('19.6.264', '19.6.99') === 1 && compareShellVer('19.6.26', '19.6.260') === -1 && compareShellVer('19.6', '19.6.0') === 0);
  const a = holdMinShellVer({ minShellVer: '19.6.260' }, { minShellVer: '19.6.264' });
  const b = holdMinShellVer({ minShellVer: '19.6.265' }, { minShellVer: '19.6.264' });
  const c = holdMinShellVer({ minShellVer: 'x<script>' }, { minShellVer: '19.6.264' });
  const d = holdMinShellVer({}, null);
  ok('the floor keeps the higher of stored and incoming; junk never replaces a valid stored value',
    a.minShellVer === '19.6.264' && b.minShellVer === '19.6.265' && c.minShellVer === '19.6.264' && !('minShellVer' in d), { a, b, c, d });

  const { env, d1 } = freshEnv();
  const { ctx, settle } = ctxCollector();
  const first = mfgPatch({ minShellVer: '19.6.265' });
  const r1 = await (await handleSync(syncReq(first), env, OWNER, first, ctx)).json();
  const second = mfgPatch({ minShellVer: '19.6.260', updatedAt: new Date(Date.now() + 5000).toISOString() }, r1.updatedAt);
  const r2 = await (await handleSync(syncReq(second), env, OWNER, second, ctx)).json();
  await settle();
  const stored = JSON.parse(d1.rows("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'mfg_web_store'")[0].payload_json);
  ok('through /api/sync: an older shell\'s push saves but leaves the stored minShellVer at the newer version',
    r1.ok && r2.ok && !r2.conflict && stored.minShellVer === '19.6.265', { r1, r2, stored: stored.minShellVer });
}

// ...capped at the shell this deploy serves, so one bad push (any seat can push) cannot strand the value above it.
{
  const swVer = (readFileSync(new URL('../app/sw.js', import.meta.url), 'utf8').match(/SHELL_CACHE\s*=\s*'isabi-mfg-v([0-9.]+)'/) || [])[1];
  ok('functions/_lib/deployed_shell.js names the shell app/sw.js serves', Boolean(swVer) && DEPLOYED_SHELL_VER === swVer, { DEPLOYED_SHELL_VER, swVer });
  const a = holdMinShellVer({ minShellVer: '9999.0' }, { minShellVer: '19.6.264' }, '19.6.265');
  const b = holdMinShellVer({ minShellVer: '19.6.260' }, { minShellVer: '9999.0' }, '19.6.265');
  const c = holdMinShellVer({}, { minShellVer: '9999.0' }, '19.6.265');
  const d = holdMinShellVer({ minShellVer: '19.6.263' }, { minShellVer: '19.6.264' }, '19.6.265');
  const e = holdMinShellVer({ minShellVer: '9999.0' }, null, '');
  const f = holdMinShellVer({ minShellVer: '9999.0' }, null, 'x<script>');
  ok('the cap: an incoming or stored value above the deployed shell becomes the deployed shell; below it the floor rules',
    a.minShellVer === '19.6.265' && b.minShellVer === '19.6.265' && c.minShellVer === '19.6.265' && d.minShellVer === '19.6.264', { a, b, c, d });
  ok('no (or a junk) ceiling leaves the plain floor (local tests, an older deploy)', e.minShellVer === '9999.0' && f.minShellVer === '9999.0', { e, f });
  const g = capMinShellVerForRead({ minShellVer: '9999.0' }, '19.6.265');
  const h = capMinShellVerForRead({ minShellVer: '19.6.200' }, '19.6.265');
  const i = capMinShellVerForRead({}, '19.6.265');
  ok('reads: a served copy is capped, a lower value and a missing one are left alone',
    g.minShellVer === '19.6.265' && h.minShellVer === '19.6.200' && !('minShellVer' in i), { g, h, i });

  const above = '9999.0';
  const { env, d1 } = freshEnv();
  const { ctx, settle } = ctxCollector();
  const p1 = mfgPatch({ minShellVer: above });
  const r1 = await (await handleSync(syncReq(p1), env, OWNER, p1, ctx)).json();
  await settle();
  const stored1 = JSON.parse(d1.rows("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'mfg_web_store'")[0].payload_json);
  ok('through /api/sync: a push above the deployed shell is stored as the deployed shell',
    r1.ok && !r1.conflict && stored1.minShellVer === DEPLOYED_SHELL_VER, { r1, stored: stored1.minShellVer });

  // A value already stranded above it (written before this fix): reads never serve it, the next push lowers it.
  d1.exec(`UPDATE edge_kv_store SET payload_json = json_set(payload_json, '$.minShellVer', '${above}') WHERE doc_key = 'mfg_web_store'`);
  const g1 = { op: 'get_mfg', doc: 'mfg_web_store' };
  const rg = await (await handleSync(syncReq(g1), env, OWNER, g1, ctx)).json();
  const stillStored = JSON.parse(d1.rows("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'mfg_web_store'")[0].payload_json).minShellVer;
  ok('through /api/sync get_mfg: a stranded value is served capped, and the read writes nothing',
    rg.ok && rg.docs.mfg_web_store.minShellVer === DEPLOYED_SHELL_VER && stillStored === above, { served: rg.docs && rg.docs.mfg_web_store.minShellVer, stillStored });
  const stale = mfgPatch({ minShellVer: '19.6.200', updatedAt: new Date(Date.now() + 9000).toISOString() }, 'not-the-current-ts');
  const rc = await (await handleSync(syncReq(stale), env, OWNER, stale, ctx)).json();
  ok('through /api/sync conflict reply: the fresh copy it hands back is capped too',
    rc.ok && rc.conflict && rc.docs.mfg_web_store.minShellVer === DEPLOYED_SHELL_VER, { rc: rc.conflict, served: rc.docs && rc.docs.mfg_web_store.minShellVer });
  const p2 = mfgPatch({ minShellVer: '19.6.200', updatedAt: new Date(Date.now() + 12000).toISOString() }, rc.updatedAt);
  const r2 = await (await handleSync(syncReq(p2), env, OWNER, p2, ctx)).json();
  await settle();
  const stored2 = JSON.parse(d1.rows("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'mfg_web_store'")[0].payload_json);
  ok('through /api/sync: the next push (from an older shell) brings a stranded value down to the deployed shell',
    r2.ok && !r2.conflict && stored2.minShellVer === DEPLOYED_SHELL_VER, { r2, stored: stored2.minShellVer });
}

// 11. @ISO timed purge strips overrides, restores D1 seed rows from R2, and scopes BU RLS via D1 fallback
console.log('\nTimed @ISO purge & R2/D1 relational seed restoration');
{
  const REC_SEED = {
    _s: ['WTC', 'BBConstruction', 'Sibline', 'Credit'],
    records: {
      raw_purchases: {
        c: ['id', 'company', 'date', 'rep_date', 'site_owner', 'ticket_no', 'total', 'method', 'source'],
        sc: [0, 1, 0, 0, 1, 0, 0, 1, 0],
        hr: 1,
        r: [
          ['rp_d7970d45b511', 0, '2026-11-14', '2026-11-14', 2, '18021', 100, 3, 'workbook'],
          ['rp_d7970d45b512', 0, '2026-11-14', '2026-11-14', 2, '18030', 200, 3, 'workbook'],
          ['rp_bbc000000001', 1, '2026-11-14', '2026-11-14', 2, '19001', 300, 3, 'workbook']
        ]
      }
    }
  };
  const multiBucket = {
    async get(key) {
      const src = key === 'seeds/seed_industries.json' ? SEED : (key === 'seeds/seed_records.json' ? REC_SEED : null);
      if (!src) return null;
      const txt = JSON.stringify(src);
      return { async text() { return txt; }, async json() { return JSON.parse(txt); } };
    }
  };
  const { env, d1 } = freshEnv({ bucket: multiBucket });
  d1.exec(
    "INSERT INTO raw_purchases (id, company, date, rep_date, site_owner, ticket_no, total, method, source, voided) VALUES " +
    "('rp_d7970d45b511', 'WTC', '2026-11-14', '2026-11-14', 'Sibline', '18021', 100, 'Credit', 'workbook', 0)," +
    "('rp_d7970d45b512', 'WTC', '2026-11-14', '2026-11-14', 'Sibline', '18030', 200, 'Credit', 'workbook', 0)," +
    "('rp_bbc000000001', 'BBConstruction', '2026-11-14', '2026-11-14', 'Sibline', '19001', 300, 'Credit', 'workbook', 0)"
  );
  const { ctx: c1, settle: s1 } = ctxCollector();
  const ovrRows = [
    {
      id: 'rp_d7970d45b511', company: 'WTC', date: '2026-11-14', site_owner: 'Sibline',
      ticket_no: '18022', total: 100, voided: false, modified_by: 'u1', modified_at: '2026-11-14T07:34:01Z'
    },
    {
      id: 'rp_d7970d45b512', company: 'WTC', date: '2026-11-14', site_owner: 'Sibline',
      ticket_no: '18030', total: 200, voided: true, voided_at: '2026-11-14T08:00:00Z', modified_by: 'u1'
    },
    {
      id: 'rp-app-deleted-1', company: 'WTC', date: '2026-11-14', site_owner: 'Sibline',
      ticket_no: '99901', total: 50, voided: false, source: 'app'
    }
  ];
  const p1 = {
    op: 'patch', doc: 'mfg_web_store',
    patch: { mfg_web_store: { updatedAt: '2026-11-14T10:00:00.000Z', customRecords: { raw_purchases: ovrRows } } }
  };
  const r1 = await (await handleSync(syncReq(p1), env, OWNER, p1, c1)).json();
  await s1();
  const row11Edited = d1.rows("SELECT ticket_no, voided FROM raw_purchases WHERE id = 'rp_d7970d45b511'")[0];
  const row12Voided = d1.rows("SELECT voided FROM raw_purchases WHERE id = 'rp_d7970d45b512'")[0];
  ok('precondition: seed overrides mirror to D1 raw_purchases (edited ticket_no & voided flag)',
    r1.ok && row11Edited?.ticket_no === '18022' && row12Voided?.voided === 1, { r1, row11Edited, row12Voided });

  // Push @ISO purge tokens while a stale client still sends the overridden & voided seed rows (and drops the app-only row)
  const { ctx: c2, settle: s2 } = ctxCollector();
  const p2 = {
    op: 'patch', doc: 'mfg_web_store', ifMatchUpdatedAt: r1.updatedAt,
    patch: {
      mfg_web_store: {
        updatedAt: '2026-11-14T15:03:37.000Z',
        _purgedOverrideIds: [
          'raw_purchases:rp_d7970d45b511@2026-11-14T15:03:37.000Z',
          'raw_purchases:rp_d7970d45b512@2026-11-14T15:03:37.000Z'
        ],
        customRecords: { raw_purchases: ovrRows.slice(0, 2) }
      }
    }
  };
  const r2 = await (await handleSync(syncReq(p2), env, OWNER, p2, c2)).json();
  await s2();
  const storedAfterPurge = JSON.parse(d1.rows("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'mfg_web_store'")[0].payload_json);
  const row11Restored = d1.rows("SELECT ticket_no, voided, modified_by FROM raw_purchases WHERE id = 'rp_d7970d45b511'")[0];
  const row12Restored = d1.rows("SELECT ticket_no, voided, modified_by FROM raw_purchases WHERE id = 'rp_d7970d45b512'")[0];
  const appRowVoided = d1.rows("SELECT voided FROM raw_purchases WHERE id = 'rp-app-deleted-1'")[0];
  ok('timed @ISO purge strips both stale overrides from KV and restores both D1 seed rows from R2 while voiding app-only row',
    r2.ok && (storedAfterPurge.customRecords?.raw_purchases || []).length === 0 &&
      row11Restored?.ticket_no === '18021' && row11Restored?.voided === 0 && row11Restored?.modified_by === '' &&
      row12Restored?.ticket_no === '18030' && row12Restored?.voided === 0 && appRowVoided?.voided === 1,
    { kvLen: (storedAfterPurge.customRecords?.raw_purchases || []).length, row11Restored, row12Restored, appRowVoided });

  // Single-BU WTC Supervisor submits newer @ISO purge tokens for a WTC row and a BBConstruction row (absent from prevDoc.customRecords)
  const SUP_WTC = { sub: 'u-sup-wtc', role: 'Supervisor', companies: 'WTC', email: 'supwtc@example.test' };
  const { ctx: c3, settle: s3 } = ctxCollector();
  const p3 = {
    op: 'patch', doc: 'mfg_web_store', ifMatchUpdatedAt: r2.updatedAt,
    patch: {
      mfg_web_store: {
        updatedAt: '2026-11-14T16:00:00.000Z',
        _purgedOverrideIds: [
          'raw_purchases:rp_d7970d45b511@2026-11-14T16:00:00.000Z',
          'raw_purchases:rp_bbc000000001@2026-11-14T16:00:00.000Z'
        ],
        customRecords: { raw_purchases: [] }
      }
    }
  };
  const r3 = await (await handleSync(syncReq(p3), env, SUP_WTC, p3, c3)).json();
  await s3();
  const storedRls = JSON.parse(d1.rows("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'mfg_web_store'")[0].payload_json);
  const purgedArrRls = storedRls._purgedOverrideIds || [];
  ok('single-BU Supervisor retains in-BU @ISO token (via D1 fallback lookup, collapsing older @T1) and drops cross-BU token',
    r3.ok && purgedArrRls.includes('raw_purchases:rp_d7970d45b511@2026-11-14T16:00:00.000Z') &&
      !purgedArrRls.includes('raw_purchases:rp_d7970d45b511@2026-11-14T15:03:37.000Z') &&
      !purgedArrRls.includes('raw_purchases:rp_bbc000000001@2026-11-14T16:00:00.000Z'),
    { purgedArrRls });

  // Refreshing slot 0 across >2,000 _purgedOverrideIds promotes it to the tail before .slice(-2000)
  const filler2005 = Array.from({ length: 2005 }, (_, i) => {
    const hex = (0x1000000000 + i).toString(16).padStart(10, '0');
    return `raw_purchases:rp_${hex}@2026-11-14T01:00:00.000Z`;
  });
  const doc2005 = {
    _purgedOverrideIds: [
      ...filler2005,
      'raw_purchases:rp_1000000000@2026-11-14T02:00:00.000Z'
    ]
  };
  stripServerOwnedCustomRows(doc2005, null);
  ok('refreshed @ISO token promotes to tail across 2000-entry _purgedOverrideIds cap',
    doc2005._purgedOverrideIds.length === 2000 &&
      doc2005._purgedOverrideIds[doc2005._purgedOverrideIds.length - 1] === 'raw_purchases:rp_1000000000@2026-11-14T02:00:00.000Z' &&
      !doc2005._purgedOverrideIds.includes('raw_purchases:rp_1000000000@2026-11-14T01:00:00.000Z'),
    { len: doc2005._purgedOverrideIds.length, tail: doc2005._purgedOverrideIds.at(-1) });

  // Stale client echoing unchanged older @ISO fillers alongside 2 new entries must NOT evict newer prevDoc tail entry
  const docEcho = {
    _purgedOverrideIds: [
      ...filler2005.slice(6),
      'raw_purchases:rp_2000000001@2026-11-14T03:00:00.000Z',
      'raw_purchases:rp_2000000002@2026-11-14T03:00:00.000Z'
    ]
  };
  stripServerOwnedCustomRows(docEcho, doc2005);
  ok('unchanged echoed @ISO tokens keep existing slot and never evict newer prevDoc tail entries',
    docEcho._purgedOverrideIds.length === 2000 &&
      docEcho._purgedOverrideIds.includes('raw_purchases:rp_1000000000@2026-11-14T02:00:00.000Z') &&
      docEcho._purgedOverrideIds.at(-1) === 'raw_purchases:rp_2000000002@2026-11-14T03:00:00.000Z',
    { len: docEcho._purgedOverrideIds.length, hasTarget: docEcho._purgedOverrideIds.includes('raw_purchases:rp_1000000000@2026-11-14T02:00:00.000Z'), tail: docEcho._purgedOverrideIds.at(-1) });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
