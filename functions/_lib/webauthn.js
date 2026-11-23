/**
 * ISABI Systems - Native WebAuthn FIDO2 Passkeys Engine (Cloudflare Workers / D1 WebCrypto)
 * Zero-vendor-cost hardware-enclave authentication (Touch ID, TrueDepth Face ID, Windows Hello,
 * Android Biometrics, FIDO2 keys) for Owner, Supervisor, and override-eligible seats.
 * Supports ES256 (ECDSA P-256 + SHA-256) and RS256 (RSASSA-PKCS1-v1_5 + SHA-256) with UV=1,
 * strict RP ID & Origin checks, atomic single-use challenges, and monotonic signCount clone checks.
 */

import {
  buildSessionCookie,
  canAccessSentinelScope,
  canWriteWorkSchedulesSession,
  checkD1RateLimit,
  checkSlidingRateLimit,
  constantTimeEqual,
  hashClientIp,
  isOwnerOrFullGroupSession,
  jsonResponse,
  signEdgeSession
} from './security.js';
import {
  bumpLockCounter,
  canUserRowAuthorizeOverride,
  checkAuthLockout,
  clearAuthFailure,
  ensureOverrideAuditSchema,
  hydrateUserRow,
  isDemoHeader,
  readLockEntry,
  readWorkspaceFaceSettings,
  recordAuthFailure,
  resolveServerSeatAuthMode,
  shareAnyAllowedCompany
} from './d1_store.js';

const ENC = new TextEncoder();
const DEC = new TextDecoder('utf-8', { fatal: true });

export const MAX_PASSKEYS_PER_SEAT = 9; // Strict < 10 cap per seat
const CHALLENGE_TTL_MS = 120 * 1000;
const STEPUP_TTL_MS = 5 * 60 * 1000;
const OVERRIDE_LOCK_WINDOW_MS = 24 * 60 * 60 * 1000;
const P256_ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

const _schemaReadyDbs = new WeakSet();

