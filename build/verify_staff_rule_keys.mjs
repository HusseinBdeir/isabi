// Staff rules per company and person (Command Center v19.6.343): the Edge never stores a rule whose own company
// disagrees with its `<company>|<name>` key, so a seat of one company cannot plant a rule that shadows or freezes
// another company's rule for the same person. Bare-name (older) keys are unaffected.
// Run: node build/verify_staff_rule_keys.mjs
import { staffRuleKeyCompanyMismatch, mergeWorkSchedulesDocs } from '../functions/_lib/d1_store.js';

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

const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
