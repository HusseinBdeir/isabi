/**
 * ISABI Systems - Web Push for approval requests (WebCrypto only, no dependencies).
 *   RFC 8291 message encryption (aes128gcm, one record) + RFC 8292 VAPID (ES256 JWT, raw r||s).
 *   Endpoints: GET ./api/push/config, POST ./api/push/subscribe, POST ./api/push/unsubscribe.
 *   Sender: sendOverrideRequestPush() is called (through context.waitUntil) when an unlock request is
 *   created, decided, cancelled or found expired. Every recipient is re-checked with the same eligibility
 *   rule as the Approvals Inbox (passed in by d1_store.js), never the requester, and only on a seat whose
 *   subscribing session is still signed in.
 * Off switch: with any of VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT missing or malformed, config
 * answers { enabled: false }, subscribe stores nothing and the sender returns before reading anything.
 */

import { jsonResponse } from './security.js';

// ---------------------------------------------------------------------------------------------- bytes
const te = new TextEncoder();

export function b64uEncode(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64uDecode(str) {
  const raw = String(str == null ? '' : str).trim().replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!raw || /[^A-Za-z0-9+/]/.test(raw) || raw.length % 4 === 1) return null;
  try {
    const bin = atob(raw + '==='.slice((raw.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch (_) {
    return null;
  }
}

function concat(...arrs) {
  let n = 0;
  for (const a of arrs) n += a.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

async function hmacSha256(keyBytes, data) {
  const k = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

// HKDF (RFC 5869) for outputs up to 32 bytes: one expand block is enough here.
async function hkdf(salt, ikm, info, len) {
  const prk = await hmacSha256(salt, ikm);
  const okm = await hmacSha256(prk, concat(info, new Uint8Array([1])));
  return okm.slice(0, len);
}

async function sha256Hex(str) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(String(str))));
  return Array.from(d).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------------------------- RFC 8291
/**
 * Encrypts one Web Push message (Content-Encoding: aes128gcm, a single record).
 * opts.salt / opts.asKeyPair exist for the RFC 8291 Appendix A test vector; real sends leave them out.
 * Returns the full body: salt(16) | rs(4) | idlen(1) | as_public(65) | ciphertext.
 */
export async function encryptAes128gcm(uaPublicB64, authSecretB64, plaintext, opts = {}) {
  const uaPub = b64uDecode(uaPublicB64);
  const authSecret = b64uDecode(authSecretB64);
  if (!uaPub || uaPub.length !== 65 || uaPub[0] !== 4) throw new Error('bad p256dh');
  if (!authSecret || authSecret.length !== 16) throw new Error('bad auth');
  const plain = plaintext instanceof Uint8Array ? plaintext : te.encode(String(plaintext));
  const rs = Number(opts.recordSize || 4096);
  // One record: plaintext + 0x02 delimiter + 16-byte tag must fit in rs.
  if (plain.length + 1 + 16 > rs) throw new Error('payload too large');

  const asKeyPair = opts.asKeyPair || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', asKeyPair.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeyPair.privateKey, 256));

  const keyInfo = concat(te.encode('WebPush: info\0'), uaPub, asPub);
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);
  const salt = opts.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);

  const aes = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(plain, new Uint8Array([2]))));
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = asPub.length;
  return concat(header, asPub, cipher);
}

// ---------------------------------------------------------------------------------------------- VAPID
/** Reads and validates the three VAPID settings. Never throws; never returns the private key to callers outside. */
export function readVapidEnv(env) {
  const pub = String((env && env.VAPID_PUBLIC_KEY) || '').trim();
  const priv = String((env && env.VAPID_PRIVATE_KEY) || '').trim();
  const subject = String((env && env.VAPID_SUBJECT) || '').trim();
  if (!pub || !priv || !subject) return { enabled: false, reason: 'not_configured' };
  const pubBytes = b64uDecode(pub);
  const privBytes = b64uDecode(priv);
  if (!pubBytes || pubBytes.length !== 65 || pubBytes[0] !== 4 || !privBytes || privBytes.length !== 32) {
    return { enabled: false, reason: 'invalid_key' };
  }
  if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/i.test(subject)) return { enabled: false, reason: 'invalid_subject' };
  return { enabled: true, publicKey: b64uEncode(pubBytes), pubBytes, privBytes, subject };
}

