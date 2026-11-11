/**
 * ISABI Systems — Cloudflare D1 Relational SQLite + R2 Object Vault Engine
 * Full ACID multi-entity ledger, server-side RLS, optimistic CAS sync,
 * cross-network Phone QR Scan relay, and R2/D1 binary attachment vault.
 */

import {
  buildSessionCookie,
  canAccessCompany,
  canAccessSentinelScope,
  canManageUsersSeat,
  canReviewSentinelsSession,
  checkD1RateLimit,
  checkSlidingRateLimit,
  clearSessionCookie,
  extractRequestSession,
  hashClientIp,
  hashSeatPin,
  isHashedPin,
  isOwnerOrFullGroupSession,
  isWeakPin,
  jsonResponse,
  parseAllowedCompanies,
  signEdgeSession,
  verifyActiveEdgeSession,
  verifySeatPin
} from './security.js';
import { collectLegacyCandidates, scheduleLegacyIdHits } from './legacy_ids.js';

export const ALLOWED_TABLES = new Set([
  'sales_tickets', 'raw_purchases', 'fuel_intakes', 'fuel_malfunctions',
  'expenses', 'expense_items', 'recurring_expenses',
  'customer_receipts', 'supplier_payments', 'salary_payments', 'salaries',
  'price_rules', 'vat_invoices', 'credit_terms',
  'customers', 'suppliers', 'products', 'items',
  'sites', 'regions', 'uoms', 'product_types',
  'equipment', 'company_equipment', 'equipment_defects', 'equipment_repairs',
  'repair_items', 'equipment_oil_logs', 'part_movements', 'warehouse_movements',
  'drivers', 'company_drivers', 'staff_members', 'staff_roles',
  'expense_categories', 'expense_subcategories',
  'employments', 'attendance', 'work_shifts', 'staff_assignments',
  'freelance_entries', 'logistics_allowances', 'overtime_rates',
  'external_movements', 'loans', 'loan_settlements', 'conversions',
  'jv_partnerships', 'jv_distributions', 'daily_totals', 'documents',
  'fx_rates', 'vat_rates', 'currencies', 'gl_accounts'
]);

export const USER_WRITABLE_TABLES = new Set(
  Array.from(ALLOWED_TABLES).filter(t => t !== 'users')
);

export const UNIVERSAL_UNIQUE_TABLES = new Set([
  'customers', 'suppliers', 'products', 'items', 'product_types', 'uoms',
  'sites', 'regions', 'equipment', 'drivers', 'staff_members', 'staff_roles',
  'expense_categories', 'expense_subcategories', 'currencies', 'gl_accounts'
]);

// Map customRecords short keys to canonical SQL table names
const CR_KEY_TO_TABLE = {
  receipts: 'customer_receipts',
  settlements: 'supplier_payments',
  salaries: 'salary_payments'
};

// Till close rows that the gate till endpoint totals from the tills' own sales (kiosk_verify.js, bucket
// hsp_pos, ids POS-<SITE>-<yyyymmdd>-<6 hex>) are owned by the server. A copy held by a Command Center
// client is never written back over them, whatever its rev: the next till batch would only re-total a
// row the client had changed, and a stale copy could roll the totals back.
// The same holds for the venue revenue rows the endpoint posts from till sales once a resort's posting
// date is set (bucket hsp_revenue, ids HSP-REV-POS-<SITE>-<yyyymmdd>-<6 hex>).
export function isServerOwnedCustomRow(bucket, rowId) {
  const id = String(rowId || '');
  if (bucket === 'hsp_pos') return /^POS-[A-Z0-9_-]{1,64}-\d{8}-[0-9A-F]{6}$/.test(id);
  if (bucket === 'hsp_revenue') return /^HSP-REV-POS-[A-Z0-9_-]{1,64}-\d{8}-[0-9A-F]{6}$/.test(id);
  return false;
}

// Row edits and workflow patches are keyed "<prefix>::<bucket>::<row id>" (or by the row id alone). One that
// targets a server-owned till close row is not stored either, so it cannot restate the till's totals.
export function isServerOwnedRowEditKey(editKey) {
  return /(^|::)(HSP-REV-)?POS-[A-Z0-9_-]{1,64}-\d{8}-[0-9A-F]{6}$/.test(String(editKey || ''));
}

const LEGACY_PURGED_ENTRY_RE = /^[a-z_]+:(?:(?:st|rp|fi|ex|exi|oil|rc|sp|sa|at|em|ls|cv|dt)\d+|wbmalf-wtc-\d+|wbrecur-(?:wtc|bbc)-\d+|dv-(?:hld|ins)-(?:exp|sal|set|rec)-\d+)(?:-i\d+)?$/;

// Removes every client copy of a server-owned row from a store document before it is stored or mirrored,
// so one client's copy never reaches the other clients through the shared store.
export function stripServerOwnedCustomRows(doc, prevDoc = null) {
  if (!doc || typeof doc !== 'object') return doc;
  const icr = doc.industryCustomRows;
  if (icr && typeof icr === 'object') {
    for (const bucket of ['hsp_pos', 'hsp_revenue']) {
      if (Array.isArray(icr[bucket])) {
        icr[bucket] = icr[bucket].filter(r => !(r && isServerOwnedCustomRow(bucket, String(r.id || r.code || '').trim())));
      }
    }
  }
  const ire = doc.industryRowEdits;
  if (ire && typeof ire === 'object') {
    for (const ek of Object.keys(ire)) {
      if (isServerOwnedRowEditKey(ek)) delete ire[ek];
    }
  }
  const purgedList = [];
  const purgedSeen = new Set();
  for (const src of [prevDoc && prevDoc._purgedOverrideIds, doc._purgedOverrideIds]) {
    if (!Array.isArray(src)) continue;
    for (const item of src) {
      const s = String(item || '').trim();
      if (s && LEGACY_PURGED_ENTRY_RE.test(s) && !purgedSeen.has(s)) {
        purgedSeen.add(s);
        purgedList.push(s);
      }
    }
  }
  if (purgedList.length) {
    doc._purgedOverrideIds = purgedList.slice(-2000);
    const purgedSet = new Set(doc._purgedOverrideIds);
    const cr = doc.customRecords;
    if (cr && typeof cr === 'object') {
      for (const k of Object.keys(cr)) {
        if (Array.isArray(cr[k])) {
          cr[k] = cr[k].filter(r => !r || r._reopenedExplicitly || !purgedSet.has(`${k}:${String(r.id == null ? '' : r.id).trim()}`));
        }
      }
    }
  } else if (Object.prototype.hasOwnProperty.call(doc, '_purgedOverrideIds')) {
    delete doc._purgedOverrideIds;
  }
  return doc;
}

// Canonical entity display/storage names across all 6 ISABI industries (14 BHFIRMS entities)
const CANON_COMPANY_MAP = {
  wtc: 'WTC',
  'wtc (world trading & construction)': 'WTC',
  bbconstruction: 'BBConstruction',
  'bb construction': 'BBConstruction',
  bbc: 'BBConstruction',
  lionstransport: 'Lions Transport',
  'lions transport': 'Lions Transport',
  lions: 'Lions Transport',
  bdeirholding: 'Bdeir Holding',
  'bdeir holding': 'Bdeir Holding',
  blanca: 'Blanca',
  launa: 'La Una',
  'la una': 'La Una',
  palms: 'Palms',
  voile: 'Voile',
  platinum: 'Platinum',
  korriauto: 'Korri Auto',
  'korri auto': 'Korri Auto',
  shacman: 'Shacman',
  properties: 'Properties',
  '4235company': '4235 Company S.A.L',
  '4235 company s.a.l': '4235 Company S.A.L',
  '4235': '4235 Company S.A.L',
  insurance: 'Insurance Company',
  'insurance company': 'Insurance Company',
  'bdeir insurance brokerage': 'Insurance Company'
};

const POS_SEED_ID_RE = /^(?:(?:st|rp|fi|ex|exi|oil|rc|sp|sa|at|em|ls|cv|dt)(?:\d+|_[0-9a-f]{10,16})|wbmalf-[a-z0-9-]+|wbrecur-[a-z0-9-]+|dv-(?:hld|ins)-(?:exp|sal|set|rec)-(?:\d+|[0-9a-f]{8,16}))$/;
const LEGACY_POS_SEED_ID_RE = /^(?:(?:st|rp|fi|ex|exi|oil|rc|sp|sa|at|em|ls|cv|dt)\d+|wbmalf-wtc-\d+|wbrecur-(?:wtc|bbc)-\d+|dv-(?:hld|ins)-(?:exp|sal|set|rec)-\d+)(?:-i\d+)?$/;

export function canonicalizeCompanyName(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const k = s.toLowerCase().replace(/\s+/g, ' ');
  return CANON_COMPANY_MAP[k] || s;
}

const CANON_INDUSTRY_SCOPE_MAP = {
  'industry:manufacturing': 'industry:Manufacturing',
  'industry:holding & treasury': 'industry:Holding & Treasury',
  'industry:hospitality & resorts': 'industry:Hospitality & Resorts',
  'industry:automotive & heavy trading': 'industry:Automotive & Heavy Trading',
  'industry:real estate & property': 'industry:Real Estate & Property',
  'industry:insurance & brokerage': 'industry:Insurance & Brokerage'
};

function normalizeSentinelScopeCompany(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const k = s.toLowerCase().replace(/\s+/g, ' ');
  if (k === 'manufacturing-group') return 'manufacturing-group';
  if (k.startsWith('industry:')) return CANON_INDUSTRY_SCOPE_MAP[k] || s;
  return canonicalizeCompanyName(s);
}

function isKnownCanonicalCompany(raw) {
  const k = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return Boolean(k && Object.prototype.hasOwnProperty.call(CANON_COMPANY_MAP, k));
}

function stableRowSig(val) {
  if (val === null || val === undefined) return 'null';
  const t = typeof val;
  if (t === 'number') return Number.isFinite(val) ? String(val) : 'null';
  if (t === 'boolean') return val ? 'true' : 'false';
  if (t === 'string') return JSON.stringify(val);
  if (Array.isArray(val)) return '[' + val.map(stableRowSig).join(',') + ']';
  if (t === 'object') {
    const keys = Object.keys(val).filter(k => val[k] !== undefined).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + stableRowSig(val[k])).join(',') + '}';
  }
  return JSON.stringify(String(val));
}

function safeJsonParse(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch (_) {
    return fallback;
  }
}

function isDemoHeader(request) {
  return request.headers.get('X-ISABI-Demo') === '1';
}

const TABLE_COLS_CACHE = new Map();

async function getTableColumns(db, table) {
  if (TABLE_COLS_CACHE.has(table)) return TABLE_COLS_CACHE.get(table);
  const res = await db.prepare(`PRAGMA table_info(${table})`).all();
  const cols = new Set((res.results || []).map(r => String(r.name)));
  if (cols.size > 0) TABLE_COLS_CACHE.set(table, cols);
  return cols;
}

