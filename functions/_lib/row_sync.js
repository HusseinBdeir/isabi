// Row sync (store-size plan step 2, stage A): a device fetches only the entries that changed since its last sync.
//
// The stored document (edge_kv_store `mfg_web_store` head + parts) stays the master copy in this stage. Beside it:
//   store_row_index   one line per entry: row set, id, content hash, the revision it last changed at, deleted flag
//   store_row_meta    one line per document: epoch, revision counter, the document stamp the index describes
//
// The rule everything hangs on: the index describes the document only while store_row_meta.doc_ts equals the head
// row's updated_at. A writer that knows the index moves both in one batch (indexAfterPatch). A writer that does not
// (the top-up's direct D1 write, a sub-document patch, a rollback after a failed mirror, an older server) leaves the
// two stamps apart, and the next reader rebuilds the index from the document by content hash
// (ensureRowIndexCurrent). So the index can lag, but it can never silently disagree with the document.
//
// Nothing here decides what a seat may see: the caller passes the document already scoped for the session, and a
// changed entry that is not in that scoped document is reported as gone (id only).

export const ROW_SYNC_DOC_KEY = 'mfg_web_store';
// More changed entries than this since the device's revision: send the whole document instead.
export const ROW_SYNC_MAX_DELTA_ROWS = 1500;
// Deleted-entry lines are kept for this many revisions; a device further behind gets the whole document.
export const ROW_SYNC_TOMBSTONE_KEEP_REVS = 5000;
// Devices compare their rebuilt copy with the whole document until this many comparisons came back clean.
export const ROW_SYNC_AUDIT_TARGET = 150;
// A device is asked for its first comparison after this many partial answers in one page session.
export const ROW_SYNC_AUDIT_AFTER = 3;
const INDEX_WRITE_CHUNK = 400;
const KIOSK_PUNCH_SET = 'kp';

