"""Gate: a deploy never replaces the live signing secret unless asked (owner 2026-11-17).

ISABI_JWT_SECRET signs every session; replacing it signs every user and tablet out. deploy_cloudflare.py uploads it
only with --rotate-secrets, or when the Pages project has no signing secret at all. Offline: wrangler and the
secret store are stand-ins, nothing live is touched and no secret value is printed.
"""
from __future__ import annotations

import contextlib
import io
import pathlib
import sys
from types import SimpleNamespace

sys.dont_write_bytecode = True
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import deploy_cloudflare as dc  # noqa: E402

PASS = 0
FAIL = 0


def check(cond: bool, label: str, detail: str = "") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ok   {label}")
    else:
        FAIL += 1
        print(f"  FAIL {label}" + (f" :: {detail}" if detail else ""))


REAL_LISTING = (
    " ⛅️ wrangler 4.158.0\n"
    "The \"production\" environment of your Pages project \"isabi-systems\" has access to the following secrets:\n"
    "  - GEMINI_API_KEY: Value Encrypted\n"
    "  - GOOGLE_MAPS_API_KEY: Value Encrypted\n"
    "  - ISABI_JWT_SECRET: Value Encrypted\n"
    "  - VT_GPS_API_HASH: Value Encrypted\n"
)
NO_JWT_LISTING = REAL_LISTING.replace("  - ISABI_JWT_SECRET: Value Encrypted\n", "")


class Rig:
    def __init__(self, *, listing: str | None, list_rc: int = 0, meta: dict | None = None, gem: str = "g-key"):
        self.listing = listing
        self.list_rc = list_rc
        self.meta = dict(meta or {})
        self.calls: list[tuple[list[str], str | None]] = []
        self.gem = gem

    def run_wrangler(self, args, env, input_text=None, check=True, retry=None):
        self.calls.append((list(args), input_text))
        if list(args[:3]) == ["pages", "secret", "list"]:
            return SimpleNamespace(returncode=self.list_rc, stdout=self.listing or "", stderr="" if self.list_rc == 0 else "Authentication error [code: 10000]")
        return SimpleNamespace(returncode=0, stdout="Success! Uploaded secret", stderr="")

    def puts(self) -> list[str]:
        return [a[3] for a, _ in self.calls if list(a[:3]) == ["pages", "secret", "put"]]

    def listed(self) -> bool:
        return any(list(a[:3]) == ["pages", "secret", "list"] for a, _ in self.calls)


def run_case(rig: Rig, *, rotate: bool) -> str:
    saved = {k: getattr(dc, k) for k in ("run_wrangler", "load_edge_meta", "save_edge_meta", "read_gemini_key", "read_google_maps_key")}
    env_saved = {k: dc.os.environ.pop(k, None) for k in ("VT_GPS_API_HASH", "VT_GPS_EMAIL", "VT_GPS_PASSWORD")}
    dc.run_wrangler = rig.run_wrangler
    dc.load_edge_meta = lambda: dict(rig.meta)
    dc.save_edge_meta = lambda m: rig.meta.clear() or rig.meta.update(m)
    dc.read_gemini_key = lambda: rig.gem
    dc.read_google_maps_key = lambda: ""
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            dc.upload_secrets({}, rotate_secrets=rotate)
    finally:
        for k, v in saved.items():
            setattr(dc, k, v)
        for k, v in env_saved.items():
            if v is not None:
                dc.os.environ[k] = v
    return buf.getvalue()


