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
                                    [--allow-behind-origin] [--allow-dirty] [--allow-claimed-version]
                                    [--no-release-lock] [--login]
  python build/deploy_cloudflare.py --pages-only [--dry] [--skip-live-parity] [--no-sync-release-log]
                                    [--skip-indexnow] [--allow-behind-origin] [--allow-dirty]
                                    [--allow-claimed-version] [--no-release-lock] [--login]
  A deploy holds the release lock (build/release_lock.py: one release at a time across sessions and PCs). It takes
  the lock when free and records the deployed commit; after `git push origin main` run
  `python build/release_lock.py release`.
  A code release goes live from the leader's PC with `--pages-only` (owner 2026-11-26): GitHub Actions no longer
  deploys on a push to main, so pushing first and waiting for a run deploys nothing.
  python build/deploy_cloudflare.py --configure-domain [--ping-indexnow] [--dry]
  python build/deploy_cloudflare.py --ping-indexnow [--dry]
  python build/deploy_cloudflare.py --check-seat-pins [--login] [--dry]
  python build/deploy_cloudflare.py --parity-only [--no-sync-release-log] [--dry]
  python build/deploy_cloudflare.py --stage-r2-seeds [--force-r2-seeds] [--login] [--dry]
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import datetime as dt
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
import urllib.parse
import urllib.request

BUILD_DIR = pathlib.Path(__file__).resolve().parent
if str(BUILD_DIR) not in sys.path:
    sys.path.insert(0, str(BUILD_DIR))

import row_store_read as RSR  # noqa: E402
from export_d1_seed import (  # noqa: E402
    COMMITTED_MANIFEST_JSON, DB_PATH, build_store_kv_stage_clear, build_store_kv_stage_stmts,
    build_store_kv_stale_stage_clear, build_store_kv_swap, file_sha256, new_store_run_id, promote_pending_manifest, sql_lit,
)
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
        r"C:\Users\hbdei\MinGit\mingw64\bin",
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


def read_google_maps_key() -> str:
    k = os.environ.get("GOOGLE_MAPS_API_KEY") or os.environ.get("ISABI_GMAPS_KEY") or ""
    if not k and sys.platform == "win32":
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Environment") as rk:
                k = str(winreg.QueryValueEx(rk, "GOOGLE_MAPS_API_KEY")[0] or "").strip()
        except Exception:
            k = ""
    if not k:
        k = str(load_edge_meta().get("google_maps_api_key") or "").strip()
    return k


def load_or_create_jwt_secret() -> str:
    meta = load_edge_meta()
    if not meta.get("jwt_secret"):
        meta["jwt_secret"] = secrets.token_urlsafe(48)
        save_edge_meta(meta)
    return str(meta["jwt_secret"])


# Cloudflare API blips (seen 2026-11-13 15:21Z-16:06Z: 503 on `pages project list`, Functions publish
# "Unknown internal error") end a deploy that a short wait would have carried through. run_wrangler retries a
# command only when (a) running it twice is harmless and (b) its output reads as a Cloudflare-side failure.
# Writes to D1 are never retried here (batch uploads keep their own loop in _upload_one_batch).
# Status numbers count only in a status context ("[code: 503]", "status 502", "HTTP 504"), never bare, so upload
# progress such as "Uploading... (523/523)" next to a compile error is not read as an outage.
WRANGLER_TRANSIENT_RE = re.compile(
    r"\[code:\s*(?:5\d\d|429|8000000)\]|\bstatus(?:\s*code)?\s*[:=]?\s*(?:5\d\d|429)\b|\bHTTP(?:/[\d.]+)?\s+(?:5\d\d|429)\b"
    r"|no healthy upstream|unknown internal error|internal server error|service unavailable|bad gateway"
    r"|gateway time-?out|temporarily unavailable|too many requests|rate limit"
    r"|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|UND_ERR_\w+|socket hang up|fetch failed|network error"
    r"|network connection lost|request timed out|timed out",
    re.I,
)
WRANGLER_RETRY_DELAYS_S: tuple[float, ...] = (10.0, 30.0, 60.0)


def wrangler_retry_delays() -> tuple[float, ...]:
    """Back-off between attempts; ISABI_WRANGLER_RETRIES=<n> sets how many retries (0 turns them off)."""
    raw = str(os.environ.get("ISABI_WRANGLER_RETRIES", "")).strip()
    if not raw:
        return WRANGLER_RETRY_DELAYS_S
    try:
        n = max(0, min(10, int(raw)))
    except ValueError:
        return WRANGLER_RETRY_DELAYS_S
    base = list(WRANGLER_RETRY_DELAYS_S)
    return tuple((base + [base[-1]] * 10)[:n])


def wrangler_is_idempotent(args: list[str]) -> bool:
    """True for wrangler commands that are safe to run again after an unclear failure."""
    a = [str(x) for x in args]
    if a[:1] == ["whoami"]:
        return True
    # Whole-token matches only: `pages deploy` must not also cover `pages deployment delete`.
    safe_heads = (
        ["pages", "project", "list"], ["pages", "deployment", "list"], ["pages", "secret", "list"], ["d1", "list"], ["r2", "bucket", "list"],
        # A second `pages deploy` of the same bundle only adds one more deployment; secrets and R2 objects overwrite.
        ["pages", "deploy"], ["pages", "secret", "put"], ["r2", "object", "put"], ["r2", "object", "get"], ["r2", "object", "delete"],
    )
    if any(a[:len(h)] == h for h in safe_heads):
        return True
    if a[:2] == ["d1", "execute"]:
        cmd_args = [x for x in a if x.startswith("--command=")]
        if cmd_args and not any(x.startswith("--file") for x in a):
            sql = cmd_args[0][len("--command="):].strip().lower()
            return sql.startswith(("select", "pragma")) and ";" not in sql.rstrip(";")
    return False


def wrangler_failure_is_transient(r) -> bool:
    out = f"{getattr(r, 'stdout', '') or ''}\n{getattr(r, 'stderr', '') or ''}"
    if re.search(r"\b(?:not authenticated|authentication error|10000|unauthori[sz]ed|forbidden|not found)\b", out, re.I) \
            and not re.search(r"no healthy upstream|internal error|\[code:\s*5\d\d\]", out, re.I):
        return False
    return bool(WRANGLER_TRANSIENT_RE.search(out))


def wrangler_failure_reason(r, limit: int = 160) -> str:
    """Last non-empty stderr line (the error), else the last stdout line; wrangler's log-file footer is skipped."""
    for stream in (getattr(r, "stderr", "") or "", getattr(r, "stdout", "") or ""):
        lines = [
            ln.strip() for ln in stream.strip().splitlines()
            if ln.strip() and not re.match(r"^(?:\W\s*)?Logs were written to", ln.strip(), re.I)
        ]
        if lines:
            return lines[-1][:limit]
    return f"exit {getattr(r, 'returncode', '?')}"


def _run_wrangler_once(cmd: list[str], env: dict, input_text: str | None):
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
        check=False,
    )


def run_wrangler(args: list[str], env: dict, input_text: str | None = None, check: bool = True, retry: bool | None = None):
    cmd = [wrangler_bin(env)] + args
    may_retry = wrangler_is_idempotent(args) if retry is None else bool(retry)
    delays = wrangler_retry_delays() if may_retry else ()
    r = _run_wrangler_once(cmd, env, input_text)
    for i, delay in enumerate(delays, start=1):
        if r.returncode == 0 or not wrangler_failure_is_transient(r):
            break
        reason = wrangler_failure_reason(r)
        print(f"WARN: Cloudflare looks unavailable for `wrangler {' '.join(args[:3])}` ({reason}); retry {i}/{len(delays)} in {delay:.0f}s...")
        time.sleep(delay)
        r = _run_wrangler_once(cmd, env, input_text)
    if check and r.returncode != 0:
        raise subprocess.CalledProcessError(r.returncode, cmd, output=r.stdout, stderr=r.stderr)
    return r


class CloudflareListUnavailable(RuntimeError):
    """A listing call failed, so whether the resource exists is unknown: never create or downgrade on it."""


