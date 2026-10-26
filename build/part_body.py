# HTML body structure for ISABI Systems PWA
from part_faq import FAQ_HTML
from part_icons import ICONS

BADGE_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" class="brand-badge" role="img" aria-label="ISABI Systems Badge"><rect width="120" height="120" rx="26" fill="#0B1730"/><g transform="translate(39.52,77.62) scale(0.74)"><g fill="#F4F2EE"><path transform="translate(-8.45,0)" d="M8.45 0V-68.75H28.81V0Z"/><path transform="translate(-10.45,0)" d="M45.75 0V-68.75H66.11V0Z"/></g><g fill="#D9A54A"><rect x="0" y="9.5" width="55.66" height="3.4"/><rect x="0" y="17.5" width="55.66" height="3.4"/></g></g></svg>"""

MARK_ON_DARK_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="-9.5 -78.8 74.66 109.7" aria-hidden="true"><g fill="currentColor"><path transform="translate(-8.45,0)" d="M8.45 0V-68.75H28.81V0Z"/><path transform="translate(-10.45,0)" d="M45.75 0V-68.75H66.11V0Z"/></g><g fill="#D9A54A"><rect x="0" y="9.5" width="55.66" height="3.4"/><rect x="0" y="17.5" width="55.66" height="3.4"/></g></svg>"""

WORDMARK_HEADER_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="-14 -82.8 346.86 160.76" class="brand-wordmark" role="img" aria-label="ISABI Systems"><g fill="currentColor"><path transform="translate(-8.45,0)" d="M8.45 0V-68.75H28.81V0Z"/><path transform="translate(-12.95,0)" d="M82.46 1.2Q74.06 1.2 66.77 0.2Q59.48 -0.81 54 -3.31Q48.52 -5.82 45.43 -10.3Q42.33 -14.78 42.33 -21.68Q42.33 -21.88 42.33 -22.21Q42.33 -22.53 42.43 -22.84H62.38Q62.28 -22.44 62.25 -22Q62.23 -21.56 62.23 -21.08Q62.23 -18.03 64.55 -16.27Q66.87 -14.51 71.11 -13.8Q75.35 -13.09 80.96 -13.09Q83.32 -13.09 85.78 -13.23Q88.24 -13.38 90.53 -13.74Q92.82 -14.1 94.65 -14.79Q96.47 -15.47 97.56 -16.55Q98.65 -17.63 98.65 -19.15Q98.65 -21.32 96.35 -22.57Q94.05 -23.82 90.14 -24.58Q86.22 -25.33 81.35 -25.92Q76.49 -26.52 71.28 -27.34Q66.06 -28.16 61.2 -29.61Q56.33 -31.06 52.41 -33.47Q48.5 -35.88 46.2 -39.66Q43.9 -43.45 43.9 -48.91Q43.9 -54.37 46.67 -58.34Q49.43 -62.31 54.42 -64.89Q59.41 -67.46 66.2 -68.71Q73 -69.95 81.01 -69.95Q89.17 -69.95 95.82 -68.69Q102.46 -67.43 107.23 -64.88Q112 -62.33 114.57 -58.47Q117.13 -54.6 117.13 -49.39V-48.01H97.39V-48.82Q97.39 -50.91 95.59 -52.53Q93.78 -54.15 90.34 -55.12Q86.89 -56.1 81.96 -56.1Q76.07 -56.1 72.27 -55.36Q68.48 -54.62 66.68 -53.34Q64.88 -52.07 64.88 -50.55Q64.88 -48.52 67.17 -47.33Q69.47 -46.15 73.39 -45.47Q77.3 -44.78 82.17 -44.19Q87.03 -43.6 92.25 -42.78Q97.46 -41.96 102.32 -40.59Q107.19 -39.21 111.11 -36.84Q115.03 -34.46 117.32 -30.83Q119.62 -27.2 119.62 -21.89Q119.62 -13.62 114.83 -8.52Q110.04 -3.43 101.65 -1.11Q93.26 1.2 82.46 1.2Z"/><path transform="translate(-12.35,0)" d="M125.53 0 159.33 -68.75H181.97L215.77 0H193.74L188.55 -11.02H151.65L146.51 0ZM158.47 -25.93H181.73L175.47 -39.9Q175.08 -40.84 174.37 -42.55Q173.67 -44.27 172.91 -46.22Q172.15 -48.17 171.51 -49.85Q170.87 -51.52 170.55 -52.33H169.8Q169.07 -50.49 168.11 -48.11Q167.15 -45.73 166.26 -43.49Q165.37 -41.25 164.73 -39.85Z"/><path transform="translate(-14.35,0)" d="M225.75 0V-68.75H282.27Q287.86 -68.75 292.39 -66.6Q296.91 -64.45 299.54 -60.65Q302.18 -56.85 302.18 -51.81Q302.18 -47.31 300.57 -44.11Q298.96 -40.91 296.25 -38.92Q293.54 -36.94 290.23 -35.95V-35.55Q294.09 -34.75 297.19 -32.66Q300.3 -30.57 302.11 -27.09Q303.92 -23.62 303.92 -18.57Q303.92 -12.66 301.07 -8.52Q298.22 -4.37 293.39 -2.19Q288.55 0 282.6 0ZM246.11 -14.49H275.8Q279 -14.49 281.02 -16.24Q283.05 -17.98 283.05 -21.59Q283.05 -23.49 282.17 -25.01Q281.3 -26.53 279.61 -27.37Q277.93 -28.21 275.53 -28.21H246.11ZM246.11 -41.59H274.11Q276.44 -41.59 278.03 -42.43Q279.63 -43.27 280.49 -44.8Q281.35 -46.33 281.35 -48.4Q281.35 -51.33 279.38 -53.04Q277.4 -54.75 274.39 -54.75H246.11Z"/><path transform="translate(-18.65,0)" d="M317.15 0V-68.75H337.51V0Z"/></g><g fill="var(--brass)"><rect x="0" y="9.5" width="318.86" height="3.4"/><rect x="0" y="17.5" width="318.86" height="3.4"/></g><g fill="currentColor" transform="translate(0,62.46) scale(0.42)"><path transform="translate(-5.17,0)" d="M38 1.2Q31.29 1.2 25.32 0.09Q19.36 -1.01 14.83 -3.57Q10.3 -6.12 7.74 -10.29Q5.17 -14.45 5.17 -20.57Q5.17 -20.98 5.2 -21.44Q5.22 -21.89 5.27 -22.14H19.28Q19.24 -21.85 19.19 -21.3Q19.14 -20.75 19.14 -20.2Q19.14 -17 21.42 -14.84Q23.7 -12.68 27.98 -11.6Q32.25 -10.52 38.01 -10.52Q41.12 -10.52 43.86 -10.85Q46.6 -11.18 48.86 -11.81Q51.12 -12.44 52.78 -13.41Q54.43 -14.39 55.32 -15.72Q56.2 -17.04 56.2 -18.68Q56.2 -21.44 54.14 -23.17Q52.08 -24.9 48.57 -26.06Q45.06 -27.22 40.66 -28.1Q36.26 -28.98 31.59 -29.96Q26.91 -30.94 22.51 -32.44Q18.11 -33.94 14.6 -36.19Q11.1 -38.44 9.03 -41.93Q6.97 -45.43 6.97 -50.42Q6.97 -55.22 9.14 -58.86Q11.31 -62.51 15.42 -64.96Q19.53 -67.4 25.27 -68.63Q31.02 -69.85 38.16 -69.85Q45.15 -69.85 50.75 -68.58Q56.34 -67.31 60.28 -64.79Q216.22 -62.26 66.3 -58.56Q68.37 -54.86 68.37 -50V-48.6H54.56V-49.75Q54.56 -52.31 52.5 -54.17Q50.44 -56.02 46.83 -57.08Q515.82 -58.13 38.54 -58.13Q32.75 -58.13 28.92 -57.25Q25.1 -56.38 23.21 -54.78Q21.32 -53.18 21.32 -51.02Q21.32 -48.61 23.38 -47.06Q25.44 -45.5 28.95 -44.47Q32.46 -43.44 36.86 -42.58Q41.26 -41.72 45.93 -40.69Q50.61 -39.66 55.01 -38.21Q59.41 -36.76 62.92 -34.46Q66.42 -32.16 68.49 -28.74Q70.55 -25.32 70.55 -20.44Q70.55 -12.59 66.39 -7.82Q62.24 -3.05 54.89 -0.92Q47.55 1.2 38 1.2Z"/><path transform="translate(32.83,0)" d="M106.74 0V-27.85L76.88 -68.65H93.47L113.82 -39.79H114.56L134.96 -68.65H150.65L120.8 -27.85V0Z"/><path transform="translate(70.83,0)" d="M190 1.2Q183.29 1.2 177.32 0.09Q171.36 -1.01 166.83 -3.57Q162.3 -6.12 159.74 -10.29Q157.17 -14.45 157.17 -20.57Q157.17 -20.98 157.2 -21.44Q157.22 -21.89 157.27 -22.14H171.28Q171.24 -21.85 171.19 -21.3Q171.14 -20.75 171.14 -20.2Q171.14 -17 173.42 -14.84Q175.7 -12.68 179.98 -11.6Q184.25 -10.52 190.01 -10.52Q193.12 -10.52 195.86 -10.85Q198.6 -11.18 200.86 -11.81Q523.72 -12.44 204.78 -13.41Q206.43 -14.39 207.32 -15.72Q208.2 -17.04 208.2 -18.68Q208.2 -21.44 206.14 -23.17Q204.08 -24.9 200.57 -26.06Q197.06 -27.22 192.66 -28.1Q188.26 -28.98 183.59 -29.96Q178.91 -30.94 174.51 -32.44Q170.11 -33.94 166.6 -36.19Q163.1 -38.44 161.03 -41.93Q158.97 -45.43 158.97 -50.42Q158.97 -55.22 161.14 -58.86Q163.31 -62.51 167.42 -64.96Q171.53 -67.4 177.27 -68.63Q183.02 -69.85 190.16 -69.85Q197.15 -69.85 202.75 -68.58Q208.34 -67.31 212.28 -64.79Q216.22 -62.26 218.3 -58.56Q220.37 -54.86 220.37 -50V-48.6H206.56V-49.75Q206.56 -52.31 204.5 -54.17Q202.44 -56.02 198.83 -57.08Q195.22 -58.13 190.54 -58.13Q184.75 -58.13 180.92 -57.25Q177.1 -56.38 175.21 -54.78Q173.32 -53.18 173.32 -51.02Q173.32 -48.61 175.38 -47.06Q177.44 -45.5 180.95 -44.47Q184.46 -43.44 188.86 -42.58Q193.26 -41.72 197.93 -40.69Q202.61 -39.66 207.01 -38.21Q211.41 -36.76 214.92 -34.46Q218.42 -32.16 220.49 -28.74Q222.55 -25.32 222.55 -20.44Q222.55 -12.59 218.39 -7.82Q214.24 -3.05 206.89 -0.92Q199.55 1.2 190 1.2Z"/><path transform="translate(108.83,0)" d="M256.08 0V-56.39H230.05V-68.65H296.21V-56.39H270.13V0Z"/><path transform="translate(146.83,0)" d="M307.41 0V-68.65H368.59V-56.78H321.46V-40.94H363.42V-29.07H321.46V-11.87H369.28V0Z"/><path transform="translate(184.83,0)" d="M383.91 0V-68.65H405.9L419.05 -31.84Q419.7 -30.03 420.56 -27.36Q421.42 -24.7 422.31 -21.99Q423.2 -19.28 423.83 -17.15H424.58Q425.12 -19.03 425.9 -21.62Q426.69 -24.2 427.55 -26.92Q428.41 -29.64 429.16 -31.8L442.31 -68.65H463.96V0H449.9V-38.2Q449.9 -41.41 449.98 -44.81Q450.05 -48.21 450.18 -50.91Q450.3 -53.61 450.35 -54.64H449.55Q449.21 -53.46 448.41 -50.89Q447.61 -48.32 446.76 -45.49Q445.9 -42.66 445.2 -40.6L430.35 0H417.01L402.11 -40.54Q401.36 -42.6 400.57 -45.16Q399.77 -47.73 399.07 -50.28Q398.36 -52.82 397.81 -54.64H397.01Q397.11 -52.66 397.19 -49.78Q397.26 -46.89 397.34 -43.86Q397.42 -40.82 397.42 -38.2V0Z"/><path transform="translate(222.83,0)" d="M510.6 1.2Q503.89 1.2 497.92 0.09Q491.96 -1.01 487.43 -3.57Q482.9 -6.12 480.34 -10.29Q477.77 -14.45 477.77 -20.57Q477.77 -20.98 477.8 -21.44Q477.82 -21.89 477.87 -22.14H491.88Q491.84 -21.85 491.79 -21.3Q491.74 -20.75 491.74 -20.2Q491.74 -17 494.02 -14.84Q496.3 -12.68 500.58 -11.6Q504.85 -10.52 510.61 -10.52Q513.72 -10.52 516.46 -10.85Q519.2 -11.18 521.46 -11.81Q523.72 -12.44 525.38 -13.41Q527.03 -14.39 527.92 -15.72Q528.8 -17.04 528.8 -18.68Q528.8 -21.44 526.74 -23.17Q524.68 -24.9 521.17 -26.06Q517.66 -27.22 513.26 -28.1Q508.86 -28.98 504.19 -29.96Q499.51 -30.94 495.11 -32.44Q490.71 -33.94 487.2 -36.19Q483.7 -38.44 481.63 -41.93Q479.57 -45.43 479.57 -50.42Q479.57 -55.22 481.74 -58.86Q483.91 -62.51 488.02 -64.96Q492.13 -67.4 497.87 -68.63Q503.62 -69.85 510.76 -69.85Q517.75 -69.85 523.35 -68.58Q528.94 -67.31 532.88 -64.79Q536.82 -62.26 538.9 -58.56Q540.97 -54.86 540.97 -50V-48.6H527.16V-49.75Q527.16 -52.31 525.1 -54.17Q523.04 -56.02 519.43 -57.08Q515.82 -58.13 511.14 -58.13Q505.35 -58.13 501.52 -57.25Q497.7 -56.38 495.81 -54.78Q493.92 -53.18 493.92 -51.02Q493.92 -48.61 495.98 -47.06Q498.04 -45.5 501.55 -44.47Q505.06 -43.44 509.46 -42.58Q513.86 -41.72 518.53 -40.69Q523.21 -39.66 527.61 -38.21Q532.01 -36.76 535.52 -34.46Q539.02 -32.16 541.09 -28.74Q543.15 -25.32 543.15 -20.44Q543.15 -12.59 538.99 -7.82Q534.84 -3.05 527.49 -0.92Q520.15 1.2 510.6 1.2Z"/></g></svg>"""

