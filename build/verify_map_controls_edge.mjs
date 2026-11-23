// Offline Edge D1 verification gate for 4-tier map-write controls, >=12-company RLS,
// GET /app/api/records deferred LIMIT & company hydration, /api/sync 6-vertical preserve,
// strict /api/industry_domain_store 403 across all 6 verticals, and 400 validation bounds.
// Runs in-process against functions/app/api/[[route]].js with node:sqlite (no workerd.exe).
// Run: node build/verify_map_controls_edge.mjs

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequest } from '../functions/app/api/[[route]].js';
import { MIN_SYNC_SHELL_VER } from '../functions/_lib/d1_store.js';
import { signEdgeSession } from '../functions/_lib/security.js';

class Stmt {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...p) {
    if (p.length > 100) throw new Error(`D1 allows 100 bound values per statement, got ${p.length}`);
    return new Stmt(this.db, this.sql, p);
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
  async first() { return this.db.prepare(this.sql).get(...this.args()) || null; }
  async all() {
    if (/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)/i.test(this.sql)) {
      await this.run();
      return { results: [] };
    }
    return { results: this.db.prepare(this.sql).all(...this.args()) };
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.args());
    return { success: true, meta: { changes: r.changes } };
  }
}

class D1 {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  prepare(sql) { return new Stmt(this.db, sql); }
  async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.all()); return out; }
  exec(sql) { this.db.exec(sql); }
  rows(sql, ...p) { return this.db.prepare(sql).all(...p); }
}

function createMockBucket() {
  const objects = new Map();
  return {
    async put(key, val, opts = {}) { objects.set(String(key), { val, opts }); },
    async get(key) {
      const hit = objects.get(String(key));
      if (!hit) return null;
      const str = typeof hit.val === 'string' ? hit.val : Buffer.from(hit.val).toString('utf8');
      return { body: str, async text() { return str; }, async arrayBuffer() { return Buffer.from(str, 'utf8').buffer; } };
    },
    async delete(key) { objects.delete(String(key)); }
  };
}

const SCHEMA_SQL = readFileSync(new URL('../migrations/0001_schema.sql', import.meta.url), 'utf8');
const JWT_SECRET = 'map-ctrl-unit-test-jwt-secret-32c!!'; // secret-scan: allow

let pass = 0;
let fail = 0;
function ok(label, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}${detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`);
  }
}

const CO12_LIST = 'WTC, BBConstruction, Lions Transport, Bdeir Holding, Blanca, Palms, Voile, Platinum, Korri Auto, Shacman, Properties, 4235 Company S.A.L';

const TEST_SEATS = [
  { id: 'u1', email: 'owner@example.test', full_name: 'Owner Seat', role: 'Full Access (Owner)', companies: 'ALL', custom_perms: '{}' },
  { id: 'u-sup', email: 'sup@example.test', full_name: 'Sup All', role: 'Supervisor', companies: 'All', custom_perms: '{}' },
  { id: 'u-view', email: 'viewer@example.test', full_name: 'Viewer All', role: 'Viewer', companies: 'All', custom_perms: '{}' },
  { id: 'u-disp', email: 'disp@example.test', full_name: 'Dispatch Custom', role: 'Custom', companies: 'All', custom_perms: JSON.stringify({ rights: { read_ops: true, enter_dispatch: true, modify_data: true } }) },
  { id: 'u-noent', email: 'noent@example.test', full_name: 'Non-Entering Custom', role: 'Custom', companies: 'WTC', custom_perms: JSON.stringify({ rights: { read_ops: true, modify_data: true } }) },
  { id: 'u-words', email: 'words@example.test', full_name: 'Words Only', role: 'Custom', companies: 'WTC', custom_perms: JSON.stringify({ rights: { read_ops: true, modify_text: true, modify_data: false } }) },
  { id: 'u-entry', email: 'entry@example.test', full_name: 'Entry WTC', role: 'Entry', companies: 'WTC', custom_perms: '{}' },
  { id: 'u-sales', email: 'sales@example.test', full_name: 'Sales WTC', role: 'Sales', companies: 'WTC', custom_perms: '{}' },
  { id: 'u-wtc-se', email: 'wtcse@example.test', full_name: 'WTC SupEntry', role: 'Supervisor + Entry', companies: 'WTC', custom_perms: '{}' },
  { id: 'u-bbc-se', email: 'bbcse@example.test', full_name: 'BBC SupEntry', role: 'Supervisor + Entry', companies: 'BBConstruction', custom_perms: '{}' },
  { id: 'u-blanca-se', email: 'blancase@example.test', full_name: 'Blanca SupEntry', role: 'Supervisor + Entry', companies: 'Blanca', custom_perms: '{}' },
  { id: 'u-hld-se', email: 'hldse@example.test', full_name: 'Holding SupEntry', role: 'Supervisor + Entry', companies: 'Bdeir Holding', custom_perms: '{}' },
  { id: 'u-ins-se', email: 'insse@example.test', full_name: 'Ins SupEntry', role: 'Supervisor + Entry', companies: 'Insurance Company', custom_perms: '{}' },
  { id: 'u-co12', email: 'co12@example.test', full_name: 'Co12 Seat', role: 'Supervisor + Entry', companies: CO12_LIST, custom_perms: '{}' }
];

async function createCtx() {
  const d1 = new D1();
  d1.exec(SCHEMA_SQL);
  const env = { DB: d1, BUCKET: createMockBucket(), ISABI_JWT_SECRET: JWT_SECRET };
  const tok = {};
  for (let i = 0; i < TEST_SEATS.length; i++) {
    const s = TEST_SEATS[i];
    const sid = `sess_${s.id}`;
    d1.db.prepare(
      "INSERT INTO users (id, full_name, email, role, companies, pbi_access, statements_access, custom_perms, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(s.id, s.full_name, s.email, s.role, s.companies, 'full', 'full', s.custom_perms, 'Active');
    d1.db.prepare(
      "INSERT INTO auth_sessions (id, user_id, email, full_name, role, companies, logged_in_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(sid, s.id, s.email, s.full_name, s.role, s.companies, '2026-11-16T00:00:00Z');
    tok[s.id] = await signEdgeSession({
      sid, sub: s.id, email: s.email, role: s.role, companies: s.companies
    }, env);
  }

  async function callEdge(method, pathAndQuery, body = null, sessionId = 'u1', extraHeaders = {}) {
    const fullUrl = `https://isabisystems.com${pathAndQuery}`;
    const u = new URL(fullUrl);
    const routeParts = u.pathname.replace(/^\/app\/api\/?/, '').split('/').filter(Boolean);
    const hdrs = new Headers(Object.assign({ Origin: 'https://isabisystems.com', 'X-ISABI-Shell': MIN_SYNC_SHELL_VER }, extraHeaders));
    if (sessionId && tok[sessionId]) hdrs.set('X-ISABI-Session', tok[sessionId]);
    let reqBody;
    if (body !== null) {
      reqBody = typeof body === 'string' ? body : JSON.stringify(body);
      if (!hdrs.has('Content-Type')) hdrs.set('Content-Type', 'application/json');
    }
    const waits = [];
    const res = await onRequest({
      request: new Request(fullUrl, { method, headers: hdrs, body: reqBody }),
      env,
      params: { route: routeParts },
      waitUntil(p) { waits.push(Promise.resolve(p)); }
    });
    await Promise.all(waits);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { status: res.status, headers: res.headers, text, json };
  }

  return { d1, env, tok, callEdge };
}

