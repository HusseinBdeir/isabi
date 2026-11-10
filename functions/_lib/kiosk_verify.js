// Cloudflare Pages D1 Kiosk 1:N Biometric & Salted-PIN Verification Engine
// Supports Resort Gate POS (`bhfirms\pos` v1.0.0) & Standalone Resort Attendance (`bhfirms\attendance` v0.4.0)
// Enforces <= 0.50 Euclidean threshold + >= 0.08 rival margin, D1 sliding-window rate limits, and 0 distance oracle leakage.

const KIOSK_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Kiosk-Key, X-ISABI-Demo'
};

function kioskJson(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }, KIOSK_CORS_HEADERS)
  });
}

export function handleKioskOptions() {
  return new Response(null, { status: 204, headers: KIOSK_CORS_HEADERS });
}

function safeParseJson(raw, fallback) {
  if (!raw || typeof raw !== 'string') return fallback;
  try { return JSON.parse(raw); } catch (_) { return fallback; }
}

function isValidVec128(v) {
  if (!Array.isArray(v) || v.length !== 128) return false;
  for (let i = 0; i < 128; i++) {
    if (v[i] === null || v[i] === '' || typeof v[i] === 'boolean') return false;
    const n = Number(v[i]);
    if (!Number.isFinite(n) || n < -4 || n > 4) return false;
  }
  return true;
}

function euclidean128(a, b) {
  if (!isValidVec128(a) || !isValidVec128(b)) return 99;
  let sum = 0;
  for (let i = 0; i < 128; i++) {
    const d = Number(a[i]) - Number(b[i]);
    sum += d * d;
  }
  const out = Math.sqrt(sum);
  return Number.isFinite(out) ? out : 99;
}

