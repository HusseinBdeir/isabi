"""verify_r2_seed_parity.py — Offline gate & CI CLI helper for seed_manifest.js and R2 private seed hash parity."""
from __future__ import annotations

import argparse
import contextlib
import hashlib
import importlib
import io
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

BUILD_DIR = pathlib.Path(__file__).resolve().parent
ISABI_ROOT = BUILD_DIR.parent
if str(BUILD_DIR) not in sys.path:
    sys.path.insert(0, str(BUILD_DIR))

import deploy_cloudflare as dc  # noqa: E402
import release_lock as rl  # noqa: E402
import sync_app as sa  # noqa: E402


def _sha10_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:10]


def _sha10_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()[:10]


def _cli_check_manifest(manifest_path: pathlib.Path, app_dir: pathlib.Path | None) -> int:
    if not manifest_path.is_file():
        print(f"ERROR: Missing seed manifest `{manifest_path}`.", file=sys.stderr)
        return 1
    try:
        manifest = dc.parse_app_seed_manifest(manifest_path.read_text(encoding="utf-8"), str(manifest_path))
    except SystemExit as ex:
        return int(ex.code or 1)

    resolved_app = app_dir or manifest_path.resolve().parent.parent
    js_dir = resolved_app / "js"
    for kind in dc.SEED_KINDS:
        dhval = str(manifest[dc.DEMO_SEED_HASH_KEY[kind]])
        demo_path = js_dir / f"seed_demo_{kind}.json"
        if not demo_path.is_file():
            print(f"ERROR: Missing demo seed `{demo_path}` referenced by `{dc.DEMO_SEED_HASH_KEY[kind]}={dhval}`.", file=sys.stderr)
            return 1
        got = _sha10_file(demo_path)
        if got != dhval:
            print(
                f"ERROR: `{demo_path}` SHA-256 ({got}) != `{dc.DEMO_SEED_HASH_KEY[kind]}` ({dhval}) in `{manifest_path}`.",
                file=sys.stderr,
            )
            return 1

    idx_path = resolved_app / "index.html"
    if idx_path.is_file():
        idx_txt = idx_path.read_text(encoding="utf-8", errors="replace")
        core_h = str(manifest["coreHash"])
        for m_d in re.findall(r"js/seed_manifest\.js\?v=[0-9][0-9.]*(?:&amp;|&)d=([0-9a-fA-F]+)", idx_txt):
            if m_d != core_h:
                print(
                    f"ERROR: `{idx_path}` embeds `&d={m_d}` which disagrees with `coreHash={core_h}`.",
                    file=sys.stderr,
                )
                return 1

    print(
        f"OK: seed_manifest parity verified (core={manifest['coreHash']}, "
        f"records={manifest['recordsHash']}, industries={manifest['industriesHash']})."
    )
    return 0


def _cli_check_seed_file(kind: str, seed_path: pathlib.Path, manifest_path: pathlib.Path) -> int:
    if not manifest_path.is_file():
        print(f"ERROR: Missing seed manifest `{manifest_path}`.", file=sys.stderr)
        return 1
    try:
        manifest = dc.parse_app_seed_manifest(manifest_path.read_text(encoding="utf-8"), str(manifest_path))
    except SystemExit as ex:
        return int(ex.code or 1)

    if not seed_path.is_file() or seed_path.stat().st_size == 0:
        print(f"ERROR: Private seed `{seed_path}` is missing or empty for kind `{kind}`.", file=sys.stderr)
        return 1
    hkey = dc.SEED_HASH_KEY[kind]
    want = str(manifest[hkey])
    got = _sha10_file(seed_path)
    if got != want:
        print(
            f"ERROR: Private seed mismatch for `seed_{kind}.json` (`{seed_path}`): "
            f"manifest `{hkey}` expects `{want}`, file SHA-256 is `{got}`. "
            "Upload the matching private seeds to R2 (`deploy_cloudflare.py` or `release_data_only.py r2`) before deploying Pages.",
            file=sys.stderr,
        )
        return 1
    print(f"OK: seed_{kind}.json parity verified ({got} == {hkey}).")
    return 0


def _git(repo: pathlib.Path, *args: str, env: dict | None = None) -> str:
    r = subprocess.run(
        ["git", *args],
        cwd=str(repo),
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdin=subprocess.DEVNULL,
        check=True,
    )
    return r.stdout.strip()


def _init_git_repo(repo: pathlib.Path, env: dict) -> None:
    repo.mkdir(parents=True, exist_ok=True)
    _git(repo, "init", "-q", "-b", "main", env=env)
    _git(repo, "config", "user.name", "Test User", env=env)
    _git(repo, "config", "user.email", "test@isabi.invalid", env=env)
    _git(repo, "config", "core.autocrlf", "false", env=env)
    _git(repo, "config", "commit.gpgsign", "false", env=env)


def _render_manifest(core_b: bytes, recs_b: bytes, ind_b: bytes, dcore_b: bytes, drecs_b: bytes, dind_b: bytes) -> tuple[bytes, dict]:
    ch, rh, ih = _sha10_bytes(core_b), _sha10_bytes(recs_b), _sha10_bytes(ind_b)
    dch, drh, dih = _sha10_bytes(dcore_b), _sha10_bytes(drecs_b), _sha10_bytes(dind_b)
    obj = {
        "generated_at": "2026-11-21T10:00:00Z",
        "industries_generated_at": "2026-11-11T18:16:19Z",
        "core": f"./js/seed_core.json?d={ch}",
        "records": f"./js/seed_records.json?d={rh}",
        "industries": f"./js/seed_industries.json?d={ih}",
        "apiCore": f"./api/seed/core?d={ch}",
        "apiRecords": f"./api/seed/records?d={rh}",
        "apiIndustries": f"./api/seed/industries?d={ih}",
        "coreHash": ch,
        "recordsHash": rh,
        "industriesHash": ih,
        "demoCore": f"./js/seed_demo_core.json?d={dch}",
        "demoRecords": f"./js/seed_demo_records.json?d={drh}",
        "demoIndustries": f"./js/seed_demo_industries.json?d={dih}",
        "demoCoreHash": dch,
        "demoRecordsHash": drh,
        "demoIndustriesHash": dih,
    }
    txt = (
        "// Auto-generated test seed manifest\n"
        "(typeof self!=='undefined'?self:window).__MFG_SEED_MANIFEST="
        + json.dumps(obj, separators=(",", ":"))
        + ";\n"
    )
    return txt.encode("utf-8"), obj


