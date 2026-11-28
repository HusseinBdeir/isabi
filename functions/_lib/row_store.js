// Row store (store-size plan step 2, stage B): the Manufacturing store kept one entry per row, so a save writes the
// entries that changed instead of the whole document.
//
// Two tables beside edge_kv_store (schema in row_sync.js):
//   store_rows         one line per piece of the document: an entry of a keyed row set, a top-level part, or the
//                      marker of a row set. `ord` keeps the order, `hash` the content hash, `json` the exact JSON text.
//   store_rows_state   one line per document: the switch (`mode`), the anchor of the stored text the lines describe
//                      (`rows_ts`), the self-check counters, and what the Owner notice reads.
//
// The lines are an exact form of the document: assembleText(linesOfDoc(doc)) === JSON.stringify(doc), key order and
// entry order included, for any document. A row set that cannot be keyed by id (an entry without an id, an id twice,
// something that is not a plain object) is stored whole, so nothing is ever approximated.
//
// Who is the master is decided by one thing only: what the head row of edge_kv_store holds.
//   * JSON text (head + __part_ rows): the document is the master, as before. While `mode` is 1 every save also brings
//     the lines in step with the text it stored (syncShadowRows) and a self-check reads them back and compares the
//     assembled text with the stored text, byte for byte (checkShadowRows). Nothing reads the lines for an answer.
//   * A commit record (ROWS_HEAD_PREFIX, never valid JSON): the lines are the master. The record carries the number
//     of lines and a digest of them; a save moves the head row, the changed lines and nothing else in one D1 batch
//     (one transaction), and a read that finds lines at odds with the record reports the store unreadable instead of
//     guessing. Only cutoverToRows writes the first record, and only after a full comparison passed.
//
// Falling back is always the old behaviour: any writer that puts JSON text back at the head (an older server, a build
// script's staged swap, restoreDocumentMaster, or this module when a save cannot be held exactly) makes the document
// the master again from that text, and the next save brings the lines in step with it. So a document at the head
// always wins, and nothing here can leave the store in a state the older code cannot read once it wrote to it.
// The one thing an older server cannot do is READ a commit record: restore the document (restoreDocumentMaster)
// before rolling the server back past this change.

import { ROW_SYNC_DOC_KEY, anchorOfText, ensureRowSyncSchema, hashPair, hashText, rowIdOf } from './row_sync.js';

export const ROWS_HEAD_PREFIX = '#isabi-rows-master ';
// store_rows_state.mode: 0 the lines are left alone, 1 every save keeps them in step (the default).
export const ROW_STORE_MODE_DEFAULT = 1;
// Every save is checked until this many checks came back clean; after that about one save in ROW_STORE_CHECK_EVERY.
export const ROW_STORE_CHECK_TARGET = 300;
export const ROW_STORE_CHECK_EVERY = 20;

const B_TOP = '@top';
const B_CR = '@cr';
const B_KP = 'kp';
const KIND_ROW = 0;     // an entry of a keyed row set
const KIND_VALUE = 1;   // a value stored whole (a top-level part, or a row set that cannot be keyed by id)
const KIND_SET = 2;     // the marker of a row set whose entries are lines of their own
const ORD_STRIDE = 1024;
const WRITE_CHUNK_LINES = 300;
const WRITE_CHUNK_CHARS = 400000;
const KEY_SEP = '\u0000';

