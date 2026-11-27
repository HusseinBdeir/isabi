"""Data-only release of the Command Center: publish a Manufacturing top-up without shipping the shell.

Use it after `isabi-app/build/topup_from_sharepoint.py` has rebuilt the seeds, whenever the shell must stay as it is:
another session has unfinished UI or Edge-API work in the `isabi-app` or `isabi` working trees, or there is simply no
shell change to ship. `sync_app.py` + `deploy_cloudflare.py` would publish whatever is in the working tree; this script
publishes the committed site plus the new data, and nothing else.

Where the data lives (since v19.6.248): the operational seeds are private objects in R2 (`isabi-vault/seeds/
seed_{core,records,industries}.json`, served to a signed-in seat by `./api/seed/:kind`); the ledger rows are in D1; the
public site carries only `app/js/seed_manifest.js`, which names the seed hashes.

What it guarantees
  * Only committed code is deployed. The site comes from a clean git worktree of HEAD, staged by that commit's own
    `build/stage_pages_bundle.py` (the public allowlist), and the D1 export / deploy helpers are loaded from HEAD too,
    so uncommitted edits in build/, functions/ or app/ never run and never ship.
  * The working tree is never touched. The release commit is built from blobs written straight into the index
    (app/js/seed_manifest.js and app/index.html).
  * Installed devices fetch the new data: the shell loads `js/seed_manifest.js?v=<ver>` cache-first, so the release
    changes that URL to `...&d=<coreHash>` in app/index.html. No shell version bump.
  * The store document, the sign-in sessions and the seats are left alone: their D1 statements are dropped from the
    delta (the Edge API owns them).

Order of a release (THEO runs it; each stage refuses when the one before it has not been done):
  1. isabi-app:  python build/topup_from_sharepoint.py --until <date> --skip-cloud      (all six gates)
  2. isabi-app:  commit the data files and the loader
  3. isabi:      python build/release_data_only.py commit      manifest + index.html into a release commit
  4. isabi-app:  python build/reconcile_cloud_store.py --until <date>                    (cloud store twins)
  5. isabi:      python build/release_data_only.py export      D1 delta, nothing written remotely
  6. isabi:      python build/release_data_only.py upload      apply the delta to remote D1
  7. isabi:      python build/release_data_only.py r2          upload the changed private seeds to R2
  8. isabi:      python build/release_data_only.py pages       deploy the committed site from a clean worktree
  9. git push origin main (both repos), then `status` to compare live with disk,
     then `python build/release_lock.py release`.
`upload`, `r2` and `pages` hold the release lock (build/release_lock.py; taken when free, refused while another
session holds it unless `--wait-lock [SECONDS]` is passed, which polls every 12s up to 540s by default — or run
`wait-lock` first to claim the lock before live writes), and `pages` refuses a HEAD that does not contain origin/main
(rebase the release commit first). `check` is read-only and can be run at any time. `status` prints what is live
against what is on disk.
"""
from __future__ import annotations

import argparse
import ast
import datetime as dt
import hashlib
import inspect
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import types
import urllib.request
from collections import Counter
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ISABI = Path(__file__).resolve().parent.parent
ISABI_APP = ISABI.parent / "isabi-app"
WORKTREES = ISABI.parent / "_wt"
LIVE_MANIFEST_URL = "https://isabisystems.com/app/js/seed_manifest.js"
MANIFEST_RE = re.compile(r"__MFG_SEED_MANIFEST=(\{.*\});")
INDEX_MANIFEST_RE = re.compile(rb"(js/seed_manifest\.js\?v=[0-9][0-9.]*)(?:&amp;d=[0-9a-f]+)?")
STMT_RE = re.compile(r"^\s*(INSERT OR REPLACE INTO|INSERT INTO|DELETE FROM)\s+\"?([A-Za-z0-9_]+)\"?", re.I)
# store document, sign-in sessions, seats and PINs, plus the Edge runtime tables (export_d1_seed.EDGE_RUNTIME_TABLES):
# remote override requests, the override audit trail, geo audit / gate suggestion logs and per-seat saved views
EDGE_OWNED = {"edge_kv_store", "auth_sessions", "users", "override_requests", "saved_views", "override_audit", "geo_audit_log", "geo_gate_suggestions", "push_subscriptions", "user_passkeys", "passkey_challenges"}
NO_RELEASE_LOCK = False  # set from --no-release-lock in main()
DEFAULT_WAIT_LOCK_S = 540
DEFAULT_POLL_LOCK_S = 12
GATE_TIMEOUT_S = 600
GATE_TIMEOUT_ENV = "ISABI_GATE_TIMEOUT_S"
GATE_TIMEOUT_MAX_S = 3600
DEFAULT_SEED_RELEASE_GATES = (
    ("isabi-app", "build/verify_legacy_id_sunset.py", "python"),
    ("isabi-app", "build/verify_near_copy.mjs", "node"),
    ("isabi-app", "build/verify_public_names.py", "python"),
    ("isabi-app", "build/verify_insp_step_and_rates.mjs", "node"),
    ("isabi-app", "build/verify_statement_books.mjs", "node"),
    ("isabi-app", "build/verify_multi_slip_stepper.mjs", "node"),
    ("isabi-app", "build/verify_insp_return_and_compound_nav.mjs", "node"),
)
_mono = time.monotonic
_sleep = time.sleep
_LEGACY_NET_ERR_RE = re.compile(
    r"Could not resolve host|Connection (?:was )?reset|Recv failure|Send failure|Failed to connect|"
    r"Connection timed out|Operation timed out|Connection refused|Network is unreachable|"
    r"remote end hung up|early EOF|Empty reply from server|SSL connection timeout|gnutls_handshake\(\) failed|"
    r"did not finish \(TimeoutExpired\)|The requested URL returned error: 5\d\d|"
    r"schannel: (?:failed to receive handshake|server closed (?:the connection )?abruptly|failed to decrypt data)|"
    r"cannot lock ref '[^']*': is at [0-9a-f]+ but expected [0-9a-f]+",
    re.IGNORECASE,
)


def sha10(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:10]


