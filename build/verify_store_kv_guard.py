"""Offline gate: the D1 seed export never leaves the live store (`edge_kv_store` `mfg_web_store` chunks) unparseable.

Incident 2026-11-13: chunk writes spread over several calls raced a browser sync and the joined chunks no longer parsed,
so every device synced an empty store. The export now stages the document under `mfg_web_store__next_NNNN` and swaps it
in with one guarded statement. This gate runs the export's real batch files against an in-memory `edge_kv_store` and a
browser writer that behaves like `writeEdgeKvDoc` in functions/_lib/d1_store.js, and reads the store the way
`readEdgeKvDoc` does after every batch file.

Usage: python build/verify_store_kv_guard.py   (exit 0 = all checks pass)
"""
from __future__ import annotations

import json
import pathlib
import sqlite3
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import export_d1_seed as eds  # noqa: E402

FAILS: list[str] = []
PASSES = 0


def check(name: str, ok: bool, detail: str = ""):
    global PASSES
    if ok:
        PASSES += 1
        print(f"  PASS {name}")
    else:
        FAILS.append(name)
        print(f"  FAIL {name} {detail}")


def new_db() -> sqlite3.Connection:
    con = sqlite3.connect(":memory:")
    con.execute("CREATE TABLE edge_kv_store (doc_key TEXT PRIMARY KEY, payload_json TEXT DEFAULT '{}', updated_at TEXT DEFAULT '', updated_by TEXT DEFAULT '', rev INTEGER DEFAULT 1)")
    return con


def browser_write(con: sqlite3.Connection, doc: dict, ts: str):
    """Edge writer: head first, then every part deleted and rewritten (compact JSON)."""
    s = json.dumps(dict(doc, updatedAt=ts), ensure_ascii=False, separators=(",", ":"))
    chunks = eds._chunk_str_for_kv(s, eds.KV_CHUNK_CHARS, 64_000)
    con.execute("INSERT OR REPLACE INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES ('mfg_web_store', ?, ?, 'browser', 1)", (chunks[0], ts))
    con.execute("DELETE FROM edge_kv_store WHERE doc_key LIKE 'mfg_web_store__part_%'")
    for i, ch in enumerate(chunks[1:], start=1):
        con.execute("INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES (?, ?, ?, 'browser', 1)", (f"mfg_web_store__part_{i:04d}", ch, ts))


def read_store(con: sqlite3.Connection):
    """Same rows and order as readEdgeKvDoc."""
    rows = con.execute("SELECT doc_key, payload_json FROM edge_kv_store WHERE doc_key = 'mfg_web_store' OR doc_key LIKE 'mfg_web_store__part_%' ORDER BY doc_key ASC").fetchall()
    try:
        return json.loads("".join(r[1] for r in rows))
    except Exception:
        return None


def make_doc(tag: str, n: int) -> dict:
    return {"customRecords": {"sales_tickets": [{"id": f"{tag}-{i}", "note": "x" * 300 + tag} for i in range(n)]}, "updatedBy": tag}


def apply_file(con, f: pathlib.Path):
    con.executescript(f.read_text(encoding="utf-8"))


schema_cols = eds.parse_schema_columns(eds.SCHEMA_SQL.read_text(encoding="utf-8"))
ws_rk = eds.encode_row_key("edge_kv_store", ("work_schedules",))
orig_fetch, orig_collect = eds.fetch_live_cloud_store, eds.collect_target_rows


def plan(doc: dict | None, head_ts: str) -> dict:
    rows = {}
    if head_ts:
        rows[ws_rk] = "INSERT OR REPLACE INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES ('work_schedules', '{}', '', 'seed', 1)"
    if doc is not None and head_ts:
        s = json.dumps(dict(doc, updatedAt=head_ts), ensure_ascii=False)
        eds._STORE_CONTENT_SHA = eds.hashlib.sha256(s.encode("utf-8")).hexdigest()
        for k, stmt in eds.build_store_kv_stage_stmts(s, head_ts, "seed", eds._store_run_id()):
            rows[eds.encode_row_key("edge_kv_store", (k,))] = stmt
    return rows


def run_export(doc, head_ts: str, out: pathlib.Path, manifest: pathlib.Path, delta: bool = True, offline: bool = False):
    def fake_fetch(offline=False):
        eds._LIVE_EDGE_HEAD_TS = head_ts
        eds._STORE_RUN_ID = eds.new_store_run_id()
        return {"customRecords": {}} if head_ts else {}
    eds.fetch_live_cloud_store = fake_fetch
    eds.collect_target_rows = lambda *a, **k: plan(doc, head_ts)
    try:
        files, meta = eds.export_all(delta=delta, offline=offline, manifest_path=manifest, db_path=pathlib.Path(tempfile.gettempdir()) / "none.db", out_dir=out)
    finally:
        eds.fetch_live_cloud_store, eds.collect_target_rows = orig_fetch, orig_collect
    return files, meta


