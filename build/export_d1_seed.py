"""export_d1_seed.py — Exports ISABI SQLite (data/mfg.db) + live merged Edge/Relay state (mfg_web_store)
into Cloudflare D1-compatible SQL batches (exports/d1_batches/batch_*.sql, gitignored).

Capabilities:
  - Dual-source live state pull: union-merges Cloudflare Edge D1 (`/app/api/sync`) + Legacy Relay (`endpoints.js`)
    so neither store can overwrite in-app ISABI edits/codes during or after DNS cutover.
  - Full SHA-256 row-manifest delta mode (`--delta`): compares every `(table, pk)` statement hash against
    `exports/d1_seed_manifest.json`, emitting ONLY added/modified `INSERT OR REPLACE` rows + `DELETE` statements
    for vanished rows (catches 100% of SharePoint `new_le`, `edits`, `vanished`, shifted `st0..stN` IDs, and
    in-app ISABI modifications while skipping unchanged rows).

Important Cloudflare D1 rule:
  Remote `wrangler d1 execute --remote --file=...` wraps each file in an implicit transaction
  and rejects explicit `BEGIN TRANSACTION` / `COMMIT`. Each batch stays <= 720 KB & <= 550 statements.

Usage:
  python build/export_d1_seed.py [--dry] [--delta | --full] [--offline] [--no-snapshot]
                                 [--commit-manifest] [--apply-local]
"""
from __future__ import annotations

import argparse
import base64
import copy
import datetime as dt
import hashlib
import hmac
import json
import math
import os
import pathlib
import re
import secrets
import shutil
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request

ISABI_ROOT = pathlib.Path(__file__).resolve().parent.parent
APP_ROOT = ISABI_ROOT.parent / "isabi-app"
DB_PATH = APP_ROOT / "data" / "mfg.db"
SNAPSHOT_JSON = APP_ROOT / "data" / "mfg_snapshot.json"
SEED_INDUSTRIES_JSON = APP_ROOT / "js" / "seed_industries.json"
EDGE_META_JSON = ISABI_ROOT / "exports" / "cloudflare_edge_meta.json"
SCHEMA_SQL = ISABI_ROOT / "migrations" / "0001_schema.sql"
OUT_DIR = ISABI_ROOT / "exports" / "d1_batches"
LIVE_CACHE_JSON = ISABI_ROOT / "exports" / "mfg_web_store_snapshot.json"
COMMITTED_MANIFEST_JSON = ISABI_ROOT / "exports" / "d1_seed_manifest.json"
PENDING_MANIFEST_JSON = OUT_DIR / "pending_manifest.json"

EDGE_SYNC_URLS = (
    "https://isabisystems.com/app/api/sync",
    "https://isabi-systems.pages.dev/app/api/sync",
)

CR_KEY_TO_TABLE = {
    "receipts": "customer_receipts",
    "settlements": "supplier_payments",
    "salaries": "salary_payments",
}

WRAPPER_TABLES = {
    "edge_kv_store",
    "alert_rules",
    "industry_custom_rows",
    "industry_row_edits",
    "staff_biometrics",
    "sentinel_reviews",
}

# Tables the Edge API alone writes at runtime (lazily created there). They are never exported from a local
# SQLite DB into live D1, whether or not they appear in 0001_schema.sql, and a delta never DELETEs their
# live rows either: local test approvals, audit rows and saved views must not reach or overwrite live ones.
EDGE_RUNTIME_TABLES = {
    "override_requests",
    "saved_views",
    "override_audit",
}

MULTI_INDUSTRY_COMPANIES = (
    {"key": "bdeirholding", "name": "Bdeir Holding", "code": "BH", "industry": "Holding", "currency": "USD", "usd_rate": 89500.0, "min_date": "2024-01-01"},
    {"key": "blanca", "name": "Blanca", "code": "BL", "industry": "Hospitality", "currency": "USD", "usd_rate": 89500.0, "min_date": "2024-01-01"},
    {"key": "launa", "name": "La Una", "code": "LU", "industry": "Hospitality", "currency": "USD", "usd_rate": 89500.0, "min_date": "2024-01-01"},
    {"key": "palms", "name": "Palms", "code": "PM", "industry": "Hospitality", "currency": "USD", "usd_rate": 89500.0, "min_date": "2024-01-01"},
    {"key": "voile", "name": "Voile", "code": "VL", "industry": "Hospitality", "currency": "USD", "usd_rate": 89500.0, "min_date": "2024-01-01"},
    {"key": "platinum", "name": "Platinum", "code": "PT", "industry": "Hospitality", "currency": "USD", "usd_rate": 89500.0, "min_date": "2024-01-01"},
    {"key": "korriauto", "name": "Korri Auto", "code": "KA", "industry": "Trading", "currency": "USD", "usd_rate": 89500.0, "min_date": "2024-01-01"},
    {"key": "shacman", "name": "Shacman", "code": "SH", "industry": "Trading", "currency": "USD", "usd_rate": 89500.0, "min_date": "2024-01-01"},
    {"key": "properties", "name": "Properties", "code": "PR", "industry": "Real Estate", "currency": "USD", "usd_rate": 89500.0, "min_date": "2024-01-01"},
    {"key": "4235company", "name": "4235 Company S.A.L", "code": "42", "industry": "Real Estate", "currency": "USD", "usd_rate": 89500.0, "min_date": "2024-01-01"},
    {"key": "insurance", "name": "Insurance Company", "code": "IN", "industry": "Insurance", "currency": "USD", "usd_rate": 89500.0, "min_date": "2024-01-01"},
)

CANON_COMPANY_MAP = {
    "wtc": "WTC",
    "wtc (world trading & construction)": "WTC",
    "bbconstruction": "BBConstruction",
    "bb construction": "BBConstruction",
    "bbc": "BBConstruction",
    "lionstransport": "Lions Transport",
    "lions transport": "Lions Transport",
    "lions": "Lions Transport",
    "bdeirholding": "Bdeir Holding",
    "bdeir holding": "Bdeir Holding",
    "blanca": "Blanca",
    "launa": "La Una",
    "la una": "La Una",
    "palms": "Palms",
    "voile": "Voile",
    "platinum": "Platinum",
    "korriauto": "Korri Auto",
    "korri auto": "Korri Auto",
    "shacman": "Shacman",
    "properties": "Properties",
    "4235company": "4235 Company S.A.L",
    "4235 company s.a.l": "4235 Company S.A.L",
    "4235": "4235 Company S.A.L",
    "insurance": "Insurance Company",
    "insurance company": "Insurance Company",
    "bdeir insurance brokerage": "Insurance Company",
}

TABLE_PK_COLS: dict[str, tuple[str, ...]] = {
    "companies": ("key",),
    "staff_biometrics": ("staff_key",),
    "edge_kv_store": ("doc_key",),
    "industry_custom_rows": ("bucket", "row_id"),
    "industry_row_edits": ("edit_key",),
    "phone_scan_sessions": ("sid",),
    "document_blobs": ("blob_id",),
}

MAX_BATCH_BYTES = 720_000
MAX_BATCH_STMTS = 550
MAX_STMT_BYTES = 95_000
KV_CHUNK_CHARS = 28_000


def canonicalize_company(val) -> str:
    s = str(val or "").strip()
    if not s:
        return ""
    k = re.sub(r"\s+", " ", s.lower())
    return CANON_COMPANY_MAP.get(k, s)


def file_sha256(path: pathlib.Path) -> str:
    if not path.exists():
        return ""
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while chunk := fh.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()


def stmt_hash(stmt: str) -> str:
    return hashlib.sha256(stmt.encode("utf-8")).hexdigest()[:24]


def encode_row_key(table: str, pk_vals: tuple[str, ...]) -> str:
    return json.dumps([table, *[str(v) for v in pk_vals]], ensure_ascii=False, separators=(",", ":"))


def decode_row_key(key_str: str) -> tuple[str, list[str]]:
    arr = json.loads(key_str)
    return str(arr[0]), [str(x) for x in arr[1:]]


def _join_sql_concat(tokens: list[str]) -> str:
    while len(tokens) > 1:
        tokens = [
            "(" + " || ".join(tokens[i:i + 16]) + ")" if len(tokens[i:i + 16]) > 1 else tokens[i]
            for i in range(0, len(tokens), 16)
        ]
    return tokens[0]


def sql_lit(val) -> str:
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "1" if val else "0"
    if isinstance(val, int):
        return str(val)
    if isinstance(val, float):
        if not math.isfinite(val):
            return "NULL"
        return repr(val)
    if isinstance(val, (dict, list)):
        s = json.dumps(val, ensure_ascii=False)
    else:
        s = str(val)
    if "\n" not in s and "\r" not in s and "\x00" not in s:
        return "'" + s.replace("'", "''") + "'"
    tokens: list[str] = []
    buf: list[str] = []
    ctrl: list[int] = []
    for ch in s:
        if ch in ("\r", "\n", "\x00"):
            if buf:
                tokens.append("'" + "".join(buf).replace("'", "''") + "'")
                buf = []
            ctrl.append(ord(ch))
        else:
            if ctrl:
                for j in range(0, len(ctrl), 32):
                    tokens.append("char(" + ",".join(str(c) for c in ctrl[j:j + 32]) + ")")
                ctrl = []
            buf.append(ch)
    if buf:
        tokens.append("'" + "".join(buf).replace("'", "''") + "'")
    if ctrl:
        for j in range(0, len(ctrl), 32):
            tokens.append("char(" + ",".join(str(c) for c in ctrl[j:j + 32]) + ")")
    return _join_sql_concat(tokens)


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


def _rec_ts(r: dict) -> str:
    return str(
        r.get("modified_at")
        or r.get("updated_at")
        or r.get("updatedAt")
        or r.get("voided_at")
        or r.get("entered_at")
        or r.get("_updatedAt")
        or r.get("_createdAt")
        or ""
    )


def _iso_ms_d1(val: object) -> int:
    s = str(val or "").strip()
    if not s:
        return 0
    if len(s) == 19 and s[10] == " ":
        s = s.replace(" ", "T") + "Z"
    elif s.endswith(("Z", "z")):
        s = s[:-1] + "+00:00"
    try:
        parsed = dt.datetime.fromisoformat(s)
    except ValueError:
        return 0
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return int(round(parsed.timestamp() * 1000))


def _rec_purge_ms(r: dict) -> int:
    if not isinstance(r, dict):
        return 0
    return max(
        _iso_ms_d1(_rec_ts(r)),
        _iso_ms_d1(r.get("restored_at")),
        _iso_ms_d1(r.get("price_entered_at")),
        _iso_ms_d1(r.get("salary_entered_at")),
    )


_LEGACY_POS_D1_RE = re.compile(
    r"^(?:(?:st|rp|fi|ex|exi|oil|rc|sp|sa|at|em|ls|cv|dt)\d+"
    r"|wbmalf-wtc-\d+|wbrecur-(?:wtc|bbc)-\d+"
    r"|dv-(?:hld|ins)-(?:exp|sal|set|rec)-\d+)(?:-i\d+)?$"
)
_SEED_TX_D1_RE = re.compile(
    r"^(?:(?:st|rp|fi|ex|exi|oil|rc|sp|sa|at|em|ls|cv|dt)(?:\d+|_[0-9a-f]{10,16})"
    r"|wbmalf-[a-z0-9-]+|wbrecur-[a-z0-9-]+"
    r"|dv-(?:hld|ins)-(?:exp|sal|set|rec)-(?:\d+|[0-9a-f]{8,16}))(?:-i\d+)?$"
)
_LEGACY_PURGED_ENTRY_D1_RE = re.compile(
    r"^[a-z_]+:(?:(?:(?:st|rp|fi|ex|exi|oil|rc|sp|sa|at|em|ls|cv|dt)\d+"
    r"|wbmalf-wtc-\d+|wbrecur-(?:wtc|bbc)-\d+"
    r"|dv-(?:hld|ins)-(?:exp|sal|set|rec)-\d+)(?:-i\d+)?"
    r"(?:@\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z)?"
    r"|(?:(?:st|rp|fi|ex|exi|oil|rc|sp|sa|at|em|ls|cv|dt)_[0-9a-f]{10,16}"
    r"|wbmalf-[a-z0-9-]+|wbrecur-[a-z0-9-]+"
    r"|dv-(?:hld|ins)-(?:exp|sal|set|rec)-[0-9a-f]{8,16})(?:-i\d+)?"
    r"@\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z)$"
)


def _add_purged_token_d1(
    raw_p: object,
    purged_bare: set[str],
    purged_timed: dict[str, str],
    purged_timed_ms: dict[str, int],
) -> None:
    ps = str(raw_p or "").strip()
    if not ps or not _LEGACY_PURGED_ENTRY_D1_RE.match(ps):
        return
    if "@" in ps:
        bk, ts = ps.split("@", 1)
        ms = _iso_ms_d1(ts)
        if ms <= 0:
            return
        prev_ts = purged_timed.get(bk)
        if not prev_ts or ms >= _iso_ms_d1(prev_ts):
            purged_timed[bk] = ts
            purged_timed_ms[bk] = ms
    else:
        purged_bare.add(ps)


def _collect_purged_state_d1(raw_lists: list) -> tuple[set[str], dict[str, str], dict[str, int]]:
    purged_bare: set[str] = set()
    purged_timed: dict[str, str] = {}
    purged_timed_ms: dict[str, int] = {}
    for src_list in raw_lists:
        if isinstance(src_list, list):
            for item in src_list:
                _add_purged_token_d1(item, purged_bare, purged_timed, purged_timed_ms)
    return purged_bare, purged_timed, purged_timed_ms


def _is_purged_by_state_d1(
    ck: str,
    row_id_s: str,
    row_obj: dict,
    purged_bare: set[str],
    purged_timed_ms: dict[str, int],
) -> bool:
    if isinstance(row_obj, dict) and row_obj.get("_reopenedExplicitly"):
        return False
    ek = f"{ck}:{row_id_s}"
    if ek in purged_bare:
        return True
    cutoff = purged_timed_ms.get(ek)
    if cutoff is not None:
        return _rec_purge_ms(row_obj) <= cutoff
    return False


