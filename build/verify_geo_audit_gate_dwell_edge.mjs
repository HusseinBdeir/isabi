// Offline Edge D1 verification gate for:
//   Rec #1: Geo-Pin & Hub Change Audit Trail (/app/api/geo/audit + 403 flood cap + RLS across 6 verticals)
//   Rec #2: Driver "Suggest Gate Pin" Approval Queue (/app/api/geo/gate-suggestions, gt1.* pre-auth token, atomic promotion, 409 conflict, >50m route invalidation)
// Runs in-process against functions/app/api/[[route]].js with node:sqlite.
// Run: node build/verify_geo_audit_gate_dwell_edge.mjs

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequest } from '../functions/app/api/[[route]].js';
import { MIN_SYNC_SHELL_VER } from '../functions/_lib/d1_store.js';
import { mintDriverGateToken, signEdgeSession } from '../functions/_lib/security.js';

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
  async batch(stmts) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = [];
      for (const s of stmts) out.push(await s.all());
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      try { this.db.exec('ROLLBACK'); } catch (_) {}
      throw e;
    }
  }
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
const JWT_SECRET = 'geo-audit-gate-dwell-edge-secret-32c!!'; // secret-scan: allow

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

const TEST_SEATS = [
  { id: 'u-owner', email: 'owner@example.test', full_name: 'Owner Seat', role: 'Full Access (Owner)', companies: 'ALL', custom_perms: '{}' },
  { id: 'u-wtc-sup', email: 'wtcsup@example.test', full_name: 'WTC Sup', role: 'Supervisor', companies: 'WTC', custom_perms: '{}' },
  { id: 'u-wtc-se', email: 'wtcse@example.test', full_name: 'WTC SupEntry', role: 'Supervisor + Entry', companies: 'WTC', custom_perms: '{}' },
  { id: 'u-hsp-se', email: 'hspsup@example.test', full_name: 'Blanca SupEntry', role: 'Supervisor + Entry', companies: 'Blanca', custom_perms: '{}' },
  { id: 'u-view', email: 'viewer@example.test', full_name: 'WTC Viewer', role: 'Viewer', companies: 'WTC', custom_perms: '{}' },
  { id: 'u-kiosk', email: 'kiosk@example.test', full_name: 'WTC Kiosk', role: 'Kiosk', companies: 'WTC', custom_perms: '{}' },
  { id: 'u-entry', email: 'entry@example.test', full_name: 'WTC Entry', role: 'Entry', companies: 'WTC', custom_perms: '{}' }
];

