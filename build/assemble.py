"""assemble.py — Assembles index.html for the ISABI Systems Showcase PWA and runs static quality checks.

Usage:
  python build/assemble.py [--dry] [--skip-app-sync | --force-app-sync]
                           [--skip-release-gates] [--skip-i18n-audit]
"""
import argparse
import datetime
import os
import re
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
  <meta name="description" content="ISABI Systems builds custom operations and double-entry accounting systems, What-If scenario studios, executive dashboards, automated statement matching, fleet GPS telematics, field kiosks, and Ask ISABI AI with simple per-seat pricing.">
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
  <meta property="og:description" content="The ERP Your Group Actually Runs On. Custom operations, double-entry accounting, What-If scenario studios, executive dashboards, automated statement matching, fleet GPS telematics, field kiosks, and Ask ISABI AI, live in 1 to 2 weeks.">
  <meta property="og:image" content="https://isabisystems.com/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="ISABI Systems. The ERP Your Group Actually Runs On.">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="ISABI Systems | Custom Enterprise ERP, Executive Dashboards and Cited AI">
  <meta name="twitter:description" content="Custom operations, double-entry accounting, What-If scenario studios, executive dashboards, statement reconciliation, fleet GPS telematics, field kiosks, and Ask ISABI AI with simple per-seat pricing.">
  <meta name="twitter:image" content="https://isabisystems.com/og-image.png">
  <meta name="theme-color" content="#FAF9F6">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="ISABI Systems">
  <link rel="manifest" href="manifest.json?v=6.35">
  <link rel="icon" href="icon.svg?v=6.35" type="image/svg+xml" sizes="any">
  <link rel="icon" href="icon-dark.svg?v=6.35" type="image/svg+xml" sizes="any" media="(prefers-color-scheme: dark)">
  <link rel="icon" href="icon.svg?v=6.35" type="image/svg+xml" sizes="any" media="(prefers-color-scheme: light)">
  <link rel="shortcut icon" href="favicon.ico?v=6.35">
  <link rel="icon" href="favicon-dark.ico?v=6.35" sizes="256x256 128x128 64x64 48x48 32x32 16x16" media="(prefers-color-scheme: dark)">
  <link rel="icon" href="favicon.ico?v=6.35" sizes="256x256 128x128 64x64 48x48 32x32 16x16" media="(prefers-color-scheme: light)">
  <link rel="apple-touch-icon" sizes="180x180" href="icon-180.png?v=6.35">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@112,600;112,700;125,800&family=Instrument+Sans:wght@400;500;600;700&display=swap">
  <script id="pre-theme">
    (function(){
      try {
        if (/^(?:www\\.isabisystems\\.com|isabi-systems\\.pages\\.dev)$/i.test(location.hostname || '') && !/[?&]noredirect=1\\b/i.test(location.search || '')) {
          location.replace('https://isabisystems.com' + (location.pathname || '/') + (location.search || '') + (location.hash || ''));
          return;
        }
        var d = document.documentElement;
        var t = localStorage.getItem('isabi.theme.v2') === 'dark' ? 'dark' : 'light';
        d.setAttribute('data-theme', t);
        var m = document.querySelector('meta[name="theme-color"]');
        if (m) m.setAttribute('content', t === 'dark' ? '#1B140F' : '#FAF9F6');
        if (window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)) {
          d.classList.add('ios-standalone');
        }
        if (/(?:^|\\.)isabisystems\\.com$|\\.pages\\.dev$/i.test(location.hostname || '') || localStorage.getItem('isabi_edge_active_v1') === '1') {
          window.ISABI_HAS_EDGE_API = true;
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
    "legalName": "Isabi Systems",
    "url": "https://isabisystems.com/",
    "logo": "https://isabisystems.com/icon-512.png?v=6.35",
    "image": "https://isabisystems.com/og-image.png",
    "sameAs": [
        "https://github.com/HusseinBdeir",
        "https://github.com/HusseinBdeir/isabi"
    ],
    "slogan": "The ERP Your Group Actually Runs On",
    "description": "Custom enterprise ERP operations, double-entry financial accounting, What-If scenario studios, interactive executive dashboards, automated statement matching, fleet GPS telematics, field kiosks, and the Ask ISABI assistant with simple per-seat pricing.",
    "email": "husseinbdeir@isabisystems.com",
    "telephone": "+96170444955",
    "founder": {"@type": "Person", "name": "Hussein Bdeir", "jobTitle": "Founder and Principal Systems Architect"},
    "areaServed": ["Lebanon", "Middle East", "Worldwide"],
    "address": {"@type": "PostalAddress", "addressLocality": "Beirut", "addressCountry": "LB"},
    "knowsAbout": ["Enterprise Resource Planning", "Multi-Entity Operations", "Executive Dashboards & Reporting", "Double-Entry Accounting", "POS & Gate Kiosks", "Automated Financial Controls"],
    "contactPoint": [{"@type": "ContactPoint", "contactType": "sales", "telephone": "+96170444955", "email": "husseinbdeir@isabisystems.com", "availableLanguage": ["en", "ar", "fr"]}],
    "priceRange": "$3,000 to $11,000+ setup + $50 to $100/seat/mo"
}, ensure_ascii=False)
HEAD = HEAD.replace("__WEBSITE_JSONLD__", WEBSITE_JSONLD).replace("__ORG_JSONLD__", ORG_JSONLD).replace("__FAQ_JSONLD__", FAQ_JSONLD)

INDEXNOW_KEY = "c4b9e2a7d18f406395e1a82c7d3f6b90"

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

def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="build/assemble.py",
        description="Assemble the ISABI Systems public showcase index.html, check JS syntax/i18n, and sync app/.",
        allow_abbrev=False,
    )
    parser.add_argument(
        "--dry",
        "--dry-run",
        dest="dry",
        action="store_true",
        help="Validate HTML in memory and print the build plan without writing files or running subprocesses.",
    )
    parser.add_argument(
        "--skip-app-sync",
        action="store_true",
        help="Skip syncing isabi-app into app/ after building index.html.",
    )
    parser.add_argument(
        "--force-app-sync",
        action="store_true",
        help="Run sync_command_app() even if ISABI_SKIP_APP_SYNC=1 is set in the environment.",
    )
    parser.add_argument(
        "--skip-release-gates",
        action="store_true",
        help="Forward --skip-release-gates to sync_command_app().",
    )
    parser.add_argument(
        "--skip-i18n-audit",
        action="store_true",
        help="Forward --skip-i18n-audit to sync_command_app().",
    )
    return parser


