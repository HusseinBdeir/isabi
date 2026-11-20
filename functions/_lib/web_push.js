/**
 * ISABI Systems — Close-of-Day Needs Attention Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID ES256)
 * Zero external packages: uses WebCrypto + Cloudflare Workers fetch + D1 edge_kv_store.
 */

import {
  canAccessCompany,
  checkD1RateLimit,
  isOwnerOrFullGroupSession,
  isSameOriginBrowserRequest,
  jsonResponse,
  parseAllowedCompanies
} from './security.js';
import { readEdgeKvDoc, writeEdgeKvDoc } from './d1_store.js';

export const VAPID_KV_KEY = 'vapid_keypair_v1';
export const PUSH_SUBS_KV_KEY = 'day_close_push_subs_v1';

const MAX_SUBS_PER_USER = 5;
const MAX_SUBS_TOTAL = 200;
const BEIRUT_TZ = 'Asia/Beirut';
const UTF8_ENC = new TextEncoder();

const PUSH_ENDPOINT_HOST_SUFFIXES = Object.freeze([
  '.push.services.mozilla.com',
  'updates.push.services.mozilla.com',
  'fcm.googleapis.com',
  '.push.apple.com',
  'web.push.apple.com',
  '.notify.windows.com',
  'notify.windows.com'
]);

function b64UrlEncode(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64UrlDecode(str) {
  const raw = String(str || '').trim();
  if (!raw || raw.length % 4 === 1 || !/^[A-Za-z0-9_-]+={0,2}$/.test(raw)) {
    return new Uint8Array(0);
  }
  const clean = raw.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/g, '');
  if (!clean || clean.length % 4 === 1) return new Uint8Array(0);
  const pad = clean.length % 4 ? '='.repeat(4 - (clean.length % 4)) : '';
  try {
    const bin = atob(clean + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch (_) {
    return new Uint8Array(0);
  }
}

function concatBytes(...parts) {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function isHostAllowlisted(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!h || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':')) return false;
  return PUSH_ENDPOINT_HOST_SUFFIXES.some(sfx => (
    sfx.startsWith('.') ? (h.endsWith(sfx) && h.length > sfx.length) : h === sfx
  ));
}

export function validatePushEndpoint(rawUrl) {
  const s = String(rawUrl || '').trim();
  if (!s || s.length > 2048) return { ok: false, error: 'Invalid push endpoint length.' };
  let parsed;
  try {
    parsed = new URL(s);
  } catch (_) {
    return { ok: false, error: 'Malformed push endpoint URL.' };
  }
  if (parsed.protocol !== 'https:') return { ok: false, error: 'Push endpoint must use HTTPS.' };
  if (parsed.username || parsed.password) return { ok: false, error: 'Credentials are not permitted in push endpoint.' };
  if (parsed.port) return { ok: false, error: 'Custom ports are not permitted in push endpoint.' };
  if (!isHostAllowlisted(parsed.hostname)) {
    return { ok: false, error: 'Push endpoint host is outside the approved browser push services allowlist.' };
  }
  return { ok: true, url: parsed.toString(), origin: parsed.origin };
}

function getBeirutClockParts(now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: BEIRUT_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(now);
    const get = t => (parts.find(p => p.type === t) || {}).value || '';
    const date = `${get('year')}-${get('month')}-${get('day')}`;
    const hour = Number(get('hour') || 0) % 24;
    const minute = Number(get('minute') || 0);
    return { date, hour, minute };
  } catch (_) {
    const iso = now.toISOString();
    return { date: iso.slice(0, 10), hour: (now.getUTCHours() + 2) % 24, minute: now.getUTCMinutes() };
  }
}

async function readEnvVapidKeypair(env) {
  const pubRaw = String((env && env.VAPID_PUBLIC_KEY) || '').trim();
  const privRaw = String((env && env.VAPID_PRIVATE_KEY) || '').trim();
  const subRaw = String((env && env.VAPID_SUBJECT) || '').trim();
  if (!pubRaw || !privRaw || !subRaw || !/^(?:mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/i.test(subRaw)) return null;
  const pubBytes = b64UrlDecode(pubRaw);
  const privBytes = b64UrlDecode(privRaw);
  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04 || privBytes.length !== 32) return null;
  try {
    const x = b64UrlEncode(pubBytes.slice(1, 33));
    const y = b64UrlEncode(pubBytes.slice(33, 65));
    const d = b64UrlEncode(privBytes);
    const privateJwk = { kty: 'EC', crv: 'P-256', x, y, d, ext: true };
    const publicJwk = { kty: 'EC', crv: 'P-256', x, y, ext: true };
    const privKey = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const pubKey = await crypto.subtle.importKey('jwk', publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const probe = UTF8_ENC.encode('isabi-vapid-env-check');
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privKey, probe);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pubKey, sig, probe);
    if (!ok) return null;
    return { publicKeyB64Url: b64UrlEncode(pubBytes), privateJwk, publicJwk, subject: subRaw, createdAt: 'env' };
  } catch (_) {
    return null;
  }
}

function hasAnyEnvVapidSetting(env) {
  if (!env || typeof env !== 'object') return false;
  return Boolean(
    String(env.VAPID_PUBLIC_KEY || '').trim() ||
    String(env.VAPID_PRIVATE_KEY || '').trim() ||
    String(env.VAPID_SUBJECT || '').trim()
  );
}

async function ensureVapidKeypair(db, env) {
  if (hasAnyEnvVapidSetting(env)) {
    return await readEnvVapidKeypair(env);
  }
  const existingRow = await readEdgeKvDoc(db, VAPID_KV_KEY);
  if (existingRow && existingRow.payload_json) {
    try {
      const parsed = JSON.parse(existingRow.payload_json);
      if (parsed && parsed.publicKeyB64Url && parsed.privateJwk && parsed.privateJwk.d) {
        return parsed;
      }
    } catch (_) {}
  }
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const rawPub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const privateJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const publicJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const rec = {
    publicKeyB64Url: b64UrlEncode(rawPub),
    privateJwk,
    publicJwk,
    createdAt: new Date().toISOString()
  };
  await writeEdgeKvDoc(
    db,
    VAPID_KV_KEY,
    JSON.stringify(rec),
    rec.createdAt,
    'system:vapid',
    { exists: Boolean(existingRow), updatedAt: existingRow ? existingRow.updated_at : '' }
  );
  // Re-read in case another request won a race cleanly
  const reread = await readEdgeKvDoc(db, VAPID_KV_KEY);
  if (reread && reread.payload_json) {
    try {
      const parsed = JSON.parse(reread.payload_json);
      if (parsed && parsed.publicKeyB64Url && parsed.privateJwk) return parsed;
    } catch (_) {}
  }
  return rec;
}

async function buildVapidAuthHeader(endpointOrigin, vapid) {
  const header = b64UrlEncode(UTF8_ENC.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const exp = Math.floor(Date.now() / 1000) + 43200;
  const payload = b64UrlEncode(UTF8_ENC.encode(JSON.stringify({
    aud: endpointOrigin,
    exp,
    sub: (vapid && vapid.subject) || 'mailto:ops@isabisystems.com'
  })));
  const signingInput = UTF8_ENC.encode(`${header}.${payload}`);
  const privKey = await crypto.subtle.importKey(
    'jwk',
    vapid.privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privKey, signingInput));
  const jwt = `${header}.${payload}.${b64UrlEncode(sig)}`;
  return `vapid t=${jwt}, k=${vapid.publicKeyB64Url}`;
}

async function hmacSha256(keyBytes, dataBytes) {
  const k = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, dataBytes));
}

export async function encryptWebPushPayload(subscription, payloadStr) {
  const uaPubBytes = b64UrlDecode(subscription && subscription.keys && subscription.keys.p256dh);
  const authBytes = b64UrlDecode(subscription && subscription.keys && subscription.keys.auth);
  if (uaPubBytes.length !== 65 || uaPubBytes[0] !== 0x04) {
    throw new Error('Invalid subscription p256dh key.');
  }
  if (authBytes.length !== 16) {
    throw new Error('Invalid subscription auth secret.');
  }

  const uaPubKey = await crypto.subtle.importKey(
    'raw',
    uaPubBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const asKp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPubBytes = new Uint8Array(await crypto.subtle.exportKey('raw', asKp.publicKey));
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPubKey }, asKp.privateKey, 256));

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prkKey = await hmacSha256(authBytes, ecdhSecret);
  const ikmInfo = concatBytes(UTF8_ENC.encode('WebPush: info\0'), uaPubBytes, asPubBytes);
  const ikm = await hmacSha256(prkKey, concatBytes(ikmInfo, new Uint8Array([1])));

  const prk = await hmacSha256(salt, ikm);
  const cek = (await hmacSha256(prk, concatBytes(UTF8_ENC.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmacSha256(prk, concatBytes(UTF8_ENC.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  const plaintext = UTF8_ENC.encode(String(payloadStr || '{}'));
  const padded = concatBytes(plaintext, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded);
  const cipher = new Uint8Array(cipherBuf);

  const rsBuf = new Uint8Array(4);
  new DataView(rsBuf.buffer).setUint32(0, 4096, false);
  const header = concatBytes(salt, rsBuf, new Uint8Array([asPubBytes.length]), asPubBytes);
  return concatBytes(header, cipher);
}

async function sendEncryptedPush(sub, payloadObj, vapid) {
  const chk = validatePushEndpoint(sub && sub.endpoint);
  if (!chk.ok) return { ok: false, status: 400, expired: false, error: chk.error };
  const bodyBytes = await encryptWebPushPayload(sub, JSON.stringify(payloadObj));
  const authHdr = await buildVapidAuthHeader(chk.origin, vapid);
  const reqInit = {
    method: 'POST',
    redirect: 'error',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
      'Urgency': 'normal',
      'Authorization': authHdr
    },
    body: bodyBytes
  };
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    reqInit.signal = AbortSignal.timeout(8000);
  }
  const resp = await fetch(chk.url, reqInit);
  const expired = resp.status === 404 || resp.status === 410;
  return { ok: resp.ok || resp.status === 201, status: resp.status, expired };
}

function readSubsStoreObj(rawRow) {
  let obj = { version: 1, byUser: {} };
  if (rawRow && rawRow.payload_json) {
    try {
      const p = JSON.parse(rawRow.payload_json);
      if (p && typeof p === 'object' && p.byUser && typeof p.byUser === 'object') {
        obj = p;
      }
    } catch (_) {}
  }
  return obj;
}

async function mutateSubsStoreCas(db, updatedBy, mutator) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const subsRow = await readEdgeKvDoc(db, PUSH_SUBS_KV_KEY);
    const store = readSubsStoreObj(subsRow);
    const nowIso = new Date().toISOString();
    const res = await mutator(store, nowIso);
    if (res && res.abort) {
      return { ok: false, aborted: true, response: res.response, store };
    }
    if (res && res.skipWrite) {
      return { ok: true, store, payload: res.payload };
    }
    const wr = await writeEdgeKvDoc(
      db,
      PUSH_SUBS_KV_KEY,
      JSON.stringify(store),
      nowIso,
      updatedBy,
      { exists: Boolean(subsRow), updatedAt: subsRow ? subsRow.updated_at : '' }
    );
    if (wr && wr.ok) {
      return { ok: true, store, payload: res && res.payload };
    }
    if (!wr || !wr.conflict) {
      return { ok: false, aborted: true, response: jsonResponse({ ok: false, error: 'Failed to save push configuration.' }, 500) };
    }
  }
  return { ok: false, aborted: true, response: jsonResponse({ ok: false, error: 'Push store update conflict; please retry.' }, 409) };
}

