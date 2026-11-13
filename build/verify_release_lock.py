"""Gate: build/release_lock.py (one release at a time) and its place in deploy_cloudflare.py, release_data_only.py and
the push-to-main workflow.

Offline: a bare repository in a temp folder stands in for GitHub; two clones play two sessions (or a session and the
workflow). Never touches the real remote, the working tree of this checkout or Cloudflare.
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
NOW = "ISABI_RELEASE_LOCK_NOW"


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


def exits(fn, *a, **k):
    try:
        quiet(fn, *a, **k)
    except SystemExit as exc:
        return exc.code
    return None


def commit_file(repo: pathlib.Path, name: str) -> str:
    (repo / name).write_text(name, encoding="utf-8")
    git(repo, "add", name)
    git(repo, "commit", "-q", "-m", name)
    return git(repo, "rev-parse", "HEAD")


def main_tip(repo: pathlib.Path) -> str:
    git(repo, "fetch", "-q", "origin")
    return git(repo, "rev-parse", "origin/main")


def deployed(repo: pathlib.Path) -> list[str]:
    return [d.get("sha") for d in RL.read_remote_lock(repo)[1].get("deployed") or []]


def main() -> int:
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="isabi-release-lock-"))
    for k in ("ISABI_RELEASE_LOCK", NOW):
        os.environ.pop(k, None)
    try:
        origin = tmp / "origin.git"
        git(tmp, "init", "-q", "--bare", "-b", "main", str(origin))
        seed = tmp / "seed"
        git(tmp, "clone", "-q", str(origin), str(seed))
        commit_file(seed, "a.txt")
        git(seed, "push", "-q", "origin", "HEAD:main")
        A, B = tmp / "A", tmp / "B"
        git(tmp, "clone", "-q", str(origin), str(A))
        git(tmp, "clone", "-q", str(origin), str(B))

        # 1. free lock; A takes it; B cannot
        check(RL.read_remote_lock(A) == ("", {}), "free lock reads as free")
        info = quiet(RL.acquire, A, holder="session A", version="v19.6.900")
        check(bool(info.get("lockId")) and RL.held_by_me(info, A), "A takes the free lock and holds it")
        sha_b, info_b = RL.read_remote_lock(B)
        check(bool(sha_b) and info_b.get("holder") == "session A" and not RL.held_by_me(info_b, B), "B sees A's lock and does not hold it")
        check("held by session A" in raises_lock(RL.acquire, B, holder="session B"), "B's acquire is refused while A holds it")
        check(exits(RL.require_release_lock, B, purpose="test deploy") == 2, "B's deploy is stopped (exit 2) while A holds the lock")

        # 2. CAS on the remote ref
        tree = git(B, "mktree", "--missing")
        c = git(B, "commit-tree", tree, "-m", "race")
        check(RL._push_lock(c, "", B) is False, "a create race loses when the ref already exists (server-side compare)")
        check(RL._push_lock("", "0" * 40, B) is False, "a delete with a stale lease is refused")

        # 3. the token is per worktree
        wt = tmp / "A-wt"
        git(A, "worktree", "add", "-q", "--detach", str(wt))
        check(not RL.held_by_me(RL.read_remote_lock(wt)[1], wt), "another worktree of the same clone does not hold the lock")

        # 4. held, nothing deployed yet: the workflow does not deploy over it (review H1)
        quiet(RL.require_release_lock, A, purpose="test deploy")
        check(RL.read_remote_lock(A)[1].get("lockId") == info.get("lockId"), "the holder's deploy renews the same lock")
        ok, fail, _ = quiet(RL.ci_acquire, B, main_tip(B), wait_s=0)
        check(ok is False and fail is False, "workflow: a lock held with nothing deployed yet is not deployed over")

        # 5. claim before going live; a commit lacking the current main is refused
        dep = commit_file(A, "b.txt")
        quiet(RL.claim_deploy, A, dep, "pages-only deploy")
        check(deployed(B) == [dep], "claim_deploy writes the commit into the lock before going live")
        git(B, "pull", "-q", "--ff-only", "origin", "main")
        commit_file(B, "peer.txt")
        git(B, "push", "-q", "origin", "HEAD:main")  # a peer reaches main meanwhile (pushing main needs no lock)
        check("does not contain origin/main" in raises_lock(RL.claim_deploy, A, dep, "pages-only deploy"),
              "claim_deploy refuses a commit that lacks what reached main since the lock was taken")
        git(A, "pull", "-q", "--rebase", "origin", "main")
        dep2 = git(A, "rev-parse", "HEAD")
        quiet(RL.claim_deploy, A, dep2, "pages-only deploy")
        check(deployed(B) == [dep, dep2], "the rebased redeploy is recorded as the latest deploy")
        msg = raises_lock(RL.release, A)
        check("not on origin/main" in msg and "rebased" in msg, "release is refused until the live deploy is on main, and says what to do")
        check("does not hold it" in raises_lock(RL.release, B), "B cannot release A's lock")
        ok, fail, _ = quiet(RL.ci_acquire, B, main_tip(B), wait_s=0)
        check(ok is False and fail is False, "workflow: does not deploy main while the holder's unpushed deploy is live")

        # 6. expired with an unpushed live deploy
        os.environ[NOW] = "2099-01-01T00:00:00Z"
        check("not on origin/main" in raises_lock(RL.acquire, B, holder="session B"), "an expired lock with an unpushed deploy is not taken over")
        ok, fail, _ = quiet(RL.ci_acquire, B, main_tip(B), wait_s=0)
        check(ok is False and fail is True, "workflow: an expired lock with an unpushed live deploy fails the run")
        os.environ.pop(NOW)

        # 7. push, release; then the workflow takes the free lock, records its commit and gives it back
        git(A, "push", "-q", "origin", "HEAD:main")
        quiet(RL.release, A)
        check(RL.read_remote_lock(B) == ("", {}) and not RL._token_path(A).exists(), "after push + release the lock is free and A's token is gone")
        tip = main_tip(B)
        ok, fail, _ = quiet(RL.ci_acquire, B, tip, wait_s=0, holder="GitHub Actions test")
        _, info_ci = RL.read_remote_lock(A)
        check(ok is True and info_ci.get("holder") == "GitHub Actions test" and deployed(A) == [tip],
              "workflow: takes the free lock and records the pushed commit before going live")
        check("held by GitHub Actions test" in raises_lock(RL.acquire, A, holder="session A"), "a session waits while the workflow deploys")
        quiet(RL.renew, B, ttl_min=30)
        quiet(RL.release, B)
        check(RL.read_remote_lock(A) == ("", {}), "workflow: renews before going live and gives the lock back")

        # 8. the holder already deployed exactly this commit
        quiet(RL.acquire, A, holder="session A")
        quiet(RL.claim_deploy, A, tip, "pages-only deploy")
        ok, fail, msg = quiet(RL.ci_acquire, B, tip, wait_s=0)
        check(ok is False and fail is False and "already deployed" in msg, "workflow: nothing to do when the holder already deployed this commit")
        quiet(RL.release, A)

        # 9. expiry, grace period and takeover; the old holder cannot go live any more (review H2)
        os.environ[NOW] = "2030-01-01T00:00:00Z"
        quiet(RL.acquire, A, holder="session A", ttl_min=5)
        os.environ[NOW] = "2030-01-01T00:12:00Z"
        check("held by session A" in raises_lock(RL.acquire, B, holder="session B"), "no takeover within 10 min of expiry (clock skew)")
        os.environ[NOW] = "2030-01-01T00:20:00Z"
        info_b2 = quiet(RL.acquire, B, holder="session B")
        check(info_b2.get("holder") == "session B" and (info_b2.get("tookOverFrom") or {}).get("holder") == "session A",
              "an expired lock with nothing unpushed is taken over, and the takeover is recorded")
        check("does not hold it" in raises_lock(RL.renew, A), "the old holder cannot renew after a takeover")
        late = commit_file(A, "late.txt")
        check("no longer holds it" in raises_lock(RL.claim_deploy, A, late, "pages-only deploy") and deployed(B) == [],
              "the old holder cannot go live after a takeover, and nothing is written into the new lock")
        check(exits(RL.claim_deploy_or_exit, A, late, "pages-only deploy") == 2, "the deploy scripts stop (exit 2) instead of going live")
        os.environ.pop(NOW)
        quiet(RL.release, B)

        # 10. --takeover covers an expired lock with an unpushed deploy
        git(B, "pull", "-q", "--ff-only", "origin", "main")
        quiet(RL.acquire, B, holder="session B")
        dep3 = commit_file(B, "c.txt")
        quiet(RL.claim_deploy, B, dep3, "full deploy")
        os.environ[NOW] = "2099-01-01T03:00:00Z"
        info_a2 = quiet(RL.acquire, A, holder="session A", takeover=True)
        check(info_a2.get("holder") == "session A", "acquire --takeover takes an expired lock with an unpushed deploy")
        os.environ.pop(NOW)
        quiet(RL.release, A, force=True)

        # 11. a lock that cannot be read is never free (review M3)
        blob = subprocess.run(["git", "hash-object", "-w", "--stdin"], cwd=str(B), input=b"not json", capture_output=True).stdout.decode().strip()
        bad_tree = subprocess.run(["git", "mktree"], cwd=str(B), input=f"100644 blob {blob}\tLOCK.json\n".encode(), capture_output=True).stdout.decode().strip()
        bad = git(B, "commit-tree", bad_tree, "-m", "bad lock")
        git(B, "push", "-q", "origin", f"{bad}:{RL.LOCK_REF}")
        check("cannot be read" in raises_lock(RL.acquire, A, holder="session A"), "an unreadable lock refuses acquire")
        check("cannot be read" in raises_lock(RL.ci_acquire, A, main_tip(A), wait_s=0), "an unreadable lock stops the workflow")
        git(B, "push", "-q", "origin", f":{RL.LOCK_REF}")

        # 12. bypass
        os.environ["ISABI_RELEASE_LOCK"] = "off"
        check(quiet(RL.require_release_lock, B, purpose="x") is None, "ISABI_RELEASE_LOCK=off bypasses the lock")
        os.environ.pop("ISABI_RELEASE_LOCK")
        check(quiet(RL.require_release_lock, B, purpose="x", bypass=True) is None, "--no-release-lock bypasses the lock")
        check(exits(RL.claim_deploy_or_exit, B, dep3, "x", bypass=True) is None, "--no-release-lock skips the pre-deploy claim")

        # 13. unreadable remote fails closed
        git(B, "remote", "set-url", "origin", str(tmp / "missing.git"))
        check(exits(RL.require_release_lock, B, purpose="x") == 2, "an unreachable remote stops the deploy")

        # 14. live comparison: Cloudflare's analytics beacon and the dropped last newline are not a difference
        main_html = b"\xef\xbb\xbf<html><body>\n  </script>\n</body>\n</html>\n"
        live_html = (b"<html><body>\n  </script>\n<script type=\"module\" src=\"https://static.cloudflareinsights.com/beacon.min.js/v1\" "
                     b"data-cf-beacon='{\"r\":1}' crossorigin=\"anonymous\"></script>\n</body>\n</html>")
        check(RL._served_id("app/index.html", main_html) == RL._served_id("app/index.html", live_html), "live HTML with the Cloudflare beacon matches main")
        check(RL._served_id("app/index.html", main_html) != RL._served_id("app/index.html", live_html.replace(b"<body>", b"<body x>")),
              "a real HTML change still shows as a difference")
        check(RL._served_id("app/sw.js", b"a\n") != RL._served_id("app/sw.js", b"a"), "non-HTML files compare byte for byte")

        # 15. wiring
        import deploy_cloudflare as D  # noqa: PLC0415

        check(D.parse_cli_args(["--pages-only", "--no-release-lock"]).no_release_lock is True, "deploy_cloudflare.py accepts --no-release-lock")
        check(exits(D.parse_cli_args, ["--configure-domain", "--no-release-lock"]) == 2, "--configure-domain rejects --no-release-lock")
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            D.print_dry_run_plan(D.parse_cli_args(["--pages-only", "--dry"]))
        check("Hold the release lock" in buf.getvalue(), "the dry-run plan lists the release lock step")
        src = (BUILD / "deploy_cloudflare.py").read_text(encoding="utf-8")
        i_lock = src.find("release_lock.require_release_lock(")
        i_fresh = src.find("check_checkout_not_behind_origin(\n        ISABI_ROOT,")
        i_po = src.find('_claim_deploy("pages-only deploy")\n        deploy_pages(env)')
        i_full = src.find('_claim_deploy("full deploy")\n    deploy_pages(env)')
        check(0 < i_lock < i_fresh < i_po and i_full > 0, "deploy_cloudflare.py: lock, then freshness, then a claim right before each deploy_pages")
        rd = (BUILD / "release_data_only.py").read_text(encoding="utf-8")
        check('a.stage in ("upload", "r2", "pages")' in rd and "lock_mod().require_release_lock(" in rd,
              "release_data_only.py holds the lock for upload, r2 and pages")
        check(0 < rd.find("claim_deploy_or_exit(ISABI, head") < rd.find('"pages", "deploy", str(bundle)'),
              "release_data_only.py claims right before the Pages upload")
        check('_load_committed("release_lock")' in rd, "release_data_only.py runs the lock code committed at HEAD")
        wf = (BUILD.parent / ".github" / "workflows" / "deploy.yml").read_text(encoding="utf-8")
        i_acq, i_renew, i_dep, i_rel = (wf.find("release_lock.py ci-acquire"), wf.find("release_lock.py renew"),
                                        wf.find("- name: Deploy"), wf.find("release_lock.py release"))
        check(0 < i_acq < i_renew < i_dep < i_rel and "contents: write" in wf and wf.count("steps.lock.outputs.deploy == 'true'") >= 5,
              "workflow: takes the lock, renews it right before Deploy, gives it back; live steps gated on it")
    finally:
        for k in ("ISABI_RELEASE_LOCK", NOW):
            os.environ.pop(k, None)
        shutil.rmtree(tmp, ignore_errors=True)

    failed = [n for ok, n in RESULTS if not ok]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
