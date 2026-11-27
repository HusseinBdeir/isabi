"""verify_min_shell_parity.py - offline gate for MIN_SYNC_SHELL_VER parity (d1_store.js == server.py)
and rolling-window lag bounds in build/sync_app.py. Touches only a temp directory.

Run: python build/verify_min_shell_parity.py
"""
from __future__ import annotations

import os
import pathlib
import re
import sys
import tempfile

sys.stdout.reconfigure(encoding="utf-8")
BUILD = pathlib.Path(__file__).resolve().parent
ROOT = BUILD.parent
sys.path.insert(0, str(BUILD))

import sync_app as SA  # noqa: E402

FAILED: list[str] = []
COUNT = 0


def check(label: str, got, want) -> None:
    global COUNT
    COUNT += 1
    if got != want:
        FAILED.append(f"{label}: got {got!r}, expected {want!r}")


def raises(label: str, fn) -> None:
    global COUNT
    COUNT += 1
    try:
        fn()
    except SystemExit:
        return
    FAILED.append(f"{label}: expected SystemExit")


def make_tree(tmp_root: pathlib.Path, label: str, d1_ver: str, srv_ver: str, app_fb_ver: str | None = None) -> tuple[str, str]:
    tmp = tmp_root / label
    app_dir = tmp / "isabi-app"
    site_dir = tmp / "isabi"
    (site_dir / "functions" / "_lib").mkdir(parents=True)
    for d in ("css", "js", "vendor"):
        (app_dir / d).mkdir(parents=True)
        (site_dir / "app" / d).mkdir(parents=True)
    (site_dir / "functions" / "_lib" / "d1_store.js").write_text(
        f"export const MIN_SYNC_SHELL_VER = '{d1_ver}';\n",
        encoding="utf-8",
    )
    (app_dir / "server.py").write_text(
        f'MIN_SYNC_SHELL_VER = "{srv_ver}"\n',
        encoding="utf-8",
    )
    fb_val = srv_ver if app_fb_ver is None else app_fb_ver
    fb_line = f"const MIN_SYNC_SHELL_FALLBACK = '{fb_val}';\n" if fb_val != "__OMIT__" else ""
    files = {
        "index.html": "<!doctype html><html></html>\n",
        "sw.js": f"const SHELL_CACHE = 'isabi-mfg-v{srv_ver}';\n",
        "manifest.json": f'{{"name":"ISABI","version":"{srv_ver}"}}\n',
        "css/app.css": f"/* app.css v{srv_ver} */\n",
        "js/app.js": f"/* app.js v{srv_ver} */\n{fb_line}",
        "js/geo_dispatch.js": f"/* geo_dispatch.js v{srv_ver} */\n",
        "js/i18n.js": f"/* i18n.js v{srv_ver} */\n",
        "js/step_up_auth.js": f"/* step_up_auth.js v{srv_ver} */\n",
    }
    for rel, body in files.items():
        (app_dir / rel).write_text(body, encoding="utf-8")
        (site_dir / "app" / rel).write_text(body, encoding="utf-8")
    return str(app_dir), str(site_dir)


_PUBLIC_ROSTER_STUB = (
    b"/* Public bundle stub: real dev seats live only in server D1 */\n"
    b"window.__ISABI_LOCAL_DEV_USERS = [];\n"
    b"window.__ISABI_LOCAL_MULTI_SEATS = [];\n"
)


def _iter_expected_bundle_rels(app_root: pathlib.Path) -> list[str]:
    rels: list[str] = []
    for fname in SA.TOP_FILES:
        if (app_root / fname).is_file():
            rels.append(fname)
    for dname in SA.SUB_DIRS:
        base = app_root / dname
        if not base.is_dir():
            continue
        for p in sorted(base.rglob("*")):
            if not p.is_file():
                continue
            rel = p.relative_to(app_root).as_posix()
            if dname == "js" and p.parent == base and p.name in SA.EXCLUDED_JS_FILES:
                continue
            rels.append(rel)
    return rels


