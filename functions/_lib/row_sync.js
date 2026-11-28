// Row sync (store-size plan step 2, stage A): a device fetches only the entries that changed since its last sync.
//
// The stored document (edge_kv_store `mfg_web_store` head + parts) stays the master copy in this stage. Beside it:
//   store_row_index   one line per entry: row set, id, content hash, the revision it last changed at, deleted flag,
//                     and what decides who may see the entry (now, and in its earlier versions)
//   store_row_meta    one line per document: epoch, revision counter, the anchor of the document the index describes
//
// The rule everything hangs on: the index describes the document only while store_row_meta.doc_ts equals the anchor
// of the stored text: its stamp, its length and a SHA-256 of the text itself (docAnchorOf). A writer that knows the
// index moves both in one batch (finishRowIndexPatch). A writer that does not (the top-up's direct D1 write, a
// sub-document patch, a rollback after a failed mirror, a data release that rewrites the text under the stamp it
// found, an older server) leaves the anchor behind, and the next reader rebuilds the index from the document by
// content hash (ensureRowIndexCurrent). So the index can lag, but it can never silently disagree with the document.
//
// The device does not take the index on trust either: every answer carries, per row set, the number of entries and a
// digest of them as sent (rowSumsOf), and the device checks its copy against it after every answer. A copy that does
// not match is dropped and the whole document is read.
//
// Nothing here decides what a seat may see: the caller passes the document already scoped for the session, and says
// (couldSee) whether the session could ever have held an entry that is not in it. Only then is the id reported gone.

export const ROW_SYNC_DOC_KEY = 'mfg_web_store';
// More changed entries than this since the device's revision: send the whole document instead.
export const ROW_SYNC_MAX_DELTA_ROWS = 1500;
// Deleted-entry lines are kept for this many revisions; a device further behind gets the whole document.
export const ROW_SYNC_TOMBSTONE_KEEP_REVS = 5000;
// Devices that see the whole store compare their rebuilt copy with the whole document until this many comparisons
// came back clean.
export const ROW_SYNC_AUDIT_TARGET = 150;
// Such a device is asked for its first comparison after this many partial answers in one page session.
export const ROW_SYNC_AUDIT_AFTER = 3;
// store_row_meta.mode: 0 everything off, 1 lighter entries only (no partial answers), 2 both (the default),
// 3 partial answers only (edit history travels as before).
export const ROW_SYNC_MODE_DEFAULT = 2;
// The fields of an entry that decide which company-scoped seat may see it (d1_store.js scopedSeatSeesCrRow and
// scopedSeatSeesKioskPunch read these and nothing else of the entry). Kept on the index line, so that an entry no
// longer in a seat's document is reported gone only to a seat that could have held it.
export const ROW_VIS_FIELDS = ['company', 'resort', 'entity', '_industry', 'industry', 'ind'];
const VIS_UNKNOWN = '*';
const VIS_FIELD_MAX_CHARS = 120;
const VIS_HISTORY_MAX_CHARS = 600;
const INDEX_WRITE_CHUNK = 300;
const KIOSK_PUNCH_SET = 'kp';

const SCHEMA_STMTS = [
  `CREATE TABLE IF NOT EXISTS store_row_index (
     doc_key TEXT NOT NULL,
     bucket TEXT NOT NULL,
     row_id TEXT NOT NULL,
     hash TEXT NOT NULL DEFAULT '',
     rev INTEGER NOT NULL DEFAULT 0,
     deleted INTEGER NOT NULL DEFAULT 0,
     vis TEXT NOT NULL DEFAULT '',
     pvis TEXT NOT NULL DEFAULT '',
     vrev INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (doc_key, bucket, row_id)
   )`,
  'CREATE INDEX IF NOT EXISTS idx_store_row_index_rev ON store_row_index (doc_key, rev)',
  `CREATE TABLE IF NOT EXISTS store_row_meta (
     doc_key TEXT PRIMARY KEY,
     epoch TEXT NOT NULL,
     rev INTEGER NOT NULL DEFAULT 0,
     doc_ts TEXT NOT NULL DEFAULT '',
     floor_rev INTEGER NOT NULL DEFAULT 0,
     mode INTEGER NOT NULL DEFAULT 2,
     audit_ok INTEGER NOT NULL DEFAULT 0,
     audit_bad INTEGER NOT NULL DEFAULT 0,
     audit_note TEXT,
     updated_at TEXT
   )`
];

