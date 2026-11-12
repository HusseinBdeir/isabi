// Offline gate for Web Push on approval requests (functions/_lib/web_push.js + the override-request hooks in
// functions/_lib/d1_store.js), driven through the real router (functions/app/api/[[route]].js) against an
// in-memory SQLite database standing in for D1. Outbound push traffic goes to a mocked fetch; nothing live is
// touched, no dev server, no port. The VAPID key pair below is minted in memory for this run and thrown away.
//   1. RFC 8291 Appendix A test vector reproduced byte for byte; a random message decrypts with an independent HKDF.
//   2. VAPID (RFC 8292): ES256 JWT, raw r||s signature that verifies with the public key, aud = push origin, exp <= 24 h.
//   3. ./api/push/config: refused without a session; disabled when any VAPID setting is missing or broken.
//   4. ./api/push/subscribe + unsubscribe: endpoint allowlist, key checks, size limit, one row per endpoint,
//      per-seat cap, a seat removes only its own row.
//   5. Sending: only eligible approvers (never the requester, never a seat without the company), headers,
//      lock-screen-safe payload in the subscriber's language, 404/410 delete the row, signed-out session and
//      old-key rows are dropped, decided / cancelled / expired requests send a quiet close, the request call
//      returns before the push finishes, and zero sends when the key is missing.
// Run: node build/verify_web_push.mjs      (Node 22.5+ for node:sqlite)

import { DatabaseSync } from 'node:sqlite';
import nodeCrypto from 'node:crypto';
import { onRequest } from '../functions/app/api/[[route]].js';
import { signEdgeSession } from '../functions/_lib/security.js';
import {
  b64uDecode, b64uEncode, buildOverridePushPayload, encryptAes128gcm, isAllowedPushEndpoint,
  readVapidEnv, topicForRequest, vapidAuthorization, vapidReady
} from '../functions/_lib/web_push.js';

// ---- minimal D1 stand-in (same binding rules as build/verify_phase5_api.mjs; batch is one transaction) ----
class Stmt {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...p) { if (p.length > 100) throw new Error(`D1 allows 100 bound values per statement, got ${p.length}`); return new Stmt(this.db, this.sql, p); }
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
  async all() { return { results: this.db.prepare(this.sql).all(...this.args()) }; }
  async run() { const r = this.db.prepare(this.sql).run(...this.args()); return { success: true, meta: { changes: r.changes } }; }
  runSync() {
    if (/^\s*(SELECT|WITH)\b/i.test(this.sql)) return { results: this.db.prepare(this.sql).all(...this.args()) };
    const r = this.db.prepare(this.sql).run(...this.args()); return { success: true, results: [], meta: { changes: r.changes } };
  }
}
class D1 {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  prepare(sql) { return new Stmt(this.db, sql); }
  async batch(stmts) {
    this.db.exec('BEGIN');
    try { const out = stmts.map(s => s.runSync()); this.db.exec('COMMIT'); return out; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  exec(sql) { this.db.exec(sql); }
  one(sql, ...p) { return this.db.prepare(sql).get(...p); }
  rows(sql, ...p) { return this.db.prepare(sql).all(...p); }
}

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail, (k, v) => (v instanceof Uint8Array ? `<${v.length} bytes>` : v)).slice(0, 500) : '')); }
}
const te = new TextEncoder();
const td = new TextDecoder();

// ---- throwaway VAPID key pair for this run (node:crypto, independent of the code under test) ----
function mintVapid() {
  const { privateKey } = nodeCrypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = privateKey.export({ format: 'jwk' });
  const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
  return { VAPID_PUBLIC_KEY: pub.toString('base64url'), VAPID_PRIVATE_KEY: jwk.d, jwk };
}
const V1 = mintVapid();
const SUBJECT = 'mailto:push-test@example.test';

