// Offline unit & crypto round-trip verification of functions/_lib/web_push.js through the real
// /app/api/[[route]].js Edge router against in-memory SQLite (full migrations/0001_schema.sql),
// mock R2 seed vault, and mock fetch that verifies redirect:'error', ES256 VAPID JWT signatures,
// and RFC 8291 aes128gcm AEAD payload decryption.
// Run: node --no-warnings build/verify_web_push_unit.mjs   (Node 22.5+ for node:sqlite)

import fs from 'node:fs';
import vm from 'node:vm';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { onRequest } from '../functions/app/api/[[route]].js';
import { signEdgeSession } from '../functions/_lib/security.js';
import { PUSH_SUBS_KV_KEY } from '../functions/_lib/web_push.js';

const B64_ENC = new TextEncoder();
const B64_DEC = new TextDecoder();

function b64uEnc(bytes) {
  return Buffer.from(bytes).toString('base64url');
}
function b64uDec(str) {
  return new Uint8Array(Buffer.from(String(str || ''), 'base64url'));
}
async function hmacSha256(keyBytes, dataBytes) {
  const k = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, dataBytes));
}
function concatBytes(...parts) {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function getBeirutDateToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Beirut',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const m = {};
  for (const p of parts) m[p.type] = p.value;
  return `${m.year}-${m.month}-${m.day}`;
}

// ---- Minimal D1 stand-in with optional forced CAS conflict ----
let forceCasConflict = false;

class Stmt {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...p) { return new Stmt(this.db, this.sql, p); }
  args() {
    const used = new Set(this.sql.match(/\?\d+/g) || []);
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
  async run() {
    if (forceCasConflict && /edge_kv_store/.test(this.sql) && /^\s*(UPDATE|INSERT OR IGNORE)\b/i.test(this.sql)) {
      return { success: true, meta: { changes: 0 } };
    }
    const r = this.db.prepare(this.sql).run(...this.args());
    return { success: true, meta: { changes: r.changes } };
  }
  runSync() {
    if (/^\s*(SELECT|WITH)\b/i.test(this.sql)) {
      return { results: this.db.prepare(this.sql).all(...this.args()) };
    }
    if (forceCasConflict && /edge_kv_store/.test(this.sql) && /^\s*(UPDATE|INSERT OR IGNORE)\b/i.test(this.sql)) {
      return { success: true, results: [], meta: { changes: 0 } };
    }
    const r = this.db.prepare(this.sql).run(...this.args());
    return { success: true, results: [], meta: { changes: r.changes } };
  }
}

class D1 {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  prepare(sql) { return new Stmt(this.db, sql); }
  async batch(stmts) {
    this.db.exec('BEGIN');
    try {
      const out = stmts.map(s => s.runSync());
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  exec(sql) { this.db.exec(sql); }
}

const d1 = new D1();
const schemaSql = fs.readFileSync(new URL('../migrations/0001_schema.sql', import.meta.url), 'utf8');
d1.exec(schemaSql);

// ---- R2 mock vault & RFC 8291 client keypair registry ----
const r2Store = new Map();
const env = {
  DB: d1,
  ISABI_JWT_SECRET: 'web-push-unit-secret-' + randomBytes(8).toString('hex'),
  BUCKET: {
    async get(key) {
      if (!r2Store.has(key)) return null;
      const val = r2Store.get(key);
      return {
        async text() { return JSON.stringify(val); },
        async json() { return structuredClone(val); }
      };
    }
  }
};

const clientSubKeys = new Map();
const expiredEndpoints = new Set();
const fetchLog = [];

async function makeClientSub(endpoint) {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const authBytes = crypto.getRandomValues(new Uint8Array(16));
  const sub = {
    endpoint,
    keys: {
      p256dh: b64uEnc(pubRaw),
      auth: b64uEnc(authBytes)
    }
  };
  clientSubKeys.set(endpoint, { privKey: kp.privateKey, pubBytes: pubRaw, authBytes });
  return sub;
}

async function verifyVapidAuthHeader(authHdr, targetUrl) {
  const m = /^vapid\s+t=([^,\s]+)\s*,\s*k=([^\s]+)$/i.exec(String(authHdr || '').trim());
  if (!m) throw new Error(`Invalid VAPID Authorization header: ${authHdr}`);
  const [, jwt, pubB64u] = m;
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('Malformed VAPID JWT');
  const hdr = JSON.parse(B64_DEC.decode(b64uDec(parts[0])));
  const pl = JSON.parse(B64_DEC.decode(b64uDec(parts[1])));
  if (hdr.alg !== 'ES256' || hdr.typ !== 'JWT') throw new Error(`Unexpected VAPID alg/typ: ${JSON.stringify(hdr)}`);
  const expectedAud = new URL(targetUrl).origin;
  if (pl.aud !== expectedAud) throw new Error(`VAPID aud mismatch: ${pl.aud} !== ${expectedAud}`);
  if (pl.sub !== 'mailto:ops@isabisystems.com') throw new Error(`VAPID sub mismatch: ${pl.sub}`);
  const pubBytes = b64uDec(pubB64u);
  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) throw new Error('Invalid VAPID public key length');
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: b64uEnc(pubBytes.slice(1, 33)),
    y: b64uEnc(pubBytes.slice(33, 65))
  };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    b64uDec(parts[2]),
    B64_ENC.encode(`${parts[0]}.${parts[1]}`)
  );
  if (!ok) throw new Error('VAPID ES256 signature verification failed');
}

