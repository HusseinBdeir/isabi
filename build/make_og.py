# Renders og-image.png (1200x630) for WhatsApp / LinkedIn / social link previews via headless browser (Palette C1)
import os
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from part_body import BADGE_SVG, WORDMARK_HEADER_SVG  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
OUT = os.path.join(ROOT, 'og-image.png')

HTML = f"""<!doctype html>
<html data-theme="dark"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@112,700;125,800&family=Instrument+Sans:wght@400;500;600&display=block">
<style>
  :root {{
    --badge-bg-1: #FCF9F2;
    --badge-bg-2: #EFE7D6;
    --badge-stroke: #C4913A;
    --badge-inner-stroke: rgba(184, 130, 40, 0.18);
    --badge-ii: #FAF6EE;
    --badge-rule: #D9A54A;
    --wm-ink: #FAF6EE;
    --wm-sys: #E6DEC8;
    --wm-rule: #D9A54A;
  }}
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html, body {{ width: 1200px; height: 630px; overflow: hidden; background: #1C1510; }}
  body {{ font-family: "Instrument Sans", Arial, sans-serif; color: #FAF6EE; position: relative; }}
  .glow {{ position: absolute; right: -180px; top: -220px; width: 760px; height: 760px; border-radius: 50%;
           background: radial-gradient(closest-side, rgba(217,165,74,0.20), rgba(217,165,74,0)); }}
  .grid {{ position: absolute; inset: 0; background-image: linear-gradient(rgba(250,246,238,0.035) 1px, transparent 1px),
           linear-gradient(90deg, rgba(250,246,238,0.035) 1px, transparent 1px); background-size: 60px 60px; }}
  .card {{ position: absolute; inset: 0; padding: 64px 72px; display: flex; flex-direction: column; justify-content: space-between; }}
  .brand {{ display: flex; align-items: center; gap: 18px; color: #FAF6EE; }}
  .brand svg.brand-badge {{ width: 58px; height: 58px; background: transparent; box-shadow: none; }}
  .brand svg.brand-badge .badge-outer {{ stroke: var(--badge-stroke); }}
  .brand svg.brand-badge .badge-inner {{ stroke: var(--badge-inner-stroke); }}
  .brand svg.brand-badge .badge-ii {{ fill: var(--badge-ii); }}
  .brand svg.brand-badge .badge-rule {{ fill: var(--badge-rule); }}
  .brand svg.brand-wordmark {{ height: 56px; width: auto; }}
  .brand svg.brand-wordmark .wm-word {{ fill: var(--wm-ink); }}
  .brand svg.brand-wordmark .wm-rule {{ fill: var(--wm-rule); }}
  .brand svg.brand-wordmark .wm-sys {{ fill: var(--wm-sys); }}
  h1 {{ font-family: "Archivo", Arial, sans-serif; font-weight: 800; font-size: 76px; line-height: 1.02; letter-spacing: -0.01em; max-width: 900px; color: #FAF6EE; }}
  h1 b {{ color: #D9A54A; font-weight: 800; }}
  p {{ font-size: 26px; line-height: 1.4; color: #D9CFC0; max-width: 920px; margin-top: 22px; }}
  .chips {{ display: flex; gap: 12px; flex-wrap: wrap; }}
  .chip {{ font-family: "Archivo", Arial, sans-serif; font-weight: 700; font-size: 17px; letter-spacing: 0.06em; text-transform: uppercase;
           padding: 12px 18px; border: 1px solid rgba(217,165,74,0.48); border-radius: 999px; color: #F0E2C4; background: rgba(217,165,74,0.11); }}
  .rule {{ position: absolute; left: 72px; right: 72px; bottom: 44px; border-top: 1.5px solid #D9A54A; border-bottom: 1.5px solid #D9A54A; height: 7px; }}
  .url {{ position: absolute; right: 72px; bottom: 60px; font-size: 18px; color: #C7B9A5; letter-spacing: 0.04em; }}
</style></head>
<body>
  <div class="glow"></div><div class="grid"></div>
  <div class="card">
    <div class="brand">{BADGE_SVG}{WORDMARK_HEADER_SVG}</div>
    <div>
      <h1>The ERP Your Group <b>Actually Runs On</b>.</h1>
      <p>Custom operations, double-entry accounting, executive dashboards, printable statements, field kiosks, and Ask ISABI AI. Tailored setup &amp; per-seat plans.</p>
    </div>
    <div class="chips">
      <span class="chip">Tailored Setup + Per-Seat</span>
      <span class="chip">1 to 2 Weeks to Go-Live</span>
      <span class="chip">Works With Your Accountant</span>
      <span class="chip">Field Kiosks &amp; Cited AI</span>
    </div>
  </div>
  <div class="url">husseinbdeir.github.io/isabi</div>
  <div class="rule"></div>
</body></html>
"""


def main():
    ud = tempfile.mkdtemp(prefix='isabi_og_')
    tmp_html = os.path.join(ROOT, '_og_tmp.html')
    try:
        with open(tmp_html, 'w', encoding='utf-8') as f:
            f.write(HTML)
        url = 'file:///' + tmp_html.replace('\\', '/')
        subprocess.run([
            EDGE, '--headless=new', '--disable-gpu', '--hide-scrollbars', f'--user-data-dir={ud}',
            '--window-size=1200,630', '--force-device-scale-factor=1', '--virtual-time-budget=8000',
            f'--screenshot={OUT}', url
        ], timeout=40, capture_output=True)
        ok = os.path.exists(OUT) and os.path.getsize(OUT) > 10000
        print(('OK' if ok else 'FAIL') + f': {OUT} ({os.path.getsize(OUT) if os.path.exists(OUT) else 0:,} bytes)')
        if not ok:
            sys.exit(1)
    finally:
        if os.path.exists(tmp_html):
            os.remove(tmp_html)
        shutil.rmtree(ud, ignore_errors=True)


if __name__ == '__main__':
    main()