function userSeatCanViewBooks(userRow) {
  if (!userRow) return false;
  const uid = String(userRow.id || userRow.sub || '').trim().toLowerCase();
  if (uid === 'u1' || uid === 'u2') return true;
  const role = String(userRow.role || '').trim();
  if (/owner/i.test(role)) return true;
  const pbi = String(userRow.pbi_access || 'partial').trim().toLowerCase();
  const stmts = String(userRow.statements_access || 'partial').trim().toLowerCase();
  if (/^custom/i.test(role) || pbi === 'custom' || stmts === 'custom') {
    let cp = {};
    try { cp = typeof userRow.custom_perms === 'string' ? JSON.parse(userRow.custom_perms || '{}') : (userRow.custom_perms || {}); } catch (_) { cp = {}; }
    if (!cp || typeof cp !== 'object') cp = {};
    const rights = (cp.rights && typeof cp.rights === 'object') ? cp.rights : {};
    const dashes = (cp.dashboards && typeof cp.dashboards === 'object') ? cp.dashboards : {};
    const baseCash = Boolean(rights.read_ops || rights.read_fin || rights.enter_accounting || rights.enter_dispatch || dashes.dash_financial_gl || dashes.dash_expenses_vat);
    const baseLedger = Boolean(rights.read_fin || dashes.dash_financial_gl);
    const hp = (cp.hub_policy && typeof cp.hub_policy === 'object') ? cp.hub_policy : null;
    if (hp && hp.customized) {
      if (hp.selectAll) return true;
      const hMap = (hp.hubs && typeof hp.hubs === 'object') ? hp.hubs : {};
      const canCash = Object.prototype.hasOwnProperty.call(hMap, 'cashflow') ? Boolean(hMap.cashflow) : baseCash;
      const canLedger = Object.prototype.hasOwnProperty.call(hMap, 'ledger') ? Boolean(hMap.ledger) : baseLedger;
      return canCash && canLedger;
    }
    if (cp.hubs && typeof cp.hubs === 'object' && (Object.prototype.hasOwnProperty.call(cp.hubs, 'cashflow') || Object.prototype.hasOwnProperty.call(cp.hubs, 'ledger'))) {
      return Boolean(cp.hubs.cashflow && cp.hubs.ledger);
    }
    return baseCash && baseLedger;
  }
  return pbi === 'full' && !/Sales/i.test(role);
}

function userSeatCanViewExpenses(userRow) {
  if (!userRow) return false;
  const uid = String(userRow.id || userRow.sub || '').trim().toLowerCase();
  if (uid === 'u1' || uid === 'u2') return true;
  const role = String(userRow.role || '').trim();
  if (/owner/i.test(role)) return true;
  const pbi = String(userRow.pbi_access || 'partial').trim().toLowerCase();
  const stmts = String(userRow.statements_access || 'partial').trim().toLowerCase();
  if (/^custom/i.test(role) || pbi === 'custom' || stmts === 'custom') {
    let cp = {};
    try { cp = typeof userRow.custom_perms === 'string' ? JSON.parse(userRow.custom_perms || '{}') : (userRow.custom_perms || {}); } catch (_) { cp = {}; }
    if (!cp || typeof cp !== 'object') cp = {};
    const rights = (cp.rights && typeof cp.rights === 'object') ? cp.rights : {};
    const dashes = (cp.dashboards && typeof cp.dashboards === 'object') ? cp.dashboards : {};
    const baseExp = Boolean(rights.read_ops || rights.read_fin || rights.enter_accounting || dashes.dash_expenses_vat || dashes.dash_financial_gl);
    const hp = (cp.hub_policy && typeof cp.hub_policy === 'object') ? cp.hub_policy : null;
    if (hp && hp.customized) {
      if (hp.selectAll) return true;
      const hMap = (hp.hubs && typeof hp.hubs === 'object') ? hp.hubs : {};
      return Object.prototype.hasOwnProperty.call(hMap, 'expenses') ? Boolean(hMap.expenses) : baseExp;
    }
    if (cp.hubs && typeof cp.hubs === 'object' && Object.prototype.hasOwnProperty.call(cp.hubs, 'expenses')) {
      return Boolean(cp.hubs.expenses);
    }
    return baseExp;
  }
  return true;
}

const PUSH_SCOPE_COMPANY_MAP = Object.freeze({
  wtc: 'WTC',
  bbconstruction: 'BBConstruction',
  lionstransport: 'Lions Transport',
  bdeirholding: 'Bdeir Holding',
  blanca: 'Blanca',
  launa: 'La Una',
  palms: 'Palms',
  voile: 'Voile',
  platinum: 'Platinum',
  korriauto: 'Korri Auto',
  shacman: 'Shacman',
  '4235company': '4235 Company S.A.L',
  properties: 'Properties',
  insurance: 'Insurance Company'
});

const PUSH_INDUSTRY_COMPANIES = Object.freeze({
  'manufacturing-group': ['WTC', 'BBConstruction', 'Lions Transport'],
  'industry:Holding & Treasury': ['Bdeir Holding'],
  'industry:Hospitality & Resorts': ['Blanca', 'La Una', 'Palms', 'Voile', 'Platinum'],
  'industry:Automotive & Heavy Trading': ['Korri Auto', 'Shacman'],
  'industry:Real Estate & Property': ['4235 Company S.A.L', 'Properties'],
  'industry:Insurance & Brokerage': ['Insurance Company']
});

const PUSH_SCOPE_INDUSTRY = Object.freeze({
  wtc: 'Manufacturing',
  bbconstruction: 'Manufacturing',
  lionstransport: 'Manufacturing',
  'manufacturing-group': 'Manufacturing',
  bdeirholding: 'Holding & Treasury',
  'industry:Holding & Treasury': 'Holding & Treasury',
  blanca: 'Hospitality & Resorts',
  launa: 'Hospitality & Resorts',
  palms: 'Hospitality & Resorts',
  voile: 'Hospitality & Resorts',
  platinum: 'Hospitality & Resorts',
  'industry:Hospitality & Resorts': 'Hospitality & Resorts',
  korriauto: 'Automotive & Heavy Trading',
  shacman: 'Automotive & Heavy Trading',
  'industry:Automotive & Heavy Trading': 'Automotive & Heavy Trading',
  '4235company': 'Real Estate & Property',
  properties: 'Real Estate & Property',
  'industry:Real Estate & Property': 'Real Estate & Property',
  insurance: 'Insurance & Brokerage',
  'industry:Insurance & Brokerage': 'Insurance & Brokerage'
});

function authorizeScopeKey(session, rawScopeKey) {
  const sk = String(rawScopeKey || '').trim();
  const fullGroup = isOwnerOrFullGroupSession(session);
  if (!sk) {
    if (!fullGroup) {
      return { ok: false, status: 403, error: 'Row-level security: group scope requires full-group access.' };
    }
    return { ok: true, scopeKey: '', companies: null, industry: 'Manufacturing' };
  }
  if (Object.prototype.hasOwnProperty.call(PUSH_INDUSTRY_COMPANIES, sk)) {
    const cos = PUSH_INDUSTRY_COMPANIES[sk];
    if (!fullGroup && !cos.every(c => canAccessCompany(session, c))) {
      return { ok: false, status: 403, error: 'Row-level security: unauthorized scopeKey.' };
    }
    return { ok: true, scopeKey: sk, companies: cos, industry: PUSH_SCOPE_INDUSTRY[sk] || 'Manufacturing' };
  }
  if (Object.prototype.hasOwnProperty.call(PUSH_SCOPE_COMPANY_MAP, sk)) {
    const co = PUSH_SCOPE_COMPANY_MAP[sk];
    if (!fullGroup && !canAccessCompany(session, co)) {
      return { ok: false, status: 403, error: 'Row-level security: unauthorized scopeKey.' };
    }
    return { ok: true, scopeKey: sk, companies: [co], industry: PUSH_SCOPE_INDUSTRY[sk] || 'Manufacturing' };
  }
  return { ok: false, status: 400, error: 'Invalid push scopeKey.' };
}

function sanitizeCloseHour(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 15 && n <= 22 ? n : 18;
}

function sanitizePhone(v) {
  return String(v || '').replace(/[^\d+()\-\s]/g, '').trim().slice(0, 32);
}

function sanitizeLang(v) {
  const l = String(v || 'en').toLowerCase();
  return (l === 'ar' || l === 'fr') ? l : 'en';
}

function safePayloadJson(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return {};
  try { return JSON.parse(raw) || {}; } catch (_) { return {}; }
}

function mfgTicketSign(r) {
  if (!r || Number(r.voided || 0)) return 0;
  const pl = safePayloadJson(r.payload_json);
  const m = String(r.method || pl.method || '').trim();
  if (m === 'C Return' || m === 'CR Return' || m === 'Cash Return' || m === 'Credit Return') return -1;
  if (m === 'Free' || m === 'Remove' || m === 'Config' || m === 'VATConfig') return 0;
  if ((r.return_to_wtc === true || pl.return_to_wtc === true) && (r.in_place_return === true || pl.in_place_return === true)) return 0;
  return 1;
}

function isCashSaleTicket(r, pl) {
  const m = String((r && r.method) || (pl && pl.method) || '').trim();
  return m === 'Cash' || m === 'C Return' || m === 'Cash Return';
}

function mfgExpenseKind(r, pl) {
  const m = String((r && r.method) || (pl && pl.method) || '').trim();
  if (m === 'Config' || m === 'VATConfig' || m === 'Free' || m === 'Remove' || m === 'Adjusted' || m === 'JV Adjusted') return 'Excluded';
  if (m === 'C Return' || m === 'CR Return') return 'Return';
  if (m === 'IVA' || m === 'VAT' || m === 'VAT Dis' || m === 'Cash VAT Dis') return 'VAT';
  return 'Expense';
}

function mfgExpenseSign(r, pl) {
  const k = mfgExpenseKind(r, pl);
  if (k === 'Return') return -1;
  if (k === 'Excluded') return 0;
  return 1;
}

function isPendingPriceExp(r, pl) {
  return Boolean(r && !Number(r.voided || 0) && !(pl && pl.voided) && (r.price_pending || (pl && pl.price_pending)));
}

function isCashExpense(r, pl) {
  const m = String((r && r.method) || (pl && pl.method) || '').trim();
  return m === 'Cash' || m === 'C Return' || m === 'Cash VAT Dis';
}

function mfgReceiptKind(r, pl) {
  const m = String((r && r.method) || (pl && pl.method) || '').trim();
  if (m === 'JV Adjusted' || m === 'Remove' || m === 'Adjusted' || m === 'Free' || m === 'Config') return 'Excluded';
  if (m === 'Credit Return' || m === 'Credit Discount' || m === 'Cash Return' || m === 'Cash Discount') return 'Credit note';
  if (m === 'VAT' || m === 'VATConfig' || m === 'VAT Dis' || m === 'Cash VAT Dis') return 'VAT received';
  if (m === 'IVA') return 'Customer invoice';
  if (m === 'RentConfig' || m === 'Rent' || m === 'VATRent') return 'Rent & Barter';
  return 'Settlement';
}

function mfgSettlementKind(s, pl) {
  const m = String((s && s.method) || (pl && pl.method) || '').trim();
  if (m === 'JV Adjusted' || m === 'Remove' || m === 'Adjusted' || m === 'Free' || m === 'Config') return 'Excluded';
  if (m === 'Credit Return' || m === 'Credit Discount' || m === 'Cash Return' || m === 'Cash Discount') return 'Credit note';
  if (m === 'VAT' || m === 'VATConfig' || m === 'VAT Dis' || m === 'Cash VAT Dis') return 'VAT paid';
  if (m === 'IVA') return 'Invoice paid';
  if (m === 'Commission') return 'Commission paid';
  if (m === 'RentConfig' || m === 'Rent' || m === 'VATRent') return 'Rent & Barter';
  return 'Payment';
}

function isAppRec(r, pl) {
  const src = String((r && r.source) || (pl && pl.source) || '').trim();
  return Boolean(r && (src === 'app' || /^[a-z]{2}-[0-9a-z]+-[0-9a-z]{6}$/.test(String(r.id || ''))));
}

const CANON_CO_ALIASES = Object.freeze({
  wtc: 'WTC',
  'wtc (world trading & construction)': 'WTC',
  bbconstruction: 'BBConstruction',
  'bb construction': 'BBConstruction',
  bbc: 'BBConstruction',
  'lions transport': 'Lions Transport',
  lionstransport: 'Lions Transport',
  'bdeir holding': 'Bdeir Holding',
  bdeirholding: 'Bdeir Holding',
  blanca: 'Blanca',
  'la una': 'La Una',
  launa: 'La Una',
  palms: 'Palms',
  voile: 'Voile',
  platinum: 'Platinum',
  'korri auto': 'Korri Auto',
  korriauto: 'Korri Auto',
  shacman: 'Shacman',
  '4235 company s.a.l': '4235 Company S.A.L',
  '4235 company': '4235 Company S.A.L',
  '4235company': '4235 Company S.A.L',
  properties: 'Properties',
  'insurance company': 'Insurance Company',
  insurance: 'Insurance Company'
});

