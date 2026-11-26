"""verify_speed_gate_wiring.py - the screen speed gate runs on every Command Center sync (owner 2026-11-20).

v19.6.384 shipped Sales and Fleet at twice the 150 ms screen budget and stayed live two days, because the speed gate
(isabi-app build/verify_speed_budget.mjs) was not part of a release. sync_app.py now runs it after RELEASE_GATES.
This gate keeps that wiring in place. Nothing is run: subprocess is replaced by a recorder.

  1. sync_app.SPEED_GATE names isabi-app build/verify_speed_budget.mjs (node) with its own timeout of 30 min or more
  2. it is not in RELEASE_GATES (its 600 s limit is too short for a full run on a loaded PC)
  3. --skip-release-gates still runs it; --skip-speed-gate "<reason>" skips it and prints the reason; a blank reason
     is refused
  4. a failing speed gate stops the sync (SystemExit), with the gate's own output
  4b. a release gate has 600 s; ISABI_GATE_TIMEOUT_S (set by release_batch.py lead) allows longer, because a
      browser gate first queues for the PC's one browser slot
  5. sync_command_app runs it after the RELEASE_GATES and before any file is copied

Usage: python build/verify_speed_gate_wiring.py
"""
from __future__ import annotations

import contextlib
import inspect
import io
import os
import subprocess
import sys
import tempfile

BUILD = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BUILD)
import sync_app as sa  # noqa: E402

passed = 0
failed = 0


def check(ok: bool, name: str, detail: str = "") -> None:
    global passed, failed
    if ok:
        passed += 1
        print(f"ok   {name}")
    else:
        failed += 1
        print(f"FAIL {name}{' - ' + detail if detail else ''}")


calls: list[dict] = []
next_rc = {"value": 0}
fake_stdout_pass = "PASSED: test\n"


def fake_run(cmd, **kw):
    calls.append({"cmd": [str(c) for c in cmd], "timeout": kw.get("timeout"), "cwd": kw.get("cwd")})
    return subprocess.CompletedProcess(cmd, next_rc["value"], stdout="FAILED: 7/8 correctness checks\n" if next_rc["value"] else fake_stdout_pass, stderr="")


def speed_calls() -> list[dict]:
    return [c for c in calls if any(x.replace("\\", "/").endswith("build/verify_speed_budget.mjs") for x in c["cmd"])]


# 1, 2
repo, rel, interp = sa.SPEED_GATE
check((repo, rel, interp) == ("isabi-app", "build/verify_speed_budget.mjs", "node"), "1 SPEED_GATE is isabi-app build/verify_speed_budget.mjs run with node", repr(sa.SPEED_GATE))
check(sa.SPEED_GATE_TIMEOUT_S >= 1800, f"1 the speed gate has its own timeout of 30 min or more ({sa.SPEED_GATE_TIMEOUT_S} s)")
check(all(g[1] != rel for g in sa.RELEASE_GATES), "2 the speed gate is not in RELEASE_GATES (600 s each)")