// ---- independent decrypt (node:crypto hkdfSync + AES-GCM) ----
function decryptPush(body, ua) {
  const b = Buffer.from(body);
  const salt = b.subarray(0, 16);
  const rs = b.readUInt32BE(16);
  const idlen = b[20];
  const asPub = b.subarray(21, 21 + idlen);
  const ct = b.subarray(21 + idlen);
  const ecdh = nodeCrypto.createECDH('prime256v1');
  ecdh.setPrivateKey(ua.priv);
  const shared = ecdh.computeSecret(asPub);
  const ikm = Buffer.from(nodeCrypto.hkdfSync('sha256', shared, ua.auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua.pub, asPub]), 32));
  const cek = Buffer.from(nodeCrypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(nodeCrypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = nodeCrypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--;
  if (plain[end] !== 2) throw new Error('bad padding delimiter');
  return { rs, idlen, text: plain.subarray(0, end).toString('utf8') };
}
function newUaKeys() {
  const ecdh = nodeCrypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return { pub: ecdh.getPublicKey(), priv: ecdh.getPrivateKey(), auth: nodeCrypto.randomBytes(16) };
}

// =====================================================================================================
console.log('\n[1] RFC 8291 Appendix A');
{
  const asPub = b64uDecode('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
  const asKeyPair = {
    publicKey: await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
    privateKey: await crypto.subtle.importKey('jwk', {
      kty: 'EC', crv: 'P-256', x: b64uEncode(asPub.slice(1, 33)), y: b64uEncode(asPub.slice(33)), d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'
    }, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  };
  const out = await encryptAes128gcm(
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    'BTBZMqHH6r4Tts7J_aSIgg',
    'When I grow up, I want to be a watermelon',
    { salt: b64uDecode('DGv6ra1nlYgDCS1FRnbzlw'), asKeyPair }
  );
  const EXPECT = 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN';
  ok('Appendix A message reproduced byte for byte (144 bytes)', b64uEncode(out) === EXPECT && out.length === 144, b64uEncode(out));
  const ua = { priv: Buffer.from('q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94', 'base64url'), pub: Buffer.from(b64uDecode('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4')), auth: Buffer.from(b64uDecode('BTBZMqHH6r4Tts7J_aSIgg')) };
  const d = decryptPush(out, ua);
  ok('Appendix A message decrypts with the user agent private key', d.text === 'When I grow up, I want to be a watermelon' && d.rs === 4096 && d.idlen === 65, d);
  const k2 = newUaKeys();
  const msg = JSON.stringify({ hello: 'عربي et français', n: 42 });
  const r = await encryptAes128gcm(b64uEncode(k2.pub), b64uEncode(k2.auth), msg);
  ok('a random-salt message decrypts with an independent HKDF/AES-GCM', decryptPush(r, k2).text === msg);
  const r2 = await encryptAes128gcm(b64uEncode(k2.pub), b64uEncode(k2.auth), msg);
  ok('two encryptions of the same text differ (fresh salt and sender key)', b64uEncode(r) !== b64uEncode(r2));
  let threw = 0;
  for (const [p, a] of [['AAAA', b64uEncode(k2.auth)], [b64uEncode(k2.pub), 'AAAA'], [b64uEncode(k2.pub.subarray(1)), b64uEncode(k2.auth)]]) {
    try { await encryptAes128gcm(p, a, 'x'); } catch (_) { threw++; }
  }
  ok('NEGATIVE: malformed device key or secret refused', threw === 3, threw);
  let big = false;
  try { await encryptAes128gcm(b64uEncode(k2.pub), b64uEncode(k2.auth), 'x'.repeat(4080)); } catch (_) { big = true; }
  ok('NEGATIVE: a payload that does not fit one 4096-byte record is refused', big);
}

// =====================================================================================================
console.log('\n[2] VAPID (RFC 8292)');
{
  const env = { VAPID_PUBLIC_KEY: V1.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: V1.VAPID_PRIVATE_KEY, VAPID_SUBJECT: SUBJECT };
  const cfg = await vapidReady(env);
  ok('a matching key pair is ready', cfg.enabled === true && cfg.publicKey === V1.VAPID_PUBLIC_KEY, cfg.reason);
  const now = Math.floor(Date.now() / 1000);
  const endpoint = 'https://fcm.googleapis.com/fcm/send/abc123:def';
  const hdr = await vapidAuthorization(endpoint, cfg, now);
  const m = /^vapid t=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+), k=([A-Za-z0-9_-]+)$/.exec(hdr);
  ok('header is "vapid t=<jwt>, k=<public key>"', Boolean(m) && m[4] === V1.VAPID_PUBLIC_KEY, hdr.slice(0, 80));
  const jh = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
  const jc = JSON.parse(Buffer.from(m[2], 'base64url').toString('utf8'));
  const sig = Buffer.from(m[3], 'base64url');
  ok('JWT header is ES256', jh.alg === 'ES256' && jh.typ === 'JWT', jh);
  ok('aud is the push service origin only', jc.aud === 'https://fcm.googleapis.com', jc);
  ok('exp is in the future and at most 24 h ahead', jc.exp > now && jc.exp - now <= 86400, jc);
  ok('sub is the configured contact', jc.sub === SUBJECT, jc);
  ok('signature is raw r||s (64 bytes)', sig.length === 64, sig.length);
  const verified = nodeCrypto.verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key: { kty: 'EC', crv: 'P-256', x: V1.jwk.x, y: V1.jwk.y }, format: 'jwk', dsaEncoding: 'ieee-p1363' }, sig);
  ok('signature verifies with the public key (node:crypto, independent of the code under test)', verified);
  const tampered = nodeCrypto.verify('sha256', Buffer.from(`${m[1]}.${m[2]}x`), { key: { kty: 'EC', crv: 'P-256', x: V1.jwk.x, y: V1.jwk.y }, format: 'jwk', dsaEncoding: 'ieee-p1363' }, sig);
  ok('NEGATIVE: the signature does not verify for altered claims', !tampered);
  const apple = await vapidAuthorization('https://web.push.apple.com/QGuQyavXutnMp', cfg, now);
  const ac = JSON.parse(Buffer.from(apple.split(' ')[1].slice(2).split('.')[1], 'base64url').toString('utf8'));
  ok('aud follows the endpoint (Apple)', ac.aud === 'https://web.push.apple.com', ac);
  const other = mintVapid();
  const mismatched = await vapidReady({ VAPID_PUBLIC_KEY: V1.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: other.VAPID_PRIVATE_KEY, VAPID_SUBJECT: SUBJECT });
  ok('NEGATIVE: a private key that does not belong to the public key disables push', mismatched.enabled === false, mismatched);
  ok('NEGATIVE: a subject that is not mailto: or https: disables push', readVapidEnv(Object.assign({}, env, { VAPID_SUBJECT: 'push-test@example.test' })).enabled === false);
  ok('NEGATIVE: a truncated public key disables push', readVapidEnv(Object.assign({}, env, { VAPID_PUBLIC_KEY: V1.VAPID_PUBLIC_KEY.slice(0, 40) })).enabled === false);
}

