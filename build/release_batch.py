"""Batched releases: a waiting line in front of the release lock (owner 2026-11-13).

Why
---
build/release_lock.py lets one session release at a time. With eight sessions finishing changes, each one still waited
for its own turn and then ran its own version bump, sync, gates and deploy: 53 pushes to main in one day. The owner's
rule: a finished change releases at once when nothing is releasing; changes that finish while a release is running
wait in a line, and when that release ends the changes at the front of the line ship together as ONE version.

One or a few at a time (owner 2026-11-25): a batch takes at most MAX_BATCH (3) changes, in line order; the rest stay
in line and the next leader takes the next few. A batch of 14 took 98 minutes to form and one failing change held
back all the others; small batches form in minutes and a failure costs one short round. The leader's own change is
always in its batch, and a waiting change that a picked one is built on rides along (see _pick_batch).
`take --max N` / `ship --max N` or ISABI_BATCH_MAX change the limit for one command (0 = no limit).
The limit follows the line (owner 2026-11-26): about 30 of a batch's 37 minutes are checks that cost the same for 1
change or 6, so while more than LONG_LINE_OVER (6) changes wait a batch takes MAX_BATCH_LONG (6), and 3 again once the
line is short. The price: one failing change means a rebuild and a second check run of a bigger batch.

How it works
------------
The line and the release lock live in Cloudflare (owner 2026-11-25): the Durable Object `IsabiReleaseRoom` behind
`theo-edge-relay` `/release/*`, one row per finished change (release_lock.py: _release_backend, _cf_request). GitHub
no longer carries them; a local bare-repo remote (the offline gates) still uses the refs
`refs/release-queue/<time>-<id>` described next, and the rules are the same on both.
Each entry holds one document, ENTRY.json: who, a one-line summary, the pushed isabi-app branch and/or isabi branch
with the exact commits, and the gates that change needs. Joining creates a new entry, so two sessions never
collide; every later change to an entry is a compare-and-swap on the version this session read.

  ship   join the line, then: nothing releasing and you are first -> you lead the batch (same as `take`);
         a release is running -> wait until your change is live (shipped by another leader), left out, or it is
         your turn to lead.
  take   take the release lock, check out `release/batch-<lock>` at origin/main in this isabi worktree and its sibling
         isabi-app, and merge every waiting change in line order. One shell version for the whole batch.
  drop   leader only: leave one change out (its gate failed) and rebuild the batch without it.
  done   leader only, after deploy + push of both mains: mark the entries shipped and give the lock back. Refused
         until the batch is on both mains, the deploy recorded in the lock is the commit on isabi main, and the live
         site serves the batch's shell version. On main is not live.

A waiting session is told SHIPPED only when its entry is marked shipped (or its commits are on main) AND the live
site serves that version or a later one; it then clears its own entry. Entries nobody collects go after 24 hours
(left-out and abandoned ones after a week). A change found on main that no leader marked shipped (its leader stopped
after pushing) counts as shipped only on evidence that it is live; otherwise the next batch takes it live.
A change built on top of another waiting change carries that change's commits: both are in the batch. When the lower
one is left out (rule 1) or dropped (rule 2), the upper one is left out with it and the batch is built again, so no
part of a left-out change ships through another: in either repo, in this batch or a later one (as long as the
left-out entry is in the line; its own session replaces it by joining again with the fix, or clears it with leave).
An entry is cleared only from the worktree that joined it (leave --force when the owner says a change is abandoned).
A session waiting in line refreshes its entry every 10 minutes; an entry with no sign of life for 3 hours is
skipped by leaders (never shipped behind its session's back) until that session joins again.
A dropped connection is waited out: reading the line retries twice, and a session waiting in line keeps its place and
keeps polling until the line answers again, so one network blip never ends a wait. Still offline when the wait runs out:
WAITING, and the message names `wait --id <entry>` (which waits out an outage; ship re-joins first and does not).
The line is ordered by the second each change joined, by each PC's own clock: a skewed clock can change the order
of a batch, never what ships.

The two owner rules
  1. A change that does not merge cleanly with main plus the changes ahead of it is left out of that batch. Its entry
     says why; its session rebases, pushes and joins again. The others still ship.
  2. When the combined gates fail, the leader drops the change that broke them (`drop`) and the batch is rebuilt and
     gated again without it. The others still ship.

Version stamps: every change used to bump the shell version itself (about 190 lines in sw.js, index.html and
manifest.json), so any two branches clashed. Before merging, a branch's stamps are rewritten to the ones on main (a
commit on top of the branch, made without touching any working tree), and the batch gets one new number at the end:
one above the highest of live, isabi main and isabi-app main. On the isabi side, app/ and
functions/_lib/deployed_shell.js are generated by sync_app.py, so a branch's copies of them are ignored the same way.

The leader then runs the unchanged release steps: gates, `python build/sync_app.py`, commit,
`python build/deploy_cloudflare.py --pages-only`, push main (isabi-app, then isabi), and
`python build/release_batch.py done`. `lead` runs all of them in that order as one command and stops at the first
failure with the lock held (fix or drop, then `lead` again: it carries on where it stopped); `drive` leads batch after
batch until the line is empty, so the lock never sits free while changes wait (owner 2026-11-26). The leader's PC makes the batch live (owner 2026-11-26): the GitHub workflow runs
its checks on a push to main and deploys nothing, so a GitHub outage or a red run there never stops a release.

Commands
  python build/release_batch.py status [--json]
  python build/release_batch.py ship --holder "<session>" --summary "<what ships>" [--app-branch wt/x]
                                     [--site-branch wt/y] [--gate "isabi-app: node build/verify_x.mjs"]... [--wait 540]
  python build/release_batch.py join  (same arguments as ship; only joins)
  python build/release_batch.py wait --id <entry> [--wait 540]
  python build/release_batch.py take --holder "<session>" [--version 19.6.N]
  python build/release_batch.py drop <entry> --reason "<which gate failed>" [--reset]
  python build/release_batch.py done
  python build/release_batch.py abort
  python build/release_batch.py leave --id <entry> [--force]
  python build/release_batch.py lead --holder "<session>" [--max N] [--from gates|main|sync|deploy|push]
  python build/release_batch.py drive --holder "<session>" [--batches N] [--wait 1800] [--idle 0] [--stopped-sessions]
ship and wait end with one line, `RESULT: <STATE>: ...`: LEADER (you hold the lock: run the release steps), SHIPPED
(live), LEFT_OUT (why), WAITING (run the same command again), TURN (run take now), HALF_FORMED (run abort), GONE.
Test: python build/verify_release_batch.py
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import shlex
import socket
import subprocess
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import release_lock as RL  # noqa: E402

try:
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
except Exception:
    pass

ISABI_ROOT = RL.ISABI_ROOT
QUEUE_NS = "refs/release-queue"            # on the remote: one ref per change waiting to ship
SEEN_NS = "refs/isabi-release-queue"       # local copies of those refs (so ENTRY.json can be read)
BATCH_FILE = "isabi-release-batch.json"    # in this worktree's git dir: the batch this worktree leads
JOINED_FILE = "isabi-release-joined.json"  # in this worktree's git dir: entries joined from here
TEMP_INDEX = "isabi-release-batch.index"
APP_STAMP_FILES = ("sw.js", "index.html", "manifest.json")
SITE_GENERATED_DIR = "app"
SITE_GENERATED_FILE = "functions/_lib/deployed_shell.js"
STATES = ("waiting", "left_out", "shipped")
STALE_AFTER_MIN = 180   # a waiting entry whose session gave no sign of life for this long is skipped, not shipped
HEARTBEAT_S = 600       # a session waiting in line refreshes its entry this often
SHIPPED_KEEP_H = 24     # a shipped entry its session never collected is cleared after this long
DEAD_KEEP_DAYS = 7      # left-out, unreadable and abandoned waiting entries are cleared after this long
HEAD_START_S = 60       # a waiter that is Nth in line leads only after the lock has been free N * this long
DEFAULT_WAIT_S = 540    # under the 10 minute limit of a foreground command; run again to keep waiting
TAKE_BUDGET_S = 180     # ship does not start forming a batch with less than this left after a long wait
POLL_S = 20
MAX_BATCH = 3           # a leader takes at most this many changes per batch (owner 2026-11-25); 0 = no limit
MAX_BATCH_LONG = 6      # ...and this many while the line is long (owner 2026-11-26)
LONG_LINE_OVER = 6      # the line is long when more than this many changes wait
MAX_BATCH_ENV = "ISABI_BATCH_MAX"   # fixes the limit for one command, long line or not (take/ship --max N does the same)
LEAD_FILE = "isabi-release-lead.json"      # in this worktree's git dir: how far `lead` got with the batch led here
LEAD_LOG_DIR = "isabi-release-lead-logs"   # in this worktree's git dir: one log per step of `lead`
LEAD_RENEW_S = 600      # `lead` renews the release lock this often while a step runs
LEAD_RESULT_ENV = "ISABI_LEAD_RESULT_FILE"         # `drive` reads each batch's outcome from this file
BATCH_LOG_ENV = "ISABI_RELEASE_BATCH_LOG"          # where `lead` keeps one line per batch (default ~/.theo/...)
DRIVE_WAIT_S = 1800     # `drive` waits this long for another session's release to end before returning WAITING
_IDENT = {"GIT_AUTHOR_NAME": "ISABI release batch", "GIT_AUTHOR_EMAIL": "release-batch@isabi.invalid",
          "GIT_COMMITTER_NAME": "ISABI release batch", "GIT_COMMITTER_EMAIL": "release-batch@isabi.invalid"}


_mono = time.monotonic  # the clock for waits and budgets (the gate swaps it to test them without waiting)


class BatchError(RL.LockError):
    """The line or the batch cannot be used as asked; the message says what to do."""


# A dropped connection (Wi-Fi, DNS, a GitHub hiccup) is no reason to give up a place in line: reading the line retries,
# and a session waiting in line keeps waiting through it. 2026-11-18: one "Recv failure: Connection was reset" ended the
# waits of six sessions at once (exit 2) and their entries went stale for 3 hours.
_NET_ERR_RE = re.compile(
    r"Could not resolve host|Connection (?:was )?reset|Recv failure|Send failure|Failed to connect|"
    r"Connection timed out|Operation timed out|Connection refused|Network is unreachable|"
    r"remote end hung up|early EOF|Empty reply from server|SSL connection timeout|gnutls_handshake\(\) failed|"
    r"did not finish \(TimeoutExpired\)|The requested URL returned error: 5\d\d|"
    r"HTTP Error (?:429|5\d\d)|URLError|RemoteDisconnected|timed out|EOF occurred in violation of protocol|"
    # Only the schannel errors that clear by themselves: an untrusted root or a failed revocation check (a proxy or an
    # antivirus intercepting TLS) stays until someone fixes it, so it must be reported, not waited out.
    r"schannel: (?:failed to receive handshake|server closed (?:the connection )?abruptly|failed to decrypt data)|"
    # Not the network but just as passing: every session ships from the same checkout, so two sessions fetching the
    # line or the lock at once race on the same local ref. Only that race: a lock FILE left behind by a killed git
    # ("Unable to create '...lock': File exists") stays until removed and must be reported. Never apply this pattern
    # to push output (a lost compare-and-swap on GitHub reads the same and is not passing).
    r"cannot lock ref '[^']*': is at [0-9a-f]+ but expected [0-9a-f]+", re.IGNORECASE)
NET_RETRY_S = (5, 15)   # pauses between the attempts of one read of the line
_sleep = time.sleep     # the gate swaps it to test the retries without waiting
_inner_retries = [True]  # wait() turns these off: its own loop retries, within its own deadline


def _is_net_error(text: str) -> bool:
    """True when a git failure is the network, not the repository: worth waiting out, never worth giving up for."""
    return bool(_NET_ERR_RE.search(text or ""))


def _offline_hint(msg: str, err: str, entry_id: str) -> str:
    """A WAITING message that ended on a network error names `wait --id` (ship re-joins first and is not tolerant)."""
    if not _is_net_error(err):
        return msg
    return f"{msg} Offline: keep waiting with: python build/release_batch.py wait --id {entry_id}"


# ------------------------------------------------------------------------------------------------------ git plumbing

def _run(args: list[str], cwd: Path, *, data: bytes = b"", env_extra: dict | None = None, check: bool = True,
         timeout: int = 180) -> subprocess.CompletedProcess:
    """git with bytes in and out (file contents pass through untouched)."""
    env = dict(os.environ)
    env.setdefault("GIT_TERMINAL_PROMPT", "0")
    if env_extra:
        env.update(env_extra)
    try:
        r = subprocess.run(["git", *args], cwd=str(cwd), input=data, capture_output=True, timeout=timeout, env=env)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise BatchError(f"git {' '.join(args[:3])} did not finish in {cwd} ({type(exc).__name__})") from None
    if check and r.returncode != 0:
        msg = (r.stderr or r.stdout).decode("utf-8", errors="replace").strip()[:400]
        raise BatchError(f"git {' '.join(args[:3])} failed in {cwd}: {msg}")
    return r


def _out(args: list[str], cwd: Path, **kw) -> str:
    return _run(args, cwd, **kw).stdout.decode("utf-8", errors="replace").strip()


def _ident_env(repo: Path) -> dict:
    """The user's own git identity when there is one; the batch identity otherwise (CI, a bare test clone)."""
    if os.environ.get("GIT_AUTHOR_NAME") and os.environ.get("GIT_COMMITTER_NAME"):
        return {}
    name = _out(["config", "user.name"], repo, check=False)
    mail = _out(["config", "user.email"], repo, check=False)
    return {} if name and mail else dict(_IDENT)


def _blob(repo: Path, rev_path: str) -> bytes | None:
    r = _run(["cat-file", "blob", rev_path], repo, check=False)
    return r.stdout if r.returncode == 0 else None


def _head(repo: Path) -> str:
    return _out(["rev-parse", "HEAD"], repo)


def _known_commit(repo: Path, sha: str) -> bool:
    return _run(["cat-file", "-e", f"{sha}^{{commit}}"], repo, check=False).returncode == 0


def _dirty(repo: Path) -> list[str]:
    return [ln for ln in _out(["status", "--porcelain", "--untracked-files=no"], repo).splitlines() if ln.strip()]


def _require_clean(repo: Path, label: str) -> None:
    d = _dirty(repo)
    if d:
        raise BatchError(f"{label} worktree {repo} has uncommitted changes ({', '.join(x[3:] for x in d[:5])}"
                         f"{', ...' if len(d) > 5 else ''}): commit or stash them first; the batch is built by checking out "
                         "origin/main here.")


def app_root(cwd: Path) -> Path:
    """The isabi-app worktree next to this isabi worktree (the same rule as sync_app.py)."""
    for name in ("isabi-app", "mfg-web"):
        p = cwd.parent / name
        if (p / ".git").exists():
            return p
    raise BatchError(f"no isabi-app worktree next to {cwd} (expected {cwd.parent / 'isabi-app'}): a batch needs the pair "
                     "side by side, like sync_app.py.")


# ------------------------------------------------------------------------------------------------- version stamps

_RE_CACHE = re.compile(rb"(isabi-mfg-v)[0-9]+(?:\.[0-9]+)*")
_RE_HTML_VER = re.compile(rb"(__MFG_SHELL_VER\s*=\s*['\"])[0-9]+(?:\.[0-9]+)*(['\"])")
_RE_QUERY = re.compile(rb"(\?v=)[0-9]+\.[0-9]+\.[0-9]+")
_RE_VERSION = re.compile(r"^[0-9]+(\.[0-9]+){2}$")


