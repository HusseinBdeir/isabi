"""sync_app.py — Syncs the ISABI Command Center PWA bundle (from bhfirms/isabi-app) into bhfirms/isabi/app/.
Ensures https://isabisystems.com/app/ serves the exact verified Command Center assets.

Usage:
  python build/sync_app.py [--dry] [--skip-release-gates] [--skip-i18n-audit] [--skip-speed-gate "<reason>"]
"""
import argparse
import hashlib
import json
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
    ("isabi", "build/verify_min_shell_parity.py", "python"),         # d1_store.js == server.py MIN_SYNC_SHELL_VER & rolling-window lag cap
    ("isabi", "build/verify_deploy_cli.py", "python"),              # build/*.py CLI argparse + --dry + stale-checkout gate
    ("isabi", "build/verify_deploy_retry.py", "python"),            # deploy rides out Cloudflare blips; a failed list never creates
    ("isabi", "build/verify_store_kv_guard.py", "python"),          # D1 seed never leaves the live store unparseable (staged swap)
    ("isabi", "build/verify_seed_stale_store.py", "python"),        # D1 seed never deletes / overwrites live rows from a stale store copy
    ("isabi", "build/verify_export_runtime_tables.py", "python"),   # D1 seed never touches Edge runtime tables
    ("isabi-app", "build/verify_min_shell_ver_local.py", "python"),  # server.py minShellVer floor/cap
    ("isabi-app", "build/verify_shell_gate_and_reload.mjs", "node"), # 426 outdated-shell replay, SW pill & 10m idle reload CDP gate
    ("isabi-app", "build/verify_orphan_expense_lines.py", "python"), # top-up reconcile: orphan expense lines
    ("isabi-app", "build/verify_sum_twins.py", "python"),            # top-up reconcile: one app row = several workbook rows
    ("isabi-app", "build/verify_custom_store_headroom.py", "python"), # store headroom 70% gate, 60d stub retirement, sync truncation/resurrection guards
    ("isabi-app", "build/verify_meter_check.py", "python"),          # top-up reconcile: workbook quantity back on re-sized tickets, truck logs fresh from the workbooks
    ("isabi-app", "build/verify_truck_log_reopen.py", "python"),     # top-up: a truck log the workbook leaves open and its loads bear out is not kept ended
    ("isabi-app", "build/verify_close_twins.py", "python"),          # top-up reconcile: one-difference twins (cross-entity Extended side under WTC, stakeholder slips)
    ("isabi-app", "build/verify_cash_table_heal.py", "python"),      # top-up: every External / Conversion row has one app record
    ("isabi", "build/verify_gemini_tier_routing.mjs", "node"),       # semantic tier routing + Gemini 4 hygiene
    ("isabi", "build/verify_seat_ai_mask_edge.mjs", "node"),         # zero canViewHub('books'), 12-seat JS/Python parity, Edge & server.py AI mask
    ("isabi", "build/verify_release_log_sync.mjs", "node"),          # parity gate's release-log status sync keeps hand-written lines
    ("isabi-app", "build/verify_face_or_pin_local.py", "python"),    # server.py sign-in: Face ID or PIN, never both
    ("isabi-app", "build/verify_seat_preview_resume.mjs", "node"),   # a seat preview (Impersonate) is never resumed on reopening; Face ID decides the seat
    ("isabi-app", "build/verify_records_rbac_parity.py", "python"),  # Local server.py vs Edge d1_store.js /api/records RBAC & DDL parity
    ("isabi-app", "build/verify_face_pad_unit.mjs", "node"),        # passive Face ID liveness + PAD + source bypass guards
    ("isabi", "build/verify_passkeys_edge.mjs", "node"),            # WebAuthn FIDO2 Passkeys Edge + server.py parity, replay/clone/RLS guards
    ("isabi-app", "build/verify_workbook_agreement_rules.py", "python"),  # top-up: price agreements + VAT invoices follow the workbook sheets
    ("isabi-app", "build/verify_staff_contract_sync.py", "python"),  # top-up: staff contracts by rule + back-pay notice
    ("isabi-app", "build/verify_source_behind.py", "python"),        # Owner notices: sibling payload + stale-notice clear after a top-up
    ("isabi", "build/verify_staff_rule_keys.mjs", "node"),           # staff rules per company: a rule filed under another company's key is never stored
    ("isabi", "build/verify_version_claims.py", "python"),           # deploy guard: refuse unbumped or peer-claimed shell versions
    ("isabi", "build/verify_same_name_edge.mjs", "node"),            # server-side same-name guard, sync floor, and staff_members.father_name
    ("isabi", "build/verify_hr_phone_edge.mjs", "node"),             # single-use QR phone-scan lifecycle, R2 purge, RLS, and 13 HR columns
    ("isabi", "build/verify_map_controls_edge.mjs", "node"),         # 4-tier map-write controls, >=12-co RLS, deferred LIMIT & 6-vertical parity
    ("isabi-app", "build/verify_i18n_templates.mjs", "node"),        # dynamic EN/AR/FR template & edge-case coverage (negative $, empty date, fallbacks)
    ("isabi", "build/verify_google_maps_edge.mjs", "node"),          # Edge Google Maps tiles/places/routes/elevation & quota counters
    ("isabi-app", "build/verify_gmaps_local.py", "python"),          # Local server.py Maps Routes/quota/elevation & /api/alert_rules RBAC
    ("isabi", "build/verify_jwt_secret_keep.py", "python"),         # a deploy never replaces the live signing secret unless asked
    ("isabi", "build/verify_parity_browser.mjs", "node"),          # headless browser launcher, CI D-Bus/sandbox flags & fallback
    ("isabi-app", "build/verify_changed_entries_notice.mjs", "node"),  # Owner notice: workbook edits to already-loaded entries
    ("isabi-app", "build/verify_near_copy.mjs", "node"),             # warn at Post on a likely second copy (ticket slip, 11% VAT apart)
    ("isabi-app", "build/verify_typo_hygiene_unit.mjs", "node"),     # site/staff typo, sibling near-copy, Data Hygiene skeleton/AI/RLS
    ("isabi", "build/verify_geo_audit_gate_dwell_edge.mjs", "node"), # Geo audit log, gt1.* gate pins & RLS parity
    ("isabi", "build/verify_web_push_unit.mjs", "node"),             # RFC 8291 / VAPID / CAS / sibling digest unit gate
    ("isabi", "build/verify_device_unsent.mjs", "node"),             # device reports of unsent entries: seat-owned rows, Owner-only list
    ("isabi", "build/verify_release_data_only.py", "python"),        # data-only release runs desktop suite against candidate bundle before commit
    ("isabi", "build/verify_speed_gate_wiring.py", "python"),        # the screen speed gate (SPEED_GATE below) runs on every sync
    ("isabi-app", "build/verify_speed_verdict.mjs", "node"),         # the speed gate's fail / warn rules and its "nothing on screen changed" skip
    ("isabi-app", "build/verify_public_names.py", "python"),         # no real person's name in public /app/ or isabi files
    ("isabi-app", "build/verify_browser_slot.mjs", "node"),          # per-PC single-slot mutex for heavy headless browser suites
    ("isabi-app", "build/verify_mobile_popovers.mjs", "node"),       # mobile/tablet/desktop popover bounds, .geo-place-menu & iOS visualViewport fit
    ("isabi", "build/verify_period_close_routes.py", "python"),      # PERIOD_CLOSE_STUDIO_VIEWS & HOLDING_CLOSE_GATE_VIEWS match verify_live_parity.mjs
    ("isabi", "build/verify_r2_seed_parity.py", "python"),           # seed_manifest.js, demo seeds, and R2 seed hash parity guard
    ("isabi", "build/verify_sync_delta_edge.mjs", "node"),         # 64MB unstick /sync gate, shift-backfill prune parity & deltaSyncV1 + RLS
    ("isabi-app", "build/verify_insp_step_and_rates.mjs", "node"),   # #recordInspector Prev/Next stepping + 1-tap Active Price/Rate Agreements share
    ("isabi-app", "build/verify_insp_return_and_compound_nav.mjs", "node"), # Back to 360° Inspector return pill + 6-industry compound Ask ISABI hub filter jumps
    # The leader's PC deploys (owner 2026-11-26); these stood before a deploy only on the GitHub runner (2 s together).
    ("isabi", "build/verify_deploy_preflight.py", "python"),         # Edge entry files parse; 0001_schema.sql can run on every deploy
    ("isabi", "build/verify_kiosk_cloud.mjs", "node"),               # tablet kiosk routes: station keys, pos_sales, <site>__att
    ("isabi", "build/verify_build_ticket.mjs", "node"),              # build-ticket sign-in through the real Edge router
    ("isabi", "build/verify_build_ticket_guard.py", "python"),       # build scripts never issue a ticket in a gate or a dry run
]