// =====================================================================================================
// Router fixture
const d1 = new D1();
d1.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, full_name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, pin_code TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'Entry', companies TEXT NOT NULL DEFAULT 'WTC', pbi_access TEXT DEFAULT 'full',
  statements_access TEXT DEFAULT 'full', status TEXT DEFAULT 'Active', last_login_at TEXT DEFAULT '', custom_perms TEXT DEFAULT '{}');
  CREATE TABLE auth_sessions (id TEXT PRIMARY KEY, user_id TEXT DEFAULT '', email TEXT DEFAULT '', full_name TEXT DEFAULT '',
  role TEXT DEFAULT '', companies TEXT DEFAULT '', device TEXT DEFAULT '', logged_in_at TEXT DEFAULT '', method TEXT DEFAULT 'PIN',
  confidence REAL, ip_hash TEXT DEFAULT '');
  CREATE TABLE edge_kv_store (doc_key TEXT PRIMARY KEY, payload_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL DEFAULT '',
  updated_by TEXT DEFAULT '', rev INTEGER DEFAULT 1);`);
const env = { DB: d1, ISABI_JWT_SECRET: 'push-offline-test-secret-' + Math.random().toString(36).slice(2) };
const setVapid = (v) => {
  delete env.VAPID_PUBLIC_KEY; delete env.VAPID_PRIVATE_KEY; delete env.VAPID_SUBJECT;
  if (v) Object.assign(env, v);
};
const VAPID_ON = { VAPID_PUBLIC_KEY: V1.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: V1.VAPID_PRIVATE_KEY, VAPID_SUBJECT: SUBJECT };

const SEATS = [
  ['t-owner1', 'Owner One', 'Owner', 'All', '{}'],
  ['t-sup-wtc', 'Sup WTC', 'Supervisor', 'WTC', '{}'],
  ['t-sup-bbc', 'Sup BBC', 'Supervisor', 'BBConstruction', '{}'],
  ['t-entry-wtc', 'Rami Entry', 'Entry', 'WTC', '{}'],
  ['t-entry-wtc2', 'Entry WTC Two', 'Entry', 'WTC', '{}'],
  ['t-custom-wtc', 'Custom WTC', 'Custom', 'WTC', JSON.stringify({ unlocks: { unlock_unit_price: true } })],
  ['t-custom-qty', 'Custom Qty Only', 'Custom', 'WTC', JSON.stringify({ unlocks: { unlock_qty_cap: true } })],
  ['t-sup-ar', 'Sup Arabic', 'Supervisor', 'WTC', '{}'],
  ['t-sup-susp', 'Sup Suspended', 'Supervisor', 'WTC', '{}'],
  ['t-sup-out', 'Sup Signed Out', 'Supervisor', 'WTC', '{}'],
  ['t-cap', 'Cap Seat', 'Supervisor', 'BBConstruction', '{}']
];
const TOK = {};
const nowIso = new Date().toISOString();
for (const [id, name, role, cos, cp] of SEATS) {
  d1.db.prepare('INSERT INTO users (id, full_name, email, role, companies, custom_perms) VALUES (?,?,?,?,?,?)').run(id, name, `${id}@example.test`, role, cos, cp);
  const sid = `sess-${id}`;
  d1.db.prepare('INSERT INTO auth_sessions (id, user_id, email, full_name, role, companies, logged_in_at) VALUES (?,?,?,?,?,?,?)').run(sid, id, `${id}@example.test`, name, role, cos, nowIso);
  TOK[id] = await signEdgeSession({ sid, sub: id, email: `${id}@example.test`, name, role, companies: cos }, env);
}

let ipSeq = 0;
let waits = [];
async function api(path, { method = 'GET', body, as, demo = false, query = '', rawBody } = {}) {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.2.0.${++ipSeq % 250}` };
  if (as) headers.Authorization = 'Bearer ' + TOK[as];
  if (demo) headers['X-ISABI-Demo'] = '1';
  const req = new Request(`https://example.test/app/api/${path}${query}`, { method, headers, body: method === 'GET' ? undefined : (rawBody !== undefined ? rawBody : JSON.stringify(body || {})) });
  const ctx = { request: req, env, params: { route: path.split('/') }, waitUntil: p => { waits.push(p); } };
  const res = await onRequest(ctx);
  const txt = await res.text();
  let json = null; try { json = JSON.parse(txt); } catch (_) {}
  return { status: res.status, json, txt };
}
async function settle() { const w = waits; waits = []; await Promise.all(w); }