def restamp(data: bytes, ver: str) -> bytes:
    """Every shell version stamp in a file set to `ver`: SHELL_CACHE, __MFG_SHELL_VER and the ?v=X.Y.Z query strings
    (the three places sync_app.py checks for parity). ?v=1 on vendor files and the data cache name are not stamps."""
    v = ver.encode("ascii")
    data = _RE_CACHE.sub(lambda m: m.group(1) + v, data)
    data = _RE_HTML_VER.sub(lambda m: m.group(1) + v + m.group(2), data)
    return _RE_QUERY.sub(lambda m: m.group(1) + v, data)


def shell_ver_of(data: bytes | None) -> str:
    m = re.search(rb"isabi-mfg-v([0-9]+(?:\.[0-9]+)*)", (data or b"")[:600])
    return m.group(1).decode("ascii") if m else ""


def _vt(ver: str) -> tuple[int, ...]:
    return tuple(int(x) for x in ver.split("."))


def next_version(*known: str) -> str:
    """One above the highest of the given versions (last component)."""
    have = [v for v in known if v and _RE_VERSION.match(v)]
    if not have:
        raise BatchError("no shell version could be read from live or main; pass --version")
    top = list(max(_vt(v) for v in have))
    top[-1] += 1
    return ".".join(str(x) for x in top)


def live_shell_version() -> str:
    fixed = os.environ.get("ISABI_RELEASE_LIVE_SHELL", "").strip()  # tests only
    if fixed:
        return "" if fixed == "unreadable" else fixed
    return shell_ver_of(RL._live_bytes("/app/sw.js"))


def batch_version(cwd: Path, app: Path, asked: str = "") -> str:
    """The number this batch ships as. Live must be readable: a number at or below live would be refused by devices
    (minShellVer floor) or silently not update them."""
    live = live_shell_version()
    if not live:
        raise BatchError(f"cannot read the live shell version from {RL.LIVE_BASE}/app/sw.js; not choosing a version blind. "
                         "Check the network and run again.")
    site_main = shell_ver_of(_blob(cwd, f"{RL.REMOTE}/main:app/sw.js"))
    app_main = shell_ver_of(_blob(app, f"{RL.REMOTE}/main:sw.js"))
    floor = max((v for v in (live, site_main, app_main) if v and _RE_VERSION.match(v)), key=_vt)
    if asked:
        asked = asked.lstrip("v")
        if not _RE_VERSION.match(asked):
            raise BatchError(f"--version {asked!r} is not X.Y.Z")
        if _vt(asked) <= _vt(floor):
            raise BatchError(f"--version {asked} is not above {floor} (live {live or '?'}, isabi main {site_main or '?'}, "
                             f"isabi-app main {app_main or '?'})")
        return asked
    return next_version(live, site_main, app_main)


# ------------------------------------------------------------------------------------------------------ the line

def _pub(entry: dict) -> dict:
    return {k: v for k, v in entry.items() if not k.startswith("_")}


def _entry_commit(entry: dict, cwd: Path, parent: str = "") -> str:
    body = json.dumps(_pub(entry), ensure_ascii=False, indent=1, sort_keys=True) + "\n"
    blob = RL._git(["hash-object", "-w", "--stdin"], cwd, input_text=body).stdout.strip()
    tree = RL._git(["mktree"], cwd, input_text=f"100644 blob {blob}\tENTRY.json\n").stdout.strip()
    args = ["commit-tree", tree, "-m", f"release line: {entry.get('holder', '?')}: {str(entry.get('summary', ''))[:80]}"]
    if parent:
        args += ["-p", parent]
    return RL._git(args, cwd).stdout.strip()


def _push_ref(ref: str, new_sha: str, expected_old: str, cwd: Path) -> bool:
    """Compare-and-swap on a remote ref, the same way as the lock: create = plain push that the server refuses when
    the ref exists; replace and delete = --force-with-lease on the exact value this session read, with no "+" in the
    refspec (a "+" makes git force the update and ignore a lease that does not match)."""
    if not expected_old and not new_sha:
        return False
    if not expected_old:
        args = ["push", "--porcelain", "--no-verify", RL.REMOTE, f"{new_sha}:{ref}"]
    else:
        spec = f"{new_sha}:{ref}" if new_sha else f":{ref}"
        args = ["push", "--porcelain", "--no-verify", f"--force-with-lease={ref}:{expected_old}", RL.REMOTE, spec]
    return RL._git(args, cwd, check=False, timeout=90).returncode == 0


def read_line(cwd: Path = ISABI_ROOT) -> list[dict]:
    """Every entry in the line, oldest first. Each carries `_ref` and `_sha` (the version/sha to compare-and-swap on).
    An entry that cannot be read is listed with state "unreadable" and never shipped."""
    pauses = list(NET_RETRY_S) if _inner_retries[0] else []
    if RL._release_backend(cwd) == "cloudflare":
        while True:
            try:
                res = RL._cf_request("GET", "/queue")
                break
            except RL.LockError as exc:
                err = str(exc)
                if not pauses or not _is_net_error(err):
                    raise BatchError(f"cannot read the release line from Cloudflare ({err[:300]})") from None
                _sleep(pauses.pop(0))
        entries: list[dict] = []
        for item in res.get("entries") or []:
            if not isinstance(item, dict):
                continue
            name = str(item.get("id") or "")
            ver = str(item.get("version") or "")
            e = item.get("entry")
            if not name:
                continue
            if not isinstance(e, dict) or e.get("id") != name or e.get("state") not in STATES:
                e = {"id": name, "state": "unreadable", "holder": "?", "summary": "(entry cannot be read)"}
            e["_ref"], e["_sha"] = f"cf:{name}", ver
            entries.append(e)
        entries.sort(key=lambda e: e["id"])
        return entries

    while True:
        try:
            r = RL._git(["fetch", "--no-tags", "--quiet", "--prune", RL.REMOTE, f"+{QUEUE_NS}/*:{SEEN_NS}/*"], cwd,
                        check=False, timeout=90)
            err = "" if r.returncode == 0 else ((r.stderr or r.stdout).strip() or f"git fetch exit {r.returncode}")
        except RL.LockError as exc:  # git hung or could not start
            err = str(exc)
        if not err:
            break
        if not pauses or not _is_net_error(err):
            raise BatchError(f"cannot read the release line from {RL.REMOTE} ({err[:300]})")
        _sleep(pauses.pop(0))
    out = RL._git(["for-each-ref", "--format=%(refname) %(objectname)", f"{SEEN_NS}/"], cwd).stdout
    entries = []
    for ln in out.splitlines():
        if not ln.strip():
            continue
        ref, sha = ln.split()
        name = ref[len(SEEN_NS) + 1:]
        raw = RL._git(["cat-file", "blob", f"{sha}:ENTRY.json"], cwd, check=False)
        try:
            e = json.loads(raw.stdout) if raw.returncode == 0 else None
        except ValueError:
            e = None
        if not isinstance(e, dict) or e.get("id") != name or e.get("state") not in STATES:
            e = {"id": name, "state": "unreadable", "holder": "?", "summary": "(entry cannot be read)"}
        e["_ref"], e["_sha"] = f"{QUEUE_NS}/{name}", sha
        entries.append(e)
    entries.sort(key=lambda e: e["id"])
    return entries


def _create_entry(cwd: Path, entry: dict) -> dict:
    """Insert a brand-new entry into the line."""
    if RL._release_backend(cwd) == "cloudflare":
        res = RL._cf_request("POST", "/queue/cas", {"entryId": entry["id"], "expectedVersion": "", "entry": _pub(entry)})
        if not res.get("swapped"):
            raise BatchError(f"could not write {entry['id']} to Cloudflare release queue (already exists)")
        out = dict(entry)
        out["_ref"], out["_sha"] = f"cf:{entry['id']}", str(res.get("version") or "")
        return out
    commit = _entry_commit(entry, cwd)
    ref = f"{QUEUE_NS}/{entry['id']}"
    if not _push_ref(ref, commit, "", cwd):
        raise BatchError(f"could not write {ref} on {RL.REMOTE} (network, or no push rights)")
    out = dict(entry)
    out["_ref"], out["_sha"] = ref, commit
    return out


def _update_entry(cwd: Path, entry: dict, **changes) -> dict | None:
    """Write changed fields into an entry. None when it changed or went away on the remote since it was read."""
    new = _pub(entry)
    for k, v in changes.items():
        if v is None:
            new.pop(k, None)
        else:
            new[k] = v
    if RL._release_backend(cwd) == "cloudflare":
        res = RL._cf_request("POST", "/queue/cas", {"entryId": entry["id"], "expectedVersion": entry["_sha"], "entry": new})
        if not res.get("swapped"):
            return None
        new["_ref"], new["_sha"] = entry["_ref"], str(res.get("version") or "")
        return new
    commit = _entry_commit(new, cwd, parent=entry["_sha"])
    if not _push_ref(entry["_ref"], commit, entry["_sha"], cwd):
        return None
    new["_ref"], new["_sha"] = entry["_ref"], commit
    return new


def _delete_entry(cwd: Path, entry: dict) -> bool:
    if RL._release_backend(cwd) == "cloudflare":
        res = RL._cf_request("POST", "/queue/cas", {"entryId": entry["id"], "expectedVersion": entry["_sha"], "entry": None})
        return bool(res.get("swapped"))
    return _push_ref(entry["_ref"], "", entry["_sha"], cwd)


def _set_fields(cwd: Path, entry_id: str, changes: dict, *, only_if=None, tries: int = 4) -> dict | None:
    """Write fields into the entry as it is on the remote NOW, retrying when another session wrote it in between (a
    waiting session refreshes its entry while a leader marks it). None when the entry is gone, unreadable, or
    `only_if(entry)` says the change no longer applies."""
    for _ in range(max(1, tries)):
        cur = next((e for e in read_line(cwd) if e["id"] == entry_id), None)
        if cur is None or cur.get("state") not in STATES or (only_if is not None and not only_if(cur)):
            return None
        new = _update_entry(cwd, cur, **changes)
        if new is not None:
            return new
    return None


def _is_stale(entry: dict) -> bool:
    seen = RL._parse_iso(entry.get("seenAt") or entry.get("queuedAt") or "")
    return seen is None or seen + dt.timedelta(minutes=STALE_AFTER_MIN) <= RL._now()


def _waiting(line: list[dict], keep: str = "") -> list[dict]:
    """The entries a leader would ship, in line order: waiting, and their session seen recently (`keep` = an entry
    counted even when stale: the one being asked about)."""
    return [e for e in line if e.get("state") == "waiting" and (e["id"] == keep or not _is_stale(e))]


def _touch(cwd: Path, entry_id: str) -> None:
    """A sign of life from the entry's session (at most one write per HEARTBEAT_S / 2)."""
    fresh = RL._now() - dt.timedelta(seconds=HEARTBEAT_S / 2)

    def due(e: dict) -> bool:
        seen = RL._parse_iso(e.get("seenAt") or "")
        return e.get("state") == "waiting" and (seen is None or seen <= fresh)

    try:
        _set_fields(cwd, entry_id, {"seenAt": RL._iso(RL._now())}, only_if=due, tries=1)
    except RL.LockError:
        pass


def _id_time(entry_id: str) -> dt.datetime | None:
    try:
        return dt.datetime.strptime(entry_id.split("-")[0], "%Y%m%dT%H%M%SZ").replace(tzinfo=dt.timezone.utc)
    except ValueError:
        return None


def _prune(cwd: Path, lock_id: str = "") -> None:
    """Clear entries that have done their job or were abandoned, so the line every waiting session reads stays short:
    shipped and not collected for a day; left out, unreadable, or waiting with no sign of life for a week. An entry
    whose age cannot be told is kept, and so is anything in the batch being released under `lock_id`."""
    now = RL._now()
    for e in read_line(cwd):
        if lock_id and (e.get("batch") or {}).get("lockId") == lock_id:
            continue
        state = e.get("state")
        if state == "shipped":
            at, keep = e.get("shippedAt"), dt.timedelta(hours=SHIPPED_KEEP_H)
        elif state == "left_out":
            at, keep = e.get("leftOutAt"), dt.timedelta(days=DEAD_KEEP_DAYS)
        elif state == "waiting":
            at, keep = e.get("seenAt") or e.get("queuedAt"), dt.timedelta(days=DEAD_KEEP_DAYS)
        else:
            at, keep = "", dt.timedelta(days=DEAD_KEEP_DAYS)
        when = RL._parse_iso(at or "") or _id_time(e["id"])
        if when is not None and when + keep <= now:
            _delete_entry(cwd, e)


def _find(line: list[dict], entry_id: str) -> dict | None:
    hits = [e for e in line if e["id"] == entry_id] or [e for e in line if entry_id and e["id"].endswith("-" + entry_id)]
    return hits[0] if len(hits) == 1 else None


def _local_json(cwd: Path, name: str) -> dict:
    try:
        d = json.loads((RL.git_dir(cwd) / name).read_text(encoding="utf-8"))
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _write_local_json(cwd: Path, name: str, data: dict | None) -> None:
    p = RL.git_dir(cwd) / name
    if data is None:
        try:
            p.unlink()
        except OSError:
            pass
        return
    p.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def _remote_branch(repo: Path, branch: str, label: str) -> str:
    """The commit a pushed branch points at on the remote (fetched here). The line only ships what is on GitHub."""
    branch = branch.removeprefix("origin/").removeprefix("refs/heads/")
    out = _out(["ls-remote", RL.REMOTE, f"refs/heads/{branch}"], repo, check=False, timeout=90)
    sha = out.split()[0] if out.split() else ""
    if not sha:
        raise BatchError(f"{label} branch {branch!r} is not on {RL.REMOTE}: push it first (git push origin {branch}).")
    _run(["fetch", "--no-tags", "--quiet", RL.REMOTE, f"+refs/heads/{branch}:refs/remotes/{RL.REMOTE}/{branch}"], repo,
         timeout=180)
    local = _out(["rev-parse", "-q", "--verify", f"refs/heads/{branch}"], repo, check=False)
    if local and local != sha:
        raise BatchError(f"{label} branch {branch!r} is {local[:7]} here but {sha[:7]} on {RL.REMOTE}: push it first, so the "
                         "line ships what you tested.")
    return sha