function b64UrlToU8(str) {
  const raw = String(str || '').trim();
  if (!raw || raw.length > 32768 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const norm = raw.replace(/-/g, '+').replace(/_/g, '/');
    const pad = norm + '==='.slice((norm.length + 3) % 4);
    const bin = atob(pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch (_) {
    return null;
  }
}

function u8ToB64Url(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function concatU8(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function constantTimeBytesEqual(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function sha256(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : ENC.encode(String(bytes || ''));
  const digest = await crypto.subtle.digest('SHA-256', u8);
  return new Uint8Array(digest);
}

function parsePayloadJsonFlags(row) {
  if (!row || !row.payload_json) return null;
  if (typeof row.payload_json === 'object') return row.payload_json;
  try {
    const p = JSON.parse(String(row.payload_json));
    return (p && typeof p === 'object') ? p : null;
  } catch (_) {
    return null;
  }
}

function rowHasEnrolledFaceBio(row) {
  if (!row) return false;
  let arr = row.face_samples;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr); } catch (_) { arr = []; }
  }
  return Array.isArray(arr) && arr.some(v => Array.isArray(v) && v.length === 128 && v.every(Number.isFinite));
}

async function isSeatPinOnly(db, row) {
  if (!db || !row) return false;
  const wsFaceSettings = await readWorkspaceFaceSettings(db);
  return resolveServerSeatAuthMode(row, wsFaceSettings, rowHasEnrolledFaceBio(row)) === 'pin_only';
}

export function isPasskeyEligibleSeat(row) {
  if (!row || typeof row !== 'object') return false;
  const st = String(row.status || 'Active').trim().toLowerCase();
  if (st === 'suspended') return false;
  const pj = parsePayloadJsonFlags(row);
  if (row.locked || row.kioskLocked || (pj && (pj.locked || pj.kioskLocked))) return false;
  const id = String(row.id || '').trim().toLowerCase();
  const email = String(row.email || '').trim().toLowerCase();
  if (!id || id.startsWith('kiosk_') || email.includes('@kiosk.') || email.endsWith('@terminal.isabi')) {
    return false;
  }
  if (id === 'u1' || id === 'u2') return true;
  const role = String(row.role || '').trim().toLowerCase();
  if (/(owner|admin|full access|supervisor|manager|director)/.test(role)) return true;
  if (role.startsWith('custom')) {
    let cp = row.custom_perms;
    if (typeof cp === 'string' && cp.trim()) {
      try { cp = JSON.parse(cp); } catch (_) { cp = null; }
    }
    if (cp && typeof cp === 'object') {
      if (cp.canManageUsers || cp.manageUsers || cp.allowPasskeys) return true;
      const unlocks = cp.unlocks && typeof cp.unlocks === 'object' ? cp.unlocks : {};
      if (Object.values(unlocks).some(v => v === true)) return true;
    }
  }
  return false;
}

export function resolveWebAuthnRp(request, urlObj = null) {
  let u = urlObj;
  if (!u) {
    try { u = new URL(request.url); } catch (_) { return { ok: false, status: 400, error: 'Invalid request URL.' }; }
  }
  const host = String(u.hostname || '').toLowerCase();
  if (!host || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) {
    return { ok: false, status: 400, error: 'Passkeys require a valid domain name or localhost.' };
  }
  if (host !== 'localhost' && u.protocol !== 'https:') {
    return { ok: false, status: 400, error: 'Passkeys require HTTPS outside localhost.' };
  }
  const rpId = (host === 'isabisystems.com' || host.endsWith('.isabisystems.com')) ? 'isabisystems.com' : host;
  const expectedOrigin = u.origin;
  const hdrOrigin = String(request.headers.get('Origin') || '').trim();
  if (hdrOrigin && hdrOrigin !== expectedOrigin) {
    return { ok: false, status: 403, error: 'Cross-origin WebAuthn request rejected.' };
  }
  return { ok: true, rpId, expectedOrigin };
}

export async function ensurePasskeysSchema(db) {
  if (!db) return;
  if (_schemaReadyDbs.has(db)) return;
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS user_passkeys (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       credential_id TEXT NOT NULL UNIQUE,
       public_key_spki TEXT NOT NULL,
       alg INTEGER NOT NULL DEFAULT -7,
       sign_count INTEGER NOT NULL DEFAULT 0,
       transports TEXT NOT NULL DEFAULT '[]',
       aaguid TEXT NOT NULL DEFAULT '',
       device_label TEXT NOT NULL DEFAULT '',
       backup_eligible INTEGER NOT NULL DEFAULT 0,
       backup_state INTEGER NOT NULL DEFAULT 0,
       uv_verified INTEGER NOT NULL DEFAULT 1,
       created_at TEXT NOT NULL DEFAULT '',
       last_used_at TEXT NOT NULL DEFAULT ''
     )`
  ).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_user_passkeys_user ON user_passkeys (user_id)').run();
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS passkey_challenges (
       id TEXT PRIMARY KEY,
       purpose TEXT NOT NULL DEFAULT 'login',
       user_id TEXT NOT NULL DEFAULT '',
       caller_sid TEXT NOT NULL DEFAULT '',
       challenge_b64u TEXT NOT NULL,
       rp_id TEXT NOT NULL,
       origin TEXT NOT NULL DEFAULT '',
       expires_at_ms INTEGER NOT NULL,
       consumed_at TEXT NOT NULL DEFAULT '',
       created_at TEXT NOT NULL DEFAULT ''
     )`
  ).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_passkey_challenges_exp ON passkey_challenges (expires_at_ms)').run();
  _schemaReadyDbs.add(db);
}

export async function writeStepUpReceipt(db, sid, userId, method = 'Step-Up') {
  if (!db || !sid || !userId) return;
  const nowIso = new Date().toISOString();
  const payload = JSON.stringify({
    userId: String(userId),
    verifiedAtMs: Date.now(),
    method: String(method || 'Step-Up').slice(0, 60)
  });
  await db.prepare(
    `INSERT OR REPLACE INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev)
     VALUES (?1, ?2, ?3, ?4, 1)`
  ).bind(`stepup_ok:${String(sid)}`, payload, nowIso, String(userId)).run();
}

export async function hasFreshStepUpReceipt(db, sid, expectedUserId, nowMs = Date.now()) {
  if (!db || !sid || !expectedUserId) return false;
  try {
    const row = await db.prepare('SELECT payload_json FROM edge_kv_store WHERE doc_key = ?1 LIMIT 1')
      .bind(`stepup_ok:${String(sid)}`)
      .first();
    if (!row || !row.payload_json) return false;
    const p = JSON.parse(String(row.payload_json));
    if (!p || String(p.userId || '') !== String(expectedUserId)) return false;
    const at = Number(p.verifiedAtMs || 0);
    return Number.isFinite(at) && at > 0 && (nowMs - at) >= -5000 && (nowMs - at) <= STEPUP_TTL_MS;
  } catch (_) {
    return false;
  }
}

export async function clearStepUpReceipt(db, sid) {
  if (!db || !sid) return;
  try {
    await db.prepare('DELETE FROM edge_kv_store WHERE doc_key = ?1').bind(`stepup_ok:${String(sid)}`).run();
  } catch (_) {}
}

// Bounded RFC 8949 CBOR single-item decoder (supports integer keys/values, bytes, UTF-8 text, arrays, maps).
export function decodeCborFirst(u8, offset = 0, depth = 0) {
  if (!(u8 instanceof Uint8Array)) throw new Error('CBOR input must be Uint8Array');
  if (depth > 6) throw new Error('CBOR nesting limit exceeded');
  if (offset < 0 || offset >= u8.length) throw new Error('CBOR unexpected end of input');

  const hdr = u8[offset];
  const major = hdr >> 5;
  const ai = hdr & 0x1f;
  let pos = offset + 1;

  const readUint = () => {
    if (ai < 24) return ai;
    if (ai === 24) {
      if (pos + 1 > u8.length) throw new Error('CBOR truncated uint8');
      const v = u8[pos]; pos += 1; return v;
    }
    if (ai === 25) {
      if (pos + 2 > u8.length) throw new Error('CBOR truncated uint16');
      const v = (u8[pos] << 8) | u8[pos + 1]; pos += 2; return v;
    }
    if (ai === 26) {
      if (pos + 4 > u8.length) throw new Error('CBOR truncated uint32');
      const v = ((u8[pos] << 24) | (u8[pos + 1] << 16) | (u8[pos + 2] << 8) | u8[pos + 3]) >>> 0;
      pos += 4;
      return v;
    }
    if (ai === 27) {
      if (pos + 8 > u8.length) throw new Error('CBOR truncated uint64');
      let v = 0;
      for (let i = 0; i < 8; i++) v = v * 256 + u8[pos + i];
      pos += 8;
      if (!Number.isSafeInteger(v)) throw new Error('CBOR integer exceeds safe range');
      return v;
    }
    throw new Error('CBOR unsupported additional info');
  };

  if (major === 0) {
    return { value: readUint(), nextOffset: pos };
  }
  if (major === 1) {
    const val = readUint();
    return { value: -1 - val, nextOffset: pos };
  }
  if (major === 2) {
    const len = readUint();
    if (len > 16384 || pos + len > u8.length) throw new Error('CBOR invalid byte string length');
    const value = u8.slice(pos, pos + len);
    return { value, nextOffset: pos + len };
  }
  if (major === 3) {
    const len = readUint();
    if (len > 16384 || pos + len > u8.length) throw new Error('CBOR invalid text string length');
    const slice = u8.subarray(pos, pos + len);
    return { value: DEC.decode(slice), nextOffset: pos + len };
  }
  if (major === 4) {
    const count = readUint();
    if (count > 64) throw new Error('CBOR array size limit exceeded');
    const arr = [];
    for (let i = 0; i < count; i++) {
      const item = decodeCborFirst(u8, pos, depth + 1);
      arr.push(item.value);
      pos = item.nextOffset;
    }
    return { value: arr, nextOffset: pos };
  }
  if (major === 5) {
    const count = readUint();
    if (count > 64) throw new Error('CBOR map size limit exceeded');
    const mp = new Map();
    for (let i = 0; i < count; i++) {
      const kRes = decodeCborFirst(u8, pos, depth + 1);
      if (kRes.value === null || (typeof kRes.value !== 'number' && typeof kRes.value !== 'string')) {
        throw new Error('CBOR map key must be integer or text');
      }
      if (mp.has(kRes.value)) throw new Error('CBOR duplicate map key');
      const vRes = decodeCborFirst(u8, kRes.nextOffset, depth + 1);
      mp.set(kRes.value, vRes.value);
      pos = vRes.nextOffset;
    }
    return { value: mp, nextOffset: pos };
  }
  if (major === 7) {
    if (ai === 20) return { value: false, nextOffset: pos };
    if (ai === 21) return { value: true, nextOffset: pos };
    if (ai === 22) return { value: null, nextOffset: pos };
    if (ai === 23) return { value: undefined, nextOffset: pos };
    throw new Error('CBOR unsupported simple/float value');
  }
  throw new Error('CBOR unsupported major type');
}

function bytesToBigInt(u8) {
  let v = 0n;
  for (let i = 0; i < u8.length; i++) v = (v << 8n) | BigInt(u8[i]);
  return v;
}

// Strict canonical ASN.1 DER ECDSA signature parser -> IEEE P1363 64-byte (r || s) for WebCrypto P-256
export function derEcdsaToP1363(der) {
  if (!(der instanceof Uint8Array) || der.length < 8 || der.length > 74) return null;
  if (der[0] !== 0x30) return null;
  const seqLen = der[1];
  if (seqLen >= 0x80 || seqLen + 2 !== der.length) return null;

  let pos = 2;
  const parseIntPart = () => {
    if (pos + 2 > der.length || der[pos] !== 0x02) return null;
    const len = der[pos + 1];
    pos += 2;
    if (len < 1 || len > 33 || pos + len > der.length) return null;
    const raw = der.subarray(pos, pos + len);
    pos += len;
    if ((raw[0] & 0x80) !== 0) return null; // negative DER integer rejected
    if (len > 1 && raw[0] === 0x00 && (raw[1] & 0x80) === 0) return null; // non-minimal leading zero rejected
    const stripped = raw[0] === 0x00 ? raw.subarray(1) : raw;
    if (stripped.length > 32) return null;
    const scalar = bytesToBigInt(stripped);
    if (scalar < 1n || scalar >= P256_ORDER) return null;
    const out = new Uint8Array(32);
    out.set(stripped, 32 - stripped.length);
    return out;
  };

  const r = parseIntPart();
  const s = parseIntPart();
  if (!r || !s || pos !== der.length) return null;
  return concatU8(r, s);
}

function derLenBytes(len) {
  if (len < 0x80) return Uint8Array.of(len);
  if (len < 0x100) return Uint8Array.of(0x81, len);
  return Uint8Array.of(0x82, (len >> 8) & 0xff, len & 0xff);
}

function derTlv(tag, body) {
  const b = body instanceof Uint8Array ? body : new Uint8Array(body);
  const lenB = derLenBytes(b.length);
  const out = new Uint8Array(1 + lenB.length + b.length);
  out[0] = tag;
  out.set(lenB, 1);
  out.set(b, 1 + lenB.length);
  return out;
}

function derIntegerFromUnsigned(u8) {
  let i = 0;
  while (i < u8.length - 1 && u8[i] === 0) i++;
  const clean = u8.subarray(i);
  const body = (clean[0] & 0x80) ? concatU8(Uint8Array.of(0x00), clean) : clean;
  return derTlv(0x02, body);
}

const P256_SPKI_PREFIX = Uint8Array.from([
  0x30, 0x59,
  0x30, 0x13,
  0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
  0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
  0x03, 0x42, 0x00, 0x04
]);

const RSA_ALG_ID_DER = Uint8Array.from([
  0x30, 0x0d,
  0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
  0x05, 0x00
]);

async function coseMapToVerifiedSpki(coseMap) {
  if (!(coseMap instanceof Map)) {
    return { ok: false, error: 'COSE public key must be a CBOR map.' };
  }
  const kty = coseMap.get(1);
  const alg = coseMap.get(3);

  if (kty === 2 && alg === -7) {
    const crv = coseMap.get(-1);
    const x = coseMap.get(-2);
    const y = coseMap.get(-3);
    if (crv !== 1 || !(x instanceof Uint8Array) || !(y instanceof Uint8Array) || x.length !== 32 || y.length !== 32) {
      return { ok: false, error: 'Unsupported EC2 passkey curve or coordinate length.' };
    }
    const spki = new Uint8Array(P256_SPKI_PREFIX.length + 64);
    spki.set(P256_SPKI_PREFIX, 0);
    spki.set(x, P256_SPKI_PREFIX.length);
    spki.set(y, P256_SPKI_PREFIX.length + 32);
    try {
      await crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    } catch (_) {
      return { ok: false, error: 'Invalid P-256 passkey public key point.' };
    }
    return { ok: true, alg: -7, spkiB64u: u8ToB64Url(spki) };
  }

  if (kty === 3 && alg === -257) {
    const n = coseMap.get(-1);
    const e = coseMap.get(-2);
    if (!(n instanceof Uint8Array) || !(e instanceof Uint8Array) || e.length === 0 || e.length > 8) {
      return { ok: false, error: 'Invalid RSA passkey key parameters.' };
    }
    let nz = 0;
    while (nz < n.length && n[nz] === 0) nz++;
    const nClean = n.subarray(nz);
    if (nClean.length < 256 || nClean.length > 512) {
      return { ok: false, error: 'RSA passkey modulus must be between 2048 and 4096 bits.' };
    }
    const eBig = bytesToBigInt(e);
    if (eBig < 3n || (eBig & 1n) === 0n) {
      return { ok: false, error: 'Invalid RSA passkey public exponent.' };
    }
    const rsaPubKeyDer = derTlv(0x30, concatU8(derIntegerFromUnsigned(nClean), derIntegerFromUnsigned(e)));
    const bitStr = derTlv(0x03, concatU8(Uint8Array.of(0x00), rsaPubKeyDer));
    const spki = derTlv(0x30, concatU8(RSA_ALG_ID_DER, bitStr));
    try {
      await crypto.subtle.importKey('spki', spki, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    } catch (_) {
      return { ok: false, error: 'Invalid RS256 passkey public key.' };
    }
    return { ok: true, alg: -257, spkiB64u: u8ToB64Url(spki) };
  }

  return { ok: false, error: 'Unsupported passkey algorithm. Use ES256 or RS256.' };
}

function formatAaguid(u8) {
  if (!(u8 instanceof Uint8Array) || u8.length !== 16) return '';
  const hex = Array.from(u8, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sanitizeDeviceLabel(raw) {
  const s = String(raw || '').replace(/[\u0000-\u001f\u007f<>`]/g, ' ').replace(/\s+/g, ' ').trim();
  return (s || 'Trusted Security Device').slice(0, 60);
}

function hydratePasskeySummary(row) {
  if (!row) return null;
  let transports = [];
  try {
    const parsed = JSON.parse(String(row.transports || '[]'));
    if (Array.isArray(parsed)) transports = parsed.map(x => String(x || '').slice(0, 24)).slice(0, 8);
  } catch (_) {}
  return {
    id: String(row.id || ''),
    user_id: String(row.user_id || ''),
    alg: Number(row.alg || -7),
    device_label: String(row.device_label || 'Trusted Security Device'),
    transports,
    aaguid: String(row.aaguid || ''),
    backup_eligible: Boolean(row.backup_eligible),
    backup_state: Boolean(row.backup_state),
    uv_verified: Boolean(row.uv_verified == null ? 1 : row.uv_verified),
    sign_count: Number(row.sign_count || 0),
    created_at: String(row.created_at || ''),
    last_used_at: String(row.last_used_at || '')
  };
}

export async function attachUserPasskeysMeta(db, hydratedRows, callerSession) {
  if (!db || !Array.isArray(hydratedRows) || !hydratedRows.length) return hydratedRows;
  try {
    await ensurePasskeysSchema(db);
    const res = await db.prepare(
      'SELECT id, user_id, alg, sign_count, transports, aaguid, device_label, backup_eligible, backup_state, uv_verified, created_at, last_used_at FROM user_passkeys ORDER BY created_at DESC'
    ).all();
    const byUser = new Map();
    for (const pk of (res.results || [])) {
      const uid = String(pk.user_id || '');
      if (!byUser.has(uid)) byUser.set(uid, []);
      byUser.get(uid).push(hydratePasskeySummary(pk));
    }
    const callerIsOwner = isOwnerOrFullGroupSession(callerSession);
    const callerSub = String((callerSession && callerSession.sub) || '');
    for (const u of hydratedRows) {
      if (!u || typeof u !== 'object') continue;
      const list = byUser.get(String(u.id || '')) || [];
      u.passkey_count = list.length;
      u.passkeys_enrolled = list.length > 0;
      if (callerIsOwner || String(u.id || '') === callerSub) {
        u.passkeys = list;
      } else {
        delete u.passkeys;
      }
    }
  } catch (_) {}
  return hydratedRows;
}

async function consumeChallengeAtomic(db, { challengeId, purpose, rpId, origin, callerSid = '' }) {
  await ensurePasskeysSchema(db);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const res = await db.prepare(
    `UPDATE passkey_challenges
     SET consumed_at = ?1
     WHERE id = ?2 AND purpose = ?3 AND rp_id = ?4 AND origin = ?5
       AND (?6 = '' OR caller_sid = ?6)
       AND consumed_at = '' AND expires_at_ms >= ?7`
  ).bind(nowIso, String(challengeId || ''), String(purpose), String(rpId), String(origin), String(callerSid || ''), nowMs).run();
  if (!res || !res.meta || res.meta.changes !== 1) return null;
  return db.prepare('SELECT * FROM passkey_challenges WHERE id = ?1 LIMIT 1').bind(String(challengeId || '')).first();
}

async function createChallenge(db, { purpose, userId = '', callerSid = '', rpId, origin }) {
  await ensurePasskeysSchema(db);
  const nowMs = Date.now();
  const idBytes = crypto.getRandomValues(new Uint8Array(12));
  const chalBytes = crypto.getRandomValues(new Uint8Array(32));
  const id = `pkc-${nowMs}-${u8ToB64Url(idBytes)}`;
  const challengeB64u = u8ToB64Url(chalBytes);
  const expiresAtMs = nowMs + CHALLENGE_TTL_MS;
  const nowIso = new Date(nowMs).toISOString();
  await db.prepare('DELETE FROM passkey_challenges WHERE expires_at_ms < ?1').bind(nowMs - 60000).run().catch(() => {});
  await db.prepare(
    `INSERT INTO passkey_challenges (
       id, purpose, user_id, caller_sid, challenge_b64u, rp_id, origin, expires_at_ms, consumed_at, created_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, '', ?9)`
  ).bind(id, String(purpose), String(userId || ''), String(callerSid || ''), challengeB64u, String(rpId), String(origin), expiresAtMs, nowIso).run();
  return { challengeId: id, challenge: challengeB64u, expiresAtMs };
}

function rowFromJoinedUserQuery(joined) {
  if (!joined) return null;
  return {
    id: joined.u_id,
    email: joined.u_email,
    full_name: joined.u_full_name,
    role: joined.u_role,
    companies: joined.u_companies,
    pbi_access: joined.u_pbi_access,
    statements_access: joined.u_statements_access,
    status: joined.u_status,
    custom_perms: joined.u_custom_perms,
    auth_mode: joined.u_auth_mode,
    face_samples: joined.u_face_samples,
    face_thumbs: joined.u_face_thumbs,
    face_required: joined.u_face_required,
    face_updated_at: joined.u_face_updated_at,
    seat_updated_at: joined.u_seat_updated_at,
    last_login_at: joined.u_last_login_at,
    pin_code: joined.u_pin_code || '',
    payload_json: joined.u_payload_json
  };
}

async function verifyPasskeyAssertionCore(db, rp, assertionPayload, { challengeId, purpose, callerSid = '', expectedUserId = '', expectedEmail = '' }) {
  const rawIdStr = String((assertionPayload && (assertionPayload.rawId || assertionPayload.id)) || '').trim();
  const resp = assertionPayload && assertionPayload.response && typeof assertionPayload.response === 'object' ? assertionPayload.response : null;
  if (!rawIdStr || !resp) {
    return { ok: false, status: 400, error: 'Incomplete passkey assertion payload.' };
  }
  const clientDataU8 = b64UrlToU8(resp.clientDataJSON);
  const authDataU8 = b64UrlToU8(resp.authenticatorData);
  const sigU8 = b64UrlToU8(resp.signature);
  if (!clientDataU8 || !authDataU8 || !sigU8 || authDataU8.length < 37) {
    return { ok: false, status: 400, error: 'Malformed WebAuthn assertion bytes.' };
  }

  const chalRow = await consumeChallengeAtomic(db, {
    challengeId,
    purpose,
    rpId: rp.rpId,
    origin: rp.expectedOrigin,
    callerSid
  });
  if (!chalRow) {
    return { ok: false, status: 401, code: 'challenge_invalid', error: 'Passkey challenge expired or already used. Please try again.' };
  }

  let clientDataObj = null;
  try {
    clientDataObj = JSON.parse(DEC.decode(clientDataU8));
  } catch (_) {
    return { ok: false, status: 400, error: 'Invalid WebAuthn clientDataJSON.' };
  }
  if (!clientDataObj || clientDataObj.type !== 'webauthn.get' || clientDataObj.origin !== rp.expectedOrigin || clientDataObj.crossOrigin === true) {
    return { ok: false, status: 401, error: 'Passkey origin or ceremony type mismatch.' };
  }
  if (!(await constantTimeEqual(String(clientDataObj.challenge || ''), String(chalRow.challenge_b64u || '')))) {
    return { ok: false, status: 401, error: 'Passkey challenge mismatch.' };
  }

  const expectedRpHash = await sha256(ENC.encode(rp.rpId));
  if (!constantTimeBytesEqual(authDataU8.subarray(0, 32), expectedRpHash)) {
    return { ok: false, status: 401, error: 'Passkey RP ID hash mismatch.' };
  }

  const flags = authDataU8[32];
  const up = (flags & 0x01) !== 0;
  const uv = (flags & 0x04) !== 0;
  if (!up || !uv) {
    return { ok: false, status: 401, code: 'uv_required', error: 'Passkey verification requires device biometric or PIN confirmation (UV).' };
  }
  const newSignCount = (
    ((authDataU8[33] << 24) >>> 0) |
    (authDataU8[34] << 16) |
    (authDataU8[35] << 8) |
    authDataU8[36]
  ) >>> 0;

  const joined = await db.prepare(
    `SELECT pk.*,
            u.id AS u_id, u.email AS u_email, u.full_name AS u_full_name, u.role AS u_role,
            u.companies AS u_companies, u.pbi_access AS u_pbi_access, u.statements_access AS u_statements_access,
            u.status AS u_status, u.custom_perms AS u_custom_perms, u.auth_mode AS u_auth_mode,
            u.face_samples AS u_face_samples, u.face_thumbs AS u_face_thumbs, u.face_required AS u_face_required,
            u.face_updated_at AS u_face_updated_at, u.seat_updated_at AS u_seat_updated_at,
            u.last_login_at AS u_last_login_at, u.pin_code AS u_pin_code, u.payload_json AS u_payload_json
     FROM user_passkeys pk
     JOIN users u ON u.id = pk.user_id
     WHERE pk.credential_id = ?1 LIMIT 1`
  ).bind(rawIdStr).first();

  if (!joined) {
    return { ok: false, status: 401, error: 'Unrecognized passkey credential.' };
  }
  const userRow = rowFromJoinedUserQuery(joined);
  if (!isPasskeyEligibleSeat(userRow)) {
    return { ok: false, status: 403, error: 'This account seat is inactive or not eligible for passkey verification.' };
  }
  if (await isSeatPinOnly(db, userRow)) {
    return {
      ok: false,
      status: purpose === 'login' ? 401 : 403,
      userRow,
      error: purpose === 'login'
        ? 'PIN sign-in active for this seat.'
        : 'Passkeys are disabled while PIN-only verification is active for this seat.'
    };
  }
  if (expectedUserId && String(userRow.id || '') !== String(expectedUserId)) {
    return { ok: false, status: 403, error: 'Passkey credential does not belong to the required seat.' };
  }
  if (chalRow.user_id && String(userRow.id || '') !== String(chalRow.user_id)) {
    return { ok: false, status: 403, error: 'Passkey credential does not match the challenged seat.' };
  }
  if (expectedEmail && String(userRow.email || '').trim().toLowerCase() !== String(expectedEmail).trim().toLowerCase()) {
    return { ok: false, status: 401, userRow, error: 'Passkey belongs to a different account seat.' };
  }
  if (resp.userHandle) {
    const uhBytes = b64UrlToU8(resp.userHandle);
    if (uhBytes && uhBytes.length > 0) {
      let uhStr = '';
      try { uhStr = DEC.decode(uhBytes); } catch (_) { uhStr = ''; }
      if (uhStr && uhStr !== String(userRow.id || '')) {
        return { ok: false, status: 401, userRow, error: 'Passkey user handle mismatch.' };
      }
    }
  }

  const spkiU8 = b64UrlToU8(joined.public_key_spki);
  if (!spkiU8) {
    return { ok: false, status: 500, error: 'Stored passkey public key is corrupted.' };
  }
  const clientDataHash = await sha256(clientDataU8);
  const signedData = concatU8(authDataU8, clientDataHash);
  const alg = Number(joined.alg || -7);

  let sigValid = false;
  if (alg === -7) {
    const p1363Sig = derEcdsaToP1363(sigU8);
    if (!p1363Sig) {
      return { ok: false, status: 401, userRow, error: 'Malformed ECDSA passkey signature.' };
    }
    try {
      const cryptoKey = await crypto.subtle.importKey('spki', spkiU8, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      sigValid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, p1363Sig, signedData);
    } catch (_) {
      sigValid = false;
    }
  } else if (alg === -257) {
    try {
      const cryptoKey = await crypto.subtle.importKey('spki', spkiU8, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      sigValid = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, cryptoKey, sigU8, signedData);
    } catch (_) {
      sigValid = false;
    }
  }
  if (!sigValid) {
    return { ok: false, status: 401, userRow, error: 'Passkey signature verification failed.' };
  }

  const storedCount = Number(joined.sign_count || 0);
  if ((storedCount > 0 || newSignCount > 0) && newSignCount <= storedCount) {
    return {
      ok: false,
      status: 403,
      userRow,
      code: 'passkey_cloned_authenticator',
      error: 'Authenticator counter rollback detected (possible cloned passkey).'
    };
  }

  const nowIso = new Date().toISOString();
  const updRes = await db.prepare(
    `UPDATE user_passkeys
     SET sign_count = ?1, last_used_at = ?2, uv_verified = 1
     WHERE id = ?3 AND (sign_count < ?1 OR (sign_count = 0 AND ?1 = 0))`
  ).bind(newSignCount, nowIso, String(joined.id), newSignCount).run();
  if (!updRes || !updRes.meta || updRes.meta.changes !== 1) {
    return {
      ok: false,
      status: 409,
      userRow,
      code: 'passkey_replay_conflict',
      error: 'Concurrent passkey replay detected. Please try again.'
    };
  }

  return { ok: true, userRow, passkeyRow: joined, newSignCount };
}

export async function verifyPasskeyOverrideAssertion(request, env, session, body, url) {
  const rp = resolveWebAuthnRp(request, url);
  if (!rp.ok) return jsonResponse({ ok: false, error: rp.error }, rp.status || 400);

  const pa = body && body.passkey_assertion && typeof body.passkey_assertion === 'object' ? body.passkey_assertion : null;
  const challengeId = String((pa && pa.challengeId) || '').trim();
  const credential = pa && pa.credential && typeof pa.credential === 'object' ? pa.credential : null;
  if (!pa || !challengeId || !credential) {
    return jsonResponse({ ok: false, error: 'Passkey challengeId and credential assertion are required.' }, 400);
  }

  const expectedEmail = String((body && body.email) || '').trim().toLowerCase();
  const company = String((body && body.company) || '').trim().slice(0, 80);
  const formKey = String((body && body.form_key) || '').trim().slice(0, 60);
  const fieldId = String((body && body.field_id) || '').trim().slice(0, 80);
  const fieldLabel = String((body && body.field_label) || '').trim().slice(0, 120);
  const unlockAll = Boolean(body && body.unlock_all === true);
  const recordId = String((body && body.record_id) || '').trim().slice(0, 80);

  const ipHash = await hashClientIp(request);
  const callerKey = String(session.sub || session.email || 'anon').trim().toLowerCase();
  const callerLockKey = `rl:lock_ov_caller:${callerKey}`;
  const pairLockKey = expectedEmail ? `rl:lock_ov_pair:${ipHash}:${expectedEmail}` : '';
  const ovLockKeys = pairLockKey ? [callerLockKey, pairLockKey] : [callerLockKey];

  const nowCheckMs = Date.now();
  let maxOvLockedUntil = 0;
  for (const lk of ovLockKeys) {
    const entry = await readLockEntry(env.DB, lk);
    if (entry && Number(entry.lockedUntilMs || 0) > nowCheckMs) {
      maxOvLockedUntil = Math.max(maxOvLockedUntil, Number(entry.lockedUntilMs));
    }
  }
  if (maxOvLockedUntil > nowCheckMs) {
    const retrySec = Math.max(1, Math.ceil((maxOvLockedUntil - nowCheckMs) / 1000));
    return jsonResponse({
      ok: false,
      rate_limited: true,
      retry_after_sec: retrySec,
      error: `Too many failed override attempts. Please wait ${Math.max(1, Math.ceil(retrySec / 60))} minute(s).`
    }, 429, { 'Retry-After': String(retrySec) });
  }

  const failOverride = async (errMsg, status = 401, code = '') => {
    const memCaller = checkSlidingRateLimit(`ov_fail_caller:${callerKey}`, 5, 300000);
    const memPair = expectedEmail ? checkSlidingRateLimit(`ov_fail_pair:${ipHash}:${expectedEmail}`, 5, 300000) : { allowed: true };
    let throttled = !memCaller.allowed || !memPair.allowed;
    let retrySec = throttled ? 300 : 0;
    try {
      const fMs = Date.now();
      const fIso = new Date(fMs).toISOString();
      for (const lk of ovLockKeys) {
        const lState = await bumpLockCounter(env.DB, lk, OVERRIDE_LOCK_WINDOW_MS, fMs, fIso);
        if (Number(lState.lockedUntilMs || 0) > fMs) {
          throttled = true;
          retrySec = Math.max(retrySec, Math.ceil((Number(lState.lockedUntilMs) - fMs) / 1000));
        }
      }
    } catch (_) {}
    if (throttled) {
      const waitSec = Math.max(1, retrySec);
      return jsonResponse({
        ok: false,
        rate_limited: true,
        retry_after_sec: waitSec,
        error: `Too many failed override attempts. Please wait ${Math.max(1, Math.ceil(waitSec / 60))} minute(s).`
      }, 429, { 'Retry-After': String(waitSec) });
    }
    const payload = { ok: false, error: errMsg };
    if (code) payload.code = code;
    return jsonResponse(payload, status);
  };

  const vr = await verifyPasskeyAssertionCore(env.DB, rp, credential, {
    challengeId,
    purpose: 'verify_override',
    callerSid: String(session.sid || ''),
    expectedEmail
  });
  if (!vr.ok) {
    return failOverride(vr.error, vr.status || 401, vr.code || '');
  }

  const row = vr.userRow;
  if (!canUserRowAuthorizeOverride(row, fieldId, unlockAll)) {
    return failOverride('Supervisor or Owner privileges are required to authorize field overrides.', 403);
  }
  const supSessionLike = {
    sub: row.id,
    email: row.email,
    role: row.role,
    companies: row.companies,
    pbi: row.pbi_access || 'partial'
  };
  const normCo = company.toLowerCase().replace(/\s+/g, ' ');
  if (normCo && normCo !== 'all' && normCo !== 'all bus' && normCo !== 'shared') {
    if (!canAccessSentinelScope(session, company)) {
      return failOverride('Caller session is not authorized for this company scope.', 403);
    }
    if (!canAccessSentinelScope(supSessionLike, company)) {
      return failOverride('Authorizing Supervisor does not have access to this company.', 403);
    }
  } else if (normCo === 'all' || normCo === 'all bus') {
    if (!isOwnerOrFullGroupSession(session) || !isOwnerOrFullGroupSession(supSessionLike)) {
      return failOverride('Group-wide override requires full-group Owner authorization.', 403);
    }
  } else if (!shareAnyAllowedCompany(session, supSessionLike)) {
    return failOverride('Authorizing Supervisor does not share an assigned company with this session.', 403);
  }

  await ensureOverrideAuditSchema(env.DB);
  const randHex = Array.from(crypto.getRandomValues(new Uint8Array(4)), b => b.toString(16).padStart(2, '0')).join('');
  const auditId = `ova-${Date.now()}-${randHex}`;
  const createdAt = new Date().toISOString();

  await Promise.all([
    env.DB.prepare(
      `INSERT INTO override_audit (
         id, created_at, caller_user_id, caller_email, caller_role,
         supervisor_user_id, supervisor_email, supervisor_name, supervisor_role,
         company, form_key, field_id, field_label, unlock_all, record_id, ip_hash
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)`
    ).bind(
      auditId,
      createdAt,
      String(session.sub || ''),
      String(session.email || ''),
      String(session.role || ''),
      String(row.id || ''),
      String(row.email || ''),
      String(row.full_name || ''),
      String(row.role || ''),
      company,
      formKey,
      fieldId || (unlockAll ? '__all' : ''),
      fieldLabel,
      unlockAll ? 1 : 0,
      recordId,
      ipHash
    ).run(),
    ...ovLockKeys.map(lk => env.DB.prepare('DELETE FROM edge_kv_store WHERE doc_key = ?1').bind(lk).run().catch(() => {}))
  ]);

  return jsonResponse({
    ok: true,
    audit_id: auditId,
    created_at: createdAt,
    company,
    field_id: fieldId || (unlockAll ? '__all' : ''),
    unlock_all: unlockAll,
    method: 'Passkey (FIDO2)',
    authorized_by: {
      id: row.id,
      full_name: row.full_name || '',
      email: row.email || '',
      role: row.role || ''
    }
  });
}

export async function handlePasskeysApi(request, env, session, body, url) {
  if (isDemoHeader(request)) {
    return jsonResponse({ ok: false, error: 'Passkeys API is disabled in demo mode.' }, 403);
  }
  if (!env || !env.DB) return jsonResponse({ ok: false, error: 'Edge database unavailable.' }, 503);
  if (request.method !== 'POST') return jsonResponse({ ok: false, error: 'POST required.' }, 405);

  const rp = resolveWebAuthnRp(request, url);
  if (!rp.ok) return jsonResponse({ ok: false, error: rp.error }, rp.status || 400);

  await ensurePasskeysSchema(env.DB);
  const action = String((body && body.action) || '').trim().toLowerCase();
  const ipHash = await hashClientIp(request);

  if (action === 'list') {
    if (!session) return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
    const reqUserId = String((body && body.user_id) || session.sub || '').trim();
    const isOwner = isOwnerOrFullGroupSession(session);
    if (reqUserId !== String(session.sub || '') && !isOwner) {
      return jsonResponse({ ok: false, error: 'Cannot view passkeys for another user seat.' }, 403);
    }
    const targetRow = await env.DB.prepare('SELECT * FROM users WHERE id = ?1 LIMIT 1').bind(reqUserId).first();
    const res = await env.DB.prepare(
      'SELECT id, user_id, alg, sign_count, transports, aaguid, device_label, backup_eligible, backup_state, uv_verified, created_at, last_used_at FROM user_passkeys WHERE user_id = ?1 ORDER BY created_at DESC'
    ).bind(reqUserId).all();
    return jsonResponse({
      ok: true,
      eligible: Boolean(targetRow && isPasskeyEligibleSeat(targetRow)),
      max_passkeys: MAX_PASSKEYS_PER_SEAT,
      passkeys: (res.results || []).map(hydratePasskeySummary)
    });
  }

  if (action === 'delete') {
    if (!session) return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
    const pkId = String((body && body.id) || '').trim();
    if (!pkId) return jsonResponse({ ok: false, error: 'Passkey id is required.' }, 400);
    const row = await env.DB.prepare('SELECT id, user_id FROM user_passkeys WHERE id = ?1 LIMIT 1').bind(pkId).first();
    if (!row) return jsonResponse({ ok: false, error: 'Passkey not found.' }, 404);
    if (String(row.user_id || '') !== String(session.sub || '') && !isOwnerOrFullGroupSession(session)) {
      return jsonResponse({ ok: false, error: 'Not authorized to revoke another user seat passkey.' }, 403);
    }
    await env.DB.prepare('DELETE FROM user_passkeys WHERE id = ?1').bind(pkId).run();
    return jsonResponse({ ok: true, deleted_id: pkId });
  }

  if (action === 'register_options' || action === 'register_verify') {
    if (!session) return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
    const reqTargetUid = String((body && body.user_id) || '').trim();
    if (reqTargetUid && reqTargetUid !== String(session.sub || '')) {
      return jsonResponse({ ok: false, error: 'Passkeys may only be enrolled for your own signed-in seat.' }, 403);
    }
    const callerRow = await env.DB.prepare('SELECT * FROM users WHERE id = ?1 LIMIT 1').bind(String(session.sub || '')).first();
    if (!callerRow || !isPasskeyEligibleSeat(callerRow)) {
      return jsonResponse({ ok: false, error: 'Passkey enrolment is restricted to active Owner, Supervisor, or override-eligible seats.' }, 403);
    }
    if (await isSeatPinOnly(env.DB, callerRow)) {
      return jsonResponse({ ok: false, error: 'Passkeys are disabled while PIN-only verification is active for this seat.' }, 403);
    }
    const freshStepUp = await hasFreshStepUpReceipt(env.DB, session.sid, callerRow.id);
    if (!freshStepUp) {
      return jsonResponse({
        ok: false,
        step_up_required: true,
        error: 'Complete fresh Step-Up verification before enrolling a passkey.'
      }, 403);
    }
    const existingRes = await env.DB.prepare('SELECT credential_id, transports FROM user_passkeys WHERE user_id = ?1')
      .bind(String(callerRow.id)).all();
    const existingList = existingRes.results || [];
    if (existingList.length >= MAX_PASSKEYS_PER_SEAT) {
      return jsonResponse({ ok: false, error: `Maximum ${MAX_PASSKEYS_PER_SEAT} passkeys reached for this seat.` }, 400);
    }

    if (action === 'register_options') {
      const rl = await checkD1RateLimit(env, `pk-reg:${String(callerRow.id)}`, 15, 300, { failClosed: true });
      if (!rl.allowed) return jsonResponse({ ok: false, error: 'Too many passkey enrolment attempts. Please wait.' }, 429);
      const { challengeId, challenge } = await createChallenge(env.DB, {
        purpose: 'register',
        userId: String(callerRow.id),
        callerSid: String(session.sid || ''),
        rpId: rp.rpId,
        origin: rp.expectedOrigin
      });
      const excludeCredentials = existingList.map(r => {
        let tr = [];
        try { tr = JSON.parse(String(r.transports || '[]')); } catch (_) { tr = []; }
        return {
          type: 'public-key',
          id: String(r.credential_id),
          transports: Array.isArray(tr) && tr.length ? tr : undefined
        };
      });
      return jsonResponse({
        ok: true,
        challengeId,
        options: {
          challenge,
          rp: { id: rp.rpId, name: 'ISABI Systems Command Center' },
          user: {
            id: u8ToB64Url(ENC.encode(String(callerRow.id))),
            name: String(callerRow.email || callerRow.id),
            displayName: String(callerRow.full_name || callerRow.email || callerRow.id)
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 }
          ],
          authenticatorSelection: {
            residentKey: 'required',
            requireResidentKey: true,
            userVerification: 'required'
          },
          timeout: 60000,
          attestation: 'none',
          excludeCredentials
        }
      });
    }

    // register_verify
    const challengeId = String((body && body.challengeId) || '').trim();
    const cred = body && body.credential && typeof body.credential === 'object' ? body.credential : null;
    const resp = cred && cred.response && typeof cred.response === 'object' ? cred.response : null;
    if (!challengeId || !cred || !resp) {
      return jsonResponse({ ok: false, error: 'Passkey registration challengeId and credential are required.' }, 400);
    }
    const chalRow = await consumeChallengeAtomic(env.DB, {
      challengeId,
      purpose: 'register',
      rpId: rp.rpId,
      origin: rp.expectedOrigin,
      callerSid: String(session.sid || '')
    });
    if (!chalRow || String(chalRow.user_id || '') !== String(callerRow.id)) {
      return jsonResponse({ ok: false, error: 'Registration challenge expired or invalid.' }, 401);
    }

    const clientDataU8 = b64UrlToU8(resp.clientDataJSON);
    const attObjU8 = b64UrlToU8(resp.attestationObject);
    const rawIdU8 = b64UrlToU8(cred.rawId || cred.id);
    if (!clientDataU8 || !attObjU8 || !rawIdU8 || rawIdU8.length === 0 || rawIdU8.length > 1024) {
      return jsonResponse({ ok: false, error: 'Malformed WebAuthn registration payload.' }, 400);
    }
    let clientDataObj = null;
    try { clientDataObj = JSON.parse(DEC.decode(clientDataU8)); } catch (_) { clientDataObj = null; }
    if (!clientDataObj || clientDataObj.type !== 'webauthn.create' || clientDataObj.origin !== rp.expectedOrigin || clientDataObj.crossOrigin === true) {
      return jsonResponse({ ok: false, error: 'Passkey registration origin or ceremony mismatch.' }, 401);
    }
    if (!(await constantTimeEqual(String(clientDataObj.challenge || ''), String(chalRow.challenge_b64u || '')))) {
      return jsonResponse({ ok: false, error: 'Passkey registration challenge mismatch.' }, 401);
    }

    let attMap = null;
    try {
      const decAtt = decodeCborFirst(attObjU8, 0, 0);
      attMap = decAtt.value;
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Malformed CBOR attestationObject.' }, 400);
    }
    if (!(attMap instanceof Map)) {
      return jsonResponse({ ok: false, error: 'Invalid attestationObject structure.' }, 400);
    }
    const authDataU8 = attMap.get('authData');
    if (!(authDataU8 instanceof Uint8Array) || authDataU8.length < 55) {
      return jsonResponse({ ok: false, error: 'Missing attested credential data.' }, 400);
    }
    const expectedRpHash = await sha256(ENC.encode(rp.rpId));
    if (!constantTimeBytesEqual(authDataU8.subarray(0, 32), expectedRpHash)) {
      return jsonResponse({ ok: false, error: 'Attestation RP ID hash mismatch.' }, 401);
    }
    const flags = authDataU8[32];
    const up = (flags & 0x01) !== 0;
    const uv = (flags & 0x04) !== 0;
    const at = (flags & 0x40) !== 0;
    if (!up || !uv || !at) {
      return jsonResponse({ ok: false, error: 'Passkey registration requires User Verification (UV) and attested credential data.' }, 401);
    }
    const backupEligible = (flags & 0x08) ? 1 : 0;
    const backupState = (flags & 0x10) ? 1 : 0;
    const initSignCount = (
      ((authDataU8[33] << 24) >>> 0) |
      (authDataU8[34] << 16) |
      (authDataU8[35] << 8) |
      authDataU8[36]
    ) >>> 0;
    const aaguidStr = formatAaguid(authDataU8.subarray(37, 53));
    const credIdLen = (authDataU8[53] << 8) | authDataU8[54];
    if (credIdLen < 1 || credIdLen > 1024 || 55 + credIdLen >= authDataU8.length) {
      return jsonResponse({ ok: false, error: 'Invalid attested credentialId length.' }, 400);
    }
    const authCredId = authDataU8.subarray(55, 55 + credIdLen);
    if (!constantTimeBytesEqual(authCredId, rawIdU8)) {
      return jsonResponse({ ok: false, error: 'Credential ID mismatch between authData and rawId.' }, 400);
    }

    let coseRes = null;
    try {
      const parsedCose = decodeCborFirst(authDataU8, 55 + credIdLen, 0);
      coseRes = await coseMapToVerifiedSpki(parsedCose.value);
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Malformed COSE credential public key.' }, 400);
    }
    if (!coseRes || !coseRes.ok) {
      return jsonResponse({ ok: false, error: (coseRes && coseRes.error) || 'Invalid passkey public key.' }, 400);
    }

    const credIdB64u = u8ToB64Url(authCredId);
    const transportsRaw = Array.isArray(resp.transports) ? resp.transports : (Array.isArray(cred.transports) ? cred.transports : []);
    const transportsClean = transportsRaw.map(t => String(t || '').trim().slice(0, 24)).filter(Boolean).slice(0, 8);
    const deviceLabel = sanitizeDeviceLabel(body.device_label || body.deviceLabel || 'Security Device Passkey');
    const pkId = `pk-${Date.now()}-${u8ToB64Url(crypto.getRandomValues(new Uint8Array(6)))}`;
    const nowIso = new Date().toISOString();

    let insRes = null;
    try {
      insRes = await env.DB.prepare(
        `INSERT INTO user_passkeys (
           id, user_id, credential_id, public_key_spki, alg, sign_count, transports, aaguid,
           device_label, backup_eligible, backup_state, uv_verified, created_at, last_used_at
         )
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1, ?12, ''
         WHERE (SELECT COUNT(*) FROM user_passkeys WHERE user_id = ?2) < ?13`
      ).bind(
        pkId,
        String(callerRow.id),
        credIdB64u,
        coseRes.spkiB64u,
        coseRes.alg,
        initSignCount,
        JSON.stringify(transportsClean),
        aaguidStr,
        deviceLabel,
        backupEligible,
        backupState,
        nowIso,
        MAX_PASSKEYS_PER_SEAT
      ).run();
    } catch (err) {
      const msg = String((err && err.message) || err || '');
      if (/UNIQUE constraint failed/i.test(msg)) {
        return jsonResponse({ ok: false, error: 'This passkey is already registered.' }, 409);
      }
      throw err;
    }
    if (!insRes || !insRes.meta || Number(insRes.meta.changes || 0) < 1) {
      return jsonResponse({ ok: false, error: `Maximum ${MAX_PASSKEYS_PER_SEAT} passkeys reached for this seat.` }, 400);
    }

    const saved = await env.DB.prepare(
      'SELECT id, user_id, alg, sign_count, transports, aaguid, device_label, backup_eligible, backup_state, uv_verified, created_at, last_used_at FROM user_passkeys WHERE id = ?1 LIMIT 1'
    ).bind(pkId).first();
    return jsonResponse({ ok: true, passkey: hydratePasskeySummary(saved) });
  }

  if (action === 'auth_options') {
    const purpose = String((body && body.purpose) || 'login').trim().toLowerCase();
    if (purpose !== 'login' && purpose !== 'step_up' && purpose !== 'verify_override') {
      return jsonResponse({ ok: false, error: 'Unsupported passkey ceremony purpose.' }, 400);
    }
    if (purpose === 'login') {
      const rl = await checkD1RateLimit(env, `pk-opt:${ipHash}`, 30, 60, { failClosed: true });
      if (!rl.allowed) return jsonResponse({ ok: false, error: 'Too many passkey sign-in attempts. Wait a minute.' }, 429);
      const lockState = await checkAuthLockout(env.DB, ipHash, '', false);
      if (lockState.locked) {
        return jsonResponse({ ok: false, rate_limited: true, retry_after_sec: lockState.retryAfterSec, error: 'Too many failed sign-in attempts. Please wait.' }, 429);
      }
      const { challengeId, challenge } = await createChallenge(env.DB, {
        purpose: 'login',
        userId: '',
        callerSid: '',
        rpId: rp.rpId,
        origin: rp.expectedOrigin
      });
      // Always empty allowCredentials on unauthenticated login so seat/email enumeration is impossible
      return jsonResponse({
        ok: true,
        challengeId,
        options: {
          challenge,
          rpId: rp.rpId,
          allowCredentials: [],
          userVerification: 'required',
          timeout: 60000
        }
      });
    }

    if (!session) return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);

    if (purpose === 'step_up') {
      const callerRow = await env.DB.prepare('SELECT * FROM users WHERE id = ?1 LIMIT 1').bind(String(session.sub || '')).first();
      if (!callerRow || !isPasskeyEligibleSeat(callerRow)) {
        return jsonResponse({ ok: false, error: 'This seat is not eligible for passkey step-up.' }, 403);
      }
      if (await isSeatPinOnly(env.DB, callerRow)) {
        return jsonResponse({ ok: false, error: 'Passkeys are disabled while PIN-only verification is active for this seat.' }, 403);
      }
      const credsRes = await env.DB.prepare('SELECT credential_id, transports FROM user_passkeys WHERE user_id = ?1')
        .bind(String(callerRow.id)).all();
      const allowCredentials = (credsRes.results || []).map(r => {
        let tr = [];
        try { tr = JSON.parse(String(r.transports || '[]')); } catch (_) { tr = []; }
        return { type: 'public-key', id: String(r.credential_id), transports: Array.isArray(tr) && tr.length ? tr : undefined };
      });
      if (!allowCredentials.length) {
        return jsonResponse({ ok: false, error: 'No passkeys enrolled on this account.' }, 400);
      }
      const { challengeId, challenge } = await createChallenge(env.DB, {
        purpose: 'step_up',
        userId: String(callerRow.id),
        callerSid: String(session.sid || ''),
        rpId: rp.rpId,
        origin: rp.expectedOrigin
      });
      return jsonResponse({
        ok: true,
        challengeId,
        options: {
          challenge,
          rpId: rp.rpId,
          allowCredentials,
          userVerification: 'required',
          timeout: 60000
        }
      });
    }

    // verify_override
    const supEmail = String((body && body.email) || '').trim().toLowerCase();
    const company = String((body && body.company) || '').trim().slice(0, 80);
    if (company && !/^(all|all bus|shared)$/i.test(company) && !canAccessSentinelScope(session, company)) {
      return jsonResponse({ ok: false, error: 'Caller session is not authorized for this company scope.' }, 403);
    }
    const { challengeId, challenge } = await createChallenge(env.DB, {
      purpose: 'verify_override',
      userId: '',
      callerSid: String(session.sid || ''),
      rpId: rp.rpId,
      origin: rp.expectedOrigin
    });
    // Optional company-verified supervisor credential scoping (only if email supplied & supervisor shares scope)
    let allowCredentials = [];
    if (supEmail) {
      const supRow = await env.DB.prepare('SELECT * FROM users WHERE lower(email) = ?1 LIMIT 1').bind(supEmail).first();
      if (supRow && isPasskeyEligibleSeat(supRow) && !(await isSeatPinOnly(env.DB, supRow))) {
        const supSess = { sub: supRow.id, email: supRow.email, role: supRow.role, companies: supRow.companies, pbi: supRow.pbi_access || 'partial' };
        const sameCo = company
          ? canAccessSentinelScope(supSess, company)
          : shareAnyAllowedCompany(session, supSess);
        if (sameCo) {
          const credsRes = await env.DB.prepare('SELECT credential_id, transports FROM user_passkeys WHERE user_id = ?1')
            .bind(String(supRow.id)).all();
          allowCredentials = (credsRes.results || []).map(r => {
            let tr = [];
            try { tr = JSON.parse(String(r.transports || '[]')); } catch (_) { tr = []; }
            return { type: 'public-key', id: String(r.credential_id), transports: Array.isArray(tr) && tr.length ? tr : undefined };
          });
        }
      }
    }
    return jsonResponse({
      ok: true,
      challengeId,
      options: {
        challenge,
        rpId: rp.rpId,
        allowCredentials,
        userVerification: 'required',
        timeout: 60000
      }
    });
  }

  if (action === 'auth_verify') {
    const purpose = String((body && body.purpose) || 'login').trim().toLowerCase();
    const challengeId = String((body && body.challengeId) || '').trim();
    const cred = body && body.credential && typeof body.credential === 'object' ? body.credential : null;
    if (!challengeId || !cred) {
      return jsonResponse({ ok: false, error: 'Passkey challengeId and credential are required.' }, 400);
    }

    if (purpose === 'step_up') {
      if (!session) return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
      const rl = checkSlidingRateLimit(`pk_stepup:${session.sub || ipHash}`, 10, 300000);
      if (!rl.allowed) return jsonResponse({ ok: false, rate_limited: true, error: 'Too many failed step-up attempts. Please wait.' }, 429);
      const vr = await verifyPasskeyAssertionCore(env.DB, rp, cred, {
        challengeId,
        purpose: 'step_up',
        callerSid: String(session.sid || ''),
        expectedUserId: String(session.sub || '')
      });
      if (!vr.ok) return jsonResponse({ ok: false, code: vr.code || '', error: vr.error }, vr.status || 401);
      await writeStepUpReceipt(env.DB, session.sid, vr.userRow.id, 'Passkey (FIDO2)');
      const stepUpUser = hydrateUserRow(vr.userRow, true, true);
      await attachUserPasskeysMeta(env.DB, [stepUpUser], session);
      return jsonResponse({
        ok: true,
        step_up: true,
        verify_only: true,
        method: 'Passkey (FIDO2)',
        user: stepUpUser
      });
    }

    if (purpose === 'login') {
      const expectedEmail = String((body && body.email) || '').trim().toLowerCase();
      const lockState = await checkAuthLockout(env.DB, ipHash, expectedEmail, false);
      if (lockState.locked) {
        return jsonResponse({ ok: false, rate_limited: true, retry_after_sec: lockState.retryAfterSec, error: `Too many failed sign-in attempts. Please wait ${Math.max(1, Math.ceil(lockState.retryAfterSec / 60))} minute(s).` }, 429);
      }
      const rlIp = checkSlidingRateLimit(`pk_login:${ipHash}`, 20, 300000);
      if (!rlIp.allowed) return jsonResponse({ ok: false, rate_limited: true, error: 'Too many failed sign-in attempts.' }, 429);

      const vr = await verifyPasskeyAssertionCore(env.DB, rp, cred, {
        challengeId,
        purpose: 'login',
        expectedEmail
      });
      if (!vr.ok) {
        await recordAuthFailure(env.DB, ipHash, expectedEmail || (vr.userRow && vr.userRow.email) || '');
        return jsonResponse({ ok: false, code: vr.code || '', error: vr.error }, vr.status || 401);
      }

      const row = vr.userRow;
      const wsFaceSettings = await readWorkspaceFaceSettings(env.DB);
      let hasBio = false;
      try {
        const fsParsed = typeof row.face_samples === 'string' ? JSON.parse(row.face_samples || '[]') : row.face_samples;
        hasBio = Array.isArray(fsParsed) && fsParsed.some(v => Array.isArray(v) && v.length === 128);
      } catch (_) {}
      const authMode = resolveServerSeatAuthMode(row, wsFaceSettings, hasBio);
      if (authMode === 'pin_only') {
        await recordAuthFailure(env.DB, ipHash, row.email || '');
        return jsonResponse({ ok: false, error: 'PIN sign-in active for this seat.' }, 401);
      }

      const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const randSess = Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('');
      const sessId = `sess-${Date.now()}-${randSess}`;
      const device = sanitizeDeviceLabel(body.device || 'Passkey Device');

      let cpParsed = row.custom_perms;
      if (typeof cpParsed === 'string' && cpParsed.trim()) {
        try { cpParsed = JSON.parse(cpParsed); } catch (_) { cpParsed = null; }
      }
      const edgeToken = await signEdgeSession({
        sid: sessId,
        sub: row.id,
        email: row.email,
        name: row.full_name,
        role: row.role,
        companies: row.companies,
        pbi: row.pbi_access || 'partial',
        stmts: row.statements_access || 'full',
        ws_write: canWriteWorkSchedulesSession({
          sub: row.id,
          id: row.id,
          role: row.role,
          companies: row.companies,
          custom_perms: cpParsed
        })
      }, env);

      const cleanupOps = [];
      if (session && session.sid && session.sid !== sessId) {
        cleanupOps.push(
          env.DB.prepare('DELETE FROM auth_sessions WHERE id = ?1').bind(String(session.sid)).run(),
          env.DB.prepare('DELETE FROM edge_kv_store WHERE doc_key = ?1').bind(`stepup_ok:${String(session.sid)}`).run()
        );
      }
      await Promise.all([
        env.DB.prepare('UPDATE users SET last_login_at = ?1 WHERE id = ?2').bind(nowIso, row.id).run(),
        env.DB.prepare(
          `INSERT OR REPLACE INTO auth_sessions (id, user_id, email, full_name, role, companies, device, logged_in_at, method, confidence, ip_hash)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 100, ?10)`
        ).bind(sessId, row.id, row.email, row.full_name, row.role, row.companies, device, nowIso, 'Passkey (FIDO2)', ipHash).run(),
        clearAuthFailure(env.DB, ipHash, row.email, {}),
        ...cleanupOps
      ]);

      const userOut = hydrateUserRow(Object.assign({}, row, { last_login_at: nowIso }), true, false);
      await attachUserPasskeysMeta(env.DB, [userOut], { sub: row.id, role: row.role, companies: row.companies });
      const isHttps = rp.expectedOrigin.startsWith('https://');
      const headers = { 'Set-Cookie': buildSessionCookie(edgeToken, 60 * 60 * 24 * 14, isHttps) };
      const isBrowser = Boolean(request.headers.get('Sec-Fetch-Site'));
      const respObj = {
        ok: true,
        user: userOut,
        session_id: sessId,
        method: 'Passkey (FIDO2)'
      };
      if (!isBrowser) respObj.token = edgeToken;
      return jsonResponse(respObj, 200, headers);
    }

    return jsonResponse({ ok: false, error: 'Unsupported auth_verify purpose. Use verify-override for override assertions.' }, 400);
  }

  return jsonResponse({ ok: false, error: 'Unknown passkeys action.' }, 400);
}