def parse_cli_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    if args.skip_app_sync:
        bad = [
            flag
            for enabled, flag in (
                (args.force_app_sync, "--force-app-sync"),
                (args.skip_release_gates, "--skip-release-gates"),
                (args.skip_i18n_audit, "--skip-i18n-audit"),
            )
            if enabled
        ]
        if bad:
            parser.error(f"--skip-app-sync cannot be combined with {', '.join(bad)}.")
    return args


def render_and_validate_showcase_html() -> str:
    full_html = f"{HEAD}<style>{CSS}</style>\n</head>\n<body>\n{BODY}\n<script>{JS}</script>\n</body>\n</html>\n"
    # Check deliverable rules: no em dashes or unicode/ascii arrows in visible text
    for forbidden, label in [('\u2014', 'em dash'), ('\u2192', 'unicode arrow'), ('&mdash;', 'mdash entity'), ('&rarr;', 'rarr entity')]:
        if forbidden in full_html:
            print(f"ERROR: Found forbidden {label} ({forbidden!r}) in output HTML", file=sys.stderr)
            sys.exit(1)
    return full_html


def _inspect_404_stamp_status() -> tuple[str, str]:
    sw_path = os.path.join(ROOT, 'sw.js')
    p404_path = os.path.join(ROOT, '404.html')
    if not (os.path.exists(sw_path) and os.path.exists(p404_path)):
        return "(missing sw.js or 404.html)", "skip"
    with open(sw_path, 'r', encoding='utf-8') as f_sw:
        sw_src = f_sw.read()
    m_ver = re.search(r"CACHE_NAME\s*=\s*'isabi-systems-pwa-v([^']+)'", sw_src)
    if not m_ver:
        return "(unparsed sw.js version)", "skip"
    sw_ver = m_ver.group(1)
    with open(p404_path, 'r', encoding='utf-8') as f_404:
        raw_404 = f_404.read()
    stamped_404 = re.sub(
        r'(/(?:icon(?:-dark)?\.svg|favicon\.ico))(?:\?v=[0-9.]+)?',
        rf'\1?v={sw_ver}',
        raw_404,
    )
    status = "unchanged" if stamped_404 == raw_404 else f"UPDATE icon ?v={sw_ver}"
    return f"v{sw_ver}", status