def join(cwd: Path = ISABI_ROOT, *, holder: str, summary: str, app_branch: str = "", site_branch: str = "",
         gates: tuple[str, ...] | list[str] = (), quiet: bool = False, force: bool = False) -> dict:
    """Put a finished, pushed change in the line. Joining again with the same commits keeps its place."""
    holder, summary = holder.strip(), " ".join(summary.split())
    if not holder or not summary:
        raise BatchError("--holder and --summary are both needed (who is shipping, and one line on what ships)")
    if not app_branch and not site_branch:
        raise BatchError("name what ships: --app-branch (isabi-app) and/or --site-branch (isabi)")
    parts: dict[str, dict] = {}
    for kind, branch, repo in (("app", app_branch, app_root(cwd) if app_branch else None), ("site", site_branch, cwd)):
        if not branch:
            continue
        label = "isabi-app" if kind == "app" else "isabi"
        sha = _remote_branch(repo, branch, label)
        RL._fetch_main(repo)
        if RL._in(repo, sha, f"{RL.REMOTE}/main"):
            if not quiet:
                print(f"NOTE: {label} {branch} ({sha[:7]}) is already on main; not queued.")
            continue
        parts[kind] = {"branch": branch.removeprefix("origin/").removeprefix("refs/heads/"), "sha": sha}
    if not parts:
        raise BatchError("everything named is already on origin/main: nothing to release.")
    lock_sha, lock = RL.read_remote_lock(cwd)
    joined_here = _local_json(cwd, JOINED_FILE)
    for old in read_line(cwd):
        same = [k for k in parts if (old.get(k) or {}).get("branch") == parts[k]["branch"]]
        if not same:
            continue
        if old.get("state") in ("waiting", "left_out") and old["id"] not in joined_here and old.get("holder") != holder and not force:
            # The same rule as leave: refreshing or replacing another session's entry would ship its commits behind
            # its back (a quiet one) or put failed commits back in line (a left-out one).
            what = f"was left out ({old.get('note') or 'no reason given'})" if old.get("state") == "left_out" else "is waiting in line"
            raise BatchError(f"{old['id']} ({old.get('summary')}) is for the same branch ({parts[same[0]]['branch']}), {what}, and "
                             f"belongs to {old.get('holder', '?')}: only that session joins it again or clears it. "
                             "--force only when the owner says so.")
        in_live_batch = bool(lock_sha) and (old.get("batch") or {}).get("lockId") == lock.get("lockId")
        unchanged = all((old.get(k) or {}).get("sha") == (parts.get(k) or {}).get("sha") for k in ("app", "site"))
        if old.get("state") == "waiting" and unchanged:
            old = _set_fields(cwd, old["id"], {"seenAt": RL._iso(RL._now())}, only_if=lambda e: e.get("state") == "waiting") or old
            _remember(cwd, old)
            if not quiet:
                print(f"Already in line: {old['id']} (place kept).")
            return old
        if old.get("state") == "waiting" and in_live_batch:
            raise BatchError(f"{old['id']} ({parts[same[0]]['branch']}) is in the batch being released now by "
                             f"{(old.get('batch') or {}).get('holder', '?')}; wait for it (wait --id {old['id']}), then join the "
                             "new commits.")
        _delete_entry(cwd, old)  # an older entry for the same branch (left out, or other commits): replaced
    now = RL._now()
    entry = {
        "id": f"{now.strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}",
        "holder": holder,
        "pc": socket.gethostname(),
        "summary": summary,
        "gates": [g.strip() for g in gates if g and g.strip()],
        "queuedAt": RL._iso(now),
        "seenAt": RL._iso(now),
        "state": "waiting",
        **parts,
    }
    entry = _create_entry(cwd, entry)
    _remember(cwd, entry)
    if not quiet:
        print(f"In line: {entry['id']} ({_parts_text(entry)}).")
    return entry


def _remember(cwd: Path, entry: dict) -> None:
    rec = _local_json(cwd, JOINED_FILE)
    # Kept a month from the last time this worktree joined or refreshed it: far longer than a left-out entry lives in
    # the line (a week), so the session that owns an entry can always clear it.
    cutoff = RL._iso(RL._now() - dt.timedelta(days=30))
    rec = {k: v for k, v in rec.items() if max(str(v.get("queuedAt", "")), str(v.get("seenAt", ""))) >= cutoff}
    rec[entry["id"]] = _pub(entry)
    _write_local_json(cwd, JOINED_FILE, rec)


def _parts_text(entry: dict) -> str:
    bits = []
    for kind, label in (("app", "isabi-app"), ("site", "isabi")):
        p = entry.get(kind) or {}
        if p.get("sha"):
            bits.append(f"{label} {p.get('branch')} {p['sha'][:7]}")
    return ", ".join(bits) or "nothing"


def _parts_on_main(cwd: Path, entry: dict) -> bool:
    for kind in ("app", "site"):
        p = entry.get(kind) or {}
        if not p.get("sha"):
            continue
        repo = app_root(cwd) if kind == "app" else cwd
        RL._fetch_main(repo)
        if not RL._in(repo, p["sha"], f"{RL.REMOTE}/main"):
            return False
    return True


def leave(cwd: Path, entry_id: str, *, force: bool = False) -> None:
    line = read_line(cwd)
    e = _find(line, entry_id)
    if not e:
        raise BatchError(f"{entry_id} is not in the line (run status)")
    if e.get("state") in ("left_out", "waiting") and e["id"] not in _local_json(cwd, JOINED_FILE) and not force:
        # An entry is the record of a change's commits and the gates they need. A left-out one says they failed; a
        # waiting one whose session went quiet is skipped. While either is in the line nothing built on those commits
        # ships, so clearing it is for the session that owns the change.
        what = f"was left out ({e.get('note') or 'no reason given'})" if e.get("state") == "left_out" else "is waiting in line"
        raise BatchError(f"{e['id']} ({e.get('summary')}) {what} and this worktree did not join it. Its session "
                         f"({e.get('holder', '?')}) clears it with leave, or replaces it by joining again. "
                         "--force only when the owner says that change is abandoned.")
    lock_sha, lock = RL.read_remote_lock(cwd)
    if lock_sha and e.get("state") == "waiting" and (e.get("batch") or {}).get("lockId") == lock.get("lockId"):
        raise BatchError(f"{e['id']} is in the batch being released now by {(e.get('batch') or {}).get('holder', '?')}: "
                         "ask that session to drop it (release_batch.py drop).")
    if not _delete_entry(cwd, e):
        raise BatchError(f"{e['id']} changed while leaving the line; run status and try again")
    rec = _local_json(cwd, JOINED_FILE)
    rec.pop(e["id"], None)
    _write_local_json(cwd, JOINED_FILE, rec or None)
    print(f"Left the line: {e['id']}.")


# ------------------------------------------------------------------------------------------------- waiting in line

def _pid_alive(pid: int) -> bool:
    """Is a process with this id running on this PC? (Never os.kill on Windows: there it terminates the process.)"""
    if pid <= 0:
        return False
    if os.name == "nt":
        import ctypes  # noqa: PLC0415

        handle = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if not handle:
            return False
        try:
            code = ctypes.c_ulong()
            return bool(ctypes.windll.kernel32.GetExitCodeProcess(handle, ctypes.byref(code))) and code.value == 259  # STILL_ACTIVE
        finally:
            ctypes.windll.kernel32.CloseHandle(handle)
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False
    return True


def _own_batch(cwd: Path, lock_sha: str, lock: dict) -> tuple[str, str] | None:
    """When the release an entry here would wait for is this worktree's own: (state, message). Never report a
    session as waiting on itself.
    LEADER       this worktree leads a formed batch
    WAITING      a take or ship is forming the batch here right now (its process is alive): let it finish
    HALF_FORMED  a take was cut off while forming and still holds the lock: abort frees it"""
    mine = _local_json(cwd, BATCH_FILE)
    if not (mine and lock_sha and RL.held_by_me(lock, cwd) and lock.get("lockId") == mine.get("lockId")):
        return None
    if not mine.get("forming"):
        shell = mine.get("shell")
        return "LEADER", (f"this worktree leads batch {('v' + shell) if shell else '(no shell change)'} with "
                          f"{len(mine.get('entries') or [])} change(s): carry on with the release steps (or abort).")
    try:
        pid = int(mine.get("pid") or 0)
    except (TypeError, ValueError):
        pid = 0
    # A lock past its expiry is not being worked under (a process id can also be reused by something long-lived).
    if not RL.is_expired(lock, 0) and mine.get("host") == socket.gethostname() and pid != os.getpid() and _pid_alive(pid):
        return "WAITING", (f"a take or ship is forming the batch in this worktree right now (process {pid}): let it "
                           "finish, then run ship again. Do not abort it.")
    return "HALF_FORMED", ("this worktree holds the release lock for a batch that was cut off while forming (the process "
                           "that was forming it is gone). Run: python build/release_batch.py abort, then ship again.")


def poll_once(cwd: Path, entry_id: str, *, known: dict | None = None, free_for_s: float = 0.0) -> tuple[str, str, bool]:
    """Where one entry stands now: (state, message, lock free?). LEADER and HALF_FORMED: see _own_batch.
    SHIPPED   its commits are on origin/main (another leader shipped it)
    LEFT_OUT  a leader left it out; the message says why
    TURN      nothing is releasing and it is this entry's turn to lead the batch
    IN_BATCH  it is in the batch being released now
    WAITING   a release is running, or an entry ahead of it leads
    GONE      not in the line and not on main (withdrawn, or joined from another worktree)"""
    line = read_line(cwd)
    e = _find(line, entry_id)
    lock_sha, lock = RL.read_remote_lock(cwd)
    free = not lock_sha or RL.is_expired(lock, RL.TAKEOVER_GRACE_MIN)
    own = _own_batch(cwd, lock_sha, lock)
    if own:
        return own[0], own[1], False

    if e is None:
        rec = known or _local_json(cwd, JOINED_FILE).get(entry_id)
        if rec and _parts_on_main(cwd, rec):
            # Its entry was cleared (collected, or pruned a day after a leader's done checked the deploy).
            bar = _app_main_shell(cwd) if (rec.get("app") or {}).get("sha") else ""
            return (*_live_verdict(entry_id, bar, "another session"), free)
        return "GONE", (f"{entry_id} is not in the line and its commits are not on main: it was withdrawn, or this "
                        "worktree has no record of it. Run status; join again if it still has to ship."), free
    if e.get("state") == "shipped":
        return (*_live_verdict(e["id"], e.get("shippedVersion") or "", e.get("shippedBy") or "?"), free)
    if e.get("state") == "left_out":
        return "LEFT_OUT", (f"{e['id']} was left out by {e.get('leftOutBy', '?')}: {e.get('note') or 'no reason given'}. "
                            "Fix it (rebase onto origin/main), push, and join again."), free
    if e.get("state") != "waiting":
        return "GONE", f"{e['id']} cannot be read on the remote; leave --id {e['id']} and join again.", free
    waiting = _waiting(line, keep=e["id"])
    pos = next(i for i, x in enumerate(waiting) if x["id"] == e["id"])
    if not free:
        b = e.get("batch") or {}
        if b.get("lockId") == lock.get("lockId"):
            return "IN_BATCH", f"{e['id']} is in the batch {b.get('holder', '?')} is releasing as v{b.get('version') or '?'}.", free
        return "WAITING", f"{e['id']} is {pos + 1} of {len(waiting)} in line; release lock {RL.describe(lock)}.", free
    if _parts_on_main(cwd, e):
        # Its leader pushed it to main and never ran done. SHIPPED only on evidence that it is live; without that it
        # stays in line like any other change, and the next batch takes it live.
        live_ok, bar = _live_evidence(cwd, e, (lock.get("deployed") or []) if lock_sha else [])
        if live_ok:
            by = (e.get("batch") or {}).get("holder") or "another session"
            return "SHIPPED", (f"{e['id']} is live: pushed and deployed by {by}"
                               f"{(' (live serves v' + bar + ' or later)') if bar else ' (no shell change)'}."), free
    if pos == 0 or free_for_s >= pos * HEAD_START_S:
        return "TURN", f"nothing is releasing and {e['id']} is {'first' if pos == 0 else 'next'} in line: lead the batch.", free
    return "WAITING", (f"nothing is releasing; {waiting[0].get('holder', '?')} is first in line and leads the batch "
                       f"({e['id']} is {pos + 1} of {len(waiting)} in line; a batch takes {_cap_text(len(waiting))})."), free


def _app_main_shell(cwd: Path) -> str:
    """The shell version on isabi-app origin/main (call after a fetch of that main, e.g. _parts_on_main)."""
    return shell_ver_of(_blob(app_root(cwd), f"{RL.REMOTE}/main:sw.js"))


def _live_evidence(cwd: Path, entry: dict, deployed: list) -> tuple[bool, str]:
    """For an entry whose commits are all on origin/main but that no leader marked shipped: is there evidence it is
    live? Returns (yes?, the shell version live had to reach, "" for an isabi-only change).
    Command Center change: live serves at least the shell version isabi-app main carries (main holds the change, and
    live is only ever built from main). isabi-only change: nothing on the live site can be read for it, so the
    evidence is a deploy recorded in the lock (`deployed`: LOCK.json's list) whose commit contains the change."""
    if (entry.get("app") or {}).get("sha"):
        bar, live = _app_main_shell(cwd), live_shell_version()
        ok = bool(bar and live and _RE_VERSION.match(bar) and _RE_VERSION.match(live) and _vt(live) >= _vt(bar))
        return ok, bar
    sha = (entry.get("site") or {}).get("sha") or ""
    deps = [d for d in deployed or [] if isinstance(d, dict) and d.get("sha")]
    last = deps[-1]["sha"] if deps else ""
    return bool(sha and last and (last == sha or RL._in(cwd, sha, last))), ""


def _live_verdict(entry_id: str, ver: str, by: str) -> tuple[str, str]:
    """SHIPPED only when the live site serves the version the change went out in: on main is not live. A change
    with no shell version (isabi-side only) has nothing to read on live; its leader's `done` checked the deploy."""
    if not ver:
        return "SHIPPED", f"{entry_id} is on main and deployed by {by} (no shell change)."
    live = live_shell_version()
    if live and _RE_VERSION.match(live) and _RE_VERSION.match(ver) and _vt(live) >= _vt(ver):
        return "SHIPPED", f"{entry_id} is live: shipped in v{ver} by {by} (live serves v{live})."
    return "WAITING", (f"{entry_id} is on main as v{ver}, but live serves v{live or '?'}: not live yet. Checking again; "
                       "if it stays like this, run status (the deploy failed or was rolled back).")


def wait(cwd: Path, entry_id: str, *, wait_s: int = DEFAULT_WAIT_S, poll_s: int = POLL_S, known: dict | None = None,
         quiet: bool = False) -> tuple[str, str]:
    """Poll until the entry is SHIPPED (live), LEFT_OUT, GONE, or it is its TURN; WAITING when wait_s runs out.
    While waiting, the entry is refreshed so leaders know its session is still there. Network errors are waited out
    by this loop alone (read_line's own retries are off here, so a long outage cannot push a wait past its deadline)."""
    prev, _inner_retries[0] = _inner_retries[0], False
    try:
        return _wait(cwd, entry_id, wait_s=wait_s, poll_s=poll_s, known=known, quiet=quiet)
    finally:
        _inner_retries[0] = prev


def _wait(cwd: Path, entry_id: str, *, wait_s: int, poll_s: int, known: dict | None, quiet: bool) -> tuple[str, str]:
    deadline = _mono() + max(0, wait_s)
    free_since: float | None = None
    touched: float | None = None
    shown = ""
    while True:
        try:
            if touched is None or _mono() - touched >= HEARTBEAT_S:
                _touch(cwd, entry_id)
                touched = _mono()
            state, msg, free = poll_once(cwd, entry_id, known=known,
                                         free_for_s=(_mono() - free_since) if free_since is not None else 0.0)
        except RL.LockError as exc:
            if not _is_net_error(str(exc)):
                raise
            # Offline: the place in line is kept (the entry goes stale only after 3 hours without a heartbeat), so keep
            # waiting; the lock may have changed meanwhile, so the head-start clock starts again once back online.
            free_since = None
            why = re.sub(r"\s*after \d+ ms", "", str(exc).splitlines()[0])[:200]  # the same text each poll: printed once
            # The hint is `wait`, not ship: ship reads the lock and joins again first, and neither waits out an outage.
            msg = (f"{entry_id}: the release line cannot be reached ({why}); your place in line is kept. Still offline when this "
                   f"command ends? Keep waiting with: python build/release_batch.py wait --id {entry_id}")
            if not quiet and msg != shown:
                print(msg, flush=True)
                shown = msg
            if _mono() >= deadline:
                return "WAITING", msg
            _sleep(max(0, poll_s))
            continue
        free_since = (free_since if free_since is not None else _mono()) if free else None
        if state == "SHIPPED":  # collected by its own session: the entry has done its job
            try:
                done_entry = next((e for e in read_line(cwd) if e["id"] == entry_id and e.get("state") == "shipped"), None)
                if done_entry:
                    _delete_entry(cwd, done_entry)
            except RL.LockError:  # the change is live either way; an uncollected entry is pruned after 24 hours
                pass
        if state in ("SHIPPED", "LEFT_OUT", "GONE", "TURN", "LEADER", "HALF_FORMED"):
            return state, msg
        if not quiet and msg != shown:
            print(msg, flush=True)
            shown = msg
        if _mono() >= deadline:
            return "WAITING", msg
        _sleep(max(0, poll_s))


