"""Data-only release of the Command Center: publish a Manufacturing top-up without shipping the shell.

Use it after `isabi-app/build/topup_from_sharepoint.py` has rebuilt the seeds, whenever the shell must stay as it is:
another session has unfinished UI or Edge-API work in the `isabi-app` or `isabi` working trees, or there is simply no
shell change to ship. `sync_app.py` + `deploy_cloudflare.py` would publish whatever is in the working tree; this script
publishes the committed site plus the new data, and nothing else.

What it guarantees
  * Only committed code is deployed. The site comes from a clean git worktree of HEAD, and the D1 export / deploy
    helpers are loaded from HEAD too, so uncommitted edits in build/ or functions/ never run and never ship.
  * The working tree is never touched. The release commit is built from blobs written straight into the index
    (seed_core.json, seed_records.json, seed_manifest.js, app/index.html).
  * Installed devices fetch the new data: the shell loads `js/seed_manifest.js?v=<ver>` cache-first, so the release
    changes that URL to `...&d=<coreHash>` in app/index.html. No shell version bump.
  * The store document, the sign-in sessions and the seats are left alone: their D1 statements are dropped from the
    delta (the Edge API owns them).
  * The public site carries the site only: build/, migrations/, exports/, functions/ source and wrangler.toml are not
    uploaded as static files (`wrangler pages deploy` does not honour .assetsignore, so the upload folder is staged
    here). Functions are still compiled from the worktree's functions/.

Order of a release (THEO runs it; each stage refuses when the one before it has not been done):
  1. isabi-app:  python build/topup_from_sharepoint.py --until <date> --skip-cloud      (all six gates)
  2. isabi-app:  commit the data files and the loader
  3. isabi:      python build/release_data_only.py commit      seeds + manifest + index.html into a release commit
  4. isabi-app:  python build/reconcile_cloud_store.py --until <date>                    (cloud store twins)
  5. isabi:      python build/release_data_only.py export      D1 delta, nothing written remotely
  6. isabi:      python build/release_data_only.py upload      apply the delta to remote D1
  7. isabi:      python build/release_data_only.py pages       deploy the committed site from a clean worktree
  8. git push origin main (both repos), then check the live manifest hash.
`check` is read-only and can be run at any time. `status` prints what is live against what is on disk.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
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
EDGE_OWNED = {"edge_kv_store", "auth_sessions", "users"}  # store document, sign-in sessions, seats and PINs
# Never uploaded as static files (top-level names, plus the patterns below anywhere in the tree).
NOT_PUBLIC_TOP = {
    "build", "migrations", "exports", "functions", "node_modules", "wrangler.toml", "package.json", "package-lock.json",
    ".assetsignore", ".gitignore", ".gitattributes", ".git", ".github", ".wrangler", ".dev.vars",
}
NOT_PUBLIC_SUFFIX = (".py", ".pyc", ".sql", ".db", ".sqlite")


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


def mods():
    if not _MODS:
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

def stage_status() -> None:
    hm = head_manifest()
    core = (ISABI_APP / "js" / "seed_core.json").read_bytes()
    recs = (ISABI_APP / "js" / "seed_records.json").read_bytes()
    print(f"shell at HEAD        : v{shell_version()}  ({head_sha()[:7]})")
    print(f"isabi HEAD manifest  : core {hm.get('coreHash')} records {hm.get('recordsHash')} industries {hm.get('industriesHash')} generated {hm.get('generated_at')}")
    print(f"isabi-app seeds      : core {sha10(core)} records {sha10(recs)}")
    try:
        lm = live_manifest()
        print(f"live site manifest   : core {lm.get('coreHash')} records {lm.get('recordsHash')} industries {lm.get('industriesHash')} generated {lm.get('generated_at')}")
    except Exception as exc:
        print(f"live site manifest   : not readable ({exc})")


def stage_check() -> None:
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


def stage_commit(message: str = "") -> None:
    """Release commit from blobs: the two seeds, the manifest in the committed format, and app/index.html pointing at
    the new manifest. The working tree and any uncommitted work in it are left exactly as they are."""
    if git(["diff", "--cached", "--name-only"]).stdout.strip():
        raise SystemExit("ABORT: the isabi index has staged changes; a data release commits only its own four files")
    core = (ISABI_APP / "js" / "seed_core.json").read_bytes()
    recs = (ISABI_APP / "js" / "seed_records.json").read_bytes()
    core_h, recs_h = sha10(core), sha10(recs)
    hm = head_manifest()
    if hm.get("coreHash") == core_h and hm.get("recordsHash") == recs_h:
        print(f"Nothing to commit: HEAD already carries core {core_h} / records {recs_h}")
        return
    snap_gen = ""
    try:
        with open(ISABI_APP / "data" / "mfg_snapshot.json", encoding="utf-8") as fh:
            head_txt = fh.read(400)
        m_gen = re.search(r'"generated_at"\s*:\s*"([^"]+)"', head_txt)
        snap_gen = m_gen.group(1) if m_gen else ""
    except OSError:
        pass
    if not snap_gen:
        snap_gen = str(json.loads(core.decode("utf-8")).get("generated_at") or "")
    if not snap_gen:
        raise SystemExit("ABORT: cannot read generated_at of the new seed")
    new_m = dict(hm)  # keeps the committed keys and their order; the industries seed stays the one that is live
    new_m["generated_at"] = snap_gen
    new_m["core"] = f"./js/seed_core.json?d={core_h}"
    new_m["records"] = f"./js/seed_records.json?d={recs_h}"
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
    staged = {}
    for path, data in (
        ("app/js/seed_core.json", core),
        ("app/js/seed_records.json", recs),
        ("app/js/seed_manifest.js", man_bytes),
        ("app/index.html", idx_bytes),
    ):
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
        raise SystemExit("ABORT: commit failed; the four paths are still staged")
    # Read back what was committed.
    cm = head_manifest()
    if cm.get("coreHash") != sha10(head_blob("app/js/seed_core.json")) or cm.get("recordsHash") != sha10(head_blob("app/js/seed_records.json")):
        raise SystemExit("ABORT: committed manifest does not match the committed seeds")
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
    if hm.get("coreHash") != sha10((ISABI_APP / "js" / "seed_core.json").read_bytes()):
        raise SystemExit("ABORT: isabi HEAD does not carry the seed that is on disk in isabi-app; run the commit stage first")
    # The industries seed that is live is the one committed here, whatever the working tree holds.
    live_ind = E.OUT_DIR / "_live_seed_industries.json"
    E.OUT_DIR.mkdir(parents=True, exist_ok=True)
    live_ind.write_bytes(head_blob("app/js/seed_industries.json"))
    if hm.get("industriesHash") and sha10(live_ind.read_bytes()) != hm["industriesHash"]:
        raise SystemExit("ABORT: committed industries seed does not match the committed manifest")
    E.SEED_INDUSTRIES_JSON = live_ind
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
    live_ind = E.OUT_DIR / "_live_seed_industries.json"
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


def _is_public(rel: Path) -> bool:
    parts = rel.parts
    if parts[0] in NOT_PUBLIC_TOP or any(p in ("__pycache__", ".git") for p in parts):
        return False
    return not rel.name.lower().endswith(NOT_PUBLIC_SUFFIX)


def stage_pages(message: str = "", keep: bool = False) -> None:
    """Deploy the committed site: a clean worktree of HEAD supplies functions/ and wrangler.toml, and only the public
    files of that worktree are uploaded as static assets."""
    _, D = mods()
    head = head_sha()
    hm = head_manifest()
    tag = time.strftime("%Y%m%d-%H%M%S")
    wt = WORKTREES / f"isabi-release-{tag}"
    bundle = WORKTREES / f"isabi-release-{tag}-public"
    WORKTREES.mkdir(parents=True, exist_ok=True)
    git(["worktree", "add", "--detach", str(wt), head])
    try:
        st = git(["status", "--porcelain"], cwd=wt).stdout.strip()
        if st:
            raise SystemExit(f"ABORT: the release worktree is not clean:\n{st}")
        n = 0
        for src in wt.rglob("*"):
            if not src.is_file():
                continue
            rel = src.relative_to(wt)
            if not _is_public(rel):
                continue
            dst = bundle / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dst)
            n += 1
        for must_not in ("build", "migrations", "exports", "functions", "wrangler.toml", ".dev.vars", ".git"):
            if (bundle / must_not).exists():
                raise SystemExit(f"ABORT: {must_not} must not be in the public bundle")
        for must in ("index.html", "_headers", "_routes.json", "app/index.html", "app/sw.js", "app/js/app.js", "app/js/seed_manifest.js"):
            if not (bundle / must).is_file():
                raise SystemExit(f"ABORT: {must} is missing from the public bundle")
        man = parse_manifest((bundle / "app" / "js" / "seed_manifest.js").read_text(encoding="utf-8"))
        for key, fn in (("coreHash", "seed_core.json"), ("recordsHash", "seed_records.json"), ("industriesHash", "seed_industries.json")):
            if man.get(key) and sha10((bundle / "app" / "js" / fn).read_bytes()) != man[key]:
                raise SystemExit(f"ABORT: {fn} does not match the manifest hash {man[key]}")
        if f"seed_manifest.js?v={shell_version()}&amp;d={man['coreHash']}" not in (bundle / "app" / "index.html").read_text(encoding="utf-8"):
            raise SystemExit("ABORT: app/index.html does not point at the new seed manifest")
        print(f"Public bundle: {n} files from {head[:7]} (build/, migrations/, exports/, functions/ source and wrangler.toml left out)")
        env = D.build_env()
        ok, acct = D.ensure_logged_in(env)
        if not ok:
            raise SystemExit(2)
        if acct and not env.get("CLOUDFLARE_ACCOUNT_ID"):
            env["CLOUDFLARE_ACCOUNT_ID"] = acct
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


def main() -> None:
    ap = argparse.ArgumentParser(description="Publish a Manufacturing data top-up without shipping the shell.")
    ap.add_argument("stage", choices=["status", "check", "commit", "export", "upload", "pages"])
    ap.add_argument("--message", default="", help="Commit / deployment message (default: derived from the seed date)")
    ap.add_argument("--keep", action="store_true", help="pages: keep the release worktree and bundle for inspection")
    a = ap.parse_args()
    if a.stage == "status":
        stage_status()
    elif a.stage == "check":
        stage_check()
    elif a.stage == "commit":
        stage_commit(a.message)
    elif a.stage == "export":
        stage_export()
    elif a.stage == "upload":
        stage_upload()
    else:
        stage_pages(a.message, a.keep)


if __name__ == "__main__":
    main()
