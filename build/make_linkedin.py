# Renders LinkedIn Company Page brand assets (Palette C1: Light Gallery-Alabaster recommended + Dark Espresso variant)
# Outputs upload-ready PNGs into ~\bhfirms\memory\ISABI\Brand\linkedin\ (Cloudflare memory vault; left OneDrive 2026-11-13)
import os
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from part_body import WORDMARK_HEADER_SVG  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
OUT_DIR = os.path.join(
    os.path.expanduser('~'),
    'bhfirms', 'memory', 'ISABI', 'Brand', 'linkedin'
)

LOGO_LIGHT_HTML = """<!doctype html>
<html><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 800px; height: 800px; overflow: hidden; background: #FCF9F2; }
  svg { display: block; width: 800px; height: 800px; }
</style></head>
<body>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
  <defs>
    <linearGradient id="c1plate" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FCF9F2"/>
      <stop offset="100%" stop-color="#EFE7D6"/>
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#c1plate)"/>
  <g fill="#281D15">
    <rect x="263" y="180" width="100" height="337"/>
    <rect x="437" y="180" width="100" height="337"/>
  </g>
  <g fill="#B88228">
    <rect x="263" y="564" width="274" height="17" rx="2.5"/>
    <rect x="263" y="603" width="274" height="17" rx="2.5"/>
  </g>
</svg>
</body></html>
"""

LOGO_DARK_HTML = """<!doctype html>
<html><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 800px; height: 800px; overflow: hidden; background: #1C1510; }
  svg { display: block; width: 800px; height: 800px; }
</style></head>
<body>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
  <defs>
    <linearGradient id="c1dark" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#261D16"/>
      <stop offset="100%" stop-color="#18120D"/>
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#c1dark)"/>
  <g fill="#FAF6EE">
    <rect x="263" y="180" width="100" height="337"/>
    <rect x="437" y="180" width="100" height="337"/>
  </g>
  <g fill="#D9A54A">
    <rect x="263" y="564" width="274" height="17" rx="2.5"/>
    <rect x="263" y="603" width="274" height="17" rx="2.5"/>
  </g>
</svg>
</body></html>
"""


