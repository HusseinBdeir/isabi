"""row_store_read.py - how a build script reads the Manufacturing store once its rows are the master.

The live store is `edge_kv_store` `mfg_web_store`. Its head row holds either the document (JSON text, continued in
`mfg_web_store__part_NNNN` rows) or, after the switch-over of store-size plan step 2 stage B, a commit record: text
that starts with ROWS_HEAD_PREFIX and is never valid JSON. The document then lives one entry per row in `store_rows`
(isabi functions/_lib/row_store.js is the authority; this file follows its assembleText).

A script that joins head and parts and finds a commit record must not call the store unreadable or empty: it reads
`store_rows` (ROWS_SQL) and puts the document back together with doc_from_rows, which refuses a set of rows whose
count is not the one the commit record names.

The same file is kept in isabi build/ and isabi-app build/ (verify_row_store_tools.py compares them).
"""
from __future__ import annotations

import json

ROWS_HEAD_PREFIX = "#isabi-rows-master "
STORE_DOC_KEY = "mfg_web_store"
ROWS_SQL = f"SELECT bucket, row_id, kind, ord, json FROM store_rows WHERE doc_key = '{STORE_DOC_KEY}'"
ROWS_COUNT_SQL = f"SELECT COUNT(*) AS n FROM store_rows WHERE doc_key = '{STORE_DOC_KEY}'"
# SQL test for "the head row of the store holds a commit record" (for guards inside statements).
HEAD_IS_ROWS_SQL = (
    f"COALESCE(substr((SELECT payload_json FROM edge_kv_store WHERE doc_key = '{STORE_DOC_KEY}'), 1, {len(ROWS_HEAD_PREFIX)}), '') "
    f"= '{ROWS_HEAD_PREFIX}'"
)

_KIND_VALUE = 1
_KIND_SET = 2


def is_rows_head(payload: object) -> bool:
    return isinstance(payload, str) and payload.startswith(ROWS_HEAD_PREFIX)


def parse_commit(payload: object) -> dict | None:
    """The commit record's fields ({v, id, n, x, since}), or None when the text is not a commit record."""
    if not is_rows_head(payload):
        return None
    try:
        rec = json.loads(str(payload)[len(ROWS_HEAD_PREFIX):])
    except Exception:  # noqa: BLE001
        return None
    return rec if isinstance(rec, dict) else None


def head_row_of(kv_rows: list[dict] | None, doc_key: str = STORE_DOC_KEY) -> dict | None:
    for row in kv_rows or []:
        if isinstance(row, dict) and str(row.get("doc_key") or "") == doc_key:
            return row
    return None


def _key_text(key: str) -> str:
    return json.dumps(key, ensure_ascii=False)


def assemble_text(rows: list[dict]) -> str:
    """The JSON text of the document the rows stand for (row_store.js assembleText)."""
    by_bucket: dict[str, list[dict]] = {}
    for r in rows or []:
        by_bucket.setdefault(str(r.get("bucket") or ""), []).append(r)
    for lst in by_bucket.values():
        lst.sort(key=lambda r: (int(r.get("ord") or 0), str(r.get("row_id") or "")))

    def rows_text(bucket: str) -> str:
        return "[" + ",".join(str(r.get("json") or "") for r in by_bucket.get(bucket, [])) + "]"

    top_parts = []
    for t in by_bucket.get("@top", []):
        tid = str(t.get("row_id") or "")
        val = str(t.get("json") or "")
        if int(t.get("kind") or 0) == _KIND_SET:
            if tid == "kioskPunches":
                val = rows_text("kp")
            else:
                tabs = []
                for c in by_bucket.get("@cr", []):
                    cid = str(c.get("row_id") or "")
                    body = rows_text(f"cr:{cid}") if int(c.get("kind") or 0) == _KIND_SET else str(c.get("json") or "")
                    tabs.append(f"{_key_text(cid)}:{body}")
                val = "{" + ",".join(tabs) + "}"
        top_parts.append(f"{_key_text(tid)}:{val}")
    return "{" + ",".join(top_parts) + "}"


def doc_from_rows(rows: list[dict], commit_payload: object) -> dict:
    """The store document from `store_rows` rows read under the commit record `commit_payload`. Raises ValueError
    when the rows are not the ones the record names (a save landed between the two reads, or the rows are damaged):
    read both again, never go on with what was read."""
    rec = parse_commit(commit_payload)
    if rec is None:
        raise ValueError("the head row does not hold a commit record")
    if int(rec.get("n") or -1) != len(rows or []):
        raise ValueError(f"store_rows holds {len(rows or [])} line(s), the commit record names {rec.get('n')}")
    try:
        doc = json.loads(assemble_text(rows))
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"the rows do not assemble to a document ({exc})") from exc
    if not isinstance(doc, dict) or not doc:
        raise ValueError("the rows assemble to an empty document")
    return doc


def read_doc(query, attempts: int = 3) -> tuple[dict, str]:
    """(document, head stamp) of a store whose rows are the master. `query(sql)` returns a list of row dicts.
    The head row is read before and after the rows; a save in between means another try."""
    head_sql = f"SELECT payload_json, updated_at, rev FROM edge_kv_store WHERE doc_key = '{STORE_DOC_KEY}'"
    last = "no attempt made"
    for _ in range(max(1, attempts)):
        h1 = (query(head_sql) or [None])[0]
        if not isinstance(h1, dict) or not is_rows_head(h1.get("payload_json")):
            raise ValueError("the head row does not hold a commit record")
        rows = query(ROWS_SQL) or []
        h2 = (query(head_sql) or [None])[0]
        if not isinstance(h2, dict) or h2.get("payload_json") != h1.get("payload_json") or h2.get("updated_at") != h1.get("updated_at"):
            last = "the store was saved while it was being read"
            continue
        try:
            return doc_from_rows(rows, h1.get("payload_json")), str(h1.get("updated_at") or "")
        except ValueError as exc:
            last = str(exc)
    raise ValueError(last)
