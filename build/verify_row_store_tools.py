"""verify_row_store_tools.py - offline gate: the build scripts read a store whose rows are the master, never write a
document over it by accident, and the switch-over command asks for nothing it should not.

Run: python build/verify_row_store_tools.py      (exit 1 with every failed check named)

What it pins down
  1. row_store_read.assemble_text puts back, byte for byte, the text functions/_lib/row_store.js stored (the rows
     come from the real JavaScript, run here in node); the isabi and isabi-app copies of the reader are the same file.
  2. doc_from_rows / read_doc refuse rows that are not the ones the commit record names, and read again when a save
     lands between the reads.
  3. The seed's staged swap of the store (export_d1_seed.build_store_kv_swap) changes nothing while the head row is a
     commit record, and still applies onto a document.
  4. The Wrangler pulls of export_d1_seed.py and reconcile_cloud_store.py return the document from the rows; the
     Wrangler patch of reconcile_cloud_store.py refuses; legacy_id_sunset.py reads the ids from the rows.
  5. deploy_cloudflare.assert_live_store_parses accepts a commit record whose line count matches and stops the
     deploy when it does not.
  6. row_store_admin.py: no switch-over without --owner-go, with something for the Owner to look at, with too few
     clean comparisons or after a failed one; --dry asks nothing; the happy path asks check, then cutover.
Uses in-memory sqlite and node (for the JavaScript side). Touches nothing live: no ticket, no Wrangler, no network.
"""
from __future__ import annotations

import io
import json
import os
import pathlib
import sqlite3
import subprocess
import sys
import tempfile
import contextlib

sys.stdout.reconfigure(encoding="utf-8")
os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
os.environ["ISABI_NO_BUILD_TICKET"] = "1"
os.environ["ISABI_NO_WRANGLER_STORE"] = "1"
BUILD = pathlib.Path(__file__).resolve().parent
ROOT = BUILD.parent
APP_BUILD_CANDIDATES = [
    pathlib.Path(os.environ["ISABI_APP_SRC"]) / "build" if os.environ.get("ISABI_APP_SRC") else None,
    ROOT.parent / "isabi-app" / "build",
]
APP_BUILD = next((p for p in APP_BUILD_CANDIDATES if p and (p / "reconcile_cloud_store.py").is_file()), None)
sys.path.insert(0, str(BUILD))

import row_store_read as RSR  # noqa: E402

FAILED: list[str] = []
COUNT = 0


def check(label: str, cond: bool, detail: object = "") -> None:
    global COUNT
    COUNT += 1
    if not cond:
        FAILED.append(f"{label}{(' -> ' + str(detail)[:300]) if detail != '' else ''}")