// ---- mocked push services ----
const realFetch = globalThis.fetch;
let calls = [];
let statusFor = () => 201;
let gate = null; // a pending promise that holds every push until released
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (!/^https:\/\/(fcm\.googleapis\.com|web\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com|updates\.push\.services\.mozilla\.com)\//.test(u)) {
    return realFetch(url, init);
  }
  calls.push({ url: u, init, headers: init.headers, body: new Uint8Array(init.body) });
  if (gate) await gate;
  return new Response(null, { status: statusFor(u) });
};

const devices = {};
function endpointFor(seat, n = 0, host = 'fcm') {
  const tail = `${seat}-${n}-${nodeCrypto.randomBytes(6).toString('hex')}`;
  if (host === 'apple') return `https://web.push.apple.com/${tail}`;
  if (host === 'wns') return `https://wns2-par02p.notify.windows.com/w/?token=${tail}`;
  if (host === 'moz') return `https://updates.push.services.mozilla.com/wpush/v2/${tail}`;
  return `https://fcm.googleapis.com/fcm/send/${tail}`;
}
async function subscribe(seat, { host = 'fcm', lang = 'en', n = 0 } = {}) {
  const ua = newUaKeys();
  const endpoint = endpointFor(seat, n, host);
  const r = await api('push/subscribe', { method: 'POST', as: seat, body: { endpoint, keys: { p256dh: b64uEncode(ua.pub), auth: b64uEncode(ua.auth) }, lang } });
  devices[endpoint] = { seat, ua, lang };
  return { endpoint, r };
}
const subCount = (where = '1=1', ...p) => { try { return d1.one(`SELECT COUNT(*) AS n FROM push_subscriptions WHERE ${where}`, ...p).n; } catch (_) { return 0; } };
const callSeats = () => calls.map(c => devices[c.url] && devices[c.url].seat).filter(Boolean).sort();
const BASE = { op: 'create', company: 'WTC', form_key: 'sales', field_id: 'f_unitprice', field_label: 'Unit Price $999', record_id: 'st-secret-77', reason: 'Price 4,250 USD agreed, PIN 2401' };

// =====================================================================================================
console.log('\n[3] ./api/push/config');
{
  setVapid(null);
  let r = await api('push/config');
  ok('unauthenticated config -> 401', r.status === 401, r);
  r = await api('push/subscribe', { method: 'POST', body: { endpoint: endpointFor('x') } });
  ok('unauthenticated subscribe -> 401', r.status === 401, r);
  r = await api('push/unsubscribe', { method: 'POST', body: { endpoint: endpointFor('x') } });
  ok('unauthenticated unsubscribe -> 401', r.status === 401, r);
  r = await api('push/config', { as: 't-owner1' });
  ok('no VAPID settings: disabled, no key, reason not_configured, Owner may set it up', r.status === 200 && r.json.enabled === false && r.json.publicKey === '' && r.json.reason === 'not_configured' && r.json.can_setup === true, r.json);
  r = await api('push/config', { as: 't-sup-wtc' });
  ok('a Supervisor is not offered the setup line', r.json.enabled === false && r.json.can_setup === false, r.json);
  for (const miss of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']) {
    const v = Object.assign({}, VAPID_ON); delete v[miss];
    setVapid(v);
    r = await api('push/config', { as: 't-owner1' });
    ok(`missing ${miss}: disabled`, r.json.enabled === false && r.json.publicKey === '', r.json);
  }
  setVapid(Object.assign({}, VAPID_ON, { VAPID_PRIVATE_KEY: mintVapid().VAPID_PRIVATE_KEY }));
  r = await api('push/config', { as: 't-owner1' });
  ok('mismatched key pair: disabled', r.json.enabled === false, r.json);
  setVapid(VAPID_ON);
  r = await api('push/config', { as: 't-sup-wtc' });
  ok('all three set: enabled with the public key only', r.json.enabled === true && r.json.publicKey === V1.VAPID_PUBLIC_KEY && !/PRIVATE|"d"/.test(r.txt) && !r.txt.includes(V1.VAPID_PRIVATE_KEY), r.json);
  r = await api('push/config', { as: 't-sup-wtc', demo: true });
  ok('demo header: disabled', r.status === 200 && r.json.enabled === false, r.json);
  r = await api('push/nope', { as: 't-sup-wtc' });
  ok('unknown push route -> 404', r.status === 404, r);
}

