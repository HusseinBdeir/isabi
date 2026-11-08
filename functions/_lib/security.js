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

export function isAllowedCorsOrigin(origin) {
  const o = String(origin || '').trim();
  if (!o) return false;
  if (
    o === 'https://isabisystems.com' ||
    o === 'https://www.isabisystems.com' ||
    o === 'https://isabi-systems.pages.dev'
  ) {
    return true;
  }
  if (/^https:\/\/[a-z0-9-]+\.isabi-systems\.pages\.dev$/i.test(o)) return true;
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(o)) return true;
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
      const checkOrigin = reqOrigin || refOrigin;
      if (!checkOrigin || (checkOrigin !== selfOrigin && !isAllowedCorsOrigin(checkOrigin))) {
        return null;
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

export async function hashClientIp(request) {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'local';
  const digest = await crypto.subtle.digest('SHA-256', ENC.encode('isabi-ip:' + ip));
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

export function isSameOriginBrowserRequest(request, urlObj) {
  const targetOrigin = (urlObj && urlObj.origin) || (() => {
    try { return new URL(request.url).origin; } catch (_) { return ''; }
  })();
  const reqOrigin = String(request.headers.get('Origin') || '').trim();
  if (reqOrigin) {
    return reqOrigin === targetOrigin || isAllowedCorsOrigin(reqOrigin);
  }
  const reqRef = String(request.headers.get('Referer') || '').trim();
  if (reqRef) {
    try {
      const refOrigin = new URL(reqRef).origin;
      if (refOrigin === targetOrigin || isAllowedCorsOrigin(refOrigin)) return true;
    } catch (_) {}
  }
  const fetchSite = String(request.headers.get('Sec-Fetch-Site') || '').trim().toLowerCase();
  if (fetchSite === 'same-origin') return true;
  return false;
}

export async function checkD1RateLimit(env, bucketKey, maxReqs = 15, windowSec = 60) {
  const mem = checkSlidingRateLimit(bucketKey, maxReqs, windowSec * 1000);
  if (!mem.allowed) return { allowed: false, remaining: 0 };
  if (!env || !env.DB) return mem;
  const slot = Math.floor(Date.now() / (windowSec * 1000));
  const docKey = `rl:${bucketKey}:${slot}`;
  const nowIso = new Date().toISOString();
  try {
    if (Math.random() < 0.05) {
      await env.DB.prepare('DELETE FROM edge_kv_store WHERE doc_key LIKE ?1 AND doc_key != ?2')
        .bind(`rl:${bucketKey}:%`, docKey).run();
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

export function applyEdgeCors(response, request) {
  if (!response || !request) return response;
  const origin = String(request.headers.get('Origin') || '').trim();
  if (!origin || !isAllowedCorsOrigin(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export function jsonResponse(payload, status = 200, extraHeaders = {}) {
  const headers = Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-ISABI-Edge': '1',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-ISABI-Session, X-ISABI-Demo'
  }, extraHeaders);
  return new Response(JSON.stringify(payload), { status, headers });
}
