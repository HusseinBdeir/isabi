// Offline gate for Edge D1 server-side same-name guard, sync floor,
// and staff_members.father_name runtime schema migration + persistence.
// Uses in-memory node:sqlite (Node 22.5+). Touches nothing live.
// Run: node build/verify_same_name_edge.mjs

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  MIN_SYNC_SHELL_VER,
  compareShellVer,
  effectiveMinSyncShellVer,
  handleRecordsGet,
  handleRecordsPost,
  handleSync,
} from '../functions/_lib/d1_store.js';
import { handleKioskVerify } from '../functions/_lib/kiosk_verify.js';
import { canAccessCompany, isOwnerOrFullGroupSession } from '../functions/_lib/security.js';
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
  rows(sql, ...p) { return this.db.prepare(sql).all(...p); }
}

const SCHEMA_SQL = readFileSync(new URL('../migrations/0001_schema.sql', import.meta.url), 'utf8');
const OWNER = { sub: 'u1', role: 'Owner', companies: 'ALL', email: 'owner@example.test' };

let pass = 0;
let fail = 0;
const textToAudit = [];

function ok(label, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}${detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`);
  }
}

function noteText(v) {
  if (v && typeof v === 'object') textToAudit.push(JSON.stringify(v));
  else if (typeof v === 'string') textToAudit.push(v);
}

const mkPostReq = (path, body) => new Request(`https://example.test${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const mkGetReq = (path) => new Request(`https://example.test${path}`, { method: 'GET' });

async function postRec(env, table, record, session = OWNER) {
  const body = { table, record };
  const res = await handleRecordsPost(mkPostReq('/app/api/records', body), env, session, body);
  const json = await res.json();
  noteText(json);
  return { status: res.status, json };
}

async function getRecs(env, table, session = OWNER) {
  const url = new URL(`https://example.test/app/api/records?table=${encodeURIComponent(table)}&limit=500`);
  const res = await handleRecordsGet(mkGetReq(url.pathname + url.search), env, session, url);
  const json = await res.json();
  return { status: res.status, json };
}

async function postSync(env, body, session = OWNER) {
  const tasks = [];
  const ctx = { waitUntil(p) { tasks.push(p); } };
  const res = await handleSync(mkPostReq('/app/api/sync', body), env, session, body, ctx);
  await Promise.all(tasks);
  const json = await res.json();
  noteText(json);
  return { status: res.status, json };
}

function freshEnv(stripFatherCol = false) {
  const d1 = new D1();
  const sql = stripFatherCol
    ? SCHEMA_SQL.replace(/,\s*father_name\s+TEXT\s+DEFAULT\s+''/i, '')
    : SCHEMA_SQL;
  d1.exec(sql);
  return { env: { DB: d1 }, d1 };
}

console.log('Edge D1 same-name guard, effective sync floor & father_name migration');

// 1. Runtime ALTER TABLE migration on pre-existing staff_members without father_name + round-trip
{
  const { env, d1 } = freshEnv(true);
  const colsBefore = d1.rows('PRAGMA table_info(staff_members)').map(c => c.name);
  const r = await postRec(env, 'staff_members', {
    id: 'sm-mig-1',
    name: 'Ali Mansour',
    father_name: 'Hassan',
    company: 'WTC',
    role: 'Driver',
    status: 'Active',
  });
  const colsAfter = d1.rows('PRAGMA table_info(staff_members)').map(c => c.name);
  const rd = await getRecs(env, 'staff_members');
  const saved = (rd.json.rows || []).find(x => x.id === 'sm-mig-1');
  ok('1a. staff_members without father_name auto-migrates column on first write',
    !colsBefore.includes('father_name') && colsAfter.includes('father_name') && r.status === 200 && r.json.ok === true,
    { colsBefore, colsAfter, r });
  ok('1b. father_name persists and hydrates cleanly on GET /api/records',
    saved && saved.name === 'Ali Mansour' && saved.father_name === 'Hassan' && saved.company === 'WTC',
    saved);
}

// 2. Sync shell floor (effectiveMinSyncShellVer -> HTTP 426) before CAS & holdMinShellVer
{
  const { env, d1 } = freshEnv(false);
  const effFloor = effectiveMinSyncShellVer();
  const effParts = effFloor.split('.').map(Number);
  const oneBelowFloor = (effParts.length && effParts[effParts.length - 1] > 0)
    ? effParts.slice(0, -1).concat(effParts[effParts.length - 1] - 1).join('.')
    : '19.6.345';
  ok('2a. MIN_SYNC_SHELL_VER is >= 19.6.354 and effectiveMinSyncShellVer caps below ceiling / holds above ceiling',
    compareShellVer(MIN_SYNC_SHELL_VER, '19.6.354') >= 0
    && effectiveMinSyncShellVer('19.6.352') === '19.6.352'
    && effectiveMinSyncShellVer('19.6.399') === MIN_SYNC_SHELL_VER
    && effectiveMinSyncShellVer('') === MIN_SYNC_SHELL_VER,
    { MIN_SYNC_SHELL_VER, DEPLOYED_SHELL_VER, effFloor });
  const expectedSeedStored = compareShellVer(MIN_SYNC_SHELL_VER, DEPLOYED_SHELL_VER) > 0 ? DEPLOYED_SHELL_VER : MIN_SYNC_SHELL_VER;
  const seed = await postSync(env, {
    op: 'patch',
    doc: 'mfg_web_store',
    patch: { mfg_web_store: { minShellVer: MIN_SYNC_SHELL_VER, updatedAt: '2026-11-14T10:00:00.000Z', customRecords: {} } },
  });
  ok(`2b. Push at v${MIN_SYNC_SHELL_VER} succeeds (200)`, seed.status === 200 && seed.json.ok && !seed.json.conflict, seed);

  for (const [label, patchDoc] of [
    ['missing minShellVer', { updatedAt: '2026-11-14T10:01:00.000Z' }],
    ['empty string', { minShellVer: '', updatedAt: '2026-11-14T10:01:01.000Z' }],
    [`below floor ${oneBelowFloor}`, { minShellVer: oneBelowFloor, updatedAt: '2026-11-14T10:01:02.000Z' }],
    ['legacy floor 19.6.345', { minShellVer: '19.6.345', updatedAt: '2026-11-14T10:01:02.500Z' }],
    ['malformed version', { minShellVer: '19.6.x', updatedAt: '2026-11-14T10:01:03.000Z' }],
  ]) {
    const rej = await postSync(env, {
      op: 'patch',
      doc: 'mfg_web_store',
      ifMatchUpdatedAt: '1999-01-01T00:00:00.000Z',
      patch: { mfg_web_store: patchDoc },
    });
    const stored = JSON.parse(d1.rows("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'mfg_web_store'")[0].payload_json);
    ok(`2c. Push with ${label} fails BEFORE CAS with HTTP 426 shell_outdated`,
      rej.status === 426 && rej.json.ok === false && rej.json.code === 'shell_outdated'
      && rej.json.minSyncShellVer === effFloor && stored.minShellVer === expectedSeedStored,
      rej);
  }
}

// 3. handleRecordsPost 409 same_name_conflict rules across staff_members, employments, freelance_entries
{
  const { env } = freshEnv(false);

  // Seed active employee in WTC
  const s1 = await postRec(env, 'employments', {
    id: 'emp-wtc-1',
    staff: 'Nabil Haddad',
    company: 'WTC',
    type: 'Staff',
    status: 'Active',
    start_date: '2025-01-10',
    end_date: '',
  });
  ok('3a. Initial employment contract in WTC succeeds', s1.status === 200 && s1.json.ok, s1);

  // Duplicate active contract in same company without confirmation -> 409
  const sDupEmp = await postRec(env, 'employments', {
    id: 'emp-wtc-2',
    staff: '  nabil   HADDAD ',
    company: 'Western Trading',
    type: 'Staff',
    status: 'Active',
    start_date: '2026-11-10',
  });
  ok('3b. Duplicate active contract in same company (canonical alias) returns 409 same_name_conflict',
    sDupEmp.status === 409 && sDupEmp.json.ok === false && sDupEmp.json.code === 'same_name_conflict'
    && sDupEmp.json.company === 'WTC' && sDupEmp.json.existingKind === 'contract',
    sDupEmp);

  // Duplicate staff_members in same company -> 409
  const smClash = await postRec(env, 'staff_members', {
    id: 'sm-wtc-2',
    name: 'Nabil Haddad',
    company: 'WTC',
    status: 'Active',
  });
  ok('3c. Adding staff_members matching active contract in same company returns 409 same_name_conflict',
    smClash.status === 409 && smClash.json.code === 'same_name_conflict' && smClash.json.company === 'WTC',
    smClash);

  // Same name in different company -> 200 (both employments and staff_members)
  const smOther = await postRec(env, 'staff_members', {
    id: 'sm-bbc-1',
    name: 'Nabil Haddad',
    father_name: 'Karim',
    company: 'BBConstruction',
    status: 'Active',
  });
  const empOther = await postRec(env, 'employments', {
    id: 'emp-lt-1',
    staff: 'Nabil Haddad',
    company: 'Lions Transport',
    type: 'Staff',
    status: 'Active',
    start_date: '2026-01-01',
  });
  ok('3d. Same name in a different company is allowed (staff_members + employments)',
    smOther.status === 200 && smOther.json.ok && empOther.status === 200 && empOther.json.ok,
    { smOther, empOther });

  // Two staff_members without contracts in same company -> 409, while own-row edit -> 200
  await postRec(env, 'staff_members', { id: 'sm-only-1', name: 'Tarek Sayegh', company: 'La Una', status: 'Active' });
  const smOnlyDup = await postRec(env, 'staff_members', { id: 'sm-only-2', name: 'Tarek Sayegh', company: 'La Una', status: 'Active' });
  const smOnlyEdit = await postRec(env, 'staff_members', { id: 'sm-only-1', name: 'Tarek Sayegh', father_name: 'Salim', company: 'La Una', status: 'Active' });
  ok('3e. Second staff_members row in same company returns 409, while editing own record with father_name returns 200',
    smOnlyDup.status === 409 && smOnlyDup.json.existingKind === 'staff' && smOnlyEdit.status === 200 && smOnlyEdit.json.ok,
    { smOnlyDup, smOnlyEdit });

  // Renewal with same_person_confirmed: true -> 200
  const sRenew = await postRec(env, 'employments', {
    id: 'emp-wtc-renew',
    staff: 'Nabil Haddad',
    company: 'WTC',
    type: 'Staff',
    status: 'Active',
    start_date: '2026-11-12',
    same_person_confirmed: true,
  });
  ok('3f. Renewal with same_person_confirmed: true succeeds (200)', sRenew.status === 200 && sRenew.json.ok, sRenew);

  // Ended contract rehire -> 200
  await postRec(env, 'employments', {
    id: 'emp-ended-1',
    staff: 'Ziad Karam',
    company: 'WTC',
    type: 'Staff',
    status: 'Ended',
    start_date: '2024-01-01',
    end_date: '2025-12-31',
  });
  const sRehire = await postRec(env, 'employments', {
    id: 'emp-rehire-2',
    staff: 'Ziad Karam',
    company: 'WTC',
    type: 'Staff',
    status: 'Active',
    start_date: '2026-11-01',
  });
  ok('3g. Rehiring an ended staff name in same company is allowed (200)', sRehire.status === 200 && sRehire.json.ok, sRehire);

  // Freelance rules: returning freelancer allowed; new freelance colliding with contract holder blocked (409)
  const flBlocked = await postRec(env, 'freelance_entries', {
    id: 'fl-wtc-1',
    staff: 'Nabil Haddad',
    company: 'WTC',
    date: '2026-11-10',
    amount: 50,
  });
  await postRec(env, 'freelance_entries', {
    id: 'fl-free-1',
    staff: 'Fadi Aoun',
    company: 'WTC',
    date: '2026-06-01',
    amount: 75,
  });
  const flReturn = await postRec(env, 'freelance_entries', {
    id: 'fl-free-2',
    staff: 'Fadi Aoun',
    company: 'WTC',
    date: '2026-11-11',
    amount: 90,
  });
  ok('3h. Freelance blocked (409) on active contract holder, returning freelancer allowed (200)',
    flBlocked.status === 409 && flBlocked.json.code === 'same_name_conflict' && flReturn.status === 200 && flReturn.json.ok,
    { flBlocked, flReturn });

  // Edit own contract in place -> 200; rename or move company onto another active person -> 409
  await postRec(env, 'employments', {
    id: 'emp-edit-src',
    staff: 'Samer Moussa',
    company: 'WTC',
    type: 'Staff',
    status: 'Active',
    start_date: '2026-03-01',
  });
  await postRec(env, 'employments', {
    id: 'emp-edit-other-co',
    staff: 'Nabil Haddad',
    company: 'Blanca',
    type: 'Staff',
    status: 'Active',
    start_date: '2026-03-01',
  });
  const editSame = await postRec(env, 'employments', {
    id: 'emp-edit-src',
    staff: 'Samer Moussa',
    company: 'WTC',
    type: 'Staff',
    status: 'Active',
    start_date: '2026-03-01',
    role: 'Supervisor',
  });
  const editRename = await postRec(env, 'employments', {
    id: 'emp-edit-src',
    staff: 'Nabil Haddad',
    company: 'WTC',
    type: 'Staff',
    status: 'Active',
    start_date: '2026-03-01',
  });
  const editMoveCo = await postRec(env, 'employments', {
    id: 'emp-edit-other-co',
    staff: 'Nabil Haddad',
    company: 'WTC',
    type: 'Staff',
    status: 'Active',
    start_date: '2026-03-01',
  });
  ok('3i. Editing own contract keeps 200; renaming or moving company onto active clash returns 409',
    editSame.status === 200 && editRename.status === 409 && editMoveCo.status === 409,
    { editSame, editRename, editMoveCo });
}

// 4. handleSync op=patch 409 same_name_conflict (stored clash, batch duplicate, and valid same-batch renewal)
{
  const { env } = freshEnv(false);
  await postRec(env, 'employments', {
    id: 'emp-sync-base',
    staff: 'Jad Khoury',
    company: 'WTC',
    type: 'Staff',
    status: 'Active',
    start_date: '2026-01-01',
    end_date: '',
  });

  // Patch adding duplicate active contract in same company -> 409
  const syncDupD1 = await postSync(env, {
    op: 'patch',
    doc: 'mfg_web_store',
    patch: {
      mfg_web_store: {
        minShellVer: MIN_SYNC_SHELL_VER,
        updatedAt: '2026-11-14T11:00:00.000Z',
        customRecords: {
          employments: [{
            id: 'emp-sync-dup-1',
            staff: 'Jad Khoury',
            company: 'WTC',
            type: 'Staff',
            status: 'Active',
            start_date: '2026-11-14',
          }],
        },
      },
    },
  });
  ok('4a. /api/sync patch with new duplicate active contract against D1 returns 409 same_name_conflict',
    syncDupD1.status === 409 && syncDupD1.json.code === 'same_name_conflict',
    syncDupD1);

  // Two duplicate new rows in same batch -> 409
  const syncDupBatch = await postSync(env, {
    op: 'patch',
    doc: 'mfg_web_store',
    patch: {
      mfg_web_store: {
        minShellVer: MIN_SYNC_SHELL_VER,
        updatedAt: '2026-11-14T11:01:00.000Z',
        customRecords: {
          staff_members: [
            { id: 'sm-b1', name: 'Batch Clone', company: 'WTC', status: 'Active' },
            { id: 'sm-b2', name: 'batch   clone', company: 'WTC', status: 'Active' },
          ],
        },
      },
    },
  });
  ok('4b. /api/sync patch with 2 duplicate new names in the same batch returns 409',
    syncDupBatch.status === 409 && syncDupBatch.json.code === 'same_name_conflict',
    syncDupBatch);

  // Valid renewal in a single sync batch (closes predecessor end_date + adds new contract) -> 200
  const syncValidRenew = await postSync(env, {
    op: 'patch',
    doc: 'mfg_web_store',
    patch: {
      mfg_web_store: {
        minShellVer: MIN_SYNC_SHELL_VER,
        updatedAt: '2026-11-14T11:02:00.000Z',
        customRecords: {
          employments: [
            {
              id: 'emp-sync-base',
              staff: 'Jad Khoury',
              company: 'WTC',
              type: 'Staff',
              status: 'Active',
              start_date: '2026-01-01',
              end_date: '2026-11-13',
            },
            {
              id: 'emp-sync-renew-2',
              staff: 'Jad Khoury',
              company: 'WTC',
              type: 'Staff',
              status: 'Active',
              start_date: '2026-11-14',
              end_date: '',
            },
          ],
        },
      },
    },
  });
  ok('4c. /api/sync patch that closes prior contract end_date and adds renewal in same batch succeeds (200)',
    syncValidRenew.status === 200 && syncValidRenew.json.ok === true && !syncValidRenew.json.conflict,
    syncValidRenew);
}

// 5. Red-Team regressions: archived/inactive staff_members filtering + staff_members-vs-staff_members ordering + active-emp exemptions
{
  const { env } = freshEnv(false);

  const rArch = await postRec(env, 'staff_members', { id: 'sm-reg-arch', name: 'Maroun Inactive', company: 'WTC', status: 'Active', archived: true });
  const rClos = await postRec(env, 'staff_members', { id: 'sm-reg-clos', name: 'Maroun Inactive', company: 'WTC', status: 'Closed' });
  const rTerm = await postRec(env, 'staff_members', { id: 'sm-reg-term', name: 'Maroun Inactive', company: 'WTC', status: 'Terminated' });
  const rInac = await postRec(env, 'staff_members', { id: 'sm-reg-inac', name: 'Maroun Inactive', company: 'WTC', status: 'Inactive' });
  const rCanc = await postRec(env, 'staff_members', { id: 'sm-reg-canc', name: 'Maroun Inactive', company: 'WTC', status: 'Cancelled' });
  const rAct = await postRec(env, 'staff_members', { id: 'sm-reg-act1', name: 'Maroun Inactive', company: 'WTC', status: 'Active' });
  const rDup = await postRec(env, 'staff_members', { id: 'sm-reg-act2', name: 'Maroun Inactive', company: 'WTC', status: 'Active' });
  ok('5a. archived and closed/terminated/inactive/cancelled staff_members rows never block an active entry; 2nd active does (409)',
    rArch.status === 200 && rClos.status === 200 && rTerm.status === 200 && rInac.status === 200 && rCanc.status === 200
    && rAct.status === 200 && rDup.status === 409 && rDup.json.code === 'same_name_conflict',
    { rArch, rClos, rTerm, rInac, rCanc, rAct, rDup });

  // Active employment in WTC blocks unrelated staff_members unless exempted by same_person_confirmed / stf_seed_ / enrolled_emp_id / allSalaryPending;
  // AND even when exempted against employments, a 2nd duplicate staff_members row STILL returns 409 (curMap runs first).
  await postRec(env, 'employments', { id: 'emp-reg-1', staff: 'Fadi Guard', company: 'WTC', type: 'Staff', status: 'Active', start_date: '2026-01-01' });
  const rSmBlock = await postRec(env, 'staff_members', { id: 'sm-fadi-bad', name: 'Fadi Guard', company: 'WTC', status: 'Active' });
  const rSmOtherCo = await postRec(env, 'staff_members', { id: 'sm-fadi-bb', name: 'Fadi Guard', company: 'BBConstruction', status: 'Active' });
  const rSmLink = await postRec(env, 'staff_members', { id: 'sm-fadi-link', name: 'Fadi Guard', company: 'WTC', status: 'Active', enrolled_emp_id: 'emp-reg-1' });
  const rSm2ndLink = await postRec(env, 'staff_members', { id: 'sm-fadi-link2', name: 'Fadi Guard', company: 'WTC', status: 'Active', enrolled_emp_id: 'emp-reg-1' });
  ok('5b. active employment blocks unrelated staff_members (409), allows enrolled_emp_id link (200), yet blocks 2nd duplicate staff_members (409)',
    rSmBlock.status === 409 && rSmBlock.json.code === 'same_name_conflict'
    && rSmOtherCo.status === 200
    && rSmLink.status === 200
    && rSm2ndLink.status === 409 && rSm2ndLink.json.code === 'same_name_conflict',
    { rSmBlock, rSmOtherCo, rSmLink, rSm2ndLink });

  await postRec(env, 'employments', { id: 'emp-reg-pend', staff: 'Ziad Pending', company: 'WTC', type: 'Staff', status: 'Active', start_date: '2026-01-01', salary_pending: true });
  const rPend1 = await postRec(env, 'staff_members', { id: 'sm-ziad-1', name: 'Ziad Pending', company: 'WTC', status: 'Active' });
  const rPend2 = await postRec(env, 'staff_members', { id: 'sm-ziad-2', name: 'Ziad Pending', company: 'WTC', status: 'Active' });
  ok('5c. salary_pending active employment exempts 1st staff_members (200) yet still blocks 2nd staff_members (409)',
    rPend1.status === 200 && rPend2.status === 409 && rPend2.json.code === 'same_name_conflict',
    { rPend1, rPend2 });

  const syncSeed = await postSync(env, {
    op: 'patch',
    doc: 'mfg_web_store',
    patch: {
      mfg_web_store: {
        minShellVer: MIN_SYNC_SHELL_VER,
        updatedAt: '2026-11-14T11:05:00.000Z',
        customRecords: {
          staff_members: [{ id: 'stf_seed_fg', name: 'Fadi Guard', company: 'BBConstruction', status: 'Active' }],
        },
      },
    },
  });
  ok('5d. /api/sync rejects duplicate stf_seed_ against existing active BBConstruction staff_members (409)',
    syncSeed.status === 409 && syncSeed.json.code === 'same_name_conflict',
    syncSeed);

  // 5e. Inserting a duplicate active row carrying salary_pending: true without same_person_confirmed: true -> 409 across all 3 tables
  const rPendEmp = await postRec(env, 'employments', { id: 'emp-dup-pend', staff: 'Fadi Guard', company: 'WTC', type: 'Staff', status: 'Active', start_date: '2026-11-15', salary_pending: true });
  const rPendFl = await postRec(env, 'freelance_entries', { id: 'fl-dup-pend', staff: 'Fadi Guard', company: 'WTC', date: '2026-11-15', salary_pending: true, amount: 0 });
  const rPendSm = await postRec(env, 'staff_members', { id: 'sm-dup-pend', name: 'Maroun Inactive', company: 'WTC', status: 'Active', salary_pending: true });
  ok('5e. Duplicate active inserts with salary_pending: true without same_person_confirmed return 409',
    rPendEmp.status === 409 && rPendEmp.json.code === 'same_name_conflict'
    && rPendFl.status === 409 && rPendFl.json.code === 'same_name_conflict'
    && rPendSm.status === 409 && rPendSm.json.code === 'same_name_conflict',
    { rPendEmp, rPendFl, rPendSm });

  // 5f. Reactivating an Ended/archived row onto an existing active homonym without same_person_confirmed -> 409; with same_person_confirmed -> 200
  const rSeedEnd = await postRec(env, 'employments', { id: 'emp-react-ended', staff: 'Fadi Guard', company: 'WTC', type: 'Staff', status: 'Ended', start_date: '2024-01-01', end_date: '2024-12-31' });
  const rReactEmp = await postRec(env, 'employments', { id: 'emp-react-ended', staff: 'Fadi Guard', company: 'WTC', type: 'Staff', status: 'Active', start_date: '2024-01-01', end_date: '' });
  const rReactSm = await postRec(env, 'staff_members', { id: 'sm-reg-arch', name: 'Maroun Inactive', company: 'WTC', status: 'Active', archived: false });
  const rReactEmpOk = await postRec(env, 'employments', { id: 'emp-react-ended', staff: 'Fadi Guard', company: 'WTC', type: 'Staff', status: 'Active', start_date: '2024-01-01', end_date: '', same_person_confirmed: true });
  ok('5f. Reactivating Ended employment or archived staff_members onto an active homonym returns 409 unless confirmed',
    rSeedEnd.status === 200
    && rReactEmp.status === 409 && rReactEmp.json.code === 'same_name_conflict'
    && rReactSm.status === 409 && rReactSm.json.code === 'same_name_conflict'
    && rReactEmpOk.status === 200,
    { rReactEmp, rReactSm, rReactEmpOk });

  // 5g. Inserting employments or freelance_entries matching an active uncontracted staff_members row without confirmation -> 409
  const rUnconSm = await postRec(env, 'staff_members', { id: 'sm-uncon-wtc', name: 'Tarek Uncon', company: 'WTC', status: 'Active' });
  const rUnconEmp = await postRec(env, 'employments', { id: 'emp-uncon-dup', staff: 'Tarek Uncon', company: 'WTC', type: 'Staff', status: 'Active', start_date: '2026-11-15', enrolled_staff_id: 'sm-uncon-wtc' });
  const rUnconFl = await postRec(env, 'freelance_entries', { id: 'fl-uncon-dup', staff: 'Tarek Uncon', company: 'WTC', date: '2026-11-15', amount: 50 });
  const rUnconOk = await postRec(env, 'employments', { id: 'emp-uncon-dup', staff: 'Tarek Uncon', company: 'WTC', type: 'Staff', status: 'Active', start_date: '2026-11-15', same_person_confirmed: true });
  ok('5g. Active uncontracted staff_members blocks unconfirmed employments/freelance_entries (409) until confirmed (200)',
    rUnconSm.status === 200
    && rUnconEmp.status === 409 && rUnconEmp.json.code === 'same_name_conflict'
    && rUnconFl.status === 409 && rUnconFl.json.code === 'same_name_conflict'
    && rUnconOk.status === 200,
    { rUnconSm, rUnconEmp, rUnconFl, rUnconOk });

  // 5h. Non-Owner BU RLS on staff_members across GET, POST and /api/sync (relational D1 + edge_kv_store)
  {
    const envRls = freshEnv().env;
    const ENTRY_WTC = { sub: 'u3', role: 'Entry', companies: 'WTC', email: 'u3@example.test' };
    await postRec(envRls, 'staff_members', { id: 'sm-rls-wtc', name: 'Owner WTC', company: 'WTC', status: 'Active' }, OWNER);
    await postRec(envRls, 'staff_members', { id: 'sm-rls-bbc', name: 'Owner BBC', company: 'BBConstruction', status: 'Active' }, OWNER);
    await postRec(envRls, 'staff_members', { id: 'sm-rls-blank', name: 'Owner Blank', company: '', status: 'Active' }, OWNER);
    await postSync(envRls, {
      op: 'patch',
      doc: 'mfg_web_store',
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: '2026-11-14T11:55:00.000Z',
          customRecords: {
            staff_members: [
              { id: 'sm-kv-blank', name: 'Owner KV Blank', company: '', status: 'Active' },
            ],
          },
        },
      },
    }, OWNER);

    const pBlank = await postRec(envRls, 'staff_members', { id: 'sm-u3-blank', name: 'U3 Blank', company: '', status: 'Active' }, ENTRY_WTC);
    const pBbc = await postRec(envRls, 'staff_members', { id: 'sm-u3-bbc', name: 'U3 BBC', company: 'BBConstruction', status: 'Active' }, ENTRY_WTC);
    const pOverBbc = await postRec(envRls, 'staff_members', { id: 'sm-rls-bbc', name: 'Hijacked BBC', company: 'WTC', status: 'Active' }, ENTRY_WTC);
    const pOverBlank = await postRec(envRls, 'staff_members', { id: 'sm-rls-blank', name: 'Hijacked Blank', company: 'WTC', status: 'Active' }, ENTRY_WTC);
    const rdEntry = await getRecs(envRls, 'staff_members', ENTRY_WTC);
    const rdIds = new Set((rdEntry.json.rows || []).map(r => r.id));

    const sAttempt = await postSync(envRls, {
      op: 'patch',
      doc: 'mfg_web_store',
      patch: {
        mfg_web_store: {
          minShellVer: MIN_SYNC_SHELL_VER,
          updatedAt: '2026-11-14T12:00:00.000Z',
          customRecords: {
            staff_members: [
              { id: 'sm-rls-bbc', name: 'Sync Hijack BBC', company: 'WTC', status: 'Active' },
              { id: 'sm-rls-blank', name: 'Sync Hijack Blank', company: 'WTC', status: 'Active' },
              { id: 'sm-kv-blank', name: 'Sync Hijack KV Blank', company: 'WTC', status: 'Active' },
              { id: 'sm-sync-blank', name: 'Sync New Blank', company: '', status: 'Active' },
              { id: 'sm-sync-bbc', name: 'Sync New BBC', company: 'BBConstruction', status: 'Active' },
              { id: 'sm-sync-wtc', name: 'Sync New WTC', company: 'WTC', status: 'Active' },
            ],
          },
        },
      },
    }, ENTRY_WTC);

    const bbcRow = envRls.DB.rows("SELECT name, company FROM staff_members WHERE id = 'sm-rls-bbc'")[0];
    const blankRow = envRls.DB.rows("SELECT name, company FROM staff_members WHERE id = 'sm-rls-blank'")[0];
    const kvBlankRow = envRls.DB.rows("SELECT name, company FROM staff_members WHERE id = 'sm-kv-blank'")[0];
    const syncWtcRow = envRls.DB.rows("SELECT name, company FROM staff_members WHERE id = 'sm-sync-wtc'")[0];
    const syncExtra = envRls.DB.rows("SELECT id FROM staff_members WHERE id IN ('sm-sync-blank', 'sm-sync-bbc')");
    const kvRow = envRls.DB.rows("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'mfg_web_store'")[0];
    const kvStaff = kvRow ? ((JSON.parse(kvRow.payload_json || '{}').customRecords || {}).staff_members || []) : [];
    const kvById = new Map(kvStaff.map(r => [r.id, r]));

    ok('5h. Non-Owner BU RLS on staff_members blocks cross-BU/blank POSTs, hides them from GET, and drops cross-BU/blank /api/sync writes',
      pBlank.status === 403 && pBbc.status === 403 && pOverBbc.status === 403 && pOverBlank.status === 403
      && rdEntry.status === 200 && rdIds.has('sm-rls-wtc') && !rdIds.has('sm-rls-bbc') && !rdIds.has('sm-rls-blank') && !rdIds.has('sm-kv-blank')
      && sAttempt.status === 200
      && bbcRow && bbcRow.name === 'Owner BBC' && bbcRow.company === 'BBConstruction'
      && blankRow && blankRow.name === 'Owner Blank' && blankRow.company === ''
      && kvBlankRow && kvBlankRow.name === 'Owner KV Blank' && kvBlankRow.company === ''
      && syncWtcRow && syncWtcRow.name === 'Sync New WTC' && syncWtcRow.company === 'WTC'
      && syncExtra.length === 0
      && kvById.has('sm-kv-blank') && kvById.get('sm-kv-blank').company === '' && kvById.get('sm-kv-blank').name === 'Owner KV Blank'
      && kvById.has('sm-sync-wtc')
      && !kvById.has('sm-rls-bbc') && !kvById.has('sm-rls-blank') && !kvById.has('sm-sync-blank') && !kvById.has('sm-sync-bbc'),
      { pBlank, pBbc, pOverBbc, pOverBlank, rdIds: [...rdIds], sAttempt, bbcRow, blankRow, kvBlankRow, syncWtcRow, syncExtra, kvStaff });
  }

  // 5i. Blank-company staff_members isolation: never cross-blocks named BUs, and moving into occupied BU returns 409
  {
    const envBlank = freshEnv().env;
    const rSeedBlank = await postRec(envBlank, 'staff_members', { id: 'sm-legacy-blank', name: 'Legacy Blank', company: '', status: 'Active' }, OWNER);
    const rWtcEmp = await postRec(envBlank, 'employments', { id: 'emp-blank-wtc', staff: 'Legacy Blank', company: 'WTC', type: 'Staff', status: 'Active', start_date: '2026-11-15' }, OWNER);
    const rBbcSm = await postRec(envBlank, 'staff_members', { id: 'sm-blank-bbc', name: 'Legacy Blank', company: 'BBConstruction', status: 'Active' }, OWNER);
    const rMoveConflict = await postRec(envBlank, 'staff_members', { id: 'sm-legacy-blank', name: 'Legacy Blank', company: 'WTC', status: 'Active' }, OWNER);
    const keptBlank = envBlank.DB.rows("SELECT company FROM staff_members WHERE id = 'sm-legacy-blank'")[0];
    ok('5i. Blank-company staff_members row does not cross-block WTC/BBConstruction, but moving it into WTC with active homonym returns 409',
      rSeedBlank.status === 200 && rWtcEmp.status === 200 && rBbcSm.status === 200
      && rMoveConflict.status === 409 && rMoveConflict.json.code === 'same_name_conflict'
      && keptBlank && keptBlank.company === '',
      { rSeedBlank, rWtcEmp, rBbcSm, rMoveConflict, keptBlank });
  }

  // 5j. handleKioskVerify (op: sync) handles non-numeric faces[].sample cleanly without NaN keys
  {
    const envK = freshEnv().env;
    const helpers = { isOwnerOrFullGroupSession, canAccessCompany };
    const callKiosk = async (body, { key, session } = {}) => {
      const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.10.0.5' };
      if (key) headers['X-Kiosk-Key'] = key;
      const req = new Request('https://example.test/app/api/kiosk/verify', { method: 'POST', headers, body: JSON.stringify(body) });
      const res = await handleKioskVerify(req, envK, session || null, body, helpers);
      const json = await res.json();
      noteText(json);
      return { status: res.status, json };
    };
    const K_KEY = 'station-key-edge-5j-01';
    const prov = await callKiosk({ op: 'provision_station_key', site: 'LAUNA', rawKey: K_KEY, label: 'Edge 5j' }, { session: OWNER });
    const vec = seed => Array.from({ length: 128 }, (_, i) => i === (seed % 128) ? 0.65 : 0.01);
    const syncSamp = await callKiosk({
      op: 'sync',
      site: 'LAUNA',
      staff: [{ id: 'sm-samp-1', name: 'Rami Sample Edge', fatherName: 'Adel' }],
      faces: [
        { id: 'sm-samp-1:1', staffId: 'sm-samp-1', sample: 'abc', descriptor: vec(1) },
        { id: 'sm-samp-1:2', staffId: 'sm-samp-1', sample: null, descriptor: vec(2) },
        { id: 'sm-samp-1:3', staffId: 'sm-samp-1', sample: 99, descriptor: vec(3) },
      ],
    }, { key: K_KEY });
    const bioRow = envK.DB.rows("SELECT face_samples FROM kiosk_biometrics WHERE person_id = 'sm-samp-1'")[0];
    const parsedVecs = bioRow ? JSON.parse(bioRow.face_samples || '[]') : [];
    ok('5j. handleKioskVerify op=sync handles non-numeric faces[].sample ("abc", null, 99) cleanly with 3 stored descriptors and no NaN slots',
      prov.status === 200 && prov.json.ok && syncSamp.status === 200 && syncSamp.json.ok
      && (syncSamp.json.faces || []).length === 3 && (syncSamp.json.rejectedFaces || []).length === 0
      && Array.isArray(parsedVecs) && parsedVecs.length === 3
      && parsedVecs.every(v => Array.isArray(v) && v.length === 128 && v.every(Number.isFinite)),
      { prov, syncSamp, vecCount: parsedVecs.length });
  }
}

// 6. Outward copy hygiene check on all API responses collected
{
  const joined = textToAudit.join('\n');
  const badDashOrArrow = /[—→]/.test(joined);
  const badBrand = /\b(THEO|Dataverse|Power\s*Apps|Power\s*BI|Microsoft|SharePoint)\b/i.test(joined);
  ok('6. All server error payloads follow outward copy hygiene (0 em-dash, 0 arrow, 0 internal/Microsoft names)',
    !badDashOrArrow && !badBrand,
    { badDashOrArrow, badBrand });
}

console.log(`\nverify_same_name_edge: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