# ------------------------------------------------------------------------------------------------- building a batch

def _temp_index_env(repo: Path) -> tuple[Path, dict]:
    p = RL.git_dir(repo) / TEMP_INDEX
    try:
        p.unlink()
    except OSError:
        pass
    return p, {"GIT_INDEX_FILE": str(p)}


def _normalised_app_commit(app: Path, sha: str, ver: str) -> str:
    """A commit on top of `sha` whose shell version stamps equal `ver` (the stamps on main), so the stamps never
    clash in the merge. Built from blobs: no working tree is touched. `sha` itself when nothing differs."""
    changes: list[tuple[str, str, str]] = []
    for f in APP_STAMP_FILES:
        ls = _out(["ls-tree", sha, "--", f], app)
        data = _blob(app, f"{sha}:{f}") if ls else None
        if data is None:
            continue
        new = restamp(data, ver)
        if new != data:
            changes.append((ls.split()[0], _out(["hash-object", "-w", "--stdin"], app, data=new), f))
    if not changes:
        return sha
    idx, env = _temp_index_env(app)
    try:
        _run(["read-tree", sha], app, env_extra=env)
        for mode, blob, f in changes:
            _run(["update-index", "--cacheinfo", f"{mode},{blob},{f}"], app, env_extra=env)
        tree = _out(["write-tree"], app, env_extra=env)
    finally:
        try:
            idx.unlink()
        except OSError:
            pass
    return _out(["commit-tree", tree, "-p", sha, "-m", f"batch: shell version stamps as on main (v{ver})"], app, env_extra=_IDENT)


def _normalised_site_commit(cwd: Path, sha: str) -> tuple[str, bool]:
    """A commit on top of `sha` whose generated files (app/, deployed_shell.js) equal the batch's: sync_app.py
    rewrites them for the batch anyway. Returns (commit, did the branch carry its own app/ changes?)."""
    idx, env = _temp_index_env(cwd)
    try:
        _run(["read-tree", sha], cwd, env_extra=env)
        _run(["rm", "-r", "-q", "-f", "--cached", "--ignore-unmatch", "--", SITE_GENERATED_DIR, SITE_GENERATED_FILE], cwd,
             env_extra=env)
        if _run(["rev-parse", "-q", "--verify", f"HEAD:{SITE_GENERATED_DIR}"], cwd, check=False).returncode == 0:
            _run(["read-tree", f"--prefix={SITE_GENERATED_DIR}/", f"HEAD:{SITE_GENERATED_DIR}"], cwd, env_extra=env)
        ls = _out(["ls-tree", "HEAD", "--", SITE_GENERATED_FILE], cwd)
        if ls:
            mode, _typ, blob = ls.split()[:3]
            _run(["update-index", "--add", "--cacheinfo", f"{mode},{blob},{SITE_GENERATED_FILE}"], cwd, env_extra=env)
        tree = _out(["write-tree"], cwd, env_extra=env)
    finally:
        try:
            idx.unlink()
        except OSError:
            pass
    if tree == _out(["rev-parse", f"{sha}^{{tree}}"], cwd):
        return sha, False
    base = _out(["merge-base", "HEAD", sha], cwd, check=False)
    own_app = bool(base) and (_out(["rev-parse", "-q", "--verify", f"{base}:{SITE_GENERATED_DIR}"], cwd, check=False)
                              != _out(["rev-parse", "-q", "--verify", f"{sha}:{SITE_GENERATED_DIR}"], cwd, check=False))
    commit = _out(["commit-tree", tree, "-p", sha, "-m", "batch: generated files (app/, deployed_shell.js) as in the batch"],
                  cwd, env_extra=_IDENT)
    return commit, own_app


def _merge_entry(cwd: Path, app: Path, entry: dict, base_ver: str, notes: list[str],
                 fetched_branches: set[tuple[str, str]] | None = None) -> tuple[bool, str, list[str], bool]:
    """Merge one entry's branches into the batch branches. All or nothing across the two repos. Returns (merged
    cleanly?, why not, which parts brought new commits: "app" / "site", is every part already on origin/main?).
    A part that is in the batch already but NOT on main came in with a change ahead of it that was built on top of
    it: it is part of this batch like any other, never "already released"."""
    before = {str(app): (app, _head(app)), str(cwd): (cwd, _head(cwd))}
    brought: list[str] = []
    all_on_main = True

    def undo() -> None:
        for repo, sha in before.values():
            _run(["merge", "--abort"], repo, check=False)
            _run(["reset", "--hard", "-q", sha], repo)

    for kind, repo, label in (("app", app, "isabi-app"), ("site", cwd, "isabi")):
        part = entry.get(kind) or {}
        sha = part.get("sha")
        if not sha:
            continue
        branch = part.get("branch", "")
        fetch_key = (str(repo), branch)
        if fetched_branches is None or fetch_key not in fetched_branches or not _known_commit(repo, sha):
            _run(["fetch", "--no-tags", "--quiet", RL.REMOTE, f"+refs/heads/{branch}:refs/remotes/{RL.REMOTE}/{branch}"], repo,
                 check=False, timeout=180)
            if fetched_branches is not None:
                fetched_branches.add(fetch_key)
        if not _known_commit(repo, sha):
            undo()
            return False, f"{label} {branch} no longer has {sha[:7]} on {RL.REMOTE} (rewritten or deleted since it joined)", [], False
        if RL._in(repo, sha, f"{RL.REMOTE}/main"):
            continue
        all_on_main = False
        if RL._in(repo, sha, "HEAD"):
            continue
        if kind == "app":
            commit = _normalised_app_commit(app, sha, base_ver)
        else:
            commit, own_app = _normalised_site_commit(cwd, sha)
            if own_app:
                notes.append(f"{entry['id']}: isabi {branch} also changed app/; ignored (app/ is rebuilt from isabi-app by sync_app.py)")
        msg = f"batch: {str(entry.get('summary', ''))[:140]} ({entry.get('holder', '?')}; {branch} {sha[:7]})"
        r = _run(["merge", "--no-ff", "--no-edit", "-q", "-m", msg, commit], repo, check=False, env_extra=_ident_env(repo))
        if r.returncode != 0:
            files = [f for f in _out(["diff", "--name-only", "--diff-filter=U"], repo, check=False).splitlines() if f.strip()]
            detail = (", ".join(files[:6]) + (", ..." if len(files) > 6 else "")) if files else \
                (r.stderr or r.stdout).decode("utf-8", errors="replace").strip()[:200]
            undo()
            return False, f"does not merge cleanly with main plus the changes ahead of it in the batch ({label}: {detail})", [], False
        brought.append(kind)
    return True, "", brought, all_on_main


def _bump(app: Path, ver: str, count: int) -> None:
    changed = []
    for f in APP_STAMP_FILES:
        p = app / f
        if not p.is_file():
            continue
        data = p.read_bytes()
        new = restamp(data, ver)
        if new != data:
            p.write_bytes(new)
            changed.append(f)
    if not changed or shell_ver_of((app / "sw.js").read_bytes()) != ver:
        raise BatchError(f"could not stamp shell v{ver} in {app} (sw.js, index.html, manifest.json)")
    _run(["add", "--", *changed], app)
    _run(["commit", "-q", "-m", f"v{ver}: shell version (batch of {count})"], app, env_extra=_ident_env(app))


def _batch_branch(lock: dict) -> str:
    return f"release/batch-{lock['lockId'][:8]}"


def _assemble(cwd: Path, app: Path, lock: dict, holder: str, cands: list[dict], ver: str, *,
              exclude: dict[str, tuple[dict, str]] | None = None) -> dict:
    """Check out the batch branch at origin/main in both worktrees and merge the candidates in line order.
    `exclude` = {entry id: (entry, why)} already left out by the caller (drop): never merged, and anything built on
    top of them is left out with them."""
    branch = _batch_branch(lock)
    # app/ in isabi is sync_app.py output. Files it copied for an earlier or dropped batch are untracked, survive a
    # checkout or reset, and the deploy stages app/ from disk: clear them (ignored seed files are kept).
    _run(["clean", "-fdq", "--", SITE_GENERATED_DIR], cwd)
    for repo in (cwd, app):
        RL._fetch_main(repo)
        _run(["checkout", "-q", "--no-track", "-B", branch, f"{RL.REMOTE}/main"], repo)
    base_ver = shell_ver_of(_blob(app, "HEAD:sw.js"))
    if not base_ver:
        raise BatchError(f"cannot read the shell version of isabi-app origin/main ({app}/sw.js)")
    left: list[dict] = []
    notes: list[str] = []
    stamp = {"lockId": lock["lockId"], "holder": holder, "version": ver, "at": RL._iso(RL._now())}
    live: list[dict] = []  # the entries stamped as in this batch, in line order
    for e in cands:
        cur = _set_fields(cwd, e["id"], {"batch": stamp}, only_if=lambda x: x.get("state") == "waiting")
        if cur is None:
            left.append({"id": e["id"], "holder": e.get("holder"), "summary": e.get("summary"),
                         "why": "it changed or was withdrawn while the batch was forming (still in line if it exists)"})
            continue
        live.append(cur)
    # Left out: id -> (entry, why). `exclude` = left out by the caller already (drop), not merged and not marked here.
    out: dict[str, tuple[dict, str]] = dict(exclude or {})
    given = set(out)
    shipped: set[str] = set()
    repos = {"app": app, "site": cwd}
    # Commits that must not ship: every part of every change that is left out, in this batch or in an earlier one
    # (its entry in the line still says left_out). (kind, commit) -> (entry id, summary, why it was left out).
    blocked: dict[tuple[str, str], tuple[str, str, str]] = {}

    def block(x: dict, why: str) -> None:
        for kind in repos:
            sha = (x.get(kind) or {}).get("sha")
            if sha:
                blocked.setdefault((kind, sha), (x["id"], str(x.get("summary") or ""), why))

    def in_batch_only(kind: str, sha: str, ref: str) -> bool:
        """Is this commit contained in `ref` without being on main (where it would be released already)?"""
        repo = repos[kind]
        return _known_commit(repo, sha) and not RL._in(repo, sha, f"{RL.REMOTE}/main") and RL._in(repo, sha, ref)

    def built_on(m: dict) -> tuple[str, str, str] | None:
        """The left-out change whose commits this change's branches contain, if any (m's branches were fetched by
        _merge_entry, so every ancestor of them is known here)."""
        for (kind, sha), who in blocked.items():
            msha = (m.get(kind) or {}).get("sha")
            if msha and who[0] != m["id"] and in_batch_only(kind, sha, msha):
                return who
        return None

    in_this_batch = {c["id"] for c in cands}
    for x in read_line(cwd):
        if x.get("state") == "left_out":
            block(x, str(x.get("note") or "left out of an earlier batch"))
        elif x.get("state") == "waiting" and _is_stale(x) and x["id"] not in in_this_batch:
            # Skipped because its session has gone quiet: it must not ship behind that session's back through a
            # change built on top of it either. Never a member of this batch: it was fresh when the batch formed,
            # and the hours its gates take must not turn a later drop into the loss of the whole batch.
            block(x, f"no sign of its session ({x.get('holder', '?')}) for {STALE_AFTER_MIN // 60} h")
    for x, why in out.values():
        block(x, why)
    fetched_branches: set[tuple[str, str]] = set()
    while True:
        # One pass builds the batch from origin/main without everything left out so far. A change left out may have
        # commits in the batch through a change built on top of it (on either of its halves, in this batch or a
        # later one): that change is left out too and the batch is built again, so nothing of a left-out change
        # ever ships through another. Exclusions only grow, so this ends.
        for repo in (cwd, app):
            _run(["checkout", "-q", "--no-track", "-B", branch, f"{RL.REMOTE}/main"], repo)
        merged: list[dict] = []
        pass_notes: list[str] = []
        bump = False
        for cur in live:
            if cur["id"] in out or cur["id"] in shipped:
                continue
            ok, why, brought, all_on_main = _merge_entry(cwd, app, cur, base_ver, pass_notes, fetched_branches=fetched_branches)
            if ok and all_on_main:
                # A leader pushed it to main and never ran done. With evidence that it is live it is marked shipped
                # and not released again; without, it stays in this batch, so this release takes it live.
                live_ok, bar = _live_evidence(cwd, cur, (lock.get("tookOverFrom") or {}).get("deployed") or [])
                if live_ok:
                    _set_fields(cwd, cur["id"], {"state": "shipped", "shippedVersion": bar, "shippedAt": RL._iso(RL._now()),
                                                 "shippedBy": "an earlier release", "batch": None})
                    notes.append(f"{cur['id']} ({cur.get('summary')}) is already on main and live: marked shipped, not released again")
                    shipped.add(cur["id"])
                    continue
                pass_notes.append(f"{cur['id']} ({cur.get('summary')}) is on main but there is no sign it went live: it "
                                  "stays in this batch, which takes it live")
                merged.append(cur)
                bump = bump or bool((cur.get("app") or {}).get("sha"))
            elif ok:
                merged.append(cur)
                bump = bump or "app" in brought
            else:
                out[cur["id"]] = (cur, why)
                block(cur, why)
        grew = False
        for m in live:
            if m["id"] in out or m["id"] in shipped:
                continue
            who = built_on(m)
            if who:
                why = (f"it is built on top of {who[0]} ({who[1]}), which is not shipping: {who[2]}. Rebase it without "
                       "those commits, or join again once that change has shipped or its own session has rejoined it "
                       "with the fix (only that session clears its entry)")
                out[m["id"]] = (m, why)
                block(m, why)
                grew = True
        if not grew:
            break
    for (kind, sha), who in blocked.items():  # the invariant, checked on what was actually built
        if in_batch_only(kind, sha, "HEAD"):
            raise BatchError(f"{who[0]} was left out but its commit {sha[:7]} is still in the batch; not building a batch "
                             "that ships it.")
    notes += pass_notes
    for xid, (x, why) in out.items():
        if xid in given:
            continue
        if _set_fields(cwd, xid, {"state": "left_out", "note": why, "leftOutBy": holder,
                                  "leftOutAt": RL._iso(RL._now()), "batch": None}) is None:
            notes.append(f"{xid}: could not write the left-out mark (it changed on the remote); tell {x.get('holder')}")
        left.append({"id": xid, "holder": x.get("holder"), "summary": x.get("summary"), "why": why})
    shell = ""
    if bump:
        _bump(app, ver, len(merged))
        shell = ver
    return {
        "lockId": lock["lockId"], "holder": holder, "branch": branch, "version": ver, "shell": shell,
        "base": {"app": _out(["rev-parse", f"{RL.REMOTE}/main"], app), "site": _out(["rev-parse", f"{RL.REMOTE}/main"], cwd)},
        "entries": [_pub(e) for e in merged], "left_out": left, "notes": notes,
    }


def _unmark(cwd: Path, lock_id: str) -> None:
    """Every entry marked as in this lock's batch goes back to plain waiting."""
    for e in read_line(cwd):
        if e.get("state") == "waiting" and (e.get("batch") or {}).get("lockId") == lock_id:
            _set_fields(cwd, e["id"], {"batch": None}, only_if=lambda x: (x.get("batch") or {}).get("lockId") == lock_id)