const _schemaReadyFor = new WeakSet();

export async function ensureRowSyncSchema(db) {
  if (!db || _schemaReadyFor.has(db)) return;
  for (const sql of SCHEMA_STMTS) await db.prepare(sql).run();
  _schemaReadyFor.add(db);
}

// ---- pure helpers -------------------------------------------------------------------------------------------------

// Two 32-bit hashes of the text in one pass (the mixing of cyrb53). The device runs the same function over the same
// text (isabi-app js/app.js, RowSyncClient.hashPair): change one and the other must change with it.
export function hashPair(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return [h1 >>> 0, h2 >>> 0];
}

// Length plus 64 bits of hash of the text: a change detector, not a security boundary.
export function hashText(str) {
  const s = typeof str === 'string' ? str : '';
  const p = hashPair(s);
  return `${s.length.toString(36)}.${p[0].toString(36)}.${p[1].toString(36)}`;
}

function jsonOf(val) {
  let s = '';
  try { s = JSON.stringify(val === undefined ? null : val); } catch (_) { s = ''; }
  return s === undefined ? '' : s;
}

export function hashJson(val) {
  return hashText(jsonOf(val));
}

export function rowIdOf(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r) || r.id === undefined || r.id === null) return '';
  return String(r.id).trim();
}

export function crSetName(tableKey) {
  return `cr:${tableKey}`;
}

// Every keyed row set of a store document: [set name, list]. customRecords tables and the kiosk punch list.
export function rowSetsOf(doc) {
  const out = [];
  if (!doc || typeof doc !== 'object') return out;
  const cr = doc.customRecords;
  if (cr && typeof cr === 'object' && !Array.isArray(cr)) {
    for (const k of Object.keys(cr)) {
      if (Array.isArray(cr[k])) out.push([crSetName(k), cr[k]]);
    }
  }
  if (Array.isArray(doc.kioskPunches)) out.push([KIOSK_PUNCH_SET, doc.kioskPunches]);
  return out;
}

// set name -> Map(id -> row). A repeated id keeps its last row, the same choice the device makes.
export function collectRowMaps(doc) {
  const maps = new Map();
  for (const [setName, list] of rowSetsOf(doc)) {
    const m = new Map();
    for (const r of list) {
      const rid = rowIdOf(r);
      if (rid) m.set(rid, r);
    }
    maps.set(setName, m);
  }
  return maps;
}

// What decides who may see this entry, as text: the ROW_VIS_FIELDS it carries. '*' when it cannot be kept (a value
// too long to be a company or an industry): such an entry is then never reported gone to a company-scoped seat.
export function visStubOf(r) {
  if (!r || typeof r !== 'object') return VIS_UNKNOWN;
  const o = {};
  for (const f of ROW_VIS_FIELDS) {
    const v = r[f];
    if (!v) continue;   // the scoping rules read each of these as `value || ''`
    const s = String(v);
    if (s.length > VIS_FIELD_MAX_CHARS) return VIS_UNKNOWN;
    o[f] = s;
  }
  return JSON.stringify(o);
}

// set name -> Map(id -> [content hash, visibility stub]) for every keyed entry of the document as stored.
export function collectRowLines(doc) {
  const out = new Map();
  for (const [setName, m] of collectRowMaps(doc)) {
    const lines = new Map();
    for (const [rid, r] of m) lines.set(rid, [hashJson(r), visStubOf(r)]);
    out.set(setName, lines);
  }
  return out;
}

// What a device checks its copy against: per row set, "<entries>.<digest>.<digest>" over the entries as sent (the
// digests are the XOR of hashPair over each entry's JSON text, so their order does not matter). `exact` is false
// when a set holds an entry without an id or two entries with one id: a copy keyed by id cannot stand for such a
// document, so no partial answers are offered for it.
export function rowSumsOf(doc) {
  const sums = {};
  let exact = true;
  for (const [setName, list] of rowSetsOf(doc)) {
    const seen = new Set();
    let x1 = 0;
    let x2 = 0;
    for (const r of list) {
      const rid = rowIdOf(r);
      if (!rid || seen.has(rid)) { exact = false; continue; }
      seen.add(rid);
      const p = hashPair(jsonOf(r));
      x1 ^= p[0];
      x2 ^= p[1];
    }
    sums[setName] = `${seen.size}.${(x1 >>> 0).toString(36)}.${(x2 >>> 0).toString(36)}`;
  }
  return { exact, sums };
}