function isPlainObj(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function crBucket(table) {
  return `cr:${table}`;
}

function lineKey(bucket, id) {
  return `${bucket}${KEY_SEP}${id}`;
}

// ---- the document as lines ------------------------------------------------------------------------------------------

// [[id, JSON text]] when the list can be keyed by id (every element a plain object with an id of its own), else null.
function exactRowsOf(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  const seen = new Set();
  for (const r of list) {
    const rid = rowIdOf(r);
    if (!rid || seen.has(rid)) return null;
    const js = JSON.stringify(r);
    if (typeof js !== 'string') return null;
    seen.add(rid);
    out.push([rid, js]);
  }
  return out;
}

// The document as lines, in document order: [{ b: bucket, id, k: kind, json, h: hash }].
export function linesOfDoc(doc) {
  const out = [];
  if (!isPlainObj(doc)) return out;
  const push = (b, id, k, json) => out.push({ b, id, k, json, h: hashText(json) });
  for (const key of Object.keys(doc)) {
    const v = doc[key];
    if (key === 'customRecords' && isPlainObj(v)) {
      push(B_TOP, key, KIND_SET, '');
      for (const t of Object.keys(v)) {
        const ex = exactRowsOf(v[t]);
        if (ex) {
          push(B_CR, t, KIND_SET, '');
          const b = crBucket(t);
          for (const [rid, js] of ex) push(b, rid, KIND_ROW, js);
        } else {
          const js = JSON.stringify(v[t]);
          if (typeof js === 'string') push(B_CR, t, KIND_VALUE, js);
        }
      }
      continue;
    }
    if (key === 'kioskPunches') {
      const ex = exactRowsOf(v);
      if (ex) {
        push(B_TOP, key, KIND_SET, '');
        for (const [rid, js] of ex) push(B_KP, rid, KIND_ROW, js);
        continue;
      }
    }
    const js = JSON.stringify(v);
    if (typeof js === 'string') push(B_TOP, key, KIND_VALUE, js);
  }
  return out;
}

// The JSON text of the document the lines stand for. `lines` holds each bucket's lines in order (any order between
// buckets): what linesOfDoc returns, or stored lines after sortStoredLines.
export function assembleText(lines) {
  const byBucket = new Map();
  for (const ln of lines) {
    let list = byBucket.get(ln.b);
    if (!list) { list = []; byBucket.set(ln.b, list); }
    list.push(ln);
  }
  const rowsText = bucket => {
    const list = byBucket.get(bucket) || [];
    const parts = new Array(list.length);
    for (let i = 0; i < list.length; i++) parts[i] = list[i].json;
    return `[${parts.join(',')}]`;
  };
  const tops = byBucket.get(B_TOP) || [];
  const topParts = [];
  for (const t of tops) {
    let val = t.json;
    if (t.k === KIND_SET) {
      if (t.id === 'kioskPunches') {
        val = rowsText(B_KP);
      } else {
        const tabs = byBucket.get(B_CR) || [];
        const tabParts = [];
        for (const c of tabs) {
          tabParts.push(`${JSON.stringify(c.id)}:${c.k === KIND_SET ? rowsText(crBucket(c.id)) : c.json}`);
        }
        val = `{${tabParts.join(',')}}`;
      }
    }
    topParts.push(`${JSON.stringify(t.id)}:${val}`);
  }
  return `{${topParts.join(',')}}`;
}

// Stored rows ({bucket,row_id,kind,ord,hash,json}) as lines, each bucket in its stored order.
export function sortStoredLines(rows) {
  const lines = (rows || []).map(r => ({
    b: String(r.bucket),
    id: String(r.row_id),
    k: Number(r.kind || 0),
    ord: Number(r.ord || 0),
    h: String(r.hash || ''),
    json: r.json === undefined || r.json === null ? '' : String(r.json)
  }));
  lines.sort((x, y) => (x.b < y.b ? -1 : x.b > y.b ? 1 : (x.ord - y.ord) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)));
  return lines;
}

// Number of lines and a digest of them (bucket, id, kind, order, content hash), whatever order they come in.
export function digestOfLines(lineMap) {
  let x1 = 0;
  let x2 = 0;
  let n = 0;
  for (const [key, v] of lineMap) {
    const p = hashPair(`${key}${KEY_SEP}${v.k}${KEY_SEP}${v.ord}${KEY_SEP}${v.h}`);
    x1 ^= p[0];
    x2 ^= p[1];
    n += 1;
  }
  return { n, x: `${(x1 >>> 0).toString(36)}.${(x2 >>> 0).toString(36)}` };
}

// Map(line key -> { k, ord, h }) of stored lines (as sortStoredLines returns them).
function lineMapOf(lines, recomputeHash = false) {
  const m = new Map();
  for (const ln of lines) m.set(lineKey(ln.b, ln.id), { k: ln.k, ord: ln.ord, h: recomputeHash ? hashText(ln.json) : ln.h });
  return m;
}

// ---- order ----------------------------------------------------------------------------------------------------------

