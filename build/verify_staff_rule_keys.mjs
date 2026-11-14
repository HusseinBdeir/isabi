// Staff rules per company and person (Command Center v19.6.343): the Edge never stores a rule whose own company
// disagrees with its `<company>|<name>` key, so a seat of one company cannot plant a rule that shadows or freezes
// another company's rule for the same person. Bare-name (older) keys are unaffected.
// Run: node build/verify_staff_rule_keys.mjs
import {
  staffRuleKeyCompanyMismatch,
  mergeWorkSchedulesDocs,
  mergeCompanyPolicyDefaultEntry,
  scopeGeoConfigForSession,
  resolveCanWriteWorkSchedules,
  handleKvDoc,
  handleSync
} from '../functions/_lib/d1_store.js';
import { canWriteWorkSchedulesSession } from '../functions/_lib/security.js';

const results = [];
const check = (ok, label, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : ' - ' + detail}`); };

check(staffRuleKeyCompanyMismatch('wtc|ahmad', { company: 'BBConstruction' }) === true, '1. A WTC key holding a BBConstruction rule is a mismatch');
check(staffRuleKeyCompanyMismatch('wtc|ahmad', { company: ' WTC ' }) === false, '2. Company compared trimmed and lower-cased');
check(staffRuleKeyCompanyMismatch('wtc|ahmad', { staff: 'Ahmad' }) === true, '3. A company key with no company on the rule is refused');
check(staffRuleKeyCompanyMismatch('ahmad', { company: 'BBConstruction' }) === false, '4. Bare-name keys (older rules) are unaffected');
check(staffRuleKeyCompanyMismatch('wtc|ahmad', null) === false, '5. Non-object rows are left to the existing guards');

const prev = { shiftTypes: [], policyGroups: [], companyPolicyDefaults: {}, staffRules: {
  'wtc|ahmad': { staff: 'Ahmad', company: 'WTC', shift_id: 'night_7_3', updated_at: '2026-11-13T10:00:00.000Z' },
  ahmad: { staff: 'Ahmad', company: 'WTC', shift_id: 'day_8_4', updated_at: '2026-01-01T00:00:00.000Z' }
} };
const planted = mergeWorkSchedulesDocs(prev, { staffRules: {
  'wtc|ahmad': { staff: 'Ahmad', company: 'BBConstruction', shift_id: 'day_8_4', updated_at: '2099-01-01T00:00:00.000Z' },
  'bbconstruction|nour': { staff: 'Nour', company: 'BBConstruction', shift_id: 'ext_7_4', updated_at: '2026-11-13T11:00:00.000Z' },
  'wtc|ghost': { staff: 'Ghost', company: 'BBConstruction', shift_id: 'day_8_4', updated_at: '2099-01-01T00:00:00.000Z' }
} }, null, false);
const r = planted.staffRules || {};
check(r['wtc|ahmad'] && r['wtc|ahmad'].company === 'WTC' && r['wtc|ahmad'].shift_id === 'night_7_3',
  '6. A newer rule filed under WTC\'s key but naming BBConstruction does not replace the stored WTC rule', JSON.stringify(r['wtc|ahmad']));
check(!r['wtc|ghost'], '7. Such a rule is not stored at an empty key either', JSON.stringify(r['wtc|ghost']));
check(r['bbconstruction|nour'] && r['bbconstruction|nour'].shift_id === 'ext_7_4', '8. A matching company key is stored', JSON.stringify(r['bbconstruction|nour']));
check(r.ahmad && r.ahmad.shift_id === 'day_8_4', '9. The older bare-name rule is kept as it was', JSON.stringify(r.ahmad));
const newer = mergeWorkSchedulesDocs(planted, { staffRules: {
  'wtc|ahmad': { staff: 'Ahmad', company: 'WTC', shift_id: 'day_8_4', updated_at: '2026-11-13T12:00:00.000Z' }
} }, null, false);
check(newer.staffRules['wtc|ahmad'].shift_id === 'day_8_4', '10. The owner\'s later edit of the real WTC rule is stored (nothing frozen by the planted row)', JSON.stringify(newer.staffRules['wtc|ahmad']));

const coBase = {
  company: 'WTC',
  group_id: 'pkg_10_fixed_15d',
  math_mode: 'per_minute',
  ot_threshold_min: 12,
  policy_timeline: [{ id: 'w1', start_date: '2026-10-01', policy_group_id: 'pkg_15_open_15d', math_mode: 'per_minute', ot_threshold_min: 12 }],
  policy_timeline_updated_at: '2026-11-14T10:00:00.000Z',
  holidays: { calendar_id: 'lebanon_standard', year: 2026, dates: ['2026-11-22'], updated_at: '2026-11-14T08:00:00.000Z' },
  updated_at: '2026-11-14T10:00:00.000Z'
};
const holNewerInc = {
  company: 'WTC',
  group_id: 'pkg_10_fixed_15d',
  math_mode: 'tenth_hour',
  ot_threshold_min: 30,
  policy_timeline: [],
  policy_timeline_updated_at: '2026-11-14T07:00:00.000Z',
  holidays: { calendar_id: 'lebanon_standard', year: 2026, dates: ['2026-11-22', '2026-12-25'], updated_at: '2026-11-14T11:00:00.000Z' },
  updated_at: '2026-11-14T11:00:00.000Z'
};
const mHolNewer = mergeCompanyPolicyDefaultEntry(coBase, holNewerInc);
check(
  mHolNewer
    && mHolNewer.holidays && mHolNewer.holidays.dates.includes('2026-12-25')
    && Array.isArray(mHolNewer.policy_timeline) && mHolNewer.policy_timeline.length === 1
    && mHolNewer.policy_timeline[0].ot_threshold_min === 12
    && mHolNewer.updated_at > holNewerInc.updated_at,
  '11. Newer holidays sub-clock updates holidays while preserving newer policy_timeline and bumping updated_at',
  JSON.stringify(mHolNewer)
);

const curWithNewHol = {
  company: 'WTC',
  group_id: 'pkg_10_fixed_15d',
  math_mode: 'tenth_hour',
  ot_threshold_min: 10,
  policy_timeline: [],
  policy_timeline_updated_at: '2026-11-14T06:00:00.000Z',
  holidays: { calendar_id: 'lebanon_standard', year: 2026, dates: ['2026-11-22', '2026-12-25'], updated_at: '2026-11-14T12:00:00.000Z' },
  updated_at: '2026-11-14T12:00:00.000Z'
};
const tlNewerInc = {
  company: 'WTC',
  group_id: 'pkg_15_open_15d',
  math_mode: 'per_minute',
  ot_threshold_min: 5,
  policy_timeline: [{ id: 'w2', start_date: '2026-11-01', policy_group_id: 'pkg_15_open_15d', math_mode: 'per_minute', ot_threshold_min: 5 }],
  policy_timeline_updated_at: '2026-11-14T11:30:00.000Z',
  holidays: { calendar_id: 'lebanon_standard', year: 2026, dates: ['2026-01-01'], updated_at: '2026-11-14T05:00:00.000Z' },
  updated_at: '2026-11-14T11:30:00.000Z'
};
const mTlNewer = mergeCompanyPolicyDefaultEntry(curWithNewHol, tlNewerInc);
check(
  mTlNewer
    && Array.isArray(mTlNewer.policy_timeline) && mTlNewer.policy_timeline.length === 1 && mTlNewer.policy_timeline[0].ot_threshold_min === 5
    && mTlNewer.holidays && mTlNewer.holidays.dates.includes('2026-12-25') && !mTlNewer.holidays.dates.includes('2026-01-01'),
  '12. Newer policy_timeline sub-clock updates timeline while preserving newer holidays',
  JSON.stringify(mTlNewer)
);

const wtcPrevWs = {
  shiftTypes: [],
  policyGroups: [],
  companyPolicyDefaults: {
    wtc: { company: 'WTC', group_id: 'pkg_10_fixed_15d', math_mode: 'tenth_hour', updated_at: '2026-11-14T08:00:00.000Z' },
    bbconstruction: { company: 'BBConstruction', group_id: 'pkg_10_fixed_15d', math_mode: 'tenth_hour', updated_at: '2026-11-14T08:00:00.000Z' }
  },
  staffRules: {}
};
const wtcScopedSession = { sub: 'u_wtc_mgr', email: 'mgr@wtc.local', role: 'Manager', companies: 'WTC' };
const rlsMerged = mergeWorkSchedulesDocs(wtcPrevWs, {
  companyPolicyDefaults: {
    wtc: { company: 'WTC', group_id: 'pkg_15_open_15d', math_mode: 'per_minute', ot_threshold_min: 5, updated_at: '2026-11-14T12:00:00.000Z' },
    bbconstruction: { company: 'BBConstruction', group_id: 'pkg_exec_21d', math_mode: 'per_minute', ot_threshold_min: 0, updated_at: '2099-01-01T00:00:00.000Z' }
  }
}, wtcScopedSession, true);
const rlsDefs = rlsMerged.companyPolicyDefaults || {};
check(
  rlsDefs.wtc && rlsDefs.wtc.math_mode === 'per_minute' && rlsDefs.wtc.ot_threshold_min === 5
    && rlsDefs.bbconstruction && rlsDefs.bbconstruction.math_mode === 'tenth_hour' && rlsDefs.bbconstruction.group_id === 'pkg_10_fixed_15d',
  '13. WTC-scoped restrictRls session updates WTC companyPolicyDefaults while blocking cross-BU BBConstruction overwrite',
  JSON.stringify(rlsDefs)
);

const lwwPrevWs = {
  shiftTypes: [{ id: 'day_8_4', company: 'WTC', start_time: '08:00', end_time: '16:00', updated_at: '2026-11-14T11:00:00.000Z' }],
  policyGroups: [{ id: 'pkg_global', name: 'Global Policy', math_mode: 'per_minute', updated_at: '2026-11-14T11:00:00.000Z' }],
  companyPolicyDefaults: {},
  staffRules: {
    'wtc|ahmad': { company: 'WTC', staff: 'Ahmad', math_mode: 'per_minute', ot_threshold_min: 15, updated_at: '2026-11-14T11:00:00.000Z' }
  }
};
const lwwMerged = mergeWorkSchedulesDocs(lwwPrevWs, {
  shiftTypes: [{ id: 'day_8_4', company: 'WTC', start_time: '07:00', end_time: '15:00', updated_at: '2026-11-14T10:00:00.000Z' }],
  policyGroups: [{ id: 'pkg_global', name: 'Tampered', math_mode: 'tenth_hour', updated_at: '2099-01-01T00:00:00.000Z' }],
  companyPolicyDefaults: {},
  staffRules: {
    'wtc|ahmad': { company: 'WTC', staff: 'Ahmad', math_mode: 'tenth_hour', ot_threshold_min: 5, updated_at: '2026-11-14T10:00:00.000Z' }
  }
}, wtcScopedSession, true);
check(
  lwwMerged.staffRules['wtc|ahmad'].math_mode === 'per_minute'
    && lwwMerged.staffRules['wtc|ahmad'].ot_threshold_min === 15
    && lwwMerged.shiftTypes[0].start_time === '08:00'
    && lwwMerged.policyGroups[0].math_mode === 'per_minute',
  '14. Restricted sync LWW preserves newer staffRules, shiftTypes & global policyGroups against older timestamps',
  JSON.stringify(lwwMerged)
);

const skewedCurCoDef = {
  company: 'WTC',
  group_id: 'pkg_10_fixed_15d',
  policy_timeline: [{ id: 'w0', start_date: '2026-01-01', policy_group_id: 'pkg_10_fixed_15d', math_mode: 'tenth_hour' }],
  policy_timeline_updated_at: '2026-11-14T10:00:00.000Z',
  updated_at: '2099-01-01T00:00:00.000Z'
};
const skewedIncCoDef = {
  company: 'WTC',
  group_id: 'pkg_15_open_15d',
  policy_timeline: [{ id: 'w1', start_date: '2026-11-15', policy_group_id: 'pkg_15_open_15d', math_mode: 'per_minute', ot_threshold_min: 7 }],
  policy_timeline_updated_at: '2026-11-14T12:00:00.000Z',
  updated_at: '2026-11-14T12:00:00.000Z'
};
const skewedMerged = mergeCompanyPolicyDefaultEntry(skewedCurCoDef, skewedIncCoDef);
check(
  skewedMerged
    && skewedMerged.group_id === 'pkg_10_fixed_15d'
    && Array.isArray(skewedMerged.policy_timeline) && skewedMerged.policy_timeline[0].ot_threshold_min === 7
    && skewedMerged.updated_at === '2099-01-01T00:00:01.000Z',
  '15. mergeCompanyPolicyDefaultEntry bumps past curObj.updated_at under skewed clocks when sub-clock wins top-level curObj LWW',
  JSON.stringify(skewedMerged)
);

const futureBaseMs = Date.now() + 60_000;
const futureTs = sec => new Date(futureBaseMs + sec * 1000).toISOString();

function likeMatch(val, pattern) {
  const esc = String(pattern || '').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${esc}$`, 'i').test(String(val || ''));
}