def _list_failed(what: str, r) -> CloudflareListUnavailable:
    reason = wrangler_failure_reason(r, 200)
    return CloudflareListUnavailable(
        f"Could not list {what} (wrangler exit {r.returncode}: {reason}). Cloudflare may be having an outage; "
        "nothing was created or changed. Re-run the deploy when the API answers again."
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
    if r_list.returncode != 0 or not r_list.stdout.strip():
        raise _list_failed("D1 databases", r_list)
    try:
        dbs = json.loads(r_list.stdout)
    except Exception:
        raise _list_failed("D1 databases (unreadable JSON)", r_list)
    if not isinstance(dbs, list):
        raise _list_failed("D1 databases (unexpected shape)", r_list)
    for d in dbs:
        if isinstance(d, dict) and d.get("name") == "isabi-ledger" and d.get("uuid"):
            return str(d["uuid"])

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
    # A failed listing is not "R2 is off": the D1 fallback rewrites wrangler.toml without the BUCKET binding,
    # and that deploy cannot serve the private seeds. Take the fallback only when Cloudflare itself says R2
    # is not enabled on the account (code 10042); any other failure stops the run with nothing changed.
    r2_off_re = re.compile(r"\b10042\b|enable r2|r2 (?:is )?not enabled", re.I)
    if r_list.returncode != 0 and not r2_off_re.search(combined):
        raise _list_failed("R2 buckets", r_list)
    r_create = run_wrangler(["r2", "bucket", "create", "isabi-vault"], env, check=False)
    create_out = (r_create.stdout or "") + "\n" + (r_create.stderr or "")
    if r_create.returncode == 0:
        print("Created R2 bucket `isabi-vault`.")
        return True
    if re.search(r"already exists|\b10004\b", create_out, re.I):
        print("R2 bucket `isabi-vault` verified (already exists).")
        return True
    if not r2_off_re.search(combined + "\n" + create_out):
        raise _list_failed("R2 buckets (create)", r_create)
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
    if r_list.returncode == 0 and "isabi-systems" in ((r_list.stdout or "") + (r_list.stderr or "")):
        print("Cloudflare Pages project `isabi-systems` verified.")
        return
    # A failed listing means "unknown", not "missing" (2026-11-13: a 503 made this create the live project
    # 12 times and end the run). Stop instead of creating.
    if r_list.returncode != 0:
        raise _list_failed("Pages projects", r_list)
    print("Creating Cloudflare Pages project `isabi-systems`...")
    r_create = run_wrangler(["pages", "project", "create", "isabi-systems", "--production-branch=main"], env, check=False)
    create_out = (r_create.stdout or "") + "\n" + (r_create.stderr or "")
    if r_create.returncode != 0 and re.search(r"already exists|8000002|name.*(taken|in use)", create_out, re.I):
        print("Cloudflare Pages project `isabi-systems` verified (already exists).")
        return
    if r_create.returncode != 0:
        raise subprocess.CalledProcessError(r_create.returncode, r_create.args, output=r_create.stdout, stderr=r_create.stderr)


PAGES_SECRET_NAME_RE = re.compile(r"^\s*-\s*([A-Z][A-Z0-9_]*)\s*:", re.M)


def pages_secret_names(env: dict) -> set[str] | None:
    """Names of the secrets the live Pages project holds (never values), or None when the listing failed."""
    r = run_wrangler(["pages", "secret", "list", "--project-name=isabi-systems"], env, check=False)
    if r.returncode != 0:
        return None
    out = f"{r.stdout or ''}\n{r.stderr or ''}"
    if "isabi-systems" not in out:
        return None
    return set(PAGES_SECRET_NAME_RE.findall(out))


def jwt_secret_upload_decision(rotate_secrets: bool, live_names: set[str] | None) -> str:
    """'upload' or 'keep' for ISABI_JWT_SECRET (owner 2026-11-17).

    Replacing the live signing secret signs every user and every tablet out. A PC's local copy in
    exports/cloudflare_edge_meta.json is not the live one (2026-11-16: two different copies on one PC, neither
    live; a worktree with its own exports/ folder made a fresh one), so a deploy uploads it only when asked to
    (--rotate-secrets) or when the project has no signing secret at all. A failed listing keeps the live one."""
    if rotate_secrets:
        return "upload"
    if live_names is None:
        return "keep"
    return "keep" if "ISABI_JWT_SECRET" in live_names else "upload"


def upload_secrets(env: dict, *, rotate_secrets: bool = False):
    live_names = None if rotate_secrets else pages_secret_names(env)
    jwt_decision = jwt_secret_upload_decision(rotate_secrets, live_names)
    ok_sec = True
    if jwt_decision == "upload":
        if rotate_secrets:
            # A rotation is a new value, never this PC's old copy (it may be stale, or the one being retired).
            meta_rot = load_edge_meta()
            meta_rot["jwt_secret"] = secrets.token_urlsafe(48)
            save_edge_meta(meta_rot)
        jwt_sec = load_or_create_jwt_secret()
        if rotate_secrets:
            print("WARNING: --rotate-secrets replaces the live signing secret with a new one: every user and tablet signs in again.")
        else:
            print("The Pages project has no ISABI_JWT_SECRET yet; uploading one.")
        print("Uploading encrypted ISABI_JWT_SECRET to Cloudflare Pages...")
        r_jwt = run_wrangler(["pages", "secret", "put", "ISABI_JWT_SECRET", "--project-name=isabi-systems"], env, input_text=jwt_sec, check=True)
        ok_sec = r_jwt.returncode == 0
    elif live_names is None:
        print("WARNING: could not list the Pages project's secrets; the live signing secret was left as it is.")
    else:
        print("Live ISABI_JWT_SECRET kept (replace it only with --rotate-secrets).")

    gem_key = read_gemini_key()
    gmaps_key = read_google_maps_key()
    meta = load_edge_meta()
    vt_hash = str(os.environ.get("VT_GPS_API_HASH") or meta.get("vt_gps_api_hash") or "").strip()
    vt_email = str(os.environ.get("VT_GPS_EMAIL") or meta.get("vt_gps_email") or "").strip()
    vt_pass = str(os.environ.get("VT_GPS_PASSWORD") or meta.get("vt_gps_password") or "").strip()
    # The signing secret is not part of this fingerprint: it is uploaded only by the decision above.
    sec_sha = hashlib.sha256(f"other-secrets-v2|{gem_key}|{gmaps_key}|{vt_hash}|{vt_email}|{vt_pass}".encode("utf-8")).hexdigest()
    if not rotate_secrets and meta.get("last_secrets_sha256") == sec_sha:
        print("Other Edge secrets unchanged; skipping redundant secret upload.")
        return

    if gem_key:
        print("Uploading encrypted GEMINI_API_KEY to Cloudflare Pages...")
        r_gem = run_wrangler(["pages", "secret", "put", "GEMINI_API_KEY", "--project-name=isabi-systems"], env, input_text=gem_key, check=False)
        ok_sec = ok_sec and (r_gem.returncode == 0)

    if gmaps_key:
        print("Uploading encrypted GOOGLE_MAPS_API_KEY to Cloudflare Pages...")
        r_gmaps = run_wrangler(["pages", "secret", "put", "GOOGLE_MAPS_API_KEY", "--project-name=isabi-systems"], env, input_text=gmaps_key, check=False)
        ok_sec = ok_sec and (r_gmaps.returncode == 0)

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


def read_live_store_rows(env: dict) -> list[dict] | None:
    """Head + parts of the live store, or None when wrangler could not read them."""
    chk = run_wrangler(
        ["d1", "execute", "isabi-ledger", "--remote", "--json",
         "--command=SELECT doc_key, payload_json, updated_at FROM edge_kv_store WHERE doc_key = 'mfg_web_store' OR doc_key LIKE 'mfg_web_store__part_%' ORDER BY doc_key"],
        env,
        check=False,
    )
    if chk.returncode != 0:
        return None
    try:
        return json.loads(chk.stdout)[0].get("results") or []
    except Exception:
        return None


def live_store_rows_count(env: dict) -> int | None:
    """How many lines `store_rows` holds for the store, or None when wrangler could not say."""
    chk = run_wrangler(
        ["d1", "execute", "isabi-ledger", "--remote", "--json", f"--command={RSR.ROWS_COUNT_SQL}"],
        env,
        check=False,
    )
    if chk.returncode != 0:
        return None
    try:
        return int((json.loads(chk.stdout)[0].get("results") or [{}])[0].get("n"))
    except Exception:
        return None


def assert_live_store_parses(env: dict, after: str, expected_head_ts: str = "") -> str:
    """Stop the deploy when the live store's chunks no longer join into valid JSON (incident 2026-11-13).
    Reads twice before failing: a browser write is two steps (head, then parts) and a read can fall between them.
    Returns the joined live text. A store whose rows are the master (head row = commit record, row_store_read.py) is
    in order when `store_rows` holds the number of lines the record names; the text returned is then empty."""
    last_err = ""
    for attempt in range(3):
        rows = read_live_store_rows(env)
        head_now = RSR.head_row_of(rows) if rows else None
        if head_now is not None and RSR.is_rows_head(str(head_now.get("payload_json") or "")):
            rec = RSR.parse_commit(str(head_now.get("payload_json") or ""))
            n_rows = live_store_rows_count(env)
            if rec is not None and n_rows is not None and int(rec.get("n") or -1) == n_rows:
                print(f"Live store is kept as rows ({n_rows} line(s), as its commit record names): left as it is.")
                return ""
            last_err = f"the store is kept as rows and its commit record names {rec.get('n') if rec else 'nothing'} line(s), store_rows holds {n_rows}"
        elif rows is None:
            last_err = "wrangler could not read the store"
        else:
            try:
                joined = "".join(str(x.get("payload_json") or "") for x in rows)
                if rows:
                    json.loads(joined)
                head = next((x for x in rows if x.get("doc_key") == "mfg_web_store"), None)
                if expected_head_ts and head and str(head.get("updated_at") or "") != expected_head_ts:
                    print(f"NOTE: live store left as the browsers wrote it ({head.get('updated_at')}): a browser synced after the seed pulled it ({expected_head_ts}), so the seed's store write was skipped. It runs again at the next deploy.")
                return joined
            except Exception as exc:
                last_err = str(exc)
        if attempt < 2:
            time.sleep(5)
    raise SystemExit(f"ERROR: remote `mfg_web_store` does not parse after {after} ({last_err}); stop and repair before deploying (ISABICommandReference.md, grep `store chunk repair`).")


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
        pending_fp = BATCH_DIR / "pending_manifest.json"
        try:
            pending = json.loads(pending_fp.read_text(encoding="utf-8"))
        except Exception:
            pending = {}
        store_head_ts = str(pending.get("store_head_ts") or "")
        live_text = assert_live_store_parses(env, "the D1 seed", store_head_ts)
        # The manifest may only say "store written" when the live store now holds exactly what was staged; a skipped
        # swap (browser write, or the stage cleared meanwhile) must make the next delta write the store again.
        if store_head_ts and pending.get("store_content_sha"):
            if hashlib.sha256(live_text.encode("utf-8")).hexdigest() != pending["store_content_sha"]:
                pending["store_content_sha"] = ""
                pending_fp.write_text(json.dumps(pending, ensure_ascii=False), encoding="utf-8")

    # Promote manifest ONLY after 100% of remote D1 batches succeed
    if promote_pending_manifest():
        print(f"Promoted D1 row-hash manifest -> {COMMITTED_MANIFEST_JSON.name}")
    meta = load_edge_meta()
    meta.pop("applied_batch_shas", None)
    meta.pop("applied_batch_run_sig", None)
    meta["last_seeded_db_sha256"] = db_sha
    save_edge_meta(meta)


SEED_KINDS: tuple[str, ...] = ("core", "records", "industries")
SEED_HASH_KEY: dict[str, str] = {
    "core": "coreHash",
    "records": "recordsHash",
    "industries": "industriesHash",
}
DEMO_SEED_HASH_KEY: dict[str, str] = {
    "core": "demoCoreHash",
    "records": "demoRecordsHash",
    "industries": "demoIndustriesHash",
}
_SEED_HEX10_RE = re.compile(r"^[0-9a-f]{10}$")
R2_SEED_RETENTION_KEEP: int = 5
_R2_VERSIONED_SEED_KEY_RE = re.compile(r"^seeds/seed_(core|records|industries)\.([0-9a-f]{10})\.json$")
_R2_NOT_FOUND_RE = re.compile(r"NoSuchKey|specified key does not exist|object not found|\b404\b", re.I)


def _r2_seed_retention_keep() -> int:
    raw = str(os.environ.get("ISABI_R2_SEED_RETENTION_KEEP") or "").strip()
    if not raw:
        return R2_SEED_RETENTION_KEEP
    try:
        val = int(raw)
    except ValueError:
        return R2_SEED_RETENTION_KEEP
    return max(1, min(50, val))


def r2_latest_seed_key(kind: str) -> str:
    if kind not in SEED_KINDS:
        raise ValueError(f"Unsupported seed kind: {kind!r}")
    return f"seeds/seed_{kind}.json"


def r2_versioned_seed_key(kind: str, sha10: str) -> str:
    if kind not in SEED_KINDS:
        raise ValueError(f"Unsupported seed kind: {kind!r}")
    clean = str(sha10 or "").strip().lower()
    if not _SEED_HEX10_RE.fullmatch(clean):
        raise ValueError(f"Invalid 10-hex seed hash: {sha10!r}")
    return f"seeds/seed_{kind}.{clean}.json"


def _record_versioned_seed_sha(meta: dict, kind: str, sha10: str) -> None:
    clean = str(sha10 or "").strip().lower()
    if kind not in SEED_KINDS or not _SEED_HEX10_RE.fullmatch(clean):
        return
    ver_map = dict(meta.get("r2_versioned_seed_shas") or {})
    cur = [
        str(x).strip().lower()
        for x in (ver_map.get(kind) or [])
        if _SEED_HEX10_RE.fullmatch(str(x).strip().lower())
    ]
    cur = [x for x in cur if x != clean]
    cur.append(clean)
    ver_map[kind] = cur[-50:]
    meta["r2_versioned_seed_shas"] = ver_map


def _put_r2_seed_file(env: dict, r2_key: str, src: pathlib.Path) -> None:
    run_wrangler(
        [
            "r2",
            "object",
            "put",
            f"isabi-vault/{r2_key}",
            f"--file={src}",
            "--content-type=application/json",
            "--remote",
        ],
        env,
        check=True,
    )


def _try_get_remote_r2_seed_file(env: dict, r2_key: str, out_path: pathlib.Path) -> tuple[str, str]:
    if out_path.exists():
        out_path.unlink()
    r = run_wrangler(
        [
            "r2",
            "object",
            "get",
            f"isabi-vault/{r2_key}",
            f"--file={out_path}",
            "--remote",
        ],
        env,
        check=False,
    )
    if r.returncode == 0:
        if not out_path.is_file() or out_path.stat().st_size == 0:
            return "empty", "0-byte R2 object"
        return "ok", file_sha256(out_path)
    combined = f"{r.stdout or ''}\n{r.stderr or ''}"
    reason = wrangler_failure_reason(r, 180)
    if _R2_NOT_FOUND_RE.search(combined):
        return "not_found", reason
    return "error", reason


def _parse_seed_manifest_quiet(text: str) -> dict | None:
    marker = "__MFG_SEED_MANIFEST"
    pos = (text or "").find(marker)
    if pos < 0:
        return None
    brace = text.find("{", pos + len(marker))
    if brace < 0:
        return None
    try:
        parsed, _ = json.JSONDecoder().raw_decode(text[brace:])
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def parse_app_seed_manifest(text: str, source_label: str = "app/js/seed_manifest.js") -> dict:
    marker = "__MFG_SEED_MANIFEST"
    pos = (text or "").find(marker)
    if pos < 0:
        print(f"ERROR: `{source_label}` does not contain `__MFG_SEED_MANIFEST`.", file=sys.stderr)
        raise SystemExit(2)
    brace = text.find("{", pos + len(marker))
    if brace < 0:
        print(f"ERROR: `{source_label}` has no JSON object after `__MFG_SEED_MANIFEST`.", file=sys.stderr)
        raise SystemExit(2)
    try:
        parsed, _ = json.JSONDecoder().raw_decode(text[brace:])
    except json.JSONDecodeError as ex:
        print(f"ERROR: `{source_label}` contains invalid JSON in `__MFG_SEED_MANIFEST` ({ex}).", file=sys.stderr)
        raise SystemExit(2) from ex
    if not isinstance(parsed, dict):
        print(f"ERROR: `{source_label}` `__MFG_SEED_MANIFEST` must be a JSON object.", file=sys.stderr)
        raise SystemExit(2)
    for kind in SEED_KINDS:
        hkey = SEED_HASH_KEY[kind]
        hval = str(parsed.get(hkey) or "")
        if not _SEED_HEX10_RE.fullmatch(hval):
            print(f"ERROR: `{source_label}` invalid `{hkey}` ({hval!r}); expected 10-char lowercase hex.", file=sys.stderr)
            raise SystemExit(2)
        api_key = f"api{kind.capitalize()}"
        for ukey in (kind, api_key):
            uval = str(parsed.get(ukey) or "")
            if not uval.endswith(f"?d={hval}"):
                print(
                    f"ERROR: `{source_label}` `{ukey}`={uval!r} must end with `?d={hval}` matching `{hkey}`.",
                    file=sys.stderr,
                )
                raise SystemExit(2)
    for kind in SEED_KINDS:
        dhkey = DEMO_SEED_HASH_KEY[kind]
        dhval = str(parsed.get(dhkey) or "")
        if not _SEED_HEX10_RE.fullmatch(dhval):
            print(f"ERROR: `{source_label}` invalid `{dhkey}` ({dhval!r}); expected 10-char lowercase hex.", file=sys.stderr)
            raise SystemExit(2)
        dukey = f"demo{kind.capitalize()}"
        duval = str(parsed.get(dukey) or "")
        if not duval.endswith(f"?d={dhval}"):
            print(
                f"ERROR: `{source_label}` `{dukey}`={duval!r} must end with `?d={dhval}` matching `{dhkey}`.",
                file=sys.stderr,
            )
            raise SystemExit(2)
    return parsed


def _verify_local_manifest_dir(app_dir: pathlib.Path, *, require_index_parity: bool = True) -> dict:
    man_path = app_dir / "js" / "seed_manifest.js"
    if not man_path.is_file():
        print(f"ERROR: Missing `{man_path}`; sync Command Center bundle before deploying.", file=sys.stderr)
        raise SystemExit(2)
    manifest = parse_app_seed_manifest(man_path.read_text(encoding="utf-8"), str(man_path))
    for kind in SEED_KINDS:
        dhval = str(manifest[DEMO_SEED_HASH_KEY[kind]])
        demo_path = app_dir / "js" / f"seed_demo_{kind}.json"
        if not demo_path.is_file():
            print(f"ERROR: Missing `{demo_path}` referenced by `{DEMO_SEED_HASH_KEY[kind]}={dhval}`.", file=sys.stderr)
            raise SystemExit(2)
        got_demo = file_sha256(demo_path)[:10]
        if got_demo != dhval:
            print(
                f"ERROR: `{demo_path}` SHA-256 ({got_demo}) disagrees with `{DEMO_SEED_HASH_KEY[kind]}` ({dhval}).",
                file=sys.stderr,
            )
            raise SystemExit(2)
    if require_index_parity:
        idx_path = app_dir / "index.html"
        if idx_path.is_file():
            idx_txt = idx_path.read_text(encoding="utf-8", errors="replace")
            core_h = str(manifest["coreHash"])
            for m_d in re.findall(r"js/seed_manifest\.js\?v=[0-9][0-9.]*(?:&amp;|&)d=([0-9a-fA-F]+)", idx_txt):
                if m_d != core_h:
                    print(
                        f"ERROR: `{idx_path}` embeds `seed_manifest.js?v=...&d={m_d}`, which disagrees with `coreHash={core_h}`.",
                        file=sys.stderr,
                    )
                    raise SystemExit(2)
    return manifest


def verify_local_manifest_and_demo_bundle(repo_dir: pathlib.Path | None = None) -> dict:
    root = repo_dir or ISABI_ROOT
    return _verify_local_manifest_dir(root / "app", require_index_parity=True)


def fetch_remote_r2_seed_sha10(env: dict, kind: str) -> str:
    if kind not in SEED_KINDS:
        raise ValueError(f"Unsupported seed kind: {kind!r}")
    with tempfile.TemporaryDirectory(prefix="isabi-r2-seed-chk-") as td:
        chk_path = pathlib.Path(td) / f"seed_{kind}.json"
        r = run_wrangler(
            [
                "r2",
                "object",
                "get",
                f"isabi-vault/seeds/seed_{kind}.json",
                f"--file={chk_path}",
                "--remote",
            ],
            env,
            check=False,
        )
        if r.returncode != 0 or not chk_path.is_file() or chk_path.stat().st_size == 0:
            reason = wrangler_failure_reason(r, 180)
            print(
                f"ERROR: Could not verify live R2 object `isabi-vault/seeds/seed_{kind}.json` ({reason}); "
                "refusing to deploy Pages without confirming private R2 seed parity.",
                file=sys.stderr,
            )
            raise SystemExit(2)
        return file_sha256(chk_path)[:10]


def _read_origin_seed_manifest(repo_dir: pathlib.Path, env: dict) -> dict:
    git_bin = shutil.which("git", path=env.get("PATH")) or "git"
    blob = _git_blob_text(
        repo_dir,
        "refs/remotes/origin/main:app/js/seed_manifest.js",
        git_bin=git_bin,
        git_env=env,
    )
    if not blob:
        return {}
    try:
        return parse_app_seed_manifest(blob, "origin/main:app/js/seed_manifest.js")
    except SystemExit:
        return {}


def _find_matching_local_seed_file(
    kind: str,
    want: str,
    root: pathlib.Path,
    app_js_dir: pathlib.Path,
) -> tuple[pathlib.Path, str] | tuple[None, None]:
    candidates: list[pathlib.Path] = []
    if app_js_dir.is_dir():
        candidates.append(app_js_dir / f"seed_{kind}.json")
    site_cand = root / "app" / "js" / f"seed_{kind}.json"
    if site_cand not in candidates:
        candidates.append(site_cand)
    for cand in candidates:
        if cand.is_file() and cand.stat().st_size > 0:
            sha = file_sha256(cand)
            if sha[:10] == want:
                return cand, sha
    return None, None


def _sync_or_verify_r2_seeds_for_pages_only(
    env: dict,
    repo_dir: pathlib.Path | None = None,
    *,
    auto_upload_local: bool = False,
) -> tuple[dict, bool]:
    root = repo_dir or ISABI_ROOT
    manifest = verify_local_manifest_and_demo_bundle(root)
    origin_manifest = _read_origin_seed_manifest(root, env)
    meta = load_edge_meta()
    r2_shas = dict(meta.get("r2_seed_shas") or {})

    kinds_to_verify: list[tuple[str, str, str, bool]] = []
    for kind in SEED_KINDS:
        hkey = SEED_HASH_KEY[kind]
        want = str(manifest[hkey])
        meta_sha = str(r2_shas.get(kind) or "")
        if hkey not in origin_manifest:
            kinds_to_verify.append((kind, want, "origin/main manifest unavailable", False))
        elif want != str(origin_manifest.get(hkey) or ""):
            kinds_to_verify.append((kind, want, f"{hkey} changed vs origin/main ({origin_manifest.get(hkey)} -> {want})", True))
        elif meta_sha and meta_sha[:10] != want:
            kinds_to_verify.append((kind, want, f"local edge meta `r2_seed_shas[{kind!r}]` ({meta_sha[:10]}) != {want}", False))

    if not kinds_to_verify:
        print(
            "OK: Private seed manifest hashes match origin/main "
            f"(core={manifest['coreHash']}, records={manifest['recordsHash']}, industries={manifest['industriesHash']}); "
            "R2 parity assumed."
        )
        return manifest, False

    if not auto_upload_local:
        for kind, want, reason, _changed in kinds_to_verify:
            got = fetch_remote_r2_seed_sha10(env, kind)
            if got != want:
                print(
                    f"ERROR: R2 private seed mismatch for `isabi-vault/seeds/seed_{kind}.json`: "
                    f"manifest expects `{want}` ({reason}), but live R2 holds `{got}`. "
                    "Upload the matching private seeds first with `python build/deploy_cloudflare.py` "
                    "(without `--pages-only`) or `python build/release_data_only.py r2`.",
                    file=sys.stderr,
                )
                raise SystemExit(2)
        print(
            "OK: Live R2 private seed hash parity verified for "
            + ", ".join(f"{kind}={want}" for kind, want, _, _ in kinds_to_verify)
            + "."
        )
        return manifest, True

    app_js_dir = _resolve_app_js_dir(root)
    with tempfile.TemporaryDirectory(prefix="isabi-r2-pages-sync-") as td:
        td_path = pathlib.Path(td)
        planned: list[tuple[str, str, pathlib.Path | None, str, str]] = []
        # Pass 1: resolve and validate every changed/unverified kind BEFORE any R2 write.
        for kind, want, reason, changed_vs_origin in kinds_to_verify:
            hkey = SEED_HASH_KEY[kind]
            if changed_vs_origin:
                local_src, local_sha = _find_matching_local_seed_file(kind, want, root, app_js_dir)
                if local_src is not None and local_sha:
                    planned.append(("upload_local", kind, local_src, local_sha, want))
                    continue
                vkey = r2_versioned_seed_key(kind, want)
                ver_tmp = td_path / f"ver_{kind}_{want}.json"
                st_ver, val_ver = _try_get_remote_r2_seed_file(env, vkey, ver_tmp)
                if st_ver == "ok":
                    if val_ver[:10] != want:
                        print(
                            f"ERROR: R2 versioned seed `isabi-vault/{vkey}` SHA-256 ({val_ver[:10]}) "
                            f"disagrees with manifest `{hkey}={want}`.",
                            file=sys.stderr,
                        )
                        raise SystemExit(2)
                    planned.append(("promote_latest", kind, ver_tmp, val_ver, want))
                    continue
                if st_ver != "not_found":
                    print(
                        f"ERROR: Could not verify live R2 object `isabi-vault/{vkey}` ({val_ver}); "
                        "refusing to deploy Pages without confirming private R2 seed parity.",
                        file=sys.stderr,
                    )
                    raise SystemExit(2)
                lkey = r2_latest_seed_key(kind)
                lat_tmp = td_path / f"lat_{kind}.json"
                st_lat, val_lat = _try_get_remote_r2_seed_file(env, lkey, lat_tmp)
                if st_lat != "ok":
                    print(
                        f"ERROR: Could not verify live R2 object `isabi-vault/{lkey}` ({val_lat}); "
                        "refusing to deploy Pages without confirming private R2 seed parity.",
                        file=sys.stderr,
                    )
                    raise SystemExit(2)
                if val_lat[:10] != want:
                    print(
                        f"ERROR: R2 private seed mismatch for `isabi-vault/{lkey}`: "
                        f"manifest expects `{want}` ({reason}), but live R2 holds `{val_lat[:10]}`. "
                        "Upload the matching private seeds first with `python build/deploy_cloudflare.py` "
                        "(without `--pages-only`), `python build/deploy_cloudflare.py --stage-r2-seeds`, or `python build/release_data_only.py r2`.",
                        file=sys.stderr,
                    )
                    raise SystemExit(2)
                planned.append(("backfill_versioned", kind, lat_tmp, val_lat, want))
            else:
                got = fetch_remote_r2_seed_sha10(env, kind)
                if got != want:
                    print(
                        f"ERROR: R2 private seed mismatch for `isabi-vault/seeds/seed_{kind}.json`: "
                        f"manifest expects `{want}` ({reason}), but live R2 holds `{got}`. "
                        "Upload the matching private seeds first with `python build/deploy_cloudflare.py` "
                        "(without `--pages-only`) or `python build/release_data_only.py r2`.",
                        file=sys.stderr,
                    )
                    raise SystemExit(2)
                planned.append(("verified_only", kind, None, "", want))

        # Pass 2: perform R2 uploads only after all kinds in Pass 1 passed.
        for action, kind, src, full_sha, want in planned:
            vkey = r2_versioned_seed_key(kind, want)
            lkey = r2_latest_seed_key(kind)
            if action == "upload_local" and src is not None:
                # changed_vs_origin was True in Pass 1: never let stale local edge_meta skip uploading R2 seeds
                # (e.g. rollback core_v4 -> core_v3 on a PC whose edge_meta still remembers core_v3).
                print(f"Uploading content-addressed R2 seed `{vkey}` ({src.stat().st_size:,} B) to `isabi-vault`...")
                _put_r2_seed_file(env, vkey, src)
                _record_versioned_seed_sha(meta, kind, want)
                print(f"Updating R2 latest pointer `{lkey}` ({want}) in `isabi-vault`...")
                _put_r2_seed_file(env, lkey, src)
                r2_shas[kind] = full_sha
                meta["r2_seed_shas"] = r2_shas
                save_edge_meta(meta)
            elif action == "promote_latest" and src is not None:
                print(f"Promoting pre-staged R2 seed `{vkey}` -> `{lkey}` ({want})...")
                _put_r2_seed_file(env, lkey, src)
                r2_shas[kind] = full_sha
                meta["r2_seed_shas"] = r2_shas
                _record_versioned_seed_sha(meta, kind, want)
                save_edge_meta(meta)
            elif action == "backfill_versioned" and src is not None:
                # Pass 1 confirmed vkey was missing (404) remotely: upload unconditionally even if edge_meta listed it.
                print(f"Backfilling content-addressed R2 seed `{vkey}` from verified `{lkey}`...")
                _put_r2_seed_file(env, vkey, src)
                _record_versioned_seed_sha(meta, kind, want)
                r2_shas[kind] = full_sha
                meta["r2_seed_shas"] = r2_shas
                save_edge_meta(meta)

    print(
        "OK: Live R2 private seed parity synced/verified for "
        + ", ".join(f"{kind}={want}" for kind, want, _, _ in kinds_to_verify)
        + "."
    )
    return manifest, True


def verify_r2_seed_parity_for_pages_only(
    env: dict,
    repo_dir: pathlib.Path | None = None,
    *,
    auto_upload_local: bool = False,
) -> dict:
    manifest, _did = _sync_or_verify_r2_seeds_for_pages_only(
        env,
        repo_dir,
        auto_upload_local=auto_upload_local,
    )
    return manifest


def apply_d1_schema_for_pages_only(env: dict) -> None:
    """A code deploy from a PC applies the idempotent D1 schema first, every time, exactly as the push-to-main
    workflow did on each run (owner 2026-11-26: the leader's PC deploys, not GitHub Actions). Every time, and not
    "when it changed": what the remote database holds cannot be told from this checkout (exports/ is per checkout,
    and a batch already pushed to main shows no difference), and Edge functions must never go live ahead of a table
    or an index they read. The file only creates what is missing (CREATE ... IF NOT EXISTS, kept so by
    verify_deploy_preflight.py); a new column on an existing table is added by functions/_lib/d1_store.js, never
    here. A failure stops the deploy before anything is live."""
    if not SCHEMA_SQL.is_file():
        print(f"ERROR: {SCHEMA_SQL} is missing; refusing to deploy Edge functions without the D1 schema they expect.",
              file=sys.stderr)
        raise SystemExit(2)
    print("Applying idempotent D1 schema (migrations/0001_schema.sql) to remote D1 `isabi-ledger`...")
    try:
        # retry=True: the file is idempotent by design (it ran on every push-to-main deploy), so a second run is safe.
        run_wrangler(["d1", "execute", "isabi-ledger", "--remote", f"--file={SCHEMA_SQL}", "-y"], env, check=True, retry=True)
    except subprocess.CalledProcessError as exc:
        reason = wrangler_failure_reason(exc)
        print(f"ERROR: could not apply the D1 schema ({reason}); nothing was deployed. Cloudflare unavailable: run the "
              "same command again. A sign-in or permission error: fix that first (wrangler whoami).", file=sys.stderr)
        raise SystemExit(2) from None


def _resolve_app_js_dir(repo_dir: pathlib.Path | None = None) -> pathlib.Path:
    root = repo_dir or ISABI_ROOT
    env_src = (os.environ.get("ISABI_APP_SRC") or "").strip()
    if env_src:
        return pathlib.Path(env_src) / "js"
    for name in ("isabi-app", "mfg-web"):
        cand = root.parent / name / "js"
        if cand.is_dir():
            return cand
    return root.parent / "isabi-app" / "js"


def _validate_local_private_seed_hashes_if_present(
    manifest: dict,
    repo_dir: pathlib.Path | None = None,
) -> pathlib.Path:
    root = repo_dir or ISABI_ROOT
    app_js_dir = _resolve_app_js_dir(root)
    if not app_js_dir.is_dir():
        return app_js_dir
    for kind in SEED_KINDS:
        hkey = SEED_HASH_KEY[kind]
        want = str(manifest[hkey])
        src = app_js_dir / f"seed_{kind}.json"
        if src.is_file():
            sha = file_sha256(src)
            if sha[:10] != want:
                print(
                    f"ERROR: Local private seed `{src}` ({sha[:10]}) disagrees with `app/js/seed_manifest.js` "
                    f"`{hkey}={want}`. Run `python build/sync_app.py` (or `release_data_only.py commit`) first.",
                    file=sys.stderr,
                )
                raise SystemExit(2)
    return app_js_dir


def upload_r2_private_seeds(env: dict, r2_enabled: bool, *, force_r2_seeds: bool = False):
    manifest = verify_local_manifest_and_demo_bundle(ISABI_ROOT)
    if not r2_enabled:
        print("ERROR: R2 bucket `isabi-vault` unavailable; refusing to deploy Pages without private R2 seeds.", file=sys.stderr)
        raise SystemExit(2)
    origin_manifest = _read_origin_seed_manifest(ISABI_ROOT, env)
    app_js_dir = _validate_local_private_seed_hashes_if_present(manifest, ISABI_ROOT)
    meta = load_edge_meta()
    r2_shas = dict(meta.get("r2_seed_shas") or {})
    r2_ver_shas = {
        k: list(v)
        for k, v in (meta.get("r2_versioned_seed_shas") or {}).items()
        if k in SEED_KINDS and isinstance(v, list)
    }
    force_upload = force_r2_seeds

    with tempfile.TemporaryDirectory(prefix="isabi-r2-full-sync-") as td:
        td_path = pathlib.Path(td)
        # Pass 1: validate all 3 seed kinds (local byte hashes or missing-local R2 snapshots) before any remote R2 write.
        planned_actions: list[tuple[str, str, pathlib.Path | None, str, str]] = []
        for kind in SEED_KINDS:
            hkey = SEED_HASH_KEY[kind]
            want = str(manifest[hkey])
            orig_h = str(origin_manifest.get(hkey) or "")
            src = (app_js_dir / f"seed_{kind}.json") if app_js_dir.is_dir() else None
            if src is not None and src.is_file():
                sha = file_sha256(src)
                if sha[:10] != want:
                    print(
                        f"ERROR: Local private seed `{src}` ({sha[:10]}) disagrees with `app/js/seed_manifest.js` "
                        f"`{hkey}={want}`. Run `python build/sync_app.py` (or `release_data_only.py commit`) first.",
                        file=sys.stderr,
                    )
                    raise SystemExit(2)
                if not force_upload and orig_h == want and r2_shas.get(kind) == sha and want in r2_ver_shas.get(kind, []):
                    planned_actions.append(("skip_unchanged", kind, src, sha, want))
                else:
                    planned_actions.append(("upload", kind, src, sha, want))
            else:
                meta_sha = str(r2_shas.get(kind) or "")
                if want != orig_h or (meta_sha and meta_sha[:10] != want):
                    vkey = r2_versioned_seed_key(kind, want)
                    ver_tmp = td_path / f"ver_{kind}_{want}.json"
                    st_ver, val_ver = _try_get_remote_r2_seed_file(env, vkey, ver_tmp)
                    if st_ver == "ok":
                        if val_ver[:10] != want:
                            print(
                                f"ERROR: R2 versioned seed `isabi-vault/{vkey}` ({val_ver[:10]}) disagrees with `{hkey}={want}`.",
                                file=sys.stderr,
                            )
                            raise SystemExit(2)
                        planned_actions.append(("promote_latest", kind, ver_tmp, val_ver, want))
                    elif st_ver != "not_found":
                        print(
                            f"ERROR: Could not verify live R2 object `isabi-vault/{vkey}` ({val_ver}); "
                            "refusing to deploy Pages without confirming private R2 seed parity.",
                            file=sys.stderr,
                        )
                        raise SystemExit(2)
                    else:
                        lkey = r2_latest_seed_key(kind)
                        lat_tmp = td_path / f"lat_{kind}.json"
                        st_lat, val_lat = _try_get_remote_r2_seed_file(env, lkey, lat_tmp)
                        if st_lat != "ok":
                            print(
                                f"ERROR: Missing local `{app_js_dir / f'seed_{kind}.json'}` and could not verify live R2 "
                                f"`isabi-vault/{lkey}` ({val_lat}); upload matching seeds before deploying.",
                                file=sys.stderr,
                            )
                            raise SystemExit(2)
                        if val_lat[:10] != want:
                            print(
                                f"ERROR: Missing local `{app_js_dir / f'seed_{kind}.json'}` and live R2 `isabi-vault/{lkey}` "
                                f"holds `{val_lat[:10]}` instead of manifest `{hkey}={want}`; upload matching seeds before deploying.",
                                file=sys.stderr,
                            )
                            raise SystemExit(2)
                        planned_actions.append(("backfill_versioned", kind, lat_tmp, val_lat, want))
                else:
                    planned_actions.append(("skip_absent_unchanged", kind, None, "", want))

        # Pass 2: perform R2 uploads only after all 3 kinds validated cleanly.
        for action, kind, src, sha, want in planned_actions:
            vkey = r2_versioned_seed_key(kind, want)
            lkey = r2_latest_seed_key(kind)
            orig_h = str(origin_manifest.get(SEED_HASH_KEY[kind]) or "")
            if action == "skip_unchanged":
                print(f"R2 private seed `{lkey}` & `{vkey}` unchanged (0 uploads).")
            elif action == "skip_absent_unchanged":
                print(f"WARN: `{app_js_dir}` seed `{kind}` absent locally; manifest matches origin/main (`{want}`), skipping upload.")
            elif action == "promote_latest" and src is not None:
                print(f"Promoting pre-staged R2 seed `{vkey}` -> `{lkey}` ({want})...")
                _put_r2_seed_file(env, lkey, src)
                r2_shas[kind] = sha
                meta["r2_seed_shas"] = r2_shas
                _record_versioned_seed_sha(meta, kind, want)
                save_edge_meta(meta)
            elif action == "backfill_versioned" and src is not None:
                print(f"Backfilling content-addressed R2 seed `{vkey}` from verified `{lkey}`...")
                _put_r2_seed_file(env, vkey, src)
                _record_versioned_seed_sha(meta, kind, want)
                r2_ver_shas[kind] = list(meta["r2_versioned_seed_shas"][kind])
                r2_shas[kind] = sha
                meta["r2_seed_shas"] = r2_shas
                save_edge_meta(meta)
            elif action == "upload" and src is not None:
                need_ver = force_upload or orig_h != want or want not in r2_ver_shas.get(kind, [])
                need_lat = force_upload or orig_h != want or r2_shas.get(kind) != sha
                if need_ver:
                    print(f"Uploading content-addressed R2 seed `{vkey}` ({src.stat().st_size:,} B) to R2 `isabi-vault`...")
                    _put_r2_seed_file(env, vkey, src)
                    _record_versioned_seed_sha(meta, kind, want)
                    r2_ver_shas[kind] = list(meta["r2_versioned_seed_shas"][kind])
                if need_lat:
                    print(f"Uploading private operational seed `{lkey}` ({src.stat().st_size:,} B) to R2 `isabi-vault`...")
                    _put_r2_seed_file(env, lkey, src)
                    r2_shas[kind] = sha
                    meta["r2_seed_shas"] = r2_shas
                save_edge_meta(meta)


def stage_r2_private_seeds(
    env: dict,
    *,
    force_r2_seeds: bool = False,
    repo_dir: pathlib.Path | None = None,
) -> dict:
    """Lock-free upload of immutable `seeds/seed_<kind>.<sha10>.json` objects without touching `seeds/seed_<kind>.json`."""
    root = repo_dir or ISABI_ROOT
    app_js_dir = _resolve_app_js_dir(root)
    src_app_dir = app_js_dir.parent if app_js_dir.is_dir() else (root / "app")
    if (src_app_dir / "js" / "seed_manifest.js").is_file():
        manifest = _verify_local_manifest_dir(src_app_dir, require_index_parity=False)
    else:
        manifest = verify_local_manifest_and_demo_bundle(root)

    origin_manifest = _read_origin_seed_manifest(root, env)
    meta = load_edge_meta()
    r2_ver_shas = {
        k: list(v)
        for k, v in (meta.get("r2_versioned_seed_shas") or {}).items()
        if k in SEED_KINDS and isinstance(v, list)
    }

    planned: list[tuple[str, str, pathlib.Path, str]] = []
    for kind in SEED_KINDS:
        hkey = SEED_HASH_KEY[kind]
        want = str(manifest[hkey])
        orig_h = str(origin_manifest.get(hkey) or "")
        src = (app_js_dir / f"seed_{kind}.json") if app_js_dir.is_dir() else None
        if src is None or not src.is_file():
            continue
        sha = file_sha256(src)
        if sha[:10] != want:
            print(
                f"ERROR: Local private seed `{src}` ({sha[:10]}) disagrees with `seed_manifest.js` "
                f"`{hkey}={want}`. Rebuild seeds before staging.",
                file=sys.stderr,
            )
            raise SystemExit(2)
        if not force_r2_seeds and orig_h == want and want in r2_ver_shas.get(kind, []):
            planned.append(("skip", kind, src, want))
        else:
            planned.append(("upload", kind, src, want))

    if not planned:
        print(
            f"ERROR: No local `seed_*.json` files found in `{app_js_dir}` to stage into R2.",
            file=sys.stderr,
        )
        raise SystemExit(2)

    for action, kind, src, want in planned:
        vkey = r2_versioned_seed_key(kind, want)
        if action == "skip":
            print(f"R2 versioned seed `{vkey}` already staged (0 uploads).")
            continue
        print(f"Staging immutable R2 seed `{vkey}` ({src.stat().st_size:,} B) to `isabi-vault`...")
        _put_r2_seed_file(env, vkey, src)
        _record_versioned_seed_sha(meta, kind, want)
        save_edge_meta(meta)

    return manifest


def _scan_wt_seed_manifests(
    repo: pathlib.Path,
    rel_path: str,
    git_bin: str,
    git_env: dict,
) -> list[dict]:
    if not (repo / ".git").exists():
        return []
    r_refs = _run_git_cmd(
        ["for-each-ref", "--format=%(refname)", "refs/remotes/origin/wt/"],
        repo,
        git_bin=git_bin,
        git_env=git_env,
        timeout=15,
    )
    if r_refs.returncode != 0:
        return []
    refs = [ln.strip() for ln in (r_refs.stdout or "").splitlines() if ln.strip()]
    if not refs:
        return []
    queries = "".join(f"{ref}:{rel_path}\n" for ref in refs).encode("utf-8")
    try:
        r_batch = subprocess.run(
            [git_bin, "cat-file", "--batch"],
            cwd=str(repo),
            env=git_env,
            input=queries,
            capture_output=True,
            timeout=20,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return []
    if r_batch.returncode != 0 or not r_batch.stdout:
        return []
    raw = r_batch.stdout
    pos = 0
    total = len(raw)
    manifests: list[dict] = []
    while pos < total:
        nl = raw.find(b"\n", pos)
        if nl < 0:
            break
        hdr = raw[pos:nl].decode("utf-8", errors="replace").strip()
        pos = nl + 1
        parts = hdr.split()
        if len(parts) >= 2 and parts[1] == "missing":
            continue
        if len(parts) >= 3 and parts[1] == "blob":
            try:
                sz = int(parts[2])
            except ValueError:
                break
            blob = raw[pos:pos + sz]
            pos += sz
            if pos < total and raw[pos:pos + 1] == b"\n":
                pos += 1
            parsed = _parse_seed_manifest_quiet(blob.decode("utf-8", errors="replace"))
            if parsed is not None:
                manifests.append(parsed)
    return manifests


def collect_protected_r2_seed_hashes(
    manifest: dict | None,
    repo_dir: pathlib.Path | None = None,
    env: dict | None = None,
    *,
    include_live: bool = True,
) -> dict[str, set[str]]:
    root = repo_dir or ISABI_ROOT
    git_env = env or build_env()
    git_bin = shutil.which("git", path=git_env.get("PATH")) or "git"
    protected: dict[str, set[str]] = {k: set() for k in SEED_KINDS}

    def _add_manifest(man: dict | None) -> None:
        if not isinstance(man, dict):
            return
        for kind in SEED_KINDS:
            hv = str(man.get(SEED_HASH_KEY[kind]) or "").strip().lower()
            if _SEED_HEX10_RE.fullmatch(hv):
                protected[kind].add(hv)

    _add_manifest(manifest)
    _add_manifest(_read_origin_seed_manifest(root, git_env))
    if include_live:
        try:
            req = urllib.request.Request(
                f"https://isabisystems.com/app/js/seed_manifest.js?t={int(time.time())}",
                headers={"User-Agent": "ISABI-Deploy/1.0", "Cache-Control": "no-cache"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                live_txt = resp.read().decode("utf-8", errors="replace")
            _add_manifest(_parse_seed_manifest_quiet(live_txt))
        except Exception:
            pass
    for wt_man in _scan_wt_seed_manifests(root, "app/js/seed_manifest.js", git_bin, git_env):
        _add_manifest(wt_man)
    app_repos: list[pathlib.Path] = []
    app_repo = resolve_app_repo_dir(root)
    if app_repo is not None:
        app_repos.append(app_repo)
    env_app_raw = str((git_env.get("ISABI_APP_SRC") if git_env else None) or os.environ.get("ISABI_APP_SRC") or "").strip()
    if env_app_raw:
        env_app_repo = resolve_app_repo_dir(root, pathlib.Path(env_app_raw))
        if env_app_repo is not None and env_app_repo not in app_repos:
            app_repos.append(env_app_repo)
    for cur_app_repo in app_repos:
        for wt_man in _scan_wt_seed_manifests(cur_app_repo, "js/seed_manifest.js", git_bin, git_env):
            _add_manifest(wt_man)
    return protected


def list_r2_seed_objects(acct_id: str, token: str, prefix: str = "seeds/") -> list[dict] | None:
    if not acct_id or not token:
        return None
    objects: list[dict] = []
    cursor = ""
    seen_cursors: set[str] = set()
    for _page in range(20):
        qs = f"prefix={urllib.parse.quote(prefix, safe='/')}"
        if cursor:
            qs += f"&cursor={urllib.parse.quote(cursor, safe='')}"
        res = cf_api("GET", f"/accounts/{acct_id}/r2/buckets/isabi-vault/objects?{qs}", token)
        if not isinstance(res, dict) or not res.get("success") or not isinstance(res.get("result"), list):
            return None
        objects.extend(item for item in res["result"] if isinstance(item, dict))
        info = res.get("result_info") or {}
        truncated = bool(isinstance(info, dict) and (info.get("is_truncated") or info.get("truncated")))
        if not truncated:
            return objects
        next_cursor = str(info.get("cursor") or "")
        if not next_cursor or next_cursor in seen_cursors:
            return None
        seen_cursors.add(next_cursor)
        cursor = next_cursor
    return None


def _parse_r2_obj_ts(obj: dict) -> dt.datetime | None:
    raw = str(obj.get("last_modified") or obj.get("uploaded") or "").strip()
    if not raw:
        return None
    try:
        parsed = dt.datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc)


def prune_old_r2_private_seeds(
    env: dict,
    acct_id: str,
    *,
    manifest: dict | None = None,
    repo_dir: pathlib.Path | None = None,
    keep: int | None = None,
    include_live: bool = True,
) -> dict[str, list[str]]:
    """Best-effort retention prune of older `seeds/seed_<kind>.<sha10>.json` objects after deploy."""
    deleted: dict[str, list[str]] = {}
    try:
        eff_acct = str(acct_id or os.environ.get("CLOUDFLARE_ACCOUNT_ID") or "").strip()
        token = read_wrangler_oauth_token()
        if not eff_acct or not token:
            return deleted
        objs = list_r2_seed_objects(eff_acct, token, prefix="seeds/")
        if objs is None:
            print("WARN: Skipping R2 seed retention prune (object listing incomplete or unavailable).")
            return deleted
        eff_keep = max(1, min(50, int(keep))) if keep is not None else _r2_seed_retention_keep()
        protected = collect_protected_r2_seed_hashes(manifest, repo_dir=repo_dir, env=env, include_live=include_live)

        grouped: dict[str, list[tuple[dt.datetime, str, str]]] = {k: [] for k in SEED_KINDS}
        bad_ts_kinds: set[str] = set()
        for obj in objs:
            key = str(obj.get("key") or "")
            m = _R2_VERSIONED_SEED_KEY_RE.fullmatch(key)
            if not m:
                continue
            kind, sha10 = m.group(1), m.group(2)
            ts = _parse_r2_obj_ts(obj)
            if ts is None:
                bad_ts_kinds.add(kind)
                continue
            grouped[kind].append((ts, key, sha10))

        meta = load_edge_meta()
        ver_map = dict(meta.get("r2_versioned_seed_shas") or {})
        meta_dirty = False
        for kind in SEED_KINDS:
            if kind in bad_ts_kinds:
                print(f"WARN: Skipping R2 seed retention prune for `{kind}` (missing object timestamp).")
                continue
            items = sorted(grouped[kind], key=lambda item: (item[0], item[1]), reverse=True)
            if len(items) <= eff_keep:
                continue
            keep_hashes = set(protected.get(kind) or ())
            for _ts, _key, sha10 in items[:eff_keep]:
                keep_hashes.add(sha10)
            for _ts, key, sha10 in items[eff_keep:]:
                if sha10 in keep_hashes:
                    continue
                r_del = run_wrangler(
                    ["r2", "object", "delete", f"isabi-vault/{key}", "--remote", "-y"],
                    env,
                    check=False,
                )
                if r_del.returncode == 0:
                    deleted.setdefault(kind, []).append(key)
                    cur_list = [str(x).strip().lower() for x in (ver_map.get(kind) or []) if str(x).strip().lower() != sha10]
                    if cur_list != (ver_map.get(kind) or []):
                        ver_map[kind] = cur_list
                        meta_dirty = True
                else:
                    print(f"WARN: Failed to delete old R2 seed `{key}` ({wrangler_failure_reason(r_del, 120)}).")
        if meta_dirty:
            meta["r2_versioned_seed_shas"] = ver_map
            save_edge_meta(meta)
        total_deleted = sum(len(v) for v in deleted.values())
        if total_deleted:
            print(
                f"Pruned {total_deleted} old versioned R2 seed object(s) (keep={eff_keep}/kind + protected): "
                + ", ".join(k for vals in deleted.values() for k in vals)
            )
    except Exception as exc:
        print(f"WARN: R2 seed retention prune skipped ({exc}).")
    return deleted


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
    kv_head = RSR.head_row_of(kv_rows)
    if kv_head is not None and RSR.is_rows_head(str(kv_head.get("payload_json") or "")):
        # The rows are the master: the Edge strips PIN and face fields from the seats on every save it writes, and a
        # document swapped in here would make the document the master again.
        print("Remote D1 store PIN scrub: the store is kept as rows (the Edge strips PIN and face fields on every save); nothing to scrub here.")
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
    head_row = next((r for r in kv_rows if r.get("doc_key") == "mfg_web_store"), kv_rows[0])
    upd_at = str(head_row.get("updated_at") or "")
    upd_by = str(head_row.get("updated_by") or "security_scrub")
    # 2026-11-13 incident: this used to run one `wrangler d1 execute` per chunk (40+ calls, about 2 minutes) while
    # browsers kept syncing. A browser write landed half-way, the rest of the chunks then overwrote its tail and the
    # live store no longer parsed. Now the same staged swap as the D1 seed (export_d1_seed.build_store_kv_swap): the
    # cleaned document is staged under `mfg_web_store__next_NNNN` (no reader joins those), then ONE statement swaps it
    # in, only while the head still carries the `updated_at` read above. Nothing relies on a file being applied whole;
    # if a browser wrote in between, the swap is a no-op and the scrub simply runs again at the next deploy.
    run_id = new_store_run_id()
    stage = [stmt for _, stmt in build_store_kv_stage_stmts(clean_str, upd_at, upd_by, run_id)]
    with tempfile.TemporaryDirectory(prefix="isabi-d1-kv-") as td:
        fp = pathlib.Path(td) / "kv_scrub_stage.sql"
        fp.write_bytes("".join(s + ";\n" for s in [build_store_kv_stale_stage_clear()] + stage).encode("utf-8"))
        run_wrangler(["d1", "execute", "isabi-ledger", "--remote", f"--file={fp}"], env, check=True)
        fp2 = pathlib.Path(td) / "kv_scrub_swap.sql"
        fp2.write_bytes((build_store_kv_swap(len(stage) - 1, upd_at, run_id) + ";\n" + build_store_kv_stage_clear(run_id) + ";\n").encode("utf-8"))
        run_wrangler(["d1", "execute", "isabi-ledger", "--remote", f"--file={fp2}"], env, check=True)
    # Read back: the parts must join into valid JSON whether or not the guard let the scrub through.
    assert_live_store_parses(env, "the PIN scrub", upd_at)
    print(f"Scrubbed legacy PIN / face fields from remote D1 `edge_kv_store` with one guarded swap ({len(stage)} chunk(s); no-op if a browser wrote meanwhile).")


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
    """Idempotently ensures the Cloudflare Email Routing destination and the forwarding rule alias -> destination.

    Both addresses come from the environment (ISABI_EMAIL_ROUTING_DEST, ISABI_EMAIL_ROUTING_ALIAS), set by the owner on
    the PC that should check the routing; no address is kept in the repo. Unset: the step is skipped (the routing set up
    in v19.6.245 stays as it is in Cloudflare)."""
    if not token or not acct_id or not zid:
        return
    dest_email = (os.environ.get("ISABI_EMAIL_ROUTING_DEST") or "").strip().lower()
    custom_email = (os.environ.get("ISABI_EMAIL_ROUTING_ALIAS") or "").strip().lower()
    if not dest_email or not custom_email:
        print("Email Routing check skipped (set ISABI_EMAIL_ROUTING_DEST and ISABI_EMAIL_ROUTING_ALIAS to run it).")
        return

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

    # 3. Upsert active forwarding rule alias -> destination
    rules_res = cf_api("GET", f"/zones/{zid}/email/routing/rules?per_page=50", token)
    rules = (rules_res.get("result") or []) if rules_res.get("success") else []
    rule_payload = {
        "name": f"Isabi Systems Principal Inbox ({custom_email})",
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
        help="The code release a batch leader runs from its PC: auto-syncs/verifies private R2 seeds when changed, applies idempotent D1 schema, deploys Pages + Edge Functions bundle, prunes old versioned R2 seeds, and runs parity/IndexNow.",
    )
    modes.add_argument(
        "--stage-r2-seeds",
        action="store_true",
        help="Lock-free upload of immutable content-addressed `seeds/seed_<kind>.<sha10>.json` objects from local `isabi-app/js/` without modifying `seeds/seed_<kind>.json` or deploying Pages.",
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
    opts.add_argument("--rotate-secrets", action="store_true", help="Re-upload Edge secrets even if SHA-256 is unchanged, and REPLACE the live signing secret ISABI_JWT_SECRET (signs every user and tablet out). Without it the signing secret is uploaded only when the project has none.")
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
    opts.add_argument(
        "--allow-claimed-version",
        action="store_true",
        help="Allow deploying even when app/sw.js is unbumped or matches another session's unshipped wt/* claim or release lock.",
    )
    opts.add_argument(
        "--no-release-lock",
        action="store_true",
        help="Deploy without holding the release lock (build/release_lock.py); only when the owner says so.",
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
    on_abort=None,
) -> int:
    """Verify local HEAD includes origin/main so an unpulled checkout cannot roll back live deploys."""
    try:
        return _check_checkout_not_behind_origin_impl(
            repo_dir,
            allow_behind_origin=allow_behind_origin,
            fetch=fetch,
            env=env,
        )
    except BaseException:
        if on_abort is not None:
            on_abort()
        raise


def _check_checkout_not_behind_origin_impl(
    repo_dir: pathlib.Path = ISABI_ROOT,
    *,
    allow_behind_origin: bool = False,
    fetch: bool = True,
    env: dict | None = None,
) -> int:
    """Implementation of checkout freshness check against origin/main."""
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
                timeout=20,
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


def parse_shell_version(raw: str | None) -> tuple[int, ...] | None:
    """Parse an ISABI Command Center shell version (`isabi-mfg-v19.6.346` or `v19.6.346`) into ints."""
    if not raw:
        return None
    txt = str(raw)
    m = re.search(r"""\bSHELL_CACHE\s*=\s*['"]isabi-mfg-v(\d+(?:\.\d+)*)""", txt)
    if not m:
        m = re.search(r"""isabi-mfg-v(\d+(?:\.\d+)*)""", txt)
    if not m:
        m = re.fullmatch(r"""\s*v?(\d+(?:\.\d+)+)\s*""", txt)
    if not m:
        return None
    try:
        return tuple(int(part) for part in m.group(1).split("."))
    except ValueError:
        return None


def format_shell_version(ver: tuple[int, ...] | None) -> str:
    """Render a parsed version tuple as `v<major>.<minor>.<patch>`."""
    if not ver:
        return ""
    return "v" + ".".join(str(part) for part in ver)


def suggest_next_shell_version(main_ver: tuple[int, ...] | None, claims: list[dict] | None = None) -> str:
    """Return the lowest free `v<major>.<minor>.<patch>` strictly above `origin/main` and all claims."""
    peak = main_ver
    for item in claims or ():
        v = item.get("version_tuple") or parse_shell_version(item.get("version"))
        if v is not None and (peak is None or v > peak):
            peak = v
    if not peak:
        return ""
    return format_shell_version((*peak[:-1], peak[-1] + 1))


def resolve_app_repo_dir(
    repo_dir: pathlib.Path = ISABI_ROOT,
    app_repo_dir: pathlib.Path | None = None,
) -> pathlib.Path | None:
    """Locate the sibling `isabi-app` checkout/worktree using `.git` existence (file in worktrees)."""
    if app_repo_dir is not None:
        return app_repo_dir if (app_repo_dir / ".git").exists() else None
    sibling = repo_dir.parent / "isabi-app"
    if (sibling / ".git").exists():
        return sibling
    try:
        same_as_root = repo_dir.resolve() == ISABI_ROOT.resolve()
    except OSError:
        same_as_root = False
    if same_as_root:
        home_cand = pathlib.Path.home() / "bhfirms" / "isabi-app"
        if (home_cand / ".git").exists():
            return home_cand
    return None


def _run_git_cmd(
    args: list[str],
    cwd: pathlib.Path,
    *,
    git_bin: str,
    git_env: dict,
    timeout: int = 20,
) -> subprocess.CompletedProcess:
    return subprocess.run(
        [git_bin, *args],
        cwd=str(cwd),
        env=git_env,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        check=False,
    )


def _fetch_main_and_wt(
    cwd: pathlib.Path,
    *,
    label: str,
    git_bin: str,
    git_env: dict,
) -> None:
    try:
        r_rem = _run_git_cmd(["remote", "get-url", "origin"], cwd, git_bin=git_bin, git_env=git_env, timeout=10)
    except (OSError, subprocess.TimeoutExpired) as ex:
        raise RuntimeError(f"Could not inspect `origin` remote in {label} ({ex}).") from ex
    if r_rem.returncode != 0 or not (r_rem.stdout or "").strip():
        raise RuntimeError(f"`origin` remote is missing in {label}; cannot verify unshipped version claims.")
    try:
        r_fetch = _run_git_cmd(
            [
                "fetch",
                "--prune",
                "--no-tags",
                "--quiet",
                "origin",
                "+refs/heads/main:refs/remotes/origin/main",
                "+refs/heads/wt/*:refs/remotes/origin/wt/*",
            ],
            cwd,
            git_bin=git_bin,
            git_env=git_env,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired) as ex:
        raise RuntimeError(f"`git fetch` failed in {label} ({ex}).") from ex
    if r_fetch.returncode != 0:
        detail = (r_fetch.stderr or r_fetch.stdout or "").strip() or f"exit {r_fetch.returncode}"
        raise RuntimeError(f"`git fetch` failed in {label} ({detail}).")


def _git_blob_text(
    cwd: pathlib.Path,
    rev_path: str,
    *,
    git_bin: str,
    git_env: dict,
) -> str | None:
    r = _run_git_cmd(["cat-file", "blob", rev_path], cwd, git_bin=git_bin, git_env=git_env, timeout=10)
    return r.stdout if r.returncode == 0 else None


def _is_ancestor(
    cwd: pathlib.Path,
    ancestor: str,
    descendant: str,
    *,
    git_bin: str,
    git_env: dict,
) -> bool:
    r = _run_git_cmd(["merge-base", "--is-ancestor", ancestor, descendant], cwd, git_bin=git_bin, git_env=git_env, timeout=10)
    return r.returncode == 0


WT_CLAIM_MAX_AGE_DAYS = 7


def collect_unshipped_version_claims(
    repo_dir: pathlib.Path = ISABI_ROOT,
    *,
    app_repo_dir: pathlib.Path | None = None,
    fetch: bool = True,
    include_lock: bool = True,
    env: dict | None = None,
) -> dict:
    """Inspect local `app/sw.js`, `origin/main`, `origin/wt/*` across both repos, and `refs/locks/release`."""
    git_env = env or build_env()
    git_bin = shutil.which("git", path=git_env.get("PATH")) or "git"

    resolved_app = resolve_app_repo_dir(repo_dir, app_repo_dir)
    local_sw_path = repo_dir / "app" / "sw.js"
    has_local_sw = local_sw_path.is_file()
    local_ver = parse_shell_version(local_sw_path.read_text(encoding="utf-8", errors="replace")) if has_local_sw else None

    if fetch and (has_local_sw or resolved_app is not None):
        _fetch_main_and_wt(repo_dir, label=f"isabi ({repo_dir.name})", git_bin=git_bin, git_env=git_env)
        if resolved_app is not None:
            _fetch_main_and_wt(resolved_app, label=f"isabi-app ({resolved_app.name})", git_bin=git_bin, git_env=git_env)

    main_sw_txt = _git_blob_text(repo_dir, "origin/main:app/sw.js", git_bin=git_bin, git_env=git_env)
    main_ver = parse_shell_version(main_sw_txt)
    if main_ver is None and resolved_app is not None:
        app_main_txt = _git_blob_text(resolved_app, "origin/main:sw.js", git_bin=git_bin, git_env=git_env)
        main_ver = parse_shell_version(app_main_txt)

    if not has_local_sw and main_sw_txt is None and resolved_app is None:
        return {
            "skip": True,
            "local_ver": None,
            "main_ver": None,
            "app_changed": False,
            "claims": [],
            "peer_claims": [],
            "own_claims": [],
            "suggested_next": "",
        }

    # Did app/ change relative to origin/main?
    has_origin_app = _run_git_cmd(
        ["rev-parse", "-q", "--verify", "origin/main:app"],
        repo_dir,
        git_bin=git_bin,
        git_env=git_env,
        timeout=10,
    ).returncode == 0
    if not has_origin_app:
        app_changed = (repo_dir / "app").exists()
    else:
        r_diff = _run_git_cmd(
            ["diff", "--quiet", "origin/main", "--", "app"],
            repo_dir,
            git_bin=git_bin,
            git_env=git_env,
            timeout=10,
        )
        # Exit 1 means app/ differs; anything > 1 is an unexpected git failure.
        if r_diff.returncode not in (0, 1):
            detail = (r_diff.stderr or r_diff.stdout or "").strip() or f"exit {r_diff.returncode}"
            raise RuntimeError(f"Could not diff `app/` against origin/main ({detail}).")
        app_changed = r_diff.returncode == 1

    claims: list[dict] = []
    targets: list[tuple[str, pathlib.Path, str]] = [("isabi", repo_dir, "app/sw.js")]
    if resolved_app is not None:
        targets.append(("isabi-app", resolved_app, "sw.js"))

    for repo_label, rdir, sw_rel in targets:
        r_main_ref = _run_git_cmd(["rev-parse", "-q", "--verify", "refs/remotes/origin/main"], rdir, git_bin=git_bin, git_env=git_env)
        has_main_ref = r_main_ref.returncode == 0
        r_head_ref = _run_git_cmd(["rev-parse", "-q", "--verify", "HEAD"], rdir, git_bin=git_bin, git_env=git_env)
        has_head = r_head_ref.returncode == 0
        r_refs = _run_git_cmd(
            ["for-each-ref", "--format=%(refname) %(objectname) %(committerdate:unix)", "refs/remotes/origin/wt/"],
            rdir,
            git_bin=git_bin,
            git_env=git_env,
            timeout=15,
        )
        if r_refs.returncode != 0:
            detail = (r_refs.stderr or r_refs.stdout or "").strip() or f"exit {r_refs.returncode}"
            raise RuntimeError(f"Could not list origin/wt/* refs in {repo_label} ({detail}).")

        repo_main_txt = _git_blob_text(rdir, f"origin/main:{sw_rel}", git_bin=git_bin, git_env=git_env) if has_main_ref else None
        repo_main_ver = parse_shell_version(repo_main_txt) or main_ver
        import time as _time  # noqa: PLC0415
        try:
            now_ts = float(os.environ.get("ISABI_VERSION_CLAIMS_NOW_UNIX") or _time.time())
        except ValueError:
            now_ts = _time.time()
        max_age_s = WT_CLAIM_MAX_AGE_DAYS * 86400.0

        for line in (r_refs.stdout or "").splitlines():
            parts = line.strip().split()
            if len(parts) < 2:
                continue
            refname, sha = parts[0], parts[1]
            if len(parts) >= 3:
                try:
                    if (now_ts - int(parts[2])) > max_age_s:
                        continue
                except ValueError:
                    pass
            wt_txt = _git_blob_text(rdir, f"{sha}:{sw_rel}", git_bin=git_bin, git_env=git_env)
            wt_ver = parse_shell_version(wt_txt)
            if wt_ver is None:
                continue
            baseline = main_ver or repo_main_ver
            if baseline is not None and wt_ver <= baseline:
                continue
            if has_main_ref and _is_ancestor(rdir, sha, "refs/remotes/origin/main", git_bin=git_bin, git_env=git_env):
                continue
            is_mine = bool(has_head and _is_ancestor(rdir, sha, "HEAD", git_bin=git_bin, git_env=git_env))
            claims.append({
                "source": "wt",
                "repo": repo_label,
                "ref": refname.removeprefix("refs/remotes/"),
                "sha": sha[:10],
                "version_tuple": wt_ver,
                "version": format_shell_version(wt_ver),
                "is_mine": is_mine,
            })

    if include_lock and fetch:
        import release_lock  # noqa: PLC0415

        try:
            lock_sha, lock_info = release_lock.read_remote_lock(repo_dir)
        except release_lock.LockError as ex:
            raise RuntimeError(f"Could not inspect release lock for version claims ({ex}).") from ex
        if lock_sha and lock_info and not release_lock.held_by_me(lock_info, repo_dir) and not release_lock.is_expired(lock_info, 0):
            lock_ver = parse_shell_version(lock_info.get("version"))
            if lock_ver is not None and (main_ver is None or lock_ver > main_ver):
                claims.append({
                    "source": "release_lock",
                    "repo": "isabi",
                    "ref": (
                        f"IsabiReleaseRoom ({lock_info.get('holder') or 'peer'})"
                        if release_lock._release_backend(repo_dir) == "cloudflare"
                        else f"refs/locks/release ({lock_info.get('holder') or 'peer'})"
                    ),
                    "sha": lock_sha[:10],
                    "version_tuple": lock_ver,
                    "version": format_shell_version(lock_ver),
                    "is_mine": False,
                })

    peer_claims = [c for c in claims if not c["is_mine"]]
    own_claims = [c for c in claims if c["is_mine"]]
    return {
        "skip": False,
        "local_ver": local_ver,
        "main_ver": main_ver,
        "app_changed": app_changed,
        "claims": claims,
        "peer_claims": peer_claims,
        "own_claims": own_claims,
        "suggested_next": suggest_next_shell_version(main_ver or local_ver, claims),
    }


def check_shell_version_claims(
    repo_dir: pathlib.Path = ISABI_ROOT,
    *,
    app_repo_dir: pathlib.Path | None = None,
    allow_claimed_version: bool = False,
    fetch: bool = True,
    include_lock: bool = True,
    env: dict | None = None,
) -> int:
    """Refuse deploying an unbumped `app/sw.js` or a version claimed by another session's `wt/*` or release lock."""
    if allow_claimed_version:
        print("WARN: Bypassing shell version-claim guard (--allow-claimed-version).")
        return 0

    try:
        info = collect_unshipped_version_claims(
            repo_dir,
            app_repo_dir=app_repo_dir,
            fetch=fetch,
            include_lock=include_lock,
            env=env,
        )
    except RuntimeError as ex:
        print(
            f"ERROR: Shell version-claim check failed ({ex}). "
            "Refusing to deploy without verifying unshipped version claims; pass --allow-claimed-version if intentional.",
            file=sys.stderr,
        )
        raise SystemExit(2) from ex

    if info.get("skip"):
        return 0

    local_ver = info["local_ver"]
    main_ver = info["main_ver"]
    app_changed = info["app_changed"]
    peer_claims = info["peer_claims"]
    suggested = info["suggested_next"]

    if local_ver is None:
        if app_changed:
            print(
                "ERROR: `app/` changed relative to origin/main, but `app/sw.js` does not declare a valid `isabi-mfg-v<N>` version. "
                "Stamp the Command Center shell version before deploying, or pass --allow-claimed-version if intentional.",
                file=sys.stderr,
            )
            raise SystemExit(2)
        return 0

    local_str = format_shell_version(local_ver)
    main_str = format_shell_version(main_ver) if main_ver else "(unknown)"

    if main_ver is not None and local_ver < main_ver:
        print(
            f"ERROR: Local `app/sw.js` shell version ({local_str}) is older than origin/main ({main_str}). "
            f"Suggested next free version: {suggested or local_str}. Rebase and bump `app/sw.js` before deploying, "
            "or pass --allow-claimed-version if intentional.",
            file=sys.stderr,
        )
        raise SystemExit(2)

    if app_changed and main_ver is not None and local_ver <= main_ver:
        print(
            f"ERROR: `app/` changed relative to origin/main, but `app/sw.js` is still unbumped at {local_str} "
            f"(origin/main is {main_str}). Bump to the next free shell version ({suggested}) first, "
            "or pass --allow-claimed-version if intentional.",
            file=sys.stderr,
        )
        raise SystemExit(2)

    conflicts = [c for c in peer_claims if c["version_tuple"] == local_ver]
    if conflicts:
        desc = ", ".join(f"{c['repo']}:{c['ref']} ({c['sha']})" for c in conflicts)
        print(
            f"ERROR: Shell version {local_str} is already claimed and unshipped by peer session(s): {desc}. "
            f"Restamp to {suggested} and re-sync before deploying, or pass --allow-claimed-version if intentional.",
            file=sys.stderr,
        )
        raise SystemExit(2)

    print(
        f"Shell version claim check verified: {local_str} "
        f"(origin/main {main_str}, appChanged={'yes' if app_changed else 'no'}, "
        f"{len(peer_claims)} peer claim(s), 0 conflicts)."
    )
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
            (args.stage_r2_seeds, "--stage-r2-seeds"),
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
        ("stage_r2_seeds", "--stage-r2-seeds"),
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
        ("allow_claimed_version", "--allow-claimed-version"),
        ("no_release_lock", "--no-release-lock"),
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
    elif args.stage_r2_seeds:
        bad = [f for f in active_non_dry if f not in ("--stage-r2-seeds", "--force-r2-seeds", "--login")]
        if bad:
            parser.error(f"--stage-r2-seeds cannot be combined with {', '.join(bad)}.")
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
    elif args.stage_r2_seeds:
        mode = "stage-r2-seeds"
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
    if args.stage_r2_seeds:
        app_js_dir = _resolve_app_js_dir(ISABI_ROOT)
        ver_map = dict(meta.get("r2_versioned_seed_shas") or {})
        stage_parts: list[str] = []
        for kind in SEED_KINDS:
            src = app_js_dir / f"seed_{kind}.json"
            if not src.is_file():
                stage_parts.append(f"{kind}:missing")
            else:
                sha10 = file_sha256(src)[:10]
                known = [str(x).strip().lower() for x in (ver_map.get(kind) or [])]
                if args.force_r2_seeds or sha10 not in known:
                    stage_parts.append(f"seeds/seed_{kind}.{sha10}.json:UPLOAD")
                else:
                    stage_parts.append(f"seeds/seed_{kind}.{sha10}.json:staged")
        print("  Steps    :")
        print("    1. Verify Cloudflare auth" + (" (allow interactive --login)" if args.login else "") + " (lock-free)")
        print("    2. Stage immutable R2 seeds -> " + ", ".join(stage_parts))
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
            "Shell version-claim guard -> BYPASS (--allow-claimed-version)"
            if args.allow_claimed_version
            else "Verify app/sw.js shell version is bumped above origin/main (when app/ changed) and unclaimed by peer wt/* or release lock"
        ),
        (
            "Stale-checkout guard -> BYPASS (--allow-behind-origin)"
            if args.allow_behind_origin
            else "Verify local HEAD is not behind origin/main (git fetch origin main + HEAD..origin/main == 0)"
        ),
        "Verify Cloudflare auth" + (" (allow interactive --login)" if args.login else ""),
    ]
    backend_override = os.environ.get("ISABI_RELEASE_BACKEND", "").strip().lower()
    lock_target = (
        "refs/locks/release on origin"
        if backend_override == "git"
        else "IsabiReleaseRoom on Cloudflare"
    )
    steps.insert(
        2,
        "Release lock -> BYPASS (--no-release-lock)"
        if args.no_release_lock
        else f"Hold the release lock ({lock_target}; taken when free, refused while another session holds it)",
    )
    if mode == "full-deploy":
        steps.append("Ensure D1 (`isabi-ledger`), R2 (`isabi-vault`), wrangler.toml bindings, and Pages project (`isabi-systems`)")
        steps.append("Edge secrets -> " + ("ROTATE/UPLOAD, including a new live signing secret (signs everyone out)" if args.rotate_secrets else "upload only if SHA-256 changed; the live signing secret is kept (uploaded only when the project has none)"))
        app_js_dir = _resolve_app_js_dir(ISABI_ROOT)
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
    if mode == "pages-only":
        steps.append("Sync changed local private R2 seeds (`seeds/seed_<kind>.<sha10>.json` + `seeds/seed_<kind>.json`) or verify/backfill live R2 hash parity")
        steps.append("D1 schema -> APPLY idempotent migrations/0001_schema.sql (every code deploy, as the push-to-main workflow did)")
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
    if args.stage_r2_seeds:
        env = build_env()
        ok, _acct_id = ensure_logged_in(env, login=args.login)
        if not ok:
            sys.exit(2)
        stage_r2_private_seeds(env, force_r2_seeds=args.force_r2_seeds, repo_dir=ISABI_ROOT)
        return
    env = build_env()
    check_deploy_paths_clean(
        ISABI_ROOT,
        allow_dirty=args.allow_dirty,
        env=env,
    )
    check_shell_version_claims(
        ISABI_ROOT,
        allow_claimed_version=args.allow_claimed_version,
        fetch=True,
        env=env,
    )
    # The lock comes before the freshness check: once held, nobody else can deploy and then push main under us.
    import release_lock  # noqa: PLC0415

    lock_bypassed = bool(
        args.no_release_lock
        or os.environ.get("ISABI_RELEASE_LOCK", "").strip().lower() in ("off", "0", "no")
    )
    had_lock_before = False
    if not lock_bypassed:
        try:
            _lsha0, _linfo0 = release_lock.read_remote_lock(ISABI_ROOT)
            had_lock_before = bool(_lsha0 and release_lock.held_by_me(_linfo0, ISABI_ROOT))
        except release_lock.LockError as exc:
            print(f"ERROR: {exc}", file=sys.stderr, flush=True)
            raise SystemExit(2) from None

    def _release_new_lock_on_early_abort() -> None:
        if not lock_bypassed and not had_lock_before:
            try:
                release_lock.release(ISABI_ROOT, quiet=True)
            except Exception:
                pass

    release_lock.require_release_lock(
        ISABI_ROOT,
        purpose="pages-only deploy" if args.pages_only else "full deploy",
        bypass=args.no_release_lock,
    )
    check_checkout_not_behind_origin(
        ISABI_ROOT,
        allow_behind_origin=args.allow_behind_origin,
        fetch=True,
        env=env,
        on_abort=_release_new_lock_on_early_abort,
    )
    try:
        ok, acct_id = ensure_logged_in(env, login=args.login)
        if not ok:
            sys.exit(2)
    except BaseException:
        _release_new_lock_on_early_abort()
        raise

    def _claim_deploy(what: str) -> None:
        """Right before going live: still the lock holder, HEAD contains origin/main, HEAD recorded as the live deploy."""
        if args.no_release_lock:
            return
        head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=str(ISABI_ROOT), capture_output=True, text=True, check=False).stdout.strip()
        if not head:
            print("ERROR: cannot read HEAD to record it in the release lock; not deploying.", file=sys.stderr)
            sys.exit(2)
        release_lock.claim_deploy_or_exit(
            ISABI_ROOT,
            head,
            what + (" (with uncommitted files)" if args.allow_dirty else ""),
            allow_behind=args.allow_behind_origin,
        )

    if args.pages_only:
        try:
            pages_manifest, did_r2_seed_sync = _sync_or_verify_r2_seeds_for_pages_only(
                env,
                ISABI_ROOT,
                auto_upload_local=True,
            )
            apply_d1_schema_for_pages_only(env)
        except BaseException:
            _release_new_lock_on_early_abort()
            raise
        _claim_deploy("pages-only deploy")
        deploy_pages(env)
        if did_r2_seed_sync:
            prune_old_r2_private_seeds(env, acct_id, manifest=pages_manifest, repo_dir=ISABI_ROOT)
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

    try:
        pre_manifest = verify_local_manifest_and_demo_bundle(ISABI_ROOT)
        _validate_local_private_seed_hashes_if_present(pre_manifest, ISABI_ROOT)
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
    except BaseException:
        _release_new_lock_on_early_abort()
        raise
    _claim_deploy("full deploy")
    deploy_pages(env)
    if r2_ok:
        prune_old_r2_private_seeds(env, acct_id, manifest=pre_manifest, repo_dir=ISABI_ROOT)
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
    try:
        main()
    except CloudflareListUnavailable as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(3)
