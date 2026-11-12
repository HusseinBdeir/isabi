/**
 * Legacy seed id hits: a counter that tells when `legacy_id_map` can leave the sibling-industry seed.
 *
 * Before v19.6.256 the sibling-industry seed rows carried positional ids (`HSP-REV-0012`, `STK-KO-041`).
 * They are now content-derived (`HSP-REV-4f5afc807f`), and `seed_industries.json` ships `legacy_id_map`
 * (about 16,500 entries) so a browser can upgrade row edits and custom rows that still name an old id.
 *
 * This module counts every time a request still carries such an id, per UTC day, in D1 `legacy_id_hits`.
 * It stores counts only: no id, no email, no company, no IP. `build/legacy_id_sunset.py` in isabi-app reads
 * the table and allows the map to be dropped after 30 consecutive days with no hit.
 *
 * Kinds
 *   submit   an incoming row edit or custom row still keyed by an old id (a browser running a shell older
 *            than v19.6.256, or one whose local copy was never upgraded)
 *   upgrade  a browser that upgraded old ids with the map and asks the server to delete the old copies
 *
 * An id counts only when it is a key of the live map (read once per isolate from the private R2 seed), so a
 * new row that merely looks positional never holds the sunset back. If the map cannot be read, or the seed
 * carries none, a candidate counts as `unverified`, which also holds the sunset back: a missed hit would be
 * worse than a late sunset. Once the map is retired the counter has done its job and can be removed.
 *
 * Manufacturing (separate kinds, separate window; never mixed into the map's gate above)
 *   mfg_submit   a Manufacturing custom record in a /api/sync patch whose id is still positional (`st123`,
 *                `ex45-i2`, `wbmalf-wtc-7`): the shape the browser's legacyPosRe upgrade path exists for.
 *                Stable seed ids can never match (stable_seed_ids.make_hash_id refuses an all-digit head).
 *   mfg_upgrade  the browser's own count of positional ids it upgraded or dropped since its last
 *                successful push (`_legacyPosUpgrades` in the patch; stripped here, never stored).
 *   The Manufacturing window starts (`since` / `mfg_tracking`) at the first patch that carries
 *   `_legacyPosUpgrades` at all, i.e. from a shell that can report; before that no clean day can accrue.
 */

const SHAPE_RE = /^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*-\d{1,6}$/;
const CURATED_MEM_RE = /^MEM-\d{4}-9\d{2}$/i;
const TILL_OWNED_RE = /^(HSP-REV-)?POS-[A-Z0-9_-]{1,64}-\d{8}-[0-9A-F]{6}$/i;
const PAD_RE = /^(.+)-0*(\d+)$/;
const MAP_TTL_MS = 60 * 60 * 1000;
const MISS_RETRY_MS = 5 * 60 * 1000;   // R2 error or no seed object: try again sooner than a full hour
const MAX_CANDIDATES = 5000;
// Same pattern as `legacyPosRe` in isabi-app js/app.js (the Manufacturing store upgrade).
const MFG_LEGACY_POS_RE = /^(?:(?:st|rp|fi|ex|exi|oil|rc|sp|sa|at|em|ls|cv|dt)\d+|wbmalf-wtc-\d+|wbrecur-(?:wtc|bbc)-\d+|dv-(?:hld|ins)-(?:exp|sal|set|rec)-\d+)(?:-i\d+)?$/;
const MFG_MAX_REPORTED = 100000;   // a browser's own upgrade count is clamped, never trusted to be huge

let _keySet = null;        // Set of upper-cased map keys, or null when not loaded
let _keySetAt = 0;
let _keyMissAt = 0;        // when the last load found no usable map (so a 2 MB seed is not re-read per request)
let _keyMissTtl = 0;
let _keySetLoading = null;
let _schemaReady = false;

export function isLegacyShapedId(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s || s.length > 64 || !SHAPE_RE.test(s)) return false;
  if (CURATED_MEM_RE.test(s) || TILL_OWNED_RE.test(s)) return false;
  return true;
}

function editKeyRowId(editKey) {
  const parts = String(editKey || '').split('::');
  return parts.length >= 3 ? parts.slice(2).join('::').trim() : String(editKey || '').trim();
}

/**
 * Old-looking ids in a request body, before the server merges anything into it.
 * Reads `industryRowEdits` keys, `industryCustomRows` ids, and the purge lists of /industry_domain_store.
 */
// Every place the browser's upgradeLegacyIndustryStores translates an old id inside a custom row.
export function rowReferenceIds(r) {
  if (!r || typeof r !== 'object') return [];
  const out = [r.id, r.code, r.autoClosePriorId, r._auto_closed_by_id];
  if (Array.isArray(r.autoClosePriorIds)) out.push(...r.autoClosePriorIds);
  return out;
}