def _give_up(cwd: Path, lock_id: str) -> bool:
    """A batch that could not be formed: unmark its entries and free the lock, each on its own, so a failure of one
    never leaves the lock held. False when the lock could not be released (the batch file stays, so abort works)."""
    try:
        _unmark(cwd, lock_id)
    except RL.LockError as exc:
        print(f"WARN: could not unmark the line ({str(exc).splitlines()[0]}); the marks go stale with the lock.", file=sys.stderr)
    try:
        RL.release(cwd, quiet=True)
    except RL.LockError as exc:
        print(f"WARN: the release lock is still held ({str(exc).splitlines()[0]}). Run: python build/release_batch.py abort",
              file=sys.stderr)
        return False
    _reset_batch_worktrees(cwd, f"release/batch-{lock_id[:8]}")
    _write_local_json(cwd, BATCH_FILE, None)
    return True


def _reset_batch_worktrees(cwd: Path, branch: str) -> None:
    """Put the batch branch back to a clean state in both worktrees: a half-built batch, and what sync_app.py wrote
    for it (tracked edits and new files in isabi/app), must not ride along into the session's own branch or its next
    release. Only where the batch branch is checked out: that branch is this tool's own."""
    try:
        pair = (cwd, app_root(cwd))
    except RL.LockError:
        pair = (cwd,)
    for repo in pair:
        if branch and _out(["branch", "--show-current"], repo, check=False) == branch:
            _run(["merge", "--abort"], repo, check=False)
            _run(["reset", "--hard", "-q"], repo, check=False)
            if repo == cwd:
                _run(["clean", "-fdq", "--", SITE_GENERATED_DIR], cwd, check=False)


def batch_cap(asked: int | None = None, waiting: int = 0) -> int:
    """How many changes one batch takes at most: `asked` (take/ship --max), else ISABI_BATCH_MAX, else the limit that
    follows the line: MAX_BATCH_LONG while more than LONG_LINE_OVER changes wait (`waiting`), MAX_BATCH otherwise.
    0 = no limit."""
    if asked is None:
        raw = os.environ.get(MAX_BATCH_ENV, "").strip()
        if not raw:
            return MAX_BATCH_LONG if waiting > LONG_LINE_OVER else MAX_BATCH
        try:
            asked = int(raw)
        except ValueError:
            raise BatchError(f"{MAX_BATCH_ENV} must be a whole number (0 = no limit), not {raw!r}") from None
    if asked < 0:
        raise BatchError("the batch size limit must be 0 (no limit) or more")
    return asked


def _cap_text(waiting: int = 0) -> str:
    """For messages only: the limit in force with `waiting` changes in line (a bad ISABI_BATCH_MAX is reported by
    take, not here)."""
    try:
        cap = batch_cap(None, waiting)
    except BatchError:
        cap = MAX_BATCH
    return f"the first {cap}" if cap else "everything waiting"


def _pick_batch(cwd: Path, app: Path, waiting: list[dict], cap: int) -> tuple[list[dict], list[dict], list[str]]:
    """Owner rule 2026-11-25: release one or a few changes at a time. From the changes a leader could ship (`waiting`,
    in line order) pick this batch: the first `cap`. Returns (this batch, the changes that wait for the next one,
    notes), both lists in line order.
      - The leader's own change (joined from this worktree) is always in its batch: when it stands further back, it
        takes the last place, so a session never leads a batch that leaves its own change waiting.
      - A waiting change that shares unreleased commits with a picked one rides in the same batch, above the limit
        (a picked change built on top of it, or on an earlier push of it that it has since fixed, or both built on
        the same unreleased work): those commits ship with the picked change anyway, and a change must never go live
        in part, without its later fix, its gates or its entry being marked. Repeated until nothing more rides."""
    if cap <= 0 or len(waiting) <= cap:
        return list(waiting), [], []
    own = set(_local_json(cwd, JOINED_FILE))
    picked = {e["id"] for e in waiting[:cap]}
    if not picked & own:
        mine = next((e["id"] for e in waiting[cap:] if e["id"] in own), "")
        if mine:
            picked = {e["id"] for e in waiting[:cap - 1]} | {mine}
    repos = {"app": app, "site": cwd}
    for kind, repo in repos.items():  # every waiting branch, so each change's commits are known here
        _fetch_branches(repo, [(e.get(kind) or {}).get("branch", "") for e in waiting if (e.get(kind) or {}).get("sha")])
    seen: dict[tuple[str, str], frozenset[str]] = {}

    def unreleased(kind: str, sha: str) -> frozenset[str]:
        """The commits of `sha` that are not on main (none when the commit is not known here: _assemble says so)."""
        if (kind, sha) not in seen:
            r = _run(["rev-list", sha, "--not", f"{RL.REMOTE}/main"], repos[kind], check=False)
            seen[(kind, sha)] = (frozenset(r.stdout.decode("utf-8", errors="replace").split())
                                 if r.returncode == 0 else frozenset())
        return seen[(kind, sha)]

    def shares(a: dict, b: dict) -> bool:
        for kind in repos:
            sa, sb = (a.get(kind) or {}).get("sha"), (b.get(kind) or {}).get("sha")
            if sa and sb and unreleased(kind, sa) & unreleased(kind, sb):
                return True
        return False

    notes: list[str] = []
    grew = True
    while grew:
        grew = False
        for e in waiting:
            if e["id"] in picked:
                continue
            with_ = next((p for p in waiting if p["id"] in picked and shares(e, p)), None)
            if with_ is not None:
                picked.add(e["id"])
                grew = True
                notes.append(f"{e['id']} ({e.get('summary')}) rides in this batch above the limit of {cap}: it shares "
                             f"unreleased commits with {with_['id']} ({with_.get('summary')}), so the two ship together")
    return ([e for e in waiting if e["id"] in picked], [e for e in waiting if e["id"] not in picked], notes)


def _fetch_branches(repo: Path, branches: list[str]) -> None:
    """Fetch several branches of `origin` in one go. A branch that is gone fails the whole fetch: then one by one
    (what is still missing after that is reported by _assemble, which names the branch)."""
    specs = [f"+refs/heads/{b}:refs/remotes/{RL.REMOTE}/{b}" for b in sorted({b for b in branches if b})]
    if not specs:
        return
    if _run(["fetch", "--no-tags", "--quiet", RL.REMOTE, *specs], repo, check=False, timeout=240).returncode != 0:
        for spec in specs:
            _run(["fetch", "--no-tags", "--quiet", RL.REMOTE, spec], repo, check=False, timeout=180)


def take(cwd: Path = ISABI_ROOT, *, holder: str, version: str = "", ttl_min: int = RL.DEFAULT_TTL_MIN,
         quiet: bool = False, max_changes: int | None = None) -> dict:
    """Lead a batch: take the release lock and merge the first changes waiting in the line, at most batch_cap() of
    them (see _pick_batch); the rest stay in line for the next batch. Raises RL.LockError (not a BatchError) when
    another session holds the lock."""
    holder = holder.strip()
    if not holder:
        raise BatchError("--holder is needed (who is releasing)")
    batch_cap(max_changes)  # a bad limit stops here; the limit itself is set under the lock, from the line as it is then
    app = app_root(cwd)
    old = _local_json(cwd, BATCH_FILE)
    if old:
        lock_sha, lock = RL.read_remote_lock(cwd)
        if lock_sha and RL.held_by_me(lock, cwd) and lock.get("lockId") == old.get("lockId"):
            if old.get("forming"):
                raise BatchError("a batch is forming here, or was left half-formed, and holds the release lock. If another "
                                 "take or ship is still running in this worktree, let it finish; if not, run abort, then "
                                 "take again.")
            raise BatchError(f"this worktree already leads batch v{old.get('version')} ({len(old.get('entries') or [])} changes): "
                             "finish it (deploy, push, done) or give it up (abort).")
        _write_local_json(cwd, BATCH_FILE, None)  # a batch whose lock is gone
    _require_clean(cwd, "isabi")
    _require_clean(app, "isabi-app")
    if not _waiting(read_line(cwd)):
        if not quiet:
            print("Nothing is waiting in the line.")
        return {"entries": [], "left_out": [], "notes": [], "version": "", "shell": ""}
    lock = RL.acquire(cwd, holder=holder, purpose="batch release", ttl_min=ttl_min, quiet=True)
    # Written before anything can fail, so `abort` can always free a lock this command took. Created exclusively:
    # acquire is re-entrant for this worktree, so a second take or ship started here at the same moment gets the
    # same lock, and only one of the two may go on to build the batch.
    stub = {"lockId": lock["lockId"], "holder": holder, "branch": _batch_branch(lock), "version": "", "shell": "",
            "entries": [], "left_out": [], "notes": [], "forming": True, "pid": os.getpid(), "host": socket.gethostname()}
    try:
        with open(RL.git_dir(cwd) / BATCH_FILE, "x", encoding="utf-8") as fh:
            fh.write(json.dumps(stub, ensure_ascii=False, indent=1) + "\n")
    except FileExistsError:
        raise BatchError("another take or ship is already forming a batch in this worktree; let it finish (the lock is "
                         "its).") from None
    try:
        line = read_line(cwd)  # the line as it is under the lock
        for repo in (cwd, app):
            RL._fetch_main(repo)
        fresh = _waiting(line)
        cap = batch_cap(max_changes, len(fresh))
        cands, later, pick_notes = _pick_batch(cwd, app, fresh, cap)
        ver = batch_version(cwd, app, version)
        batch = _assemble(cwd, app, lock, holder, cands, ver)
        batch["notes"] += pick_notes
        if max_changes is None and not os.environ.get(MAX_BATCH_ENV, "").strip() and cap == MAX_BATCH_LONG != MAX_BATCH:
            batch["notes"].append(f"the line is long ({len(fresh)} changes waiting, more than {LONG_LINE_OVER}): this batch "
                                  f"takes up to {cap}, not {MAX_BATCH}")
        batch["notes"] += [f"{e['id']} ({e.get('summary')}; {e.get('holder')}) skipped: no sign of its session for "
                           f"{STALE_AFTER_MIN // 60} h; it ships when that session joins again"
                           for e in line if e.get("state") == "waiting" and _is_stale(e)]
        batch["later"] = [{"id": e["id"], "holder": e.get("holder"), "summary": e.get("summary")} for e in later]
        batch["cap"] = cap
    except BaseException:
        _give_up(cwd, lock["lockId"])
        raise
    if not batch["entries"]:
        _give_up(cwd, lock["lockId"])
        if not quiet:
            _print_batch(cwd, app, batch)
            print("Nothing to release: the release lock is free again.")
        return batch
    RL.renew(cwd, ttl_min=ttl_min, quiet=True, extra={
        "version": f"v{batch['shell']}" if batch["shell"] else "no shell change",
        "purpose": f"batch release of {len(batch['entries'])}", "batch": [e["id"] for e in batch["entries"]]})
    _write_local_json(cwd, BATCH_FILE, batch)
    if not quiet:
        _print_batch(cwd, app, batch)
    return batch


def _print_batch(cwd: Path, app: Path, batch: dict) -> None:
    n, shell = len(batch["entries"]), batch.get("shell")
    print(f"Batch {('v' + shell) if shell else '(no shell change)'}: {n} change{'s' if n != 1 else ''}"
          f"{', ' + str(len(batch['left_out'])) + ' left out' if batch['left_out'] else ''} on branch {batch.get('branch', '?')}")
    for i, e in enumerate(batch["entries"], 1):
        print(f"  {i}. {e.get('summary')} ({e.get('holder')}; {_parts_text(e)}) [{e['id']}]")
    for x in batch["left_out"]:
        print(f"  left out: {x.get('summary')} ({x.get('holder')}) [{x['id']}]: {x['why']}")
    for note in batch.get("notes") or []:
        print(f"  NOTE: {note}")
    later = batch.get("later") or []
    if later:
        print(f"  {len(later)} more waiting: they ship in the next batch{'es' if len(later) > (batch.get('cap') or 0) else ''} "
              f"(at most {batch.get('cap')} changes per batch), in line order, next: "
              + "; ".join(f"{x.get('summary')} ({x.get('holder')})" for x in later[:3]))
    gates =[(e["id"], g) for e in batch["entries"] for g in e.get("gates") or []]
    if not n:
        return
    if gates:
        print("Gates named by the changes (run each on this batch):")
        for eid, g in gates:
            print(f"  {g}    [{eid}]")
    print("Next, the usual release steps on this batch:")
    print(f"  1. gates above plus the browser gates the changes need (isabi-app: {app})")
    print(f"  2. in {cwd}: python build/sync_app.py, commit, then deploy from this PC:")
    print("       python build/deploy_cloudflare.py --pages-only")
    print("     (sync_app.py also runs the screen speed gate, side by side with origin/main: up to 20 min when screen code"
          " changed; --skip-release-gates does not skip it)")
    print("     This PC makes it live. GitHub Actions no longer deploys on a push to main (owner 2026-11-26): do not push"
          " first and wait for a run. A batch that also carries new private seeds: the full python build/deploy_cloudflare.py"
          " (it uploads them), from a checkout that has them.")
    print("  3. push main: isabi-app (git push origin HEAD:main), then isabi (git push origin HEAD:main)")
    print("  4. python build/release_batch.py done")
    print("  Or all four as one command (it stops at the first failure with the lock held): python build/release_batch.py lead")
    print('  A gate fails: python build/release_batch.py drop <entry> --reason "<gate>" --reset, then gate again.')
    print("  The lock lasts 60 minutes from here (each deploy renews it). Gates running long: python build/release_lock.py renew")


def _leading(cwd: Path) -> tuple[dict, dict]:
    """(batch, lock) when this worktree leads a batch and still holds its lock; raises otherwise."""
    batch = _local_json(cwd, BATCH_FILE)
    if not batch:
        raise BatchError("this worktree does not lead a batch (take or ship starts one).")
    if batch.get("forming"):
        raise BatchError("the batch here was left half-formed: run abort (it frees the lock), then take again.")
    lock_sha, lock = RL.read_remote_lock(cwd)
    if not lock_sha or not RL.held_by_me(lock, cwd) or lock.get("lockId") != batch.get("lockId"):
        raise BatchError(f"the release lock is no longer this batch's ({RL.describe(lock) if lock_sha else 'nobody holds it'}): "
                         "do not deploy or push this batch. Run abort here; the changes are still in the line.")
    return batch, lock


