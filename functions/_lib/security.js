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

const KIOSK_ONLY_CORS_ORIGINS = new Set([
  'https://husseinbdeir.github.io',
  'https://pos.isabisystems.com',
  'https://attendance.isabisystems.com'
]);

export function isAllowedCorsOrigin(origin, request = null, env = null) {
  const o = String(origin || '').trim();
  if (!o) return false;
  if (o === 'https://isabisystems.com' || o === 'https://www.isabisystems.com') {
    return true;
  }
  if (KIOSK_ONLY_CORS_ORIGINS.has(o) && request) {
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
        if (KIOSK_ONLY_CORS_ORIGINS.has(reqOrigin) || (reqOrigin !== selfOrigin && !isAllowedCorsOrigin(reqOrigin, request, env))) return null;
      } else if (refOrigin) {
        if (KIOSK_ONLY_CORS_ORIGINS.has(refOrigin) || (refOrigin !== selfOrigin && !isAllowedCorsOrigin(refOrigin, request, env))) return null;
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
  if (raw === '*' || /^all\b/i.test(raw)) return ['*'];
  const out = [];
  const seen = new Set();
  for (const part of raw.split(',')) {
    const t = part.trim();
    if (!t) continue;
    if (t === '*' || /^all\b/i.test(t)) return ['*'];
    const ck = canonEntityKey(t);
    if (ck && !seen.has(ck)) {
      seen.add(ck);
      out.push(ck);
    }
  }
  return out;
}

export function isOwnerOrFullGroupSession(session) {
  if (!session) return false;
  const role = String(session.role || '').toLowerCase();
  if (role.includes('owner') || session.sub === 'u1' || session.sub === 'u2') return true;
  const allowed = parseAllowedCompanies(session.companies);
  return allowed.includes('*');
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
  'bdeir holding · consolidated jv': 'bdeir holding',
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

export function canonEntityKey(raw) {
  const k = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (ENTITY_ALIAS_MAP[k]) return ENTITY_ALIAS_MAP[k];
  if (k.includes('·')) {
    const head = k.split('·')[0].trim();
    if (ENTITY_ALIAS_MAP[head]) return ENTITY_ALIAS_MAP[head];
  }
  return k;
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

export function canEnrolStaffBiometricsSession(session) {
  if (!session) return false;
  if (session.locked || session.kioskLocked || /^kiosk_/i.test(String(session.sub || ''))) return false;
  if (isOwnerOrFullGroupSession(session) || canManageUsersSeat(session)) return true;
  const role = String(session.role || '').trim().toLowerCase();
  if (/owner|admin|super|manager|director|entry/.test(role)) return true;
  if (role === 'custom') {
    let perms = session.custom_perms;
    if (typeof perms === 'string') {
      try { perms = JSON.parse(perms); } catch (_) { perms = null; }
    }
    if (perms && typeof perms === 'object') {
      const rights = (perms.rights && typeof perms.rights === 'object') ? perms.rights : perms;
      const forms = (perms.forms && typeof perms.forms === 'object') ? perms.forms : perms;
      return Boolean(
        rights.enter_master || rights.enter_dispatch || forms.enter_master || forms.staff || forms.employment
        || perms.canManageUsers || perms.manageUsers
      );
    }
  }
  return false;
}

export function canReadStaffBiometricCompany(session, rawCompanyStr) {
  if (!session) return false;
  if (isOwnerOrFullGroupSession(session)) return true;
  const cos = parseAllowedCompanies(rawCompanyStr).filter(c => c && c !== '*');
  return cos.length > 0 && cos.some(c => canAccessCompany(session, c));
}

export function canWriteStaffBiometricCompany(session, rawCompanyStr) {
  if (!session) return false;
  if (isOwnerOrFullGroupSession(session)) return true;
  const cos = parseAllowedCompanies(rawCompanyStr).filter(c => c && c !== '*');
  return cos.length > 0 && cos.every(c => canAccessCompany(session, c));
}

export function canWriteWorkSchedulesSession(session) {
  if (!session) return false;
  if (isOwnerOrFullGroupSession(session)) return true;
  const sub = String(session.sub || session.id || session.user_id || '').trim().toLowerCase();
  if (sub === 'u1' || sub === 'u2') return true;
  const role = String(session.role || '').trim().toLowerCase();
  if (role === 'custom') {
    let perms = session.custom_perms;
    if (typeof perms === 'string') {
      try { perms = JSON.parse(perms); } catch (_) { perms = null; }
    }
    if (perms && typeof perms === 'object') {
      const rights = (perms.rights && typeof perms.rights === 'object') ? perms.rights : perms;
      const forms = (perms.forms && typeof perms.forms === 'object') ? perms.forms : perms;
      const canMod = Boolean(rights.modify_data);
      const canForm = Boolean(
        rights.enter_master || rights.enter_payroll_jv
        || forms.enter_master || forms.enter_payroll_jv
        || forms.enter_workshift || forms.workshift
      );
      return canMod && canForm;
    }
    if (typeof session.ws_write === 'boolean') return session.ws_write;
    return false;
  }
  if (/\bowner\b|full\s+access|\badmin\b/i.test(role)) return true;
  if (role.includes('supervisor') && role.includes('entry')) return true;
  return false;
}

export function canonGeoIndustryKey(raw) {
  const s = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s || s.includes('manufactur') || s === 'mfg') return 'Manufacturing';
  if (s.includes('holding') || s.includes('treasury')) return 'Holding & Treasury';
  if (s.includes('hospitality') || s.includes('resort')) return 'Hospitality & Resorts';
  if (s.includes('trading') || s.includes('auto')) return 'Automotive & Heavy Trading';
  if (s.includes('real estate') || s.includes('realestate') || s.includes('property')) return 'Real Estate & Property';
  if (s.includes('insur') || s.includes('broker')) return 'Insurance & Brokerage';
  return String(raw || '').trim();
}

export function canAccessGeoIndustrySession(session, industry = 'Manufacturing') {
  if (!session) return false;
  if (isOwnerOrFullGroupSession(session)) return true;
  const allowed = parseAllowedCompanies(session.companies);
  if (allowed.includes('*')) return true;
  const targetInd = canonGeoIndustryKey(industry || 'Manufacturing');
  return allowed.some(c => ENTITY_INDUSTRY_MAP[canonEntityKey(c)] === targetInd);
}

export function canWriteGeoConfigSession(session) {
  if (!session) return false;
  const perms = getSessionWritePerms(session);
  return Boolean(perms && perms.canWriteGeoConfig);
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

// A seat preview (an Owner pressing Impersonate) is a look at another seat, not that person's own sign-in.
// Its session row is marked by this sign-in method and is honoured for 12 hours from its start, whatever
// the lifetime of the token that carries it (tokens issued before this rule ran for 14 days).
export const SEAT_PREVIEW_METHOD = 'Owner Impersonation';
export const SEAT_PREVIEW_TTL_SEC = 60 * 60 * 12;

export function isSeatPreviewSessionRow(sessRow) {
  return Boolean(sessRow && String(sessRow.method || '').trim() === SEAT_PREVIEW_METHOD);
}

export function isExpiredSeatPreviewRow(sessRow, nowMs = Date.now()) {
  if (!isSeatPreviewSessionRow(sessRow)) return false;
  // `logged_in_at` is UTC, `YYYY-MM-DD HH:MM:SS`. A preview with no readable start is over (fail closed).
  const startedMs = Date.parse(String(sessRow.logged_in_at || '').trim().replace(' ', 'T') + 'Z');
  if (!Number.isFinite(startedMs)) return true;
  return (nowMs - startedMs) > SEAT_PREVIEW_TTL_SEC * 1000;
}

export async function verifyActiveEdgeSession(session, env) {
  if (!session || !env || !env.DB) return null;
  try {
    const sid = String(session.sid || '').trim();
    if (!sid) return null;
    const sessRow = await env.DB.prepare('SELECT id, method, logged_in_at FROM auth_sessions WHERE id = ?1 LIMIT 1')
      .bind(sid).first();
    if (!sessRow) return null;
    if (isExpiredSeatPreviewRow(sessRow)) return null;

    const email = String(session.email || '').trim().toLowerCase();
    const sub = String(session.sub || '').trim();
    if (!sub && !email) return null;

    const uRow = await env.DB.prepare(
      'SELECT * FROM users WHERE id = ?1 OR lower(email) = ?2 LIMIT 1'
    ).bind(sub, email).first();

    if (!uRow) {
      const anyUser = await env.DB.prepare('SELECT 1 AS ok FROM users LIMIT 1').first();
      if (anyUser) return null;
      return session;
    }

    const uStatus = String(uRow.status || 'Active').trim().toLowerCase();
    let uPayload = null;
    if (typeof uRow.payload_json === 'string' && uRow.payload_json.trim()) {
      try { uPayload = JSON.parse(uRow.payload_json); } catch (_) { uPayload = null; }
    } else if (uRow.payload_json && typeof uRow.payload_json === 'object') {
      uPayload = uRow.payload_json;
    }
    const pLocked = Boolean(uPayload && (Number(uPayload.locked || 0) === 1 || uPayload.locked === true || Number(uPayload.kioskLocked || 0) === 1 || uPayload.kioskLocked === true));
    if (uStatus === 'suspended' || uStatus === 'locked' || Number(uRow.locked || 0) === 1 || uRow.locked === true || Number(uRow.kioskLocked || 0) === 1 || uRow.kioskLocked === true || pLocked) return null;

    let roleTabPolicies = null;
    try {
      const rtpRow = await env.DB.prepare("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'role_tab_policies' LIMIT 1").first();
      if (rtpRow && rtpRow.payload_json) {
        const parsed = JSON.parse(rtpRow.payload_json);
        if (parsed && !Array.isArray(parsed) && typeof parsed === 'object' && Object.keys(parsed).length > 0) roleTabPolicies = parsed;
      }
      if (!roleTabPolicies) {
        const storeRow = await env.DB.prepare("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'mfg_web_store' LIMIT 1").first();
        if (storeRow && storeRow.payload_json) {
          const parsedStore = JSON.parse(storeRow.payload_json);
          if (parsedStore && parsedStore.roleTabPolicies && !Array.isArray(parsedStore.roleTabPolicies) && typeof parsedStore.roleTabPolicies === 'object' && Object.keys(parsedStore.roleTabPolicies).length > 0) {
            roleTabPolicies = parsedStore.roleTabPolicies;
          }
        }
      }
    } catch (_) {
      roleTabPolicies = null;
    }

    return Object.assign({}, session, {
      sub: uRow.id || session.sub,
      role: uRow.role != null ? uRow.role : session.role,
      companies: uRow.companies != null ? uRow.companies : session.companies,
      pbi: uRow.pbi_access != null ? uRow.pbi_access : session.pbi,
      stmts: uRow.statements_access != null ? uRow.statements_access : session.stmts,
      custom_perms: uRow.custom_perms != null ? uRow.custom_perms : (session.custom_perms || ''),
      ...(roleTabPolicies ? { roleTabPolicies } : {})
    });
  } catch (_) {
    return null;
  }
}

// ---- Build tickets --------------------------------------------------------------------------------------------------
// The build scripts (top-up reconcile, D1 seed export, Owner notices) read and patch the live store as the Owner.
// They signed their own session with a copy of ISABI_JWT_SECRET kept on each PC, naming a session row that must
// also exist in D1. On 2026-11-16 neither held: the THEO PC's copy was not the live secret and the fixed session id
// was gone, so every build fell back to writing D1 directly. A build ticket needs no copy of anything: the script,
// signed in to Cloudflare through Wrangler, writes the SHA-256 of a random 256-bit ticket into D1 `build_tickets`
// with a short expiry and sends the ticket itself in X-ISABI-Session.
//   * Only someone who can already write the database can make one (the same right the direct-D1 fallback uses).
//   * The database holds a hash, never a usable credential.
//   * A ticket is refused once its row expires, and whatever the row says once it is BUILD_TICKET_MAX_TTL_SEC old.
//   * It opens only the routes the builds call (BUILD_TICKET_ROUTES), never a browser request (no Origin header),
//     and acts as seat u1 exactly as D1 holds it today: suspended or no longer an Owner, and the ticket is void.
const BUILD_TICKET_RE = /^bt1_[A-Za-z0-9_-]{43}$/;
export const BUILD_TICKET_MAX_TTL_SEC = 900;
const BUILD_TICKET_ROUTES = Object.freeze({
  '/sync': Object.freeze(['POST']),
  '/users': Object.freeze(['GET']),
  '/cashflow_behind': Object.freeze(['GET', 'POST']),
  '/source_behind': Object.freeze(['GET', 'POST']),
  '/changed_entries': Object.freeze(['GET', 'POST']),
  '/day-close-push': Object.freeze(['POST'])
});

export function isBuildTicketRoute(subPath, method) {
  const allowed = Object.prototype.hasOwnProperty.call(BUILD_TICKET_ROUTES, String(subPath || ''))
    ? BUILD_TICKET_ROUTES[String(subPath)]
    : null;
  return Boolean(allowed && allowed.includes(String(method || '').toUpperCase()));
}

export async function redeemBuildTicket(request, env, subPath) {
  if (!request || !env || !env.DB) return null;
  if (!isBuildTicketRoute(subPath, request.method)) return null;
  if (request.headers.get('Origin') || request.headers.get('Cookie')) return null;
  const raw = String(request.headers.get('X-ISABI-Session') || '').trim();
  if (!BUILD_TICKET_RE.test(raw)) return null;
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', ENC.encode(raw)));
    let hash = '';
    for (let i = 0; i < digest.length; i++) hash += digest[i].toString(16).padStart(2, '0');
    const row = await env.DB.prepare('SELECT expires_at FROM build_tickets WHERE ticket_hash = ?1 LIMIT 1')
      .bind(hash).first();
    if (!row) return null;
    const expMs = Date.parse(String(row.expires_at || ''));
    const nowMs = Date.now();
    if (!Number.isFinite(expMs) || expMs <= nowMs || expMs - nowMs > BUILD_TICKET_MAX_TTL_SEC * 1000) return null;
    const uRow = await env.DB.prepare(
      "SELECT id, email, full_name, status, role, companies, pbi_access, statements_access, custom_perms FROM users WHERE id = 'u1' LIMIT 1"
    ).first();
    if (!uRow || String(uRow.status || 'Active') === 'Suspended') return null;
    if (!/\bowner\b/i.test(String(uRow.role || ''))) return null;
    return {
      sid: 'build-ticket',
      sub: String(uRow.id),
      email: String(uRow.email || '').trim().toLowerCase(),
      name: String(uRow.full_name || ''),
      role: uRow.role,
      companies: uRow.companies != null ? uRow.companies : 'All',
      pbi: uRow.pbi_access != null ? uRow.pbi_access : 'full',
      stmts: uRow.statements_access != null ? uRow.statements_access : 'full',
      custom_perms: uRow.custom_perms != null ? uRow.custom_perms : '',
      iss: 'isabi-edge-v1',
      build_ticket: true
    };
  } catch (_) {
    // No table yet (no build has run since this shipped), or D1 is down: no ticket, the caller answers 401.
    return null;
  }
}

const ROLE_WRITE_PRESETS = Object.freeze({
  'Full Access (Owner)': { modifyText: true, modifyData: true, voidData: true, enterDispatch: true, enterAccounting: true, enterMaster: true, enterPayrollJv: true },
  'Supervisor + Entry': { modifyText: true, modifyData: true, voidData: true, enterDispatch: true, enterAccounting: true, enterMaster: true, enterPayrollJv: true },
  'Supervisor': { modifyText: false, modifyData: false, voidData: true, enterDispatch: false, enterAccounting: false, enterMaster: false, enterPayrollJv: false },
  'Entry': { modifyText: true, modifyData: false, voidData: false, enterDispatch: true, enterAccounting: true, enterMaster: true, enterPayrollJv: false },
  'Sales': { modifyText: false, modifyData: false, voidData: false, enterDispatch: false, enterAccounting: true, enterMaster: false, enterPayrollJv: false },
  'Viewer': { modifyText: false, modifyData: false, voidData: false, enterDispatch: false, enterAccounting: false, enterMaster: false, enterPayrollJv: false },
  'Custom': { modifyText: true, modifyData: true, voidData: true, enterDispatch: true, enterAccounting: true, enterMaster: true, enterPayrollJv: false }
});

export function canEnterSite(permsOrSession) {
  const perms = (permsOrSession && typeof permsOrSession === 'object' && 'roleKey' in permsOrSession)
    ? permsOrSession
    : getSessionWritePerms(permsOrSession);
  if (!perms) return false;
  if (perms.roleKey === 'Full Access (Owner)' || perms.roleKey === 'Supervisor + Entry' || perms.roleKey === 'Entry' || perms.roleKey === 'Sales') {
    return true;
  }
  if (perms.roleKey === 'Custom') {
    return Boolean(perms.enterMaster || perms.enterPayrollJv);
  }
  return false;
}

/**
 * Mirrors js/app.js getEffectivePermissions write/GPS/void capabilities for server-side enforcement.
 */
export function getSessionWritePerms(session) {
  if (!session) {
    return { roleKey: 'None', modifyText: false, modifyData: false, voidData: false, enterDispatch: false, enterAccounting: false, enterMaster: false, enterPayrollJv: false, canEnterAny: false, canEnterSite: false, canWriteGeoConfig: false };
  }
  if (session.sub === 'u1' || session.sub === 'u2') {
    return Object.assign({ roleKey: 'Full Access (Owner)', canEnterAny: true, canEnterSite: true, canWriteGeoConfig: true }, ROLE_WRITE_PRESETS['Full Access (Owner)']);
  }
  const rawRole = String(session.role || '').trim();
  let roleKey = 'Viewer';
  if (/^Custom/i.test(rawRole)) roleKey = 'Custom';
  else if (/Owner|Full Access|Admin/i.test(rawRole)) roleKey = 'Full Access (Owner)';
  else if (/Supervisor\s*\+\s*Entry/i.test(rawRole)) roleKey = 'Supervisor + Entry';
  else if (/Supervisor/i.test(rawRole)) roleKey = 'Supervisor';
  else if (/Entry/i.test(rawRole)) roleKey = 'Entry';
  else if (/Sales/i.test(rawRole)) roleKey = 'Sales';
  else if (/Viewer|Read/i.test(rawRole)) roleKey = 'Viewer';
  const out = Object.assign({}, ROLE_WRITE_PRESETS[roleKey] || ROLE_WRITE_PRESETS.Viewer);
  let rawCustom = session.custom_perms;
  if (typeof rawCustom === 'string' && rawCustom.trim()) {
    try { rawCustom = JSON.parse(rawCustom); } catch (_) { rawCustom = null; }
  }
  const customRights = (rawCustom && typeof rawCustom === 'object' && !Array.isArray(rawCustom) && rawCustom.rights && typeof rawCustom.rights === 'object')
    ? rawCustom.rights
    : null;
  if (roleKey === 'Custom' && customRights && Object.keys(customRights).length > 0) {
    out.modifyText = Boolean(customRights.modify_text);
    out.modifyData = Boolean(customRights.modify_data);
    out.voidData = Boolean(customRights.void_data);
    out.enterDispatch = Boolean(customRights.enter_dispatch);
    out.enterAccounting = Boolean(customRights.enter_accounting);
    out.enterMaster = Boolean(customRights.enter_master);
    out.enterPayrollJv = Boolean(customRights.enter_payroll_jv);
  } else if (customRights && typeof customRights.modify_text === 'boolean') {
    out.modifyText = Boolean(customRights.modify_text);
  }
  if (out.modifyData) out.modifyText = true;
  out.roleKey = roleKey;
  out.canEnterAny = Boolean(out.enterDispatch || out.enterAccounting || out.enterMaster || out.enterPayrollJv);
  out.canEnterSite = canEnterSite(out);
  out.canWriteGeoConfig = Boolean(
    roleKey === 'Full Access (Owner)'
    || roleKey === 'Supervisor + Entry'
    || (roleKey === 'Custom' && out.modifyData && (out.enterMaster || out.enterPayrollJv))
  );
  return out;
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

export const DRIVER_GATE_TOKEN_RE = /^gt1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/;

export async function mintDriverGateToken(claims, env, ttlHours = 72) {
  let secret = '';
  try {
    secret = resolveEdgeJwtSecret(env);
  } catch (_) {
    secret = '';
  }
  if (!secret) {
    return { ok: false, status: 503, code: 'secret_missing', error: 'Gate token signing secret is not configured.' };
  }
  const ttl = Math.max(1, Math.min(168, Number(ttlHours) || 72));
  const nowSec = Math.floor(Date.now() / 1000);
  const rand = new Uint8Array(8);
  crypto.getRandomValues(rand);
  const jti = Array.from(rand).map(b => b.toString(16).padStart(2, '0')).join('');
  const indKey = canonGeoIndustryKey((claims && claims.industry) || 'manufacturing') || 'manufacturing';
  const payload = {
    typ: 'geo_gate_pin',
    jti,
    ind: indKey,
    co: String((claims && claims.company) || '').trim().slice(0, 80),
    sid: String((claims && claims.site_id) || '').trim().slice(0, 80),
    sn: String((claims && claims.site_name) || '').trim().slice(0, 160),
    sc: String((claims && claims.site_category) || '').trim().slice(0, 80),
    tt: String((claims && claims.target_type) || 'site').trim().slice(0, 32),
    dl: String((claims && claims.driver_label) || '').trim().slice(0, 80),
    mb: String((claims && claims.minted_by_email) || '').trim().slice(0, 120),
    mbi: String((claims && claims.minted_by_id) || '').trim().slice(0, 64),
    iat: nowSec,
    exp: nowSec + Math.round(ttl * 3600)
  };
  const payloadB64 = b64UrlEncode(ENC.encode(JSON.stringify(payload)));
  const signingInput = `gt1.${payloadB64}`;
  const key = await getHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, ENC.encode(signingInput));
  return {
    ok: true,
    token: `${signingInput}.${b64UrlEncode(sig)}`,
    claims: payload
  };
}

export async function verifyDriverGateToken(rawToken, env) {
  const token = String(rawToken || '').trim();
  const m = DRIVER_GATE_TOKEN_RE.exec(token);
  if (!m) {
    return { ok: false, status: 403, code: 'invalid_token', error: 'Invalid driver gate link token.' };
  }
  let secret = '';
  try {
    secret = resolveEdgeJwtSecret(env);
  } catch (_) {
    return { ok: false, status: 503, code: 'secret_missing', error: 'Gate token verification secret is not configured.' };
  }
  try {
    const signingInput = `gt1.${m[1]}`;
    const sigBytes = b64UrlDecode(m[2]);
    const key = await getHmacKey(secret);
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, ENC.encode(signingInput));
    if (!valid) {
      return { ok: false, status: 403, code: 'invalid_signature', error: 'Invalid or tampered driver gate link token.' };
    }
    const payload = JSON.parse(DEC.decode(b64UrlDecode(m[1])));
    if (!payload || payload.typ !== 'geo_gate_pin') {
      return { ok: false, status: 403, code: 'wrong_token_type', error: 'Unsupported gate token type.' };
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(payload.exp) || payload.exp <= nowSec) {
      return { ok: false, status: 403, code: 'expired_token', error: 'This driver gate link has expired. Ask dispatch for a fresh link.' };
    }
    if (!String(payload.co || '').trim() || (!String(payload.sn || '').trim() && !String(payload.sid || '').trim())) {
      return { ok: false, status: 403, code: 'incomplete_claims', error: 'Driver gate token is missing target site metadata.' };
    }
    return { ok: true, claims: payload };
  } catch (_) {
    return { ok: false, status: 403, code: 'invalid_token', error: 'Invalid driver gate link token.' };
  }
}

// ---- Unified Server-Side Seat Lens (1:1 mirror of isabi-app/js/app.js seatLens) -------------------------------------
const SEAT_ROLE_PRESETS = Object.freeze({
  'Full Access (Owner)': Object.freeze({ read_ops: true, read_fin: true, enter_dispatch: true, enter_accounting: true, enter_master: true, enter_payroll_jv: true, modify_text: true, modify_data: true, void_data: true, manage_users: true }),
  'Supervisor + Entry': Object.freeze({ read_ops: true, read_fin: true, enter_dispatch: true, enter_accounting: true, enter_master: true, enter_payroll_jv: true, modify_text: true, modify_data: true, void_data: true, manage_users: false }),
  'Supervisor': Object.freeze({ read_ops: true, read_fin: true, enter_dispatch: false, enter_accounting: false, enter_master: false, enter_payroll_jv: false, modify_text: false, modify_data: false, void_data: true, manage_users: false }),
  'Entry': Object.freeze({ read_ops: true, read_fin: false, enter_dispatch: true, enter_accounting: true, enter_master: true, enter_payroll_jv: false, modify_text: true, modify_data: false, void_data: false, manage_users: false }),
  'Sales': Object.freeze({ read_ops: true, read_fin: false, enter_dispatch: false, enter_accounting: true, enter_master: false, enter_payroll_jv: false, modify_text: false, modify_data: false, void_data: false, manage_users: false }),
  'Custom': Object.freeze({ read_ops: true, read_fin: false, enter_dispatch: true, enter_accounting: true, enter_master: true, enter_payroll_jv: false, modify_text: true, modify_data: true, void_data: true, manage_users: false }),
  'Viewer': Object.freeze({ read_ops: true, read_fin: false, enter_dispatch: false, enter_accounting: false, enter_master: false, enter_payroll_jv: false, modify_text: false, modify_data: false, void_data: false, manage_users: false })
});

const SEAT_DASH_IDS = ['dash_overview', 'dash_commercial', 'dash_plant_fleet', 'dash_expenses_vat', 'dash_payroll_hr', 'dash_financial_gl'];
const SEAT_RIGHT_IDS = ['read_ops', 'read_fin', 'enter_dispatch', 'enter_accounting', 'enter_master', 'enter_payroll_jv', 'modify_text', 'modify_data', 'void_data', 'manage_users'];
const SEAT_HUB_TABS = Object.freeze({
  cashflow: ['cashflow', 'external', 'ledger_treasury', 'conversions'],
  ledger: ['ledger', 'coa_classes', 'gl_automation'],
  expenses: ['expenses', 'suppliers', 'documents', 'recurring_expenses'],
  payroll: ['payroll', 'payroll_attendance', 'payroll_contracts', 'workforce_map', 'payroll_allowances'],
  sentinels: ['sentinels', 'alert_rules', 'approvals', 'void_log']
});

function resolveCanonicalSeatRoleKey(roleStr) {
  const r = String(roleStr || '').trim();
  if (/^Custom/i.test(r)) return 'Custom';
  if (/Owner|Full Access|Admin/i.test(r)) return 'Full Access (Owner)';
  if (/Supervisor\s*\+\s*Entry/i.test(r)) return 'Supervisor + Entry';
  if (/Supervisor/i.test(r)) return 'Supervisor';
  if (/Sales/i.test(r)) return 'Sales';
  if (/Entry/i.test(r)) return 'Entry';
  if (/Viewer|Read/i.test(r)) return 'Viewer';
  return 'Viewer';
}

function parseSeatCustomPerms(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return (p && typeof p === 'object' && !Array.isArray(p)) ? p : {};
    } catch (_) {
      return {};
    }
  }
  return (typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
}