function isRowSetTopKey(k) {
  return k === 'customRecords' || k === 'kioskPunches';
}

// Hash of every top-level part of the document that is not a keyed row set (seats, schedules, settings ...).
export function topEtagsOf(doc) {
  const out = {};
  if (!doc || typeof doc !== 'object') return out;
  for (const k of Object.keys(doc)) {
    if (isRowSetTopKey(k) || doc[k] === undefined) continue;
    out[k] = hashJson(doc[k]);
  }
  return out;
}

// Raise when the same stored entry would be sent to the same session differently than before (a scoping rule, a rule
// about which entries keep their edit history): every device then starts again from the whole document instead of
// finding its copy at odds with the digests.
export const ROW_SYNC_SHAPE_VER = 1;

// What scoping reads from a session, and what else shapes the entries it is sent (`shape`: the caller passes the
// deployed version and whether edit history is being left out). A device whose answer carries another signature
// starts again from the whole document, so a seat whose companies or role changed never keeps entries it may no
// longer see, and a copy made under other sending rules is never patched under these.
export function sessionScopeSig(session, shape = null) {
  const s = (session && typeof session === 'object') ? session : {};
  return hashJson([
    ROW_SYNC_SHAPE_VER,
    shape === undefined ? null : shape,
    String(s.sub || s.user_id || s.id || ''),
    String(s.email || '').trim().toLowerCase(),
    String(s.role || ''),
    String(s.companies || ''),
    s.custom_perms === undefined ? null : s.custom_perms,
    String(s.pbi || s.pbi_access || ''),
    String(s.stmts || s.statements_access || ''),
    s.ws_write === undefined ? null : s.ws_write,
    Boolean(s.locked || s.kioskLocked),
    Boolean(s.build_ticket)
  ]);
}

function modeOf(meta) {
  if (!meta) return ROW_SYNC_MODE_DEFAULT;
  const m = Number(meta.mode);
  return Number.isInteger(m) ? m : ROW_SYNC_MODE_DEFAULT;
}

// Partial answers are on (modes 2 and 3) and no comparison has failed.
export function rowSyncServing(meta) {
  if (!meta || Number(meta.audit_bad) > 0) return false;
  const m = modeOf(meta);
  return m === 2 || m === 3;
}

// Live entries travel without their edit history (modes 1 and 2; also before the meta line exists).
export function rowSyncElides(meta) {
  const m = modeOf(meta);
  return m === 1 || m === 2;
}

function splitSetName(setName) {
  if (setName === KIOSK_PUNCH_SET) return { kind: 'kioskPunches', table: '' };
  if (typeof setName === 'string' && setName.startsWith('cr:')) return { kind: 'customRecords', table: setName.slice(3) };
  return null;
}

// The visibility stubs an index line carries, parsed: its last one and, when `withEarlier`, the ones before it.
// Empty when unknown.
function stubsOfLine(ch, withEarlier) {
  const out = [];
  const texts = [String(ch.vis || '')].concat(withEarlier ? String(ch.pvis || '').split('\n') : []);
  for (const t of texts) {
    if (!t || t === VIS_UNKNOWN) continue;
    try {
      const o = JSON.parse(t);
      if (o && typeof o === 'object' && !Array.isArray(o)) out.push(o);
    } catch (_) {}
  }
  return out;
}