def drop(cwd: Path, entry_id: str, *, reason: str, reset: bool = False, quiet: bool = False) -> dict:
    """Owner rule 2: leave out the change that broke the combined gates and rebuild the batch without it."""
    reason = " ".join(reason.split())
    if not reason:
        raise BatchError("--reason is needed (which gate failed): the change's session reads it")
    batch, lock = _leading(cwd)
    app = app_root(cwd)
    hit = _find([dict(e, _ref="", _sha="") for e in batch["entries"]], entry_id)
    if not hit:
        raise BatchError(f"{entry_id} is not in this batch ({', '.join(e['id'] for e in batch['entries'])})")
    if RL.last_deploy(lock):
        raise BatchError("this batch is already live (a deploy is recorded in the lock): fix forward and ship, or redeploy "
                         "main; a change cannot be dropped from a live batch.")
    for repo, label in ((cwd, "isabi"), (app, "isabi-app")):
        if _dirty(repo) and not reset:
            raise BatchError(f"{label} worktree {repo} has uncommitted changes (sync_app.py output?). The rebuild starts again "
                             "from origin/main: pass --reset to discard them and any commit made on the batch branch.")
    in_line = next((e for e in read_line(cwd) if e["id"] == hit["id"]), None)
    if in_line and in_line.get("state") == "waiting":
        # Must be written before the rebuild: an entry still marked waiting would be led, or shipped, by its session.
        if _set_fields(cwd, hit["id"], {"state": "left_out", "note": f"gates failed in the batch: {reason}",
                                        "leftOutBy": batch["holder"], "leftOutAt": RL._iso(RL._now()), "batch": None},
                       only_if=lambda x: x.get("state") == "waiting") is None:
            raise BatchError(f"could not mark {hit['id']} as left out (it kept changing on the remote). Nothing was rebuilt: "
                             "run status, then drop again.")
    keep = [e["id"] for e in batch["entries"] if e["id"] != hit["id"]]
    cands = [e for e in read_line(cwd) if e["id"] in keep and e.get("state") == "waiting"]
    for repo in (cwd, app):
        _run(["merge", "--abort"], repo, check=False)
        _run(["reset", "--hard", "-q"], repo)
    # A change built on top of the dropped one carries its commits: _assemble leaves it out with it.
    try:
        new = _assemble(cwd, app, lock, batch["holder"], cands, batch["version"],
                        exclude={hit["id"]: (hit, f"gates failed in the batch: {reason}")})
    except BaseException:
        # Never leave a batch record that still lists the dropped change with the lock held: give the batch up
        # (the remaining changes go back to waiting; the dropped one stays left out).
        _give_up(cwd, batch["lockId"])
        raise
    new["left_out"] = [*batch.get("left_out", []), {"id": hit["id"], "holder": hit.get("holder"), "summary": hit.get("summary"),
                                                      "why": f"gates failed in the batch: {reason}"}, *new["left_out"]]
    if not new["entries"]:
        _give_up(cwd, batch["lockId"])
        if not quiet:
            _print_batch(cwd, app, new)
            print("Nothing left in the batch: the release lock is free again.")
        return new
    RL.renew(cwd, quiet=True, extra={"version": f"v{new['shell']}" if new["shell"] else "no shell change",
                                     "purpose": f"batch release of {len(new['entries'])}", "batch": [e["id"] for e in new["entries"]]})
    _write_local_json(cwd, BATCH_FILE, new)
    if not quiet:
        _print_batch(cwd, app, new)
    return new


def done(cwd: Path = ISABI_ROOT, *, quiet: bool = False) -> dict:
    """After deploy and push of both mains: remove the shipped entries from the line, then give the lock back."""
    batch, lock = _leading(cwd)
    app = app_root(cwd)
    for repo in (cwd, app):
        RL._fetch_main(repo)
    missing = []
    for e in batch["entries"]:
        for kind, repo, label in (("app", app, "isabi-app"), ("site", cwd, "isabi")):
            sha = (e.get(kind) or {}).get("sha")
            if sha and not RL._in(repo, sha, f"{RL.REMOTE}/main"):
                missing.append(f"{label} {sha[:7]} ({e.get('summary')})")
    if batch.get("shell"):
        main_ver = shell_ver_of(_blob(app, f"{RL.REMOTE}/main:sw.js"))
        if not main_ver or _vt(main_ver) < _vt(batch["shell"]):
            missing.append(f"isabi-app main is at shell v{main_ver or '?'}, not v{batch['shell']}")
        site_ver = shell_ver_of(_blob(cwd, f"{RL.REMOTE}/main:app/sw.js"))
        if not site_ver or _vt(site_ver) < _vt(batch["shell"]):
            missing.append(f"isabi main carries shell v{site_ver or '?'}, not v{batch['shell']} (sync_app.py + commit + push)")
    if missing:
        raise BatchError("not on origin/main yet: " + "; ".join(missing) + ". Push isabi-app, then isabi "
                         "(git push origin HEAD:main), then run done again. The lock stays held.")
    # On main is not live. The sessions waiting on this batch are told "shipped" on the strength of these checks.
    last = RL.last_deploy(lock)
    site_tip = _out(["rev-parse", f"{RL.REMOTE}/main"], cwd)
    if not last:
        raise BatchError("the batch is on main but no deploy is recorded under this lock, so nothing says it went live "
                         "(GitHub Actions no longer deploys on a push to main). Deploy it from this PC "
                         "(python build/deploy_cloudflare.py --pages-only), then run done again. The lock stays held.")
    if last["sha"] != site_tip:
        raise BatchError(f"the last deploy under this lock is {last['sha'][:7]} but isabi origin/main is {site_tip[:7]}: what "
                         "is live is not what is on main. Deploy the commit that is on main, then run done again.")
    shell = batch.get("shell") or ""
    if shell:
        live = live_shell_version()
        if live != shell:
            raise BatchError(f"live serves shell v{live or '?'}, not v{shell}: the deploy has not gone live. Check the deploy "
                             "(release_lock.py status), then run done again. The lock stays held.")
    ids = [e["id"] for e in batch["entries"]]
    for eid in ids:
        _set_fields(cwd, eid, {"state": "shipped", "shippedVersion": shell, "shippedAt": RL._iso(RL._now()),
                               "shippedBy": batch["holder"], "batch": None},
                    only_if=lambda x: (x.get("batch") or {}).get("lockId") == batch["lockId"])
    _prune(cwd, batch["lockId"])
    RL.release(cwd, quiet=True)
    _write_local_json(cwd, BATCH_FILE, None)
    if not quiet:
        print(f"Batch {('v' + shell) if shell else '(no shell change)'} shipped: {len(ids)} change{'s' if len(ids) != 1 else ''}; "
              "the release lock is free.")
        for e in batch["entries"]:
            print(f"  - {e.get('summary')} ({e.get('holder')}; {_parts_text(e)})")
        for x in batch.get("left_out") or []:
            print(f"  left out, still to ship: {x.get('summary')} ({x.get('holder')}): {x['why']}")
        print("Write ONE release log entry for this version, naming each change above.")
    return batch


def abort(cwd: Path = ISABI_ROOT, *, quiet: bool = False) -> None:
    """Give a batch up before it is live: its changes go back to waiting and the lock is released."""
    batch = _local_json(cwd, BATCH_FILE)
    if not batch:
        raise BatchError("this worktree does not lead a batch.")
    lock_sha, lock = RL.read_remote_lock(cwd)
    mine = bool(lock_sha) and RL.held_by_me(lock, cwd) and lock.get("lockId") == batch.get("lockId")
    if mine and RL.unpushed_deploys(lock, cwd):
        raise BatchError("this batch is live and not on main: it cannot be given up. Push it to main and run done, or "
                         "deploy origin/main again and release the lock by hand (release_lock.py release --force).")
    if mine:
        try:
            _unmark(cwd, batch["lockId"])
        except RL.LockError as exc:
            print(f"WARN: could not unmark the line ({str(exc).splitlines()[0]}); the marks go stale with the lock.", file=sys.stderr)
        RL.release(cwd, quiet=True)
    _reset_batch_worktrees(cwd, batch.get("branch") or "")  # whoever holds the lock now: the files here are this batch's
    _write_local_json(cwd, BATCH_FILE, None)
    if not quiet:
        print("Batch given up: its changes are back in the line" + (" and the release lock is free." if mine else
              " (the lock was already someone else's; nothing else changed)."))
        print(f"This worktree and its isabi-app are still on {batch.get('branch')}: check out your own branch again.")


def ship(cwd: Path = ISABI_ROOT, *, holder: str, summary: str, app_branch: str = "", site_branch: str = "",
         gates: tuple[str, ...] | list[str] = (), version: str = "", wait_s: int = DEFAULT_WAIT_S, poll_s: int = POLL_S,
         quiet: bool = False, force: bool = False, max_changes: int | None = None) -> tuple[str, str, dict | None]:
    """Join the line, then lead the batch when nothing is releasing, or wait for the batch this change goes out in.
    Returns (state, message, the batch when LEADER). States: LEADER (this worktree holds the lock: run the release
    steps), SHIPPED (live), LEFT_OUT, GONE, WAITING (run again), TURN (too little time left to form the batch here:
    run take), HALF_FORMED (a take here was cut off: run abort)."""
    batch_cap(max_changes)  # a bad limit stops here, before the change joins the line
    app = app_root(cwd)
    # First of all: is the release already this worktree's own? (Its tree is then on the batch branch, maybe with
    # sync_app.py output in it, and must not be asked to be clean.)
    own = _own_batch(cwd, *RL.read_remote_lock(cwd))
    if own:
        return own[0], own[1], (_local_json(cwd, BATCH_FILE) or None) if own[0] == "LEADER" else None
    _require_clean(cwd, "isabi")
    _require_clean(app, "isabi-app")
    entry = join(cwd, holder=holder, summary=summary, app_branch=app_branch, site_branch=site_branch, gates=gates, quiet=quiet,
                 force=force)
    started = _mono()
    deadline = started + max(0, wait_s)
    while True:
        left = max(0, int(deadline - _mono()))
        state, msg = wait(cwd, entry["id"], wait_s=left, poll_s=poll_s, known=entry, quiet=quiet)
        if state == "LEADER":
            return state, msg, _local_json(cwd, BATCH_FILE) or None
        if state != "TURN":
            return state, msg, None
        if _mono() - started > 60 and deadline - _mono() < TAKE_BUDGET_S:
            # Forming a batch takes minutes on a loaded PC. Starting it at the end of a long wait risks the command
            # being cut off with the lock held: hand the turn back to the session to run take on its own clock.
            return "TURN", msg + " Too little of this command's time is left to form the batch safely.", None
        try:
            batch = take(cwd, holder=holder, version=version, quiet=quiet, max_changes=max_changes)
        except BatchError:
            raise
        except RL.LockError as exc:  # another waiter took the lock first, or an expired lock cannot be taken yet
            if not quiet:
                print(str(exc).splitlines()[0], flush=True)
            if _mono() >= deadline:
                return "WAITING", _offline_hint(str(exc).splitlines()[0], str(exc), entry["id"]), None
            time.sleep(max(0, poll_s))
            continue
        if batch["entries"]:
            mine = any(e["id"] == entry["id"] for e in batch["entries"])
            note = "" if mine else (" Your own change was left out (see above); the lock is yours, so ship the others, "
                                    "then fix yours and join again.")
            shell = batch.get("shell")
            return "LEADER", (f"you lead batch {('v' + shell) if shell else '(no shell change)'} with "
                              f"{len(batch['entries'])} change{'s' if len(batch['entries']) != 1 else ''}.{note}"), batch
        if _mono() >= deadline:  # nothing merged (this entry was left out): the next poll says why
            try:
                state, msg, _free = poll_once(cwd, entry["id"], known=entry)
            except RL.LockError as exc:
                if not _is_net_error(str(exc)):
                    raise
                return "WAITING", _offline_hint(str(exc).splitlines()[0], str(exc), entry["id"]), None
            return ("WAITING" if state in ("TURN", "IN_BATCH") else state), msg, None


# ---------------------------------------------------------------------------------------- lead: one batch, one command

# A leader used to type the release steps one by one (named gates, the main suite, sync_app.py, commit, deploy, two
# pushes, done) and every session learned them again; between two steps, and between two batches, the lock sat held or
# free with nothing running (2026-11-26: free from 01:01 to 01:21 with more than 20 changes in line). `lead` runs the
# steps in order for the batch this worktree leads (taking one first when it leads none) and stops at the first
# failure with the lock held, so the leader decides: fix, or drop the change that broke it, then `lead` again. What
# passed is remembered while the batch stays the same (same lock, same changes, same commits), so the second run
# carries on where the first stopped. Nothing here decides which change is at fault: that stays with the session.
LEAD_STEPS = ("gates", "main", "sync", "commit", "deploy", "push", "done")
LEAD_FROM = ("gates", "main", "sync", "deploy", "push")   # lead --from: the steps before it were done by hand
_GATE_SCRIPT_RE = re.compile(r"^build/[A-Za-z0-9_./-]+\.(?:mjs|cjs|js|py)$")
_TEXT_SUFFIXES = (".js", ".mjs", ".html", ".css", ".json", ".svg", ".txt", ".webmanifest", ".xml", ".md")


def _gate_command(gate: str, cwd: Path, app: Path) -> tuple[Path, list[str]]:
    """Where and how a gate named by a change runs: "isabi-app: node build/verify_x.mjs [args]" or "isabi: python
    build/verify_y.py [args]". Only a node or python script under build/ that is in the batch is run from here: the
    text comes from the line, written by another session."""
    where, sep, cmd = gate.partition(":")
    where = where.strip().lower()
    if not sep or where not in ("isabi-app", "mfg-web", "isabi"):
        raise BatchError(f'gate {gate!r} does not say where it runs ("isabi-app: ..." or "isabi: ...")')
    repo = cwd if where == "isabi" else app
    try:
        argv = shlex.split(cmd.strip())
    except ValueError:
        raise BatchError(f"gate {gate!r} cannot be read as a command") from None
    if len(argv) < 2 or argv[0] not in ("node", "python", "python3", "py"):
        raise BatchError(f"gate {gate!r} is not `node build/<file>` or `python build/<file>`: run it by hand on this batch, "
                         "then lead --from main")
    script = argv[1].replace("\\", "/")
    if not _GATE_SCRIPT_RE.match(script) or ".." in script:
        raise BatchError(f"gate {gate!r} does not name a script under build/: run it by hand on this batch, then lead --from main")
    if not (repo / script).is_file():
        raise BatchError(f"gate {gate!r}: {script} is not in this batch ({repo})")
    return repo, [("node" if argv[0] == "node" else sys.executable), script, *argv[2:]]


def _lead_units(cwd: Path, app: Path, batch: dict) -> list[dict]:
    """Every command of the release, in order. `retry`: a gate that failed runs again (a loaded PC times a browser
    gate out now and then); nothing after the gates is ever repeated by itself."""
    units: list[dict] = []
    seen: set[str] = set()
    for e in batch["entries"]:
        for g in e.get("gates") or []:
            g = " ".join(str(g).split())
            if g and g not in seen:
                seen.add(g)
                units.append({"step": "gates", "key": f"gates:{g}", "label": g, "gate": g, "entry": e, "retry": True, "timeout": 3600})
    if batch.get("shell"):  # a Command Center change: the main regression suite, desktop then mobile, never in parallel
        units += [
            {"step": "main", "key": "main:desktop", "label": "node build/verify_mfg.mjs", "cwd": app,
             "argv": ["node", "build/verify_mfg.mjs"], "retry": True, "timeout": 5400},
            {"step": "main", "key": "main:mobile", "label": "node build/verify_mfg.mjs --mobile", "cwd": app,
             "argv": ["node", "build/verify_mfg.mjs", "--mobile"], "retry": True, "timeout": 5400},
            {"step": "main", "key": "main:boot", "label": "node build/verify_boot_saved_scope.mjs", "cwd": app,
             "argv": ["node", "build/verify_boot_saved_scope.mjs"], "retry": True, "timeout": 1800},
        ]
    units += [
        {"step": "sync", "key": "sync", "label": "python build/sync_app.py (release gates, then the speed gate)", "cwd": cwd,
         "argv": [sys.executable, "build/sync_app.py"], "timeout": 6000},
        {"step": "commit", "key": "commit", "label": "commit the synced bundle in isabi"},
        # deploy_cloudflare.py writes the deploy into the lock itself: no renewal from here while it runs.
        {"step": "deploy", "key": "deploy", "label": "python build/deploy_cloudflare.py --pages-only", "cwd": cwd,
         "argv": [sys.executable, "build/deploy_cloudflare.py", "--pages-only"], "timeout": 2400, "no_renew": True},
        {"step": "push", "key": "push:app", "label": "isabi-app: git push origin HEAD:main", "cwd": app,
         "argv": ["git", "push", "-q", RL.REMOTE, "HEAD:main"], "timeout": 600, "no_renew": True},
        {"step": "push", "key": "push:site", "label": "isabi: git push origin HEAD:main", "cwd": cwd,
         "argv": ["git", "push", "-q", RL.REMOTE, "HEAD:main"], "timeout": 600, "no_renew": True},
        {"step": "done", "key": "done", "label": "release_batch.py done"},
    ]
    return units


