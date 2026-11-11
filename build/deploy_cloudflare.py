"""deploy_cloudflare.py — One-Command Turnkey Option A Provisioner & Deployer for ISABI Systems.
Provisions Cloudflare Pages project (`isabi-systems`), D1 SQLite (`isabi-ledger`),
R2 bucket (`isabi-vault`), encrypted Edge Secrets (`GEMINI_API_KEY`, `ISABI_JWT_SECRET`),
uploads schema + SHA-256 delta ledger batches (`0` D1 row writes on routine UI deploys),
deploys Pages + Functions, attaches custom domains (`isabisystems.com`, `www.isabisystems.com`),
configures Cloudflare DNS CNAMEs, and prints the exact 2 Cloudflare nameservers for Namecheap.

Usage:
  python build/deploy_cloudflare.py [--skip-seed] [--seed] [--full-seed] [--force-schema] [--rotate-secrets] [--login]
"""
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
from stage_pages_bundle import stage_pages_bundle

ISABI_ROOT = BUILD_DIR.parent
WRANGLER_TOML = ISABI_ROOT / "wrangler.toml"
SCHEMA_SQL = ISABI_ROOT / "migrations" / "0001_schema.sql"
BATCH_DIR = ISABI_ROOT / "exports" / "d1_batches"
SECRET_STATE_FILE = ISABI_ROOT / "exports" / "cloudflare_edge_meta.json"


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
    node_dir = r"C:\Users\hbdei\.local\node"
    py_dir = r"C:\Users\hbdei\.local\python312"
    git_dir = r"C:\Users\hbdei\MinGit\cmd"
    env["PATH"] = f"{node_dir};{py_dir};{git_dir};" + env.get("PATH", "")
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


def ensure_logged_in(env: dict) -> tuple[bool, str]:
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

    if "--login" in sys.argv or sys.stdin.isatty():
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


def upload_secrets(env: dict):
    jwt_sec = load_or_create_jwt_secret()
    gem_key = read_gemini_key()
    meta = load_edge_meta()
    vt_hash = str(os.environ.get("VT_GPS_API_HASH") or meta.get("vt_gps_api_hash") or "").strip()
    vt_email = str(os.environ.get("VT_GPS_EMAIL") or meta.get("vt_gps_email") or "").strip()
    vt_pass = str(os.environ.get("VT_GPS_PASSWORD") or meta.get("vt_gps_password") or "").strip()
    sec_sha = hashlib.sha256(f"{jwt_sec}|{gem_key}|{vt_hash}|{vt_email}|{vt_pass}".encode("utf-8")).hexdigest()
    if "--rotate-secrets" not in sys.argv and meta.get("last_secrets_sha256") == sec_sha:
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


def seed_remote_d1(env: dict):
    schema_sha = file_sha256(SCHEMA_SQL)
    db_sha = file_sha256(DB_PATH)
    meta = load_edge_meta()

    if "--force-schema" in sys.argv or meta.get("last_schema_sha256") != schema_sha:
        print("Applying 0001_schema.sql to remote D1 `isabi-ledger`...")
        run_wrangler(["d1", "execute", "isabi-ledger", "--remote", f"--file={SCHEMA_SQL}", "-y"], env, check=True)
        meta = load_edge_meta()
        meta["last_schema_sha256"] = schema_sha
        save_edge_meta(meta)
    else:
        print(f"Schema 0001_schema.sql unchanged ({schema_sha[:12]}); skipping remote DDL.")

    if "--skip-seed" in sys.argv:
        print("Skipping D1 data seed (--skip-seed passed; 0 D1 row writes).")
        return

    use_delta = ("--full-seed" not in sys.argv) and COMMITTED_MANIFEST_JSON.exists()
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


