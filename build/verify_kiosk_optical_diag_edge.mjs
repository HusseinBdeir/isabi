// Offline Edge gate for:
//   1. #1 staffBiometrics mixed-case key normalization on /api/sync (delta_mfg, patch, _deletedBioKeys,
//      legacy unnormalized D1 cleanup DELETE, multi-BU RLS, and scopeStoreDocForSession).
//   2. #3 /api/kiosk_optical_diag GET & POST: auth 401, Demo isolation (GET empty / POST 403), 4 KB 413 cap,
//      bad-payload 400, /api/sync block 400, company RLS 403, health-rank + frequency sort, and
//      Supervisor/Owner-only action:"reset" RBAC.
// Uses in-memory node:sqlite (Node 22.5+). Touches nothing live.
// Run: node build/verify_kiosk_optical_diag_edge.mjs

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequest } from '../functions/app/api/[[route]].js';
import { signEdgeSession } from '../functions/_lib/security.js';
import {
  effectiveMinSyncShellVer,
  diagnoseKioskOpticalHealthRank,
  isKioskOpticalDiagDoc,
  listKioskOpticalDiagRows
} from '../functions/_lib/d1_store.js';
import { DEPLOYED_SHELL_VER } from '../functions/_lib/deployed_shell.js';

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
  one(sql, ...p) { return this.db.prepare(sql).get(...p) || null; }
  rows(sql, ...p) { return this.db.prepare(sql).all(...p); }
}

const SCHEMA_SQL = readFileSync(new URL('../migrations/0001_schema.sql', import.meta.url), 'utf8');
const d1 = new D1();
d1.exec(SCHEMA_SQL);

const env = {
  DB: d1,
  ISABI_JWT_SECRET: 'kiosk-optical-diag-offline-secret-' + Math.random().toString(36).slice(2)
};

const seat = async (id, name, email, role, cos) => {
  d1.db.prepare('INSERT INTO users (id, full_name, email, role, companies) VALUES (?,?,?,?,?)').run(id, name, email, role, cos);
  d1.db.prepare('INSERT INTO auth_sessions (id, user_id, email, full_name, role, companies) VALUES (?,?,?,?,?,?)').run('sess-' + id, id, email, name, role, cos);
  return signEdgeSession({ sid: 'sess-' + id, sub: id, email, name, role, companies: cos }, env);
};

const OWNER = await seat('u1', 'Owner Seat', 'owner@example.test', 'Full Access (Owner)', 'All');
const WTC_ENTRY = await seat('u7', 'WTC Entry', 'wtc.entry@example.test', 'Entry', 'WTC');
const WTC_SUP = await seat('u9', 'WTC Sup', 'wtc.sup@example.test', 'Supervisor', 'WTC');
const WTC_SALES = await seat('u11', 'WTC Sales', 'wtc.sales@example.test', 'Sales', 'WTC');
const BLANCA_SUP = await seat('u10', 'Blanca Sup', 'blanca.sup@example.test', 'Supervisor', 'Blanca');

const SHELL = effectiveMinSyncShellVer() || DEPLOYED_SHELL_VER || '19.6.466';

async function api(routePath, { method = 'POST', body, rawBody, token = OWNER, headers = {} } = {}) {
  const tasks = [];
  const raw = rawBody !== undefined ? rawBody : (body !== undefined ? JSON.stringify(body) : undefined);
  const h = Object.assign({
    'Content-Type': 'application/json',
    'CF-Connecting-IP': '10.9.0.12',
    'X-ISABI-Shell': SHELL
  }, headers);
  if (token) h['X-ISABI-Session'] = token;
  const req = new Request(`https://example.test/app/api/${routePath}`, { method, headers: h, body: raw });
  const res = await onRequest({
    request: req,
    env,
    params: { route: routePath.split('?')[0].split('/') },
    waitUntil: p => tasks.push(p)
  });
  await Promise.allSettled(tasks);
  let json = null;
  try { json = await res.json(); } catch (_) {}
  return { status: res.status, ok: res.ok, json };
}

let passed = 0;
let failed = 0;
const assert = (name, cond, detail = '') => {
  if (cond) { passed += 1; }
  else { failed += 1; console.error(`FAIL: ${name}${detail ? ' -> ' + detail : ''}`); }
};

