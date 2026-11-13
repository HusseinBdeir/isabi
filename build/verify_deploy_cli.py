"""verify_deploy_cli.py — Offline regression gate for build/*.py CLI parsing, --dry safety & stale-checkout guard."""
from __future__ import annotations

import contextlib
import importlib
import io
import inspect
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

BUILD_DIR = pathlib.Path(__file__).resolve().parent
ISABI_ROOT = BUILD_DIR.parent
DEPLOY_PY = BUILD_DIR / "deploy_cloudflare.py"
EXPORT_PY = BUILD_DIR / "export_d1_seed.py"
SYNC_PY = BUILD_DIR / "sync_app.py"
ASSEMBLE_PY = BUILD_DIR / "assemble.py"

if str(BUILD_DIR) not in sys.path:
    sys.path.insert(0, str(BUILD_DIR))


def run_cli(script_path: pathlib.Path, args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(script_path), *args],
        cwd=str(ISABI_ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdin=subprocess.DEVNULL,
        timeout=30,
    )


def _run_git(repo_dir: pathlib.Path, git_args: list[str], env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    git_bin = shutil.which("git", path=env.get("PATH")) or "git"
    return subprocess.run(
        [git_bin, *git_args],
        cwd=str(repo_dir),
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdin=subprocess.DEVNULL,
        timeout=20,
        check=True,
    )


def main() -> int:
    passed = 0
    total = 0

    def check(cond: bool, label: str, detail: str = "") -> None:
        nonlocal passed, total
        total += 1
        if not cond:
            raise AssertionError(f"FAIL [{label}] {detail}".strip())
        passed += 1

    # 1. Source check: zero sys.argv references across all 4 build/deploy CLIs
    cli_scripts = (
        ("deploy_cloudflare.py", DEPLOY_PY),
        ("export_d1_seed.py", EXPORT_PY),
        ("sync_app.py", SYNC_PY),
        ("assemble.py", ASSEMBLE_PY),
    )
    for fname, path in cli_scripts:
        src = path.read_text(encoding="utf-8")
        check("sys.argv" not in src, f"no-raw-sys-argv-{fname}", f"found 'sys.argv' in {fname}")

    # 2. Module-import safety check with foreign sys.argv + symbol/signature checks
    old_argv = list(sys.argv)
    try:
        sys.argv = [
            "release_data_only.py",
            "status",
            "--keep",
            "--offline",
            "--no-snapshot",
            "--skip-release-gates",
            "--skip-app-sync",
        ]
        import assemble as asm
        import deploy_cloudflare as dc
        import export_d1_seed as eds
        import sync_app as sa

        dc = importlib.reload(dc)
        eds = importlib.reload(eds)
        sa = importlib.reload(sa)
        asm = importlib.reload(asm)
        check(True, "import-all-with-foreign-argv")
    finally:
        sys.argv = old_argv

    required_dc_symbols = (
        "_hash_random_pbkdf2",
        "ensure_logged_in",
        "load_edge_meta",
        "save_edge_meta",
        "build_env",
        "run_wrangler",
        "_upload_one_batch",
        "wrangler_bin",
        "check_checkout_not_behind_origin",
    )
    for sym in required_dc_symbols:
        check(hasattr(dc, sym), f"dc-symbol-{sym}", f"missing {sym}")

    for mod_name, mod_obj, syms in (
        ("eds", eds, ("export_all", "fetch_live_cloud_store", "collect_target_rows", "promote_pending_manifest", "main")),
        ("sa", sa, ("sync_command_app", "run_release_gates", "render_deployed_shell_js", "write_deployed_shell_ver", "rederive_deployed_shell_ver", "main")),
        ("asm", asm, ("render_and_validate_showcase_html", "main")),
    ):
        for sym in syms:
            check(hasattr(mod_obj, sym), f"{mod_name}-symbol-{sym}", f"missing {sym}")

    sig_ensure = inspect.signature(dc.ensure_logged_in)
    pos_params = [
        p
        for p in sig_ensure.parameters.values()
        if p.kind in (inspect.Parameter.POSITIONAL_ONLY, inspect.Parameter.POSITIONAL_OR_KEYWORD)
    ]
    check(len(pos_params) == 1, "ensure-logged-in-1-pos-arg", f"got {sig_ensure}")

    # 3. Subprocess --help / -h checks across all 4 scripts
    help_expectations = (
        (
            "dc",
            DEPLOY_PY,
            (
                "--dry",
                "--skip-seed",
                "--pages-only",
                "--configure-domain",
                "--ping-indexnow",
                "--check-seat-pins",
                "--parity-only",
                "--delta",
                "--full-seed",
                "--force-schema",
                "--force-r2-seeds",
                "--rotate-secrets",
                "--allow-behind-origin",
                "--login",
            ),
        ),
        (
            "eds",
            EXPORT_PY,
            (
                "--dry",
                "--delta",
                "--full",
                "--offline",
                "--no-snapshot",
                "--commit-manifest",
                "--apply-local",
            ),
        ),
        (
            "sa",
            SYNC_PY,
            (
                "--dry",
                "--skip-release-gates",
                "--skip-i18n-audit",
            ),
        ),
        (
            "asm",
            ASSEMBLE_PY,
            (
                "--dry",
                "--skip-app-sync",
                "--force-app-sync",
                "--skip-release-gates",
                "--skip-i18n-audit",
            ),
        ),
    )
    for tag, script_path, expected_flags in help_expectations:
        for hflag in ("--help", "-h"):
            r = run_cli(script_path, [hflag])
            check(r.returncode == 0, f"{tag}-help-exit-{hflag}", f"rc={r.returncode} stderr={r.stderr}")
            for ef in expected_flags:
                check(ef in r.stdout, f"{tag}-help-{hflag}-has-{ef}", f"missing {ef} in help output")

    # 4. Unknown flags, abbreviated flags, and positional args must exit 2 across all 4 scripts
    bad_invocations_by_script = (
        (
            "dc",
            DEPLOY_PY,
            (
                (["--unknown"], "unknown-flag"),
                (["--skip-seeds"], "typo-flag"),
                (["-z"], "unknown-short-flag"),
                (["--par"], "abbrev-par"),
                (["--rot"], "abbrev-rot"),
                (["--skip-live"], "abbrev-skip-live"),
                (["--allow-behind"], "abbrev-allow-behind"),
                (["prod"], "positional-arg"),
            ),
        ),
        (
            "eds",
            EXPORT_PY,
            (
                (["--unknown"], "unknown-flag"),
                (["--del"], "abbrev-del"),
                (["--off"], "abbrev-off"),
                (["extra"], "positional-arg"),
            ),
        ),
        (
            "sa",
            SYNC_PY,
            (
                (["--unknown"], "unknown-flag"),
                (["--skip-rel"], "abbrev-skip-rel"),
                (["app"], "positional-arg"),
            ),
        ),
        (
            "asm",
            ASSEMBLE_PY,
            (
                (["--unknown"], "unknown-flag"),
                (["--skip-app"], "abbrev-skip-app"),
                (["index.html"], "positional-arg"),
            ),
        ),
    )
    for tag, script_path, cases in bad_invocations_by_script:
        for args, label in cases:
            r = run_cli(script_path, args)
            check(r.returncode == 2, f"{tag}-reject-{label}-rc2", f"rc={r.returncode} stdout={r.stdout}")
            check(bool((r.stderr or "").strip()), f"{tag}-reject-{label}-stderr", "expected error text on stderr")

    # 5. Conflicting flag pairs must exit 2 across all scripts that validate flag conflicts
    conflict_cases_by_script = (
        (
            "dc",
            DEPLOY_PY,
            (
                (["--skip-seed", "--full-seed"], "skip-seed+full-seed"),
                (["--skip-seed", "--delta"], "skip-seed+delta"),
                (["--skip-seed", "--seed"], "skip-seed+seed"),
                (["--delta", "--full-seed"], "delta+full-seed"),
                (["--pages-only", "--skip-seed"], "pages-only+skip-seed"),
                (["--pages-only", "--force-r2-seeds"], "pages-only+force-r2-seeds"),
                (["--check-seat-pins", "--pages-only"], "check-seat-pins+pages-only"),
                (["--ping-indexnow", "--pages-only"], "ping-indexnow+pages-only"),
                (["--configure-domain", "--skip-seed"], "configure-domain+skip-seed"),
                (["--parity-only", "--skip-live-parity"], "parity-only+skip-live-parity"),
                (["--skip-live-parity", "--no-sync-release-log"], "skip-live-parity+no-sync-release-log"),
                (["--configure-domain", "--allow-behind-origin"], "configure-domain+allow-behind-origin"),
                (["--ping-indexnow", "--allow-behind-origin"], "ping-indexnow+allow-behind-origin"),
                (["--check-seat-pins", "--allow-behind-origin"], "check-seat-pins+allow-behind-origin"),
                (["--parity-only", "--allow-behind-origin"], "parity-only+allow-behind-origin"),
            ),
        ),
        (
            "eds",
            EXPORT_PY,
            (
                (["--delta", "--full"], "delta+full"),
            ),
        ),
        (
            "asm",
            ASSEMBLE_PY,
            (
                (["--skip-app-sync", "--force-app-sync"], "skip-app-sync+force-app-sync"),
                (["--skip-app-sync", "--skip-release-gates"], "skip-app-sync+skip-release-gates"),
                (["--skip-app-sync", "--skip-i18n-audit"], "skip-app-sync+skip-i18n-audit"),
            ),
        ),
    )
    for tag, script_path, cases in conflict_cases_by_script:
        for args, label in cases:
            r = run_cli(script_path, args)
            check(r.returncode == 2, f"{tag}-conflict-{label}-rc2", f"rc={r.returncode} stdout={r.stdout}")
            check(bool((r.stderr or "").strip()), f"{tag}-conflict-{label}-stderr", "expected error text on stderr")

    # 6. In-process --dry / --dry-run no-mutation checks across all 4 scripts
    def forbid(name: str):
        def _boom(*_a, **_kw):
            raise AssertionError(f"forbidden call during --dry or stale checkout: {name}")
        return _boom

    with tempfile.TemporaryDirectory(prefix="isabi-dry-test-", ignore_cleanup_errors=True) as td:
        td_path = pathlib.Path(td)
        fake_meta_path = td_path / "missing_dir" / "cloudflare_edge_meta.json"
        orig_dc_attrs = {
            "SECRET_STATE_FILE": dc.SECRET_STATE_FILE,
            "COMMITTED_MANIFEST_JSON": dc.COMMITTED_MANIFEST_JSON,
            "run_wrangler": dc.run_wrangler,
            "cf_api": dc.cf_api,
            "ping_indexnow": dc.ping_indexnow,
            "run_live_parity_gate": dc.run_live_parity_gate,
            "save_edge_meta": dc.save_edge_meta,
            "load_or_create_jwt_secret": dc.load_or_create_jwt_secret,
            "ensure_logged_in": dc.ensure_logged_in,
            "subproc_run": dc.subprocess.run,
        }
        try:
            dc.SECRET_STATE_FILE = fake_meta_path
            dc.run_wrangler = forbid("run_wrangler")
            dc.cf_api = forbid("cf_api")
            dc.ping_indexnow = forbid("ping_indexnow")
            dc.run_live_parity_gate = forbid("run_live_parity_gate")
            dc.save_edge_meta = forbid("save_edge_meta")
            dc.load_or_create_jwt_secret = forbid("load_or_create_jwt_secret")
            dc.ensure_logged_in = forbid("ensure_logged_in")
            dc.subprocess.run = forbid("subprocess.run")

            dry_cases = (
                (["--dry"], "dry-full", "Verify local HEAD is not behind origin/main"),
                (["--dry-run"], "dry-run-full", "Verify local HEAD is not behind origin/main"),
                (["--dry", "--skip-seed"], "dry-skip-seed", "Verify local HEAD is not behind origin/main"),
                (["--dry", "--pages-only"], "dry-pages-only", "Verify local HEAD is not behind origin/main"),
                (["--dry", "--allow-behind-origin"], "dry-allow-behind", "BYPASS (--allow-behind-origin)"),
                (["--dry", "--pages-only", "--allow-behind-origin"], "dry-pages-allow-behind", "BYPASS (--allow-behind-origin)"),
                (["--dry", "--configure-domain", "--ping-indexnow"], "dry-configure-domain+indexnow", "Configure Cloudflare Zone"),
                (["--dry", "--ping-indexnow"], "dry-ping-indexnow", "Ping IndexNow"),
                (["--dry", "--check-seat-pins"], "dry-check-seat-pins", "Read-only D1 check"),
                (["--dry", "--parity-only", "--no-sync-release-log"], "dry-parity-only", "verify_live_parity.mjs"),
            )
            for args, label, expected_step in dry_cases:
                buf = io.StringIO()
                rc = None
                with contextlib.redirect_stdout(buf):
                    try:
                        dc.main(args)
                    except SystemExit as ex:
                        rc = ex.code
                out_txt = buf.getvalue()
                check(rc == 0, f"dc-{label}-exit-0", f"rc={rc}")
                check("DRY RUN" in out_txt, f"dc-{label}-banner", "missing DRY RUN header")
                check(expected_step in out_txt, f"dc-{label}-step", f"missing {expected_step!r}")
                check(not fake_meta_path.exists() and not fake_meta_path.parent.exists(), f"dc-{label}-0-files-created")

            # Missing d1_seed_manifest.json with --dry --delta -> exit 2
            dc.COMMITTED_MANIFEST_JSON = td_path / "missing_d1_seed_manifest.json"
            out_buf = io.StringIO()
            err_buf = io.StringIO()
            rc_delta = None
            with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
                try:
                    dc.main(["--dry", "--delta"])
                except SystemExit as ex:
                    rc_delta = ex.code
            check(rc_delta == 2, "dc-dry-delta-missing-manifest-exit-2", f"rc={rc_delta}")
            check("d1_seed_manifest.json" in err_buf.getvalue(), "dc-dry-delta-missing-manifest-msg", err_buf.getvalue())

            # seed_remote_d1(..., require_delta=True) fails before export_d1_seed.py when manifest missing
            dc.load_edge_meta = lambda: {"last_schema_sha256": dc.file_sha256(dc.SCHEMA_SQL)}
            raised_sys_exit = False
            exit_msg = ""
            with contextlib.redirect_stdout(io.StringIO()):
                try:
                    dc.seed_remote_d1({}, require_delta=True)
                except SystemExit as ex:
                    raised_sys_exit = True
                    exit_msg = str(ex)
            check(raised_sys_exit, "dc-seed-require-delta-raises")
            check("d1_seed_manifest.json" in exit_msg, "dc-seed-require-delta-msg", exit_msg)
        finally:
            dc.SECRET_STATE_FILE = orig_dc_attrs["SECRET_STATE_FILE"]
            dc.COMMITTED_MANIFEST_JSON = orig_dc_attrs["COMMITTED_MANIFEST_JSON"]
            dc.run_wrangler = orig_dc_attrs["run_wrangler"]
            dc.cf_api = orig_dc_attrs["cf_api"]
            dc.ping_indexnow = orig_dc_attrs["ping_indexnow"]
            dc.run_live_parity_gate = orig_dc_attrs["run_live_parity_gate"]
            dc.save_edge_meta = orig_dc_attrs["save_edge_meta"]
            dc.load_or_create_jwt_secret = orig_dc_attrs["load_or_create_jwt_secret"]
            dc.ensure_logged_in = orig_dc_attrs["ensure_logged_in"]
            dc.subprocess.run = orig_dc_attrs["subproc_run"]

        # 6b. export_d1_seed.py --dry & --delta validation (0 network, 0 writes, CI-safe)
        orig_eds_attrs = {
            "COMMITTED_MANIFEST_JSON": eds.COMMITTED_MANIFEST_JSON,
            "DB_PATH": eds.DB_PATH,
            "_fetch_edge_store": eds._fetch_edge_store,
            "_fetch_legacy_relay_store": eds._fetch_legacy_relay_store,
            "collect_target_rows": eds.collect_target_rows,
            "apply_local_wrangler": eds.apply_local_wrangler,
            "promote_pending_manifest": eds.promote_pending_manifest,
            "subproc_run": eds.subprocess.run,
        }
        try:
            eds._fetch_edge_store = forbid("eds._fetch_edge_store")
            eds._fetch_legacy_relay_store = forbid("eds._fetch_legacy_relay_store")
            eds.collect_target_rows = forbid("eds.collect_target_rows")
            eds.apply_local_wrangler = forbid("eds.apply_local_wrangler")
            eds.promote_pending_manifest = forbid("eds.promote_pending_manifest")
            eds.subprocess.run = forbid("eds.subprocess.run")

            eds.DB_PATH = td_path / "missing_mfg.db"
            valid_manifest = td_path / "valid_manifest.json"
            valid_manifest.write_text(json.dumps({"row_hashes": {"[\"sales\",\"s1\"]": "abc"}}), encoding="utf-8")
            eds.COMMITTED_MANIFEST_JSON = valid_manifest

            for eds_args, label, want in (
                (["--dry"], "dry-full", "FULL"),
                (["--dry-run", "--offline", "--no-snapshot"], "dry-run-offline-nosnap", "OFFLINE (--offline"),
                (["--dry", "--delta"], "dry-delta", "DELTA"),
            ):
                buf = io.StringIO()
                rc = None
                with contextlib.redirect_stdout(buf):
                    try:
                        eds.main(eds_args)
                    except SystemExit as ex:
                        rc = ex.code
                check(rc == 0, f"eds-{label}-exit-0", f"rc={rc}")
                check("DRY RUN" in buf.getvalue(), f"eds-{label}-banner")
                check(want in buf.getvalue(), f"eds-{label}-want-{want}")

            eds.COMMITTED_MANIFEST_JSON = td_path / "missing_manifest.json"
            for eds_args, label in (
                (["--dry", "--delta"], "dry-delta-missing-manifest"),
                (["--delta"], "delta-missing-manifest"),
            ):
                out_buf = io.StringIO()
                err_buf = io.StringIO()
                rc = None
                with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
                    try:
                        eds.main(eds_args)
                    except SystemExit as ex:
                        rc = ex.code
                check(rc == 2, f"eds-{label}-exit-2", f"rc={rc}")
                check("missing_manifest.json" in err_buf.getvalue(), f"eds-{label}-msg", err_buf.getvalue())
        finally:
            eds.COMMITTED_MANIFEST_JSON = orig_eds_attrs["COMMITTED_MANIFEST_JSON"]
            eds.DB_PATH = orig_eds_attrs["DB_PATH"]
            eds._fetch_edge_store = orig_eds_attrs["_fetch_edge_store"]
            eds._fetch_legacy_relay_store = orig_eds_attrs["_fetch_legacy_relay_store"]
            eds.collect_target_rows = orig_eds_attrs["collect_target_rows"]
            eds.apply_local_wrangler = orig_eds_attrs["apply_local_wrangler"]
            eds.promote_pending_manifest = orig_eds_attrs["promote_pending_manifest"]
            eds.subprocess.run = orig_eds_attrs["subproc_run"]

        # 6c. sync_app.py --dry (0 writes, 0 subprocesses, CI-safe when APP_SRC_ROOT absent)
        orig_sa_attrs = {
            "APP_SRC_ROOT": sa.APP_SRC_ROOT,
            "subproc_run": sa.subprocess.run,
            "copyfile": sa.shutil.copyfile,
            "write_deployed_shell_ver": sa.write_deployed_shell_ver,
        }
        try:
            sa.subprocess.run = forbid("sa.subprocess.run")
            sa.shutil.copyfile = forbid("sa.shutil.copyfile")
            sa.write_deployed_shell_ver = forbid("sa.write_deployed_shell_ver")

            for sa_args, label in (
                (["--dry"], "dry"),
                (["--dry-run", "--skip-release-gates", "--skip-i18n-audit"], "dry-run-skips"),
            ):
                buf = io.StringIO()
                rc = None
                with contextlib.redirect_stdout(buf):
                    try:
                        sa.main(sa_args)
                    except SystemExit as ex:
                        rc = ex.code
                check(rc == 0, f"sa-{label}-exit-0", f"rc={rc}")
                check("DRY RUN" in buf.getvalue(), f"sa-{label}-banner")

            sa.APP_SRC_ROOT = str(td_path / "absent_isabi_app")
            buf_missing = io.StringIO()
            rc_missing = None
            with contextlib.redirect_stdout(buf_missing):
                try:
                    sa.main(["--dry"])
                except SystemExit as ex:
                    rc_missing = ex.code
            check(rc_missing == 0, "sa-dry-absent-src-exit-0", f"rc={rc_missing}")
            check("not found" in buf_missing.getvalue(), "sa-dry-absent-src-msg")
        finally:
            sa.APP_SRC_ROOT = orig_sa_attrs["APP_SRC_ROOT"]
            sa.subprocess.run = orig_sa_attrs["subproc_run"]
            sa.shutil.copyfile = orig_sa_attrs["copyfile"]
            sa.write_deployed_shell_ver = orig_sa_attrs["write_deployed_shell_ver"]

        # 6d. assemble.py --dry (0 writes, 0 subprocesses, respects ISABI_SKIP_APP_SYNC / --force-app-sync)
        orig_asm_attrs = {
            "OUT_HTML": asm.OUT_HTML,
            "subproc_run": asm.subprocess.run,
            "sync_command_app": asm.sync_command_app,
            "run_showcase_i18n_audit": asm.run_showcase_i18n_audit,
        }
        old_skip_env = os.environ.get("ISABI_SKIP_APP_SYNC")
        try:
            temp_out_html = td_path / "never_written_index.html"
            asm.OUT_HTML = str(temp_out_html)
            asm.subprocess.run = forbid("asm.subprocess.run")
            asm.sync_command_app = forbid("asm.sync_command_app")
            asm.run_showcase_i18n_audit = forbid("asm.run_showcase_i18n_audit")

            for asm_args, label, want in (
                (["--dry"], "dry-default", "RUN sync_command_app()"),
                (["--dry-run", "--skip-app-sync"], "dry-run-skip-sync", "SKIP (--skip-app-sync)"),
                (["--dry", "--force-app-sync"], "dry-force-sync", "--force-app-sync"),
            ):
                os.environ["ISABI_SKIP_APP_SYNC"] = "1" if label == "dry-force-sync" else "0"
                buf = io.StringIO()
                rc = None
                with contextlib.redirect_stdout(buf):
                    try:
                        asm.main(asm_args)
                    except SystemExit as ex:
                        rc = ex.code
                check(rc == 0, f"asm-{label}-exit-0", f"rc={rc}")
                check("DRY RUN" in buf.getvalue(), f"asm-{label}-banner")
                check(want in buf.getvalue(), f"asm-{label}-want", f"missing {want!r}")
                check(not temp_out_html.exists(), f"asm-{label}-no-write")
        finally:
            if old_skip_env is None:
                os.environ.pop("ISABI_SKIP_APP_SYNC", None)
            else:
                os.environ["ISABI_SKIP_APP_SYNC"] = old_skip_env
            asm.OUT_HTML = orig_asm_attrs["OUT_HTML"]
            asm.subprocess.run = orig_asm_attrs["subproc_run"]
            asm.sync_command_app = orig_asm_attrs["sync_command_app"]
            asm.run_showcase_i18n_audit = orig_asm_attrs["run_showcase_i18n_audit"]

    # 7. Offline bare-repo git tests for check_checkout_not_behind_origin
    dc = importlib.reload(dc)
    with tempfile.TemporaryDirectory(prefix="isabi-git-fresh-test-", ignore_cleanup_errors=True) as td_git:
        git_base = pathlib.Path(td_git)
        git_env = dc.build_env()
        origin_bare = git_base / "origin.git"
        work_dir = git_base / "work"
        peer_dir = git_base / "peer"
        no_remote_dir = git_base / "no_remote"

        _run_git(git_base, ["init", "--bare", str(origin_bare)], git_env)
        _run_git(origin_bare, ["symbolic-ref", "HEAD", "refs/heads/main"], git_env)

        _run_git(git_base, ["clone", str(origin_bare), str(peer_dir)], git_env)
        _run_git(peer_dir, ["checkout", "-B", "main"], git_env)
        (peer_dir / "README.md").write_text("v1\n", encoding="utf-8")
        _run_git(peer_dir, ["add", "README.md"], git_env)
        _run_git(
            peer_dir,
            ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "commit", "-m", "c1"],
            git_env,
        )
        _run_git(peer_dir, ["push", "-u", "origin", "main"], git_env)

        _run_git(git_base, ["clone", "-b", "main", str(origin_bare), str(work_dir)], git_env)

        # Case A: up-to-date checkout passes
        with contextlib.redirect_stdout(io.StringIO()):
            rc_a = dc.check_checkout_not_behind_origin(work_dir, fetch=True, env=git_env)
        check(rc_a == 0, "git-fresh-case-a-uptodate")

        # Case B: local ahead of origin/main passes (standard commit -> deploy -> push flow)
        (work_dir / "README.md").write_text("v2-local\n", encoding="utf-8")
        _run_git(work_dir, ["add", "README.md"], git_env)
        _run_git(
            work_dir,
            ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "commit", "-m", "c2-local"],
            git_env,
        )
        with contextlib.redirect_stdout(io.StringIO()):
            rc_b = dc.check_checkout_not_behind_origin(work_dir, fetch=True, env=git_env)
        check(rc_b == 0, "git-fresh-case-b-local-ahead")
        _run_git(work_dir, ["push", "origin", "main"], git_env)

        # Case C: origin/main moves ahead via peer push -> work (unpulled) fails closed with exit 2
        _run_git(peer_dir, ["pull", "--rebase", "origin", "main"], git_env)
        (peer_dir / "README.md").write_text("v3-peer\n", encoding="utf-8")
        _run_git(peer_dir, ["add", "README.md"], git_env)
        _run_git(
            peer_dir,
            ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "commit", "-m", "c3-peer"],
            git_env,
        )
        _run_git(peer_dir, ["push", "origin", "main"], git_env)

        err_c = io.StringIO()
        rc_c = None
        with contextlib.redirect_stderr(err_c):
            try:
                dc.check_checkout_not_behind_origin(work_dir, fetch=True, env=git_env)
            except SystemExit as ex:
                rc_c = ex.code
        check(rc_c == 2, "git-fresh-case-c-behind-rc2", f"rc={rc_c}")
        check("behind origin/main" in err_c.getvalue(), "git-fresh-case-c-msg", err_c.getvalue())

        # Case D: --allow-behind-origin bypasses on stale checkout
        with contextlib.redirect_stdout(io.StringIO()):
            rc_d = dc.check_checkout_not_behind_origin(work_dir, allow_behind_origin=True, fetch=True, env=git_env)
        check(rc_d == 0, "git-fresh-case-d-allow-override")

        # Case E: dc.main([]) and dc.main(["--pages-only"]) abort BEFORE ensure_logged_in when stale
        orig_root = dc.ISABI_ROOT
        orig_ensure = dc.ensure_logged_in
        try:
            dc.ISABI_ROOT = work_dir
            dc.ensure_logged_in = forbid("dc.ensure_logged_in")
            for mode_args, mlabel in (([], "full"), (["--pages-only"], "pages-only")):
                err_e = io.StringIO()
                rc_e = None
                with contextlib.redirect_stderr(err_e):
                    try:
                        dc.main(mode_args)
                    except SystemExit as ex:
                        rc_e = ex.code
                check(rc_e == 2, f"git-fresh-case-e-{mlabel}-rc2", f"rc={rc_e}")
                check("behind origin/main" in err_e.getvalue(), f"git-fresh-case-e-{mlabel}-msg", err_e.getvalue())
        finally:
            dc.ISABI_ROOT = orig_root
            dc.ensure_logged_in = orig_ensure

        # Case F: unreachable/missing origin fails closed (exit 2) unless allow_behind_origin=True
        no_remote_dir.mkdir(parents=True, exist_ok=True)
        _run_git(no_remote_dir, ["init"], git_env)
        err_f = io.StringIO()
        rc_f = None
        with contextlib.redirect_stderr(err_f):
            try:
                dc.check_checkout_not_behind_origin(no_remote_dir, fetch=True, env=git_env)
            except SystemExit as ex:
                rc_f = ex.code
        check(rc_f == 2, "git-fresh-case-f-no-remote-rc2", f"rc={rc_f}")
        with contextlib.redirect_stdout(io.StringIO()):
            rc_f_allow = dc.check_checkout_not_behind_origin(no_remote_dir, allow_behind_origin=True, fetch=True, env=git_env)
        check(rc_f_allow == 0, "git-fresh-case-f-no-remote-allow")

    print(f"PASS: verify_deploy_cli ({passed}/{total} checks)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
