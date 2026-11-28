"""Offline regression gate for build/release_data_only.py desktop-suite stamp and abort semantics."""
from __future__ import annotations

import argparse
import contextlib
import hashlib
import io
import json
import os
import subprocess
import sys
import tarfile
import tempfile
import types
from pathlib import Path

HERE = Path(__file__).resolve().parent
ISABI_ROOT = HERE.parent
sys.path.insert(0, str(HERE))

import release_data_only as rdo  # noqa: E402
import release_lock as rl  # noqa: E402


def _sha10(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()[:10]


def _git(repo: Path, *args: str) -> str:
    r = subprocess.run(["git", *args], cwd=str(repo), capture_output=True, text=True, check=True)
    return r.stdout.strip()


def _init_repo(repo: Path) -> None:
    repo.mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "init", "-q"], cwd=str(repo), check=True)
    subprocess.run(["git", "config", "user.name", "Test User"], cwd=str(repo), check=True)
    subprocess.run(["git", "config", "user.email", "test@isabi.invalid"], cwd=str(repo), check=True)
    subprocess.run(["git", "config", "core.autocrlf", "false"], cwd=str(repo), check=True)


def _seed_pair_repos(base: Path) -> tuple[Path, Path, Path]:
    site = base / "isabi"
    app = base / "isabi-app"
    out_dir = base / "out"
    _init_repo(site)
    _init_repo(app)

    core_v1 = json.dumps({"generated_at": "2026-11-18T10:00:00Z", "rows": 1}).encode("utf-8")
    recs_v1 = json.dumps({"sales_tickets": [{"id": "s1"}]}).encode("utf-8")
    ind_v1 = json.dumps({"trd": []}).encode("utf-8")
    c_h, r_h, i_h = _sha10(core_v1), _sha10(recs_v1), _sha10(ind_v1)

    manifest = {
        "generated_at": "2026-11-18T10:00:00Z",
        "core": f"./js/seed_core.json?d={c_h}",
        "records": f"./js/seed_records.json?d={r_h}",
        "apiCore": f"./api/seed/core?d={c_h}",
        "apiRecords": f"./api/seed/records?d={r_h}",
        "coreHash": c_h,
        "recordsHash": r_h,
        "industriesHash": i_h,
    }
    man_bytes = (
        "// generated\n"
        + "(typeof self!=='undefined'?self:window).__MFG_SEED_MANIFEST="
        + json.dumps(manifest, separators=(",", ":"))
        + ";\n"
    ).encode("utf-8")
    idx_bytes = (
        f'<!doctype html><html><script src="js/seed_manifest.js?v=19.6.999&amp;d={c_h}"></script></html>'
    ).encode("utf-8")

    for p, content in (
        (app / "index.html", b'<html><script src="js/seed_manifest.js?v=19.6.999"></script></html>'),
        (app / "sw.js", b'const SHELL_CACHE = "isabi-mfg-v19.6.999";\n'),
        (app / "js" / "local_dev_roster.js", b'window.__ISABI_LOCAL_DEV_USERS = [{"email":"husseinbdeir@bhfirms.com"}];\n'),
        (app / "build" / "verify_mfg.mjs", b"// stub suite\n"),
        (app / "js" / "seed_core.json", core_v1),
        (app / "js" / "seed_records.json", recs_v1),
        (app / "js" / "seed_industries.json", ind_v1),
        (app / "data" / "mfg.db", b"SQLITE-V1"),
        (app / "data" / "mfg_snapshot.json", b'{"generated_at":"2026-11-18T10:00:00Z"}'),
    ):
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(content)
    _git(app, "add", "-A")
    _git(app, "commit", "-q", "-m", "init app v1")

    for p, content in (
        (site / "app" / "sw.js", b'const SHELL_CACHE = "isabi-mfg-v19.6.999";\n'),
        (site / "app" / "index.html", idx_bytes),
        (site / "app" / "js" / "seed_manifest.js", man_bytes),
        (site / "app" / "js" / "local_dev_roster.js", b'window.__ISABI_LOCAL_DEV_USERS = [];\n'),
        (site / "app" / "css" / "app.css", b"body{}\n"),
    ):
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(content)
    _git(site, "add", "-A")
    _git(site, "commit", "-q", "-m", "init site v1")
    return site, app, out_dir


