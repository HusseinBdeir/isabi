"""sync_app.py — Syncs the ISABI Command Center PWA bundle (from bhfirms/isabi-app) into bhfirms/isabi/app/.
Ensures https://isabisystems.com/app/ serves the exact verified Command Center assets.
"""
import os
import re
import shutil
import subprocess
import sys

ISABI_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_PARENT_DIR = os.path.dirname(ISABI_ROOT)
APP_SRC_ROOT = os.environ.get("ISABI_APP_SRC") or (
    os.path.join(_PARENT_DIR, "isabi-app")
    if os.path.isdir(os.path.join(_PARENT_DIR, "isabi-app"))
    else os.path.join(_PARENT_DIR, "mfg-web")
)
APP_OUT = os.path.join(ISABI_ROOT, "app")

TOP_FILES = [
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
]

EXCLUDED_JS_FILES = {
    "seed_core.json",
    "seed_records.json",
    "seed_industries.json",
}

SUB_DIRS = [
    "css",
    "js",
    "vendor",
]


def verify_shell_version_parity() -> str:
    sw_path = os.path.join(APP_SRC_ROOT, "sw.js")
    idx_path = os.path.join(APP_SRC_ROOT, "index.html")
    man_path = os.path.join(APP_SRC_ROOT, "manifest.json")
    with open(sw_path, "r", encoding="utf-8") as f:
        sw_txt = f.read()
    with open(idx_path, "r", encoding="utf-8") as f:
        idx_txt = f.read()
    with open(man_path, "r", encoding="utf-8") as f:
        man_txt = f.read()

    m_cache = re.search(r"SHELL_CACHE\s*=\s*['\"]isabi-mfg-v([^'\"]+)['\"]", sw_txt)
    if not m_cache:
        raise SystemExit("ERROR: Could not parse SHELL_CACHE version in sw.js")
    ver = m_cache.group(1)

    m_html_ver = re.search(r"__MFG_SHELL_VER\s*=\s*['\"]([^'\"]+)['\"]", idx_txt)
    if not m_html_ver or m_html_ver.group(1) != ver:
        raise SystemExit(
            f"ERROR: Version mismatch: sw.js SHELL_CACHE={ver} vs index.html __MFG_SHELL_VER={m_html_ver.group(1) if m_html_ver else 'MISSING'}"
        )

    for label, txt in [("sw.js", sw_txt), ("index.html", idx_txt), ("manifest.json", man_txt)]:
        q_vers = set(re.findall(r"\?v=([0-9]+\.[0-9]+\.[0-9]+)", txt))
        if q_vers != {ver}:
            raise SystemExit(f"ERROR: ?v= query string mismatch in {label}: found {sorted(q_vers)}, expected {[ver]}")

    return ver


def sync_command_app() -> int:
    if not os.path.isdir(APP_SRC_ROOT):
        print(f"WARN: {APP_SRC_ROOT} not found, skipping app/ sync.")
        return 0

    ver = verify_shell_version_parity()
    print(f"OK: Shell version parity verified (v{ver} across sw.js, index.html, manifest.json)")

    audit_script = os.path.join(APP_SRC_ROOT, "build", "audit_i18n.py")
    if os.path.isfile(audit_script) and os.environ.get("ISABI_SKIP_I18N_AUDIT") != "1" and "--skip-i18n-audit" not in sys.argv:
        chk = subprocess.run([sys.executable, audit_script], capture_output=True, text=True, encoding="utf-8")
        if chk.returncode != 0:
            print("ERROR: Command Center i18n gate failed in sync_app.py!", file=sys.stderr)
            if chk.stdout:
                print(chk.stdout, file=sys.stderr)
            if chk.stderr:
                print(chk.stderr, file=sys.stderr)
            raise SystemExit(chk.returncode)
        if chk.stdout.strip():
            print(chk.stdout.strip())

    os.makedirs(APP_OUT, exist_ok=True)
    copied = 0

    for fname in TOP_FILES:
        src = os.path.join(APP_SRC_ROOT, fname)
        if os.path.isfile(src):
            shutil.copyfile(src, os.path.join(APP_OUT, fname))
            copied += 1

    for dname in SUB_DIRS:
        src_dir = os.path.join(APP_SRC_ROOT, dname)
        dst_dir = os.path.join(APP_OUT, dname)
        if not os.path.isdir(src_dir):
            continue
        for root, _, files in os.walk(src_dir):
            rel = os.path.relpath(root, src_dir)
            target_root = dst_dir if rel == "." else os.path.join(dst_dir, rel)
            os.makedirs(target_root, exist_ok=True)
            for f in files:
                if dname == "js" and rel == "." and f in EXCLUDED_JS_FILES:
                    stale_dst = os.path.join(target_root, f)
                    if os.path.exists(stale_dst):
                        os.remove(stale_dst)
                    continue
                shutil.copyfile(os.path.join(root, f), os.path.join(target_root, f))
                copied += 1

    # Overwrite local_dev_roster.js with an empty public stub so real staff seats/emails never ship in /app/js/
    public_roster_stub = os.path.join(APP_OUT, "js", "local_dev_roster.js")
    if os.path.isdir(os.path.dirname(public_roster_stub)):
        with open(public_roster_stub, "w", encoding="utf-8", newline="\n") as f:
            f.write(
                "/* Public bundle stub: real dev seats live only in server D1 */\n"
                "window.__ISABI_LOCAL_DEV_USERS = [];\n"
                "window.__ISABI_LOCAL_MULTI_SEATS = [];\n"
            )

    # Remove retired/private files so they are never bundled into public /app/
    for stale_path in (
        os.path.join(APP_OUT, "js", "seed_data.js"),
        os.path.join(APP_OUT, "js", "seed_core.json"),
        os.path.join(APP_OUT, "js", "seed_records.json"),
        os.path.join(APP_OUT, "js", "seed_industries.json"),
        os.path.join(APP_OUT, "reset.html"),
        os.path.join(APP_OUT, "server.py"),
        os.path.join(ISABI_ROOT, "reset.html"),
    ):
        if os.path.exists(stale_path):
            os.remove(stale_path)

    # Security gate: assert zero internal @bhfirms.com emails ship in public /app/js/
    js_out_dir = os.path.join(APP_OUT, "js")
    if os.path.isdir(js_out_dir):
        for root, _, files in os.walk(js_out_dir):
            for fname in files:
                if not fname.endswith(".js"):
                    continue
                fpath = os.path.join(root, fname)
                with open(fpath, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
                if "@bhfirms.com" in content.lower():
                    raise SystemExit(f"ERROR: Internal @bhfirms.com address leaked into public bundle: {fpath}")

    print(f"OK: Synced {copied} Command Center files from {APP_SRC_ROOT} -> {APP_OUT}")
    return copied


if __name__ == "__main__":
    sync_command_app()
