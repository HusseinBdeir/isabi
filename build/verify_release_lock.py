"""Gate: build/release_lock.py (one release at a time) and its place in deploy_cloudflare.py / release_data_only.py.

Offline: a bare repository in a temp folder stands in for GitHub; two clones play two sessions. Never touches the real
remote, the working tree of this checkout or Cloudflare.
Run: python build/verify_release_lock.py      (exit 1 with every failed check named)
"""
from __future__ import annotations

import contextlib
import io
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

sys.stdout.reconfigure(encoding="utf-8")
BUILD = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(BUILD))

import release_lock as RL  # noqa: E402

RESULTS: list[tuple[bool, str]] = []


def check(ok: bool, name: str) -> None:
    RESULTS.append((bool(ok), name))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}")


def git(cwd: pathlib.Path, *args: str) -> str:
    env = dict(os.environ, GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@t", GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@t")
    return subprocess.run(["git", *args], cwd=str(cwd), input="", capture_output=True, text=True, check=True, env=env).stdout.strip()


def raises_lock(fn, *a, **k) -> str:
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            fn(*a, **k)
    except RL.LockError as exc:
        return str(exc) or "LockError"
    return ""


def quiet(fn, *a, **k):
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        return fn(*a, **k)


def commit_file(repo: pathlib.Path, name: str) -> str:
    (repo / name).write_text(name, encoding="utf-8")
    git(repo, "add", name)
    git(repo, "commit", "-q", "-m", name)
    return git(repo, "rev-parse", "HEAD")