// =====================================================================================================
console.log('\n[4] subscribe / unsubscribe');
{
  setVapid(VAPID_ON);
  const ua = newUaKeys();
  const keys = { p256dh: b64uEncode(ua.pub), auth: b64uEncode(ua.auth) };
  const bad = [
    'http://fcm.googleapis.com/fcm/send/x',
    'https://evil.example.com/fcm/send/x',
    'https://fcm.googleapis.com/other/x',
    'https://fcm.googleapis.com:8443/fcm/send/x',
    'https://user:pw@fcm.googleapis.com/fcm/send/x',
    'https://push.apple.com.evil.example/x',
    'https://notify.windows.com.evil.example/w/x',
    'https://updates.push.services.mozilla.com/other/x',
    'https://fcm.googleapis.com/fcm/send/' + 'a'.repeat(1100),
    'javascript:alert(1)',
    ''
  ];
  let refused = 0;
  for (const e of bad) {
    const r = await api('push/subscribe', { method: 'POST', as: 't-sup-wtc', body: { endpoint: e, keys } });
    if (r.status === 400) refused++;
  }
  ok(`allowlist refuses ${bad.length} non-push-service addresses`, refused === bad.length && subCount() === 0, refused);
  const good = ['https://fcm.googleapis.com/fcm/send/a1', 'https://fcm.googleapis.com/wp/a2', 'https://web.push.apple.com/a3',
    'https://api.push.apple.com/a4', 'https://wns2-par02p.notify.windows.com/w/?token=a5', 'https://updates.push.services.mozilla.com/wpush/v2/a6'];
  ok('allowlist accepts Apple, FCM, Windows and Mozilla push services', good.every(isAllowedPushEndpoint), good.filter(g => !isAllowedPushEndpoint(g)));
  let r = await api('push/subscribe', { method: 'POST', as: 't-sup-wtc', body: { endpoint: good[0], keys: { p256dh: 'AAAA', auth: keys.auth } } });
  ok('NEGATIVE: bad p256dh -> 400', r.status === 400, r.json);
  r = await api('push/subscribe', { method: 'POST', as: 't-sup-wtc', body: { endpoint: good[0], keys: { p256dh: keys.p256dh, auth: 'AAAA' } } });
  ok('NEGATIVE: bad auth secret -> 400', r.status === 400, r.json);
  r = await api('push/subscribe', { method: 'POST', as: 't-sup-wtc', body: { endpoint: good[0], keys, pad: 'x'.repeat(5000) } });
  ok('NEGATIVE: body over 4 KB -> 413', r.status === 413, r.json);
  r = await api('push/subscribe', { method: 'POST', as: 't-sup-wtc', demo: true, body: { endpoint: good[0], keys } });
  ok('NEGATIVE: demo header -> 403', r.status === 403 && subCount() === 0, r.json);
  setVapid(null);
  r = await api('push/subscribe', { method: 'POST', as: 't-sup-wtc', body: { endpoint: good[0], keys } });
  ok('VAPID missing: subscribe answers ok, stores nothing', r.status === 200 && r.json.ok === true && r.json.stored === false && subCount() === 0, r.json);
  setVapid(VAPID_ON);
  r = await api('push/subscribe', { method: 'POST', as: 't-sup-wtc', body: { endpoint: good[0], keys, lang: 'fr' } });
  ok('subscribe stores one row with the language', r.status === 200 && r.json.stored === true && subCount('endpoint = ?', good[0]) === 1
    && d1.one('SELECT lang, user_id, session_id FROM push_subscriptions WHERE endpoint = ?', good[0]).lang === 'fr', r.json);
  r = await api('push/subscribe', { method: 'POST', as: 't-sup-wtc', body: { endpoint: good[0], p256dh: keys.p256dh, auth: keys.auth, lang: 'xx' } });
  ok('re-subscribe (top-level keys accepted) keeps one row; unknown language falls back to en', subCount('endpoint = ?', good[0]) === 1 && d1.one('SELECT lang FROM push_subscriptions WHERE endpoint = ?', good[0]).lang === 'en', r.json);
  r = await api('push/subscribe', { method: 'POST', as: 't-owner1', body: { endpoint: good[0], keys } });
  const moved = d1.one('SELECT user_id, session_id FROM push_subscriptions WHERE endpoint = ?', good[0]);
  ok('the same device signed in as another seat moves the row (one row per endpoint)', subCount('endpoint = ?', good[0]) === 1 && moved.user_id === 't-owner1' && moved.session_id === 'sess-t-owner1', moved);
  r = await api('push/unsubscribe', { method: 'POST', as: 't-sup-wtc', body: { endpoint: good[0] } });
  ok('NEGATIVE: a seat cannot delete another seat\'s row', r.status === 200 && r.json.removed === 0 && subCount('endpoint = ?', good[0]) === 1, r.json);
  r = await api('push/unsubscribe', { method: 'POST', as: 't-owner1', body: { endpoint: good[0] } });
  ok('the owning seat deletes its row', r.json.removed === 1 && subCount('endpoint = ?', good[0]) === 0, r.json);
  r = await api('push/unsubscribe', { method: 'POST', as: 't-owner1', body: { endpoint: 'https://evil.example.com/x' } });
  ok('NEGATIVE: unsubscribe also checks the allowlist', r.status === 400, r.json);
  for (let i = 0; i < 12; i++) await subscribe('t-cap', { n: i });
  ok('per-seat cap keeps the 10 newest devices', subCount('user_id = ?', 't-cap') === 10, subCount('user_id = ?', 't-cap'));
  d1.exec("DELETE FROM push_subscriptions WHERE user_id = 't-cap'");
  const leak = d1.one("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'push_subscriptions'").n === 1;
  ok('table created lazily by the Edge code', leak);
}