const _signKeyCache = new Map(); // key pair -> Promise<CryptoKey|null> (null = private and public keys do not match)

async function vapidSigningKey(cfg) {
  const cacheKey = cfg.publicKey + '|' + b64uEncode(cfg.privBytes);
  if (_signKeyCache.has(cacheKey)) return _signKeyCache.get(cacheKey);
  const p = (async () => {
    try {
      const x = b64uEncode(cfg.pubBytes.slice(1, 33));
      const y = b64uEncode(cfg.pubBytes.slice(33, 65));
      const d = b64uEncode(cfg.privBytes);
      const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x, y, d, ext: false },
        { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
      // A key pair that does not belong together would sign tokens every push service rejects: prove it once.
      const probe = te.encode('isabi-vapid-self-check');
      const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, probe);
      const verKey = await crypto.subtle.importKey('raw', cfg.pubBytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      const good = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verKey, sig, probe);
      return good ? key : null;
    } catch (_) {
      return null;
    }
  })();
  _signKeyCache.set(cacheKey, p);
  if (_signKeyCache.size > 4) _signKeyCache.delete(_signKeyCache.keys().next().value);
  return p;
}

function hasAnyEnvVapidSetting(env) {
  if (!env || typeof env !== 'object') return false;
  return Boolean(
    String(env.VAPID_PUBLIC_KEY || '').trim() ||
    String(env.VAPID_PRIVATE_KEY || '').trim() ||
    String(env.VAPID_SUBJECT || '').trim()
  );
}

async function readKvVapidEnv(db) {
  if (!db) return null;
  try {
    const res = await db.prepare(
      "SELECT doc_key, payload_json FROM edge_kv_store WHERE doc_key = 'vapid_keypair_v1' OR doc_key LIKE 'vapid_keypair_v1__part_%' ORDER BY doc_key ASC"
    ).all();
    const rows = (res && res.results) || [];
    if (!rows.length || rows[0].doc_key !== 'vapid_keypair_v1') return null;
    const parsed = JSON.parse(rows.map(r => String(r.payload_json || '')).join(''));
    if (parsed && parsed.publicKeyB64Url && parsed.privateJwk && parsed.privateJwk.d) {
      return {
        VAPID_PUBLIC_KEY: String(parsed.publicKeyB64Url),
        VAPID_PRIVATE_KEY: String(parsed.privateJwk.d),
        VAPID_SUBJECT: 'mailto:ops@isabisystems.com'
      };
    }
  } catch (_) {}
  return null;
}

/** Full check (format + the two halves belong together). Falls back to Day-Close D1 keypair when env vars are unset. */
export async function vapidReady(env) {
  let cfg;
  if (hasAnyEnvVapidSetting(env)) {
    cfg = readVapidEnv(env);
  } else if (env && env.DB) {
    const kvEnv = await readKvVapidEnv(env.DB);
    cfg = kvEnv ? readVapidEnv(kvEnv) : { enabled: false, reason: 'not_configured' };
  } else {
    cfg = readVapidEnv(env);
  }
  if (!cfg.enabled) return cfg;
  const key = await vapidSigningKey(cfg);
  return key ? Object.assign({}, cfg, { key }) : { enabled: false, reason: 'invalid_key' };
}

const VAPID_TOKEN_LIFETIME_SEC = 12 * 3600; // RFC 8292: at most 24 hours

