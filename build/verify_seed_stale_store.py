"""Offline gate: the D1 seed never deletes or overwrites live rows from a stale copy of the store.

Follow-up to the 2026-11-13 store incident (red-team note on `4b7ce82`): when the live Edge pull failed,
`export_d1_seed.py` still built the live tables (seats, sessions, app records, punches, sibling-industry rows...) from a
relay-only or cached copy, so in delta mode every row that copy lacked became a DELETE on live D1, and the relay-only
merge overwrote the cache of the last live pull. Now:
  - a failed pull (no Edge sign-in, network error, or a store the Edge flags `storeUnreadable`) refuses the export and
    leaves no batch file or pending manifest behind;
  - the cache is written only by a real live pull;
  - `--offline` (`offline=True`) still builds a local export, with no DELETE and a pending manifest marked stale that
    `promote_pending_manifest` refuses;
  - with a live pull, rows that vanished are still deleted (control).

No network, no writes outside a temp folder. Usage: python build/verify_seed_stale_store.py   (exit 0 = all pass)
"""
from __future__ import annotations

import contextlib
import io
import json
import pathlib
import re
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


STMT_RE = re.compile(r"^\s*(INSERT OR REPLACE INTO|INSERT INTO|DELETE FROM)\s+\"?([A-Za-z0-9_]+)\"?", re.I)


def stmts(files) -> list[tuple[str, str, str]]:
    out = []
    for f in files:
        for ln in pathlib.Path(f).read_text(encoding="utf-8").split("\n"):
            m = STMT_RE.match(ln)
            if m:
                out.append((m.group(1).upper(), m.group(2), ln))
    return out


def store_doc(ts: str, keep_all: bool) -> dict:
    """A live store: two app sales, two punches, two sibling-industry rows, one session. `keep_all=False` is an older
    copy that lacks the second of each (they were added after it was taken)."""
    n = 2 if keep_all else 1
    return {
        "updatedAt": ts,
        "updatedBy": "browser",
        "customRecords": {
            "sales_tickets": [{"id": f"app-sale-{i}", "company": "wtc", "date": "2026-11-12", "total": 100 + i} for i in range(1, n + 1)],
        },
        "kioskPunches": [{"id": f"kp-{i}", "company": "wtc", "staff_name": "A", "type": "in", "punched_at": f"2026-11-12T0{i}:00:00Z"} for i in range(1, n + 1)],
        "industryCustomRows": {"hsp_revenue": [{"id": f"HSP-REV-{i}", "company": "launa", "amount": 10 * i} for i in range(1, n + 1)]},
        "sessions": [{"id": f"sess-{i}", "email": "a@example.com"} for i in range(1, n + 1)],
    }


LIVE_V1 = store_doc("2026-11-13T08:00:00.000Z", keep_all=True)
STALE = store_doc("2026-11-12T20:00:00.000Z", keep_all=False)
LIVE_V2 = store_doc("2026-11-13T09:00:00.000Z", keep_all=False)  # the rows really were removed live

saved = {k: getattr(eds, k) for k in ("_fetch_edge_store", "_fetch_legacy_relay_store", "LIVE_CACHE_JSON", "OUT_DIR",
                                      "_mint_cli_edge_jwt", "COMMITTED_MANIFEST_JSON", "DB_PATH")}
saved_urlopen = eds.urllib.request.urlopen
saved_defaults = eds.export_all.__defaults__
saved_promote_defaults = eds.promote_pending_manifest.__defaults__