async function decryptAes128Gcm(endpoint, bodyBytes) {
  const client = clientSubKeys.get(endpoint);
  if (!client) throw new Error(`Missing client keys for ${endpoint}`);
  const u8 = bodyBytes instanceof Uint8Array ? bodyBytes : new Uint8Array(bodyBytes);
  const salt = u8.slice(0, 16);
  const rs = new DataView(u8.buffer, u8.byteOffset + 16, 4).getUint32(0, false);
  if (rs !== 4096) throw new Error(`Unexpected record size ${rs}`);
  const idlen = u8[20];
  if (idlen !== 65) throw new Error(`Unexpected AS key length ${idlen}`);
  const asPubBytes = u8.slice(21, 21 + idlen);
  const cipher = u8.slice(21 + idlen);
  const asPubKey = await crypto.subtle.importKey('raw', asPubBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asPubKey }, client.privKey, 256));
  const prkKey = await hmacSha256(client.authBytes, ecdhSecret);
  const ikm = await hmacSha256(prkKey, concatBytes(B64_ENC.encode('WebPush: info\0'), client.pubBytes, asPubBytes, new Uint8Array([1])));
  const prk = await hmacSha256(salt, ikm);
  const cek = (await hmacSha256(prk, concatBytes(B64_ENC.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmacSha256(prk, concatBytes(B64_ENC.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aesKey, cipher));
  let end = plain.length;
  while (end > 0 && plain[end - 1] === 0x00) end--;
  if (end <= 0 || plain[end - 1] !== 0x02) throw new Error('Missing RFC 8291 padding delimiter 0x02');
  return JSON.parse(B64_DEC.decode(plain.slice(0, end - 1)));
}

const origFetch = globalThis.fetch;
let fetchDelayMs = 0;
globalThis.fetch = async (url, init = {}) => {
  if (fetchDelayMs > 0) await new Promise(r => setTimeout(r, fetchDelayMs));
  const sUrl = String(url);
  if (init.redirect !== 'error') {
    throw new Error(`Expected fetch redirect:'error', got ${init.redirect}`);
  }
  const hdrs = init.headers || {};
  await verifyVapidAuthHeader(hdrs.Authorization || hdrs.authorization, sUrl);
  const bodyBytes = init.body instanceof Uint8Array ? init.body : new Uint8Array(init.body);
  const payload = await decryptAes128Gcm(sUrl, bodyBytes);
  fetchLog.push({
    url: sUrl,
    redirect: init.redirect,
    encoding: hdrs['Content-Encoding'],
    payload
  });
  if (expiredEndpoints.has(sUrl)) {
    return new Response('Gone', { status: 410 });
  }
  return new Response('', { status: 201 });
};

// ---- Helpers ----
async function seedSeat({ id, full_name, email, role, companies, pbi_access = 'full', statements_access = 'full', custom_perms = '{}' }) {
  const sid = `sess-${id}`;
  d1.db.prepare(
    `INSERT INTO users (id, full_name, email, role, companies, pbi_access, statements_access, status, custom_perms)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Active', ?)`
  ).run(id, full_name, email, role, companies, pbi_access, statements_access, custom_perms);
  d1.db.prepare(
    `INSERT INTO auth_sessions (id, user_id, email, full_name, role, companies) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(sid, id, email, full_name, role, companies);
  return signEdgeSession({ sid, sub: id, email, role, companies, pbi: pbi_access, stmts: statements_access, custom_perms }, env);
}

async function api(path, { method = 'POST', body, token } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'CF-Connecting-IP': '10.11.0.1'
  };
  if (token) headers['X-ISABI-Session'] = token;
  const req = new Request(`https://example.test/app/api/${path}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(body || {})
  });
  const res = await onRequest({ request: req, env, params: { route: path.split('/') } });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return { status: res.status, json, text };
}

function issueBuildTicket() {
  d1.exec('CREATE TABLE IF NOT EXISTS build_tickets (ticket_hash TEXT PRIMARY KEY, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)');
  const t = 'bt1_' + randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(t, 'ascii').digest('hex');
  const now = Date.now();
  d1.db.prepare('INSERT INTO build_tickets (ticket_hash, expires_at, created_at) VALUES (?, ?, ?)')
    .run(hash, new Date(now + 300_000).toISOString(), new Date(now).toISOString());
  return t;
}

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log('  ok   ' + name);
  } else {
    fail++;
    console.error('  FAIL ' + name + (detail !== undefined ? ' -> ' + JSON.stringify(detail).slice(0, 500) : ''));
  }
}