// The partial answer: changed entries the session can see, ids that are gone for it, and the top-level parts whose
// hash differs from what the device holds. `changed` is [{bucket, row_id, deleted, vis, pvis, vrev}] newest revision
// first. `couldSee(kind, table, stub)` says whether the session could see an entry carrying these ROW_VIS_FIELDS;
// null for a session that sees the whole store. A changed entry that is not in the scoped document is reported gone
// only when the device could be holding it: the session could see the version the device's revision read (the last
// one when what decides visibility has not changed since, `vrev`; else any of the versions on record). An entry of
// another company is never mentioned, not even by its id. (If that ever leaves a device holding an entry it should
// have lost, its copy fails the digest check and it reads the whole document.)
export function buildRowDelta(scopedDoc, changed, reqTopEtags, baseRev, nowTopEtags = null, couldSee = null) {
  const maps = collectRowMaps(scopedDoc);
  const rows = { customRecords: {}, kioskPunches: [] };
  const gone = { customRecords: {}, kioskPunches: [] };
  const base = Number(baseRev) || 0;
  for (const ch of (Array.isArray(changed) ? changed : [])) {
    const parts = splitSetName(String(ch.bucket || ''));
    const rid = String(ch.row_id || '');
    if (!parts || !rid) continue;
    const m = maps.get(String(ch.bucket));
    const row = (!Number(ch.deleted) && m) ? m.get(rid) : undefined;
    if (!row && couldSee) {
      const stubs = stubsOfLine(ch, Number(ch.vrev || 0) > base);
      if (!stubs.some(stub => couldSee(parts.kind, parts.table, stub))) continue;
    }
    if (parts.kind === 'kioskPunches') {
      if (row) rows.kioskPunches.push(row); else gone.kioskPunches.push(rid);
    } else if (row) {
      (rows.customRecords[parts.table] || (rows.customRecords[parts.table] = [])).push(row);
    } else {
      (gone.customRecords[parts.table] || (gone.customRecords[parts.table] = [])).push(rid);
    }
  }
  const have = (reqTopEtags && typeof reqTopEtags === 'object' && !Array.isArray(reqTopEtags)) ? reqTopEtags : {};
  const nowEtags = nowTopEtags || topEtagsOf(scopedDoc);
  const top = {};
  for (const k of Object.keys(nowEtags)) {
    if (have[k] !== nowEtags[k]) top[k] = scopedDoc[k];
  }
  const topGone = Object.keys(have).filter(k => !Object.prototype.hasOwnProperty.call(nowEtags, k) && !isRowSetTopKey(k));
  // A row set the document no longer has at all (an emptied punch list, a dropped table) cannot be told from its
  // index lines alone once those are pruned, so the list of sets present rides along and the device drops the rest.
  return {
    base,
    rows,
    gone,
    top,
    topGone,
    sets: Array.from(maps.keys()),
    has: {
      customRecords: Boolean(scopedDoc && scopedDoc.customRecords && typeof scopedDoc.customRecords === 'object' && !Array.isArray(scopedDoc.customRecords)),
      kioskPunches: Boolean(scopedDoc && Array.isArray(scopedDoc.kioskPunches))
    }
  };
}

// ---- edit history (trail) elision ---------------------------------------------------------------------------------

export function hasTrail(r) {
  return Boolean(r && typeof r === 'object' && (r._pre_void_orig !== undefined || r._pre_void_edits !== undefined));
}

// The entry without its edit history (a copy; the entry itself when it has none).
export function withoutTrail(r) {
  if (!hasTrail(r)) return r;
  const c = Object.assign({}, r);
  delete c._pre_void_orig;
  delete c._pre_void_edits;
  return c;
}

// Edit history (`_pre_void_orig`, `_pre_void_edits`) is read on a device in two places only: the Void Log, for voided
// entries, and the test that tells a seeded attendance entry bloated by the shift backfill from a real one. So a
// voided entry travels whole, an entry the caller names (`keepWhole`) travels whole, and every other live entry
// travels without its history; the stored document keeps it all, and the history comes back with the entry the
// moment it is voided.
function elideTrailRow(r, keepWhole) {
  if (!hasTrail(r) || r.voided || (keepWhole && keepWhole(r))) return r;
  return withoutTrail(r);
}

// A copy of the document whose live customRecords entries carry no edit history.
// `keepWhole(tableKey, row)` names entries that must travel unchanged (the device classifies them by their history).
export function elideTrailsInDoc(doc, keepWhole = null) {
  if (!doc || typeof doc !== 'object' || !doc.customRecords || typeof doc.customRecords !== 'object') return doc;
  const outCr = {};
  let touched = false;
  for (const [k, list] of Object.entries(doc.customRecords)) {
    if (!Array.isArray(list)) { outCr[k] = list; continue; }
    let listTouched = false;
    const next = list.map(r => {
      const e = elideTrailRow(r, keepWhole ? (row => keepWhole(k, row)) : null);
      if (e !== r) listTouched = true;
      return e;
    });
    outCr[k] = listTouched ? next : list;
    if (listTouched) touched = true;
  }
  return touched ? Object.assign({}, doc, { customRecords: outCr }) : doc;
}

function trailSig(ev) {
  let ch = '';
  try { ch = JSON.stringify(ev.changes); } catch (_) {}
  return `${String(ev.at || '')}|${String(ev.by || '')}|${ch}`;
}

