"""Scheduled close-of-day Needs Attention Web Push dispatcher.

Uses a short-lived D1 build ticket (`export_d1_seed.mint_build_ticket`) so GitHub Actions
can trigger `/app/api/day-close-push` (`{"op": "dispatch_due"}`) without storing any signing
secret or personal user session in repository secrets.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

BUILD_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BUILD_DIR))
import export_d1_seed as eds  # noqa: E402

PUSH_API_URL = os.environ.get("ISABI_DAY_CLOSE_PUSH_URL", "https://isabisystems.com/app/api/day-close-push")


def main() -> int:
    if not os.environ.get("CLOUDFLARE_API_TOKEN") or not os.environ.get("CLOUDFLARE_ACCOUNT_ID"):
        print("NOTICE: CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID not configured; skipping close-of-day push dispatch.")
        return 0
    if not os.environ.get("ISABI_BUILD_TICKET"):
        os.environ["ISABI_BUILD_TICKET"] = "1"
    ticket = eds.mint_build_ticket()
    if not ticket:
        print("ERROR: CLOUDFLARE_API_TOKEN is set but mint_build_ticket() failed (check wrangler/D1 credentials).", file=sys.stderr)
        return 1
    try:
        tot_users = 0
        tot_endpoints = 0
        last_out = {}
        for batch_idx in range(1, 11):
            req = urllib.request.Request(
                PUSH_API_URL,
                data=json.dumps({"op": "dispatch_due"}).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "ISABI-Day-Close-Push/1.0",
                    "X-ISABI-Session": ticket,
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=90) as resp:
                out = json.loads(resp.read().decode("utf-8"))
            last_out = out
            tot_users += int(out.get("sentUsers") or 0)
            tot_endpoints += int(out.get("sentEndpoints") or 0)
            print(
                f"Day-close push batch {batch_idx}: ok={out.get('ok')} date={out.get('date')} "
                f"beirutHour={out.get('beirutHour')} sentUsers={out.get('sentUsers')} "
                f"sentEndpoints={out.get('sentEndpoints')} hasMore={out.get('hasMore')}"
            )
            if not out.get("ok"):
                return 1
            if not out.get("hasMore"):
                break
        print(f"Day-close push total: date={last_out.get('date')} sentUsers={tot_users} sentEndpoints={tot_endpoints}")
        return 0
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:300]
        print(f"Day-close push HTTP {exc.code}: {body}", file=sys.stderr)
        return 1
    finally:
        try:
            eds._drop_build_ticket()
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