def _make_tar_bytes(entries: list[tuple[str, bytes, bytes | None]]) -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:") as tf:
        for name, data, sym_target in entries:
            ti = tarfile.TarInfo(name=name)
            if sym_target is not None:
                ti.type = tarfile.SYMTYPE
                ti.linkname = sym_target.decode("utf-8")
                tf.addfile(ti)
            else:
                ti.size = len(data)
                tf.addfile(ti, io.BytesIO(data))
    return buf.getvalue()


def _test_extract_tar_security() -> None:
    with tempfile.TemporaryDirectory(prefix="verify-tar-") as td:
        dest = Path(td) / "dest"
        dest.mkdir()
        # Dotfile and exact ./ prefix must keep leading dot
        dot_tar = _make_tar_bytes([("./.well-known/security.txt", b"contact=sec", None)])
        rdo._extract_tar_bytes(dot_tar, dest)
        assert (dest / ".well-known" / "security.txt").read_bytes() == b"contact=sec", "leading dotfile must preserve dot"
        assert not (dest / "well-known").exists()

        for bad_name, sym in (("../escape.txt", None), ("/etc/passwd", None), ("sub\\win.txt", None), ("sym_link", b"/etc/passwd")):
            bad_tar = _make_tar_bytes([(bad_name, b"x", sym)])
            blocked = False
            try:
                rdo._extract_tar_bytes(bad_tar, dest)
            except SystemExit:
                blocked = True
            assert blocked, f"_extract_tar_bytes failed to reject unsafe archive entry: {bad_name!r}"
    print("ok   _extract_tar_bytes preserves dotfiles and rejects traversal/absolute/backslash/symlink entries")


