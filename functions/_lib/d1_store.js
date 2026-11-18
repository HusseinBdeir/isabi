/**
 * ISABI Systems — Cloudflare D1 Relational SQLite + R2 Object Vault Engine
 * Full ACID multi-entity ledger, server-side RLS, optimistic CAS sync,
 * cross-network Phone QR Scan relay, and R2/D1 binary attachment vault.
 */

import {
  buildSessionCookie,
  canAccessCompany,
  canAccessGeoIndustrySession,
  canAccessSentinelScope,
  canEnterSite,
  canManageUsersSeat,
  canonEntityKey,
  canonGeoIndustryKey,
  canReviewSentinelsSession,
  canWriteGeoConfigSession,
  canWriteWorkSchedulesSession,
  checkD1RateLimit,
  checkSlidingRateLimit,
  clearSessionCookie,
  extractRequestSession,
  getSessionWritePerms,
  hashClientIp,
  hashSeatPin,
  isHashedPin,
  isOwnerOrFullGroupSession,
  isWeakPin,
  jsonResponse,
  mintDriverGateToken,
  parseAllowedCompanies,
  signEdgeSession,
  verifyActiveEdgeSession,
  verifyDriverGateToken,
  verifySeatPin
} from './security.js';
import { collectLegacyCandidates, scheduleLegacyIdHits, takeMfgLegacySignals } from './legacy_ids.js';
import { DEPLOYED_SHELL_VER } from './deployed_shell.js';
import { isWebPushConfigured, sendOverrideRequestPush } from './approval_push.js';
import { validateBase64MediaDataUrl } from './gemini.js';
import { invalidateMapsUsageMemCache, MAPS_QUOTA_RULE_IDS } from './google_maps.js';

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
  'sites', 'regions', 'equipment', 'drivers', 'staff_roles',
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

// Sent statement marks and the Owner's Rate Changes marks: who may change them (owner 2026-11-21).
// Same rule as the app (setStatementWatermark / clearStatementWatermark / canViewRateChanges) and as
// _guarded_workflow_mark_error in isabi-app/server.py. Checked only when a write changes the mark.
const STMT_SENT_MARK_RE = /^WF::statement_watermark::/i;
const RATE_CHANGE_OWNER_MARK_RE = /^WF::rate_change_(?:review|settings)::/i;

export function isGuardedWorkflowMarkKey(editKey) {
  const k = String(editKey || '');
  return STMT_SENT_MARK_RE.test(k) || RATE_CHANGE_OWNER_MARK_RE.test(k);
}

// The app reads `cleared` and `voided` as JavaScript truthy values (statementLockIndex): so does this check
function stmtMarkActiveThrough(obj) {
  if (!obj || typeof obj !== 'object' || obj.voided || obj.cleared) return '';
  const d = String(obj.confirmed_through || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
}

// What a mark locks: the party, its type, the industry and the company (the app files a mark under these fields,
// not under its key). Compared exactly as the app's norm() reads them (trim, lower case, inner spacing kept), so a
// re-mark that only re-types the company's case matches and any other difference counts as another party.
function stmtMarkIdentity(obj) {
  const o = obj && typeof obj === 'object' ? obj : {};
  const n = v => String(v == null ? '' : v).trim().toLowerCase();
  const co = n(o.company);
  const allCo = !co || co === 'all' || co === 'group' || co === 'all companies' || co === 'consolidated' || co === 'manufacturing-group' || /group$/.test(co);
  return [n(o.party_name), n(o.party_type) === 'supplier' ? 'supplier' : 'customer', n(o.industry) || 'manufacturing', allCo ? 'all' : co].join('|');
}

// '' when the seat may make this change to the mark, else the refusal text. nextObj null = removed.
export function guardedWorkflowMarkError(editKey, prevObj, nextObj, perms) {
  const k = String(editKey || '');
  const p = perms || {};
  if (RATE_CHANGE_OWNER_MARK_RE.test(k)) {
    return p.roleKey === 'Full Access (Owner)' ? '' : 'Only the Owner can review rate changes or change the alert amount.';
  }
  if (STMT_SENT_MARK_RE.test(k)) {
    if (!p.modifyData && !p.voidData) return 'Only a finance or supervisor seat can mark a statement as sent.';
    if (p.voidData) return '';
    const was = stmtMarkActiveThrough(prevObj);
    if (!was) return '';
    const now = nextObj ? stmtMarkActiveThrough(nextObj) : '';
    // Removing it, moving it earlier, or filing it under another party or company all free the records it locks
    if (!now || now < was || stmtMarkIdentity(prevObj) !== stmtMarkIdentity(nextObj)) {
      return 'Only a supervisor can remove a sent mark or move it to an earlier date.';
    }
  }
  return '';
}

// /sync: a change to one of these marks the seat may not make keeps the stored mark (a new one is dropped). The
// stored mark is the D1 row and the copy in the sync document (`d1Map`, edit key -> row object): the change must pass
// against both (POST /industry_domain_store writes only the table), and the later of the two is put back.
export function enforceGuardedWorkflowMarksOnSync(incomingDoc, prevDoc, perms, d1Map = null) {
  if (!incomingDoc || typeof incomingDoc !== 'object') return incomingDoc;
  const prevIre = (prevDoc && prevDoc.industryRowEdits && typeof prevDoc.industryRowEdits === 'object') ? prevDoc.industryRowEdits : {};
  // A save that leaves the row edits out would store the document without them, and the table copy would then drop
  // every mark: for any seat but the Owner, a missing store means unchanged
  if ((!incomingDoc.industryRowEdits || typeof incomingDoc.industryRowEdits !== 'object')) {
    if ((perms || {}).roleKey === 'Full Access (Owner)') return incomingDoc;
    if (Object.keys(prevIre).length) incomingDoc.industryRowEdits = Object.assign({}, prevIre);
    else return incomingDoc;
  }
  const inc = incomingDoc.industryRowEdits;
  const dm = d1Map instanceof Map ? d1Map : new Map();
  const keys = new Set([...Object.keys(prevIre), ...Object.keys(inc), ...dm.keys()]);
  for (const ek of keys) {
    if (!isGuardedWorkflowMarkKey(ek)) continue;
    const kv = prevIre[ek] && typeof prevIre[ek] === 'object' ? prevIre[ek] : null;
    const db = dm.get(ek) || null;
    const iv = inc[ek] && typeof inc[ek] === 'object' ? inc[ek] : null;
    const bases = [db, kv].filter(Boolean);
    if (!bases.length && !iv) continue;
    if (iv && bases.length && bases.every(b => stableRowSig(b) === stableRowSig(iv))) continue;
    const refused = bases.length
      ? bases.some(b => guardedWorkflowMarkError(ek, b, iv, perms))
      : Boolean(guardedWorkflowMarkError(ek, null, iv, perms));
    if (!refused) continue;
    const keep = bases.length ? pickSyncBase(db, kv) : null;
    if (keep) inc[ek] = keep;
    else delete inc[ek];
  }
  return incomingDoc;
}

// The same, reading the D1 rows of every guarded key first
export async function enforceGuardedWorkflowMarksOnSyncDb(db, incomingDoc, prevDoc, perms) {
  const d1Map = new Map();
  if (db && incomingDoc && typeof incomingDoc === 'object') {
    try {
      const res = await db.prepare("SELECT edit_key, voided, payload_json FROM industry_row_edits WHERE edit_key LIKE 'WF::statement_watermark::%' OR edit_key LIKE 'WF::rate_change_%'").all();
      for (const r of (res && res.results) || []) {
        const ek = String(r.edit_key || '');
        if (!isGuardedWorkflowMarkKey(ek)) continue;
        const obj = safeJsonParse(r.payload_json, {});
        if (Number(r.voided || 0)) obj.voided = true;
        d1Map.set(ek, obj);
      }
    } catch (_) {}
  }
  return enforceGuardedWorkflowMarksOnSync(incomingDoc, prevDoc, perms, d1Map);
}

function createPurgeOverrideAccumulator() {
  const list = [];
  const bareSeen = new Set();
  const timedBest = new Map();
  const parse = (rawItem) => {
    const s = String(rawItem || '').trim();
    if (!s || !LEGACY_PURGED_ENTRY_RE.test(s)) return null;
    const atIdx = s.indexOf('@');
    if (atIdx < 0) return { s, base: s, ms: 0, bare: true };
    const ms = _purgeStampMs(s.slice(atIdx + 1));
    if (!ms) return null;
    return { s, base: s.slice(0, atIdx), ms, bare: false };
  };
  return {
    parse,
    wouldSkip(parsed) {
      if (!parsed) return true;
      if (parsed.bare) return bareSeen.has(parsed.s);
      const prevEntry = timedBest.get(parsed.base);
      return Boolean(prevEntry && parsed.ms <= prevEntry.ms);
    },
    pushParsed(parsed) {
      if (!parsed) return false;
      if (parsed.bare) {
        if (bareSeen.has(parsed.s)) return false;
        bareSeen.add(parsed.s);
        list.push(parsed.s);
        return true;
      }
      const prevEntry = timedBest.get(parsed.base);
      if (!prevEntry) {
        timedBest.set(parsed.base, { idx: list.length, ms: parsed.ms });
        list.push(parsed.s);
        return true;
      }
      if (parsed.ms > prevEntry.ms) {
        list[prevEntry.idx] = null;
        prevEntry.idx = list.length;
        prevEntry.ms = parsed.ms;
        list.push(parsed.s);
        return true;
      }
      return false;
    },
    finalize(limit = 2000) {
      const active = list.filter(Boolean);
      return active.length > limit ? active.slice(-limit) : active;
    }
  };
}

// The store's minShellVer is a floor: every push stamps the pusher's own shell version, so an older device would
// otherwise lower it again and the devices reading after it would never be nudged to update. Keep the higher value,
// capped at the shell this deploy serves (DEPLOYED_SHELL_VER): any seat can push, so without the cap one bad value
// (say 9999.0) would stick for good; with it, a stored value above the deployed shell comes back down on the next
// push and is never served (capMinShellVerForRead).
const SHELL_VER_RE = /^\d{1,4}(?:\.\d{1,6}){0,3}$/;
export const MIN_SYNC_SHELL_VER = '19.6.373';
export function compareShellVer(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}
export function effectiveMinSyncShellVer(ceiling = DEPLOYED_SHELL_VER) {
  const cap = SHELL_VER_RE.test(String(ceiling || '')) ? String(ceiling) : '';
  if (cap && compareShellVer(MIN_SYNC_SHELL_VER, cap) > 0) return cap;
  return MIN_SYNC_SHELL_VER;
}
export function holdMinShellVer(doc, prevDoc = null, ceiling = DEPLOYED_SHELL_VER) {
  if (!doc || typeof doc !== 'object') return doc;
  const inc = SHELL_VER_RE.test(String(doc.minShellVer || '')) ? String(doc.minShellVer) : '';
  const prev = prevDoc && SHELL_VER_RE.test(String(prevDoc.minShellVer || '')) ? String(prevDoc.minShellVer) : '';
  let keep = !inc ? prev : (!prev ? inc : (compareShellVer(inc, prev) >= 0 ? inc : prev));
  const cap = SHELL_VER_RE.test(String(ceiling || '')) ? String(ceiling) : '';
  if (keep && cap && compareShellVer(keep, cap) > 0) keep = cap;
  if (keep) doc.minShellVer = keep;
  else delete doc.minShellVer;
  return doc;
}
// A served copy of the store never carries a minShellVer above the deployed shell (nothing is written).
export function capMinShellVerForRead(doc, ceiling = DEPLOYED_SHELL_VER) {
  if (doc && typeof doc === 'object' && doc.minShellVer) holdMinShellVer(doc, null, ceiling);
  return doc;
}

const LEGACY_PURGED_ENTRY_RE = /^[a-z_]+:(?:(?:(?:st|rp|fi|ex|exi|oil|rc|sp|sa|at|em|ls|cv|dt)\d+|wbmalf-wtc-\d+|wbrecur-(?:wtc|bbc)-\d+|dv-(?:hld|ins)-(?:exp|sal|set|rec)-\d+)(?:-i\d+)?(?:@\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z)?|(?:(?:st|rp|fi|ex|exi|oil|rc|sp|sa|at|em|ls|cv|dt)_[0-9a-f]{10,16}|wbmalf-[a-z0-9-]+|wbrecur-[a-z0-9-]+|dv-(?:hld|ins)-(?:exp|sal|set|rec)-[0-9a-f]{8,16})(?:-i\d+)?@\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z)$/;

function _purgeStampMs(s) {
  const v = String(s || '').trim();
  if (!v) return 0;
  const ms = Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v) ? v.replace(' ', 'T') + 'Z' : v);
  return Number.isFinite(ms) ? ms : 0;
}

function _recPurgeMs(r) {
  if (!r || typeof r !== 'object') return 0;
  return Math.max(
    _purgeStampMs(r.modified_at),
    _purgeStampMs(r.updated_at),
    _purgeStampMs(r.price_entered_at),
    _purgeStampMs(r.salary_entered_at),
    _purgeStampMs(r.restored_at),
    _purgeStampMs(r.voided_at),
    _purgeStampMs(r.entered_at),
    _purgeStampMs(r._updatedAt),
    _purgeStampMs(r._createdAt)
  );
}

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
  const purgeAcc = createPurgeOverrideAccumulator();
  for (const src of [prevDoc && prevDoc._purgedOverrideIds, doc._purgedOverrideIds]) {
    if (!Array.isArray(src)) continue;
    for (const item of src) purgeAcc.pushParsed(purgeAcc.parse(item));
  }
  const activePurged = purgeAcc.finalize(2000);
  if (activePurged.length) {
    doc._purgedOverrideIds = activePurged;
    const bareSet = new Set();
    const timedMap = new Map();
    for (const entry of doc._purgedOverrideIds) {
      const atIdx = entry.indexOf('@');
      if (atIdx < 0) bareSet.add(entry);
      else {
        const base = entry.slice(0, atIdx);
        const ms = _purgeStampMs(entry.slice(atIdx + 1));
        if (ms && (!timedMap.has(base) || ms > timedMap.get(base))) timedMap.set(base, ms);
      }
    }
    const cr = doc.customRecords;
    if (cr && typeof cr === 'object') {
      for (const k of Object.keys(cr)) {
        if (Array.isArray(cr[k])) {
          cr[k] = cr[k].filter(r => {
            if (!r || r._reopenedExplicitly) return true;
            const key = `${k}:${String(r.id == null ? '' : r.id).trim()}`;
            if (bareSet.has(key)) return false;
            if (timedMap.has(key)) return _recPurgeMs(r) > timedMap.get(key);
            return true;
          });
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
  'bdeir holding · consolidated jv': 'Bdeir Holding',
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

const POS_SEED_ID_RE = /^(?:(?:st|rp|fi|ex|exi|oil|rc|sp|sa|at|em|ls|cv|dt)(?:\d+|_[0-9a-f]{10,16})|wbmalf-[a-z0-9-]+|wbrecur-[a-z0-9-]+|dv-(?:hld|ins)-(?:exp|sal|set|rec)-(?:\d+|[0-9a-f]{8,16}))(?:-i\d+)?$/;
const LEGACY_POS_SEED_ID_RE = /^(?:(?:st|rp|fi|ex|exi|oil|rc|sp|sa|at|em|ls|cv|dt)\d+|wbmalf-wtc-\d+|wbrecur-(?:wtc|bbc)-\d+|dv-(?:hld|ins)-(?:exp|sal|set|rec)-\d+)(?:-i\d+)?$/;

export function canonicalizeCompanyName(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const k = s.toLowerCase().replace(/\s+/g, ' ');
  if (CANON_COMPANY_MAP[k]) return CANON_COMPANY_MAP[k];
  if (k.includes('·')) {
    const head = k.split('·')[0].trim();
    if (CANON_COMPANY_MAP[head]) return CANON_COMPANY_MAP[head];
  }
  return s;
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

const TABLE_COLS_BY_DB = new WeakMap();

async function getTableColumns(db, table) {
  let perDb = (db && typeof db === 'object') ? TABLE_COLS_BY_DB.get(db) : null;
  if (!perDb && db && typeof db === 'object') {
    perDb = new Map();
    TABLE_COLS_BY_DB.set(db, perDb);
  }
  if (perDb && perDb.has(table)) return perDb.get(table);
  let res = await db.prepare(`PRAGMA table_info(${table})`).all();
  let cols = new Set((res.results || []).map(r => String(r.name)));
  if (table === 'staff_members' && cols.size > 0) {
    const staffExtraCols = [
      'father_name', 'father_name_ar', 'full_name_ar',
      'mother_name', 'mother_name_ar',
      'nationality_ar', 'id_doc_kind',
      'nssf_no', 'id_expiry_date',
      'work_permit_no', 'work_permit_expiry',
      'residency_no', 'residency_expiry',
      'renewal_status', 'renewal_receipt_no', 'renewal_submitted_date'
    ];
    let addedCol = false;
    for (const colName of staffExtraCols) {
      if (!cols.has(colName)) {
        try {
          await db.prepare(`ALTER TABLE staff_members ADD COLUMN ${colName} TEXT DEFAULT ''`).run();
          addedCol = true;
        } catch (_) {}
      }
    }
    if (addedCol) {
      res = await db.prepare(`PRAGMA table_info(${table})`).all();
      cols = new Set((res.results || []).map(r => String(r.name)));
    }
  }
  if (table === 'phone_scan_sessions' && cols.size > 0 && !cols.has('meta_json')) {
    try {
      await db.prepare("ALTER TABLE phone_scan_sessions ADD COLUMN meta_json TEXT DEFAULT '{}'").run();
      res = await db.prepare(`PRAGMA table_info(${table})`).all();
      cols = new Set((res.results || []).map(r => String(r.name)));
    } catch (_) {}
  }
  if (perDb && cols.size > 0) perDb.set(table, cols);
  return cols;
}

const SAME_NAME_CANON_CO_FALLBACK = {
  wtc: 'WTC',
  'western trading': 'WTC',
  'western trading co': 'WTC',
  bbco: 'BBConstruction',
  bbconstruction: 'BBConstruction',
  'bdeir building': 'BBConstruction',
  'lions transport': 'Lions Transport',
  lions: 'Lions Transport',
  'la una': 'La Una',
  launa: 'La Una',
  blanca: 'Blanca',
  palms: 'Palms',
  voile: 'Voile',
  platinum: 'Platinum',
  'korri auto': 'Korri Auto',
  korri: 'Korri Auto',
  shacman: 'Shacman',
  properties: 'Properties',
  'bdeir holding': 'Bdeir Holding',
  holding: 'Bdeir Holding',
  'insurance company': 'Insurance Company',
  insurance: 'Insurance Company'
};

function _sameNameKey(v) {
  return String(v || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function _sameNameCanonCo(raw) {
  const s = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!s) return '';
  const low = s.toLowerCase();
  if (typeof CANON_COMPANY_MAP === 'object' && CANON_COMPANY_MAP) {
    if (Object.prototype.hasOwnProperty.call(CANON_COMPANY_MAP, s)) return CANON_COMPANY_MAP[s];
    if (Object.prototype.hasOwnProperty.call(CANON_COMPANY_MAP, low)) return CANON_COMPANY_MAP[low];
  }
  return Object.prototype.hasOwnProperty.call(SAME_NAME_CANON_CO_FALLBACK, low) ? SAME_NAME_CANON_CO_FALLBACK[low] : s;
}

const _INACTIVE_STAFF_STATUSES = new Set(['ended', 'closed', 'terminated', 'inactive', 'cancelled']);

function _isEmpActiveOnDate(emp, refDate) {
  if (!emp || typeof emp !== 'object' || emp.voided || Number(emp.voided) === 1 || emp.archived) return false;
  const st = String(emp.status || 'Active').trim().toLowerCase();
  if (_INACTIVE_STAFF_STATUSES.has(st)) return false;
  const ed = String(emp.end_date || '').trim().slice(0, 10);
  if (ed && refDate && ed < refDate) return false;
  return true;
}

async function _loadD1SameNameRows(db, table) {
  const out = new Map();
  if (!db) return out;
  try {
    const cols = await getTableColumns(db, table);
    if (!cols.size) return out;
    const want = ['id', 'name', 'staff', 'company', 'status', 'type', 'start_date', 'end_date', 'voided', 'archived', 'father_name', 'payload_json']
      .filter(c => cols.has(c));
    if (!want.length) return out;
    const whereVoid = cols.has('voided') ? ' WHERE COALESCE(voided, 0) = 0' : '';
    const res = await db.prepare(`SELECT ${want.join(', ')} FROM ${table}${whereVoid} LIMIT 8000`).all();
    for (const r of (res.results || [])) {
      let obj = {};
      if (r.payload_json && typeof r.payload_json === 'string') {
        try {
          const p = JSON.parse(r.payload_json);
          if (p && typeof p === 'object') obj = p;
        } catch (_) {}
      }
      for (const c of want) {
        if (c === 'payload_json') continue;
        if (r[c] !== undefined && r[c] !== null && (obj[c] === undefined || obj[c] === '' || c === 'voided' || c === 'id' || c === 'company')) {
          obj[c] = r[c];
        }
      }
      const rid = String(obj.id || r.id || '').trim();
      if (rid && !obj.voided && Number(obj.voided) !== 1) out.set(rid, obj);
    }
  } catch (_) {}
  return out;
}

async function checkSameNameRecordConflict(db, table, record, opts = {}) {
  if (table !== 'employments' && table !== 'freelance_entries' && table !== 'staff_members') return null;
  if (!record || typeof record !== 'object' || record.voided || Number(record.voided) === 1) return null;

  const recId = String(record.id || '').trim();
  const staffRaw = table === 'staff_members'
    ? String(record.name || record.staff || '').trim()
    : String(record.staff || record.name || '').trim();
  const staffK = _sameNameKey(staffRaw);
  if (!staffK) return null;

  const todayIso = new Date().toISOString().slice(0, 10);
  const refDate = String(record.start_date || record.date || todayIso).trim().slice(0, 10) || todayIso;

  if (table === 'staff_members') {
    if (record.archived || _INACTIVE_STAFF_STATUSES.has(String(record.status || '').trim().toLowerCase())) return null;
  } else {
    if (!_isEmpActiveOnDate(record, todayIso) && !_isEmpActiveOnDate(record, refDate)) return null;
  }

  const rawCo = String(record.company || '').trim();
  const canonCo = table === 'staff_members'
    ? (rawCo ? _sameNameCanonCo(rawCo) : '')
    : _sameNameCanonCo(rawCo || 'WTC');
  const coK = canonCo ? _sameNameKey(canonCo) : '';

  const overlay = opts.overlayByTable || null;
  const rowsFor = async (tbl) => {
    const merged = (opts.preloaded && opts.preloaded[tbl])
      ? new Map(opts.preloaded[tbl])
      : await _loadD1SameNameRows(db, tbl);
    if (overlay && overlay[tbl]) {
      for (const [kId, vRow] of overlay[tbl].entries()) {
        if (vRow === null) merged.delete(kId);
        else merged.set(kId, vRow);
      }
    }
    return merged;
  };

  const curMap = await rowsFor(table);
  const orig = opts.origOverride !== undefined ? opts.origOverride : (recId ? curMap.get(recId) : null);
  if (orig && typeof orig === 'object' && !orig.voided && Number(orig.voided) !== 1) {
    const origStaff = table === 'staff_members'
      ? String(orig.name || orig.staff || '').trim()
      : String(orig.staff || orig.name || '').trim();
    const origCo = String(orig.company || (table === 'staff_members' ? '' : 'WTC')).trim();
    const origCoK = origCo ? _sameNameKey(_sameNameCanonCo(origCo)) : '';
    if (_sameNameKey(origStaff) === staffK && origCoK === coK) {
      if (orig.pending_salary || orig.salary_pending) return null;
      if (table === 'staff_members') {
        const origWasActive = !orig.archived && !_INACTIVE_STAFF_STATUSES.has(String(orig.status || 'Active').trim().toLowerCase());
        if (origWasActive || record.same_person_confirmed === true) return null;
      } else {
        const recordIsActiveNow = _isEmpActiveOnDate(record, todayIso);
        const origWasActive = _isEmpActiveOnDate(orig, todayIso) && _isEmpActiveOnDate(orig, refDate);
        if (!recordIsActiveNow || origWasActive || record.same_person_confirmed === true) return null;
      }
    }
  }

  const empMap = table === 'employments' ? curMap : await rowsFor('employments');
  const empRows = Array.from(empMap.values());
  const flMap = table === 'freelance_entries' ? curMap : await rowsFor('freelance_entries');
  const flRows = Array.from(flMap.values());
  const smMap = table === 'staff_members' ? curMap : await rowsFor('staff_members');
  const smRows = Array.from(smMap.values());

  const conflictPayload = (tblCo, existingName, existingKind) => ({
    ok: false,
    code: 'same_name_conflict',
    table,
    id: recId,
    conflictId: recId,
    staff: staffRaw,
    company: canonCo || tblCo,
    existing: String(existingName || staffRaw).trim(),
    existingKind,
    error: 'Duplicate active staff name blocked by server.'
  });

  if (table === 'staff_members') {
    for (const sm of smRows) {
      if (!sm || typeof sm !== 'object' || sm.voided || Number(sm.voided) === 1 || sm.archived) continue;
      if (String(sm.id || '').trim() === recId) continue;
      if (_INACTIVE_STAFF_STATUSES.has(String(sm.status || 'Active').trim().toLowerCase())) continue;
      if (_sameNameKey(sm.name || sm.staff) !== staffK) continue;
      const smCo = _sameNameCanonCo(sm.company || '');
      if (_sameNameKey(smCo) !== coK) continue;
      return conflictPayload(smCo, sm.name || sm.staff || staffRaw, 'staff');
    }

    const activeSameCoEmps = [];
    for (const e of empRows) {
      if (!e || typeof e !== 'object' || e.voided || Number(e.voided) === 1 || e.archived) continue;
      if (String(e.id || '').trim() === recId) continue;
      if (_sameNameKey(e.staff || e.name) !== staffK) continue;
      const eCo = _sameNameCanonCo(e.company || 'WTC');
      if (_sameNameKey(eCo) !== coK) continue;
      if (_isEmpActiveOnDate(e, todayIso)) activeSameCoEmps.push([e, eCo]);
    }
    for (const fl of flRows) {
      if (!fl || typeof fl !== 'object' || fl.voided || Number(fl.voided) === 1 || fl.archived) continue;
      if (String(fl.id || '').trim() === recId) continue;
      if (_sameNameKey(fl.staff || fl.name) !== staffK) continue;
      const fCo = _sameNameCanonCo(fl.company || 'WTC');
      if (_sameNameKey(fCo) !== coK) continue;
      if (_isEmpActiveOnDate(fl, todayIso)) {
        activeSameCoEmps.push([Object.assign({}, fl, { type: fl.type || 'Freelance' }), fCo]);
      }
    }
    if (activeSameCoEmps.length > 0) {
      const enrolledEmpId = String(record.enrolled_emp_id || '').trim();
      const allSalaryPending = activeSameCoEmps.every(([e]) => Boolean(e.salary_pending || e.pending_salary));
      const allowSamePerson = record.same_person_confirmed === true
        || recId.startsWith('stf_seed_')
        || (Boolean(enrolledEmpId) && activeSameCoEmps.some(([e]) => String(e.id || '').trim() === enrolledEmpId))
        || allSalaryPending;
      if (!allowSamePerson) {
        const [e, eCo] = activeSameCoEmps[0];
        const kind = /freelance/i.test(String(e.type || '')) ? 'freelance' : 'contract';
        return conflictPayload(eCo, e.staff || e.name || staffRaw, kind);
      }
    }
    return null;
  }

  const isFreelance = table === 'freelance_entries' || /freelance/i.test(String(record.type || ''));
  if (record.same_person_confirmed === true) return null;

  let activeHit = null;
  let activeKind = 'contract';
  let hasAnyNonVoidedEmpInCo = false;
  let hasAnyNonVoidedFlInCo = false;

  for (const e of empRows) {
    if (!e || typeof e !== 'object' || e.voided || Number(e.voided) === 1) continue;
    if (String(e.id || '').trim() === recId) continue;
    if (_sameNameKey(e.staff || e.name) !== staffK) continue;
    const eCo = _sameNameCanonCo(e.company || 'WTC');
    if (_sameNameKey(eCo) !== coK) continue;
    hasAnyNonVoidedEmpInCo = true;
    const eIsFl = /freelance/i.test(String(e.type || ''));
    if (eIsFl) hasAnyNonVoidedFlInCo = true;
    if (isFreelance && eIsFl) continue;
    if (!activeHit && _isEmpActiveOnDate(e, refDate)) {
      activeHit = e;
      activeKind = eIsFl ? 'freelance' : 'contract';
    }
  }

  if (!activeHit && !isFreelance) {
    for (const fl of flRows) {
      if (!fl || typeof fl !== 'object' || fl.voided || Number(fl.voided) === 1) continue;
      if (String(fl.id || '').trim() === recId) continue;
      if (_sameNameKey(fl.staff || fl.name) !== staffK) continue;
      const fCo = _sameNameCanonCo(fl.company || 'WTC');
      if (_sameNameKey(fCo) !== coK) continue;
      if (_isEmpActiveOnDate(fl, refDate)) {
        activeHit = fl;
        activeKind = 'freelance';
        break;
      }
    }
  }

  if (isFreelance && !hasAnyNonVoidedFlInCo) {
    for (const fl of flRows) {
      if (!fl || typeof fl !== 'object' || fl.voided || Number(fl.voided) === 1) continue;
      if (String(fl.id || '').trim() === recId) continue;
      if (_sameNameKey(fl.staff || fl.name) !== staffK) continue;
      const fCo = _sameNameCanonCo(fl.company || 'WTC');
      if (_sameNameKey(fCo) === coK) {
        hasAnyNonVoidedFlInCo = true;
        break;
      }
    }
  }

  // A roster-only staff_members profile (no contracts yet) blocks unconfirmed new employment/freelance entries
  // in the same company unless paired via enrolled_emp_id or a returning freelancer.
  if (!activeHit && !hasAnyNonVoidedEmpInCo && !(isFreelance && hasAnyNonVoidedFlInCo)) {
    for (const sm of smRows) {
      if (!sm || typeof sm !== 'object' || sm.voided || Number(sm.voided) === 1 || sm.archived) continue;
      const smId = String(sm.id || '').trim();
      if (smId === recId || smId.startsWith('stf_seed_') || sm.source === 'seed') continue;
      if (_INACTIVE_STAFF_STATUSES.has(String(sm.status || 'Active').trim().toLowerCase())) continue;
      if (String(sm.enrolled_emp_id || '').trim() === recId) continue;
      if (_sameNameKey(sm.name || sm.staff) !== staffK) continue;
      const smCo = _sameNameCanonCo(sm.company || '');
      if (!smCo || _sameNameKey(smCo) !== coK) continue;
      activeHit = sm;
      activeKind = 'staff';
      break;
    }
  }

  if (!activeHit) return null;
  if (isFreelance && activeKind === 'contract' && hasAnyNonVoidedFlInCo) return null;

  return conflictPayload(canonCo, activeHit.staff || activeHit.name || staffRaw, activeKind);
}

async function checkSameNameSyncPatchConflict(db, nextDoc, prevDoc) {
  const nextCr = (nextDoc && typeof nextDoc === 'object' && nextDoc.customRecords && typeof nextDoc.customRecords === 'object') ? nextDoc.customRecords : {};
  const prevCr = (prevDoc && typeof prevDoc === 'object' && prevDoc.customRecords && typeof prevDoc.customRecords === 'object') ? prevDoc.customRecords : {};
  const tables = ['employments', 'freelance_entries', 'staff_members'];
  const hasAny = tables.some(tbl => Array.isArray(nextCr[tbl]) && nextCr[tbl].length > 0);
  if (!hasAny) return null;

  const overlay = {};
  const preByTbl = {};
  for (const tbl of tables) {
    const m = await _loadD1SameNameRows(db, tbl);
    const pArr = Array.isArray(prevCr[tbl]) ? prevCr[tbl] : [];
    for (const pr of pArr) {
      if (pr && typeof pr === 'object' && pr.id) m.set(String(pr.id).trim(), pr);
    }
    preByTbl[tbl] = new Map(m);
    const nArr = Array.isArray(nextCr[tbl]) ? nextCr[tbl] : [];
    for (const nr of nArr) {
      if (nr && typeof nr === 'object' && nr.id) {
        const rid = String(nr.id).trim();
        if (preByTbl[tbl].has(rid)) m.set(rid, nr);
      }
    }
    overlay[tbl] = m;
  }

  for (const tbl of tables) {
    const nArr = Array.isArray(nextCr[tbl]) ? nextCr[tbl] : [];
    const pm = preByTbl[tbl];
    for (const rec of nArr) {
      if (!rec || typeof rec !== 'object' || !rec.id || rec.voided || Number(rec.voided) === 1) continue;
      const rid = String(rec.id).trim();
      const orig = pm.has(rid) ? pm.get(rid) : null;
      const conflict = await checkSameNameRecordConflict(db, tbl, rec, { overlayByTable: overlay, origOverride: orig });
      if (conflict) return conflict;
      overlay[tbl].set(rid, rec);
    }
  }
  return null;
}

function hydrateRowJson(row) {
  if (!row || typeof row !== 'object') return row;
  const base = safeJsonParse(row.payload_json, {});
  const merged = Object.assign({}, base, row);
  delete merged.payload_json;
  for (const jk of ['attachments', 'adj_windows', 'driver_rows', 'admin_overrides', '_seed_orig', '_subcategories', '_pre_void_orig', '_pre_void_edits']) {
    if (typeof merged[jk] === 'string' && /^[\[{]/.test(merged[jk].trim())) {
      merged[jk] = safeJsonParse(merged[jk], merged[jk]);
    }
  }
  if ('voided' in merged) merged.voided = Boolean(merged.voided);
  if ('_pinCleared' in merged) merged._pinCleared = Boolean(merged._pinCleared);
  if ('_reopenedExplicitly' in merged) merged._reopenedExplicitly = Boolean(merged._reopenedExplicitly);
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
  delete clean.pin_hash;
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
  delete d.pin_hash;
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
  if (!d.custom_perms || typeof d.custom_perms !== 'object' || Array.isArray(d.custom_perms) || !Object.keys(d.custom_perms).length) {
    d.custom_perms = null;
  }
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

// Anonymous Face ID probes (no email, no PIN) count on their own per-IP key, so a camera that keeps
// seeing an unknown face can never lock PIN sign-in for everyone behind the same office IP.
async function checkAuthLockout(db, ipHash, emailRaw, faceProbe = false) {
  if (!db || !ipHash) return { locked: false, retryAfterSec: 0 };
  const nowMs = Date.now();
  const emailClean = String(emailRaw || '').trim().toLowerCase();
  const keys = [`rl:lock_ip:${ipHash}`];
  if (faceProbe) keys.push(`rl:lock_face:${ipHash}`);
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

async function recordFaceProbeFailure(db, ipHash) {
  const memFace = checkSlidingRateLimit(`auth_fail_face:${ipHash}`, 5, 300000);
  if (!db || !ipHash) {
    return { throttled: !memFace.allowed, retryAfterSec: memFace.allowed ? 0 : 300 };
  }
  const nowMs = Date.now();
  try {
    const st = await bumpLockCounter(db, `rl:lock_face:${ipHash}`, LOCKOUT_WINDOW_MS, nowMs, new Date(nowMs).toISOString());
    const until = Number(st.lockedUntilMs || 0);
    return until > nowMs
      ? { throttled: true, retryAfterSec: Math.max(1, Math.ceil((until - nowMs) / 1000)) }
      : { throttled: false, retryAfterSec: 0 };
  } catch (_) {
    return { throttled: !memFace.allowed, retryAfterSec: memFace.allowed ? 0 : 300 };
  }
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

// opts.face: also clear the face-only key (a sign-in that verified a face);
// opts.keepIp: leave the office-wide IP key alone (a face-without-PIN sign-in must not reset PIN-guess throttling);
// opts.keepEmail: leave the seat's own PIN key alone (only a checked PIN may reset it).
async function clearAuthFailure(db, ipHash, emailRaw, opts = {}) {
  if (!db || !ipHash) return;
  const emailClean = String(emailRaw || '').trim().toLowerCase();
  const keys = [];
  if (!opts.keepIp) keys.push(`rl:lock_ip:${ipHash}`);
  if (opts.face) keys.push(`rl:lock_face:${ipHash}`);
  if (emailClean && !opts.keepEmail) keys.push(`rl:lock_em_ip:${ipHash}:${emailClean}`);
  if (!keys.length) return;
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
  // Any Face ID request that is not a step-up (sign-in screen, enrolment check, with or without an email or
  // a PIN): misses count on the face-only key, so faces in front of a camera can never lock PIN sign-in for
  // the office IP. (Named for the common case; a Face ID + PIN request counts here too.)
  const isFaceNoPin = Boolean(isFaceMethod && !(body && body.step_up === true));
  // Face ID with no email and no PIN (anonymous probe): the answer never says which seat matched or why.
  const isFaceProbe = Boolean(isFaceNoPin && !email && !pin && !(body && body.verify_only === true));

  const lockState = await checkAuthLockout(env.DB, ipHash, email, isFaceNoPin);
  if (lockState.locked) {
    return jsonResponse({
      ok: false,
      rate_limited: true,
      retry_after_sec: lockState.retryAfterSec,
      error: `Too many failed sign-in attempts. Please wait ${Math.max(1, Math.ceil(lockState.retryAfterSec / 60))} minute(s).`
    }, 429, { 'Retry-After': String(lockState.retryAfterSec) });
  }

  let row = null;
  // opts.pinMiss: a wrong PIN ALWAYS counts on the PIN keys (IP + email), whatever the method, so a
  // `Face ID + PIN 2FA` request can never move PIN guessing onto the face key that face sign-ins reset.
  const failAuth = async (errMsg, status = 401, opts = {}) => {
    const res = (isFaceNoPin && !opts.pinMiss)
      ? await recordFaceProbeFailure(env.DB, ipHash)
      : await recordAuthFailure(env.DB, ipHash, email || (row && row.email) || '');
    if (isFaceProbe && !res.throttled) {
      // Never tell an anonymous face probe which seat it matched or why it was refused.
      return jsonResponse({ ok: false, error: 'Face ID not recognized.' }, 401);
    }
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
  } else if (isFaceMethod && isValidFaceVec(faceDesc) && (!isVerifyOnly || callerSess)) {
    // Face ID or PIN (owner decision 2026-11-12): Face ID alone may sign in without a typed email,
    // so the seat is identified 1:N against every active enrolled seat with a clear margin.
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
  // The seat was found by face (no email in the request) and a PIN is about to be checked: the seat's own
  // PIN lock must hold here too, or leaving out the email would skip it.
  if (!email && pin && !String(row.email || '').trim()) {
    // A seat without an email has no PIN key to throttle on: never check its PIN through the face lookup.
    return failAuth('Invalid email or Access PIN.', 401, { pinMiss: true });
  }
  if (!email && pin && row.email) {
    const seatLock = await checkAuthLockout(env.DB, ipHash, row.email, false);
    if (seatLock.locked) {
      return jsonResponse({
        ok: false,
        rate_limited: true,
        retry_after_sec: seatLock.retryAfterSec,
        error: `Too many failed sign-in attempts. Please wait ${Math.max(1, Math.ceil(seatLock.retryAfterSec / 60))} minute(s).`
      }, 429, { 'Retry-After': String(seatLock.retryAfterSec) });
    }
  }

  const wsFaceSettings = await readWorkspaceFaceSettings(env.DB);
  // No default PIN: a seat with no PIN on file cannot pass a PIN check until an Owner sets one.
  const expectedPin = String(row.pin_code || '').trim();
  const hasEnrolledBio = safeJsonParse(row.face_samples, []).some(isValidFaceVec);
  const authMode = resolveServerSeatAuthMode(row, wsFaceSettings, hasEnrolledBio);
  // Face ID or PIN, never both (owner decision 2026-11-12): under `either` a verified Face ID alone
  // signs in, and a PIN alone signs in. Only a seat or workspace set to `both` still asks for the two.
  const needsTwoFactor = (authMode === 'both' && hasEnrolledBio) || /2fa/i.test(method);
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
  // Only a sign-in whose PIN was actually checked resets the office-wide IP lock (a dummy PIN sent with
  // an `either` face is never checked, so it must not reset anything).
  let pinVerified = false;

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
          // The face itself was verified above, so this is not a failed attempt: nothing is counted
          // (a `both` seat signing in face-first must never build up a lock). The PIN step that follows
          // is counted as usual.
          const pinReqOut = {
            ok: false,
            two_factor_pin_required: true,
            error: 'Two-factor Access PIN is required.'
          };
          // An anonymous face probe never learns which seat it matched.
          if (!isFaceProbe || callerSess) pinReqOut.email = row.email;
          if (callerSess) {
            pinReqOut.full_name = row.full_name;
            pinReqOut.user = hydrateUserRow(row, true, true);
          }
          return jsonResponse(pinReqOut, isStepUp ? 403 : 401);
        }
        const pinCheck = await verifySeatPin(pin, expectedPin);
        if (!pinCheck.ok) {
          if (isStepUp) {
            // A wrong step-up PIN is counted too (it used to be free to retry).
            const rl = await recordAuthFailure(env.DB, ipHash, row.email || '');
            if (rl.throttled) {
              return jsonResponse({
                ok: false,
                rate_limited: true,
                retry_after_sec: rl.retryAfterSec,
                error: `Too many failed sign-in attempts. Please wait ${Math.max(1, Math.ceil(rl.retryAfterSec / 60))} minute(s).`
              }, 429, { 'Retry-After': String(rl.retryAfterSec) });
            }
            return jsonResponse({ ok: false, error: 'Two-factor Access PIN is required.' }, 403);
          }
          return failAuth('Two-factor Access PIN is required.', 401, { pinMiss: true });
        }
        pinUpgradeNeeded = pinCheck.needsUpgrade;
        pinVerified = true;
      }
    } else {
      if (authMode === 'face_only' && hasEnrolledBio) {
        return failAuth('This seat requires Face ID sign-in.');
      }
      const pinCheck = await verifySeatPin(pin, expectedPin);
      if (!pinCheck.ok) {
        return failAuth('Invalid email or Access PIN.');
      }
      pinUpgradeNeeded = pinCheck.needsUpgrade;
      pinVerified = true;
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
    await clearAuthFailure(env.DB, ipHash, row.email, { face: verifiedFaceDist !== null, keepIp: !pinVerified && verifiedFaceDist !== null, keepEmail: !pinVerified && verifiedFaceDist !== null });
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
      stmts: row.statements_access || 'full',
      ws_write: canWriteWorkSchedulesSession({
        sub: row.id,
        id: row.id,
        role: row.role,
        companies: row.companies,
        custom_perms: typeof row.custom_perms === 'string'
          ? safeJsonParse(row.custom_perms, row.custom_perms)
          : row.custom_perms
      })
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
    clearAuthFailure(env.DB, ipHash, row.email, { face: verifiedFaceDist !== null, keepIp: !pinVerified && !allowOwnerImpersonation, keepEmail: !pinVerified && !allowOwnerImpersonation })
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

// Web Push (functions/_lib/approval_push.js): tell eligible approvers about a new request, and close the
// notification once it is decided, cancelled or expired. Runs after the response (context.waitUntil), is a
// no-op until VAPID is configured (env vars or shared D1 keypair), and uses the same eligibility rule as the inbox above.
function dispatchOverridePush(context, env, reqRow, kind) {
  if (!reqRow || !isWebPushConfigured(env)) return null;
  const db = env.DB;
  const job = sendOverrideRequestPush(env, reqRow, kind, {
    isEligible: (approverRow, callerRow, r) => isEligibleOverrideApprover(approverRow, r, callerRow),
    loadUserRowById: (id) => loadUserRowById(db, id)
  }).catch(() => null);
  if (context && typeof context.waitUntil === 'function') {
    try { context.waitUntil(job); } catch (_) {}
  }
  return job;
}

async function sweepExpiredOverrideRequests(db, nowIso, context = null, env = null) {
  try {
    if (env && isWebPushConfigured(env)) {
      // Expire row by row so each approver's open notification can be closed (bounded per call).
      const res = await db.prepare(
        "SELECT * FROM override_requests WHERE status = 'pending' AND expires_at <= ?1 ORDER BY expires_at LIMIT 25"
      ).bind(nowIso).all();
      for (const row of (res.results || [])) {
        const r = await db.prepare("UPDATE override_requests SET status = 'expired' WHERE id = ?1 AND status = 'pending'").bind(row.id).run();
        if (r && r.meta && Number(r.meta.changes || 0) === 1) dispatchOverridePush(context, env, Object.assign({}, row, { status: 'expired' }), 'closed');
      }
    }
    await db.prepare("UPDATE override_requests SET status = 'expired' WHERE status = 'pending' AND expires_at <= ?1").bind(nowIso).run();
  } catch (_) {}
}

export async function handleOverrideRequests(request, env, session, body, url, context = null) {
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
      // The requester's wait poll is usually the first to see a request run out: close approvers' notifications.
      if (String(row.status || '') === 'pending' && effectiveOverrideStatus(row, nowIso) === 'expired' && isWebPushConfigured(env)) {
        await sweepExpiredOverrideRequests(db, nowIso, context, env);
      }
      return jsonResponse({ ok: true, request: publicOverrideRequest(row, nowIso) });
    }
    if (String(qp.get('status') || '').trim() === 'pending') {
      await sweepExpiredOverrideRequests(db, nowIso, context, env);
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
      await sweepExpiredOverrideRequests(db, nowIso, context, env);
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
    dispatchOverridePush(context, env, row, 'new');
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
      dispatchOverridePush(context, env, fresh || Object.assign({}, row, { status: 'cancelled' }), 'closed');
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
      dispatchOverridePush(context, env, after, 'closed');
      return jsonResponse({ ok: true, request: publicOverrideRequest(after, nowIso) });
    }
    const fresh = await db.prepare('SELECT * FROM override_requests WHERE id = ?1 LIMIT 1').bind(id).first();
    dispatchOverridePush(context, env, fresh || Object.assign({}, row, { status: 'denied' }), 'closed');
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

export async function prepareUpsertTableRecordStmt(db, table, record) {
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
  const exRow = await db.prepare(`SELECT id FROM ${canonTable} WHERE id = ?1 LIMIT 1`).bind(recId).first();
  if (UNIVERSAL_UNIQUE_TABLES.has(canonTable) && !record.voided && cols.has('name')) {
    const mainVal = String(record.name || record.item_name || record.driver || record.equipment || '').trim();
    if (canonTable === 'items' && !String(record.name || '').trim() && record.item_name) {
      record = Object.assign({}, record, { name: String(record.item_name).trim() });
    }
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
        if (!exRow && record.modified_by) {
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

  if (cols.has('name') && (record.name === undefined || record.name === null) && Boolean(record.voided)) {
    record = Object.assign({}, record, { name: '' });
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
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO ${canonTable} (${colNames.join(',')}) VALUES (${placeholders})`
  ).bind(...bindVals);
  return { ok: true, table: canonTable, id: recId, stmt };
}

export async function upsertTableRecord(db, table, record) {
  const prep = await prepareUpsertTableRecordStmt(db, table, record);
  if (!prep.ok) return prep;
  try {
    await prep.stmt.run();
  } catch (err) {
    return { ok: false, status: 400, error: String((err && err.message) || err) };
  }
  return { ok: true, table: prep.table, id: prep.id };
}

function generateRollbackToken() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return 'rbt_' + crypto.randomUUID().replace(/-/g, '');
    }
  } catch (_) {}
  return 'rbt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 14);
}

function getSessionActorKey(session) {
  return String((session && (session.email || session.id || session.user_id)) || '').trim().toLowerCase();
}

async function storeRollbackToken(db, entry) {
  if (!db || !entry || typeof entry !== 'object') return '';
  const token = generateRollbackToken();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const gcCutoffIso = new Date(nowMs - 5 * 60 * 1000).toISOString();
  const payload = Object.assign({}, entry, { expMs: nowMs + 60000 });
  try {
    await db.prepare("DELETE FROM edge_kv_store WHERE doc_key LIKE 'rb_tok_%' AND updated_at < ?1").bind(gcCutoffIso).run();
  } catch (_) {}
  await db.prepare(
    `INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, rev)
     VALUES (?1, ?2, ?3, 1)
     ON CONFLICT(doc_key) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at, rev = edge_kv_store.rev + 1`
  ).bind(`rb_tok_${token}`, JSON.stringify(payload), nowIso).run();
  return token;
}

async function takeRollbackToken(db, expectedKind, token, session) {
  const tok = String(token || '').trim();
  if (!/^rbt_[a-z0-9_-]{16,80}$/i.test(tok)) {
    return { ok: false, status: 400, error: 'Invalid rollback token.' };
  }
  const gcCutoffIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  try {
    await db.prepare("DELETE FROM edge_kv_store WHERE doc_key LIKE 'rb_tok_%' AND updated_at < ?1").bind(gcCutoffIso).run();
  } catch (_) {}
  const docKey = `rb_tok_${tok}`;
  const row = await db.prepare('SELECT payload_json FROM edge_kv_store WHERE doc_key = ?1').bind(docKey).first();
  if (!row || !row.payload_json) {
    return { ok: false, status: 404, error: 'Rollback token not found or already used.' };
  }
  const entry = safeJsonParse(row.payload_json, null);
  if (!entry || typeof entry !== 'object' || entry.kind !== expectedKind) {
    return { ok: false, status: 404, error: 'Rollback token is invalid for this endpoint.' };
  }
  const actorKey = getSessionActorKey(session);
  if (!actorKey || String(entry.actor || '') !== actorKey) {
    return { ok: false, status: 403, error: 'Rollback token belongs to another session.' };
  }
  await db.prepare('DELETE FROM edge_kv_store WHERE doc_key = ?1').bind(docKey).run();
  if (Date.now() > Number(entry.expMs || 0)) {
    return { ok: false, status: 409, error: 'Rollback token expired.' };
  }
  return { ok: true, entry };
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
    ? 'ORDER BY date DESC, rowid DESC'
    : (cols.has('start_date') ? 'ORDER BY start_date DESC, rowid DESC' : 'ORDER BY rowid DESC');

  const restrictRls = !isOwnerOrFullGroupSession(session);
  const isUnivGeoTable = table === 'sites' || table === 'regions';
  if (restrictRls) {
    if (company && companyNorm !== 'all' && companyNorm !== 'manufacturing-group' && !canAccessCompany(session, company)) {
      return jsonResponse({ ok: false, error: 'Row-level security: unauthorized entity scope.' }, 403);
    }
    if (companyNorm === 'manufacturing-group') {
      const mfgCosCheck = ['WTC', 'BBConstruction', 'Lions Transport'].filter(c => canAccessCompany(session, c));
      if (!mfgCosCheck.length) {
        return jsonResponse({ ok: false, error: 'Row-level security: unauthorized entity scope.' }, 403);
      }
    }
  }

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
    } else if (restrictRls) {
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
  } else if (restrictRls && isUnivGeoTable) {
    const rawAllowed = parseAllowedCompanies(session.companies).filter(c => c !== '*');
    if (!rawAllowed.length) {
      return jsonResponse({ ok: false, error: 'Row-level security: no permitted entities assigned.' }, 403);
    }
  }

  const deferLimitAfterHydration = Boolean(restrictRls && isUnivGeoTable);
  if (whereParts.length) sql += ` WHERE ${whereParts.join(' AND ')}`;
  if (deferLimitAfterHydration) {
    sql += ` ${orderClause}`;
  } else {
    binds.push(limit);
    sql += ` ${orderClause} LIMIT ?${binds.length}`;
  }

  let res = await env.DB.prepare(sql).bind(...binds).all();
  if (allowUnknownCaseFallback && (!res.results || res.results.length === 0)) {
    const fbSql = deferLimitAfterHydration
      ? `SELECT * FROM ${table} WHERE lower(company) = ?1 ${orderClause}`
      : `SELECT * FROM ${table} WHERE lower(company) = ?1 ${orderClause} LIMIT ?2`;
    res = deferLimitAfterHydration
      ? await env.DB.prepare(fbSql).bind(companyNorm).all()
      : await env.DB.prepare(fbSql).bind(companyNorm, limit).all();
  }
  let outRows = (res.results || []).map(r => hydrateRowJson(r));
  if (restrictRls && isUnivGeoTable) {
    outRows = outRows.filter(r => canAccessUniversalGeoRow(session, table, r)).slice(0, limit);
  }
  return jsonResponse({ ok: true, edge: true, table, rows: outRows });
}

function parseStrictGpsCoord(val, maxAbs = 180) {
  if (val === undefined || val === null) return { empty: true, ok: true, value: null };
  if (typeof val === 'boolean' || typeof val === 'object') return { empty: false, ok: false, value: null };
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return { empty: true, ok: true, value: null };
    const n = Number(trimmed);
    if (!Number.isFinite(n) || Math.abs(n) > maxAbs) return { empty: false, ok: false, value: null };
    return { empty: false, ok: true, value: Math.round(n * 1e6) / 1e6 };
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val) || Math.abs(val) > maxAbs) return { empty: false, ok: false, value: null };
    return { empty: false, ok: true, value: Math.round(val * 1e6) / 1e6 };
  }
  return { empty: false, ok: false, value: null };
}

function normGpsCoord(val, maxAbs = 180) {
  const p = parseStrictGpsCoord(val, maxAbs);
  return (p.ok && !p.empty) ? p.value : null;
}

function isValidLatLngPair(latVal, lngVal) {
  const la = parseStrictGpsCoord(latVal, 90);
  const ln = parseStrictGpsCoord(lngVal, 180);
  if (!la.ok || la.empty || !ln.ok || ln.empty) return false;
  return !(Math.abs(la.value) < 1e-4 && Math.abs(ln.value) < 1e-4);
}

const GPS_LAT_KEYS = ['latitude', 'geo_lat', 'lat', 'gps_lat', 'gpsLat'];
const GPS_LNG_KEYS = ['longitude', 'geo_lng', 'lng', 'lon', 'gps_lng', 'gpsLng'];
const GPS_CLEAR_KEYS = ['_pinCleared', 'pin_cleared', 'pinCleared'];
const ALL_GPS_KEYS = [...GPS_LAT_KEYS, ...GPS_LNG_KEYS, ...GPS_CLEAR_KEYS];
const REGION_ZONE_KEYS = ['center_lat', 'center_lng', 'radius_km', 'distance_km', 'shape_type', 'zone_type', 'zone_geojson'];

function validateRecordGpsCoords(obj) {
  if (!obj || typeof obj !== 'object') return true;
  for (const k of [...GPS_LAT_KEYS, 'center_lat']) {
    if (k in obj && !parseStrictGpsCoord(obj[k], 90).ok) return false;
  }
  for (const k of [...GPS_LNG_KEYS, 'center_lng']) {
    if (k in obj && !parseStrictGpsCoord(obj[k], 180).ok) return false;
  }
  const lngAlt = ('lng' in obj) ? 'lng' : 'lon';
  const pairs = [
    ['latitude', 'longitude'], ['geo_lat', 'geo_lng'],
    ['gps_lat', 'gps_lng'], ['gpsLat', 'gpsLng'],
    ['lat', lngAlt], ['center_lat', 'center_lng']
  ];
  for (const [lk, rk] of pairs) {
    if ((lk in obj) || (rk in obj)) {
      const la = parseStrictGpsCoord(obj[lk], 90);
      const ln = parseStrictGpsCoord(obj[rk], 180);
      const hasLa = !la.empty;
      const hasLn = !ln.empty;
      if (hasLa !== hasLn) return false;
      if (hasLa && hasLn && Math.abs(la.value) < 1e-4 && Math.abs(ln.value) < 1e-4) return false;
    }
  }
  const shapeType = String(obj.shape_type || obj.zone_type || '').trim().toLowerCase();
  const hasRadiusVal = ('radius_km' in obj) && obj.radius_km !== undefined && obj.radius_km !== null && String(obj.radius_km).trim() !== '';
  if (hasRadiusVal) {
    if (typeof obj.radius_km === 'boolean' || typeof obj.radius_km === 'object') return false;
    const rKm = Number(String(obj.radius_km).trim());
    if (!Number.isFinite(rKm) || rKm < 0 || rKm > 500) return false;
    if (shapeType === 'circle' && rKm <= 0) return false;
  } else if (shapeType === 'circle' && (('center_lat' in obj && !parseStrictGpsCoord(obj.center_lat, 90).empty) || ('lat' in obj && !parseStrictGpsCoord(obj.lat, 90).empty))) {
    return false;
  }
  return true;
}

function normalizedGpsPair(obj, latKey = 'latitude', lngKey = 'longitude') {
  if (!obj || typeof obj !== 'object') return [null, null];
  const la = normGpsCoord(obj[latKey], 90);
  const ln = normGpsCoord(obj[lngKey], 180);
  if (la !== null && ln !== null && Math.abs(la) < 1e-4 && Math.abs(ln) < 1e-4) {
    return [null, null];
  }
  return [la, ln];
}

function hasAnyGpsField(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const [la1, ln1] = normalizedGpsPair(obj, 'latitude', 'longitude');
  if (la1 !== null || ln1 !== null) return true;
  const [la2, ln2] = normalizedGpsPair(obj, 'geo_lat', 'geo_lng');
  if (la2 !== null || ln2 !== null) return true;
  const [la3, ln3] = normalizedGpsPair(obj, 'lat', 'lng');
  if (la3 !== null || ln3 !== null) return true;
  const [la4, ln4] = normalizedGpsPair(obj, 'lat', 'lon');
  if (la4 !== null || ln4 !== null) return true;
  const [la5, ln5] = normalizedGpsPair(obj, 'gps_lat', 'gps_lng');
  if (la5 !== null || ln5 !== null) return true;
  const [la6, ln6] = normalizedGpsPair(obj, 'gpsLat', 'gpsLng');
  if (la6 !== null || ln6 !== null) return true;
  for (const ck of GPS_CLEAR_KEYS) {
    if (Boolean(obj[ck])) return true;
  }
  return false;
}

function hasExplicitGpsKeyInPayload(obj) {
  if (!obj || typeof obj !== 'object') return false;
  return ALL_GPS_KEYS.some(k => (k in obj) && obj[k] !== undefined);
}

const VOID_META_KEYS = [
  'voided', 'voided_by', 'voidedBy', 'voided_by_email', 'voidedByEmail',
  'voided_at', 'voidedAt', 'void_reason', 'voidReason', 'void_snapshot',
  'voided_with_voucher', 'voided_with_parent', 'void_note_updated_by', 'void_note_updated_at',
  'twin_of', 'twin_difference'
];

const VOID_META_AND_GPS_SKIP_KEYS = new Set([
  ...VOID_META_KEYS,
  '_reopenedExplicitly',
  'restored_at', 'restoredAt', 'restored_by', 'restoredBy', 'restored_by_email', 'restoredByEmail',
  'modified_at', 'modifiedAt', 'modified_by', 'modifiedBy', 'updated_at', 'updatedAt',
  'rev', '_rev', '_revBumped', '_customRev', 'sync_source', 'payload_json',
  '_seed_orig', '_pre_void_orig', '_pre_void_edits', '_seedCatAuto', 'geo_zone', '_geoOrig', '_geoOrigInit', 'zone_shape',
  ...ALL_GPS_KEYS,
  ...REGION_ZONE_KEYS,
  'distance_km'
]);

const PIN_FILL_SKIP_KEYS = new Set([
  'printed', 'printed_at', 'last_printed_at', 'print_count',
  'modified_at', 'modifiedAt', 'modified_by', 'modifiedBy', 'updated_at', 'updatedAt',
  'entered_by', 'enteredBy', 'entered_at', 'enteredAt', 'source',
  'rev', '_rev', '_revBumped', '_customRev', 'sync_source', 'payload_json',
  '_seed_orig', '_pre_void_orig', '_pre_void_edits', '_seedCatAuto', 'geo_zone', '_geoOrig', '_geoOrigInit', 'zone_shape',
  ...ALL_GPS_KEYS
]);

function normFieldForVoidCmp(val) {
  if (val === undefined || val === null || val === '') return '';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : '';
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (Array.isArray(val)) return val.length === 0 ? '' : JSON.stringify(val);
  if (typeof val === 'object') {
    if (Object.keys(val).length === 0) return '';
    try { return JSON.stringify(val); } catch (_) { return String(val); }
  }
  const s = String(val).trim();
  if (s === '[]' || s === '{}') return '';
  return s;
}

function asStrictBoolOrNull(val) {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number' && (val === 0 || val === 1)) return val === 1;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    if (s === '1' || s === 'true') return true;
    if (s === '0' || s === 'false') return false;
  }
  return null;
}

function isZeroOrEmptyVoidDefault(val) {
  if (val === undefined || val === null || val === false || val === '' || val === '[]' || val === '{}') return true;
  if (typeof val === 'number') return Number.isFinite(val) && Math.abs(val) < 1e-9;
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === 'object') return Object.keys(val).length === 0;
  return false;
}

function fieldsEquivForVoidCmp(a, b) {
  if (isZeroOrEmptyVoidDefault(a) && isZeroOrEmptyVoidDefault(b)) return true;
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    const ba = asStrictBoolOrNull(a);
    const bb = asStrictBoolOrNull(b);
    return ba !== null && bb !== null && ba === bb;
  }
  return normFieldForVoidCmp(a) === normFieldForVoidCmp(b);
}

function hasNonVoidFieldChange(baseObj, nextObj) {
  if (!nextObj || typeof nextObj !== 'object') return false;
  const base = (baseObj && typeof baseObj === 'object') ? baseObj : {};
  for (const [k, v] of Object.entries(nextObj)) {
    if (VOID_META_AND_GPS_SKIP_KEYS.has(k)) continue;
    if (!(k in base) && isZeroOrEmptyVoidDefault(v)) continue;
    if (!fieldsEquivForVoidCmp(base[k], v)) return true;
  }
  return false;
}

function hasDisallowedPinFillFieldChange(baseObj, nextObj) {
  if (!nextObj || typeof nextObj !== 'object') return false;
  const base = (baseObj && typeof baseObj === 'object') ? baseObj : {};
  for (const [k, v] of Object.entries(nextObj)) {
    if (PIN_FILL_SKIP_KEYS.has(k)) continue;
    if (k === 'site_category' && Boolean(nextObj._seedCatAuto) && /^(customer|supplier)$/i.test(String(v || '').trim())) continue;
    if (k === 'voided') {
      if (Boolean(base.voided) !== Boolean(v)) return true;
      continue;
    }
    if (!(k in base) || base[k] === undefined || base[k] === null || base[k] === '') {
      const boolV = v === true || v === 1 || (typeof v === 'string' && /^(?:1|true|yes)$/i.test(v.trim()));
      if ((k === 'includes_transport' || k === 'is_jv' || k === 'jv') && !boolV) continue;
      if (k === 'haulage_mode') {
        const defHm = base.includes_transport ? 'supplier_delivered' : 'separate';
        if (v === undefined || v === null || String(v).trim() === '' || String(v).trim() === defHm) continue;
      }
      if (k === 'region' && String(v || '').trim() !== '') continue;
    }
    if (!(k in base) && (v === undefined || v === null || v === '')) continue;
    if (!fieldsEquivForVoidCmp(base[k], v)) return true;
  }
  return false;
}

function extractSiteLatLng(obj) {
  if (!obj || typeof obj !== 'object') return [null, null];
  let la = null;
  for (const k of ['latitude', 'lat', 'gps_lat', 'gpsLat']) {
    la = normGpsCoord(obj[k], 90);
    if (la !== null) break;
  }
  let ln = null;
  for (const k of ['longitude', 'lng', 'lon', 'gps_lng', 'gpsLng']) {
    ln = normGpsCoord(obj[k], 180);
    if (ln !== null) break;
  }
  if (la !== null && ln !== null && Math.abs(la) < 1e-4 && Math.abs(ln) < 1e-4) {
    return [null, null];
  }
  return [la, ln];
}

const SITE_ALIAS_LAT_KEYS = ['lat', 'gps_lat', 'gpsLat'];
const SITE_ALIAS_LNG_KEYS = ['lng', 'lon', 'gps_lng', 'gpsLng'];

function stripSiteAliasCoordKeys(targetObj) {
  if (!targetObj || typeof targetObj !== 'object') return targetObj;
  for (const ak of SITE_ALIAS_LAT_KEYS) delete targetObj[ak];
  for (const ak of SITE_ALIAS_LNG_KEYS) delete targetObj[ak];
  return targetObj;
}

function normalizeIncomingSiteCoordAliases(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const hasAlias = SITE_ALIAS_LAT_KEYS.some(k => (k in obj) && obj[k] !== undefined)
    || SITE_ALIAS_LNG_KEYS.some(k => (k in obj) && obj[k] !== undefined);
  if (!hasAlias) return obj;
  const out = Object.assign({}, obj);
  const hasCanonLat = ('latitude' in out) && out.latitude !== undefined && out.latitude !== null && String(out.latitude).trim() !== '';
  const hasCanonLng = ('longitude' in out) && out.longitude !== undefined && out.longitude !== null && String(out.longitude).trim() !== '';
  if (!hasCanonLat || !hasCanonLng) {
    let aLa = null;
    for (const lk of SITE_ALIAS_LAT_KEYS) {
      aLa = normGpsCoord(out[lk], 90);
      if (aLa !== null) break;
    }
    let aLn = null;
    for (const rk of SITE_ALIAS_LNG_KEYS) {
      aLn = normGpsCoord(out[rk], 180);
      if (aLn !== null) break;
    }
    if (aLa !== null && aLn !== null && !(Math.abs(aLa) < 1e-4 && Math.abs(aLn) < 1e-4)) {
      out.latitude = aLa;
      out.longitude = aLn;
    } else {
      const anyExplicitAliasNull = SITE_ALIAS_LAT_KEYS.some(k => (k in out) && (out[k] === null || out[k] === ''))
        && SITE_ALIAS_LNG_KEYS.some(k => (k in out) && (out[k] === null || out[k] === ''));
      if (anyExplicitAliasNull && !('latitude' in out) && !('longitude' in out)) {
        out.latitude = null;
        out.longitude = null;
      }
    }
  }
  return stripSiteAliasCoordKeys(out);
}

function applyCanonSiteLatLngAliases(targetObj, srcObj = null) {
  if (!targetObj || typeof targetObj !== 'object') return false;
  const [la, ln] = extractSiteLatLng(srcObj || targetObj);
  if (la === null || ln === null) return false;
  targetObj.latitude = la;
  targetObj.longitude = ln;
  stripSiteAliasCoordKeys(targetObj);
  return true;
}

function isInitialMissingSitePinFill(canonTable, baseObj, nextObj, perms) {
  if (canonTable !== 'sites') return false;
  if (!canEnterSite(perms)) return false;
  if (!baseObj || typeof baseObj !== 'object' || !nextObj || typeof nextObj !== 'object') return false;
  if (Boolean(baseObj.voided) || Boolean(nextObj.voided)) return false;
  if (baseObj._pinCleared || nextObj._pinCleared || baseObj.pin_cleared || nextObj.pin_cleared || baseObj.pinCleared || nextObj.pinCleared) return false;
  const [bLa, bLn] = extractSiteLatLng(baseObj);
  const [nLa, nLn] = extractSiteLatLng(nextObj);
  const baseHasPin = bLa !== null && bLn !== null;
  const nextHasPin = nLa !== null && nLn !== null;
  if (baseHasPin || !nextHasPin) return false;
  if (isValidLatLngPair(baseObj.geo_lat, baseObj.geo_lng)) return false;
  if (normGpsCoord(nextObj.geo_lat, 90) !== null || normGpsCoord(nextObj.geo_lng, 180) !== null) return false;
  return !hasDisallowedPinFillFieldChange(baseObj, nextObj);
}

function isInitialUnpinnedSitePinAddition(canonTable, baseObj, nextObj, perms) {
  if (canonTable !== 'sites') return false;
  if (!canEnterSite(perms) || !(perms && perms.modifyText)) return false;
  if (!baseObj || typeof baseObj !== 'object' || !nextObj || typeof nextObj !== 'object') return false;
  if (Boolean(baseObj.voided) || Boolean(nextObj.voided)) return false;
  if (baseObj._pinCleared || nextObj._pinCleared || baseObj.pin_cleared || nextObj.pin_cleared || baseObj.pinCleared || nextObj.pinCleared) return false;
  const [bLa, bLn] = extractSiteLatLng(baseObj);
  const [nLa, nLn] = extractSiteLatLng(nextObj);
  const baseHasPin = bLa !== null && bLn !== null;
  const nextHasPin = nLa !== null && nLn !== null;
  if (baseHasPin || !nextHasPin) return false;
  if (isValidLatLngPair(baseObj.geo_lat, baseObj.geo_lng)) return false;
  if (normGpsCoord(nextObj.geo_lat, 90) !== null || normGpsCoord(nextObj.geo_lng, 180) !== null) return false;
  return true;
}

function applyInitialMissingSitePinFill(baseObj, incObj, actorEmail = '') {
  const out = Object.assign({}, (baseObj && typeof baseObj === 'object') ? baseObj : {});
  const inc = (incObj && typeof incObj === 'object') ? incObj : {};
  applyCanonSiteLatLngAliases(out, inc);
  out._pinCleared = false;
  delete out.pin_cleared;
  delete out.pinCleared;
  if (!String(out.region || '').trim() && String(inc.region || '').trim()) {
    out.region = String(inc.region).trim();
  }
  const modBy = String(actorEmail || inc.modified_by || out.modified_by || '').trim();
  if (modBy) out.modified_by = modBy;
  const modAt = String(inc.modified_at || new Date().toISOString()).trim();
  if (modAt) out.modified_at = modAt;
  return out;
}

function hasGpsFieldMutation(baseObj, nextObj) {
  const a = (baseObj && typeof baseObj === 'object') ? baseObj : {};
  const b = (nextObj && typeof nextObj === 'object') ? nextObj : {};
  const [eALat, eALng] = extractSiteLatLng(a);
  const [eBLat, eBLng] = extractSiteLatLng(b);
  if (eALat !== eBLat || eALng !== eBLng) return true;
  for (const [lk, rk] of [['latitude', 'longitude'], ['geo_lat', 'geo_lng'], ['lat', 'lng'], ['lat', 'lon'], ['gps_lat', 'gps_lng'], ['gpsLat', 'gpsLng']]) {
    const [aL, aN] = normalizedGpsPair(a, lk, rk);
    const [bL, bN] = normalizedGpsPair(b, lk, rk);
    if (aL !== bL || aN !== bN) return true;
  }
  for (const ck of GPS_CLEAR_KEYS) {
    if (Boolean(a[ck]) !== Boolean(b[ck])) return true;
  }
  return false;
}

function restoreGpsFieldsFromBase(targetObj, baseObj) {
  if (!targetObj || typeof targetObj !== 'object') return targetObj;
  const base = (baseObj && typeof baseObj === 'object') ? baseObj : {};
  for (const k of ALL_GPS_KEYS) {
    if (k in base && base[k] !== undefined) targetObj[k] = base[k];
    else delete targetObj[k];
  }
  return targetObj;
}

function stripGpsFields(targetObj) {
  if (!targetObj || typeof targetObj !== 'object') return targetObj;
  for (const k of ALL_GPS_KEYS) {
    delete targetObj[k];
  }
  return targetObj;
}

function normRegionRadiusKm(val) {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'boolean' || typeof val === 'object') return null;
  const n = Number(String(val).trim());
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1000) / 1000;
}

function canonicalizeZoneJsonValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? Math.round(val * 1e6) / 1e6 : null;
  if (Array.isArray(val)) return val.map(canonicalizeZoneJsonValue);
  if (typeof val === 'object') {
    const out = {};
    for (const k of Object.keys(val).sort()) {
      if (val[k] !== undefined) out[k] = canonicalizeZoneJsonValue(val[k]);
    }
    return out;
  }
  return val;
}

function canonZoneGeoJsonSig(val) {
  if (val === undefined || val === null || val === '') return '';
  let parsed = val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return '';
    try {
      parsed = JSON.parse(trimmed);
    } catch (_) {
      return trimmed;
    }
  }
  if (!parsed) return '';
  if (Array.isArray(parsed) && parsed.length === 0) return '';
  if (typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length === 0) return '';
  try {
    return JSON.stringify(canonicalizeZoneJsonValue(parsed));
  } catch (_) {
    return String(val);
  }
}

function hasExplicitRegionZoneKeyInPayload(obj) {
  if (!obj || typeof obj !== 'object') return false;
  return REGION_ZONE_KEYS.some(k => (k in obj) && obj[k] !== undefined);
}

function hasAnyRegionZoneShape(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const [cLat, cLng] = normalizedGpsPair(obj, 'center_lat', 'center_lng');
  if (cLat !== null || cLng !== null) return true;
  const [lat, lng] = normalizedGpsPair(obj, 'lat', 'lng');
  if (lat !== null || lng !== null) return true;
  if (canonZoneGeoJsonSig(obj.zone_geojson)) return true;
  const r = normRegionRadiusKm(obj.radius_km);
  if (r !== null && r > 0) return true;
  const st = String(obj.shape_type || obj.zone_type || '').trim().toLowerCase();
  if (st && st !== 'none' && st !== 'shapeless' && st !== 'unmapped' && st !== 'null') return true;
  return false;
}

function hasRegionZoneMutation(baseObj, nextObj, opts = {}) {
  const a = (baseObj && typeof baseObj === 'object') ? baseObj : {};
  const b = (nextObj && typeof nextObj === 'object') ? nextObj : {};
  const [aLat, aLng] = normalizedGpsPair(a, 'center_lat', 'center_lng');
  const [bLat, bLng] = normalizedGpsPair(b, 'center_lat', 'center_lng');
  if (aLat !== bLat || aLng !== bLng) return true;
  const [aL2, aG2] = normalizedGpsPair(a, 'lat', 'lng');
  const [bL2, bG2] = normalizedGpsPair(b, 'lat', 'lng');
  if (aL2 !== bL2 || aG2 !== bG2) return true;
  if ((normRegionRadiusKm(a.radius_km) || null) !== (normRegionRadiusKm(b.radius_km) || null)) return true;
  const ignoreAbsentDist = Boolean(opts && opts.ignoreAbsentDistanceKm);
  const hasNextDist = ('distance_km' in b) && b.distance_km !== undefined && b.distance_km !== null;
  if ((!ignoreAbsentDist || hasNextDist) && normRegionRadiusKm(a.distance_km) !== normRegionRadiusKm(b.distance_km)) return true;
  const aShape = String(a.shape_type || '').trim().toLowerCase();
  const bShape = String(b.shape_type || '').trim().toLowerCase();
  if (aShape !== bShape) return true;
  const aZoneType = String(a.zone_type || '').trim().toLowerCase();
  const bZoneType = String(b.zone_type || '').trim().toLowerCase();
  if (aZoneType !== bZoneType) return true;
  if (canonZoneGeoJsonSig(a.zone_geojson) !== canonZoneGeoJsonSig(b.zone_geojson)) return true;
  return false;
}

function restoreRegionZoneFieldsFromBase(targetObj, baseObj) {
  if (!targetObj || typeof targetObj !== 'object') return targetObj;
  const base = (baseObj && typeof baseObj === 'object') ? baseObj : {};
  for (const k of REGION_ZONE_KEYS) {
    if (k in base && base[k] !== undefined) targetObj[k] = base[k];
    else delete targetObj[k];
  }
  return targetObj;
}

function stripRegionZoneFields(targetObj) {
  if (!targetObj || typeof targetObj !== 'object') return targetObj;
  for (const k of REGION_ZONE_KEYS) {
    delete targetObj[k];
  }
  return targetObj;
}

function normSiteRoadSurface(val) {
  const s = String(val || '').trim().toLowerCase();
  return (s === 'paved' || s === 'unpaved') ? s : '';
}

function hasSiteSurfaceMutation(canonTable, baseObj, nextObj) {
  if (canonTable !== 'sites') return false;
  const a = (baseObj && typeof baseObj === 'object') ? baseObj : {};
  const b = (nextObj && typeof nextObj === 'object') ? nextObj : {};
  if (!Object.prototype.hasOwnProperty.call(b, 'road_surface')) return false;
  return normSiteRoadSurface(a.road_surface) !== normSiteRoadSurface(b.road_surface);
}

function restoreSiteSurfaceFromBase(targetObj, baseObj) {
  if (!targetObj || typeof targetObj !== 'object') return targetObj;
  const base = (baseObj && typeof baseObj === 'object') ? baseObj : {};
  if (Object.prototype.hasOwnProperty.call(base, 'road_surface') && base.road_surface !== undefined) {
    targetObj.road_surface = base.road_surface;
  } else {
    delete targetObj.road_surface;
  }
  return targetObj;
}

function restoreVoidFieldsFromBase(targetObj, baseObj) {
  if (!targetObj || typeof targetObj !== 'object') return targetObj;
  const base = (baseObj && typeof baseObj === 'object') ? baseObj : {};
  for (const k of VOID_META_KEYS) {
    if (k in base && base[k] !== undefined) targetObj[k] = base[k];
    else delete targetObj[k];
  }
  return targetObj;
}

function stripVoidFields(targetObj) {
  if (!targetObj || typeof targetObj !== 'object') return targetObj;
  targetObj.voided = false;
  for (const k of VOID_META_KEYS) {
    if (k !== 'voided') delete targetObj[k];
  }
  return targetObj;
}

function hasVoidReasonChange(baseObj, nextObj) {
  const bRaw = baseObj ? (baseObj.void_reason !== undefined ? baseObj.void_reason : baseObj.voidReason) : '';
  const nRaw = nextObj ? (nextObj.void_reason !== undefined ? nextObj.void_reason : nextObj.voidReason) : '';
  const b = String(bRaw === undefined || bRaw === null ? '' : bRaw).trim();
  const n = String(nRaw === undefined || nRaw === null ? '' : nRaw).trim();
  return b !== n;
}

function applyExplicitVoidReason(targetObj, incomingObj) {
  if (!targetObj || typeof targetObj !== 'object') return targetObj;
  const inc = (incomingObj && typeof incomingObj === 'object') ? incomingObj : {};
  const raw = inc.void_reason !== undefined ? inc.void_reason : (inc.voidReason !== undefined ? inc.voidReason : '');
  const clean = String(raw === undefined || raw === null ? '' : raw).trim().slice(0, 500);
  if (clean) targetObj.void_reason = clean;
  else delete targetObj.void_reason;
  delete targetObj.voidReason;
  return targetObj;
}

function isSyncTwinVoidBy(obj) {
  if (!obj || typeof obj !== 'object') return false;
  return /^(system-topup|sharepoint top-up)/i.test(String(obj.voided_by || obj.voidedBy || '').trim());
}

// The other five industries' dated schedules. A save from a later Start Date with another value keeps the row and adds
// a new schedule under the id "<keptId>-YYYYMMDD" (app.js planSiblingChronoSplit), so two devices that have not synced
// reach the same id on their own. Kept 1:1 with _SCHEDULE_SPLIT_BUCKETS in isabi-app/server.py.
const SCHEDULE_SPLIT_BUCKETS = new Set(['hsp_tariffs', 're_leases', 'trd_targets', 'ins_agreements', 'hld_partners', 'hld_loans']);
const VOIDED_ID_CONFLICT_CODE = 'voided_id_conflict';
const VOIDED_ID_CONFLICT_ERROR = 'This schedule was saved and undone on another device. Refresh the page and save again.';

// The stamp format both the app (Date.toISOString) and the two servers write: fixed width, so it compares as text
const ISO_MS_Z_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/;
const ASCII_ALNUM_RE = /[A-Za-z0-9]/;

// A live schedule that a save kept apart, posted under an id whose stored row is another one's voided row. Only called
// where the stored row is voided, the incoming one is live and its rev is not higher (a restore from the Void Log
// raises the rev and never gets here). All of these must hold, or the row is left to the merge as before:
// - the bucket is one of the six dated schedules;
// - the incoming row was made by such a save (`_continues_id`, set by planSiblingChronoSplit): its id was worked out
//   by the device, and the app gives the next save another id. A row keyed under an id typed in the form, or a device
//   copy of a workbook row, is the same record on every device and is not judged here;
// - the two rows were made separately: `_createdAt` is stamped once when a row is first made on a device and is
//   carried by every later copy of it, its void included. A device sending its own older copy of the voided row
//   carries the same stamp and is not a reuse;
// - the incoming row was made after the stored one was voided (`voided_at`, stamped by the server when the void
//   arrived). A live copy made before that is an older copy the device still holds and sends with every save,
//   whatever its stamp (two devices can each have made the row before one of them undid it).
// A field that is missing, not text or not in the stamp format means the row is not judged. Text is compared as it
// is (no trimming), so this and server.py decide alike.
function isVoidedScheduleIdReuse(bucket, exObj, inc) {
  if (!SCHEDULE_SPLIT_BUCKETS.has(String(bucket || ''))) return false;
  if (!exObj || typeof exObj !== 'object' || Array.isArray(exObj) || !inc || typeof inc !== 'object' || Array.isArray(inc)) return false;
  const cont = inc._continues_id;
  if (typeof cont !== 'string' || !ASCII_ALNUM_RE.test(cont)) return false;
  const exMade = exObj._createdAt;
  const incMade = inc._createdAt;
  const voidedAt = exObj.voided_at;
  for (const stamp of [exMade, incMade, voidedAt]) {
    if (typeof stamp !== 'string' || !ISO_MS_Z_RE.test(stamp)) return false;
  }
  return exMade !== incMade && incMade > voidedAt;
}

function sanitizeIncomingTwinKeys(targetObj, baseObj, session, perms) {
  if (!targetObj || typeof targetObj !== 'object') return targetObj;
  const trusted = Boolean((session && session.build_ticket) || (perms && perms.roleKey === 'Full Access (Owner)'));
  if (trusted) return targetObj;
  const base = (baseObj && typeof baseObj === 'object') ? baseObj : null;
  for (const k of ['twin_of', 'twin_difference']) {
    if (base && k in base && base[k] !== undefined) targetObj[k] = base[k];
    else delete targetObj[k];
  }
  return targetObj;
}

const PRE_VOID_NON_BUSINESS_KEYS = new Set([
  ...VOID_META_AND_GPS_SKIP_KEYS,
  'id', 'entered_by', 'enteredBy', 'entered_by_email', 'enteredByEmail', 'entered_at', 'enteredAt',
  'created_at', 'createdAt', '_createdAt', 'client_updated_at', 'source', 'same_person_confirmed',
  'attachments', 'adj_windows', 'driver_rows', 'admin_overrides', 'removedDocIds', 'backfill_status',
  'settled_amount', 'has_paired_return', 'data_url', 'headers', 'cells'
]);

function preVoidValEqual(a, b) {
  if (a === b) return true;
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    const ba = asStrictBoolOrNull(a);
    const bb = asStrictBoolOrNull(b);
    return ba !== null && bb !== null ? ba === bb : Boolean(a) === Boolean(b);
  }
  const sa = String(a == null ? '' : a).trim();
  const sb = String(b == null ? '' : b).trim();
  if (sa === sb) return true;
  if (sa && sb) {
    const na = Number(sa), nb = Number(sb);
    if (Number.isFinite(na) && Number.isFinite(nb) && Math.abs(na - nb) < 1e-6) return true;
  }
  return false;
}

function sanitizePreVoidOrig(obj, extraAllowedKeys = null) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const extraSet = extraAllowedKeys instanceof Set ? extraAllowedKeys : (Array.isArray(extraAllowedKeys) ? new Set(extraAllowedKeys) : null);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (Object.keys(out).length >= 48) break;
    if (!k || k.startsWith('_') || (PRE_VOID_NON_BUSINESS_KEYS.has(k) && !(extraSet && extraSet.has(k)))) continue;
    if (v !== null && typeof v === 'object') continue;
    out[String(k)] = v == null ? '' : v;
  }
  return out;
}

function extractCellFieldsForDiff(obj) {
  const out = {};
  if (!obj || !Array.isArray(obj.cells)) return out;
  const hdrs = Array.isArray(obj.headers) ? obj.headers : [];
  const usedKeys = new Set();
  for (let idx = 0; idx < obj.cells.length; idx++) {
    const hdrLbl = String((hdrs[idx] && hdrs[idx]) || `Column ${idx + 1}`).trim();
    const baseKey = hdrLbl.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `col_${idx}`;
    const fKey = usedKeys.has(baseKey) ? `${baseKey}_${idx}` : baseKey;
    usedKeys.add(fKey);
    out[fKey] = { label: hdrLbl.slice(0, 80), val: obj.cells[idx] == null ? '' : obj.cells[idx] };
  }
  return out;
}

function verifyInitialSeedEdit(targetObj, actorName, nowIso) {
  if (!targetObj || typeof targetObj !== 'object' || Boolean(targetObj.voided)) return false;
  if (!Array.isArray(targetObj._pre_void_edits) || targetObj._pre_void_edits.length !== 1) return false;
  const cellMap = extractCellFieldsForDiff(targetObj);
  const cellKeySet = new Set(Object.keys(cellMap));
  const orig = sanitizePreVoidOrig(targetObj._pre_void_orig, cellKeySet);
  if (!orig || !Object.keys(orig).length) return false;
  const edits = clonePreVoidEdits(targetObj._pre_void_edits);
  if (edits.length !== 1) return false;
  const ch = edits[0].changes;
  const chKeys = Object.keys(ch);
  if (!chKeys.length || chKeys.length > 24) return false;
  for (const ck of chKeys) {
    if (!Object.prototype.hasOwnProperty.call(orig, ck)) return false;
    const cv = ch[ck];
    if (!preVoidValEqual(cv.from, orig[ck])) return false;
    let curVal;
    if (Object.prototype.hasOwnProperty.call(cellMap, ck)) {
      curVal = cellMap[ck].val;
    } else if (!ck.startsWith('_') && !PRE_VOID_NON_BUSINESS_KEYS.has(ck) && Object.prototype.hasOwnProperty.call(targetObj, ck) && (targetObj[ck] === null || typeof targetObj[ck] !== 'object')) {
      curVal = targetObj[ck];
    } else {
      return false;
    }
    if (!preVoidValEqual(cv.to, curVal) || preVoidValEqual(cv.from, cv.to)) return false;
  }
  targetObj._pre_void_orig = orig;
  targetObj._pre_void_edits = [{ at: nowIso, by: actorName || 'User', changes: ch }];
  return true;
}

function clonePreVoidEdits(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || !item.changes || typeof item.changes !== 'object' || Array.isArray(item.changes)) continue;
    const cleanChanges = {};
    for (const [ck, cv] of Object.entries(item.changes)) {
      if (Object.keys(cleanChanges).length >= 24) break;
      if (!ck || !cv || typeof cv !== 'object' || Array.isArray(cv)) continue;
      const entry = { from: cv.from == null ? '' : cv.from, to: cv.to == null ? '' : cv.to };
      if (cv.label) entry.label = String(cv.label).slice(0, 80);
      cleanChanges[String(ck).slice(0, 80)] = entry;
    }
    if (!Object.keys(cleanChanges).length) continue;
    out.push({
      at: String(item.at || '').slice(0, 64),
      by: String(item.by || '').slice(0, 120),
      changes: cleanChanges
    });
  }
  return out.slice(-15);
}

function preserveAndRecordPreVoidEdits(targetObj, prevObj, session, nowIso, wasVoid = false, nowVoid = false, opts = {}) {
  if (!targetObj || typeof targetObj !== 'object') return;
  if (session && session.build_ticket) return;
  const actorName = session
    ? String(session.full_name || session.name || session.email || '').trim().slice(0, 120)
    : '';
  if (!prevObj || typeof prevObj !== 'object') {
    if (opts && opts.allowInitialSeedEdit && verifyInitialSeedEdit(targetObj, actorName, nowIso)) return;
    delete targetObj._pre_void_orig;
    delete targetObj._pre_void_edits;
    return;
  }
  const prevOrig = sanitizePreVoidOrig(prevObj._pre_void_orig);
  const prevEdits = clonePreVoidEdits(prevObj._pre_void_edits);
  const isZeroOrEmptyDefault = v => (
    v === undefined || v === null || v === '' || v === false || v === 0 ||
    (typeof v === 'number' && Math.abs(v) < 1e-9)
  );
  const changes = {};
  const keys = new Set([...Object.keys(prevObj), ...Object.keys(targetObj)]);
  for (const k of keys) {
    if (Object.keys(changes).length >= 24) break;
    if (!k || k.startsWith('_') || PRE_VOID_NON_BUSINESS_KEYS.has(k)) continue;
    const av = prevObj[k];
    const bv = targetObj[k];
    if ((av !== null && typeof av === 'object') || (bv !== null && typeof bv === 'object')) continue;
    const aHas = Object.prototype.hasOwnProperty.call(prevObj, k) && av !== undefined && av !== null;
    const bHas = Object.prototype.hasOwnProperty.call(targetObj, k) && bv !== undefined && bv !== null;
    if (!aHas && isZeroOrEmptyDefault(bv)) continue;
    if (!bHas && isZeroOrEmptyDefault(av)) continue;
    if (!preVoidValEqual(av, bv)) {
      changes[k] = { from: av == null ? '' : av, to: bv == null ? '' : bv };
    }
  }
  if (Array.isArray(prevObj.cells) || Array.isArray(targetObj.cells)) {
    const pCellMap = extractCellFieldsForDiff({ cells: prevObj.cells, headers: Array.isArray(targetObj.headers) ? targetObj.headers : prevObj.headers });
    const nCellMap = extractCellFieldsForDiff(targetObj);
    const cellKeys = new Set([...Object.keys(pCellMap), ...Object.keys(nCellMap)]);
    for (const fKey of cellKeys) {
      if (Object.keys(changes).length >= 24) break;
      const pc = pCellMap[fKey];
      const nc = nCellMap[fKey];
      const pv = pc ? pc.val : '';
      const nv = nc ? nc.val : '';
      const hdrLbl = (nc && nc.label) || (pc && pc.label) || fKey;
      if (!preVoidValEqual(pv, nv)) {
        changes[fKey] = { label: hdrLbl, from: pv, to: nv };
      }
    }
  }
  if (Object.keys(changes).length > 0 && !(wasVoid && nowVoid)) {
    if (prevOrig && Object.keys(prevOrig).length) {
      targetObj._pre_void_orig = prevOrig;
    } else {
      const initSnap = sanitizePreVoidOrig(prevObj) || {};
      const pCellMap = extractCellFieldsForDiff({ cells: prevObj.cells, headers: Array.isArray(targetObj.headers) ? targetObj.headers : prevObj.headers });
      for (const [fKey, entry] of Object.entries(pCellMap)) {
        if (Object.keys(initSnap).length >= 48) break;
        initSnap[fKey] = entry.val;
      }
      targetObj._pre_void_orig = initSnap;
    }
    prevEdits.push({
      at: nowIso,
      by: actorName || 'User',
      changes
    });
    targetObj._pre_void_edits = prevEdits.slice(-15);
  } else {
    if (prevOrig && Object.keys(prevOrig).length) targetObj._pre_void_orig = prevOrig;
    else delete targetObj._pre_void_orig;
    if (prevEdits.length) targetObj._pre_void_edits = prevEdits;
    else delete targetObj._pre_void_edits;
  }
}

function enforceServerVoidActorFields(targetObj, prevObj, session, nowIso, opts = {}) {
  if (!targetObj || typeof targetObj !== 'object') return targetObj;
  const wasVoid = Boolean(prevObj && prevObj.voided);
  const nowVoid = Boolean(targetObj.voided);
  preserveAndRecordPreVoidEdits(targetObj, prevObj, session, nowIso, wasVoid, nowVoid, opts);
  if (!nowVoid) {
    if (wasVoid) {
      if (prevObj && (!session || !session.build_ticket) && isSyncTwinVoidBy(prevObj)) {
        targetObj.voided = true;
        for (const vk of VOID_META_KEYS) {
          if (vk !== 'voided' && vk in prevObj && prevObj[vk] !== undefined) targetObj[vk] = prevObj[vk];
        }
        delete targetObj.restored_at;
        delete targetObj.restoredAt;
        delete targetObj.restored_by;
        delete targetObj.restoredBy;
        delete targetObj._reopenedExplicitly;
        return targetObj;
      }
      const wasWbMatch = Boolean(
        prevObj && (
          prevObj.twin_of
          || prevObj.twin_difference
          || /^(workbook match|workbook reconciliation)/i.test(String(prevObj.voided_by || '').trim())
        )
      );
      stripVoidFields(targetObj);
      if (wasWbMatch) {
        targetObj._reopenedExplicitly = true;
        targetObj.rev = Math.max(Number((prevObj && prevObj.rev) || 1), Number(targetObj.rev || 1)) + 1;
      } else if (prevObj && (!session || !session.build_ticket)) {
        if (prevObj._reopenedExplicitly !== undefined) targetObj._reopenedExplicitly = prevObj._reopenedExplicitly;
        else delete targetObj._reopenedExplicitly;
      }
      if (session && !session.build_ticket) {
        const actorName = String(session.name || session.full_name || session.email || '').trim();
        if (actorName) targetObj.restored_by = actorName;
        if (!String(targetObj.restored_at || '').trim()) targetObj.restored_at = nowIso;
      }
    } else if (targetObj.void_reason !== undefined) {
      delete targetObj.void_reason;
      delete targetObj.voidReason;
    }
    return targetObj;
  }
  if (targetObj.void_reason !== undefined && targetObj.void_reason !== null) {
    targetObj.void_reason = String(targetObj.void_reason).trim().slice(0, 500);
    if (!targetObj.void_reason) delete targetObj.void_reason;
  } else if (targetObj.voidReason !== undefined && targetObj.voidReason !== null) {
    const vr = String(targetObj.voidReason).trim().slice(0, 500);
    if (vr) targetObj.void_reason = vr;
    delete targetObj.voidReason;
  }
  if (!session || session.build_ticket) return targetObj;
  const actorName = String(session.name || session.full_name || session.email || 'Supervisor').trim();
  const actorEmail = String(session.email || '').trim().toLowerCase();
  if (!wasVoid) {
    const isDoorTabletWithdrawal = Boolean(
      opts.allowDoorTablet
      && prevObj && prevObj.origin === 'door_tablet'
      && String(targetObj.voided_by || '').trim() === 'Door Tablet'
    );
    if (isDoorTabletWithdrawal) {
      targetObj.voided_by = 'Door Tablet';
      delete targetObj.voided_by_email;
      if (!String(targetObj.voided_at || '').trim()) targetObj.voided_at = nowIso;
    } else {
      targetObj.voided_by = actorName;
      if (actorEmail) targetObj.voided_by_email = actorEmail;
      targetObj.voided_at = nowIso;
    }
    delete targetObj.voidedBy;
    delete targetObj.voidedByEmail;
    delete targetObj.voidedAt;
    delete targetObj.restored_at;
    delete targetObj.restored_by;
    delete targetObj._reopenedExplicitly;
  } else {
    if (prevObj.voided_by) targetObj.voided_by = prevObj.voided_by;
    if (prevObj.voided_by_email) targetObj.voided_by_email = prevObj.voided_by_email;
    if (prevObj.voided_at) targetObj.voided_at = prevObj.voided_at;
    delete targetObj.voidedBy;
    delete targetObj.voidedByEmail;
    delete targetObj.voidedAt;
    if (hasVoidReasonChange(prevObj, targetObj)) {
      targetObj.void_note_updated_by = actorName;
      targetObj.void_note_updated_at = nowIso;
    }
  }
  return targetObj;
}

const MASTER_DIRECTORY_VOID_TABLES_EDGE = new Set([
  'sites', 'regions', 'customers', 'suppliers', 'staff_members', 'company_equipment', 'equipment',
  'staff_roles', 'staff_assignments', 'work_shifts', 'documents', 'accounts', 'companies', 'partners',
  'settings', 'employments', 're_properties', 're_units', 're_ownership', 're_valuations', 'trd_trucks',
  'trd_stock', 'trd_suppliers', 'ins_catalogue', 'ins_carriers', 'ins_brokers', 'ins_agents',
  'hsp_stock', 'hsp_outlets', 'hsp_rooms', 'hld_entities', 'hld_partners_dir'
]);
const MASTER_DIRECTORY_TITLE_RX_EDGE = /^(sites|properties|units|ownership|valuations|trucks|catalogue|directories|rooms)$/i;

function beirutTodayIsoEdge() {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Beirut' }).format(new Date());
  } catch (_) {
    return new Date().toISOString().slice(0, 10);
  }
}

function parseVoidMoneyNumEdge(val) {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  const cleaned = String(val || '').replace(/,/g, '').trim();
  if (!cleaned) return 0;
  const m = cleaned.match(/[-+]?\d+(?:\.\d+)?/);
  if (!m) return 0;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : 0;
}

const VOID_USD_EXTRACT_KEYS_EDGE = [
  'total_usd', 'total_ttc_usd', 'net_usd', 'amount_usd', 'usd_amount', 'ttc_usd',
  'ttc_period_usd', 'annual_ttc_usd', 'ttc', 'gross_prem_usd', 'gwp_usd', 'premium_usd',
  'net_payable_4017_usd', 'settled_to_carrier_usd', 'gross_comm_usd', 'net_comm_usd',
  'quoted_renewal_usd', 'claimed_usd', 'approved_usd', 'paid_by_insurer_usd',
  'contract_usd', 'season_contract_usd', 'seasonal_rate_usd', 'nightly_rate_usd',
  'gross_pool_usd', 'open_payable_usd', 'pos_billed_ttc', 'scheduled_usd',
  'actual_usd', 'open_usd', 'landed_cost_usd', 'total_landed_add', 'fob_usd',
  'gross_ar_usd', 'unallocated_usd', 'principal_usd', 'total_due_usd',
  'balance_usd', 'paid_usd', 'advance_usd', 'cash_usd', 'cost_usd',
  'gross_usd', 'net_pay_usd', 'base_salary_usd', 'usd', 'total_ttc', 'total', 'amount'
];

function extractVoidRowUsdEdge(row) {
  if (!row || typeof row !== 'object') return 0;
  const snap = (row.void_snapshot && typeof row.void_snapshot === 'object') ? row.void_snapshot : null;
  const srcs = snap ? [row, snap] : [row];
  for (const src of srcs) {
    const srcCur = String(src.currency || src.cur || row.currency || row.cur || '').trim().toUpperCase();
    const fxRaw = Number(src.rate || src.fx_rate || row.rate || row.fx_rate || 89500);
    const fx = fxRaw > 0 ? fxRaw : 89500;
    for (const k of VOID_USD_EXTRACT_KEYS_EDGE) {
      const rawVal = src[k];
      const v = parseVoidMoneyNumEdge(rawVal);
      if (v !== 0) {
        const isExplicitUsd = /_usd$|^usd$/i.test(k);
        const isLbpVal = /lbp|l\.l/i.test(String(rawVal || '')) || (!isExplicitUsd && srcCur === 'LBP');
        return isLbpVal ? Math.abs(v / fx) : Math.abs(v);
      }
    }
  }
  const lbpKeys = ['amount_lbp', 'lbp_amount', 'total_lbp'];
  for (const src of srcs) {
    for (const k of lbpKeys) {
      const lbp = parseVoidMoneyNumEdge(src[k]);
      if (lbp !== 0) {
        const fx = Number(src.rate || src.fx_rate || row.rate || row.fx_rate || 89500);
        return Math.abs(lbp / (fx > 0 ? fx : 89500));
      }
    }
  }
  return 0;
}

function normalizeVoidDateIsoEdge(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dmy = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return '';
}

async function loadVoidReasonRuleCfgEdge(db) {
  const defCfg = { enabled: true, min_usd: 500, backdated_days: 1 };
  if (!db) return defCfg;
  let ov = null;
  try {
    const sqlAr = await loadCanonicalAlertRulesFromDb(db);
    if (sqlAr && sqlAr.overrides && sqlAr.overrides.G_VOID_REASON && typeof sqlAr.overrides.G_VOID_REASON === 'object') {
      ov = sqlAr.overrides.G_VOID_REASON;
    }
  } catch (_) {}
  if (!ov) {
    try {
      const kv = await readEdgeKvDoc(db, 'mfg_web_store');
      const doc = kv && kv.payload_json ? safeJsonParse(kv.payload_json, null) : null;
      const cand = doc && doc.alertRules && doc.alertRules.overrides && doc.alertRules.overrides.G_VOID_REASON;
      if (cand && typeof cand === 'object') ov = cand;
    } catch (_) {}
  }
  if (!ov) return defCfg;
  const p = (ov.params && typeof ov.params === 'object') ? ov.params : {};
  const minUsd = Number.isFinite(Number(p.min_usd)) ? Number(p.min_usd) : 500;
  const backdatedDays = Number.isFinite(Number(p.backdated_days)) ? Number(p.backdated_days) : 1;
  return {
    enabled: ov.enabled !== false,
    min_usd: Math.max(0, minUsd),
    backdated_days: Math.max(0, backdatedDays)
  };
}

function checkMandatoryVoidReasonEdge(tableOrBucket, rowObj, session, ruleCfg, existingObj = null) {
  if (session && session.build_ticket) return null;
  const cfg = ruleCfg || { enabled: true, min_usd: 500, backdated_days: 1 };
  if (!cfg.enabled) return null;
  const row = rowObj || {};
  const tblLow = String(tableOrBucket || row.domainTblKey || (row.void_snapshot && row.void_snapshot.domainTblKey) || '').trim().toLowerCase();
  const titleStr = String(row.tableTitle || (row.void_snapshot && row.void_snapshot.tableTitle) || '').trim();
  const isMaster = Boolean(
    (tblLow && MASTER_DIRECTORY_VOID_TABLES_EDGE.has(tblLow))
    || (titleStr && MASTER_DIRECTORY_TITLE_RX_EDGE.test(titleStr) && (!tblLow || MASTER_DIRECTORY_VOID_TABLES_EDGE.has(tblLow) || /^wf::/i.test(tblLow) || tblLow.includes('::')))
  );
  if (isMaster) return null;
  // Exempt ONLY from verified existing DB row state, never from untrusted incoming client fields.
  const exR = (existingObj && typeof existingObj === 'object') ? existingObj : null;
  const exByRaw = String((exR && (exR.voided_by || exR.voidedBy)) || '').trim();
  if (
    exR && (
      exR.twin_of
      || exR.twin_difference
      || /^(system-topup|sharepoint top-up|workbook match|workbook reconciliation)/i.test(exByRaw)
    )
  ) {
    return null;
  }
  const snap = (row.void_snapshot && typeof row.void_snapshot === 'object') ? row.void_snapshot : {};
  const absUsd = extractVoidRowUsdEdge(row);
  const rowDate = normalizeVoidDateIsoEdge(
    row.date || row.rep_date || row.start_date || row.effective_from || row.period_start
    || row.close_date || row.invoice_date || row.remittance_date || row.loss_date || row.due_date
    || row.issue_date || row.lease_start || row.policy_start || row.booking_date || row.check_in
    || row.arrival_date || row.txn_date || row.val_date || row.day || snap.date || ''
  );
  const todayIso = beirutTodayIsoEdge();
  let daysOld = 0;
  if (rowDate && /^\d{4}-\d{2}-\d{2}$/.test(todayIso)) {
    daysOld = Math.round((Date.parse(todayIso + 'T00:00:00Z') - Date.parse(rowDate + 'T00:00:00Z')) / 86400000);
  }
  const byAll = cfg.backdated_days === 0;
  const byAmount = absUsd >= cfg.min_usd && (cfg.min_usd > 0 || absUsd >= 0);
  const byAge = cfg.backdated_days > 0 && Boolean(rowDate) && daysOld >= cfg.backdated_days;
  if (!byAll && !byAmount && !byAge) return null;
  const reason = String(row.void_reason || row.voidReason || '').trim();
  if (reason.length >= 3) return null;
  const msg = byAll
    ? 'Void reason required (min 3 chars) under active G_VOID_REASON rule.'
    : (byAmount
      ? `Void reason required (min 3 chars): amount $${absUsd.toFixed(0)} >= $${cfg.min_usd}.`
      : `Void reason required (min 3 chars): entry dated ${rowDate} is ${daysOld}d before today.`);
  return { ok: false, code: 'void_reason_required', error: msg };
}

const SALES_ALLOWED_TABLES = new Set([
  'sites', 'sales_tickets', 'customer_receipts', 'customers', 'products', 'items',
  'price_rules', 'vat_invoices', 'credit_terms', 'regions', 'equipment',
  'drivers', 'documents'
]);

const CUSTOM_DISPATCH_TABLES = new Set(['sales_tickets', 'raw_purchases', 'fuel_intakes', 'fuel_malfunctions']);
const CUSTOM_FLEET_MAINT_TABLES = new Set(['equipment_defects', 'part_movements', 'equipment_repairs', 'repair_items', 'equipment_oil_logs']);
const CUSTOM_ACCT_TABLES = new Set(['customer_receipts', 'expenses', 'expense_items', 'recurring_expenses', 'warehouse_movements', 'supplier_payments', 'documents']);
const CUSTOM_MASTER_TABLES = new Set([
  'price_rules', 'vat_invoices', 'credit_terms', 'customers', 'suppliers', 'products', 'product_types', 'uoms',
  'sites', 'regions', 'staff_members', 'staff_roles', 'staff_assignments', 'work_shifts', 'salary_payments',
  'salaries', 'employments', 'freelance_entries', 'logistics_allowances', 'overtime_rates', 'attendance',
  'fx_rates', 'vat_rates', 'currencies', 'gl_accounts'
]);
const CUSTOM_TREASURY_TABLES = new Set(['external_movements', 'loans', 'loan_settlements', 'conversions']);
const CUSTOM_JV_TABLES = new Set(['jv_partnerships', 'jv_distributions']);

function canCreateTableRecord(perms, canonTable) {
  if (!perms) return false;
  if (canonTable === 'sites' || canonTable === 'regions') {
    return Boolean(perms.canWriteGeoConfig || canEnterSite(perms));
  }
  if (perms.roleKey === 'Full Access (Owner)' || perms.roleKey === 'Supervisor + Entry') return true;
  if (perms.roleKey === 'Supervisor' || perms.roleKey === 'Viewer') return false;
  if (perms.roleKey === 'Sales') return SALES_ALLOWED_TABLES.has(canonTable);
  if (perms.roleKey === 'Custom') {
    const anyEnter = Boolean(perms.enterDispatch || perms.enterAccounting || perms.enterMaster || perms.enterPayrollJv);
    if (!anyEnter) return false;
    if (CUSTOM_DISPATCH_TABLES.has(canonTable)) return Boolean(perms.enterDispatch);
    if (CUSTOM_FLEET_MAINT_TABLES.has(canonTable)) return Boolean(perms.enterDispatch || perms.enterMaster || perms.enterAccounting);
    if (CUSTOM_ACCT_TABLES.has(canonTable)) return Boolean(perms.enterAccounting || perms.enterMaster || perms.enterDispatch);
    if (CUSTOM_MASTER_TABLES.has(canonTable)) return Boolean(perms.enterMaster || perms.enterPayrollJv);
    if (CUSTOM_TREASURY_TABLES.has(canonTable)) return Boolean(perms.enterPayrollJv || perms.enterAccounting);
    if (CUSTOM_JV_TABLES.has(canonTable)) return Boolean(perms.enterPayrollJv);
    return anyEnter;
  }
  if (perms.roleKey === 'Entry' && (canonTable === 'gl_accounts' || CUSTOM_JV_TABLES.has(canonTable))) return false;
  return Boolean(perms.modifyText && (perms.enterDispatch || perms.enterAccounting || perms.enterMaster));
}

const FIN_LOCKED_TEXT_TABLES = new Set([
  'gl_accounts', ...CUSTOM_JV_TABLES, ...CUSTOM_TREASURY_TABLES
]);

function canEditExistingTableRecord(perms, canonTable) {
  if (!perms) return false;
  if (canCreateTableRecord(perms, canonTable)) return true;
  if (perms.roleKey === 'Custom') {
    const anyEnter = Boolean(perms.enterDispatch || perms.enterAccounting || perms.enterMaster || perms.enterPayrollJv);
    if (!anyEnter && perms.modifyText && !perms.modifyData) {
      return !FIN_LOCKED_TEXT_TABLES.has(canonTable);
    }
  }
  return false;
}

export async function handleRecordsPost(request, env, session, body) {
  if (!env || !env.DB) return jsonResponse({ ok: false, error: 'Database unavailable' }, 503);
  if (isDemoHeader(request)) return jsonResponse({ ok: false, error: 'Demo sandbox is read-only' }, 403);
  if (!session) return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);

  if (body && body.op === 'rollback') {
    const tokRes = await takeRollbackToken(env.DB, 'records', body.rollbackToken, session);
    if (!tokRes.ok) return jsonResponse({ ok: false, error: tokRes.error }, tokRes.status || 400);
    const entry = tokRes.entry;
    const tbl = String(entry.table || '');
    const rid = String(entry.id || '');
    if (!USER_WRITABLE_TABLES.has(tbl) || !rid) {
      return jsonResponse({ ok: false, error: 'Invalid rollback target table.' }, 400);
    }
    if (body.table) {
      const reqTbl = CR_KEY_TO_TABLE[body.table] || body.table;
      if (reqTbl !== tbl) return jsonResponse({ ok: false, error: 'Rollback table mismatch.' }, 400);
    }
    if (body.id && String(body.id).trim() !== rid) {
      return jsonResponse({ ok: false, error: 'Rollback record id mismatch.' }, 400);
    }
    const curRow = await env.DB.prepare(`SELECT * FROM ${tbl} WHERE id = ?1`).bind(rid).first();
    if (!curRow) {
      if (!entry.existed) return jsonResponse({ ok: true, rolledBack: true, alreadyAbsent: true, table: tbl, id: rid });
      return jsonResponse({ ok: false, error: 'Rollback conflict: record no longer exists.' }, 409);
    }
    const curSig = stableRowSig(hydrateRowJson(curRow));
    if (curSig !== entry.writtenSig) {
      return jsonResponse({ ok: false, error: 'Rollback conflict: record was modified after commit.' }, 409);
    }
    const geoAuditIds = Array.isArray(entry.geoAuditIds) ? entry.geoAuditIds.filter(Boolean) : [];
    const deleteGeoAuditIds = async () => {
      if (!geoAuditIds.length) return;
      const gaStmts = geoAuditIds.map(gid => env.DB.prepare('DELETE FROM geo_audit_log WHERE id = ?1').bind(String(gid)));
      await execBatchedStmts(env.DB, gaStmts);
    };
    if (!entry.existed) {
      await env.DB.prepare(`DELETE FROM ${tbl} WHERE id = ?1`).bind(rid).run();
      await deleteGeoAuditIds();
      return jsonResponse({ ok: true, rolledBack: true, table: tbl, id: rid });
    }
    const rbUp = await upsertTableRecord(env.DB, tbl, entry.prevRow);
    if (!rbUp.ok) return jsonResponse({ ok: false, error: rbUp.error }, rbUp.status || 409);
    await deleteGeoAuditIds();
    return jsonResponse({ ok: true, rolledBack: true, table: tbl, id: rid });
  }

  const rawTable = body && body.table;
  const canonTable = CR_KEY_TO_TABLE[rawTable] || rawTable;
  let record = body && body.record;
  if (!USER_WRITABLE_TABLES.has(canonTable) || !record || typeof record !== 'object' || !record.id) {
    return jsonResponse({ ok: false, error: 'Invalid table or record (id required)' }, 400);
  }
  if (!validateRecordGpsCoords(record)) {
    return jsonResponse({ ok: false, error: 'Invalid GPS coordinates.' }, 400);
  }
  if (canonTable === 'sites') {
    record = normalizeIncomingSiteCoordAliases(record);
  }

  const cols = await getTableColumns(env.DB, canonTable);
  if (!cols.size) {
    return jsonResponse({ ok: false, error: `Unknown schema for table: ${canonTable}` }, 400);
  }
  let exRow = await env.DB.prepare(`SELECT * FROM ${canonTable} WHERE id = ?1`).bind(String(record.id).trim()).first();
  if (UNIVERSAL_UNIQUE_TABLES.has(canonTable) && !record.voided && cols.has('name')) {
    const mainVal = String(record.name || record.item_name || record.driver || record.equipment || '').trim();
    if (canonTable === 'items' && mainVal && !String(record.name || '').trim()) {
      record = Object.assign({}, record, { name: mainVal });
    }
    if (mainVal) {
      let dupRow = null;
      if (canonTable === 'expense_subcategories' && cols.has('category')) {
        const catVal = String(record.category || '').trim();
        dupRow = await env.DB.prepare(
          `SELECT id FROM ${canonTable} WHERE id != ?1 AND lower(trim(name)) = lower(trim(?2)) AND lower(trim(COALESCE(category,''))) = lower(trim(?3)) AND COALESCE(voided, 0) = 0 LIMIT 1`
        ).bind(String(record.id).trim(), mainVal, catVal).first();
      } else {
        dupRow = await env.DB.prepare(
          `SELECT id FROM ${canonTable} WHERE id != ?1 AND lower(trim(name)) = lower(trim(?2)) AND COALESCE(voided, 0) = 0 LIMIT 1`
        ).bind(String(record.id).trim(), mainVal).first();
      }
      if (dupRow) {
        if (exRow || !record.modified_by) {
          return jsonResponse({
            ok: false,
            error: `Duplicate ${canonTable} main column '${mainVal}' already exists (id=${dupRow.id}).`
          }, 409);
        }
        const dupFull = await env.DB.prepare(`SELECT * FROM ${canonTable} WHERE id = ?1`).bind(String(dupRow.id)).first();
        if (dupFull) {
          exRow = dupFull;
          record = Object.assign({}, record, { id: String(dupRow.id) });
        }
      }
    }
  }

  const exHydratedRls = exRow ? hydrateRowJson(exRow) : null;
  const rejectRecGeo403 = async (errMsg, targetType = canonTable === 'regions' ? 'region' : 'site') => {
    const coords = extractEffectivePinCoords(record);
    await recordGeoAuditEvent(env.DB, request, session, {
      action: 'blocked_403',
      outcome: 'blocked_403',
      source: 'records',
      industry: String(record._industry || record.industry || (exHydratedRls && (exHydratedRls._industry || exHydratedRls.industry)) || 'manufacturing'),
      company: String(record.company || (exHydratedRls && exHydratedRls.company) || '').trim(),
      target_type: targetType,
      target_id: String(record.id || (exHydratedRls && exHydratedRls.id) || ''),
      target_label: String(record.name || (exHydratedRls && exHydratedRls.name) || canonTable),
      next_lat: coords ? coords.lat : null,
      next_lng: coords ? coords.lng : null,
      detail: { table: canonTable, error: errMsg }
    });
    return jsonResponse({ ok: false, error: errMsg }, 403);
  };

  if (!isOwnerOrFullGroupSession(session)) {
    const isBuScopedTable = cols.has('company') && !UNIVERSAL_UNIQUE_TABLES.has(canonTable);
    const recCo = String(record.company || '').trim();
    const exCo = exHydratedRls ? String(exHydratedRls.company || exHydratedRls.resort || exHydratedRls.entity || '').trim() : '';
    const touchesGeo = canonTable === 'sites' || canonTable === 'regions' || hasAnyGpsField(record) || hasAnyRegionZoneShape(record);
    if (recCo && !canAccessCompany(session, recCo)) {
      if (touchesGeo) return await rejectRecGeo403('Row-level security: unauthorized entity write.');
      return jsonResponse({ ok: false, error: 'Row-level security: unauthorized entity write.' }, 403);
    }
    if (isBuScopedTable && !recCo && !exCo) {
      if (touchesGeo) return await rejectRecGeo403('Row-level security: company is required for entity-scoped writes.');
      return jsonResponse({ ok: false, error: 'Row-level security: company is required for entity-scoped writes.' }, 403);
    }
    if (exHydratedRls) {
      if ((isBuScopedTable && !exCo) || (exCo && !canAccessCompany(session, exCo))) {
        if (touchesGeo) return await rejectRecGeo403('Row-level security: cannot overwrite another entity record.');
        return jsonResponse({ ok: false, error: 'Row-level security: cannot overwrite another entity record.' }, 403);
      }
    }
  } else if (record.company && !canAccessCompany(session, record.company)) {
    return jsonResponse({ ok: false, error: 'Row-level security: unauthorized entity write.' }, 403);
  }

  if (canonTable === 'sites' || canonTable === 'regions') {
    const recInd = String(record._industry || record.industry || record.ind || '').trim();
    const exInd = String((exHydratedRls && (exHydratedRls._industry || exHydratedRls.industry || exHydratedRls.ind)) || '').trim();
    const effInd = exInd || recInd || 'Manufacturing';
    if (!canAccessGeoIndustrySession(session, effInd)) {
      return await rejectRecGeo403('Row-level security: unauthorized industry geo write.');
    }
    if (recInd && exInd && canonGeoIndustryKey(recInd) !== canonGeoIndustryKey(exInd) && !canAccessGeoIndustrySession(session, recInd)) {
      return await rejectRecGeo403('Row-level security: unauthorized industry geo write.');
    }
  }

  const perms = getSessionWritePerms(session);
  let recordToWrite = record;
  if (!exRow) {
    if (!canCreateTableRecord(perms, canonTable)) {
      if (canonTable === 'sites' || canonTable === 'regions') return await rejectRecGeo403('Role permission: seat cannot create records in this table.');
      return jsonResponse({ ok: false, error: 'Role permission: seat cannot create records in this table.' }, 403);
    }
    if (!perms.voidData && Boolean(record.voided)) {
      return jsonResponse({ ok: false, error: 'Role permission: seat cannot create voided records.' }, 403);
    }
    if (!perms.canWriteGeoConfig && canonTable !== 'sites' && (hasAnyGpsField(record) || hasExplicitGpsKeyInPayload(record))) {
      return await rejectRecGeo403('Supervisor + Entry or Geo-authorized seat required to pin GPS coordinates on non-site records.', 'site');
    }
    if (!perms.canWriteGeoConfig && canonTable !== 'regions' && hasAnyRegionZoneShape(record)) {
      return await rejectRecGeo403('Supervisor + Entry or Geo-authorized seat required to define region zones on non-region records.', 'region');
    }
    recordToWrite = Object.assign({}, record);
    const createActorEmail = String((session && session.email) || '').trim();
    if (!String(recordToWrite.entered_by || '').trim() && createActorEmail) {
      recordToWrite.entered_by = createActorEmail;
    }
    if (!String(recordToWrite.entered_at || '').trim()) {
      recordToWrite.entered_at = new Date().toISOString();
    }
    sanitizeIncomingTwinKeys(recordToWrite, null, session, perms);
    if (Boolean(recordToWrite.voided)) {
      const vrCfg = await loadVoidReasonRuleCfgEdge(env.DB);
      const vrErr = checkMandatoryVoidReasonEdge(canonTable, recordToWrite, session, vrCfg, null);
      if (vrErr) return jsonResponse(vrErr, 400);
    }
    enforceServerVoidActorFields(recordToWrite, null, session, new Date().toISOString());
  } else {
    const exHydrated = exHydratedRls || hydrateRowJson(exRow);
    const wasVoid = Boolean(exHydrated.voided);
    const nowVoid = Boolean(record.voided);
    const voidNoteChanged = wasVoid && nowVoid && hasVoidReasonChange(exHydrated, record);
    if (!perms.voidData && (wasVoid !== nowVoid || voidNoteChanged)) {
      return jsonResponse({ ok: false, error: 'Role permission: seat cannot void or unvoid records.' }, 403);
    }
    if (
      wasVoid
      && !nowVoid
      && (!session || !session.build_ticket)
      && /^(system-topup|sharepoint top-up)/i.test(String(exHydrated.voided_by || '').trim())
    ) {
      return jsonResponse({ ok: false, error: 'Synced workbook rows cannot be restored directly.' }, 403);
    }
    const isSparsePureVoid = Boolean(
      (wasVoid !== nowVoid || voidNoteChanged)
      && !hasExplicitGpsKeyInPayload(record)
      && !hasExplicitRegionZoneKeyInPayload(record)
      && !hasSiteSurfaceMutation(canonTable, exHydrated, record)
      && !hasNonVoidFieldChange(exHydrated, record)
    );
    recordToWrite = Object.assign({}, exHydrated, record);
    if (voidNoteChanged) {
      applyExplicitVoidReason(recordToWrite, record);
    }
    if (isSparsePureVoid) {
      if (!nowVoid) {
        stripVoidFields(recordToWrite);
      }
      restoreGpsFieldsFromBase(recordToWrite, exHydrated);
      restoreRegionZoneFieldsFromBase(recordToWrite, exHydrated);
      restoreSiteSurfaceFromBase(recordToWrite, exHydrated);
    }
    const gpsChanged = hasGpsFieldMutation(exHydrated, recordToWrite);
    const regionZoneChanged = hasRegionZoneMutation(exHydrated, recordToWrite);
    const surfaceChanged = hasSiteSurfaceMutation(canonTable, exHydrated, recordToWrite);
    const missingPinFill = isInitialMissingSitePinFill(canonTable, exHydrated, recordToWrite, perms);
    const allowUnpinnedPinAdd = !missingPinFill && isInitialUnpinnedSitePinAddition(canonTable, exHydrated, recordToWrite, perms);
    const canEditTbl = canEditExistingTableRecord(perms, canonTable);
    const allowVoidTbl = perms.roleKey === 'Supervisor' || canCreateTableRecord(perms, canonTable);
    const allowVoidOnly = Boolean(
      perms.voidData && allowVoidTbl && (wasVoid !== nowVoid || voidNoteChanged)
      && !gpsChanged && !regionZoneChanged && !surfaceChanged
      && !hasNonVoidFieldChange(exHydrated, recordToWrite)
    );
    if (missingPinFill) {
      recordToWrite = applyInitialMissingSitePinFill(exHydrated, recordToWrite, session && session.email);
    } else if (allowUnpinnedPinAdd) {
      if (!perms.canWriteGeoConfig && regionZoneChanged) {
        return await rejectRecGeo403('Supervisor + Entry or Geo-authorized seat required to modify region zone shapes.', 'region');
      }
      if (!perms.canWriteGeoConfig && surfaceChanged) {
        return await rejectRecGeo403('Supervisor + Entry or Geo-authorized seat required to modify haul road surface.', 'site');
      }
      applyCanonSiteLatLngAliases(recordToWrite);
      recordToWrite._pinCleared = false;
      delete recordToWrite.pin_cleared;
      delete recordToWrite.pinCleared;
    } else {
      if (!perms.canWriteGeoConfig && gpsChanged) {
        return await rejectRecGeo403('Supervisor + Entry or Geo-authorized seat required to modify location coordinates.', 'site');
      }
      if (!perms.canWriteGeoConfig && regionZoneChanged) {
        return await rejectRecGeo403('Supervisor + Entry or Geo-authorized seat required to modify region zone shapes.', 'region');
      }
      if (!perms.canWriteGeoConfig && surfaceChanged) {
        return await rejectRecGeo403('Supervisor + Entry or Geo-authorized seat required to modify haul road surface.', 'site');
      }
      if ((!canEditTbl || (!perms.modifyText && !perms.modifyData)) && !allowVoidOnly) {
        const denyMsg = !canEditTbl
          ? 'Role permission: seat cannot modify records in this table.'
          : 'Role permission: read-only seat cannot modify existing records.';
        if (canonTable === 'sites' || canonTable === 'regions') {
          return await rejectRecGeo403(denyMsg);
        }
        return jsonResponse({ ok: false, error: denyMsg }, 403);
      }
      if (allowVoidOnly && (!canEditTbl || (!perms.modifyText && !perms.modifyData))) {
        if (voidNoteChanged) {
          recordToWrite = Object.assign({}, exHydrated);
          applyExplicitVoidReason(recordToWrite, record);
        }
      }
    }
    sanitizeIncomingTwinKeys(recordToWrite, exHydrated, session, perms);
    if (!wasVoid && nowVoid) {
      const vrCfg = await loadVoidReasonRuleCfgEdge(env.DB);
      const vrErr = checkMandatoryVoidReasonEdge(canonTable, recordToWrite, session, vrCfg, exHydrated);
      if (vrErr) return jsonResponse(vrErr, 400);
    }
    enforceServerVoidActorFields(recordToWrite, exHydrated, session, new Date().toISOString(), { allowDoorTablet: canonTable === 'attendance' });
  }

  const prevRowForRb = exHydratedRls ? hydrateRowJson(exRow) : null;
  if (prevRowForRb && canonTable === 'sites') {
    if (!('latitude' in prevRowForRb)) prevRowForRb.latitude = null;
    if (!('longitude' in prevRowForRb)) prevRowForRb.longitude = null;
  } else if (prevRowForRb && canonTable === 'regions') {
    for (const rk of ['center_lat', 'center_lng', 'radius_km', 'zone_geojson', 'distance_km', 'shape_type', 'zone_type']) {
      if (!(rk in prevRowForRb)) prevRowForRb[rk] = null;
    }
  }
  if (canonTable === 'sites' && (!exRow || perms.canWriteGeoConfig)) {
    stripSiteAliasCoordKeys(recordToWrite);
  }
  if (canonTable === 'employments' || canonTable === 'freelance_entries' || canonTable === 'staff_members') {
    const sameNameConflict = await checkSameNameRecordConflict(env.DB, canonTable, recordToWrite);
    if (sameNameConflict) return jsonResponse(sameNameConflict, 409);
  }
  const res = await upsertTableRecord(env.DB, canonTable, recordToWrite);
  if (!res.ok) return jsonResponse({ ok: false, error: res.error }, res.status || 400);
  const geoAuditIds = [];
  try {
    const geoAuditEv = detectRecordGeoAuditEvent(canonTable, exHydratedRls, recordToWrite, 'records');
    if (geoAuditEv) {
      const gaid = await recordGeoAuditEvent(env.DB, request, session, geoAuditEv);
      if (typeof gaid === 'string' && gaid) geoAuditIds.push(gaid);
    }
  } catch (_) {}
  let rollbackToken = '';
  try {
    const afterRow = await env.DB.prepare(`SELECT * FROM ${canonTable} WHERE id = ?1`).bind(String(res.id)).first();
    const writtenSig = afterRow ? stableRowSig(hydrateRowJson(afterRow)) : '';
    const actorKey = getSessionActorKey(session);
    if (writtenSig && actorKey) {
      rollbackToken = await storeRollbackToken(env.DB, {
        kind: 'records',
        actor: actorKey,
        table: canonTable,
        id: String(res.id),
        existed: Boolean(exRow),
        prevRow: prevRowForRb,
        writtenSig,
        geoAuditIds
      });
    }
  } catch (_) {}
  return jsonResponse({
    ok: true,
    edge: true,
    table: res.table,
    id: res.id,
    ...(rollbackToken ? { rollbackToken } : {}),
    ...(recordToWrite.voided ? {
      voided_by: recordToWrite.voided_by || '',
      voided_by_email: recordToWrite.voided_by_email || '',
      voided_at: recordToWrite.voided_at || ''
    } : {})
  });
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

const GEO_IND_COMPANIES = Object.freeze({
  'manufacturing': ['WTC', 'BBConstruction', 'Lions Transport'],
  'holding': ['Bdeir Holding'],
  'holding & treasury': ['Bdeir Holding'],
  'holding & group treasury': ['Bdeir Holding'],
  'hospitality': ['Blanca', 'La Una', 'Palms', 'Voile', 'Platinum'],
  'hospitality & resorts': ['Blanca', 'La Una', 'Palms', 'Voile', 'Platinum'],
  'trading': ['Korri Auto', 'Shacman'],
  'automotive & trading': ['Korri Auto', 'Shacman'],
  'automotive & heavy trading': ['Korri Auto', 'Shacman'],
  'real estate': ['Properties', '4235 Company S.A.L'],
  'realestate': ['Properties', '4235 Company S.A.L'],
  'real estate & property': ['Properties', '4235 Company S.A.L'],
  'insurance': ['Insurance Company'],
  'insurance & brokerage': ['Insurance Company']
});

const GEO_RL_BUCKETS = ['companyHubs', 'regions', 'sites', 'pairKmOverrides', 'verifiedRoutes'];
const GEO_MFG_HUB_COMPANIES = new Set(
  (GEO_IND_COMPANIES.manufacturing || []).map(c => canonicalizeCompanyName(c).toLowerCase())
);

function normGeoKeyToken(val) {
  return String(val || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normGeoSiteCat(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'customer' || s === 'delivery' || s === 'sales') return 'customer';
  if (s === 'supplier' || s === 'quarry' || s === 'raw') return 'supplier';
  return '';
}

function describeGeoSiteEntry(key, val) {
  const obj = (val && typeof val === 'object') ? val : {};
  const valCo = String(obj.company || obj.resort || obj.entity || '').trim();
  const infInd = valCo ? inferEntityIndustry(valCo) : '';
  const split = splitGeoBucketKey(key, obj, infInd || 'Manufacturing');
  let cat = '';
  let companyNorm = valCo ? canonicalizeCompanyName(valCo).toLowerCase() : '';
  const tokens = new Set();
  const pushTok = (raw) => {
    const t = normGeoKeyToken(raw);
    if (t) tokens.add(t);
  };
  const extractCat = (s) => {
    let cur = String(s || '').trim();
    const mPre = cur.match(/^(customer|supplier):/i);
    if (mPre) {
      if (!cat) cat = mPre[1].toLowerCase();
      cur = cur.slice(mPre[0].length).trim();
    }
    const mSuf = cur.match(/\|(customer|supplier)$/i);
    if (mSuf) {
      if (!cat) cat = mSuf[1].toLowerCase();
      cur = cur.slice(0, cur.length - mSuf[0].length).trim();
    }
    return cur;
  };
  const noCat = extractCat(split.bodyStr);
  pushTok(noCat);
  const cIdx = noCat.indexOf(':');
  if (cIdx > 0) {
    const head = noCat.slice(0, cIdx).trim();
    const tail = extractCat(noCat.slice(cIdx + 1));
    if (tail && isKnownCanonicalCompany(head)) {
      if (!companyNorm) companyNorm = canonicalizeCompanyName(head).toLowerCase();
      pushTok(tail);
    }
  }
  if (!cat && obj.site_category && !obj._seedCatAuto) {
    cat = normGeoSiteCat(obj.site_category);
  }
  if (obj.name) pushTok(obj.name);
  if (obj.id) pushTok(obj.id);
  return { indKey: split.indKey, cat, companyNorm, tokens };
}

function findMatchingPrevSiteEntries(prevSites, incKey, incVal, dbHits = []) {
  if (!prevSites || typeof prevSites !== 'object') return [];
  const entries = Object.entries(prevSites);
  if (!entries.length) return [];
  const incDesc = describeGeoSiteEntry(incKey, incVal);
  const dbCats = new Set((dbHits || []).map(h => h && h.siteCategory).filter(Boolean));
  const hasIncCatTwin = Boolean(incDesc.cat && dbCats.has(incDesc.cat));
  const matches = [];
  for (const [pk, pv] of entries) {
    if (pv == null) continue;
    if (pk === incKey) {
      matches.push([pk, pv]);
      continue;
    }
    const pDesc = describeGeoSiteEntry(pk, pv);
    if (pDesc.indKey !== incDesc.indKey) continue;
    let tokMatch = false;
    for (const t of pDesc.tokens) {
      if (incDesc.tokens.has(t)) { tokMatch = true; break; }
    }
    if (!tokMatch) continue;
    if (pDesc.companyNorm && incDesc.companyNorm && pDesc.companyNorm !== incDesc.companyNorm) continue;
    if (pDesc.cat && incDesc.cat && pDesc.cat !== incDesc.cat && hasIncCatTwin) continue;
    matches.push([pk, pv]);
  }
  return matches;
}

function describeGeoRegionEntry(key, val) {
  const obj = (val && typeof val === 'object') ? val : {};
  const valCo = String(obj.company || obj.resort || obj.entity || '').trim();
  const infInd = valCo ? inferEntityIndustry(valCo) : '';
  const split = splitGeoBucketKey(key, obj, infInd || 'Manufacturing');
  const body = String(split.bodyStr || '').trim();
  const tokens = new Set();
  for (const cand of [body, obj.name, obj.id]) {
    const t = normGeoKeyToken(cand);
    if (t) tokens.add(t);
  }
  const cIdx = body.indexOf(':');
  if (cIdx > 0) {
    const head = body.slice(0, cIdx).trim();
    const tail = body.slice(cIdx + 1).trim();
    if (tail && isKnownCanonicalCompany(head)) {
      const t = normGeoKeyToken(tail);
      if (t) tokens.add(t);
    }
  }
  return { indKey: split.indKey, tokens };
}

function findMatchingPrevRegionEntries(prevRegions, incKey, incVal) {
  if (!prevRegions || typeof prevRegions !== 'object') return [];
  const entries = Object.entries(prevRegions);
  if (!entries.length) return [];
  const incDesc = describeGeoRegionEntry(incKey, incVal);
  const matches = [];
  for (const [pk, pv] of entries) {
    if (pv == null) continue;
    if (pk === incKey) {
      matches.push([pk, pv]);
      continue;
    }
    const pDesc = describeGeoRegionEntry(pk, pv);
    if (pDesc.indKey !== incDesc.indKey) continue;
    let tokMatch = false;
    for (const t of pDesc.tokens) {
      if (incDesc.tokens.has(t)) { tokMatch = true; break; }
    }
    if (tokMatch) matches.push([pk, pv]);
  }
  return matches;
}

function stripGeoSiteCategorySuffix(bodyStr) {
  return String(bodyStr || '').trim()
    .replace(/^(?:customer|supplier):/i, '')
    .replace(/\|(?:customer|supplier)$/i, '')
    .trim();
}

function splitGeoBucketKey(key, val, fallbackInd = 'Manufacturing') {
  const kStr = String(key || '').trim();
  const parts = kStr.split('::');
  const valInd = (val && typeof val === 'object' && (val._industry || val.industry || val.ind))
    ? String(val._industry || val.industry || val.ind).trim()
    : '';
  const rawInd = parts.length > 1 ? parts[0] : (valInd || fallbackInd || 'Manufacturing');
  const indKey = canonGeoIndustryKey(rawInd).toLowerCase();
  const bodyStr = parts.length > 1 ? parts.slice(1).join('::') : kStr;
  return { kStr, parts, hasIndPrefix: parts.length > 1, valInd, indKey, bodyStr };
}

const ENTITY_TO_GEO_IND = {
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

function inferEntityIndustry(coRaw) {
  const ck = canonEntityKey(coRaw);
  return ENTITY_TO_GEO_IND[ck] || '';
}

function inferDomainIndustry(obj, keyHint = '') {
  if (obj && typeof obj === 'object') {
    const rawInd = String(obj._industry || obj.industry || obj.ind || '').trim();
    if (rawInd) {
      const ci = canonGeoIndustryKey(rawInd);
      if (ci) return ci;
    }
    const rawCo = String(obj.company || obj.fromCo || obj.resort || obj.entity || '').trim();
    const normCo = rawCo.toLowerCase().replace(/\s+/g, ' ');
    if (rawCo && !['all', 'all bus', 'all companies', 'shared'].includes(normCo)) {
      const byCo = inferEntityIndustry(rawCo);
      if (byCo) return byCo;
    }
  }
  const hint = String(keyHint || '').trim();
  if (hint.includes('::')) {
    const parts = hint.split('::');
    const head = parts[0].trim();
    const effHead = (head.toLowerCase() === 'wf' && parts.length > 1) ? String(parts[1] || '').trim() : head;
    if (effHead) {
      const hl = effHead.toLowerCase();
      if (hl.startsWith('hsp') || hl === 'resort' || hl === 'resorts') return 'Hospitality & Resorts';
      if (hl.startsWith('hld') || hl === 'holding') return 'Holding & Treasury';
      if (hl.startsWith('trd') || hl === 'trading') return 'Automotive & Heavy Trading';
      if (hl.startsWith('res') || hl.startsWith('re_') || hl === 'realestate' || hl === 'real_estate' || hl === 'prop' || hl === 'properties') return 'Real Estate & Property';
      if (hl.startsWith('ins') || hl === 'insurance') return 'Insurance & Brokerage';
      if (hl.startsWith('mfg') || hl === 'manufacturing') return 'Manufacturing';
      const byHead = canonGeoIndustryKey(effHead);
      if (byHead) return byHead;
    }
  }
  if (hint) {
    const hl = hint.toLowerCase();
    if (/resort|hospitality|blanca|la.?una|palms|voile|platinum|\bhsp\b/.test(hl)) return 'Hospitality & Resorts';
    if (/holding|treasury|\bhld\b/.test(hl)) return 'Holding & Treasury';
    if (/trading|auto|korri|shacman|\btrd\b/.test(hl)) return 'Automotive & Heavy Trading';
    if (/real.?estate|property|properties|4235|\bres\b/.test(hl)) return 'Real Estate & Property';
    if (/insur|broker|\bins\b/.test(hl)) return 'Insurance & Brokerage';
  }
  return '';
}

function canAccessUniversalGeoRow(session, canonTable, row) {
  if (!session) return false;
  if (isOwnerOrFullGroupSession(session)) return true;
  if (!row || typeof row !== 'object') return false;
  const co = String(row.company || row.resort || row.entity || '').trim();
  const normCo = co.toLowerCase().replace(/\s+/g, ' ');
  const isSharedCo = !normCo || normCo === 'all' || normCo === 'all bus' || normCo === 'all companies' || normCo === 'shared';
  if (!isSharedCo && !canAccessCompany(session, co)) return false;
  if (canonTable === 'sites' || canonTable === 'regions') {
    let indRaw = String(row._industry || row.industry || row.ind || '').trim();
    if (!indRaw && !isSharedCo) indRaw = inferEntityIndustry(co);
    if (!canAccessGeoIndustrySession(session, indRaw || 'Manufacturing')) return false;
  }
  return true;
}

function isRecentGeoTimestamp(isoStr, maxAgeMs = 10 * 60 * 1000) {
  const s = String(isoStr || '').trim();
  if (!s) return false;
  const ms = Date.parse(s);
  return Number.isFinite(ms) && Math.abs(Date.now() - ms) <= maxAgeMs;
}

async function loadGeoEntityLookup(db) {
  const out = {
    sitesByIndAndName: new Map(),
    sitesByIndAndId: new Map(),
    sitesByName: new Map(),
    sitesById: new Map(),
    regionsByIndAndName: new Map(),
    regionsByIndAndId: new Map(),
    regionsByName: new Map(),
    regionsById: new Map()
  };
  if (!db) return out;
  const pushMap = (map, key, val) => {
    if (!key) return;
    let arr = map.get(key);
    if (!arr) { arr = []; map.set(key, arr); }
    arr.push(val);
  };
  try {
    const sRes = await db.prepare('SELECT * FROM sites').all();
    for (const r of (sRes.results || [])) {
      const h = hydrateRowJson(r);
      if (!h || h.voided) continue;
      const rawCo = String(h.company || '').trim();
      const co = rawCo ? canonicalizeCompanyName(rawCo) : '';
      const indKey = canonGeoIndustryKey(h._industry || h.industry || h.ind || 'Manufacturing').toLowerCase();
      const [lat, lng] = extractSiteLatLng(h);
      const id = String(h.id || '').trim();
      const name = String(h.name || '').trim();
      let rawSc = String(h.site_category || '').trim().toLowerCase();
      if (!rawSc) {
        if (h.customer && !h.supplier) rawSc = 'customer';
        else if (h.supplier && !h.customer) rawSc = 'supplier';
      }
      const rec = {
        id,
        name,
        company: co,
        region: String(h.region || '').trim(),
        siteCategory: normGeoSiteCat(rawSc),
        raw: h,
        indKey,
        lat,
        lng,
        hasValidPin: lat !== null && lng !== null,
        pinCleared: Boolean(h._pinCleared || h.pin_cleared || h.pinCleared),
        enteredBy: String(h.entered_by || h.enteredBy || '').trim().toLowerCase(),
        enteredAt: String(h.entered_at || h.enteredAt || h.created_at || '').trim(),
        modifiedBy: String(h.modified_by || h.modifiedBy || '').trim().toLowerCase(),
        modifiedAt: String(h.modified_at || h.modifiedAt || '').trim()
      };
      const nk = normGeoKeyToken(name);
      const ik = id.toLowerCase();
      pushMap(out.sitesByIndAndName, `${indKey}::${nk}`, rec);
      pushMap(out.sitesByIndAndId, `${indKey}::${ik}`, rec);
      pushMap(out.sitesByName, nk, rec);
      pushMap(out.sitesById, ik, rec);
    }
  } catch (_) {}
  try {
    const rRes = await db.prepare('SELECT * FROM regions').all();
    for (const r of (rRes.results || [])) {
      const h = hydrateRowJson(r);
      if (!h || h.voided) continue;
      const indKey = canonGeoIndustryKey(h._industry || h.industry || h.ind || 'Manufacturing').toLowerCase();
      const id = String(h.id || '').trim();
      const name = String(h.name || '').trim();
      const rec = {
        id,
        name,
        indKey,
        raw: h,
        hasShape: hasAnyRegionZoneShape(h),
        enteredBy: String(h.entered_by || h.enteredBy || '').trim().toLowerCase(),
        enteredAt: String(h.entered_at || h.enteredAt || h.created_at || '').trim(),
        modifiedBy: String(h.modified_by || h.modifiedBy || '').trim().toLowerCase(),
        modifiedAt: String(h.modified_at || h.modifiedAt || '').trim()
      };
      const nk = normGeoKeyToken(name);
      const ik = id.toLowerCase();
      pushMap(out.regionsByIndAndName, `${indKey}::${nk}`, rec);
      pushMap(out.regionsByIndAndId, `${indKey}::${ik}`, rec);
      pushMap(out.regionsByName, nk, rec);
      pushMap(out.regionsById, ik, rec);
    }
  } catch (_) {}
  return out;
}

function lookupGeoSitesForBucketKey(geoLookup, indKey, rawBody, hasIndPrefix, extraTokens = null) {
  if (!geoLookup) return [];
  const stripped = stripGeoSiteCategorySuffix(rawBody);
  const candidates = [];
  if (stripped) candidates.push({ token: stripped, companyFilter: '' });
  const colonIdx = stripped.indexOf(':');
  if (colonIdx > 0) {
    const head = stripped.slice(0, colonIdx).trim();
    const tail = stripGeoSiteCategorySuffix(stripped.slice(colonIdx + 1));
    if (tail && isKnownCanonicalCompany(head)) {
      candidates.push({ token: tail, companyFilter: canonicalizeCompanyName(head).toLowerCase() });
    }
  }
  for (const et of (extraTokens || [])) {
    const ets = stripGeoSiteCategorySuffix(et);
    if (ets) candidates.push({ token: ets, companyFilter: '' });
  }
  if (!candidates.length) return [];
  const hits = [];
  const seen = new Set();
  const addList = (arr, companyFilter) => {
    for (const item of (arr || [])) {
      if (companyFilter && item.company && item.company.toLowerCase() !== companyFilter) continue;
      const uid = item.id || `${item.indKey}::${item.name}::${item.company}`;
      if (!seen.has(uid)) { seen.add(uid); hits.push(item); }
    }
  };
  for (const cand of candidates) {
    const nk = normGeoKeyToken(cand.token);
    const ik = cand.token.toLowerCase();
    if (!nk) continue;
    addList(geoLookup.sitesByIndAndId.get(`${indKey}::${ik}`), cand.companyFilter);
    addList(geoLookup.sitesByIndAndName.get(`${indKey}::${nk}`), cand.companyFilter);
  }
  if (!hits.length && !hasIndPrefix) {
    for (const cand of candidates) {
      const nk = normGeoKeyToken(cand.token);
      const ik = cand.token.toLowerCase();
      if (!nk) continue;
      addList(geoLookup.sitesById.get(ik), cand.companyFilter);
      addList(geoLookup.sitesByName.get(nk), cand.companyFilter);
    }
  }
  return hits;
}

function lookupGeoRegionsForBucketKey(geoLookup, indKey, rawBody, hasIndPrefix, extraTokens = null) {
  if (!geoLookup) return [];
  const toks = [rawBody, ...((extraTokens && Array.isArray(extraTokens)) ? extraTokens : [])];
  const hits = [];
  const seen = new Set();
  const addList = (arr) => {
    for (const item of (arr || [])) {
      const uid = item.id || `${item.indKey}::${item.name}`;
      if (!seen.has(uid)) { seen.add(uid); hits.push(item); }
    }
  };
  for (const rawTok of toks) {
    const nk = normGeoKeyToken(rawTok);
    const ik = String(rawTok || '').trim().toLowerCase();
    if (!nk) continue;
    addList(geoLookup.regionsByIndAndId.get(`${indKey}::${ik}`));
    addList(geoLookup.regionsByIndAndName.get(`${indKey}::${nk}`));
    if (!hits.length && !hasIndPrefix) {
      addList(geoLookup.regionsById.get(ik));
      addList(geoLookup.regionsByName.get(nk));
    }
  }
  return hits;
}

function canAccessGeoBucketEntry(session, bucket, key, val, geoLookup = null) {
  if (!session) return false;
  if (isOwnerOrFullGroupSession(session)) return true;
  if (bucket === 'companyHubs') {
    const hubCo = canonicalizeCompanyName(key);
    if (!GEO_MFG_HUB_COMPANIES.has(hubCo.toLowerCase())) return false;
    const vCo = (val && typeof val === 'object' && val.company) ? String(val.company).trim() : '';
    return canAccessCompany(session, hubCo) && (!vCo || canAccessCompany(session, vCo));
  }
  if (val && typeof val === 'object') {
    const vCo = String(val.company || val.resort || val.entity || '').trim();
    if (vCo && !canAccessCompany(session, vCo)) return false;
  }
  const split = splitGeoBucketKey(key, val, 'Manufacturing');
  let indKey = split.indKey;
  if (!split.hasIndPrefix && !split.valInd && geoLookup) {
    if (bucket === 'regions') {
      const regHits = lookupGeoRegionsForBucketKey(geoLookup, indKey, split.bodyStr, false);
      if (regHits.length === 1 && regHits[0].indKey) indKey = regHits[0].indKey;
      else if (regHits.length > 1) {
        if (!regHits.some(r => canAccessGeoIndustrySession(session, r.indKey))) return false;
      }
    } else if (bucket === 'sites') {
      const siteHits = lookupGeoSitesForBucketKey(geoLookup, indKey, split.bodyStr, false);
      if (siteHits.length === 1 && siteHits[0].indKey) indKey = siteHits[0].indKey;
      else if (siteHits.length > 1) {
        if (!siteHits.some(s => canAccessGeoIndustrySession(session, s.indKey))) return false;
      }
    }
  }
  const cos = GEO_IND_COMPANIES[indKey];
  if (!cos || !cos.length) return false;
  if (!canAccessGeoIndustrySession(session, indKey)) return false;
  const cosSet = new Set(cos.map(c => canonicalizeCompanyName(c).toLowerCase()));
  if (bucket === 'sites' && geoLookup) {
    const siteHits = lookupGeoSitesForBucketKey(geoLookup, indKey, split.bodyStr, split.hasIndPrefix);
    if (siteHits.length && !siteHits.some(s => !s.company || canAccessCompany(session, s.company))) {
      return false;
    }
  }
  for (const seg of split.bodyStr.split(/\|\|?/)) {
    const s = String(seg || '').trim();
    const bm = s.match(/^bu:(.+)$/i);
    if (bm && !canAccessCompany(session, bm[1].trim())) return false;
    const sm = s.match(/^site:(.+)$/i);
    if (sm) {
      const siteRef = sm[1].trim();
      const srColon = siteRef.indexOf(':');
      if (srColon > 0) {
        const srHead = siteRef.slice(0, srColon).trim();
        if (srHead && isKnownCanonicalCompany(srHead) && !canAccessCompany(session, canonicalizeCompanyName(srHead))) {
          return false;
        }
      }
      if (geoLookup) {
        const sHits = lookupGeoSitesForBucketKey(geoLookup, indKey, siteRef, split.hasIndPrefix);
        if (sHits.length) {
          if (!sHits.some(h => !h.company || canAccessCompany(session, h.company))) return false;
        } else if (isKnownCanonicalCompany(siteRef) && !canAccessCompany(session, siteRef)) {
          return false;
        }
      } else if (isKnownCanonicalCompany(siteRef) && !canAccessCompany(session, siteRef)) {
        return false;
      }
    }
  }
  if (bucket === 'sites' && split.bodyStr.includes(':')) {
    const firstTok = split.bodyStr.slice(0, split.bodyStr.indexOf(':')).trim();
    if (firstTok && isKnownCanonicalCompany(firstTok)) {
      const cName = canonicalizeCompanyName(firstTok);
      if (cosSet.has(cName.toLowerCase()) && !canAccessCompany(session, cName)) return false;
    }
  }
  return true;
}

export function scopeGeoConfigForSession(geoObj, session, geoLookup = null) {
  if (!geoObj || typeof geoObj !== 'object') return geoObj;
  if (session && isOwnerOrFullGroupSession(session)) return geoObj;
  const out = Object.assign({}, geoObj);
  for (const bucket of GEO_RL_BUCKETS) {
    if (geoObj[bucket] && typeof geoObj[bucket] === 'object') {
      const scoped = {};
      for (const [k, v] of Object.entries(geoObj[bucket])) {
        if (canAccessGeoBucketEntry(session, bucket, k, v, geoLookup)) scoped[k] = v;
      }
      out[bucket] = scoped;
    }
  }
  if (geoObj._pairKmTs && typeof geoObj._pairKmTs === 'object') {
    const keptPairs = (out.pairKmOverrides && typeof out.pairKmOverrides === 'object') ? out.pairKmOverrides : {};
    const scopedPairTs = {};
    for (const [pk, pv] of Object.entries(geoObj._pairKmTs)) {
      if ((pk in keptPairs) || canAccessGeoBucketEntry(session, 'pairKmOverrides', pk, null, geoLookup)) {
        scopedPairTs[pk] = pv;
      }
    }
    out._pairKmTs = scopedPairTs;
  }
  if (geoObj._deletedKeys && typeof geoObj._deletedKeys === 'object') {
    const scopedDel = {};
    for (const [dk, dTs] of Object.entries(geoObj._deletedKeys)) {
      const sDk = String(dk || '');
      const idx = sDk.indexOf(':');
      if (idx > 0) {
        const b = sDk.slice(0, idx);
        const entryKey = sDk.slice(idx + 1);
        const bMap = (geoObj[b] && typeof geoObj[b] === 'object') ? geoObj[b] : {};
        const prevVal = Object.prototype.hasOwnProperty.call(bMap, entryKey) ? bMap[entryKey] : null;
        if (GEO_RL_BUCKETS.includes(b) && !canAccessGeoBucketEntry(session, b, entryKey, prevVal, geoLookup)) continue;
      }
      scopedDel[dk] = dTs;
    }
    out._deletedKeys = scopedDel;
  }
  return out;
}

export async function resolveGeoWriteAccess(db, session) {
  if (!session) {
    return { canWriteGeo: false, canEnterSitePin: false, effectiveSession: null, perms: getSessionWritePerms(null) };
  }
  let effectiveSession = session;
  const uid = String(session.sub || session.id || '').trim();
  const em = String(session.email || '').trim().toLowerCase();
  if (db) {
    let row = null;
    if (uid) {
      row = await db.prepare('SELECT * FROM users WHERE id = ?1 LIMIT 1').bind(uid).first();
    }
    if (!row && em) {
      row = await db.prepare('SELECT * FROM users WHERE lower(email) = ?1 LIMIT 1').bind(em).first();
    }
    if (row) {
      if (row.status && String(row.status).toLowerCase() === 'suspended') {
        return { canWriteGeo: false, canEnterSitePin: false, effectiveSession: session, perms: getSessionWritePerms(null) };
      }
      effectiveSession = {
        sub: row.id || uid,
        id: row.id || uid,
        email: row.email || em,
        role: row.role || '',
        companies: row.companies,
        custom_perms: typeof row.custom_perms === 'string'
          ? safeJsonParse(row.custom_perms, row.custom_perms)
          : row.custom_perms
      };
    }
  }
  const perms = getSessionWritePerms(effectiveSession);
  return {
    canWriteGeo: Boolean(perms.canWriteGeoConfig),
    canEnterSitePin: Boolean(perms.canEnterSite),
    effectiveSession,
    perms
  };
}

export async function resolveCanWriteWorkSchedules(db, session, baseUsersOpt = null) {
  if (!session) return false;
  const uid = String(session.sub || session.id || '').trim();
  const em = String(session.email || '').trim().toLowerCase();
  const normalizeUserForWsCheck = (u) => ({
    sub: u.id || u.sub || '',
    id: u.id || u.sub || '',
    email: u.email || '',
    role: u.role || '',
    companies: u.companies,
    custom_perms: typeof u.custom_perms === 'string'
      ? safeJsonParse(u.custom_perms, u.custom_perms)
      : u.custom_perms
  });
  if (Array.isArray(baseUsersOpt) && baseUsersOpt.length) {
    const matched = baseUsersOpt.find(u =>
      u && typeof u === 'object' && (
        (uid && String(u.id || u.sub || '').trim() === uid) ||
        (em && String(u.email || '').trim().toLowerCase() === em)
      )
    );
    if (matched) {
      if (matched.status && String(matched.status).toLowerCase() === 'suspended') return false;
      return canWriteWorkSchedulesSession(normalizeUserForWsCheck(matched));
    }
  }
  if (db) {
    let row = null;
    if (uid) {
      row = await db.prepare('SELECT * FROM users WHERE id = ?1 LIMIT 1').bind(uid).first();
    }
    if (!row && em) {
      row = await db.prepare('SELECT * FROM users WHERE lower(email) = ?1 LIMIT 1').bind(em).first();
    }
    if (row) {
      if (row.status && String(row.status).toLowerCase() === 'suspended') return false;
      return canWriteWorkSchedulesSession(normalizeUserForWsCheck(row));
    }
  }
  return canWriteWorkSchedulesSession(session);
}

export function tsCmp(a, b) {
  const sa = String(a || '');
  const sb = String(b || '');
  const ma = sa ? Date.parse(sa) : NaN;
  const mb = sb ? Date.parse(sb) : NaN;
  if (Number.isFinite(ma) && Number.isFinite(mb)) return ma < mb ? -1 : (ma > mb ? 1 : 0);
  return sa < sb ? -1 : (sa > sb ? 1 : 0);
}

// Staff rules are kept per company and person since Command Center v19.6.343: key `<company>|<name>`, both trimmed
// and lower-cased. A rule whose own company disagrees with its key prefix is never stored (it would shadow or freeze
// another company's rule for that person). Bare-name keys (older rules) are unaffected.
export function staffRuleKeyCompanyMismatch(rk, rule) {
  const key = String(rk || '').trim();
  const bar = key.indexOf('|');
  if (bar < 0 || !rule || typeof rule !== 'object') return false;
  const keyCo = canonEntityKey(key.slice(0, bar));
  const valCo = canonEntityKey(rule.company);
  if (!keyCo || !valCo) return true;
  return keyCo !== valCo;
}

export function mergeCompanyPolicyDefaultEntry(curRaw, incRaw) {
  const curObj = (curRaw && typeof curRaw === 'object') ? curRaw : (curRaw ? { group_id: String(curRaw), updated_at: '' } : null);
  const incObj = (incRaw && typeof incRaw === 'object') ? incRaw : (incRaw ? { group_id: String(incRaw), updated_at: '' } : null);
  if (!curObj) return incObj;
  if (!incObj) return curObj;
  const curTs = String(curObj.updated_at || '');
  const nxtTs = String(incObj.updated_at || '');
  const curMs = Date.parse(curTs);
  const incWinsOverall = !curTs || !nxtTs || tsCmp(nxtTs, curTs) >= 0;
  const merged = incWinsOverall ? Object.assign({}, curObj, incObj) : Object.assign({}, incObj, curObj);
  let bumpedMs = 0;

  // Sub-clock 1: holidays (holidays.updated_at)
  const curHolTs = String((curObj.holidays && curObj.holidays.updated_at) || '');
  const incHolTs = String((incObj.holidays && incObj.holidays.updated_at) || '');
  if (incWinsOverall) {
    if (curObj.holidays && (!incObj.holidays || (curHolTs && (!incHolTs || tsCmp(curHolTs, incHolTs) > 0)))) {
      merged.holidays = curObj.holidays;
      const incMs = Date.parse(nxtTs);
      bumpedMs = Math.max(bumpedMs, Date.now(), Number.isFinite(incMs) ? incMs + 1000 : 0);
    }
  } else if (incObj.holidays && (!curObj.holidays || (incHolTs && (!curHolTs || tsCmp(incHolTs, curHolTs) > 0)))) {
    merged.holidays = incObj.holidays;
    bumpedMs = Math.max(bumpedMs, Date.now(), Number.isFinite(curMs) ? curMs + 1000 : 0);
  }

  // Sub-clock 2: company effective-dated policy timeline (policy_timeline_updated_at)
  const curTl = Array.isArray(curObj.policy_timeline) ? curObj.policy_timeline : null;
  const incTl = Array.isArray(incObj.policy_timeline) ? incObj.policy_timeline : null;
  const curTlTs = String(curObj.policy_timeline_updated_at || '');
  const incTlTs = String(incObj.policy_timeline_updated_at || '');
  if (incWinsOverall) {
    if (curTl && (!incTl || (curTlTs && (!incTlTs || tsCmp(curTlTs, incTlTs) > 0)))) {
      merged.policy_timeline = curTl;
      merged.policy_timeline_updated_at = curTlTs;
      const incMs = Date.parse(nxtTs);
      bumpedMs = Math.max(bumpedMs, Date.now(), Number.isFinite(incMs) ? incMs + 1000 : 0);
    }
  } else if (incTl && (!curTl || (incTlTs && (!curTlTs || tsCmp(incTlTs, curTlTs) > 0)))) {
    merged.policy_timeline = incTl;
    merged.policy_timeline_updated_at = incTlTs;
    bumpedMs = Math.max(bumpedMs, Date.now(), Number.isFinite(curMs) ? curMs + 1000 : 0);
  }

  if (bumpedMs > 0) merged.updated_at = new Date(bumpedMs).toISOString();
  return merged;
}

export function mergeWorkSchedulesDocs(prevWsRaw, nextWsRaw, session, restrictRls) {
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
      if (!cur || !curTs || !nxtTs || tsCmp(nxtTs, curTs) >= 0) {
        pgMap.set(gid, g);
      }
    }
    mergedPg = Array.from(pgMap.values());
  }

  // 2. companyPolicyDefaults
  const prevDefs = (prevWs.companyPolicyDefaults && typeof prevWs.companyPolicyDefaults === 'object') ? prevWs.companyPolicyDefaults : {};
  const nextDefs = (nextWs.companyPolicyDefaults && typeof nextWs.companyPolicyDefaults === 'object') ? nextWs.companyPolicyDefaults : {};
  const mergedDefs = {};
  const defKeyByNorm = new Map();
  for (const [pk, pv] of Object.entries(prevDefs)) {
    if (!pv || typeof pv !== 'object') continue;
    const normK = String(pk || '').trim().toLowerCase();
    if (!normK) continue;
    const existKey = defKeyByNorm.get(normK);
    if (existKey) {
      mergedDefs[existKey] = mergeCompanyPolicyDefaultEntry(mergedDefs[existKey], pv);
    } else {
      const storeKey = String(pk).trim();
      defKeyByNorm.set(normK, storeKey);
      mergedDefs[storeKey] = Object.assign({}, pv);
    }
  }
  for (const [ck, nv] of Object.entries(nextDefs)) {
    if (!nv || typeof nv !== 'object') continue;
    const normK = String(ck || '').trim().toLowerCase();
    if (!normK) continue;
    if (restrictRls) {
      if (!session || !canAccessCompany(session, ck)) continue;
      if (nv.company && canonEntityKey(nv.company) !== canonEntityKey(ck)) continue;
    }
    const targetKey = defKeyByNorm.get(normK) || String(ck).trim();
    defKeyByNorm.set(normK, targetKey);
    mergedDefs[targetKey] = mergeCompanyPolicyDefaultEntry(mergedDefs[targetKey], nv);
  }

  // 3. shiftTypes
  const prevShifts = Array.isArray(prevWs.shiftTypes) ? prevWs.shiftTypes : [];
  const nextShifts = Array.isArray(nextWs.shiftTypes) ? nextWs.shiftTypes : [];
  const shiftKeyFn = s => `${canonEntityKey((s && s.company) || 'All BUs') || 'all bus'}|${String((s && (s.id || s.shift_code)) || '').trim().toLowerCase()}`;
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
    if (!cur || !curTs || !nxtTs || tsCmp(nxtTs, curTs) >= 0) {
      shiftMap.set(sk, ns);
    }
  }

  // 4. staffRules
  const prevRules = (prevWs.staffRules && typeof prevWs.staffRules === 'object') ? prevWs.staffRules : {};
  const nextRules = (nextWs.staffRules && typeof nextWs.staffRules === 'object') ? nextWs.staffRules : {};
  const mergedRules = Object.assign({}, prevRules);
  for (const [rk, nr] of Object.entries(nextRules)) {
    if (!nr || typeof nr !== 'object') continue;
    if (staffRuleKeyCompanyMismatch(rk, nr)) continue;
    const prevR = mergedRules[rk];
    const prevCo = String((prevR && prevR.company) || '').trim();
    const nextCo = String(nr.company || '').trim();
    const co = nextCo || prevCo;
    if (restrictRls) {
      if (!String(rk || '').includes('|')) continue;
      if (prevR && (!prevCo || !session || !canAccessCompany(session, prevCo))) continue;
      if (!co || !session || !canAccessCompany(session, co)) continue;
    }
    const curTs = prevR ? String(prevR.updated_at || '') : '';
    const nxtTs = String(nr.updated_at || '');
    if (!prevR || !curTs || !nxtTs || tsCmp(nxtTs, curTs) >= 0) {
      // Preserve prevR.company on legacy bare-key updates (company-prefixed keys with blank company are rejected above).
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
        if (!cur || !curTs || !sqlTs || tsCmp(sqlTs, curTs) >= 0) mergedOv[oid] = ov;
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
        if (!cur || !curTs || !sqlTs || tsCmp(sqlTs, curTs) >= 0) custMap.set(cid, sc);
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
    invalidateMapsUsageMemCache();
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
  if (isDemoHeader(request) && request.method === 'GET') {
    return jsonResponse({ ok: true, demo: true, [responseProp]: null });
  }
  if (!session) {
    return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  }
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT payload_json FROM edge_kv_store WHERE doc_key = ?1').bind(docKey).first();
    const parsedVal = row ? safeJsonParse(row.payload_json, null) : null;
    let outVal = parsedVal;
    if (docKey === 'work_schedules' && parsedVal) {
      outVal = scopeWorkSchedulesForSession(parsedVal, session);
    } else if (docKey === 'geo_config' && parsedVal) {
      const getGeoLookup = isOwnerOrFullGroupSession(session) ? null : await loadGeoEntityLookup(env.DB);
      outVal = scopeGeoConfigForSession(parsedVal, session, getGeoLookup);
    }
    return jsonResponse({ ok: true, [responseProp]: outVal });
  }
  if (isDemoHeader(request)) return jsonResponse({ ok: false, error: 'Demo sandbox is read-only' }, 403);
  let effectiveSession = session;
  let geoAccess = null;
  let prevGeoDoc = null;
  const incoming = (body && (body[responseProp] || body.config || body.payload)) || body || {};
  const rejectGeo403 = async (errorMsg, target = {}) => {
    await recordGeoAuditEvent(env.DB, request, effectiveSession || session, {
      action: 'blocked_403',
      outcome: 'blocked_403',
      source: 'geo_config',
      industry: target.industry || 'manufacturing',
      company: target.company || firstGeoCompanyHint(incoming),
      target_type: target.target_type || 'geo_config',
      target_id: target.target_id || '',
      target_label: target.target_label || 'Geo Configuration',
      detail: Object.assign({ error: errorMsg }, target.detail || {})
    });
    return jsonResponse({ ok: false, error: errorMsg }, 403);
  };
  if (docKey === 'geo_config') {
    geoAccess = await resolveGeoWriteAccess(env.DB, session);
    if (!geoAccess.canWriteGeo && !geoAccess.canEnterSitePin) {
      return await rejectGeo403('Map write privileges required.', { target_label: 'Map Settings' });
    }
    effectiveSession = geoAccess.effectiveSession || session;
  } else if (!(await resolveCanWriteWorkSchedules(env.DB, session))) {
    return jsonResponse({ ok: false, error: 'Schedule write privileges required.' }, 403);
  }
  const restrictKvRls = !isOwnerOrFullGroupSession(effectiveSession);
  const nowIso = new Date().toISOString();
  let toStore = incoming;
  if (docKey === 'geo_config' && incoming && typeof incoming === 'object') {
    const parseGeoKm = (v) => {
      if (v === undefined || v === null) return { ok: true, empty: true, km: null };
      if (typeof v === 'boolean' || Array.isArray(v)) return { ok: false };
      const rawKm = (typeof v === 'object') ? v.km : v;
      if (typeof rawKm === 'boolean' || typeof rawKm === 'object' || rawKm === undefined || rawKm === null || String(rawKm).trim() === '') {
        return { ok: false };
      }
      const km = Number(String(rawKm).trim());
      if (!Number.isFinite(km) || km < 0 || km > 5000) return { ok: false };
      return { ok: true, empty: false, km: Math.round(km * 100) / 100 };
    };
    const inHubs = (incoming.companyHubs && typeof incoming.companyHubs === 'object' && !Array.isArray(incoming.companyHubs)) ? incoming.companyHubs : {};
    for (const v of Object.values(inHubs)) {
      if (v === undefined || v === null) continue;
      if (typeof v !== 'object' || Array.isArray(v)) {
        return jsonResponse({ ok: false, error: 'Invalid companyHubs payload.' }, 400);
      }
      const la = ('lat' in v && v.lat !== undefined) ? v.lat : v.latitude;
      const ln = ('lng' in v && v.lng !== undefined) ? v.lng : v.longitude;
      if (!isValidLatLngPair(la, ln)) {
        return jsonResponse({ ok: false, error: 'Invalid hub GPS coordinates.' }, 400);
      }
    }
    const inSites = (incoming.sites && typeof incoming.sites === 'object' && !Array.isArray(incoming.sites)) ? incoming.sites : {};
    for (const v of Object.values(inSites)) {
      if (v === undefined || v === null) continue;
      if (typeof v !== 'object' || Array.isArray(v)) {
        return jsonResponse({ ok: false, error: 'Invalid site geo payload.' }, 400);
      }
      if (!validateRecordGpsCoords(v)) {
        return jsonResponse({ ok: false, error: 'Invalid site GPS coordinates.' }, 400);
      }
      const la = ('lat' in v && v.lat !== undefined) ? v.lat : v.latitude;
      const ln = ('lng' in v && v.lng !== undefined) ? v.lng : v.longitude;
      const hasCoordKey = ('lat' in v || 'latitude' in v || 'lng' in v || 'longitude' in v || 'lon' in v);
      const isCleared = Boolean(v._pinCleared || v.pin_cleared || v.pinCleared);
      if (hasCoordKey && !isCleared && !isValidLatLngPair(la, ln)) {
        return jsonResponse({ ok: false, error: 'Invalid site GPS coordinates.' }, 400);
      }
      if (!hasCoordKey && !isCleared && !String(v.region || '').trim()) {
        return jsonResponse({ ok: false, error: 'Invalid site geo payload.' }, 400);
      }
    }
    const inRegions = (incoming.regions && typeof incoming.regions === 'object' && !Array.isArray(incoming.regions)) ? incoming.regions : {};
    for (const v of Object.values(inRegions)) {
      if (v === undefined || v === null) continue;
      if (typeof v !== 'object' || Array.isArray(v)) {
        return jsonResponse({ ok: false, error: 'Invalid region geo payload.' }, 400);
      }
      if (!validateRecordGpsCoords(v)) {
        return jsonResponse({ ok: false, error: 'Invalid region coordinates or radius.' }, 400);
      }
      const rShape = String(v.shape_type || v.zone_type || '').trim().toLowerCase();
      if (rShape === 'circle') {
        const hasRad = ('radius_km' in v) && v.radius_km !== undefined && v.radius_km !== null && String(v.radius_km).trim() !== '';
        const rk = hasRad ? Number(String(v.radius_km).trim()) : NaN;
        if (!hasRad || !Number.isFinite(rk) || rk <= 0 || rk > 500) {
          return jsonResponse({ ok: false, error: 'Circle region radius_km must be > 0 and <= 500.' }, 400);
        }
      }
    }
    const inPairs = (incoming.pairKmOverrides && typeof incoming.pairKmOverrides === 'object' && !Array.isArray(incoming.pairKmOverrides)) ? incoming.pairKmOverrides : {};
    for (const v of Object.values(inPairs)) {
      if (v === undefined || v === null) continue;
      if (!parseGeoKm(v).ok) {
        return jsonResponse({ ok: false, error: 'Invalid route KM override value (must be 0 to 5000).' }, 400);
      }
    }
    const inVerifiedRoutes = (incoming.verifiedRoutes && typeof incoming.verifiedRoutes === 'object' && !Array.isArray(incoming.verifiedRoutes)) ? incoming.verifiedRoutes : {};
    for (const v of Object.values(inVerifiedRoutes)) {
      if (v === undefined || v === null) continue;
      if (typeof v !== 'object' || Array.isArray(v)) {
        return jsonResponse({ ok: false, error: 'Invalid verified route payload.' }, 400);
      }
      if ('km' in v && v.km !== undefined && v.km !== null && !parseGeoKm(v.km).ok) {
        return jsonResponse({ ok: false, error: 'Invalid verified route KM value (must be 0 to 5000).' }, 400);
      }
      if ('coordsLngLat' in v && v.coordsLngLat !== undefined && v.coordsLngLat !== null) {
        if (!Array.isArray(v.coordsLngLat) || v.coordsLngLat.length < 2 || v.coordsLngLat.length > 128) {
          return jsonResponse({ ok: false, error: 'Invalid verified route coordinates (expected 2 to 128 [lng, lat] points).' }, 400);
        }
        for (const pt of v.coordsLngLat) {
          if (!Array.isArray(pt) || pt.length < 2 || (typeof pt[0] !== 'number' && typeof pt[0] !== 'string') || (typeof pt[1] !== 'number' && typeof pt[1] !== 'string') || String(pt[0]).trim() === '' || String(pt[1]).trim() === '') {
            return jsonResponse({ ok: false, error: 'Invalid verified route coordinate pair.' }, 400);
          }
          const lng = Number(pt[0]);
          const lat = Number(pt[1]);
          if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -85 || lat > 85) {
            return jsonResponse({ ok: false, error: 'Verified route coordinate out of bounds.' }, 400);
          }
        }
      }
      if ('elevProfileM' in v && v.elevProfileM !== undefined && v.elevProfileM !== null) {
        if (!Array.isArray(v.elevProfileM) || v.elevProfileM.length < 2 || v.elevProfileM.length > 128) {
          return jsonResponse({ ok: false, error: 'Invalid verified route elevation profile (expected 2 to 128 samples).' }, 400);
        }
        if (!Array.isArray(v.coordsLngLat) || v.elevProfileM.length !== v.coordsLngLat.length) {
          return jsonResponse({ ok: false, error: 'Verified route elevation profile must match coordinates length.' }, 400);
        }
        for (const eVal of v.elevProfileM) {
          if ((typeof eVal !== 'number' && typeof eVal !== 'string') || String(eVal).trim() === '') {
            return jsonResponse({ ok: false, error: 'Invalid verified route elevation value.' }, 400);
          }
          const n = Number(eVal);
          if (!Number.isFinite(n) || n < -500 || n > 9000) {
            return jsonResponse({ ok: false, error: 'Verified route elevation out of bounds (must be -500 to 9000 m).' }, 400);
          }
        }
      }
    }

    const exRow = await env.DB.prepare('SELECT payload_json FROM edge_kv_store WHERE doc_key = ?1').bind(docKey).first();
    const prev = exRow ? safeJsonParse(exRow.payload_json, null) : null;
    prevGeoDoc = (prev && typeof prev === 'object') ? prev : {};
    const geoLookup = await loadGeoEntityLookup(env.DB);
    const prevDelCheck = (prev && prev._deletedKeys && typeof prev._deletedKeys === 'object') ? prev._deletedKeys : {};
    const inDelCheck = (incoming._deletedKeys && typeof incoming._deletedKeys === 'object') ? incoming._deletedKeys : {};
    const describeBucketTarget = (bucket, k, val) => {
      const split = splitGeoBucketKey(k, val, 'manufacturing');
      const obj = (val && typeof val === 'object') ? val : {};
      const co = canonicalizeCompanyName(obj.company || obj.resort || obj.entity || (bucket === 'companyHubs' ? split.bodyStr : '')) || '';
      const tt = bucket === 'companyHubs' ? 'hub' : bucket === 'sites' ? 'site' : bucket === 'regions' ? 'region' : bucket === 'pairKmOverrides' ? 'pair_km' : bucket === 'verifiedRoutes' ? 'verified_route' : 'geo_config';
      return {
        industry: split.indKey || 'manufacturing',
        company: co,
        target_type: tt,
        target_id: String(obj.id || k || ''),
        target_label: String(obj.name || split.bodyStr || k || bucket)
      };
    };

    if (restrictKvRls) {
      for (const bucket of GEO_RL_BUCKETS) {
        const prevBucket = (prev && prev[bucket] && typeof prev[bucket] === 'object') ? prev[bucket] : {};
        const inBucket = (incoming[bucket] && typeof incoming[bucket] === 'object') ? incoming[bucket] : {};
        for (const [bkKey, bkVal] of Object.entries(inBucket)) {
          const hasPrev = Object.prototype.hasOwnProperty.call(prevBucket, bkKey) && prevBucket[bkKey] != null;
          const changed = !hasPrev || stableRowSig(prevBucket[bkKey]) !== stableRowSig(bkVal);
          if (changed) {
            const canInc = canAccessGeoBucketEntry(effectiveSession, bucket, bkKey, bkVal, geoLookup);
            const canPrev = !hasPrev || canAccessGeoBucketEntry(effectiveSession, bucket, bkKey, prevBucket[bkKey], geoLookup);
            if (!canInc || !canPrev) {
              return await rejectGeo403(`Row-level security: cannot modify another entity geo configuration (${bucket}).`, describeBucketTarget(bucket, bkKey, bkVal || prevBucket[bkKey]));
            }
          }
        }
      }
      for (const [dk, dTs] of Object.entries(inDelCheck)) {
        const sDk = String(dk || '');
        const idx = sDk.indexOf(':');
        if (idx > 0) {
          const bucket = sDk.slice(0, idx);
          const entryKey = sDk.slice(idx + 1);
          const prevBucket = (prev && prev[bucket] && typeof prev[bucket] === 'object') ? prev[bucket] : {};
          const prevVal = Object.prototype.hasOwnProperty.call(prevBucket, entryKey) ? prevBucket[entryKey] : null;
          if (GEO_RL_BUCKETS.includes(bucket) && String(prevDelCheck[dk] || '') !== String(dTs || '') && !canAccessGeoBucketEntry(effectiveSession, bucket, entryKey, prevVal, geoLookup)) {
            return await rejectGeo403(`Row-level security: cannot delete another entity geo configuration (${bucket}).`, describeBucketTarget(bucket, entryKey, prevVal));
          }
        }
      }
    }

    if (!geoAccess.canWriteGeo) {
      const actorEm = String(effectiveSession.email || '').trim().toLowerCase();
      for (const [dk, dTs] of Object.entries(inDelCheck)) {
        if (String(prevDelCheck[dk] || '') !== String(dTs || '')) {
          const sDk = String(dk || '');
          const idx = sDk.indexOf(':');
          const b = idx > 0 ? sDk.slice(0, idx) : 'geo_config';
          const ek = idx > 0 ? sDk.slice(idx + 1) : sDk;
          return await rejectGeo403('Geo write permission required to remove pins, regions, or KM overrides.', describeBucketTarget(b, ek, prev && prev[b] ? prev[b][ek] : null));
        }
      }
      const prevHubs = (prev && prev.companyHubs && typeof prev.companyHubs === 'object') ? prev.companyHubs : {};
      for (const [k, v] of Object.entries(inHubs)) {
        if (v === undefined || v === null) continue;
        if (!(k in prevHubs) || stableRowSig(prevHubs[k]) !== stableRowSig(v)) {
          return await rejectGeo403('Geo write permission required to move or create company hubs.', describeBucketTarget('companyHubs', k, v));
        }
      }
      const prevPairs = (prev && prev.pairKmOverrides && typeof prev.pairKmOverrides === 'object') ? prev.pairKmOverrides : {};
      for (const [k, v] of Object.entries(inPairs)) {
        if (v === undefined || v === null) continue;
        if (!(k in prevPairs) || stableRowSig(prevPairs[k]) !== stableRowSig(v)) {
          return await rejectGeo403('Geo write permission required to edit route KM overrides.', describeBucketTarget('pairKmOverrides', k, v));
        }
      }
      const prevVerifiedRoutes = (prev && prev.verifiedRoutes && typeof prev.verifiedRoutes === 'object') ? prev.verifiedRoutes : {};
      for (const [k, v] of Object.entries(inVerifiedRoutes)) {
        if (v === undefined || v === null) continue;
        if (!(k in prevVerifiedRoutes) || stableRowSig(prevVerifiedRoutes[k]) !== stableRowSig(v)) {
          return await rejectGeo403('Geo write permission required to verify or modify road routes.', describeBucketTarget('verifiedRoutes', k, v));
        }
      }
      const prevPairTs = (prev && prev._pairKmTs && typeof prev._pairKmTs === 'object') ? prev._pairKmTs : {};
      const inPairTsCheck = (incoming._pairKmTs && typeof incoming._pairKmTs === 'object') ? incoming._pairKmTs : {};
      for (const [k, v] of Object.entries(inPairTsCheck)) {
        if (String(prevPairTs[k] || '') !== String(v || '')) {
          return await rejectGeo403('Geo write permission required to edit route KM timestamps.', describeBucketTarget('pairKmOverrides', k, v));
        }
      }
      const prevSites = (prev && prev.sites && typeof prev.sites === 'object') ? prev.sites : {};
      for (const [k, v] of Object.entries(inSites)) {
        if (v === undefined || v === null) continue;
        if (v._pinCleared || v.pin_cleared || v.pinCleared) {
          return await rejectGeo403('Geo write permission required to clear site pins.', describeBucketTarget('sites', k, v));
        }
        const la = normGpsCoord(('lat' in v && v.lat !== undefined) ? v.lat : v.latitude, 90);
        const ln = normGpsCoord(('lng' in v && v.lng !== undefined) ? v.lng : v.longitude, 180);
        const hasValidIncPin = la !== null && ln !== null && !(Math.abs(la) < 1e-4 && Math.abs(ln) < 1e-4);
        const split = splitGeoBucketKey(k, v, 'Manufacturing');
        const dbHits = lookupGeoSitesForBucketKey(geoLookup, split.indKey, split.bodyStr, split.hasIndPrefix, [v.name, v.id]);
        const matchedPrev = findMatchingPrevSiteEntries(prevSites, k, v, dbHits);
        if (matchedPrev.length === 1 && matchedPrev[0][0] === k && stableRowSig(matchedPrev[0][1]) === stableRowSig(v)) {
          continue;
        }
        for (const [pk, prevS] of matchedPrev) {
          if (pk === k && stableRowSig(prevS) === stableRowSig(v)) continue;
          if (!prevS || typeof prevS !== 'object' || prevS._pinCleared || prevS.pin_cleared || prevS.pinCleared) {
            return await rejectGeo403('Geo write permission required to modify existing pinned sites.', describeBucketTarget('sites', k, v));
          }
          const [pLa, pLn] = normalizedGpsPair(prevS, ('lat' in prevS) ? 'lat' : 'latitude', ('lng' in prevS) ? 'lng' : 'longitude');
          if (pLa !== null || pLn !== null) {
            return await rejectGeo403('Geo write permission required to modify existing pinned sites.', describeBucketTarget('sites', k, v));
          }
          if (!hasValidIncPin) {
            return await rejectGeo403('Geo write permission required to modify existing unpinned site entries without adding a valid pin.', describeBucketTarget('sites', k, v));
          }
          for (const mf of ['company', 'site_category', 'name', 'region']) {
            const pm = String(prevS[mf] || '').trim();
            if (!pm) continue;
            const nm = String(v[mf] || '').trim();
            if (nm.toLowerCase() !== pm.toLowerCase()) {
              return await rejectGeo403(`Geo write permission required to modify existing site metadata (${mf}).`, describeBucketTarget('sites', k, v));
            }
          }
        }
        const incDesc = describeGeoSiteEntry(k, v);
        const dbCats = new Set(dbHits.map(d => d && d.siteCategory).filter(Boolean));
        const hasDbTwin = dbCats.has('customer') && dbCats.has('supplier');
        for (const dbSite of dbHits) {
          if (hasDbTwin && incDesc.cat && dbSite.siteCategory && dbSite.siteCategory !== incDesc.cat) continue;
          if (dbSite.pinCleared) {
            return await rejectGeo403('Geo write permission required to re-pin a cleared site.', describeBucketTarget('sites', k, v));
          }
          if (dbSite.hasValidPin) {
            const sameCoords = (la !== null && ln !== null && Math.abs(dbSite.lat - la) < 1e-5 && Math.abs(dbSite.lng - ln) < 1e-5);
            const sameActor = Boolean(actorEm && (dbSite.modifiedBy === actorEm || dbSite.enteredBy === actorEm));
            const recent = isRecentGeoTimestamp(dbSite.modifiedAt || dbSite.enteredAt);
            if (!sameCoords || !(sameActor || recent)) {
              return await rejectGeo403('Geo write permission required to re-pin an already pinned site.', describeBucketTarget('sites', k, v));
            }
          }
          const dbRaw = (dbSite.raw && typeof dbSite.raw === 'object') ? dbSite.raw : {};
          for (const mf of ['company', 'site_category', 'name', 'region']) {
            if (mf === 'site_category' && v._seedCatAuto) continue;
            const pm = String((mf === 'site_category' ? dbSite.siteCategory : '') || dbRaw[mf] || dbSite[mf] || '').trim();
            const nm = String(v[mf] || '').trim();
            if (pm && nm && nm.toLowerCase() !== pm.toLowerCase()) {
              return await rejectGeo403(`Geo write permission required to modify existing site metadata (${mf}).`, describeBucketTarget('sites', k, v));
            }
          }
        }
      }
      const prevRegions = (prev && prev.regions && typeof prev.regions === 'object') ? prev.regions : {};
      for (const [k, v] of Object.entries(inRegions)) {
        if (v === undefined || v === null) continue;
        const matchedPrevRegs = findMatchingPrevRegionEntries(prevRegions, k, v);
        if (matchedPrevRegs.length > 0) {
          if (matchedPrevRegs.length === 1 && matchedPrevRegs[0][0] === k && stableRowSig(matchedPrevRegs[0][1]) === stableRowSig(v)) {
            continue;
          }
          return await rejectGeo403('Geo write permission required to modify existing regions.', describeBucketTarget('regions', k, v));
        }
        const split = splitGeoBucketKey(k, v, 'Manufacturing');
        const dbHits = lookupGeoRegionsForBucketKey(geoLookup, split.indKey, split.bodyStr, split.hasIndPrefix, [v.name, v.id]);
        for (const dbReg of dbHits) {
          if (hasRegionZoneMutation(dbReg.raw, v, { ignoreAbsentDistanceKm: true })) {
            return await rejectGeo403('Geo write permission required to modify an existing region zone.', describeBucketTarget('regions', k, v));
          }
          if (dbReg.hasShape) {
            const sameActor = Boolean(actorEm && (dbReg.enteredBy === actorEm || dbReg.modifiedBy === actorEm));
            const recent = isRecentGeoTimestamp(dbReg.enteredAt || dbReg.modifiedAt);
            if (!(sameActor || recent)) {
              return await rejectGeo403('Geo write permission required to modify an existing region zone.', describeBucketTarget('regions', k, v));
            }
          }
        }
      }
    }
    // Merge happens authoritatively inside upsertGeoConfigWithCas below using fresh CAS rev state.
  } else if (docKey === 'work_schedules') {
    const reqOp = String((body && body.op) || '').trim();
    const isDelOp = reqOp === 'delete_shift' || reqOp === 'delete_policy_group';
    if (body && Object.prototype.hasOwnProperty.call(body, 'work_schedules') && (!body.work_schedules || typeof body.work_schedules !== 'object' || Array.isArray(body.work_schedules))) {
      return jsonResponse({ ok: false, error: 'Invalid work_schedules payload.' }, 400);
    }
    const wsIn = (body && body.work_schedules && typeof body.work_schedules === 'object')
      ? body.work_schedules
      : (isDelOp ? {} : incoming);
    if (!wsIn || typeof wsIn !== 'object' || (!isDelOp && !Array.isArray(wsIn.shiftTypes) && !wsIn.staffRules && !Array.isArray(wsIn.policyGroups) && !wsIn.companyPolicyDefaults)) {
      return jsonResponse({ ok: false, error: 'Invalid work_schedules payload.' }, 400);
    }
    const exRow = await env.DB.prepare('SELECT payload_json FROM edge_kv_store WHERE doc_key = ?1').bind(docKey).first();
    const prevWs = (exRow && safeJsonParse(exRow.payload_json, null)) || { shiftTypes: [], policyGroups: [], companyPolicyDefaults: {}, staffRules: {} };
    if (reqOp === 'upsert_staff_rule' && staffRuleKeyCompanyMismatch(body && body.key, body && body.item)) {
      return jsonResponse({ ok: false, error: 'Row-level security: staff rule key company does not match record company.' }, 403);
    }
    if (isDelOp && !String((body && body.id) || '').trim()) {
      return jsonResponse({ ok: false, error: 'Record id is required.' }, 400);
    }
    if (restrictKvRls) {
      if (reqOp === 'upsert_policy_group' || reqOp === 'delete_policy_group') {
        return jsonResponse({ ok: false, error: 'Row-level security: Owner required to modify global policy groups.' }, 403);
      }
      if (reqOp === 'delete_shift') {
        const delId = String((body && body.id) || '').trim();
        const delCo = String((body && body.company) || '').trim();
        if (delCo && (/^all(\s+(bus|companies))?$/i.test(delCo) || !canAccessCompany(session, delCo))) {
          return jsonResponse({ ok: false, error: 'Row-level security: cannot delete shift schedule outside your assigned entities.' }, 403);
        }
        const prevShiftsAll = Array.isArray(prevWs.shiftTypes) ? prevWs.shiftTypes : [];
        const delCoCanon = delCo ? canonEntityKey(delCo) : '';
        for (const exS of prevShiftsAll) {
          if (!exS || !delId || (String(exS.id || '').trim() !== delId && String(exS.shift_code || '').trim() !== delId)) continue;
          const exCo = String(exS.company || '').trim();
          if (delCoCanon && exCo && !/^all(\s+(bus|companies))?$/i.test(exCo) && canonEntityKey(exCo) !== delCoCanon) {
            continue;
          }
          if (!exCo || /^all(\s+(bus|companies))?$/i.test(exCo) || !canAccessCompany(session, exCo)) {
            return jsonResponse({ ok: false, error: 'Row-level security: cannot delete cross-entity shift schedule.' }, 403);
          }
        }
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
      const prevDefsByLower = new Map();
      for (const [pk, pv] of Object.entries(prevDefs)) {
        const lk = String(pk || '').trim().toLowerCase();
        if (lk && !prevDefsByLower.has(lk)) prevDefsByLower.set(lk, pv);
      }
      const nextDefs = wsIn.companyPolicyDefaults || {};
      for (const [ck, nv] of Object.entries(nextDefs)) {
        const nvCo = nv && typeof nv === 'object' ? String(nv.company || '').trim() : '';
        const mismatchDefCo = Boolean(nvCo && canonEntityKey(nvCo) !== canonEntityKey(ck));
        const prevDefMatch = prevDefs[ck] !== undefined ? prevDefs[ck] : prevDefsByLower.get(String(ck || '').trim().toLowerCase());
        if ((!canAccessCompany(session, ck) || mismatchDefCo) && stableRowSig(prevDefMatch) !== stableRowSig(nv)) {
          return jsonResponse({ ok: false, error: 'Row-level security: cannot modify another entity policy default.' }, 403);
        }
      }
      const prevShifts = Array.isArray(prevWs.shiftTypes) ? prevWs.shiftTypes : [];
      const nextShifts = Array.isArray(wsIn.shiftTypes) ? wsIn.shiftTypes : [];
      const shiftKeyFn = s => `${canonEntityKey((s && s.company) || 'All BUs') || 'all bus'}|${String((s && (s.id || s.shift_code)) || '').trim().toLowerCase()}`;
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
        const keyBar = String(rk || '').indexOf('|');
        const keyCo = keyBar > 0 ? String(rk).slice(0, keyBar).trim() : '';
        const nextCo = String((nr && nr.company) || '').trim();
        if (staffRuleKeyCompanyMismatch(rk, nr)) {
          // Cross-entity target or existing inaccessible rule still returns 403; own-entity mismatched rows drop silently in merge.
          if (((pr && (!prevCo || !canAccessCompany(session, prevCo))) || (keyCo && !canAccessCompany(session, keyCo)) || (nextCo && !canAccessCompany(session, nextCo))) && stableRowSig(pr) !== stableRowSig(nr)) {
            return jsonResponse({ ok: false, error: 'Row-level security: cannot modify cross-entity staff rules.' }, 403);
          }
          continue;
        }
        const co = nextCo || prevCo;
        const isBareKey = !String(rk || '').includes('|');
        if ((!co || !canAccessCompany(session, co) || (pr && (!prevCo || !canAccessCompany(session, prevCo))) || isBareKey) && stableRowSig(pr) !== stableRowSig(nr)) {
          return jsonResponse({ ok: false, error: 'Row-level security: cannot modify cross-entity staff rules.' }, 403);
        }
      }
    }
    let mergeWsIn = wsIn;
    if (reqOp === 'delete_shift' || reqOp === 'delete_policy_group') {
      const delId = String((body && body.id) || '').trim();
      if (delId) {
        const arrKey = reqOp === 'delete_policy_group' ? 'policyGroups' : 'shiftTypes';
        const prevArr = Array.isArray(prevWs[arrKey]) ? prevWs[arrKey] : [];
        const itemIn = (body && body.item && typeof body.item === 'object') ? body.item : null;
        const reqCoRaw = String((body && body.company) || (itemIn && itemIn.company) || '').trim();
        const reqCoCanon = reqCoRaw ? canonEntityKey(reqCoRaw) : '';
        const matchesDel = (x) => {
          if (!x || typeof x !== 'object') return false;
          const idX = String(x.id || '').trim();
          const scX = String(x.shift_code || '').trim();
          const matchedId = reqOp === 'delete_shift'
            ? (idX === delId || scX === delId)
            : (idX === delId);
          if (!matchedId) return false;
          if (reqOp !== 'delete_shift' || !reqCoCanon) return true;
          const xCo = String(x.company || '').trim();
          return !xCo || canonEntityKey(xCo) === reqCoCanon;
        };
        const prevMatches = prevArr.filter(matchesDel);
        const prevMatch = prevMatches[0] || null;
        const delCo = String(reqCoRaw || (prevMatch && prevMatch.company) || '').trim();
        if (reqOp === 'delete_shift' && !delCo) {
          return jsonResponse({ ok: false, error: 'Company is required when deleting a shift type' }, 400);
        }
        if (restrictKvRls) {
          for (const pm of prevMatches) {
            if (pm.company && !canAccessCompany(session, pm.company)) {
              return jsonResponse({ ok: false, error: 'Row-level security: cannot delete another entity record.' }, 403);
            }
          }
          if (delCo && !canAccessCompany(session, delCo)) {
            return jsonResponse({ ok: false, error: 'Row-level security: cannot delete another entity record.' }, 403);
          }
          if (reqOp === 'delete_policy_group' && !delCo && !(prevMatch && prevMatch.company)) {
            return jsonResponse({ ok: false, error: 'Row-level security: Owner or Full Access required to delete shared policy group.' }, 403);
          }
        }
        const maxPrevMs = prevMatches.reduce((mx, pm) => {
          const ms = Date.parse(String((pm && pm.updated_at) || ''));
          return Number.isFinite(ms) && ms > mx ? ms : mx;
        }, 0);
        const prevTs = String((prevMatch && prevMatch.updated_at) || '');
        const minNextIso = new Date(Math.max(Date.now(), maxPrevMs ? maxPrevMs + 1000 : 0)).toISOString();
        const inTs = String((itemIn && itemIn.updated_at) || '');
        const inMs = inTs ? Date.parse(inTs) : NaN;
        const tombTs = (inTs && ((Number.isFinite(inMs) && maxPrevMs > 0) ? (inMs >= maxPrevMs) : (!prevTs || tsCmp(inTs, prevTs) >= 0))) ? inTs : minNextIso;
        const resolvedId = String((prevMatch && prevMatch.id) || (itemIn && itemIn.id) || delId).trim();
        const tomb = Object.assign({}, prevMatch || {}, itemIn || {}, {
          id: resolvedId,
          voided: true,
          updated_at: tombTs
        });
        if (reqOp === 'delete_shift') {
          if (!tomb.shift_code) tomb.shift_code = delId;
          if (!tomb.company) tomb.company = delCo;
        } else if (delCo && !tomb.company) {
          tomb.company = delCo;
        }
        const baseArr = Array.isArray(wsIn[arrKey]) ? wsIn[arrKey].slice() : [];
        const existingIdx = baseArr.findIndex(matchesDel);
        if (existingIdx >= 0) baseArr[existingIdx] = Object.assign({}, baseArr[existingIdx], tomb);
        else baseArr.push(tomb);
        mergeWsIn = Object.assign({}, wsIn, { [arrKey]: baseArr });
      }
    }
    toStore = mergeWorkSchedulesDocs(prevWs, mergeWsIn, session, restrictKvRls);
  }
  if (docKey === 'geo_config') {
    const mergeIncomingGeo = (basePrev) => {
      if (!(incoming && typeof incoming === 'object')) return incoming;
      const prevBase = (basePrev && typeof basePrev === 'object') ? basePrev : {};
      const merged = {
        companyHubs: Object.assign({}, prevBase.companyHubs || {}),
        regions: Object.assign({}, prevBase.regions || {}),
        sites: Object.assign({}, prevBase.sites || {}),
        pairKmOverrides: Object.assign({}, prevBase.pairKmOverrides || {}),
        verifiedRoutes: Object.assign({}, prevBase.verifiedRoutes || {}),
        _pairKmTs: Object.assign({}, prevBase._pairKmTs || {}),
        _deletedKeys: Object.assign({}, prevBase._deletedKeys || {}),
        updatedAt: nowIso
      };
      const inDel = (incoming._deletedKeys && typeof incoming._deletedKeys === 'object') ? incoming._deletedKeys : {};
      const inPairTs = (incoming._pairKmTs && typeof incoming._pairKmTs === 'object') ? incoming._pairKmTs : {};
      for (const [dk, dTs] of Object.entries(inDel)) {
        const tsStr = String(dTs || '');
        if (tsStr && (!merged._deletedKeys[dk] || tsCmp(tsStr, merged._deletedKeys[dk]) > 0)) {
          merged._deletedKeys[dk] = tsStr;
        }
      }
      for (const bucket of ['companyHubs', 'regions', 'sites', 'pairKmOverrides', 'verifiedRoutes']) {
        const src = (incoming[bucket] && typeof incoming[bucket] === 'object') ? incoming[bucket] : {};
        for (const [k, nxt] of Object.entries(src)) {
          if (nxt === undefined || nxt === null) continue;
          const dk = `${bucket}:${k}`;
          const cur = merged[bucket][k];
          const curTs = (cur && typeof cur === 'object' && cur.updated_at) || (bucket === 'pairKmOverrides' && merged._pairKmTs[k]) || '';
          const nxtItemTs = (nxt && typeof nxt === 'object' && nxt.updated_at) || (bucket === 'pairKmOverrides' && inPairTs[k]) || '';
          const nxtTs = nxtItemTs || (cur === undefined ? (incoming.updatedAt || nowIso) : '');
          const delTs = String(merged._deletedKeys[dk] || '');
          if (delTs && (!nxtTs || tsCmp(delTs, nxtTs) > 0)) continue;
          if (cur === undefined || !curTs || (nxtTs && tsCmp(nxtTs, curTs) >= 0)) {
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
        if (!curTs || tsCmp(delTs, curTs) >= 0) {
          delete merged[bucket][k];
          if (bucket === 'pairKmOverrides') delete merged._pairKmTs[k];
        }
      }
      return merged;
    };
    const casRes = await upsertGeoConfigWithCas(env.DB, (prevDocCas) => mergeIncomingGeo(prevDocCas), nowIso);
    if (!casRes.ok) {
      return jsonResponse({ ok: false, error: casRes.error || 'Concurrent geo_config write conflict; please retry.' }, casRes.status || 409);
    }
    toStore = casRes.doc;
    prevGeoDoc = casRes.prevDoc || prevGeoDoc;
    try {
      await auditGeoConfigDiff(env.DB, request, effectiveSession || session, prevGeoDoc || {}, toStore);
    } catch (_) {}
    return jsonResponse({ ok: true, saved: true, updated_at: nowIso });
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

// Owner-only notice documents in edge_kv_store (doc_key = response key); /api/sync neither serves nor patches them.
export const OWNER_NOTICE_DOCS = Object.freeze(['cashflow_behind', 'source_behind', 'changed_entries']);
export function isOwnerNoticeDoc(docKey) {
  return OWNER_NOTICE_DOCS.includes(String(docKey || ''));
}

export async function handleCashflowBehind(request, env, session, body, rawBytes = 0, bodyMeta = null, docKey = 'cashflow_behind') {
  const noticeKey = isOwnerNoticeDoc(docKey) ? String(docKey) : 'cashflow_behind';
  const isStrictOwner = Boolean(session && /\bowner\b/i.test(String(session.role || '')));
  if (request.method === 'GET') {
    if (isDemoHeader(request)) return jsonResponse({ ok: true, demo: true, [noticeKey]: null });
    if (!session) return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
    if (!isStrictOwner) return jsonResponse({ ok: false, error: 'Owner permissions required.' }, 403);
    if (!env || !env.DB) return jsonResponse({ ok: true, [noticeKey]: null });
    const row = await env.DB.prepare('SELECT payload_json FROM edge_kv_store WHERE doc_key = ?1').bind(noticeKey).first();
    return jsonResponse({ ok: true, [noticeKey]: row ? safeJsonParse(row.payload_json, null) : null });
  }
  if (request.method === 'POST') {
    if (isDemoHeader(request)) return jsonResponse({ ok: false, error: 'Demo sandbox is read-only' }, 403);
    if (!session) return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
    if (!isStrictOwner) return jsonResponse({ ok: false, error: 'Owner permissions required.' }, 403);
    const clen = Number(request.headers.get('Content-Length') || 0);
    if (clen > 32768 || Number(rawBytes || 0) > 32768) {
      return jsonResponse({ ok: false, error: 'Notice payload exceeds 32 KB limit.' }, 413);
    }
    if (bodyMeta && (bodyMeta.parseError || bodyMeta.emptyBody)) {
      return jsonResponse({ ok: false, error: 'Valid non-empty JSON body required.' }, 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonResponse({ ok: false, error: `Invalid ${noticeKey} payload.` }, 400);
    }
    const hasWrapper = Object.prototype.hasOwnProperty.call(body, noticeKey);
    const incoming = hasWrapper ? body[noticeKey] : body;
    const validObj = incoming && typeof incoming === 'object' && !Array.isArray(incoming) &&
      typeof incoming.status === 'string' && incoming.status.trim().length > 0;
    if (!(incoming === null && hasWrapper) && !validObj) {
      return jsonResponse({ ok: false, error: `Invalid ${noticeKey} payload.` }, 400);
    }
    const rawJson = JSON.stringify(incoming);
    if (new TextEncoder().encode(rawJson).length > 32768) {
      return jsonResponse({ ok: false, error: 'Notice payload exceeds 32 KB limit.' }, 413);
    }
    if (!env || !env.DB) return jsonResponse({ ok: false, error: 'D1 not bound' }, 503);
    const nowIso = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, rev)
       VALUES (?1, ?2, ?3, 1)
       ON CONFLICT(doc_key) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at, rev = edge_kv_store.rev + 1`
    ).bind(noticeKey, rawJson, nowIso).run();
    return jsonResponse({ ok: true, saved: true, updated_at: nowIso });
  }
  return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405);
}

// ---- Entries held on a device (owner 2026-11-18) ------------------------------------------------------------------
// On 16 and 17 Nov one device kept a day of entries to itself; they reached the store after the evening top-up, which
// could not pair them with their workbook rows. A device whose entries have waited now reports it here when it can
// reach the Edge (its sync push is refused, or it only has to refresh), and the Owner reads the list.
//   * One edge_kv_store row per seat and device: doc_key = device_unsent:<seat id>:<device id>. A seat writes only
//     its own rows; the seat, e-mail and name come from the session, never from the request.
//   * POST { device_id, label, count, since, reason, shell }: count >= 1 = holding; count 0 = sent. A row that held
//     entries for DEVICE_UNSENT_LATE_MIN_MS or longer stays as "sent late" for DEVICE_UNSENT_LATE_HOURS so the Owner
//     knows late entries arrived; a shorter hold (a signal drop) is simply removed.
//   * count >= 1 with sent_late: the device was never able to report (offline the whole time) and has just sent
//     entries that waited an hour or more: filed straight as "sent late".
//   * count 0 with all_seats: the seat's sync has just sent everything it can send from the device, so it also
//     closes the reports other seats left open for the same device (a shared device changes seats) when it can send
//     what those seats send: an Owner or full-group seat closes any; a limited seat closes a report only when it
//     may use every company the reporting seat was limited to (each report keeps its seat's companies).
//     The answer says how many reports for the device are still open (`open`), so the device knows to ask again.
//   * GET is Owner-only. /api/sync neither serves nor patches these rows (isDeviceUnsentDoc).
const DEVICE_UNSENT_PREFIX = 'device_unsent:';
const DEVICE_UNSENT_REASONS = Object.freeze(['offline', 'sign_in', 'update', 'blocked', 'retrying']);
export const DEVICE_UNSENT_HOLD_DAYS = 7;
export const DEVICE_UNSENT_LATE_HOURS = 48;
export const DEVICE_UNSENT_LATE_MIN_MS = 3600000;
const DEVICE_UNSENT_MAX_ROWS = 400;
const DEVICE_UNSENT_MAX_SINCE_DAYS = 90;

export function isDeviceUnsentDoc(docKey) {
  const k = String(docKey || '');
  return k === 'device_unsent' || k.startsWith(DEVICE_UNSENT_PREFIX);
}

function cleanDeviceUnsentText(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>"'`&]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// { ok: true, val } or { ok: false, error }. nowMs is passed in so the checks can be tested at a fixed time.
export function validateDeviceUnsentReport(body, nowMs) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Invalid device report.' };
  const deviceId = String(body.device_id == null ? '' : body.device_id);
  if (!/^[a-z0-9]{12,32}$/.test(deviceId)) return { ok: false, error: 'Invalid device id.' };
  const count = body.count;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0 || count > 100000) return { ok: false, error: 'Invalid entry count.' };
  const val = { device_id: deviceId, count, label: cleanDeviceUnsentText(body.label, 60) };
  const shell = String(body.shell == null ? '' : body.shell);
  val.shell = /^\d{1,3}(?:\.\d{1,5}){1,3}$/.test(shell) ? shell : '';
  if (count === 0) {
    val.all_seats = body.all_seats === true;
    return { ok: true, val };
  }
  const sentLate = body.sent_late === true;
  const reason = String(body.reason == null ? '' : body.reason);
  if (!sentLate && !DEVICE_UNSENT_REASONS.includes(reason)) return { ok: false, error: 'Invalid reason.' };
  const sinceMs = Date.parse(String(body.since == null ? '' : body.since));
  if (!Number.isFinite(sinceMs) || sinceMs > nowMs + 300000 || sinceMs < nowMs - DEVICE_UNSENT_MAX_SINCE_DAYS * 86400000) {
    return { ok: false, error: 'Invalid since time.' };
  }
  val.reason = sentLate ? '' : reason;
  val.sent_late = sentLate;
  val.since = new Date(Math.min(sinceMs, nowMs)).toISOString();
  return { ok: true, val };
}

// The rows the Owner list shows at nowMs: devices still holding entries (reported within DEVICE_UNSENT_HOLD_DAYS),
// then devices whose held entries arrived within DEVICE_UNSENT_LATE_HOURS. Oldest hold first.
export function listDeviceUnsentRows(rows, nowMs) {
  const out = [];
  for (const row of (rows || [])) {
    const p = safeJsonParse(row && row.payload_json, null);
    if (!p || typeof p !== 'object' || Array.isArray(p)) continue;
    const state = p.state === 'sent_late' ? 'sent_late' : 'holding';
    const stampMs = Date.parse(String(state === 'sent_late' ? p.sent_at : p.reported_at) || '');
    if (!Number.isFinite(stampMs)) continue;
    const maxAgeMs = state === 'sent_late' ? DEVICE_UNSENT_LATE_HOURS * 3600000 : DEVICE_UNSENT_HOLD_DAYS * 86400000;
    if (nowMs - stampMs > maxAgeMs) continue;
    const n = Number(state === 'sent_late' ? p.sent_count : p.count);
    if (!Number.isInteger(n) || n < 1) continue;
    out.push({
      device_id: String(p.device_id || ''),
      label: String(p.label || ''),
      user_id: String(p.user_id || ''),
      email: String(p.email || ''),
      name: String(p.name || ''),
      state,
      count: state === 'sent_late' ? 0 : n,
      sent_count: state === 'sent_late' ? n : 0,
      since: String(p.since || ''),
      reason: state === 'sent_late' ? '' : String(p.reason || ''),
      shell: String(p.shell || ''),
      reported_at: String(p.reported_at || ''),
      sent_at: state === 'sent_late' ? String(p.sent_at || '') : ''
    });
  }
  out.sort((a, b) => (a.state === b.state ? String(a.since).localeCompare(String(b.since)) : (a.state === 'holding' ? -1 : 1)));
  return out;
}

export async function handleDeviceUnsent(request, env, session, body, bodyMeta = null) {
  if (request.method === 'GET') {
    if (isDemoHeader(request)) return jsonResponse({ ok: true, demo: true, devices: [] });
    if (!session) return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
    if (!/\bowner\b/i.test(String(session.role || ''))) return jsonResponse({ ok: false, error: 'Owner permissions required.' }, 403);
    if (!env || !env.DB) return jsonResponse({ ok: true, devices: [] });
    const res = await env.DB.prepare(
      "SELECT payload_json FROM edge_kv_store WHERE doc_key LIKE 'device_unsent:%' ORDER BY updated_at DESC LIMIT ?1"
    ).bind(DEVICE_UNSENT_MAX_ROWS).all();
    return jsonResponse({ ok: true, devices: listDeviceUnsentRows(res.results || [], Date.now()) });
  }
  if (request.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405);
  if (isDemoHeader(request)) return jsonResponse({ ok: false, error: 'Demo sandbox is read-only' }, 403);
  if (!session) return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  if (bodyMeta && (bodyMeta.parseError || bodyMeta.emptyBody)) {
    return jsonResponse({ ok: false, error: 'Valid non-empty JSON body required.' }, 400);
  }
  const nowMs = Date.now();
  const chk = validateDeviceUnsentReport(body, nowMs);
  if (!chk.ok) return jsonResponse({ ok: false, error: chk.error }, 400);
  const seatId = String(session.sub || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  if (!seatId) return jsonResponse({ ok: false, error: 'Seat not recognised.' }, 403);
  if (!env || !env.DB) return jsonResponse({ ok: false, error: 'D1 not bound' }, 503);
  const rl = await checkD1RateLimit(env, `device-unsent:${seatId}`, 30, 600);
  if (!rl.allowed) return jsonResponse({ ok: false, error: 'Too many device reports. Try again later.' }, 429);
  const val = chk.val;
  const docKey = `${DEVICE_UNSENT_PREFIX}${seatId}:${val.device_id}`;
  const nowIso = new Date(nowMs).toISOString();
  const exRow = await env.DB.prepare('SELECT payload_json FROM edge_kv_store WHERE doc_key = ?1').bind(docKey).first();
  const prev = exRow ? safeJsonParse(exRow.payload_json, null) : null;
  const prevHolding = Boolean(prev && typeof prev === 'object' && prev.state === 'holding' && Number(prev.count) >= 1);
  if (val.count === 0) {
    // Sent. A device that held entries for an hour or more stays listed as "sent late"; a shorter hold is removed;
    // one that never reported has nothing to clear.
    const rows = [{ key: docKey, p: prev, holding: prevHolding, mayClose: true }];
    const fullGroup = isOwnerOrFullGroupSession(session);
    const others = await env.DB.prepare("SELECT doc_key, payload_json FROM edge_kv_store WHERE doc_key LIKE 'device_unsent:%' AND doc_key LIKE ?1")
      .bind(`%:${val.device_id}`).all();
    for (const o of (others.results || [])) {
      const k = String(o.doc_key || '');
      if (k === docKey || !k.startsWith(DEVICE_UNSENT_PREFIX) || !k.endsWith(`:${val.device_id}`)) continue;
      const op = safeJsonParse(o.payload_json, null);
      const holding = Boolean(op && typeof op === 'object' && op.state === 'holding' && Number(op.count) >= 1);
      const cos = holding && Array.isArray(op.companies) ? op.companies : [];
      const mayClose = Boolean(val.all_seats) && (fullGroup
        || (cos.length > 0 && !cos.includes('*') && cos.every(c => canAccessCompany(session, c))));
      rows.push({ key: k, p: op, holding, mayClose });
    }
    let changed = 0;
    let open = 0;
    let state = '';
    for (const row of rows) {
      if (!row.holding) continue;
      if (!row.mayClose) { open++; continue; }
      const heldSinceMs = Date.parse(String(row.p.since || ''));
      if (Number.isFinite(heldSinceMs) && nowMs - heldSinceMs < DEVICE_UNSENT_LATE_MIN_MS) {
        await env.DB.prepare('DELETE FROM edge_kv_store WHERE doc_key = ?1').bind(row.key).run();
        if (!state) state = 'cleared';
      } else {
        const late = Object.assign({}, row.p, { state: 'sent_late', sent_count: Number(row.p.count), count: 0, sent_at: nowIso, shell: (row.key === docKey && val.shell) || row.p.shell || '' });
        await env.DB.prepare('UPDATE edge_kv_store SET payload_json = ?1, updated_at = ?2, rev = rev + 1 WHERE doc_key = ?3')
          .bind(JSON.stringify(late), nowIso, row.key).run();
        state = 'sent_late';
      }
      changed++;
    }
    return jsonResponse(changed ? { ok: true, saved: true, state, open } : { ok: true, saved: false, open });
  }
  if (val.sent_late && nowMs - Date.parse(val.since) < DEVICE_UNSENT_LATE_MIN_MS) {
    return jsonResponse({ ok: true, saved: false });   // a short wait is no late arrival
  }
  if (!exRow) {
    const cutoffIso = new Date(nowMs - DEVICE_UNSENT_HOLD_DAYS * 86400000).toISOString();
    await env.DB.prepare("DELETE FROM edge_kv_store WHERE doc_key LIKE 'device_unsent:%' AND updated_at < ?1").bind(cutoffIso).run();
    const cnt = await env.DB.prepare("SELECT COUNT(*) AS n FROM edge_kv_store WHERE doc_key LIKE 'device_unsent:%'").first();
    if (Number((cnt && cnt.n) || 0) >= DEVICE_UNSENT_MAX_ROWS) {
      return jsonResponse({ ok: false, error: 'Device list is full.' }, 429);
    }
  }
  const identity = {
    device_id: val.device_id,
    label: val.label,
    user_id: seatId,
    email: String(session.email || '').trim().toLowerCase().slice(0, 160),
    name: cleanDeviceUnsentText(session.name || session.full_name || '', 80),
    // The companies this seat sends rows for ('*' = every company): who else may close this report.
    companies: isOwnerOrFullGroupSession(session)
      ? ['*']
      : String(session.companies || '').split(/[,;|]/).map(c => cleanDeviceUnsentText(c, 60)).filter(Boolean).slice(0, 40)
  };
  if (val.sent_late) {
    const late = Object.assign({ state: 'sent_late' }, identity, {
      count: 0,
      sent_count: prevHolding ? Math.max(Number(prev.count), val.count) : val.count,
      since: (prevHolding && String(prev.since || '') && String(prev.since) < val.since) ? String(prev.since) : val.since,
      reason: '',
      shell: val.shell,
      reported_at: nowIso,
      sent_at: nowIso
    });
    await env.DB.prepare(
      `INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, rev)
       VALUES (?1, ?2, ?3, 1)
       ON CONFLICT(doc_key) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at, rev = edge_kv_store.rev + 1`
    ).bind(docKey, JSON.stringify(late), nowIso).run();
    return jsonResponse({ ok: true, saved: true, state: 'sent_late' });
  }
  const stored = {
    state: 'holding',
    device_id: identity.device_id,
    label: identity.label,
    user_id: identity.user_id,
    email: identity.email,
    name: identity.name,
    companies: identity.companies,
    count: val.count,
    // The first time the wait was reported wins while the device keeps holding: a reload cannot shorten the wait.
    since: (prevHolding && String(prev.since || '') && String(prev.since) < val.since) ? String(prev.since) : val.since,
    reason: val.reason,
    shell: val.shell,
    reported_at: nowIso
  };
  await env.DB.prepare(
    `INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, rev)
     VALUES (?1, ?2, ?3, 1)
     ON CONFLICT(doc_key) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at, rev = edge_kv_store.rev + 1`
  ).bind(docKey, JSON.stringify(stored), nowIso).run();
  return jsonResponse({ ok: true, saved: true, state: 'holding' });
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
        const edCo = String(obj.company || obj.fromCo || obj.resort || obj.entity || '').trim();
        if (!edCo || !canAccessCompany(session, edCo)) continue;
      }
      rowEdits[r.edit_key] = obj;
    }
    return jsonResponse({ ok: true, industryCustomRows: customRows, industryRowEdits: rowEdits });
  }

  if (isDemoHeader(request)) return jsonResponse({ ok: false, error: 'Demo sandbox is read-only' }, 403);
  if (body && body.op === 'rollback') {
    const tokRes = await takeRollbackToken(env.DB, 'industry_domain_store', body.rollbackToken, session);
    if (!tokRes.ok) return jsonResponse({ ok: false, error: tokRes.error }, tokRes.status || 400);
    const entry = tokRes.entry;
    const rbRows = Array.isArray(entry.rows) ? entry.rows : [];
    const rbEdits = Array.isArray(entry.edits) ? entry.edits : [];
    for (const it of rbRows) {
      const cur = await env.DB.prepare(
        'SELECT rev, voided, company, updated_at, payload_json FROM industry_custom_rows WHERE bucket = ?1 AND row_id = ?2'
      ).bind(it.bucket, it.id).first();
      if (it.op === 'purge') {
        if (cur) return jsonResponse({ ok: false, error: 'Rollback conflict: purged domain row was recreated.' }, 409);
      } else {
        if (!cur || Number(cur.rev || 1) !== Number(it.writtenRev || 1) || Number(cur.voided || 0) !== Number(it.writtenVoid || 0) || String(cur.payload_json || '') !== String(it.writtenPayload || '')) {
          return jsonResponse({ ok: false, error: 'Rollback conflict: domain row was modified after commit.' }, 409);
        }
      }
    }
    for (const it of rbEdits) {
      const cur = await env.DB.prepare(
        'SELECT rev, voided, updated_at, payload_json FROM industry_row_edits WHERE edit_key = ?1'
      ).bind(it.editKey).first();
      if (it.op === 'purge') {
        if (cur) return jsonResponse({ ok: false, error: 'Rollback conflict: purged domain edit was recreated.' }, 409);
      } else {
        if (!cur || Number(cur.rev || 1) !== Number(it.writtenRev || 1) || Number(cur.voided || 0) !== Number(it.writtenVoid || 0) || String(cur.payload_json || '') !== String(it.writtenPayload || '')) {
          return jsonResponse({ ok: false, error: 'Rollback conflict: domain edit was modified after commit.' }, 409);
        }
      }
    }
    const rbStmts = [];
    for (const it of rbRows) {
      if (it.existed) {
        rbStmts.push(env.DB.prepare(
          'INSERT OR REPLACE INTO industry_custom_rows (bucket, row_id, company, rev, voided, updated_at, payload_json) VALUES (?1,?2,?3,?4,?5,?6,?7)'
        ).bind(it.bucket, it.id, it.prevCompany || '', Number(it.prevRev || 1), Number(it.prevVoid || 0), it.prevTs || '', it.prevPayload || '{}'));
      } else {
        rbStmts.push(env.DB.prepare(
          'DELETE FROM industry_custom_rows WHERE bucket = ?1 AND row_id = ?2'
        ).bind(it.bucket, it.id));
      }
    }
    for (const it of rbEdits) {
      if (it.existed) {
        rbStmts.push(env.DB.prepare(
          'INSERT OR REPLACE INTO industry_row_edits (edit_key, rev, voided, updated_at, payload_json) VALUES (?1,?2,?3,?4,?5)'
        ).bind(it.editKey, Number(it.prevRev || 1), Number(it.prevVoid || 0), it.prevTs || '', it.prevPayload || '{}'));
      } else {
        rbStmts.push(env.DB.prepare(
          'DELETE FROM industry_row_edits WHERE edit_key = ?1'
        ).bind(it.editKey));
      }
    }
    const geoAuditIds = Array.isArray(entry.geoAuditIds) ? entry.geoAuditIds.filter(Boolean) : [];
    for (const gid of geoAuditIds) {
      rbStmts.push(env.DB.prepare('DELETE FROM geo_audit_log WHERE id = ?1').bind(String(gid)));
    }
    if (rbStmts.length) await execBatchedStmts(env.DB, rbStmts);
    return jsonResponse({ ok: true, rolledBack: true, rows: rbRows.length, edits: rbEdits.length });
  }
  // Old seed ids still in use (counts only; see legacy_ids.js). Read before anything below touches the body.
  const legacyHitsTask = scheduleLegacyIdHits(env, ctx, collectLegacyCandidates(body));
  if (legacyHitsTask) await legacyHitsTask;
  const perms = getSessionWritePerms(session);
  const customMap = (body && body.industryCustomRows && typeof body.industryCustomRows === 'object') ? body.industryCustomRows : {};
  const editsMap = (body && body.industryRowEdits && typeof body.industryRowEdits === 'object') ? body.industryRowEdits : {};
  let savedRows = 0;
  let savedEdits = 0;
  let ignoredServerOwned = 0;   // rows and patches aimed at server-totalled till close rows
  // Sent statement and Rate Changes marks this seat may not change: left as stored and named in the answer, so one
  // refused mark never holds up the device's other saves (the app reloads the stored copy of each)
  const refusedMarks = [];
  let rlsSkipped = 0;

  const pendingRowWrites = [];
  const pendingEditWrites = [];
  const pendingPurgeRows = [];
  const pendingPurgeEdits = [];
  const rbRowsMeta = [];
  const rbEditsMeta = [];
  const pendingDomainGeoAudits = [];
  const rejectDomainGeo403 = async (errMsg, target = {}) => {
    await recordGeoAuditEvent(env.DB, request, session, {
      action: 'blocked_403',
      outcome: 'blocked_403',
      source: 'industry_domain_store',
      industry: target.industry || 'manufacturing',
      company: target.company || '',
      target_type: 'domain_location',
      target_id: target.target_id || '',
      target_label: target.target_label || 'Domain Location',
      detail: Object.assign({ error: errMsg }, target.detail || {})
    });
    return jsonResponse({ ok: false, error: errMsg }, 403);
  };

  for (const [bucket, arr] of Object.entries(customMap)) {
    if (!bucket || !Array.isArray(arr)) continue;
    for (const rawR of arr) {
      if (!rawR || typeof rawR !== 'object') continue;
      const rid = String(rawR.id || rawR.code || '').trim();
      if (!rid) continue;
      if (isServerOwnedCustomRow(bucket, rid)) { ignoredServerOwned++; continue; }
      if (!validateRecordGpsCoords(rawR)) {
        return jsonResponse({ ok: false, error: 'Invalid GPS coordinates.' }, 400);
      }
      const r = normalizeIncomingSiteCoordAliases(rawR);
      const co = canonicalizeCompanyName(r.company || r.fromCo || r.resort || r.entity || '');
      const rowInd = inferDomainIndustry(r, bucket);
      if (restrictRls && (!co || !canAccessCompany(session, co) || (rowInd && !canAccessGeoIndustrySession(session, rowInd)))) {
        return jsonResponse({ ok: false, error: 'Row-level security: cannot save domain rows outside your assigned companies or industries.' }, 403);
      }
      const incRev = Number(r.rev || 1);
      const incVoid = r.voided ? 1 : 0;
      const incTs = String(r.updated_at || r._createdAt || '');
      const ex = await env.DB.prepare(
        'SELECT rev, voided, company, updated_at, payload_json FROM industry_custom_rows WHERE bucket = ?1 AND row_id = ?2'
      ).bind(bucket, rid).first();
      let rowToWrite = Object.assign({}, r);
      const serverVoidNow = new Date().toISOString();
      if (ex) {
        const exObj = safeJsonParse(ex.payload_json, {});
        const exCo = canonicalizeCompanyName(ex.company || (exObj && (exObj.company || exObj.fromCo || exObj.resort || exObj.entity)) || '');
        const exInd = inferDomainIndustry(exObj, bucket);
        if (restrictRls && (!exCo || !canAccessCompany(session, exCo) || (exInd && !canAccessGeoIndustrySession(session, exInd)))) {
          return jsonResponse({ ok: false, error: 'Row-level security: cannot overwrite domain rows outside your assigned companies or industries.' }, 403);
        }
        const exVoid = Number(ex.voided || 0);
        const exRev = Number(ex.rev || 1);
        const voidNoteChanged = Boolean(exVoid) && Boolean(incVoid) && hasVoidReasonChange(exObj, r);
        if (Boolean(exVoid) === Boolean(incVoid) && !voidNoteChanged && !hasGpsFieldMutation(exObj, r) && !hasNonVoidFieldChange(exObj, r)) continue;
        if (exVoid && !incVoid && (!session || !session.build_ticket) && isSyncTwinVoidBy(exObj)) {
          return jsonResponse({ ok: false, error: 'Synced workbook rows cannot be restored directly.' }, 403);
        }
        if (exVoid && !incVoid && exRev >= incRev) {
          // Another device saved a schedule under this id and undid it; this one, made on a device that never saw
          // it, would be dropped here while the answer says OK. Refused instead, before anything in the request
          // is written.
          if (isVoidedScheduleIdReuse(bucket, exObj, r)) {
            return jsonResponse({ ok: false, error: VOIDED_ID_CONFLICT_ERROR, code: VOIDED_ID_CONFLICT_CODE, bucket: String(bucket), id: rid }, 409);
          }
          continue;
        }
        if (exRev > incRev && !(incVoid && !exVoid)) continue;
        if (!perms.voidData && (Boolean(exVoid) !== Boolean(incVoid) || voidNoteChanged)) {
          return jsonResponse({ ok: false, error: 'Role permission: seat cannot void or unvoid domain records.' }, 403);
        }
        const isSparsePureVoid = Boolean(
          (Boolean(exVoid) !== Boolean(incVoid) || voidNoteChanged) && !hasExplicitGpsKeyInPayload(r) && !hasNonVoidFieldChange(exObj, r)
        );
        if (isSparsePureVoid) {
          rowToWrite = restoreGpsFieldsFromBase(Object.assign({}, exObj, r), exObj);
          if (voidNoteChanged) applyExplicitVoidReason(rowToWrite, r);
          if (!incVoid) {
            stripVoidFields(rowToWrite);
          }
        }
        const gpsChanged = hasGpsFieldMutation(exObj, rowToWrite);
        if (!perms.canWriteGeoConfig && gpsChanged) {
          return await rejectDomainGeo403('Supervisor + Entry or Geo-authorized seat required to modify location coordinates.', { industry: rowInd || exInd, company: co || exCo, target_id: rid, target_label: String(r.name || exObj.name || rid), detail: { bucket } });
        }
        if (!perms.modifyText && !perms.modifyData) {
          const allowVoidOnly = Boolean(perms.voidData && (Boolean(exVoid) !== Boolean(incVoid) || voidNoteChanged) && !gpsChanged && !hasNonVoidFieldChange(exObj, rowToWrite));
          if (!allowVoidOnly) {
            return jsonResponse({ ok: false, error: 'Role permission: read-only seat cannot modify existing domain records.' }, 403);
          }
          if (voidNoteChanged) {
            rowToWrite = Object.assign({}, exObj, {
              rev: incRev,
              updated_at: incTs || exObj.updated_at || serverVoidNow
            });
            applyExplicitVoidReason(rowToWrite, r);
          }
        }
        sanitizeIncomingTwinKeys(rowToWrite, exObj, session, perms);
        if (!exVoid && incVoid) {
          const vrErr = checkMandatoryVoidReasonEdge(bucket, rowToWrite, session, await loadVoidReasonRuleCfgEdge(env.DB), exObj);
          if (vrErr) return jsonResponse(vrErr, 400);
        }
        enforceServerVoidActorFields(rowToWrite, exObj, session, serverVoidNow);
        if (gpsChanged) {
          const ev = detectRecordGeoAuditEvent('sites', exObj, rowToWrite, 'industry_domain_store', rowInd || exInd);
          if (ev) pendingDomainGeoAudits.push(ev);
        }
      } else {
        if (!perms.canEnterAny) {
          return jsonResponse({ ok: false, error: 'Role permission: seat cannot create domain records.' }, 403);
        }
        if (!perms.voidData && Boolean(incVoid)) {
          return jsonResponse({ ok: false, error: 'Role permission: seat cannot create voided domain records.' }, 403);
        }
        if (!perms.canWriteGeoConfig && (hasAnyGpsField(r) || hasExplicitGpsKeyInPayload(r))) {
          return await rejectDomainGeo403('Supervisor + Entry or Geo-authorized seat required to pin location coordinates.', { industry: rowInd, company: co, target_id: rid, target_label: String(r.name || rid), detail: { bucket } });
        }
        sanitizeIncomingTwinKeys(rowToWrite, null, session, perms);
        if (incVoid) {
          const vrErr = checkMandatoryVoidReasonEdge(bucket, rowToWrite, session, await loadVoidReasonRuleCfgEdge(env.DB), null);
          if (vrErr) return jsonResponse(vrErr, 400);
        }
        enforceServerVoidActorFields(rowToWrite, null, session, serverVoidNow, { allowInitialSeedEdit: !incVoid });
        const ev = detectRecordGeoAuditEvent('sites', null, rowToWrite, 'industry_domain_store', rowInd);
        if (ev) pendingDomainGeoAudits.push(ev);
      }
      const effRev = Number(rowToWrite.rev || incRev);
      const writtenPayload = JSON.stringify(rowToWrite);
      pendingRowWrites.push([bucket, rid, co, effRev, incVoid, incTs, writtenPayload]);
      rbRowsMeta.push({
        op: 'write',
        bucket,
        id: rid,
        existed: Boolean(ex),
        prevCompany: ex ? String(ex.company || '') : '',
        prevRev: ex ? Number(ex.rev || 1) : 1,
        prevVoid: ex ? Number(ex.voided || 0) : 0,
        prevTs: ex ? String(ex.updated_at || '') : '',
        prevPayload: ex ? String(ex.payload_json || '{}') : '',
        writtenRev: effRev,
        writtenVoid: incVoid,
        writtenPayload
      });
    }
  }

  for (const [ek, rawEv] of Object.entries(editsMap)) {
    if (!ek || !rawEv || typeof rawEv !== 'object') continue;
    if (isServerOwnedRowEditKey(ek)) { ignoredServerOwned++; continue; }
    const isPeriodLockWf = /^WF::(period_close|hld_close_gate)::/i.test(ek);
    const isPeriodCloseWf = /^WF::(period_close|hld_close_gate|mfg_accrual_cutoff|hsp_membership_amort|re_deferred_rent_amort|trd_period_close|ins_renewal_binder)::/i.test(ek);
    if (isPeriodCloseWf && !perms.voidData) {
      return jsonResponse({ ok: false, error: 'Supervisor or Owner permission is required to lock or reopen an accounting period.' }, 403);
    }
    const isGuardedMark = isGuardedWorkflowMarkKey(ek);
    const isStmtMark = STMT_SENT_MARK_RE.test(ek);
    if (!validateRecordGpsCoords(rawEv)) {
      return jsonResponse({ ok: false, error: 'Invalid GPS coordinates.' }, 400);
    }
    const ev = normalizeIncomingSiteCoordAliases(rawEv);
    const edCo = canonicalizeCompanyName(ev.company || ev.fromCo || ev.resort || ev.entity || '');
    const edInd = inferDomainIndustry(ev, ek);
    if (restrictRls && (!edCo || !canAccessCompany(session, edCo) || (edInd && !canAccessGeoIndustrySession(session, edInd)))) {
      return jsonResponse({ ok: false, error: 'Row-level security: cannot save domain edits outside your assigned companies or industries.' }, 403);
    }
    const incRev = Number(ev.rev || 1);
    const incVoid = ev.voided ? 1 : 0;
    const incTs = String(ev.updated_at || ev.updatedAt || '');
    const ex = await env.DB.prepare('SELECT rev, voided, updated_at, payload_json FROM industry_row_edits WHERE edit_key = ?1').bind(ek).first();
    let editToWrite = Object.assign({}, ev);
    const serverEditVoidNow = new Date().toISOString();
    if (ex) {
      const exObj = safeJsonParse(ex.payload_json, {});
      if (restrictRls) {
        const exCo = canonicalizeCompanyName((exObj && (exObj.company || exObj.fromCo || exObj.resort || exObj.entity)) || '');
        const exInd = inferDomainIndustry(exObj, ek);
        if (!exCo || !canAccessCompany(session, exCo) || (exInd && !canAccessGeoIndustrySession(session, exInd))) {
          return jsonResponse({ ok: false, error: 'Row-level security: cannot overwrite domain edits outside your assigned companies or industries.' }, 403);
        }
      }
      const exVoid = Number(ex.voided || 0);
      const exRev = Number(ex.rev || 1);
      const voidNoteChanged = Boolean(exVoid) && Boolean(incVoid) && hasVoidReasonChange(exObj, ev);
      if (Boolean(exVoid) === Boolean(incVoid) && !voidNoteChanged && !hasGpsFieldMutation(exObj, ev) && !hasNonVoidFieldChange(exObj, ev)) continue;
      if (exVoid && !incVoid && (!session || !session.build_ticket) && isSyncTwinVoidBy(exObj)) {
        return jsonResponse({ ok: false, error: 'Synced workbook rows cannot be restored directly.' }, 403);
      }
      if (exVoid && !incVoid && exRev >= incRev) continue;
      if (exRev > incRev && !(incVoid && !exVoid)) continue;
      if (isGuardedMark) {
        const markErr = guardedWorkflowMarkError(ek, Object.assign({}, exObj, { voided: Boolean(exVoid) }), ev, perms);
        if (markErr) { refusedMarks.push({ key: ek, error: markErr }); continue; }
      }
      if (!perms.voidData && (Boolean(exVoid) !== Boolean(incVoid) || voidNoteChanged)) {
        return jsonResponse({ ok: false, error: 'Role permission: seat cannot void or unvoid domain records.' }, 403);
      }
      const isSparsePureVoid = Boolean(
        (Boolean(exVoid) !== Boolean(incVoid) || voidNoteChanged) && !hasExplicitGpsKeyInPayload(ev) && !hasNonVoidFieldChange(exObj, ev)
      );
      if (isSparsePureVoid) {
        editToWrite = restoreGpsFieldsFromBase(Object.assign({}, exObj, ev), exObj);
        if (voidNoteChanged) applyExplicitVoidReason(editToWrite, ev);
        if (!incVoid) {
          stripVoidFields(editToWrite);
        }
      }
      const gpsChanged = hasGpsFieldMutation(exObj, editToWrite);
      if (!perms.canWriteGeoConfig && gpsChanged) {
        return await rejectDomainGeo403('Supervisor + Entry or Geo-authorized seat required to modify location coordinates.', { industry: edInd, company: edCo, target_id: ek, target_label: String(editToWrite.name || exObj.name || ek), detail: { editKey: ek } });
      }
      if (!perms.modifyText && !perms.modifyData) {
        const allowVoidOnly = Boolean(perms.voidData && (Boolean(exVoid) !== Boolean(incVoid) || voidNoteChanged) && !gpsChanged && !hasNonVoidFieldChange(exObj, editToWrite));
        const allowPeriodClose = Boolean((isPeriodLockWf || isStmtMark) && perms.voidData && !gpsChanged);
        if (!allowVoidOnly && !allowPeriodClose) {
          return jsonResponse({ ok: false, error: 'Role permission: read-only seat cannot modify existing domain records.' }, 403);
        }
        if (voidNoteChanged) {
          editToWrite = Object.assign({}, exObj, {
            rev: incRev,
            updated_at: incTs || exObj.updated_at || serverEditVoidNow,
            updatedAt: incTs || exObj.updatedAt || serverEditVoidNow
          });
          applyExplicitVoidReason(editToWrite, ev);
        }
      }
      sanitizeIncomingTwinKeys(editToWrite, exObj, session, perms);
      if (!exVoid && incVoid && !/^WF::/i.test(ek)) {
        const vrErr = checkMandatoryVoidReasonEdge(editToWrite.domainTblKey || ek, editToWrite, session, await loadVoidReasonRuleCfgEdge(env.DB), exObj);
        if (vrErr) return jsonResponse(vrErr, 400);
      }
      enforceServerVoidActorFields(editToWrite, exObj, session, serverEditVoidNow);
      if (gpsChanged) {
        const ev = detectRecordGeoAuditEvent('sites', exObj, editToWrite, 'industry_domain_store', edInd);
        if (ev) pendingDomainGeoAudits.push(ev);
      }
    } else {
      if (isGuardedMark) {
        const markErr = guardedWorkflowMarkError(ek, null, ev, perms);
        if (markErr) { refusedMarks.push({ key: ek, error: markErr }); continue; }
      }
      if (!perms.voidData && Boolean(incVoid)) {
        return jsonResponse({ ok: false, error: 'Role permission: seat cannot void domain records.' }, 403);
      }
      if (!perms.canWriteGeoConfig && (hasAnyGpsField(ev) || hasExplicitGpsKeyInPayload(ev))) {
        return await rejectDomainGeo403('Supervisor + Entry or Geo-authorized seat required to modify location coordinates.', { industry: edInd, company: edCo, target_id: ek, target_label: String(ev.name || ek), detail: { editKey: ek } });
      }
      if (!perms.modifyText && !perms.modifyData) {
        const allowVoidOnly = Boolean(perms.voidData && incVoid && !hasAnyGpsField(ev) && !hasExplicitGpsKeyInPayload(ev));
        const allowPeriodClose = Boolean((isPeriodLockWf || isStmtMark) && perms.voidData && !hasAnyGpsField(ev) && !hasExplicitGpsKeyInPayload(ev));
        if (!allowVoidOnly && !allowPeriodClose) {
          return jsonResponse({ ok: false, error: 'Role permission: read-only seat cannot edit domain records.' }, 403);
        }
      }
      sanitizeIncomingTwinKeys(editToWrite, null, session, perms);
      if (incVoid && !/^WF::/i.test(ek)) {
        const vrErr = checkMandatoryVoidReasonEdge(editToWrite.domainTblKey || ek, editToWrite, session, await loadVoidReasonRuleCfgEdge(env.DB), null);
        if (vrErr) return jsonResponse(vrErr, 400);
      }
      enforceServerVoidActorFields(editToWrite, null, session, serverEditVoidNow, { allowInitialSeedEdit: !incVoid });
      const geoEv = detectRecordGeoAuditEvent('sites', null, editToWrite, 'industry_domain_store', edInd);
      if (geoEv) pendingDomainGeoAudits.push(geoEv);
    }
    const effEditRev = Number(editToWrite.rev || incRev);
    const writtenPayload = JSON.stringify(editToWrite);
    pendingEditWrites.push([ek, effEditRev, incVoid, incTs, writtenPayload]);
    rbEditsMeta.push({
      op: 'write',
      editKey: ek,
      existed: Boolean(ex),
      prevRev: ex ? Number(ex.rev || 1) : 1,
      prevVoid: ex ? Number(ex.voided || 0) : 0,
      prevTs: ex ? String(ex.updated_at || '') : '',
      prevPayload: ex ? String(ex.payload_json || '{}') : '',
      writtenRev: effEditRev,
      writtenVoid: incVoid,
      writtenPayload
    });
  }

  const purgedRows = Array.isArray(body && body.purgedRows) ? body.purgedRows : [];
  for (const pr of purgedRows) {
    if (!pr || typeof pr !== 'object') continue;
    const bk = String(pr.bucket || '').trim();
    const rid = String(pr.row_id || pr.id || '').trim();
    if (!bk || !rid || isServerOwnedCustomRow(bk, rid)) continue;
    const ex = await env.DB.prepare('SELECT rev, voided, company, updated_at, payload_json FROM industry_custom_rows WHERE bucket = ?1 AND row_id = ?2').bind(bk, rid).first();
    if (!ex) continue;
    const exObj = safeJsonParse(ex.payload_json, {});
    const exCo = canonicalizeCompanyName(ex.company || (exObj && (exObj.company || exObj.fromCo || exObj.resort || exObj.entity)) || '');
    const exInd = inferDomainIndustry(exObj, bk);
    if (restrictRls && (!exCo || !canAccessCompany(session, exCo) || (exInd && !canAccessGeoIndustrySession(session, exInd)))) {
      return jsonResponse({ ok: false, error: 'Row-level security: cannot purge domain rows outside your assigned companies or industries.' }, 403);
    }
    if (!perms.canWriteGeoConfig && hasAnyGpsField(exObj)) {
      return await rejectDomainGeo403('Supervisor + Entry or Owner permission required to purge pinned records.', { industry: exInd, company: exCo, target_id: rid, target_label: String(exObj.name || rid), detail: { bucket: bk } });
    }
    if (!perms.modifyData && !perms.voidData) {
      return jsonResponse({ ok: false, error: 'Role permission: purge requires modify or void privileges.' }, 403);
    }
    pendingPurgeRows.push([bk, rid]);
    rbRowsMeta.push({
      op: 'purge',
      bucket: bk,
      id: rid,
      existed: true,
      prevCompany: String(ex.company || ''),
      prevRev: Number(ex.rev || 1),
      prevVoid: Number(ex.voided || 0),
      prevTs: String(ex.updated_at || ''),
      prevPayload: String(ex.payload_json || '{}')
    });
  }

  const purgedEditKeys = Array.isArray(body && body.purgedEditKeys) ? body.purgedEditKeys : [];
  for (const rawEk of purgedEditKeys) {
    const ek = String(rawEk || '').trim();
    if (!ek || isServerOwnedRowEditKey(ek)) continue;
    if (/^WF::(period_close|hld_close_gate|mfg_accrual_cutoff|hsp_membership_amort|re_deferred_rent_amort|trd_period_close|ins_renewal_binder)::/i.test(ek) && !perms.voidData) {
      return jsonResponse({ ok: false, error: 'Supervisor or Owner permission is required to purge period-close locks.' }, 403);
    }
    const ex = await env.DB.prepare('SELECT rev, voided, updated_at, payload_json FROM industry_row_edits WHERE edit_key = ?1').bind(ek).first();
    if (!ex) continue;
    const exObj = safeJsonParse(ex.payload_json, {});
    if (isGuardedWorkflowMarkKey(ek)) {
      const markErr = guardedWorkflowMarkError(ek, Object.assign({}, exObj, { voided: Boolean(Number(ex.voided || 0)) }), null, perms);
      if (markErr) { refusedMarks.push({ key: ek, error: markErr }); continue; }
    }
    const exCoEd = canonicalizeCompanyName((exObj && (exObj.company || exObj.fromCo || exObj.resort || exObj.entity)) || '');
    const exIndEd = inferDomainIndustry(exObj, ek);
    if (restrictRls) {
      if (!exCoEd || !canAccessCompany(session, exCoEd) || (exIndEd && !canAccessGeoIndustrySession(session, exIndEd))) {
        return jsonResponse({ ok: false, error: 'Row-level security: cannot purge domain edits outside your assigned companies or industries.' }, 403);
      }
    }
    if (!perms.canWriteGeoConfig && hasAnyGpsField(exObj)) {
      return await rejectDomainGeo403('Supervisor + Entry or Owner permission required to purge pinned records.', { industry: exIndEd, company: exCoEd, target_id: ek, target_label: String(exObj.name || ek), detail: { editKey: ek } });
    }
    if (!perms.modifyData && !perms.voidData) {
      return jsonResponse({ ok: false, error: 'Role permission: purge requires modify or void privileges.' }, 403);
    }
    if (hasAnyGpsField(exObj)) {
      const evP = detectRecordGeoAuditEvent('sites', exObj, { name: exObj.name, company: exCoEd, _pinCleared: true }, 'industry_domain_store', exIndEd);
      if (evP) pendingDomainGeoAudits.push(evP);
    }
    pendingPurgeEdits.push(ek);
    rbEditsMeta.push({
      op: 'purge',
      editKey: ek,
      existed: true,
      prevRev: Number(ex.rev || 1),
      prevVoid: Number(ex.voided || 0),
      prevTs: String(ex.updated_at || ''),
      prevPayload: String(ex.payload_json || '{}')
    });
  }

  if (
    pendingRowWrites.length === 0 &&
    pendingEditWrites.length === 0 &&
    pendingPurgeRows.length === 0 &&
    pendingPurgeEdits.length === 0 &&
    rlsSkipped > 0
  ) {
    return jsonResponse({ ok: false, error: 'Row-level security: unauthorized entity domain write.' }, 403);
  }
  if (refusedMarks.length && !pendingRowWrites.length && !pendingEditWrites.length && !pendingPurgeRows.length && !pendingPurgeEdits.length) {
    return jsonResponse({ ok: false, error: refusedMarks[0].error, refusedMarks }, 403);
  }

  for (const args of pendingRowWrites) {
    await env.DB.prepare(
      'INSERT OR REPLACE INTO industry_custom_rows (bucket, row_id, company, rev, voided, updated_at, payload_json) VALUES (?1,?2,?3,?4,?5,?6,?7)'
    ).bind(...args).run();
    savedRows++;
  }
  for (const args of pendingEditWrites) {
    await env.DB.prepare(
      'INSERT OR REPLACE INTO industry_row_edits (edit_key, rev, voided, updated_at, payload_json) VALUES (?1,?2,?3,?4,?5)'
    ).bind(...args).run();
    savedEdits++;
  }
  let deletedLegacyRows = 0;
  for (const [bk, rid] of pendingPurgeRows) {
    await env.DB.prepare('DELETE FROM industry_custom_rows WHERE bucket = ?1 AND row_id = ?2').bind(bk, rid).run();
    deletedLegacyRows++;
  }
  let deletedLegacyEdits = 0;
  for (const ek of pendingPurgeEdits) {
    await env.DB.prepare('DELETE FROM industry_row_edits WHERE edit_key = ?1').bind(ek).run();
    deletedLegacyEdits++;
  }
  const geoAuditIds = [];
  for (const geoEv of pendingDomainGeoAudits) {
    try {
      const gaid = await recordGeoAuditEvent(env.DB, request, session, geoEv);
      if (typeof gaid === 'string' && gaid) geoAuditIds.push(gaid);
    } catch (_) {}
  }

  let rollbackToken = '';
  const actorKey = getSessionActorKey(session);
  if (actorKey && (rbRowsMeta.length > 0 || rbEditsMeta.length > 0 || geoAuditIds.length > 0)) {
    try {
      rollbackToken = await storeRollbackToken(env.DB, {
        kind: 'industry_domain_store',
        actor: actorKey,
        rows: rbRowsMeta,
        edits: rbEditsMeta,
        geoAuditIds
      });
    } catch (_) {}
  }

  return jsonResponse({
    ok: true,
    rows: savedRows,
    edits: savedEdits,
    deletedLegacyRows,
    deletedLegacyEdits,
    ignoredServerOwned,
    ...(refusedMarks.length ? { refusedMarks } : {}),
    ...(rollbackToken ? { rollbackToken } : {})
  });
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

const SEED_RECORDS_BUCKET_TABLES = new Set([
  'sales_tickets', 'raw_purchases', 'fuel_intakes', 'expenses', 'receipts', 'customer_receipts',
  'settlements', 'supplier_payments', 'salaries', 'salary_payments', 'attendance',
  'external_movements', 'loan_settlements', 'loans', 'conversions', 'daily_totals', 'expense_items'
]);
const SPINE_BUCKET_TABLES = new Set([
  'expenses', 'recurring_expenses', 'salaries', 'salary_payments', 'settlements', 'supplier_payments'
]);

async function loadBucketSeedJson(r2Cache, env, r2Key) {
  if (r2Cache.has(r2Key)) return r2Cache.get(r2Key);
  let parsed = null;
  try {
    if (env && env.BUCKET && typeof env.BUCKET.get === 'function') {
      const obj = await env.BUCKET.get(r2Key);
      if (obj) {
        parsed = typeof obj.json === 'function' ? await obj.json() : JSON.parse(await obj.text());
      }
    }
  } catch (_) {
    parsed = null;
  }
  r2Cache.set(r2Key, parsed);
  return parsed;
}

function findPackedSeedRowById(doc, mode, tableKeys, crKey, canonTable, targetId) {
  if (!doc || typeof doc !== 'object') return { found: false, row: null, hasTable: false };
  const mapRoot = mode === 'industries' ? doc.tables : doc.records;
  if (!mapRoot || typeof mapRoot !== 'object') return { found: false, row: null, hasTable: false };
  const pool = Array.isArray(doc._s) ? doc._s : [];
  let hasTable = false;

  for (const tk of tableKeys) {
    const tbl = mapRoot[tk];
    if (!tbl) continue;
    hasTable = true;
    if (Array.isArray(tbl)) {
      for (const r of tbl) {
        if (r && typeof r === 'object' && String(r.id || '').trim() === targetId) {
          return { found: true, row: Object.assign({}, r), hasTable: true };
        }
      }
      continue;
    }
    if (!Array.isArray(tbl.c) || !Array.isArray(tbl.r)) continue;
    const cols = tbl.c;
    const sc = Array.isArray(tbl.sc) ? tbl.sc : [];
    const pf = typeof tbl.p === 'string' ? tbl.p : '';
    const hr = Boolean(tbl.hr);
    const idIdx = cols.indexOf('id');
    const isSales = crKey === 'sales_tickets' || canonTable === 'sales_tickets';

    for (let idx = 0; idx < tbl.r.length; idx++) {
      const arr = tbl.r[idx];
      if (!Array.isArray(arr)) continue;
      let rid = '';
      if (idIdx >= 0) {
        const rawId = arr[idIdx];
        const decId = (sc[idIdx] && typeof rawId === 'number' && rawId >= 0 && rawId < pool.length) ? pool[rawId] : rawId;
        rid = String(decId == null ? '' : decId).trim();
      } else if (pf) {
        rid = `${pf}${idx}`;
      }
      if (rid !== targetId) continue;

      const unpacked = {};
      if (pf) unpacked.id = `${pf}${idx}`;
      for (let ci = 0; ci < cols.length && ci < arr.length; ci++) {
        let val = arr[ci];
        if (val === null || val === undefined) continue;
        if (sc[ci] && typeof val === 'number' && val >= 0 && val < pool.length) {
          val = pool[val];
        }
        unpacked[cols[ci]] = val;
      }
      if (!unpacked.id) unpacked.id = targetId;
      if (hr && crKey !== 'attendance' && unpacked.rep_date === undefined && unpacked.date !== undefined) {
        unpacked.rep_date = unpacked.date;
      }
      if (isSales && unpacked.total_ttc === undefined && unpacked.total !== undefined) {
        unpacked.total_ttc = unpacked.total;
      }
      return { found: true, row: unpacked, hasTable: true };
    }
  }
  return { found: false, row: null, hasTable };
}

async function lookupSeedRowFromBucket(r2Cache, env, crKey, canonTable, targetId) {
  if (env && env._seedRowsByTable && typeof env._seedRowsByTable === 'object' && env._seedRowsByTable[canonTable]) {
    const hit = env._seedRowsByTable[canonTable][targetId];
    return { found: Boolean(hit), row: hit ? Object.assign({}, hit) : null, hasSeedSource: true };
  }
  if (!env || !env.BUCKET || typeof env.BUCKET.get !== 'function') {
    return { found: false, row: null, hasSeedSource: false };
  }

  const baseKeys = Array.from(new Set([
    crKey,
    canonTable,
    ...(canonTable === 'loans' ? ['loan_settlements'] : []),
    ...(crKey === 'loan_settlements' ? ['loans'] : []),
    ...(canonTable === 'staff_members' ? ['staff'] : [])
  ].filter(Boolean)));

  const candidates = [];
  if (targetId.startsWith('dv-') && SPINE_BUCKET_TABLES.has(crKey)) {
    const spineKeys = Array.from(new Set([`spine.${crKey}`, `spine.${canonTable}`]));
    candidates.push({ r2Key: 'seeds/seed_industries.json', mode: 'industries', tableKeys: spineKeys });
  }
  if (SEED_RECORDS_BUCKET_TABLES.has(crKey) || SEED_RECORDS_BUCKET_TABLES.has(canonTable)) {
    candidates.push({ r2Key: 'seeds/seed_records.json', mode: 'records', tableKeys: baseKeys });
  }
  candidates.push({ r2Key: 'seeds/seed_core.json', mode: 'records', tableKeys: baseKeys });

  let sawSeedSource = false;
  for (const cand of candidates) {
    const doc = await loadBucketSeedJson(r2Cache, env, cand.r2Key);
    const res = findPackedSeedRowById(doc, cand.mode, cand.tableKeys, crKey, canonTable, targetId);
    if (res.hasTable) sawSeedSource = true;
    if (res.found && res.row) {
      return { found: true, row: res.row, hasSeedSource: true };
    }
  }
  return { found: false, row: null, hasSeedSource: sawSeedSource };
}

export async function mirrorStoreDeltaToD1Tables(db, storePayload, prevStorePayload = null, session = null, env = null) {
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
    const r2SeedCache = new Map();

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
          if (isUniversal) {
            if (!canAccessUniversalGeoRow(session, canonTable, rec)) continue;
            if (prevEntry && prevEntry.row && !canAccessUniversalGeoRow(session, canonTable, prevEntry.row)) continue;
          } else {
            const recCo = String(rec.company || '').trim();
            const prevCo = String((prevEntry && prevEntry.row && prevEntry.row.company) || '').trim();
            if ((recCo && !canAccessCompany(session, recCo)) || (prevCo && !canAccessCompany(session, prevCo))) continue;
            if (!recCo || (prevEntry && !prevCo)) continue;
          }
        }
        if (!dirtyByTable.has(canonTable)) dirtyByTable.set(canonTable, []);
        dirtyByTable.get(canonTable).push(rec);
      }

      if (hasPrev && prevMap.size > 0) {
        for (const [prevId, prevEntry] of prevMap.entries()) {
          if (seenIds.has(prevId)) continue;
          const pr = prevEntry.row;
          if (!pr) continue;
          if (restrictRls) {
            const prCo = String(pr.company || '').trim();
            if (isUniversal && (!canManageSeats || !canAccessUniversalGeoRow(session, canonTable, pr))) continue;
            if ((!isUniversal && !prCo) || (prCo && !canAccessCompany(session, prCo))) continue;
          }
          const seedHit = await lookupSeedRowFromBucket(r2SeedCache, env, crKey, canonTable, prevId);
          if (seedHit.found && seedHit.row) {
            const srCo = String(seedHit.row.company || '').trim();
            if (restrictRls && (isUniversal ? !canAccessUniversalGeoRow(session, canonTable, seedHit.row) : (!srCo || !canAccessCompany(session, srCo)))) continue;
            const restored = Object.assign({}, seedHit.row, { voided: Boolean(seedHit.row.voided) });
            if (!dirtyByTable.has(canonTable)) dirtyByTable.set(canonTable, []);
            dirtyByTable.get(canonTable).push(restored);
            continue;
          }
          if (pr._seed_orig && typeof pr._seed_orig === 'object' && !pr._is_app_record && pr.source !== 'app') {
            const restored = Object.assign({}, pr, pr._seed_orig, { id: prevId, voided: Boolean(pr._seed_orig.voided) });
            delete restored._seed_orig;
            delete restored._pre_void_orig;
            delete restored._pre_void_edits;
            delete restored.void_reason;
            delete restored.voided_at;
            delete restored.voided_by;
            delete restored.restored_at;
            delete restored.modified_at;
            delete restored.modified_by;
            delete restored.updated_at;
            if (!dirtyByTable.has(canonTable)) dirtyByTable.set(canonTable, []);
            dirtyByTable.get(canonTable).push(restored);
            continue;
          }
          if (POS_SEED_ID_RE.test(prevId) || pr.source === 'workbook') {
            if (pr.voided) {
              const restored = Object.assign({}, pr, { voided: false });
              delete restored.voided_at;
              delete restored.voided_by;
              if (!dirtyByTable.has(canonTable)) dirtyByTable.set(canonTable, []);
              dirtyByTable.get(canonTable).push(restored);
            }
            continue;
          }
          if (!pr.voided) {
            removedToVoid.push({ canonTable, id: prevId });
          }
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
      if (restrictRls && (cols.has('company') || canonTable === 'sites' || canonTable === 'regions')) {
        const checkIds = recs.map(r => String(r.id).trim());
        for (let i = 0; i < checkIds.length; i += 80) {
          const slice = checkIds.slice(i, i + 80);
          const ph = slice.map((_, k) => `?${k + 1}`).join(',');
          const exRows = await db.prepare(`SELECT * FROM ${canonTable} WHERE id IN (${ph})`).bind(...slice).all();
          const foundMap = new Map((exRows.results || []).map(x => [String(x.id), hydrateRowJson(x)]));
          for (const cid of slice) {
            const exHyd = foundMap.get(cid);
            if (!exHyd) continue;
            if (isUniversal) {
              if (!canAccessUniversalGeoRow(session, canonTable, exHyd)) blockedIds.add(cid);
            } else {
              const exCo = String(exHyd.company || '').trim();
              if (!exCo || !canAccessCompany(session, exCo)) blockedIds.add(cid);
            }
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
        const co = canonicalizeCompanyName(r.company || r.fromCo || r.resort || r.entity || '');
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
          const pCo = canonicalizeCompanyName(pr.company || pr.fromCo || pr.resort || pr.entity || '');
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
      const edCo = canonicalizeCompanyName(ev.company || ev.fromCo || ev.resort || ev.entity || '');
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
        const pEdCo = canonicalizeCompanyName((pev && (pev.company || pev.fromCo || pev.resort || pev.entity)) || '');
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

    let touchedMapsQuotaOverride = false;
    if (canManageSeats) {
      const prevAr = (hasPrev && prevStorePayload.alertRules && typeof prevStorePayload.alertRules === 'object') ? prevStorePayload.alertRules : {};
      const curAr = (storePayload.alertRules && typeof storePayload.alertRules === 'object') ? storePayload.alertRules : {};
      if (!restrictRls) {
        const pOv = (prevAr.overrides && typeof prevAr.overrides === 'object') ? prevAr.overrides : {};
        const cOv = (curAr.overrides && typeof curAr.overrides === 'object') ? curAr.overrides : {};
        for (const [oid, ov] of Object.entries(cOv)) {
          if (!oid || !ov || typeof ov !== 'object') continue;
          if (pOv[oid] && stableRowSig(pOv[oid]) === stableRowSig(ov)) continue;
          if (MAPS_QUOTA_RULE_IDS.includes(String(oid))) touchedMapsQuotaOverride = true;
          subStmts.push(
            db.prepare('INSERT OR REPLACE INTO alert_rules (id, kind, payload_json, updated_at) VALUES (?1, ?2, ?3, ?4)')
              .bind(String(oid), 'override', JSON.stringify(ov), String(ov.updated_at || ''))
          );
        }
        if (hasPrev) {
          for (const oid of Object.keys(pOv)) {
            if (!(oid in cOv)) {
              if (MAPS_QUOTA_RULE_IDS.includes(String(oid))) touchedMapsQuotaOverride = true;
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

    if (storePayload.workSchedules && (!hasPrev || stableRowSig(prevStorePayload.workSchedules) !== stableRowSig(storePayload.workSchedules))) {
      const canWriteWsMirror = !session || await resolveCanWriteWorkSchedules(db, session);
      if (canWriteWsMirror) {
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
    }

    if (subStmts.length) {
      await execBatchedStmts(db, subStmts, 80);
      stats.upsertedSubStores += subStmts.length;
    }
    if (touchedMapsQuotaOverride) {
      invalidateMapsUsageMemCache();
    }
  } catch (err) {
    stats.error = String((err && err.message) || err);
  }
  return stats;
}

function compareIsoTsMs(a, b) {
  const sa = String(a || '');
  const sb = String(b || '');
  const ma = sa ? Date.parse(sa) : NaN;
  const mb = sb ? Date.parse(sb) : NaN;
  if (Number.isFinite(ma) && Number.isFinite(mb)) {
    return ma < mb ? -1 : (ma > mb ? 1 : 0);
  }
  if (Number.isFinite(ma) !== Number.isFinite(mb)) {
    return Number.isFinite(ma) ? 1 : -1;
  }
  return sa < sb ? -1 : (sa > sb ? 1 : 0);
}

function mergePartyHygieneStoreDoc(incomingDoc, prevDoc, session) {
  const prev = (prevDoc && typeof prevDoc === 'object') ? prevDoc : {};
  const canManage = Boolean(canManageUsersSeat(session));
  if (!canManage) {
    if (prev.partyHygiene !== undefined) incomingDoc.partyHygiene = prev.partyHygiene;
    else delete incomingDoc.partyHygiene;
    return;
  }
  if (!(prev.partyHygiene || incomingDoc.partyHygiene)) return;
  const pPh = (prev.partyHygiene && typeof prev.partyHygiene === 'object' && prev.partyHygiene.rules && typeof prev.partyHygiene.rules === 'object') ? prev.partyHygiene.rules : {};
  const iPh = (incomingDoc.partyHygiene && typeof incomingDoc.partyHygiene === 'object' && incomingDoc.partyHygiene.rules && typeof incomingDoc.partyHygiene.rules === 'object') ? incomingDoc.partyHygiene.rules : {};
  const safeRules = {};
  const allowedKinds = new Set(['customer', 'supplier', 'site', 'staff', 'counterparty']);
  const allowedStatuses = new Set(['confirmed', 'dismissed', 'undone']);
  const isOwner = Boolean(isOwnerOrFullGroupSession(session));
  for (const [rk, pv] of Object.entries(pPh)) {
    if (!pv || typeof pv !== 'object') continue;
    safeRules[rk] = pv;
  }
  for (const [rk, iv] of Object.entries(iPh)) {
    if (Object.keys(safeRules).length >= 2000 && !(rk in safeRules)) break;
    if (!iv || typeof iv !== 'object') continue;
    const iInd = String(iv.industry || 'Manufacturing').trim();
    const iKind = String(iv.kind || '').trim().toLowerCase();
    const iStatus = String(iv.status || '').trim().toLowerCase();
    const iAlias = String(iv.alias || '').trim();
    const iCanon = String(iv.canonical || '').trim();
    if (!iInd || !allowedKinds.has(iKind) || !allowedStatuses.has(iStatus) || !iAlias || !iCanon) continue;
    const expectedKey = `${iInd}::${iKind}::${iAlias.toLowerCase().replace(/\s+/g, ' ')}`;
    if (String(rk || '') !== expectedKey) continue;
    if (!isOwner && !canAccessGeoIndustrySession(session, iInd)) continue;
    const existing = safeRules[rk];
    if (existing) {
      const exInd = String(existing.industry || 'Manufacturing').trim();
      if (!isOwner && exInd && !canAccessGeoIndustrySession(session, exInd)) continue;
      if (compareIsoTsMs(iv.updated_at, existing.updated_at) < 0) continue;
    }
    safeRules[rk] = {
      key: String(rk).slice(0, 220),
      industry: iInd.slice(0, 80),
      kind: iKind,
      alias: iAlias.slice(0, 180),
      canonical: iCanon.slice(0, 180),
      status: iStatus,
      source: String(iv.source || 'deterministic').slice(0, 40),
      reason: String(iv.reason || '').slice(0, 180),
      updated_at: (iv.updated_at && Number.isFinite(Date.parse(String(iv.updated_at)))) ? String(iv.updated_at).slice(0, 64) : new Date().toISOString(),
      updated_by: String(iv.updated_by || '').slice(0, 120)
    };
  }
  incomingDoc.partyHygiene = { rules: safeRules };
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
      if (!Object.prototype.hasOwnProperty.call(incomingDoc.customRecords, k)) {
        if (Array.isArray(prevCr[k])) incomingDoc.customRecords[k] = prevCr[k];
        continue;
      }
      const canonTable = CR_KEY_TO_TABLE[k] || k;
      const isUniversal = UNIVERSAL_UNIQUE_TABLES.has(canonTable);
      const pList = Array.isArray(prevCr[k]) ? prevCr[k] : [];
      const iList = Array.isArray(incomingDoc.customRecords[k]) ? incomingDoc.customRecords[k] : [];
      const pMap = new Map();
      for (const pr of pList) {
        if (pr && pr.id) pMap.set(String(pr.id).trim(), pr);
      }
      const d1RowById = new Map();
      if (db && ALLOWED_TABLES.has(canonTable)) {
        const probeIds = [];
        for (const ir of iList) {
          if (!ir || typeof ir !== 'object' || !ir.id) continue;
          const rid = String(ir.id).trim();
          if (!rid || pMap.has(rid)) continue;
          if (isUniversal) {
            if (!canAccessUniversalGeoRow(session, canonTable, ir)) continue;
          } else {
            const irCo = String(ir.company || '').trim();
            if (!irCo || !canAccessCompany(session, irCo)) continue;
          }
          probeIds.push(rid);
        }
        if (probeIds.length) {
          const cols = await getTableColumns(db, canonTable);
          if (cols.has('company') || canonTable === 'sites' || canonTable === 'regions') {
            for (let i = 0; i < probeIds.length; i += 80) {
              const slice = probeIds.slice(i, i + 80);
              const ph = slice.map((_, idx) => `?${idx + 1}`).join(',');
              const exRes = await db.prepare(`SELECT * FROM ${canonTable} WHERE id IN (${ph})`).bind(...slice).all();
              for (const xr of (exRes.results || [])) {
                const hyd = hydrateRowJson(xr);
                d1RowById.set(String(xr.id).trim(), hyd);
              }
            }
          }
        }
      }
      const outList = [];
      const keptIds = new Set();
      for (const ir of iList) {
        if (!ir || typeof ir !== 'object' || !ir.id) continue;
        const rid = String(ir.id).trim();
        const pr = pMap.get(rid);
        if (pr) {
          if (isUniversal) {
            if (!canAccessUniversalGeoRow(session, canonTable, pr) || !canAccessUniversalGeoRow(session, canonTable, ir)) {
              outList.push(pr);
              keptIds.add(rid);
              continue;
            }
          } else {
            const prCo = String(pr.company || '').trim();
            const irCo = String(ir.company || '').trim();
            if ((prCo && !canAccessCompany(session, prCo)) || (irCo && !canAccessCompany(session, irCo)) || !prCo || !irCo) {
              outList.push(pr);
              keptIds.add(rid);
              continue;
            }
          }
        } else {
          if (isUniversal) {
            if (!canAccessUniversalGeoRow(session, canonTable, ir)) continue;
            if (d1RowById.has(rid)) {
              const exRowHyd = d1RowById.get(rid);
              if (!canAccessUniversalGeoRow(session, canonTable, exRowHyd)) continue;
            }
          } else {
            const irCo = String(ir.company || '').trim();
            if (!irCo || !canAccessCompany(session, irCo)) continue;
            if (d1RowById.has(rid)) {
              const exRowHyd = d1RowById.get(rid);
              const exCo = String((exRowHyd && exRowHyd.company) || '').trim();
              if (!exCo || !canAccessCompany(session, exCo)) continue;
            }
          }
        }
        outList.push(ir);
        keptIds.add(rid);
      }
      for (const pr of pList) {
        if (!pr || !pr.id) continue;
        const rid = String(pr.id).trim();
        if (keptIds.has(rid)) continue;
        if (isUniversal) {
          if (!canManageSeats || !canAccessUniversalGeoRow(session, canonTable, pr)) {
            outList.push(pr);
          }
        } else {
          const prCo = String(pr.company || '').trim();
          if (!prCo || !canAccessCompany(session, prCo)) {
            outList.push(pr);
          }
        }
      }
      incomingDoc.customRecords[k] = outList;
    }
  } else if (!Object.prototype.hasOwnProperty.call(incomingDoc, 'customRecords') && prev.customRecords && typeof prev.customRecords === 'object') {
    incomingDoc.customRecords = prev.customRecords;
  }

  // 2b. Protect _purgedOverrideIds against cross-BU deletion or non-legacy ID injection
  const purgeAcc = createPurgeOverrideAccumulator();
  if (Array.isArray(prev._purgedOverrideIds)) {
    for (const item of prev._purgedOverrideIds) purgeAcc.pushParsed(purgeAcc.parse(item));
  }
  if (Array.isArray(incomingDoc._purgedOverrideIds)) {
    const prevCrForPurge = (prev.customRecords && typeof prev.customRecords === 'object') ? prev.customRecords : {};
    for (const rawItem of incomingDoc._purgedOverrideIds) {
      const parsed = purgeAcc.parse(rawItem);
      if (!parsed || purgeAcc.wouldSkip(parsed)) continue;
      const colon = parsed.base.indexOf(':');
      const tbl = parsed.base.slice(0, colon);
      const rid = parsed.base.slice(colon + 1);
      const pArr = Array.isArray(prevCrForPurge[tbl]) ? prevCrForPurge[tbl] : [];
      const pr = pArr.find(x => x && String(x.id || '').trim() === rid);
      let prCo = String((pr && pr.company) || '').trim();
      if (!prCo && db) {
        const canonTbl = CR_KEY_TO_TABLE[tbl] || tbl;
        if (ALLOWED_TABLES.has(canonTbl)) {
          const cols = await getTableColumns(db, canonTbl);
          if (cols.has('company')) {
            const dRow = await db.prepare(`SELECT company FROM ${canonTbl} WHERE id = ?1 LIMIT 1`).bind(rid).first();
            prCo = String((dRow && dRow.company) || '').trim();
          }
        }
      }
      if (prCo && canAccessCompany(session, prCo)) {
        purgeAcc.pushParsed(parsed);
      }
    }
  }
  const safePurged = purgeAcc.finalize(2000);
  if (safePurged.length) incomingDoc._purgedOverrideIds = safePurged;
  else delete incomingDoc._purgedOverrideIds;

  // 3. Protect industryCustomRows & industryRowEdits
  if (incomingDoc.industryCustomRows && typeof incomingDoc.industryCustomRows === 'object') {
    const prevIcr = (prev.industryCustomRows && typeof prev.industryCustomRows === 'object') ? prev.industryCustomRows : {};
    const incIcr = incomingDoc.industryCustomRows;
    const safeIcr = {};
    for (const bk of new Set([...Object.keys(prevIcr), ...Object.keys(incIcr)])) {
      const pList = Array.isArray(prevIcr[bk]) ? prevIcr[bk] : [];
      if (!Object.prototype.hasOwnProperty.call(incIcr, bk)) {
        if (pList.length) safeIcr[bk] = pList;
        continue;
      }
      const iList = Array.isArray(incIcr[bk]) ? incIcr[bk] : [];
      const pMap = new Map(pList.filter(x => x && (x.id || x.code)).map(x => [String(x.id || x.code).trim(), x]));
      const outB = [];
      const kept = new Set();
      for (const ir of iList) {
        if (!ir || typeof ir !== 'object') continue;
        const rid = String(ir.id || ir.code || '').trim();
        if (!rid) continue;
        const pr = pMap.get(rid);
        const irCo = String(ir.company || ir.fromCo || ir.resort || ir.entity || '').trim();
        const prCo = pr ? String(pr.company || pr.fromCo || pr.resort || pr.entity || '').trim() : '';
        const irInd = inferDomainIndustry(ir, bk);
        const prInd = pr ? inferDomainIndustry(pr, bk) : '';
        if (pr && (
          (prCo && !canAccessCompany(session, prCo))
          || (prInd && !canAccessGeoIndustrySession(session, prInd))
          || !irCo
          || !canAccessCompany(session, irCo)
          || (irInd && !canAccessGeoIndustrySession(session, irInd))
        )) {
          outB.push(pr);
          kept.add(rid);
          continue;
        }
        if (!pr && (!irCo || !canAccessCompany(session, irCo) || (irInd && !canAccessGeoIndustrySession(session, irInd)))) continue;
        outB.push(ir);
        kept.add(rid);
      }
      for (const pr of pList) {
        const rid = pr && String(pr.id || pr.code || '').trim();
        if (!rid || kept.has(rid)) continue;
        const prCo = String(pr.company || pr.fromCo || pr.resort || pr.entity || '').trim();
        const prInd = inferDomainIndustry(pr, bk);
        if (!prCo || !canAccessCompany(session, prCo) || (prInd && !canAccessGeoIndustrySession(session, prInd))) outB.push(pr);
      }
      safeIcr[bk] = outB;
    }
    incomingDoc.industryCustomRows = safeIcr;
  } else if (!Object.prototype.hasOwnProperty.call(incomingDoc, 'industryCustomRows') && prev.industryCustomRows && typeof prev.industryCustomRows === 'object') {
    incomingDoc.industryCustomRows = prev.industryCustomRows;
  }

  if (incomingDoc.industryRowEdits && typeof incomingDoc.industryRowEdits === 'object') {
    const prevIre = (prev.industryRowEdits && typeof prev.industryRowEdits === 'object') ? prev.industryRowEdits : {};
    const incIre = incomingDoc.industryRowEdits;
    const safeIre = {};
    for (const [ek, pv] of Object.entries(prevIre)) {
      const pCo = pv && typeof pv === 'object' ? String(pv.company || pv.fromCo || pv.resort || pv.entity || '').trim() : '';
      const pInd = (pv && typeof pv === 'object') ? inferDomainIndustry(pv, ek) : '';
      if (!pCo || !canAccessCompany(session, pCo) || (pInd && !canAccessGeoIndustrySession(session, pInd))) safeIre[ek] = pv;
    }
    for (const [ek, iv] of Object.entries(incIre)) {
      if (ek in safeIre || !iv || typeof iv !== 'object') continue;
      const iCo = String(iv.company || iv.fromCo || iv.resort || iv.entity || '').trim();
      const iInd = inferDomainIndustry(iv, ek);
      if (iCo && canAccessCompany(session, iCo) && (!iInd || canAccessGeoIndustrySession(session, iInd))) safeIre[ek] = iv;
    }
    incomingDoc.industryRowEdits = safeIre;
  } else if (!Object.prototype.hasOwnProperty.call(incomingDoc, 'industryRowEdits') && prev.industryRowEdits && typeof prev.industryRowEdits === 'object') {
    incomingDoc.industryRowEdits = prev.industryRowEdits;
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

  const canWriteWs = await resolveCanWriteWorkSchedules(db, session, baseUsers);
  if (!canWriteWs) {
    if (prev.workSchedules !== undefined) incomingDoc.workSchedules = prev.workSchedules;
    else delete incomingDoc.workSchedules;
  } else if (prev.workSchedules || incomingDoc.workSchedules) {
    const pWs = (prev.workSchedules && typeof prev.workSchedules === 'object') ? prev.workSchedules : {};
    const iWs = (incomingDoc.workSchedules && typeof incomingDoc.workSchedules === 'object') ? incomingDoc.workSchedules : {};
    const safeDefs = {};
    for (const [ck, cv] of Object.entries(iWs.companyPolicyDefaults || {})) {
      const cvCo = cv && typeof cv === 'object' ? String(cv.company || '').trim() : '';
      if (canAccessCompany(session, ck) && (!cvCo || canonEntityKey(cvCo) === canonEntityKey(ck))) {
        safeDefs[ck] = cv;
      }
    }
    const iShifts = Array.isArray(iWs.shiftTypes) ? iWs.shiftTypes : [];
    const safeShifts = [];
    for (const is of iShifts) {
      if (is && is.company && canAccessCompany(session, is.company)) safeShifts.push(is);
    }
    const pRules = (pWs.staffRules && typeof pWs.staffRules === 'object') ? pWs.staffRules : {};
    const iRules = (iWs.staffRules && typeof iWs.staffRules === 'object') ? iWs.staffRules : {};
    const safeRules = {};
    for (const [rk, iv] of Object.entries(iRules)) {
      if (!String(rk || '').includes('|') || !iv || typeof iv !== 'object' || staffRuleKeyCompanyMismatch(rk, iv)) continue;
      const pRule = pRules[rk];
      if (pRule && typeof pRule === 'object') {
        const pCo = String(pRule.company || '').trim();
        if (!pCo || !canAccessCompany(session, pCo)) continue;
      }
      const iCo = String(iv.company || '').trim();
      if (iCo && canAccessCompany(session, iCo)) safeRules[rk] = iv;
    }
    const sanitizedWs = {
      shiftTypes: safeShifts,
      policyGroups: Array.isArray(pWs.policyGroups) ? pWs.policyGroups : [],
      companyPolicyDefaults: safeDefs,
      staffRules: safeRules
    };
    incomingDoc.workSchedules = mergeWorkSchedulesDocs(pWs, sanitizedWs, session, true);
  }
  if (!canManageSeats) {
    if (prev.alertRules !== undefined) incomingDoc.alertRules = prev.alertRules;
    else delete incomingDoc.alertRules;
    if (prev.staffBiometrics !== undefined) incomingDoc.staffBiometrics = prev.staffBiometrics;
    else delete incomingDoc.staffBiometrics;
    if (prev.partyHygiene !== undefined) incomingDoc.partyHygiene = prev.partyHygiene;
    else delete incomingDoc.partyHygiene;
  } else {
    mergePartyHygieneStoreDoc(incomingDoc, prev, session);
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
    // workSchedules merged above via resolveCanWriteWorkSchedules + mergeWorkSchedulesDocs
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

// A stored document read back from its head + `__part_` rows. `unreadable` when a row exists but the stitched text is
// empty or does not parse to a plain object (torn parts, incident 2026-11-13); `obj` is then `{}`, never a guess.
function parseStoredKvDoc(row) {
  if (!row) return { obj: {}, unreadable: false };
  const raw = String(row.payload_json || '');
  const parsed = raw === '' ? null : safeJsonParse(raw, null);
  const isObj = Boolean(parsed) && typeof parsed === 'object' && !Array.isArray(parsed);
  return { obj: isObj ? parsed : {}, unreadable: !isObj };
}

// Parts with no head row: readEdgeKvDoc returns null (a new workspace), but the store is damaged, not new.
async function hasOrphanKvParts(db, key) {
  const r = await db.prepare('SELECT 1 AS x FROM edge_kv_store WHERE doc_key LIKE ?1 LIMIT 1').bind(`${key}__part_%`).first();
  return Boolean(r);
}

export async function readEdgeKvDoc(db, key) {
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

export async function writeEdgeKvDoc(db, key, jsonStr, updatedAt, updatedBy, casOpts = null) {
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
  if (copy.pin_code || copy.pin_hash || copy.pin_redacted) copy.pin_redacted = true;
  delete copy.pin_code;
  delete copy.pin_hash;
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
        if (isUniversal) return canAccessUniversalGeoRow(session, canonTable, r);
        const co = String(r.company || '').trim();
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
        const co = String(r.company || r.fromCo || r.resort || r.entity || '').trim();
        if (!co || !canAccessCompany(session, co)) return false;
        const indD = inferDomainIndustry(r, bk);
        if (indD && !canAccessGeoIndustrySession(session, indD)) return false;
        return true;
      });
    }
    copyDoc.industryCustomRows = scopedIcr;
  }

  if (docObj.industryRowEdits && typeof docObj.industryRowEdits === 'object') {
    const scopedIre = {};
    for (const [ek, ev] of Object.entries(docObj.industryRowEdits)) {
      if (!ev || typeof ev !== 'object') continue;
      const co = String(ev.company || ev.fromCo || ev.resort || ev.entity || '').trim();
      if (!co || !canAccessCompany(session, co)) continue;
      const indD = inferDomainIndustry(ev, ek);
      if (indD && !canAccessGeoIndustrySession(session, indD)) continue;
      scopedIre[ek] = ev;
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

  if (docObj.partyHygiene && typeof docObj.partyHygiene === 'object') {
    const rawRules = (docObj.partyHygiene.rules && typeof docObj.partyHygiene.rules === 'object') ? docObj.partyHygiene.rules : {};
    const scopedRules = {};
    for (const [rk, rv] of Object.entries(rawRules)) {
      if (!rv || typeof rv !== 'object') continue;
      const rInd = String(rv.industry || 'Manufacturing').trim();
      if (rInd && canAccessGeoIndustrySession(session, rInd)) scopedRules[rk] = rv;
    }
    copyDoc.partyHygiene = { rules: scopedRules };
  }

  if (docObj.workSchedules && typeof docObj.workSchedules === 'object') {
    copyDoc.workSchedules = scopeWorkSchedulesForSession(docObj.workSchedules, session);
  }

  if (Array.isArray(docObj._purgedOverrideIds)) {
    const canMfg = canAccessCompany(session, 'WTC') || canAccessCompany(session, 'BBConstruction') || canAccessCompany(session, 'Lions Transport');
    copyDoc._purgedOverrideIds = docObj._purgedOverrideIds.filter(raw => {
      const s = String(raw || '').trim();
      if (!LEGACY_PURGED_ENTRY_RE.test(s)) return false;
      const base = s.split('@')[0];
      const rid = base.slice(base.indexOf(':') + 1);
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

function pickSyncBase(dbr, pr) {
  if (!dbr || typeof dbr !== 'object') return pr;
  if (!pr || typeof pr !== 'object') return dbr;
  const dbTs = String(dbr.modified_at || dbr.updated_at || dbr.updatedAt || dbr.restored_at || dbr.voided_at || '');
  const prTs = String(pr.modified_at || pr.updated_at || pr.updatedAt || pr.restored_at || pr.voided_at || '');
  const dbVoid = Boolean(dbr.voided);
  const prVoid = Boolean(pr.voided);
  if (dbVoid !== prVoid) {
    if (dbVoid && (!pr.restored_at || String(dbr.voided_at || '') >= String(pr.restored_at || ''))) return dbr;
    if (prVoid && (!dbr.restored_at || String(dbr.restored_at || '') < String(pr.voided_at || ''))) return pr;
    return dbTs >= prTs ? dbr : pr;
  }
  const dbEd = Array.isArray(dbr._pre_void_edits) ? dbr._pre_void_edits.length : 0;
  const prEd = Array.isArray(pr._pre_void_edits) ? pr._pre_void_edits.length : 0;
  if (dbEd !== prEd) return dbEd > prEd ? dbr : pr;
  if (!dbTs && !prTs && dbr.rev !== pr.rev) {
    return Number(dbr.rev || 1) >= Number(pr.rev || 1) ? dbr : pr;
  }
  return dbTs >= prTs ? dbr : pr;
}

function isStaleDbVoidPayload(d1r, kvPr, sanIr) {
  return Boolean(
    d1r && d1r.voided
    && sanIr && !sanIr.voided
    && (!kvPr || !kvPr.voided)
    && !String(sanIr.restored_at || sanIr.restoredAt || '').trim()
    && !sanIr._reopenedExplicitly
    && Number(sanIr.rev || 1) <= Number(d1r.rev || 1)
    && (!kvPr || !hasNonVoidFieldChange(kvPr, sanIr))
  );
}

async function enforceSyncRoleWriteLocks(db, incomingDoc, prevDoc, session, auditOut = null) {
  if (!incomingDoc || typeof incomingDoc !== 'object' || !session) return;
  const perms = getSessionWritePerms(session);
  const isFullSyncWriteSeat = (perms.roleKey === 'Full Access (Owner)' || perms.roleKey === 'Supervisor + Entry')
    && perms.modifyData && perms.modifyText && perms.canEnterAny && perms.voidData && perms.canWriteGeoConfig;
  if (isFullSyncWriteSeat) return;
  const prev = (prevDoc && typeof prevDoc === 'object') ? prevDoc : {};
  const isReadOnly = !perms.modifyText && !perms.modifyData;

  if (incomingDoc.customRecords && typeof incomingDoc.customRecords === 'object') {
    const prevCr = (prev.customRecords && typeof prev.customRecords === 'object') ? prev.customRecords : {};
    for (const k of new Set([...Object.keys(prevCr), ...Object.keys(incomingDoc.customRecords)])) {
      if (!Object.prototype.hasOwnProperty.call(incomingDoc.customRecords, k)) {
        if (Array.isArray(prevCr[k])) incomingDoc.customRecords[k] = prevCr[k];
        continue;
      }
      const canonTable = CR_KEY_TO_TABLE[k] || k;
      const pList = Array.isArray(prevCr[k]) ? prevCr[k] : [];
      const iList = Array.isArray(incomingDoc.customRecords[k]) ? incomingDoc.customRecords[k] : [];
      const pMap = new Map();
      for (const pr of pList) {
        if (pr && pr.id) pMap.set(String(pr.id).trim(), pr);
      }
      const d1Map = new Map();
      if (db && ALLOWED_TABLES.has(canonTable) && canonTable !== 'users') {
        const probeIds = [];
        for (const ir of iList) {
          if (!ir || typeof ir !== 'object' || !ir.id) continue;
          const rid = String(ir.id).trim();
          if (rid) probeIds.push(rid);
        }
        if (probeIds.length) {
          for (let i = 0; i < probeIds.length; i += 80) {
            const slice = probeIds.slice(i, i + 80);
            const ph = slice.map((_, idx) => `?${idx + 1}`).join(',');
            const exRes = await db.prepare(`SELECT * FROM ${canonTable} WHERE id IN (${ph})`).bind(...slice).all();
            for (const xr of (exRes.results || [])) {
              d1Map.set(String(xr.id).trim(), hydrateRowJson(xr));
            }
          }
        }
      }
      const outList = [];
      const keptIds = new Set();
      for (const ir of iList) {
        if (!ir || typeof ir !== 'object' || !ir.id) continue;
        const rid = String(ir.id).trim();
        const d1r = d1Map.get(rid) || null;
        const kvPr = pMap.get(rid) || null;
        const pr = pickSyncBase(d1r, kvPr) || null;
        if (!pr) {
          if (!canCreateTableRecord(perms, canonTable)) continue;
          let cleanedNew = Object.assign({}, ir);
          sanitizeIncomingTwinKeys(cleanedNew, null, session, perms);
          if (!validateRecordGpsCoords(cleanedNew)) {
            stripGpsFields(cleanedNew);
            stripRegionZoneFields(cleanedNew);
          } else {
            if (!perms.canWriteGeoConfig && canonTable !== 'sites') stripGpsFields(cleanedNew);
            if (!perms.canWriteGeoConfig && canonTable !== 'regions') stripRegionZoneFields(cleanedNew);
            if (canonTable === 'sites') cleanedNew = normalizeIncomingSiteCoordAliases(cleanedNew);
          }
          if (!perms.voidData && Boolean(cleanedNew.voided)) {
            stripVoidFields(cleanedNew);
          }
          outList.push(cleanedNew);
          keptIds.add(rid);
          continue;
        }
        const wasVoid = Boolean(pr.voided);
        const nowVoid = Boolean(ir.voided);
        const voidNoteChanged = wasVoid && nowVoid && hasVoidReasonChange(pr, ir);
        let sanIr = Object.assign({}, ir);
        sanitizeIncomingTwinKeys(sanIr, pr, session, perms);
        if (!validateRecordGpsCoords(sanIr)) {
          restoreGpsFieldsFromBase(sanIr, pr);
          restoreRegionZoneFieldsFromBase(sanIr, pr);
        } else if (canonTable === 'sites') {
          sanIr = normalizeIncomingSiteCoordAliases(sanIr);
        }
        if (!perms.voidData && (nowVoid !== wasVoid || voidNoteChanged)) {
          if (isReadOnly) {
            outList.push(pr);
            keptIds.add(rid);
            continue;
          }
          restoreVoidFieldsFromBase(sanIr, pr);
        }
        if (
          wasVoid
          && !Boolean(sanIr.voided)
          && (!session || !session.build_ticket)
          && (
            /^(system-topup|sharepoint top-up)/i.test(String(pr.voided_by || '').trim())
            || isStaleDbVoidPayload(d1r, kvPr, sanIr)
          )
        ) {
          if (pMap.has(rid)) outList.push(pMap.get(rid));
          keptIds.add(rid);
          continue;
        }
        const isSparsePureVoid = Boolean(
          (wasVoid !== Boolean(sanIr.voided) || voidNoteChanged)
          && !hasExplicitGpsKeyInPayload(sanIr)
          && !hasExplicitRegionZoneKeyInPayload(sanIr)
          && !hasSiteSurfaceMutation(canonTable, pr, sanIr)
          && !hasNonVoidFieldChange(pr, sanIr)
        );
        const mergedIr = isSparsePureVoid
          ? restoreSiteSurfaceFromBase(restoreRegionZoneFieldsFromBase(restoreGpsFieldsFromBase(Object.assign({}, pr, sanIr), pr), pr), pr)
          : sanIr;
        if (isSparsePureVoid && voidNoteChanged) {
          applyExplicitVoidReason(mergedIr, sanIr);
        }
        if (isSparsePureVoid && !mergedIr.voided) {
          stripVoidFields(mergedIr);
        }
        const missingPinFill = isInitialMissingSitePinFill(canonTable, pr, mergedIr, perms);
        if (isReadOnly) {
          if (missingPinFill) {
            outList.push(applyInitialMissingSitePinFill(pr, mergedIr, session && session.email));
            keptIds.add(rid);
            continue;
          }
          const allowVoidOnly = Boolean(
            perms.voidData
            && (perms.roleKey === 'Supervisor' || canCreateTableRecord(perms, canonTable))
            && (wasVoid !== Boolean(mergedIr.voided) || (wasVoid && Boolean(mergedIr.voided) && hasVoidReasonChange(pr, mergedIr)))
            && !hasGpsFieldMutation(pr, mergedIr)
            && !hasRegionZoneMutation(pr, mergedIr)
            && !hasSiteSurfaceMutation(canonTable, pr, mergedIr)
            && !hasNonVoidFieldChange(pr, mergedIr)
          );
          if (allowVoidOnly) {
            const nextRowRo = Object.assign({}, pr, {
              voided: Boolean(mergedIr.voided),
              modified_at: mergedIr.modified_at || pr.modified_at || '',
              rev: mergedIr.rev || pr.rev
            });
            if (nextRowRo.voided) {
              if (!wasVoid) delete nextRowRo._reopenedExplicitly;
              nextRowRo.voided_by = wasVoid ? (pr.voided_by || mergedIr.voided_by || '') : (mergedIr.voided_by || mergedIr.voidedBy || pr.voided_by || '');
              if (wasVoid && pr.voided_by_email) nextRowRo.voided_by_email = pr.voided_by_email;
              nextRowRo.voided_at = wasVoid ? (pr.voided_at || mergedIr.voided_at || '') : (mergedIr.voided_at || mergedIr.voidedAt || pr.voided_at || '');
              if (!wasVoid || voidNoteChanged) applyExplicitVoidReason(nextRowRo, mergedIr);
            } else {
              const wasWbMatch = Boolean(
                pr.twin_of
                || pr.twin_difference
                || /^(workbook match|workbook reconciliation)/i.test(String(pr.voided_by || '').trim())
              );
              stripVoidFields(nextRowRo);
              if (mergedIr.restored_at) nextRowRo.restored_at = mergedIr.restored_at;
              if (wasWbMatch) {
                nextRowRo._reopenedExplicitly = true;
                nextRowRo.rev = Math.max(Number(pr.rev || 1) + 1, Number(mergedIr.rev || 1));
              } else if (!session || !session.build_ticket) {
                if (pr._reopenedExplicitly !== undefined) nextRowRo._reopenedExplicitly = pr._reopenedExplicitly;
                else delete nextRowRo._reopenedExplicitly;
              }
            }
            outList.push(nextRowRo);
            keptIds.add(rid);
          } else if (pMap.has(rid)) {
            if (Array.isArray(auditOut) && (canonTable === 'sites' || canonTable === 'regions') && (hasGpsFieldMutation(pr, mergedIr) || hasRegionZoneMutation(pr, mergedIr))) {
              const nc = extractEffectivePinCoords(mergedIr);
              auditOut.push({
                outcome: 'blocked_403',
                action: 'blocked_403',
                source: 'sync',
                industry: String(mergedIr._industry || pr._industry || 'manufacturing'),
                company: String(mergedIr.company || pr.company || ''),
                target_type: canonTable === 'regions' ? 'region' : 'site',
                target_id: rid,
                target_label: String(mergedIr.name || pr.name || canonTable),
                next_lat: nc ? nc.lat : null,
                next_lng: nc ? nc.lng : null,
                detail: { table: canonTable, error: 'Unauthorized read-only GPS/zone mutation reverted on sync' }
              });
            }
            outList.push(pMap.get(rid));
            keptIds.add(rid);
          }
          continue;
        }
        if (missingPinFill) {
          outList.push(applyInitialMissingSitePinFill(pr, mergedIr, session && session.email));
          keptIds.add(rid);
          continue;
        }
        const canEditTblSync = canEditExistingTableRecord(perms, canonTable);
        const allowVoidSync = Boolean(
          perms.voidData
          && (perms.roleKey === 'Supervisor' || canCreateTableRecord(perms, canonTable))
          && (wasVoid !== Boolean(mergedIr.voided) || (wasVoid && Boolean(mergedIr.voided) && hasVoidReasonChange(pr, mergedIr)))
          && !hasGpsFieldMutation(pr, mergedIr)
          && !hasRegionZoneMutation(pr, mergedIr)
          && !hasNonVoidFieldChange(pr, mergedIr)
        );
        if (!canEditTblSync && !allowVoidSync) {
          if (pMap.has(rid)) outList.push(pMap.get(rid));
          keptIds.add(rid);
          continue;
        }
        const allowUnpinnedPinAdd = !perms.canWriteGeoConfig && isInitialUnpinnedSitePinAddition(canonTable, pr, mergedIr, perms);
        if (!perms.canWriteGeoConfig) {
          if (allowUnpinnedPinAdd) {
            applyCanonSiteLatLngAliases(mergedIr);
            mergedIr._pinCleared = false;
            delete mergedIr.pin_cleared;
            delete mergedIr.pinCleared;
          } else if (hasGpsFieldMutation(pr, mergedIr)) {
            if (Array.isArray(auditOut)) {
              const nc = extractEffectivePinCoords(mergedIr);
              auditOut.push({
                outcome: 'blocked_403',
                action: 'blocked_403',
                source: 'sync',
                industry: String(mergedIr._industry || pr._industry || 'manufacturing'),
                company: String(mergedIr.company || pr.company || ''),
                target_type: canonTable === 'regions' ? 'region' : 'site',
                target_id: rid,
                target_label: String(mergedIr.name || pr.name || canonTable),
                next_lat: nc ? nc.lat : null,
                next_lng: nc ? nc.lng : null,
                detail: { table: canonTable, error: 'Unauthorized GPS mutation reverted on sync' }
              });
            }
            restoreGpsFieldsFromBase(mergedIr, pr);
          }
          if (hasRegionZoneMutation(pr, mergedIr)) {
            if (Array.isArray(auditOut)) {
              auditOut.push({
                outcome: 'blocked_403',
                action: 'blocked_403',
                source: 'sync',
                industry: String(mergedIr._industry || pr._industry || 'manufacturing'),
                company: String(mergedIr.company || pr.company || ''),
                target_type: 'region',
                target_id: rid,
                target_label: String(mergedIr.name || pr.name || canonTable),
                detail: { table: canonTable, error: 'Unauthorized region zone mutation reverted on sync' }
              });
            }
            restoreRegionZoneFieldsFromBase(mergedIr, pr);
          }
          if (hasSiteSurfaceMutation(canonTable, pr, mergedIr)) {
            if (Array.isArray(auditOut)) {
              auditOut.push({
                outcome: 'blocked_403',
                action: 'blocked_403',
                source: 'sync',
                industry: String(mergedIr._industry || pr._industry || 'manufacturing'),
                company: String(mergedIr.company || pr.company || ''),
                target_type: 'site',
                target_id: rid,
                target_label: String(mergedIr.name || pr.name || canonTable),
                detail: { table: canonTable, error: 'Unauthorized road surface mutation reverted on sync' }
              });
            }
            restoreSiteSurfaceFromBase(mergedIr, pr);
          }
        }
        outList.push(mergedIr);
        keptIds.add(rid);
      }
      if (!isFullSyncWriteSeat) {
        for (const pr of pList) {
          const rid = pr && pr.id ? String(pr.id).trim() : '';
          if (rid && !keptIds.has(rid)) outList.push(pr);
        }
      }
      incomingDoc.customRecords[k] = outList;
    }
  } else if (!isFullSyncWriteSeat && !Object.prototype.hasOwnProperty.call(incomingDoc, 'customRecords') && prev.customRecords && typeof prev.customRecords === 'object') {
    incomingDoc.customRecords = prev.customRecords;
  }

  if (incomingDoc.industryCustomRows && typeof incomingDoc.industryCustomRows === 'object') {
    const prevIcr = (prev.industryCustomRows && typeof prev.industryCustomRows === 'object') ? prev.industryCustomRows : {};
    const incIcr = incomingDoc.industryCustomRows;
    const safeIcr = {};
    for (const bk of new Set([...Object.keys(prevIcr), ...Object.keys(incIcr)])) {
      const pList = Array.isArray(prevIcr[bk]) ? prevIcr[bk] : [];
      if (!Object.prototype.hasOwnProperty.call(incIcr, bk)) {
        if (pList.length) safeIcr[bk] = pList;
        continue;
      }
      const iList = Array.isArray(incIcr[bk]) ? incIcr[bk] : [];
      const pMap = new Map(pList.filter(x => x && (x.id || x.code)).map(x => [String(x.id || x.code).trim(), x]));
      const d1IcrMap = new Map();
      if (db && (isReadOnly || !perms.modifyData || !perms.canWriteGeoConfig || !perms.voidData)) {
        const icrProbeIds = [];
        for (const ir of iList) {
          if (!ir || typeof ir !== 'object') continue;
          const rid = String(ir.id || ir.code || '').trim();
          if (rid) icrProbeIds.push(rid);
        }
        for (let i = 0; i < icrProbeIds.length; i += 80) {
          const slice = icrProbeIds.slice(i, i + 80);
          const ph = slice.map((_, idx) => `?${idx + 2}`).join(',');
          try {
            const exRes = await db.prepare(`SELECT row_id, rev, voided, updated_at, payload_json FROM industry_custom_rows WHERE bucket = ?1 AND row_id IN (${ph})`).bind(bk, ...slice).all();
            for (const xr of (exRes.results || [])) {
              const obj = safeJsonParse(xr.payload_json, {});
              obj.voided = Boolean(Number(xr.voided || 0) || obj.voided);
              if (xr.rev && obj.rev === undefined) obj.rev = Number(xr.rev);
              if (xr.updated_at && !obj.updated_at) obj.updated_at = String(xr.updated_at);
              d1IcrMap.set(String(xr.row_id).trim(), obj);
            }
          } catch (_) {}
        }
      }
      const outB = [];
      const kept = new Set();
      for (const ir of iList) {
        if (!ir || typeof ir !== 'object') continue;
        const rid = String(ir.id || ir.code || '').trim();
        if (!rid) continue;
        const d1r = d1IcrMap.get(rid) || null;
        const kvPr = pMap.get(rid) || null;
        const pr = pickSyncBase(d1r, kvPr) || null;
        if (!pr) {
          if (!perms.canEnterAny) continue;
          let cleanedNew = Object.assign({}, ir);
          sanitizeIncomingTwinKeys(cleanedNew, null, session, perms);
          if (!perms.canWriteGeoConfig || !validateRecordGpsCoords(cleanedNew)) stripGpsFields(cleanedNew);
          else cleanedNew = normalizeIncomingSiteCoordAliases(cleanedNew);
          if (!perms.voidData && Boolean(cleanedNew.voided)) stripVoidFields(cleanedNew);
          outB.push(cleanedNew);
          kept.add(rid);
          continue;
        }
        const wasVoid = Boolean(pr.voided);
        const nowVoid = Boolean(ir.voided);
        const voidNoteChanged = wasVoid && nowVoid && hasVoidReasonChange(pr, ir);
        let sanIr = Object.assign({}, ir);
        sanitizeIncomingTwinKeys(sanIr, pr, session, perms);
        if (!validateRecordGpsCoords(sanIr)) restoreGpsFieldsFromBase(sanIr, pr);
        else sanIr = normalizeIncomingSiteCoordAliases(sanIr);
        if (!perms.voidData && (nowVoid !== wasVoid || voidNoteChanged)) {
          if (isReadOnly) {
            outB.push(pr);
            kept.add(rid);
            continue;
          }
          restoreVoidFieldsFromBase(sanIr, pr);
        }
        if (
          wasVoid
          && !Boolean(sanIr.voided)
          && (!session || !session.build_ticket)
          && (
            /^(system-topup|sharepoint top-up)/i.test(String(pr.voided_by || '').trim())
            || isStaleDbVoidPayload(d1r, kvPr, sanIr)
          )
        ) {
          outB.push(pr);
          kept.add(rid);
          continue;
        }
        const isSparsePureVoid = Boolean((wasVoid !== Boolean(sanIr.voided) || voidNoteChanged) && !hasExplicitGpsKeyInPayload(sanIr) && !hasNonVoidFieldChange(pr, sanIr));
        const mergedIr = isSparsePureVoid ? restoreGpsFieldsFromBase(Object.assign({}, pr, sanIr), pr) : sanIr;
        if (isSparsePureVoid && voidNoteChanged) {
          applyExplicitVoidReason(mergedIr, sanIr);
        }
        if (isSparsePureVoid && !mergedIr.voided) {
          stripVoidFields(mergedIr);
        }
        if (isReadOnly) {
          const allowVoidOnly = Boolean(perms.voidData && (wasVoid !== Boolean(mergedIr.voided) || (wasVoid && Boolean(mergedIr.voided) && hasVoidReasonChange(pr, mergedIr))) && !hasGpsFieldMutation(pr, mergedIr) && !hasNonVoidFieldChange(pr, mergedIr));
          if (allowVoidOnly) {
            const nextRo = Object.assign({}, pr, { voided: Boolean(mergedIr.voided), updated_at: mergedIr.updated_at || pr.updated_at, rev: mergedIr.rev || pr.rev });
            if (nextRo.voided) {
              if (!wasVoid) delete nextRo._reopenedExplicitly;
              nextRo.voided_by = wasVoid ? (pr.voided_by || mergedIr.voided_by || '') : (mergedIr.voided_by || mergedIr.voidedBy || pr.voided_by || '');
              if (wasVoid && pr.voided_by_email) nextRo.voided_by_email = pr.voided_by_email;
              nextRo.voided_at = wasVoid ? (pr.voided_at || mergedIr.voided_at || '') : (mergedIr.voided_at || mergedIr.voidedAt || pr.voided_at || '');
              if (!wasVoid || voidNoteChanged) applyExplicitVoidReason(nextRo, mergedIr);
            } else {
              stripVoidFields(nextRo);
              if (mergedIr.restored_at) nextRo.restored_at = mergedIr.restored_at;
            }
            outB.push(nextRo);
          } else {
            outB.push(pr);
          }
          kept.add(rid);
          continue;
        }
        if (!perms.canWriteGeoConfig && hasGpsFieldMutation(pr, mergedIr)) {
          if (Array.isArray(auditOut)) {
            const nc = extractEffectivePinCoords(mergedIr);
            auditOut.push({
              outcome: 'blocked_403',
              action: 'blocked_403',
              source: 'sync',
              industry: inferDomainIndustry(mergedIr, bk),
              company: String(mergedIr.company || mergedIr.fromCo || pr.company || ''),
              target_type: 'domain_location',
              target_id: rid,
              target_label: String(mergedIr.name || pr.name || rid),
              next_lat: nc ? nc.lat : null,
              next_lng: nc ? nc.lng : null,
              detail: { bucket: bk, error: 'Unauthorized domain GPS mutation reverted on sync' }
            });
          }
          restoreGpsFieldsFromBase(mergedIr, pr);
        }
        outB.push(mergedIr);
        kept.add(rid);
      }
      if (!isFullSyncWriteSeat) {
        for (const pr of pList) {
          const rid = pr && String(pr.id || pr.code || '').trim();
          if (rid && !kept.has(rid)) outB.push(pr);
        }
      }
      safeIcr[bk] = outB;
    }
    incomingDoc.industryCustomRows = safeIcr;
  } else if (!isFullSyncWriteSeat && !Object.prototype.hasOwnProperty.call(incomingDoc, 'industryCustomRows') && prev.industryCustomRows && typeof prev.industryCustomRows === 'object') {
    incomingDoc.industryCustomRows = prev.industryCustomRows;
  }

  if (incomingDoc.industryRowEdits && typeof incomingDoc.industryRowEdits === 'object') {
    const prevIre = (prev.industryRowEdits && typeof prev.industryRowEdits === 'object') ? prev.industryRowEdits : {};
    const incIre = incomingDoc.industryRowEdits;
    const d1IreMap = new Map();
    if (db && (isReadOnly || !perms.modifyData || !perms.canWriteGeoConfig || !perms.voidData)) {
      const ireProbeEks = [];
      for (const [ek, iv] of Object.entries(incIre)) {
        if (ek && iv && typeof iv === 'object') ireProbeEks.push(ek);
      }
      for (let i = 0; i < ireProbeEks.length; i += 80) {
        const slice = ireProbeEks.slice(i, i + 80);
        const ph = slice.map((_, idx) => `?${idx + 1}`).join(',');
        try {
          const exRes = await db.prepare(`SELECT edit_key, rev, voided, updated_at, payload_json FROM industry_row_edits WHERE edit_key IN (${ph})`).bind(...slice).all();
          for (const xr of (exRes.results || [])) {
            const obj = safeJsonParse(xr.payload_json, {});
            obj.voided = Boolean(Number(xr.voided || 0) || obj.voided);
            if (xr.rev && obj.rev === undefined) obj.rev = Number(xr.rev);
            if (xr.updated_at && !obj.updated_at) obj.updated_at = String(xr.updated_at);
            d1IreMap.set(String(xr.edit_key).trim(), obj);
          }
        } catch (_) {}
      }
    }
    const safeIre = {};
    for (const [ek, iv] of Object.entries(incIre)) {
      if (!iv || typeof iv !== 'object') continue;
      const d1v = d1IreMap.get(ek) || null;
      const kvPv = prevIre[ek] && typeof prevIre[ek] === 'object' ? prevIre[ek] : null;
      const pv = pickSyncBase(d1v, kvPv) || null;
      if (pv) {
        const wasVoid = Boolean(pv.voided);
        const nowVoid = Boolean(iv.voided);
        const voidNoteChanged = wasVoid && nowVoid && hasVoidReasonChange(pv, iv);
        let sanIv = Object.assign({}, iv);
        sanitizeIncomingTwinKeys(sanIv, pv, session, perms);
        if (!validateRecordGpsCoords(sanIv)) restoreGpsFieldsFromBase(sanIv, pv);
        else sanIv = normalizeIncomingSiteCoordAliases(sanIv);
        if (!perms.voidData && (nowVoid !== wasVoid || voidNoteChanged)) {
          if (isReadOnly) {
            safeIre[ek] = pv;
            continue;
          }
          restoreVoidFieldsFromBase(sanIv, pv);
        }
        if (
          wasVoid
          && !Boolean(sanIv.voided)
          && (!session || !session.build_ticket)
          && (
            /^(system-topup|sharepoint top-up)/i.test(String(pv.voided_by || '').trim())
            || isStaleDbVoidPayload(d1v, kvPv, sanIv)
          )
        ) {
          safeIre[ek] = pv;
          continue;
        }
        const isSparsePureVoid = Boolean((wasVoid !== Boolean(sanIv.voided) || voidNoteChanged) && !hasExplicitGpsKeyInPayload(sanIv) && !hasNonVoidFieldChange(pv, sanIv));
        const mergedIv = isSparsePureVoid ? restoreGpsFieldsFromBase(Object.assign({}, pv, sanIv), pv) : sanIv;
        if (isSparsePureVoid && voidNoteChanged) {
          applyExplicitVoidReason(mergedIv, sanIv);
        }
        if (isSparsePureVoid && !mergedIv.voided) {
          stripVoidFields(mergedIv);
        }
        if (isReadOnly) {
          const allowVoidOnly = Boolean(perms.voidData && (wasVoid !== Boolean(mergedIv.voided) || (wasVoid && Boolean(mergedIv.voided) && hasVoidReasonChange(pv, mergedIv))) && !hasGpsFieldMutation(pv, mergedIv) && !hasNonVoidFieldChange(pv, mergedIv));
          if (!allowVoidOnly && Array.isArray(auditOut) && hasGpsFieldMutation(pv, mergedIv)) {
            const nc = extractEffectivePinCoords(mergedIv);
            auditOut.push({
              outcome: 'blocked_403',
              action: 'blocked_403',
              source: 'sync',
              industry: inferDomainIndustry(mergedIv, ek),
              company: String(mergedIv.company || mergedIv.fromCo || pv.company || ''),
              target_type: 'domain_location',
              target_id: ek,
              target_label: String(mergedIv.name || pv.name || ek),
              next_lat: nc ? nc.lat : null,
              next_lng: nc ? nc.lng : null,
              detail: { editKey: ek, error: 'Unauthorized read-only domain edit GPS mutation reverted on sync' }
            });
          }
          if (allowVoidOnly) {
            safeIre[ek] = Object.assign({}, pv, {
              voided: Boolean(mergedIv.voided),
              rev: mergedIv.rev || pv.rev,
              updated_at: mergedIv.updated_at || pv.updated_at,
              updatedAt: mergedIv.updatedAt || pv.updatedAt
            });
            if (safeIre[ek].voided) {
              if (!wasVoid) delete safeIre[ek]._reopenedExplicitly;
              safeIre[ek].voided_by = wasVoid ? (pv.voided_by || mergedIv.voided_by || '') : (mergedIv.voided_by || mergedIv.voidedBy || pv.voided_by || '');
              if (wasVoid && pv.voided_by_email) safeIre[ek].voided_by_email = pv.voided_by_email;
              safeIre[ek].voided_at = wasVoid ? (pv.voided_at || mergedIv.voided_at || '') : (mergedIv.voided_at || mergedIv.voidedAt || pv.voided_at || '');
              if (!wasVoid || voidNoteChanged) applyExplicitVoidReason(safeIre[ek], mergedIv);
            } else {
              stripVoidFields(safeIre[ek]);
              if (mergedIv.restored_at) safeIre[ek].restored_at = mergedIv.restored_at;
            }
          } else {
            safeIre[ek] = pv;
          }
        } else {
          if (!perms.canWriteGeoConfig && hasGpsFieldMutation(pv, mergedIv)) {
            if (Array.isArray(auditOut)) {
              const nc = extractEffectivePinCoords(mergedIv);
              auditOut.push({
                outcome: 'blocked_403',
                action: 'blocked_403',
                source: 'sync',
                industry: inferDomainIndustry(mergedIv, ek),
                company: String(mergedIv.company || mergedIv.fromCo || pv.company || ''),
                target_type: 'domain_location',
                target_id: ek,
                target_label: String(mergedIv.name || pv.name || ek),
                next_lat: nc ? nc.lat : null,
                next_lng: nc ? nc.lng : null,
                detail: { editKey: ek, error: 'Unauthorized domain edit GPS mutation reverted on sync' }
              });
            }
            restoreGpsFieldsFromBase(mergedIv, pv);
          }
          safeIre[ek] = mergedIv;
        }
      } else {
        if (isReadOnly) {
          if (Array.isArray(auditOut) && (hasAnyGpsField(iv) || hasExplicitGpsKeyInPayload(iv))) {
            const nc = extractEffectivePinCoords(iv);
            auditOut.push({
              outcome: 'blocked_403',
              action: 'blocked_403',
              source: 'sync',
              industry: inferDomainIndustry(iv, ek),
              company: String(iv.company || iv.fromCo || ''),
              target_type: 'domain_location',
              target_id: ek,
              target_label: String(iv.name || ek),
              next_lat: nc ? nc.lat : null,
              next_lng: nc ? nc.lng : null,
              detail: { editKey: ek, error: 'Unauthorized read-only new domain edit GPS dropped on sync' }
            });
          }
          if (perms.voidData && Boolean(iv.voided) && validateRecordGpsCoords(iv) && !hasAnyGpsField(iv) && !hasExplicitGpsKeyInPayload(iv)) {
            const cleanedRo = Object.assign({}, iv);
            sanitizeIncomingTwinKeys(cleanedRo, null, session, perms);
            safeIre[ek] = cleanedRo;
          }
        } else {
          let cleanedNew = Object.assign({}, iv);
          sanitizeIncomingTwinKeys(cleanedNew, null, session, perms);
          if (!perms.canWriteGeoConfig && (hasAnyGpsField(iv) || hasExplicitGpsKeyInPayload(iv)) && Array.isArray(auditOut)) {
            const nc = extractEffectivePinCoords(iv);
            auditOut.push({
              outcome: 'blocked_403',
              action: 'blocked_403',
              source: 'sync',
              industry: inferDomainIndustry(iv, ek),
              company: String(iv.company || iv.fromCo || ''),
              target_type: 'domain_location',
              target_id: ek,
              target_label: String(iv.name || ek),
              next_lat: nc ? nc.lat : null,
              next_lng: nc ? nc.lng : null,
              detail: { editKey: ek, error: 'Unauthorized new domain edit GPS stripped on sync' }
            });
          }
          if (!perms.canWriteGeoConfig || !validateRecordGpsCoords(cleanedNew)) stripGpsFields(cleanedNew);
          else cleanedNew = normalizeIncomingSiteCoordAliases(cleanedNew);
          if (!perms.voidData && Boolean(cleanedNew.voided)) stripVoidFields(cleanedNew);
          safeIre[ek] = cleanedNew;
        }
      }
    }
    if (!isFullSyncWriteSeat) {
      for (const [ek, pv] of Object.entries(prevIre)) {
        if (!(ek in safeIre)) safeIre[ek] = pv;
      }
    }
    incomingDoc.industryRowEdits = safeIre;
  } else if (!isFullSyncWriteSeat && !Object.prototype.hasOwnProperty.call(incomingDoc, 'industryRowEdits') && prev.industryRowEdits && typeof prev.industryRowEdits === 'object') {
    incomingDoc.industryRowEdits = prev.industryRowEdits;
  }
}

async function enforceSyncVoidActors(db, incomingDoc, prevDoc, session) {
  if (!incomingDoc || typeof incomingDoc !== 'object' || !session || session.build_ticket) return;
  const prev = (prevDoc && typeof prevDoc === 'object') ? prevDoc : {};
  const nowIso = new Date().toISOString();
  const needsSyncProbe = (ir, pr) => {
    if (!pr) return true;
    if (Boolean(ir.voided) !== Boolean(pr.voided)) return true;
    if (ir._pre_void_edits || ir._pre_void_orig || pr._pre_void_edits || pr._pre_void_orig) return true;
    if (hasNonVoidFieldChange(pr, ir)) return true;
    return stableRowSig(pr) !== stableRowSig(ir);
  };
  const lastEditTs = obj => {
    const eds = obj && Array.isArray(obj._pre_void_edits) ? obj._pre_void_edits : null;
    return (eds && eds.length) ? String(eds[eds.length - 1]?.at || '') : '';
  };
  const preserveNewerDbRowOverStaleSync = (ir, dbr, pr) => {
    if (!ir || typeof ir !== 'object' || !dbr || typeof dbr !== 'object') return false;
    const dbV = Boolean(dbr.voided);
    const irV = Boolean(ir.voided);
    const staleDbVoid = isStaleDbVoidPayload(dbr, pr, ir);
    const restoredAt = String(ir.restored_at || ir.restoredAt || '').trim();
    const dbVoidTs = String(dbr.voided_at || dbr.voidedAt || '');
    const editTs = lastEditTs(dbr);
    const dbBizTs = String(editTs || dbr.modified_at || dbr.updated_at || dbr.updatedAt || '');
    const irTs = String(ir.modified_at || ir.updated_at || ir.updatedAt || '');
    const irVoidTs = String(ir.voided_at || ir.voidedAt || irTs || '');
    const dbEdCnt = Array.isArray(dbr._pre_void_edits) ? dbr._pre_void_edits.length : 0;
    const irEdCnt = Array.isArray(ir._pre_void_edits) ? ir._pre_void_edits.length : 0;
    const dbOrigCnt = (dbr._pre_void_orig && typeof dbr._pre_void_orig === 'object') ? Object.keys(dbr._pre_void_orig).length : 0;
    const irOrigCnt = (ir._pre_void_orig && typeof ir._pre_void_orig === 'object') ? Object.keys(ir._pre_void_orig).length : 0;
    const prEdCnt = (pr && Array.isArray(pr._pre_void_edits)) ? pr._pre_void_edits.length : 0;
    const prOrigCnt = (pr && pr._pre_void_orig && typeof pr._pre_void_orig === 'object') ? Object.keys(pr._pre_void_orig).length : 0;
    const dbAheadOfPr = Boolean(!pr || hasNonVoidFieldChange(pr, dbr) || dbEdCnt > prEdCnt || dbOrigCnt > prOrigCnt || (dbV && !pr.voided));
    const hasDbDelta = hasNonVoidFieldChange(ir, dbr) || dbEdCnt > irEdCnt || dbOrigCnt > irOrigCnt;
    const staleUnvoidOverwrite = Boolean(
      staleDbVoid
      || (
        dbV && !irV
        && (!pr || !pr.voided)
        && !ir._reopenedExplicitly
        && (!restoredAt || (dbVoidTs && restoredAt < dbVoidTs))
        && (hasDbDelta || !irTs || (dbVoidTs && irTs < dbVoidTs))
      )
    );
    const isOlderTs = Boolean(dbAheadOfPr && dbEdCnt > irEdCnt && editTs && irTs && irTs < editTs);
    const matchesPreEditOrig = Boolean(
      dbAheadOfPr
      && dbEdCnt > irEdCnt
      && dbr._pre_void_orig && typeof dbr._pre_void_orig === 'object'
      && hasNonVoidFieldChange(ir, dbr)
      && !hasNonVoidFieldChange(Object.assign({}, dbr, dbr._pre_void_orig), ir)
    );
    const uneditedStaleOverNewerDb = Boolean(matchesPreEditOrig || (pr && !hasNonVoidFieldChange(pr, ir) && hasDbDelta));
    if (!staleUnvoidOverwrite && !isOlderTs && !uneditedStaleOverNewerDb) return false;
    const keepBucket = ir._customBucket;
    if (!staleUnvoidOverwrite && !dbV && irV && uneditedStaleOverNewerDb && !isOlderTs && irVoidTs && (!dbBizTs || irVoidTs >= dbBizTs)) {
      const keepVoid = { voided: true };
      for (const vk of ['void_reason', 'voidReason', 'void_note', 'voidNote', 'voided_at', 'voidedAt', 'voided_by', 'voidedBy', 'voided_by_email', 'voidedByEmail', 'modified_at']) {
        if (vk in ir && ir[vk] !== undefined) keepVoid[vk] = ir[vk];
      }
      for (const k of Object.keys(ir)) delete ir[k];
      Object.assign(ir, dbr, keepVoid);
      if (keepBucket && !ir._customBucket) ir._customBucket = keepBucket;
      return false;
    }
    for (const k of Object.keys(ir)) delete ir[k];
    Object.assign(ir, dbr);
    if (keepBucket && !ir._customBucket) ir._customBucket = keepBucket;
    return true;
  };

  if (incomingDoc.customRecords && typeof incomingDoc.customRecords === 'object') {
    const prevCr = (prev.customRecords && typeof prev.customRecords === 'object') ? prev.customRecords : {};
    for (const [k, list] of Object.entries(incomingDoc.customRecords)) {
      if (!Array.isArray(list) || !list.length) continue;
      const canonTable = CR_KEY_TO_TABLE[k] || k;
      const pList = Array.isArray(prevCr[k]) ? prevCr[k] : [];
      const pMap = new Map(pList.filter(x => x && x.id).map(x => [String(x.id).trim(), x]));
      const d1Map = new Map();
      if (db && ALLOWED_TABLES.has(canonTable)) {
        const probeIds = [];
        for (const ir of list) {
          if (!ir || typeof ir !== 'object' || !ir.id) continue;
          const rid = String(ir.id).trim();
          const pr = pMap.get(rid);
          if (needsSyncProbe(ir, pr)) probeIds.push(rid);
        }
        for (let i = 0; i < probeIds.length; i += 80) {
          const slice = probeIds.slice(i, i + 80);
          const ph = slice.map((_, idx) => `?${idx + 1}`).join(',');
          try {
            const exRes = await db.prepare(`SELECT * FROM ${canonTable} WHERE id IN (${ph})`).bind(...slice).all();
            for (const xr of (exRes.results || [])) {
              d1Map.set(String(xr.id).trim(), hydrateRowJson(xr));
            }
          } catch (_) {}
        }
      }
      for (const ir of list) {
        if (!ir || typeof ir !== 'object' || !ir.id) continue;
        const rid = String(ir.id).trim();
        const pr = pMap.get(rid) || null;
        const d1r = d1Map.get(rid) || null;
        if (preserveNewerDbRowOverStaleSync(ir, d1r, pr)) continue;
        const base = pickSyncBase(d1r, pr);
        enforceServerVoidActorFields(ir, base, session, nowIso, { allowDoorTablet: canonTable === 'attendance' });
      }
    }
  }

  if (incomingDoc.industryCustomRows && typeof incomingDoc.industryCustomRows === 'object') {
    const prevIcr = (prev.industryCustomRows && typeof prev.industryCustomRows === 'object') ? prev.industryCustomRows : {};
    for (const [bk, list] of Object.entries(incomingDoc.industryCustomRows)) {
      if (!Array.isArray(list) || !list.length) continue;
      const pList = Array.isArray(prevIcr[bk]) ? prevIcr[bk] : [];
      const pMap = new Map(pList.filter(x => x && (x.id || x.code)).map(x => [String(x.id || x.code).trim(), x]));
      const d1Map = new Map();
      if (db) {
        const probeIds = [];
        for (const ir of list) {
          if (!ir || typeof ir !== 'object') continue;
          const rid = String(ir.id || ir.code || '').trim();
          const pr = rid ? pMap.get(rid) : null;
          if (rid && needsSyncProbe(ir, pr)) probeIds.push(rid);
        }
        for (let i = 0; i < probeIds.length; i += 80) {
          const slice = probeIds.slice(i, i + 80);
          const ph = slice.map((_, idx) => `?${idx + 2}`).join(',');
          try {
            const exRes = await db.prepare(`SELECT row_id, rev, voided, updated_at, payload_json FROM industry_custom_rows WHERE bucket = ?1 AND row_id IN (${ph})`).bind(bk, ...slice).all();
            for (const xr of (exRes.results || [])) {
              const obj = safeJsonParse(xr.payload_json, {});
              obj.voided = Boolean(Number(xr.voided || 0) || obj.voided);
              if (xr.rev && obj.rev === undefined) obj.rev = Number(xr.rev);
              if (xr.updated_at && !obj.updated_at) obj.updated_at = String(xr.updated_at);
              d1Map.set(String(xr.row_id).trim(), obj);
            }
          } catch (_) {}
        }
      }
      for (const ir of list) {
        if (!ir || typeof ir !== 'object') continue;
        const rid = String(ir.id || ir.code || '').trim();
        if (!rid) continue;
        const pr = pMap.get(rid) || null;
        const d1r = d1Map.get(rid) || null;
        if (preserveNewerDbRowOverStaleSync(ir, d1r, pr)) continue;
        enforceServerVoidActorFields(ir, pickSyncBase(d1r, pr), session, nowIso);
      }
    }
  }

  if (incomingDoc.industryRowEdits && typeof incomingDoc.industryRowEdits === 'object') {
    const prevIre = (prev.industryRowEdits && typeof prev.industryRowEdits === 'object') ? prev.industryRowEdits : {};
    const d1EditMap = new Map();
    if (db) {
      const probeEks = [];
      for (const [ek, iv] of Object.entries(incomingDoc.industryRowEdits)) {
        if (!ek || !iv || typeof iv !== 'object') continue;
        const pv = prevIre[ek];
        if (needsSyncProbe(iv, pv)) probeEks.push(ek);
      }
      for (let i = 0; i < probeEks.length; i += 80) {
        const slice = probeEks.slice(i, i + 80);
        const ph = slice.map((_, idx) => `?${idx + 1}`).join(',');
        try {
          const exRes = await db.prepare(`SELECT edit_key, rev, voided, updated_at, payload_json FROM industry_row_edits WHERE edit_key IN (${ph})`).bind(...slice).all();
          for (const xr of (exRes.results || [])) {
            const obj = safeJsonParse(xr.payload_json, {});
            obj.voided = Boolean(Number(xr.voided || 0) || obj.voided);
            if (xr.rev && obj.rev === undefined) obj.rev = Number(xr.rev);
            if (xr.updated_at && !obj.updated_at) obj.updated_at = String(xr.updated_at);
            d1EditMap.set(String(xr.edit_key).trim(), obj);
          }
        } catch (_) {}
      }
    }
    for (const [ek, iv] of Object.entries(incomingDoc.industryRowEdits)) {
      if (!ek || !iv || typeof iv !== 'object') continue;
      const pv = prevIre[ek] && typeof prevIre[ek] === 'object' ? prevIre[ek] : null;
      const d1e = d1EditMap.get(ek) || null;
      if (preserveNewerDbRowOverStaleSync(iv, d1e, pv)) continue;
      enforceServerVoidActorFields(iv, pickSyncBase(d1e, pv), session, nowIso);
    }
  }
}

async function enforceSyncVoidReasonAndTwinGuards(db, incomingDoc, prevDoc, session) {
  if (!incomingDoc || typeof incomingDoc !== 'object' || !session || session.build_ticket) return null;
  const perms = getSessionWritePerms(session);
  const trustedTwin = Boolean(session.build_ticket || (perms && perms.roleKey === 'Full Access (Owner)'));
  const prev = (prevDoc && typeof prevDoc === 'object') ? prevDoc : {};
  let voidRuleCfg = null;
  const getRuleCfg = async () => {
    if (!voidRuleCfg) voidRuleCfg = await loadVoidReasonRuleCfgEdge(db);
    return voidRuleCfg;
  };

  if (incomingDoc.customRecords && typeof incomingDoc.customRecords === 'object') {
    const prevCr = (prev.customRecords && typeof prev.customRecords === 'object') ? prev.customRecords : {};
    for (const [k, list] of Object.entries(incomingDoc.customRecords)) {
      if (!Array.isArray(list) || !list.length) continue;
      const canonTable = CR_KEY_TO_TABLE[k] || k;
      const pList = Array.isArray(prevCr[k]) ? prevCr[k] : [];
      const pMap = new Map(pList.filter(x => x && x.id).map(x => [String(x.id).trim(), x]));
      const d1Map = new Map();
      if (db && ALLOWED_TABLES.has(canonTable)) {
        const probeIds = [];
        for (const ir of list) {
          if (!ir || typeof ir !== 'object' || !ir.id) continue;
          const rid = String(ir.id).trim();
          const pr = pMap.get(rid);
          const needsVoidCheck = Boolean(ir.voided) && (!pr || !pr.voided);
          const needsTwinBase = !trustedTwin && !pr && ('twin_of' in ir || 'twin_difference' in ir);
          if (rid && (needsVoidCheck || needsTwinBase)) probeIds.push(rid);
        }
        for (let i = 0; i < probeIds.length; i += 80) {
          const slice = probeIds.slice(i, i + 80);
          const ph = slice.map((_, idx) => `?${idx + 1}`).join(',');
          try {
            const exRes = await db.prepare(`SELECT * FROM ${canonTable} WHERE id IN (${ph})`).bind(...slice).all();
            for (const xr of (exRes.results || [])) {
              d1Map.set(String(xr.id).trim(), hydrateRowJson(xr));
            }
          } catch (_) {}
        }
      }
      for (const ir of list) {
        if (!ir || typeof ir !== 'object' || !ir.id) continue;
        const rid = String(ir.id).trim();
        const pr = pMap.get(rid) || null;
        const d1r = d1Map.get(rid) || null;
        const existing = (d1r && (d1r.voided || !pr)) ? d1r : (pr || d1r || null);
        if (!trustedTwin) sanitizeIncomingTwinKeys(ir, existing, session, perms);
        if (Boolean(ir.voided) && !(existing && existing.voided)) {
          const cfg = await getRuleCfg();
          const checkObj = existing ? Object.assign({}, existing, ir) : ir;
          const vrErr = checkMandatoryVoidReasonEdge(k, checkObj, session, cfg, existing);
          if (vrErr) return vrErr;
        }
      }
    }
  }

  if (incomingDoc.industryCustomRows && typeof incomingDoc.industryCustomRows === 'object') {
    const prevIcr = (prev.industryCustomRows && typeof prev.industryCustomRows === 'object') ? prev.industryCustomRows : {};
    for (const [bk, list] of Object.entries(incomingDoc.industryCustomRows)) {
      if (!Array.isArray(list) || !list.length) continue;
      const pList = Array.isArray(prevIcr[bk]) ? prevIcr[bk] : [];
      const pMap = new Map(pList.filter(x => x && (x.id || x.code)).map(x => [String(x.id || x.code).trim(), x]));
      const d1Map = new Map();
      if (db) {
        const probeIds = [];
        for (const ir of list) {
          if (!ir || typeof ir !== 'object') continue;
          const rid = String(ir.id || ir.code || '').trim();
          const pr = rid ? pMap.get(rid) : null;
          const needsVoidCheck = Boolean(ir.voided) && (!pr || !pr.voided);
          const needsTwinBase = !trustedTwin && !pr && ('twin_of' in ir || 'twin_difference' in ir);
          if (rid && (needsVoidCheck || needsTwinBase)) probeIds.push(rid);
        }
        for (let i = 0; i < probeIds.length; i += 80) {
          const slice = probeIds.slice(i, i + 80);
          const ph = slice.map((_, idx) => `?${idx + 2}`).join(',');
          try {
            const exRes = await db.prepare(`SELECT row_id, voided, payload_json FROM industry_custom_rows WHERE bucket = ?1 AND row_id IN (${ph})`).bind(bk, ...slice).all();
            for (const xr of (exRes.results || [])) {
              const obj = safeJsonParse(xr.payload_json, {});
              obj.voided = Boolean(Number(xr.voided || 0) || obj.voided);
              d1Map.set(String(xr.row_id).trim(), obj);
            }
          } catch (_) {}
        }
      }
      for (const ir of list) {
        if (!ir || typeof ir !== 'object') continue;
        const rid = String(ir.id || ir.code || '').trim();
        if (!rid) continue;
        const pr = pMap.get(rid) || null;
        const d1r = d1Map.get(rid) || null;
        const existing = (d1r && (d1r.voided || !pr)) ? d1r : (pr || d1r || null);
        if (!trustedTwin) sanitizeIncomingTwinKeys(ir, existing, session, perms);
        if (Boolean(ir.voided) && !(existing && existing.voided)) {
          const cfg = await getRuleCfg();
          const checkObj = existing ? Object.assign({}, existing, ir) : ir;
          const vrErr = checkMandatoryVoidReasonEdge(bk, checkObj, session, cfg, existing);
          if (vrErr) return vrErr;
        }
      }
    }
  }

  if (incomingDoc.industryRowEdits && typeof incomingDoc.industryRowEdits === 'object') {
    const prevIre = (prev.industryRowEdits && typeof prev.industryRowEdits === 'object') ? prev.industryRowEdits : {};
    const d1EditMap = new Map();
    if (db) {
      const probeEks = [];
      for (const [ek, iv] of Object.entries(incomingDoc.industryRowEdits)) {
        if (!ek || !iv || typeof iv !== 'object') continue;
        const pv = prevIre[ek];
        const needsVoidCheck = Boolean(iv.voided) && (!pv || !pv.voided);
        const needsTwinBase = !trustedTwin && !pv && ('twin_of' in iv || 'twin_difference' in iv);
        if (needsVoidCheck || needsTwinBase) probeEks.push(ek);
      }
      for (let i = 0; i < probeEks.length; i += 80) {
        const slice = probeEks.slice(i, i + 80);
        const ph = slice.map((_, idx) => `?${idx + 1}`).join(',');
        try {
          const exRes = await db.prepare(`SELECT edit_key, voided, payload_json FROM industry_row_edits WHERE edit_key IN (${ph})`).bind(...slice).all();
          for (const xr of (exRes.results || [])) {
            const obj = safeJsonParse(xr.payload_json, {});
            obj.voided = Boolean(Number(xr.voided || 0) || obj.voided);
            d1EditMap.set(String(xr.edit_key).trim(), obj);
          }
        } catch (_) {}
      }
    }
    for (const [ek, iv] of Object.entries(incomingDoc.industryRowEdits)) {
      if (!ek || !iv || typeof iv !== 'object') continue;
      const pv = prevIre[ek] && typeof prevIre[ek] === 'object' ? prevIre[ek] : null;
      const d1e = d1EditMap.get(ek) || null;
      const existing = (d1e && (d1e.voided || !pv)) ? d1e : (pv || d1e || null);
      if (!trustedTwin) sanitizeIncomingTwinKeys(iv, existing, session, perms);
      if (Boolean(iv.voided) && !(existing && existing.voided) && !/^WF::/i.test(ek)) {
        const cfg = await getRuleCfg();
        const checkObj = existing ? Object.assign({}, existing, iv) : iv;
        const vrErr = checkMandatoryVoidReasonEdge((checkObj && checkObj.domainTblKey) || ek, checkObj, session, cfg, existing);
        if (vrErr) return vrErr;
      }
    }
  }
  return null;
}

export function isPushOwnedDoc(docKey) {
  const k = String(docKey || '');
  return k === 'vapid_keypair_v1'
    || k === 'day_close_push_subs_v1'
    || k.startsWith('vapid_keypair_v1__part_')
    || k.startsWith('day_close_push_subs_v1__part_');
}

async function computeSyncDocEtag(docObj) {
  const bytes = new TextEncoder().encode(JSON.stringify(docObj || {}));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

export async function handleSync(request, env, session, body, _ctx) {
  if (!session) return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  if (!env || !env.DB) return jsonResponse({ ok: false, error: 'D1 not bound' }, 503);
  const docKey = String((body && body.doc) || 'mfg_web_store');
  const patchDocKeys = (body && body.op === 'patch' && body.patch && typeof body.patch === 'object') ? Object.keys(body.patch) : [];
  if (isPushOwnedDoc(docKey) || patchDocKeys.some(isPushOwnedDoc)) {
    return jsonResponse({ ok: false, error: 'Push keys and subscriptions are managed from /api/day-close-push.' }, 403);
  }
  if (isKioskOwnedDoc(docKey) || patchDocKeys.some(isKioskOwnedDoc)) {
    return jsonResponse({ ok: false, error: 'This document is managed from Kiosks, Tablet Keys.' }, 403);
  }
  if (isOwnerNoticeDoc(docKey) || patchDocKeys.some(isOwnerNoticeDoc)) {
    const noticeDoc = isOwnerNoticeDoc(docKey) ? docKey : patchDocKeys.find(isOwnerNoticeDoc);
    return jsonResponse({ ok: false, error: `Owner notice is managed from /api/${noticeDoc}.` }, 403);
  }
  if (isDeviceUnsentDoc(docKey) || patchDocKeys.some(isDeviceUnsentDoc)) {
    return jsonResponse({ ok: false, error: 'Device reports are managed from /api/device_unsent.' }, 403);
  }

  if (request.method === 'GET' || (body && (body.op === 'get_mfg' || body.op === 'get_control'))) {
    const targetKey = body && body.op === 'get_control' ? 'control_store' : docKey;
    if (targetKey !== 'mfg_web_store' && !isOwnerOrFullGroupSession(session)) {
      return jsonResponse({ ok: false, error: 'Owner permissions required for control store.' }, 403);
    }
    const row = await readEdgeKvDoc(env.DB, targetKey);
    // A stored document that does not parse (torn __part_ rows, incident 2026-11-13) is flagged, never passed off
    // as an empty store: scripts check `storeUnreadable` and refuse to write back. The document stays `{}` so a
    // browser holding the full store still syncs; only an Owner / full-group save may rewrite it (patch below).
    const parsedRow = parseStoredKvDoc(row);
    const rawDocObj = parsedRow.obj;
    const storeUnreadable = parsedRow.unreadable || (!row && await hasOrphanKvParts(env.DB, targetKey));
    if (storeUnreadable) {
      console.error(`[sync] ${targetKey} is unreadable (${row ? String(row.payload_json || '').length + ' chars stitched' : 'parts without a head row'})`);
    }
    if (row && row.updated_at && !rawDocObj.updatedAt) rawDocObj.updatedAt = row.updated_at;
    if (targetKey === 'mfg_web_store') {
      await overlayCanonicalSubStoresOnMfgDoc(env.DB, rawDocObj);
      capMinShellVerForRead(rawDocObj);
    }
    const docObj = targetKey === 'mfg_web_store' ? scopeStoreDocForSession(rawDocObj, session) : rawDocObj;
    const etag = await computeSyncDocEtag(docObj);
    if (
      targetKey === 'mfg_web_store' &&
      !storeUnreadable &&
      body &&
      typeof body.ifNoneMatchEtag === 'string' &&
      body.ifNoneMatchEtag &&
      body.ifNoneMatchEtag === etag
    ) {
      return jsonResponse({
        ok: true,
        edge: true,
        notModified: true,
        etag,
        updatedAt: String((docObj && docObj.updatedAt) || (row && row.updated_at) || '')
      });
    }
    const getResp = { ok: true, edge: true, etag, docs: { [targetKey]: docObj } };
    if (storeUnreadable) getResp.storeUnreadable = true;
    return jsonResponse(getResp);
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
    const rawPatchDoc = body.patch[pKey];
    const incomingDoc = (rawPatchDoc && typeof rawPatchDoc === 'object')
      ? JSON.parse(JSON.stringify(rawPatchDoc))
      : {};
    delete incomingDoc._scopedForSession;
    if (pKey === 'mfg_web_store') {
      const rawVer = incomingDoc && incomingDoc.minShellVer !== undefined && incomingDoc.minShellVer !== null
        ? String(incomingDoc.minShellVer).trim()
        : '';
      const minSyncVer = effectiveMinSyncShellVer();
      if (!SHELL_VER_RE.test(rawVer) || compareShellVer(rawVer, minSyncVer) < 0) {
        return jsonResponse({
          ok: false,
          code: 'shell_outdated',
          minSyncShellVer: minSyncVer,
          receivedShellVer: rawVer,
          error: `App update required (v${minSyncVer}+) before syncing.`
        }, 426);
      }
    }
    const expectedTs = String(body.ifMatchUpdatedAt || '');
    // Old seed ids as the browser sent them, before the RLS merge adds stored rows (counted once the write lands).
    const legacyCandidates = pKey === 'mfg_web_store' ? collectLegacyCandidates(incomingDoc) : null;
    // Manufacturing positional ids: reads the browser's report and removes it from the document before any
    // write, so `_legacyPosUpgrades` is never stored (taken from every patch key, counted only for the store).
    const mfgLegacySignals = takeMfgLegacySignals(incomingDoc);

    const currentRow = await readEdgeKvDoc(env.DB, pKey);
    const currentTs = currentRow ? String(currentRow.updated_at || '') : '';

    const currentParsed = parseStoredKvDoc(currentRow);

    if (expectedTs && currentTs && expectedTs !== currentTs) {
      const rawFresh = currentParsed.obj;
      if (pKey === 'mfg_web_store') {
        await overlayCanonicalSubStoresOnMfgDoc(env.DB, rawFresh);
        capMinShellVerForRead(rawFresh);
      }
      const freshDoc = pKey === 'mfg_web_store' ? scopeStoreDocForSession(rawFresh, session) : rawFresh;
      const conflictResp = { ok: true, conflict: true, updatedAt: currentTs, docs: { [pKey]: freshDoc } };
      if (currentParsed.unreadable) conflictResp.storeUnreadable = true;
      return jsonResponse(conflictResp);
    }

    // An unreadable store can only be rewritten by a session that sees the whole store (Owner / full group). A
    // company-scoped seat would otherwise turn its own slice into the whole document: the row-level guard keeps other
    // companies' rows from the previous document, and an unreadable one has none. The browser keeps its changes and
    // retries (`Cloud read-only (503)`), and goes through once an Owner device has saved.
    if (pKey === 'mfg_web_store' && !isOwnerOrFullGroupSession(session)
      && ((currentRow && currentParsed.unreadable) || (!currentRow && await hasOrphanKvParts(env.DB, pKey)))) {
      console.error(`[sync] refused a company-scoped save onto an unreadable ${pKey} (${String((session && session.email) || '')})`);
      return jsonResponse({ ok: false, storeUnreadable: true, error: 'The shared store is being repaired; your changes stay on this device and sync once it is.' }, 503);
    }

    let prevDoc = currentRow ? (currentParsed.unreadable ? null : currentParsed.obj) : null;
    if (pKey === 'mfg_web_store') {
      prevDoc = await overlayCanonicalSubStoresOnMfgDoc(env.DB, prevDoc || {});
    }
    if (pKey === 'mfg_web_store') {
      if (isOwnerOrFullGroupSession(session)) {
        mergePartyHygieneStoreDoc(incomingDoc, prevDoc, session);
      } else {
        await enforceSyncRlsOnStoreDoc(env.DB, incomingDoc, prevDoc, session);
      }
    }
    const syncAuditBlocked = [];
    if (pKey === 'mfg_web_store') {
      await enforceSyncRoleWriteLocks(env.DB, incomingDoc, prevDoc, session, syncAuditBlocked);
      if (session) await enforceGuardedWorkflowMarksOnSyncDb(env.DB, incomingDoc, prevDoc, getSessionWritePerms(session));
      for (const blkEv of syncAuditBlocked) {
        try {
          await recordGeoAuditEvent(env.DB, request, session, blkEv);
        } catch (_) {}
      }
      stripServerOwnedCustomRows(incomingDoc, prevDoc);
      const syncVrErr = await enforceSyncVoidReasonAndTwinGuards(env.DB, incomingDoc, prevDoc, session);
      if (syncVrErr) {
        return jsonResponse(syncVrErr, 400);
      }
      await enforceSyncVoidActors(env.DB, incomingDoc, prevDoc, session);
      holdMinShellVer(incomingDoc, prevDoc);
      const sameNameConflict = await checkSameNameSyncPatchConflict(env.DB, incomingDoc, prevDoc);
      if (sameNameConflict) {
        return jsonResponse(sameNameConflict, 409);
      }
    }
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
      const latestParsed = parseStoredKvDoc(latestRow);
      const latestRaw = latestParsed.obj;
      if (pKey === 'mfg_web_store') {
        await overlayCanonicalSubStoresOnMfgDoc(env.DB, latestRaw);
        capMinShellVerForRead(latestRaw);
      }
      const latestScoped = pKey === 'mfg_web_store' ? scopeStoreDocForSession(latestRaw, session) : latestRaw;
      const latestResp = {
        ok: true,
        conflict: true,
        updatedAt: latestRow ? String(latestRow.updated_at || '') : '',
        docs: { [pKey]: latestScoped }
      };
      if (latestParsed.unreadable) latestResp.storeUnreadable = true;
      return jsonResponse(latestResp);
    }

    let mirrorStats = undefined;
    if (pKey === 'mfg_web_store') {
      mirrorStats = await mirrorStoreDeltaToD1Tables(env.DB, incomingDoc, prevDoc, session, env);
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
      try {
        await auditSyncGeoMutations(env.DB, request, session, prevDoc, incomingDoc);
      } catch (_) {}
    }
    if (pKey === 'mfg_web_store' && isOwnerOrFullGroupSession(session) && incomingDoc.faceSettings && typeof incomingDoc.faceSettings === 'object') {
      const pubFs = sanitizePublicFaceSettings(incomingDoc.faceSettings);
      if (pubFs) {
        try {
          await writeEdgeKvDoc(env.DB, 'face_settings', JSON.stringify(pubFs), newTs, updatedByStr);
        } catch (_) {}
      }
    }
    if (pKey === 'mfg_web_store' && isOwnerOrFullGroupSession(session) && incomingDoc.roleTabPolicies && typeof incomingDoc.roleTabPolicies === 'object') {
      try {
        await writeEdgeKvDoc(env.DB, 'role_tab_policies', JSON.stringify(incomingDoc.roleTabPolicies), newTs, updatedByStr);
      } catch (_) {}
    }
    if (legacyCandidates) {
      const legacyHitsTask = scheduleLegacyIdHits(env, _ctx, legacyCandidates, mfgLegacySignals);
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

const PHONE_ID_SCALAR_KEYS = [
  'docKind', 'fullNameLatin', 'fullNameArabic', 'firstNameLatin', 'lastNameLatin',
  'firstNameArabic', 'lastNameArabic', 'fatherNameLatin', 'fatherNameArabic',
  'motherNameLatin', 'motherNameArabic', 'dob', 'birthYear', 'nationalityLatin',
  'nationalityArabic', 'idNumber', 'nssfNumber', 'gender', 'issueDate',
  'idExpiryDate', 'workPermitNumber', 'workPermitExpiryDate',
  'residencyNumber', 'residencyExpiryDate',
  'civilRegistryNumber', 'civilRegistryPlace', 'maritalStatus', 'sidesCaptured',
  'source'
];

function sanitizePhoneIdExtracted(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const k of PHONE_ID_SCALAR_KEYS) {
    if (raw[k] !== undefined && raw[k] !== null) {
      if (k === 'sidesCaptured') {
        const n = Number(raw[k]);
        if (n === 1 || n === 2) out[k] = n;
        continue;
      }
      const s = String(raw[k]).trim().slice(0, 120);
      if (s) out[k] = s;
    }
  }
  if (typeof raw.cardDataUrl === 'string' && raw.cardDataUrl.length <= 2000000
      && /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(raw.cardDataUrl)) {
    out.cardDataUrl = raw.cardDataUrl;
  }
  return out;
}

export async function verifyAndIncrementPhoneIdScan(env, rawSid, rawTok) {
  if (!env || !env.DB) return { ok: false, status: 503, code: 'db_unavailable', error: 'Database unavailable.' };
  const sid = String(rawSid || '').trim().slice(0, 64);
  const tok = String(rawTok || '').trim().slice(0, 64);
  if (!sid || !tok) return { ok: false, status: 403, code: 'missing_token', error: 'Phone scan token required.' };
  try { await getTableColumns(env.DB, 'phone_scan_sessions'); } catch (_) {}

  const nowMs = Date.now();
  for (let attempt = 0; attempt < 2; attempt++) {
    const row = await env.DB.prepare('SELECT * FROM phone_scan_sessions WHERE sid = ?1').bind(sid).first();
    if (!row || !row.tok || row.tok !== tok) {
      return { ok: false, status: 403, code: 'invalid_token', error: 'Invalid or expired phone scan token.' };
    }
    const rawMeta = String(row.meta_json || '{}');
    const meta = safeJsonParse(rawMeta, {});
    if (!meta || meta.mode !== 'id_card') {
      return { ok: false, status: 403, code: 'wrong_mode', error: 'Token is not scoped for ID card scanning.' };
    }
    if (meta.consumed || row.status === 'consumed') {
      return { ok: false, status: 403, code: 'already_consumed', error: 'This single-use QR link has already been used.' };
    }
    if (meta.expiresAtMs && nowMs > Number(meta.expiresAtMs)) {
      return { ok: false, status: 403, code: 'expired', error: 'This single-use QR link has expired.' };
    }
    const scansUsed = Number(meta.scansUsed || 0);
    if (scansUsed >= 3) {
      return { ok: false, status: 429, code: 'scan_limit_reached', error: 'Maximum scan attempts (3) reached for this QR link.' };
    }
    const nextMeta = Object.assign({}, meta, { scansUsed: scansUsed + 1 });
    const nextMetaStr = JSON.stringify(nextMeta);
    const upd = await env.DB.prepare(
      `UPDATE phone_scan_sessions SET meta_json = ?1, updated_ms = ?2 WHERE sid = ?3 AND COALESCE(meta_json, '{}') = ?4`
    ).bind(nextMetaStr, nowMs, sid, rawMeta).run();
    if (upd && upd.meta && upd.meta.changes > 0) {
      return { ok: true, sid, company: String(meta.company || ''), scansUsed: scansUsed + 1 };
    }
  }
  return { ok: false, status: 409, code: 'conflict', error: 'Concurrent scan attempt; please retry.' };
}

export async function handlePhoneScan(request, env, url, body, session) {
  if (!env || !env.DB) return jsonResponse({ ok: true, found: false });
  const ipHash = await hashClientIp(request);
  const rl = await checkD1RateLimit(env, `phone-scan:${ipHash}`, 45, 60);
  if (!rl.allowed) {
    return jsonResponse({ ok: false, error: 'Phone scan rate limit exceeded.' }, 429);
  }
  try { await getTableColumns(env.DB, 'phone_scan_sessions'); } catch (_) {}
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
    const meta = safeJsonParse(row.meta_json, {}) || {};
    const isConsumed = Boolean(meta.consumed || row.status === 'consumed');
    const isExpired = Boolean(meta.expiresAtMs && nowMs > Number(meta.expiresAtMs));
    if (meta.mode === 'id_card' && isExpired && !isConsumed && row.pages_json && row.pages_json !== '[]') {
      await purgePhoneScanR2Pages(env, row.pages_json);
      try {
        await env.DB.prepare(`UPDATE phone_scan_sessions SET pages_json = '[]', status = 'expired', updated_ms = ?1 WHERE sid = ?2`)
          .bind(nowMs, sid).run();
      } catch (_) {}
    }
    let pages = (meta.mode === 'id_card' && (isConsumed || isExpired)) ? [] : safeJsonParse(row.pages_json, []);
    // Hydrate any R2-offloaded page dataUrls
    if (env.BUCKET && Array.isArray(pages) && pages.length) {
      for (const pg of pages) {
        if (pg && pg.r2Key && !pg.dataUrl) {
          try {
            const obj = await env.BUCKET.get(pg.r2Key);
            if (obj) pg.dataUrl = await obj.text();
          } catch (_) {}
        }
      }
    }
    const sessOut = {
      sid: row.sid,
      tok: row.tok,
      status: isConsumed ? 'consumed' : (isExpired ? 'expired' : row.status),
      pages,
      rtcOffer: row.rtc_offer ? safeJsonParse(row.rtc_offer, row.rtc_offer) : undefined,
      rtcAnswer: row.rtc_answer ? safeJsonParse(row.rtc_answer, row.rtc_answer) : undefined,
      ts: Math.floor(Number(row.updated_ms || nowMs) / 1000)
    };
    if (meta && meta.mode) {
      sessOut.mode = String(meta.mode);
      sessOut.company = String(meta.company || '');
      sessOut.consumed = isConsumed;
      sessOut.expired = isExpired;
      sessOut.scansUsed = Number(meta.scansUsed || 0);
      sessOut.expiresAtMs = Number(meta.expiresAtMs || 0);
      sessOut.extracted = (isConsumed || isExpired) ? null : (meta.extracted || null);
    }
    return jsonResponse({
      ok: true,
      found: true,
      session: sessOut
    });
  }

  const sid = String((body && body.sid) || '').trim().slice(0, 64);
  const tok = String((body && (body.k || body.tok)) || '').trim().slice(0, 64);
  const opKind = String((body && body.op) || 'update').trim().toLowerCase();
  if (!sid || !tok) return jsonResponse({ ok: false, error: 'Missing session id' }, 400);

  if (opKind === 'init_id_card' && (!session || isDemoHeader(request))) {
    return jsonResponse({ ok: false, error: 'Authenticated session required to initiate phone scan handoff.' }, 401);
  }
  const existing = await env.DB.prepare('SELECT * FROM phone_scan_sessions WHERE sid = ?1').bind(sid).first();
  if (!existing && (!session || isDemoHeader(request))) {
    return jsonResponse({ ok: false, error: 'Authenticated session required to initiate phone scan handoff.' }, 401);
  }
  if (existing && existing.tok !== tok) {
    return jsonResponse({ ok: false, error: 'Token mismatch' }, 403);
  }
  const existingMeta = existing ? (safeJsonParse(existing.meta_json, {}) || {}) : {};
  if (opKind === 'clear') {
    if (existing && existing.pages_json) {
      await purgePhoneScanR2Pages(env, existing.pages_json);
    }
    await env.DB.prepare('DELETE FROM phone_scan_sessions WHERE sid = ?1').bind(sid).run();
    return jsonResponse({ ok: true, cleared: true });
  }
  if (opKind === 'init_id_card') {
    if (!session || isDemoHeader(request)) {
      return jsonResponse({ ok: false, error: 'Authenticated session required to initiate phone scan handoff.' }, 401);
    }
    const reqCo = String((body && body.company) || '').trim().slice(0, 80);
    if (reqCo && !isOwnerOrFullGroupSession(session) && !canAccessCompany(session, reqCo) && !canAccessSentinelScope(session, reqCo)) {
      return jsonResponse({ ok: false, error: 'Row-level security: unauthorized entity scope.' }, 403);
    }
    if (existing) {
      return jsonResponse({ ok: false, error: 'Session id already exists.' }, 409);
    }
    const initMeta = {
      mode: 'id_card',
      company: reqCo,
      createdBy: String((session && session.sub) || '').trim().slice(0, 80),
      createdAtMs: nowMs,
      expiresAtMs: nowMs + 600000,
      scansUsed: 0,
      consumed: false,
      consumedAtMs: 0,
      extracted: null
    };
    await env.DB.prepare(
      `INSERT INTO phone_scan_sessions (sid, tok, status, pages_json, rtc_offer, rtc_answer, meta_json, updated_ms)
       VALUES (?1, ?2, 'waiting', '[]', '', '', ?3, ?4)`
    ).bind(sid, tok, JSON.stringify(initMeta), nowMs).run();
    return jsonResponse({ ok: true, status: 'waiting', mode: 'id_card', expiresAtMs: initMeta.expiresAtMs });
  }
  if (opKind === 'consume') {
    if (!existing) return jsonResponse({ ok: false, error: 'Phone scan session not found.' }, 404);
    if (existing.pages_json) {
      await purgePhoneScanR2Pages(env, existing.pages_json);
    }
    const consumedMeta = Object.assign({}, existingMeta, {
      consumed: true,
      consumedAtMs: nowMs,
      extracted: null
    });
    await env.DB.prepare(
      `UPDATE phone_scan_sessions SET status = 'consumed', pages_json = '[]', meta_json = ?1, updated_ms = ?2 WHERE sid = ?3`
    ).bind(JSON.stringify(consumedMeta), nowMs, sid).run();
    return jsonResponse({ ok: true, consumed: true });
  }
  if (opKind === 'complete_id_card') {
    if (!existing) return jsonResponse({ ok: false, error: 'Phone scan session not found.' }, 404);
    if (existingMeta.mode !== 'id_card') {
      return jsonResponse({ ok: false, error: 'Session is not an ID card phone scan session.' }, 400);
    }
    if (existingMeta.consumed || existing.status === 'consumed') {
      return jsonResponse({ ok: false, code: 'already_consumed', error: 'This single-use QR link has already been used.' }, 403);
    }
    if (existingMeta.expiresAtMs && nowMs > Number(existingMeta.expiresAtMs)) {
      return jsonResponse({ ok: false, code: 'expired', error: 'This single-use QR link has expired.' }, 403);
    }
    const rawExtracted = body && body.extracted;
    if (rawExtracted && typeof rawExtracted.cardDataUrl === 'string' && rawExtracted.cardDataUrl.trim()) {
      const rawCardUrl = rawExtracted.cardDataUrl.trim();
      if (rawCardUrl.length > 2000000) {
        return jsonResponse({ ok: false, error: 'ID preview exceeds 1.5 MB limit.' }, 413);
      }
      const cardChk = validateBase64MediaDataUrl(rawCardUrl, { allowPdfAndHeic: false });
      if (!cardChk.ok) {
        return jsonResponse({ ok: false, error: 'Unsupported image format for ID card preview.' }, 400);
      }
    }
    const extracted = sanitizePhoneIdExtracted(rawExtracted);
    const idPages = [];
    const safeSidId = sid.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const rawPagesIn = Array.isArray(body && body.pages)
      ? body.pages.filter(p => p && p.dataUrl).slice(0, 2)
      : [];
    const candidatePages = rawPagesIn.length
      ? rawPagesIn
      : (extracted.cardDataUrl ? [{ id: 'id-card-1', side: 'front', mimeType: 'image/jpeg', dataUrl: extracted.cardDataUrl }] : []);
    const validatedPages = [];
    for (let idx = 0; idx < candidatePages.length; idx++) {
      const pg = candidatePages[idx];
      const rawDataUrl = String(pg.dataUrl || '').trim();
      if (!rawDataUrl) continue;
      if (rawDataUrl.length > 2000000) {
        return jsonResponse({ ok: false, error: 'ID preview exceeds 1.5 MB limit.' }, 413);
      }
      const declPgMime = pg.mimeType ? String(pg.mimeType) : '';
      const imgChk = validateBase64MediaDataUrl(rawDataUrl, { allowPdfAndHeic: false, declaredMime: declPgMime });
      if (!imgChk.ok) {
        return jsonResponse({ ok: false, error: 'Unsupported image format for ID card preview.' }, 400);
      }
      validatedPages.push({
        pid: idx === 0 ? 'id-card-1' : 'id-card-2',
        side: (String(pg.side || '').toLowerCase() === 'back' || idx === 1) ? 'back' : 'front',
        safeMime: imgChk.mimeType || 'image/jpeg',
        rawDataUrl
      });
    }
    if (validatedPages.length) {
      if (existing.pages_json) {
        await purgePhoneScanR2Pages(env, existing.pages_json);
      }
      for (const vp of validatedPages) {
        if (env.BUCKET) {
          const r2Key = `phone-scan/${safeSidId}/${vp.pid}.txt`;
          await env.BUCKET.put(r2Key, vp.rawDataUrl, {
            httpMetadata: { contentType: 'text/plain; charset=utf-8' }
          });
          idPages.push({ id: vp.pid, side: vp.side, mimeType: vp.safeMime, r2Key, ts: nowMs });
        } else {
          idPages.push({ id: vp.pid, side: vp.side, mimeType: vp.safeMime, dataUrl: vp.rawDataUrl, ts: nowMs });
        }
      }
    }
    delete extracted.cardDataUrl;
    if (!Object.keys(extracted).length && !idPages.length) {
      return jsonResponse({ ok: false, error: 'No extracted identity fields supplied.' }, 400);
    }
    const nextMeta = Object.assign({}, existingMeta, { extracted, completedAtMs: nowMs });
    await env.DB.prepare(
      `UPDATE phone_scan_sessions SET status = 'id_ready', pages_json = ?1, meta_json = ?2, updated_ms = ?3 WHERE sid = ?4`
    ).bind(JSON.stringify(idPages), JSON.stringify(nextMeta), nowMs, sid).run();
    return jsonResponse({ ok: true, status: 'id_ready' });
  }
  if (existing && existingMeta.mode === 'id_card') {
    if (existingMeta.consumed || existing.status === 'consumed') {
      return jsonResponse({ ok: false, code: 'already_consumed', error: 'This single-use QR link has already been used.' }, 403);
    }
    if (existingMeta.expiresAtMs && nowMs > Number(existingMeta.expiresAtMs)) {
      return jsonResponse({ ok: false, code: 'expired', error: 'This single-use QR link has expired.' }, 403);
    }
    const reqStatus = String((body && body.status) || '').trim().toLowerCase();
    const hasMutPayload = Boolean((Array.isArray(body && body.pages) && body.pages.length) || (body && body.rtcOffer) || (body && body.rtcAnswer));
    if (opKind !== 'update' || reqStatus !== 'connected' || hasMutPayload) {
      return jsonResponse({ ok: false, error: 'Unsupported operation for ID card phone scan session.' }, 400);
    }
    const nextSt = existing.status === 'waiting' ? 'connected' : String(existing.status || 'connected');
    await env.DB.prepare('UPDATE phone_scan_sessions SET status = ?1, updated_ms = ?2 WHERE sid = ?3')
      .bind(nextSt, nowMs, sid).run();
    const curPages = safeJsonParse(existing.pages_json, []);
    return jsonResponse({ ok: true, status: nextSt, pageCount: Array.isArray(curPages) ? curPages.length : 0 });
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
    `INSERT OR REPLACE INTO phone_scan_sessions (sid, tok, status, pages_json, rtc_offer, rtc_answer, meta_json, updated_ms)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
  ).bind(sid, tok, status, JSON.stringify(mergedPages.slice(0, 8)), rtcOffer, rtcAnswer, JSON.stringify(existingMeta || {}), nowMs).run();

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

// ---- Geo-Pin & Hub Audit Trail + Driver Gate Pin Approval Queue ---------------------------------------------
function geoStorePrefixForInd(raw) {
  const k = canonGeoIndustryKey(raw || 'Manufacturing').toLowerCase();
  if (!k || k === 'manufacturing') return '';
  return `${k}::`;
}

function haversineMetersEdge(la1, ln1, la2, ln2) {
  const lat1 = Number(la1);
  const lng1 = Number(ln1);
  const lat2 = Number(la2);
  const lng2 = Number(ln2);
  if (!Number.isFinite(lat1) || !Number.isFinite(lng1) || !Number.isFinite(lat2) || !Number.isFinite(lng2)) return null;
  const r = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a))));
}

function extractEffectivePinCoords(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj._pinCleared || obj.pin_cleared || obj.pinCleared) return null;
  const [la, ln] = extractSiteLatLng(obj);
  if (la === null || ln === null || !isValidLatLngPair(la, ln)) return null;
  return { lat: la, lng: ln };
}

function firstGeoCompanyHint(geoDoc) {
  if (!geoDoc || typeof geoDoc !== 'object') return '';
  for (const bucket of ['companyHubs', 'sites', 'regions']) {
    const m = geoDoc[bucket];
    if (!m || typeof m !== 'object') continue;
    for (const [k, v] of Object.entries(m)) {
      if (v && typeof v === 'object') {
        const co = canonicalizeCompanyName(v.company || v.resort || v.entity || (bucket === 'companyHubs' ? splitGeoBucketKey(k, v).bodyStr : ''));
        if (co) return co;
      }
    }
  }
  return '';
}

function parseGeoKmNumEdge(v) {
  if (v === undefined || v === null || v === '') return null;
  const raw = (typeof v === 'object' && !Array.isArray(v)) ? v.km : v;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

async function ensureGeoAuditSchema(db) {
  if (!db) return;
  try {
    await db.prepare(
      `CREATE TABLE IF NOT EXISTS geo_audit_log (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL DEFAULT '',
        outcome TEXT NOT NULL DEFAULT 'applied',
        actor_user_id TEXT DEFAULT '',
        actor_email TEXT DEFAULT '',
        actor_name TEXT DEFAULT '',
        actor_role TEXT DEFAULT '',
        source TEXT DEFAULT '',
        industry TEXT DEFAULT 'manufacturing',
        company TEXT DEFAULT '',
        target_type TEXT DEFAULT '',
        target_id TEXT DEFAULT '',
        target_label TEXT DEFAULT '',
        prev_lat REAL,
        prev_lng REAL,
        next_lat REAL,
        next_lng REAL,
        shift_meters REAL,
        detail_json TEXT DEFAULT '{}',
        ip_hash TEXT DEFAULT ''
      )`
    ).run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_geo_audit_created ON geo_audit_log (created_at DESC)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_geo_audit_co_created ON geo_audit_log (company, created_at DESC)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_geo_audit_ind_created ON geo_audit_log (industry, created_at DESC)').run();
  } catch (_) {}
}

async function ensureGeoGateSuggestionsSchema(db) {
  if (!db) return;
  try {
    await db.prepare(
      `CREATE TABLE IF NOT EXISTS geo_gate_suggestions (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT '',
        resolved_at TEXT DEFAULT '',
        submitter_kind TEXT NOT NULL DEFAULT 'viewer',
        submitter_user_id TEXT DEFAULT '',
        submitter_email TEXT DEFAULT '',
        submitter_name TEXT DEFAULT '',
        submitter_role TEXT DEFAULT '',
        driver_label TEXT DEFAULT '',
        industry TEXT NOT NULL DEFAULT 'manufacturing',
        company TEXT NOT NULL DEFAULT '',
        target_type TEXT NOT NULL DEFAULT 'site',
        site_id TEXT DEFAULT '',
        site_name TEXT NOT NULL DEFAULT '',
        site_category TEXT DEFAULT '',
        existing_lat REAL,
        existing_lng REAL,
        suggested_lat REAL NOT NULL,
        suggested_lng REAL NOT NULL,
        shift_meters REAL,
        accuracy_meters REAL,
        source_url TEXT DEFAULT '',
        access_note TEXT DEFAULT '',
        decider_user_id TEXT DEFAULT '',
        decider_email TEXT DEFAULT '',
        decider_name TEXT DEFAULT '',
        decider_role TEXT DEFAULT '',
        decision_note TEXT DEFAULT '',
        promoted_target_id TEXT DEFAULT '',
        ip_hash TEXT DEFAULT ''
      )`
    ).run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_geo_gate_status_created ON geo_gate_suggestions (status, created_at DESC)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_geo_gate_site ON geo_gate_suggestions (industry, company, site_name, status)').run();
  } catch (_) {}
}

async function recordGeoAuditEvent(db, request, session, ev) {
  if (!db || !ev) return '';
  await ensureGeoAuditSchema(db);
  const nowMs = Date.now();
  const createdAt = new Date(nowMs).toISOString();
  const outcome = String(ev.outcome || 'applied').trim() === 'blocked_403' ? 'blocked_403' : 'applied';
  const action = String(ev.action || (outcome === 'blocked_403' ? 'blocked_403' : 'site_pin_moved')).trim().slice(0, 48);
  const actorUserId = String(ev.actor_user_id || (session && (session.sub || session.id)) || '').trim().slice(0, 80);
  const actorEmail = String(ev.actor_email || (session && session.email) || '').trim().toLowerCase().slice(0, 120);
  const actorName = String(ev.actor_name || (session && (session.name || session.full_name)) || actorEmail).trim().slice(0, 120);
  const actorRole = String(ev.actor_role || (session && session.role) || '').trim().slice(0, 64);
  const source = String(ev.source || 'geo_config').trim().slice(0, 48);
  const industry = canonGeoIndustryKey(ev.industry || 'manufacturing') || 'manufacturing';
  const company = canonicalizeCompanyName(ev.company || '').slice(0, 80);
  const targetType = String(ev.target_type || 'site').trim().slice(0, 40);
  const targetId = String(ev.target_id || '').trim().slice(0, 120);
  const targetLabel = String(ev.target_label || targetId || targetType).trim().slice(0, 160);
  const prevLat = Number.isFinite(Number(ev.prev_lat)) && ev.prev_lat !== null ? Math.round(Number(ev.prev_lat) * 1e6) / 1e6 : null;
  const prevLng = Number.isFinite(Number(ev.prev_lng)) && ev.prev_lng !== null ? Math.round(Number(ev.prev_lng) * 1e6) / 1e6 : null;
  const nextLat = Number.isFinite(Number(ev.next_lat)) && ev.next_lat !== null ? Math.round(Number(ev.next_lat) * 1e6) / 1e6 : null;
  const nextLng = Number.isFinite(Number(ev.next_lng)) && ev.next_lng !== null ? Math.round(Number(ev.next_lng) * 1e6) / 1e6 : null;
  const shiftM = (Number.isFinite(Number(ev.shift_meters)) && ev.shift_meters !== null)
    ? Math.round(Number(ev.shift_meters))
    : ((prevLat !== null && prevLng !== null && nextLat !== null && nextLng !== null)
      ? haversineMetersEdge(prevLat, prevLng, nextLat, nextLng)
      : null);
  const detailStr = JSON.stringify((ev.detail && typeof ev.detail === 'object') ? ev.detail : {}).slice(0, 2000);
  const ipHash = request ? await hashClientIp(request) : String(ev.ip_hash || '');

  try {
    if (outcome === 'blocked_403') {
      const cut403 = new Date(nowMs - 60000).toISOString();
      const dup403 = await db.prepare(
        `SELECT 1 AS hit FROM geo_audit_log
         WHERE outcome = 'blocked_403' AND actor_user_id = ?1 AND ip_hash = ?2 AND source = ?3 AND target_label = ?4 AND created_at >= ?5
         LIMIT 1`
      ).bind(actorUserId, ipHash, source, targetLabel, cut403).first();
      if (dup403) return '';
    } else {
      const cutOk = new Date(nowMs - 5000).toISOString();
      const qLat = nextLat !== null ? Math.round(nextLat * 1e5) / 1e5 : -999;
      const qLng = nextLng !== null ? Math.round(nextLng * 1e5) / 1e5 : -999;
      const dupOk = await db.prepare(
        `SELECT 1 AS hit FROM geo_audit_log
         WHERE outcome = 'applied' AND action = ?1 AND company = ?2 AND industry = ?3 AND target_type = ?4 AND target_label = ?5
           AND COALESCE(ROUND(next_lat, 5), -999) = ?6 AND COALESCE(ROUND(next_lng, 5), -999) = ?7 AND detail_json = ?8 AND created_at >= ?9
         LIMIT 1`
      ).bind(action, company, industry, targetType, targetLabel, qLat, qLng, detailStr, cutOk).first();
      if (dupOk) return '';
    }
    const rBytes = new Uint8Array(6);
    crypto.getRandomValues(rBytes);
    const id = 'ga_' + nowMs + '_' + Array.from(rBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    await db.prepare(
      `INSERT INTO geo_audit_log (
        id, created_at, action, outcome, actor_user_id, actor_email, actor_name, actor_role,
        source, industry, company, target_type, target_id, target_label,
        prev_lat, prev_lng, next_lat, next_lng, shift_meters, detail_json, ip_hash
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21)`
    ).bind(
      id, createdAt, action, outcome, actorUserId, actorEmail, actorName, actorRole,
      source, industry, company, targetType, targetId, targetLabel,
      prevLat, prevLng, nextLat, nextLng, shiftM, detailStr, ipHash
    ).run();
    return id;
  } catch (_) {
    return '';
  }
}

function detectRecordGeoAuditEvent(canonTable, prevObj, nextObj, source, fallbackInd = 'manufacturing') {
  const next = (nextObj && typeof nextObj === 'object') ? nextObj : null;
  const prev = (prevObj && typeof prevObj === 'object') ? prevObj : null;
  if (!next) return null;
  const effInd = canonGeoIndustryKey(next._industry || next.industry || (prev && (prev._industry || prev.industry)) || fallbackInd || 'manufacturing') || 'manufacturing';
  const co = canonicalizeCompanyName(next.company || next.fromCo || next.resort || next.entity || (prev && (prev.company || prev.fromCo || prev.resort || prev.entity)) || '');
  const label = String(next.name || (prev && prev.name) || next.id || canonTable).trim();
  const tid = String(next.id || (prev && prev.id) || '').trim();
  const tt = canonTable === 'regions' ? 'region' : (source === 'industry_domain_store' ? 'domain_location' : 'site');

  if (canonTable === 'regions') {
    if (!hasRegionZoneMutation(prev || {}, next)) return null;
    const pLat = Number.isFinite(Number(prev && prev.center_lat)) ? Number(prev.center_lat) : null;
    const pLng = Number.isFinite(Number(prev && prev.center_lng)) ? Number(prev.center_lng) : null;
    const nLat = Number.isFinite(Number(next.center_lat)) ? Number(next.center_lat) : null;
    const nLng = Number.isFinite(Number(next.center_lng)) ? Number(next.center_lng) : null;
    return {
      outcome: 'applied',
      action: 'region_zone_changed',
      source,
      industry: effInd,
      company: co,
      target_type: 'region',
      target_id: tid,
      target_label: label,
      prev_lat: pLat,
      prev_lng: pLng,
      next_lat: nLat,
      next_lng: nLng,
      detail: { prevRadius: prev ? prev.radius_km || null : null, nextRadius: next.radius_km || null, shapeType: next.shape_type || next.zone_type || '' }
    };
  }

  const prevC = extractEffectivePinCoords(prev);
  const nextIsCleared = Boolean(next._pinCleared || next.pin_cleared || next.pinCleared);
  const nextC = extractEffectivePinCoords(next);
  if (prevC && (nextIsCleared || !nextC)) {
    return {
      outcome: 'applied',
      action: 'pin_cleared',
      source,
      industry: effInd,
      company: co,
      target_type: tt,
      target_id: tid,
      target_label: label,
      prev_lat: prevC.lat,
      prev_lng: prevC.lng,
      next_lat: null,
      next_lng: null,
      detail: { table: canonTable }
    };
  }
  if (!prevC && nextC) {
    return {
      outcome: 'applied',
      action: 'site_pin_set',
      source,
      industry: effInd,
      company: co,
      target_type: tt,
      target_id: tid,
      target_label: label,
      prev_lat: null,
      prev_lng: null,
      next_lat: nextC.lat,
      next_lng: nextC.lng,
      detail: { table: canonTable }
    };
  }
  if (prevC && nextC) {
    const dist = haversineMetersEdge(prevC.lat, prevC.lng, nextC.lat, nextC.lng);
    if (dist !== null && dist >= 1) {
      return {
        outcome: 'applied',
        action: 'site_pin_moved',
        source,
        industry: effInd,
        company: co,
        target_type: tt,
        target_id: tid,
        target_label: label,
        prev_lat: prevC.lat,
        prev_lng: prevC.lng,
        next_lat: nextC.lat,
        next_lng: nextC.lng,
        shift_meters: dist,
        detail: { table: canonTable }
      };
    }
  }
  return null;
}

async function auditGeoConfigDiff(db, request, session, prevDoc, nextDoc) {
  if (!db || !nextDoc || typeof nextDoc !== 'object') return;
  const prev = (prevDoc && typeof prevDoc === 'object') ? prevDoc : {};
  const next = nextDoc;
  const events = [];

  // 1. Company Hubs
  const pHubs = (prev.companyHubs && typeof prev.companyHubs === 'object') ? prev.companyHubs : {};
  const nHubs = (next.companyHubs && typeof next.companyHubs === 'object') ? next.companyHubs : {};
  for (const k of new Set([...Object.keys(pHubs), ...Object.keys(nHubs)])) {
    const pv = pHubs[k];
    const nv = nHubs[k];
    const split = splitGeoBucketKey(k, nv || pv || {}, 'manufacturing');
    const co = canonicalizeCompanyName((nv && nv.company) || (pv && pv.company) || split.bodyStr);
    const pC = extractEffectivePinCoords(pv);
    const nC = extractEffectivePinCoords(nv);
    if (pC && !nC) {
      events.push({ outcome: 'applied', action: 'pin_cleared', source: 'geo_config', industry: split.indKey, company: co, target_type: 'hub', target_id: k, target_label: co || k, prev_lat: pC.lat, prev_lng: pC.lng, next_lat: null, next_lng: null });
    } else if (!pC && nC) {
      events.push({ outcome: 'applied', action: 'hub_moved', source: 'geo_config', industry: split.indKey, company: co, target_type: 'hub', target_id: k, target_label: co || k, prev_lat: null, prev_lng: null, next_lat: nC.lat, next_lng: nC.lng, detail: { initial: true } });
    } else if (pC && nC) {
      const dist = haversineMetersEdge(pC.lat, pC.lng, nC.lat, nC.lng);
      if (dist !== null && dist >= 1) {
        events.push({ outcome: 'applied', action: 'hub_moved', source: 'geo_config', industry: split.indKey, company: co, target_type: 'hub', target_id: k, target_label: co || k, prev_lat: pC.lat, prev_lng: pC.lng, next_lat: nC.lat, next_lng: nC.lng, shift_meters: dist });
      }
    }
  }

  // 2. Sites (deduping plain vs typed category twin key emitted together)
  const pSites = (prev.sites && typeof prev.sites === 'object') ? prev.sites : {};
  const nSites = (next.sites && typeof next.sites === 'object') ? next.sites : {};
  const seenSiteSigs = new Set();
  const allSiteKeys = Array.from(new Set([...Object.keys(pSites), ...Object.keys(nSites)])).sort((a, b) => {
    const aCat = /^(?:.*::)?(customer|supplier):/i.test(a) ? 0 : 1;
    const bCat = /^(?:.*::)?(customer|supplier):/i.test(b) ? 0 : 1;
    return aCat - bCat || a.localeCompare(b);
  });
  for (const k of allSiteKeys) {
    const pv = pSites[k];
    const nv = nSites[k];
    const split = splitGeoBucketKey(k, nv || pv || {}, 'manufacturing');
    const obj = (nv && typeof nv === 'object') ? nv : ((pv && typeof pv === 'object') ? pv : {});
    const co = canonicalizeCompanyName(obj.company || obj.resort || obj.entity || '');
    const sName = String(obj.name || stripGeoSiteCategorySuffix(split.bodyStr) || k).trim();
    const pC = extractEffectivePinCoords(pv);
    const nIsCleared = Boolean(nv && (nv._pinCleared || nv.pin_cleared || nv.pinCleared));
    const nC = nv ? extractEffectivePinCoords(nv) : null;
    let ev = null;
    if (pC && (nIsCleared || !nC)) {
      ev = { outcome: 'applied', action: 'pin_cleared', source: 'geo_config', industry: split.indKey, company: co, target_type: 'site', target_id: String(obj.id || k), target_label: sName, prev_lat: pC.lat, prev_lng: pC.lng, next_lat: null, next_lng: null };
    } else if (!pC && nC) {
      ev = { outcome: 'applied', action: 'site_pin_set', source: 'geo_config', industry: split.indKey, company: co, target_type: 'site', target_id: String(obj.id || k), target_label: sName, prev_lat: null, prev_lng: null, next_lat: nC.lat, next_lng: nC.lng };
    } else if (pC && nC) {
      const dist = haversineMetersEdge(pC.lat, pC.lng, nC.lat, nC.lng);
      if (dist !== null && dist >= 1) {
        ev = { outcome: 'applied', action: 'site_pin_moved', source: 'geo_config', industry: split.indKey, company: co, target_type: 'site', target_id: String(obj.id || k), target_label: sName, prev_lat: pC.lat, prev_lng: pC.lng, next_lat: nC.lat, next_lng: nC.lng, shift_meters: dist };
      }
    }
    if (ev) {
      const sig = `${ev.industry}|${ev.company}|${ev.action}|${normGeoKeyToken(ev.target_label)}|${ev.next_lat}|${ev.next_lng}`;
      if (!seenSiteSigs.has(sig)) {
        seenSiteSigs.add(sig);
        events.push(ev);
      }
    }
  }

  // 3. Regions
  const pRegs = (prev.regions && typeof prev.regions === 'object') ? prev.regions : {};
  const nRegs = (next.regions && typeof next.regions === 'object') ? next.regions : {};
  for (const k of new Set([...Object.keys(pRegs), ...Object.keys(nRegs)])) {
    const pv = pRegs[k];
    const nv = nRegs[k];
    if (stableRowSig(pv || null) !== stableRowSig(nv || null) && hasRegionZoneMutation(pv || {}, nv || {})) {
      const split = splitGeoBucketKey(k, nv || pv || {}, 'manufacturing');
      const obj = (nv && typeof nv === 'object') ? nv : ((pv && typeof pv === 'object') ? pv : {});
      events.push({
        outcome: 'applied',
        action: 'region_zone_changed',
        source: 'geo_config',
        industry: split.indKey,
        company: canonicalizeCompanyName(obj.company || ''),
        target_type: 'region',
        target_id: String(obj.id || k),
        target_label: String(obj.name || split.bodyStr || k),
        prev_lat: pv && Number.isFinite(Number(pv.center_lat)) ? Number(pv.center_lat) : null,
        prev_lng: pv && Number.isFinite(Number(pv.center_lng)) ? Number(pv.center_lng) : null,
        next_lat: nv && Number.isFinite(Number(nv.center_lat)) ? Number(nv.center_lat) : null,
        next_lng: nv && Number.isFinite(Number(nv.center_lng)) ? Number(nv.center_lng) : null,
        detail: { removed: !nv, prevRadius: pv ? pv.radius_km || null : null, nextRadius: nv ? nv.radius_km || null : null }
      });
    }
  }

  // 4. pairKmOverrides
  const pPairs = (prev.pairKmOverrides && typeof prev.pairKmOverrides === 'object') ? prev.pairKmOverrides : {};
  const nPairs = (next.pairKmOverrides && typeof next.pairKmOverrides === 'object') ? next.pairKmOverrides : {};
  for (const k of new Set([...Object.keys(pPairs), ...Object.keys(nPairs)])) {
    const pKm = parseGeoKmNumEdge(pPairs[k]);
    const nKm = parseGeoKmNumEdge(nPairs[k]);
    if (pKm !== nKm) {
      const split = splitGeoBucketKey(k, (nPairs[k] && typeof nPairs[k] === 'object') ? nPairs[k] : ((pPairs[k] && typeof pPairs[k] === 'object') ? pPairs[k] : {}), 'manufacturing');
      const buMatch = String(split.bodyStr || k).match(/\bbu:([^|]+)/i);
      events.push({
        outcome: 'applied',
        action: 'pair_km_edited',
        source: 'geo_config',
        industry: split.indKey,
        company: canonicalizeCompanyName((nPairs[k] && nPairs[k].company) || (pPairs[k] && pPairs[k].company) || (buMatch ? buMatch[1].trim() : '') || ''),
        target_type: 'pair_km',
        target_id: k,
        target_label: split.bodyStr || k,
        detail: { pairKey: k, prevKm: pKm, nextKm: nKm }
      });
    }
  }

  // 5. verifiedRoutes
  const pVr = (prev.verifiedRoutes && typeof prev.verifiedRoutes === 'object') ? prev.verifiedRoutes : {};
  const nVr = (next.verifiedRoutes && typeof next.verifiedRoutes === 'object') ? next.verifiedRoutes : {};
  for (const k of new Set([...Object.keys(pVr), ...Object.keys(nVr)])) {
    const pv = pVr[k];
    const nv = nVr[k];
    if (stableRowSig(pv || null) !== stableRowSig(nv || null)) {
      const split = splitGeoBucketKey(k, nv || pv || {}, 'manufacturing');
      const buMatch = String(split.bodyStr || k).match(/\bbu:([^|]+)/i);
      events.push({
        outcome: 'applied',
        action: 'verified_route_changed',
        source: 'geo_config',
        industry: split.indKey,
        company: canonicalizeCompanyName((nv && nv.company) || (pv && pv.company) || (buMatch ? buMatch[1].trim() : '') || ''),
        target_type: 'verified_route',
        target_id: k,
        target_label: split.bodyStr || k,
        detail: { pairKey: k, prevKm: parseGeoKmNumEdge(pv), nextKm: parseGeoKmNumEdge(nv), cleared: !nv }
      });
    }
  }

  for (const ev of events) {
    await recordGeoAuditEvent(db, request, session, ev);
  }
}

async function auditSyncGeoMutations(db, request, session, prevDoc, nextDoc) {
  if (!db || !nextDoc || typeof nextDoc !== 'object') return;
  const prev = (prevDoc && typeof prevDoc === 'object') ? prevDoc : {};
  const prevCr = (prev.customRecords && typeof prev.customRecords === 'object') ? prev.customRecords : {};
  const nextCr = (nextDoc.customRecords && typeof nextDoc.customRecords === 'object') ? nextDoc.customRecords : {};
  for (const crK of ['sites', 'regions']) {
    const pArr = Array.isArray(prevCr[crK]) ? prevCr[crK] : [];
    const nArr = Array.isArray(nextCr[crK]) ? nextCr[crK] : [];
    const pMap = new Map(pArr.filter(x => x && x.id).map(x => [String(x.id).trim(), x]));
    for (const nr of nArr) {
      if (!nr || !nr.id) continue;
      const pr = pMap.get(String(nr.id).trim()) || null;
      const ev = detectRecordGeoAuditEvent(crK, pr, nr, 'sync');
      if (ev) await recordGeoAuditEvent(db, request, session, ev);
    }
  }
  const pIcr = (prev.industryCustomRows && typeof prev.industryCustomRows === 'object') ? prev.industryCustomRows : {};
  const nIcr = (nextDoc.industryCustomRows && typeof nextDoc.industryCustomRows === 'object') ? nextDoc.industryCustomRows : {};
  for (const [bk, nList] of Object.entries(nIcr)) {
    if (!Array.isArray(nList)) continue;
    const pList = Array.isArray(pIcr[bk]) ? pIcr[bk] : [];
    const pMap = new Map(pList.filter(x => x && (x.id || x.code)).map(x => [String(x.id || x.code).trim(), x]));
    for (const nr of nList) {
      if (!nr || !(nr.id || nr.code)) continue;
      const rid = String(nr.id || nr.code).trim();
      const pr = pMap.get(rid) || null;
      if (hasGpsFieldMutation(pr || {}, nr)) {
        const ev = detectRecordGeoAuditEvent('sites', pr, nr, 'sync', inferDomainIndustry(nr, bk));
        if (ev) await recordGeoAuditEvent(db, request, session, ev);
      }
    }
  }
  const pIre = (prev.industryRowEdits && typeof prev.industryRowEdits === 'object') ? prev.industryRowEdits : {};
  const nIre = (nextDoc.industryRowEdits && typeof nextDoc.industryRowEdits === 'object') ? nextDoc.industryRowEdits : {};
  for (const [ek, nv] of Object.entries(nIre)) {
    if (!nv || typeof nv !== 'object') continue;
    const pv = (pIre[ek] && typeof pIre[ek] === 'object') ? pIre[ek] : null;
    if (hasGpsFieldMutation(pv || {}, nv)) {
      const ev = detectRecordGeoAuditEvent('sites', pv, nv, 'sync', inferDomainIndustry(nv, ek));
      if (ev) await recordGeoAuditEvent(db, request, session, ev);
    }
  }
}

export async function handleGeoAuditGet(request, env, session, url) {
  if (isDemoHeader(request)) return jsonResponse({ ok: true, demo: true, audits: [], total: 0 });
  if (!session) return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  if (!env || !env.DB) return jsonResponse({ ok: false, error: 'Database unavailable.' }, 503);
  const geoAccess = await resolveGeoWriteAccess(env.DB, session);
  const effSess = geoAccess.effectiveSession || session;
  const perms = getSessionWritePerms(effSess);
  const isSupervisorPlus = isOwnerOrFullGroupSession(effSess)
    || perms.roleKey === 'Full Access (Owner)'
    || perms.roleKey === 'Supervisor + Entry'
    || perms.roleKey === 'Supervisor';
  if (!isSupervisorPlus) {
    return jsonResponse({ ok: false, error: 'Supervisor or Owner privileges are required to view geo audit logs.' }, 403);
  }
  await ensureGeoAuditSchema(env.DB);
  const limitRaw = Number((url && url.searchParams && url.searchParams.get('limit')) || 80);
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.round(limitRaw))) : 80;
  const fInd = String((url && url.searchParams && url.searchParams.get('industry')) || '').trim().toLowerCase();
  const fCo = String((url && url.searchParams && url.searchParams.get('company')) || '').trim().toLowerCase();
  const fOutcome = String((url && url.searchParams && url.searchParams.get('outcome')) || '').trim().toLowerCase();
  const fAction = String((url && url.searchParams && url.searchParams.get('action')) || '').trim().toLowerCase();

  const isFullOwner = isOwnerOrFullGroupSession(effSess);
  const meId = String(effSess.sub || effSess.id || '').trim();
  const actorCoCache = new Map();
  const actorInCallerScope = async (actorIdRaw, actorEmailRaw) => {
    const aid = String(actorIdRaw || '').trim();
    const aem = String(actorEmailRaw || '').trim().toLowerCase();
    const ck = `${aid}|${aem}`;
    if (!actorCoCache.has(ck)) {
      let uRow = null;
      if (aid) uRow = await env.DB.prepare('SELECT companies FROM users WHERE id = ?1 LIMIT 1').bind(aid).first();
      if (!uRow && aem) uRow = await env.DB.prepare('SELECT companies FROM users WHERE lower(email) = ?1 LIMIT 1').bind(aem).first();
      const cos = parseAllowedCompanies(uRow ? uRow.companies : '');
      actorCoCache.set(ck, cos);
    }
    const allowed = actorCoCache.get(ck) || [];
    return allowed.some(aco => aco && aco !== '*' && canAccessSentinelScope(effSess, aco));
  };
  const res = await env.DB.prepare('SELECT * FROM geo_audit_log ORDER BY created_at DESC LIMIT 400').all();
  const out = [];
  for (const r of (res.results || [])) {
    if (!isFullOwner) {
      const rCo = String(r.company || '').trim();
      const rInd = String(r.industry || '').trim();
      if (rCo) {
        if (!canAccessSentinelScope(effSess, rCo)) continue;
      } else if (String(r.actor_user_id || '').trim() !== meId) {
        if (!(r.outcome === 'blocked_403' && await actorInCallerScope(r.actor_user_id, r.actor_email))) continue;
      }
      if (rInd && !canAccessGeoIndustrySession(effSess, rInd)) continue;
    }
    if (fInd && canonGeoIndustryKey(r.industry || '') !== canonGeoIndustryKey(fInd)) continue;
    if (fCo && String(r.company || '').trim().toLowerCase() !== fCo) continue;
    if (fOutcome && String(r.outcome || '').trim().toLowerCase() !== fOutcome) continue;
    if (fAction && String(r.action || '').trim().toLowerCase() !== fAction) continue;
    out.push({
      id: r.id,
      created_at: r.created_at,
      action: r.action,
      outcome: r.outcome,
      actor_user_id: r.actor_user_id,
      actor_email: r.actor_email,
      actor_name: r.actor_name,
      actor_role: r.actor_role,
      source: r.source,
      industry: r.industry,
      company: r.company,
      target_type: r.target_type,
      target_id: r.target_id,
      target_label: r.target_label,
      prev_lat: r.prev_lat != null ? Number(r.prev_lat) : null,
      prev_lng: r.prev_lng != null ? Number(r.prev_lng) : null,
      next_lat: r.next_lat != null ? Number(r.next_lat) : null,
      next_lng: r.next_lng != null ? Number(r.next_lng) : null,
      shift_meters: r.shift_meters != null ? Number(r.shift_meters) : null,
      detail: safeJsonParse(r.detail_json, {})
    });
    if (out.length >= limit) break;
  }
  return jsonResponse({ ok: true, audits: out, total: out.length });
}

function publicGateSuggestion(r) {
  if (!r) return null;
  return {
    id: r.id,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
    resolved_at: r.resolved_at || '',
    submitter_kind: r.submitter_kind,
    submitter_user_id: r.submitter_user_id || '',
    submitter_email: r.submitter_email || '',
    submitter_name: r.submitter_name || '',
    submitter_role: r.submitter_role || '',
    driver_label: r.driver_label || '',
    industry: r.industry || 'manufacturing',
    company: r.company || '',
    target_type: r.target_type || 'site',
    site_id: r.site_id || '',
    site_name: r.site_name || '',
    site_category: r.site_category || '',
    existing_lat: r.existing_lat != null ? Number(r.existing_lat) : null,
    existing_lng: r.existing_lng != null ? Number(r.existing_lng) : null,
    suggested_lat: Number(r.suggested_lat),
    suggested_lng: Number(r.suggested_lng),
    shift_meters: r.shift_meters != null ? Number(r.shift_meters) : null,
    accuracy_meters: r.accuracy_meters != null ? Number(r.accuracy_meters) : null,
    source_url: r.source_url || '',
    access_note: r.access_note || '',
    decider_user_id: r.decider_user_id || '',
    decider_email: r.decider_email || '',
    decider_name: r.decider_name || '',
    decider_role: r.decider_role || '',
    decision_note: r.decision_note || '',
    promoted_target_id: r.promoted_target_id || ''
  };
}

async function findExistingSiteCoordsEdge(db, { industry, company, site_id, site_name }) {
  if (!db) return null;
  const indKey = canonGeoIndustryKey(industry || 'Manufacturing').toLowerCase() || 'manufacturing';
  const nk = normGeoKeyToken(site_name);
  const sid = String(site_id || '').trim();
  const coNorm = canonicalizeCompanyName(company || '').toLowerCase();

  if (indKey === 'manufacturing') {
    if (sid) {
      const rId = await db.prepare('SELECT * FROM sites WHERE id = ?1 LIMIT 1').bind(sid).first();
      if (rId) {
        const h = hydrateRowJson(rId);
        const c = extractEffectivePinCoords(h);
        return { lat: c ? c.lat : null, lng: c ? c.lng : null, site_id: rId.id, site_name: h.name || rId.name || site_name, site_category: h.site_category || '', company: h.company || company };
      }
    }
    if (nk) {
      const rows = (await db.prepare('SELECT * FROM sites WHERE lower(trim(name)) = ?1').bind(nk).all()).results || [];
      for (const r of rows) {
        const h = hydrateRowJson(r);
        if (coNorm && canonicalizeCompanyName(h.company || '').toLowerCase() !== coNorm) continue;
        const c = extractEffectivePinCoords(h);
        if (c) return { lat: c.lat, lng: c.lng, site_id: r.id, site_name: h.name || r.name, site_category: h.site_category || '', company: h.company || company };
      }
    }
  } else if (sid || nk) {
    if (sid) {
      const rCust = await db.prepare('SELECT row_id, company, payload_json FROM industry_custom_rows WHERE row_id = ?1 LIMIT 1').bind(sid).first();
      if (rCust) {
        const obj = safeJsonParse(rCust.payload_json, {});
        const c = extractEffectivePinCoords(obj);
        if (c) return { lat: c.lat, lng: c.lng, site_id: sid, site_name: obj.siteName || obj.name || site_name, site_category: obj.site_category || '', company: obj.company || rCust.company || company };
      }
    }
    const custRows = (await db.prepare('SELECT bucket, row_id, company, payload_json FROM industry_custom_rows WHERE COALESCE(voided, 0) = 0').all()).results || [];
    for (const r of custRows) {
      const obj = safeJsonParse(r.payload_json, null);
      if (!obj || typeof obj !== 'object') continue;
      const rInd = canonGeoIndustryKey(inferDomainIndustry(obj, r.bucket) || '').toLowerCase();
      if (rInd !== indKey) continue;
      const rCo = canonicalizeCompanyName(obj.company || r.company || obj.resort || obj.entity || '').toLowerCase();
      if (coNorm && rCo && rCo !== coNorm) continue;
      const rNm = normGeoKeyToken(obj.siteName || obj.name || obj.property || obj.unit || obj.title || '');
      if ((sid && String(r.row_id || '').trim() === sid) || (nk && rNm === nk)) {
        const c = extractEffectivePinCoords(obj);
        if (c) return { lat: c.lat, lng: c.lng, site_id: String(r.row_id || sid), site_name: obj.siteName || obj.name || site_name, site_category: obj.site_category || '', company: obj.company || r.company || company };
      }
    }
    const editRows = (await db.prepare('SELECT edit_key, payload_json FROM industry_row_edits WHERE COALESCE(voided, 0) = 0').all()).results || [];
    for (const er of editRows) {
      const eobj = safeJsonParse(er.payload_json, null);
      if (!eobj || typeof eobj !== 'object') continue;
      const eInd = canonGeoIndustryKey(inferDomainIndustry(eobj, er.edit_key) || '').toLowerCase();
      if (eInd !== indKey) continue;
      const eCo = canonicalizeCompanyName(eobj.company || eobj.resort || eobj.entity || '').toLowerCase();
      if (coNorm && eCo && eCo !== coNorm) continue;
      const ePid = normGeoKeyToken(eobj.primaryId || '');
      const eSn = normGeoKeyToken(eobj.siteName || eobj.primaryId || '');
      if ((sid && ePid === normGeoKeyToken(sid)) || (nk && (eSn === nk || ePid === nk))) {
        const c = extractEffectivePinCoords(eobj);
        if (c) return { lat: c.lat, lng: c.lng, site_id: String(eobj.primaryId || sid), site_name: eobj.siteName || eobj.primaryId || site_name, site_category: eobj.site_category || '', company: eobj.company || company };
      }
    }
  }

  const kvRow = await db.prepare("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'geo_config'").first();
  const geo = kvRow ? safeJsonParse(kvRow.payload_json, null) : null;
  if (geo && geo.sites && typeof geo.sites === 'object') {
    for (const [k, v] of Object.entries(geo.sites)) {
      if (!v || typeof v !== 'object') continue;
      const d = describeGeoSiteEntry(k, v);
      if (d.indKey !== indKey) continue;
      if (coNorm && d.companyNorm && d.companyNorm !== coNorm) continue;
      if ((sid && d.tokens.has(normGeoKeyToken(sid))) || (nk && d.tokens.has(nk))) {
        const c = extractEffectivePinCoords(v);
        if (c) return { lat: c.lat, lng: c.lng, site_id: sid || String(v.id || ''), site_name: v.name || site_name, site_category: v.site_category || d.cat || '', company: v.company || company };
      }
    }
  }
  return null;
}

async function upsertGeoConfigWithCas(db, buildNextFn, nowIso) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const kvRow = await db.prepare("SELECT payload_json, rev FROM edge_kv_store WHERE doc_key = 'geo_config'").first();
    const prevDoc = (kvRow && safeJsonParse(kvRow.payload_json, {})) || {};
    const nextDoc = buildNextFn(prevDoc);
    if (nextDoc && typeof nextDoc === 'object') nextDoc.updatedAt = nowIso;
    const raw = JSON.stringify(nextDoc || {});
    if (kvRow) {
      const curRev = Number(kvRow.rev ?? 0);
      const upd = await db.prepare(
        "UPDATE edge_kv_store SET payload_json = ?1, updated_at = ?2, rev = rev + 1 WHERE doc_key = 'geo_config' AND COALESCE(rev, 0) = ?3"
      ).bind(raw, nowIso, curRev).run();
      if (upd && upd.meta && Number(upd.meta.changes || 0) === 1) {
        return { ok: true, doc: nextDoc, prevDoc };
      }
    } else {
      const ins = await db.prepare(
        "INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, rev) VALUES ('geo_config', ?1, ?2, 1) ON CONFLICT(doc_key) DO NOTHING"
      ).bind(raw, nowIso).run();
      if (ins && ins.meta && Number(ins.meta.changes || 0) === 1) {
        return { ok: true, doc: nextDoc, prevDoc: {} };
      }
    }
  }
  return { ok: false, status: 409, error: 'Concurrent geo_config modification conflict; please retry.' };
}

async function buildGeoConfigCasBatchStmt(db, buildNextFn, nowIso) {
  const kvRow = await db.prepare("SELECT payload_json, rev FROM edge_kv_store WHERE doc_key = 'geo_config'").first();
  const prevDoc = (kvRow && safeJsonParse(kvRow.payload_json, {})) || {};
  const nextDoc = buildNextFn(prevDoc);
  if (nextDoc && typeof nextDoc === 'object') nextDoc.updatedAt = nowIso;
  const raw = JSON.stringify(nextDoc || {});
  if (kvRow) {
    const curRev = Number(kvRow.rev ?? 0);
    const stmt = db.prepare(
      `INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, rev)
       VALUES (
         'geo_config',
         CASE WHEN (SELECT COALESCE(rev, 0) FROM edge_kv_store WHERE doc_key = 'geo_config') = ?3 THEN ?1 ELSE NULL END,
         ?2,
         ?3 + 1
       )
       ON CONFLICT(doc_key) DO UPDATE SET
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at,
         rev = COALESCE(edge_kv_store.rev, 0) + 1`
    ).bind(raw, nowIso, curRev);
    return { stmt, doc: nextDoc, prevDoc };
  }
  const stmt = db.prepare(
    "INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, rev) VALUES ('geo_config', ?1, ?2, 1)"
  ).bind(raw, nowIso);
  return { stmt, doc: nextDoc, prevDoc: {} };
}

async function promoteGatePinEdge(db, row, deciderSession, nowIso) {
  const lat = Number(row.suggested_lat);
  const lng = Number(row.suggested_lng);
  const indKey = canonGeoIndustryKey(row.industry || 'Manufacturing').toLowerCase() || 'manufacturing';
  const co = canonicalizeCompanyName(row.company || '');
  const sName = String(row.site_name || '').trim();
  const nk = normGeoKeyToken(sName);
  const cat = normGeoSiteCat(row.site_category);
  const storePfx = geoStorePrefixForInd(indKey);
  const deciderEmail = String((deciderSession && deciderSession.email) || '');
  const clearedRoutePairs = [];
  const batchStmts = [];
  let promotedTargetId = String(row.site_id || '').trim();

  // 1. Prepare atomic relational statements across sites, industry_custom_rows, and industry_row_edits
  {
    let siteRow = null;
    if (promotedTargetId) {
      siteRow = await db.prepare('SELECT * FROM sites WHERE id = ?1 LIMIT 1').bind(promotedTargetId).first();
    }
    if (!siteRow && nk) {
      const candRows = (await db.prepare('SELECT * FROM sites WHERE lower(trim(name)) = ?1').bind(nk).all()).results || [];
      siteRow = candRows.find(r => {
        const h = hydrateRowJson(r);
        if (co && canonicalizeCompanyName(h.company || '').toLowerCase() !== co.toLowerCase()) return false;
        const rInd = canonGeoIndustryKey(h._industry || h.industry || 'Manufacturing').toLowerCase() || 'manufacturing';
        return rInd === indKey;
      }) || null;
    }
    if (siteRow) {
      const hyd = hydrateRowJson(siteRow);
      hyd.latitude = lat;
      hyd.longitude = lng;
      hyd._pinCleared = false;
      delete hyd.pin_cleared;
      delete hyd.pinCleared;
      stripSiteAliasCoordKeys(hyd);
      hyd.modified_by = deciderEmail;
      hyd.modified_at = nowIso;
      const prepSite = await prepareUpsertTableRecordStmt(db, 'sites', hyd);
      if (!prepSite.ok) throw new Error(prepSite.error || 'Failed to prepare sites update');
      batchStmts.push(prepSite.stmt);
      promotedTargetId = String(siteRow.id);
    }
  }
  if (indKey !== 'manufacturing') {
    const icrHits = [];
    if (promotedTargetId) {
      const oneIcr = await db.prepare('SELECT * FROM industry_custom_rows WHERE row_id = ?1 LIMIT 1').bind(promotedTargetId).first();
      if (oneIcr) icrHits.push(oneIcr);
    }
    if (!icrHits.length && nk) {
      const allIcr = (await db.prepare('SELECT * FROM industry_custom_rows WHERE COALESCE(voided, 0) = 0').all()).results || [];
      for (const icrCand of allIcr) {
        const cobj = safeJsonParse(icrCand.payload_json, null);
        if (!cobj || typeof cobj !== 'object') continue;
        const cInd = canonGeoIndustryKey(inferDomainIndustry(cobj, icrCand.bucket) || '').toLowerCase();
        if (cInd !== indKey) continue;
        const cCo = canonicalizeCompanyName(cobj.company || icrCand.company || cobj.resort || cobj.entity || '').toLowerCase();
        if (co && cCo && cCo !== co.toLowerCase()) continue;
        const cNm = normGeoKeyToken(cobj.siteName || cobj.name || cobj.property || cobj.unit || cobj.title || '');
        if (cNm === nk) icrHits.push(icrCand);
      }
    }
    for (const icr of icrHits) {
      const obj = safeJsonParse(icr.payload_json, {});
      obj.lat = lat;
      obj.lng = lng;
      obj.latitude = lat;
      obj.longitude = lng;
      obj._pinCleared = false;
      delete obj.pin_cleared;
      delete obj.pinCleared;
      obj.updated_at = nowIso;
      const nextRev = Number(icr.rev || 1) + 1;
      batchStmts.push(
        db.prepare(
          'INSERT OR REPLACE INTO industry_custom_rows (bucket, row_id, company, rev, voided, updated_at, payload_json) VALUES (?1,?2,?3,?4,?5,?6,?7)'
        ).bind(icr.bucket, icr.row_id, icr.company || co, nextRev, Number(icr.voided || 0), nowIso, JSON.stringify(obj))
      );
      if (!promotedTargetId) promotedTargetId = String(icr.row_id);
    }
    const allEdits = (await db.prepare('SELECT * FROM industry_row_edits WHERE COALESCE(voided, 0) = 0').all()).results || [];
    for (const er of allEdits) {
      const eobj = safeJsonParse(er.payload_json, null);
      if (!eobj || typeof eobj !== 'object') continue;
      const eInd = canonGeoIndustryKey(inferDomainIndustry(eobj, er.edit_key) || '').toLowerCase();
      if (eInd !== indKey) continue;
      const eCo = canonicalizeCompanyName(eobj.company || eobj.resort || eobj.entity || '').toLowerCase();
      if (co && eCo && eCo !== co.toLowerCase()) continue;
      const ePid = normGeoKeyToken(eobj.primaryId || '');
      const eSn = normGeoKeyToken(eobj.siteName || eobj.primaryId || '');
      if ((promotedTargetId && ePid === normGeoKeyToken(promotedTargetId)) || (nk && (eSn === nk || ePid === nk))) {
        const nextEdit = Object.assign({}, eobj, {
          latitude: lat,
          longitude: lng,
          _pinCleared: false,
          updated_at: nowIso,
          updatedAt: nowIso,
          rev: Number(eobj.rev || er.rev || 0) + 1,
          _revBumped: true
        });
        delete nextEdit.pin_cleared;
        delete nextEdit.pinCleared;
        batchStmts.push(
          db.prepare(
            'INSERT OR REPLACE INTO industry_row_edits (edit_key, rev, voided, updated_at, payload_json) VALUES (?1,?2,?3,?4,?5)'
          ).bind(er.edit_key, Number(er.rev || 1) + 1, Number(er.voided || 0), nowIso, JSON.stringify(nextEdit))
        );
        if (!promotedTargetId && eobj.primaryId) promotedTargetId = String(eobj.primaryId);
      }
    }
  }

  // 2. Prepare atomic CAS statement for canonical geo_config.sites + stale verifiedRoutes (> 50m shift or previously unpinned)
  let resolvedTargetKeys = [];
  const casPrep = await buildGeoConfigCasBatchStmt(db, (prevGeo) => {
    clearedRoutePairs.length = 0;
    const geo = Object.assign({ companyHubs: {}, regions: {}, sites: {}, pairKmOverrides: {}, verifiedRoutes: {}, _pairKmTs: {}, _deletedKeys: {} }, prevGeo || {});
    if (!geo.sites || typeof geo.sites !== 'object') geo.sites = {};
    if (!geo.verifiedRoutes || typeof geo.verifiedRoutes !== 'object') geo.verifiedRoutes = {};
    if (!geo._deletedKeys || typeof geo._deletedKeys !== 'object') geo._deletedKeys = {};

    const entryObj = {
      name: sName,
      site_category: cat || 'supplier',
      latitude: lat,
      longitude: lng,
      company: co,
      updated_at: nowIso,
      updatedBy: deciderEmail,
      source: 'gate_promotion',
      _pinCleared: false
    };
    if (promotedTargetId) entryObj.id = promotedTargetId;

    const targetKeys = new Set();
    if (cat) targetKeys.add(`${storePfx}${cat}:${nk}`);
    const oppCat = cat === 'customer' ? 'supplier' : (cat === 'supplier' ? 'customer' : '');
    const hasOppTwin = Boolean(oppCat && (geo.sites[`${storePfx}${oppCat}:${nk}`] || geo.sites[`${storePfx}${nk}`]));
    if (!hasOppTwin || !cat) targetKeys.add(`${storePfx}${nk}`);

    for (const [ek, ev] of Object.entries(geo.sites)) {
      if (!ev || typeof ev !== 'object') continue;
      const desc = describeGeoSiteEntry(ek, ev);
      if (desc.indKey !== indKey) continue;
      if (co && desc.companyNorm && desc.companyNorm !== co.toLowerCase()) continue;
      if ((promotedTargetId && desc.tokens.has(normGeoKeyToken(promotedTargetId))) || (nk && desc.tokens.has(nk))) {
        if (!oppCat || !desc.cat || desc.cat === cat) targetKeys.add(ek);
      }
    }
    for (const tk of targetKeys) {
      geo.sites[tk] = Object.assign({}, geo.sites[tk] || {}, entryObj);
      delete geo._deletedKeys[`sites:${tk}`];
    }
    resolvedTargetKeys = Array.from(targetKeys);

    const shouldClearRoutes = row.shift_meters == null || Number(row.shift_meters) > 50;
    if (shouldClearRoutes && nk) {
      const segNeedle = `site:${nk}`;
      for (const vrKey of Object.keys(geo.verifiedRoutes)) {
        const vrSplit = splitGeoBucketKey(vrKey, geo.verifiedRoutes[vrKey], 'manufacturing');
        if (vrSplit.indKey !== indKey) continue;
        const parts = vrSplit.bodyStr.split('||').map(x => normGeoKeyToken(x));
        if (parts.some(p => p === segNeedle || p === nk)) {
          delete geo.verifiedRoutes[vrKey];
          geo._deletedKeys[`verifiedRoutes:${vrKey}`] = nowIso;
          clearedRoutePairs.push(vrKey);
        }
      }
    }
    return geo;
  }, nowIso);

  return { promotedTargetId: promotedTargetId || resolvedTargetKeys[0] || '', clearedRoutePairs, batchStmts, geoCasStmt: casPrep.stmt };
}

async function patchPromotedMfgStoreEdge(db, row, promotedTargetId, deciderEmail, nowIso) {
  const lat = Number(row.suggested_lat);
  const lng = Number(row.suggested_lng);
  const indKey = canonGeoIndustryKey(row.industry || 'Manufacturing').toLowerCase() || 'manufacturing';
  const co = canonicalizeCompanyName(row.company || '');
  const nk = normGeoKeyToken(row.site_name || '');
  try {
    await patchMfgStoreSubDoc(db, doc => {
      if (doc.customRecords && Array.isArray(doc.customRecords.sites)) {
        const idx = doc.customRecords.sites.findIndex(x => {
          if (!x) return false;
          if (promotedTargetId && String(x.id) === promotedTargetId) return true;
          const xInd = canonGeoIndustryKey(x._industry || x.industry || 'Manufacturing').toLowerCase() || 'manufacturing';
          return xInd === indKey && normGeoKeyToken(x.name) === nk && (!co || canonicalizeCompanyName(x.company || '').toLowerCase() === co.toLowerCase());
        });
        if (idx >= 0) {
          const nextSite = Object.assign({}, doc.customRecords.sites[idx], {
            latitude: lat, longitude: lng, _pinCleared: false, modified_by: deciderEmail, modified_at: nowIso
          });
          delete nextSite.pin_cleared;
          delete nextSite.pinCleared;
          doc.customRecords.sites[idx] = nextSite;
        }
      }
      if (indKey !== 'manufacturing' && doc.industryCustomRows && typeof doc.industryCustomRows === 'object') {
        for (const [bk, arr] of Object.entries(doc.industryCustomRows)) {
          if (!Array.isArray(arr)) continue;
          for (let i = 0; i < arr.length; i++) {
            const x = arr[i];
            if (!x) continue;
            if (canonGeoIndustryKey(inferDomainIndustry(x, bk) || '').toLowerCase() !== indKey) continue;
            const xNm = normGeoKeyToken(x.siteName || x.name || x.property || x.unit || '');
            if ((promotedTargetId && String(x.id || x.code || '') === promotedTargetId) || (nk && xNm === nk && (!co || canonicalizeCompanyName(x.company || '').toLowerCase() === co.toLowerCase()))) {
              arr[i] = Object.assign({}, x, { lat, lng, latitude: lat, longitude: lng, _pinCleared: false, updated_at: nowIso });
            }
          }
        }
      }
      if (indKey !== 'manufacturing' && doc.industryRowEdits && typeof doc.industryRowEdits === 'object') {
        for (const [ek, eobj] of Object.entries(doc.industryRowEdits)) {
          if (!eobj || typeof eobj !== 'object') continue;
          if (canonGeoIndustryKey(inferDomainIndustry(eobj, ek) || '').toLowerCase() !== indKey) continue;
          const eCo = canonicalizeCompanyName(eobj.company || eobj.resort || eobj.entity || '').toLowerCase();
          if (co && eCo && eCo !== co.toLowerCase()) continue;
          const ePid = normGeoKeyToken(eobj.primaryId || '');
          const eSn = normGeoKeyToken(eobj.siteName || eobj.primaryId || '');
          if ((promotedTargetId && ePid === normGeoKeyToken(promotedTargetId)) || (nk && (eSn === nk || ePid === nk))) {
            doc.industryRowEdits[ek] = Object.assign({}, eobj, {
              latitude: lat, longitude: lng, _pinCleared: false, updated_at: nowIso, updatedAt: nowIso, rev: Number(eobj.rev || 0) + 1, _revBumped: true
            });
          }
        }
      }
    }, deciderEmail);
  } catch (_) {}
}

export async function handleGeoGateSuggestions(request, env, session, body, url) {
  if (!env || !env.DB) return jsonResponse({ ok: false, error: 'Database unavailable.' }, 503);
  await ensureGeoGateSuggestionsSchema(env.DB);
  const rawTok = String((url && url.searchParams && url.searchParams.get('gate_token')) || (body && body.gate_token) || '').trim();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const ipHash = await hashClientIp(request);

  if (rawTok) {
    const vTok = await verifyDriverGateToken(rawTok, env);
    if (!vTok.ok) return jsonResponse({ ok: false, code: vTok.code, error: vTok.error }, vTok.status || 403);
    const cl = vTok.claims;
    const tokSubmitterId = `gt:${cl.jti}`;
    if (request.method === 'GET') {
      const curSite = await findExistingSiteCoordsEdge(env.DB, {
        industry: cl.ind, company: cl.co, site_id: cl.sid, site_name: cl.sn
      });
      const subRows = (await env.DB.prepare(
        'SELECT * FROM geo_gate_suggestions WHERE submitter_user_id = ?1 ORDER BY created_at DESC LIMIT 15'
      ).bind(tokSubmitterId).all()).results || [];
      return jsonResponse({
        ok: true,
        target: {
          industry: cl.ind,
          company: cl.co,
          site_id: (curSite && curSite.site_id) || cl.sid,
          site_name: (curSite && curSite.site_name) || cl.sn,
          site_category: (curSite && curSite.site_category) || cl.sc,
          target_type: cl.tt,
          driver_label: cl.dl,
          existing_lat: curSite ? curSite.lat : null,
          existing_lng: curSite ? curSite.lng : null,
          exp: cl.exp
        },
        my_submissions: subRows.map(publicGateSuggestion)
      });
    }
    if (isDemoHeader(request)) return jsonResponse({ ok: false, error: 'Demo sandbox is read-only' }, 403);
    const op = String((body && body.op) || 'create').trim().toLowerCase();
    if (op === 'cancel') {
      const sid = String((body && body.id) || '').trim();
      if (!sid) return jsonResponse({ ok: false, error: 'Suggestion id required.' }, 400);
      const upd = await env.DB.prepare(
        "UPDATE geo_gate_suggestions SET status = 'cancelled', resolved_at = ?1, updated_at = ?1 WHERE id = ?2 AND submitter_user_id = ?3 AND status = 'pending'"
      ).bind(nowIso, sid, tokSubmitterId).run();
      if (!upd || !upd.meta || Number(upd.meta.changes || 0) !== 1) {
        return jsonResponse({ ok: false, error: 'Pending suggestion not found or already decided.' }, 409);
      }
      const rowAfter = await env.DB.prepare('SELECT * FROM geo_gate_suggestions WHERE id = ?1').bind(sid).first();
      return jsonResponse({ ok: true, suggestion: publicGateSuggestion(rowAfter) });
    }
    if (op !== 'create') {
      return jsonResponse({ ok: false, error: 'Driver gate token only supports gate coordinate submission.' }, 403);
    }
    const rl = await checkD1RateLimit(env, `gate-tok:${cl.jti}:${ipHash}`, 8, 3600, { failClosed: true });
    if (!rl.allowed) return jsonResponse({ ok: false, error: 'Rate limit reached for this gate pin link.' }, 429);

    const la = Number(body && (body.suggested_lat ?? body.lat ?? body.latitude));
    const ln = Number(body && (body.suggested_lng ?? body.lng ?? body.longitude));
    if (!isValidLatLngPair(la, ln)) {
      return jsonResponse({ ok: false, error: 'Valid non-zero latitude/longitude coordinates are required.' }, 400);
    }
    const rLat = Math.round(la * 1e6) / 1e6;
    const rLng = Math.round(ln * 1e6) / 1e6;
    const dupRow = await env.DB.prepare(
      "SELECT suggested_lat, suggested_lng FROM geo_gate_suggestions WHERE submitter_user_id = ?1 AND status = 'pending' AND industry = ?2 AND company = ?3 AND lower(trim(site_name)) = ?4 AND created_at > ?5 LIMIT 1"
    ).bind(tokSubmitterId, cl.ind, cl.co, normGeoKeyToken(cl.sn), new Date(nowMs - 60000).toISOString()).first();
    if (dupRow && (haversineMetersEdge(dupRow.suggested_lat, dupRow.suggested_lng, rLat, rLng) ?? 999) < 5) {
      return jsonResponse({ ok: false, error: 'A matching pending gate pin suggestion was already submitted.' }, 409);
    }
    const curSite = await findExistingSiteCoordsEdge(env.DB, {
      industry: cl.ind, company: cl.co, site_id: cl.sid, site_name: cl.sn
    });
    const exLat = curSite && curSite.lat != null ? curSite.lat : null;
    const exLng = curSite && curSite.lng != null ? curSite.lng : null;
    const shiftM = (exLat !== null && exLng !== null) ? haversineMetersEdge(exLat, exLng, rLat, rLng) : null;
    const accM = (body && body.accuracy_meters != null && Number.isFinite(Number(body.accuracy_meters)) && Number(body.accuracy_meters) >= 0)
      ? Math.min(50000, Math.round(Number(body.accuracy_meters))) : null;
    let srcUrl = String((body && body.source_url) || '').trim().slice(0, 400);
    if (srcUrl && !/^https?:\/\//i.test(srcUrl)) srcUrl = '';
    const note = String((body && (body.access_note ?? body.note)) || '').trim().slice(0, 400);
    const drvLbl = String((body && body.driver_label) || cl.dl || 'Driver Gate Link').trim().slice(0, 80);
    const rb = new Uint8Array(6);
    crypto.getRandomValues(rb);
    const id = 'gs_' + nowMs + '_' + Array.from(rb).map(b => b.toString(16).padStart(2, '0')).join('');
    await env.DB.prepare(
      `INSERT INTO geo_gate_suggestions (
        id, status, created_at, updated_at, resolved_at, submitter_kind, submitter_user_id, submitter_email, submitter_name, submitter_role, driver_label,
        industry, company, target_type, site_id, site_name, site_category, existing_lat, existing_lng, suggested_lat, suggested_lng, shift_meters, accuracy_meters, source_url, access_note, ip_hash
      ) VALUES (?1,'pending',?2,?2,'','driver_link',?3,'',?4,'Driver Link',?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)`
    ).bind(
      id, nowIso, tokSubmitterId, drvLbl, drvLbl,
      cl.ind, cl.co, cl.tt || 'site', (curSite && curSite.site_id) || cl.sid, (curSite && curSite.site_name) || cl.sn, (curSite && curSite.site_category) || cl.sc,
      exLat, exLng, rLat, rLng, shiftM, accM, srcUrl, note, ipHash
    ).run();
    const createdRow = await env.DB.prepare('SELECT * FROM geo_gate_suggestions WHERE id = ?1').bind(id).first();
    return jsonResponse({ ok: true, suggestion: publicGateSuggestion(createdRow) });
  }

  if (isDemoHeader(request)) {
    if (request.method === 'GET') return jsonResponse({ ok: true, demo: true, suggestions: [], canApprove: false });
    return jsonResponse({ ok: false, error: 'Demo sandbox is read-only' }, 403);
  }
  if (!session) return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);

  const geoAccess = await resolveGeoWriteAccess(env.DB, session);
  const effSess = geoAccess.effectiveSession || session;
  const perms = getSessionWritePerms(effSess);
  const meId = String(effSess.sub || effSess.id || '').trim();
  const meEmail = String(effSess.email || '').trim().toLowerCase();
  const isOwnerFull = isOwnerOrFullGroupSession(effSess);
  const canApprove = Boolean(geoAccess.canWriteGeo);
  const canSeeRowRls = (row) => {
    if (!row) return false;
    if (isOwnerFull) return true;
    const rCo = String(row.company || '').trim();
    const rInd = String(row.industry || '').trim();
    if (rCo && !canAccessCompany(effSess, rCo)) return false;
    if (rInd && !canAccessGeoIndustrySession(effSess, rInd)) return false;
    return Boolean(rCo);
  };

  if (request.method === 'GET') {
    const sid = String((url && url.searchParams && url.searchParams.get('id')) || '').trim();
    if (sid) {
      const row = await env.DB.prepare('SELECT * FROM geo_gate_suggestions WHERE id = ?1 LIMIT 1').bind(sid).first();
      if (!row) return jsonResponse({ ok: false, error: 'Suggestion not found.' }, 404);
      const isMine = String(row.submitter_user_id || '') === meId;
      if (!isMine && !(canApprove && canSeeRowRls(row))) return jsonResponse({ ok: false, error: 'Suggestion not found.' }, 404);
      return jsonResponse({ ok: true, suggestion: publicGateSuggestion(row), canApprove });
    }
    const statusQ = String((url && url.searchParams && url.searchParams.get('status')) || '').trim().toLowerCase();
    if (statusQ === 'pending') {
      if (!canApprove) return jsonResponse({ ok: true, canApprove: false, suggestions: [] });
      const rows = (await env.DB.prepare("SELECT * FROM geo_gate_suggestions WHERE status = 'pending' ORDER BY created_at DESC LIMIT 200").all()).results || [];
      const out = rows.filter(canSeeRowRls).slice(0, 60).map(publicGateSuggestion);
      return jsonResponse({ ok: true, canApprove: true, suggestions: out });
    }
    if (String((url && url.searchParams && url.searchParams.get('mine')) || '').trim() === '1') {
      const since = new Date(nowMs - 30 * 86400000).toISOString();
      const rows = (await env.DB.prepare('SELECT * FROM geo_gate_suggestions WHERE submitter_user_id = ?1 AND created_at > ?2 ORDER BY created_at DESC LIMIT 30').bind(meId, since).all()).results || [];
      return jsonResponse({ ok: true, canApprove, suggestions: rows.map(publicGateSuggestion) });
    }
    return jsonResponse({ ok: false, error: 'Specify id, status=pending, or mine=1.' }, 400);
  }

  const op = String((body && body.op) || '').trim().toLowerCase();
  if (op === 'mint_link') {
    const canMint = Boolean(canApprove || perms.roleKey === 'Supervisor' || perms.canEnterAny || session.kiosk || perms.roleKey === 'Kiosk' || /\bkiosk\b/i.test(String(effSess.role || '')));
    if (!canMint) {
      return jsonResponse({ ok: false, error: 'Seat does not have permission to generate driver gate links.' }, 403);
    }
    const co = canonicalizeCompanyName((body && (body.company || body.resort || body.entity)) || '');
    const ind = canonGeoIndustryKey((body && body.industry) || 'manufacturing') || 'manufacturing';
    const siteId = String((body && body.site_id) || '').trim().slice(0, 80);
    const siteName = String((body && body.site_name) || '').trim().slice(0, 160);
    const siteCat = normGeoSiteCat((body && body.site_category) || '') || String((body && body.site_category) || '').trim().slice(0, 40);
    const driverLabel = String((body && body.driver_label) || '').trim().slice(0, 80);
    const ttlHours = Math.max(1, Math.min(168, Number((body && body.ttl_hours) || 72)));
    if (!co || (!siteName && !siteId)) {
      return jsonResponse({ ok: false, error: 'Company and site name or ID are required.' }, 400);
    }
    if (!isOwnerFull && (!canAccessCompany(effSess, co) || !canAccessGeoIndustrySession(effSess, ind))) {
      return jsonResponse({ ok: false, error: 'Row-level security: unauthorized entity or industry.' }, 403);
    }
    const minted = await mintDriverGateToken({
      industry: ind,
      company: co,
      site_id: siteId,
      site_name: siteName,
      site_category: siteCat,
      target_type: String((body && body.target_type) || 'site').trim(),
      driver_label: driverLabel,
      minted_by_email: meEmail,
      minted_by_id: meId
    }, env, ttlHours);
    if (!minted || !minted.ok) {
      return jsonResponse({ ok: false, code: (minted && minted.code) || 'secret_missing', error: (minted && minted.error) || 'Gate token signing secret is not configured.' }, (minted && minted.status) || 503);
    }
    return jsonResponse({
      ok: true,
      token: minted.token,
      url_param: `?gate_pin=${encodeURIComponent(minted.token)}`,
      expires_in_hours: ttlHours,
      expires_at: new Date(minted.claims.exp * 1000).toISOString()
    });
  }

  if (op === 'create') {
    const co = canonicalizeCompanyName((body && (body.company || body.resort || body.entity)) || '');
    const ind = canonGeoIndustryKey((body && body.industry) || 'manufacturing') || 'manufacturing';
    const siteId = String((body && body.site_id) || '').trim().slice(0, 80);
    const siteName = String((body && body.site_name) || '').trim().slice(0, 160);
    const siteCat = normGeoSiteCat((body && body.site_category) || '') || String((body && body.site_category) || '').trim().slice(0, 40);
    const tt = String((body && body.target_type) || (ind === 'manufacturing' ? 'site' : 'domain_location')).trim().slice(0, 32);
    if (!co || (!siteName && !siteId)) {
      return jsonResponse({ ok: false, error: 'Company and site name are required.' }, 400);
    }
    if (!isOwnerFull && (!canAccessCompany(effSess, co) || !canAccessGeoIndustrySession(effSess, ind))) {
      await recordGeoAuditEvent(env.DB, request, effSess, {
        outcome: 'blocked_403', action: 'blocked_403', source: 'gate_promotion', industry: ind, company: co,
        target_type: tt, target_id: siteId, target_label: siteName || siteId, detail: { op: 'create', error: 'RLS rejected gate suggestion' }
      });
      return jsonResponse({ ok: false, error: 'Row-level security: cannot submit gate suggestion outside your assigned companies or industries.' }, 403);
    }
    const la = Number(body && (body.suggested_lat ?? body.lat ?? body.latitude));
    const ln = Number(body && (body.suggested_lng ?? body.lng ?? body.longitude));
    if (!isValidLatLngPair(la, ln)) {
      return jsonResponse({ ok: false, error: 'Valid non-zero coordinates are required.' }, 400);
    }
    const rLat = Math.round(la * 1e6) / 1e6;
    const rLng = Math.round(ln * 1e6) / 1e6;
    const pendCnt = Number(((await env.DB.prepare("SELECT COUNT(*) AS n FROM geo_gate_suggestions WHERE submitter_user_id = ?1 AND status = 'pending'").bind(meId).first()) || {}).n || 0);
    if (pendCnt >= 10) return jsonResponse({ ok: false, error: 'Maximum 10 pending gate pin suggestions allowed per seat.' }, 429);
    const hrCnt = Number(((await env.DB.prepare('SELECT COUNT(*) AS n FROM geo_gate_suggestions WHERE submitter_user_id = ?1 AND created_at > ?2').bind(meId, new Date(nowMs - 3600000).toISOString()).first()) || {}).n || 0);
    if (hrCnt >= 30) return jsonResponse({ ok: false, error: 'Hourly gate suggestion limit (30/hr) reached.' }, 429);

    const dup = await env.DB.prepare(
      "SELECT suggested_lat, suggested_lng FROM geo_gate_suggestions WHERE submitter_user_id = ?1 AND status = 'pending' AND industry = ?2 AND company = ?3 AND lower(trim(site_name)) = ?4 AND created_at > ?5 LIMIT 1"
    ).bind(meId, ind, co, normGeoKeyToken(siteName || siteId), new Date(nowMs - 60000).toISOString()).first();
    if (dup && (haversineMetersEdge(dup.suggested_lat, dup.suggested_lng, rLat, rLng) ?? 999) < 5) {
      return jsonResponse({ ok: false, error: 'A matching pending gate pin suggestion already exists.' }, 409);
    }
    const curSite = await findExistingSiteCoordsEdge(env.DB, { industry: ind, company: co, site_id: siteId, site_name: siteName });
    const hasValidExFallback = isValidLatLngPair(body && body.existing_lat, body && body.existing_lng);
    const exLat = curSite && curSite.lat != null ? curSite.lat : (hasValidExFallback ? Math.round(Number(body.existing_lat) * 1e6) / 1e6 : null);
    const exLng = curSite && curSite.lng != null ? curSite.lng : (hasValidExFallback ? Math.round(Number(body.existing_lng) * 1e6) / 1e6 : null);
    const shiftM = (exLat !== null && exLng !== null) ? haversineMetersEdge(exLat, exLng, rLat, rLng) : null;
    const accM = (body && body.accuracy_meters != null && Number.isFinite(Number(body.accuracy_meters)) && Number(body.accuracy_meters) >= 0)
      ? Math.min(50000, Math.round(Number(body.accuracy_meters))) : null;
    let srcUrl = String((body && body.source_url) || '').trim().slice(0, 400);
    if (srcUrl && !/^https?:\/\//i.test(srcUrl)) srcUrl = '';
    const note = String((body && (body.access_note ?? body.note)) || '').trim().slice(0, 400);
    const subKind = (session.kiosk || /kiosk/i.test(String(effSess.role || ''))) ? 'kiosk' : 'viewer';
    const rb = new Uint8Array(6);
    crypto.getRandomValues(rb);
    const id = 'gs_' + nowMs + '_' + Array.from(rb).map(b => b.toString(16).padStart(2, '0')).join('');
    await env.DB.prepare(
      `INSERT INTO geo_gate_suggestions (
        id, status, created_at, updated_at, resolved_at, submitter_kind, submitter_user_id, submitter_email, submitter_name, submitter_role, driver_label,
        industry, company, target_type, site_id, site_name, site_category, existing_lat, existing_lng, suggested_lat, suggested_lng, shift_meters, accuracy_meters, source_url, access_note, ip_hash
      ) VALUES (?1,'pending',?2,?2,'',?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23)`
    ).bind(
      id, nowIso, subKind, meId, meEmail,
      String(effSess.name || effSess.full_name || meEmail).slice(0, 120),
      String(effSess.role || 'Viewer').slice(0, 64),
      String((body && body.driver_label) || '').trim().slice(0, 80),
      ind, co, tt, (curSite && curSite.site_id) || siteId, (curSite && curSite.site_name) || siteName, (curSite && curSite.site_category) || siteCat,
      exLat, exLng, rLat, rLng, shiftM, accM, srcUrl, note, ipHash
    ).run();
    const createdRow = await env.DB.prepare('SELECT * FROM geo_gate_suggestions WHERE id = ?1').bind(id).first();
    return jsonResponse({ ok: true, suggestion: publicGateSuggestion(createdRow) });
  }

  if (op === 'cancel') {
    const sid = String((body && body.id) || '').trim();
    if (!sid) return jsonResponse({ ok: false, error: 'Suggestion id is required.' }, 400);
    const upd = await env.DB.prepare(
      "UPDATE geo_gate_suggestions SET status = 'cancelled', resolved_at = ?1, updated_at = ?1 WHERE id = ?2 AND submitter_user_id = ?3 AND status = 'pending'"
    ).bind(nowIso, sid, meId).run();
    if (!upd || !upd.meta || Number(upd.meta.changes || 0) !== 1) {
      return jsonResponse({ ok: false, error: 'Pending suggestion not found or already decided.' }, 409);
    }
    const rowAfter = await env.DB.prepare('SELECT * FROM geo_gate_suggestions WHERE id = ?1').bind(sid).first();
    return jsonResponse({ ok: true, suggestion: publicGateSuggestion(rowAfter) });
  }

  if (op === 'decide') {
    const sid = String((body && body.id) || '').trim();
    const decision = String((body && body.decision) || '').trim().toLowerCase();
    const decNote = String((body && body.decision_note) || '').trim().slice(0, 400);
    if (!sid || (decision !== 'approved' && decision !== 'declined')) {
      return jsonResponse({ ok: false, error: 'Suggestion id and decision (approved or declined) are required.' }, 400);
    }
    const existing = await env.DB.prepare('SELECT * FROM geo_gate_suggestions WHERE id = ?1 LIMIT 1').bind(sid).first();
    if (!existing) return jsonResponse({ ok: false, error: 'Gate suggestion not found.' }, 404);
    if (!canApprove || !canSeeRowRls(existing)) {
      await recordGeoAuditEvent(env.DB, request, effSess, {
        outcome: 'blocked_403', action: 'blocked_403', source: 'gate_promotion',
        industry: existing.industry, company: existing.company, target_type: existing.target_type || 'site',
        target_id: existing.site_id || sid, target_label: existing.site_name || sid,
        detail: { suggestionId: sid, error: 'Unauthorized gate pin approval/decline attempt' }
      });
      return jsonResponse({ ok: false, error: 'Supervisor + Entry or Owner permissions within entity scope are required to approve gate pins.' }, 403);
    }
    if (decision === 'approved' && !isValidLatLngPair(existing.suggested_lat, existing.suggested_lng)) {
      return jsonResponse({ ok: false, error: 'Suggestion contains invalid coordinates.' }, 400);
    }
    const decName = String(effSess.name || effSess.full_name || meEmail).slice(0, 120);
    const decRole = String(effSess.role || '').slice(0, 64);
    if (decision === 'declined') {
      const upd = await env.DB.prepare(
        `UPDATE geo_gate_suggestions
         SET status = 'declined', resolved_at = ?1, updated_at = ?1, decider_user_id = ?2, decider_email = ?3, decider_name = ?4, decider_role = ?5, decision_note = ?6
         WHERE id = ?7 AND status = 'pending'`
      ).bind(nowIso, meId, meEmail, decName, decRole, decNote, sid).run();
      if (!upd || !upd.meta || Number(upd.meta.changes || 0) !== 1) {
        return jsonResponse({ ok: false, error: 'This gate pin suggestion was already decided.' }, 409);
      }
      const afterDecl = await env.DB.prepare('SELECT * FROM geo_gate_suggestions WHERE id = ?1').bind(sid).first();
      return jsonResponse({ ok: true, suggestion: publicGateSuggestion(afterDecl), clearedRoutePairs: [] });
    }

    const stalePromotingCut = new Date(nowMs - 60000).toISOString();
    const claim = await env.DB.prepare(
      `UPDATE geo_gate_suggestions
       SET status = 'promoting', updated_at = ?1
       WHERE id = ?2 AND (status = 'pending' OR (status = 'promoting' AND updated_at < ?3))`
    ).bind(nowIso, sid, stalePromotingCut).run();
    if (!claim || !claim.meta || Number(claim.meta.changes || 0) !== 1) {
      return jsonResponse({ ok: false, error: 'This gate pin suggestion was already decided.' }, 409);
    }

    let promoRes = { promotedTargetId: '', clearedRoutePairs: [], batchStmts: [], geoCasStmt: null };
    let promoted = false;
    let casConflict = false;
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        casConflict = false;
        promoRes = await promoteGatePinEdge(env.DB, existing, effSess, nowIso);
        const approveStmt = env.DB.prepare(
          `UPDATE geo_gate_suggestions
           SET status = CASE WHEN status = 'promoting' THEN 'approved' ELSE NULL END,
               resolved_at = ?1, updated_at = ?1, decider_user_id = ?2, decider_email = ?3,
               decider_name = ?4, decider_role = ?5, decision_note = ?6, promoted_target_id = ?7
           WHERE id = ?8`
        ).bind(nowIso, meId, meEmail, decName, decRole, decNote, promoRes.promotedTargetId || '', sid);
        const stmts = [...(promoRes.batchStmts || [])];
        if (promoRes.geoCasStmt) stmts.push(promoRes.geoCasStmt);
        stmts.push(approveStmt);
        try {
          await env.DB.batch(stmts);
          promoted = true;
          break;
        } catch (batchErr) {
          const msg = String((batchErr && batchErr.message) || batchErr || '');
          if (/NOT NULL constraint failed:\s*geo_gate_suggestions\.status/i.test(msg)) {
            return jsonResponse({ ok: false, error: 'This gate pin suggestion was already decided.' }, 409);
          }
          if (/edge_kv_store/i.test(msg) && attempt < 4) {
            casConflict = true;
            continue;
          }
          if (/edge_kv_store/i.test(msg)) {
            casConflict = true;
            break;
          }
          throw batchErr;
        }
      }
      if (!promoted) {
        await env.DB.prepare("UPDATE geo_gate_suggestions SET status = 'pending', updated_at = ?1 WHERE id = ?2 AND status = 'promoting'")
          .bind(new Date().toISOString(), sid).run();
        if (casConflict) {
          return jsonResponse({ ok: false, error: 'Concurrent geo_config modification conflict; please retry.' }, 409);
        }
        return jsonResponse({ ok: false, error: 'Unable to promote gate pin suggestion.' }, 409);
      }
    } catch (promoErr) {
      try {
        await env.DB.prepare("UPDATE geo_gate_suggestions SET status = 'pending', updated_at = ?1 WHERE id = ?2 AND status = 'promoting'")
          .bind(new Date().toISOString(), sid).run();
      } catch (_) {}
      throw promoErr;
    }

    await patchPromotedMfgStoreEdge(env.DB, existing, promoRes.promotedTargetId || '', meEmail, nowIso);
    await recordGeoAuditEvent(env.DB, request, effSess, {
      outcome: 'applied',
      action: 'gate_pin_promoted',
      source: 'gate_promotion',
      industry: existing.industry,
      company: existing.company,
      target_type: existing.target_type || 'site',
      target_id: promoRes.promotedTargetId || existing.site_id || sid,
      target_label: existing.site_name || sid,
      prev_lat: existing.existing_lat,
      prev_lng: existing.existing_lng,
      next_lat: existing.suggested_lat,
      next_lng: existing.suggested_lng,
      shift_meters: existing.shift_meters,
      detail: {
        suggestionId: sid,
        submitterKind: existing.submitter_kind,
        submitter: existing.driver_label || existing.submitter_email || existing.submitter_name,
        accessNote: existing.access_note || '',
        clearedRoutePairs: promoRes.clearedRoutePairs
      }
    });
    const afterRow = await env.DB.prepare('SELECT * FROM geo_gate_suggestions WHERE id = ?1').bind(sid).first();
    return jsonResponse({
      ok: true,
      suggestion: publicGateSuggestion(afterRow),
      clearedRoutePairs: promoRes.clearedRoutePairs
    });
  }

  return jsonResponse({ ok: false, error: 'Unsupported gate-suggestions operation.' }, 400);
}
