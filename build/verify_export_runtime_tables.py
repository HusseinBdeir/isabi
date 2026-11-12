"""Offline gate: Edge runtime tables never travel from a local SQLite DB into live D1.

export_d1_seed.EDGE_RUNTIME_TABLES (override_requests, saved_views, override_audit) are written only by the
Edge API. This check runs export_all on a throwaway DB, with the two Phase 5 tables added to the parsed schema
to simulate a future migration that lists them, and asserts:
  - a FULL export emits no INSERT or DELETE for any runtime table, but still exports ordinary tables;
  - a DELTA export whose previous manifest holds runtime-table row keys emits no DELETE for them, while a
    vanished ordinary row is still deleted (so the guard is selective, not a broken delete path).
Nothing live is read or written: the live store fetch is replaced by an empty document.
Run: python build/verify_export_runtime_tables.py
"""
import json
import pathlib
import re
import shutil
import sqlite3
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import export_d1_seed as eds  # noqa: E402

RUNTIME = sorted(eds.EDGE_RUNTIME_TABLES)
STMT_RE = re.compile(r"^\s*(INSERT OR REPLACE INTO|INSERT INTO|DELETE FROM)\s+\"?([A-Za-z0-9_]+)\"?", re.I)

passed = 0
failed = 0


def ok(name, cond, detail=None):
    global passed, failed
    if cond:
        passed += 1
        print("  ok   " + name)
    else:
        failed += 1
        print("  FAIL " + name + ("" if detail is None else "  -> " + str(detail)[:400]))


def stmts(files):
    out = []
    for bf in files:
        for ln in bf.read_text(encoding="utf-8").split("\n"):
            m = STMT_RE.match(ln)
            if m:
                out.append((m.group(1).upper(), m.group(2), ln))
    return out


orig_parse = eds.parse_schema_columns
orig_fetch = eds.fetch_live_cloud_store


def parse_with_runtime(text):
    cols = orig_parse(text)
    cols.setdefault("override_requests", ["id", "status", "caller_user_id"])
    cols.setdefault("saved_views", ["id", "user_id", "table_key"])
    return cols


eds.parse_schema_columns = parse_with_runtime
eds.fetch_live_cloud_store = lambda offline=False: {}

tmp = pathlib.Path(tempfile.mkdtemp(prefix="isabi-runtime-tables-"))
try:
    ok("override_audit is listed in 0001_schema.sql (so it needs the guard today)", "override_audit" in orig_parse(eds.SCHEMA_SQL.read_text(encoding="utf-8")))
    dbp = tmp / "local.db"
    conn = sqlite3.connect(str(dbp))
    conn.execute("CREATE TABLE customers (id TEXT PRIMARY KEY, name TEXT)")
    conn.execute("CREATE TABLE override_requests (id TEXT PRIMARY KEY, status TEXT, caller_user_id TEXT)")
    conn.execute("CREATE TABLE saved_views (id TEXT PRIMARY KEY, user_id TEXT, table_key TEXT)")
    conn.execute("CREATE TABLE override_audit (id TEXT PRIMARY KEY, created_at TEXT, caller_user_id TEXT)")
    conn.execute("INSERT INTO customers VALUES ('c-local-1', 'Acme')")
    conn.execute("INSERT INTO override_requests VALUES ('ovr-1-deadbeef', 'pending', 'u-test')")
    conn.execute("INSERT INTO saved_views VALUES ('sv-1-deadbeef', 'u-test', 'sales_tickets')")
    conn.execute("INSERT INTO override_audit VALUES ('ova-1-deadbeef', '2026-11-12T00:00:00.000Z', 'u-test')")
    conn.commit()
    conn.close()

    files, meta = eds.export_all(delta=False, offline=True, manifest_path=tmp / "none.json", db_path=dbp,
                                 out_dir=tmp / "full", include_snapshot=False)
    full = stmts(files)
    ok("FULL: ordinary local rows are still exported", any(t == "customers" and "c-local-1" in ln for _, t, ln in full), full[:3])
    leaked = [ln[:80] for _, t, ln in full if t in RUNTIME]
    ok("FULL: no statement touches a runtime table", not leaked, leaked)
    ok("FULL: manifest carries no runtime-table row keys",
       not [k for k in meta["row_hashes"] if eds.decode_row_key(k)[0] in RUNTIME], list(meta["row_hashes"])[:5])

    man = tmp / "manifest.json"
    prev = dict(meta["row_hashes"])
    for t, pk in (("override_audit", "ova-live-1"), ("override_requests", "ovr-live-1"), ("saved_views", "sv-live-1"), ("customers", "c-vanished")):
        prev[eds.encode_row_key(t, (pk,))] = "0" * 64
    man.write_text(json.dumps({"row_hashes": prev}), encoding="utf-8")
    files_d, meta_d = eds.export_all(delta=True, offline=True, manifest_path=man, db_path=dbp,
                                     out_dir=tmp / "delta", include_snapshot=False)
    delta = stmts(files_d)
    ok("DELTA: ran in delta mode", meta_d.get("delta_mode") is True, meta_d.get("delta_mode"))
    ok("DELTA: a vanished ordinary row is still deleted", any(k == "DELETE FROM" and t == "customers" and "c-vanished" in ln for k, t, ln in delta), delta)
    bad = [ln[:80] for _, t, ln in delta if t in RUNTIME]
    ok("DELTA: no DELETE or upsert for live runtime-table rows held in the old manifest", not bad, bad)
finally:
    eds.parse_schema_columns = orig_parse
    eds.fetch_live_cloud_store = orig_fetch
    shutil.rmtree(tmp, ignore_errors=True)

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