/** Authorization header value for one push service origin: `vapid t=<jwt>, k=<public key>`. */
export async function vapidAuthorization(endpoint, cfg, nowSec = Math.floor(Date.now() / 1000)) {
  const u = new URL(endpoint);
  const aud = `${u.protocol}//${u.host}`;
  const header = b64uEncode(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64uEncode(te.encode(JSON.stringify({ aud, exp: nowSec + VAPID_TOKEN_LIFETIME_SEC, sub: cfg.subject })));
  const unsigned = `${header}.${claims}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cfg.key, te.encode(unsigned)));
  return `vapid t=${unsigned}.${b64uEncode(sig)}, k=${cfg.publicKey}`;
}

// ---------------------------------------------------------------------------------------------- subscriptions
const MAX_ENDPOINT_CHARS = 1024;
const MAX_BODY_CHARS = 4096;
const MAX_SUBS_PER_SEAT = 10;
const SESSION_MAX_AGE_MS = 14 * 86400000; // the Edge session lifetime (signEdgeSession default)
const SEND_CAP = 50;
const SEND_TIMEOUT_MS = 8000;
const PUSH_TTL_SEC = 600; // requests expire after 10 minutes
const JOB_BUDGET_MS = 18000; // stop starting new batches after this (waitUntil work has about 30 s)

/** Only real push services, over https on 443, with no credentials in the URL. */
export function isAllowedPushEndpoint(raw) {
  const s = String(raw || '');
  if (!s || s.length > MAX_ENDPOINT_CHARS) return false;
  let u;
  try { u = new URL(s); } catch (_) { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || u.hash) return false;
  if (u.port && u.port !== '443') return false;
  const h = u.hostname.toLowerCase();
  const p = u.pathname;
  if (h === 'web.push.apple.com' || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.push\.apple\.com$/.test(h)) return p.length > 1;
  if (h === 'fcm.googleapis.com') return p.startsWith('/fcm/send/') || p.startsWith('/wp/');
  if (h === 'updates.push.services.mozilla.com') return p.startsWith('/wpush/');
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com$/.test(h)) return p.startsWith('/w/');
  return false;
}

let _pushSchemaReady = false;
export async function ensurePushSchema(db) {
  if (!db || _pushSchemaReady) return;
  try {
    await db.batch([
      db.prepare(
        `CREATE TABLE IF NOT EXISTS push_subscriptions (
           id TEXT PRIMARY KEY,
           endpoint TEXT NOT NULL UNIQUE,
           user_id TEXT NOT NULL DEFAULT '',
           session_id TEXT NOT NULL DEFAULT '',
           p256dh TEXT NOT NULL DEFAULT '',
           auth TEXT NOT NULL DEFAULT '',
           lang TEXT NOT NULL DEFAULT 'en',
           key_fp TEXT NOT NULL DEFAULT '',
           created_at TEXT NOT NULL DEFAULT '',
           updated_at TEXT NOT NULL DEFAULT '',
           last_sent_at TEXT DEFAULT '',
           last_status INTEGER DEFAULT 0,
           fail_count INTEGER DEFAULT 0
         )`
      ),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id, updated_at)')
    ]);
    _pushSchemaReady = true;
  } catch (_) {}
}

function normLang(v) {
  const l = String(v || '').trim().toLowerCase().slice(0, 2);
  return l === 'ar' || l === 'fr' ? l : 'en';
}

async function keyFingerprint(publicKey) {
  return (await sha256Hex('vapid:' + publicKey)).slice(0, 16);
}

function isOwnerRole(session) {
  return Boolean(session && /owner/i.test(String(session.role || '')));
}

/** ./api/push/{config,subscribe,unsubscribe}. The router only calls this for a signed-in seat. */
export async function handlePushApi(request, env, session, body, subPath) {
  if (!session) return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  const me = String(session.sub || '').trim();
  if (!me) return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  const isDemo = request.headers.get('X-ISABI-Demo') === '1';

  if (subPath === '/push/config' && request.method === 'GET') {
    if (isDemo) return jsonResponse({ ok: true, enabled: false, publicKey: '', reason: 'demo' });
    const cfg = await vapidReady(env);
    return jsonResponse({
      ok: true,
      enabled: Boolean(cfg.enabled),
      publicKey: cfg.enabled ? cfg.publicKey : '',
      // The only reason a viewer can act on; an Owner is told notifications are not set up yet.
      reason: cfg.enabled ? '' : 'not_configured',
      can_setup: isOwnerRole(session)
    });
  }

  if (request.method !== 'POST' || (subPath !== '/push/subscribe' && subPath !== '/push/unsubscribe')) {
    return jsonResponse({ ok: false, error: 'Not found', path: subPath }, 404);
  }
  if (isDemo) return jsonResponse({ ok: false, error: 'Notifications are disabled for demo sandbox headers.' }, 403);
  let bodyChars = 0;
  try { bodyChars = JSON.stringify(body || {}).length; } catch (_) { bodyChars = Infinity; }
  if (bodyChars > MAX_BODY_CHARS) return jsonResponse({ ok: false, error: 'Request payload exceeds size limit.' }, 413);
  if (!env || !env.DB) return jsonResponse({ ok: false, error: 'Edge database unavailable.' }, 503);
  const db = env.DB;
  const endpoint = String((body && body.endpoint) || '').trim();
  if (!isAllowedPushEndpoint(endpoint)) {
    return jsonResponse({ ok: false, error: 'This push service address is not accepted.' }, 400);
  }

  if (subPath === '/push/unsubscribe') {
    await ensurePushSchema(db);
    // A seat removes only its own row; another seat's endpoint answers the same as an unknown one.
    const r = await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1 AND user_id = ?2').bind(endpoint, me).run();
    return jsonResponse({ ok: true, removed: Number((r && r.meta && r.meta.changes) || 0) });
  }

  const cfg = await vapidReady(env);
  if (!cfg.enabled) return jsonResponse({ ok: true, enabled: false, stored: false });
  const keys = (body && typeof body.keys === 'object' && body.keys) || {};
  const p256dh = String(keys.p256dh || (body && body.p256dh) || '').trim();
  const auth = String(keys.auth || (body && body.auth) || '').trim();
  const pk = b64uDecode(p256dh);
  const as = b64uDecode(auth);
  if (!pk || pk.length !== 65 || pk[0] !== 4 || p256dh.length > 120) {
    return jsonResponse({ ok: false, error: 'The device key is not valid.' }, 400);
  }
  if (!as || as.length !== 16 || auth.length > 40) {
    return jsonResponse({ ok: false, error: 'The device secret is not valid.' }, 400);
  }
  // The key the device actually subscribed with: a subscription made under an older key would be refused by
  // the push service, so it is not stored as if it were current (the client then subscribes again).
  const serverKey = String((body && body.server_key) || '').trim();
  if (serverKey) {
    const sk = b64uDecode(serverKey);
    if (!sk || b64uEncode(sk) !== cfg.publicKey) {
      return jsonResponse({ ok: false, stale_key: true, error: 'This device subscribed with an older key.' }, 409);
    }
  }
  await ensurePushSchema(db);
  const nowIso = new Date().toISOString();
  const id = 'ps-' + (await sha256Hex(endpoint)).slice(0, 32);
  // Language: as sent; otherwise kept from this device's row, or from the row it replaces (the browser renewed
  // the subscription in the background, where the language is not known).
  let lang = (body && typeof body.lang === 'string' && body.lang.trim()) ? normLang(body.lang) : '';
  const replaces = String((body && body.replaces) || '').trim();
  const ownLang = async (ep) => {
    if (!ep || !isAllowedPushEndpoint(ep)) return '';
    const r = await db.prepare('SELECT lang FROM push_subscriptions WHERE endpoint = ?1 AND user_id = ?2 LIMIT 1').bind(ep, me).first();
    return r ? normLang(r.lang) : '';
  };
  if (!lang) lang = (await ownLang(endpoint)) || (await ownLang(replaces)) || 'en';
  if (replaces && replaces !== endpoint && isAllowedPushEndpoint(replaces)) {
    await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1 AND user_id = ?2').bind(replaces, me).run();
  }
  const fp = await keyFingerprint(cfg.publicKey);
  const sid = String(session.sid || '').slice(0, 120);
  // One row per endpoint: the seat signed in on the device now owns it (a shared device follows its last seat).
  await db.prepare(
    `INSERT INTO push_subscriptions (id, endpoint, user_id, session_id, p256dh, auth, lang, key_fp, created_at, updated_at, last_status, fail_count)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, 0, 0)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, session_id = excluded.session_id, p256dh = excluded.p256dh,
       auth = excluded.auth, lang = excluded.lang, key_fp = excluded.key_fp, updated_at = excluded.updated_at, fail_count = 0`
  ).bind(id, endpoint, me, sid, p256dh, auth, lang, fp, nowIso).run();
  // At most MAX_SUBS_PER_SEAT devices per seat: the oldest ones go.
  await db.prepare(
    `DELETE FROM push_subscriptions WHERE user_id = ?1 AND id NOT IN (
       SELECT id FROM push_subscriptions WHERE user_id = ?1 ORDER BY updated_at DESC, id DESC LIMIT ?2)`
  ).bind(me, MAX_SUBS_PER_SEAT).run();
  return jsonResponse({ ok: true, enabled: true, stored: true });
}

// ---------------------------------------------------------------------------------------------- message text
// Built here so a lock screen never shows anything the requester typed (no reason, no record number, no amount).
const FIELD_NAMES = {
  f_unitprice: ['Unit Price', 'سعر الوحدة', 'Prix unitaire'],
  f_price: ['Unit Price', 'سعر الوحدة', 'Prix unitaire'],
  f_transunitprice: ['Transport Unit Price', 'سعر وحدة النقل', 'Prix unitaire du transport'],
  f_qty: ['Quantity', 'الكمية', 'Quantité'],
  f_uom: ['Unit (UoM)', 'الوحدة', 'Unité'],
  f_malf_uom: ['Unit (UoM)', 'الوحدة', 'Unité'],
  f_mat_total: ['Material Total', 'إجمالي المادة', 'Total matière'],
  f_trans_total: ['Transport Total', 'إجمالي النقل', 'Total transport'],
  f_total_usd: ['Total (USD)', 'الإجمالي (دولار)', 'Total (USD)'],
  f_fxrate: ['FX Rate', 'سعر الصرف', 'Taux FX'],
  f_driver: ['Driver', 'السائق', 'Chauffeur'],
  f_truck: ['Truck', 'الشاحنة', 'Camion'],
  f_truckowner: ['Truck Owner', 'مالك الشاحنة', 'Propriétaire du camion'],
  f_method: ['Payment Method', 'طريقة الدفع', 'Mode de paiement'],
  f_amount: ['Amount', 'المبلغ', 'Montant'],
  f_date: ['Date', 'التاريخ', 'Date'],
  f_vatinvoice: ['VAT Invoice Number', 'رقم فاتورة الضريبة', 'Numéro de facture TVA'],
  f_siteowner: ['Site Owner', 'مالك الموقع', 'Propriétaire du site']
};
const FORM_NAMES = {
  sales: ['Sales Ticket', 'إيصال مبيعات', 'Bon de vente'],
  raw: ['Raw Material Ticket', 'إيصال مواد أولية', 'Bon matières premières'],
  fuel: ['Fuel & Lubricant Intake', 'حركة محروقات وزيوت', 'Mouvement carburant et huile'],
  malfunction: ['Malfunction & Discrepancy', 'عطل وتباين', 'Panne et écart'],
  expense: ['Expense', 'مصروف', 'Dépense'],
  receipt: ['Customer Settlement', 'سند قبض عميل', 'Encaissement client'],
  settlement: ['Supplier Settlement', 'سند دفع مورّد', 'Règlement fournisseur']
};
const LANG_IDX = { en: 0, ar: 1, fr: 2 };

function pick(triple, lang) { return triple[LANG_IDX[lang] || 0]; }

/** Text for one recipient. Exported for the gate. */
export function buildOverridePushPayload(reqRow, kind, lang, badge) {
  const l = normLang(lang);
  const name = String(reqRow.caller_name || '').trim().slice(0, 60) || pick(['A team member', 'أحد أعضاء الفريق', "Un membre de l'équipe"], l);
  const field = Number(reqRow.unlock_all)
    ? pick(['all locked fields', 'كل الحقول المقفلة', 'tous les champs verrouillés'], l)
    : (FIELD_NAMES[String(reqRow.field_id || '')] ? pick(FIELD_NAMES[String(reqRow.field_id)], l) : pick(['a locked field', 'حقلاً مقفلاً', 'un champ verrouillé'], l));
  const formT = FORM_NAMES[String(reqRow.form_key || '')];
  const form = formT ? pick(formT, l) : '';
  const id = String(reqRow.id || '');
  const tag = 'apv-' + id;
  const base = { v: 1, id, tag, url: '/app/#approvals', badge: Math.max(0, Number(badge) || 0), lang: l };
  if (kind === 'new') {
    const body = l === 'ar'
      ? (form ? `يطلب ${name} فتح ${field} في ${form}` : `يطلب ${name} فتح ${field}`)
      : (l === 'fr'
        ? (form ? `${name} demande à déverrouiller ${field} sur ${form}` : `${name} demande à déverrouiller ${field}`)
        : (form ? `${name} asks to unlock ${field} on ${form}` : `${name} asks to unlock ${field}`));
    return Object.assign(base, {
      kind: 'apv_new',
      title: pick(['Approval needed', 'موافقة مطلوبة', 'Approbation requise'], l),
      body,
      expires_at: String(reqRow.expires_at || '')
    });
  }
  const st = String(reqRow.status || '');
  const outcome = {
    approved: ['approved', 'تمت الموافقة عليه', 'approuvée'],
    denied: ['declined', 'تم رفضه', 'refusée'],
    cancelled: ['withdrawn', 'تم سحبه', 'retirée'],
    expired: ['expired', 'انتهت مهلته', 'expirée']
  }[st] || ['closed', 'أُغلق', 'clôturée'];
  const body = l === 'ar'
    ? `طلب ${name} لفتح ${field}: ${pick(outcome, l)}.`
    : (l === 'fr' ? `Demande de ${name} pour ${field} : ${pick(outcome, l)}.` : `${name}'s request to unlock ${field} was ${pick(outcome, l)}.`);
  return Object.assign(base, {
    kind: 'apv_closed',
    status: st,
    title: pick(['Request closed', 'أُغلق الطلب', 'Demande clôturée'], l),
    body
  });
}

