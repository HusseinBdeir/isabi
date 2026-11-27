"""verify_pwa_ios_contract.py — ISABI release gate wrapper for Admin/test_pwa_ios_contract.py.

Runs offline self-tests on every host (including GitHub Actions where bhfirms/memory is absent),
then invokes memory/Admin/test_pwa_ios_contract.py against the active isabi-app and isabi trees
to catch iOS standalone CSS, top-header backdrop-filter, and ?v= drift before Cloudflare deploy.

Usage:
  python build/verify_pwa_ios_contract.py
"""
from __future__ import annotations

import ast
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from typing import Mapping

ISABI_ROOT = Path(__file__).resolve().parent.parent
ENV_CONTRACT_SCRIPT = "THEO_PWA_IOS_CONTRACT_SCRIPT"


def resolve_contract_script(isabi_root: Path, env: Mapping[str, str]) -> Path | None:
    """Locate Admin/test_pwa_ios_contract.py across worktrees, sibling checkouts, or ~/bhfirms."""
    override = (env.get(ENV_CONTRACT_SCRIPT) or "").strip()
    if override:
        cand = Path(override)
        return cand if cand.is_file() else None

    candidates: list[Path] = [
        isabi_root.resolve().parent / "memory" / "Admin" / "test_pwa_ios_contract.py",
    ]
    git_res = subprocess.run(
        ["git", "-C", str(isabi_root), "rev-parse", "--git-common-dir"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=10,
        stdin=subprocess.DEVNULL,
    )
    if git_res.returncode == 0 and git_res.stdout.strip():
        common = (isabi_root / git_res.stdout.strip()).resolve()
        candidates.append(common.parent.parent / "memory" / "Admin" / "test_pwa_ios_contract.py")

    candidates.append(Path.home() / "bhfirms" / "memory" / "Admin" / "test_pwa_ios_contract.py")
    for cand in candidates:
        if cand.is_file():
            return cand
    return None


def build_contract_args(isabi_root: Path, env: Mapping[str, str]) -> list[str]:
    """Build CLI flags for test_pwa_ios_contract.py covering isabi-app + isabi (or isabi alone)."""
    app_env = (env.get("ISABI_APP_SRC") or "").strip()
    if app_env:
        app_src: Path | None = Path(app_env).resolve()
    else:
        app_src = next(
            (isabi_root.parent / name for name in ("isabi-app", "mfg-web") if (isabi_root.parent / name).exists()),
            None,
        )

    has_app = app_src is not None and (app_src / "index.html").is_file()
    if env.get("ISABI_SYNC_IN_PROGRESS") == "1" and not has_app:
        raise RuntimeError(f"ISABI_SYNC_IN_PROGRESS=1 requires a valid isabi-app tree (got {app_src})")

    if has_app:
        return [
            "--only",
            "isabi-app,isabi",
            "--app",
            f"isabi-app={app_src}",
            "--app",
            f"isabi={isabi_root}",
        ]
    return ["--only", "isabi", "--app", f"isabi={isabi_root}"]


def run_contract_gate(isabi_root: Path, env: Mapping[str, str]) -> tuple[int, str, str]:
    """Execute the resolved contract script, returning (returncode, stdout, stderr)."""
    contract_script = resolve_contract_script(isabi_root, env)
    if contract_script is None:
        return 0, "SKIP live check (Admin/test_pwa_ios_contract.py absent on this host)", ""

    c_args = build_contract_args(isabi_root, env)
    sub_env = dict(env)
    sub_env["PYTHONDONTWRITEBYTECODE"] = "1"
    chk = subprocess.run(
        [sys.executable, str(contract_script), *c_args],
        cwd=str(isabi_root),
        env=sub_env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=120,
        stdin=subprocess.DEVNULL,
    )
    return chk.returncode, chk.stdout or "", chk.stderr or ""


def _parse_sync_app_gate_lists(sync_app_path: Path) -> tuple[list[tuple[str, ...]], list[tuple[str, ...]]]:
    tree = ast.parse(sync_app_path.read_text(encoding="utf-8"))
    found: dict[str, list[tuple[str, ...]]] = {}
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for tgt in node.targets:
                if isinstance(tgt, ast.Name) and tgt.id in ("RELEASE_GATES", "POST_SYNC_ONLY_GATES"):
                    val = ast.literal_eval(node.value)
                    found[tgt.id] = [tuple(x) for x in val]
    return found.get("RELEASE_GATES", []), found.get("POST_SYNC_ONLY_GATES", [])


def run_self_tests(isabi_root: Path) -> None:
    """Verify sync_app.py wiring, missing-script handling, sync-mode guards, and failure propagation."""
    rel_gates, post_sync = _parse_sync_app_gate_lists(isabi_root / "build" / "sync_app.py")
    expected = ("isabi", "build/verify_pwa_ios_contract.py", "python")
    assert expected in rel_gates, f"{expected} missing from sync_app.py RELEASE_GATES"
    assert ("isabi", "build/verify_pwa_ios_contract.py") not in post_sync, "gate must not be in POST_SYNC_ONLY_GATES"

    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        missing_script = td_path / "missing_contract.py"
        assert resolve_contract_script(isabi_root, {ENV_CONTRACT_SCRIPT: str(missing_script)}) is None

        app_dir = td_path / "app"
        app_dir.mkdir()
        (app_dir / "index.html").write_text("<!doctype html>", encoding="utf-8")
        both_args = build_contract_args(isabi_root, {"ISABI_APP_SRC": str(app_dir)})
        assert both_args == ["--only", "isabi-app,isabi", "--app", f"isabi-app={app_dir.resolve()}", "--app", f"isabi={isabi_root}"]

        absent_app = td_path / "no_such_app"
        site_only_args = build_contract_args(isabi_root, {"ISABI_APP_SRC": str(absent_app)})
        assert site_only_args == ["--only", "isabi", "--app", f"isabi={isabi_root}"]

        try:
            build_contract_args(isabi_root, {"ISABI_APP_SRC": str(absent_app), "ISABI_SYNC_IN_PROGRESS": "1"})
        except RuntimeError:
            pass
        else:
            raise AssertionError("Expected RuntimeError when ISABI_SYNC_IN_PROGRESS=1 and isabi-app is missing")

        stub = td_path / "stub_fail.py"
        stub.write_text("import sys\nprint('SIMULATED VIOLATION')\nsys.exit(1)\n", encoding="utf-8")
        rc, out, err = run_contract_gate(
            isabi_root,
            {**os.environ, ENV_CONTRACT_SCRIPT: str(stub), "ISABI_APP_SRC": str(app_dir)},
        )
        assert rc == 1 and "SIMULATED VIOLATION" in (out + err), f"Expected failing stub output, got rc={rc} out={out!r} err={err!r}"


def main() -> int:
    run_self_tests(ISABI_ROOT)
    contract_script = resolve_contract_script(ISABI_ROOT, os.environ)
    if contract_script is None:
        print("OK: verify_pwa_ios_contract self-tests passed; SKIP live check (Admin/test_pwa_ios_contract.py absent on this host)")
        return 0

    rc, out, err = run_contract_gate(ISABI_ROOT, os.environ)
    if rc != 0:
        if out:
            print(out, file=sys.stderr)
        if err:
            print(err, file=sys.stderr)
        return rc

    last_line = (out.strip().splitlines() or ["verified"])[-1]
    print(f"OK: verify_pwa_ios_contract: {last_line}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
