# Assembles index.html for ISABI Systems PWA and runs quality checks
import os
import subprocess
import sys

from part_styles import CSS
from part_body import BODY
from part_script import JS
from part_faq import FAQ_JSONLD
from sync_app import sync_command_app

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_HTML = os.path.join(ROOT, 'index.html')

HEAD = """<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>ISABI Systems | Custom Enterprise ERP, Executive Dashboards and Cited AI</title>
  <meta name="description" content="ISABI Systems builds custom operations and double-entry accounting systems, interactive executive dashboards, bilingual printable statements, offline-ready field kiosks, and Ask ISABI AI with zero per-user fees.">
  <meta name="author" content="Hussein Bdeir">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="color-scheme" content="light dark">
  <link rel="canonical" href="https://husseinbdeir.github.io/isabi/">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="ISABI Systems">
  <meta property="og:locale" content="en_US">
  <meta property="og:url" content="https://husseinbdeir.github.io/isabi/">
  <meta property="og:title" content="ISABI Systems | Custom Enterprise ERP, Executive Dashboards and Cited AI">
  <meta property="og:description" content="The ERP Your Group Actually Runs On. Custom operations, double-entry accounting, executive dashboards, printable statements, field kiosks, and Ask ISABI AI, live in 1 to 2 weeks with zero per-user fees.">
  <meta property="og:image" content="https://husseinbdeir.github.io/isabi/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="ISABI Systems. The ERP Your Group Actually Runs On.">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="ISABI Systems | Custom Enterprise ERP, Executive Dashboards and Cited AI">
  <meta name="twitter:description" content="Custom operations, double-entry accounting, executive dashboards, printable statements, offline-ready field kiosks, and Ask ISABI AI with zero per-user fees.">
  <meta name="twitter:image" content="https://husseinbdeir.github.io/isabi/og-image.png">
  <meta name="theme-color" content="#F4F2EE">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="ISABI Systems">
  <link rel="manifest" href="manifest.json">
  <link rel="icon" href="favicon.ico" sizes="any">
  <link rel="icon" href="icon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="icon-180.png">
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
        if (m) m.setAttribute('content', t === 'dark' ? '#0B1730' : '#F4F2EE');
        if (window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)) {
          d.classList.add('ios-standalone');
        }
      } catch (e) {}
    })();
  </script>
  <script type="application/ld+json">__ORG_JSONLD__</script>
  <script type="application/ld+json">__FAQ_JSONLD__</script>
"""

import json as _json
ORG_JSONLD = _json.dumps({
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "@id": "https://husseinbdeir.github.io/isabi/#org",
    "name": "ISABI Systems",
    "url": "https://husseinbdeir.github.io/isabi/",
    "logo": "https://husseinbdeir.github.io/isabi/icon-512.png",
    "image": "https://husseinbdeir.github.io/isabi/og-image.png",
    "slogan": "The ERP Your Group Actually Runs On",
    "description": "Custom enterprise ERP operations, double-entry financial accounting, interactive executive dashboards, bilingual printable statements, offline-ready field kiosks, and the Ask ISABI assistant with zero per-user fees.",
    "email": "hbdeir16@gmail.com",
    "telephone": "+96170444955",
    "founder": {"@type": "Person", "name": "Hussein Bdeir", "jobTitle": "Founder and Principal Systems Architect"},
    "areaServed": ["Lebanon", "Middle East", "Worldwide"],
    "address": {"@type": "PostalAddress", "addressCountry": "LB"},
    "knowsAbout": ["Enterprise Resource Planning", "Multi-Entity Operations", "Executive Dashboards & Reporting", "Double-Entry Accounting", "POS & Gate Kiosks", "Automated Financial Controls"],
    "contactPoint": [{"@type": "ContactPoint", "contactType": "sales", "telephone": "+96170444955", "email": "hbdeir16@gmail.com", "availableLanguage": ["en"]}],
    "priceRange": "$4,500 to $18,000+"
}, ensure_ascii=False)
HEAD = HEAD.replace("__ORG_JSONLD__", ORG_JSONLD).replace("__FAQ_JSONLD__", FAQ_JSONLD)

def main():
    full_html = f"{HEAD}<style>{CSS}</style>\n</head>\n<body>\n{BODY}\n<script>{JS}</script>\n</body>\n</html>\n"

    # Check deliverable rules: no em dashes or unicode/ascii arrows in visible text
    for forbidden, label in [('\u2014', 'em dash'), ('\u2192', 'unicode arrow'), ('&mdash;', 'mdash entity'), ('&rarr;', 'rarr entity')]:
        if forbidden in full_html:
            print(f"ERROR: Found forbidden {label} ({forbidden!r}) in output HTML", file=sys.stderr)
            sys.exit(1)

    with open(OUT_HTML, 'w', encoding='utf-8', newline='\n') as f:
        f.write(full_html)

    # Check JS syntax with node --check
    tmp_js = os.path.join(ROOT, 'build', '_check_syntax.js')
    with open(tmp_js, 'w', encoding='utf-8') as f:
        f.write(JS)
    res = subprocess.run(['node', '--check', tmp_js], capture_output=True, text=True)
    if os.path.exists(tmp_js):
        os.remove(tmp_js)
    if res.returncode != 0:
        print("JS SYNTAX ERROR:", res.stderr, file=sys.stderr)
        sys.exit(1)

    # Sync Command Center bundle into /isabi/app/ unless skipped or mfg-web has uncommitted WIP
    if '--skip-app-sync' in sys.argv or os.environ.get('ISABI_SKIP_APP_SYNC') == '1':
        print("INFO: Skipped sync_command_app() (--skip-app-sync)")
    else:
        mfg_dir = os.path.join(os.path.dirname(ROOT), 'mfg-web')
        mfg_dirty = False
        if os.path.isdir(mfg_dir) and '--force-app-sync' not in sys.argv:
            st = subprocess.run(['git', '-C', mfg_dir, 'status', '--porcelain'], capture_output=True, text=True)
            mfg_dirty = bool(st.returncode == 0 and st.stdout.strip())
        if mfg_dirty:
            print("WARN: Skipped sync_command_app() because mfg-web has uncommitted WIP (pass --force-app-sync to override)")
        else:
            sync_command_app()

    # Sync OneDrive mirror if present
    mirror_dir = os.path.join(os.path.expanduser('~'), 'OneDrive - BHFIRMS', 'System', 'System', 'ISABI', 'Website')
    if os.path.isdir(mirror_dir):
        import shutil
        shutil.copy2(OUT_HTML, os.path.join(mirror_dir, 'index.html'))
        shutil.copy2(os.path.join(ROOT, 'sw.js'), os.path.join(mirror_dir, 'sw.js'))
        shutil.copy2(os.path.join(ROOT, 'manifest.json'), os.path.join(mirror_dir, 'manifest.json'))
        og_png = os.path.join(ROOT, 'og-image.png')
        if os.path.exists(og_png):
            shutil.copy2(og_png, os.path.join(mirror_dir, 'og-image.png'))

    print(f"OK: Generated {OUT_HTML} ({len(full_html):,} bytes, JS syntax verified, 0 em-dashes/arrows)")

if __name__ == '__main__':
    main()
