import subprocess
import tempfile
import shutil
import sys

edge = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
url = 'file:///C:/Users/HusseinBdeir/bhfirms/isabi/index.html'
ud = tempfile.mkdtemp(prefix='isabi_edge_')

try:
    res = subprocess.run(
        [edge, '--headless=new', f'--user-data-dir={ud}', '--window-size=1440,900', '--dump-dom', url],
        capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=20
    )
    dom = res.stdout
    checks = [
        ('Hero title', 'The Books Close on'),
        ('Rendered Industry Tab', 'Hospitality, Resorts'),
        ('Rendered Industry Modules', 'Multi-Property Business Unit Isolation'),
        ('Rendered Sandbox Chart', 'class="chart"'),
        ('Rendered Sandbox Ledger Total', 'Total Audited Batch'),
        ('Rendered Ask ISABI Thread', 'Overdue Receivables Audit'),
        ('Rendered ROI Output', '1,615 hrs/yr'),
        ('Rendered Configurator Total', '$12,300 to $15,000'),
        ('WhatsApp Number', '96170444955'),
        ('Email Address', 'hbdeir16@gmail.com'),
    ]
    failed = 0
    for name, needle in checks:
        ok = needle in dom
        print(f'{name}: {"PASS" if ok else "FAIL"}')
        if not ok:
            failed += 1
    if failed:
        sys.exit(1)

    shot_desk = r'C:\Users\HusseinBdeir\.gemini\antigravity\brain\3ff9f78f-157a-4a92-96b6-3de1d96b436e\isabi_desktop_hero.png'
    shot_mob = r'C:\Users\HusseinBdeir\.gemini\antigravity\brain\3ff9f78f-157a-4a92-96b6-3de1d96b436e\isabi_mobile_hero.png'
    subprocess.run([edge, '--headless=new', f'--user-data-dir={ud}', '--window-size=1440,950', f'--screenshot={shot_desk}', url], timeout=20)
    subprocess.run([edge, '--headless=new', f'--user-data-dir={ud}', '--window-size=390,844', f'--screenshot={shot_mob}', url], timeout=20)
    print("Screenshots saved.")
finally:
    shutil.rmtree(ud, ignore_errors=True)