# ---- the JavaScript side: documents as the Edge stores them -----------------------------------------------------------
NODE_SRC = r"""
import { pathToFileURL } from 'node:url';
const { linesOfDoc, planLineDiff, digestOfLines, ROWS_HEAD_PREFIX } = await import(pathToFileURL(process.argv[2]).href);
function rowsOf(doc, stored = new Map()) {
  const plan = planLineDiff(stored, linesOfDoc(doc));
  const jsonOf = new Map(linesOfDoc(doc).map(l => [l.b + '\u0000' + l.id, l.json]));
  const rows = [];
  for (const [key, v] of plan.next) {
    const cut = key.indexOf('\u0000');
    rows.push({ bucket: key.slice(0, cut), row_id: key.slice(cut + 1), kind: v.k, ord: v.ord, hash: v.h, json: jsonOf.get(key) });
  }
  const dg = digestOfLines(plan.next);
  return { text: JSON.stringify(doc), rows, next: plan.next, commit: ROWS_HEAD_PREFIX + JSON.stringify({ v: 1, id: 'gate', n: dg.n, x: dg.x, since: '2026-11-28T00:00:00.000Z' }) };
}
const sales = [];
for (let i = 0; i < 40; i++) sales.push({ id: 'st-' + i, company: i % 3 ? 'WTC' : 'BBConstruction', total: 100 + i, customer: 'ZzCust ' + i, notes: 'عربي نص ' + i });
const store = {
  minShellVer: '19.6.480', updatedAt: '2026-11-28T10:00:00.000Z', lbpFxRate: 89500,
  users: [{ id: 'u1', email: 'owner@example.test', pin_redacted: true }],
  customRecords: { sales_tickets: sales, expenses: [{ id: 'ex-1', company: 'WTC', amount: 5 }], receipts: [], odd: [{ id: 'a' }, { id: 'a', v: 2 }], 'ta"ble': [{ id: 'q' }] },
  kioskPunches: [{ id: 'kp-1', company: 'WTC' }],
  sentinelReviews: {}, workSchedules: { WTC: { x: 1 } },
  'ke"y\\n': { a: [1, null, true] }, 10: 'ten'
};
const first = rowsOf(store);
// A later state reached by a save: an entry added at the front, one edited, one removed (order numbers kept).
const later = JSON.parse(JSON.stringify(store));
later.customRecords.sales_tickets.unshift({ id: 'st-new', company: 'WTC', total: 1 });
later.customRecords.sales_tickets[7].total = 999;
later.customRecords.sales_tickets.splice(20, 1);
later.updatedAt = '2026-11-28T10:05:00.000Z';
const second = rowsOf(later, first.next);
const strip = o => ({ text: o.text, rows: o.rows, commit: o.commit });
process.stdout.write(JSON.stringify([strip(first), strip(second), strip(rowsOf({})), strip(rowsOf({ customRecords: [1], kioskPunches: 'x' }))]));
"""
with tempfile.TemporaryDirectory(prefix="row-store-tools-") as td:
    script = pathlib.Path(td) / "rows.mjs"
    script.write_text(NODE_SRC, encoding="utf-8")
    out = subprocess.run(["node", str(script), str(ROOT / "functions" / "_lib" / "row_store.js")], capture_output=True, text=True, encoding="utf-8")
if out.returncode != 0:
    print("verify_row_store_tools: node could not produce the rows:\n" + out.stderr[-1500:])
    sys.exit(1)
CASES = json.loads(out.stdout)
STORE = CASES[1]   # the store after a save

# 1. the reader
for i, case in enumerate(CASES):
    check(f"1. case {i}: the rows assemble to the stored text, byte for byte", RSR.assemble_text(case["rows"]) == case["text"],
          RSR.assemble_text(case["rows"])[:200])
check("1. shuffled rows assemble to the same text (order comes from ord)", RSR.assemble_text(list(reversed(STORE["rows"]))) == STORE["text"])
check("1. a commit record is recognised and is not JSON", RSR.is_rows_head(STORE["commit"]) and RSR.parse_commit(STORE["commit"])["n"] == len(STORE["rows"]))
check("1. a document is not a commit record", not RSR.is_rows_head(STORE["text"]) and RSR.parse_commit(STORE["text"]) is None and not RSR.is_rows_head(None))
if APP_BUILD:
    check("1. the isabi-app copy of the reader is the same file",
          (APP_BUILD / "row_store_read.py").is_file() and (APP_BUILD / "row_store_read.py").read_bytes().replace(b"\r\n", b"\n") == (BUILD / "row_store_read.py").read_bytes().replace(b"\r\n", b"\n"))

# 2. refusing rows that are not the record's
check("2. the document comes back from its rows", RSR.doc_from_rows(STORE["rows"], STORE["commit"]) == json.loads(STORE["text"]))
for label, rows, commit in (
    ("a line missing", STORE["rows"][1:], STORE["commit"]),
    ("no rows at all", [], STORE["commit"]),
    ("not a commit record", STORE["rows"], STORE["text"]),
):
    try:
        RSR.doc_from_rows(rows, commit)
        check(f"2. {label}: refused", False)
    except ValueError:
        check(f"2. {label}: refused", True)