def _record_tie_key(r: dict) -> tuple[int, str, int, int, str]:
    ed = str(r.get("end_date") or "").strip()[:10]
    has_closed_end = 1 if ("1900-01-01" <= ed < "2030-01-01") else 0
    rec_at = str(r.get("_reconciled_at") or "")
    has_mod = 1 if r.get("modified_by") else 0
    canon = json.dumps(r, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return (has_closed_end, rec_at, has_mod, len(canon), canon)


def _pick_newer_record(ra: dict, rb: dict) -> dict:
    """Deterministic tombstone-safe union winner between two versions of the same record."""
    va = bool(ra.get("voided"))
    vb = bool(rb.get("voided"))
    reva = int(ra.get("rev") or 1)
    revb = int(rb.get("rev") or 1)
    tsa = _rec_ts(ra)
    tsb = _rec_ts(rb)
    winner = ra
    if va != vb:
        non_void = rb if va else ra
        void_rec = ra if va else rb
        nv_rev = revb if va else reva
        v_rev = reva if va else revb
        nv_ts = tsb if va else tsa
        v_ts = tsa if va else tsb
        if non_void.get("_reopenedExplicitly") and (nv_rev > v_rev or (nv_ts and nv_ts > v_ts)):
            winner = non_void
        else:
            winner = void_rec
    elif (revb, tsb) > (reva, tsa):
        winner = rb
    elif (reva, tsa) > (revb, tsb):
        winner = ra
    elif _record_tie_key(rb) > _record_tie_key(ra):
        winner = rb
    out = copy.deepcopy(winner)
    if not out.get("_seed_orig"):
        orig = ra.get("_seed_orig") or rb.get("_seed_orig")
        if orig is not None:
            out["_seed_orig"] = copy.deepcopy(orig)
    return out


_TILL_OWNED_D1_RE = re.compile(r"^(?:POS-|TILL-|ZREP-)", re.IGNORECASE)
_CURATED_MEM_D1_RE = re.compile(r"^MEM-\d{4}-9\d{2}$", re.IGNORECASE)
_TRAIL_PAD_D1_RE = re.compile(r"^(.+)-0*(\d+)$")


def _load_industry_legacy_map_for_d1(db_path: pathlib.Path, use_snap: bool) -> dict[str, str]:
    out: dict[str, str] = {}
    cand_paths = [db_path.parent / "industry_legacy_id_map.json"]
    if use_snap:
        cand_paths.append(APP_ROOT / "data" / "industry_legacy_id_map.json")
    for mp in cand_paths:
        if mp.exists():
            try:
                raw = json.loads(mp.read_text(encoding="utf-8"))
                if isinstance(raw, dict):
                    for k, v in raw.items():
                        ks, vs = str(k or "").strip().upper(), str(v or "").strip()
                        if ks and vs and ks != vs.upper():
                            out[ks] = vs
                break
            except Exception:
                pass
    if use_snap and SEED_INDUSTRIES_JSON.exists():
        try:
            ind_p = json.loads(SEED_INDUSTRIES_JSON.read_text(encoding="utf-8"))
            s_pool = ind_p.get("_s") or []
            agr_t = (ind_p.get("tables") or {}).get("insurance.agreements")
            if isinstance(agr_t, dict) and "id" in (agr_t.get("c") or []):
                ci = agr_t["c"].index("id")
                is_sc = bool(agr_t["sc"][ci])
                for idx, row in enumerate(agr_t.get("r") or []):
                    v = row[ci]
                    aid = str(s_pool[v] if (is_sc and isinstance(v, int)) else (v or "")).strip()
                    alias = f"AGR-{idx + 1:03d}"
                    if aid and alias not in out and alias != aid.upper():
                        out[alias] = aid
        except Exception:
            pass
    return out


def _resolve_legacy_ind_id_d1(raw_id: object, leg_map: dict[str, str]) -> str:
    s = str(raw_id or "").strip()
    if not s or not leg_map or _CURATED_MEM_D1_RE.match(s) or _TILL_OWNED_D1_RE.match(s):
        return ""
    up = s.upper()
    hit = leg_map.get(up)
    if hit and hit.upper() != up:
        return hit
    m = _TRAIL_PAD_D1_RE.match(up)
    if m:
        pf, digits = m.group(1), m.group(2)
        for w in (2, 3, 4):
            cand = f"{pf}-{digits.zfill(w)}"
            hit2 = leg_map.get(cand)
            if hit2 and hit2.upper() != up:
                return hit2
    return ""


def _upgrade_remote_industry_stores(remote: dict, leg_map: dict[str, str]) -> tuple[list[tuple[str, str]], list[str]]:
    purged_rows: list[tuple[str, str]] = []
    purged_edits: list[str] = []
    if not isinstance(remote, dict) or not leg_map:
        return (purged_rows, purged_edits)
    edit_store = remote.get("industryRowEdits")
    if isinstance(edit_store, dict) and edit_store:
        new_edits: dict[str, dict] = {}
        for ek, val in edit_store.items():
            if not isinstance(val, dict):
                continue
            ek_s = str(ek).strip()
            parts = ek_s.split("::")
            tail_id = "::".join(parts[2:]).strip() if len(parts) >= 3 else ""
            new_id = _resolve_legacy_ind_id_d1(tail_id, leg_map) if tail_id and not _TILL_OWNED_D1_RE.match(tail_id) else ""
            target_key = f"{parts[0]}::{parts[1]}::{new_id}" if (new_id and new_id != tail_id) else ek_s
            migrated = copy.deepcopy(val)
            if new_id and new_id != tail_id:
                purged_edits.append(ek_s)
                if parts[0] != "WF":
                    migrated["primaryId"] = new_id
                    cells = migrated.get("cells")
                    if isinstance(cells, list) and cells and str(cells[0] or "").strip().upper() == tail_id.upper():
                        cells[0] = new_id
            prev_e = new_edits.get(target_key)
            if not prev_e:
                new_edits[target_key] = migrated
            else:
                ev, mv = bool(prev_e.get("voided")), bool(migrated.get("voided"))
                er, mr = int(prev_e.get("rev") or 1), int(migrated.get("rev") or 1)
                ets = str(prev_e.get("updated_at") or prev_e.get("updatedAt") or "")
                mts = str(migrated.get("updated_at") or migrated.get("updatedAt") or "")
                if mv and not ev and mr >= er:
                    new_edits[target_key] = {**prev_e, **migrated, "voided": True, "rev": max(er, mr)}
                elif not (ev and not mv and er >= mr) and ((mr, mts) >= (er, ets)):
                    new_edits[target_key] = {**prev_e, **migrated, "rev": max(er, mr)}
        remote["industryRowEdits"] = new_edits

    rows_store = remote.get("industryCustomRows")
    if isinstance(rows_store, dict) and rows_store:
        new_rows_store: dict[str, list] = {}
        for bucket, arr in rows_store.items():
            if not isinstance(arr, list):
                continue
            b_s = str(bucket).strip()
            dedup_by_up: dict[str, dict] = {}
            dedup_order: list[tuple[str, dict | None]] = []
            for r in arr:
                if not isinstance(r, dict):
                    continue
                rc = copy.deepcopy(r)
                raw_id = str(rc.get("id") or rc.get("code") or "").strip()
                new_id = _resolve_legacy_ind_id_d1(raw_id, leg_map)
                if new_id and new_id != raw_id:
                    if b_s and raw_id:
                        purged_rows.append((b_s, raw_id))
                    if rc.get("code") and str(rc["code"]).strip().upper() == raw_id.upper():
                        rc["code"] = new_id
                    rc["id"] = new_id
                for fk_col in ("autoClosePriorId", "_auto_closed_by_id"):
                    if rc.get(fk_col):
                        up_fk = _resolve_legacy_ind_id_d1(rc[fk_col], leg_map)
                        if up_fk and up_fk != rc[fk_col]:
                            rc[fk_col] = up_fk
                if isinstance(rc.get("autoClosePriorIds"), list):
                    rc["autoClosePriorIds"] = [
                        (_resolve_legacy_ind_id_d1(pid, leg_map) or pid) for pid in rc["autoClosePriorIds"]
                    ]
                k_up = str(rc.get("id") or rc.get("code") or "").strip().upper()
                if not k_up:
                    dedup_order.append(("", rc))
                elif k_up not in dedup_by_up:
                    dedup_by_up[k_up] = rc
                    dedup_order.append((k_up, None))
                else:
                    pv = dedup_by_up[k_up]
                    p_void, r_void = bool(pv.get("voided")), bool(rc.get("voided"))
                    p_rev, r_rev = int(pv.get("rev") or 1), int(rc.get("rev") or 1)
                    p_ts = str(pv.get("updated_at") or pv.get("_createdAt") or "")
                    r_ts = str(rc.get("updated_at") or rc.get("_createdAt") or "")
                    if r_void and not p_void and r_rev >= p_rev:
                        dedup_by_up[k_up] = {**pv, **rc, "voided": True, "rev": max(p_rev, r_rev)}
                    elif not (p_void and not r_void and p_rev >= r_rev) and ((r_rev, r_ts) >= (p_rev, p_ts)):
                        dedup_by_up[k_up] = {**pv, **rc, "rev": max(p_rev, r_rev)}
            new_rows_store[bucket] = [raw_r if raw_r is not None else dedup_by_up[ku] for ku, raw_r in dedup_order]
        remote["industryCustomRows"] = new_rows_store
    return (purged_rows, purged_edits)


def _is_valid_face_vec(v: object) -> bool:
    return (
        isinstance(v, list)
        and len(v) == 128
        and all(isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(float(x)) for x in v)
    )


def _has_real_samples(u: dict) -> bool:
    if u.get("face_redacted"):
        return False
    fs = u.get("face_samples")
    if isinstance(fs, str):
        try:
            fs = json.loads(fs)
        except Exception:
            fs = []
    return isinstance(fs, list) and any(_is_valid_face_vec(x) for x in fs)


def _pick_authoritative_user_id(ua: dict, ub: dict) -> tuple[str, bool]:
    id_a = str(ua.get("id") or "").strip()
    id_b = str(ub.get("id") or "").strip()
    auth_a = bool(ua.get("_d1_authoritative_id") and id_a)
    auth_b = bool(ub.get("_d1_authoritative_id") and id_b)
    if auth_a and not auth_b:
        return id_a, True
    if auth_b and not auth_a:
        return id_b, True
    if auth_a and auth_b:
        sa = str(ua.get("seat_updated_at") or "")
        sb = str(ub.get("seat_updated_at") or "")
        return (id_b if sb > sa else id_a), True
    canon_a = bool(re.match(r"^u\d+$", id_a))
    canon_b = bool(re.match(r"^u\d+$", id_b))
    if canon_a and not canon_b:
        return id_a, False
    if canon_b and not canon_a:
        return id_b, False
    sa = str(ua.get("seat_updated_at") or "")
    sb = str(ub.get("seat_updated_at") or "")
    return (id_b if (sb > sa and id_b) else (id_a or id_b)), False


def _merge_user_rows(ua: dict, ub: dict) -> dict:
    """Merge two user seat records, preserving authoritative D1 IDs, unredacted biometrics/PINs, newer seat_updated_at & face_cleared tombstones."""
    sa = str(ua.get("seat_updated_at") or "")
    sb = str(ub.get("seat_updated_at") or "")
    winner_ts = sb if sb > sa else sa
    loser_ts = sa if sb > sa else sb
    out = copy.deepcopy(ub if sb > sa else ua)
    other = ua if sb > sa else ub
    best_id, is_d1_auth = _pick_authoritative_user_id(ua, ub)
    if best_id:
        out["id"] = best_id
    if is_d1_auth:
        out["_d1_authoritative_id"] = True
    else:
        out.pop("_d1_authoritative_id", None)
    if out.get("pin_redacted"):
        if winner_ts and winner_ts > loser_ts:
            out["pin_code"] = ""
        elif str(other.get("pin_code") or "").strip() and not other.get("pin_redacted"):
            out["pin_code"] = other["pin_code"]
        else:
            out["pin_code"] = ""
    elif not str(out.get("pin_code") or "").strip() and str(other.get("pin_code") or "").strip() and not other.get("pin_redacted"):
        out["pin_code"] = other["pin_code"]
    win_u = ub if sb > sa else ua
    explicit_pin_cleared = (
        sa != sb
        and "pin_redacted" in win_u
        and win_u.get("pin_redacted") is False
        and not str(win_u.get("pin_code") or "").strip()
    )
    had_pin = bool(
        str(out.get("pin_code") or "").strip()
        or ua.get("pin_redacted")
        or ub.get("pin_redacted")
        or str(ua.get("pin_code") or "").strip()
        or str(ub.get("pin_code") or "").strip()
    )
    if str(out.get("pin_code") or "").strip():
        out.pop("pin_redacted", None)
    elif had_pin and not explicit_pin_cleared:
        out["pin_redacted"] = True
    else:
        out.pop("pin_redacted", None)
    out.pop("_verifiedPin", None)
    fa = str(ua.get("face_updated_at") or "")
    fb = str(ub.get("face_updated_at") or "")
    face_a = _has_real_samples(ua) or bool(ua.get("face_enrolled") and not ua.get("face_cleared"))
    face_b = _has_real_samples(ub) or bool(ub.get("face_enrolled") and not ub.get("face_cleared"))
    if _has_real_samples(ua) and not _has_real_samples(ub) and not (ub.get("face_cleared") and fb > fa):
        f_win = ua
    elif _has_real_samples(ub) and not _has_real_samples(ua) and not (ua.get("face_cleared") and fa > fb):
        f_win = ub
    elif face_a and not face_b and not (ub.get("face_cleared") and fb > fa):
        f_win = ua
    elif face_b and not face_a and not (ua.get("face_cleared") and fa > fb):
        f_win = ub
    elif fb > fa:
        f_win = ub
    elif fa > fb:
        f_win = ua
    else:
        f_win = win_u
    for fk in (
        "face_samples",
        "face_thumbs",
        "face_required",
        "face_updated_at",
        "face_cleared",
        "face_enrolled",
        "face_redacted",
        "face_sample_count",
    ):
        if fk in f_win:
            out[fk] = copy.deepcopy(f_win[fk])
        elif fk in out:
            out.pop(fk, None)
    if not f_win.get("face_cleared"):
        out.pop("face_cleared", None)
    if _has_real_samples(out):
        out.pop("face_redacted", None)
        out["face_enrolled"] = True
    la = str(ua.get("last_login_at") or "")
    lb = str(ub.get("last_login_at") or "")
    if max(la, lb):
        out["last_login_at"] = max(la, lb)
    return out


def merge_mfg_web_stores(doc_a: dict | None, doc_b: dict | None) -> dict:
    """Lossless union-merge across Cloudflare Edge D1 `mfg_web_store` and Legacy Relay `mfg_web_store`."""
    a = doc_a if isinstance(doc_a, dict) else {}
    b = doc_b if isinstance(doc_b, dict) else {}
    if not a and not b:
        return {}
    if not a:
        return copy.deepcopy(b)
    if not b:
        return copy.deepcopy(a)

    ts_a = str(a.get("updatedAt") or "")
    ts_b = str(b.get("updatedAt") or "")
    newer, older = (b, a) if ts_b > ts_a else (a, b)
    out = copy.deepcopy(newer)
    out["updatedAt"] = max(ts_a, ts_b)

    purged_bare, purged_timed, purged_timed_ms = _collect_purged_state_d1(
        [newer.get("_purgedOverrideIds"), older.get("_purgedOverrideIds")]
    )
    merged_purged = sorted(purged_bare | {f"{bk}@{ts}" for bk, ts in purged_timed.items()})[-2000:]
    if merged_purged:
        out["_purgedOverrideIds"] = merged_purged
    else:
        out.pop("_purgedOverrideIds", None)

    # 1. Users (deduplicate by normalized email first so Edge + Relay seats never emit colliding UNIQUE(email) rows)
    u_map: dict[str, dict] = {}
    u_order: list[str] = []
    for src in (newer.get("users") or [], older.get("users") or []):
        if not isinstance(src, list):
            continue
        for u in src:
            if not isinstance(u, dict):
                continue
            em_u = str(u.get("email") or "").strip().lower()
            uk = em_u or str(u.get("id") or "").strip()
            if not uk:
                continue
            u_norm = copy.deepcopy(u)
            if em_u:
                u_norm["email"] = em_u
            if uk not in u_map:
                u_map[uk] = u_norm
                u_order.append(uk)
            else:
                u_map[uk] = _merge_user_rows(u_map[uk], u_norm)
    if u_order:
        out["users"] = [u_map[k] for k in u_order]

    # 2. customRecords
    cr_new = newer.get("customRecords") if isinstance(newer.get("customRecords"), dict) else {}
    cr_old = older.get("customRecords") if isinstance(older.get("customRecords"), dict) else {}
    merged_cr: dict[str, list[dict]] = {}
    for tk in list(dict.fromkeys([*cr_new.keys(), *cr_old.keys()])):
        ln = cr_new.get(tk) if isinstance(cr_new.get(tk), list) else []
        lo = cr_old.get(tk) if isinstance(cr_old.get(tk), list) else []
        rmap: dict[str, dict] = {}
        rorder: list[str] = []
        for r in ln:
            if isinstance(r, dict) and r.get("id") is not None:
                rid = str(r["id"]).strip()
                if not rid:
                    continue
                if _is_purged_by_state_d1(tk, rid, r, purged_bare, purged_timed_ms):
                    continue
                rmap[rid] = copy.deepcopy(r)
                rorder.append(rid)
        for r in lo:
            if isinstance(r, dict) and r.get("id") is not None:
                rid = str(r["id"]).strip()
                if not rid:
                    continue
                if _is_purged_by_state_d1(tk, rid, r, purged_bare, purged_timed_ms):
                    continue
                if rid not in rmap:
                    rmap[rid] = copy.deepcopy(r)
                    rorder.append(rid)
                else:
                    rmap[rid] = _pick_newer_record(rmap[rid], r)
        merged_cr[tk] = [rmap[rid] for rid in rorder]
    out["customRecords"] = merged_cr

    # 3. kioskPunches
    kp_map: dict[str, dict] = {}
    kp_order: list[str] = []
    for src in (newer.get("kioskPunches") or [], older.get("kioskPunches") or []):
        if not isinstance(src, list):
            continue
        for p in src:
            if isinstance(p, dict) and p.get("id"):
                pid = str(p["id"]).strip()
                if pid not in kp_map:
                    kp_map[pid] = copy.deepcopy(p)
                    kp_order.append(pid)
                else:
                    kp_map[pid] = _pick_newer_record(kp_map[pid], p)
    if kp_order:
        out["kioskPunches"] = [kp_map[k] for k in kp_order]

    # 4. Keyed timestamp maps: staffBiometrics, sentinelReviews, industryRowEdits
    for map_key in ("staffBiometrics", "sentinelReviews", "industryRowEdits"):
        mn = newer.get(map_key) if isinstance(newer.get(map_key), dict) else {}
        mo = older.get(map_key) if isinstance(older.get(map_key), dict) else {}
        if mn or mo:
            m_out = copy.deepcopy(mn)
            for k, vo in mo.items():
                if not isinstance(vo, dict):
                    continue
                vn = m_out.get(k)
                if not isinstance(vn, dict):
                    m_out[k] = copy.deepcopy(vo)
                elif map_key == "industryRowEdits":
                    m_out[k] = _pick_newer_record(vn, vo)
                else:
                    tn = str(vn.get("updated_at") or vn.get("checked_at") or "")
                    to = str(vo.get("updated_at") or vo.get("checked_at") or "")
                    if to > tn:
                        m_out[k] = copy.deepcopy(vo)
            out[map_key] = m_out

    # 5. industryCustomRows
    icn = newer.get("industryCustomRows") if isinstance(newer.get("industryCustomRows"), dict) else {}
    ico = older.get("industryCustomRows") if isinstance(older.get("industryCustomRows"), dict) else {}
    if icn or ico:
        ic_out: dict[str, list[dict]] = {}
        for bk in list(dict.fromkeys([*icn.keys(), *ico.keys()])):
            rmap: dict[str, dict] = {}
            rorder: list[str] = []
            for src_list in (icn.get(bk) or [], ico.get(bk) or []):
                if not isinstance(src_list, list):
                    continue
                for r in src_list:
                    if not isinstance(r, dict):
                        continue
                    rid = str(r.get("id") or r.get("code") or "").strip()
                    if not rid:
                        continue
                    if rid not in rmap:
                        rmap[rid] = copy.deepcopy(r)
                        rorder.append(rid)
                    else:
                        rmap[rid] = _pick_newer_record(rmap[rid], r)
            ic_out[bk] = [rmap[k] for k in rorder]
        out["industryCustomRows"] = ic_out

    # 6. alertRules
    arn = newer.get("alertRules") if isinstance(newer.get("alertRules"), dict) else {}
    aro = older.get("alertRules") if isinstance(older.get("alertRules"), dict) else {}
    if arn or aro:
        ov_out = copy.deepcopy(arn.get("overrides") if isinstance(arn.get("overrides"), dict) else {})
        for rk, rv in (aro.get("overrides") if isinstance(aro.get("overrides"), dict) else {}).items():
            if not isinstance(rv, dict):
                continue
            ex = ov_out.get(rk)
            if not isinstance(ex, dict) or str(rv.get("updated_at") or "") > str(ex.get("updated_at") or ""):
                ov_out[rk] = copy.deepcopy(rv)
        c_map: dict[str, dict] = {}
        c_order: list[str] = []
        for src_c in (arn.get("custom") or [], aro.get("custom") or []):
            if not isinstance(src_c, list):
                continue
            for cr in src_c:
                if isinstance(cr, dict) and cr.get("id"):
                    cid = str(cr["id"])
                    if cid not in c_map:
                        c_map[cid] = copy.deepcopy(cr)
                        c_order.append(cid)
                    elif str(cr.get("updated_at") or "") > str(c_map[cid].get("updated_at") or ""):
                        c_map[cid] = copy.deepcopy(cr)
        out["alertRules"] = {"overrides": ov_out, "custom": [c_map[k] for k in c_order]}

    # 7. workSchedules (shiftTypes, policyGroups, companyPolicyDefaults, staffRules)
    wsn = newer.get("workSchedules") if isinstance(newer.get("workSchedules"), dict) else {}
    wso = older.get("workSchedules") if isinstance(older.get("workSchedules"), dict) else {}
    if wsn or wso:
        ws_out = copy.deepcopy(wsn or wso)
        for list_k in ("shiftTypes", "policyGroups"):
            l_map: dict[str, dict] = {}
            l_order: list[str] = []
            for src_l in (wsn.get(list_k) or [], wso.get(list_k) or []):
                if not isinstance(src_l, list):
                    continue
                for item in src_l:
                    if not isinstance(item, dict):
                        continue
                    raw_id = item.get("id") or (item.get("shift_code") if list_k == "shiftTypes" else None)
                    if not raw_id:
                        continue
                    ik = (
                        f"{str(item.get('company') or 'All BUs').strip().lower()}|{str(raw_id).strip().lower()}"
                        if list_k == "shiftTypes"
                        else str(raw_id)
                    )
                    if ik not in l_map:
                        l_map[ik] = copy.deepcopy(item)
                        l_order.append(ik)
                    elif str(item.get("updated_at") or "") > str(l_map[ik].get("updated_at") or ""):
                        l_map[ik] = copy.deepcopy(item)
            if l_order:
                ws_out[list_k] = [l_map[k] for k in l_order]
        for dict_k in ("companyPolicyDefaults", "staffRules"):
            dn = wsn.get(dict_k) if isinstance(wsn.get(dict_k), dict) else {}
            do = wso.get(dict_k) if isinstance(wso.get(dict_k), dict) else {}
            if dn or do:
                d_merged = copy.deepcopy(dn)
                for rk, rv in do.items():
                    if not isinstance(rv, dict):
                        if rk not in d_merged:
                            d_merged[rk] = copy.deepcopy(rv)
                        continue
                    ex = d_merged.get(rk)
                    if not isinstance(ex, dict) or str(rv.get("updated_at") or "") > str(ex.get("updated_at") or ""):
                        d_merged[rk] = copy.deepcopy(rv)
                ws_out[dict_k] = d_merged
        out["workSchedules"] = ws_out

    return out


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _mint_cli_edge_jwt(ttl_sec: int = 300) -> str:
    secret = (os.environ.get("ISABI_JWT_SECRET") or "").strip()
    if not secret and EDGE_META_JSON.exists():
        try:
            meta = json.loads(EDGE_META_JSON.read_text(encoding="utf-8"))
            secret = str(meta.get("jwt_secret") or "").strip()
        except Exception:
            secret = ""
    if len(secret) < 16 and os.environ.get("ISABI_ALLOW_DEV_SECRET") == "1":
        secret = "isabi-edge-dev-fallback-secret-change-in-prod"
    if len(secret) < 16:
        return ""
    now_sec = int(time.time())
    cli_sid = "sess-1792845760786"
    if DB_PATH.exists():
        try:
            with sqlite3.connect(str(DB_PATH)) as _con:
                _row = _con.execute(
                    "SELECT id FROM auth_sessions WHERE lower(email) = 'husseinbdeir@bhfirms.com' ORDER BY logged_in_at ASC LIMIT 1"
                ).fetchone()
                if _row and _row[0]:
                    cli_sid = str(_row[0]).strip()
        except Exception:
            pass
    hdr = _b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode("utf-8"))
    payload = _b64url_encode(
        json.dumps(
            {
                "sid": cli_sid,
                "sub": "u1",
                "email": "husseinbdeir@bhfirms.com",
                "role": "Full Access (Owner)",
                "companies": "All",
                "iat": now_sec,
                "exp": now_sec + ttl_sec,
                "iss": "isabi-edge-v1",
            },
            separators=(",", ":"),
        ).encode("utf-8")
    )
    signing_input = f"{hdr}.{payload}"
    sig = hmac.new(secret.encode("utf-8"), signing_input.encode("utf-8"), hashlib.sha256).digest()
    return f"{signing_input}.{_b64url_encode(sig)}"