function hydrateRowJson(row) {
  if (!row || typeof row !== 'object') return row;
  const base = safeJsonParse(row.payload_json, {});
  const merged = Object.assign({}, base, row);
  delete merged.payload_json;
  for (const jk of ['attachments', 'adj_windows', 'driver_rows', 'admin_overrides', '_seed_orig']) {
    if (typeof merged[jk] === 'string' && /^[\[{]/.test(merged[jk].trim())) {
      merged[jk] = safeJsonParse(merged[jk], merged[jk]);
    }
  }
  if ('voided' in merged) merged.voided = Boolean(merged.voided);
  return merged;
}

function isValidFaceVec(v) {
  return Array.isArray(v) && v.length === 128 && v.every(x => typeof x === 'number' && Number.isFinite(x));
}

function faceL2Dist(a, b) {
  let sum = 0;
  for (let i = 0; i < 128; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function bestRowFaceDist(descriptor, rawSamples) {
  const samples = safeJsonParse(rawSamples, []);
  if (!Array.isArray(samples) || !samples.length) return Infinity;
  let best = Infinity;
  for (const s of samples) {
    if (!isValidFaceVec(s)) continue;
    const d = faceL2Dist(descriptor, s);
    if (d < best) best = d;
  }
  return best;
}

function stripBiometricsForPayload(uObj) {
  if (!uObj || typeof uObj !== 'object') return {};
  const clean = Object.assign({}, uObj);
  delete clean.pin_code;
  delete clean.face_samples;
  delete clean.face_thumbs;
  delete clean.payload_json;
  delete clean.pin_redacted;
  delete clean.face_redacted;
  delete clean.face_enrolled;
  delete clean.face_sample_count;
  delete clean._verifiedPin;
  return clean;
}

function hydrateUserRow(r, _redactPin = true, redactBiometrics = false) {
  const d = Object.assign({}, safeJsonParse(r.payload_json, {}), r);
  delete d.payload_json;
  delete d._verifiedPin;
  const hasStoredPin = Boolean(String(r.pin_code || '').trim());
  delete d.pin_code;
  d.pin_redacted = hasStoredPin;
  const parsedSamples = safeJsonParse(d.face_samples, []);
  const validSamples = Array.isArray(parsedSamples) ? parsedSamples.filter(isValidFaceVec) : [];
  const parsedThumbs = safeJsonParse(d.face_thumbs, []);
  const validThumbs = Array.isArray(parsedThumbs) ? parsedThumbs : [];
  d.face_enrolled = validSamples.length > 0;
  d.face_sample_count = validSamples.length;
  d.face_required = Boolean(d.face_required);
  if (!validSamples.length && d.face_updated_at) d.face_cleared = true;
  else delete d.face_cleared;
  d.custom_perms = safeJsonParse(d.custom_perms, null);
  if (d.custom_perms && typeof d.custom_perms !== 'object') d.custom_perms = null;
  // Never expose raw 128-d biometric vectors over HTTP; keep verification strictly server-side
  d.face_redacted = Boolean(d.face_enrolled);
  delete d.face_samples;
  if (redactBiometrics) {
    delete d.face_thumbs;
    d.custom_perms = null;
  } else {
    d.face_thumbs = validThumbs;
  }
  return d;
}

function normalizeServerAuthMode(mode, fallback = 'either') {
  const m = String(mode || '').trim().toLowerCase();
  if (m === 'either' || m === 'pin_only' || m === 'face_only' || m === 'both') return m;
  return fallback;
}

function sanitizePublicFaceSettings(fs) {
  if (!fs || typeof fs !== 'object') return null;
  const explicit = Boolean(fs.authModeV8Explicit === true);
  const authMode = explicit
    ? normalizeServerAuthMode(fs.authMode, fs.enforce2FA === true ? 'both' : 'either')
    : 'either';
  return {
    authMode,
    enforce2FA: authMode === 'both',
    authModeV8Explicit: explicit,
    liveness: fs.liveness !== false,
    livenessMode: String(fs.livenessMode || 'blink_or_turn'),
    confirmFrames: Math.max(3, Math.min(5, Number(fs.confirmFrames || 3))),
    updated_at: String(fs.updated_at || '')
  };
}

async function readWorkspaceFaceSettings(db) {
  if (!db) return null;
  try {
    const fastRow = await db.prepare("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'face_settings' LIMIT 1").first();
    if (fastRow && fastRow.payload_json) {
      const parsedFast = safeJsonParse(fastRow.payload_json, null);
      if (parsedFast && typeof parsedFast === 'object') return sanitizePublicFaceSettings(parsedFast);
    }
    const mfgDoc = await readEdgeKvDoc(db, 'mfg_web_store');
    if (mfgDoc && mfgDoc.payload_json) {
      const parsedMfg = safeJsonParse(mfgDoc.payload_json, null);
      if (parsedMfg && parsedMfg.faceSettings && typeof parsedMfg.faceSettings === 'object') {
        return sanitizePublicFaceSettings(parsedMfg.faceSettings);
      }
    }
  } catch (_) {}
  return null;
}

function resolveServerSeatAuthMode(row, wsFaceSettings, hasEnrolledBio) {
  const wsMode = wsFaceSettings && wsFaceSettings.authMode
    ? normalizeServerAuthMode(wsFaceSettings.authMode, wsFaceSettings.enforce2FA === true ? 'both' : 'either')
    : 'either';
  const seatRaw = String((row && row.auth_mode) || '').trim().toLowerCase();
  const mode = (seatRaw && seatRaw !== 'inherit')
    ? normalizeServerAuthMode(seatRaw, wsMode)
    : wsMode;
  if (!hasEnrolledBio && (mode === 'both' || mode === 'face_only')) {
    return 'either';
  }
  return mode;
}

// Escalating multi-tier D1 sign-in lockout:
// - Per IP (/64) & per IP+email: 5 fails -> 5m, 10 fails -> 30m, 15+ fails -> 24h (resets after 24h quiet or valid login)
const LOCKOUT_WINDOW_MS = 24 * 3600 * 1000;

async function readLockEntry(db, key) {
  const r = await db.prepare('SELECT payload_json FROM edge_kv_store WHERE doc_key = ?1 LIMIT 1').bind(key).first();
  if (!r || !r.payload_json) return null;
  const obj = safeJsonParse(r.payload_json, null);
  return obj && typeof obj === 'object' ? obj : null;
}

async function checkAuthLockout(db, ipHash, emailRaw) {
  if (!db || !ipHash) return { locked: false, retryAfterSec: 0 };
  const nowMs = Date.now();
  const emailClean = String(emailRaw || '').trim().toLowerCase();
  const keys = [`rl:lock_ip:${ipHash}`];
  if (emailClean) {
    keys.push(`rl:lock_em_ip:${ipHash}:${emailClean}`);
  }
  try {
    let maxUntil = 0;
    for (const k of keys) {
      const entry = await readLockEntry(db, k);
      if (entry && Number(entry.lockedUntilMs || 0) > nowMs) {
        maxUntil = Math.max(maxUntil, Number(entry.lockedUntilMs));
      }
    }
    if (maxUntil > nowMs) {
      return { locked: true, retryAfterSec: Math.max(1, Math.ceil((maxUntil - nowMs) / 1000)) };
    }
  } catch (_) {}
  return { locked: false, retryAfterSec: 0 };
}

async function bumpLockCounter(db, key, windowMs, nowMs, nowIso) {
  const initJson = JSON.stringify({ fails: 1, windowStartMs: nowMs, lockedUntilMs: 0 });
  const row = await db.prepare(
    `INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, rev)
     VALUES (?1, ?2, ?3, 1)
     ON CONFLICT(doc_key) DO UPDATE SET
       rev = CASE
         WHEN (?4 - COALESCE(CAST(json_extract(edge_kv_store.payload_json, '$.windowStartMs') AS INTEGER), 0)) > ?5 THEN 1
         ELSE edge_kv_store.rev + 1
       END,
       payload_json = json_object(
         'fails',
         CASE
           WHEN (?4 - COALESCE(CAST(json_extract(edge_kv_store.payload_json, '$.windowStartMs') AS INTEGER), 0)) > ?5 THEN 1
           ELSE edge_kv_store.rev + 1
         END,
         'windowStartMs',
         CASE
           WHEN (?4 - COALESCE(CAST(json_extract(edge_kv_store.payload_json, '$.windowStartMs') AS INTEGER), 0)) > ?5 THEN ?4
           ELSE COALESCE(CAST(json_extract(edge_kv_store.payload_json, '$.windowStartMs') AS INTEGER), ?4)
         END,
         'lockedUntilMs',
         MAX(
           COALESCE(CAST(json_extract(edge_kv_store.payload_json, '$.lockedUntilMs') AS INTEGER), 0),
           CASE
             WHEN (CASE WHEN (?4 - COALESCE(CAST(json_extract(edge_kv_store.payload_json, '$.windowStartMs') AS INTEGER), 0)) > ?5 THEN 1 ELSE edge_kv_store.rev + 1 END) >= 15 THEN (?4 + 86400000)
             WHEN (CASE WHEN (?4 - COALESCE(CAST(json_extract(edge_kv_store.payload_json, '$.windowStartMs') AS INTEGER), 0)) > ?5 THEN 1 ELSE edge_kv_store.rev + 1 END) >= 10 THEN (?4 + 1800000)
             WHEN (CASE WHEN (?4 - COALESCE(CAST(json_extract(edge_kv_store.payload_json, '$.windowStartMs') AS INTEGER), 0)) > ?5 THEN 1 ELSE edge_kv_store.rev + 1 END) >= 5 THEN (?4 + 300000)
             ELSE 0
           END
         )
       ),
       updated_at = ?3
     RETURNING payload_json`
  ).bind(key, initJson, nowIso, nowMs, windowMs).first();
  const parsed = row ? safeJsonParse(row.payload_json, null) : null;
  return parsed && typeof parsed === 'object' ? parsed : { fails: 1, windowStartMs: nowMs, lockedUntilMs: 0 };
}

async function recordAuthFailure(db, ipHash, emailRaw) {
  const emailClean = String(emailRaw || '').trim().toLowerCase();
  const memIp = checkSlidingRateLimit(`auth_fail_ip:${ipHash}`, 5, 300000);
  const memEm = emailClean
    ? checkSlidingRateLimit(`auth_fail_em:${ipHash}:${emailClean}`, 5, 300000)
    : { allowed: true };
  if (!db || !ipHash) {
    const throttled = !memIp.allowed || !memEm.allowed;
    return { throttled, retryAfterSec: throttled ? 300 : 0 };
  }
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  try {
    if (Math.random() < 0.05) {
      const cutoffIso = new Date(nowMs - 48 * 3600 * 1000).toISOString();
      await db.prepare("DELETE FROM edge_kv_store WHERE (doc_key LIKE 'rl:lock_%' OR doc_key LIKE 'rl:auth_%') AND updated_at < ?1").bind(cutoffIso).run();
    }
    const ipState = await bumpLockCounter(db, `rl:lock_ip:${ipHash}`, LOCKOUT_WINDOW_MS, nowMs, nowIso);
    let maxUntil = Number(ipState.lockedUntilMs || 0);
    if (emailClean) {
      const emIpState = await bumpLockCounter(db, `rl:lock_em_ip:${ipHash}:${emailClean}`, LOCKOUT_WINDOW_MS, nowMs, nowIso);
      maxUntil = Math.max(maxUntil, Number(emIpState.lockedUntilMs || 0));
    }
    if (maxUntil > nowMs) {
      return { throttled: true, retryAfterSec: Math.max(1, Math.ceil((maxUntil - nowMs) / 1000)) };
    }
    return { throttled: false, retryAfterSec: 0 };
  } catch (_) {
    const throttled = !memIp.allowed || !memEm.allowed;
    return { throttled, retryAfterSec: throttled ? 300 : 0 };
  }
}

async function clearAuthFailure(db, ipHash, emailRaw) {
  if (!db || !ipHash) return;
  const emailClean = String(emailRaw || '').trim().toLowerCase();
  const keys = [`rl:lock_ip:${ipHash}`];
  if (emailClean) keys.push(`rl:lock_em_ip:${ipHash}:${emailClean}`);
  try {
    const ph = keys.map((_, i) => `?${i + 1}`).join(',');
    await db.prepare(`DELETE FROM edge_kv_store WHERE doc_key IN (${ph})`).bind(...keys).run();
  } catch (_) {}
}

export async function handleStatus(env, session = null) {
  const d1Ready = Boolean(env && env.DB);
  const r2Ready = Boolean(env && env.BUCKET);
  if (!d1Ready || !session || !isOwnerOrFullGroupSession(session)) {
    return jsonResponse({
      ok: true,
      edge: true,
      d1_ready: d1Ready,
      r2_ready: r2Ready
    });
  }
  const coreTables = ['sales_tickets', 'raw_purchases', 'fuel_intakes', 'expenses', 'customer_receipts', 'supplier_payments', 'salary_payments', 'users'];
  const counts = {};
  let totalRows = 0;
  try {
    const stmts = coreTables.map(t => env.DB.prepare(`SELECT '${t}' AS tbl, COUNT(*) AS cnt FROM ${t}`));
    const batchRes = await env.DB.batch(stmts);
    for (const r of batchRes) {
      const row = r.results && r.results[0];
      if (row && row.tbl) {
        counts[row.tbl] = Number(row.cnt || 0);
        totalRows += counts[row.tbl];
      }
    }
  } catch (_) {}
  return jsonResponse({
    ok: true,
    edge: true,
    d1_ready: true,
    r2_ready: r2Ready,
    engine: 'ISABI Edge SQL (Cloudflare D1 + R2)',
    db_size_kb: Math.max(16355, Math.round(totalRows * 0.19)),
    counts
  });
}

async function upgradePlaintextSeatPinIfNeeded(db, row, rawPin) {
  if (!db || !row || !row.id || !rawPin) return;
  try {
    const hashed = await hashSeatPin(rawPin);
    const basePayload = stripBiometricsForPayload(safeJsonParse(row.payload_json, {}));
    await db.prepare('UPDATE users SET pin_code = ?1, payload_json = ?2 WHERE id = ?3')
      .bind(hashed, JSON.stringify(basePayload), row.id)
      .run();
  } catch (_) {}
}

export async function handleAuthLogin(request, env, body, verifiedCallerSession) {
  if (!env || !env.DB) return jsonResponse({ ok: false, error: 'Edge database unavailable' }, 503);
  if (isDemoHeader(request)) {
    return jsonResponse({ ok: true, demo: true, edge: true });
  }
  const email = String((body && body.email) || '').trim().toLowerCase();
  const pin = String((body && body.pin) || '').trim();
  const method = String((body && body.method) || 'PIN').trim().slice(0, 40);
  const confidence = body && body.confidence != null ? Number(body.confidence) : null;
  const device = String((body && body.device) || 'Web Browser').slice(0, 80);
  const faceDesc = body && body.face_descriptor;
  const isFaceMethod = /^face\s*id/i.test(method);
  const ipHash = await hashClientIp(request);

  const lockState = await checkAuthLockout(env.DB, ipHash, email);
  if (lockState.locked) {
    return jsonResponse({
      ok: false,
      rate_limited: true,
      retry_after_sec: lockState.retryAfterSec,
      error: `Too many failed sign-in attempts. Please wait ${Math.max(1, Math.ceil(lockState.retryAfterSec / 60))} minute(s).`
    }, 429, { 'Retry-After': String(lockState.retryAfterSec) });
  }

  let row = null;
  const failAuth = async (errMsg, status = 401) => {
    const res = await recordAuthFailure(env.DB, ipHash, email || (row && row.email) || '');
    if (res.throttled) {
      return jsonResponse({
        ok: false,
        rate_limited: true,
        retry_after_sec: res.retryAfterSec,
        error: `Too many failed sign-in attempts. Please wait ${Math.max(1, Math.ceil(res.retryAfterSec / 60))} minute(s).`
      }, 429, { 'Retry-After': String(res.retryAfterSec) });
    }
    return jsonResponse({ ok: false, error: errMsg }, status);
  };

  const isStepUp = Boolean(body && body.step_up === true);
  const isVerifyOnly = Boolean((body && body.verify_only === true) || isStepUp);
  let callerSess = null;
  if (isVerifyOnly || isStepUp || method === 'Owner Impersonation') {
    callerSess = verifiedCallerSession !== undefined
      ? verifiedCallerSession
      : await verifyActiveEdgeSession(await extractRequestSession(request, env), env);
    if (isVerifyOnly && !callerSess) {
      return jsonResponse({ ok: false, error: 'Active session required for identity verification.' }, 401);
    }
    if (isStepUp) {
      const cEm = String(callerSess.email || '').trim().toLowerCase();
      if (email && cEm && email !== cEm) {
        return jsonResponse({ ok: false, error: 'Step-up verification must match the currently signed-in account.' }, 403);
      }
    }
    if (method === 'Owner Impersonation' && (!callerSess || !isOwnerOrFullGroupSession(callerSess))) {
      return failAuth('Active Owner session required for seat impersonation.');
    }
  }

  let allActiveCache = null;
  const loadAllActive = async () => {
    if (!allActiveCache) {
      const res = await env.DB.prepare("SELECT * FROM users WHERE COALESCE(status, 'Active') != 'Suspended'").all();
      allActiveCache = res.results || [];
    }
    return allActiveCache;
  };

  if (email) {
    row = await env.DB.prepare('SELECT * FROM users WHERE lower(email) = ?1 LIMIT 1').bind(email).first();
  } else if (isVerifyOnly && callerSess && isFaceMethod && isValidFaceVec(faceDesc)) {
    const allActive = await loadAllActive();
    let bestCand = null;
    let bestDist = Infinity;
    let secondDist = Infinity;
    for (const cand of allActive) {
      const d = bestRowFaceDist(faceDesc, cand.face_samples);
      if (d < bestDist) {
        secondDist = bestDist;
        bestDist = d;
        bestCand = cand;
      } else if (d < secondDist) {
        secondDist = d;
      }
    }
    const minMargin = isStepUp ? 0.08 : 0.06;
    if (bestCand && bestDist <= 0.50 && (secondDist - bestDist) >= minMargin) {
      row = bestCand;
    } else {
      return failAuth('Face ID not recognized.');
    }
  } else {
    return jsonResponse({ ok: false, error: 'Email and Access PIN are required.' }, 400);
  }
  if (!row) {
    return failAuth('Invalid email or Access PIN.');
  }
  if (String(row.status || '') === 'Suspended') {
    return callerSess
      ? jsonResponse({ ok: false, error: 'This user seat is currently suspended.' }, 403)
      : failAuth('Invalid email or Access PIN.');
  }

  const wsFaceSettings = await readWorkspaceFaceSettings(env.DB);
  // No default PIN: a seat with no PIN on file cannot pass a PIN check until an Owner sets one.
  const expectedPin = String(row.pin_code || '').trim();
  const hasEnrolledBio = safeJsonParse(row.face_samples, []).some(isValidFaceVec);
  const authMode = resolveServerSeatAuthMode(row, wsFaceSettings, hasEnrolledBio);
  // Remote web sessions NEVER issue a JWT/cookie on a client-supplied 128-float vector alone:
  // Face ID login on the web always requires Email + PIN + Face ID (`both`).
  const needsTwoFactor = (!isVerifyOnly && isFaceMethod) || (authMode === 'both' && hasEnrolledBio) || /2fa/i.test(method);
  if (isStepUp && callerSess) {
    const rowIdMatch = String(row.id || '') === String(callerSess.sub || '');
    const rowEmMatch = String(row.email || '').trim().toLowerCase() === String(callerSess.email || '').trim().toLowerCase();
    if (!rowIdMatch && !rowEmMatch) {
      return jsonResponse({ ok: false, error: 'Step-up verification must match the currently signed-in account.' }, 403);
    }
  }
  const allowOwnerImpersonation = Boolean(!isStepUp && callerSess && method === 'Owner Impersonation' && isOwnerOrFullGroupSession(callerSess));

  let verifiedFaceDist = null;
  let pinUpgradeNeeded = false;

  if (!allowOwnerImpersonation) {
    if (isFaceMethod) {
      if (authMode === 'pin_only' && !(isVerifyOnly && !isStepUp && body && body.allow_pin_only_verify === true && callerSess)) {
        return failAuth('This seat requires PIN sign-in.');
      }
      if (!isValidFaceVec(faceDesc)) {
        return failAuth('Verified 128-d Face ID descriptor is required.');
      }
      const targetDist = bestRowFaceDist(faceDesc, row.face_samples);
      if (!(targetDist <= 0.50)) {
        return failAuth('Face ID biometric verification failed.');
      }
      const allActive = await loadAllActive();
      for (const cand of allActive) {
        if (String(cand.id) === String(row.id)) continue;
        const otherDist = bestRowFaceDist(faceDesc, cand.face_samples);
        if (isStepUp && otherDist < targetDist + 0.08) {
          return jsonResponse({ ok: false, error: 'Step-up verification must match the currently signed-in account.' }, 403);
        }
        if (otherDist + 1e-6 < targetDist) {
          return failAuth('Face ID matched a different enrolled seat.');
        }
      }
      verifiedFaceDist = Number(targetDist.toFixed(4));
      if (needsTwoFactor && (!isVerifyOnly || isStepUp)) {
        if (!pin) {
          if (!callerSess) {
            const rl = await recordAuthFailure(env.DB, ipHash, email || row.email || '');
            if (rl.throttled) {
              return jsonResponse({
                ok: false,
                rate_limited: true,
                retry_after_sec: rl.retryAfterSec,
                error: `Too many failed sign-in attempts. Please wait ${Math.max(1, Math.ceil(rl.retryAfterSec / 60))} minute(s).`
              }, 429, { 'Retry-After': String(rl.retryAfterSec) });
            }
          }
          const pinReqOut = {
            ok: false,
            two_factor_pin_required: true,
            email: row.email,
            error: 'Two-factor Access PIN is required.'
          };
          if (callerSess) {
            pinReqOut.full_name = row.full_name;
            pinReqOut.user = hydrateUserRow(row, true, true);
          }
          return jsonResponse(pinReqOut, isStepUp ? 403 : 401);
        }
        const pinCheck = await verifySeatPin(pin, expectedPin);
        if (!pinCheck.ok) {
          return isStepUp
            ? jsonResponse({ ok: false, error: 'Two-factor Access PIN is required.' }, 403)
            : failAuth('Two-factor Access PIN is required.');
        }
        pinUpgradeNeeded = pinCheck.needsUpgrade;
      }
    } else {
      if (authMode === 'face_only' && hasEnrolledBio) {
        return failAuth('This seat requires Face ID + PIN sign-in.');
      }
      const pinCheck = await verifySeatPin(pin, expectedPin);
      if (!pinCheck.ok) {
        return failAuth('Invalid email or Access PIN.');
      }
      pinUpgradeNeeded = pinCheck.needsUpgrade;
      const mustVerifyFace = (needsTwoFactor && hasEnrolledBio) || /face\s*id/i.test(method) || (body && body.face_descriptor !== undefined);
      if (needsTwoFactor && !hasEnrolledBio && /face\s*id/i.test(method)) {
        return failAuth('Face ID is not enrolled for this seat.');
      }
      if (mustVerifyFace) {
        if (!isValidFaceVec(faceDesc)) {
          if (needsTwoFactor && hasEnrolledBio && !/face\s*id/i.test(method)) {
            return jsonResponse({
              ok: false,
              two_factor_face_required: true,
              email: row.email,
              error: 'Two-factor Face ID biometric verification is required.'
            }, isStepUp ? 403 : 401);
          }
          return failAuth('Verified 128-d Face ID descriptor is required.');
        }
        const targetDist = bestRowFaceDist(faceDesc, row.face_samples);
        if (!(targetDist <= 0.50)) {
          return failAuth('Face ID biometric verification failed.');
        }
        const allActive = await loadAllActive();
        for (const cand of allActive) {
          if (String(cand.id) === String(row.id)) continue;
          const otherDist = bestRowFaceDist(faceDesc, cand.face_samples);
          if (isStepUp && otherDist < targetDist + 0.08) {
            return jsonResponse({ ok: false, error: 'Step-up verification must match the currently signed-in account.' }, 403);
          }
          if (otherDist + 1e-6 < targetDist) {
            return failAuth('Face ID matched a different enrolled seat.');
          }
        }
        verifiedFaceDist = Number(targetDist.toFixed(4));
      }
    }
  }

  if (pinUpgradeNeeded && pin) {
    await upgradePlaintextSeatPinIfNeeded(env.DB, row, pin);
  }

  if (isVerifyOnly) {
    await clearAuthFailure(env.DB, ipHash, row.email);
    const redactDist = isStepUp || Boolean(body && body.redact_dist === true) || !(callerSess && canManageUsersSeat(callerSess));
    const verifyOut = {
      ok: true,
      edge: true,
      verify_only: true,
      verified_only: true,
      step_up: isStepUp,
      user: hydrateUserRow(row, true, true)
    };
    if (!redactDist) verifyOut.face_dist = verifiedFaceDist;
    return jsonResponse(verifyOut);
  }

  const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const sessId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  let token = '';
  try {
    token = await signEdgeSession({
      sid: sessId,
      sub: row.id,
      email: row.email,
      name: row.full_name,
      role: row.role,
      companies: row.companies,
      pbi: row.pbi_access || 'full',
      stmts: row.statements_access || 'full'
    }, env);
  } catch (_) {
    return jsonResponse({ ok: false, error: 'Edge authentication secret is not configured.' }, 503);
  }

  await Promise.all([
    env.DB.batch([
      env.DB.prepare('UPDATE users SET last_login_at = ?1 WHERE id = ?2').bind(nowIso, row.id),
      env.DB.prepare(
        `INSERT OR REPLACE INTO auth_sessions (id, user_id, email, full_name, role, companies, device, logged_in_at, method, confidence, ip_hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
      ).bind(sessId, row.id, row.email, row.full_name, row.role, row.companies, device, nowIso, method, confidence, ipHash)
    ]),
    clearAuthFailure(env.DB, ipHash, row.email)
  ]);

  const isHttps = new URL(request.url).protocol === 'https:';
  const userOut = hydrateUserRow(Object.assign({}, row, { last_login_at: nowIso }), true, false);
  // Real browsers send `Sec-Fetch-Site` and rely exclusively on the HttpOnly session cookie (zero JS-accessible JWT in localStorage).
  // Non-browser CLI / verification clients omit `Sec-Fetch-Site` and receive `token` for header-based API calls.
  const isBrowserFetch = Boolean(request.headers.get('Sec-Fetch-Site'));
  const loginPayload = { ok: true, edge: true, user: userOut, session_id: sessId, face_dist: verifiedFaceDist };
  if (!isBrowserFetch) loginPayload.token = token;

  return jsonResponse(
    loginPayload,
    200,
    { 'Set-Cookie': buildSessionCookie(token, 60 * 60 * 24 * 14, isHttps) }
  );
}

export async function handleAuthLogout(request, env, session) {
  if (env && env.DB && session && session.sid) {
    try {
      await env.DB.prepare('DELETE FROM auth_sessions WHERE id = ?1').bind(String(session.sid)).run();
    } catch (_) {}
  }
  const isHttps = new URL(request.url).protocol === 'https:';
  return jsonResponse(
    { ok: true, loggedOut: true },
    200,
    { 'Set-Cookie': clearSessionCookie(isHttps) }
  );
}

const OVERRIDE_UNLOCK_KEYS = [
  'unlock_unit_price',
  'unlock_trans_price',
  'unlock_qty_cap',
  'unlock_uom',
  'unlock_method',
  'unlock_fleet_cascade',
  'unlock_site_owner',
  'unlock_vat_serial',
  'unlock_formula_totals'
];

const OVERRIDE_FIELD_TO_UNLOCK_KEY = {
  f_date: 'unlock_formula_totals',
  f_unitprice: 'unlock_unit_price',
  f_price: 'unlock_unit_price',
  f_transunitprice: 'unlock_trans_price',
  f_qty: 'unlock_qty_cap',
  f_uom: 'unlock_uom',
  f_malf_uom: 'unlock_uom',
  f_method: 'unlock_method',
  f_truckowner: 'unlock_fleet_cascade',
  f_truck: 'unlock_fleet_cascade',
  f_driver: 'unlock_fleet_cascade',
  f_metertype: 'unlock_fleet_cascade',
  f_subcategory: 'unlock_fleet_cascade',
  f_siteowner: 'unlock_site_owner',
  f_vatinvoice: 'unlock_vat_serial',
  f_amount: 'unlock_formula_totals',
  f_mat_total: 'unlock_formula_totals',
  f_trans_total: 'unlock_formula_totals',
  f_total_usd: 'unlock_formula_totals',
  f_fxrate: 'unlock_formula_totals'
};

const DUMMY_OVERRIDE_PBKDF2 = 'pbkdf2$sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

let _overrideAuditSchemaReady = false;
async function ensureOverrideAuditSchema(db) {
  if (!db || _overrideAuditSchemaReady) return;
  try {
    await db.batch([
      db.prepare(
        `CREATE TABLE IF NOT EXISTS override_audit (
           id TEXT PRIMARY KEY,
           created_at TEXT NOT NULL DEFAULT '',
           caller_user_id TEXT DEFAULT '',
           caller_email TEXT DEFAULT '',
           caller_role TEXT DEFAULT '',
           supervisor_user_id TEXT DEFAULT '',
           supervisor_email TEXT DEFAULT '',
           supervisor_name TEXT DEFAULT '',
           supervisor_role TEXT DEFAULT '',
           company TEXT DEFAULT '',
           form_key TEXT DEFAULT '',
           field_id TEXT DEFAULT '',
           field_label TEXT DEFAULT '',
           unlock_all INTEGER DEFAULT 0,
           record_id TEXT DEFAULT '',
           ip_hash TEXT DEFAULT ''
         )`
      ),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_override_audit_co_created ON override_audit (company, created_at DESC)')
    ]);
    _overrideAuditSchemaReady = true;
  } catch (_) {}
}

function isSupervisorOrOwnerRole(roleRaw, uidRaw = '') {
  const uid = String(uidRaw || '').trim();
  if (uid === 'u1' || uid === 'u2') return true;
  return /owner|admin|full\s*access|supervisor/i.test(String(roleRaw || ''));
}

function canUserRowAuthorizeOverride(row, fieldId, unlockAll) {
  if (!row) return false;
  if (isSupervisorOrOwnerRole(row.role, row.id)) return true;
  const roleStr = String(row.role || '').trim();
  const cp = safeJsonParse(row.custom_perms, null);
  if (cp && typeof cp === 'object' && cp.unlocks && typeof cp.unlocks === 'object' && (/^custom/i.test(roleStr) || cp.unlocksCustomized === true)) {
    if (unlockAll) {
      return OVERRIDE_UNLOCK_KEYS.every(k => cp.unlocks[k] === true);
    }
    const uk = OVERRIDE_FIELD_TO_UNLOCK_KEY[String(fieldId || '').trim()];
    return Boolean(uk && cp.unlocks[uk] === true);
  }
  return false;
}

function shareAnyAllowedCompany(sessA, sessB) {
  if (!sessA || !sessB) return false;
  if (isOwnerOrFullGroupSession(sessA) || isOwnerOrFullGroupSession(sessB)) {
    const aList = parseAllowedCompanies(sessA.companies);
    const bList = parseAllowedCompanies(sessB.companies);
    if ((aList.includes('*') || isOwnerOrFullGroupSession(sessA)) && (bList.length > 0 || isOwnerOrFullGroupSession(sessB))) return true;
    if ((bList.includes('*') || isOwnerOrFullGroupSession(sessB)) && (aList.length > 0 || isOwnerOrFullGroupSession(sessA))) return true;
  }
  const aCos = parseAllowedCompanies(sessA.companies).map(c => CANON_COMPANY_MAP[c.replace(/\s+/g, ' ')] || c);
  const bCos = new Set(parseAllowedCompanies(sessB.companies).map(c => CANON_COMPANY_MAP[c.replace(/\s+/g, ' ')] || c));
  return aCos.some(c => bCos.has(c));
}

export async function handleVerifyOverride(request, env, session, body, url) {
  if (!session) return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  if (isDemoHeader(request)) {
    return jsonResponse({ ok: false, error: 'Supervisor override API is disabled for demo sandbox headers.' }, 403);
  }
  if (!env || !env.DB) return jsonResponse({ ok: false, error: 'Edge database unavailable.' }, 503);

  if (request.method === 'GET') {
    if (!isOwnerOrFullGroupSession(session) && !isSupervisorOrOwnerRole(session.role, session.sub)) {
      return jsonResponse({ ok: false, error: 'Supervisor or Owner privileges are required to view override audit logs.' }, 403);
    }
    await ensureOverrideAuditSchema(env.DB);
    const lim = Math.min(200, Math.max(1, parseInt((url && url.searchParams && url.searchParams.get('limit')) || '50', 10) || 50));
    const res = await env.DB.prepare('SELECT * FROM override_audit ORDER BY created_at DESC LIMIT ?1').bind(lim).all();
    const isFullOwner = isOwnerOrFullGroupSession(session);
    const audits = (res.results || []).filter(r => {
      if (isFullOwner) return true;
      const co = String(r.company || '').trim();
      if (co) return canAccessSentinelScope(session, co);
      return String(r.supervisor_user_id || '') === String(session.sub || '') || String(r.caller_user_id || '') === String(session.sub || '');
    }).map(r => Object.assign({}, r, { unlock_all: Boolean(r.unlock_all) }));
    return jsonResponse({ ok: true, audits });
  }

  const email = String((body && body.email) || '').trim().toLowerCase();
  const pin = String((body && body.pin) || '').trim();
  const company = String((body && body.company) || '').trim().slice(0, 80);
  const formKey = String((body && body.form_key) || '').trim().slice(0, 60);
  const fieldId = String((body && body.field_id) || '').trim().slice(0, 80);
  const fieldLabel = String((body && body.field_label) || '').trim().slice(0, 120);
  const unlockAll = Boolean(body && body.unlock_all === true);
  const recordId = String((body && body.record_id) || '').trim().slice(0, 80);

  const ipHash = await hashClientIp(request);
  const callerKey = String(session.sub || session.email || 'anon').trim().toLowerCase();
  const callerLockKey = `rl:lock_ov_caller:${callerKey}`;
  const pairLockKey = email ? `rl:lock_ov_pair:${ipHash}:${email}` : '';
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

  if (!email || !pin) {
    return jsonResponse({ ok: false, error: 'Supervisor email and Access PIN are required.' }, 400);
  }

  const failOverride = async (errMsg, status = 401) => {
    const memCaller = checkSlidingRateLimit(`ov_fail_caller:${callerKey}`, 5, 300000);
    const memPair = email ? checkSlidingRateLimit(`ov_fail_pair:${ipHash}:${email}`, 5, 300000) : { allowed: true };
    let throttled = !memCaller.allowed || !memPair.allowed;
    let retrySec = throttled ? 300 : 0;
    try {
      const fMs = Date.now();
      const fIso = new Date(fMs).toISOString();
      for (const lk of ovLockKeys) {
        const lState = await bumpLockCounter(env.DB, lk, LOCKOUT_WINDOW_MS, fMs, fIso);
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
    return jsonResponse({ ok: false, error: errMsg }, status);
  };

  const row = await env.DB.prepare('SELECT * FROM users WHERE lower(email) = ?1 LIMIT 1').bind(email).first();
  if (!row || String(row.status || '') === 'Suspended') {
    await verifySeatPin(pin, DUMMY_OVERRIDE_PBKDF2);
    return failOverride('Invalid Supervisor email or Access PIN.', 401);
  }

  // Always perform constant-time PBKDF2 work first, then check role & company RLS BEFORE PIN validity
  // so unauthorized/cross-BU targets never leak a 401-vs-403 PIN oracle.
  const expectedPin = String(row.pin_code || '').trim();
  const pinCheck = expectedPin
    ? await verifySeatPin(pin, expectedPin)
    : (await verifySeatPin(pin, DUMMY_OVERRIDE_PBKDF2), { ok: false, needsUpgrade: false });

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

  if (!pinCheck.ok) {
    return failOverride('Invalid Supervisor email or Access PIN.', 401);
  }
  if (pinCheck.needsUpgrade) {
    await upgradePlaintextSeatPinIfNeeded(env.DB, row, pin);
  }

  await ensureOverrideAuditSchema(env.DB);
  const randBytes = crypto.getRandomValues(new Uint8Array(4));
  const randHex = Array.from(randBytes).map(b => b.toString(16).padStart(2, '0')).join('');
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
    authorized_by: {
      id: row.id,
      full_name: row.full_name || '',
      email: row.email || '',
      role: row.role || ''
    }
  });
}

// ---------------------------------------------------------------------------
// Remote override approval (Phase 5): an Entry seat asks, any eligible approver signed in elsewhere
// approves or denies with one tap. An approval writes the same override_audit row as the PIN path
// (supervisor = approver), so the audit trail is identical.
// ---------------------------------------------------------------------------
const OVR_REQ_TTL_MS = 10 * 60 * 1000;
const OVR_REQ_MAX_PENDING = 3;
const OVR_REQ_MAX_PER_HOUR = 20;

let _overrideRequestsSchemaReady = false;
async function ensureOverrideRequestsSchema(db) {
  if (!db || _overrideRequestsSchemaReady) return;
  try {
    await db.batch([
      db.prepare(
        `CREATE TABLE IF NOT EXISTS override_requests (
           id TEXT PRIMARY KEY,
           created_at TEXT NOT NULL DEFAULT '',
           expires_at TEXT NOT NULL DEFAULT '',
           status TEXT NOT NULL DEFAULT 'pending',
           caller_user_id TEXT DEFAULT '',
           caller_email TEXT DEFAULT '',
           caller_name TEXT DEFAULT '',
           caller_role TEXT DEFAULT '',
           company TEXT DEFAULT '',
           form_key TEXT DEFAULT '',
           field_id TEXT DEFAULT '',
           field_label TEXT DEFAULT '',
           unlock_all INTEGER DEFAULT 0,
           record_id TEXT DEFAULT '',
           reason TEXT DEFAULT '',
           decided_by_user_id TEXT DEFAULT '',
           decided_by_email TEXT DEFAULT '',
           decided_by_name TEXT DEFAULT '',
           decided_by_role TEXT DEFAULT '',
           decided_at TEXT DEFAULT '',
           decision_note TEXT DEFAULT '',
           audit_id TEXT DEFAULT '',
           ip_hash TEXT DEFAULT ''
         )`
      ),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_override_requests_status_exp ON override_requests (status, expires_at)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_override_requests_caller_created ON override_requests (caller_user_id, created_at)')
    ]);
    _overrideRequestsSchemaReady = true;
  } catch (_) {}
}

function randHex8() {
  const b = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

function sessionLikeFromUserRow(row) {
  if (!row) return null;
  return { sub: row.id, email: row.email, role: row.role, companies: row.companies, pbi: row.pbi_access || 'partial' };
}

function isActiveUserRow(row) {
  return Boolean(row) && String(row.status || 'Active') !== 'Suspended';
}

async function loadUserRowById(db, id) {
  const uid = String(id || '').trim();
  if (!uid) return null;
  return (await db.prepare('SELECT * FROM users WHERE id = ?1 LIMIT 1').bind(uid).first()) || null;
}

// Same caller/approver company rules as handleVerifyOverride, evaluated on fresh users rows.
function overrideScopeAllows(callerSess, approverSess, company) {
  const normCo = String(company || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (normCo && normCo !== 'all' && normCo !== 'all bus' && normCo !== 'shared') {
    return canAccessSentinelScope(callerSess, company) && canAccessSentinelScope(approverSess, company);
  }
  if (normCo === 'all' || normCo === 'all bus') {
    return isOwnerOrFullGroupSession(callerSess) && isOwnerOrFullGroupSession(approverSess);
  }
  return shareAnyAllowedCompany(callerSess, approverSess);
}

function isEligibleOverrideApprover(approverRow, reqRow, callerRow) {
  if (!isActiveUserRow(approverRow) || !reqRow) return false;
  if (String(approverRow.id || '') === String(reqRow.caller_user_id || '')) return false;
  const apEmail = String(approverRow.email || '').trim().toLowerCase();
  if (apEmail && apEmail === String(reqRow.caller_email || '').trim().toLowerCase()) return false;
  if (!canUserRowAuthorizeOverride(approverRow, reqRow.field_id, Boolean(Number(reqRow.unlock_all)))) return false;
  if (!isActiveUserRow(callerRow)) return false;
  return overrideScopeAllows(sessionLikeFromUserRow(callerRow), sessionLikeFromUserRow(approverRow), reqRow.company);
}

function effectiveOverrideStatus(row, nowIso) {
  const st = String(row.status || '');
  if (st === 'pending' && String(row.expires_at || '') <= nowIso) return 'expired';
  return st;
}

function publicOverrideRequest(row, nowIso = new Date().toISOString()) {
  const decidedId = String(row.decided_by_user_id || '');
  return {
    id: row.id,
    created_at: row.created_at,
    expires_at: row.expires_at,
    status: effectiveOverrideStatus(row, nowIso),
    company: row.company || '',
    form_key: row.form_key || '',
    field_id: row.field_id || '',
    field_label: row.field_label || '',
    unlock_all: Boolean(Number(row.unlock_all)),
    record_id: row.record_id || '',
    reason: row.reason || '',
    caller: {
      user_id: row.caller_user_id || '',
      email: row.caller_email || '',
      full_name: row.caller_name || '',
      role: row.caller_role || ''
    },
    decided_by: decidedId ? {
      user_id: decidedId,
      email: row.decided_by_email || '',
      full_name: row.decided_by_name || '',
      role: row.decided_by_role || ''
    } : null,
    decided_at: row.decided_at || null,
    decision_note: row.decision_note || '',
    audit_id: row.audit_id || null
  };
}

async function sweepExpiredOverrideRequests(db, nowIso) {
  try {
    await db.prepare("UPDATE override_requests SET status = 'expired' WHERE status = 'pending' AND expires_at <= ?1").bind(nowIso).run();
  } catch (_) {}
}

export async function handleOverrideRequests(request, env, session, body, url) {
  if (!session) return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  if (isDemoHeader(request)) {
    return jsonResponse({ ok: false, error: 'Override approval API is disabled for demo sandbox headers.' }, 403);
  }
  if (!env || !env.DB) return jsonResponse({ ok: false, error: 'Edge database unavailable.' }, 503);
  const db = env.DB;
  await ensureOverrideRequestsSchema(db);
  const me = String(session.sub || '').trim();
  if (!me) return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const notFound = () => jsonResponse({ ok: false, error: 'Request not found.' }, 404);

  const callerCache = new Map();
  const callerRowFor = async (uid) => {
    const k = String(uid || '');
    if (!callerCache.has(k)) callerCache.set(k, await loadUserRowById(db, k));
    return callerCache.get(k);
  };

  if (request.method === 'GET') {
    const qp = (url && url.searchParams) || new URLSearchParams();
    const id = String(qp.get('id') || '').trim();
    if (id) {
      const row = await db.prepare('SELECT * FROM override_requests WHERE id = ?1 LIMIT 1').bind(id.slice(0, 80)).first();
      if (!row) return notFound();
      if (String(row.caller_user_id || '') !== me) {
        const ap = await loadUserRowById(db, me);
        if (!isEligibleOverrideApprover(ap, row, await callerRowFor(row.caller_user_id))) return notFound();
      }
      return jsonResponse({ ok: true, request: publicOverrideRequest(row, nowIso) });
    }
    if (String(qp.get('status') || '').trim() === 'pending') {
      await sweepExpiredOverrideRequests(db, nowIso);
      const ap = await loadUserRowById(db, me);
      if (!isActiveUserRow(ap)) return jsonResponse({ ok: true, requests: [] });
      const res = await db.prepare(
        "SELECT * FROM override_requests WHERE status = 'pending' AND expires_at > ?1 ORDER BY created_at DESC LIMIT 300"
      ).bind(nowIso).all();
      const out = [];
      for (const row of (res.results || [])) {
        if (out.length >= 50) break;
        if (isEligibleOverrideApprover(ap, row, await callerRowFor(row.caller_user_id))) out.push(publicOverrideRequest(row, nowIso));
      }
      return jsonResponse({ ok: true, requests: out });
    }
    if (String(qp.get('mine') || '').trim() === '1') {
      await sweepExpiredOverrideRequests(db, nowIso);
      const since = new Date(nowMs - 86400000).toISOString();
      const res = await db.prepare(
        'SELECT * FROM override_requests WHERE caller_user_id = ?1 AND created_at > ?2 ORDER BY created_at DESC LIMIT 20'
      ).bind(me, since).all();
      return jsonResponse({ ok: true, requests: (res.results || []).map(r => publicOverrideRequest(r, nowIso)) });
    }
    return jsonResponse({ ok: false, error: 'Pass id, status=pending or mine=1.' }, 400);
  }

  if (request.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405);
  const op = String((body && body.op) || '').trim();

  if (op === 'create') {
    const company = String((body && body.company) || '').trim().slice(0, 80);
    const formKey = String((body && body.form_key) || '').trim().slice(0, 60);
    const fieldId = String((body && body.field_id) || '').trim().slice(0, 80);
    const fieldLabel = String((body && body.field_label) || '').trim().slice(0, 120);
    const unlockAll = Boolean(body && body.unlock_all === true);
    const recordId = String((body && body.record_id) || '').trim().slice(0, 80);
    const reason = String((body && body.reason) || '').trim().slice(0, 200);
    if (!fieldId && !unlockAll) return jsonResponse({ ok: false, error: 'A field_id or unlock_all is required.' }, 400);

    const callerRow = await loadUserRowById(db, me);
    if (!isActiveUserRow(callerRow)) return jsonResponse({ ok: false, error: 'Your seat is not active.' }, 403);
    const callerSess = sessionLikeFromUserRow(callerRow);
    const normCo = company.toLowerCase().replace(/\s+/g, ' ');
    if (normCo && normCo !== 'all' && normCo !== 'all bus' && normCo !== 'shared') {
      if (!canAccessSentinelScope(callerSess, company)) {
        return jsonResponse({ ok: false, error: 'Caller session is not authorized for this company scope.' }, 403);
      }
    } else if ((normCo === 'all' || normCo === 'all bus') && !isOwnerOrFullGroupSession(callerSess)) {
      return jsonResponse({ ok: false, error: 'Group-wide override requires full-group Owner authorization.' }, 403);
    }

    const id = `ovr-${nowMs}-${randHex8()}`;
    const expiresAt = new Date(nowMs + OVR_REQ_TTL_MS).toISOString();
    const hourAgo = new Date(nowMs - 3600000).toISOString();
    const ipHash = await hashClientIp(request);
    const row = {
      id, created_at: nowIso, expires_at: expiresAt, status: 'pending',
      caller_user_id: me,
      caller_email: String(callerRow.email || session.email || ''),
      caller_name: String(callerRow.full_name || session.name || ''),
      caller_role: String(callerRow.role || session.role || ''),
      company, form_key: formKey, field_id: fieldId, field_label: fieldLabel,
      unlock_all: unlockAll ? 1 : 0, record_id: recordId, reason
    };
    // Both limits are enforced inside the INSERT itself so two concurrent creates cannot both slip past them.
    const ins = await db.prepare(
      `INSERT INTO override_requests (
         id, created_at, expires_at, status, caller_user_id, caller_email, caller_name, caller_role,
         company, form_key, field_id, field_label, unlock_all, record_id, reason, ip_hash
       ) SELECT ?1, ?2, ?3, 'pending', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15
       WHERE (SELECT COUNT(*) FROM override_requests WHERE caller_user_id = ?4 AND status = 'pending' AND expires_at > ?2) < ?16
         AND (SELECT COUNT(*) FROM override_requests WHERE caller_user_id = ?4 AND created_at > ?17) < ?18`
    ).bind(
      id, nowIso, expiresAt, me, row.caller_email, row.caller_name, row.caller_role,
      company, formKey, fieldId, fieldLabel, row.unlock_all, recordId, reason, ipHash,
      OVR_REQ_MAX_PENDING, hourAgo, OVR_REQ_MAX_PER_HOUR
    ).run();
    if (!ins || !ins.meta || Number(ins.meta.changes || 0) < 1) {
      const pend = await db.prepare(
        "SELECT COUNT(*) AS n FROM override_requests WHERE caller_user_id = ?1 AND status = 'pending' AND expires_at > ?2"
      ).bind(me, nowIso).first();
      if (Number((pend && pend.n) || 0) >= OVR_REQ_MAX_PENDING) {
        return jsonResponse({ ok: false, rate_limited: true, error: `You already have ${OVR_REQ_MAX_PENDING} requests waiting. Wait for an answer or cancel one first.` }, 429);
      }
      return jsonResponse({ ok: false, rate_limited: true, error: `You can send at most ${OVR_REQ_MAX_PER_HOUR} approval requests per hour.` }, 429);
    }
    return jsonResponse({ ok: true, request: publicOverrideRequest(row, nowIso) });
  }

  if (op === 'decide' || op === 'cancel') {
    const id = String((body && body.id) || '').trim().slice(0, 80);
    if (!id) return jsonResponse({ ok: false, error: 'Request id is required.' }, 400);
    const row = await db.prepare('SELECT * FROM override_requests WHERE id = ?1 LIMIT 1').bind(id).first();
    if (!row) return notFound();
    const isCaller = String(row.caller_user_id || '') === me;
    const conflict = () => jsonResponse({ ok: false, error: 'This request was already decided or has expired.' }, 409);

    if (op === 'cancel') {
      if (!isCaller) {
        const ap = await loadUserRowById(db, me);
        if (!isEligibleOverrideApprover(ap, row, await callerRowFor(row.caller_user_id))) return notFound();
        return jsonResponse({ ok: false, error: 'Only the seat that sent this request can cancel it.' }, 403);
      }
      const r = await db.prepare(
        "UPDATE override_requests SET status = 'cancelled', decided_at = ?2 WHERE id = ?1 AND caller_user_id = ?3 AND status = 'pending' AND expires_at > ?2"
      ).bind(id, nowIso, me).run();
      if (!r || !r.meta || Number(r.meta.changes || 0) < 1) return conflict();
      const fresh = await db.prepare('SELECT * FROM override_requests WHERE id = ?1 LIMIT 1').bind(id).first();
      return jsonResponse({ ok: true, request: publicOverrideRequest(fresh || row, nowIso) });
    }

    // Visibility first, then input validation, so a seat that cannot see the request learns nothing about it.
    if (isCaller) {
      return jsonResponse({ ok: false, error: 'You cannot decide your own request. Another approver must answer it.' }, 403);
    }
    const ap = await loadUserRowById(db, me);
    if (!isEligibleOverrideApprover(ap, row, await callerRowFor(row.caller_user_id))) return notFound();
    const decision = String((body && body.decision) || '').trim().toLowerCase();
    if (decision !== 'approve' && decision !== 'deny') {
      return jsonResponse({ ok: false, error: "decision must be 'approve' or 'deny'." }, 400);
    }
    const note = String((body && body.note) || '').trim().slice(0, 200);

    const apId = String(ap.id || '');
    const apEmail = String(ap.email || '');
    const apName = String(ap.full_name || '');
    const apRole = String(ap.role || '');

    if (decision === 'deny') {
      const r = await db.prepare(
        `UPDATE override_requests SET status = 'denied', decided_by_user_id = ?2, decided_by_email = ?3, decided_by_name = ?4,
           decided_by_role = ?5, decided_at = ?6, decision_note = ?7
         WHERE id = ?1 AND status = 'pending' AND expires_at > ?6`
      ).bind(id, apId, apEmail, apName, apRole, nowIso, note).run();
      if (!r || !r.meta || Number(r.meta.changes || 0) < 1) return conflict();
    } else {
      await ensureOverrideAuditSchema(db);
      const auditId = `ova-${nowMs}-${randHex8()}`;
      // One D1 batch = one transaction: the status flip and the audit row land together or not at all,
      // and the audit INSERT only fires when this call's UPDATE won the race (audit_id matches).
      await db.batch([
        db.prepare(
          `UPDATE override_requests SET status = 'approved', decided_by_user_id = ?2, decided_by_email = ?3, decided_by_name = ?4,
             decided_by_role = ?5, decided_at = ?6, decision_note = ?7, audit_id = ?8
           WHERE id = ?1 AND status = 'pending' AND expires_at > ?6`
        ).bind(id, apId, apEmail, apName, apRole, nowIso, note, auditId),
        db.prepare(
          `INSERT INTO override_audit (
             id, created_at, caller_user_id, caller_email, caller_role,
             supervisor_user_id, supervisor_email, supervisor_name, supervisor_role,
             company, form_key, field_id, field_label, unlock_all, record_id, ip_hash
           ) SELECT ?1, ?2, caller_user_id, caller_email, caller_role, ?3, ?4, ?5, ?6,
             company, form_key, CASE WHEN field_id = '' AND unlock_all = 1 THEN '__all' ELSE field_id END,
             field_label, unlock_all, record_id, ip_hash
           FROM override_requests WHERE id = ?7 AND status = 'approved' AND audit_id = ?1`
        ).bind(auditId, nowIso, apId, apEmail, apName, apRole, id)
      ]);
      const after = await db.prepare('SELECT * FROM override_requests WHERE id = ?1 LIMIT 1').bind(id).first();
      if (!after || String(after.audit_id || '') !== auditId) return conflict();
      return jsonResponse({ ok: true, request: publicOverrideRequest(after, nowIso) });
    }
    const fresh = await db.prepare('SELECT * FROM override_requests WHERE id = ?1 LIMIT 1').bind(id).first();
    return jsonResponse({ ok: true, request: publicOverrideRequest(fresh || row, nowIso) });
  }

  return jsonResponse({ ok: false, error: 'Unknown op.' }, 400);
}

// ---------------------------------------------------------------------------
// Per-seat saved table views (Phase 5). Strictly scoped to session.sub.
// ---------------------------------------------------------------------------
const SAVED_VIEW_KEY_RE = /^[A-Za-z0-9_.:\-]{1,80}$/;
const SAVED_VIEW_MAX_PAYLOAD_BYTES = 16 * 1024;
const SAVED_VIEW_MAX_PER_TABLE = 30;
const SAVED_VIEW_MAX_PER_SEAT = 200;

let _savedViewsSchemaReady = false;
async function ensureSavedViewsSchema(db) {
  if (!db || _savedViewsSchemaReady) return;
  try {
    await db.batch([
      db.prepare(
        `CREATE TABLE IF NOT EXISTS saved_views (
           id TEXT PRIMARY KEY,
           user_id TEXT NOT NULL DEFAULT '',
           table_key TEXT NOT NULL DEFAULT '',
           name TEXT NOT NULL DEFAULT '',
           payload_json TEXT NOT NULL DEFAULT '{}',
           use_count INTEGER DEFAULT 0,
           last_used_at TEXT DEFAULT '',
           created_at TEXT DEFAULT '',
           updated_at TEXT DEFAULT ''
         )`
      ),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_saved_views_user_table ON saved_views (user_id, table_key)')
    ]);
    _savedViewsSchemaReady = true;
  } catch (_) {}
}

function publicSavedView(row) {
  return {
    id: row.id,
    table_key: row.table_key,
    name: row.name,
    payload: safeJsonParse(row.payload_json, {}),
    use_count: Number(row.use_count || 0),
    last_used_at: row.last_used_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}

export async function handleSavedViews(request, env, session, body) {
  if (!session) return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  if (isDemoHeader(request)) {
    return jsonResponse({ ok: false, error: 'Saved views are disabled for demo sandbox headers.' }, 403);
  }
  if (!env || !env.DB) return jsonResponse({ ok: false, error: 'Edge database unavailable.' }, 503);
  const db = env.DB;
  await ensureSavedViewsSchema(db);
  const me = String(session.sub || '').trim();
  if (!me) return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  const notFound = () => jsonResponse({ ok: false, error: 'Saved view not found.' }, 404);
  const loadOwn = async (id) => (await db.prepare('SELECT * FROM saved_views WHERE id = ?1 AND user_id = ?2 LIMIT 1').bind(id, me).first()) || null;

  if (request.method === 'GET') {
    // Frequency-first: most-used views lead.
    const res = await db.prepare(
      'SELECT * FROM saved_views WHERE user_id = ?1 ORDER BY use_count DESC, last_used_at DESC, created_at DESC LIMIT 500'
    ).bind(me).all();
    return jsonResponse({ ok: true, views: (res.results || []).map(publicSavedView) });
  }
  if (request.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405);

  const op = String((body && body.op) || '').trim();
  const nowIso = new Date().toISOString();

  if (op === 'save') {
    const id = String((body && body.id) || '').trim();
    const tableKey = String((body && body.table_key) || '').trim();
    const name = String((body && body.name) || '').trim();
    const payload = body ? body.payload : undefined;
    if (!SAVED_VIEW_KEY_RE.test(tableKey)) return jsonResponse({ ok: false, error: 'table_key must be 1 to 80 letters, digits or _ . : -' }, 400);
    if (!name || name.length > 60) return jsonResponse({ ok: false, error: 'View name must be 1 to 60 characters.' }, 400);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return jsonResponse({ ok: false, error: 'payload must be a JSON object.' }, 400);
    }
    const payloadJson = JSON.stringify(payload);
    if (new TextEncoder().encode(payloadJson).length > SAVED_VIEW_MAX_PAYLOAD_BYTES) {
      return jsonResponse({ ok: false, error: 'View settings are too large (16 KB maximum).' }, 400);
    }
    let existing = null;
    if (id) {
      existing = await loadOwn(id.slice(0, 80));
      if (!existing) return notFound();
    }
    const perTableErr = () => jsonResponse({ ok: false, error: `You can keep at most ${SAVED_VIEW_MAX_PER_TABLE} saved views per table. Delete one first.` }, 400);
    const perSeatErr = () => jsonResponse({ ok: false, error: `You can keep at most ${SAVED_VIEW_MAX_PER_SEAT} saved views in total. Delete one first.` }, 400);
    const countTable = async () => Number(((await db.prepare('SELECT COUNT(*) AS n FROM saved_views WHERE user_id = ?1 AND table_key = ?2').bind(me, tableKey).first()) || {}).n || 0);
    if (!existing) {
      // Both caps are enforced inside the INSERT so concurrent saves cannot overshoot them.
      const newId = `sv-${Date.now()}-${randHex8()}`;
      const ins = await db.prepare(
        `INSERT INTO saved_views (id, user_id, table_key, name, payload_json, use_count, last_used_at, created_at, updated_at)
         SELECT ?1, ?2, ?3, ?4, ?5, 0, '', ?6, ?6
         WHERE (SELECT COUNT(*) FROM saved_views WHERE user_id = ?2 AND table_key = ?3) < ?7
           AND (SELECT COUNT(*) FROM saved_views WHERE user_id = ?2) < ?8`
      ).bind(newId, me, tableKey, name, payloadJson, nowIso, SAVED_VIEW_MAX_PER_TABLE, SAVED_VIEW_MAX_PER_SEAT).run();
      if (!ins || !ins.meta || Number(ins.meta.changes || 0) < 1) {
        return (await countTable()) >= SAVED_VIEW_MAX_PER_TABLE ? perTableErr() : perSeatErr();
      }
      return jsonResponse({ ok: true, view: publicSavedView(await loadOwn(newId)) });
    }
    if (existing.table_key !== tableKey) {
      const upd = await db.prepare(
        `UPDATE saved_views SET table_key = ?3, name = ?4, payload_json = ?5, updated_at = ?6 WHERE id = ?1 AND user_id = ?2
           AND (SELECT COUNT(*) FROM saved_views WHERE user_id = ?2 AND table_key = ?3) < ?7`
      ).bind(existing.id, me, tableKey, name, payloadJson, nowIso, SAVED_VIEW_MAX_PER_TABLE).run();
      if (!upd || !upd.meta || Number(upd.meta.changes || 0) < 1) return perTableErr();
    } else {
      await db.prepare(
        'UPDATE saved_views SET name = ?3, payload_json = ?4, updated_at = ?5 WHERE id = ?1 AND user_id = ?2'
      ).bind(existing.id, me, name, payloadJson, nowIso).run();
    }
    return jsonResponse({ ok: true, view: publicSavedView(await loadOwn(existing.id)) });
  }

  if (op === 'delete' || op === 'used') {
    const id = String((body && body.id) || '').trim().slice(0, 80);
    if (!id) return jsonResponse({ ok: false, error: 'View id is required.' }, 400);
    if (op === 'delete') {
      const r = await db.prepare('DELETE FROM saved_views WHERE id = ?1 AND user_id = ?2').bind(id, me).run();
      if (!r || !r.meta || Number(r.meta.changes || 0) < 1) return notFound();
      return jsonResponse({ ok: true });
    }
    const r = await db.prepare(
      'UPDATE saved_views SET use_count = COALESCE(use_count, 0) + 1, last_used_at = ?3 WHERE id = ?1 AND user_id = ?2'
    ).bind(id, me, nowIso).run();
    if (!r || !r.meta || Number(r.meta.changes || 0) < 1) return notFound();
    return jsonResponse({ ok: true, view: publicSavedView(await loadOwn(id)) });
  }

  return jsonResponse({ ok: false, error: 'Unknown op.' }, 400);
}

export async function handleSeedGet(request, env, session, kindRaw) {
  if (!session) return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  if (isDemoHeader(request)) return jsonResponse({ ok: false, error: 'Demo sandbox uses synthetic demo seeds.' }, 403);
  const kind = String(kindRaw || '').trim().toLowerCase();
  if (kind !== 'core' && kind !== 'records' && kind !== 'industries') {
    return jsonResponse({ ok: false, error: 'Invalid seed kind.' }, 400);
  }
  if (!env || !env.BUCKET) {
    return jsonResponse({ ok: false, error: 'Private seed vault unavailable.' }, 503);
  }
  const r2Key = `seeds/seed_${kind}.json`;
  const obj = await env.BUCKET.get(r2Key);
  if (!obj) {
    return jsonResponse({ ok: false, error: 'Seed snapshot not found in vault.' }, 404);
  }
  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

export async function handleUsersGet(request, env, session) {
  if (!session || isDemoHeader(request)) {
    return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  }
  if (!env || !env.DB) return jsonResponse({ ok: true, users: [], sessions: [] });
  const [[uRes, sRes], wsFaceSettings] = await Promise.all([
    env.DB.batch([
      env.DB.prepare('SELECT * FROM users ORDER BY id'),
      env.DB.prepare('SELECT * FROM auth_sessions ORDER BY logged_in_at DESC LIMIT 35')
    ]),
    readWorkspaceFaceSettings(env.DB)
  ]);
  const isOwner = Boolean(isOwnerOrFullGroupSession(session));
  const canManage = Boolean(canManageUsersSeat(session));
  const sessEmail = String(session.email || '').trim().toLowerCase();
  const sessSub = String(session.sub || '').trim();
  const users = (uRes.results || []).map(r => {
    if (isOwner) return hydrateUserRow(r, true, false);
    const rEmail = String(r.email || '').trim().toLowerCase();
    const isSelf = Boolean((sessSub && String(r.id || '') === sessSub) || (sessEmail && rEmail === sessEmail));
    if (isSelf) return hydrateUserRow(r, true, false);
    if (canManage) {
      const rCos = parseAllowedCompanies(r.companies);
      const rOwner = String(r.role || '').toLowerCase().includes('owner') || r.id === 'u1' || r.id === 'u2';
      if (!rOwner && rCos.length && !rCos.includes('*') && rCos.every(c => canAccessCompany(session, c))) {
        return hydrateUserRow(r, true, false);
      }
    }
    return null;
  }).filter(Boolean);
  let sessions = [];
  const rawSess = sRes.results || [];
  if (isOwner) {
    sessions = rawSess;
  } else if (canManage) {
    sessions = rawSess.filter(s => {
      const sEm = String((s && s.email) || '').trim().toLowerCase();
      if (sessEmail && sEm === sessEmail) return true;
      const sCos = parseAllowedCompanies(s && s.companies);
      return sCos.length > 0 && !sCos.includes('*') && sCos.some(c => canAccessCompany(session, c));
    });
  } else {
    sessions = rawSess.filter(s => sessEmail && String((s && s.email) || '').trim().toLowerCase() === sessEmail);
  }
  return jsonResponse({ ok: true, edge: true, users, sessions, faceSettings: wsFaceSettings });
}

export async function handleUsersPost(request, env, session, body) {
  if (!env || !env.DB) return jsonResponse({ ok: false, error: 'Database unavailable' }, 503);
  if (isDemoHeader(request)) return jsonResponse({ ok: false, error: 'Demo sandbox is read-only' }, 403);
  if (!session) return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);

  const u = (body && body.user) || {};
  if (!u.email || !u.full_name) {
    return jsonResponse({ ok: false, error: 'Name and email are required.' }, 400);
  }

  const emailClean = String(u.email).trim().toLowerCase();
  let uid = String(u.id || `u-${Date.now()}`);
  const existing = await env.DB.prepare(
    'SELECT * FROM users WHERE id = ?1 OR lower(email) = ?2 LIMIT 1'
  ).bind(uid, emailClean).first();
  if (existing) uid = existing.id;

  const isOwnerSession = isOwnerOrFullGroupSession(session);
  const canManage = canManageUsersSeat(session);

  if (!u.pin_redacted) {
    const rawSubmittedPin = String(u.pin_code || '').trim();
    if (rawSubmittedPin && !isHashedPin(rawSubmittedPin) && isWeakPin(rawSubmittedPin)) {
      return jsonResponse({
        ok: false,
        weak_pin: true,
        error: 'Choose a stronger Access PIN (4 to 12 digits, avoiding repeated digits like 1111 or sequences like 1234).'
      }, 400);
    }
  }

  if (!canManage) {
    const sessEmail = String(session.email || '').trim().toLowerCase();
    const submittedId = String(u.id || '').trim();
    if (
      !existing ||
      sessEmail !== emailClean ||
      sessEmail !== String(existing.email || '').trim().toLowerCase() ||
      (submittedId && submittedId !== String(existing.id || ''))
    ) {
      return jsonResponse({ ok: false, error: 'Insufficient permissions to modify team seats.' }, 403);
    }
    const selfHasFreshBio = Array.isArray(u.face_samples) && ((u.face_samples.length > 0 && !u.face_redacted) || u.face_cleared === true);
    const fsJson = selfHasFreshBio ? JSON.stringify(u.face_samples) : (existing.face_samples || '[]');
    const ftJson = (selfHasFreshBio && Array.isArray(u.face_thumbs)) ? JSON.stringify(u.face_thumbs) : (existing.face_thumbs || '[]');
    const fUpd = selfHasFreshBio
      ? String(u.face_updated_at || new Date().toISOString())
      : String(existing.face_updated_at || '');
    const lastLogin = String(u.last_login_at || existing.last_login_at || '');
    const lockedPayload = stripBiometricsForPayload(Object.assign({}, safeJsonParse(existing.payload_json, {}), {
      id: existing.id,
      full_name: existing.full_name,
      email: existing.email,
      role: existing.role,
      companies: existing.companies,
      pbi_access: existing.pbi_access,
      statements_access: existing.statements_access,
      status: existing.status,
      last_login_at: lastLogin,
      face_required: Boolean(existing.face_required),
      face_updated_at: fUpd,
      seat_updated_at: existing.seat_updated_at,
      auth_mode: existing.auth_mode || ''
    }));
    await env.DB.prepare(
      `UPDATE users SET last_login_at = ?1, face_samples = ?2, face_thumbs = ?3, face_updated_at = ?4, payload_json = ?5 WHERE id = ?6`
    ).bind(lastLogin, fsJson, ftJson, fUpd, JSON.stringify(lockedPayload), existing.id).run();
    return jsonResponse({ ok: true, id: existing.id, lockedPrivileges: true });
  }

  if (!isOwnerSession) {
    // Single-BU Supervisor: cannot modify Owner/cross-BU seats, cannot grant Owner, and can only assign subset of own BUs
    if (existing) {
      const exRole = String(existing.role || '').toLowerCase();
      if (existing.id === 'u1' || existing.id === 'u2' || exRole.includes('owner')) {
        return jsonResponse({ ok: false, error: 'Supervisors cannot modify Owner seats.' }, 403);
      }
      const exCos = parseAllowedCompanies(existing.companies);
      if (!exCos.length || exCos.includes('*') || exCos.some(c => !canAccessCompany(session, c))) {
        return jsonResponse({ ok: false, error: 'Supervisors cannot modify cross-entity seats.' }, 403);
      }
    }
    const nextRole = String(u.role || (existing && existing.role) || 'Entry');
    if (nextRole.toLowerCase().includes('owner')) {
      return jsonResponse({ ok: false, error: 'Supervisors cannot assign Owner role.' }, 403);
    }
    const nextCosStr = String(u.companies || (existing && existing.companies) || '');
    const nextCos = parseAllowedCompanies(nextCosStr);
    if (!nextCos.length || nextCos.includes('*') || nextCos.some(c => !canAccessCompany(session, c))) {
      return jsonResponse({ ok: false, error: 'Supervisors can only assign entities within their own scope.' }, 403);
    }
  }

  const hasFreshBio = Array.isArray(u.face_samples) && ((u.face_samples.length > 0 && !u.face_redacted) || u.face_cleared === true);
  const fsJson = hasFreshBio
    ? JSON.stringify(u.face_samples)
    : (existing ? (existing.face_samples || '[]') : '[]');
  const ftJson = (Array.isArray(u.face_thumbs) && ((u.face_thumbs.length > 0 && !u.face_redacted) || u.face_cleared === true))
    ? JSON.stringify(u.face_thumbs)
    : (existing ? (existing.face_thumbs || '[]') : '[]');
  const fReq = 'face_required' in u
    ? (u.face_required ? 1 : 0)
    : (existing ? Number(existing.face_required || 0) : 0);
  const fUpd = hasFreshBio
    ? String(u.face_updated_at || new Date().toISOString())
    : (existing ? String(existing.face_updated_at || '') : '');
  const cpJson = (u.custom_perms && typeof u.custom_perms === 'object')
    ? JSON.stringify(u.custom_perms)
    : (typeof u.custom_perms === 'string' && u.custom_perms.trim() ? u.custom_perms.trim() : (existing && existing.custom_perms ? existing.custom_perms : '{}'));
  const authModeVal = String('auth_mode' in u ? (u.auth_mode || '') : (existing ? (existing.auth_mode || '') : ''));
  const seatUpd = String(u.seat_updated_at || new Date().toISOString());
  const postSessEmail = String(session.email || '').trim().toLowerCase();
  const isSelfSeat = Boolean(existing && postSessEmail && postSessEmail === String(existing.email || '').trim().toLowerCase());
  const preserveExistingPin = Boolean(
    existing && (
      u.pin_redacted ||
      !String(u.pin_code || '').trim() ||
      (!isOwnerSession && !isSelfSeat)
    )
  );
  let pinVal = '';
  if (preserveExistingPin) {
    pinVal = String(existing.pin_code || '');
  } else {
    const rawNewPin = String(u.pin_code || '').trim();
    if (rawNewPin) {
      if (isHashedPin(rawNewPin)) {
        pinVal = rawNewPin;
      } else {
        if (isWeakPin(rawNewPin)) {
          return jsonResponse({
            ok: false,
            weak_pin: true,
            error: 'Choose a stronger Access PIN (4 to 12 digits, avoiding repeated digits like 1111 or sequences like 1234).'
          }, 400);
        }
        pinVal = await hashSeatPin(rawNewPin);
      }
    } else {
      pinVal = String((existing && existing.pin_code) || '');
    }
  }
  const effRole = String(u.role || (existing && existing.role) || 'Entry');
  const effCos = u.companies !== undefined ? String(u.companies) : String((existing && existing.companies) || 'WTC');
  const effPbi = String(u.pbi_access || (existing && existing.pbi_access) || 'partial');
  const effStmts = String(u.statements_access || (existing && existing.statements_access) || 'partial');
  const effStatus = String(u.status || (existing && existing.status) || 'Active');
  const effLastLogin = String(u.last_login_at || (existing && existing.last_login_at) || '');

  const cleanPayload = stripBiometricsForPayload(Object.assign({}, u, {
    id: uid,
    full_name: String(u.full_name),
    email: emailClean,
    role: effRole,
    companies: effCos,
    pbi_access: effPbi,
    statements_access: effStmts,
    status: effStatus,
    last_login_at: effLastLogin,
    face_required: Boolean(fReq),
    face_updated_at: fUpd,
    seat_updated_at: seatUpd,
    auth_mode: authModeVal
  }));

  await env.DB.prepare(
    `INSERT OR REPLACE INTO users (
       id, full_name, email, pin_code, role, companies, pbi_access, statements_access,
       status, last_login_at, face_samples, face_thumbs, face_required, face_updated_at,
       seat_updated_at, custom_perms, auth_mode, payload_json
     ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)`
  ).bind(
    uid,
    String(u.full_name),
    emailClean,
    pinVal,
    effRole,
    effCos,
    effPbi,
    effStmts,
    effStatus,
    effLastLogin,
    fsJson,
    ftJson,
    fReq,
    fUpd,
    seatUpd,
    cpJson,
    authModeVal,
    JSON.stringify(cleanPayload)
  ).run();

  return jsonResponse({ ok: true, id: uid });
}

export async function upsertTableRecord(db, table, record) {
  const canonTable = CR_KEY_TO_TABLE[table] || table;
  if (!USER_WRITABLE_TABLES.has(canonTable) || !record || typeof record !== 'object' || !record.id) {
    return { ok: false, status: 400, error: 'Invalid table or record (id required)' };
  }
  const cols = await getTableColumns(db, canonTable);
  if (!cols.size) {
    return { ok: false, status: 400, error: `Schema missing for ${canonTable}` };
  }

  if (cols.has('company') && record.company) {
    record = Object.assign({}, record, { company: canonicalizeCompanyName(record.company) });
  }

  let recId = String(record.id).trim();
  if (UNIVERSAL_UNIQUE_TABLES.has(canonTable) && !record.voided && cols.has('name')) {
    const mainVal = String(record.name || record.driver || record.equipment || '').trim();
    if (mainVal) {
      let dupRow = null;
      if (canonTable === 'expense_subcategories' && cols.has('category')) {
        const catVal = String(record.category || '').trim();
        dupRow = await db.prepare(
          `SELECT id, name FROM ${canonTable} WHERE id != ?1 AND lower(trim(name)) = lower(trim(?2)) AND lower(trim(COALESCE(category,''))) = lower(trim(?3)) AND COALESCE(voided, 0) = 0 LIMIT 1`
        ).bind(recId, mainVal, catVal).first();
      } else {
        dupRow = await db.prepare(
          `SELECT id, name FROM ${canonTable} WHERE id != ?1 AND lower(trim(name)) = lower(trim(?2)) AND COALESCE(voided, 0) = 0 LIMIT 1`
        ).bind(recId, mainVal).first();
      }
      if (dupRow) {
        if (record.modified_by) {
          record = Object.assign({}, record, { id: dupRow.id });
          recId = String(dupRow.id);
        } else {
          return {
            ok: false,
            status: 409,
            error: `Duplicate ${canonTable} main column '${mainVal}' already exists (id=${dupRow.id}).`
          };
        }
      }
    }
  }

  const colNames = [];
  const bindVals = [];
  for (const [k, rawV] of Object.entries(record)) {
    if (!cols.has(k) || k === 'payload_json') continue;
    let v = rawV;
    if (typeof v === 'boolean') v = v ? 1 : 0;
    else if (v !== null && typeof v === 'object') v = JSON.stringify(v);
    colNames.push(k);
    bindVals.push(v === undefined ? null : v);
  }
  if (cols.has('payload_json')) {
    colNames.push('payload_json');
    bindVals.push(JSON.stringify(record));
  }
  const placeholders = colNames.map((_, idx) => `?${idx + 1}`).join(',');
  await db.prepare(
    `INSERT OR REPLACE INTO ${canonTable} (${colNames.join(',')}) VALUES (${placeholders})`
  ).bind(...bindVals).run();

  return { ok: true, table: canonTable, id: recId };
}

export async function handleRecordsGet(request, env, session, url) {
  if (!session) return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  if (!env || !env.DB) return jsonResponse({ ok: true, rows: [] });
  const rawTbl = url.searchParams.get('table') || 'sales_tickets';
  const table = CR_KEY_TO_TABLE[rawTbl] || rawTbl;
  const company = (url.searchParams.get('company') || '').trim();
  const companyNorm = company.toLowerCase();
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '150', 10) || 150, 1), 2000);

  if (table === 'users') {
    return jsonResponse({ ok: false, error: 'Direct query of users via /records is forbidden.' }, 403);
  }
  if (!ALLOWED_TABLES.has(table)) {
    return jsonResponse({ ok: false, error: 'Invalid table' }, 400);
  }
  const cols = await getTableColumns(env.DB, table);
  if (!cols.size) return jsonResponse({ ok: true, table, rows: [] });

  const orderClause = cols.has('date')
    ? 'ORDER BY date DESC'
    : (cols.has('start_date') ? 'ORDER BY start_date DESC' : 'ORDER BY rowid DESC');

  let sql = `SELECT * FROM ${table}`;
  const binds = [];
  const whereParts = [];
  let allowUnknownCaseFallback = false;

  if (cols.has('company')) {
    if (company && companyNorm !== 'all' && companyNorm !== 'manufacturing-group') {
      if (!canAccessCompany(session, company)) {
        return jsonResponse({ ok: false, error: 'Row-level security: unauthorized entity scope.' }, 403);
      }
      const canonCo = canonicalizeCompanyName(company);
      binds.push(canonCo);
      // Direct equality (`company = ?1`) lets SQLite use `idx_*_co_date` with zero temp B-tree
      whereParts.push(`company = ?${binds.length}`);
      allowUnknownCaseFallback = !isKnownCanonicalCompany(company);
    } else if (companyNorm === 'manufacturing-group') {
      const mfgCos = ['WTC', 'BBConstruction', 'Lions Transport'].filter(c => canAccessCompany(session, c));
      if (!mfgCos.length) {
        return jsonResponse({ ok: false, error: 'Row-level security: unauthorized entity scope.' }, 403);
      }
      if (mfgCos.length === 1) {
        binds.push(mfgCos[0]);
        whereParts.push(`company = ?${binds.length}`);
      } else {
        const ph = mfgCos.map((_, i) => `?${binds.length + i + 1}`).join(',');
        binds.push(...mfgCos);
        whereParts.push(`company IN (${ph})`);
      }
    } else if (!isOwnerOrFullGroupSession(session)) {
      const rawAllowed = parseAllowedCompanies(session.companies).filter(c => c !== '*');
      if (!rawAllowed.length) {
        return jsonResponse({ ok: false, error: 'Row-level security: no permitted entities assigned.' }, 403);
      }
      const canonAllowed = Array.from(new Set(rawAllowed.map(c => canonicalizeCompanyName(c)).filter(Boolean)));
      if (!UNIVERSAL_UNIQUE_TABLES.has(table) && canonAllowed.length === 1) {
        binds.push(canonAllowed[0]);
        whereParts.push(`company = ?${binds.length}`);
      } else {
        const listForIn = UNIVERSAL_UNIQUE_TABLES.has(table) ? ['', ...canonAllowed] : canonAllowed;
        const ph = listForIn.map((_, i) => `?${binds.length + i + 1}`).join(',');
        binds.push(...listForIn);
        whereParts.push(`company IN (${ph})`);
      }
    }
  }

  if (whereParts.length) sql += ` WHERE ${whereParts.join(' AND ')}`;
  binds.push(limit);
  sql += ` ${orderClause} LIMIT ?${binds.length}`;

  let res = await env.DB.prepare(sql).bind(...binds).all();
  if (allowUnknownCaseFallback && (!res.results || res.results.length === 0)) {
    res = await env.DB.prepare(
      `SELECT * FROM ${table} WHERE lower(company) = ?1 ${orderClause} LIMIT ?2`
    ).bind(companyNorm, limit).all();
  }
  const outRows = (res.results || []).map(r => hydrateRowJson(r));
  return jsonResponse({ ok: true, edge: true, table, rows: outRows });
}

export async function handleRecordsPost(request, env, session, body) {
  if (!env || !env.DB) return jsonResponse({ ok: false, error: 'Database unavailable' }, 503);
  if (isDemoHeader(request)) return jsonResponse({ ok: false, error: 'Demo sandbox is read-only' }, 403);
  if (!session) return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);

  const rawTable = body && body.table;
  const canonTable = CR_KEY_TO_TABLE[rawTable] || rawTable;
  const record = body && body.record;
  if (!USER_WRITABLE_TABLES.has(canonTable) || !record || typeof record !== 'object' || !record.id) {
    return jsonResponse({ ok: false, error: 'Invalid table or record (id required)' }, 400);
  }

  if (!isOwnerOrFullGroupSession(session)) {
    const cols = await getTableColumns(env.DB, canonTable);
    const isBuScopedTable = cols.has('company') && !UNIVERSAL_UNIQUE_TABLES.has(canonTable);
    const recCo = String(record.company || '').trim();
    if (recCo && !canAccessCompany(session, recCo)) {
      return jsonResponse({ ok: false, error: 'Row-level security: unauthorized entity write.' }, 403);
    }
    if (isBuScopedTable && !recCo) {
      return jsonResponse({ ok: false, error: 'Row-level security: company is required for entity-scoped writes.' }, 403);
    }
    if (cols.has('company')) {
      const exRow = await env.DB.prepare(`SELECT company FROM ${canonTable} WHERE id = ?1`).bind(String(record.id).trim()).first();
      if (exRow && exRow.company && !canAccessCompany(session, exRow.company)) {
        return jsonResponse({ ok: false, error: 'Row-level security: cannot overwrite another entity record.' }, 403);
      }
    }
  } else if (record.company && !canAccessCompany(session, record.company)) {
    return jsonResponse({ ok: false, error: 'Row-level security: unauthorized entity write.' }, 403);
  }

  const res = await upsertTableRecord(env.DB, canonTable, record);
  if (!res.ok) return jsonResponse({ ok: false, error: res.error }, res.status || 400);
  return jsonResponse({ ok: true, edge: true, table: res.table, id: res.id });
}

export async function handleSentinelReviews(request, env, session, body) {
  if (!env || !env.DB) return jsonResponse({ ok: true, reviews: {} });
  if (!session) {
    if (isDemoHeader(request) && request.method === 'GET') return jsonResponse({ ok: true, demo: true, reviews: {} });
    return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  }
  const restrictRls = !isOwnerOrFullGroupSession(session);
  if (request.method === 'GET') {
    const res = await env.DB.prepare('SELECT * FROM sentinel_reviews').all();
    const reviews = {};
    for (const r of (res.results || [])) {
      if (!r || !r.id) continue;
      if (restrictRls && (!r.company || !canAccessSentinelScope(session, r.company))) continue;
      reviews[r.id] = Object.assign({}, r, { active: Boolean(r.active) });
    }
    return jsonResponse({ ok: true, reviews });
  }
  if (isDemoHeader(request)) return jsonResponse({ ok: false, error: 'Demo sandbox is read-only' }, 403);
  if (!canReviewSentinelsSession(session)) {
    return jsonResponse({ ok: false, error: 'Only Owner or Supervisor seats may sign off sentinel rules.' }, 403);
  }
  const incomingMap = {};
  if (body && body.review && body.review.id) {
    incomingMap[String(body.review.id)] = body.review;
  } else if (body && body.reviews && typeof body.reviews === 'object') {
    for (const [rk, rv] of Object.entries(body.reviews)) {
      if (rv && typeof rv === 'object') incomingMap[String(rv.id || rk)] = rv;
    }
  }
  let saved = 0;
  for (const [rid, rv] of Object.entries(incomingMap)) {
    const rvCo = normalizeSentinelScopeCompany(rv.company || '');
    const idScope = String(rid).includes('|') ? normalizeSentinelScopeCompany(String(rid).split('|')[0]) : '';
    if (restrictRls && (!rvCo || !idScope || idScope !== rvCo || !canAccessSentinelScope(session, rvCo))) continue;
    const inTs = String(rv.updated_at || rv.checked_at || '');
    const ex = await env.DB.prepare('SELECT updated_at, company FROM sentinel_reviews WHERE id = ?1').bind(rid).first();
    if (ex && restrictRls && ex.company && !canAccessSentinelScope(session, ex.company)) continue;
    if (ex && String(ex.updated_at || '') > inTs) continue;
    await env.DB.prepare(
      `INSERT OR REPLACE INTO sentinel_reviews
       (id, rule_id, company, baseline_metric, baseline_secondary, baseline_badge, active, checked_by, checked_by_email, checked_at, updated_at, note)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`
    ).bind(
      rid,
      String(rv.rule_id || ''),
      rvCo,
      Number(rv.baseline_metric || 0),
      Number(rv.baseline_secondary || 0),
      String(rv.baseline_badge || ''),
      rv.active === false ? 0 : 1,
      String(rv.checked_by || ''),
      String(rv.checked_by_email || ''),
      String(rv.checked_at || ''),
      inTs,
      String(rv.note || '')
    ).run();
    saved++;
  }
  return jsonResponse({ ok: true, saved });
}

function scopeAlertRulesForSession(arObj, session) {
  const base = (arObj && typeof arObj === 'object') ? arObj : { overrides: {}, custom: [] };
  const overrides = (base.overrides && typeof base.overrides === 'object') ? Object.assign({}, base.overrides) : {};
  const customArr = Array.isArray(base.custom) ? base.custom : [];
  if (session && isOwnerOrFullGroupSession(session)) {
    return { overrides, custom: customArr.filter(c => c && !c.deleted) };
  }
  const scopedCustom = customArr.filter(c => {
    if (!c || typeof c !== 'object' || c.deleted) return false;
    const co = String(c.company || '').trim();
    if (!co || /^all(\s+(bus|companies))?$/i.test(co)) return true;
    return Boolean(session && canAccessCompany(session, co));
  });
  return { overrides, custom: scopedCustom };
}

function scopeWorkSchedulesForSession(wsObj, session) {
  if (!wsObj || typeof wsObj !== 'object') return wsObj;
  if (session && isOwnerOrFullGroupSession(session)) return wsObj;
  const shifts = Array.isArray(wsObj.shiftTypes) ? wsObj.shiftTypes : [];
  const pGroups = Array.isArray(wsObj.policyGroups) ? wsObj.policyGroups : [];
  const coDefs = (wsObj.companyPolicyDefaults && typeof wsObj.companyPolicyDefaults === 'object') ? wsObj.companyPolicyDefaults : {};
  const sRules = (wsObj.staffRules && typeof wsObj.staffRules === 'object') ? wsObj.staffRules : {};
  const scopedDefs = {};
  for (const [ck, cv] of Object.entries(coDefs)) {
    if (session && canAccessCompany(session, ck)) scopedDefs[ck] = cv;
  }
  const scopedRules = {};
  for (const [rk, rv] of Object.entries(sRules)) {
    if (!rv || typeof rv !== 'object') continue;
    const co = String(rv.company || '').trim();
    if (co && session && canAccessCompany(session, co)) scopedRules[rk] = rv;
  }
  const scopedShifts = shifts.filter(s => {
    if (!s || typeof s !== 'object') return false;
    const co = String(s.company || '').trim();
    if (!co || /^all(\s+(bus|companies))?$/i.test(co)) return true;
    return Boolean(session && canAccessCompany(session, co));
  });
  return {
    shiftTypes: scopedShifts,
    policyGroups: pGroups,
    companyPolicyDefaults: scopedDefs,
    staffRules: scopedRules
  };
}

function mergeWorkSchedulesDocs(prevWsRaw, nextWsRaw, session, restrictRls) {
  const prevWs = (prevWsRaw && typeof prevWsRaw === 'object') ? prevWsRaw : {};
  const nextWs = (nextWsRaw && typeof nextWsRaw === 'object') ? nextWsRaw : {};

  // 1. policyGroups (Owner-only global policies)
  const prevPg = Array.isArray(prevWs.policyGroups) ? prevWs.policyGroups : [];
  const nextPg = Array.isArray(nextWs.policyGroups) ? nextWs.policyGroups : [];
  let mergedPg = [];
  if (restrictRls) {
    mergedPg = prevPg.slice();
  } else {
    const pgMap = new Map();
    for (const g of prevPg) {
      if (g && g.id) pgMap.set(String(g.id), g);
    }
    for (const g of nextPg) {
      if (!g || !g.id) continue;
      const gid = String(g.id);
      const cur = pgMap.get(gid);
      const curTs = cur ? String(cur.updated_at || '') : '';
      const nxtTs = String(g.updated_at || '');
      if (!cur || !curTs || !nxtTs || nxtTs >= curTs) {
        pgMap.set(gid, g);
      }
    }
    mergedPg = Array.from(pgMap.values());
  }

  // 2. companyPolicyDefaults
  const prevDefs = (prevWs.companyPolicyDefaults && typeof prevWs.companyPolicyDefaults === 'object') ? prevWs.companyPolicyDefaults : {};
  const nextDefs = (nextWs.companyPolicyDefaults && typeof nextWs.companyPolicyDefaults === 'object') ? nextWs.companyPolicyDefaults : {};
  const mergedDefs = Object.assign({}, prevDefs);
  for (const [ck, nv] of Object.entries(nextDefs)) {
    if (!nv || typeof nv !== 'object') continue;
    if (restrictRls && (!session || !canAccessCompany(session, ck))) continue;
    const cv = mergedDefs[ck];
    const curTs = (cv && typeof cv === 'object') ? String(cv.updated_at || '') : '';
    const nxtTs = String(nv.updated_at || '');
    if (!cv || !curTs || !nxtTs || nxtTs >= curTs) {
      mergedDefs[ck] = nv;
    }
  }

  // 3. shiftTypes
  const prevShifts = Array.isArray(prevWs.shiftTypes) ? prevWs.shiftTypes : [];
  const nextShifts = Array.isArray(nextWs.shiftTypes) ? nextWs.shiftTypes : [];
  const shiftKeyFn = s => `${String((s && s.company) || 'All BUs').trim().toLowerCase()}|${String((s && (s.id || s.shift_code)) || '').trim().toLowerCase()}`;
  const shiftMap = new Map();
  for (const ps of prevShifts) {
    if (ps && (ps.id || ps.shift_code)) shiftMap.set(shiftKeyFn(ps), ps);
  }
  for (const ns of nextShifts) {
    if (!ns || !(ns.id || ns.shift_code)) continue;
    const nsCo = String(ns.company || '').trim();
    if (restrictRls && (!nsCo || /^all(\s+(bus|companies))?$/i.test(nsCo) || !session || !canAccessCompany(session, nsCo))) {
      continue;
    }
    const sk = shiftKeyFn(ns);
    const cur = shiftMap.get(sk);
    const curTs = cur ? String(cur.updated_at || '') : '';
    const nxtTs = String(ns.updated_at || '');
    if (!cur || !curTs || !nxtTs || nxtTs >= curTs) {
      shiftMap.set(sk, ns);
    }
  }

  // 4. staffRules
  const prevRules = (prevWs.staffRules && typeof prevWs.staffRules === 'object') ? prevWs.staffRules : {};
  const nextRules = (nextWs.staffRules && typeof nextWs.staffRules === 'object') ? nextWs.staffRules : {};
  const mergedRules = Object.assign({}, prevRules);
  for (const [rk, nr] of Object.entries(nextRules)) {
    if (!nr || typeof nr !== 'object') continue;
    const prevR = mergedRules[rk];
    const prevCo = String((prevR && prevR.company) || '').trim();
    const nextCo = String(nr.company || '').trim();
    const co = nextCo || prevCo;
    if (restrictRls) {
      if (prevR && (!prevCo || !session || !canAccessCompany(session, prevCo))) continue;
      if (!co || !session || !canAccessCompany(session, co)) continue;
    }
    const curTs = prevR ? String(prevR.updated_at || '') : '';
    const nxtTs = String(nr.updated_at || '');
    if (!prevR || !curTs || !nxtTs || nxtTs >= curTs) {
      mergedRules[rk] = co && !nr.company ? Object.assign({}, nr, { company: co }) : nr;
    }
  }

  return {
    shiftTypes: Array.from(shiftMap.values()),
    policyGroups: mergedPg,
    companyPolicyDefaults: mergedDefs,
    staffRules: mergedRules
  };
}

async function loadCanonicalAlertRulesFromDb(db) {
  const res = await db.prepare('SELECT * FROM alert_rules').all();
  const overrides = {};
  const custom = [];
  const deletedCustomIds = new Set();
  for (const r of (res.results || [])) {
    const obj = safeJsonParse(r.payload_json, null);
    if (!obj || typeof obj !== 'object') continue;
    if (r.kind === 'custom') {
      const cid = String(obj.id || r.id || '');
      if (obj.deleted) {
        if (cid) deletedCustomIds.add(cid);
      } else {
        custom.push(obj);
      }
    } else if (r.id) {
      overrides[r.id] = obj;
    }
  }
  return { overrides, custom, deletedCustomIds, rowCount: (res.results || []).length };
}

async function patchMfgStoreSubDoc(db, mutatorFn, updatedBy = '') {
  try {
    const curRow = await readEdgeKvDoc(db, 'mfg_web_store');
    if (!curRow) return;
    const doc = safeJsonParse(curRow.payload_json, null);
    if (!doc || typeof doc !== 'object') return;
    mutatorFn(doc);
    const nowIso = new Date().toISOString();
    doc.updatedAt = nowIso;
    if (Array.isArray(doc.users)) {
      doc.users = doc.users.map(redactFaceSamplesFromUserObj);
    }
    await writeEdgeKvDoc(db, 'mfg_web_store', JSON.stringify(doc), nowIso, updatedBy || String(doc.updatedBy || 'edge'));
  } catch (_) {}
}

async function overlayCanonicalSubStoresOnMfgDoc(db, docObj) {
  if (!db || !docObj || typeof docObj !== 'object') return docObj;
  try {
    const [sqlAr, wsRow] = await Promise.all([
      loadCanonicalAlertRulesFromDb(db),
      db.prepare("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'work_schedules'").first()
    ]);
    if (sqlAr.rowCount > 0) {
      const baseAr = (docObj.alertRules && typeof docObj.alertRules === 'object') ? docObj.alertRules : { overrides: {}, custom: [] };
      const mergedOv = Object.assign({}, baseAr.overrides || {});
      for (const [oid, ov] of Object.entries(sqlAr.overrides)) {
        const cur = mergedOv[oid];
        const curTs = cur ? String(cur.updated_at || '') : '';
        const sqlTs = String(ov.updated_at || '');
        if (!cur || !curTs || !sqlTs || sqlTs >= curTs) mergedOv[oid] = ov;
      }
      const custMap = new Map();
      for (const bc of (Array.isArray(baseAr.custom) ? baseAr.custom : [])) {
        if (bc && bc.id && !bc.deleted && !sqlAr.deletedCustomIds.has(String(bc.id))) {
          custMap.set(String(bc.id), bc);
        }
      }
      for (const sc of sqlAr.custom) {
        if (!sc || !sc.id) continue;
        const cid = String(sc.id);
        const cur = custMap.get(cid);
        const curTs = cur ? String(cur.updated_at || '') : '';
        const sqlTs = String(sc.updated_at || '');
        if (!cur || !curTs || !sqlTs || sqlTs >= curTs) custMap.set(cid, sc);
      }
      docObj.alertRules = { overrides: mergedOv, custom: Array.from(custMap.values()) };
    }
    if (wsRow && wsRow.payload_json) {
      const kvWs = safeJsonParse(wsRow.payload_json, null);
      if (kvWs && typeof kvWs === 'object') {
        docObj.workSchedules = mergeWorkSchedulesDocs(docObj.workSchedules || {}, kvWs, null, false);
      }
    }
  } catch (_) {}
  return docObj;
}

export async function handleAlertRules(request, env, session, body) {
  if (!env || !env.DB) return jsonResponse({ ok: true, overrides: {}, custom: [] });
  if (!session) {
    if (isDemoHeader(request) && request.method === 'GET') return jsonResponse({ ok: true, demo: true, overrides: {}, custom: [] });
    return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  }
  if (request.method === 'GET') {
    const sqlAr = await loadCanonicalAlertRulesFromDb(env.DB);
    const scoped = scopeAlertRulesForSession({ overrides: sqlAr.overrides, custom: sqlAr.custom }, session);
    return jsonResponse({ ok: true, overrides: scoped.overrides, custom: scoped.custom });
  }
  if (isDemoHeader(request)) return jsonResponse({ ok: false, error: 'Demo sandbox is read-only' }, 403);
  if (!canManageUsersSeat(session)) return jsonResponse({ ok: false, error: 'Supervisor or Owner required to modify alert rules.' }, 403);
  const restrictAlertRls = !isOwnerOrFullGroupSession(session);
  let saved = 0;
  const overridesIn = (body && body.overrides && typeof body.overrides === 'object') ? body.overrides : {};
  const overrideEntries = Object.entries(overridesIn).filter(([, ov]) => ov && typeof ov === 'object');
  if (restrictAlertRls && overrideEntries.length > 0) {
    return jsonResponse({ ok: false, error: 'Row-level security: Owner required to modify global alert thresholds.' }, 403);
  }
  for (const [rid, ov] of overrideEntries) {
    const inTs = String(ov.updated_at || '');
    const ex = await env.DB.prepare('SELECT updated_at FROM alert_rules WHERE id = ?1').bind(String(rid)).first();
    if (ex && String(ex.updated_at || '') > inTs) continue;
    await env.DB.prepare(
      'INSERT OR REPLACE INTO alert_rules (id, kind, payload_json, updated_at) VALUES (?1, ?2, ?3, ?4)'
    ).bind(String(rid), 'override', JSON.stringify(ov), inTs).run();
    saved++;
  }
  const customIn = Array.isArray(body && body.custom) ? body.custom : [];
  for (const cr of customIn) {
    if (!cr || typeof cr !== 'object' || !cr.id) continue;
    const cid = String(cr.id);
    const crCo = String(cr.company || '').trim();
    const ex = await env.DB.prepare('SELECT updated_at, payload_json FROM alert_rules WHERE id = ?1').bind(cid).first();
    const exObj = ex ? safeJsonParse(ex.payload_json, null) : null;
    const effCo = crCo || String((exObj && exObj.company) || '').trim();
    if (restrictAlertRls && (!effCo || !canAccessCompany(session, effCo))) {
      return jsonResponse({ ok: false, error: 'Row-level security: custom alert rule must belong to an authorized entity.' }, 403);
    }
    if (exObj && restrictAlertRls) {
      const exCo = String(exObj.company || '').trim();
      if (!exCo || !canAccessCompany(session, exCo)) {
        return jsonResponse({ ok: false, error: 'Row-level security: cannot modify another entity alert rule.' }, 403);
      }
    }
    const inTs = String(cr.updated_at || '');
    if (ex && String(ex.updated_at || '') > inTs) continue;
    const toSaveRule = effCo && !cr.company ? Object.assign({}, cr, { company: effCo }) : cr;
    await env.DB.prepare(
      'INSERT OR REPLACE INTO alert_rules (id, kind, payload_json, updated_at) VALUES (?1, ?2, ?3, ?4)'
    ).bind(cid, 'custom', JSON.stringify(toSaveRule), inTs).run();
    saved++;
  }
  if (saved > 0) {
    const canonAr = await loadCanonicalAlertRulesFromDb(env.DB);
    await patchMfgStoreSubDoc(env.DB, doc => {
      const baseAr = (doc.alertRules && typeof doc.alertRules === 'object') ? doc.alertRules : { overrides: {}, custom: [] };
      const custMap = new Map();
      for (const bc of (Array.isArray(baseAr.custom) ? baseAr.custom : [])) {
        if (bc && bc.id && !bc.deleted && !canonAr.deletedCustomIds.has(String(bc.id))) custMap.set(String(bc.id), bc);
      }
      for (const sc of canonAr.custom) {
        if (sc && sc.id) custMap.set(String(sc.id), sc);
      }
      doc.alertRules = {
        overrides: Object.assign({}, baseAr.overrides || {}, canonAr.overrides),
        custom: Array.from(custMap.values())
      };
    }, String((session && session.email) || ''));
  }
  return jsonResponse({ ok: true, saved });
}

export async function handleStaffBiometrics(request, env, session, body) {
  if (!env || !env.DB) return jsonResponse({ ok: true, staff_biometrics: {} });
  if (!session) {
    if (isDemoHeader(request) && request.method === 'GET') return jsonResponse({ ok: true, demo: true, staff_biometrics: {} });
    return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  }
  const restrictRls = !isOwnerOrFullGroupSession(session);
  if (request.method === 'GET') {
    const res = await env.DB.prepare('SELECT staff_key, company, payload_json FROM staff_biometrics').all();
    const out = {};
    for (const r of (res.results || [])) {
      const obj = safeJsonParse(r.payload_json, null);
      if (!r.staff_key || !obj) continue;
      const co = String(r.company || obj.company || '').trim();
      if (restrictRls && co && !canAccessCompany(session, co)) continue;
      out[r.staff_key] = obj;
    }
    return jsonResponse({ ok: true, staff_biometrics: out });
  }
  if (isDemoHeader(request)) return jsonResponse({ ok: false, error: 'Demo sandbox is read-only' }, 403);
  if (!canManageUsersSeat(session)) return jsonResponse({ ok: false, error: 'Supervisor or Owner required to enroll biometrics.' }, 403);
  const mapIn = {};
  if (body && body.key && body.entry) {
    mapIn[String(body.key)] = body.entry;
  } else if (body && body.staff_biometrics && typeof body.staff_biometrics === 'object') {
    Object.assign(mapIn, body.staff_biometrics);
  }
  let saved = 0;
  for (const [sk, entry] of Object.entries(mapIn)) {
    if (!sk || !entry || typeof entry !== 'object') continue;
    const co = canonicalizeCompanyName(entry.company || '');
    if (restrictRls && (!co || !canAccessCompany(session, co))) continue;
    const inTs = String(entry.updated_at || new Date().toISOString());
    const ex = await env.DB.prepare('SELECT updated_at, company FROM staff_biometrics WHERE staff_key = ?1').bind(sk).first();
    if (ex && restrictRls && ex.company && !canAccessCompany(session, ex.company)) continue;
    if (ex && String(ex.updated_at || '') > inTs) continue;
    await env.DB.prepare(
      'INSERT OR REPLACE INTO staff_biometrics (staff_key, company, payload_json, updated_at) VALUES (?1, ?2, ?3, ?4)'
    ).bind(sk, co, JSON.stringify(entry), inTs).run();
    saved++;
  }
  return jsonResponse({ ok: true, saved });
}

export async function handleKvDoc(request, env, session, docKey, responseProp, body) {
  if (!env || !env.DB) return jsonResponse({ ok: true, [responseProp]: null });
  if (!session) {
    if (isDemoHeader(request) && request.method === 'GET') return jsonResponse({ ok: true, demo: true, [responseProp]: null });
    return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  }
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT payload_json FROM edge_kv_store WHERE doc_key = ?1').bind(docKey).first();
    const parsedVal = row ? safeJsonParse(row.payload_json, null) : null;
    const outVal = (docKey === 'work_schedules' && parsedVal)
      ? scopeWorkSchedulesForSession(parsedVal, session)
      : parsedVal;
    return jsonResponse({ ok: true, [responseProp]: outVal });
  }
  if (isDemoHeader(request)) return jsonResponse({ ok: false, error: 'Demo sandbox is read-only' }, 403);
  if (!canManageUsersSeat(session)) return jsonResponse({ ok: false, error: 'Supervisor or Owner required.' }, 403);
  const restrictKvRls = !isOwnerOrFullGroupSession(session);
  const incoming = (body && (body[responseProp] || body.config || body.payload)) || body || {};
  const nowIso = new Date().toISOString();
  let toStore = incoming;
  if (docKey === 'geo_config' && incoming && typeof incoming === 'object') {
    const exRow = await env.DB.prepare('SELECT payload_json FROM edge_kv_store WHERE doc_key = ?1').bind(docKey).first();
    const prev = exRow ? safeJsonParse(exRow.payload_json, null) : null;
    if (restrictKvRls) {
      const prevHubs = (prev && prev.companyHubs && typeof prev.companyHubs === 'object') ? prev.companyHubs : {};
      const inHubs = (incoming.companyHubs && typeof incoming.companyHubs === 'object') ? incoming.companyHubs : {};
      for (const [hk, hv] of Object.entries(inHubs)) {
        if (!canAccessCompany(session, hk) && stableRowSig(prevHubs[hk]) !== stableRowSig(hv)) {
          return jsonResponse({ ok: false, error: 'Row-level security: cannot modify another entity hub.' }, 403);
        }
      }
      const inDelCheck = (incoming._deletedKeys && typeof incoming._deletedKeys === 'object') ? incoming._deletedKeys : {};
      for (const dk of Object.keys(inDelCheck)) {
        if (dk.startsWith('companyHubs:')) {
          const hk = dk.slice('companyHubs:'.length);
          if (!canAccessCompany(session, hk)) {
            return jsonResponse({ ok: false, error: 'Row-level security: cannot delete another entity hub.' }, 403);
          }
        }
      }
    }
    if (prev && typeof prev === 'object') {
      const merged = {
        companyHubs: Object.assign({}, prev.companyHubs || {}),
        regions: Object.assign({}, prev.regions || {}),
        sites: Object.assign({}, prev.sites || {}),
        pairKmOverrides: Object.assign({}, prev.pairKmOverrides || {}),
        _pairKmTs: Object.assign({}, prev._pairKmTs || {}),
        _deletedKeys: Object.assign({}, prev._deletedKeys || {}),
        updatedAt: nowIso
      };
      const inDel = (incoming._deletedKeys && typeof incoming._deletedKeys === 'object') ? incoming._deletedKeys : {};
      const inPairTs = (incoming._pairKmTs && typeof incoming._pairKmTs === 'object') ? incoming._pairKmTs : {};
      for (const [dk, dTs] of Object.entries(inDel)) {
        const tsStr = String(dTs || '');
        if (tsStr && (!merged._deletedKeys[dk] || tsStr > String(merged._deletedKeys[dk]))) {
          merged._deletedKeys[dk] = tsStr;
        }
      }
      for (const bucket of ['companyHubs', 'regions', 'sites', 'pairKmOverrides']) {
        const src = (incoming[bucket] && typeof incoming[bucket] === 'object') ? incoming[bucket] : {};
        for (const [k, nxt] of Object.entries(src)) {
          if (nxt === undefined || nxt === null) continue;
          const dk = `${bucket}:${k}`;
          const cur = merged[bucket][k];
          const curTs = (cur && typeof cur === 'object' && cur.updated_at) || (bucket === 'pairKmOverrides' && merged._pairKmTs[k]) || '';
          const nxtItemTs = (nxt && typeof nxt === 'object' && nxt.updated_at) || (bucket === 'pairKmOverrides' && inPairTs[k]) || '';
          const nxtTs = nxtItemTs || (cur === undefined ? (incoming.updatedAt || nowIso) : '');
          const delTs = String(merged._deletedKeys[dk] || '');
          if (delTs && (!nxtTs || delTs > nxtTs)) continue;
          if (cur === undefined || !curTs || (nxtTs && nxtTs >= curTs)) {
            merged[bucket][k] = nxt;
            if (bucket === 'pairKmOverrides' && nxtTs) merged._pairKmTs[k] = nxtTs;
            delete merged._deletedKeys[dk];
          }
        }
      }
      for (const [dk, dTs] of Object.entries(merged._deletedKeys)) {
        const delTs = String(dTs || '');
        const idx = dk.indexOf(':');
        if (!delTs || idx <= 0) continue;
        const bucket = dk.slice(0, idx);
        const k = dk.slice(idx + 1);
        if (!merged[bucket]) continue;
        const cur = merged[bucket][k];
        const curTs = (cur && typeof cur === 'object' && cur.updated_at) || (bucket === 'pairKmOverrides' && merged._pairKmTs[k]) || '';
        if (!curTs || delTs >= curTs) {
          delete merged[bucket][k];
          if (bucket === 'pairKmOverrides') delete merged._pairKmTs[k];
        }
      }
      toStore = merged;
    }
  } else if (docKey === 'work_schedules') {
    const wsIn = (body && body.work_schedules && typeof body.work_schedules === 'object')
      ? body.work_schedules
      : incoming;
    if (!wsIn || typeof wsIn !== 'object' || (!Array.isArray(wsIn.shiftTypes) && !wsIn.staffRules && !Array.isArray(wsIn.policyGroups) && !wsIn.companyPolicyDefaults)) {
      return jsonResponse({ ok: false, error: 'Invalid work_schedules payload.' }, 400);
    }
    const exRow = await env.DB.prepare('SELECT payload_json FROM edge_kv_store WHERE doc_key = ?1').bind(docKey).first();
    const prevWs = (exRow && safeJsonParse(exRow.payload_json, null)) || { shiftTypes: [], policyGroups: [], companyPolicyDefaults: {}, staffRules: {} };
    if (restrictKvRls) {
      const reqOp = String((body && body.op) || '').trim();
      if (reqOp === 'upsert_policy_group' || reqOp === 'delete_policy_group') {
        return jsonResponse({ ok: false, error: 'Row-level security: Owner required to modify global policy groups.' }, 403);
      }
      if (Array.isArray(wsIn.policyGroups)) {
        const prevPgById = new Map((Array.isArray(prevWs.policyGroups) ? prevWs.policyGroups : []).filter(g => g && g.id).map(g => [String(g.id), g]));
        for (const ng of wsIn.policyGroups) {
          if (!ng || !ng.id) continue;
          const pg = prevPgById.get(String(ng.id));
          if (!pg || stableRowSig(pg) !== stableRowSig(ng)) {
            return jsonResponse({ ok: false, error: 'Row-level security: Owner required to modify global policy groups.' }, 403);
          }
        }
      }
      const prevDefs = prevWs.companyPolicyDefaults || {};
      const nextDefs = wsIn.companyPolicyDefaults || {};
      for (const [ck, nv] of Object.entries(nextDefs)) {
        if (!canAccessCompany(session, ck) && stableRowSig(prevDefs[ck]) !== stableRowSig(nv)) {
          return jsonResponse({ ok: false, error: 'Row-level security: cannot modify another entity policy default.' }, 403);
        }
      }
      const prevShifts = Array.isArray(prevWs.shiftTypes) ? prevWs.shiftTypes : [];
      const nextShifts = Array.isArray(wsIn.shiftTypes) ? wsIn.shiftTypes : [];
      const shiftKeyFn = s => `${String((s && s.company) || 'All BUs').trim().toLowerCase()}|${String((s && (s.id || s.shift_code)) || '').trim().toLowerCase()}`;
      const prevShiftByKey = new Map(prevShifts.filter(s => s && (s.id || s.shift_code)).map(s => [shiftKeyFn(s), s]));
      for (const ns of nextShifts) {
        if (!ns || !(ns.id || ns.shift_code)) continue;
        const nsCo = String(ns.company || '').trim();
        if (!nsCo || /^all(\s+(bus|companies))?$/i.test(nsCo) || !canAccessCompany(session, nsCo)) {
          const ps = prevShiftByKey.get(shiftKeyFn(ns));
          if (!ps || stableRowSig(ps) !== stableRowSig(ns)) {
            return jsonResponse({ ok: false, error: 'Row-level security: cannot modify cross-entity shift schedules.' }, 403);
          }
        }
      }
      const prevRules = prevWs.staffRules || {};
      const nextRules = wsIn.staffRules || {};
      for (const [rk, nr] of Object.entries(nextRules)) {
        const pr = prevRules[rk];
        const prevCo = String((pr && pr.company) || '').trim();
        const nextCo = String((nr && nr.company) || '').trim();
        const co = nextCo || prevCo;
        if ((!co || !canAccessCompany(session, co) || (prevCo && !canAccessCompany(session, prevCo))) && stableRowSig(pr) !== stableRowSig(nr)) {
          return jsonResponse({ ok: false, error: 'Row-level security: cannot modify cross-entity staff rules.' }, 403);
        }
      }
    }
    toStore = mergeWorkSchedulesDocs(prevWs, wsIn, session, restrictKvRls);
  }
  await env.DB.prepare(
    `INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, rev)
     VALUES (?1, ?2, ?3, 1)
     ON CONFLICT(doc_key) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at, rev = edge_kv_store.rev + 1`
  ).bind(docKey, JSON.stringify(toStore), nowIso).run();
  if (docKey === 'work_schedules') {
    await patchMfgStoreSubDoc(env.DB, doc => {
      doc.workSchedules = mergeWorkSchedulesDocs(doc.workSchedules || {}, toStore, null, false);
    }, String((session && session.email) || ''));
  }
  return jsonResponse({ ok: true, saved: true, updated_at: nowIso });
}

export async function handleIndustryDomainStore(request, env, session, body, ctx = null) {
  if (!env || !env.DB) return jsonResponse({ ok: true, industryCustomRows: {}, industryRowEdits: {} });
  if (!session) {
    if (isDemoHeader(request) && request.method === 'GET') {
      return jsonResponse({ ok: true, demo: true, industryCustomRows: {}, industryRowEdits: {} });
    }
    return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  }
  const restrictRls = !isOwnerOrFullGroupSession(session);
  if (request.method === 'GET') {
    const [cRes, eRes] = await env.DB.batch([
      env.DB.prepare('SELECT bucket, row_id, company, payload_json FROM industry_custom_rows ORDER BY updated_at DESC'),
      env.DB.prepare('SELECT edit_key, payload_json FROM industry_row_edits')
    ]);
    const customRows = {};
    for (const r of (cRes.results || [])) {
      const co = String(r.company || '').trim();
      if (restrictRls && (!co || !canAccessCompany(session, co))) continue;
      const obj = safeJsonParse(r.payload_json, null);
      if (r.bucket && obj) {
        if (!customRows[r.bucket]) customRows[r.bucket] = [];
        customRows[r.bucket].push(obj);
      }
    }
    const rowEdits = {};
    for (const r of (eRes.results || [])) {
      const obj = safeJsonParse(r.payload_json, null);
      if (!r.edit_key || !obj) continue;
      if (restrictRls) {
        const edCo = String(obj.company || obj.resort || obj.entity || '').trim();
        if (!edCo || !canAccessCompany(session, edCo)) continue;
      }
      rowEdits[r.edit_key] = obj;
    }
    return jsonResponse({ ok: true, industryCustomRows: customRows, industryRowEdits: rowEdits });
  }

  if (isDemoHeader(request)) return jsonResponse({ ok: false, error: 'Demo sandbox is read-only' }, 403);
  // Old seed ids still in use (counts only; see legacy_ids.js). Read before anything below touches the body.
  const legacyHitsTask = scheduleLegacyIdHits(env, ctx, collectLegacyCandidates(body));
  if (legacyHitsTask) await legacyHitsTask;
  const customMap = (body && body.industryCustomRows && typeof body.industryCustomRows === 'object') ? body.industryCustomRows : {};
  const editsMap = (body && body.industryRowEdits && typeof body.industryRowEdits === 'object') ? body.industryRowEdits : {};
  let savedRows = 0;
  let savedEdits = 0;
  let ignoredServerOwned = 0;   // rows and patches aimed at server-totalled till close rows

  for (const [bucket, arr] of Object.entries(customMap)) {
    if (!bucket || !Array.isArray(arr)) continue;
    for (const r of arr) {
      if (!r || typeof r !== 'object') continue;
      const rid = String(r.id || r.code || '').trim();
      if (!rid) continue;
      if (isServerOwnedCustomRow(bucket, rid)) { ignoredServerOwned++; continue; }
      const co = canonicalizeCompanyName(r.company || r.resort || r.entity || '');
      if (restrictRls && (!co || !canAccessCompany(session, co))) continue;
      const incRev = Number(r.rev || 1);
      const incVoid = r.voided ? 1 : 0;
      const incTs = String(r.updated_at || r._createdAt || '');
      const ex = await env.DB.prepare(
        'SELECT rev, voided, company FROM industry_custom_rows WHERE bucket = ?1 AND row_id = ?2'
      ).bind(bucket, rid).first();
      if (ex) {
        if (restrictRls && ex.company && !canAccessCompany(session, ex.company)) continue;
        const exRev = Number(ex.rev || 1);
        const exVoid = Number(ex.voided || 0);
        if (exVoid && !incVoid && exRev >= incRev) continue;
        if (exRev > incRev && !(incVoid && !exVoid)) continue;
      }
      await env.DB.prepare(
        'INSERT OR REPLACE INTO industry_custom_rows (bucket, row_id, company, rev, voided, updated_at, payload_json) VALUES (?1,?2,?3,?4,?5,?6,?7)'
      ).bind(bucket, rid, co, incRev, incVoid, incTs, JSON.stringify(r)).run();
      savedRows++;
    }
  }

  for (const [ek, ev] of Object.entries(editsMap)) {
    if (!ek || !ev || typeof ev !== 'object') continue;
    if (isServerOwnedRowEditKey(ek)) { ignoredServerOwned++; continue; }
    const edCo = canonicalizeCompanyName(ev.company || ev.resort || ev.entity || '');
    if (restrictRls && (!edCo || !canAccessCompany(session, edCo))) continue;
    const incRev = Number(ev.rev || 1);
    const incVoid = ev.voided ? 1 : 0;
    const incTs = String(ev.updated_at || ev.updatedAt || '');
    const ex = await env.DB.prepare('SELECT rev, voided, payload_json FROM industry_row_edits WHERE edit_key = ?1').bind(ek).first();
    if (ex) {
      if (restrictRls) {
        const exObj = safeJsonParse(ex.payload_json, {});
        const exCo = String((exObj && (exObj.company || exObj.resort || exObj.entity)) || '').trim();
        if (exCo && !canAccessCompany(session, exCo)) continue;
      }
      const exRev = Number(ex.rev || 1);
      const exVoid = Number(ex.voided || 0);
      if (exVoid && !incVoid && exRev >= incRev) continue;
      if (exRev > incRev && !(incVoid && !exVoid)) continue;
    }
    await env.DB.prepare(
      'INSERT OR REPLACE INTO industry_row_edits (edit_key, rev, voided, updated_at, payload_json) VALUES (?1,?2,?3,?4,?5)'
    ).bind(ek, incRev, incVoid, incTs, JSON.stringify(ev)).run();
    savedEdits++;
  }

  let deletedLegacyRows = 0;
  let deletedLegacyEdits = 0;
  const purgedRows = Array.isArray(body && body.purgedRows) ? body.purgedRows : [];
  for (const pr of purgedRows) {
    if (!pr || typeof pr !== 'object') continue;
    const bk = String(pr.bucket || '').trim();
    const rid = String(pr.row_id || pr.id || '').trim();
    if (!bk || !rid || isServerOwnedCustomRow(bk, rid)) continue;
    const ex = await env.DB.prepare('SELECT company FROM industry_custom_rows WHERE bucket = ?1 AND row_id = ?2').bind(bk, rid).first();
    if (!ex) continue;
    const exCo = String(ex.company || '').trim();
    if (restrictRls && (!exCo || !canAccessCompany(session, exCo))) continue;
    await env.DB.prepare('DELETE FROM industry_custom_rows WHERE bucket = ?1 AND row_id = ?2').bind(bk, rid).run();
    deletedLegacyRows++;
  }

  const purgedEditKeys = Array.isArray(body && body.purgedEditKeys) ? body.purgedEditKeys : [];
  for (const rawEk of purgedEditKeys) {
    const ek = String(rawEk || '').trim();
    if (!ek || isServerOwnedRowEditKey(ek)) continue;
    const ex = await env.DB.prepare('SELECT payload_json FROM industry_row_edits WHERE edit_key = ?1').bind(ek).first();
    if (!ex) continue;
    if (restrictRls) {
      const exObj = safeJsonParse(ex.payload_json, {});
      const exCo = String((exObj && (exObj.company || exObj.resort || exObj.entity)) || '').trim();
      if (!exCo || !canAccessCompany(session, exCo)) continue;
    }
    await env.DB.prepare('DELETE FROM industry_row_edits WHERE edit_key = ?1').bind(ek).run();
    deletedLegacyEdits++;
  }

  return jsonResponse({ ok: true, rows: savedRows, edits: savedEdits, deletedLegacyRows, deletedLegacyEdits, ignoredServerOwned });
}

function buildBoundRecordUpsertStmt(db, canonTable, cols, rawRec) {
  let rec = rawRec;
  if (cols.has('company') && rec.company) {
    rec = Object.assign({}, rec, { company: canonicalizeCompanyName(rec.company) });
  }
  const colNames = [];
  const bindVals = [];
  for (const [k, rawV] of Object.entries(rec)) {
    if (!cols.has(k) || k === 'payload_json') continue;
    let v = rawV;
    if (typeof v === 'boolean') v = v ? 1 : 0;
    else if (v !== null && typeof v === 'object') v = JSON.stringify(v);
    colNames.push(k);
    bindVals.push(v === undefined ? null : v);
  }
  if (cols.has('payload_json')) {
    colNames.push('payload_json');
    bindVals.push(JSON.stringify(rec));
  }
  const placeholders = colNames.map((_, idx) => `?${idx + 1}`).join(',');
  return db.prepare(
    `INSERT OR REPLACE INTO ${canonTable} (${colNames.join(',')}) VALUES (${placeholders})`
  ).bind(...bindVals);
}

async function execBatchedStmts(db, stmts, chunkSize = 80) {
  for (let i = 0; i < stmts.length; i += chunkSize) {
    await db.batch(stmts.slice(i, i + chunkSize));
  }
}

export async function mirrorStoreDeltaToD1Tables(db, storePayload, prevStorePayload = null, session = null) {
  const stats = {
    upsertedRecords: 0,
    voidedRemoved: 0,
    upsertedPunches: 0,
    upsertedSubStores: 0,
    skippedRecords: 0,
    skippedPunches: 0
  };
  if (!db || !storePayload || typeof storePayload !== 'object') return stats;
  const hasPrev = Boolean(prevStorePayload && typeof prevStorePayload === 'object');
  const prevCr = (hasPrev && prevStorePayload.customRecords && typeof prevStorePayload.customRecords === 'object')
    ? prevStorePayload.customRecords
    : {};
  const restrictRls = Boolean(session && !isOwnerOrFullGroupSession(session));
  const canManageSeats = Boolean(!session || canManageUsersSeat(session));

  try {
    // 1. Mirror ALL dirty customRecords across all buckets with zero truncation via D1 batching
    const cr = (storePayload.customRecords && typeof storePayload.customRecords === 'object')
      ? storePayload.customRecords
      : {};
    const allCrKeys = Array.from(new Set([...Object.keys(prevCr), ...Object.keys(cr)]));
    const dirtyByTable = new Map();
    const removedToVoid = [];

    for (const crKey of allCrKeys) {
      const canonTable = CR_KEY_TO_TABLE[crKey] || crKey;
      if (!USER_WRITABLE_TABLES.has(canonTable)) continue;

      const prevList = Array.isArray(prevCr[crKey]) ? prevCr[crKey] : [];
      const prevMap = new Map();
      for (const pr of prevList) {
        if (pr && typeof pr === 'object' && pr.id) {
          prevMap.set(String(pr.id).trim(), { sig: stableRowSig(pr), row: pr });
        }
      }

      const isUniversal = UNIVERSAL_UNIQUE_TABLES.has(canonTable);
      const list = Array.isArray(cr[crKey]) ? cr[crKey] : [];
      const seenIds = new Set();
      for (let idx = 0; idx < list.length; idx++) {
        const rec = list[idx];
        if (!rec || typeof rec !== 'object' || !rec.id) continue;
        const rid = String(rec.id).trim();
        if (!rid) continue;
        seenIds.add(rid);
        if (LEGACY_POS_SEED_ID_RE.test(rid)) {
          stats.skippedRecords++;
          continue;
        }
        const prevEntry = prevMap.get(rid);
        const curSig = stableRowSig(rec);
        if (prevEntry && prevEntry.sig === curSig) {
          stats.skippedRecords++;
          continue;
        }
        if (restrictRls) {
          const recCo = String(rec.company || '').trim();
          const prevCo = String((prevEntry && prevEntry.row && prevEntry.row.company) || '').trim();
          if ((recCo && !canAccessCompany(session, recCo)) || (prevCo && !canAccessCompany(session, prevCo))) continue;
          if (!isUniversal && !recCo && !prevCo) continue;
        }
        if (!dirtyByTable.has(canonTable)) dirtyByTable.set(canonTable, []);
        dirtyByTable.get(canonTable).push(rec);
      }

      if (hasPrev && prevMap.size > 0) {
        for (const [prevId, prevEntry] of prevMap.entries()) {
          if (seenIds.has(prevId)) continue;
          const pr = prevEntry.row;
          if (!pr || pr.voided) continue;
          if (POS_SEED_ID_RE.test(prevId) || pr._seed_orig || pr.source === 'workbook') continue;
          if (restrictRls) {
            const prCo = String(pr.company || '').trim();
            if (isUniversal && !canManageSeats) continue;
            if ((!isUniversal && !prCo) || (prCo && !canAccessCompany(session, prCo))) continue;
          }
          removedToVoid.push({ canonTable, id: prevId });
        }
      }
    }

    const recordUpsertStmts = [];
    for (const [canonTable, recs] of dirtyByTable.entries()) {
      const cols = await getTableColumns(db, canonTable);
      if (!cols.size) continue;
      const isUniversal = UNIVERSAL_UNIQUE_TABLES.has(canonTable);

      // Batch-verify existing row ownership in D1 for restricted RLS sessions
      const blockedIds = new Set();
      if (restrictRls && cols.has('company')) {
        const checkIds = recs.map(r => String(r.id).trim());
        for (let i = 0; i < checkIds.length; i += 80) {
          const slice = checkIds.slice(i, i + 80);
          const ph = slice.map((_, k) => `?${k + 1}`).join(',');
          const exRows = await db.prepare(`SELECT id, company FROM ${canonTable} WHERE id IN (${ph})`).bind(...slice).all();
          const foundMap = new Map((exRows.results || []).map(x => [String(x.id), String(x.company || '').trim()]));
          for (const cid of slice) {
            const exCo = foundMap.get(cid) || '';
            if (exCo && !canAccessCompany(session, exCo)) blockedIds.add(cid);
          }
        }
      }

      if (isUniversal) {
        for (const rec of recs) {
          const rid = String(rec.id).trim();
          if (blockedIds.has(rid)) continue;
          const rUp = await upsertTableRecord(db, canonTable, rec);
          if (rUp && rUp.ok) stats.upsertedRecords++;
        }
      } else {
        for (const rec of recs) {
          const rid = String(rec.id).trim();
          if (blockedIds.has(rid)) continue;
          if (restrictRls && cols.has('company') && !String(rec.company || '').trim()) continue;
          recordUpsertStmts.push(buildBoundRecordUpsertStmt(db, canonTable, cols, rec));
        }
      }
    }

    if (recordUpsertStmts.length) {
      await execBatchedStmts(db, recordUpsertStmts, 80);
      stats.upsertedRecords += recordUpsertStmts.length;
    }

    if (removedToVoid.length) {
      const voidStmts = removedToVoid.map(v =>
        db.prepare(
          `UPDATE ${v.canonTable} SET voided = 1, payload_json = json_set(COALESCE(payload_json, '{}'), '$.voided', json('true')) WHERE id = ?1`
        ).bind(v.id)
      );
      await execBatchedStmts(db, voidStmts, 80);
      stats.voidedRemoved += voidStmts.length;
    }

    // 2. Mirror dirty kioskPunches
    const prevPunchList = (hasPrev && Array.isArray(prevStorePayload.kioskPunches)) ? prevStorePayload.kioskPunches : [];
    const prevPunchSigs = new Map();
    for (const pp of prevPunchList) {
      if (pp && typeof pp === 'object' && pp.id) {
        prevPunchSigs.set(String(pp.id).trim(), stableRowSig(pp));
      }
    }
    const punches = Array.isArray(storePayload.kioskPunches) ? storePayload.kioskPunches : [];
    const dirtyPunchStmts = [];
    for (const p of punches) {
      if (!p || typeof p !== 'object' || !p.id) continue;
      const pid = String(p.id).trim();
      if (!pid) continue;
      const pSig = stableRowSig(p);
      if (prevPunchSigs.get(pid) === pSig) {
        stats.skippedPunches++;
        continue;
      }
      const pCo = canonicalizeCompanyName(p.company || '');
      if (restrictRls) {
        if (!pCo || !canAccessCompany(session, pCo)) continue;
        const exPunch = await db.prepare('SELECT company FROM kiosk_punches WHERE id = ?1').bind(pid).first();
        if (exPunch && exPunch.company && !canAccessCompany(session, exPunch.company)) continue;
      }
      dirtyPunchStmts.push(
        db.prepare(
          `INSERT OR REPLACE INTO kiosk_punches (id, company, staff_name, punch_type, punched_at, rev, voided, payload_json, updated_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`
        ).bind(
          pid,
          pCo,
          String(p.staff_name || p.staff || ''),
          String(p.type || p.direction || ''),
          String(p.punched_at || p.timestamp || ''),
          Number(p.rev || 1),
          p.voided ? 1 : 0,
          JSON.stringify(p),
          String(p.updated_at || p.punched_at || '')
        )
      );
    }
    if (dirtyPunchStmts.length) {
      await execBatchedStmts(db, dirtyPunchStmts, 80);
      stats.upsertedPunches += dirtyPunchStmts.length;
    }

    // 3. Mirror dirty sub-stores (industryCustomRows, industryRowEdits, sentinelReviews, alertRules, staffBiometrics, workSchedules, Owner users)
    const subStmts = [];

    const prevIcr = (hasPrev && prevStorePayload.industryCustomRows && typeof prevStorePayload.industryCustomRows === 'object') ? prevStorePayload.industryCustomRows : {};
    const curIcr = (storePayload.industryCustomRows && typeof storePayload.industryCustomRows === 'object') ? storePayload.industryCustomRows : {};
    for (const bk of new Set([...Object.keys(prevIcr), ...Object.keys(curIcr)])) {
      if (!bk) continue;
      const arr = Array.isArray(curIcr[bk]) ? curIcr[bk] : [];
      const pArr = Array.isArray(prevIcr[bk]) ? prevIcr[bk] : [];
      const pSigs = new Map(pArr.filter(x => x && (x.id || x.code)).map(x => [String(x.id || x.code).trim(), stableRowSig(x)]));
      const curIds = new Set();
      for (const r of arr) {
        if (!r || typeof r !== 'object') continue;
        const rid = String(r.id || r.code || '').trim();
        if (!rid) continue;
        curIds.add(rid);
        if (pSigs.get(rid) === stableRowSig(r)) continue;
        if (isServerOwnedCustomRow(bk, rid)) continue;
        const co = canonicalizeCompanyName(r.company || r.resort || r.entity || '');
        if (restrictRls && (!co || !canAccessCompany(session, co))) continue;
        subStmts.push(
          db.prepare(
            'INSERT OR REPLACE INTO industry_custom_rows (bucket, row_id, company, rev, voided, updated_at, payload_json) VALUES (?1,?2,?3,?4,?5,?6,?7)'
          ).bind(bk, rid, co, Number(r.rev || 1), r.voided ? 1 : 0, String(r.updated_at || r._createdAt || ''), JSON.stringify(r))
        );
      }
      if (hasPrev) {
        for (const pr of pArr) {
          if (!pr || typeof pr !== 'object') continue;
          const prid = String(pr.id || pr.code || '').trim();
          if (!prid || curIds.has(prid) || isServerOwnedCustomRow(bk, prid)) continue;
          const pCo = canonicalizeCompanyName(pr.company || pr.resort || pr.entity || '');
          if (restrictRls && (!pCo || !canAccessCompany(session, pCo))) continue;
          subStmts.push(db.prepare('DELETE FROM industry_custom_rows WHERE bucket = ?1 AND row_id = ?2').bind(bk, prid));
        }
      }
    }

    const prevIre = (hasPrev && prevStorePayload.industryRowEdits && typeof prevStorePayload.industryRowEdits === 'object') ? prevStorePayload.industryRowEdits : {};
    const curIre = (storePayload.industryRowEdits && typeof storePayload.industryRowEdits === 'object') ? storePayload.industryRowEdits : {};
    const curIreKeys = new Set();
    for (const [ek, ev] of Object.entries(curIre)) {
      if (!ek || !ev || typeof ev !== 'object') continue;
      curIreKeys.add(ek);
      if (isServerOwnedRowEditKey(ek)) continue;
      if (prevIre[ek] && stableRowSig(prevIre[ek]) === stableRowSig(ev)) continue;
      const edCo = canonicalizeCompanyName(ev.company || ev.resort || ev.entity || '');
      if (restrictRls && (!edCo || !canAccessCompany(session, edCo))) continue;
      subStmts.push(
        db.prepare(
          'INSERT OR REPLACE INTO industry_row_edits (edit_key, rev, voided, updated_at, payload_json) VALUES (?1,?2,?3,?4,?5)'
        ).bind(ek, Number(ev.rev || 1), ev.voided ? 1 : 0, String(ev.updated_at || ev.updatedAt || ''), JSON.stringify(ev))
      );
    }
    if (hasPrev) {
      for (const [pek, pev] of Object.entries(prevIre)) {
        if (!pek || curIreKeys.has(pek) || isServerOwnedRowEditKey(pek)) continue;
        const pEdCo = canonicalizeCompanyName((pev && (pev.company || pev.resort || pev.entity)) || '');
        if (restrictRls && (!pEdCo || !canAccessCompany(session, pEdCo))) continue;
        subStmts.push(db.prepare('DELETE FROM industry_row_edits WHERE edit_key = ?1').bind(pek));
      }
    }

    if (!session || canReviewSentinelsSession(session)) {
      const prevSr = (hasPrev && prevStorePayload.sentinelReviews && typeof prevStorePayload.sentinelReviews === 'object') ? prevStorePayload.sentinelReviews : {};
      const curSr = (storePayload.sentinelReviews && typeof storePayload.sentinelReviews === 'object') ? storePayload.sentinelReviews : {};
      const seenSrIds = new Set();
      for (const [rk, rv] of Object.entries(curSr)) {
        if (!rk || !rv || typeof rv !== 'object') continue;
        const rid = String(rv.id || rk).trim();
        if (rid) seenSrIds.add(rid);
        if (prevSr[rk] && stableRowSig(prevSr[rk]) === stableRowSig(rv)) continue;
        const rvCo = normalizeSentinelScopeCompany(rv.company || '');
        const idScope = String(rid).includes('|') ? normalizeSentinelScopeCompany(String(rid).split('|')[0]) : '';
        if (restrictRls && (!rvCo || !idScope || idScope !== rvCo || !canAccessSentinelScope(session, rvCo))) continue;
        const inTs = String(rv.updated_at || rv.checked_at || '');
        subStmts.push(
          db.prepare(
            `INSERT OR REPLACE INTO sentinel_reviews
             (id, rule_id, company, baseline_metric, baseline_secondary, baseline_badge, active, checked_by, checked_by_email, checked_at, updated_at, note)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`
          ).bind(
            rid, String(rv.rule_id || ''), rvCo, Number(rv.baseline_metric || 0), Number(rv.baseline_secondary || 0),
            String(rv.baseline_badge || ''), rv.active === false ? 0 : 1, String(rv.checked_by || ''),
            String(rv.checked_by_email || ''), String(rv.checked_at || ''), inTs, String(rv.note || '')
          )
        );
      }
      if (hasPrev) {
        for (const [rk, prv] of Object.entries(prevSr)) {
          const prvId = String((prv && prv.id) || rk).trim();
          if (!prvId || seenSrIds.has(prvId)) continue;
          const prvCo = normalizeSentinelScopeCompany((prv && prv.company) || '');
          if (restrictRls && (!prvCo || !canAccessSentinelScope(session, prvCo))) continue;
          subStmts.push(db.prepare('DELETE FROM sentinel_reviews WHERE id = ?1').bind(prvId));
        }
      }
    }

    if (canManageSeats) {
      const prevAr = (hasPrev && prevStorePayload.alertRules && typeof prevStorePayload.alertRules === 'object') ? prevStorePayload.alertRules : {};
      const curAr = (storePayload.alertRules && typeof storePayload.alertRules === 'object') ? storePayload.alertRules : {};
      if (!restrictRls) {
        const pOv = (prevAr.overrides && typeof prevAr.overrides === 'object') ? prevAr.overrides : {};
        const cOv = (curAr.overrides && typeof curAr.overrides === 'object') ? curAr.overrides : {};
        for (const [oid, ov] of Object.entries(cOv)) {
          if (!oid || !ov || typeof ov !== 'object') continue;
          if (pOv[oid] && stableRowSig(pOv[oid]) === stableRowSig(ov)) continue;
          subStmts.push(
            db.prepare('INSERT OR REPLACE INTO alert_rules (id, kind, payload_json, updated_at) VALUES (?1, ?2, ?3, ?4)')
              .bind(String(oid), 'override', JSON.stringify(ov), String(ov.updated_at || ''))
          );
        }
        if (hasPrev) {
          for (const oid of Object.keys(pOv)) {
            if (!(oid in cOv)) {
              subStmts.push(db.prepare("DELETE FROM alert_rules WHERE id = ?1 AND kind = 'override'").bind(String(oid)));
            }
          }
        }
      }
      const pCustArr = (Array.isArray(prevAr.custom) ? prevAr.custom : []).filter(x => x && x.id);
      const pCust = new Map(pCustArr.map(x => [String(x.id), stableRowSig(x)]));
      const pCustObj = new Map(pCustArr.map(x => [String(x.id), x]));
      const curCustList = Array.isArray(curAr.custom) ? curAr.custom : [];
      const seenCustIds = new Set();
      for (const crRule of curCustList) {
        if (!crRule || typeof crRule !== 'object' || !crRule.id) continue;
        const cid = String(crRule.id);
        const prevObj = pCustObj.get(cid);
        const prevCo = prevObj ? String(prevObj.company || '').trim() : '';
        const curCo = String(crRule.company || prevCo || '').trim();
        if (restrictRls) {
          if (prevObj && (!prevCo || !canAccessCompany(session, prevCo))) {
            seenCustIds.add(cid);
            continue;
          }
          if (!curCo || !canAccessCompany(session, curCo)) continue;
        }
        if (crRule.deleted) {
          subStmts.push(db.prepare("DELETE FROM alert_rules WHERE id = ?1 AND kind = 'custom'").bind(cid));
          continue;
        }
        seenCustIds.add(cid);
        if (pCust.get(cid) === stableRowSig(crRule)) continue;
        const toPersistRule = curCo && !crRule.company ? Object.assign({}, crRule, { company: curCo }) : crRule;
        subStmts.push(
          db.prepare('INSERT OR REPLACE INTO alert_rules (id, kind, payload_json, updated_at) VALUES (?1, ?2, ?3, ?4)')
            .bind(cid, 'custom', JSON.stringify(toPersistRule), String(toPersistRule.updated_at || ''))
        );
      }
      if (hasPrev) {
        for (const pid of pCust.keys()) {
          if (!seenCustIds.has(pid)) {
            if (restrictRls) {
              const prevObj = pCustObj.get(pid);
              const prevCo = prevObj ? String(prevObj.company || '').trim() : '';
              if (!prevCo || !canAccessCompany(session, prevCo)) continue;
            }
            subStmts.push(db.prepare("DELETE FROM alert_rules WHERE id = ?1 AND kind = 'custom'").bind(String(pid)));
          }
        }
      }

      const prevSb = (hasPrev && prevStorePayload.staffBiometrics && typeof prevStorePayload.staffBiometrics === 'object') ? prevStorePayload.staffBiometrics : {};
      const curSb = (storePayload.staffBiometrics && typeof storePayload.staffBiometrics === 'object') ? storePayload.staffBiometrics : {};
      for (const [sk, entry] of Object.entries(curSb)) {
        if (!sk || !entry || typeof entry !== 'object') continue;
        if (prevSb[sk] && stableRowSig(prevSb[sk]) === stableRowSig(entry)) continue;
        const co = canonicalizeCompanyName(entry.company || '');
        if (restrictRls && (!co || !canAccessCompany(session, co))) continue;
        subStmts.push(
          db.prepare('INSERT OR REPLACE INTO staff_biometrics (staff_key, company, payload_json, updated_at) VALUES (?1, ?2, ?3, ?4)')
            .bind(sk, co, JSON.stringify(entry), String(entry.updated_at || ''))
        );
      }
      if (hasPrev) {
        for (const [sk, pEntry] of Object.entries(prevSb)) {
          if (sk in curSb) continue;
          const pCo = canonicalizeCompanyName((pEntry && pEntry.company) || '');
          if (restrictRls && (!pCo || !canAccessCompany(session, pCo))) continue;
          subStmts.push(db.prepare('DELETE FROM staff_biometrics WHERE staff_key = ?1').bind(String(sk)));
        }
      }

      if (storePayload.workSchedules && (!hasPrev || stableRowSig(prevStorePayload.workSchedules) !== stableRowSig(storePayload.workSchedules))) {
        const wsIso = String(storePayload.updatedAt || new Date().toISOString());
        const kvWsRow = await db.prepare("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'work_schedules'").first();
        const liveKvWs = (kvWsRow && safeJsonParse(kvWsRow.payload_json, null)) || {};
        const mergedWs = mergeWorkSchedulesDocs(liveKvWs, storePayload.workSchedules, session, restrictRls);
        storePayload.workSchedules = mergedWs;
        subStmts.push(
          db.prepare(
            `INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, rev) VALUES ('work_schedules', ?1, ?2, 1)
             ON CONFLICT(doc_key) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at, rev = edge_kv_store.rev + 1`
          ).bind(JSON.stringify(mergedWs), wsIso)
        );
      }

      if (Array.isArray(storePayload.users) && storePayload.users.length) {
        const prevUsers = (hasPrev && Array.isArray(prevStorePayload.users)) ? prevStorePayload.users : [];
        const prevUserSigByEmail = new Map();
        for (const pu of prevUsers) {
          if (pu && pu.email) prevUserSigByEmail.set(String(pu.email).trim().toLowerCase(), stableRowSig(pu));
        }
        const dirtyUsers = [];
        for (const u of storePayload.users) {
          if (!u || typeof u !== 'object' || !u.email || !u.full_name) continue;
          const emClean = String(u.email).trim().toLowerCase();
          if (prevUserSigByEmail.get(emClean) === stableRowSig(u)) continue;
          if (restrictRls) {
            const uRole = String(u.role || '').toLowerCase();
            const uCos = parseAllowedCompanies(u.companies);
            if (u.id === 'u1' || u.id === 'u2' || uRole.includes('owner') || !uCos.length || uCos.includes('*') || uCos.some(c => !canAccessCompany(session, c))) {
              continue;
            }
          }
          dirtyUsers.push(u);
        }
        if (dirtyUsers.length) {
          const exRowsRes = await db.prepare('SELECT * FROM users').all();
          const exByEmail = new Map();
          const exById = new Map();
          for (const er of (exRowsRes.results || [])) {
            if (er.id) exById.set(String(er.id), er);
            if (er.email) exByEmail.set(String(er.email).trim().toLowerCase(), er);
          }
          for (const u of dirtyUsers) {
            const emClean = String(u.email).trim().toLowerCase();
            const exU = (u.id && exById.get(String(u.id))) || exByEmail.get(emClean) || null;
            if (exU && restrictRls) {
              const exRole = String(exU.role || '').toLowerCase();
              const exCos = parseAllowedCompanies(exU.companies);
              if (exU.id === 'u1' || exU.id === 'u2' || exRole.includes('owner') || !exCos.length || exCos.includes('*') || exCos.some(c => !canAccessCompany(session, c))) {
                continue;
              }
            }
            const uid = String((exU && exU.id) || u.id || `u-${Date.now()}`);
            const bioNotStale = !(exU && exU.face_updated_at && (!u.face_updated_at || String(exU.face_updated_at) > String(u.face_updated_at)));
            const hasFreshBio = bioNotStale && Array.isArray(u.face_samples) && ((u.face_samples.length > 0 && !u.face_redacted) || u.face_cleared === true);
            const fsJson = hasFreshBio ? JSON.stringify(u.face_samples) : ((exU && exU.face_samples) || '[]');
            const ftJson = (bioNotStale && Array.isArray(u.face_thumbs) && ((u.face_thumbs.length > 0 && !u.face_redacted) || u.face_cleared === true))
              ? JSON.stringify(u.face_thumbs)
              : ((exU && exU.face_thumbs) || '[]');
            const fReq = 'face_required' in u ? (u.face_required ? 1 : 0) : (exU ? Number(exU.face_required || 0) : 0);
            const fUpd = hasFreshBio ? String(u.face_updated_at || new Date().toISOString()) : String((exU && exU.face_updated_at) || u.face_updated_at || '');
            const cpJson = (u.custom_perms && typeof u.custom_perms === 'object')
              ? JSON.stringify(u.custom_perms)
              : (typeof u.custom_perms === 'string' && u.custom_perms.trim() ? u.custom_perms.trim() : ((exU && exU.custom_perms) || '{}'));
            const authModeVal = String('auth_mode' in u ? (u.auth_mode || '') : ((exU && exU.auth_mode) || ''));
            const seatUpd = String(u.seat_updated_at || (exU && exU.seat_updated_at) || new Date().toISOString());
            const mirrorSessEmail = session ? String(session.email || '').trim().toLowerCase() : '';
            const isSelfMirror = Boolean(exU && mirrorSessEmail && mirrorSessEmail === String(exU.email || '').trim().toLowerCase());
            const preserveExPin = Boolean(
              exU && (
                u.pin_redacted ||
                !String(u.pin_code || '').trim() ||
                (restrictRls && !isSelfMirror)
              )
            );
            let rawPinVal = preserveExPin
              ? String(exU.pin_code || '')
              : String(u.pin_code || (exU && exU.pin_code) || '').trim();
            if (!preserveExPin && rawPinVal && !isHashedPin(rawPinVal) && isWeakPin(rawPinVal)) {
              if (exU && exU.pin_code) rawPinVal = String(exU.pin_code || '');
              else continue;
            }
            const pinVal = (rawPinVal && !isHashedPin(rawPinVal))
              ? await hashSeatPin(rawPinVal)
              : rawPinVal;
            const effRole = String(u.role || (exU && exU.role) || 'Entry');
            const effCos = String(u.companies || (exU && exU.companies) || 'WTC');
            const effPbi = String(u.pbi_access || (exU && exU.pbi_access) || 'partial');
            const effStmts = String(u.statements_access || (exU && exU.statements_access) || 'partial');
            const effStatus = String(u.status || (exU && exU.status) || 'Active');
            const effLastLogin = String(u.last_login_at || (exU && exU.last_login_at) || '');
            const cleanPayload = stripBiometricsForPayload(Object.assign({}, u, {
              id: uid,
              full_name: String(u.full_name),
              email: emClean,
              role: effRole,
              companies: effCos,
              pbi_access: effPbi,
              statements_access: effStmts,
              status: effStatus,
              last_login_at: effLastLogin,
              face_required: Boolean(fReq),
              face_updated_at: fUpd,
              seat_updated_at: seatUpd,
              auth_mode: authModeVal
            }));
            delete cleanPayload.pin_redacted;
            delete cleanPayload.face_redacted;
            delete cleanPayload.face_enrolled;
            subStmts.push(
              db.prepare(
                `INSERT OR REPLACE INTO users (
                   id, full_name, email, pin_code, role, companies, pbi_access, statements_access,
                   status, last_login_at, face_samples, face_thumbs, face_required, face_updated_at,
                   seat_updated_at, custom_perms, auth_mode, payload_json
                 ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)`
              ).bind(
                uid, String(u.full_name), emClean, pinVal, effRole, effCos, effPbi, effStmts,
                effStatus, effLastLogin, fsJson, ftJson, fReq, fUpd, seatUpd, cpJson, authModeVal,
                JSON.stringify(cleanPayload)
              )
            );
          }
        }
      }
    } else if (session && session.email && Array.isArray(storePayload.users) && storePayload.users.length) {
      const selfEmail = String(session.email).trim().toLowerCase();
      const selfIn = storePayload.users.find(u => u && String(u.email || '').trim().toLowerCase() === selfEmail);
      const prevSelf = (hasPrev && Array.isArray(prevStorePayload.users))
        ? prevStorePayload.users.find(u => u && String(u.email || '').trim().toLowerCase() === selfEmail)
        : null;
      if (selfIn && !selfIn.face_redacted && Array.isArray(selfIn.face_samples) && (!prevSelf || stableRowSig(prevSelf) !== stableRowSig(selfIn))) {
        const exSelf = await db.prepare('SELECT * FROM users WHERE lower(email) = ?1 LIMIT 1').bind(selfEmail).first();
        const selfBioNotStale = !(exSelf && exSelf.face_updated_at && (!selfIn.face_updated_at || String(exSelf.face_updated_at) > String(selfIn.face_updated_at)));
        if (exSelf && selfBioNotStale) {
          const fsJson = JSON.stringify(selfIn.face_samples);
          const ftJson = Array.isArray(selfIn.face_thumbs) ? JSON.stringify(selfIn.face_thumbs) : (exSelf.face_thumbs || '[]');
          const fUpd = String(selfIn.face_updated_at || exSelf.face_updated_at || '');
          const lastLog = String(selfIn.last_login_at || exSelf.last_login_at || '');
          subStmts.push(
            db.prepare('UPDATE users SET last_login_at = ?1, face_samples = ?2, face_thumbs = ?3, face_updated_at = ?4 WHERE id = ?5')
              .bind(lastLog, fsJson, ftJson, fUpd, exSelf.id)
          );
        }
      }
    }

    if (subStmts.length) {
      await execBatchedStmts(db, subStmts, 80);
      stats.upsertedSubStores += subStmts.length;
    }
  } catch (err) {
    stats.error = String((err && err.message) || err);
  }
  return stats;
}

async function enforceSyncRlsOnStoreDoc(db, incomingDoc, prevDoc, session) {
  if (!session || isOwnerOrFullGroupSession(session) || !incomingDoc || typeof incomingDoc !== 'object') {
    return incomingDoc;
  }
  const prev = (prevDoc && typeof prevDoc === 'object') ? prevDoc : {};
  const sessEmail = String(session.email || '').trim().toLowerCase();
  const canManageSeats = canManageUsersSeat(session);

  // Load canonical baseline users from prevDoc or D1 fallback (closes empty-prevDoc bootstrap gap)
  let baseUsers = Array.isArray(prev.users) && prev.users.length ? prev.users : null;
  if (!baseUsers && db) {
    const uRows = await db.prepare('SELECT * FROM users ORDER BY id').all();
    baseUsers = (uRows.results || []).map(r => hydrateUserRow(r, false, false));
  }
  baseUsers = baseUsers || [];

  // 1. Protect seat privileges/PINs in mfg_web_store.users
  const incByEmail = new Map();
  if (Array.isArray(incomingDoc.users)) {
    for (const iu of incomingDoc.users) {
      if (iu && iu.email) incByEmail.set(String(iu.email).trim().toLowerCase(), iu);
    }
  }
  if (!canManageSeats) {
    incomingDoc.users = baseUsers.map(pu => {
      if (!pu || typeof pu !== 'object') return pu;
      const em = String(pu.email || '').trim().toLowerCase();
      if (em && em === sessEmail && incByEmail.has(em)) {
        const iu = incByEmail.get(em);
        const safeSelf = Object.assign({}, pu);
        for (const k of ['last_login_at', 'face_samples', 'face_thumbs', 'face_updated_at', 'face_cleared']) {
          if (k in iu) safeSelf[k] = iu[k];
        }
        return safeSelf;
      }
      return pu;
    });
  } else {
    // Single-BU Supervisor: preserve Owner/cross-BU seats and reject Owner/cross-BU assignments
    const safeUsers = [];
    const seenEmails = new Set();
    for (const pu of baseUsers) {
      if (!pu || !pu.email) continue;
      const em = String(pu.email).trim().toLowerCase();
      seenEmails.add(em);
      const puRole = String(pu.role || '').toLowerCase();
      const puCos = parseAllowedCompanies(pu.companies);
      const puProtected = pu.id === 'u1' || pu.id === 'u2' || puRole.includes('owner') || !puCos.length || puCos.includes('*') || puCos.some(c => !canAccessCompany(session, c));
      if (puProtected || !incByEmail.has(em)) {
        safeUsers.push(pu);
        continue;
      }
      const iu = incByEmail.get(em);
      const iuRole = String(iu.role || pu.role || '').toLowerCase();
      const iuCos = parseAllowedCompanies(iu.companies || pu.companies || '');
      if (iuRole.includes('owner') || !iuCos.length || iuCos.includes('*') || iuCos.some(c => !canAccessCompany(session, c))) {
        safeUsers.push(pu);
        continue;
      }
      const mergedSeat = Object.assign({}, pu, iu);
      const isSelfSup = Boolean(sessEmail && em === sessEmail);
      if (iu.pin_redacted || !String(iu.pin_code || '').trim() || !isSelfSup) {
        if (pu.pin_code) mergedSeat.pin_code = pu.pin_code;
      }
      delete mergedSeat.pin_redacted;
      delete mergedSeat.face_redacted;
      delete mergedSeat._verifiedPin;
      safeUsers.push(mergedSeat);
    }
    for (const [em, iu] of incByEmail.entries()) {
      if (seenEmails.has(em) || !iu || typeof iu !== 'object') continue;
      const iuRole = String(iu.role || '').toLowerCase();
      const iuCos = parseAllowedCompanies(iu.companies || '');
      if (iuRole.includes('owner') || !iuCos.length || iuCos.includes('*') || iuCos.some(c => !canAccessCompany(session, c))) continue;
      safeUsers.push(iu);
    }
    incomingDoc.users = safeUsers;
  }

  // 2. Protect cross-entity & universal records in mfg_web_store.customRecords
  if (incomingDoc.customRecords && typeof incomingDoc.customRecords === 'object') {
    const prevCr = (prev.customRecords && typeof prev.customRecords === 'object') ? prev.customRecords : {};
    const allKeys = Array.from(new Set([...Object.keys(prevCr), ...Object.keys(incomingDoc.customRecords)]));
    for (const k of allKeys) {
      const canonTable = CR_KEY_TO_TABLE[k] || k;
      const isUniversal = UNIVERSAL_UNIQUE_TABLES.has(canonTable);
      const pList = Array.isArray(prevCr[k]) ? prevCr[k] : [];
      const iList = Array.isArray(incomingDoc.customRecords[k]) ? incomingDoc.customRecords[k] : [];
      const pMap = new Map();
      for (const pr of pList) {
        if (pr && pr.id) pMap.set(String(pr.id).trim(), pr);
      }
      const outList = [];
      const keptIds = new Set();
      for (const ir of iList) {
        if (!ir || typeof ir !== 'object' || !ir.id) continue;
        const rid = String(ir.id).trim();
        const pr = pMap.get(rid);
        if (pr) {
          const prCo = String(pr.company || '').trim();
          const irCo = String(ir.company || '').trim();
          if ((prCo && !canAccessCompany(session, prCo)) || (irCo && !canAccessCompany(session, irCo))) {
            outList.push(pr);
            keptIds.add(rid);
            continue;
          }
        } else {
          const irCo = String(ir.company || '').trim();
          if ((!isUniversal && !irCo) || (irCo && !canAccessCompany(session, irCo))) {
            continue;
          }
        }
        outList.push(ir);
        keptIds.add(rid);
      }
      for (const pr of pList) {
        if (!pr || !pr.id) continue;
        const rid = String(pr.id).trim();
        if (keptIds.has(rid)) continue;
        const prCo = String(pr.company || '').trim();
        // Restore omitted cross-entity rows, companyless BU-table rows, and omitted universal rows for non-Supervisor Entry seats
        if ((prCo && !canAccessCompany(session, prCo)) || (!prCo && !isUniversal) || (isUniversal && !canManageSeats)) {
          outList.push(pr);
        }
      }
      incomingDoc.customRecords[k] = outList;
    }
  }

  // 2b. Protect _purgedOverrideIds against cross-BU deletion or non-legacy ID injection
  const prevPurgedArr = Array.isArray(prev._purgedOverrideIds)
    ? prev._purgedOverrideIds.map(x => String(x || '').trim()).filter(x => LEGACY_PURGED_ENTRY_RE.test(x))
    : [];
  const prevPurgedSet = new Set(prevPurgedArr);
  const safePurged = prevPurgedArr.slice();
  if (Array.isArray(incomingDoc._purgedOverrideIds)) {
    const prevCrForPurge = (prev.customRecords && typeof prev.customRecords === 'object') ? prev.customRecords : {};
    for (const rawItem of incomingDoc._purgedOverrideIds) {
      const s = String(rawItem || '').trim();
      if (!s || !LEGACY_PURGED_ENTRY_RE.test(s) || prevPurgedSet.has(s)) continue;
      const colon = s.indexOf(':');
      const tbl = s.slice(0, colon);
      const rid = s.slice(colon + 1);
      const pArr = Array.isArray(prevCrForPurge[tbl]) ? prevCrForPurge[tbl] : [];
      const pr = pArr.find(x => x && String(x.id || '').trim() === rid);
      const prCo = String((pr && pr.company) || '').trim();
      if (pr && prCo && canAccessCompany(session, prCo)) {
        prevPurgedSet.add(s);
        safePurged.push(s);
      }
    }
  }
  if (safePurged.length) incomingDoc._purgedOverrideIds = safePurged.slice(-2000);
  else delete incomingDoc._purgedOverrideIds;

  // 3. Protect industryCustomRows & industryRowEdits
  const prevIcr = (prev.industryCustomRows && typeof prev.industryCustomRows === 'object') ? prev.industryCustomRows : {};
  const incIcr = (incomingDoc.industryCustomRows && typeof incomingDoc.industryCustomRows === 'object') ? incomingDoc.industryCustomRows : {};
  if (Object.keys(prevIcr).length || Object.keys(incIcr).length) {
    const safeIcr = {};
    for (const bk of new Set([...Object.keys(prevIcr), ...Object.keys(incIcr)])) {
      const pList = Array.isArray(prevIcr[bk]) ? prevIcr[bk] : [];
      const iList = Array.isArray(incIcr[bk]) ? incIcr[bk] : [];
      const pMap = new Map(pList.filter(x => x && (x.id || x.code)).map(x => [String(x.id || x.code).trim(), x]));
      const outB = [];
      const kept = new Set();
      for (const ir of iList) {
        if (!ir || typeof ir !== 'object') continue;
        const rid = String(ir.id || ir.code || '').trim();
        if (!rid) continue;
        const pr = pMap.get(rid);
        const irCo = String(ir.company || ir.resort || ir.entity || '').trim();
        const prCo = pr ? String(pr.company || pr.resort || pr.entity || '').trim() : '';
        if (pr && ((prCo && !canAccessCompany(session, prCo)) || !irCo || !canAccessCompany(session, irCo))) {
          outB.push(pr);
          kept.add(rid);
          continue;
        }
        if (!pr && (!irCo || !canAccessCompany(session, irCo))) continue;
        outB.push(ir);
        kept.add(rid);
      }
      for (const pr of pList) {
        const rid = pr && String(pr.id || pr.code || '').trim();
        if (!rid || kept.has(rid)) continue;
        const prCo = String(pr.company || pr.resort || pr.entity || '').trim();
        if (!prCo || !canAccessCompany(session, prCo)) outB.push(pr);
      }
      safeIcr[bk] = outB;
    }
    incomingDoc.industryCustomRows = safeIcr;
  }

  const prevIre = (prev.industryRowEdits && typeof prev.industryRowEdits === 'object') ? prev.industryRowEdits : {};
  const incIre = (incomingDoc.industryRowEdits && typeof incomingDoc.industryRowEdits === 'object') ? incomingDoc.industryRowEdits : {};
  if (Object.keys(prevIre).length || Object.keys(incIre).length) {
    const safeIre = {};
    for (const [ek, pv] of Object.entries(prevIre)) {
      const pCo = pv && typeof pv === 'object' ? String(pv.company || pv.resort || pv.entity || '').trim() : '';
      if (!pCo || !canAccessCompany(session, pCo)) safeIre[ek] = pv;
    }
    for (const [ek, iv] of Object.entries(incIre)) {
      if (ek in safeIre || !iv || typeof iv !== 'object') continue;
      const iCo = String(iv.company || iv.resort || iv.entity || '').trim();
      if (iCo && canAccessCompany(session, iCo)) safeIre[ek] = iv;
    }
    incomingDoc.industryRowEdits = safeIre;
  }

  // 4. Protect kioskPunches, sentinelReviews, staffBiometrics, alertRules, workSchedules
  if (Array.isArray(prev.kioskPunches) || Array.isArray(incomingDoc.kioskPunches)) {
    const pPunches = Array.isArray(prev.kioskPunches) ? prev.kioskPunches : [];
    const iPunches = Array.isArray(incomingDoc.kioskPunches) ? incomingDoc.kioskPunches : [];
    const pMap = new Map(pPunches.filter(x => x && x.id).map(x => [String(x.id).trim(), x]));
    const outP = [];
    const keptP = new Set();
    for (const ip of iPunches) {
      if (!ip || !ip.id) continue;
      const pid = String(ip.id).trim();
      const pp = pMap.get(pid);
      const iCo = String(ip.company || '').trim();
      const pCo = pp ? String(pp.company || '').trim() : '';
      if (pp && ((pCo && !canAccessCompany(session, pCo)) || !iCo || !canAccessCompany(session, iCo))) {
        outP.push(pp);
        keptP.add(pid);
        continue;
      }
      if (!pp && (!iCo || !canAccessCompany(session, iCo))) continue;
      outP.push(ip);
      keptP.add(pid);
    }
    for (const pp of pPunches) {
      const pid = pp && String(pp.id || '').trim();
      if (!pid || keptP.has(pid)) continue;
      const pCo = String(pp.company || '').trim();
      if (!pCo || !canAccessCompany(session, pCo)) outP.push(pp);
    }
    incomingDoc.kioskPunches = outP;
  }

  if (!canReviewSentinelsSession(session)) {
    if (prev.sentinelReviews !== undefined) incomingDoc.sentinelReviews = prev.sentinelReviews;
    else delete incomingDoc.sentinelReviews;
  } else if (prev.sentinelReviews || incomingDoc.sentinelReviews) {
    const pSr = (prev.sentinelReviews && typeof prev.sentinelReviews === 'object') ? prev.sentinelReviews : {};
    const iSr = (incomingDoc.sentinelReviews && typeof incomingDoc.sentinelReviews === 'object') ? incomingDoc.sentinelReviews : {};
    const safeSr = {};
    for (const [rk, pv] of Object.entries(pSr)) {
      const pCo = pv && typeof pv === 'object' ? String(pv.company || '').trim() : '';
      if (!pCo || !canAccessSentinelScope(session, pCo)) safeSr[rk] = pv;
    }
    for (const [rk, iv] of Object.entries(iSr)) {
      if (rk in safeSr || !iv || typeof iv !== 'object') continue;
      const iCo = normalizeSentinelScopeCompany(iv.company || '');
      const rkScope = String(rk).includes('|') ? normalizeSentinelScopeCompany(String(rk).split('|')[0]) : '';
      if (iCo && rkScope && rkScope === iCo && canAccessSentinelScope(session, iCo)) safeSr[rk] = iv;
    }
    incomingDoc.sentinelReviews = safeSr;
  }

  if (!canManageSeats) {
    if (prev.alertRules !== undefined) incomingDoc.alertRules = prev.alertRules;
    else delete incomingDoc.alertRules;
    if (prev.workSchedules !== undefined) incomingDoc.workSchedules = prev.workSchedules;
    else delete incomingDoc.workSchedules;
    if (prev.staffBiometrics !== undefined) incomingDoc.staffBiometrics = prev.staffBiometrics;
    else delete incomingDoc.staffBiometrics;
  } else {
    if (prev.staffBiometrics || incomingDoc.staffBiometrics) {
      const pSb = (prev.staffBiometrics && typeof prev.staffBiometrics === 'object') ? prev.staffBiometrics : {};
      const iSb = (incomingDoc.staffBiometrics && typeof incomingDoc.staffBiometrics === 'object') ? incomingDoc.staffBiometrics : {};
      const safeSb = {};
      for (const [sk, pv] of Object.entries(pSb)) {
        const pCo = pv && typeof pv === 'object' ? String(pv.company || '').trim() : '';
        if (!pCo || !canAccessCompany(session, pCo)) safeSb[sk] = pv;
      }
      for (const [sk, iv] of Object.entries(iSb)) {
        if (sk in safeSb || !iv || typeof iv !== 'object') continue;
        const iCo = String(iv.company || '').trim();
        if (iCo && canAccessCompany(session, iCo)) safeSb[sk] = iv;
      }
      incomingDoc.staffBiometrics = safeSb;
    }
    if (prev.alertRules || incomingDoc.alertRules) {
      const pAr = (prev.alertRules && typeof prev.alertRules === 'object') ? prev.alertRules : { overrides: {}, custom: [] };
      const iAr = (incomingDoc.alertRules && typeof incomingDoc.alertRules === 'object') ? incomingDoc.alertRules : { overrides: {}, custom: [] };
      const pCust = Array.isArray(pAr.custom) ? pAr.custom : [];
      const iCust = Array.isArray(iAr.custom) ? iAr.custom : [];
      const pMap = new Map(pCust.filter(x => x && x.id).map(x => [String(x.id), x]));
      const safeCust = [];
      const keptC = new Set();
      for (const ic of iCust) {
        if (!ic || !ic.id) continue;
        const cid = String(ic.id);
        const pc = pMap.get(cid);
        const iCo = String(ic.company || '').trim();
        const pCo = pc ? String(pc.company || '').trim() : '';
        if (pc && (!pCo || !canAccessCompany(session, pCo) || !iCo || !canAccessCompany(session, iCo))) {
          safeCust.push(pc);
          keptC.add(cid);
          continue;
        }
        if (!pc && (!iCo || !canAccessCompany(session, iCo))) continue;
        safeCust.push(ic);
        keptC.add(cid);
      }
      for (const pc of pCust) {
        if (!pc || !pc.id || keptC.has(String(pc.id))) continue;
        const pCo = String(pc.company || '').trim();
        if (!pCo || !canAccessCompany(session, pCo)) safeCust.push(pc);
      }
      incomingDoc.alertRules = { overrides: Object.assign({}, pAr.overrides || {}), custom: safeCust };
    }
    if (prev.workSchedules || incomingDoc.workSchedules) {
      const pWs = (prev.workSchedules && typeof prev.workSchedules === 'object') ? prev.workSchedules : {};
      const iWs = (incomingDoc.workSchedules && typeof incomingDoc.workSchedules === 'object') ? incomingDoc.workSchedules : {};
      const safeDefs = Object.assign({}, pWs.companyPolicyDefaults || {});
      for (const [ck, cv] of Object.entries(iWs.companyPolicyDefaults || {})) {
        if (canAccessCompany(session, ck)) safeDefs[ck] = cv;
      }
      const pShifts = Array.isArray(pWs.shiftTypes) ? pWs.shiftTypes : [];
      const iShifts = Array.isArray(iWs.shiftTypes) ? iWs.shiftTypes : [];
      const safeShifts = pShifts.filter(s => s && !canAccessCompany(session, s.company || ''));
      for (const is of iShifts) {
        if (is && is.company && canAccessCompany(session, is.company)) safeShifts.push(is);
      }
      const pRules = (pWs.staffRules && typeof pWs.staffRules === 'object') ? pWs.staffRules : {};
      const iRules = (iWs.staffRules && typeof iWs.staffRules === 'object') ? iWs.staffRules : {};
      const safeRules = {};
      for (const [rk, pv] of Object.entries(pRules)) {
        const pCo = pv && typeof pv === 'object' ? String(pv.company || '').trim() : '';
        if (!pCo || !canAccessCompany(session, pCo)) safeRules[rk] = pv;
      }
      for (const [rk, iv] of Object.entries(iRules)) {
        if (rk in safeRules || !iv || typeof iv !== 'object') continue;
        const iCo = String(iv.company || '').trim();
        if (iCo && canAccessCompany(session, iCo)) safeRules[rk] = iv;
      }
      incomingDoc.workSchedules = {
        shiftTypes: safeShifts,
        policyGroups: Array.isArray(pWs.policyGroups) ? pWs.policyGroups : [],
        companyPolicyDefaults: safeDefs,
        staffRules: safeRules
      };
    }
  }

  if (Array.isArray(prev.sessions) || Array.isArray(incomingDoc.sessions)) {
    const pSess = Array.isArray(prev.sessions) ? prev.sessions : [];
    const iSess = Array.isArray(incomingDoc.sessions) ? incomingDoc.sessions : [];
    const sMap = new Map();
    for (const ps of pSess) {
      if (ps && ps.id) sMap.set(String(ps.id), ps);
    }
    for (const is of iSess) {
      if (!is || !is.id || sMap.has(String(is.id))) continue;
      const isEm = String(is.email || '').trim().toLowerCase();
      if (sessEmail && isEm === sessEmail) sMap.set(String(is.id), is);
    }
    incomingDoc.sessions = Array.from(sMap.values())
      .sort((a, b) => String((b && b.logged_in_at) || '').localeCompare(String((a && a.logged_in_at) || '')))
      .slice(0, 50);
  }

  if (Array.isArray(prev.stepUpAudits) || Array.isArray(incomingDoc.stepUpAudits)) {
    const pAud = Array.isArray(prev.stepUpAudits) ? prev.stepUpAudits : [];
    const iAud = Array.isArray(incomingDoc.stepUpAudits) ? incomingDoc.stepUpAudits : [];
    const aMap = new Map();
    for (const pa of pAud) {
      if (pa && pa.id) aMap.set(String(pa.id), pa);
    }
    for (const ia of iAud) {
      if (!ia || typeof ia !== 'object' || !ia.id || aMap.has(String(ia.id))) continue;
      if (isOwnerOrFullGroupSession(session)) {
        aMap.set(String(ia.id), ia);
        continue;
      }
      const iaEm = String(ia.email || '').trim().toLowerCase();
      const iaUid = String(ia.user_id || '').trim();
      const iaCo = String(ia.company || '').trim();
      const sessUid = String(session.sub || session.user_id || session.id || '').trim();
      const selfMatch = (sessEmail && iaEm === sessEmail) || (sessUid && iaUid === sessUid);
      const coOk = !iaCo || canAccessCompany(session, iaCo) || canAccessSentinelScope(session, iaCo);
      if (selfMatch && coOk) {
        aMap.set(String(ia.id), ia);
      }
    }
    incomingDoc.stepUpAudits = Array.from(aMap.values())
      .sort((a, b) => String((b && b.ts) || '').localeCompare(String((a && a.ts) || '')))
      .slice(0, 300);
  }

  if (!isOwnerOrFullGroupSession(session)) {
    if (prev.faceSettings && typeof prev.faceSettings === 'object') {
      incomingDoc.faceSettings = prev.faceSettings;
    } else {
      delete incomingDoc.faceSettings;
    }
  }

  delete incomingDoc._scopedForSession;
  return incomingDoc;
}

// 28,000-char chunks stay < 84 KB UTF-8 (strictly under D1's 100 KB SQL statement cap even on 100% 3-byte Arabic text)
const KV_CHUNK_CHARS = 28000;

function chunkStringSurrogateSafe(str, maxChars) {
  const chunks = [];
  let pos = 0;
  const len = str.length;
  while (pos < len) {
    let end = Math.min(pos + maxChars, len);
    if (end < len) {
      const code = str.charCodeAt(end - 1);
      if (code >= 0xd800 && code <= 0xdbff && end > pos + 1) {
        end -= 1;
      }
    }
    chunks.push(str.slice(pos, end));
    pos = end;
  }
  return chunks.length ? chunks : [''];
}

async function readEdgeKvDoc(db, key) {
  const rows = await db.prepare(
    'SELECT doc_key, payload_json, updated_at, rev FROM edge_kv_store WHERE doc_key = ?1 OR doc_key LIKE ?2 ORDER BY doc_key ASC'
  ).bind(key, `${key}__part_%`).all();
  const list = rows.results || [];
  if (!list.length) return null;
  let head = null;
  const parts = [];
  for (const r of list) {
    if (r.doc_key === key) {
      head = r;
    } else {
      parts.push(String(r.payload_json || ''));
    }
  }
  if (!head) return null;
  const fullJson = String(head.payload_json || '') + parts.join('');
  return {
    payload_json: fullJson,
    updated_at: String(head.updated_at || ''),
    rev: Number(head.rev || 1)
  };
}

async function writeEdgeKvDoc(db, key, jsonStr, updatedAt, updatedBy, casOpts = null) {
  const slices = chunkStringSurrogateSafe(jsonStr, KV_CHUNK_CHARS);
  const headSlice = slices[0];
  if (casOpts && typeof casOpts === 'object') {
    const casRes = casOpts.exists
      ? await db.prepare(
          `UPDATE edge_kv_store
           SET payload_json = ?1, updated_at = ?2, updated_by = ?3, rev = rev + 1
           WHERE doc_key = ?4 AND updated_at = ?5`
        ).bind(headSlice, updatedAt, updatedBy, key, String(casOpts.updatedAt || '')).run()
      : await db.prepare(
          `INSERT OR IGNORE INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev)
           VALUES (?1, ?2, ?3, ?4, 1)`
        ).bind(key, headSlice, updatedAt, updatedBy).run();
    if (!casRes || !casRes.meta || Number(casRes.meta.changes || 0) === 0) {
      return { ok: false, conflict: true };
    }
    const tailStmts = [
      db.prepare('DELETE FROM edge_kv_store WHERE doc_key LIKE ?1').bind(`${key}__part_%`)
    ];
    for (let partIdx = 1; partIdx < slices.length; partIdx++) {
      const partKey = `${key}__part_${String(partIdx).padStart(4, '0')}`;
      tailStmts.push(
        db.prepare(
          'INSERT OR REPLACE INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES (?1, ?2, ?3, ?4, 1)'
        ).bind(partKey, slices[partIdx], updatedAt, updatedBy)
      );
    }
    for (let i = 0; i < tailStmts.length; i += 500) {
      await db.batch(tailStmts.slice(i, i + 500));
    }
    return { ok: true, conflict: false };
  }

  const stmts = [
    db.prepare(
      `INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev)
       VALUES (?1, ?2, ?3, ?4, 1)
       ON CONFLICT(doc_key) DO UPDATE SET
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by,
         rev = edge_kv_store.rev + 1`
    ).bind(key, headSlice, updatedAt, updatedBy),
    db.prepare('DELETE FROM edge_kv_store WHERE doc_key LIKE ?1').bind(`${key}__part_%`)
  ];

  for (let partIdx = 1; partIdx < slices.length; partIdx++) {
    const partKey = `${key}__part_${String(partIdx).padStart(4, '0')}`;
    stmts.push(
      db.prepare(
        'INSERT OR REPLACE INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES (?1, ?2, ?3, ?4, 1)'
      ).bind(partKey, slices[partIdx], updatedAt, updatedBy)
    );
  }

  for (let i = 0; i < stmts.length; i += 500) {
    await db.batch(stmts.slice(i, i + 500));
  }
  return { ok: true, conflict: false };
}

function redactFaceSamplesFromUserObj(u) {
  if (!u || typeof u !== 'object') return u;
  const copy = Object.assign({}, u);
  const validCount = Array.isArray(copy.face_samples)
    ? copy.face_samples.filter(isValidFaceVec).length
    : Number(copy.face_sample_count || (copy.face_enrolled ? 1 : 0));
  copy.face_enrolled = Boolean(!copy.face_cleared && (copy.face_enrolled || validCount > 0));
  copy.face_sample_count = copy.face_enrolled ? Math.max(1, validCount) : 0;
  copy.face_redacted = Boolean(copy.face_enrolled);
  if (!copy.face_enrolled && copy.face_updated_at) copy.face_cleared = true;
  delete copy.face_samples;
  if (copy.pin_code || copy.pin_redacted) copy.pin_redacted = true;
  delete copy.pin_code;
  delete copy._verifiedPin;
  return copy;
}

function scopeStoreDocForSession(docObj, session) {
  if (!docObj || typeof docObj !== 'object') return docObj;
  if (session && isOwnerOrFullGroupSession(session)) {
    if (!Array.isArray(docObj.users)) return docObj;
    return Object.assign({}, docObj, {
      users: docObj.users.map(redactFaceSamplesFromUserObj)
    });
  }
  const sessEmail = session ? String(session.email || '').trim().toLowerCase() : '';
  const canManage = Boolean(session && canManageUsersSeat(session));
  const copyDoc = Object.assign({}, docObj, { _scopedForSession: true });

  if (Array.isArray(docObj.users)) {
    copyDoc.users = docObj.users.map(u => {
      if (!u || typeof u !== 'object') return u;
      const em = String(u.email || '').trim().toLowerCase();
      const isSelf = Boolean(sessEmail && em === sessEmail);
      if (isSelf) {
        return redactFaceSamplesFromUserObj(u);
      }
      if (canManage) {
        const uCos = parseAllowedCompanies(u.companies);
        const uOwner = String(u.role || '').toLowerCase().includes('owner') || u.id === 'u1' || u.id === 'u2';
        if (!uOwner && uCos.length && !uCos.includes('*') && uCos.every(c => canAccessCompany(session, c))) {
          const uSup = redactFaceSamplesFromUserObj(u);
          delete uSup.pin_code;
          uSup.pin_redacted = true;
          return uSup;
        }
      }
      const uCopy = redactFaceSamplesFromUserObj(u);
      delete uCopy.pin_code;
      uCopy.pin_redacted = true;
      delete uCopy.face_thumbs;
      uCopy.custom_perms = null;
      return uCopy;
    });
  }

  if (Array.isArray(docObj.sessions)) {
    copyDoc.sessions = docObj.sessions.filter(s => {
      if (!s || typeof s !== 'object') return false;
      const sEm = String(s.email || '').trim().toLowerCase();
      if (sessEmail && sEm === sessEmail) return true;
      if (canManage) {
        const sCos = parseAllowedCompanies(s.companies);
        return sCos.length > 0 && !sCos.includes('*') && sCos.some(c => canAccessCompany(session, c));
      }
      return false;
    });
  }

  if (Array.isArray(docObj.stepUpAudits)) {
    const sessUid = session ? String(session.sub || session.user_id || session.id || '').trim() : '';
    copyDoc.stepUpAudits = docObj.stepUpAudits.filter(a => {
      if (!a || typeof a !== 'object') return false;
      const aEm = String(a.email || '').trim().toLowerCase();
      const aUid = String(a.user_id || '').trim();
      if ((sessEmail && aEm === sessEmail) || (sessUid && aUid === sessUid)) return true;
      if (canManage) {
        const aCo = String(a.company || '').trim();
        return Boolean(aCo && (canAccessCompany(session, aCo) || canAccessSentinelScope(session, aCo)));
      }
      return false;
    });
  }

  if (docObj.customRecords && typeof docObj.customRecords === 'object') {
    const scopedCr = {};
    for (const [k, list] of Object.entries(docObj.customRecords)) {
      if (!Array.isArray(list)) continue;
      const canonTable = CR_KEY_TO_TABLE[k] || k;
      const isUniversal = UNIVERSAL_UNIQUE_TABLES.has(canonTable);
      scopedCr[k] = list.filter(r => {
        if (!r || typeof r !== 'object') return false;
        const co = String(r.company || '').trim();
        if (isUniversal) return !co || canAccessCompany(session, co);
        return Boolean(co && canAccessCompany(session, co));
      });
    }
    copyDoc.customRecords = scopedCr;
  }

  if (docObj.industryCustomRows && typeof docObj.industryCustomRows === 'object') {
    const scopedIcr = {};
    for (const [bk, arr] of Object.entries(docObj.industryCustomRows)) {
      if (!Array.isArray(arr)) continue;
      scopedIcr[bk] = arr.filter(r => {
        if (!r || typeof r !== 'object') return false;
        const co = String(r.company || r.resort || r.entity || '').trim();
        return Boolean(co && canAccessCompany(session, co));
      });
    }
    copyDoc.industryCustomRows = scopedIcr;
  }

  if (docObj.industryRowEdits && typeof docObj.industryRowEdits === 'object') {
    const scopedIre = {};
    for (const [ek, ev] of Object.entries(docObj.industryRowEdits)) {
      if (!ev || typeof ev !== 'object') continue;
      const co = String(ev.company || ev.resort || ev.entity || '').trim();
      if (co && canAccessCompany(session, co)) scopedIre[ek] = ev;
    }
    copyDoc.industryRowEdits = scopedIre;
  }

  if (Array.isArray(docObj.kioskPunches)) {
    copyDoc.kioskPunches = docObj.kioskPunches.filter(p => {
      if (!p || typeof p !== 'object') return false;
      const co = String(p.company || '').trim();
      return Boolean(co && canAccessCompany(session, co));
    });
  }

  if (docObj.sentinelReviews && typeof docObj.sentinelReviews === 'object') {
    const scopedSr = {};
    for (const [rk, rv] of Object.entries(docObj.sentinelReviews)) {
      if (!rv || typeof rv !== 'object') continue;
      const co = String(rv.company || '').trim();
      if (co && canAccessSentinelScope(session, co)) scopedSr[rk] = rv;
    }
    copyDoc.sentinelReviews = scopedSr;
  }

  if (docObj.staffBiometrics && typeof docObj.staffBiometrics === 'object') {
    const scopedSb = {};
    for (const [sk, bv] of Object.entries(docObj.staffBiometrics)) {
      if (!bv || typeof bv !== 'object') continue;
      const co = String(bv.company || '').trim();
      if (co && canAccessCompany(session, co)) scopedSb[sk] = bv;
    }
    copyDoc.staffBiometrics = scopedSb;
  }

  if (docObj.alertRules && typeof docObj.alertRules === 'object') {
    copyDoc.alertRules = scopeAlertRulesForSession(docObj.alertRules, session);
  }

  if (docObj.workSchedules && typeof docObj.workSchedules === 'object') {
    copyDoc.workSchedules = scopeWorkSchedulesForSession(docObj.workSchedules, session);
  }

  if (Array.isArray(docObj._purgedOverrideIds)) {
    const canMfg = canAccessCompany(session, 'WTC') || canAccessCompany(session, 'BBConstruction') || canAccessCompany(session, 'Lions Transport');
    copyDoc._purgedOverrideIds = docObj._purgedOverrideIds.filter(raw => {
      const s = String(raw || '').trim();
      if (!LEGACY_PURGED_ENTRY_RE.test(s)) return false;
      const rid = s.slice(s.indexOf(':') + 1);
      if (rid.startsWith('dv-hld-')) return canAccessCompany(session, 'Bdeir Holding');
      if (rid.startsWith('dv-ins-')) return canAccessCompany(session, 'Insurance Company');
      if (rid.startsWith('wbmalf-wtc-') || rid.startsWith('wbrecur-wtc-')) return canAccessCompany(session, 'WTC');
      if (rid.startsWith('wbrecur-bbc-')) return canAccessCompany(session, 'BBConstruction');
      return canMfg;
    });
  }

  return copyDoc;
}

// Documents the kiosk endpoint alone reads and writes (station key hashes, when each tablet was last heard
// from, the date till sales start posting to venue revenue). They are never served or patched through the
// general store route, whatever the seat: the kiosk endpoint has its own Owner-only operations for them.
export function isKioskOwnedDoc(docKey) {
  const k = String(docKey || '');
  return k === 'kiosk_station_keys' || k === 'kiosk_station_auth' || k === 'pos_revenue_posting' || k.startsWith('kiosk_key_seen:');
}

export async function handleAuthMe(env, session) {
  if (!session || !env || !env.DB) {
    return jsonResponse({ ok: true, edge: true, authenticated: false, session: null, user: null });
  }
  let userOut = null;
  try {
    const uid = String(session.sub || '').trim();
    const em = String(session.email || '').trim().toLowerCase();
    const row = uid
      ? await env.DB.prepare('SELECT * FROM users WHERE id = ?1 LIMIT 1').bind(uid).first()
      : (em ? await env.DB.prepare('SELECT * FROM users WHERE lower(email) = ?1 LIMIT 1').bind(em).first() : null);
    if (!row || String(row.status || '') === 'Suspended') {
      return jsonResponse({ ok: true, edge: true, authenticated: false, session: null, user: null });
    }
    userOut = hydrateUserRow(row, true, false);
  } catch (_) {}
  return jsonResponse({ ok: true, edge: true, authenticated: true, session, user: userOut });
}

export async function handleSync(request, env, session, body, _ctx) {
  if (!session) return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  if (!env || !env.DB) return jsonResponse({ ok: false, error: 'D1 not bound' }, 503);
  const docKey = String((body && body.doc) || 'mfg_web_store');
  const patchDocKeys = (body && body.op === 'patch' && body.patch && typeof body.patch === 'object') ? Object.keys(body.patch) : [];
  if (isKioskOwnedDoc(docKey) || patchDocKeys.some(isKioskOwnedDoc)) {
    return jsonResponse({ ok: false, error: 'This document is managed from Kiosks, Tablet Keys.' }, 403);
  }

  if (request.method === 'GET' || (body && (body.op === 'get_mfg' || body.op === 'get_control'))) {
    const targetKey = body && body.op === 'get_control' ? 'control_store' : docKey;
    if (targetKey !== 'mfg_web_store' && !isOwnerOrFullGroupSession(session)) {
      return jsonResponse({ ok: false, error: 'Owner permissions required for control store.' }, 403);
    }
    const row = await readEdgeKvDoc(env.DB, targetKey);
    const rawDocObj = row ? safeJsonParse(row.payload_json, {}) : {};
    if (row && row.updated_at && !rawDocObj.updatedAt) rawDocObj.updatedAt = row.updated_at;
    if (targetKey === 'mfg_web_store') {
      await overlayCanonicalSubStoresOnMfgDoc(env.DB, rawDocObj);
    }
    const docObj = targetKey === 'mfg_web_store' ? scopeStoreDocForSession(rawDocObj, session) : rawDocObj;
    return jsonResponse({ ok: true, edge: true, docs: { [targetKey]: docObj } });
  }

  if (isDemoHeader(request)) {
    return jsonResponse({ ok: false, error: 'Demo sandbox cannot push to live ledger' }, 403);
  }

  if (body && body.op === 'patch' && body.patch && typeof body.patch === 'object') {
    const patchKeys = Object.keys(body.patch);
    const pKey = patchKeys[0] || docKey;
    if (pKey !== 'mfg_web_store' && !isOwnerOrFullGroupSession(session)) {
      return jsonResponse({ ok: false, error: 'Owner permissions required for control store.' }, 403);
    }
    const incomingDoc = body.patch[pKey] || {};
    delete incomingDoc._scopedForSession;
    const expectedTs = String(body.ifMatchUpdatedAt || '');
    // Old seed ids as the browser sent them, before the RLS merge adds stored rows (counted once the write lands).
    const legacyCandidates = pKey === 'mfg_web_store' ? collectLegacyCandidates(incomingDoc) : null;

    const currentRow = await readEdgeKvDoc(env.DB, pKey);
    const currentTs = currentRow ? String(currentRow.updated_at || '') : '';

    if (expectedTs && currentTs && expectedTs !== currentTs) {
      const rawFresh = safeJsonParse(currentRow.payload_json, {});
      if (pKey === 'mfg_web_store') {
        await overlayCanonicalSubStoresOnMfgDoc(env.DB, rawFresh);
      }
      const freshDoc = pKey === 'mfg_web_store' ? scopeStoreDocForSession(rawFresh, session) : rawFresh;
      return jsonResponse({
        ok: true,
        conflict: true,
        updatedAt: currentTs,
        docs: { [pKey]: freshDoc }
      });
    }

    let prevDoc = currentRow ? safeJsonParse(currentRow.payload_json, null) : null;
    if (pKey === 'mfg_web_store') {
      prevDoc = await overlayCanonicalSubStoresOnMfgDoc(env.DB, prevDoc || {});
    }
    if (pKey === 'mfg_web_store' && !isOwnerOrFullGroupSession(session)) {
      await enforceSyncRlsOnStoreDoc(env.DB, incomingDoc, prevDoc, session);
    }
    if (pKey === 'mfg_web_store') stripServerOwnedCustomRows(incomingDoc, prevDoc);
    let newTs = String(incomingDoc.updatedAt || new Date().toISOString());
    if (newTs === currentTs) {
      const parsedMs = Date.parse(newTs);
      newTs = Number.isFinite(parsedMs) ? new Date(parsedMs + 1).toISOString() : `${newTs}.1`;
    }
    incomingDoc.updatedAt = newTs;

    const updatedByStr = String(incomingDoc.updatedBy || (session && session.email) || '');
    const kvPayloadDoc = (pKey === 'mfg_web_store' && Array.isArray(incomingDoc.users))
      ? Object.assign({}, incomingDoc, { users: incomingDoc.users.map(redactFaceSamplesFromUserObj) })
      : incomingDoc;

    // Claim the atomic `edge_kv_store` CAS slot FIRST so concurrent CAS losers never touch relational D1 tables
    const kvRes = await writeEdgeKvDoc(
      env.DB,
      pKey,
      JSON.stringify(kvPayloadDoc),
      newTs,
      updatedByStr,
      { exists: Boolean(currentRow), updatedAt: currentTs }
    );
    if (kvRes && kvRes.conflict) {
      const latestRow = await readEdgeKvDoc(env.DB, pKey);
      const latestRaw = latestRow ? safeJsonParse(latestRow.payload_json, {}) : {};
      if (pKey === 'mfg_web_store') {
        await overlayCanonicalSubStoresOnMfgDoc(env.DB, latestRaw);
      }
      const latestScoped = pKey === 'mfg_web_store' ? scopeStoreDocForSession(latestRaw, session) : latestRaw;
      return jsonResponse({
        ok: true,
        conflict: true,
        updatedAt: latestRow ? String(latestRow.updated_at || '') : '',
        docs: { [pKey]: latestScoped }
      });
    }

    let mirrorStats = undefined;
    if (pKey === 'mfg_web_store') {
      mirrorStats = await mirrorStoreDeltaToD1Tables(env.DB, incomingDoc, prevDoc, session);
      if (mirrorStats && mirrorStats.error) {
        try {
          if (currentRow) {
            await writeEdgeKvDoc(env.DB, pKey, currentRow.payload_json, currentTs, '');
          } else {
            await env.DB.batch([
              env.DB.prepare('DELETE FROM edge_kv_store WHERE doc_key = ?1').bind(pKey),
              env.DB.prepare('DELETE FROM edge_kv_store WHERE doc_key LIKE ?1').bind(`${pKey}__part_%`)
            ]);
          }
        } catch (_) {}
        return jsonResponse({ ok: false, error: `Relational mirror failed: ${mirrorStats.error}` }, 500);
      }
      if (Array.isArray(incomingDoc.users)) {
        incomingDoc.users = kvPayloadDoc.users;
      }
    }
    if (pKey === 'mfg_web_store' && isOwnerOrFullGroupSession(session) && incomingDoc.faceSettings && typeof incomingDoc.faceSettings === 'object') {
      const pubFs = sanitizePublicFaceSettings(incomingDoc.faceSettings);
      if (pubFs) {
        try {
          await writeEdgeKvDoc(env.DB, 'face_settings', JSON.stringify(pubFs), newTs, updatedByStr);
        } catch (_) {}
      }
    }
    if (legacyCandidates) {
      const legacyHitsTask = scheduleLegacyIdHits(env, _ctx, legacyCandidates);
      if (legacyHitsTask) await legacyHitsTask;
    }

    return jsonResponse(
      body.awaitMirror === true && mirrorStats
        ? { ok: true, edge: true, updatedAt: newTs, mirrorStats }
        : { ok: true, edge: true, updatedAt: newTs }
    );
  }

  return jsonResponse({ ok: false, error: 'Unsupported sync operation' }, 400);
}

async function purgePhoneScanR2Pages(env, pagesJsonRaw) {
  if (!env || !env.BUCKET || !pagesJsonRaw) return;
  const pages = safeJsonParse(pagesJsonRaw, []);
  if (!Array.isArray(pages)) return;
  for (const pg of pages) {
    if (pg && pg.r2Key) {
      try { await env.BUCKET.delete(String(pg.r2Key)); } catch (_) {}
    }
  }
}

export async function handlePhoneScan(request, env, url, body, session) {
  if (!env || !env.DB) return jsonResponse({ ok: true, found: false });
  const ipHash = await hashClientIp(request);
  const rl = await checkD1RateLimit(env, `phone-scan:${ipHash}`, 45, 60);
  if (!rl.allowed) {
    return jsonResponse({ ok: false, error: 'Phone scan rate limit exceeded.' }, 429);
  }
  const nowMs = Date.now();
  // Prune sessions older than 10 minutes in bounded batches, purging R2 pages BEFORE deleting each exact sid
  try {
    for (let batchIdx = 0; batchIdx < 3; batchIdx++) {
      const stale = await env.DB.prepare('SELECT sid, pages_json FROM phone_scan_sessions WHERE updated_ms < ?1 LIMIT 50').bind(nowMs - 600000).all();
      const staleRows = stale.results || [];
      if (!staleRows.length) break;
      const staleSids = [];
      for (const sr of staleRows) {
        await purgePhoneScanR2Pages(env, sr.pages_json);
        if (sr && sr.sid) staleSids.push(String(sr.sid));
      }
      if (staleSids.length) {
        const ph = staleSids.map((_, i) => `?${i + 1}`).join(',');
        await env.DB.prepare(`DELETE FROM phone_scan_sessions WHERE sid IN (${ph})`).bind(...staleSids).run();
      }
      if (staleRows.length < 50) break;
    }
  } catch (_) {}

  if (request.method === 'GET') {
    const sid = String(url.searchParams.get('sid') || '').trim().slice(0, 64);
    const tok = String(url.searchParams.get('k') || '').trim().slice(0, 64);
    if (!sid) return jsonResponse({ ok: true, found: false });
    const row = await env.DB.prepare('SELECT * FROM phone_scan_sessions WHERE sid = ?1').bind(sid).first();
    if (!row || (row.tok && row.tok !== tok)) {
      return jsonResponse({ ok: true, found: false });
    }
    const pages = safeJsonParse(row.pages_json, []);
    // Hydrate any R2-offloaded page dataUrls
    if (env.BUCKET && Array.isArray(pages)) {
      for (const pg of pages) {
        if (pg && pg.r2Key && !pg.dataUrl) {
          try {
            const obj = await env.BUCKET.get(pg.r2Key);
            if (obj) pg.dataUrl = await obj.text();
          } catch (_) {}
        }
      }
    }
    return jsonResponse({
      ok: true,
      found: true,
      session: {
        sid: row.sid,
        tok: row.tok,
        status: row.status,
        pages,
        rtcOffer: row.rtc_offer ? safeJsonParse(row.rtc_offer, row.rtc_offer) : undefined,
        rtcAnswer: row.rtc_answer ? safeJsonParse(row.rtc_answer, row.rtc_answer) : undefined,
        ts: Math.floor(Number(row.updated_ms || nowMs) / 1000)
      }
    });
  }

  const sid = String((body && body.sid) || '').trim().slice(0, 64);
  const tok = String((body && (body.k || body.tok)) || '').trim().slice(0, 64);
  const opKind = String((body && body.op) || 'update').trim().toLowerCase();
  if (!sid || !tok) return jsonResponse({ ok: false, error: 'Missing session id' }, 400);

  const existing = await env.DB.prepare('SELECT * FROM phone_scan_sessions WHERE sid = ?1').bind(sid).first();
  if (!existing && (!session || isDemoHeader(request))) {
    return jsonResponse({ ok: false, error: 'Authenticated session required to initiate phone scan handoff.' }, 401);
  }
  if (existing && existing.tok !== tok) {
    return jsonResponse({ ok: false, error: 'Token mismatch' }, 403);
  }
  if (opKind === 'clear') {
    if (existing && existing.pages_json) {
      await purgePhoneScanR2Pages(env, existing.pages_json);
    }
    await env.DB.prepare('DELETE FROM phone_scan_sessions WHERE sid = ?1').bind(sid).run();
    return jsonResponse({ ok: true, cleared: true });
  }

  let status = String((body && body.status) || (existing && existing.status) || 'waiting').slice(0, 40);
  const rtcOffer = body && body.rtcOffer ? JSON.stringify(body.rtcOffer) : String((existing && existing.rtc_offer) || '');
  const rtcAnswer = body && body.rtcAnswer ? JSON.stringify(body.rtcAnswer) : String((existing && existing.rtc_answer) || '');
  if (rtcOffer.length > 32768 || rtcAnswer.length > 32768) {
    return jsonResponse({ ok: false, error: 'WebRTC signaling payload exceeds 32 KB limit.' }, 413);
  }
  const mergedPages = existing ? safeJsonParse(existing.pages_json, []) : [];
  const seenIds = new Set(mergedPages.map(p => p && String(p.id || '')));
  const safeSid = sid.replace(/[^a-zA-Z0-9_.-]/g, '_');

  if (Array.isArray(body && body.pages) && body.pages.length) {
    for (const pg of body.pages.slice(0, 8)) {
      if (!pg || !pg.dataUrl) continue;
      const rawDataUrl = String(pg.dataUrl);
      if (rawDataUrl.length > 5600000) {
        return jsonResponse({ ok: false, error: 'Scanned page exceeds 4 MB limit.' }, 413);
      }
      if (mergedPages.length >= 8) break;
      const pid = String(pg.id || `pg-${Date.now()}`).replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 64);
      if (seenIds.has(pid)) continue;
      seenIds.add(pid);
      if (env.BUCKET) {
        const r2Key = `phone-scan/${safeSid}/${pid}.txt`;
        await env.BUCKET.put(r2Key, rawDataUrl, {
          httpMetadata: { contentType: 'text/plain; charset=utf-8' }
        });
        mergedPages.push({ id: pid, mimeType: pg.mimeType || 'image/jpeg', r2Key, ts: nowMs });
      } else {
        mergedPages.push({ id: pid, mimeType: pg.mimeType || 'image/jpeg', dataUrl: rawDataUrl, ts: nowMs });
      }
    }
    status = 'pages_ready';
  }

  await env.DB.prepare(
    `INSERT OR REPLACE INTO phone_scan_sessions (sid, tok, status, pages_json, rtc_offer, rtc_answer, updated_ms)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
  ).bind(sid, tok, status, JSON.stringify(mergedPages.slice(0, 8)), rtcOffer, rtcAnswer, nowMs).run();

  return jsonResponse({ ok: true, status, pageCount: mergedPages.length });
}

const SAFE_INLINE_BLOB_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);
function buildSafeRawBlobHeaders(rawMime) {
  let m = String(rawMime || '').trim().toLowerCase().split(';')[0].trim();
  if (m === 'image/jpg') m = 'image/jpeg';
  const safeInline = SAFE_INLINE_BLOB_MIMES.has(m);
  const headers = {
    'Content-Type': safeInline ? m : 'application/octet-stream',
    'Cache-Control': 'private, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': 'sandbox'
  };
  if (!safeInline) {
    headers['Content-Disposition'] = 'attachment';
  }
  return headers;
}

export async function handleBlobs(request, env, session, url, body) {
  if (!env || !env.DB) return jsonResponse({ ok: false, error: 'Storage unavailable' }, 503);
  if (!session) return jsonResponse({ ok: false, error: 'Authentication required' }, 401);

  if (request.method === 'GET') {
    const blobId = String(url.searchParams.get('id') || '').trim();
    if (!blobId) return jsonResponse({ ok: false, error: 'Missing blob id' }, 400);
    const meta = await env.DB.prepare('SELECT * FROM document_blobs WHERE blob_id = ?1').bind(blobId).first();
    if (!meta) return jsonResponse({ ok: true, found: false });
    if (!isOwnerOrFullGroupSession(session) && (!meta.company || !canAccessCompany(session, meta.company))) {
      return jsonResponse({ ok: false, error: 'Unauthorized entity attachment' }, 403);
    }

    const wantRaw = url.searchParams.get('raw') === '1' || url.searchParams.get('format') === 'raw';
    if (meta.r2_key && env.BUCKET) {
      const obj = await env.BUCKET.get(meta.r2_key);
      if (obj) {
        if (wantRaw) {
          return new Response(obj.body, {
            status: 200,
            headers: buildSafeRawBlobHeaders(meta.mime_type)
          });
        }
        const ab = await obj.arrayBuffer();
        const u8 = new Uint8Array(ab);
        let bin = '';
        const chunk = 0x8000;
        for (let i = 0; i < u8.length; i += chunk) {
          bin += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
        }
        const b64 = btoa(bin);
        return jsonResponse({
          ok: true,
          found: true,
          id: blobId,
          mimeType: meta.mime_type || 'image/jpeg',
          dataUrl: `data:${meta.mime_type || 'image/jpeg'};base64,${b64}`,
          storage: 'r2'
        });
      }
    }
    if (meta.data_b64) {
      if (wantRaw) {
        const bin = atob(meta.data_b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new Response(bytes, {
          status: 200,
          headers: buildSafeRawBlobHeaders(meta.mime_type)
        });
      }
      return jsonResponse({
        ok: true,
        found: true,
        id: blobId,
        mimeType: meta.mime_type || 'image/jpeg',
        dataUrl: `data:${meta.mime_type || 'image/jpeg'};base64,${meta.data_b64}`,
        storage: 'd1'
      });
    }
    return jsonResponse({ ok: true, found: false });
  }

  if (isDemoHeader(request)) return jsonResponse({ ok: false, error: 'Demo sandbox is read-only' }, 403);

  if (request.method === 'DELETE') {
    const blobId = String(url.searchParams.get('id') || (body && body.id) || '').trim();
    if (!blobId) return jsonResponse({ ok: false, error: 'Missing blob id' }, 400);
    const meta = await env.DB.prepare('SELECT r2_key, company FROM document_blobs WHERE blob_id = ?1').bind(blobId).first();
    if (meta && !isOwnerOrFullGroupSession(session) && (!meta.company || !canAccessCompany(session, meta.company))) {
      return jsonResponse({ ok: false, error: 'Unauthorized entity attachment delete' }, 403);
    }
    if (meta && meta.r2_key && env.BUCKET) {
      try { await env.BUCKET.delete(meta.r2_key); } catch (_) {}
    }
    await env.DB.prepare('DELETE FROM document_blobs WHERE blob_id = ?1').bind(blobId).run();
    return jsonResponse({ ok: true, deleted: true });
  }

  // POST / PUT upload
  const blobId = String((body && body.id) || '').trim().slice(0, 128);
  const safeBlobId = blobId.replace(/[^a-zA-Z0-9_.:-]/g, '_');
  const dataUrl = String((body && body.dataUrl) || '');
  let company = canonicalizeCompanyName(String((body && body.company) || '').trim());
  if (!company || !isKnownCanonicalCompany(company)) {
    const sessCos = parseAllowedCompanies(session && session.companies).filter(c => c !== '*');
    if (sessCos.length >= 1) company = canonicalizeCompanyName(sessCos[0]);
    else if (isOwnerOrFullGroupSession(session)) company = 'WTC';
  }
  if (!blobId || !safeBlobId || !dataUrl.includes(';base64,')) {
    return jsonResponse({ ok: false, error: 'Invalid blob payload' }, 400);
  }
  if (!isOwnerOrFullGroupSession(session) && (!company || !canAccessCompany(session, company))) {
    return jsonResponse({ ok: false, error: 'Unauthorized entity attachment upload' }, 403);
  }
  if (!isOwnerOrFullGroupSession(session)) {
    const exBlob = await env.DB.prepare('SELECT company FROM document_blobs WHERE blob_id = ?1').bind(blobId).first();
    if (exBlob && (!exBlob.company || !canAccessCompany(session, exBlob.company))) {
      return jsonResponse({ ok: false, error: 'Cannot overwrite another entity attachment' }, 403);
    }
  }

  const [prefix, b64Data] = dataUrl.split(';base64,');
  const mimeType = String(prefix.replace(/^data:/i, '') || 'image/jpeg').slice(0, 100);
  const approxBytes = Math.floor((b64Data.length * 3) / 4);
  if (approxBytes > 8 * 1024 * 1024) {
    return jsonResponse({ ok: false, error: 'Attachment exceeds 8 MB limit' }, 413);
  }

  const nowIso = new Date().toISOString();
  if (env.BUCKET) {
    const bin = atob(b64Data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    let r2Key = `vault/${safeBlobId}`;
    if (safeBlobId !== blobId) {
      const idDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(blobId));
      const hex12 = Array.from(new Uint8Array(idDigest)).slice(0, 6).map(b => b.toString(16).padStart(2, '0')).join('');
      r2Key = `vault/${safeBlobId}__${hex12}`;
    }
    await env.BUCKET.put(r2Key, bytes, {
      httpMetadata: { contentType: mimeType }
    });
    await env.DB.prepare(
      `INSERT OR REPLACE INTO document_blobs (blob_id, mime_type, company, size_bytes, r2_key, data_b64, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, '', ?6)`
    ).bind(blobId, mimeType, company, bytes.byteLength, r2Key, nowIso).run();
    return jsonResponse({ ok: true, id: blobId, storage: 'r2', sizeBytes: bytes.byteLength });
  }

  // Automatic D1 fallback when R2 bucket is not yet activated (up to 1.4 MB)
  if (b64Data.length > 1900000) {
    return jsonResponse({ ok: false, error: 'Enable R2 bucket for attachments larger than 1.4 MB' }, 413);
  }
  await env.DB.prepare(
    `INSERT OR REPLACE INTO document_blobs (blob_id, mime_type, company, size_bytes, r2_key, data_b64, created_at)
     VALUES (?1, ?2, ?3, ?4, '', ?5, ?6)`
  ).bind(blobId, mimeType, company, approxBytes, b64Data, nowIso).run();
  return jsonResponse({ ok: true, id: blobId, storage: 'd1', sizeBytes: approxBytes });
}

export async function handleShowcaseLead(request, env, body) {
  if (!env || !env.DB) return jsonResponse({ ok: true, stored: false });
  const ipHash = await hashClientIp(request);
  const rl = await checkD1RateLimit(env, `leads:${ipHash}`, 5, 600);
  if (!rl.allowed) {
    return jsonResponse({ ok: false, error: 'Too many submissions. Please try again shortly.' }, 429);
  }
  const fullName = String((body && body.name) || '').trim().slice(0, 120);
  const contact = String((body && body.contact) || '').trim().slice(0, 140);
  if (!fullName || !contact) {
    return jsonResponse({ ok: false, error: 'Name and contact details are required.' }, 400);
  }
  await env.DB.prepare(
    `INSERT INTO isabi_leads (full_name, company_name, industry, scale, contact, notes, lang, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
  ).bind(
    fullName,
    String((body && body.company) || '').trim().slice(0, 140),
    String((body && body.industry) || '').trim().slice(0, 80),
    String((body && body.scale) || '').trim().slice(0, 80),
    contact,
    String((body && body.notes) || '').trim().slice(0, 2000),
    String((body && body.lang) || 'en').slice(0, 8),
    new Date().toISOString()
  ).run();
  return jsonResponse({ ok: true, stored: true });
}

export async function handleShowcaseLog(request, env, body) {
  if (!env || !env.DB) return jsonResponse({ ok: true });
  const ipHash = await hashClientIp(request);
  const rl = await checkD1RateLimit(env, `asklog:${ipHash}`, 30, 60);
  if (!rl.allowed) {
    return jsonResponse({ ok: false, error: 'Log rate limit exceeded.' }, 429);
  }
  await env.DB.prepare(
    `INSERT INTO ask_logs (surface, lang, industry, query, reply_title, ip_hash, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
  ).bind(
    String((body && body.surface) || 'showcase').slice(0, 32),
    String((body && body.lang) || 'en').slice(0, 8),
    String((body && body.industry) || '').slice(0, 48),
    String((body && body.q) || '').slice(0, 600),
    String((body && body.replyTitle) || '').slice(0, 200),
    ipHash,
    new Date().toISOString()
  ).run();
  return jsonResponse({ ok: true });
}
