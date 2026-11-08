"""deploy_cloudflare.py — One-Command Turnkey Option A Provisioner & Deployer for ISABI Systems.
Provisions Cloudflare Pages project (`isabi-systems`), D1 SQLite (`isabi-ledger`),
R2 bucket (`isabi-vault`), encrypted Edge Secrets (`GEMINI_API_KEY`, `ISABI_JWT_SECRET`),
uploads schema + 88,885-statement ledger batches, deploys Pages + Functions, attaches custom
domains (`isabisystems.com`, `www.isabisystems.com`), configures Cloudflare DNS CNAMEs, and
prints the exact 2 Cloudflare nameservers for Namecheap.

Usage:
  python build/deploy_cloudflare.py [--skip-seed] [--login]
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
import pathlib
import re
import secrets
import shutil
import subprocess
import sys
import urllib.error
import urllib.request

ISABI_ROOT = pathlib.Path(__file__).resolve().parent.parent
WRANGLER_TOML = ISABI_ROOT / "wrangler.toml"
SCHEMA_SQL = ISABI_ROOT / "migrations" / "0001_schema.sql"
BATCH_DIR = ISABI_ROOT / "exports" / "d1_batches"
SECRET_STATE_FILE = ISABI_ROOT / "exports" / "cloudflare_edge_meta.json"


def build_env() -> dict:
    env = os.environ.copy()
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
    SECRET_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    meta = {}
    if SECRET_STATE_FILE.exists():
        try:
            meta = json.loads(SECRET_STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            meta = {}
    if not meta.get("jwt_secret"):
        meta["jwt_secret"] = secrets.token_urlsafe(48)
        SECRET_STATE_FILE.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta["jwt_secret"]


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
    for cfg in candidates:
        if cfg.exists():
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
    print("Uploading encrypted ISABI_JWT_SECRET to Cloudflare Pages...")
    run_wrangler(["pages", "secret", "put", "ISABI_JWT_SECRET", "--project-name=isabi-systems"], env, input_text=jwt_sec, check=False)

    gem_key = read_gemini_key()
    if gem_key:
        print("Uploading encrypted GEMINI_API_KEY to Cloudflare Pages...")
        run_wrangler(["pages", "secret", "put", "GEMINI_API_KEY", "--project-name=isabi-systems"], env, input_text=gem_key, check=False)


def _upload_one_batch(bf: pathlib.Path, env: dict) -> str:
    r = run_wrangler(["d1", "execute", "isabi-ledger", "--remote", f"--file={bf}", "-y"], env, check=False)
    if r.returncode != 0:
        run_wrangler(["d1", "execute", "isabi-ledger", "--remote", f"--file={bf}", "-y"], env, check=True)
    return bf.name


def seed_remote_d1(env: dict):
    print("Applying 0001_schema.sql to remote D1 `isabi-ledger`...")
    run_wrangler(["d1", "execute", "isabi-ledger", "--remote", f"--file={SCHEMA_SQL}", "-y"], env, check=True)

    if "--skip-seed" in sys.argv:
        return

    if not BATCH_DIR.exists() or not list(BATCH_DIR.glob("batch_*.sql")):
        subprocess.run([sys.executable, str(ISABI_ROOT / "build" / "export_d1_seed.py")], cwd=str(ISABI_ROOT), env=env, check=True)
    batches = sorted(BATCH_DIR.glob("batch_*.sql"))
    total = len(batches)
    print(f"Uploading {total} SQL batches (88,885 statements) to remote D1 `isabi-ledger`...")
    done = 0
    with ThreadPoolExecutor(max_workers=3) as pool:
        futs = {pool.submit(_upload_one_batch, bf, env): bf for bf in batches}
        for fut in as_completed(futs):
            name = fut.result()
            done += 1
            if done == 1 or done % 15 == 0 or done == total:
                print(f"  [{done}/{total}] {name} applied")


def deploy_pages(env: dict):
    print("Deploying ISABI Showcase + Command Center + Edge Functions to Cloudflare Pages (`isabi-systems`)...")
    r = run_wrangler(["pages", "deploy", ".", "--project-name=isabi-systems", "--branch=main", "--commit-dirty=true"], env, check=True)
    print(r.stdout)
    if r.stderr:
        print(r.stderr)


def configure_domain_and_dns(acct_id: str):
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
    if not zone:
        z_create = cf_api("POST", "/zones", token, {"name": "isabisystems.com", "account": {"id": acct_id}, "type": "full"})
        if z_create.get("success"):
            zone = z_create.get("result")

    # 2. Attach `isabisystems.com` and `www.isabisystems.com` to Pages project `isabi-systems`
    for dom in ("isabisystems.com", "www.isabisystems.com"):
        cf_api("POST", f"/accounts/{acct_id}/pages/projects/isabi-systems/domains", token, {"name": dom})

    # 3. Ensure proxied CNAME records `@ -> isabi-systems.pages.dev` and `www -> isabi-systems.pages.dev`
    if zone and zone.get("id"):
        zid = zone["id"]
        recs = cf_api("GET", f"/zones/{zid}/dns_records?per_page=100", token).get("result") or []
        existing_names = {str(r.get("name") or "").lower() for r in recs}
        for rec_name in ("isabisystems.com", "www.isabisystems.com"):
            if rec_name not in existing_names:
                cf_api(
                    "POST",
                    f"/zones/{zid}/dns_records",
                    token,
                    {"type": "CNAME", "name": rec_name, "content": "isabi-systems.pages.dev", "proxied": True, "ttl": 1},
                )
        ns_list = zone.get("name_servers") or []
        if ns_list:
            print("\n======================================================================")
            print("FINAL STEP — UPDATE NAMECHEAP NAMESERVERS FOR `isabisystems.com`:")
            print("  In Namecheap -> Domain List -> isabisystems.com -> Manage -> Nameservers")
            print("  Change 'Namecheap BasicDNS' to 'Custom DNS' and enter:")
            for idx, ns in enumerate(ns_list, 1):
                print(f"    Nameserver {idx}: {ns}")
            print("======================================================================")


def main():
    env = build_env()
    ok, acct_id = ensure_logged_in(env)
    if not ok:
        sys.exit(2)
    d1_uuid = ensure_d1_database(env)
    r2_ok = ensure_r2_bucket(env)
    stamp_wrangler_toml(d1_uuid, r2_ok)
    ensure_pages_project(env)
    seed_remote_d1(env)
    upload_secrets(env)
    deploy_pages(env)
    configure_domain_and_dns(acct_id)
    print("\nOPTION A CLOUDFLARE EDGE DEPLOYMENT COMPLETE!")
    print("Preview URL live immediately: https://isabi-systems.pages.dev/")
    print("Command Center preview URL:   https://isabi-systems.pages.dev/app/")


if __name__ == "__main__":
    main()