try {
  // ---- Seed core & industries into R2 mock ----
  const TODAY_BEIRUT = getBeirutDateToday();
  r2Store.set('seeds/seed_core.json', {
    models: {
      wtc: { cash_flow_sheet: { live_till: true, daily: [['2026-10-14', 500, 100]] } },
      bbconstruction: { cash_flow_sheet: { live_till: true, daily: [] } },
      lionstransport: { cash_flow_sheet: { live_till: true, daily: [] } }
    }
  });
  r2Store.set('seeds/seed_records.json', {
    _s: ['WTC', 'Cash', 'workbook'],
    records: {
      sales_tickets: {
        c: ['id', 'company', 'date', 'time', 'method', 'total', 'total_ttc', 'vat', 'source'],
        sc: [0, 1, 0, 0, 1, 0, 0, 0, 1],
        p: '',
        r: [['SEED-NIGHT-1', 0, '2026-10-15', '21:00', 1, 400, 444, 44, 2]]
      },
      expenses: {
        c: ['id', 'company', 'date', 'method', 'amount', 'source'],
        sc: [0, 1, 0, 1, 0, 1],
        p: '',
        r: [['SEED-EXP-VOID', 0, '2026-10-14', 1, 150, 2]]
      }
    }
  });
  d1.db.prepare("INSERT INTO edge_kv_store (doc_key, updated_at, payload_json) VALUES ('mfg_web_store', '2026-10-16T10:00:00Z', ?)").run(JSON.stringify({
    customRecords: {
      sales_tickets: [{ id: 'SEED-NIGHT-1', company: 'WTC', date: '2026-10-15', method: 'Cash', total: 400, total_ttc: 444, vat: 44, voided: true }],
      expenses: [{ id: 'SEED-EXP-VOID', company: 'WTC', date: '2026-10-14', method: 'Cash', amount: 150, voided: true }]
    }
  }));
  r2Store.set('seeds/seed_industries.json', {
    tables: {
      'holding.sisterExternalLegs': [],
      'hospitality.venueRows': [
        { id: 'HSP-V-0', company: 'Blanca', date: '2026-10-13', ttc_usd: 4000, ht_usd: 4000 },
        { id: 'HSP-V-1', company: 'Blanca', date: '2026-10-16', ttc_usd: 1110, ht_usd: 1000 }
      ],
      'hospitality.maintRows': [],
      'hospitality.stockRows': [
        { id: 'HSP-S-1', company: 'Blanca', date: '2026-10-16', recipe_usage_usd: 1050, purchases_in_usd: 5000 }
      ],
      'trading.salesRows': [
        { id: 'TRD-S-1', company: 'Shacman', date: '2026-10-16', ttc_usd: 2000, net_usd: 2000, cost_usd: 500 },
        { id: 'TRD-S-VOID', company: 'Shacman', date: '2026-10-16', ttc_usd: 9000, net_usd: 9000, cost_usd: 0 }
      ],
      'trading.importRows': [
        { id: 'TRD-P-1', company: 'Korri Auto', date: '2026-10-16', landed_add_usd: 3000, duty_freight_usd: 100 }
      ],
      'realestate.invoices': [
        { id: 'RE-INV-1', company: '4235 Company S.A.L', date: '2026-10-16', amount_ttc_usd: 1110, net_usd: 1000 }
      ],
      'realestate.sales': [],
      'realestate.workorders': [
        { id: 'RE-WO-1', company: '4235 Company S.A.L', date: '2026-10-16', actual_usd: 1250 }
      ],
      'insurance.policies': [
        { id: 'INS-P-1', company: 'Insurance Company', date: '2026-10-16', gross_prem_usd: 500, net_payable_4017_usd: 400 }
      ],
      'insurance.claims': [
        { id: 'INS-C-1', company: 'Insurance Company', loss_date: '2026-10-16', paid_by_insurer_usd: 350 }
      ]
    }
  });

  // ---- Seed SQL tables for Manufacturing ('2026-10-15' and TODAY_BEIRUT) & Siblings ('2026-10-16') ----
  d1.db.prepare("INSERT INTO fx_rates (id, currency, start_date, end_date, amount, voided) VALUES ('FX-1', 'LBP', '2026-01-01', '', 90000, 0)").run();
  d1.db.prepare("INSERT INTO products (id, name, payload_json, voided) VALUES ('PRD-1', 'Mix 300', '{\"ton_factor\":1.5}', 0)").run();
  d1.db.prepare("INSERT INTO price_rules (id, name, company, rule_type, product, unit, unit_price, start_date, end_date, voided) VALUES ('PR-C1', 'Driver Comm', 'WTC', 'Commission', 'Mix 300', 'm3', 5, '2026-10-01', '', 0)").run();

  // Prior day sales across >45 days ('2026-08-01' $4,440 + '2026-10-10' $2,220 => avg $3,330; '2026-10-15' $1,110 is -67%)
  d1.db.prepare("INSERT INTO sales_tickets (id, company, date, product, uom, qty, method, total, total_ttc, vat, source, voided) VALUES ('ST-OLD', 'WTC', '2026-08-01', 'Mix 300', 'm3', 40, 'Credit', 4000, 4440, 440, 'app', 0)").run();
  d1.db.prepare("INSERT INTO sales_tickets (id, company, date, product, uom, qty, method, total, total_ttc, vat, source, voided) VALUES ('ST-PREV', 'WTC', '2026-10-10', 'Mix 300', 'm3', 20, 'Credit', 2000, 2220, 220, 'app', 0)").run();
  // Target day sale on 2026-10-15 (Cash sale + TODAY_BEIRUT sale for op:'test' + 2026-10-17 for concurrent dispatch_due)
  d1.db.prepare("INSERT INTO sales_tickets (id, company, date, product, uom, qty, method, total, total_ttc, vat, source, voided) VALUES ('ST-1', 'WTC', '2026-10-15', 'Mix 300', 'm3', 10, 'Cash', 1000, 1110, 110, 'app', 0)").run();
  d1.db.prepare("INSERT INTO sales_tickets (id, company, date, product, uom, qty, method, total, total_ttc, vat, source, voided) VALUES ('ST-17', 'WTC', '2026-10-17', 'Mix 300', 'm3', 8, 'Credit', 800, 888, 88, 'app', 0)").run();
  d1.db.prepare("INSERT INTO sales_tickets (id, company, date, product, uom, qty, method, total, total_ttc, vat, source, voided) VALUES ('ST-18', 'WTC', '2026-10-18', 'Mix 300', 'm3', 6, 'Credit', 600, 666, 66, 'app', 0)").run();
  d1.db.prepare("INSERT INTO sales_tickets (id, company, date, product, uom, qty, method, total, total_ttc, vat, source, voided) VALUES ('ST-TODAY', 'WTC', ?, 'Mix 300', 'm3', 5, 'Credit', 500, 555, 55, 'app', 0)").run(TODAY_BEIRUT);

  // Expenses on 2026-10-15: Cash 600 (pending), C Return 200 (net exp = 400), $0 VATConfig (NOT pending), price_pending=true, VAT 999 (excluded)
  d1.db.prepare("INSERT INTO expenses (id, company, date, method, amount, source, voided, payload_json) VALUES ('EX-1', 'WTC', '2026-10-15', 'Cash', 600, 'app', 0, '{\"price_pending\":1}')").run();
  d1.db.prepare("INSERT INTO expenses (id, company, date, method, amount, source, voided, payload_json) VALUES ('EX-2', 'WTC', '2026-10-15', 'C Return', 200, 'app', 0, '{}')").run();
  d1.db.prepare("INSERT INTO expenses (id, company, date, method, amount, source, voided, payload_json) VALUES ('EX-3', 'WTC', '2026-10-15', 'VATConfig', 0, 'app', 0, '{}')").run();
  d1.db.prepare("INSERT INTO expenses (id, company, date, method, amount, source, voided, payload_json) VALUES ('EX-4', 'WTC', '2026-10-15', 'Cash', 0, 'app', 0, '{\"price_pending\":true}')").run();
  d1.db.prepare("INSERT INTO expenses (id, company, date, method, amount, source, voided, payload_json) VALUES ('EX-5', 'WTC', '2026-10-15', 'VAT', 999, 'app', 0, '{}')").run();
  // Prior Hospitality non-revenue expense day on 2026-10-14 (ensures allOpDates includes non-revenue dates)
  d1.db.prepare("INSERT INTO expenses (id, company, date, method, amount, source, voided, payload_json) VALUES ('EX-HSP-0', 'La Una', '2026-10-14', 'Cash', 100, 'app', 0, '{}')").run();

  // Canonical salary_payments on 2026-10-15 (leaving twin `salaries` table empty!): $100 USD + 90,000,000 LBP (/90,000 = $1,000) => salCost = $1,100; USD till = -$100
  d1.db.prepare("INSERT INTO salary_payments (id, company, date, amount, source, voided, payload_json) VALUES ('SAL-1', 'WTC', '2026-10-15', 100, 'app', 0, '{\"lbp_amount\":90000000,\"usd_amount\":100}')").run();
  // Supplier payment on 2026-10-15: $1,250 Cash
  d1.db.prepare("INSERT INTO supplier_payments (id, company, date, method, amount, source, voided, payload_json) VALUES ('SP-1', 'WTC', '2026-10-15', 'Cash', 1250, 'app', 0, '{\"usd_amount\":1250}')").run();
  // Remaining 5 Manufacturing till tables on 2026-10-15 (-200 + 500 - 150 - 100 - 250 = -$200; plus SEED-EXP-VOID +150 => net -$400 closing till)
  d1.db.prepare("INSERT INTO external_movements (id, company, date, type, method, amount, usd_amount, source, voided, payload_json) VALUES ('EXT-WTC-1', 'WTC', '2026-10-15', 'Outflow', 'Cash', 200, 200, 'app', 0, '{\"direction\":\"Out\"}')").run();
  d1.db.prepare("INSERT INTO loans (id, company, date, amount, status, source, voided, payload_json) VALUES ('LN-1', 'WTC', '2026-10-15', 500, 'Active', 'app', 0, '{\"direction\":\"Borrows\",\"principal\":500,\"usd_amount\":500}')").run();
  d1.db.prepare("INSERT INTO loan_settlements (id, company, date, amount, status, source, voided, payload_json) VALUES ('LS-1', 'WTC', '2026-10-15', 150, 'Posted', 'app', 0, '{\"method\":\"Repayment\",\"usd_amount\":150}')").run();
  d1.db.prepare("INSERT INTO conversions (id, company, date, usd_amount, lbp_amount, amount, source, voided, payload_json) VALUES ('CV-1', 'WTC', '2026-10-15', 100, 9000000, 100, 'app', 0, '{\"type\":\"USD to LBP\",\"usd_amount\":100,\"lbp_amount\":9000000}')").run();
  d1.db.prepare("INSERT INTO attendance (id, company, date, status, source, voided, payload_json) VALUES ('AT-1', 'WTC', '2026-10-15', 'Config', 'app', 0, '{\"type\":\"Config USD\",\"tally\":250}')").run();

  // Defects, Malfunctions, Sentinel Reviews
  d1.db.prepare("INSERT INTO equipment_defects (id, company, date, severity, status, voided, payload_json) VALUES ('DF-1', 'WTC', '2026-10-15', 'Critical', 'Open', 0, '{}')").run();
  d1.db.prepare("INSERT INTO equipment_defects (id, company, date, severity, status, voided, payload_json) VALUES ('DF-2', 'WTC', '2026-10-15', 'Minor', 'Open', 0, '{}')").run();
  d1.db.prepare("INSERT INTO equipment_defects (id, company, date, severity, status, voided, payload_json) VALUES ('DF-3', 'WTC', '2026-10-15', 'Critical', 'Resolved', 0, '{}')").run();
  d1.db.prepare("INSERT INTO fuel_malfunctions (id, company, date, litres, voided) VALUES ('FM-1', 'WTC', '2026-10-15', 25, 0)").run();
  d1.db.prepare("INSERT INTO sentinel_reviews (id, rule_id, company, active) VALUES ('SR-1', 'S1', 'WTC', 1)").run();
  d1.db.prepare("INSERT INTO sentinel_reviews (id, rule_id, company, active) VALUES ('SR-2', 'S2', 'WTC', 1)").run();

  // Sibling overlays for '2026-10-16': Holding custom + external, Trading WF edits, RE entity edit
  d1.db.prepare("INSERT INTO industry_custom_rows (bucket, row_id, company, rev, voided, updated_at, payload_json) VALUES ('hld_interactions', 'HLD-CUST-1', 'Bdeir Holding', 1, 0, '2026-10-16T10:00:00Z', ?)")
    .run(JSON.stringify({ id: 'HLD-CUST-1', fromCo: 'Bdeir Holding', toCo: 'WTC', date: '2026-10-16', usd: 4000, bookMirror: true }));
  d1.db.prepare("INSERT INTO external_movements (id, company, date, type, method, amount, usd_amount, voided, payload_json) VALUES ('EXT-IN-1', 'Bdeir Holding', '2026-10-16', 'Inflow', 'Cash', 1500, 1500, 0, '{\"party\":\"WTC\",\"direction\":\"In\"}')").run();
  d1.db.prepare("INSERT INTO industry_row_edits (edit_key, rev, voided, updated_at, payload_json) VALUES ('WF::trd_sales::TRD-S-VOID', 1, 1, '2026-10-16T10:00:00Z', '{}')").run();
  d1.db.prepare("INSERT INTO industry_row_edits (edit_key, rev, voided, updated_at, payload_json) VALUES ('WF::trd_purchases::TRD-P-1', 1, 0, '2026-10-16T10:00:00Z', '{\"landed_add_usd\":2500}')").run();
  d1.db.prepare("INSERT INTO industry_row_edits (edit_key, rev, voided, updated_at, payload_json) VALUES ('Real Estate & Property::Invoicing::RE-INV-1', 1, 0, '2026-10-16T10:00:00Z', '{\"amount_ttc_usd\":1332,\"net_usd\":1200,\"tableTitle\":\"ignored\"}')").run();

  // ---- Seed user seats ----
  const ownerTok = await seedSeat({ id: 'u1', full_name: 'Owner', email: 'owner@isabisystems.com', role: 'Full Access (Owner)', companies: 'All' });
  const mfgNoBooksTok = await seedSeat({ id: 'u_mfg_nb', full_name: 'WTC Sales', email: 'wtc.sales@isabisystems.com', role: 'Sales', companies: 'WTC', pbi_access: 'partial', statements_access: 'none' });
  const holdBooksTok = await seedSeat({ id: 'u_hold_bk', full_name: 'Hold Mgr', email: 'hold@isabisystems.com', role: 'Manager', companies: 'Bdeir Holding', pbi_access: 'full', statements_access: 'full' });
  const holdNoBooksTok = await seedSeat({ id: 'u_hold_nb', full_name: 'Hold Entry', email: 'hold.nb@isabisystems.com', role: 'Entry', companies: 'Bdeir Holding', pbi_access: 'partial', statements_access: 'none' });
  const hospTok = await seedSeat({ id: 'u_hosp', full_name: 'Hosp Mgr', email: 'hosp@isabisystems.com', role: 'Supervisor', companies: 'Blanca, La Una, Palms, Voile, Platinum', pbi_access: 'full', statements_access: 'full' });
  const hospPartialTok = await seedSeat({ id: 'u_hosp_2', full_name: 'Hosp 2-Resort', email: 'hosp2@isabisystems.com', role: 'Supervisor', companies: 'Blanca, La Una', pbi_access: 'full', statements_access: 'full' });
  const trdTok = await seedSeat({ id: 'u_trd', full_name: 'Trd Mgr', email: 'trd@isabisystems.com', role: 'Supervisor', companies: 'Korri Auto, Shacman', pbi_access: 'full', statements_access: 'full' });
  const reTok = await seedSeat({ id: 'u_re', full_name: 'RE Mgr', email: 're@isabisystems.com', role: 'Supervisor', companies: '4235 Company S.A.L, Properties', pbi_access: 'full', statements_access: 'full' });
  const insTok = await seedSeat({ id: 'u_ins', full_name: 'Ins Mgr', email: 'ins@isabisystems.com', role: 'Supervisor', companies: 'Insurance Company', pbi_access: 'full', statements_access: 'full' });
  const expTok = await seedSeat({ id: 'u_exp', full_name: 'Exp Seat', email: 'exp@isabisystems.com', role: 'Manager', companies: 'WTC', pbi_access: 'full', statements_access: 'full' });
  const mfgBooksNoExpTok = await seedSeat({
    id: 'u_mfg_bk_noexp',
    full_name: 'WTC Books NoExp',
    email: 'wtc.books.noexp@isabisystems.com',
    role: 'Custom',
    companies: 'WTC',
    pbi_access: 'custom',
    statements_access: 'custom',
    custom_perms: JSON.stringify({
      rights: { read_fin: true },
      dashboards: { dash_overview: true },
      hubs: { daily_ops: true, cashflow: true, ledger: true, expenses: false }
    })
  });

  console.log('\n[1] Manufacturing RFC 8291 + ES256 VAPID + op:test + op:dispatch_due (Owner vs !canBooks + 10-table till)');
  const epOwner = 'https://fcm.googleapis.com/fcm/send/unit-u1';
  const epMfgNb = 'https://fcm.googleapis.com/fcm/send/unit-mfg-nb';
  await api('day-close-push', { token: ownerTok, body: { op: 'subscribe', scopeKey: 'wtc', lang: 'en', subscription: await makeClientSub(epOwner) } });
  await api('day-close-push', { token: mfgNoBooksTok, body: { op: 'subscribe', scopeKey: 'wtc', lang: 'en', subscription: await makeClientSub(epMfgNb) } });

  const salTwinCount = d1.db.prepare('SELECT COUNT(*) AS c FROM salaries').get().c;
  ok('Canonical salary_payments table used while empty twin `salaries` table stays 0 rows', salTwinCount === 0, salTwinCount);

  fetchLog.length = 0;
  const rTest = await api('day-close-push', { token: ownerTok, body: { op: 'test', title: 'SPOOF', body: 'SPOOF' } });
  const testEvt = fetchLog.find(x => x.url === epOwner);
  ok('op:test ignores spoofed title/body, delivers real computed server digest & passes VAPID + aes128gcm', Boolean(
    rTest.status === 200 && rTest.json?.delivered === 1 && testEvt &&
    testEvt.redirect === 'error' &&
    testEvt.payload.title === `Close of Day · ${TODAY_BEIRUT}` &&
    testEvt.payload.title !== 'SPOOF' &&
    testEvt.payload.body !== 'SPOOF' &&
    /Sales \$555 \(1\)/.test(testEvt.payload.body) &&
    /1 Critical Defects/.test(testEvt.payload.body)
  ), { rTest, testEvt });

  fetchLog.length = 0;
  const rDispMfg = await api('day-close-push', { token: ownerTok, body: { op: 'dispatch_due', force: true, date: '2026-10-15' } });
  const owMsg = fetchLog.find(x => x.url === epOwner)?.payload;
  const nbMsg = fetchLog.find(x => x.url === epMfgNb)?.payload;
  ok('dispatch_due Mfg Owner calculates salary_payments FX, >45d avg7 (-67%), 10-table till (-$400 w/ packed void & 21:00 shift), commission & S1+S2', Boolean(
    rDispMfg.status === 200 && rDispMfg.json?.sentUsers === 2 && owMsg &&
    owMsg.title === 'Close of Day · 2026-10-15' &&
    /Sales \$1,110 \(1\)/.test(owMsg.body) &&
    /Day Loss -\$550/.test(owMsg.body) &&
    /Till Negative -\$400/.test(owMsg.body) &&
    /Sales Below Usual -67%/.test(owMsg.body) &&
    /2 Pending Price/.test(owMsg.body) &&
    /1 Critical Defects/.test(owMsg.body) &&
    /1 Tank Variance/.test(owMsg.body) &&
    /2 Open Alerts/.test(owMsg.body)
  ), { rDispMfg, owMsg });

  ok('dispatch_due Mfg !canBooks redacts Day Loss, Till Negative & S1 (keeps S2 only)', Boolean(
    nbMsg &&
    /Sales \$1,110 \(1\)/.test(nbMsg.body) &&
    !/Day Loss/.test(nbMsg.body) &&
    !/Till Negative/.test(nbMsg.body) &&
    /Sales Below Usual -67%/.test(nbMsg.body) &&
    /2 Pending Price/.test(nbMsg.body) &&
    /1 Critical Defects/.test(nbMsg.body) &&
    /1 Tank Variance/.test(nbMsg.body) &&
    /1 Open Alerts/.test(nbMsg.body)
  ), nbMsg);

  // Unsubscribe Manufacturing seats so next dispatch focuses on partial-exp + all 5 siblings
  await api('day-close-push', { token: ownerTok, body: { op: 'unsubscribe', endpoint: epOwner } });
  await api('day-close-push', { token: mfgNoBooksTok, body: { op: 'unsubscribe', endpoint: epMfgNb } });

  // Verify partial seat (canBooks && !canExp) keeps Till Negative -$400 and redacts Day Loss
  const epMfgBkNoExp = 'https://fcm.googleapis.com/fcm/send/unit-mfg-bk-noexp';
  await api('day-close-push', { token: mfgBooksNoExpTok, body: { op: 'subscribe', scopeKey: 'wtc', lang: 'en', subscription: await makeClientSub(epMfgBkNoExp) } });
  fetchLog.length = 0;
  const rDispPartial = await api('day-close-push', { token: ownerTok, body: { op: 'dispatch_due', force: true, date: '2026-10-15' } });
  const partialMsg = fetchLog.find(x => x.url === epMfgBkNoExp)?.payload;
  ok('dispatch_due Mfg canBooks && !canExp keeps Till Negative -$400 and redacts Day Loss', Boolean(
    rDispPartial.status === 200 && rDispPartial.json?.sentUsers === 1 && partialMsg &&
    /Sales \$1,110 \(1\)/.test(partialMsg.body) &&
    /Till Negative -\$400/.test(partialMsg.body) &&
    !/Day Loss/.test(partialMsg.body)
  ), { rDispPartial, partialMsg });
  await api('day-close-push', { token: mfgBooksNoExpTok, body: { op: 'unsubscribe', endpoint: epMfgBkNoExp } });

  console.log('\n[2] All 5 Sibling Industries + Non-Revenue Expense Dates + Scope RLS + !canBooks Holding Guard');
  const epHold = 'https://fcm.googleapis.com/fcm/send/unit-hold';
  const epHoldNb = 'https://fcm.googleapis.com/fcm/send/unit-hold-nb';
  const epHosp = 'https://fcm.googleapis.com/fcm/send/unit-hosp';
  const epTrd = 'https://fcm.googleapis.com/fcm/send/unit-trd';
  const epRe = 'https://fcm.googleapis.com/fcm/send/unit-re';
  const epIns = 'https://fcm.googleapis.com/fcm/send/unit-ins';

  const rHosp403 = await api('day-close-push', { token: hospPartialTok, body: { op: 'subscribe', scopeKey: 'industry:Hospitality & Resorts', lang: 'en', subscription: await makeClientSub('https://fcm.googleapis.com/fcm/send/unit-hosp-2') } });
  const rHosp200 = await api('day-close-push', { token: hospPartialTok, body: { op: 'prefs', scopeKey: 'blanca', closeHourBeirut: 18, lang: 'en' } });
  ok('Partial-industry seat gets 403 on industry:Hospitality & Resorts and 200 on allowed company blanca', Boolean(
    rHosp403.status === 403 && rHosp200.status === 200 && rHosp200.json?.scopeKey === 'blanca'
  ), { rHosp403, rHosp200 });

  await api('day-close-push', { token: holdBooksTok, body: { op: 'subscribe', scopeKey: 'bdeirholding', closeHourBeirut: 16, lang: 'en', subscription: await makeClientSub(epHold) } });
  await api('day-close-push', { token: holdNoBooksTok, body: { op: 'subscribe', scopeKey: 'bdeirholding', closeHourBeirut: 16, lang: 'en', subscription: await makeClientSub(epHoldNb) } });
  await api('day-close-push', { token: hospTok, body: { op: 'subscribe', scopeKey: 'industry:Hospitality & Resorts', closeHourBeirut: 16, lang: 'fr', subscription: await makeClientSub(epHosp) } });
  await api('day-close-push', { token: trdTok, body: { op: 'subscribe', scopeKey: 'industry:Automotive & Heavy Trading', closeHourBeirut: 16, lang: 'ar', subscription: await makeClientSub(epTrd) } });
  await api('day-close-push', { token: reTok, body: { op: 'subscribe', scopeKey: 'industry:Real Estate & Property', closeHourBeirut: 16, lang: 'en', subscription: await makeClientSub(epRe) } });
  await api('day-close-push', { token: insTok, body: { op: 'subscribe', scopeKey: 'industry:Insurance & Brokerage', closeHourBeirut: 16, lang: 'en', subscription: await makeClientSub(epIns) } });

  fetchLog.length = 0;
  const rDispSib = await api('day-close-push', { token: ownerTok, body: { op: 'dispatch_due', force: true, date: '2026-10-16' } });
  const mHold = fetchLog.find(x => x.url === epHold)?.payload;
  const mHoldNb = fetchLog.find(x => x.url === epHoldNb)?.payload;
  const mHosp = fetchLog.find(x => x.url === epHosp)?.payload;
  const mTrd = fetchLog.find(x => x.url === epTrd)?.payload;
  const mRe = fetchLog.find(x => x.url === epRe)?.payload;
  const mIns = fetchLog.find(x => x.url === epIns)?.payload;

  ok('Holding books seat gets hld_interactions + external_movements & !canBooks Holding gets 0 pushes', Boolean(
    rDispSib.status === 200 && rDispSib.json?.sentUsers === 5 &&
    !mHoldNb &&
    mHold && /Sales \$1,500 \(1\)/.test(mHold.body) && /Day Loss -\$2,500/.test(mHold.body)
  ), { rDispSib, mHold, mHoldNb });

  ok('Hospitality uses Ex-VAT ht_usd (-$50 Perte du jour vs 1,050 usage), ignores purchases_in_usd & excludes non-revenue date (-72% FR)', Boolean(
    mHosp &&
    mHosp.title === 'Clôture du jour · 2026-10-16' &&
    /Ventes \$1,110 \(1\)/.test(mHosp.body) &&
    /Perte du jour -\$50/.test(mHosp.body) &&
    /Ventes sous la moyenne -72%/.test(mHosp.body)
  ), mHosp);

  ok('Trading applies WF void & landed_add_usd patch (AR digest)', Boolean(
    mTrd &&
    mTrd.title === 'إغلاق اليوم · 2026-10-16' &&
    /\$2,000/.test(mTrd.body) &&
    /خسارة اليوم -\$1,000/.test(mTrd.body)
  ), mTrd);

  ok('Real Estate uses Ex-VAT net_usd ($1,332 TTC / $1,200 net vs $1,250 WO => Day Loss -$50) & excludes meta keys', Boolean(
    mRe && /Sales \$1,332 \(1\)/.test(mRe.body) && /Day Loss -\$50/.test(mRe.body)
  ), mRe);

  ok('Insurance uses net_payable_4017 + claim payout for Day Loss', Boolean(
    mIns && /Sales \$500 \(1\)/.test(mIns.body) && /Day Loss -\$250/.test(mIns.body)
  ), mIns);

  console.log('\n[3] Build-ticket lastSentDate dedup, Concurrent TOCTOU Claim CAS & 410 Gone pruning');
  const ticket = issueBuildTicket();
  fetchLog.length = 0;
  const rCronDedup = await api('day-close-push', { token: ticket, body: { op: 'dispatch_due', date: '2026-10-16', hour: 19 } });
  ok('Build-ticket dispatch_due skips seats whose lastSentDate matches targetDate', Boolean(
    rCronDedup.status === 200 && rCronDedup.json?.sentUsers === 0 && fetchLog.length === 0
  ), rCronDedup);

  const epDead = 'https://fcm.googleapis.com/fcm/send/unit-dead-410';
  const epAlive = 'https://fcm.googleapis.com/fcm/send/unit-alive';
  expiredEndpoints.add(epDead);
  await api('day-close-push', { token: expTok, body: { op: 'subscribe', scopeKey: 'wtc', closeHourBeirut: 16, subscription: await makeClientSub(epDead) } });
  await api('day-close-push', { token: expTok, body: { op: 'subscribe', scopeKey: 'wtc', closeHourBeirut: 16, subscription: await makeClientSub(epAlive) } });
  const rGoneTest = await api('day-close-push', { token: expTok, body: { op: 'test' } });
  const rAfterGone = await api('day-close-push', { method: 'GET', token: expTok });
  ok('HTTP 410 endpoint pruned automatically while live endpoint remains active', Boolean(
    rGoneTest.status === 200 && rGoneTest.json?.delivered === 1 && rGoneTest.json?.endpointCount === 1 &&
    rAfterGone.status === 200 && rAfterGone.json?.endpointCount === 1
  ), { rGoneTest, rAfterGone });

  // Concurrent overlapping dispatch_due on '2026-10-17' (6 subscribed seats w/ closeHour 16; u_exp + u_hosp + u_trd + u_re + u_ins + u_hold_bk; u_hold_nb & u_mfg_nb unsub)
  const epOwner2 = 'https://fcm.googleapis.com/fcm/send/unit-u1-conc';
  await api('day-close-push', { token: ownerTok, body: { op: 'subscribe', scopeKey: 'wtc', closeHourBeirut: 16, lang: 'en', subscription: await makeClientSub(epOwner2) } });
  // Only keep ownerTok (epOwner2) and expTok (epAlive) active so deterministic 2 seats fire on 2026-10-17
  for (const tk of [holdBooksTok, holdNoBooksTok, hospTok, trdTok, reTok, insTok]) {
    await api('day-close-push', { token: tk, body: { op: 'unsubscribe' } });
  }
  fetchDelayMs = 20;
  fetchLog.length = 0;
  const ticketA = issueBuildTicket();
  const ticketB = issueBuildTicket();
  const [rConcA, rConcB] = await Promise.all([
    api('day-close-push', { token: ticketA, body: { op: 'dispatch_due', date: '2026-10-17', hour: 19 } }),
    api('day-close-push', { token: ticketB, body: { op: 'dispatch_due', date: '2026-10-17', hour: 19 } })
  ]);
  fetchDelayMs = 0;
  ok('Concurrent overlapping dispatch_due CAS claims before fetch and sends exactly 1x per seat', Boolean(
    rConcA.status === 200 && rConcB.status === 200 &&
    Number(rConcA.json?.sentUsers || 0) + Number(rConcB.json?.sentUsers || 0) === 2 &&
    fetchLog.length === 2 &&
    new Set(fetchLog.map(x => x.url)).size === 2
  ), { rConcA, rConcB, urls: fetchLog.map(x => x.url) });

  console.log('\n[4] CAS 409 conflict surfacing on subscribe, prefs & dispatch_due');
  forceCasConflict = true;
  const rCasPrefs = await api('day-close-push', { token: ownerTok, body: { op: 'prefs', closeHourBeirut: 20, scopeKey: 'wtc' } });
  const rCasSub = await api('day-close-push', { token: ownerTok, body: { op: 'subscribe', scopeKey: 'wtc', subscription: await makeClientSub('https://fcm.googleapis.com/fcm/send/cas-sub') } });
  const rCasDisp = await api('day-close-push', { token: ownerTok, body: { op: 'dispatch_due', force: true, date: '2026-10-16' } });
  forceCasConflict = false;
  ok('Repeated CAS mismatch returns HTTP 409 (never 200) on prefs, subscribe & dispatch_due', Boolean(
    rCasPrefs.status === 409 && rCasSub.status === 409 && rCasDisp.status === 409
  ), { rCasPrefs: rCasPrefs.status, rCasSub: rCasSub.status, rCasDisp: rCasDisp.status });

  // Clean assertion against stored KV doc
  const kvRow = d1.db.prepare('SELECT payload_json FROM edge_kv_store WHERE doc_key = ?').get(PUSH_SUBS_KV_KEY);
  const kvObj = kvRow ? JSON.parse(kvRow.payload_json) : null;
  ok('D1 push store contains valid subs structure & cleared claimToken', Boolean(
    kvObj && kvObj.byUser && kvObj.byUser.u_exp &&
    kvObj.byUser.u_exp.subs.length === 1 &&
    !kvObj.byUser.u_exp.claimToken &&
    kvObj.byUser.u_exp.lastSentDate === '2026-10-17'
  ), kvObj?.byUser?.u_exp);

  fetchLog.length = 0;
  const ticketC1 = issueBuildTicket();
  const ticketC2 = issueBuildTicket();
  const rChunk1 = await api('day-close-push', { token: ticketC1, body: { op: 'dispatch_due', date: '2026-10-18', hour: 19, limit: 1 } });
  const rChunk2 = await api('day-close-push', { token: ticketC2, body: { op: 'dispatch_due', date: '2026-10-18', hour: 19, limit: 1 } });
  ok('Chunked dispatch_due (limit=1) paginates across 2 seats with hasMore=true then false', Boolean(
    rChunk1.status === 200 && rChunk1.json?.sentUsers === 1 && rChunk1.json?.hasMore === true &&
    rChunk2.status === 200 && rChunk2.json?.sentUsers === 1 && rChunk2.json?.hasMore === false &&
    fetchLog.length === 2 &&
    new Set(fetchLog.map(x => x.url)).size === 2
  ), { rChunk1: rChunk1.json, rChunk2: rChunk2.json, urls: fetchLog.map(x => x.url) });

  console.log('\n[5] Service Worker sw.js push & notificationclick runtime test');
  const swCandidates = [
    process.env.ISABI_APP_SRC && new URL('sw.js', `file:///${process.env.ISABI_APP_SRC.replace(/\\/g, '/')}/`),
    new URL('../../isabi-app/sw.js', import.meta.url),
    new URL('../app/sw.js', import.meta.url)
  ].filter(Boolean);
  const swPath = swCandidates.find(p => fs.existsSync(p));
  const swCode = swPath ? fs.readFileSync(swPath, 'utf8') : '';
  const listeners = {};
  const shown = [];
  const opened = [];
  const winClient = {
    url: 'https://isabisystems.com/app/',
    navigated: '',
    focused: false,
    async navigate(u) { this.navigated = u; return this; },
    async focus() { this.focused = true; return this; }
  };
  let clientsList = [winClient];
  const swCtx = {
    URL, Response, Request, Headers, Promise, Set, Map, Array, Object, String, Number, Boolean, Math, Date, JSON, RegExp, Error, console,
    location: new URL('https://isabisystems.com/app/sw.js'),
    origin: 'https://isabisystems.com',
    caches: {
      async open() { return { async addAll() {}, async match() { return null; }, async put() {}, async delete() {} }; },
      async keys() { return []; },
      async match() { return null; },
      async delete() {}
    },
    clients: {
      async matchAll() { return clientsList; },
      async openWindow(u) { opened.push(u); return null; }
    },
    registration: {
      async showNotification(title, options) { shown.push({ title, options }); }
    },
    skipWaiting() {},
    addEventListener(type, fn) { listeners[type] = fn; }
  };
  swCtx.self = swCtx;
  vm.runInNewContext(swCode, swCtx);
  const pushWait = [];
  if (typeof listeners.push === 'function') {
    listeners.push({
      data: { json: () => ({ title: 'Close of Day · 2026-10-17', body: 'Sales $888', url: './#daily_ops', tag: 'isabi-day-close' }) },
      waitUntil(p) { pushWait.push(Promise.resolve(p)); }
    });
  }
  await Promise.all(pushWait);
  const clickWait = [];
  if (typeof listeners.notificationclick === 'function') {
    listeners.notificationclick({
      notification: { data: { url: 'https://evil.example/phish' }, close() {} },
      waitUntil(p) { clickWait.push(Promise.resolve(p)); }
    });
  }
  await Promise.all(clickWait);
  ok('sw.js registers push & notificationclick, shows ./icon-192.png notification, and clamps evil URL to app scope', Boolean(
    typeof listeners.push === 'function' &&
    typeof listeners.notificationclick === 'function' &&
    shown.length === 1 &&
    shown[0].options?.icon === './icon-192.png' &&
    shown[0].options?.data?.url === './#daily_ops' &&
    winClient.navigated === 'https://isabisystems.com/app/#daily_ops' &&
    winClient.focused === true &&
    opened.length === 0
  ), { swPath: swPath && swPath.href, shown, winClient });

  console.log('\n[6] Red-Team Pass 5 regressions: queue starvation, shared endpoint, 21:00 carry-over, D1 Holding overrides, sibling AR & test RLS');
  // 6a. dispatch_due with limit=2 and leading deliveredUser===0 seats (!canBooks Holding + 503 failure) advances to trailing seats
  const tokHldNoBooks = await seedSeat({
    id: 'u_q_hld_nobooks',
    full_name: 'Holding Sales Viewer',
    email: 'hld-nobooks@bhfirms.com',
    role: 'Entry',
    companies: 'Bdeir Holding',
    pbi_access: 'partial',
    statements_access: 'none'
  });
  const tokFail503 = await seedSeat({ id: 'u_q_fail503', full_name: 'Failing Ep User', email: 'fail503@wtc-lb.com', role: 'Entry', companies: 'WTC' });
  const tokQ1 = await seedSeat({ id: 'u_q_ok1', full_name: 'Queue Good 1', email: 'qok1@wtc-lb.com', role: 'Entry', companies: 'WTC' });
  const tokQ2 = await seedSeat({ id: 'u_q_ok2', full_name: 'Queue Good 2', email: 'qok2@wtc-lb.com', role: 'Entry', companies: 'WTC' });
  d1.db.prepare("INSERT INTO sales_tickets (id, company, date, product, uom, qty, method, total, total_ttc, vat, source, voided) VALUES ('ST-20', 'WTC', '2026-10-20', 'Mix 300', 'm3', 4, 'Credit', 400, 444, 44, 'app', 0)").run();
  d1.db.prepare('DELETE FROM edge_kv_store WHERE doc_key = ?').run(PUSH_SUBS_KV_KEY);
  const fail503Ep = 'https://fcm.googleapis.com/fcm/send/fail503-ep';
  const q1Ep = 'https://fcm.googleapis.com/fcm/send/q1-ep';
  const q2Ep = 'https://fcm.googleapis.com/fcm/send/q2-ep';
  const sharedEp = 'https://fcm.googleapis.com/fcm/send/shared-device-ep';
  await api('day-close-push', { token: tokHldNoBooks, body: { op: 'subscribe', closeHourBeirut: 18, scopeKey: 'bdeirholding', subscription: await makeClientSub('https://fcm.googleapis.com/fcm/send/hld-nb-ep') } });
  await api('day-close-push', { token: tokFail503, body: { op: 'subscribe', closeHourBeirut: 18, scopeKey: 'wtc', subscription: await makeClientSub(fail503Ep) } });
  await api('day-close-push', { token: tokQ1, body: { op: 'subscribe', closeHourBeirut: 18, scopeKey: 'wtc', subscription: await makeClientSub(q1Ep) } });
  await api('day-close-push', { token: tokQ2, body: { op: 'subscribe', closeHourBeirut: 18, scopeKey: 'wtc', subscription: await makeClientSub(q2Ep) } });

  const prevFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url) === fail503Ep) return new Response('upstream 503', { status: 503 });
    return prevFetch(url, init);
  };
  let qOk = false;
  try {
    fetchLog.length = 0;
    const rq1 = await api('day-close-push', { token: issueBuildTicket(), body: { op: 'dispatch_due', date: '2026-10-20', hour: 19, limit: 2 } });
    const rq2 = await api('day-close-push', { token: issueBuildTicket(), body: { op: 'dispatch_due', date: '2026-10-20', hour: 19, limit: 2 } });
    const kvAfterQ = d1.db.prepare('SELECT payload_json FROM edge_kv_store WHERE doc_key = ?').get(PUSH_SUBS_KV_KEY);
    const stAfterQ = kvAfterQ ? JSON.parse(kvAfterQ.payload_json) : {};
    qOk = Boolean(
      rq1.status === 200 && rq1.json?.sentUsers === 0 && rq1.json?.hasMore === true &&
      rq2.status === 200 && rq2.json?.sentUsers === 2 && rq2.json?.hasMore === false &&
      stAfterQ.byUser?.u_q_ok1?.lastSentDate === '2026-10-20' &&
      stAfterQ.byUser?.u_q_ok2?.lastSentDate === '2026-10-20' &&
      stAfterQ.byUser?.u_q_fail503?.attemptDate === '2026-10-20' &&
      Number(stAfterQ.byUser?.u_q_fail503?.retryAfterMs || 0) > Date.now()
    );
  } finally {
    globalThis.fetch = prevFetch;
  }
  ok('dispatch_due advances past deliveredUser=0 seats via skip cooldown without starving tail', qOk);

  // 6b. Shared-browser op:subscribe strips endpoint from prior seat
  await api('day-close-push', { token: tokQ1, body: { op: 'subscribe', closeHourBeirut: 18, scopeKey: 'wtc', subscription: await makeClientSub(sharedEp) } });
  await api('day-close-push', { token: tokQ2, body: { op: 'subscribe', closeHourBeirut: 18, scopeKey: 'wtc', subscription: await makeClientSub(sharedEp) } });
  const kvShare = JSON.parse(d1.db.prepare('SELECT payload_json FROM edge_kv_store WHERE doc_key = ?').get(PUSH_SUBS_KV_KEY).payload_json);
  const shareOk = Boolean(
    !(kvShare.byUser?.u_q_ok1?.subs || []).some(s => s && s.endpoint === sharedEp) &&
    (kvShare.byUser?.u_q_ok2?.subs || []).some(s => s && s.endpoint === sharedEp)
  );
  ok('Shared browser op:subscribe strips duplicate endpoint from previous user seat', shareOk, { u1: kvShare.byUser?.u_q_ok1?.subs, u2: kvShare.byUser?.u_q_ok2?.subs });

  // 6c. Manufacturing 21:00 after-hours carry-over into next day and out of D-1
  await api('day-close-push', { token: ownerTok, body: { op: 'subscribe', scopeKey: 'wtc', lang: 'en', subscription: await makeClientSub(epOwner) } });
  d1.db.prepare("INSERT INTO sales_tickets (id, company, date, time, product, uom, qty, method, total, total_ttc, vat, source, voided) VALUES ('ST-AH-21', 'WTC', '2026-10-21', '21:00', 'Mix 300', 'm3', 20, 'Credit', 2000, 2220, 220, 'workbook', 0)").run();
  d1.db.prepare("INSERT INTO sales_tickets (id, company, date, time, product, uom, qty, method, total, total_ttc, vat, source, voided) VALUES ('ST-DAY-22', 'WTC', '2026-10-22', '10:00', 'Mix 300', 'm3', 10, 'Credit', 1000, 1110, 110, 'app', 0)").run();
  fetchLog.length = 0;
  await api('day-close-push', { token: ownerTok, body: { op: 'test', company: 'wtc', targetDate: '2026-10-21', lang: 'en' } });
  await api('day-close-push', { token: ownerTok, body: { op: 'test', company: 'wtc', targetDate: '2026-10-22', lang: 'en' } });
  const p21 = fetchLog[fetchLog.length - 2]?.payload;
  const p22 = fetchLog[fetchLog.length - 1]?.payload;
  ok('Manufacturing 21:00 after-hours workbook ticket shifts out of D-1 into D in Edge push digest', Boolean(
    p21 && /Close of Day · 2026-10-21/.test(p21.title) && /Sales \$0 \(0\)/.test(p21.body) &&
    p22 && /Close of Day · 2026-10-22/.test(p22.title) && /Sales \$3,330 \(2\)/.test(p22.body)
  ), { p21, p22 });

  // 6d. Holding D1 external_movements edits & void tombstones override seedLegs
  const seedInd = r2Store.get('seeds/seed_industries.json');
  seedInd.tables['holding.sisterExternalLegs'] = [
    { id: 'HLD-SEED-EDIT', company: 'Bdeir Holding', party: 'WTC', date: '2026-10-22', direction: 'In', usd_amount: 1000 },
    { id: 'HLD-SEED-VOID', company: 'Bdeir Holding', party: 'BBConstruction', date: '2026-10-22', direction: 'In', usd_amount: 5000 }
  ];
  r2Store.set('seeds/seed_industries.json', seedInd);
  d1.db.prepare("INSERT INTO external_movements (id, company, date, type, method, amount, usd_amount, lbp_amount, source, voided, payload_json) VALUES ('HLD-SEED-EDIT', 'Bdeir Holding', '2026-10-22', 'In', 'Cash', 7500, 7500, 0, 'app', 0, '{\"party\":\"WTC\",\"direction\":\"In\"}')").run();
  d1.db.prepare("INSERT INTO external_movements (id, company, date, type, method, amount, usd_amount, lbp_amount, source, voided, payload_json) VALUES ('HLD-SEED-VOID', 'Bdeir Holding', '2026-10-22', 'In', 'Cash', 5000, 5000, 0, 'app', 1, '{\"party\":\"BBConstruction\",\"direction\":\"In\"}')").run();
  fetchLog.length = 0;
  await api('day-close-push', { token: ownerTok, body: { op: 'test', company: 'bdeirholding', targetDate: '2026-10-22', lang: 'en' } });
  const hldTestPayload = fetchLog[fetchLog.length - 1]?.payload;
  ok('Holding D1 external_movements edit ($7,500) & void tombstone suppress stale seedLegs ($1,000/$5,000)', Boolean(
    hldTestPayload && /Sales \$7,500 \(1\)/.test(hldTestPayload.body)
  ), hldTestPayload);

  // 6e. Sibling Arabic body omits Mfg word نقلة AND op:test enforces RLS on company override
  const entryTest403 = await api('day-close-push', { token: mfgNoBooksTok, body: { op: 'test', company: 'blanca', targetDate: '2026-10-16', lang: 'ar' } });
  fetchLog.length = 0;
  const hspArTest = await api('day-close-push', { token: ownerTok, body: { op: 'test', company: 'blanca', targetDate: '2026-10-16', lang: 'ar' } });
  const hspArBody = String(fetchLog[fetchLog.length - 1]?.payload?.body || '');
  ok('op:test honors company/targetDate/lang with 403 RLS & sibling Arabic omits نقلة', Boolean(
    entryTest403.status === 403 &&
    hspArTest.status === 200 &&
    hspArBody.includes('1,110') &&
    !/نقلة/.test(hspArBody)
  ), { entry403: entryTest403.status, hspArTest: hspArTest.json, hspArBody });
} finally {
  globalThis.fetch = origFetch;
}

console.log(`\nverify_web_push_unit summary: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
