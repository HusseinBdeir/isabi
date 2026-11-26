"""Gate: the release leader in one command and the driver of the line (build/release_batch.py lead / drive), and the
batch size limit that follows the line (owner 2026-11-26: "build all recommendations").

Offline, like verify_release_batch.py (whose helpers it uses): two bare repositories in a temp folder stand in for
HusseinBdeir/isabi and HusseinBdeir/isabi-app; each session is a pair of clones side by side. The commands a leader
runs (gates, the main suite, sync_app.py, the deploy) are stood in for by a function that records them and does what
verify_release_batch.release_as_leader does by hand; the pushes are real, to the bare repositories. Never touches the
real remotes, the working tree of this checkout, Cloudflare or the batch log of this PC.
Run: python build/verify_release_lead.py      (exit 1 with every failed check named)
"""
from __future__ import annotations

import contextlib
import io
import json
import os
import pathlib
import shutil
import sys
import tempfile

sys.stdout.reconfigure(encoding="utf-8")
BUILD = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(BUILD))

import release_batch as RB  # noqa: E402
import release_lock as RL  # noqa: E402
import verify_release_batch as V  # noqa: E402

check, git, tick, quiet, raises, put, text = V.check, V.git, V.tick, V.quiet, V.raises, V.put, V.text
ENV_KEYS = ("ISABI_RELEASE_LOCK", "ISABI_RELEASE_BACKEND", "ISABI_RELEASE_API_URL", RB.MAX_BATCH_ENV, RB.BATCH_LOG_ENV,
            RB.LEAD_RESULT_ENV, V.NOW, V.LIVE, *V.IDENT)


def ids(batch: dict, key: str = "entries") -> list[str]:
    return [e["id"] for e in batch.get(key) or []]


def said(fn, *a, **k) -> tuple[object, str]:
    """(what fn returned, everything it printed)."""
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
        out = fn(*a, **k)
    return out, buf.getvalue()