orig = {"run": sa.subprocess.run, "node": sa._node_runtime, "src": sa.APP_SRC_ROOT}
with tempfile.TemporaryDirectory() as td:
    os.makedirs(os.path.join(td, "build"))
    open(os.path.join(td, "build", "verify_speed_budget.mjs"), "w").close()
    for g in sa.RELEASE_GATES:
        if g[0] == "isabi-app":
            open(os.path.join(td, *g[1].split("/")), "w").close()
    try:
        sa.subprocess.run = fake_run
        sa._node_runtime = lambda: ("node", dict(os.environ))
        sa.APP_SRC_ROOT = td

        # 3. --skip-release-gates skips RELEASE_GATES, never the speed gate
        calls.clear()
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            sa.run_release_gates(skip_release_gates=True)
            sa.run_speed_gate(skip_reason="")
        sp = speed_calls()
        check(len(sp) == 1 and len(calls) == 1, "3 --skip-release-gates: the speed gate still runs, alone", f"{len(calls)} calls, {len(sp)} speed")
        check(bool(sp) and sp[0]["timeout"] == sa.SPEED_GATE_TIMEOUT_S, "3 the speed gate runs with its own timeout", str(sp[0]["timeout"] if sp else None))
        check(bool(sp) and os.path.normcase(sp[0]["cwd"] or "") == os.path.normcase(td), "3 the speed gate runs in the isabi-app tree being synced")

        calls.clear()
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            sa.run_speed_gate(skip_reason="passed by hand at 14:05")
        check(not speed_calls() and "passed by hand at 14:05" in out.getvalue() and "SKIPPED" in out.getvalue(),
              "3 --skip-speed-gate with a reason skips it and prints the reason", out.getvalue().strip())

        for argv, want_ok in ((["--dry", "--skip-speed-gate", "ran by hand"], True), (["--dry", "--skip-speed-gate", "  "], False), (["--dry", "--skip-speed-gate", ""], False)):
            err = io.StringIO()
            ok = True
            with contextlib.redirect_stderr(err):
                try:
                    a = sa.parse_cli_args(argv)
                    ok = a.skip_speed_gate == "ran by hand"
                except SystemExit:
                    ok = False
            check(ok == want_ok, f"3 {' '.join(repr(x) for x in argv[1:])} is {'accepted' if want_ok else 'refused (a reason is required)'}", err.getvalue().strip()[-160:])
        a = sa.parse_cli_args(["--dry", "--skip-release-gates"])
        check(not a.skip_speed_gate, "3 --skip-release-gates alone does not set a speed-gate skip")

        # 3b. a passing run with warnings shows the leader which screens were over the budget
        calls.clear()
        fake_stdout_pass = ("Fails (0):\n\nWarnings, not failed (2):\n  screen wtc / raw (repeat visit): this build 203 ms, baseline 199 ms\n"
                            "  screen wtc / reg_regions (repeat visit): this build 172 ms\n\nPASSED: 10/10 correctness checks\n")
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            sa.run_speed_gate(skip_reason="")
        txt = out.getvalue()
        check("Warnings, not failed (2)" in txt and "wtc / raw" in txt and "wtc / reg_regions" in txt and "PASSED: 10/10" in txt,
              "3 a pass with warnings prints the warned screens for the leader", txt.strip()[-300:])
        fake_stdout_pass = "PASSED: test\n"

        # 4. a failing speed gate stops the sync with its output
        calls.clear()
        next_rc["value"] = 1
        err = io.StringIO()
        stopped = False
        with contextlib.redirect_stderr(err), contextlib.redirect_stdout(io.StringIO()):
            try:
                sa.run_speed_gate(skip_reason="")
            except SystemExit as ex:
                stopped = ex.code not in (0, None)
        check(stopped and "FAILED: 7/8 correctness checks" in err.getvalue(), "4 a failing speed gate stops the sync and shows its output", err.getvalue().strip()[-200:])
        next_rc["value"] = 0
    finally:
        sa.subprocess.run = orig["run"]
        sa._node_runtime = orig["node"]
        sa.APP_SRC_ROOT = orig["src"]