def make_db(as_rows: bool, case: dict = STORE) -> sqlite3.Connection:
    """An in-memory database holding the store as rows (head = commit record) or as a document."""
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.executescript((ROOT / "migrations" / "0001_schema.sql").read_text(encoding="utf-8"))
    ts = json.loads(case["text"]).get("updatedAt", "2026-11-28T10:05:00.000Z")
    if as_rows:
        db.execute("INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES ('mfg_web_store', ?, ?, '', 7)", (case["commit"], ts))
        db.executemany(
            "INSERT INTO store_rows (doc_key, bucket, row_id, kind, ord, hash, json) VALUES ('mfg_web_store', ?, ?, ?, ?, ?, ?)",
            [(r["bucket"], r["row_id"], r["kind"], r["ord"], r["hash"], r["json"]) for r in case["rows"]],
        )
    else:
        text = case["text"]
        db.execute("INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES ('mfg_web_store', ?, ?, '', 7)", (text[:400], ts))
        db.execute("INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES ('mfg_web_store__part_0001', ?, ?, '', 1)", (text[400:], ts))
    db.commit()
    return db


def q(db: sqlite3.Connection):
    def run(sql: str, *a, **k) -> list[dict]:
        cur = db.execute(sql)
        rows = [dict(r) for r in cur.fetchall()] if cur.description else []
        db.commit()
        return rows
    return run


db_rows = make_db(True)
doc, head_ts = RSR.read_doc(q(db_rows))
check("2. read_doc: the document and its stamp, from a database", doc == json.loads(STORE["text"]) and head_ts == "2026-11-28T10:05:00.000Z")
# A save lands between the reads: the first try is thrown away.
state = {"n": 0}
base_q = q(db_rows)


def racing_q(sql: str) -> list[dict]:
    res = base_q(sql)
    if "FROM store_rows" in sql:
        state["n"] += 1
        if state["n"] == 1:
            db_rows.execute("UPDATE edge_kv_store SET updated_at = '2026-11-28T10:06:00.000Z' WHERE doc_key = 'mfg_web_store'")
    return res


doc2, ts2 = RSR.read_doc(racing_q)
check("2. read_doc: a save between the reads means another try", state["n"] == 2 and ts2 == "2026-11-28T10:06:00.000Z" and doc2 == json.loads(STORE["text"]))
db_bad = make_db(True)
db_bad.execute("DELETE FROM store_rows WHERE doc_key = 'mfg_web_store' AND bucket = 'cr:sales_tickets' AND row_id = 'st-3'")
try:
    RSR.read_doc(q(db_bad))
    check("2. read_doc: damaged rows are refused", False)
except ValueError:
    check("2. read_doc: damaged rows are refused", True)

# 3. the seed's staged swap
import export_d1_seed as eds  # noqa: E402


def staged_swap(db: sqlite3.Connection, new_text: str, head_ts_: str) -> None:
    run_id = "20261128100000abcdef"
    stage = eds.build_store_kv_stage_stmts(new_text, head_ts_, "seed", run_id)
    for _key, stmt in stage:
        db.execute(stmt)
    db.execute(eds.build_store_kv_swap(len(stage) - 1, head_ts_, run_id))
    db.execute(eds.build_store_kv_stage_clear(run_id))
    db.commit()