def main() -> int:  # noqa: PLR0915
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="isabi-release-lead-"))
    saved = {k: os.environ.get(k) for k in ENV_KEYS}
    for k in ("ISABI_RELEASE_LOCK", "ISABI_RELEASE_BACKEND", "ISABI_RELEASE_API_URL", RB.MAX_BATCH_ENV, RB.LEAD_RESULT_ENV):
        os.environ.pop(k, None)
    os.environ.update(V.IDENT)
    os.environ[V.LIVE] = "19.6.100"
    batch_log = tmp / "batches.log"
    os.environ[RB.BATCH_LOG_ENV] = str(batch_log)
    real_exec, real_spawn, real_sleep, real_mono = RB._lead_exec, RB._spawn_lead, RB._sleep, RB._mono
    real_poll, real_renew = RB.LEAD_POLL_S, RB.LEAD_RENEW_S
    tick()
    try:
        for name in ("isabi.git", "isabi-app.git"):
            git(tmp, "init", "-q", "--bare", "-b", "main", str(tmp / name))
        seed = V.session(tmp, "seed")
        seed_app = seed.parent / "isabi-app"
        for rel, body in (("sw.js", V.SW), ("index.html", V.INDEX), ("manifest.json", V.MANIFEST), ("js/app.js", V.APP_JS),
                          ("build/verify_a.mjs", "// gate a\n"), ("build/verify_b.mjs", "// gate b\n")):
            put(seed_app / rel, body)
        for rel, body in (("app/sw.js", V.SW), ("functions/_lib/deployed_shell.js", "export const DEPLOYED_SHELL_VER = '19.6.100';\n"),
                          ("functions/api.js", V.API_JS), ("build/verify_y.py", "# gate y\n")):
            put(seed / rel, body)
        for repo in (seed_app, seed):
            git(repo, "add", "-A")
            git(repo, "commit", "-q", "-m", "seed")
            git(repo, "push", "-q", "origin", "HEAD:main")
        S = [V.session(tmp, f"S{i}") for i in range(1, 4)]
        apps = [s.parent / "isabi-app" for s in S]
        # The driver session joins nothing itself. Its clones keep line endings as they are in the repository, whatever
        # this PC's git default is, so the check on CRLF in a synced bundle (7) reads the same everywhere.
        (tmp / "driver").mkdir()
        D, D_app = tmp / "driver" / "isabi", tmp / "driver" / "isabi-app"
        git(tmp, "clone", "-q", "-c", "core.autocrlf=false", str(tmp / "isabi.git"), str(D))
        git(tmp, "clone", "-q", "-c", "core.autocrlf=false", str(tmp / "isabi-app.git"), str(D_app))

        def join(i: int, name: str, gates: tuple[str, ...] = ()) -> dict:
            V.feature(apps[i - 1], f"wt/{name}", {f"js/{name}.js": f"{name}\n"})
            tick()
            return quiet(RB.join, S[i - 1], holder=f"session {i}", summary=f"{name} change", app_branch=f"wt/{name}", gates=gates)

        # The commands a leader runs, stood in for: recorded, failing on request, and doing what the real ones leave behind.
        calls: list[tuple[str, str, str]] = []
        fail: dict[str, int] = {}
        extra: dict[str, object] = {}

        def fake_exec(unit: dict, log: pathlib.Path, env: dict, cwd: pathlib.Path) -> int:
            key = unit["key"]
            calls.append((key, env.get("ISABI_BROWSER_SLOT_PRIORITY", ""), env.get("ISABI_RELEASE_HOLDER", "")))
            log.write_text(f"$ {' '.join(unit['argv'])}\nfirst line\nlast line of {key}\n", encoding="utf-8")
            for k in list(fail):
                if k in key and fail[k] > 0:
                    fail[k] -= 1
                    return 1
            app = cwd.parent / "isabi-app"
            if key == "sync":
                ver = RB.shell_ver_of((app / "sw.js").read_bytes())
                body = text(app / "sw.js")
                (cwd / "app").mkdir(exist_ok=True)
                (cwd / "app" / "sw.js").write_bytes(body.replace("\n", "\r\n" if extra.get("crlf") else "\n").encode("utf-8"))
                put(cwd / "functions" / "_lib" / "deployed_shell.js", f"export const DEPLOYED_SHELL_VER = '{ver}';\n")
                if extra.get("stray"):
                    put(cwd / "stray.txt", "left by a gate\n")
            elif key == "deploy":
                quiet(RL.claim_deploy, cwd, git(cwd, "rev-parse", "HEAD"), "pages-only deploy")
                os.environ[V.LIVE] = RB.shell_ver_of((cwd / "app" / "sw.js").read_bytes())
            elif key.startswith("push:"):
                return real_exec(unit, log, env, cwd)
            return 0

        def spawn_here(cwd: pathlib.Path, *, holder: str, max_changes, retries: int) -> dict:
            out = tmp / "lead-result.json"
            out.unlink(missing_ok=True)
            os.environ[RB.LEAD_RESULT_ENV] = str(out)
            try:
                RB.lead(cwd, holder=holder, max_changes=max_changes, retries=retries, quiet=True)
            except RL.LockError:
                pass
            finally:
                os.environ.pop(RB.LEAD_RESULT_ENV, None)
            return json.loads(out.read_text(encoding="utf-8"))

        spawned = [0]

        def spawn_counted(cwd: pathlib.Path, **kw) -> dict:
            spawned[0] += 1
            return spawn_here(cwd, **kw)

        # Waits run on the gate's own clock: a sleep moves it 20 s on, so no check waits in real time.
        RB._lead_exec, RB._spawn_lead, RB._sleep, RB._mono = fake_exec, spawn_counted, (lambda _s: tick(20)), (lambda: float(V.CLOCK[0]))

        def keys(since: int = 0) -> list[str]:
            return [c[0] for c in calls[since:]]

        # 1. the limit follows the line
        check(RB.MAX_BATCH == 3 and RB.MAX_BATCH_LONG == 6 and RB.LONG_LINE_OVER == 6
              and [RB.batch_cap(None, n) for n in (0, 1, 6, 7, 19)] == [3, 3, 3, 6, 6],
              "a batch takes 3 changes; while more than 6 wait it takes 6")
        os.environ[RB.MAX_BATCH_ENV] = "2"
        check(RB.batch_cap(None, 19) == 2 and RB.batch_cap(4, 19) == 4 and RB.batch_cap(0, 19) == 0,
              "ISABI_BATCH_MAX and --max still fix the limit, long line or not")
        os.environ.pop(RB.MAX_BATCH_ENV)
        ga, gb = "isabi-app: node build/verify_a.mjs", "isabi-app: node build/verify_b.mjs --mobile"
        p = [join(1 + i % 3, f"p{i}", gates=((ga,) if i in (1, 2) else (gb,) if i == 4 else ())) for i in range(1, 8)]
        st, msg, _free = RB.poll_once(S[2], p[2]["id"])
        check(st == "WAITING" and "3 of 7 in line" in msg and "a batch takes the first 6" in msg,
              "a session waiting in a long line is told a batch takes the first 6")

        # 2. lead: one command from take to done
        tick()
        (state, msg), out = said(RB.lead, D, holder="driver")
        b_keys = keys()
        check(state == "SHIPPED" and "v19.6.101" in msg and "6 changes" in msg and "is live" in msg,
              "lead takes the batch and ships it: SHIPPED with the version and the number of changes")
        check(b_keys == [f"gates:{ga}", f"gates:{gb}", "main:desktop", "main:mobile", "main:boot", "sync", "deploy", "push:app", "push:site"],
              "the steps run in order: each named gate once (a gate two changes name runs once), the main suite desktop "
              "then mobile then the saved-scope boot, sync_app.py, the deploy, isabi-app main, isabi main")
        check(all(c[1] == "leader" and c[2] == "driver" for c in calls),
              "every command lead runs is marked as the release leader's, so its suites take the PC's browser slot next")
        check("the line is long (7 changes waiting, more than 6)" in out and "1 more waiting" in out,
              "the batch says why it takes 6 and that one change waits for the next batch")
        line = RB.read_line(S[0])
        check(RL.read_remote_lock(S[0]) == ("", {}) and [e["id"] for e in line if e.get("state") == "shipped"] == [e["id"] for e in p[:6]]
              and V.line_ids(S[0], "waiting") == [p[6]["id"]] and all(e.get("shippedVersion") == "19.6.101" for e in line if e.get("state") == "shipped"),
              "after lead the lock is free, the six are marked shipped in v19.6.101 and the seventh still waits")
        git(seed, "fetch", "-q", "origin")
        subj = git(seed, "log", "-1", "--format=%s", "origin/main")
        check(subj.startswith("v19.6.101: sync Command Center bundle (batch of 6: p1 change; p2 change;") and
              text(seed_app.parent / "isabi" / "app" / "sw.js") is not None and
              "isabi-mfg-v19.6.101" in git(seed, "show", "origin/main:app/sw.js"),
              "isabi main carries the synced bundle in one commit that names the batch")
        rec = [json.loads(ln) for ln in batch_log.read_text(encoding="utf-8").splitlines() if ln.strip()]
        check(len(rec) == 1 and rec[0]["version"] == "19.6.101" and rec[0]["changes"] == 6 and rec[0]["cap"] == 6
              and {"sync", "deploy", "main:desktop", "done"} <= set(rec[0]["secs"]) and rec[0]["holder"] == "driver",
              "the batch log keeps one line for the batch: version, changes, and the time of each step")
        check(not (RL.git_dir(D) / RB.LEAD_FILE).exists() and RB.poll_once(S[0], p[6]["id"])[0] == "TURN",
              "nothing of the finished batch is left in the leader's worktree; the next change can lead")

        # 3. a failing step stops the batch with the lock held; lead again carries on from that step
        q = [join(1, "q1", gates=(ga,)), join(2, "q2")]
        tick()
        fail["main:mobile"] = 2   # fails, and fails again on its one retry
        n0 = len(calls)
        (state, msg), out = said(RB.lead, D, holder="driver")
        lock = RL.read_remote_lock(S[0])[1]
        check(state == "FAILED" and "stopped at step main" in msg and "verify_mfg.mjs --mobile" in msg and "lead again" in msg
              and "drop <entry>" in msg and "abort" in msg,
              "a failing step ends lead with FAILED: which step, and what the leader can do")
        check(keys(n0) == [f"gates:{ga}", "main:desktop", "main:mobile", "main:mobile"] and "running it again (1 of 1)" in out
              and "last line of main:mobile" in out,
              "a failed gate runs once more before lead gives up, nothing after it runs, and the end of its log is shown")
        check(RL.held_by_me(lock, D) and lock.get("batch") == [p[6]["id"], q[0]["id"], q[1]["id"]]
              and V.line_ids(S[0], "waiting") == [p[6]["id"], q[0]["id"], q[1]["id"]] and os.environ[V.LIVE] == "19.6.101",
              "the lock stays with the leader, the changes stay in the batch and nothing went live")
        # 3b. the real step runner (stood in for everywhere else): the time limit, the lock kept alive, a program that is missing
        RB.LEAD_POLL_S, RB.LEAD_RENEW_S = 0.3, 0
        exp0 = RL.read_remote_lock(S[0])[1]["expiresAt"]
        tick(120)
        import time as _time  # noqa: PLC0415
        t_real = _time.monotonic()
        rc_slow = real_exec({"key": "t", "argv": [sys.executable, "-c", "import time; time.sleep(120)"], "cwd": D, "timeout": 1},
                            tmp / "t-slow.log", dict(os.environ), D)
        took = _time.monotonic() - t_real
        exp1 = RL.read_remote_lock(S[0])[1]["expiresAt"]
        check(rc_slow == -9 and took < 60 and "over its limit" in text(tmp / "t-slow.log"),
              "a step over its time limit is stopped (with what it started) and counts as failed")
        check(exp1 > exp0 and RL.held_by_me(RL.read_remote_lock(S[0])[1], D),
              "while a step runs, the release lock is renewed, so a long gate never lets it expire")
        rc_ok = real_exec({"key": "t", "argv": [sys.executable, "-c", "print('gate says hi')"], "cwd": D}, tmp / "t-ok.log", dict(os.environ), D)
        rc_none = real_exec({"key": "t", "argv": ["no-such-program-isabi"], "cwd": D}, tmp / "t-none.log", dict(os.environ), D)
        check(rc_ok == 0 and "gate says hi" in text(tmp / "t-ok.log") and rc_none == -2 and "could not start" in text(tmp / "t-none.log"),
              "a step's output is kept in its log; a program that cannot start is a failed step, not a crash")
        RB.LEAD_POLL_S, RB.LEAD_RENEW_S = real_poll, real_renew
        # 3c. one lead at a time in a worktree
        pid_file = RL.git_dir(D) / RB.LEAD_PID_FILE
        pid_file.write_text(json.dumps({"pid": os.getppid(), "host": RB.socket.gethostname(), "at": "now"}), encoding="utf-8")
        n1 = len(calls)
        kind, why = raises(RB.lead, D)
        check(kind == "BatchError" and "already running in this worktree" in why and keys(n1) == [] and pid_file.exists(),
              "a second lead in the same worktree is refused while the first one runs (no step runs twice)")
        pid_file.write_text(json.dumps({"pid": 99999999, "host": RB.socket.gethostname()}), encoding="utf-8")
        (state, msg), out = said(RB.lead, D)
        check(state == "SHIPPED" and not pid_file.exists(), "a mark left by a lead that was killed does not hold the next one back")
        check(state == "SHIPPED" and "v19.6.102" in msg and keys(n1) == ["main:mobile", "main:boot", "sync", "deploy", "push:app", "push:site"],
              "lead again (no --holder needed) carries on from the step that failed: what passed is not run twice")
        check(RL.read_remote_lock(S[0]) == ("", {}) and not V.line_ids(S[0], "waiting"), "that batch shipped all three")

        # 4. a gate that fails once and passes on its second run does not stop the batch
        r = [join(1, "r1", gates=(ga,))]
        fail["gates:"] = 1
        n2 = len(calls)
        tick()
        (state, msg), out = said(RB.lead, D, holder="driver")
        check(state == "SHIPPED" and keys(n2)[:2] == [f"gates:{ga}", f"gates:{ga}"] and "on try 2" in out,
              "a gate that passes on its second run counts as passed, and the output says so")

        # 5. the leader drops the change whose gate fails: every step runs again for the smaller batch
        x = join(1, "x1", gates=(ga,))
        y = join(2, "y1", gates=(gb,))
        fail["verify_a"] = 99
        tick()
        n3 = len(calls)
        (state, msg), out = said(RB.lead, D, holder="driver")
        check(state == "FAILED" and "stopped at step gates" in msg and x["id"] in msg and "session 1" in msg,
              "a failing named gate names the change that asked for it")
        tick()
        quiet(RB.drop, D, x["id"], reason="verify_a.mjs failed", reset=True)
        n4 = len(calls)
        (state, msg), out = said(RB.lead, D)
        check(state == "SHIPPED" and keys(n4)[0] == f"gates:{gb}" and f"gates:{ga}" not in keys(n4) and "main:desktop" in keys(n4)
              and V.entry(S[0], x["id"]).get("state") == "left_out" and V.entry(S[0], y["id"]).get("state") == "shipped",
              "after a drop, lead gates the rebuilt batch from the start and ships it; the dropped change is left out")
        fail.clear()
        quiet(RB.leave, S[0], x["id"])

        # 6. only a node or python script under build/ that is in the batch runs as a named gate
        cwd_a, argv_a = RB._gate_command("isabi-app: node build/verify_a.mjs --mobile", D, D_app)
        cwd_y, argv_y = RB._gate_command("isabi:  python build/verify_y.py", D, D_app)
        check(cwd_a == D_app and argv_a == ["node", "build/verify_a.mjs", "--mobile"] and cwd_y == D
              and argv_y == [sys.executable, "build/verify_y.py"],
              "a named gate runs in the repo it names, with its own arguments (python gates on this interpreter)")
        check(RB._gate_command("isabi-app: node build\\verify_a.mjs", D, D_app)[1] == ["node", "build/verify_a.mjs"],
              "a gate path typed with backslashes is read the same")
        put(D / "build" / "deploy_cloudflare.py", "raise SystemExit('never run as a gate')\n")
        put(D / "build" / "release_lock.py.bak", "")
        put(D / "build" / "sync_app.py", "raise SystemExit('never run as a gate')\n")
        refused = ["isabi: python build/deploy_cloudflare.py --pages-only", "isabi: python build/release_lock.py release --force",
                   "isabi: python build/sync_app.py", "isabi: python build/release_batch.py done", "isabi-app: node build/_browser_slot.mjs"]
        check(all(raises(RB._gate_command, g, D, D_app)[0] == "BatchError" for g in refused),
              "a script that deploys, releases the lock or syncs is never run as a named gate: only verify_*, audit_* and check_*")
        for f in ("deploy_cloudflare.py", "release_lock.py.bak", "sync_app.py"):
            (D / "build" / f).unlink()
        bad = ["node build/verify_a.mjs", "isabi-app: powershell -c Remove-Item x", "isabi-app: node ../outside.mjs",
               "isabi-app: node build/../../outside.mjs", "isabi-app: node build/missing.mjs", "isabi-app: node", "elsewhere: node build/verify_a.mjs",
               'isabi-app: node "build/verify_a.mjs', "isabi-app: node -e process.exit(0)"]
        check(all(raises(RB._gate_command, g, D, D_app)[0] == "BatchError" for g in bad),
              "anything else named as a gate is refused: no repo, another program, a path outside build/, a missing file")
        z = join(3, "z1", gates=("isabi-app: npx something",))
        tick()
        n5 = len(calls)
        (state, msg), out = said(RB.lead, D, holder="driver")
        check(state == "FAILED" and "run it by hand" in out and keys(n5) == [] and RL.held_by_me(RL.read_remote_lock(S[0])[1], D),
              "a gate lead will not run stops the batch before anything else, with the lock held")
        (state, msg), out = said(RB.lead, D, from_step="main")
        check(state == "SHIPPED" and keys(n5) == ["main:desktop", "main:mobile", "main:boot", "sync", "deploy", "push:app", "push:site"],
              "lead --from main: the leader ran that gate by hand, and lead does the rest")

        # 7. what sync_app.py leaves behind is checked before it is committed
        w = join(1, "w1")
        extra["stray"] = True
        tick()
        n6 = len(calls)
        (state, msg), out = said(RB.lead, D, holder="driver")
        main_before = git(seed, "ls-remote", "origin", "refs/heads/main").split()[0]
        check(state == "FAILED" and "stopped at step commit" in msg and "stray.txt" in msg and keys(n6)[-1] == "sync"
              and git(D, "log", "-1", "--format=%s").startswith("batch:") is not None and "deploy" not in keys(n6),
              "a file outside app/ after sync_app.py stops the batch at the commit: nothing is committed, deployed or pushed")
        (D / "stray.txt").unlink()
        extra.clear()
        n7 = len(calls)
        (state, msg), out = said(RB.lead, D)
        check(state == "SHIPPED" and keys(n7) == ["deploy", "push:app", "push:site"]
              and git(seed, "ls-remote", "origin", "refs/heads/main").split()[0] != main_before,
              "once it is cleared, lead carries on at the commit without running sync_app.py again")
        w2 = join(2, "w2")
        extra["crlf"] = True
        tick()
        (state, msg), out = said(RB.lead, D, holder="driver")
        check(state == "FAILED" and "CRLF" in msg and not git(D, "diff", "--cached", "--name-only"),
              "a bundle staged with CRLF line endings is not committed (live would differ from main)")
        extra.clear()
        git(D, "checkout", "--", ".")     # the leader "cleans up", and sync_app.py's output goes with it
        git(D, "clean", "-fdq")
        n_c = len(calls)
        (state, msg), out = said(RB.lead, D)
        check(state == "FAILED" and "not the batch's v" in msg and "lead --from sync" in out and "deploy" not in keys(n_c),
              "a bundle that lost sync_app.py's output is never deployed as if there were nothing to commit")
        (state, msg), out = said(RB.lead, D, from_step="sync")
        check(state == "SHIPPED" and keys(n_c) == ["sync", "deploy", "push:app", "push:site"],
              "lead --from sync runs sync_app.py again and ships the batch")

        # 8. lead when there is nothing to do, and when another session is releasing
        tick()
        (state, msg), out = said(RB.lead, D, holder="driver")
        check(state == "NOTHING" and RL.read_remote_lock(S[0]) == ("", {}), "nothing waiting: NOTHING, and the lock is not taken")
        check(raises(RB.lead, D)[0] == "BatchError", "lead without --holder in a worktree that leads no batch is refused")
        v = join(1, "v1")
        tick()
        quiet(RL.acquire, S[1], holder="another session", purpose="release")
        (state, msg), out = said(RB.lead, D, holder="driver")
        check(state == "BUSY" and "another session" in msg and V.exits(RB.main, ["lead", "--from", "commit"]) == 2,
              "another session holds the lock: BUSY, naming it (and --from only takes a step a leader can start at)")
        kind, why = raises(RB.lead, D, holder="driver", from_step="deploy")
        check(kind == "BatchError" and "--from is for a batch this worktree already leads" in why and RL.held_by_me(RL.read_remote_lock(S[0])[1], S[1]),
              "lead --from never skips the gates of a batch it would only now take")

        # 9. drive: batch after batch until the line is empty
        (state, msg), out = said(RB.drive, D, holder="driver", wait_s=0, poll_s=0)
        check(state == "WAITING" and "another session" in msg and "1 waiting" in msg,
              "drive behind another session's release: WAITING after its wait, naming who releases")
        git(S[1], "fetch", "-q", "origin")
        git(S[1], "checkout", "-q", "--detach", "origin/main")
        git(S[1], "commit", "-q", "--allow-empty", "-m", "live, never pushed")
        quiet(RL.claim_deploy, S[1], git(S[1], "rev-parse", "HEAD"), "pages-only deploy")
        tick(90 * 60)   # that session is gone: its lock is long expired, with a deploy that is not on main
        spawned[0] = 0
        try:
            (state, msg), out = said(RB.drive, D, holder="driver", wait_s=600, poll_s=0)
        except RL.LockError as exc:
            state, msg = "RAISED", str(exc)
        check(state in ("FAILED", "RAISED") and "not on origin/main" in msg and spawned[0] == 1
              and V.line_ids(S[0], "waiting") == [v["id"]],
              "an expired lock whose deploy is not on main stops drive at once, saying so: it never loops on it")
        quiet(RL.release, S[1], force=True)
        d = [join(1 + i % 3, f"d{i}") for i in range(1, 9)]
        tick()
        n8 = len(calls)
        (state, msg), out = said(RB.drive, D, holder="driver", poll_s=0)
        check(state == "EMPTY" and "2 batches shipped" in msg and keys(n8).count("deploy") == 2
              and RL.read_remote_lock(S[0]) == ("", {}) and not V.line_ids(S[0], "waiting"),
              "drive leads batch after batch until nothing waits: 9 changes go out in two batches")
        rec = [json.loads(ln) for ln in batch_log.read_text(encoding="utf-8").splitlines() if ln.strip()]
        check([r_["changes"] for r_ in rec[-2:]] == [6, 3] and [r_["cap"] for r_ in rec[-2:]] == [6, 3],
              "the first batch of a long line takes 6, the next one 3 again")
        f1 = [join(1 + i % 3, f"f{i}") for i in range(1, 5)]
        tick()
        (state, msg), out = said(RB.drive, D, holder="driver", batches=1, poll_s=0)
        check(state == "DONE" and "1 batch shipped" in msg and V.line_ids(S[0], "waiting") == [f1[3]["id"]],
              "drive --batches 1 stops after one batch; the rest stays in line")
        fail["sync"] = 1
        tick()
        (state, msg), out = said(RB.drive, D, holder="driver", poll_s=0)
        check(state == "FAILED" and "stopped at step sync" in msg and RL.held_by_me(RL.read_remote_lock(S[0])[1], D),
              "drive stops at a failing step like lead: FAILED, with the lock held for the leader to decide")
        (state, msg), out = said(RB.drive, D, holder="driver", poll_s=0)
        check(state == "EMPTY" and "1 batch shipped" in msg and not V.line_ids(S[0], "waiting"),
              "drive again carries on with the batch it leads, then finds the line empty")
        (state, msg), out = said(RB.drive, D, holder="driver", idle_s=50, poll_s=0)
        check(state == "EMPTY" and "watching it" in out, "drive --idle keeps watching an empty line for that long, then ends")

        # 10. a change whose session went quiet: skipped, unless the owner tells the driver to ship for stopped sessions
        old = join(1, "old1", gates=(ga,))
        tick(4 * 3600)
        new = join(2, "new1")
        tick()
        (state, msg), out = said(RB.drive, D, holder="driver", poll_s=0)
        e_old = V.entry(S[0], old["id"])
        check(state == "EMPTY" and e_old.get("state") == "waiting" and not e_old.get("drivenBy") and RB._is_stale(e_old)
              and V.entry(S[0], new["id"]).get("state") == "shipped",
              "drive by itself never ships a change whose session has gone quiet")
        tick()
        n9 = len(calls)
        (state, msg), out = said(RB.drive, D, holder="driver", stopped_sessions=True, poll_s=0)
        e_old2 = V.entry(S[0], old["id"])
        check(state == "EMPTY" and e_old2.get("state") == "shipped" and e_old2.get("holder") == "session 1"
              and e_old2.get("app") == old.get("app") and "kept in line for its quiet session" in out and f"gates:{ga}" in keys(n9),
              "drive --stopped-sessions ships it for its session: same entry, same commits, its own gates")
        old2 = join(1, "old2")
        tick(4 * 3600)
        kept = quiet(RB._adopt_stopped, D, "driver")
        _st, out = said(lambda: RB._print_status(RB.status(S[0])))
        check([e["id"] for e in kept] == [old2["id"]] and kept[0].get("drivenBy") == "driver" and not RB._is_stale(V.entry(S[0], old2["id"]))
              and "kept in line by driver" in out, "status says who keeps a quiet session's change in line")

        # 11. wiring
        check(V.exits(RB.main, ["drive"]) == 2 and V.exits(RB.main, ["lead", "--max", "few"]) == 2,
              "the CLI refuses drive without --holder and a limit that is not a number (exit 2)")
        wf = (BUILD.parent / ".github" / "workflows" / "deploy.yml").read_text(encoding="utf-8")
        check("python3 build/verify_release_lead.py" in wf, "the push-to-main workflow runs this gate")
        src = (BUILD / "release_batch.py").read_text(encoding="utf-8")
        check('ISABI_BROWSER_SLOT_PRIORITY="leader"' in src and "deploy_cloudflare.py\", \"--pages-only\"" in src,
              "lead marks its commands as the release leader's and deploys from this PC (--pages-only)")
    finally:
        RB._lead_exec, RB._spawn_lead, RB._sleep, RB._mono = real_exec, real_spawn, real_sleep, real_mono
        RB.LEAD_POLL_S, RB.LEAD_RENEW_S = real_poll, real_renew
        for k, v in saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        shutil.rmtree(tmp, ignore_errors=True)

    failed = [n for ok, n in V.RESULTS if not ok]
    print(f"\nverify_release_lead: {len(V.RESULTS) - len(failed)}/{len(V.RESULTS)} checks passed")
    for n in failed:
        print(f"FAILED: {n}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
