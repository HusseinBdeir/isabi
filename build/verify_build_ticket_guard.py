"""verify_build_ticket_guard.py - offline gate for the build-ticket sign-in of the build scripts
(export_d1_seed.py: _build_ticket_allowed, mint_build_ticket, _drop_build_ticket, _mint_cli_edge_jwt). The same gate
lives in isabi-app (build/verify_build_ticket_guard.py) for reconcile_cloud_store.py: keep the two in step.

A build ticket is a row in the live database, so the scripts must issue one only in a real run. This gate pins down:
  * who may issue one: the release scripts started as the main program, or a run that asks by name; never a gate,
    a test, `python -c`, another script, a run given a signing secret, or a run whose network or
    Wrangler call a gate has replaced (also when it was replaced before this module was imported);
  * what is issued: only the SHA-256 of the ticket goes to the database, the ticket goes only into
    X-ISABI-Session, it is probed once, kept for the process, renewed a minute before it expires, deleted at exit;
  * what happens when it cannot be used: nothing on stdout, the reason (never the ticket) on stderr, no second try,
    and the signed session is used exactly as before.
Calls no service: Wrangler and the network are replaced throughout.   Run: python build/verify_build_ticket_guard.py
"""
from __future__ import annotations

import contextlib
import datetime as dt
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from unittest import mock

sys.stdout.reconfigure(encoding="utf-8")
BUILD = Path(__file__).resolve().parent
sys.path.insert(0, str(BUILD))

import export_d1_seed as M  # noqa: E402

WRANGLER_ATTR = "_wrangler_d1_query"
PROGRAM = "export_d1_seed.py"
ENV_KEYS = ("ISABI_BUILD_TICKET", "ISABI_NO_BUILD_TICKET", "ISABI_NO_WRANGLER_STORE", "ISABI_JWT_SECRET", "ISABI_ALLOW_DEV_SECRET")
FAILED: list[str] = []
COUNT = 0


def check(label: str, got, want=True) -> None:
    global COUNT
    COUNT += 1
    if got != want:
        FAILED.append(f"{label}: got {got!r}, expected {want!r}")


MAIN = sys.modules["__main__"]
REAL_FILE = MAIN.__file__
REAL_ARGV = list(sys.argv)
REAL_ENV = {k: os.environ.get(k) for k in ENV_KEYS}
REAL_WRANGLER = getattr(M, WRANGLER_ATTR)
REAL_URLOPEN = urllib.request.urlopen
REAL_ALLOWED = M._build_ticket_allowed


@contextlib.contextmanager
def running_as(name: str | None, argv: tuple = (), env: dict | None = None):
    """Pretend the main program is `name` (None = no file at all, as under `python -c`), with these arguments and
    only these ISABI_* variables."""
    for k in ENV_KEYS:
        os.environ.pop(k, None)
    os.environ.update(env or {})
    if name is None:
        del MAIN.__file__
    else:
        MAIN.__file__ = str(BUILD / name)
    sys.argv = [name or "-c", *argv]
    try:
        yield
    finally:
        MAIN.__file__ = REAL_FILE
        sys.argv = list(REAL_ARGV)
        for k in ENV_KEYS:
            os.environ.pop(k, None)
        for k, v in REAL_ENV.items():
            if v is not None:
                os.environ[k] = v


def allowed(name: str | None = PROGRAM, argv: tuple = (), env: dict | None = None) -> bool:
    with running_as(name, argv, env):
        return bool(M._build_ticket_allowed())


# ---- 1. who may issue a ticket ------------------------------------------------------------------------------------------
check("this gate itself may not", bool(M._build_ticket_allowed()), False)
check("control: the build script, clean environment, real Wrangler and network -> may", allowed())
for prog in sorted(M.BUILD_TICKET_PROGRAMS):
    check(f"listed program {prog} -> may", allowed(prog))
