"""verify_deployed_shell.py - offline gate for functions/_lib/deployed_shell.js, the ceiling the Edge puts on the
store's minShellVer. Writes only to a temp folder.

Run: python build/verify_deployed_shell.py      (exit 1 with every failed check named)

What it pins down
  * the committed file names the shell app/sw.js serves, byte for byte as sync_app.py writes it;
  * sync_app.write_deployed_shell_ver writes it, is a no-op when it is current, and refuses a junk version;
  * stage_pages_bundle.check_deployed_shell_ver (run before every deploy) passes on a matching tree, stops a deploy
    whose file disagrees with app/sw.js, and stays out of the way on a tree that has neither file.
"""
from __future__ import annotations

import pathlib
import re
import sys
import tempfile

sys.stdout.reconfigure(encoding="utf-8")
BUILD = pathlib.Path(__file__).resolve().parent
ROOT = BUILD.parent
sys.path.insert(0, str(BUILD))

import stage_pages_bundle as SPB  # noqa: E402
import sync_app as SA  # noqa: E402

FAILED: list[str] = []
COUNT = 0


def check(label: str, got, want) -> None:
    global COUNT
    COUNT += 1
    if got != want:
        FAILED.append(f"{label}: got {got!r}, expected {want!r}")


def raises(label: str, fn) -> None:
    global COUNT
    COUNT += 1
    try:
        fn()
    except (RuntimeError, SystemExit):
        return
    FAILED.append(f"{label}: did not stop")


def tree(sw_ver: str | None, ds_ver: str | None) -> pathlib.Path:
    t = pathlib.Path(tempfile.mkdtemp(prefix="deployed_shell_"))
    if sw_ver is not None:
        (t / "app").mkdir(parents=True)
        (t / "app" / "sw.js").write_text(f"const SHELL_CACHE = 'isabi-mfg-v{sw_ver}';\n", encoding="utf-8")
    if ds_ver is not None:
        (t / "functions" / "_lib").mkdir(parents=True)
        (t / "functions" / "_lib" / "deployed_shell.js").write_text(SA.render_deployed_shell_js(ds_ver), encoding="utf-8")
    return t


sw_ver = re.search(r"SHELL_CACHE\s*=\s*'isabi-mfg-v([0-9.]+)'", (ROOT / "app" / "sw.js").read_text(encoding="utf-8")).group(1)
committed = (ROOT / "functions" / "_lib" / "deployed_shell.js").read_bytes().decode("utf-8")
check("committed deployed_shell.js is exactly what sync_app.py writes for app/sw.js", committed, SA.render_deployed_shell_js(sw_ver))
check("the stager accepts this tree", SPB.check_deployed_shell_ver(ROOT), sw_ver)

check("stager: matching temp tree", SPB.check_deployed_shell_ver(tree("19.6.300", "19.6.300")), "19.6.300")
raises("stager: stops when app/sw.js is newer than deployed_shell.js", lambda: SPB.check_deployed_shell_ver(tree("19.6.301", "19.6.300")))
raises("stager: stops when deployed_shell.js is newer than app/sw.js", lambda: SPB.check_deployed_shell_ver(tree("19.6.299", "19.6.300")))
check("stager: a tree without the file (an older commit) is not blocked", SPB.check_deployed_shell_ver(tree("19.6.300", None)), "")

t = tree(None, None)
(t / "functions" / "_lib").mkdir(parents=True)
saved = SA.DEPLOYED_SHELL_JS
SA.DEPLOYED_SHELL_JS = str(t / "functions" / "_lib" / "deployed_shell.js")
try:
    check("writer: first write changes the file", SA.write_deployed_shell_ver("19.6.400"), True)
    check("writer: same version again is a no-op", SA.write_deployed_shell_ver("19.6.400"), False)
    check("writer: content", pathlib.Path(SA.DEPLOYED_SHELL_JS).read_bytes().decode("utf-8"), SA.render_deployed_shell_js("19.6.400"))
    check("writer: LF line endings", b"\r\n" in pathlib.Path(SA.DEPLOYED_SHELL_JS).read_bytes(), False)
    raises("writer: refuses a junk version", lambda: SA.write_deployed_shell_ver("19.6.400'; alert(1);//"))
    check("writer: the junk attempt left the file alone", pathlib.Path(SA.DEPLOYED_SHELL_JS).read_bytes().decode("utf-8"), SA.render_deployed_shell_js("19.6.400"))
finally:
    SA.DEPLOYED_SHELL_JS = saved

if FAILED:
    print(f"verify_deployed_shell: {len(FAILED)} of {COUNT} checks FAILED")
    for f in FAILED:
        print("  FAIL", f)
    sys.exit(1)
print(f"verify_deployed_shell: {COUNT}/{COUNT} passed")