def _run_wait_lock_tests(*, check_bypass_subprocess: bool = False) -> None:
    with tempfile.TemporaryDirectory(prefix="verify-rdo-wait-") as wtd:
        wbase = Path(wtd)
        orig_w = wbase / "origin.git"
        subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(orig_w)], check=True)
        seed_w = wbase / "seed"
        subprocess.run(["git", "clone", "-q", str(orig_w), str(seed_w)], check=True)
        for cfg in (("user.name", "T"), ("user.email", "t@t"), ("core.autocrlf", "false")):
            subprocess.run(["git", "config", *cfg], cwd=str(seed_w), check=True)
        (seed_w / "f.txt").write_text("x\n", encoding="utf-8")
        subprocess.run(["git", "add", "f.txt"], cwd=str(seed_w), check=True)
        subprocess.run(["git", "commit", "-q", "-m", "init"], cwd=str(seed_w), check=True)
        subprocess.run(["git", "push", "-q", "origin", "HEAD:main"], cwd=str(seed_w), check=True)
        peer_w = wbase / "peer"
        topup_w = wbase / "topup"
        subprocess.run(["git", "clone", "-q", str(orig_w), str(peer_w)], check=True)
        subprocess.run(["git", "clone", "-q", str(orig_w), str(topup_w)], check=True)

        orig_isabi = rdo.ISABI
        orig_lock_mod = rdo.lock_mod
        orig_rl_mono, orig_rl_sleep = rl._mono, rl._sleep
        orig_rdo_mono, orig_rdo_sleep = rdo._mono, rdo._sleep
        try:
            rdo.ISABI = topup_w
            rdo.lock_mod = lambda: rl
            now_v = [0.0]

            def fake_mono() -> float:
                return now_v[0]

            def make_step():
                ticks = []

                def fake_sleep(sec: float) -> None:
                    ticks.append(sec)
                    now_v[0] += max(0.0, sec)
                    if len(ticks) == 2:
                        with contextlib.redirect_stdout(io.StringIO()):
                            rl.release(peer_w)

                return ticks, fake_sleep

            # 6a. Current release_lock (accepts wait_s & poll_s)
            with contextlib.redirect_stdout(io.StringIO()):
                rl.acquire(peer_w, holder="peer batch")
            now_v[0] = 0.0
            ticks_a, sleep_a = make_step()
            rl._mono, rl._sleep = fake_mono, sleep_a
            rdo._mono, rdo._sleep = fake_mono, sleep_a
            with contextlib.redirect_stdout(io.StringIO()):
                rc_wait = rdo.main(["wait-lock", "--wait-lock", "60", "--poll-lock", "10", "--holder", "topup-new"])
            assert rc_wait == 0 and len(ticks_a) == 2 and rl.held_by_me(rl.read_remote_lock(topup_w)[1], topup_w)
            with contextlib.redirect_stdout(io.StringIO()):
                rl.release(topup_w)

            # 6b. Legacy release_lock signature (no wait_s/poll_s parameters), incl. lost race + transient network error
            def legacy_require_release_lock(cwd=topup_w, *, purpose, bypass=False):
                if bypass:
                    return None
                sha_l, info_l = rl.read_remote_lock(cwd)
                if sha_l and rl.held_by_me(info_l, cwd):
                    return rl.renew(cwd, quiet=True, _seen=(sha_l, info_l))
                return rl.acquire(cwd, holder="legacy", purpose=purpose, quiet=True)

            legacy_calls = {"req": 0, "reads": 0}
            orig_rl_read = rl.read_remote_lock

            def legacy_read(cwd=topup_w):
                legacy_calls["reads"] += 1
                if legacy_calls["reads"] == 2:
                    raise rl.LockError("cannot read the release lock from origin (Recv failure: Connection was reset)")
                return orig_rl_read(cwd)

            def legacy_req_raced(cwd=topup_w, *, purpose, bypass=False):
                legacy_calls["req"] += 1
                if legacy_calls["req"] == 1:
                    with contextlib.redirect_stdout(io.StringIO()):
                        rl.acquire(peer_w, holder="racer batch")
                    raise SystemExit(2)
                return legacy_require_release_lock(cwd, purpose=purpose, bypass=bypass)

            legacy_mod = types.SimpleNamespace(
                read_remote_lock=legacy_read,
                held_by_me=rl.held_by_me,
                is_expired=rl.is_expired,
                TAKEOVER_GRACE_MIN=rl.TAKEOVER_GRACE_MIN,
                describe=rl.describe,
                LockError=rl.LockError,
                require_release_lock=legacy_req_raced,
            )
            rdo.lock_mod = lambda: legacy_mod
            with contextlib.redirect_stdout(io.StringIO()):
                rl.acquire(peer_w, holder="peer batch 2")
            now_v[0] = 0.0
            ticks_b = []

            def sleep_b(sec: float) -> None:
                ticks_b.append(sec)
                now_v[0] += max(0.0, sec)
                if len(ticks_b) in (2, 4):
                    with contextlib.redirect_stdout(io.StringIO()):
                        rl.release(peer_w)

            rdo._mono, rdo._sleep = fake_mono, sleep_b
            with contextlib.redirect_stdout(io.StringIO()):
                rc_leg = rdo.main(["wait-lock", "--wait-lock", "120", "--poll-lock", "10"])
            assert rc_leg == 0 and legacy_calls["req"] == 2 and len(ticks_b) == 4 and rl.held_by_me(orig_rl_read(topup_w)[1], topup_w)
            with contextlib.redirect_stdout(io.StringIO()):
                rl.release(topup_w)

            # 6c. Inherited ISABI_RELEASE_LOCK=off is scrubbed so Test 6 still exercises real locking
            if check_bypass_subprocess:
                sub_env = dict(os.environ, ISABI_RELEASE_LOCK="off")
                sub_rc = subprocess.run(
                    [sys.executable, str(HERE / "verify_release_data_only.py"), "--wait-only-selftest"],
                    cwd=str(HERE),
                    env=sub_env,
                    check=False,
                )
                assert sub_rc.returncode == 0
                print("ok   release_data_only wait-lock handles new/legacy signatures, lost races, net hiccups, and env scrub")
        finally:
            rdo.lock_mod = orig_lock_mod
            rl._mono, rl._sleep = orig_rl_mono, orig_rl_sleep
            rdo._mono, rdo._sleep = orig_rdo_mono, orig_rdo_sleep
            rdo.ISABI = orig_isabi