def upload_r2_private_seeds(env: dict, r2_enabled: bool):
    if not r2_enabled:
        print("WARN: R2 bucket `isabi-vault` unavailable; skipping private seed upload.")
        return
    app_js_dir = ISABI_ROOT.parent / "isabi-app" / "js"
    if not app_js_dir.is_dir():
        print(f"WARN: `{app_js_dir}` not present on this machine; skipping R2 private seed upload.")
        return
    meta = load_edge_meta()
    r2_shas = dict(meta.get("r2_seed_shas") or {})
    force_upload = "--force-r2-seeds" in sys.argv
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
    except Exception:
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
    kv_stmts: list[str] = [
        f"INSERT OR REPLACE INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES ('mfg_web_store', {sql_lit(chunks[0])}, {sql_lit(upd_at)}, {sql_lit(upd_by)}, {rev});\n"
    ]
    expected_keys = {"mfg_web_store"}
    for idx, ch in enumerate(chunks[1:], start=1):
        pk = f"mfg_web_store__part_{idx:04d}"
        expected_keys.add(pk)
        kv_stmts.append(
            f"INSERT OR REPLACE INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) VALUES ({sql_lit(pk)}, {sql_lit(ch)}, {sql_lit(upd_at)}, {sql_lit(upd_by)}, {rev});\n"
        )
    for old_r in kv_rows:
        ok_key = str(old_r.get("doc_key") or "")
        if ok_key and ok_key not in expected_keys:
            kv_stmts.append(f"DELETE FROM edge_kv_store WHERE doc_key = {sql_lit(ok_key)};\n")
    with tempfile.TemporaryDirectory(prefix="isabi-d1-kv-") as td:
        for s_idx, stmt in enumerate(kv_stmts):
            fp = pathlib.Path(td) / f"kv_{s_idx:04d}.sql"
            fp.write_bytes(stmt.encode("utf-8"))
            run_wrangler(["d1", "execute", "isabi-ledger", "--remote", f"--file={fp}"], env, check=True)
    print(f"Scrubbed legacy PIN fields from remote D1 `edge_kv_store` across {len(chunks)} chunk(s).")


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


def main():
    if "--configure-domain" in sys.argv:
        configure_domain_and_dns(
            os.environ.get("CLOUDFLARE_ACCOUNT_ID") or "",
            allow_zone_create=False,
            purge_cache=True,
        )
        if "--ping-indexnow" in sys.argv:
            ping_indexnow()
        return
    if "--ping-indexnow" in sys.argv:
        ping_indexnow()
        return
    if "--check-seat-pins" in sys.argv:
        env = build_env()
        warn_weak_seat_pins(env)
        return
    if "--parity-only" in sys.argv:
        ok_parity = run_live_parity_gate(sync_release_log=("--no-sync-release-log" not in sys.argv))
        sys.exit(0 if ok_parity else 1)
    env = build_env()
    ok, acct_id = ensure_logged_in(env)
    if not ok:
        sys.exit(2)
    if "--pages-only" in sys.argv:
        deploy_pages(env)
        warn_weak_seat_pins(env)
        configure_domain_and_dns(acct_id)
        cleanup_preview_deployments_and_purge_cache(acct_id)
        if "--skip-live-parity" not in sys.argv:
            if not run_live_parity_gate(sync_release_log=("--no-sync-release-log" not in sys.argv)):
                sys.exit(1)
        if "--skip-indexnow" not in sys.argv:
            ping_indexnow()
        print("\nPAGES + EDGE FUNCTIONS BUNDLE DEPLOYMENT COMPLETE!")
        return
    d1_uuid = ensure_d1_database(env)
    r2_ok = ensure_r2_bucket(env)
    stamp_wrangler_toml(d1_uuid, r2_ok)
    ensure_pages_project(env)
    upload_secrets(env)
    upload_r2_private_seeds(env, r2_ok)
    seed_remote_d1(env)
    migrate_remote_d1_pins_to_pbkdf2(env)
    deploy_pages(env)
    warn_weak_seat_pins(env)
    configure_domain_and_dns(acct_id)
    cleanup_preview_deployments_and_purge_cache(acct_id)
    if "--skip-live-parity" not in sys.argv:
        if not run_live_parity_gate(sync_release_log=("--no-sync-release-log" not in sys.argv)):
            sys.exit(1)
    if "--skip-indexnow" not in sys.argv:
        ping_indexnow()
    print("\nOPTION A CLOUDFLARE EDGE DEPLOYMENT COMPLETE!")
    print("Production URL:             https://isabisystems.com/")
    print("Command Center URL:         https://isabisystems.com/app/")


if __name__ == "__main__":
    main()
