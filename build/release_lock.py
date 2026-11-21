"""One release at a time: a lock in the isabi repo on GitHub that says who is deploying (owner 2026-11-13).

Why
---
Parallel sessions each deploy the site from their own worktree. When session A deploys before pushing its commit to
main, session B (which fetched main before A pushed) deploys a site without A's work and live goes backwards. On
2026-11-13 four sessions claimed v19.6.311 to 314 within an hour and live came off both mains twice.

How it works
------------
The lock is the ref `refs/locks/release` on `origin` (HusseinBdeir/isabi). Its commit holds one file, LOCK.json
(holder, PC, worktree, version, when it expires, which commits were deployed under it). Taking the lock is a push that
must create the ref; GitHub refuses it when the ref exists (the update carries the old value, so two sessions racing
cannot both win). Renewing and releasing are pushes with --force-with-lease on the value this session saw, so a
session can only change a lock it holds. Nothing in the working tree or the index is touched.

The release order it enforces (deploy_cloudflare.py and release_data_only.py call `require_release_lock` at the
start and `claim_deploy_or_exit` right before each live upload):
  1. take the lock (the deploy script takes it by itself when it is free);
  2. fetch and rebase onto origin/main of both repos (the deploy scripts refuse a HEAD behind origin/main);
  3. deploy: just before going live the script proves it still holds the lock, checks the commit contains the
     current origin/main, and writes it into the lock as the live deploy;
  4. git push origin main (isabi-app, then isabi);
  5. python build/release_lock.py release   (refused while the live deploy is not on origin/main).

Only the latest deploy under a lock counts (a redeploy after a rebase supersedes the earlier one). A lock expires
after its TTL (60 minutes by default; each deploy renews it) and is taken over only 10 minutes after that (clock skew
between PCs), and only when its latest deploy is already on origin/main; otherwise `acquire --takeover` is needed,
after checking what that session left unpushed. A lock that exists but cannot be read is never treated as free.

The push-to-main workflow (.github/workflows/deploy.yml) is one more holder: `ci-acquire` waits up to 10 minutes for
a session's release, takes the lock, records the pushed commit; the workflow renews it right before going live and
releases it at the end. It does not deploy when the lock stays held, and fails when an expired lock's live deploy is
not part of the pushed commit (deploying would roll that work back).

Commands
  python build/release_lock.py status [--json]          who holds it, and whether live and both mains match
  python build/release_lock.py acquire --holder "<session>" [--version v19.6.N] [--ttl 60] [--takeover]
  python build/release_lock.py renew [--ttl 60]
  python build/release_lock.py release [--force]
  python build/release_lock.py prune [--days 7] [--dry] [--json] [--include-abandoned]
  python build/release_lock.py stalled [--hours 24] [--json]
  python build/release_lock.py ci-acquire --sha <commit>   (the workflow; writes deploy=true|false to GITHUB_OUTPUT)
Bypass (only when the owner says so): ISABI_RELEASE_LOCK=off, or deploy_cloudflare.py --no-release-lock.
Test: python build/verify_release_lock.py

Batched releases (owner 2026-11-13): build/release_batch.py keeps a waiting line in front of this lock. A change that
finishes while a release is running joins the line, and whoever takes the lock next ships everything in the line as one
version (`release_batch.py ship`). The lock itself is unchanged: a batch leader is a holder like any other.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import socket
import subprocess
import sys
import urllib.request
import uuid
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ISABI_ROOT = Path(__file__).resolve().parent.parent
LOCK_REF = "refs/locks/release"
SEEN_REF = "refs/isabi-release-lock/seen"  # local copy of the remote lock commit (so its LOCK.json can be read)
QUEUE_NS = "refs/release-queue"
QUEUE_SEEN_NS = "refs/isabi-release-lock-queue"
DEFAULT_PRUNE_DAYS = 7
DEFAULT_STALLED_HOURS = 24
STALLED_QUEUE_HEARTBEAT_MIN = 180
_PURE_GENERATED_PATHS = ("js/i18n.js", "js/seed_manifest.js", "functions/_lib/deployed_shell.js")
REMOTE = os.environ.get("ISABI_RELEASE_LOCK_REMOTE", "origin")
TOKEN_FILE = "isabi-release-lock.json"  # in this worktree's own git dir: one holder per worktree
DEFAULT_TTL_MIN = 60
TAKEOVER_GRACE_MIN = 10  # an expired lock is taken over only this long after its expiry (clock skew between PCs)
LIVE_BASE = "https://isabisystems.com"
# Files compared between live, isabi origin/main and isabi-app origin/main (isabi path, isabi-app path, live path).
COMPARE_FILES = (
    ("app/sw.js", "sw.js", "/app/sw.js"),
    ("app/index.html", "index.html", "/app/index.html"),
    ("app/js/app.js", "js/app.js", None),
)


class LockError(Exception):
    """The lock is not ours to use, or could not be read; the message says what to do."""


# ------------------------------------------------------------------------------------------------------ git plumbing

def _git(args: list[str], cwd: Path, *, input_text: str | None = None, check: bool = True, timeout: int = 60):
    env = dict(os.environ)
    env.setdefault("GIT_TERMINAL_PROMPT", "0")
    for k, v in (("GIT_AUTHOR_NAME", "ISABI release lock"), ("GIT_AUTHOR_EMAIL", "release-lock@isabi.invalid")):
        env.setdefault(k, v)
        env.setdefault(k.replace("AUTHOR", "COMMITTER"), v)
    # stdin goes as bytes: in text mode Windows would turn "\n" into "\r\n" (a tree entry named "LOCK.json\r").
    try:
        rb = subprocess.run(["git", *args], cwd=str(cwd), input=(input_text or "").encode("utf-8"), capture_output=True,
                            timeout=timeout, env=env)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise LockError(f"git {' '.join(args[:3])} did not finish ({type(exc).__name__})") from None
    r = subprocess.CompletedProcess(rb.args, rb.returncode, rb.stdout.decode("utf-8", errors="replace"),
                                    rb.stderr.decode("utf-8", errors="replace"))
    if check and r.returncode != 0:
        raise LockError(f"git {' '.join(args[:3])} failed: {(r.stderr or r.stdout).strip()[:400]}")
    return r


def _now() -> dt.datetime:
    fixed = os.environ.get("ISABI_RELEASE_LOCK_NOW", "").strip()  # tests only
    if fixed:
        return dt.datetime.fromisoformat(fixed.replace("Z", "+00:00"))
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0)


def _iso(t: dt.datetime) -> str:
    return t.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_iso(s: str) -> dt.datetime | None:
    try:
        return dt.datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


_GIT_DIRS: dict[str, Path] = {}


def git_dir(cwd: Path = ISABI_ROOT) -> Path:
    key = str(Path(cwd).resolve())
    if key not in _GIT_DIRS:
        _GIT_DIRS[key] = Path(_git(["rev-parse", "--absolute-git-dir"], cwd).stdout.strip())
    return _GIT_DIRS[key]


def _current_branch(cwd: Path) -> str:
    r = _git(["symbolic-ref", "--quiet", "--short", "HEAD"], cwd, check=False, timeout=15)
    return r.stdout.strip() if r.returncode == 0 else ""


def read_remote_lock(cwd: Path = ISABI_ROOT) -> tuple[str, dict]:
    """(sha, LOCK.json) of the lock on the remote, or ("", {}) when nobody holds it."""
    r = _git(["fetch", "--no-tags", "--quiet", REMOTE, f"+{LOCK_REF}:{SEEN_REF}"], cwd, check=False, timeout=90)
    if r.returncode != 0:
        err = (r.stderr or r.stdout or "").lower()
        if "couldn't find remote ref" in err or "could not find remote ref" in err:
            _git(["update-ref", "-d", SEEN_REF], cwd, check=False)
            return "", {}
        raise LockError(f"cannot read the release lock from {REMOTE} ({(r.stderr or r.stdout).strip()[:300]}); "
                        "refusing to deploy without knowing who holds it")
    sha = _git(["rev-parse", SEEN_REF], cwd).stdout.strip()
    # Fail closed: a lock that exists but cannot be read is never treated as free.
    raw = _git(["cat-file", "blob", f"{sha}:LOCK.json"], cwd, check=False, timeout=90)
    try:
        info = json.loads(raw.stdout) if raw.returncode == 0 else None
    except ValueError:
        info = None
    if not isinstance(info, dict) or not info.get("lockId") or not info.get("expiresAt"):
        raise LockError(f"the release lock {sha[:7]} on {REMOTE} cannot be read ({(raw.stderr or 'bad LOCK.json').strip()[:200]}); "
                        "refusing to treat it as free. Check it with `git fetch origin refs/locks/release` and "
                        "`git show FETCH_HEAD:LOCK.json`; delete it only if it is broken: git push origin :refs/locks/release")
    return sha, info


def _make_lock_commit(info: dict, cwd: Path, parent: str = "") -> str:
    body = json.dumps(info, ensure_ascii=False, indent=1, sort_keys=True) + "\n"
    blob = _git(["hash-object", "-w", "--stdin"], cwd, input_text=body).stdout.strip()
    tree = _git(["mktree"], cwd, input_text=f"100644 blob {blob}\tLOCK.json\n").stdout.strip()
    args = ["commit-tree", tree, "-m", f"release lock: {info.get('holder', '?')} ({info.get('version') or 'no version'})"]
    if parent:
        args += ["-p", parent]
    return _git(args, cwd).stdout.strip()


def _push_lock(new_sha: str, expected_old: str, cwd: Path) -> bool:
    """Compare-and-swap on the remote ref. expected_old "" = the ref must not exist. new_sha "" = delete.

    Creating is a plain push (no force): a lock commit is an orphan, so it is never a fast-forward of an existing lock,
    and the server refuses the update when the ref exists (the update names the old value it expects). An empty
    --force-with-lease value is NOT used for this: it let a second session overwrite a held lock in the gate.
    Replacing and deleting use --force-with-lease with the exact sha this session read. The refspec carries NO "+":
    with "+" git forces the update and ignores a lease that does not match (a stale renew or takeover overwrote the
    other session's lock; fixed 2026-11-13). A matching lease by itself allows the non-fast-forward update."""
    if not expected_old and not new_sha:
        return False
    if not expected_old:
        args = ["push", "--porcelain", "--no-verify", REMOTE, f"{new_sha}:{LOCK_REF}"]
    else:
        spec = f"{new_sha}:{LOCK_REF}" if new_sha else f":{LOCK_REF}"
        args = ["push", "--porcelain", "--no-verify", f"--force-with-lease={LOCK_REF}:{expected_old}", REMOTE, spec]
    r = _git(args, cwd, check=False, timeout=90)
    return r.returncode == 0


def _contains(cwd: Path, sha: str, ref: str) -> bool:
    if not sha:
        return True
    r = _git(["merge-base", "--is-ancestor", sha, ref], cwd, check=False)
    return r.returncode == 0


def _fetch_main(cwd: Path) -> None:
    _git(["fetch", "--no-tags", "--quiet", REMOTE, "main"], cwd, timeout=120)


# ------------------------------------------------------------------------------------------------------ the token

def _token_path(cwd: Path) -> Path:
    return git_dir(cwd) / TOKEN_FILE


def read_token(cwd: Path = ISABI_ROOT) -> dict:
    p = _token_path(cwd)
    try:
        tok = json.loads(p.read_text(encoding="utf-8"))
        return tok if isinstance(tok, dict) else {}
    except (OSError, ValueError):
        return {}


def _write_token(cwd: Path, info: dict, sha: str) -> None:
    _token_path(cwd).write_text(json.dumps({"lockId": info["lockId"], "sha": sha, "holder": info.get("holder")}, indent=1) + "\n",
                                encoding="utf-8")


def _drop_token(cwd: Path) -> None:
    try:
        _token_path(cwd).unlink()
    except OSError:
        pass


# ------------------------------------------------------------------------------------------------------ lock logic

def is_expired(info: dict, grace_min: float = 0) -> bool:
    exp = _parse_iso(info.get("expiresAt", ""))
    return exp is None or exp + dt.timedelta(minutes=grace_min) <= _now()


def minutes_left(info: dict) -> float:
    exp = _parse_iso(info.get("expiresAt", ""))
    return 0.0 if exp is None else (exp - _now()).total_seconds() / 60


def held_by_me(info: dict, cwd: Path = ISABI_ROOT) -> bool:
    tok = read_token(cwd)
    return bool(info.get("lockId")) and tok.get("lockId") == info.get("lockId")


def last_deploy(info: dict) -> dict | None:
    """What is live under this lock: the latest deploy (a redeploy after a rebase supersedes the earlier ones)."""
    deps = [d for d in info.get("deployed") or [] if isinstance(d, dict) and d.get("sha")]
    return deps[-1] if deps else None


def _in(cwd: Path, sha: str, ref: str) -> bool:
    if _git(["cat-file", "-e", f"{sha}^{{commit}}"], cwd, check=False).returncode != 0:
        return False  # not even known here: certainly not part of ref
    return _contains(cwd, sha, ref)


def unpushed_deploys(info: dict, cwd: Path) -> list[dict]:
    """[the latest deploy] when its commit is not on origin/main (fetches main), else []."""
    last = last_deploy(info)
    if not last:
        return []
    _fetch_main(cwd)
    return [] if _in(cwd, last["sha"], f"{REMOTE}/main") else [last]


def _same_lock(now_sha: str, seen_sha: str) -> bool:
    return (now_sha or "") == (seen_sha or "")


def ci_acquire(cwd: Path, sha: str, *, wait_s: int = 600, poll_s: int = 20, holder: str = "") -> tuple[bool, bool, str]:
    """For the push-to-main workflow: take the lock like any session, waiting up to wait_s for a session to finish
    (a session releases right after pushing main, so this is usually a minute or two), then record `sha` as the
    deploy. Returns (deploy?, fail the run?, message). The workflow then renews the lock just before going live and
    releases it at the end, so a session and the workflow can never deploy at the same time."""
    import time  # noqa: PLC0415

    deadline = time.monotonic() + max(0, wait_s)
    while True:
        lsha, info = read_remote_lock(cwd)
        if not lsha or is_expired(info, TAKEOVER_GRACE_MIN):
            last = last_deploy(info) if lsha else None
            if last and not (last["sha"] == sha or _in(cwd, last["sha"], sha)):
                return False, True, (f"release lock {describe(info)}: it expired with its latest deploy {last['sha'][:7]} "
                                     f"live and not part of {sha[:7]}; deploying would roll that work back. Get that work "
                                     "onto main (or take the lock over by hand), then re-run this workflow.")
            try:
                acquire(cwd, holder=holder or f"GitHub Actions {sha[:7]}", purpose="push-to-main deploy",
                        version=_worktree_shell_version(cwd), ttl_min=30, takeover=True, quiet=True)
                got = True
            except LockError as exc:
                got, last_msg = False, str(exc)
                # A lost race leaves the lock changed. Unchanged (or still free) means this run cannot write the
                # lock at all (token, permissions, network): fail loudly instead of never deploying again.
                if _same_lock(read_remote_lock(cwd)[0], lsha):
                    return False, True, f"cannot take the release lock (the push of {LOCK_REF} failed): {exc}"
            if got:
                try:
                    claim_deploy(cwd, sha, "push-to-main deploy")
                    return True, False, f"release lock taken for {sha[:7]}"
                except LockError as exc:
                    try:
                        release(cwd, force=True, quiet=True)
                    except LockError:
                        pass
                    newer = "does not contain origin/main" in str(exc)
                    return False, not newer, (f"not deployed: {exc}" + (" (a newer push has its own run)" if newer else ""))
        else:
            last = last_deploy(info)
            if last and last["sha"] == sha:
                return False, False, f"release lock {describe(info)}: that session already deployed {sha[:7]}; nothing to do here"
            last_msg = f"release lock {describe(info)}"
        if time.monotonic() >= deadline:
            return False, False, (f"{last_msg}. Not deployed after waiting {wait_s // 60} min: that release is still "
                                  "running. Its holder deploys a commit that contains main (the deploy scripts refuse "
                                  "one behind main), or re-run this workflow once it is released.")
        print(f"waiting for the release lock: {last_msg}", flush=True)
        time.sleep(poll_s)


def describe(info: dict) -> str:
    if not info:
        return "free"
    left = minutes_left(info)
    when = f"expires in {left:.0f} min" if left > 0 else f"EXPIRED {-left:.0f} min ago"
    deps = info.get("deployed") or []
    dep = f"; deployed {', '.join(str(d.get('sha', ''))[:7] + ' ' + str(d.get('what', '')) for d in deps)}" if deps else ""
    return (f"held by {info.get('holder', '?')} on {info.get('pc', '?')} ({info.get('version') or 'no version'}; "
            f"{info.get('purpose') or 'release'}; since {info.get('acquiredAt', '?')}; {when}){dep}")


def default_holder(cwd: Path) -> str:
    env = os.environ.get("ISABI_RELEASE_HOLDER", "").strip()
    return env or f"{socket.gethostname()}:{cwd}"


def acquire(cwd: Path = ISABI_ROOT, *, holder: str = "", version: str = "", purpose: str = "release",
            ttl_min: int = DEFAULT_TTL_MIN, takeover: bool = False, quiet: bool = False) -> dict:
    sha, info = read_remote_lock(cwd)
    if info and held_by_me(info, cwd):
        return renew(cwd, ttl_min=ttl_min, quiet=quiet, _seen=(sha, info))
    if sha:
        # A grace period after expiry: another PC's clock may run ahead of the holder's.
        if not is_expired(info, TAKEOVER_GRACE_MIN):
            raise LockError(f"RELEASE LOCK: {describe(info)}.\nWait for that release to finish (its session pushes main, then "
                            "runs `python build/release_lock.py release`), or ask the owner. Do not deploy around it.")
        left_behind = unpushed_deploys(info, cwd)
        if left_behind and not takeover:
            lst = ", ".join(f"{d['sha'][:7]} ({d.get('what', '')})" for d in left_behind)
            raise LockError(f"RELEASE LOCK: {describe(info)}.\nIt expired, but it deployed {lst}, which is not on origin/main: "
                            "taking over now could roll that work back. Find that work (the holder's worktree or branch), "
                            "get it onto main, then run `python build/release_lock.py acquire --takeover --holder ...`.")
    now = _now()
    app_repo = _prune_app_repo(cwd)
    new = {
        "lockId": uuid.uuid4().hex,
        "holder": holder or default_holder(cwd),
        "pc": socket.gethostname(),
        "branch": _current_branch(cwd),
        "worktree": str(cwd),
        "version": version,
        "purpose": purpose,
        "acquiredAt": _iso(now),
        "expiresAt": _iso(now + dt.timedelta(minutes=ttl_min)),
        "deployed": [],
    }
    if app_repo is not None:
        app_b = _current_branch(app_repo)
        if app_b:
            new["appBranch"] = app_b
    if sha:
        new["tookOverFrom"] = {k: info.get(k) for k in ("holder", "pc", "acquiredAt", "expiresAt", "deployed")}
    commit = _make_lock_commit(new, cwd)
    if not _push_lock(commit, sha, cwd):
        sha2, info2 = read_remote_lock(cwd)
        raise LockError(f"RELEASE LOCK: another session took it first: {describe(info2) if sha2 else 'it changed while taking it'}.")
    _write_token(cwd, new, commit)
    if not quiet:
        print(f"Release lock taken: {describe(new)}")
    return new


def renew(cwd: Path = ISABI_ROOT, *, ttl_min: int = DEFAULT_TTL_MIN, quiet: bool = False, deployed: dict | None = None,
          extra: dict | None = None, _seen: tuple[str, dict] | None = None) -> dict:
    """`extra` adds descriptive fields to the lock (release_batch.py: the batch's version, purpose and entries); it
    can never change who holds the lock, when it expires or what was deployed under it."""
    sha, info = _seen or read_remote_lock(cwd)
    if not sha or not held_by_me(info, cwd):
        raise LockError(f"RELEASE LOCK: this worktree does not hold it ({describe(info) if sha else 'nobody holds it'}).")
    new = dict(info)
    new.update({k: v for k, v in (extra or {}).items() if k not in ("lockId", "holder", "pc", "acquiredAt", "expiresAt", "deployed")})
    new["expiresAt"] = _iso(_now() + dt.timedelta(minutes=ttl_min))
    if deployed:
        new["deployed"] = [*(info.get("deployed") or []), deployed]
    commit = _make_lock_commit(new, cwd, parent=sha)
    if not _push_lock(commit, sha, cwd):
        raise LockError("RELEASE LOCK: it changed on the remote while renewing it (taken over?); stop and run status.")
    _write_token(cwd, new, commit)
    if not quiet:
        print(f"Release lock renewed: {describe(new)}")
    return new


def release(cwd: Path = ISABI_ROOT, *, force: bool = False, quiet: bool = False) -> bool:
    sha, info = read_remote_lock(cwd)
    if not sha:
        _drop_token(cwd)
        if not quiet:
            print("Release lock: nobody holds it.")
        return True
    if not held_by_me(info, cwd):
        raise LockError(f"RELEASE LOCK: this worktree does not hold it ({describe(info)}); not releasing someone else's lock.")
    left = unpushed_deploys(info, cwd)
    if left and not force:
        lst = ", ".join(f"{d['sha'][:7]} ({d.get('what', '')})" for d in left)
        raise LockError(f"RELEASE LOCK: still held: the live deploy {lst} is not on origin/main. Push it to main "
                        "(git push origin HEAD:main), then release. If the push was refused and you rebased, the rebased "
                        "commit is not what is live: deploy the rebased HEAD again (it is recorded here), push, then "
                        "release. --force only if that deploy was rolled back on purpose.")
    if not _push_lock("", sha, cwd):
        raise LockError("RELEASE LOCK: it changed on the remote while releasing it; run status.")
    _drop_token(cwd)
    if not quiet:
        print("Release lock released.")
        last = last_deploy(info)
        main_sha = _git(["rev-parse", f"{REMOTE}/main"], cwd, check=False).stdout.strip()
        if last and main_sha and main_sha != last["sha"]:
            print(f"NOTE: live is {last['sha'][:7]} but origin/main is {main_sha[:7]}. If the push-to-main run for "
                  f"{main_sha[:7]} gave up waiting for this lock, re-run it (GitHub, Actions, Deploy to Cloudflare Pages, "
                  "Run workflow on main) or deploy origin/main.")
    return True


def require_release_lock(cwd: Path = ISABI_ROOT, *, purpose: str, bypass: bool = False) -> dict | None:
    """For deploy scripts: hold the lock (taking it when free, renewing it when held here) or stop."""
    if bypass or os.environ.get("ISABI_RELEASE_LOCK", "").strip().lower() in ("off", "0", "no"):
        print("WARN: release lock bypassed (--no-release-lock / ISABI_RELEASE_LOCK=off): another session's live work can be rolled back.")
        return None
    try:
        sha, info = read_remote_lock(cwd)
        if sha and held_by_me(info, cwd):
            return renew(cwd, ttl_min=DEFAULT_TTL_MIN, quiet=False, _seen=(sha, info))
        return acquire(cwd, purpose=purpose, version=_worktree_shell_version(cwd))
    except LockError as exc:
        print(f"ERROR: {exc}", file=sys.stderr, flush=True)
        raise SystemExit(2) from None


def claim_deploy(cwd: Path, sha: str, what: str, *, allow_behind: bool = False) -> dict:
    """Call right BEFORE a live upload. Proves this worktree still holds the lock (raises if it was lost or taken
    over), checks that `sha` contains the current origin/main (so nothing pushed since the lock was taken is rolled
    back), and writes `sha` into the lock as its latest deploy, so the lock cannot be released or taken over, and the
    push-to-main workflow will not deploy over it, until that commit is on main."""
    rsha, info = read_remote_lock(cwd)
    if not rsha or not held_by_me(info, cwd):
        raise LockError(f"RELEASE LOCK: this worktree no longer holds it ({describe(info) if rsha else 'nobody holds it'}); "
                        "not going live. Run the deploy again (it takes the lock when free).")
    if not allow_behind:
        _fetch_main(cwd)
        if not _in(cwd, f"{REMOTE}/main", sha):
            raise LockError(f"RELEASE LOCK: {sha[:7]} does not contain origin/main "
                            f"({_git(['rev-parse', '--short', f'{REMOTE}/main'], cwd).stdout.strip()}): something reached main "
                            "since this release started. Not going live; rebase onto origin/main and deploy again.")
    new = renew(cwd, quiet=True, deployed={"sha": sha, "what": what, "at": _iso(_now())}, _seen=(rsha, info))
    print(f"Release lock: {sha[:7]} recorded as the live deploy ({what}). After it: push main (isabi-app, then isabi), "
          "then `python build/release_lock.py release`.", flush=True)
    return new


def claim_deploy_or_exit(cwd: Path, sha: str, what: str, *, bypass: bool = False, allow_behind: bool = False) -> None:
    """claim_deploy for the deploy scripts: prints the reason and exits 2 instead of going live."""
    if bypass or os.environ.get("ISABI_RELEASE_LOCK", "").strip().lower() in ("off", "0", "no"):
        return
    try:
        claim_deploy(cwd, sha, what, allow_behind=allow_behind)
    except LockError as exc:
        print(f"ERROR: {exc}", file=sys.stderr, flush=True)
        raise SystemExit(2) from None


def _worktree_shell_version(cwd: Path) -> str:
    try:
        m = re.search(r"isabi-mfg-v([0-9][0-9.]*)", (cwd / "app" / "sw.js").read_text(encoding="utf-8", errors="replace")[:400])
        return f"v{m.group(1)}" if m else ""
    except OSError:
        return ""


# ------------------------------------------------------------------------------------------------------ status

def _git_bytes(cwd: Path, rev_path: str) -> bytes:
    r = subprocess.run(["git", "cat-file", "blob", rev_path], cwd=str(cwd), capture_output=True, timeout=60)
    return r.stdout if r.returncode == 0 else b""


_CF_BEACON_RE = re.compile(rb"\s*<script[^>]*static\.cloudflareinsights\.com[^>]*>\s*</script>")


def _served_id(path: str, data: bytes) -> str:
    """Identity of a file as a browser gets it: Cloudflare adds its Web Analytics beacon to HTML (and drops the last
    newline), so HTML is compared without the beacon, a BOM or trailing whitespace. Other files byte for byte."""
    if path.endswith(".html"):
        data = _CF_BEACON_RE.sub(b"", data.removeprefix(b"\xef\xbb\xbf")).rstrip()
    return hashlib.sha1(data).hexdigest()


def _tree_blob(cwd: Path, ref: str, path: str) -> str:
    r = _git(["ls-tree", ref, "--", path], cwd, check=False)
    parts = r.stdout.split()
    return parts[2] if len(parts) >= 3 else ""


def _shell_in(cwd: Path, ref: str, path: str) -> str:
    r = _git(["cat-file", "blob", f"{ref}:{path}"], cwd, check=False)
    m = re.search(r"isabi-mfg-v([0-9][0-9.]*)", r.stdout[:400])
    return m.group(1) if m else "?"


def _live_bytes(path: str) -> bytes | None:
    try:
        req = urllib.request.Request(f"{LIVE_BASE}{path}?release-lock={int(_now().timestamp())}",
                                     headers={"User-Agent": "ISABI-ReleaseLock/1.0", "Cache-Control": "no-cache"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.read()
    except Exception:
        return None


def mains_and_live(cwd: Path = ISABI_ROOT) -> dict:
    """Shell versions and file identity of live, isabi origin/main and isabi-app origin/main."""
    app_repo = cwd.parent / "isabi-app"
    if not (app_repo / ".git").exists():
        app_repo = Path.home() / "bhfirms" / "isabi-app"
    _fetch_main(cwd)
    have_app = (app_repo / ".git").exists()
    if have_app:
        _git(["fetch", "--no-tags", "--quiet", REMOTE, "main"], app_repo, check=False, timeout=120)
    out: dict = {
        "isabi_main": _git(["rev-parse", "--short", f"{REMOTE}/main"], cwd).stdout.strip(),
        "isabi_main_shell": _shell_in(cwd, f"{REMOTE}/main", "app/sw.js"),
        "isabi_app_main": _git(["rev-parse", "--short", f"{REMOTE}/main"], app_repo, check=False).stdout.strip() if have_app else "",
        "isabi_app_main_shell": _shell_in(app_repo, f"{REMOTE}/main", "sw.js") if have_app else "?",
        "files": [],
    }
    live_sw = _live_bytes("/app/sw.js")
    m = re.search(rb"isabi-mfg-v([0-9][0-9.]*)", live_sw or b"")
    out["live_shell"] = m.group(1).decode() if m else "?"
    for ip, ap, lp in COMPARE_FILES:
        row = {"file": ip, "isabi_main": _tree_blob(cwd, f"{REMOTE}/main", ip)}
        if have_app:
            row["isabi_app_main"] = _tree_blob(app_repo, f"{REMOTE}/main", ap)
        if lp:
            data = live_sw if lp == "/app/sw.js" else _live_bytes(lp)
            row["live"] = _served_id(ip, data) if data is not None else ""
            row["live_vs_main"] = bool(data is not None and row["live"] == _served_id(ip, _git_bytes(cwd, f"{REMOTE}/main:{ip}")))
        out["files"].append(row)
    mains_match = all(not have_app or r["isabi_main"] == r.get("isabi_app_main") for r in out["files"])
    live_match = all(("live" not in r) or r["live_vs_main"] for r in out["files"])
    out["mains_match"] = mains_match
    out["live_matches_isabi_main"] = live_match
    return out


def cmd_status(cwd: Path, as_json: bool) -> int:
    sha, info = read_remote_lock(cwd)
    mine = bool(sha) and held_by_me(info, cwd)
    try:
        ml = mains_and_live(cwd)
    except LockError as exc:
        ml = {"error": str(exc)}
    if as_json:
        print(json.dumps({"lock": info if sha else None, "lock_sha": sha, "held_here": mine, **ml}, indent=1))
        return 0
    print(f"Release lock: {describe(info) if sha else 'free'}{' (this worktree)' if mine else ''}")
    if "error" in ml:
        print(f"Live vs mains: not checked ({ml['error']})")
        return 0
    print(f"Live shell v{ml['live_shell']} | isabi main {ml['isabi_main']} v{ml['isabi_main_shell']} | "
          f"isabi-app main {ml['isabi_app_main'] or '-'} v{ml['isabi_app_main_shell']}")
    for r in ml["files"]:
        bits = [f"isabi {r['isabi_main'][:7] or '-'}"]
        if "isabi_app_main" in r:
            bits.append(f"isabi-app {r['isabi_app_main'][:7] or '-'}")
        if "live" in r:
            bits.append("live = isabi main" if r["live_vs_main"] else ("live DIFFERS" if r["live"] else "live unreadable"))
        print(f"  {r['file']}: " + ", ".join(bits))
    print("Both mains carry the same shell." if ml["mains_match"] else
          "MISMATCH: isabi main does not carry isabi-app main's shell (sync_app.py + commit + push pending, or a rollback).")
    print("Live serves isabi main." if ml["live_matches_isabi_main"] else
          "MISMATCH: live is not isabi main (a deploy not pushed to main, a rollback, or a deploy in progress).")
    return 0


# ------------------------------------------------------------------------------------------------------ prune wt/*

def _prune_app_repo(cwd: Path) -> Path | None:
    """Resolve sibling `isabi-app` checkout without falling back across unrelated temp directories."""
    for name in ("isabi-app", "mfg-web"):
        cand = cwd.parent / name
        if (cand / ".git").exists():
            return cand
    home_isabi = (Path.home() / "bhfirms" / "isabi").resolve()
    home_app = Path.home() / "bhfirms" / "isabi-app"
    if cwd.resolve() == home_isabi and (home_app / ".git").exists():
        return home_app
    return None


def _protected_worktree_branches(repo: Path) -> set[str]:
    """Protect `wt/*` branches currently checked out with dirty edits or ahead/unpushed commits."""
    protected: set[str] = set()
    r = _git(["worktree", "list", "--porcelain"], repo, check=False, timeout=30)
    if r.returncode != 0:
        return protected
    cur_path = None
    cur_branch = ""
    blocks: list[tuple[Path, str]] = []
    for ln in r.stdout.splitlines():
        if not ln.strip():
            if cur_path is not None and cur_branch:
                blocks.append((cur_path, cur_branch))
            cur_path, cur_branch = None, ""
        elif ln.startswith("worktree "):
            cur_path = Path(ln[9:].strip())
        elif ln.startswith("branch "):
            cur_branch = ln[7:].strip()
    if cur_path is not None and cur_branch:
        blocks.append((cur_path, cur_branch))

    for wt_path, full_ref in blocks:
        if not full_ref.startswith("refs/heads/wt/") or not wt_path.exists():
            continue
        short_b = full_ref[len("refs/heads/"):]
        st = _git(["status", "--porcelain", "--untracked-files=no"], wt_path, check=False, timeout=30)
        if st.returncode != 0 or st.stdout.strip():
            protected.add(short_b)
            continue
        h_sha = _git(["rev-parse", "-q", "--verify", "HEAD"], wt_path, check=False).stdout.strip()
        r_sha = _git(["rev-parse", "-q", "--verify", f"refs/remotes/{REMOTE}/{short_b}"], repo, check=False).stdout.strip()
        if h_sha and r_sha and h_sha != r_sha:
            protected.add(short_b)
    return protected


def _read_queue_details(
    cwd: Path, locked_batch_ids: set[str] | None = None
) -> tuple[set[tuple[str, str]], set[tuple[str, str, str]], set[tuple[str, str]], set[tuple[str, str]]]:
    """Read `refs/release-queue/*` directly via git without importing `release_batch.py`.
    Returns (protected, shipped, fresh_heartbeat, batch_locked)."""
    protected: set[tuple[str, str]] = set()
    shipped: set[tuple[str, str, str]] = set()
    fresh_heartbeat: set[tuple[str, str]] = set()
    batch_locked: set[tuple[str, str]] = set()
    batch_ids = set(locked_batch_ids or ())
    now_dt = _now()
    r = _git(["fetch", "--no-tags", "--quiet", "--prune", REMOTE, f"+{QUEUE_NS}/*:{QUEUE_SEEN_NS}/*"],
             cwd, check=False, timeout=90)
    if r.returncode != 0:
        err = (r.stderr or r.stdout or "").lower()
        if "couldn't find remote ref" not in err and "could not find remote ref" not in err:
            raise LockError(f"cannot inspect release queue before pruning ({(r.stderr or r.stdout).strip()[:240]})")
        return protected, shipped, fresh_heartbeat, batch_locked
    refs = _git(["for-each-ref", "--format=%(refname) %(objectname)", f"{QUEUE_SEEN_NS}/"], cwd, check=False).stdout
    try:
        for ln in refs.splitlines():
            parts = ln.strip().split(maxsplit=1)
            if len(parts) != 2:
                continue
            sha = parts[1]
            raw = _git(["cat-file", "blob", f"{sha}:ENTRY.json"], cwd, check=False)
            if raw.returncode != 0:
                continue
            try:
                entry = json.loads(raw.stdout)
            except ValueError:
                continue
            if not isinstance(entry, dict):
                continue
            eid = str(entry.get("id") or "")
            state = entry.get("state")
            hb_dt = _parse_iso(str(entry.get("seenAt") or entry.get("queuedAt") or ""))
            is_fresh = hb_dt is not None and (now_dt - hb_dt).total_seconds() <= STALLED_QUEUE_HEARTBEAT_MIN * 60
            for kind, repo_label in (("app", "isabi-app"), ("site", "isabi")):
                part = entry.get(kind)
                if not isinstance(part, dict):
                    continue
                branch = str(part.get("branch") or "").removeprefix("origin/").removeprefix("refs/heads/")
                psha = str(part.get("sha") or "")
                if not branch:
                    continue
                if eid and eid in batch_ids:
                    batch_locked.add((repo_label, branch))
                if state in ("waiting", "left_out"):
                    protected.add((repo_label, branch))
                    if is_fresh:
                        fresh_heartbeat.add((repo_label, branch))
                elif state == "shipped" and psha:
                    shipped.add((repo_label, branch, psha))
    finally:
        for ln in refs.splitlines():
            ref = ln.strip().split(maxsplit=1)[0]
            if ref.startswith(QUEUE_SEEN_NS + "/"):
                _git(["update-ref", "-d", ref], cwd, check=False)
    return protected, shipped, fresh_heartbeat, batch_locked


def _read_queue_for_prune(cwd: Path) -> tuple[set[tuple[str, str]], set[tuple[str, str, str]]]:
    protected, shipped, _fresh, _bl = _read_queue_details(cwd)
    return protected, shipped


def _locked_branch_refs(
    lock_sha: str, lock_info: dict, batch_locked: set[tuple[str, str]] | None = None
) -> set[tuple[str, str]]:
    """Branches protected by a currently active (unexpired) release lock."""
    locked_refs: set[tuple[str, str]] = set()
    if not (lock_sha and lock_info and not is_expired(lock_info, 0)):
        return locked_refs
    if batch_locked:
        locked_refs.update(batch_locked)
    for item in lock_info.get("entries") or []:
        if isinstance(item, dict):
            for kind, rlbl in (("app", "isabi-app"), ("site", "isabi")):
                b = str((item.get(kind) or {}).get("branch") or "").removeprefix("origin/").removeprefix("refs/heads/")
                if b:
                    locked_refs.add((rlbl, b))
    lock_b = str(lock_info.get("branch") or "").removeprefix("origin/").removeprefix("refs/heads/")
    app_b = str(lock_info.get("appBranch") or "").removeprefix("origin/").removeprefix("refs/heads/")
    if lock_b:
        locked_refs.add(("isabi", lock_b))
    if app_b:
        locked_refs.add(("isabi-app", app_b))
    return {x for x in locked_refs if x[1]}


_SHELL_BUMP_SUBJECT_RE = re.compile(r"^\ufeff?v\d+\.\d+\.\d+:\s*shell version\b", re.IGNORECASE)


def _main_history_index(repo: Path, main_ref: str, limit: int = 600) -> tuple[str, set[str]]:
    """Recent main commit messages and normalized subjects (single fast git-log call)."""
    r = _git(["log", main_ref, "--format=%B%x00", "-n", str(limit)], repo, check=False, timeout=60)
    if r.returncode != 0 or not r.stdout:
        return "", set()
    main_subjects: set[str] = set()
    chunks = r.stdout.split("\x00")
    for ch in chunks:
        for ln in ch.splitlines():
            s = ln.lstrip("\ufeff").strip()
            if s:
                main_subjects.add(s)
                break
    return r.stdout.replace("\x00", "\n"), main_subjects


def _is_patch_equivalent(repo: Path, main_ref: str, sha: str) -> bool:
    """True when `git cherry <main> <sha>` reports zero unapplied commits (cleanly cherry-picked/rebased)."""
    r = _git(["cherry", main_ref, sha], repo, check=False, timeout=60)
    if r.returncode != 0:
        return False
    return not any(ln.startswith("+ ") for ln in r.stdout.splitlines() if ln.strip())


def _is_rebased_by_subjects(repo: Path, main_ref: str, sha: str, main_subjects: set[str]) -> bool:
    """True when every non-shell-bump commit subject on the branch already appears verbatim on main."""
    if not main_subjects:
        return False
    mb = _git(["merge-base", main_ref, sha], repo, check=False, timeout=30)
    base_sha = (mb.stdout or "").strip()
    if mb.returncode != 0 or not base_sha:
        return False
    lg = _git(["log", f"{base_sha}..{sha}", "--format=%s"], repo, check=False, timeout=30)
    if lg.returncode != 0:
        return False
    substantive = [
        ln.lstrip("\ufeff").strip()
        for ln in lg.stdout.splitlines()
        if ln.lstrip("\ufeff").strip() and not _SHELL_BUMP_SUBJECT_RE.match(ln.lstrip("\ufeff").strip())
    ]
    return bool(substantive) and all(s in main_subjects for s in substantive)


def _is_generated_only(repo: Path, main_ref: str, sha: str, *, repo_label: str = "") -> bool:
    """True when a branch's only unshipped diffs are generated build/sync files and all source files match main."""
    mb = _git(["merge-base", main_ref, sha], repo, check=False, timeout=30)
    base_sha = (mb.stdout or "").strip()
    if mb.returncode != 0 or not base_sha:
        return False
    ch = _git(["diff", "--name-only", base_sha, sha], repo, check=False, timeout=30)
    if ch.returncode != 0:
        return False
    changed = [ln.strip() for ln in ch.stdout.splitlines() if ln.strip()]
    if not changed:
        return True
    non_gen = [
        p for p in changed
        if p not in _PURE_GENERATED_PATHS
        and not (p.startswith("js/seed_demo_") and p.endswith(".json"))
        and not (repo_label == "isabi" and p.startswith("app/"))
    ]
    if not non_gen:
        return True
    dq = _git(["diff", "--quiet", main_ref, sha, "--", *non_gen], repo, check=False, timeout=30)
    return dq.returncode == 0


def _branch_shipped_reason(
    repo: Path,
    main_ref: str,
    branch: str,
    sha: str,
    *,
    repo_label: str,
    shipped_queue: set[tuple[str, str, str]],
    main_text: str,
    main_subjects: set[str] = frozenset(),
    check_stalled_heuristics: bool = False,
) -> str:
    """Return non-empty reason if `branch` (`sha`) has already landed on `main_ref`."""
    if _contains(repo, sha, main_ref):
        return "merged"
    if (repo_label, branch, sha) in shipped_queue:
        return "shipped_queue"
    if sha and f"{branch} {sha[:7]}" in main_text:
        return "batch_commit"
    if _is_patch_equivalent(repo, main_ref, sha):
        return "patch_equivalent"
    if check_stalled_heuristics:
        if re.search(rf"(?<![\w/-]){re.escape(branch)}(?![\w/-])", main_text):
            return "main_commit_trail"
        if _is_rebased_by_subjects(repo, main_ref, sha, main_subjects):
            return "rebased_on_main"
        if _is_generated_only(repo, main_ref, sha, repo_label=repo_label):
            return "generated_only"
    return ""


def _fetch_repo_main_and_wt(rdir: Path, repo_label: str) -> None:
    r_main = _git(["fetch", "--no-tags", "--quiet", REMOTE, "main"], rdir, check=False, timeout=120)
    if r_main.returncode != 0:
        raise LockError(f"cannot fetch main in {repo_label} ({(r_main.stderr or r_main.stdout).strip()[:240]})")
    r_wt = _git(["fetch", "--no-tags", "--quiet", "--prune", REMOTE, f"+refs/heads/wt/*:refs/remotes/{REMOTE}/wt/*"],
                rdir, check=False, timeout=120)
    if r_wt.returncode != 0:
        err = (r_wt.stderr or r_wt.stdout or "").lower()
        if "couldn't find remote ref" not in err and "could not find remote ref" not in err:
            raise LockError(f"cannot fetch wt/* in {repo_label} ({(r_wt.stderr or r_wt.stdout).strip()[:240]})")


def prune_stale_wt(
    cwd: Path = ISABI_ROOT,
    *,
    days: int = DEFAULT_PRUNE_DAYS,
    dry: bool = False,
    include_abandoned: bool = False,
) -> dict:
    """Safely prune merged, patch-equivalent, or batch-shipped `origin/wt/*` branches older than `days`."""
    lock_sha, lock_info = read_remote_lock(cwd)
    locked_batch_ids = (
        {str(x) for x in (lock_info.get("batch") or []) if x}
        if (lock_sha and lock_info and not is_expired(lock_info, 0))
        else set()
    )
    protected_queue, shipped_queue, _fresh_hb, batch_locked = _read_queue_details(cwd, locked_batch_ids)
    locked_refs = _locked_branch_refs(lock_sha, lock_info, batch_locked)

    repos: list[tuple[str, Path]] = [("isabi", cwd)]
    app_repo = _prune_app_repo(cwd)
    if app_repo is not None:
        repos.append(("isabi-app", app_repo))

    now_ts = _now().timestamp()
    cutoff_s = float(days) * 86400.0
    report: dict = {"days": days, "dry": dry, "include_abandoned": include_abandoned, "repos": []}

    for repo_label, rdir in repos:
        _fetch_repo_main_and_wt(rdir, repo_label)
        main_ref = f"refs/remotes/{REMOTE}/main"
        main_text, main_subjects = _main_history_index(rdir, main_ref)
        dirty_local = _protected_worktree_branches(rdir)
        out = _git(["for-each-ref", "--format=%(refname)|%(objectname)|%(committerdate:unix)",
                    f"refs/remotes/{REMOTE}/wt/"], rdir).stdout

        deleted: list[dict] = []
        would_delete: list[dict] = []
        kept_recent: list[str] = []
        kept_protected: list[str] = []
        kept_unmerged: list[str] = []

        for ln in out.splitlines():
            if not ln.strip():
                continue
            parts = ln.split("|")
            if len(parts) != 3:
                continue
            refname, sha, ts_str = parts
            branch = refname[len(f"refs/remotes/{REMOTE}/"):]
            try:
                age_days = max(0.0, (now_ts - int(ts_str)) / 86400.0)
            except ValueError:
                kept_recent.append(branch)
                continue
            if (now_ts - int(ts_str)) < cutoff_s:
                kept_recent.append(branch)
                continue
            if (branch in dirty_local
                    or (repo_label, branch) in protected_queue
                    or (repo_label, branch) in locked_refs):
                kept_protected.append(branch)
                continue

            reason = _branch_shipped_reason(
                rdir,
                main_ref,
                branch,
                sha,
                repo_label=repo_label,
                shipped_queue=shipped_queue,
                main_text=main_text,
                main_subjects=main_subjects,
                check_stalled_heuristics=False,
            ) or ("abandoned" if include_abandoned else "")

            if not reason:
                kept_unmerged.append(branch)
                continue

            item = {"branch": branch, "sha": sha[:10], "age_days": round(age_days, 1), "reason": reason}
            if dry:
                would_delete.append(item)
            else:
                dp = _git(["push", "--no-verify", REMOTE, f":refs/heads/{branch}"], rdir, check=False, timeout=90)
                derr = (dp.stderr or dp.stdout or "").lower()
                if dp.returncode == 0 or "remote ref does not exist" in derr:
                    _git(["update-ref", "-d", refname], rdir, check=False)
                    deleted.append(item)
                else:
                    raise LockError(f"failed to delete {repo_label} {branch}: {(dp.stderr or dp.stdout).strip()[:240]}")

        report["repos"].append({
            "repo": repo_label,
            "deleted": deleted,
            "would_delete": would_delete,
            "kept_recent": kept_recent,
            "kept_protected": kept_protected,
            "kept_unmerged": kept_unmerged,
        })
    return report


def stalled_wt_branches(
    cwd: Path = ISABI_ROOT,
    *,
    hours: float = DEFAULT_STALLED_HOURS,
) -> dict:
    """Detect remote `origin/wt/*` branches in isabi and isabi-app older than `hours` carrying unshipped
    commits, with no active release lock covering them and no fresh (<= 180 min) release-queue heartbeat."""
    hrs = max(0.0, float(hours))
    lock_sha, lock_info = read_remote_lock(cwd)
    locked_batch_ids = (
        {str(x) for x in (lock_info.get("batch") or []) if x}
        if (lock_sha and lock_info and not is_expired(lock_info, 0))
        else set()
    )
    _protected_queue, shipped_queue, fresh_heartbeat, batch_locked = _read_queue_details(cwd, locked_batch_ids)
    locked_refs = _locked_branch_refs(lock_sha, lock_info, batch_locked)

    repos: list[tuple[str, Path]] = [("isabi", cwd)]
    app_repo = _prune_app_repo(cwd)
    if app_repo is not None:
        repos.append(("isabi-app", app_repo))

    now_dt = _now()
    now_ts = now_dt.timestamp()
    cutoff_s = hrs * 3600.0
    all_items: list[dict] = []
    repo_reports: list[dict] = []

    for repo_label, rdir in repos:
        _fetch_repo_main_and_wt(rdir, repo_label)
        main_ref = f"refs/remotes/{REMOTE}/main"
        main_text, main_subjects = _main_history_index(rdir, main_ref)
        out = _git(
            ["for-each-ref", "--format=%(refname)|%(objectname)|%(committerdate:unix)|%(committerdate:iso-strict)|%(subject)",
             f"refs/remotes/{REMOTE}/wt/"],
            rdir,
        ).stdout

        stalled: list[dict] = []
        skipped_recent = 0
        skipped_shipped = 0
        skipped_active = 0

        for ln in out.splitlines():
            if not ln.strip():
                continue
            parts = ln.split("|", 4)
            if len(parts) < 3:
                continue
            refname, sha, ts_str = parts[0], parts[1], parts[2]
            iso_dt = parts[3].strip() if len(parts) > 3 else ""
            subj = parts[4].strip() if len(parts) > 4 else ""
            branch = refname[len(f"refs/remotes/{REMOTE}/"):]
            try:
                ts_val = int(ts_str)
            except ValueError:
                skipped_recent += 1
                continue
            age_s = max(0.0, now_ts - ts_val)
            if age_s < cutoff_s:
                skipped_recent += 1
                continue
            if (repo_label, branch) in locked_refs or (repo_label, branch) in fresh_heartbeat:
                skipped_active += 1
                continue
            reason = _branch_shipped_reason(
                rdir,
                main_ref,
                branch,
                sha,
                repo_label=repo_label,
                shipped_queue=shipped_queue,
                main_text=main_text,
                main_subjects=main_subjects,
                check_stalled_heuristics=True,
            )
            if reason:
                skipped_shipped += 1
                continue
            ah_r = _git(["rev-list", "--count", f"{main_ref}..{sha}"], rdir, check=False, timeout=30)
            try:
                ahead = int((ah_r.stdout or "").strip() or 0) if ah_r.returncode == 0 else 0
            except ValueError:
                ahead = 0
            if ahead <= 0:
                skipped_shipped += 1
                continue
            item = {
                "repo": repo_label,
                "branch": branch,
                "sha": sha[:10],
                "ageHours": round(age_s / 3600.0, 1),
                "ahead": ahead,
                "subject": subj[:100],
                "committedAt": iso_dt,
            }
            stalled.append(item)
            all_items.append(item)

        repo_reports.append({
            "repo": repo_label,
            "stalled": stalled,
            "skippedRecent": skipped_recent,
            "skippedShipped": skipped_shipped,
            "skippedActive": skipped_active,
        })

    all_items.sort(key=lambda x: (-x["ageHours"], x["repo"], x["branch"]))
    return {
        "hours": hrs,
        "cutoffHours": hrs,
        "checkedAt": _iso(now_dt),
        "stalledCount": len(all_items),
        "items": all_items,
        "repos": repo_reports,
    }


def cmd_stalled(cwd: Path, *, hours: float, as_json: bool) -> int:
    rep = stalled_wt_branches(cwd, hours=hours)
    if as_json:
        print(json.dumps(rep, indent=1))
        return 0
    print(f"Stalled unshipped origin/wt/* branches (>={hours:g} h): {rep['stalledCount']}")
    for it in rep["items"]:
        print(f"  - [{it['repo']}] {it['branch']} ({it['sha']}, {it['ageHours']}h, +{it['ahead']} vs main) :: {it['subject']}")
    for rr in rep["repos"]:
        print(f"  [{rr['repo']}] stalled={len(rr['stalled'])}, recent={rr['skippedRecent']}, "
              f"shipped={rr['skippedShipped']}, active_lock_or_queue={rr['skippedActive']}")
    return 0


def cmd_prune(cwd: Path, *, days: int, dry: bool, as_json: bool, include_abandoned: bool) -> int:
    rep = prune_stale_wt(cwd, days=days, dry=dry, include_abandoned=include_abandoned)
    if as_json:
        print(json.dumps(rep, indent=1))
        return 0
    for rr in rep["repos"]:
        act = rr["would_delete"] if dry else rr["deleted"]
        verb = "Would prune" if dry else "Pruned"
        print(f"[{rr['repo']}] {verb} {len(act)} stale wt/* branch(es) (>={days}d) | "
              f"kept: {len(rr['kept_recent'])} recent, {len(rr['kept_protected'])} protected, {len(rr['kept_unmerged'])} unmerged")
        for it in act:
            print(f"  - {it['branch']} ({it['sha']}, {it['age_days']}d, {it['reason']})")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="One release at a time: the ISABI release lock (refs/locks/release on origin).",
                                 allow_abbrev=False)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("status", help="who holds the lock; live vs both mains")
    s.add_argument("--json", action="store_true")
    a = sub.add_parser("acquire", help="take the lock before rebasing and deploying")
    a.add_argument("--holder", required=True, help="who is releasing (session name / what ships)")
    a.add_argument("--version", default="", help="shell version being released, e.g. v19.6.315")
    a.add_argument("--purpose", default="release")
    a.add_argument("--ttl", type=int, default=DEFAULT_TTL_MIN, help="minutes before it expires (default 60)")
    a.add_argument("--takeover", action="store_true", help="take an expired lock even if it deployed commits not on main")
    r = sub.add_parser("renew", help="push the expiry out")
    r.add_argument("--ttl", type=int, default=DEFAULT_TTL_MIN)
    rl = sub.add_parser("release", help="give the lock back after pushing main")
    rl.add_argument("--force", action="store_true", help="release even if a deployed commit is not on origin/main")
    pr = sub.add_parser("prune", help="delete merged, patch-equivalent or batch-shipped origin/wt/* branches older than N days")
    pr.add_argument("--days", type=int, default=DEFAULT_PRUNE_DAYS, help=f"minimum age in days (default {DEFAULT_PRUNE_DAYS})")
    pr.add_argument("--dry", action="store_true", help="show what would be deleted without deleting any branch")
    pr.add_argument("--json", action="store_true")
    pr.add_argument("--include-abandoned", action="store_true", help="also delete unmerged origin/wt/* branches older than --days")
    st = sub.add_parser("stalled", help="list unshipped origin/wt/* branches older than N hours with no active lock or fresh queue heartbeat")
    st.add_argument("--hours", type=float, default=DEFAULT_STALLED_HOURS, help=f"minimum age in hours (default {DEFAULT_STALLED_HOURS})")
    st.add_argument("--json", action="store_true")
    ci = sub.add_parser("ci-acquire", help="push-to-main workflow: wait for and take the lock, record this commit")
    ci.add_argument("--sha", required=True)
    ci.add_argument("--wait", type=int, default=600, help="seconds to wait for a session's release (default 600)")
    ci.add_argument("--holder", default="")
    args = ap.parse_args(argv)
    if args.cmd == "ci-acquire":
        try:
            ok, fail, msg = ci_acquire(ISABI_ROOT, args.sha, wait_s=args.wait, holder=args.holder)
        except LockError as exc:
            ok, fail, msg = False, True, str(exc)
        out = os.environ.get("GITHUB_OUTPUT", "")
        if out:
            with open(out, "a", encoding="utf-8") as fh:
                fh.write(f"deploy={'true' if ok else 'false'}\n")
        print(msg if ok else (f"::error::{msg}" if fail else f"::warning::{msg}"))
        return 1 if fail else 0
    if getattr(args, "ttl", 1) < 1 or getattr(args, "ttl", 1) > 240:  # noqa: PLR2004
        ap.error("--ttl must be 1 to 240 minutes")
    if args.cmd == "prune" and args.days < 1:
        ap.error("--days must be at least 1")
    if args.cmd == "stalled" and args.hours < 0:
        ap.error("--hours must be >= 0")
    cwd = ISABI_ROOT
    try:
        if args.cmd == "status":
            return cmd_status(cwd, args.json)
        if args.cmd == "prune":
            return cmd_prune(cwd, days=args.days, dry=args.dry, as_json=args.json, include_abandoned=args.include_abandoned)
        if args.cmd == "stalled":
            return cmd_stalled(cwd, hours=args.hours, as_json=args.json)
        if args.cmd == "acquire":
            acquire(cwd, holder=args.holder, version=args.version, purpose=args.purpose, ttl_min=args.ttl, takeover=args.takeover)
        elif args.cmd == "renew":
            renew(cwd, ttl_min=args.ttl)
        else:
            release(cwd, force=args.force)
    except LockError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