function resolveSeatDashboards(pbiTier, roleKey, customDash) {
  if (pbiTier === 'custom' && customDash && typeof customDash === 'object' && !Array.isArray(customDash)) {
    const out = {};
    for (const id of SEAT_DASH_IDS) out[id] = Boolean(customDash[id]);
    return out;
  }
  if (pbiTier === 'none') {
    return { dash_overview: false, dash_commercial: false, dash_plant_fleet: false, dash_expenses_vat: false, dash_payroll_hr: false, dash_financial_gl: false };
  }
  if (pbiTier === 'full' || roleKey === 'Full Access (Owner)') {
    return { dash_overview: true, dash_commercial: true, dash_plant_fleet: true, dash_expenses_vat: true, dash_payroll_hr: true, dash_financial_gl: true };
  }
  if (roleKey === 'Sales') {
    return { dash_overview: true, dash_commercial: true, dash_plant_fleet: false, dash_expenses_vat: true, dash_payroll_hr: false, dash_financial_gl: false };
  }
  return { dash_overview: true, dash_commercial: true, dash_plant_fleet: true, dash_expenses_vat: true, dash_payroll_hr: true, dash_financial_gl: false };
}

export function getSessionSeatLens(session, roleTabPoliciesArg = null) {
  if (!session || String(session.status || '') === 'Suspended' || session.kioskLocked || session.locked) {
    return {
      owner: false,
      books: false,
      cashflow: false,
      ledger: false,
      expenses: false,
      profit: false,
      tax: false,
      partnerSplits: false,
      payroll: false,
      payrollDollars: false,
      sentinels: false,
      canSignOffSentinels: false,
      voidLog: false
    };
  }
  const roleStr = String(session.role || '');
  const roleKey = resolveCanonicalSeatRoleKey(roleStr);
  const presetRights = SEAT_ROLE_PRESETS[roleKey] || SEAT_ROLE_PRESETS.Viewer;
  const rawCustom = parseSeatCustomPerms(session.custom_perms);
  const isCustomRole = roleKey === 'Custom';
  const rawPbi = session.pbi_access != null ? session.pbi_access : session.pbi;
  const rawStmts = session.statements_access != null ? session.statements_access : session.stmts;
  const pbiTier = String(rawPbi || (isCustomRole ? 'custom' : 'partial')).toLowerCase();
  const stTier = String(rawStmts || (isCustomRole ? 'custom' : 'partial')).toLowerCase();
  const owner = /Owner/i.test(roleStr);

  const dashboards = (isCustomRole || pbiTier === 'custom') && rawCustom.dashboards && typeof rawCustom.dashboards === 'object'
    ? resolveSeatDashboards('custom', roleKey, rawCustom.dashboards)
    : resolveSeatDashboards(pbiTier, roleKey, null);

  const rights = {};
  const hasExplicitCustomRights = isCustomRole && rawCustom.rights && typeof rawCustom.rights === 'object' && !Array.isArray(rawCustom.rights) && Object.keys(rawCustom.rights).length > 0;
  for (const rId of SEAT_RIGHT_IDS) {
    if (hasExplicitCustomRights) {
      rights[rId] = rId === 'read_ops'
        ? (Object.prototype.hasOwnProperty.call(rawCustom.rights, 'read_ops') ? Boolean(rawCustom.rights.read_ops) : true)
        : Boolean(rawCustom.rights[rId]);
    } else if (isCustomRole && rawCustom.rights && Object.prototype.hasOwnProperty.call(rawCustom.rights, rId)) {
      rights[rId] = Boolean(rawCustom.rights[rId]);
    } else if (rId === 'modify_text' && rawCustom.rights && typeof rawCustom.rights.modify_text === 'boolean') {
      rights[rId] = Boolean(rawCustom.rights.modify_text);
    } else {
      rights[rId] = Boolean(presetRights[rId]);
    }
  }
  if (rights.modify_data) rights.modify_text = true;
  if (dashboards.dash_financial_gl) rights.read_fin = true;

  const customMode = /^Custom/i.test(roleStr) || pbiTier === 'custom' || stTier === 'custom';
  const isSales = /Sales/i.test(roleStr);
  const tax = !session.demoVisitor && (owner || Boolean(rights.read_fin));
  const voidLog = roleKey === 'Full Access (Owner)' || roleKey === 'Supervisor' || roleKey === 'Supervisor + Entry';

  const canAccessTbl = tbl => {
    const finOnly = tbl === 'jv_partnerships' || tbl === 'jv_distributions' || tbl === 'gl_accounts';
    const treasury = tbl === 'external_movements' || tbl === 'loans' || tbl === 'loan_settlements' || tbl === 'conversions';
    const payrollTbl = tbl === 'salaries';
    if (/^Custom/i.test(roleStr) || pbiTier === 'custom') {
      if (rawCustom.tables && typeof rawCustom.tables[tbl] === 'boolean' && rawCustom.tables[tbl] === false) return false;
      if (finOnly) return Boolean(rights.read_fin || dashboards.dash_financial_gl || rights.enter_payroll_jv || (tbl === 'gl_accounts' && rights.enter_master));
      if (treasury) return Boolean(rights.read_ops || rights.read_fin || dashboards.dash_financial_gl || dashboards.dash_expenses_vat || rights.enter_accounting || rights.enter_payroll_jv);
      if (payrollTbl) return Boolean(rights.read_ops || rights.read_fin || dashboards.dash_payroll_hr || rights.enter_payroll_jv || rights.enter_master);
      return Boolean(rights.read_ops || rights.read_fin);
    }
    if (pbiTier === 'full' || owner) return true;
    if (isSales) return false;
    return !finOnly;
  };

  const viewBaseline = view => {
    if (view === 'coa_classes' || view === 'gl_automation') return viewBaseline('ledger');
    if (view === 'suppliers' || view === 'ap') return customMode ? Boolean(rights.read_ops || dashboards.dash_plant_fleet || rights.enter_dispatch) : !isSales;
    if (view === 'recurring_expenses' || view === 'documents') return viewBaseline('expenses') || viewBaseline('sales');
    if (view === 'external') return viewBaseline('cashflow') && canAccessTbl('external_movements');
    if (view === 'ledger_treasury') return viewBaseline('cashflow') && (canAccessTbl('loans') || (customMode ? Boolean(dashboards.dash_financial_gl) : (pbiTier === 'full' || owner)));
    if (view === 'conversions') return viewBaseline('cashflow') && canAccessTbl('conversions');
    if (view === 'payroll_attendance' || view === 'payroll_contracts' || view === 'workforce_map' || view === 'payroll_allowances') return viewBaseline('payroll');
    if (view === 'alert_rules') return viewBaseline('sentinels');
    if (view === 'approvals') return true;
    if (view === 'void_log') return voidLog;
    if (customMode) {
      const anyDash = Object.values(dashboards).some(Boolean);
      if (view === 'cashflow') return Boolean(rights.read_ops || rights.read_fin || rights.enter_accounting || rights.enter_dispatch || dashboards.dash_financial_gl || dashboards.dash_expenses_vat);
      if (view === 'payroll') return Boolean(rights.read_ops || rights.read_fin || dashboards.dash_payroll_hr || rights.enter_payroll_jv || rights.enter_master);
      if (view === 'ledger' || view === 'gl' || view === 'sentinels') return Boolean(rights.read_fin || dashboards.dash_financial_gl);
      if (view === 'expenses') return Boolean(rights.read_ops || dashboards.dash_expenses_vat || rights.enter_accounting);
      if (view === 'sales') return Boolean(rights.read_ops || rights.read_fin || anyDash);
      return true;
    }
    if (view === 'cashflow' || view === 'expenses' || view === 'payroll') return !isSales;
    if (view === 'sentinels' || view === 'ledger' || view === 'gl') return (pbiTier === 'full' || owner) && !isSales;
    return true;
  };

  const hubBaseline = hubId => {
    if (hubId === 'sentinels') return viewBaseline('sentinels') || voidLog;
    if (hubId === 'expenses') return viewBaseline('expenses') || viewBaseline('suppliers');
    const tabs = SEAT_HUB_TABS[hubId] || [hubId];
    return tabs.some(t => viewBaseline(t));
  };

  const rpMap = (roleTabPoliciesArg && typeof roleTabPoliciesArg === 'object')
    ? roleTabPoliciesArg
    : ((session && session.roleTabPolicies && typeof session.roleTabPolicies === 'object') ? session.roleTabPolicies : null);
  const rolePol = (rpMap && rpMap.customized && (rpMap.hubs || rpMap.pages))
    ? rpMap
    : (rpMap && rpMap[roleKey] && rpMap[roleKey].customized && (rpMap[roleKey].hubs || rpMap[roleKey].pages) ? rpMap[roleKey] : null);

  const hp = (rawCustom && rawCustom.hubPagesCustomized && (rawCustom.hubs || rawCustom.pages))
    ? {
        customized: true,
        selectAll: Boolean(rawCustom.hubPagesSelectAll),
        hubs: (rawCustom.hubs && typeof rawCustom.hubs === 'object') ? rawCustom.hubs : {},
        pages: (rawCustom.pages && typeof rawCustom.pages === 'object') ? rawCustom.pages : {}
      }
    : (rolePol
        ? {
            customized: true,
            selectAll: Boolean(rolePol.selectAll),
            hubs: (rolePol.hubs && typeof rolePol.hubs === 'object') ? rolePol.hubs : {},
            pages: (rolePol.pages && typeof rolePol.pages === 'object') ? rolePol.pages : {}
          }
        : null);

  const isHubPolicyEnabled = hubId => {
    if (!hp || !hp.customized) return hubBaseline(hubId);
    if (hp.selectAll) return true;
    if (Object.prototype.hasOwnProperty.call(hp.hubs, hubId)) return Boolean(hp.hubs[hubId]);
    return hubBaseline(hubId);
  };

  const isPagePolicyEnabled = (canonView, parentHubId) => {
    if (canonView === 'void_log' && !voidLog) return false;
    if (!hp || !hp.customized) return viewBaseline(canonView);
    if (!isHubPolicyEnabled(parentHubId)) return false;
    if (hp.selectAll) return true;
    if (Object.prototype.hasOwnProperty.call(hp.pages, canonView)) return Boolean(hp.pages[canonView]);
    const tabs = SEAT_HUB_TABS[parentHubId] || [];
    const anyExplicitSibling = tabs.some(t => Object.prototype.hasOwnProperty.call(hp.pages, t));
    if (anyExplicitSibling) {
      if (canonView === 'void_log' && voidLog) return tabs.some(t => t !== 'void_log' && Boolean(hp.pages[t]));
      return false;
    }
    if (Object.prototype.hasOwnProperty.call(hp.hubs, parentHubId) && hp.hubs[parentHubId]) return true;
    return viewBaseline(canonView);
  };

  const canViewFn = view => {
    if (hp && hp.customized) {
      const parentMap = {
        cashflow: 'cashflow', external: 'cashflow', ledger_treasury: 'cashflow', conversions: 'cashflow',
        ledger: 'ledger', coa_classes: 'ledger', gl_automation: 'ledger',
        expenses: 'expenses', suppliers: 'expenses', documents: 'expenses', recurring_expenses: 'expenses',
        payroll: 'payroll', payroll_attendance: 'payroll', payroll_contracts: 'payroll', workforce_map: 'payroll', payroll_allowances: 'payroll',
        sentinels: 'sentinels', alert_rules: 'sentinels', approvals: 'sentinels', void_log: 'sentinels'
      };
      const parent = parentMap[view];
      if (parent) {
        if (view === 'approvals') return Object.prototype.hasOwnProperty.call(hp.pages, 'approvals') ? Boolean(hp.pages.approvals) : true;
        return isPagePolicyEnabled(view, parent);
      }
    }
    return viewBaseline(view);
  };

  const canHubFn = hubId => {
    if (hp && hp.customized) {
      if (!isHubPolicyEnabled(hubId)) return false;
      const tabs = SEAT_HUB_TABS[hubId] || [];
      if (!tabs.length) return true;
      return tabs.some(v => (hubId !== 'sentinels' || v !== 'approvals') && isPagePolicyEnabled(v, hubId));
    }
    return hubBaseline(hubId);
  };

  const cashflow = Boolean(owner || canHubFn('cashflow'));
  const ledger = Boolean(owner || canHubFn('ledger'));
  const books = Boolean(cashflow && ledger);
  const expenses = Boolean(owner || canHubFn('expenses'));
  const profit = Boolean(books && expenses);
  const partnerSplits = Boolean(canAccessTbl('jv_distributions'));
  const payroll = Boolean(owner || canHubFn('payroll'));
  let payrollDollars = true;
  if (!owner) {
    if (isSales || !canAccessTbl('salaries') || (!canViewFn('payroll') && !canViewFn('payroll_attendance'))) {
      payrollDollars = false;
    } else if (/^Custom/i.test(roleStr) || pbiTier === 'custom') {
      payrollDollars = Boolean(rights.read_fin || rights.enter_payroll_jv || dashboards.dash_payroll_hr);
    }
  }
  const sentinels = Boolean(owner || canViewFn('sentinels'));
  const canSignOffSentinels = Boolean(
    sentinels &&
    (roleKey === 'Full Access (Owner)' || roleKey === 'Supervisor' || roleKey === 'Supervisor + Entry' || (roleKey === 'Custom' && (/director|cfo|audit/i.test(roleStr) || pbiTier === 'full')))
  );

  return {
    owner,
    books,
    cashflow,
    ledger,
    expenses,
    profit,
    tax,
    partnerSplits,
    payroll,
    payrollDollars,
    sentinels,
    canSignOffSentinels,
    voidLog
  };
}