new_text = json.dumps({"updatedAt": "2026-11-28T10:05:00.000Z", "customRecords": {"x": []}, "marker": "from-the-seed"})
db_rows2 = make_db(True)
staged_swap(db_rows2, new_text, "2026-11-28T10:05:00.000Z")
head = db_rows2.execute("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'mfg_web_store'").fetchone()[0]
left = db_rows2.execute("SELECT COUNT(*) FROM edge_kv_store WHERE doc_key LIKE 'mfg_web_store__%'").fetchone()[0]
check("3. rows master: the seed's swap changes nothing (the head row is still the commit record, no part rows, no staged rows left)", head == STORE["commit"] and left == 0, (head[:60], left))
check("3. rows master: the store still reads from its rows", RSR.read_doc(q(db_rows2))[0] == json.loads(STORE["text"]))
db_doc = make_db(False)
staged_swap(db_doc, new_text, "2026-11-28T10:05:00.000Z")
joined = "".join(r[0] for r in db_doc.execute("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'mfg_web_store' OR doc_key LIKE 'mfg_web_store__part_%' ORDER BY doc_key"))
check("3. document master: the swap still applies", json.loads(joined).get("marker") == "from-the-seed", joined[:120])
db_doc2 = make_db(False)
staged_swap(db_doc2, new_text, "2026-11-01T00:00:00.000Z")
joined2 = "".join(r[0] for r in db_doc2.execute("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'mfg_web_store' OR doc_key LIKE 'mfg_web_store__part_%' ORDER BY doc_key"))
check("3. document master: a stale stamp still changes nothing", joined2 == STORE["text"])

# 4. the Wrangler pulls
db4 = make_db(True)
eds._wrangler_d1_query = q(db4)
with contextlib.redirect_stdout(io.StringIO()):
    pulled = eds._fetch_d1_store_via_wrangler()
want = json.loads(STORE["text"])
check("4. export_d1_seed: the Wrangler pull returns the document from the rows",
      isinstance(pulled, dict) and pulled.get("customRecords") == want["customRecords"] and pulled.get("kioskPunches") == want["kioskPunches"] and pulled.get("updatedAt") == "2026-11-28T10:05:00.000Z",
      list(pulled.keys())[:8] if isinstance(pulled, dict) else pulled)
eds._wrangler_d1_query = q(db_bad)
with contextlib.redirect_stdout(io.StringIO()):
    bad_pull = eds._fetch_d1_store_via_wrangler()
check("4. export_d1_seed: damaged rows are a failed pull, never an empty store", bad_pull == {} and any("kept as rows" in m for m in eds._EDGE_PULL_FAILURES), eds._EDGE_PULL_FAILURES)

