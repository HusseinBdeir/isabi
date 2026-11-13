"""deploy_cloudflare.py — One-Command Turnkey Option A Provisioner & Deployer for ISABI Systems.
Provisions Cloudflare Pages project (`isabi-systems`), D1 SQLite (`isabi-ledger`),
R2 bucket (`isabi-vault`), encrypted Edge Secrets (`GEMINI_API_KEY`, `ISABI_JWT_SECRET`),
uploads schema + SHA-256 delta ledger batches (`0` D1 row writes on routine UI deploys),
deploys Pages + Functions, attaches custom domains (`isabisystems.com`, `www.isabisystems.com`),
configures Cloudflare DNS CNAMEs, and prints the exact 2 Cloudflare nameservers for Namecheap.

Usage:
  python build/deploy_cloudflare.py [--dry] [--skip-seed | --seed | --delta | --full-seed]
                                    [--force-schema] [--force-r2-seeds] [--rotate-secrets]
                                    [--skip-live-parity] [--no-sync-release-log] [--skip-indexnow]
                                    [--allow-behind-origin] [--allow-dirty] [--login]
  python build/deploy_cloudflare.py --pages-only [--dry] [--skip-live-parity] [--no-sync-release-log]
                                    [--skip-indexnow] [--allow-behind-origin] [--allow-dirty] [--login]
  python build/deploy_cloudflare.py --configure-domain [--ping-indexnow] [--dry]
  python build/deploy_cloudflare.py --ping-indexnow [--dry]
  python build/deploy_cloudflare.py --check-seat-pins [--login] [--dry]
  python build/deploy_cloudflare.py --parity-only [--no-sync-release-log] [--dry]
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import os
import pathlib
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

BUILD_DIR = pathlib.Path(__file__).resolve().parent
if str(BUILD_DIR) not in sys.path:
    sys.path.insert(0, str(BUILD_DIR))

from export_d1_seed import COMMITTED_MANIFEST_JSON, DB_PATH, KV_CHUNK_CHARS, _chunk_str_for_kv, file_sha256, promote_pending_manifest, sql_lit
from stage_pages_bundle import ROOT_ALLOWLIST, stage_pages_bundle

ISABI_ROOT = BUILD_DIR.parent
WRANGLER_TOML = ISABI_ROOT / "wrangler.toml"
SCHEMA_SQL = ISABI_ROOT / "migrations" / "0001_schema.sql"
BATCH_DIR = ISABI_ROOT / "exports" / "d1_batches"
SECRET_STATE_FILE = ISABI_ROOT / "exports" / "cloudflare_edge_meta.json"
DEPLOY_GUARD_PATHS: tuple[str, ...] = tuple(
    dict.fromkeys(("app", "functions", "migrations", "wrangler.toml", "_redirects", *ROOT_ALLOWLIST))
)


def load_edge_meta() -> dict:
    if SECRET_STATE_FILE.exists():
        try:
            data = json.loads(SECRET_STATE_FILE.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
        except Exception:
            pass
    return {}


def save_edge_meta(meta: dict) -> None:
    SECRET_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    SECRET_STATE_FILE.write_text(json.dumps(meta, indent=2), encoding="utf-8")


def build_env() -> dict:
    env = os.environ.copy()
    env.pop("ELECTRON_RUN_AS_NODE", None)
    extra_dirs = (
        r"C:\Users\hbdei\.local\node",
        r"C:\Users\hbdei\.local\python312",
        r"C:\Users\hbdei\MinGit\cmd",
    )
    existing = [d for d in extra_dirs if os.path.isdir(d)]
    if existing:
        cur_path = env.get("PATH", "")
        prefix = os.pathsep.join(existing)
        env["PATH"] = f"{prefix}{os.pathsep}{cur_path}" if cur_path else prefix
    return env


def wrangler_bin(env: dict) -> str:
    return shutil.which("wrangler", path=env.get("PATH")) or r"C:\Users\hbdei\.local\node\wrangler.cmd"


def read_gemini_key() -> str:
    k = os.environ.get("GEMINI_API_KEY") or os.environ.get("ISABI_GEMINI_KEY") or ""
    if not k and sys.platform == "win32":
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Environment") as rk:
                k = str(winreg.QueryValueEx(rk, "GEMINI_API_KEY")[0] or "").strip()
        except Exception:
            k = ""
    return k


def load_or_create_jwt_secret() -> str:
    meta = load_edge_meta()
    if not meta.get("jwt_secret"):
        meta["jwt_secret"] = secrets.token_urlsafe(48)
        save_edge_meta(meta)
    return str(meta["jwt_secret"])


def run_wrangler(args: list[str], env: dict, input_text: str | None = None, check: bool = True):
    cmd = [wrangler_bin(env)] + args
    return subprocess.run(
        cmd,
        cwd=str(ISABI_ROOT),
        env=env,
        input=input_text,
        stdin=None if input_text is not None else subprocess.DEVNULL,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=check,
    )


def ensure_logged_in(env: dict, *, login: bool = False) -> tuple[bool, str]:
    r = run_wrangler(["whoami"], env, check=False)
    if r.returncode != 0:
        time.sleep(2)
        r = run_wrangler(["whoami"], env, check=False)
    out = (r.stdout or "") + "\n" + (r.stderr or "")
    if r.returncode == 0 and ("Account ID" in out or "logged in" in out.lower() or "@" in out):
        print("Cloudflare auth verified:")
        acct_id = ""
        for ln in out.splitlines():
            if any(k in ln for k in ("logged in", "Account", "@")):
                print("  " + ln.strip())
            m = re.search(r"\b([0-9a-f]{32})\b", ln, re.I)
            if m and not acct_id:
                acct_id = m.group(1)
        return True, acct_id

    if login or sys.stdin.isatty():
        print("Opening browser for one-time Cloudflare OAuth authorization (`wrangler login`)...")
        subprocess.run([wrangler_bin(env), "login"], cwd=str(ISABI_ROOT), env=env, check=True)
        r2 = run_wrangler(["whoami"], env, check=False)
        out2 = (r2.stdout or "") + "\n" + (r2.stderr or "")
        acct_id = ""
        for ln in out2.splitlines():
            m = re.search(r"\b([0-9a-f]{32})\b", ln, re.I)
            if m and not acct_id:
                acct_id = m.group(1)
        if r2.returncode == 0:
            return True, acct_id

    print("NOT AUTHENTICATED TO CLOUDFLARE YET.")
    print("Run `python build/deploy_cloudflare.py --login` in an interactive terminal.")
    return False, ""


def read_wrangler_oauth_token() -> str:
    tok = os.environ.get("CLOUDFLARE_API_TOKEN") or ""
    if tok:
        return tok
    candidates = [
        pathlib.Path(os.environ.get("APPDATA", "")) / "xdg.config" / ".wrangler" / "config" / "default.toml",
        pathlib.Path.home() / ".wrangler" / "config" / "default.toml",
        pathlib.Path.home() / ".config" / ".wrangler" / "config" / "default.toml",
    ]
    existing = [c for c in candidates if c.exists()]
    existing.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    for cfg in existing:
        txt = cfg.read_text(encoding="utf-8", errors="ignore")
        m = re.search(r'oauth_token\s*=\s*"([^"]+)"', txt)
        if m:
            return m.group(1).strip()
    return ""


def cf_api(method: str, path: str, token: str, payload: dict | None = None) -> dict:
    url = f"https://api.cloudflare.com/client/v4{path}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode("utf-8"))
        except Exception:
            return {"success": False, "status": e.code}
    except Exception as ex:
        return {"success": False, "error": str(ex)}


def ensure_d1_database(env: dict) -> str:
    r_list = run_wrangler(["d1", "list", "--json"], env, check=False)
    if r_list.returncode == 0 and r_list.stdout.strip():
        try:
            dbs = json.loads(r_list.stdout)
            for d in dbs:
                if d.get("name") == "isabi-ledger" and d.get("uuid"):
                    return str(d["uuid"])
        except Exception:
            pass

    print("Creating Cloudflare D1 database `isabi-ledger`...")
    r_create = run_wrangler(["d1", "create", "isabi-ledger"], env, check=True)
    m = re.search(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", r_create.stdout + "\n" + r_create.stderr, re.I)
    if not m:
        raise RuntimeError(f"Could not parse D1 UUID from output:\n{r_create.stdout}\n{r_create.stderr}")
    return m.group(1)


def ensure_r2_bucket(env: dict) -> bool:
    r_list = run_wrangler(["r2", "bucket", "list"], env, check=False)
    combined = (r_list.stdout or "") + "\n" + (r_list.stderr or "")
    if r_list.returncode == 0 and "isabi-vault" in combined:
        print("R2 bucket `isabi-vault` verified.")
        return True
    r_create = run_wrangler(["r2", "bucket", "create", "isabi-vault"], env, check=False)
    if r_create.returncode == 0:
        print("Created R2 bucket `isabi-vault`.")
        return True
    print("INFO: R2 not yet enabled on Cloudflare account (using automatic D1 blob fallback until R2 is toggled on).")
    return False


def stamp_wrangler_toml(d1_uuid: str, r2_enabled: bool):
    toml_txt = f'''name = "isabi-systems"
pages_build_output_dir = "."
compatibility_date = "2026-10-01"

[[d1_databases]]
binding = "DB"
database_name = "isabi-ledger"
database_id = "{d1_uuid}"
migrations_dir = "migrations"
'''
    if r2_enabled:
        toml_txt += '''
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "isabi-vault"
'''
    else:
        toml_txt += '''
# Uncomment when R2 is enabled on the Cloudflare account:
# [[r2_buckets]]
# binding = "BUCKET"
# bucket_name = "isabi-vault"
'''
    WRANGLER_TOML.write_text(toml_txt, encoding="utf-8", newline="\n")
    print(f"Updated wrangler.toml (D1 database_id={d1_uuid}, R2={'active' if r2_enabled else 'd1-fallback'})")


def ensure_pages_project(env: dict):
    r_list = run_wrangler(["pages", "project", "list"], env, check=False)
    if "isabi-systems" in ((r_list.stdout or "") + (r_list.stderr or "")):
        print("Cloudflare Pages project `isabi-systems` verified.")
        return
    print("Creating Cloudflare Pages project `isabi-systems`...")
    run_wrangler(["pages", "project", "create", "isabi-systems", "--production-branch=main"], env, check=True)


def upload_secrets(env: dict, *, rotate_secrets: bool = False):
    jwt_sec = load_or_create_jwt_secret()
    gem_key = read_gemini_key()
    meta = load_edge_meta()
    vt_hash = str(os.environ.get("VT_GPS_API_HASH") or meta.get("vt_gps_api_hash") or "").strip()
    vt_email = str(os.environ.get("VT_GPS_EMAIL") or meta.get("vt_gps_email") or "").strip()
    vt_pass = str(os.environ.get("VT_GPS_PASSWORD") or meta.get("vt_gps_password") or "").strip()
    sec_sha = hashlib.sha256(f"{jwt_sec}|{gem_key}|{vt_hash}|{vt_email}|{vt_pass}".encode("utf-8")).hexdigest()
    if not rotate_secrets and meta.get("last_secrets_sha256") == sec_sha:
        print("Edge secrets unchanged; skipping redundant secret upload.")
        return

    print("Uploading encrypted ISABI_JWT_SECRET to Cloudflare Pages...")
    r_jwt = run_wrangler(["pages", "secret", "put", "ISABI_JWT_SECRET", "--project-name=isabi-systems"], env, input_text=jwt_sec, check=True)
    ok_sec = r_jwt.returncode == 0

    if gem_key:
        print("Uploading encrypted GEMINI_API_KEY to Cloudflare Pages...")
        r_gem = run_wrangler(["pages", "secret", "put", "GEMINI_API_KEY", "--project-name=isabi-systems"], env, input_text=gem_key, check=False)
        ok_sec = ok_sec and (r_gem.returncode == 0)

    if vt_hash:
        print("Uploading encrypted VT_GPS_API_HASH to Cloudflare Pages...")
        r_vth = run_wrangler(["pages", "secret", "put", "VT_GPS_API_HASH", "--project-name=isabi-systems"], env, input_text=vt_hash, check=False)
        ok_sec = ok_sec and (r_vth.returncode == 0)
    if vt_email:
        print("Uploading encrypted VT_GPS_EMAIL to Cloudflare Pages...")
        r_vte = run_wrangler(["pages", "secret", "put", "VT_GPS_EMAIL", "--project-name=isabi-systems"], env, input_text=vt_email, check=False)
        ok_sec = ok_sec and (r_vte.returncode == 0)
    if vt_pass:
        print("Uploading encrypted VT_GPS_PASSWORD to Cloudflare Pages...")
        r_vtp = run_wrangler(["pages", "secret", "put", "VT_GPS_PASSWORD", "--project-name=isabi-systems"], env, input_text=vt_pass, check=False)
        ok_sec = ok_sec and (r_vtp.returncode == 0)

    if ok_sec:
        meta = load_edge_meta()
        meta["last_secrets_sha256"] = sec_sha
        save_edge_meta(meta)


def _upload_one_batch(bf: pathlib.Path, env: dict) -> str:
    for attempt in range(1, 5):
        r = run_wrangler(["d1", "execute", "isabi-ledger", "--remote", f"--file={bf}", "-y"], env, check=(attempt == 4))
        if r.returncode == 0:
            return bf.name
        time.sleep(2 * attempt)
    return bf.name


def seed_remote_d1(
    env: dict,
    *,
    force_schema: bool = False,
    skip_seed: bool = False,
    full_seed: bool = False,
    require_delta: bool = False,
):
    schema_sha = file_sha256(SCHEMA_SQL)
    db_sha = file_sha256(DB_PATH)
    meta = load_edge_meta()

    if force_schema or meta.get("last_schema_sha256") != schema_sha:
        print("Applying 0001_schema.sql to remote D1 `isabi-ledger`...")
        run_wrangler(["d1", "execute", "isabi-ledger", "--remote", f"--file={SCHEMA_SQL}", "-y"], env, check=True)
        meta = load_edge_meta()
        meta["last_schema_sha256"] = schema_sha
        save_edge_meta(meta)
    else:
        print(f"Schema 0001_schema.sql unchanged ({schema_sha[:12]}); skipping remote DDL.")

    if skip_seed:
        print("Skipping D1 data seed (--skip-seed passed; 0 D1 row writes).")
        return

    if require_delta and not COMMITTED_MANIFEST_JSON.exists():
        raise SystemExit(
            f"ERROR: --delta requested, but `{COMMITTED_MANIFEST_JSON}` is missing (refusing to fall back to a full seed)."
        )

    use_delta = (not full_seed) and COMMITTED_MANIFEST_JSON.exists()
    exp_cmd = [sys.executable, str(ISABI_ROOT / "build" / "export_d1_seed.py")]
    if use_delta:
        exp_cmd.append("--delta")
    subprocess.run(exp_cmd, cwd=str(ISABI_ROOT), env=env, check=True)

    batches = sorted(BATCH_DIR.glob("batch_*.sql"))
    total = len(batches)
    if total == 0:
        print("Delta seed found 0 changed D1 statements across SQLite + Snapshot + Spine + Cloud (0 remote writes).")
    else:
        mode_lbl = "DELTA" if use_delta else "FULL"
        pending_sha = file_sha256(BATCH_DIR / "pending_manifest.json")
        run_sig = f"{mode_lbl}:{pending_sha}"
        meta = load_edge_meta()
        done_shas = set(meta.get("applied_batch_shas") or []) if meta.get("applied_batch_run_sig") == run_sig else set()
        meta["applied_batch_run_sig"] = run_sig
        print(f"Uploading {total} {mode_lbl} SQL batch(es) sequentially to remote D1 `isabi-ledger` (zero import-lock contention)...")
        for done, bf in enumerate(batches, 1):
            b_sha = file_sha256(bf)
            if b_sha and b_sha in done_shas:
                if done == 1 or done % 20 == 0 or done == total:
                    print(f"  [{done}/{total}] {bf.name} skipped (already checkpointed)")
                continue
            name = _upload_one_batch(bf, env)
            if b_sha:
                done_shas.add(b_sha)
                meta["applied_batch_shas"] = sorted(done_shas)
                save_edge_meta(meta)
            if done == 1 or done % 15 == 0 or done == total:
                print(f"  [{done}/{total}] {name} applied")

    # Promote manifest ONLY after 100% of remote D1 batches succeed
    if promote_pending_manifest():
        print(f"Promoted D1 row-hash manifest -> {COMMITTED_MANIFEST_JSON.name}")
    meta = load_edge_meta()
    meta.pop("applied_batch_shas", None)
    meta.pop("applied_batch_run_sig", None)
    meta["last_seeded_db_sha256"] = db_sha
    save_edge_meta(meta)


def upload_r2_private_seeds(env: dict, r2_enabled: bool, *, force_r2_seeds: bool = False):
    if not r2_enabled:
        print("WARN: R2 bucket `isabi-vault` unavailable; skipping private seed upload.")
        return
    app_js_dir = ISABI_ROOT.parent / "isabi-app" / "js"
    if not app_js_dir.is_dir():
        print(f"WARN: `{app_js_dir}` not present on this machine; skipping R2 private seed upload.")
        return
    meta = load_edge_meta()
    r2_shas = dict(meta.get("r2_seed_shas") or {})
    force_upload = force_r2_seeds
    for kind in ("core", "records", "industries"):
        src = app_js_dir / f"seed_{kind}.json"
        if not src.is_file():
            print(f"WARN: Missing private seed file `{src}`; skipping.")
            continue
        sha = file_sha256(src)
        if not force_upload and r2_shas.get(kind) == sha:
            print(f"R2 private seed `seeds/seed_{kind}.json` unchanged (0 uploads).")
            continue
        print(f"Uploading private operational seed `seeds/seed_{kind}.json` ({src.stat().st_size:,} B) to R2 `isabi-vault`...")
        run_wrangler(
            [
                "r2",
                "object",
                "put",
                f"isabi-vault/seeds/seed_{kind}.json",
                f"--file={src}",
                "--content-type=application/json",
                "--remote",
            ],
            env,
            check=True,
        )
        r2_shas[kind] = sha
        meta["r2_seed_shas"] = r2_shas
        save_edge_meta(meta)


def _b64url_nopad(raw_bytes: bytes) -> str:
    import base64 as _b64
    return _b64.urlsafe_b64encode(raw_bytes).rstrip(b"=").decode("ascii")


def _hash_random_pbkdf2(raw_pin: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", raw_pin.encode("utf-8"), salt, 100_000, dklen=32)
    return f"pbkdf2$sha256$100000${_b64url_nopad(salt)}${_b64url_nopad(dk)}"


def _upgrade_hex_pbkdf2_if_needed(pin_val: str) -> str:
    if not pin_val.startswith("pbkdf2$sha256$"):
        return pin_val
    parts = pin_val.split("$")
    if len(parts) == 5 and len(parts[3]) == 32 and len(parts[4]) == 64:
        try:
            salt_b = bytes.fromhex(parts[3])
            dk_b = bytes.fromhex(parts[4])
            return f"pbkdf2$sha256${parts[2]}${_b64url_nopad(salt_b)}${_b64url_nopad(dk_b)}"
        except ValueError:
            return pin_val
    return pin_val


def migrate_remote_d1_pins_to_pbkdf2(env: dict):
    """Idempotently upgrades any plaintext or legacy-hex D1 `users.pin_code` to canonical Base64URL PBKDF2-SHA256 (100k) and strips `pin_code` from JSON blobs."""
    r = run_wrangler(
        ["d1", "execute", "isabi-ledger", "--remote", "--json", "--command=SELECT id, email, pin_code, payload_json FROM users"],
        env,
        check=False,
    )
    if r.returncode != 0:
        print("WARN: Could not inspect remote D1 `users` for PBKDF2 migration.")
        return
    try:
        rows = json.loads(r.stdout)[0].get("results") or []
    except Exception:
        rows = []

    user_updates: list[str] = []
    for row in rows:
        uid = str(row.get("id") or "")
        if not uid:
            continue
        raw_pin = str(row.get("pin_code") or "").strip()
        new_pin = raw_pin
        if raw_pin:
            if not raw_pin.startswith("pbkdf2$sha256$"):
                new_pin = _hash_random_pbkdf2(raw_pin)
            else:
                new_pin = _upgrade_hex_pbkdf2_if_needed(raw_pin)
        pj_str = str(row.get("payload_json") or "")
        new_pj = pj_str
        if pj_str:
            try:
                pj_obj = json.loads(pj_str)
            except Exception:
                pj_obj = None
            if isinstance(pj_obj, dict):
                mutated = False
                if "pin_code" in pj_obj:
                    pj_obj.pop("pin_code", None)
                    mutated = True
                if "_verifiedPin" in pj_obj:
                    pj_obj.pop("_verifiedPin", None)
                    mutated = True
                if new_pin and pj_obj.get("pin_redacted") is not True:
                    pj_obj["pin_redacted"] = True
                    mutated = True
                if mutated:
                    new_pj = json.dumps(pj_obj, ensure_ascii=False)
        if new_pin != raw_pin or new_pj != pj_str:
            user_updates.append(
                f"UPDATE users SET pin_code = {sql_lit(new_pin)}, payload_json = {sql_lit(new_pj)} WHERE id = {sql_lit(uid)};\n"
            )

    if user_updates:
        with tempfile.TemporaryDirectory(prefix="isabi-d1-pins-") as td:
            sql_fp = pathlib.Path(td) / "migrate_pins.sql"
            sql_fp.write_bytes("".join(user_updates).encode("utf-8"))
            run_wrangler(["d1", "execute", "isabi-ledger", "--remote", f"--file={sql_fp}"], env, check=True)
        print(f"Migrated {len(user_updates)} remote D1 `users` row(s) to PBKDF2-SHA256 & redacted payload_json.")
    else:
        print("Remote D1 `users` PBKDF2 PIN check: all seats already hashed & payload_json redacted (0 writes).")

    # Also scrub any legacy `pin_code` inside `edge_kv_store` `mfg_web_store` chunks
    kv_res = run_wrangler(
        [
            "d1",
            "execute",
            "isabi-ledger",
            "--remote",
            "--json",
            "--command=SELECT doc_key, payload_json, updated_at, updated_by, rev FROM edge_kv_store WHERE doc_key = 'mfg_web_store' OR doc_key LIKE 'mfg_web_store__part_%' ORDER BY doc_key",
        ],
        env,
        check=False,
    )
    if kv_res.returncode != 0:
        return
    try:
        kv_rows = json.loads(kv_res.stdout)[0].get("results") or []
    except Exception:
        kv_rows = []
    if not kv_rows:
        return
    raw_kv = "".join(str(x.get("payload_json") or "") for x in kv_rows)
    try:
        kv_doc = json.loads(raw_kv)
    except Exception as exc:
        print(f"WARNING: remote `mfg_web_store` does not parse ({exc}); PIN scrub skipped. The live store needs repair (see ISABICommandReference.md, grep `store chunk repair`).")
        kv_doc = None
    if not isinstance(kv_doc, dict) or not isinstance(kv_doc.get("users"), list):
        return
    kv_dirty = False
    cleaned_users = []
    for u in kv_doc["users"]:
        if not isinstance(u, dict):
            cleaned_users.append(u)
            continue
        uc = dict(u)
        if "pin_code" in uc or "_verifiedPin" in uc or "face_samples" in uc or "face_thumbs" in uc or uc.get("pin_redacted") is not True:
            uc.pop("pin_code", None)
            uc.pop("_verifiedPin", None)
            uc.pop("face_samples", None)
            uc.pop("face_thumbs", None)
            uc["pin_redacted"] = True
            uc["face_redacted"] = True
            kv_dirty = True
        cleaned_users.append(uc)
    if not kv_dirty:
        print("Remote D1 `edge_kv_store` PIN scrub check: already clean (0 writes).")
        return
    kv_doc["users"] = cleaned_users
    clean_str = json.dumps(kv_doc, ensure_ascii=False)
    chunks = _chunk_str_for_kv(clean_str, KV_CHUNK_CHARS, 64_000)
    upd_at = str(kv_rows[0].get("updated_at") or "")
    upd_by = str(kv_rows[0].get("updated_by") or "security_scrub")
    rev = int(kv_rows[0].get("rev") or 1)
    # 2026-11-13 incident: this used to run one `wrangler d1 execute` per chunk (40+ calls, about 2 minutes) while
    # browsers kept syncing. A browser write landed half-way, the rest of the chunks then overwrote its tail and the
    # live store no longer parsed. Now: ONE file, ONE call, and every statement only applies while the head row still
    # carries the `updated_at` read above (our own writes keep that value). Tail first, head last. If anyone wrote in
    # between, every statement is a no-op and the scrub simply runs again at the next deploy.
    guard = f"(SELECT updated_at FROM edge_kv_store WHERE doc_key = 'mfg_web_store') = {sql_lit(upd_at)}"

    def _guarded_upsert(key: str, payload: str) -> str:
        return (
            "INSERT OR REPLACE INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) "
            f"SELECT {sql_lit(key)}, {sql_lit(payload)}, {sql_lit(upd_at)}, {sql_lit(upd_by)}, {rev} WHERE {guard};\n"
        )

    expected_keys = {"mfg_web_store"}
    kv_stmts: list[str] = []
    for idx, ch in enumerate(chunks[1:], start=1):
        pk = f"mfg_web_store__part_{idx:04d}"
        expected_keys.add(pk)
        kv_stmts.append(_guarded_upsert(pk, ch))
    for old_r in kv_rows:
        ok_key = str(old_r.get("doc_key") or "")
        if ok_key and ok_key not in expected_keys:
            kv_stmts.append(f"DELETE FROM edge_kv_store WHERE doc_key = {sql_lit(ok_key)} AND {guard};\n")
    kv_stmts.append(_guarded_upsert("mfg_web_store", chunks[0]))
    with tempfile.TemporaryDirectory(prefix="isabi-d1-kv-") as td:
        fp = pathlib.Path(td) / "kv_scrub.sql"
        fp.write_bytes("".join(kv_stmts).encode("utf-8"))
        run_wrangler(["d1", "execute", "isabi-ledger", "--remote", f"--file={fp}"], env, check=True)
    # Read back: the parts must join into valid JSON whether or not the guard let the scrub through.
    chk = run_wrangler(
        ["d1", "execute", "isabi-ledger", "--remote", "--json",
         "--command=SELECT doc_key, payload_json FROM edge_kv_store WHERE doc_key = 'mfg_web_store' OR doc_key LIKE 'mfg_web_store__part_%' ORDER BY doc_key"],
        env,
        check=False,
    )
    try:
        chk_rows = json.loads(chk.stdout)[0].get("results") or []
        json.loads("".join(str(x.get("payload_json") or "") for x in chk_rows))
    except Exception as exc:
        raise SystemExit(f"ERROR: remote `mfg_web_store` does not parse after the PIN scrub ({exc}); stop and repair before deploying.")
    print(f"Scrubbed legacy PIN / face fields from remote D1 `edge_kv_store` in one guarded batch ({len(chunks)} chunk(s); no-op if a browser wrote meanwhile).")


def deploy_pages(env: dict):
    print("Staging allowlisted public bundle + deploying Edge Functions to Cloudflare Pages (`isabi-systems`)...")
    with tempfile.TemporaryDirectory(prefix="isabi-pages-bundle-") as tmp_dir:
        staged_count = stage_pages_bundle(pathlib.Path(tmp_dir))
        print(f"  Staged {staged_count} public files (zero internal build/SQL/seed artifacts).")
        r = run_wrangler(
            ["pages", "deploy", str(tmp_dir), "--project-name=isabi-systems", "--branch=main", "--commit-dirty=true"],
            env,
            check=True,
        )
        print(r.stdout)
        if r.stderr:
            print(r.stderr)


def cleanup_preview_deployments_and_purge_cache(acct_id: str):
    token = read_wrangler_oauth_token()
    if not token or not acct_id:
        return
    proj_res = cf_api("GET", f"/accounts/{acct_id}/pages/projects/isabi-systems", token)
    keep_ids: set[str] = set()
    if proj_res.get("success") and isinstance(proj_res.get("result"), dict):
        res_obj = proj_res["result"]
        cd_id = str((res_obj.get("canonical_deployment") or {}).get("id") or "")
        ld_id = str((res_obj.get("latest_deployment") or {}).get("id") or "")
        if cd_id:
            keep_ids.add(cd_id)
        if ld_id:
            keep_ids.add(ld_id)
    if keep_ids:
        deleted = 0
        for _ in range(4):
            deps_res = cf_api("GET", f"/accounts/{acct_id}/pages/projects/isabi-systems/deployments?per_page=25", token)
            deps = (deps_res.get("result") or []) if deps_res.get("success") else []
            to_del = [str(d.get("id") or "") for d in deps if str(d.get("id") or "") and str(d.get("id") or "") not in keep_ids]
            if not to_del:
                break
            progressed = False
            failed_ids: list[str] = []
            for dep_id in to_del:
                del_res = cf_api("DELETE", f"/accounts/{acct_id}/pages/projects/isabi-systems/deployments/{dep_id}?force=true", token)
                if del_res.get("success"):
                    deleted += 1
                    progressed = True
                else:
                    failed_ids.append(dep_id)
            if failed_ids and not progressed:
                print(f"WARN: {len(failed_ids)} non-canonical Pages deployment(s) could not be deleted: {', '.join(failed_ids[:5])}")
            if not progressed:
                break
        if deleted:
            print(f"Removed {deleted} historical non-canonical Pages deployment snapshot(s).")

    z_list = cf_api("GET", "/zones?name=isabisystems.com", token)
    zone = (z_list.get("result") or [None])[0] if z_list.get("success") else None
    if zone and zone.get("id"):
        purge = cf_api("POST", f"/zones/{zone['id']}/purge_cache", token, {"purge_everything": True})
        if purge.get("success"):
            print("Purged Cloudflare Edge CDN cache for `isabisystems.com`.")


INDEXNOW_KEY = "c4b9e2a7d18f406395e1a82c7d3f6b90"


def disable_email_obfuscation(token: str, zid: str) -> None:
    """Best-effort disable Cloudflare Email Address Obfuscation on the zone (HTML also uses <!--email_off-->)."""
    if not token or not zid:
        return
    res = cf_api("PATCH", f"/zones/{zid}/settings/email_obfuscation", token, {"value": "off"})
    if res.get("success"):
        print("Disabled Cloudflare Zone Email Address Obfuscation (`email_obfuscation=off`).")
    else:
        print("INFO: Zone `email_obfuscation` API skipped (OAuth scope read-only; HTML `<!--email_off-->` guards active).")


def ping_indexnow() -> bool:
    """Notifies IndexNow (Bing, Yandex, Naver, Seznam, Yep) of updated canonical Showcase URLs."""
    payload = {
        "host": "isabisystems.com",
        "key": INDEXNOW_KEY,
        "keyLocation": f"https://isabisystems.com/{INDEXNOW_KEY}.txt",
        "urlList": [
            "https://isabisystems.com/",
        ],
    }
    req = urllib.request.Request(
        "https://api.indexnow.org/indexnow",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": "ISABI-Deploy-IndexNow/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            code = getattr(resp, "status", 200)
            print(f"IndexNow ping accepted (HTTP {code}) for https://isabisystems.com/")
            return code in (200, 202)
    except urllib.error.HTTPError as e:
        if e.code in (200, 202):
            print(f"IndexNow ping accepted (HTTP {e.code}) for https://isabisystems.com/")
            return True
        print(f"WARN: IndexNow ping returned HTTP {e.code} (non-fatal).")
        return False
    except Exception as ex:
        print(f"WARN: IndexNow ping skipped due to network error (non-fatal): {ex}")
        return False


def ensure_email_routing(token: str, acct_id: str, zid: str):
    """Idempotently ensures Cloudflare Email Routing destination `hbdeir16@gmail.com` and rule `husseinbdeir@isabisystems.com` -> `hbdeir16@gmail.com`."""
    if not token or not acct_id or not zid:
        return
    dest_email = "hbdeir16@gmail.com"
    custom_email = "husseinbdeir@isabisystems.com"

    # 1. Ensure verified destination address exists on the Cloudflare account
    addrs_res = cf_api("GET", f"/accounts/{acct_id}/email/routing/addresses?per_page=50", token)
    addrs = (addrs_res.get("result") or []) if addrs_res.get("success") else []
    dest_obj = next((a for a in addrs if str(a.get("email") or "").strip().lower() == dest_email), None)
    if not dest_obj:
        c_res = cf_api("POST", f"/accounts/{acct_id}/email/routing/addresses", token, {"email": dest_email})
        if c_res.get("success"):
            dest_obj = c_res.get("result") or {}
            print(f"Created Cloudflare Email Routing destination `{dest_email}` (verification email sent if not yet verified).")

    # 2. Ensure Email Routing MX/SPF DNS is enabled when unconfigured and no conflicting MX blocks it
    er_res = cf_api("GET", f"/zones/{zid}/email/routing", token)
    er_info = (er_res.get("result") or {}) if er_res.get("success") else {}
    if not er_info.get("enabled"):
        en_res = cf_api("POST", f"/zones/{zid}/email/routing/dns", token, {"name": "isabisystems.com"})
        if not en_res.get("success"):
            en_res = cf_api("POST", f"/zones/{zid}/email/routing/enable", token, {})
        if en_res.get("success"):
            print("Enabled Cloudflare Email Routing MX/SPF/DKIM DNS for `isabisystems.com`.")
        else:
            print(
                "NOTE: Cloudflare Email Routing rule is active; complete 1-click MX cutover in Cloudflare Dashboard "
                "(isabisystems.com -> Email -> Email Routing -> Enable Email Routing)."
            )

    # 3. Upsert active forwarding rule `husseinbdeir@isabisystems.com` -> `hbdeir16@gmail.com`
    rules_res = cf_api("GET", f"/zones/{zid}/email/routing/rules?per_page=50", token)
    rules = (rules_res.get("result") or []) if rules_res.get("success") else []
    rule_payload = {
        "name": "Isabi Systems Principal Inbox (husseinbdeir@isabisystems.com)",
        "enabled": True,
        "matchers": [{"type": "literal", "field": "to", "value": custom_email}],
        "actions": [{"type": "forward", "value": [dest_email]}],
    }
    existing_rule = None
    for rl in rules:
        for m in rl.get("matchers") or []:
            if m.get("type") == "literal" and m.get("field") == "to" and str(m.get("value") or "").strip().lower() == custom_email:
                existing_rule = rl
                break
        if existing_rule:
            break
    if existing_rule and existing_rule.get("id"):
        acts = existing_rule.get("actions") or []
        already_ok = (
            bool(existing_rule.get("enabled"))
            and any(a.get("type") == "forward" and dest_email in [str(x).lower() for x in (a.get("value") or [])] for a in acts)
        )
        if not already_ok:
            u_res = cf_api("PUT", f"/zones/{zid}/email/routing/rules/{existing_rule['id']}", token, rule_payload)
            if u_res.get("success"):
                print(f"Updated Cloudflare Email Routing rule `{custom_email}` -> `{dest_email}`.")
        else:
            print(f"Cloudflare Email Routing verified: `{custom_email}` -> `{dest_email}` (legal entity: Isabi Systems, Beirut, Lebanon).")
    else:
        p_res = cf_api("POST", f"/zones/{zid}/email/routing/rules", token, rule_payload)
        if p_res.get("success"):
            print(f"Provisioned Cloudflare Email Routing rule `{custom_email}` -> `{dest_email}`.")


def configure_domain_and_dns(acct_id: str, allow_zone_create: bool = True, purge_cache: bool = False):
    token = read_wrangler_oauth_token()
    if not token:
        return
    if not acct_id:
        accts = cf_api("GET", "/accounts?per_page=5", token)
        if accts.get("success") and accts.get("result"):
            acct_id = accts["result"][0].get("id") or ""
    if not acct_id:
        return

    # 1. Ensure `isabisystems.com` Zone exists in Cloudflare
    z_list = cf_api("GET", "/zones?name=isabisystems.com", token)
    zone = (z_list.get("result") or [None])[0] if z_list.get("success") else None
    if not zone and allow_zone_create:
        z_create = cf_api("POST", "/zones", token, {"name": "isabisystems.com", "account": {"id": acct_id}, "type": "full"})
        if z_create.get("success"):
            zone = z_create.get("result")

    # 2. Attach `isabisystems.com` and `www.isabisystems.com` to Pages project `isabi-systems`
    for dom in ("isabisystems.com", "www.isabisystems.com"):
        cf_api("POST", f"/accounts/{acct_id}/pages/projects/isabi-systems/domains", token, {"name": dom})

    # 3. Ensure proxied CNAME records `@ -> isabi-systems.pages.dev` and `www -> isabi-systems.pages.dev` (auto-healing any typo)
    if zone and zone.get("id"):
        zid = zone["id"]
        recs = cf_api("GET", f"/zones/{zid}/dns_records?per_page=100", token).get("result") or []
        by_name = {str(r.get("name") or "").lower(): r for r in recs}
        for rec_name in ("isabisystems.com", "www.isabisystems.com"):
            ex = by_name.get(rec_name)
            if not ex:
                cf_api(
                    "POST",
                    f"/zones/{zid}/dns_records",
                    token,
                    {"type": "CNAME", "name": rec_name, "content": "isabi-systems.pages.dev", "proxied": True, "ttl": 1},
                )
            elif ex.get("type") == "CNAME" and (
                str(ex.get("content") or "").strip().lower() != "isabi-systems.pages.dev" or not ex.get("proxied")
            ):
                cf_api(
                    "PATCH",
                    f"/zones/{zid}/dns_records/{ex['id']}",
                    token,
                    {"type": "CNAME", "name": rec_name, "content": "isabi-systems.pages.dev", "proxied": True, "ttl": 1},
                )
                print(f"Healed DNS CNAME `{rec_name}` -> isabi-systems.pages.dev (Proxied)")

        # 4. Ensure Cloudflare Edge 301 Redirect: `www.isabisystems.com/*` -> `https://isabisystems.com/*` (GET/HEAD non-/isabi paths; POST/PUT, /isabi*, /api*, /sw.js, and /reset* pass to Pages _middleware.js in 1 hop)
        www_redirect_expr = (
            'http.host eq "www.isabisystems.com" '
            'and (http.request.method in {"GET" "HEAD"}) '
            'and not starts_with(lower(http.request.uri.path), "/isabi") '
            'and not starts_with(lower(http.request.uri.path), "/api/") '
            'and not starts_with(lower(http.request.uri.path), "/app/api/") '
            'and not (lower(http.request.uri.path) in {"/api" "/app/api" "/sw.js" "/app/sw.js" "/reset" "/reset.html" "/app/reset" "/app/reset.html"})'
        )
        rs_get = cf_api("GET", f"/zones/{zid}/rulesets/phases/http_request_dynamic_redirect/entrypoint", token)
        redirect_configured = False
        if rs_get.get("success"):
            existing_rules = (rs_get.get("result") or {}).get("rules") or []
            has_exact_www_rule = any(str(rl.get("expression") or "").strip() == www_redirect_expr for rl in existing_rules)
            if has_exact_www_rule:
                redirect_configured = True
            else:
                clean_rules = [
                    {
                        "expression": rl["expression"],
                        "description": rl.get("description", ""),
                        "action": rl["action"],
                        "action_parameters": rl.get("action_parameters", {}),
                        "enabled": rl.get("enabled", True),
                    }
                    for rl in existing_rules
                    if rl.get("expression") and rl.get("action") and "www.isabisystems.com" not in str(rl.get("expression") or "")
                ]
                clean_rules.append({
                    "expression": www_redirect_expr,
                    "description": "Canonical apex redirect www.isabisystems.com to isabisystems.com",
                    "action": "redirect",
                    "action_parameters": {
                        "from_value": {
                            "status_code": 301,
                            "target_url": {
                                "expression": 'concat("https://isabisystems.com", http.request.uri.path)'
                            },
                            "preserve_query_string": True,
                        }
                    },
                    "enabled": True,
                })
                rs_put = cf_api(
                    "PUT",
                    f"/zones/{zid}/rulesets/phases/http_request_dynamic_redirect/entrypoint",
                    token,
                    {"rules": clean_rules},
                )
                if rs_put.get("success"):
                    redirect_configured = True
                    print("Configured Cloudflare Edge 301 redirect rule: www.isabisystems.com -> https://isabisystems.com")

        routes_res = cf_api("GET", f"/zones/{zid}/workers/routes", token)
        existing_routes = (routes_res.get("result") or []) if routes_res.get("success") else []
        if redirect_configured:
            for rt in existing_routes:
                if str(rt.get("pattern") or "") == "www.isabisystems.com/*" and rt.get("script") == "isabi-www-redirect" and rt.get("id"):
                    cf_api("DELETE", f"/zones/{zid}/workers/routes/{rt['id']}", token)
        else:
            has_worker_route = any(
                str(rt.get("pattern") or "") == "www.isabisystems.com/*" and rt.get("script") == "isabi-www-redirect"
                for rt in existing_routes
            )
            worker_js = (
                "addEventListener('fetch', event => {\n"
                "  const u = new URL(event.request.url);\n"
                "  const p = u.pathname.toLowerCase();\n"
                "  if (p === '/isabi' || p.startsWith('/isabi/') || p === '/api' || p.startsWith('/api/') || p === '/app/api' || p.startsWith('/app/api/') || p === '/sw.js' || p === '/app/sw.js' || p === '/reset' || p === '/reset.html' || p === '/app/reset' || p === '/app/reset.html') {\n"
                "    return;\n"
                "  }\n"
                "  u.hostname = 'isabisystems.com';\n"
                "  u.protocol = 'https:';\n"
                "  u.port = '';\n"
                "  const code = (event.request.method === 'GET' || event.request.method === 'HEAD') ? 301 : 308;\n"
                "  event.respondWith(Response.redirect(u.toString(), code));\n"
                "});\n"
            ).encode("utf-8")
            w_req = urllib.request.Request(
                f"https://api.cloudflare.com/client/v4/accounts/{acct_id}/workers/scripts/isabi-www-redirect",
                data=worker_js,
                method="PUT",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/javascript",
                },
            )
            try:
                with urllib.request.urlopen(w_req, timeout=20) as w_resp:
                    w_out = json.loads(w_resp.read().decode("utf-8"))
            except Exception as w_ex:
                w_out = {"success": False, "error": str(w_ex)}
            if w_out.get("success") and not has_worker_route:
                rt_post = cf_api(
                    "POST",
                    f"/zones/{zid}/workers/routes",
                    token,
                    {"pattern": "www.isabisystems.com/*", "script": "isabi-www-redirect"},
                )
                if rt_post.get("success"):
                    print("Configured Cloudflare Edge Worker 301 redirect: www.isabisystems.com/* -> https://isabisystems.com/*")

        ensure_email_routing(token, acct_id, zid)
        disable_email_obfuscation(token, zid)
        if purge_cache:
            p_res = cf_api("POST", f"/zones/{zid}/purge_cache", token, {"purge_everything": True})
            if p_res.get("success"):
                print("Purged Cloudflare CDN edge cache for `isabisystems.com`.")

        if str(zone.get("status") or "").lower() == "active":
            print(f"Cloudflare Zone `isabisystems.com` verified ACTIVE (id={zid}).")
        else:
            ns_list = zone.get("name_servers") or []
            if ns_list:
                print("\n======================================================================")
                print("FINAL STEP — UPDATE NAMECHEAP NAMESERVERS FOR `isabisystems.com`:")
                print("  In Namecheap -> Domain List -> isabisystems.com -> Manage -> Nameservers")
                print("  Change 'Namecheap BasicDNS' to 'Custom DNS' and enter:")
                for idx, ns in enumerate(ns_list, 1):
                    print(f"    Nameserver {idx}: {ns}")
                print("======================================================================")


def warn_weak_seat_pins(env: dict):
    """Read-only check after a deploy: verify every active seat with a PIN is PBKDF2-SHA256 hashed."""
    sql = (
        "SELECT id FROM users WHERE COALESCE(status,'Active') != 'Suspended' "
        "AND COALESCE(pin_code,'') != '' AND pin_code NOT LIKE 'pbkdf2$sha256$%' ORDER BY id"
    )
    try:
        r = run_wrangler(["d1", "execute", "isabi-ledger", "--remote", "--json", f"--command={sql}"], env, check=False)
        rows = (json.loads(r.stdout)[0].get("results") or []) if r.returncode == 0 else None
    except Exception:
        rows = None
    if rows is None:
        print("Seat PIN hash check skipped (could not read the live users table).")
    elif rows:
        ids = ", ".join(str(x.get("id")) for x in rows)
        print("=" * 70)
        print(f"WARNING: {len(rows)} live seat(s) still carry a non-PBKDF2 PIN in D1:")
        print(f"  {ids}")
        print("=" * 70)
    else:
        print("Seat PIN hash check: 100% of active seat PINs are PBKDF2-SHA256 hashed.")


def run_live_parity_gate(sync_release_log: bool = True) -> bool:
    """Polls `/app/sw.js` propagation (up to 60s), then runs `build/verify_live_parity.mjs` against `isabisystems.com`."""
    script_path = ISABI_ROOT / "build" / "verify_live_parity.mjs"
    if not script_path.is_file():
        print(f"WARN: Live parity script missing at {script_path}")
        return False
    sw_local = ISABI_ROOT / "app" / "sw.js"
    want_sw_line = ""
    if sw_local.is_file():
        want_sw_line = (sw_local.read_text(encoding="utf-8", errors="replace").splitlines() or [""])[0].strip()
    if want_sw_line:
        for attempt in range(1, 7):
            try:
                probe_url = f"https://isabisystems.com/app/sw.js?probe={int(time.time())}_{attempt}"
                req = urllib.request.Request(probe_url, headers={"Cache-Control": "no-cache", "User-Agent": "ISABI-Deploy-Gate/1.0"})
                with urllib.request.urlopen(req, timeout=10) as resp:
                    live_first = (resp.read().decode("utf-8", errors="replace").splitlines() or [""])[0].strip()
                if live_first == want_sw_line:
                    break
            except Exception:
                pass
            if attempt < 6:
                time.sleep(5)
    node_bin = shutil.which("node") or str(pathlib.Path.home() / ".local" / "node" / "node.exe")
    cmd = [node_bin, str(script_path)]
    if sync_release_log:
        cmd.append("--sync-release-log")
    print("\nRunning post-deploy live parity & security gate (`build/verify_live_parity.mjs`)...")
    r = subprocess.run(cmd, cwd=str(ISABI_ROOT), check=False)
    if r.returncode != 0:
        print(f"ERROR: Post-deploy live parity gate FAILED (exit code {r.returncode}).")
        return False
    print("Post-deploy live parity gate PASSED.")
    return True


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="build/deploy_cloudflare.py",
        description="Provision and deploy ISABI Systems (Pages, Edge Functions, D1, R2, domains, IndexNow).",
        allow_abbrev=False,
    )
    parser.add_argument(
        "--dry",
        "--dry-run",
        dest="dry",
        action="store_true",
        help="Print the execution plan from local files without running Wrangler, network calls, or state writes.",
    )

    modes = parser.add_argument_group("modes (default: full provision + D1/R2 + Pages deploy)")
    modes.add_argument(
        "--configure-domain",
        action="store_true",
        help="Configure custom domains, DNS CNAMEs, edge 301 redirect, Email Routing, and purge CDN cache.",
    )
    modes.add_argument(
        "--ping-indexnow",
        action="store_true",
        help="Ping IndexNow for https://isabisystems.com/ (standalone or combined with --configure-domain).",
    )
    modes.add_argument(
        "--check-seat-pins",
        action="store_true",
        help="Read-only check that active D1 seat PINs are PBKDF2-SHA256 hashed.",
    )
    modes.add_argument(
        "--parity-only",
        action="store_true",
        help="Run post-deploy build/verify_live_parity.mjs only.",
    )
    modes.add_argument(
        "--pages-only",
        action="store_true",
        help="Deploy Pages + Edge Functions bundle, domain/DNS, cache purge, parity gate, and IndexNow (skips D1/R2/secrets).",
    )

    opts = parser.add_argument_group("deploy, D1, R2, secret & gate modifiers")
    opts.add_argument("--login", action="store_true", help="Allow interactive `wrangler login` if Cloudflare auth is missing/expired.")
    opts.add_argument("--skip-seed", action="store_true", help="Skip D1 data seed (0 D1 row writes).")
    opts.add_argument("--seed", action="store_true", help="Explicitly enable D1 data seed (default behavior).")
    opts.add_argument(
        "--delta",
        action="store_true",
        help="Require SHA-256 delta D1 seed (errors if exports/d1_seed_manifest.json is missing).",
    )
    opts.add_argument("--full-seed", action="store_true", help="Force full D1 data seed instead of SHA-256 delta.")
    opts.add_argument("--force-schema", action="store_true", help="Re-apply migrations/0001_schema.sql even if SHA-256 is unchanged.")
    opts.add_argument("--force-r2-seeds", action="store_true", help="Re-upload private R2 seed_*.json even if SHA-256 is unchanged.")
    opts.add_argument("--rotate-secrets", action="store_true", help="Re-upload Edge secrets even if SHA-256 is unchanged.")
    opts.add_argument("--skip-live-parity", action="store_true", help="Skip post-deploy build/verify_live_parity.mjs.")
    opts.add_argument("--no-sync-release-log", action="store_true", help="Run verify_live_parity.mjs without --sync-release-log.")
    opts.add_argument("--skip-indexnow", action="store_true", help="Skip post-deploy IndexNow ping.")
    opts.add_argument(
        "--allow-behind-origin",
        action="store_true",
        help="Allow deploying even when local HEAD is behind origin/main (or when origin/main cannot be fetched).",
    )
    opts.add_argument(
        "--allow-dirty",
        action="store_true",
        help="Allow deploying even when deployable public/edge paths (app/, functions/, migrations/, wrangler.toml, root site files) have uncommitted edits.",
    )
    return parser


def _parse_git_porcelain_z(raw: str) -> list[str]:
    """Parse `git status --porcelain=v1 -z` output into readable `<XY> <path>` entries."""
    if not raw:
        return []
    tokens = raw.split("\0")
    entries: list[str] = []
    idx = 0
    while idx < len(tokens):
        entry = tokens[idx]
        if not entry:
            idx += 1
            continue
        status = entry[:2]
        path = entry[3:] if len(entry) > 3 else ""
        is_rename_or_copy = bool(status) and (status[0] in ("R", "C") or (len(status) > 1 and status[1] in ("R", "C")))
        if is_rename_or_copy and idx + 1 < len(tokens) and tokens[idx + 1]:
            orig_path = tokens[idx + 1]
            entries.append(f"{status} {orig_path} -> {path}")
            idx += 2
        else:
            entries.append(f"{status} {path}".strip())
            idx += 1
    return entries


def check_deploy_paths_clean(
    repo_dir: pathlib.Path = ISABI_ROOT,
    *,
    allow_dirty: bool = False,
    env: dict | None = None,
) -> int:
    """Fail closed when deployable public/edge paths hold uncommitted edits unless --allow-dirty is set."""
    if allow_dirty:
        print("WARN: Bypassing uncommitted public/edge path guard (--allow-dirty).")
        return 0

    git_env = env or build_env()
    git_bin = shutil.which("git", path=git_env.get("PATH")) or "git"

    try:
        r_st = subprocess.run(
            [
                git_bin,
                "--literal-pathspecs",
                "status",
                "--porcelain=v1",
                "-z",
                "--untracked-files=all",
                "--",
                *DEPLOY_GUARD_PATHS,
            ],
            cwd=str(repo_dir),
            env=git_env,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=15,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as ex:
        print(
            f"ERROR: Could not inspect git working-tree cleanliness ({ex}). "
            "Refusing to deploy without verifying public/edge paths are clean; pass --allow-dirty to override.",
            file=sys.stderr,
        )
        raise SystemExit(2) from ex

    if r_st.returncode != 0:
        detail = (r_st.stderr or r_st.stdout or "").strip() or f"exit {r_st.returncode}"
        print(
            f"ERROR: `git status` failed while checking deployable paths ({detail}). "
            "Refusing to deploy without verifying public/edge paths are clean; pass --allow-dirty to override.",
            file=sys.stderr,
        )
        raise SystemExit(2)

    dirty = _parse_git_porcelain_z(r_st.stdout or "")
    if dirty:
        preview = ", ".join(dirty[:12]) + (f" (+{len(dirty) - 12} more)" if len(dirty) > 12 else "")
        print(
            f"ERROR: Working tree has {len(dirty)} uncommitted public/edge change(s): {preview}. "
            "Refusing to deploy uncommitted files. Commit or stash first, use build/release_data_only.py "
            "for data-only top-ups, or pass --allow-dirty if intentional.",
            file=sys.stderr,
        )
        raise SystemExit(2)

    print("Working-tree cleanliness verified: 0 uncommitted changes across public/edge deploy paths.")
    return 0


def check_checkout_not_behind_origin(
    repo_dir: pathlib.Path = ISABI_ROOT,
    *,
    allow_behind_origin: bool = False,
    fetch: bool = True,
    env: dict | None = None,
) -> int:
    """Verify local HEAD includes origin/main so an unpulled checkout cannot roll back live deploys."""
    if allow_behind_origin:
        print("WARN: Bypassing origin/main stale-checkout guard (--allow-behind-origin).")
        return 0

    git_env = env or build_env()
    git_bin = shutil.which("git", path=git_env.get("PATH")) or "git"

    if fetch:
        try:
            r_fetch = subprocess.run(
                [git_bin, "fetch", "--quiet", "origin", "main"],
                cwd=str(repo_dir),
                env=git_env,
                stdin=subprocess.DEVNULL,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=20,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as ex:
            print(
                f"ERROR: Could not fetch origin/main to verify checkout freshness ({ex}). "
                "Refusing to deploy without knowing whether HEAD is stale; retry when online or pass --allow-behind-origin.",
                file=sys.stderr,
            )
            raise SystemExit(2) from ex
        if r_fetch.returncode != 0:
            detail = (r_fetch.stderr or r_fetch.stdout or "").strip() or f"exit {r_fetch.returncode}"
            print(
                f"ERROR: `git fetch --quiet origin main` failed ({detail}). "
                "Refusing to deploy without verifying checkout freshness; pass --allow-behind-origin to override.",
                file=sys.stderr,
            )
            raise SystemExit(2)

    try:
        r_cnt = subprocess.run(
            [git_bin, "rev-list", "--count", "HEAD..origin/main"],
            cwd=str(repo_dir),
            env=git_env,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as ex:
        print(
            f"ERROR: Could not compare HEAD against origin/main ({ex}). "
            "Pass --allow-behind-origin to override.",
            file=sys.stderr,
        )
        raise SystemExit(2) from ex

    if r_cnt.returncode != 0:
        detail = (r_cnt.stderr or r_cnt.stdout or "").strip() or f"exit {r_cnt.returncode}"
        print(
            f"ERROR: `git rev-list --count HEAD..origin/main` failed ({detail}). "
            "Pass --allow-behind-origin to override.",
            file=sys.stderr,
        )
        raise SystemExit(2)

    try:
        behind = int((r_cnt.stdout or "").strip())
    except ValueError as ex:
        print(
            f"ERROR: Unexpected output from `git rev-list --count HEAD..origin/main`: {r_cnt.stdout!r}. "
            "Pass --allow-behind-origin to override.",
            file=sys.stderr,
        )
        raise SystemExit(2) from ex

    if behind > 0:
        def _short_ref(ref: str) -> str:
            r_ref = subprocess.run(
                [git_bin, "rev-parse", "--short", ref],
                cwd=str(repo_dir),
                env=git_env,
                stdin=subprocess.DEVNULL,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=5,
                check=False,
            )
            return (r_ref.stdout or "").strip() or ref

        head_sha = _short_ref("HEAD")
        orig_sha = _short_ref("origin/main")
        print(
            f"ERROR: Local checkout ({head_sha}) is {behind} commit(s) behind origin/main ({orig_sha}). "
            "Refusing to deploy stale code that would roll back live changes. "
            "Run `git pull --rebase origin main` first, or pass --allow-behind-origin if intentional.",
            file=sys.stderr,
        )
        raise SystemExit(2)

    print("Checkout freshness verified: HEAD includes origin/main (0 commits behind).")
    return 0


def parse_cli_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    if args.skip_seed and (args.seed or args.delta or args.full_seed):
        parser.error("--skip-seed cannot be combined with --seed, --delta, or --full-seed.")
    if args.delta and args.full_seed:
        parser.error("--delta cannot be combined with --full-seed.")
    if args.skip_live_parity and args.no_sync_release_log:
        parser.error("--skip-live-parity cannot be combined with --no-sync-release-log.")

    primary_modes = [
        flag
        for enabled, flag in (
            (args.configure_domain, "--configure-domain"),
            (args.check_seat_pins, "--check-seat-pins"),
            (args.parity_only, "--parity-only"),
            (args.pages_only, "--pages-only"),
        )
        if enabled
    ]
    if len(primary_modes) > 1:
        parser.error(f"Conflicting mode flags: {', '.join(primary_modes)} cannot be combined.")

    flag_attr_map = (
        ("configure_domain", "--configure-domain"),
        ("ping_indexnow", "--ping-indexnow"),
        ("check_seat_pins", "--check-seat-pins"),
        ("parity_only", "--parity-only"),
        ("pages_only", "--pages-only"),
        ("login", "--login"),
        ("skip_seed", "--skip-seed"),
        ("seed", "--seed"),
        ("delta", "--delta"),
        ("full_seed", "--full-seed"),
        ("force_schema", "--force-schema"),
        ("force_r2_seeds", "--force-r2-seeds"),
        ("rotate_secrets", "--rotate-secrets"),
        ("skip_live_parity", "--skip-live-parity"),
        ("no_sync_release_log", "--no-sync-release-log"),
        ("skip_indexnow", "--skip-indexnow"),
        ("allow_behind_origin", "--allow-behind-origin"),
        ("allow_dirty", "--allow-dirty"),
    )
    active_non_dry = [flag for attr, flag in flag_attr_map if getattr(args, attr)]

    if args.configure_domain:
        bad = [f for f in active_non_dry if f not in ("--configure-domain", "--ping-indexnow")]
        if bad:
            parser.error(f"--configure-domain cannot be combined with {', '.join(bad)}.")
    elif args.ping_indexnow:
        bad = [f for f in active_non_dry if f != "--ping-indexnow"]
        if bad:
            parser.error(f"--ping-indexnow (without --configure-domain) cannot be combined with {', '.join(bad)}.")
    elif args.check_seat_pins:
        bad = [f for f in active_non_dry if f not in ("--check-seat-pins", "--login")]
        if bad:
            parser.error(f"--check-seat-pins cannot be combined with {', '.join(bad)}.")
    elif args.parity_only:
        bad = [f for f in active_non_dry if f not in ("--parity-only", "--no-sync-release-log")]
        if bad:
            parser.error(f"--parity-only cannot be combined with {', '.join(bad)}.")
    elif args.pages_only:
        d1_r2_sec = [
            f
            for f in (
                "--skip-seed",
                "--seed",
                "--delta",
                "--full-seed",
                "--force-schema",
                "--force-r2-seeds",
                "--rotate-secrets",
            )
            if f in active_non_dry
        ]
        if d1_r2_sec:
            parser.error(f"--pages-only cannot be combined with {', '.join(d1_r2_sec)}.")

    return args


def _read_sw_header_line() -> str:
    sw_path = ISABI_ROOT / "app" / "sw.js"
    if not sw_path.is_file():
        return "(missing app/sw.js)"
    try:
        lines = sw_path.read_text(encoding="utf-8", errors="replace").splitlines()
        return lines[0].strip() if lines else "(empty app/sw.js)"
    except OSError:
        return "(unreadable app/sw.js)"


def print_dry_run_plan(args: argparse.Namespace) -> int:
    meta = load_edge_meta()
    sw_line = _read_sw_header_line()
    schema_sha = file_sha256(SCHEMA_SQL) if SCHEMA_SQL.is_file() else ""
    last_schema_sha = str(meta.get("last_schema_sha256") or "")
    manifest_exists = COMMITTED_MANIFEST_JSON.exists()

    if args.configure_domain:
        mode = "configure-domain" + (" + ping-indexnow" if args.ping_indexnow else "")
    elif args.ping_indexnow:
        mode = "ping-indexnow"
    elif args.check_seat_pins:
        mode = "check-seat-pins"
    elif args.parity_only:
        mode = "parity-only"
    elif args.pages_only:
        mode = "pages-only"
    else:
        mode = "full-deploy"

    print("DRY RUN — 0 remote or local writes")
    print(f"  Checkout : {ISABI_ROOT}")
    print(f"  Shell    : {sw_line}")
    print(f"  Mode     : {mode}")

    if args.configure_domain:
        print("  Steps    :")
        print("    1. Configure Cloudflare Zone, custom domains, DNS CNAMEs, edge 301 redirect, Email Routing & purge CDN cache")
        print("    2. IndexNow ping -> " + ("RUN" if args.ping_indexnow else "SKIP"))
        return 0
    if args.ping_indexnow:
        print("  Steps    :")
        print("    1. Ping IndexNow for https://isabisystems.com/")
        return 0
    if args.check_seat_pins:
        print("  Steps    :")
        print("    1. Verify Cloudflare auth" + (" (allow interactive --login)" if args.login else ""))
        print("    2. Read-only D1 check: verify active users.pin_code rows are PBKDF2-SHA256 hashed")
        return 0
    if args.parity_only:
        sync_flag = "with --sync-release-log" if not args.no_sync_release_log else "without --sync-release-log"
        print("  Steps    :")
        print(f"    1. Run build/verify_live_parity.mjs ({sync_flag})")
        return 0

    if mode == "full-deploy" and args.delta and not manifest_exists:
        print(
            f"ERROR: --delta requested, but `{COMMITTED_MANIFEST_JSON}` is missing (refusing to fall back to a full seed).",
            file=sys.stderr,
        )
        return 2

    steps: list[str] = [
        (
            "Dirty-tree guard -> BYPASS (--allow-dirty)"
            if args.allow_dirty
            else "Verify public/edge deploy paths have 0 uncommitted changes (git status --porcelain)"
        ),
        (
            "Stale-checkout guard -> BYPASS (--allow-behind-origin)"
            if args.allow_behind_origin
            else "Verify local HEAD is not behind origin/main (git fetch origin main + HEAD..origin/main == 0)"
        ),
        "Verify Cloudflare auth" + (" (allow interactive --login)" if args.login else ""),
    ]
    if mode == "full-deploy":
        steps.append("Ensure D1 (`isabi-ledger`), R2 (`isabi-vault`), wrangler.toml bindings, and Pages project (`isabi-systems`)")
        steps.append("Edge secrets -> " + ("ROTATE/UPLOAD" if args.rotate_secrets else "upload only if SHA-256 changed"))
        app_js_dir = ISABI_ROOT.parent / "isabi-app" / "js"
        r2_shas = dict(meta.get("r2_seed_shas") or {})
        if not app_js_dir.is_dir():
            steps.append(f"R2 private seeds -> SKIP (`{app_js_dir}` not present)")
        else:
            r2_parts: list[str] = []
            for kind in ("core", "records", "industries"):
                src = app_js_dir / f"seed_{kind}.json"
                if not src.is_file():
                    r2_parts.append(f"{kind}:missing")
                else:
                    sha = file_sha256(src)
                    if args.force_r2_seeds or r2_shas.get(kind) != sha:
                        r2_parts.append(f"{kind}:UPLOAD({sha[:10]})")
                    else:
                        r2_parts.append(f"{kind}:unchanged({sha[:10]})")
            steps.append("R2 private seeds -> " + ", ".join(r2_parts))
        if not schema_sha:
            steps.append("D1 schema -> MISSING (migrations/0001_schema.sql)")
        elif args.force_schema or last_schema_sha != schema_sha:
            steps.append(f"D1 schema -> APPLY ({schema_sha[:12]})")
        else:
            steps.append(f"D1 schema -> unchanged ({schema_sha[:12]}), skip")
        if args.skip_seed:
            steps.append("D1 data seed -> SKIP (--skip-seed)")
        elif args.full_seed or not manifest_exists:
            reason = "--full-seed" if args.full_seed else "no committed d1_seed_manifest.json"
            steps.append(f"D1 data seed -> FULL ({reason})")
        else:
            steps.append("D1 data seed -> DELTA (exports/d1_seed_manifest.json present)")
        steps.append("Migrate any legacy remote D1 users/edge_kv_store PINs to PBKDF2-SHA256")
    steps.append("Stage allowlisted public bundle (`stage_pages_bundle.py`) and deploy Cloudflare Pages + Edge Functions")
    steps.append("Check remote active seat PINs are PBKDF2-SHA256 hashed")
    steps.append("Configure custom domains, DNS CNAMEs, edge 301 redirect, Email Routing & clean old preview deployments + purge cache")
    if args.skip_live_parity:
        steps.append("Live parity gate -> SKIP (--skip-live-parity)")
    else:
        sync_flag = "with --sync-release-log" if not args.no_sync_release_log else "without --sync-release-log"
        steps.append(f"Live parity gate -> RUN build/verify_live_parity.mjs ({sync_flag})")
    steps.append("IndexNow ping -> " + ("SKIP (--skip-indexnow)" if args.skip_indexnow else "RUN"))

    print("  Steps    :")
    for idx, desc in enumerate(steps, 1):
        print(f"    {idx}. {desc}")
    return 0


def main(argv: list[str] | None = None):
    args = parse_cli_args(argv)
    if args.dry:
        sys.exit(print_dry_run_plan(args))
    if args.configure_domain:
        configure_domain_and_dns(
            os.environ.get("CLOUDFLARE_ACCOUNT_ID") or "",
            allow_zone_create=False,
            purge_cache=True,
        )
        if args.ping_indexnow:
            ping_indexnow()
        return
    if args.ping_indexnow:
        ping_indexnow()
        return
    if args.check_seat_pins:
        env = build_env()
        ok, _acct_id = ensure_logged_in(env, login=args.login)
        if not ok:
            sys.exit(2)
        warn_weak_seat_pins(env)
        return
    if args.parity_only:
        ok_parity = run_live_parity_gate(sync_release_log=not args.no_sync_release_log)
        sys.exit(0 if ok_parity else 1)
    env = build_env()
    check_deploy_paths_clean(
        ISABI_ROOT,
        allow_dirty=args.allow_dirty,
        env=env,
    )
    check_checkout_not_behind_origin(
        ISABI_ROOT,
        allow_behind_origin=args.allow_behind_origin,
        fetch=True,
        env=env,
    )
    ok, acct_id = ensure_logged_in(env, login=args.login)
    if not ok:
        sys.exit(2)
    if args.pages_only:
        deploy_pages(env)
        warn_weak_seat_pins(env)
        configure_domain_and_dns(acct_id)
        cleanup_preview_deployments_and_purge_cache(acct_id)
        if not args.skip_live_parity:
            if not run_live_parity_gate(sync_release_log=not args.no_sync_release_log):
                sys.exit(1)
        if not args.skip_indexnow:
            ping_indexnow()
        print("\nPAGES + EDGE FUNCTIONS BUNDLE DEPLOYMENT COMPLETE!")
        return
    d1_uuid = ensure_d1_database(env)
    r2_ok = ensure_r2_bucket(env)
    stamp_wrangler_toml(d1_uuid, r2_ok)
    ensure_pages_project(env)
    upload_secrets(env, rotate_secrets=args.rotate_secrets)
    upload_r2_private_seeds(env, r2_ok, force_r2_seeds=args.force_r2_seeds)
    seed_remote_d1(
        env,
        force_schema=args.force_schema,
        skip_seed=args.skip_seed,
        full_seed=args.full_seed,
        require_delta=args.delta,
    )
    migrate_remote_d1_pins_to_pbkdf2(env)
    deploy_pages(env)
    warn_weak_seat_pins(env)
    configure_domain_and_dns(acct_id)
    cleanup_preview_deployments_and_purge_cache(acct_id)
    if not args.skip_live_parity:
        if not run_live_parity_gate(sync_release_log=not args.no_sync_release_log):
            sys.exit(1)
    if not args.skip_indexnow:
        ping_indexnow()
    print("\nOPTION A CLOUDFLARE EDGE DEPLOYMENT COMPLETE!")
    print("Production URL:             https://isabisystems.com/")
    print("Command Center URL:         https://isabisystems.com/app/")


if __name__ == "__main__":
    main()
