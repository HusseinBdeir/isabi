"""export_d1_seed.py — Exports ISABI SQLite (data/mfg.db) + live Cloud Relay state (mfg_web_store)
into Cloudflare D1-compatible SQL batches (exports/d1_batches/batch_*.sql, gitignored).

Important Cloudflare D1 rule:
  Remote `wrangler d1 execute --remote --file=...` wraps each file in an implicit transaction
  and rejects explicit `BEGIN TRANSACTION` / `COMMIT`. Each batch stays <= 750 KB & <= 600 statements.
"""
import base64
import json
import os
import pathlib
import re
import shutil
import sqlite3
import subprocess
import sys
import urllib.request

ISABI_ROOT = pathlib.Path(__file__).resolve().parent.parent
APP_ROOT = ISABI_ROOT.parent / "isabi-app"
DB_PATH = APP_ROOT / "data" / "mfg.db"
SCHEMA_SQL = ISABI_ROOT / "migrations" / "0001_schema.sql"
OUT_DIR = ISABI_ROOT / "exports" / "d1_batches"
LIVE_CACHE_JSON = ISABI_ROOT / "exports" / "mfg_web_store_snapshot.json"

CR_KEY_TO_TABLE = {
    "receipts": "customer_receipts",
    "settlements": "supplier_payments",
}

MAX_BATCH_BYTES = 720_000
MAX_BATCH_STMTS = 550


def sql_lit(val) -> str:
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "1" if val else "0"
    if isinstance(val, (int, float)):
        if val != val:  # NaN
            return "NULL"
        return repr(val)
    if isinstance(val, (dict, list)):
        s = json.dumps(val, ensure_ascii=False)
    else:
        s = str(val)
    return "'" + s.replace("'", "''") + "'"


def parse_schema_columns(schema_text: str) -> dict[str, list[str]]:
    tables: dict[str, list[str]] = {}
    for m in re.finditer(r"CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-zA-Z0-9_]+)\s*\((.*?)\);", schema_text, re.S | re.I):
        tname = m.group(1)
        body = m.group(2)
        cols = []
        depth = 0
        cur_part = []
        parts = []
        for ch in body:
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
            if ch == "," and depth == 0:
                parts.append("".join(cur_part).strip())
                cur_part = []
            else:
                cur_part.append(ch)
        if cur_part:
            parts.append("".join(cur_part).strip())
        for p in parts:
            p_clean = re.sub(r"--[^\n]*", "", p).strip()
            if not p_clean or re.match(r"^(PRIMARY|UNIQUE|FOREIGN|CHECK|CONSTRAINT)\b", p_clean, re.I):
                continue
            cname = p_clean.split()[0].strip('"`')
            if cname:
                cols.append(cname)
        tables[tname] = cols
    return tables


