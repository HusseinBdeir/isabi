"""verify_deploy_retry.py: offline gate for deploy_cloudflare.py riding out Cloudflare API blips.

Fakes wrangler (no network, no Cloudflare calls) and checks:
  * an idempotent command (pages deploy, pages project list, whoami, read-only d1 SELECT) is retried on a
    Cloudflare-side failure (503, "no healthy upstream", Functions "Unknown internal error") and succeeds;
  * a D1 write (--file, or a non-SELECT --command) is never retried by run_wrangler;
  * a permanent failure (auth, project not found) is not retried;
  * retries stop after the configured count (ISABI_WRANGLER_RETRIES) and check=True then raises;
  * a failed `pages project list` / `d1 list` / `r2 bucket list` stops the run and never creates anything,
    and never downgrades wrangler.toml to the no-R2 fallback;
  * an answered list that lacks the project still creates it, and "already exists" on create is accepted.

Usage: python build/verify_deploy_retry.py
"""
import os
import subprocess
import sys
import pathlib

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(errors="replace")
    except Exception:  # noqa: BLE001
        pass

BUILD_DIR = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(BUILD_DIR))
os.environ["ISABI_WRANGLER_RETRIES"] = "3"

import deploy_cloudflare as dc  # noqa: E402

results: list[tuple[bool, str, str]] = []


def check(cond: bool, name: str, detail: str = "") -> None:
    results.append((bool(cond), name, detail))
    print(f"{'ok   ' if cond else 'FAIL '} {name}{(' - ' + detail) if detail and not cond else ''}")


class Fake:
    """Scripted wrangler: each call pops the next (returncode, stdout, stderr) for its command head."""

    def __init__(self, script: dict[str, list[tuple[int, str, str]]]):
        self.script = {k: list(v) for k, v in script.items()}
        self.calls: list[list[str]] = []

    def __call__(self, cmd, env, input_text):
        args = [str(x) for x in cmd[1:]]
        self.calls.append(args)
        key = " ".join(args[:3])
        for k, queue in self.script.items():
            if key.startswith(k):
                rc, out, err = queue.pop(0) if len(queue) > 1 else queue[0]
                return subprocess.CompletedProcess(cmd, rc, out, err)
        return subprocess.CompletedProcess(cmd, 0, "", "")

    def count(self, prefix: str) -> int:
        return sum(1 for a in self.calls if " ".join(a).startswith(prefix))


sleeps: list[float] = []
dc.time.sleep = lambda s: sleeps.append(s)
ENV: dict = {}
orig_once = dc._run_wrangler_once


def use(fake: Fake) -> Fake:
    dc._run_wrangler_once = fake
    sleeps.clear()
    return fake


E503 = (1, "", "✘ [ERROR] A request to the Cloudflare API (/accounts/x/pages/projects) failed.\n  Service Unavailable [code: 503]")
UPSTREAM = (1, "", "✘ [ERROR] no healthy upstream")
FN_ERR = (1, "Uploading... (12/12)", "✘ [ERROR] Deployment failed!\n  Unknown internal error occurred. [code: 8000000]")
OK = (0, "Success", "")

