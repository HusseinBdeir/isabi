"""stage_pages_bundle.py — Stages an explicit allowlist bundle for Cloudflare Pages deployment.

Ensures internal build scripts, SQL migrations, D1 batch exports, wrangler.toml, server.py,
reset.html, and real operational seed_*.json files are NEVER uploaded to Cloudflare Pages CDN.
"""
from __future__ import annotations

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


def stage_pages_bundle(dest_dir: pathlib.Path) -> int:
    dest_dir = dest_dir.resolve()
    if dest_dir == ISABI_ROOT.resolve():
        raise ValueError("Refusing to stage in-place over ISABI_ROOT")
    if dest_dir.exists():
        shutil.rmtree(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)

    copied = 0

    # 1. Root Showcase public files (normalizing text control files to LF)
    lf_files = {"_headers", "_routes.json", "CNAME", "robots.txt", "sitemap.xml", "c4b9e2a7d18f406395e1a82c7d3f6b90.txt"}
    for fname in ROOT_ALLOWLIST:
        src = ISABI_ROOT / fname
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
    app_src = ISABI_ROOT / "app"
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
            for root, _, files in os.walk(sub_src):
                rel_from_app = pathlib.Path(root).relative_to(app_src)
                target_sub = app_dst / rel_from_app
                target_sub.mkdir(parents=True, exist_ok=True)
                for f in files:
                    rel_posix = (rel_from_app / f).as_posix()
                    if rel_posix in APP_FORBIDDEN_REL or f.endswith((".py", ".db", ".sqlite", ".sql")):
                        continue
                    shutil.copy2(pathlib.Path(root) / f, target_sub / f)
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


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python build/stage_pages_bundle.py <dest_dir>", file=sys.stderr)
        sys.exit(2)
    out = pathlib.Path(sys.argv[1])
    n = stage_pages_bundle(out)
    print(f"OK: Staged {n} allowlisted files into {out}")