async function createCtx() {
  const d1 = new D1();
  d1.exec(SCHEMA_SQL);
  const env = { DB: d1, BUCKET: createMockBucket(), ISABI_JWT_SECRET: JWT_SECRET };
  const tok = {};
  for (const s of TEST_SEATS) {
    const sid = `sess_${s.id}`;
    d1.db.prepare(
      'INSERT INTO users (id, full_name, email, role, companies, pbi_access, statements_access, custom_perms, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(s.id, s.full_name, s.email, s.role, s.companies, 'full', 'full', s.custom_perms, 'Active');
    d1.db.prepare(
      'INSERT INTO auth_sessions (id, user_id, email, full_name, role, companies, logged_in_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(sid, s.id, s.email, s.full_name, s.role, s.companies, '2026-11-16T00:00:00Z');
    tok[s.id] = await signEdgeSession({
      sid, sub: s.id, email: s.email, role: s.role, companies: s.companies
    }, env);
  }

  async function callEdge(method, pathAndQuery, body = null, sessionId = 'u-owner', extraHeaders = {}) {
    const fullUrl = `https://isabisystems.com${pathAndQuery}`;
    const u = new URL(fullUrl);
    const routeParts = u.pathname.replace(/^\/app\/api\/?/, '').split('/').filter(Boolean);
    const hdrs = new Headers(Object.assign({ Origin: 'https://isabisystems.com' }, extraHeaders));
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
  const t0 = new Date(Date.now() - 3600000).toISOString();

  // Seed initial Mfg site, Blanca site, verifiedRoutes, and mfg_web_store mirror
  await c('POST', '/app/api/records', {
    table: 'sites',
    record: { id: 's_wtc_ch', name: 'Choueifat Edge Gate', company: 'WTC', region: 'Beirut', site_category: 'customer', latitude: 33.8065, longitude: 35.4892, entered_by: 'owner@example.test', entered_at: t0, voided: 0 }
  }, 'u-owner');

  await c('POST', '/app/api/records', {
    table: 'sites',
    record: { id: 's_wtc_close', name: 'Micro Adjust Gate', company: 'WTC', region: 'Beirut', site_category: 'customer', latitude: 33.8100, longitude: 35.4900, entered_by: 'owner@example.test', entered_at: t0, voided: 0 }
  }, 'u-owner');

  await c('POST', '/app/api/industry_domain_store', {
    industryRowEdits: {},
    industryCustomRows: {
      'hospitality & resorts::hsp_venues': [
        { id: 'hsp_blanca_v1', name: 'Blanca Resort Gate', company: 'Blanca', _industry: 'Hospitality & Resorts', lat: 33.9712, lng: 35.6114, updated_at: t0 }
      ]
    }
  }, 'u-owner');

  await c('POST', '/app/api/geo_config', {
    companyHubs: { WTC: { name: 'WTC', lat: 33.8938, lng: 35.4820, updated_at: t0 } },
    regions: {},
    sites: {
      'customer:choueifat edge gate': { name: 'Choueifat Edge Gate', company: 'WTC', latitude: 33.8065, longitude: 35.4892, site_category: 'customer', updated_at: t0 },
      'choueifat edge gate': { name: 'Choueifat Edge Gate', company: 'WTC', latitude: 33.8065, longitude: 35.4892, site_category: 'customer', updated_at: t0 },
      'customer:micro adjust gate': { name: 'Micro Adjust Gate', company: 'WTC', latitude: 33.8100, longitude: 35.4900, site_category: 'customer', updated_at: t0 },
      'hospitality & resorts::customer:blanca resort gate': { id: 'hsp_blanca_v1', name: 'Blanca Resort Gate', company: 'Blanca', latitude: 33.9712, longitude: 35.6114, site_category: 'customer', updated_at: t0 }
    },
    pairKmOverrides: {},
    verifiedRoutes: {
      'bu:wtc||site:choueifat edge gate': { km: 14.2, coords: [[33.8938, 35.4820], [33.8065, 35.4892]] },
      'bu:wtc||site:micro adjust gate': { km: 14.0, coords: [[33.8938, 35.4820], [33.8100, 35.4900]] }
    }
  }, 'u-owner');

  // 1. Geo Audit Trail: Hub move, twin dedup site move, pairKmOverride, 403 block + flood cap, RLS
  const hubMoveRes = await c('POST', '/app/api/geo_config', {
    companyHubs: { WTC: { name: 'WTC', lat: 33.8950, lng: 35.4832, updated_at: new Date().toISOString() } },
    pairKmOverrides: { 'bu:wtc||site:choueifat edge gate': 15 }
  }, 'u-owner');
  ok('Owner moves WTC hub & edits pairKmOverrides (200)', hubMoveRes.status === 200, hubMoveRes);

  // Viewer blocked on geo_config twice within 10s -> 403 logged ONCE (60s flood cap!)
  const vGeoBlk1 = await c('POST', '/app/api/geo_config', { companyHubs: { WTC: { name: 'WTC', lat: 33.899, lng: 35.489, updated_at: new Date().toISOString() } } }, 'u-view');
  const vGeoBlk2 = await c('POST', '/app/api/geo_config', { companyHubs: { WTC: { name: 'WTC', lat: 33.899, lng: 35.489, updated_at: new Date().toISOString() } } }, 'u-view');
  ok('Viewer geo_config blocked with 403 twice', vGeoBlk1.status === 403 && vGeoBlk2.status === 403);

  // Viewer /sync with unauthorized industryRowEdits (in own WTC scope so RLS allows reaching role-lock gate)
  const vSyncBlk = await c('POST', '/app/api/sync', {
    op: 'patch',
    patch: {
      mfg_web_store: {
        minShellVer: MIN_SYNC_SHELL_VER,
        industryRowEdits: { 'manufacturing::edit1': { lat: 33.89, lng: 35.51, company: 'WTC' } }
      }
    }
  }, 'u-view');
  ok('Viewer /sync geo role lock sanitizes (200) and records blocked_403 audit', vSyncBlk.status === 200, vSyncBlk);

  // Blanca SupEntry moves Blanca pin
  const hspPinRes = await c('POST', '/app/api/geo_config', {
    sites: {
      'hospitality & resorts::customer:blanca resort gate': { id: 'hsp_blanca_v1', name: 'Blanca Resort Gate', company: 'Blanca', latitude: 33.9725, longitude: 35.6125, site_category: 'customer', updated_at: new Date().toISOString() }
    }
  }, 'u-hsp-se');
  ok('Blanca SupEntry moves Blanca site pin (200)', hspPinRes.status === 200, hspPinRes);

  // Audit GET checks
  const aOwner = await c('GET', '/app/api/geo/audit?limit=100', null, 'u-owner');
  const aWtcSup = await c('GET', '/app/api/geo/audit?limit=100', null, 'u-wtc-sup');
  const aBlanca = await c('GET', '/app/api/geo/audit?limit=100', null, 'u-hsp-se');
  const aView = await c('GET', '/app/api/geo/audit?limit=100', null, 'u-view');
  const aDemo = await c('GET', '/app/api/geo/audit?limit=100', null, null, { 'X-ISABI-Demo': '1' });

  ok('Owner GET /app/api/geo/audit 200 with hub+km+403+blanca', aOwner.status === 200
    && aOwner.json.audits.some(r => r.action === 'hub_moved')
    && aOwner.json.audits.some(r => r.action === 'pair_km_edited')
    && aOwner.json.audits.some(r => r.outcome === 'blocked_403' && r.source === 'geo_config')
    && aOwner.json.audits.some(r => r.outcome === 'blocked_403' && r.source === 'sync')
    && aOwner.json.audits.some(r => r.company === 'Blanca'), aOwner.json);

  const blkGeoCount = aOwner.json.audits.filter(r => r.outcome === 'blocked_403' && r.source === 'geo_config' && r.actor_user_id === 'u-view').length;
  ok('60s blocked_403 flood cap prevents duplicate spam rows (count === 1)', blkGeoCount === 1, blkGeoCount);

  ok('WTC Supervisor sees WTC audits only (zero Blanca)', aWtcSup.status === 200
    && aWtcSup.json.audits.some(r => r.company === 'WTC')
    && !aWtcSup.json.audits.some(r => r.company === 'Blanca'));
  ok('Blanca Supervisor sees Blanca audits only (zero WTC)', aBlanca.status === 200
    && aBlanca.json.audits.some(r => r.company === 'Blanca')
    && !aBlanca.json.audits.some(r => r.company === 'WTC'));
  ok('Viewer GET /app/api/geo/audit rejected 403', aView.status === 403);
  ok('Demo header returns safe empty audits list', aDemo.status === 200 && aDemo.json.demo === true && aDemo.json.audits.length === 0);

  // 2. Driver Gate-Pin Approval Queue + gt1.* Token Lifecycle
  const viewMint = await c('POST', '/app/api/geo/gate-suggestions', { op: 'mint_link', industry: 'manufacturing', company: 'WTC', site_id: 's_wtc_ch', site_name: 'Choueifat Edge Gate' }, 'u-view');
  ok('Viewer cannot mint driver gate link (403)', viewMint.status === 403);

  const kioskMint = await c('POST', '/app/api/geo/gate-suggestions', {
    op: 'mint_link', industry: 'manufacturing', company: 'WTC', site_id: 's_wtc_ch', site_name: 'Choueifat Edge Gate', driver_label: 'Ali Truck TB3'
  }, 'u-kiosk');
  ok('Kiosk mints gt1.* driver gate token (200)', kioskMint.status === 200 && /^gt1\./.test(kioskMint.json?.token || ''), kioskMint.json);

  const tokStr = kioskMint.json.token;
  // Pre-auth token GET without cookie AND with another user cookie (step 5a-fix regression check!)
  const tokGetNoSess = await c('GET', `/app/api/geo/gate-suggestions?gate_token=${encodeURIComponent(tokStr)}`, null, null);
  const tokGetWithSess = await c('GET', `/app/api/geo/gate-suggestions?gate_token=${encodeURIComponent(tokStr)}`, null, 'u-hsp-se');
  const badTokGet = await c('GET', `/app/api/geo/gate-suggestions?gate_token=${encodeURIComponent(tokStr + 'x')}`, null, null);
  ok('Driver token GET works without cookie & even with unrelated cookie', tokGetNoSess.status === 200 && tokGetWithSess.status === 200 && tokGetNoSess.json.target.site_name === 'Choueifat Edge Gate');
  ok('Tampered driver gate token rejected with 403', badTokGet.status === 403);

  // Zero-zero / invalid coord guard + pre-auth POST submission (shifted ~180m -> should clear verifiedRoutes!)
  const zeroPost = await c('POST', '/app/api/geo/gate-suggestions', { gate_token: tokStr, op: 'create', suggested_lat: 0, suggested_lng: 0 }, null);
  ok('0,0 coordinates rejected with 400', zeroPost.status === 400);

  const drvCreate = await c('POST', '/app/api/geo/gate-suggestions', {
    gate_token: tokStr,
    op: 'create',
    suggested_lat: 33.8080,
    suggested_lng: 35.4906,
    accuracy_meters: 14,
    access_note: 'New east weighbridge entrance'
  }, null);
  ok('Driver gate token POST creates pending suggestion with computed shift > 50m', drvCreate.status === 200 && drvCreate.json.suggestion.status === 'pending' && Number(drvCreate.json.suggestion.shift_meters) > 100, drvCreate.json);
  const bigSugId = drvCreate.json.suggestion.id;

  // Duplicate <5m within 60s returns 409
  const dupCreate = await c('POST', '/app/api/geo/gate-suggestions', {
    gate_token: tokStr, op: 'create', suggested_lat: 33.80801, suggested_lng: 35.49061
  }, null);
  ok('Duplicate gate pin within 5m & 60s blocked with 409', dupCreate.status === 409);

  // Viewer cannot approve pending gate suggestion -> 403 + blocked_403 audit row
  const vDecide = await c('POST', '/app/api/geo/gate-suggestions', { op: 'decide', id: bigSugId, decision: 'approved' }, 'u-view');
  ok('Viewer cannot approve gate pin suggestion (403)', vDecide.status === 403);

  // Blanca Supervisor cannot approve WTC gate suggestion -> 403
  const rlsDecide = await c('POST', '/app/api/geo/gate-suggestions', { op: 'decide', id: bigSugId, decision: 'approved' }, 'u-hsp-se');
  ok('Cross-entity Supervisor blocked from approving WTC gate pin (403)', rlsDecide.status === 403);

  // WTC Supervisor+Entry approves Choueifat gate pin -> atomic promote + verifiedRoutes invalidation + audit row
  const apprRes = await c('POST', '/app/api/geo/gate-suggestions', { op: 'decide', id: bigSugId, decision: 'approved' }, 'u-wtc-se');
  ok('WTC Supervisor+Entry approves & promotes gate pin (200)', apprRes.status === 200 && apprRes.json.suggestion.status === 'approved' && apprRes.json.clearedRoutePairs.includes('bu:wtc||site:choueifat edge gate'), apprRes.json);

  // Second decide on same suggestion returns 409 Conflict
  const doubleDecide = await c('POST', '/app/api/geo/gate-suggestions', { op: 'decide', id: bigSugId, decision: 'declined' }, 'u-owner');
  ok('Double-decide on already approved gate pin returns 409', doubleDecide.status === 409);

  // Verify promoted coords persisted across relational sites AND geo_config AND stale verifiedRoutes cleared
  const siteRowRaw = ctx.d1.rows("SELECT payload_json FROM sites WHERE id = 's_wtc_ch'")[0];
  const siteRowDb = siteRowRaw ? JSON.parse(siteRowRaw.payload_json || '{}') : {};
  const geoCfgAfter = JSON.parse(ctx.d1.rows("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'geo_config'")[0].payload_json);
  ok('Relational sites updated to 33.8080, 35.4906', Math.abs(Number(siteRowDb.latitude) - 33.8080) < 1e-5 && Math.abs(Number(siteRowDb.longitude) - 35.4906) < 1e-5, siteRowDb);
  ok('geo_config.sites updated & >50m stale verifiedRoute cleared', Math.abs(geoCfgAfter.sites['customer:choueifat edge gate'].latitude - 33.8080) < 1e-5 && !geoCfgAfter.verifiedRoutes['bu:wtc||site:choueifat edge gate'] && Boolean(geoCfgAfter.verifiedRoutes['bu:wtc||site:micro adjust gate']), geoCfgAfter);

  // Check sibling vertical (Hospitality / Blanca) gate pin promotion updates industry_custom_rows & audit
  const hspViewCreate = await c('POST', '/app/api/geo/gate-suggestions', {
    op: 'create', industry: 'hospitality', company: 'Blanca', site_id: 'hsp_blanca_v1', site_name: 'Blanca Resort Gate',
    suggested_lat: 33.9735, suggested_lng: 35.6135, access_note: 'VIP Marina service barrier'
  }, 'u-owner'); // test sibling vertical creation & approval
  const hspAppr = await c('POST', '/app/api/geo/gate-suggestions', { op: 'decide', id: hspViewCreate.json.suggestion.id, decision: 'approved' }, 'u-hsp-se');
  const icrAfter = ctx.d1.rows("SELECT payload_json FROM industry_custom_rows WHERE row_id = 'hsp_blanca_v1'")[0];
  const icrObj = icrAfter ? JSON.parse(icrAfter.payload_json) : {};
  ok('Sibling vertical gate promotion updates industry_custom_rows', hspAppr.status === 200 && Math.abs(Number(icrObj.lat) - 33.9735) < 1e-5, icrObj);

  // Small <= 50m gate adjustment keeps verifiedRoutes intact
  const smallSug = await c('POST', '/app/api/geo/gate-suggestions', {
    op: 'create', industry: 'manufacturing', company: 'WTC', site_id: 's_wtc_close', site_name: 'Micro Adjust Gate',
    suggested_lat: 33.81018, suggested_lng: 35.49015
  }, 'u-view');
  const smallAppr = await c('POST', '/app/api/geo/gate-suggestions', { op: 'decide', id: smallSug.json.suggestion.id, decision: 'approved' }, 'u-wtc-se');
  const geoCfgMicro = JSON.parse(ctx.d1.rows("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'geo_config'")[0].payload_json);
  ok('Viewer submission + <= 50m promotion keeps verifiedRoutes intact', smallAppr.status === 200 && smallAppr.json.clearedRoutePairs.length === 0 && Boolean(geoCfgMicro.verifiedRoutes['bu:wtc||site:micro adjust gate']), smallAppr.json);

  const finalAudit = await c('GET', '/app/api/geo/audit?action=gate_pin_promoted', null, 'u-owner');
  ok('Audit log records gate_pin_promoted events across Mfg & Blanca', finalAudit.status === 200 && finalAudit.json.audits.length >= 3, finalAudit.json.audits.length);

  // ==================== PART 3: Red-Team Security, Expiry, Cancel, Atomic CAS & 5-Industry Edits ====================
  const nowSec = Math.floor(Date.now() / 1000);
  // 1) pbi_access='full' non-Supervisor (Viewer & Entry) rejected 403 on GET /app/api/geo/audit
  const uViewFull = { id: 'u-view-pbi', full_name: 'Viewer Full PBI', email: 'vfull@test.local', role: 'Viewer', companies: 'WTC', pbi_access: 'full', statements_access: 'full', status: 'Active' };
  const uEntryFull = { id: 'u-entry-pbi', full_name: 'Entry Full PBI', email: 'efull@test.local', role: 'Entry', companies: 'WTC', pbi_access: 'full', statements_access: 'full', status: 'Active' };
  for (const u of [uViewFull, uEntryFull]) {
    const sid = `sess_${u.id}`;
    ctx.d1.db.prepare("INSERT INTO users (id, full_name, email, role, companies, pbi_access, statements_access, custom_perms, status) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(u.id, u.full_name, u.email, u.role, u.companies, u.pbi_access, u.statements_access, '{}', u.status);
    ctx.d1.db.prepare("INSERT INTO auth_sessions (id, user_id, email, full_name, role, companies, logged_in_at) VALUES (?,?,?,?,?,?,?)")
      .run(sid, u.id, u.email, u.full_name, u.role, u.companies, '2026-11-16T00:00:00Z');
    ctx.tok[u.id] = await signEdgeSession({ sid, sub: u.id, email: u.email, name: u.full_name, role: u.role, companies: u.companies, pbi: 'full', pbi_access: 'full' }, ctx.env);
  }
  const audVFull = await c('GET', '/app/api/geo/audit?limit=50', null, 'u-view-pbi');
  const audEFull = await c('GET', '/app/api/geo/audit?limit=50', null, 'u-entry-pbi');
  ok('pbi_access=full Viewer & Entry rejected 403 on /app/api/geo/audit', audVFull.status === 403 && audEFull.status === 403, { v: audVFull.status, e: audEFull.status });

  // 2) Subordinate blocked_403 row with empty company visible to WTC Supervisor, hidden from Blanca Supervisor
  const blkEmptyCoRes = await c('POST', '/app/api/geo_config', {
    _deletedKeys: { 'verifiedRoutes:edge_global_route': new Date().toISOString() },
    verifiedRoutes: {}
  }, 'u-entry');
  const wtcSupAud2 = await c('GET', '/app/api/geo/audit?limit=100', null, 'u-wtc-sup');
  const blSupAud2 = await c('GET', '/app/api/geo/audit?limit=100', null, 'u-hsp-se');
  ok('BU Supervisor sees subordinate empty-company blocked_403 audit row (Blanca isolated)', blkEmptyCoRes.status === 403
    && wtcSupAud2.json.audits.some(r => r.outcome === 'blocked_403' && !r.company && r.actor_user_id === 'u-entry')
    && !blSupAud2.json.audits.some(r => r.outcome === 'blocked_403' && r.actor_user_id === 'u-entry'));

  // 3) Expired gt1.* token rejected 403 expired_token + missing JWT secret mint returns 503
  const expPayload = Buffer.from(JSON.stringify({ typ: 'geo_gate_pin', jti: 'exp1', ind: 'Manufacturing', co: 'WTC', sid: 's_wtc_ch', sn: 'Choueifat Edge Gate', sc: 'customer', tt: 'site', dl: '', mb: '', mbi: '', iat: nowSec - 7200, exp: nowSec - 60 }), 'utf8').toString('base64url');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`gt1.${expPayload}`));
  const expTok = `gt1.${expPayload}.${Buffer.from(sig).toString('base64url')}`;
  const expGet = await c('GET', `/app/api/geo/gate-suggestions?gate_token=${encodeURIComponent(expTok)}`, null, null);
  const expPost = await c('POST', '/app/api/geo/gate-suggestions', { gate_token: expTok, op: 'create', suggested_lat: 33.808, suggested_lng: 35.490 }, null);
  const missSecret = await mintDriverGateToken({ company: 'WTC', site_name: 'Choueifat Edge Gate' }, { ISABI_JWT_SECRET: '' }, 24);
  ok('Expired gt1.* returns 403 expired_token & missing signing secret returns 503', expGet.status === 403 && expGet.json.code === 'expired_token' && expPost.status === 403 && expPost.json.code === 'expired_token' && missSecret.ok === false && missSecret.status === 503, { expGet: expGet.json, missSecret });

  // 4) Submitter op:'cancel' + cross-user cancel 409 + driver gt1.* token cancel
  const vSug = await c('POST', '/app/api/geo/gate-suggestions', {
    op: 'create', industry: 'manufacturing', company: 'WTC', site_id: 's_wtc_ch', site_name: 'Choueifat Edge Gate',
    suggested_lat: 33.8091, suggested_lng: 35.4911, access_note: 'Cancel lifecycle check'
  }, 'u-view');
  const xCancel = await c('POST', '/app/api/geo/gate-suggestions', { op: 'cancel', id: vSug.json?.suggestion?.id }, 'u-hsp-se');
  const ownCancel = await c('POST', '/app/api/geo/gate-suggestions', { op: 'cancel', id: vSug.json?.suggestion?.id }, 'u-view');
  const drvSug = await c('POST', '/app/api/geo/gate-suggestions', {
    gate_token: tokStr, op: 'create', suggested_lat: 33.8095, suggested_lng: 35.4915, access_note: 'Driver cancel check'
  }, null);
  const drvCancel = await c('POST', '/app/api/geo/gate-suggestions', { gate_token: tokStr, op: 'cancel', id: drvSug.json?.suggestion?.id }, null);
  ok('Submitter op:cancel works for Viewer & gt1.* token and blocks cross-user cancel (409)', xCancel.status === 409 && ownCancel.status === 200 && ownCancel.json.suggestion.status === 'cancelled' && drvCancel.status === 200 && drvCancel.json.suggestion.status === 'cancelled');

  // 5) 5-industry industry_row_edits + blank-site_id industry_custom_rows + mfg_web_store sync on gate promotion
  await c('POST', '/app/api/industry_domain_store', {
    industryRowEdits: { 'Hospitality & Resorts::Resorts & Units::BLC-E1': { ind: 'Hospitality & Resorts', primaryId: 'BLC-E1', company: 'Blanca', siteName: 'Blanca Marina Gate', latitude: 33.9710, longitude: 35.6110, rev: 1, updated_at: t0 } },
    industryCustomRows: { 'hospitality & resorts::hsp_venues': [{ id: 'hsp_bl_e2', name: 'Blanca Marina Gate', siteName: 'Blanca Marina Gate', company: 'Blanca', _industry: 'Hospitality & Resorts', lat: 33.9710, lng: 35.6110, updated_at: t0 }] }
  }, 'u-hsp-se');
  const blBlankSug = await c('POST', '/app/api/geo/gate-suggestions', {
    op: 'create', industry: 'hospitality', company: 'Blanca', site_id: '', site_name: 'Blanca Marina Gate',
    suggested_lat: 33.9751, suggested_lng: 35.6151
  }, 'u-hsp-se');
  const blBlankApr = await c('POST', '/app/api/geo/gate-suggestions', { op: 'decide', id: blBlankSug.json.suggestion.id, decision: 'approved' }, 'u-hsp-se');
  const blEditAfter = JSON.parse(ctx.d1.rows("SELECT payload_json FROM industry_row_edits WHERE edit_key = 'Hospitality & Resorts::Resorts & Units::BLC-E1'")[0].payload_json);
  const blCustAfter = JSON.parse(ctx.d1.rows("SELECT payload_json FROM industry_custom_rows WHERE row_id = 'hsp_bl_e2'")[0].payload_json);
  ok('5-industry blank-site_id promotion atomically updates industry_row_edits & industry_custom_rows', blBlankApr.status === 200 && Math.abs(Number(blEditAfter.latitude) - 33.9751) < 1e-5 && Math.abs(Number(blCustAfter.lat) - 33.9751) < 1e-5);

  // 6) Atomic D1.batch CAS retry (1 conflict -> rollback + retry -> 200) and CAS exhaustion -> 409 with zero split state
  const casSug = await c('POST', '/app/api/geo/gate-suggestions', {
    op: 'create', industry: 'manufacturing', company: 'WTC', site_id: 's_wtc_ch', site_name: 'Choueifat Edge Gate',
    suggested_lat: 33.8123, suggested_lng: 35.4955, access_note: 'CAS atomic batch retry check'
  }, 'u-view');
  const origBatch = ctx.d1.batch.bind(ctx.d1);
  let injectBumpsLeft = 1;
  ctx.d1.batch = async (stmts) => {
    if (injectBumpsLeft > 0) {
      injectBumpsLeft--;
      ctx.d1.exec("UPDATE edge_kv_store SET rev = COALESCE(rev, 0) + 1 WHERE doc_key = 'geo_config'");
    }
    return origBatch(stmts);
  };
  const casRetryApr = await c('POST', '/app/api/geo/gate-suggestions', { op: 'decide', id: casSug.json.suggestion.id, decision: 'approved' }, 'u-wtc-se');
  const casSiteRow = JSON.parse(ctx.d1.rows("SELECT payload_json FROM sites WHERE id = 's_wtc_ch'")[0].payload_json || '{}');
  ok('D1.batch concurrent geo_config rev bump atomically retries and commits 200', casRetryApr.status === 200 && injectBumpsLeft === 0 && Math.abs(Number(casSiteRow.latitude) - 33.8123) < 1e-5);

  const casExhaustSug = await c('POST', '/app/api/geo/gate-suggestions', {
    op: 'create', industry: 'manufacturing', company: 'WTC', site_id: 's_wtc_ch', site_name: 'Choueifat Edge Gate',
    suggested_lat: 33.8199, suggested_lng: 35.4999, access_note: 'CAS exhaustion 409 check'
  }, 'u-view');
  injectBumpsLeft = 10;
  const casExhaustApr = await c('POST', '/app/api/geo/gate-suggestions', { op: 'decide', id: casExhaustSug.json.suggestion.id, decision: 'approved' }, 'u-wtc-se');
  ctx.d1.batch = origBatch;
  const casExhaustSite = JSON.parse(ctx.d1.rows("SELECT payload_json FROM sites WHERE id = 's_wtc_ch'")[0].payload_json || '{}');
  const casExhaustSugRow = ctx.d1.rows("SELECT status FROM geo_gate_suggestions WHERE id = ?", casExhaustSug.json.suggestion.id)[0];
  ok('CAS retry exhaustion returns 409 and rolls back sites + suggestion atomically (no 500 split state)', casExhaustApr.status === 409 && Math.abs(Number(casExhaustSite.latitude) - 33.8123) < 1e-5 && casExhaustSugRow.status === 'pending');

  console.log(`\nSUMMARY: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
} catch (err) {
  console.error('FATAL:', err);
  process.exit(1);
}
