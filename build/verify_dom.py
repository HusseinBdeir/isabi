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
ART_DIR = r'C:\Users\HusseinBdeir\.gemini\antigravity\brain\3ff9f78f-157a-4a92-96b6-3de1d96b436e'


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
        ]
        failed = 0
        for name, needle in checks:
            ok = needle in dom
            print(f'[DOM] {name}: {"PASS" if ok else "FAIL"}')
            if not ok:
                failed += 1
        if failed:
            sys.exit(1)

        # 2. Create a temporary test harness HTML wrapper or inject diagnostic badge via URL hash to verify geometry on Desktop & Mobile
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
    var activeMain = Array.from(document.querySelectorAll('#main-nav a.active')).map(function(a){ return a.getAttribute('href'); });
    var activeMob = Array.from(document.querySelectorAll('#mobile-sec-nav a.active')).map(function(a){ return a.getAttribute('href'); });
    var activeDock = Array.from(document.querySelectorAll('.mobile-dock a.active')).map(function(a){ return a.getAttribute('href'); });
    var secHeights = {};
    ['architecture','industries','sandbox','ai-platform','ingenuity','pricing','portal'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) secHeights[id] = Math.round(el.getBoundingClientRect().height);
    });
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
      activeMain: activeMain,
      activeMob: activeMob,
      activeDock: activeDock,
      secHeights: secHeights,
      overflows: overflows.slice(0, 12)
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

        # Run Desktop test (1440x900) at #industries
        res_desk = subprocess.run(
            [EDGE, '--headless=new', f'--user-data-dir={ud}', '--window-size=1440,900', '--dump-dom', diag_url + '#industries'],
            capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=25
        )
        m_desk = res_desk.stdout.split('<pre id="diag-json">')[1].split('</pre>')[0]
        d_desk = json.loads(m_desk)
        print('[DESK 1440x900]', json.dumps(d_desk))

        # Run Mobile test (390x844) at #industries
        res_mob = subprocess.run(
            [EDGE, '--headless=new', f'--user-data-dir={ud}', '--window-size=390,844', '--dump-dom', diag_url + '#industries'],
            capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=25
        )
        m_mob = res_mob.stdout.split('<pre id="diag-json">')[1].split('</pre>')[0]
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

        assert d_mob['scrollW'] <= d_mob['vw'], f"Mobile horizontal overflow! scrollW={d_mob['scrollW']} > vw={d_mob['vw']}"
        assert d_mob['mockWidth'] <= d_mob['vw'], f"Mobile sandbox .mock overflows! mockWidth={d_mob['mockWidth']} > vw={d_mob['vw']}"
        assert d_mob['compWidth'] <= d_mob['vw'], f"Mobile .comp-table overflows! compWidth={d_mob['compWidth']} > vw={d_mob['vw']}"
        assert d_mob['activeMob'] == ['#industries'], f"Mobile section nav active mismatch: {d_mob['activeMob']}"
        assert d_mob['activeDock'] == ['#industries'], f"Mobile bottom dock active mismatch: {d_mob['activeDock']}"

        # 3. Capture fresh screenshots
        shot_desk_ind = os.path.join(ART_DIR, 'isabi_desk_industries_fixed.png')
        shot_mob_hero = os.path.join(ART_DIR, 'isabi_mob_hero_fixed.png')
        shot_mob_ind = os.path.join(ART_DIR, 'isabi_mob_industries_fixed.png')
        shot_mob_sbox = os.path.join(ART_DIR, 'isabi_mob_sandbox_fixed.png')

        subprocess.run([EDGE, '--headless=new', f'--user-data-dir={ud}', '--window-size=1440,900', f'--screenshot={shot_desk_ind}', URL + '#industries'], timeout=25)
        subprocess.run([EDGE, '--headless=new', f'--user-data-dir={ud}', '--window-size=390,844', f'--screenshot={shot_mob_hero}', URL], timeout=25)
        subprocess.run([EDGE, '--headless=new', f'--user-data-dir={ud}', '--window-size=390,844', f'--screenshot={shot_mob_ind}', URL + '#industries'], timeout=25)
        subprocess.run([EDGE, '--headless=new', f'--user-data-dir={ud}', '--window-size=390,844', f'--screenshot={shot_mob_sbox}', URL + '#sandbox'], timeout=25)
        print('ALL GEOMETRY & ACTIVE-NAV ASSERTIONS PASSED + SCREENSHOTS SAVED.')
    finally:
        shutil.rmtree(ud, ignore_errors=True)


if __name__ == '__main__':
    run_dom_and_screenshots()