def git(args: list[str], cwd: Path = ISABI, text: bool = True, input_bytes: bytes | None = None, check: bool = True):
    return subprocess.run(["git", *args], cwd=str(cwd), capture_output=True, text=text if input_bytes is None else False, input=input_bytes, check=check)


def head_blob(path: str) -> bytes:
    return git(["cat-file", "blob", f"HEAD:{path}"], text=False).stdout


def head_sha() -> str:
    return git(["rev-parse", "HEAD"]).stdout.strip()


def parse_manifest(text: str) -> dict:
    m = MANIFEST_RE.search(text)
    if not m:
        raise SystemExit("ABORT: seed_manifest.js has no __MFG_SEED_MANIFEST object")
    return json.loads(m.group(1))


def head_manifest() -> dict:
    return parse_manifest(head_blob("app/js/seed_manifest.js").decode("utf-8"))


def shell_version() -> str:
    m = re.search(r"isabi-mfg-v([0-9][0-9.]*)", head_blob("app/sw.js").decode("utf-8", errors="replace"))
    return m.group(1) if m else "?"


def _load_committed(mod_name: str):
    """Import build/<mod_name>.py as committed at HEAD, with __file__ at its real path so every path it derives still
    points into this checkout. Uncommitted edits in build/ are never executed."""
    src = head_blob(f"build/{mod_name}.py").decode("utf-8")
    mod = types.ModuleType(mod_name)
    mod.__file__ = str(ISABI / "build" / f"{mod_name}.py")
    sys.modules[mod_name] = mod
    exec(compile(src, mod.__file__, "exec"), mod.__dict__)
    return mod


_MODS: dict = {}


def lock_mod():
    """build/release_lock.py as committed at HEAD (like the other helpers: uncommitted edits never run)."""
    if "L" not in _MODS:
        try:
            _MODS["L"] = _load_committed("release_lock")
        except subprocess.CalledProcessError:
            raise SystemExit("ABORT: HEAD has no build/release_lock.py; rebase the release commit onto origin/main") from None
    return _MODS["L"]


def mods():
    if not _MODS.get("D"):
        _MODS["E"] = _load_committed("export_d1_seed")  # first: deploy_cloudflare imports from it
        _MODS["D"] = _load_committed("deploy_cloudflare")
    return _MODS["E"], _MODS["D"]


def live_updated_at() -> str:
    """updatedAt of the live store document, read straight from the Edge (no cache fallback)."""
    E, _ = mods()
    doc = E._fetch_edge_store()
    if not isinstance(doc, dict) or not doc:
        raise SystemExit("ABORT: could not read the live store from the Edge")
    inner = doc.get("docs", {}).get("mfg_web_store") if isinstance(doc.get("docs"), dict) else None
    val = (inner or doc).get("updatedAt") or doc.get("updatedAt") or ""
    if not val:
        raise SystemExit("ABORT: live store has no updatedAt")
    return str(val)


