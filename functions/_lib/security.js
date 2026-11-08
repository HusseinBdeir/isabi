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

async function getHmacKey(secretStr) {
  const raw = ENC.encode(String(secretStr || 'isabi-edge-dev-fallback-secret-change-in-prod'));
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
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = Object.assign({}, claims, {
    iat: nowSec,
    exp: nowSec + ttlSeconds,
    iss: 'isabi-edge-v1'
  });
  const headerB64 = b64UrlEncode(ENC.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payloadB64 = b64UrlEncode(ENC.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await getHmacKey(env && env.ISABI_JWT_SECRET);
  const sig = await crypto.subtle.sign('HMAC', key, ENC.encode(signingInput));
  return `${signingInput}.${b64UrlEncode(sig)}`;
}

export async function verifyEdgeSession(token, env) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;
  try {
    const signingInput = `${parts[0]}.${parts[1]}`;
    const sigBytes = b64UrlDecode(parts[2]);
    const key = await getHmacKey(env && env.ISABI_JWT_SECRET);
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

export function canAccessCompany(session, companyName) {
  if (!companyName) return true;
  const normCo = String(companyName).trim().toLowerCase();
  if (!normCo || normCo === 'all' || normCo === 'all bus' || normCo === 'shared') return true;
  if (!session) return true; // Unauthenticated read fallback handled at endpoint level
  if (isOwnerOrFullGroupSession(session)) return true;
  const allowed = parseAllowedCompanies(session.companies);
  if (allowed.includes('*')) return true;
  return allowed.some(c => c === normCo || normCo.includes(c) || c.includes(normCo));
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

export function jsonResponse(payload, status = 200, extraHeaders = {}) {
  const headers = Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-ISABI-Edge': '1',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-ISABI-Session, X-ISABI-Demo'
  }, extraHeaders);
  return new Response(JSON.stringify(payload), { status, headers });
}