if APP_BUILD:
    sys.path.insert(0, str(APP_BUILD))
    # (Imported with the real stdout: reconcile_cloud_store.py sets its encoding at import.)
    import reconcile_cloud_store as rcs  # noqa: E402
    import legacy_id_sunset as lis  # noqa: E402
    db5 = make_db(True)
    rcs._wrangler_d1_exec = lambda sql=None, **k: q(db5)(sql)
    got, uri = rcs._wrangler_d1_store_get()
    got_doc = (got.get("docs") or {}).get("mfg_web_store") or {}
    check("4. reconcile_cloud_store: the Wrangler read returns the document from the rows",
          not got.get("storeUnreadable") and got_doc.get("customRecords") == want["customRecords"] and str(got.get("updatedAt") or got_doc.get("updatedAt")) == "2026-11-28T10:05:00.000Z",
          {k: (v if k != "docs" else "...") for k, v in got.items()})
    try:
        rcs._wrangler_d1_store_patch({"customRecords": {}, "updatedAt": "x"}, "2026-11-28T10:05:00.000Z")
        check("4. reconcile_cloud_store: the Wrangler patch refuses a store kept as rows", False)
    except RuntimeError as exc:
        check("4. reconcile_cloud_store: the Wrangler patch refuses a store kept as rows", "kept as rows" in str(exc), str(exc))
    still = db5.execute("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'mfg_web_store'").fetchone()[0]
    check("4. reconcile_cloud_store: and nothing was written", still == STORE["commit"])
    # The switch-over lands (same stamp) after the patch read a document and staged its rows: the swap changes nothing.
    db_race = make_db(False)
    race = {"files": 0, "flipped": False}

    def racing_exec(sql: str = "", sql_file=None, timeout: int = 90):
        if sql_file is not None:
            race["files"] += 1
            db_race.executescript(pathlib.Path(sql_file).read_text(encoding="utf-8"))
            db_race.commit()
            if not race["flipped"]:
                race["flipped"] = True
                db_race.execute("DELETE FROM edge_kv_store WHERE doc_key LIKE 'mfg_web_store__part_%'")
                db_race.execute("UPDATE edge_kv_store SET payload_json = ?, rev = rev + 1 WHERE doc_key = 'mfg_web_store'", (STORE["commit"],))
                db_race.executemany(
                    "INSERT INTO store_rows (doc_key, bucket, row_id, kind, ord, hash, json) VALUES ('mfg_web_store', ?, ?, ?, ?, ?, ?)",
                    [(r["bucket"], r["row_id"], r["kind"], r["ord"], r["hash"], r["json"]) for r in STORE["rows"]],
                )
                db_race.commit()
            return []
        return q(db_race)(sql)

    rcs._wrangler_d1_exec = racing_exec
    patch_doc = json.loads(STORE["text"])
    patch_doc["updatedAt"] = "2026-11-28T10:07:00.000Z"
    patch_doc["marker"] = "from-the-top-up"
    with contextlib.redirect_stdout(io.StringIO()):
        try:
            race_res, _uri = rcs._wrangler_d1_store_patch(patch_doc, "2026-11-28T10:05:00.000Z")
        except Exception as exc:  # noqa: BLE001
            race_res = {"raised": str(exc)}
    race_head = db_race.execute("SELECT payload_json FROM edge_kv_store WHERE doc_key = 'mfg_web_store'").fetchone()[0]
    race_parts = db_race.execute("SELECT COUNT(*) FROM edge_kv_store WHERE doc_key LIKE 'mfg_web_store__%'").fetchone()[0]
    check("4. reconcile_cloud_store: a switch-over landing while the Wrangler patch is staging: the swap changes nothing (head still the commit record, no part rows, no staged rows)",
          race["flipped"] and race["files"] >= 2 and race_head == STORE["commit"] and race_parts == 0 and not (isinstance(race_res, dict) and race_res.get("ok") and not race_res.get("conflict")),
          (race, race_head[:40], race_parts, race_res if not isinstance(race_res, dict) else {k: v for k, v in race_res.items() if k != "docs"}))
    db5b = make_db(True)
    db5b.execute("DELETE FROM store_rows WHERE doc_key = 'mfg_web_store' AND bucket = 'kp'")
    rcs._wrangler_d1_exec = lambda sql=None, **k: q(db5b)(sql)
    bad_get, _ = rcs._wrangler_d1_store_get()
    check("4. reconcile_cloud_store: damaged rows read as an unreadable store, never as a shorter document", bad_get.get("storeUnreadable") is True)
    db6 = make_db(True)
    lis.d1_select = lambda sql: [] if 'legacy_id_hits' in sql else q(db6)(sql)
    hits, at_rest, mfg_at_rest = lis.fetch_live(with_mfg=True)
    check("4. legacy_id_sunset: the ids at rest are read from the rows (no 'did not parse')", isinstance(at_rest, list) and isinstance(mfg_at_rest, list))
    db6b = make_db(True)
    db6b.execute("DELETE FROM store_rows WHERE doc_key = 'mfg_web_store' AND bucket = 'kp'")
    lis.d1_select = lambda sql: [] if 'legacy_id_hits' in sql else q(db6b)(sql)
    try:
        lis.fetch_live(with_mfg=True)
        check("4. legacy_id_sunset: damaged rows stop it", False)
    except SystemExit as exc:
        check("4. legacy_id_sunset: damaged rows stop it", "did not read" in str(exc), str(exc))

# 5. the deploy's store check
import deploy_cloudflare as dc  # noqa: E402


class _Res:
    def __init__(self, rows): self.returncode, self.stdout, self.stderr = 0, json.dumps([{"results": rows}]), ""