def _kill_tree(proc: subprocess.Popen) -> None:
    try:
        if os.name == "nt":
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True, timeout=30, check=False)
        else:
            proc.kill()
        proc.wait(timeout=30)
    except (OSError, subprocess.SubprocessError):
        pass


def _lead_exec(unit: dict, log: Path, env: dict, cwd: Path) -> int:
    """Run one command with its output in `log`. While it runs the release lock is renewed every LEAD_RENEW_S (a suite
    can wait 45 minutes for the PC's browser slot). Exit code; -9 = over its time limit, -2 = could not start."""
    try:
        with open(log, "w", encoding="utf-8", errors="replace") as fh:
            fh.write(f"$ {' '.join(unit['argv'])}    (in {unit['cwd']})\n")
            fh.flush()
            proc = subprocess.Popen(unit["argv"], cwd=str(unit["cwd"]), env=env, stdout=fh, stderr=subprocess.STDOUT,
                                    stdin=subprocess.DEVNULL)
            started = renewed = time.monotonic()
            while True:
                try:
                    return proc.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    pass
                if time.monotonic() - started > unit.get("timeout", 3600):
                    _kill_tree(proc)
                    fh.write(f"\n[lead] stopped: over its limit of {unit.get('timeout', 3600)} s\n")
                    return -9
                if not unit.get("no_renew") and time.monotonic() - renewed >= LEAD_RENEW_S:
                    renewed = time.monotonic()
                    try:
                        RL.renew(cwd, quiet=True)
                    except RL.LockError as exc:
                        fh.write(f"\n[lead] WARN: the release lock was not renewed: {str(exc).splitlines()[0]}\n")
                        fh.flush()
    except OSError as exc:
        try:
            log.write_text(f"could not start {unit['argv'][0]}: {exc}\n", encoding="utf-8")
        except OSError:
            pass
        return -2


def _lead_commit(cwd: Path, app: Path, batch: dict) -> tuple[bool, str]:
    """After sync_app.py: commit what it wrote in isabi (app/ and deployed_shell.js, nothing else), LF only."""
    left = _dirty(app)
    if left:
        return False, (f"isabi-app has uncommitted changes after sync_app.py ({', '.join(x[2:].strip() for x in left[:5])}): "
                       "not committing a bundle that differs from the batch")
    raw = _run(["status", "--porcelain"], cwd).stdout.decode("utf-8", errors="replace")
    paths = [ln[3:].strip().strip('"') for ln in raw.splitlines() if ln.strip()]
    outside = [f for f in paths if not (f.startswith(SITE_GENERATED_DIR + "/") or f == SITE_GENERATED_FILE)]
    if outside:
        return False, (f"sync_app.py left changes outside {SITE_GENERATED_DIR}/ and {SITE_GENERATED_FILE} "
                       f"({', '.join(outside[:5])}{', ...' if len(outside) > 5 else ''}): not committed")
    if not paths:
        return True, "nothing to commit (no Command Center change in this batch)"
    _run(["add", "-A", "--", *[f for f in (SITE_GENERATED_DIR, SITE_GENERATED_FILE) if any(x == f or x.startswith(f + "/") for x in paths)]],
         cwd)
    staged = [f for f in _run(["diff", "--cached", "--name-only", "-z"], cwd).stdout.decode("utf-8", errors="replace").split("\0") if f]
    crlf = [f for f in staged if f.lower().endswith(_TEXT_SUFFIXES) and b"\r\n" in (_blob(cwd, f":{f}") or b"")]
    if crlf:
        _run(["reset", "-q"], cwd, check=False)
        return False, (f"{len(crlf)} file(s) staged with CRLF line endings ({', '.join(crlf[:4])}): live would differ from main. "
                       "Not committed; fix the line endings of the checkout, then lead again")
    shell = batch.get("shell") or shell_ver_of(_blob(cwd, f":{SITE_GENERATED_DIR}/sw.js")) or "?"
    n = len(batch["entries"])
    what = "; ".join(" ".join(str(e.get("summary") or "").split())[:110] for e in batch["entries"])
    _run(["commit", "-q", "-m", f"v{shell}: sync Command Center bundle (batch of {n}: {what})"], cwd, env_extra=_ident_env(cwd),
         timeout=900)
    return True, f"{len(staged)} file(s) committed as v{shell}"


def _batch_log_path() -> Path:
    return Path(os.environ.get(BATCH_LOG_ENV, "").strip() or (Path.home() / ".theo" / "isabi-release-batches.log"))


def _log_batch(rec: dict) -> None:
    """One line per batch that went live (who, what, how long each step took), so "why is the line slow?" is read from
    a file, not rebuilt from session logs. Best effort."""
    try:
        p = _batch_log_path()
        p.parent.mkdir(parents=True, exist_ok=True)
        with open(p, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
    except OSError:
        pass


def _step_minutes(secs: dict) -> str:
    by: dict[str, float] = {}
    for key, v in secs.items():
        by[key.split(":")[0]] = by.get(key.split(":")[0], 0.0) + float(v)
    return ", ".join(f"{step} {by[step] / 60:.1f}" for step in LEAD_STEPS if step in by)


def lead(cwd: Path = ISABI_ROOT, *, holder: str = "", version: str = "", max_changes: int | None = None,
         from_step: str = "", retries: int = 1, quiet: bool = False) -> tuple[str, str]:
    """Lead one batch from start to finish. Returns (state, message):
    SHIPPED  the batch is live, on both mains, its entries are marked and the lock is free
    NOTHING  no change to release (nothing waiting, or everything was left out or is live already)
    BUSY     another session holds the release lock
    FAILED   a step failed; the lock is still held by this worktree: fix or drop, then lead again (or abort)"""
    result: dict = {}
    try:
        state, msg = _lead(cwd, holder=holder, version=version, max_changes=max_changes, from_step=from_step,
                           retries=max(0, retries), quiet=quiet, result=result)
    except RL.LockError as exc:
        result.update({"state": "ERROR", "message": str(exc)})
        raise
    finally:
        out = os.environ.get(LEAD_RESULT_ENV, "").strip()
        if out:
            try:
                Path(out).write_text(json.dumps(result, ensure_ascii=False) + "\n", encoding="utf-8")
            except OSError:
                pass
    return state, msg


def _lead(cwd: Path, *, holder: str, version: str, max_changes: int | None, from_step: str, retries: int, quiet: bool,
          result: dict) -> tuple[str, str]:
    def say(text: str) -> None:
        if not quiet:
            print(text, flush=True)

    def end(state: str, msg: str, **more) -> tuple[str, str]:
        result.update({"state": state, "message": msg, **more})
        return state, msg

    if from_step and from_step not in LEAD_FROM:
        raise BatchError(f"--from must be one of: {', '.join(LEAD_FROM)}")
    app = app_root(cwd)
    if not _local_json(cwd, BATCH_FILE):
        if not holder.strip():
            raise BatchError("this worktree leads no batch: --holder is needed to take one (who is releasing)")
        try:
            batch = take(cwd, holder=holder, version=version, max_changes=max_changes, quiet=quiet)
        except BatchError:
            raise
        except RL.LockError as exc:  # another session holds the lock, or took it first
            return end("BUSY", str(exc).splitlines()[0])
        if not batch["entries"]:
            return end("NOTHING", "no change to release; the release lock is free.", left_out=batch.get("left_out") or [])
    batch, lock = _leading(cwd)
    shell = batch.get("shell") or ""
    name = f"v{shell}" if shell else "(no shell change)"
    ids = [e["id"] for e in batch["entries"]]
    heads = {"app": _head(app), "site": _head(cwd)}
    units = _lead_units(cwd, app, batch)

    # What an earlier run of lead already did for this very batch. Anything else (another lock, a drop, a commit made
    # by hand on the batch branch) starts again from the gates: a pass says nothing about a batch that changed.
    st = _local_json(cwd, LEAD_FILE)
    same = st.get("lockId") == batch["lockId"] and st.get("entries") == ids and (st.get("heads") or {}).get("app") == heads["app"]
    if same and "commit" in (st.get("done") or []):
        same = st.get("siteAfterCommit") == heads["site"]
    elif same:
        same = (st.get("heads") or {}).get("site") == heads["site"]
    if not same:
        if st.get("lockId") == batch["lockId"] and st.get("done"):
            say("[lead] the batch changed since the last run here (a drop, or a commit on the batch branch): every step runs again.")
        st = {"lockId": batch["lockId"], "entries": ids, "heads": heads, "done": [], "secs": {}, "startedAt": RL._iso(RL._now())}
    if from_step:
        first = LEAD_STEPS.index(from_step)
        st["done"] = [u["key"] for u in units if LEAD_STEPS.index(u["step"]) < first]
        st["byHand"] = from_step
        if first > LEAD_STEPS.index("commit"):
            st["siteAfterCommit"] = heads["site"]
    _write_local_json(cwd, LEAD_FILE, st)

    logs = RL.git_dir(cwd) / LEAD_LOG_DIR
    logs.mkdir(exist_ok=True)
    for old in logs.glob("*.log"):
        try:
            if time.time() - old.stat().st_mtime > DEAD_KEEP_DAYS * 86400:
                old.unlink()
        except OSError:
            pass
    tag = (shell or batch["lockId"][:8]).replace(".", "_")
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1", PYTHONIOENCODING="utf-8",
               # The release leader's suites take this PC's browser slot next (isabi-app build/_browser_slot.mjs).
               ISABI_BROWSER_SLOT_PRIORITY="leader", ISABI_RELEASE_HOLDER=str(batch.get("holder") or holder or ""))
    env.setdefault("GIT_TERMINAL_PROMPT", "0")
    say(f"[lead] batch {name}: {len(ids)} change{'s' if len(ids) != 1 else ''}, {len(units)} steps"
        + (f" ({len(st['done'])} done earlier)" if st["done"] else "") + f"; logs in {logs}")

    for i, unit in enumerate(units, 1):
        key, label = unit["key"], unit["label"]
        if key in st["done"]:
            continue
        batch, lock = _leading(cwd)  # still this batch's lock? (raises when it was lost or taken over)
        if key not in ("done", "push:app", "push:site") and RL.minutes_left(lock) < RL.DEFAULT_TTL_MIN - 10:
            RL.renew(cwd, quiet=True)
        t0 = time.monotonic()
        log = logs / f"{tag}-{i:02d}-{re.sub(r'[^A-Za-z0-9]+', '-', key)[:60].strip('-')}.log"
        ok, note, tries = True, "", 1
        if key == "commit":
            ok, note = _lead_commit(cwd, app, batch)
            if ok:
                st["siteAfterCommit"] = _head(cwd)
        elif key == "done":
            done(cwd, quiet=quiet)
        else:
            try:
                if unit.get("gate"):
                    unit["cwd"], unit["argv"] = _gate_command(unit["gate"], cwd, app)
            except BatchError as exc:
                ok, note = False, str(exc)
            rc = 0
            while ok:
                rc = _lead_exec(unit, log, env, cwd)
                if rc == 0 or not unit.get("retry") or tries > retries:
                    break
                say(f"[lead] {label}: failed (exit {rc}); running it again ({tries} of {retries})")
                try:
                    log.replace(log.with_name(log.stem + f".try{tries}.log"))
                except OSError:
                    pass
                tries += 1
            if ok and rc != 0:
                ok, note = False, f"exit {rc}" + (" (over its time limit)" if rc == -9 else "")
        secs = round(time.monotonic() - t0, 1)
        if not ok:
            tail = []
            if log.is_file():
                tail = [ln for ln in log.read_text(encoding="utf-8", errors="replace").splitlines() if ln.strip()][-30:]
            say(f"[lead] FAIL {label} ({note}; {secs:.0f}s)" + (f"  log: {log}" if tail else ""))
            for ln in tail:
                say("   | " + ln[:230])
            e = unit.get("entry") or {}
            whose = f" It is the gate named by {e.get('id')} ({e.get('holder')}: {str(e.get('summary') or '')[:90]})." if e else ""
            st.setdefault("failed", []).append({"key": key, "note": note, "at": RL._iso(RL._now())})
            _write_local_json(cwd, LEAD_FILE, st)
            left = RL.minutes_left(RL.read_remote_lock(cwd)[1])
            return end("FAILED", (f"batch {name} stopped at step {unit['step']}: {label} ({note}).{whose} The release lock is still "
                                  f"this worktree's ({left:.0f} min left). Fix it, or leave out the change that broke it "
                                  f'(python build/release_batch.py drop <entry> --reason "<gate>" --reset), then run lead again: '
                                  "it carries on from here. Giving up: python build/release_batch.py abort."),
                       step=unit["step"], key=key, log=str(log), version=shell, entries=ids)
        st["done"].append(key)
        st["secs"][key] = secs
        if key != "done":
            _write_local_json(cwd, LEAD_FILE, st)
            say(f"[lead] PASS {label} ({secs:.0f}s{', on try ' + str(tries) if tries > 1 else ''}{'; ' + note if note else ''})")

    _write_local_json(cwd, LEAD_FILE, None)
    total = sum(float(v) for v in st["secs"].values())
    steps = _step_minutes(st["secs"])
    rec = {"at": RL._iso(RL._now()), "version": shell, "holder": batch.get("holder"), "pc": socket.gethostname(),
           "changes": len(ids), "cap": batch.get("cap"), "leftOut": len(batch.get("left_out") or []),
           "secs": st["secs"], "totalSecs": round(total, 1), "startedAt": st.get("startedAt"), "byHand": st.get("byHand", "")}
    _log_batch(rec)
    return end("SHIPPED", f"batch {name} with {len(ids)} change{'s' if len(ids) != 1 else ''} is live and on both mains; the "
                          f"release lock is free. Steps took {total / 60:.1f} min ({steps}).",
               version=shell, entries=[{"id": e["id"], "holder": e.get("holder"), "summary": e.get("summary")} for e in batch["entries"]],
               left_out=batch.get("left_out") or [], secs=round(total, 1))


# ------------------------------------------------------------------------------------- drive: one session for the line

def _adopt_stopped(cwd: Path, holder: str) -> list[dict]:
    """Owner's word only (drive --stopped-sessions): a waiting change whose session went quiet is otherwise skipped
    until that session joins again, which means the owner waking each stopped session by hand. The driver vouches for
    it instead: the entry keeps its id, place, holder, commits and gates, and says who kept it in line. Never a new
    entry and never other commits than the ones its session queued."""
    kept = []
    for e in read_line(cwd):
        if e.get("state") == "waiting" and _is_stale(e):
            now = RL._iso(RL._now())
            new = _set_fields(cwd, e["id"], {"seenAt": now, "drivenBy": holder, "drivenAt": now},
                              only_if=lambda x: x.get("state") == "waiting" and _is_stale(x))
            if new is not None:
                kept.append(new)
    return kept