// Seed mfg_web_store with a legacy unnormalized mixed-case staffBiometrics row + matching D1 table row
const vecA = Array.from({ length: 128 }, (_, i) => Number((Math.sin(i + 1) * 0.1).toFixed(4)));
const vecB = Array.from({ length: 128 }, (_, i) => Number((Math.cos(i + 2) * 0.1).toFixed(4)));
d1.db.prepare(
  "INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES ('mfg_web_store', ?, '2026-11-27T08:00:00.000Z', 'seed', 1)"
).run(JSON.stringify({
  version: 1,
  staffBiometrics: {
    'Zztest  Mixed Case': {
      staff: 'Zztest  Mixed Case',
      company: 'WTC',
      pin: '1234',
      faceSamples: [vecA],
      updated_at: '2026-11-27T08:00:00.000Z'
    }
  },
  customRecords: {},
  industryCustomRows: {},
  industryRowEdits: {}
}));
d1.db.prepare(
  "INSERT INTO staff_biometrics (staff_key, company, payload_json, updated_at) VALUES ('Zztest  Mixed Case', 'WTC', ?, '2026-11-27T08:00:00.000Z')"
).run(JSON.stringify({
  staff: 'Zztest  Mixed Case',
  company: 'WTC',
  pin: '1234',
  faceSamples: [vecA],
  updated_at: '2026-11-27T08:00:00.000Z'
}));

// 1. get_mfg normalizes legacy mixed-case staffBiometrics key for both Entry & Owner sessions
const g0 = await api('sync', { body: { doc: 'mfg_web_store', op: 'get_mfg' }, token: WTC_ENTRY });
const g0Doc = g0.json && g0.json.docs && g0.json.docs.mfg_web_store;
assert('1a get_mfg ok', g0.status === 200 && g0.json && g0Doc, JSON.stringify(g0));
const bio0 = (g0Doc && g0Doc.staffBiometrics) || {};
assert('1b get_mfg returns normalized key', Object.keys(bio0).includes('zztest mixed case') && !Object.keys(bio0).includes('Zztest  Mixed Case'), JSON.stringify(Object.keys(bio0)));

const g0Owner = await api('sync', { body: { doc: 'mfg_web_store', op: 'get_mfg' }, token: OWNER });
const bio0Owner = (g0Owner.json && g0Owner.json.docs && g0Owner.json.docs.mfg_web_store && g0Owner.json.docs.mfg_web_store.staffBiometrics) || {};
assert('1b_owner Owner get_mfg also returns normalized key', Object.keys(bio0Owner).includes('zztest mixed case') && !Object.keys(bio0Owner).includes('Zztest  Mixed Case'), JSON.stringify(Object.keys(bio0Owner)));

// 1c. An unrelated _deltaPatch by a NON-ENROLLING seat (Sales) migrates the legacy key cleanly without orphan rows
const dUnrel = await api('sync', {
  body: {
    op: 'patch',
    ifMatchUpdatedAt: (g0Doc && g0Doc.updatedAt) || g0.json.updatedAt || '2026-11-27T08:00:00.000Z',
    patch: {
      mfg_web_store: {
        _deltaPatch: 1,
        minShellVer: SHELL,
        updatedAt: '2026-11-27T08:30:00.000Z',
        customRecords: {}
      }
    }
  },
  token: WTC_SALES
});
const d1MigratedRows = d1.rows('SELECT staff_key, payload_json FROM staff_biometrics ORDER BY staff_key');
const d1MigratedPin = d1MigratedRows[0] ? JSON.parse(d1MigratedRows[0].payload_json || '{}').pin : '';
const getBioAfterMig = await api('staff_biometrics', { method: 'GET', token: WTC_ENTRY });
const getBioKeys = Object.keys((getBioAfterMig.json && getBioAfterMig.json.staff_biometrics) || {});
assert('1c unrelated _deltaPatch by non-enrolling Sales seat migrates unnormalized staff_biometrics key without deleting payload or leaving orphan GET alias',
  dUnrel.status === 200 && d1MigratedRows.length === 1 && d1MigratedRows[0].staff_key === 'zztest mixed case' && d1MigratedPin === '1234' && getBioKeys.length === 1 && getBioKeys[0] === 'zztest mixed case',
  JSON.stringify({ d1MigratedRows, getBioKeys })
);