export function collectLegacyCandidates(source) {
  const submit = new Set();
  const upgrade = new Set();
  const res = { submit, upgrade, overflow: false };
  if (!source || typeof source !== 'object') return res;
  const add = (set, raw) => {
    const s = String(raw == null ? '' : raw).trim();
    if (!isLegacyShapedId(s)) return;
    // Past the cap an id is not looked up; the request then counts as unverified instead of silently clean.
    if (set.size >= MAX_CANDIDATES) { res.overflow = true; return; }
    set.add(s.toUpperCase());
  };
  const ire = source.industryRowEdits;
  if (ire && typeof ire === 'object') {
    for (const ek of Object.keys(ire)) add(submit, editKeyRowId(ek));
  }
  const icr = source.industryCustomRows;
  if (icr && typeof icr === 'object') {
    for (const list of Object.values(icr)) {
      if (!Array.isArray(list)) continue;
      for (const r of list) {
        for (const ref of rowReferenceIds(r)) add(submit, ref);
      }
    }
  }
  if (Array.isArray(source.purgedEditKeys)) {
    for (const ek of source.purgedEditKeys) add(upgrade, editKeyRowId(ek));
  }
  if (Array.isArray(source.purgedRows)) {
    for (const pr of source.purgedRows) {
      if (pr && typeof pr === 'object') add(upgrade, pr.row_id || pr.id);
    }
  }
  return res;
}

export function isMfgLegacyPosId(raw) {
  const s = String(raw == null ? '' : raw).trim();
  return Boolean(s) && s.length <= 64 && MFG_LEGACY_POS_RE.test(s);
}

/**
 * Manufacturing signals in a /api/sync patch document, read before the RLS merge, and the report field
 * removed from the document so it is never stored. Returns { reported, upgrade, submit }.
 *   reported  true when the browser sent `_legacyPosUpgrades` (a shell that can report, even with 0)
 *   upgrade   that count, as a whole number in [0, MFG_MAX_REPORTED]
 *   submit    custom records whose own id is still positional
 */
export function takeMfgLegacySignals(doc) {
  const out = { reported: false, upgrade: 0, submit: 0 };
  if (!doc || typeof doc !== 'object') return out;
  if (Object.prototype.hasOwnProperty.call(doc, '_legacyPosUpgrades')) {
    const n = Number(doc._legacyPosUpgrades);
    delete doc._legacyPosUpgrades;
    if (Number.isFinite(n)) {
      out.reported = true;
      out.upgrade = Math.min(MFG_MAX_REPORTED, Math.max(0, Math.floor(n)));
    }
  }
  const cr = doc.customRecords;
  if (cr && typeof cr === 'object') {
    for (const list of Object.values(cr)) {
      if (!Array.isArray(list)) continue;
      for (const r of list) {
        if (r && typeof r === 'object' && isMfgLegacyPosId(r.id)) out.submit++;
      }
    }
  }
  return out;
}

async function loadLegacyKeySet(env) {
  const now = Date.now();
  if (_keySet && now - _keySetAt < MAP_TTL_MS) return _keySet;
  if (_keyMissAt && now - _keyMissAt < _keyMissTtl) return null;
  if (_keySetLoading) return _keySetLoading;
  const miss = (ttl) => { _keyMissAt = Date.now(); _keyMissTtl = ttl; return null; };
  _keySetLoading = (async () => {
    try {
      if (!env || !env.BUCKET) return miss(MISS_RETRY_MS);
      const obj = await env.BUCKET.get('seeds/seed_industries.json');
      if (!obj) return miss(MISS_RETRY_MS);
      const payload = JSON.parse(await obj.text());
      const map = payload && payload.legacy_id_map;
      const set = new Set();
      if (map && typeof map === 'object') {
        for (const k of Object.keys(map)) {
          const ku = String(k || '').trim().toUpperCase();
          if (ku) set.add(ku);
        }
      }
      // A seed without the map (a faulty upload, or after the sunset) cannot confirm anything: report the
      // candidates as unverified rather than as clean, so a broken seed can never open the sunset gate.
      if (!set.size) return miss(MAP_TTL_MS);
      _keySet = set;
      _keySetAt = Date.now();
      _keyMissAt = 0;
      return set;
    } catch (_) {
      return miss(MISS_RETRY_MS);
    } finally {
      _keySetLoading = null;
    }
  })();
  return _keySetLoading;
}

// Same tolerance as the browser's resolveLegacyIndustryId: `HSP-REV-12` also matches `HSP-REV-0012`.
function isMapKey(set, idUp) {
  if (set.has(idUp)) return true;
  const m = PAD_RE.exec(idUp);
  if (!m) return false;
  for (const w of [2, 3, 4]) {
    if (set.has(`${m[1]}-${m[2].padStart(w, '0')}`)) return true;
  }
  return false;
}