def _write_seed_tree(
    app_root: pathlib.Path,
    *,
    core_b: bytes,
    recs_b: bytes,
    ind_b: bytes,
    dcore_b: bytes,
    drecs_b: bytes,
    dind_b: bytes,
    write_private: bool = True,
    ver: str = "19.6.999",
    embed_index_d: str | None = None,
) -> dict:
    man_b, obj = _render_manifest(core_b, recs_b, ind_b, dcore_b, drecs_b, dind_b)
    js_dir = app_root / "js"
    js_dir.mkdir(parents=True, exist_ok=True)
    (js_dir / "seed_manifest.js").write_bytes(man_b)
    (js_dir / "seed_demo_core.json").write_bytes(dcore_b)
    (js_dir / "seed_demo_records.json").write_bytes(drecs_b)
    (js_dir / "seed_demo_industries.json").write_bytes(dind_b)
    if write_private:
        (js_dir / "seed_core.json").write_bytes(core_b)
        (js_dir / "seed_records.json").write_bytes(recs_b)
        (js_dir / "seed_industries.json").write_bytes(ind_b)
    idx_q = f"js/seed_manifest.js?v={ver}" + (f"&amp;d={embed_index_d}" if embed_index_d else "")
    (app_root / "index.html").write_text(
        f'<!doctype html><html><script>window.__MFG_SHELL_VER="{ver}";</script><script src="{idx_q}"></script></html>\n',
        encoding="utf-8",
        newline="\n",
    )
    (app_root / "sw.js").write_text(f"const SHELL_CACHE = 'isabi-mfg-v{ver}';\n", encoding="utf-8", newline="\n")
    (app_root / "manifest.json").write_text(json.dumps({"start_url": f"./?v={ver}"}) + "\n", encoding="utf-8", newline="\n")
    return obj