check("a gate", allowed("verify_seed_stale_store.py"), False)
check("a gate that asks by name still may not", allowed("verify_seed_stale_store.py", env={"ISABI_BUILD_TICKET": "1"}), False)
check("a test", allowed("test_anything.py"), False)
check("another script", allowed("some_notebook_export.py"), False)
check("...unless the run asks by name", allowed("some_notebook_export.py", env={"ISABI_BUILD_TICKET": "1"}))
check("no main file (python -c, stdin)", allowed(None), False)
# (A --dry run of the release scripts prints its plan and ends before any live pull: main() -> print_dry_run_plan.
#  This module must not read the command line itself: verify_deploy_cli.py, no-raw-sys-argv.)
check("the module reads no command line of its own", "sys." + "argv" in Path(M.__file__).read_text(encoding="utf-8"), False)
check("a wet run with the same arguments", allowed(argv=("--until", "2026-11-16")))
check("ISABI_NO_BUILD_TICKET=1", allowed(env={"ISABI_NO_BUILD_TICKET": "1"}), False)
check("ISABI_NO_WRANGLER_STORE=1", allowed(env={"ISABI_NO_WRANGLER_STORE": "1"}), False)
check("a signing secret given explicitly", allowed(env={"ISABI_JWT_SECRET": "x" * 32}), False)
check("the dev secret switch", allowed(env={"ISABI_ALLOW_DEV_SECRET": "1"}), False)


def fake_urlopen(*a, **k):  # a gate's stand-in: defined in this module, so not urllib's own
    raise AssertionError("network must not be reached")


def urlopen(*a, **k):  # same name as the real one, another module
    raise AssertionError("network must not be reached")


import functools  # noqa: E402


@functools.wraps(REAL_URLOPEN)
def wrapped_urlopen(*a, **k):  # carries the real one's name and module (red-team 2026-11-16)
    raise AssertionError("network must not be reached")


for label, stand_in in (("a plain function", fake_urlopen), ("a function that is also called urlopen", urlopen), ("a MagicMock", mock.MagicMock()),
                        ("a functools.wraps stand-in carrying the real name and module", wrapped_urlopen)):
    urllib.request.urlopen = stand_in
    try:
        check(f"network call replaced by {label}", allowed(), False)
    finally:
        urllib.request.urlopen = REAL_URLOPEN
setattr(M, WRANGLER_ATTR, lambda *a, **k: [])
try:
    check("Wrangler call replaced", allowed(), False)
finally:
    setattr(M, WRANGLER_ATTR, REAL_WRANGLER)
check("control again after restoring both", allowed())

# Replaced BEFORE the module is imported (red-team 2026-11-16: an identity check against a copy kept at import would
# pass). Run in a child process whose main file carries the build script's name, so only the network guard decides.
CHILD = """
import os, sys, urllib.request
here = os.path.dirname(os.path.abspath(__file__))
sys.path = [p for p in sys.path if os.path.abspath(p or ".") != here]  # this file carries the module's name: never import it
sys.path.insert(0, {build!r})
{patch}
import {module} as M
print("allowed=" + str(bool(M._build_ticket_allowed())))
"""
with tempfile.TemporaryDirectory(prefix="bt_guard_") as td:
    child_env = {k: v for k, v in os.environ.items() if k not in ENV_KEYS}
    child_env["PYTHONDONTWRITEBYTECODE"] = "1"
    for label, patch, want in (
        ("control: nothing replaced before import -> may", "", "allowed=True"),
        ("network call replaced before import", "urllib.request.urlopen = lambda *a, **k: None", "allowed=False"),
    ):
        script = Path(td) / PROGRAM
        script.write_text(CHILD.format(build=str(BUILD), patch=patch, module=M.__name__), encoding="utf-8")
        out = subprocess.run([sys.executable, str(script)], capture_output=True, text=True, env=child_env, timeout=120)
        check(label, (out.stdout.strip().splitlines() or [out.stderr.strip()[-200:]])[-1], want)

# ---- 2. what is issued (Wrangler and the network replaced; the guard is switched on by hand) ---------------------------
calls: dict = {"sql": [], "probe": []}


class FakeResp:
    def __init__(self, status=200, body=b'{"ok": true, "cashflow_behind": null}'):
        self.status, self._body = status, body

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def fake_wrangler(sql: str = "", *a, **k):
    calls["sql"].append(sql or (a[0] if a else ""))
    return []


def probe_ok(req, timeout=0):
    calls["probe"].append(req)
    return FakeResp()


def probe_401(req, timeout=0):
    calls["probe"].append(req)
    raise urllib.error.HTTPError(req.full_url, 401, "Unauthorized", None, None)


def reset():
    calls["sql"].clear()
    calls["probe"].clear()
    M._BUILD_TICKET.update({"tok": "", "exp": 0.0, "off": "", "digest": ""})