function resolveSisterEntityName(raw) {
  const clean = String(raw || '').trim();
  if (!clean) return '';
  const low = clean.toLowerCase().replace(/\s+/g, ' ');
  if (CANON_CO_ALIASES[low]) return CANON_CO_ALIASES[low];
  if (low.includes('4235')) return '4235 Company S.A.L';
  if (low.includes('bdeir holding') || low === 'holding') return 'Bdeir Holding';
  if (low.includes('lions transport')) return 'Lions Transport';
  if (low.includes('bbconstruction') || low.includes('bb construction')) return 'BBConstruction';
  if (low.includes('korri')) return 'Korri Auto';
  if (low.includes('shacman')) return 'Shacman';
  if (low.includes('insurance')) return 'Insurance Company';
  if (low.includes('properties') || low.includes('buzwair')) return 'Properties';
  return '';
}

function mfgTicketCommission(s, pl, commRules, tonFactors) {
  if (!s || Number(s.voided || 0) || mfgTicketSign(s) !== 1) return 0;
  const mth = String(s.method || pl.method || 'Credit').trim();
  if (mth === 'Discount' || mth === 'Cash Discount' || mth === 'Credit Discount' || mth === 'JV Adjusted' || mth === 'Adjusted') return 0;
  const qty = Number(s.qty != null ? s.qty : (pl.qty || 0));
  if (!(qty > 0)) return 0;
  const prodKey = String(s.product || pl.product || '').trim().toLowerCase();
  const coKey = String(s.company || '').trim().toLowerCase();
  const arr = commRules.get(`${coKey}|${prodKey}`);
  if (!arr || !arr.length) return 0;
  const d = String(s.date || '').slice(0, 10);
  let bestRule = null;
  let bestStart = '';
  let bestRate = -1;
  for (const r of arr) {
    const sd = r.start_date ? String(r.start_date).slice(0, 10) : '';
    const ed = r.end_date ? String(r.end_date).slice(0, 10) : '';
    if ((!sd || sd <= d) && (!ed || ed >= d)) {
      const v = Number(r.unit_price != null ? r.unit_price : (r.price || 0));
      if (!bestRule || sd > bestStart || (sd === bestStart && v > bestRate)) {
        bestRule = r;
        bestStart = sd;
        bestRate = v;
      }
    }
  }
  if (!bestRule || !(bestRate > 0)) return 0;
  const su = String(s.uom || pl.uom || '').trim().toLowerCase();
  const ru = String(bestRule.unit || '').trim().toLowerCase();
  let effQty = qty;
  if (ru && su && ru !== su) {
    const tf = Number(tonFactors.get(prodKey) || 1.5) || 1.5;
    const isTicketM3 = su === 'm3' || su === 'm³';
    const isRuleM3 = ru === 'm3' || ru === 'm³';
    const isTicketTon = su === 'ton' || su === 'tons' || su === 't';
    const isRuleTon = ru === 'ton' || ru === 'tons' || ru === 't';
    if (isTicketM3 && isRuleTon) effQty = qty * tf;
    else if (isTicketTon && isRuleM3) effQty = qty / tf;
    else if (ru === 'truck' || ru === 'load') effQty = 1;
    else if (su === 'truck' || su === 'load') {
      const m3 = Number(pl.truck_size || s.truck_size || 0) > 0 ? Number(pl.truck_size || s.truck_size) : 20;
      effQty = isRuleTon ? m3 * tf : m3;
    }
  }
  return effQty * bestRate;
}

async function loadR2Json(env, r2Cache, r2Key) {
  if (r2Cache && r2Cache.has(r2Key)) return r2Cache.get(r2Key);
  let doc = null;
  try {
    if (env && env.BUCKET && typeof env.BUCKET.get === 'function') {
      const obj = await env.BUCKET.get(r2Key);
      if (obj) doc = typeof obj.json === 'function' ? await obj.json() : JSON.parse(await obj.text());
    }
  } catch (_) {
    doc = null;
  }
  if (r2Cache) r2Cache.set(r2Key, doc);
  return doc;
}

function unpackPackedTable(tbl, pool) {
  if (!tbl) return [];
  if (Array.isArray(tbl)) return tbl.map(r => Object.assign({}, r));
  if (!Array.isArray(tbl.c) || !Array.isArray(tbl.r)) return [];
  const sPool = Array.isArray(pool) ? pool : [];
  const cols = tbl.c;
  const sc = Array.isArray(tbl.sc) ? tbl.sc : [];
  const pf = typeof tbl.p === 'string' ? tbl.p : '';
  const out = [];
  for (let idx = 0; idx < tbl.r.length; idx++) {
    const arr = tbl.r[idx];
    if (!Array.isArray(arr)) continue;
    const obj = {};
    if (pf) obj.id = `${pf}${idx}`;
    for (let ci = 0; ci < cols.length && ci < arr.length; ci++) {
      let v = arr[ci];
      if (v === null || v === undefined) continue;
      if (sc[ci] && typeof v === 'number' && v >= 0 && v < sPool.length) v = sPool[v];
      obj[cols[ci]] = v;
    }
    out.push(obj);
  }
  return out;
}

function unpackSeedIndustryTable(doc, tableKey) {
  if (!doc || !doc.tables || !doc.tables[tableKey]) return [];
  return unpackPackedTable(doc.tables[tableKey], doc._s);
}

function unpackSeedRecordTable(doc, tableKey) {
  if (!doc || !doc.records || !doc.records[tableKey]) return [];
  return unpackPackedTable(doc.records[tableKey], doc._s);
}

const DOMAIN_EDIT_META_KEYS = new Set(['ind', 'tableTitle', 'primaryId', 'cells', 'headers', 'rev', 'updated_at', 'updatedAt', '_revBumped', 'removedDocIds']);

function mergeIndustryOverlayRows(baseRows, customRowsByBucket, voidedDomainIds, wfVoided, wfPatches, rowEditsById, buckets) {
  const byId = new Map();
  const isRowVoided = (idUp, rowObj) => {
    if (!idUp) return Boolean(rowObj && rowObj.voided);
    if (voidedDomainIds.has(idUp)) return true;
    for (const bk of buckets) {
      if (wfVoided.has(`${bk}::${idUp}`)) return true;
    }
    return Boolean(rowObj && rowObj.voided);
  };
  for (const r of (baseRows || [])) {
    if (!r) continue;
    const idUp = String(r.id || r.code || '').trim().toUpperCase();
    if (isRowVoided(idUp, r)) continue;
    const key = idUp || `__anon_${byId.size}`;
    byId.set(key, Object.assign({}, r));
  }
  for (const bk of buckets) {
    for (const cr of (customRowsByBucket.get(bk) || [])) {
      if (!cr) continue;
      const idUp = String(cr.id || cr.code || '').trim().toUpperCase();
      if (isRowVoided(idUp, cr)) {
        if (idUp) byId.delete(idUp);
        continue;
      }
      if (idUp && byId.has(idUp)) {
        byId.set(idUp, Object.assign({}, byId.get(idUp), cr));
      } else {
        byId.set(idUp || `__c_${byId.size}`, Object.assign({}, cr));
      }
    }
  }
  const out = [];
  for (const [key, row] of byId.entries()) {
    const idUp = String(row.id || row.code || (key.startsWith('__') ? '' : key)).trim().toUpperCase();
    let merged = row;
    if (idUp) {
      for (const bk of buckets) {
        const wp = wfPatches.get(`${bk}::${idUp}`);
        if (wp) merged = Object.assign({}, merged, wp);
      }
      const ed = rowEditsById.get(idUp);
      if (ed) merged = Object.assign({}, merged, ed);
    }
    if (!merged.voided) out.push(merged);
  }
  return out;
}

function cashTillPostingDate(s) {
  const d = String((s && s.date) || '').slice(0, 10);
  if (!s || isAppRec(s, s) || String(s.time || '').trim() !== '21:00' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const p = d.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + 1)).toISOString().slice(0, 10);
}

function stepIsoDay(iso, deltaDays) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return '';
  const p = String(iso).split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + deltaDays)).toISOString().slice(0, 10);
}

function convDirectionIsU2L(cv) {
  if (!cv) return true;
  const t = String(cv.type || '');
  if (/LBP\s*(?:to|→|2)\s*USD/i.test(t)) return false;
  if (/USD\s*(?:to|→|2)\s*LBP/i.test(t)) return true;
  const fc = String(cv.from_currency || '').toUpperCase();
  if (fc === 'LBP') return false;
  if (fc === 'USD' && (cv.usd_delta != null || cv.usd_amount)) return true;
  const nm = String(cv.name || '');
  if (/LBP\s*(?:to|→|2)\s*USD/i.test(nm)) return false;
  if (/USD\s*(?:to|→|2)\s*LBP/i.test(nm)) return true;
  return fc !== 'LBP';
}

function mergeCashTableRows(customArr, d1Rows) {
  const byId = new Map();
  for (const cr of (Array.isArray(customArr) ? customArr : [])) {
    if (!cr || typeof cr !== 'object') continue;
    const id = String(cr.id || '').trim();
    byId.set(id || `__c_${byId.size}`, Object.assign({}, cr));
  }
  for (const dr of (d1Rows || [])) {
    if (!dr) continue;
    const pl = safePayloadJson(dr.payload_json);
    const merged = Object.assign({}, pl);
    for (const [k, v] of Object.entries(dr)) {
      if (k !== 'payload_json' && v !== null && v !== undefined && !(k === 'method' && v === '')) {
        merged[k] = v;
      }
    }
    merged.voided = Boolean(Number(dr.voided || 0) || pl.voided);
    const id = String(merged.id || '').trim();
    const isCustomOrModified = isAppRec(merged, pl) || merged.voided || Number(dr.rev || 0) > 1;
    if (!isCustomOrModified && (!id || !byId.has(id))) continue;
    if (id && byId.has(id)) {
      const ex = byId.get(id);
      if (merged.voided || (Number(dr.rev || 0) > Number(ex.rev || 0) && !ex.voided)) {
        byId.set(id, merged);
      }
    } else {
      byId.set(id || `__d_${byId.size}`, merged);
    }
  }
  return Array.from(byId.values());
}

function forEachServerCashDelta(rows, seedById, matchCo, applyRow) {
  for (const r of (rows || [])) {
    if (!r) continue;
    if (isAppRec(r, r)) {
      if (!r.voided && matchCo(r.company || 'WTC')) applyRow(r, 1);
    } else {
      const rid = String(r.id == null ? '' : r.id).trim();
      const orig = (rid && seedById.get(rid)) || (r._seed_orig && typeof r._seed_orig === 'object' ? r._seed_orig : null);
      if (r.voided) {
        if (orig && matchCo(orig.company || 'WTC')) applyRow(orig, -1);
      } else {
        if (orig && matchCo(orig.company || 'WTC')) applyRow(orig, -1);
        if (matchCo(r.company || 'WTC')) applyRow(r, 1);
      }
    }
  }
}