def fetch_live_cloud_store() -> dict:
    ep_file = APP_ROOT / "js" / "endpoints.js"
    if ep_file.exists() and "--offline" not in sys.argv:
        try:
            ep_txt = ep_file.read_text(encoding="utf-8")
            m_u = re.search(r'MFG_CLOUD_CFG\s*=\s*\{[^}]*u:\s*"([^"]+)"', ep_txt, re.S)
            m_k = re.search(r'MFG_CLOUD_CFG\s*=\s*\{[^}]*k:\s*"([^"]+)"', ep_txt, re.S)
            if m_u and m_k:
                url = base64.b64decode(m_u.group(1)).decode("utf-8")
                key = base64.b64decode(m_k.group(1)).decode("utf-8")
                req = urllib.request.Request(
                    url,
                    data=json.dumps({"key": key, "op": "get_mfg", "doc": "mfg_web_store"}).encode("utf-8"),
                    headers={"Content-Type": "text/plain;charset=UTF-8"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=20) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                docs = data.get("docs") or data or {}
                remote = docs.get("mfg_web_store") or (data if "customRecords" in data else {})
                if remote:
                    OUT_DIR.parent.mkdir(parents=True, exist_ok=True)
                    LIVE_CACHE_JSON.write_text(json.dumps(remote, ensure_ascii=False), encoding="utf-8")
                    print(f"Pulled live mfg_web_store (updatedAt={remote.get('updatedAt')})")
                    return remote
        except Exception as ex:
            print(f"WARN: Live mfg_web_store pull skipped ({ex}); checking cached snapshot.")
    if LIVE_CACHE_JSON.exists():
        return json.loads(LIVE_CACHE_JSON.read_text(encoding="utf-8"))
    return {}


class BatchWriter:
    def __init__(self, out_dir: pathlib.Path):
        self.out_dir = out_dir
        if out_dir.exists():
            shutil.rmtree(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        self.batch_idx = 0
        self.cur_lines: list[str] = []
        self.cur_bytes = 0
        self.total_stmts = 0
        self.files: list[pathlib.Path] = []

    def add(self, stmt: str):
        line = stmt.rstrip().rstrip(";") + ";\n"
        b_len = len(line.encode("utf-8"))
        if self.cur_lines and (self.cur_bytes + b_len > MAX_BATCH_BYTES or len(self.cur_lines) >= MAX_BATCH_STMTS):
            self.flush()
        self.cur_lines.append(line)
        self.cur_bytes += b_len
        self.total_stmts += 1

    def flush(self):
        if not self.cur_lines:
            return
        fp = self.out_dir / f"batch_{self.batch_idx:04d}.sql"
        fp.write_text("".join(self.cur_lines), encoding="utf-8", newline="\n")
        self.files.append(fp)
        self.batch_idx += 1
        self.cur_lines = []
        self.cur_bytes = 0


def build_upsert_stmt(table: str, target_cols: list[str], row_dict: dict) -> str:
    col_set = set(target_cols)
    cols = []
    vals = []
    for k in target_cols:
        if k == "payload_json":
            continue
        if k in row_dict:
            cols.append(k)
            vals.append(sql_lit(row_dict[k]))
    if "payload_json" in col_set:
        clean_payload = {k: v for k, v in row_dict.items() if k != "payload_json" and v is not None and v != ""}
        cols.append("payload_json")
        vals.append(sql_lit(clean_payload))
    return f"INSERT OR REPLACE INTO {table} ({','.join(cols)}) VALUES ({','.join(vals)})"


def export_all() -> list[pathlib.Path]:
    schema_cols = parse_schema_columns(SCHEMA_SQL.read_text(encoding="utf-8"))
    writer = BatchWriter(OUT_DIR)

    # 1. Export all relational rows from data/mfg.db
    if DB_PATH.exists():
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        src_tables = [
            r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
        ]
        for t in src_tables:
            if t not in schema_cols:
                continue
            t_cols = schema_cols[t]
            rows = conn.execute(f'SELECT * FROM "{t}"').fetchall()
            for r in rows:
                writer.add(build_upsert_stmt(t, t_cols, dict(r)))
        conn.close()

    # 2. Overlay live mfg_web_store state (users, customRecords, biometrics, kioskPunches, schedules, full doc)
    remote = fetch_live_cloud_store()
    if remote:
        for u in (remote.get("users") or []):
            if isinstance(u, dict) and u.get("email") and u.get("full_name"):
                u_row = dict(u)
                u_row["id"] = str(u.get("id") or f"u-{u['email']}")
                writer.add(build_upsert_stmt("users", schema_cols["users"], u_row))

        for s in (remote.get("sessions") or [])[:40]:
            if isinstance(s, dict) and s.get("id"):
                writer.add(build_upsert_stmt("auth_sessions", schema_cols["auth_sessions"], s))

        cr = remote.get("customRecords") or {}
        for cr_key, rows in cr.items():
            if not isinstance(rows, list):
                continue
            canon_t = CR_KEY_TO_TABLE.get(cr_key, cr_key)
            if canon_t not in schema_cols:
                continue
            for rec in rows:
                if isinstance(rec, dict) and rec.get("id"):
                    writer.add(build_upsert_stmt(canon_t, schema_cols[canon_t], rec))

        for sk, entry in (remote.get("staffBiometrics") or {}).items():
            if sk and isinstance(entry, dict):
                writer.add(
                    f"INSERT OR REPLACE INTO staff_biometrics (staff_key, company, payload_json, updated_at) "
                    f"VALUES ({sql_lit(sk)}, {sql_lit(entry.get('company', ''))}, {sql_lit(entry)}, {sql_lit(entry.get('updated_at', ''))})"
                )

        for kp in (remote.get("kioskPunches") or []):
            if isinstance(kp, dict) and kp.get("id"):
                writer.add(
                    f"INSERT OR REPLACE INTO kiosk_punches (id, company, staff_name, punch_type, punched_at, rev, voided, payload_json, updated_at) "
                    f"VALUES ({sql_lit(kp.get('id'))}, {sql_lit(kp.get('company', ''))}, {sql_lit(kp.get('staff_name') or kp.get('staff') or '')}, "
                    f"{sql_lit(kp.get('type') or kp.get('direction') or '')}, {sql_lit(kp.get('punched_at') or kp.get('timestamp') or '')}, "
                    f"{int(kp.get('rev') or 1)}, {1 if kp.get('voided') else 0}, {sql_lit(kp)}, {sql_lit(kp.get('updated_at', ''))})"
                )

        if remote.get("workSchedules"):
            ws_ts = str(remote.get("updatedAt") or "")
            writer.add(
                f"INSERT OR REPLACE INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) "
                f"VALUES ('work_schedules', {sql_lit(remote['workSchedules'])}, {sql_lit(ws_ts)}, 'seed', 1)"
            )

        # Store complete mfg_web_store snapshot in 60,000-char chunks (< 100 KB D1 remote SQL statement cap)
        KV_CHUNK_CHARS = 60000
        raw_store_json = json.dumps(remote, ensure_ascii=False)
        upd_ts = remote.get("updatedAt") or ""
        upd_by = remote.get("updatedBy") or "seed"
        writer.add(
            f"DELETE FROM edge_kv_store WHERE doc_key LIKE 'mfg_web_store__part_%'"
        )
        writer.add(
            f"INSERT OR REPLACE INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) "
            f"VALUES ('mfg_web_store', {sql_lit(raw_store_json[:KV_CHUNK_CHARS])}, {sql_lit(upd_ts)}, {sql_lit(upd_by)}, 1)"
        )
        part_idx = 1
        for off in range(KV_CHUNK_CHARS, len(raw_store_json), KV_CHUNK_CHARS):
            part_key = f"mfg_web_store__part_{part_idx:04d}"
            chunk_str = raw_store_json[off : off + KV_CHUNK_CHARS]
            writer.add(
                f"INSERT OR REPLACE INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) "
                f"VALUES ({sql_lit(part_key)}, {sql_lit(chunk_str)}, {sql_lit(upd_ts)}, {sql_lit(upd_by)}, 1)"
            )
            part_idx += 1

    writer.flush()
    print(f"OK: Exported {writer.total_stmts:,} SQL statements across {len(writer.files)} D1 batch files -> {OUT_DIR}")
    return writer.files


def apply_local_wrangler(batch_files: list[pathlib.Path]):
    wrangler_cmd = shutil.which("wrangler") or r"C:\Users\hbdei\.local\node\wrangler.cmd"
    env = os.environ.copy()
    env["PATH"] = r"C:\Users\hbdei\.local\node;" + env.get("PATH", "")

    print("Applying 0001_schema.sql to local Wrangler D1...")
    subprocess.run(
        [wrangler_cmd, "d1", "execute", "isabi-ledger", "--local", "-y", f"--file={SCHEMA_SQL}"],
        cwd=str(ISABI_ROOT),
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        check=True,
    )
    print(f"Applying {len(batch_files)} data batches to local Wrangler D1...")
    # Local SQLite accepts combined SQL much faster via sqlite3 directly if .wrangler sqlite exists!
    d1_dir = ISABI_ROOT / ".wrangler" / "state" / "v3" / "d1" / "miniflare-D1DatabaseObject"
    sqlite_files = list(d1_dir.glob("*.sqlite")) if d1_dir.exists() else []
    if sqlite_files:
        target_sqlite = max(sqlite_files, key=lambda p: p.stat().st_mtime)
        conn = sqlite3.connect(str(target_sqlite))
        conn.execute("PRAGMA synchronous = OFF")
        conn.execute("PRAGMA journal_mode = MEMORY")
        for bf in batch_files:
            conn.executescript("BEGIN;\n" + bf.read_text(encoding="utf-8") + "\nCOMMIT;")
        conn.commit()
        conn.close()
        print(f"OK: Fast-loaded {len(batch_files)} batches directly into local Miniflare D1 ({target_sqlite.name})")
    else:
        for bf in batch_files:
            subprocess.run(
                [wrangler_cmd, "d1", "execute", "isabi-ledger", "--local", f"--file={bf}"],
                cwd=str(ISABI_ROOT),
                env=env,
                check=True,
            )


if __name__ == "__main__":
    batches = export_all()
    if "--apply-local" in sys.argv:
        apply_local_wrangler(batches)