function createMockD1({ users = [], kv = {} } = {}) {
  const kvMap = new Map();
  for (const [k, v] of Object.entries(kv)) {
    const val = (v && typeof v === 'object' && 'payload_json' in v)
      ? v
      : { doc_key: k, payload_json: JSON.stringify(v), updated_at: '2026-11-10T08:00:00.000Z', updated_by: 'seed', rev: 1 };
    kvMap.set(k, Object.assign({ doc_key: k, rev: 1 }, val));
  }
  const userList = users.map(u => Object.assign({}, u));
  const alertRules = [];

  const runSql = (sql, args, mode) => {
    const q = String(sql || '').replace(/\s+/g, ' ').trim();
    const ql = q.toLowerCase();
    if (ql.startsWith('pragma table_info')) return { results: [] };
    if (ql.includes('from users')) {
      if (ql.includes('where id = ?1')) {
        const row = userList.find(u => String(u.id) === String(args[0] ?? '')) || null;
        return mode === 'first' ? row : { results: row ? [row] : [] };
      }
      if (ql.includes('lower(email) = ?1')) {
        const em = String(args[0] ?? '').trim().toLowerCase();
        const row = userList.find(u => String(u.email || '').trim().toLowerCase() === em) || null;
        return mode === 'first' ? row : { results: row ? [row] : [] };
      }
      return mode === 'first' ? (userList[0] || null) : { results: [...userList] };
    }
    if (ql.includes('from alert_rules')) {
      return mode === 'first' ? (alertRules[0] || null) : { results: [...alertRules] };
    }
    if (ql.includes('from edge_kv_store')) {
      if (ql.startsWith('delete from edge_kv_store')) {
        if (ql.includes('doc_key like ?1')) {
          const pat = String(args[0] ?? '');
          let changes = 0;
          for (const k of Array.from(kvMap.keys())) {
            if (likeMatch(k, pat)) { kvMap.delete(k); changes++; }
          }
          return { meta: { changes } };
        }
        if (ql.includes('doc_key = ?1')) {
          const k = String(args[0] ?? '');
          const existed = kvMap.delete(k);
          return { meta: { changes: existed ? 1 : 0 } };
        }
      }
      if (ql.includes("where doc_key = 'work_schedules'")) {
        const r = kvMap.get('work_schedules') || null;
        return mode === 'first' ? (r ? { payload_json: r.payload_json } : null) : { results: r ? [r] : [] };
      }
      if (ql.includes('where doc_key = ?1 or doc_key like ?2')) {
        const k = String(args[0] ?? '');
        const pat = String(args[1] ?? '');
        const rows = Array.from(kvMap.values())
          .filter(r => r.doc_key === k || likeMatch(r.doc_key, pat))
          .sort((a, b) => (a.doc_key < b.doc_key ? -1 : a.doc_key > b.doc_key ? 1 : 0));
        return mode === 'first' ? (rows[0] || null) : { results: rows };
      }
      if (ql.includes('select 1 as x') && ql.includes('doc_key like ?1')) {
        const pat = String(args[0] ?? '');
        const found = Array.from(kvMap.keys()).some(k => likeMatch(k, pat));
        return mode === 'first' ? (found ? { x: 1 } : null) : { results: found ? [{ x: 1 }] : [] };
      }
      if (ql.includes('where doc_key = ?1')) {
        const r = kvMap.get(String(args[0] ?? '')) || null;
        return mode === 'first' ? (r ? { payload_json: r.payload_json } : null) : { results: r ? [r] : [] };
      }
    }
    if (ql.startsWith('update edge_kv_store')) {
      const targetKey = String(args[3] ?? '');
      const expectedTs = String(args[4] ?? '');
      const ex = kvMap.get(targetKey);
      if (!ex || String(ex.updated_at || '') !== expectedTs) return { meta: { changes: 0 } };
      kvMap.set(targetKey, {
        doc_key: targetKey,
        payload_json: String(args[0] ?? ''),
        updated_at: String(args[1] ?? ''),
        updated_by: String(args[2] ?? ''),
        rev: Number(ex.rev || 1) + 1
      });
      return { meta: { changes: 1 } };
    }
    if (ql.startsWith('insert') && ql.includes('into edge_kv_store')) {
      const m = q.match(/INSERT\s+(?:OR\s+(IGNORE|REPLACE)\s+)?INTO\s+edge_kv_store\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
      if (m) {
        const cols = m[2].split(',').map(s => s.trim());
        const vals = m[3].split(',').map(s => s.trim());
        const rowObj = {};
        for (let i = 0; i < cols.length; i++) {
          const tok = vals[i] || '';
          const pm = tok.match(/^\?(\d+)$/);
          const sm = tok.match(/^'([^']*)'$/);
          if (pm) rowObj[cols[i]] = args[Number(pm[1]) - 1];
          else if (sm) rowObj[cols[i]] = sm[1];
          else if (/^\d+$/.test(tok)) rowObj[cols[i]] = Number(tok);
          else rowObj[cols[i]] = tok;
        }
        const dk = String(rowObj.doc_key || '');
        const ex = kvMap.get(dk);
        if (m[1] && m[1].toUpperCase() === 'IGNORE' && ex) return { meta: { changes: 0 } };
        kvMap.set(dk, {
          doc_key: dk,
          payload_json: String(rowObj.payload_json ?? ''),
          updated_at: String(rowObj.updated_at ?? ''),
          updated_by: String(rowObj.updated_by ?? (ex && ex.updated_by) ?? ''),
          rev: ex && ql.includes('on conflict') ? Number(ex.rev || 1) + 1 : Number(rowObj.rev || 1)
        });
        return { meta: { changes: 1 } };
      }
    }
    return mode === 'first' ? null : { results: [], meta: { changes: 0 } };
  };

  const makeStmt = (sql, boundArgs = []) => ({
    bind: (...nextArgs) => makeStmt(sql, nextArgs),
    first: async () => runSql(sql, boundArgs, 'first'),
    all: async () => runSql(sql, boundArgs, 'all'),
    run: async () => runSql(sql, boundArgs, 'run')
  });

  return {
    kvMap,
    prepare: (sql) => makeStmt(sql, []),
    batch: async (stmts) => Promise.all((stmts || []).map(s => s.run()))
  };
}