# 4b. the per-gate limit: 600 s, longer only when ISABI_GATE_TIMEOUT_S asks (a browser gate queues for the browser slot)
saved_limit = os.environ.pop(sa.GATE_TIMEOUT_ENV, None)
try:
    check(sa.gate_timeout_s() == sa.GATE_TIMEOUT_S == 600, "4b a release gate has 600 s by default")
    seen = {}
    for raw in ("1800", "60", "few", "", "-5", "999999", " 900 "):
        os.environ[sa.GATE_TIMEOUT_ENV] = raw
        seen[raw] = sa.gate_timeout_s()
    check(seen == {"1800": 1800, "60": 600, "few": 600, "": 600, "-5": 600, "999999": sa.GATE_TIMEOUT_MAX_S, " 900 ": 900},
          "4b ISABI_GATE_TIMEOUT_S raises the limit, never below 600 s, at most an hour; anything else is ignored", repr(seen))
    os.environ[sa.GATE_TIMEOUT_ENV] = "1500"
    with tempfile.TemporaryDirectory() as td:
        os.makedirs(os.path.join(td, "build"))
        open(os.path.join(td, "build", "verify_speed_budget.mjs"), "w").close()
        for g in sa.RELEASE_GATES:
            if g[0] == "isabi-app":
                os.makedirs(os.path.dirname(os.path.join(td, *g[1].split("/"))), exist_ok=True)
                open(os.path.join(td, *g[1].split("/")), "w").close()
        try:
            sa.subprocess.run = fake_run
            sa._node_runtime = lambda: ("node", dict(os.environ))
            sa.APP_SRC_ROOT = td
            calls.clear()
            with contextlib.redirect_stdout(io.StringIO()):
                sa.run_release_gates()
                sa.run_speed_gate(skip_reason="")
            rel_calls = [c for c in calls if c not in speed_calls()]
            check(len(rel_calls) > 10 and all(c["timeout"] == 1500 for c in rel_calls),
                  "4b every release gate of the sync runs with the raised limit", repr(sorted({c["timeout"] for c in rel_calls})))
            check(len(speed_calls()) == 1 and speed_calls()[0]["timeout"] == sa.SPEED_GATE_TIMEOUT_S,
                  "4b the speed gate keeps its own limit")

            def slow_run(cmd, **kw):
                raise subprocess.TimeoutExpired(cmd, kw.get("timeout"))

            sa.subprocess.run = slow_run
            err = io.StringIO()
            stopped = False
            with contextlib.redirect_stderr(err), contextlib.redirect_stdout(io.StringIO()):
                try:
                    sa._run_gate(*sa.SPEED_GATE, 1500, "--skip-release-gates")
                except SystemExit as ex:
                    stopped = ex.code not in (0, None)
            check(stopped and "did not finish within 1500 s" in err.getvalue() and sa.GATE_TIMEOUT_ENV in err.getvalue()
                  and "browser slot" in err.getvalue(),
                  "4b a browser gate stopped at its limit says the wait for the browser slot counts, and how to allow longer",
                  err.getvalue().strip()[-200:])
        finally:
            sa.subprocess.run = orig["run"]
            sa._node_runtime = orig["node"]
            sa.APP_SRC_ROOT = orig["src"]
finally:
    if saved_limit is None:
        os.environ.pop(sa.GATE_TIMEOUT_ENV, None)
    else:
        os.environ[sa.GATE_TIMEOUT_ENV] = saved_limit

# 5. order inside sync_command_app
src = inspect.getsource(sa.sync_command_app)
i_rel, i_speed, i_copy = src.find("run_release_gates("), src.find("run_speed_gate("), src.find("os.makedirs(APP_OUT")
check(0 <= i_rel < i_speed < i_copy, "5 sync_command_app runs RELEASE_GATES, then the speed gate, then copies files", f"{i_rel} {i_speed} {i_copy}")
check("skip_speed_gate=args.skip_speed_gate" in inspect.getsource(sa.main), "5 main passes --skip-speed-gate through to sync_command_app")

# 6. assemble.py forwards --skip-speed-gate to sync_command_app
import assemble as asm  # noqa: E402
for argv, want_ok in ((["--dry", "--skip-speed-gate", "ran by hand"], True), (["--dry", "--skip-speed-gate", "   "], False), (["--dry", "--skip-app-sync", "--skip-speed-gate", "x"], False)):
    err = io.StringIO()
    ok = True
    with contextlib.redirect_stderr(err):
        try:
            a = asm.parse_cli_args(argv)
            ok = a.skip_speed_gate == "ran by hand"
        except SystemExit:
            ok = False
    check(ok == want_ok, f"6 assemble.py {' '.join(repr(x) for x in argv)} is {'accepted' if want_ok else 'refused'}", err.getvalue().strip()[-160:])
asm_main_src = inspect.getsource(asm.main)
check("skip_speed_gate=args.skip_speed_gate" in asm_main_src, "6 assemble.main forwards --skip-speed-gate to sync_command_app")

print(f"\nverify_speed_gate_wiring: {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