// The order number of every id of one bucket, keeping the stored numbers wherever the stored lines already come in
// the wanted order (an added entry then costs one line, at the front, at the end or in a gap). Otherwise the bucket
// is numbered afresh.
export function planOrds(ids, oldOrd) {
  const out = new Map();
  let ok = true;
  let last = null;
  for (const id of ids) {
    const o = oldOrd.get(id);
    if (o === undefined) continue;
    if (!Number.isSafeInteger(o) || (last !== null && o <= last)) { ok = false; break; }
    last = o;
  }
  if (ok) {
    let prev = null;
    let pending = [];
    const flush = nextOrd => {
      const n = pending.length;
      if (!n) return true;
      if (prev === null && nextOrd === null) {
        for (let i = 0; i < n; i++) out.set(pending[i], i * ORD_STRIDE);
      } else if (prev === null) {
        for (let i = 0; i < n; i++) out.set(pending[i], nextOrd - ORD_STRIDE * (n - i));
      } else if (nextOrd === null) {
        for (let i = 0; i < n; i++) out.set(pending[i], prev + ORD_STRIDE * (i + 1));
      } else {
        const step = Math.floor((nextOrd - prev) / (n + 1));
        if (step < 1) return false;
        for (let i = 0; i < n; i++) out.set(pending[i], prev + step * (i + 1));
      }
      pending = [];
      return true;
    };
    for (const id of ids) {
      const o = oldOrd.get(id);
      if (o === undefined) { pending.push(id); continue; }
      if (!flush(o)) { ok = false; break; }
      out.set(id, o);
      prev = o;
    }
    if (ok && flush(null)) {
      let safe = true;
      for (const v of out.values()) { if (!Number.isSafeInteger(v)) { safe = false; break; } }
      if (safe) return out;
    }
  }
  out.clear();
  for (let i = 0; i < ids.length; i++) out.set(ids[i], i * ORD_STRIDE);
  return out;
}

// ---- the difference between stored lines and a document -------------------------------------------------------------

// stored: Map(line key -> { k, ord, h }); desired: linesOfDoc(doc).
// Returns the lines to remove, to write (content changed or new), to move (order number only), and the line map after.
export function planLineDiff(stored, desired) {
  const byBucket = new Map();
  for (const ln of desired) {
    let list = byBucket.get(ln.b);
    if (!list) { list = []; byBucket.set(ln.b, list); }
    list.push(ln);
  }
  const oldOrdByBucket = new Map();
  for (const [key, v] of stored) {
    const cut = key.indexOf(KEY_SEP);
    const b = key.slice(0, cut);
    let m = oldOrdByBucket.get(b);
    if (!m) { m = new Map(); oldOrdByBucket.set(b, m); }
    m.set(key.slice(cut + 1), v.ord);
  }
  const next = new Map();
  const put = [];
  const move = [];
  for (const [b, list] of byBucket) {
    const ords = planOrds(list.map(ln => ln.id), oldOrdByBucket.get(b) || new Map());
    for (const ln of list) {
      const key = lineKey(b, ln.id);
      const ord = ords.get(ln.id);
      const cur = stored.get(key);
      next.set(key, { k: ln.k, ord, h: ln.h });
      if (!cur || cur.h !== ln.h || cur.k !== ln.k) put.push([b, ln.id, ln.k, ord, ln.h, ln.json]);
      else if (cur.ord !== ord) move.push([b, ln.id, ord]);
    }
  }
  const del = [];
  for (const key of stored.keys()) {
    if (next.has(key)) continue;
    const cut = key.indexOf(KEY_SEP);
    del.push([key.slice(0, cut), key.slice(cut + 1)]);
  }
  return { del, put, move, next };
}

// ---- D1 -------------------------------------------------------------------------------------------------------------