const SCHEMA_STMTS = [
  `CREATE TABLE IF NOT EXISTS store_row_index (
     doc_key TEXT NOT NULL,
     bucket TEXT NOT NULL,
     row_id TEXT NOT NULL,
     hash TEXT NOT NULL DEFAULT '',
     rev INTEGER NOT NULL DEFAULT 0,
     deleted INTEGER NOT NULL DEFAULT 0,
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

function cyrb53(str, seed) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

// Length plus two independent 53-bit hashes of the text: a change detector, not a security boundary.
export function hashText(str) {
  const s = typeof str === 'string' ? str : '';
  return `${s.length.toString(36)}.${cyrb53(s, 0).toString(36)}.${cyrb53(s, 0x9e3779b1).toString(36)}`;
}

export function hashJson(val) {
  let s = '';
  try { s = JSON.stringify(val === undefined ? null : val); } catch (_) { s = ''; }
  return hashText(s === undefined ? '' : s);
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

function idxKey(setName, rid) {
  return `${setName}\n${rid}`;
}

// "set\nid" -> content hash, for every keyed entry of the document as stored.
export function collectRowHashes(doc) {
  const out = new Map();
  for (const [setName, m] of collectRowMaps(doc)) {
    for (const [rid, r] of m) out.set(idxKey(setName, rid), hashJson(r));
  }
  return out;
}

export function rowCountsOf(doc) {
  const counts = {};
  for (const [setName, m] of collectRowMaps(doc)) counts[setName] = m.size;
  return counts;
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

// What scoping reads from a session. A device whose answer carries another signature starts again from the whole
// document, so a seat whose companies or role changed never keeps entries it may no longer see.
export function sessionScopeSig(session) {
  const s = (session && typeof session === 'object') ? session : {};
  return hashJson([
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

export function rowSyncServing(meta) {
  return Boolean(meta && Number(meta.mode) !== 0 && !(Number(meta.audit_bad) > 0));
}

function splitSetName(setName) {
  if (setName === KIOSK_PUNCH_SET) return { kind: 'kioskPunches', table: '' };
  if (typeof setName === 'string' && setName.startsWith('cr:')) return { kind: 'customRecords', table: setName.slice(3) };
  return null;
}

// The partial answer: changed entries the session can see, ids that are gone for it, and the top-level parts whose
// hash differs from what the device holds. `changed` is [{bucket, row_id, deleted}] newest revision first.
export function buildRowDelta(scopedDoc, changed, reqTopEtags, baseRev, nowTopEtags = null) {
  const maps = collectRowMaps(scopedDoc);
  const rows = { customRecords: {}, kioskPunches: [] };
  const gone = { customRecords: {}, kioskPunches: [] };
  for (const ch of (Array.isArray(changed) ? changed : [])) {
    const parts = splitSetName(String(ch.bucket || ''));
    const rid = String(ch.row_id || '');
    if (!parts || !rid) continue;
    const m = maps.get(String(ch.bucket));
    const row = (!Number(ch.deleted) && m) ? m.get(rid) : undefined;
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
    base: Number(baseRev) || 0,
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

// Edit history (`_pre_void_orig`, `_pre_void_edits`) is read on a device in one place only: the Void Log, for voided
// entries. So a voided entry travels whole and a live entry travels without its history; the stored document keeps
// both, and the history comes back with the entry the moment it is voided.
function elideTrailRow(r, keepWhole) {
  if (!hasTrail(r) || r.voided || (keepWhole && keepWhole(r))) return r;
  const c = Object.assign({}, r);
  delete c._pre_void_orig;
  delete c._pre_void_edits;
  return c;
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
    'SELECT bucket, row_id, rev, deleted FROM store_row_index WHERE doc_key = ?1 AND rev > ?2 ORDER BY rev DESC, bucket ASC, row_id ASC LIMIT ?3'
  ).bind(ROW_SYNC_DOC_KEY, sinceRev, ROW_SYNC_MAX_DELTA_ROWS + 1);
}

function normMeta(m) {
  if (!m) return null;
  return {
    epoch: String(m.epoch || ''),
    rev: Number(m.rev || 0),
    doc_ts: String(m.doc_ts || ''),
    floor_rev: Number(m.floor_rev || 0),
    mode: Number(m.mode === undefined || m.mode === null ? 2 : m.mode),
    audit_ok: Number(m.audit_ok || 0),
    audit_bad: Number(m.audit_bad || 0)
  };
}

export async function readRowMeta(db) {
  return normMeta(await metaStmt(db).first());
}

// Statements that apply [[set, id, hash, deleted]] lines at the revision the meta row holds, only while the meta row
// carries `docTs` (and, when `rev` is given, that revision), so a batch that lost its turn writes nothing.
function indexWriteStmts(db, lines, docTs, rev = null) {
  const stmts = [];
  const revCond = rev === null ? '' : ' AND m.rev = ?4';
  for (let i = 0; i < lines.length; i += INDEX_WRITE_CHUNK) {
    const chunk = JSON.stringify(lines.slice(i, i + INDEX_WRITE_CHUNK));
    const st = db.prepare(
      `INSERT INTO store_row_index (doc_key, bucket, row_id, hash, rev, deleted)
       SELECT ?1, json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]'), json_extract(j.value, '$[2]'), m.rev, json_extract(j.value, '$[3]')
       FROM json_each(?2) AS j, store_row_meta AS m
       WHERE m.doc_key = ?1 AND m.doc_ts = ?3${revCond}
       ON CONFLICT(doc_key, bucket, row_id) DO UPDATE SET hash = excluded.hash, rev = excluded.rev, deleted = excluded.deleted`
    );
    stmts.push(rev === null ? st.bind(ROW_SYNC_DOC_KEY, chunk, docTs) : st.bind(ROW_SYNC_DOC_KEY, chunk, docTs, rev));
  }
  return stmts;
}

// Deleted-entry lines older than the keep window go, and the floor a device's revision must reach moves up with them.
function pruneStmts(db, docTs, rev) {
  const floor = rev - ROW_SYNC_TOMBSTONE_KEEP_REVS;
  if (floor <= 0) return [];
  return [
    db.prepare(
      `DELETE FROM store_row_index WHERE doc_key = ?1 AND deleted = 1 AND rev < ?2
       AND EXISTS (SELECT 1 FROM store_row_meta m WHERE m.doc_key = ?1 AND m.doc_ts = ?3 AND m.rev >= ?4)`
    ).bind(ROW_SYNC_DOC_KEY, floor, docTs, rev),
    db.prepare(
      'UPDATE store_row_meta SET floor_rev = ?2 WHERE doc_key = ?1 AND doc_ts = ?3 AND rev >= ?4 AND floor_rev < ?2'
    ).bind(ROW_SYNC_DOC_KEY, floor, docTs, rev)
  ];
}

function diffLines(prevHashes, nextHashes) {
  const lines = [];
  for (const [key, h] of nextHashes) {
    if (prevHashes.get(key) !== h) {
      const cut = key.indexOf('\n');
      lines.push([key.slice(0, cut), key.slice(cut + 1), h, 0]);
    }
  }
  for (const key of prevHashes.keys()) {
    if (!nextHashes.has(key)) {
      const cut = key.indexOf('\n');
      lines.push([key.slice(0, cut), key.slice(cut + 1), '', 1]);
    }
  }
  return lines;
}

async function readHeadTs(db) {
  const r = await db.prepare('SELECT updated_at FROM edge_kv_store WHERE doc_key = ?1').bind(ROW_SYNC_DOC_KEY).first();
  return r ? String(r.updated_at || '') : null;
}

// Reader side. Returns { meta, changed } for the document read at `headTs` (`changed` only when `sinceRev` is a
// number: entries whose revision is above it, newest first, null when there are too many), or null when the index
// cannot be brought in line with that read (the document moved on meanwhile, or the tables are unavailable).
export async function ensureRowIndexCurrent(db, storedDoc, headTs, sinceRev = null) {
  if (!db || !storedDoc || typeof storedDoc !== 'object' || !headTs) return null;
  await ensureRowSyncSchema(db);
  const wantChanged = Number.isInteger(sinceRev) && sinceRev >= 0;
  const readBoth = async () => {
    if (!wantChanged) return { meta: normMeta(await metaStmt(db).first()), changed: null };
    const res = await db.batch([metaStmt(db), changedStmt(db, sinceRev)]);
    const metaRow = res && res[0] && Array.isArray(res[0].results) ? res[0].results[0] : null;
    const list = res && res[1] && Array.isArray(res[1].results) ? res[1].results : [];
    return { meta: normMeta(metaRow), changed: list.length > ROW_SYNC_MAX_DELTA_ROWS ? null : list };
  };
  let cur = await readBoth();
  if (cur.meta && cur.meta.doc_ts === headTs) return cur;

  // The stamps are apart. Rebuild only from a read that is still the live document.
  if ((await readHeadTs(db)) !== headTs) return null;
  const seenRev = cur.meta ? cur.meta.rev : 0;
  const seenTs = cur.meta ? cur.meta.doc_ts : '';
  const nextHashes = collectRowHashes(storedDoc);
  const prevHashes = new Map();
  const idxRows = await db.prepare(
    'SELECT bucket, row_id, hash FROM store_row_index WHERE doc_key = ?1 AND deleted = 0'
  ).bind(ROW_SYNC_DOC_KEY).all();
  for (const ir of (idxRows.results || [])) prevHashes.set(idxKey(String(ir.bucket), String(ir.row_id)), String(ir.hash || ''));
  const lines = diffLines(prevHashes, nextHashes);
  const nowIso = new Date().toISOString();
  const stmts = [];
  if (!cur.meta) {
    stmts.push(db.prepare(
      "INSERT OR IGNORE INTO store_row_meta (doc_key, epoch, rev, doc_ts, floor_rev, mode, audit_ok, audit_bad, updated_at) VALUES (?1, ?2, 0, '', 0, 2, 0, 0, ?3)"
    ).bind(ROW_SYNC_DOC_KEY, newEpoch(), nowIso));
  }
  stmts.push(db.prepare(
    'UPDATE store_row_meta SET rev = rev + 1, doc_ts = ?2, updated_at = ?3 WHERE doc_key = ?1 AND rev = ?4 AND doc_ts = ?5'
  ).bind(ROW_SYNC_DOC_KEY, headTs, nowIso, seenRev, seenTs));
  stmts.push(...indexWriteStmts(db, lines, headTs, seenRev + 1));
  stmts.push(...pruneStmts(db, headTs, seenRev + 1));
  await db.batch(stmts);
  cur = await readBoth();
  return (cur.meta && cur.meta.doc_ts === headTs) ? cur : null;
}

// Writer side, step 1 (before the guards touch anything): hashes of the document as stored, taken only while the
// index describes exactly that document. Null means "leave the index alone": the next reader rebuilds it.
export async function beginRowIndexPatch(db, storedDoc, currentTs) {
  if (!db || !storedDoc || typeof storedDoc !== 'object' || !currentTs) return null;
  const meta = await readRowMeta(db);
  if (!meta || meta.doc_ts !== currentTs) return null;
  return { hashes: collectRowHashes(storedDoc), rev: meta.rev, currentTs };
}

// Writer side, step 2 (after the head row moved from `currentTs` to `newTs`): one batch that moves the index and its
// stamp together, at a revision of its own. The meta row carries `currentTs` (the usual case) or already `newTs` (a
// reader rebuilt the index between this save's head row and here): either way the revision goes up by one and this
// save's entries are written at it, so a device that read in between is still handed them. If the meta row carries
// anything else (another save went first, the index was already behind) the batch writes nothing and the stamps stay
// apart for the next reader.
export async function finishRowIndexPatch(db, begun, storedNextDoc, newTs) {
  if (!db || !begun || !storedNextDoc || !newTs) return false;
  const lines = diffLines(begun.hashes, collectRowHashes(storedNextDoc));
  const stmts = [
    db.prepare(
      'UPDATE store_row_meta SET rev = rev + 1, doc_ts = ?2, updated_at = ?3 WHERE doc_key = ?1 AND (doc_ts = ?4 OR doc_ts = ?2)'
    ).bind(ROW_SYNC_DOC_KEY, newTs, new Date().toISOString(), begun.currentTs),
    ...indexWriteStmts(db, lines, newTs),
    ...pruneStmts(db, newTs, begun.rev + 1)
  ];
  await db.batch(stmts);
  return true;
}

// A device's report of comparing its rebuilt copy with the whole document sent in the same answer.
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