def print_dry_run_plan(args: argparse.Namespace) -> int:
    full_html = render_and_validate_showcase_html()
    sw_ver_lbl, stamp_status = _inspect_404_stamp_status()
    will_skip_sync = args.skip_app_sync or (
        os.environ.get('ISABI_SKIP_APP_SYNC') == '1' and not args.force_app_sync
    )
    print("DRY RUN — 0 local writes or subprocesses")
    print(f"  Output   : {OUT_HTML} ({len(full_html):,} bytes, 0 forbidden punctuation)")
    print(f"  Showcase : {sw_ver_lbl} (404.html stamp: {stamp_status})")
    print("  Steps    :")
    print(f"    1. Write {OUT_HTML}, CNAME, robots.txt, sitemap.xml, {INDEXNOW_KEY}.txt, and check 404.html ({stamp_status})")
    print("    2. Verify showcase JS syntax via `node --check`")
    print("    3. Run Showcase trilingual i18n audit (`audit_showcase_i18n.run_showcase_i18n_audit`)")
    if will_skip_sync:
        reason = "--skip-app-sync" if args.skip_app_sync else "ISABI_SKIP_APP_SYNC=1"
        print(f"    4. Command Center sync -> SKIP ({reason})")
    else:
        mods: list[str] = []
        if args.force_app_sync:
            mods.append("--force-app-sync")
        if args.skip_release_gates:
            mods.append("--skip-release-gates")
        if args.skip_i18n_audit:
            mods.append("--skip-i18n-audit")
        mod_txt = f" ({', '.join(mods)})" if mods else ""
        print(f"    4. Command Center sync -> RUN sync_command_app(){mod_txt}")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = parse_cli_args(argv)
    if args.dry:
        sys.exit(print_dry_run_plan(args))

    full_html = render_and_validate_showcase_html()

    with open(OUT_HTML, 'wb') as f:
        f.write(full_html.replace('\r\n', '\n').encode('utf-8'))
    with open(os.path.join(ROOT, 'CNAME'), 'wb') as f:
        f.write(b'isabisystems.com\n')
    with open(os.path.join(ROOT, 'robots.txt'), 'wb') as f:
        f.write(ROBOTS_TXT.replace('\r\n', '\n').encode('utf-8'))
    today_iso = datetime.date.today().isoformat()
    with open(os.path.join(ROOT, 'sitemap.xml'), 'wb') as f:
        f.write(build_sitemap_xml(today_iso).replace('\r\n', '\n').encode('utf-8'))
    with open(os.path.join(ROOT, f'{INDEXNOW_KEY}.txt'), 'wb') as f:
        f.write(INDEXNOW_KEY.encode('utf-8'))

    sw_path = os.path.join(ROOT, 'sw.js')
    p404_path = os.path.join(ROOT, '404.html')
    if os.path.exists(sw_path) and os.path.exists(p404_path):
        sw_src = open(sw_path, 'r', encoding='utf-8').read()
        m_ver = re.search(r"CACHE_NAME\s*=\s*'isabi-systems-pwa-v([^']+)'", sw_src)
        if m_ver:
            sw_ver = m_ver.group(1)
            raw_404 = open(p404_path, 'r', encoding='utf-8').read()
            stamped_404 = re.sub(
                r'(/(?:icon(?:-dark)?\.svg|favicon\.ico))(?:\?v=[0-9.]+)?',
                rf'\1?v={sw_ver}',
                raw_404,
            )
            if stamped_404 != raw_404:
                with open(p404_path, 'wb') as f404:
                    f404.write(stamped_404.replace('\r\n', '\n').encode('utf-8'))

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

    # Sync Command Center bundle into /isabi/app/ unless explicitly skipped
    if args.skip_app_sync or (os.environ.get('ISABI_SKIP_APP_SYNC') == '1' and not args.force_app_sync):
        reason = "--skip-app-sync" if args.skip_app_sync else "ISABI_SKIP_APP_SYNC=1"
        print(f"INFO: Skipped sync_command_app() ({reason})")
    else:
        sync_command_app(
            skip_release_gates=args.skip_release_gates,
            skip_i18n_audit=args.skip_i18n_audit,
        )

    # The OneDrive Website\ mirror was retired 2026-11-13: GitHub + Cloudflare Pages hold the site.

    print(f"OK: Generated {OUT_HTML} ({len(full_html):,} bytes, JS syntax verified, 0 em-dashes/arrows)")
    return 0


if __name__ == '__main__':
    sys.exit(main())