function chunksOf(items, sizeOf) {
  const out = [];
  let cur = [];
  let chars = 0;
  for (const it of items) {
    const sz = sizeOf(it);
    if (cur.length && (cur.length >= WRITE_CHUNK_LINES || chars + sz > WRITE_CHUNK_CHARS)) {
      out.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(it);
    chars += sz;
  }
  if (cur.length) out.push(cur);
  return out;
}

// Statements that apply a planned difference, each one only while `guardSql` holds (it may use ?3 and ?4, bound to
// `g3` and `g4`): the lines move with whatever the guard names, or not at all.
function diffStmts(db, plan, guardSql, g3, g4) {
  const stmts = [];
  const bind = (sql, chunk) => (g4 === undefined
    ? db.prepare(sql).bind(ROW_SYNC_DOC_KEY, JSON.stringify(chunk), g3)
    : db.prepare(sql).bind(ROW_SYNC_DOC_KEY, JSON.stringify(chunk), g3, g4));
  for (const chunk of chunksOf(plan.del, d => d[0].length + d[1].length + 8)) {
    stmts.push(bind(
      `DELETE FROM store_rows WHERE doc_key = ?1 AND ${guardSql}
       AND (bucket, row_id) IN (SELECT json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]') FROM json_each(?2) AS j)`,
      chunk
    ));
  }
  for (const chunk of chunksOf(plan.put, p => p[0].length + p[1].length + p[5].length + 64)) {
    stmts.push(bind(
      `INSERT INTO store_rows (doc_key, bucket, row_id, kind, ord, hash, json)
       SELECT ?1, json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]'), json_extract(j.value, '$[2]'),
              json_extract(j.value, '$[3]'), json_extract(j.value, '$[4]'), json_extract(j.value, '$[5]')
       FROM json_each(?2) AS j
       WHERE ${guardSql}
       ON CONFLICT(doc_key, bucket, row_id) DO UPDATE SET
         kind = excluded.kind, ord = excluded.ord, hash = excluded.hash, json = excluded.json`,
      chunk
    ));
  }
  for (const chunk of chunksOf(plan.move, m => m[0].length + m[1].length + 24)) {
    stmts.push(bind(
      `INSERT INTO store_rows (doc_key, bucket, row_id, ord)
       SELECT ?1, json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]'), json_extract(j.value, '$[2]')
       FROM json_each(?2) AS j
       WHERE ${guardSql}
         AND EXISTS (SELECT 1 FROM store_rows r WHERE r.doc_key = ?1 AND r.bucket = json_extract(j.value, '$[0]')
                     AND r.row_id = json_extract(j.value, '$[1]'))
       ON CONFLICT(doc_key, bucket, row_id) DO UPDATE SET ord = excluded.ord`,
      chunk
    ));
  }
  return stmts;
}

function stateStmt(db) {
  return db.prepare(
    `SELECT mode, master, rows_ts, rows_ok, rows_bad, rows_note, checked_at, apply_bad, apply_at, fell_back_at, master_at
     FROM store_rows_state WHERE doc_key = ?1`
  ).bind(ROW_SYNC_DOC_KEY);
}

function ensureStateStmt(db) {
  return db.prepare('INSERT OR IGNORE INTO store_rows_state (doc_key, updated_at) VALUES (?1, ?2)')
    .bind(ROW_SYNC_DOC_KEY, new Date().toISOString());
}

function linesStmt(db, withJson) {
  return db.prepare(
    `SELECT bucket, row_id, kind, ord, hash${withJson ? ', json' : ''} FROM store_rows WHERE doc_key = ?1`
  ).bind(ROW_SYNC_DOC_KEY);
}

function headStmt(db) {
  return db.prepare('SELECT payload_json, updated_at, rev FROM edge_kv_store WHERE doc_key = ?1').bind(ROW_SYNC_DOC_KEY);
}

function normState(s) {
  if (!s) return null;
  return {
    mode: Number(s.mode === undefined || s.mode === null ? ROW_STORE_MODE_DEFAULT : s.mode),
    master: Number(s.master || 0),
    rows_ts: String(s.rows_ts || ''),
    rows_ok: Number(s.rows_ok || 0),
    rows_bad: Number(s.rows_bad || 0),
    rows_note: s.rows_note ? String(s.rows_note) : '',
    checked_at: s.checked_at ? String(s.checked_at) : '',
    apply_bad: Number(s.apply_bad || 0),
    apply_at: s.apply_at ? String(s.apply_at) : '',
    fell_back_at: s.fell_back_at ? String(s.fell_back_at) : '',
    master_at: s.master_at ? String(s.master_at) : ''
  };
}

function resultsOf(res, i) {
  return (res && res[i] && Array.isArray(res[i].results)) ? res[i].results : [];
}

export async function readRowStoreState(db) {
  if (!db) return null;
  return normState(await stateStmt(db).first());
}

// ---- the document is the master: lines kept in step ------------------------------------------------------------------

// Brings the lines in step with the document just stored (`text` under stamp `ts`; `desired` = linesOfDoc of the
// object that text was made from, taken when it was made). One batch, applied only while the lines are still the
// ones the difference was planned against. Never a reason to fail a save: lines left behind are brought in step by
// the next save.
// Returns { state, anchor, synced } or null when the lines are switched off.
export async function syncShadowRows(db, desired, ts, text) {
  if (!db || !Array.isArray(desired) || !ts || typeof text !== 'string') return null;
  await ensureRowSyncSchema(db);
  const res = await db.batch([ensureStateStmt(db), stateStmt(db), linesStmt(db, false)]);
  const state = normState(resultsOf(res, 1)[0]);
  if (!state || state.mode !== 1) return null;
  const anchor = await anchorOfText(ts, text);
  if (!anchor) return null;
  const stored = lineMapOf(sortStoredLines(resultsOf(res, 2)));
  const plan = planLineDiff(stored, desired);
  const nowIso = new Date().toISOString();
  const guard = 'EXISTS (SELECT 1 FROM store_rows_state s WHERE s.doc_key = ?1 AND s.rows_ts = ?3)';
  const stmts = diffStmts(db, plan, guard, state.rows_ts);
  // A document written while the lines were thought to be the master: the store fell back to the document.
  stmts.push(db.prepare(
    `UPDATE store_rows_state SET rows_ts = ?2, updated_at = ?3,
       fell_back_at = CASE WHEN master = 1 THEN ?3 ELSE fell_back_at END, master = 0
     WHERE doc_key = ?1 AND rows_ts = ?4`
  ).bind(ROW_SYNC_DOC_KEY, anchor, nowIso, state.rows_ts));
  await db.batch(stmts);
  if (state.master === 1) console.error('[row-store] a document was written while the rows were the master: the document is the master again');
  return { state, anchor, synced: true };
}

// Reads the lines back and compares the text they assemble to with the stored text, byte for byte. Counted only while
// the lines still describe that text (`anchor`). Returns 'ok', 'bad' or 'skipped'.
export async function checkShadowRows(db, text, anchor) {
  if (!db || typeof text !== 'string' || !anchor) return 'skipped';
  const res = await db.batch([stateStmt(db), linesStmt(db, true)]);
  const state = normState(resultsOf(res, 0)[0]);
  if (!state || state.rows_ts !== anchor) return 'skipped';
  const lines = sortStoredLines(resultsOf(res, 1));
  const got = assembleText(lines);
  let same = got === text;
  if (!same) {
    // A build script stores the same document in another JSON spelling (spacing, escapes).
    try { same = got === JSON.stringify(JSON.parse(text)); } catch (_) { same = false; }
  }
  const nowIso = new Date().toISOString();
  if (same) {
    await db.prepare(
      'UPDATE store_rows_state SET rows_ok = rows_ok + 1, checked_at = ?2 WHERE doc_key = ?1 AND rows_ts = ?3'
    ).bind(ROW_SYNC_DOC_KEY, nowIso, anchor).run();
    return 'ok';
  }
  let at = 0;
  const lim = Math.min(got.length, text.length);
  while (at < lim && got.charCodeAt(at) === text.charCodeAt(at)) at += 1;
  const note = JSON.stringify({ at: nowIso, lines: lines.length, gotChars: got.length, wantChars: text.length, firstDiff: at });
  console.error(`[row-store] the rows do not assemble to the stored document: ${note}`);
  await db.prepare(
    'UPDATE store_rows_state SET rows_bad = rows_bad + 1, rows_note = ?2, checked_at = ?3 WHERE doc_key = ?1 AND rows_ts = ?4'
  ).bind(ROW_SYNC_DOC_KEY, note, nowIso, anchor).run();
  return 'bad';
}

// After a save while the document is the master: lines in step, then (every save at first, later about one in
// ROW_STORE_CHECK_EVERY) the comparison. Swallows everything: this must never fail or slow a save's answer.
export async function shadowAfterSave(db, desired, ts, text, checkNow = false) {
  try {
    const out = await syncShadowRows(db, desired, ts, text);
    if (!out) return 'off';
    const due = checkNow || out.state.rows_ok < ROW_STORE_CHECK_TARGET || Math.random() * ROW_STORE_CHECK_EVERY < 1;
    return due ? await checkShadowRows(db, text, out.anchor) : 'synced';
  } catch (err) {
    console.error(`[row-store] rows not brought in step: ${String((err && err.message) || err).slice(0, 200)}`);
    return 'failed';
  }
}

// ---- the lines are the master ---------------------------------------------------------------------------------------

export function isRowsHead(payload) {
  return typeof payload === 'string' && payload.startsWith(ROWS_HEAD_PREFIX);
}

function commitRecord(digest, sinceIso) {
  return `${ROWS_HEAD_PREFIX}${JSON.stringify({ v: 1, n: digest.n, x: digest.x, since: sinceIso })}`;
}

function parseCommit(payload) {
  if (!isRowsHead(payload)) return null;
  try {
    const o = JSON.parse(payload.slice(ROWS_HEAD_PREFIX.length));
    return isPlainObj(o) ? o : null;
  } catch (_) {
    return null;
  }
}

// The last commit this isolate read or wrote: a device asks every half minute and the store rarely changed in
// between, so the usual read costs the head row instead of every line.
let _memo = null;

export function forgetRowStoreMemo() {
  _memo = null;
}

function memoFor(head) {
  const m = _memo;
  return (m && m.commit === head.payload_json && m.stamp === String(head.updated_at || '') && m.rev === Number(head.rev || 0)) ? m : null;
}

// Reads the store whose head row is a commit record (`head`: { payload_json, updated_at, rev }).
// Returns { payload_json (the document's JSON text), updated_at, rev, partsInStep, rowsMaster } like a document read;
// `moved: true` when the head no longer holds a commit record (read the document instead); and, when the lines are
// at odds with the record, the record itself as payload_json, which no caller can parse: the store is unreadable.
export async function readRowsMasterDoc(db, head) {
  let h = { payload_json: String(head.payload_json || ''), updated_at: String(head.updated_at || ''), rev: Number(head.rev || 0) };
  let m = memoFor(h);
  if (!m) {
    const res = await db.batch([headStmt(db), linesStmt(db, true)]);
    const h2 = resultsOf(res, 0)[0];
    if (!h2 || !isRowsHead(String(h2.payload_json || ''))) return { moved: true };
    h = { payload_json: String(h2.payload_json), updated_at: String(h2.updated_at || ''), rev: Number(h2.rev || 0) };
    const lines = sortStoredLines(resultsOf(res, 1));
    const lineMap = lineMapOf(lines, true);
    const commit = parseCommit(h.payload_json);
    const dg = digestOfLines(lineMap);
    if (!commit || commit.n !== dg.n || commit.x !== dg.x) {
      console.error(`[row-store] the rows are at odds with their commit record (${dg.n} lines, record says ${commit ? commit.n : 'nothing'})`);
      return { payload_json: h.payload_json, updated_at: h.updated_at, rev: h.rev, partsInStep: false, rowsMaster: true, rowsDamaged: true };
    }
    m = { commit: h.payload_json, stamp: h.updated_at, rev: h.rev, text: assembleText(lines), lines: lineMap };
    _memo = m;
  }
  return { payload_json: m.text, updated_at: m.stamp, rev: m.rev, partsInStep: true, rowsMaster: true };
}

// Writes the document `jsonStr` (stamp `updatedAt`) to a store whose head row is a commit record: the head row and
// the changed lines in one batch. `cas`: { updatedAt } the stamp the caller read, or null for a writer that takes the
// store as it stands (it is then retried when another save lands first).
// Returns null when the head row holds a document (the caller writes it the old way), { ok, conflict, rowsMaster }
// otherwise, or { fallback: true } when the lines cannot hold this text exactly: the caller then writes the document
// the old way, which makes the document the master again.
export async function writeRowsMasterDoc(db, jsonStr, updatedAt, updatedBy, cas = null, docObj = null) {
  if (!db || typeof jsonStr !== 'string') return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const head0 = await headStmt(db).first();
    if (!head0 || !isRowsHead(String(head0.payload_json || ''))) return null;
    const head = { payload_json: String(head0.payload_json), updated_at: String(head0.updated_at || ''), rev: Number(head0.rev || 0) };
    if (cas && String(cas.updatedAt || '') !== head.updated_at) return { ok: false, conflict: true, rowsMaster: true };
    let doc = docObj;
    if (!isPlainObj(doc)) {
      try { doc = JSON.parse(jsonStr); } catch (_) { doc = null; }
    }
    if (!isPlainObj(doc)) return { fallback: true };
    const desired = linesOfDoc(doc);
    if (assembleText(desired) !== jsonStr) return { fallback: true };
    const m = memoFor(head);
    const stored = m ? m.lines : lineMapOf(sortStoredLines((await linesStmt(db, false).all()).results || []));
    const plan = planLineDiff(stored, desired);
    const prevCommit = parseCommit(head.payload_json);
    const newCommit = commitRecord(digestOfLines(plan.next), String((prevCommit && prevCommit.since) || new Date().toISOString()));
    const newRev = head.rev + 1;
    const stmts = [
      db.prepare(
        `UPDATE edge_kv_store SET payload_json = ?2, updated_at = ?3, updated_by = ?4, rev = ?5
         WHERE doc_key = ?1 AND updated_at = ?6 AND rev = ?7 AND payload_json = ?8`
      ).bind(ROW_SYNC_DOC_KEY, newCommit, String(updatedAt), String(updatedBy || ''), newRev, head.updated_at, head.rev, head.payload_json),
      ...diffStmts(
        db, plan,
        'EXISTS (SELECT 1 FROM edge_kv_store h WHERE h.doc_key = ?1 AND h.rev = ?3 AND h.payload_json = ?4)',
        newRev, newCommit
      )
    ];
    const res = await db.batch(stmts);
    let landed = res && res[0] && res[0].meta && typeof res[0].meta.changes === 'number' ? res[0].meta.changes > 0 : null;
    if (landed === null) {
      const now = await headStmt(db).first();
      landed = Boolean(now && String(now.payload_json || '') === newCommit && Number(now.rev || 0) === newRev);
    }
    if (landed) {
      _memo = { commit: newCommit, stamp: String(updatedAt), rev: newRev, text: jsonStr, lines: plan.next };
      return { ok: true, conflict: false, rowsMaster: true };
    }
    // Another save landed between the head read and the batch.
    if (cas) return { ok: false, conflict: true, rowsMaster: true };
  }
  return { ok: false, conflict: true, rowsMaster: true };
}