// =====================================================================================================
console.log('\n[5] sending');
setVapid(VAPID_ON);
const sub = {};
sub.owner = await subscribe('t-owner1', { host: 'apple' });
sub.sup = await subscribe('t-sup-wtc', { host: 'fcm', lang: 'fr' });
sub.sup2 = await subscribe('t-sup-wtc', { host: 'wns', n: 1 });
sub.bbc = await subscribe('t-sup-bbc');
sub.req = await subscribe('t-entry-wtc');
sub.entry2 = await subscribe('t-entry-wtc2', { host: 'moz' });
sub.custom = await subscribe('t-custom-wtc');
sub.customQty = await subscribe('t-custom-qty');
sub.ar = await subscribe('t-sup-ar', { lang: 'ar' });
sub.susp = await subscribe('t-sup-susp');
sub.out = await subscribe('t-sup-out');
d1.exec("UPDATE users SET status = 'Suspended' WHERE id = 't-sup-susp'");
d1.exec("DELETE FROM auth_sessions WHERE id = 'sess-t-sup-out'"); // signed out without unsubscribing
ok('fixture: 11 device rows stored', subCount() === 11, subCount());

let reqA;
{
  calls = []; statusFor = () => 201;
  // The request call must not wait on the push services.
  let release; gate = new Promise(r => { release = r; });
  const t0 = Date.now();
  const r = await api('auth/override-requests', { method: 'POST', as: 't-entry-wtc', body: BASE });
  reqA = r.json && r.json.request;
  ok('create answers while every push is still in flight (context.waitUntil)', r.status === 200 && reqA && waits.length === 1 && Date.now() - t0 < 2000, { status: r.status, waits: waits.length });
  release(); gate = null;
  await settle();
  const want = ['t-custom-wtc', 't-owner1', 't-sup-ar', 't-sup-wtc', 't-sup-wtc'];
  ok('sent to exactly the eligible approvers\' devices (Owner, WTC Supervisors incl. both devices, custom unlock seat)', JSON.stringify(callSeats()) === JSON.stringify(want), callSeats());
  ok('NEGATIVE: never the requester', !callSeats().includes('t-entry-wtc'));
  ok('NEGATIVE: never a Supervisor without the company', !callSeats().includes('t-sup-bbc'));
  ok('NEGATIVE: never an Entry seat or a custom seat without that unlock', !callSeats().includes('t-entry-wtc2') && !callSeats().includes('t-custom-qty'));
  ok('NEGATIVE: never a suspended seat', !callSeats().includes('t-sup-susp'));
  ok('NEGATIVE: never a device whose session signed out; its row is removed', !callSeats().includes('t-sup-out') && subCount('user_id = ?', 't-sup-out') === 0);
  const h = calls[0] && calls[0].headers;
  const topic = await topicForRequest(reqA.id);
  ok('headers: aes128gcm, octet-stream, Urgency high, TTL <= 600, Topic per request', calls.every(c => c.headers['Content-Encoding'] === 'aes128gcm'
    && c.headers['Content-Type'] === 'application/octet-stream' && c.headers.Urgency === 'high'
    && Number(c.headers.TTL) > 500 && Number(c.headers.TTL) <= 600 && c.headers.Topic === topic), h);
  ok('Topic is at most 32 URL-safe characters', /^[A-Za-z0-9_-]{1,32}$/.test(topic), topic);
  ok('Authorization is a VAPID header with this key', calls.every(c => /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/.test(c.headers.Authorization) && c.headers.Authorization.endsWith(V1.VAPID_PUBLIC_KEY)));
  const audOk = calls.every(c => {
    const jwt = c.headers.Authorization.slice(8).split(',')[0];
    const claims = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
    return claims.aud === new URL(c.url).origin;
  });
  ok('each JWT aud matches its own push service', audOk);
  ok('no redirects followed, a timeout signal on every call', calls.every(c => c.init.redirect === 'manual' && c.init.signal && typeof c.init.signal.aborted === 'boolean'));
  const decoded = calls.map(c => ({ seat: devices[c.url].seat, p: JSON.parse(decryptPush(c.body, devices[c.url].ua).text) }));
  const en = decoded.find(x => x.seat === 't-owner1').p;
  ok('payload: "Approval needed", "<name> asks to unlock <field> on <form>", url and per-request tag', en.title === 'Approval needed'
    && en.body === 'Rami Entry asks to unlock Unit Price on Sales Ticket' && en.url === '/app/#approvals' && en.tag === 'apv-' + reqA.id && en.kind === 'apv_new' && en.id === reqA.id, en);
  const allText = decoded.map(x => JSON.stringify(x.p)).join(' ');
  ok('lock-screen safe: no reason text, no record number, no amount, no PIN, no requester-typed label', !/4,250|2401|st-secret-77|\$|999|PIN|agreed/.test(allText), allText.slice(0, 300));
  ok('badge carries the seat\'s pending count', decoded.every(x => x.p.badge === 1), decoded.map(x => x.p.badge));
  const fr = decoded.find(x => devices[calls.find(c => devices[c.url].seat === 't-sup-wtc' && devices[c.url].lang === 'fr').url] && x.seat === 't-sup-wtc' && x.p.lang === 'fr');
  ok('French subscriber gets French text', fr && fr.p.title === 'Approbation requise' && fr.p.body === 'Rami Entry demande à déverrouiller Prix unitaire sur Bon de vente', fr && fr.p);
  const ar = decoded.find(x => x.seat === 't-sup-ar').p;
  ok('Arabic subscriber gets Arabic text', ar.title === 'موافقة مطلوبة' && ar.body === 'يطلب Rami Entry فتح سعر الوحدة في إيصال مبيعات', ar);
  ok('no em dash or arrow in any notification text', !/[—→]/.test(allText));
  const lastStatus = d1.one('SELECT last_status, last_sent_at FROM push_subscriptions WHERE endpoint = ?', sub.owner.endpoint);
  ok('delivery recorded on the row', lastStatus.last_status === 201 && lastStatus.last_sent_at, lastStatus);
}

