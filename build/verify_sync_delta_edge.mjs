// Offline gate for:
//   1. [[route]].js 64 MB /app/api/sync body limit (legacy bloated client unsticking) while non-sync routes enforce 16 MB (413).
//   2. Server-side shift-backfill bloated at_<12hex> pruning + retiredDropped.attendance merge parity + preservation of
//      voided, modified_by, manual_override, non-2026-11-24T13:2* _pre_void_edits, and at-* rows.
//   3. deltaSyncV1 wire protocol (_deltaPatch: 1): Manufacturing (customRecords) + all 5 sibling industries
//      (industryCustomRows + industryRowEdits), deletions (_deletedCrIds, _deletedIndRowIds, _deletedIndEditKeys),
//      CAS conflict: true retry + deltaSyncV1: true, 400 delta_requires_if_match / delta_unsupported_doc, wire-key stripping.
//   4. Negative RLS & Role Write Lock boundaries on delta mutations/deletions.
// Uses in-memory node:sqlite (Node 22.5+). Touches nothing live.
// Run: node build/verify_sync_delta_edge.mjs

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequest } from '../functions/app/api/[[route]].js';
import { signEdgeSession } from '../functions/_lib/security.js';
import { effectiveMinSyncShellVer, handleSync } from '../functions/_lib/d1_store.js';
import { DEPLOYED_SHELL_VER } from '../functions/_lib/deployed_shell.js';

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
  one(sql, ...p) { return this.db.prepare(sql).get(...p) || null; }
  rows(sql, ...p) { return this.db.prepare(sql).all(...p); }
}

const SCHEMA_SQL = readFileSync(new URL('../migrations/0001_schema.sql', import.meta.url), 'utf8');
const d1 = new D1();
d1.exec(SCHEMA_SQL);

const env = {
  DB: d1,
  ISABI_JWT_SECRET: 'sync-delta-edge-offline-test-secret-' + Math.random().toString(36).slice(2)
};

const seat = async (id, name, email, role, cos) => {
  d1.db.prepare('INSERT INTO users (id, full_name, email, role, companies) VALUES (?,?,?,?,?)').run(id, name, email, role, cos);
  d1.db.prepare('INSERT INTO auth_sessions (id, user_id, email, full_name, role, companies) VALUES (?,?,?,?,?,?)').run('sess-' + id, id, email, name, role, cos);
  return signEdgeSession({ sid: 'sess-' + id, sub: id, email, name, role, companies: cos }, env);
};

const OWNER_TOK = await seat('u1', 'Owner Seat', 'owner@example.test', 'Full Access (Owner)', 'All');
const WTC_ENTRY_TOK = await seat('u7', 'WTC Entry', 'wtc.entry@example.test', 'Entry', 'WTC');
const VIEWER_TOK = await seat('u8', 'WTC Viewer', 'wtc.viewer@example.test', 'Read-Only Viewer', 'WTC');

const SHELL = effectiveMinSyncShellVer() || DEPLOYED_SHELL_VER || '19.6.440';

async function api(routePath, { method = 'POST', body, rawBody, token = OWNER_TOK, headers = {} } = {}) {
  const tasks = [];
  const raw = rawBody !== undefined ? rawBody : (body !== undefined ? JSON.stringify(body) : undefined);
  const h = Object.assign({
    'Content-Type': 'application/json',
    'CF-Connecting-IP': '10.9.0.5',
    'X-ISABI-Shell': SHELL,
    'X-ISABI-Session': token
  }, headers);
  const req = new Request(`https://example.test/app/api/${routePath}`, { method, headers: h, body: raw });
  const res = await onRequest({
    request: req,
    env,
    params: { route: routePath.split('?')[0].split('/') },
    waitUntil: p => tasks.push(p)
  });
  await Promise.all(tasks);
  const txt = await res.text();
  let json = null;
  try { json = JSON.parse(txt); } catch (_) {}
  return { status: res.status, json, txt };
}