try {
  const ctx = await createCtx();
  const c = ctx.callEdge;
  const t0 = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  // Seed baseline sites, regions & geo_config (including a region-only geo_config.sites entry)
  await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_wtc_pin', name: '__MC_WTC_PIN__', company: 'WTC', region: 'Beirut', site_category: 'customer', latitude: 33.8911, longitude: 35.5011, entered_by: 'owner@example.test', entered_at: t0, voided: 0 } }, 'u1');
  await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_bbc_pin', name: '__MC_BBC_PIN__', company: 'BBConstruction', region: 'Beirut', site_category: 'customer', latitude: 33.8922, longitude: 35.5022, entered_by: 'owner@example.test', entered_at: t0, voided: 0 } }, 'u1');
  await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_wtc_unpin', name: '__MC_WTC_UNPIN__', company: 'WTC', region: 'Beirut', notes: 'Orig Unpin', site_category: 'customer', entered_by: 'owner@example.test', entered_at: t0, voided: 0 } }, 'u1');
  await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_wtc_unpin_alias', name: '__MC_WTC_UNPIN_ALIAS__', company: 'WTC', region: 'Beirut', site_category: 'customer', entered_by: 'owner@example.test', entered_at: t0, voided: 0 } }, 'u1');
  await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_wtc_unpin_noreg', name: '__MC_WTC_NOREG__', company: 'WTC', region: '', site_category: 'customer', entered_by: 'owner@example.test', entered_at: t0, voided: 0 } }, 'u1');
  await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_wtc_cleared', name: '__MC_WTC_CLEARED__', company: 'WTC', region: 'Beirut', site_category: 'customer', _pinCleared: true, entered_by: 'owner@example.test', entered_at: t0, voided: 0 } }, 'u1');
  await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_wtc_regonly', name: '__MC_WTC_REGONLY__', company: 'WTC', region: 'Choueifat', site_category: 'customer', entered_by: 'owner@example.test', entered_at: t0, voided: 0 } }, 'u1');
  await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_wtc_regonly2', name: '__MC_WTC_REGONLY2__', company: 'WTC', region: 'Choueifat', site_category: 'customer', entered_by: 'owner@example.test', entered_at: t0, voided: 0 } }, 'u1');
  await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_wtc_dbreg', name: '__MC_WTC_DBREG__', company: 'WTC', region: 'Choueifat', site_category: 'customer', entered_by: 'owner@example.test', entered_at: t0, voided: 0 } }, 'u1');
  await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_wtc_void', name: '__MC_WTC_VOID__', company: 'WTC', region: 'Beirut', latitude: 33.8933, longitude: 35.5033, voided: 0 } }, 'u1');
  await c('POST', '/app/api/records', { table: 'regions', record: { id: 'r_shaped', name: '__MC_SHAPED_REG__', corridor: 'Mount Lebanon', zone_type: 'circle', center_lat: 33.855, center_lng: 35.515, radius_km: 2.5, distance_km: 8.5, entered_by: 'owner@example.test', entered_at: t0, voided: 0 } }, 'u1');
  await c('POST', '/app/api/records', { table: 'regions', record: { id: 'r_void', name: '__MC_VOID_REG__', corridor: 'Mount Lebanon', zone_type: 'circle', center_lat: 33.856, center_lng: 35.516, radius_km: 1.8, distance_km: 12.4, voided: 0 } }, 'u1');
  await c('POST', '/app/api/records', { table: 'regions', record: { id: 'r_hsp_only', name: '__MC_HSP_REG__', _industry: 'Hospitality & Resorts', company: 'Blanca', zone_type: 'circle', center_lat: 33.761, center_lng: 35.441, radius_km: 1.2, voided: 0 } }, 'u1');

  await c('POST', '/app/api/geo_config', {
    sites: {
      'customer:__mc_wtc_pin__': { name: '__MC_WTC_PIN__', company: 'WTC', region: 'Beirut', latitude: 33.8911, longitude: 35.5011, updated_at: t0 },
      'customer:__mc_bbc_pin__': { name: '__MC_BBC_PIN__', company: 'BBConstruction', region: 'Beirut', latitude: 33.8922, longitude: 35.5022, updated_at: t0 },
      'customer:__mc_wtc_regonly__': { name: '__MC_WTC_REGONLY__', company: 'WTC', region: 'Choueifat', updated_at: t0 },
      'customer:__mc_wtc_regonly2__': { name: '__MC_WTC_REGONLY2__', company: 'WTC', region: 'Choueifat', updated_at: t0 },
      '__mc_geoonly_pin__': { name: '__MC_GEOONLY_PIN__', company: 'WTC', region: 'Beirut', latitude: 33.8919, longitude: 35.5019, updated_at: t0 },
      '__mc_geoonly_clr__': { name: '__MC_GEOONLY_CLR__', company: 'WTC', region: 'Beirut', _pinCleared: true, updated_at: t0 }
    },
    regions: {
      '__mc_shaped_reg__': { name: '__MC_SHAPED_REG__', zone_type: 'circle', center_lat: 33.855, center_lng: 35.515, radius_km: 2.5, updated_at: t0 },
      '__mc_geoonly_reg__': { name: '__MC_GEOONLY_REG__', zone_type: 'circle', center_lat: 33.854, center_lng: 35.514, radius_km: 1.9, updated_at: t0 }
    }
  }, 'u1');

  // 1. Read-only & non-geo seats (Supervisor, Viewer, Dispatch Custom, Words-Only) -> 403
  let nonGeoOk = true;
  const nonGeoFails = [];
  for (const sid of ['u-sup', 'u-view', 'u-disp', 'u-words']) {
    const r1 = await c('POST', '/app/api/geo_config', { companyHubs: { wtc: { lat: 33.891, lng: 35.501, updated_at: nowIso } } }, sid);
    const r2 = await c('POST', '/app/api/geo_config', { sites: { 'customer:__mc_wtc_unpin__': { name: '__MC_WTC_UNPIN__', company: 'WTC', latitude: 33.881, longitude: 35.491, updated_at: nowIso } } }, sid);
    const r3 = await c('POST', '/app/api/geo_config', { regions: { '__mc_shaped_reg__': { name: '__MC_SHAPED_REG__', zone_type: 'circle', center_lat: 33.859, center_lng: 35.519, radius_km: 3.1, updated_at: nowIso } } }, sid);
    const r4 = await c('POST', '/app/api/geo_config', { pairKmOverrides: { 'bu:WTC||site:__MC_WTC_PIN__': 9.5 } }, sid);
    const r5 = await c('POST', '/app/api/geo_config', { _deletedKeys: { 'sites:customer:__mc_wtc_pin__': nowIso } }, sid);
    const r6 = await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_wtc_pin', name: '__MC_WTC_PIN__', company: 'WTC', latitude: 33.8999, longitude: 35.5099 } }, sid);
    const r7 = await c('POST', '/app/api/records', { table: 'regions', record: { id: 'r_shaped', name: '__MC_SHAPED_REG__', zone_type: 'circle', center_lat: 33.861, center_lng: 35.521, radius_km: 4.0 } }, sid);
    const r8 = await c('POST', '/app/api/industry_domain_store', { industryRowEdits: { 'Hospitality::Venues::VMC': { ind: 'Hospitality & Resorts', company: 'Blanca', primaryId: 'VMC', latitude: 33.765, longitude: 35.445, rev: 1, updated_at: nowIso } } }, sid);
    const sts = [r1.status, r2.status, r3.status, r4.status, r5.status, r6.status, r7.status, r8.status];
    if (!sts.every(x => x === 403)) { nonGeoOk = false; nonGeoFails.push({ sid, sts }); }
  }
  const rWordsCreate403 = await c('POST', '/app/api/industry_domain_store', {
    industryCustomRows: { mfg_custom: [{ id: 'ic_mc_words_create', company: 'WTC', name: 'Denied', updated_at: nowIso }] }
  }, 'u-words');
  ok('1a. Read-only & non-geo seats blocked (403) across geo_config/records/domain; Words-Only new domain create=403',
    nonGeoOk && rWordsCreate403.status === 403, { nonGeoFails, rWordsCreate403: rWordsCreate403.status });

  // 1b. Supervisor sparse pure-void preserves GPS/zones (incl. distance_km); Dispatch/Non-Entering Custom blocked from distance_km & unpermitted tables; Words-Only text edit + /sync strip
  const rSupVoidSite = await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_wtc_void', company: 'WTC', voided: 1, void_reason: 'mc void' } }, 'u-sup');
  const rSupVoidRegTamper403 = await c('POST', '/app/api/records', { table: 'regions', record: { id: 'r_void', voided: 1, distance_km: 999, void_reason: 'mc void tamper' } }, 'u-sup');
  const rSupVoidReg = await c('POST', '/app/api/records', { table: 'regions', record: { id: 'r_void', voided: 1, void_reason: 'mc void' } }, 'u-sup');
  const rSupRestoreRegTamper403 = await c('POST', '/app/api/records', { table: 'regions', record: { id: 'r_void', voided: 0, distance_km: 888, restored_at: nowIso } }, 'u-sup');
  const rSupRestoreSite200 = await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_wtc_void', voided: 0, restored_at: nowIso } }, 'u-sup');
  const restoredS = (((await c('GET', '/app/api/records?table=sites&limit=5000', null, 'u1')).json?.rows) || []).find(r => r && r.id === 's_wtc_void');
  await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_wtc_void', voided: 1, void_reason: 're-void' } }, 'u-sup');
  const rDispDist403 = await c('POST', '/app/api/records', { table: 'regions', record: { id: 'r_shaped', name: '__MC_SHAPED_REG__', distance_km: 777 } }, 'u-disp');
  const rDispSal403 = await c('POST', '/app/api/records', { table: 'salaries', record: { id: 'sal_mc_disp_deny', company: 'WTC', staff: 'Disp Denied', amount: 100 } }, 'u-disp');
  const rNoentExp403 = await c('POST', '/app/api/records', { table: 'expenses', record: { id: 'exp_mc_noent_deny', company: 'WTC', amount: 50 } }, 'u-noent');
  const rNoentSal403 = await c('POST', '/app/api/records', { table: 'salaries', record: { id: 'sal_mc_noent_deny', company: 'WTC', staff: 'NoEnt Denied', amount: 100 } }, 'u-noent');
  const rSitesAll = await c('GET', '/app/api/records?table=sites&limit=5000', null, 'u1');
  const voidedS = (rSitesAll.json?.rows || []).find(r => r && r.id === 's_wtc_void');
  const rRegsAll = await c('GET', '/app/api/records?table=regions&limit=5000', null, 'u1');
  const voidedR = (rRegsAll.json?.rows || []).find(r => r && r.id === 'r_void');
  const rWordsSiteTxt = await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_wtc_pin', name: '__MC_WTC_PIN__', company: 'WTC', region: 'Beirut', notes: 'Words note OK', latitude: 33.8911, longitude: 35.5011, voided: 0 } }, 'u-words');
  const sync0 = (await c('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, 'u1')).json?.docs?.mfg_web_store || {};
  await c('POST', '/app/api/sync', {
    op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
    patch: { mfg_web_store: { minShellVer: MIN_SYNC_SHELL_VER, updatedAt: new Date(Date.now() + 1000).toISOString(), customRecords: { regions: [{ id: 'r_shaped', name: '__MC_SHAPED_REG__', corridor: 'Mount Lebanon', zone_type: 'circle', center_lat: 33.855, center_lng: 35.515, radius_km: 2.5, distance_km: 8.5, voided: false, rev: 1 }] } } }
  }, 'u1');
  await c('POST', '/app/api/sync', {
    op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
    patch: { mfg_web_store: { minShellVer: MIN_SYNC_SHELL_VER, updatedAt: new Date(Date.now() + 1500).toISOString(), customRecords: { regions: [{ id: 'r_shaped', name: '__MC_SHAPED_REG__', corridor: 'Mount Lebanon', zone_type: 'circle', center_lat: 33.855, center_lng: 35.515, radius_km: 2.5, distance_km: 777, voided: false, rev: 2 }] } } }
  }, 'u-disp');
  await c('POST', '/app/api/sync', {
    op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
    patch: { mfg_web_store: { minShellVer: MIN_SYNC_SHELL_VER, updatedAt: new Date(Date.now() + 2000).toISOString(), customRecords: { regions: [{ id: 'r_shaped', name: '__MC_SHAPED_REG__', corridor: 'Mount Lebanon', notes: 'Words Sync Note', zone_type: 'circle', center_lat: 34.111, center_lng: 35.777, radius_km: 9.9, distance_km: 999, voided: false, rev: 3 }] }, industryCustomRows: { mfg_custom: [{ id: 'ic_mc_words_sync_deny', company: 'WTC', name: 'Denied Sync' }] } } }
  }, 'u-words');
  await c('POST', '/app/api/sync', {
    op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
    patch: { mfg_web_store: { minShellVer: MIN_SYNC_SHELL_VER, updatedAt: new Date(Date.now() + 2500).toISOString(), customRecords: { expenses: [{ id: 'exp_mc_noent_sync', company: 'WTC', amount: 44 }], salaries: [{ id: 'sal_mc_noent_sync', company: 'WTC', staff: 'Denied', amount: 99 }] } } }
  }, 'u-noent');
  const syncWordsVerify = (await c('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, 'u1')).json?.docs?.mfg_web_store || {};
  const wordsSyncReg = (syncWordsVerify.customRecords?.regions || []).find(r => r && r.id === 'r_shaped');
  const wordsSyncCustDenied = !(syncWordsVerify.industryCustomRows?.mfg_custom || []).some(r => r && r.id === 'ic_mc_words_sync_deny');
  const noentSyncDropped = !(syncWordsVerify.customRecords?.expenses || []).some(r => r && r.id === 'exp_mc_noent_sync') && !(syncWordsVerify.customRecords?.salaries || []).some(r => r && r.id === 'sal_mc_noent_sync');
  ok('1b. Supervisor sparse pure-void preserves GPS/zones/distance_km (tamper=403); Dispatch/Non-Entering Custom blocked & Words-Only/Non-Entering /sync strips tampered zone/rows',
    rSupVoidSite.status === 200 && rSupVoidRegTamper403.status === 403 && rSupVoidReg.status === 200 &&
    rSupRestoreRegTamper403.status === 403 && rSupRestoreSite200.status === 200 &&
    Boolean(restoredS && !restoredS.voided && Math.abs(Number(restoredS.latitude) - 33.8933) < 1e-4) &&
    rDispDist403.status === 403 && rDispSal403.status === 403 &&
    rNoentExp403.status === 403 && rNoentSal403.status === 403 &&
    Boolean(voidedS && voidedS.voided && Math.abs(Number(voidedS.latitude) - 33.8933) < 1e-4) &&
    Boolean(voidedR && voidedR.voided && Math.abs(Number(voidedR.radius_km) - 1.8) < 1e-3 && Math.abs(Number(voidedR.distance_km) - 12.4) < 1e-3) &&
    rWordsSiteTxt.status === 200 &&
    Boolean(wordsSyncReg && wordsSyncReg.notes === 'Words Sync Note' && Math.abs(Number(wordsSyncReg.center_lat) - 33.855) < 1e-4 && Math.abs(Number(wordsSyncReg.radius_km) - 2.5) < 1e-3 && Math.abs(Number(wordsSyncReg.distance_km) - 8.5) < 1e-3) &&
    wordsSyncCustDenied && noentSyncDropped,
    { voidedS, voidedR, supTamper403: rSupVoidRegTamper403.status, disp: [rDispDist403.status, rDispSal403.status], noent: [rNoentExp403.status, rNoentSal403.status], wordsSite: rWordsSiteTxt.status, wordsSyncReg, wordsSyncCustDenied, noentSyncDropped });

  // 2. Entry & Sales: region-only & lat/lng alias initial pin, Entry text+pin, Sales +New Site/+New Region in WTC=200 & cross-BU/industry=403
  const rEntNewSite = await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_ent_new', name: '__MC_ENT_NEW__', company: 'WTC', region: 'Beirut', latitude: 33.8711, longitude: 35.4911, voided: 0 } }, 'u-entry');
  const rEntCombined = await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_wtc_unpin', name: '__MC_WTC_UNPIN__', company: 'WTC', region: 'Beirut', notes: 'Entry text+pin ok', latitude: 33.8722, longitude: 35.4922, voided: 0 } }, 'u-entry');
  const rEntAliasFill = await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_wtc_unpin_alias', name: '__MC_WTC_UNPIN_ALIAS__', company: 'WTC', region: 'Beirut', lat: 33.8726, lng: 35.4926, voided: 0 } }, 'u-entry');
  const rSitesAliasChk = await c('GET', '/app/api/records?table=sites&limit=5000', null, 'u1');
  const aliasSavedRow = (rSitesAliasChk.json?.rows || []).find(r => r && r.id === 's_wtc_unpin_alias');
  const rEntRegOnlyGeo = await c('POST', '/app/api/geo_config', { sites: { 'customer:__mc_wtc_regonly__': { name: '__MC_WTC_REGONLY__', company: 'WTC', region: 'Choueifat', latitude: 33.8723, longitude: 35.4923, updated_at: nowIso } } }, 'u-entry');
  const rEntHub403 = await c('POST', '/app/api/geo_config', { companyHubs: { wtc: { lat: 33.895, lng: 35.505, updated_at: nowIso } } }, 'u-entry');
  const rEntCleared403 = await c('POST', '/app/api/geo_config', { sites: { 'customer:__mc_wtc_cleared__': { name: '__MC_WTC_CLEARED__', company: 'WTC', latitude: 33.875, longitude: 35.495, updated_at: nowIso } } }, 'u-entry');
  const rEntEditReg403 = await c('POST', '/app/api/geo_config', { regions: { '__mc_shaped_reg__': { name: '__MC_SHAPED_REG__', zone_type: 'circle', center_lat: 33.865, center_lng: 35.525, radius_km: 3.3, updated_at: nowIso } } }, 'u-entry');
  const rEntNewReg = await c('POST', '/app/api/records', { table: 'regions', record: { id: 'r_ent_new', name: '__MC_ENT_NEW_REG__', corridor: 'Beirut', zone_type: 'circle', center_lat: 33.8733, center_lng: 35.4933, radius_km: 1.5, voided: 0 } }, 'u-entry');

  const rSalesTamperNotes403 = await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_wtc_regonly2', name: '__MC_WTC_REGONLY2__', company: 'WTC', region: 'Choueifat', notes: 'Sales tamper', latitude: 33.8741, longitude: 35.4941, voided: 0 } }, 'u-sales');
  const rSalesOverwriteReg403 = await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_wtc_regonly2', name: '__MC_WTC_REGONLY2__', company: 'WTC', region: 'Beirut', latitude: 33.8741, longitude: 35.4941, voided: 0 } }, 'u-sales');
  const rSalesBlankReg200 = await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_wtc_unpin_noreg', name: '__MC_WTC_NOREG__', company: 'WTC', region: 'Choueifat', latitude: 33.8742, longitude: 35.4942, voided: 0 } }, 'u-sales');
  const rSalesRegOnlyGeo = await c('POST', '/app/api/geo_config', { sites: { 'customer:__mc_wtc_regonly2__': { name: '__MC_WTC_REGONLY2__', company: 'WTC', region: 'Choueifat', latitude: 33.8743, longitude: 35.4943, updated_at: nowIso } } }, 'u-sales');
  const rSalesRegOnlyRepin403 = await c('POST', '/app/api/geo_config', { sites: { 'customer:__mc_wtc_regonly2__': { name: '__MC_WTC_REGONLY2__', company: 'WTC', region: 'Choueifat', latitude: 33.8843, longitude: 35.5043, updated_at: new Date(Date.now() + 5000).toISOString() } } }, 'u-sales');
  const rSalesNewSite200 = await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_sales_new', name: '__MC_SALES_NEW__', company: 'WTC', region: 'Beirut', latitude: 33.8744, longitude: 35.4944, voided: 0 } }, 'u-sales');
  const rSalesNewSiteGeo200 = await c('POST', '/app/api/geo_config', { sites: { 'customer:__mc_sales_new__': { name: '__MC_SALES_NEW__', company: 'WTC', latitude: 33.8744, longitude: 35.4944, updated_at: nowIso } } }, 'u-sales');
  const rSalesNewReg200 = await c('POST', '/app/api/records', { table: 'regions', record: { id: 'r_sales_new', name: '__MC_SALES_NEW_REG__', corridor: 'Beirut', zone_type: 'circle', center_lat: 33.8745, center_lng: 35.4945, radius_km: 1.4, voided: 0 } }, 'u-sales');
  const rSalesNewRegGeo200 = await c('POST', '/app/api/geo_config', { regions: { '__mc_sales_new_reg__': { name: '__MC_SALES_NEW_REG__', zone_type: 'circle', center_lat: 33.8745, center_lng: 35.4945, radius_km: 1.4, updated_at: nowIso } } }, 'u-sales');
  const rSalesBbcSite403 = await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_sales_bbc_403', name: '__MC_SALES_BBC_403__', company: 'BBConstruction', region: 'Beirut', latitude: 33.8746, longitude: 35.4946, voided: 0 } }, 'u-sales');
  const rSalesHspSite403 = await c('POST', '/app/api/geo_config', { sites: { 'hospitality & resorts::blanca:customer:__mc_sales_hsp__': { name: '__MC_SALES_HSP__', company: 'Blanca', latitude: 33.765, longitude: 35.445, updated_at: nowIso } } }, 'u-sales');
  const rSalesAliasPlain403 = await c('POST', '/app/api/geo_config', { sites: { '__mc_wtc_regonly__': { name: '__MC_WTC_REGONLY__', company: 'WTC', region: 'Akkar', latitude: 33.8743, longitude: 35.4943, updated_at: nowIso } } }, 'u-sales');
  const rEntAliasInd403 = await c('POST', '/app/api/geo_config', { sites: { 'manufacturing::customer:__mc_wtc_regonly__': { name: '__MC_WTC_REGONLY__', company: 'WTC', region: 'Akkar', latitude: 33.8743, longitude: 35.4943, updated_at: nowIso } } }, 'u-entry');
  const rSalesDbRegTamper403 = await c('POST', '/app/api/geo_config', { sites: { 'customer:__mc_wtc_dbreg__': { name: '__MC_WTC_DBREG__', company: 'WTC', region: 'Akkar', latitude: 33.8747, longitude: 35.4947, updated_at: nowIso } } }, 'u-sales');
  const rEntGeoOnlyPinAlias403 = await c('POST', '/app/api/geo_config', { sites: { 'customer:__mc_geoonly_pin__': { name: '__MC_GEOONLY_PIN__', company: 'WTC', region: 'Beirut', latitude: 33.9111, longitude: 35.5111, updated_at: nowIso } } }, 'u-entry');
  const rSalesGeoOnlyClrAlias403 = await c('POST', '/app/api/geo_config', { sites: { 'customer:__mc_geoonly_clr__': { name: '__MC_GEOONLY_CLR__', company: 'WTC', region: 'Beirut', latitude: 33.9112, longitude: 35.5112, updated_at: nowIso } } }, 'u-sales');
  const rSalesRecentAliasReg403 = await c('POST', '/app/api/geo_config', { sites: { '__mc_sales_new__': { name: '__MC_SALES_NEW__', company: 'WTC', region: 'Akkar', latitude: 33.8744, longitude: 35.4944, updated_at: new Date(Date.now() + 2000).toISOString() } } }, 'u-sales');
  const rEntRegAlias403 = await c('POST', '/app/api/geo_config', { regions: { 'manufacturing::__mc_shaped_reg__': { name: '__MC_SHAPED_REG__', zone_type: 'circle', center_lat: 33.866, center_lng: 35.526, radius_km: 3.4, updated_at: nowIso } } }, 'u-entry');
  const rSalesGeoOnlyRegAlias403 = await c('POST', '/app/api/geo_config', { regions: { 'manufacturing::__mc_geoonly_reg__': { name: '__MC_GEOONLY_REG__', zone_type: 'circle', center_lat: 33.867, center_lng: 35.527, radius_km: 3.5, updated_at: nowIso } } }, 'u-sales');
  const aliasBypass403All = [
    rSalesAliasPlain403.status,
    rEntAliasInd403.status,
    rSalesDbRegTamper403.status,
    rEntGeoOnlyPinAlias403.status,
    rSalesGeoOnlyClrAlias403.status,
    rSalesRecentAliasReg403.status,
    rEntRegAlias403.status,
    rSalesGeoOnlyRegAlias403.status
  ].every(st => st === 403);
  ok('2. Entry combined text+pin, lat/lng alias fill & region-only geo=200; Sales non-pin/cross-BU/alias-key tamper=403 & +New Site/+New Region in WTC=200',
    rEntNewSite.status === 200 && rEntCombined.status === 200 && rEntAliasFill.status === 200 &&
    Boolean(aliasSavedRow && Math.abs(Number(aliasSavedRow.latitude) - 33.8726) < 1e-4 && Math.abs(Number(aliasSavedRow.longitude) - 35.4926) < 1e-4) &&
    rEntRegOnlyGeo.status === 200 &&
    rEntHub403.status === 403 && rEntCleared403.status === 403 && rEntEditReg403.status === 403 && rEntNewReg.status === 200 &&
    rSalesTamperNotes403.status === 403 && rSalesOverwriteReg403.status === 403 &&
    rSalesBlankReg200.status === 200 && rSalesRegOnlyGeo.status === 200 && rSalesRegOnlyRepin403.status === 403 &&
    rSalesNewSite200.status === 200 && rSalesNewSiteGeo200.status === 200 && rSalesNewReg200.status === 200 && rSalesNewRegGeo200.status === 200 &&
    rSalesBbcSite403.status === 403 && rSalesHspSite403.status === 403 && aliasBypass403All,
    {
      ent: [rEntNewSite.status, rEntCombined.status, rEntAliasFill.status, aliasSavedRow?.latitude, aliasSavedRow?.longitude, rEntRegOnlyGeo.status, rEntHub403.status, rEntCleared403.status, rEntEditReg403.status, rEntNewReg.status],
      sales: [rSalesTamperNotes403.status, rSalesOverwriteReg403.status, rSalesBlankReg200.status, rSalesRegOnlyGeo.status, rSalesRegOnlyRepin403.status, rSalesNewSite200.status, rSalesNewSiteGeo200.status, rSalesNewReg200.status, rSalesNewRegGeo200.status, rSalesBbcSite403.status, rSalesHspSite403.status],
      aliases403: [rSalesAliasPlain403.status, rEntAliasInd403.status, rSalesDbRegTamper403.status, rEntGeoOnlyPinAlias403.status, rSalesGeoOnlyClrAlias403.status, rSalesRecentAliasReg403.status, rEntRegAlias403.status, rSalesGeoOnlyRegAlias403.status]
    });

  // 3. >= 12-company non-Owner session does NOT bypass isOwnerOrFullGroupSession or canAccessGeoIndustrySession
  const rCo12NonMfgHub403 = await c('POST', '/app/api/geo_config', { companyHubs: { blanca: { lat: 33.765, lng: 35.445, company: 'Blanca', updated_at: nowIso } } }, 'u-co12');
  const rCo12LaUna403 = await c('POST', '/app/api/geo_config', { sites: { 'hospitality & resorts::La Una:atk': { name: 'Atk', company: 'La Una', latitude: 33.77, longitude: 35.45, updated_at: nowIso } } }, 'u-co12');
  const rCo12Ins403 = await c('POST', '/app/api/industry_domain_store', {
    industryRowEdits: { 'Insurance & Brokerage::Policies::POLMC': { ind: 'Insurance & Brokerage', tableTitle: 'Policies', primaryId: 'POLMC', company: 'Insurance Company', latitude: 33.87, longitude: 35.49, rev: 1, updated_at: nowIso } }
  }, 'u-co12');
  const rCo12Blanca200 = await c('POST', '/app/api/geo_config', { sites: { 'hospitality & resorts::customer:blanca_mc': { name: 'Blanca MC', company: 'Blanca', latitude: 33.765, longitude: 35.445, updated_at: nowIso } } }, 'u-co12');
  ok('3. 12-company non-Owner session blocks non-Mfg companyHub, La Una, & Insurance while allowing assigned Blanca',
    rCo12NonMfgHub403.status === 403 && rCo12LaUna403.status === 403 && rCo12Ins403.status === 403 && rCo12Blanca200.status === 200,
    { rCo12NonMfgHub403: rCo12NonMfgHub403.status, rCo12LaUna403: rCo12LaUna403.status, rCo12Ins403: rCo12Ins403.status, rCo12Blanca200: rCo12Blanca200.status });

  // 4. GET /app/api/records RLS when table lacks SQL company col + deferred LIMIT + manufacturing-group
  const rBbcMfgGrp = await c('GET', '/app/api/records?table=sites&company=manufacturing-group&limit=1', null, 'u-bbc-se');
  const rBbcRows = rBbcMfgGrp.json?.rows || [];
  const rBbcRegions = await c('GET', '/app/api/records?table=regions&limit=50', null, 'u-bbc-se');
  const rBbcRegIds = new Set((rBbcRegions.json?.rows || []).map(r => r && r.id));
  ok('4. GET /records defers LIMIT on tables without company column (sites/regions), scopes manufacturing-group, & hides Hospitality region from Mfg seat',
    rBbcMfgGrp.status === 200 && rBbcRows.length === 1 && rBbcRows[0].company === 'BBConstruction' && !rBbcRegIds.has('r_hsp_only') && rBbcRegIds.has('r_shaped'),
    { rBbcMfgGrpStatus: rBbcMfgGrp.status, rBbcRows, hasHspReg: rBbcRegIds.has('r_hsp_only'), hasMfgReg: rBbcRegIds.has('r_shaped') });

  // 5. /app/api/sync RLS + 6-vertical cross-industry preserve
  const sib6Edits = {
    'Manufacturing::Sites::WTC_MC': { ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'WTC_MC', company: 'WTC', rev: 1, updated_at: nowIso },
    'Holding & Group Treasury::Partners::HLD_MC': { ind: 'Holding & Group Treasury', tableTitle: 'Partners', primaryId: 'HLD_MC', company: 'Bdeir Holding', rev: 1, updated_at: nowIso },
    'Hospitality & Resorts::Memberships::HSP_MC': { ind: 'Hospitality & Resorts', tableTitle: 'Memberships', primaryId: 'HSP_MC', company: 'Blanca', rev: 1, updated_at: nowIso },
    'Automotive & Heavy Trading::Trucks::TRD_MC': { ind: 'Automotive & Heavy Trading', tableTitle: 'Trucks', primaryId: 'TRD_MC', company: 'Korri Auto', rev: 1, updated_at: nowIso },
    'Real Estate & Property::Properties::RE_MC': { ind: 'Real Estate & Property', tableTitle: 'Properties', primaryId: 'RE_MC', company: 'Properties', rev: 1, updated_at: nowIso },
    'Insurance & Brokerage::Policies::INS_MC': { ind: 'Insurance & Brokerage', tableTitle: 'Policies', primaryId: 'INS_MC', company: 'Insurance Company', rev: 1, updated_at: nowIso }
  };
  await c('POST', '/app/api/sync', {
    op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
    patch: { mfg_web_store: { minShellVer: MIN_SYNC_SHELL_VER, updatedAt: new Date(Date.now() + 6000).toISOString(), industryRowEdits: sib6Edits } }
  }, 'u1');
  await c('POST', '/app/api/sync', {
    op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
    patch: {
      mfg_web_store: {
        minShellVer: MIN_SYNC_SHELL_VER,
        updatedAt: new Date(Date.now() + 7000).toISOString(),
        industryRowEdits: {
          'Manufacturing::Sites::BBC_MC': { ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'BBC_MC', company: 'BBConstruction', rev: 1 },
          'Insurance & Brokerage::Policies::INS_HIJACK': { ind: 'Insurance & Brokerage', tableTitle: 'Policies', primaryId: 'INS_HIJACK', company: 'Insurance Company', rev: 1 }
        }
      }
    }
  }, 'u-bbc-se');
  const syncAfter6 = (await c('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, 'u1')).json?.docs?.mfg_web_store || {};
  const ire6 = syncAfter6.industryRowEdits || {};
  ok('5. /app/api/sync preserves all 6 verticals on single-BU patch and drops smuggled out-of-scope edits',
    Object.keys(sib6Edits).every(k => Boolean(ire6[k])) && Boolean(ire6['Manufacturing::Sites::BBC_MC']) && !ire6['Insurance & Brokerage::Policies::INS_HIJACK'],
    { keysPresent: Object.keys(ire6) });

  // 6. Strict 403 across all 6 verticals on /api/industry_domain_store + 400 validation bounds
  const sixVerticalCross = [
    ['Manufacturing::Sites::ATK_MFG', { ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'ATK_MFG', company: 'BBConstruction', latitude: 33.89, longitude: 35.50, rev: 1, updated_at: nowIso }],
    ['Holding & Group Treasury::Partners::ATK_HLD', { ind: 'Holding & Group Treasury', tableTitle: 'Partners', primaryId: 'ATK_HLD', company: 'Bdeir Holding', entity: 'Bdeir Holding', latitude: 33.89, longitude: 35.50, rev: 1, updated_at: nowIso }],
    ['Hospitality & Resorts::Memberships::ATK_HSP', { ind: 'Hospitality & Resorts', tableTitle: 'Memberships', primaryId: 'ATK_HSP', company: 'La Una', latitude: 33.76, longitude: 35.44, rev: 1, updated_at: nowIso }],
    ['Automotive & Heavy Trading::Trucks::ATK_TRD', { ind: 'Automotive & Heavy Trading', tableTitle: 'Trucks', primaryId: 'ATK_TRD', company: 'Korri Auto', latitude: 33.86, longitude: 35.53, rev: 1, updated_at: nowIso }],
    ['Real Estate & Property::Properties::ATK_RE', { ind: 'Real Estate & Property', tableTitle: 'Properties', primaryId: 'ATK_RE', company: 'Properties', latitude: 33.88, longitude: 35.51, rev: 1, updated_at: nowIso }],
    ['Insurance & Brokerage::Policies::ATK_INS', { ind: 'Insurance & Brokerage', tableTitle: 'Policies', primaryId: 'ATK_INS', company: 'Insurance Company', latitude: 33.87, longitude: 35.49, rev: 1, updated_at: nowIso }]
  ];
  const cross6Statuses = [];
  for (const [k, row] of sixVerticalCross) {
    const res = await c('POST', '/app/api/industry_domain_store', { industryRowEdits: { [k]: row } }, 'u-wtc-se');
    cross6Statuses.push(res.status);
  }
  const b1 = await c('POST', '/app/api/geo_config', { sites: { 'customer:bad0': { name: 'Bad0', company: 'WTC', latitude: 0, longitude: 0 } } }, 'u1');
  const b2 = await c('POST', '/app/api/geo_config', { companyHubs: { wtc: { lat: 95, lng: 200 } } }, 'u1');
  const b3 = await c('POST', '/app/api/geo_config', { regions: { badr0: { name: 'BadR0', shape_type: 'circle', center_lat: 33.85, center_lng: 35.51, radius_km: 0 } } }, 'u1');
  const b4 = await c('POST', '/app/api/records', { table: 'regions', record: { id: 'r_bad600', name: 'BadR600', zone_type: 'circle', center_lat: 33.85, center_lng: 35.51, radius_km: 600 } }, 'u1');
  const b5 = await c('POST', '/app/api/geo_config', { pairKmOverrides: { 'bu:WTC||site:__MC_WTC_PIN__': -1 } }, 'u1');
  const b6 = await c('POST', '/app/api/geo_config', { pairKmOverrides: { 'bu:WTC||site:__MC_WTC_PIN__': 5001 } }, 'u1');
  ok('6. Strict 403 across all 6 verticals on /api/industry_domain_store & 400 coord/radius/km validation',
    cross6Statuses.every(st => st === 403) && [b1.status, b2.status, b3.status, b4.status, b5.status, b6.status].every(st => st === 400),
    { cross6Statuses, bad400: [b1.status, b2.status, b3.status, b4.status, b5.status, b6.status] });

  // 7. Holding JV entity canonicalization, Insurance agreements & atomic 403 mixed batch on /api/industry_domain_store
  const rInsAgr200 = await c('POST', '/app/api/industry_domain_store', {
    industryCustomRows: { ins_agreements: [{ id: 'agr_mc_ins', company: 'Insurance Company', partner_name: 'Broker Partner MC', updated_at: nowIso }] }
  }, 'u-ins-se');
  const rHldJv200 = await c('POST', '/app/api/industry_domain_store', {
    industryCustomRows: {
      hld_partners: [{ id: 'prt_mc_hld', entity: 'Bdeir Holding · Consolidated JV', name: 'JV Partner MC', updated_at: nowIso }],
      hld_interactions: [{ id: 'int_mc_hld', fromCo: 'Bdeir Holding', note: 'Int MC', updated_at: nowIso }]
    }
  }, 'u-hld-se');
  const rHldIndGet = await c('GET', '/app/api/industry_domain_store', null, 'u-hld-se');
  const hldIndFromCoVisible = (rHldIndGet.json?.industryCustomRows?.hld_interactions || []).some(r => r && r.id === 'int_mc_hld' && r.fromCo === 'Bdeir Holding');
  await c('POST', '/app/api/sync', {
    op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
    patch: {
      mfg_web_store: {
        minShellVer: MIN_SYNC_SHELL_VER,
        updatedAt: new Date(Date.now() + 10000).toISOString(),
        industryCustomRows: { hld_interactions: [{ id: 'int_mc_hld_sync', fromCo: 'Bdeir Holding', note: 'Int Sync MC', updated_at: nowIso }] },
        industryRowEdits: { 'Holding & Group Treasury::Partners::HLD_FROMCO_MC': { ind: 'Holding & Group Treasury', tableTitle: 'Partners', primaryId: 'HLD_FROMCO_MC', fromCo: 'Bdeir Holding', rev: 1, updated_at: nowIso } }
      }
    }
  }, 'u1');
  const rHldSyncGet = (await c('POST', '/app/api/sync', { op: 'get_mfg', doc: 'mfg_web_store' }, 'u-hld-se')).json?.docs?.mfg_web_store || {};
  const hldSyncFromCoVisible = (rHldSyncGet.industryCustomRows?.hld_interactions || []).some(r => r && r.id === 'int_mc_hld_sync') && Boolean((rHldSyncGet.industryRowEdits || {})['Holding & Group Treasury::Partners::HLD_FROMCO_MC']);
  const rMixed403 = await c('POST', '/app/api/industry_domain_store', {
    industryRowEdits: {
      'Manufacturing::Sites::WTC_MIX_MC': { ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'WTC_MIX_MC', company: 'WTC', rev: 1, updated_at: nowIso },
      'Manufacturing::Sites::BBC_MIX_MC': { ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'BBC_MIX_MC', company: 'BBConstruction', rev: 1, updated_at: nowIso }
    }
  }, 'u-wtc-se');
  const rMixedGet = await c('GET', '/app/api/industry_domain_store', null, 'u1');
  const wtcMixPersisted = Boolean((rMixedGet.json?.industryRowEdits || {})['Manufacturing::Sites::WTC_MIX_MC']);
  ok('7. Insurance agreements=200, Holding Consolidated JV & fromCo read/sync=200, mixed-batch /api/industry_domain_store atomic=403',
    rInsAgr200.status === 200 && rHldJv200.status === 200 && hldIndFromCoVisible && hldSyncFromCoVisible && rMixed403.status === 403 && !wtcMixPersisted,
    { rInsAgr200: rInsAgr200.status, rHldJv200: rHldJv200.status, hldIndFromCoVisible, hldSyncFromCoVisible, rMixed403: rMixed403.status, wtcMixPersisted });

  // 8. verifiedRoutes access control (v19.6.371 bucket): Tier 3 Entry=403, cross-BU Sup+Entry=403, assigned BU Sup+Entry=200
  const vrPayloadWtc = { 'bu:wtc||site:__mc_wtc_pin__': { km: 14.2, mins: 22, source: 'road', updated_at: nowIso } };
  const vrPayloadBbc = { 'bu:bbconstruction||site:__mc_bbc_pin__': { km: 18.7, mins: 28, source: 'road', updated_at: nowIso } };
  const rVrEntry403 = await c('POST', '/app/api/geo_config', { verifiedRoutes: vrPayloadWtc }, 'u-entry');
  const rVrCrossBu403 = await c('POST', '/app/api/geo_config', { verifiedRoutes: vrPayloadBbc }, 'u-wtc-se');
  const rVrOwn200 = await c('POST', '/app/api/geo_config', { verifiedRoutes: vrPayloadWtc }, 'u-wtc-se');
  ok('8. verifiedRoutes enforces Entry=403, cross-BU Sup+Entry=403, assigned WTC Sup+Entry=200',
    rVrEntry403.status === 403 && rVrCrossBu403.status === 403 && rVrOwn200.status === 200,
    { rVrEntry403: rVrEntry403.status, rVrCrossBu403: rVrCrossBu403.status, rVrOwn200: rVrOwn200.status });

  // 9. Site alias {lat,lng} normalization on create + re-pin block + Tier 1 update, and Tier 3 +New Region distance_km -> geo_config parity
  const rAliasNew200 = await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_mc_alias_new', name: '__MC_ALIAS_NEW__', company: 'WTC', region: 'Beirut', site_category: 'customer', lat: 33.8615, lng: 35.5115, voided: 0 } }, 'u-entry');
  const rAliasNewGeo200 = await c('POST', '/app/api/geo_config', { sites: { 'customer:__mc_alias_new__': { name: '__MC_ALIAS_NEW__', company: 'WTC', region: 'Beirut', latitude: 33.8615, longitude: 35.5115, updated_at: nowIso } } }, 'u-entry');
  const rAliasRepin403 = await c('POST', '/app/api/geo_config', { sites: { 'customer:__mc_alias_new__': { name: '__MC_ALIAS_NEW__', company: 'WTC', region: 'Beirut', latitude: 33.8715, longitude: 35.5215, updated_at: new Date(Date.now() + 2000).toISOString() } } }, 'u-entry');
  const rAliasTier1Upd200 = await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_mc_alias_new', name: '__MC_ALIAS_NEW__', company: 'WTC', region: 'Beirut', site_category: 'customer', lat: 33.8645, lng: 35.5145, voided: 0 } }, 'u-wtc-se');
  const rAliasRows = (await c('GET', '/app/api/records?table=sites&limit=5000', null, 'u1')).json?.rows || [];
  const aliasUpdatedRow = rAliasRows.find(r => r && r.id === 's_mc_alias_new');
  const aliasRawPayload = JSON.parse(ctx.d1.db.prepare('SELECT payload_json FROM sites WHERE id = ?').get('s_mc_alias_new')?.payload_json || '{}');
  const rEntDistRec200 = await c('POST', '/app/api/records', { table: 'regions', record: { id: 'r_mc_ent_dist', name: '__MC_ENT_DIST__', corridor: 'Mount Lebanon', zone_type: 'circle', center_lat: 33.852, center_lng: 35.512, radius_km: 1.6, distance_km: 14.2, voided: 0 } }, 'u-entry');
  const rEntDistGeo200 = await c('POST', '/app/api/geo_config', { regions: { '__mc_ent_dist__': { name: '__MC_ENT_DIST__', corridor: 'Mount Lebanon', zone_type: 'circle', center_lat: 33.852, center_lng: 35.512, radius_km: 1.6, updated_at: nowIso } } }, 'u-entry');
  const rEntDistTamper403 = await c('POST', '/app/api/geo_config', { regions: { '__mc_ent_dist__': { name: '__MC_ENT_DIST__', corridor: 'Mount Lebanon', zone_type: 'circle', center_lat: 33.852, center_lng: 35.512, radius_km: 1.6, distance_km: 999, updated_at: new Date(Date.now() + 2500).toISOString() } } }, 'u-entry');
  ok('9. {lat,lng} alias site create -> Tier 3 re-pin=403 -> Tier 1 update=200 & Tier 3 +New Region distance_km geo_config=200',
    rAliasNew200.status === 200 && rAliasNewGeo200.status === 200 && rAliasRepin403.status === 403 && rAliasTier1Upd200.status === 200 &&
    aliasUpdatedRow && Math.abs(Number(aliasUpdatedRow.latitude) - 33.8645) < 1e-4 && Math.abs(Number(aliasUpdatedRow.longitude) - 35.5145) < 1e-4 &&
    aliasRawPayload && !('lat' in aliasRawPayload) && !('lng' in aliasRawPayload) &&
    rEntDistRec200.status === 200 && rEntDistGeo200.status === 200 && rEntDistTamper403.status === 403,
    { st: [rAliasNew200.status, rAliasNewGeo200.status, rAliasRepin403.status, rAliasTier1Upd200.status, rEntDistRec200.status, rEntDistGeo200.status, rEntDistTamper403.status], aliasUpdatedRow });

  // 10. Non-geo Custom purge of GPS-pinned domain row/edit=403 & single-use actor-bound CAS rollback tokens
  await c('POST', '/app/api/industry_domain_store', {
    industryCustomRows: { mfg_custom: [{ id: 'ic_mc_pin_purge', company: 'WTC', name: 'Pin Purge', latitude: 33.891, longitude: 35.501, updated_at: nowIso }] },
    industryRowEdits: { 'Manufacturing::Sites::MC_PIN_PURGE': { ind: 'Manufacturing', tableTitle: 'Sites', primaryId: 'MC_PIN_PURGE', company: 'WTC', latitude: 33.892, longitude: 35.502, rev: 1, updated_at: nowIso } }
  }, 'u1');
  const rNoEntPurgeRow403 = await c('POST', '/app/api/industry_domain_store', {
    purgedRows: [{ bucket: 'mfg_custom', row_id: 'ic_mc_pin_purge', company: 'WTC' }]
  }, 'u-noent');
  const rNoEntPurgeEdit403 = await c('POST', '/app/api/industry_domain_store', {
    purgedEditKeys: ['Manufacturing::Sites::MC_PIN_PURGE']
  }, 'u-noent');
  const rAfterPurgeAtk = (await c('GET', '/app/api/industry_domain_store', null, 'u1')).json || {};
  const pinnedDomIntact = Boolean((rAfterPurgeAtk.industryCustomRows?.mfg_custom || []).some(r => r && r.id === 'ic_mc_pin_purge') && (rAfterPurgeAtk.industryRowEdits || {})['Manufacturing::Sites::MC_PIN_PURGE']);

  const rRbCreate = await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_mc_rb_create', name: '__MC_RB_CREATE__', company: 'WTC', region: 'Beirut', site_category: 'customer', latitude: 33.861, longitude: 35.501, voided: 0 } }, 'u-entry');
  const tokRbCreate = rRbCreate.json?.rollbackToken || '';
  const rRbCreateDo = await c('POST', '/app/api/records', { op: 'rollback', rollbackToken: tokRbCreate }, 'u-entry');
  const rRbCreateReplay404 = await c('POST', '/app/api/records', { op: 'rollback', rollbackToken: tokRbCreate }, 'u-entry');
  const rRbCreateRows = (await c('GET', '/app/api/records?table=sites&limit=5000', null, 'u1')).json?.rows || [];
  const rbCreateDeleted = !rRbCreateRows.some(r => r && r.id === 's_mc_rb_create');

  await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_mc_rb_unpin', name: '__MC_RB_UNPIN__', company: 'WTC', region: 'Beirut', notes: 'keep-rb', site_category: 'customer', voided: 0 } }, 'u1');
  const rRbFill = await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_mc_rb_unpin', name: '__MC_RB_UNPIN__', company: 'WTC', region: 'Beirut', latitude: 33.8811, longitude: 35.5011, voided: 0 } }, 'u-entry');
  const tokRbFill = rRbFill.json?.rollbackToken || '';
  const rRbFillDo = await c('POST', '/app/api/records', { op: 'rollback', rollbackToken: tokRbFill }, 'u-entry');
  const rbFillRow = ((await c('GET', '/app/api/records?table=sites&limit=5000', null, 'u1')).json?.rows || []).find(r => r && r.id === 's_mc_rb_unpin');
  const rbFillRestored = Boolean(rbFillRow && rbFillRow.latitude == null && rbFillRow.longitude == null && rbFillRow.notes === 'keep-rb');

  const rRbXActorCreate = await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_mc_rb_xactor', name: '__MC_RB_XACTOR__', company: 'WTC', region: 'Beirut', latitude: 33.862, longitude: 35.502, voided: 0 } }, 'u-entry');
  const tokRbXActor = rRbXActorCreate.json?.rollbackToken || '';
  const rRbXActor403 = await c('POST', '/app/api/records', { op: 'rollback', rollbackToken: tokRbXActor }, 'u-sales');
  const rRbXActor200 = await c('POST', '/app/api/records', { op: 'rollback', rollbackToken: tokRbXActor }, 'u-entry');

  const rRbCasCreate = await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_mc_rb_cas', name: '__MC_RB_CAS__', company: 'WTC', region: 'Beirut', latitude: 33.863, longitude: 35.503, voided: 0 } }, 'u-entry');
  const tokRbCas = rRbCasCreate.json?.rollbackToken || '';
  await c('POST', '/app/api/records', { table: 'sites', record: { id: 's_mc_rb_cas', name: '__MC_RB_CAS__', company: 'WTC', region: 'Beirut', notes: 'concurrent edit', latitude: 33.863, longitude: 35.503, voided: 0 } }, 'u1');
  const rRbCas409 = await c('POST', '/app/api/records', { op: 'rollback', rollbackToken: tokRbCas }, 'u-entry');

  const rDomRbWrite = await c('POST', '/app/api/industry_domain_store', { industryCustomRows: { mfg_custom: [{ id: 'ic_mc_rb_dom', company: 'WTC', name: 'RB Dom', updated_at: nowIso }] } }, 'u-wtc-se');
  const tokDomRb = rDomRbWrite.json?.rollbackToken || '';
  const rDomRbDo200 = await c('POST', '/app/api/industry_domain_store', { op: 'rollback', rollbackToken: tokDomRb }, 'u-wtc-se');
  const rDomRbReplay404 = await c('POST', '/app/api/industry_domain_store', { op: 'rollback', rollbackToken: tokDomRb }, 'u-wtc-se');
  const rDomAfterRb = (await c('GET', '/app/api/industry_domain_store', null, 'u1')).json || {};
  const domRbDeleted = !(rDomAfterRb.industryCustomRows?.mfg_custom || []).some(r => r && r.id === 'ic_mc_rb_dom');

  ok('10. Non-geo purge of pinned domain=403; /records & /industry_domain_store rollback tokens (undo, cross-actor=403, replay=404, CAS=409)',
    rNoEntPurgeRow403.status === 403 && rNoEntPurgeEdit403.status === 403 && pinnedDomIntact &&
    Boolean(tokRbCreate) && rRbCreateDo.status === 200 && rRbCreateReplay404.status === 404 && rbCreateDeleted &&
    Boolean(tokRbFill) && rRbFillDo.status === 200 && rbFillRestored &&
    Boolean(tokRbXActor) && rRbXActor403.status === 403 && rRbXActor200.status === 200 &&
    Boolean(tokRbCas) && rRbCas409.status === 409 &&
    Boolean(tokDomRb) && rDomRbDo200.status === 200 && rDomRbReplay404.status === 404 && domRbDeleted,
    { rNoEntPurgeRow403: rNoEntPurgeRow403.status, rNoEntPurgeEdit403: rNoEntPurgeEdit403.status, pinnedDomIntact, tokRbCreate: Boolean(tokRbCreate), rRbCreateDo: rRbCreateDo.status, rRbCreateReplay404: rRbCreateReplay404.status, rbCreateDeleted, rRbFillDo: rRbFillDo.status, rbFillRestored, rRbXActor403: rRbXActor403.status, rRbXActor200: rRbXActor200.status, rRbCas409: rRbCas409.status, rDomRbDo200: rDomRbDo200.status, rDomRbReplay404: rDomRbReplay404.status, domRbDeleted });

  console.log(`\nSummary: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
} catch (err) {
  console.error(err);
  process.exit(1);
}