const mockUsers = [
  { id: 'u1', email: 'owner@example.com', full_name: 'Owner', role: 'Owner', companies: '*', active: 1, status: 'Active' },
  { id: 'u_adm', email: 'admin@example.com', full_name: 'Admin WTC', role: 'Admin', companies: 'WTC', active: 1, status: 'Active' },
  { id: 'u_full', email: 'full@example.com', full_name: 'Full WTC', role: 'Full Access', companies: 'WTC', active: 1, status: 'Active' },
  { id: 'u2', email: 'supentry@example.com', full_name: 'SupEntry WTC', role: 'Supervisor + Entry', companies: 'WTC', active: 1, status: 'Active' },
  { id: 'u_cust_ok', email: 'custok@example.com', full_name: 'CustOK WTC', role: 'Custom', companies: 'WTC', custom_perms: JSON.stringify({ modify_data: true, forms: { enter_master: true } }), active: 1, status: 'Active' },
  { id: 'u_cust_no', email: 'custno@example.com', full_name: 'CustNo WTC', role: 'Custom', companies: 'WTC', custom_perms: JSON.stringify({ modify_data: true, forms: {} }), active: 1, status: 'Active' },
  { id: 'u7', email: 'sup@example.com', full_name: 'Sup BBC', role: 'Supervisor', companies: 'BBConstruction', active: 1, status: 'Active' },
  { id: 'u_susp', email: 'susp@example.com', full_name: 'Susp WTC', role: 'Admin', companies: 'WTC', active: 0, status: 'Suspended', ws_write: true }
];

