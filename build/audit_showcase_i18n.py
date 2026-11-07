#!/usr/bin/env python3
"""Static pre-deploy trilingual (EN | AR | FR) audit gate for ISABI Showcase (isabisystems.com/).

Extracts UI text nodes and placeholder/aria-label/title attributes from build/part_body.py
and evaluates every candidate against live window.ISABI_I18N.isTranslated(s, 'ar' | 'fr')
inside a sandboxed Node/Electron VM context. Exits non-zero if any UI string is untranslated.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from html.parser import HTMLParser
from pathlib import Path

BUILD_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BUILD_DIR))

from part_body import BODY  # noqa: E402
from part_i18n import SHOWCASE_I18N_JS  # noqa: E402


def find_node_runtime() -> tuple[str, dict[str, str]]:
    env = dict(os.environ)
    node_bin = shutil.which("node")
    if node_bin:
        return node_bin, env
    candidates = [
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Microsoft VS Code" / "Code.exe",
        Path(r"C:\Program Files\Microsoft VS Code\Code.exe"),
        Path(r"C:\Program Files\nodejs\node.exe"),
    ]
    for c in candidates:
        if c.is_file():
            if c.name.lower() == "code.exe":
                env["ELECTRON_RUN_AS_NODE"] = "1"
            return str(c), env
    raise RuntimeError("No Node.js or VS Code Electron runtime found for i18n verification.")


SKIP_TAGS = {"script", "style", "noscript", "code", "pre", "svg"}
SKIP_CLASSES = {"mono", "sim-ticket-num", "soa-doc-ref"}


class ShowcaseExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, dict[str, str], bool]] = []
        self.items: list[tuple[str, str]] = []

    def _in_skip(self) -> bool:
        return any(s[2] for s in self.stack)

    def _in_raw_td(self) -> bool:
        td_idx = -1
        in_tbody = False
        for idx, (tag, attrs, _) in enumerate(self.stack):
            if tag == "tbody":
                in_tbody = True
            if tag == "td" and in_tbody:
                td_idx = idx
        if td_idx < 0:
            return False
        if td_idx > 0:
            tr_tag, tr_attrs, _ = self.stack[td_idx - 1]
            if tr_tag == "tr" and re.search(r"\b(total|subtotal|summary|footer)\b", tr_attrs.get("class", ""), re.I):
                return False
        for tag, attrs, _ in self.stack[td_idx + 1:]:
            cls = set(attrs.get("class", "").split())
            if tag == "button" or bool(cls & {"btn", "badge", "pill", "status-pill"}):
                return False
        return True

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        t = tag.lower()
        ad = {k.lower(): (v or "") for k, v in attrs}
        cls = set(ad.get("class", "").split())
        parent_skip = self._in_skip()
        skip_here = (
            parent_skip
            or t in SKIP_TAGS
            or "data-no-i18n" in ad
            or ad.get("id") == "hdr-lang-switch"
            or bool(cls & SKIP_CLASSES)
        )
        self.stack.append((t, ad, skip_here))
        if not skip_here and not self._in_raw_td():
            for attr in ("placeholder", "aria-label", "title"):
                val = ad.get(attr, "").strip()
                if val and re.search(r"[A-Za-z]", val):
                    self.items.append((val, f"<{t}@{attr}>"))

    def handle_endtag(self, tag: str) -> None:
        t = tag.lower()
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == t:
                del self.stack[i:]
                break

    def handle_data(self, data: str) -> None:
        if self._in_skip() or self._in_raw_td():
            return
        s = re.sub(r"\s+", " ", data).strip()
        if not s or not re.search(r"[A-Za-z]", s):
            return
        cur_tag = self.stack[-1][0] if self.stack else "body"
        self.items.append((s, f"<{cur_tag}>"))


def run_showcase_i18n_audit() -> int:
    parser = ShowcaseExtractor()
    parser.feed(BODY)

    dedup: dict[str, str] = {}
    for text, ctx in parser.items:
        if text not in dedup:
            dedup[text] = ctx

    candidates = [{"text": t, "ctx": c} for t, c in dedup.items()]
    node_bin, env = find_node_runtime()

    harness = """
const fs = require('fs');
const vm = require('vm');
const payload = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const code = '(function(){\\n' + fs.readFileSync(process.argv[3], 'utf8') + '\\n})();';
const noop = () => {};
const elStub = {
  addEventListener: noop,
  setAttribute: noop,
  getAttribute: () => '',
  querySelectorAll: () => [],
  classList: { toggle: noop, add: noop, remove: noop, contains: () => false }
};
const sandbox = {
  console,
  Map, Set, RegExp, Object, Array, String, Number, Boolean, Math, Date,
  URLSearchParams,
  requestAnimationFrame: noop,
  setTimeout: noop,
  navigator: { webdriver: true },
  location: { search: '', protocol: 'https:' },
  localStorage: { getItem: () => null, setItem: noop },
  MutationObserver: function() { this.observe = noop; this.disconnect = noop; },
  NodeFilter: { SHOW_TEXT: 4 },
  document: {
    title: '',
    head: { appendChild: noop },
    body: elStub,
    documentElement: elStub,
    getElementById: () => elStub,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {} }),
    createTreeWalker: () => ({ nextNode: () => null })
  }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const api = sandbox.ISABI_I18N;
const missAr = [], missFr = [];
for (const it of payload) {
  if (!api.isTranslated(it.text, 'ar')) missAr.push(it);
  if (!api.isTranslated(it.text, 'fr')) missFr.push(it);
}
process.stdout.write(JSON.stringify({ total: payload.length, missAr, missFr }));
"""

    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        cand_file = td_path / "candidates.json"
        i18n_file = td_path / "part_i18n.js"
        run_file = td_path / "run.js"
        cand_file.write_text(json.dumps(candidates, ensure_ascii=False), encoding="utf-8")
        i18n_file.write_text(SHOWCASE_I18N_JS, encoding="utf-8")
        run_file.write_text(harness, encoding="utf-8")

        proc = subprocess.run(
            [node_bin, str(run_file), str(cand_file), str(i18n_file)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            env=env,
        )
        if proc.returncode != 0:
            print(f"[audit_showcase_i18n] VM ERROR:\n{proc.stderr}", file=sys.stderr)
            return 2
        res = json.loads(proc.stdout)

    miss_ar = res["missAr"]
    miss_fr = res["missFr"]
    if miss_ar or miss_fr:
        print(
            f"[audit_showcase_i18n] FAIL: {len(miss_ar)} missing AR, {len(miss_fr)} missing FR "
            f"out of {res['total']} Showcase UI strings",
            file=sys.stderr,
        )
        for it in miss_ar[:40]:
            print(f"  [AR] {it['ctx']} {it['text']}", file=sys.stderr)
        for it in miss_fr[:40]:
            print(f"  [FR] {it['ctx']} {it['text']}", file=sys.stderr)
        return 1

    print(
        f"[audit_showcase_i18n] PASS: {res['total']:,} Showcase UI strings verified "
        f"(0 missing AR, 0 missing FR)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(run_showcase_i18n_audit())
