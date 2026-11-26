"""Gate: Cloudflare Durable Object release lock & batch queue coordinator in release_lock.py and release_batch.py.

Offline: a local ThreadingHTTPServer mimics the IsabiReleaseRoom SQLite CAS contract (/release/lock, /release/lock/cas,
/release/queue, /release/queue/cas, /release/health), while two bare git repos hold ONLY code branches (main, wt/*).
Verifies zero refs/locks/* or refs/release-queue/* are ever pushed to GitHub.
Run: python build/verify_release_cloudflare.py   (exit 1 with every failed check named)
"""
from __future__ import annotations

import contextlib
import datetime as dt
import http.server
import io
import json
import os
import pathlib
import shutil
import socket
import socketserver
import subprocess
import sys
import tempfile
import threading
import uuid

sys.stdout.reconfigure(encoding="utf-8")
BUILD = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(BUILD))

import release_batch as RB  # noqa: E402
import release_lock as RL  # noqa: E402

RESULTS: list[tuple[bool, str]] = []
IDENT = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
SW = ("const SHELL_CACHE = 'isabi-mfg-v19.6.100';\nconst DATA_CACHE = 'isabi-mfg-data-v3';\n"
      "const SHELL_ASSETS = ['./index.html?v=19.6.100', './js/app.js?v=19.6.100'];\n")
INDEX = ("<html><body><script>window.__MFG_SHELL_VER = '19.6.100';</script>"
         "<script src=\"js/app.js?v=19.6.100\"></script></body></html>\n")
MANIFEST = '{"start_url": "./index.html?v=19.6.100"}\n'


def check(ok: bool, name: str) -> None:
    RESULTS.append((bool(ok), name))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}")


def git(cwd: pathlib.Path, *args: str) -> str:
    return subprocess.run(["git", *args], cwd=str(cwd), input="", capture_output=True, text=True, check=True,
                          env=dict(os.environ, **IDENT)).stdout.strip()


def quiet(fn, *a, **k):
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        return fn(*a, **k)


def raises_lock(fn, *a, **k) -> str:
    try:
        quiet(fn, *a, **k)
    except RL.LockError as exc:
        return str(exc) or "LockError"
    return ""


class MockReleaseCoordinator:
    def __init__(self, bearer_token: str, cf_token: str, cf_acct: str) -> None:
        self.bearer_token = bearer_token
        self.cf_token = cf_token
        self.cf_acct = cf_acct
        self._mu = threading.Lock()
        self.lock_ver = ""
        self.lock_doc = None
        self.queue: dict[str, tuple[str, dict]] = {}
        self.calls: list[str] = []
        self.transient_503_once = False
        self.transient_cas_503_once = False
        self.lose_cas_reply_once = False  # the lock write lands, the connection drops before the answer
        self.ci_headers_seen: list[tuple[str, str]] = []

    def check_auth(self, headers) -> bool:
        auth = headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return False
        tok = auth[7:].strip()
        if tok == self.bearer_token:
            return True
        if (
            headers.get("X-CF-Verify-Token") == "1"
            and headers.get("X-CF-Account-Id") == self.cf_acct
            and tok == self.cf_token
        ):
            self.ci_headers_seen.append((headers.get("X-CF-Account-Id", ""), headers.get("X-CF-Verify-Token", "")))
            return True
        return False


