// Offline Edge verification gate for HR compliance schema, single-use QR phone-camera handoff,
// R2 preview lifecycle, 3-scan limit, consume PII scrub, expiration, and RLS enforcement.
// Runs directly against functions/app/api/[[route]].js with node:sqlite + in-memory R2 mock (no workerd.exe).
// Run: node build/verify_hr_phone_edge.mjs

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
    objects,
    async put(key, val, opts = {}) {
      objects.set(String(key), { val, opts });
    },
    async get(key) {
      const hit = objects.get(String(key));
      if (!hit) return null;
      const str = typeof hit.val === 'string' ? hit.val : Buffer.from(hit.val).toString('utf8');
      return {
        body: str,
        async text() { return str; },
        async arrayBuffer() { return Buffer.from(str, 'utf8').buffer; }
      };
    },
    async delete(key) {
      objects.delete(String(key));
    }
  };
}

const SCHEMA_SQL = readFileSync(new URL('../migrations/0001_schema.sql', import.meta.url), 'utf8');
const JWT_SECRET = 'unit-test-jwt-secret-key-32-chars!!'; // secret-scan: allow
const GEMINI_KEY = 'test-dummy-gemini-key-0001'; // secret-scan: allow
const TINY_PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

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

const origFetch = globalThis.fetch;
let geminiCalls = 0;
globalThis.fetch = async (input, init = {}) => {
  const urlStr = typeof input === 'string' ? input : String(input && input.url || '');
  if (urlStr.startsWith('https://generativelanguage.googleapis.com/')) {
    geminiCalls++;
    return new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              docKind: 'work_permit',
              fullNameLatin: 'Tarek Salim Haddad',
              fullNameArabic: 'طارق سليم حداد',
              fatherNameLatin: 'Salim',
              fatherNameArabic: 'سليم',
              motherNameLatin: 'Salwa Karam',
              motherNameArabic: 'سلوى كرم',
              dob: '1991-06-12',
              nationalityLatin: 'Syrian',
              nationalityArabic: 'سوري',
              nssfNumber: '882190',
              workPermitNumber: 'WP-7722',
              workPermitExpiryDate: '2026-12-15'
            })
          }]
        }
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return origFetch(input, init);
};

