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

# Offline regression gates run before every sync (about 4 s together; none touches the network or live D1).
# (repo, path inside it, interpreter). A gate missing from the tree is reported as SKIP, so this file can merge
# before the branch that adds the gate; a gate that exists and fails stops the sync.
RELEASE_GATES = [
    ("isabi-app", "build/verify_workbook_cache.py", "python"),       # top-up workbook cache + lazy openpyxl
    ("isabi-app", "build/verify_sharepoint_hash_skip.py", "python"), # Graph quickXorHash re-read skip
    ("isabi-app", "build/verify_legacy_id_sunset.py", "python"),     # legacy_id_map sunset gate
    ("isabi", "build/verify_legacy_id_hits.mjs", "node"),            # Edge legacy_id_hits counter + minShellVer floor/cap
    ("isabi", "build/verify_deployed_shell.py", "python"),           # deployed_shell.js = app/sw.js (minShellVer ceiling)
    ("isabi-app", "build/verify_min_shell_ver_local.py", "python"),  # server.py minShellVer floor/cap
    ("isabi-app", "build/verify_orphan_expense_lines.py", "python"), # top-up reconcile: orphan expense lines
]


GATE_TIMEOUT_S = 600   # a gate that hangs (e.g. OneDrive fetching a cloud-only workbook) stops the sync, not the PC


def _node_runtime() -> tuple[str, dict] | None:
    """node on PATH, else the same fallbacks as audit_showcase_i18n.find_node_runtime (VS Code's Electron)."""
    env = dict(os.environ)
    found = shutil.which("node")
    if found:
        return found, env
    for c in (
        os.path.join(os.path.expanduser("~"), ".local", "node", "node.exe"),
        r"C:\Program Files\nodejs\node.exe",
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "Microsoft VS Code", "Code.exe"),
        r"C:\Program Files\Microsoft VS Code\Code.exe",
    ):
        if os.path.isfile(c):
            if os.path.basename(c).lower() == "code.exe":
                env["ELECTRON_RUN_AS_NODE"] = "1"
            return c, env
    return None


def run_release_gates() -> None:
    if os.environ.get("ISABI_SKIP_RELEASE_GATES") == "1" or "--skip-release-gates" in sys.argv:
        print("WARN: release gates skipped (--skip-release-gates / ISABI_SKIP_RELEASE_GATES=1)")
        return
    roots = {"isabi-app": APP_SRC_ROOT, "isabi": ISABI_ROOT}
    for repo, rel, interp in RELEASE_GATES:
        script = os.path.join(roots[repo], *rel.split("/"))
        if not os.path.isfile(script):
            print(f"SKIP: release gate {repo}/{rel} is not in this tree")
            continue
        env = None
        if interp == "python":
            exe = sys.executable
        else:
            rt = _node_runtime()
            if rt is None:
                print(f"ERROR: release gate {repo}/{rel} needs Node.js, and none was found (PATH, ~/.local/node, "
                      "Program Files, VS Code). Install Node 22.5+ or pass --skip-release-gates for this run.", file=sys.stderr)
                raise SystemExit(1)
            exe, env = rt
        try:
            chk = subprocess.run([exe, script], capture_output=True, text=True, encoding="utf-8", errors="replace",
                                 cwd=roots[repo], env=env, timeout=GATE_TIMEOUT_S, stdin=subprocess.DEVNULL)
        except subprocess.TimeoutExpired:
            print(f"ERROR: release gate {repo}/{rel} did not finish within {GATE_TIMEOUT_S} s; sync stopped.", file=sys.stderr)
            raise SystemExit(1)
        tail = (chk.stdout.strip().splitlines() or ["(no output)"])[-1]
        if chk.returncode != 0:
            print(f"ERROR: release gate {repo}/{rel} failed (exit {chk.returncode}) in sync_app.py!", file=sys.stderr)
            if chk.stdout:
                print(chk.stdout[-6000:], file=sys.stderr)
            if chk.stderr:
                print(chk.stderr[-3000:], file=sys.stderr)
            raise SystemExit(chk.returncode or 1)
        print(f"OK: release gate {repo}/{rel}: {tail}")


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


DEPLOYED_SHELL_JS = os.path.join(ISABI_ROOT, "functions", "_lib", "deployed_shell.js")
_DEPLOYED_SHELL_RE = re.compile(r"export const DEPLOYED_SHELL_VER = '([0-9.]+)';")


def render_deployed_shell_js(ver: str) -> str:
    return (
        "// The Command Center shell version this deploy serves (SHELL_CACHE in app/sw.js). Written by build/sync_app.py in\n"
        "// the same pass that copies app/sw.js, and checked again by build/stage_pages_bundle.py before every deploy.\n"
        "// It is the ceiling for the store's minShellVer (holdMinShellVer in d1_store.js). Do not edit by hand.\n"
        f"export const DEPLOYED_SHELL_VER = '{ver}';\n"
    )


def write_deployed_shell_ver(ver: str) -> bool:
    """Keeps functions/_lib/deployed_shell.js equal to the shell just copied into app/ (the Edge caps the store's
    minShellVer at it). Returns True when the file changed."""
    if not re.fullmatch(r"\d{1,4}(?:\.\d{1,6}){0,3}", ver):
        raise SystemExit(f"ERROR: shell version {ver!r} is not a plain dotted version; deployed_shell.js not written")
    want = render_deployed_shell_js(ver)
    try:
        with open(DEPLOYED_SHELL_JS, "r", encoding="utf-8") as f:
            if f.read() == want:
                return False
    except FileNotFoundError:
        pass
    with open(DEPLOYED_SHELL_JS, "w", encoding="utf-8", newline="\n") as f:
        f.write(want)
    return True


def rederive_deployed_shell_ver(app_out: str | None = None) -> tuple[str, bool]:
    """Rewrites deployed_shell.js from the sw.js already in app/ (not the source being synced). Returns the version
    found ('' when app/sw.js is missing or unreadable) and whether the file changed."""
    try:
        with open(os.path.join(app_out or APP_OUT, "sw.js"), "r", encoding="utf-8") as f:
            m = re.search(r"SHELL_CACHE\s*=\s*['\"]isabi-mfg-v([0-9.]+)['\"]", f.read())
    except FileNotFoundError:
        return "", False
    if not m:
        return "", False
    return m.group(1), write_deployed_shell_ver(m.group(1))


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

    # deployed_shell.js is derived from app/sw.js: re-derive it from the shell this tree holds now, so a sync that
    # stopped after copying sw.js (or a merged peer shell bump) never leaves the gates below failing for good.
    cur_ver, cur_changed = rederive_deployed_shell_ver()
    if cur_changed:
        print(f"OK: functions/_lib/deployed_shell.js re-derived from the current app/sw.js (v{cur_ver})")

    run_release_gates()

    os.makedirs(APP_OUT, exist_ok=True)
    copied = 0

    for fname in TOP_FILES:
        src = os.path.join(APP_SRC_ROOT, fname)
        if os.path.isfile(src):
            shutil.copyfile(src, os.path.join(APP_OUT, fname))
            copied += 1
    # Straight after sw.js is copied, so nothing below can leave the two out of step.
    changed = write_deployed_shell_ver(ver)
    print(f"OK: functions/_lib/deployed_shell.js {'set to' if changed else 'already at'} v{ver} (minShellVer ceiling)")

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