def check_bundle_parity(app_root: str | pathlib.Path, site_root: str | pathlib.Path, *, sync_in_progress: bool) -> None:
    if sync_in_progress:
        return
    app_p = pathlib.Path(app_root)
    out_p = pathlib.Path(site_root) / "app"
    expected_rels = _iter_expected_bundle_rels(app_p)
    for rel in expected_rels:
        src_f = app_p / rel
        dst_f = out_p / rel
        if not src_f.is_file():
            raise SystemExit(f"ERROR: Missing source shell file: {src_f}")
        if not dst_f.is_file():
            raise SystemExit(f"ERROR: Missing synced bundle file: {dst_f}")
        if rel == "js/local_dev_roster.js":
            if dst_f.read_bytes() != _PUBLIC_ROSTER_STUB:
                raise SystemExit(f"ERROR: Public stub mismatch on {rel} ({dst_f}); run python build/sync_app.py")
        elif src_f.read_bytes() != dst_f.read_bytes():
            raise SystemExit(f"ERROR: Synced bundle mismatch on {rel} ({dst_f} != {src_f}); run python build/sync_app.py")
    expected_set = set(expected_rels)
    for dname in SA.SUB_DIRS:
        out_dir = out_p / dname
        if not out_dir.is_dir():
            continue
        for p in sorted(out_dir.rglob("*")):
            if not p.is_file():
                continue
            rel = p.relative_to(out_p).as_posix()
            if rel not in expected_set:
                raise SystemExit(f"ERROR: Extra synced bundle file {rel} in {out_p} absent from {app_p}; clean & run python build/sync_app.py")


def check_repo_parity(app_ver_in: str, site_ver_in: str, app_root: str, site_root: str, *, sync_in_progress: bool) -> tuple[str, str]:
    fl_app = SA.verify_min_sync_shell_parity(app_ver_in, app_root, site_root)
    if sync_in_progress:
        return fl_app, fl_app
    fl_site = SA.verify_min_sync_shell_parity(site_ver_in, app_root, site_root)
    check_bundle_parity(app_root, site_root, sync_in_progress=False)
    return fl_app, fl_site


# 1. Live tree parity & lag check (pre-copy during sync_app.py validates source sw.js only; post-copy validates app/sw.js too)
app_sw = pathlib.Path(SA.APP_SRC_ROOT) / "sw.js"
site_sw = ROOT / "app" / "sw.js"
app_ver = re.search(r"SHELL_CACHE\s*=\s*['\"]isabi-mfg-v([0-9.]+)['\"]", app_sw.read_text(encoding="utf-8")).group(1)
site_ver = re.search(r"SHELL_CACHE\s*=\s*['\"]isabi-mfg-v([0-9.]+)['\"]", site_sw.read_text(encoding="utf-8")).group(1)
sync_in_progress = os.environ.get("ISABI_SYNC_IN_PROGRESS") == "1"
floor_app, floor_site = check_repo_parity(app_ver, site_ver, SA.APP_SRC_ROOT, str(ROOT), sync_in_progress=sync_in_progress)
check("live repo floor parity matches across app & site", floor_app, floor_site)
d1_src = (ROOT / "functions" / "_lib" / "d1_store.js").read_text(encoding="utf-8")
srv_src = (pathlib.Path(SA.APP_SRC_ROOT) / "server.py").read_text(encoding="utf-8")
app_js_src = (pathlib.Path(SA.APP_SRC_ROOT) / "js" / "app.js").read_text(encoding="utf-8")
check("d1_store.js GET /device_unsent includes minSyncShellVer", "minSyncShellVer" in d1_src, True)
check("server.py GET /device_unsent includes minSyncShellVer", "minSyncShellVer" in srv_src, True)
check("js/app.js wires devicesMinSyncShellVer from minSyncShellVer", ("devicesMinSyncShellVer" in app_js_src and "minSyncShellVer" in app_js_src), True)

