/**
 * ISABI Systems — Edge Security, HMAC Session Tokens, BU RLS & Rate Limiting
 * Runs natively on Cloudflare Workers / Pages Functions WebCrypto API.
 */

const ENC = new TextEncoder();
const DEC = new TextDecoder();

const RATE_BUCKETS = new Map();

function b64UrlEncode(bytes) {
  let bin = '';
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64UrlDecode(str) {
  const norm = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm + '==='.slice((norm.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function resolveEdgeJwtSecret(env) {
  const configured = env && typeof env.ISABI_JWT_SECRET === 'string' ? env.ISABI_JWT_SECRET.trim() : '';
  if (configured.length >= 16) return configured;
  if (env && String(env.ISABI_ALLOW_DEV_SECRET || '') === '1') {
    return 'isabi-edge-dev-fallback-secret-change-in-prod';
  }
  return '';
}

async function getHmacKey(secretStr) {
  if (!secretStr || typeof secretStr !== 'string') {
    throw new Error('HMAC secret is not configured');
  }
  const raw = ENC.encode(secretStr);
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function constantTimeEqual(a, b) {
  const sa = String(a || '');
  const sb = String(b || '');
  const key = await getHmacKey('isabi-pin-cmp-v1');
  const [ha, hb] = await Promise.all([
    crypto.subtle.sign('HMAC', key, ENC.encode(sa)),
    crypto.subtle.sign('HMAC', key, ENC.encode(sb))
  ]);
  const ua = new Uint8Array(ha);
  const ub = new Uint8Array(hb);
  if (ua.length !== ub.length) return false;
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

const PBKDF2_ITERS = 100000;
const HEX_PIN_RE = /^pbkdf2\$sha256\$\d+\$([0-9a-fA-F]{32})\$([0-9a-fA-F]{64})$/;
const B64_PIN_RE = /^pbkdf2\$sha256\$\d+\$[A-Za-z0-9_-]{16,44}\$[A-Za-z0-9_-]{32,88}$/;

function hexToBytes(hexStr) {
  const out = new Uint8Array(hexStr.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hexStr.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function isHashedPin(val) {
  if (typeof val !== 'string') return false;
  const s = val.trim();
  return HEX_PIN_RE.test(s) || B64_PIN_RE.test(s);
}

export function isWeakPin(pin) {
  const s = String(pin || '').trim();
  if (isHashedPin(s)) return false;
  if (!/^\d{4,12}$/.test(s)) return true;
  if (/^(\d)\1+$/.test(s)) return true;
  if ('0123456789012345'.includes(s) || '9876543210987654'.includes(s) || '09876543210'.includes(s)) return true;
  return false;
}

export async function hashSeatPin(pin, iterations = PBKDF2_ITERS) {
  const clean = String(pin || '').trim();
  if (!clean) return '';
  if (B64_PIN_RE.test(clean) && !HEX_PIN_RE.test(clean)) return clean;
  if (HEX_PIN_RE.test(clean)) {
    const parts = clean.split('$');
    return `pbkdf2$sha256$${parts[2]}$${b64UrlEncode(hexToBytes(parts[3]))}$${b64UrlEncode(hexToBytes(parts[4]))}`;
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const baseKey = await crypto.subtle.importKey('raw', ENC.encode(clean), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    baseKey,
    256
  );
  return `pbkdf2$sha256$${iterations}$${b64UrlEncode(salt)}$${b64UrlEncode(new Uint8Array(bits))}`;
}

export async function verifySeatPin(candidatePin, storedVal) {
  const cand = String(candidatePin || '').trim();
  const stored = String(storedVal || '').trim();
  if (!cand || !stored) return { ok: false, needsUpgrade: false };
  if (isHashedPin(stored)) {
    const parts = stored.split('$');
    const iters = Math.max(1000, Math.min(600000, parseInt(parts[2], 10) || PBKDF2_ITERS));
    const isHexLegacy = HEX_PIN_RE.test(stored);
    let salt;
    let expected;
    try {
      salt = isHexLegacy ? hexToBytes(parts[3]) : b64UrlDecode(parts[3]);
      expected = isHexLegacy ? hexToBytes(parts[4]) : b64UrlDecode(parts[4]);
    } catch (_) {
      return { ok: false, needsUpgrade: false };
    }
    const baseKey = await crypto.subtle.importKey('raw', ENC.encode(cand), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iters },
      baseKey,
      expected.byteLength * 8
    );
    const actual = new Uint8Array(bits);
    if (actual.length !== expected.length) return { ok: false, needsUpgrade: false };
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    const ok = diff === 0;
    return { ok, needsUpgrade: Boolean(ok && isHexLegacy) };
  }
  const ok = await constantTimeEqual(cand, stored);
  return { ok, needsUpgrade: ok };
}

export async function signEdgeSession(claims, env, ttlSeconds = 60 * 60 * 24 * 14) {
  const secret = resolveEdgeJwtSecret(env);
  if (!secret) {
    throw new Error('ISABI_JWT_SECRET is not configured on Edge Worker');
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = Object.assign({}, claims, {
    iat: nowSec,
    exp: nowSec + ttlSeconds,
    iss: 'isabi-edge-v1'
  });
  const headerB64 = b64UrlEncode(ENC.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payloadB64 = b64UrlEncode(ENC.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await getHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, ENC.encode(signingInput));
  return `${signingInput}.${b64UrlEncode(sig)}`;
}

export async function verifyEdgeSession(token, env) {
  if (!token || typeof token !== 'string') return null;
  const secret = resolveEdgeJwtSecret(env);
  if (!secret) return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;
  try {
    const signingInput = `${parts[0]}.${parts[1]}`;
    const sigBytes = b64UrlDecode(parts[2]);
    const key = await getHmacKey(secret);
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, ENC.encode(signingInput));
    if (!valid) return null;
    const payload = JSON.parse(DEC.decode(b64UrlDecode(parts[1])));
    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload || (payload.exp && payload.exp < nowSec)) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

export function parseCookieHeader(cookieHdr) {
  const out = {};
  if (!cookieHdr) return out;
  String(cookieHdr).split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      if (k) out[k] = decodeURIComponent(v);
    }
  });
  return out;
}

export function isAllowedCorsOrigin(origin, request = null, env = null) {
  const o = String(origin || '').trim();
  if (!o) return false;
  if (o === 'https://isabisystems.com' || o === 'https://www.isabisystems.com') {
    return true;
  }
  if (o === 'https://husseinbdeir.github.io' && request) {
    try {
      const reqPath = new URL(request.url).pathname || '';
      if (reqPath === '/app/api/kiosk' || reqPath.startsWith('/app/api/kiosk/') || reqPath === '/api/kiosk' || reqPath.startsWith('/api/kiosk/')) {
        return true;
      }
    } catch (_) {}
    return false;
  }
  if (env && String(env.CORS_ALLOWED_ORIGIN || '').trim() && o === String(env.CORS_ALLOWED_ORIGIN).trim()) {
    return true;
  }
  if (env && String(env.ALLOW_PAGES_PREVIEW_ORIGIN || '') === '1') {
    if (o === 'https://isabi-systems.pages.dev' || /^https:\/\/[a-z0-9-]+\.isabi-systems\.pages\.dev$/i.test(o)) {
      return true;
    }
  }
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(o)) {
    if (env && String(env.ISABI_ALLOW_DEV_SECRET || '') === '1') return true;
    if (request) {
      try {
        const reqHost = new URL(request.url).hostname;
        if (reqHost === '127.0.0.1' || reqHost === 'localhost') return true;
      } catch (_) {}
      return false;
    }
    return false;
  }
  return false;
}

export async function extractRequestSession(request, env) {
  const authHdr = request.headers.get('Authorization') || '';
  if (authHdr.startsWith('Bearer ')) {
    const s = await verifyEdgeSession(authHdr.slice(7).trim(), env);
    if (s) return s;
  }
  const customHdr = request.headers.get('X-ISABI-Session') || '';
  if (customHdr) {
    const s = await verifyEdgeSession(customHdr.trim(), env);
    if (s) return s;
  }
  const cookies = parseCookieHeader(request.headers.get('Cookie') || '');
  if (cookies.isabi_edge_sess) {
    const m = String(request.method || 'GET').toUpperCase();
    if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS') {
      let selfOrigin = '';
      try { selfOrigin = new URL(request.url).origin; } catch (_) {}
      const reqOrigin = String(request.headers.get('Origin') || '').trim();
      const reqRef = String(request.headers.get('Referer') || '').trim();
      let refOrigin = '';
      if (reqRef) {
        try { refOrigin = new URL(reqRef).origin; } catch (_) {}
      }
      if (reqOrigin) {
        if (reqOrigin !== selfOrigin && !isAllowedCorsOrigin(reqOrigin, request, env)) return null;
      } else if (refOrigin) {
        if (refOrigin !== selfOrigin && !isAllowedCorsOrigin(refOrigin, request, env)) return null;
      } else {
        const fetchSite = String(request.headers.get('Sec-Fetch-Site') || '').trim().toLowerCase();
        if (fetchSite !== 'same-origin') return null;
      }
    }
    const s = await verifyEdgeSession(cookies.isabi_edge_sess, env);
    if (s) return s;
  }
  return null;
}

export function buildSessionCookie(token, maxAgeSec = 60 * 60 * 24 * 14, isSecure = true) {
  const sec = isSecure ? '; Secure' : '';
  return `isabi_edge_sess=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${sec}`;
}

export function clearSessionCookie(isSecure = true) {
  const sec = isSecure ? '; Secure' : '';
  return `isabi_edge_sess=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${sec}`;
}

export function parseAllowedCompanies(companiesStr) {
  const raw = String(companiesStr || '').trim();
  if (!raw) return [];
  if (/^all\b/i.test(raw)) return ['*'];
  return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

export function isOwnerOrFullGroupSession(session) {
  if (!session) return false;
  const role = String(session.role || '').toLowerCase();
  if (role.includes('owner') || session.sub === 'u1' || session.sub === 'u2') return true;
  const allowed = parseAllowedCompanies(session.companies);
  return allowed.includes('*') || allowed.length >= 12;
}

const ENTITY_ALIAS_MAP = {
  wtc: 'wtc',
  'wtc (world trading & construction)': 'wtc',
  bbconstruction: 'bbconstruction',
  'bb construction': 'bbconstruction',
  bbc: 'bbconstruction',
  lionstransport: 'lions transport',
  'lions transport': 'lions transport',
  lions: 'lions transport',
  bdeirholding: 'bdeir holding',
  'bdeir holding': 'bdeir holding',
  blanca: 'blanca',
  launa: 'la una',
  'la una': 'la una',
  palms: 'palms',
  voile: 'voile',
  platinum: 'platinum',
  korriauto: 'korri auto',
  'korri auto': 'korri auto',
  shacman: 'shacman',
  properties: 'properties',
  '4235company': '4235 company s.a.l',
  '4235 company': '4235 company s.a.l',
  '4235 company s.a.l': '4235 company s.a.l',
  '4235': '4235 company s.a.l',
  insurance: 'insurance company',
  'insurance company': 'insurance company',
  'bdeir insurance brokerage': 'insurance company'
};

function canonEntityKey(raw) {
  const k = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return ENTITY_ALIAS_MAP[k] || k;
}

const ENTITY_INDUSTRY_MAP = {
  wtc: 'Manufacturing',
  bbconstruction: 'Manufacturing',
  'lions transport': 'Manufacturing',
  'bdeir holding': 'Holding & Treasury',
  blanca: 'Hospitality & Resorts',
  'la una': 'Hospitality & Resorts',
  palms: 'Hospitality & Resorts',
  voile: 'Hospitality & Resorts',
  platinum: 'Hospitality & Resorts',
  'korri auto': 'Automotive & Heavy Trading',
  shacman: 'Automotive & Heavy Trading',
  properties: 'Real Estate & Property',
  '4235 company s.a.l': 'Real Estate & Property',
  'insurance company': 'Insurance & Brokerage'
};

export function canAccessCompany(session, companyName) {
  if (!session) return false;
  if (isOwnerOrFullGroupSession(session)) return true;
  if (!companyName) return false;
  const normCo = String(companyName).trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normCo || normCo === 'all' || normCo === 'all bus' || normCo === 'shared') return false;
  const allowed = parseAllowedCompanies(session.companies);
  if (allowed.includes('*')) return true;
  const targetCanon = canonEntityKey(normCo);
  return allowed.some(c => canonEntityKey(c) === targetCanon);
}

export function canReviewSentinelsSession(session) {
  if (!session) return false;
  if (isOwnerOrFullGroupSession(session)) return true;
  const role = String(session.role || '').trim();
  const pbiFull = String(session.pbi || session.pbi_access || '').trim().toLowerCase() === 'full';
  if (/^custom$/i.test(role)) return pbiFull;
  return /owner|admin|super|director|cfo|audit/i.test(role) || pbiFull;
}

export function canAccessSentinelScope(session, scopeCo) {
  if (!session || !scopeCo) return false;
  if (isOwnerOrFullGroupSession(session)) return true;
  const normScope = String(scopeCo).trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normScope) return false;
  const rawAllowed = parseAllowedCompanies(session.companies);
  if (rawAllowed.includes('*')) return true;
  const allowedCanon = Array.from(new Set(rawAllowed.map(c => canonEntityKey(c)).filter(Boolean)));
  const industriesSeen = new Set(allowedCanon.map(c => ENTITY_INDUSTRY_MAP[c]).filter(Boolean));
  if (normScope === 'manufacturing-group') {
    const mfgCnt = allowedCanon.filter(c => ENTITY_INDUSTRY_MAP[c] === 'Manufacturing').length;
    return mfgCnt >= 2 || (industriesSeen.size >= 2 && allowedCanon.length >= 2 && mfgCnt >= 1);
  }
  if (normScope.startsWith('industry:')) {
    const targetInd = normScope.slice(9).trim();
    const indCnt = allowedCanon.filter(c => (ENTITY_INDUSTRY_MAP[c] || '').toLowerCase() === targetInd).length;
    if (!indCnt) return false;
    const singleBuInd = targetInd === 'holding & treasury' || targetInd === 'insurance & brokerage';
    return indCnt >= 2 || (industriesSeen.size >= 2 && indCnt >= 1) || singleBuInd;
  }
  return canAccessCompany(session, scopeCo);
}

export function canManageUsersSeat(session) {
  if (!session) return false;
  const role = String(session.role || '').toLowerCase();
  return role.includes('owner') || role.includes('supervisor') || session.sub === 'u1' || session.sub === 'u2';
}

export function normalizeIpForRateLimit(rawIp) {
  let ip = String(rawIp || 'local').split(',')[0].trim().toLowerCase();
  if (!ip) return 'local';
  if (ip.startsWith('::ffff:') && ip.includes('.')) {
    ip = ip.slice(7);
  }
  if (!ip.includes(':')) return ip.slice(0, 64);
  // Collapse IPv6 addresses to their /64 prefix (first 4 hextets) so interface rotation cannot evade limits
  const zoneIdx = ip.indexOf('%');
  if (zoneIdx > 0) ip = ip.slice(0, zoneIdx);
  const dbl = ip.split('::');
  if (dbl.length > 2) return ip.slice(0, 64);
  const left = dbl[0] ? dbl[0].split(':').filter(Boolean) : [];
  const right = dbl.length === 2 && dbl[1] ? dbl[1].split(':').filter(Boolean) : [];
  if (dbl.length === 2) {
    const fill = Math.max(0, 8 - (left.length + right.length));
    const full = left.concat(Array(fill).fill('0'), right).slice(0, 8);
    return full.slice(0, 4).map(h => h.padStart(4, '0')).join(':') + '::/64';
  }
  if (left.length >= 4) {
    return left.slice(0, 4).map(h => h.padStart(4, '0')).join(':') + '::/64';
  }
  return ip.slice(0, 64);
}

export async function hashClientIp(request) {
  const raw = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'local';
  const norm = normalizeIpForRateLimit(raw);
  const digest = await crypto.subtle.digest('SHA-256', ENC.encode('isabi-ip:' + norm));
  return b64UrlEncode(digest).slice(0, 16);
}

export function checkSlidingRateLimit(key, maxReqs = 45, windowMs = 60000) {
  const now = Date.now();
  if (RATE_BUCKETS.size > 2000) {
    for (const [k, v] of RATE_BUCKETS.entries()) {
      if (now - v.resetAt > windowMs) RATE_BUCKETS.delete(k);
    }
  }
  let entry = RATE_BUCKETS.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    RATE_BUCKETS.set(key, entry);
  }
  entry.count += 1;
  return {
    allowed: entry.count <= maxReqs,
    remaining: Math.max(0, maxReqs - entry.count),
    resetAt: entry.resetAt
  };
}

export function isSameOriginBrowserRequest(request, urlObj, env = null) {
  const targetOrigin = (urlObj && urlObj.origin) || (() => {
    try { return new URL(request.url).origin; } catch (_) { return ''; }
  })();
  const reqOrigin = String(request.headers.get('Origin') || '').trim();
  if (reqOrigin) {
    return reqOrigin === targetOrigin || isAllowedCorsOrigin(reqOrigin, request, env);
  }
  const reqRef = String(request.headers.get('Referer') || '').trim();
  if (reqRef) {
    try {
      const refOrigin = new URL(reqRef).origin;
      if (refOrigin === targetOrigin || isAllowedCorsOrigin(refOrigin, request, env)) return true;
      return false;
    } catch (_) {
      return false;
    }
  }
  const fetchSite = String(request.headers.get('Sec-Fetch-Site') || '').trim().toLowerCase();
  if (fetchSite === 'same-origin') return true;
  return false;
}

export async function checkD1RateLimit(env, bucketKey, maxReqs = 15, windowSec = 60, failClosed = false) {
  const mustFailClosed = typeof failClosed === 'object' && failClosed !== null
    ? Boolean(failClosed.failClosed)
    : Boolean(failClosed);
  const mem = checkSlidingRateLimit(bucketKey, maxReqs, windowSec * 1000);
  if (!mem.allowed) return { allowed: false, remaining: 0 };
  if (!env || !env.DB) return mustFailClosed ? { allowed: false, remaining: 0, dbError: true } : mem;
  const slot = Math.floor(Date.now() / (windowSec * 1000));
  const docKey = `rl:${bucketKey}:${slot}`;
  const nowIso = new Date().toISOString();
  const cutoffIso = new Date(Date.now() - 86400000 * 2).toISOString();
  try {
    if (Math.random() < 0.05) {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM edge_kv_store WHERE doc_key LIKE ?1 AND doc_key != ?2').bind(`rl:${bucketKey}:%`, docKey),
        env.DB.prepare("DELETE FROM edge_kv_store WHERE doc_key LIKE 'rl:%' AND updated_at < ?1").bind(cutoffIso)
      ]);
    }
    const row = await env.DB.prepare(
      `INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, rev)
       VALUES (?1, '1', ?2, 1)
       ON CONFLICT(doc_key) DO UPDATE SET updated_at = excluded.updated_at, rev = edge_kv_store.rev + 1
       RETURNING rev`
    ).bind(docKey, nowIso).first();
    const count = Number((row && row.rev) || 1);
    return { allowed: count <= maxReqs, remaining: Math.max(0, maxReqs - count) };
  } catch (_) {
    if (mustFailClosed) return { allowed: false, remaining: 0, dbError: true };
    return mem;
  }
}

export async function verifyActiveEdgeSession(session, env) {
  if (!session || !env || !env.DB) return null;
  try {
    const sid = String(session.sid || '').trim();
    if (!sid) return null;
    const sessRow = await env.DB.prepare('SELECT id FROM auth_sessions WHERE id = ?1 LIMIT 1')
      .bind(sid).first();
    if (!sessRow) return null;

    const email = String(session.email || '').trim().toLowerCase();
    const sub = String(session.sub || '').trim();
    if (!sub && !email) return null;

    const uRow = await env.DB.prepare(
      'SELECT id, status, role, companies, pbi_access, statements_access FROM users WHERE id = ?1 OR lower(email) = ?2 LIMIT 1'
    ).bind(sub, email).first();

    if (!uRow) {
      const anyUser = await env.DB.prepare('SELECT 1 AS ok FROM users LIMIT 1').first();
      if (anyUser) return null;
      return session;
    }

    if (String(uRow.status || 'Active') === 'Suspended') return null;

    return Object.assign({}, session, {
      sub: uRow.id || session.sub,
      role: uRow.role != null ? uRow.role : session.role,
      companies: uRow.companies != null ? uRow.companies : session.companies,
      pbi: uRow.pbi_access != null ? uRow.pbi_access : session.pbi,
      stmts: uRow.statements_access != null ? uRow.statements_access : session.stmts
    });
  } catch (_) {
    return null;
  }
}

export const DEFAULT_EDGE_SECURITY_HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-ISABI-Edge': '1'
});

export function applyEdgeCors(response, request, env = null) {
  if (!response || !request) return response;
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(DEFAULT_EDGE_SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  const origin = String(request.headers.get('Origin') || '').trim();
  if (!origin || !isAllowedCorsOrigin(origin, request, env)) {
    headers.delete('Access-Control-Allow-Origin');
  } else {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  const isNullBody = response.status === 204 || response.status === 304;
  return new Response(isNullBody ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export function jsonResponse(payload, status = 200, extraHeaders = {}) {
  const headers = Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-ISABI-Session, X-ISABI-Demo'
  }, DEFAULT_EDGE_SECURITY_HEADERS, extraHeaders);
  if (status === 204 || status === 304) {
    delete headers['Content-Type'];
    return new Response(null, { status, headers });
  }
  return new Response(JSON.stringify(payload), { status, headers });
}