// 16. RBAC helpers: canWriteWorkSchedulesSession + resolveCanWriteWorkSchedules
const sessOwner = { sub: 'u1', email: 'owner@example.com', role: 'Owner', companies: ['*'] };
const sessAdmin = { sub: 'u_adm', email: 'admin@example.com', role: 'Admin', companies: ['WTC'] };
const sessFull = { sub: 'u_full', email: 'full@example.com', role: 'Full Access', companies: ['WTC'] };
const sessSupEntry = { sub: 'u2', email: 'supentry@example.com', role: 'Supervisor + Entry', companies: ['WTC'] };
const sessCustOk = { sub: 'u_cust_ok', email: 'custok@example.com', role: 'Custom', companies: ['WTC'], ws_write: true };
const sessCustNo = { sub: 'u_cust_no', email: 'custno@example.com', role: 'Custom', companies: ['WTC'], ws_write: false };
const sessSupRo = { sub: 'u7', email: 'sup@example.com', role: 'Supervisor', companies: ['BBConstruction'] };
const sessSusp = { sub: 'u_susp', email: 'susp@example.com', role: 'Admin', companies: ['WTC'], ws_write: true };
const db11 = createMockD1({ users: mockUsers });
const r11 = {
  sess: [
    canWriteWorkSchedulesSession(sessOwner),
    canWriteWorkSchedulesSession(sessAdmin),
    canWriteWorkSchedulesSession(sessFull),
    canWriteWorkSchedulesSession(sessSupEntry),
    canWriteWorkSchedulesSession(sessCustOk),
    canWriteWorkSchedulesSession(sessCustNo),
    canWriteWorkSchedulesSession(sessSupRo),
    canWriteWorkSchedulesSession(null)
  ],
  db: await Promise.all([
    resolveCanWriteWorkSchedules(db11, sessAdmin),
    resolveCanWriteWorkSchedules(db11, sessFull),
    resolveCanWriteWorkSchedules(db11, sessCustOk),
    resolveCanWriteWorkSchedules(db11, sessCustNo),
    resolveCanWriteWorkSchedules(db11, sessSupRo),
    resolveCanWriteWorkSchedules(db11, sessSusp)
  ])
};
check(
  r11.sess.slice(0, 5).every(Boolean) && !r11.sess[5] && !r11.sess[6] && !r11.sess[7]
  && r11.db[0] && r11.db[1] && r11.db[2] && !r11.db[3] && !r11.db[4] && !r11.db[5],
  '16. canWriteWorkSchedulesSession & resolveCanWriteWorkSchedules RBAC (Admin/Full/Sup+Entry/CustOK=true, CustNo/Supervisor/Suspended/null=false)',
  JSON.stringify(r11)
);