def run_mint(probe, wrangler=fake_wrangler):
    """mint_build_ticket() with the guard open and both outside calls replaced; returns (ticket, stdout, stderr)."""
    out, err = io.StringIO(), io.StringIO()
    M._build_ticket_allowed = lambda: True
    setattr(M, WRANGLER_ATTR, wrangler)
    urllib.request.urlopen = probe
    try:
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            tok = M.mint_build_ticket()
    finally:
        M._build_ticket_allowed = REAL_ALLOWED
        setattr(M, WRANGLER_ATTR, REAL_WRANGLER)
        urllib.request.urlopen = REAL_URLOPEN
    return tok, out.getvalue(), err.getvalue()


reset()
t0 = time.time()
tok, out, err = run_mint(probe_ok)
check("a ticket is issued", bool(re.fullmatch(r"bt1_[A-Za-z0-9_-]{43}", tok or "")))
check("nothing is printed", (out, err), ("", ""))
check("one Wrangler call, one probe", (len(calls["sql"]), len(calls["probe"])), (1, 1))
sql = calls["sql"][0] if calls["sql"] else ""
digest = hashlib.sha256((tok or "").encode("ascii")).hexdigest()
check("the database gets the SHA-256 of the ticket", f"VALUES ('{digest}'," in sql)
check("...and never the ticket itself", (tok or "bt1_") in sql or "bt1_" in sql, False)
check("the table is created when missing", "CREATE TABLE IF NOT EXISTS build_tickets (ticket_hash TEXT PRIMARY KEY, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);" in sql)
stamps = re.findall(r"'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z)'", sql)
check("three timestamps: the cleanup line, the expiry, the creation time", len(stamps), 3)
if len(stamps) == 3:
    p = lambda s: dt.datetime.strptime(s, "%Y-%m-%dT%H:%M:%S.000Z").replace(tzinfo=dt.timezone.utc)  # noqa: E731
    cleanup, expires, created = (p(s) for s in stamps)
    check("the ticket lives ten minutes", (expires - created).total_seconds(), float(M.BUILD_TICKET_TTL_SEC))
    check("...inside the Edge's 15-minute cap", M.BUILD_TICKET_TTL_SEC < 900)
    check("cleanup only removes rows 15 minutes past their expiry (a fast clock elsewhere cannot delete a live ticket)", (created - cleanup).total_seconds(), 900.0)
    check("the creation time is now", abs(created.timestamp() - t0) < 5)
check("the cleanup is by expiry only", "DELETE FROM build_tickets WHERE expires_at < '" in sql and sql.count("DELETE") == 1)
req = calls["probe"][0] if calls["probe"] else None
check("the probe is a GET of the Owner notice", (req.full_url, req.get_method()) if req else None, (M.BUILD_TICKET_PROBE_URL, "GET"))
check("the ticket travels in X-ISABI-Session only", ({k.lower(): v for k, v in req.header_items()}.get("x-isabi-session"), [v for k, v in req.header_items() if k.lower() != "x-isabi-session" and tok in str(v)]) if req else None, (tok, []))
check("the probe carries no cookie and no origin (the Edge refuses a ticket beside either)", [k for k, _ in req.header_items() if k.lower() in ("cookie", "origin")] if req else None, [])
tok2, _, _ = run_mint(probe_ok)
check("a second call in the same process reuses it: no Wrangler call, no probe", (tok2, len(calls["sql"]), len(calls["probe"])), (tok, 1, 1))
M._build_ticket_allowed = lambda: True
try:
    check("_mint_cli_edge_jwt hands out the ticket", M._mint_cli_edge_jwt(), tok)
finally:
    M._build_ticket_allowed = REAL_ALLOWED
M._BUILD_TICKET["exp"] = time.time() + 30
tok3, _, _ = run_mint(probe_ok)
check("under a minute left: a new ticket is issued", (tok3 != tok, bool(re.fullmatch(r"bt1_[A-Za-z0-9_-]{43}", tok3 or "")), len(calls["sql"])), (True, True, 2))