GATE_TIMEOUT_S = 600   # a gate that hangs (e.g. OneDrive fetching a cloud-only workbook) stops the sync, not the PC
# A browser gate first queues for this PC's one browser slot (isabi-app build/_browser_slot.mjs), and the limit counts
# that wait: on 2026-11-26 the leader of v19.6.444 lost its sync because verify_shell_gate_and_reload.mjs stood 576 s
# behind another session's speed suite. ISABI_GATE_TIMEOUT_S raises the limit for one run (never below 600 s, at most
# an hour); `release_batch.py lead` sets it, because a release leader never interrupts a suite that is running.
GATE_TIMEOUT_ENV = "ISABI_GATE_TIMEOUT_S"
GATE_TIMEOUT_MAX_S = 3600


def gate_timeout_s() -> int:
    """Seconds one release gate may take: 600, or ISABI_GATE_TIMEOUT_S when that is a larger whole number (capped)."""
    raw = (os.environ.get(GATE_TIMEOUT_ENV) or "").strip()
    if not raw.isdigit():
        return GATE_TIMEOUT_S
    return max(GATE_TIMEOUT_S, min(int(raw), GATE_TIMEOUT_MAX_S))


# The screen speed gate (owner 2026-11-20, after v19.6.384 shipped Sales and Fleet at twice the 150 ms budget and stayed
# live two days): runs after RELEASE_GATES on every sync. --skip-release-gates does not skip it (leaders pass that flag
# after running the other gates by hand); only --skip-speed-gate "<reason>" does, and the reason is printed. The gate
# itself returns at once when nothing on screen changed since origin/main or this exact commit already passed it, and
# judges a slow screen side by side with origin/main, so a busy PC does not fail a release. A full run takes 10 to
# 20 minutes on a loaded PC.
SPEED_GATE = ("isabi-app", "build/verify_speed_budget.mjs", "node")
SPEED_GATE_TIMEOUT_S = 2700


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