with tempfile.TemporaryDirectory() as td:
    tdp = pathlib.Path(td)
    manifest = tdp / "manifest.json"

    print("1. A store bigger than one batch file: readable after every file")
    big = make_doc("seedbig", 5000)
    live = make_doc("live", 4800)
    files, meta = run_export(big, "T0", tdp / "b1", tdp / "nomanifest.json", delta=False)
    check("export spans several batch files", len(files) >= 3, str(len(files)))
    swap_files = [f for f in files if "__part_' ||" in f.read_text(encoding="utf-8")]
    check("the live switch is one statement in the last file", len(swap_files) == 1 and swap_files[0] == files[-1])
    check("no batch writes a live chunk directly", not any("VALUES ('mfg_web_store'," in f.read_text(encoding="utf-8") or "VALUES ('mfg_web_store__part_" in f.read_text(encoding="utf-8") for f in files))
    con = new_db(); browser_write(con, live, "T0")
    ok_all = True
    for k, f in enumerate(files):
        apply_file(con, f)
        got = read_store(con)
        want = "live" if k < len(files) - 1 else "seedbig"
        if got is None or got.get("updatedBy") != want:
            ok_all = False
            print(f"    after {f.name}: {None if got is None else got.get('updatedBy')} (want {want})")
    check("store parses after each file (old version until the swap, new after)", ok_all)
    check("no staged rows left", con.execute("SELECT count(*) FROM edge_kv_store WHERE doc_key LIKE 'mfg_web_store__next_%'").fetchone()[0] == 0)
    check("rows keep the pulled stamp (browsers' compare-and-swap still matches)", {r[0] for r in con.execute("SELECT DISTINCT updated_at FROM edge_kv_store WHERE doc_key = 'mfg_web_store'")} == {"T0"})
    check("manifest records the pulled head", meta.get("store_head_ts") == "T0")

    print("2. Shrinking store: the older tail is blanked by the same statement")
    con = new_db(); browser_write(con, make_doc("huge", 9000), "T0")
    files, _ = run_export(make_doc("small", 200), "T0", tdp / "b2", tdp / "nomanifest.json", delta=False)
    for f in files:
        apply_file(con, f)
    got = read_store(con)
    check("small store parses after the swap", bool(got) and got.get("updatedBy") == "small")

    print("3. Browser writes between staging and the swap (the 2026-11-13 race)")
    con = new_db(); browser_write(con, live, "T0")
    files, _ = run_export(big, "T0", tdp / "b3", tdp / "nomanifest.json", delta=False)
    for f in files[:-1]:
        apply_file(con, f)
    browser_write(con, make_doc("browser2", 4100), "T2")
    apply_file(con, files[-1])
    got = read_store(con)
    check("browser's version stands whole", bool(got) and got.get("updatedBy") == "browser2" and len(got["customRecords"]["sales_tickets"]) == 4100)
    check("staged rows cleared anyway", con.execute("SELECT count(*) FROM edge_kv_store WHERE doc_key LIKE 'mfg_web_store__next_%'").fetchone()[0] == 0)

    print("4. Browser wrote between pull and upload, and stale staged rows from an aborted run")
    con = new_db(); browser_write(con, live, "T2")
    con.execute("INSERT INTO edge_kv_store (doc_key, payload_json, updated_at) VALUES ('mfg_web_store__next_0999', 'garbage', 'T0')")
    files, _ = run_export(make_doc("seed4", 300), "T0", tdp / "b4", tdp / "nomanifest.json", delta=False)
    for f in files:
        apply_file(con, f)
    got = read_store(con)
    check("store untouched", bool(got) and got.get("updatedBy") == "live")
    check("stale staged rows removed", con.execute("SELECT count(*) FROM edge_kv_store WHERE doc_key LIKE 'mfg_web_store__next_%'").fetchone()[0] == 0)

    print("4b. Two deploys overlap (same pulled head)")
    for order in ("A finishes while B stages", "B starts while A stages"):
        con = new_db(); browser_write(con, live, "T0")
        fa, _ = run_export(make_doc("runA", 3000), "T0", tdp / "b4a", tdp / "nomanifest.json", delta=False)
        fa = [pathlib.Path(str(f)) for f in fa]
        fa_text = [f.read_text(encoding="utf-8") for f in fa]
        fb, _ = run_export(make_doc("runB-longer", 3400), "T0", tdp / "b4b", tdp / "nomanifest.json", delta=False)
        fb_text = [f.read_text(encoding="utf-8") for f in fb]
        if order.startswith("A"):
            seq = [fb_text[0]] + fa_text + fb_text[1:]
        else:
            seq = [fa_text[0]] + [fb_text[0]] + fa_text[1:] + fb_text[1:]
        ok_all = True
        for sql in seq:
            con.executescript(sql)
            got = read_store(con)
            if got is None:
                ok_all = False
                break
            tags = {r["id"].split("-")[0] for r in got["customRecords"]["sales_tickets"]}
            if len(tags) != 1:
                ok_all = False
                break
        check(f"{order}: store always parses and holds one run's records", ok_all)

    print("4c. A staged chunk is missing at swap time")
    con = new_db(); browser_write(con, live, "T0")
    files, _ = run_export(big, "T0", tdp / "b4c", tdp / "nomanifest.json", delta=False)
    for f in files[:-1]:
        apply_file(con, f)
    con.execute("DELETE FROM edge_kv_store WHERE doc_key = (SELECT max(doc_key) FROM edge_kv_store WHERE doc_key LIKE 'mfg_web_store__next_%')")
    apply_file(con, files[-1])
    got = read_store(con)
    check("incomplete stage: store unchanged", bool(got) and got.get("updatedBy") == "live")

    print("4d. Stale staged rows of an aborted run more than a day old are cleared, a live run's are not")
    con = new_db(); browser_write(con, live, "T0")
    con.execute("INSERT INTO edge_kv_store (doc_key, payload_json) VALUES ('mfg_web_store__next_20200101000000abcdef_0000', 'x')")
    con.execute(f"INSERT INTO edge_kv_store (doc_key, payload_json) VALUES ('mfg_web_store__next_{eds.new_store_run_id()}_0000', 'y')")
    con.execute(eds.build_store_kv_stale_stage_clear())
    left = [r[0] for r in con.execute("SELECT doc_key FROM edge_kv_store WHERE doc_key LIKE 'mfg_web_store__next_%'")]
    check("old run cleared, current run kept", len(left) == 1 and "20200101" not in left[0], str(left))

    print("5. Brand-new database (no head row)")
    con = new_db()
    files, _ = run_export(make_doc("fresh", 300), "T9", tdp / "b5", tdp / "nomanifest.json", delta=False)
    for f in files:
        apply_file(con, f)
    got = read_store(con)
    check("store written", bool(got) and got.get("updatedBy") == "fresh")

    print("6. Delta mode and failed pulls")
    prev = {rk: eds.stmt_hash(s) for rk, s in plan(big, "T0").items()}
    old_part_rk = eds.encode_row_key("edge_kv_store", ("mfg_web_store__part_0003",))
    prev[old_part_rk] = "x"  # an older manifest that still lists live part keys
    manifest.write_text(json.dumps({"row_hashes": prev}), encoding="utf-8")
    files, _ = run_export(big, "T0", tdp / "b6", manifest)
    text = "".join(f.read_text(encoding="utf-8") for f in files)
    n_stage = sum(1 for rk in plan(big, "T0") if eds.is_store_kv_row_key(rk))
    check("delta with unchanged hashes still stages every chunk", text.count("VALUES ('mfg_web_store__next_") == n_stage)
    check("delta never deletes a live part by key", "doc_key = 'mfg_web_store__part_" not in text)
    con = new_db(); browser_write(con, live, "T0")
    ok_all = True
    for f in files:
        apply_file(con, f)
        ok_all = ok_all and read_store(con) is not None
    check("delta batches keep the store readable after each file", ok_all and read_store(con).get("updatedBy") == "seedbig")
    m6 = json.loads((tdp / "b6" / "pending_manifest.json").read_text(encoding="utf-8"))
    manifest.write_text(json.dumps(m6), encoding="utf-8")
    files, meta = run_export(big, "T0", tdp / "b6b", manifest)
    text = "".join(f.read_text(encoding="utf-8") for f in files)
    check("delta with the same store document as last run: store left alone", "mfg_web_store" not in text and meta.get("store_content_sha") == m6.get("store_content_sha"))
    refused = False
    try:
        run_export(None, "", tdp / "b7r", manifest)
    except eds.StaleStoreRefused:
        refused = True
    check("failed pull: the export is refused (no batch file)", refused and not list((tdp / "b7r").glob("batch_*.sql")))
    files, meta = run_export(None, "", tdp / "b7", manifest, offline=True)
    text = "".join(f.read_text(encoding="utf-8") for f in files)
    check("offline export: no statement touches the store or work schedules", "mfg_web_store" not in text and "work_schedules" not in text, text[:200])
    check("offline export: manifest has no store head and is marked stale", meta.get("store_head_ts") == "" and meta.get("stale_store") is True)

print(f"\n{PASSES} passed, {len(FAILS)} failed")
sys.exit(1 if FAILS else 0)