// The store fell back to the document while the lines were the master (a save the lines could not hold exactly).
export async function noteRowsFellBack(db, why) {
  try {
    const nowIso = new Date().toISOString();
    console.error(`[row-store] the document is the master again: ${why}`);
    await db.batch([
      ensureStateStmt(db),
      db.prepare(
        'UPDATE store_rows_state SET master = 0, fell_back_at = ?2, rows_note = ?3, updated_at = ?2 WHERE doc_key = ?1'
      ).bind(ROW_SYNC_DOC_KEY, nowIso, JSON.stringify({ at: nowIso, why: String(why || '').slice(0, 200) }))
    ]);
  } catch (_) {}
  _memo = null;
}

// ---- switching the master -------------------------------------------------------------------------------------------

// Makes the lines the master. `docRow` is the document as read ({ payload_json, updated_at, rev, partsInStep }).
// Refused unless the lines are in step with exactly that text and assemble to it byte for byte, read back here.
// One batch: the head row becomes the commit record and the __part_ rows go, only while the head row and the lines
// are still the ones compared.
export async function cutoverToRows(db, docRow) {
  if (!db || !docRow) return { ok: false, error: 'no stored document' };
  if (isRowsHead(String(docRow.payload_json || '')) || docRow.rowsMaster) return { ok: false, error: 'the rows are already the master' };
  if (docRow.partsInStep === false) return { ok: false, error: 'the stored document is mid-write; try again' };
  const text = String(docRow.payload_json || '');
  let doc = null;
  try { doc = JSON.parse(text); } catch (_) { doc = null; }
  if (!isPlainObj(doc)) return { ok: false, error: 'the stored document does not parse' };
  const canon = JSON.stringify(doc);
  const ts = String(docRow.updated_at || '');
  await ensureRowSyncSchema(db);
  const synced = await syncShadowRows(db, linesOfDoc(doc), ts, text);
  if (!synced) return { ok: false, error: 'the rows are switched off (store_rows_state.mode)' };
  const res = await db.batch([stateStmt(db), linesStmt(db, true), headStmt(db)]);
  const state = normState(resultsOf(res, 0)[0]);
  const lines = sortStoredLines(resultsOf(res, 1));
  const head = resultsOf(res, 2)[0];
  if (!state || state.rows_ts !== synced.anchor) return { ok: false, error: 'the rows are not in step with the stored document; try again' };
  if (state.rows_bad > 0) return { ok: false, error: `${state.rows_bad} failed comparison(s) on record; look at rows_note and reset first` };
  if (!head || String(head.updated_at || '') !== ts || Number(head.rev || 0) !== Number(docRow.rev || 0)) {
    return { ok: false, error: 'the stored document changed meanwhile; try again' };
  }
  const got = assembleText(lines);
  if (got !== canon) return { ok: false, error: 'the rows do not assemble to the stored document' };
  const lineMap = lineMapOf(lines, true);
  for (const ln of lines) {
    if (ln.h !== lineMap.get(lineKey(ln.b, ln.id)).h) return { ok: false, error: 'a stored content hash is wrong' };
  }
  const nowIso = new Date().toISOString();
  const commit = commitRecord(digestOfLines(lineMap), nowIso);
  const newRev = Number(head.rev || 0) + 1;
  await db.batch([
    db.prepare(
      `UPDATE edge_kv_store SET payload_json = ?2, rev = ?3
       WHERE doc_key = ?1 AND updated_at = ?4 AND rev = ?5
         AND EXISTS (SELECT 1 FROM store_rows_state s WHERE s.doc_key = ?1 AND s.rows_ts = ?6 AND s.mode = 1)`
    ).bind(ROW_SYNC_DOC_KEY, commit, newRev, ts, Number(head.rev || 0), synced.anchor),
    db.prepare(
      `DELETE FROM edge_kv_store WHERE doc_key LIKE ?2
         AND EXISTS (SELECT 1 FROM edge_kv_store h WHERE h.doc_key = ?1 AND h.rev = ?3 AND h.payload_json = ?4)`
    ).bind(ROW_SYNC_DOC_KEY, `${ROW_SYNC_DOC_KEY}__part_%`, newRev, commit),
    db.prepare(
      `UPDATE store_rows_state SET master = 1, master_at = ?2, fell_back_at = NULL, updated_at = ?2
       WHERE doc_key = ?1 AND EXISTS (SELECT 1 FROM edge_kv_store h WHERE h.doc_key = ?1 AND h.rev = ?3 AND h.payload_json = ?4)`
    ).bind(ROW_SYNC_DOC_KEY, nowIso, newRev, commit)
  ]);
  const now = await headStmt(db).first();
  if (!now || String(now.payload_json || '') !== commit) return { ok: false, error: 'the stored document changed meanwhile; try again' };
  _memo = { commit, stamp: ts, rev: newRev, text: canon, lines: lineMap };
  return { ok: true, lines: lines.length, chars: canon.length, updatedAt: ts };
}