async function createTestContext({ strippedLegacy = false } = {}) {
  const d1 = new D1();
  let sql = SCHEMA_SQL;
  if (strippedLegacy) {
    sql = sql
      .replace(/CREATE TABLE IF NOT EXISTS staff_members \([\s\S]*?\);/, "CREATE TABLE IF NOT EXISTS staff_members (id TEXT PRIMARY KEY, name TEXT DEFAULT '', company TEXT DEFAULT '', role TEXT DEFAULT '', phone TEXT DEFAULT '', status TEXT DEFAULT 'Active', payload_json TEXT DEFAULT '{}');")
      .replace(/CREATE TABLE IF NOT EXISTS phone_scan_sessions \([\s\S]*?\);/, "CREATE TABLE IF NOT EXISTS phone_scan_sessions (sid TEXT PRIMARY KEY, tok TEXT NOT NULL, status TEXT DEFAULT 'waiting', pages_json TEXT DEFAULT '[]', rtc_offer TEXT DEFAULT '', rtc_answer TEXT DEFAULT '', updated_ms INTEGER NOT NULL DEFAULT 0);");
  }
  d1.exec(sql);
  d1.db.prepare(
    "INSERT INTO users (id, full_name, email, role, companies, pbi_access, statements_access, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run('u1', 'Owner Seat', 'owner@example.test', 'Full Access (Owner)', 'ALL', 'full', 'full', 'Active');
  d1.db.prepare(
    "INSERT INTO users (id, full_name, email, role, companies, pbi_access, statements_access, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run('u3', 'WTC Supervisor', 'sup.wtc@example.test', 'Supervisor + Entry', 'WTC', 'partial', 'partial', 'Active');
  d1.db.prepare(
    "INSERT INTO auth_sessions (id, user_id, email, full_name, role, companies, logged_in_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run('sess_owner_1', 'u1', 'owner@example.test', 'Owner Seat', 'Full Access (Owner)', 'ALL', '2026-11-15T10:00:00Z');
  d1.db.prepare(
    "INSERT INTO auth_sessions (id, user_id, email, full_name, role, companies, logged_in_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run('sess_wtc_1', 'u3', 'sup.wtc@example.test', 'WTC Supervisor', 'Supervisor + Entry', 'WTC', '2026-11-15T10:00:00Z');

  const bucket = createMockBucket();
  const env = {
    DB: d1,
    BUCKET: bucket,
    ISABI_JWT_SECRET: JWT_SECRET, // secret-scan: allow
    GEMINI_API_KEY: GEMINI_KEY // secret-scan: allow
  };
  const ownerTok = await signEdgeSession({
    sid: 'sess_owner_1', sub: 'u1', email: 'owner@example.test', role: 'Full Access (Owner)', companies: 'ALL'
  }, env);
  const wtcSupTok = await signEdgeSession({
    sid: 'sess_wtc_1', sub: 'u3', email: 'sup.wtc@example.test', role: 'Supervisor + Entry', companies: 'WTC'
  }, env);

  async function callEdge(method, pathAndQuery, body = null, headers = {}, envOverride = null) {
    const fullUrl = `https://isabisystems.com${pathAndQuery}`;
    const u = new URL(fullUrl);
    const routeParts = u.pathname.replace(/^\/app\/api\/?/, '').split('/').filter(Boolean);
    const hdrs = new Headers(Object.assign({ Origin: 'https://isabisystems.com', 'X-ISABI-Shell': MIN_SYNC_SHELL_VER }, headers));
    let reqBody;
    if (body !== null) {
      reqBody = typeof body === 'string' ? body : JSON.stringify(body);
      if (!hdrs.has('Content-Type')) hdrs.set('Content-Type', 'application/json');
    }
    const waits = [];
    const res = await onRequest({
      request: new Request(fullUrl, { method, headers: hdrs, body: reqBody }),
      env: envOverride || env,
      params: { route: routeParts },
      waitUntil(p) { waits.push(Promise.resolve(p)); }
    });
    await Promise.all(waits);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { status: res.status, headers: res.headers, text, json };
  }

  return { d1, bucket, env, ownerTok, wtcSupTok, callEdge };
}

try {
  // 1. Auth & RLS guards on init_id_card
  const ctx = await createTestContext();
  const sid1 = 'ps_edge_' + Date.now();
  const tok1 = 'tok_edge_secret_123';

  const unauthInit = await ctx.callEdge('POST', '/app/api/phone-scan', { sid: sid1, k: tok1, op: 'init_id_card', company: 'WTC' });
  const demoInit = await ctx.callEdge('POST', '/app/api/phone-scan', { sid: sid1, k: tok1, op: 'init_id_card', company: 'WTC' }, {
    'X-ISABI-Demo': '1',
    'X-ISABI-Session': ctx.ownerTok
  });
  const rlsWrongCo = await ctx.callEdge('POST', '/app/api/phone-scan', { sid: sid1, k: tok1, op: 'init_id_card', company: 'BBConstruction' }, {
    'X-ISABI-Session': ctx.wtcSupTok
  });
  const rlsAllCo = await ctx.callEdge('POST', '/app/api/phone-scan', { sid: sid1, k: tok1, op: 'init_id_card', company: 'all' }, {
    'X-ISABI-Session': ctx.wtcSupTok
  });
  const wtcInitOk = await ctx.callEdge('POST', '/app/api/phone-scan', { sid: sid1, k: tok1, op: 'init_id_card', company: 'WTC' }, {
    'X-ISABI-Session': ctx.wtcSupTok
  });
  const unauthProbeExisting = await ctx.callEdge('POST', '/app/api/phone-scan', { sid: sid1, k: 'wrong', op: 'init_id_card', company: 'WTC' });

  ok('1. init_id_card enforces 401 unauth/demo, 403 wrong-BU/all RLS, 200 permitted entity, and 401 on unauth probe of existing sid',
    unauthInit.status === 401
    && demoInit.status === 401
    && rlsWrongCo.status === 403
    && rlsAllCo.status === 403
    && wtcInitOk.status === 200 && wtcInitOk.json?.mode === 'id_card' && wtcInitOk.json?.status === 'waiting'
    && unauthProbeExisting.status === 401,
    { statuses: [unauthInit.status, demoInit.status, rlsWrongCo.status, rlsAllCo.status, wtcInitOk.status, unauthProbeExisting.status] }
  );

  // 2. Mode lock on id_card session + connected beacon + token mismatch
  const wrongTokPost = await ctx.callEdge('POST', '/app/api/phone-scan', { sid: sid1, k: 'badtok', op: 'update', status: 'connected' });
  const badPagesUpdate = await ctx.callEdge('POST', '/app/api/phone-scan', {
    sid: sid1, k: tok1, op: 'update', status: 'connected', pages: [{ id: 'x', dataUrl: TINY_PNG_DATA_URL }]
  });
  const badRtcUpdate = await ctx.callEdge('POST', '/app/api/phone-scan', { sid: sid1, k: tok1, op: 'update', rtcOffer: { type: 'offer' } });
  const badStatusUpdate = await ctx.callEdge('POST', '/app/api/phone-scan', { sid: sid1, k: tok1, op: 'update', status: 'pages_ready' });
  const goodConnected = await ctx.callEdge('POST', '/app/api/phone-scan', { sid: sid1, k: tok1, status: 'connected' });

  ok('2. id_card session rejects wrong token (403) and generic pages/RTC/arbitrary status mutations (400), while allowing connected beacon (200)',
    wrongTokPost.status === 403
    && badPagesUpdate.status === 400
    && badRtcUpdate.status === 400
    && badStatusUpdate.status === 400
    && goodConnected.status === 200 && goodConnected.json?.status === 'connected',
    { statuses: [wrongTokPost.status, badPagesUpdate.status, badRtcUpdate.status, badStatusUpdate.status, goodConnected.status] }
  );

  // 3. Unauthenticated mobile /app/api/smart-scan 3-scan limit -> 429 on 4th
  const smartBody = {
    scanMode: 'id_card',
    phoneScanSid: sid1,
    phoneScanTok: tok1,
    extractedText: 'NSSF: 882190 Work Permit: WP-7722 Mother: Salwa Karam',
    dataUrl: TINY_PNG_DATA_URL,
    mimeType: 'image/png'
  };
  const s1 = await ctx.callEdge('POST', '/app/api/smart-scan', smartBody);
  const s2 = await ctx.callEdge('POST', '/app/api/smart-scan', smartBody);
  const s3 = await ctx.callEdge('POST', '/app/api/smart-scan', smartBody);
  const s4 = await ctx.callEdge('POST', '/app/api/smart-scan', smartBody);

  ok('3. /app/api/smart-scan enforces exact 3-scan limit per phoneScanSid (200, 200, 200, then 429 scan_limit_reached)',
    s1.status === 200 && s1.json?.parsed?.nssfNumber === '882190'
    && s2.status === 200 && s3.status === 200
    && s4.status === 429 && s4.json?.code === 'scan_limit_reached'
    && geminiCalls === 3,
    { statuses: [s1.status, s2.status, s3.status, s4.status], code4: s4.json?.code, geminiCalls }
  );

  // 4. complete_id_card stores preview in R2 (not D1 inline), blocks id_ready downgrade, and consumes + purges R2 + scrubs PII
  const compOk = await ctx.callEdge('POST', '/app/api/phone-scan', {
    sid: sid1,
    k: tok1,
    op: 'complete_id_card',
    extracted: {
      docKind: 'work_permit',
      fullNameLatin: 'Tarek Salim Haddad',
      motherNameLatin: 'Salwa Karam',
      motherNameArabic: 'سلوى كرم',
      nssfNumber: '882190',
      workPermitNumber: 'WP-7722',
      workPermitExpiryDate: '2026-12-15'
    },
    pages: [{ id: 'id-card-1', mimeType: 'image/png', dataUrl: TINY_PNG_DATA_URL }]
  });
  const r2Key = `phone-scan/${sid1}/id-card-1.txt`;
  const r2HasBefore = ctx.bucket.objects.has(r2Key);
  const rowBeforeConsume = ctx.d1.rows('SELECT status, pages_json, meta_json FROM phone_scan_sessions WHERE sid = ?', sid1)[0];
  const badPoll = await ctx.callEdge('GET', `/app/api/phone-scan?sid=${encodeURIComponent(sid1)}&k=wrongtok`);
  const goodPoll = await ctx.callEdge('GET', `/app/api/phone-scan?sid=${encodeURIComponent(sid1)}&k=${encodeURIComponent(tok1)}`);
  const connectedAfterReady = await ctx.callEdge('POST', '/app/api/phone-scan', { sid: sid1, k: tok1, status: 'connected' });
  const consumeOk = await ctx.callEdge('POST', '/app/api/phone-scan', { sid: sid1, k: tok1, op: 'consume' });
  const rowAfterConsume = ctx.d1.rows('SELECT status, pages_json, meta_json FROM phone_scan_sessions WHERE sid = ?', sid1)[0];
  const replayPoll = await ctx.callEdge('GET', `/app/api/phone-scan?sid=${encodeURIComponent(sid1)}&k=${encodeURIComponent(tok1)}`);
  const replayComplete = await ctx.callEdge('POST', '/app/api/phone-scan', {
    sid: sid1, k: tok1, op: 'complete_id_card', extracted: { fullNameLatin: 'Replay' }
  });
  const replayScan = await ctx.callEdge('POST', '/app/api/smart-scan', smartBody);
  const replayConnected = await ctx.callEdge('POST', '/app/api/phone-scan', { sid: sid1, k: tok1, status: 'connected' });

  const metaAfter = JSON.parse(rowAfterConsume?.meta_json || '{}');
  ok('4. complete_id_card offloads preview to R2, consumes deletes R2 + scrubs D1 PII, and replay attempts return 403 already_consumed',
    compOk.status === 200
    && r2HasBefore
    && !String(rowBeforeConsume?.pages_json || '').includes('data:image/png;base64')
    && badPoll.json?.found === false
    && goodPoll.status === 200 && goodPoll.json?.session?.extracted?.nssfNumber === '882190'
    && goodPoll.json?.session?.pages?.[0]?.dataUrl === TINY_PNG_DATA_URL
    && connectedAfterReady.status === 200 && connectedAfterReady.json?.status === 'id_ready'
    && consumeOk.status === 200 && consumeOk.json?.consumed === true
    && !ctx.bucket.objects.has(r2Key)
    && rowAfterConsume?.status === 'consumed' && rowAfterConsume?.pages_json === '[]' && metaAfter.extracted === null
    && replayPoll.status === 200 && replayPoll.json?.session?.status === 'consumed' && replayPoll.json?.session?.extracted === null && replayPoll.json?.session?.pages?.length === 0
    && replayComplete.status === 403 && replayComplete.json?.code === 'already_consumed'
    && replayScan.status === 403 && replayScan.json?.code === 'already_consumed'
    && replayConnected.status === 403 && replayConnected.json?.code === 'already_consumed',
    { r2HasBefore, replayCodes: [replayComplete.json?.code, replayScan.json?.code, replayConnected.json?.code] }
  );

  // 5. Expired 10-minute TTL rejects smart-scan, complete_id_card, connected beacon & hides GET payload
  const sidExp = 'ps_exp_' + Date.now();
  const tokExp = 'tok_exp_123';
  await ctx.callEdge('POST', '/app/api/phone-scan', { sid: sidExp, k: tokExp, op: 'init_id_card', company: 'WTC' }, {
    'X-ISABI-Session': ctx.ownerTok
  });
  const expRow = ctx.d1.rows('SELECT meta_json FROM phone_scan_sessions WHERE sid = ?', sidExp)[0];
  const expMeta = JSON.parse(expRow.meta_json);
  expMeta.expiresAtMs = Date.now() - 5000;
  ctx.d1.db.prepare('UPDATE phone_scan_sessions SET meta_json = ? WHERE sid = ?').run(JSON.stringify(expMeta), sidExp);

  const expScan = await ctx.callEdge('POST', '/app/api/smart-scan', {
    scanMode: 'id_card', phoneScanSid: sidExp, phoneScanTok: tokExp, extractedText: 'ID'
  });
  const expComplete = await ctx.callEdge('POST', '/app/api/phone-scan', {
    sid: sidExp, k: tokExp, op: 'complete_id_card', extracted: { fullNameLatin: 'Expired' }
  });
  const expConn = await ctx.callEdge('POST', '/app/api/phone-scan', { sid: sidExp, k: tokExp, status: 'connected' });
  const expGet = await ctx.callEdge('GET', `/app/api/phone-scan?sid=${encodeURIComponent(sidExp)}&k=${encodeURIComponent(tokExp)}`);

  ok('5. Expired session (>10m TTL) returns 403 expired on smart-scan/complete/update and masks payload on GET',
    expScan.status === 403 && expScan.json?.code === 'expired'
    && expComplete.status === 403 && expComplete.json?.code === 'expired'
    && expConn.status === 403 && expConn.json?.code === 'expired'
    && expGet.status === 200 && expGet.json?.session?.expired === true && expGet.json?.session?.status === 'expired'
    && expGet.json?.session?.extracted === null && expGet.json?.session?.pages?.length === 0,
    { statuses: [expScan.status, expComplete.status, expConn.status], expGet: expGet.json }
  );

  // 6. All 13 staff_members HR/compliance fields round-trip on /app/api/records AND /app/api/sync, plus legacy schema auto-migration
  const legacyCtx = await createTestContext({ strippedLegacy: true });
  const sidLeg = 'ps_leg_' + Date.now();
  const tokLeg = 'tok_leg_123';
  const legInit = await legacyCtx.callEdge('POST', '/app/api/phone-scan', { sid: sidLeg, k: tokLeg, op: 'init_id_card', company: 'WTC' }, {
    'X-ISABI-Session': legacyCtx.ownerTok
  });
  const hrRec = {
    id: 'sm_hr_rt_' + Date.now(),
    name: 'Hadi Karim Mansour',
    name_ar: 'هادي كريم منصور',
    full_name_ar: 'هادي كريم منصور',
    father_name: 'Karim',
    father_name_ar: 'كريم',
    mother_name: 'Layla Nassar',
    mother_name_ar: 'ليلى نصار',
    nationality: 'Syrian',
    nationality_ar: 'سوري',
    id_doc_kind: 'work_permit',
    company: 'WTC',
    role: 'Operator',
    status: 'Active',
    nssf_no: '991234',
    id_expiry_date: '2028-04-01',
    work_permit_no: 'WP-55910',
    work_permit_expiry: '2026-11-28',
    residency_no: 'RES-88412',
    residency_expiry: '2027-02-15',
    renewal_status: 'submitted',
    renewal_receipt_no: 'GS-2026-441',
    renewal_submitted_date: '2026-11-10',
    rev: 1
  };
  const recPost = await legacyCtx.callEdge('POST', '/app/api/records', { table: 'staff_members', record: hrRec }, {
    'X-ISABI-Session': legacyCtx.ownerTok
  });
  const recGet = await legacyCtx.callEdge('GET', '/app/api/records?table=staff_members&company=WTC&limit=500', null, {
    'X-ISABI-Session': legacyCtx.ownerTok
  });
  const savedRec = (recGet.json?.rows || []).find(r => r && r.id === hrRec.id);
  const migratedStaffCols = new Set(legacyCtx.d1.rows('PRAGMA table_info(staff_members)').map(r => String(r.name)));
  const migratedPsCols = new Set(legacyCtx.d1.rows('PRAGMA table_info(phone_scan_sessions)').map(r => String(r.name)));

  const syncHrId = 'sm_hr_sync_' + Date.now();
  const syncRec = Object.assign({}, hrRec, { id: syncHrId, name: 'Fadi Sync HR', nssf_no: '551908', renewal_receipt_no: 'GS-2026-442' });
  const syncPost = await legacyCtx.callEdge('POST', '/app/api/sync', {
    op: 'patch',
    doc: 'mfg_web_store',
    awaitMirror: true,
    patch: {
      mfg_web_store: {
        minShellVer: MIN_SYNC_SHELL_VER,
        updatedAt: '2026-11-15T12:00:00.000Z',
        customRecords: { staff_members: [hrRec, syncRec] }
      }
    }
  }, { 'X-ISABI-Session': legacyCtx.ownerTok });
  const syncGet = await legacyCtx.callEdge('GET', '/app/api/records?table=staff_members&company=WTC&limit=500', null, {
    'X-ISABI-Session': legacyCtx.ownerTok
  });
  const savedSyncRec = (syncGet.json?.rows || []).find(r => r && r.id === syncHrId);

  const requiredCols = [
    'father_name', 'father_name_ar', 'full_name_ar', 'mother_name', 'mother_name_ar',
    'nationality_ar', 'id_doc_kind', 'nssf_no', 'id_expiry_date',
    'work_permit_no', 'work_permit_expiry', 'residency_no', 'residency_expiry',
    'renewal_status', 'renewal_receipt_no', 'renewal_submitted_date'
  ];
  const colsOk = requiredCols.every(c => migratedStaffCols.has(c)) && migratedPsCols.has('meta_json');
  const fieldsRoundTripOk = Boolean(
    savedRec && savedSyncRec
    && savedRec.father_name === 'Karim' && savedRec.father_name_ar === 'كريم'
    && savedRec.full_name_ar === 'هادي كريم منصور'
    && savedRec.mother_name === 'Layla Nassar' && savedRec.mother_name_ar === 'ليلى نصار'
    && savedRec.nationality_ar === 'سوري' && savedRec.id_doc_kind === 'work_permit'
    && savedRec.nssf_no === '991234' && savedRec.id_expiry_date === '2028-04-01'
    && savedRec.work_permit_no === 'WP-55910' && savedRec.work_permit_expiry === '2026-11-28'
    && savedRec.residency_no === 'RES-88412' && savedRec.residency_expiry === '2027-02-15'
    && savedRec.renewal_status === 'submitted' && savedRec.renewal_receipt_no === 'GS-2026-441'
    && savedRec.renewal_submitted_date === '2026-11-10'
    && savedSyncRec.nssf_no === '551908' && savedSyncRec.work_permit_expiry === '2026-11-28'
    && savedSyncRec.mother_name_ar === 'ليلى نصار'
    && savedSyncRec.renewal_status === 'submitted' && savedSyncRec.renewal_receipt_no === 'GS-2026-442'
  );

  ok('6. Legacy stripped D1 schema auto-migrates all 16 staff_members cols + meta_json and round-trips via /records & /sync',
    legInit.status === 200 && recPost.status === 200 && syncPost.status === 200 && colsOk && fieldsRoundTripOk,
    { legStatus: legInit.status, recStatus: recPost.status, syncStatus: syncPost.status, colsOk, fieldsRoundTripOk }
  );

  // 7a. complete_id_card & /app/api/smart-scan reject SVG and spoofed magic bytes with 400 without incrementing scansUsed or writing R2
  const sidBad = 'ps_badimg_' + Date.now();
  const tokBad = 'tok_badimg_123';
  const badInit = await ctx.callEdge('POST', '/app/api/phone-scan', { sid: sidBad, k: tokBad, op: 'init_id_card', company: 'WTC' }, {
    'X-ISABI-Session': ctx.ownerTok
  });
  const badSvgComp = await ctx.callEdge('POST', '/app/api/phone-scan', {
    sid: sidBad,
    k: tokBad,
    op: 'complete_id_card',
    extracted: { docKind: 'id_card', fullNameLatin: 'SVG Test' },
    pages: [{ id: 'bad-svg', mimeType: 'image/svg+xml', dataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }]
  });
  const spoofSvgB64 = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'utf8').toString('base64');
  const badSpoofComp = await ctx.callEdge('POST', '/app/api/phone-scan', {
    sid: sidBad,
    k: tokBad,
    op: 'complete_id_card',
    extracted: { docKind: 'id_card', fullNameLatin: 'Spoof JPEG Test' },
    pages: [{ id: 'bad-spoof', mimeType: 'image/jpeg', dataUrl: `data:image/jpeg;base64,${spoofSvgB64}` }]
  });
  const badScanSvg = await ctx.callEdge('POST', '/app/api/smart-scan', {
    scanMode: 'id_card',
    phoneScanSid: sidBad,
    phoneScanTok: tokBad,
    mimeType: 'image/svg+xml',
    dataUrl: `data:image/svg+xml;base64,${spoofSvgB64}`
  }, { 'X-ISABI-Demo': '1' });
  const badScanSpoof = await ctx.callEdge('POST', '/app/api/smart-scan', {
    scanMode: 'id_card',
    phoneScanSid: sidBad,
    phoneScanTok: tokBad,
    mimeType: 'image/jpeg',
    dataUrl: `data:image/jpeg;base64,${spoofSvgB64}`
  }, { 'X-ISABI-Demo': '1' });
  const badPollAfter = await ctx.callEdge('GET', `/app/api/phone-scan?sid=${encodeURIComponent(sidBad)}&k=${encodeURIComponent(tokBad)}&op=poll`);
  const badScansUsedAfter = Number(badPollAfter.json?.scansUsed || 0);
  const hasBadR2 = Array.from(ctx.bucket.objects.keys()).some(k => k.includes(sidBad));
  ok('7a. complete_id_card & /smart-scan reject SVG and spoofed JPEG magic bytes with HTTP 400 without incrementing scansUsed or writing R2',
    badInit.status === 200
    && badSvgComp.status === 400
    && badSpoofComp.status === 400
    && badScanSvg.status === 400
    && badScanSpoof.status === 400
    && badScansUsedAfter === 0
    && !hasBadR2,
    {
      initStatus: badInit.status,
      badSvgStatus: badSvgComp.status,
      badSpoofStatus: badSpoofComp.status,
      badScanSvgStatus: badScanSvg.status,
      badScanSpoofStatus: badScanSpoof.status,
      badScansUsedAfter,
      hasBadR2
    }
  );

  // 7b. X-ISABI-Demo: 1 still enforces phoneScanSid 3-scan limit and token validation
  const sidDemo = 'ps_demo_' + Date.now();
  const tokDemo = 'tok_demo_123';
  const demoSessInit = await ctx.callEdge('POST', '/app/api/phone-scan', { sid: sidDemo, k: tokDemo, op: 'init_id_card', company: 'WTC' }, {
    'X-ISABI-Session': ctx.ownerTok
  });
  const callsBeforeDemo = geminiCalls;
  const demoBody = {
    scanMode: 'id_card',
    phoneScanSid: sidDemo,
    phoneScanTok: tokDemo,
    extractedText: 'NSSF: 882190 Work Permit: WP-7722 Mother: Salwa Karam',
    dataUrl: TINY_PNG_DATA_URL,
    mimeType: 'image/png'
  };
  const d1Res = await ctx.callEdge('POST', '/app/api/smart-scan', demoBody, { 'X-ISABI-Demo': '1' });
  const d2Res = await ctx.callEdge('POST', '/app/api/smart-scan', demoBody, { 'X-ISABI-Demo': '1' });
  const d3Res = await ctx.callEdge('POST', '/app/api/smart-scan', demoBody, { 'X-ISABI-Demo': '1' });
  const d4Res = await ctx.callEdge('POST', '/app/api/smart-scan', demoBody, { 'X-ISABI-Demo': '1' });
  const demoWrongTok = await ctx.callEdge('POST', '/app/api/smart-scan', {
    scanMode: 'id_card',
    phoneScanSid: sidDemo,
    phoneScanTok: 'wrong_tok',
    extractedText: 'NSSF: 882190'
  }, { 'X-ISABI-Demo': '1' });
  ok('7b. X-ISABI-Demo: 1 enforces exact 3-scan phoneScanSid cap (200,200,200,429) and rejects bad token (403)',
    demoSessInit.status === 200
    && d1Res.status === 200 && d2Res.status === 200 && d3Res.status === 200
    && d4Res.status === 429 && d4Res.json?.code === 'scan_limit_reached'
    && (geminiCalls - callsBeforeDemo) === 3
    && demoWrongTok.status === 403 && demoWrongTok.json?.code === 'invalid_token',
    {
      statuses: [d1Res.status, d2Res.status, d3Res.status, d4Res.status],
      code4: d4Res.json?.code,
      callsDelta: geminiCalls - callsBeforeDemo,
      wrongTokStatus: demoWrongTok.status,
      wrongTokCode: demoWrongTok.json?.code
    }
  );

  // 8a. 2-sided Front + Back complete_id_card pre-validates all pages before R2 put (413 oversized / 400 bad magic), stores 2 pages & purges both on consume
  const sid2 = 'ps_2side_' + Date.now();
  const tok2 = 'tok_2side_abc';
  const init2 = await ctx.callEdge('POST', '/app/api/phone-scan', { sid: sid2, k: tok2, op: 'init_id_card', company: 'WTC' }, {
    'X-ISABI-Session': ctx.ownerTok
  });
  const giantB64 = 'A'.repeat(2_900_000);
  const bigSecondPage = await ctx.callEdge('POST', '/app/api/phone-scan', {
    sid: sid2,
    k: tok2,
    op: 'complete_id_card',
    extracted: { docKind: 'id_card', fullNameLatin: 'Karim Back Oversize' },
    pages: [
      { id: 'id-card-1', side: 'front', mimeType: 'image/png', dataUrl: TINY_PNG_DATA_URL },
      { id: 'id-card-2', side: 'back', mimeType: 'image/png', dataUrl: `data:image/png;base64,${giantB64}` }
    ]
  });
  const noR2AfterBig = !Array.from(ctx.bucket.objects.keys()).some(k => k.includes(sid2));
  const spoofSecondPage = await ctx.callEdge('POST', '/app/api/phone-scan', {
    sid: sid2,
    k: tok2,
    op: 'complete_id_card',
    extracted: { docKind: 'id_card', fullNameLatin: 'Karim Back Spoof' },
    pages: [
      { id: 'id-card-1', side: 'front', mimeType: 'image/png', dataUrl: TINY_PNG_DATA_URL },
      { id: 'id-card-2', side: 'back', mimeType: 'image/jpeg', dataUrl: `data:image/jpeg;base64,${spoofSvgB64}` }
    ]
  });
  const noR2AfterSpoof = !Array.from(ctx.bucket.objects.keys()).some(k => k.includes(sid2));
  const comp2 = await ctx.callEdge('POST', '/app/api/phone-scan', {
    sid: sid2,
    k: tok2,
    op: 'complete_id_card',
    extracted: {
      docKind: 'id_card',
      fullNameLatin: 'Karim Fadi Khoury',
      civilRegistryNumber: '412',
      civilRegistryPlace: 'Jounieh',
      maritalStatus: 'Married',
      sidesCaptured: 2,
      idExpiryDate: '2030-05-01'
    },
    pages: [
      { id: 'id-card-1', side: 'front', mimeType: 'image/png', dataUrl: TINY_PNG_DATA_URL },
      { id: 'id-card-2', side: 'back', mimeType: 'image/png', dataUrl: TINY_PNG_DATA_URL }
    ]
  });
  const poll2 = await ctx.callEdge('GET', `/app/api/phone-scan?sid=${encodeURIComponent(sid2)}&k=${encodeURIComponent(tok2)}`);
  const r2Keys2Before = Array.from(ctx.bucket.objects.keys()).filter(k => k.includes(sid2)).length;
  const consume2 = await ctx.callEdge('POST', '/app/api/phone-scan', { sid: sid2, k: tok2, op: 'consume' });
  const r2Keys2After = Array.from(ctx.bucket.objects.keys()).filter(k => k.includes(sid2)).length;
  ok('8a. 2-sided complete_id_card rejects invalid 2nd page before any R2 write (413/400), stores id-card-1/2 + reverse scalars, and purges both on consume',
    init2.status === 200
    && bigSecondPage.status === 413 && noR2AfterBig
    && spoofSecondPage.status === 400 && noR2AfterSpoof
    && comp2.status === 200
    && poll2.status === 200
    && poll2.json?.session?.pages?.length === 2
    && poll2.json?.session?.pages?.[0]?.side === 'front'
    && poll2.json?.session?.pages?.[1]?.side === 'back'
    && poll2.json?.session?.extracted?.civilRegistryNumber === '412'
    && poll2.json?.session?.extracted?.civilRegistryPlace === 'Jounieh'
    && poll2.json?.session?.extracted?.maritalStatus === 'Married'
    && poll2.json?.session?.extracted?.sidesCaptured === 2
    && r2Keys2Before === 2
    && consume2.status === 200 && r2Keys2After === 0,
    {
      bigStatus: bigSecondPage.status, spoofStatus: spoofSecondPage.status,
      compStatus: comp2.status, pagesLen: poll2.json?.session?.pages?.length,
      r2Before: r2Keys2Before, r2After: r2Keys2After
    }
  );

  // 8b. Eager R2 cleanup on GET of an expired 2-page id_card session
  const sidExp2 = 'ps_exp2_' + Date.now();
  const tokExp2 = 'tok_exp2_xyz';
  await ctx.callEdge('POST', '/app/api/phone-scan', { sid: sidExp2, k: tokExp2, op: 'init_id_card', company: 'WTC' }, {
    'X-ISABI-Session': ctx.ownerTok
  });
  await ctx.callEdge('POST', '/app/api/phone-scan', {
    sid: sidExp2,
    k: tokExp2,
    op: 'complete_id_card',
    extracted: { docKind: 'id_card', fullNameLatin: 'Expired Purge Check', sidesCaptured: 2 },
    pages: [
      { id: 'id-card-1', side: 'front', mimeType: 'image/png', dataUrl: TINY_PNG_DATA_URL },
      { id: 'id-card-2', side: 'back', mimeType: 'image/png', dataUrl: TINY_PNG_DATA_URL }
    ]
  });
  const exp2BeforeR2 = Array.from(ctx.bucket.objects.keys()).filter(k => k.includes(sidExp2)).length;
  const exp2Row = ctx.d1.rows('SELECT meta_json FROM phone_scan_sessions WHERE sid = ?', sidExp2)[0];
  const exp2Meta = JSON.parse(exp2Row.meta_json);
  exp2Meta.expiresAtMs = Date.now() - 5000;
  ctx.d1.db.prepare('UPDATE phone_scan_sessions SET meta_json = ? WHERE sid = ?').run(JSON.stringify(exp2Meta), sidExp2);
  const exp2Get = await ctx.callEdge('GET', `/app/api/phone-scan?sid=${encodeURIComponent(sidExp2)}&k=${encodeURIComponent(tokExp2)}`);
  const exp2AfterR2 = Array.from(ctx.bucket.objects.keys()).filter(k => k.includes(sidExp2)).length;
  ok('8b. Expired 2-page id_card GET eagerly deletes all R2 objects, sets expired status, and returns empty pages + null extracted',
    exp2BeforeR2 === 2
    && exp2Get.status === 200
    && exp2Get.json?.session?.expired === true
    && exp2Get.json?.session?.status === 'expired'
    && exp2Get.json?.session?.extracted === null
    && exp2Get.json?.session?.pages?.length === 0
    && exp2AfterR2 === 0,
    { exp2BeforeR2, exp2AfterR2, session: exp2Get.json?.session }
  );

  // 8c. Red-team parity: authed /smart-scan + phoneScanSid validation BEFORE token spend, imageDataUrl forwarding, 429 limit, 2-page cap & >650KB cardDataUrl
  const sid8c = 'ps_8c_' + Date.now();
  const tok8c = 'tok_8c_secret';
  const init8c = await ctx.callEdge('POST', '/app/api/phone-scan', { sid: sid8c, k: tok8c, op: 'init_id_card', company: 'WTC' }, {
    'X-ISABI-Session': ctx.ownerTok
  });
  const badSvgScan = await ctx.callEdge('POST', '/app/api/smart-scan', {
    scanMode: 'id_card',
    phoneScanSid: sid8c,
    phoneScanTok: tok8c,
    mimeType: 'image/svg+xml',
    dataUrl: `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64')}`
  }, { 'X-ISABI-Session': ctx.ownerTok });
  const badMagicScan = await ctx.callEdge('POST', '/app/api/smart-scan', {
    scanMode: 'id_card',
    phoneScanSid: sid8c,
    phoneScanTok: tok8c,
    mimeType: 'image/jpeg',
    dataUrl: `data:image/jpeg;base64,${Buffer.from('<svg onload="alert(1)"/>').toString('base64')}`
  }, { 'X-ISABI-Session': ctx.ownerTok });
  const oversizePayload = 'data:image/jpeg;base64,' + '/9j/4AAQ' + 'A'.repeat(2450000);
  const oversizeScan = await ctx.callEdge('POST', '/app/api/smart-scan', {
    scanMode: 'id_card',
    phoneScanSid: sid8c,
    phoneScanTok: tok8c,
    mimeType: 'image/jpeg',
    dataUrl: oversizePayload
  }, { 'X-ISABI-Session': ctx.ownerTok });
  const metaAfterBad = JSON.parse(ctx.d1.rows('SELECT meta_json FROM phone_scan_sessions WHERE sid = ?', sid8c)[0].meta_json || '{}');

  let capturedGeminiBody8c = '';
  const prevFetch8c = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const u = typeof input === 'string' ? input : String((input && input.url) || '');
    if (u.startsWith('https://generativelanguage.googleapis.com/')) {
      capturedGeminiBody8c = init && init.body ? String(init.body) : '';
    }
    return prevFetch8c(input, init);
  };
  let scanImg1, scanImg2, scanImg3, scanImg4;
  try {
    const bodyImg = {
      scanMode: 'id_card',
      phoneScanSid: sid8c,
      phoneScanTok: tok8c,
      mimeType: 'image/png',
      imageDataUrl: TINY_PNG_DATA_URL
    };
    scanImg1 = await ctx.callEdge('POST', '/app/api/smart-scan', bodyImg, { 'X-ISABI-Session': ctx.ownerTok });
    scanImg2 = await ctx.callEdge('POST', '/app/api/smart-scan', bodyImg, { 'X-ISABI-Session': ctx.ownerTok });
    scanImg3 = await ctx.callEdge('POST', '/app/api/smart-scan', bodyImg, { 'X-ISABI-Session': ctx.ownerTok });
    scanImg4 = await ctx.callEdge('POST', '/app/api/smart-scan', bodyImg, { 'X-ISABI-Session': ctx.ownerTok });
  } finally {
    globalThis.fetch = prevFetch8c;
  }

  const capComplete = await ctx.callEdge('POST', '/app/api/phone-scan', {
    sid: sid8c,
    k: tok8c,
    op: 'complete_id_card',
    extracted: { docKind: 'id_card', fullNameLatin: 'Three Page Cap Test', sidesCaptured: 2 },
    pages: [
      { id: 'id-card-1', side: 'front', mimeType: 'image/png', dataUrl: TINY_PNG_DATA_URL },
      { id: 'id-card-2', side: 'back', mimeType: 'image/png', dataUrl: TINY_PNG_DATA_URL },
      { id: 'id-card-3', side: 'back', mimeType: 'image/png', dataUrl: TINY_PNG_DATA_URL }
    ]
  });
  const capGet = await ctx.callEdge('GET', `/app/api/phone-scan?sid=${encodeURIComponent(sid8c)}&k=${encodeURIComponent(tok8c)}`);
  const capR2Keys = Array.from(ctx.bucket.objects.keys()).filter(k => k.includes(sid8c));

  const sid8d = 'ps_8d_' + Date.now();
  const tok8d = 'tok_8d_secret';
  await ctx.callEdge('POST', '/app/api/phone-scan', { sid: sid8d, k: tok8d, op: 'init_id_card', company: 'WTC' }, {
    'X-ISABI-Session': ctx.ownerTok
  });
  const jpgHeaderBytes = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const bigValidJpg = Buffer.concat([jpgHeaderBytes, Buffer.alloc(600000, 0x41)]);
  const bigCardDataUrl = `data:image/jpeg;base64,${bigValidJpg.toString('base64')}`;
  const cardComp = await ctx.callEdge('POST', '/app/api/phone-scan', {
    sid: sid8d,
    k: tok8d,
    op: 'complete_id_card',
    extracted: { docKind: 'id_card', fullNameLatin: 'Large Preview Kept', cardDataUrl: bigCardDataUrl }
  });
  const cardGet = await ctx.callEdge('GET', `/app/api/phone-scan?sid=${encodeURIComponent(sid8d)}&k=${encodeURIComponent(tok8d)}`);

  ok('8c. Authed /smart-scan+phoneScanSid validates before scan spend (400/413, scansUsed=0), forwards imageDataUrl, enforces 429 limit, caps pages at 2 & keeps >650KB preview',
    init8c.status === 200
    && badSvgScan.status === 400
    && badMagicScan.status === 400
    && oversizeScan.status === 413
    && metaAfterBad.scansUsed === 0
    && scanImg1.status === 200
    && capturedGeminiBody8c.includes('iVBORw0KGgo')
    && scanImg2.status === 200
    && scanImg3.status === 200
    && scanImg4.status === 429 && scanImg4.json?.code === 'scan_limit_reached'
    && capComplete.status === 200
    && capGet.json?.session?.pages?.length === 2
    && capR2Keys.length === 2
    && bigCardDataUrl.length > 650000 && bigCardDataUrl.length < 2000000
    && cardComp.status === 200
    && cardGet.json?.session?.pages?.length === 1
    && (cardGet.json?.session?.pages?.[0]?.dataUrl?.length || 0) > 650000,
    {
      badStatuses: [badSvgScan.status, badMagicScan.status, oversizeScan.status],
      scansUsedAfterBad: metaAfterBad.scansUsed,
      scanStatuses: [scanImg1.status, scanImg2.status, scanImg3.status, scanImg4.status],
      code4: scanImg4.json?.code,
      capPages: capGet.json?.session?.pages?.length,
      capR2Count: capR2Keys.length,
      cardLen: cardGet.json?.session?.pages?.[0]?.dataUrl?.length || 0
    }
  );

  console.log(`\nverify_hr_phone_edge: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
} catch (err) {
  console.error('FATAL:', err);
  process.exit(1);
}