// 2. Non-delta patch with mixed-case staffBiometrics normalizes key & picks newest timestamp, and deletes unnormalized D1 row
const pPatch = await api('sync', {
  body: {
    op: 'patch',
    ifMatchUpdatedAt: (dUnrel.json && dUnrel.json.updatedAt) || '2026-11-27T08:30:00.000Z',
    patch: {
      mfg_web_store: {
        version: 1,
        updatedAt: '2026-11-27T09:05:00.000Z',
        minShellVer: SHELL,
        staffBiometrics: {
          '  Zztest  Mixed Case  ': {
            staff: 'Zztest Mixed Case',
            company: 'WTC',
            pin: '5678',
            faceSamples: [vecB],
            updated_at: '2026-11-27T09:00:00.000Z'
          },
          'ZZTEST_OTHER_CO': {
            staff: 'Zztest Other Co',
            company: 'Blanca',
            pin: '9999',
            faceSamples: [vecA],
            updated_at: '2026-11-27T09:05:00.000Z'
          }
        },
        customRecords: {},
        industryCustomRows: {},
        industryRowEdits: {}
      }
    }
  },
  token: WTC_ENTRY
});
assert('2a patch ok', pPatch.status === 200 && pPatch.json && pPatch.json.ok, JSON.stringify(pPatch));
const d1BioRows = d1.rows('SELECT staff_key, payload_json FROM staff_biometrics ORDER BY staff_key');
const d1BioPayload = d1BioRows[0] ? JSON.parse(d1BioRows[0].payload_json || '{}') : {};
assert('2b legacy unnormalized D1 row replaced cleanly and cross-BU rejected', d1BioRows.length === 1 && d1BioRows[0].staff_key === 'zztest mixed case' && d1BioPayload.pin === '5678', JSON.stringify(d1BioRows));

// 3. _deltaPatch normalizes mixed-case staffBiometrics key + _deletedBioKeys
const etagBeforeDelta = (g0Doc && g0Doc.updatedAt) || g0.json.updatedAt || '';
const g1 = await api('sync', { body: { doc: 'mfg_web_store', op: 'get_mfg' }, token: OWNER });
const g1Doc = g1.json && g1.json.docs && g1.json.docs.mfg_web_store;
const deltaRes = await api('sync', {
  body: {
    op: 'patch',
    ifMatchUpdatedAt: (g1Doc && g1Doc.updatedAt) || g1.json.updatedAt,
    patch: {
      mfg_web_store: {
        _deltaPatch: 1,
        minShellVer: SHELL,
        updatedAt: '2026-11-27T10:00:00.000Z',
        staffBiometrics: {
          '  Zztest  Delta Key ': {
            staff: 'Zztest Delta Key',
            company: 'WTC',
            pin: '4321',
            faceSamples: [vecA],
            updated_at: '2026-11-27T10:00:00.000Z'
          }
        },
        _deletedBioKeys: ['  Zztest  Mixed Case ']
      }
    }
  },
  token: OWNER
});
assert('3a delta_mfg ok', deltaRes.status === 200 && deltaRes.json && deltaRes.json.ok, JSON.stringify(deltaRes));
const g2 = await api('sync', { body: { doc: 'mfg_web_store', op: 'get_mfg' }, token: OWNER });
const g2Doc = g2.json && g2.json.docs && g2.json.docs.mfg_web_store;
const keysAfterDelta = Object.keys((g2Doc && g2Doc.staffBiometrics) || {});
assert('3b delta_mfg normalized added key and deleted normalized key', keysAfterDelta.includes('zztest delta key') && !keysAfterDelta.includes('zztest mixed case') && !keysAfterDelta.includes('  Zztest  Delta Key '), JSON.stringify(keysAfterDelta));
assert('3c delta updatedAt advanced', etagBeforeDelta !== ((g2Doc && g2Doc.updatedAt) || g2.json.updatedAt));