with tempfile.TemporaryDirectory() as td:
    tdp = pathlib.Path(td)
    eds.OUT_DIR = tdp / "exports" / "d1_batches"
    eds.LIVE_CACHE_JSON = tdp / "exports" / "mfg_web_store_snapshot.json"
    eds.LIVE_CACHE_JSON.parent.mkdir(parents=True, exist_ok=True)
    db = tdp / "none.db"
    committed = tdp / "d1_seed_manifest.json"
    eds.COMMITTED_MANIFEST_JSON = committed
    eds.DB_PATH = db
    # every export_all default points into the temp folder, so a broken guard can never touch the real exports/
    eds.export_all.__defaults__ = (False, False, committed, db, eds.OUT_DIR, False, None)[: len(saved_defaults)]
    eds.promote_pending_manifest.__defaults__ = (eds.OUT_DIR, committed)

    def set_sources(edge: dict, relay: dict):
        eds._fetch_edge_store = lambda: json.loads(json.dumps(edge))
        eds._fetch_legacy_relay_store = lambda: json.loads(json.dumps(relay))

    try:
        print("1. The cache of the last live pull")
        eds.LIVE_CACHE_JSON.write_text(json.dumps(STALE), encoding="utf-8")
        set_sources({}, dict(STALE, updatedBy="relay"))
        got = eds.fetch_live_cloud_store()
        cache = json.loads(eds.LIVE_CACHE_JSON.read_text(encoding="utf-8"))
        check("Edge failed + relay answered: no live head", eds._LIVE_EDGE_HEAD_TS == "")
        check("Edge failed + relay answered: the relay-only copy does not replace the cache", cache.get("updatedBy") == "browser", str(cache.get("updatedBy")))
        check("Edge failed + relay answered: the relay copy is still returned (offline use)", got.get("updatedBy") == "relay")
        set_sources({}, {})
        got = eds.fetch_live_cloud_store()
        check("Edge failed + no relay: the cache is returned, no live head", got.get("updatedAt") == STALE["updatedAt"] and eds._LIVE_EDGE_HEAD_TS == "")
        set_sources(LIVE_V1, {})
        got = eds.fetch_live_cloud_store()
        cache = json.loads(eds.LIVE_CACHE_JSON.read_text(encoding="utf-8"))
        check("live pull: head set and cache refreshed", eds._LIVE_EDGE_HEAD_TS == LIVE_V1["updatedAt"] and cache.get("updatedAt") == LIVE_V1["updatedAt"])
        set_sources({"updatedAt": "2026-11-13T10:00:00.000Z", "alertRules": {"overrides": {}, "custom": []}}, {})
        eds.fetch_live_cloud_store()
        check("a store with no app records (sub-stores only) is not a live head", eds._LIVE_EDGE_HEAD_TS == "")

        print("2. What the Edge answers")
        eds._fetch_edge_store = saved["_fetch_edge_store"]

        class FakeResp:
            def __init__(self, body: dict):
                self._b = json.dumps(body).encode("utf-8")
                self.headers = {"Content-Type": "application/json"}

            def read(self):
                return self._b

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        calls: list[str] = []

        def fake_urlopen(req, timeout=0):
            calls.append(req.full_url)
            if req.full_url.endswith("/users"):
                return FakeResp({"users": []})
            return FakeResp(edge_body)

        eds.urllib.request.urlopen = fake_urlopen
        eds._mint_cli_edge_jwt = lambda ttl_sec=300: "tok"
        edge_body = {"ok": True, "edge": True, "storeUnreadable": True,
                     "docs": {"mfg_web_store": {"updatedAt": "2026-11-13T09:02:45.000Z", "workSchedules": {}}}}
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            got = eds._fetch_edge_store()
        check("storeUnreadable answer: treated as a failed pull", got == {} and "unreadable" in buf.getvalue(), buf.getvalue()[:200])
        check("storeUnreadable answer: the second Edge URL is not tried (same database)", len([c for c in calls if c.endswith("/sync")]) == 1, str(calls))
        edge_body = {"ok": True, "edge": True, "docs": {"mfg_web_store": LIVE_V1}}
        with contextlib.redirect_stdout(io.StringIO()):
            got = eds._fetch_edge_store()
        check("readable answer: the store is returned", got.get("updatedAt") == LIVE_V1["updatedAt"] and bool(got.get("customRecords")))
        eds._mint_cli_edge_jwt = lambda ttl_sec=300: ""
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            got = eds._fetch_edge_store()
        check("no Edge sign-in on this PC: failed pull, said out loud", got == {} and "no Edge sign-in" in buf.getvalue())

        def failing_urlopen(req, timeout=0):
            raise OSError("network down")

        eds._mint_cli_edge_jwt = lambda ttl_sec=300: "tok"
        eds.urllib.request.urlopen = failing_urlopen
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            got = eds._fetch_edge_store()
        check("network error: failed pull, said out loud", got == {} and buf.getvalue().count("failed (OSError") == len(eds.EDGE_SYNC_URLS))
        def unauthorized_urlopen(req, timeout=0):
            raise eds.urllib.error.HTTPError(req.full_url, 401, "Unauthorized", {}, None)

        eds.urllib.request.urlopen = unauthorized_urlopen
        with contextlib.redirect_stdout(io.StringIO()):
            got = eds._fetch_edge_store()
        check("HTTP 401: failed pull, reason names the PC's jwt_secret", got == {} and any("HTTP 401" in f and "jwt_secret" in f for f in eds._EDGE_PULL_FAILURES), str(eds._EDGE_PULL_FAILURES))
        edge_body = {"ok": True, "edge": True, "docs": {}}
        eds.urllib.request.urlopen = fake_urlopen
        with contextlib.redirect_stdout(io.StringIO()):
            got = eds._fetch_edge_store()
        check("JSON answer with no store document: failed pull, said out loud", got == {} and len(eds._EDGE_PULL_FAILURES) == len(eds.EDGE_SYNC_URLS))
        eds.urllib.request.urlopen = saved_urlopen
        check("a company-scoped copy (non-Owner session) is not a live head", eds._live_edge_head_of(dict(LIVE_V1, _scopedForSession=True)) == "")
        check("a store whose customRecords is not a dict is not a live head", eds._live_edge_head_of(dict(LIVE_V1, customRecords=[1])) == "")

        print("3. Export after a live pull, then after a failed one")
        set_sources(LIVE_V1, {})
        with contextlib.redirect_stdout(io.StringIO()):
            files1, meta1 = eds.export_all(delta=False)
        promoted1 = eds.promote_pending_manifest(eds.OUT_DIR, committed)
        check("live FULL export: not stale, manifest promoted", meta1.get("stale_store") is False and promoted1)
        committed_before = committed.read_bytes()
        live_keys = set(json.loads(committed_before)["row_hashes"])
        want_keys = {eds.encode_row_key("sales_tickets", ("app-sale-2",)), eds.encode_row_key("kiosk_punches", ("kp-2",)),
                     eds.encode_row_key("industry_custom_rows", ("hsp_revenue", "HSP-REV-2")), eds.encode_row_key("auth_sessions", ("sess-2",))}
        check("the live manifest holds the rows the stale copy lacks", want_keys <= live_keys, str(sorted(want_keys - live_keys)))

        # failed pull: relay answers with the older copy, the cache holds it too; a previous run's batches are on disk
        eds.LIVE_CACHE_JSON.write_text(json.dumps(STALE), encoding="utf-8")
        set_sources({}, STALE)
        eds.OUT_DIR.mkdir(parents=True, exist_ok=True)
        (eds.OUT_DIR / "batch_0000.sql").write_text("DELETE FROM sales_tickets WHERE id = 'x';\n", encoding="utf-8")
        (eds.OUT_DIR / "pending_manifest.json").write_text(json.dumps({"row_hashes": {"a": "b"}}), encoding="utf-8")
        refused = None
        stale_files: list = []
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                stale_files, _m = eds.export_all(delta=True)
        except SystemExit as ex:
            refused = ex
        check("failed pull, DELTA: export refused", refused is not None and isinstance(refused, getattr(eds, "StaleStoreRefused", ())),
              f"{sum(1 for s in stmts(stale_files) if s[0] == 'DELETE FROM')} DELETE statements written from the stale copy")
        check("refusal says why", refused is not None and "not pulled from the Edge" in str(refused.code))
        check("refusal leaves no batch file and no pending manifest", not list(eds.OUT_DIR.glob("batch_*.sql")) and not (eds.OUT_DIR / "pending_manifest.json").exists())
        check("refusal leaves the committed manifest as it was", committed.read_bytes() == committed_before)
        refused_full = False
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                eds.export_all(delta=False)
        except eds.StaleStoreRefused:
            refused_full = True
        check("failed pull, FULL: export refused too (older rows would overwrite newer live ones)", refused_full)

        rc = None
        err = io.StringIO()
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(err):
            try:
                eds.main(["--delta"])
            except SystemExit as ex:
                rc = ex.code
        check("CLI --delta with a failed pull exits non-zero (deploy_cloudflare.py stops on it)", rc not in (0, None), repr(rc))

        print("4. --offline: local export from the cache")
        with contextlib.redirect_stdout(io.StringIO()):
            files_o, meta_o = eds.export_all(delta=True, offline=True)
        so = stmts(files_o)
        check("offline DELTA ran", meta_o.get("delta_mode") is True)
        check("offline DELTA: no DELETE at all", not [s for s in so if s[0] == "DELETE FROM"], str([s[2][:80] for s in so if s[0] == "DELETE FROM"][:5]))
        check("offline DELTA: the store document is not written", not any("mfg_web_store" in s[2] for s in so))
        check("offline DELTA: pending manifest marked stale", meta_o.get("stale_store") is True)
        with contextlib.redirect_stdout(io.StringIO()):
            promoted = eds.promote_pending_manifest(eds.OUT_DIR, committed)
        check("offline manifest is never promoted", promoted is False and committed.read_bytes() == committed_before)
        with contextlib.redirect_stdout(io.StringIO()):
            files_of, meta_of = eds.export_all(delta=False, offline=True)
        check("offline FULL: no DELETE either", not [s for s in stmts(files_of) if s[0] == "DELETE FROM"])
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            eds.main(["--offline", "--no-snapshot", "--commit-manifest"])
        check("CLI --offline --commit-manifest says the manifest was NOT committed", "NOT committed" in out.getvalue() and committed.read_bytes() == committed_before, out.getvalue()[-300:])
        for body, label in (({"row_hashes": {"a": "b"}}, "a pending manifest from before this guard (no stale_store key)"),
                            ("not json", "an unreadable pending manifest")):
            (eds.OUT_DIR / "pending_manifest.json").write_text(body if isinstance(body, str) else json.dumps(body), encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()):
                promoted = eds.promote_pending_manifest(eds.OUT_DIR, committed)
            check(f"{label} is not promoted", promoted is False and committed.read_bytes() == committed_before)

        print("5. Control: a live pull still deletes rows that really went")
        set_sources(LIVE_V2, {})
        with contextlib.redirect_stdout(io.StringIO()):
            files_l, meta_l = eds.export_all(delta=True)
        dels = {(t, ln) for k, t, ln in stmts(files_l) if k == "DELETE FROM"}
        for tbl, pk in (("sales_tickets", "app-sale-2"), ("kiosk_punches", "kp-2"), ("industry_custom_rows", "HSP-REV-2"), ("auth_sessions", "sess-2")):
            check(f"live DELTA deletes {tbl} {pk}", any(t == tbl and f"'{pk}'" in ln for t, ln in dels), str(sorted(dels))[:300])
        check("live DELTA keeps the rows still there", not any(f"'{pk}'" in ln for _, ln in dels for pk in ("app-sale-1", "kp-1", "HSP-REV-1", "sess-1")))
        check("live DELTA manifest is promotable", meta_l.get("stale_store") is False and eds.promote_pending_manifest(eds.OUT_DIR, committed))
    finally:
        for k, v in saved.items():
            setattr(eds, k, v)
        eds.urllib.request.urlopen = saved_urlopen
        eds.export_all.__defaults__ = saved_defaults
        eds.promote_pending_manifest.__defaults__ = saved_promote_defaults

print(f"\n{PASSES} passed, {len(FAILS)} failed")
sys.exit(1 if FAILS else 0)