/** A push-service Topic (at most 32 base64url characters): one per request, so a queued message is replaced. */
export async function topicForRequest(id) {
  return 'apv' + (await sha256Hex('apv:' + String(id || ''))).slice(0, 29);
}

/** One HTTP POST to a push service. Returns the status code, or 0 on a network error or timeout. */
export async function postWebPush(endpoint, bodyBytes, { authorization, ttl, urgency, topic, fetchImpl }) {
  if (!isAllowedPushEndpoint(endpoint)) return 0;
  const f = fetchImpl || fetch;
  try {
    const res = await f(endpoint, {
      method: 'POST',
      redirect: 'manual', // a push service never redirects; following one would leave the allowlist
      headers: {
        Authorization: authorization,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(Math.max(0, Math.min(2419200, Math.floor(Number(ttl) || 0)))),
        Urgency: urgency || 'normal',
        Topic: topic
      },
      body: bodyBytes,
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
    });
    try { await res.arrayBuffer(); } catch (_) {}
    return Number(res.status || 0);
  } catch (_) {
    return 0;
  }
}

/**
 * Sends the "approval needed" (kind 'new') or "request closed" (kind 'closed') notification for one override
 * request to every eligible approver's devices. deps:
 *   isEligible(approverRow, callerRow, reqRow) -> boolean   (the Approvals Inbox rule from d1_store.js)
 *   loadUserRowById(id) -> users row | null
 *   fetchImpl, nowMs, budgetMs (tests only)
 * Never throws. Returns { sent, removed, skipped } for the gate.
 */