_ORIG_URLOPEN = urllib.request.urlopen
_ORIG_MINT_CLI_EDGE_JWT = _mint_cli_edge_jwt


class _WranglerD1BatchError(RuntimeError):
    """Wrangler D1 JSON response reported success=false or an explicit error."""


def _extract_wrangler_results(parsed: object) -> list[dict] | None:
    if isinstance(parsed, list):
        if not parsed or not all(isinstance(x, dict) for x in parsed):
            return None
        if not any(("results" in x or "success" in x or "error" in x) for x in parsed):
            return None
        out: list[dict] = []
        for item in parsed:
            if item.get("success") is False or item.get("error"):
                raise _WranglerD1BatchError(f"wrangler d1 execute error: {item.get('error') or item}")
            res = item.get("results")
            if isinstance(res, list):
                out.extend(r for r in res if isinstance(r, dict))
        return out
    if isinstance(parsed, dict):
        if parsed.get("success") is False or parsed.get("error") or (isinstance(parsed.get("errors"), list) and parsed["errors"]):
            raise _WranglerD1BatchError(
                f"wrangler d1 execute error: {parsed.get('error') or parsed.get('errors') or parsed}"
            )
        if isinstance(parsed.get("result"), list):
            r_list = parsed["result"]
            if r_list and not all(isinstance(x, dict) for x in r_list):
                return None
            out = []
            for item in r_list:
                if item.get("success") is False or item.get("error"):
                    raise _WranglerD1BatchError(f"wrangler d1 execute error: {item.get('error') or item}")
                res = item.get("results")
                if isinstance(res, list):
                    out.extend(r for r in res if isinstance(r, dict))
            return out
        if isinstance(parsed.get("results"), list):
            return [r for r in parsed["results"] if isinstance(r, dict)]
    return None


def _parse_wrangler_json_rows(raw_out: str) -> list[dict]:
    s = (raw_out or "").strip()
    if s:
        try:
            direct = _extract_wrangler_results(json.loads(s))
            if direct is not None:
                return direct
        except _WranglerD1BatchError:
            raise
        except Exception:
            pass
        dec = json.JSONDecoder()
        for idx, ch in enumerate(s):
            if ch not in "[{":
                continue
            try:
                cand, _end = dec.raw_decode(s, idx)
            except Exception:
                continue
            rows = _extract_wrangler_results(cand)
            if rows is not None:
                return rows
    raise RuntimeError("wrangler d1 execute returned unexpected JSON shape")


def _wrangler_d1_query(sql: str, timeout: int = 60) -> list[dict]:
    """Read-only remote D1 query via Wrangler OAuth (`isabi-ledger`), returning result rows."""
    env = os.environ.copy()
    env.pop("ELECTRON_RUN_AS_NODE", None)
    env["CI"] = "1"
    env["WRANGLER_SEND_METRICS"] = "false"
    extra_dirs = [
        d for d in (
            r"C:\Users\hbdei\.local\node",
            str(pathlib.Path.home() / ".local" / "node"),
            os.path.join(env.get("APPDATA", ""), "npm"),
        )
        if d and os.path.isdir(d)
    ]
    if extra_dirs:
        cur_path = env.get("PATH", "")
        env["PATH"] = os.pathsep.join(extra_dirs) + (os.pathsep + cur_path if cur_path else "")
    wbin = (
        shutil.which("wrangler.cmd", path=env.get("PATH"))
        or shutil.which("wrangler", path=env.get("PATH"))
        or r"C:\Users\hbdei\.local\node\wrangler.cmd"
    )
    proc = subprocess.run(
        [wbin, "d1", "execute", "isabi-ledger", "--remote", "--json", "--command", sql],
        cwd=str(ISABI_ROOT),
        env=env,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        check=False,
    )
    if proc.returncode != 0:
        msg = (proc.stderr or proc.stdout or f"exit {proc.returncode}").strip().splitlines()[-1][:200]
        raise RuntimeError(f"wrangler d1 execute failed: {msg}")
    return _parse_wrangler_json_rows(proc.stdout or "")


_ORIG_WRANGLER_D1_QUERY = _wrangler_d1_query


def _stitch_kv_rows(kv_rows: list[dict], doc_key: str) -> tuple[dict | None, str, bool]:
    """Stitch `doc_key` + `doc_key__part_%` rows identically to `d1_store.js` readEdgeKvDoc."""
    head = None
    parts: list[tuple[str, str]] = []
    part_prefix = f"{doc_key}__part_"
    for row in kv_rows:
        if not isinstance(row, dict):
            continue
        dk = str(row.get("doc_key") or "")
        if dk == doc_key:
            head = row
        elif dk.startswith(part_prefix):
            parts.append((dk, str(row.get("payload_json") or "")))
    if head is None:
        return None, "", bool(parts)
    parts.sort(key=lambda x: x[0])
    stitched = str(head.get("payload_json") or "") + "".join(p for _, p in parts)
    try:
        parsed = json.loads(stitched) if stitched else None
    except Exception:
        parsed = None
    if not isinstance(parsed, dict) or not parsed:
        return None, str(head.get("updated_at") or ""), True
    return parsed, str(head.get("updated_at") or ""), False


