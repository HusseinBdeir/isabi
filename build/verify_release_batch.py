"""Gate: build/release_batch.py (the waiting line in front of the release lock; batched releases, owner 2026-11-13).

Offline: two bare repositories in a temp folder stand in for HusseinBdeir/isabi and HusseinBdeir/isabi-app; each
session is a pair of clones side by side (<session>/isabi, <session>/isabi-app). Never touches the real remotes, the
working tree of this checkout or Cloudflare.
Run: python build/verify_release_batch.py      (exit 1 with every failed check named)
"""
from __future__ import annotations

import contextlib
import datetime as dt
import io
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

sys.stdout.reconfigure(encoding="utf-8")
BUILD = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(BUILD))

import release_batch as RB  # noqa: E402
import release_lock as RL  # noqa: E402

RESULTS: list[tuple[bool, str]] = []
NOW = "ISABI_RELEASE_LOCK_NOW"
LIVE = "ISABI_RELEASE_LIVE_SHELL"
T0 = dt.datetime(2026, 11, 13, 12, 0, 0, tzinfo=dt.timezone.utc)
CLOCK = [0]
IDENT = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}

SW = ("const SHELL_CACHE = 'isabi-mfg-v19.6.100';\nconst DATA_CACHE = 'isabi-mfg-data-v3';\n"
      "const SHELL_ASSETS = ['./index.html?v=19.6.100', './js/app.js?v=19.6.100', './vendor/face-api.js?v=1'];\n")
INDEX = ("<html><head><link rel=\"icon\" href=\"icon.svg?v=19.6.100\"></head><body>\n"
         "<script>window.__MFG_SHELL_VER = '19.6.100';</script>\n<script src=\"js/app.js?v=19.6.100\"></script>\n</body></html>\n")
MANIFEST = '{\n "start_url": "./index.html?v=19.6.100",\n "icons": [{"src": "icon-180.png?v=19.6.100"}]\n}\n'
APP_JS = "".join(f"line{i}\n" for i in range(1, 13))
API_JS = "a\nb\nc\n"


def check(ok: bool, name: str) -> None:
    RESULTS.append((bool(ok), name))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}")


def git(cwd: pathlib.Path, *args: str) -> str:
    return subprocess.run(["git", *args], cwd=str(cwd), input="", capture_output=True, text=True, check=True,
                          env=dict(os.environ, **IDENT)).stdout.strip()


def tick(seconds: int = 1) -> None:
    """The line orders entries by the second they joined: every step of this gate happens at its own second."""
    CLOCK[0] += seconds
    os.environ[NOW] = RL._iso(T0 + dt.timedelta(seconds=CLOCK[0]))


def quiet(fn, *a, **k):
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        return fn(*a, **k)


def raises(fn, *a, **k) -> tuple[str, str]:
    """(exception class name, message) or ("", "")."""
    try:
        quiet(fn, *a, **k)
    except RL.LockError as exc:
        return type(exc).__name__, str(exc) or "error"
    return "", ""


def exits(fn, *a, **k):
    try:
        quiet(fn, *a, **k)
    except SystemExit as exc:
        return exc.code
    return None


