"""Checks the GitHub runner used to make before every deploy, now made on the leader's PC (owner 2026-11-26).

The release leader's PC deploys (`deploy_cloudflare.py --pages-only`); a push to main deploys nothing. Two things the
runner's deploy relied on have to hold on the PC path as well:

  1. the Edge entry files parse (`node --check`), so a syntax slip never reaches the live functions;
  2. `migrations/0001_schema.sql` can run on every deploy and be run again after an unclear failure: every statement
     is `CREATE TABLE IF NOT EXISTS` or `CREATE [UNIQUE] INDEX IF NOT EXISTS`. `--pages-only` runs the file each time
     with a retry. A new column never belongs in this file (CREATE TABLE IF NOT EXISTS does not add one to a table
     that exists): columns are added where the Edge already adds them, in functions/_lib/d1_store.js.

Offline: nothing is sent anywhere. Runs in sync_app.py RELEASE_GATES and in the workflow's offline checks.
Test: python build/verify_deploy_preflight.py
"""
from __future__ import annotations

import pathlib
import re
import shutil
import subprocess
import sys

BUILD = pathlib.Path(__file__).resolve().parent
ROOT = BUILD.parent
EDGE_FILES = ("functions/_middleware.js", "functions/_lib/kiosk_verify.js", "functions/_lib/d1_store.js",
              "functions/_lib/web_push.js")
SCHEMA = ROOT / "migrations" / "0001_schema.sql"
_SAFE_STMT = re.compile(r"^CREATE\s+(?:TABLE|(?:UNIQUE\s+)?INDEX)\s+IF\s+NOT\s+EXISTS\b", re.IGNORECASE)

RESULTS: list[tuple[bool, str]] = []


def check(ok: bool, name: str, detail: str = "") -> None:
    RESULTS.append((bool(ok), name))
    if not ok:
        print(f"FAIL: {name}{(' :: ' + detail) if detail else ''}")


def schema_statements(sql: str) -> list[str]:
    """The file's statements, comments removed. A `;` inside a quoted string does not end a statement."""
    out, cur, i, n, quote = [], [], 0, len(sql), ""
    while i < n:
        ch = sql[i]
        if quote:
            cur.append(ch)
            if ch == quote:
                if i + 1 < n and sql[i + 1] == quote:   # '' inside a string
                    cur.append(sql[i + 1])
                    i += 1
                else:
                    quote = ""
        elif ch in ("'", '"'):
            quote = ch
            cur.append(ch)
        elif sql.startswith("--", i):
            j = sql.find("\n", i)
            i = n if j < 0 else j
            continue
        elif sql.startswith("/*", i):
            j = sql.find("*/", i + 2)
            i = n if j < 0 else j + 2
            continue
        elif ch == ";":
            out.append("".join(cur).strip())
            cur = []
        else:
            cur.append(ch)
        i += 1
    out.append("".join(cur).strip())
    return [s for s in out if s]


def unsafe_statements(sql: str) -> list[str]:
    return [s for s in schema_statements(sql) if not _SAFE_STMT.match(s)]


def main() -> int:
    # 1. the splitter and the rule themselves (so check 3 cannot pass by reading nothing)
    sample = ("-- a comment; with a semicolon\nCREATE TABLE IF NOT EXISTS t (a TEXT DEFAULT 'x;y', b TEXT);\n"
              "/* block; comment */ create unique index if not exists i ON t(a);\nCREATE INDEX IF NOT EXISTS j ON t(b);\n")
    check(len(schema_statements(sample)) == 3 and unsafe_statements(sample) == [],
          "the splitter reads three statements past comments and a quoted semicolon, all re-runnable")
    for bad in ("ALTER TABLE t ADD COLUMN c TEXT;", "INSERT INTO t VALUES (1);", "CREATE TABLE t (a TEXT);",
                "DROP TABLE IF EXISTS t;", "CREATE INDEX i ON t(a);", "UPDATE t SET a = 1;"):
        check(len(unsafe_statements(sample + bad)) == 1, f"a statement that cannot run twice is caught: {bad}")

    # 2. the Edge entry files parse
    node = shutil.which("node") or str(pathlib.Path.home() / ".local" / "node" / "node.exe")
    for rel in EDGE_FILES:
        p = ROOT / rel
        if not p.is_file():
            check(False, f"{rel} exists")
            continue
        r = subprocess.run([node, "--check", str(p)], capture_output=True, text=True, encoding="utf-8", errors="replace",
                           stdin=subprocess.DEVNULL, check=False)
        check(r.returncode == 0, f"node --check {rel}", (r.stderr or r.stdout or "").strip()[-300:])

    # 3. the schema can run on every deploy
    check(SCHEMA.is_file(), "migrations/0001_schema.sql exists")
    if SCHEMA.is_file():
        sql = SCHEMA.read_text(encoding="utf-8")
        stmts = schema_statements(sql)
        bad = unsafe_statements(sql)
        check(len(stmts) >= 10, "migrations/0001_schema.sql holds the schema (10 statements or more)", f"read {len(stmts)}")
        check(not bad, "every statement in migrations/0001_schema.sql is CREATE TABLE / INDEX IF NOT EXISTS "
                       "(deploy_cloudflare.py --pages-only runs the file on every deploy and retries it)",
              "; ".join(" ".join(s.split())[:90] for s in bad[:3]))

    # 4. wiring: the PC path runs these checks, and the deploy relies on the rule above
    dc = (BUILD / "deploy_cloudflare.py").read_text(encoding="utf-8")
    fn = dc.split("def apply_d1_schema_for_pages_only", 1)[-1].split("\ndef ", 1)[0]
    check('"d1", "execute", "isabi-ledger", "--remote", f"--file={SCHEMA_SQL}"' in fn and "retry=True" in fn,
          "deploy_cloudflare.py --pages-only applies migrations/0001_schema.sql with a retry (what check 3 keeps safe)")
    sa = (BUILD / "sync_app.py").read_text(encoding="utf-8")
    for rel in ("build/verify_deploy_preflight.py", "build/verify_kiosk_cloud.mjs", "build/verify_build_ticket.mjs",
                "build/verify_build_ticket_guard.py"):
        check(f'("isabi", "{rel}"' in sa, f"sync_app.py RELEASE_GATES runs {rel} (the runner no longer stands before a deploy)")
    wf = (ROOT / ".github" / "workflows" / "deploy.yml").read_text(encoding="utf-8")
    check("python3 build/verify_deploy_preflight.py" in wf, "the workflow's offline checks run this gate")

    failed = [n for ok, n in RESULTS if not ok]
    print(f"verify_deploy_preflight: {len(RESULTS) - len(failed)}/{len(RESULTS)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
