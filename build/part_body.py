# HTML body structure for ISABI Systems PWA

BADGE_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" class="brand-badge" role="img" aria-label="ISABI Systems Badge"><rect width="120" height="120" rx="26" fill="#0B1730"/><g transform="translate(39.52,77.62) scale(0.74)"><g fill="#F4F2EE"><path transform="translate(-8.45,0)" d="M8.45 0V-68.75H28.81V0Z"/><path transform="translate(-10.45,0)" d="M45.75 0V-68.75H66.11V0Z"/></g><g fill="#D9A54A"><rect x="0" y="9.5" width="55.66" height="3.4"/><rect x="0" y="17.5" width="55.66" height="3.4"/></g></g></svg>"""

MARK_ON_DARK_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="-9.5 -78.8 74.66 109.7" aria-hidden="true"><g fill="#F4F2EE"><path transform="translate(-8.45,0)" d="M8.45 0V-68.75H28.81V0Z"/><path transform="translate(-10.45,0)" d="M45.75 0V-68.75H66.11V0Z"/></g><g fill="#D9A54A"><rect x="0" y="9.5" width="55.66" height="3.4"/><rect x="0" y="17.5" width="55.66" height="3.4"/></g></svg>"""

WORDMARK_HEADER_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="-14 -82.8 346.86 160.76" class="brand-wordmark" role="img" aria-label="ISABI Systems"><g fill="currentColor"><path transform="translate(-8.45,0)" d="M8.45 0V-68.75H28.81V0Z"/><path transform="translate(-12.95,0)" d="M82.46 1.2Q74.06 1.2 66.77 0.2Q59.48 -0.81 54 -3.31Q48.52 -5.82 45.43 -10.3Q42.33 -14.78 42.33 -21.68Q42.33 -21.88 42.33 -22.21Q42.33 -22.53 42.43 -22.84H62.38Q62.28 -22.44 62.25 -22Q62.23 -21.56 62.23 -21.08Q62.23 -18.03 64.55 -16.27Q66.87 -14.51 71.11 -13.8Q75.35 -13.09 80.96 -13.09Q83.32 -13.09 85.78 -13.23Q88.24 -13.38 90.53 -13.74Q92.82 -14.1 94.65 -14.79Q96.47 -15.47 97.56 -16.55Q98.65 -17.63 98.65 -19.15Q98.65 -21.32 96.35 -22.57Q94.05 -23.82 90.14 -24.58Q86.22 -25.33 81.35 -25.92Q76.49 -26.52 71.28 -27.34Q66.06 -28.16 61.2 -29.61Q56.33 -31.06 52.41 -33.47Q48.5 -35.88 46.2 -39.66Q43.9 -43.45 43.9 -48.91Q43.9 -54.37 46.67 -58.34Q49.43 -62.31 54.42 -64.89Q59.41 -67.46 66.2 -68.71Q73 -69.95 81.01 -69.95Q89.17 -69.95 95.82 -68.69Q102.46 -67.43 107.23 -64.88Q112 -62.33 114.57 -58.47Q117.13 -54.6 117.13 -49.39V-48.01H97.39V-48.82Q97.39 -50.91 95.59 -52.53Q93.78 -54.15 90.34 -55.12Q86.89 -56.1 81.96 -56.1Q76.07 -56.1 72.27 -55.36Q68.48 -54.62 66.68 -53.34Q64.88 -52.07 64.88 -50.55Q64.88 -48.52 67.17 -47.33Q69.47 -46.15 73.39 -45.47Q77.3 -44.78 82.17 -44.19Q87.03 -43.6 92.25 -42.78Q97.46 -41.96 102.32 -40.59Q107.19 -39.21 111.11 -36.84Q115.03 -34.46 117.32 -30.83Q119.62 -27.2 119.62 -21.89Q119.62 -13.62 114.83 -8.52Q110.04 -3.43 101.65 -1.11Q93.26 1.2 82.46 1.2Z"/><path transform="translate(-12.35,0)" d="M125.53 0 159.33 -68.75H181.97L215.77 0H193.74L188.55 -11.02H151.65L146.51 0ZM158.47 -25.93H181.73L175.47 -39.9Q175.08 -40.84 174.37 -42.55Q173.67 -44.27 172.91 -46.22Q172.15 -48.17 171.51 -49.85Q170.87 -51.52 170.55 -52.33H169.8Q169.07 -50.49 168.11 -48.11Q167.15 -45.73 166.26 -43.49Q165.37 -41.25 164.73 -39.85Z"/><path transform="translate(-14.35,0)" d="M225.75 0V-68.75H282.27Q287.86 -68.75 292.39 -66.6Q296.91 -64.45 299.54 -60.65Q302.18 -56.85 302.18 -51.81Q302.18 -47.31 300.57 -44.11Q298.96 -40.91 296.25 -38.92Q293.54 -36.94 290.23 -35.95V-35.55Q294.09 -34.75 297.19 -32.66Q300.3 -30.57 302.11 -27.09Q303.92 -23.62 303.92 -18.57Q303.92 -12.66 301.07 -8.52Q298.22 -4.37 293.39 -2.19Q288.55 0 282.6 0ZM246.11 -14.49H275.8Q279 -14.49 281.02 -16.24Q283.05 -17.98 283.05 -21.59Q283.05 -23.49 282.17 -25.01Q281.3 -26.53 279.61 -27.37Q277.93 -28.21 275.53 -28.21H246.11ZM246.11 -41.59H274.11Q276.44 -41.59 278.03 -42.43Q279.63 -43.27 280.49 -44.8Q281.35 -46.33 281.35 -48.4Q281.35 -51.33 279.38 -53.04Q277.4 -54.75 274.39 -54.75H246.11Z"/><path transform="translate(-18.65,0)" d="M317.15 0V-68.75H337.51V0Z"/></g><g fill="var(--brass)"><rect x="0" y="9.5" width="318.86" height="3.4"/><rect x="0" y="17.5" width="318.86" height="3.4"/></g><g fill="currentColor" transform="translate(0,62.46) scale(0.42)"><path transform="translate(-5.17,0)" d="M38 1.2Q31.29 1.2 25.32 0.09Q19.36 -1.01 14.83 -3.57Q10.3 -6.12 7.74 -10.29Q5.17 -14.45 5.17 -20.57Q5.17 -20.98 5.2 -21.44Q5.22 -21.89 5.27 -22.14H19.28Q19.24 -21.85 19.19 -21.3Q19.14 -20.75 19.14 -20.2Q19.14 -17 21.42 -14.84Q23.7 -12.68 27.98 -11.6Q32.25 -10.52 38.01 -10.52Q41.12 -10.52 43.86 -10.85Q46.6 -11.18 48.86 -11.81Q51.12 -12.44 52.78 -13.41Q54.43 -14.39 55.32 -15.72Q56.2 -17.04 56.2 -18.68Q56.2 -21.44 54.14 -23.17Q52.08 -24.9 48.57 -26.06Q45.06 -27.22 40.66 -28.1Q36.26 -28.98 31.59 -29.96Q26.91 -30.94 22.51 -32.44Q18.11 -33.94 14.6 -36.19Q11.1 -38.44 9.03 -41.93Q6.97 -45.43 6.97 -50.42Q6.97 -55.22 9.14 -58.86Q11.31 -62.51 15.42 -64.96Q19.53 -67.4 25.27 -68.63Q31.02 -69.85 38.16 -69.85Q45.15 -69.85 50.75 -68.58Q56.34 -67.31 60.28 -64.79Q216.22 -62.26 66.3 -58.56Q68.37 -54.86 68.37 -50V-48.6H54.56V-49.75Q54.56 -52.31 52.5 -54.17Q50.44 -56.02 46.83 -57.08Q515.82 -58.13 38.54 -58.13Q32.75 -58.13 28.92 -57.25Q25.1 -56.38 23.21 -54.78Q21.32 -53.18 21.32 -51.02Q21.32 -48.61 23.38 -47.06Q25.44 -45.5 28.95 -44.47Q32.46 -43.44 36.86 -42.58Q41.26 -41.72 45.93 -40.69Q50.61 -39.66 55.01 -38.21Q59.41 -36.76 62.92 -34.46Q66.42 -32.16 68.49 -28.74Q70.55 -25.32 70.55 -20.44Q70.55 -12.59 66.39 -7.82Q62.24 -3.05 54.89 -0.92Q47.55 1.2 38 1.2Z"/><path transform="translate(32.83,0)" d="M106.74 0V-27.85L76.88 -68.65H93.47L113.82 -39.79H114.56L134.96 -68.65H150.65L120.8 -27.85V0Z"/><path transform="translate(70.83,0)" d="M190 1.2Q183.29 1.2 177.32 0.09Q171.36 -1.01 166.83 -3.57Q162.3 -6.12 159.74 -10.29Q157.17 -14.45 157.17 -20.57Q157.17 -20.98 157.2 -21.44Q157.22 -21.89 157.27 -22.14H171.28Q171.24 -21.85 171.19 -21.3Q171.14 -20.75 171.14 -20.2Q171.14 -17 173.42 -14.84Q175.7 -12.68 179.98 -11.6Q184.25 -10.52 190.01 -10.52Q193.12 -10.52 195.86 -10.85Q198.6 -11.18 200.86 -11.81Q203.12 -12.44 204.78 -13.41Q206.43 -14.39 207.32 -15.72Q208.2 -17.04 208.2 -18.68Q208.2 -21.44 206.14 -23.17Q204.08 -24.9 200.57 -26.06Q197.06 -27.22 192.66 -28.1Q188.26 -28.98 183.59 -29.96Q178.91 -30.94 174.51 -32.44Q170.11 -33.94 166.6 -36.19Q163.1 -38.44 161.03 -41.93Q158.97 -45.43 158.97 -50.42Q158.97 -55.22 161.14 -58.86Q163.31 -62.51 167.42 -64.96Q171.53 -67.4 177.27 -68.63Q183.02 -69.85 190.16 -69.85Q197.15 -69.85 202.75 -68.58Q208.34 -67.31 212.28 -64.79Q216.22 -62.26 218.3 -58.56Q220.37 -54.86 220.37 -50V-48.6H206.56V-49.75Q206.56 -52.31 204.5 -54.17Q202.44 -56.02 198.83 -57.08Q195.22 -58.13 190.54 -58.13Q184.75 -58.13 180.92 -57.25Q177.1 -56.38 175.21 -54.78Q173.32 -53.18 173.32 -51.02Q173.32 -48.61 175.38 -47.06Q177.44 -45.5 180.95 -44.47Q184.46 -43.44 188.86 -42.58Q193.26 -41.72 197.93 -40.69Q202.61 -39.66 207.01 -38.21Q211.41 -36.76 214.92 -34.46Q218.42 -32.16 220.49 -28.74Q222.55 -25.32 222.55 -20.44Q222.55 -12.59 218.39 -7.82Q214.24 -3.05 206.89 -0.92Q199.55 1.2 190 1.2Z"/><path transform="translate(108.83,0)" d="M256.08 0V-56.39H230.05V-68.65H296.21V-56.39H270.13V0Z"/><path transform="translate(146.83,0)" d="M307.41 0V-68.65H368.59V-56.78H321.46V-40.94H363.42V-29.07H321.46V-11.87H369.28V0Z"/><path transform="translate(184.83,0)" d="M383.91 0V-68.65H405.9L419.05 -31.84Q419.7 -30.03 420.56 -27.36Q421.42 -24.7 422.31 -21.99Q423.2 -19.28 423.83 -17.15H424.58Q425.12 -19.03 425.9 -21.62Q426.69 -24.2 427.55 -26.92Q428.41 -29.64 429.16 -31.8L442.31 -68.65H463.96V0H449.9V-38.2Q449.9 -41.41 449.98 -44.81Q450.05 -48.21 450.18 -50.91Q450.3 -53.61 450.35 -54.64H449.55Q449.21 -53.46 448.41 -50.89Q447.61 -48.32 446.76 -45.49Q445.9 -42.66 445.2 -40.6L430.35 0H417.01L402.11 -40.54Q401.36 -42.6 400.57 -45.16Q399.77 -47.73 399.07 -50.28Q398.36 -52.82 397.81 -54.64H397.01Q397.11 -52.66 397.19 -49.78Q397.26 -46.89 397.34 -43.86Q397.42 -40.82 397.42 -38.2V0Z"/><path transform="translate(222.83,0)" d="M510.6 1.2Q503.89 1.2 497.92 0.09Q491.96 -1.01 487.43 -3.57Q482.9 -6.12 480.34 -10.29Q477.77 -14.45 477.77 -20.57Q477.77 -20.98 477.8 -21.44Q477.82 -21.89 477.87 -22.14H491.88Q491.84 -21.85 491.79 -21.3Q491.74 -20.75 491.74 -20.2Q491.74 -17 494.02 -14.84Q496.3 -12.68 500.58 -11.6Q504.85 -10.52 510.61 -10.52Q513.72 -10.52 516.46 -10.85Q519.2 -11.18 521.46 -11.81Q523.72 -12.44 525.38 -13.41Q527.03 -14.39 527.92 -15.72Q528.8 -17.04 528.8 -18.68Q528.8 -21.44 526.74 -23.17Q524.68 -24.9 521.17 -26.06Q517.66 -27.22 513.26 -28.1Q508.86 -28.98 504.19 -29.96Q499.51 -30.94 495.11 -32.44Q490.71 -33.94 487.2 -36.19Q483.7 -38.44 481.63 -41.93Q479.57 -45.43 479.57 -50.42Q479.57 -55.22 481.74 -58.86Q483.91 -62.51 488.02 -64.96Q492.13 -67.4 497.87 -68.63Q503.62 -69.85 510.76 -69.85Q517.75 -69.85 523.35 -68.58Q528.94 -67.31 532.88 -64.79Q536.82 -62.26 538.9 -58.56Q540.97 -54.86 540.97 -50V-48.6H527.16V-49.75Q527.16 -52.31 525.1 -54.17Q523.04 -56.02 519.43 -57.08Q515.82 -58.13 511.14 -58.13Q505.35 -58.13 501.52 -57.25Q497.7 -56.38 495.81 -54.78Q493.92 -53.18 493.92 -51.02Q493.92 -48.61 495.98 -47.06Q498.04 -45.5 501.55 -44.47Q505.06 -43.44 509.46 -42.58Q513.86 -41.72 518.53 -40.69Q523.21 -39.66 527.61 -38.21Q532.01 -36.76 535.52 -34.46Q539.02 -32.16 541.09 -28.74Q543.15 -25.32 543.15 -20.44Q543.15 -12.59 538.99 -7.82Q534.84 -3.05 527.49 -0.92Q520.15 1.2 510.6 1.2Z"/></g></svg>"""

