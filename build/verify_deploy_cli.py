"""verify_deploy_cli.py — Offline regression gate for build/deploy_cloudflare.py CLI parsing & --dry safety."""
from __future__ import annotations

import contextlib
import importlib
import io
import inspect
import pathlib
import subprocess
import sys
import tempfile

BUILD_DIR = pathlib.Path(__file__).resolve().parent
ISABI_ROOT = BUILD_DIR.parent
DEPLOY_PY = BUILD_DIR / "deploy_cloudflare.py"

if str(BUILD_DIR) not in sys.path:
    sys.path.insert(0, str(BUILD_DIR))


def run_cli(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(DEPLOY_PY), *args],
        cwd=str(ISABI_ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdin=subprocess.DEVNULL,
        timeout=30,
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

    # 1. Source check: zero sys.argv references in deploy_cloudflare.py
    src = DEPLOY_PY.read_text(encoding="utf-8")
    check("sys.argv" not in src, "no-raw-sys-argv", "found 'sys.argv' in deploy_cloudflare.py")

    # 2. Module-import safety check with foreign sys.argv + symbol/signature checks
    old_argv = list(sys.argv)
    try:
        sys.argv = ["release_data_only.py", "status", "--keep"]
        import deploy_cloudflare as dc

        dc = importlib.reload(dc)
        check(True, "import-with-foreign-argv")
    finally:
        sys.argv = old_argv

    required_symbols = (
        "_hash_random_pbkdf2",
        "ensure_logged_in",
        "load_edge_meta",
        "save_edge_meta",
        "build_env",
        "run_wrangler",
        "_upload_one_batch",
        "wrangler_bin",
    )
    for sym in required_symbols:
        check(hasattr(dc, sym), f"symbol-{sym}", f"missing {sym}")

    sig_ensure = inspect.signature(dc.ensure_logged_in)
    pos_params = [
        p
        for p in sig_ensure.parameters.values()
        if p.kind in (inspect.Parameter.POSITIONAL_ONLY, inspect.Parameter.POSITIONAL_OR_KEYWORD)
    ]
    check(len(pos_params) == 1, "ensure-logged-in-1-pos-arg", f"got {sig_ensure}")

    # 3. Subprocess --help / -h checks
    expected_help_flags = (
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
        "--login",
    )
    for hflag in ("--help", "-h"):
        r = run_cli([hflag])
        check(r.returncode == 0, f"help-exit-{hflag}", f"rc={r.returncode} stderr={r.stderr}")
        for ef in expected_help_flags:
            check(ef in r.stdout, f"help-{hflag}-has-{ef}", f"missing {ef} in help output")

    # 4. Unknown flags, abbreviated flags, and positional args must exit 2
    bad_invocations = (
        (["--unknown"], "unknown-flag"),
        (["--skip-seeds"], "typo-flag"),
        (["-z"], "unknown-short-flag"),
        (["--par"], "abbrev-par"),
        (["--rot"], "abbrev-rot"),
        (["--skip-live"], "abbrev-skip-live"),
        (["prod"], "positional-arg"),
    )
    for args, label in bad_invocations:
        r = run_cli(args)
        check(r.returncode == 2, f"reject-{label}-rc2", f"rc={r.returncode} stdout={r.stdout}")
        check(bool((r.stderr or "").strip()), f"reject-{label}-stderr", "expected error text on stderr")

    # 5. Conflicting flag pairs must exit 2
    conflict_cases = (
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
    )
    for args, label in conflict_cases:
        r = run_cli(args)
        check(r.returncode == 2, f"conflict-{label}-rc2", f"rc={r.returncode} stdout={r.stdout}")
        check(bool((r.stderr or "").strip()), f"conflict-{label}-stderr", "expected error text on stderr")

    # 6. In-process --dry / --dry-run no-mutation checks
    def forbid(name: str):
        def _boom(*_a, **_kw):
            raise AssertionError(f"forbidden call during --dry: {name}")
        return _boom

    with tempfile.TemporaryDirectory(prefix="isabi-dry-test-") as td:
        td_path = pathlib.Path(td)
        fake_meta_path = td_path / "missing_dir" / "cloudflare_edge_meta.json"
        orig_attrs = {
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
                (["--dry"], "dry-full"),
                (["--dry-run"], "dry-run-full"),
                (["--dry", "--skip-seed"], "dry-skip-seed"),
                (["--dry", "--pages-only"], "dry-pages-only"),
                (["--dry", "--configure-domain", "--ping-indexnow"], "dry-configure-domain+indexnow"),
                (["--dry", "--ping-indexnow"], "dry-ping-indexnow"),
                (["--dry", "--check-seat-pins"], "dry-check-seat-pins"),
                (["--dry", "--parity-only", "--no-sync-release-log"], "dry-parity-only"),
            )
            for args, label in dry_cases:
                buf = io.StringIO()
                rc = None
                with contextlib.redirect_stdout(buf):
                    try:
                        dc.main(args)
                    except SystemExit as ex:
                        rc = ex.code
                check(rc == 0, f"{label}-exit-0", f"rc={rc}")
                check("DRY RUN" in buf.getvalue(), f"{label}-banner", "missing DRY RUN header")
                check(not fake_meta_path.exists() and not fake_meta_path.parent.exists(), f"{label}-0-files-created")

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
            check(rc_delta == 2, "dry-delta-missing-manifest-exit-2", f"rc={rc_delta}")
            check("d1_seed_manifest.json" in err_buf.getvalue(), "dry-delta-missing-manifest-msg", err_buf.getvalue())

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
            check(raised_sys_exit, "seed-require-delta-raises")
            check("d1_seed_manifest.json" in exit_msg, "seed-require-delta-msg", exit_msg)
        finally:
            dc.SECRET_STATE_FILE = orig_attrs["SECRET_STATE_FILE"]
            dc.COMMITTED_MANIFEST_JSON = orig_attrs["COMMITTED_MANIFEST_JSON"]
            dc.run_wrangler = orig_attrs["run_wrangler"]
            dc.cf_api = orig_attrs["cf_api"]
            dc.ping_indexnow = orig_attrs["ping_indexnow"]
            dc.run_live_parity_gate = orig_attrs["run_live_parity_gate"]
            dc.save_edge_meta = orig_attrs["save_edge_meta"]
            dc.load_or_create_jwt_secret = orig_attrs["load_or_create_jwt_secret"]
            dc.ensure_logged_in = orig_attrs["ensure_logged_in"]
            dc.subprocess.run = orig_attrs["subproc_run"]
            dc = importlib.reload(dc)

    print(f"PASS: verify_deploy_cli ({passed}/{total} checks)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