try:
    # 1. Idempotent commands ride out blips
    f = use(Fake({"pages deploy": [FN_ERR, UPSTREAM, OK]}))
    r = dc.run_wrangler(["pages", "deploy", "x", "--project-name=isabi-systems"], ENV, check=True)
    check(r.returncode == 0 and f.count("pages deploy") == 3, "pages deploy retried through 'Unknown internal error' and 'no healthy upstream'", str(f.calls))
    check(sleeps == [10.0, 30.0], "Back-off waits 10 s then 30 s", str(sleeps))
    check("Unknown internal error" in dc.wrangler_failure_reason(subprocess.CompletedProcess([], *FN_ERR)),
          "Retry notice quotes the error line, not upload progress", dc.wrangler_failure_reason(subprocess.CompletedProcess([], *FN_ERR)))

    f = use(Fake({"pages project list": [E503, OK]}))
    r = dc.run_wrangler(["pages", "project", "list"], ENV, check=False)
    check(r.returncode == 0 and f.count("pages project list") == 2, "pages project list retried after a 503", str(f.calls))

    f = use(Fake({"d1 execute isabi-ledger": [E503, OK]}))
    r = dc.run_wrangler(["d1", "execute", "isabi-ledger", "--remote", "--json", "--command=SELECT 1"], ENV, check=False)
    check(r.returncode == 0 and len(f.calls) == 2, "Read-only d1 SELECT is retried", str(f.calls))

    # 2. Writes and permanent failures are not retried
    f = use(Fake({"d1 execute isabi-ledger": [E503, OK]}))
    r = dc.run_wrangler(["d1", "execute", "isabi-ledger", "--remote", "--file=x.sql"], ENV, check=False)
    check(r.returncode == 1 and len(f.calls) == 1, "D1 --file write is never retried by run_wrangler", str(f.calls))
    f = use(Fake({"d1 execute isabi-ledger": [E503, OK]}))
    r = dc.run_wrangler(["d1", "execute", "isabi-ledger", "--remote", "--command=DELETE FROM t"], ENV, check=False)
    check(r.returncode == 1 and len(f.calls) == 1, "D1 non-SELECT --command is never retried", str(f.calls))
    f = use(Fake({"d1 execute isabi-ledger": [E503, OK]}))
    r = dc.run_wrangler(["d1", "execute", "isabi-ledger", "--remote", "--command=SELECT 1; DELETE FROM t"], ENV, check=False)
    check(r.returncode == 1 and len(f.calls) == 1, "A SELECT followed by a write is not treated as read-only", str(f.calls))
    f = use(Fake({"pages deploy": [(1, "", "✘ [ERROR] Authentication error [code: 10000]"), OK]}))
    r = dc.run_wrangler(["pages", "deploy", "x"], ENV, check=False)
    check(r.returncode == 1 and len(f.calls) == 1, "Authentication error is not retried", str(f.calls))
    f = use(Fake({"pages deploy": [(1, "", "✘ [ERROR] Project not found. The specified project name does not match any of your existing projects. [code: 8000007]"), OK]}))
    r = dc.run_wrangler(["pages", "deploy", "x"], ENV, check=False)
    check(r.returncode == 1 and len(f.calls) == 1, "Project not found is not retried", str(f.calls))

    # 3. Retry budget, then check=True raises
    f = use(Fake({"pages deploy": [E503]}))
    raised = False
    try:
        dc.run_wrangler(["pages", "deploy", "x"], ENV, check=True)
    except subprocess.CalledProcessError:
        raised = True
    check(raised and f.count("pages deploy") == 4, "Stops after 3 retries (4 attempts) and raises with check=True", str(len(f.calls)))
    os.environ["ISABI_WRANGLER_RETRIES"] = "0"
    f = use(Fake({"pages deploy": [E503, OK]}))
    r = dc.run_wrangler(["pages", "deploy", "x"], ENV, check=False)
    check(r.returncode == 1 and len(f.calls) == 1, "ISABI_WRANGLER_RETRIES=0 turns retries off", str(f.calls))
    os.environ["ISABI_WRANGLER_RETRIES"] = "3"

    # 4. A failed listing never creates or downgrades
    f = use(Fake({"pages project list": [E503], "pages project create": [OK]}))
    raised = False
    try:
        dc.ensure_pages_project(ENV)
    except dc.CloudflareListUnavailable:
        raised = True
    check(raised and f.count("pages project create") == 0, "Failed `pages project list` stops the run and never creates the project", str(f.calls))

    f = use(Fake({"d1 list --json": [E503], "d1 create isabi-ledger": [OK]}))
    raised = False
    try:
        dc.ensure_d1_database(ENV)
    except dc.CloudflareListUnavailable:
        raised = True
    check(raised and f.count("d1 create") == 0, "Failed `d1 list` stops the run and never creates the database", str(f.calls))

    f = use(Fake({"r2 bucket list": [E503], "r2 bucket create": [E503]}))
    raised = False
    out = None
    try:
        out = dc.ensure_r2_bucket(ENV)
    except dc.CloudflareListUnavailable:
        raised = True
    check(raised and out is None and f.count("r2 bucket create") == 0, "Failed `r2 bucket list` stops the run instead of dropping the R2 binding", str(f.calls))

    f = use(Fake({"r2 bucket list": [(1, "", "✘ [ERROR] Please enable R2 through the Cloudflare Dashboard. [code: 10042]")], "r2 bucket create": [(1, "", "✘ [ERROR] Please enable R2 through the Cloudflare Dashboard. [code: 10042]")]}))
    out = dc.ensure_r2_bucket(ENV)
    check(out is False, "Account that says R2 is not enabled still takes the D1 fallback", str(f.calls))

    f = use(Fake({"r2 bucket list": [(0, "name: other-bucket", "")], "r2 bucket create": [(1, "", "✘ [ERROR] The bucket you tried to create already exists, and you own it. [code: 10004]")]}))
    check(dc.ensure_r2_bucket(ENV) is True, "R2 create answering 'already exists' counts as present", str(f.calls))

    f = use(Fake({"pages project list": [(0, "┌ Project Name ┐\n│ other │", "")], "pages project create": [OK]}))
    dc.ensure_pages_project(ENV)
    check(f.count("pages project create") == 1, "An answered list without the project still creates it", str(f.calls))

    f = use(Fake({"pages project list": [(0, "│ other │", "")], "pages project create": [(1, "", "✘ [ERROR] A project with this name already exists. [code: 8000002]")]}))
    ok_exists = True
    try:
        dc.ensure_pages_project(ENV)
    except Exception as exc:  # noqa: BLE001
        ok_exists = False
        detail = str(exc)
    check(ok_exists, "Pages create answering 'already exists' counts as verified")

    f = use(Fake({"pages project list": [(0, "│ isabi-systems │ isabisystems.com │", "")]}))
    dc.ensure_pages_project(ENV)
    check(f.count("pages project create") == 0, "Listed project is verified with no create call", str(f.calls))
finally:
    dc._run_wrangler_once = orig_once

passed = sum(1 for ok, _, _ in results if ok)
print(f"\nSUMMARY: {passed}/{len(results)} passed")
sys.exit(0 if passed == len(results) else 1)
