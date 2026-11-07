# Assembles index.html for ISABI Systems PWA and runs quality checks
import datetime
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from part_styles import CSS
from part_body import BODY
from part_script import JS
from part_faq import FAQ_JSONLD
from sync_app import sync_command_app
from audit_showcase_i18n import find_node_runtime, run_showcase_i18n_audit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_HTML = os.path.join(ROOT, 'index.html')

HEAD = """<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>ISABI Systems | Custom Enterprise ERP, Executive Dashboards and Cited AI</title>
  <meta name="description" content="ISABI Systems builds custom operations and double-entry accounting systems, interactive executive dashboards, bilingual printable statements, offline-ready field kiosks, and Ask ISABI AI with tailored setup and simple per-seat pricing.">
  <meta name="author" content="Hussein Bdeir">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
  <meta name="color-scheme" content="light dark">
  <link rel="canonical" href="https://isabisystems.com/">
  <link rel="sitemap" type="application/xml" title="Sitemap" href="https://isabisystems.com/sitemap.xml">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="ISABI Systems">
  <meta property="og:locale" content="en_US">
  <meta property="og:url" content="https://isabisystems.com/">
  <meta property="og:title" content="ISABI Systems | Custom Enterprise ERP, Executive Dashboards and Cited AI">
  <meta property="og:description" content="The ERP Your Group Actually Runs On. Custom operations, double-entry accounting, executive dashboards, printable statements, field kiosks, and Ask ISABI AI, live in 1 to 2 weeks with tailored setup and simple per-seat pricing.">
  <meta property="og:image" content="https://isabisystems.com/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="ISABI Systems. The ERP Your Group Actually Runs On.">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="ISABI Systems | Custom Enterprise ERP, Executive Dashboards and Cited AI">
  <meta name="twitter:description" content="Custom operations, double-entry accounting, executive dashboards, printable statements, offline-ready field kiosks, and Ask ISABI AI with tailored setup and simple per-seat pricing.">
  <meta name="twitter:image" content="https://isabisystems.com/og-image.png">
  <meta name="theme-color" content="#FAF9F6">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="ISABI Systems">
  <link rel="manifest" href="manifest.json?v=6.25">
  <link rel="icon" href="icon.svg?v=6.25" type="image/svg+xml" sizes="any">
  <link rel="icon" href="icon-dark.svg?v=6.25" type="image/svg+xml" sizes="any" media="(prefers-color-scheme: dark)">
  <link rel="icon" href="icon.svg?v=6.25" type="image/svg+xml" sizes="any" media="(prefers-color-scheme: light)">
  <link rel="shortcut icon" href="favicon.ico?v=6.25">
  <link rel="icon" href="favicon-dark.ico?v=6.25" sizes="256x256 128x128 64x64 48x48 32x32 16x16" media="(prefers-color-scheme: dark)">
  <link rel="icon" href="favicon.ico?v=6.25" sizes="256x256 128x128 64x64 48x48 32x32 16x16" media="(prefers-color-scheme: light)">
  <link rel="apple-touch-icon" sizes="180x180" href="icon-180.png?v=6.25">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@112,600;112,700;125,800&family=Instrument+Sans:wght@400;500;600;700&display=swap">
  <script id="pre-theme">
    (function(){
      try {
        var d = document.documentElement;
        var t = localStorage.getItem('isabi.theme.v2') === 'dark' ? 'dark' : 'light';
        d.setAttribute('data-theme', t);
        var m = document.querySelector('meta[name="theme-color"]');
        if (m) m.setAttribute('content', t === 'dark' ? '#1B140F' : '#FAF9F6');
        if (window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)) {
          d.classList.add('ios-standalone');
        }
      } catch (e) {}
    })();
  </script>
  <script type="application/ld+json">__WEBSITE_JSONLD__</script>
  <script type="application/ld+json">__ORG_JSONLD__</script>
  <script type="application/ld+json">__FAQ_JSONLD__</script>
"""

import json as _json
WEBSITE_JSONLD = _json.dumps({
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": "https://isabisystems.com/#website",
    "name": "ISABI Systems",
    "alternateName": ["ISABI", "ISABI ERP", "isabisystems.com"],
    "url": "https://isabisystems.com/",
    "publisher": {"@id": "https://isabisystems.com/#org"},
    "inLanguage": "en"
}, ensure_ascii=False)
ORG_JSONLD = _json.dumps({
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "@id": "https://isabisystems.com/#org",
    "name": "ISABI Systems",
    "url": "https://isabisystems.com/",
    "logo": "https://isabisystems.com/icon-512.png?v=6.25",
    "image": "https://isabisystems.com/og-image.png",
    "slogan": "The ERP Your Group Actually Runs On",
    "description": "Custom enterprise ERP operations, double-entry financial accounting, interactive executive dashboards, bilingual printable statements, offline-ready field kiosks, and the Ask ISABI assistant with tailored setup and simple per-seat pricing.",
    "email": "hbdeir16@gmail.com",
    "telephone": "+96170444955",
    "founder": {"@type": "Person", "name": "Hussein Bdeir", "jobTitle": "Founder and Principal Systems Architect"},
    "areaServed": ["Lebanon", "Middle East", "Worldwide"],
    "address": {"@type": "PostalAddress", "addressCountry": "LB"},
    "knowsAbout": ["Enterprise Resource Planning", "Multi-Entity Operations", "Executive Dashboards & Reporting", "Double-Entry Accounting", "POS & Gate Kiosks", "Automated Financial Controls"],
    "contactPoint": [{"@type": "ContactPoint", "contactType": "sales", "telephone": "+96170444955", "email": "hbdeir16@gmail.com", "availableLanguage": ["en", "ar", "fr"]}],
    "priceRange": "$3,000 to $11,000+ setup + $50 to $100/seat/mo"
}, ensure_ascii=False)
HEAD = HEAD.replace("__WEBSITE_JSONLD__", WEBSITE_JSONLD).replace("__ORG_JSONLD__", ORG_JSONLD).replace("__FAQ_JSONLD__", FAQ_JSONLD)