function readStoredMfgDoc() {
  const rows = d1.rows(
    "SELECT doc_key, payload_json, updated_at FROM edge_kv_store WHERE doc_key = 'mfg_web_store' OR doc_key LIKE 'mfg_web_store__part_%' ORDER BY doc_key ASC"
  );
  if (!rows.length) return null;
  const head = rows.find(r => r.doc_key === 'mfg_web_store');
  if (!head) return null;
  const joined = String(head.payload_json || '') + rows.filter(r => r.doc_key !== 'mfg_web_store').map(r => String(r.payload_json || '')).join('');
  return { updated_at: head.updated_at, doc: JSON.parse(joined), chars: joined.length, chunks: rows.length };
}

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail !== undefined ? '  -> ' + JSON.stringify(detail).slice(0, 1400) : ''}`);
  }
}

console.log('\n[1. 64MB /sync route ceiling vs 16MB non-sync route ceiling & bloated att pruning]');
{
  // Build ~18 MB legacy push with 500 bloated shift-backfill at_<12hex> rows (padded note to push total > 17 MB)
  // plus 4 preserved attendance rows and 1 retired sys-topup row in customRecords.sales_tickets.
  const padText = 'X'.repeat(34000); // ~34 KB * 500 = ~17 MB raw JSON
  const bloatedAtt = [];
  for (let i = 0; i < 500; i++) {
    const hex = i.toString(16).padStart(12, '0');
    bloatedAtt.push({
      id: `at_${hex}`,
      company: 'WTC',
      date: '2026-10-05',
      staff: `Staff ${i}`,
      _pre_void_edits: [{ at: '2026-11-24T13:26:15.123Z', by: 'System', pad: padText }]
    });
  }
  const keepVoided = {
    id: 'at_aaaaaaaa0001',
    company: 'WTC',
    date: '2026-10-05',
    staff: 'Kept Voided',
    voided: true,
    void_reason: 'Duplicate entry from roster import',
    voided_by: 'owner@example.test',
    voided_at: '2026-11-20T10:00:00Z',
    _pre_void_edits: [{ at: '2026-11-24T13:26:15.123Z', by: 'System' }]
  };
  const keepHumanMod = {
    id: 'at_aaaaaaaa0002',
    company: 'WTC',
    date: '2026-10-06',
    staff: 'ZzTestStaffAlpha',
    modified_by: 'zztest.editor@example.test',
    modified_at: '2026-11-24T14:00:00Z',
    _pre_void_edits: [{ at: '2026-11-24T13:26:15.123Z', by: 'System' }]
  };
  const keepManualOvr = {
    id: 'at_aaaaaaaa0003',
    company: 'WTC',
    date: '2026-10-07',
    staff: 'ZzTestStaffBeta',
    manual_override: true,
    _pre_void_edits: [{ at: '2026-11-24T13:26:15.123Z', by: 'System' }]
  };
  const keepEarlierEdit = {
    id: 'at_aaaaaaaa0004',
    company: 'WTC',
    date: '2026-10-08',
    staff: 'ZzTestOtherDayEdit',
    _pre_void_edits: [{ at: '2026-11-22T09:10:00.000Z', by: 'owner@example.test' }]
  };
  const keepAppRow = {
    id: 'at-1732500001-01',
    company: 'WTC',
    date: '2026-11-25',
    staff: 'ZzTestStaffGamma',
    source: 'app',
    notes: 'Held entry finally lands'
  };
  const delAppRow = {
    id: 'at-app-del-1',
    company: 'WTC',
    date: '2026-11-25',
    staff: 'Temp App',
    source: 'app',
    notes: 'To be deleted by Owner delta'
  };

  // Seed _retiredSysTopupIds via build_ticket session (just as live top-up does) so we test merged retiredDropped alongside pruned bloated attendance
  const btTasks = [];
  const btBody = {
    op: 'patch',
    key: '',
    patch: {
      mfg_web_store: {
        minShellVer: SHELL,
        updatedAt: '2026-11-25T10:00:00.000Z',
        updatedBy: 'build@example.test',
        _retiredSysTopupIds: ['st-old-topup-1'],
        customRecords: {
          sales_tickets: [{ id: 'st-wtc-base', company: 'WTC', date: '2026-11-24', total: 100 }],
          attendance: [keepVoided, keepHumanMod, keepManualOvr, keepEarlierEdit, keepAppRow, delAppRow]
        },
        industryCustomRows: {
          holding_ledger: [{ id: 'hold-1', company: 'Holding', amount: 500 }],
          hospitality_pos: [{ id: 'hosp-1', company: 'La Una', amount: 200 }],
          trading_sales: [{ id: 'trd-1', company: 'Korri Auto', amount: 300 }],
          realestate_leases: [{ id: 're-1', company: 'Properties', amount: 400 }],
          insurance_policies: [{ id: 'ins-1', company: 'Brokerage', amount: 150 }],
          bbconstruction_keep: [{ id: 'bbc-1', company: 'BBConstruction', amount: 900 }]
        },
        industryRowEdits: {
          'bbc_seed_1': { id: 'bbc_seed_1', company: 'BBConstruction', rev: 1, notes: 'BBC intact' },
          'wtc_seed_1': { id: 'wtc_seed_1', company: 'WTC', rev: 1, notes: 'WTC seed' },
          'wtc_del_edit_1': { id: 'wtc_del_edit_1', company: 'WTC', rev: 1, notes: 'Will be deleted by Owner delta' },
          'WF::statement_watermark::WTC::2026-11': { id: 'WF::statement_watermark::WTC::2026-11', company: 'WTC', watermark_seq: 9, updated_at: '2026-11-24T08:00:00Z' }
        },
        kioskPunches: [
          { id: 'kp-keep-1', company: 'WTC', staff: 'ZzTestStaffGamma', date: '2026-11-25', direction: 'IN', time: '08:00', punched_at: '2026-11-25T08:00:00Z' },
          { id: 'kp-del-1', company: 'WTC', staff: 'Temp', date: '2026-11-25', direction: 'IN', time: '09:00', punched_at: '2026-11-25T09:00:00Z' }
        ],
        staffBiometrics: {
          'wtc|zzteststaffgamma': { company: 'WTC', staff: 'ZzTestStaffGamma', face_enrolled: true, updated_at: '2026-11-25T08:00:00Z' },
          'wtc|old temp': { company: 'WTC', staff: 'Old Temp', face_enrolled: true, updated_at: '2026-11-25T07:00:00Z' }
        },
        sentinelReviews: {
          'sr-keep-1': { company: 'WTC', status: 'reviewed', updated_at: '2026-11-25T08:00:00Z' },
          'sr-del-1': { company: 'WTC', status: 'reviewed', updated_at: '2026-11-25T07:00:00Z' }
        },
        partyHygiene: {
          rules: {
            'Manufacturing::customer::alpha': { industry: 'Manufacturing', kind: 'customer', alias: 'Alpha', canonical: 'Alpha Co', status: 'confirmed', updated_at: '2026-11-25T08:00:00Z' },
            'Manufacturing::customer::beta': { industry: 'Manufacturing', kind: 'customer', alias: 'Beta', canonical: 'Beta Co', status: 'dismissed', updated_at: '2026-11-25T07:00:00Z' }
          }
        }
      }
    }
  };
  const btRes = await handleSync(
    new Request('https://example.test/app/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ISABI-Shell': SHELL }, body: JSON.stringify(btBody) }),
    env,
    { sub: 'build', role: 'Owner', companies: 'ALL', email: 'build@example.test', build_ticket: true },
    btBody,
    { waitUntil: p => btTasks.push(p) }
  );
  await Promise.all(btTasks);
  const seedInit = { status: btRes.status, json: await btRes.json() };
  ok('1a. baseline seed write succeeds & advertises deltaSyncV1: true', seedInit.status === 200 && seedInit.json?.ok === true && seedInit.json?.deltaSyncV1 === true, seedInit.json);

  // Now send an >17 MB bloated push carrying all 500 bloated attendance rows + the held at-* row + retired st-old-topup-1
  const bigDoc = {
    minShellVer: SHELL,
    updatedAt: '2026-11-25T10:01:00.000Z',
    updatedBy: 'owner@example.test',
    customRecords: {
      sales_tickets: [
        { id: 'st-wtc-base', company: 'WTC', date: '2026-11-24', total: 100 },
        { id: 'st-old-topup-1', company: 'WTC', date: '2026-11-20', total: 50, voided: true, void_reason: 'Topped up in workbook', voided_by: 'system-topup', voided_at: '2026-11-21T08:00:00Z' }
      ],
      attendance: [...bloatedAtt, keepVoided, keepHumanMod, keepManualOvr, keepEarlierEdit, keepAppRow, delAppRow]
    },
    industryCustomRows: {
      holding_ledger: [{ id: 'hold-1', company: 'Holding', amount: 500 }],
      hospitality_pos: [{ id: 'hosp-1', company: 'La Una', amount: 200 }],
      trading_sales: [{ id: 'trd-1', company: 'Korri Auto', amount: 300 }],
      realestate_leases: [{ id: 're-1', company: 'Properties', amount: 400 }],
      insurance_policies: [{ id: 'ins-1', company: 'Brokerage', amount: 150 }],
      bbconstruction_keep: [{ id: 'bbc-1', company: 'BBConstruction', amount: 900 }]
    },
    industryRowEdits: {
      'bbc_seed_1': { id: 'bbc_seed_1', company: 'BBConstruction', rev: 1, notes: 'BBC intact' },
      'wtc_seed_1': { id: 'wtc_seed_1', company: 'WTC', rev: 1, notes: 'WTC seed' },
      'wtc_del_edit_1': { id: 'wtc_del_edit_1', company: 'WTC', rev: 1, notes: 'Will be deleted by Owner delta' },
      'WF::statement_watermark::WTC::2026-11': { id: 'WF::statement_watermark::WTC::2026-11', company: 'WTC', watermark_seq: 9, updated_at: '2026-11-24T08:00:00Z' }
    },
    kioskPunches: [
      { id: 'kp-keep-1', company: 'WTC', staff: 'ZzTestStaffGamma', date: '2026-11-25', direction: 'IN', time: '08:00', punched_at: '2026-11-25T08:00:00Z' },
      { id: 'kp-del-1', company: 'WTC', staff: 'Temp', date: '2026-11-25', direction: 'IN', time: '09:00', punched_at: '2026-11-25T09:00:00Z' }
    ],
    staffBiometrics: {
      'wtc|zzteststaffgamma': { company: 'WTC', staff: 'ZzTestStaffGamma', face_enrolled: true, updated_at: '2026-11-25T08:00:00Z' },
      'wtc|old temp': { company: 'WTC', staff: 'Old Temp', face_enrolled: true, updated_at: '2026-11-25T07:00:00Z' }
    },
    sentinelReviews: {
      'sr-keep-1': { company: 'WTC', status: 'reviewed', updated_at: '2026-11-25T08:00:00Z' },
      'sr-del-1': { company: 'WTC', status: 'reviewed', updated_at: '2026-11-25T07:00:00Z' }
    },
    partyHygiene: {
      rules: {
        'Manufacturing::customer::alpha': { industry: 'Manufacturing', kind: 'customer', alias: 'Alpha', canonical: 'Alpha Co', status: 'confirmed', updated_at: '2026-11-25T08:00:00Z' },
        'Manufacturing::customer::beta': { industry: 'Manufacturing', kind: 'customer', alias: 'Beta', canonical: 'Beta Co', status: 'dismissed', updated_at: '2026-11-25T07:00:00Z' }
      }
    }
  };
  const bigRaw = JSON.stringify({ op: 'patch', key: '', ackOnly: true, patch: { mfg_web_store: bigDoc } });
  const bigBytes = Buffer.byteLength(bigRaw, 'utf8');
  ok(`1b. prepared realistic bloated /sync body (${(bigBytes / 1048576).toFixed(2)} MB > 16 MB)`, bigBytes > 16777216 && bigBytes < 67108864);

  const bigRes = await api('sync', { rawBody: bigRaw });
  const storedAfterPrune = readStoredMfgDoc();
  const attIds = new Set((storedAfterPrune?.doc?.customRecords?.attendance || []).map(r => r.id));
  const droppedAtt = bigRes.json?.retiredDropped?.attendance || [];
  const droppedSt = bigRes.json?.retiredDropped?.sales_tickets || [];

  ok('1c. >16MB /app/api/sync succeeds (64MB ceiling) & returns deltaSyncV1: true', bigRes.status === 200 && bigRes.json?.ok === true && bigRes.json?.deltaSyncV1 === true, { status: bigRes.status, json: bigRes.json });
  ok('1d. server auto-pruned all 500 bloated at_<12hex> rows & returned retiredDropped.attendance + retiredDropped.sales_tickets',
    droppedAtt.length === 500 && droppedSt.includes('st-old-topup-1') && storedAfterPrune.chars < 100000,
    { droppedAttLen: droppedAtt.length, droppedSt, storedChars: storedAfterPrune?.chars });
  ok('1e. voided, modified_by, manual_override, earlier-edited at_<12hex> & app at-* rows are preserved',
    attIds.size === 6
    && attIds.has('at_aaaaaaaa0001')
    && attIds.has('at_aaaaaaaa0002')
    && attIds.has('at_aaaaaaaa0003')
    && attIds.has('at_aaaaaaaa0004')
    && attIds.has('at-1732500001-01')
    && attIds.has('at-app-del-1'),
    Array.from(attIds));

  // Non-sync routes still enforce the 16 MB limit
  const nonSyncBig = JSON.stringify({ device_id: 'devaaaaaaaa', count: 1, pad: 'Y'.repeat(16850000) });
  const nonSyncRes = await api('device_unsent', { rawBody: nonSyncBig });
  ok('1f. non-/sync route (>16MB) still returns HTTP 413', nonSyncRes.status === 413, nonSyncRes);
}

console.log('\n[2. deltaSyncV1 guards, cross-industry add/edit/delete & CAS retry]');
{
  const g1 = await api('sync', { body: { op: 'get_mfg', doc: 'mfg_web_store' } });
  const baseTs = g1.json?.updatedAt || g1.json?.docs?.mfg_web_store?.updatedAt;
  ok('2a. get_mfg returns deltaSyncV1: true and updatedAt', g1.status === 200 && g1.json?.deltaSyncV1 === true && Boolean(baseTs), { deltaSyncV1: g1.json?.deltaSyncV1, baseTs });

  const etag = g1.json?.etag;
  const g304 = await api('sync', { body: { op: 'get_mfg', doc: 'mfg_web_store', ifNoneMatchEtag: etag } });
  ok('2b. conditional get_mfg (notModified) also advertises deltaSyncV1: true', g304.status === 200 && g304.json?.notModified === true && g304.json?.deltaSyncV1 === true, g304.json);

  // Guard checks
  const noCas = await api('sync', { body: { op: 'patch', key: '', patch: { mfg_web_store: { _deltaPatch: 1, minShellVer: SHELL, customRecords: {} } } } });
  ok('2c. _deltaPatch without ifMatchUpdatedAt -> 400 delta_requires_if_match', noCas.status === 400 && noCas.json?.code === 'delta_requires_if_match', noCas);

  const badDoc = await api('sync', { body: { op: 'patch', key: '', ifMatchUpdatedAt: baseTs, patch: { other_doc_key: { _deltaPatch: 1, foo: 1 } } } });
  ok('2d. _deltaPatch on non-mfg_web_store doc -> 400 delta_unsupported_doc', badDoc.status === 400 && badDoc.json?.code === 'delta_unsupported_doc', badDoc);

  // Delta patch touching Manufacturing + all 5 sibling industries + deleting a customRow & edit key
  const delta1 = await api('sync', {
    body: {
      op: 'patch',
      key: '',
      ackOnly: true,
      ifMatchUpdatedAt: baseTs,
      patch: {
        mfg_web_store: {
          _deltaPatch: 1,
          minShellVer: SHELL,
          updatedAt: '2026-11-25T10:05:00.000Z',
          updatedBy: 'owner@example.test',
          customRecords: {
            attendance: [
              { id: 'at-1732500002-02', company: 'WTC', date: '2026-11-25', staff: 'ZzTestStaffDelta', source: 'app', notes: 'New delta entry' }
            ]
          },
          _deletedCrIds: {
            attendance: ['at_aaaaaaaa0004', 'at-app-del-1']
          },
          industryCustomRows: {
            holding_ledger: [{ id: 'hold-2', company: 'Holding', amount: 750 }],
            hospitality_pos: [{ id: 'hosp-1', company: 'La Una', amount: 225 }],
            trading_sales: [{ id: 'trd-2', company: 'Shacman', amount: 880 }],
            realestate_leases: [{ id: 're-2', company: '4235 Company', amount: 610 }],
            insurance_policies: [{ id: 'ins-2', company: 'Brokerage', amount: 340 }]
          },
          _deletedIndRowIds: {
            trading_sales: ['trd-1']
          },
          industryRowEdits: {
            'wtc_seed_1': { id: 'wtc_seed_1', company: 'WTC', rev: 2, notes: 'WTC delta edited' }
          },
          _deletedIndEditKeys: ['wtc_del_edit_1'],
          _deletedPunchIds: ['kp-del-1'],
          _deletedBioKeys: ['wtc|old temp'],
          _deletedSrKeys: ['sr-del-1'],
          partyHygiene: {
            rules: {
              'Manufacturing::customer::beta': { industry: 'Manufacturing', kind: 'customer', alias: 'Beta', canonical: 'Beta Co', status: 'undone', updated_at: '2026-11-25T10:05:00Z' }
            }
          }
        }
      }
    }
  });
  const s1 = readStoredMfgDoc();
  const s1CrAtt = (s1.doc.customRecords.attendance || []).map(r => r.id);
  const s1Hold = (s1.doc.industryCustomRows.holding_ledger || []).map(r => r.id);
  const s1Hosp = s1.doc.industryCustomRows.hospitality_pos || [];
  const s1Trd = (s1.doc.industryCustomRows.trading_sales || []).map(r => r.id);
  const s1PunchIds = (s1.doc.kioskPunches || []).map(p => p.id);
  const hasWireKeys = ['_deltaPatch', '_deletedCrIds', '_deletedIndRowIds', '_deletedIndEditKeys', '_deletedPunchIds', '_deletedBioKeys', '_deletedSrKeys', '_deletedPhKeys']
    .some(k => Object.prototype.hasOwnProperty.call(s1.doc, k));

  const d1AttRows = new Set(d1.rows('SELECT id FROM attendance WHERE COALESCE(voided,0) = 0').map(r => r.id));
  const d1TrdRows = new Set(d1.rows("SELECT row_id FROM industry_custom_rows WHERE bucket = 'trading_sales' AND COALESCE(voided,0) = 0").map(r => r.row_id));
  const d1IreKeys = new Set(d1.rows('SELECT edit_key FROM industry_row_edits').map(r => r.edit_key));
  const d1PunchRows = new Set(d1.rows('SELECT id FROM kiosk_punches').map(r => r.id));
  const d1BioKeys = new Set(d1.rows('SELECT staff_key FROM staff_biometrics').map(r => r.staff_key));
  const d1SrKeys = new Set(d1.rows('SELECT id FROM sentinel_reviews').map(r => r.id));

  ok('2e. delta patch applied across Manufacturing + 5 sibling industries, all 7 _deleted* maps, D1 SQL mirror & stripped wire keys',
    delta1.status === 200
    && delta1.json?.ok === true
    && delta1.json?.deltaSyncV1 === true
    && !hasWireKeys
    && s1CrAtt.includes('at-1732500002-02')
    && s1CrAtt.includes('at-1732500001-01')
    && !s1CrAtt.includes('at_aaaaaaaa0004')
    && !s1CrAtt.includes('at-app-del-1')
    && s1.doc.customRecords.sales_tickets?.some(r => r.id === 'st-wtc-base')
    && s1Hold.includes('hold-1') && s1Hold.includes('hold-2')
    && s1Hosp.find(r => r.id === 'hosp-1')?.amount === 225
    && !s1Trd.includes('trd-1') && s1Trd.includes('trd-2')
    && (s1.doc.industryCustomRows.realestate_leases || []).some(r => r.id === 're-2')
    && (s1.doc.industryCustomRows.insurance_policies || []).some(r => r.id === 'ins-2')
    && s1.doc.industryRowEdits?.wtc_seed_1?.notes === 'WTC delta edited'
    && !Object.prototype.hasOwnProperty.call(s1.doc.industryRowEdits || {}, 'wtc_del_edit_1')
    && s1.doc.industryRowEdits?.bbc_seed_1?.notes === 'BBC intact'
    && s1PunchIds.includes('kp-keep-1') && !s1PunchIds.includes('kp-del-1')
    && Boolean(s1.doc.staffBiometrics?.['wtc|zzteststaffgamma']) && !s1.doc.staffBiometrics?.['wtc|old temp']
    && Boolean(s1.doc.sentinelReviews?.['sr-keep-1']) && !s1.doc.sentinelReviews?.['sr-del-1']
    && s1.doc.partyHygiene?.rules?.['Manufacturing::customer::alpha']?.status === 'confirmed'
    && s1.doc.partyHygiene?.rules?.['Manufacturing::customer::beta']?.status === 'undone'
    && d1AttRows.has('at-1732500002-02') && !d1AttRows.has('at-app-del-1') && d1AttRows.has('at_aaaaaaaa0004')
    && !d1TrdRows.has('trd-1') && d1TrdRows.has('trd-2')
    && d1IreKeys.has('wtc_seed_1') && !d1IreKeys.has('wtc_del_edit_1')
    && d1PunchRows.has('kp-keep-1')
    && d1BioKeys.has('wtc|zzteststaffgamma') && !d1BioKeys.has('wtc|old temp')
    && d1SrKeys.has('sr-keep-1') && !d1SrKeys.has('sr-del-1'),
    {
      delta1: delta1.json, s1CrAtt, s1Hold, s1Trd, hasWireKeys,
      d1IreKeys: Array.from(d1IreKeys), d1AttRows: Array.from(d1AttRows),
      d1TrdRows: Array.from(d1TrdRows), d1PunchRows: Array.from(d1PunchRows),
      d1BioKeys: Array.from(d1BioKeys), d1SrKeys: Array.from(d1SrKeys),
      s1PunchIds, bio: Object.keys(s1.doc.staffBiometrics || {}), sr: Object.keys(s1.doc.sentinelReviews || {}), ph: Object.keys(s1.doc.partyHygiene?.rules || {})
    });

  // Over 64 MB /app/api/sync still rejected with 413
  const tooBigRaw = JSON.stringify({ op: 'patch', key: '', patch: { mfg_web_store: { pad: 'Z'.repeat(67109000) } } });
  const over64Res = await api('sync', { rawBody: tooBigRaw });
  ok('2g. >64MB /app/api/sync payload returns HTTP 413', over64Res.status === 413, { status: over64Res.status });

  // Torn/unreadable mfg_web_store rejects _deltaPatch with conflict: true + deltaSyncV1: true + storeUnreadable: true cleanly
  const savedHeadBeforeTorn = d1.one('SELECT payload_json, updated_at, updated_by, rev FROM edge_kv_store WHERE doc_key = ?', 'mfg_web_store');
  d1.db.prepare("UPDATE edge_kv_store SET payload_json = '{BROKEN_JSON' WHERE doc_key = 'mfg_web_store'").run();
  const tornRes = await api('sync', {
    body: {
      op: 'patch',
      key: '',
      ifMatchUpdatedAt: s1.updated_at,
      patch: { mfg_web_store: { _deltaPatch: 1, minShellVer: SHELL, updatedAt: '2026-11-25T10:07:00.000Z', customRecords: {} } }
    }
  });
  d1.db.prepare('UPDATE edge_kv_store SET payload_json = ?, updated_at = ?, updated_by = ?, rev = ? WHERE doc_key = ?')
    .run(savedHeadBeforeTorn.payload_json, savedHeadBeforeTorn.updated_at, savedHeadBeforeTorn.updated_by, savedHeadBeforeTorn.rev, 'mfg_web_store');
  ok('2h. _deltaPatch against unreadable mfg_web_store returns conflict: true, deltaSyncV1: true & storeUnreadable: true without crash',
    tornRes.status === 200 && tornRes.json?.conflict === true && tornRes.json?.deltaSyncV1 === true && tornRes.json?.storeUnreadable === true,
    tornRes.json);

  // Stale CAS check returns conflict: true + deltaSyncV1: true + fresh doc
  const casMiss = await api('sync', {
    body: {
      op: 'patch',
      key: '',
      ackOnly: true,
      ifMatchUpdatedAt: baseTs, // stale!
      patch: {
        mfg_web_store: {
          _deltaPatch: 1,
          minShellVer: SHELL,
          updatedAt: '2026-11-25T10:06:00.000Z',
          customRecords: {}
        }
      }
    }
  });
  ok('2f. stale delta patch returns conflict: true, deltaSyncV1: true & fresh updatedAt',
    casMiss.status === 200
    && casMiss.json?.conflict === true
    && casMiss.json?.deltaSyncV1 === true
    && casMiss.json?.updatedAt === s1.updated_at,
    casMiss.json);
}

console.log('\n[3. Negative RLS & Read-Only boundary on delta deletes/mutations]');
{
  const gWtc = await api('sync', { token: WTC_ENTRY_TOK, body: { op: 'get_mfg', doc: 'mfg_web_store' } });
  const wtcTs = gWtc.json?.updatedAt || gWtc.json?.docs?.mfg_web_store?.updatedAt;

  // WTC Entry seat attempts to delete BBConstruction custom row & industry row edit via delta wire keys + inject a cross-BU row
  const rlsTry = await api('sync', {
    token: WTC_ENTRY_TOK,
    body: {
      op: 'patch',
      key: '',
      ackOnly: true,
      ifMatchUpdatedAt: wtcTs,
      patch: {
        mfg_web_store: {
          _deltaPatch: 1,
          minShellVer: SHELL,
          updatedAt: '2026-11-25T10:10:00.000Z',
          updatedBy: 'wtc.entry@example.test',
          customRecords: {
            attendance: [
              { id: 'at-wtc-valid-1', company: 'WTC', date: '2026-11-25', staff: 'WTC Staff', source: 'app' },
              { id: 'at-bbc-forged-1', company: 'BBConstruction', date: '2026-11-25', staff: 'Forged', source: 'app' }
            ]
          },
          industryCustomRows: {},
          _deletedIndRowIds: {
            bbconstruction_keep: ['bbc-1'],
            holding_ledger: ['hold-1']
          },
          _deletedIndEditKeys: ['bbc_seed_1', 'WF::statement_watermark::WTC::2026-11']
        }
      }
    }
  });
  const afterRls = readStoredMfgDoc();
  const attIds = new Set((afterRls.doc.customRecords.attendance || []).map(r => r.id));
  const bbcRows = (afterRls.doc.industryCustomRows.bbconstruction_keep || []).map(r => r.id);
  const holdRows = (afterRls.doc.industryCustomRows.holding_ledger || []).map(r => r.id);

  ok('3a. WTC Entry seat can push its own WTC row via delta patch while cross-BU injection, cross-BU/sibling deletes & guarded WF deletes are blocked',
    rlsTry.status === 200
    && attIds.has('at-wtc-valid-1')
    && !attIds.has('at-bbc-forged-1')
    && bbcRows.includes('bbc-1')
    && holdRows.includes('hold-1')
    && afterRls.doc.industryRowEdits?.bbc_seed_1?.notes === 'BBC intact'
    && afterRls.doc.industryRowEdits?.['WF::statement_watermark::WTC::2026-11']?.watermark_seq === 9,
    { rlsTry: rlsTry.json, attIds: Array.from(attIds), bbcRows, holdRows });

  // WTC Entry seat attempts to hard-delete its OWN WTC existing customRecords row -> reverted by enforceSyncRoleWriteLocks
  const gWtc2 = await api('sync', { token: WTC_ENTRY_TOK, body: { op: 'get_mfg', doc: 'mfg_web_store' } });
  const wtcTs2 = gWtc2.json?.updatedAt || gWtc2.json?.docs?.mfg_web_store?.updatedAt;
  const entryOwnDel = await api('sync', {
    token: WTC_ENTRY_TOK,
    body: {
      op: 'patch',
      key: '',
      ackOnly: true,
      ifMatchUpdatedAt: wtcTs2,
      patch: {
        mfg_web_store: {
          _deltaPatch: 1,
          minShellVer: SHELL,
          updatedAt: '2026-11-25T10:12:00.000Z',
          updatedBy: 'wtc.entry@example.test',
          customRecords: {},
          _deletedCrIds: { attendance: ['at-wtc-valid-1'] },
          industryCustomRows: {}
        }
      }
    }
  });
  const afterOwnDel = readStoredMfgDoc();
  const attAfterOwnDel = new Set((afterOwnDel.doc.customRecords.attendance || []).map(r => r.id));
  ok('3a-neg. WTC Entry seat cannot hard-delete existing WTC row via _deletedCrIds (reverted by Role Write Locks)',
    entryOwnDel.status === 200 && attAfterOwnDel.has('at-wtc-valid-1'),
    { entryOwnDel: entryOwnDel.json, hasRow: attAfterOwnDel.has('at-wtc-valid-1') });

  // Read-Only Viewer attempts to add/delete via delta patch
  const gView = await api('sync', { token: VIEWER_TOK, body: { op: 'get_mfg', doc: 'mfg_web_store' } });
  const vTs = gView.json?.updatedAt || gView.json?.docs?.mfg_web_store?.updatedAt;
  const viewTry = await api('sync', {
    token: VIEWER_TOK,
    body: {
      op: 'patch',
      key: '',
      ackOnly: true,
      ifMatchUpdatedAt: vTs,
      patch: {
        mfg_web_store: {
          _deltaPatch: 1,
          minShellVer: SHELL,
          updatedAt: '2026-11-25T10:15:00.000Z',
          updatedBy: 'wtc.viewer@example.test',
          customRecords: {
            attendance: [{ id: 'at-viewer-forged', company: 'WTC', date: '2026-11-25', staff: 'Viewer Hack', source: 'app' }]
          },
          _deletedCrIds: {
            attendance: ['at-wtc-valid-1']
          }
        }
      }
    }
  });
  const afterViewer = readStoredMfgDoc();
  const attAfterView = new Set((afterViewer.doc.customRecords.attendance || []).map(r => r.id));
  ok('3b. Read-Only Viewer delta add and delete are blocked by Role Write Locks',
    viewTry.status === 200
    && attAfterView.has('at-wtc-valid-1')
    && !attAfterView.has('at-viewer-forged'),
    Array.from(attAfterView));
}

console.log(`\nSummary: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