def main() -> int:
    print("verify_jwt_secret_keep: the live signing secret is replaced only when asked")

    # 1. Listing parser on the real wrangler 4 output.
    names = dc.PAGES_SECRET_NAME_RE.findall(REAL_LISTING)
    check(set(names) == {"GEMINI_API_KEY", "GOOGLE_MAPS_API_KEY", "ISABI_JWT_SECRET", "VT_GPS_API_HASH"},
          "secret listing parsed to names only", str(names))
    check("ISABI_JWT_SECRET" not in dc.PAGES_SECRET_NAME_RE.findall(NO_JWT_LISTING), "a listing without it reads as missing")

    # 2. Pure decision table.
    check(dc.jwt_secret_upload_decision(False, {"ISABI_JWT_SECRET"}) == "keep", "decision: live secret present -> keep")
    check(dc.jwt_secret_upload_decision(False, set()) == "upload", "decision: project has none -> upload")
    check(dc.jwt_secret_upload_decision(False, None) == "keep", "decision: listing failed -> keep")
    check(dc.jwt_secret_upload_decision(True, {"ISABI_JWT_SECRET"}) == "upload", "decision: --rotate-secrets -> upload")
    check(dc.jwt_secret_upload_decision(True, None) == "upload", "decision: --rotate-secrets without listing -> upload")

    # 3. A worktree with its own empty exports/ (the 2026-11-16 case): no secret is made, none uploaded.
    rig = Rig(listing=REAL_LISTING, meta={})
    out = run_case(rig, rotate=False)
    check("ISABI_JWT_SECRET" not in rig.puts(), "fresh worktree, live secret present: signing secret NOT uploaded", str(rig.puts()))
    check("jwt_secret" not in rig.meta, "fresh worktree: no local signing secret created")
    check("GEMINI_API_KEY" in rig.puts(), "fresh worktree: the other secrets still upload when changed")
    check("kept" in out, "says the live signing secret was kept")

    # 4. A PC holding a different (stale) local copy: still not uploaded.
    rig = Rig(listing=REAL_LISTING, meta={"jwt_secret": "stale-local-copy"})
    run_case(rig, rotate=False)
    check("ISABI_JWT_SECRET" not in rig.puts(), "stale local copy: signing secret NOT uploaded")
    check(all(inp != "stale-local-copy" for _, inp in rig.calls), "stale local copy never sent anywhere")

    # 5. Listing fails (signed out, outage): keep, warn, never upload.
    rig = Rig(listing=None, list_rc=1, meta={"jwt_secret": "x"})
    out = run_case(rig, rotate=False)
    check("ISABI_JWT_SECRET" not in rig.puts(), "listing failed: signing secret NOT uploaded")
    check("could not list" in out, "listing failed: warns")
    rig = Rig(listing="some unrelated output\n  - ISABI_X: y\n", list_rc=0, meta={})
    run_case(rig, rotate=False)
    check("ISABI_JWT_SECRET" not in rig.puts(), "listing that does not name the project: treated as failed, NOT uploaded")

    # 6. First deploy of a project with no signing secret: one is made and uploaded.
    rig = Rig(listing=NO_JWT_LISTING, meta={})
    run_case(rig, rotate=False)
    check("ISABI_JWT_SECRET" in rig.puts(), "project without a signing secret: uploaded")
    check(bool(rig.meta.get("jwt_secret")), "project without a signing secret: created locally first")
    sent = [inp for a, inp in rig.calls if a[:4] == ["pages", "secret", "put", "ISABI_JWT_SECRET"]]
    check(sent == [rig.meta.get("jwt_secret")], "the uploaded value is the one saved")

    # 7. --rotate-secrets: uploads, warns, does not need the listing.
    rig = Rig(listing=REAL_LISTING, meta={"jwt_secret": "chosen"})
    out = run_case(rig, rotate=True)
    check("ISABI_JWT_SECRET" in rig.puts(), "--rotate-secrets: uploaded")
    sent = [inp for a, inp in rig.calls if a[:4] == ["pages", "secret", "put", "ISABI_JWT_SECRET"]]
    check(bool(sent) and sent[0] != "chosen" and len(sent[0] or "") >= 40, "--rotate-secrets: a new value, never this PC's old copy")
    check(sent == [rig.meta.get("jwt_secret")], "--rotate-secrets: the new value is the one saved on this PC")
    check(not rig.listed(), "--rotate-secrets: no listing needed")
    check("signs in again" in out, "--rotate-secrets: warns that everyone signs in again")

    # 8. Unchanged other secrets are skipped on the second run; the signing secret is not in that fingerprint.
    rig = Rig(listing=REAL_LISTING, meta={})
    run_case(rig, rotate=False)
    first = len(rig.puts())
    rig.calls.clear()
    rig.meta["jwt_secret"] = "changed-locally"
    run_case(rig, rotate=False)
    check(first >= 1 and rig.puts() == [], "second run with unchanged keys uploads nothing (a local signing-secret change included)", str(rig.puts()))

    # 9. The listing is retried after a blip like the other read-only wrangler calls.
    check(dc.wrangler_is_idempotent(["pages", "secret", "list", "--project-name=isabi-systems"]), "secret listing is retry-safe")

    # 10. Source guard: exactly one place puts ISABI_JWT_SECRET, behind the decision.
    src = (HERE / "deploy_cloudflare.py").read_text(encoding="utf-8")
    check(src.count('"put", "ISABI_JWT_SECRET"') == 1, "one upload site for the signing secret")
    body = src.split("def upload_secrets", 1)[1].split("\ndef ", 1)[0]
    check(body.index("jwt_secret_upload_decision") < body.index('"put", "ISABI_JWT_SECRET"'), "upload sits behind the decision")
    check(body.index("load_or_create_jwt_secret") > body.index("jwt_secret_upload_decision"), "a local secret is created only after the decision")
    check(body.index("secrets.token_urlsafe") > body.index('if jwt_decision == "upload"'), "a new secret is made only inside the upload branch")

    print(f"verify_jwt_secret_keep: {PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