def build_cover_html(dark: bool = False) -> str:
    if not dark:
        bg = "linear-gradient(115deg, #FCFBF8 0%, #FAF7F0 58%, #F3ECE0 100%)"
        glow = "rgba(184, 130, 40, 0.13)"
        grid = "rgba(40, 29, 21, 0.028)"
        wm_ink, wm_rule, wm_sys = "#281D15", "#B88228", "#4A3628"
        h1_col, h1_accent, sub_col = "#281D15", "#B88228", "#4A3628"
        card_bg, card_bdr, card_shd = "rgba(255, 255, 255, 0.92)", "rgba(184, 130, 40, 0.30)", "0 14px 34px rgba(40, 29, 21, 0.06)"
        eyebrow_col, pill_bg, pill_bdr, pill_col = "#9A6B1E", "#FAF6EE", "rgba(40, 29, 21, 0.11)", "#281D15"
        url_bg, url_col, url_bdr = "rgba(184, 130, 40, 0.12)", "#281D15", "rgba(184, 130, 40, 0.38)"
    else:
        bg = "linear-gradient(115deg, #211913 0%, #1C1510 60%, #16100C 100%)"
        glow = "rgba(217, 165, 74, 0.20)"
        grid = "rgba(250, 246, 238, 0.035)"
        wm_ink, wm_rule, wm_sys = "#FAF6EE", "#D9A54A", "#E6DEC8"
        h1_col, h1_accent, sub_col = "#FAF6EE", "#D9A54A", "#D9CFC0"
        card_bg, card_bdr, card_shd = "rgba(38, 29, 22, 0.90)", "rgba(217, 165, 74, 0.34)", "0 14px 34px rgba(0, 0, 0, 0.26)"
        eyebrow_col, pill_bg, pill_bdr, pill_col = "#D9A54A", "rgba(250, 246, 238, 0.06)", "rgba(250, 246, 238, 0.14)", "#FAF6EE"
        url_bg, url_col, url_bdr = "rgba(217, 165, 74, 0.15)", "#FAF6EE", "rgba(217, 165, 74, 0.45)"

    return f"""<!doctype html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@112,700;125,800&family=Instrument+Sans:wght@400;500;600;700&display=block">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html, body {{ width: 2256px; height: 382px; overflow: hidden; background: {bg}; font-family: "Instrument Sans", Arial, sans-serif; position: relative; }}
  .glow {{ position: absolute; right: -120px; top: -220px; width: 900px; height: 760px; border-radius: 50%;
           background: radial-gradient(closest-side, {glow}, transparent); }}
  .grid {{ position: absolute; inset: 0;
           background-image: linear-gradient({grid} 1px, transparent 1px), linear-gradient(90deg, {grid} 1px, transparent 1px);
           background-size: 48px 48px; }}
  /* Safe layout: left 336px stays clear of LinkedIn's bottom-left overlapping company logo */
  .stage {{ position: absolute; left: 348px; right: 68px; top: 38px; bottom: 44px;
            display: flex; align-items: center; justify-content: space-between; gap: 44px; }}
  .copy {{ display: flex; flex-direction: column; justify-content: center; max-width: 1120px; }}
  .wm-row {{ display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }}
  .wm-row svg.brand-wordmark {{ height: 34px; width: auto; display: block; }}
  .wm-row svg.brand-wordmark .wm-word {{ fill: {wm_ink}; }}
  .wm-row svg.brand-wordmark .wm-rule {{ fill: {wm_rule}; }}
  .wm-row svg.brand-wordmark .wm-sys {{ fill: {wm_sys}; }}
  .wm-sep {{ width: 5px; height: 5px; border-radius: 50%; background: {wm_rule}; opacity: 0.8; }}
  .wm-tag {{ font-family: "Archivo", Arial, sans-serif; font-weight: 700; font-size: 15px; letter-spacing: 0.10em;
             text-transform: uppercase; color: {eyebrow_col}; }}
  h1 {{ font-family: "Archivo", Arial, sans-serif; font-weight: 800; font-size: 56px; line-height: 1.04;
        letter-spacing: -0.015em; color: {h1_col}; white-space: nowrap; }}
  h1 b {{ color: {h1_accent}; font-weight: 800; }}
  p {{ margin-top: 14px; font-size: 22.5px; line-height: 1.36; font-weight: 500; color: {sub_col}; max-width: 1080px; }}
  .deck {{ width: 650px; flex-shrink: 0; background: {card_bg}; border: 1.5px solid {card_bdr}; border-radius: 18px;
           box-shadow: {card_shd}; padding: 22px 26px 20px; display: flex; flex-direction: column; gap: 14px; }}
  .deck-top {{ display: flex; align-items: center; justify-content: space-between; gap: 12px;
               padding-bottom: 11px; border-bottom: 3px double {wm_rule}; }}
  .deck-kicker {{ font-family: "Archivo", Arial, sans-serif; font-weight: 700; font-size: 13.5px;
                  letter-spacing: 0.09em; text-transform: uppercase; color: {eyebrow_col}; }}
  .deck-url {{ font-family: "Archivo", Arial, sans-serif; font-weight: 700; font-size: 15px; letter-spacing: 0.02em;
               padding: 5px 13px; border-radius: 999px; background: {url_bg}; border: 1px solid {url_bdr}; color: {url_col}; }}
  .pills {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 10px; }}
  .pill {{ font-size: 15px; font-weight: 600; color: {pill_col}; background: {pill_bg}; border: 1px solid {pill_bdr};
           border-radius: 9px; padding: 8px 11px; text-align: center; white-space: nowrap; }}
  .bottom-rule {{ position: absolute; left: 348px; right: 68px; bottom: 20px; height: 6px;
                  border-top: 1.5px solid {wm_rule}; border-bottom: 1.5px solid {wm_rule}; opacity: 0.85; }}
</style></head>
<body>
  <div class="glow"></div>
  <div class="grid"></div>
  <div class="stage">
    <div class="copy">
      <div class="wm-row">
        {WORDMARK_HEADER_SVG}
        <span class="wm-sep"></span>
        <span class="wm-tag">Enterprise Operations and Accounting</span>
      </div>
      <h1>The ERP Your Group <b>Actually Runs On</b>.</h1>
      <p>Custom daily operations, double-entry accounting, executive dashboards, field kiosks, and Ask ISABI.</p>
    </div>
    <div class="deck">
      <div class="deck-top">
        <span class="deck-kicker">Custom-Built in 1 to 2 Weeks</span>
        <span class="deck-url">isabisystems.com</span>
      </div>
      <div class="pills">
        <span class="pill">Manufacturing</span>
        <span class="pill">Holding Groups</span>
        <span class="pill">Hospitality</span>
        <span class="pill">Heavy Equipment</span>
        <span class="pill">Real Estate</span>
        <span class="pill">Insurance</span>
      </div>
    </div>
  </div>
  <div class="bottom-rule"></div>
</body></html>
"""


