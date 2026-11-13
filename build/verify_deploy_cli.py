"""verify_deploy_cli.py - Offline regression gate for build/*.py CLI parsing, --dry safety, stale-checkout & dirty-tree guards."""
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
STAGE_PY = BUILD_DIR / "stage_pages_bundle.py"
LINKEDIN_PY = BUILD_DIR / "make_linkedin.py"

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

    # 1. Source check: zero sys.argv references across all 6 build/deploy CLIs
    cli_scripts = (
        ("deploy_cloudflare.py", DEPLOY_PY),
        ("export_d1_seed.py", EXPORT_PY),
        ("sync_app.py", SYNC_PY),
        ("assemble.py", ASSEMBLE_PY),
        ("stage_pages_bundle.py", STAGE_PY),
        ("make_linkedin.py", LINKEDIN_PY),
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
            "--preview",
            "--out-dir",
            "--dry",
            "--allow-dirty",
        ]
        import assemble as asm
        import deploy_cloudflare as dc
        import export_d1_seed as eds
        import make_linkedin as mli
        import stage_pages_bundle as spb
        import sync_app as sa

        dc = importlib.reload(dc)
        eds = importlib.reload(eds)
        sa = importlib.reload(sa)
        asm = importlib.reload(asm)
        spb = importlib.reload(spb)
        mli = importlib.reload(mli)
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
        "check_deploy_paths_clean",
        "DEPLOY_GUARD_PATHS",
        "_parse_git_porcelain_z",
    )
    for sym in required_dc_symbols:
        check(hasattr(dc, sym), f"dc-symbol-{sym}", f"missing {sym}")

    for mod_name, mod_obj, syms in (
        ("eds", eds, ("export_all", "fetch_live_cloud_store", "collect_target_rows", "promote_pending_manifest", "main")),
        ("sa", sa, ("sync_command_app", "run_release_gates", "render_deployed_shell_js", "write_deployed_shell_ver", "rederive_deployed_shell_ver", "main")),
        ("asm", asm, ("render_and_validate_showcase_html", "main")),
        ("spb", spb, ("stage_pages_bundle", "_validate_dest_dir", "check_deployed_shell_ver", "count_stageable_files", "ROOT_ALLOWLIST", "main")),
        ("mli", mli, ("build_cover_html", "build_preview_html", "render_html", "resolve_browser_bin", "main")),
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

    # 3. Subprocess --help / -h checks across all 6 scripts
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
                "--allow-dirty",
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
        (
            "spb",
            STAGE_PY,
            (
                "--dry",
                "dest_dir",
            ),
        ),
        (
            "mli",
            LINKEDIN_PY,
            (
                "--dry",
                "--out-dir",
                "--preview",
            ),
        ),
    )
    for tag, script_path, expected_flags in help_expectations:
        for hflag in ("--help", "-h"):
            r = run_cli(script_path, [hflag])
            check(r.returncode == 0, f"{tag}-help-exit-{hflag}", f"rc={r.returncode} stderr={r.stderr}")
            for ef in expected_flags:
                check(ef in r.stdout, f"{tag}-help-{hflag}-has-{ef}", f"missing {ef} in help output")

    check(not (ISABI_ROOT / "--help").exists(), "no-literal-dash-help-dir")
    check(not (ISABI_ROOT / "-h").exists(), "no-literal-dash-h-dir")

    # 4. Unknown flags, abbreviated flags, and bad positional/option args must exit 2 across all 6 scripts
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
                (["--allow-dir"], "abbrev-allow-dir"),
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
        (
            "spb",
            STAGE_PY,
            (
                ([], "missing-dest"),
                (["--unknown"], "unknown-flag"),
                (["--dr"], "abbrev-dry"),
                (["--", "--help"], "dash-dest"),
                ([""], "empty-dest"),
                (["a", "b"], "extra-positional"),
            ),
        ),
        (
            "mli",
            LINKEDIN_PY,
            (
                (["--unknown"], "unknown-flag"),
                (["--prev"], "abbrev-prev"),
                (["--preview"], "preview-missing-val"),
                (["--preview", ""], "empty-preview"),
                (["--out-dir", ""], "empty-out-dir"),
                (["extra"], "positional-arg"),
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
                (["--configure-domain", "--allow-dirty"], "configure-domain+allow-dirty"),
                (["--ping-indexnow", "--allow-dirty"], "ping-indexnow+allow-dirty"),
                (["--check-seat-pins", "--allow-dirty"], "check-seat-pins+allow-dirty"),
                (["--parity-only", "--allow-dirty"], "parity-only+allow-dirty"),
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
                (["--dry"], "dry-full", "Verify public/edge deploy paths have 0 uncommitted changes"),
                (["--dry"], "dry-full-fresh", "Verify local HEAD is not behind origin/main"),
                (["--dry-run"], "dry-run-full", "Verify local HEAD is not behind origin/main"),
                (["--dry", "--skip-seed"], "dry-skip-seed", "Verify local HEAD is not behind origin/main"),
                (["--dry", "--pages-only"], "dry-pages-only", "Verify local HEAD is not behind origin/main"),
                (["--dry", "--allow-behind-origin"], "dry-allow-behind", "BYPASS (--allow-behind-origin)"),
                (["--dry", "--pages-only", "--allow-behind-origin"], "dry-pages-allow-behind", "BYPASS (--allow-behind-origin)"),
                (["--dry", "--allow-dirty"], "dry-allow-dirty", "BYPASS (--allow-dirty)"),
                (["--dry", "--pages-only", "--allow-dirty"], "dry-pages-allow-dirty", "BYPASS (--allow-dirty)"),
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

        # 6e. stage_pages_bundle.py --dry (0 writes) + count_stageable_files parity
        orig_spb_attrs = {
            "copy2": spb.shutil.copy2,
            "rmtree": spb.shutil.rmtree,
        }
        try:
            spb.shutil.copy2 = forbid("spb.shutil.copy2")
            spb.shutil.rmtree = forbid("spb.shutil.rmtree")
            never_staged = td_path / "never_staged"
            for spb_args, label in (
                (["--dry"], "dry"),
                (["--dry-run", str(never_staged)], "dry-run-dest"),
            ):
                buf_spb = io.StringIO()
                rc_spb = None
                with contextlib.redirect_stdout(buf_spb):
                    try:
                        rc_spb = spb.main(spb_args)
                    except SystemExit as ex:
                        rc_spb = ex.code
                check(rc_spb == 0, f"spb-{label}-exit-0", f"rc={rc_spb}")
                check("DRY RUN" in buf_spb.getvalue(), f"spb-{label}-banner")
                check(not never_staged.exists(), f"spb-{label}-no-write")
        finally:
            spb.shutil.copy2 = orig_spb_attrs["copy2"]
            spb.shutil.rmtree = orig_spb_attrs["rmtree"]

        real_staged = td_path / "real_staged"
        staged_n = spb.stage_pages_bundle(real_staged)
        root_cnt, app_cnt = spb.count_stageable_files(ISABI_ROOT)
        check(
            root_cnt + app_cnt == staged_n,
            "spb-count-matches-stage",
            f"count={root_cnt}+{app_cnt} vs staged={staged_n}",
        )

        # Synthetic %TEMP%-only tests for _validate_dest_dir (never pass real workspace paths)
        with tempfile.TemporaryDirectory(prefix="isabi-spb-guard-test-", ignore_cleanup_errors=True) as td_guard:
            gbase = pathlib.Path(td_guard)
            fake_ws = gbase / "ws"
            fake_root = fake_ws / "isabi"
            fake_sub = fake_root / "app"
            fake_git_repo = gbase / "other_repo"
            fake_git_parent = gbase / "worktrees_dir"
            fake_wt = fake_git_parent / "wt1"

            fake_sub.mkdir(parents=True, exist_ok=True)
            fake_git_repo.mkdir(parents=True, exist_ok=True)
            fake_wt.mkdir(parents=True, exist_ok=True)
            (fake_git_repo / ".git").write_text("gitdir: /tmp/x\n", encoding="utf-8")
            (fake_wt / ".git").write_text("gitdir: /tmp/y\n", encoding="utf-8")

            sentinels = [
                fake_ws / "keep_ws.txt",
                fake_root / "keep_root.txt",
                fake_sub / "keep_sub.txt",
                fake_git_repo / "keep_repo.txt",
                fake_wt / "keep_wt.txt",
            ]
            for sfile in sentinels:
                sfile.write_text("keep\n", encoding="utf-8")

            unsafe_targets = (
                ("in-place-root", fake_root),
                ("ancestor-of-root", fake_ws),
                ("subdir-of-root", fake_sub),
                ("git-repo-dir", fake_git_repo),
                ("git-worktree-parent", fake_git_parent),
            )
            for ulabel, upath in unsafe_targets:
                raised_val = False
                try:
                    spb._validate_dest_dir(upath, fake_root)
                except ValueError:
                    raised_val = True
                check(raised_val, f"spb-validate-reject-{ulabel}")

                raised_stage = False
                try:
                    spb.stage_pages_bundle(upath, root=fake_root)
                except ValueError:
                    raised_stage = True
                check(raised_stage, f"spb-stage-reject-{ulabel}")

                for cli_args, mode_tag in (([str(upath)], "live"), (["--dry", str(upath)], "dry")):
                    rc_u = None
                    with contextlib.redirect_stderr(io.StringIO()):
                        try:
                            spb.parse_cli_args(cli_args, root=fake_root)
                        except SystemExit as ex:
                            rc_u = ex.code
                    check(rc_u == 2, f"spb-cli-{mode_tag}-reject-{ulabel}-rc2", f"rc={rc_u}")

            for idx_s, sfile in enumerate(sentinels):
                check(sfile.is_file(), f"spb-guard-sentinel-intact-{idx_s}")

        # 6f. make_linkedin.py --dry (0 dirs, 0 tempdirs, 0 Edge launches)
        orig_mli_attrs = {
            "makedirs": mli.os.makedirs,
            "mkdtemp": mli.tempfile.mkdtemp,
            "subproc_run": mli.subprocess.run,
            "render_html": mli.render_html,
        }
        try:
            mli.os.makedirs = forbid("mli.os.makedirs")
            mli.tempfile.mkdtemp = forbid("mli.tempfile.mkdtemp")
            mli.subprocess.run = forbid("mli.subprocess.run")
            mli.render_html = forbid("mli.render_html")

            never_li = td_path / "never_li"
            never_prev = td_path / "never_prev.png"
            for mli_args, label, want_prev in (
                (["--dry"], "dry", False),
                (["--dry-run", "--out-dir", str(never_li), "--preview", str(never_prev)], "dry-run-preview", True),
            ):
                buf_mli = io.StringIO()
                rc_mli = None
                with contextlib.redirect_stdout(buf_mli):
                    try:
                        rc_mli = mli.main(mli_args)
                    except SystemExit as ex:
                        rc_mli = ex.code
                out_mli = buf_mli.getvalue()
                check(rc_mli == 0, f"mli-{label}-exit-0", f"rc={rc_mli}")
                check("DRY RUN" in out_mli, f"mli-{label}-banner")
                check("isabi-linkedin-cover-2256x382.png" in out_mli, f"mli-{label}-cover-path")
                if want_prev:
                    check("1240x1010 preview" in out_mli, f"mli-{label}-preview-listed")
                check(not never_li.exists() and not never_prev.exists(), f"mli-{label}-no-write")
        finally:
            mli.os.makedirs = orig_mli_attrs["makedirs"]
            mli.tempfile.mkdtemp = orig_mli_attrs["mkdtemp"]
            mli.subprocess.run = orig_mli_attrs["subproc_run"]
            mli.render_html = orig_mli_attrs["render_html"]

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

    # 8. Offline tests for _parse_git_porcelain_z and check_deploy_paths_clean (--allow-dirty guard)
    dc = importlib.reload(dc)
    parsed_z = dc._parse_git_porcelain_z("R  app/new.js\0app/old.js\0 M index.html\0?? functions/api/dbg.js\0")
    check(
        parsed_z == ["R  app/old.js -> app/new.js", "M index.html", "?? functions/api/dbg.js"],
        "parse-git-porcelain-z-renames",
        f"got {parsed_z!r}",
    )

    with tempfile.TemporaryDirectory(prefix="isabi-git-dirty-test-", ignore_cleanup_errors=True) as td_dirty:
        dirty_base = pathlib.Path(td_dirty)
        git_env = dc.build_env()
        dirty_repo = dirty_base / "repo"
        non_git_dir = dirty_base / "plain_dir"
        dirty_repo.mkdir(parents=True, exist_ok=True)
        non_git_dir.mkdir(parents=True, exist_ok=True)

        _run_git(dirty_repo, ["init"], git_env)
        (dirty_repo / ".gitignore").write_text("exports/\n", encoding="utf-8")
        (dirty_repo / "index.html").write_text("<h1>v1</h1>\n", encoding="utf-8")
        (dirty_repo / "app").mkdir(parents=True, exist_ok=True)
        (dirty_repo / "app" / "sw.js").write_text("// sw v1\n", encoding="utf-8")
        (dirty_repo / "functions").mkdir(parents=True, exist_ok=True)
        (dirty_repo / "functions" / "_middleware.js").write_text("// mw v1\n", encoding="utf-8")
        (dirty_repo / "build").mkdir(parents=True, exist_ok=True)
        (dirty_repo / "build" / "helper.py").write_text("print('v1')\n", encoding="utf-8")
        _run_git(dirty_repo, ["add", "."], git_env)
        _run_git(
            dirty_repo,
            ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "commit", "-m", "init"],
            git_env,
        )

        # Case G1: clean repo passes
        with contextlib.redirect_stdout(io.StringIO()):
            rc_g1 = dc.check_deploy_paths_clean(dirty_repo, env=git_env)
        check(rc_g1 == 0, "git-dirty-g1-clean")

        # Case G2: dirty build/, untracked non-allowlisted root file, and gitignored exports/ still pass
        (dirty_repo / "build" / "helper.py").write_text("print('v2')\n", encoding="utf-8")
        (dirty_repo / "notes.txt").write_text("scratch\n", encoding="utf-8")
        (dirty_repo / "exports").mkdir(parents=True, exist_ok=True)
        (dirty_repo / "exports" / "batch.sql").write_text("SELECT 1;\n", encoding="utf-8")
        with contextlib.redirect_stdout(io.StringIO()):
            rc_g2 = dc.check_deploy_paths_clean(dirty_repo, env=git_env)
        check(rc_g2 == 0, "git-dirty-g2-non-deploy-paths-ignored")

        # Case G3: unstaged edit to app/sw.js fails closed (exit 2); allow_dirty=True bypasses
        (dirty_repo / "app" / "sw.js").write_text("// sw v2\n", encoding="utf-8")
        err_g3 = io.StringIO()
        rc_g3 = None
        with contextlib.redirect_stderr(err_g3):
            try:
                dc.check_deploy_paths_clean(dirty_repo, env=git_env)
            except SystemExit as ex:
                rc_g3 = ex.code
        check(rc_g3 == 2, "git-dirty-g3-app-unstaged-rc2", f"rc={rc_g3}")
        check("app/sw.js" in err_g3.getvalue() and "--allow-dirty" in err_g3.getvalue(), "git-dirty-g3-msg", err_g3.getvalue())
        with contextlib.redirect_stdout(io.StringIO()):
            rc_g3_allow = dc.check_deploy_paths_clean(dirty_repo, allow_dirty=True, env=git_env)
        check(rc_g3_allow == 0, "git-dirty-g3-allow-override")
        _run_git(dirty_repo, ["checkout", "--", "app/sw.js"], git_env)

        # Case G4: staged edit to index.html fails closed (exit 2)
        (dirty_repo / "index.html").write_text("<h1>v2</h1>\n", encoding="utf-8")
        _run_git(dirty_repo, ["add", "index.html"], git_env)
        err_g4 = io.StringIO()
        rc_g4 = None
        with contextlib.redirect_stderr(err_g4):
            try:
                dc.check_deploy_paths_clean(dirty_repo, env=git_env)
            except SystemExit as ex:
                rc_g4 = ex.code
        check(rc_g4 == 2, "git-dirty-g4-root-staged-rc2", f"rc={rc_g4}")
        check("index.html" in err_g4.getvalue(), "git-dirty-g4-msg", err_g4.getvalue())
        _run_git(dirty_repo, ["reset", "HEAD", "--", "index.html"], git_env)
        _run_git(dirty_repo, ["checkout", "--", "index.html"], git_env)

        # Case G5: untracked functions/api/debug.js fails closed (exit 2)
        (dirty_repo / "functions" / "api").mkdir(parents=True, exist_ok=True)
        dbg_js = dirty_repo / "functions" / "api" / "debug.js"
        dbg_js.write_text("// debug\n", encoding="utf-8")
        err_g5 = io.StringIO()
        rc_g5 = None
        with contextlib.redirect_stderr(err_g5):
            try:
                dc.check_deploy_paths_clean(dirty_repo, env=git_env)
            except SystemExit as ex:
                rc_g5 = ex.code
        check(rc_g5 == 2, "git-dirty-g5-functions-untracked-rc2", f"rc={rc_g5}")
        check("functions/api/debug.js" in err_g5.getvalue(), "git-dirty-g5-msg", err_g5.getvalue())
        dbg_js.unlink()

        # Case G6: staged rename git mv app/sw.js app/sw2.js fails closed (exit 2)
        _run_git(dirty_repo, ["mv", "app/sw.js", "app/sw2.js"], git_env)
        err_g6 = io.StringIO()
        rc_g6 = None
        with contextlib.redirect_stderr(err_g6):
            try:
                dc.check_deploy_paths_clean(dirty_repo, env=git_env)
            except SystemExit as ex:
                rc_g6 = ex.code
        check(rc_g6 == 2, "git-dirty-g6-staged-rename-rc2", f"rc={rc_g6}")
        check("app/sw.js -> app/sw2.js" in err_g6.getvalue(), "git-dirty-g6-msg", err_g6.getvalue())
        _run_git(dirty_repo, ["reset", "--hard", "HEAD"], git_env)

        # Case G7: dc.main([]) and dc.main(["--pages-only"]) abort BEFORE check_checkout_not_behind_origin and ensure_logged_in
        (dirty_repo / "functions" / "_middleware.js").write_text("// dirty mw\n", encoding="utf-8")
        orig_root = dc.ISABI_ROOT
        orig_behind = dc.check_checkout_not_behind_origin
        orig_ensure = dc.ensure_logged_in
        try:
            dc.ISABI_ROOT = dirty_repo
            dc.check_checkout_not_behind_origin = forbid("dc.check_checkout_not_behind_origin")
            dc.ensure_logged_in = forbid("dc.ensure_logged_in")
            for mode_args, mlabel in (([], "full"), (["--pages-only"], "pages-only")):
                err_g7 = io.StringIO()
                rc_g7 = None
                with contextlib.redirect_stderr(err_g7):
                    try:
                        dc.main(mode_args)
                    except SystemExit as ex:
                        rc_g7 = ex.code
                check(rc_g7 == 2, f"git-dirty-g7-{mlabel}-rc2", f"rc={rc_g7}")
                check("functions/_middleware.js" in err_g7.getvalue(), f"git-dirty-g7-{mlabel}-msg", err_g7.getvalue())
        finally:
            dc.ISABI_ROOT = orig_root
            dc.check_checkout_not_behind_origin = orig_behind
            dc.ensure_logged_in = orig_ensure

        # Case G8: non-git directory fails closed (exit 2) unless allow_dirty=True
        err_g8 = io.StringIO()
        rc_g8 = None
        with contextlib.redirect_stderr(err_g8):
            try:
                dc.check_deploy_paths_clean(non_git_dir, env=git_env)
            except SystemExit as ex:
                rc_g8 = ex.code
        check(rc_g8 == 2, "git-dirty-g8-non-git-rc2", f"rc={rc_g8}")
        with contextlib.redirect_stdout(io.StringIO()):
            rc_g8_allow = dc.check_deploy_paths_clean(non_git_dir, allow_dirty=True, env=git_env)
        check(rc_g8_allow == 0, "git-dirty-g8-non-git-allow")

    print(f"PASS: verify_deploy_cli ({passed}/{total} checks)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