def _merge_work_schedules_overlay(prev_ws: dict, next_ws: dict) -> dict:
    """Merge `work_schedules` sub-store onto `mfg_web_store.workSchedules` using `updated_at` parity with `d1_store.js`."""
    if not isinstance(next_ws, dict) or not next_ws:
        return copy.deepcopy(prev_ws) if isinstance(prev_ws, dict) else {}
    out = copy.deepcopy(prev_ws) if isinstance(prev_ws, dict) else {}
    for list_k in ("policyGroups", "shiftTypes"):
        base_list = out.get(list_k) if isinstance(out.get(list_k), list) else []
        nxt_list = next_ws.get(list_k) if isinstance(next_ws.get(list_k), list) else []
        if not base_list and not nxt_list:
            continue
        items: dict[str, dict] = {}
        order: list[str] = []

        def _item_key(item: dict) -> str:
            if list_k == "shiftTypes":
                return f"{str(item.get('company') or 'All BUs').strip().lower()}|{str(item.get('id') or item.get('shift_code') or '').strip().lower()}"
            return str(item.get("id") or "")

        for item in base_list:
            if isinstance(item, dict) and (item.get("id") or (list_k == "shiftTypes" and item.get("shift_code"))):
                ik = _item_key(item)
                if ik and ik not in items:
                    items[ik] = copy.deepcopy(item)
                    order.append(ik)
        for item in nxt_list:
            if isinstance(item, dict) and (item.get("id") or (list_k == "shiftTypes" and item.get("shift_code"))):
                ik = _item_key(item)
                if not ik:
                    continue
                cur = items.get(ik)
                cur_ts = str(cur.get("updated_at") or "") if isinstance(cur, dict) else ""
                nxt_ts = str(item.get("updated_at") or "")
                if cur is None or not cur_ts or not nxt_ts or nxt_ts >= cur_ts:
                    if cur is None:
                        order.append(ik)
                    items[ik] = copy.deepcopy(item)
        out[list_k] = [items[k] for k in order]
    for dict_k in ("companyPolicyDefaults", "staffRules"):
        base_d = out.get(dict_k) if isinstance(out.get(dict_k), dict) else {}
        nxt_d = next_ws.get(dict_k) if isinstance(next_ws.get(dict_k), dict) else {}
        if not base_d and not nxt_d:
            continue
        merged_d = copy.deepcopy(base_d)
        for rk, rv in nxt_d.items():
            if not isinstance(rv, dict):
                continue
            cur = merged_d.get(rk)
            cur_ts = str(cur.get("updated_at") or "") if isinstance(cur, dict) else ""
            nxt_ts = str(rv.get("updated_at") or "")
            if not isinstance(cur, dict) or not cur_ts or not nxt_ts or nxt_ts >= cur_ts:
                merged_d[rk] = copy.deepcopy(rv)
        out[dict_k] = merged_d
    return out


def _overlay_d1_rows_on_store(
    remote: dict,
    ar_rows: list[dict],
    ws_rows: list[dict],
    u_rows: list[dict],
    s_rows: list[dict] | None = None,
) -> dict:
    """Apply canonical D1 sub-stores (`alert_rules`, `work_schedules`, `users`, `auth_sessions`) onto `mfg_web_store`."""
    if ar_rows:
        base_ar = remote.get("alertRules") if isinstance(remote.get("alertRules"), dict) else {}
        merged_ov = copy.deepcopy(base_ar.get("overrides") if isinstance(base_ar.get("overrides"), dict) else {})
        sql_custom: list[dict] = []
        deleted_custom: set[str] = set()
        for r in ar_rows:
            if not isinstance(r, dict):
                continue
            try:
                obj = json.loads(r.get("payload_json") or "")
            except Exception:
                obj = None
            if not isinstance(obj, dict):
                continue
            if r.get("kind") == "custom":
                cid = str(obj.get("id") or r.get("id") or "")
                if obj.get("deleted"):
                    if cid:
                        deleted_custom.add(cid)
                else:
                    sql_custom.append(obj)
            elif r.get("id"):
                oid = str(r["id"])
                cur = merged_ov.get(oid)
                cur_ts = str(cur.get("updated_at") or "") if isinstance(cur, dict) else ""
                sql_ts = str(obj.get("updated_at") or "")
                if not isinstance(cur, dict) or not cur_ts or not sql_ts or sql_ts >= cur_ts:
                    merged_ov[oid] = obj
        cust_map: dict[str, dict] = {}
        cust_order: list[str] = []
        for bc in (base_ar.get("custom") or []):
            if isinstance(bc, dict) and bc.get("id") and not bc.get("deleted"):
                cid = str(bc["id"])
                if cid not in deleted_custom and cid not in cust_map:
                    cust_map[cid] = copy.deepcopy(bc)
                    cust_order.append(cid)
        for sc in sql_custom:
            cid = str(sc.get("id") or "")
            if not cid:
                continue
            cur = cust_map.get(cid)
            cur_ts = str(cur.get("updated_at") or "") if isinstance(cur, dict) else ""
            sql_ts = str(sc.get("updated_at") or "")
            if cur is None or not cur_ts or not sql_ts or sql_ts >= cur_ts:
                if cur is None:
                    cust_order.append(cid)
                cust_map[cid] = copy.deepcopy(sc)
        remote["alertRules"] = {"overrides": merged_ov, "custom": [cust_map[k] for k in cust_order]}

    if ws_rows:
        ws_doc, _ws_ts, ws_bad = _stitch_kv_rows(ws_rows, "work_schedules")
        if ws_bad:
            remote["_wsUnreadable"] = True
        elif ws_doc:
            remote["workSchedules"] = _merge_work_schedules_overlay(remote.get("workSchedules") or {}, ws_doc)

    if u_rows:
        d1_users: list[dict] = []
        for r in u_rows:
            if not isinstance(r, dict):
                continue
            try:
                base_u = json.loads(r.get("payload_json") or "{}")
            except Exception:
                base_u = {}
            u_obj = dict(base_u) if isinstance(base_u, dict) else {}
            for col in (
                "id", "full_name", "email", "role", "companies", "pbi_access",
                "statements_access", "status", "last_login_at", "face_required",
                "face_updated_at", "seat_updated_at", "auth_mode",
            ):
                if col in r and r[col] is not None:
                    u_obj[col] = r[col]
            for jcol, default_v in (("face_thumbs", []), ("custom_perms", None)):
                raw_j = r.get(jcol)
                if isinstance(raw_j, str) and raw_j.strip():
                    try:
                        u_obj[jcol] = json.loads(raw_j)
                    except Exception:
                        u_obj[jcol] = default_v
                elif isinstance(raw_j, (list, dict)):
                    u_obj[jcol] = raw_j
            has_pin = bool(r.get("has_pin") or str(r.get("pin_code") or "").strip())
            try:
                valid_face_cnt = int(r.get("valid_face_count") or 0)
            except (TypeError, ValueError):
                valid_face_cnt = 0
            has_face = bool(valid_face_cnt > 0 or r.get("has_face_samples") or _has_real_samples(u_obj))
            for secret_k in ("pin_code", "pin_hash", "_verifiedPin", "face_samples", "payload_json", "has_pin", "has_face_samples", "valid_face_count"):
                u_obj.pop(secret_k, None)
            u_obj["pin_redacted"] = bool(has_pin or u_obj.get("pin_redacted"))
            u_obj["face_required"] = bool(u_obj.get("face_required"))
            u_obj["face_enrolled"] = has_face
            u_obj["face_redacted"] = has_face
            try:
                cnt = int(valid_face_cnt or u_obj.get("face_sample_count") or 0)
            except (TypeError, ValueError):
                cnt = 0
            u_obj["face_sample_count"] = max(1, cnt) if has_face else 0
            if not has_face and u_obj.get("face_updated_at"):
                u_obj["face_cleared"] = True
            else:
                u_obj.pop("face_cleared", None)
            u_obj["_d1_authoritative_id"] = True
            if u_obj.get("email"):
                d1_users.append(u_obj)
        if d1_users:
            merged_u: dict[str, dict] = {}
            order_u: list[str] = []
            for src_u in (d1_users, remote.get("users") or []):
                for u_item in src_u:
                    if isinstance(u_item, dict) and u_item.get("email"):
                        ek = str(u_item["email"]).strip().lower()
                        if ek not in merged_u:
                            merged_u[ek] = copy.deepcopy(u_item)
                            order_u.append(ek)
                        else:
                            merged_u[ek] = _merge_user_rows(merged_u[ek], u_item)
            remote["users"] = [merged_u[k] for k in order_u]

    if s_rows:
        sess_map: dict[str, dict] = {}
        sess_order: list[str] = []
        for src_s in (s_rows, remote.get("sessions") or []):
            for s_item in src_s:
                if isinstance(s_item, dict) and s_item.get("id"):
                    sid = str(s_item["id"]).strip()
                    if sid and sid not in sess_map:
                        sess_map[sid] = copy.deepcopy(s_item)
                        sess_order.append(sid)
        if sess_order:
            remote["sessions"] = [sess_map[k] for k in sess_order]

    return remote


def _fetch_d1_store_via_wrangler() -> dict:
    """Equal-Host fallback: read `mfg_web_store` + canonical D1 sub-stores via Wrangler OAuth when HTTP /api/sync returns 401 or jwt_secret is absent."""
    def _q(sql: str) -> list[dict]:
        try:
            return _wrangler_d1_query(sql)
        except Exception:
            time.sleep(1.5)
            return _wrangler_d1_query(sql)

    try:
        kv_rows = _q(
            f"SELECT doc_key, payload_json, updated_at FROM edge_kv_store "
            f"WHERE doc_key = '{STORE_KV_KEY}' OR substr(doc_key, 1, {len(STORE_KV_KEY) + 7}) = '{STORE_KV_KEY}__part_' "
            f"ORDER BY doc_key ASC"
        )
    except Exception as ex:
        _edge_pull_failed(f"wrangler://d1/isabi-ledger failed ({type(ex).__name__}: {ex})")
        return {}
    remote, head_ts, unreadable = _stitch_kv_rows(kv_rows, STORE_KV_KEY)
    if unreadable:
        _edge_pull_failed("the live store is unreadable (wrangler://d1/isabi-ledger); repair it first (Users, Sync Cloud Now from an Owner browser)")
        return {}
    if not remote:
        _edge_pull_failed("wrangler://d1/isabi-ledger answered without a store document")
        return {}
    if head_ts:
        remote["updatedAt"] = head_ts
    try:
        ar_rows = _q("SELECT id, kind, payload_json, updated_at FROM alert_rules")
        ws_rows = _q(
            "SELECT doc_key, payload_json, updated_at FROM edge_kv_store "
            "WHERE doc_key = 'work_schedules' OR substr(doc_key, 1, 21) = 'work_schedules__part_' ORDER BY doc_key ASC"
        )
        u_rows = _q(
            "SELECT id, full_name, email, (CASE WHEN trim(COALESCE(pin_code,'')) != '' THEN 1 ELSE 0 END) AS has_pin, "
            "role, companies, pbi_access, statements_access, status, last_login_at, face_thumbs, face_required, "
            "face_updated_at, seat_updated_at, custom_perms, auth_mode, payload_json, "
            "(SELECT count(*) FROM json_each(CASE WHEN json_valid(COALESCE(face_samples,'')) AND json_type(face_samples)='array' THEN face_samples ELSE '[]' END) AS s "
            "WHERE json_type(s.value)='array' AND json_array_length(s.value)=128 "
            "AND NOT EXISTS (SELECT 1 FROM json_each(s.value) AS e WHERE json_type(e.value) NOT IN ('integer','real'))) AS valid_face_count "
            "FROM users ORDER BY id"
        )
        s_rows = _q(
            "SELECT id, user_id, email, full_name, role, companies, device, logged_in_at, method, confidence, ip_hash "
            "FROM auth_sessions ORDER BY logged_in_at DESC LIMIT 40"
        )
    except Exception as ex:
        _edge_pull_failed(f"wrangler://d1/isabi-ledger sub-store query failed ({type(ex).__name__}: {ex})")
        return {}
    _overlay_d1_rows_on_store(remote, ar_rows, ws_rows, u_rows, s_rows)
    if remote.pop("_wsUnreadable", False):
        _edge_pull_failed("the live work_schedules document is unreadable (wrangler://d1/isabi-ledger); repair it first (Users, Sync Cloud Now from an Owner browser)")
        return {}
    _EDGE_PULL_FAILURES.clear()
    print(f"Pulled live Edge D1 mfg_web_store via Wrangler D1 (updatedAt={remote.get('updatedAt')})")
    return remote


def _wrangler_fallback_allowed() -> bool:
    return (
        os.environ.get("ISABI_NO_WRANGLER_STORE") != "1"
        and (
            (urllib.request.urlopen is _ORIG_URLOPEN and _mint_cli_edge_jwt is _ORIG_MINT_CLI_EDGE_JWT)
            or _wrangler_d1_query is not _ORIG_WRANGLER_D1_QUERY
        )
    )


_EDGE_PULL_FAILURES: list[str] = []  # why the last live pull failed, named in the refusal message


def _edge_pull_failed(msg: str) -> None:
    _EDGE_PULL_FAILURES.append(msg)
    print(f"WARN: live Edge pull: {msg}")


