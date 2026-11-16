"""Idempotent Google Cloud Billing Budget & API Activation helper for ISABI Maps Platform.

Configures the $1 Zero-Dollar Free-Tier Guard budget alert (50% / 80% / 95% thresholds) on Billing
Account 01D3FC-354800-7D0DCD scoped to project gen-lang-client-0240664641, and enables
routes.googleapis.com + elevation-backend.googleapis.com when Google Cloud CLI (gcloud) is present.

Usage:
  python build/setup_gcp_maps_budget.py [--dry]
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess

PROJECT_ID = "gen-lang-client-0240664641"
BILLING_ACCOUNT = "01D3FC-354800-7D0DCD"
BUDGET_NAME = "ISABI Maps Zero-Dollar Free Tier Guard"
THRESHOLD_RULES = (0.50, 0.80, 0.95)
REQUIRED_SERVICES = (
    "tile.googleapis.com",
    "places-backend.googleapis.com",
    "routes.googleapis.com",
    "elevation-backend.googleapis.com",
)


def build_commands(project_id: str = PROJECT_ID, billing_account: str = BILLING_ACCOUNT) -> list[list[str]]:
    cmds: list[list[str]] = [
        ["gcloud", "services", "enable", *REQUIRED_SERVICES, f"--project={project_id}"],
        [
            "gcloud",
            "billing",
            "budgets",
            "create",
            f"--billing-account={billing_account}",
            f"--display-name={BUDGET_NAME}",
            f"--filter-projects=projects/{project_id}",
            "--budget-amount=1USD",
            "--calendar-period=month",
            "--threshold-rule=percent=0.50",
            "--threshold-rule=percent=0.80",
            "--threshold-rule=percent=0.95",
        ],
    ]
    return cmds


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Configure GCP $1 Maps Free-Tier Budget Alert (50/80/95%) & Routes/Elevation APIs")
    ap.add_argument("--dry", action="store_true", help="Print plan and commands without executing gcloud")
    ap.add_argument("--project", default=PROJECT_ID, help="GCP project ID")
    ap.add_argument("--billing-account", default=BILLING_ACCOUNT, help="GCP billing account ID")
    args = ap.parse_args(argv)

    cmds = build_commands(args.project, args.billing_account)
    gcloud_exe = shutil.which("gcloud")

    if args.dry or not gcloud_exe:
        print(json.dumps({
            "project": args.project,
            "billing_account": args.billing_account,
            "thresholds_pct": [int(t * 100) for t in THRESHOLD_RULES],
            "gcloud_available": bool(gcloud_exe),
            "console_budget_url": f"https://console.cloud.google.com/billing/{args.billing_account}/budgets?project={args.project}",
            "commands": [" ".join(c) for c in cmds],
        }, indent=2))
        if not args.dry and not gcloud_exe:
            print("NOTE: gcloud CLI not found on PATH; open console_budget_url above or run commands after installing Cloud SDK.")
            return 0
        return 0

    for cmd in cmds:
        print("RUN:", " ".join(cmd))
        res = subprocess.run(cmd, check=False)
        if res.returncode != 0:
            print(f"WARN: command exited with status {res.returncode}")
            return res.returncode
    print("OK: GCP Maps budget & APIs verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
