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
        return { ok: true, mode: 'station_key', isOwner: false, siteBound: entry.site_key || '*' };
      }
    }
  }

  return { ok: false, status: 401, error: 'Invalid kiosk station key.' };
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
  const ipBucket = `ip:${ipHash}:${siteKey}`;

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

  // Owner-only station key provisioning / rotation
  if (op === 'provision_station_key') {
    if (!auth.isOwner) {
      return kioskJson({ ok: false, error: 'Owner session required to provision kiosk station keys.' }, 403);
    }
    const rawKey = String((body && body.rawKey) || '').trim();
    if (rawKey.length < 12) {
      return kioskJson({ ok: false, error: 'Station key must be at least 12 characters.' }, 400);
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
      created_at: nowIso
    };
    keys.push(entry);
    await env.DB.prepare(
      'INSERT OR REPLACE INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES (?1, ?2, ?3, ?4, 1)'
    ).bind('kiosk_station_keys', JSON.stringify({ keys }), nowIso, String((session && session.email) || 'owner')).run();
    return kioskJson({ ok: true, id: entry.id, site_key: targetSite, label: entry.label });
  }

  // ---- 1. POS Cashier Roster Sync (`sync_users`) ----
  if (op === 'sync_users') {
    const incoming = Array.isArray(body && body.users) ? body.users : [];
    let upserted = 0;
    for (const u of incoming) {
      if (!u || !u.id) continue;
      const pid = String(u.id).trim().slice(0, 80);
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
    if (!pid || samples.length < 3) {
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
    const syncedFaces = [];

    for (const p of punches) {
      if (!p || !p.id) continue;
      const pid = String(p.id).trim().slice(0, 80);
      const ex = await env.DB.prepare('SELECT rev FROM kiosk_punches_ext WHERE id = ?1').bind(pid).first();
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
      const sid = String(st.id).trim().slice(0, 80);
      if (sid) staffMetaById.set(sid, st);
    }
    const byStaff = new Map();
    for (const sid of staffMetaById.keys()) {
      byStaff.set(sid, []);
    }
    for (const f of faces) {
      if (!f || !f.staffId || !f.id) continue;
      const sid = String(f.staffId).trim().slice(0, 80);
      if (!byStaff.has(sid)) byStaff.set(sid, []);
      byStaff.get(sid).push(f);
      syncedFaces.push(String(f.id));
    }
    for (const [sid, list] of byStaff.entries()) {
      const ex = await env.DB.prepare('SELECT * FROM kiosk_biometrics WHERE site_key = ?1 AND person_id = ?2').bind(siteKey, sid).first();
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
        siteKey,
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

    return kioskJson({ ok: true, punches: syncedPunches, faces: syncedFaces, syncedPunches, syncedFaces, punchesAccepted: syncedPunches, facesAccepted: syncedFaces });
  }

  // ---- 7. Attendance Roster Pull (`roster`, supporting `redact: true` & `restore: true`) ----
  if (op === 'roster') {
    const redact = Boolean(body && (body.redact || body.redacted));
    const includeFaces = Boolean(!redact || (body && (body.restore || body.includeFaces || body.include_faces || redact)));
    const rowsRes = await env.DB.prepare('SELECT * FROM kiosk_biometrics WHERE site_key = ?1').bind(siteKey).all();
    const staff = [];
    const facesOut = [];
    for (const r of (rowsRes.results || [])) {
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
              id: `${r.person_id}-s${idx + 1}`,
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
              id: `pin-${r.person_id}`,
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
              id: `${r.person_id}-s${idx + 1}`,
              staffId: r.person_id,
              sample: idx + 1,
              descriptor: v,
              pinhash: r.pinhash || ''
            });
          });
          if (!vecs.length && r.pinhash) {
            facesOut.push({
              id: `pin-${r.person_id}`,
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
    const rowsRes = await env.DB.prepare('SELECT * FROM kiosk_biometrics WHERE site_key = ?1 AND active = 1').bind(siteKey).all();
    const rows = rowsRes.results || [];

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
