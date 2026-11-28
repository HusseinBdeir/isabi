"""row_store_admin.py - the build scripts' switches for the Manufacturing row store (store-size plan step 2, stage B).

The live store is kept either as one document (the head row of `edge_kv_store` `mfg_web_store` plus its part rows)
or one entry per row in `store_rows` (functions/_lib/row_store.js). This program asks the live Edge, signed in with a
build ticket, to report on it or to change which of the two is the master.

  python build/row_store_admin.py status              what the Owner notice reads (read-only)
  python build/row_store_admin.py check               bring the rows in step and compare them with the stored text
  python build/row_store_admin.py cutover --owner-go  make the rows the master (saves then write only what changed)
  python build/row_store_admin.py restore             put the document back as the master (same text, same stamp)
  python build/row_store_admin.py rows-on | rows-off  keep the rows in step with every save, or leave them alone

`cutover` changes the master copy of the live books. It runs only with --owner-go (the owner said so, for this run),
and only when: nothing is reported for the Owner to look at, at least --min-clean comparisons came back clean and none
failed, the build scripts of this checkout read a commit record (row_store_read.py is beside this file), and a fresh
comparison passes right now. `restore` undoes it and must run before the server is rolled back to a version from
before the row store. --dry prints what would be asked and asks nothing but the status.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import urllib.error
import urllib.request

BUILD_DIR = pathlib.Path(__file__).resolve().parent
if str(BUILD_DIR) not in sys.path:
    sys.path.insert(0, str(BUILD_DIR))

ROW_STORE_URL = "https://isabisystems.com/app/api/row_store"
ACTIONS = {
    "check": "check",
    "cutover": "cutover",
    "restore": "restore_document",
    "rows-on": "rows_on",
    "rows-off": "rows_off",
}
DEFAULT_MIN_CLEAN = 100


def call(ticket: str, action: str | None, timeout: int = 60) -> tuple[int, dict]:
    """GET (action None) or POST {action} to the live route. Returns (HTTP status, JSON answer)."""
    body = None if action is None else json.dumps({"action": action}).encode("utf-8")
    req = urllib.request.Request(
        ROW_STORE_URL,
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": "ISABI-Row-Store-Admin/1.0", "X-ISABI-Session": ticket},
        method="GET" if action is None else "POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            return exc.code, json.loads(exc.read().decode("utf-8"))
        except Exception:  # noqa: BLE001
            return exc.code, {"ok": False, "error": f"HTTP {exc.code}"}


def describe(health: dict | None) -> list[str]:
    """The health answer as lines a person reads."""
    if not isinstance(health, dict):
        return ["no report (the route answered without one)"]
    rows = health.get("rows") or {}
    partial = health.get("partial") or {}
    out = [
        f"status: {health.get('status')}",
        f"master: {rows.get('master')}" + (f" (since {rows.get('masterSince')})" if rows.get("masterSince") else ""),
        f"rows kept in step: {'yes' if rows.get('mode') == 1 else 'no (mode ' + str(rows.get('mode')) + ')'}",
        f"comparisons: {rows.get('ok', 0)} clean, {rows.get('bad', 0)} failed (last {rows.get('checkedAt') or 'never'})",
        f"partial answers: {'on' if partial.get('on') else 'off'} (device comparisons {partial.get('auditOk', 0)} clean, {partial.get('auditBad', 0)} failed)",
    ]
    for issue in health.get("issues") or []:
        out.append(f"to look at: {issue.get('code')} x{issue.get('n')} ({issue.get('at') or 'no date'})")
    return out


def cutover_blockers(health: dict | None, min_clean: int) -> list[str]:
    """Why the switch-over must not be asked for (empty = nothing in the way)."""
    if not isinstance(health, dict):
        return ["the live Edge gave no report"]
    rows = health.get("rows") or {}
    why = []
    if rows.get("master") != "document":
        why.append(f"the master is already {rows.get('master')!r}")
    if health.get("status") != "ok" or (health.get("issues") or []):
        why.append("there is something for the Owner to look at (Sync Health); settle and reset it first")
    if rows.get("mode") != 1:
        why.append("the rows are not being kept in step (rows-on first)")
    if int(rows.get("bad") or 0) > 0:
        why.append(f"{rows.get('bad')} failed comparison(s) on record")
    if int(rows.get("ok") or 0) < min_clean:
        why.append(f"only {rows.get('ok') or 0} clean comparison(s) so far, {min_clean} wanted")
    if not (BUILD_DIR / "row_store_read.py").is_file():
        why.append("this checkout's build scripts do not read a commit record (row_store_read.py is missing)")
    return why


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], allow_abbrev=False)
    ap.add_argument("command", choices=["status", *ACTIONS.keys()])
    ap.add_argument("--owner-go", action="store_true", help="cutover only: the owner said to switch over, for this run")
    ap.add_argument("--min-clean", type=int, default=DEFAULT_MIN_CLEAN, help=f"cutover only: clean comparisons wanted first (default {DEFAULT_MIN_CLEAN})")
    ap.add_argument("--dry", action="store_true", help="ask for the status only and print what would be done")
    args = ap.parse_args(argv)

    import export_d1_seed as eds  # noqa: PLC0415  (issues the build ticket; this program is on its list)

    ticket = eds.mint_build_ticket()
    if not ticket:
        print("ERROR: no build ticket (sign this PC in to Cloudflare: python build/deploy_cloudflare.py --login).")
        return 2
    code, ans = call(ticket, None)
    if code != 200 or not ans.get("ok"):
        print(f"ERROR: the live Edge did not report (HTTP {code}: {ans.get('error') or ans}).")
        return 2
    health = ans.get("row_store")
    for line in describe(health):
        print(line)
    if args.command == "status":
        return 0 if isinstance(health, dict) and health.get("status") == "ok" else 1

    if args.command == "cutover":
        why = cutover_blockers(health, args.min_clean)
        if not args.owner_go:
            why.append("--owner-go was not given (the switch-over needs the owner's word for this run)")
        if why:
            print("NOT SWITCHED OVER:")
            for w in why:
                print(f"  - {w}")
            return 3
        if args.dry:
            print("[DRY RUN] would ask for: check, then cutover. Nothing asked.")
            return 0
        code, chk = call(ticket, "check", timeout=120)
        if code != 200 or not chk.get("ok") or chk.get("check") != "ok":
            print(f"NOT SWITCHED OVER: the comparison made just now did not pass (HTTP {code}: {chk.get('check') or chk.get('error')}).")
            return 3
    elif args.dry:
        print(f"[DRY RUN] would ask for: {ACTIONS[args.command]}. Nothing asked.")
        return 0

    code, res = call(ticket, ACTIONS[args.command], timeout=180)
    done = code == 200 and bool(res.get("ok"))
    detail = {k: v for k, v in res.items() if k != "row_store"}
    print(f"{args.command}: {'done' if done else 'NOT done'} (HTTP {code}) {json.dumps(detail, ensure_ascii=False)}")
    for line in describe(res.get("row_store")):
        print(f"  {line}")
    return 0 if done else 1


if __name__ == "__main__":
    sys.exit(main())