def render_html(html: str, width: int, height: int, out_path: str, ud: str) -> None:
    tmp_html = os.path.join(ud, os.path.basename(out_path) + '.html')
    with open(tmp_html, 'w', encoding='utf-8') as f:
        f.write(html)
    if os.path.exists(out_path):
        os.remove(out_path)
    url = 'file:///' + tmp_html.replace('\\', '/')
    subprocess.run([
        EDGE, '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
        f'--user-data-dir={os.path.join(ud, "prof_" + os.path.basename(out_path))}',
        f'--window-size={width},{height}', '--force-device-scale-factor=1',
        '--virtual-time-budget=8000', f'--screenshot={out_path}', url
    ], timeout=45, capture_output=True)
    if not os.path.exists(out_path) or os.path.getsize(out_path) < 2000:
        raise RuntimeError(f'Failed to render {out_path}')
    print(f'OK: {out_path} ({width}x{height}, {os.path.getsize(out_path):,} bytes)')


def build_preview_html(logo_light_uri: str, cover_light_uri: str, logo_dark_uri: str, cover_dark_uri: str) -> str:
    def card_block(label: str, rec_badge: str, logo_uri: str, cover_uri: str) -> str:
        badge_html = f'<span class="rec">{rec_badge}</span>' if rec_badge else ''
        return f"""
        <div class="opt-wrap">
          <div class="opt-hdr">
            <span class="opt-title">{label}</span>
            {badge_html}
          </div>
          <div class="li-card">
            <div class="li-cover"><img src="{cover_uri}" alt=""></div>
            <div class="li-body">
              <div class="li-logo"><img src="{logo_uri}" alt=""></div>
              <div class="li-meta">
                <h2>ISABI Systems</h2>
                <p class="li-tag">The ERP your group actually runs on. Custom operations, double-entry accounting, dashboards, kiosks, and Ask ISABI.</p>
                <p class="li-sub">Software Development &middot; Beirut, Lebanon &middot; 2-10 employees</p>
                <div class="li-btns">
                  <span class="li-btn-pri">+ Follow</span>
                  <span class="li-btn-sec">Visit website &#8599;</span>
                </div>
              </div>
              <div class="li-feed-check">
                <span class="fc-lbl">Feed &amp; Comment Sizes</span>
                <div class="fc-row">
                  <div class="fc-item"><img src="{logo_uri}" class="sz48"><span>48px Post</span></div>
                  <div class="fc-item"><img src="{logo_uri}" class="sz32"><span>32px Search</span></div>
                  <div class="fc-item"><img src="{logo_uri}" class="sz24"><span>24px Reply</span></div>
                  <div class="fc-item dark-chip"><img src="{logo_uri}" class="sz32"><span>Dark UI</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        """

    return f"""<!doctype html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=block">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html, body {{ width: 1240px; background: #F3F2EF; font-family: -apple-system, "Segoe UI", "Instrument Sans", sans-serif; color: #191919; padding: 24px 28px 32px; }}
  .opt-wrap {{ margin-bottom: 26px; }}
  .opt-wrap:last-child {{ margin-bottom: 0; }}
  .opt-hdr {{ display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }}
  .opt-title {{ font-size: 16px; font-weight: 700; color: #281D15; }}
  .rec {{ font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; background: #B88228; color: #FFFFFF; padding: 4px 10px; border-radius: 999px; }}
  .li-card {{ width: 1128px; background: #FFFFFF; border-radius: 10px; border: 1px solid rgba(0,0,0,0.08); overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }}
  .li-cover {{ width: 1128px; height: 191px; overflow: hidden; position: relative; background: #FAF9F6; }}
  .li-cover img {{ width: 1128px; height: 191px; display: block; object-fit: cover; }}
  .li-body {{ position: relative; padding: 16px 28px 22px 28px; display: flex; justify-content: space-between; align-items: flex-end; }}
  /* Exact LinkedIn Company Page bottom-left logo overlap: 112x112 square overlapping cover by ~56px */
  .li-logo {{ position: absolute; left: 24px; top: -56px; width: 112px; height: 112px; background: #FFFFFF; padding: 4px;
              border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.12); border: 1px solid rgba(0,0,0,0.06); }}
  .li-logo img {{ width: 100%; height: 100%; display: block; border-radius: 5px; }}
  .li-meta {{ padding-top: 58px; max-width: 720px; }}
  .li-meta h2 {{ font-size: 24px; font-weight: 700; color: rgba(0,0,0,0.9); line-height: 1.2; }}
  .li-tag {{ font-size: 15px; color: rgba(0,0,0,0.9); margin-top: 4px; line-height: 1.35; }}
  .li-sub {{ font-size: 13.5px; color: rgba(0,0,0,0.6); margin-top: 4px; }}
  .li-btns {{ display: flex; gap: 10px; margin-top: 14px; }}
  .li-btn-pri {{ background: #0A66C2; color: #FFFFFF; font-weight: 600; font-size: 15px; padding: 6px 18px; border-radius: 999px; }}
  .li-btn-sec {{ border: 1.5px solid #0A66C2; color: #0A66C2; font-weight: 600; font-size: 15px; padding: 5px 18px; border-radius: 999px; }}
  .li-feed-check {{ background: #FAF9F6; border: 1px solid rgba(0,0,0,0.08); border-radius: 10px; padding: 12px 16px; }}
  .fc-lbl {{ display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #666; margin-bottom: 8px; }}
  .fc-row {{ display: flex; align-items: center; gap: 14px; }}
  .fc-item {{ display: flex; flex-direction: column; align-items: center; gap: 5px; font-size: 11px; color: #555; }}
  .fc-item img {{ border-radius: 4px; border: 1px solid rgba(0,0,0,0.08); display: block; }}
  .sz48 {{ width: 48px; height: 48px; }}
  .sz32 {{ width: 32px; height: 32px; }}
  .sz24 {{ width: 24px; height: 24px; }}
  .dark-chip {{ background: #1B1F23; color: #E8E6DF; padding: 6px 10px; border-radius: 8px; }}
</style></head>
<body>
  {card_block("Option A: Gallery-Alabaster Light Suite (Matches isabisystems.com Default Theme)", "Recommended", logo_light_uri, cover_light_uri)}
  {card_block("Option B: Warm Espresso-Bronze Dark Suite (Matches Social Link Card)", "", logo_dark_uri, cover_dark_uri)}
</body></html>
"""


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    ud = tempfile.mkdtemp(prefix='isabi_li_')
    try:
        logo_light = os.path.join(OUT_DIR, 'isabi-linkedin-logo-800.png')
        logo_dark = os.path.join(OUT_DIR, 'isabi-linkedin-logo-dark-800.png')
        cover_light = os.path.join(OUT_DIR, 'isabi-linkedin-cover-2256x382.png')
        cover_dark = os.path.join(OUT_DIR, 'isabi-linkedin-cover-dark-2256x382.png')

        render_html(LOGO_LIGHT_HTML, 800, 800, logo_light, ud)
        render_html(LOGO_DARK_HTML, 800, 800, logo_dark, ud)
        render_html(build_cover_html(dark=False), 2256, 382, cover_light, ud)
        render_html(build_cover_html(dark=True), 2256, 382, cover_dark, ud)

        if '--preview' in sys.argv:
            idx = sys.argv.index('--preview')
            prev_out = sys.argv[idx + 1]
            prev_html = build_preview_html(
                'file:///' + logo_light.replace('\\', '/'),
                'file:///' + cover_light.replace('\\', '/'),
                'file:///' + logo_dark.replace('\\', '/'),
                'file:///' + cover_dark.replace('\\', '/'),
            )
            render_html(prev_html, 1240, 1010, prev_out, ud)
    finally:
        shutil.rmtree(ud, ignore_errors=True)


if __name__ == '__main__':
    main()