export async function sendOverrideRequestPush(env, reqRow, kind, deps = {}) {
  const out = { sent: 0, removed: 0, skipped: 0, attempted: 0 };
  try {
    if (!reqRow || !reqRow.id || !env || !env.DB) return out;
    const cfg = await vapidReady(env);
    if (!cfg.enabled) return out;
    const db = env.DB;
    await ensurePushSchema(db);
    const nowMs = Number(deps.nowMs) || Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const subs = ((await db.prepare(
      'SELECT id, endpoint, user_id, session_id, p256dh, auth, lang, key_fp FROM push_subscriptions ORDER BY updated_at DESC LIMIT 500'
    ).all()).results) || [];
    if (!subs.length) return out;

    const users = new Map();
    const userRow = async (uid) => {
      const k = String(uid || '');
      if (!users.has(k)) users.set(k, k ? ((await deps.loadUserRowById(k)) || null) : null);
      return users.get(k);
    };
    const callerId = String(reqRow.caller_user_id || '');
    const callerRow = await userRow(callerId);
    const fp = await keyFingerprint(cfg.publicKey);
    const sessionAlive = new Map();
    const sessionOk = async (sid, uid) => {
      const k = `${sid}|${uid}`;
      if (!sessionAlive.has(k)) {
        let ok = false;
        if (sid) {
          try {
            const s = await db.prepare('SELECT logged_in_at FROM auth_sessions WHERE id = ?1 AND user_id = ?2 LIMIT 1').bind(sid, uid).first();
            const t = s ? Date.parse(String(s.logged_in_at || '')) : NaN;
            ok = Boolean(s) && (!Number.isFinite(t) || nowMs - t < SESSION_MAX_AGE_MS);
          } catch (_) { ok = false; }
        }
        sessionAlive.set(k, ok);
      }
      return sessionAlive.get(k);
    };

    const stale = [];
    const recipients = [];
    for (const s of subs) {
      const uid = String(s.user_id || '');
      if (!uid || uid === callerId) { out.skipped++; continue; }
      if (s.key_fp !== fp) { stale.push(s.id); continue; } // made under a previous key: the push service would refuse it
      if (!isAllowedPushEndpoint(s.endpoint)) { stale.push(s.id); continue; }
      if (!(await sessionOk(String(s.session_id || ''), uid))) { stale.push(s.id); continue; } // signed out or expired
      const ap = await userRow(uid);
      if (!ap || !deps.isEligible(ap, callerRow, reqRow)) { out.skipped++; continue; }
      recipients.push({ s, ap });
      if (recipients.length >= SEND_CAP) break;
    }

    // Badge = requests still waiting on that seat, by the same rule.
    let pendingRows = [];
    try {
      pendingRows = ((await db.prepare(
        "SELECT * FROM override_requests WHERE status = 'pending' AND expires_at > ?1 ORDER BY created_at DESC LIMIT 300"
      ).bind(nowIso).all()).results) || [];
    } catch (_) { pendingRows = []; }
    const badgeFor = new Map();
    const badge = async (ap) => {
      const k = String(ap.id || '');
      if (!badgeFor.has(k)) {
        let n = 0;
        for (const r of pendingRows) {
          if (deps.isEligible(ap, await userRow(r.caller_user_id), r)) n++;
        }
        badgeFor.set(k, n);
      }
      return badgeFor.get(k);
    };

    // Rows that cannot be delivered (old key, signed out) go first, whatever happens to the sends below.
    const staleIds = Array.from(new Set(stale));
    if (staleIds.length) {
      await db.batch(staleIds.map(id => db.prepare('DELETE FROM push_subscriptions WHERE id = ?1').bind(id)));
      out.removed += staleIds.length;
    }

    // A request answered or withdrawn while this job was starting must not raise a fresh "Approval needed"
    // banner after its close: send the close instead (same tag, so it replaces whatever the device shows).
    let sendRow = reqRow;
    let sendKind = kind;
    if (kind === 'new') {
      try {
        const cur = await db.prepare('SELECT status FROM override_requests WHERE id = ?1 LIMIT 1').bind(reqRow.id).first();
        const st = cur ? String(cur.status || '') : 'cancelled';
        if (st !== 'pending') { sendKind = 'closed'; sendRow = Object.assign({}, reqRow, { status: st }); }
      } catch (_) { /* keep 'new' */ }
    }

    const topic = await topicForRequest(reqRow.id);
    const expMs = Date.parse(String(reqRow.expires_at || ''));
    const ttl = sendKind === 'new'
      ? Math.max(30, Math.min(PUSH_TTL_SEC, Number.isFinite(expMs) ? Math.floor((expMs - nowMs) / 1000) : PUSH_TTL_SEC))
      : PUSH_TTL_SEC;
    const authCache = new Map();
    const authFor = async (endpoint) => {
      const origin = new URL(endpoint).origin;
      if (!authCache.has(origin)) authCache.set(origin, await vapidAuthorization(endpoint, cfg, Math.floor(nowMs / 1000)));
      return authCache.get(origin);
    };

    // Batches of 10 in parallel, results written after each batch, and no new batch once the job has used its
    // time budget (background work after a response is limited; a hanging push service must not starve it).
    const startedAt = Date.now();
    for (let i = 0; i < recipients.length; i += 10) {
      if (Date.now() - startedAt > (Number.isFinite(deps.budgetMs) ? deps.budgetMs : JOB_BUDGET_MS)) { out.skipped += recipients.length - i; break; }
      const chunk = recipients.slice(i, i + 10);
      const results = await Promise.all(chunk.map(async ({ s, ap }) => {
        out.attempted++;
        let status = 0;
        try {
          const payload = buildOverridePushPayload(sendRow, sendKind, s.lang, await badge(ap));
          const bodyBytes = await encryptAes128gcm(s.p256dh, s.auth, JSON.stringify(payload));
          status = await postWebPush(s.endpoint, bodyBytes, {
            authorization: await authFor(s.endpoint),
            ttl,
            urgency: sendKind === 'new' ? 'high' : 'normal',
            topic,
            fetchImpl: deps.fetchImpl
          });
        } catch (_) { status = 0; }
        return { s, status };
      }));
      const stmts = [];
      for (const { s, status } of results) {
        if (status === 404 || status === 410) {
          stmts.push(db.prepare('DELETE FROM push_subscriptions WHERE id = ?1').bind(s.id)); // unsubscribed or expired
          out.removed++;
        } else if (status >= 200 && status < 300) {
          out.sent++;
          stmts.push(db.prepare('UPDATE push_subscriptions SET last_sent_at = ?2, last_status = ?3, fail_count = 0 WHERE id = ?1').bind(s.id, nowIso, status));
        } else {
          stmts.push(db.prepare('UPDATE push_subscriptions SET last_status = ?2, fail_count = COALESCE(fail_count, 0) + 1 WHERE id = ?1').bind(s.id, status));
        }
      }
      // A subscription refused 5 times in a row (bad key, revoked) is dropped.
      stmts.push(db.prepare('DELETE FROM push_subscriptions WHERE fail_count >= 5'));
      await db.batch(stmts);
    }
  } catch (_) {
    // Notifications are best effort: the request itself already succeeded.
  }
  return out;
}

/** Cheap synchronous gate used before scheduling any work. */
export function isWebPushConfigured(env) {
  if (hasAnyEnvVapidSetting(env)) return readVapidEnv(env).enabled;
  return Boolean(env && env.DB);
}