with tempfile.TemporaryDirectory(prefix="min_shell_parity_") as _tmp_dir:
    _tmp_root = pathlib.Path(_tmp_dir)
    # 2. Exact match & bounded lag succeed
    a_ok, s_ok = make_tree(_tmp_root, "ok", "19.6.425", "19.6.425")
    check("exact match (sw == floor) passes", SA.verify_min_sync_shell_parity("19.6.425", a_ok, s_ok), "19.6.425")
    check("lag of 1 release (sw = floor + 1) passes", SA.verify_min_sync_shell_parity("19.6.426", a_ok, s_ok), "19.6.425")
    check("lag exactly at MAX_MIN_SHELL_LAG passes", SA.verify_min_sync_shell_parity(f"19.6.{425 + SA.MAX_MIN_SHELL_LAG}", a_ok, s_ok), "19.6.425")

    # 3. Pre-sync vs post-sync stale-bundle edge case: source sw.js / bundle matches while pre-copy site lags below floor or differs on js/app.js
    check("pre-sync mode passes when source sw matches floor while pre-copy site sw lags below floor",
          check_repo_parity("19.6.425", "19.6.424", a_ok, s_ok, sync_in_progress=True),
          ("19.6.425", "19.6.425"))
    raises("post-sync mode stops when copied site sw still lags below floor",
           lambda: check_repo_parity("19.6.425", "19.6.424", a_ok, s_ok, sync_in_progress=False))
    for drift_rel in ("js/app.js", "css/app.css", "js/i18n.js", "js/step_up_auth.js", "manifest.json"):
        a_bdrift, s_bdrift = make_tree(_tmp_root, "bdrift_" + drift_rel.replace("/", "_").replace(".", "_"), "19.6.425", "19.6.425")
        (pathlib.Path(s_bdrift) / "app" / drift_rel).write_text("/* stale */\n", encoding="utf-8")
        check(f"pre-sync mode skips unsynced app/{drift_rel} mismatch",
              check_repo_parity("19.6.425", "19.6.425", a_bdrift, s_bdrift, sync_in_progress=True),
              ("19.6.425", "19.6.425"))
        raises(f"post-sync mode stops when app/{drift_rel} differs from isabi-app",
               lambda r_a=a_bdrift, r_s=s_bdrift: check_repo_parity("19.6.425", "19.6.425", r_a, r_s, sync_in_progress=False))

    # 4. Mismatch, excessive lag, floor > sw, major/minor drift, and malformed strings fail
    a_mis, s_mis = make_tree(_tmp_root, "mis", "19.6.425", "19.6.420")
    raises("d1_store.js vs server.py mismatch stops sync", lambda: SA.verify_min_sync_shell_parity("19.6.425", a_mis, s_mis))
    a_fb_ahead, s_fb_ahead = make_tree(_tmp_root, "fb_ahead", "19.6.425", "19.6.425", "19.6.420")
    check("server floor auto-advanced ahead of js/app.js MIN_SYNC_SHELL_FALLBACK passes", SA.verify_min_sync_shell_parity("19.6.430", a_fb_ahead, s_fb_ahead), "19.6.425")
    a_fb_above, s_fb_above = make_tree(_tmp_root, "fb_above", "19.6.425", "19.6.425", "19.6.430")
    raises("js/app.js MIN_SYNC_SHELL_FALLBACK above MIN_SYNC_SHELL_VER stops sync", lambda: SA.verify_min_sync_shell_parity("19.6.430", a_fb_above, s_fb_above))
    a_fb_omit, s_fb_omit = make_tree(_tmp_root, "fb_omit", "19.6.425", "19.6.425", "__OMIT__")
    raises("missing js/app.js MIN_SYNC_SHELL_FALLBACK stops sync", lambda: SA.verify_min_sync_shell_parity("19.6.425", a_fb_omit, s_fb_omit))
    a_fb_bad, s_fb_bad = make_tree(_tmp_root, "fb_bad", "19.6.425", "19.6.425", "19.6.bad")
    raises("malformed js/app.js MIN_SYNC_SHELL_FALLBACK stops sync", lambda: SA.verify_min_sync_shell_parity("19.6.425", a_fb_bad, s_fb_bad))
    raises("lag > MAX_MIN_SHELL_LAG stops sync", lambda: SA.verify_min_sync_shell_parity(f"19.6.{425 + SA.MAX_MIN_SHELL_LAG + 1}", a_ok, s_ok))
    raises("floor > sw stops sync", lambda: SA.verify_min_sync_shell_parity("19.6.424", a_ok, s_ok))
    raises("major/minor drift stops sync", lambda: SA.verify_min_sync_shell_parity("19.7.425", a_ok, s_ok))

    a_bad, s_bad = make_tree(_tmp_root, "bad", "19.6.bad", "19.6.bad")
    raises("malformed MIN_SYNC_SHELL_VER stops sync", lambda: SA.verify_min_sync_shell_parity("19.6.425", a_bad, s_bad))

if FAILED:
    print(f"verify_min_shell_parity: {len(FAILED)} of {COUNT} checks FAILED")
    for item in FAILED:
        print("  FAIL", item)
    sys.exit(1)
print(f"verify_min_shell_parity: {COUNT}/{COUNT} passed (floor={floor_app}, max_lag={SA.MAX_MIN_SHELL_LAG})")
