"""stage_pages_bundle.py — Stages an explicit allowlist bundle for Cloudflare Pages deployment.

Ensures internal build scripts, SQL migrations, D1 batch exports, wrangler.toml, server.py,
reset.html, and real operational seed_*.json files are NEVER uploaded to Cloudflare Pages CDN.

Usage:
  python build/stage_pages_bundle.py [--dry] <dest_dir>
"""
from __future__ import annotations

import argparse
import os
import pathlib
import shutil
import sys

ISABI_ROOT = pathlib.Path(__file__).resolve().parent.parent

ROOT_ALLOWLIST = (
    ".assetsignore",
    "index.html",
    "sw.js",
    "manifest.json",
    "robots.txt",
    "sitemap.xml",
    "CNAME",
    "_headers",
    "_routes.json",
    "og-image.png",
    "favicon.ico",
    "favicon-dark.ico",
    "icon.svg",
    "icon-dark.svg",
    "icon-maskable.svg",
    "icon-180.png",
    "icon-192.png",
    "icon-512.png",
    "icon-512-maskable.png",
    "404.html",
    "c4b9e2a7d18f406395e1a82c7d3f6b90.txt",
)

APP_FORBIDDEN_REL = {
    "reset.html",
    "server.py",
    "js/seed_data.js",
    "js/seed_core.json",
    "js/seed_records.json",
    "js/seed_industries.json",
}

APP_ALLOWED_TOP = {
    "index.html",
    "sw.js",
    "manifest.json",
    "favicon.ico",
    "favicon-dark.ico",
    "icon.svg",
    "icon-dark.svg",
    "icon-180.png",
    "icon-192.png",
    "icon-512.png",
    "icon-512-maskable.png",
}

APP_ALLOWED_DIRS = ("css", "js", "vendor")


def check_deployed_shell_ver(root: pathlib.Path | None = None) -> str:
    """The Edge caps the store's minShellVer at functions/_lib/deployed_shell.js, so it must name the shell in app/sw.js
    that this deploy serves. A stale-high value would let devices be told to update to a shell that does not exist;
    a stale-low one would stop nudging older devices. Run `python build/sync_app.py` to rewrite it."""
    import re

    if root is None:
        root = ISABI_ROOT
    sw = root / "app" / "sw.js"
    ds = root / "functions" / "_lib" / "deployed_shell.js"
    if not sw.is_file() or not ds.is_file():
        return ""
    m_sw = re.search(r"\bSHELL_CACHE\s*=\s*['\"]isabi-mfg-v([0-9.]+)['\"]", sw.read_text(encoding="utf-8", errors="replace"))
    m_ds = re.search(r"export const DEPLOYED_SHELL_VER = '([0-9.]+)';", ds.read_text(encoding="utf-8", errors="replace"))
    if not m_sw or not m_ds or m_sw.group(1) != m_ds.group(1):
        raise RuntimeError(
            "DEPLOYED SHELL GATE FAILED: functions/_lib/deployed_shell.js says "
            f"{m_ds.group(1) if m_ds else '(unreadable)'} but app/sw.js serves {m_sw.group(1) if m_sw else '(unreadable)'}; "
            "run python build/sync_app.py (it rewrites the file) and commit both."
        )
    return m_sw.group(1)


def count_stageable_files(root: pathlib.Path | None = None) -> tuple[int, int]:
    """Read-only count of allowlisted (root_count, app_count) matching stage_pages_bundle() rules."""
    src_root = (root or ISABI_ROOT).resolve()
    root_count = 0
    for fname in ROOT_ALLOWLIST:
        if (src_root / fname).is_file():
            root_count += 1

    app_count = 0
    app_src = src_root / "app"
    if app_src.is_dir():
        for fname in APP_ALLOWED_TOP:
            if (app_src / fname).is_file():
                app_count += 1
        for sub in APP_ALLOWED_DIRS:
            sub_src = app_src / sub
            if not sub_src.is_dir():
                continue
            for walk_root, _, files in os.walk(sub_src):
                rel_from_app = pathlib.Path(walk_root).relative_to(app_src)
                for f in files:
                    rel_posix = (rel_from_app / f).as_posix()
                    if rel_posix in APP_FORBIDDEN_REL or f.endswith((".py", ".db", ".sqlite", ".sql")):
                        continue
                    app_count += 1

    return root_count, app_count


def _validate_dest_dir(dest_dir: pathlib.Path, src_root: pathlib.Path | None = None) -> pathlib.Path:
    """Reject staging into ISABI_ROOT, its ancestors/subdirectories, or any git repo/worktree container."""
    resolved_src = (src_root or ISABI_ROOT).resolve()
    resolved_dest = dest_dir.resolve()
    if resolved_dest == resolved_src:
        raise ValueError("Refusing to stage in-place over ISABI_ROOT")
    if resolved_dest in resolved_src.parents:
        raise ValueError(f"Refusing to stage into ancestor of ISABI_ROOT: {resolved_dest}")
    if resolved_dest.is_relative_to(resolved_src):
        raise ValueError(f"Refusing to stage inside ISABI_ROOT (pass an external/temp directory): {resolved_dest}")
    if resolved_dest.exists():
        git_marker = resolved_dest / ".git"
        if git_marker.exists() or git_marker.is_symlink():
            raise ValueError(f"Refusing to stage over git repository or worktree: {resolved_dest}")
        if resolved_dest.is_dir():
            for child in resolved_dest.iterdir():
                if child.is_dir():
                    child_git = child / ".git"
                    if child_git.exists() or child_git.is_symlink():
                        raise ValueError(
                            f"Refusing to stage over parent directory of git repo/worktree ({child.name}): {resolved_dest}"
                        )
    return resolved_dest