def run_tests(*, wait_only: bool = False) -> None:
    saved_lock_env = {k: os.environ.pop(k, None) for k in ("ISABI_RELEASE_LOCK", "ISABI_RELEASE_LOCK_NOW")}
    try:
        if wait_only:
            _run_wait_lock_tests(check_bypass_subprocess=False)
            return

        src_text = (HERE / "release_data_only.py").read_text(encoding="utf-8")
        assert "sys.argv" not in src_text, "release_data_only.py must remain free of sys.argv"
        print("ok   release_data_only.py has 0 sys.argv references")
        _test_extract_tar_security()

        orig_isabi, orig_app, orig_mods, orig_run = rdo.ISABI, rdo.ISABI_APP, rdo.mods, rdo._run_node_suite
        orig_git = rdo.git
        try:
            with tempfile.TemporaryDirectory(prefix="verify-rdo-") as td:
                base = Path(td)
                site, app, out_dir = _seed_pair_repos(base)
                rdo.ISABI = site
                rdo.ISABI_APP = app
                rdo.mods = lambda: (types.SimpleNamespace(OUT_DIR=out_dir), None)
                rdo.git = lambda args, cwd=site, text=True, input_bytes=None, check=True: subprocess.run(
                    ["git", *args],
                    cwd=str(site if cwd == orig_isabi else cwd),
                    capture_output=True,
                    text=text if input_bytes is None else False,
                    input=input_bytes,
                    check=check,
                )

                # Write new top-up data in isabi-app (uncommitted)
                core_v2 = json.dumps({"generated_at": "2026-11-19T12:00:00Z", "rows": 2}).encode("utf-8")
                recs_v2 = json.dumps({"sales_tickets": [{"id": "s1"}, {"id": "s2"}]}).encode("utf-8")
                c_h2, r_h2 = _sha10(core_v2), _sha10(recs_v2)
                (app / "js" / "seed_core.json").write_bytes(core_v2)
                (app / "js" / "seed_records.json").write_bytes(recs_v2)
                (app / "data" / "mfg.db").write_bytes(b"SQLITE-V2")
                (app / "data" / "mfg_snapshot.json").write_bytes(b'{"generated_at":"2026-11-19T12:00:00Z"}')

                seen_sandboxes: list[Path] = []
                calls = 0

                def fake_suite_pass(cwd: Path) -> int:
                    nonlocal calls
                    calls += 1
                    seen_sandboxes.append(cwd)
                    assert (cwd / "build" / "verify_mfg.mjs").is_file()
                    assert (cwd / "css" / "app.css").is_file(), "site app/ overlay must populate suite root"
                    assert not (cwd / "app" / "sw.js").exists(), "app/ prefix must be stripped when overlaying onto suite sandbox"
                    roster_txt = (cwd / "js" / "local_dev_roster.js").read_text(encoding="utf-8")
                    assert "husseinbdeir@bhfirms.com" in roster_txt, f"site empty stub overwrote local_dev_roster.js: {roster_txt!r}"
                    assert (cwd / "js" / "seed_core.json").read_bytes() == core_v2
                    assert (cwd / "js" / "seed_records.json").read_bytes() == recs_v2
                    assert (cwd / "data" / "mfg.db").read_bytes() == b"SQLITE-V2"
                    idx_txt = (cwd / "index.html").read_text(encoding="utf-8")
                    assert f"seed_manifest.js?v=19.6.999&amp;d={c_h2}" in idx_txt, idx_txt
                    man_txt = (cwd / "js" / "seed_manifest.js").read_text(encoding="utf-8")
                    man_obj = rdo.parse_manifest(man_txt)
                    assert man_obj["coreHash"] == c_h2 and man_obj["recordsHash"] == r_h2
                    return 0

                # 1. check-stage suite runs cleanly against candidate seed and leaves stamp; tempdir removed
                rdo._run_node_suite = fake_suite_pass
                rdo.run_desktop_suite_against_new_seed(skip_suite=False)
                assert calls == 1, f"expected 1 suite call, got {calls}"
                assert seen_sandboxes and not seen_sandboxes[-1].exists(), "temporary sandbox must be cleaned up"
                stamp_file = out_dir / "dataonly_suite_stamp.json"
                assert stamp_file.is_file(), "stamp file must be written after pass"
                print("ok   candidate bundle stages new seed + live shell cleanly, writes stamp, cleans temp dir")

                # 2. stage_commit reuses matching stamp without re-running suite and commits updated manifest + index
                head_before = rdo.head_sha()
                rdo.stage_commit("topup v2")
                assert calls == 1, f"expected stamp reuse (calls=1), got {calls}"
                head_v2 = rdo.head_sha()
                assert head_v2 != head_before
                hm_v2 = rdo.head_manifest()
                assert hm_v2["coreHash"] == c_h2 and hm_v2["recordsHash"] == r_h2
                assert f"d={c_h2}".encode("ascii") in rdo.head_blob("app/index.html")
                print("ok   stage_commit reuses valid stamp without re-running suite and commits manifest + index")

                # 3. Changing seed invalidates stamp; suite failure aborts BEFORE git commit and leaves no stamp/tempdir
                core_v3 = json.dumps({"generated_at": "2026-11-20T08:00:00Z", "rows": 3}).encode("utf-8")
                recs_v3 = json.dumps({"sales_tickets": [{"id": "s1"}, {"id": "s2"}, {"id": "s3"}]}).encode("utf-8")
                (app / "js" / "seed_core.json").write_bytes(core_v3)
                (app / "js" / "seed_records.json").write_bytes(recs_v3)
                failed_sandboxes: list[Path] = []

                def fake_suite_fail(cwd: Path) -> int:
                    nonlocal calls
                    calls += 1
                    failed_sandboxes.append(cwd)
                    return 2

                rdo._run_node_suite = fake_suite_fail
                aborted = False
                try:
                    rdo.stage_commit("topup v3 should abort")
                except SystemExit as exc:
                    aborted = "failed with exit 2" in str(exc)
                assert aborted, "failing suite must raise SystemExit"
                assert calls == 2, f"changed seed must invalidate stamp and invoke suite (calls=2), got {calls}"
                assert failed_sandboxes and not failed_sandboxes[-1].exists(), "failing run must clean up temp dir"
                assert rdo.head_sha() == head_v2, "failing suite must abort BEFORE committing to git"
                assert not _git(site, "diff", "--cached", "--name-only"), "failing suite must leave index clean"
                print("ok   changed seed invalidates stamp, failing suite aborts before commit & cleans temp dir")

                # 4. --skip-suite bypasses suite on emergency override
                rdo.stage_commit("topup v3 skip suite", skip_suite=True)
                assert calls == 2, f"skip_suite=True must not invoke suite (calls=2), got {calls}"
                assert rdo.head_sha() != head_v2
                print("ok   --skip-suite emergency bypass allows commit without invoking suite")

                # 4b. SEED_RELEASE_GATES wiring + real seed-gate execution, stamp reuse, and abort-before-commit
                import sync_app as sa  # noqa: E402
                assert len(sa.SEED_RELEASE_GATES) >= 7
                assert set(sa.SEED_RELEASE_GATES) <= set(sa.RELEASE_GATES)
                assert tuple(sa.SEED_RELEASE_GATES) == tuple(rdo.DEFAULT_SEED_RELEASE_GATES)
                assert ("isabi-app", "build/verify_insp_return_and_compound_nav.mjs", "node") in sa.SEED_RELEASE_GATES
                print("ok   sync_app.SEED_RELEASE_GATES matches release_data_only.DEFAULT_SEED_RELEASE_GATES (subset of RELEASE_GATES)")

                sg_site, sg_app, sg_out = _seed_pair_repos(base / "sg")
                (sg_site / "build").mkdir(parents=True, exist_ok=True)
                (sg_site / "build" / "sync_app.py").write_text(
                    "SEED_RELEASE_GATES = [\n"
                    "    ('isabi-app', 'build/verify_public_names.py', 'python'),\n"
                    "    ('isabi-app', 'build/verify_insp_return_and_compound_nav.mjs', 'node'),\n"
                    "]\n",
                    encoding="utf-8",
                )
                _git(sg_site, "add", "build/sync_app.py")
                _git(sg_site, "commit", "-q", "-m", "commit sync_app SEED_RELEASE_GATES")
                sg_log = base / "sg_gate_calls.log"
                (sg_app / "build" / "verify_public_names.py").write_text(
                    "import json, os, pathlib, sys\n"
                    "assert os.environ.get('ISABI_APP_SRC') == os.getcwd(), (os.environ.get('ISABI_APP_SRC'), os.getcwd())\n"
                    "assert 'ISABI_ROOT' not in os.environ and 'ISABI_NAMES_REQUIRE_REPO' not in os.environ\n"
                    "core = json.loads(pathlib.Path('js/seed_core.json').read_text(encoding='utf-8'))\n"
                    "with open(os.environ['TEST_SG_LOG'], 'a', encoding='utf-8') as fh:\n"
                    "    fh.write(f'py:{core[\"rows\"]}\\n')\n"
                    "print('PASS: stub public names')\n",
                    encoding="utf-8",
                )
                (sg_app / "build" / "verify_insp_return_and_compound_nav.mjs").write_text(
                    "import fs from 'node:fs';\n"
                    "if (process.env.ISABI_APP_SRC !== process.cwd()) process.exit(2);\n"
                    "if ('ISABI_ROOT' in process.env || 'ISABI_NAMES_REQUIRE_REPO' in process.env) process.exit(3);\n"
                    "const core = JSON.parse(fs.readFileSync('js/seed_core.json', 'utf8'));\n"
                    "fs.appendFileSync(process.env.TEST_SG_LOG, `mjs:${core.rows}\\n`);\n"
                    "if (core.rows === 99) { console.error('FAIL: row-0 shift regression'); process.exit(1); }\n"
                    "console.log('PASS: stub insp return');\n",
                    encoding="utf-8",
                )
                _git(sg_app, "add", "-A")
                _git(sg_app, "commit", "-q", "-m", "add seed gate stubs")

                sg_c2 = json.dumps({"generated_at": "2026-11-20T09:00:00Z", "rows": 2}).encode("utf-8")
                sg_r2 = json.dumps({"sales_tickets": [{"id": "s1"}, {"id": "s2"}]}).encode("utf-8")
                (sg_app / "js" / "seed_core.json").write_bytes(sg_c2)
                (sg_app / "js" / "seed_records.json").write_bytes(sg_r2)

                rdo.ISABI = sg_site
                rdo.ISABI_APP = sg_app
                rdo.mods = lambda: (types.SimpleNamespace(OUT_DIR=sg_out), None)
                rdo.git = lambda args, cwd=sg_site, text=True, input_bytes=None, check=True: subprocess.run(
                    ["git", *args],
                    cwd=str(sg_site if cwd == orig_isabi else cwd),
                    capture_output=True,
                    text=text if input_bytes is None else False,
                    input=input_bytes,
                    check=check,
                )
                sg_suite_calls = 0

                def sg_suite_pass(_cwd: Path) -> int:
                    nonlocal sg_suite_calls
                    sg_suite_calls += 1
                    return 0

                rdo._run_node_suite = sg_suite_pass
                os.environ["TEST_SG_LOG"] = str(sg_log)
                try:
                    rdo.run_desktop_suite_against_new_seed(skip_suite=False)
                    assert sg_suite_calls == 1
                    assert sg_log.read_text(encoding="utf-8").splitlines() == ["py:2", "mjs:2"]
                    sg_stamp = json.loads((sg_out / "dataonly_suite_stamp.json").read_text(encoding="utf-8"))
                    assert sg_stamp.get("seedGates") == [
                        "isabi-app:build/verify_public_names.py",
                        "isabi-app:build/verify_insp_return_and_compound_nav.mjs",
                    ]
                    # Stamp reuse skips both verify_mfg.mjs and seed gates
                    rdo.stage_commit("topup sg v2")
                    assert sg_suite_calls == 1
                    assert sg_log.read_text(encoding="utf-8").splitlines() == ["py:2", "mjs:2"]
                    sg_head_v2 = rdo.head_sha()

                    # Seed gate failure aborts BEFORE commit and keeps index clean
                    sg_c99 = json.dumps({"generated_at": "2026-11-20T10:00:00Z", "rows": 99}).encode("utf-8")
                    (sg_app / "js" / "seed_core.json").write_bytes(sg_c99)
                    sg_aborted = False
                    with contextlib.redirect_stderr(io.StringIO()):
                        try:
                            rdo.stage_commit("topup sg fail")
                        except SystemExit as exc:
                            sg_aborted = "verify_insp_return_and_compound_nav.mjs failed with exit 1" in str(exc)
                    assert sg_aborted, "failing seed release gate must abort stage_commit"
                    assert sg_suite_calls == 2
                    assert sg_log.read_text(encoding="utf-8").splitlines() == ["py:2", "mjs:2", "py:99", "mjs:99"]
                    assert rdo.head_sha() == sg_head_v2, "failing seed gate must abort BEFORE commit"
                    assert not _git(sg_site, "diff", "--cached", "--name-only"), "failing seed gate must leave index clean"
                    print("ok   seed release gates run inside isolated candidate sandbox, stamp-cache on pass, and abort before commit on fail")
                finally:
                    os.environ.pop("TEST_SG_LOG", None)

                # 5. --wait-lock CLI validation
                a_up = rdo.parse_cli_args(["upload", "--wait-lock"])
                assert a_up.eff_wait_lock == 540 and a_up.poll_lock == 12, a_up
                a_custom = rdo.parse_cli_args(["upload", "--wait-lock", "120", "--poll-lock", "10", "--holder", "topup"])
                assert a_custom.eff_wait_lock == 120 and a_custom.poll_lock == 10 and a_custom.holder == "topup", a_custom
                a_stage = rdo.parse_cli_args(["wait-lock"])
                assert a_stage.eff_wait_lock == 540 and a_stage.poll_lock == 12, a_stage
                for bad_argv in (
                    ["status", "--wait-lock"],
                    ["commit", "--wait-lock"],
                    ["upload", "--no-release-lock", "--wait-lock"],
                    ["wait-lock", "--no-release-lock"],
                    ["upload", "--wait-lock", "-1"],
                    ["upload", "--wait-lock", "4000"],
                    ["upload", "--poll-lock", "0"],
                ):
                    got_exit = None
                    with contextlib.redirect_stderr(io.StringIO()):
                        try:
                            rdo.parse_cli_args(bad_argv)
                        except SystemExit as exc:
                            got_exit = exc.code
                    assert got_exit == 2, f"expected exit 2 for {bad_argv!r}, got {got_exit}"
                print("ok   --wait-lock CLI flags parse defaults/custom windows and reject invalid combinations")

                # 6. Offline bare-repo wait-lock polling against both current release_lock and simulated legacy signature
                _run_wait_lock_tests(check_bypass_subprocess=True)

                # 7. stage_r2 writes both immutable content-addressed keys and unversioned latest pointers across core/records/industries
                r2_puts: list[str] = []
                r2_meta_path = base / "r2_stage_meta.json"
                (sg_app / "js" / "seed_core.json").write_bytes(sg_c2)
                r2_hm = rdo.head_manifest()
                r2_ind = json.dumps({"trd": [{"id": "t1"}]}).encode("utf-8")
                (sg_app / "js" / "seed_industries.json").write_bytes(r2_ind)
                r2_hm["industriesHash"] = _sha10(r2_ind)
                r2_hm["apiIndustries"] = f"./api/seed/industries?d={r2_hm['industriesHash']}"
                (sg_site / "app" / "js" / "seed_manifest.js").write_text(
                    "(typeof self!=='undefined'?self:window).__MFG_SEED_MANIFEST=" + json.dumps(r2_hm) + ";\n",
                    encoding="utf-8",
                )
                _git(sg_site, "add", "app/js/seed_manifest.js")
                _git(sg_site, "commit", "-q", "-m", "add industriesHash to manifest")

                def _r2_load_meta():
                    if r2_meta_path.is_file():
                        return json.loads(r2_meta_path.read_text(encoding="utf-8"))
                    return {}

                def _r2_save_meta(m):
                    r2_meta_path.write_text(json.dumps(m), encoding="utf-8")

                def _r2_wrangler(args, _env, check=True):
                    if args[:3] == ["r2", "object", "put"]:
                        r2_puts.append(args[3])
                    return subprocess.CompletedProcess(["wrangler", *args], 0, stdout="ok", stderr="")

                fake_d = types.SimpleNamespace(
                    build_env=lambda: {},
                    ensure_logged_in=lambda _env: (True, "acct"),
                    load_edge_meta=_r2_load_meta,
                    save_edge_meta=_r2_save_meta,
                    run_wrangler=_r2_wrangler,
                )
                rdo.mods = lambda: (types.SimpleNamespace(OUT_DIR=out_dir), fake_d)
                with contextlib.redirect_stdout(io.StringIO()):
                    rdo.stage_r2()
                expected_puts = {
                    f"isabi-vault/seeds/seed_core.{r2_hm['coreHash']}.json",
                    "isabi-vault/seeds/seed_core.json",
                    f"isabi-vault/seeds/seed_records.{r2_hm['recordsHash']}.json",
                    "isabi-vault/seeds/seed_records.json",
                    f"isabi-vault/seeds/seed_industries.{r2_hm['industriesHash']}.json",
                    "isabi-vault/seeds/seed_industries.json",
                }
                assert set(r2_puts) == expected_puts, f"expected {expected_puts}, got {r2_puts}"
                saved_meta = _r2_load_meta()
                assert (saved_meta.get("r2_versioned_seed_shas") or {}).get("core") == [r2_hm["coreHash"]], saved_meta
                r2_puts.clear()
                with contextlib.redirect_stdout(io.StringIO()):
                    rdo.stage_r2()
                assert r2_puts == [], f"second stage_r2 should be idempotent, got {r2_puts}"
                print("ok   release_data_only stage_r2 uploads both content-addressed and latest R2 keys idempotently")
        finally:
            rdo.ISABI = orig_isabi
            rdo.ISABI_APP = orig_app
            rdo.mods = orig_mods
            rdo._run_node_suite = orig_run
            rdo.git = orig_git
    finally:
        for k, v in saved_lock_env.items():
            if v is not None:
                os.environ[k] = v

    print("PASS: verify_release_data_only.py")


def main() -> None:
    ap = argparse.ArgumentParser(description="Verify build/release_data_only.py desktop suite gate.")
    ap.add_argument("--dry", action="store_true", help="Report planned checks without executing temp repo writes")
    ap.add_argument("--wait-only-selftest", action="store_true", help=argparse.SUPPRESS)
    a = ap.parse_args()
    if a.dry:
        print("DRY RUN: verify_release_data_only.py would verify stamp creation, reuse, invalidation, abort-before-commit, and --skip-suite.")
        return
    run_tests(wait_only=a.wait_only_selftest)


if __name__ == "__main__":
    main()