BODY = f"""
<header class="site-header" id="site-header">
  <div class="hdr-inner">
    <a href="#top" class="brand-link" aria-label="ISABI Systems Home">
      {BADGE_SVG}
      {WORDMARK_HEADER_SVG}
    </a>
    <nav class="main-nav" id="main-nav" aria-label="Primary Navigation">
      <a href="#architecture" data-sec-link="architecture" class="active">Features</a>
      <a href="#industries" data-sec-link="industries">Industries</a>
      <a href="#sandbox" data-sec-link="sandbox">Live Demo</a>
      <a href="#ingenuity" data-sec-link="ingenuity">Why ISABI</a>
      <a href="#pricing" data-sec-link="pricing">Pricing</a>
    </nav>
    <div class="hdr-actions">
      <button type="button" class="ask-isabi-trigger" id="hdr-ask-btn" title="Open Ask ISABI System Intelligence">
        {MARK_ON_DARK_SVG}
        <span>Ask ISABI</span>
      </button>
      <button type="button" class="btn btn-ghost" id="theme-toggle-btn" aria-label="Switch Theme" title="Toggle Dark or Light Ledger Theme">Dark</button>
      <a href="app/" class="btn btn-outline hdr-signin-btn" id="hdr-signin-btn" title="Sign in to ISABI Enterprise Command Center">{ICONS["lock"]} <span>Sign In</span></a>
      <a href="#portal" class="btn btn-brass hide-md">Book Consultation</a>
    </div>
  </div>
  <!-- Mobile & Tablet Section Jump Strip -->
  <nav class="mobile-sec-nav" id="mobile-sec-nav" aria-label="Section Navigation">
    <a href="#architecture" data-sec-link="architecture" class="active">{ICONS["apps"]} 01 Features</a>
    <a href="#industries" data-sec-link="industries">{ICONS["manufacturing"]} 02 Industries</a>
    <a href="#sandbox" data-sec-link="sandbox">{ICONS["erp"]} 03 Live Demo</a>
    <a href="#ingenuity" data-sec-link="ingenuity">{ICONS["bolt"]} 04 Why ISABI</a>
    <a href="#pricing" data-sec-link="pricing">{ICONS["diamond"]} 05 Pricing</a>
    <a href="#portal" data-sec-link="portal">{ICONS["phone"]} 06 Contact</a>
    <a href="app/">{ICONS["lock"]} Sign In</a>
  </nav>
</header>

<a class="skip-link" href="#architecture">Skip to content</a>
<main id="top">
  <!-- HERO SECTION -->
  <section class="hero-section">
    <div class="wrap hero-grid">
      <div>
        <div>
          <div class="eyebrow">{ICONS["ai_mark"]} ISABI Systems · Custom Setup + Per-Seat Plans · Live in 1 to 2 Weeks</div>
          <h1 class="hero-title">The ERP Your Group<br><span class="brass-text">Actually Runs On</span>.</h1>
          <p class="hero-lead">
            Custom operations, double-entry accounting, live dashboards, field kiosks, and cited AI, built around how your business works.
          </p>
          <div class="hero-cta-row">
            <a href="#sandbox" class="btn btn-brass">{ICONS["erp"]} Explore Live Demo</a>
            <a href="https://wa.me/96170444955?text=Hello%20Hussein%2C%20I%20visited%20the%20ISABI%20Systems%20portal%20and%20would%20like%20to%20discuss%20building%20a%20custom%20system%20for%20our%20business." target="_blank" rel="noopener" class="btn btn-wa">{ICONS["wa"]} WhatsApp Direct</a>
          </div>
        </div>

        <div class="hero-proof-list" aria-label="Core Guarantees">
          <div class="hero-proof-item">
            <span class="hp-check">{ICONS["check"]}</span>
            <div>
              <b>Low Custom Setup + Per-Seat Plans</b>
              <small>Accessible one-time setup for your tailored system plus simple per-seat monthly pricing from $15/seat.</small>
            </div>
          </div>
          <div class="hero-proof-item">
            <span class="hp-check">{ICONS["check"]}</span>
            <div>
              <b>100% Tailored in 1 to 2 Weeks</b>
              <small>Shaped around your exact branches, approvals, operational units, and chart of accounts.</small>
            </div>
          </div>
          <div class="hero-proof-item">
            <span class="hp-check">{ICONS["check"]}</span>
            <div>
              <b>Reconciled to $0.00 Variance</b>
              <small>Verified side by side against your accountant's books before cutover, with full data ownership.</small>
            </div>
          </div>
        </div>
      </div>

      <div class="hero-ledger-card" aria-label="Interactive Command Center Preview">
        <div class="hlc-top">
          <div class="hlc-brand">
            <span class="hlc-win-dots" aria-hidden="true"><i></i><i></i><i></i></span>
            {MARK_ON_DARK_SVG}
            <span id="hlc-window-title">ISABI Live Command Center</span>
          </div>
          <div class="hlc-top-right">
            <a href="app/?demo=1&amp;autologin=1" id="hlc-open-portal-link" class="hlc-status" style="text-decoration:none" title="Launch Full Interactive Command Center"><i></i>Full Portal ▸</a>
          </div>
        </div>

        <div class="hlc-body">
          <div class="hlc-kpis">
            <div class="hlc-kpi">
              <small id="hlc-kpi1-lbl">{ICONS["trend"]} Consolidated Revenue (MTD)</small>
              <strong class="num" id="hlc-kpi1-val">$1,482,600</strong>
              <span id="hlc-kpi1-sub">▲ +11.4% vs prior period · 6 Entities</span>
            </div>
            <div class="hlc-kpi">
              <small id="hlc-kpi2-lbl">{ICONS["scale"]} Books Reconciled</small>
              <strong class="num" id="hlc-kpi2-val">100.0%</strong>
              <span id="hlc-kpi2-sub">✓ $0.00 statutory variance</span>
            </div>
          </div>

          <div class="hlc-stage" id="hlc-stage">
            <div class="hlc-stage-hdr">
              <span>Group Performance by Vertical</span>
              <button type="button" class="hlc-reset-ind" id="hlc-reset-ind" data-hero-ind="all" hidden>Show All Group</button>
              <small id="hlc-stage-hint">Click a vertical to inspect</small>
            </div>
            <div class="hlc-visual-list">
              <div class="hlc-vrow" data-hero-ind="trading">
                <div class="hlc-vrow-main">
                  <b>{ICONS["trading"]} Auto &amp; Heavy Equipment</b>
                  <small>VIN Stock, Customs &amp; Parts</small>
                </div>
                <div class="hlc-vrow-bar"><i style="width:88%;background:#3B82F6"></i></div>
                <span class="hlc-vrow-badge">24% GP</span>
                <strong class="num">$524,900</strong>
              </div>
              <div class="hlc-vrow" data-hero-ind="hospitality">
                <div class="hlc-vrow-main">
                  <b>{ICONS["hospitality"]} Hospitality &amp; Resorts</b>
                  <small>Outlets, Cabanas, POS &amp; Splits</small>
                </div>
                <div class="hlc-vrow-bar"><i style="width:74%;background:#D9A54A"></i></div>
                <span class="hlc-vrow-badge">34% EBITDA</span>
                <strong class="num">$418,200</strong>
              </div>
              <div class="hlc-vrow" data-hero-ind="manufacturing">
                <div class="hlc-vrow-main">
                  <b>{ICONS["manufacturing"]} Concrete &amp; Manufacturing</b>
                  <small>Batch Plant m³, Fleet &amp; Silos</small>
                </div>
                <div class="hlc-vrow-bar"><i style="width:64%;background:#10B981"></i></div>
                <span class="hlc-vrow-badge">29% GP</span>
                <strong class="num">$361,400</strong>
              </div>
              <div class="hlc-vrow" data-hero-ind="realestate">
                <div class="hlc-vrow-main">
                  <b>{ICONS["realestate"]} Real Estate &amp; Insurance</b>
                  <small>Leases, Policies &amp; Commissions</small>
                </div>
                <div class="hlc-vrow-bar"><i style="width:42%;background:#8B5CF6"></i></div>
                <span class="hlc-vrow-badge">94% Occ.</span>
                <strong class="num">$178,100</strong>
              </div>
            </div>
          </div>

          <div class="hlc-foot-note">
            <span>{ICONS["lock"]} Double-Entry Ledger · Offline Kiosks · Cited Ask ISABI</span>
            <a href="#sandbox" class="hlc-foot-link">Interactive Demo ▸</a>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- SECTION 01: CAPABILITIES, CITED ASK ISABI & 18 MODULES -->
  <section class="sec sec-alt" id="architecture">
    <div class="wrap">
      <div class="sec-head sec-head-split">
        <div>
          <div class="eyebrow">{ICONS["apps"]} 01 · Capabilities, Modules &amp; Cited AI</div>
          <h2>Every Module Your Group Needs. One Unified Ledger.</h2>
          <p>
            Review our four operational pillars and test Ask ISABI live below, or switch tabs to explore all 18 tailored modules.
          </p>
        </div>
        <div class="sec-tabs" role="tablist" aria-label="Platform Views">
          <button type="button" class="sec-tab active" data-arch-view="pillars">{ICONS["cloud"]} Capabilities &amp; Ask ISABI</button>
          <button type="button" class="sec-tab" data-arch-view="apps">{ICONS["apps"]} 18 Custom Modules</button>
        </div>
      </div>

      <!-- TAB PANEL 1 (Default): 4 CORE PILLARS + LIVE ASK ISABI SIMULATOR -->
      <div class="arch-panel" data-arch-panel="pillars">
        <div class="ms-ai-grid">
          <div class="ms-left-col">
            <div class="stack-cards" id="ms-stack-cards">
              <div class="stack-card reveal">
                <div class="stack-card-hdr">
                  <h4>{ICONS["key"]} Tailored Setup, Simple Seats &amp; Full Data Ownership</h4>
                  <span>From $50/Seat</span>
                </div>
                <p>One-time custom setup to build your exact operational workflows and ledger, paired with predictable per-seat monthly pricing and 100% client data ownership.</p>
                <div class="stack-tags">
                  <span>From $3,000 Setup</span>
                  <span>From $50/Seat/Mo</span>
                  <span>100% Data Ownership</span>
                </div>
              </div>

              <div class="stack-card reveal">
                <div class="stack-card-hdr">
                  <h4>{ICONS["apps"]} 360° Record Views, Guided Forms &amp; Kiosks</h4>
                  <span>Daily Operations</span>
                </div>
                <p>Inspect any customer, truck, or voucher in one click, lock past dates, map daily site crews and equipment defects, and print priced invoices or gate passes.</p>
                <div class="stack-tags">
                  <span>360° Record View</span>
                  <span>Invoice / Gate Pass Print</span>
                  <span>Plant &amp; Fleet Control</span>
                </div>
              </div>

              <div class="stack-card reveal">
                <div class="stack-card-hdr">
                  <h4>{ICONS["analytics"]} Executive Dashboards &amp; Printable Statements</h4>
                  <span>Reporting &amp; Close</span>
                </div>
                <p>Switch any dashboard between Year, Month, Week, and Day with instant KPI drilldowns, or print bilingual Statements of Account, Balance Sheet, and Tax Invoices.</p>
                <div class="stack-tags">
                  <span>Year / Month / Week / Day</span>
                  <span>Bilingual A4 Statements</span>
                  <span>One-Click Drilldowns</span>
                </div>
              </div>

              <div class="stack-card reveal">
                <div class="stack-card-hdr">
                  <h4>{ICONS["lock"]} Live Face Sign-In, Permissions &amp; Watchdogs</h4>
                  <span>Security &amp; Audit</span>
                </div>
                <p>Photo-proof face and PIN sign-in, strict company and role permissions, and automatic watchdogs catching missing tickets, fuel anomalies, and overdue balances.</p>
                <div class="stack-tags">
                  <span>Live Face + PIN Sign-In</span>
                  <span>Per-Company Access</span>
                  <span>Automatic Audit Alerts</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Interactive Ask ISABI Simulator -->
          <div class="ai-console" aria-label="Interactive Ask ISABI Simulator">
            <div class="ai-console-hdr">
              <div class="ai-console-title">
                {BADGE_SVG}
                <div>
                  <b>Ask ISABI · Multilingual Ledger Intelligence</b>
                  <small>Answers plain-language questions about your balances, tickets, stock, and receivables in EN, AR, and FR, citing every voucher.</small>
                </div>
              </div>
              <span class="hlc-status"><i></i>Live Sandbox</span>
            </div>

            <div class="ai-scope-bar">
              <span>Active Context: <b id="ai-inline-scope">Group Holding · USD · MTD</b></span>
              <button type="button" class="ai-reset-btn" id="ai-inline-reset" data-ai-reset="1" title="Reset conversation">Reset</button>
            </div>

            <div class="ai-prompt-pills" id="ai-prompt-pills">
              <!-- Populated by JS -->
            </div>

            <div class="ai-thread" id="ai-inline-thread">
              <!-- Populated by JS -->
            </div>

            <form class="ai-console-ftr" id="ai-inline-form">
              <input type="text" id="ai-inline-input" placeholder="Ask ISABI about entries, balances, industries, or pricing..." autocomplete="off">
              <button type="submit" class="btn btn-brass">Ask</button>
            </form>
          </div>
        </div>
      </div>

      <!-- TAB PANEL 2: 18-APP INTERACTIVE GRID + LIVE SPOTLIGHT -->
      <div class="arch-panel" data-arch-panel="apps" data-panel-hidden="1">
        <div class="app-cat-bar" role="tablist" aria-label="Filter App Categories">
          <button type="button" class="app-cat-pill active" data-app-cat="all">{ICONS["apps"]} All 18 Modules</button>
          <button type="button" class="app-cat-pill" data-app-cat="finance">{ICONS["ledger"]} Accounting &amp; Analytics (7)</button>
          <button type="button" class="app-cat-pill" data-app-cat="ops">{ICONS["manufacturing"]} Industry Operations (7)</button>
          <button type="button" class="app-cat-pill" data-app-cat="field">{ICONS["ai"]} Kiosks, AI &amp; HR (4)</button>
        </div>

        <div class="app-suite-grid" id="app-suite-grid" role="listbox" aria-label="ISABI Application Modules">
          <!-- Populated dynamically by JS -->
        </div>

        <div class="app-spotlight" id="app-spotlight" aria-live="polite">
          <!-- Populated dynamically by JS -->
        </div>
      </div>
    </div>
  </section>

  <!-- SECTION 02: INTERACTIVE INDUSTRY BLUEPRINTS -->
  <section class="sec" id="industries">
    <div class="wrap">
      <div class="sec-head">
        <div class="eyebrow">{ICONS["manufacturing"]} 02 · Proven Industry Blueprints</div>
        <h2>Engineered for Complex, Real-World Industries.</h2>
        <p>
          Select an industry below to inspect its custom modules, daily operational flow, and before-and-after transformation.
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

  <!-- SECTION 03: INTERACTIVE LIVE DEMO SANDBOX -->
  <section class="sec sec-alt" id="sandbox">
    <div class="wrap">
      <div class="sec-head sec-head-split">
        <div>
          <div class="eyebrow">{ICONS["erp"]} 03 · Interactive Live Demo</div>
          <h2>Experience the ISABI Command Center Live.</h2>
          <p>
            Switch between 6 live industry environments, inspect a bilingual printable Statement of Account, or test the offline POS till and gate kiosk.
          </p>
        </div>
        <div class="sec-tabs" role="tablist" aria-label="Sandbox Surface Mode">
          <button type="button" class="sec-tab active" data-sbox-mode="erp">{ICONS["analytics"]} Live ERP &amp; Dashboards</button>
          <button type="button" class="sec-tab" data-sbox-mode="soa">{ICONS["soa"]} Printable Statements</button>
          <button type="button" class="sec-tab" data-sbox-mode="pwa">{ICONS["pos"]} Field Kiosks &amp; POS Till</button>
        </div>
      </div>

      <div class="sandbox-controls">
        <div class="sbox-ind-bar" id="sbox-ind-bar" role="group" aria-label="Select Sandbox Industry">
          <!-- Populated by JS -->
        </div>
      </div>

      <div class="sandbox-wrap" id="sandbox-wrap" data-sbox-theme="auto">
        <div class="mock" id="sandbox-mock">
          <!-- Populated dynamically by JS -->
        </div>
      </div>
    </div>
  </section>

  <!-- SECTION 04: WHY ISABI, 14-DAY GO-LIVE SPRINT & OWNER FAQ -->
  <section class="sec" id="ingenuity">
    <div class="wrap">
      <div class="sec-head sec-head-split">
        <div>
          <div class="eyebrow">{ICONS["bolt"]} 04 · Why ISABI, Go-Live &amp; FAQ</div>
          <h2>Why Owners and CFOs Choose ISABI Systems.</h2>
          <p>
            Compare ISABI side by side against Odoo and legacy agencies, walk through our 14-day go-live sprint, or read the top owner and CFO answers.
          </p>
        </div>
        <div class="sec-tabs" role="tablist" aria-label="Select Competitive Proof View">
          <button type="button" class="sec-tab active" data-ing-tab="matrix">{ICONS["compare"]} vs. Odoo &amp; Legacy</button>
          <button type="button" class="sec-tab" data-ing-tab="roadmap">{ICONS["calendar"]} 14-Day Go-Live Sprint</button>
          <button type="button" class="sec-tab" data-ing-tab="faq">{ICONS["faq"]} Owner &amp; CFO FAQ</button>
        </div>
      </div>

      <!-- Panel 1 (Default): Comparison Matrix -->
      <div class="comp-wrap" data-ing-panel="matrix">
        <table class="comp-table" aria-label="Competitive Comparison Matrix">
          <thead>
            <tr>
              <th>Capability / Criterion</th>
              <th class="isabi-col">{ICONS["ai"]} ISABI Systems (Custom ERP &amp; Cited AI)</th>
              <th>{ICONS["box"]} Generic SaaS (Odoo / Zoho / Off-the-Shelf)</th>
              <th>{ICONS["clock"]} Traditional Legacy ERP Consultancies</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><b>{ICONS["apps"]} Fit to Your Workflow</b></td>
              <td class="isabi-col">{ICONS["check"]} 100% tailored workspaces, guided forms &amp; approval rules</td>
              <td>{ICONS["warn"]} Rigid templates and awkward workarounds</td>
              <td>{ICONS["cross"]} Possible only after expensive custom change orders</td>
            </tr>
            <tr>
              <td><b>{ICONS["key"]} Setup &amp; Per-Seat Pricing</b></td>
              <td class="isabi-col">{ICONS["check"]} From $3,000 custom setup + $50 to $100/seat/month</td>
              <td>{ICONS["warn"]} Rigid per-module tiers + costly implementation add-ons</td>
              <td>{ICONS["cross"]} Steep six-figure setup fees plus heavy annual maintenance</td>
            </tr>
            <tr>
              <td><b>{ICONS["analytics"]} Executive Analytics &amp; SOA</b></td>
              <td class="isabi-col">{ICONS["check"]} Built-in interactive dashboards &amp; bilingual printable statements</td>
              <td>{ICONS["warn"]} Basic built-in charts and constant Excel exports</td>
              <td>{ICONS["cross"]} Sold as a separate six-figure BI project</td>
            </tr>
            <tr>
              <td><b>{ICONS["ai"]} AI &amp; Field Kiosks</b></td>
              <td class="isabi-col">{ICONS["check"]} Ask ISABI (EN/AR/FR), audit watchdogs, face sign-in &amp; receipt print</td>
              <td>{ICONS["warn"]} Generic chatbots and third-party POS add-ons</td>
              <td>{ICONS["cross"]} Rarely available or requires external middleware</td>
            </tr>
            <tr>
              <td><b>{ICONS["lock"]} Ownership &amp; Go-Live Speed</b></td>
              <td class="isabi-col">{ICONS["check"]} 100% client-owned system &amp; data, live in 1 to 2 weeks</td>
              <td>{ICONS["warn"]} 2 to 4 months locked inside vendor subscription cloud</td>
              <td>{ICONS["cross"]} 9 to 18 months on aging on-premise servers</td>
            </tr>
            <tr>
              <td><b>{ICONS["user"]} Architect Access</b></td>
              <td class="isabi-col">{ICONS["check"]} Direct access to the principal architect who builds your system</td>
              <td>{ICONS["warn"]} Ticket queues and scripted support agents</td>
              <td>{ICONS["cross"]} Layered account managers and rotating juniors</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Panel 2: 14-Day Go-Live Sprint Roadmap -->
      <div class="sprint-grid" data-ing-panel="roadmap" data-panel-hidden="1" data-mob-hide="1">
        <div class="sprint-card">
          <div class="sprint-day">{ICONS["calendar"]} Days 1 to 3</div>
          <h4>1. Workflow, Accounts &amp; Roles</h4>
          <p>We map your companies, chart of accounts, currencies, and daily operational units (VINs, m³, cabanas, leases, or policies) and set up company and role permissions.</p>
          <span class="sprint-deliverable">✓ Deliverable: Custom workspaces &amp; role permissions</span>
        </div>
        <div class="sprint-card">
          <div class="sprint-day">{ICONS["scope"]} Days 4 to 6</div>
          <h4>2. Forms, 360° Views &amp; Kiosks</h4>
          <p>We configure your guided entry forms, 360-degree record views, date and credit locks, and companion cashier, dispatch, fuel, and attendance kiosks.</p>
          <span class="sprint-deliverable">✓ Deliverable: Guided forms, record views &amp; field kiosks</span>
        </div>
        <div class="sprint-card">
          <div class="sprint-day">{ICONS["analytics"]} Days 7 to 10</div>
          <h4>3. Dashboards &amp; Statements</h4>
          <p>We deliver interactive executive dashboards (with Year, Month, Week, and Day switching) alongside bilingual printable Statements of Account and tax invoices.</p>
          <span class="sprint-deliverable">✓ Deliverable: Executive dashboards &amp; bilingual A4 statements</span>
        </div>
        <div class="sprint-card">
          <div class="sprint-day">{ICONS["bolt"]} Days 11 to 14</div>
          <h4>4. Migration, Watchdogs &amp; Go-Live</h4>
          <p>We import your historical spreadsheets, turn on audit watchdogs and Ask ISABI, reconcile side by side until variance is $0.00, train your team, and go live.</p>
          <span class="sprint-deliverable">✓ Deliverable: Verified zero-variance cutover &amp; team sign-off</span>
        </div>
      </div>

      <!-- Panel 3: Concise 6-Item Owner & CFO FAQ -->
{FAQ_HTML}
    </div>
  </section>

  <!-- SECTION 05: TRANSPARENT PRICING & INTERACTIVE SCOPE BUILDER -->
  <section class="sec sec-alt" id="pricing">
    <div class="wrap">
      <div class="sec-head sec-head-split">
        <div>
          <div class="eyebrow">{ICONS["diamond"]} 05 · Transparent Pricing &amp; Scope</div>
          <h2>Transparent Pricing, Scoped to Your Complexity.</h2>
          <p>
            Choose one of three fixed-scope engagement tiers, or switch to the Custom Scope Builder to see an instant investment range.
          </p>
        </div>
        <div class="sec-tabs" role="tablist" aria-label="Pricing View Switcher">
          <button type="button" class="sec-tab active" data-price-view="tiers">{ICONS["diamond"]} 3 Engagement Tiers</button>
          <button type="button" class="sec-tab" data-price-view="builder">{ICONS["scope"]} Custom Scope Builder</button>
        </div>
      </div>

      <!-- Pricing Panel 1: 3 Tiers + 1-Line Guarantee Bar -->
      <div data-price-panel="tiers">
        <div class="mob-seg-bar" role="tablist" aria-label="Select Engagement Tier">
          <button type="button" class="mob-seg-btn" data-tier-tab="tier1">$3k + $50/seat</button>
          <button type="button" class="mob-seg-btn active" data-tier-tab="tier2">★ $5.6k + $80/seat</button>
          <button type="button" class="mob-seg-btn" data-tier-tab="tier3">$11k+ Group</button>
        </div>

        <div class="pricing-grid" id="pricing-tiers-grid">
          <!-- Tier 1 -->
          <div class="price-card reveal" data-tier-card="tier1" data-mob-hide="1">
            <span class="price-badge">{ICONS["realestate"]} Tier 01 · Single Entity</span>
            <h3>Operational Foundation</h3>
            <p class="price-desc">Ideal for a single company, resort, showroom, plant, or brokerage replacing spreadsheets with one unified operations and accounting suite.</p>
            <div class="price-block">
              <div class="price-val num">$3,000 <small>custom setup</small></div>
              <div class="price-retainer">+$50 / seat / month · Cloud sync, updates &amp; support</div>
            </div>
            <ul class="price-features">
              <li><i>✓</i> <span>Custom modules, double-entry ledger &amp; tailored setup ($50/seat/mo)</span></li>
              <li><i>✓</i> <span>Role-based workspaces, 360° record views &amp; guided entry forms</span></li>
              <li><i>✓</i> <span>Interactive executive dashboards (Sales, Expenses, Receivables, Cash)</span></li>
              <li><i>✓</i> <span>Core bilingual printable statements (Statement of Account &amp; P&amp;L)</span></li>
              <li><i>✓</i> <span>Historical Excel data import and team onboarding</span></li>
            </ul>
            <button type="button" class="btn btn-outline" data-select-tier="Operational Foundation ($3,000 Setup + $50/seat/mo)">Start with This Tier</button>
          </div>

          <!-- Tier 2 (Featured) -->
          <div class="price-card featured reveal" data-tier-card="tier2">
            <span class="price-badge">{ICONS["award"]} Recommended · Most Popular</span>
            <h3>Multi-Entity &amp; AI Operations Suite</h3>
            <p class="price-desc">Complete operational and financial control for multi-branch companies needing role-separated branches, field kiosks, and cited AI.</p>
            <div class="price-block">
              <div class="price-val num">$5,600 <small>custom setup</small></div>
              <div class="price-retainer">+$80 / seat / month · Multi-branch, Ask ISABI AI &amp; priority support</div>
            </div>
            <ul class="price-features">
              <li><i>✓</i> <span>Everything in Operational Foundation across multiple branches ($80/seat/mo)</span></li>
              <li><i>✓</i> <span>Full executive &amp; operational dashboards (Year / Month / Week / Day)</span></li>
              <li><i>✓</i> <span>Complete bilingual statements (SOA, aging, tax invoices &amp; Balance Sheet)</span></li>
              <li><i>✓</i> <span>Multilingual <b>Ask ISABI</b> (EN/AR/FR) &amp; automatic audit watchdogs</span></li>
              <li><i>✓</i> <span>Companion Field Kiosk (POS or Face Attendance) &amp; parallel-run check</span></li>
            </ul>
            <button type="button" class="btn btn-brass" data-select-tier="Multi-Entity & AI Operations Suite ($5,600 Setup + $80/seat/mo)">Start with This Suite</button>
          </div>

          <!-- Tier 3 -->
          <div class="price-card reveal" data-tier-card="tier3" data-mob-hide="1">
            <span class="price-badge">{ICONS["holding"]} Tier 03 · Group &amp; Holding</span>
            <h3>Enterprise Group Ecosystem</h3>
            <p class="price-desc">For multi-industry holding groups and large enterprises running dedicated applications across sister companies with group consolidation.</p>
            <div class="price-block">
              <div class="price-val num">$11,000+ <small>custom group setup</small></div>
              <div class="price-retainer">+$100 / seat / month · Volume group seats &amp; principal advisory</div>
            </div>
            <ul class="price-features">
              <li><i>✓</i> <span>Multiple dedicated industry apps (Hospitality, Trading, Mfg, Real Estate, Insurance)</span></li>
              <li><i>✓</i> <span>Group treasury, partner profit-split engines &amp; intercompany ledgers</span></li>
              <li><i>✓</i> <span>Full Field Kiosk Suite (Dispatch, Quarry, Fuel &amp; Live Face Sign-In)</span></li>
              <li><i>✓</i> <span>Daily Plant &amp; Workforce Map, Fleet Defects &amp; Spare Parts Custody</span></li>
              <li><i>✓</i> <span>Hussein Bdeir works with you directly from design to go-live</span></li>
            </ul>
            <button type="button" class="btn btn-outline" data-select-tier="Enterprise Group Ecosystem ($11,000+ Setup + $100/seat/mo)">Request Custom Group Proposal</button>
          </div>
        </div>

        <div class="pricing-trust-bar">
          <span>{ICONS["check"]} <b>From $3,000 Setup</b> · Tailored Around Your Workflow</span>
          <span>{ICONS["check"]} <b>$50 to $100 / Seat / Mo</b> · Simple Per-User Pricing</span>
          <span>{ICONS["check"]} <b>$0.00 Variance</b> · Parallel-Tested Before Cutover</span>
          <span>{ICONS["check"]} <b>100% Data Ownership</b> · Direct Principal Delivery</span>
        </div>
      </div>

      <!-- Pricing Panel 2: Interactive Custom Scope & Investment Configurator -->
      <div class="configurator-card" id="scope-configurator" data-price-panel="builder" data-panel-hidden="1">
        <div class="cfg-card-hdr">
          <div>
            <div class="eyebrow">{ICONS["scope"]} Interactive Scope &amp; Investment Builder</div>
            <h3>Build Your Scope and See an Indicative Range Instantly</h3>
          </div>
          <p>
            Choose your industry, scale, and modules. Your selections attach automatically to your WhatsApp or email inquiry.
          </p>
        </div>

        <div class="cfg-grid">
          <div>
            <div class="cfg-group">
              <h4>1. Select Your Primary Industry</h4>
              <div class="cfg-pills" id="cfg-ind-pills">
                <button type="button" class="cfg-pill active" data-cfg-ind="Hospitality & Resorts">{ICONS["hospitality"]} Hospitality &amp; Resorts</button>
                <button type="button" class="cfg-pill" data-cfg-ind="Automotive & Heavy Equipment Trading">{ICONS["trading"]} Auto &amp; Equipment Trading</button>
                <button type="button" class="cfg-pill" data-cfg-ind="Concrete, Construction & Manufacturing">{ICONS["manufacturing"]} Concrete &amp; Manufacturing</button>
                <button type="button" class="cfg-pill" data-cfg-ind="Real Estate & Property Portfolio">{ICONS["realestate"]} Real Estate Portfolio</button>
                <button type="button" class="cfg-pill" data-cfg-ind="Insurance Brokerage">{ICONS["insurance"]} Insurance Brokerage</button>
                <button type="button" class="cfg-pill" data-cfg-ind="Multi-Entity Holding Group">{ICONS["holding"]} Multi-Entity Holding</button>
                <button type="button" class="cfg-pill" data-cfg-ind="Retail, Distribution & Other">{ICONS["box"]} Retail / Distribution / Custom</button>
              </div>
            </div>

            <div class="cfg-group">
              <h4>2. Number of Operating Entities / Locations</h4>
              <div class="cfg-pills" id="cfg-scale-pills">
                <button type="button" class="cfg-pill" data-cfg-scale="1" data-scale-label="Single Entity (1 Location)" data-scale-add="0" data-seat-rate="50">{ICONS["pin"]} 1 Entity / Location</button>
                <button type="button" class="cfg-pill active" data-cfg-scale="2" data-scale-label="Multi-Branch (2 to 4 Entities)" data-scale-add="1300" data-seat-rate="80">{ICONS["realestate"]} 2 to 4 Entities</button>
                <button type="button" class="cfg-pill" data-cfg-scale="5" data-scale-label="Group Estate (5 to 8 Entities)" data-scale-add="3000" data-seat-rate="90">{ICONS["manufacturing"]} 5 to 8 Entities</button>
                <button type="button" class="cfg-pill" data-cfg-scale="10" data-scale-label="Enterprise Holding (9+ Entities)" data-scale-add="5500" data-seat-rate="100">{ICONS["holding"]} 9+ Entities</button>
              </div>
            </div>

            <div class="cfg-group" style="margin-bottom:0">
              <h4>3. Choose the Modules to Include</h4>
              <div class="cfg-checks" id="cfg-mod-checks">
                <label class="cfg-check active">
                  <input type="checkbox" value="Core Operations, Guided Forms & Double-Entry Ledger" data-cost="3000" data-wks="2" checked disabled>
                  <div>
                    <b>{ICONS["ledger"]} Core Operations &amp; Double-Entry Ledger</b>
                    <small>Custom modules, 360° record views, COA &amp; role setup (Included)</small>
                  </div>
                </label>
                <label class="cfg-check active">
                  <input type="checkbox" value="Interactive Executive & Operations Dashboards" data-cost="900" data-wks="1" checked>
                  <div>
                    <b>{ICONS["analytics"]} Interactive Executive Dashboards</b>
                    <small>Year / Month / Week / Day switching, KPI drilldowns &amp; breakdowns</small>
                  </div>
                </label>
                <label class="cfg-check active">
                  <input type="checkbox" value="Bilingual Printable Statements & SOA" data-cost="700" data-wks="1" checked>
                  <div>
                    <b>{ICONS["soa"]} Printable Statements &amp; SOA</b>
                    <small>Sortable A4 Balance Sheet, P&amp;L, Cash Flow, SOA &amp; Tax Invoices</small>
                  </div>
                </label>
                <label class="cfg-check active">
                  <input type="checkbox" value="Ask ISABI AI & Automatic Audit Watchdogs" data-cost="900" data-wks="1" checked>
                  <div>
                    <b>{ICONS["ai"]} Ask ISABI &amp; Audit Watchdogs</b>
                    <small>EN/AR/FR cited answers + missing-ticket, pricing &amp; overdue alerts</small>
                  </div>
                </label>
                <label class="cfg-check">
                  <input type="checkbox" value="Offline Cashier POS & Thermal Receipt Till" data-cost="1100" data-wks="1">
                  <div>
                    <b>{ICONS["pos"]} Offline Cashier POS &amp; Receipt Till</b>
                    <small>Touch cashier terminal, wireless thermal receipts &amp; auto sync</small>
                  </div>
                </label>
                <label class="cfg-check">
                  <input type="checkbox" value="Plant, Gate & Live Face Sign-In Kiosks" data-cost="900" data-wks="1">
                  <div>
                    <b>{ICONS["kiosk"]} Plant, Gate &amp; Face Sign-In Kiosks</b>
                    <small>Dispatch, weighbridge, fuel, live face attendance &amp; daily crew map</small>
                  </div>
                </label>
                <label class="cfg-check">
                  <input type="checkbox" value="Parallel Accounting Reconciliation & Data Import" data-cost="800" data-wks="1">
                  <div>
                    <b>{ICONS["scale"]} Parallel Reconciliation &amp; Migration</b>
                    <small>Historical spreadsheet import &amp; side-by-side accounting balance check</small>
                  </div>
                </label>
                <label class="cfg-check">
                  <input type="checkbox" value="Automated Recruitment & Private CV Vault" data-cost="650" data-wks="1">
                  <div>
                    <b>{ICONS["hr"]} Recruitment &amp; Private CV Vault</b>
                    <small>Applicant intake, per-company routing &amp; HR review pipeline</small>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div class="cfg-summary">
            <div>
              <div style="font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--brass);margin-bottom:6px">{ICONS["copy"]} Live Scope Summary</div>
              <h4 style="font-size:20px;margin-bottom:4px" id="cfg-out-title">Hospitality &amp; Resorts System</h4>
              <div style="font-size:13px;color:var(--muted)" id="cfg-out-scale">Multi-Branch (2 to 4 Entities) · $80/seat/mo</div>

              <table class="cfg-sum-table">
                <tbody id="cfg-out-rows">
                  <!-- Populated by JS -->
                </tbody>
                <tfoot>
                  <tr class="tot">
                    <td id="cfg-out-tot-lbl">Custom Setup (+$80/seat/mo)</td>
                    <td class="r num" id="cfg-out-total">$6,800 to $8,200</td>
                  </tr>
                </tfoot>
              </table>

              <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--muted);margin-bottom:16px">
                <span>Estimated Delivery Window:</span>
                <strong style="color:var(--ink)" id="cfg-out-weeks">1 to 2 Weeks</strong>
              </div>
              <p style="font-size:12.5px;color:var(--muted);margin:0 0 18px">
                Final pricing is confirmed after a 30-minute call with Hussein Bdeir to review your chart of accounts, entities, and workflows.
              </p>
            </div>

            <div style="display:flex;flex-direction:column;gap:10px">
              <button type="button" class="btn btn-wa" id="cfg-wa-btn" style="width:100%">{ICONS["wa"]} Send This Scope to Hussein on WhatsApp</button>
              <button type="button" class="btn btn-brass" id="cfg-portal-btn" style="width:100%">{ICONS["download"]} Load Into the Inquiry Form</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- SECTION 06: WHATSAPP & EMAIL CUSTOMER CONTACT PORTAL -->
  <section class="sec" id="portal">
    <div class="wrap">
      <div class="sec-head">
        <div class="eyebrow">{ICONS["phone"]} 06 · Direct Consultation</div>
        <h2>Start Building Your System With Hussein Bdeir.</h2>
        <p>
          Send a concise project brief below, or reach Hussein directly on WhatsApp or by email.
        </p>
      </div>

      <!-- Mobile Switcher for Consultation Portal -->
      <div class="mob-seg-bar" role="tablist" aria-label="Select Contact Method">
        <button type="button" class="mob-seg-btn active" data-portal-tab="form">{ICONS["copy"]} Project Brief Form</button>
        <button type="button" class="mob-seg-btn" data-portal-tab="direct">{ICONS["wa"]} Direct WhatsApp &amp; Email</button>
      </div>

      <div class="portal-grid">
        <div class="portal-form-card" data-portal-panel="form">
          <div class="portal-card-hdr">
            <h3>{ICONS["copy"]} Project Brief</h3>
            <span id="portal-tier-note">Scope selections attach automatically</span>
          </div>

          <form id="lead-portal-form" novalidate>
            <input type="hidden" id="lead-budget" value="Multi-Entity &amp; AI Operations Suite ($5,600 Setup + $80/seat/mo)">
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
                <label for="lead-contact">Your Phone or Email *</label>
                <input type="text" id="lead-contact" placeholder="+961 ... or name@company.com" required>
              </div>
              <div class="form-field">
                <label for="lead-industry">Primary Industry</label>
                <select id="lead-industry">
                  <option value="Hospitality & Resorts">Hospitality, Resorts &amp; Beach Clubs</option>
                  <option value="Automotive & Heavy Equipment Trading">Automotive &amp; Heavy Equipment Trading</option>
                  <option value="Concrete, Construction & Manufacturing">Concrete, Construction &amp; Manufacturing</option>
                  <option value="Real Estate & Property Portfolio">Real Estate &amp; Property Management</option>
                  <option value="Insurance Brokerage">Insurance Brokerage &amp; Underwriting</option>
                  <option value="Multi-Entity Holding Group">Multi-Entity Holding Group</option>
                  <option value="Retail, Distribution & Other">Retail, Distribution &amp; Custom</option>
                </select>
              </div>
            </div>

            <div class="form-field">
              <label for="lead-notes">Operational Goals (Optional)</label>
              <textarea id="lead-notes" rows="3" placeholder="Tell us briefly about your entities, current accounting or Excel setup, and what you want solved..."></textarea>
            </div>

            <div class="portal-dispatch-btns">
              <button type="button" class="btn btn-wa" id="portal-send-wa" style="padding:10px 14px;font-size:13.5px">
                {ICONS["wa"]} Send on WhatsApp
              </button>
              <button type="button" class="btn btn-brass" id="portal-send-email" style="padding:10px 14px;font-size:13.5px">
                {ICONS["mail"]} Send via Email
              </button>
            </div>
          </form>
        </div>

        <div class="portal-direct-card" data-portal-panel="direct" data-mob-hide="1">
          <div>
            <div class="pd-head">
              {BADGE_SVG}
              <div>
                <div class="pd-kicker">Direct Principal Access</div>
                <h3 class="pd-name">Hussein Bdeir</h3>
                <div class="pd-role">Founder &amp; Principal Systems Architect · ISABI Systems</div>
              </div>
            </div>

            <div class="direct-channel-box">
              <small>{ICONS["wa"]} WhatsApp &amp; Direct Mobile (Fastest Response)</small>
              <strong class="num">+961 70 444 955</strong>
              <p>Message Hussein on WhatsApp to discuss your operations, book a live walkthrough, or review pricing.</p>
              <a href="https://wa.me/96170444955?text=Hello%20Hussein%2C%20I%20would%20like%20to%20schedule%20a%20discovery%20call%20regarding%20an%20ISABI%20Systems%20implementation." target="_blank" rel="noopener" class="btn btn-wa" style="width:100%">{ICONS["wa"]} Open Direct WhatsApp Chat</a>
            </div>

            <div class="direct-channel-box">
              <small>{ICONS["mail"]} Email</small>
              <strong>hbdeir16@gmail.com</strong>
              <p>Send RFP documents, chart of accounts structures, or formal project inquiries directly to Hussein's inbox.</p>
              <div style="display:flex;gap:8px">
                <a href="mailto:hbdeir16@gmail.com?subject=ISABI%20Systems%20-%20Enterprise%20Software%20Inquiry" class="btn btn-brass" style="flex:1">{ICONS["mail"]} Compose Email</a>
                <button type="button" class="btn btn-outline" id="copy-email-btn">Copy Email</button>
              </div>
            </div>
          </div>

          <div class="pd-steps-box">
            <div class="pd-steps-kicker">What Happens After You Reach Out</div>
            <ol class="pd-steps-list">
              <li><b>30-Minute Discovery Call:</b> We review your entities, your current spreadsheets or software, and where reporting hurts.</li>
              <li><b>Live Production Walkthrough:</b> See real ISABI systems running across hospitality, trading, manufacturing, real estate, and insurance.</li>
              <li><b>Fixed-Scope Blueprint &amp; Timeline:</b> You receive a clear proposal listing the exact modules, reports, timeline, and investment.</li>
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
        <div class="ftr-brand-row">
          {BADGE_SVG}
          <div>
            <b style="font-family:Archivo,sans-serif;font-size:17px;display:block;letter-spacing:0.04em">ISABI SYSTEMS</b>
            <span class="ftr-brand-sub">The ERP Your Group Actually Runs On</span>
          </div>
        </div>
        <p class="ftr-desc">
          Custom operations, double-entry accounting, live dashboards, printable statements, field kiosks, and cited AI with tailored setup and simple per-seat plans.
        </p>
        <div class="ftr-contact">
          <b>{ICONS["wa"]} Direct WhatsApp:</b> <a href="https://wa.me/96170444955" target="_blank" rel="noopener">+961 70 444 955</a><br>
          <b>{ICONS["mail"]} Direct Email:</b> <a href="mailto:hbdeir16@gmail.com">hbdeir16@gmail.com</a>
        </div>
      </div>

      <div class="ftr-col">
        <h4>Industry Blueprints</h4>
        <ul>
          <li><a href="#industries" data-goto-ind="hospitality">{ICONS["hospitality"]} Hospitality, Resorts &amp; Beach Clubs</a></li>
          <li><a href="#industries" data-goto-ind="trading">{ICONS["trading"]} Automotive &amp; Heavy Equipment Trading</a></li>
          <li><a href="#industries" data-goto-ind="manufacturing">{ICONS["manufacturing"]} Ready-Mix Concrete &amp; Manufacturing</a></li>
          <li><a href="#industries" data-goto-ind="realestate">{ICONS["realestate"]} Real Estate &amp; Property Portfolios</a></li>
          <li><a href="#industries" data-goto-ind="insurance">{ICONS["insurance"]} Insurance Brokerage Operations</a></li>
          <li><a href="#industries" data-goto-ind="holding">{ICONS["holding"]} Multi-Entity Holding Groups</a></li>
        </ul>
      </div>

      <div class="ftr-col">
        <h4>Platform</h4>
        <ul>
          <li><a href="#architecture">{ICONS["cloud"]} Capabilities &amp; Ask ISABI</a></li>
          <li><a href="#sandbox">{ICONS["erp"]} Interactive Live Demo</a></li>
          <li><a href="#ingenuity">{ICONS["compare"]} vs. Odoo &amp; 14-Day Go-Live</a></li>
          <li><a href="#faq">{ICONS["faq"]} Owner &amp; CFO FAQ</a></li>
          <li><a href="app/">{ICONS["lock"]} Sign In to Command Center</a></li>
        </ul>
      </div>

      <div class="ftr-col">
        <h4>Start a Project</h4>
        <ul>
          <li><a href="#pricing">{ICONS["diamond"]} Transparent Investment Tiers</a></li>
          <li><a href="#scope-configurator">{ICONS["scope"]} Custom Scope Builder</a></li>
          <li><a href="https://wa.me/96170444955" target="_blank" rel="noopener">{ICONS["wa"]} WhatsApp (+961 70 444 955)</a></li>
          <li><a href="mailto:hbdeir16@gmail.com">{ICONS["mail"]} Email Hussein Bdeir</a></li>
          <li><a href="#portal" id="ftr-install-link">{ICONS["download"]} Install App Shortcut</a></li>
        </ul>
      </div>
    </div>

    <div class="ftr-bottom">
      <span>© <span id="ftr-year">2026</span> ISABI Systems. Founded and architected by Hussein Bdeir. All rights reserved.</span>
      <span>Custom Setup + Per-Seat Plans · Operations &amp; Accounting · Executive Dashboards · Printable Statements · Field Kiosks · Ask ISABI AI</span>
    </div>
  </div>
</footer>

<!-- MOBILE BOTTOM BAR -->
<nav class="mobile-dock" aria-label="Mobile Quick Actions">
  <a href="#industries" data-sec-link="industries" class="dock-btn">{ICONS["manufacturing"]} Industries</a>
  <a href="#sandbox" data-sec-link="sandbox" class="dock-btn">{ICONS["erp"]} Live Demo</a>
  <button type="button" class="dock-btn brass" id="mob-ask-btn">{ICONS["ai"]} Ask ISABI</button>
  <a href="https://wa.me/96170444955?text=Hello%20Hussein%2C%20I%20am%20interested%20in%20ISABI%20Systems." target="_blank" rel="noopener" class="dock-btn wa">{ICONS["wa"]} WhatsApp</a>
</nav>

<!-- SLIDE-OVER ASK ISABI AI DRAWER -->
<div class="drawer-backdrop" id="ai-drawer-backdrop" hidden>
  <aside class="ai-drawer" role="dialog" aria-modal="true" aria-label="Ask ISABI System Intelligence">
    <div class="ai-drawer-hdr">
      <div class="ai-drawer-title">
        {BADGE_SVG}
        <div>
          <b>ISABI · System Intelligence</b>
          <small>Ask about custom modules, industry fit, field kiosks, pricing, or live ledger numbers</small>
        </div>
      </div>
      <button type="button" class="btn btn-ghost" id="close-ai-drawer">Close</button>
    </div>
    <div class="ai-scope-bar">
      <span>Active Context: <b id="ai-drawer-scope">Group Holding · USD · MTD</b></span>
      <button type="button" class="ai-reset-btn" id="ai-drawer-reset" data-ai-reset="1" title="Reset conversation">Reset</button>
    </div>
    <div class="ai-drawer-body" id="ai-drawer-thread">
      <!-- Populated by JS -->
    </div>
    <form class="ai-drawer-ftr" id="ai-drawer-form">
      <input type="text" id="ai-drawer-input" placeholder="Ask ISABI about your industry, features, kiosks, or pricing..." autocomplete="off">
      <button type="submit" class="btn btn-brass">Ask</button>
    </form>
  </aside>
</div>

<!-- TOAST NOTIFICATION -->
<div class="toast" id="site-toast" hidden></div>
"""
