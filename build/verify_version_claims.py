"""Gate: deploy_cloudflare.py shell version-claim guard (`--allow-claimed-version` & `origin/wt/*` / `refs/locks/release`).

Offline: bare repositories in a temporary directory model `isabi` and `isabi-app` across two peer clones plus a
local worktree. Never touches real remotes, the developer workspace outside temp, or Cloudflare.
Run: python build/verify_version_claims.py
"""
from __future__ import annotations

import contextlib
import io
import os
import pathlib
import subprocess
import sys
import tempfile

sys.stdout.reconfigure(encoding="utf-8")
BUILD = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(BUILD))

import deploy_cloudflare as dc  # noqa: E402
import release_lock as rl  # noqa: E402

RESULTS: list[tuple[bool, str]] = []


def check(ok: bool, name: str, detail: str = "") -> None:
    RESULTS.append((bool(ok), name))
    msg = f"[{'PASS' if ok else 'FAIL'}] {name}"
    if not ok and detail:
        msg += f": {detail}"
    print(msg)


def _git(cwd: pathlib.Path, args: list[str], env: dict, *, check_rc: bool = True) -> subprocess.CompletedProcess:
    run_env = dict(
        env,
        GIT_AUTHOR_NAME="Test",
        GIT_AUTHOR_EMAIL="test@example.com",
        GIT_COMMITTER_NAME="Test",
        GIT_COMMITTER_EMAIL="test@example.com",
    )
    r = subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        env=run_env,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if check_rc and r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} in {cwd} failed: {(r.stderr or r.stdout).strip()}")
    return r


def _commit(repo: pathlib.Path, rel_files: dict[str, str], msg: str, env: dict) -> str:
    for rel, content in rel_files.items():
        fp = repo / rel
        fp.parent.mkdir(parents=True, exist_ok=True)
        fp.write_text(content, encoding="utf-8", newline="\n")
        _git(repo, ["add", rel], env)
    _git(repo, ["-c", "commit.gpgsign=false", "commit", "-q", "-m", msg], env)
    return _git(repo, ["rev-parse", "HEAD"], env).stdout.strip()


def _sw(ver: str, extra: str = "") -> str:
    return f"const SHELL_CACHE = 'isabi-mfg-{ver}';\n{extra}"


def _expect_exit2(fn, *args, **kwargs) -> tuple[int | None, str]:
    out_buf = io.StringIO()
    err_buf = io.StringIO()
    rc = None
    with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
        try:
            fn(*args, **kwargs)
        except SystemExit as ex:
            rc = ex.code
    return rc, err_buf.getvalue()


def _expect_ok(fn, *args, **kwargs) -> tuple[int, str]:
    out_buf = io.StringIO()
    err_buf = io.StringIO()
    with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
        rc = fn(*args, **kwargs)
    return int(rc), out_buf.getvalue()