def start_mock_server(coord: MockReleaseCoordinator):
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            return

        def _send(self, code: int, payload: dict) -> None:
            raw = json.dumps(payload).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self):  # noqa: N802
            if self.path == "/release/health":
                self._send(200, {"ok": True, "service": "ISABI Release Coordinator", "version": 1})
                return
            if not coord.check_auth(self.headers):
                self._send(401, {"ok": False, "error": "unauthorized"})
                return
            with coord._mu:
                coord.calls.append(f"GET {self.path}")
                if coord.transient_503_once:
                    coord.transient_503_once = False
                    self._send(503, {"ok": False, "error": "transient overload"})
                    return
                if self.path == "/release/lock":
                    self._send(200, {"ok": True, "version": coord.lock_ver, "lock": coord.lock_doc})
                    return
                if self.path in ("/release/queue", "/release/state"):
                    entries = [
                        {"id": eid, "version": ver, "entry": doc}
                        for eid, (ver, doc) in sorted(coord.queue.items())
                    ]
                    self._send(200, {"ok": True, "lockVersion": coord.lock_ver, "lock": coord.lock_doc, "entries": entries})
                    return
            self._send(404, {"ok": False, "error": "not found"})

        def do_POST(self):  # noqa: N802
            if not coord.check_auth(self.headers):
                self._send(401, {"ok": False, "error": "unauthorized"})
                return
            ln = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(ln).decode("utf-8")) if ln > 0 else {}
            with coord._mu:
                coord.calls.append(f"POST {self.path}")
                if self.path == "/release/lock/cas":
                    if coord.transient_cas_503_once:
                        coord.transient_cas_503_once = False
                        self._send(503, {"ok": False, "error": "transient cas overload"})
                        return
                    exp = body.get("expectedVersion", "")
                    lock = body.get("lock")
                    if exp == "":
                        if coord.lock_doc is not None:
                            self._send(200, {"ok": True, "swapped": False, "currentVersion": coord.lock_ver, "currentLock": coord.lock_doc})
                            return
                        coord.lock_ver = uuid.uuid4().hex
                        coord.lock_doc = lock
                        if coord.lose_cas_reply_once:
                            coord.lose_cas_reply_once = False
                            self.close_connection = True
                            self.connection.shutdown(socket.SHUT_RDWR)
                            return
                        self._send(200, {"ok": True, "swapped": True, "version": coord.lock_ver, "lock": lock})
                        return
                    if coord.lock_doc is None or coord.lock_ver != exp:
                        self._send(200, {"ok": True, "swapped": False, "currentVersion": coord.lock_ver, "currentLock": coord.lock_doc})
                        return
                    if lock is None:
                        coord.lock_ver = ""
                        coord.lock_doc = None
                        self._send(200, {"ok": True, "swapped": True, "version": "", "lock": None})
                        return
                    coord.lock_ver = uuid.uuid4().hex
                    coord.lock_doc = lock
                    self._send(200, {"ok": True, "swapped": True, "version": coord.lock_ver, "lock": lock})
                    return
                if self.path == "/release/queue/cas":
                    eid = body.get("entryId", "")
                    exp = body.get("expectedVersion", "")
                    entry = body.get("entry")
                    cur = coord.queue.get(eid)
                    if exp == "":
                        if cur is not None:
                            self._send(200, {"ok": True, "swapped": False, "currentVersion": cur[0], "currentEntry": cur[1]})
                            return
                        nv = uuid.uuid4().hex
                        coord.queue[eid] = (nv, entry)
                        self._send(200, {"ok": True, "swapped": True, "version": nv, "entry": entry})
                        return
                    if cur is None or cur[0] != exp:
                        self._send(200, {"ok": True, "swapped": False, "currentVersion": cur[0] if cur else "", "currentEntry": cur[1] if cur else None})
                        return
                    if entry is None:
                        coord.queue.pop(eid, None)
                        self._send(200, {"ok": True, "swapped": True, "version": "", "entry": None})
                        return
                    nv = uuid.uuid4().hex
                    coord.queue[eid] = (nv, entry)
                    self._send(200, {"ok": True, "swapped": True, "version": nv, "entry": entry})
                    return
            self._send(404, {"ok": False, "error": "not found"})

    class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True

    srv = ThreadedHTTPServer(("127.0.0.1", 0), Handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv


def put(p: pathlib.Path, txt: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(txt.encode("utf-8"))


def main() -> int:
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="isabi-cf-release-"))
    coord = MockReleaseCoordinator("test-bearer-tok", "cf_api_token_12345678901234567890123456", "acct_123")
    srv = start_mock_server(coord)
    port = srv.server_address[1]
    saved_env = {k: os.environ.get(k) for k in (
        "ISABI_RELEASE_BACKEND", "ISABI_RELEASE_API_URL", "ISABI_RELEASE_API_TOKEN",
        "ISABI_RELEASE_LIVE_SHELL", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "THEO_EDGE_KEY",
    )}
    try:
        os.environ["ISABI_RELEASE_BACKEND"] = "cloudflare"
        os.environ["ISABI_RELEASE_API_URL"] = f"http://127.0.0.1:{port}/release"
        os.environ["ISABI_RELEASE_API_TOKEN"] = "test-bearer-tok"
        os.environ["ISABI_RELEASE_LIVE_SHELL"] = "19.6.100"

        isabi_git = tmp / "isabi.git"
        app_git = tmp / "isabi-app.git"
        git(tmp, "init", "-q", "--bare", "-b", "main", str(isabi_git))
        git(tmp, "init", "-q", "--bare", "-b", "main", str(app_git))

        seed_s = tmp / "seed-site"
        seed_a = tmp / "seed-app"
        git(tmp, "clone", "-q", str(isabi_git), str(seed_s))
        git(tmp, "clone", "-q", str(app_git), str(seed_a))
        put(seed_s / "app" / "sw.js", SW)
        put(seed_s / "functions" / "_lib" / "deployed_shell.js", "export const DEPLOYED_SHELL_VER = '19.6.100';\n")
        git(seed_s, "add", "-A")
        git(seed_s, "commit", "-q", "-m", "init")
        git(seed_s, "push", "-q", "origin", "HEAD:main")

        put(seed_a / "sw.js", SW)
        put(seed_a / "index.html", INDEX)
        put(seed_a / "manifest.json", MANIFEST)
        put(seed_a / "js" / "app.js", "console.log('init');\n")
        git(seed_a, "add", "-A")
        git(seed_a, "commit", "-q", "-m", "init")
        git(seed_a, "push", "-q", "origin", "HEAD:main")

        # Two session pairs
        A = tmp / "A"
        B = tmp / "B"
        for d in (A, B):
            d.mkdir()
            git(tmp, "clone", "-q", str(isabi_git), str(d / "isabi"))
            git(tmp, "clone", "-q", str(app_git), str(d / "isabi-app"))
        sa, sb = A / "isabi", B / "isabi"

        # 1. Backend detection on real HTTPS remote vs local path
        check(RL._is_local_git_remote("https://github.com/HusseinBdeir/isabi.git") is False,
              "HTTPS remote selects cloudflare backend")
        check(RL._is_local_git_remote(str(isabi_git)) is True,
              "local bare repo path selects git backend for offline git tests")

        # 2. Bad bearer token fails closed (401)
        os.environ["ISABI_RELEASE_API_TOKEN"] = "wrong-token"
        check("HTTP 401" in raises_lock(RL.read_remote_lock, sa), "bad bearer token fails closed with 401")
        os.environ["ISABI_RELEASE_API_TOKEN"] = "test-bearer-tok"

        # 3. Lock acquire / contention / renew / claim_deploy / release on DO
        check(RL.read_remote_lock(sa) == ("", {}), "free DO lock reads as empty")
        l1 = quiet(RL.acquire, sa, holder="session-A", version="v19.6.101")
        check(bool(l1.get("lockId")) and RL.held_by_me(RL.read_remote_lock(sa)[1], sa), "A acquires DO lock")
        check("held by session-A" in raises_lock(RL.acquire, sb, holder="session-B"), "B refused while A holds DO lock")
        quiet(RL.renew, sa, ttl_min=45)
        main_sha = git(sa, "rev-parse", "origin/main")
        quiet(RL.claim_deploy, sa, main_sha, "pages-only")
        check(RL.last_deploy(RL.read_remote_lock(sb)[1])["sha"] == main_sha, "claim_deploy persisted in DO")
        quiet(RL.release, sa)
        check(RL.read_remote_lock(sb) == ("", {}), "release clears DO lock")
        coord.transient_cas_503_once = True
        l_retry = quiet(RL.acquire, sa, holder="session-A-retry", version="v19.6.101", wait_s=15, poll_s=1)
        check(bool(l_retry.get("lockId")) and not coord.transient_cas_503_once,
              "acquire(wait_s=15) retries past transient 503 on POST /release/lock/cas")
        quiet(RL.release, sa)

        # 4. CI auth fallback via CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
        os.environ.pop("ISABI_RELEASE_API_TOKEN", None)
        os.environ["THEO_EDGE_KEY"] = ""
        os.environ["CLOUDFLARE_API_TOKEN"] = "cf_api_token_12345678901234567890123456"
        os.environ["CLOUDFLARE_ACCOUNT_ID"] = "acct_123"
        orig_creds = RL._load_theo_creds
        RL._load_theo_creds = lambda: {}
        try:
            coord.transient_cas_503_once = True
            ok, fail, _msg = quiet(RL.ci_acquire, sb, main_sha, wait_s=20, poll_s=1)
            check(ok is True and fail is False and len(coord.ci_headers_seen) > 0 and not coord.transient_cas_503_once,
                  "ci_acquire authenticates via X-CF-Verify-Token + X-CF-Account-Id and retries transient 503")
            quiet(RL.release, sb)
        finally:
            RL._load_theo_creds = orig_creds
        os.environ["ISABI_RELEASE_API_TOKEN"] = "test-bearer-tok"

        # 4b. A lock write that lands while its answer is lost: the run knows the lock as its own and deploys under
        # it, instead of waiting behind itself until the lock expires (and a session's acquire renews the same way).
        coord.lose_cas_reply_once = True
        ok, fail, _msg = quiet(RL.ci_acquire, sb, main_sha, wait_s=20, poll_s=1)
        held = RL.read_remote_lock(sa)[1]
        check(ok is True and fail is False and not coord.lose_cas_reply_once and RL.held_by_me(held, sb)
              and (RL.last_deploy(held) or {}).get("sha") == main_sha,
              "ci_acquire keeps a lock whose write landed though the answer was lost, and records its deploy")
        quiet(RL.release, sb)
        coord.lose_cas_reply_once = True
        lost = raises_lock(RL.acquire, sa, holder="session-A")
        l_again = quiet(RL.acquire, sa, holder="session-A")
        check("URLError" in lost and bool(l_again.get("lockId")) and RL.held_by_me(RL.read_remote_lock(sb)[1], sa)
              and "held by session-A" in raises_lock(RL.acquire, sb, holder="session-B"),
              "a session whose lock write lost its answer holds that lock on its next acquire; nobody else can take it")
        # A second command in the same worktree that read the lock as free a moment too early: its write is refused,
        # and that must not cost the first command its token (it would hold a lock it can neither renew nor release).
        real_read, reads = RL.read_remote_lock, [0]

        def early_read(cwd=RL.ISABI_ROOT):
            reads[0] += 1
            return ("", {}) if reads[0] == 1 else real_read(cwd)

        RL.read_remote_lock = early_read
        try:
            lost_race = raises_lock(RL.acquire, sa, holder="second command")
        finally:
            RL.read_remote_lock = real_read
        check("took it first" in lost_race and RL.held_by_me(RL.read_remote_lock(sb)[1], sa)
              and RL.read_token(sa).get("lockId") == l_again["lockId"]
              and not list(RL.git_dir(sa).glob(f"{RL.PENDING_PREFIX}*.json")),
              "a refused write from the same worktree leaves the holder's token alone and no pending file behind")
        quiet(RL.renew, sa, ttl_min=30)
        quiet(RL.release, sa)
        # (A write that was refused outright, like the 503 of section 4, may leave its own pending file: it names a
        # lockId that never existed, matches nothing, and is cleared a day later.)
        check(RL.read_remote_lock(sb) == ("", {}) and not RL.read_token(sb) and not RL.read_token(sa)
              and not RL._is_pending(sb, held["lockId"]) and not RL._is_pending(sa, l_again["lockId"]),
              "both give the lock back and keep no token or pending file for a lock they held")

        check(RL.CF_DEFAULT_POLL_S == 4 and RL.DEFAULT_POLL_S == 12 and RB.CF_POLL_S == 5 and RB.POLL_S == 20,
              "CF poll intervals (4s lock / 5s batch) paired with preserved offline Git constants (12s / 20s)")

        # 4b2. Behavioral polling interval checks: default CF (4s lock / 5s batch), explicit --poll override (12s), and git (12s / 20s)
        import time as _time_mod  # noqa: PLC0415
        l_hold_p = quiet(RL.acquire, sa, holder="poll-holder", version="v19.6.105")
        orig_rl_sleep, orig_rl_mono = RL._sleep, RL._mono
        orig_rb_sleep, orig_rb_mono = RB._sleep, RB._mono
        orig_t_sleep, orig_t_mono = _time_mod.sleep, _time_mod.monotonic
        try:
            clk = [0.0]
            sleeps_rl: list[float] = []
            sleeps_t: list[float] = []
            sleeps_rb: list[float] = []

            def fake_mono() -> float:
                return clk[0]

            def fake_sleep_rl(sec: float) -> None:
                sleeps_rl.append(float(sec))
                clk[0] += float(sec) + 0.1

            def fake_sleep_t(sec: float) -> None:
                sleeps_t.append(float(sec))
                clk[0] += float(sec) + 0.1

            def fake_sleep_rb(sec: float) -> None:
                sleeps_rb.append(float(sec))
                clk[0] += float(sec) + 0.1

            RL._mono = RB._mono = _time_mod.monotonic = fake_mono
            RL._sleep = fake_sleep_rl
            _time_mod.sleep = fake_sleep_t
            RB._sleep = fake_sleep_rb

            clk[0] = 0.0
            sleeps_rl.clear()
            raises_lock(RL.acquire, sb, holder="cf-waiter", wait_s=10)
            check(bool(sleeps_rl) and sleeps_rl[0] == 4.0, f"CF RL.acquire default sleeps 4s (got {sleeps_rl})")

            clk[0] = 0.0
            sleeps_rl.clear()
            raises_lock(RL.acquire, sb, holder="cf-override", wait_s=20, poll_s=12)
            check(bool(sleeps_rl) and sleeps_rl[0] == 12.0, f"CF RL.acquire honors explicit poll_s=12 override (got {sleeps_rl})")

            clk[0] = 0.0
            sleeps_t.clear()
            quiet(RL.ci_acquire, sb, main_sha, wait_s=10)
            check(bool(sleeps_t) and sleeps_t[0] == 4, f"CF RL.ci_acquire default sleeps 4s (got {sleeps_t})")

            # Wait in batch on CF with default poll_s=None while A holds the lock
            real_read_state = RB.read_state
            RB.read_state = lambda cwd=RL.ISABI_ROOT: (coord.lock_ver or "v1", l_hold_p, [{"id": "20261126T000000Z-poll0001", "state": "waiting", "holder": "B", "seenAt": RL._iso(RL._now())}])
            try:
                clk[0] = 0.0
                sleeps_rb.clear()
                quiet(RB.wait, sb, "20261126T000000Z-poll0001", wait_s=10)
                check(bool(sleeps_rb) and sleeps_rb[0] == 5, f"CF RB.wait default sleeps 5s (got {sleeps_rb})")
            finally:
                RB.read_state = real_read_state

            # Explicit git backend retains 12s / 20s defaults
            os.environ["ISABI_RELEASE_BACKEND"] = "git"
            # Put a fake holder on fake git origin just for read_remote_lock / _wait git sleep check
            orig_rl_read = RL.read_remote_lock
            RL.read_remote_lock = lambda cwd=RL.ISABI_ROOT: ("sha-git", dict(l_hold_p))
            try:
                clk[0] = 0.0
                sleeps_rl.clear()
                raises_lock(RL.acquire, sb, holder="git-waiter", wait_s=20)
                check(bool(sleeps_rl) and sleeps_rl[0] == 12.0, f"Git RL.acquire default retains 12s (got {sleeps_rl})")
                RB.read_state = lambda cwd=RL.ISABI_ROOT: ("sha-git", l_hold_p, [{"id": "20261126T000000Z-poll0002", "state": "waiting", "holder": "B", "seenAt": RL._iso(RL._now())}])
                clk[0] = 0.0
                sleeps_rb.clear()
                quiet(RB.wait, sb, "20261126T000000Z-poll0002", wait_s=30)
                check(bool(sleeps_rb) and sleeps_rb[0] == 20, f"Git RB.wait default retains 20s (got {sleeps_rb})")
            finally:
                RL.read_remote_lock = orig_rl_read
                RB.read_state = real_read_state
                os.environ["ISABI_RELEASE_BACKEND"] = "cloudflare"
        finally:
            RL._sleep, RL._mono = orig_rl_sleep, orig_rl_mono
            RB._sleep, RB._mono = orig_rb_sleep, orig_rb_mono
            _time_mod.sleep, _time_mod.monotonic = orig_t_sleep, orig_t_mono
            quiet(RL.release, sa)

        # 4c. deploy_cloudflare formats active DO lock as IsabiReleaseRoom (<holder>)
        import deploy_cloudflare as DC  # noqa: PLC0415
        l_vc = quiet(RL.acquire, sa, holder="vc-peer", version="v19.6.105")
        try:
            vc_info = quiet(
                DC.collect_unshipped_version_claims,
                sb,
                app_repo_dir=B / "isabi-app",
                fetch=True,
                include_lock=True,
            )
            lock_claims = [c for c in vc_info["peer_claims"] if c.get("source") == "release_lock"]
            check(bool(lock_claims) and lock_claims[0]["ref"] == "IsabiReleaseRoom (vc-peer)",
                  "deploy_cloudflare reports IsabiReleaseRoom (<holder>) for active DO lock")
        finally:
            if l_vc:
                quiet(RL.release, sa)

        # 5. Batch queue lifecycle on DO (join, transient 503 wait-out, take, sync, deploy, done, leave)
        git(A / "isabi-app", "checkout", "-q", "-B", "wt/feat-a", "origin/main")
        put(A / "isabi-app" / "js" / "feat_a.js", "export const A = 1;\n")
        git(A / "isabi-app", "add", "-A")
        git(A / "isabi-app", "commit", "-q", "-m", "feat a")
        git(A / "isabi-app", "push", "-q", "origin", "wt/feat-a")

        git(B / "isabi-app", "checkout", "-q", "-B", "wt/feat-b", "origin/main")
        put(B / "isabi-app" / "js" / "feat_b.js", "export const B = 2;\n")
        git(B / "isabi-app", "add", "-A")
        git(B / "isabi-app", "commit", "-q", "-m", "feat b")
        git(B / "isabi-app", "push", "-q", "origin", "wt/feat-b")

        e1 = quiet(RB.join, sa, holder="A", summary="Feature A", app_branch="wt/feat-a")
        e2 = quiet(RB.join, sb, holder="B", summary="Feature B", app_branch="wt/feat-b")
        coord.transient_503_once = True
        line = RB.read_line(sa)
        check(len(line) == 2 and line[0]["_ref"].startswith("cf:"), "read_line recovers from transient 503 on DO")

        batch = quiet(RB.take, sa, holder="A")
        check(batch.get("shell") == "19.6.101" and len(batch["entries"]) == 2,
              "batch take merges both DO queue entries into v19.6.101")
        # Simulate sync_app + deploy + push mains
        put(sa / "app" / "sw.js", (A / "isabi-app" / "sw.js").read_text(encoding="utf-8"))
        put(sa / "functions" / "_lib" / "deployed_shell.js", "export const DEPLOYED_SHELL_VER = '19.6.101';\n")
        git(sa, "add", "-A")
        git(sa, "commit", "-q", "-m", "v19.6.101")
        quiet(RL.claim_deploy, sa, git(sa, "rev-parse", "HEAD"), "pages deploy")
        git(A / "isabi-app", "push", "-q", "origin", "HEAD:main")
        git(sa, "push", "-q", "origin", "HEAD:main")
        os.environ["ISABI_RELEASE_LIVE_SHELL"] = "19.6.101"
        quiet(RB.done, sa)

        st_b, _ = quiet(RB.wait, sb, e2["id"], wait_s=1)
        check(st_b == "SHIPPED", "waiting session B sees SHIPPED on DO")
        check("GET /release/state" in coord.calls, "poll_once uses atomic GET /release/state endpoint")
        quiet(RB.leave, sa, e1["id"])
        check(len(RB.read_line(sa)) == 0 and RL.read_remote_lock(sa) == ("", {}),
              "queue and lock clean after done + leave")

        # 5b. Corrupt DO lock state (version set with null/invalid payload) fails closed across both readers
        saved_ver, saved_doc = coord.lock_ver, coord.lock_doc
        try:
            coord.lock_ver, coord.lock_doc = "corrupt-ver", None
            check("cannot be read" in raises_lock(RL.read_remote_lock, sa),
                  "RL.read_remote_lock fails closed on corrupt DO lock state")
            check("cannot be read" in raises_lock(RB.read_state, sa),
                  "RB.read_state fails closed on corrupt DO lock state")
        finally:
            coord.lock_ver, coord.lock_doc = saved_ver, saved_doc

        # 6. Zero refs/locks/* or refs/release-queue/* created on GitHub bare repo
        refs_out = git(isabi_git, "for-each-ref", "refs/locks", "refs/release-queue")
        check(refs_out == "", "zero refs/locks or refs/release-queue refs created on GitHub bare repo")

    finally:
        srv.shutdown()
        srv.server_close()
        for k, v in saved_env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        shutil.rmtree(tmp, ignore_errors=True)

    failed = [name for ok, name in RESULTS if not ok]
    print(f"\nverify_release_cloudflare: {len(RESULTS) - len(failed)}/{len(RESULTS)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
