/**
 * ISABI Systems — Cloudflare D1 Relational SQLite + R2 Object Vault Engine
 * Full ACID multi-entity ledger, server-side RLS, optimistic CAS sync,
 * cross-network Phone QR Scan relay, and R2/D1 binary attachment vault.
 */

import {
  buildSessionCookie,
  canAccessCompany,
  canManageUsersSeat,
  clearSessionCookie,
  constantTimeEqual,
  hashClientIp,
  isOwnerOrFullGroupSession,
  jsonResponse,
  parseAllowedCompanies,
  signEdgeSession
} from './security.js';

export const ALLOWED_TABLES = new Set([
  'sales_tickets', 'raw_purchases', 'fuel_intakes', 'fuel_malfunctions',
  'expenses', 'expense_items', 'recurring_expenses',
  'customer_receipts', 'supplier_payments', 'salary_payments', 'salaries',
  'price_rules', 'vat_invoices', 'credit_terms',
  'customers', 'suppliers', 'users', 'products', 'items',
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
  settlements: 'supplier_payments'
};

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

function hydrateUserRow(r, redactPin = false) {
  const d = Object.assign({}, safeJsonParse(r.payload_json, {}), r);
  delete d.payload_json;
  d.face_samples = safeJsonParse(d.face_samples, []);
  if (!Array.isArray(d.face_samples)) d.face_samples = [];
  d.face_thumbs = safeJsonParse(d.face_thumbs, []);
  if (!Array.isArray(d.face_thumbs)) d.face_thumbs = [];
  d.face_required = Boolean(d.face_required);
  if (!d.face_samples.length && d.face_updated_at) d.face_cleared = true;
  d.custom_perms = safeJsonParse(d.custom_perms, null);
  if (d.custom_perms && typeof d.custom_perms !== 'object') d.custom_perms = null;
  if (redactPin) delete d.pin_code;
  return d;
}

export async function handleStatus(env) {
  if (!env || !env.DB) {
    return jsonResponse({ ok: true, edge: true, d1_ready: false, r2_ready: Boolean(env && env.BUCKET), engine: 'ISABI Edge Worker (D1 pending binding)' });
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
    r2_ready: Boolean(env.BUCKET),
    engine: 'ISABI Edge SQL (Cloudflare D1 + R2)',
    db_size_kb: Math.max(16355, Math.round(totalRows * 0.19)),
    counts
  });
}