// 17. scopeGeoConfigForSession fail-closed & BU scoping
const geoSample = {
  companyHubs: {
    WTC: { lat: 33.8, lng: 35.5, radius_m: 150 },
    BBConstruction: { lat: 34.0, lng: 35.6, radius_m: 200 },
    'Lions Transport': { lat: 33.9, lng: 35.7, radius_m: 180 }
  }
};
const geoAnon = scopeGeoConfigForSession(geoSample, null);
const geoWtc = scopeGeoConfigForSession(geoSample, sessAdmin);
const geoOwner = scopeGeoConfigForSession(geoSample, sessOwner);
check(
  (!geoAnon || Object.keys(geoAnon.companyHubs || {}).length === 0)
  && Object.keys(geoWtc?.companyHubs || {}).length === 1 && Boolean(geoWtc?.companyHubs?.WTC)
  && !geoWtc?.companyHubs?.BBConstruction && Object.keys(geoOwner?.companyHubs || {}).length === 3,
  '17. scopeGeoConfigForSession fails closed on null session and scopes companyHubs by allowed BU',
  JSON.stringify({ geoAnon, geoWtc, geoOwner })
);

// 18. handleKvDoc GET 401 / Demo 200(null) / Scoped GET for work_schedules & geo_config
const kvSeed13 = {
  work_schedules: {
    shiftTypes: [
      { id: 'sh_wtc', company: 'WTC', name: 'WTC Shift' },
      { id: 'sh_bbc', company: 'BBConstruction', name: 'BBC Shift' }
    ],
    companyPolicyDefaults: { WTC: { policy_group_id: 'pg_wtc' }, BBConstruction: { policy_group_id: 'pg_bbc' } },
    staffRules: {
      'wtc|a': { company: 'WTC', shift_id: 'sh_wtc' },
      'bbconstruction|b': { company: 'BBConstruction', shift_id: 'sh_bbc' }
    }
  },
  geo_config: geoSample
};
const db13 = createMockD1({ users: mockUsers, kv: kvSeed13 });
const mkReq = (method, url, headers = {}) => new Request(url, { method, headers });
const res13UnauthWs = await (await handleKvDoc(mkReq('GET', 'https://example.com/app/api/work_schedules'), { DB: db13 }, null, 'work_schedules', 'work_schedules', null)).json();
const resp13UnauthWs = await handleKvDoc(mkReq('GET', 'https://example.com/app/api/work_schedules'), { DB: db13 }, null, 'work_schedules', 'work_schedules', null);
const resp13UnauthGeo = await handleKvDoc(mkReq('GET', 'https://example.com/app/api/geo_config'), { DB: db13 }, null, 'geo_config', 'config', null);
const resp13DemoAnon = await handleKvDoc(mkReq('GET', 'https://example.com/app/api/work_schedules', { 'X-ISABI-Demo': '1' }), { DB: db13 }, null, 'work_schedules', 'work_schedules', null);
const j13DemoAnon = await resp13DemoAnon.json();
const resp13DemoAuth = await handleKvDoc(mkReq('GET', 'https://example.com/app/api/geo_config', { 'X-ISABI-Demo': '1' }), { DB: db13 }, sessOwner, 'geo_config', 'config', null);
const j13DemoAuth = await resp13DemoAuth.json();
const j13WtcWs = await (await handleKvDoc(mkReq('GET', 'https://example.com/app/api/work_schedules'), { DB: db13 }, sessAdmin, 'work_schedules', 'work_schedules', null)).json();
const j13WtcGeo = await (await handleKvDoc(mkReq('GET', 'https://example.com/app/api/geo_config'), { DB: db13 }, sessAdmin, 'geo_config', 'config', null)).json();
check(
  !res13UnauthWs.ok && resp13UnauthWs.status === 401 && resp13UnauthGeo.status === 401
  && resp13DemoAnon.status === 200 && j13DemoAnon.demo === true && j13DemoAnon.work_schedules === null
  && resp13DemoAuth.status === 200 && j13DemoAuth.demo === true && j13DemoAuth.config === null
  && (j13WtcWs.work_schedules?.shiftTypes || []).length === 1 && j13WtcWs.work_schedules.shiftTypes[0].company === 'WTC'
  && !j13WtcWs.work_schedules.companyPolicyDefaults?.BBConstruction && !j13WtcWs.work_schedules.staffRules?.['bbconstruction|b']
  && Object.keys(j13WtcGeo.config?.companyHubs || {}).length === 1 && Boolean(j13WtcGeo.config?.companyHubs?.WTC),
  '18. handleKvDoc GET enforces 401 unauth, 200(null) on X-ISABI-Demo, and BU scoping for work_schedules + geo_config',
  JSON.stringify({ s1: resp13UnauthWs.status, s2: resp13UnauthGeo.status, j13DemoAnon, j13DemoAuth, j13WtcWs, j13WtcGeo })
);

