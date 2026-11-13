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
  python build/release_lock.py ci-acquire --sha <commit>   (the workflow; writes deploy=true|false to GITHUB_OUTPUT)
Bypass (only when the owner says so): ISABI_RELEASE_LOCK=off, or deploy_cloudflare.py --no-release-lock.
Test: python build/verify_release_lock.py
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
    Replacing and deleting use --force-with-lease with the exact sha this session read."""
    if not expected_old and not new_sha:
        return False
    if not expected_old:
        args = ["push", "--porcelain", "--no-verify", REMOTE, f"{new_sha}:{LOCK_REF}"]
    else:
        spec = f"+{new_sha}:{LOCK_REF}" if new_sha else f":{LOCK_REF}"
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
    new = {
        "lockId": uuid.uuid4().hex,
        "holder": holder or default_holder(cwd),
        "pc": socket.gethostname(),
        "worktree": str(cwd),
        "version": version,
        "purpose": purpose,
        "acquiredAt": _iso(now),
        "expiresAt": _iso(now + dt.timedelta(minutes=ttl_min)),
        "deployed": [],
    }
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
          _seen: tuple[str, dict] | None = None) -> dict:
    sha, info = _seen or read_remote_lock(cwd)
    if not sha or not held_by_me(info, cwd):
        raise LockError(f"RELEASE LOCK: this worktree does not hold it ({describe(info) if sha else 'nobody holds it'}).")
    new = dict(info)
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
    cwd = ISABI_ROOT
    try:
        if args.cmd == "status":
            return cmd_status(cwd, args.json)
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
