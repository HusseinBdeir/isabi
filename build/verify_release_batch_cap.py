"""Gate: the batch size limit of build/release_batch.py (owner 2026-11-25: release one or a few changes at a time).

Offline, like verify_release_batch.py (whose helpers it uses): two bare repositories in a temp folder stand in for
HusseinBdeir/isabi and HusseinBdeir/isabi-app; each session is a pair of clones side by side. Never touches the real
remotes, the working tree of this checkout or Cloudflare.
Run: python build/verify_release_batch_cap.py      (exit 1 with every failed check named)
"""
from __future__ import annotations

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

check, git, tick, quiet, raises, put = V.check, V.git, V.tick, V.quiet, V.raises, V.put
ENV_KEYS = ("ISABI_RELEASE_LOCK", "ISABI_RELEASE_BACKEND", "ISABI_RELEASE_API_URL", RB.MAX_BATCH_ENV, V.NOW, V.LIVE, *V.IDENT)


def ids(batch: dict, key: str = "entries") -> list[str]:
    return [e["id"] for e in batch.get(key) or []]


def main() -> int:  # noqa: PLR0915
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="isabi-release-cap-"))
    saved = {k: os.environ.get(k) for k in ENV_KEYS}
    for k in ("ISABI_RELEASE_LOCK", "ISABI_RELEASE_BACKEND", "ISABI_RELEASE_API_URL", RB.MAX_BATCH_ENV):
        os.environ.pop(k, None)
    os.environ.update(V.IDENT)
    os.environ[V.LIVE] = "19.6.100"
    tick()
    try:
        for name in ("isabi.git", "isabi-app.git"):
            git(tmp, "init", "-q", "--bare", "-b", "main", str(tmp / name))
        seed = V.session(tmp, "seed")
        seed_app = seed.parent / "isabi-app"
        for rel, body in (("sw.js", V.SW), ("index.html", V.INDEX), ("manifest.json", V.MANIFEST), ("js/app.js", V.APP_JS)):
            put(seed_app / rel, body)
        for rel, body in (("app/sw.js", V.SW), ("functions/_lib/deployed_shell.js", "export const DEPLOYED_SHELL_VER = '19.6.100';\n"),
                          ("functions/api.js", V.API_JS)):
            put(seed / rel, body)
        for repo in (seed_app, seed):
            git(repo, "add", "-A")
            git(repo, "commit", "-q", "-m", "seed")
            git(repo, "push", "-q", "origin", "HEAD:main")
        S = [V.session(tmp, f"S{i}") for i in range(1, 6)]
        apps = [s.parent / "isabi-app" for s in S]

        def join(i: int, name: str, *, on: str = "") -> dict:
            """Session i (1-based) pushes a change in its own file (or on top of the branch `on`) and joins the line."""
            files = {f"js/{name}.js": f"{name}\n"}
            if on:
                V.stacked(apps[i - 1], f"wt/{name}", on, files)
            else:
                V.feature(apps[i - 1], f"wt/{name}", files)
            tick()
            return quiet(RB.join, S[i - 1], holder=f"session {i}", summary=f"{name} change", app_branch=f"wt/{name}")

        def finish(i: int) -> None:
            V.release_as_leader(S[i - 1])
            tick()
            quiet(RB.done, S[i - 1])

        # 1. the limit itself
        check(RB.MAX_BATCH == 3 and RB.batch_cap() == 3, "a batch takes at most 3 changes by default")
        os.environ[RB.MAX_BATCH_ENV] = "2"
        check(RB.batch_cap() == 2 and RB.batch_cap(5) == 5 and RB.batch_cap(0) == 0,
              "ISABI_BATCH_MAX changes the limit; --max wins over it; 0 means no limit")
        os.environ[RB.MAX_BATCH_ENV] = "few"
        check("whole number" in raises(RB.batch_cap)[1], "a limit that is not a number is refused")
        os.environ.pop(RB.MAX_BATCH_ENV)
        check("0 (no limit) or more" in raises(RB.batch_cap, -1)[1], "a negative limit is refused")

        # 2. five changes wait; the fifth session leads: the first two in line and its own
        p = [join(i, f"p{i}") for i in range(1, 6)]
        check("0 (no limit) or more" in raises(RB.ship, S[4], holder="session 5", summary="p5 change", app_branch="wt/p5",
                                                wait_s=0, poll_s=0, quiet=True, max_changes=-1)[1]
              and len(RB.read_line(S[0])) == 5 and RL.read_remote_lock(S[0]) == ("", {}),
              "ship with a bad limit stops before touching the line or the lock")
        tick()
        b1 = quiet(RB.take, S[4], holder="session 5")
        check(ids(b1) == [p[0]["id"], p[1]["id"], p[4]["id"]] and not b1["left_out"],
              "a leader further back takes the first changes in line and its own: 3 in the batch, in line order")
        check(ids(b1, "later") == [p[2]["id"], p[3]["id"]] and b1.get("cap") == 3,
              "the batch names the changes that wait for the next one")
        lock = RL.read_remote_lock(S[0])[1]
        check(lock.get("purpose") == "batch release of 3" and lock.get("batch") == ids(b1), "the lock names the 3 changes being released")
        e3 = V.entry(S[0], p[2]["id"])
        st, msg, _free = RB.poll_once(S[2], p[2]["id"])
        check(e3.get("state") == "waiting" and not e3.get("batch") and st == "WAITING" and "3 of 5 in line" in msg
              and RB.poll_once(S[0], p[0]["id"])[0] == "IN_BATCH",
              "a change over the limit stays in line, unmarked and waiting, behind the ones being released")
        check(all((apps[4] / "js" / f"p{i}.js").exists() for i in (1, 2, 5)) and not (apps[4] / "js" / "p3.js").exists()
              and not (apps[4] / "js" / "p4.js").exists(), "only the batch's changes are merged")
        finish(5)
        check(RL.read_remote_lock(S[0]) == ("", {}) and V.line_ids(S[0], "waiting") == [p[2]["id"], p[3]["id"]],
              "after done the lock is free and the rest is still waiting, in order")
        check(RB.poll_once(S[2], p[2]["id"])[0] == "TURN", "the first of the rest leads the next batch")

        # 3. a waiting change that a picked one is built on rides along, above the limit
        base = None
        V.feature(apps[4], "wt/base", {"js/base.js": "base\n"})  # pushed now, joins the line last
        top = join(2, "top", on="wt/base")
        tick()
        base = quiet(RB.join, S[4], holder="session 5", summary="base change", app_branch="wt/base")
        tick()
        b2 = quiet(RB.take, S[2], holder="session 3")
        check(ids(b2) == [p[2]["id"], p[3]["id"], top["id"], base["id"]] and not b2["left_out"] and not b2.get("later"),
              "a waiting change the batch is built on rides in the same batch, above the limit")
        check(any(base["id"] in n and "rides in this batch" in n for n in b2["notes"]), "the batch says which change rides along and why")
        finish(3)
        check(RL.read_remote_lock(S[0]) == ("", {}) and not V.line_ids(S[0], "waiting"), "that batch ships all four")

        # 3b. a change never goes live in part: `upper` is built on the first push of `lower`; lower then pushes a fix
        # and joins again (a new entry at the back of the line). Shipping upper alone would take lower's first push
        # live without the fix, so lower rides with it.
        low1 = join(5, "lower")
        upper = join(2, "upper", on="wt/lower")
        put(apps[4] / "js" / "lower.js", "lower, fixed\n")
        git(apps[4], "checkout", "-q", "wt/lower")
        git(apps[4], "add", "-A")
        git(apps[4], "commit", "-q", "-m", "lower: the fix")
        git(apps[4], "push", "-q", "origin", "wt/lower")
        tick()
        low2 = quiet(RB.join, S[4], holder="session 5", summary="lower change", app_branch="wt/lower")
        check(low2["id"] != low1["id"] and V.line_ids(S[0], "waiting") == [upper["id"], low2["id"]],
              "a change pushed again with a fix joins again at the back of the line")
        tick()
        b2b = quiet(RB.take, S[1], holder="session 2", max_changes=1)
        check(ids(b2b) == [upper["id"], low2["id"]] and not b2b["left_out"]
              and V.text(apps[1] / "js" / "lower.js") == "lower, fixed\n",
              "a waiting change that shares unreleased commits with a picked one ships with it, fix included")
        finish(2)
        check(RL.read_remote_lock(S[0]) == ("", {}) and not V.line_ids(S[0], "waiting"), "that batch ships both")

        # 4. one at a time, a limit for one command, and no limit
        q = [join(i, f"q{i}") for i in (1, 2, 4)]
        tick()
        b3 = quiet(RB.take, S[3], holder="session 4", max_changes=1)
        check(ids(b3) == [q[2]["id"]] and ids(b3, "later") == [q[0]["id"], q[1]["id"]],
              "--max 1: the leader ships its own change alone; the others keep their order")
        quiet(RB.abort, S[3])
        os.environ[RB.MAX_BATCH_ENV] = "2"
        tick()
        b4 = quiet(RB.take, S[0], holder="session 1")
        check(ids(b4) == [q[0]["id"], q[1]["id"]] and ids(b4, "later") == [q[2]["id"]], "ISABI_BATCH_MAX=2: the first two in line")
        quiet(RB.abort, S[0])
        os.environ.pop(RB.MAX_BATCH_ENV)
        tick()
        b5 = quiet(RB.take, S[1], holder="session 2", max_changes=0)
        check(ids(b5) == [e["id"] for e in q] and not b5.get("later"), "--max 0: no limit, everything waiting ships together")
        quiet(RB.abort, S[1])
        check(RL.read_remote_lock(S[0]) == ("", {}) and V.line_ids(S[0], "waiting") == [e["id"] for e in q],
              "abort gives every change back to the line")
        for idx, ent in enumerate(q):
            quiet(RB.leave, S[[0, 1, 3][idx]], ent["id"])

        # 4b. drop --reset refills back up to batch cap from waiting entries (and respects --max 1 + riders)
        r = [join(1 + (i - 1) % 5, f"rf{i}") for i in range(1, 6)]
        tick()
        br1 = quiet(RB.take, S[0], holder="session 1")
        check(ids(br1) == [r[0]["id"], r[1]["id"], r[2]["id"]] and ids(br1, "later") == [r[3]["id"], r[4]["id"]],
              "drop-refill setup picks first 3 of 5")
        tick()
        br2 = quiet(RB.drop, S[0], r[1]["id"], reason="verify_rf2 failed", reset=True)
        lock_rf = RL.read_remote_lock(S[0])[1]
        check(ids(br2) == [r[0]["id"], r[2]["id"], r[3]["id"]]
              and ids(br2, "later") == [r[4]["id"]]
              and br2.get("cap") == 3
              and lock_rf.get("batch") == [r[0]["id"], r[2]["id"], r[3]["id"]]
              and (apps[0] / "js" / "rf4.js").exists() and not (apps[0] / "js" / "rf2.js").exists()
              and not (apps[0] / "js" / "rf5.js").exists()
              and any("refilled 1 waiting change" in n for n in br2.get("notes") or []),
              "drop --reset refills the vacated slot from later waiting entries up to cap")
        quiet(RB.abort, S[0])
        for i, ent in enumerate(r):
            quiet(RB.leave, S[i % 5], ent["id"])

        u = [join(i, f"u{i}") for i in range(1, 4)]
        tick()
        bu1 = quiet(RB.take, S[0], holder="session 1", max_changes=1)
        tick()
        bu2 = quiet(RB.drop, S[0], u[0]["id"], reason="verify_u1 failed", reset=True)
        check(ids(bu1) == [u[0]["id"]] and ids(bu2) == [u[1]["id"]] and ids(bu2, "later") == [u[2]["id"]] and bu2.get("cap") == 1,
              "drop --reset respects --max 1 when refilling")
        quiet(RB.abort, S[0])
        for i, ent in enumerate(u):
            quiet(RB.leave, S[i], ent["id"])

        # stacked rider pulled when drop refills its dependent
        t1 = join(1, "tr1")
        t2 = join(2, "tr2")
        t3 = join(3, "tr3")
        V.feature(apps[4], "wt/tr_base", {"js/tr_base.js": "tr_base\n"})
        t4_top = join(4, "tr4_top", on="wt/tr_base")
        tick()
        t5_base = quiet(RB.join, S[4], holder="session 5", summary="tr_base change", app_branch="wt/tr_base")
        tick()
        bt1 = quiet(RB.take, S[0], holder="session 1")
        tick()
        bt2 = quiet(RB.drop, S[0], t2["id"], reason="verify_tr2 failed", reset=True)
        check(ids(bt1) == [t1["id"], t2["id"], t3["id"]]
              and ids(bt2) == [t1["id"], t3["id"], t4_top["id"], t5_base["id"]]
              and not bt2.get("later")
              and any(t5_base["id"] in n and "rides in this batch" in n for n in bt2.get("notes") or []),
              "drop --reset refill pulls stacked unreleased-commit riders along above cap")
        quiet(RB.abort, S[0])
        for sess, ent in ((S[0], t1), (S[1], t2), (S[2], t3), (S[3], t4_top), (S[4], t5_base)):
            quiet(RB.leave, sess, ent["id"])

        # 5. wiring
        check(V.exits(RB.main, ["take", "--holder", "x", "--max", "few"]) == 2, "the CLI rejects a limit that is not a number (exit 2)")
        wf = (BUILD.parent / ".github" / "workflows" / "deploy.yml").read_text(encoding="utf-8")
        check("python3 build/verify_release_batch_cap.py" in wf, "the push-to-main workflow runs this gate")
    finally:
        for k, v in saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        shutil.rmtree(tmp, ignore_errors=True)

    failed = [n for ok, n in V.RESULTS if not ok]
    print(f"\nverify_release_batch_cap: {len(V.RESULTS) - len(failed)}/{len(V.RESULTS)} checks passed")
    for n in failed:
        print(f"FAILED: {n}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