// 3d. Owner _deltaPatch strips non-object invalid staffBiometrics values so KV and D1 agree 1:1
const ownerInvalidRes = await api('sync', {
  body: {
    op: 'patch',
    ifMatchUpdatedAt: (g2Doc && g2Doc.updatedAt) || g2.json.updatedAt,
    patch: {
      mfg_web_store: {
        _deltaPatch: 1,
        minShellVer: SHELL,
        updatedAt: '2026-11-27T10:30:00.000Z',
        staffBiometrics: {
          '  Zztest  Null Entry ': null,
          '  Zztest  Scalar ': 'bad',
          '  Zztest  Clean Entry ': {
            staff: 'Zztest Clean Entry',
            company: 'WTC',
            pin: '7788',
            faceSamples: [vecB],
            updated_at: '2026-11-27T10:30:00.000Z'
          }
        }
      }
    }
  },
  token: OWNER
});
const g3 = await api('sync', { body: { doc: 'mfg_web_store', op: 'get_mfg' }, token: OWNER });
const bio3Keys = Object.keys((g3.json && g3.json.docs && g3.json.docs.mfg_web_store && g3.json.docs.mfg_web_store.staffBiometrics) || {});
assert('3d Owner _deltaPatch strips invalid null/scalar staffBiometrics entries while saving valid entry',
  ownerInvalidRes.status === 200 && bio3Keys.includes('zztest clean entry') && !bio3Keys.includes('zztest null entry') && !bio3Keys.includes('zztest scalar'),
  JSON.stringify(bio3Keys)
);

// 4. /api/kiosk_optical_diag GET/POST auth, Demo, validation, 413, /api/sync block
assert('4a isKioskOpticalDiagDoc matches prefix', isKioskOpticalDiagDoc('kiosk_optical_diag:wtc:dev1'));
const rUnauthGet = await api('kiosk_optical_diag', { method: 'GET', token: null });
assert('4b unauth GET 401', rUnauthGet.status === 401);
const rUnauthPost = await api('kiosk_optical_diag', { method: 'POST', token: null, body: { device_id: 'dev_alpha_01', company: 'WTC' } });
assert('4c unauth POST 401', rUnauthPost.status === 401);
const rDemoGet = await api('kiosk_optical_diag', { method: 'GET', token: null, headers: { 'X-ISABI-Demo': '1' } });
assert('4d demo GET empty 200', rDemoGet.status === 200 && rDemoGet.json && rDemoGet.json.demo === true && Array.isArray(rDemoGet.json.stations) && rDemoGet.json.stations.length === 0);
const rDemoPost = await api('kiosk_optical_diag', { method: 'POST', token: OWNER, headers: { 'X-ISABI-Demo': '1' }, body: { device_id: 'dev_alpha_01', company: 'WTC' } });
assert('4e demo POST 403', rDemoPost.status === 403);
const rSyncBlock = await api('sync', { body: { doc: 'kiosk_optical_diag:wtc:dev1', op: 'patch', patch: {} }, token: OWNER });
assert('4f /api/sync kiosk_optical_diag blocked 400', rSyncBlock.status === 400);
const rTooBig = await api('kiosk_optical_diag', { rawBody: JSON.stringify({ device_id: 'dev_alpha_01', company: 'WTC', site: 'x'.repeat(4200) }), token: OWNER });
assert('4g payload > 4KB rejected 413', rTooBig.status === 413);
const rBadDev = await api('kiosk_optical_diag', { body: { device_id: 'bad', company: 'WTC' }, token: OWNER });
assert('4h bad device_id 400', rBadDev.status === 400);
const rRlsDeny = await api('kiosk_optical_diag', { body: { device_id: 'dev_blanca_01', company: 'Blanca', site: 'Gate' }, token: WTC_ENTRY });
assert('4i cross-company POST 403', rRlsDeny.status === 403);