BODY = f"""
<header class="site-header" id="site-header">
  <div class="hdr-inner">
    <a href="#top" class="brand-link" aria-label="ISABI Systems Home">
      {BADGE_SVG}
      {WORDMARK_HEADER_SVG}
    </a>
    <nav class="main-nav" id="main-nav" aria-label="Primary Navigation">
      <a href="#architecture" data-sec-link="architecture" class="active">Architecture</a>
      <a href="#industries" data-sec-link="industries">Industries</a>
      <a href="#sandbox" data-sec-link="sandbox">Live Sandbox</a>
      <a href="#microsoft-ai" data-sec-link="microsoft-ai">Microsoft &amp; AI</a>
      <a href="#ingenuity" data-sec-link="ingenuity">Ingenuity</a>
      <a href="#pricing" data-sec-link="pricing">Pricing</a>
      <a href="#portal" data-sec-link="portal">Contact</a>
    </nav>
    <div class="hdr-actions">
      <button type="button" class="ask-isabi-trigger" id="hdr-ask-btn" title="Open Ask ISABI System Intelligence">
        {MARK_ON_DARK_SVG}
        <span>Ask ISABI</span>
      </button>
      <button type="button" class="btn btn-ghost hide-sm" id="install-pwa-btn" hidden>Install</button>
      <button type="button" class="btn btn-ghost" id="theme-toggle-btn" aria-label="Switch Theme" title="Toggle Dark or Light Ledger Theme">Light</button>
      <a href="#portal" class="btn btn-brass hide-md">Book Consultation</a>
    </div>
  </div>
  <!-- Mobile & Tablet Section Jump Strip -->
  <nav class="mobile-sec-nav" id="mobile-sec-nav" aria-label="Section Navigation">
    <a href="#architecture" data-sec-link="architecture" class="active">01 Architecture</a>
    <a href="#industries" data-sec-link="industries">02 Industries</a>
    <a href="#sandbox" data-sec-link="sandbox">03 Live ERP</a>
    <a href="#microsoft-ai" data-sec-link="microsoft-ai">04 Microsoft &amp; AI</a>
    <a href="#ingenuity" data-sec-link="ingenuity">05 Ingenuity</a>
    <a href="#pricing" data-sec-link="pricing">06 Pricing</a>
    <a href="#portal" data-sec-link="portal">07 Contact</a>
  </nav>
</header>

<main id="top">
  <!-- HERO SECTION -->
  <section class="hero-section">
    <div class="wrap hero-grid">
      <div>
        <div class="eyebrow">ISABI Systems · Bespoke Enterprise Software &amp; Native AI</div>
        <h1 class="hero-title">The Books Close on <span class="brass-text">ISABI</span>.</h1>
        <p class="hero-lead">
          Off-the-shelf software forces your business into a generic template. ISABI Systems engineers custom ERP applications, financial ledgers, executive Power BI suites, and native AI assistants on the Microsoft Cloud, built around the exact way your industry operates.
        </p>
        <div class="hero-cta-row">
          <a href="#sandbox" class="btn btn-brass">Explore Live ERP Sandbox</a>
          <a href="#pricing" class="btn btn-outline">Configure Scope &amp; Pricing</a>
          <a href="https://wa.me/96170444955?text=Hello%20Hussein%2C%20I%20visited%20the%20ISABI%20Systems%20portal%20and%20would%20like%20to%20discuss%20building%20a%20custom%20system%20for%20our%20business." target="_blank" rel="noopener" class="btn btn-wa">WhatsApp Direct</a>
        </div>
        <div class="hero-trust-strip">
          <div class="trust-item">
            <b>Tailored to Your Operations</b>
            <span>Custom tables, approvals, Chart of Accounts, and multi-currency rules.</span>
          </div>
          <div class="trust-item">
            <b>Microsoft Cloud Foundation</b>
            <span>Dataverse, Power Apps, Power Automate, Power BI, and Entra ID security.</span>
          </div>
          <div class="trust-item">
            <b>Native AI Intelligence</b>
            <span>Ask ISABI queries your live ledger, stock, and receivables with zero hallucinations.</span>
          </div>
        </div>
      </div>

      <div class="hero-ledger-card" aria-label="Executive Ledger Preview">
        <div class="hlc-top">
          <div class="hlc-brand">
            <svg viewBox="-9.5 -78.8 74.66 109.7" height="20">{MARK_ON_DARK_SVG}</svg>
            <span>ISABI Executive Control · Multi-Entity Live State</span>
          </div>
          <span class="hlc-status"><i></i>All Books Balanced</span>
        </div>
        <div class="hlc-body">
          <div class="hlc-kpis">
            <div class="hlc-kpi">
              <small>Consolidated Revenue (MTD)</small>
              <strong class="num">$1,482,600</strong>
              <span>+11.4% vs prior period</span>
            </div>
            <div class="hlc-kpi">
              <small>Statutory Reconciliation</small>
              <strong class="num">100.0%</strong>
              <span>0 unallocated variances</span>
            </div>
          </div>
          <table class="hlc-table" aria-label="Live Industry Ledger Sample">
            <thead>
              <tr>
                <th>Operating Vertical</th>
                <th>Core Unit Tracked</th>
                <th class="r">Net Position</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><b>Hospitality &amp; Resorts</b></td>
                <td>Outlets, Cabanas, POS &amp; Partner Splits</td>
                <td class="r num">$418,200</td>
              </tr>
              <tr>
                <td><b>Automotive &amp; Heavy Trucks</b></td>
                <td>VIN Stock, Bonded Customs &amp; Parts</td>
                <td class="r num">$524,900</td>
              </tr>
              <tr>
                <td><b>Concrete &amp; Manufacturing</b></td>
                <td>Batch Plant m³, Fleet &amp; Silo Ledger</td>
                <td class="r num">$361,400</td>
              </tr>
              <tr>
                <td><b>Real Estate &amp; Insurance</b></td>
                <td>Lease Yields, Policies &amp; Commissions</td>
                <td class="r num">$178,100</td>
              </tr>
              <tr class="tot">
                <td colspan="2">Total Audited Group Position</td>
                <td class="r num">$1,482,600</td>
              </tr>
            </tbody>
          </table>
          <div class="hlc-ai-strip">
            <div><b>Ask ISABI:</b> "Every entry from the field till to the boardroom trial balance lives in one governed database."</div>
            <button type="button" class="btn btn-brass" style="padding:6px 12px;font-size:12.5px" data-open-ai="Explain how ISABI Systems customizes the ledger for my industry">Test AI</button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- PROOF METRICS BAND -->
  <section class="metrics-band" aria-label="Production Proof Metrics">
    <div class="wrap metrics-grid">
      <div class="metric-cell">
        <div class="m-val num">8<span>+</span></div>
        <div class="m-lbl">Live Industry Verticals</div>
        <div class="m-sub">Production-proven across Hospitality, Automotive, Manufacturing, Real Estate, Insurance, Holding Groups, POS, and Biometrics.</div>
      </div>
      <div class="metric-cell">
        <div class="m-val num">100<span>%</span></div>
        <div class="m-lbl">Custom Data Architecture</div>
        <div class="m-sub">Zero forced SaaS compromises. Every table, form, role, and financial statement is built around your exact business rules.</div>
      </div>
      <div class="metric-cell">
        <div class="m-val num">3 to 6<span> Wks</span></div>
        <div class="m-lbl">Code-First Deployment</div>
        <div class="m-sub">Proprietary schema and report compilers deliver in weeks what traditional ERP consultancies drag out for a year.</div>
      </div>
      <div class="metric-cell">
        <div class="m-val num">1<span> Source</span></div>
        <div class="m-lbl">Operational &amp; Financial Truth</div>
        <div class="m-sub">Dual-entry parallel run and automated reconciliation ensure your operational app and statutory books match to the cent.</div>
      </div>
    </div>
  </section>

  <!-- REQUIREMENT 1: HOW IT IS CUSTOMIZED & RELEVANT ACROSS INDUSTRIES -->
  <section class="sec" id="architecture">
    <div class="wrap">
      <div class="sec-head">
        <div class="eyebrow">01 · Bespoke Systems Engineering</div>
        <h2>Built Around Your Business Rules. Never Forced Into a Template.</h2>
        <p>
          Most companies outgrow spreadsheets only to discover that standard software forces an impossible choice: buy a rigid subscription tool that ignores how your industry actually works, or pay a legacy consultancy for an endless implementation. ISABI Systems was founded to deliver a third path.
        </p>
      </div>

      <!-- Mobile Switcher for Contrast Cards -->
      <div class="mob-seg-bar" role="tablist" aria-label="Compare Approaches">
        <button type="button" class="mob-seg-btn active" data-arch-tab="isabi">✓ The ISABI Standard</button>
        <button type="button" class="mob-seg-btn" data-arch-tab="saas">✕ vs Generic SaaS</button>
        <button type="button" class="mob-seg-btn" data-arch-tab="legacy">✕ vs Legacy ERP</button>
      </div>

      <div class="contrast-grid" id="arch-contrast-grid">
        <div class="contrast-card" data-arch-card="saas" data-mob-hide="1">
          <div class="cc-tag">The Generic SaaS Trap</div>
          <h3>Off-the-Shelf Cloud Subscriptions</h3>
          <p>Built for the lowest common denominator. The moment you have multiple entities, partner profit splits, bonded customs stock, or batch plant tickets, the software breaks.</p>
          <ul class="cc-list">
            <li><span>✕</span> Forces your staff to change proven operational workflows</li>
            <li><span>✕</span> Weak multi-currency, VAT, and regional Chart of Accounts support</li>
            <li><span>✕</span> Managers end up exporting back to Excel to get real answers</li>
            <li><span>✕</span> Per-user licensing penalties as your workforce scales</li>
          </ul>
        </div>

        <div class="contrast-card" data-arch-card="legacy" data-mob-hide="1">
          <div class="cc-tag">The Legacy ERP Trap</div>
          <h3>Traditional ERP Agencies</h3>
          <p>Bloated reseller teams where junior consultants pass tickets around without understanding either double-entry accounting or your physical operations.</p>
          <ul class="cc-list">
            <li><span>✕</span> 12 to 18 month timelines with runaway change-request billing</li>
            <li><span>✕</span> Clunky 1990s interfaces that field staff refuse to use</li>
            <li><span>✕</span> Reporting requires separate BI contractors and fragile exports</li>
            <li><span>✕</span> Zero native AI or modern mobile field applications</li>
          </ul>
        </div>

        <div class="contrast-card isabi-win" data-arch-card="isabi">
          <div class="cc-tag">The ISABI Standard</div>
          <h3>ISABI Systems Bespoke Architecture</h3>
          <p>A precision-engineered operational and financial system built directly on Microsoft enterprise infrastructure, tailored 100% to your entities, workflows, and ledger.</p>
          <ul class="cc-list">
            <li><span style="color:var(--brass)">✓</span> Modeled around your exact operational unit (VINs, m³, cabanas, policies, leases)</li>
            <li><span style="color:var(--brass)">✓</span> Strict Business Unit isolation for every subsidiary, property, or branch</li>
            <li><span style="color:var(--brass)">✓</span> Unified Power BI executive dashboards + printable Paginated (.rdl) statements</li>
            <li><span style="color:var(--brass)">✓</span> Embedded "Ask ISABI" AI + offline-capable companion PWAs (POS &amp; Kiosks)</li>
          </ul>
        </div>
      </div>

      <div class="layers-grid">
        <div class="layer-card">
          <div class="layer-num">Layer 01 · Domain Schema</div>
          <h4>Industry-Specific Tables &amp; Forms</h4>
          <p>We do not rename generic fields. We engineer custom Dataverse tables, client-side JavaScript form controllers, and automated document numbering specific to your daily operations.</p>
        </div>
        <div class="layer-card">
          <div class="layer-num">Layer 02 · Security &amp; Hierarchy</div>
          <h4>Multi-Company &amp; Role Isolation</h4>
          <p>Cashiers, plant dispatchers, showroom salespeople, and branch accountants see only their authorized Business Unit. Holding executives and partners command the consolidated group view.</p>
        </div>
        <div class="layer-card">
          <div class="layer-num">Layer 03 · Financial Integrity</div>
          <h4>Dual-Entry &amp; Statutory Bridge</h4>
          <p>Our systems stand on their own as a complete operational ledger while offering automated variance reconciliation against legacy statutory books so transitions carry zero risk.</p>
        </div>
        <div class="layer-card">
          <div class="layer-num">Layer 04 · Executive Output</div>
          <h4>Power BI, RDL &amp; Native AI</h4>
          <p>Every transaction feeds governed XMLA semantic models, one-click printable Statement of Accounts (.rdl), and the Ask ISABI intelligence engine.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- REQUIREMENT 2: EXAMPLES OF INDUSTRIES -->
  <section class="sec sec-alt" id="industries">
    <div class="wrap">
      <div class="sec-head">
        <div class="eyebrow">02 · Proven Industry Blueprints</div>
        <h2>Engineered for Complex, Real-World Industries.</h2>
        <p>
          Because ISABI Systems is architected from the ground up on a relational enterprise core, it adapts to any operational model. Select an industry below to inspect the custom modules, automated workflows, and financial outputs we build.
        </p>
      </div>

      <div class="ind-layout">
        <div class="ind-tabs" id="ind-tabs" role="tablist" aria-label="Industry Verticals">
          <!-- Populated dynamically by JS -->
        </div>
        <div class="ind-detail" id="ind-detail" role="tabpanel">
          <!-- Populated dynamically by JS -->
        </div>
      </div>
    </div>
  </section>

  <!-- REQUIREMENT 5 (CALIBER) & 1/2/3: INTERACTIVE LIVE ERP & POWER BI SANDBOX -->
  <section class="sec" id="sandbox">
    <div class="wrap">
      <div class="sec-head">
        <div class="eyebrow">03 · Interactive Product Sandbox</div>
        <h2>Experience the ISABI Command Center Live.</h2>
        <p>
          Test how an ISABI system looks and responds in production. Switch between six industry environments, toggle time periods or currencies, navigate the modules, inspect the monthly ledger chart, or trigger Ask ISABI directly inside the application.
        </p>
      </div>

      <div class="sandbox-controls">
        <div class="sbox-ind-bar" id="sbox-ind-bar" role="group" aria-label="Select Sandbox Industry">
          <!-- Populated by JS -->
        </div>
        <div class="sbox-theme-bar">
          <span>App Surface:</span>
          <button type="button" class="sbox-theme-btn active" data-sbox-t="auto">Match Page</button>
          <button type="button" class="sbox-theme-btn" data-sbox-t="light">Light Paper</button>
          <button type="button" class="sbox-theme-btn" data-sbox-t="dark">Dark Ink</button>
        </div>
      </div>

      <div class="sandbox-wrap" id="sandbox-wrap" data-sbox-theme="auto">
        <div class="mock" id="sandbox-mock">
          <!-- Populated dynamically by JS -->
        </div>
      </div>
    </div>
  </section>

  <!-- REQUIREMENT 3: AI INTEGRATED & MICROSOFT POWER PLATFORM -->
  <section class="sec sec-alt" id="microsoft-ai">
    <div class="wrap">
      <div class="sec-head">
        <div class="eyebrow">04 · Microsoft Enterprise Stack &amp; Native AI</div>
        <h2>Microsoft Infrastructure Under the Hood. Native AI on Top.</h2>
        <p>
          When you commission an ISABI system, you are not gambling on a fragile startup server. Your entire database, authentication, automation fleet, and analytics run inside your own Microsoft commercial tenant, enhanced by native system intelligence.
        </p>
      </div>

      <div class="ms-ai-grid">
        <div class="stack-cards">
          <div class="stack-card">
            <div class="stack-card-hdr">
              <h4>Microsoft Dataverse (Relational Core)</h4>
              <span>Database &amp; Security</span>
            </div>
            <p>ACID-compliant relational storage with row-level ownership, Business Unit hierarchy, full field-level audit history, automated nightly backups, and OData v4 Web API.</p>
          </div>

          <div class="stack-card">
            <div class="stack-card-hdr">
              <h4>Power Apps &amp; Offline PWAs</h4>
              <span>Operational Surfaces</span>
            </div>
            <p>Model-driven back-office ERP applications with custom JavaScript validation rules, paired with dedicated offline-first Progressive Web Apps for POS tills and biometric attendance kiosks.</p>
          </div>

          <div class="stack-card">
            <div class="stack-card-hdr">
              <h4>Power BI (XMLA) &amp; Paginated .RDL</h4>
              <span>Executive &amp; Statutory</span>
            </div>
            <p>Direct XMLA-published semantic models with Year, Month, Week, and Day period intelligence, plus pixel-perfect Paginated Reports (.rdl) for Statement of Accounts, P&amp;L, and Trial Balances.</p>
          </div>

          <div class="stack-card">
            <div class="stack-card-hdr">
              <h4>Power Automate, SharePoint &amp; Entra ID</h4>
              <span>Workflows &amp; Identity</span>
            </div>
            <p>Event-driven cloud flows for supervisor approvals, CV and document routing to SharePoint drives, scheduled report subscriptions, and Entra ID Multi-Factor Authentication.</p>
          </div>
        </div>

        <!-- Interactive Ask ISABI Simulator -->
        <div class="ai-console" aria-label="Interactive Ask ISABI Simulator">
          <div class="ai-console-hdr">
            <div class="ai-console-title">
              {BADGE_SVG}
              <div>
                <b>Ask ISABI · Native System Intelligence</b>
                <small>Direct read access to ledger entries, inventory, receivables &amp; Power BI measures</small>
              </div>
            </div>
            <span class="hlc-status"><i></i>Live Sandbox</span>
          </div>

          <div class="ai-prompt-pills" id="ai-prompt-pills">
            <!-- Populated by JS -->
          </div>

          <div class="ai-thread" id="ai-inline-thread">
            <!-- Populated by JS -->
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- REQUIREMENT 4: INGENUITY, COMPETITIVE ADVANTAGE & ROI CALCULATOR -->
  <section class="sec" id="ingenuity">
    <div class="wrap">
      <div class="sec-head">
        <div class="eyebrow">05 · Engineering Ingenuity &amp; Competitive Advantage</div>
        <h2>Why Ambitious Leaders Rely on ISABI Systems.</h2>
        <p>
          Software projects fail when the people writing the code do not understand the balance sheet, and the people who understand the business only know how to use spreadsheets. ISABI Systems bridges both worlds at the principal level.
        </p>
      </div>

      <div class="ingenuity-grid">
        <div class="ing-card">
          <div class="ing-kicker">Advantage 01 · Principal-Led Architecture</div>
          <h3>Financial Fluency Meets Systems Engineering</h3>
          <p>
            You work directly with Hussein Bdeir, not a chain of account managers. Every system is architected with deep fluency in double-entry accounting, regional and international Charts of Accounts (including Lebanese COA class 1 to 7 rules), multi-currency treasury, VAT/TTC discipline, and partner equity splits.
          </p>
        </div>

        <div class="ing-card">
          <div class="ing-kicker">Advantage 02 · Code-First Compilers</div>
          <h3>Weeks to Production, Not Years</h3>
          <p>
            While traditional agencies click through interfaces by hand, ISABI Systems uses proprietary automation compilers that programmatically generate Dataverse schemas, JavaScript form controllers, XMLA Power BI semantic models, and unified RDL report layouts with mathematical precision.
          </p>
        </div>

        <div class="ing-card">
          <div class="ing-kicker">Advantage 03 · Edge-to-Boardroom Continuity</div>
          <h3>From the Plant Gate &amp; Till to the Group P&amp;L</h3>
          <p>
            We solve the hardest last-mile problems: offline POS tills that print receipts over Bluetooth during power or internet cuts, tablet kiosks that verify employee faces and PINs at 6:00 AM, and automated nightly pipelines that turn raw punches and tickets into audited accounting entries.
          </p>
        </div>

        <div class="ing-card">
          <div class="ing-kicker">Advantage 04 · Institutional Design Discipline</div>
          <h3>Software Your Team Actually Wants to Open</h3>
          <p>
            Enterprise software does not need to look cluttered or dated. Our Ledger design system rations visual noise, enforces tabular alignment on every figure, separates status alerts from brand accents, and gives executives clarity in seconds.
          </p>
        </div>
      </div>

      <!-- Mobile Switcher for Ingenuity Proof Views -->
      <div class="mob-seg-bar" role="tablist" aria-label="Select Competitive Proof View">
        <button type="button" class="mob-seg-btn active" data-ing-tab="matrix">vs SaaS &amp; Legacy Matrix</button>
        <button type="button" class="mob-seg-btn" data-ing-tab="roi">Interactive ROI Estimator</button>
      </div>

      <!-- Comparison Matrix -->
      <div class="comp-wrap" data-ing-panel="matrix">
        <table class="comp-table" aria-label="Competitive Comparison Matrix">
          <thead>
            <tr>
              <th>Capability / Criterion</th>
              <th class="isabi-col">ISABI Systems (Bespoke Microsoft Cloud)</th>
              <th>Generic SaaS (Odoo / Zoho / Off-the-Shelf)</th>
              <th>Traditional Legacy ERP Consultancies</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><b>Fit to Your Workflow</b></td>
              <td class="isabi-col">100% custom schema built around your exact operations</td>
              <td>Rigid templates; requires awkward workarounds</td>
              <td>Possible only after expensive custom change orders</td>
            </tr>
            <tr>
              <td><b>Deployment Speed</b></td>
              <td class="isabi-col">3 to 6 weeks via programmatic build pipelines</td>
              <td>2 to 4 months of configuration compromises</td>
              <td>9 to 18 months of slow manual consulting</td>
            </tr>
            <tr>
              <td><b>Executive Analytics &amp; SOA</b></td>
              <td class="isabi-col">Native Power BI + pixel-perfect Paginated (.rdl) statements</td>
              <td>Basic built-in charts; constant Excel exports</td>
              <td>Sold as a separate six-figure BI project</td>
            </tr>
            <tr>
              <td><b>AI Integration</b></td>
              <td class="isabi-col">Native "Ask ISABI" wired directly to live ledger &amp; stock</td>
              <td>Generic FAQ bots with no ledger-level accuracy</td>
              <td>Rarely available or requires external middleware</td>
            </tr>
            <tr>
              <td><b>Data Ownership &amp; Security</b></td>
              <td class="isabi-col">100% inside your own Microsoft Dataverse &amp; Entra tenant</td>
              <td>Locked inside vendor proprietary cloud</td>
              <td>Often hosted on aging on-premise servers</td>
            </tr>
            <tr>
              <td><b>Architect Access</b></td>
              <td class="isabi-col">Direct access to the principal architect who builds your system</td>
              <td>Ticket queues and scripted support agents</td>
              <td>Layered account managers and rotating juniors</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Interactive ROI Calculator -->
      <div class="roi-box" data-ing-panel="roi" data-mob-hide="1">
        <div>
          <div class="eyebrow">Operational Impact Estimator</div>
          <h3 style="font-size:22px;margin-bottom:6px">Quantify the Value of Closing Your Books on ISABI</h3>
          <p style="color:var(--muted);font-size:14px;margin:0 0 18px">
            Adjust the sliders to reflect your current organization and see the immediate operational time reclaimed and close-cycle acceleration.
          </p>
          <div class="roi-sliders">
            <div class="slider-row">
              <label for="roi-entities"><span>Number of Operating Entities / Branches</span><span class="val num" id="roi-entities-val">3 Entities</span></label>
              <input type="range" id="roi-entities" min="1" max="15" value="3">
            </div>
            <div class="slider-row">
              <label for="roi-hours"><span>Weekly Team Hours on Manual Excel</span><span class="val num" id="roi-hours-val">35 hrs / wk</span></label>
              <input type="range" id="roi-hours" min="5" max="120" step="5" value="35">
            </div>
            <div class="slider-row">
              <label for="roi-close"><span>Current Days to Close Monthly Books</span><span class="val num" id="roi-close-val">14 Days</span></label>
              <input type="range" id="roi-close" min="3" max="30" value="14">
            </div>
          </div>
        </div>

        <div class="roi-results">
          <div class="roi-res-grid">
            <div class="roi-stat">
              <small>Executive &amp; Accounting Hours Reclaimed</small>
              <strong class="brass num" id="roi-out-hours">1,456 hrs/yr</strong>
            </div>
            <div class="roi-stat">
              <small>Estimated Annual Productivity Value</small>
              <strong class="num" id="roi-out-dollars">$43,680 / yr</strong>
            </div>
            <div class="roi-stat">
              <small>Target Monthly Close Speed</small>
              <strong class="num" id="roi-out-close">Same-Day / 48h</strong>
            </div>
            <div class="roi-stat">
              <small>Estimated System Payback</small>
              <strong class="brass num" id="roi-out-payback">2.6 Months</strong>
            </div>
          </div>
          <p style="font-size:12.5px;color:var(--muted);margin:0 0 12px">
            Figures reflect typical automation of manual voucher re-keying, inter-branch consolidation, partner split tables, and automated Power BI / RDL statement generation.
          </p>
          <a href="#scope-configurator" class="btn btn-brass" style="width:100%">Configure Your System Scope Below</a>
        </div>
      </div>
    </div>
  </section>

  <!-- REQUIREMENT 6: SENSIBLE PRICING & INTERACTIVE SCOPE CONFIGURATOR -->
  <section class="sec sec-alt" id="pricing">
    <div class="wrap">
      <div class="sec-head">
        <div class="eyebrow">06 · Transparent Investment &amp; Scope Configurator</div>
        <h2>Sensible, Transparent Investment Built Around Real Value.</h2>
        <p>
          Every ISABI system is custom-scoped to your operational complexity, but you should never have to guess the order of magnitude. Review our three core engagement structures below, or use the interactive configurator to build a tailored estimate and send it directly to Hussein.
        </p>
      </div>

      <!-- Mobile Switcher for Pricing Tiers & Custom Scope Builder -->
      <div class="mob-seg-bar" role="tablist" aria-label="Select Engagement Tier or Scope Builder">
        <button type="button" class="mob-seg-btn" data-tier-tab="tier1">$4.5k+ Base</button>
        <button type="button" class="mob-seg-btn active" data-tier-tab="tier2">★ $9.5k+ Suite</button>
        <button type="button" class="mob-seg-btn" data-tier-tab="tier3">$18k+ Group</button>
        <button type="button" class="mob-seg-btn" data-tier-tab="builder">Scope Builder</button>
      </div>

      <div class="pricing-grid" id="pricing-tiers-grid">
        <!-- Tier 1 -->
        <div class="price-card" data-tier-card="tier1" data-mob-hide="1">
          <span class="price-badge">Tier 01 · Single Entity</span>
          <h3>Operational Foundation</h3>
          <p class="price-desc">Ideal for a single operating company, resort property, showroom, plant, or brokerage replacing fragile spreadsheets with a governed ERP and Power BI suite.</p>
          <div class="price-block">
            <div class="price-val num">$4,500 <small>starting build</small></div>
            <div class="price-retainer">+$350 / month managed evolution &amp; support (optional)</div>
          </div>
          <ul class="price-features">
            <li><i>✓</i> <span>Custom Dataverse operational &amp; accounting schema (up to 10 core tables)</span></li>
            <li><i>✓</i> <span>Tailored Model-Driven ERP application with custom JS form validation</span></li>
            <li><i>✓</i> <span>Role-based security for staff, accountants, and management</span></li>
            <li><i>✓</i> <span>Executive Power BI dashboard (Sales, Expenses, Receivables, Cash)</span></li>
            <li><i>✓</i> <span>2 Printable Paginated (.rdl) statements (Statement of Account &amp; P&amp;L)</span></li>
            <li><i>✓</i> <span>Historical Excel data migration &amp; team onboarding</span></li>
          </ul>
          <button type="button" class="btn btn-outline" data-select-tier="Operational Foundation ($4,500+)">Select Tier &amp; Discuss with Hussein</button>
        </div>

        <!-- Tier 2 (Featured) -->
        <div class="price-card featured" data-tier-card="tier2">
          <span class="price-badge">Recommended · Most Popular</span>
          <h3>Multi-Entity &amp; AI Operations Suite</h3>
          <p class="price-desc">Complete operational and financial control for multi-branch companies requiring automated workflows, statutory reconciliation, companion field apps, and Ask ISABI AI.</p>
          <div class="price-block">
            <div class="price-val num">$9,500 <small>starting build</small></div>
            <div class="price-retainer">+$650 / month continuous engineering, AI tuning &amp; priority SLA</div>
          </div>
          <ul class="price-features">
            <li><i>✓</i> <span>Everything in Operational Foundation, expanded for multi-branch scale</span></li>
            <li><i>✓</i> <span>Multi-Business Unit isolation (branch-level security + consolidated view)</span></li>
            <li><i>✓</i> <span>Three-workspace Power BI architecture (Operations, Financial &amp; Reconciliations)</span></li>
            <li><i>✓</i> <span>Full Paginated (.rdl) pack (Customer/Supplier SOA, Aging, Trial Balance)</span></li>
            <li><i>✓</i> <span>Embedded <b>Ask ISABI</b> AI assistant wired to your live ledger &amp; stock</span></li>
            <li><i>✓</i> <span>1 Companion PWA included (Offline POS Till or Biometric Attendance Kiosk)</span></li>
            <li><i>✓</i> <span>Parallel-run statutory book reconciliation bridge</span></li>
          </ul>
          <button type="button" class="btn btn-brass" data-select-tier="Multi-Entity & AI Operations Suite ($9,500+)">Select Suite &amp; Contact Hussein</button>
        </div>

        <!-- Tier 3 -->
        <div class="price-card" data-tier-card="tier3" data-mob-hide="1">
          <span class="price-badge">Tier 03 · Group &amp; Holding</span>
          <h3>Enterprise Group Ecosystem</h3>
          <p class="price-desc">For multi-industry holding groups, family offices, and large enterprises deploying dedicated applications across multiple sister companies with group consolidation.</p>
          <div class="price-block">
            <div class="price-val num">$18,000+ <small>custom engagement</small></div>
            <div class="price-retainer">Custom retainer or dedicated principal advisory agreement</div>
          </div>
          <ul class="price-features">
            <li><i>✓</i> <span>Multiple dedicated industry apps (Hospitality, Trading, Manufacturing, Real Estate, Insurance, Holding)</span></li>
            <li><i>✓</i> <span>Group-wide treasury, partner equity split engines &amp; intercompany ledgers</span></li>
            <li><i>✓</i> <span>Unlimited companion PWAs (POS tills, attendance kiosks, field portals)</span></li>
            <li><i>✓</i> <span>Full Microsoft Entra ID sign-in &amp; M365 custom corporate branding rollout</span></li>
            <li><i>✓</i> <span>Automated nightly backups, audit watchdogs &amp; custom API integrations</span></li>
            <li><i>✓</i> <span>Direct executive partnership with Hussein Bdeir from design to cutover</span></li>
          </ul>
          <button type="button" class="btn btn-outline" data-select-tier="Enterprise Group Ecosystem ($18,000+ Custom)">Request Custom Group Proposal</button>
        </div>
      </div>

      <!-- Interactive Custom Scope & Investment Configurator -->
      <div class="configurator-card" id="scope-configurator" data-tier-card="builder" data-mob-hide="1">
        <div class="eyebrow">Interactive Scope &amp; Investment Builder</div>
        <h3 style="font-size:22px;margin-bottom:6px">Build Your Custom ISABI Architecture &amp; Get an Instant Indicative Range</h3>
        <p style="color:var(--muted);font-size:14px;margin:0">
          Select your primary industry, organizational scale, and desired modules. Your custom configuration automatically syncs with the WhatsApp and Email consultation portal below.
        </p>

        <div class="cfg-grid">
          <div>
            <div class="cfg-group">
              <h4>1. Select Your Primary Industry</h4>
              <div class="cfg-pills" id="cfg-ind-pills">
                <button type="button" class="cfg-pill active" data-cfg-ind="Hospitality & Resorts">Hospitality &amp; Resorts</button>
                <button type="button" class="cfg-pill" data-cfg-ind="Automotive & Heavy Equipment Trading">Auto &amp; Truck Trading</button>
                <button type="button" class="cfg-pill" data-cfg-ind="Concrete, Construction & Manufacturing">Concrete &amp; Manufacturing</button>
                <button type="button" class="cfg-pill" data-cfg-ind="Real Estate & Property Portfolio">Real Estate Portfolio</button>
                <button type="button" class="cfg-pill" data-cfg-ind="Insurance Brokerage">Insurance Brokerage</button>
                <button type="button" class="cfg-pill" data-cfg-ind="Multi-Entity Holding Group">Multi-Entity Holding</button>
                <button type="button" class="cfg-pill" data-cfg-ind="Retail, Distribution & Other">Retail / Distribution / Custom</button>
              </div>
            </div>

            <div class="cfg-group">
              <h4>2. Number of Operating Entities / Locations</h4>
              <div class="cfg-pills" id="cfg-scale-pills">
                <button type="button" class="cfg-pill" data-cfg-scale="1" data-scale-label="Single Entity (1 Location)" data-scale-add="0">1 Entity / Location</button>
                <button type="button" class="cfg-pill active" data-cfg-scale="2" data-scale-label="Multi-Branch (2 to 4 Entities)" data-scale-add="2500">2 to 4 Entities</button>
                <button type="button" class="cfg-pill" data-cfg-scale="5" data-scale-label="Group Estate (5 to 8 Entities)" data-scale-add="6000">5 to 8 Entities</button>
                <button type="button" class="cfg-pill" data-cfg-scale="10" data-scale-label="Enterprise Holding (9+ Entities)" data-scale-add="11000">9+ Entities</button>
              </div>
            </div>

            <div class="cfg-group" style="margin-bottom:0">
              <h4>3. Select System Modules to Include</h4>
              <div class="cfg-checks" id="cfg-mod-checks">
                <label class="cfg-check active">
                  <input type="checkbox" value="Core Dataverse ERP & Custom Ledger" data-cost="4500" data-wks="2" checked disabled>
                  <div>
                    <b>Core Dataverse ERP &amp; Ledger</b>
                    <small>Custom tables, forms, roles, COA &amp; audit trail (Included)</small>
                  </div>
                </label>
                <label class="cfg-check active">
                  <input type="checkbox" value="Power BI Executive Dashboards" data-cost="2000" data-wks="1" checked>
                  <div>
                    <b>Power BI Executive Dashboards</b>
                    <small>XMLA semantic model, KPIs, MoM variance &amp; period pickers</small>
                  </div>
                </label>
                <label class="cfg-check active">
                  <input type="checkbox" value="Paginated .RDL Statements & SOA Pack" data-cost="1500" data-wks="1" checked>
                  <div>
                    <b>Printable .RDL Statements &amp; SOA</b>
                    <small>Pixel-perfect PDF/Excel Statement of Accounts, P&amp;L &amp; Aging</small>
                  </div>
                </label>
                <label class="cfg-check active">
                  <input type="checkbox" value="Ask ISABI Native AI Assistant" data-cost="1800" data-wks="1" checked>
                  <div>
                    <b>Ask ISABI Native AI Assistant</b>
                    <small>In-app &amp; WhatsApp ledger intelligence wired to live data</small>
                  </div>
                </label>
                <label class="cfg-check">
                  <input type="checkbox" value="Custom Offline POS Till PWA" data-cost="2200" data-wks="1">
                  <div>
                    <b>Custom Offline POS Till (PWA)</b>
                    <small>Fast cashier till, thermal receipt print &amp; daily revenue sync</small>
                  </div>
                </label>
                <label class="cfg-check">
                  <input type="checkbox" value="Biometric Face & PIN Attendance Kiosk" data-cost="1800" data-wks="1">
                  <div>
                    <b>Biometric Attendance Kiosk (PWA)</b>
                    <small>Tablet face + PIN verification &amp; automated payroll attendance</small>
                  </div>
                </label>
                <label class="cfg-check">
                  <input type="checkbox" value="Statutory ERP Reconciliation & Historical Migration" data-cost="1500" data-wks="1">
                  <div>
                    <b>Statutory Reconciliation &amp; Migration</b>
                    <small>Historical workbook import &amp; dual-entry variance bridge</small>
                  </div>
                </label>
                <label class="cfg-check">
                  <input type="checkbox" value="Automated Recruitment & CV Pipeline" data-cost="1200" data-wks="1">
                  <div>
                    <b>Recruitment &amp; SharePoint CV Pipeline</b>
                    <small>Automated applicant intake, SharePoint folders &amp; HR review</small>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div class="cfg-summary">
            <div>
              <div style="font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--brass);margin-bottom:6px">Live Architecture Summary</div>
              <h4 style="font-size:20px;margin-bottom:4px" id="cfg-out-title">Hospitality &amp; Resorts System</h4>
              <div style="font-size:13px;color:var(--muted)" id="cfg-out-scale">Multi-Branch (2 to 4 Entities)</div>

              <table class="cfg-sum-table">
                <tbody id="cfg-out-rows">
                  <!-- Populated by JS -->
                </tbody>
                <tfoot>
                  <tr class="tot">
                    <td>Indicative Investment Range</td>
                    <td class="r num" id="cfg-out-total">$10,500 to $13,000</td>
                  </tr>
                </tfoot>
              </table>

              <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--muted);margin-bottom:16px">
                <span>Estimated Delivery Window:</span>
                <strong style="color:var(--ink)" id="cfg-out-weeks">4 to 6 Weeks</strong>
              </div>
              <p style="font-size:12.5px;color:var(--muted);margin:0 0 18px">
                Final pricing is confirmed after a 30-minute architecture call with Hussein Bdeir to review your exact chart of accounts, entities, and workflow requirements.
              </p>
            </div>

            <div style="display:flex;flex-direction:column;gap:10px">
              <button type="button" class="btn btn-wa" id="cfg-wa-btn" style="width:100%">Send This Scope to Hussein on WhatsApp</button>
              <button type="button" class="btn btn-brass" id="cfg-portal-btn" style="width:100%">Load Into Formal Inquiry Portal</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- REQUIREMENT 5 & 7: WHATSAPP & EMAIL CUSTOMER CONTACT PORTAL -->
  <section class="sec" id="portal">
    <div class="wrap">
      <div class="sec-head">
        <div class="eyebrow">07 · Direct Executive Consultation Portal</div>
        <h2>Start Building Your System With Hussein Bdeir.</h2>
        <p>
          Whether you want to replace a tangle of spreadsheets at a single company or unify an entire multi-industry holding group under one intelligent platform, reach out directly via WhatsApp or Email below.
        </p>
      </div>

      <!-- Mobile Switcher for Consultation Portal -->
      <div class="mob-seg-bar" role="tablist" aria-label="Select Contact Method">
        <button type="button" class="mob-seg-btn active" data-portal-tab="form">Project Brief Form</button>
        <button type="button" class="mob-seg-btn" data-portal-tab="direct">Direct WhatsApp &amp; Email</button>
      </div>

      <div class="portal-grid">
        <div class="portal-form-card" data-portal-panel="form">
          <h3 style="font-size:21px;margin-bottom:6px">Project Brief &amp; Direct Dispatch</h3>
          <p style="font-size:13.8px;color:var(--muted);margin:0 0 18px">
            Fill in your details below (your selections from the Scope Configurator are automatically attached) and choose WhatsApp or Email to send your inquiry immediately.
          </p>

          <form id="lead-portal-form" novalidate>
            <div class="form-row">
              <div class="form-field">
                <label for="lead-name">Your Full Name *</label>
                <input type="text" id="lead-name" placeholder="e.g. Karim Mansour" required>
              </div>
              <div class="form-field">
                <label for="lead-company">Company or Group Name *</label>
                <input type="text" id="lead-company" placeholder="e.g. Cedar Industrial Group" required>
              </div>
            </div>

            <div class="form-row">
              <div class="form-field">
                <label for="lead-role">Your Role / Title</label>
                <input type="text" id="lead-role" placeholder="e.g. Managing Director / CFO / Owner">
              </div>
              <div class="form-field">
                <label for="lead-contact">Your Phone or Email *</label>
                <input type="text" id="lead-contact" placeholder="+961 ... or name@company.com" required>
              </div>
            </div>

            <div class="form-row">
              <div class="form-field">
                <label for="lead-industry">Industry Vertical</label>
                <select id="lead-industry">
                  <option value="Hospitality & Resorts">Hospitality, Resorts &amp; Beach Clubs</option>
                  <option value="Automotive & Heavy Equipment Trading">Automotive &amp; Heavy Truck Trading</option>
                  <option value="Concrete, Construction & Manufacturing">Concrete, Construction &amp; Manufacturing</option>
                  <option value="Real Estate & Property Portfolio">Real Estate &amp; Property Management</option>
                  <option value="Insurance Brokerage">Insurance Brokerage &amp; Underwriting</option>
                  <option value="Multi-Entity Holding Group">Multi-Entity Holding Group</option>
                  <option value="Retail, Distribution & Other">Retail, Distribution &amp; Custom</option>
                </select>
              </div>
              <div class="form-field">
                <label for="lead-budget">Target Engagement Tier</label>
                <select id="lead-budget">
                  <option value="Multi-Entity & AI Operations Suite ($9,500+)">Multi-Entity &amp; AI Suite ($9,500+)</option>
                  <option value="Operational Foundation ($4,500+)">Operational Foundation ($4,500+)</option>
                  <option value="Enterprise Group Ecosystem ($18,000+ Custom)">Enterprise Group ($18,000+ Custom)</option>
                  <option value="Need Pricing Guidance / Custom Quote">Custom Quote / Pricing Guidance</option>
                </select>
              </div>
            </div>

            <div class="form-field">
              <label for="lead-notes">Operational Goals &amp; Current Challenges</label>
              <textarea id="lead-notes" rows="3" placeholder="Tell us briefly about your entities, current accounting or Excel setup, and what you want the system to solve..."></textarea>
            </div>

            <div class="portal-dispatch-btns">
              <button type="button" class="btn btn-wa" id="portal-send-wa" style="padding:13px 16px;font-size:14.5px">
                Send Inquiry on WhatsApp
              </button>
              <button type="button" class="btn btn-brass" id="portal-send-email" style="padding:13px 16px;font-size:14.5px">
                Send Inquiry via Email
              </button>
            </div>

            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
              <button type="button" class="btn btn-outline" id="portal-copy-brief" style="flex:1;font-size:12.5px;padding:8px 10px">
                Copy Formatted Brief
              </button>
              <button type="button" class="btn btn-outline" id="portal-print-brief" style="flex:1;font-size:12.5px;padding:8px 10px">
                Print / Save PDF Brief
              </button>
            </div>
          </form>
        </div>

        <div class="portal-direct-card" data-portal-panel="direct" data-mob-hide="1">
          <div>
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
              {BADGE_SVG}
              <div>
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#D9A54A;font-weight:700">Direct Principal Access</div>
                <h3 style="color:#F4F2EE;font-size:21px">Hussein Bdeir</h3>
                <div style="font-size:12.5px;color:#9FB0C7">Founder &amp; Principal Systems Architect · ISABI Systems</div>
              </div>
            </div>

            <div class="direct-channel-box">
              <small>WhatsApp &amp; Direct Mobile (Fastest Response)</small>
              <strong class="num">+961 70 444 955</strong>
              <p>Message Hussein directly on WhatsApp for an immediate architecture discussion, live demo walkthrough, or custom pricing review.</p>
              <a href="https://wa.me/96170444955?text=Hello%20Hussein%2C%20I%20would%20like%20to%20schedule%20a%20discovery%20call%20regarding%20an%20ISABI%20Systems%20implementation." target="_blank" rel="noopener" class="btn btn-wa" style="width:100%">Open Direct WhatsApp Chat</a>
            </div>

            <div class="direct-channel-box">
              <small>Direct Executive Email</small>
              <strong>hbdeir16@gmail.com</strong>
              <p>Send RFP documents, chart of accounts structures, or formal project inquiries directly to Hussein's inbox.</p>
              <div style="display:flex;gap:8px">
                <a href="mailto:hbdeir16@gmail.com?subject=ISABI%20Systems%20-%20Enterprise%20Software%20Inquiry" class="btn btn-brass" style="flex:1">Compose Email</a>
                <button type="button" class="btn btn-outline" id="copy-email-btn" style="background:rgba(255,255,255,0.06);color:#F4F2EE;border-color:rgba(255,255,255,0.2)">Copy Email</button>
              </div>
            </div>
          </div>

          <div style="border-top:1px solid rgba(255,255,255,0.12);border-bottom:3px double #D9A54A;padding:14px 0">
            <div style="font-size:11.5px;text-transform:uppercase;letter-spacing:0.1em;color:#D9A54A;font-weight:700;margin-bottom:5px">What Happens After You Reach Out</div>
            <ol style="margin:0;padding-left:18px;font-size:12.8px;color:#E9ECF2;line-height:1.5">
              <li><b>30-Minute Discovery Call:</b> We review your entities, current spreadsheets or legacy software, and reporting pain points.</li>
              <li><b>Live Production Walkthrough:</b> See real ISABI systems running across hospitality, trading, manufacturing, real estate, and insurance.</li>
              <li><b>Fixed-Scope Blueprint &amp; Timeline:</b> Receive a clear architectural proposal with exact tables, reports, and investment terms.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  </section>
</main>

<!-- FOOTER -->
<footer class="site-footer">
  <div class="wrap">
    <div class="ftr-grid">
      <div class="ftr-col">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;color:#F4F2EE">
          {BADGE_SVG}
          <div>
            <b style="font-family:Archivo,sans-serif;font-size:17px;display:block;letter-spacing:0.04em">ISABI SYSTEMS</b>
            <span style="font-size:12px;color:#D9A54A">The Books Close on ISABI</span>
          </div>
        </div>
        <p style="margin:0 0 12px;color:#9FB0C7;font-size:13px">
          Bespoke Enterprise ERP, Financial Ledgers, Power BI Executive Suites, Companion PWAs, and Native AI Built on the Microsoft Cloud.
        </p>
        <div style="font-size:12.5px;color:#F4F2EE">
          <b>Direct WhatsApp:</b> <a href="https://wa.me/96170444955" target="_blank" rel="noopener" style="color:#D9A54A">+961 70 444 955</a><br>
          <b>Direct Email:</b> <a href="mailto:hbdeir16@gmail.com" style="color:#D9A54A">hbdeir16@gmail.com</a>
        </div>
      </div>

      <div class="ftr-col">
        <h4>Industry Verticals</h4>
        <ul>
          <li><a href="#industries" data-goto-ind="hospitality">Hospitality, Resorts &amp; Beach Clubs</a></li>
          <li><a href="#industries" data-goto-ind="trading">Automotive &amp; Heavy Truck Trading</a></li>
          <li><a href="#industries" data-goto-ind="manufacturing">Ready-Mix Concrete &amp; Manufacturing</a></li>
          <li><a href="#industries" data-goto-ind="realestate">Real Estate &amp; Property Portfolios</a></li>
          <li><a href="#industries" data-goto-ind="insurance">Insurance Brokerage Operations</a></li>
          <li><a href="#industries" data-goto-ind="holding">Multi-Entity Holding Groups</a></li>
        </ul>
      </div>

      <div class="ftr-col">
        <h4>Platform &amp; AI</h4>
        <ul>
          <li><a href="#architecture">4-Layer Bespoke Architecture</a></li>
          <li><a href="#sandbox">Interactive ERP &amp; Power BI Sandbox</a></li>
          <li><a href="#microsoft-ai">Microsoft Dataverse &amp; Power Platform</a></li>
          <li><a href="#microsoft-ai">Ask ISABI Native Intelligence</a></li>
          <li><a href="#industries" data-goto-ind="pos">Offline POS Till &amp; Attendance PWAs</a></li>
          <li><a href="#ingenuity">ROI &amp; Close-Cycle Calculator</a></li>
        </ul>
      </div>

      <div class="ftr-col">
        <h4>Client Portal</h4>
        <ul>
          <li><a href="#pricing">Transparent Investment Tiers</a></li>
          <li><a href="#scope-configurator">Interactive Scope Configurator</a></li>
          <li><a href="https://wa.me/96170444955" target="_blank" rel="noopener">WhatsApp Consultation (+961 70 444 955)</a></li>
          <li><a href="mailto:hbdeir16@gmail.com">Email Hussein Bdeir</a></li>
          <li><a href="#portal" id="ftr-install-link">Install ISABI Showcase PWA</a></li>
        </ul>
      </div>
    </div>

    <div class="ftr-bottom">
      <span>© 2026 ISABI Systems. Founded &amp; Architected by Hussein Bdeir. All rights reserved.</span>
      <span>Built on Microsoft Dataverse · Power Apps · Power Automate · Power BI · Ask ISABI AI</span>
    </div>
  </div>
</footer>

<!-- MOBILE BOTTOM BAR -->
<nav class="mobile-dock" aria-label="Mobile Quick Actions">
  <a href="#industries" data-sec-link="industries" class="dock-btn">Industries</a>
  <a href="#sandbox" data-sec-link="sandbox" class="dock-btn">Live ERP</a>
  <button type="button" class="dock-btn brass" id="mob-ask-btn">Ask ISABI</button>
  <a href="https://wa.me/96170444955?text=Hello%20Hussein%2C%20I%20am%20interested%20in%20ISABI%20Systems." target="_blank" rel="noopener" class="dock-btn wa">WhatsApp</a>
</nav>

<!-- SLIDE-OVER ASK ISABI AI DRAWER -->
<div class="drawer-backdrop" id="ai-drawer-backdrop" hidden>
  <aside class="ai-drawer" role="dialog" aria-modal="true" aria-label="Ask ISABI System Intelligence">
    <div class="ai-drawer-hdr">
      <div style="display:flex;align-items:center;gap:10px">
        {BADGE_SVG}
        <div>
          <b style="font-family:Archivo,sans-serif;font-size:16px;display:block">ISABI · System Intelligence</b>
          <small style="color:#9FB0C7;font-size:12px">Ask about custom ERP architecture, industry fit, pricing, or live ledger queries</small>
        </div>
      </div>
      <button type="button" class="btn btn-ghost" id="close-ai-drawer" style="color:#F4F2EE;border-color:rgba(255,255,255,0.2)">Close</button>
    </div>
    <div class="ai-prompt-pills" id="drawer-prompt-pills">
      <!-- Populated by JS -->
    </div>
    <div class="ai-drawer-body" id="ai-drawer-thread">
      <!-- Populated by JS -->
    </div>
    <form class="ai-drawer-ftr" id="ai-drawer-form">
      <input type="text" id="ai-drawer-input" placeholder="Ask ISABI about your industry, Microsoft stack, or pricing..." autocomplete="off">
      <button type="submit" class="btn btn-brass">Ask</button>
    </form>
  </aside>
</div>

<!-- TOAST NOTIFICATION -->
<div class="toast" id="site-toast" hidden></div>
"""
