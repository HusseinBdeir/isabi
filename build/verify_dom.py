import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
URL = 'file:///' + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'index.html').replace('\\', '/')
ART_DIR = os.environ.get('ISABI_ART_DIR') or os.path.join(tempfile.gettempdir(), 'isabi_verify_shots')


def run_dom_and_screenshots():
    ud = tempfile.mkdtemp(prefix='isabi_edge_')
    diag_html = ''
    try:
        # 0. Verify 0 forbidden vendor reliance & 0 overspecified technical plumbing jargon in index.html, manifest.json, robots.txt & sitemap.xml
        import base64
        import glob
        repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        for fname in ('index.html', '404.html', 'manifest.json', 'robots.txt', 'sitemap.xml'):
            fpath = os.path.join(repo_root, fname)
            assert os.path.exists(fpath), f"Missing required file: {fname}"
            txt = open(fpath, 'r', encoding='utf-8').read()
            hits = re.findall(r'Power BI|Dataverse|Power Apps|Microsoft', txt, flags=re.IGNORECASE)
            assert not hits, f"Forbidden terms found in {fname}: {hits[:10]}"
            jargon = re.findall(
                r'PostgreSQL|SQLite|IndexedDB|ESC/POS|80mm|58mm|128-d|128d|Parallax|Eye-Blink|'
                r'Progressive Web|Row-Level|progressive boot|zero-spinner|150ms|93k|3-leg|neighbor-linked|cloud relay',
                txt, flags=re.IGNORECASE
            )
            assert not jargon, f"Overspecified technical jargon found in {fname}: {jargon[:10]}"
            if fname in ('index.html', '404.html'):
                assert '—' not in txt and '→' not in txt, f"Forbidden em-dash/arrow in {fname}"
                assert not re.search(r'\bTHEO\b', txt, flags=re.IGNORECASE), f"Forbidden THEO mention in {fname}"
            print(f'[CLEAN] {fname}: 0 forbidden vendor terms & 0 technical plumbing jargon')

        relay_pat = re.compile(r'powerplatform\.com|powerautomate|dynamics\.com|sharepoint\.com|pollinations\.ai', re.IGNORECASE)
        b64_pat = re.compile(r'["\']([A-Za-z0-9+/=]{28,})["\']')
        scan_targets = [os.path.join(repo_root, 'index.html')] + sorted(glob.glob(os.path.join(repo_root, 'app', 'js', '*.js')))
        for sf in scan_targets:
            stxt = open(sf, 'r', encoding='utf-8').read()
            rel_sf = os.path.relpath(sf, repo_root)
            raw_hits = relay_pat.findall(stxt)
            assert not raw_hits, f"Forbidden external relay domain in {rel_sf}: {raw_hits[:5]}"
            for bm in b64_pat.finditer(stxt):
                cand = bm.group(1)
                if len(cand) % 4 != 0:
                    continue
                try:
                    dec = base64.b64decode(cand, validate=True).decode('utf-8', errors='ignore')
                except Exception:
                    continue
                bhits = relay_pat.findall(dec)
                assert not bhits, f"Base64-encoded forbidden relay domain in {rel_sf}: {bhits[:5]}"
        print(f'[ZERO-RELAY] Scanned {len(scan_targets)} Showcase + Command Center bundles (raw + Base64): 0 external relay domains')

        import xml.etree.ElementTree as ET
        robots_txt = open(os.path.join(repo_root, 'robots.txt'), 'r', encoding='utf-8').read()
        assert 'Allow: /' in robots_txt and 'Disallow: /app/' in robots_txt and 'Sitemap: https://isabisystems.com/sitemap.xml' in robots_txt, f"Invalid robots.txt: {robots_txt!r}"
        sitemap_txt = open(os.path.join(repo_root, 'sitemap.xml'), 'r', encoding='utf-8').read()
        ET.fromstring(sitemap_txt)
        assert '<loc>https://isabisystems.com/</loc>' in sitemap_txt and '/app/' not in sitemap_txt, f"Invalid sitemap.xml: {sitemap_txt!r}"
        cname_txt = open(os.path.join(repo_root, 'CNAME'), 'r', encoding='utf-8').read().strip()
        assert cname_txt == 'isabisystems.com', f"Invalid CNAME: {cname_txt!r}"
        indexnow_txt = open(os.path.join(repo_root, 'c4b9e2a7d18f406395e1a82c7d3f6b90.txt'), 'r', encoding='utf-8').read().strip()
        assert indexnow_txt == 'c4b9e2a7d18f406395e1a82c7d3f6b90', f"Invalid IndexNow key file: {indexnow_txt!r}"
        raw_idx_html = open(os.path.join(repo_root, 'index.html'), 'r', encoding='utf-8').read()
        assert raw_idx_html.count('<!--email_off-->') == 2 and raw_idx_html.count('<!--/email_off-->') == 2, "Expected 2 <!--email_off--> wrappers in index.html"
        assert 'hbdeir@isabisystems.com' in raw_idx_html and 'husseinbdeir@isabisystems.com' not in raw_idx_html and 'gmail.com' not in raw_idx_html, "Contact email must be hbdeir@isabisystems.com everywhere"
        assert '/cdn-cgi/l/email-protection' not in raw_idx_html, "Unexpected Cloudflare email-protection link in index.html"
        assert '"sameAs": ["https://github.com/HusseinBdeir", "https://github.com/HusseinBdeir/isabi"]' in raw_idx_html, "Missing verified sameAs URLs in ORG_JSONLD"
        assert '"disambiguatingDescription":' in raw_idx_html and '"isabisystems"' in raw_idx_html and '"https://isabisystems.com/#brand"' in raw_idx_html, "Missing strengthened entity disambiguation fields in JSON-LD"
        ld_scripts = re.findall(r'<script type="application/ld\+json">(.*?)</script>', raw_idx_html, re.S)
        assert len(ld_scripts) == 4, f"Expected 4 JSON-LD blocks in index.html, got {len(ld_scripts)}"
        ld_docs = [json.loads(s) for s in ld_scripts]
        def _collect_ld_ids(node, defined, refs):
            if isinstance(node, dict):
                if '@id' in node and len(node) == 1:
                    refs.add(node['@id'])
                elif '@id' in node:
                    defined.add(node['@id'])
                for k, v in node.items():
                    if k != '@id':
                        _collect_ld_ids(v, defined, refs)
            elif isinstance(node, list):
                for item in node:
                    _collect_ld_ids(item, defined, refs)
        ld_defined, ld_refs = set(), set()
        for doc in ld_docs:
            _collect_ld_ids(doc, ld_defined, ld_refs)
        unresolved_ids = ld_refs - ld_defined
        assert not unresolved_ids, f"Unresolved JSON-LD @id references: {unresolved_ids}"
        assert {'WebSite', 'ProfessionalService', 'SoftwareApplication', 'FAQPage'} == {d.get('@type') for d in ld_docs}
        sw_doc = next(d for d in ld_docs if d.get('@type') == 'SoftwareApplication')
        assert len(sw_doc.get('offers', [])) == 2 and sw_doc['offers'][0]['priceSpecification'][0]['price'] == 3000, f"Unexpected SoftwareApplication offers: {sw_doc.get('offers')}"
        assert sw_doc['offers'][0]['priceSpecification'][1]['price'] == 50 and sw_doc['offers'][0]['priceSpecification'][1]['billingDuration'] == 'P1M' and sw_doc['offers'][0]['priceSpecification'][1]['unitText'] == 'seat'
        assert sw_doc['offers'][1]['priceSpecification'][0]['minPrice'] == 5600 and sw_doc['offers'][1]['priceSpecification'][1]['minPrice'] == 80 and sw_doc['offers'][1]['priceSpecification'][1]['maxPrice'] == 100 and sw_doc['offers'][1]['priceSpecification'][1]['billingDuration'] == 'P1M'
        bot_res = subprocess.run(
            [EDGE, '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--virtual-time-budget=3000', f'--user-data-dir={ud}', '--user-agent=Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', '--window-size=1440,900', '--dump-dom', URL],
            capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=60
        )
        assert 'class="js-io"' not in bot_res.stdout and 'The ERP Your Group' in bot_res.stdout and bot_res.stdout.count('class="d-mod"') == 18, "Googlebot UA must get the full page with no opacity gate"
        print('[SEO] robots.txt, sitemap.xml (valid XML), CNAME, IndexNow key, email_off, sameAs & Googlebot reveal verified')

        # 1. Dump DOM at #industries hash to verify initial hash activation & rendering
        res = subprocess.run(
            [EDGE, '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--virtual-time-budget=3000', f'--user-data-dir={ud}', '--window-size=1440,900', '--dump-dom', URL + '#industries'],
            capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=60
        )
        dom = res.stdout
        checks = [
            ('Hero title', 'The ERP Your Group'),
            ('Hero Facts Row', 'class="d-facts"'),
            ('Rendered Industry Tab', 'Hospitality, Resorts'),
            ('Rendered Industry Modules', 'Multi-Property Business Unit Isolation'),
            ('Rendered Sandbox Chart', 'class="chart"'),
            ('Rendered Sandbox Ledger Total', '<b>Audited Batch</b>'),
            ('Rendered Ask ISABI Thread', 'Overdue Receivables Audit'),
            ('Rendered Configurator Total', '$6,800 to $8,200'),
            ('Mobile Section Nav Present', 'id="mobile-sec-nav"'),
            ('Hash #industries opens the Industry Blueprints page', 'data-sheet-open="industries"'),
            ('FAQ page rendered', 'id="faq-grid"'),
            ('FAQ JSON-LD present', '"@type": "FAQPage"'),
            ('Organization JSON-LD present', '"@type": "ProfessionalService"'),
            ('WebSite JSON-LD present', '"@type": "WebSite"'),
            ('SoftwareApplication JSON-LD present', '"@type": "SoftwareApplication"'),
            ('Sitemap link tag present', 'rel="sitemap"'),
            ('Open Graph image tag', 'property="og:image"'),
            ('Dynamic sandbox period label', '(MTD)</option>'),
            ('Platform page rendered', 'id="platform"'),
            ('Sandbox SOA Mode Tab rendered', 'data-sbox-mode="soa"'),
            ('Sandbox POS & Kiosk Mode Tab rendered', 'data-sbox-mode="pwa"'),
            ('Implementation page rendered', 'id="golive"'),
            ('In Practice page rendered', 'id="proof"'),
            ('Pricing Guarantee Strip rendered', 'class="d-trust"'),
            ('Contact email', 'mailto:hbdeir@isabisystems.com'),
        ]
        mod_count = dom.count('class="d-mod"')
        assert mod_count == 18, f"Expected 18 modules on the Platform page, got {mod_count}"
        assert dom.count('<img class="d-logo ') == 5, "Expected 5 company logos on the In Practice page"
        failed = 0
        for name, needle in checks:
            ok = needle in dom
            print(f'[DOM] {name}: {"PASS" if ok else "FAIL"}')
            if not ok:
                failed += 1
        # Verify removed clutter stays absent
        for removed_lbl, removed_needle in [
            ('Hero 2x2 Launcher Removed', 'class="hero-mode-grid"'),
            ('Hero Currency Pills Removed', 'data-hero-curr='),
            ('Metrics Band Removed', 'class="metrics-band"'),
            ('ROI Sliders Removed', 'id="roi-entities"'),
            ('Portal Quick-Fill Chips Removed', 'class="topic-chips-bar"'),
            ('Hero Proof List Removed', 'class="hero-proof-list"'),
            ('18-App Grid Removed', 'id="app-suite-grid"'),
            ('Mobile Dock Removed', 'class="mobile-dock"'),
            ('Proof Page By Industry Removed', 'Proven in our own group'),
        ]:
            ok = removed_needle not in dom
            print(f'[TRIM] {removed_lbl}: {"PASS" if ok else "FAIL"}')
            if not ok:
                failed += 1
        if failed:
            sys.exit(1)

        # 2. Create a temporary test harness HTML wrapper to verify geometry on Desktop & Mobile
        diag_html = os.path.join(repo_root, '_diag_test.html')
        with open(os.path.join(repo_root, 'index.html'), 'r', encoding='utf-8') as f:
            base_html = f.read()

        test_script = """
<script>
document.addEventListener('DOMContentLoaded', async function() {
  var pre = document.createElement('pre');
  pre.id = 'diag-json';
  var tick = function(ms) { return new Promise(function(r) { setTimeout(r, ms || 40); }); };
  try {
    if (window.innerWidth < 600) {
      document.documentElement.style.width = '390px';
      document.body.style.width = '390px';
    }
    var effW = window.innerWidth < 600 ? 390 : window.innerWidth;
    var isShown = function(el) { return !el.hidden && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0; };
    var hdr = document.getElementById('site-header').getBoundingClientRect();
    var why = document.getElementById('why').getBoundingClientRect();
    var pricing = document.getElementById('pricing').getBoundingClientRect();
    var cmp = document.querySelector('.d-cmp').getBoundingClientRect();
    var ctaEl = document.querySelector('.d-hdr-cta');
    var ctaBtn = ctaEl ? ctaEl.getBoundingClientRect() : { right: 0 };
    var portalCard = document.querySelector('.d-brief').getBoundingClientRect();
    var leadName = document.getElementById('lead-name').getBoundingClientRect();
    var leadCompany = document.getElementById('lead-company').getBoundingClientRect();
    var leadContact = document.getElementById('lead-contact').getBoundingClientRect();
    var leadIndustry = document.getElementById('lead-industry').getBoundingClientRect();
    var heroSec = document.getElementById('hero').getBoundingClientRect();
    var kpis = document.querySelectorAll('#hero .d-kpi');
    var kpi1 = kpis[0].getBoundingClientRect();
    var kpi2 = kpis[1].getBoundingClientRect();
    var hlcSvgCount = document.querySelectorAll('.d-prev-brand svg').length;
    var hdrControlCount = Array.from(document.querySelectorAll('#main-nav a, .d-hdr-acts button, .d-hdr-acts a')).filter(isShown).length;
    var heroControlCount = Array.from(document.querySelectorAll('#hero a, #hero button')).filter(isShown).length;
    var activeMain = Array.from(document.querySelectorAll('#main-nav a.active')).map(function(a){ return a.getAttribute('href'); });
    var activeMob = Array.from(document.querySelectorAll('#mobile-sec-nav a.active')).map(function(a){ return a.getAttribute('href'); });
    var langSwitchEl = document.getElementById('hdr-lang-switch');
    var langSwitchH = langSwitchEl ? Math.round(langSwitchEl.getBoundingClientRect().height) : 0;
    var mobInpEls = Array.from(document.querySelectorAll('#portal input, #portal select, #portal textarea, .ai-drawer input, .ai-drawer textarea, .ai-console input, .ai-console textarea')).filter(function(el){ return getComputedStyle(el).display !== 'none' && el.type !== 'hidden'; });
    var inputFontMin = mobInpEls.length ? Math.min.apply(null, mobInpEls.map(function(el){ return parseFloat(getComputedStyle(el).fontSize || '0'); })) : 16;
    var cmpCols = getComputedStyle(document.querySelector('#why .d-row:not(.d-rowhead)')).gridTemplateColumns.trim().split(/\\s+/).length;
    var moduleCount = document.querySelectorAll('#platform .d-mod').length;
    var industryTileCount = document.querySelectorAll('#platform .d-ind').length;
    var logoCount = document.querySelectorAll('#proof .d-logo').length;
    var logoFilter = getComputedStyle(document.querySelector('#proof .d-logo')).filter || '';
    function scanOverflows(root) {
      var found = [];
      if (effW !== 390) return found;
      root.querySelectorAll('*').forEach(function(el) {
        if (el.closest('#mobile-sec-nav, #mobile-sheet-nav') || el.closest('.rail nav')) return;
        var sc = el.closest('.d-prev-tabs, .ai-prompt-pills, .ind-tabs, #sbox-ind-bar, .sec-tabs, .ind-subtabs, .ai-thread');
        if (sc && sc !== el && sc.getBoundingClientRect().right <= 390.5) return;
        var r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > 390.5) {
          found.push((el.tagName + '.' + (el.className && el.className.baseVal !== undefined ? el.className.baseVal : (el.className || '')) + '#' + (el.id || '')) + ':' + Math.round(r.right));
        }
      });
      return found;
    }
    function scanCards(sel) {
      var found = [];
      document.querySelectorAll(sel).forEach(function(card) {
        var cr = card.getBoundingClientRect();
        if (cr.width === 0) return;
        card.querySelectorAll('*').forEach(function(child) {
          if (child.closest('.d-prev-tabs, .ai-prompt-pills, .ai-thread')) return;
          var r = child.getBoundingClientRect();
          if (r.width > 0 && (r.right > cr.right + 1 || r.left < cr.left - 1)) {
            found.push((child.tagName + '#' + (child.id || '') + '.' + (child.className && child.className.baseVal !== undefined ? child.className.baseVal : (child.className || ''))) + ' (' + Math.round(r.right) + ' > ' + Math.round(cr.right) + ')');
          }
        });
      });
      return found;
    }
    var overflows = scanOverflows(document.body);
    var cardOverflows = scanCards('.d-brief, .d-direct, .configurator-card, .d-tier, .d-trust, .d-preview, .d-group, .d-cmp, .d-logos, .d-step-card');
    var secHeights = {};
    ['#hero', '#platform', '#ask', '#golive', '#why', '#pricing', '#proof', '#portal'].forEach(function(sel) {
      var el = document.querySelector(sel);
      if (el) secHeights[sel] = Math.round(el.getBoundingClientRect().height);
    });
    var out = {
      vw: effW,
      vh: window.innerHeight,
      scrollW: document.body.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
      scrollY: Math.round(window.scrollY),
      hdrBottom: Math.round(hdr.bottom),
      whyBottom: Math.round(why.bottom),
      pricingTop: Math.round(pricing.top),
      compWidth: Math.round(cmp.width),
      ctaRight: Math.round(ctaBtn.right),
      portalCardRight: Math.round(portalCard.right),
      leadNameW: Math.round(leadName.width),
      leadCompanyW: Math.round(leadCompany.width),
      leadContactW: Math.round(leadContact.width),
      leadIndustryW: Math.round(leadIndustry.width),
      leadIndustryRight: Math.round(leadIndustry.right),
      heroSecH: Math.round(heroSec.height),
      secHeights: secHeights,
      kpi1W: Math.round(kpi1.width),
      kpi2W: Math.round(kpi2.width),
      hlcSvgCount: hlcSvgCount,
      hdrControlCount: hdrControlCount,
      heroControlCount: heroControlCount,
      activeMain: activeMain,
      activeMob: activeMob,
      langSwitchH: langSwitchH,
      inputFontMin: inputFontMin,
      cmpCols: cmpCols,
      moduleCount: moduleCount,
      industryTileCount: industryTileCount,
      logoCount: logoCount,
      logoOneTone: logoFilter.indexOf('grayscale') !== -1,
      overflows: overflows.slice(0, 12),
      cardOverflows: cardOverflows.slice(0, 12)
    };

    // More pages (Live Demo, Industry Blueprints, FAQ): each opens from a button, swaps the header menu, and closes with Back to Site or Escape
    var sheetInfo = {};
    var sheetIds = ['sandbox', 'industries', 'faq'];
    for (var shI = 0; shI < sheetIds.length; shI++) {
      var sid = sheetIds[shI];
      var opener = document.querySelector('#site-pages a[href="#' + sid + '"]');
      if (opener) opener.click();
      await tick(30);
      var sEl = document.getElementById(sid);
      var hdrNow = document.getElementById('site-header').getBoundingClientRect();
      sheetInfo[sid] = {
        hasOpener: !!opener,
        h: Math.round(sEl.getBoundingClientRect().height),
        avail: Math.round(window.innerHeight - hdrNow.bottom),
        shown: !sEl.hidden,
        pagesHidden: document.getElementById('site-pages').hidden,
        mainNavHidden: document.getElementById('main-nav').hidden,
        sheetNavShown: !document.getElementById('sheet-nav').hidden,
        activeLink: Array.from(document.querySelectorAll('#sheet-nav a.active')).map(function(a){ return a.getAttribute('href'); }),
        hash: location.hash,
        scrollW: document.body.scrollWidth,
        overflows: scanOverflows(sEl).slice(0, 8),
        cardOverflows: scanCards('#' + sid + ' .ind-detail, #' + sid + ' .faq-item').slice(0, 8)
      };
      if (sid === 'industries') {
        sheetInfo[sid].indTabsH = Math.round(document.querySelector('.ind-tabs').getBoundingClientRect().height);
        sheetInfo[sid].indDetailH = Math.round(document.querySelector('.ind-detail').getBoundingClientRect().height);
      }
      if (sid === 'sandbox') {
        sheetInfo[sid].mockWidth = Math.round(document.querySelector('.mock').getBoundingClientRect().width);
      }
    }
    var backBtn = document.querySelector('#sheet-nav [data-sheet-close]');
    if (backBtn) backBtn.click();
    await tick(120);
    sheetInfo.afterBack = {
      pagesHidden: document.getElementById('site-pages').hidden,
      openSheets: document.querySelectorAll('[data-sheet]:not([hidden])').length,
      mainNavHidden: document.getElementById('main-nav').hidden,
      hash: location.hash
    };
    var faqOpener = document.querySelector('#site-pages a[href="#faq"]');
    if (faqOpener) faqOpener.click();
    await tick(30);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick(120);
    sheetInfo.afterEscape = {
      pagesHidden: document.getElementById('site-pages').hidden,
      openSheets: document.querySelectorAll('[data-sheet]:not([hidden])').length,
      hash: location.hash
    };
    out.sheets = sheetInfo;

    // Interactive Ask ISABI functional checks (run after geometry measurement)
    var initDrawerUsers = document.querySelectorAll('#ai-drawer-thread .ai-msg-user').length;
    var initDrawerText = document.getElementById('ai-drawer-thread').textContent;

    var inlineInp = document.getElementById('ai-inline-input');
    var inlineForm = document.getElementById('ai-inline-form');

    // Verify "ISABI is analyzing..." thinking indicator renders on async submit
    inlineInp.value = 'how are you';
    inlineForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    var hasThinkingBubble = document.getElementById('ai-inline-thread').textContent.indexOf('ISABI is analyzing...') !== -1;

    // Switch to synchronous test mode for deterministic multi-turn DOM assertions
    window.__ISABI_SYNC_TEST = true;
    document.getElementById('ai-inline-reset').click();

    // 1. Test conversational greeting ("Hello") and ("how are you") and Arabic/French
    inlineInp.value = 'Hello';
    inlineForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    var helloText = document.getElementById('ai-inline-thread').textContent;

    inlineInp.value = 'how are you';
    inlineForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    var howAreYouText = document.getElementById('ai-inline-thread').textContent;

    inlineInp.value = 'كيف حالك';
    inlineForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    var arabicHtml = document.getElementById('ai-inline-thread').innerHTML;

    inlineInp.value = 'Bonjour, combien coûte le système ?';
    inlineForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    var frenchText = document.getElementById('ai-inline-thread').textContent;

    // 2. Test Industry Blueprint query
    inlineInp.value = 'Show the Concrete & Manufacturing blueprint';
    inlineForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    var afterInlineCount = document.querySelectorAll('#ai-inline-thread .ai-msg-bot').length;
    var afterInlineText = document.getElementById('ai-inline-thread').textContent;
    var followupBubbleCountAfterInline = document.querySelectorAll('#ai-inline-thread .ai-msg-followup').length;

    // 3. Switch sandbox to Trading + EUR + QTD, then click Sandbox Ask ISABI button
    var trdBtn = document.querySelector('[data-sbox-ind="trading"]');
    if (trdBtn) trdBtn.click();
    var currSel = document.getElementById('sbox-curr-sel');
    currSel.value = 'EUR';
    currSel.dispatchEvent(new Event('change', { bubbles: true }));
    var perSel = document.getElementById('sbox-period-sel');
    perSel.value = 'qtd';
    perSel.dispatchEvent(new Event('change', { bubbles: true }));
    var scopeBarTxt = document.getElementById('ai-inline-scope').textContent;
    var sboxAiBtn = document.querySelector('#sandbox-mock [data-open-ai]');
    if (sboxAiBtn) sboxAiBtn.click();
    var drawerTextAfterSbox = document.getElementById('ai-drawer-thread').textContent;

    // 4. Click a Sandbox watchdog alert button (Send SOA on Trading)
    var alertBtn = document.querySelector('#sandbox-mock [data-sbox-act]');
    if (alertBtn) alertBtn.click();
    var drawerTextAfterAlert = document.getElementById('ai-drawer-thread').textContent;

    // 5. Click a follow-up chip
    var followChip = document.querySelector('#ai-drawer-thread .ai-followup-btn');
    if (followChip) followChip.click();
    var countBeforeReset = document.querySelectorAll('#ai-drawer-thread .ai-msg-bot').length;

    // 6. Click Reset in drawer, then verify expanded domain handlers (attachments, recipes, multi-entity consolidation) & zero em-dashes
    document.getElementById('ai-drawer-reset').click();
    var botAfterReset = document.querySelectorAll('#ai-drawer-thread .ai-msg-bot').length;
    var userAfterReset = document.querySelectorAll('#ai-drawer-thread .ai-msg-user').length;
    var inlineUserAfterReset = document.querySelectorAll('#ai-inline-thread .ai-msg-user').length;
    var resetDrawerText = document.getElementById('ai-drawer-thread').textContent;

    inlineInp.value = 'Can staff attach supplier invoice photos and weighbridge slips?';
    inlineForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    var attachReplyText = document.getElementById('ai-inline-thread').textContent;

    inlineInp.value = 'How do kitchen recipes and waste tracking work?';
    inlineForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    var recipeReplyText = document.getElementById('ai-inline-thread').textContent;

    inlineInp.value = 'How does multi-company consolidation tie the books?';
    inlineForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    var consolReplyText = document.getElementById('ai-inline-thread').textContent;

    inlineInp.value = 'Tell me about the What-If Scenario Studio and 30-day liquidity bridge';
    inlineForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    var whatIfReplyText = document.getElementById('ai-inline-thread').textContent;

    inlineInp.value = 'How do Explain Page and interactive tours work for new staff?';
    inlineForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    var explainReplyText = document.getElementById('ai-inline-thread').textContent;

    inlineInp.value = 'How does live fleet GPS and fuel sensor telematics stop fuel shrinkage?';
    inlineForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    var gpsReplyText = document.getElementById('ai-inline-thread').textContent;

    inlineInp.value = 'How do statement matching, period-close locks, and biometric 2FA work?';
    inlineForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    var closeReplyText = document.getElementById('ai-inline-thread').textContent;

    var countBeforeEmptySubmit = document.querySelectorAll('#ai-inline-thread .ai-msg-user').length;
    inlineInp.value = '   ';
    inlineForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    var countAfterEmptySubmit = document.querySelectorAll('#ai-inline-thread .ai-msg-user').length;
    document.getElementById('ai-inline-reset').click();

    out.aiTest = {
      initDrawerUsers: initDrawerUsers,
      hasInitWelcome: initDrawerText.indexOf('Welcome. I am ISABI') !== -1,
      hasThinkingBubble: hasThinkingBubble,
      hasHelloReply: helloText.indexOf('Hello! Good to have you here.') !== -1 && helloText.indexOf('What kind of business are you running') !== -1 && helloText.indexOf('MULTI-ENTITY ENTERPRISE GROUP') === -1,
      hasHowAreYouReply: howAreYouText.indexOf('I am doing great, thank you for asking!') !== -1 && howAreYouText.indexOf('Are you exploring a custom system') !== -1,
      hasArabicRtl: arabicHtml.indexOf('dir="rtl"') !== -1 && arabicHtml.indexOf('أهلاً بك! أنا بخير') !== -1,
      hasFrenchReply: frenchText.indexOf('Un système pour une entité unique') !== -1 || frenchText.indexOf('Bonjour ! Je vais très bien') !== -1,
      followupBubbleCount: document.querySelectorAll('#ai-inline-thread .ai-msg-followup').length,
      afterInlineCount: afterInlineCount,
      hasMfgBlueprint: afterInlineText.indexOf('Industry Blueprint 03') !== -1,
      scopeBarTxt: scopeBarTxt,
      hasEurQtdBriefing: drawerTextAfterSbox.indexOf('Automotive & Heavy Equipment Trading') !== -1 && drawerTextAfterSbox.indexOf('EUR') !== -1 && drawerTextAfterSbox.indexOf('QTD') !== -1,
      hasAlertDrilldown: drawerTextAfterAlert.indexOf('Dealership Fleet Receivables & SOA Dispatch') !== -1,
      countBeforeReset: countBeforeReset,
      botAfterReset: botAfterReset,
      userAfterReset: userAfterReset,
      inlineUserAfterReset: inlineUserAfterReset,
      hasResetWelcome: resetDrawerText.indexOf('Welcome. I am ISABI') !== -1,
      hasAttachIntent: attachReplyText.indexOf('360° Record View') !== -1 && attachReplyText.indexOf('Enterprise Ownership') === -1,
      hasRecipeIntent: recipeReplyText.indexOf('item-by-item recipes') !== -1,
      hasConsolIntent: consolReplyText.indexOf('consolidates unlimited entities in real time') !== -1,
      hasWhatIfIntent: whatIfReplyText.indexOf('What-If Scenario Studio') !== -1 && whatIfReplyText.indexOf('30-Day Liquidity Maturity Bridge') !== -1,
      hasExplainIntent: explainReplyText.indexOf('Explain Page') !== -1 && explainReplyText.indexOf('spotlight tour') !== -1,
      hasGpsIntent: gpsReplyText.indexOf('live truck GPS positions') !== -1 && gpsReplyText.indexOf('fuel-level sensors') !== -1,
      hasCloseIntent: closeReplyText.indexOf('month-end cutoff date locks') !== -1 && closeReplyText.indexOf('step-up 2FA') !== -1,
      emptySubmitRejected: countAfterEmptySubmit === countBeforeEmptySubmit,
      zeroAiForbidden: !/[\u2014\u2013\u2192]/.test(attachReplyText + ' ' + recipeReplyText + ' ' + consolReplyText + ' ' + whatIfReplyText + ' ' + explainReplyText + ' ' + gpsReplyText + ' ' + closeReplyText)
    };

    // Interactive Tabs & Simulators + Secondary Tab Height Checks
    function parseRgbSum(el) {
      if (!el) return -1;
      var cs = getComputedStyle(el);
      var bg = cs.backgroundColor || '';
      var img = cs.backgroundImage || '';
      var m = bg.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([0-9.]+))?\\)/);
      if (m) {
        var a = m[4] !== undefined ? parseFloat(m[4]) : 1;
        if (a > 0.2) return parseInt(m[1], 10) + parseInt(m[2], 10) + parseInt(m[3], 10);
      }
      var gm = img.match(/rgb\\((\\d+),\\s*(\\d+),\\s*(\\d+)\\)/);
      if (gm) return parseInt(gm[1], 10) + parseInt(gm[2], 10) + parseInt(gm[3], 10);
      return 765;
    }

    var indSubtabCount = document.querySelectorAll('.ind-subtabs .ind-subtab-btn').length;
    var dfBtn = document.querySelector('[data-ind-subtab="dayflow"]');
    if (dfBtn) dfBtn.click();
    var flowCardCount = document.querySelectorAll('.ind-flow-step').length;

    var baBtn = document.querySelector('[data-ind-subtab="beforeafter"]');
    if (baBtn) baBtn.click();
    var baCardCount = document.querySelectorAll('.ind-ba-card').length;

    var modBtn = document.querySelector('[data-ind-subtab="modules"]');
    if (modBtn) modBtn.click();

    var soaModeBtn = document.querySelector('[data-sbox-mode="soa"]');
    if (soaModeBtn) soaModeBtn.click();
    var hasSoaViewer = !!document.querySelector('#sandbox-mock .soa-viewer');
    var soaDocBtn = document.querySelector('[data-soa-doc="soa"]');
    if (soaDocBtn) soaDocBtn.click();
    var soaDocTitle = document.querySelector('.soa-hdr h3') ? document.querySelector('.soa-hdr h3').textContent : '';
    var soaDocHtml = document.querySelector('#sandbox-mock .soa-viewer') ? document.querySelector('#sandbox-mock .soa-viewer').innerHTML : '';
    var tbDocBtn = document.querySelector('[data-soa-doc="tb"]');
    if (tbDocBtn) tbDocBtn.click();
    var tbDocTitle = document.querySelector('.soa-hdr h3') ? document.querySelector('.soa-hdr h3').textContent : '';
    var tbDocHtml = document.querySelector('#sandbox-mock .soa-viewer') ? document.querySelector('#sandbox-mock .soa-viewer').innerHTML : '';
    var soaDocDifferent = (soaDocTitle !== tbDocTitle && soaDocHtml !== tbDocHtml && tbDocTitle.indexOf('Trial Balance') !== -1);
    if (soaDocBtn) soaDocBtn.click();

    var pwaModeBtn = document.querySelector('[data-sbox-mode="pwa"]');
    if (pwaModeBtn) pwaModeBtn.click();
    var posAdd0 = document.querySelector('[data-pos-add]');
    if (posAdd0) posAdd0.click();
    var kioskPunchBtn = document.querySelector('[data-kiosk-punch]');
    if (kioskPunchBtn) kioskPunchBtn.click();
    var pwaText = document.getElementById('sandbox-mock').textContent;
    var hasPwaSim = pwaText.indexOf('99.4% Face + PIN') !== -1 && pwaText.indexOf('Offline Queue Ready') !== -1;
    document.documentElement.setAttribute('data-theme', 'light');
    var lightPosReceiptRgb = parseRgbSum(document.querySelector('.pos-receipt-box'));

    var erpModeBtn = document.querySelector('[data-sbox-mode="erp"]');
    if (erpModeBtn) erpModeBtn.click();
    var railBrandSvgCount = document.querySelectorAll('.rail .brand svg').length;
    var sboxPageTitles = {};
    var sboxNavItems = ['Overview','Sales & Revenue','Purchases & Stock','Cash & Treasury','General Ledger','Statements','Business Units','Audit Trail'];
    sboxNavItems.forEach(function(nm) {
      var nb = document.querySelector('[data-sbox-nav="' + nm + '"]');
      if (nb) nb.click();
      var t = document.querySelector('.mock .crumb b') ? document.querySelector('.mock .crumb b').textContent.trim() : '';
      if (t) sboxPageTitles[t] = 1;
    });
    var ovBtn = document.querySelector('[data-sbox-nav="Overview"]');
    if (ovBtn) ovBtn.click();
    var distinctSboxPages = Object.keys(sboxPageTitles).length;

    var visibleFaqs = document.querySelectorAll('#faq-grid [data-faq-item]').length;

    var builderTab = document.querySelector('[data-price-view="builder"]');
    if (builderTab) builderTab.click();
    var priceBuilderH = Math.round(document.getElementById('pricing').getBoundingClientRect().height);
    var builderPressed = builderTab ? builderTab.getAttribute('aria-pressed') : '';
    var builderCardOverflows = scanCards('.configurator-card');
    var tiersTab = document.querySelector('[data-price-view="tiers"]');
    if (tiersTab) tiersTab.click();

    // Tier selection updates hidden budget & portal header note
    var tierBtn = document.querySelector('[data-select-tier="Operational Foundation ($3,000 Setup + $50/seat/mo)"]');
    if (tierBtn) tierBtn.click();
    var tierNoteTxt = document.getElementById('portal-tier-note').textContent;
    var leadBudgetVal = document.getElementById('lead-budget').value;

    // Hero preview: a tab or a bar row inspects one vertical, the Group overview tab returns
    var heroHospTab = document.querySelector('#hlc-tabs [data-hero-ind="hospitality"]');
    if (heroHospTab) heroHospTab.click();
    var heroHospVal = document.getElementById('hlc-kpi1-val').textContent;
    var heroHospPressed = heroHospTab ? heroHospTab.getAttribute('aria-pressed') : '';
    var heroHospLink = document.getElementById('hlc-open-portal-link').getAttribute('href');
    var heroAllTab = document.querySelector('#hlc-tabs [data-hero-ind="all"]');
    if (heroAllTab) heroAllTab.click();
    var heroResetVal = document.getElementById('hlc-kpi1-val').textContent;
    var heroBarRow = document.querySelector('#hlc-stage .d-bar-row[data-hero-ind="trading"]');
    if (heroBarRow) heroBarRow.click();
    var heroBarVal = document.getElementById('hlc-kpi1-val').textContent;
    if (heroAllTab) heroAllTab.click();

    var lightChecks = {
      hlcTop: parseRgbSum(document.querySelector('.d-prev-top')),
      sboxPosReceipt: lightPosReceiptRgb,
      sboxRail: parseRgbSum(document.querySelector('.rail')),
      aiConsole: parseRgbSum(document.querySelector('.ai-console')),
      aiConsoleHdr: parseRgbSum(document.querySelector('.ai-console-hdr')),
      aiBotBubble: parseRgbSum(document.querySelector('.ai-bot-bubble')),
      aiDrawer: parseRgbSum(document.querySelector('.ai-drawer')),
      portalDirect: parseRgbSum(document.querySelector('.d-direct')),
      directChannel: parseRgbSum(document.querySelector('.d-channel')),
      logoCard: parseRgbSum(document.querySelector('.d-logos')),
      siteFooter: parseRgbSum(document.querySelector('.d-foot'))
    };

    var darkBlocksInLight = [];
    function scanDarkBlocks() {
      Array.from(document.querySelectorAll('body *')).forEach(function(el) {
        if (el.classList && el.classList.contains('drawer-backdrop')) return;
        var r = el.getBoundingClientRect();
        if (r.width < 80 || r.height < 34) return;
        var cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        var s = parseRgbSum(el);
        if (s >= 0 && s < 220) {
          darkBlocksInLight.push(el.tagName.toLowerCase() + '.' + String(el.className || '').trim().split(/\\s+/).slice(0, 2).join('.') + ':' + s);
        }
      });
    }
    var drawerBd = document.getElementById('ai-drawer-backdrop');
    if (drawerBd) drawerBd.hidden = true;
    scanDarkBlocks();
    ['sandbox', 'industries', 'faq'].forEach(function(sid) {
      var op = document.querySelector('#site-pages a[href="#' + sid + '"]');
      if (op) op.click();
      scanDarkBlocks();
    });
    var homeLink = document.querySelector('a[href="#top"]');
    if (homeLink) homeLink.click();
    var closedByHome = document.querySelectorAll('[data-sheet]:not([hidden])').length === 0 && !document.getElementById('site-pages').hidden;

    document.documentElement.setAttribute('data-theme', 'dark');
    var darkChecks = {
      hlcTop: parseRgbSum(document.querySelector('.d-prev-top')),
      aiConsole: parseRgbSum(document.querySelector('.ai-console')),
      portalDirect: parseRgbSum(document.querySelector('.d-direct')),
      pageGround: parseRgbSum(document.getElementById('hero')),
      siteFooter: parseRgbSum(document.querySelector('.d-foot'))
    };
    document.documentElement.setAttribute('data-theme', 'light');

    // Verify Curated Trilingual Suite (EN | AR | FR), Dynamic JS Re-Render, <option value> Lock & Modular Locale Registry (registerLocale)
    var i18nOk = false;
    var i18nDiag = {};
    if (window.ISABI_I18N) {
      var navSel = '#main-nav a[data-sec-link="platform"]';
      var colSel = '#why .d-row:not(.d-rowhead) .d-cmp-b';
      window.ISABI_I18N.setLang('fr', false);
      var frNav = document.querySelector(navSel)?.textContent || '';
      var frHeroH1 = (document.querySelector('#hero h1')?.textContent || '').replace(/\\s+/g, ' ').trim();
      var frHeroCard = document.querySelector('.d-preview')?.textContent || '';
      var frScrollOk = document.documentElement.scrollWidth <= window.innerWidth;
      var frMobBodyW = document.body.scrollWidth;
      var frColLbl = document.querySelector(colSel)?.getAttribute('data-col-lbl') || '';
      window.ISABI_I18N.setLang('ar', false);
      var arDir = document.documentElement.getAttribute('dir');
      var arNav = document.querySelector(navSel)?.textContent || '';
      var arHeroH1 = (document.querySelector('#hero h1')?.textContent || '').replace(/\\s+/g, ' ').trim();
      var arScrollOk = document.documentElement.scrollWidth <= window.innerWidth;
      var arMobBodyW = document.body.scrollWidth;
      var arColLbl = document.querySelector(colSel)?.getAttribute('data-col-lbl') || '';
      var indSel = document.getElementById('lead-industry');
      var arOptTxt = indSel && indSel.options[0] ? indSel.options[0].text : '';
      var arOptVal = indSel && indSel.options[0] ? indSel.options[0].value : '';
      var arPricingTxt = document.getElementById('pricing')?.textContent || '';
      var arLeadPh = document.getElementById('lead-name')?.getAttribute('placeholder') || '';
      var arDfBtn = document.querySelector('[data-ind-subtab="dayflow"]');
      if (arDfBtn) arDfBtn.click();
      window.ISABI_I18N.translateDom(document.getElementById('industries'));
      var arFlowTxt = document.querySelector('.ind-flow-step')?.textContent || '';
      var arModBtn = document.querySelector('[data-ind-subtab="modules"]');
      if (arModBtn) arModBtn.click();
      window.ISABI_I18N.translateDom(document.getElementById('industries'));
      // Layer 3 Showcase Runtime Crawl Gate: audit the visible DOM of the eight pages (every hero vertical), then each "more" page, 8 sidebar pages & SOA/TB modes
      var arDomAudit = { count: 0, items: [] };
      var frDomAudit = { count: 0, items: [] };
      function auditBoth(rootEl) {
        window.ISABI_I18N.setLang('ar', false);
        window.ISABI_I18N.translateDom(rootEl);
        var a = window.ISABI_I18N.auditDom(rootEl, 'ar');
        if (a.count) { arDomAudit.count += a.count; arDomAudit.items = arDomAudit.items.concat(a.items); }
        window.ISABI_I18N.setLang('fr', false);
        var f = window.ISABI_I18N.auditDom(rootEl, 'fr');
        if (f.count) { frDomAudit.count += f.count; frDomAudit.items = frDomAudit.items.concat(f.items); }
      }
      auditBoth(document.body);
      ['trading', 'hospitality', 'manufacturing', 'realestate', 'all'].forEach(function(hk) {
        var hb = document.querySelector('#hlc-tabs [data-hero-ind="' + hk + '"]');
        if (hb) hb.click();
        auditBoth(document.getElementById('hero'));
      });
      var builderTab2 = document.querySelector('[data-price-view="builder"]');
      if (builderTab2) builderTab2.click();
      auditBoth(document.getElementById('pricing'));
      var tiersTab2 = document.querySelector('[data-price-view="tiers"]');
      if (tiersTab2) tiersTab2.click();
      var auditedSheets = 0;
      ['faq', 'industries', 'sandbox'].forEach(function(sid) {
        var op = document.querySelector('#site-pages a[href="#' + sid + '"]');
        if (op) op.click();
        if (!document.getElementById(sid).hidden) auditedSheets++;
        auditBoth(document.getElementById('site-header'));
        if (sid === 'industries') {
          document.querySelectorAll('[data-ind-id]').forEach(function(b) {
            var bid = b.getAttribute('data-ind-id');
            var live = document.querySelector('[data-ind-id="' + bid + '"]');
            if (live) live.click();
            ['dayflow', 'modules'].forEach(function(st) {
              var sb = document.querySelector('[data-ind-subtab="' + st + '"]');
              if (sb) sb.click();
              auditBoth(document.getElementById('industries'));
            });
          });
        } else {
          auditBoth(document.getElementById(sid));
        }
      });
      ['Overview','Sales & Revenue','Purchases & Stock','Cash & Treasury','General Ledger','Statements','Business Units','Audit Trail'].forEach(function(nm) {
        var nb = document.querySelector('[data-sbox-nav="' + nm + '"]');
        if (nb) nb.click();
        auditBoth(document.getElementById('sandbox'));
      });
      var soaM = document.querySelector('[data-sbox-mode="soa"]');
      if (soaM) soaM.click();
      ['soa', 'tb'].forEach(function(dk) {
        var db = document.querySelector('[data-soa-doc="' + dk + '"]');
        if (db) db.click();
        auditBoth(document.getElementById('sandbox'));
      });
      var pwaM = document.querySelector('[data-sbox-mode="pwa"]');
      if (pwaM) pwaM.click();
      auditBoth(document.getElementById('sandbox'));
      var erpM = document.querySelector('[data-sbox-mode="erp"]');
      if (erpM) erpM.click();
      var ovB = document.querySelector('[data-sbox-nav="Overview"]');
      if (ovB) ovB.click();
      var homeLink2 = document.querySelector('a[href="#top"]');
      if (homeLink2) homeLink2.click();
      window.ISABI_I18N.registerLocale('es', { label: 'ES', nativeName: 'Español', dir: 'ltr' }, { 'Platform': 'Plataforma' });
      window.ISABI_I18N.setLang('es', false);
      var esNav = document.querySelector(navSel)?.textContent || '';
      window.ISABI_I18N.setLang('en', false);
      var invalidLangRejected = (window.ISABI_I18N.setLang('<scr' + 'ipt>alert(1)</scr' + 'ipt>', false) === false && document.documentElement.getAttribute('lang') === 'en');
      var enNav = document.querySelector(navSel)?.textContent || '';
      var enDir = document.documentElement.getAttribute('dir');
      var enHeroH1 = (document.querySelector('#hero h1')?.textContent || '').replace(/\\s+/g, ' ').trim();
      var enLeadPh = document.getElementById('lead-name')?.getAttribute('placeholder') || '';
      i18nDiag = {
        frNav: frNav,
        frHeroOk: frHeroH1.indexOf("L'ERP sur lequel votre Groupe") !== -1 && /Chiffre d'affaires/i.test(frHeroCard),
        frScrollOk: frScrollOk,
        frMobBodyW: frMobBodyW,
        frColLbl: frColLbl,
        arDir: arDir,
        arNav: arNav,
        arHeroOk: arHeroH1.indexOf('نظام ERP الذي تعتمد عليه') !== -1,
        arScrollOk: arScrollOk,
        arMobBodyW: arMobBodyW,
        arColLbl: arColLbl,
        arOptOk: /[\\u0600-\\u06FF]/.test(arOptTxt) && arOptVal === 'Hospitality & Resorts',
        arPricingOk: /[\\u0600-\\u06FF]/.test(arPricingTxt) && arPricingTxt.indexOf('الأساس التشغيلي') !== -1,
        arPhOk: /[\\u0600-\\u06FF]/.test(arLeadPh),
        arFlowOk: /[\\u0600-\\u06FF]/.test(arFlowTxt),
        arAuditMissing: arDomAudit.count,
        arAuditSample: arDomAudit.items.slice(0, 8),
        frAuditMissing: frDomAudit.count,
        frAuditSample: frDomAudit.items.slice(0, 8),
        auditedSheets: auditedSheets,
        esNav: esNav,
        enNav: enNav,
        enDir: enDir,
        invalidLangRejected: invalidLangRejected,
        enRestoreOk: enHeroH1.indexOf('The ERP Your Group') !== -1 && enLeadPh.indexOf('Karim Mansour') !== -1
      };
      i18nOk = (
        frNav === 'Plateforme' && i18nDiag.frHeroOk && frScrollOk && frColLbl === 'SaaS Générique' &&
        arDir === 'rtl' && arNav === 'المنصة' && i18nDiag.arHeroOk &&
        i18nDiag.arScrollOk && /[\\u0600-\\u06FF]/.test(arColLbl) && i18nDiag.arOptOk && i18nDiag.arPricingOk &&
        i18nDiag.arPhOk && i18nDiag.arFlowOk &&
        arDomAudit.count === 0 && frDomAudit.count === 0 && auditedSheets === 3 &&
        esNav === 'Plataforma' && enNav === 'Platform' && enDir === 'ltr' &&
        invalidLangRejected === true && i18nDiag.enRestoreOk
      );
    }

      out.v4Test = {
      i18nOk: i18nOk,
      i18nDiag: i18nDiag,
      soaDocDifferent: soaDocDifferent,
      railBrandSvgCount: railBrandSvgCount,
      distinctSboxPages: distinctSboxPages,
      indSubtabCount: indSubtabCount,
      flowCardCount: flowCardCount,
      baCardCount: baCardCount,
      hasSoaViewer: hasSoaViewer,
      hasPwaSim: hasPwaSim,
      visibleFaqs: visibleFaqs,
      priceBuilderH: priceBuilderH,
      builderPressed: builderPressed,
      builderCardOverflows: builderCardOverflows.slice(0, 8),
      tierNoteTxt: tierNoteTxt,
      leadBudgetVal: leadBudgetVal,
      heroHospVal: heroHospVal,
      heroHospPressed: heroHospPressed,
      heroHospLink: heroHospLink,
      heroResetVal: heroResetVal,
      heroBarVal: heroBarVal,
      closedByHome: closedByHome,
      lightChecks: lightChecks,
      darkBlocksInLight: darkBlocksInLight.slice(0, 10),
      darkChecks: darkChecks,
      visibleJargon: (
        (document.title + ' ' + (document.querySelector('meta[name="description"]')?.content || '') + ' ' + document.body.innerText)
        .match(/\b(SQL|PostgreSQL|SQLite|IndexedDB|PWA|PWAs|RLS|schema|schemas|compiler|compiled|128-d|80mm|58mm)\b/gi) || []
      ).slice(0, 10)
    };
    pre.textContent = JSON.stringify(out);
  } catch (err) {
    pre.textContent = JSON.stringify({ error: String(err) });
  }
  document.body.appendChild(pre);
});
</script>
"""
        with open(diag_html, 'w', encoding='utf-8') as f:
            f.write(base_html.replace('</body>', test_script + '</body>'))

        diag_url = 'file:///' + diag_html.replace('\\', '/')

        def probe_viewport(w, h, label):
            res_vp = subprocess.run(
                [EDGE, '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--virtual-time-budget=3000', f'--user-data-dir={ud}', f'--window-size={w},{h}', '--dump-dom', diag_url + '#pricing'],
                capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=60
            )
            m_vp = html.unescape(res_vp.stdout.split('<pre id="diag-json">')[1].split('</pre>')[0])
            d_vp = json.loads(m_vp)
            if 'error' in d_vp:
                raise RuntimeError(f"[{label} {w}x{h}] JS error: {d_vp['error']}")
            print(f'[{label} {w}x{h}]', json.dumps({k: d_vp[k] for k in ('vw', 'vh', 'scrollW', 'hdrBottom', 'hdrControlCount', 'heroControlCount', 'secHeights', 'cardOverflows', 'overflows') if k in d_vp}))
            return d_vp

        d_desk = probe_viewport(1366, 768, 'DESK')
        d_desk_1440 = probe_viewport(1440, 810, 'DESK')
        d_desk_1536 = probe_viewport(1536, 864, 'DESK')
        d_desk_1920 = probe_viewport(1920, 1080, 'DESK')
        d_mob = probe_viewport(390, 844, 'MOB')

        if os.path.exists(diag_html):
            os.remove(diag_html)

        # Desktop multi-viewport single-screen assertions (1366x768, 1440x810, 1536x864, 1920x1080)
        for vp_lbl, dvp in [('1366x768', d_desk), ('1440x810', d_desk_1440), ('1536x864', d_desk_1536), ('1920x1080', d_desk_1920)]:
            assert dvp['scrollW'] <= dvp['vw'], f"{vp_lbl} horizontal overflow! scrollW={dvp['scrollW']} > vw={dvp['vw']}"
            assert dvp['cardOverflows'] == [], f"{vp_lbl} card overflows detected: {dvp['cardOverflows']}"
            avail_h = dvp['vh'] - dvp['hdrBottom']
            for sec_sel, sec_h in dvp['secHeights'].items():
                assert abs(sec_h - avail_h) <= 2, f"{vp_lbl} section {sec_sel} height ({sec_h}px) != viewport availH ({avail_h}px)!"
            assert abs(dvp['v4Test']['priceBuilderH'] - avail_h) <= 2, f"{vp_lbl} Custom Scope Builder height ({dvp['v4Test']['priceBuilderH']}px) != viewport availH ({avail_h}px)!"
            assert dvp['v4Test']['builderCardOverflows'] == [], f"{vp_lbl} scope builder overflows: {dvp['v4Test']['builderCardOverflows']}"
            for sheet_id in ('sandbox', 'industries', 'faq'):
                sh = dvp['sheets'][sheet_id]
                assert sh['hasOpener'] and sh['shown'] and sh['pagesHidden'] and sh['mainNavHidden'] and sh['sheetNavShown'], f"{vp_lbl} page #{sheet_id} did not open from its button: {sh}"
                assert sh['activeLink'] == ['#' + sheet_id] and sh['hash'] == '#' + sheet_id, f"{vp_lbl} page #{sheet_id} menu or address wrong: {sh}"
                assert abs(sh['h'] - sh['avail']) <= 2, f"{vp_lbl} page #{sheet_id} height ({sh['h']}px) != viewport availH ({sh['avail']}px)!"
                assert sh['scrollW'] <= dvp['vw'] and sh['cardOverflows'] == [], f"{vp_lbl} page #{sheet_id} overflows: {sh}"
            assert abs(dvp['sheets']['industries']['indTabsH'] - dvp['sheets']['industries']['indDetailH']) <= 2, f"{vp_lbl} industry tabs/detail heights mismatch: {dvp['sheets']['industries']}"
            assert dvp['sheets']['afterBack'] == {'pagesHidden': False, 'openSheets': 0, 'mainNavHidden': False, 'hash': '#pricing'}, f"{vp_lbl} Back to Site did not return to the main pages: {dvp['sheets']['afterBack']}"
            assert dvp['sheets']['afterEscape']['pagesHidden'] is False and dvp['sheets']['afterEscape']['openSheets'] == 0, f"{vp_lbl} Escape did not close the page: {dvp['sheets']['afterEscape']}"

        # Primary Desktop assertions
        assert d_desk['hdrControlCount'] == 9, f"Expected 9 clean header controls (6 nav + theme, sign in, book), got {d_desk['hdrControlCount']}"
        assert d_desk['heroControlCount'] == 13, f"Expected 13 hero controls (3 CTAs + 5 tabs + 4 bar rows + portal link), got {d_desk['heroControlCount']}"
        assert d_desk['activeMain'] == ['#pricing'], f"Expected activeMain=['#pricing'], got {d_desk['activeMain']}"
        assert d_desk['whyBottom'] <= d_desk['hdrBottom'] + 1, f"Previous page bled through! whyBottom={d_desk['whyBottom']} > hdrBottom={d_desk['hdrBottom']}"
        assert abs(d_desk['pricingTop'] - d_desk['hdrBottom']) <= 4, f"Page top not aligned to header bottom! pricingTop={d_desk['pricingTop']}, hdrBottom={d_desk['hdrBottom']}"
        assert 0 < d_desk['ctaRight'] <= d_desk['vw'], f"Header CTA clipped! ctaRight={d_desk['ctaRight']} > vw={d_desk['vw']}"
        assert abs(d_desk['leadContactW'] - d_desk['leadNameW']) <= 1, f"lead-contact width ({d_desk['leadContactW']}) != lead-name width ({d_desk['leadNameW']})"
        assert abs(d_desk['leadIndustryW'] - d_desk['leadCompanyW']) <= 1, f"lead-industry width ({d_desk['leadIndustryW']}) != lead-company width ({d_desk['leadCompanyW']})"
        assert d_desk['leadIndustryRight'] <= d_desk['portalCardRight'] - 16, f"lead-industry overflows the brief card! {d_desk['leadIndustryRight']} vs {d_desk['portalCardRight']}"
        assert d_desk['hlcSvgCount'] == 1, f"Expected 1 SVG in .d-prev-brand (no nested SVG), got {d_desk['hlcSvgCount']}"
        assert d_desk['heroSecH'] >= d_desk['vh'] - d_desk['hdrBottom'], f"Hero page too short ({d_desk['heroSecH']} < {d_desk['vh'] - d_desk['hdrBottom']})!"
        assert d_desk['moduleCount'] == 18 and d_desk['industryTileCount'] == 6, f"Platform page: expected 18 modules and 6 industry tiles, got {d_desk['moduleCount']} / {d_desk['industryTileCount']}"
        assert d_desk['logoCount'] == 5 and d_desk['logoOneTone'] is True, f"In Practice page: expected 5 logos in one tone, got {d_desk['logoCount']} / {d_desk['logoOneTone']}"
        assert d_desk['cmpCols'] == 4, f"Expected a 4-column comparison on desktop, got {d_desk['cmpCols']}"
        assert abs(d_desk['kpi1W'] - d_desk['kpi2W']) <= 2, f"Hero KPI width mismatch: {d_desk['kpi1W']} vs {d_desk['kpi2W']}"

        # Mobile assertions (390x844)
        assert d_mob['scrollW'] <= d_mob['vw'], f"Mobile horizontal overflow! scrollW={d_mob['scrollW']} > vw={d_mob['vw']}"
        assert d_mob['overflows'] == [], f"Mobile element overflows detected: {d_mob['overflows']}"
        assert d_mob['sheets']['sandbox']['mockWidth'] <= d_mob['vw'], f"Mobile sandbox .mock overflows! {d_mob['sheets']['sandbox']}"
        assert d_mob['compWidth'] <= d_mob['vw'], f"Mobile comparison overflows! compWidth={d_mob['compWidth']} > vw={d_mob['vw']}"
        assert abs(d_mob['kpi1W'] - d_mob['kpi2W']) <= 2, f"Mobile hero KPI width mismatch: {d_mob['kpi1W']} vs {d_mob['kpi2W']}"
        assert d_mob['activeMob'] == ['#pricing'], f"Mobile section nav active mismatch: {d_mob['activeMob']}"
        for sheet_id in ('sandbox', 'industries', 'faq'):
            sh = d_mob['sheets'][sheet_id]
            assert sh['hasOpener'] and sh['shown'] and sh['pagesHidden'], f"Mobile page #{sheet_id} did not open from its button: {sh}"
            assert sh['overflows'] == [] and sh['scrollW'] <= d_mob['vw'], f"Mobile page #{sheet_id} overflows: {sh}"
        assert d_mob['sheets']['afterBack']['pagesHidden'] is False and d_mob['sheets']['afterBack']['openSheets'] == 0, f"Mobile Back to Site failed: {d_mob['sheets']['afterBack']}"
        assert d_mob['langSwitchH'] >= 36, f"Mobile header lang switch height {d_mob['langSwitchH']}px < 36px!"
        assert d_mob['inputFontMin'] >= 16, f"Mobile input font-size {d_mob['inputFontMin']}px < 16px (triggers iOS zoom)!"
        assert d_mob['cmpCols'] == 1, f"Expected the comparison stacked in one column at 390x844, got {d_mob['cmpCols']}"
        assert d_mob['v4Test'].get('i18nOk') is True, f"Mobile EN/AR(RTL)/FR i18n check failed: {d_mob['v4Test'].get('i18nDiag')}"
        assert d_mob['v4Test']['i18nDiag']['arMobBodyW'] <= 390 and d_mob['v4Test']['i18nDiag']['frMobBodyW'] <= 390, f"Mobile RTL/FR body overflow: {d_mob['v4Test']['i18nDiag']}"
        assert d_mob['cardOverflows'] == [], f"Mobile card overflows detected: {d_mob['cardOverflows']}"

        ai = d_desk['aiTest']
        assert ai['initDrawerUsers'] == 0 and ai['hasInitWelcome'] is True, f"Drawer did not start with clean welcome state: {ai}"
        assert ai['hasThinkingBubble'] is True, "Async submit did not render 'ISABI is analyzing...' thinking indicator"
        assert ai['hasHelloReply'] is True, "Greeting 'Hello' did not return conversational reply without repeating initial table"
        assert ai['hasHowAreYouReply'] is True, "'how are you' did not return conversational status reply"
        assert ai['hasArabicRtl'] is True, "Arabic query did not render RTL Arabic reply"
        assert ai['hasFrenchReply'] is True, "French query did not render French reply"
        assert ai['followupBubbleCount'] == 1, f"Expected 1 followup bubble afterReset in inline thread, got {ai['followupBubbleCount']}"
        assert ai['afterInlineCount'] == 5, f"Expected 5 messages after multilingual + blueprint submits, got {ai['afterInlineCount']}"
        assert ai['hasMfgBlueprint'] is True, "Inline submit did not render Concrete & Manufacturing blueprint"
        assert ai['scopeBarTxt'] == 'Auto & Equipment Trading · EUR · QTD', f"Unexpected scopeBarTxt: {ai['scopeBarTxt']}"
        assert ai['hasEurQtdBriefing'] is True, "Sandbox Ask ISABI click did not render EUR QTD briefing"
        assert ai['hasAlertDrilldown'] is True, "Sandbox alert button click did not render alert drilldown"
        assert ai['countBeforeReset'] == 8, f"Expected 8 messages in thread before reset, got {ai['countBeforeReset']}"
        assert ai['botAfterReset'] == 1 and ai['userAfterReset'] == 0 and ai['inlineUserAfterReset'] == 0 and ai['hasResetWelcome'] is True, f"Reset did not restore clean welcome state: {ai}"
        assert ai['hasAttachIntent'] is True, f"Attachments semantic handler did not match cleanly: {ai}"
        assert ai['hasRecipeIntent'] is True, f"Recipes semantic handler did not match cleanly: {ai}"
        assert ai['hasConsolIntent'] is True, f"Consolidation semantic handler did not match cleanly: {ai}"
        assert ai['hasWhatIfIntent'] is True, f"What-If Scenario Studio semantic handler did not match cleanly: {ai}"
        assert ai['hasExplainIntent'] is True, f"Interactive Page Guide semantic handler did not match cleanly: {ai}"
        assert ai['hasGpsIntent'] is True, f"Live Fleet GPS semantic handler did not match cleanly: {ai}"
        assert ai['hasCloseIntent'] is True, f"Period-Close & Step-Up 2FA semantic handler did not match cleanly: {ai}"
        assert ai['emptySubmitRejected'] is True, f"Negative assertion failed: empty whitespace submit should not append user bubble: {ai}"
        assert ai['zeroAiForbidden'] is True, f"Forbidden em-dash/arrow found in AI replies: {ai}"

        html_byte_len = len(base_html.encode('utf-8'))
        assert html_byte_len <= 924658, f"Negative assertion failed: index.html byte size ({html_byte_len} B) exceeded prior 924,658 B budget"

        v4 = d_desk['v4Test']
        assert v4.get('i18nOk') is True, f"Showcase ISABI_I18N trilingual & registerLocale check failed: {v4}"
        assert v4['i18nDiag'].get('invalidLangRejected') is True, f"Negative assertion failed: invalid locale tag was not rejected: {v4['i18nDiag']}"
        assert v4.get('soaDocDifferent') is True, f"Negative assertion failed: Statement of Account and Statutory Trial Balance rendered identical view: {v4}"
        assert v4.get('railBrandSvgCount') == 2, f"Expected 2 single-line SVGs (mark + wordmark) in .rail .brand, got {v4.get('railBrandSvgCount')}"
        assert v4.get('distinctSboxPages') == 8, f"Negative assertion failed: expected 8 distinct ERP pages across left-sidebar tabs, got {v4.get('distinctSboxPages')}"
        assert v4['indSubtabCount'] == 2, f"Expected 2 streamlined industry sub-tabs, got {v4['indSubtabCount']}"
        assert v4['flowCardCount'] == 4, f"Expected 4 Day-in-the-Life flow cards, got {v4['flowCardCount']}"
        assert v4['baCardCount'] == 0, f"Negative assertion failed: removed Before/After cards still present ({v4['baCardCount']})"
        assert v4['hasSoaViewer'] is True, "SOA viewer did not render in Sandbox mode 'soa'"
        assert v4['hasPwaSim'] is True, "POS & Kiosk simulator did not update on interactive click in mode 'pwa'"
        assert v4['visibleFaqs'] == 6, f"Expected 6 FAQs on the FAQ page, got {v4['visibleFaqs']}"
        assert v4['builderPressed'] == 'true' and v4['closedByHome'] is True, f"Pricing view switch or home link failed: {v4['builderPressed']} / {v4['closedByHome']}"
        assert v4['leadBudgetVal'] == 'Operational Foundation ($3,000 Setup + $50/seat/mo)' and 'Operational Foundation' in v4['tierNoteTxt'], f"Tier select did not update portal brief: {v4}"
        assert v4['heroHospVal'] == '$418,200' and v4['heroHospPressed'] == 'true' and 'industry=hospitality' in v4['heroHospLink'] and v4['heroResetVal'] == '$1,482,600' and v4['heroBarVal'] == '$524,900', f"Hero vertical inspect/reset failed: {v4}"
        assert v4['visibleJargon'] == [], f"Visible technical jargon found in rendered page: {v4['visibleJargon']}"
        for surf_k, surf_rgb in v4['lightChecks'].items():
            assert surf_rgb >= 650, f"Light Mode surface {surf_k} is too dark (RGB sum={surf_rgb} < 650): {v4['lightChecks']}"
        assert v4['darkBlocksInLight'] == [], f"Dark-navy blocks found in Light Mode: {v4['darkBlocksInLight']}"
        for d_k, d_rgb in v4['darkChecks'].items():
            assert 0 <= d_rgb <= 120, f"Dark Mode surface {d_k} did not switch to dark palette (RGB sum={d_rgb}): {v4['darkChecks']}"

        # 3. Verify 404.html headless DOM, RTL & zero-overflow geometry at 390x844 & 1366x768 across en/ar/fr
        base_href = 'file:///' + repo_root.replace('\\', '/') + '/'
        for vw_w, vw_h in ((390, 844), (1366, 768)):
            for loc in ('en', 'ar', 'fr'):
                probe_404 = os.path.join(ud, f'_diag_404_{loc}_{vw_w}.html')
                raw_404 = open(os.path.join(repo_root, '404.html'), 'r', encoding='utf-8').read()
                inj_404 = (
                    f'<base href="{base_href}">'
                    f"<script>try{{localStorage.setItem('isabi.lang.v1','{loc}');}}catch(e){{}}"
                    "window.addEventListener('load',function(){var d=document.documentElement,b=document.body;"
                    "var effW=window.innerWidth<600?390:d.clientWidth;"
                    "if(window.innerWidth<600){d.style.width='390px';b.style.width='390px';}"
                    "var br=b.getBoundingClientRect(),cr=(document.querySelector('.card')||{getBoundingClientRect:function(){return{right:0,left:0,width:0};}}).getBoundingClientRect();"
                    "var pre=document.createElement('pre');pre.id='__d404';"
                    "pre.textContent=JSON.stringify({lang:d.lang,dir:d.dir,sw:b.scrollWidth,cw:effW,cardR:Math.round(cr.right-br.left),cardL:Math.round(cr.left-br.left),"
                    "h1:(document.querySelector('h1')||{}).textContent||''});"
                    "b.appendChild(pre);});</script>"
                )
                with open(probe_404, 'w', encoding='utf-8') as pf:
                    pf.write(raw_404.replace('</head>', inj_404 + '</head>'))
                try:
                    p_url = 'file:///' + probe_404.replace('\\', '/')
                    out_404 = subprocess.check_output(
                        [EDGE, '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--virtual-time-budget=3000', f'--user-data-dir={ud}', f'--window-size={vw_w},{vw_h}', '--dump-dom', p_url],
                        timeout=45
                    ).decode('utf-8', errors='ignore')
                    m404 = re.search(r'<pre id="__d404">(.*?)</pre>', out_404, flags=re.DOTALL)
                    assert m404, f"Missing __d404 probe in 404.html ({loc} {vw_w}x{vw_h})"
                    j404 = json.loads(html.unescape(m404.group(1)))
                    assert j404['lang'] == loc, f"404.html lang mismatch: {j404}"
                    assert j404['dir'] == ('rtl' if loc == 'ar' else 'ltr'), f"404.html dir mismatch: {j404}"
                    if vw_w == 390:
                        assert j404['cw'] == 390 and j404['sw'] <= 391 and j404['cardR'] <= 391 and j404['cardL'] >= -1, f"404.html mobile 390px geometry failed ({loc}): {j404}"
                    assert j404['sw'] <= j404['cw'] + 1 and j404['cardR'] <= j404['cw'] + 1, f"404.html horizontal overflow at {vw_w}x{vw_h} ({loc}): {j404}"
                    assert len(j404['h1'].strip()) > 3, f"404.html empty title ({loc}): {j404}"
                finally:
                    if os.path.exists(probe_404):
                        os.remove(probe_404)
        print('[404-DOM] Verified 404.html en/ar(RTL)/fr layout & zero horizontal overflow at 390x844 and 1366x768')

        # 4. Capture fresh screenshots of Hero & #portal at 1366x768
        os.makedirs(ART_DIR, exist_ok=True)
        shot_desk_hero = os.path.join(ART_DIR, 'isabi_desk_hero_v63.png')
        subprocess.run([EDGE, '--headless=new', '--disable-gpu', f'--user-data-dir={ud}', '--window-size=1366,768', f'--screenshot={shot_desk_hero}', URL], timeout=25)
        shot_desk_portal = os.path.join(ART_DIR, 'isabi_desk_portal_v63.png')
        shot_html = os.path.join(repo_root, '_shot_portal.html')
        shot_css = "<style>#hero,#platform,#ask,#golive,#why,#pricing,#proof{display:none!important;}</style>"
        with open(shot_html, 'w', encoding='utf-8') as f:
            f.write(base_html.replace('</head>', shot_css + '</head>'))
        shot_url = 'file:///' + shot_html.replace('\\', '/')
        subprocess.run([EDGE, '--headless=new', '--disable-gpu', f'--user-data-dir={ud}', '--window-size=1366,768', f'--screenshot={shot_desk_portal}', shot_url], timeout=25)
        if os.path.exists(shot_html):
            os.remove(shot_html)
        print('ALL GEOMETRY, MULTI-VIEWPORT, STREAMLINE & INTERACTIVE ASSERTIONS PASSED.')
    finally:
        if diag_html and os.path.exists(diag_html):
            try:
                os.remove(diag_html)
            except OSError:
                pass
        shutil.rmtree(ud, ignore_errors=True)


if __name__ == '__main__':
    run_dom_and_screenshots()