def _spawn_lead(cwd: Path, *, holder: str, max_changes: int | None, retries: int) -> dict:
    """One batch in a process of its own, so each batch runs the release scripts as they are on main by then."""
    out = RL.git_dir(cwd) / "isabi-release-lead-result.json"
    try:
        out.unlink()
    except OSError:
        pass
    argv = [sys.executable, str(Path(__file__).resolve()), "lead", "--holder", holder, "--retries", str(retries)]
    if max_changes is not None:
        argv += ["--max", str(max_changes)]
    rc = subprocess.run(argv, cwd=str(cwd), env=dict(os.environ, **{LEAD_RESULT_ENV: str(out)}), stdin=subprocess.DEVNULL,
                        check=False).returncode
    try:
        res = json.loads(out.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        res = {}
    if not isinstance(res, dict) or not res.get("state"):
        res = {"state": "ERROR", "message": f"lead ended with exit {rc} and no result (see its output above)"}
    return res


def drive(cwd: Path = ISABI_ROOT, *, holder: str, max_changes: int | None = None, batches: int = 0,
          wait_s: int = DRIVE_WAIT_S, idle_s: int = 0, poll_s: int = POLL_S, stopped_sessions: bool = False,
          retries: int = 1, quiet: bool = False) -> tuple[str, str]:
    """Lead batch after batch until the line is empty: the lock never sits free while changes wait. One driver session
    per line is enough; any other session still leads when its own turn comes (the lock decides). Returns:
    EMPTY    nothing is waiting any more
    DONE     --batches N reached
    WAITING  another session has been releasing for wait_s (run drive again)
    FAILED   a batch stopped at a failing step with the lock held (see lead), or could not be led"""
    holder = holder.strip()
    if not holder:
        raise BatchError("--holder is needed (who drives the line)")
    batch_cap(max_changes)
    app_root(cwd)
    shipped: list[dict] = []
    nothing = 0
    wait_from: float | None = None
    idle_from: float | None = None
    shown = ""

    def say(text: str) -> None:
        nonlocal shown
        if not quiet and text != shown:
            print(text, flush=True)
            shown = text

    def tally() -> str:
        if not shipped:
            return "no batch shipped by this run"
        return (f"{len(shipped)} batch{'es' if len(shipped) != 1 else ''} shipped by this run ("
                + ", ".join((("v" + b["version"]) if b.get("version") else "no shell change") + f": {len(b.get('entries') or [])}"
                            for b in shipped) + " changes)")

    while True:
        try:
            lock_sha, lock = RL.read_remote_lock(cwd)
            own = _own_batch(cwd, lock_sha, lock)
            if own and own[0] != "LEADER":
                return "FAILED", own[1] + " " + tally() + "."
            if not own:
                if stopped_sessions:
                    for e in _adopt_stopped(cwd, holder):
                        say(f"[drive] kept in line for its quiet session: {e['id']} ({e.get('holder')}: {str(e.get('summary') or '')[:80]})")
                waiting = _waiting(read_line(cwd))
                if not waiting:
                    idle_from = _mono() if idle_from is None else idle_from
                    if _mono() - idle_from >= max(0, idle_s):
                        return "EMPTY", f"nothing is waiting in the line; {tally()}."
                    say(f"[drive] the line is empty; watching it for {int(idle_s - (_mono() - idle_from))} s more")
                    _sleep(max(0, poll_s))
                    continue
                idle_from = None
                if lock_sha and not RL.is_expired(lock, RL.TAKEOVER_GRACE_MIN):
                    wait_from = _mono() if wait_from is None else wait_from
                    if _mono() - wait_from >= max(0, wait_s):
                        return "WAITING", (f"{len(waiting)} waiting, and the release lock is {RL.describe(lock)}; {tally()}. "
                                           "Run drive again to keep going.")
                    say(f"[drive] {len(waiting)} waiting; another session is releasing: {RL.describe(lock)}")
                    _sleep(max(0, poll_s))
                    continue
                say(f"[drive] {len(waiting)} waiting and nothing is releasing: leading the next batch "
                    f"(up to {batch_cap(max_changes, len(waiting)) or 'all'} changes)")
        except RL.LockError as exc:
            if not _is_net_error(str(exc)):
                raise
            wait_from = _mono() if wait_from is None else wait_from
            if _mono() - wait_from >= max(0, wait_s):
                return "WAITING", f"the release line cannot be reached ({str(exc).splitlines()[0][:200]}); {tally()}. Run drive again."
            say(f"[drive] the release line cannot be reached ({str(exc).splitlines()[0][:160]}); trying again")
            _sleep(max(0, poll_s))
            continue
        wait_from = None
        res = _spawn_lead(cwd, holder=holder, max_changes=max_changes, retries=retries)
        state = res.get("state")
        if state == "SHIPPED":
            nothing = 0
            shipped.append(res)
            if batches and len(shipped) >= batches:
                return "DONE", f"{tally()}; stopped after {batches} as asked."
        elif state == "NOTHING":
            nothing += 1  # everything picked was left out or is live already: those entries no longer wait
            if nothing >= 3:
                return "FAILED", f"three batches in a row had nothing to release though changes wait: run status. {tally()}."
        elif state == "BUSY":
            say(f"[drive] {res.get('message')}")
            _sleep(max(0, poll_s))
        else:
            return "FAILED", f"{res.get('message') or 'lead failed'} {tally()}."


# ------------------------------------------------------------------------------------------------------ status, CLI

def _already_live(cwd: Path, entry: dict, deployed: list) -> str | None:
    """For a stale waiting entry: the shell version live had to reach ("" for an isabi-only change) when all its
    commits are on origin/main and there is evidence live has them (the same test a leader uses to mark it shipped);
    None otherwise, or when that cannot be told. Read only: status never changes the line."""
    if not any((entry.get(k) or {}).get("sha") for k in ("app", "site")):
        return None
    try:
        if not _parts_on_main(cwd, entry):
            return None
        ok, bar = _live_evidence(cwd, entry, deployed)
    except RL.LockError:  # offline, or the isabi-app checkout is missing: status still prints, unlabelled
        return None
    return bar if ok else None


def status(cwd: Path = ISABI_ROOT) -> dict:
    lock_sha, lock = RL.read_remote_lock(cwd)
    line = read_line(cwd)
    deployed = (lock.get("deployed") or []) if lock_sha else []
    already = {}
    for e in line:
        if (e.get("state") == "waiting" and _is_stale(e)
                and not (lock_sha and (e.get("batch") or {}).get("lockId") == lock.get("lockId"))):
            bar = _already_live(cwd, e, deployed)
            if bar is not None:
                already[e["id"]] = bar
    return {"lock": lock if lock_sha else None, "held_here": bool(lock_sha) and RL.held_by_me(lock, cwd),
            "line": [_pub(e) for e in line], "leading": _local_json(cwd, BATCH_FILE) or None, "alreadyLive": already}


def _print_status(st: dict) -> None:
    lock = st["lock"]
    print(f"Release lock: {RL.describe(lock) if lock else 'free'}{' (this worktree)' if st['held_here'] else ''}")
    line = st["line"]
    if not line:
        print("Line: empty.")
        return
    print(f"Line: {len(line)} entr{'y' if len(line) == 1 else 'ies'}")
    for i, e in enumerate(line, 1):
        b = e.get("batch") or {}
        if e.get("state") == "left_out":
            where = f"LEFT OUT by {e.get('leftOutBy', '?')}: {e.get('note', '')}"
        elif e.get("state") == "shipped":
            ver = e.get("shippedVersion")
            where = f"SHIPPED {('in v' + ver) if ver else '(no shell change)'} by {e.get('shippedBy', '?')}; not collected by its session yet"
        elif e.get("state") != "waiting":
            where = "UNREADABLE"
        elif lock and b.get("lockId") == lock.get("lockId"):
            where = f"in the batch being released as v{b.get('version') or '?'}"
        elif e["id"] in (st.get("alreadyLive") or {}):
            bar = st["alreadyLive"][e["id"]]
            where = (f"STALE but ALREADY LIVE{(' (live serves v' + bar + ' or later)') if bar else ' (a recorded deploy has it)'}: "
                     f"nothing left to ship; its session collects it with wait, or it clears itself after {DEAD_KEEP_DAYS} days")
        elif _is_stale(e):
            where = f"STALE: no sign of its session for {STALE_AFTER_MIN // 60} h; skipped until it joins again"
        else:
            where = "waiting" + (f" (its session is quiet: kept in line by {e['drivenBy']})" if e.get("drivenBy") else "")
        print(f"  {i}. [{e['id']}] {e.get('summary')} ({e.get('holder')}; {_parts_text(e)}): {where}")


def _add_ship_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--holder", required=True, help="who is shipping (session name)")
    p.add_argument("--summary", required=True, help="one line on what ships (goes in the batch commit and the release log)")
    p.add_argument("--app-branch", default="", help="pushed isabi-app branch holding the change, e.g. wt/till-date")
    p.add_argument("--site-branch", default="", help="pushed isabi branch holding site-side changes (functions/, build/)")
    p.add_argument("--gate", action="append", default=[], metavar="CMD",
                   help='a gate this change needs on the batch, e.g. "isabi-app: node build/verify_x.mjs" (repeatable)')
    p.add_argument("--force", action="store_true",
                   help="replace an entry for the same branch that another session joined (only when the owner says so)")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Batched ISABI releases: a waiting line in front of the release lock.",
                                 allow_abbrev=False)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("status", help="the release lock and the line")
    s.add_argument("--json", action="store_true")
    sh = sub.add_parser("ship", help="join the line; lead the batch when nothing is releasing, else wait for your batch")
    _add_ship_args(sh)
    sh.add_argument("--version", default="", help="shell version for the batch if you lead it (default: one above live and main)")
    sh.add_argument("--wait", type=int, default=DEFAULT_WAIT_S, help="seconds to wait before returning WAITING (default 540)")
    sh.add_argument("--max", type=int, default=None, dest="max_changes", metavar="N",
                    help=f"if you lead: at most N changes in the batch (default {MAX_BATCH}, or {MAX_BATCH_ENV}; 0 = no limit)")
    j = sub.add_parser("join", help="join the line without waiting")
    _add_ship_args(j)
    w = sub.add_parser("wait", help="wait for an entry: shipped, left out, or its turn to lead")
    w.add_argument("--id", required=True)
    w.add_argument("--wait", type=int, default=DEFAULT_WAIT_S)
    t = sub.add_parser("take", help="lead a batch now: take the lock and merge the first changes waiting")
    t.add_argument("--holder", required=True)
    t.add_argument("--version", default="")
    t.add_argument("--max", type=int, default=None, dest="max_changes", metavar="N",
                   help=f"at most N changes in the batch (default {MAX_BATCH}, or {MAX_BATCH_ENV}; 0 = no limit)")
    d = sub.add_parser("drop", help="leader: leave a change out (its gate failed) and rebuild the batch")
    d.add_argument("entry")
    d.add_argument("--reason", required=True)
    d.add_argument("--reset", action="store_true", help="discard uncommitted changes and commits on the batch branch")
    sub.add_parser("done", help="leader: after deploy and push, clear the shipped entries and release the lock")
    sub.add_parser("abort", help="leader: give the batch up before it is live")
    lv = sub.add_parser("leave", help="take an entry out of the line")
    lv.add_argument("--id", required=True)
    lv.add_argument("--force", action="store_true",
                    help="clear a waiting or left-out entry another session joined (only when the owner says that change is abandoned)")
    ld = sub.add_parser("lead", help="lead one batch from start to finish: take (when not leading yet), gates, sync_app.py, "
                                     "commit, deploy, push, done; stops at the first failure with the lock held")
    ld.add_argument("--holder", default="", help="who is releasing (needed to take a batch; not to carry on with one)")
    ld.add_argument("--version", default="")
    ld.add_argument("--max", type=int, default=None, dest="max_changes", metavar="N",
                    help=f"at most N changes in the batch (default: {MAX_BATCH}, or {MAX_BATCH_LONG} while more than "
                         f"{LONG_LINE_OVER} wait; {MAX_BATCH_ENV}; 0 = no limit)")
    ld.add_argument("--from", default="", dest="from_step", choices=LEAD_FROM,
                    help="start at this step (the ones before it were done by hand); default: where the last run stopped")
    ld.add_argument("--retries", type=int, default=1, help="run a failed gate again this many times (default 1)")
    dv = sub.add_parser("drive", help="lead batch after batch until the line is empty (one driver session for the line)")
    dv.add_argument("--holder", required=True)
    dv.add_argument("--max", type=int, default=None, dest="max_changes", metavar="N")
    dv.add_argument("--batches", type=int, default=0, metavar="N", help="stop after N batches (default: until the line is empty)")
    dv.add_argument("--wait", type=int, default=DRIVE_WAIT_S,
                    help=f"seconds to wait for another session's release before returning WAITING (default {DRIVE_WAIT_S})")
    dv.add_argument("--idle", type=int, default=0, help="seconds to keep watching an empty line for new changes (default 0)")
    dv.add_argument("--stopped-sessions", action="store_true",
                    help="also ship waiting changes whose session has gone quiet (STALE); only on the owner's word, each time")
    dv.add_argument("--retries", type=int, default=1)
    args = ap.parse_args(argv)
    if getattr(args, "wait", 0) < 0 or getattr(args, "wait", 0) > 3600:  # noqa: PLR2004
        ap.error("--wait must be 0 to 3600 seconds")
    cwd = ISABI_ROOT
    try:
        if args.cmd == "status":
            st = status(cwd)
            if args.json:
                print(json.dumps(st, ensure_ascii=False, indent=1))
            else:
                _print_status(st)
        elif args.cmd == "ship":
            state, msg, _batch = ship(cwd, holder=args.holder, summary=args.summary, app_branch=args.app_branch,
                                      site_branch=args.site_branch, gates=args.gate, version=args.version, wait_s=args.wait,
                                      force=args.force, max_changes=args.max_changes)
            print(f"RESULT: {state}: {msg}")
            if state == "WAITING" and "wait --id" not in msg:  # offline: the message names the wait command instead
                print("Run the same ship command again to keep waiting (a place in line is kept).")
            elif state == "TURN":
                print(f'Lead the batch now, in the background or with a long timeout (it can take minutes):\n'
                      f'  python build/release_batch.py take --holder "{args.holder}"')
            return 3 if state in ("LEFT_OUT", "GONE", "HALF_FORMED") else 0
        elif args.cmd == "join":
            join(cwd, holder=args.holder, summary=args.summary, app_branch=args.app_branch, site_branch=args.site_branch,
                 gates=args.gate, force=args.force)
        elif args.cmd == "wait":
            state, msg = wait(cwd, args.id, wait_s=args.wait)
            print(f"RESULT: {state}: {msg}")
            if state == "TURN":
                print('Lead the batch: python build/release_batch.py take --holder "<session>"')
            return 3 if state in ("LEFT_OUT", "GONE", "HALF_FORMED") else 0
        elif args.cmd == "take":
            batch = take(cwd, holder=args.holder, version=args.version, max_changes=args.max_changes)
            if batch["entries"]:
                shell = batch.get("shell")
                print(f"RESULT: LEADER: batch {('v' + shell) if shell else '(no shell change)'} with {len(batch['entries'])} change(s).")
            else:
                print("RESULT: NOTHING: no change to release.")
        elif args.cmd == "drop":
            drop(cwd, args.entry, reason=args.reason, reset=args.reset)
        elif args.cmd == "done":
            done(cwd)
        elif args.cmd == "abort":
            abort(cwd)
        elif args.cmd == "lead":
            state, msg = lead(cwd, holder=args.holder, version=args.version, max_changes=args.max_changes,
                              from_step=args.from_step, retries=args.retries)
            print(f"RESULT: {state}: {msg}")
            return {"SHIPPED": 0, "NOTHING": 0, "BUSY": 4}.get(state, 1)
        elif args.cmd == "drive":
            state, msg = drive(cwd, holder=args.holder, max_changes=args.max_changes, batches=args.batches, wait_s=args.wait,
                               idle_s=args.idle, stopped_sessions=args.stopped_sessions, retries=args.retries)
            print(f"RESULT: {state}: {msg}")
            return {"EMPTY": 0, "DONE": 0, "WAITING": 0}.get(state, 1)
        else:
            leave(cwd, args.id, force=args.force)
    except RL.LockError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