// 19. handleKvDoc POST RBAC across roles
const db14 = createMockD1({ users: mockUsers, kv: kvSeed13 });
const validWtcPost = { work_schedules: { companyPolicyDefaults: { WTC: { policy_group_id: 'pg_wtc_new', updated_at: '2026-11-12T10:00:00.000Z' } } } };
const post14Sup = await handleKvDoc(mkReq('POST', 'https://example.com/app/api/work_schedules'), { DB: db14 }, sessSupRo, 'work_schedules', 'work_schedules', validWtcPost);
const post14CustNo = await handleKvDoc(mkReq('POST', 'https://example.com/app/api/work_schedules'), { DB: db14 }, sessCustNo, 'work_schedules', 'work_schedules', validWtcPost);
const post14Admin = await handleKvDoc(mkReq('POST', 'https://example.com/app/api/work_schedules'), { DB: db14 }, sessAdmin, 'work_schedules', 'work_schedules', validWtcPost);
const post14Full = await handleKvDoc(mkReq('POST', 'https://example.com/app/api/work_schedules'), { DB: db14 }, sessFull, 'work_schedules', 'work_schedules', validWtcPost);
const post14SupEntry = await handleKvDoc(mkReq('POST', 'https://example.com/app/api/work_schedules'), { DB: db14 }, sessSupEntry, 'work_schedules', 'work_schedules', validWtcPost);
const post14CustOk = await handleKvDoc(mkReq('POST', 'https://example.com/app/api/work_schedules'), { DB: db14 }, sessCustOk, 'work_schedules', 'work_schedules', validWtcPost);
check(
  post14Sup.status === 403 && post14CustNo.status === 403
  && post14Admin.status === 200 && post14Full.status === 200 && post14SupEntry.status === 200 && post14CustOk.status === 200,
  '19. handleKvDoc POST rejects read-only Supervisor + unauthorized Custom (403) and allows Admin/Full/Sup+Entry/CustomOK (200)',
  JSON.stringify({ sup: post14Sup.status, custNo: post14CustNo.status, adm: post14Admin.status, full: post14Full.status, se: post14SupEntry.status, custOk: post14CustOk.status })
);

// 20. Case-insensitive companyPolicyDefaults RLS + .holidays preservation
const kvSeed15 = {
  work_schedules: {
    shiftTypes: [],
    policyGroups: [],
    companyPolicyDefaults: {
      WTC: { policy_group_id: 'pg_wtc_0', updated_at: futureTs(0), holidays: { items: [{ date: '2026-12-25', label: 'Christmas' }], updated_at: futureTs(120) } },
      BBConstruction: { policy_group_id: 'pg_bbc_0', updated_at: futureTs(0) }
    },
    staffRules: {}
  }
};
const db15 = createMockD1({ users: mockUsers, kv: kvSeed15 });
const tamper15 = await handleKvDoc(
  mkReq('POST', 'https://example.com/app/api/work_schedules'),
  { DB: db15 }, sessAdmin, 'work_schedules', 'work_schedules',
  { work_schedules: { companyPolicyDefaults: { bbconstruction: { policy_group_id: 'hacked', updated_at: futureTs(600) } } } }
);
const staleHolidays15 = await handleKvDoc(
  mkReq('POST', 'https://example.com/app/api/work_schedules'),
  { DB: db15 }, sessAdmin, 'work_schedules', 'work_schedules',
  { work_schedules: { companyPolicyDefaults: { wtc: { policy_group_id: 'pg_wtc_1', updated_at: futureTs(200), holidays: { items: [], updated_at: futureTs(-3600) } } } } }
);
const stored15AfterStale = JSON.parse(db15.kvMap.get('work_schedules').payload_json);
const newerHolidays15 = await handleKvDoc(
  mkReq('POST', 'https://example.com/app/api/work_schedules'),
  { DB: db15 }, sessAdmin, 'work_schedules', 'work_schedules',
  { work_schedules: { companyPolicyDefaults: { WTC: { policy_group_id: 'pg_wtc_1', updated_at: futureTs(400), holidays: { items: [{ date: '2026-01-01', label: 'NYD' }, { date: '2026-12-25', label: 'Christmas' }], updated_at: futureTs(400) } } } } }
);
const stored15AfterNew = JSON.parse(db15.kvMap.get('work_schedules').payload_json);
const wtcKeys15 = Object.keys(stored15AfterStale.companyPolicyDefaults || {}).filter(k => k.toLowerCase() === 'wtc');
check(
  tamper15.status === 403
  && stored15AfterStale.companyPolicyDefaults?.BBConstruction?.policy_group_id === 'pg_bbc_0'
  && !stored15AfterStale.companyPolicyDefaults?.bbconstruction
  && staleHolidays15.status === 200 && wtcKeys15.length === 1
  && stored15AfterStale.companyPolicyDefaults?.WTC?.policy_group_id === 'pg_wtc_1'
  && (stored15AfterStale.companyPolicyDefaults?.WTC?.holidays?.items || []).length === 1
  && newerHolidays15.status === 200
  && (stored15AfterNew.companyPolicyDefaults?.WTC?.holidays?.items || []).length === 2,
  '20. Case-insensitive companyPolicyDefaults RLS blocks cross-BU & deduplicates WTC/wtc while preserving newer holidays',
  JSON.stringify({ tamper: tamper15.status, wtcKeys15, afterStale: stored15AfterStale.companyPolicyDefaults, afterNew: stored15AfterNew.companyPolicyDefaults })
);