async function computeManufacturingTill(env, db, matchCo, targetDate, r2Cache) {
  const [seedCore, seedRecs, webStoreRow, ...d1Results] = await Promise.all([
    loadR2Json(env, r2Cache, 'seeds/seed_core.json'),
    loadR2Json(env, r2Cache, 'seeds/seed_records.json'),
    readEdgeKvDoc(db, 'mfg_web_store'),
    db.prepare('SELECT id, company, date, time, method, total, total_ttc, vat, source, voided, rev, payload_json FROM sales_tickets').all(),
    db.prepare('SELECT id, company, date, method, amount, discount, source, voided, rev, payload_json FROM customer_receipts').all(),
    db.prepare('SELECT id, company, date, method, amount, source, voided, rev, payload_json FROM expenses').all(),
    db.prepare('SELECT id, company, date, method, amount, discount, source, voided, rev, payload_json FROM supplier_payments').all(),
    db.prepare('SELECT id, company, date, method, amount, source, voided, rev, payload_json FROM salary_payments').all(),
    db.prepare('SELECT id, company, date, status, source, voided, rev, payload_json FROM attendance').all(),
    db.prepare('SELECT id, company, date, type, method, amount, usd_amount, lbp_amount, source, voided, rev, payload_json FROM external_movements').all(),
    db.prepare('SELECT id, company, date, amount, status, source, voided, rev, payload_json FROM loans').all(),
    db.prepare('SELECT id, company, date, amount, status, source, voided, rev, payload_json FROM loan_settlements').all(),
    db.prepare('SELECT id, company, date, usd_amount, lbp_amount, amount, source, voided, rev, payload_json FROM conversions').all()
  ]);

  const models = seedCore && seedCore.models;
  if (!models || typeof models !== 'object') return null;

  const mfgEnts = [
    { key: 'wtc', name: 'WTC' },
    { key: 'bbconstruction', name: 'BBConstruction' },
    { key: 'lionstransport', name: 'Lions Transport' }
  ].filter(e => matchCo(e.name));
  if (!mfgEnts.length) return null;

  let baseUsd = 0;
  for (const ent of mfgEnts) {
    const m = models[ent.key];
    const cf = m && m.cash_flow_sheet;
    if (!cf || !cf.live_till || !Array.isArray(cf.daily)) return null;
    for (const row of cf.daily) {
      if (!Array.isArray(row)) continue;
      const d = String(row[0] || '').slice(0, 10);
      if (d && d <= targetDate) {
        baseUsd += Number(row[1] || 0) - Number(row[2] || 0);
      }
    }
  }

  let customRecs = {};
  if (webStoreRow && webStoreRow.payload_json) {
    try {
      const p = JSON.parse(webStoreRow.payload_json);
      if (p && typeof p === 'object' && p.customRecords && typeof p.customRecords === 'object') {
        customRecs = p.customRecords;
      }
    } catch (_) {}
  }

  const buildSeedMap = (crKey) => {
    const map = new Map();
    const doc = (crKey === 'loans' && seedCore && seedCore.records && seedCore.records.loans) ? seedCore : seedRecs;
    for (const row of unpackSeedRecordTable(doc, crKey)) {
      const id = String((row && row.id) == null ? '' : row.id).trim();
      if (id) map.set(id, row);
    }
    return map;
  };
  const upToEnd = (d) => String(d || '').slice(0, 10) <= targetDate;

  const [sRes, rRes, eRes, spRes, salRes, atRes, extRes, lnRes, lsRes, cvRes] = d1Results;
  let deltaUsd = 0;

  forEachServerCashDelta(
    mergeCashTableRows(customRecs.sales_tickets, sRes.results),
    buildSeedMap('sales_tickets'),
    matchCo,
    (s, mult) => {
      if (!isCashSaleTicket(s, s) || !upToEnd(cashTillPostingDate(s))) return;
      const sgn = mfgTicketSign(s);
      if (!sgn) return;
      const net = Number(s.total != null ? s.total : (Number(s.total_ttc || 0) - Number(s.vat || 0))) * sgn;
      deltaUsd += net * mult;
    }
  );
  forEachServerCashDelta(
    mergeCashTableRows(customRecs.receipts, rRes.results),
    buildSeedMap('receipts'),
    matchCo,
    (r, mult) => {
      if (!upToEnd(r.date)) return;
      const mth = String(r.method || '').trim();
      const knd = mfgReceiptKind(r, r);
      if (mth === 'Rent') {
        deltaUsd -= Number(r.usd_amount != null ? r.usd_amount : r.amount || 0) * mult;
      } else if (knd === 'Settlement') {
        const lbp = Number(r.lbp_amount || 0);
        const usd = lbp ? Number(r.usd_amount || 0) : Number(r.usd_amount != null ? r.usd_amount : r.amount || 0);
        deltaUsd += usd * mult;
      }
    }
  );
  forEachServerCashDelta(
    mergeCashTableRows(customRecs.expenses, eRes.results),
    buildSeedMap('expenses'),
    matchCo,
    (x, mult) => {
      if (!upToEnd(x.date) || !isCashExpense(x, x)) return;
      const sgn = mfgExpenseSign(x, x);
      if (!sgn) return;
      const lbp = Number(x.lbp_amount || 0);
      const usd = (lbp ? Number(x.usd_amount || 0) : Number(x.usd_amount != null ? x.usd_amount : x.amount || 0)) * sgn;
      deltaUsd -= usd * mult;
    }
  );
  forEachServerCashDelta(
    mergeCashTableRows(customRecs.settlements, spRes.results),
    buildSeedMap('settlements'),
    matchCo,
    (sp, mult) => {
      if (!upToEnd(sp.date) || mfgSettlementKind(sp, sp) !== 'Payment') return;
      const lbp = Number(sp.lbp_amount || 0);
      const usd = lbp ? Number(sp.usd_amount || 0) : Number(sp.usd_amount != null ? sp.usd_amount : sp.amount || 0);
      deltaUsd -= usd * mult;
    }
  );
  forEachServerCashDelta(
    mergeCashTableRows(customRecs.salaries, salRes.results),
    buildSeedMap('salaries'),
    matchCo,
    (sa, mult) => {
      if (!upToEnd(sa.date)) return;
      const lbp = Number(sa.lbp_amount || 0);
      const usd = lbp ? Number(sa.usd_amount || 0) : Number(sa.usd_amount != null ? sa.usd_amount : (sa.amount || sa.total || 0));
      deltaUsd -= usd * mult;
    }
  );
  forEachServerCashDelta(
    mergeCashTableRows(customRecs.attendance, atRes.results),
    buildSeedMap('attendance'),
    matchCo,
    (at, mult) => {
      if (!upToEnd(at.date) || !/^Config\s+USD$/i.test(String(at.type || ''))) return;
      const tally = Number(at.tally || 0);
      if (tally) deltaUsd -= tally * mult;
    }
  );
  forEachServerCashDelta(
    mergeCashTableRows(customRecs.external_movements, extRes.results),
    buildSeedMap('external_movements'),
    matchCo,
    (ex, mult) => {
      if (!upToEnd(ex.date)) return;
      const flowStr = String(ex.flow || ex.method || '').trim();
      const isCfg = /^config$/i.test(flowStr);
      const lbpRaw = Number(ex.lbp_amount || 0);
      const hasExpUsd = ex.usd_amount != null && ex.usd_amount !== '';
      const usdRaw = hasExpUsd ? Number(ex.usd_amount || 0) : (Math.abs(lbpRaw) > 0.5 ? 0 : Number(ex.amount || 0));
      if (isCfg) {
        deltaUsd += usdRaw * mult;
      } else {
        const isOut = /out|expense/i.test(String(ex.direction || flowStr));
        deltaUsd += (isOut ? -Math.abs(usdRaw) : Math.abs(usdRaw)) * mult;
      }
    }
  );
  forEachServerCashDelta(
    mergeCashTableRows(customRecs.loans, lnRes.results),
    buildSeedMap('loans'),
    matchCo,
    (ln, mult) => {
      const dt = String(ln.date || ln.start_date || '').slice(0, 10);
      if (!dt || dt > targetDate) return;
      const isBorrowIn = /borrows/i.test(String(ln.direction || ''));
      const usdMag = Math.abs(ln.lbp_amount ? Number(ln.usd_amount || 0) : Number(ln.usd_amount != null ? ln.usd_amount : (ln.principal != null ? ln.principal : ln.amount || 0)));
      deltaUsd += (isBorrowIn ? usdMag : -usdMag) * mult;
    }
  );
  forEachServerCashDelta(
    mergeCashTableRows(customRecs.loan_settlements, lsRes.results),
    buildSeedMap('loan_settlements'),
    matchCo,
    (ls, mult) => {
      if (!upToEnd(ls.date)) return;
      const lbp = Number(ls.lbp_amount || 0);
      const usd = lbp ? Number(ls.usd_amount || 0) : Number(ls.usd_amount != null ? ls.usd_amount : ls.amount || 0);
      const isIn = /inflow|drawdown/i.test(String(ls.method || ls.type || ''));
      deltaUsd += (isIn ? usd : -usd) * mult;
    }
  );
  forEachServerCashDelta(
    mergeCashTableRows(customRecs.conversions, cvRes.results),
    buildSeedMap('conversions'),
    matchCo,
    (cv, mult) => {
      if (!upToEnd(cv.date)) return;
      const u2l = convDirectionIsU2L(cv);
      const usdMag = Math.abs(Number(cv.usd_amount != null ? cv.usd_amount : (cv.usd_delta != null ? cv.usd_delta : cv.amount || 0)));
      deltaUsd += (u2l ? -usdMag : usdMag) * mult;
    }
  );

  const res = Math.round((baseUsd + deltaUsd) * 100) / 100;
  return Math.abs(res) < 0.005 ? 0 : res;
}

async function resolveFxRateOnDate(db, targetDate) {
  let fxRate = 89500;
  try {
    const fxRes = await db.prepare('SELECT currency, start_date, end_date, amount, payload_json FROM fx_rates WHERE voided = 0').all();
    let bestStart = '';
    for (const r of (fxRes.results || [])) {
      const pl = safePayloadJson(r.payload_json);
      const cur = String(r.currency || pl.currency || 'LBP').toUpperCase();
      if (cur !== 'LBP') continue;
      const sd = r.start_date ? String(r.start_date).slice(0, 10) : '';
      const ed = r.end_date ? String(r.end_date).slice(0, 10) : '';
      if ((!sd || sd <= targetDate) && (!ed || ed >= targetDate)) {
        const amt = Number(r.amount || pl.amount || 0);
        if (amt > 0 && (!bestStart || sd >= bestStart)) {
          bestStart = sd;
          fxRate = amt;
        }
      }
    }
  } catch (_) {}
  return fxRate;
}