async function sha256Hex(str) {
  const bytes = new TextEncoder().encode(String(str || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function constantTimeHexEqual(a, b) {
  const ha = await sha256Hex(String(a || ''));
  const hb = await sha256Hex(String(b || ''));
  let diff = 0;
  for (let i = 0; i < ha.length; i++) {
    diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  }
  return diff === 0 && String(a || '').length > 0 && String(a || '').length === String(b || '').length;
}

let _kioskSchemaReady = false;
async function ensureKioskSchema(db) {
  if (!db || _kioskSchemaReady) return;
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS kiosk_biometrics (
        site_key TEXT NOT NULL,
        person_id TEXT NOT NULL,
        name TEXT DEFAULT '',
        official_name TEXT DEFAULT '',
        role TEXT DEFAULT 'cashier',
        dept TEXT DEFAULT '',
        active INTEGER DEFAULT 1,
        pinhash TEXT DEFAULT '',
        pin_salt TEXT DEFAULT '',
        face_samples TEXT DEFAULT '[]',
        updated_at TEXT DEFAULT '',
        PRIMARY KEY (site_key, person_id)
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS kiosk_punches_ext (
        id TEXT PRIMARY KEY,
        site_key TEXT DEFAULT '',
        staff_id TEXT DEFAULT '',
        staff_name TEXT DEFAULT '',
        ts TEXT DEFAULT '',
        day TEXT DEFAULT '',
        direction TEXT DEFAULT 'in',
        method TEXT DEFAULT 'face',
        rev INTEGER DEFAULT 0,
        voided INTEGER DEFAULT 0,
        payload_json TEXT DEFAULT '{}',
        updated_at TEXT DEFAULT ''
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS kiosk_pos_sales (
        id TEXT PRIMARY KEY,
        site_key TEXT DEFAULT '',
        day TEXT DEFAULT '',
        num TEXT DEFAULT '',
        user_id TEXT DEFAULT '',
        user_name TEXT DEFAULT '',
        total_usd REAL DEFAULT 0,
        total_lbp REAL DEFAULT 0,
        net_usd REAL DEFAULT 0,
        net_lbp REAL DEFAULT 0,
        rate REAL DEFAULT 0,
        voided INTEGER DEFAULT 0,
        rev INTEGER DEFAULT 0,
        payload_json TEXT DEFAULT '{}',
        updated_at TEXT DEFAULT ''
      )`
    ),
    db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_kiosk_pos_sales_site_day ON kiosk_pos_sales (site_key, day, user_id)'
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS kiosk_rate_limits (
        bucket_key TEXT PRIMARY KEY,
        fails INTEGER DEFAULT 0,
        window_start INTEGER DEFAULT 0,
        locked_until INTEGER DEFAULT 0
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS edge_kv_store (
        doc_key TEXT PRIMARY KEY,
        payload_json TEXT DEFAULT '{}',
        updated_at TEXT DEFAULT '',
        updated_by TEXT DEFAULT '',
        rev INTEGER DEFAULT 1
      )`
    )
  ]);
  _kioskSchemaReady = true;
}

function normSiteKey(raw) {
  const cleaned = String(raw || 'default_kiosk').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 64);
  return cleaned || 'default_kiosk';
}

function extractClientIp(request) {
  return String(
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For') ||
    'local'
  ).split(',')[0].trim().slice(0, 80);
}

async function checkKioskLock(db, bucketKey, nowMs) {
  const row = await db.prepare('SELECT fails, window_start, locked_until FROM kiosk_rate_limits WHERE bucket_key = ?1').bind(bucketKey).first();
  if (!row) return { locked: false, retryAfterSec: 0 };
  const lockedUntil = Number(row.locked_until || 0);
  if (lockedUntil > nowMs) {
    return { locked: true, retryAfterSec: Math.max(1, Math.ceil((lockedUntil - nowMs) / 1000)) };
  }
  return { locked: false, retryAfterSec: 0 };
}

async function recordKioskFailure(db, bucketKey, nowMs, maxFails = 5, lockMs = 30000, windowMs = 60000) {
  const row = await db.prepare('SELECT fails, window_start, locked_until FROM kiosk_rate_limits WHERE bucket_key = ?1').bind(bucketKey).first();
  let fails = 1;
  let winStart = nowMs;
  if (row && (nowMs - Number(row.window_start || 0)) <= windowMs) {
    fails = Number(row.fails || 0) + 1;
    winStart = Number(row.window_start || nowMs);
  }
  const lockedUntil = fails >= maxFails ? (nowMs + lockMs) : 0;
  if (lockedUntil > 0) fails = 0;
  await db.prepare(
    'INSERT OR REPLACE INTO kiosk_rate_limits (bucket_key, fails, window_start, locked_until) VALUES (?1, ?2, ?3, ?4)'
  ).bind(bucketKey, fails, winStart, lockedUntil).run();
  return {
    locked: lockedUntil > nowMs,
    retryAfterSec: lockedUntil > nowMs ? Math.ceil(lockMs / 1000) : 0
  };
}

async function clearKioskFailure(db, bucketKey) {
  await db.prepare('DELETE FROM kiosk_rate_limits WHERE bucket_key = ?1').bind(bucketKey).run();
}

async function authorizeKioskRequest(request, env, body, session, isOwnerFn) {
  // 1. Active Owner / Supervisor / Admin Edge session
  if (session) {
    const roleStr = String(session.role || '');
    if ((typeof isOwnerFn === 'function' && isOwnerFn(session)) || /Owner|Supervisor|Admin|Manager/i.test(roleStr)) {
      return { ok: true, mode: 'session', isOwner: Boolean(typeof isOwnerFn === 'function' ? isOwnerFn(session) : /Owner/i.test(roleStr)) };
    }
  }

  // 2. Kiosk Station Key (`X-Kiosk-Key`, `Authorization: Bearer ...`, `body.key`, `body.stationKey`)
  const hdrKey = String(request.headers.get('X-Kiosk-Key') || '').trim();
  const authHdr = String(request.headers.get('Authorization') || '').trim();
  const bearerKey = /^Bearer\s+/i.test(authHdr) ? authHdr.replace(/^Bearer\s+/i, '').trim() : '';
  const bodyKey = String((body && (body.key || body.stationKey)) || '').trim();
  const candidate = hdrKey || bearerKey || bodyKey;

  if (!candidate || candidate.length < 6) {
    return { ok: false, status: 401, error: 'Kiosk station key or Supervisor session required.' };
  }

  const envKey = String((env && env.KIOSK_SHARED_KEY) || '').trim();
  if (envKey && (await constantTimeHexEqual(candidate, envKey))) {
    return { ok: true, mode: 'env_key', isOwner: false };
  }

  if (env && env.DB) {
    const kvRow = await env.DB.prepare('SELECT payload_json FROM edge_kv_store WHERE doc_key = ?1').bind('kiosk_station_keys').first();
    const kvObj = kvRow ? safeParseJson(kvRow.payload_json, null) : null;
    const keysArr = (kvObj && Array.isArray(kvObj.keys)) ? kvObj.keys : [];
    const candHash = await sha256Hex(candidate);
    for (const entry of keysArr) {
      if (!entry || entry.revoked) continue;
      if (entry.key_hash && (await constantTimeHexEqual(candHash, String(entry.key_hash)))) {
        const reqSite = normSiteKey(body && (body.site || body.resort || body.station));
        if (entry.site_key && entry.site_key !== '*' && entry.site_key !== reqSite) {
          return { ok: false, status: 403, error: 'Kiosk station key is bound to a different site.' };
        }
        // A key can be limited to one kind of tablet, so a till key cannot pull the attendance roster
        // and an attendance key cannot plant a till account.
        const scope = String(entry.scope || '').toLowerCase();
        const opName = String((body && body.op) || '').trim().toLowerCase();
        if (scope === 'attendance' && !ATTENDANCE_OPS.has(opName)) {
          return { ok: false, status: 403, error: 'This station key is for an attendance tablet.' };
        }
        if (scope === 'pos' && ATTENDANCE_OPS.has(opName)) {
          return { ok: false, status: 403, error: 'This station key is for a till.' };
        }
        return { ok: true, mode: 'station_key', isOwner: false, siteBound: entry.site_key || '*' };
      }
    }
  }

  return { ok: false, status: 401, error: 'Invalid kiosk station key.' };
}

// ---- Resort gate till (bhfirms\pos) sales intake ----
// Each sale is stored once in kiosk_pos_sales (keyed on the till's own sale id). After every batch the
// affected cashier-days are re-totalled from that table and written as one row per resort, day and
// cashier into the Command Center's POS till close register (industry_custom_rows, bucket hsp_pos).
// All arithmetic here is plain sums rounded to cents; nothing is estimated.

const POS_SITE_COMPANY = {
  launa: 'La Una',
  blanca: 'Blanca',
  palms: 'Palms',
  voile: 'Voile',
  platinum: 'Platinum'
};
// Site code -> company in the Command Center, for every tablet site. The company is always taken from
// the site a request is authorised for, never from a field the tablet sends.
const KIOSK_SITE_COMPANY = Object.assign({}, POS_SITE_COMPANY, {
  wtc: 'WTC',
  bbco: 'BBConstruction',
  lions: 'Lions Transport',
  korri: 'Korri Auto',
  shacman: 'Shacman',
  props: 'Properties'
});
// Attendance staff and till cashiers at the same site are separate people lists with separate lockouts:
// attendance rows live under "<site>__att" in kiosk_biometrics and in the rate-limit buckets.
// Own-property lookups only: a site named "constructor" or "__proto__" is not a company.
function posCompanyOf(siteKey) {
  return Object.prototype.hasOwnProperty.call(POS_SITE_COMPANY, siteKey) ? POS_SITE_COMPANY[siteKey] : '';
}
function siteCompanyOf(siteKey) {
  return Object.prototype.hasOwnProperty.call(KIOSK_SITE_COMPANY, siteKey) ? KIOSK_SITE_COMPANY[siteKey] : '';
}
// The staff register of a site's company, split into people who are on (active, not voided) and ids
// that are switched off there. Someone switched off in the register is off at the door too, for the
// roster and for server-side matching alike. The register is optional: without it both lists are empty.
async function readStaffRegister(db, company) {
  const on = [];
  const offIds = new Set();
  if (!company) return { on, offIds };
  try {
    const res = await db.prepare('SELECT id, name, role, status, voided FROM staff_members WHERE company = ?1 LIMIT 4000').bind(company).all();
    for (const sm of (res.results || [])) {
      const sid = String(sm.id || '').trim();
      const status = String(sm.status === null || sm.status === undefined ? '' : sm.status).trim().toLowerCase();
      if (Number(sm.voided) === 0 && (status === 'active' || status === '')) on.push({ id: sid, name: sm.name, role: sm.role });
      else offIds.add(sid);
    }
  } catch (_) { /* no staff register in this database */ }
  return { on, offIds };
}
const ATTENDANCE_OPS = new Set(['sync', 'push', 'roster', 'verify']);
const ATTENDANCE_SUFFIX = '__att';
// Ids arrive from tablets and are echoed back into other tablets' pages, so only plain id characters pass.
const SAFE_ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;
const POS_MAX_SALES_PER_REQUEST = 100;
const POS_MAX_SALE_JSON_BYTES = 20000;

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function posNum(v, min, max) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function validatePosSale(s, siteKey, maxDay, minDay) {
  if (!s || typeof s !== 'object') return { ok: false, reason: 'not-an-object' };
  const id = String(s.id || '').trim();
  if (id.length < 8 || id.length > 80 || !/^[A-Za-z0-9_.:-]+$/.test(id)) return { ok: false, reason: 'bad-id' };
  const day = String(s.day || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || (maxDay && day > maxDay) || (minDay && day < minDay)) return { ok: false, id, reason: 'bad-day' };
  if (s.resort !== undefined && s.resort !== null && normSiteKey(s.resort) !== siteKey) {
    return { ok: false, id, reason: 'other-site' };
  }
  const totalUsd = posNum(s.totalUSD, 0, 1e6);
  const totalLbp = posNum(s.totalLBP, 0, 1e12);
  const netUsd = posNum(s.netUSD, -1e6, 1e6);
  const netLbp = posNum(s.netLBP, -1e12, 1e12);
  const rate = posNum(s.rate, 1, 1e8);
  if (totalUsd === null || totalLbp === null || netUsd === null || netLbp === null || rate === null) {
    return { ok: false, id, reason: 'bad-amount' };
  }
  if (s.lines !== undefined && (!Array.isArray(s.lines) || s.lines.length > 100)) {
    return { ok: false, id, reason: 'bad-lines' };
  }
  const json = JSON.stringify(s);
  if (json.length > POS_MAX_SALE_JSON_BYTES) return { ok: false, id, reason: 'too-large' };
  return {
    ok: true,
    row: {
      id,
      day,
      num: String(s.num || '').slice(0, 60),
      userId: String(s.userId || 'anon').trim().slice(0, 80) || 'anon',
      userName: String(s.userName || '').slice(0, 120),
      totalUsd, totalLbp, netUsd, netLbp, rate,
      voided: s.voided ? 1 : 0,
      rev: Math.max(0, Math.floor(posNum(s.rev, 0, 1e9) || 0)),
      json
    }
  };
}

// Re-total one cashier-day from kiosk_pos_sales and upsert its till close row.
async function mirrorPosTillClose(db, siteKey, day, userId, nowIso) {
  const company = posCompanyOf(siteKey);
  if (!company) return false;
  const res = await db.prepare(
    `SELECT user_name, total_usd, net_usd, net_lbp, rate FROM kiosk_pos_sales
     WHERE site_key = ?1 AND day = ?2 AND user_id = ?3 AND voided = 0 ORDER BY updated_at, id`
  ).bind(siteKey, day, userId).all();
  const rows = res.results || [];
  let billed = 0;
  let collectedUsd = 0;
  let collectedLbp = 0;
  let collectedTotal = 0;
  let cashier = '';
  for (const r of rows) {
    const rate = Number(r.rate) || 0;
    billed += Number(r.total_usd) || 0;
    collectedUsd += Number(r.net_usd) || 0;
    collectedLbp += Number(r.net_lbp) || 0;
    collectedTotal += (Number(r.net_usd) || 0) + (rate > 0 ? (Number(r.net_lbp) || 0) / rate : 0);
    if (r.user_name) cashier = String(r.user_name);
  }
  billed = round2(billed);
  collectedTotal = round2(collectedTotal);
  const variance = round2(collectedTotal - billed);
  const userTag = (await sha256Hex(`${siteKey}:${userId}`)).slice(0, 6).toUpperCase();
  const rowId = `POS-${siteKey.toUpperCase()}-${day.replace(/-/g, '')}-${userTag}`;
  const ex = await db.prepare(
    'SELECT rev, voided, payload_json FROM industry_custom_rows WHERE bucket = ?1 AND row_id = ?2'
  ).bind('hsp_pos', rowId).first();
  const exObj = ex ? safeParseJson(ex.payload_json, {}) : {};
  if (!rows.length && !ex) return false;
  // A cashier-day whose sales were all voided keeps its row with zero totals. It is never retired as a
  // tombstone: a tombstone held by a Command Center client could later hide the row when sales resume.
  const voided = false;
  const body = {
    id: rowId,
    date: day,
    company,
    terminal: `${company} Gate Till`,
    shift: 'Full Day',
    cashier: cashier || exObj.cashier || 'Cashier',
    bills_count: rows.length,
    pos_billed_ttc: billed,
    cash_usd: collectedTotal,
    card_whish_usd: 0,
    comp_usd: 0,
    variance_usd: variance,
    status: Math.abs(variance) <= 1 ? 'Balanced' : 'Close Variance',
    notes: rows.length
      ? `Gate till, ${rows.length} sales. Collected USD ${round2(collectedUsd).toFixed(2)} and LBP ${Math.round(collectedLbp)}.`
      : 'Gate till, 0 sales. Every sale of this cashier on this day was voided.',
    source: 'pos_till'
  };
  const same = ex && Boolean(Number(ex.voided)) === voided &&
    ['cashier', 'bills_count', 'pos_billed_ttc', 'cash_usd', 'variance_usd', 'status', 'notes']
      .every(k => exObj[k] === body[k]);
  if (same) return false;
  const rev = (ex ? Number(ex.rev || 1) : 0) + 1;
  const payload = Object.assign({}, body, {
    _customBucket: 'hsp_pos',
    _createdAt: exObj._createdAt || nowIso,
    voided,
    rev,
    updated_at: nowIso,
    updatedAt: nowIso
  });
  await db.prepare(
    'INSERT OR REPLACE INTO industry_custom_rows (bucket, row_id, company, rev, voided, updated_at, payload_json) VALUES (?1,?2,?3,?4,?5,?6,?7)'
  ).bind('hsp_pos', rowId, company, rev, voided ? 1 : 0, nowIso, JSON.stringify(payload)).run();
  return true;
}

async function handlePosSales(env, body, siteKey, nowIso) {
  const incoming = Array.isArray(body && body.sales) ? body.sales : null;
  if (!incoming) return kioskJson({ ok: false, error: 'sales[] is required.' }, 400);
  if (incoming.length > POS_MAX_SALES_PER_REQUEST) {
    return kioskJson({ ok: false, error: `Send at most ${POS_MAX_SALES_PER_REQUEST} sales per request.` }, 413);
  }
  // A till's clock can run a little ahead; anything dated more than two days from now is a bad clock.
  // A till that was offline for a season may still send its backlog; anything older than 400 days is not a backlog.
  const maxDay = new Date(Date.parse(nowIso) + 2 * 86400000).toISOString().slice(0, 10);
  const minDay = new Date(Date.parse(nowIso) - 400 * 86400000).toISOString().slice(0, 10);
  const accepted = [];
  const rejected = [];
  const touched = new Map();
  for (const s of incoming) {
    const v = validatePosSale(s, siteKey, maxDay, minDay);
    if (!v.ok) {
      rejected.push({ id: v.id || String((s && s.id) || '').slice(0, 80), reason: v.reason });
      continue;
    }
    const r = v.row;
    const ex = await env.DB.prepare(
      'SELECT site_key, day, user_id, rev, voided FROM kiosk_pos_sales WHERE id = ?1'
    ).bind(r.id).first();
    if (ex && ex.site_key !== siteKey) {
      rejected.push({ id: r.id, reason: 'other-site' });
      continue;
    }
    if (!ex || r.rev >= Number(ex.rev || 0)) {
      // A void is final on the till, so it is never undone by a later or replayed copy.
      const voided = (ex && Number(ex.voided)) || r.voided ? 1 : 0;
      await env.DB.prepare(
        `INSERT OR REPLACE INTO kiosk_pos_sales
         (id, site_key, day, num, user_id, user_name, total_usd, total_lbp, net_usd, net_lbp, rate, voided, rev, payload_json, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)`
      ).bind(
        r.id, siteKey, r.day, r.num, r.userId, r.userName,
        r.totalUsd, r.totalLbp, r.netUsd, r.netLbp, r.rate, voided, r.rev, r.json, nowIso
      ).run();
      touched.set(`${r.day}|${r.userId}`, { day: r.day, userId: r.userId });
      if (ex && (ex.day !== r.day || ex.user_id !== r.userId)) {
        touched.set(`${ex.day}|${ex.user_id}`, { day: ex.day, userId: ex.user_id });
      }
    }
    accepted.push(r.id);
  }
  let mirrored = 0;
  let mirrorError = '';
  for (const t of touched.values()) {
    try {
      if (await mirrorPosTillClose(env.DB, siteKey, t.day, t.userId, nowIso)) mirrored++;
    } catch (e) {
      mirrorError = String((e && e.message) || e).slice(0, 160);
    }
  }
  if (mirrorError) {
    // The sales are stored, but the till must send them again so the register is re-totalled: a replay
    // changes nothing in kiosk_pos_sales and touches the same cashier-days.
    return kioskJson({ ok: false, error: 'The till close register could not be updated. The till will retry.', mirrorError, rejected }, 503);
  }
  return kioskJson({ ok: true, sales: accepted, rejected, mirrored, company: posCompanyOf(siteKey) });
}

function match1NDescriptors(probe, rosterRows, opts = {}) {
  const threshold = Math.max(0.32, Math.min(0.58, Number(opts.threshold || 0.50)));
  const minMargin = Math.max(0.05, Number(opts.minMargin || 0.08));
  const minSamples = Math.max(1, Number(opts.minSamples || 1));

  const perPerson = [];
  for (const r of rosterRows) {
    if (!r || Number(r.active) === 0) continue;
    const samples = safeParseJson(r.face_samples, []).filter(isValidVec128);
    if (samples.length < minSamples) continue;
    let bestD = Infinity;
    for (const s of samples) {
      const d = euclidean128(probe, s);
      if (d < bestD) bestD = d;
    }
    if (Number.isFinite(bestD)) {
      perPerson.push({ row: r, dist: bestD });
    }
  }

  if (!perPerson.length) {
    return { matched: false, reason: 'no-enrolments' };
  }
  perPerson.sort((a, b) => a.dist - b.dist);
  const best = perPerson[0];
  const runnerUp = perPerson.length > 1 ? perPerson[1] : null;
  if (best.dist > threshold) {
    return { matched: false, reason: 'far' };
  }
  if (runnerUp && (runnerUp.dist - best.dist) < minMargin) {
    return { matched: false, reason: 'ambiguous' };
  }
  return {
    matched: true,
    row: best.row,
    weak: best.dist > (threshold - 0.04)
  };
}

export async function handleKioskVerify(request, env, session, body, helpers = {}) {
  if (request.method === 'OPTIONS') return handleKioskOptions();
  if (!env || !env.DB) return kioskJson({ ok: false, error: 'Kiosk database unavailable.' }, 503);

  await ensureKioskSchema(env.DB);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const op = String((body && body.op) || '').trim().toLowerCase();
  const siteKey = normSiteKey(body && (body.site || body.resort || body.station || 'default_kiosk'));
  const clientIp = extractClientIp(request);
  const ipHash = (await sha256Hex(clientIp)).slice(0, 24);
  if (siteKey.endsWith(ATTENDANCE_SUFFIX)) {
    return kioskJson({ ok: false, error: 'Unknown site.' }, 400);
  }
  const isAttendanceOp = ATTENDANCE_OPS.has(op);
  const bioSite = isAttendanceOp ? `${siteKey}${ATTENDANCE_SUFFIX}` : siteKey;
  const ipBucket = `ip:${ipHash}:${bioSite}`;

  // Global per-IP+site sliding-window brute-force guard
  const ipLock = await checkKioskLock(env.DB, ipBucket, nowMs);
  if (ipLock.locked) {
    return kioskJson({
      ok: false,
      matched: false,
      reason: 'locked',
      retryAfterSec: ipLock.retryAfterSec,
      error: `Too many failed attempts. Wait ${ipLock.retryAfterSec}s.`
    }, 429);
  }

  const auth = await authorizeKioskRequest(request, env, body || {}, session, helpers.isOwnerOrFullGroupSession);
  if (!auth.ok) {
    await recordKioskFailure(env.DB, ipBucket, nowMs, 15, 30000, 60000);
    return kioskJson({ ok: false, error: auth.error }, auth.status || 401);
  }

  // A signed-in seat that is not an Owner reaches a site only if it has access to that site's company.
  if (auth.mode === 'session' && !auth.isOwner) {
    const seatCompany = siteCompanyOf(siteKey);
    const canAccess = typeof helpers.canAccessCompany === 'function' ? helpers.canAccessCompany : null;
    if (!seatCompany || !canAccess || !canAccess(session, seatCompany)) {
      return kioskJson({ ok: false, error: 'This seat has no access to that site.' }, 403);
    }
  }

  // Owner-only station key provisioning / rotation
  if (op === 'provision_station_key') {
    if (!auth.isOwner) {
      return kioskJson({ ok: false, error: 'Owner session required to provision kiosk station keys.' }, 403);
    }
    const rawKey = String((body && body.rawKey) || '').trim();
    if (rawKey.length < 12) {
      return kioskJson({ ok: false, error: 'Station key must be at least 12 characters.' }, 400);
    }
    const scopeIn = String((body && body.scope) || '').trim().toLowerCase();
    if (scopeIn && scopeIn !== 'pos' && scopeIn !== 'attendance') {
      return kioskJson({ ok: false, error: 'scope must be pos, attendance or empty.' }, 400);
    }
    const targetSite = (body && body.site === '*') ? '*' : siteKey;
    const keyHash = await sha256Hex(rawKey);
    const kvRow = await env.DB.prepare('SELECT payload_json FROM edge_kv_store WHERE doc_key = ?1').bind('kiosk_station_keys').first();
    const kvObj = (kvRow && safeParseJson(kvRow.payload_json, null)) || { keys: [] };
    const keys = Array.isArray(kvObj.keys) ? kvObj.keys.filter(k => k && k.id !== body.id) : [];
    const entry = {
      id: String(body.id || `ksk-${nowMs}`),
      label: String(body.label || targetSite).slice(0, 80),
      site_key: targetSite,
      key_hash: keyHash,
      scope: scopeIn,
      created_at: nowIso
    };
    keys.push(entry);
    await env.DB.prepare(
      'INSERT OR REPLACE INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES (?1, ?2, ?3, ?4, 1)'
    ).bind('kiosk_station_keys', JSON.stringify({ keys }), nowIso, String((session && session.email) || 'owner')).run();
    return kioskJson({ ok: true, id: entry.id, site_key: targetSite, label: entry.label, scope: entry.scope });
  }

  // ---- 0. Resort gate till sales intake (`pos_sales`) ----
  if (op === 'pos_sales') {
    if (auth.mode === 'session' && !auth.isOwner) {
      return kioskJson({ ok: false, error: 'Kiosk station key required to post till sales.' }, 403);
    }
    if (!(body && (body.site || body.resort || body.station))) {
      return kioskJson({ ok: false, error: 'resort is required.' }, 400);
    }
    return handlePosSales(env, body, siteKey, nowIso);
  }

  // ---- 1. POS Cashier Roster Sync (`sync_users`) ----
  if (op === 'sync_users') {
    const incoming = Array.isArray(body && body.users) ? body.users : [];
    let upserted = 0;
    for (const u of incoming) {
      if (!u || !u.id) continue;
      const pid = String(u.id).trim();
      if (!SAFE_ID_RE.test(pid)) continue;
      const ex = await env.DB.prepare(
        'SELECT pinhash, pin_salt, face_samples FROM kiosk_biometrics WHERE site_key = ?1 AND person_id = ?2'
      ).bind(siteKey, pid).first();
      const rawVecs = Array.isArray(u.descriptors) ? u.descriptors : (Array.isArray(u.faces) ? u.faces : (Array.isArray(u.face_samples) ? u.face_samples : null));
      const inFaces = Array.isArray(rawVecs) ? rawVecs.filter(isValidVec128) : [];
      const keepExistingFaces = !inFaces.length && ex && safeParseJson(ex.face_samples, []).length > 0 && !u.facesCleared && (u.faceRedacted || rawVecs === null);
      const facesJson = keepExistingFaces ? ex.face_samples : JSON.stringify(inFaces);
      const pinHash = String(u.pinhash || (ex ? ex.pinhash : '') || '').trim();
      const pinSalt = String(u.pinSalt || u.pin_salt || (ex ? ex.pin_salt : '') || '').trim();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO kiosk_biometrics
         (site_key, person_id, name, official_name, role, dept, active, pinhash, pin_salt, face_samples, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
      ).bind(
        siteKey,
        pid,
        String(u.name || '').slice(0, 120),
        String(u.officialName || u.official_name || '').slice(0, 120),
        String(u.role || 'cashier').slice(0, 40),
        String(u.dept || '').slice(0, 80),
        u.active === false ? 0 : 1,
        pinHash,
        pinSalt,
        facesJson,
        nowIso
      ).run();
      upserted++;
    }
    const allRows = await env.DB.prepare('SELECT person_id, name, role, active, pinhash, face_samples FROM kiosk_biometrics WHERE site_key = ?1').bind(siteKey).all();
    const redactedUsers = (allRows.results || []).map(r => ({
      id: r.person_id,
      name: r.name,
      role: r.role,
      active: Number(r.active) !== 0,
      hasPin: Boolean(r.pinhash),
      faceCount: safeParseJson(r.face_samples, []).filter(isValidVec128).length,
      faceRedacted: true
    }));
    return kioskJson({ ok: true, synced: upserted, users: redactedUsers });
  }

  // ---- 2. POS Guided 3-Pose Enrolment (`enrol_user`) with < 0.58 Cross-Cashier Duplicate Block ----
  if (op === 'enrol_user') {
    const usrObj = (body && typeof body.user === 'object' && body.user) ? body.user : {};
    const pid = String(usrObj.id || (body && (body.userId || body.personId || body.id)) || '').trim().slice(0, 80);
    const samples = Array.isArray(body && (body.descriptors || body.faces || body.samples))
      ? (body.descriptors || body.faces || body.samples).filter(isValidVec128)
      : [];
    if (!pid || !SAFE_ID_RE.test(pid) || samples.length < 3) {
      return kioskJson({ ok: false, error: 'User id and 3 valid 128-d pose samples are required.' }, 400);
    }
    const peersRes = await env.DB.prepare(
      'SELECT person_id, name, active, face_samples FROM kiosk_biometrics WHERE site_key = ?1 AND person_id != ?2'
    ).bind(siteKey, pid).all();
    for (const peer of (peersRes.results || [])) {
      if (Number(peer.active) === 0) continue;
      const peerFaces = safeParseJson(peer.face_samples, []).filter(isValidVec128);
      for (const pf of peerFaces) {
        for (const sf of samples) {
          if (euclidean128(pf, sf) < 0.58) {
            return kioskJson({
              ok: false,
              reason: 'duplicate-face',
              conflictName: peer.name || peer.person_id,
              error: `Face already enrolled under ${peer.name || peer.person_id}.`
            }, 409);
          }
        }
      }
    }
    const ex = await env.DB.prepare('SELECT * FROM kiosk_biometrics WHERE site_key = ?1 AND person_id = ?2').bind(siteKey, pid).first();
    await env.DB.prepare(
      `INSERT OR REPLACE INTO kiosk_biometrics
       (site_key, person_id, name, official_name, role, dept, active, pinhash, pin_salt, face_samples, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
    ).bind(
      siteKey,
      pid,
      String(usrObj.name || body.name || (ex && ex.name) || pid).slice(0, 120),
      String((ex && ex.official_name) || '').slice(0, 120),
      String(usrObj.role || body.role || (ex && ex.role) || 'cashier').slice(0, 40),
      String((ex && ex.dept) || '').slice(0, 80),
      1,
      String(usrObj.pinhash || body.pinhash || (ex && ex.pinhash) || ''),
      String(usrObj.pinSalt || body.pinSalt || (ex && ex.pin_salt) || ''),
      JSON.stringify(samples.slice(0, 5)),
      nowIso
    ).run();
    return kioskJson({ ok: true, userId: pid, faceCount: samples.slice(0, 5).length, faceRedacted: true });
  }

  // ---- 3. Clear Faces / Delete Cashier (`clear_faces` | `delete_user`) ----
  if (op === 'clear_faces' || op === 'delete_user') {
    const pid = String((body && (body.userId || body.personId || body.id)) || '').trim().slice(0, 80);
    if (!pid) return kioskJson({ ok: false, error: 'Missing userId.' }, 400);
    if (op === 'delete_user') {
      await env.DB.prepare('DELETE FROM kiosk_biometrics WHERE site_key = ?1 AND person_id = ?2').bind(siteKey, pid).run();
    } else {
      await env.DB.prepare('UPDATE kiosk_biometrics SET face_samples = ?1, updated_at = ?2 WHERE site_key = ?3 AND person_id = ?4')
        .bind('[]', nowIso, siteKey, pid).run();
    }
    return kioskJson({ ok: true, userId: pid });
  }

  // ---- 4. POS 1:N Face Verify (`verify_face`) ----
  if (op === 'verify_face') {
    const probe = body && body.descriptor;
    if (!isValidVec128(probe)) {
      return kioskJson({ ok: false, matched: false, reason: 'invalid_descriptor', error: '128-d descriptor required.' }, 400);
    }
    const rowsRes = await env.DB.prepare('SELECT * FROM kiosk_biometrics WHERE site_key = ?1 AND active = 1').bind(siteKey).all();
    const res = match1NDescriptors(probe, rowsRes.results || [], {
      threshold: body.threshold || 0.50,
      minMargin: 0.08,
      minSamples: 1
    });
    if (!res.matched) {
      await recordKioskFailure(env.DB, ipBucket, nowMs, 20, 30000, 60000);
      return kioskJson({ ok: true, matched: false, reason: res.reason });
    }
    await clearKioskFailure(env.DB, ipBucket);
    return kioskJson({
      ok: true,
      matched: true,
      weak: Boolean(res.weak),
      userId: res.row.person_id,
      user: {
        id: res.row.person_id,
        name: res.row.name,
        role: res.row.role
      }
    });
  }

  // ---- 5. POS Salted SHA-256 PIN Verify (`verify_pin`) ----
  if (op === 'verify_pin') {
    const checkOnly = Boolean(body && body.checkOnly);
    const pinRaw = String((body && body.pin) || '').trim();
    const pinHashIn = String((body && body.pinhash) || '').trim().toLowerCase();
    const targetId = String((body && body.userId) || '').trim();
    const pinBucket = `pin:${siteKey}:${targetId || ipHash}`;
    if (!checkOnly) {
      const pLock = await checkKioskLock(env.DB, pinBucket, nowMs);
      if (pLock.locked) {
        return kioskJson({ ok: true, matched: false, reason: 'locked', retryAfterSec: pLock.retryAfterSec }, 429);
      }
    }
    const rowsRes = await env.DB.prepare('SELECT * FROM kiosk_biometrics WHERE site_key = ?1 AND active = 1').bind(siteKey).all();
    const candidates = (rowsRes.results || []).filter(r => r.pinhash && (!targetId || r.person_id === targetId));
    let matchedRow = null;
    for (const r of candidates) {
      let candHash = pinHashIn;
      if (pinRaw) {
        candHash = r.pin_salt
          ? await sha256Hex(`${r.pin_salt}:${pinRaw}`)
          : await sha256Hex(pinRaw);
      }
      if (candHash && (await constantTimeHexEqual(candHash, String(r.pinhash).toLowerCase()))) {
        matchedRow = r;
        break;
      }
    }
    if (checkOnly) {
      if (!matchedRow) return kioskJson({ ok: true, matched: false, checkOnly: true });
      return kioskJson({
        ok: true,
        matched: true,
        checkOnly: true,
        id: matchedRow.person_id,
        userId: matchedRow.person_id,
        name: matchedRow.name || matchedRow.person_id
      });
    }
    if (!matchedRow) {
      const f = await recordKioskFailure(env.DB, pinBucket, nowMs, 5, 30000, 60000);
      await recordKioskFailure(env.DB, ipBucket, nowMs, 20, 30000, 60000);
      return kioskJson({
        ok: true,
        matched: false,
        reason: f.locked ? 'locked' : 'invalid_pin',
        retryAfterSec: f.retryAfterSec || 0
      }, f.locked ? 429 : 200);
    }
    await clearKioskFailure(env.DB, pinBucket);
    await clearKioskFailure(env.DB, ipBucket);
    return kioskJson({
      ok: true,
      matched: true,
      userId: matchedRow.person_id,
      user: {
        id: matchedRow.person_id,
        name: matchedRow.name,
        role: matchedRow.role
      }
    });
  }

  // ---- 6. Attendance Sync / Push (`sync` | `push`: punches + staff + faces/pinhashes) ----
  if (op === 'push' || op === 'sync') {
    const punches = Array.isArray(body && body.punches) ? body.punches : [];
    const staffIn = Array.isArray(body && body.staff) ? body.staff : [];
    const faces = Array.isArray(body && body.faces) ? body.faces : [];
    const syncedPunches = [];
    const rejectedPunches = [];
    const syncedFaces = [];

    for (const p of punches) {
      if (!p || !p.id) continue;
      const pid = String(p.id).trim();
      if (!SAFE_ID_RE.test(pid)) continue;
      const ex = await env.DB.prepare('SELECT rev, site_key FROM kiosk_punches_ext WHERE id = ?1').bind(pid).first();
      if (ex && ex.site_key !== siteKey) { rejectedPunches.push(pid); continue; }   // a punch id belongs to the site that first sent it
      const inRev = Number(p.rev || 0);
      if (!ex || inRev >= Number(ex.rev || 0)) {
        await env.DB.prepare(
          `INSERT OR REPLACE INTO kiosk_punches_ext
           (id, site_key, staff_id, staff_name, ts, day, direction, method, rev, voided, payload_json, updated_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`
        ).bind(
          pid,
          siteKey,
          String(p.staffId || ''),
          String(p.staffName || ''),
          String(p.ts || ''),
          String(p.day || ''),
          String(p.direction || p.dir || 'in'),
          String(p.method || 'face'),
          inRev,
          p.void ? 1 : 0,
          JSON.stringify(p),
          nowIso
        ).run();
      }
      syncedPunches.push(pid);
    }

    // Seed/merge staff metadata + group face samples by staffId
    const staffMetaById = new Map();
    for (const st of staffIn) {
      if (!st || !st.id) continue;
      const sid = String(st.id).trim();
      if (SAFE_ID_RE.test(sid)) staffMetaById.set(sid, st);
    }
    const byStaff = new Map();
    for (const sid of staffMetaById.keys()) {
      byStaff.set(sid, []);
    }
    for (const f of faces) {
      if (!f || !f.staffId || !f.id) continue;
      const sid = String(f.staffId).trim();
      if (!SAFE_ID_RE.test(sid) || !SAFE_ID_RE.test(String(f.id))) continue;
      if (!byStaff.has(sid)) byStaff.set(sid, []);
      byStaff.get(sid).push(f);
      syncedFaces.push(String(f.id));
    }
    for (const [sid, list] of byStaff.entries()) {
      const ex = await env.DB.prepare('SELECT * FROM kiosk_biometrics WHERE site_key = ?1 AND person_id = ?2').bind(bioSite, sid).first();
      const meta = staffMetaById.get(sid) || {};
      const exSamples = ex ? safeParseJson(ex.face_samples, []).filter(isValidVec128) : [];
      let pinHash = String(meta.pinhash || (ex ? ex.pinhash : '') || '').trim().toLowerCase();
      let staffName = String(meta.name || (ex ? ex.name : '') || '').slice(0, 120);
      let officialName = String(meta.officialName || meta.official_name || (ex ? ex.official_name : '') || '').slice(0, 120);
      let roleVal = String(meta.role || (ex ? ex.role : '') || 'staff').slice(0, 40);
      let deptVal = String(meta.dept || (ex ? ex.dept : '') || '').slice(0, 80);
      let activeVal = meta.active === false ? 0 : (ex ? Number(ex.active) : 1);
      const sampleMap = new Map();
      if (!meta.clearFaces) {
        exSamples.forEach((vec, idx) => sampleMap.set(idx + 1, vec));
      }
      for (const item of list) {
        if (item.staffName) staffName = String(item.staffName).slice(0, 120);
        if (item.role) roleVal = String(item.role).slice(0, 40);
        if (item.dept) deptVal = String(item.dept).slice(0, 80);
        if (item.pinhash && String(item.pinhash).length === 64) pinHash = String(item.pinhash).toLowerCase();
        if (isValidVec128(item.descriptor)) {
          const slot = Math.max(1, Math.min(5, Number(item.sample || (sampleMap.size + 1))));
          sampleMap.set(slot, item.descriptor);
        }
      }
      const mergedVecs = Array.from(sampleMap.entries()).sort((a, b) => a[0] - b[0]).map(e => e[1]);
      await env.DB.prepare(
        `INSERT OR REPLACE INTO kiosk_biometrics
         (site_key, person_id, name, official_name, role, dept, active, pinhash, pin_salt, face_samples, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
      ).bind(
        bioSite,
        sid,
        staffName || sid,
        officialName,
        roleVal,
        deptVal,
        activeVal,
        pinHash,
        '',
        JSON.stringify(mergedVecs),
        nowIso
      ).run();
    }

    return kioskJson({ ok: true, punches: syncedPunches, faces: syncedFaces, staff: Array.from(staffMetaById.keys()), rejectedPunches, syncedPunches, syncedFaces, punchesAccepted: syncedPunches, facesAccepted: syncedFaces });
  }

  // ---- 7. Attendance Roster Pull (`roster`, supporting `redact: true` & `restore: true`) ----
  if (op === 'roster') {
    const redact = Boolean(body && (body.redact || body.redacted));
    const includeFaces = Boolean(!redact || (body && (body.restore || body.includeFaces || body.include_faces || redact)));
    const rowsRes = await env.DB.prepare('SELECT * FROM kiosk_biometrics WHERE site_key = ?1').bind(bioSite).all();
    const staff = [];
    const facesOut = [];
    const kioskRows = rowsRes.results || [];
    // Staff registered in the Command Center for this site's company join the roster too, so they can
    // be enrolled at the door without being typed again. Ids are the staff register's own ids.
    // The company comes from the site this request is authorised for, never from the request body.
    const siteBu = siteCompanyOf(siteKey);
    // People voided or made inactive in the staff register drop off the roster even if they were enrolled at the door.
    const register = await readStaffRegister(env.DB, siteBu);
    const offIds = register.offIds;
    {
      {
        const known = new Set(kioskRows.map(r => r.person_id));
        for (const sm of register.on) {
          const sid = sm.id;
          if (!SAFE_ID_RE.test(sid) || known.has(sid)) continue;
          known.add(sid);
          staff.push({
            id: sid, name: sm.name || sid, officialName: '', role: sm.role || '', dept: '', active: true,
            hasPin: false, has_pin: false, has_face: false, faceSamples: 0, serverSamples: 0
          });
        }
      }
    }
    for (const r of kioskRows) {
      if (Number(r.active) === 0 || offIds.has(r.person_id)) continue;   // switched off: not on the roster
      const vecs = safeParseJson(r.face_samples, []).filter(isValidVec128);
      const stObj = {
        id: r.person_id,
        name: r.name || r.person_id,
        officialName: r.official_name || '',
        role: r.role || '',
        dept: r.dept || '',
        active: Number(r.active) !== 0,
        hasPin: Boolean(r.pinhash),
        has_pin: Boolean(r.pinhash),
        has_face: vecs.length > 0,
        faceSamples: vecs.length,
        serverSamples: vecs.length
      };
      if (!redact && r.pinhash) stObj.pinhash = r.pinhash;
      staff.push(stObj);
      if (includeFaces) {
        if (redact) {
          vecs.forEach((_, idx) => {
            facesOut.push({
              id: `${r.person_id}:${idx + 1}`,
              staffId: r.person_id,
              sample: idx + 1,
              redacted: true,
              faceRedacted: true,
              hasPin: Boolean(r.pinhash),
              descriptor: []
            });
          });
          if (!vecs.length && r.pinhash) {
            facesOut.push({
              id: `${r.person_id}:0`,
              staffId: r.person_id,
              sample: 0,
              redacted: true,
              faceRedacted: false,
              hasPin: true,
              descriptor: []
            });
          }
        } else {
          vecs.forEach((v, idx) => {
            facesOut.push({
              id: `${r.person_id}:${idx + 1}`,
              staffId: r.person_id,
              sample: idx + 1,
              descriptor: v,
              pinhash: r.pinhash || ''
            });
          });
          if (!vecs.length && r.pinhash) {
            facesOut.push({
              id: `${r.person_id}:0`,
              staffId: r.person_id,
              sample: 0,
              descriptor: [],
              pinhash: r.pinhash
            });
          }
        }
      }
    }
    return kioskJson({ ok: true, redacted: redact, staff, faces: facesOut });
  }

  // ---- 8. Attendance 1:N Redacted Verify (`verify`, method: 'face' | 'pin') ----
  if (op === 'verify') {
    const method = String((body && body.method) || 'face').trim().toLowerCase();
    if (method === 'capability_check') {
      return kioskJson({ ok: true, capability: 'verify', supported: true });
    }
    const rowsRes = await env.DB.prepare('SELECT * FROM kiosk_biometrics WHERE site_key = ?1 AND active = 1').bind(bioSite).all();
    const offAtRegister = (await readStaffRegister(env.DB, siteCompanyOf(siteKey))).offIds;
    const rows = (rowsRes.results || []).filter(r => !offAtRegister.has(r.person_id));

    if (method === 'pin') {
      const checkOnly = Boolean(body && body.checkOnly);
      const pinHashIn = String((body && (body.pinhash || body.pin_hash)) || '').trim().toLowerCase();
      const pinBucket = `attpin:${siteKey}:${ipHash}`;
      if (!checkOnly) {
        const pLock = await checkKioskLock(env.DB, pinBucket, nowMs);
        if (pLock.locked) {
          return kioskJson({ ok: true, matched: false, reason: 'locked', retryAfterSec: pLock.retryAfterSec }, 429);
        }
      }
      let hit = null;
      for (const r of rows) {
        if (r.pinhash && (await constantTimeHexEqual(pinHashIn, String(r.pinhash).toLowerCase()))) {
          hit = r;
          break;
        }
      }
      if (checkOnly) {
        if (!hit) return kioskJson({ ok: true, matched: false, checkOnly: true });
        return kioskJson({
          ok: true,
          matched: true,
          checkOnly: true,
          id: hit.person_id,
          staffId: hit.person_id,
          name: hit.name || hit.person_id,
          staffName: hit.name || hit.person_id
        });
      }
      if (!hit) {
        const f = await recordKioskFailure(env.DB, pinBucket, nowMs, 5, 30000, 60000);
        return kioskJson({ ok: true, matched: false, reason: f.locked ? 'locked' : 'invalid-pin' }, f.locked ? 429 : 200);
      }
      await clearKioskFailure(env.DB, pinBucket);
      return kioskJson({
        ok: true,
        matched: true,
        staffId: hit.person_id,
        staffName: hit.name || hit.person_id,
        staff: { id: hit.person_id, name: hit.name || hit.person_id, role: hit.role || '', dept: hit.dept || '' }
      });
    }

    const probe = body && body.descriptor;
    if (!isValidVec128(probe)) {
      return kioskJson({ ok: false, matched: false, reason: 'invalid-descriptor' }, 400);
    }
    const res = match1NDescriptors(probe, rows, {
      threshold: body.threshold || 0.50,
      minMargin: 0.08,
      minSamples: 3
    });
    if (!res.matched) {
      await recordKioskFailure(env.DB, ipBucket, nowMs, 25, 30000, 60000);
      return kioskJson({ ok: true, matched: false, reason: res.reason });
    }
    await clearKioskFailure(env.DB, ipBucket);
    return kioskJson({
      ok: true,
      matched: true,
      staffId: res.row.person_id,
      staffName: res.row.name,
      weak: Boolean(res.weak)
    });
  }

  return kioskJson({ ok: false, error: `Unsupported kiosk op: ${op || '(empty)'}` }, 400);
}