async function ensureSchema(db) {
  if (_schemaReady) return;
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS legacy_id_hits (
         day TEXT NOT NULL,
         kind TEXT NOT NULL,
         hits INTEGER NOT NULL DEFAULT 0,
         updated_at TEXT NOT NULL DEFAULT '',
         PRIMARY KEY (day, kind)
       )`
    ),
    // First time this build saw traffic: the 30-day window can never start before it.
    db.prepare("INSERT OR IGNORE INTO legacy_id_hits (day, kind, hits, updated_at) VALUES ('since', 'tracking', 0, ?1)")
      .bind(new Date().toISOString())
  ]);
  _schemaReady = true;
}

/**
 * Counts the confirmed old ids among the candidates and adds them to today's row. Never throws.
 * Returns { submit, upgrade, unverified } for tests.
 */
export async function recordLegacyIdHits(env, candidates) {
  const out = { submit: 0, upgrade: 0, unverified: 0 };
  try {
    if (!env || !env.DB) return out;
    await ensureSchema(env.DB);
    const submit = candidates && candidates.submit instanceof Set ? candidates.submit : new Set();
    const upgrade = candidates && candidates.upgrade instanceof Set ? candidates.upgrade : new Set();
    if (!submit.size && !upgrade.size) return out;
    const set = await loadLegacyKeySet(env);
    if (!set) {
      out.unverified = submit.size + upgrade.size;
    } else {
      for (const id of submit) if (isMapKey(set, id)) out.submit++;
      for (const id of upgrade) if (isMapKey(set, id)) out.upgrade++;
    }
    if (candidates && candidates.overflow) out.unverified += 1;
    const nowIso = new Date().toISOString();
    const day = nowIso.slice(0, 10);
    const stmts = [];
    for (const kind of ['submit', 'upgrade', 'unverified']) {
      if (!out[kind]) continue;
      stmts.push(
        env.DB.prepare(
          `INSERT INTO legacy_id_hits (day, kind, hits, updated_at) VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT(day, kind) DO UPDATE SET hits = hits + excluded.hits, updated_at = excluded.updated_at`
        ).bind(day, kind, out[kind], nowIso)
      );
    }
    if (stmts.length) await env.DB.batch(stmts);
  } catch (_) {}
  return out;
}

/**
 * Adds the Manufacturing signals to today's rows, and starts the Manufacturing window at the first
 * reporting patch. Never throws. Returns what it wrote, for tests.
 */
export async function recordMfgLegacySignals(env, sig) {
  const out = { mfg_submit: 0, mfg_upgrade: 0, started: false };
  try {
    if (!env || !env.DB || !sig) return out;
    await ensureSchema(env.DB);
    const nowIso = new Date().toISOString();
    const day = nowIso.slice(0, 10);
    const stmts = [];
    if (sig.reported) {
      stmts.push(env.DB.prepare("INSERT OR IGNORE INTO legacy_id_hits (day, kind, hits, updated_at) VALUES ('since', 'mfg_tracking', 0, ?1)").bind(nowIso));
      out.started = true;
    }
    for (const [kind, n] of [['mfg_submit', sig.submit], ['mfg_upgrade', sig.upgrade]]) {
      if (!(n > 0)) continue;
      out[kind] = n;
      stmts.push(
        env.DB.prepare(
          `INSERT INTO legacy_id_hits (day, kind, hits, updated_at) VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT(day, kind) DO UPDATE SET hits = hits + excluded.hits, updated_at = excluded.updated_at`
        ).bind(day, kind, n, nowIso)
      );
    }
    if (stmts.length) await env.DB.batch(stmts);
  } catch (_) {}
  return out;
}

/** Runs the count after the response when the platform allows it, so a sync never waits on it. */
export function scheduleLegacyIdHits(env, ctx, candidates, mfgSignals = null) {
  const hasAny = candidates && ((candidates.submit && candidates.submit.size) || (candidates.upgrade && candidates.upgrade.size));
  const hasMfg = mfgSignals && (mfgSignals.reported || mfgSignals.submit > 0 || mfgSignals.upgrade > 0);
  const task = (async () => {
    let res;
    if (hasAny) res = await recordLegacyIdHits(env, candidates);
    // Still create the table and the `since` row once per isolate, so the window starts at deploy.
    else { try { if (env && env.DB) await ensureSchema(env.DB); } catch (_) {} }
    if (hasMfg) res = Object.assign(res || {}, { mfg: await recordMfgLegacySignals(env, mfgSignals) });
    return res;
  })();
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(task);
    return null;
  }
  return task;
}

export function _resetLegacyIdHitsForTests() {
  _keySet = null;
  _keySetAt = 0;
  _keySetLoading = null;
  _keyMissAt = 0;
  _keyMissTtl = 0;
  _schemaReady = false;
}