// The lines read for restoreDocumentMaster: the document text and the head row it was read under.
export async function readRowsForRestore(db) {
  const res = await db.batch([headStmt(db), linesStmt(db, true)]);
  const head = resultsOf(res, 0)[0];
  if (!head || !isRowsHead(String(head.payload_json || ''))) return null;
  const lines = sortStoredLines(resultsOf(res, 1));
  const commit = parseCommit(String(head.payload_json));
  const dg = digestOfLines(lineMapOf(lines, true));
  if (!commit || commit.n !== dg.n || commit.x !== dg.x) return { damaged: true };
  return {
    text: assembleText(lines),
    commit: String(head.payload_json),
    updated_at: String(head.updated_at || ''),
    rev: Number(head.rev || 0)
  };
}

// ---- what the Owner notice and the build scripts read ---------------------------------------------------------------

export async function resetRowStoreCounters(db) {
  await ensureRowSyncSchema(db);
  const nowIso = new Date().toISOString();
  await db.batch([
    ensureStateStmt(db),
    db.prepare(
      `UPDATE store_rows_state SET rows_bad = 0, rows_note = NULL, apply_bad = 0, apply_at = NULL, fell_back_at = NULL, updated_at = ?2
       WHERE doc_key = ?1`
    ).bind(ROW_SYNC_DOC_KEY, nowIso),
    // Partial answers come back on, and the comparisons that guard them start again from none.
    db.prepare('UPDATE store_row_meta SET audit_bad = 0, audit_ok = 0, audit_note = NULL WHERE doc_key = ?1').bind(ROW_SYNC_DOC_KEY)
  ]);
}

export async function setRowStoreMode(db, mode) {
  await ensureRowSyncSchema(db);
  const m = Number(mode) === 0 ? 0 : 1;
  await db.batch([
    ensureStateStmt(db),
    db.prepare('UPDATE store_rows_state SET mode = ?2, rows_ts = CASE WHEN ?2 = 0 THEN \'\' ELSE rows_ts END, updated_at = ?3 WHERE doc_key = ?1')
      .bind(ROW_SYNC_DOC_KEY, m, new Date().toISOString())
  ]);
  return m;
}
