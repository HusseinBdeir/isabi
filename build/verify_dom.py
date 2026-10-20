import html
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
URL = 'file:///C:/Users/HusseinBdeir/bhfirms/isabi/index.html'
ART_DIR = r'C:\Users\HusseinBdeir\.gemini\antigravity\brain\3d084823-2e95-4be3-94c1-02b9b86cdca8'


def run_dom_and_screenshots():
    ud = tempfile.mkdtemp(prefix='isabi_edge_')
    try:
        # 1. Dump DOM at #industries hash to verify initial hash activation & rendering
        res = subprocess.run(
            [EDGE, '--headless=new', f'--user-data-dir={ud}', '--window-size=1440,900', '--dump-dom', URL + '#industries'],
            capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=25
        )
        dom = res.stdout
        checks = [
            ('Hero title', 'The Books Close on'),
            ('Rendered Industry Tab', 'Hospitality, Resorts'),
            ('Rendered Industry Modules', 'Multi-Property Business Unit Isolation'),
            ('Rendered Sandbox Chart', 'class="chart"'),
            ('Rendered Sandbox Ledger Total', '<b>Audited Batch</b>'),
            ('Rendered Ask ISABI Thread', 'Overdue Receivables Audit'),
            ('Rendered ROI Output', '1,615 hrs/yr'),
            ('Rendered Configurator Total', '$12,300 to $15,000'),
            ('Mobile Section Nav Present', 'id="mobile-sec-nav"'),
            ('Mobile Segmented Bar Present', 'class="mob-seg-bar"'),
            ('Hash #industries activates Industries nav link', '<a href="#industries" data-sec-link="industries" class="active">Industries</a>'),
            ('FAQ section rendered', 'id="faq"'),
            ('FAQ JSON-LD present', '"@type": "FAQPage"'),
            ('Organization JSON-LD present', '"@type": "ProfessionalService"'),
            ('Open Graph image tag', 'property="og:image"'),
            ('Dynamic sandbox period label', '(MTD)</option>'),
            ('Scroll reveal activated', '<html lang="en" data-theme="light" class="js-io">'),
        ]
        failed = 0
        for name, needle in checks:
            ok = needle in dom
            print(f'[DOM] {name}: {"PASS" if ok else "FAIL"}')
            if not ok:
                failed += 1
        if failed:
            sys.exit(1)

        # 2. Create a temporary test harness HTML wrapper to verify geometry on Desktop & Mobile
        diag_html = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '_diag_test.html')
        with open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'index.html'), 'r', encoding='utf-8') as f:
            base_html = f.read()

        test_script = """
<script>
document.addEventListener('DOMContentLoaded', function() {
  var pre = document.createElement('pre');
  pre.id = 'diag-json';
  try {
    if (window.innerWidth < 600) {
      document.documentElement.style.width = '390px';
      document.body.style.width = '390px';
    }
    var hdr = document.querySelector('.site-header').getBoundingClientRect();
    var arch = document.getElementById('architecture').getBoundingClientRect();
    var ind = document.getElementById('industries').getBoundingClientRect();
    var sbox = document.getElementById('sandbox').getBoundingClientRect();
    var mock = document.querySelector('.mock').getBoundingClientRect();
    var comp = document.querySelector('.comp-table').getBoundingClientRect();
    var ctaEl = document.querySelector('.hdr-actions .btn-brass');
    var ctaBtn = ctaEl ? ctaEl.getBoundingClientRect() : { right: 0 };
    var portalCard = document.querySelector('.portal-form-card').getBoundingClientRect();
    var leadName = document.getElementById('lead-name').getBoundingClientRect();
    var leadCompany = document.getElementById('lead-company').getBoundingClientRect();
    var leadIndustry = document.getElementById('lead-industry').getBoundingClientRect();
    var leadBudget = document.getElementById('lead-budget').getBoundingClientRect();
    var heroSec = document.querySelector('.hero-section').getBoundingClientRect();
    var heroLeft = document.querySelector('.hero-grid > div:first-child').getBoundingClientRect();
    var heroCard = document.querySelector('.hero-ledger-card').getBoundingClientRect();
    var indTabs = document.querySelector('.ind-tabs').getBoundingClientRect();
    var indDetail = document.querySelector('.ind-detail').getBoundingClientRect();
    var kpis = document.querySelectorAll('.hlc-kpi');
    var kpi1 = kpis[0].getBoundingClientRect();
    var kpi2 = kpis[1].getBoundingClientRect();
    var kpi1Strong = kpis[0].querySelector('strong').getBoundingClientRect();
    var kpi2Strong = kpis[1].querySelector('strong').getBoundingClientRect();
    var hlcSvgCount = document.querySelectorAll('.hlc-brand svg').length;
    var activeMain = Array.from(document.querySelectorAll('#main-nav a.active')).map(function(a){ return a.getAttribute('href'); });
    var activeMob = Array.from(document.querySelectorAll('#mobile-sec-nav a.active')).map(function(a){ return a.getAttribute('href'); });
    var activeDock = Array.from(document.querySelectorAll('.mobile-dock a.active')).map(function(a){ return a.getAttribute('href'); });
    var effW = window.innerWidth < 600 ? 390 : window.innerWidth;
    var overflows = [];
    if (effW === 390) {
      document.querySelectorAll('*').forEach(function(el) {
        if (el.closest('#mobile-sec-nav') || el.closest('.rail nav')) return;
        var r = el.getBoundingClientRect();
        if (r.right > 390.5) {
          overflows.push((el.tagName + '.' + (el.className || '') + '#' + (el.id || '')) + ':' + Math.round(r.right));
        }
      });
    }
    var cardOverflows = [];
    document.querySelectorAll('.portal-form-card, .portal-direct-card, .configurator-card, .price-card, .roi-box, .hero-ledger-card, .ind-detail').forEach(function(card) {
      var cr = card.getBoundingClientRect();
      if (cr.width === 0) return;
      card.querySelectorAll('*').forEach(function(child) {
        var r = child.getBoundingClientRect();
        if (r.width > 0 && (r.right > cr.right + 1 || r.left < cr.left - 1)) {
          cardOverflows.push((child.tagName + '#' + (child.id || '') + '.' + (child.className || '')) + ' (' + Math.round(r.right) + ' > ' + Math.round(cr.right) + ')');
        }
      });
    });
    var out = {
      vw: effW,
      vh: window.innerHeight,
      scrollW: document.body.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
      scrollY: Math.round(window.scrollY),
      hdrBottom: Math.round(hdr.bottom),
      archBottom: Math.round(arch.bottom),
      indTop: Math.round(ind.top),
      sboxTop: Math.round(sbox.top),
      mockWidth: Math.round(mock.width),
      compWidth: Math.round(comp.width),
      ctaRight: Math.round(ctaBtn.right),
      portalCardRight: Math.round(portalCard.right),
      leadNameW: Math.round(leadName.width),
      leadCompanyW: Math.round(leadCompany.width),
      leadIndustryW: Math.round(leadIndustry.width),
      leadBudgetW: Math.round(leadBudget.width),
      leadBudgetRight: Math.round(leadBudget.right),
      heroSecH: Math.round(heroSec.height),
      heroLeftH: Math.round(heroLeft.height),
      heroCardH: Math.round(heroCard.height),
      indTabsH: Math.round(indTabs.height),
      indDetailH: Math.round(indDetail.height),
      kpi1W: Math.round(kpi1.width),
      kpi2W: Math.round(kpi2.width),
      kpi1StrongTop: Math.round(kpi1Strong.top),
      kpi2StrongTop: Math.round(kpi2Strong.top),
      hlcSvgCount: hlcSvgCount,
      activeMain: activeMain,
      activeMob: activeMob,
      activeDock: activeDock,
      overflows: overflows.slice(0, 12),
      cardOverflows: cardOverflows.slice(0, 12)
    };

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

    // 4. Click a Sandbox watchdog alert button (View VINs on Trading)
    var alertBtn = document.querySelector('#sandbox-mock [data-sbox-act]');
    if (alertBtn) alertBtn.click();
    var drawerTextAfterAlert = document.getElementById('ai-drawer-thread').textContent;

    // 5. Click a follow-up chip
    var followChip = document.querySelector('#ai-drawer-thread .ai-followup-btn');
    if (followChip) followChip.click();
    var countBeforeReset = document.querySelectorAll('#ai-drawer-thread .ai-msg-bot').length;

    // 6. Click Reset in drawer
    document.getElementById('ai-drawer-reset').click();
    var botAfterReset = document.querySelectorAll('#ai-drawer-thread .ai-msg-bot').length;
    var userAfterReset = document.querySelectorAll('#ai-drawer-thread .ai-msg-user').length;
    var inlineUserAfterReset = document.querySelectorAll('#ai-inline-thread .ai-msg-user').length;
    var resetDrawerText = document.getElementById('ai-drawer-thread').textContent;

    out.aiTest = {
      initDrawerUsers: initDrawerUsers,
      hasInitWelcome: initDrawerText.indexOf('Welcome. I am ISABI') !== -1,
      hasThinkingBubble: hasThinkingBubble,
      hasHelloReply: helloText.indexOf('Welcome · Native System Intelligence') !== -1 && helloText.indexOf('MULTI-ENTITY ENTERPRISE GROUP') === -1,
      hasHowAreYouReply: howAreYouText.indexOf('I am doing great, thank you for asking!') !== -1 && howAreYouText.indexOf('Custom Architectural Guidance') === -1,
      hasArabicRtl: arabicHtml.indexOf('dir="rtl"') !== -1 && arabicHtml.indexOf('الذكاء التشغيلي والمالي') !== -1,
      hasFrenchReply: frenchText.indexOf('Bienvenue') !== -1 || frenchText.indexOf('Investissement Transparent') !== -1,
      afterInlineCount: afterInlineCount,
      hasMfgBlueprint: afterInlineText.indexOf('Industry Blueprint 03') !== -1,
      scopeBarTxt: scopeBarTxt,
      hasEurQtdBriefing: drawerTextAfterSbox.indexOf('Automotive & Heavy Equipment Trading') !== -1 && drawerTextAfterSbox.indexOf('EUR') !== -1 && drawerTextAfterSbox.indexOf('QTD') !== -1,
      hasAlertDrilldown: drawerTextAfterAlert.indexOf('Dealership Fleet Receivables & SOA Dispatch') !== -1,
      countBeforeReset: countBeforeReset,
      botAfterReset: botAfterReset,
      userAfterReset: userAfterReset,
      inlineUserAfterReset: inlineUserAfterReset,
      hasResetWelcome: resetDrawerText.indexOf('Welcome. I am ISABI') !== -1
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

        # Run Desktop test (1366x768) at #industries
        res_desk = subprocess.run(
            [EDGE, '--headless=new', f'--user-data-dir={ud}', '--window-size=1366,768', '--dump-dom', diag_url + '#industries'],
            capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=25
        )
        m_desk = html.unescape(res_desk.stdout.split('<pre id="diag-json">')[1].split('</pre>')[0])
        d_desk = json.loads(m_desk)
        print('[DESK 1366x768]', json.dumps(d_desk))

        # Run Mobile test (390x844) at #industries
        res_mob = subprocess.run(
            [EDGE, '--headless=new', f'--user-data-dir={ud}', '--window-size=390,844', '--dump-dom', diag_url + '#industries'],
            capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=25
        )
        m_mob = html.unescape(res_mob.stdout.split('<pre id="diag-json">')[1].split('</pre>')[0])
        d_mob = json.loads(m_mob)
        print('[MOB 390x844]', json.dumps(d_mob))

        if os.path.exists(diag_html):
            os.remove(diag_html)

        # Assertions
        assert d_desk['activeMain'] == ['#industries'], f"Expected activeMain=['#industries'], got {d_desk['activeMain']}"
        assert d_desk['archBottom'] <= d_desk['hdrBottom'] + 1, f"Previous section bled through! archBottom={d_desk['archBottom']} > hdrBottom={d_desk['hdrBottom']}"
        assert abs(d_desk['indTop'] - d_desk['hdrBottom']) <= 4, f"Section top not aligned to header bottom! indTop={d_desk['indTop']}, hdrBottom={d_desk['hdrBottom']}"
        assert d_desk['ctaRight'] <= d_desk['vw'], f"Header CTA clipped! ctaRight={d_desk['ctaRight']} > vw={d_desk['vw']}"
        assert d_desk['scrollW'] <= d_desk['vw'], f"Desktop horizontal overflow! scrollW={d_desk['scrollW']} > vw={d_desk['vw']}"
        assert abs(d_desk['leadIndustryW'] - d_desk['leadNameW']) <= 1, f"lead-industry width ({d_desk['leadIndustryW']}) != lead-name width ({d_desk['leadNameW']})"
        assert abs(d_desk['leadBudgetW'] - d_desk['leadCompanyW']) <= 1, f"lead-budget width ({d_desk['leadBudgetW']}) != lead-company width ({d_desk['leadCompanyW']})"
        assert d_desk['leadBudgetRight'] <= d_desk['portalCardRight'] - 24, f"lead-budget overflows portal card! {d_desk['leadBudgetRight']} vs {d_desk['portalCardRight']}"
        assert d_desk['cardOverflows'] == [], f"Desktop card overflows detected: {d_desk['cardOverflows']}"
        assert d_desk['hlcSvgCount'] == 1, f"Expected 1 SVG in .hlc-brand (no nested SVG), got {d_desk['hlcSvgCount']}"
        assert d_desk['heroSecH'] >= d_desk['vh'] - d_desk['hdrBottom'], f"Hero section too short ({d_desk['heroSecH']} < {d_desk['vh'] - d_desk['hdrBottom']}): second section bleeds into first viewport!"
        assert abs(d_desk['heroLeftH'] - d_desk['heroCardH']) <= 2, f"Desktop hero column heights mismatch: {d_desk['heroLeftH']} vs {d_desk['heroCardH']}"
        assert abs(d_desk['indTabsH'] - d_desk['indDetailH']) <= 2, f"Desktop industry tabs/detail heights mismatch: {d_desk['indTabsH']} vs {d_desk['indDetailH']}"

        assert d_mob['scrollW'] <= d_mob['vw'], f"Mobile horizontal overflow! scrollW={d_mob['scrollW']} > vw={d_mob['vw']}"
        assert d_mob['mockWidth'] <= d_mob['vw'], f"Mobile sandbox .mock overflows! mockWidth={d_mob['mockWidth']} > vw={d_mob['vw']}"
        assert d_mob['compWidth'] <= d_mob['vw'], f"Mobile .comp-table overflows! compWidth={d_mob['compWidth']} > vw={d_mob['vw']}"
        assert abs(d_mob['kpi1W'] - d_mob['kpi2W']) <= 2, f"Mobile .hlc-kpi width mismatch: {d_mob['kpi1W']} vs {d_mob['kpi2W']}"
        assert abs(d_mob['kpi1StrongTop'] - d_mob['kpi2StrongTop']) <= 2, f"Mobile .hlc-kpi strong baseline mismatch: {d_mob['kpi1StrongTop']} vs {d_mob['kpi2StrongTop']}"
        assert d_mob['activeMob'] == ['#industries'], f"Mobile section nav active mismatch: {d_mob['activeMob']}"
        assert d_mob['activeDock'] == ['#industries'], f"Mobile bottom dock active mismatch: {d_mob['activeDock']}"
        assert d_mob['cardOverflows'] == [], f"Mobile card overflows detected: {d_mob['cardOverflows']}"

        ai = d_desk['aiTest']
        assert ai['initDrawerUsers'] == 0 and ai['hasInitWelcome'] is True, f"Drawer did not start with clean welcome state: {ai}"
        assert ai['hasThinkingBubble'] is True, "Async submit did not render 'ISABI is analyzing...' thinking indicator"
        assert ai['hasHelloReply'] is True, "Greeting 'Hello' did not return conversational reply without repeating initial table"
        assert ai['hasHowAreYouReply'] is True, "'how are you' did not return conversational status reply"
        assert ai['hasArabicRtl'] is True, "Arabic query did not render RTL Arabic reply"
        assert ai['hasFrenchReply'] is True, "French query did not render French reply"
        assert ai['afterInlineCount'] == 5, f"Expected 5 messages after multilingual + blueprint submits, got {ai['afterInlineCount']}"
        assert ai['hasMfgBlueprint'] is True, "Inline submit did not render Concrete & Manufacturing blueprint"
        assert ai['scopeBarTxt'] == 'Auto & Equipment Trading · EUR · QTD', f"Unexpected scopeBarTxt: {ai['scopeBarTxt']}"
        assert ai['hasEurQtdBriefing'] is True, "Sandbox Ask ISABI click did not render EUR QTD briefing"
        assert ai['hasAlertDrilldown'] is True, "Sandbox alert button click did not render alert drilldown"
        assert ai['countBeforeReset'] == 8, f"Expected 8 messages in thread before reset, got {ai['countBeforeReset']}"
        assert ai['botAfterReset'] == 1 and ai['userAfterReset'] == 0 and ai['inlineUserAfterReset'] == 0 and ai['hasResetWelcome'] is True, f"Reset did not restore clean welcome state: {ai}"

        # 3. Capture fresh screenshot of #portal at 1366x768
        os.makedirs(ART_DIR, exist_ok=True)
        shot_desk_portal = os.path.join(ART_DIR, 'isabi_desk_portal_fixed.png')
        shot_html = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '_shot_portal.html')
        shot_script = """
<script>
window.addEventListener('load', function() {
  var p = document.getElementById('portal');
  var h = document.querySelector('.site-header');
  if (p && h) {
    var offset = p.offsetTop - h.offsetHeight;
    document.querySelector('main').style.marginTop = (-offset) + 'px';
    window.scrollTo(0, 0);
  }
});
</script>
"""
        with open(shot_html, 'w', encoding='utf-8') as f:
            f.write(base_html.replace('</body>', shot_script + '</body>'))
        shot_url = 'file:///' + shot_html.replace('\\', '/')
        subprocess.run([EDGE, '--headless=new', '--disable-gpu', f'--user-data-dir={ud}', '--window-size=1366,768', f'--screenshot={shot_desk_portal}', shot_url], timeout=25)
        if os.path.exists(shot_html):
            os.remove(shot_html)
        print('ALL GEOMETRY & ACTIVE-NAV ASSERTIONS PASSED + PORTAL SCREENSHOT SAVED.')
    finally:
        shutil.rmtree(ud, ignore_errors=True)


if __name__ == '__main__':
    run_dom_and_screenshots()
