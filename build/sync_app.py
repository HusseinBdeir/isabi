"""sync_app.py — Syncs the ISABI Command Center PWA bundle (from bhfirms/mfg-web) into bhfirms/isabi/app/.
Ensures https://husseinbdeir.github.io/isabi/app/ serves the exact verified Command Center assets.
"""
import os
import shutil

ISABI_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MFG_ROOT = os.path.join(os.path.dirname(ISABI_ROOT), "mfg-web")
APP_OUT = os.path.join(ISABI_ROOT, "app")

TOP_FILES = [
    "index.html",
    "sw.js",
    "manifest.json",
    "reset.html",
    "favicon.ico",
    "icon.svg",
    "icon-180.png",
    "icon-192.png",
    "icon-512.png",
]

SUB_DIRS = [
    "css",
    "js",
    "vendor",
]


def sync_command_app() -> int:
    if not os.path.isdir(MFG_ROOT):
        print(f"WARN: {MFG_ROOT} not found, skipping app/ sync.")
        return 0

    os.makedirs(APP_OUT, exist_ok=True)
    copied = 0

    for fname in TOP_FILES:
        src = os.path.join(MFG_ROOT, fname)
        if os.path.isfile(src):
            shutil.copy2(src, os.path.join(APP_OUT, fname))
            copied += 1

    for dname in SUB_DIRS:
        src_dir = os.path.join(MFG_ROOT, dname)
        dst_dir = os.path.join(APP_OUT, dname)
        if not os.path.isdir(src_dir):
            continue
        for root, _, files in os.walk(src_dir):
            rel = os.path.relpath(root, src_dir)
            target_root = dst_dir if rel == "." else os.path.join(dst_dir, rel)
            os.makedirs(target_root, exist_ok=True)
            for f in files:
                shutil.copy2(os.path.join(root, f), os.path.join(target_root, f))
                copied += 1

    # Remove retired monolithic seed_data.js if replaced by split seed_core.json + seed_records.json
    legacy_seed = os.path.join(APP_OUT, "js", "seed_data.js")
    if os.path.exists(legacy_seed) and not os.path.exists(os.path.join(MFG_ROOT, "js", "seed_data.js")):
        os.remove(legacy_seed)

    print(f"OK: Synced {copied} Command Center files from {MFG_ROOT} -> {APP_OUT}")
    return copied


if __name__ == "__main__":
    sync_command_app()
