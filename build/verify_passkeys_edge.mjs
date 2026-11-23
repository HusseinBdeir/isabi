// build/verify_passkeys_edge.mjs — Offline & Local-HTTP Gate for WebAuthn FIDO2 Passkeys:
// 1. Cloudflare Edge (`functions/app/api/[[route]].js` + `functions/_lib/webauthn.js` + `d1_store.js`)
//    using real ES256 (P-256) and RS256 (RSA-2048) keys + bounded CBOR attestation/assertion builders.
// 2. Local SQLite (`isabi-app/server.py`) 1:1 HTTP parity over http://localhost:<port>.
// Covers: stepup_ok:<sid> gate & logout wipe, ED=1 trailing CBOR extensions, discoverable & scoped
// sign-in across either/face_only/both (and pin_only rejection), step_up lease/binding,
// verify-override passkey_assertion + BU RLS, replay/clone/UV=0/RP/Origin/IP-host/CAP(<10)/role
// rejection, Demo 403, and Owner/Self revocation.
// Run: node build/verify_passkeys_edge.mjs   (Node 22.5+)

import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { onRequest } from '../functions/app/api/[[route]].js';
import { decodeCborFirst, derEcdsaToP1363 } from '../functions/_lib/webauthn.js';
import { signEdgeSession } from '../functions/_lib/security.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ISABI_ROOT = path.resolve(HERE, '..');
const APP_ROOT = process.env.ISABI_APP_SRC || path.resolve(ISABI_ROOT, '..', 'isabi-app');