async function computeServerDayCloseDigest(env, userRow, userCfg, targetDate, r2Cache = null) {
  const db = env && env.DB;
  if (!db) return null;
  const lang = sanitizeLang(userCfg && userCfg.lang);
  const canBooks = userSeatCanViewBooks(userRow);
  const canExp = userSeatCanViewExpenses(userRow);
  const canFullPnl = Boolean(canBooks && canExp);
  const pseudoSess = {
    id: userRow.id,
    sub: userRow.id,
    role: userRow.role,
    companies: userRow.companies || ''
  };
  const scAuth = authorizeScopeKey(pseudoSess, userCfg && userCfg.scopeKey);
  if (!scAuth.ok) return null;
  if (!canBooks && scAuth.industry === 'Holding & Treasury') return null;

  const isFullGroup = isOwnerOrFullGroupSession(pseudoSess);
  const allowedList = isFullGroup ? null : parseAllowedCompanies(userRow.companies || '');
  const scopeCos = scAuth.companies ? new Set(scAuth.companies.map(c => c.toLowerCase())) : null;
  const matchCo = co => {
    const c = String(co || '').trim();
    if (!c) return false;
    if (scopeCos && !scopeCos.has(c.toLowerCase())) return false;
    if (allowedList && !canAccessCompany(pseudoSess, c)) return false;
    return true;
  };

  let salesTtc = 0;
  let salesEx = 0;
  let salesCount = 0;
  let directCost = 0;
  let expCost = 0;
  let salCost = 0;
  let commUsd = 0;
  let pendingBills = 0;
  let openCritDefects = 0;
  let malfCount = 0;
  let avg7Ttc = 0;
  let closingTillUsd = null;

  const fxRate = await resolveFxRateOnDate(db, targetDate);

  if (scAuth.industry === 'Manufacturing') {
    const prevDay = stepIsoDay(targetDate, -1) || targetDate;
    const [salesRes, rawRes, expRes, salRes, defRes, malfRes, prevSalesRes, prRes, prodRes, tillVal] = await Promise.all([
      db.prepare('SELECT id, company, date, time, source, product, uom, qty, method, total, total_ttc, payload_json FROM sales_tickets WHERE voided = 0 AND substr(date, 1, 10) IN (?1, ?2)').bind(prevDay, targetDate).all(),
      db.prepare('SELECT id, company, date, time, source, method, total, payload_json FROM raw_purchases WHERE voided = 0 AND substr(date, 1, 10) IN (?1, ?2)').bind(prevDay, targetDate).all(),
      db.prepare('SELECT company, method, amount, voided, payload_json FROM expenses WHERE voided = 0 AND substr(date, 1, 10) = ?1').bind(targetDate).all(),
      db.prepare('SELECT company, method, amount, payload_json FROM salary_payments WHERE voided = 0 AND substr(date, 1, 10) = ?1').bind(targetDate).all(),
      db.prepare("SELECT company, severity, payload_json FROM equipment_defects WHERE voided = 0 AND lower(coalesce(status,'')) NOT IN ('resolved','closed')").all(),
      db.prepare('SELECT company FROM fuel_malfunctions WHERE voided = 0 AND substr(date, 1, 10) = ?1').bind(targetDate).all(),
      db.prepare('SELECT id, date, time, source, company, method, total, total_ttc, payload_json FROM sales_tickets WHERE voided = 0 AND substr(date, 1, 10) <= ?1').bind(targetDate).all(),
      db.prepare("SELECT company, product, unit, unit_price, start_date, end_date, payload_json FROM price_rules WHERE voided = 0 AND lower(coalesce(rule_type,'')) = 'commission'").all(),
      db.prepare('SELECT name, payload_json FROM products WHERE voided = 0').all(),
      canBooks ? computeManufacturingTill(env, db, matchCo, targetDate, r2Cache) : Promise.resolve(null)
    ]);
    closingTillUsd = tillVal;
    const commRules = new Map();
    for (const pr of (prRes.results || [])) {
      const pl = safePayloadJson(pr.payload_json);
      const ck = `${String(pr.company || '').trim().toLowerCase()}|${String(pr.product || '').trim().toLowerCase()}`;
      if (!commRules.has(ck)) commRules.set(ck, []);
      commRules.get(ck).push(Object.assign({}, pl, pr));
    }
    const tonFactors = new Map();
    for (const pd of (prodRes.results || [])) {
      const pl = safePayloadJson(pd.payload_json);
      const nm = String(pd.name || '').trim().toLowerCase();
      if (nm && pl.ton_factor) tonFactors.set(nm, Number(pl.ton_factor));
    }

    const withPostDate = r => {
      const pl = safePayloadJson(r.payload_json);
      return {
        row: r,
        pl,
        effDate: cashTillPostingDate(Object.assign({}, pl, r, {
          id: r.id || pl.id || '',
          time: r.time || pl.time || '',
          source: r.source || pl.source || ''
        }))
      };
    };
    const salesRows = (salesRes.results || []).map(withPostDate).filter(x => matchCo(x.row.company) && x.effDate === targetDate);
    const rawRows = (rawRes.results || []).map(withPostDate).filter(x => matchCo(x.row.company) && x.effDate === targetDate);
    const expRows = (expRes.results || []).filter(r => matchCo(r.company));
    const salRows = (salRes.results || []).filter(r => matchCo(r.company));
    for (const df of (defRes.results || [])) {
      if (!matchCo(df.company)) continue;
      const pl = safePayloadJson(df.payload_json);
      if (/crit|grave|breakdown|down/i.test(String(df.severity || pl.priority || ''))) openCritDefects++;
    }
    malfCount = (malfRes.results || []).filter(r => matchCo(r.company)).length;

    for (const { row: r, pl } of salesRows) {
      const sgn = mfgTicketSign(r);
      if (!sgn) continue;
      salesCount++;
      salesTtc += sgn * Number(r.total_ttc || r.total || 0);
      salesEx += sgn * Number(r.total || 0);
      commUsd += mfgTicketCommission(r, pl, commRules, tonFactors);
    }
    for (const { row: r } of rawRows) {
      const sgn = mfgTicketSign(r);
      if (sgn) directCost += sgn * Number(r.total || 0);
    }
    for (const r of expRows) {
      const pl = safePayloadJson(r.payload_json);
      if (isPendingPriceExp(r, pl)) pendingBills++;
      const sgn = mfgExpenseSign(r, pl);
      if (sgn === 0 || mfgExpenseKind(r, pl) === 'VAT') continue;
      expCost += Number(r.amount || pl.amount || 0) * sgn;
    }
    for (const r of salRows) {
      const pl = safePayloadJson(r.payload_json);
      const lbp = Number(pl.lbp_amount || 0);
      const usd = lbp ? Number(pl.usd_amount || 0) : Number(pl.usd_amount != null ? pl.usd_amount : (r.amount || pl.amount || pl.total || 0));
      salCost += usd + (lbp ? lbp / fxRate : 0);
    }
    const priorByDay = new Map();
    for (const r of (prevSalesRes.results || [])) {
      if (!matchCo(r.company)) continue;
      const sgn = mfgTicketSign(r);
      if (!sgn) continue;
      const pl = safePayloadJson(r.payload_json);
      const dt = cashTillPostingDate(Object.assign({}, pl, r, {
        id: r.id || pl.id || '',
        time: r.time || pl.time || '',
        source: r.source || pl.source || ''
      }));
      if (!dt || dt >= targetDate) continue;
      priorByDay.set(dt, (priorByDay.get(dt) || 0) + sgn * Number(r.total_ttc || r.total || 0));
    }
    const activeDays = Array.from(priorByDay.keys()).sort().slice(-7);
    if (activeDays.length) {
      avg7Ttc = activeDays.reduce((s, d) => s + (priorByDay.get(d) || 0), 0) / activeDays.length;
    }
  } else {
    const indName = scAuth.industry;
    const [seedDoc, custRes, editRes, expAllRes, defRes, extRes] = await Promise.all([
      loadR2Json(env, r2Cache, 'seeds/seed_industries.json'),
      db.prepare('SELECT bucket, row_id, company, voided, payload_json FROM industry_custom_rows').all(),
      db.prepare('SELECT edit_key, voided, payload_json FROM industry_row_edits').all(),
      db.prepare('SELECT company, date, rep_date, method, amount, voided, payload_json FROM expenses WHERE voided = 0').all(),
      db.prepare("SELECT company, severity, payload_json FROM equipment_defects WHERE voided = 0 AND lower(coalesce(status,'')) NOT IN ('resolved','closed')").all(),
      indName === 'Holding & Treasury' ? db.prepare('SELECT id, company, date, rep_date, type, method, amount, usd_amount, lbp_amount, voided, payload_json FROM external_movements').all() : Promise.resolve({ results: [] })
    ]);

    const voidedDomainIds = new Set();
    const wfVoided = new Set();
    const wfPatches = new Map();
    const rowEditsById = new Map();
    for (const ed of (editRes.results || [])) {
      const ek = String(ed.edit_key || '');
      const ep = safePayloadJson(ed.payload_json);
      const isEdVoid = Boolean(Number(ed.voided || 0) || ep.voided);
      if (ek.startsWith('WF::')) {
        const parts = ek.split('::');
        const bk = String(parts[1] || '').trim();
        const ridUp = parts.slice(2).join('::').trim().toUpperCase();
        if (!bk || !ridUp) continue;
        if (isEdVoid) wfVoided.add(`${bk}::${ridUp}`);
        else wfPatches.set(`${bk}::${ridUp}`, ep);
        continue;
      }
      if (ek.startsWith(`${indName}::`)) {
        const ridUp = ek.slice(ek.lastIndexOf('::') + 2).trim().toUpperCase();
        if (!ridUp) continue;
        if (isEdVoid) {
          voidedDomainIds.add(ridUp);
        } else {
          const clean = {};
          for (const [k, v] of Object.entries(ep)) {
            if (!DOMAIN_EDIT_META_KEYS.has(k)) clean[k] = v;
          }
          if (Object.keys(clean).length) rowEditsById.set(ridUp, Object.assign(rowEditsById.get(ridUp) || {}, clean));
        }
      }
    }

    const customByBucket = new Map();
    for (const cr of (custRes.results || [])) {
      const bk = String(cr.bucket || '');
      const obj = safePayloadJson(cr.payload_json);
      if (!obj || typeof obj !== 'object') continue;
      if (!obj.id && cr.row_id) obj.id = cr.row_id;
      if (!obj.company && cr.company) obj.company = cr.company;
      if (Number(cr.voided || 0) || obj.voided) {
        obj.voided = true;
        const ridUp = String(obj.id || cr.row_id || '').trim().toUpperCase();
        if (bk && ridUp) wfVoided.add(`${bk}::${ridUp}`);
      }
      if (!customByBucket.has(bk)) customByBucket.set(bk, []);
      customByBucket.get(bk).push(obj);
    }

    const revByDay = new Map();
    const allOpDates = new Set();
    const recordRevDay = (dt, usd) => {
      const d = String(dt || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        allOpDates.add(d);
        revByDay.set(d, (revByDay.get(d) || 0) + Number(usd || 0));
      }
    };
    const recordOpDate = dt => {
      const d = String(dt || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) allOpDates.add(d);
    };

    if (indName === 'Holding & Treasury') {
      const seedLegs = unpackSeedIndustryTable(seedDoc, 'holding.sisterExternalLegs');
      const d1Exts = (extRes.results || []).map(r => {
        const pl = safePayloadJson(r.payload_json);
        return Object.assign({}, pl, r, { voided: Boolean(Number(r.voided || 0) || pl.voided) });
      });
      const seenExt = new Set();
      const rawLegs = [];
      for (const r of d1Exts.concat(seedLegs)) {
        if (!r) continue;
        const idStr = String(r.id || '').trim();
        const idUp = idStr.toUpperCase();
        if (idUp) {
          if (seenExt.has(idUp)) continue;
          seenExt.add(idUp);
        }
        if (Number(r.voided || 0) || r.voided === true || (idUp && (voidedDomainIds.has(idUp) || wfVoided.has(`hld_interactions::${idUp}`)))) continue;
        const m = String(r.method || '').trim();
        const flowStr = String(r.flow || r.type || '').trim();
        if (/^extended$/i.test(String(r.kind || ''))) continue;
        if (m === 'Config' || /^config$/i.test(flowStr) || m === 'Remove' || m === 'Adjusted') continue;
        const targetCo = resolveSisterEntityName(r.party || r.counterparty);
        const co = resolveSisterEntityName(r.company) || String(r.company || '').trim();
        if (!co || !targetCo || targetCo === co) continue;
        const dirStr = String(r.direction || flowStr || '').trim();
        const isOut = /^out|outflow|expense|withdraw|debit/i.test(dirStr) || (Number(r.out_usd || 0) > 0 && Number(r.in_usd || 0) === 0);
        const lbpRaw = Number(r.lbp_amount || 0);
        const usdRaw = lbpRaw
          ? Number(r.usd_amount || (Math.abs(lbpRaw) / fxRate) || 0)
          : Number(r.usd_amount != null ? r.usd_amount : (isOut ? (r.out_usd || r.amount) : (r.in_usd || r.amount)) || 0);
        const usd = Math.abs(usdRaw);
        if (!(usd > 0)) continue;
        rawLegs.push({
          id: idStr,
          company: co,
          initiatorCo: co,
          fromCo: isOut ? co : targetCo,
          toCo: isOut ? targetCo : co,
          side: isOut ? 'Out' : 'In',
          date: String(r.date || r.rep_date || '').slice(0, 10),
          usd
        });
      }
      for (const rawCr of (customByBucket.get('hld_interactions') || [])) {
        if (!rawCr) continue;
        const idStr = String(rawCr.id || '').trim();
        const crIdUp = idStr.toUpperCase();
        if (crIdUp) {
          for (let li = rawLegs.length - 1; li >= 0; li--) {
            const lidUp = String(rawLegs[li].id || '').trim().toUpperCase();
            if (lidUp === crIdUp || lidUp === `${crIdUp}-MIR`) rawLegs.splice(li, 1);
          }
        }
        if (rawCr.voided || (crIdUp && (voidedDomainIds.has(crIdUp) || wfVoided.has(`hld_interactions::${crIdUp}`)))) continue;
        let cr = rawCr;
        if (crIdUp) {
          const wp = wfPatches.get(`hld_interactions::${crIdUp}`);
          if (wp) cr = Object.assign({}, cr, wp);
          const ed = rowEditsById.get(crIdUp);
          if (ed) cr = Object.assign({}, cr, ed);
        }
        if (cr.voided) continue;
        const fromCo = resolveSisterEntityName(cr.fromCo) || cr.fromCo || 'Bdeir Holding';
        const toCo = resolveSisterEntityName(cr.toCo) || cr.toCo || 'WTC';
        const usd = Math.abs(Number(cr.usd != null ? cr.usd : (cr.usd_amount != null ? cr.usd_amount : cr.amount || 0)));
        if (!(usd > 0) || fromCo === toCo) continue;
        const d = String(cr.date || '').slice(0, 10);
        rawLegs.push({ id: idStr || 'IC-CUST', company: fromCo, initiatorCo: fromCo, fromCo, toCo, side: 'Out', date: d, usd });
        if (cr.bookMirror) {
          rawLegs.push({ id: `${idStr || 'IC-CUST'}-MIR`, company: toCo, initiatorCo: toCo, fromCo, toCo, side: 'In', date: d, usd });
        }
      }
      for (const leg of rawLegs) {
        if (!matchCo(leg.company)) continue;
        const d = String(leg.date || '').slice(0, 10);
        if (leg.side === 'In') {
          recordRevDay(d, leg.usd);
          if (d === targetDate) {
            salesCount++;
            salesTtc += leg.usd;
            salesEx += leg.usd;
          }
        } else {
          recordOpDate(d);
          if (d === targetDate) directCost += leg.usd;
        }
      }
    } else if (indName === 'Hospitality & Resorts') {
      const venues = mergeIndustryOverlayRows(unpackSeedIndustryTable(seedDoc, 'hospitality.venueRows'), customByBucket, voidedDomainIds, wfVoided, wfPatches, rowEditsById, ['hsp_revenue']);
      const maints = mergeIndustryOverlayRows(unpackSeedIndustryTable(seedDoc, 'hospitality.maintRows'), customByBucket, voidedDomainIds, wfVoided, wfPatches, rowEditsById, ['hsp_maint']);
      const stocks = mergeIndustryOverlayRows(unpackSeedIndustryTable(seedDoc, 'hospitality.stockRows'), customByBucket, voidedDomainIds, wfVoided, wfPatches, rowEditsById, ['hsp_stock']);
      for (const r of venues) {
        if (!matchCo(r.company)) continue;
        const d = String(r.date || '').slice(0, 10);
        const ttc = Number(r.ttc_usd || 0);
        recordRevDay(d, ttc);
        if (d === targetDate) {
          salesCount++;
          salesTtc += ttc;
          salesEx += Number(r.ht_usd != null ? r.ht_usd : ttc / 1.11);
        }
      }
      for (const r of maints) {
        if (!matchCo(r.company)) continue;
        const d = String(r.date || '').slice(0, 10);
        recordOpDate(d);
        if (d === targetDate) directCost += Number(r.cost_usd || 0);
      }
      for (const r of stocks) {
        if (!matchCo(r.company)) continue;
        const d = String(r.date || '').slice(0, 10);
        recordOpDate(d);
        if (d === targetDate) directCost += Number(r.recipe_usage_usd || 0);
      }
    } else if (indName === 'Automotive & Heavy Trading') {
      const tSales = mergeIndustryOverlayRows(unpackSeedIndustryTable(seedDoc, 'trading.salesRows'), customByBucket, voidedDomainIds, wfVoided, wfPatches, rowEditsById, ['trd_sales']);
      const tImports = mergeIndustryOverlayRows(unpackSeedIndustryTable(seedDoc, 'trading.importRows'), customByBucket, voidedDomainIds, wfVoided, wfPatches, rowEditsById, ['trd_purchases']);
      for (const r of tSales) {
        if (r.is_gap || !matchCo(r.company)) continue;
        const d = String(r.date || '').slice(0, 10);
        const ttc = Number(r.ttc_usd != null ? r.ttc_usd : (r.net_usd || 0));
        recordRevDay(d, ttc);
        if (d === targetDate) {
          salesCount++;
          salesTtc += ttc;
          salesEx += Number(r.net_usd != null ? r.net_usd : ttc / 1.11);
          directCost += Number(r.cost_usd || 0);
        }
      }
      for (const r of tImports) {
        if (!matchCo(r.company)) continue;
        const d = String(r.date || '').slice(0, 10);
        recordOpDate(d);
        if (d === targetDate) directCost += Number(r.landed_add_usd != null ? r.landed_add_usd : (r.duty_freight_usd || 0));
      }
    } else if (indName === 'Real Estate & Property') {
      const reInvs = mergeIndustryOverlayRows(unpackSeedIndustryTable(seedDoc, 'realestate.invoices'), customByBucket, voidedDomainIds, wfVoided, wfPatches, rowEditsById, ['re_invoicing']);
      const reSales = mergeIndustryOverlayRows(unpackSeedIndustryTable(seedDoc, 'realestate.sales'), customByBucket, voidedDomainIds, wfVoided, wfPatches, rowEditsById, ['re_sales']);
      const reWos = mergeIndustryOverlayRows(unpackSeedIndustryTable(seedDoc, 'realestate.workorders'), customByBucket, voidedDomainIds, wfVoided, wfPatches, rowEditsById, ['re_workorders']);
      for (const r of reInvs) {
        if (!matchCo(r.company)) continue;
        const d = String(r.date || '').slice(0, 10);
        const ttc = Number(r.amount_ttc_usd != null ? r.amount_ttc_usd : (r.ttc_usd || 0));
        const isExempt = /properties/i.test(String(r.company || ''));
        recordRevDay(d, ttc);
        if (d === targetDate) {
          salesCount++;
          salesTtc += ttc;
          salesEx += Number(r.net_usd != null ? r.net_usd : (isExempt ? ttc : ttc / 1.11));
        }
      }
      for (const r of reSales) {
        if (!matchCo(r.company)) continue;
        const d = String(r.date || '').slice(0, 10);
        const amt = Number(r.paid_usd || r.contract_usd || 0);
        recordRevDay(d, amt);
        if (d === targetDate) {
          salesCount++;
          salesTtc += amt;
          salesEx += amt;
        }
      }
      for (const r of reWos) {
        if (!matchCo(r.company)) continue;
        const d = String(r.date || '').slice(0, 10);
        recordOpDate(d);
        if (d === targetDate) directCost += Number(r.actual_usd || 0);
      }
    } else if (indName === 'Insurance & Brokerage') {
      const insPols = mergeIndustryOverlayRows(unpackSeedIndustryTable(seedDoc, 'insurance.policies'), customByBucket, voidedDomainIds, wfVoided, wfPatches, rowEditsById, ['ins_policies']);
      const insClaims = mergeIndustryOverlayRows(unpackSeedIndustryTable(seedDoc, 'insurance.claims'), customByBucket, voidedDomainIds, wfVoided, wfPatches, rowEditsById, ['ins_claims']);
      for (const r of insPols) {
        if (!matchCo(r.company || 'Insurance Company')) continue;
        const d = String(r.date || '').slice(0, 10);
        const prem = Number(r.gross_prem_usd || 0);
        recordRevDay(d, prem);
        if (d === targetDate) {
          salesCount++;
          salesTtc += prem;
          salesEx += prem;
          directCost += Math.max(0, Number(r.net_payable_4017_usd || 0));
        }
      }
      for (const r of insClaims) {
        if (!matchCo(r.company || 'Insurance Company')) continue;
        const d = String(r.loss_date || r.date || '').slice(0, 10);
        recordOpDate(d);
        if (d === targetDate) directCost += Number(r.paid_by_insurer_usd || r.approved_usd || 0);
      }
    }

    for (const r of (expAllRes.results || [])) {
      if (!matchCo(r.company)) continue;
      const pl = safePayloadJson(r.payload_json);
      const d = String(r.date || r.rep_date || '').slice(0, 10);
      const sgn = mfgExpenseSign(r, pl);
      if (d) recordOpDate(d);
      if (d === targetDate) {
        if (isPendingPriceExp(r, pl)) pendingBills++;
        if (sgn !== 0 && mfgExpenseKind(r, pl) !== 'VAT') {
          expCost += Number(pl.total_ttc != null ? pl.total_ttc : (r.amount || pl.amount || 0)) * sgn;
        }
      }
    }
    for (const df of (defRes.results || [])) {
      if (!matchCo(df.company)) continue;
      const pl = safePayloadJson(df.payload_json);
      if (/crit|grave|breakdown|down/i.test(String(df.severity || pl.priority || ''))) openCritDefects++;
    }
    const priorDays = Array.from(revByDay.keys()).filter(d => d < targetDate && (revByDay.get(d) || 0) > 0).sort().slice(-7);
    if (priorDays.length) {
      avg7Ttc = priorDays.reduce((s, d) => s + (revByDay.get(d) || 0), 0) / priorDays.length;
    }
  }

  let openSentinels = 0;
  try {
    const sentRes = await db.prepare('SELECT rule_id, company FROM sentinel_reviews WHERE active = 1').all();
    for (const sr of (sentRes.results || [])) {
      if (!canBooks && String(sr.rule_id || '').toUpperCase() === 'S1') continue;
      if (matchCo(sr.company)) openSentinels++;
    }
  } catch (_) {}

  const roundedSalesTtc = Math.round(salesTtc);
  const dayProfit = Math.round(salesEx - directCost - expCost - salCost - commUsd);
  const vs7 = (roundedSalesTtc > 0 && avg7Ttc > 0)
    ? Math.round(((roundedSalesTtc - avg7Ttc) / avg7Ttc) * 100)
    : null;

  const items = [];
  if (canFullPnl && roundedSalesTtc > 0 && dayProfit < 0) {
    const absLoss = `$${Math.abs(dayProfit).toLocaleString('en-US')}`;
    items.push(lang === 'ar'
      ? `خسارة اليوم -${absLoss}`
      : (lang === 'fr' ? `Perte du jour -${absLoss}` : `Day Loss -${absLoss}`));
  }
  if (canBooks && closingTillUsd !== null && Math.round(closingTillUsd) < 0) {
    const absTill = `$${Math.abs(Math.round(closingTillUsd)).toLocaleString('en-US')}`;
    items.push(lang === 'ar'
      ? `عجز الصندوق -${absTill}`
      : (lang === 'fr' ? `Caisse négative -${absTill}` : `Till Negative -${absTill}`));
  }
  if (vs7 !== null && vs7 <= -25) {
    items.push(lang === 'ar'
      ? `المبيعات أقل من المعتاد ${vs7}%`
      : (lang === 'fr' ? `Ventes sous la moyenne ${vs7}%` : `Sales Below Usual ${vs7}%`));
  }
  if (pendingBills > 0) {
    items.push(lang === 'ar'
      ? `${pendingBills} فواتير بانتظار السعر`
      : (lang === 'fr' ? `${pendingBills} factures en attente` : `${pendingBills} Pending Price`));
  }
  if (openCritDefects > 0) {
    items.push(lang === 'ar'
      ? `${openCritDefects} أعطال حرجة`
      : (lang === 'fr' ? `${openCritDefects} pannes critiques` : `${openCritDefects} Critical Defects`));
  }
  if (malfCount > 0) {
    items.push(lang === 'ar'
      ? `${malfCount} فروقات عداد`
      : (lang === 'fr' ? `${malfCount} écarts compteur` : `${malfCount} Tank Variance`));
  }
  if (openSentinels > 0) {
    items.push(lang === 'ar'
      ? `${openSentinels} تنبيهات مفتوحة`
      : (lang === 'fr' ? `${openSentinels} alertes ouvertes` : `${openSentinels} Open Alerts`));
  }

  const fmtSales = `$${roundedSalesTtc.toLocaleString('en-US')}`;
  const title = lang === 'ar'
    ? `إغلاق اليوم · ${targetDate}`
    : (lang === 'fr' ? `Clôture du jour · ${targetDate}` : `Close of Day · ${targetDate}`);
  const summary = items.length > 0 ? items.join(' · ') : (
    lang === 'ar'
      ? 'الوضع سليم ولا توجد تنبيهات مفتوحة'
      : (lang === 'fr' ? 'Tout est en ordre, aucune alerte ouverte' : 'All Clear, no open attention items')
  );
  const arCountTxt = scAuth.industry === 'Manufacturing' ? `${salesCount} نقلة` : `${salesCount}`;
  const body = lang === 'ar'
    ? `المبيعات ${fmtSales} (${arCountTxt}) · ${summary}`
    : (lang === 'fr'
      ? `Ventes ${fmtSales} (${salesCount}) · ${summary}`
      : `Sales ${fmtSales} (${salesCount}) · ${summary}`);

  return { title, body, url: './#daily_ops', date: targetDate, tag: `isabi-day-close-${targetDate}` };
}

