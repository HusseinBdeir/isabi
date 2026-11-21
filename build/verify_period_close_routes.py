"""Static parity gate: Period-Close & Close-Gate route alignment across ai_edge.js and verify_live_parity.mjs.

Catches any vertical move (such as moving Period Close from #statements to #ledger) before deploy when
the client mount guards in isabi-app/js/ai_edge.js and the live browser probes in
isabi/build/verify_live_parity.mjs disagree.

Run: python build/verify_period_close_routes.py [--self-test]
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ISABI_ROOT = Path(os.environ.get("ISABI_ROOT") or Path(__file__).resolve().parent.parent).resolve()


def _resolve_app_root() -> Path:
    env_src = os.environ.get("ISABI_APP_SRC", "").strip()
    if env_src:
        p = Path(env_src).resolve()
        if (p / "js" / "ai_edge.js").exists():
            return p
    sibling = ISABI_ROOT.parent / "isabi-app"
    if (sibling / "js" / "ai_edge.js").exists():
        return sibling
    home_app = Path.home() / "bhfirms" / "isabi-app"
    if (home_app / "js" / "ai_edge.js").exists():
        return home_app
    raise SystemExit(f"cannot locate isabi-app/js/ai_edge.js from ISABI_APP_SRC or sibling of {ISABI_ROOT}")


EXPECTED_PANELS = (
    ("mfg-period-close", "mfgPeriodClosePanel", "PERIOD_CLOSE_STUDIO_VIEWS", "mountMfgPeriodClosePanel"),
    ("holding-14-entity-close", "hldCloseGatePanel", "HOLDING_CLOSE_GATE_VIEWS", "mountHoldingCloseGatePanel"),
    ("hospitality-period-close", "hspPeriodClosePanel", "PERIOD_CLOSE_STUDIO_VIEWS", "mountHospitalityPeriodClosePanel"),
    ("trading-period-close", "trdPeriodClosePanel", "PERIOD_CLOSE_STUDIO_VIEWS", "mountTradingPeriodClosePanel"),
    ("realestate-period-close", "rePeriodClosePanel", "PERIOD_CLOSE_STUDIO_VIEWS", "mountRealEstatePeriodClosePanel"),
    ("insurance-period-close", "insPeriodClosePanel", "PERIOD_CLOSE_STUDIO_VIEWS", "mountInsurancePeriodClosePanel"),
)

_VIEW_LIST_RE = re.compile(r"const\s+(PERIOD_CLOSE_STUDIO_VIEWS|HOLDING_CLOSE_GATE_VIEWS)\s*=\s*\[([^\]]*)\]\s*;")
_TEST_CALL_RE = re.compile(
    r"await\s+test\(\s*'([^']+)'\s*,\s*[A-Z]+\s*,\s*'([^']+)'\s*,\s*toggleIn\(\s*'([^']+)'\s*\)"
)


def parse_view_lists(ai_text: str) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for m in _VIEW_LIST_RE.finditer(ai_text):
        name = m.group(1)
        items = re.findall(r"['\"]([a-z0-9_]+)['\"]", m.group(2))
        out[name] = items
    return out


def parse_parity_probes(parity_text: str) -> dict[str, tuple[str, str]]:
    """Returns test_name -> (view_id, panel_id)."""
    out: dict[str, tuple[str, str]] = {}
    for m in _TEST_CALL_RE.finditer(parity_text):
        tname, view_id, panel_id = m.group(1), m.group(2), m.group(3)
        out[tname] = (view_id, panel_id)
    return out


def check_parity(ai_text: str, parity_text: str) -> list[str]:
    errors: list[str] = []
    views = parse_view_lists(ai_text)
    for req_const in ("PERIOD_CLOSE_STUDIO_VIEWS", "HOLDING_CLOSE_GATE_VIEWS"):
        if not views.get(req_const):
            errors.append(f"ai_edge.js missing non-empty `{req_const}` declaration")

    probes = parse_parity_probes(parity_text)
    for test_name, panel_id, view_const, mount_fn in EXPECTED_PANELS:
        # 1. Mount guard in ai_edge.js: verify the function body uses the right view list & sets panel_id
        fn_re = re.compile(rf"function\s+{re.escape(mount_fn)}\s*\([^)]*\)\s*\{{([\s\S]{{0,1500}}?panel\.id\s*=\s*'{re.escape(panel_id)}')")
        fn_m = fn_re.search(ai_text)
        if not fn_m:
            errors.append(f"ai_edge.js missing `{mount_fn}` mounting `{panel_id}`")
        elif f"{view_const}.includes(" not in fn_m.group(1):
            errors.append(f"ai_edge.js `{mount_fn}` does not guard with `{view_const}.includes(...)`")

        # 2. Dispatcher call in ai_edge.js
        disp_re = re.compile(rf"{re.escape(view_const)}\.includes\(\s*v\s*\)\)\s*{re.escape(mount_fn)}\(\s*\)\s*;")
        if not disp_re.search(ai_text):
            errors.append(f"ai_edge.js dispatcher does not gate `{mount_fn}()` by `{view_const}`")

        # 3. Probe in verify_live_parity.mjs
        probe = probes.get(test_name)
        if not probe:
            errors.append(f"verify_live_parity.mjs missing `await test('{test_name}', ..., toggleIn('{panel_id}'))`")
            continue
        probed_view, probed_panel = probe
        if probed_panel != panel_id:
            errors.append(f"verify_live_parity.mjs `{test_name}` toggles `{probed_panel}`, expected `{panel_id}`")
        allowed = views.get(view_const) or []
        if probed_view not in allowed:
            errors.append(
                f"route drift for `{test_name}` (`{panel_id}`): verify_live_parity.mjs navigates to view "
                f"`{probed_view}`, but ai_edge.js `{view_const}` only mounts on {allowed}"
            )
    return errors


def run_self_test() -> None:
    app_root = _resolve_app_root()
    ai_text = (app_root / "js" / "ai_edge.js").read_text(encoding="utf-8")
    parity_text = (ISABI_ROOT / "build" / "verify_live_parity.mjs").read_text(encoding="utf-8")
    real_errs = check_parity(ai_text, parity_text)
    if real_errs:
        raise AssertionError("real files failed baseline check: " + "; ".join(real_errs))

    # Negative 1: simulate someone moving mfg-period-close back to 'statements' in verify_live_parity.mjs
    drifted_parity = parity_text.replace(
        "await test('mfg-period-close', M, 'ledger',",
        "await test('mfg-period-close', M, 'statements',",
        1,
    )
    errs1 = check_parity(ai_text, drifted_parity)
    if not any("mfg-period-close" in e and "statements" in e for e in errs1):
        raise AssertionError(f"self-test failed to detect mfg-period-close route drift: {errs1}")

    # Negative 2: simulate removing hld_consolidation from HOLDING_CLOSE_GATE_VIEWS
    drifted_ai = re.sub(
        r"const HOLDING_CLOSE_GATE_VIEWS\s*=\s*\[[^\]]*\]",
        "const HOLDING_CLOSE_GATE_VIEWS = ['ledger', 'entities']",
        ai_text,
        count=1,
    )
    errs2 = check_parity(drifted_ai, parity_text)
    if not any("holding-14-entity-close" in e and "hld_consolidation" in e for e in errs2):
        raise AssertionError(f"self-test failed to detect Holding close-gate drift: {errs2}")

    # Negative 3: simulate missing mount function
    drifted_ai2 = ai_text.replace("function mountInsurancePeriodClosePanel(", "function _removedMountIns(")
    errs3 = check_parity(drifted_ai2, parity_text)
    if not any("mountInsurancePeriodClosePanel" in e for e in errs3):
        raise AssertionError(f"self-test failed to detect missing mount function: {errs3}")

    print("[verify_period_close_routes] self-test: PASS (3 negative drift cases caught)")


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    run_self_test()
    if "--self-test" in argv:
        return 0
    app_root = _resolve_app_root()
    ai_path = app_root / "js" / "ai_edge.js"
    parity_path = ISABI_ROOT / "build" / "verify_live_parity.mjs"
    errs = check_parity(ai_path.read_text(encoding="utf-8"), parity_path.read_text(encoding="utf-8"))
    if errs:
        for e in errs:
            print(f"[verify_period_close_routes] FAIL: {e}", file=sys.stderr)
        return 1
    views = parse_view_lists(ai_path.read_text(encoding="utf-8"))
    print(
        f"[verify_period_close_routes] PASS: all 6 vertical period-close panels aligned "
        f"(studio={views.get('PERIOD_CLOSE_STUDIO_VIEWS')}, holding={views.get('HOLDING_CLOSE_GATE_VIEWS')})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