def main() -> int:
    git_env = dc.build_env()

    # 0. Unit checks for version parsing, formatting, suggestion, and sibling resolution
    check(dc.parse_shell_version("const SHELL_CACHE = 'isabi-mfg-v19.6.346';\n") == (19, 6, 346), "parse-sw-header")
    check(dc.parse_shell_version("v19.6.346") == (19, 6, 346), "parse-v-str")
    check(dc.parse_shell_version("garbage without version") is None, "parse-garbage-none")
    check(dc.format_shell_version((19, 6, 347)) == "v19.6.347", "format-shell-version")
    check(
        dc.suggest_next_shell_version((19, 6, 346), [{"version": "v19.6.348"}, {"version": "v19.6.347"}]) == "v19.6.349",
        "suggest-next-peak",
    )

    with tempfile.TemporaryDirectory(prefix="isabi-ver-claims-", ignore_cleanup_errors=True) as td_str:
        base = pathlib.Path(td_str)

        # Verify resolve_app_repo_dir never falls back to ~/bhfirms/isabi-app for temp checkouts
        isolated_dir = base / "isolated" / "isabi"
        isolated_dir.mkdir(parents=True, exist_ok=True)
        check(dc.resolve_app_repo_dir(isolated_dir) is None, "resolve-app-no-home-fallback")

        # Set up bare origins for isabi and isabi-app at v19.6.346
        isabi_bare = base / "isabi-origin.git"
        app_bare = base / "app-origin.git"
        _git(base, ["init", "--bare", "-q", "-b", "main", str(isabi_bare)], git_env)
        _git(base, ["init", "--bare", "-q", "-b", "main", str(app_bare)], git_env)

        seed_app = base / "seed-app"
        seed_isabi = base / "seed-isabi"
        _git(base, ["clone", "-q", str(app_bare), str(seed_app)], git_env)
        _git(base, ["clone", "-q", str(isabi_bare), str(seed_isabi)], git_env)
        _commit(seed_app, {"sw.js": _sw("v19.6.346"), "js/app.js": "// app 346\n"}, "init app 346", git_env)
        _git(seed_app, ["branch", "-M", "main"], git_env)
        _git(seed_app, ["push", "-q", "-u", "origin", "main"], git_env)

        _commit(
            seed_isabi,
            {"index.html": "<h1>v1</h1>\n", "app/sw.js": _sw("v19.6.346"), "app/js/app.js": "// app 346\n"},
            "init isabi 346",
            git_env,
        )
        _git(seed_isabi, ["branch", "-M", "main"], git_env)
        _git(seed_isabi, ["push", "-q", "-u", "origin", "main"], git_env)

        # Peer workspace clones + local paired worktree workspace ("mine")
        peer_ws = base / "peer"
        peer_ws.mkdir()
        peer_app = peer_ws / "isabi-app"
        peer_isabi = peer_ws / "isabi"
        _git(peer_ws, ["clone", "-q", "-b", "main", str(app_bare), str(peer_app)], git_env)
        _git(peer_ws, ["clone", "-q", "-b", "main", str(isabi_bare), str(peer_isabi)], git_env)

        my_hub = base / "mine-base"
        my_hub.mkdir()
        _git(my_hub, ["clone", "-q", "-b", "main", str(app_bare), "isabi-app"], git_env)
        _git(my_hub, ["clone", "-q", "-b", "main", str(isabi_bare), "isabi"], git_env)
        # Create paired git worktrees so `.git` is a FILE in both my_ws/isabi and my_ws/isabi-app
        my_ws = base / "my-wt"
        my_ws.mkdir()
        my_app = my_ws / "isabi-app"
        my_isabi = my_ws / "isabi"
        _git(my_hub / "isabi-app", ["worktree", "add", "-q", "-b", "wt/my-feat", str(my_app), "origin/main"], git_env)
        _git(my_hub / "isabi", ["worktree", "add", "-q", "-b", "wt/my-feat", str(my_isabi), "origin/main"], git_env)
        check(dc.resolve_app_repo_dir(my_isabi) == my_app, "resolve-app-worktree-git-file")

        # Case 1: Peer origin/wt/* in isabi-app claims v19.6.347 -> local bump to v19.6.347 refused (suggests 348)
        _git(peer_app, ["checkout", "-q", "-b", "wt/peer-app-347", "origin/main"], git_env)
        _commit(peer_app, {"sw.js": _sw("v19.6.347"), "js/app.js": "// peer 347\n"}, "peer 347", git_env)
        _git(peer_app, ["push", "-q", "origin", "wt/peer-app-347"], git_env)

        _commit(my_isabi, {"app/sw.js": _sw("v19.6.347"), "app/js/app.js": "// my 347\n"}, "my 347", git_env)
        rc1, err1 = _expect_exit2(dc.check_shell_version_claims, my_isabi, env=git_env)
        check(rc1 == 2 and "v19.6.347" in err1 and "origin/wt/peer-app-347" in err1 and "v19.6.348" in err1, "case1-app-peer-wt-blocks", err1)

        # Case 2: Peer origin/wt/* in isabi claims v19.6.348 -> local bump to v19.6.348 refused (suggests 349)
        _git(peer_isabi, ["checkout", "-q", "-b", "wt/peer-isabi-348", "origin/main"], git_env)
        _commit(peer_isabi, {"app/sw.js": _sw("v19.6.348"), "app/js/app.js": "// peer isabi 348\n"}, "peer isabi 348", git_env)
        _git(peer_isabi, ["push", "-q", "origin", "wt/peer-isabi-348"], git_env)

        _commit(my_isabi, {"app/sw.js": _sw("v19.6.348")}, "my 348", git_env)
        rc2, err2 = _expect_exit2(dc.check_shell_version_claims, my_isabi, env=git_env)
        check(rc2 == 2 and "v19.6.348" in err2 and "origin/wt/peer-isabi-348" in err2 and "v19.6.349" in err2, "case2-isabi-peer-wt-blocks", err2)

        # Case 3: Own branch (direct push AND child commit) claiming v19.6.349 passes!
        _commit(my_app, {"sw.js": _sw("v19.6.349"), "js/app.js": "// mine 349\n"}, "mine app 349", git_env)
        _git(my_app, ["push", "-q", "origin", "wt/my-feat"], git_env)
        _commit(my_isabi, {"app/sw.js": _sw("v19.6.349"), "app/js/app.js": "// mine 349\n"}, "mine isabi 349", git_env)
        _git(my_isabi, ["push", "-q", "origin", "wt/my-feat"], git_env)
        rc3a, _ = _expect_ok(dc.check_shell_version_claims, my_isabi, env=git_env)
        # Child commit on top of pushed own branch also passes
        _commit(my_app, {"js/app.js": "// mine 349 child\n"}, "mine app child", git_env)
        _commit(my_isabi, {"app/js/app.js": "// mine 349 child\n"}, "mine isabi child", git_env)
        rc3b, _ = _expect_ok(dc.check_shell_version_claims, my_isabi, env=git_env)
        check(rc3a == 0 and rc3b == 0, "case3-own-branch-direct-and-child-passes")

        # Case 4: Dual claim (both mine wt/my-feat AND peer wt/collide claim v19.6.349) -> peer still blocks!
        peer_app2 = base / "peer-app2"
        _git(base, ["clone", "-q", "-b", "main", str(app_bare), str(peer_app2)], git_env)
        _git(peer_app2, ["checkout", "-q", "-b", "wt/collide-349"], git_env)
        _commit(peer_app2, {"sw.js": _sw("v19.6.349"), "js/app.js": "// collide 349\n"}, "collide 349", git_env)
        _git(peer_app2, ["push", "-q", "origin", "wt/collide-349"], git_env)
        rc4, err4 = _expect_exit2(dc.check_shell_version_claims, my_isabi, env=git_env)
        check(rc4 == 2 and "wt/collide-349" in err4 and "v19.6.350" in err4, "case4-dual-claim-mine-and-theirs-blocks", err4)

        # Case 5 & 6: Merged wt/* + historical wt/* (< main) no longer block after main advances
        # Add historical stale wt/old-344 on app_bare (< 346 and < 350)
        _git(peer_app2, ["checkout", "-q", "-b", "wt/old-344", "origin/main"], git_env)
        _commit(peer_app2, {"sw.js": _sw("v19.6.344")}, "old 344", git_env)
        _git(peer_app2, ["push", "-q", "origin", "wt/old-344"], git_env)

        # Merge peer wt/peer-app-347 -> main on app_bare & advance both mains to v19.6.350 (with merged ref history)
        _git(seed_app, ["fetch", "-q", "origin"], git_env)
        _git(seed_app, ["merge", "-q", "--no-ff", "origin/wt/peer-app-347", "-m", "merge 347"], git_env)
        _commit(seed_app, {"sw.js": _sw("v19.6.350")}, "main 350", git_env)
        _git(seed_app, ["push", "-q", "origin", "main"], git_env)

        _git(seed_isabi, ["fetch", "-q", "origin"], git_env)
        _git(seed_isabi, ["merge", "-q", "--no-ff", "origin/wt/peer-isabi-348", "-m", "merge 348"], git_env)
        _commit(seed_isabi, {"app/sw.js": _sw("v19.6.350"), "app/js/app.js": "// main 350\n"}, "main 350", git_env)
        _git(seed_isabi, ["push", "-q", "origin", "main"], git_env)

        # Create clean branch at origin/main (v19.6.350) with no app/ changes yet
        _git(my_app, ["fetch", "-q", "origin"], git_env)
        _git(my_app, ["reset", "-q", "--hard", "origin/main"], git_env)
        _git(my_isabi, ["fetch", "-q", "origin"], git_env)
        _git(my_isabi, ["reset", "-q", "--hard", "origin/main"], git_env)

        claims_now = dc.collect_unshipped_version_claims(my_isabi, env=git_env)
        ref_names = [c["ref"] for c in claims_now["claims"]]
        check(
            "origin/wt/peer-app-347" not in ref_names
            and "origin/wt/peer-isabi-348" not in ref_names
            and "origin/wt/old-344" not in ref_names,
            "case5-6-merged-and-historical-wt-ignored",
            f"claims={ref_names}",
        )

        # Case 7: Unchanged Showcase deploy (only root index.html edited, app/ identical to origin/main) -> PASSES
        _commit(my_isabi, {"index.html": "<h1>showcase only update</h1>\n"}, "showcase edit", git_env)
        rc7, _ = _expect_ok(dc.check_shell_version_claims, my_isabi, env=git_env)
        check(rc7 == 0, "case7-unchanged-showcase-deploy-passes")

        # Case 8: Unbumped app/ edits (app/js/app.js changed while sw.js stayed at main v19.6.350) -> REFUSED
        _commit(my_isabi, {"app/js/app.js": "// unbumped edit\n"}, "unbumped app edit", git_env)
        rc8, err8 = _expect_exit2(dc.check_shell_version_claims, my_isabi, env=git_env)
        check(rc8 == 2 and "unbumped" in err8 and "v19.6.351" in err8, "case8-unbumped-app-edit-blocked", err8)

        # Also older sw.js (< origin/main) is ALWAYS refused
        _commit(my_isabi, {"app/sw.js": _sw("v19.6.349")}, "older sw version", git_env)
        rc8b, err8b = _expect_exit2(dc.check_shell_version_claims, my_isabi, env=git_env)
        check(rc8b == 2 and "older than origin/main" in err8b, "case8b-older-sw-version-blocked", err8b)

        # Case 9: Active peer refs/locks/release holding v19.6.351 blocks local v19.6.351, suggests v19.6.352
        with contextlib.redirect_stdout(io.StringIO()):
            rl.acquire(peer_isabi, holder="peer session", version="v19.6.351")
        _commit(my_isabi, {"app/sw.js": _sw("v19.6.351"), "app/js/app.js": "// 351\n"}, "bump 351", git_env)
        rc9, err9 = _expect_exit2(dc.check_shell_version_claims, my_isabi, env=git_env)
        check(rc9 == 2 and "refs/locks/release" in err9 and "v19.6.352" in err9, "case9-active-peer-lock-blocks", err9)

        # When peer releases lock, bumping to v19.6.352 passes cleanly
        with contextlib.redirect_stdout(io.StringIO()):
            rl.release(peer_isabi, force=True)
        _commit(my_isabi, {"app/sw.js": _sw("v19.6.352")}, "bump 352", git_env)
        rc9b, _ = _expect_ok(dc.check_shell_version_claims, my_isabi, env=git_env)
        check(rc9b == 0, "case9b-clean-bump-after-release-passes")

        # Case 10: Missing origin remote fails closed (exit 2); allow_claimed_version bypasses
        no_rem = base / "no-remote"
        no_rem.mkdir()
        _git(no_rem, ["init", "-q", "-b", "main"], git_env)
        _commit(no_rem, {"app/sw.js": _sw("v19.6.352")}, "init no remote", git_env)
        rc10, err10 = _expect_exit2(dc.check_shell_version_claims, no_rem, env=git_env)
        rc10_allow, _ = _expect_ok(dc.check_shell_version_claims, no_rem, allow_claimed_version=True, env=git_env)
        check(rc10 == 2 and "missing" in err10.lower() and rc10_allow == 0, "case10-missing-remote-fail-closed", err10)

        # Case 11: --allow-claimed-version override returns 0 even during peer conflict
        _commit(my_isabi, {"app/sw.js": _sw("v19.6.349")}, "force collide 349", git_env)
        rc11, out11 = _expect_ok(dc.check_shell_version_claims, my_isabi, allow_claimed_version=True, env=git_env)
        check(rc11 == 0 and "--allow-claimed-version" in out11, "case11-allow-claimed-version-override")

        # Case 12: dc.main([]) and dc.main(["--pages-only"]) abort BEFORE require_release_lock when unbumped/claimed
        def _forbid(name: str):
            def _boom(*_a, **_kw):
                raise AssertionError(f"forbidden call before version-claim guard: {name}")
            return _boom

        orig_root = dc.ISABI_ROOT
        orig_lock = rl.require_release_lock
        orig_behind = dc.check_checkout_not_behind_origin
        orig_ensure = dc.ensure_logged_in
        try:
            dc.ISABI_ROOT = my_isabi
            rl.require_release_lock = _forbid("rl.require_release_lock")
            dc.check_checkout_not_behind_origin = _forbid("dc.check_checkout_not_behind_origin")
            dc.ensure_logged_in = _forbid("dc.ensure_logged_in")
            for margs, mlabel in (([], "full"), (["--pages-only"], "pages-only")):
                rc12, err12 = _expect_exit2(dc.main, margs)
                check(rc12 == 2 and "older than origin/main" in err12, f"case12-dc-main-aborts-before-lock-{mlabel}", err12)
        finally:
            dc.ISABI_ROOT = orig_root
            rl.require_release_lock = orig_lock
            dc.check_checkout_not_behind_origin = orig_behind
            dc.ensure_logged_in = orig_ensure

    passed = sum(1 for ok, _ in RESULTS if ok)
    total = len(RESULTS)
    failed = [name for ok, name in RESULTS if not ok]
    if failed:
        print(f"FAIL: verify_version_claims ({passed}/{total}): {', '.join(failed)}", file=sys.stderr)
        return 1
    print(f"PASS: verify_version_claims ({passed}/{total} checks)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
