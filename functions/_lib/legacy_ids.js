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
 */

const SHAPE_RE = /^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*-\d{1,6}$/;
const CURATED_MEM_RE = /^MEM-\d{4}-9\d{2}$/i;
const TILL_OWNED_RE = /^(HSP-REV-)?POS-[A-Z0-9_-]{1,64}-\d{8}-[0-9A-F]{6}$/i;
const PAD_RE = /^(.+)-0*(\d+)$/;
const MAP_TTL_MS = 60 * 60 * 1000;
const MISS_RETRY_MS = 5 * 60 * 1000;   // R2 error or no seed object: try again sooner than a full hour
const MAX_CANDIDATES = 5000;

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

/** Runs the count after the response when the platform allows it, so a sync never waits on it. */
export function scheduleLegacyIdHits(env, ctx, candidates) {
  const hasAny = candidates && ((candidates.submit && candidates.submit.size) || (candidates.upgrade && candidates.upgrade.size));
  const task = hasAny ? recordLegacyIdHits(env, candidates) : (async () => {
    // Still create the table and the `since` row once per isolate, so the window starts at deploy.
    try { if (env && env.DB) await ensureSchema(env.DB); } catch (_) {}
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