console.log('\n[5b] dead subscriptions');
{
  calls = [];
  statusFor = u => (u === sub.sup2.endpoint ? 410 : (u === sub.custom.endpoint ? 404 : 201));
  const r = await api('auth/override-requests', { method: 'POST', as: 't-entry-wtc', body: Object.assign({}, BASE, { field_id: 'f_qty' }) });
  await settle();
  ok('second request sent (f_qty: the quantity-unlock custom seat joins, the price-unlock one leaves)', r.status === 200 && callSeats().includes('t-custom-qty') && !callSeats().includes('t-custom-wtc'), callSeats());
  ok('410 Gone deletes the row', subCount('endpoint = ?', sub.sup2.endpoint) === 0);
  ok('custom price seat was not called, so its row stays', subCount('endpoint = ?', sub.custom.endpoint) === 1);
  const badge = calls.map(c => JSON.parse(decryptPush(c.body, devices[c.url].ua).text)).find(p => p && p.lang === 'en' && devices[calls[0].url]);
  ok('badge counts both waiting requests for the Owner', calls.some(c => devices[c.url].seat === 't-owner1' && JSON.parse(decryptPush(c.body, devices[c.url].ua).text).badge === 2), badge);
  calls = [];
  const r2 = await api('auth/override-requests', { method: 'POST', as: 't-entry-wtc2', body: BASE });
  await settle();
  ok('404 Not Found deletes the row', r2.status === 200 && subCount('endpoint = ?', sub.custom.endpoint) === 0, callSeats());
  const failRow = sub.owner.endpoint;
  statusFor = u => (u === failRow ? 500 : 201);
  calls = [];
  await api('auth/override-requests', { method: 'POST', as: 't-entry-wtc2', body: Object.assign({}, BASE, { field_id: 'f_uom' }) });
  await settle();
  const fr = d1.one('SELECT fail_count, last_status FROM push_subscriptions WHERE endpoint = ?', failRow);
  ok('a 5xx keeps the row and counts the failure', fr && fr.fail_count === 1 && fr.last_status === 500, fr);
  statusFor = () => 201;
}