def _fetch_edge_store() -> dict:
    _EDGE_PULL_FAILURES.clear()
    cli_tok = _mint_cli_edge_jwt()
    if not cli_tok:
        if _wrangler_fallback_allowed():
            wr_doc = _fetch_d1_store_via_wrangler()
            if wr_doc:
                return wr_doc
            if _EDGE_PULL_FAILURES:
                return {}
        _edge_pull_failed("no Edge sign-in secret on this PC (ISABI_JWT_SECRET / exports/cloudflare_edge_meta.json jwt_secret)")
        return {}
    saw_auth_401 = False
    for edge_url in EDGE_SYNC_URLS:
        try:
            req = urllib.request.Request(
                edge_url,
                data=json.dumps({"op": "get_mfg", "doc": "mfg_web_store"}).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "ISABI-D1-Seed/1.0",
                    "X-ISABI-Session": cli_tok,
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                if "json" not in (resp.headers.get("Content-Type") or "").lower():
                    _edge_pull_failed(f"{edge_url} answered without JSON ({resp.headers.get('Content-Type')})")
                    continue
                data = json.loads(resp.read().decode("utf-8"))
            if isinstance(data, dict) and data.get("storeUnreadable"):
                # The Edge serves an unreadable store as `{}` plus this flag (incident 2026-11-13). Every Edge URL reads
                # the same database, so this is a failed pull, never an empty store to seed from.
                _edge_pull_failed(f"the live store is unreadable ({edge_url}); repair it first (Users, Sync Cloud Now from an Owner browser)")
                return {}
            docs = data.get("docs") if isinstance(data, dict) else None
            remote = (docs.get("mfg_web_store") if isinstance(docs, dict) else None) or (
                data if isinstance(data, dict) and "customRecords" in data else {}
            )
            if isinstance(remote, dict) and remote:
                users_url = edge_url.rsplit("/sync", 1)[0] + "/users"
                try:
                    u_req = urllib.request.Request(
                        users_url,
                        headers={"User-Agent": "ISABI-D1-Seed/1.0", "X-ISABI-Session": cli_tok},
                        method="GET",
                    )
                    with urllib.request.urlopen(u_req, timeout=10) as u_resp:
                        u_data = json.loads(u_resp.read().decode("utf-8"))
                    if isinstance(u_data, dict) and isinstance(u_data.get("users"), list) and u_data["users"]:
                        d1_users = []
                        for du in u_data["users"]:
                            if isinstance(du, dict):
                                du_c = copy.deepcopy(du)
                                du_c["_d1_authoritative_id"] = True
                                d1_users.append(du_c)
                        merged_u: dict[str, dict] = {}
                        order_u: list[str] = []
                        for src_u in (d1_users, remote.get("users") or []):
                            for u_item in src_u:
                                if isinstance(u_item, dict) and u_item.get("email"):
                                    ek = str(u_item["email"]).strip().lower()
                                    if ek not in merged_u:
                                        merged_u[ek] = copy.deepcopy(u_item)
                                        order_u.append(ek)
                                    else:
                                        merged_u[ek] = _merge_user_rows(merged_u[ek], u_item)
                        remote["users"] = [merged_u[k] for k in order_u]
                except Exception:
                    pass
                print(f"Pulled live Edge D1 mfg_web_store from {edge_url} (updatedAt={remote.get('updatedAt')})")
                return remote
            _edge_pull_failed(f"{edge_url} answered without a store document")
        except urllib.error.HTTPError as ex:
            if ex.code == 401:
                saw_auth_401 = True
            hint = " (this PC's jwt_secret is not the live one: copy it from the PC that last deployed)" if ex.code == 401 else ""
            _edge_pull_failed(f"{edge_url} failed (HTTP {ex.code}){hint}")
        except Exception as ex:
            _edge_pull_failed(f"{edge_url} failed ({type(ex).__name__}: {ex})")
    if saw_auth_401 and _wrangler_fallback_allowed():
        wr_doc = _fetch_d1_store_via_wrangler()
        if wr_doc:
            return wr_doc
    return {}


def _live_edge_head_of(edge_doc) -> str:
    """The pulled store's head stamp, or "" when the pull did not return a real, whole store document."""
    if not isinstance(edge_doc, dict) or edge_doc.get("_scopedForSession"):
        # a company-scoped copy (non-Owner session) lacks other companies' rows: as stale as a failed pull
        return ""
    if isinstance(edge_doc.get("customRecords"), dict) and edge_doc.get("customRecords"):
        return str(edge_doc.get("updatedAt") or "")
    return ""


def _fetch_legacy_relay_store() -> dict:
    ep_file = APP_ROOT / "js" / "endpoints.js"
    if not ep_file.exists():
        return {}
    try:
        ep_txt = ep_file.read_text(encoding="utf-8")
        m_u = re.search(r'MFG_CLOUD_CFG\s*=\s*\{[^}]*u:\s*"([^"]+)"', ep_txt, re.S)
        m_k = re.search(r'MFG_CLOUD_CFG\s*=\s*\{[^}]*k:\s*"([^"]+)"', ep_txt, re.S)
        if not (m_u and m_k):
            return {}
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
        if isinstance(remote, dict) and remote:
            print(f"Pulled legacy Relay mfg_web_store (updatedAt={remote.get('updatedAt')})")
            return remote
    except Exception as ex:
        print(f"WARN: Legacy Relay pull skipped ({ex}).")
    return {}


def fetch_live_cloud_store(offline: bool = False) -> dict:
    global _LIVE_EDGE_HEAD_TS, _STORE_RUN_ID, _STORE_CONTENT_SHA
    _LIVE_EDGE_HEAD_TS = ""
    _STORE_RUN_ID = new_store_run_id()
    _STORE_CONTENT_SHA = ""
    if not offline:
        edge_doc = _fetch_edge_store()
        # The live head this export may overwrite: only a store actually pulled from Edge just now counts
        _LIVE_EDGE_HEAD_TS = _live_edge_head_of(edge_doc)
        relay_doc = _fetch_legacy_relay_store()
        merged = merge_mfg_web_stores(edge_doc, relay_doc)
        if merged and _LIVE_EDGE_HEAD_TS:
            OUT_DIR.parent.mkdir(parents=True, exist_ok=True)
            LIVE_CACHE_JSON.write_text(json.dumps(merged, ensure_ascii=False), encoding="utf-8")
            return merged
        if merged:
            # Edge pull failed: a relay-only copy never replaces the cache of the last live pull (release_data_only.py
            # reads a fresh cache as proof that the export saw the live store)
            return merged
    if LIVE_CACHE_JSON.exists():
        return json.loads(LIVE_CACHE_JSON.read_text(encoding="utf-8"))
    return {}


def _chunk_str_for_kv(s: str, max_chars: int = KV_CHUNK_CHARS, max_utf8_bytes: int = 64_000) -> list[str]:
    if not s:
        return [""]
    chunks: list[str] = []
    pos = 0
    n = len(s)
    while pos < n:
        end = min(pos + max_chars, n)
        cand = s[pos:end]
        while len(cand.encode("utf-8")) > max_utf8_bytes and end > pos + 1:
            end = pos + max(1, (end - pos) * 3 // 4)
            cand = s[pos:end]
        chunks.append(cand)
        pos = end
    return chunks


def _unpack_packed_table(tbl, pool: list, tkey: str = "") -> list[dict]:
    if isinstance(tbl, list):
        return [dict(r) for r in tbl if isinstance(r, dict)]
    if not isinstance(tbl, dict) or "c" not in tbl:
        return []
    cols = tbl["c"]
    sc = tbl["sc"]
    pf = tbl.get("p")
    hr = tbl.get("hr")
    rows: list[dict] = []
    for idx, arr in enumerate(tbl.get("r") or []):
        obj: dict = {}
        if pf:
            obj["id"] = f"{pf}{idx}"
        for ci, val in enumerate(arr):
            if val is None:
                continue
            if sc[ci] and isinstance(val, int) and 0 <= val < len(pool):
                val = pool[val]
            obj[cols[ci]] = val
        if hr and tkey != "attendance" and "rep_date" not in obj and "date" in obj:
            obj["rep_date"] = obj["date"]
        if tkey == "sales_tickets" and "total_ttc" not in obj and "total" in obj:
            obj["total_ttc"] = obj["total"]
        rows.append(obj)
    return rows


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
        if b_len > MAX_STMT_BYTES:
            raise ValueError(f"D1 SQL statement exceeds {MAX_STMT_BYTES:,} UTF-8 byte safety limit ({b_len:,} B): {line[:120]}...")
        if self.cur_lines and (self.cur_bytes + b_len > MAX_BATCH_BYTES or len(self.cur_lines) >= MAX_BATCH_STMTS):
            self.flush()
        self.cur_lines.append(line)
        self.cur_bytes += b_len
        self.total_stmts += 1

    def flush(self):
        if not self.cur_lines:
            return
        fp = self.out_dir / f"batch_{self.batch_idx:04d}.sql"
        fp.write_bytes("".join(self.cur_lines).replace("\r\n", "\n").encode("utf-8"))
        self.files.append(fp)
        self.batch_idx += 1
        self.cur_lines = []
        self.cur_bytes = 0


def _b64url_nopad(raw_bytes: bytes) -> str:
    import base64 as _b64
    return _b64.urlsafe_b64encode(raw_bytes).rstrip(b"=").decode("ascii")


def _hash_seed_pin(pin_val: str, row_id: str = "", email: str = "") -> str:
    raw = str(pin_val or "").strip()
    if not raw:
        return ""
    if raw.startswith("pbkdf2$sha256$"):
        parts = raw.split("$")
        if len(parts) == 5 and len(parts[3]) == 32 and len(parts[4]) == 64:
            try:
                salt_b = bytes.fromhex(parts[3])
                dk_b = bytes.fromhex(parts[4])
                return f"pbkdf2$sha256${parts[2]}${_b64url_nopad(salt_b)}${_b64url_nopad(dk_b)}"
            except ValueError:
                pass
        return raw
    salt = hashlib.sha256(f"isabi-d1-seed-pbkdf2-v1:{row_id}:{email.strip().lower()}:{raw}".encode("utf-8")).digest()[:16]
    dk = hashlib.pbkdf2_hmac("sha256", raw.encode("utf-8"), salt, 100_000, dklen=32)
    return f"pbkdf2$sha256$100000${_b64url_nopad(salt)}${_b64url_nopad(dk)}"


def build_upsert_stmt(table: str, target_cols: list[str], row_dict: dict) -> str:
    col_set = set(target_cols)
    norm_row = dict(row_dict)
    if "company" in col_set and norm_row.get("company"):
        norm_row["company"] = canonicalize_company(norm_row["company"])
    if table in ("products", "sites", "equipment", "drivers") and norm_row.get("name") is None:
        norm_row["name"] = str(norm_row.get("id") or "")
    if table == "users" and "pin_code" in col_set:
        if norm_row.get("pin_code") is None:
            # Always write the column: the live table still carries an old DEFAULT, and a seat with no PIN stays blank.
            norm_row["pin_code"] = ""
        elif str(norm_row.get("pin_code") or "").strip():
            norm_row["pin_code"] = _hash_seed_pin(
                str(norm_row["pin_code"]),
                str(norm_row.get("id") or ""),
                str(norm_row.get("email") or ""),
            )
    cols = []
    vals = []
    for k in target_cols:
        if k == "payload_json":
            continue
        if k in norm_row:
            cols.append(k)
            vals.append(sql_lit(norm_row[k]))
    if "payload_json" in col_set:
        base_payload: dict = {}
        raw_pj = norm_row.get("payload_json")
        if isinstance(raw_pj, dict):
            base_payload = dict(raw_pj)
        elif isinstance(raw_pj, str) and raw_pj.strip().startswith("{"):
            try:
                parsed_pj = json.loads(raw_pj)
                if isinstance(parsed_pj, dict):
                    base_payload = parsed_pj
            except Exception:
                pass
        for k, v in norm_row.items():
            if k != "payload_json" and v is not None and v != "":
                base_payload[k] = v
        if table == "users":
            base_payload.pop("pin_code", None)
            base_payload.pop("face_samples", None)
            base_payload.pop("face_thumbs", None)
            base_payload.pop("face_redacted", None)
            base_payload.pop("face_sample_count", None)
            base_payload.pop("face_enrolled", None)
            base_payload.pop("pin_redacted", None)
            base_payload.pop("_verifiedPin", None)
            base_payload.pop("_d1_authoritative_id", None)
            base_payload.pop("face_cleared", None)
        cols.append("payload_json")
        vals.append(sql_lit(base_payload))
    if table == "users" and "id" in cols:
        face_cleared = bool(norm_row.get("face_cleared"))
        upd_parts: list[str] = []
        for c in cols:
            if c in ("id", "email"):
                continue
            if c == "pin_code":
                upd_parts.append(
                    "pin_code = CASE WHEN users.seat_updated_at > excluded.seat_updated_at AND users.pin_code != '' THEN users.pin_code "
                    "WHEN excluded.pin_code = '' AND users.pin_code != '' THEN users.pin_code ELSE excluded.pin_code END"
                )
            elif c == "face_samples":
                if face_cleared:
                    upd_parts.append(
                        "face_samples = CASE WHEN users.face_updated_at > excluded.face_updated_at AND users.face_samples NOT IN ('', '[]') THEN users.face_samples ELSE '[]' END"
                    )
                else:
                    upd_parts.append(
                        "face_samples = CASE WHEN users.face_updated_at > excluded.face_updated_at AND users.face_samples NOT IN ('', '[]') THEN users.face_samples "
                        "WHEN excluded.face_samples IN ('', '[]') AND users.face_samples NOT IN ('', '[]') THEN users.face_samples ELSE excluded.face_samples END"
                    )
            elif c == "face_thumbs":
                if face_cleared:
                    upd_parts.append(
                        "face_thumbs = CASE WHEN users.face_updated_at > excluded.face_updated_at AND users.face_thumbs NOT IN ('', '[]') THEN users.face_thumbs ELSE '[]' END"
                    )
                else:
                    upd_parts.append(
                        "face_thumbs = CASE WHEN users.face_updated_at > excluded.face_updated_at AND users.face_thumbs NOT IN ('', '[]') THEN users.face_thumbs "
                        "WHEN excluded.face_thumbs IN ('', '[]') AND users.face_thumbs NOT IN ('', '[]') THEN users.face_thumbs ELSE excluded.face_thumbs END"
                    )
            elif c == "face_updated_at":
                upd_parts.append(
                    "face_updated_at = CASE WHEN users.face_updated_at > excluded.face_updated_at THEN users.face_updated_at ELSE excluded.face_updated_at END"
                )
            elif c == "last_login_at":
                upd_parts.append(
                    "last_login_at = CASE WHEN users.last_login_at > excluded.last_login_at THEN users.last_login_at ELSE excluded.last_login_at END"
                )
            else:
                upd_parts.append(
                    f"{c} = CASE WHEN users.seat_updated_at > excluded.seat_updated_at THEN users.{c} ELSE excluded.{c} END"
                )
        if "email" in cols:
            upd_parts.append(
                "email = CASE WHEN users.seat_updated_at > excluded.seat_updated_at AND users.email != '' THEN users.email ELSE excluded.email END"
            )
        return f"INSERT INTO users ({','.join(cols)}) VALUES ({','.join(vals)}) ON CONFLICT(id) DO UPDATE SET {', '.join(upd_parts)}"
    return f"INSERT OR REPLACE INTO {table} ({','.join(cols)}) VALUES ({','.join(vals)})"


def build_delete_stmt(table: str, pk_vals: list[str], valid_tables: set[str]) -> str | None:
    if table not in valid_tables:
        return None
    pk_cols = TABLE_PK_COLS.get(table, ("id",))
    if len(pk_cols) != len(pk_vals):
        return None
    where_sql = " AND ".join(f"{col} = {sql_lit(val)}" for col, val in zip(pk_cols, pk_vals))
    return f"DELETE FROM {table} WHERE {where_sql}"


# ---- Live store document (`edge_kv_store` `mfg_web_store` + `mfg_web_store__part_NNNN`) ----
# Incident 2026-11-13: chunk writes spread over several calls left the joined chunks unparseable while a browser synced
# (every device then synced an empty store). The export now never writes a live chunk directly:
#   1. the new document is staged under `mfg_web_store__next_NNNN` (0000 = head), which no reader joins;
#   2. ONE guarded INSERT ... SELECT swaps the staged rows in (head + parts), and blanks any older tail part past the
#      new last one, so the joined text is valid JSON before and after that single, atomic statement;
#   3. the staged rows are removed.
# The swap only applies while the head row still carries the `updated_at` read at pull time (a browser write in
# between wins whole). Without a pulled live head (Edge pull failed, or --offline from the cache) nothing is written.
_LIVE_EDGE_HEAD_TS = ""
_STORE_RUN_ID = ""  # set per export run (fetch_live_cloud_store / _store_run_id)
_STORE_CONTENT_SHA = ""  # sha256 of the store document this run would write (delta skips the store when unchanged)
STORE_KV_KEY = "mfg_web_store"
STORE_KV_STAGE = f"{STORE_KV_KEY}__next_"


def is_store_kv_doc_key(doc_key: str) -> bool:
    return doc_key == STORE_KV_KEY or doc_key.startswith(f"{STORE_KV_KEY}__part_") or doc_key.startswith(STORE_KV_STAGE)


def is_store_kv_row_key(rk: str) -> bool:
    try:
        tbl, pk_vals = decode_row_key(rk)
    except Exception:
        return False
    return tbl == "edge_kv_store" and len(pk_vals) == 1 and is_store_kv_doc_key(pk_vals[0])


def store_kv_head_guard(head_ts: str) -> str:
    # A missing head (brand-new database) or blank default updated_at lets the write through; any populated timestamp must match the pulled head.
    return (
        f"COALESCE(NULLIF((SELECT updated_at FROM edge_kv_store WHERE doc_key = '{STORE_KV_KEY}'), ''), {sql_lit(head_ts)}) "
        f"= {sql_lit(head_ts)}"
    )


def new_store_run_id() -> str:
    """`YYYYMMDDHHMMSS` (UTC) + 6 hex: each run stages under its own prefix, so two deploys never mix their chunks."""
    return dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d%H%M%S") + secrets.token_hex(3)


def _store_run_id() -> str:
    global _STORE_RUN_ID
    if not _STORE_RUN_ID:
        _STORE_RUN_ID = new_store_run_id()
    return _STORE_RUN_ID


def _store_stage_prefix(run_id: str) -> str:
    return f"{STORE_KV_STAGE}{run_id}_"


def build_store_kv_stage_stmts(store_json: str, head_ts: str, updated_by: str, run_id: str) -> list[tuple[str, str]]:
    """`(staged doc_key, stmt)` pairs that stage the whole document under `mfg_web_store__next_<run>_NNNN`
    (0000 = head). Invisible to every reader; they may land in any number of batch files."""
    chunks = _chunk_str_for_kv(store_json, KV_CHUNK_CHARS, 64_000)
    pre = _store_stage_prefix(run_id)
    return [
        (
            f"{pre}{i:04d}",
            "INSERT OR REPLACE INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) "
            f"VALUES ({sql_lit(f'{pre}{i:04d}')}, {sql_lit(ch)}, {sql_lit(head_ts)}, {sql_lit(updated_by)}, 1)",
        )
        for i, ch in enumerate(chunks)
    ]


def build_store_kv_stage_clear(run_id: str) -> str:
    """Removes this run's staged rows."""
    pre = _store_stage_prefix(run_id)
    return f"DELETE FROM edge_kv_store WHERE substr(doc_key, 1, {len(pre)}) = {sql_lit(pre)}"


def build_store_kv_stale_stage_clear(max_age_hours: int = 24) -> str:
    """Removes staged rows of runs started more than `max_age_hours` ago (aborted deploys); never a live run's."""
    cutoff = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=max_age_hours)).strftime("%Y%m%d%H%M%S")
    n = len(STORE_KV_STAGE)
    return (
        f"DELETE FROM edge_kv_store WHERE substr(doc_key, 1, {n}) = {sql_lit(STORE_KV_STAGE)} "
        f"AND substr(doc_key, {n + 1}, 14) < {sql_lit(cutoff)}"
    )