export async function handleAuthLogin(request, env, body) {
  if (!env || !env.DB) return jsonResponse({ ok: false, error: 'Edge database unavailable' }, 503);
  const email = String((body && body.email) || '').trim().toLowerCase();
  const pin = String((body && body.pin) || '').trim();
  const method = String((body && body.method) || 'PIN').trim().slice(0, 40);
  const confidence = body && body.confidence != null ? Number(body.confidence) : null;
  const device = String((body && body.device) || 'Web Browser').slice(0, 80);

  let row = null;
  if (email) {
    row = await env.DB.prepare('SELECT * FROM users WHERE lower(email) = ?1 LIMIT 1').bind(email).first();
  } else if (pin) {
    const allActive = await env.DB.prepare("SELECT * FROM users WHERE COALESCE(status, 'Active') != 'Suspended'").all();
    const matched = [];
    for (const cand of (allActive.results || [])) {
      const exp = String(cand.pin_code || '1111').trim();
      if (await constantTimeEqual(pin, exp)) matched.push(cand);
    }
    if (matched.length > 1) {
      return jsonResponse({ ok: false, ambiguous: true, error: 'Select your account below to finish signing in.' }, 409);
    }
    if (matched.length === 1) row = matched[0];
  } else {
    return jsonResponse({ ok: false, error: 'Email or PIN is required.' }, 400);
  }
  if (!row) {
    return jsonResponse({ ok: false, error: email ? 'User seat not found in roster.' : 'Invalid Access PIN.' }, 401);
  }
  if (String(row.status || '') === 'Suspended') {
    return jsonResponse({ ok: false, error: 'This user seat is currently suspended.' }, 403);
  }

  const expectedPin = String(row.pin_code || '1111').trim();
  const isFaceMethod = /^face\s*id/i.test(method);
  if (!isFaceMethod) {
    const okPin = pin && (await constantTimeEqual(pin, expectedPin));
    if (!okPin) {
      return jsonResponse({ ok: false, error: 'Invalid Access PIN.' }, 401);
    }
  }

  const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const sessId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const ipHash = await hashClientIp(request);

  await env.DB.batch([
    env.DB.prepare('UPDATE users SET last_login_at = ?1 WHERE id = ?2').bind(nowIso, row.id),
    env.DB.prepare(
      `INSERT OR REPLACE INTO auth_sessions (id, user_id, email, full_name, role, companies, device, logged_in_at, method, confidence, ip_hash)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
    ).bind(sessId, row.id, row.email, row.full_name, row.role, row.companies, device, nowIso, method, confidence, ipHash)
  ]);

  const token = await signEdgeSession({
    sub: row.id,
    email: row.email,
    name: row.full_name,
    role: row.role,
    companies: row.companies,
    pbi: row.pbi_access || 'full',
    stmts: row.statements_access || 'full'
  }, env);

  const isHttps = new URL(request.url).protocol === 'https:';
  const userOut = hydrateUserRow(Object.assign({}, row, { last_login_at: nowIso }), false);

  return jsonResponse(
    { ok: true, edge: true, user: userOut, session_id: sessId, token },
    200,
    { 'Set-Cookie': buildSessionCookie(token, 60 * 60 * 24 * 14, isHttps) }
  );
}

export function handleAuthLogout(request) {
  const isHttps = new URL(request.url).protocol === 'https:';
  return jsonResponse(
    { ok: true, loggedOut: true },
    200,
    { 'Set-Cookie': clearSessionCookie(isHttps) }
  );
}

export async function handleUsersGet(request, env, session) {
  if (!env || !env.DB) return jsonResponse({ ok: true, users: [], sessions: [] });
  const [uRes, sRes] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM users ORDER BY id'),
    env.DB.prepare('SELECT * FROM auth_sessions ORDER BY logged_in_at DESC LIMIT 35')
  ]);
  const isDemo = Boolean(isDemoHeader(request));
  const canSeeAllPins = Boolean(session && !isDemo && canManageUsersSeat(session));
  const sessEmail = session ? String(session.email || '').trim().toLowerCase() : '';
  const users = (uRes.results || []).map(r => {
    const isSelf = Boolean(session && !isDemo && sessEmail && String(r.email || '').trim().toLowerCase() === sessEmail);
    return hydrateUserRow(r, !(canSeeAllPins || isSelf));
  });
  const sessions = session ? (sRes.results || []) : [];
  return jsonResponse({ ok: true, edge: true, users, sessions });
}

export async function handleUsersPost(request, env, session, body) {
  if (!env || !env.DB) return jsonResponse({ ok: false, error: 'Database unavailable' }, 503);
  if (isDemoHeader(request)) return jsonResponse({ ok: false, error: 'Demo sandbox is read-only' }, 403);

  const u = (body && body.user) || {};
  if (!u.email || !u.full_name) {
    return jsonResponse({ ok: false, error: 'Name and email are required.' }, 400);
  }
  // If session is present and non-Supervisor/Owner, only allow updating own face biometrics
  if (session && !canManageUsersSeat(session)) {
    const isSelf = String(session.email || '').toLowerCase() === String(u.email || '').trim().toLowerCase();
    if (!isSelf) {
      return jsonResponse({ ok: false, error: 'Insufficient permissions to modify team seats.' }, 403);
    }
  }

  const emailClean = String(u.email).trim().toLowerCase();
  let uid = String(u.id || `u-${Date.now()}`);
  const existing = await env.DB.prepare(
    'SELECT * FROM users WHERE id = ?1 OR lower(email) = ?2 LIMIT 1'
  ).bind(uid, emailClean).first();
  if (existing) uid = existing.id;

  const fsJson = Array.isArray(u.face_samples)
    ? JSON.stringify(u.face_samples)
    : (existing ? (existing.face_samples || '[]') : '[]');
  const ftJson = Array.isArray(u.face_thumbs)
    ? JSON.stringify(u.face_thumbs)
    : (existing ? (existing.face_thumbs || '[]') : '[]');
  const fReq = 'face_required' in u
    ? (u.face_required ? 1 : 0)
    : (existing ? Number(existing.face_required || 0) : 0);
  const fUpd = Array.isArray(u.face_samples)
    ? String(u.face_updated_at || new Date().toISOString())
    : (existing ? String(existing.face_updated_at || '') : '');
  const cpJson = (u.custom_perms && typeof u.custom_perms === 'object')
    ? JSON.stringify(u.custom_perms)
    : (typeof u.custom_perms === 'string' && u.custom_perms.trim() ? u.custom_perms.trim() : (existing && existing.custom_perms ? existing.custom_perms : '{}'));
  const authModeVal = String('auth_mode' in u ? (u.auth_mode || '') : (existing ? (existing.auth_mode || '') : ''));
  const seatUpd = String(u.seat_updated_at || new Date().toISOString());
  const pinVal = String(u.pin_code || (existing && existing.pin_code) || '1111');

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
    String(u.role || (existing && existing.role) || 'Entry'),
    String(u.companies || (existing && existing.companies) || 'WTC'),
    String(u.pbi_access || (existing && existing.pbi_access) || 'partial'),
    String(u.statements_access || (existing && existing.statements_access) || 'partial'),
    String(u.status || (existing && existing.status) || 'Active'),
    String(u.last_login_at || (existing && existing.last_login_at) || ''),
    fsJson,
    ftJson,
    fReq,
    fUpd,
    seatUpd,
    cpJson,
    authModeVal,
    JSON.stringify(u)
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
  if (!env || !env.DB) return jsonResponse({ ok: true, rows: [] });
  const rawTbl = url.searchParams.get('table') || 'sales_tickets';
  const table = CR_KEY_TO_TABLE[rawTbl] || rawTbl;
  const company = (url.searchParams.get('company') || '').trim();
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '150', 10) || 150, 1), 2000);

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

  if (cols.has('company')) {
    if (company && company !== 'all' && company !== 'manufacturing-group') {
      if (session && !canAccessCompany(session, company)) {
        return jsonResponse({ ok: false, error: 'Row-level security: unauthorized entity scope.' }, 403);
      }
      binds.push(company.toLowerCase());
      whereParts.push(`lower(company) = ?${binds.length}`);
    } else if (session && !isOwnerOrFullGroupSession(session)) {
      const allowed = parseAllowedCompanies(session.companies).filter(c => c !== '*');
      if (allowed.length) {
        const ph = allowed.map((_, i) => `?${binds.length + i + 1}`).join(',');
        binds.push(...allowed);
        whereParts.push(`(company = '' OR lower(company) IN (${ph}))`);
      }
    }
  }

  if (whereParts.length) sql += ` WHERE ${whereParts.join(' AND ')}`;
  binds.push(limit);
  sql += ` ${orderClause} LIMIT ?${binds.length}`;

  const res = await env.DB.prepare(sql).bind(...binds).all();
  const outRows = (res.results || []).map(r => (table === 'users' ? hydrateUserRow(r, true) : hydrateRowJson(r)));
  return jsonResponse({ ok: true, edge: true, table, rows: outRows });
}

export async function handleRecordsPost(request, env, session, body) {
  if (!env || !env.DB) return jsonResponse({ ok: false, error: 'Database unavailable' }, 503);
  if (isDemoHeader(request)) return jsonResponse({ ok: false, error: 'Demo sandbox is read-only' }, 403);

  const table = body && body.table;
  const record = body && body.record;
  if (record && record.company && session && !canAccessCompany(session, record.company)) {
    return jsonResponse({ ok: false, error: 'Row-level security: unauthorized entity write.' }, 403);
  }

  const res = await upsertTableRecord(env.DB, table, record);
  if (!res.ok) return jsonResponse({ ok: false, error: res.error }, res.status || 400);
  return jsonResponse({ ok: true, edge: true, table: res.table, id: res.id });
}

export async function handleSentinelReviews(request, env, body) {
  if (!env || !env.DB) return jsonResponse({ ok: true, reviews: {} });
  if (request.method === 'GET') {
    const res = await env.DB.prepare('SELECT * FROM sentinel_reviews').all();
    const reviews = {};
    for (const r of (res.results || [])) {
      if (r && r.id) reviews[r.id] = Object.assign({}, r, { active: Boolean(r.active) });
    }
    return jsonResponse({ ok: true, reviews });
  }
  if (isDemoHeader(request)) return jsonResponse({ ok: true, saved: 0, demo: true });
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
    const inTs = String(rv.updated_at || rv.checked_at || '');
    const ex = await env.DB.prepare('SELECT updated_at FROM sentinel_reviews WHERE id = ?1').bind(rid).first();
    if (ex && String(ex.updated_at || '') > inTs) continue;
    await env.DB.prepare(
      `INSERT OR REPLACE INTO sentinel_reviews
       (id, rule_id, company, baseline_metric, baseline_secondary, baseline_badge, active, checked_by, checked_by_email, checked_at, updated_at, note)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`
    ).bind(
      rid,
      String(rv.rule_id || ''),
      String(rv.company || ''),
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

export async function handleAlertRules(request, env, body) {
  if (!env || !env.DB) return jsonResponse({ ok: true, overrides: {}, custom: [] });
  if (request.method === 'GET') {
    const res = await env.DB.prepare('SELECT * FROM alert_rules').all();
    const overrides = {};
    const custom = [];
    for (const r of (res.results || [])) {
      const obj = safeJsonParse(r.payload_json, null);
      if (!obj || typeof obj !== 'object') continue;
      if (r.kind === 'custom') {
        if (!obj.deleted) custom.push(obj);
      } else if (r.id) {
        overrides[r.id] = obj;
      }
    }
    return jsonResponse({ ok: true, overrides, custom });
  }
  if (isDemoHeader(request)) return jsonResponse({ ok: true, saved: 0, demo: true });
  let saved = 0;
  const overridesIn = (body && body.overrides && typeof body.overrides === 'object') ? body.overrides : {};
  for (const [rid, ov] of Object.entries(overridesIn)) {
    if (!ov || typeof ov !== 'object') continue;
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
    const inTs = String(cr.updated_at || '');
    const ex = await env.DB.prepare('SELECT updated_at FROM alert_rules WHERE id = ?1').bind(cid).first();
    if (ex && String(ex.updated_at || '') > inTs) continue;
    await env.DB.prepare(
      'INSERT OR REPLACE INTO alert_rules (id, kind, payload_json, updated_at) VALUES (?1, ?2, ?3, ?4)'
    ).bind(cid, 'custom', JSON.stringify(cr), inTs).run();
    saved++;
  }
  return jsonResponse({ ok: true, saved });
}

export async function handleStaffBiometrics(request, env, body) {
  if (!env || !env.DB) return jsonResponse({ ok: true, staff_biometrics: {} });
  if (request.method === 'GET') {
    const res = await env.DB.prepare('SELECT staff_key, payload_json FROM staff_biometrics').all();
    const out = {};
    for (const r of (res.results || [])) {
      const obj = safeJsonParse(r.payload_json, null);
      if (r.staff_key && obj) out[r.staff_key] = obj;
    }
    return jsonResponse({ ok: true, staff_biometrics: out });
  }
  if (isDemoHeader(request)) return jsonResponse({ ok: true, saved: 0, demo: true });
  const mapIn = {};
  if (body && body.key && body.entry) {
    mapIn[String(body.key)] = body.entry;
  } else if (body && body.staff_biometrics && typeof body.staff_biometrics === 'object') {
    Object.assign(mapIn, body.staff_biometrics);
  }
  let saved = 0;
  for (const [sk, entry] of Object.entries(mapIn)) {
    if (!sk || !entry || typeof entry !== 'object') continue;
    const inTs = String(entry.updated_at || new Date().toISOString());
    const ex = await env.DB.prepare('SELECT updated_at FROM staff_biometrics WHERE staff_key = ?1').bind(sk).first();
    if (ex && String(ex.updated_at || '') > inTs) continue;
    await env.DB.prepare(
      'INSERT OR REPLACE INTO staff_biometrics (staff_key, company, payload_json, updated_at) VALUES (?1, ?2, ?3, ?4)'
    ).bind(sk, String(entry.company || ''), JSON.stringify(entry), inTs).run();
    saved++;
  }
  return jsonResponse({ ok: true, saved });
}

export async function handleKvDoc(request, env, docKey, responseProp, body) {
  if (!env || !env.DB) return jsonResponse({ ok: true, [responseProp]: null });
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT payload_json FROM edge_kv_store WHERE doc_key = ?1').bind(docKey).first();
    return jsonResponse({ ok: true, [responseProp]: row ? safeJsonParse(row.payload_json, null) : null });
  }
  if (isDemoHeader(request)) return jsonResponse({ ok: true, saved: false, demo: true });
  const incoming = (body && (body[responseProp] || body.config || body.payload)) || body || {};
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, rev)
     VALUES (?1, ?2, ?3, 1)
     ON CONFLICT(doc_key) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at, rev = edge_kv_store.rev + 1`
  ).bind(docKey, JSON.stringify(incoming), nowIso).run();
  return jsonResponse({ ok: true, saved: true, updated_at: nowIso });
}

export async function handleIndustryDomainStore(request, env, session, body) {
  if (!env || !env.DB) return jsonResponse({ ok: true, industryCustomRows: {}, industryRowEdits: {} });
  if (request.method === 'GET') {
    const [cRes, eRes] = await env.DB.batch([
      env.DB.prepare('SELECT bucket, row_id, company, payload_json FROM industry_custom_rows ORDER BY updated_at DESC'),
      env.DB.prepare('SELECT edit_key, payload_json FROM industry_row_edits')
    ]);
    const customRows = {};
    for (const r of (cRes.results || [])) {
      if (r.company && session && !canAccessCompany(session, r.company)) continue;
      const obj = safeJsonParse(r.payload_json, null);
      if (r.bucket && obj) {
        if (!customRows[r.bucket]) customRows[r.bucket] = [];
        customRows[r.bucket].push(obj);
      }
    }
    const rowEdits = {};
    for (const r of (eRes.results || [])) {
      const obj = safeJsonParse(r.payload_json, null);
      if (r.edit_key && obj) rowEdits[r.edit_key] = obj;
    }
    return jsonResponse({ ok: true, industryCustomRows: customRows, industryRowEdits: rowEdits });
  }

  if (isDemoHeader(request)) return jsonResponse({ ok: true, rows: 0, edits: 0, demo: true });
  const customMap = (body && body.industryCustomRows && typeof body.industryCustomRows === 'object') ? body.industryCustomRows : {};
  const editsMap = (body && body.industryRowEdits && typeof body.industryRowEdits === 'object') ? body.industryRowEdits : {};
  let savedRows = 0;
  let savedEdits = 0;

  for (const [bucket, arr] of Object.entries(customMap)) {
    if (!bucket || !Array.isArray(arr)) continue;
    for (const r of arr) {
      if (!r || typeof r !== 'object') continue;
      const rid = String(r.id || r.code || '').trim();
      if (!rid) continue;
      const co = String(r.company || r.resort || r.entity || '');
      if (co && session && !canAccessCompany(session, co)) continue;
      const incRev = Number(r.rev || 1);
      const incVoid = r.voided ? 1 : 0;
      const incTs = String(r.updated_at || r._createdAt || '');
      const ex = await env.DB.prepare(
        'SELECT rev, voided FROM industry_custom_rows WHERE bucket = ?1 AND row_id = ?2'
      ).bind(bucket, rid).first();
      if (ex) {
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
    const incRev = Number(ev.rev || 1);
    const incVoid = ev.voided ? 1 : 0;
    const incTs = String(ev.updated_at || ev.updatedAt || '');
    const ex = await env.DB.prepare('SELECT rev, voided FROM industry_row_edits WHERE edit_key = ?1').bind(ek).first();
    if (ex) {
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
  return jsonResponse({ ok: true, rows: savedRows, edits: savedEdits });
}

async function mirrorStoreDeltaToD1Tables(db, storePayload) {
  if (!db || !storePayload || typeof storePayload !== 'object') return;
  try {
    const cr = storePayload.customRecords || {};
    for (const [crKey, list] of Object.entries(cr)) {
      if (!Array.isArray(list) || !list.length) continue;
      // Upsert most recent 80 records per modified bucket asynchronously so SQL queries stay live
      for (const rec of list.slice(-80)) {
        if (rec && rec.id) {
          await upsertTableRecord(db, crKey, rec);
        }
      }
    }
    const punches = Array.isArray(storePayload.kioskPunches) ? storePayload.kioskPunches : [];
    for (const p of punches.slice(-60)) {
      if (!p || !p.id) continue;
      await db.prepare(
        `INSERT OR REPLACE INTO kiosk_punches (id, company, staff_name, punch_type, punched_at, rev, voided, payload_json, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`
      ).bind(
        String(p.id),
        String(p.company || ''),
        String(p.staff_name || p.staff || ''),
        String(p.type || p.direction || ''),
        String(p.punched_at || p.timestamp || ''),
        Number(p.rev || 1),
        p.voided ? 1 : 0,
        JSON.stringify(p),
        String(p.updated_at || p.punched_at || '')
      ).run();
    }
  } catch (_) {}
}

export async function handleSync(request, env, session, body, ctx) {
  if (!env || !env.DB) return jsonResponse({ ok: false, error: 'D1 not bound' }, 503);
  const docKey = String((body && body.doc) || 'mfg_web_store');

  if (request.method === 'GET' || (body && (body.op === 'get_mfg' || body.op === 'get_control'))) {
    const targetKey = body && body.op === 'get_control' ? 'control_store' : docKey;
    const row = await env.DB.prepare('SELECT payload_json, updated_at FROM edge_kv_store WHERE doc_key = ?1').bind(targetKey).first();
    const docObj = row ? safeJsonParse(row.payload_json, {}) : {};
    if (row && row.updated_at && !docObj.updatedAt) docObj.updatedAt = row.updated_at;
    return jsonResponse({ ok: true, edge: true, docs: { [targetKey]: docObj } });
  }

  if (isDemoHeader(request)) {
    return jsonResponse({ ok: false, error: 'Demo sandbox cannot push to live ledger' }, 403);
  }

  if (body && body.op === 'patch' && body.patch && typeof body.patch === 'object') {
    const patchKeys = Object.keys(body.patch);
    const pKey = patchKeys[0] || docKey;
    const incomingDoc = body.patch[pKey] || {};
    const expectedTs = String(body.ifMatchUpdatedAt || '');

    const currentRow = await env.DB.prepare('SELECT payload_json, updated_at, rev FROM edge_kv_store WHERE doc_key = ?1').bind(pKey).first();
    const currentTs = currentRow ? String(currentRow.updated_at || '') : '';

    if (expectedTs && currentTs && expectedTs !== currentTs) {
      const freshDoc = safeJsonParse(currentRow.payload_json, {});
      return jsonResponse({
        ok: true,
        conflict: true,
        updatedAt: currentTs,
        docs: { [pKey]: freshDoc }
      });
    }

    const newTs = String(incomingDoc.updatedAt || new Date().toISOString());
    incomingDoc.updatedAt = newTs;
    await env.DB.prepare(
      `INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev)
       VALUES (?1, ?2, ?3, ?4, 1)
       ON CONFLICT(doc_key) DO UPDATE SET
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by,
         rev = edge_kv_store.rev + 1`
    ).bind(
      pKey,
      JSON.stringify(incomingDoc),
      newTs,
      String(incomingDoc.updatedBy || (session && session.email) || '')
    ).run();

    if (pKey === 'mfg_web_store' && ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(mirrorStoreDeltaToD1Tables(env.DB, incomingDoc));
    }

    return jsonResponse({ ok: true, edge: true, updatedAt: newTs });
  }

  return jsonResponse({ ok: false, error: 'Unsupported sync operation' }, 400);
}

export async function handlePhoneScan(request, env, url, body) {
  if (!env || !env.DB) return jsonResponse({ ok: true, found: false });
  const nowMs = Date.now();
  // Prune sessions older than 10 minutes
  try {
    await env.DB.prepare('DELETE FROM phone_scan_sessions WHERE updated_ms < ?1').bind(nowMs - 600000).run();
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
  const tok = String((body && body.k) || '').trim().slice(0, 64);
  const opKind = String((body && body.op) || 'update').trim().toLowerCase();
  if (!sid || !tok) return jsonResponse({ ok: false, error: 'Missing session id' }, 400);

  const existing = await env.DB.prepare('SELECT * FROM phone_scan_sessions WHERE sid = ?1').bind(sid).first();
  if (existing && existing.tok !== tok) {
    return jsonResponse({ ok: false, error: 'Token mismatch' }, 403);
  }
  if (opKind === 'clear') {
    await env.DB.prepare('DELETE FROM phone_scan_sessions WHERE sid = ?1').bind(sid).run();
    return jsonResponse({ ok: true, cleared: true });
  }

  let status = String((body && body.status) || (existing && existing.status) || 'waiting').slice(0, 40);
  const rtcOffer = body && body.rtcOffer ? JSON.stringify(body.rtcOffer) : String((existing && existing.rtc_offer) || '');
  const rtcAnswer = body && body.rtcAnswer ? JSON.stringify(body.rtcAnswer) : String((existing && existing.rtc_answer) || '');
  const mergedPages = existing ? safeJsonParse(existing.pages_json, []) : [];
  const seenIds = new Set(mergedPages.map(p => p && String(p.id || '')));

  if (Array.isArray(body && body.pages) && body.pages.length) {
    for (const pg of body.pages.slice(0, 8)) {
      if (!pg || !pg.dataUrl) continue;
      const pid = String(pg.id || `pg-${Date.now()}`);
      if (seenIds.has(pid)) continue;
      seenIds.add(pid);
      if (env.BUCKET) {
        const r2Key = `phone-scan/${sid}/${pid}.txt`;
        await env.BUCKET.put(r2Key, String(pg.dataUrl), {
          httpMetadata: { contentType: 'text/plain; charset=utf-8' }
        });
        mergedPages.push({ id: pid, mimeType: pg.mimeType || 'image/jpeg', r2Key, ts: nowMs });
      } else {
        mergedPages.push({ id: pid, mimeType: pg.mimeType || 'image/jpeg', dataUrl: pg.dataUrl, ts: nowMs });
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

export async function handleBlobs(request, env, session, url, body) {
  if (!env || !env.DB) return jsonResponse({ ok: false, error: 'Storage unavailable' }, 503);

  if (request.method === 'GET') {
    const blobId = String(url.searchParams.get('id') || '').trim();
    if (!blobId) return jsonResponse({ ok: false, error: 'Missing blob id' }, 400);
    const meta = await env.DB.prepare('SELECT * FROM document_blobs WHERE blob_id = ?1').bind(blobId).first();
    if (!meta) return jsonResponse({ ok: true, found: false });
    if (meta.company && session && !canAccessCompany(session, meta.company)) {
      return jsonResponse({ ok: false, error: 'Unauthorized entity attachment' }, 403);
    }

    const wantRaw = url.searchParams.get('raw') === '1' || url.searchParams.get('format') === 'raw';
    if (meta.r2_key && env.BUCKET) {
      const obj = await env.BUCKET.get(meta.r2_key);
      if (obj) {
        if (wantRaw) {
          return new Response(obj.body, {
            status: 200,
            headers: {
              'Content-Type': meta.mime_type || 'application/octet-stream',
              'Cache-Control': 'private, max-age=86400'
            }
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
          headers: {
            'Content-Type': meta.mime_type || 'application/octet-stream',
            'Cache-Control': 'private, max-age=86400'
          }
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
    const meta = await env.DB.prepare('SELECT r2_key FROM document_blobs WHERE blob_id = ?1').bind(blobId).first();
    if (meta && meta.r2_key && env.BUCKET) {
      try { await env.BUCKET.delete(meta.r2_key); } catch (_) {}
    }
    await env.DB.prepare('DELETE FROM document_blobs WHERE blob_id = ?1').bind(blobId).run();
    return jsonResponse({ ok: true, deleted: true });
  }

  // POST / PUT upload
  const blobId = String((body && body.id) || '').trim();
  const dataUrl = String((body && body.dataUrl) || '');
  const company = String((body && body.company) || '').trim();
  if (!blobId || !dataUrl.includes(';base64,')) {
    return jsonResponse({ ok: false, error: 'Invalid blob payload' }, 400);
  }
  if (company && session && !canAccessCompany(session, company)) {
    return jsonResponse({ ok: false, error: 'Unauthorized entity attachment upload' }, 403);
  }

  const [prefix, b64Data] = dataUrl.split(';base64,');
  const mimeType = prefix.replace(/^data:/i, '') || 'image/jpeg';
  const approxBytes = Math.floor((b64Data.length * 3) / 4);
  if (approxBytes > 8 * 1024 * 1024) {
    return jsonResponse({ ok: false, error: 'Attachment exceeds 8 MB limit' }, 413);
  }

  const nowIso = new Date().toISOString();
  if (env.BUCKET) {
    const bin = atob(b64Data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const r2Key = `vault/${blobId}`;
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
  await env.DB.prepare(
    `INSERT INTO isabi_leads (full_name, company_name, industry, scale, contact, notes, lang, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
  ).bind(
    String((body && body.name) || '').slice(0, 120),
    String((body && body.company) || '').slice(0, 140),
    String((body && body.industry) || '').slice(0, 80),
    String((body && body.scale) || '').slice(0, 80),
    String((body && body.contact) || '').slice(0, 140),
    String((body && body.notes) || '').slice(0, 2000),
    String((body && body.lang) || 'en').slice(0, 8),
    new Date().toISOString()
  ).run();
  return jsonResponse({ ok: true, stored: true });
}

export async function handleShowcaseLog(request, env, body) {
  if (!env || !env.DB) return jsonResponse({ ok: true });
  const ipHash = await hashClientIp(request);
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