export async function handleDayClosePush(request, env, session, body) {
  if (!session) return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  if (!env || !env.DB) return jsonResponse({ ok: false, error: 'D1 not bound' }, 503);

  const isBuildTicket = Boolean(session.build_ticket);
  if (isBuildTicket) {
    if (request.method !== 'POST' || !body || body.op !== 'dispatch_due') {
      return jsonResponse({ ok: false, error: 'Build ticket only permits POST dispatch_due.' }, 403);
    }
  }

  const secFetch = (request.headers.get('Sec-Fetch-Site') || '').trim().toLowerCase();
  if (request.method === 'POST' && secFetch === 'cross-site') {
    return jsonResponse({ ok: false, error: 'Cross-site push mutation forbidden.' }, 403);
  }
  if (request.method === 'POST' && !isBuildTicket && ((request.headers.get('Origin') || '').trim() || (request.headers.get('Referer') || '').trim()) && !isSameOriginBrowserRequest(request)) {
    return jsonResponse({ ok: false, error: 'Cross-origin push mutation forbidden.' }, 403);
  }

  const userId = String(session.sub || session.id || session.email || '').trim();
  if (!userId && !isBuildTicket) return jsonResponse({ ok: false, error: 'Invalid session identity.' }, 401);

  const rlKey = `day-close-push:${isBuildTicket ? 'cron' : userId}`;
  const rl = await checkD1RateLimit(env, rlKey, isBuildTicket ? 20 : 30, 60, { failClosed: true });
  if (!rl.allowed) return jsonResponse({ ok: false, error: 'Rate limit reached for close-of-day push.' }, 429);

  const vapid = await ensureVapidKeypair(env.DB, env);

  if (request.method === 'GET') {
    const subsRow = await readEdgeKvDoc(env.DB, PUSH_SUBS_KV_KEY);
    const store = readSubsStoreObj(subsRow);
    const cfg = store.byUser[userId] || {};
    const subs = Array.isArray(cfg.subs) ? cfg.subs : [];
    return jsonResponse(Object.assign({
      ok: true,
      enabled: Boolean(vapid),
      vapidPublicKey: vapid ? vapid.publicKeyB64Url : '',
      subscribed: subs.length > 0,
      endpointCount: subs.length,
      closeHourBeirut: sanitizeCloseHour(cfg.closeHourBeirut),
      whatsappPhone: sanitizePhone(cfg.whatsappPhone),
      lang: sanitizeLang(cfg.lang),
      scopeKey: String(cfg.scopeKey || ''),
      lastSentDate: String(cfg.lastSentDate || '')
    }, vapid ? {} : { reason: 'invalid_vapid_env' }));
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405);
  }

  const op = String((body && body.op) || '').trim();
  const isDemo = (request.headers.get('X-ISABI-Demo') || '').trim() === '1';
  if (isDemo && op !== 'dispatch_due') {
    return jsonResponse({ ok: false, error: 'Demo sandbox cannot persist push subscriptions.' }, 403);
  }

  if (op === 'subscribe') {
    if (!vapid) {
      return jsonResponse({ ok: true, enabled: false, subscribed: false, stored: false, endpointCount: 0 });
    }
    const sub = body && body.subscription;
    const epChk = validatePushEndpoint(sub && sub.endpoint);
    if (!epChk.ok) return jsonResponse({ ok: false, error: epChk.error }, 400);
    const p256dh = b64UrlDecode(sub && sub.keys && sub.keys.p256dh);
    const auth = b64UrlDecode(sub && sub.keys && sub.keys.auth);
    if (p256dh.length !== 65 || p256dh[0] !== 0x04 || auth.length !== 16) {
      return jsonResponse({ ok: false, error: 'Invalid Web Push subscription keys.' }, 400);
    }
    const hasScopeField = Boolean(body && Object.prototype.hasOwnProperty.call(body, 'scopeKey'));
    if (hasScopeField) {
      const scPre = authorizeScopeKey(session, body.scopeKey);
      if (!scPre.ok) return jsonResponse({ ok: false, error: scPre.error }, scPre.status);
    }

    const resCas = await mutateSubsStoreCas(env.DB, userId, (store, nowIso) => {
      for (const [otherId, otherCfg] of Object.entries(store.byUser || {})) {
        if (otherId === userId || !otherCfg || !Array.isArray(otherCfg.subs)) continue;
        const beforeLen = otherCfg.subs.length;
        otherCfg.subs = otherCfg.subs.filter(s => s && s.endpoint !== epChk.url);
        if (otherCfg.subs.length !== beforeLen) otherCfg.updatedAt = nowIso;
      }
      const totalAll = Object.values(store.byUser).reduce((s, u) => s + (Array.isArray(u && u.subs) ? u.subs.length : 0), 0);
      const cur = store.byUser[userId] || { subs: [], email: '', closeHourBeirut: 18, whatsappPhone: '', lang: 'en', scopeKey: '', lastSentDate: '' };
      const effScopeRaw = hasScopeField ? body.scopeKey : cur.scopeKey;
      const scAuth = authorizeScopeKey(session, effScopeRaw);
      if (!scAuth.ok) {
        return { abort: true, response: jsonResponse({ ok: false, error: scAuth.error }, scAuth.status) };
      }
      const existingIdx = (cur.subs || []).findIndex(s => s && s.endpoint === epChk.url);
      if (existingIdx < 0 && totalAll >= MAX_SUBS_TOTAL) {
        return { abort: true, response: jsonResponse({ ok: false, error: 'Global push subscription limit reached.' }, 429) };
      }
      const nextSubs = (cur.subs || []).filter(s => s && s.endpoint !== epChk.url);
      nextSubs.unshift({
        endpoint: epChk.url,
        keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) },
        addedAt: nowIso
      });
      store.byUser[userId] = {
        userId,
        email: String(session.email || cur.email || '').trim().toLowerCase(),
        subs: nextSubs.slice(0, MAX_SUBS_PER_USER),
        closeHourBeirut: sanitizeCloseHour(body.closeHourBeirut != null ? body.closeHourBeirut : cur.closeHourBeirut),
        whatsappPhone: sanitizePhone(body.whatsappPhone != null ? body.whatsappPhone : cur.whatsappPhone),
        lang: sanitizeLang(body.lang != null ? body.lang : cur.lang),
        scopeKey: scAuth.scopeKey,
        lastSentDate: String(cur.lastSentDate || ''),
        attemptDate: '',
        retryAfterMs: 0,
        claimDate: String(cur.claimDate || ''),
        claimToken: String(cur.claimToken || ''),
        claimUntilMs: Number(cur.claimUntilMs || 0),
        updatedAt: nowIso
      };
      return { payload: { endpointCount: store.byUser[userId].subs.length } };
    });
    if (!resCas.ok) return resCas.response;
    return jsonResponse({ ok: true, subscribed: true, endpointCount: resCas.payload.endpointCount });
  }

  if (op === 'rotate') {
    if (!vapid) {
      return jsonResponse({ ok: true, enabled: false, rotated: false, subscribed: false, endpointCount: 0 });
    }
    const sub = body && body.subscription;
    const epChk = validatePushEndpoint(sub && sub.endpoint);
    if (!epChk.ok) return jsonResponse({ ok: false, error: epChk.error }, 400);
    const p256dh = b64UrlDecode(sub && sub.keys && sub.keys.p256dh);
    const auth = b64UrlDecode(sub && sub.keys && sub.keys.auth);
    if (p256dh.length !== 65 || p256dh[0] !== 0x04 || auth.length !== 16) {
      return jsonResponse({ ok: false, error: 'Invalid Web Push subscription keys.' }, 400);
    }
    const repRaw = String((body && body.replaces) || '').trim();
    const repChk = repRaw ? validatePushEndpoint(repRaw) : { ok: false, url: '' };
    const repUrl = repChk.ok ? repChk.url : '';
    const resCas = await mutateSubsStoreCas(env.DB, userId, (store, nowIso) => {
      const cur = store.byUser[userId];
      if (!cur || !Array.isArray(cur.subs) || !cur.subs.length) {
        return { skipWrite: true, payload: { rotated: false, subscribed: false } };
      }
      const hadPrev = cur.subs.some(s => s && (s.endpoint === epChk.url || (repUrl && s.endpoint === repUrl)));
      if (!hadPrev) {
        return { skipWrite: true, payload: { rotated: false, subscribed: true } };
      }
      for (const [otherId, otherCfg] of Object.entries(store.byUser || {})) {
        if (otherId === userId || !otherCfg || !Array.isArray(otherCfg.subs)) continue;
        const beforeLen = otherCfg.subs.length;
        otherCfg.subs = otherCfg.subs.filter(s => s && s.endpoint !== epChk.url);
        if (otherCfg.subs.length !== beforeLen) otherCfg.updatedAt = nowIso;
      }
      const kept = cur.subs.filter(s => s && s.endpoint !== epChk.url && (!repUrl || s.endpoint !== repUrl));
      kept.unshift({
        endpoint: epChk.url,
        keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) },
        addedAt: nowIso
      });
      cur.subs = kept.slice(0, MAX_SUBS_PER_USER);
      cur.updatedAt = nowIso;
      return { payload: { rotated: true, subscribed: true, endpointCount: cur.subs.length } };
    });
    if (!resCas.ok) return resCas.response;
    return jsonResponse({ ok: true, rotated: Boolean(resCas.payload.rotated), subscribed: Boolean(resCas.payload.subscribed), endpointCount: Number(resCas.payload.endpointCount || 0) });
  }

  if (op === 'unsubscribe') {
    const endpoint = String((body && body.endpoint) || '').trim();
    const resCas = await mutateSubsStoreCas(env.DB, userId, (store, nowIso) => {
      const cur = store.byUser[userId];
      if (!cur || !Array.isArray(cur.subs) || !cur.subs.length) {
        return { skipWrite: true, payload: { subscribed: false, endpointCount: 0 } };
      }
      cur.subs = endpoint ? cur.subs.filter(s => s && s.endpoint !== endpoint) : [];
      cur.updatedAt = nowIso;
      return { payload: { subscribed: cur.subs.length > 0, endpointCount: cur.subs.length } };
    });
    if (!resCas.ok) return resCas.response;
    return jsonResponse({ ok: true, subscribed: resCas.payload.subscribed, endpointCount: resCas.payload.endpointCount });
  }

  if (op === 'prefs') {
    const hasScopeField = Boolean(body && Object.prototype.hasOwnProperty.call(body, 'scopeKey'));
    if (hasScopeField) {
      const scPre = authorizeScopeKey(session, body.scopeKey);
      if (!scPre.ok) return jsonResponse({ ok: false, error: scPre.error }, scPre.status);
    }
    const resCas = await mutateSubsStoreCas(env.DB, userId, (store, nowIso) => {
      const cur = store.byUser[userId] || { subs: [], email: '', closeHourBeirut: 18, whatsappPhone: '', lang: 'en', scopeKey: '', lastSentDate: '' };
      const effScopeRaw = hasScopeField ? body.scopeKey : cur.scopeKey;
      const scAuth = authorizeScopeKey(session, effScopeRaw);
      if (!scAuth.ok) {
        return { abort: true, response: jsonResponse({ ok: false, error: scAuth.error }, scAuth.status) };
      }
      store.byUser[userId] = Object.assign({}, cur, {
        userId,
        email: String(session.email || cur.email || '').trim().toLowerCase(),
        closeHourBeirut: sanitizeCloseHour(body.closeHourBeirut != null ? body.closeHourBeirut : cur.closeHourBeirut),
        whatsappPhone: sanitizePhone(body.whatsappPhone != null ? body.whatsappPhone : cur.whatsappPhone),
        lang: sanitizeLang(body.lang != null ? body.lang : cur.lang),
        scopeKey: scAuth.scopeKey,
        attemptDate: '',
        retryAfterMs: 0,
        updatedAt: nowIso
      });
      return { payload: { scopeKey: scAuth.scopeKey } };
    });
    if (!resCas.ok) return resCas.response;
    return jsonResponse({ ok: true, scopeKey: resCas.payload.scopeKey });
  }

  if (op === 'test') {
    if (!vapid) {
      return jsonResponse({ ok: false, enabled: false, delivered: 0, error: 'Web Push VAPID configuration is incomplete.' }, 503);
    }
    const hasReqScope = Boolean(body && (Object.prototype.hasOwnProperty.call(body, 'scopeKey') || Object.prototype.hasOwnProperty.call(body, 'company')));
    let reqScopeKey = null;
    if (hasReqScope) {
      const rawReqScope = Object.prototype.hasOwnProperty.call(body, 'scopeKey') ? body.scopeKey : body.company;
      const scPre = authorizeScopeKey(session, rawReqScope);
      if (!scPre.ok) return jsonResponse({ ok: false, error: scPre.error }, scPre.status);
      reqScopeKey = scPre.scopeKey;
    }
    const subsRow = await readEdgeKvDoc(env.DB, PUSH_SUBS_KV_KEY);
    const store = readSubsStoreObj(subsRow);
    const cur = store.byUser[userId];
    const subs = cur && Array.isArray(cur.subs) ? cur.subs : [];
    if (!subs.length) return jsonResponse({ ok: false, error: 'No browser push subscription is active on this seat.' }, 400);
    const liveUser = await env.DB.prepare(
      'SELECT id, full_name, email, role, companies, pbi_access, statements_access, status, custom_perms FROM users WHERE id = ?1 OR lower(email) = ?2 LIMIT 1'
    ).bind(userId, String(session.email || cur.email || userId).trim().toLowerCase()).first();
    if (!liveUser || String(liveUser.status || 'Active') === 'Suspended') {
      return jsonResponse({ ok: false, error: 'Seat is inactive.' }, 403);
    }
    const beirut = getBeirutClockParts();
    const rawReqDate = String((body && (body.targetDate || body.date)) || '').trim();
    const effDate = /^\d{4}-\d{2}-\d{2}$/.test(rawReqDate) ? rawReqDate : beirut.date;
    const r2Cache = new Map();
    const lang = sanitizeLang(body && body.lang != null ? body.lang : cur.lang);
    const effCfg = Object.assign({}, cur, {
      lang,
      scopeKey: hasReqScope ? reqScopeKey : cur.scopeKey
    });
    const built = await computeServerDayCloseDigest(env, liveUser, effCfg, effDate, r2Cache);
    const fb = lang === 'ar'
      ? { title: `إغلاق اليوم · ${effDate}`, body: 'إشعارات متابعة إغلاق اليوم مفعّلة على هذا المتصفح.' }
      : (lang === 'fr'
        ? { title: `Clôture du jour · ${effDate}`, body: 'Les alertes de clôture sont actives sur ce navigateur.' }
        : { title: `Close of Day · ${effDate}`, body: 'Close-of-Day Needs Attention alerts are active on this browser.' });
    const payload = {
      title: built ? built.title : fb.title,
      body: built ? built.body : fb.body,
      url: './#daily_ops',
      tag: 'isabi-day-close-test'
    };
    const expiredEps = new Set();
    let delivered = 0;
    for (const s of subs) {
      const res = await sendEncryptedPush(s, payload, vapid).catch(e => ({ ok: false, status: 0, expired: false, error: String(e) }));
      if (res.ok) delivered++;
      if (res.expired && s && s.endpoint) expiredEps.add(s.endpoint);
    }
    let endpointCount = subs.length - expiredEps.size;
    if (expiredEps.size > 0) {
      const mRes = await mutateSubsStoreCas(env.DB, userId, (freshStore, nowIso) => {
        const fCur = freshStore.byUser[userId];
        if (!fCur || !Array.isArray(fCur.subs)) return { skipWrite: true, payload: { count: 0 } };
        fCur.subs = fCur.subs.filter(s => s && !expiredEps.has(s.endpoint));
        fCur.updatedAt = nowIso;
        return { payload: { count: fCur.subs.length } };
      });
      if (mRes.ok && mRes.payload) endpointCount = mRes.payload.count;
    }
    return jsonResponse({ ok: delivered > 0, delivered, endpointCount });
  }

  if (op === 'dispatch_due') {
    if (!isBuildTicket && !isOwnerOrFullGroupSession(session)) {
      return jsonResponse({ ok: false, error: 'Owner or build-ticket authorization required.' }, 403);
    }
    const beirut = getBeirutClockParts();
    const force = Boolean(body && body.force) && isOwnerOrFullGroupSession(session);
    const targetDate = (body && /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || ''))) ? String(body.date) : beirut.date;
    const effHour = (body && typeof body.hour === 'number' && Number.isFinite(body.hour) && body.hour >= 0 && body.hour <= 23)
      ? Math.floor(body.hour)
      : beirut.hour;
    if (!vapid) {
      return jsonResponse({ ok: true, enabled: false, date: targetDate, beirutHour: effHour, sentUsers: 0, sentEndpoints: 0, hasMore: false });
    }
    const maxBatch = Math.min(50, Math.max(1, Number(body && body.limit) || 25));
    const actor = isBuildTicket ? 'cron:day-close-push' : userId;
    const runToken = crypto.randomUUID();
    const claimDeadlineMs = Date.now() + 120000;

    // Phase A: Claim a bounded batch of due seats inside CAS before sending any external Web Push request.
    const isEligibleCfg = (cfg, nowMs) => {
      if (!cfg || !Array.isArray(cfg.subs) || !cfg.subs.length) return false;
      if (force) return true;
      if (effHour < sanitizeCloseHour(cfg.closeHourBeirut)) return false;
      if (String(cfg.lastSentDate || '') === targetDate) return false;
      if (String(cfg.claimDate || '') === targetDate && Number(cfg.claimUntilMs || 0) > nowMs) return false;
      if (String(cfg.attemptDate || '') === targetDate && Number(cfg.retryAfterMs || 0) > nowMs) return false;
      return true;
    };
    const claimCas = await mutateSubsStoreCas(env.DB, actor, (st, nowIso) => {
      const nowMs = Date.now();
      const allEligible = [];
      for (const [uid, cfg] of Object.entries(st.byUser || {})) {
        if (isEligibleCfg(cfg, nowMs)) allEligible.push([uid, cfg]);
      }
      const list = [];
      for (const [uid, cfg] of allEligible.slice(0, maxBatch)) {
        cfg.claimDate = targetDate;
        cfg.claimToken = runToken;
        cfg.claimUntilMs = nowMs + 120000;
        cfg.updatedAt = nowIso;
        list.push([uid, JSON.parse(JSON.stringify(cfg))]);
      }
      if (!list.length) return { skipWrite: true, payload: { list: [], eligibleCount: 0 } };
      return { payload: { list, eligibleCount: allEligible.length } };
    });
    if (!claimCas.ok) return claimCas.response;

    const dueEntries = (claimCas.payload && Array.isArray(claimCas.payload.list)) ? claimCas.payload.list : [];
    if (!dueEntries.length) {
      return jsonResponse({ ok: true, date: targetDate, beirutHour: effHour, sentUsers: 0, sentEndpoints: 0, hasMore: false });
    }

    const r2Cache = new Map();
    const expiredByUser = new Map();
    const sentDateByUser = new Map();
    const cooldownByUser = new Map();
    let sentUsers = 0;
    let sentEndpoints = 0;
    let stoppedEarly = false;

    // Phase B: Dispatch encrypted pushes in bounded 5-seat parallel chunks for seats claimed by this runToken.
    for (let i = 0; i < dueEntries.length; i += 5) {
      if (Date.now() > claimDeadlineMs - 15000) {
        stoppedEarly = true;
        break;
      }
      const batch = dueEntries.slice(i, i + 5);
      const batchResults = await Promise.all(batch.map(async ([uid, cfg]) => {
        try {
          const liveUser = await env.DB.prepare(
            'SELECT id, full_name, email, role, companies, pbi_access, statements_access, status, custom_perms FROM users WHERE id = ?1 OR lower(email) = ?2 LIMIT 1'
          ).bind(uid, String(cfg.email || uid).trim().toLowerCase()).first();
          if (!liveUser || String(liveUser.status || 'Active') === 'Suspended') {
            return { uid, deliveredUser: 0, cooldownMs: 60 * 60 * 1000, expiredSet: new Set() };
          }
          const digest = await computeServerDayCloseDigest(env, liveUser, cfg, targetDate, r2Cache);
          if (!digest) return { uid, deliveredUser: 0, cooldownMs: 60 * 60 * 1000, expiredSet: new Set() };
          const expiredSet = new Set();
          let deliveredUser = 0;
          const epResults = await Promise.all((cfg.subs || []).map(async (s) => {
            const res = await sendEncryptedPush(s, digest, vapid).catch(() => ({ ok: false, expired: false }));
            return { s, res };
          }));
          for (const { s, res } of epResults) {
            if (res.ok) deliveredUser++;
            if (res.expired && s && s.endpoint) expiredSet.add(s.endpoint);
          }
          return { uid, deliveredUser, cooldownMs: deliveredUser > 0 ? 0 : 15 * 60 * 1000, expiredSet };
        } catch {
          return { uid, deliveredUser: 0, cooldownMs: 15 * 60 * 1000, expiredSet: new Set() };
        }
      }));
      for (const br of batchResults) {
        if (br.expiredSet && br.expiredSet.size > 0) expiredByUser.set(br.uid, br.expiredSet);
        if (br.deliveredUser > 0) {
          sentDateByUser.set(br.uid, targetDate);
          sentUsers++;
          sentEndpoints += br.deliveredUser;
        } else if (!force && br.cooldownMs > 0) {
          cooldownByUser.set(br.uid, br.cooldownMs);
        }
      }
    }

    // Phase C: Release all claimed runTokens, prune 404/410 endpoints, stamp lastSentDate or skip cooldown, and compute accurate hasMore.
    const finCas = await mutateSubsStoreCas(env.DB, actor, (freshStore, nowIso) => {
      const nowMs = Date.now();
      for (const [uid] of dueEntries) {
        const fc = freshStore.byUser[uid];
        if (!fc) continue;
        if (fc.claimToken === runToken) {
          fc.claimDate = '';
          fc.claimToken = '';
          fc.claimUntilMs = 0;
          fc.updatedAt = nowIso;
        }
        const expSet = expiredByUser.get(uid);
        if (expSet && Array.isArray(fc.subs)) {
          fc.subs = fc.subs.filter(s => s && !expSet.has(s.endpoint));
          fc.updatedAt = nowIso;
        }
        const sd = sentDateByUser.get(uid);
        if (sd) {
          fc.lastSentDate = sd;
          fc.attemptDate = '';
          fc.retryAfterMs = 0;
          fc.updatedAt = nowIso;
        } else if (!force && cooldownByUser.has(uid)) {
          fc.attemptDate = targetDate;
          fc.retryAfterMs = nowMs + cooldownByUser.get(uid);
          fc.updatedAt = nowIso;
        }
      }
      let remainingEligible = 0;
      if (!force) {
        for (const cfg of Object.values(freshStore.byUser || {})) {
          if (isEligibleCfg(cfg, nowMs)) remainingEligible++;
        }
      }
      return { payload: { remainingEligible } };
    });
    if (!finCas.ok) return finCas.response;
    const rem = Number((finCas.payload && finCas.payload.remainingEligible) || 0);
    return jsonResponse({ ok: true, date: targetDate, beirutHour: effHour, sentUsers, sentEndpoints, hasMore: Boolean(rem > 0 || stoppedEarly) });
  }

  return jsonResponse({ ok: false, error: 'Unsupported day-close-push op.' }, 400);
}