def put(path: pathlib.Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(text.encode("utf-8"))


def text(path: pathlib.Path) -> str:
    return path.read_bytes().decode("utf-8").replace("\r\n", "\n")


def session(tmp: pathlib.Path, name: str) -> pathlib.Path:
    d = tmp / name
    d.mkdir()
    git(tmp, "clone", "-q", str(tmp / "isabi.git"), str(d / "isabi"))
    git(tmp, "clone", "-q", str(tmp / "isabi-app.git"), str(d / "isabi-app"))
    return d / "isabi"


def feature(repo: pathlib.Path, branch: str, files: dict[str, str], stamp: str = "") -> str:
    """A change on its own pushed branch off origin/main; `stamp` = the session also bumped the shell version."""
    git(repo, "fetch", "-q", "origin")
    git(repo, "checkout", "-q", "-B", branch, "origin/main")
    for rel, body in files.items():
        put(repo / rel, body)
    if stamp:
        for f in RB.APP_STAMP_FILES:
            (repo / f).write_bytes(RB.restamp((repo / f).read_bytes(), stamp))
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", branch)
    git(repo, "push", "-q", "-f", "origin", branch)
    return git(repo, "rev-parse", "HEAD")


def release_as_leader(site: pathlib.Path, *, deploy: bool = True, live: bool = True) -> str:
    """What the leader does after `take`: sync_app.py (shell into isabi/app + deployed_shell.js), commit, claim the
    deploy in the lock (deploy=), push isabi-app main then isabi main; the live site then serves it (live=).
    Returns the shell version shipped."""
    app = site.parent / "isabi-app"
    ver = RB.shell_ver_of((app / "sw.js").read_bytes())
    put(site / "app" / "sw.js", text(app / "sw.js"))
    put(site / "functions" / "_lib" / "deployed_shell.js", f"export const DEPLOYED_SHELL_VER = '{ver}';\n")
    git(site, "add", "-A")
    git(site, "commit", "-q", "--allow-empty", "-m", f"Command Center v{ver}")
    if deploy:
        quiet(RL.claim_deploy, site, git(site, "rev-parse", "HEAD"), "pages-only deploy")
    git(app, "push", "-q", "origin", "HEAD:main")
    git(site, "push", "-q", "origin", "HEAD:main")
    if live:
        os.environ[LIVE] = ver
    return ver


def stamps(app: pathlib.Path) -> set[str]:
    out: set[str] = set()
    for f in RB.APP_STAMP_FILES:
        out |= set(re.findall(r"\?v=([0-9]+\.[0-9]+\.[0-9]+)", text(app / f)))
    return out


def line_ids(repo: pathlib.Path, state: str = "") -> list[str]:
    return [e["id"] for e in RB.read_line(repo) if not state or e.get("state") == state]


def entry(repo: pathlib.Path, entry_id: str) -> dict:
    return next((e for e in RB.read_line(repo) if e["id"] == entry_id), {})


def is_ancestor(repo: pathlib.Path, sha: str, ref: str = "HEAD") -> bool:
    return subprocess.run(["git", "merge-base", "--is-ancestor", sha, ref], cwd=str(repo), capture_output=True).returncode == 0


def main() -> int:  # noqa: PLR0915
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="isabi-release-batch-"))
    saved = {k: os.environ.get(k) for k in ("ISABI_RELEASE_LOCK", NOW, LIVE, *IDENT)}
    os.environ.pop("ISABI_RELEASE_LOCK", None)
    os.environ.update(IDENT)
    os.environ[LIVE] = "19.6.100"
    tick()
    try:
        for name in ("isabi.git", "isabi-app.git"):
            git(tmp, "init", "-q", "--bare", "-b", "main", str(tmp / name))
        seed = session(tmp, "seed")
        seed_app = seed.parent / "isabi-app"
        for rel, body in (("sw.js", SW), ("index.html", INDEX), ("manifest.json", MANIFEST), ("js/app.js", APP_JS), ("js/other.js", "other\n")):
            put(seed_app / rel, body)
        for rel, body in (("app/sw.js", SW), ("functions/_lib/deployed_shell.js", "export const DEPLOYED_SHELL_VER = '19.6.100';\n"),
                          ("functions/api.js", API_JS)):
            put(seed / rel, body)
        for repo in (seed_app, seed):
            git(repo, "add", "-A")
            git(repo, "commit", "-q", "-m", "seed")
            git(repo, "push", "-q", "origin", "HEAD:main")
        A, B, C, D, E = (session(tmp, n) for n in "ABCDE")
        appA, appB, appC, appD, appE = (s.parent / "isabi-app" for s in (A, B, C, D, E))

        # 1. empty line
        check(RB.read_line(A) == [], "an empty line reads as empty")
        check(quiet(RB.take, A, holder="session A")["entries"] == [] and RL.read_remote_lock(A) == ("", {}),
              "take with nothing waiting does not take the lock")

        # 2. joining
        sha_a = feature(appA, "wt/a", {"js/app.js": APP_JS.replace("line1\n", "line1 A\n")}, stamp="19.6.101")
        check("is not on origin" in raises(RB.join, A, holder="session A", summary="x", app_branch="wt/nope")[1],
              "a branch that is not pushed cannot join the line")
        check("name what ships" in raises(RB.join, A, holder="session A", summary="x")[1], "an entry must name a branch")
        tick()
        eA = quiet(RB.join, A, holder="session A", summary="A change", app_branch="wt/a", gates=["isabi-app: node build/verify_a.mjs"])
        got = entry(B, eA["id"])
        check(got.get("state") == "waiting" and got.get("app") == {"branch": "wt/a", "sha": sha_a} and got.get("gates") == ["isabi-app: node build/verify_a.mjs"],
              "a joined change is visible to another session with its exact commit and gates")
        tick()
        check(quiet(RB.join, A, holder="session A", summary="A change", app_branch="wt/a")["id"] == eA["id"] and len(RB.read_line(A)) == 1,
              "joining again with the same commit keeps the place in line")
        check(RB.poll_once(A, eA["id"])[0] == "TURN", "nothing releasing and first in line: it is this change's turn")

        # 3. nothing releasing: the change ships at once, alone
        put(A / "functions" / "api.js", "dirty\n")
        check("uncommitted changes" in raises(RB.take, A, holder="session A")[1] and RL.read_remote_lock(A) == ("", {}),
              "take refuses a dirty worktree before taking the lock")
        git(A, "checkout", "-q", "--", "functions/api.js")
        tick()
        bA = quiet(RB.take, A, holder="session A")
        lock = RL.read_remote_lock(B)[1]
        check([e["id"] for e in bA["entries"]] == [eA["id"]] and bA["shell"] == "19.6.101" and not bA["left_out"],
              "a lone change is released alone, one version above live and main")
        check(lock.get("holder") == "session A" and lock.get("version") == "v19.6.101" and lock.get("purpose") == "batch release of 1"
              and lock.get("batch") == [eA["id"]], "the leader holds the release lock, which names the batch")
        check(git(A, "branch", "--show-current") == bA["branch"] == git(appA, "branch", "--show-current") and bA["branch"].startswith("release/batch-"),
              "both worktrees are on the batch branch")
        sw = text(appA / "sw.js")
        check("isabi-mfg-v19.6.101'" in sw and "face-api.js?v=1'" in sw and "isabi-mfg-data-v3" in sw and stamps(appA) == {"19.6.101"}
              and "__MFG_SHELL_VER = '19.6.101'" in text(appA / "index.html"),
              "one shell version across sw.js, index.html and manifest.json; vendor ?v=1 and the data cache untouched")
        check("line1 A" in text(appA / "js" / "app.js") and is_ancestor(appA, sha_a), "the change's own commit is in the batch")
        check((entry(B, eA["id"]).get("batch") or {}).get("lockId") == lock.get("lockId"), "the entry is marked as in the batch being released")
        check("already leads" in raises(RB.take, A, holder="session A")[1], "a leader cannot start a second batch")

        # 4. three changes finish while A is releasing: they wait in line
        sha_b = feature(appB, "wt/b", {"js/other.js": "other B\n"}, stamp="19.6.102")
        sha_c = feature(appC, "wt/c", {"js/app.js": APP_JS.replace("line9\n", "line9 C\n"), "js/c_new.js": "new C\n"}, stamp="19.6.103")
        sha_cs = feature(C, "wt/c-site", {"functions/api.js": "a\nb C\nc\n", "app/sw.js": "hand edit\n",
                                         "functions/_lib/deployed_shell.js": "export const DEPLOYED_SHELL_VER = '19.6.103';\n"})
        sha_d = feature(appD, "wt/d", {"js/app.js": APP_JS.replace("line9\n", "line9 D\n")}, stamp="19.6.104")
        tick()
        eB = quiet(RB.join, B, holder="session B", summary="B change", app_branch="wt/b")
        tick()
        eC = quiet(RB.join, C, holder="session C", summary="C change", app_branch="wt/c", site_branch="wt/c-site",
                   gates=["isabi-app: node build/verify_c.mjs"])
        tick()
        eD = quiet(RB.join, D, holder="session D", summary="D change", app_branch="wt/d")
        st, _msg, free = RB.poll_once(B, eB["id"])
        check(st == "WAITING" and free is False, "a change that finishes during a release waits")
        kind, msg = raises(RB.take, B, holder="session B")
        check(kind == "LockError" and "held by session A" in msg and git(appB, "branch", "--show-current") == "wt/b",
              "nobody else can lead while a release is running; their worktrees are not touched")
        check(RB.ship(B, holder="session B", summary="B change", app_branch="wt/b", wait_s=0, poll_s=0, quiet=True)[0] == "WAITING"
              and line_ids(B) == [eA["id"], eB["id"], eC["id"], eD["id"]], "ship during a release returns WAITING and keeps the place")

        # 5. A finishes
        check("not on origin/main yet" in raises(RB.done, A)[1] and RL.read_remote_lock(B)[0], "done is refused before the batch is on main; the lock stays held")
        release_as_leader(A, deploy=False, live=False)
        check("no deploy is recorded" in raises(RB.done, A)[1] and RL.read_remote_lock(B)[1].get("holder") == "session A"
              and entry(B, eA["id"]).get("state") == "waiting",
              "on main is not live: done is refused while no deploy is recorded, and the lock stays held")
        check(RB.poll_once(B, eA["id"], known=eA)[0] == "IN_BATCH", "a change on main whose leader has not finished is not reported shipped")
        quiet(RL.claim_deploy, A, git(A, "rev-parse", "HEAD"), "pages-only deploy")
        check("live serves shell v19.6.100, not v19.6.101" in raises(RB.done, A)[1] and RL.read_remote_lock(B)[0],
              "done is refused while the live site still serves the old shell")
        os.environ[LIVE] = "19.6.101"
        tick()
        quiet(RB.done, A)
        a_now = entry(B, eA["id"])
        check(RL.read_remote_lock(B) == ("", {}) and line_ids(B, "waiting") == [eB["id"], eC["id"], eD["id"]] and not RB._local_json(A, RB.BATCH_FILE)
              and a_now.get("state") == "shipped" and a_now.get("shippedVersion") == "19.6.101" and a_now.get("shippedBy") == "session A",
              "done marks the entry shipped with its version and frees the lock; the waiting ones stay in line")
        os.environ[LIVE] = "19.6.100"
        st, msg, _free = RB.poll_once(A, eA["id"], known=eA)
        check(st == "WAITING" and "live serves v19.6.100" in msg, "a waiting session is not told SHIPPED while live serves an older version")
        os.environ[LIVE] = "19.6.101"
        check(RB.wait(A, eA["id"], wait_s=0, poll_s=0, known=eA, quiet=True)[0] == "SHIPPED" and eA["id"] not in line_ids(B),
              "once live serves it the session is told SHIPPED and its entry is cleared")
        check(RB.poll_once(A, eA["id"], known=eA)[0] == "SHIPPED", "asking again after the entry is cleared still reads SHIPPED")

        # 6. whose turn
        check(RB.poll_once(B, eB["id"])[0] == "TURN", "the first in line leads the next batch")
        check(RB.poll_once(C, eC["id"])[0] == "WAITING" and RB.poll_once(C, eC["id"], free_for_s=60)[0] == "TURN"
              and RB.poll_once(D, eD["id"], free_for_s=60)[0] == "WAITING",
              "the others give the first a head start, then take over in line order if it never comes")

        # 7. everything waiting ships together; owner rule 1: a change that does not merge cleanly is left out
        tick()
        bB = quiet(RB.take, B, holder="session B")
        check([e["id"] for e in bB["entries"]] == [eB["id"], eC["id"]] and bB["shell"] == "19.6.102",
              "the changes waiting in line are released together as one version")
        check([x["id"] for x in bB["left_out"]] == [eD["id"]] and "js/app.js" in bB["left_out"][0]["why"],
              "rule 1: a change that clashes with one ahead of it is left out, naming the file")
        check(stamps(appB) == {"19.6.102"} and "isabi-mfg-v19.6.102'" in text(appB / "sw.js"),
              "branches that each bumped the shell version themselves merge without clashing on the stamps")
        app_js = text(appB / "js" / "app.js")
        check("line1 A" in app_js and "line9 C" in app_js and "line9 D" not in app_js and text(appB / "js" / "other.js") == "other B\n"
              and all(is_ancestor(appB, s) for s in (sha_b, sha_c)) and not is_ancestor(appB, sha_d),
              "the batch holds main plus both merged changes, and nothing of the one left out")
        check(text(B / "functions" / "api.js") == "a\nb C\nc\n" and is_ancestor(B, sha_cs), "a change's isabi-side branch is merged too")
        check("hand edit" not in text(B / "app" / "sw.js") and "19.6.101" in text(B / "functions" / "_lib" / "deployed_shell.js")
              and any("also changed app/" in n for n in bB["notes"]),
              "a branch's own copies of generated files (app/, deployed_shell.js) are ignored, with a note")
        d_now = entry(A, eD["id"])
        check(d_now.get("state") == "left_out" and "js/app.js" in d_now.get("note", "") and d_now.get("leftOutBy") == "session B"
              and RB.poll_once(D, eD["id"])[0] == "LEFT_OUT", "the left-out change's session is told why")
        check(RB.poll_once(C, eC["id"])[0] == "IN_BATCH", "a change in the running batch reads as IN_BATCH")
        check("being released now" in raises(RB.leave, C, eC["id"])[1], "a change in the running batch cannot leave the line")

        # 8. owner rule 2: the combined gates fail; the change that broke them is dropped, the others still ship
        put(B / "app" / "sw.js", "sync_app output\n")
        put(B / "app" / "js" / "c_new.js", "new C\n")  # sync_app.py copied the change's new file: untracked in isabi
        check("--reset" in raises(RB.drop, B, eC["id"], reason="verify_c failed")[1] and len(RB._local_json(B, RB.BATCH_FILE)["entries"]) == 2,
              "drop does not discard uncommitted work unless --reset is given")
        check("is not in this batch" in raises(RB.drop, B, eD["id"], reason="x", reset=True)[1], "only a change in the batch can be dropped")
        tick()
        bB2 = quiet(RB.drop, B, eC["id"], reason="verify_c failed", reset=True)
        app_js = text(appB / "js" / "app.js")
        check([e["id"] for e in bB2["entries"]] == [eB["id"]] and bB2["shell"] == "19.6.102" and stamps(appB) == {"19.6.102"},
              "rule 2: the batch is rebuilt without the dropped change and keeps its version")
        check("line9 C" not in app_js and text(B / "functions" / "api.js") == API_JS and text(appB / "js" / "other.js") == "other B\n"
              and not RB._dirty(B) and not is_ancestor(appB, sha_c), "nothing of the dropped change is left in either repo")
        check(not (B / "app" / "js" / "c_new.js").exists() and not (appB / "js" / "c_new.js").exists() and (B / "app" / "sw.js").exists(),
              "files sync_app.py copied for the dropped change are cleared from isabi/app, so the deploy cannot ship them")
        c_now = entry(A, eC["id"])
        check(c_now.get("state") == "left_out" and "verify_c failed" in c_now.get("note", "") and RB.poll_once(C, eC["id"])[0] == "LEFT_OUT",
              "the dropped change's session is told which gate failed")
        check(RL.read_remote_lock(A)[1].get("purpose") == "batch release of 1" and RL.read_remote_lock(A)[1].get("holder") == "session B",
              "the lock stays with the leader through the rebuild")

        # 9. a left-out change joins again; B ships
        tick()
        eD2 = quiet(RB.join, D, holder="session D", summary="D change", app_branch="wt/d")
        check(eD2["id"] != eD["id"] and line_ids(A, "waiting") == [eB["id"], eD2["id"]] and eD["id"] not in line_ids(A),
              "a left-out change that joins again gets a fresh entry at the end of the line")
        release_as_leader(B)
        check("already live" in raises(RB.drop, B, eB["id"], reason="x", reset=True)[1], "a change cannot be dropped once the batch is live")
        git(B, "commit", "-q", "--allow-empty", "-m", "a commit made after the deploy")
        git(B, "push", "-q", "origin", "HEAD:main")
        check("what is live is not what is on main" in raises(RB.done, B)[1] and RL.read_remote_lock(A)[0],
              "done is refused when main moved past the commit that was deployed")
        quiet(RL.claim_deploy, B, git(B, "rev-parse", "HEAD"), "pages-only deploy")
        tick()
        quiet(RB.done, B)
        check(RL.read_remote_lock(A) == ("", {}) and line_ids(A, "waiting") == [eD2["id"]] and entry(A, eB["id"]).get("shippedVersion") == "19.6.102"
              and entry(A, eC["id"]).get("state") == "left_out" and line_ids(A) == [eB["id"], eC["id"], eD2["id"]],
              "done touches only what shipped: the left-out entry and the newcomer are as they were")

        # 10. a leader dies: its batch marks go stale and the next in line takes over
        feature(appE, "wt/e", {"js/extra.js": "extra E\n"})
        tick()
        eE = quiet(RB.join, E, holder="session E", summary="E change", app_branch="wt/e")
        tick()
        bD = quiet(RB.take, D, holder="session D")
        check([e["id"] for e in bD["entries"]] == [eD2["id"], eE["id"]] and bD["shell"] == "19.6.103",
              "a change left out earlier merges once what it clashed with is not on main")
        check(RB.poll_once(E, eE["id"], free_for_s=600)[0] == "IN_BATCH", "while the leader's lock is good nobody takes over")
        tick(2 * 3600)
        check(RB.poll_once(E, eE["id"], free_for_s=60)[0] == "TURN", "after the leader's lock has expired the next in line may lead")
        bE = quiet(RB.take, E, holder="session E")
        lock_e = RL.read_remote_lock(A)[1]
        check([e["id"] for e in bE["entries"]] == [eD2["id"], eE["id"]] and lock_e.get("holder") == "session E"
              and all((entry(A, i).get("batch") or {}).get("lockId") == lock_e.get("lockId") for i in (eD2["id"], eE["id"])),
              "the new leader takes the whole line, including the dead leader's batch")
        check("no longer this batch's" in raises(RB.done, D)[1] and "no longer this batch's" in raises(RB.drop, D, eE["id"], reason="x")[1],
              "the old leader can neither finish nor change a batch it no longer holds")
        quiet(RB.abort, D)
        check(not RB._local_json(D, RB.BATCH_FILE) and (entry(A, eE["id"]).get("batch") or {}).get("lockId") == lock_e.get("lockId")
              and RL.read_remote_lock(A)[1].get("holder") == "session E", "the old leader's abort touches neither the new batch nor the lock")

        # 11. abort and leave
        tick()
        quiet(RB.abort, E)
        check(RL.read_remote_lock(A) == ("", {}) and line_ids(A, "waiting") == [eD2["id"], eE["id"]]
              and not any(entry(A, i).get("batch") for i in (eD2["id"], eE["id"])) and not RB._local_json(E, RB.BATCH_FILE),
              "abort puts the changes back in line and frees the lock")
        quiet(RB.leave, E, eE["id"])
        check(line_ids(A, "waiting") == [eD2["id"]] and "is not in the line" in raises(RB.leave, E, "nope")[1], "a waiting change can leave the line")

        # 12. ship: one command for a session
        tick()
        st, _msg, bD3 = RB.ship(D, holder="session D", summary="D change", app_branch="wt/d", wait_s=0, poll_s=0, quiet=True)
        check(st == "LEADER" and [e["id"] for e in bD3["entries"]] == [eD2["id"]] and bD3["shell"] == "19.6.103",
              "ship with nothing releasing: the change leads at once (its place in line reused)")
        feature(appC, "wt/c", {"js/app.js": APP_JS.replace("line9\n", "line9 C2\n")})
        tick()
        st, _msg, _b = RB.ship(C, holder="session C", summary="C change again", app_branch="wt/c", wait_s=0, poll_s=0, quiet=True)
        ids_c = [e["id"] for e in RB.read_line(A) if (e.get("app") or {}).get("branch") == "wt/c"]
        check(st == "WAITING" and len(ids_c) == 1 and ids_c[0] != eC["id"] and entry(A, ids_c[0]).get("state") == "waiting",
              "ship during a release joins and waits; the branch's old left-out entry is replaced")
        release_as_leader(D)
        tick()
        quiet(RB.done, D)
        st, msg, _b = RB.ship(C, holder="session C", summary="C change again", app_branch="wt/c", wait_s=0, poll_s=0, quiet=True)
        check(st == "LEFT_OUT" and "js/app.js" in msg and RL.read_remote_lock(A) == ("", {}) and not RB._local_json(C, RB.BATCH_FILE),
              "a batch where nothing merges ships nothing: the lock is released and the session is told why")

        # 13. a batch with no Command Center change keeps the shell version
        git(A, "checkout", "-q", "-B", "wt/a-site", "origin/main")
        put(A / "functions" / "api.js", "a\nb\nc A\n")
        git(A, "commit", "-q", "-am", "local only")
        git(A, "push", "-q", "origin", "wt/a-site")
        put(A / "functions" / "api.js", "a\nb\nc A2\n")
        git(A, "commit", "-q", "-am", "not pushed")
        check("push it first" in raises(RB.join, A, holder="session A", summary="x", site_branch="wt/a-site")[1],
              "a branch with commits that are not pushed cannot join")
        git(A, "push", "-q", "origin", "wt/a-site")
        check("already on origin/main" in raises(RB.join, A, holder="session A", summary="x", app_branch="wt/a")[1],
              "a change that is already on main cannot join")
        tick()
        st, _msg, bA2 = RB.ship(A, holder="session A", summary="edge fix", site_branch="wt/a-site", wait_s=0, poll_s=0, quiet=True)
        check(st == "LEADER" and bA2["shell"] == "" and RL.read_remote_lock(B)[1].get("version") == "no shell change"
              and RB.shell_ver_of((appA / "sw.js").read_bytes()) == "19.6.103" and text(A / "functions" / "api.js") == "a\nb\nc A2\n",
              "a batch with only isabi-side changes does not bump the shell version")
        release_as_leader(A)
        tick()
        quiet(RB.done, A)
        check(RL.read_remote_lock(B) == ("", {}) and line_ids(A, "waiting") == [] and RB.poll_once(B, bA2["entries"][0]["id"])[0] == "SHIPPED",
              "that batch finishes like any other")

        # 13b. a leader that pushed and deployed but never ran done: nothing is released twice
        feature(appE, "wt/e2", {"js/extra2.js": "extra E2\n"})
        tick()
        st, _msg, bE2 = RB.ship(E, holder="session E", summary="E2 change", app_branch="wt/e2", wait_s=0, poll_s=0, quiet=True)
        eE2 = bE2["entries"][0]
        release_as_leader(E)
        check(st == "LEADER" and bE2["shell"] == "19.6.104" and RB.poll_once(B, eE2["id"], known=eE2)[0] == "IN_BATCH",
              "while its leader still holds the lock a pushed change reads as IN_BATCH")
        feature(appB, "wt/b2", {"js/other2.js": "other B2\n"})
        tick()
        eB2 = quiet(RB.join, B, holder="session B", summary="B2 change", app_branch="wt/b2")
        tick(2 * 3600)
        check(RB.poll_once(A, eE2["id"], known=eE2)[0] == "SHIPPED", "after that leader's lock expires its live change reads as SHIPPED, not as its turn")
        bB3 = quiet(RB.take, B, holder="session B")
        e2_now = entry(A, eE2["id"])
        check([e["id"] for e in bB3["entries"]] == [eB2["id"]] and bB3["shell"] == "19.6.105" and e2_now.get("state") == "shipped"
              and e2_now.get("shippedVersion") == "19.6.104" and any("already on main" in n for n in bB3["notes"]),
              "the next leader marks the already-live change shipped and releases only what is new")
        quiet(RB.abort, B)

        # 13c. an entry whose session has gone quiet is skipped, not shipped behind its back
        tick(4 * 3600)
        nothing = quiet(RB.take, B, holder="session B")
        check(nothing["entries"] == [] and RL.read_remote_lock(A) == ("", {}) and entry(A, eB2["id"]).get("state") == "waiting",
              "an entry with no sign of life for 3 hours is not taken into a batch")
        check(RB.poll_once(B, eB2["id"])[0] == "TURN", "its own session, back again, may still lead")
        tick()
        check(quiet(RB.join, B, holder="session B", summary="B2 change", app_branch="wt/b2")["id"] == eB2["id"]
              and [e["id"] for e in RB._waiting(RB.read_line(A))] == [eB2["id"]], "joining again refreshes the entry in place")
        stale_copy = entry(A, eB2["id"])
        tick(400)
        RB._touch(B, eB2["id"])
        check(RB._update_entry(A, stale_copy, note="x") is None
              and (RB._set_fields(A, eB2["id"], {"note": "x"}) or {}).get("note") == "x" and entry(B, eB2["id"]).get("seenAt") != stale_copy.get("seenAt"),
              "a leader's write lands even when the waiting session refreshed the entry in between")

        # 13d. a take that fails after taking the lock gives the lock back; if it cannot, abort can
        os.environ[LIVE] = "unreadable"
        kind, msg = raises(RB.take, B, holder="session B")
        check(kind == "BatchError" and "cannot read the live shell version" in msg and RL.read_remote_lock(A) == ("", {})
              and not RB._local_json(B, RB.BATCH_FILE) and not entry(A, eB2["id"]).get("batch"),
              "a take that fails while forming frees the lock and unmarks the line")
        give_up, RB._give_up = RB._give_up, (lambda *a, **k: False)
        try:
            raises(RB.take, B, holder="session B")
        finally:
            RB._give_up = give_up
        check(RL.read_remote_lock(A)[1].get("holder") == "session B" and RB._local_json(B, RB.BATCH_FILE).get("forming") is True
              and "half-formed" in raises(RB.take, B, holder="session B")[1] and "half-formed" in raises(RB.done, B)[1],
              "if the lock could not be given back, the half-formed batch is on record")
        os.environ[LIVE] = "19.6.104"
        quiet(RB.abort, B)
        check(RL.read_remote_lock(A) == ("", {}) and not RB._local_json(B, RB.BATCH_FILE), "abort frees a lock left by a half-formed batch")
        quiet(RB.leave, B, eB2["id"])

        # 14. an entry that cannot be read never ships and never blocks
        blob = subprocess.run(["git", "hash-object", "-w", "--stdin"], cwd=str(A), input=b"not json", capture_output=True, check=True).stdout.decode().strip()
        tree = subprocess.run(["git", "mktree"], cwd=str(A), input=f"100644 blob {blob}\tENTRY.json\n".encode(), capture_output=True, check=True).stdout.decode().strip()
        bad = git(A, "commit-tree", tree, "-m", "bad")
        git(A, "push", "-q", "origin", f"{bad}:{RB.QUEUE_NS}/20000101T000000Z-bad00000")
        check([e.get("state") for e in RB.read_line(B) if e["id"].endswith("bad00000")] == ["unreadable"]
              and quiet(RB.take, B, holder="session B")["entries"] == [] and RL.read_remote_lock(B) == ("", {}),
              "an unreadable entry is listed, not shipped, and does not hold the line up")
        git(A, "push", "-q", "origin", f":{RB.QUEUE_NS}/20000101T000000Z-bad00000")

        # 15. versions
        check(RB.next_version("19.6.9", "19.6.10", "") == "19.6.11" and RB.next_version("19.6.99") == "19.6.100", "the next version counts numerically")
        check("is not above" in raises(RB.batch_version, A, appA, "19.6.50")[1] and RB.batch_version(A, appA, "v19.6.200") == "19.6.200",
              "a version asked for must be above live and both mains")
        os.environ[LIVE] = "unreadable"
        check("cannot read the live shell version" in raises(RB.batch_version, A, appA)[1], "no version is chosen when live cannot be read")
        os.environ[LIVE] = "19.6.250"
        check(RB.batch_version(A, appA) == "19.6.251", "a live shell ahead of main sets the floor")
        check(RB.restamp(SW.encode(), "19.6.100") == SW.encode() and RB.restamp(INDEX.encode(), "20.0.1").count(b"20.0.1") == 3,
              "restamping to the same version changes nothing; every stamp follows a new one")

        # 16. wiring
        check(exits(RB.main, ["ship"]) == 2 and exits(RB.main, ["drop", "x"]) == 2, "the CLI rejects missing arguments (exit 2)")
        info = quiet(RL.acquire, A, holder="session A")
        info2 = quiet(RL.renew, A, extra={"version": "v1.2.3", "holder": "someone else", "lockId": "x", "deployed": ["x"], "expiresAt": "x"})
        check(info2.get("version") == "v1.2.3" and info2.get("holder") == "session A" and info2.get("lockId") == info.get("lockId")
              and info2.get("deployed") == [] and info2.get("expiresAt") != "x", "renew(extra=) describes the lock but cannot change who holds it")
        quiet(RL.release, A)
        wf = (BUILD.parent / ".github" / "workflows" / "deploy.yml").read_text(encoding="utf-8")
        check("python3 build/verify_release_batch.py" in wf, "the push-to-main workflow runs this gate")
    finally:
        for k, v in saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        shutil.rmtree(tmp, ignore_errors=True)

    failed = [n for ok, n in RESULTS if not ok]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} checks passed")
    for n in failed:
        print(f"FAILED: {n}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