def build_store_kv_swap(n_parts: int, head_ts: str, run_id: str) -> str:
    """ONE statement: this run's staged head + parts become the live rows, and every older live part past `n_parts`
    is blanked (an empty part joins as nothing). Applies only while the live head still carries `head_ts` AND every
    one of this run's `n_parts + 1` staged rows is present; otherwise nothing changes."""
    pre = _store_stage_prefix(run_id)
    p = len(pre)
    guard = (
        f"{store_kv_head_guard(head_ts)} "
        f"AND (SELECT count(*) FROM edge_kv_store WHERE substr(doc_key, 1, {p}) = {sql_lit(pre)}) = {n_parts + 1}"
    )
    last_part = f"{STORE_KV_KEY}__part_{n_parts:04d}"
    return (
        "INSERT OR REPLACE INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) "
        f"SELECT CASE WHEN substr(doc_key, {p + 1}) = '0000' THEN '{STORE_KV_KEY}' "
        f"ELSE '{STORE_KV_KEY}__part_' || substr(doc_key, {p + 1}) END, payload_json, updated_at, updated_by, rev "
        f"FROM edge_kv_store WHERE substr(doc_key, 1, {p}) = {sql_lit(pre)} AND {guard} "
        "UNION ALL "
        f"SELECT doc_key, '', updated_at, updated_by, rev FROM edge_kv_store "
        f"WHERE substr(doc_key, 1, {len(STORE_KV_KEY) + 7}) = '{STORE_KV_KEY}__part_' AND doc_key > '{last_part}' AND {guard}"
    )