def _run_suite() -> int:
    passed = 0
    total = 0

    def check(cond: bool, label: str, detail: str = "") -> None:
        nonlocal passed, total
        total += 1
        if not cond:
            raise AssertionError(f"FAIL [{label}] {detail}".strip())
        passed += 1

    # 1. sync_app.verify_seed_manifest_parity & parse_seed_manifest_text
    with tempfile.TemporaryDirectory(prefix="isabi-r2-parity-sync-", ignore_cleanup_errors=True) as td:
        base = pathlib.Path(td)
        app_src = base / "isabi-app"
        site_dir = base / "isabi"
        site_dir.mkdir()
        core_v1 = b'{"core":1,"namebook":{"a":"b"}}'
        recs_v1 = b'{"recs":1}'
        ind_v1 = b'{"ind":1}'
        dc_b, dr_b, di_b = b'{"demoCore":1}', b'{"demoRec":1}', b'{"demoInd":1}'
        man1 = _write_seed_tree(app_src, core_b=core_v1, recs_b=recs_v1, ind_b=ind_v1, dcore_b=dc_b, drecs_b=dr_b, dind_b=di_b)
        got_man = sa.verify_seed_manifest_parity(str(app_src), str(site_dir), check_git_origin=False)
        check(got_man["coreHash"] == man1["coreHash"], "sync-app-valid-manifest")

        # Missing private files still pass when demo + manifest are valid (UI-only PC)
        for priv in ("seed_core.json", "seed_records.json", "seed_industries.json"):
            (app_src / "js" / priv).unlink()
        got_man_nopriv = sa.verify_seed_manifest_parity(str(app_src), str(site_dir), check_git_origin=False)
        check(got_man_nopriv["coreHash"] == man1["coreHash"], "sync-app-valid-without-private-files")

        # Stale local private seed vs manifest fails
        (app_src / "js" / "seed_core.json").write_bytes(b'{"core":"stale"}')
        failed_priv = False
        try:
            sa.verify_seed_manifest_parity(str(app_src), str(site_dir), check_git_origin=False)
        except SystemExit:
            failed_priv = True
        check(failed_priv, "sync-app-rejects-mismatched-local-private-seed")
        (app_src / "js" / "seed_core.json").write_bytes(core_v1)

        # Bad demo seed fails
        (app_src / "js" / "seed_demo_core.json").write_bytes(b'{"demoCore":"tampered"}')
        failed_demo = False
        try:
            sa.verify_seed_manifest_parity(str(app_src), str(site_dir), check_git_origin=False)
        except SystemExit:
            failed_demo = True
        check(failed_demo, "sync-app-rejects-mismatched-demo-seed")
        (app_src / "js" / "seed_demo_core.json").write_bytes(dc_b)

        # Bad ?d= suffix fails
        bad_txt = (app_src / "js" / "seed_manifest.js").read_text(encoding="utf-8").replace(
            f"?d={man1['recordsHash']}", "?d=0000000000", 1
        )
        (app_src / "js" / "seed_manifest.js").write_text(bad_txt, encoding="utf-8")
        failed_url = False
        try:
            sa.verify_seed_manifest_parity(str(app_src), str(site_dir), check_git_origin=False)
        except SystemExit:
            failed_url = True
        check(failed_url, "sync-app-rejects-bad-query-d-hash")

        # Bad index.html &d= fails
        _write_seed_tree(
            app_src,
            core_b=core_v1,
            recs_b=recs_v1,
            ind_b=ind_v1,
            dcore_b=dc_b,
            drecs_b=dr_b,
            dind_b=di_b,
            embed_index_d="deadbeef00",
        )
        failed_idx = False
        try:
            sa.verify_seed_manifest_parity(str(app_src), str(site_dir), check_git_origin=False)
        except SystemExit:
            failed_idx = True
        check(failed_idx, "sync-app-rejects-bad-index-d-hash")

        # Corrupted manifest text fails cleanly
        failed_parse = False
        try:
            sa.parse_seed_manifest_text("window.OTHER = 1;", "corrupt.js")
        except SystemExit:
            failed_parse = True
        check(failed_parse, "sync-app-rejects-missing-manifest-marker")

        # check_git_origin=True emits NOTICE when seed hashes differ vs origin/main
        _write_seed_tree(app_src, core_b=core_v1, recs_b=recs_v1, ind_b=ind_v1, dcore_b=dc_b, drecs_b=dr_b, dind_b=di_b)
        origin_sa = base / "origin_sa.git"
        site_sa = base / "site_sa"
        _git(base, "init", "--bare", "-q", "-b", "main", str(origin_sa))
        _git(base, "clone", "-q", str(origin_sa), str(site_sa))
        for k, v in (("user.name", "T"), ("user.email", "t@i"), ("core.autocrlf", "false"), ("commit.gpgsign", "false")):
            _git(site_sa, "config", k, v)
        _write_seed_tree(site_sa / "app", core_b=b'{"core":0}', recs_b=recs_v1, ind_b=ind_v1, dcore_b=dc_b, drecs_b=dr_b, dind_b=di_b, write_private=False)
        _git(site_sa, "add", "-A")
        _git(site_sa, "commit", "-q", "-m", "old origin")
        _git(site_sa, "push", "-q", "-u", "origin", "main")
        notice_buf = io.StringIO()
        with contextlib.redirect_stdout(notice_buf):
            sa.verify_seed_manifest_parity(str(app_src), str(site_sa), check_git_origin=True)
        check("NOTICE: Private seed hash(es) changed vs origin/main" in notice_buf.getvalue(), "sync-app-emits-origin-diff-notice", notice_buf.getvalue())

    # 2. deploy_cloudflare --pages-only & upload_r2_private_seeds in bare + working git repo
    with tempfile.TemporaryDirectory(prefix="isabi-r2-parity-dc-", ignore_cleanup_errors=True) as td:
        base = pathlib.Path(td)
        env = dc.build_env()
        old_app_src_env = os.environ.pop("ISABI_APP_SRC", None)
        old_rel_lock_env = os.environ.pop("ISABI_RELEASE_LOCK", None)
        origin_bare = base / "origin.git"
        site = base / "isabi"
        app_repo = base / "isabi-app"
        peer = base / "peer"
        edge_meta_path = base / "meta" / "cloudflare_edge_meta.json"

        _git(base, "init", "--bare", "-q", "-b", "main", str(origin_bare), env=env)
        _git(base, "clone", "-q", str(origin_bare), str(site), env=env)
        for k, v in (("user.name", "Test"), ("user.email", "test@isabi.invalid"), ("core.autocrlf", "false"), ("commit.gpgsign", "false")):
            _git(site, "config", k, v, env=env)

        core_v1 = b'{"v":1}'
        recs_v1 = b'{"r":1}'
        ind_v1 = b'{"i":1}'
        core_v2 = b'{"v":2,"namebook":{"k":"v"}}'
        dc_b, dr_b, di_b = b'{"dc":1}', b'{"dr":1}', b'{"di":1}'

        man1 = _write_seed_tree(
            site / "app",
            core_b=core_v1,
            recs_b=recs_v1,
            ind_b=ind_v1,
            dcore_b=dc_b,
            drecs_b=dr_b,
            dind_b=di_b,
            write_private=False,
            embed_index_d=_sha10_bytes(core_v1),
        )
        (site / "functions" / "_lib").mkdir(parents=True, exist_ok=True)
        (site / "functions" / "_lib" / "deployed_shell.js").write_text("export const DEPLOYED_SHELL_VER = '19.6.999';\n", encoding="utf-8", newline="\n")
        (site / "migrations").mkdir(exist_ok=True)
        (site / "migrations" / "0001_schema.sql").write_text("SELECT 1;\n", encoding="utf-8", newline="\n")
        (site / "wrangler.toml").write_text('name = "isabi-systems"\n', encoding="utf-8", newline="\n")
        (site / "index.html").write_text("<h1>showcase</h1>\n", encoding="utf-8", newline="\n")
        (site / "_redirects").write_text("", encoding="utf-8", newline="\n")
        _git(site, "add", "-A", env=env)
        _git(site, "commit", "-q", "-m", "init v1", env=env)
        _git(site, "push", "-q", "-u", "origin", "main", env=env)

        _write_seed_tree(app_repo, core_b=core_v1, recs_b=recs_v1, ind_b=ind_v1, dcore_b=dc_b, drecs_b=dr_b, dind_b=di_b)

        r2_remote: dict[str, bytes] = {
            "core": core_v1,
            "records": recs_v1,
            "industries": ind_v1,
        }
        r2_get_calls: list[str] = []
        r2_put_calls: list[str] = []
        deploy_pages_calls = 0
        upload_secrets_calls = 0
        # The leader's PC deploys (owner 2026-11-26): --pages-only applies the idempotent D1 schema before going live.
        schema_events: list[str] = []   # "schema" per remote schema run, "deploy" per Pages deploy, in the order they ran
        schema_fail = False

        def fake_run_wrangler(args, _env, input_text=None, check=True, retry=None):
            if args[:2] == ["d1", "execute"] and "--remote" in args and any(
                    str(a).startswith("--file=") and str(a).endswith("0001_schema.sql") for a in args):
                schema_events.append("schema")
                if schema_fail:
                    if check:
                        raise subprocess.CalledProcessError(1, ["wrangler", *args], output="", stderr="D1_ERROR: no such table")
                    return subprocess.CompletedProcess(["wrangler", *args], 1, stdout="", stderr="D1_ERROR: no such table")
                return subprocess.CompletedProcess(["wrangler", *args], 0, stdout="ok", stderr="")
            if args[:3] == ["r2", "object", "get"]:
                key = args[3].split("seed_")[-1].split(".json")[0]
                r2_get_calls.append(key)
                file_arg = [a for a in args if a.startswith("--file=")][0]
                out_p = pathlib.Path(file_arg[len("--file="):])
                out_p.parent.mkdir(parents=True, exist_ok=True)
                data = r2_remote.get(key)
                if data is None:
                    return subprocess.CompletedProcess(["wrangler", *args], 1, stdout="", stderr="NoSuchKey")
                out_p.write_bytes(data)
                return subprocess.CompletedProcess(["wrangler", *args], 0, stdout="ok", stderr="")
            if args[:3] == ["r2", "object", "put"]:
                key = args[3].split("seed_")[-1].split(".json")[0]
                r2_put_calls.append(key)
                file_arg = [a for a in args if a.startswith("--file=")][0]
                src_p = pathlib.Path(file_arg[len("--file="):])
                r2_remote[key] = src_p.read_bytes()
                return subprocess.CompletedProcess(["wrangler", *args], 0, stdout="ok", stderr="")
            return subprocess.CompletedProcess(["wrangler", *args], 0, stdout="", stderr="")

        def fake_deploy_pages(_env):
            nonlocal deploy_pages_calls
            deploy_pages_calls += 1
            schema_events.append("deploy")

        def fake_upload_secrets(_env, rotate_secrets=False):
            nonlocal upload_secrets_calls
            upload_secrets_calls += 1

        orig_attrs = {
            "ISABI_ROOT": dc.ISABI_ROOT,
            "SECRET_STATE_FILE": dc.SECRET_STATE_FILE,
            "run_wrangler": dc.run_wrangler,
            "ensure_logged_in": dc.ensure_logged_in,
            "deploy_pages": dc.deploy_pages,
            "ensure_d1_database": dc.ensure_d1_database,
            "ensure_r2_bucket": dc.ensure_r2_bucket,
            "stamp_wrangler_toml": dc.stamp_wrangler_toml,
            "ensure_pages_project": dc.ensure_pages_project,
            "upload_secrets": dc.upload_secrets,
            "seed_remote_d1": dc.seed_remote_d1,
            "migrate_remote_d1_pins_to_pbkdf2": dc.migrate_remote_d1_pins_to_pbkdf2,
            "warn_weak_seat_pins": dc.warn_weak_seat_pins,
            "configure_domain_and_dns": dc.configure_domain_and_dns,
            "cleanup_preview_deployments_and_purge_cache": dc.cleanup_preview_deployments_and_purge_cache,
            "run_live_parity_gate": dc.run_live_parity_gate,
            "ping_indexnow": dc.ping_indexnow,
        }
        try:
            dc.ISABI_ROOT = site
            dc.SECRET_STATE_FILE = edge_meta_path
            dc.run_wrangler = fake_run_wrangler
            dc.ensure_logged_in = lambda _env, login=False: (True, "acct123")
            dc.deploy_pages = fake_deploy_pages
            dc.ensure_d1_database = lambda _env: "d1-uuid"
            dc.ensure_r2_bucket = lambda _env: True
            dc.stamp_wrangler_toml = lambda _d1, _r2: None
            dc.ensure_pages_project = lambda _env: None
            dc.upload_secrets = fake_upload_secrets
            dc.seed_remote_d1 = lambda _env, **kw: None
            dc.migrate_remote_d1_pins_to_pbkdf2 = lambda _env: None
            dc.warn_weak_seat_pins = lambda _env: None
            dc.configure_domain_and_dns = lambda _acct: None
            dc.cleanup_preview_deployments_and_purge_cache = lambda _acct: None
            dc.run_live_parity_gate = lambda sync_release_log=True: True
            dc.ping_indexnow = lambda: None

            # Case 2a: unchanged manifest vs origin/main + empty edge_meta -> 0 wrangler calls
            r2_get_calls.clear()
            with contextlib.redirect_stdout(io.StringIO()):
                res_2a = dc.verify_r2_seed_parity_for_pages_only(env, site)
            check(res_2a["coreHash"] == man1["coreHash"] and r2_get_calls == [], "pages-only-unchanged-skips-r2-get")

            # Case 2b: local edge_meta r2_seed_shas disagrees even when origin/main matches -> checks R2 and catches mismatch!
            dc.save_edge_meta({"r2_seed_shas": {"core": "deadbeef00" * 6 + "dead"}})
            r2_remote["core"] = b'{"v":"stale_in_r2"}'
            r2_get_calls.clear()
            err_2b = io.StringIO()
            rc_2b = None
            with contextlib.redirect_stderr(err_2b), contextlib.redirect_stdout(io.StringIO()):
                try:
                    dc.verify_r2_seed_parity_for_pages_only(env, site)
                except SystemExit as ex:
                    rc_2b = ex.code
            check(rc_2b == 2 and r2_get_calls == ["core"] and man1["coreHash"] in err_2b.getvalue(), "pages-only-edge-meta-mismatch-triggers-r2-check")
            r2_remote["core"] = core_v1
            edge_meta_path.unlink()

            # Case 2c: coreHash changed vs origin/main and R2 holds old bytes -> main --pages-only fails closed BEFORE deploy_pages AND releases newly acquired lock!
            man2 = _write_seed_tree(
                site / "app",
                core_b=core_v2,
                recs_b=recs_v1,
                ind_b=ind_v1,
                dcore_b=dc_b,
                drecs_b=dr_b,
                dind_b=di_b,
                write_private=False,
                embed_index_d=_sha10_bytes(core_v2),
            )
            _git(site, "add", "-A", env=env)
            _git(site, "commit", "-q", "-m", "update core manifest without uploading R2", env=env)

            r2_get_calls.clear()
            deploy_pages_calls = 0
            err_2c = io.StringIO()
            rc_2c = None
            with contextlib.redirect_stderr(err_2c), contextlib.redirect_stdout(io.StringIO()):
                try:
                    dc.main(["--pages-only", "--skip-live-parity", "--skip-indexnow", "--allow-claimed-version"])
                except SystemExit as ex:
                    rc_2c = ex.code
            lock_after_2c = rl.read_remote_lock(site)
            check(
                rc_2c == 2
                and deploy_pages_calls == 0
                and r2_get_calls == ["core"]
                and man2["coreHash"] in err_2c.getvalue()
                and _sha10_bytes(core_v1) in err_2c.getvalue()
                and lock_after_2c == ("", {}),
                "pages-only-stale-r2-aborts-before-deploy-and-releases-new-lock",
                f"rc={rc_2c}, deps={deploy_pages_calls}, gets={r2_get_calls}, lock={lock_after_2c}",
            )

            # Case 2c-ii: missing R2 object (NoSuchKey) or 0-byte download fails closed with exit 2 and releases newly acquired lock
            r2_remote.pop("core")
            deploy_pages_calls = 0
            err_nokey = io.StringIO()
            rc_nokey = None
            with contextlib.redirect_stderr(err_nokey), contextlib.redirect_stdout(io.StringIO()):
                try:
                    dc.main(["--pages-only", "--skip-live-parity", "--skip-indexnow", "--allow-claimed-version"])
                except SystemExit as ex:
                    rc_nokey = ex.code
            check(
                rc_nokey == 2 and deploy_pages_calls == 0 and rl.read_remote_lock(site) == ("", {}),
                "pages-only-missing-r2-object-nosuchkey-aborts-and-releases-lock",
            )
            r2_remote["core"] = b""
            rc_empty_r2 = None
            with contextlib.redirect_stderr(io.StringIO()), contextlib.redirect_stdout(io.StringIO()):
                try:
                    dc.main(["--pages-only", "--skip-live-parity", "--skip-indexnow", "--allow-claimed-version"])
                except SystemExit as ex:
                    rc_empty_r2 = ex.code
            check(rc_empty_r2 == 2 and rl.read_remote_lock(site) == ("", {}), "pages-only-empty-r2-object-aborts-and-releases-lock")
            r2_remote["core"] = core_v1

            # Case 2d: when caller ALREADY held lock before --pages-only failure (both normal and ISABI_RELEASE_LOCK=off), pre-held lock stays!
            rl.acquire(site, holder="batch-leader-test", version="v19.6.999", quiet=True)
            deploy_pages_calls = 0
            rc_2d = None
            with contextlib.redirect_stderr(io.StringIO()), contextlib.redirect_stdout(io.StringIO()):
                try:
                    dc.main(["--pages-only", "--skip-live-parity", "--skip-indexnow", "--allow-claimed-version"])
                except SystemExit as ex:
                    rc_2d = ex.code
            lock_sha_2d, lock_info_2d = rl.read_remote_lock(site)
            check(
                rc_2d == 2 and deploy_pages_calls == 0 and bool(lock_sha_2d) and lock_info_2d.get("holder") == "batch-leader-test",
                "pages-only-stale-r2-preserves-preheld-lock",
            )

            os.environ["ISABI_RELEASE_LOCK"] = "off"
            rc_off = None
            with contextlib.redirect_stderr(io.StringIO()), contextlib.redirect_stdout(io.StringIO()):
                try:
                    dc.main(["--pages-only", "--skip-live-parity", "--skip-indexnow", "--allow-claimed-version"])
                except SystemExit as ex:
                    rc_off = ex.code
            os.environ.pop("ISABI_RELEASE_LOCK", None)
            lock_sha_off, lock_info_off = rl.read_remote_lock(site)
            check(
                rc_off == 2 and bool(lock_sha_off) and lock_info_off.get("holder") == "batch-leader-test",
                "pages-only-isabi-release-lock-off-preserves-preheld-lock",
            )
            rl.release(site, force=True, quiet=True)

            # Every abort above happened before the schema was touched: stale seeds never reach the database step.
            check(schema_events == [], "pages-only-stale-r2-aborts-before-the-d1-schema", f"events={schema_events}")

            # Case 2d-ii: the schema cannot be applied -> exit 2 before deploy_pages, nothing recorded as deployed, and a
            # lock this run took is given back (the Edge functions never go live ahead of the schema they read).
            r2_remote["core"] = core_v2
            schema_fail = True
            schema_events.clear()
            deploy_pages_calls = 0
            err_sch = io.StringIO()
            rc_sch = None
            with contextlib.redirect_stderr(err_sch), contextlib.redirect_stdout(io.StringIO()):
                try:
                    dc.main(["--pages-only", "--skip-live-parity", "--skip-indexnow", "--allow-claimed-version"])
                except SystemExit as ex:
                    rc_sch = ex.code
            check(
                rc_sch == 2 and deploy_pages_calls == 0 and schema_events == ["schema"]
                and "could not apply the D1 schema" in err_sch.getvalue() and rl.read_remote_lock(site) == ("", {}),
                "pages-only-schema-failure-aborts-before-deploy-and-releases-new-lock",
                f"rc={rc_sch}, deps={deploy_pages_calls}, events={schema_events}, lock={rl.read_remote_lock(site)}",
            )
            # Case 2d-iii: the same failure for a batch leader, who holds the lock before the deploy starts: its lock stays.
            rl.acquire(site, holder="batch-leader-test", version="v19.6.999", quiet=True)
            schema_events.clear()
            deploy_pages_calls = 0
            rc_sch_held = None
            with contextlib.redirect_stderr(io.StringIO()), contextlib.redirect_stdout(io.StringIO()):
                try:
                    dc.main(["--pages-only", "--skip-live-parity", "--skip-indexnow", "--allow-claimed-version"])
                except SystemExit as ex:
                    rc_sch_held = ex.code
            lock_sha_sch, lock_info_sch = rl.read_remote_lock(site)
            check(
                rc_sch_held == 2 and deploy_pages_calls == 0 and schema_events == ["schema"] and bool(lock_sha_sch)
                and lock_info_sch.get("holder") == "batch-leader-test" and not (lock_info_sch.get("deployed") or []),
                "pages-only-schema-failure-keeps-a-leaders-lock-and-records-no-deploy",
                f"rc={rc_sch_held}, deps={deploy_pages_calls}, events={schema_events}, lock={lock_info_sch}",
            )
            rl.release(site, force=True, quiet=True)
            schema_fail = False
            r2_remote["core"] = core_v1

            # Case 2e: once R2 has matching core_v2 bytes, --pages-only checks ONLY core and succeeds!
            r2_remote["core"] = core_v2
            r2_get_calls.clear()
            schema_events.clear()
            deploy_pages_calls = 0
            with contextlib.redirect_stdout(io.StringIO()):
                dc.main(["--pages-only", "--skip-live-parity", "--skip-indexnow", "--allow-claimed-version"])
            check(deploy_pages_calls == 1 and r2_get_calls == ["core"], "pages-only-matching-r2-passes")
            check(schema_events == ["schema", "deploy"], "pages-only-applies-the-d1-schema-once-right-before-the-pages-deploy",
                  f"events={schema_events}")
            dep_2e = (rl.read_remote_lock(site)[1].get("deployed") or [{}])[-1].get("sha")
            check(dep_2e == _git(site, "rev-parse", "HEAD", env=env).strip(),
                  "pages-only-records-the-deployed-commit-in-the-lock (what release_batch.py done checks)", f"deployed={dep_2e}")
            _git(site, "push", "-q", "origin", "HEAD:main", env=env)
            rl.release(site, quiet=True)

            # Case 2f: origin/main unreadable -> fail-safe verifies all 3 kinds against R2
            _git(site, "clone", "-q", str(origin_bare), str(peer), env=env)
            _git(site, "update-ref", "-d", "refs/remotes/origin/main", env=env)
            r2_get_calls.clear()
            with contextlib.redirect_stdout(io.StringIO()):
                dc.verify_r2_seed_parity_for_pages_only(env, site)
            check(r2_get_calls == ["core", "records", "industries"], "pages-only-missing-origin-checks-all-3", f"got={r2_get_calls}")
            _git(site, "fetch", "-q", "origin", "main", env=env)

            # Case 2g: upload_r2_private_seeds full-deploy guards & atomic 2-pass validation
            # (i) r2_enabled=False -> fails closed
            rc_r2_off = None
            with contextlib.redirect_stderr(io.StringIO()), contextlib.redirect_stdout(io.StringIO()):
                try:
                    dc.upload_r2_private_seeds(env, False)
                except SystemExit as ex:
                    rc_r2_off = ex.code
            check(rc_r2_off == 2, "full-deploy-r2-disabled-aborts")

            # (ii) interleaved atomic guard: core matches core_v2 while records is stale -> 0 R2 puts (core stays old bytes!)
            (app_repo / "js" / "seed_core.json").write_bytes(core_v2)
            (app_repo / "js" / "seed_records.json").write_bytes(b'{"r":"corrupt"}')
            r2_remote["core"] = core_v1
            r2_put_calls.clear()
            rc_interleaved = None
            with contextlib.redirect_stderr(io.StringIO()), contextlib.redirect_stdout(io.StringIO()):
                try:
                    dc.upload_r2_private_seeds(env, True)
                except SystemExit as ex:
                    rc_interleaved = ex.code
            check(
                rc_interleaved == 2 and r2_put_calls == [] and r2_remote["core"] == core_v1,
                "full-deploy-atomic-validation-zero-puts-on-partial-failure",
                f"rc={rc_interleaved}, puts={r2_put_calls}",
            )

            # (ii-b) full dc.main([]) aborts BEFORE upload_secrets and releases newly acquired lock when local seed mismatches!
            upload_secrets_calls = 0
            deploy_pages_calls = 0
            rc_full_pre = None
            with contextlib.redirect_stderr(io.StringIO()), contextlib.redirect_stdout(io.StringIO()):
                try:
                    dc.main(["--skip-seed", "--skip-live-parity", "--skip-indexnow", "--allow-claimed-version", "--rotate-secrets"])
                except SystemExit as ex:
                    rc_full_pre = ex.code
            check(
                rc_full_pre == 2 and upload_secrets_calls == 0 and deploy_pages_calls == 0 and rl.read_remote_lock(site) == ("", {}),
                "full-deploy-preflight-aborts-before-rotate-secrets-and-releases-lock",
            )

            # (iii) matching local core_v2 uploads cleanly, second run skips (0 puts), force_r2_seeds re-uploads all 3
            (app_repo / "js" / "seed_records.json").write_bytes(recs_v1)
            r2_put_calls.clear()
            with contextlib.redirect_stdout(io.StringIO()):
                dc.upload_r2_private_seeds(env, True)
            check(set(r2_put_calls) == {"core", "records", "industries"}, "full-deploy-uploads-matching-seeds", f"puts={r2_put_calls}")

            r2_put_calls.clear()
            with contextlib.redirect_stdout(io.StringIO()):
                dc.upload_r2_private_seeds(env, True)
            check(r2_put_calls == [], "full-deploy-unchanged-skips-all-puts", f"puts={r2_put_calls}")

            r2_put_calls.clear()
            with contextlib.redirect_stdout(io.StringIO()):
                dc.upload_r2_private_seeds(env, True, force_r2_seeds=True)
            check(set(r2_put_calls) == {"core", "records", "industries"}, "full-deploy-force-r2-seeds-puts-all-3", f"puts={r2_put_calls}")

            # (iv) ISABI_APP_SRC override respected by upload_r2_private_seeds and print_dry_run_plan
            alt_app = base / "alt-app-src"
            _write_seed_tree(alt_app, core_b=b'{"alt":"stale"}', recs_b=recs_v1, ind_b=ind_v1, dcore_b=dc_b, drecs_b=dr_b, dind_b=di_b)
            os.environ["ISABI_APP_SRC"] = str(alt_app)
            dry_buf = io.StringIO()
            with contextlib.redirect_stdout(dry_buf):
                dc.print_dry_run_plan(dc.parse_cli_args(["--dry"]))
            rc_alt = None
            with contextlib.redirect_stderr(io.StringIO()), contextlib.redirect_stdout(io.StringIO()):
                try:
                    dc.upload_r2_private_seeds(env, True)
                except SystemExit as ex:
                    rc_alt = ex.code
            os.environ.pop("ISABI_APP_SRC", None)
            check(rc_alt == 2 and "UPLOAD(" in dry_buf.getvalue(), "full-deploy-respects-isabi-app-src-override")

            # (v) absent local seed_core.json + R2 mismatch or NoSuchKey -> fails closed
            (app_repo / "js" / "seed_core.json").unlink()
            r2_remote["core"] = core_v1
            dc.save_edge_meta({"r2_seed_shas": {"core": _sha10_bytes(core_v1) * 6 + "abcd"}})
            rc_absent_mismatch = None
            with contextlib.redirect_stderr(io.StringIO()), contextlib.redirect_stdout(io.StringIO()):
                try:
                    dc.upload_r2_private_seeds(env, True)
                except SystemExit as ex:
                    rc_absent_mismatch = ex.code
            check(rc_absent_mismatch == 2, "full-deploy-absent-local-verifies-r2-mismatch")

            r2_remote.pop("core")
            rc_absent_nokey = None
            with contextlib.redirect_stderr(io.StringIO()), contextlib.redirect_stdout(io.StringIO()):
                try:
                    dc.upload_r2_private_seeds(env, True)
                except SystemExit as ex:
                    rc_absent_nokey = ex.code
            check(rc_absent_nokey == 2, "full-deploy-absent-local-verifies-r2-nosuchkey")

        finally:
            if old_app_src_env is not None:
                os.environ["ISABI_APP_SRC"] = old_app_src_env
            else:
                os.environ.pop("ISABI_APP_SRC", None)
            if old_rel_lock_env is not None:
                os.environ["ISABI_RELEASE_LOCK"] = old_rel_lock_env
            else:
                os.environ.pop("ISABI_RELEASE_LOCK", None)
            for k, v in orig_attrs.items():
                setattr(dc, k, v)
            importlib.reload(dc)

    # 3. CLI --check-manifest and --check-seed-file subprocess tests (pass + negative/boundary cases)
    with tempfile.TemporaryDirectory(prefix="isabi-r2-parity-cli-", ignore_cleanup_errors=True) as td:
        base = pathlib.Path(td)
        app_cli = base / "app"
        core_b = b'{"cli":"core"}'
        recs_b = b'{"cli":"recs"}'
        ind_b = b'{"cli":"ind"}'
        dc_b, dr_b, di_b = b'{"cli":"dc"}', b'{"cli":"dr"}', b'{"cli":"di"}'
        _write_seed_tree(
            app_cli, core_b=core_b, recs_b=recs_b, ind_b=ind_b, dcore_b=dc_b, drecs_b=dr_b, dind_b=di_b,
            write_private=False, embed_index_d=_sha10_bytes(core_b),
        )
        seed_tmp = base / "seed_core_downloaded.json"
        seed_tmp.write_bytes(core_b)
        man_file = app_cli / "js" / "seed_manifest.js"

        r_ok_m = subprocess.run(
            [sys.executable, str(__file__), "--check-manifest", str(man_file), "--app-dir", str(app_cli)],
            capture_output=True, text=True, check=False,
        )
        check(r_ok_m.returncode == 0, "cli-check-manifest-pass", r_ok_m.stderr)

        # Relative manifest filename without --app-dir resolves cleanly via .resolve().parent.parent
        r_rel_m = subprocess.run(
            [sys.executable, str(__file__), "--check-manifest", "seed_manifest.js"],
            cwd=str(app_cli / "js"), capture_output=True, text=True, check=False,
        )
        check(r_rel_m.returncode == 0, "cli-check-manifest-relative-filename-pass", r_rel_m.stderr)

        # Empty --check-manifest "" fails with exit 2 instead of silently falling through to _run_suite()
        r_empty_m = subprocess.run(
            [sys.executable, str(__file__), "--check-manifest", ""],
            capture_output=True, text=True, check=False,
        )
        check(r_empty_m.returncode == 2, "cli-check-manifest-empty-rc2", r_empty_m.stdout)

        # Negative --check-manifest tests: tampered demo seed, missing demo seed, bad index &d=, corrupt manifest
        (app_cli / "js" / "seed_demo_core.json").write_bytes(b'{"cli":"bad_dc"}')
        r_bad_dc = subprocess.run(
            [sys.executable, str(__file__), "--check-manifest", str(man_file), "--app-dir", str(app_cli)],
            capture_output=True, text=True, check=False,
        )
        check(r_bad_dc.returncode == 1, "cli-check-manifest-mismatched-demo-rc1")
        (app_cli / "js" / "seed_demo_core.json").write_bytes(dc_b)

        (app_cli / "js" / "seed_demo_records.json").unlink()
        r_miss_dr = subprocess.run(
            [sys.executable, str(__file__), "--check-manifest", str(man_file), "--app-dir", str(app_cli)],
            capture_output=True, text=True, check=False,
        )
        check(r_miss_dr.returncode == 1, "cli-check-manifest-missing-demo-rc1")
        (app_cli / "js" / "seed_demo_records.json").write_bytes(dr_b)

        (app_cli / "index.html").write_text('<script src="js/seed_manifest.js?v=19.6.999&amp;d=0000000000"></script>', encoding="utf-8")
        r_bad_idx = subprocess.run(
            [sys.executable, str(__file__), "--check-manifest", str(man_file), "--app-dir", str(app_cli)],
            capture_output=True, text=True, check=False,
        )
        check(r_bad_idx.returncode == 1, "cli-check-manifest-bad-index-d-rc1")

        man_file.write_text("bad json", encoding="utf-8")
        r_corrupt_m = subprocess.run(
            [sys.executable, str(__file__), "--check-manifest", str(man_file), "--app-dir", str(app_cli)],
            capture_output=True, text=True, check=False,
        )
        check(r_corrupt_m.returncode == 2, "cli-check-manifest-corrupt-rc2")

        _write_seed_tree(app_cli, core_b=core_b, recs_b=recs_b, ind_b=ind_b, dcore_b=dc_b, drecs_b=dr_b, dind_b=di_b, write_private=False)
        r_ok_s = subprocess.run(
            [sys.executable, str(__file__), "--check-seed-file", "core", str(seed_tmp), "--manifest", str(man_file)],
            capture_output=True, text=True, check=False,
        )
        check(r_ok_s.returncode == 0, "cli-check-seed-file-pass", r_ok_s.stderr)

        seed_tmp.write_bytes(b'{"cli":"old_core"}')
        r_bad_s = subprocess.run(
            [sys.executable, str(__file__), "--check-seed-file", "core", str(seed_tmp), "--manifest", str(man_file)],
            capture_output=True, text=True, check=False,
        )
        check(r_bad_s.returncode == 1 and "Private seed mismatch" in r_bad_s.stderr, "cli-check-seed-file-fail-rc1", r_bad_s.stderr)

    # 4. Static wiring assertions across deploy.yml, sync_app.py, deploy_cloudflare.py
    wf_path = ISABI_ROOT / ".github" / "workflows" / "deploy.yml"
    wf_txt = wf_path.read_text(encoding="utf-8")
    i_off = wf_txt.find("python3 build/verify_r2_seed_parity.py")
    i_man = wf_txt.find("verify_r2_seed_parity.py --check-manifest app/js/seed_manifest.js --app-dir app")
    i_put = wf_txt.find('r2 object put "isabi-vault/seeds/seed_${kind}.json"')
    i_chk_cand = wf_txt.find('verify_r2_seed_parity.py --check-seed-file "$kind" "$candidate"')
    i_chk_get = wf_txt.find('verify_r2_seed_parity.py --check-seed-file "$kind" "$chk_file"')
    i_pages_dep = wf_txt.find("pages deploy")
    check(
        0 < i_off < i_man < i_chk_cand < i_chk_get < i_put < i_pages_dep,
        "deploy-yml-wires-manifest-and-r2-seed-checks-before-pages-deploy",
        f"positions={(i_off, i_man, i_chk_cand, i_chk_get, i_put, i_pages_dep)}",
    )
    dc_src = (BUILD_DIR / "deploy_cloudflare.py").read_text(encoding="utf-8")
    sa_src = (BUILD_DIR / "sync_app.py").read_text(encoding="utf-8")
    vp_src = pathlib.Path(__file__).read_text(encoding="utf-8")
    tok = "sys." + "argv"
    check(tok not in dc_src and tok not in sa_src and tok not in vp_src, "no-raw-sys-argv-token")

    print(f"PASS: verify_r2_seed_parity ({passed}/{total} checks)")
    return 0


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="build/verify_r2_seed_parity.py",
        description="Verify seed_manifest.js, demo seed hashes, and R2 private seed parity.",
        allow_abbrev=False,
    )
    parser.add_argument(
        "--check-manifest",
        metavar="MANIFEST",
        help="Validate seed_manifest.js, demo seeds, and index.html &d= parity.",
    )
    parser.add_argument(
        "--app-dir",
        metavar="DIR",
        help="Optional app directory containing js/ and index.html for --check-manifest.",
    )
    parser.add_argument(
        "--check-seed-file",
        nargs=2,
        metavar=("KIND", "FILE"),
        help="Verify downloaded/local seed_<KIND>.json SHA-256[:10] matches seed_manifest.js.",
    )
    parser.add_argument(
        "--manifest",
        metavar="MANIFEST",
        default=str(ISABI_ROOT / "app" / "js" / "seed_manifest.js"),
        help="Path to seed_manifest.js for --check-seed-file.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_arg_parser().parse_args(argv)
    if args.check_manifest is not None and args.check_seed_file is not None:
        print("ERROR: --check-manifest cannot be combined with --check-seed-file.", file=sys.stderr)
        return 2
    if args.app_dir is not None and args.check_manifest is None:
        print("ERROR: --app-dir requires --check-manifest.", file=sys.stderr)
        return 2
    if args.check_manifest is not None:
        if not str(args.check_manifest).strip():
            print("ERROR: --check-manifest requires a non-empty file path.", file=sys.stderr)
            return 2
        app_p = pathlib.Path(args.app_dir) if args.app_dir else None
        return _cli_check_manifest(pathlib.Path(args.check_manifest), app_p)
    if args.check_seed_file is not None:
        kind_raw, file_raw = args.check_seed_file
        if not str(file_raw).strip():
            print("ERROR: --check-seed-file FILE must be non-empty.", file=sys.stderr)
            return 2
        kind = str(kind_raw).strip().lower()
        if kind not in dc.SEED_KINDS:
            print(f"ERROR: Invalid seed kind {kind_raw!r}; expected one of {', '.join(dc.SEED_KINDS)}.", file=sys.stderr)
            return 2
        return _cli_check_seed_file(kind, pathlib.Path(file_raw), pathlib.Path(args.manifest))
    return _run_suite()


if __name__ == "__main__":
    raise SystemExit(main())