// 21. Bare-payload delete_shift (multi-company same-ID isolation) & delete_policy_group + empty-id 400
const kvSeed16 = {
  work_schedules: {
    shiftTypes: [
      { id: 'sh_day', shift_code: 'sh_day', company: 'WTC', name: 'WTC Day', updated_at: '2026-11-10T08:00:00.000Z' },
      { id: 'sh_day', shift_code: 'sh_day', company: 'BBConstruction', name: 'BBC Day', updated_at: '2026-11-10T08:00:00.000Z' }
    ],
    policyGroups: [
      { id: 'pg_wtc_1', company: 'WTC', name: 'WTC PG', updated_at: '2026-11-10T08:00:00.000Z' },
      { id: 'pg_bbc_1', company: 'BBConstruction', name: 'BBC PG', updated_at: '2026-11-10T08:00:00.000Z' }
    ],
    companyPolicyDefaults: {},
    staffRules: {}
  }
};
const db16 = createMockD1({ users: mockUsers, kv: kvSeed16 });
const delShiftCross = await handleKvDoc(mkReq('POST', 'https://example.com/app/api/work_schedules'), { DB: db16 }, sessAdmin, 'work_schedules', 'work_schedules', { op: 'delete_shift', id: 'sh_day', company: 'BBConstruction' });
const delShiftOwn = await handleKvDoc(mkReq('POST', 'https://example.com/app/api/work_schedules'), { DB: db16 }, sessAdmin, 'work_schedules', 'work_schedules', { op: 'delete_shift', id: 'sh_day', company: 'WTC' });
const delPgEmpty = await handleKvDoc(mkReq('POST', 'https://example.com/app/api/work_schedules'), { DB: db16 }, sessAdmin, 'work_schedules', 'work_schedules', { op: 'delete_policy_group', id: '' });
const delPgCross = await handleKvDoc(mkReq('POST', 'https://example.com/app/api/work_schedules'), { DB: db16 }, sessAdmin, 'work_schedules', 'work_schedules', { op: 'delete_policy_group', id: 'pg_bbc_1' });
const delPgBuBlocked = await handleKvDoc(mkReq('POST', 'https://example.com/app/api/work_schedules'), { DB: db16 }, sessAdmin, 'work_schedules', 'work_schedules', { op: 'delete_policy_group', id: 'pg_wtc_1' });
const delPgOwn = await handleKvDoc(mkReq('POST', 'https://example.com/app/api/work_schedules'), { DB: db16 }, sessOwner, 'work_schedules', 'work_schedules', { op: 'delete_policy_group', id: 'pg_wtc_1' });
const stored16 = JSON.parse(db16.kvMap.get('work_schedules').payload_json);
const wtcSh16 = (stored16.shiftTypes || []).find(s => s.id === 'sh_day' && s.company === 'WTC');
const bbcSh16 = (stored16.shiftTypes || []).find(s => s.id === 'sh_day' && s.company === 'BBConstruction');
const wtcPg16 = (stored16.policyGroups || []).find(g => g.id === 'pg_wtc_1');
const bbcPg16 = (stored16.policyGroups || []).find(g => g.id === 'pg_bbc_1');
check(
  delShiftCross.status === 403 && delShiftOwn.status === 200
  && Boolean(wtcSh16?.voided) && Boolean(wtcSh16?.updated_at) && !bbcSh16?.voided
  && delPgEmpty.status === 400 && delPgCross.status === 403 && delPgBuBlocked.status === 403 && delPgOwn.status === 200
  && Boolean(wtcPg16?.voided) && !bbcPg16?.voided,
  '21. Bare-payload delete_shift isolates multi-company same-ID rows & delete_policy_group enforces empty-id 400 and Owner/BU RLS',
  JSON.stringify({ delShiftCross: delShiftCross.status, delShiftOwn: delShiftOwn.status, delPgEmpty: delPgEmpty.status, delPgCross: delPgCross.status, delPgBuBlocked: delPgBuBlocked.status, delPgOwn: delPgOwn.status, wtcSh16, bbcSh16, wtcPg16, bbcPg16 })
);