def collect_target_rows(
    db_path: pathlib.Path,
    schema_cols: dict[str, list[str]],
    remote: dict,
    include_snapshot: bool | None = None,
    explicit_delete_rks: set[str] | None = None,
) -> dict[str, str]:
    """Collect deduplicated canonical `(table, pk) -> SQL UPSERT` across SQLite + SharePoint snapshot + spine + live cloud state."""
    global _STORE_CONTENT_SHA
    _STORE_CONTENT_SHA = ""
    target_rows: dict[str, str] = {}
    staged_dicts: dict[str, tuple[str, tuple[str, ...], dict]] = {}

    if include_snapshot is None:
        try:
            use_snap = db_path.resolve() == DB_PATH.resolve()
        except Exception:
            use_snap = False
    else:
        use_snap = bool(include_snapshot)

    def _stage_dict(table: str, pk_vals: tuple[str, ...], rd: dict):
        if any(v == "" for v in pk_vals):
            return
        rk = encode_row_key(table, pk_vals)
        prev = staged_dicts.get(rk)
        if prev is None:
            staged_dicts[rk] = (table, pk_vals, dict(rd))
        else:
            merged = dict(prev[2])
            for k, v in rd.items():
                if v is not None and v != "":
                    merged[k] = v
            staged_dicts[rk] = (table, pk_vals, merged)

    def _put(table: str, pk_vals: tuple[str, ...], stmt: str):
        if any(v == "" for v in pk_vals) or table in EDGE_RUNTIME_TABLES:
            return
        target_rows[encode_row_key(table, pk_vals)] = stmt

    # 0. Canonical multi-industry company registry defaults (overlaid by mfg.db companies)
    if use_snap and "companies" in schema_cols:
        for co_row in MULTI_INDUSTRY_COMPANIES:
            _stage_dict("companies", (str(co_row["key"]),), co_row)

    # 1. Baseline relational rows from data/mfg.db (excluding wrapper tables written canonically in step 3)
    if db_path.exists():
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        src_tables = [
            r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
        ]
        for t in src_tables:
            if t not in schema_cols or t in WRAPPER_TABLES or t in EDGE_RUNTIME_TABLES:
                continue
            pk_cols = TABLE_PK_COLS.get(t, ("id",))
            rows = conn.execute(f'SELECT * FROM "{t}"').fetchall()
            for r in rows:
                rd = dict(r)
                pk_tuple = tuple(str(rd.get(c) or "").strip() for c in pk_cols)
                _stage_dict(t, pk_tuple, rd)
        conn.close()

    # 2. Overlay complete unpacked SharePoint snapshot (`mfg_snapshot.json`) + multi-industry `spine.*` (`seed_industries.json`)
    if use_snap:
        if SNAPSHOT_JSON.exists():
            snap = json.loads(SNAPSHOT_JSON.read_text(encoding="utf-8"))
            s_pool = snap.get("_s") or []
            for raw_tk, packed_tbl in (snap.get("records") or {}).items():
                canon_t = CR_KEY_TO_TABLE.get(raw_tk, raw_tk)
                if canon_t not in schema_cols or canon_t in WRAPPER_TABLES:
                    continue
                pk_cols = TABLE_PK_COLS.get(canon_t, ("id",))
                for rd in _unpack_packed_table(packed_tbl, s_pool, raw_tk):
                    pk_tuple = tuple(str(rd.get(c) or "").strip() for c in pk_cols)
                    _stage_dict(canon_t, pk_tuple, rd)

        if SEED_INDUSTRIES_JSON.exists():
            ind = json.loads(SEED_INDUSTRIES_JSON.read_text(encoding="utf-8"))
            i_pool = ind.get("_s") or []
            for ind_key, packed_tbl in (ind.get("tables") or {}).items():
                if not str(ind_key).startswith("spine."):
                    continue
                sub_tk = str(ind_key).split(".", 1)[1]
                canon_t = CR_KEY_TO_TABLE.get(sub_tk, sub_tk)
                if canon_t not in schema_cols or canon_t in WRAPPER_TABLES:
                    continue
                pk_cols = TABLE_PK_COLS.get(canon_t, ("id",))
                for rd in _unpack_packed_table(packed_tbl, i_pool, sub_tk):
                    pk_tuple = tuple(str(rd.get(c) or "").strip() for c in pk_cols)
                    _stage_dict(canon_t, pk_tuple, rd)

    # Materialize staged relational & registry rows
    for rk, (t, pk_tuple, rd) in staged_dicts.items():
        if t in EDGE_RUNTIME_TABLES:
            continue
        target_rows[rk] = build_upsert_stmt(t, schema_cols[t], rd)

    # 3. Overlay live merged mfg_web_store state (overwriting matching PKs in-place with zero duplicate SQL)
    if remote:
        email_to_rk: dict[str, str] = {}
        merged_users_by_rk: dict[str, dict] = {}
        for rk_u, (t_u, _pk_u, rd_u) in staged_dicts.items():
            if t_u == "users":
                u_init = dict(rd_u)
                if u_init.get("email"):
                    em_init = str(u_init["email"]).strip().lower()
                    u_init["email"] = em_init
                    email_to_rk[em_init] = rk_u
                merged_users_by_rk[rk_u] = u_init

        for u in (remote.get("users") or []):
            if isinstance(u, dict) and u.get("email") and u.get("full_name"):
                u_row = dict(u)
                em_norm = str(u["email"]).strip().lower()
                u_row["email"] = em_norm
                cand_id = str(u.get("id") or f"u-{em_norm}").strip()
                u_row["id"] = cand_id
                cand_rk = encode_row_key("users", (cand_id,))
                prev_rk = email_to_rk.get(em_norm) or (cand_rk if cand_rk in merged_users_by_rk else None)
                if prev_rk and prev_rk in merged_users_by_rk:
                    u_row = _merge_user_rows(dict(merged_users_by_rk[prev_rk]), u_row)
                    u_row["email"] = em_norm
                uid = str(u_row.get("id") or cand_id).strip()
                u_row["id"] = uid
                rk = encode_row_key("users", (uid,))
                if prev_rk and prev_rk != rk:
                    target_rows.pop(prev_rk, None)
                    merged_users_by_rk.pop(prev_rk, None)
                merged_users_by_rk[rk] = copy.deepcopy(u_row)
                u_emit = dict(u_row)
                u_emit.pop("face_redacted", None)
                u_emit.pop("face_sample_count", None)
                u_emit.pop("face_enrolled", None)
                u_emit.pop("pin_redacted", None)
                u_emit.pop("_verifiedPin", None)
                u_emit.pop("_d1_authoritative_id", None)
                email_to_rk[em_norm] = rk
                _put("users", (uid,), build_upsert_stmt("users", schema_cols["users"], u_emit))

        for s in (remote.get("sessions") or [])[:40]:
            if isinstance(s, dict) and s.get("id"):
                sid = str(s["id"]).strip()
                _put("auth_sessions", (sid,), build_upsert_stmt("auth_sessions", schema_cols["auth_sessions"], s))

        cr = remote.get("customRecords") or {}
        if isinstance(cr, dict) and cr:
            _legacy_pos_re = _LEGACY_POS_D1_RE
            _seed_tx_re = _SEED_TX_D1_RE
            _stable_exp_child_re = re.compile(
                r"^(?:ex_[0-9a-f]{10,16}|dv-(?:hld|ins)-(?:exp|rec)-[0-9a-f]{8,16}|wbrecur-(?:wtc|bbc)-[0-9a-f]{8,16})-i\d+$"
            )
            _fallback_nm_re = re.compile(r"^(?:(?:ST|RP|FI|AT)-\d+|(?:EXP|SET|REC)-(?:INS|HLD)-\d+)$")

            def _na_d1(v: object) -> str:
                return re.sub(r"[^a-z0-9\u0600-\u06ff]+", "", str(v or "").lower())

            def _tno_d1(v: object) -> str:
                return str(v or "").strip().lstrip("#").lower()

            seed_by_table_id: dict[str, dict[str, dict]] = {}
            for (_t_rk, (_t_name, _pk_tup, _rd_s)) in staged_dicts.items():
                if len(_pk_tup) == 1 and _pk_tup[0]:
                    seed_by_table_id.setdefault(_t_name, {})[_pk_tup[0]] = _rd_s

            def _anchor_matches(ref_r: dict, s_row: dict | None) -> bool:
                if not s_row:
                    return False
                if ref_r.get("company") and s_row.get("company"):
                    if canonicalize_company(ref_r.get("company")) != canonicalize_company(s_row.get("company")):
                        return False
                if ref_r.get("date") and s_row.get("date"):
                    if str(ref_r.get("date"))[:10] != str(s_row.get("date"))[:10]:
                        return False
                ref_nm = str(ref_r.get("name") or "").strip()
                if ref_nm and s_row.get("name") and not _fallback_nm_re.match(ref_nm):
                    if ref_nm != str(s_row.get("name")).strip():
                        return False
                if ref_r.get("ticket_no") and s_row.get("ticket_no"):
                    if _tno_d1(ref_r.get("ticket_no")) != _tno_d1(s_row.get("ticket_no")):
                        return False
                return True

            purged_bare, purged_timed, purged_timed_ms = _collect_purged_state_d1(
                [remote.get("_purgedOverrideIds")]
            )

            upgraded_map: dict[tuple[str, str], str] = {}
            ordered_cr_keys = list(cr.keys())
            if "expenses" in ordered_cr_keys and "expense_items" in ordered_cr_keys:
                ordered_cr_keys.remove("expense_items")
                ordered_cr_keys.insert(ordered_cr_keys.index("expenses") + 1, "expense_items")

            def _mark_purged_legacy(ck: str, row_id_s: str, rec_obj: dict | None = None) -> None:
                entry = f"{ck}:{row_id_s}"
                if not _LEGACY_PURGED_ENTRY_D1_RE.match(entry) and _seed_tx_re.match(row_id_s):
                    p_ms = max(
                        _rec_purge_ms(rec_obj) if isinstance(rec_obj, dict) else 0,
                        _iso_ms_d1(remote.get("updatedAt")),
                    )
                    if p_ms > 0:
                        p_iso = dt.datetime.fromtimestamp(p_ms / 1000.0, tz=dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
                    else:
                        p_iso = "2026-01-01T00:00:00.000Z"
                    entry = f"{entry}@{p_iso}"
                _add_purged_token_d1(entry, purged_bare, purged_timed, purged_timed_ms)
                if explicit_delete_rks is not None:
                    ct = CR_KEY_TO_TABLE.get(ck, ck)
                    if ct in schema_cols and len(TABLE_PK_COLS.get(ct, ("id",))) == 1 and row_id_s:
                        explicit_delete_rks.add(encode_row_key(ct, (row_id_s,)))

            sanitized_cr: dict[str, list] = {}
            for cr_key in ordered_cr_keys:
                rows_in = cr.get(cr_key)
                if not isinstance(rows_in, list):
                    continue
                canon_t = CR_KEY_TO_TABLE.get(cr_key, cr_key)
                t_seeds = seed_by_table_id.get(canon_t, {})
                valid_exp_parents: set[str] = set()
                if cr_key == "expense_items":
                    valid_exp_parents.update(seed_by_table_id.get("expenses", {}).keys())
                    valid_exp_parents.update(seed_by_table_id.get("recurring_expenses", {}).keys())
                    for ex_c in (sanitized_cr.get("expenses") or []) + (sanitized_cr.get("recurring_expenses") or []) + (cr.get("recurring_expenses") or []):
                        if isinstance(ex_c, dict) and ex_c.get("id"):
                            valid_exp_parents.add(str(ex_c["id"]))

                dedup_by_id: dict[str, dict] = {}
                dedup_order: list[str] = []
                for raw_rec in rows_in:
                    if not isinstance(raw_rec, dict) or not raw_rec.get("id"):
                        continue
                    rec = copy.deepcopy(raw_rec)
                    rid = str(rec["id"]).strip()
                    if cr_key == "expense_items":
                        raw_p = str(rec.get("expense_id") or re.sub(r"-i\d+$", "", rid))
                        up_p = upgraded_map.get(("expenses", raw_p))
                        if up_p:
                            rec["expense_id"] = up_p
                            m_sfx = re.search(r"(-i\d+)$", rid)
                            if m_sfx:
                                next_cid = f"{up_p}{m_sfx.group(1)}"
                                if next_cid != rid:
                                    _mark_purged_legacy(cr_key, rid, rec)
                                rid = next_cid
                                rec["id"] = rid
                        if _stable_exp_child_re.match(rid):
                            p_eid = str(rec.get("expense_id") or re.sub(r"-i\d+$", "", rid))
                            if p_eid not in valid_exp_parents:
                                _mark_purged_legacy(cr_key, rid, rec)
                                continue
                            rec["expense_id"] = p_eid
                            if _is_purged_by_state_d1(cr_key, rid, rec, purged_bare, purged_timed_ms):
                                continue
                            if rid not in dedup_by_id:
                                dedup_by_id[rid] = rec
                                dedup_order.append(rid)
                            else:
                                dedup_by_id[rid] = _pick_newer_record(dedup_by_id[rid], rec)
                            continue

                    if rid not in t_seeds and _legacy_pos_re.match(rid):
                        orig = rec.get("_seed_orig")
                        cands: list[dict] = []
                        if isinstance(orig, dict):
                            for sr in t_seeds.values():
                                if not _anchor_matches(orig, sr):
                                    continue
                                matched_num = False
                                num_ok = True
                                for nk in ("total", "amount", "litres", "qty", "tally", "usd_amount"):
                                    if orig.get(nk) is not None and sr.get(nk) is not None:
                                        matched_num = True
                                        if abs(float(orig.get(nk) or 0) - float(sr.get(nk) or 0)) > 0.05:
                                            num_ok = False
                                            break
                                if not num_ok:
                                    continue
                                for pk in ("customer", "supplier", "staff", "equipment", "counterparty", "borrower"):
                                    if orig.get(pk) and sr.get(pk) and _na_d1(orig.get(pk)) != _na_d1(sr.get(pk)):
                                        num_ok = False
                                        break
                                if num_ok and (matched_num or orig.get("name") or orig.get("ticket_no")):
                                    cands.append(sr)
                        if len(cands) == 1 and cands[0].get("id"):
                            new_id = str(cands[0]["id"])
                            upgraded_map[(cr_key, rid)] = new_id
                            _mark_purged_legacy(cr_key, rid, rec)
                            if isinstance(orig, dict):
                                if _fallback_nm_re.match(str(orig.get("name") or "").strip()) and cands[0].get("name"):
                                    if str(rec.get("name") or "").strip() == str(orig.get("name") or "").strip():
                                        rec["name"] = cands[0]["name"]
                                    orig["name"] = cands[0]["name"]
                                orig["id"] = new_id
                            rec["id"] = new_id
                            rid = new_id
                        else:
                            _mark_purged_legacy(cr_key, rid, rec)
                            continue

                    if _seed_tx_re.match(rid):
                        s_row = t_seeds.get(rid)
                        ref_r = rec.get("_seed_orig") if isinstance(rec.get("_seed_orig"), dict) else rec
                        if not _anchor_matches(ref_r, s_row):
                            _mark_purged_legacy(cr_key, rid, rec)
                            continue

                    if _is_purged_by_state_d1(cr_key, rid, rec, purged_bare, purged_timed_ms):
                        continue

                    if rid not in dedup_by_id:
                        dedup_by_id[rid] = rec
                        dedup_order.append(rid)
                    else:
                        dedup_by_id[rid] = _pick_newer_record(dedup_by_id[rid], rec)
                sanitized_cr[cr_key] = [dedup_by_id[k_d] for k_d in dedup_order]

            if explicit_delete_rks is not None:
                for p_entry in (purged_bare | set(purged_timed.keys())):
                    ck_p, rid_p = p_entry.split(":", 1)
                    ct_p = CR_KEY_TO_TABLE.get(ck_p, ck_p)
                    if ct_p in schema_cols and len(TABLE_PK_COLS.get(ct_p, ("id",))) == 1 and rid_p:
                        explicit_delete_rks.add(encode_row_key(ct_p, (rid_p,)))

            all_purged_entries = sorted(purged_bare | {f"{bk}@{ts}" for bk, ts in purged_timed.items()})[-2000:]
            remote = dict(remote)
            remote["customRecords"] = sanitized_cr
            if all_purged_entries:
                remote["_purgedOverrideIds"] = all_purged_entries
            else:
                remote.pop("_purgedOverrideIds", None)
            cr = sanitized_cr

        for cr_key, rows in cr.items():
            if not isinstance(rows, list):
                continue
            canon_t = CR_KEY_TO_TABLE.get(cr_key, cr_key)
            if canon_t not in schema_cols:
                continue
            pk_cols = TABLE_PK_COLS.get(canon_t, ("id",))
            for rec in rows:
                if isinstance(rec, dict) and rec.get("id"):
                    pk_tuple = tuple(str(rec.get(c) or "").strip() for c in pk_cols)
                    rk = encode_row_key(canon_t, pk_tuple)
                    merged_rec = dict(staged_dicts[rk][2]) if rk in staged_dicts else {}
                    merged_rec.update(rec)
                    _put(canon_t, pk_tuple, build_upsert_stmt(canon_t, schema_cols[canon_t], merged_rec))

        for sk, entry in (remote.get("staffBiometrics") or {}).items():
            if sk and isinstance(entry, dict):
                sk_s = str(sk).strip()
                stmt = (
                    f"INSERT OR REPLACE INTO staff_biometrics (staff_key, company, payload_json, updated_at) "
                    f"VALUES ({sql_lit(sk_s)}, {sql_lit(canonicalize_company(entry.get('company', '')))}, "
                    f"{sql_lit(entry)}, {sql_lit(entry.get('updated_at', ''))})"
                )
                _put("staff_biometrics", (sk_s,), stmt)

        for kp in (remote.get("kioskPunches") or []):
            if isinstance(kp, dict) and kp.get("id"):
                kid = str(kp["id"]).strip()
                stmt = (
                    f"INSERT OR REPLACE INTO kiosk_punches (id, company, staff_name, punch_type, punched_at, rev, voided, payload_json, updated_at) "
                    f"VALUES ({sql_lit(kid)}, {sql_lit(canonicalize_company(kp.get('company', '')))}, "
                    f"{sql_lit(kp.get('staff_name') or kp.get('staff') or '')}, "
                    f"{sql_lit(kp.get('type') or kp.get('direction') or '')}, "
                    f"{sql_lit(kp.get('punched_at') or kp.get('timestamp') or '')}, "
                    f"{int(kp.get('rev') or 1)}, {1 if kp.get('voided') else 0}, {sql_lit(kp)}, "
                    f"{sql_lit(kp.get('updated_at', ''))})"
                )
                _put("kiosk_punches", (kid,), stmt)

        for rid, rv in (remote.get("sentinelReviews") or {}).items():
            if rid and isinstance(rv, dict):
                rid_s = str(rv.get("id") or rid).strip()
                in_ts = str(rv.get("updated_at") or rv.get("checked_at") or "")
                stmt = (
                    f"INSERT OR REPLACE INTO sentinel_reviews "
                    f"(id, rule_id, company, baseline_metric, baseline_secondary, baseline_badge, active, checked_by, checked_by_email, checked_at, updated_at, note) "
                    f"VALUES ({sql_lit(rid_s)}, {sql_lit(rv.get('rule_id', ''))}, "
                    f"{sql_lit(canonicalize_company(rv.get('company', '')))}, "
                    f"{float(rv.get('baseline_metric') or 0)}, {float(rv.get('baseline_secondary') or 0)}, "
                    f"{sql_lit(rv.get('baseline_badge', ''))}, {0 if rv.get('active') is False else 1}, "
                    f"{sql_lit(rv.get('checked_by', ''))}, {sql_lit(rv.get('checked_by_email', ''))}, "
                    f"{sql_lit(rv.get('checked_at', ''))}, {sql_lit(in_ts)}, {sql_lit(rv.get('note', ''))})"
                )
                _put("sentinel_reviews", (rid_s,), stmt)

        ar = remote.get("alertRules") if isinstance(remote.get("alertRules"), dict) else {}
        for ov_id, ov in (ar.get("overrides") or {}).items():
            if ov_id and isinstance(ov, dict):
                oid = str(ov_id).strip()
                stmt = (
                    f"INSERT OR REPLACE INTO alert_rules (id, kind, payload_json, updated_at) "
                    f"VALUES ({sql_lit(oid)}, 'override', {sql_lit(ov)}, {sql_lit(ov.get('updated_at', ''))})"
                )
                _put("alert_rules", (oid,), stmt)
        for cr_rule in (ar.get("custom") or []):
            if isinstance(cr_rule, dict) and cr_rule.get("id"):
                cid = str(cr_rule["id"]).strip()
                stmt = (
                    f"INSERT OR REPLACE INTO alert_rules (id, kind, payload_json, updated_at) "
                    f"VALUES ({sql_lit(cid)}, 'custom', {sql_lit(cr_rule)}, {sql_lit(cr_rule.get('updated_at', ''))})"
                )
                _put("alert_rules", (cid,), stmt)

        remote = dict(remote)
        purged_ind_rows, purged_ind_edits = _upgrade_remote_industry_stores(
            remote, _load_industry_legacy_map_for_d1(db_path, use_snap)
        )
        if explicit_delete_rks is not None:
            for bk_p, rid_p in purged_ind_rows:
                if "industry_custom_rows" in schema_cols:
                    explicit_delete_rks.add(encode_row_key("industry_custom_rows", (bk_p, rid_p)))
            for ek_p in purged_ind_edits:
                if "industry_row_edits" in schema_cols:
                    explicit_delete_rks.add(encode_row_key("industry_row_edits", (ek_p,)))

        for bucket, arr in (remote.get("industryCustomRows") or {}).items():
            if not bucket or not isinstance(arr, list):
                continue
            b_s = str(bucket).strip()
            for r in arr:
                if not isinstance(r, dict):
                    continue
                rid_s = str(r.get("id") or r.get("code") or "").strip()
                if not rid_s:
                    continue
                co_s = canonicalize_company(r.get("company") or r.get("resort") or r.get("entity") or "")
                stmt = (
                    f"INSERT OR REPLACE INTO industry_custom_rows (bucket, row_id, company, rev, voided, updated_at, payload_json) "
                    f"VALUES ({sql_lit(b_s)}, {sql_lit(rid_s)}, {sql_lit(co_s)}, {int(r.get('rev') or 1)}, "
                    f"{1 if r.get('voided') else 0}, {sql_lit(r.get('updated_at') or r.get('_createdAt') or '')}, {sql_lit(r)})"
                )
                _put("industry_custom_rows", (b_s, rid_s), stmt)

        for ek, ev in (remote.get("industryRowEdits") or {}).items():
            if ek and isinstance(ev, dict):
                ek_s = str(ek).strip()
                stmt = (
                    f"INSERT OR REPLACE INTO industry_row_edits (edit_key, rev, voided, updated_at, payload_json) "
                    f"VALUES ({sql_lit(ek_s)}, {int(ev.get('rev') or 1)}, {1 if ev.get('voided') else 0}, "
                    f"{sql_lit(ev.get('updated_at') or ev.get('updatedAt') or '')}, {sql_lit(ev)})"
                )
                _put("industry_row_edits", (ek_s,), stmt)

        # Only from a store pulled live just now: a relay-only or cached copy must not overwrite live schedules
        if remote.get("workSchedules") and _LIVE_EDGE_HEAD_TS:
            ws_ts = str(remote.get("updatedAt") or "")
            stmt = (
                f"INSERT OR REPLACE INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) "
                f"VALUES ('work_schedules', {sql_lit(remote['workSchedules'])}, {sql_lit(ws_ts)}, 'seed', 1)"
            )
            _put("edge_kv_store", ("work_schedules",), stmt)

        # Store complete mfg_web_store snapshot in <= 28,000-char / <= 64 KB UTF-8 chunks (< 95 KB D1 SQL statement cap)
        kv_remote = dict(remote)
        if isinstance(kv_remote.get("users"), list):
            redacted_users = []
            for ku in kv_remote["users"]:
                if not isinstance(ku, dict):
                    redacted_users.append(ku)
                    continue
                ku_c = dict(ku)
                has_pin_ku = bool(str(ku_c.get("pin_code") or "").strip() or ku_c.get("pin_redacted"))
                fs_raw = ku_c.get("face_samples")
                if isinstance(fs_raw, str):
                    try:
                        fs_raw = json.loads(fs_raw)
                    except Exception:
                        fs_raw = None
                has_raw_list = isinstance(fs_raw, list) and not ku_c.get("face_redacted")
                if isinstance(fs_raw, list):
                    valid_cnt = sum(1 for x in fs_raw if _is_valid_face_vec(x))
                else:
                    try:
                        valid_cnt = int(ku_c.get("face_sample_count") or (1 if ku_c.get("face_enrolled") else 0))
                    except (TypeError, ValueError):
                        valid_cnt = 1 if ku_c.get("face_enrolled") else 0
                enrolled = bool(
                    not ku_c.get("face_cleared")
                    and (valid_cnt > 0 if has_raw_list else (ku_c.get("face_enrolled") or valid_cnt > 0))
                )
                ku_c["face_enrolled"] = enrolled
                ku_c["face_sample_count"] = max(1, valid_cnt) if enrolled else 0
                ku_c["face_redacted"] = bool(enrolled)
                if not enrolled and ku_c.get("face_updated_at"):
                    ku_c["face_cleared"] = True
                else:
                    ku_c.pop("face_cleared", None)
                ku_c["pin_redacted"] = has_pin_ku
                for secret_k in (
                    "pin_code",
                    "pin_hash",
                    "_verifiedPin",
                    "face_samples",
                    "face_thumbs",
                    "payload_json",
                    "_d1_authoritative_id",
                    "has_pin",
                    "has_face_samples",
                    "valid_face_count",
                ):
                    ku_c.pop(secret_k, None)
                redacted_users.append(ku_c)
            kv_remote["users"] = redacted_users
        head_ts = _LIVE_EDGE_HEAD_TS
        if not head_ts:
            print("Live store head not pulled from Edge (pull failed or --offline): `mfg_web_store` is left as it is in D1.")
        else:
            # Same stamp in the document and on the row, so browsers' compare-and-swap keeps matching
            kv_remote["updatedAt"] = head_ts
            raw_store_json = json.dumps(kv_remote, ensure_ascii=False)
            _STORE_CONTENT_SHA = hashlib.sha256(raw_store_json.encode("utf-8")).hexdigest()
            upd_by = str(remote.get("updatedBy") or "seed")
            for doc_key, stmt in build_store_kv_stage_stmts(raw_store_json, head_ts, upd_by, _store_run_id()):
                _put("edge_kv_store", (doc_key,), stmt)

    return target_rows


class StaleStoreRefused(SystemExit):
    """The live store was not pulled from the Edge just now, and the caller did not ask for an offline export."""


def _clear_export_out_dir(out_dir: pathlib.Path) -> None:
    # A refused run leaves nothing a later upload could pick up (old batch files or an old pending manifest)
    if out_dir.is_dir():
        for fp in list(out_dir.glob("batch_*.sql")) + [out_dir / "pending_manifest.json"]:
            try:
                fp.unlink()
            except FileNotFoundError:
                pass


# Incident follow-up 2026-11-13 (red-team note on `4b7ce82`): rows of the live tables (seats, sessions, app records,
# punches, biometrics, Sentinel reviews, alert rules, sibling-industry rows) come from the pulled store. When the pull
# failed, the store used here is a cached or relay-only copy: rows it lacks would become DELETEs and its older rows
# would overwrite newer live ones. So an export without a live Edge pull is refused; `offline=True` (CLI `--offline`)
# still builds one for local use, with no DELETE at all and a pending manifest that is never promoted.
def export_all(
    delta: bool = False,
    offline: bool = False,
    manifest_path: pathlib.Path = COMMITTED_MANIFEST_JSON,
    db_path: pathlib.Path = DB_PATH,
    out_dir: pathlib.Path = OUT_DIR,
    include_snapshot: bool | None = None,
    allow_stale_store: bool | None = None,
) -> tuple[list[pathlib.Path], dict]:
    schema_cols = parse_schema_columns(SCHEMA_SQL.read_text(encoding="utf-8"))
    valid_tables = set(schema_cols.keys())
    remote = fetch_live_cloud_store(offline=offline)
    stale_store = not _LIVE_EDGE_HEAD_TS
    if stale_store and not (offline if allow_stale_store is None else allow_stale_store):
        _clear_export_out_dir(out_dir)
        why = "; ".join(_EDGE_PULL_FAILURES) if (_EDGE_PULL_FAILURES and not offline) else "pull failed, store unreadable, or no Edge sign-in on this PC"
        raise StaleStoreRefused(
            f"ABORT: the live store was not pulled from the Edge ({why}). An export from a cached or relay copy could "
            "delete live rows or overwrite newer ones, so no batch was written. Fix the pull and run again; a UI-only "
            "deploy still works with deploy_cloudflare.py --skip-seed, and --offline builds a local-only export with no deletes."
        )
    if stale_store:
        print("WARN: export built from a cached / relay copy of the store (not live): no DELETE is emitted and the "
              "pending manifest is marked stale (never promoted). Do not upload these batches to the live database.")
    explicit_delete_rks: set[str] = set()
    target_rows = collect_target_rows(
        db_path, schema_cols, remote, include_snapshot=include_snapshot, explicit_delete_rks=explicit_delete_rks
    )
    purged_override_rks = set(explicit_delete_rks) if not stale_store else set()
    explicit_delete_rks -= set(target_rows.keys())
    if stale_store:
        explicit_delete_rks = set()  # purge lists read from a stale copy are not acted on either

    cur_hashes = {rk: stmt_hash(stmt) for rk, stmt in target_rows.items()}
    prev_hashes: dict[str, str] = {}
    prev_store_sha = ""
    use_delta = False
    if delta and manifest_path.exists():
        try:
            prev_data = json.loads(manifest_path.read_text(encoding="utf-8"))
            if isinstance(prev_data.get("row_hashes"), dict) and prev_data["row_hashes"]:
                prev_hashes = prev_data["row_hashes"]
                prev_store_sha = str(prev_data.get("store_content_sha") or "")
                use_delta = True
        except Exception as ex:
            print(f"WARN: Could not parse previous D1 manifest ({ex}); falling back to full export.")

    writer = BatchWriter(out_dir)
    emitted_deletes = 0
    emitted_upserts = 0
    skipped_unchanged = 0
    # The store document is written whole (staged, then one guarded swap) or not at all: a delta that rewrote only
    # the chunks whose hash moved since the last manifest could join new chunks with whatever browsers wrote since.
    # Delta leaves the store alone when the document is the one the last export wrote.
    store_head_ts = _LIVE_EDGE_HEAD_TS
    store_has_rows = bool(store_head_ts) and any(is_store_kv_row_key(rk) for rk in target_rows)
    store_unchanged = bool(use_delta and store_has_rows and prev_store_sha and prev_store_sha == _STORE_CONTENT_SHA)
    store_written = store_has_rows and not store_unchanged
    store_parts = sum(1 for rk in target_rows if is_store_kv_row_key(rk)) - 1 if store_written else 0

    if use_delta:
        # 1. Delete vanished relational rows + upgraded/purged live legacy PKs first; defer shrunk edge_kv_store tail chunks until after KV upserts.
        # Group >= 10 single-PK deletes per table into compact IN (...) clauses so large ID migrations stay in 1 batch.
        deferred_kv_deletes: list[str] = []
        vanished_by_tbl: dict[str, list[list[str]]] = {}
        delete_candidate_keys = set(explicit_delete_rks)
        for prev_key in prev_hashes.keys():
            if prev_key not in cur_hashes and not stale_store:
                delete_candidate_keys.add(prev_key)
        delete_candidate_keys -= set(target_rows.keys())
        for del_key in sorted(delete_candidate_keys):
            tbl, pk_vals = decode_row_key(del_key)
            if tbl not in valid_tables or tbl in EDGE_RUNTIME_TABLES:
                continue
            if tbl == "edge_kv_store":
                if is_store_kv_row_key(del_key) or not store_head_ts:
                    # Store chunks only change through the staged swap below, never one by one; and a pull that
                    # failed must not read as "every live document vanished" (store or work schedules)
                    continue
                del_stmt = build_delete_stmt(tbl, pk_vals, valid_tables)
                if del_stmt:
                    deferred_kv_deletes.append(del_stmt)
            else:
                vanished_by_tbl.setdefault(tbl, []).append(pk_vals)

        for tbl, pk_list in vanished_by_tbl.items():
            pk_cols = TABLE_PK_COLS.get(tbl, ("id",))
            if len(pk_cols) == 1 and len(pk_list) >= 10:
                pk_col = pk_cols[0]
                valid_vals = [vals[0] for vals in pk_list if len(vals) == 1]
                for i in range(0, len(valid_vals), 250):
                    chunk = valid_vals[i : i + 250]
                    in_sql = ", ".join(sql_lit(v) for v in chunk)
                    writer.add(f"DELETE FROM {tbl} WHERE {pk_col} IN ({in_sql})")
                    emitted_deletes += len(chunk)
            else:
                for pk_vals in pk_list:
                    del_stmt = build_delete_stmt(tbl, pk_vals, valid_tables)
                    if del_stmt:
                        writer.add(del_stmt)
                        emitted_deletes += 1

        # 2. Upsert only newly added or modified rows (any field/code edit changes SHA-256)
        if store_written:
            writer.add(build_store_kv_stale_stage_clear())
        for rk, stmt in target_rows.items():
            if is_store_kv_row_key(rk):
                if not store_written:
                    skipped_unchanged += 1
                    continue
            elif rk not in purged_override_rks and prev_hashes.get(rk) == cur_hashes[rk]:
                skipped_unchanged += 1
                continue
            writer.add(stmt)
            emitted_upserts += 1

        # 3. Clean up shrunk edge_kv_store tail chunks in the final batch AFTER updated KV head/chunks land
        for kv_del in deferred_kv_deletes:
            writer.add(kv_del)
            emitted_deletes += 1
    else:
        for del_key in sorted(explicit_delete_rks):
            tbl, pk_vals = decode_row_key(del_key)
            if tbl in valid_tables and tbl != "edge_kv_store" and tbl not in EDGE_RUNTIME_TABLES:
                del_stmt = build_delete_stmt(tbl, pk_vals, valid_tables)
                if del_stmt:
                    writer.add(del_stmt)
                    emitted_deletes += 1
        if store_written:
            writer.add(build_store_kv_stale_stage_clear())
        for stmt in target_rows.values():
            writer.add(stmt)
            emitted_upserts += 1

    # The live store changes in ONE statement, in its own last batch file, after every staged chunk has landed
    if store_written:
        writer.flush()
        writer.add(build_store_kv_swap(store_parts, store_head_ts, _store_run_id()))
        writer.add(build_store_kv_stage_clear(_store_run_id()))
    writer.flush()

    meta = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "db_sha256": file_sha256(db_path),
        "delta_mode": use_delta,
        "total_target_rows": len(target_rows),
        "emitted_upserts": emitted_upserts,
        "emitted_deletes": emitted_deletes,
        "skipped_unchanged": skipped_unchanged,
        "batch_count": len(writer.files),
        "row_hashes": cur_hashes,
        # deploy_cloudflare.py compares this with the live head after the upload: a different value means a browser
        # wrote in between and the store swap was (correctly) skipped
        "store_head_ts": store_head_ts if store_written else "",
        # what the store holds after this run as far as the export knows (kept when the pull failed)
        "store_content_sha": _STORE_CONTENT_SHA if store_has_rows else prev_store_sha,
        # built from a cached / relay copy (offline): promote_pending_manifest refuses it
        "stale_store": stale_store,
    }
    pending_file = out_dir / "pending_manifest.json"
    pending_file.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")

    mode_lbl = "DELTA" if use_delta else "FULL"
    print(
        f"OK [{mode_lbl}]: {writer.total_stmts:,} SQL statements "
        f"(upserts={emitted_upserts:,}, deletes={emitted_deletes:,}, skipped_unchanged={skipped_unchanged:,}) "
        f"across {len(writer.files)} D1 batch files -> {out_dir}"
    )
    return writer.files, meta