def fake_wrangler(db):
    def run(args, env=None, **k):
        sql = next((a[len("--command="):] for a in args if isinstance(a, str) and a.startswith("--command=")), "")
        return _Res(q(db)(sql))
    return run


dc.time.sleep = lambda *_a, **_k: None
dc.run_wrangler = fake_wrangler(make_db(True))
with contextlib.redirect_stdout(io.StringIO()) as buf:
    text5 = dc.assert_live_store_parses({}, "the gate")
check("5. deploy: a commit record whose line count matches is in order", text5 == "" and "kept as rows" in buf.getvalue(), buf.getvalue())
dc.run_wrangler = fake_wrangler(db_bad)
try:
    with contextlib.redirect_stdout(io.StringIO()):
        dc.assert_live_store_parses({}, "the gate")
    check("5. deploy: a commit record whose line count does not match stops the deploy", False)
except SystemExit as exc:
    check("5. deploy: a commit record whose line count does not match stops the deploy", "kept as rows" in str(exc) and "did not read" in str(exc), str(exc))
db_torn = make_db(True)
db_torn.execute("UPDATE store_rows SET json = '{' WHERE doc_key = 'mfg_web_store' AND bucket = 'kp'")
dc.run_wrangler = fake_wrangler(db_torn)
try:
    with contextlib.redirect_stdout(io.StringIO()):
        dc.assert_live_store_parses({}, "the gate")
    check("5. deploy: a damaged line stops the deploy even when the line count still matches", False)
except SystemExit as exc:
    check("5. deploy: a damaged line stops the deploy even when the line count still matches", "did not read" in str(exc), str(exc))
dc.run_wrangler = fake_wrangler(make_db(False))
with contextlib.redirect_stdout(io.StringIO()):
    text5b = dc.assert_live_store_parses({}, "the gate")
check("5. deploy: a document is checked as before", text5b == STORE["text"])

# 6. the switch-over command
import row_store_admin as rsa  # noqa: E402

REAL_SCRIPTS_BLOCKERS = rsa.scripts_blockers
REAL_CALL = rsa.call
SCRIPTS_WHY: list[str] = []
GOOD = {"status": "ok", "issues": [], "partial": {"on": True, "auditOk": 9, "auditBad": 0},
        "rows": {"master": "document", "mode": 1, "ok": 150, "bad": 0, "checkedAt": "2026-11-28T10:00:00Z"}}


def run_admin(argv, health, answers=None):
    asked = []

    def fake_call(ticket, action, timeout=60):
        asked.append(action)
        if action is None:
            return 200, {"ok": True, "row_store": health}
        return (answers or {}).get(action, (200, {"ok": True, "check": "ok", "row_store": health}))

    rsa.call = fake_call
    rsa.scripts_blockers = lambda: list(SCRIPTS_WHY)
    eds.mint_build_ticket = lambda: "bt1_gate"
    with contextlib.redirect_stdout(io.StringIO()) as buf_:
        code = rsa.main(argv)
    return code, asked, buf_.getvalue()


code, asked, _o = run_admin(["status"], GOOD)
check("6. status: reads only", code == 0 and asked == [None])
code, asked, o = run_admin(["cutover"], GOOD)
check("6. cutover without --owner-go: nothing asked beyond the status", code == 3 and asked == [None] and "--owner-go" in o, o)
code, asked, o = run_admin(["cutover", "--owner-go", "--dry"], GOOD)
check("6. cutover --dry: nothing asked beyond the status", code == 0 and asked == [None] and "DRY RUN" in o, o)
code, asked, o = run_admin(["cutover", "--owner-go"], GOOD)
check("6. cutover with the owner's word and nothing in the way: check, then cutover", code == 0 and asked == [None, "check", "cutover"], asked)
for label, health in (
    ("something for the Owner to look at", dict(GOOD, status="attention", issues=[{"code": "partial_off", "n": 1, "at": ""}])),
    ("a failed comparison on record", dict(GOOD, rows=dict(GOOD["rows"], bad=1))),
    ("too few clean comparisons", dict(GOOD, rows=dict(GOOD["rows"], ok=12))),
    ("the rows not kept in step", dict(GOOD, rows=dict(GOOD["rows"], mode=0))),
    ("already switched over", dict(GOOD, rows=dict(GOOD["rows"], master="rows"))),
):
    code, asked, o = run_admin(["cutover", "--owner-go"], health)
    check(f"6. cutover refused: {label}", code == 3 and asked == [None], (code, asked))