// 5. Post stations across industries -> test severity + frequency sort & company RLS filtering
const postSt = async (tok, payload) => api('kiosk_optical_diag', { body: payload, token: tok });
const p1 = await postSt(WTC_ENTRY, {
  device_id: 'dev_wtc_healthy_01', company: 'WTC', industry: 'Manufacturing', site: 'WTC Healthy Gate',
  scans_total: 40, punches_ok: 39, det_score_sum: 31.2, det_score_count: 40, det_low_light_count: 1,
  pad_spoof_count: 0, ambient_luma_sum: 4400, ambient_luma_count: 40, edge_verify_count: 5, edge_verify_ms_sum: 900, edge_verify_p95_ms: 250, hal_restarts: 0,
  bands: { day: { scans: 40, low_light: 1, pad_spoof: 0, small_face: 0 } }
});
const p2 = await postSt(WTC_ENTRY, {
  device_id: 'dev_wtc_warn_02', company: 'WTC', industry: 'Manufacturing', site: 'WTC Dim Door',
  scans_total: 25, punches_ok: 20, det_score_sum: 11.2, det_score_count: 25, det_low_light_count: 10,
  pad_spoof_count: 1, ambient_luma_sum: 950, ambient_luma_count: 25, edge_verify_count: 4, edge_verify_ms_sum: 1200, edge_verify_p95_ms: 420, hal_restarts: 0,
  bands: { dawn: { scans: 18, low_light: 9, pad_spoof: 1, small_face: 0 } }
});
const p3 = await postSt(BLANCA_SUP, {
  device_id: 'dev_blanca_crit_01', company: 'Blanca', industry: 'Hospitality & Resorts', site: 'Blanca Pool Gate',
  scans_total: 12, punches_ok: 7, det_score_sum: 7.1, det_score_count: 12, det_low_light_count: 1,
  pad_spoof_count: 5, ambient_luma_sum: 1900, ambient_luma_count: 12, edge_verify_count: 3, edge_verify_ms_sum: 1500, edge_verify_p95_ms: 600, hal_restarts: 4,
  bands: { day: { scans: 12, low_light: 1, pad_spoof: 5, small_face: 0 } }
});
assert('5a 3 stations posted ok', p1.status === 200 && p2.status === 200 && p3.status === 200, JSON.stringify({ p1: p1.status, p2: p2.status, p3: p3.status }));

const ownerList = await api('kiosk_optical_diag', { method: 'GET', token: OWNER });
const stAll = (ownerList.json && ownerList.json.stations) || [];
assert('5b owner sees all 3 stations sorted crit -> warn -> healthy',
  stAll.length === 3 &&
  stAll[0].device_id === 'dev_blanca_crit_01' && stAll[0].health_level === 'crit' &&
  stAll[1].device_id === 'dev_wtc_warn_02' && stAll[1].health_level === 'warn' &&
  stAll[2].device_id === 'dev_wtc_healthy_01' && stAll[2].health_level === 'healthy',
  JSON.stringify(stAll.map(s => ({ id: s.device_id, h: s.health_level })))
);

const wtcList = await api('kiosk_optical_diag', { method: 'GET', token: WTC_SUP });
const stWtc = (wtcList.json && wtcList.json.stations) || [];
assert('5c WTC Sup sees only WTC stations (RLS)', stWtc.length === 2 && stWtc.every(s => s.company === 'WTC'), JSON.stringify(stWtc.map(s => s.company)));

// 6. Reset RBAC: Entry denied 403, Supervisor allowed 200, cross-company Supervisor denied 403
const rstEntry = await postSt(WTC_ENTRY, { action: 'reset', device_id: 'dev_wtc_warn_02', company: 'WTC' });
assert('6a Entry reset denied 403', rstEntry.status === 403);
const rstCross = await postSt(WTC_SUP, { action: 'reset', device_id: 'dev_blanca_crit_01', company: 'Blanca' });
assert('6b Cross-company reset denied 403', rstCross.status === 403);
const rstSup = await postSt(WTC_SUP, { action: 'reset', device_id: 'dev_wtc_warn_02', company: 'WTC' });
assert('6c WTC Sup reset ok 200', rstSup.status === 200 && rstSup.json && rstSup.json.reset === true);

const afterReset = await api('kiosk_optical_diag', { method: 'GET', token: OWNER });
const stAfter = (afterReset.json && afterReset.json.stations) || [];
assert('6d reset station removed cleanly', stAfter.length === 2 && !stAfter.some(s => s.device_id === 'dev_wtc_warn_02'));

// 7. Helper unit sanity (diagnoseKioskOpticalHealthRank & listKioskOpticalDiagRows retention)
assert('7a baseline rank for low scan count', diagnoseKioskOpticalHealthRank({ scans_total: 2, hal_restarts: 0 }).level === 'baseline');
const filteredStale = listKioskOpticalDiagRows([
  { payload_json: JSON.stringify({ company: 'Lions Transport', device_id: 'd_stale', scans_total: 20, reported_at: new Date(Date.now() - 40 * 86400000).toISOString() }) },
  { payload_json: JSON.stringify({ company: '4235 Company S.A.L.', device_id: 'd_fresh', scans_total: 20, reported_at: new Date().toISOString() }) }
], Date.now());
assert('7b 30d retention drops stale row and keeps 4235 Company S.A.L.', filteredStale.length === 1 && filteredStale[0].device_id === 'd_fresh');

console.log(`verify_kiosk_optical_diag_edge: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