def stage_pages_bundle(dest_dir: pathlib.Path, *, root: pathlib.Path | None = None) -> int:
    src_root = (root or ISABI_ROOT).resolve()
    dest_dir = _validate_dest_dir(dest_dir, src_root)
    check_deployed_shell_ver(src_root)
    if dest_dir.exists():
        shutil.rmtree(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)

    copied = 0

    # 1. Root Showcase public files (normalizing text control files to LF)
    lf_files = {"_headers", "_routes.json", "CNAME", "robots.txt", "sitemap.xml", "c4b9e2a7d18f406395e1a82c7d3f6b90.txt"}
    for fname in ROOT_ALLOWLIST:
        src = src_root / fname
        if not src.is_file():
            continue
        dst = dest_dir / fname
        if fname in lf_files:
            raw = src.read_bytes().replace(b"\r\n", b"\n")
            dst.write_bytes(raw)
        else:
            shutil.copy2(src, dst)
        copied += 1

    # 2. Note: `functions/**` is intentionally NOT copied into `dest_dir`.
    # `wrangler pages deploy <dest_dir>` runs from `ISABI_ROOT` and compiles `./functions`
    # directly into the Edge Worker (`_worker.js`), keeping function source off the static CDN.

    # 3. Command Center `/app/` allowlist (excluding private seeds, reset.html, server.py, data/, build/)
    app_src = src_root / "app"
    if app_src.is_dir():
        app_dst = dest_dir / "app"
        app_dst.mkdir(parents=True, exist_ok=True)
        for fname in APP_ALLOWED_TOP:
            s = app_src / fname
            if s.is_file():
                shutil.copy2(s, app_dst / fname)
                copied += 1
        for sub in APP_ALLOWED_DIRS:
            sub_src = app_src / sub
            if not sub_src.is_dir():
                continue
            for walk_root, _, files in os.walk(sub_src):
                rel_from_app = pathlib.Path(walk_root).relative_to(app_src)
                target_sub = app_dst / rel_from_app
                target_sub.mkdir(parents=True, exist_ok=True)
                for f in files:
                    rel_posix = (rel_from_app / f).as_posix()
                    if rel_posix in APP_FORBIDDEN_REL or f.endswith((".py", ".db", ".sqlite", ".sql")):
                        continue
                    shutil.copy2(pathlib.Path(walk_root) / f, target_sub / f)
                    copied += 1

    # Post-stage hard assertion: zero forbidden artifacts exist in bundle
    forbidden_checks = (
        dest_dir / "wrangler.toml",
        dest_dir / "reset.html",
        dest_dir / "functions",
        dest_dir / "build",
        dest_dir / "exports",
        dest_dir / "migrations",
        dest_dir / "app" / "server.py",
        dest_dir / "app" / "reset.html",
        dest_dir / "app" / "js" / "seed_core.json",
        dest_dir / "app" / "js" / "seed_records.json",
        dest_dir / "app" / "js" / "seed_industries.json",
    )
    for bad in forbidden_checks:
        if bad.exists():
            raise RuntimeError(f"SECURITY GATE FAILED: forbidden path staged in bundle: {bad}")

    return copied


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="build/stage_pages_bundle.py",
        description="Stage the allowlisted Cloudflare Pages public bundle into dest_dir.",
        allow_abbrev=False,
    )
    parser.add_argument(
        "--dry",
        "--dry-run",
        dest="dry",
        action="store_true",
        help="Check deployed_shell parity and count allowlisted files without writing dest_dir.",
    )
    parser.add_argument(
        "dest_dir",
        nargs="?",
        default=None,
        help="Destination directory for staged Cloudflare Pages bundle (required unless --dry).",
    )
    return parser


def parse_cli_args(argv: list[str] | None = None, *, root: pathlib.Path | None = None) -> argparse.Namespace:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    if args.dest_dir is not None:
        raw_dest = str(args.dest_dir)
        if not raw_dest.strip():
            parser.error("dest_dir cannot be empty.")
        if raw_dest.lstrip().startswith("-") or pathlib.Path(raw_dest).name.startswith("-"):
            parser.error(f"dest_dir cannot start with '-': {args.dest_dir!r}")
        try:
            _validate_dest_dir(pathlib.Path(raw_dest), root or ISABI_ROOT)
        except ValueError as ex:
            parser.error(str(ex))
    if not args.dry and args.dest_dir is None:
        parser.error("the following arguments are required: dest_dir (unless --dry is passed)")
    return args


def print_dry_run_plan(args: argparse.Namespace) -> int:
    try:
        ver = check_deployed_shell_ver(ISABI_ROOT)
    except RuntimeError as ex:
        print(f"ERROR: {ex}", file=sys.stderr)
        return 1
    root_n, app_n = count_stageable_files(ISABI_ROOT)
    target_str = (
        str(pathlib.Path(args.dest_dir).resolve())
        if args.dest_dir
        else "(unspecified; pass <dest_dir> for live staging)"
    )
    print("DRY RUN: 0 local writes")
    print(f"  Source   : {ISABI_ROOT}")
    print(f"  Target   : {target_str}")
    print(f"  Shell    : v{ver or '(none)'}")
    print(f"  Bundle   : {root_n + app_n} allowlisted files ({root_n} root + {app_n} app/)")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = parse_cli_args(argv)
    if args.dry:
        return print_dry_run_plan(args)
    out = pathlib.Path(args.dest_dir)
    n = stage_pages_bundle(out)
    print(f"OK: Staged {n} allowlisted files into {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