console.log('\n[5c] closing notifications');
{
  calls = [];
  let r = await api('auth/override-requests', { method: 'POST', as: 't-sup-wtc', body: { op: 'decide', id: reqA.id, decision: 'approve' } });
  await settle();
  const closed = calls.map(c => ({ seat: devices[c.url].seat, h: c.headers, p: JSON.parse(decryptPush(c.body, devices[c.url].ua).text) }));
  const topic = await topicForRequest(reqA.id);
  ok('approve sends a quiet close to the same approvers', r.status === 200 && closed.length >= 3 && closed.every(x => x.p.kind === 'apv_closed' && x.p.status === 'approved'
    && x.p.tag === 'apv-' + reqA.id && x.h.Urgency === 'normal' && x.h.Topic === topic), closed.map(x => [x.seat, x.p.kind, x.h.Urgency]));
  ok('NEGATIVE: the close never reaches the requester or other companies', !closed.some(x => ['t-entry-wtc', 't-sup-bbc'].includes(x.seat)));
  const own = closed.find(x => x.seat === 't-owner1');
  ok('close text names the outcome, not the amount', own && own.p.title === 'Request closed' && own.p.body === "Rami Entry's request to unlock Unit Price was approved.", own && own.p);
  // decline, cancel and expiry each close too
  const mk = async (who, extra = {}) => { const x = await api('auth/override-requests', { method: 'POST', as: who, body: Object.assign({}, BASE, extra) }); await settle(); return x.json.request; };
  d1.exec("UPDATE override_requests SET status = 'cancelled' WHERE status = 'pending'"); // keep the per-seat pending cap free
  const rb = await mk('t-entry-wtc');
  calls = [];
  await api('auth/override-requests', { method: 'POST', as: 't-owner1', body: { op: 'decide', id: rb.id, decision: 'deny' } });
  await settle();
  ok('deny sends a close (declined)', calls.length > 0 && calls.every(c => JSON.parse(decryptPush(c.body, devices[c.url].ua).text).status === 'denied'));
  const rc = await mk('t-entry-wtc');
  calls = [];
  await api('auth/override-requests', { method: 'POST', as: 't-entry-wtc', body: { op: 'cancel', id: rc.id } });
  await settle();
  ok('cancel by the requester sends a close (withdrawn)', calls.length > 0 && calls.every(c => JSON.parse(decryptPush(c.body, devices[c.url].ua).text).status === 'cancelled'));
  const rd = await mk('t-entry-wtc');
  d1.db.prepare('UPDATE override_requests SET expires_at = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), rd.id);
  calls = [];
  r = await api('auth/override-requests', { as: 't-entry-wtc', query: `?id=${rd.id}` });
  await settle();
  ok('an expired request seen by the requester\'s wait poll sends a close (expired) once', r.json.request.status === 'expired' && calls.length > 0
    && calls.every(c => JSON.parse(decryptPush(c.body, devices[c.url].ua).text).status === 'expired')
    && d1.one('SELECT status FROM override_requests WHERE id = ?', rd.id).status === 'expired', { n: calls.length, st: r.json.request.status });
  calls = [];
  await api('auth/override-requests', { as: 't-sup-wtc', query: '?status=pending' });
  await settle();
  ok('a later inbox poll does not send it again', calls.length === 0, calls.length);
  const re = await mk('t-entry-wtc');
  d1.db.prepare('UPDATE override_requests SET expires_at = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), re.id);
  calls = [];
  await api('auth/override-requests', { as: 't-sup-wtc', query: '?status=pending' });
  await settle();
  ok('an approver\'s inbox poll also closes expired requests', calls.length > 0 && d1.one('SELECT status FROM override_requests WHERE id = ?', re.id).status === 'expired');
}

console.log('\n[5d] payload builder fallbacks');
{
  const p = buildOverridePushPayload({ id: 'ovr-1', caller_name: '', field_id: 'f_custom_x', form_key: 'mystery', unlock_all: 0, expires_at: '' }, 'new', 'en', 0);
  ok('unknown field and form: generic words, nothing the requester typed', p.body === 'A team member asks to unlock a locked field', p.body);
  const q = buildOverridePushPayload({ id: 'ovr-2', caller_name: 'Lina', field_id: '', form_key: 'raw', unlock_all: 1 }, 'new', 'fr', 3);
  ok('unlock all, French', q.body === 'Lina demande à déverrouiller tous les champs verrouillés sur Bon matières premières' && q.badge === 3, q.body);
}

console.log('\n[5e] key rotation and the off switch');
{
  const V2 = mintVapid();
  setVapid({ VAPID_PUBLIC_KEY: V2.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: V2.VAPID_PRIVATE_KEY, VAPID_SUBJECT: SUBJECT });
  const before = subCount();
  calls = [];
  d1.exec("UPDATE override_requests SET status = 'cancelled' WHERE status = 'pending'");
  await api('auth/override-requests', { method: 'POST', as: 't-entry-wtc', body: BASE });
  await settle();
  ok('after a key rotation, old-key devices get nothing and their rows are removed', before > 0 && calls.length === 0 && subCount("user_id <> 't-entry-wtc' AND user_id <> 't-sup-bbc' AND user_id <> 't-entry-wtc2' AND user_id <> 't-custom-qty' AND user_id <> 't-sup-susp'") === 0, { before, after: subCount(), calls: calls.length });
  const fresh = await subscribe('t-sup-wtc');
  setVapid(null);
  calls = [];
  d1.exec("UPDATE override_requests SET status = 'cancelled' WHERE status = 'pending'");
  const r = await api('auth/override-requests', { method: 'POST', as: 't-entry-wtc', body: BASE });
  await settle();
  ok('VAPID missing: request still created, zero sends, nothing scheduled', r.status === 200 && r.json.ok === true && calls.length === 0, { status: r.status, calls: calls.length });
  const d = await api('auth/override-requests', { method: 'POST', as: 't-sup-wtc', body: { op: 'decide', id: r.json.request.id, decision: 'approve' } });
  await settle();
  ok('VAPID missing: approve works, zero sends', d.status === 200 && d.json.request.status === 'approved' && calls.length === 0, { status: d.status, calls: calls.length });
  ok('VAPID missing: the stored row is untouched', subCount('endpoint = ?', fresh.endpoint) === 1);
}

globalThis.fetch = realFetch;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