// A device that no longer holds edit history sends an entry with none, or with only the lines it wrote itself. Before
// any guard reads the entry, the stored history is put back: stored lines first, the device's own lines that are not
// among them after, oldest first, the same union an older device sends after merging the cloud copy into its own.
export function rehydrateTrails(incomingDoc, prevDoc) {
  const incCr = incomingDoc && incomingDoc.customRecords;
  const prevCr = prevDoc && prevDoc.customRecords;
  if (!incCr || typeof incCr !== 'object' || !prevCr || typeof prevCr !== 'object') return 0;
  let n = 0;
  for (const [k, list] of Object.entries(incCr)) {
    if (!Array.isArray(list) || !list.length || !Array.isArray(prevCr[k])) continue;
    let prevById = null;
    for (const ir of list) {
      const rid = rowIdOf(ir);
      if (!rid) continue;
      if (!prevById) {
        prevById = new Map();
        for (const pr of prevCr[k]) {
          const pid = rowIdOf(pr);
          if (pid && hasTrail(pr)) prevById.set(pid, pr);
        }
        if (!prevById.size) break;
      }
      const pr = prevById.get(rid);
      if (!pr) continue;
      const pOrig = (pr._pre_void_orig && typeof pr._pre_void_orig === 'object' && !Array.isArray(pr._pre_void_orig)) ? pr._pre_void_orig : null;
      const iOrig = (ir._pre_void_orig && typeof ir._pre_void_orig === 'object' && !Array.isArray(ir._pre_void_orig)) ? ir._pre_void_orig : null;
      if (pOrig && Object.keys(pOrig).length) ir._pre_void_orig = Object.assign({}, pOrig);
      else if (!iOrig && pr._pre_void_orig !== undefined) ir._pre_void_orig = pr._pre_void_orig;
      const pEds = Array.isArray(pr._pre_void_edits) ? pr._pre_void_edits : [];
      const iEds = Array.isArray(ir._pre_void_edits) ? ir._pre_void_edits : [];
      if (pEds.length || iEds.length) {
        const seen = new Set();
        const merged = [];
        for (const ev of [...pEds, ...iEds]) {
          if (!ev || typeof ev !== 'object') continue;
          const sig = trailSig(ev);
          if (seen.has(sig)) continue;
          seen.add(sig);
          merged.push(ev);
        }
        if (iEds.length) merged.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
        ir._pre_void_edits = merged.slice(-15);
      }
      n += 1;
    }
  }
  return n;
}

// ---- the anchor ---------------------------------------------------------------------------------------------------

// The stored text the last anchor was worked out for. A device asks every half minute and the text rarely changed
// in between, so the usual read costs one string comparison instead of a SHA-256 over the whole store.
let _anchorMemo = null;

async function sha256Hex24(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest).subarray(0, 12), b => b.toString(16).padStart(2, '0')).join('');
}

function anchorPrefix(ts, text) {
  return `${ts}|${text.length.toString(36)}|`;
}

// The anchor of a stored document: "<stamp>|<length>|<SHA-256 of the text, 24 hex>". Two writes that leave the same
// stamp on different text (a data release rewrites the store under the stamp it found; a seat chooses its own stamp)
// have different anchors, so the index is never taken for current on the stamp alone.
export async function anchorOfText(ts, text) {
  const t = typeof text === 'string' ? text : '';
  const s = String(ts || '');
  if (!s) return '';
  if (_anchorMemo && _anchorMemo.ts === s && _anchorMemo.text === t) return _anchorMemo.anchor;
  const anchor = anchorPrefix(s, t) + (await sha256Hex24(t));
  _anchorMemo = { ts: s, text: t, anchor };
  return anchor;
}

// `headRow` as readEdgeKvDoc returns it: { payload_json (head and parts stitched), updated_at }.
export async function docAnchorOf(headRow) {
  if (!headRow) return '';
  return anchorOfText(String(headRow.updated_at || ''), String(headRow.payload_json || ''));
}

// ---- D1 -----------------------------------------------------------------------------------------------------------

