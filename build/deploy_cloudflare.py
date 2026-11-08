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
import time
import urllib.error
import urllib.request

BUILD_DIR = pathlib.Path(__file__).resolve().parent
if str(BUILD_DIR) not in sys.path:
    sys.path.insert(0, str(BUILD_DIR))

from export_d1_seed import COMMITTED_MANIFEST_JSON, DB_PATH, file_sha256, promote_pending_manifest

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
    gem_key = read_gemini_key()
    sec_sha = hashlib.sha256(f"{jwt_sec}|{gem_key}".encode("utf-8")).hexdigest()
    meta = load_edge_meta()
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

        # 4. Ensure Cloudflare Edge 301 Redirect: `www.isabisystems.com/*` -> `https://isabisystems.com/*` (preserving path & query)
        rs_get = cf_api("GET", f"/zones/{zid}/rulesets/phases/http_request_dynamic_redirect/entrypoint", token)
        redirect_configured = False
        if rs_get.get("success"):
            existing_rules = (rs_get.get("result") or {}).get("rules") or []
            has_www_rule = any("www.isabisystems.com" in str(rl.get("expression") or "") for rl in existing_rules)
            if has_www_rule:
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
                    if rl.get("expression") and rl.get("action")
                ]
                clean_rules.append({
                    "expression": 'http.host eq "www.isabisystems.com"',
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

        if not redirect_configured:
            routes_res = cf_api("GET", f"/zones/{zid}/workers/routes", token)
            existing_routes = (routes_res.get("result") or []) if routes_res.get("success") else []
            has_worker_route = any(
                str(rt.get("pattern") or "") == "www.isabisystems.com/*" and rt.get("script") == "isabi-www-redirect"
                for rt in existing_routes
            )
            if not has_worker_route:
                worker_js = (
                    "addEventListener('fetch', event => {\n"
                    "  const u = new URL(event.request.url);\n"
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
                if w_out.get("success"):
                    rt_post = cf_api(
                        "POST",
                        f"/zones/{zid}/workers/routes",
                        token,
                        {"pattern": "www.isabisystems.com/*", "script": "isabi-www-redirect"},
                    )
                    if rt_post.get("success"):
                        print("Configured Cloudflare Edge Worker 301 redirect: www.isabisystems.com/* -> https://isabisystems.com/*")

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


def main():
    env = build_env()
    ok, acct_id = ensure_logged_in(env)
    if not ok:
        sys.exit(2)
    d1_uuid = ensure_d1_database(env)
    r2_ok = ensure_r2_bucket(env)
    stamp_wrangler_toml(d1_uuid, r2_ok)
    ensure_pages_project(env)
    upload_secrets(env)
    seed_remote_d1(env)
    deploy_pages(env)
    configure_domain_and_dns(acct_id)
    print("\nOPTION A CLOUDFLARE EDGE DEPLOYMENT COMPLETE!")
    print("Preview URL live immediately: https://isabi-systems.pages.dev/")
    print("Command Center preview URL:   https://isabi-systems.pages.dev/app/")


if __name__ == "__main__":
    main()