code, asked, o = run_admin(["cutover", "--owner-go"], GOOD, {"check": (200, {"ok": False, "check": "bad", "row_store": GOOD})})
check("6. cutover stops when the comparison made just now fails", code == 3 and asked == [None, "check"], asked)
code, asked, o = run_admin(["restore"], dict(GOOD, rows=dict(GOOD["rows"], master="rows")))
check("6. restore asks for restore_document", code == 0 and asked == [None, "restore_document"], asked)
code, asked, o = run_admin(["rows-off", "--dry"], GOOD)
check("6. --dry on any other command asks nothing", code == 0 and asked == [None])
check("6. this program may issue a build ticket, and only by name", "row_store_admin.py" in eds.BUILD_TICKET_PROGRAMS)
SCRIPTS_WHY[:] = ["isabi origin/main does not hold build/row_store_read.py yet"]
code, asked, o = run_admin(["cutover", "--owner-go"], GOOD)
check("6. cutover refused while the build scripts are not ready everywhere", code == 3 and asked == [None] and "origin/main" in o, o)
SCRIPTS_WHY[:] = []
code, asked, o = run_admin(["cutover", "--owner-go"], GOOD, {"cutover": (0, {"ok": False, "noAnswer": True, "error": "no answer (TimeoutError: timed out)"})})
check("6. no answer to the switch-over request: it says so and reports what the store says now, never 'done'",
      code == 4 and asked == [None, "check", "cutover", None] and "NO ANSWER" in o and "done" not in o.split("NO ANSWER")[0].splitlines()[-1], (code, asked))
try:
    with contextlib.redirect_stderr(io.StringIO()):
        rsa.main(["cutover", "--owner-go", "--min-clean", "0"])
    check("6. --min-clean below 1 is refused", False)
except SystemExit as exc:
    check("6. --min-clean below 1 is refused", exc.code == 2)
# The readiness test itself, with git and the two checkouts as they are here (no network needed to fail safely).
rsa._on_origin_main = lambda repo: False
why_now = REAL_SCRIPTS_BLOCKERS()
check("6. readiness: a repository whose origin/main lacks the reader is named", any("origin/main" in w for w in why_now), why_now)
rsa._on_origin_main = lambda repo: True
why_ok = REAL_SCRIPTS_BLOCKERS()
check("6. readiness: nothing in the way when both checkouts and both mains hold the same reader", (why_ok == []) if APP_BUILD else any("isabi-app" in w for w in why_ok), why_ok)


class _Boom:
    def __call__(self, *a, **k):
        raise TimeoutError("timed out")


_real_urlopen = rsa.urllib.request.urlopen
rsa.urllib.request.urlopen = _Boom()
try:
    st, body = REAL_CALL("bt1_gate", "cutover", timeout=1)
finally:
    rsa.urllib.request.urlopen = _real_urlopen
check("6. a timeout is an answer of its own, not a traceback", st == 0 and body.get("noAnswer") is True and body.get("ok") is False, (st, body))

if FAILED:
    print(f"verify_row_store_tools: {len(FAILED)} of {COUNT} checks FAILED")
    for f in FAILED:
        print("  FAIL", f)
    sys.exit(1)
print(f"verify_row_store_tools: {COUNT}/{COUNT} checks passed" + ("" if APP_BUILD else " (isabi-app checkout not found: its scripts were not checked)"))