# deleted at exit
setattr(M, WRANGLER_ATTR, fake_wrangler)
try:
    held = M._BUILD_TICKET["digest"]
    n_before = len(calls["sql"])
    M._drop_build_ticket()  # the guard is closed here (this is a gate): nothing may be called, the state is still cleared
    check("at exit inside a gate: no Wrangler call even with a digest left behind", (len(calls["sql"]), M._BUILD_TICKET["digest"]), (n_before, ""))
    M._BUILD_TICKET["digest"] = held
    M._build_ticket_allowed = lambda: True
    M._drop_build_ticket()
    check("at exit the run deletes its own ticket row, by hash", calls["sql"][-1], f"DELETE FROM build_tickets WHERE ticket_hash = '{held}';")
    check("...and forgets it", (M._BUILD_TICKET["tok"], M._BUILD_TICKET["digest"]), ("", ""))
    n = len(calls["sql"])
    M._drop_build_ticket()
    check("a second call at exit does nothing", len(calls["sql"]), n)
    M._BUILD_TICKET["digest"] = "x'; DROP TABLE users; --"
    M._drop_build_ticket()
    check("a value that is not a SHA-256 is never put into SQL", len(calls["sql"]), n)
finally:
    M._build_ticket_allowed = REAL_ALLOWED
    setattr(M, WRANGLER_ATTR, REAL_WRANGLER)

# ---- 3. when it cannot be used ------------------------------------------------------------------------------------------
reset()
tok, out, err = run_mint(probe_401)
check("the Edge refuses it (an older Edge build): no ticket", tok, "")
check("...the reason is kept", M._BUILD_TICKET["off"], "HTTP 401")
check("...nothing on stdout (some of these scripts print pure JSON there)", out, "")
check("...one line on stderr", err.strip().startswith("INFO: build ticket not usable (HTTP 401)"))
check("...which never shows a ticket", "bt1_" in err, False)
n_sql, n_probe = len(calls["sql"]), len(calls["probe"])
tok, out, err = run_mint(probe_401)
check("...and it is not tried again in this process", (tok, len(calls["sql"]), len(calls["probe"]), out, err), ("", n_sql, n_probe, "", ""))
with running_as(PROGRAM, env={"ISABI_JWT_SECRET": "gate-only-secret-0123456789abcdef"}):
    jwt = M._mint_cli_edge_jwt()
check("the signed session is then used exactly as before (three-part token)", (len(jwt.split(".")), jwt.startswith("bt1_")), (3, False))
with running_as(PROGRAM):
    saved_meta = M.EDGE_META_JSON
    M.EDGE_META_JSON = BUILD / "no-such-meta.json"
    try:
        M._build_ticket_allowed = lambda: False
        check("no ticket and no secret: empty, as before", M._mint_cli_edge_jwt(), "")
    finally:
        M._build_ticket_allowed = REAL_ALLOWED
        M.EDGE_META_JSON = saved_meta


def wrangler_down(sql: str = "", *a, **k):
    calls["sql"].append(sql)
    raise RuntimeError("wrangler d1 execute failed: not authenticated")


reset()
tok, out, err = run_mint(probe_ok, wrangler=wrangler_down)
check("Wrangler not signed in: no ticket, no probe, nothing on stdout", (tok, len(calls["probe"]), out), ("", 0, ""))
check("...the reason is on stderr", "not authenticated" in err)


def probe_echo(req, timeout=0):
    raise RuntimeError("upstream said: " + dict(req.header_items()).get("X-isabi-session", ""))


reset()
tok, out, err = run_mint(probe_echo)
check("an error text that quotes the ticket is scrubbed before it is kept or printed", ("bt1_" in err, "bt1_" in M._BUILD_TICKET["off"], "<ticket>" in err), (False, False, True))


def probe_not_ok(req, timeout=0):
    return FakeResp(200, b'{"ok": false}')


reset()
tok, out, err = run_mint(probe_not_ok)
check("a 200 that does not say ok is a refusal", (tok, M._BUILD_TICKET["off"]), ("", "the Edge did not accept it"))

reset()  # leave nothing for the exit hook
check("this gate reached neither Wrangler nor the network for real", (getattr(M, WRANGLER_ATTR) is REAL_WRANGLER, urllib.request.urlopen is REAL_URLOPEN, M._BUILD_TICKET["digest"]), (True, True, ""))

print(f"verify_build_ticket_guard: {COUNT - len(FAILED)}/{COUNT} checks passed")
for f in FAILED:
    print("  FAIL " + f)
sys.exit(1 if FAILED else 0)
