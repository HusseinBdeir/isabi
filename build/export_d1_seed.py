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
"""
from __future__ import annotations

import base64
import copy
import datetime as dt
import hashlib
import hmac
import json
import os
import pathlib
import re
import shutil
import sqlite3
import subprocess
import sys
import time
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
    if va != vb:
        non_void = rb if va else ra
        void_rec = ra if va else rb
        nv_rev = revb if va else reva
        v_rev = reva if va else revb
        nv_ts = tsb if va else tsa
        v_ts = tsa if va else tsb
        if non_void.get("_reopenedExplicitly") and (nv_rev > v_rev or (nv_ts and nv_ts > v_ts)):
            return copy.deepcopy(non_void)
        return copy.deepcopy(void_rec)
    if (revb, tsb) > (reva, tsa):
        return copy.deepcopy(rb)
    if (reva, tsa) > (revb, tsb):
        return copy.deepcopy(ra)
    if _record_tie_key(rb) > _record_tie_key(ra):
        return copy.deepcopy(rb)
    return copy.deepcopy(ra)


def _has_real_samples(u: dict) -> bool:
    fs = u.get("face_samples")
    if isinstance(fs, str):
        try:
            fs = json.loads(fs)
        except Exception:
            fs = []
    return isinstance(fs, list) and len(fs) > 0 and not u.get("face_redacted")


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
    out.pop("pin_redacted", None)
    out.pop("_verifiedPin", None)
    fa = str(ua.get("face_updated_at") or "")
    fb = str(ub.get("face_updated_at") or "")
    if _has_real_samples(ua) and not _has_real_samples(ub) and not (ub.get("face_cleared") and fb > fa):
        f_win = ua
    elif _has_real_samples(ub) and not _has_real_samples(ua) and not (ua.get("face_cleared") and fa > fb):
        f_win = ub
    else:
        f_win = ub if fb > fa else ua
    for fk in ("face_samples", "face_thumbs", "face_required", "face_updated_at", "face_cleared"):
        if fk in f_win:
            out[fk] = copy.deepcopy(f_win[fk])
        elif fk in out and fk == "face_cleared" and not f_win.get("face_cleared"):
            out.pop("face_cleared", None)
    if _has_real_samples(out):
        out.pop("face_redacted", None)
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

    purged_overrides: set[str] = set()
    for src_p in (newer.get("_purgedOverrideIds") or [], older.get("_purgedOverrideIds") or []):
        if isinstance(src_p, list):
            for pid_item in src_p:
                if pid_item:
                    purged_overrides.add(str(pid_item))
    if purged_overrides:
        out["_purgedOverrideIds"] = sorted(purged_overrides)

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
                if f"{tk}:{rid}" in purged_overrides and not r.get("_reopenedExplicitly"):
                    continue
                rmap[rid] = copy.deepcopy(r)
                rorder.append(rid)
        for r in lo:
            if isinstance(r, dict) and r.get("id") is not None:
                rid = str(r["id"]).strip()
                if not rid:
                    continue
                if f"{tk}:{rid}" in purged_overrides and not r.get("_reopenedExplicitly"):
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
                    if not isinstance(item, dict) or not item.get("id"):
                        continue
                    ik = (
                        f"{str(item.get('company') or 'All BUs').strip().lower()}|{item['id']}"
                        if list_k == "shiftTypes"
                        else str(item["id"])
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


def _fetch_edge_store() -> dict:
    cli_tok = _mint_cli_edge_jwt()
    if not cli_tok:
        return {}
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
                    continue
                data = json.loads(resp.read().decode("utf-8"))
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
        except Exception:
            continue
    return {}


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
    if not offline and "--offline" not in sys.argv:
        edge_doc = _fetch_edge_store()
        relay_doc = _fetch_legacy_relay_store()
        merged = merge_mfg_web_stores(edge_doc, relay_doc)
        if merged:
            OUT_DIR.parent.mkdir(parents=True, exist_ok=True)
            LIVE_CACHE_JSON.write_text(json.dumps(merged, ensure_ascii=False), encoding="utf-8")
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
        fp.write_text("".join(self.cur_lines), encoding="utf-8", newline="\n")
        self.files.append(fp)
        self.batch_idx += 1
        self.cur_lines = []
        self.cur_bytes = 0


def build_upsert_stmt(table: str, target_cols: list[str], row_dict: dict) -> str:
    col_set = set(target_cols)
    norm_row = dict(row_dict)
    if "company" in col_set and norm_row.get("company"):
        norm_row["company"] = canonicalize_company(norm_row["company"])
    if table in ("products", "sites", "equipment", "drivers") and norm_row.get("name") is None:
        norm_row["name"] = str(norm_row.get("id") or "")
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


def collect_target_rows(
    db_path: pathlib.Path,
    schema_cols: dict[str, list[str]],
    remote: dict,
    include_snapshot: bool | None = None,
) -> dict[str, str]:
    """Collect deduplicated canonical `(table, pk) -> SQL UPSERT` across SQLite + SharePoint snapshot + spine + live cloud state."""
    target_rows: dict[str, str] = {}
    staged_dicts: dict[str, tuple[str, tuple[str, ...], dict]] = {}

    if include_snapshot is None:
        try:
            use_snap = (db_path.resolve() == DB_PATH.resolve()) and ("--no-snapshot" not in sys.argv)
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
        if any(v == "" for v in pk_vals):
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
            if t not in schema_cols or t in WRAPPER_TABLES:
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

        if remote.get("workSchedules"):
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
                fs_raw = ku_c.get("face_samples")
                if isinstance(fs_raw, str):
                    try:
                        fs_raw = json.loads(fs_raw)
                    except Exception:
                        fs_raw = []
                valid_cnt = len(fs_raw) if isinstance(fs_raw, list) else int(ku_c.get("face_sample_count") or (1 if ku_c.get("face_enrolled") else 0))
                enrolled = bool(not ku_c.get("face_cleared") and (ku_c.get("face_enrolled") or valid_cnt > 0))
                ku_c["face_enrolled"] = enrolled
                ku_c["face_sample_count"] = max(1, valid_cnt) if enrolled else 0
                ku_c["face_redacted"] = True
                ku_c.pop("face_samples", None)
                ku_c.pop("face_thumbs", None)
                ku_c.pop("_d1_authoritative_id", None)
                redacted_users.append(ku_c)
            kv_remote["users"] = redacted_users
        raw_store_json = json.dumps(kv_remote, ensure_ascii=False)
        kv_chunks = _chunk_str_for_kv(raw_store_json, KV_CHUNK_CHARS, 64_000)
        upd_ts = str(remote.get("updatedAt") or "")
        upd_by = str(remote.get("updatedBy") or "seed")
        _put(
            "edge_kv_store",
            ("mfg_web_store",),
            f"INSERT OR REPLACE INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) "
            f"VALUES ('mfg_web_store', {sql_lit(kv_chunks[0])}, {sql_lit(upd_ts)}, {sql_lit(upd_by)}, 1)",
        )
        for part_idx, chunk_str in enumerate(kv_chunks[1:], start=1):
            part_key = f"mfg_web_store__part_{part_idx:04d}"
            _put(
                "edge_kv_store",
                (part_key,),
                f"INSERT OR REPLACE INTO edge_kv_store (doc_key, payload_json, updated_at, updated_by, rev) "
                f"VALUES ({sql_lit(part_key)}, {sql_lit(chunk_str)}, {sql_lit(upd_ts)}, {sql_lit(upd_by)}, 1)",
            )

    return target_rows


def export_all(
    delta: bool = False,
    offline: bool = False,
    manifest_path: pathlib.Path = COMMITTED_MANIFEST_JSON,
    db_path: pathlib.Path = DB_PATH,
    out_dir: pathlib.Path = OUT_DIR,
    include_snapshot: bool | None = None,
) -> tuple[list[pathlib.Path], dict]:
    schema_cols = parse_schema_columns(SCHEMA_SQL.read_text(encoding="utf-8"))
    valid_tables = set(schema_cols.keys())
    remote = fetch_live_cloud_store(offline=offline)
    target_rows = collect_target_rows(db_path, schema_cols, remote, include_snapshot=include_snapshot)

    cur_hashes = {rk: stmt_hash(stmt) for rk, stmt in target_rows.items()}
    prev_hashes: dict[str, str] = {}
    use_delta = False
    if delta and manifest_path.exists():
        try:
            prev_data = json.loads(manifest_path.read_text(encoding="utf-8"))
            if isinstance(prev_data.get("row_hashes"), dict) and prev_data["row_hashes"]:
                prev_hashes = prev_data["row_hashes"]
                use_delta = True
        except Exception as ex:
            print(f"WARN: Could not parse previous D1 manifest ({ex}); falling back to full export.")

    writer = BatchWriter(out_dir)
    emitted_deletes = 0
    emitted_upserts = 0
    skipped_unchanged = 0

    if use_delta:
        # 1. Delete vanished relational rows first; defer shrunk edge_kv_store tail chunks until after KV upserts
        deferred_kv_deletes: list[str] = []
        for prev_key in prev_hashes.keys():
            if prev_key not in cur_hashes:
                tbl, pk_vals = decode_row_key(prev_key)
                del_stmt = build_delete_stmt(tbl, pk_vals, valid_tables)
                if del_stmt:
                    if tbl == "edge_kv_store":
                        deferred_kv_deletes.append(del_stmt)
                    else:
                        writer.add(del_stmt)
                        emitted_deletes += 1

        # 2. Upsert only newly added or modified rows (any field/code edit changes SHA-256)
        for rk, stmt in target_rows.items():
            if prev_hashes.get(rk) == cur_hashes[rk]:
                skipped_unchanged += 1
                continue
            writer.add(stmt)
            emitted_upserts += 1

        # 3. Clean up shrunk edge_kv_store tail chunks in the final batch AFTER updated KV head/chunks land
        for kv_del in deferred_kv_deletes:
            writer.add(kv_del)
            emitted_deletes += 1
    else:
        for stmt in target_rows.values():
            writer.add(stmt)
            emitted_upserts += 1
        # Clean up stale mfg_web_store__part_* tail chunks in the final batch AFTER all new chunks are inserted
        if remote:
            max_part = sum(1 for rk in target_rows if rk.startswith('["edge_kv_store","mfg_web_store__part_'))
            writer.add(
                f"DELETE FROM edge_kv_store WHERE doc_key LIKE 'mfg_web_store__part_%' "
                f"AND doc_key > 'mfg_web_store__part_{max_part:04d}'"
            )

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


if __name__ == "__main__":
    is_delta = "--delta" in sys.argv
    is_offline = "--offline" in sys.argv
    batches, _meta = export_all(delta=is_delta, offline=is_offline)
    if "--commit-manifest" in sys.argv:
        promote_pending_manifest()
        print(f"Committed D1 seed manifest -> {COMMITTED_MANIFEST_JSON}")
    if "--apply-local" in sys.argv:
        apply_local_wrangler(batches)