def main() -> int:
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="isabi-release-lock-"))
    os.environ.pop("ISABI_RELEASE_LOCK", None)
    os.environ.pop("ISABI_RELEASE_LOCK_ID", None)
    os.environ.pop("ISABI_RELEASE_LOCK_NOW", None)
    try:
        origin = tmp / "origin.git"
        git(tmp, "init", "-q", "--bare", "-b", "main", str(origin))
        seed = tmp / "seed"
        git(tmp, "clone", "-q", str(origin), str(seed))
        commit_file(seed, "a.txt")
        git(seed, "push", "-q", "origin", "HEAD:main")
        A = tmp / "A"
        B = tmp / "B"
        git(tmp, "clone", "-q", str(origin), str(A))
        git(tmp, "clone", "-q", str(origin), str(B))

        # 1. free lock; A takes it; B cannot
        check(RL.read_remote_lock(A) == ("", {}), "free lock reads as free")
        info = quiet(RL.acquire, A, holder="session A", version="v19.6.900", ttl_min=60)
        check(bool(info.get("lockId")) and RL.held_by_me(info, A), "A takes the free lock and holds it")
        sha_b, info_b = RL.read_remote_lock(B)
        check(bool(sha_b) and info_b.get("holder") == "session A" and not RL.held_by_me(info_b, B), "B sees A's lock and does not hold it")
        msg = raises_lock(RL.acquire, B, holder="session B")
        check("held by session A" in msg, "B's acquire is refused while A holds it")
        try:
            quiet(RL.require_release_lock, B, purpose="test deploy")
            check(False, "B's deploy is stopped (exit 2) while A holds the lock")
        except SystemExit as exc:
            check(exc.code == 2, "B's deploy is stopped (exit 2) while A holds the lock")

        # 2. a racing create loses: the push carries "must not exist"
        tree = git(B, "mktree", "--missing")  # empty tree, never needs the objects
        c = git(B, "commit-tree", tree, "-m", "race")
        check(RL._push_lock(c, "", B) is False, "a create race loses when the ref already exists (server-side compare)")
        check(RL._push_lock("", "0" * 40, B) is False, "a delete with a stale lease is refused")

        # 3. a worktree of A's clone does not hold A's lock (token is per worktree)
        wt = tmp / "A-wt"
        git(A, "worktree", "add", "-q", "--detach", str(wt))
        check(not RL.held_by_me(RL.read_remote_lock(wt)[1], wt), "another worktree of the same clone does not hold the lock")

        # 4. A renews and A's deploy is required to reach main before release
        quiet(RL.require_release_lock, A, purpose="test deploy")  # held here: renews
        dep = commit_file(A, "b.txt")
        quiet(RL.record_deploy, A, dep, "pages-only deploy")
        _, info_a = RL.read_remote_lock(A)
        check([d.get("sha") for d in info_a.get("deployed") or []] == [dep], "the deployed commit is written into the lock")
        check(info_a.get("lockId") == info.get("lockId"), "renewing keeps the same lock id")
        msg = raises_lock(RL.release, A)
        check("not on origin/main" in msg, "release is refused while the deployed commit is not on origin/main")
        msg = raises_lock(RL.release, B)
        check("does not hold it" in msg, "B cannot release A's lock")

        # 4b. the push-to-main workflow does not deploy a commit that lacks the lock's live deploy
        main_b = git(B, "rev-parse", "origin/main")
        ok, exp, _ = quiet(RL.ci_check, B, main_b)
        check(ok is False and exp is False, "ci-check: a main commit without the holder's live deploy is not deployed")
        ok, _, _ = quiet(RL.ci_check, A, dep)
        check(ok is True, "ci-check: the holder's own commit is deployed")
        os.environ["ISABI_RELEASE_LOCK_NOW"] = "2099-01-01T00:00:00Z"
        ok, exp, _ = quiet(RL.ci_check, B, main_b)
        check(ok is False and exp is True, "ci-check: an expired lock with an unpushed live deploy fails the run")
        os.environ.pop("ISABI_RELEASE_LOCK_NOW", None)

        # 5. expiry: a lock with an unpushed deploy is not taken over without --takeover
        os.environ["ISABI_RELEASE_LOCK_NOW"] = "2099-01-01T00:00:00Z"
        msg = raises_lock(RL.acquire, B, holder="session B")
        check("not on origin/main" in msg, "an expired lock with an unpushed deploy is not taken over silently")
        os.environ.pop("ISABI_RELEASE_LOCK_NOW", None)

        # 6. A pushes main, then releases
        git(A, "push", "-q", "origin", "HEAD:main")
        quiet(RL.release, A)
        check(RL.read_remote_lock(B) == ("", {}), "after push + release the lock is free")
        check(not RL._token_path(A).exists(), "release drops A's local token")
        ok, _, _ = quiet(RL.ci_check, B, git(A, "rev-parse", "HEAD"))
        check(ok is True, "ci-check: a free lock lets main deploy")

        # 6b. a redeploy after a rebase supersedes the first deploy: release needs only the latest on main
        quiet(RL.acquire, A, holder="session A")
        x1 = commit_file(A, "x1.txt")
        quiet(RL.record_deploy, A, x1, "pages-only deploy")
        git(B, "pull", "-q", "origin", "main")
        commit_file(B, "peer.txt")
        git(B, "push", "-q", "origin", "HEAD:main")  # a peer reached main first
        git(A, "fetch", "-q", "origin")
        git(A, "rebase", "-q", "origin/main")
        x2 = git(A, "rev-parse", "HEAD")
        quiet(RL.record_deploy, A, x2, "pages-only deploy")
        git(A, "push", "-q", "origin", "HEAD:main")
        msg = raises_lock(RL.release, A)
        check(msg == "" and RL.read_remote_lock(B) == ("", {}), "release after a rebased redeploy: only the latest deploy must be on main")

        # 7. expired lock with every deploy on main: B takes it over; A can no longer renew
        quiet(RL.acquire, A, holder="session A", ttl_min=5)
        os.environ["ISABI_RELEASE_LOCK_NOW"] = "2099-01-01T00:00:00Z"
        info_b2 = quiet(RL.acquire, B, holder="session B", ttl_min=60)
        check(info_b2.get("holder") == "session B" and (info_b2.get("tookOverFrom") or {}).get("holder") == "session A",
              "an expired lock whose deploys are on main is taken over, and the takeover is recorded")
        msg = raises_lock(RL.renew, A)
        check("does not hold it" in msg, "the old holder cannot renew after a takeover")
        os.environ.pop("ISABI_RELEASE_LOCK_NOW", None)

        # 8. --takeover covers an expired lock with an unpushed deploy
        dep2 = commit_file(B, "c.txt")
        quiet(RL.record_deploy, B, dep2, "full deploy")
        os.environ["ISABI_RELEASE_LOCK_NOW"] = "2099-01-01T03:00:00Z"
        info_a2 = quiet(RL.acquire, A, holder="session A", takeover=True)
        check(info_a2.get("holder") == "session A", "acquire --takeover takes an expired lock with an unpushed deploy")
        os.environ.pop("ISABI_RELEASE_LOCK_NOW", None)
        quiet(RL.release, A, force=True)

        # 9. bypass
        os.environ["ISABI_RELEASE_LOCK"] = "off"
        check(quiet(RL.require_release_lock, B, purpose="x") is None, "ISABI_RELEASE_LOCK=off bypasses the lock")
        os.environ.pop("ISABI_RELEASE_LOCK", None)
        check(quiet(RL.require_release_lock, B, purpose="x", bypass=True) is None, "--no-release-lock bypasses the lock")

        # 10. unreadable remote fails closed
        git(B, "remote", "set-url", "origin", str(tmp / "missing.git"))
        try:
            quiet(RL.require_release_lock, B, purpose="x")
            check(False, "an unreachable remote stops the deploy")
        except SystemExit as exc:
            check(exc.code == 2, "an unreachable remote stops the deploy")

        # 10b. live comparison: Cloudflare's analytics beacon and the dropped last newline are not a difference
        main_html = b"\xef\xbb\xbf<html><body>\n  </script>\n</body>\n</html>\n"
        live_html = (b"<html><body>\n  </script>\n<script type=\"module\" src=\"https://static.cloudflareinsights.com/beacon.min.js/v1\" "
                     b"data-cf-beacon='{\"r\":1}' crossorigin=\"anonymous\"></script>\n</body>\n</html>")
        check(RL._served_id("app/index.html", main_html) == RL._served_id("app/index.html", live_html),
              "live HTML with the Cloudflare beacon matches main")
        check(RL._served_id("app/index.html", main_html) != RL._served_id("app/index.html", live_html.replace(b"<body>", b"<body x>")),
              "a real HTML change still shows as a difference")
        check(RL._served_id("app/sw.js", b"a\n") != RL._served_id("app/sw.js", b"a"), "non-HTML files compare byte for byte")

        # 11. deploy_cloudflare.py wiring
        import deploy_cloudflare as D  # noqa: PLC0415

        args = D.parse_cli_args(["--pages-only", "--no-release-lock"])
        check(args.no_release_lock is True, "deploy_cloudflare.py accepts --no-release-lock")
        try:
            quiet(D.parse_cli_args, ["--configure-domain", "--no-release-lock"])
            check(False, "--configure-domain rejects --no-release-lock")
        except SystemExit as exc:
            check(exc.code == 2, "--configure-domain rejects --no-release-lock")
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            D.print_dry_run_plan(D.parse_cli_args(["--pages-only", "--dry"]))
        check("Hold the release lock" in buf.getvalue(), "the dry-run plan lists the release lock step")
        src = (BUILD / "deploy_cloudflare.py").read_text(encoding="utf-8")
        i_lock = src.find("release_lock.require_release_lock(")
        i_fresh = src.find("check_checkout_not_behind_origin(\n        ISABI_ROOT,")
        i_pages = src.find("    if args.pages_only:\n        deploy_pages(env)")
        check(0 < i_lock < i_fresh < i_pages, "deploy_cloudflare.py takes the lock before the freshness check and the deploy")
        rd = (BUILD / "release_data_only.py").read_text(encoding="utf-8")
        check('a.stage in ("upload", "r2", "pages")' in rd and "require_release_lock(" in rd,
              "release_data_only.py holds the lock for upload, r2 and pages")
        check("check_checkout_not_behind_origin(ISABI" in rd, "release_data_only.py pages refuses a HEAD behind origin/main")
    finally:
        for k in ("ISABI_RELEASE_LOCK", "ISABI_RELEASE_LOCK_NOW"):
            os.environ.pop(k, None)
        shutil.rmtree(tmp, ignore_errors=True)

    failed = [n for ok, n in RESULTS if not ok]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