def live_manifest() -> dict:
    req = urllib.request.Request(f"{LIVE_MANIFEST_URL}?t={int(time.time())}", headers={"User-Agent": "ISABI-Release/1.0", "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return parse_manifest(resp.read().decode("utf-8"))


# ----------------------------------------------------------------------------------------------------- stages

def _seed_file(kind: str) -> Path:
    return ISABI_APP / "js" / f"seed_{kind}.json"


def stage_status() -> None:
    E, D = mods()
    hm = head_manifest()
    meta = D.load_edge_meta()
    r2 = meta.get("r2_seed_shas") or {}
    print(f"shell at HEAD        : v{shell_version()}  ({head_sha()[:7]})")
    print(f"isabi HEAD manifest  : core {hm.get('coreHash')} records {hm.get('recordsHash')} industries {hm.get('industriesHash')} generated {hm.get('generated_at')}")
    print("isabi-app seeds      : " + " ".join(f"{k} {sha10(_seed_file(k).read_bytes())}" for k in ("core", "records", "industries") if _seed_file(k).is_file()))
    print("private seeds in R2  : " + " ".join(f"{k} {str(r2.get(k) or '?')[:10]}" for k in ("core", "records", "industries")) + "  (as recorded by the last upload from this PC)")
    try:
        lm = live_manifest()
        print(f"live site manifest   : core {lm.get('coreHash')} records {lm.get('recordsHash')} industries {lm.get('industriesHash')} generated {lm.get('generated_at')}")
    except Exception as exc:
        print(f"live site manifest   : not readable ({exc})")


def _file_sha10(path: Path) -> str:
    return sha10(path.read_bytes()) if path.is_file() else ""


def _suite_stamp_path() -> Path:
    E, _ = mods()
    return E.OUT_DIR / "dataonly_suite_stamp.json"


def gate_timeout_s() -> int:
    raw = (os.environ.get(GATE_TIMEOUT_ENV) or "").strip()
    if not raw.isdigit():
        return GATE_TIMEOUT_S
    return max(GATE_TIMEOUT_S, min(int(raw), GATE_TIMEOUT_MAX_S))


def seed_release_gates() -> tuple[tuple[str, str, str], ...]:
    """Read SEED_RELEASE_GATES from committed HEAD:build/sync_app.py (AST only), falling back to DEFAULT_SEED_RELEASE_GATES."""
    res = git(["cat-file", "blob", "HEAD:build/sync_app.py"], check=False)
    if res.returncode == 0 and res.stdout:
        try:
            tree = ast.parse(res.stdout)
        except SyntaxError:
            tree = None
        if tree is not None:
            for node in tree.body:
                val_node = None
                names: list[str] = []
                if isinstance(node, ast.Assign):
                    names = [t.id for t in node.targets if isinstance(t, ast.Name)]
                    val_node = node.value
                elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
                    names = [node.target.id]
                    val_node = node.value
                if val_node is None or "SEED_RELEASE_GATES" not in names:
                    continue
                try:
                    val = ast.literal_eval(val_node)
                except (ValueError, TypeError, SyntaxError):
                    continue
                if isinstance(val, (list, tuple)) and val:
                    parsed: list[tuple[str, str, str]] = []
                    valid = True
                    for item in val:
                        if not (isinstance(item, (list, tuple)) and len(item) == 3 and all(isinstance(x, str) for x in item)):
                            valid = False
                            break
                        parsed.append((item[0], item[1], item[2]))
                    if valid and parsed:
                        return tuple(parsed)
    return DEFAULT_SEED_RELEASE_GATES


def _expected_suite_stamp(core_h: str, recs_h: str) -> dict:
    return {
        "coreHash": core_h,
        "recordsHash": recs_h,
        "industriesHash": _file_sha10(_seed_file("industries")),
        "dbSha": _file_sha10(ISABI_APP / "data" / "mfg.db"),
        "snapshotSha": _file_sha10(ISABI_APP / "data" / "mfg_snapshot.json"),
        "isabiHead": head_sha(),
        "isabiAppHead": git(["rev-parse", "HEAD"], cwd=ISABI_APP).stdout.strip(),
        "shellVersion": shell_version(),
        "seedGates": [f"{r}:{p}" for r, p, _ in seed_release_gates()],
    }


def _extract_tar_bytes(tar_bytes: bytes, dest: Path, strip_prefix: str = "") -> None:
    if not tar_bytes:
        return
    dest_res = dest.resolve()
    with tarfile.open(fileobj=io.BytesIO(tar_bytes), mode="r:") as tf:
        for member in tf.getmembers():
            if member.issym() or member.islnk():
                raise SystemExit(f"ABORT: link entry not allowed in git archive: {member.name!r}")
            raw_name = member.name or ""
            if "\\" in raw_name or raw_name.startswith("/"):
                raise SystemExit(f"ABORT: unsafe path in git archive: {member.name!r}")
            rel = raw_name
            while rel.startswith("./"):
                rel = rel[2:]
            if strip_prefix:
                if not rel.startswith(strip_prefix):
                    continue
                rel = rel[len(strip_prefix):]
            if not rel or rel == ".":
                continue
            raw_parts = [p for p in rel.split("/") if p]
            if any(p == ".." for p in raw_parts) or os.path.isabs(rel):
                raise SystemExit(f"ABORT: unsafe path in git archive: {member.name!r}")
            norm_rel = os.path.normpath(rel)
            if os.path.isabs(norm_rel) or norm_rel == ".." or norm_rel.startswith(".." + os.sep):
                raise SystemExit(f"ABORT: unsafe path in git archive: {member.name!r}")
            target = (dest_res / norm_rel).resolve()
            if target != dest_res and not target.is_relative_to(dest_res):
                raise SystemExit(f"ABORT: path escapes suite sandbox: {member.name!r}")
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            elif member.isreg():
                target.parent.mkdir(parents=True, exist_ok=True)
                src_f = tf.extractfile(member)
                if src_f is not None:
                    with src_f:
                        target.write_bytes(src_f.read())


def _node_runtime() -> tuple[str, dict] | None:
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


def _run_node_suite(suite_cwd: Path) -> int:
    rt = _node_runtime()
    if rt is None:
        raise SystemExit("ABORT: node runtime not found for build/verify_mfg.mjs (install Node or VS Code, or pass --skip-suite)")
    node_exe, node_env = rt
    r = subprocess.run([node_exe, "build/verify_mfg.mjs"], cwd=str(suite_cwd), env=node_env, check=False)
    return int(r.returncode)


def _run_seed_release_gates(suite_cwd: Path) -> None:
    """Run all seed- and mfg.db-sensitive RELEASE_GATES against the isolated candidate sandbox."""
    for repo, rel, interp in seed_release_gates():
        gate_cwd = suite_cwd if repo == "isabi-app" else ISABI
        script_path = gate_cwd / Path(rel)
        if not script_path.is_file():
            print(f"[data-only] SKIP: seed release gate {repo}/{rel} is not in candidate sandbox")
            continue
        if interp == "python":
            exe, env = sys.executable, dict(os.environ)
        else:
            rt = _node_runtime()
            if rt is None:
                raise SystemExit(f"ABORT: node runtime not found for seed release gate {repo}/{rel}")
            exe, env = rt
        env["ISABI_APP_SRC"] = str(suite_cwd)
        env["PYTHON"] = sys.executable
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        if repo == "isabi-app":
            env.pop("ISABI_ROOT", None)
            env.pop("ISABI_NAMES_REQUIRE_REPO", None)
        else:
            env["ISABI_ROOT"] = str(ISABI)
        try:
            chk = subprocess.run(
                [exe, rel],
                cwd=str(gate_cwd),
                env=env,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=gate_timeout_s(),
                stdin=subprocess.DEVNULL,
                check=False,
            )
        except subprocess.TimeoutExpired:
            raise SystemExit(f"ABORT: seed release gate {repo}/{rel} timed out after {gate_timeout_s()} s") from None
        if chk.returncode != 0:
            if chk.stdout:
                print(chk.stdout[-4000:], file=sys.stderr)
            if chk.stderr:
                print(chk.stderr[-4000:], file=sys.stderr)
            raise SystemExit(f"ABORT: seed release gate {repo}/{rel} failed with exit {chk.returncode}")
        tail = (chk.stdout.strip().splitlines() or ["(no output)"])[-1]
        print(f"[data-only] OK: seed release gate {repo}/{rel}: {tail}", flush=True)


def _build_candidate_manifest_and_index(hm: dict, core: bytes, recs: bytes, core_h: str, recs_h: str) -> tuple[dict, bytes, bytes, str]:
    snap_gen = ""
    try:
        with open(ISABI_APP / "data" / "mfg_snapshot.json", encoding="utf-8") as fh:
            m_gen = re.search(r'"generated_at"\s*:\s*"([^"]+)"', fh.read(400))
        snap_gen = m_gen.group(1) if m_gen else ""
    except OSError:
        pass
    if not snap_gen:
        snap_gen = str(json.loads(core.decode("utf-8")).get("generated_at") or "")
    if not snap_gen:
        raise SystemExit("ABORT: cannot read generated_at of the new seed")
    new_m = dict(hm)  # keeps the committed keys and their order (industries and demo seeds stay as they are live)
    new_m["generated_at"] = snap_gen
    for key, val in (
        ("core", f"./js/seed_core.json?d={core_h}"), ("records", f"./js/seed_records.json?d={recs_h}"),
        ("apiCore", f"./api/seed/core?d={core_h}"), ("apiRecords", f"./api/seed/records?d={recs_h}"),
    ):
        if key in new_m:
            new_m[key] = val
    new_m["coreHash"] = core_h
    new_m["recordsHash"] = recs_h
    old_man = head_blob("app/js/seed_manifest.js")
    eol = b"\r\n" if b"\r\n" in old_man else b"\n"
    first_line = old_man.split(eol)[0]
    new_line = ("(typeof self!=='undefined'?self:window).__MFG_SEED_MANIFEST=" + json.dumps(new_m, ensure_ascii=False, separators=(",", ":")) + ";").encode("utf-8")
    man_bytes = first_line + eol + new_line + eol
    if parse_manifest(man_bytes.decode("utf-8")) != new_m:
        raise SystemExit("ABORT: generated manifest does not parse back")
    old_idx = head_blob("app/index.html")
    hits = INDEX_MANIFEST_RE.findall(old_idx)
    if len(hits) != 1:
        raise SystemExit(f"ABORT: app/index.html references seed_manifest.js {len(hits)} times; expected 1")
    idx_bytes = INDEX_MANIFEST_RE.sub(lambda mo: mo.group(1) + b"&amp;d=" + core_h.encode("ascii"), old_idx)
    return new_m, man_bytes, idx_bytes, snap_gen


def run_desktop_suite_against_new_seed(skip_suite: bool = False) -> None:
    if skip_suite:
        print("[data-only] --skip-suite: skipping desktop regression suite gate.")
        return
    core = _seed_file("core").read_bytes()
    recs = _seed_file("records").read_bytes()
    core_h, recs_h = sha10(core), sha10(recs)
    hm = head_manifest()
    expected = _expected_suite_stamp(core_h, recs_h)
    stamp_path = _suite_stamp_path()
    if stamp_path.is_file():
        try:
            saved = json.loads(stamp_path.read_text(encoding="utf-8"))
        except Exception:
            saved = {}
        if isinstance(saved, dict) and saved.get("passed") is True and all(saved.get(k) == expected[k] for k in expected):
            print(f"[data-only] Desktop suite already passed for candidate seed {core_h}/{recs_h}; reusing stamp.")
            return
    _, man_bytes, idx_bytes, _ = _build_candidate_manifest_and_index(hm, core, recs, core_h, recs_h)
    tmp_dir = Path(tempfile.mkdtemp(prefix="isabi-dataonly-suite-"))
    try:
        app_arc = git(["archive", "--format=tar", "HEAD"], cwd=ISABI_APP, text=False, check=True).stdout
        _extract_tar_bytes(app_arc, tmp_dir)
        site_res = git(["archive", "--format=tar", "HEAD", "--", "app"], cwd=ISABI, text=False, check=False)
        if site_res.returncode == 0 and site_res.stdout:
            _extract_tar_bytes(site_res.stdout, tmp_dir, strip_prefix="app/")
        # isabi/app/js/local_dev_roster.js is intentionally emptied (`[]`) by sync_app.py for public deploys;
        # restore isabi-app's committed/local dev roster inside this disposable sandbox only so offline verify_mfg.mjs login works.
        local_roster = ISABI_APP / "js" / "local_dev_roster.js"
        if local_roster.is_file():
            (tmp_dir / "js").mkdir(parents=True, exist_ok=True)
            shutil.copy2(local_roster, tmp_dir / "js" / "local_dev_roster.js")
        else:
            head_roster = git(["cat-file", "blob", "HEAD:js/local_dev_roster.js"], cwd=ISABI_APP, text=False, check=False)
            if head_roster.returncode == 0 and head_roster.stdout:
                (tmp_dir / "js").mkdir(parents=True, exist_ok=True)
                (tmp_dir / "js" / "local_dev_roster.js").write_bytes(head_roster.stdout)
        (tmp_dir / "data").mkdir(parents=True, exist_ok=True)
        for fn in ("mfg.db", "mfg_snapshot.json", "industry_legacy_id_map.json"):
            src_p = ISABI_APP / "data" / fn
            if src_p.is_file():
                shutil.copy2(src_p, tmp_dir / "data" / fn)
        (tmp_dir / "js").mkdir(parents=True, exist_ok=True)
        for seed_p in (ISABI_APP / "js").glob("seed_*.json"):
            if seed_p.is_file():
                shutil.copy2(seed_p, tmp_dir / "js" / seed_p.name)
        (tmp_dir / "js" / "seed_manifest.js").write_bytes(man_bytes)
        (tmp_dir / "index.html").write_bytes(idx_bytes)
        print(f"[data-only] Running desktop suite (node build/verify_mfg.mjs) against candidate seed {core_h}/{recs_h}...", flush=True)
        rc = _run_node_suite(tmp_dir)
        if rc != 0:
            raise SystemExit(f"ABORT: desktop suite (node build/verify_mfg.mjs) failed with exit {rc} against candidate seed {core_h}/{recs_h}")
        _run_seed_release_gates(tmp_dir)
        stamp_path.parent.mkdir(parents=True, exist_ok=True)
        stamp_payload = {**expected, "passed": True, "ts": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
        stamp_path.write_text(json.dumps(stamp_payload, indent=2), encoding="utf-8")
        print(f"[data-only] Desktop suite passed and stamped for candidate seed {core_h}/{recs_h}.", flush=True)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def require_current_namebook(core_bytes: bytes) -> None:
    """Since v19.6.270 the private seed carries the private name book (`namebook`, from isabi-app
    build/private_namebook.json). A seed packed without it would switch off every rule that reads real names on
    live, so a data release refuses it."""
    book_path = ISABI_APP / "build" / "private_namebook.json"
    if not book_path.exists():
        return
    want = {k: v for k, v in json.loads(book_path.read_text(encoding="utf-8")).items() if not k.startswith("_")}
    have = json.loads(core_bytes.decode("utf-8")).get("namebook")
    if have != want:
        raise SystemExit("ABORT: isabi-app/js/seed_core.json carries " + ("no" if have is None else "an out-of-date")
                         + " `namebook`; repack it with build/pack_seed_split.py (it must match build/private_namebook.json).")


def stage_check(skip_suite: bool = False) -> None:
    require_current_namebook(_seed_file("core").read_bytes())
    E, D = mods()
    env = D.build_env()
    ok, acct = D.ensure_logged_in(env)
    if not ok:
        raise SystemExit(2)
    r = D.run_wrangler(["d1", "execute", "isabi-ledger", "--remote", "--command", "SELECT COUNT(*) AS n FROM sales_tickets", "--json"], env, check=False)
    print("D1 read exit:", r.returncode, (r.stdout or "").strip()[-220:].replace("\n", " "))
    if r.returncode != 0:
        print((r.stderr or "")[-400:])
        raise SystemExit(3)
    print("account id found:", bool(acct), "| live store updatedAt:", live_updated_at())
    stage_status()
    run_desktop_suite_against_new_seed(skip_suite=skip_suite)


def stage_commit(message: str = "", skip_suite: bool = False) -> None:
    """Release commit from blobs: the public manifest with the new seed hashes, and app/index.html pointing at it.
    The seeds themselves are private (R2) and are not in this repository. The working tree is left as it is."""
    if git(["diff", "--cached", "--name-only"]).stdout.strip():
        raise SystemExit("ABORT: the isabi index has staged changes; a data release commits only its own two files")
    core = _seed_file("core").read_bytes()
    recs = _seed_file("records").read_bytes()
    require_current_namebook(core)
    core_h, recs_h = sha10(core), sha10(recs)
    hm = head_manifest()
    if hm.get("coreHash") == core_h and hm.get("recordsHash") == recs_h:
        print(f"Nothing to commit: HEAD already names core {core_h} / records {recs_h}")
        return
    run_desktop_suite_against_new_seed(skip_suite=skip_suite)
    _, man_bytes, idx_bytes, snap_gen = _build_candidate_manifest_and_index(hm, core, recs, core_h, recs_h)
    staged = {}
    for path, data in (("app/js/seed_manifest.js", man_bytes), ("app/index.html", idx_bytes)):
        sha = git(["hash-object", "-w", "--stdin"], input_bytes=data).stdout.decode("ascii").strip()
        git(["update-index", "--add", "--cacheinfo", f"100644,{sha},{path}"])
        staged[path] = sha
    names = set(git(["diff", "--cached", "--name-only"]).stdout.split())
    if not names or not names <= set(staged):
        raise SystemExit(f"ABORT: unexpected staged paths {sorted(names)}")
    msg = message or f"Command Center data top-up to {snap_gen[:10]} (data only, shell stays v{shell_version()})"
    r = git(["commit", "-m", msg], check=False)
    print((r.stdout or "").strip()[-600:])
    if r.returncode != 0:
        print((r.stderr or "").strip()[-600:])
        raise SystemExit("ABORT: commit failed; the two paths are still staged")
    cm = head_manifest()
    if cm.get("coreHash") != core_h or cm.get("recordsHash") != recs_h:
        raise SystemExit("ABORT: committed manifest does not name the seeds on disk")
    print(f"Committed {head_sha()[:7]}: core {core_h} / records {recs_h}; app/index.html loads seed_manifest.js?v={shell_version()}&d={core_h}")


def _stamp_path():
    E, _ = mods()
    return E.OUT_DIR / "dataonly_export_stamp.json"


def batch_counts(files: list[Path]) -> tuple[Counter, Counter]:
    ups, dels = Counter(), Counter()
    for bf in files:
        for ln in bf.read_text(encoding="utf-8").split("\n"):
            m = STMT_RE.match(ln)
            if m:
                (ups if m.group(1).upper().startswith("INSERT") else dels)[m.group(2)] += 1
    return ups, dels


def stage_export() -> None:
    E, _ = mods()
    hm = head_manifest()
    if hm.get("coreHash") != sha10(_seed_file("core").read_bytes()):
        raise SystemExit("ABORT: isabi HEAD does not name the seed that is on disk in isabi-app; run the commit stage first")
    # The sibling-industry seed must be the one that is live: a data-only release never changes it.
    live_ind = _seed_file("industries")
    if hm.get("industriesHash") and sha10(live_ind.read_bytes()) != hm["industriesHash"]:
        raise SystemExit(
            f"ABORT: isabi-app/js/seed_industries.json ({sha10(live_ind.read_bytes())}) is not the live industries seed "
            f"({hm['industriesHash']}); a data-only release cannot carry a sibling-industry change"
        )
    E.OUT_DIR.mkdir(parents=True, exist_ok=True)
    if not E.COMMITTED_MANIFEST_JSON.exists():
        raise SystemExit("ABORT: no committed D1 manifest on this PC; a delta is not possible and a full seed is out of scope here")
    for old in E.OUT_DIR.glob("batch_*.sql"):
        old.unlink()
    upd_before = live_updated_at()
    t0 = time.time()
    files, meta = E.export_all(delta=True)
    if not meta.get("delta_mode"):
        raise SystemExit("ABORT: export fell back to FULL mode; a data-only release must be a delta")
    if not E.LIVE_CACHE_JSON.exists() or E.LIVE_CACHE_JSON.stat().st_mtime < t0 - 1:
        raise SystemExit("ABORT: the export did not read the live store (it used a cached copy)")
    upd_after = live_updated_at()
    if upd_after != upd_before:
        raise SystemExit(f"ABORT: the live store changed during the export ({upd_before} -> {upd_after}); run export again")
    dropped = Counter()
    kept_files = []
    for bf in files:
        with open(bf, encoding="utf-8", newline="") as fh:
            lines = [ln + "\n" for ln in fh.read().split("\n") if ln != ""]  # one statement per line
        keep = []
        for ln in lines:
            m = STMT_RE.match(ln)
            if m and m.group(2) in EDGE_OWNED:
                dropped[m.group(2)] += 1
                continue
            keep.append(ln)
        if any(STMT_RE.match(ln) for ln in keep):
            if len(keep) != len(lines):
                bf.write_text("".join(keep), encoding="utf-8", newline="")
            kept_files.append(bf)
        else:
            bf.unlink()
    print(f"Dropped Edge-owned statements from the delta: {dict(dropped)}")
    for bf in kept_files:
        with open(bf, encoding="utf-8", newline="") as fh:
            bad = [ln[:60] for ln in fh.read().split("\n") if ln.strip() and (not STMT_RE.match(ln) or STMT_RE.match(ln).group(2) in EDGE_OWNED)]
        if bad:
            raise SystemExit(f"ABORT: unexpected or Edge-owned statement in {bf.name}: {bad[:2]}")
    ups, dels = batch_counts(kept_files)
    print("\nPer-table D1 delta (upserts / deletes):")
    for t in sorted(set(ups) | set(dels)):
        print(f"  {t:28} upserts={ups[t]:6}  deletes={dels[t]:6}")
    print(f"  TOTAL upserts={sum(ups.values())} deletes={sum(dels.values())} batches={len(kept_files)}")
    _stamp_path().write_text(
        json.dumps(
            {
                "db_sha256": E.file_sha256(E.DB_PATH),
                "snapshot_sha256": E.file_sha256(E.SNAPSHOT_JSON),
                "industries_sha256": E.file_sha256(live_ind),
                "pending_sha256": E.file_sha256(E.PENDING_MANIFEST_JSON),
                "batches": {f.name: E.file_sha256(f) for f in kept_files},
                "live_updated_at": upd_after,
                "head": head_sha(),
            }
        ),
        encoding="utf-8",
    )
    print("live store updatedAt at export:", upd_after)


def stage_upload() -> None:
    E, D = mods()
    stamp_p = _stamp_path()
    if not stamp_p.exists():
        raise SystemExit("ABORT: run the export stage first")
    stamp = json.loads(stamp_p.read_text(encoding="utf-8"))
    live_ind = _seed_file("industries")
    checks = {
        "mfg.db": (stamp["db_sha256"], E.file_sha256(E.DB_PATH)),
        "mfg_snapshot.json": (stamp["snapshot_sha256"], E.file_sha256(E.SNAPSHOT_JSON)),
        "live industries seed": (stamp["industries_sha256"], E.file_sha256(live_ind)),
        "pending manifest": (stamp["pending_sha256"], E.file_sha256(E.PENDING_MANIFEST_JSON)),
        "isabi HEAD": (stamp.get("head"), head_sha()),
    }
    for label, (want, got) in checks.items():
        if want != got:
            raise SystemExit(f"ABORT: {label} changed since the export stage; run export again")
    batches = sorted(E.OUT_DIR.glob("batch_*.sql"))
    if {b.name: E.file_sha256(b) for b in batches} != stamp["batches"]:
        raise SystemExit("ABORT: batch files on disk differ from the export stage")
    now_upd = live_updated_at()
    if now_upd != stamp["live_updated_at"]:
        raise SystemExit(f"ABORT: the live store changed since the export ({stamp['live_updated_at']} -> {now_upd}); run export again")
    env = D.build_env()
    ok, _acct = D.ensure_logged_in(env)
    if not ok:
        raise SystemExit(2)
    meta = D.load_edge_meta()
    schema_sha = E.file_sha256(E.SCHEMA_SQL)
    if meta.get("last_schema_sha256") != schema_sha:
        print("Applying 0001_schema.sql to remote D1 (idempotent CREATE IF NOT EXISTS)...")
        D.run_wrangler(["d1", "execute", "isabi-ledger", "--remote", f"--file={E.SCHEMA_SQL}", "-y"], env, check=True)
        meta = D.load_edge_meta()
        meta["last_schema_sha256"] = schema_sha
        D.save_edge_meta(meta)
    total = len(batches)
    run_sig = f"DATAONLY:{stamp['pending_sha256']}"
    meta = D.load_edge_meta()
    done = set(meta.get("applied_batch_shas") or []) if meta.get("applied_batch_run_sig") == run_sig else set()
    meta["applied_batch_run_sig"] = run_sig
    meta["applied_batch_shas"] = sorted(done)
    D.save_edge_meta(meta)
    print(f"Uploading {total} DELTA batch(es) to remote D1 isabi-ledger...", flush=True)
    for i, bf in enumerate(batches, 1):
        b_sha = E.file_sha256(bf)
        if b_sha in done:
            print(f"  [{i}/{total}] {bf.name} skipped (already applied)", flush=True)
            continue
        D._upload_one_batch(bf, env)  # raises on the 4th failed attempt
        done.add(b_sha)
        meta = D.load_edge_meta()
        meta["applied_batch_run_sig"] = run_sig
        meta["applied_batch_shas"] = sorted(done)
        D.save_edge_meta(meta)
        if i == 1 or i % 10 == 0 or i == total:
            print(f"  [{i}/{total}] {bf.name} applied", flush=True)
    if E.promote_pending_manifest():
        print(f"Promoted D1 row-hash manifest -> {E.COMMITTED_MANIFEST_JSON.name}")
    meta = D.load_edge_meta()
    meta.pop("applied_batch_shas", None)
    meta.pop("applied_batch_run_sig", None)
    meta["last_seeded_db_sha256"] = stamp["db_sha256"]
    D.save_edge_meta(meta)
    stamp_p.unlink()
    print("D1 delta applied. live store updatedAt now:", live_updated_at())


def stage_r2() -> None:
    """Upload the changed private seeds (core, records) to R2. The hashes must be the ones HEAD's manifest names."""
    _, D = mods()
    hm = head_manifest()
    env = D.build_env()
    ok, _acct = D.ensure_logged_in(env)
    if not ok:
        raise SystemExit(2)
    meta = D.load_edge_meta()
    r2_shas = dict(meta.get("r2_seed_shas") or {})
    for kind, key in (("core", "coreHash"), ("records", "recordsHash")):
        src = _seed_file(kind)
        full = hashlib.sha256(src.read_bytes()).hexdigest()
        if full[:10] != hm.get(key):
            raise SystemExit(f"ABORT: seed_{kind}.json on disk ({full[:10]}) is not the one HEAD's manifest names ({hm.get(key)}); run the commit stage first")
        if r2_shas.get(kind) == full:
            print(f"R2 seeds/seed_{kind}.json already holds {full[:10]} (no upload)")
            continue
        print(f"Uploading seeds/seed_{kind}.json ({src.stat().st_size:,} B, {full[:10]}) to R2 isabi-vault...", flush=True)
        D.run_wrangler(["r2", "object", "put", f"isabi-vault/seeds/seed_{kind}.json", f"--file={src}", "--content-type=application/json", "--remote"], env, check=True)
        r2_shas[kind] = full
        meta = D.load_edge_meta()
        meta["r2_seed_shas"] = r2_shas
        D.save_edge_meta(meta)
    print("Private seeds in R2 match the committed manifest.")


def stage_pages(message: str = "", keep: bool = False) -> None:
    """Deploy the committed site: a clean worktree of HEAD supplies functions/ and wrangler.toml, and that commit's own
    build/stage_pages_bundle.py stages the public allowlist that is uploaded."""
    _, D = mods()
    head = head_sha()
    hm = head_manifest()
    meta = D.load_edge_meta()
    r2 = meta.get("r2_seed_shas") or {}
    for kind, key in (("core", "coreHash"), ("records", "recordsHash")):
        if str(r2.get(kind) or "")[:10] != hm.get(key):
            raise SystemExit(f"ABORT: R2 does not hold the {kind} seed the manifest names ({hm.get(key)}); run the r2 stage first")
    tag = time.strftime("%Y%m%d-%H%M%S")
    wt = WORKTREES / f"isabi-release-{tag}"
    bundle = WORKTREES / f"isabi-release-{tag}-public"
    WORKTREES.mkdir(parents=True, exist_ok=True)
    git(["worktree", "add", "--detach", str(wt), head])
    try:
        st = git(["status", "--porcelain"], cwd=wt).stdout.strip()
        if st:
            raise SystemExit(f"ABORT: the release worktree is not clean:\n{st}")
        stager_src = (wt / "build" / "stage_pages_bundle.py").read_text(encoding="utf-8")
        stager = types.ModuleType("stage_pages_bundle_release")
        stager.__file__ = str(wt / "build" / "stage_pages_bundle.py")  # its ISABI_ROOT resolves to the worktree
        exec(compile(stager_src, stager.__file__, "exec"), stager.__dict__)
        n = stager.stage_pages_bundle(bundle)
        for must_not in ("build", "migrations", "exports", "functions", "wrangler.toml", ".dev.vars", ".git", "app/js/seed_core.json", "app/js/seed_records.json", "app/js/seed_industries.json"):
            if (bundle / must_not).exists():
                raise SystemExit(f"ABORT: {must_not} must not be in the public bundle")
        for must in ("index.html", "_headers", "_routes.json", "app/index.html", "app/sw.js", "app/js/app.js", "app/js/seed_manifest.js"):
            if not (bundle / must).is_file():
                raise SystemExit(f"ABORT: {must} is missing from the public bundle")
        man = parse_manifest((bundle / "app" / "js" / "seed_manifest.js").read_text(encoding="utf-8"))
        if man != hm:
            raise SystemExit("ABORT: the staged manifest is not the committed one")
        if f"seed_manifest.js?v={shell_version()}&amp;d={man['coreHash']}" not in (bundle / "app" / "index.html").read_text(encoding="utf-8"):
            raise SystemExit("ABORT: app/index.html does not point at the new seed manifest")
        print(f"Public bundle: {n} allowlisted files from {head[:7]}")
        env = D.build_env()
        # Under the release lock: a HEAD without origin/main would roll back what another session already shipped.
        D.check_checkout_not_behind_origin(ISABI, allow_behind_origin=False, fetch=True, env=env)
        ok, acct = D.ensure_logged_in(env)
        if not ok:
            raise SystemExit(2)
        if acct and not env.get("CLOUDFLARE_ACCOUNT_ID"):
            env["CLOUDFLARE_ACCOUNT_ID"] = acct
        # Last check before going live: still the lock holder, HEAD contains origin/main, HEAD recorded as live.
        lock_mod().claim_deploy_or_exit(ISABI, head, "data-only pages", bypass=NO_RELEASE_LOCK)
        msg = message or f"Manufacturing top-up to {str(hm.get('generated_at') or '')[:10]} (data only)"
        print(f"Deploying Cloudflare Pages from {bundle} (functions from {wt}) at {head[:7]}...", flush=True)
        r = subprocess.run(
            [D.wrangler_bin(env), "pages", "deploy", str(bundle), "--project-name=isabi-systems", "--branch=main", "--commit-dirty=true", f"--commit-hash={head}", f"--commit-message={msg}"],
            cwd=str(wt),
            env=env,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        print(r.stdout)
        if r.stderr:
            print(r.stderr)
        if r.returncode != 0:
            raise SystemExit(r.returncode)
    finally:
        if not keep:
            shutil.rmtree(bundle, ignore_errors=True)
            git(["worktree", "remove", "--force", str(wt)], check=False)
    try:
        lm = live_manifest()
        print(f"Live manifest now: core {lm.get('coreHash')} records {lm.get('recordsHash')} (committed core {hm.get('coreHash')})")
    except Exception as exc:
        print(f"Live manifest not readable yet ({exc})")


def _require_or_wait_release_lock(*, purpose: str, bypass: bool, wait_s: int, poll_s: int, holder: str = "") -> dict | None:
    L = lock_mod()
    if "wait_s" in inspect.signature(L.require_release_lock).parameters:
        return lock_mod().require_release_lock(
            ISABI, purpose=purpose, bypass=bypass, holder=holder, wait_s=wait_s, poll_s=poll_s,
        )
    if bypass or os.environ.get("ISABI_RELEASE_LOCK", "").strip().lower() in ("off", "0", "no"):
        return lock_mod().require_release_lock(ISABI, purpose=purpose, bypass=bypass)
    if wait_s <= 0:
        return lock_mod().require_release_lock(ISABI, purpose=purpose, bypass=False)

    # Legacy fallback when HEAD's committed release_lock.py does not accept wait_s/poll_s yet.
    deadline = _mono() + max(0.0, float(wait_s))
    eff_poll = max(1.0, float(poll_s))
    shown_wait = ""
    last_log: float | None = None
    while True:
        try:
            sha, info = L.read_remote_lock(ISABI)
        except L.LockError as exc:
            if _LEGACY_NET_ERR_RE.search(str(exc) or "") and _mono() < deadline:
                msg = str(exc).splitlines()[0]
                if msg != shown_wait:
                    print(f"Release lock read hiccup ({msg[:180]}); retrying in {int(eff_poll)}s...", flush=True)
                    shown_wait = msg
                _sleep(min(eff_poll, max(0.0, deadline - _mono())))
                continue
            print(f"ERROR: {exc}", file=sys.stderr, flush=True)
            raise SystemExit(2) from None
        if not (info and L.held_by_me(info, ISABI)) and sha and not L.is_expired(info, L.TAKEOVER_GRACE_MIN):
            rem = deadline - _mono()
            desc = L.describe(info)
            if rem <= 0:
                print(
                    f"ERROR: RELEASE LOCK: {desc}.\nStill held after waiting {int(wait_s)}s; run again with --wait-lock to keep waiting.",
                    file=sys.stderr,
                    flush=True,
                )
                raise SystemExit(2)
            now_m = _mono()
            if desc != shown_wait or last_log is None or now_m - last_log >= 60:
                print(f"Waiting for release lock (polling every {int(eff_poll)}s, {int(rem)}s left): {desc}", flush=True)
                shown_wait, last_log = desc, now_m
            _sleep(min(eff_poll, max(0.0, rem)))
            continue
        try:
            return lock_mod().require_release_lock(ISABI, purpose=purpose, bypass=False)
        except SystemExit:
            if _mono() >= deadline:
                raise
            # A peer may have grabbed the free lock right before require_release_lock pushed, or a transient read hiccup occurred.
            try:
                sha_now, info_now = L.read_remote_lock(ISABI)
            except L.LockError as exc2:
                if _LEGACY_NET_ERR_RE.search(str(exc2) or "") and _mono() < deadline:
                    _sleep(min(eff_poll, max(0.0, deadline - _mono())))
                    continue
                raise
            if sha_now and not L.is_expired(info_now, L.TAKEOVER_GRACE_MIN) and not L.held_by_me(info_now, ISABI):
                _sleep(min(eff_poll, max(0.0, deadline - _mono())))
                continue
            raise


def build_arg_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Publish a Manufacturing data top-up without shipping the shell.", allow_abbrev=False)
    ap.add_argument("stage", choices=["status", "check", "commit", "export", "upload", "r2", "pages", "wait-lock"])
    ap.add_argument("--message", default="", help="Commit / deployment message (default: derived from the seed date)")
    ap.add_argument("--keep", action="store_true", help="pages: keep the release worktree and bundle for inspection")
    ap.add_argument("--no-release-lock", action="store_true", help="upload / r2 / pages without the release lock (owner only)")
    ap.add_argument("--skip-suite", action="store_true", help="check / commit: emergency bypass of the desktop suite gate")
    ap.add_argument(
        "--wait-lock",
        nargs="?",
        const=DEFAULT_WAIT_LOCK_S,
        default=None,
        type=int,
        metavar="SECONDS",
        help=f"upload / r2 / pages / wait-lock: wait up to SECONDS (default {DEFAULT_WAIT_LOCK_S}) polling the release lock",
    )
    ap.add_argument(
        "--poll-lock",
        default=DEFAULT_POLL_LOCK_S,
        type=int,
        metavar="SECONDS",
        help=f"seconds between release-lock polls when waiting (default {DEFAULT_POLL_LOCK_S})",
    )
    ap.add_argument("--holder", default="", help="optional holder name when taking the release lock")
    return ap


def parse_cli_args(argv: list[str] | None = None) -> argparse.Namespace:
    ap = build_arg_parser()
    a = ap.parse_args(argv)
    if a.wait_lock is not None and a.stage not in ("upload", "r2", "pages", "wait-lock"):
        ap.error("--wait-lock is only valid with upload, r2, pages or wait-lock")
    if a.no_release_lock and (a.stage == "wait-lock" or a.wait_lock is not None):
        ap.error("--no-release-lock cannot be combined with wait-lock / --wait-lock")
    eff_wait = (DEFAULT_WAIT_LOCK_S if a.wait_lock is None else a.wait_lock) if a.stage == "wait-lock" else (0 if a.wait_lock is None else a.wait_lock)
    if eff_wait < 0 or eff_wait > 3600:  # noqa: PLR2004
        ap.error("--wait-lock must be 0 to 3600 seconds")
    if a.poll_lock < 1 or a.poll_lock > 300:  # noqa: PLR2004
        ap.error("--poll-lock must be 1 to 300 seconds")
    a.eff_wait_lock = eff_wait
    return a


def main(argv: list[str] | None = None) -> int:
    a = parse_cli_args(argv)
    global NO_RELEASE_LOCK
    NO_RELEASE_LOCK = a.no_release_lock
    if a.stage in ("upload", "r2", "pages"):
        # Live writes (D1, R2, Pages) happen one release at a time: build/release_lock.py.
        _require_or_wait_release_lock(
            purpose=f"data-only release ({a.stage})",
            bypass=a.no_release_lock,
            wait_s=a.eff_wait_lock,
            poll_s=a.poll_lock,
            holder=a.holder,
        )
    elif a.stage == "wait-lock":
        _require_or_wait_release_lock(
            purpose="data-only release",
            bypass=False,
            wait_s=a.eff_wait_lock,
            poll_s=a.poll_lock,
            holder=a.holder,
        )
        return 0
    if a.stage == "status":
        stage_status()
    elif a.stage == "check":
        stage_check(skip_suite=a.skip_suite)
    elif a.stage == "commit":
        stage_commit(a.message, skip_suite=a.skip_suite)
    elif a.stage == "export":
        stage_export()
    elif a.stage == "upload":
        stage_upload()
    elif a.stage == "r2":
        stage_r2()
    else:
        stage_pages(a.message, a.keep)
    return 0


if __name__ == "__main__":
    sys.exit(main())