function newEpoch() {
  const b = new Uint8Array(9);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

function metaStmt(db) {
  return db.prepare(
    'SELECT doc_key, epoch, rev, doc_ts, floor_rev, mode, audit_ok, audit_bad FROM store_row_meta WHERE doc_key = ?1'
  ).bind(ROW_SYNC_DOC_KEY);
}

function changedStmt(db, sinceRev) {
  return db.prepare(
    'SELECT bucket, row_id, rev, deleted, vis, pvis, vrev FROM store_row_index WHERE doc_key = ?1 AND rev > ?2 ORDER BY rev DESC, bucket ASC, row_id ASC LIMIT ?3'
  ).bind(ROW_SYNC_DOC_KEY, sinceRev, ROW_SYNC_MAX_DELTA_ROWS + 1);
}

function normMeta(m) {
  if (!m) return null;
  return {
    epoch: String(m.epoch || ''),
    rev: Number(m.rev || 0),
    doc_ts: String(m.doc_ts || ''),
    floor_rev: Number(m.floor_rev || 0),
    mode: Number(m.mode === undefined || m.mode === null ? ROW_SYNC_MODE_DEFAULT : m.mode),
    audit_ok: Number(m.audit_ok || 0),
    audit_bad: Number(m.audit_bad || 0)
  };
}

// The meta line as it stands (no schema work: a store whose tables are missing throws, and the caller falls back).
export async function readRowMeta(db) {
  if (!db) return null;
  return normMeta(await metaStmt(db).first());
}

// Statements that apply [[set, id, hash, deleted, vis]] lines at the revision the meta row holds, only while the meta
// row carries `anchor` (and, when `rev` is given, that revision), so a batch that lost its turn writes nothing.
// A line that changes keeps what decided its visibility before (`pvis`, one stub per line of text) and the revision
// at which that last changed (`vrev`): an entry that moved to another company, or was deleted, is still known to
// have been visible to its old company's seats. More history than fits turns into '*' (unknown), which reports the
// entry gone to nobody but whole-store seats.
function indexWriteStmts(db, lines, anchor, rev = null) {
  const stmts = [];
  const revCond = rev === null ? '' : ' AND m.rev = ?4';
  for (let i = 0; i < lines.length; i += INDEX_WRITE_CHUNK) {
    const chunk = JSON.stringify(lines.slice(i, i + INDEX_WRITE_CHUNK));
    const st = db.prepare(
      `INSERT INTO store_row_index (doc_key, bucket, row_id, hash, rev, deleted, vis, pvis, vrev)
       SELECT ?1, json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]'), json_extract(j.value, '$[2]'), m.rev,
              json_extract(j.value, '$[3]'), json_extract(j.value, '$[4]'), '', m.rev
       FROM json_each(?2) AS j, store_row_meta AS m
       WHERE m.doc_key = ?1 AND m.doc_ts = ?3${revCond}
       ON CONFLICT(doc_key, bucket, row_id) DO UPDATE SET
         hash = excluded.hash,
         rev = excluded.rev,
         deleted = excluded.deleted,
         vrev = CASE
           WHEN excluded.deleted = 1 OR excluded.vis = store_row_index.vis THEN store_row_index.vrev
           ELSE excluded.rev
         END,
         pvis = CASE
           WHEN excluded.deleted = 1 OR excluded.vis = store_row_index.vis OR store_row_index.vis = '' THEN store_row_index.pvis
           WHEN store_row_index.pvis = '${VIS_UNKNOWN}' OR store_row_index.vis = '${VIS_UNKNOWN}' THEN '${VIS_UNKNOWN}'
           WHEN store_row_index.pvis = '' THEN store_row_index.vis
           WHEN instr(char(10) || store_row_index.pvis || char(10), char(10) || store_row_index.vis || char(10)) > 0 THEN store_row_index.pvis
           WHEN length(store_row_index.pvis) > ${VIS_HISTORY_MAX_CHARS} THEN '${VIS_UNKNOWN}'
           ELSE store_row_index.pvis || char(10) || store_row_index.vis
         END,
         vis = CASE WHEN excluded.deleted = 1 THEN store_row_index.vis ELSE excluded.vis END`
    );
    stmts.push(rev === null ? st.bind(ROW_SYNC_DOC_KEY, chunk, anchor) : st.bind(ROW_SYNC_DOC_KEY, chunk, anchor, rev));
  }
  return stmts;
}

// Deleted-entry lines older than the keep window go, and the floor a device's revision must reach moves up with them.
function pruneStmts(db, anchor, rev) {
  const floor = rev - ROW_SYNC_TOMBSTONE_KEEP_REVS;
  if (floor <= 0) return [];
  return [
    db.prepare(
      `DELETE FROM store_row_index WHERE doc_key = ?1 AND deleted = 1 AND rev < ?2
       AND EXISTS (SELECT 1 FROM store_row_meta m WHERE m.doc_key = ?1 AND m.doc_ts = ?3 AND m.rev >= ?4)`
    ).bind(ROW_SYNC_DOC_KEY, floor, anchor, rev),
    db.prepare(
      'UPDATE store_row_meta SET floor_rev = ?2 WHERE doc_key = ?1 AND doc_ts = ?3 AND rev >= ?4 AND floor_rev < ?2'
    ).bind(ROW_SYNC_DOC_KEY, floor, anchor, rev)
  ];
}

// prevHashes: Map(set -> Map(id -> hash)); nextLines: Map(set -> Map(id -> [hash, vis])).
function diffLines(prevHashes, nextLines) {
  const lines = [];
  for (const [setName, m] of nextLines) {
    const prev = prevHashes.get(setName);
    for (const [rid, hv] of m) {
      if (!prev || prev.get(rid) !== hv[0]) lines.push([setName, rid, hv[0], 0, hv[1]]);
    }
  }
  for (const [setName, prev] of prevHashes) {
    const next = nextLines.get(setName);
    for (const rid of prev.keys()) {
      if (!next || !next.has(rid)) lines.push([setName, rid, '', 1, '']);
    }
  }
  return lines;
}

function hashesOfLines(lineMaps) {
  const out = new Map();
  for (const [setName, m] of lineMaps) {
    const h = new Map();
    for (const [rid, hv] of m) h.set(rid, hv[0]);
    out.set(setName, h);
  }
  return out;
}

async function readHeadTs(db) {
  const r = await db.prepare('SELECT updated_at FROM edge_kv_store WHERE doc_key = ?1').bind(ROW_SYNC_DOC_KEY).first();
  return r ? String(r.updated_at || '') : null;
}

// Reader side. Returns { meta, changed } for the document read as `headRow` (`changed` only when `sinceRev` is a
// number: entries whose revision is above it, newest first, null when there are too many), or null when the index
// cannot be brought in line with that read (the document moved on meanwhile, or the tables are unavailable).
export async function ensureRowIndexCurrent(db, storedDoc, headRow, sinceRev = null) {
  const headTs = headRow ? String(headRow.updated_at || '') : '';
  if (!db || !storedDoc || typeof storedDoc !== 'object' || !headTs) return null;
  await ensureRowSyncSchema(db);
  const anchor = await docAnchorOf(headRow);
  if (!anchor) return null;
  const wantChanged = Number.isInteger(sinceRev) && sinceRev >= 0;
  const readBoth = async () => {
    if (!wantChanged) return { meta: normMeta(await metaStmt(db).first()), changed: null };
    const res = await db.batch([metaStmt(db), changedStmt(db, sinceRev)]);
    const metaRow = res && res[0] && Array.isArray(res[0].results) ? res[0].results[0] : null;
    const list = res && res[1] && Array.isArray(res[1].results) ? res[1].results : [];
    return { meta: normMeta(metaRow), changed: list.length > ROW_SYNC_MAX_DELTA_ROWS ? null : list };
  };
  let cur = await readBoth();
  if (cur.meta && cur.meta.doc_ts === anchor) return cur;

  // The index describes another text. Rebuild only from a read that is still the live document.
  if ((await readHeadTs(db)) !== headTs) return null;
  const seenRev = cur.meta ? cur.meta.rev : 0;
  const seenAnchor = cur.meta ? cur.meta.doc_ts : '';
  const nextLines = collectRowLines(storedDoc);
  const prevHashes = new Map();
  const idxRows = await db.prepare(
    'SELECT bucket, row_id, hash FROM store_row_index WHERE doc_key = ?1 AND deleted = 0'
  ).bind(ROW_SYNC_DOC_KEY).all();
  for (const ir of (idxRows.results || [])) {
    const b = String(ir.bucket);
    let m = prevHashes.get(b);
    if (!m) { m = new Map(); prevHashes.set(b, m); }
    m.set(String(ir.row_id), String(ir.hash || ''));
  }
  const lines = diffLines(prevHashes, nextLines);
  const nowIso = new Date().toISOString();
  const stmts = [];
  if (!cur.meta) {
    stmts.push(db.prepare(
      `INSERT OR IGNORE INTO store_row_meta (doc_key, epoch, rev, doc_ts, floor_rev, mode, audit_ok, audit_bad, updated_at) VALUES (?1, ?2, 0, '', 0, ${ROW_SYNC_MODE_DEFAULT}, 0, 0, ?3)`
    ).bind(ROW_SYNC_DOC_KEY, newEpoch(), nowIso));
  }
  stmts.push(db.prepare(
    'UPDATE store_row_meta SET rev = rev + 1, doc_ts = ?2, updated_at = ?3 WHERE doc_key = ?1 AND rev = ?4 AND doc_ts = ?5'
  ).bind(ROW_SYNC_DOC_KEY, anchor, nowIso, seenRev, seenAnchor));
  stmts.push(...indexWriteStmts(db, lines, anchor, seenRev + 1));
  stmts.push(...pruneStmts(db, anchor, seenRev + 1));
  await db.batch(stmts);
  cur = await readBoth();
  return (cur.meta && cur.meta.doc_ts === anchor) ? cur : null;
}

// Writer side, step 1 (before the guards touch anything): hashes of the document as stored, taken only while the
// index describes exactly that text. Null means "leave the index alone": the next reader rebuilds it.
export async function beginRowIndexPatch(db, storedDoc, headRow) {
  const currentTs = headRow ? String(headRow.updated_at || '') : '';
  if (!db || !storedDoc || typeof storedDoc !== 'object' || !currentTs) return null;
  const meta = await readRowMeta(db);
  // The stamp and the length first: an index that is behind on those needs no SHA-256 to be told so.
  if (!meta || !meta.doc_ts.startsWith(anchorPrefix(currentTs, String(headRow.payload_json || '')))) return null;
  const anchor = await docAnchorOf(headRow);
  if (!anchor || meta.doc_ts !== anchor) return null;
  return { hashes: hashesOfLines(collectRowLines(storedDoc)), rev: meta.rev, anchor };
}

// Writer side, step 2 (after the head row took `newText` under `newTs`): one batch that moves the index and its
// anchor together, at a revision of its own. The meta row carries the anchor this save started from (the usual case)
// or already the new one (a reader rebuilt the index between this save's head row and here): either way the revision
// goes up by one and this save's entries are written at it, so a device that read in between is still handed them.
// If the meta row carries anything else (another save went first, the index was already behind) the batch writes
// nothing and the anchor stays behind for the next reader.
export async function finishRowIndexPatch(db, begun, storedNextDoc, newTs, newText) {
  if (!db || !begun || !storedNextDoc || !newTs || typeof newText !== 'string') return false;
  const newAnchor = await anchorOfText(newTs, newText);
  if (!newAnchor) return false;
  const lines = diffLines(begun.hashes, collectRowLines(storedNextDoc));
  const stmts = [
    db.prepare(
      'UPDATE store_row_meta SET rev = rev + 1, doc_ts = ?2, updated_at = ?3 WHERE doc_key = ?1 AND (doc_ts = ?4 OR doc_ts = ?2)'
    ).bind(ROW_SYNC_DOC_KEY, newAnchor, new Date().toISOString(), begun.anchor),
    ...indexWriteStmts(db, lines, newAnchor),
    ...pruneStmts(db, newAnchor, begun.rev + 1)
  ];
  await db.batch(stmts);
  return true;
}

// A device's report of comparing its rebuilt copy with the whole document sent in the same answer. The caller hands
// in reports from sessions that see the whole store only: one failed report switches partial answers off for every
// device, so a company-scoped or kiosk seat must not be able to write one (or to end the comparisons early).
export async function noteRowAuditResult(db, result, meta) {
  if (!db || !meta || !result || typeof result !== 'object') return;
  if (String(result.epoch || '') !== meta.epoch) return;
  if (result.ok === true) {
    await db.prepare('UPDATE store_row_meta SET audit_ok = audit_ok + 1 WHERE doc_key = ?1 AND epoch = ?2')
      .bind(ROW_SYNC_DOC_KEY, meta.epoch).run();
    return;
  }
  if (result.ok === false) {
    const note = JSON.stringify({
      at: new Date().toISOString(),
      rev: Number(result.rev) || 0,
      rows: Number(result.rows) || 0,
      bad: Number(result.bad) || 0,
      sample: String(result.sample || '').slice(0, 200)
    });
    await db.prepare('UPDATE store_row_meta SET audit_bad = audit_bad + 1, audit_note = ?3 WHERE doc_key = ?1 AND epoch = ?2')
      .bind(ROW_SYNC_DOC_KEY, meta.epoch, note).run();
  }
}