let passed = 0;
let failed = 0;
function check(label, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.error(`  FAIL ${label}${detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
  }
}

const b64u = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const sha256 = buf => crypto.createHash('sha256').update(buf).digest();

// Minimal deterministic CBOR encoder for generating real WebAuthn COSE keys & attestationObjects in tests
function cborUintHeader(major, val) {
  const m = major << 5;
  if (val < 24) return Buffer.from([m | val]);
  if (val < 256) return Buffer.from([m | 24, val]);
  if (val < 65536) { const b = Buffer.alloc(3); b[0] = m | 25; b.writeUInt16BE(val, 1); return b; }
  const b = Buffer.alloc(5); b[0] = m | 26; b.writeUInt32BE(val, 1); return b;
}
function cborEncode(val) {
  if (typeof val === 'number' && Number.isInteger(val)) {
    return val >= 0 ? cborUintHeader(0, val) : cborUintHeader(1, -1 - val);
  }
  if (Buffer.isBuffer(val) || val instanceof Uint8Array) {
    return Buffer.concat([cborUintHeader(2, val.length), Buffer.from(val)]);
  }
  if (typeof val === 'string') {
    const u = Buffer.from(val, 'utf8');
    return Buffer.concat([cborUintHeader(3, u.length), u]);
  }
  if (typeof val === 'boolean') return Buffer.from([val ? 0xf5 : 0xf4]);
  if (Array.isArray(val)) {
    return Buffer.concat([cborUintHeader(4, val.length), ...val.map(cborEncode)]);
  }
  if (val instanceof Map) {
    const parts = [cborUintHeader(5, val.size)];
    for (const [k, v] of val.entries()) {
      parts.push(cborEncode(k), cborEncode(v));
    }
    return Buffer.concat(parts);
  }
  if (val && typeof val === 'object') {
    const entries = Object.entries(val);
    const parts = [cborUintHeader(5, entries.length)];
    for (const [k, v] of entries) {
      parts.push(cborEncode(k), cborEncode(v));
    }
    return Buffer.concat(parts);
  }
  throw new Error('Unsupported test CBOR type: ' + typeof val);
}

// Create synthetic software authenticator (supports ES256 P-256 & RS256 RSA-2048)
function makeVirtualKey(alg = -7) {
  const credId = crypto.randomBytes(32);
  let coseMap, privKey;
  if (alg === -7) {
    const kp = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    privKey = kp.privateKey;
    const jwk = kp.publicKey.export({ format: 'jwk' });
    const x = Buffer.from(jwk.x, 'base64url');
    const y = Buffer.from(jwk.y, 'base64url');
    coseMap = new Map([[1, 2], [3, -7], [-1, 1], [-2, x], [-3, y]]);
  } else {
    const kp = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    privKey = kp.privateKey;
    const jwk = kp.publicKey.export({ format: 'jwk' });
    const n = Buffer.from(jwk.n, 'base64url');
    const e = Buffer.from(jwk.e, 'base64url');
    coseMap = new Map([[1, 3], [3, -257], [-1, n], [-2, e]]);
  }
  const coseBytes = cborEncode(coseMap);
  return {
    alg,
    credId,
    credIdB64u: b64u(credId),
    coseBytes,
    signCount: 0,
    buildRegistration({ challengeB64u, origin, rpId, withExtensions = false, flagsOverride = null }) {
      const rpHash = sha256(Buffer.from(rpId, 'utf8'));
      const flags = flagsOverride != null ? flagsOverride : (0x01 | 0x04 | 0x40 | (withExtensions ? 0x80 : 0));
      const hdr = Buffer.alloc(5);
      hdr[0] = flags;
      hdr.writeUInt32BE(0, 1);
      const aaguid = crypto.randomBytes(16);
      const cidLen = Buffer.alloc(2);
      cidLen.writeUInt16BE(credId.length, 0);
      const extBytes = withExtensions ? cborEncode({ credProps: { rk: true } }) : Buffer.alloc(0);
      const authData = Buffer.concat([rpHash, hdr, aaguid, cidLen, credId, coseBytes, extBytes]);
      const attObj = cborEncode({ fmt: 'none', attStmt: {}, authData });
      const clientData = Buffer.from(JSON.stringify({
        type: 'webauthn.create',
        challenge: challengeB64u,
        origin,
        crossOrigin: false
      }), 'utf8');
      return {
        id: b64u(credId),
        rawId: b64u(credId),
        type: 'public-key',
        response: {
          clientDataJSON: b64u(clientData),
          attestationObject: b64u(attObj),
          transports: ['internal']
        }
      };
    },
    buildAssertion({ challengeB64u, origin, rpId, userId = '', signCount = null, flags = 0x05, tamperSig = false, credIdOverride = null }) {
      const sc = signCount == null ? (++this.signCount) : signCount;
      const rpHash = sha256(Buffer.from(rpId, 'utf8'));
      const tail = Buffer.alloc(5);
      tail[0] = flags;
      tail.writeUInt32BE(sc >>> 0, 1);
      const authData = Buffer.concat([rpHash, tail]);
      const clientData = Buffer.from(JSON.stringify({
        type: 'webauthn.get',
        challenge: challengeB64u,
        origin,
        crossOrigin: false
      }), 'utf8');
      const signed = Buffer.concat([authData, sha256(clientData)]);
      let sig = crypto.sign('sha256', signed, privKey);
      if (tamperSig) {
        sig = Buffer.from(sig);
        sig[sig.length - 1] ^= 0xff;
      }
      const cidUse = credIdOverride || credId;
      return {
        id: b64u(cidUse),
        rawId: b64u(cidUse),
        type: 'public-key',
        response: {
          clientDataJSON: b64u(clientData),
          authenticatorData: b64u(authData),
          signature: b64u(sig),
          userHandle: userId ? b64u(Buffer.from(userId, 'utf8')) : ''
        }
      };
    }
  };
}

// Hash password using the exact pbkdf2$sha256$100000$<b64u_salt>$<b64u_hash> format
function hashTestPin(pin) {
  const salt = crypto.randomBytes(16);
  const dk = crypto.pbkdf2Sync(String(pin), salt, 100000, 32, 'sha256');
  return `pbkdf2$sha256$100000$${b64u(salt)}$${b64u(dk)}`;
}

// D1 stand-in (same semantics as verify_device_unsent.mjs)
class Stmt {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...p) { return new Stmt(this.db, this.sql, p); }
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
}

async function runPartAEdge() {
  console.log('\n--- Part A: Cloudflare Edge WebAuthn FIDO2 Tests ---');
  const d1 = new D1();
  d1.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, full_name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, pin_code TEXT DEFAULT '',
      role TEXT NOT NULL DEFAULT 'Entry', companies TEXT NOT NULL DEFAULT 'WTC', pbi_access TEXT DEFAULT 'full',
      statements_access TEXT DEFAULT 'full', status TEXT DEFAULT 'Active', last_login_at TEXT DEFAULT '',
      face_samples TEXT DEFAULT '[]', face_thumbs TEXT DEFAULT '[]', face_required INTEGER DEFAULT 0,
      face_updated_at TEXT DEFAULT '', seat_updated_at TEXT DEFAULT '', custom_perms TEXT DEFAULT '{}',
      auth_mode TEXT DEFAULT '', payload_json TEXT DEFAULT '{}'
    );
    CREATE TABLE auth_sessions (
      id TEXT PRIMARY KEY, user_id TEXT DEFAULT '', email TEXT DEFAULT '', full_name TEXT DEFAULT '',
      role TEXT DEFAULT '', companies TEXT DEFAULT '', device TEXT DEFAULT '', logged_in_at TEXT DEFAULT '',
      method TEXT DEFAULT 'PIN', confidence REAL, ip_hash TEXT DEFAULT ''
    );
    CREATE TABLE edge_kv_store (
      doc_key TEXT PRIMARY KEY, payload_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL DEFAULT '',
      updated_by TEXT DEFAULT '', rev INTEGER DEFAULT 1
    );
  `);
  const env = { DB: d1, ISABI_JWT_SECRET: 'passkeys-edge-secret-' + crypto.randomBytes(12).toString('hex') };

  const mkFaceVec = idx => { const v = new Array(128).fill(0.01); v[idx] = 0.85; return v; };
  const seats = [
    { id: 'u1', name: 'Audit Owner', email: 'owner@isabi.test', role: 'Full Access (Owner)', cos: 'All', pin: '4321', mode: 'either', face: mkFaceVec(1) },
    { id: 'u3', name: 'WTC Supervisor', email: 'wtc.sup@isabi.test', role: 'Supervisor', cos: 'WTC', pin: '5678', mode: 'both', face: mkFaceVec(3) },
    { id: 'u4', name: 'BBC Supervisor', email: 'bbc.sup@isabi.test', role: 'Supervisor', cos: 'BBConstruction', pin: '6789', mode: 'face_only', face: mkFaceVec(4) },
    { id: 'u7', name: 'WTC Entry', email: 'wtc.entry@isabi.test', role: 'Entry', cos: 'WTC', pin: '7890', mode: 'either', face: mkFaceVec(7) }
  ];
  const tokens = {};
  for (const s of seats) {
    d1.db.prepare('INSERT INTO users (id, full_name, email, pin_code, role, companies, auth_mode, face_samples) VALUES (?,?,?,?,?,?,?,?)')
      .run(s.id, s.name, s.email, hashTestPin(s.pin), s.role, s.cos, s.mode, JSON.stringify([s.face]));
    const sid = `sess-${s.id}-init`;
    d1.db.prepare('INSERT INTO auth_sessions (id, user_id, email, full_name, role, companies) VALUES (?,?,?,?,?,?)')
      .run(sid, s.id, s.email, s.name, s.role, s.cos);
    tokens[s.id] = await signEdgeSession({ sid, sub: s.id, email: s.email, role: s.role, companies: s.cos, pbi: 'full' }, env);
  }

  async function api(routePath, { method = 'POST', body = {}, headers = {}, baseUrl = 'https://isabisystems.com/app/api/' } = {}) {
    const h = Object.assign({ 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' }, headers);
    const req = new Request(baseUrl + routePath, {
      method,
      headers: h,
      body: method === 'GET' ? undefined : JSON.stringify(body)
    });
    const res = await onRequest({ request: req, env, params: { route: routePath.split('/') } });
    const txt = await res.text();
    let json = null;
    try { json = JSON.parse(txt); } catch (_) {}
    return { status: res.status, json, headers: res.headers };
  }

  // Test CBOR extension stop & canonical DER checks directly
  const extSample = Buffer.concat([cborEncode(new Map([[1, 2], [3, -7]])), cborEncode({ credProps: { rk: true } })]);
  const parsedFirst = decodeCborFirst(new Uint8Array(extSample), 0, 0);
  check('decodeCborFirst stops cleanly before trailing ED=1 extension map', parsedFirst.value instanceof Map && parsedFirst.nextOffset < extSample.length);
  const badDer = Uint8Array.from([0x30, 0x0b, 0x02, 0x02, 0x00, 0x01, 0x02, 0x01, 0x01]);
  check('derEcdsaToP1363 rejects non-minimal leading-zero DER integer', derEcdsaToP1363(badDer) === null);

  // 1. Guards: unauth, demo, raw IP, cross-origin
  check('unauthenticated register_options returns 401', (await api('auth/passkeys', { body: { action: 'register_options' } })).status === 401);
  check('Demo header X-ISABI-Demo: 1 rejected 403', (await api('auth/passkeys', { body: { action: 'auth_options', purpose: 'login' }, headers: { 'X-ISABI-Demo': '1' } })).status === 403);
  check('raw IP hostname (http://127.0.0.1) rejected 400', (await api('auth/passkeys', { baseUrl: 'http://127.0.0.1/app/api/', body: { action: 'auth_options', purpose: 'login' } })).status === 400);
  check('cross-origin Origin header rejected 403', (await api('auth/passkeys', { body: { action: 'auth_options', purpose: 'login' }, headers: { Origin: 'https://evil.example' } })).status === 403);

  // 2. Fresh stepup_ok:<sid> gate & eligibility
  const noStepUp = await api('auth/passkeys', { body: { action: 'register_options' }, headers: { 'X-ISABI-Session': tokens.u1 } });
  check('register_options without fresh stepup_ok:<sid> rejected 403', noStepUp.status === 403 && noStepUp.json.step_up_required === true, noStepUp);

  const crossSeatReg = await api('auth/passkeys', { body: { action: 'register_options', user_id: 'u3' }, headers: { 'X-ISABI-Session': tokens.u1 } });
  check('register_options targeting different user_id rejected 403', crossSeatReg.status === 403);

  const entryStepUp = await api('auth/login', { body: { email: 'wtc.entry@isabi.test', pin: '7890', method: 'PIN', step_up: true, verify_only: true }, headers: { 'X-ISABI-Session': tokens.u7 } });
  check('Entry step_up succeeds', entryStepUp.status === 200 && entryStepUp.json.ok);
  const entryReg = await api('auth/passkeys', { body: { action: 'register_options' }, headers: { 'X-ISABI-Session': tokens.u7 } });
  check('Entry seat ineligible for passkey registration (403)', entryReg.status === 403);

  // 3. Owner ES256 registration with ED=1 extension map + handleUsersGet check
  const ownerStepUp = await api('auth/login', { body: { email: 'owner@isabi.test', pin: '4321', method: 'PIN', step_up: true, verify_only: true }, headers: { 'X-ISABI-Session': tokens.u1 } });
  check('Owner /api/auth/login step_up writes stepup_ok receipt', ownerStepUp.status === 200 && Boolean(d1.db.prepare("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'stepup_ok:sess-u1-init'").get()));

  const keyOwnerEs256 = makeVirtualKey(-7);
  const regOptOwner = await api('auth/passkeys', { body: { action: 'register_options' }, headers: { 'X-ISABI-Session': tokens.u1 } });
  check('Owner register_options succeeds after step-up', regOptOwner.status === 200 && Boolean(regOptOwner.json.challengeId));
  const regVerOwner = await api('auth/passkeys', {
    body: {
      action: 'register_verify',
      challengeId: regOptOwner.json.challengeId,
      device_label: 'Owner Mac Touch ID',
      credential: keyOwnerEs256.buildRegistration({
        challengeB64u: regOptOwner.json.options.challenge,
        origin: 'https://isabisystems.com',
        rpId: 'isabisystems.com',
        withExtensions: true
      })
    },
    headers: { 'X-ISABI-Session': tokens.u1 }
  });
  check('Owner ES256 passkey registration (with ED=1 extensions) succeeds', regVerOwner.status === 200 && regVerOwner.json.passkey.alg === -7, regVerOwner);

  const usersViewOwner = await api('users', { method: 'GET', headers: { 'X-ISABI-Session': tokens.u1 } });
  const ownerRowGet = (usersViewOwner.json.users || []).find(u => u.id === 'u1');
  check('handleUsersGet returns passkey_count/passkeys_enrolled/passkeys for Owner', ownerRowGet && ownerRowGet.passkey_count === 1 && ownerRowGet.passkeys_enrolled === true && Array.isArray(ownerRowGet.passkeys));

  // 4. Supervisor RS256 registration (both mode requires Face ID + PIN step-up)
  const supPinOnly = await api('auth/login', { body: { email: 'wtc.sup@isabi.test', pin: '5678', method: 'PIN', step_up: true, verify_only: true }, headers: { 'X-ISABI-Session': tokens.u3 } });
  check('Supervisor both mode rejects PIN-only step_up (403)', supPinOnly.status === 403);
  await api('auth/login', { body: { email: 'wtc.sup@isabi.test', pin: '5678', face_descriptor: mkFaceVec(3), method: 'Face ID + PIN', step_up: true, verify_only: true }, headers: { 'X-ISABI-Session': tokens.u3 } });
  const keySupRs256 = makeVirtualKey(-257);
  const regOptSup = await api('auth/passkeys', { body: { action: 'register_options' }, headers: { 'X-ISABI-Session': tokens.u3 } });
  const regVerSup = await api('auth/passkeys', {
    body: {
      action: 'register_verify',
      challengeId: regOptSup.json.challengeId,
      device_label: 'Supervisor YubiKey RS256',
      credential: keySupRs256.buildRegistration({
        challengeB64u: regOptSup.json.options.challenge,
        origin: 'https://isabisystems.com',
        rpId: 'isabisystems.com'
      })
    },
    headers: { 'X-ISABI-Session': tokens.u3 }
  });
  check('Supervisor RS256 (-257) passkey registration succeeds', regVerSup.status === 200 && regVerSup.json.passkey.alg === -257, regVerSup);

  // Also register BBC Supervisor (face_only)
  const bbcSid = 'sess-u4-init';
  d1.db.prepare("INSERT OR REPLACE INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES (?, ?, ?, 'u4', 1)")
    .run(`stepup_ok:${bbcSid}`, JSON.stringify({ userId: 'u4', verifiedAtMs: Date.now(), method: 'PIN' }), new Date().toISOString());
  const keyBbcEs256 = makeVirtualKey(-7);
  const regOptBbc = await api('auth/passkeys', { body: { action: 'register_options' }, headers: { 'X-ISABI-Session': tokens.u4 } });
  await api('auth/passkeys', {
    body: {
      action: 'register_verify',
      challengeId: regOptBbc.json.challengeId,
      credential: keyBbcEs256.buildRegistration({ challengeB64u: regOptBbc.json.options.challenge, origin: 'https://isabisystems.com', rpId: 'isabisystems.com' })
    },
    headers: { 'X-ISABI-Session': tokens.u4 }
  });

  // 5. Login across either, both, face_only + verifyEdgeSession accepts minted session
  const logOpt1 = await api('auth/passkeys', { body: { action: 'auth_options', purpose: 'login' } });
  check('auth_options login uses empty allowCredentials (zero enumeration oracle)', Array.isArray(logOpt1.json.options.allowCredentials) && logOpt1.json.options.allowCredentials.length === 0);
  const assertionLoginOwner = keyOwnerEs256.buildAssertion({ challengeB64u: logOpt1.json.options.challenge, origin: 'https://isabisystems.com', rpId: 'isabisystems.com', userId: 'u1' });
  const logVerOwner = await api('auth/passkeys', { body: { action: 'auth_verify', purpose: 'login', challengeId: logOpt1.json.challengeId, credential: assertionLoginOwner } });
  check('discoverable ES256 login (either) returns 200 Passkey (FIDO2) & valid /api/auth/me token', logVerOwner.status === 200 && logVerOwner.json.method === 'Passkey (FIDO2)' && Boolean(logVerOwner.json.token), logVerOwner);
  const jwtPart = String(logVerOwner.json.token || '').split('.')[1] || '';
  const jwtClaims = jwtPart ? JSON.parse(Buffer.from(jwtPart, 'base64url').toString('utf8')) : {};
  check('Edge passkey login JWT embeds name, stmts, and ws_write claims', jwtClaims.name === 'Audit Owner' && jwtClaims.stmts === 'full' && jwtClaims.ws_write === true, jwtClaims);
  const meCheck = await api('auth/me', { method: 'GET', headers: { 'X-ISABI-Session': logVerOwner.json.token } });
  check('/api/auth/me validates minted passkey Edge session & attaches passkeys metadata',
    meCheck.status === 200 && meCheck.json.authenticated === true &&
    meCheck.json.user.passkey_count === 1 && meCheck.json.user.passkeys_enrolled === true && Array.isArray(meCheck.json.user.passkeys) && meCheck.json.user.passkeys.length === 1,
    meCheck);
  const pinLoginMeta = await api('auth/login', { body: { email: 'owner@isabi.test', pin: '4321', method: 'PIN' } });
  check('Edge PIN /api/auth/login attaches passkeys metadata',
    pinLoginMeta.status === 200 && pinLoginMeta.json.user.passkey_count === 1 && pinLoginMeta.json.user.passkeys_enrolled === true && Array.isArray(pinLoginMeta.json.user.passkeys),
    pinLoginMeta);

  // Replay exact same challengeId fails!
  const replayRes = await api('auth/passkeys', { body: { action: 'auth_verify', purpose: 'login', challengeId: logOpt1.json.challengeId, credential: assertionLoginOwner } });
  check('single-use challenge replay rejected 401', replayRes.status === 401);

  // Both mode RS256 login
  const logOpt2 = await api('auth/passkeys', { body: { action: 'auth_options', purpose: 'login' } });
  const logVerSup = await api('auth/passkeys', {
    body: {
      action: 'auth_verify',
      purpose: 'login',
      challengeId: logOpt2.json.challengeId,
      email: 'wtc.sup@isabi.test',
      credential: keySupRs256.buildAssertion({ challengeB64u: logOpt2.json.options.challenge, origin: 'https://isabisystems.com', rpId: 'isabisystems.com', userId: 'u3' })
    }
  });
  check('seat-scoped RS256 login bypasses both PIN prompt with UV=1', logVerSup.status === 200 && logVerSup.json.user.id === 'u3', logVerSup);

  // face_only mode login
  const logOpt3 = await api('auth/passkeys', { body: { action: 'auth_options', purpose: 'login' } });
  const logVerBbc = await api('auth/passkeys', {
    body: {
      action: 'auth_verify',
      purpose: 'login',
      challengeId: logOpt3.json.challengeId,
      credential: keyBbcEs256.buildAssertion({ challengeB64u: logOpt3.json.options.challenge, origin: 'https://isabisystems.com', rpId: 'isabisystems.com', userId: 'u4' })
    }
  });
  check('passkey login works on face_only seat', logVerBbc.status === 200 && logVerBbc.json.user.id === 'u4');

  // pin_only mode rejection across login, enrolment, step_up, and verify-override
  d1.db.prepare("INSERT OR REPLACE INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES (?, ?, ?, 'u4', 1)")
    .run('stepup_ok:sess-u4-init', JSON.stringify({ userId: 'u4', verifiedAtMs: Date.now(), method: 'PIN' }), new Date().toISOString());
  const prePinOnlyRegOpt = await api('auth/passkeys', { body: { action: 'register_options' }, headers: { 'X-ISABI-Session': tokens.u4 } });
  const prePinOnlySuOpt = await api('auth/passkeys', { body: { action: 'auth_options', purpose: 'step_up' }, headers: { 'X-ISABI-Session': tokens.u4 } });
  const prePinOnlyOvOpt = await api('auth/passkeys', { body: { action: 'auth_options', purpose: 'verify_override', company: 'BBConstruction' }, headers: { 'X-ISABI-Session': tokens.u1 } });
  d1.db.prepare("UPDATE users SET auth_mode = 'pin_only' WHERE id = 'u4'").run();
  const logOptPinOnly = await api('auth/passkeys', { body: { action: 'auth_options', purpose: 'login' } });
  const logVerPinOnly = await api('auth/passkeys', {
    body: {
      action: 'auth_verify',
      purpose: 'login',
      challengeId: logOptPinOnly.json.challengeId,
      credential: keyBbcEs256.buildAssertion({ challengeB64u: logOptPinOnly.json.options.challenge, origin: 'https://isabisystems.com', rpId: 'isabisystems.com', userId: 'u4' })
    }
  });
  check('passkey login rejected 401 on pin_only seat', logVerPinOnly.status === 401);
  const regOptPinOnly = await api('auth/passkeys', { body: { action: 'register_options' }, headers: { 'X-ISABI-Session': tokens.u4 } });
  check('pin_only seat register_options rejected 403', regOptPinOnly.status === 403, regOptPinOnly);
  const pinOnlyExtraKey = makeVirtualKey(-7);
  const regVerPinOnly = await api('auth/passkeys', {
    body: {
      action: 'register_verify',
      challengeId: prePinOnlyRegOpt.json.challengeId,
      credential: pinOnlyExtraKey.buildRegistration({ challengeB64u: prePinOnlyRegOpt.json.options.challenge, origin: 'https://isabisystems.com', rpId: 'isabisystems.com' })
    },
    headers: { 'X-ISABI-Session': tokens.u4 }
  });
  check('pin_only seat register_verify rejected 403', regVerPinOnly.status === 403, regVerPinOnly);
  const suOptPinOnly = await api('auth/passkeys', { body: { action: 'auth_options', purpose: 'step_up' }, headers: { 'X-ISABI-Session': tokens.u4 } });
  check('pin_only seat step_up auth_options rejected 403', suOptPinOnly.status === 403, suOptPinOnly);
  const suVerPinOnly = await api('auth/passkeys', {
    body: {
      action: 'auth_verify', purpose: 'step_up', challengeId: prePinOnlySuOpt.json.challengeId,
      credential: keyBbcEs256.buildAssertion({ challengeB64u: prePinOnlySuOpt.json.options.challenge, origin: 'https://isabisystems.com', rpId: 'isabisystems.com', signCount: 3 })
    },
    headers: { 'X-ISABI-Session': tokens.u4 }
  });
  check('pin_only seat step_up auth_verify rejected 403', suVerPinOnly.status === 403, suVerPinOnly);
  const ovOptPinOnlyLookup = await api('auth/passkeys', { body: { action: 'auth_options', purpose: 'verify_override', company: 'BBConstruction', email: 'bbc.sup@isabi.test' }, headers: { 'X-ISABI-Session': tokens.u4 } });
  check('pin_only seat excluded from verify_override allowCredentials', Array.isArray(ovOptPinOnlyLookup.json.options.allowCredentials) && ovOptPinOnlyLookup.json.options.allowCredentials.length === 0, ovOptPinOnlyLookup);
  const ovVerPinOnly = await api('auth/verify-override', {
    body: {
      company: 'BBConstruction', form_key: 'sales', field_id: 'f_unitprice', field_label: 'Unit Price', unlock_all: false,
      passkey_assertion: {
        challengeId: prePinOnlyOvOpt.json.challengeId,
        credential: keyBbcEs256.buildAssertion({ challengeB64u: prePinOnlyOvOpt.json.options.challenge, origin: 'https://isabisystems.com', rpId: 'isabisystems.com', signCount: 4 })
      }
    },
    headers: { 'X-ISABI-Session': tokens.u1 }
  });
  check('pin_only seat verify-override passkey rejected 403', ovVerPinOnly.status === 403, ovVerPinOnly);
  d1.db.prepare("UPDATE users SET auth_mode = 'face_only' WHERE id = 'u4'").run();

  // 6. Negative crypto/counter checks
  const optUv0 = await api('auth/passkeys', { body: { action: 'auth_options', purpose: 'login' } });
  const resUv0 = await api('auth/passkeys', {
    body: {
      action: 'auth_verify', purpose: 'login', challengeId: optUv0.json.challengeId,
      credential: keyOwnerEs256.buildAssertion({ challengeB64u: optUv0.json.options.challenge, origin: 'https://isabisystems.com', rpId: 'isabisystems.com', flags: 0x01 })
    }
  });
  check('UV=0 assertion rejected 401 (uv_required)', resUv0.status === 401 && resUv0.json.code === 'uv_required');

  const optWrongRp = await api('auth/passkeys', { body: { action: 'auth_options', purpose: 'login' } });
  const resWrongRp = await api('auth/passkeys', {
    body: {
      action: 'auth_verify', purpose: 'login', challengeId: optWrongRp.json.challengeId,
      credential: keyOwnerEs256.buildAssertion({ challengeB64u: optWrongRp.json.options.challenge, origin: 'https://isabisystems.com', rpId: 'evil.example' })
    }
  });
  check('wrong rpIdHash rejected 401', resWrongRp.status === 401);

  const optTamper = await api('auth/passkeys', { body: { action: 'auth_options', purpose: 'login' } });
  const resTamper = await api('auth/passkeys', {
    body: {
      action: 'auth_verify', purpose: 'login', challengeId: optTamper.json.challengeId,
      credential: keyOwnerEs256.buildAssertion({ challengeB64u: optTamper.json.options.challenge, origin: 'https://isabisystems.com', rpId: 'isabisystems.com', tamperSig: true })
    }
  });
  check('tampered ES256 signature rejected 401', resTamper.status === 401);

  // Clone / signCount rollback: keyOwnerEs256 currently has signCount > 0 (stored in DB as 1)
  const optRollback = await api('auth/passkeys', { body: { action: 'auth_options', purpose: 'login' } });
  const resRollback = await api('auth/passkeys', {
    body: {
      action: 'auth_verify', purpose: 'login', challengeId: optRollback.json.challengeId,
      credential: keyOwnerEs256.buildAssertion({ challengeB64u: optRollback.json.options.challenge, origin: 'https://isabisystems.com', rpId: 'isabisystems.com', signCount: 1 })
    }
  });
  check('cloned authenticator signCount rollback rejected 403', resRollback.status === 403 && resRollback.json.code === 'passkey_cloned_authenticator', resRollback);

  // 7. Step-up & Logout wipes stepup_ok:<sid>
  const suOpt = await api('auth/passkeys', { body: { action: 'auth_options', purpose: 'step_up' }, headers: { 'X-ISABI-Session': tokens.u3 } });
  const resWrongSeatSu = await api('auth/passkeys', {
    body: {
      action: 'auth_verify', purpose: 'step_up', challengeId: suOpt.json.challengeId,
      credential: keyOwnerEs256.buildAssertion({ challengeB64u: suOpt.json.options.challenge, origin: 'https://isabisystems.com', rpId: 'isabisystems.com', signCount: 5 })
    },
    headers: { 'X-ISABI-Session': tokens.u3 }
  });
  check('step_up bound strictly to session.sub (Owner key on Supervisor session rejected 403)', resWrongSeatSu.status === 403);

  const suOpt2 = await api('auth/passkeys', { body: { action: 'auth_options', purpose: 'step_up' }, headers: { 'X-ISABI-Session': tokens.u1 } });
  const suVer2 = await api('auth/passkeys', {
    body: {
      action: 'auth_verify', purpose: 'step_up', challengeId: suOpt2.json.challengeId,
      credential: keyOwnerEs256.buildAssertion({ challengeB64u: suOpt2.json.options.challenge, origin: 'https://isabisystems.com', rpId: 'isabisystems.com', signCount: 6 })
    },
    headers: { 'X-ISABI-Session': tokens.u1 }
  });
  check('passkey step_up writes fresh stepup_ok receipt for caller session', suVer2.status === 200 && suVer2.json.step_up === true);
  await api('auth/logout', { body: {}, headers: { 'X-ISABI-Session': tokens.u1 } });
  check('logout wipes stepup_ok:<sid> receipt', !d1.db.prepare("SELECT 1 FROM edge_kv_store WHERE doc_key = 'stepup_ok:sess-u1-init'").get());

  // Re-mint Owner session for remaining Edge tests
  const sidU1New = 'sess-u1-two';
  d1.db.prepare('INSERT INTO auth_sessions (id, user_id, email, full_name, role, companies) VALUES (?,?,?,?,?,?)').run(sidU1New, 'u1', 'owner@isabi.test', 'Audit Owner', 'Full Access (Owner)', 'All');
  const tokU1Two = await signEdgeSession({ sid: sidU1New, sub: 'u1', email: 'owner@isabi.test', role: 'Full Access (Owner)', companies: 'All', pbi: 'full' }, env);

  // 8. verify-override via passkey_assertion + RLS checks
  const ovOpt = await api('auth/passkeys', { body: { action: 'auth_options', purpose: 'verify_override', company: 'WTC' }, headers: { 'X-ISABI-Session': tokens.u7 } });
  const ovVer = await api('auth/verify-override', {
    body: {
      company: 'WTC', form_key: 'sales', field_id: 'f_unitprice', field_label: 'Unit Price', unlock_all: false,
      passkey_assertion: {
        challengeId: ovOpt.json.challengeId,
        credential: keySupRs256.buildAssertion({ challengeB64u: ovOpt.json.options.challenge, origin: 'https://isabisystems.com', rpId: 'isabisystems.com', signCount: 5 })
      }
    },
    headers: { 'X-ISABI-Session': tokens.u7 }
  });
  check('verify-override passkey_assertion unlocks WTC field & writes override_audit', ovVer.status === 200 && ovVer.json.ok === true && ovVer.json.method === 'Passkey (FIDO2)', ovVer);

  const ovOptCrossCo = await api('auth/passkeys', { body: { action: 'auth_options', purpose: 'verify_override', company: 'WTC' }, headers: { 'X-ISABI-Session': tokens.u7 } });
  const ovCrossCo = await api('auth/verify-override', {
    body: {
      company: 'WTC', form_key: 'sales', field_id: 'f_unitprice', field_label: 'Unit Price', unlock_all: false,
      passkey_assertion: {
        challengeId: ovOptCrossCo.json.challengeId,
        credential: keyBbcEs256.buildAssertion({ challengeB64u: ovOptCrossCo.json.options.challenge, origin: 'https://isabisystems.com', rpId: 'isabisystems.com', signCount: 5 })
      }
    },
    headers: { 'X-ISABI-Session': tokens.u7 }
  });
  check('verify-override rejects cross-company Supervisor passkey with 403', ovCrossCo.status === 403);

  // 9. < 10 cap (MAX_PASSKEYS_PER_SEAT = 9) + concurrent race checks + Custom & payload_json locked seats
  d1.db.prepare("INSERT OR REPLACE INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES (?, ?, ?, 'u1', 1)")
    .run(`stepup_ok:${sidU1New}`, JSON.stringify({ userId: 'u1', verifiedAtMs: Date.now(), method: 'PIN' }), new Date().toISOString());
  for (let i = 1; i <= 7; i++) {
    const o = await api('auth/passkeys', { body: { action: 'register_options' }, headers: { 'X-ISABI-Session': tokU1Two } });
    const k = makeVirtualKey(-7);
    const rv = await api('auth/passkeys', {
      body: { action: 'register_verify', challengeId: o.json.challengeId, credential: k.buildRegistration({ challengeB64u: o.json.options.challenge, origin: 'https://isabisystems.com', rpId: 'isabisystems.com' }) },
      headers: { 'X-ISABI-Session': tokU1Two }
    });
    assert.equal(rv.status, 200);
  }
  const o8a = await api('auth/passkeys', { body: { action: 'register_options' }, headers: { 'X-ISABI-Session': tokU1Two } });
  const o8b = await api('auth/passkeys', { body: { action: 'register_options' }, headers: { 'X-ISABI-Session': tokU1Two } });
  const k8a = makeVirtualKey(-7);
  const k8b = makeVirtualKey(-7);
  const [r8a, r8b] = await Promise.all([
    api('auth/passkeys', { body: { action: 'register_verify', challengeId: o8a.json.challengeId, credential: k8a.buildRegistration({ challengeB64u: o8a.json.options.challenge, origin: 'https://isabisystems.com', rpId: 'isabisystems.com' }) }, headers: { 'X-ISABI-Session': tokU1Two } }),
    api('auth/passkeys', { body: { action: 'register_verify', challengeId: o8b.json.challengeId, credential: k8b.buildRegistration({ challengeB64u: o8b.json.options.challenge, origin: 'https://isabisystems.com', rpId: 'isabisystems.com' }) }, headers: { 'X-ISABI-Session': tokU1Two } })
  ]);
  const capStatuses = [r8a.status, r8b.status].sort((a, b) => a - b);
  const u1PkCount = d1.db.prepare("SELECT COUNT(*) AS n FROM user_passkeys WHERE user_id = 'u1'").get().n;
  check('concurrent 8->9 register_verify Promise.all enforces exact <10 cap (1x 200, 1x 400, DB=9)', capStatuses[0] === 200 && capStatuses[1] === 400 && u1PkCount === 9, { capStatuses, u1PkCount });
  const overCap = await api('auth/passkeys', { body: { action: 'register_options' }, headers: { 'X-ISABI-Session': tokU1Two } });
  check('10th passkey registration rejected 400 (< 10 cap enforced)', overCap.status === 400);

  // Concurrent replay of same auth_verify challengeId (use clean IP header after earlier 5 negative failure lockout tests)
  const concIpHdr = { 'CF-Connecting-IP': '203.0.113.99' };
  const concOpt = await api('auth/passkeys', { body: { action: 'auth_options', purpose: 'login' }, headers: concIpHdr });
  assert.equal(concOpt.status, 200);
  const concAssert = keyOwnerEs256.buildAssertion({ challengeB64u: concOpt.json.options.challenge, origin: 'https://isabisystems.com', rpId: 'isabisystems.com', userId: 'u1', signCount: 9 });
  const [cRes1, cRes2] = await Promise.all([
    api('auth/passkeys', { body: { action: 'auth_verify', purpose: 'login', challengeId: concOpt.json.challengeId, credential: concAssert }, headers: concIpHdr }),
    api('auth/passkeys', { body: { action: 'auth_verify', purpose: 'login', challengeId: concOpt.json.challengeId, credential: concAssert }, headers: concIpHdr })
  ]);
  const concStatuses = [cRes1.status, cRes2.status].sort((a, b) => a - b);
  check('concurrent Promise.all auth_verify same challengeId allows at most one 200', concStatuses[0] === 200 && concStatuses[1] === 401, concStatuses);

  // Custom seat with unlocks vs Custom {} + payload_json.locked
  d1.db.prepare("INSERT INTO users (id, full_name, email, pin_code, role, companies, custom_perms, auth_mode) VALUES (?,?,?,?,?,?,?,?)")
    .run('u-cust-ok', 'Custom Approver', 'cust.ok@isabi.test', hashTestPin('1357'), 'Custom', 'WTC', JSON.stringify({ unlocks: { unlock_unit_price: true } }), 'either');
  d1.db.prepare("INSERT INTO users (id, full_name, email, pin_code, role, companies, custom_perms, auth_mode) VALUES (?,?,?,?,?,?,?,?)")
    .run('u-cust-no', 'Custom Plain', 'cust.no@isabi.test', hashTestPin('2468'), 'Custom', 'WTC', '{}', 'either');
  d1.db.prepare("INSERT INTO users (id, full_name, email, pin_code, role, companies, auth_mode, payload_json) VALUES (?,?,?,?,?,?,?,?)")
    .run('u-locked', 'Locked Sup', 'locked.sup@isabi.test', hashTestPin('3579'), 'Supervisor', 'WTC', 'either', JSON.stringify({ locked: true }));
  d1.db.prepare("INSERT INTO auth_sessions (id, user_id, email, full_name, role, companies) VALUES ('sess-cust-ok', 'u-cust-ok', 'cust.ok@isabi.test', 'Custom Approver', 'Custom', 'WTC')").run();
  d1.db.prepare("INSERT INTO auth_sessions (id, user_id, email, full_name, role, companies) VALUES ('sess-cust-no', 'u-cust-no', 'cust.no@isabi.test', 'Custom Plain', 'Custom', 'WTC')").run();
  d1.db.prepare("INSERT INTO auth_sessions (id, user_id, email, full_name, role, companies) VALUES ('sess-locked', 'u-locked', 'locked.sup@isabi.test', 'Locked Sup', 'Supervisor', 'WTC')").run();
  const tokCustOk = await signEdgeSession({ sid: 'sess-cust-ok', sub: 'u-cust-ok', email: 'cust.ok@isabi.test', role: 'Custom', companies: 'WTC' }, env);
  const tokCustNo = await signEdgeSession({ sid: 'sess-cust-no', sub: 'u-cust-no', email: 'cust.no@isabi.test', role: 'Custom', companies: 'WTC' }, env);
  const tokLocked = await signEdgeSession({ sid: 'sess-locked', sub: 'u-locked', email: 'locked.sup@isabi.test', role: 'Supervisor', companies: 'WTC' }, env);
  for (const [sid, uid] of [['sess-cust-ok', 'u-cust-ok'], ['sess-cust-no', 'u-cust-no'], ['sess-locked', 'u-locked']]) {
    d1.db.prepare("INSERT OR REPLACE INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES (?, ?, ?, ?, 1)")
      .run(`stepup_ok:${sid}`, JSON.stringify({ userId: uid, verifiedAtMs: Date.now(), method: 'PIN' }), new Date().toISOString(), uid);
  }
  const custOkOpt = await api('auth/passkeys', { body: { action: 'register_options' }, headers: { 'X-ISABI-Session': tokCustOk } });
  const keyCustOk = makeVirtualKey(-7);
  const custOkReg = await api('auth/passkeys', {
    body: { action: 'register_verify', challengeId: custOkOpt.json.challengeId, credential: keyCustOk.buildRegistration({ challengeB64u: custOkOpt.json.options.challenge, origin: 'https://isabisystems.com', rpId: 'isabisystems.com' }) },
    headers: { 'X-ISABI-Session': tokCustOk }
  });
  check('Custom seat with unlock_unit_price enrolls passkey (200)', custOkOpt.status === 200 && custOkReg.status === 200, custOkReg);
  const custOvOpt = await api('auth/passkeys', { body: { action: 'auth_options', purpose: 'verify_override', company: 'WTC' }, headers: { 'X-ISABI-Session': tokens.u7 } });
  const custOvVer = await api('auth/verify-override', {
    body: {
      company: 'WTC', form_key: 'sales', field_id: 'f_unitprice', field_label: 'Unit Price', unlock_all: false,
      passkey_assertion: {
        challengeId: custOvOpt.json.challengeId,
        credential: keyCustOk.buildAssertion({ challengeB64u: custOvOpt.json.options.challenge, origin: 'https://isabisystems.com', rpId: 'isabisystems.com', signCount: 2 })
      }
    },
    headers: { 'X-ISABI-Session': tokens.u7 }
  });
  check('Custom seat with unlock_unit_price authorizes verify-override f_unitprice (200)', custOvVer.status === 200 && custOvVer.json.method === 'Passkey (FIDO2)', custOvVer);
  const custNoOpt = await api('auth/passkeys', { body: { action: 'register_options' }, headers: { 'X-ISABI-Session': tokCustNo } });
  check('Custom {} seat rejected 403 on register_options', custNoOpt.status === 403, custNoOpt);
  const lockedRegOpt = await api('auth/passkeys', { body: { action: 'register_options' }, headers: { 'X-ISABI-Session': tokLocked } });
  check('Seat with payload_json locked=true rejected 401/403 on register_options', lockedRegOpt.status === 401 || lockedRegOpt.status === 403, lockedRegOpt);
  const lockedDelEdge = await api('auth/passkeys', { body: { action: 'delete', id: regVerOwner.json.passkey.id }, headers: { 'X-ISABI-Session': tokLocked } });
  check('Edge pre-existing session on payload_json locked seat rejected 401 on passkey delete', lockedDelEdge.status === 401, lockedDelEdge);

  // 10. Revocation
  const ownerPkId = regVerOwner.json.passkey.id;
  const supPkId = regVerSup.json.passkey.id;
  check('Supervisor cannot delete Owner passkey (403)', (await api('auth/passkeys', { body: { action: 'delete', id: ownerPkId }, headers: { 'X-ISABI-Session': tokens.u3 } })).status === 403);
  check('Owner can revoke Supervisor passkey (200)', (await api('auth/passkeys', { body: { action: 'delete', id: supPkId }, headers: { 'X-ISABI-Session': tokU1Two } })).status === 200);
  check('Self can delete own passkey (200)', (await api('auth/passkeys', { body: { action: 'delete', id: ownerPkId }, headers: { 'X-ISABI-Session': tokU1Two } })).status === 200);
}

async function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.unref();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}

function httpReq(urlStr, method = 'POST', bodyObj = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const data = bodyObj == null ? undefined : JSON.stringify(bodyObj);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method,
      headers: Object.assign(
        data == null ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        headers
      )
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch (_) {}
        resolve({ status: res.statusCode, json, raw, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (data != null) req.write(data);
    req.end();
  });
}

async function runPartBLocalServer() {
  console.log('\n--- Part B: Local server.py WebAuthn FIDO2 1:1 Parity Tests ---');
  const port = await freePort();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'isabi-pk-local-'));
  const dbPath = path.join(tmpDir, 'mfg.db');
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, full_name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, pin_code TEXT DEFAULT '',
      role TEXT NOT NULL DEFAULT 'Entry', companies TEXT NOT NULL DEFAULT 'WTC', pbi_access TEXT DEFAULT 'full',
      statements_access TEXT DEFAULT 'full', status TEXT DEFAULT 'Active', last_login_at TEXT DEFAULT '',
      face_samples TEXT DEFAULT '[]', face_thumbs TEXT DEFAULT '[]', face_required INTEGER DEFAULT 0,
      face_updated_at TEXT DEFAULT '', seat_updated_at TEXT DEFAULT '', custom_perms TEXT DEFAULT '{}',
      auth_mode TEXT DEFAULT ''
    );
    CREATE TABLE auth_sessions (
      id TEXT PRIMARY KEY, user_id TEXT, email TEXT, full_name TEXT, role TEXT, companies TEXT,
      device TEXT, logged_in_at TEXT, method TEXT DEFAULT 'PIN', confidence REAL, ip_hash TEXT DEFAULT ''
    );
    CREATE TABLE edge_kv_store (doc_key TEXT PRIMARY KEY, updated_at TEXT DEFAULT '', payload_json TEXT DEFAULT '{}');
  `);
  const mkFaceVecB = idx => { const v = new Array(128).fill(0.01); v[idx] = 0.85; return v; };
  db.prepare('INSERT INTO users (id, full_name, email, pin_code, role, companies, auth_mode, face_samples) VALUES (?,?,?,?,?,?,?,?)')
    .run('u1', 'Audit Owner', 'owner@isabi.local', hashTestPin('4321'), 'Full Access (Owner)', 'All', 'either', JSON.stringify([mkFaceVecB(1)]));
  db.prepare('INSERT INTO users (id, full_name, email, pin_code, role, companies, auth_mode, face_samples) VALUES (?,?,?,?,?,?,?,?)')
    .run('u3', 'WTC Supervisor', 'wtc.sup@isabi.local', hashTestPin('5678'), 'Supervisor', 'WTC', 'both', JSON.stringify([mkFaceVecB(3)]));
  db.prepare('INSERT INTO users (id, full_name, email, pin_code, role, companies, auth_mode) VALUES (?,?,?,?,?,?,?)')
    .run('u4', 'BBC Supervisor', 'bbc.sup@isabi.local', hashTestPin('6789'), 'Supervisor', 'BBConstruction', 'either');
  db.prepare('INSERT INTO users (id, full_name, email, pin_code, role, companies, auth_mode) VALUES (?,?,?,?,?,?,?)')
    .run('u7', 'WTC Entry', 'wtc.entry@isabi.local', hashTestPin('7890'), 'Entry', 'WTC', 'either');
  db.prepare('INSERT INTO users (id, full_name, email, pin_code, role, companies, custom_perms, auth_mode) VALUES (?,?,?,?,?,?,?,?)')
    .run('u-cust-ok', 'Custom Approver', 'cust.ok@isabi.local', hashTestPin('1357'), 'Custom', 'WTC', JSON.stringify({ unlocks: { unlock_unit_price: true } }), 'either');
  db.prepare('INSERT INTO users (id, full_name, email, pin_code, role, companies, custom_perms, auth_mode) VALUES (?,?,?,?,?,?,?,?)')
    .run('u-cust-no', 'Custom Plain', 'cust.no@isabi.local', hashTestPin('2468'), 'Custom', 'WTC', '{}', 'either');
  db.close();

  const pyExe = process.env.PYTHON || 'python';
  const srv = spawn(pyExe, ['server.py', String(port)], {
    cwd: APP_ROOT,
    env: Object.assign({}, process.env, { MFG_DB_PATH: dbPath }),
    stdio: 'ignore',
    windowsHide: true
  });

  try {
    let up = false;
    for (let i = 0; i < 60; i++) {
      try {
        const st = await httpReq(`http://localhost:${port}/api/status`, 'GET');
        if (st.status === 200) { up = true; break; }
      } catch (_) {}
      await new Promise(r => setTimeout(r, 150));
    }
    check('local server.py booted on localhost', up);
    if (!up) throw new Error('server.py failed to boot');

    const base = `http://localhost:${port}`;
    const originHdr = { Origin: base };

    // Sign in Owner & Supervisor & Entry
    const lOwner = await httpReq(`${base}/api/auth/login`, 'POST', { email: 'owner@isabi.local', pin: '4321', method: 'PIN' });
    const lSup = await httpReq(`${base}/api/auth/login`, 'POST', { email: 'wtc.sup@isabi.local', pin: '5678', face_descriptor: mkFaceVecB(3), method: 'Face ID + PIN' });
    const lBbc = await httpReq(`${base}/api/auth/login`, 'POST', { email: 'bbc.sup@isabi.local', pin: '6789', method: 'PIN' });
    const lEntry = await httpReq(`${base}/api/auth/login`, 'POST', { email: 'wtc.entry@isabi.local', pin: '7890', method: 'PIN' });
    const tokOwner = lOwner.json.token;
    const tokSup = lSup.json.token;
    const tokBbc = lBbc.json.token;
    const tokEntry = lEntry.json.token;
    check('local sessions minted', Boolean(tokOwner && tokSup && tokBbc && tokEntry));

    // Raw IP & cross-port Origin rejection
    const rawIpRes = await httpReq(`http://127.0.0.1:${port}/api/auth/passkeys`, 'POST', { action: 'auth_options', purpose: 'login' });
    check('local server.py rejects raw IP Host 127.0.0.1 with 400', rawIpRes.status === 400);
    const crossPortRes = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'auth_options', purpose: 'login' }, { Origin: 'http://localhost:9999' });
    check('local server.py rejects cross-port Origin http://localhost:9999 with 403', crossPortRes.status === 403, crossPortRes);

    // Without step_up fails 403
    const noStepRes = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'register_options' }, Object.assign({ 'X-ISABI-Session': tokOwner }, originHdr));
    check('local server.py requires fresh stepup_ok receipt (403)', noStepRes.status === 403 && noStepRes.json.step_up_required);

    // Step-up Owner & register ES256 (with ED=1 trailing CBOR extension map)
    await httpReq(`${base}/api/auth/login`, 'POST', { email: 'owner@isabi.local', pin: '4321', method: 'PIN', step_up: true, verify_only: true }, { 'X-ISABI-Session': tokOwner });
    const keyEs = makeVirtualKey(-7);
    const optEs = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'register_options' }, Object.assign({ 'X-ISABI-Session': tokOwner }, originHdr));
    const verEs = await httpReq(`${base}/api/auth/passkeys`, 'POST', {
      action: 'register_verify',
      challengeId: optEs.json.challengeId,
      device_label: 'Local Owner Key',
      credential: keyEs.buildRegistration({ challengeB64u: optEs.json.options.challenge, origin: base, rpId: 'localhost', withExtensions: true })
    }, Object.assign({ 'X-ISABI-Session': tokOwner }, originHdr));
    check('local server.py ES256 P-256 registration succeeds', verEs.status === 200 && verEs.json.passkey.alg === -7, verEs);

    // Step-up Supervisor & register RS256 (both mode requires Face ID + PIN)
    await httpReq(`${base}/api/auth/login`, 'POST', { email: 'wtc.sup@isabi.local', pin: '5678', face_descriptor: mkFaceVecB(3), method: 'Face ID + PIN', step_up: true, verify_only: true }, { 'X-ISABI-Session': tokSup });
    const keyRs = makeVirtualKey(-257);
    const optRs = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'register_options' }, Object.assign({ 'X-ISABI-Session': tokSup }, originHdr));
    const verRs = await httpReq(`${base}/api/auth/passkeys`, 'POST', {
      action: 'register_verify',
      challengeId: optRs.json.challengeId,
      device_label: 'Local Supervisor RS256',
      credential: keyRs.buildRegistration({ challengeB64u: optRs.json.options.challenge, origin: base, rpId: 'localhost' })
    }, Object.assign({ 'X-ISABI-Session': tokSup }, originHdr));
    check('local server.py RS256 registration succeeds', verRs.status === 200 && verRs.json.passkey.alg === -257, verRs);

    // Login ES256 & RS256 (both mode!) + /api/auth/login & /api/auth/me passkeys metadata + step_up + concurrent checks
    const lOwnerMeta = await httpReq(`${base}/api/auth/login`, 'POST', { email: 'owner@isabi.local', pin: '4321', method: 'PIN' });
    const meMeta = await httpReq(`${base}/api/auth/me`, 'GET', null, { 'X-ISABI-Session': tokOwner });
    check('local /api/auth/login & /api/auth/me attach passkey_count & passkeys array',
      lOwnerMeta.status === 200 && lOwnerMeta.json.user.passkey_count === 1 && lOwnerMeta.json.user.passkeys_enrolled === true && Array.isArray(lOwnerMeta.json.user.passkeys) &&
      meMeta.status === 200 && meMeta.json.user.passkey_count === 1 && meMeta.json.user.passkeys_enrolled === true && Array.isArray(meMeta.json.user.passkeys),
      { lOwnerMeta, meMeta });

    const lo1 = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'auth_options', purpose: 'login' }, originHdr);
    const a1 = keyEs.buildAssertion({ challengeB64u: lo1.json.options.challenge, origin: base, rpId: 'localhost', userId: 'u1' });
    const lv1 = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'auth_verify', purpose: 'login', challengeId: lo1.json.challengeId, credential: a1 }, originHdr);
    check('local server.py ES256 Jacobian verify + login succeeds', lv1.status === 200 && lv1.json.method === 'Passkey (FIDO2)' && Boolean(lv1.json.token), lv1);

    const suLocalOpt = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'auth_options', purpose: 'step_up' }, Object.assign({ 'X-ISABI-Session': tokOwner }, originHdr));
    const suLocalVer = await httpReq(`${base}/api/auth/passkeys`, 'POST', {
      action: 'auth_verify', purpose: 'step_up', challengeId: suLocalOpt.json.challengeId,
      credential: keyEs.buildAssertion({ challengeB64u: suLocalOpt.json.options.challenge, origin: base, rpId: 'localhost', userId: 'u1', signCount: 3 })
    }, Object.assign({ 'X-ISABI-Session': tokOwner }, originHdr));
    check('local server.py step_up passkey attaches passkeys metadata',
      suLocalVer.status === 200 && suLocalVer.json.step_up === true && suLocalVer.json.user.passkey_count === 1 && Array.isArray(suLocalVer.json.user.passkeys),
      suLocalVer);

    const lo2 = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'auth_options', purpose: 'login' }, originHdr);
    const a2 = keyRs.buildAssertion({ challengeB64u: lo2.json.options.challenge, origin: base, rpId: 'localhost', userId: 'u3' });
    const lv2 = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'auth_verify', purpose: 'login', challengeId: lo2.json.challengeId, credential: a2 }, originHdr);
    check('local server.py RS256 verify + login on both seat succeeds', lv2.status === 200 && lv2.json.user.id === 'u3', lv2);

    // Replay & counter rollback checks
    const rep = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'auth_verify', purpose: 'login', challengeId: lo1.json.challengeId, credential: a1 }, originHdr);
    check('local server.py rejects replayed challenge 401', rep.status === 401);

    const loRb = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'auth_options', purpose: 'login' }, originHdr);
    const aRb = keyEs.buildAssertion({ challengeB64u: loRb.json.options.challenge, origin: base, rpId: 'localhost', signCount: 1 });
    const lvRb = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'auth_verify', purpose: 'login', challengeId: loRb.json.challengeId, credential: aRb }, originHdr);
    check('local server.py rejects cloned signCount rollback 403', lvRb.status === 403 && lvRb.json.code === 'passkey_cloned_authenticator', lvRb);

    // verify-override via passkey_assertion + cross-BU rejection
    await httpReq(`${base}/api/auth/login`, 'POST', { email: 'bbc.sup@isabi.local', pin: '6789', method: 'PIN', step_up: true, verify_only: true }, { 'X-ISABI-Session': tokBbc });
    const keyBbc = makeVirtualKey(-7);
    const optBbc = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'register_options' }, Object.assign({ 'X-ISABI-Session': tokBbc }, originHdr));
    await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'register_verify', challengeId: optBbc.json.challengeId, credential: keyBbc.buildRegistration({ challengeB64u: optBbc.json.options.challenge, origin: base, rpId: 'localhost' }) }, Object.assign({ 'X-ISABI-Session': tokBbc }, originHdr));

    const ov1 = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'auth_options', purpose: 'verify_override', company: 'WTC' }, Object.assign({ 'X-ISABI-Session': tokEntry }, originHdr));
    const ovOk = await httpReq(`${base}/api/auth/verify-override`, 'POST', {
      company: 'WTC', form_key: 'sales', field_id: 'f_unitprice', field_label: 'Unit Price', unlock_all: false,
      passkey_assertion: {
        challengeId: ov1.json.challengeId,
        credential: keyRs.buildAssertion({ challengeB64u: ov1.json.options.challenge, origin: base, rpId: 'localhost', signCount: 9 })
      }
    }, Object.assign({ 'X-ISABI-Session': tokEntry }, originHdr));
    check('local server.py verify-override passkey_assertion writes override_audit & method', ovOk.status === 200 && ovOk.json.ok && ovOk.json.method === 'Passkey (FIDO2)', ovOk);

    // Custom eligibility, pin_only, payload_json.locked, and Promise.all concurrency on local server.py
    const lCustOk = await httpReq(`${base}/api/auth/login`, 'POST', { email: 'cust.ok@isabi.local', pin: '1357', method: 'PIN' });
    const lCustNo = await httpReq(`${base}/api/auth/login`, 'POST', { email: 'cust.no@isabi.local', pin: '2468', method: 'PIN' });
    const tokCustOkB = lCustOk.json.token;
    const tokCustNoB = lCustNo.json.token;
    await httpReq(`${base}/api/auth/login`, 'POST', { email: 'cust.ok@isabi.local', pin: '1357', method: 'PIN', step_up: true, verify_only: true }, { 'X-ISABI-Session': tokCustOkB });
    await httpReq(`${base}/api/auth/login`, 'POST', { email: 'cust.no@isabi.local', pin: '2468', method: 'PIN', step_up: true, verify_only: true }, { 'X-ISABI-Session': tokCustNoB });
    const custOkOptB = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'register_options' }, Object.assign({ 'X-ISABI-Session': tokCustOkB }, originHdr));
    const keyCustOkB = makeVirtualKey(-7);
    const custOkRegB = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'register_verify', challengeId: custOkOptB.json.challengeId, credential: keyCustOkB.buildRegistration({ challengeB64u: custOkOptB.json.options.challenge, origin: base, rpId: 'localhost' }) }, Object.assign({ 'X-ISABI-Session': tokCustOkB }, originHdr));
    const custOvOptB = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'auth_options', purpose: 'verify_override', company: 'WTC' }, Object.assign({ 'X-ISABI-Session': tokEntry }, originHdr));
    const custOvVerB = await httpReq(`${base}/api/auth/verify-override`, 'POST', {
      company: 'WTC', form_key: 'sales', field_id: 'f_unitprice', field_label: 'Unit Price', unlock_all: false,
      passkey_assertion: { challengeId: custOvOptB.json.challengeId, credential: keyCustOkB.buildAssertion({ challengeB64u: custOvOptB.json.options.challenge, origin: base, rpId: 'localhost', signCount: 2 }) }
    }, Object.assign({ 'X-ISABI-Session': tokEntry }, originHdr));
    check('local Custom seat with unlock_unit_price authorizes verify-override (200)', custOkOptB.status === 200 && custOkRegB.status === 200 && custOvVerB.status === 200 && custOvVerB.json.method === 'Passkey (FIDO2)', custOvVerB);
    const custNoOptB = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'register_options' }, Object.assign({ 'X-ISABI-Session': tokCustNoB }, originHdr));
    check('local Custom {} seat rejected 403 on register_options', custNoOptB.status === 403, custNoOptB);

    const prePinRegB = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'register_options' }, Object.assign({ 'X-ISABI-Session': tokBbc }, originHdr));
    const prePinSuB = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'auth_options', purpose: 'step_up' }, Object.assign({ 'X-ISABI-Session': tokBbc }, originHdr));
    const dbUpd1 = new DatabaseSync(dbPath);
    dbUpd1.exec("PRAGMA busy_timeout = 8000; UPDATE users SET auth_mode = 'pin_only' WHERE id = 'u4';");
    dbUpd1.close();
    const bbcPinRegOpt = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'register_options' }, Object.assign({ 'X-ISABI-Session': tokBbc }, originHdr));
    const bbcPinRegVer = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'register_verify', challengeId: prePinRegB.json.challengeId, credential: makeVirtualKey(-7).buildRegistration({ challengeB64u: prePinRegB.json.options.challenge, origin: base, rpId: 'localhost' }) }, Object.assign({ 'X-ISABI-Session': tokBbc }, originHdr));
    const bbcPinSuOpt = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'auth_options', purpose: 'step_up' }, Object.assign({ 'X-ISABI-Session': tokBbc }, originHdr));
    const bbcPinSuVer = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'auth_verify', purpose: 'step_up', challengeId: prePinSuB.json.challengeId, credential: keyBbc.buildAssertion({ challengeB64u: prePinSuB.json.options.challenge, origin: base, rpId: 'localhost', signCount: 12 }) }, Object.assign({ 'X-ISABI-Session': tokBbc }, originHdr));
    const bbcPinOvOpt = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'auth_options', purpose: 'verify_override', company: 'BBConstruction', email: 'bbc.sup@isabi.local' }, Object.assign({ 'X-ISABI-Session': tokOwner }, originHdr));
    check('local server.py pin_only rejects register_options, register_verify, step_up (403) & clears verify_override allowCredentials',
      bbcPinRegOpt.status === 403 && bbcPinRegVer.status === 403 && bbcPinSuOpt.status === 403 && bbcPinSuVer.status === 403 &&
      Array.isArray(bbcPinOvOpt.json.options.allowCredentials) && bbcPinOvOpt.json.options.allowCredentials.length === 0,
      { s: [bbcPinRegOpt.status, bbcPinRegVer.status, bbcPinSuOpt.status, bbcPinSuVer.status], allow: bbcPinOvOpt.json.options.allowCredentials });

    const dbUpd2 = new DatabaseSync(dbPath);
    dbUpd2.exec("PRAGMA busy_timeout = 8000; UPDATE users SET auth_mode = 'either', payload_json = '{\"locked\":true}' WHERE id = 'u4';");
    dbUpd2.close();
    const lockedLogOptB = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'auth_options', purpose: 'login' }, originHdr);
    const lockedLogVerB = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'auth_verify', purpose: 'login', challengeId: lockedLogOptB.json.challengeId, credential: keyBbc.buildAssertion({ challengeB64u: lockedLogOptB.json.options.challenge, origin: base, rpId: 'localhost', userId: 'u4', signCount: 15 }) }, originHdr);
    const lockedDelB = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'delete', id: verRs.json.passkey.id }, Object.assign({ 'X-ISABI-Session': tokBbc }, originHdr));
    check('local server.py rejects payload_json locked seat with 403 and pre-existing session delete with 401', lockedLogVerB.status === 403 && lockedDelB.status === 401, { lockedLogVerB, lockedDelB });
    const dbUpd3 = new DatabaseSync(dbPath);
    dbUpd3.exec("PRAGMA busy_timeout = 8000; UPDATE users SET payload_json = '{}' WHERE id = 'u4';");
    dbUpd3.close();

    // Concurrency: Promise.all auth_verify replay + Promise.all 8->9 register_verify
    const concLoB = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'auth_options', purpose: 'login' }, originHdr);
    const concAB = keyEs.buildAssertion({ challengeB64u: concLoB.json.options.challenge, origin: base, rpId: 'localhost', userId: 'u1', signCount: 20 });
    const [cB1, cB2] = await Promise.all([
      httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'auth_verify', purpose: 'login', challengeId: concLoB.json.challengeId, credential: concAB }, originHdr),
      httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'auth_verify', purpose: 'login', challengeId: concLoB.json.challengeId, credential: concAB }, originHdr)
    ]);
    const cBStat = [cB1.status, cB2.status].sort((a, b) => a - b);
    check('local Promise.all auth_verify same challengeId allows at most one 200 (0x 500)', cBStat[0] === 200 && cBStat[1] === 401, cBStat);

    await httpReq(`${base}/api/auth/login`, 'POST', { email: 'owner@isabi.local', pin: '4321', method: 'PIN', step_up: true, verify_only: true }, { 'X-ISABI-Session': tokOwner });
    for (let i = 1; i <= 7; i++) {
      const oB = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'register_options' }, Object.assign({ 'X-ISABI-Session': tokOwner }, originHdr));
      const kB = makeVirtualKey(-7);
      const rB = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'register_verify', challengeId: oB.json.challengeId, credential: kB.buildRegistration({ challengeB64u: oB.json.options.challenge, origin: base, rpId: 'localhost' }) }, Object.assign({ 'X-ISABI-Session': tokOwner }, originHdr));
      assert.equal(rB.status, 200);
    }
    const o8Ba = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'register_options' }, Object.assign({ 'X-ISABI-Session': tokOwner }, originHdr));
    const o8Bb = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'register_options' }, Object.assign({ 'X-ISABI-Session': tokOwner }, originHdr));
    const [r8Ba, r8Bb] = await Promise.all([
      httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'register_verify', challengeId: o8Ba.json.challengeId, credential: makeVirtualKey(-7).buildRegistration({ challengeB64u: o8Ba.json.options.challenge, origin: base, rpId: 'localhost' }) }, Object.assign({ 'X-ISABI-Session': tokOwner }, originHdr)),
      httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'register_verify', challengeId: o8Bb.json.challengeId, credential: makeVirtualKey(-7).buildRegistration({ challengeB64u: o8Bb.json.options.challenge, origin: base, rpId: 'localhost' }) }, Object.assign({ 'X-ISABI-Session': tokOwner }, originHdr))
    ]);
    const capBStat = [r8Ba.status, r8Bb.status].sort((a, b) => a - b);
    const dbCnt = new DatabaseSync(dbPath);
    const u1CntB = dbCnt.prepare("SELECT COUNT(*) AS n FROM user_passkeys WHERE user_id = 'u1'").get().n;
    dbCnt.close();
    check('local Promise.all 8->9 register_verify enforces exact <10 cap (1x 200, 1x 400, DB=9)', capBStat[0] === 200 && capBStat[1] === 400 && u1CntB === 9, { capBStat, u1CntB });

    const ov2 = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'auth_options', purpose: 'verify_override', company: 'WTC' }, Object.assign({ 'X-ISABI-Session': tokEntry }, originHdr));
    const ovDeny = await httpReq(`${base}/api/auth/verify-override`, 'POST', {
      company: 'WTC', form_key: 'sales', field_id: 'f_unitprice', field_label: 'Unit Price', unlock_all: false,
      passkey_assertion: {
        challengeId: ov2.json.challengeId,
        credential: keyBbc.buildAssertion({ challengeB64u: ov2.json.options.challenge, origin: base, rpId: 'localhost', signCount: 9 })
      }
    }, Object.assign({ 'X-ISABI-Session': tokEntry }, originHdr));
    check('local server.py verify-override rejects cross-company Supervisor 403', ovDeny.status === 403);

    // Users GET & Delete
    const uGet = await httpReq(`${base}/api/users`, 'GET', null, { 'X-ISABI-Session': tokOwner });
    const ownU = (uGet.json.users || []).find(u => u.id === 'u1');
    check('local /api/users attaches passkey_count & passkeys', Boolean(ownU && ownU.passkey_count === 9 && Array.isArray(ownU.passkeys) && ownU.passkeys.length === 9), ownU);

    const delOk = await httpReq(`${base}/api/auth/passkeys`, 'POST', { action: 'delete', id: verRs.json.passkey.id }, Object.assign({ 'X-ISABI-Session': tokOwner }, originHdr));
    check('local Owner delete passkey succeeds', delOk.status === 200);
  } finally {
    try { srv.kill(); } catch (_) {}
    await new Promise(r => setTimeout(r, 200));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
}

await runPartAEdge();
await runPartBLocalServer();

console.log(`\nverify_passkeys_edge: ${passed}/${passed + failed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
