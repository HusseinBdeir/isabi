// Staff rules per company and person (Command Center v19.6.343): the Edge never stores a rule whose own company
// disagrees with its `<company>|<name>` key, so a seat of one company cannot plant a rule that shadows or freezes
// another company's rule for the same person. Bare-name (older) keys are unaffected.
// Run: node build/verify_staff_rule_keys.mjs
import { staffRuleKeyCompanyMismatch, mergeWorkSchedulesDocs, mergeCompanyPolicyDefaultEntry } from '../functions/_lib/d1_store.js';

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

const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