// 22. handleSync RLS: read-only Supervisor stripped + cross-BU staffRules tamper rejected
const initWs17 = {
  shiftTypes: [{ id: 'sh_wtc', shift_code: 'sh_wtc', company: 'WTC', name: 'WTC', updated_at: futureTs(0) }],
  policyGroups: [{ id: 'pg_wtc_1', company: 'WTC', name: 'PG', updated_at: futureTs(0) }],
  companyPolicyDefaults: {
    WTC: { policy_group_id: 'pg_wtc_1', updated_at: futureTs(0), holidays: { items: [{ date: '2026-12-25', label: 'Xmas' }], updated_at: futureTs(300) } },
    BBConstruction: { policy_group_id: 'pg_bbc_1', updated_at: futureTs(0) }
  },
  staffRules: {
    'bbconstruction|ali': { company: 'BBConstruction', shift_id: 'sh_bbc', updated_at: futureTs(0) }
  }
};
const db17 = createMockD1({
  users: mockUsers,
  kv: {
    work_schedules: initWs17,
    mfg_web_store: { updatedAt: '2026-11-10T10:00:00.000Z', customRecords: {}, workSchedules: initWs17 }
  }
});
const sync17Sup = await handleSync(
  mkReq('POST', 'https://example.com/app/api/sync'),
  { DB: db17 }, sessSupRo,
  {
    op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
    patch: {
      mfg_web_store: {
        updatedAt: '2026-11-11T10:00:00.000Z',
        customRecords: {},
        workSchedules: {
          companyPolicyDefaults: { BBConstruction: { policy_group_id: 'hacked', updated_at: '2026-11-14T00:00:00.000Z' } },
          staffRules: { 'bbconstruction|ali': { company: 'BBConstruction', shift_id: 'hacked', updated_at: '2026-11-14T00:00:00.000Z' } }
        }
      }
    }
  }
);
const sync17AdminTamper = await handleSync(
  mkReq('POST', 'https://example.com/app/api/sync'),
  { DB: db17 }, sessAdmin,
  {
    op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
    patch: {
      mfg_web_store: {
        updatedAt: '2026-11-11T11:00:00.000Z',
        customRecords: {},
        workSchedules: {
          staffRules: {
            'bbconstruction|ali': { company: 'WTC', shift_id: 'hijack', updated_at: '2026-11-14T00:00:00.000Z' },
            'wtc|tarek': { company: 'WTC', shift_id: 'sh_wtc', updated_at: '2026-11-11T11:00:00.000Z' }
          }
        }
      }
    }
  }
);
const kv17After = JSON.parse(db17.kvMap.get('work_schedules').payload_json);
check(
  sync17Sup.status === 200 && sync17AdminTamper.status === 200
  && kv17After.companyPolicyDefaults?.BBConstruction?.policy_group_id === 'pg_bbc_1'
  && kv17After.staffRules?.['bbconstruction|ali']?.shift_id === 'sh_bbc'
  && kv17After.staffRules?.['wtc|tarek']?.shift_id === 'sh_wtc',
  '22. handleSync strips workSchedules from read-only Supervisor and protects cross-BU staffRules entries',
  JSON.stringify({ supStatus: sync17Sup.status, admStatus: sync17AdminTamper.status, kv17After })
);

// 23. handleSync allows CustomOK WTC workSchedules merge & preserves newer KV .holidays
const sync18CustOk = await handleSync(
  mkReq('POST', 'https://example.com/app/api/sync'),
  { DB: db17 }, sessCustOk,
  {
    op: 'patch', doc: 'mfg_web_store', awaitMirror: true,
    patch: {
      mfg_web_store: {
        updatedAt: futureTs(600),
        customRecords: {},
        workSchedules: {
          companyPolicyDefaults: {
            wtc: { policy_group_id: 'pg_wtc_2', updated_at: futureTs(600), holidays: { items: [], updated_at: futureTs(-3600) } }
          }
        }
      }
    }
  }
);
const kv18After = JSON.parse(db17.kvMap.get('work_schedules').payload_json);
check(
  sync18CustOk.status === 200
  && kv18After.companyPolicyDefaults?.WTC?.policy_group_id === 'pg_wtc_2'
  && (kv18After.companyPolicyDefaults?.WTC?.holidays?.items || []).length === 1,
  '23. handleSync allows authorized Custom WTC workSchedules merge while preserving newer KV .holidays',
  JSON.stringify({ status: sync18CustOk.status, wtcDef: kv18After.companyPolicyDefaults?.WTC })
);

// 24. [LOW-2] Mismatched staffRules entry naming foreign nextCo returns 403 and does not store
const low2Res = await handleKvDoc(
  mkReq('POST', 'https://example.com/app/api/work_schedules'),
  { DB: db17 }, sessAdmin, 'work_schedules', 'work_schedules',
  { work_schedules: { staffRules: { 'wtc|probe_low2': { company: 'BBConstruction', shift_id: 'sh_day', updated_at: futureTs(700) } } } }
);
const kv24After = JSON.parse(db17.kvMap.get('work_schedules').payload_json);
check(
  low2Res.status === 403 && !Object.prototype.hasOwnProperty.call(kv24After.staffRules || {}, 'wtc|probe_low2'),
  '24. Mismatched staffRules row whose next company is outside caller scope returns 403 without writing',
  JSON.stringify({ status: low2Res.status, stored: kv24After.staffRules?.['wtc|probe_low2'] })
);

// 25. [LOW-3] delete_shift with omitted company & missing record returns 400 (never fabricates WTC)
const low3Res = await handleKvDoc(
  mkReq('POST', 'https://example.com/app/api/work_schedules'),
  { DB: db17 }, sessAdmin, 'work_schedules', 'work_schedules',
  { op: 'delete_shift', id: 'nonexistent_low3' }
);
const kv25After = JSON.parse(db17.kvMap.get('work_schedules').payload_json);
check(
  low3Res.status === 400 && !(kv25After.shiftTypes || []).some(s => s.id === 'nonexistent_low3'),
  '25. delete_shift with missing company and absent target returns 400 without fabricating WTC tombstone',
  JSON.stringify({ status: low3Res.status, shiftTypes: kv25After.shiftTypes })
);

const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