def promote_pending_manifest(
    out_dir: pathlib.Path = OUT_DIR,
    manifest_path: pathlib.Path = COMMITTED_MANIFEST_JSON,
) -> bool:
    pending_file = out_dir / "pending_manifest.json"
    if not pending_file.exists():
        return False
    try:
        pending = json.loads(pending_file.read_text(encoding="utf-8"))
    except Exception:
        pending = {}
    # The committed manifest describes the live database; an offline export's hashes would make the next delta skip or
    # delete the wrong rows. Only a manifest that says it came from a live pull is promoted (one written before this
    # guard has no `stale_store` key and is refused: export again).
    if not isinstance(pending, dict) or "row_hashes" not in pending:
        print(f"Not promoting {pending_file.name}: it is unreadable or has no row hashes.")
        return False
    if pending.get("stale_store") is not False:
        why = "it was built offline from a cached copy of the store" if pending.get("stale_store") else "it predates the live-pull check; run the export again"
        print(f"Not promoting {pending_file.name}: {why}.")
        return False
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(pending_file, manifest_path)
    return True


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
    if not batch_files:
        print("OK: 0 changed batches to apply to local Wrangler D1.")
        return
    print(f"Applying {len(batch_files)} data batches to local Wrangler D1...")
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


def _manifest_has_row_hashes(path: pathlib.Path) -> tuple[bool, int]:
    if not path.is_file():
        return False, 0
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return False, 0
    hashes = data.get("row_hashes")
    if isinstance(hashes, dict) and hashes:
        return True, len(hashes)
    return False, 0


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="build/export_d1_seed.py",
        description="Export ISABI SQLite, snapshot/spine seeds, and live cloud store into Cloudflare D1 SQL batches.",
        allow_abbrev=False,
    )
    parser.add_argument(
        "--dry",
        "--dry-run",
        dest="dry",
        action="store_true",
        help="Print the export plan from file metadata without network calls, snapshot unpacking, or file writes.",
    )
    parser.add_argument(
        "--delta",
        action="store_true",
        help="Emit SHA-256 delta against exports/d1_seed_manifest.json (errors if the manifest is missing/empty).",
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Force a full D1 export instead of a delta export (default when --delta is omitted).",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Skip the live Edge/Relay pull and read cached exports/mfg_web_store_snapshot.json (local use only: no "
        "DELETE, the store is not written, and the pending manifest is never promoted). Without it, a failed live "
        "pull stops the export.",
    )
    parser.add_argument(
        "--no-snapshot",
        action="store_true",
        help="Skip overlaying data/mfg_snapshot.json and js/seed_industries.json on top of data/mfg.db.",
    )
    parser.add_argument(
        "--commit-manifest",
        action="store_true",
        help="Promote exports/d1_batches/pending_manifest.json to exports/d1_seed_manifest.json after export.",
    )
    parser.add_argument(
        "--apply-local",
        action="store_true",
        help="Apply schema and exported batches to local Wrangler Miniflare D1 after export.",
    )
    return parser


def parse_cli_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    if args.delta and args.full:
        parser.error("--delta cannot be combined with --full.")
    return args


def print_dry_run_plan(args: argparse.Namespace) -> int:
    has_manifest, manifest_rows = _manifest_has_row_hashes(COMMITTED_MANIFEST_JSON)
    if args.delta and not has_manifest:
        print(
            f"ERROR: --delta requested, but `{COMMITTED_MANIFEST_JSON}` is missing or empty (pass --full for a full export).",
            file=sys.stderr,
        )
        return 2

    schema_tables = 0
    if SCHEMA_SQL.is_file():
        schema_tables = len(parse_schema_columns(SCHEMA_SQL.read_text(encoding="utf-8")))

    db_status = f"present ({DB_PATH.stat().st_size:,} bytes)" if DB_PATH.is_file() else "missing"
    snap_status = f"present ({SNAPSHOT_JSON.stat().st_size:,} bytes)" if SNAPSHOT_JSON.is_file() else "missing"
    ind_status = f"present ({SEED_INDUSTRIES_JSON.stat().st_size:,} bytes)" if SEED_INDUSTRIES_JSON.is_file() else "missing"
    cache_status = f"present ({LIVE_CACHE_JSON.stat().st_size:,} bytes)" if LIVE_CACHE_JSON.is_file() else "missing"
    man_status = f"present ({manifest_rows:,} rows)" if has_manifest else "missing"
    mode_lbl = "DELTA" if args.delta else "FULL"

    print("DRY RUN — 0 remote or local writes")
    print(f"  Mode     : {mode_lbl}")
    print(f"  Schema   : {SCHEMA_SQL} ({schema_tables} tables)")
    print(f"  SQLite   : {DB_PATH} ({db_status})")
    print(f"  Manifest : {COMMITTED_MANIFEST_JSON} ({man_status})")
    print("  Steps    :")
    if args.offline:
        print(f"    1. Cloud store -> OFFLINE (--offline; read {LIVE_CACHE_JSON.name}: {cache_status}; local only: 0 DELETE, manifest never promoted)")
    else:
        print(f"    1. Cloud store -> LIVE PULL (Edge `/app/api/sync` + legacy relay, union-merge, cache `{LIVE_CACHE_JSON.name}`; a failed Edge pull stops the export)")
    if args.no_snapshot:
        print("    2. Snapshot & industry overlay -> SKIP (--no-snapshot; SQLite rows + live cloud store only)")
    else:
        print(f"    2. Snapshot & industry overlay -> INCLUDE (`mfg_snapshot.json`: {snap_status}; `seed_industries.json`: {ind_status})")
    print(f"    3. Batch export ({mode_lbl}) -> write <=720 KB SQL batches + pending_manifest.json in {OUT_DIR}")
    print(
        "    4. Manifest promotion -> "
        + (f"PROMOTE pending_manifest.json -> {COMMITTED_MANIFEST_JSON}" if args.commit_manifest else "KEEP pending_manifest.json only")
    )
    print("    5. Local Wrangler D1 -> " + ("APPLY schema + batches" if args.apply_local else "SKIP (pass --apply-local to apply)"))
    return 0


def main(argv: list[str] | None = None) -> int:
    args = parse_cli_args(argv)
    if args.dry:
        sys.exit(print_dry_run_plan(args))
    if args.delta:
        has_manifest, _manifest_rows = _manifest_has_row_hashes(COMMITTED_MANIFEST_JSON)
        if not has_manifest:
            print(
                f"ERROR: --delta requested, but `{COMMITTED_MANIFEST_JSON}` is missing or empty (pass --full for a full export).",
                file=sys.stderr,
            )
            sys.exit(2)

    batches, _meta = export_all(
        delta=args.delta,
        offline=args.offline,
        include_snapshot=(False if args.no_snapshot else None),
    )
    if args.commit_manifest:
        if promote_pending_manifest():
            print(f"Committed D1 seed manifest -> {COMMITTED_MANIFEST_JSON}")
        else:
            print(f"D1 seed manifest NOT committed ({COMMITTED_MANIFEST_JSON} unchanged).")
    if args.apply_local:
        apply_local_wrangler(batches)
    return 0


if __name__ == "__main__":
    sys.exit(main())