def _warning_block(stdout: str) -> list[str]:
    """The speed gate's "Warnings, not failed (N):" block: screens over the budget that did not fail."""
    out: list[str] = []
    grab = False
    for line in (stdout or "").splitlines():
        if line.startswith("Warnings, not failed"):
            grab = True
            out.append(line)
            continue
        if grab:
            if not line.strip():
                break
            out.append(line)
    return out


def _run_gate(repo: str, rel: str, interp: str, timeout_s: int, skip_hint: str, show_warnings: bool = False, extra_env: dict[str, str] | None = None) -> None:
    roots = {"isabi-app": APP_SRC_ROOT, "isabi": ISABI_ROOT}
    script = os.path.join(roots[repo], *rel.split("/"))
    if not os.path.isfile(script):
        print(f"SKIP: release gate {repo}/{rel} is not in this tree")
        return
    env = dict(os.environ)
    if interp == "python":
        exe = sys.executable
    else:
        rt = _node_runtime()
        if rt is None:
            print(f"ERROR: release gate {repo}/{rel} needs Node.js, and none was found (PATH, ~/.local/node, "
                  f"Program Files, VS Code). Install Node 22.5+ or pass {skip_hint} for this run.", file=sys.stderr)
            raise SystemExit(1)
        exe, env = rt
    env["ISABI_ROOT"] = ISABI_ROOT
    env["ISABI_APP_SRC"] = APP_SRC_ROOT
    if extra_env:
        env.update(extra_env)
    if rel == "build/verify_public_names.py":
        env["ISABI_NAMES_REQUIRE_REPO"] = "1"
    try:
        chk = subprocess.run([exe, script], capture_output=True, text=True, encoding="utf-8", errors="replace",
                             cwd=roots[repo], env=env, timeout=timeout_s, stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        print(f"ERROR: release gate {repo}/{rel} did not finish within {timeout_s} s; sync stopped.", file=sys.stderr)
        if interp != "python":
            print(f"  A browser gate first waits for this PC's one browser slot, and that wait counts. Run sync_app.py again,\n"
                  f"  or allow longer for this run: set {GATE_TIMEOUT_ENV}=1800 (release_batch.py lead does).", file=sys.stderr)
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
    if show_warnings:
        for line in _warning_block(chk.stdout):
            print(f"  {line}")


def run_release_gates(*, skip_release_gates: bool = False, sync_in_progress: bool = False) -> None:
    if skip_release_gates or os.environ.get("ISABI_SKIP_RELEASE_GATES") == "1":
        print("WARN: release gates skipped (--skip-release-gates / ISABI_SKIP_RELEASE_GATES=1)")
        return
    gate_extra = {"ISABI_SYNC_IN_PROGRESS": "1"} if sync_in_progress else None
    for repo, rel, interp in RELEASE_GATES:
        _run_gate(repo, rel, interp, gate_timeout_s(), "--skip-release-gates", extra_env=gate_extra)


def run_speed_gate(*, skip_reason: str = "") -> None:
    repo, rel, interp = SPEED_GATE
    if skip_reason:
        print(f"WARN: screen speed gate {repo}/{rel} SKIPPED: {skip_reason}")
        return
    print(f"Screen speed gate {repo}/{rel} (returns at once when nothing on screen changed; a full run takes 10 to 20 min) ...",
          flush=True)
    _run_gate(repo, rel, interp, SPEED_GATE_TIMEOUT_S, '--skip-speed-gate "<reason>"', show_warnings=True)


_SEED_HEX10_RE = re.compile(r"^[0-9a-f]{10}$")
_SEED_MANIFEST_KINDS = (
    ("core", "coreHash", "core", "apiCore", "seed_core.json"),
    ("records", "recordsHash", "records", "apiRecords", "seed_records.json"),
    ("industries", "industriesHash", "industries", "apiIndustries", "seed_industries.json"),
)
_DEMO_SEED_MANIFEST_KINDS = (
    ("core", "demoCoreHash", "demoCore", "seed_demo_core.json"),
    ("records", "demoRecordsHash", "demoRecords", "seed_demo_records.json"),
    ("industries", "demoIndustriesHash", "demoIndustries", "seed_demo_industries.json"),
)


def parse_seed_manifest_text(text: str, label: str = "seed_manifest.js") -> dict:
    marker = "__MFG_SEED_MANIFEST"
    pos = text.find(marker)
    if pos < 0:
        raise SystemExit(f"ERROR: {label} does not contain __MFG_SEED_MANIFEST")
    brace = text.find("{", pos + len(marker))
    if brace < 0:
        raise SystemExit(f"ERROR: {label} has no JSON object after __MFG_SEED_MANIFEST")
    try:
        parsed, _ = json.JSONDecoder().raw_decode(text[brace:])
    except json.JSONDecodeError as ex:
        raise SystemExit(f"ERROR: {label} contains invalid JSON in __MFG_SEED_MANIFEST ({ex})") from ex
    if not isinstance(parsed, dict):
        raise SystemExit(f"ERROR: {label} __MFG_SEED_MANIFEST must decode to a JSON object")
    return parsed


def _file_sha10(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        while True:
            chunk = fh.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()[:10]


def verify_seed_manifest_parity(
    app_src_root: str = APP_SRC_ROOT,
    isabi_root: str = ISABI_ROOT,
    *,
    check_git_origin: bool = True,
) -> dict:
    man_path = os.path.join(app_src_root, "js", "seed_manifest.js")
    if not os.path.isfile(man_path):
        raise SystemExit(f"ERROR: Missing js/seed_manifest.js in {app_src_root}")
    with open(man_path, "r", encoding="utf-8") as fh:
        manifest = parse_seed_manifest_text(fh.read(), man_path)

    js_dir = os.path.join(app_src_root, "js")
    for kind, hkey, url_key, api_key, fname in _SEED_MANIFEST_KINDS:
        h = str(manifest.get(hkey) or "")
        if not _SEED_HEX10_RE.fullmatch(h):
            raise SystemExit(f"ERROR: {man_path} invalid {hkey}={h!r} (expected 10-char lowercase hex)")
        for uk in (url_key, api_key):
            uval = str(manifest.get(uk) or "")
            if not uval.endswith(f"?d={h}"):
                raise SystemExit(f"ERROR: {man_path} {uk}={uval!r} must end with ?d={h} matching {hkey}")
        private_seed = os.path.join(js_dir, fname)
        if os.path.isfile(private_seed):
            got = _file_sha10(private_seed)
            if got != h:
                raise SystemExit(
                    f"ERROR: Local private seed {private_seed} ({got}) != {hkey} ({h}) in {man_path}; "
                    "run pack_seed_split.py / rebuild seeds before syncing."
                )

    for _dkind, dhkey, durl_key, dfname in _DEMO_SEED_MANIFEST_KINDS:
        dh = str(manifest.get(dhkey) or "")
        if not _SEED_HEX10_RE.fullmatch(dh):
            raise SystemExit(f"ERROR: {man_path} invalid {dhkey}={dh!r} (expected 10-char lowercase hex)")
        duval = str(manifest.get(durl_key) or "")
        if not duval.endswith(f"?d={dh}"):
            raise SystemExit(f"ERROR: {man_path} {durl_key}={duval!r} must end with ?d={dh} matching {dhkey}")
        demo_seed = os.path.join(js_dir, dfname)
        if not os.path.isfile(demo_seed):
            raise SystemExit(f"ERROR: Missing demo seed {demo_seed} referenced by {dhkey}={dh}")
        got_d = _file_sha10(demo_seed)
        if got_d != dh:
            raise SystemExit(
                f"ERROR: Demo seed {demo_seed} ({got_d}) != {dhkey} ({dh}) in {man_path}; rebuild demo seeds before syncing."
            )

    idx_path = os.path.join(app_src_root, "index.html")
    if os.path.isfile(idx_path):
        with open(idx_path, "r", encoding="utf-8") as fh:
            idx_txt = fh.read()
        core_h = str(manifest["coreHash"])
        for m_d in re.findall(r"js/seed_manifest\.js\?v=[0-9][0-9.]*(?:&amp;|&)d=([0-9a-fA-F]+)", idx_txt):
            if m_d != core_h:
                raise SystemExit(
                    f"ERROR: {idx_path} embeds seed_manifest.js?v=...&d={m_d} which disagrees with coreHash={core_h}"
                )

    if check_git_origin:
        chk = subprocess.run(
            ["git", "cat-file", "blob", "refs/remotes/origin/main:app/js/seed_manifest.js"],
            cwd=isabi_root,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
            timeout=15,
        )
        if chk.returncode == 0 and chk.stdout:
            try:
                orig_man = parse_seed_manifest_text(chk.stdout, "origin/main:app/js/seed_manifest.js")
            except SystemExit:
                orig_man = {}
            changed = [
                f"{kind} ({orig_man.get(hkey, '?')} -> {manifest[hkey]})"
                for kind, hkey, _, _, _ in _SEED_MANIFEST_KINDS
                if orig_man.get(hkey) != manifest[hkey]
            ]
            if changed:
                print(
                    "NOTICE: Private seed hash(es) changed vs origin/main "
                    f"({', '.join(changed)}); upload updated seeds to R2 "
                    "(deploy_cloudflare.py or release_data_only.py r2) before --pages-only or git push deploy."
                )

    return manifest


MAX_MIN_SHELL_LAG = 15
_PLAIN_SHELL_VER_RE = re.compile(r"^\d{1,4}(?:\.\d{1,6}){0,3}$")


def verify_min_sync_shell_parity(
    sw_ver: str,
    app_src_root: str = APP_SRC_ROOT,
    isabi_root: str = ISABI_ROOT,
    *,
    max_lag: int = MAX_MIN_SHELL_LAG,
) -> str:
    """Assert d1_store.js and server.py define the exact same MIN_SYNC_SHELL_VER and stay within max_lag of sw_ver."""
    if not _PLAIN_SHELL_VER_RE.fullmatch(str(sw_ver or "").strip()):
        raise SystemExit(f"ERROR: Invalid sw.js shell version {sw_ver!r} for MIN_SYNC_SHELL_VER parity check")
    d1_path = os.path.join(isabi_root, "functions", "_lib", "d1_store.js")
    srv_path = os.path.join(app_src_root, "server.py")
    if not os.path.isfile(d1_path):
        raise SystemExit(f"ERROR: Missing {d1_path} for MIN_SYNC_SHELL_VER parity check")
    if not os.path.isfile(srv_path):
        raise SystemExit(f"ERROR: Missing {srv_path} for MIN_SYNC_SHELL_VER parity check")
    with open(d1_path, "r", encoding="utf-8") as fh:
        m_d1 = re.search(r"export\s+const\s+MIN_SYNC_SHELL_VER\s*=\s*['\"]([^'\"]+)['\"]", fh.read())
    with open(srv_path, "r", encoding="utf-8") as fh:
        m_srv = re.search(r"^MIN_SYNC_SHELL_VER\s*=\s*['\"]([^'\"]+)['\"]", fh.read(), re.M)
    if not m_d1:
        raise SystemExit(f"ERROR: Could not parse MIN_SYNC_SHELL_VER in {d1_path}")
    if not m_srv:
        raise SystemExit(f"ERROR: Could not parse MIN_SYNC_SHELL_VER in {srv_path}")
    d1_ver = m_d1.group(1).strip()
    srv_ver = m_srv.group(1).strip()
    for lbl, val in (("d1_store.js", d1_ver), ("server.py", srv_ver)):
        if not _PLAIN_SHELL_VER_RE.fullmatch(val):
            raise SystemExit(f"ERROR: Invalid MIN_SYNC_SHELL_VER={val!r} in {lbl}")
    if d1_ver != srv_ver:
        raise SystemExit(
            f"ERROR: MIN_SYNC_SHELL_VER parity mismatch: d1_store.js={d1_ver} vs server.py={srv_ver}"
        )
    sw_parts = [int(x) for x in sw_ver.strip().split(".")]
    fl_parts = [int(x) for x in d1_ver.split(".")]
    if len(sw_parts) < 3 or len(fl_parts) < 3:
        raise SystemExit(
            f"ERROR: Expected 3-part dotted versions for MIN_SYNC_SHELL_VER ({d1_ver}) and sw.js ({sw_ver})"
        )
    if tuple(fl_parts[:-1]) != tuple(sw_parts[:-1]):
        raise SystemExit(
            f"ERROR: MIN_SYNC_SHELL_VER={d1_ver} major/minor branch differs from sw.js={sw_ver}"
        )
    sw_patch, fl_patch = sw_parts[-1], fl_parts[-1]
    if fl_patch > sw_patch:
        raise SystemExit(
            f"ERROR: MIN_SYNC_SHELL_VER={d1_ver} exceeds sw.js={sw_ver}"
        )
    lag = sw_patch - fl_patch
    if lag > max_lag:
        raise SystemExit(
            f"ERROR: MIN_SYNC_SHELL_VER={d1_ver} lags {lag} releases behind sw.js={sw_ver} (max {max_lag}); advance MIN_SYNC_SHELL_VER"
        )
    return d1_ver


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

    verify_min_sync_shell_parity(ver)
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


def sync_command_app(*, skip_release_gates: bool = False, skip_i18n_audit: bool = False, skip_speed_gate: str = "") -> int:
    if not os.path.isdir(APP_SRC_ROOT):
        print(f"WARN: {APP_SRC_ROOT} not found, skipping app/ sync.")
        return 0

    ver = verify_shell_version_parity()
    print(f"OK: Shell version parity verified (v{ver} across sw.js, index.html, manifest.json)")
    man = verify_seed_manifest_parity(APP_SRC_ROOT, ISABI_ROOT, check_git_origin=True)
    print(f"OK: Seed manifest parity verified (core={man['coreHash']} records={man['recordsHash']} industries={man['industriesHash']})")

    audit_script = os.path.join(APP_SRC_ROOT, "build", "audit_i18n.py")
    if os.path.isfile(audit_script) and not skip_i18n_audit and os.environ.get("ISABI_SKIP_I18N_AUDIT") != "1":
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

    run_release_gates(skip_release_gates=skip_release_gates, sync_in_progress=True)
    run_speed_gate(skip_reason=skip_speed_gate)

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

    if not skip_release_gates and os.environ.get("ISABI_SKIP_RELEASE_GATES") != "1":
        _run_gate("isabi", "build/verify_deployed_shell.py", "python", gate_timeout_s(), "--skip-release-gates", extra_env={"ISABI_SYNC_IN_PROGRESS": "0"})
        _run_gate("isabi", "build/verify_min_shell_parity.py", "python", gate_timeout_s(), "--skip-release-gates", extra_env={"ISABI_SYNC_IN_PROGRESS": "0"})

    print(f"OK: Synced {copied} Command Center files from {APP_SRC_ROOT} -> {APP_OUT}")
    return copied


def _speed_skip_reason(text: str) -> str:
    reason = (text or "").strip()
    if not reason:
        raise argparse.ArgumentTypeError('a reason is required, e.g. --skip-speed-gate "passed by hand at 14:05 on this batch"')
    return reason


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="build/sync_app.py",
        description="Sync the ISABI Command Center PWA bundle from isabi-app into isabi/app/.",
        allow_abbrev=False,
    )
    parser.add_argument(
        "--dry",
        "--dry-run",
        dest="dry",
        action="store_true",
        help="Print the sync plan and verify shell version parity without running gates or writing files.",
    )
    parser.add_argument(
        "--skip-release-gates",
        action="store_true",
        help="Skip offline RELEASE_GATES before syncing (not the screen speed gate: see --skip-speed-gate).",
    )
    parser.add_argument(
        "--skip-speed-gate",
        metavar="REASON",
        default=None,              # not "": argparse runs a string default through type=, which refuses a blank
        type=_speed_skip_reason,
        help="Skip the screen speed gate (isabi-app build/verify_speed_budget.mjs); the reason is required and printed.",
    )
    parser.add_argument(
        "--skip-i18n-audit",
        action="store_true",
        help="Skip isabi-app/build/audit_i18n.py before syncing.",
    )
    return parser


def parse_cli_args(argv: list[str] | None = None) -> argparse.Namespace:
    return build_arg_parser().parse_args(argv)


def _count_syncable_files(src_root: str) -> int:
    total = 0
    for fname in TOP_FILES:
        if os.path.isfile(os.path.join(src_root, fname)):
            total += 1
    for dname in SUB_DIRS:
        src_dir = os.path.join(src_root, dname)
        if not os.path.isdir(src_dir):
            continue
        for root, _, files in os.walk(src_dir):
            rel = os.path.relpath(root, src_dir)
            for fname in files:
                if dname == "js" and rel == "." and fname in EXCLUDED_JS_FILES:
                    continue
                total += 1
    return total


def print_dry_run_plan(args: argparse.Namespace) -> int:
    print("DRY RUN — 0 local writes or subprocesses")
    print(f"  Source   : {APP_SRC_ROOT}")
    print(f"  Target   : {APP_OUT}")
    if not os.path.isdir(APP_SRC_ROOT):
        print("  Status   : source directory not found (sync would warn and skip)")
        return 0

    ver = verify_shell_version_parity()
    seed_line = "Seed manifest -> missing js/seed_manifest.js"
    if os.path.isfile(os.path.join(APP_SRC_ROOT, "js", "seed_manifest.js")):
        man = verify_seed_manifest_parity(APP_SRC_ROOT, ISABI_ROOT, check_git_origin=False)
        seed_line = f"core={man['coreHash']} records={man['recordsHash']} industries={man['industriesHash']} (demo parity OK)"
    file_count = _count_syncable_files(APP_SRC_ROOT)
    want_ds = render_deployed_shell_js(ver)
    try:
        with open(DEPLOYED_SHELL_JS, "r", encoding="utf-8") as f:
            ds_matches = f.read() == want_ds
    except FileNotFoundError:
        ds_matches = False

    skip_i18n = args.skip_i18n_audit or os.environ.get("ISABI_SKIP_I18N_AUDIT") == "1"
    skip_gates = args.skip_release_gates or os.environ.get("ISABI_SKIP_RELEASE_GATES") == "1"
    audit_script = os.path.join(APP_SRC_ROOT, "build", "audit_i18n.py")
    if skip_i18n:
        i18n_step = "Command Center i18n audit -> SKIP (--skip-i18n-audit / ISABI_SKIP_I18N_AUDIT=1)"
    elif not os.path.isfile(audit_script):
        i18n_step = f"Command Center i18n audit -> SKIP ({audit_script} not found)"
    else:
        i18n_step = f"Command Center i18n audit -> RUN {audit_script}"

    gates_step = (
        "Offline release gates -> SKIP (--skip-release-gates / ISABI_SKIP_RELEASE_GATES=1)"
        if skip_gates
        else f"Offline release gates -> RUN {len(RELEASE_GATES)} RELEASE_GATES checks"
    )
    ds_status = "unchanged" if ds_matches else f"UPDATE to v{ver}"
    speed_step = (
        f"Screen speed gate -> SKIP ({args.skip_speed_gate})"
        if args.skip_speed_gate
        else f"Screen speed gate -> RUN {SPEED_GATE[0]}/{SPEED_GATE[1]} (side by side with origin/main; not skipped by --skip-release-gates)"
    )

    print(f"  Shell    : v{ver} (sw.js, index.html, manifest.json ?v= parity OK)")
    print(f"  Seeds    : {seed_line}")
    print("  Steps    :")
    print(f"    1. {i18n_step}")
    print(f"    2. {gates_step}")
    print(f"    3. {speed_step}")
    print(
        f"    4. Copy {file_count} public files to {APP_OUT}, stamp deployed_shell.js ({ds_status}), "
        "write empty local_dev_roster.js stub, remove retired seeds, and verify zero @bhfirms.com leaks"
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    args = parse_cli_args(argv)
    if args.dry:
        sys.exit(print_dry_run_plan(args))
    sync_command_app(
        skip_release_gates=args.skip_release_gates,
        skip_i18n_audit=args.skip_i18n_audit,
        skip_speed_gate=args.skip_speed_gate or "",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