ROBOTS_TXT = """User-agent: *
Allow: /
Disallow: /app/

Sitemap: https://isabisystems.com/sitemap.xml
"""


def build_sitemap_xml(lastmod_iso: str) -> str:
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>https://isabisystems.com/</loc>
    <lastmod>{lastmod_iso}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <image:image>
      <image:loc>https://isabisystems.com/og-image.png</image:loc>
      <image:title>ISABI Systems | The ERP Your Group Actually Runs On</image:title>
    </image:image>
  </url>
</urlset>
"""

def main():
    full_html = f"{HEAD}<style>{CSS}</style>\n</head>\n<body>\n{BODY}\n<script>{JS}</script>\n</body>\n</html>\n"

    # Check deliverable rules: no em dashes or unicode/ascii arrows in visible text
    for forbidden, label in [('\u2014', 'em dash'), ('\u2192', 'unicode arrow'), ('&mdash;', 'mdash entity'), ('&rarr;', 'rarr entity')]:
        if forbidden in full_html:
            print(f"ERROR: Found forbidden {label} ({forbidden!r}) in output HTML", file=sys.stderr)
            sys.exit(1)

    with open(OUT_HTML, 'w', encoding='utf-8', newline='\n') as f:
        f.write(full_html)
    with open(os.path.join(ROOT, 'CNAME'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('isabisystems.com\n')
    with open(os.path.join(ROOT, 'robots.txt'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(ROBOTS_TXT)
    today_iso = datetime.date.today().isoformat()
    with open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(build_sitemap_xml(today_iso))

    # Check JS syntax with node --check (falls back to VS Code Electron-as-Node if node is not on PATH)
    tmp_js = os.path.join(ROOT, 'build', '_check_syntax.js')
    with open(tmp_js, 'w', encoding='utf-8') as f:
        f.write(JS)
    node_bin, node_env = find_node_runtime()
    res = subprocess.run([node_bin, '--check', tmp_js], capture_output=True, text=True, env=node_env)
    if os.path.exists(tmp_js):
        os.remove(tmp_js)
    if res.returncode != 0:
        print("JS SYNTAX ERROR:", res.stderr, file=sys.stderr)
        sys.exit(1)

    # Static pre-deploy Showcase trilingual (EN | AR | FR) audit gate
    if run_showcase_i18n_audit() != 0:
        sys.exit(1)

    # Sync Command Center bundle into /isabi/app/ unless skipped or isabi-app has uncommitted WIP
    if '--skip-app-sync' in sys.argv or os.environ.get('ISABI_SKIP_APP_SYNC') == '1':
        print("INFO: Skipped sync_command_app() (--skip-app-sync)")
    else:
        parent_dir = os.path.dirname(ROOT)
        app_src_dir = (
            os.path.join(parent_dir, 'isabi-app')
            if os.path.isdir(os.path.join(parent_dir, 'isabi-app'))
            else os.path.join(parent_dir, 'mfg-web')
        )
        app_src_dirty = False
        if os.path.isdir(app_src_dir) and '--force-app-sync' not in sys.argv:
            st = subprocess.run(['git', '-C', app_src_dir, 'status', '--porcelain'], capture_output=True, text=True)
            app_src_dirty = bool(st.returncode == 0 and st.stdout.strip())
        if app_src_dirty:
            print("WARN: Skipped sync_command_app() because isabi-app has uncommitted WIP (pass --force-app-sync to override)")
        else:
            sync_command_app()

    # Sync OneDrive mirror if present
    mirror_dir = os.path.join(os.path.expanduser('~'), 'OneDrive - BHFIRMS', 'System', 'System', 'ISABI', 'Website')
    if os.path.isdir(mirror_dir):
        import shutil
        for mf in ('index.html', 'CNAME', 'robots.txt', 'sitemap.xml', 'sw.js', 'manifest.json', 'og-image.png', 'favicon.ico', 'favicon-dark.ico', 'icon.svg', 'icon-dark.svg', 'icon-maskable.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'):
            msrc = os.path.join(ROOT, mf)
            if os.path.exists(msrc):
                shutil.copy2(msrc, os.path.join(mirror_dir, mf))

    print(f"OK: Generated {OUT_HTML} ({len(full_html):,} bytes, JS syntax verified, 0 em-dashes/arrows)")

if __name__ == '__main__':
    main()
