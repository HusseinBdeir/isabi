"""Offline regression gate for build/release_data_only.py desktop-suite stamp and abort semantics."""
from __future__ import annotations

import argparse
import hashlib
import io
import json
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


def run_tests() -> None:
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
    finally:
        rdo.ISABI = orig_isabi
        rdo.ISABI_APP = orig_app
        rdo.mods = orig_mods
        rdo._run_node_suite = orig_run
        rdo.git = orig_git

    print("PASS: verify_release_data_only.py")


def main() -> None:
    ap = argparse.ArgumentParser(description="Verify build/release_data_only.py desktop suite gate.")
    ap.add_argument("--dry", action="store_true", help="Report planned checks without executing temp repo writes")
    a = ap.parse_args()
    if a.dry:
        print("DRY RUN: verify_release_data_only.py would verify stamp creation, reuse, invalidation, abort-before-commit, and --skip-suite.")
        return
    run_tests()


if __name__ == "__main__":
    main()
