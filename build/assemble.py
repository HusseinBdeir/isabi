# Assembles index.html for ISABI Systems PWA and runs quality checks
import os
import subprocess
import sys

from part_styles import CSS
from part_body import BODY
from part_script import JS

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_HTML = os.path.join(ROOT, 'index.html')

HEAD = """<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>ISABI Systems | Bespoke Enterprise ERP, Power BI &amp; Native AI</title>
  <meta name="description" content="ISABI Systems engineers customized enterprise ERP applications, financial ledgers, Power BI executive suites, offline PWAs, and native AI assistants on the Microsoft Cloud.">
  <meta name="theme-color" content="#0B1730">
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
        var t = localStorage.getItem('isabi.theme');
        if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
      } catch (e) {}
    })();
  </script>
"""

def main():
    full_html = f"{HEAD}<style>{CSS}</style>\n</head>\n<body>\n{BODY}\n<script>{JS}</script>\n</body>\n</html>\n"

    # Check deliverable rules: no em dashes or unicode arrows
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

    print(f"OK: Generated {OUT_HTML} ({len(full_html):,} bytes, JS syntax verified, 0 em-dashes/arrows)")

if __name__ == '__main__':
    main()
