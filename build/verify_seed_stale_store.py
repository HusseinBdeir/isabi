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
import os
import pathlib
import re
import sqlite3
import sys
import tempfile
import urllib.error

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

        print("6. Equal-Host Wrangler D1 fallback (multi-part, overlays, redaction, torn/orphan refusal)")
        eds._fetch_edge_store = saved["_fetch_edge_store"]
        eds._mint_cli_edge_jwt = saved["_mint_cli_edge_jwt"]
        eds.urllib.request.urlopen = saved_urlopen
        saved_edge_meta = eds.EDGE_META_JSON
        saved_wrangler_q = eds._wrangler_d1_query
        saved_env = {k: os.environ.pop(k, None) for k in ("ISABI_JWT_SECRET", "ISABI_ALLOW_DEV_SECRET", "ISABI_NO_WRANGLER_STORE")}
        mock_db = tdp / "mock_remote.db"
        eds.EDGE_META_JSON = tdp / "missing_cloudflare_edge_meta.json"

        def _init_mock_db() -> None:
            con = sqlite3.connect(str(mock_db))
            try:
                con.executescript(
                    "DROP TABLE IF EXISTS edge_kv_store;"
                    "DROP TABLE IF EXISTS alert_rules;"
                    "DROP TABLE IF EXISTS users;"
                    "DROP TABLE IF EXISTS auth_sessions;"
                    "CREATE TABLE edge_kv_store (doc_key TEXT PRIMARY KEY, payload_json TEXT DEFAULT '{}', updated_at TEXT DEFAULT '', updated_by TEXT DEFAULT '', rev INTEGER DEFAULT 1);"
                    "CREATE TABLE alert_rules (id TEXT PRIMARY KEY, kind TEXT DEFAULT '', payload_json TEXT DEFAULT '{}', updated_at TEXT DEFAULT '');"
                    "CREATE TABLE users (id TEXT PRIMARY KEY, full_name TEXT DEFAULT '', email TEXT DEFAULT '', pin_code TEXT DEFAULT '', role TEXT DEFAULT '', companies TEXT DEFAULT 'All', pbi_access INTEGER DEFAULT 0, statements_access INTEGER DEFAULT 0, status TEXT DEFAULT 'active', last_login_at TEXT DEFAULT '', face_samples TEXT DEFAULT '[]', face_thumbs TEXT DEFAULT '[]', face_required INTEGER DEFAULT 0, face_updated_at TEXT DEFAULT '', seat_updated_at TEXT DEFAULT '', custom_perms TEXT DEFAULT '', auth_mode TEXT DEFAULT '', payload_json TEXT DEFAULT '{}');"
                    "CREATE TABLE auth_sessions (id TEXT PRIMARY KEY, user_id TEXT DEFAULT '', email TEXT DEFAULT '', full_name TEXT DEFAULT '', role TEXT DEFAULT '', companies TEXT DEFAULT '[]', device TEXT DEFAULT '', logged_in_at TEXT DEFAULT '', method TEXT DEFAULT '', confidence REAL DEFAULT 0, ip_hash TEXT DEFAULT '');"
                )
                con.commit()
            finally:
                con.close()

        def _mock_wrangler_q(sql: str, timeout: int = 60) -> list[dict]:
            con = sqlite3.connect(str(mock_db))
            con.row_factory = sqlite3.Row
            try:
                cur = con.execute(sql)
                return [dict(r) for r in cur.fetchall()]
            finally:
                con.close()

        try:
            eds._wrangler_d1_query = _mock_wrangler_q
            _init_mock_db()
            full_store = json.dumps(LIVE_V1, separators=(",", ":"))
            mid = len(full_store) // 2
            ws_full = json.dumps({"shiftTypes": [{"id": "day", "name": "Day"}], "weeklyShifts": {"u1": {"mon": "day"}}}, separators=(",", ":"))
            ws_mid = len(ws_full) // 2
            con = sqlite3.connect(str(mock_db))
            try:
                con.execute(
                    "INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES (?, ?, ?, ?, ?)",
                    ("mfg_web_store", full_store[:mid], LIVE_V1["updatedAt"], "browser", 4),
                )
                con.execute(
                    "INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES (?, ?, ?, ?, ?)",
                    ("mfg_web_store__part_0001", full_store[mid:], LIVE_V1["updatedAt"], "browser", 4),
                )
                con.execute(
                    "INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES (?, ?, ?, ?, ?)",
                    ("work_schedules", ws_full[:ws_mid], "2026-11-13T08:10:00.000Z", "browser", 2),
                )
                con.execute(
                    "INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES (?, ?, ?, ?, ?)",
                    ("work_schedules__part_0001", ws_full[ws_mid:], "2026-11-13T08:10:00.000Z", "browser", 2),
                )
                con.execute(
                    "INSERT INTO alert_rules (id, kind, payload_json, updated_at) VALUES (?, ?, ?, ?)",
                    ("ar_custom_1", "custom", json.dumps({"id": "ar_custom_1", "name": "Diesel Spike", "updated_at": "2026-11-13T08:05:00.000Z"}), "2026-11-13T08:05:00.000Z"),
                )
                con.execute(
                    "INSERT INTO users (id, full_name, email, pin_code, role, companies, status, face_samples, face_thumbs, face_required, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    ("u1", "Owner", "owner@example.com", "9876", "Full Access (Owner)", "All", "active", json.dumps([[0.1] * 128]), '["thumb1"]', 1, json.dumps({"id": "u1", "email": "owner@example.com", "pin_code": "9876", "face_samples": [[0.1] * 128]})),
                )
                con.execute(
                    "INSERT INTO auth_sessions (id, user_id, email, full_name, role, companies, device, logged_in_at, method, confidence, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    ("sess-wr-1", "u1", "owner@example.com", "Owner", "Full Access (Owner)", '["All"]', "Chrome", "2026-11-13T08:12:00.000Z", "pin", 1.0, "abc"),
                )
                con.commit()
            finally:
                con.close()

            with contextlib.redirect_stdout(io.StringIO()):
                wr_got = eds._fetch_edge_store()
            u1_out = (wr_got.get("users") or [{}])[0]
            check("wrangler fallback stitches multi-part store + overlay tables",
                  wr_got.get("updatedAt") == LIVE_V1["updatedAt"]
                  and len((wr_got.get("customRecords") or {}).get("sales_tickets") or []) == 2
                  and (wr_got.get("workSchedules") or {}).get("shiftTypes", [{}])[0].get("id") == "day"
                  and len((wr_got.get("alertRules") or {}).get("custom") or []) == 1
                  and any(s.get("id") == "sess-wr-1" for s in (wr_got.get("sessions") or [])),
                  str(list(wr_got.keys())))
            check("wrangler user overlay redacts pin_code and face_samples",
                  "pin_code" not in u1_out and "face_samples" not in u1_out
                  and u1_out.get("pin_redacted") is True and u1_out.get("face_redacted") is True and u1_out.get("face_enrolled") is True,
                  str(u1_out))

            os.environ["ISABI_NO_WRANGLER_STORE"] = "1"
            with contextlib.redirect_stdout(io.StringIO()):
                disabled_got = eds._fetch_edge_store()
            check("ISABI_NO_WRANGLER_STORE=1 disables Wrangler fallback", disabled_got == {})
            os.environ.pop("ISABI_NO_WRANGLER_STORE", None)

            # Torn JSON in part_0001 -> refused and StaleStoreRefused on delta export
            con = sqlite3.connect(str(mock_db))
            try:
                con.execute("UPDATE edge_kv_store SET payload_json = ? WHERE doc_key = 'mfg_web_store__part_0001'", ("{BROKEN_JSON",))
                con.commit()
            finally:
                con.close()
            refused_torn = False
            try:
                with contextlib.redirect_stdout(io.StringIO()):
                    eds.export_all(delta=True)
            except eds.StaleStoreRefused:
                refused_torn = True
            check("NEGATIVE: torn multi-part JSON via Wrangler raises StaleStoreRefused", refused_torn)

            # Orphan part with missing head row -> refused and StaleStoreRefused
            con = sqlite3.connect(str(mock_db))
            try:
                con.execute("DELETE FROM edge_kv_store WHERE doc_key = 'mfg_web_store'")
                con.commit()
            finally:
                con.close()
            refused_orphan = False
            try:
                with contextlib.redirect_stdout(io.StringIO()):
                    eds.export_all(delta=True)
            except eds.StaleStoreRefused:
                refused_orphan = True
            check("NEGATIVE: orphan mfg_web_store__part_* via Wrangler raises StaleStoreRefused", refused_orphan)

            # Re-seed valid Wrangler head + part, plus u2 (no PIN / no face) carrying pin_hash & payload_json -> verify KV redaction
            kv_payload = json.loads(json.dumps(LIVE_V1))
            kv_payload["users"] = [
                {"id": "u1", "email": "owner@example.com", "full_name": "Owner", "role": "Full Access (Owner)", "pin_hash": "secret_h1"},
                {"id": "u2", "email": "staff@example.com", "full_name": "Staff", "role": "Admin", "pin_hash": "secret_h2"},
            ]
            full_u = json.dumps(kv_payload, separators=(",", ":"))
            mid_u = len(full_u) // 2
            con = sqlite3.connect(str(mock_db))
            try:
                con.execute("DELETE FROM edge_kv_store WHERE substr(doc_key, 1, 13) = 'mfg_web_store'")
                con.execute(
                    "INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES (?, ?, ?, ?, ?)",
                    ("mfg_web_store", full_u[:mid_u], LIVE_V1["updatedAt"], "browser", 5),
                )
                con.execute(
                    "INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES (?, ?, ?, ?, ?)",
                    ("mfg_web_store__part_0001", full_u[mid_u:], LIVE_V1["updatedAt"], "browser", 5),
                )
                con.execute(
                    "INSERT OR REPLACE INTO users (id, full_name, email, pin_code, role, companies, status, face_samples, face_thumbs, face_required, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    ("u2", "Staff", "staff@example.com", "", "Admin", "All", "active", "[]", "[]", 0, json.dumps({"id": "u2", "email": "staff@example.com", "pin_hash": "secret_h2", "has_pin": 0, "has_face_samples": 0})),
                )
                con.commit()
            finally:
                con.close()

            with contextlib.redirect_stdout(io.StringIO()):
                files_u, _ = eds.export_all(delta=True)
            kv_mem = sqlite3.connect(":memory:")
            try:
                kv_mem.execute("CREATE TABLE edge_kv_store (doc_key TEXT PRIMARY KEY, payload_json TEXT, updated_at TEXT, updated_by TEXT, rev INTEGER)")
                for fp_u in files_u:
                    for ln_u in pathlib.Path(fp_u).read_text(encoding="utf-8").split("\n"):
                        if ln_u.startswith("INSERT OR REPLACE INTO edge_kv_store"):
                            kv_mem.execute(ln_u)
                stage_rows = kv_mem.execute(
                    "SELECT doc_key, payload_json FROM edge_kv_store WHERE substr(doc_key, 1, 20) = 'mfg_web_store__next_' ORDER BY doc_key"
                ).fetchall()
                staged_doc = json.loads("".join(r[1] for r in stage_rows))
            finally:
                kv_mem.close()
            staged_by_email = {str(u.get("email") or "").lower(): u for u in (staged_doc.get("users") or [])}
            su1 = staged_by_email.get("owner@example.com", {})
            su2 = staged_by_email.get("staff@example.com", {})
            banned_keys = ("pin_hash", "payload_json", "pin_code", "_verifiedPin", "face_samples", "face_thumbs", "_d1_authoritative_id", "has_pin", "has_face_samples")
            check(
                "KV staging strips pin_hash/payload_json and keeps conditional pin_redacted/face_redacted",
                all(k not in su1 and k not in su2 for k in banned_keys)
                and su1.get("pin_redacted") is True and su1.get("face_redacted") is True and su1.get("face_enrolled") is True
                and su2.get("pin_redacted") is False and su2.get("face_redacted") is False and su2.get("face_enrolled") is False,
                str((su1, su2)),
            )

            # HTTP 401 -> Wrangler fallback succeeds; HTTP 500 -> does NOT fall back and raises StaleStoreRefused
            os.environ["ISABI_JWT_SECRET"] = "x" * 32
            try:
                def _raise_401(*a, **kw):
                    raise urllib.error.HTTPError("https://isabisystems.com/app/api/sync?action=get", 401, "Unauthorized", {}, io.BytesIO(b'{"error":"invalid token"}'))

                eds.urllib.request.urlopen = _raise_401
                with contextlib.redirect_stdout(io.StringIO()):
                    got_401 = eds._fetch_edge_store()
                check("HTTP 401 falls back to Wrangler D1 store", got_401.get("updatedAt") == LIVE_V1["updatedAt"], str(list(got_401.keys())))

                def _raise_500(*a, **kw):
                    raise urllib.error.HTTPError("https://isabisystems.com/app/api/sync?action=get", 500, "Server Error", {}, io.BytesIO(b'{"error":"db error"}'))

                eds.urllib.request.urlopen = _raise_500
                refused_500 = False
                try:
                    with contextlib.redirect_stdout(io.StringIO()):
                        eds.export_all(delta=True)
                except eds.StaleStoreRefused:
                    refused_500 = True
                check("NEGATIVE: HTTP 500 does not fall back to Wrangler and raises StaleStoreRefused", refused_500)
            finally:
                eds.urllib.request.urlopen = saved_urlopen
                os.environ.pop("ISABI_JWT_SECRET", None)

            # _parse_wrangler_json_rows handles leading [wrangler:inf] noise lines cleanly
            parsed_wr = eds._parse_wrangler_json_rows('[wrangler:inf] warn\n[{"results":[{"k":1}]}]')
            check("_parse_wrangler_json_rows skips [wrangler:inf] noise and extracts results", parsed_wr == [{"k": 1}], str(parsed_wr))

            # Symmetric redacted biometric & pin preservation + seat_updated_at precedence in _merge_user_rows
            sa_e = {"id": "u-old", "email": "Mix@Example.com", "role": "Viewer", "seat_updated_at": "2026-11-14T10:00:00Z", "last_login_at": "2026-11-10T00:00:00Z", "face_enrolled": True, "pin_redacted": True}
            sb_e = {"id": "u-auth", "email": "mix@example.com", "role": "Admin", "seat_updated_at": "2026-11-14T09:00:00Z", "last_login_at": "2026-11-14T12:00:00Z", "face_enrolled": False, "pin_redacted": False, "_d1_authoritative_id": True}
            me_ab = eds._merge_user_rows(sa_e, sb_e)
            me_ba = eds._merge_user_rows(sb_e, sa_e)
            check(
                "_merge_user_rows keeps face_enrolled, pin_redacted, D1 id, and seat_updated_at winner symmetrically",
                me_ab.get("role") == "Viewer" and me_ba.get("role") == "Viewer"
                and me_ab.get("id") == "u-auth" and me_ba.get("id") == "u-auth"
                and me_ab.get("face_enrolled") is True and me_ba.get("face_enrolled") is True
                and me_ab.get("pin_redacted") is True and me_ba.get("pin_redacted") is True,
                str((me_ab, me_ba)),
            )

            # Wrangler query failure without JWT surfaces wrangler://d1/isabi-ledger (not "no Edge sign-in secret")
            eds._EDGE_PULL_FAILURES.clear()
            eds._wrangler_d1_query = lambda sql, timeout=60: (_ for _ in ()).throw(RuntimeError("wrangler boom"))
            try:
                with contextlib.redirect_stdout(io.StringIO()):
                    got_wr_err = eds._fetch_edge_store()
                wr_fails = list(eds._EDGE_PULL_FAILURES)
                check(
                    "Wrangler error on no-JWT logs wrangler://d1/isabi-ledger instead of no Edge sign-in secret",
                    got_wr_err == {}
                    and any("wrangler://d1/isabi-ledger" in msg for msg in wr_fails)
                    and not any("no Edge sign-in secret" in msg for msg in wr_fails),
                    str(wr_fails),
                )
            finally:
                eds._wrangler_d1_query = _mock_wrangler_q

            # ---- Round 2 Red-Team Remediation Assertions ----
            import math as _r2_math
            import pathlib as _r2_pathlib
            import re as _r2_re
            import sqlite3 as _r2_sqlite3

            # R2.1: merge_mfg_web_stores preserves shift_code-only workSchedules.shiftTypes
            ws_merged = eds.merge_mfg_web_stores(
                {"updatedAt": "2026-11-10T02:00:00Z", "workSchedules": {"shiftTypes": [{"shift_code": "A1", "name": "Day"}]}},
                {"updatedAt": "2026-11-10T01:00:00Z", "workSchedules": {"shiftTypes": [{"shift_code": "B1", "name": "Night"}]}},
            )
            ws_codes = {
                str(x.get("shift_code") or "")
                for x in ((ws_merged.get("workSchedules") or {}).get("shiftTypes") or [])
                if isinstance(x, dict)
            }
            check(
                "eds.merge_mfg_web_stores preserves shift_code-only workSchedules.shiftTypes across both inputs",
                ws_codes == {"A1", "B1"},
                str(ws_merged.get("workSchedules")),
            )

            # Build real schema in-memory SQLite DB for strict Wrangler JSON1 & head-guard execution tests
            _schema_path = _r2_pathlib.Path(eds.__file__).resolve().parent.parent / "migrations" / "0001_schema.sql"
            _r2_con = _r2_sqlite3.connect(":memory:")
            _r2_con.row_factory = _r2_sqlite3.Row
            _r2_con.executescript(_schema_path.read_text(encoding="utf-8"))

            def _r2_run_sql_against_con(sql, timeout=60):
                low = sql.lower()
                if "edge_kv_store" in low or " from users" in low or "from users " in low:
                    try:
                        cur = _r2_con.execute(sql)
                        return [dict(r) for r in cur.fetchall()]
                    except _r2_sqlite3.OperationalError:
                        return _mock_wrangler_q(sql, timeout)
                return _mock_wrangler_q(sql, timeout)

            # R2.2: Empty SQL updated_at == '' with non-empty JSON updatedAt + head_guard + KV staging redaction + strict 128-d face_samples
            _store_r2 = json.loads(json.dumps(LIVE_V1))
            _store_r2["updatedAt"] = "2026-11-10T05:00:00Z"
            _store_r2["users"] = [
                {
                    "id": "u-bad-cnt",
                    "full_name": "Bad Cnt",
                    "email": "badcnt@example.com",
                    "role": "Operator",
                    "companies": "WTC",
                    "status": "active",
                    "face_enrolled": False,
                    "face_sample_count": "bad",
                    "face_updated_at": "2026-11-10T00:00:00Z",
                }
            ]
            _r2_con.execute("DELETE FROM edge_kv_store")
            _r2_con.execute(
                "INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES (?, ?, ?, ?, ?)",
                ("mfg_web_store", json.dumps(_store_r2), "", "browser", 1),
            )
            _r2_con.execute("DELETE FROM users")
            for _fid, _fval in [
                ("f-null", "null"),
                ("f-space", "[   ]"),
                ("f-empty", "[[]]"),
                ("f-64", json.dumps([[0.1] * 64])),
                ("f-128", json.dumps([[0.1] * 128])),
            ]:
                _r2_con.execute(
                    "INSERT INTO users (id, full_name, email, pin_code, role, companies, status, face_samples, payload_json) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (_fid, _fid, f"{_fid}@example.com", "", "Operator", "WTC", "active", _fval, json.dumps({"id": _fid, "email": f"{_fid}@example.com"})),
                )
            _r2_con.commit()

            eds._wrangler_d1_query = _r2_run_sql_against_con
            try:
                with contextlib.redirect_stdout(io.StringIO()):
                    fetched_r2 = eds._fetch_edge_store()
                    files_r2, _meta_r2 = eds.export_all(delta=True)

                r2_users = {u["id"]: u for u in (fetched_r2.get("users") or []) if isinstance(u, dict)}
                face_sql_ok = (
                    r2_users.get("f-null", {}).get("face_enrolled") is False
                    and r2_users.get("f-space", {}).get("face_enrolled") is False
                    and r2_users.get("f-empty", {}).get("face_enrolled") is False
                    and r2_users.get("f-64", {}).get("face_enrolled") is False
                    and r2_users.get("f-128", {}).get("face_enrolled") is True
                )

                kv_lines = [
                    ln
                    for fp in sorted(files_r2, key=lambda x: str(x))
                    for ln in fp.read_text(encoding="utf-8").splitlines()
                    if "edge_kv_store" in ln
                ]

                def _exec_head_guard(seed_payload: str, seed_ts: str) -> tuple[str, dict | None, int]:
                    c = _r2_sqlite3.connect(":memory:")
                    c.executescript(
                        "CREATE TABLE edge_kv_store (doc_key TEXT PRIMARY KEY, payload_json TEXT DEFAULT '{}', updated_at TEXT DEFAULT '', updated_by TEXT DEFAULT '', rev INTEGER DEFAULT 1);"
                    )
                    c.execute(
                        "INSERT INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES (?, ?, ?, ?, ?)",
                        ("mfg_web_store", seed_payload, seed_ts, "browser", 1),
                    )
                    c.commit()
                    c.executescript("\n".join(kv_lines))
                    ts_row = c.execute("SELECT updated_at FROM edge_kv_store WHERE doc_key = 'mfg_web_store'").fetchone()
                    part_rows = c.execute(
                        "SELECT payload_json FROM edge_kv_store WHERE doc_key = 'mfg_web_store' OR doc_key LIKE 'mfg_web_store__part_%' ORDER BY doc_key ASC"
                    ).fetchall()
                    staged_left = c.execute(
                        "SELECT count(*) FROM edge_kv_store WHERE doc_key LIKE 'mfg_web_store__next_%'"
                    ).fetchone()[0]
                    stitched_raw = "".join(r[0] or "" for r in part_rows)
                    try:
                        stitched_doc = json.loads(stitched_raw) if stitched_raw else None
                    except Exception:
                        stitched_doc = None
                    c.close()
                    return (ts_row[0] if ts_row else ""), stitched_doc, int(staged_left)

                ts_blank_after, doc_blank_after, staged_blank = _exec_head_guard('{"updatedBy":"old"}', "")
                ts_conc_after, doc_conc_after, staged_conc = _exec_head_guard('{"updatedBy":"browser"}', "2099-01-01T00:00:00Z")
                bad_cnt_staged = next(
                    (u for u in ((doc_blank_after or {}).get("users") or []) if isinstance(u, dict) and u.get("id") == "u-bad-cnt"),
                    {},
                )

                check(
                    "R2: empty SQL updated_at == '' swaps cleanly while 2099-01-01 preserves browser copy, 128-d face_enrolled strict, bad face_sample_count sets face_cleared, sql_lit(inf)==NULL",
                    bool(kv_lines)
                    and ts_blank_after == "2026-11-10T05:00:00Z"
                    and isinstance(doc_blank_after, dict)
                    and staged_blank == 0
                    and ts_conc_after == "2099-01-01T00:00:00Z"
                    and isinstance(doc_conc_after, dict) and doc_conc_after.get("updatedBy") == "browser"
                    and staged_conc == 0
                    and face_sql_ok is True
                    and bad_cnt_staged.get("face_cleared") is True
                    and bad_cnt_staged.get("face_sample_count") == 0
                    and eds.sql_lit(float("inf")) == "NULL"
                    and eds.sql_lit(float("-inf")) == "NULL"
                    and eds.sql_lit(_r2_math.nan) == "NULL",
                    str((len(kv_lines), ts_blank_after, staged_blank, ts_conc_after, doc_conc_after, staged_conc, face_sql_ok, bad_cnt_staged)),
                )

                # R2.3: Torn work_schedules ('{BROKEN') raises StaleStoreRefused on export_all(delta=True)
                _r2_con.execute(
                    "INSERT OR REPLACE INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES (?, ?, ?, ?, ?)",
                    ("work_schedules", "{BROKEN", "2026-11-10T06:00:00Z", "browser", 1),
                )
                _r2_con.commit()
                eds._EDGE_PULL_FAILURES.clear()
                torn_refused = False
                try:
                    with contextlib.redirect_stdout(io.StringIO()):
                        eds.export_all(delta=True)
                except eds.StaleStoreRefused:
                    torn_refused = True
                check(
                    "Torn work_schedules ('{BROKEN') refuses delta export with StaleStoreRefused",
                    torn_refused is True,
                    str(eds._EDGE_PULL_FAILURES),
                )

                # R2.4: _parse_wrangler_json_rows propagates batch errors as RuntimeError
                eds_batch_errs_ok = True
                for bad_json in (
                    '[{"success": false, "error": "SQLITE_ERROR"}]',
                    '[{"results":[]}, {"success": false, "error": "boom"}]',
                    "[true, false]",
                ):
                    try:
                        eds._parse_wrangler_json_rows(bad_json)
                        eds_batch_errs_ok = False
                    except RuntimeError:
                        pass
                check("eds._parse_wrangler_json_rows raises RuntimeError on batch errors", eds_batch_errs_ok)
            finally:
                eds._wrangler_d1_query = _mock_wrangler_q
                _r2_con.close()
        finally:
            eds._wrangler_d1_query = saved_wrangler_q
            eds.EDGE_META_JSON = saved_edge_meta
            for k, v in saved_env.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v
    finally:
        for k, v in saved.items():
            setattr(eds, k, v)
        eds.urllib.request.urlopen = saved_urlopen
        eds.export_all.__defaults__ = saved_defaults
        eds.promote_pending_manifest.__defaults__ = saved_promote_defaults

print(f"\n{PASSES} passed, {len(FAILS)} failed")
sys.exit(1 if FAILS else 0)
