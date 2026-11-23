# HTML body for the ISABI Systems showcase: eight one-screen pages plus three "more" pages
# (Live Demo, Industry Blueprints, FAQ) that open from buttons and from the footer.
# Translation matches visible English text exactly, so keep every text node on one line.
from part_dicons import dic, tile
from part_icons import ICONS

WA_URL = 'https://wa.me/96170444955'
WA_HELLO = WA_URL + '?text=Hello%20Hussein%2C%20I%20visited%20the%20ISABI%20Systems%20portal%20and%20would%20like%20to%20discuss%20building%20a%20custom%20system%20for%20our%20business.'
EMAIL = 'hbdeir@isabisystems.com'
LOGO_VER = '1'

NAV = [
    ('platform', 'Platform'),
    ('ask', 'Ask ISABI'),
    ('golive', 'Implementation'),
    ('why', 'Why ISABI'),
    ('pricing', 'Pricing'),
    ('proof', 'In Practice'),
]

SHEETS = [
    ('sandbox', 'monitor', 'Live Demo'),
    ('industries', 'layers', 'Industry Blueprints'),
    ('faq', 'help', 'FAQ'),
]

HERO_TABS = [
    ('all', 'layers', 'Group overview'),
    ('trading', 'truck', 'Auto and heavy equipment'),
    ('hospitality', 'bell', 'Hospitality and resorts'),
    ('manufacturing', 'factory', 'Concrete and manufacturing'),
    ('realestate', 'building', 'Real estate and insurance'),
]

HERO_BARS = [
    ('trading', 'Auto and heavy equipment', '$524,900', 88, '#2356A8'),
    ('hospitality', 'Hospitality and resorts', '$418,200', 70, '#C0892F'),
    ('manufacturing', 'Concrete and manufacturing', '$361,400', 61, '#1F7A4C'),
    ('realestate', 'Real estate and insurance', '$178,100', 30, '#7A889B'),
]

HERO_FACTS = [
    ('key', 'br', 'From $3,000 setup', 'Custom-built for your business'),
    ('users', 'bl', 'From $50 per seat', 'Simple monthly plans'),
    ('clock', 'gr', 'Live in 1 to 2 weeks', 'Balances verified before cutover'),
    ('db', 'br', '100% data ownership', 'Export your data anytime'),
]

INDUSTRIES = [
    ('manufacturing', 'factory', 'gr', 'Concrete and Manufacturing'),
    ('hospitality', 'bell', 'br', 'Hospitality and Resorts'),
    ('realestate', 'building', 'bl', 'Real Estate and Property'),
    ('trading', 'truck', 'bl', 'Auto and Heavy Equipment'),
    ('insurance', 'shield', 'gr', 'Insurance Brokerage'),
    ('holding', 'layers', 'br', 'Holding and Group'),
]

MODULE_GROUPS = [
    ('Accounting and Analytics', '7 modules', 'br', False, [
        ('book', 'General Ledger and COA', 'Double-entry and period locks'),
        ('doc', 'Printable Statements', 'Bilingual A4 and automatic matching'),
        ('chart', 'Executive Dashboards', 'Cockpit and What-If Studio'),
        ('card', 'Receivables and Credit', 'Aging and credit gates'),
        ('pie', 'Partner Equity Splits', 'Capital and profit sharing'),
        ('scale', 'Accountant Book Bridge', 'Side-by-side accounting sync'),
        ('wallet', 'Treasury and PDC Vault', 'Banks, cash and checks'),
    ]),
    ('Industry Operations', '7 modules', 'bl', False, [
        ('bell', 'Hospitality and Resorts', 'Outlets, cabanas and F&amp;B'),
        ('truck', 'VIN and Equipment Trade', 'Chassis, customs and parts'),
        ('factory', 'Ready-Mix and Batching', 'Tickets, silos and controls'),
        ('pin', 'Fleet GPS and Workforce Map', 'Live GPS, fuel and parts'),
        ('building', 'Real Estate and Leases', 'Units, rent and yield'),
        ('shield', 'Insurance Bordereaux', 'Policies, splits and claims'),
        ('layers', 'Holding and Group View', 'Group close and governance'),
    ]),
    ('Kiosks, AI and HR', '4 modules', 'gr', True, [
        ('chat', 'Ask ISABI and Watchdogs', 'Cited AI, voice and 28 alerts'),
        ('receipt', 'Offline POS Till', 'Thermal print and offline sync'),
        ('face', 'Live Face and PIN Kiosk', 'Photo-proof gate sign-in'),
        ('userplus', 'Recruitment and CV Vault', 'Applicant intake and HR'),
    ]),
]

FEATURES = [
    ('sliders', 'bl', 'What-If Scenario Studio', 'Stress-test price, volume, FX and 30-day cash runway.'),
    ('mic', 'gr', 'Explain and Listen', 'A spoken briefing of any dashboard or statement.'),
    ('scan', 'br', 'Smart Scan and phone QR', 'Scan invoices or chassis VINs with the camera.'),
    ('pin', 'bl', 'Fleet GPS and workforce map', 'Live truck GPS, fuel sensors and crew locations.'),
    ('shield', 'gr', 'Close locks and 28 watchdogs', 'Match statements, lock periods, catch price creep.'),
]

STEPS = [
    ('1', 'Days 1 to 3', 'users', 'br', 'Workflow, accounts and roles', 'We map your companies, chart of accounts, currencies and daily operational units, then set up company and role permissions.', 'Custom workspaces and role permissions'),
    ('2', 'Days 4 to 6', 'scan', 'bl', 'Guided forms and kiosks', 'We configure guided forms with Smart Scan, 360-degree record views, and cashier, dispatch, fuel and attendance kiosks.', 'Guided forms, record views and field kiosks'),
    ('3', 'Days 7 to 10', 'chart', 'gr', 'Cockpits and statements', 'We deliver the CEO cockpit, the What-If studio, interactive dashboards, spoken briefings and bilingual printable statements.', 'Cockpits, What-If studio and A4 statements'),
    ('4', 'Days 11 to 14', 'shield', 'br', 'Reconcile, train and go live', 'We import your spreadsheets, reconcile balances with automated statement matching, train your team and go live.', 'Verified side-by-side cutover and team sign-off'),
]

COMPARE = [
    ('sliders', 'br', 'Fit to your workflow', '100% tailored workspaces, guided forms and interactive page tours', 'Rigid templates and awkward workarounds', 'Possible only after expensive change orders'),
    ('wallet', 'bl', 'Setup and pricing', 'From $3,000 custom setup plus $50 to $100 per seat per month', 'Per-module tiers plus costly implementation add-ons', 'Six-figure setup fees plus heavy annual maintenance'),
    ('chart', 'gr', 'Analytics and statements', 'What-If scenario studio, 30-day cash bridge and bilingual statements', 'Basic built-in charts and constant Excel exports', 'Sold as a separate BI project'),
    ('chat', 'br', 'AI, telematics and kiosks', 'Spoken briefings in three languages, Smart Scan, fleet GPS and face kiosks', 'Generic chatbots and third-party POS add-ons', 'Rarely available, or requires external middleware'),
    ('db', 'bl', 'Ownership and speed', '100% client-owned data, automated close locks, live in 1 to 2 weeks', '2 to 4 months, locked inside the vendor cloud', '9 to 18 months on aging on-premise servers'),
    ('users', 'gr', 'Who you work with', 'Direct access to the principal architect who builds your system', 'Ticket queues and scripted support agents', 'Layered account managers and rotating juniors'),
]

TIERS = [
    ('tier1', False, 'building', 'bl', 'Single entity', 'Operational Foundation',
     'For one company, resort, showroom, plant or brokerage replacing spreadsheets with one suite.',
     '$3,000', '+ $50 per seat per month',
     ['Custom modules and double-entry ledger', 'Role-based workspaces, Smart Scan and phone QR', 'Dashboards with spoken briefings', 'Statement matching and month-end locks'],
     'Operational Foundation ($3,000 Setup + $50/seat/mo)', 'Start with This Tier'),
    ('tier2', True, 'layers', 'br', 'Recommended · Multi-branch', 'Multi-Entity and AI Operations Suite',
     'Full control for multi-branch companies that need separated branches, field kiosks and cited AI.',
     '$5,600', '+ $80 per seat per month',
     ['Everything in Operational Foundation, across branches', 'What-If Scenario Studio and 30-day cash bridge', 'Ask ISABI live voice, step-up 2FA and 28 watchdogs', 'One companion field kiosk: POS or face attendance'],
     'Multi-Entity & AI Operations Suite ($5,600 Setup + $80/seat/mo)', 'Start with This Suite'),
    ('tier3', False, 'pie', 'gr', 'Group and holding', 'Enterprise Group Ecosystem',
     'For multi-industry holding groups running dedicated applications across sister companies.',
     '$11,000+', '+ $100 per seat per month',
     ['Multiple dedicated industry applications', '14-entity group close and intercompany ledgers', 'Full kiosk suite, live fleet GPS and fuel sensors', 'Hussein Bdeir with you from design to go-live'],
     'Enterprise Group Ecosystem ($11,000+ Setup + $100/seat/mo)', 'Request a Group Proposal'),
]

LOGOS = [
    ('logo-wtc.png', 'WTC, World Trading and Construction', 280, 280, 'd-logo-sq'),
    ('logo-blanca.png', 'Blanca Ladies Resort', 251, 280, 'd-logo-sq'),
    ('logo-la-una.png', 'La Una Ladies Resort', 420, 148, 'd-logo-wide'),
    ('logo-palms.png', 'The Palms Ladies Resort', 299, 280, 'd-logo-sq'),
    ('logo-voile.png', 'Voile Sur Mer Ladies Resort', 420, 209, 'd-logo-mid'),
]

PROOF = [
    ('truck', 'gr', 'Every load priced and checked', 'More than 26,000 truckloads, each priced from its customer agreement and checked against the truck&rsquo;s logged size.'),
    ('receipt', 'br', 'Till close against booked revenue', 'Each resort&rsquo;s till close is checked against its booked revenue, and VAT is separated automatically.'),
    ('layers', 'bl', 'Sister companies kept in step', 'Money passed between sister companies is paired on both sides, so balances agree before the group closes.'),
    ('scale', 'gr', 'Books that tie out', 'Stock and P&amp;L reconcile to the statutory accounts, and the trial balance carries a $0.00 variance.'),
]


def _header(badge, wordmark):
    nav = '\n'.join(f'      <a href="#{sid}" data-sec-link="{sid}">{lbl}</a>' for sid, lbl in NAV)
    sheet_nav = '\n'.join(
        f'      <a href="#{sid}" data-sheet-link="{sid}">{dic(icon, "d-ic-sm")}<span>{lbl}</span></a>' for sid, icon, lbl in SHEETS)
    strip = '\n'.join(f'    <a href="#{sid}" data-sec-link="{sid}">{lbl}</a>' for sid, lbl in NAV)
    strip_sheets = '\n'.join(
        f'    <a href="#{sid}" data-sheet-link="{sid}">{dic(icon, "d-ic-xs")}<span>{lbl}</span></a>' for sid, icon, lbl in SHEETS)
    return f"""
<header class="d-header" id="site-header">
  <div class="d-hdr-in">
    <a href="#top" class="d-brand" aria-label="ISABI Systems Home">
      {badge}
      {wordmark}
    </a>
    <nav class="d-nav" id="main-nav" aria-label="Primary Navigation">
{nav}
    </nav>
    <nav class="d-nav d-nav-sheet" id="sheet-nav" aria-label="More Pages" hidden>
      <button type="button" class="d-back" data-sheet-close="1">{dic('chev_l', 'd-ic-sm d-flip')}<span>Back to Site</span></button>
{sheet_nav}
    </nav>
    <div class="d-hdr-acts">
      <div class="d-lang" id="hdr-lang-switch" role="group" aria-label="Language">
        <span role="button" tabindex="0" class="lang-pill active" data-lang-switch="en" aria-pressed="true">EN</span>
        <span role="button" tabindex="0" class="lang-pill" data-lang-switch="ar" aria-pressed="false" lang="ar">عربي</span>
        <span role="button" tabindex="0" class="lang-pill" data-lang-switch="fr" aria-pressed="false">FR</span>
      </div>
      <button type="button" class="d-iconbtn" id="theme-toggle-btn" aria-label="Switch Theme">{dic('moon', 'd-ic-sm d-theme-moon')}{dic('sun', 'd-ic-sm d-theme-sun')}</button>
      <a href="app/" class="d-signin" id="hdr-signin-btn" aria-label="Sign In">{dic('lock', 'd-ic-sm')}<span>Sign In</span></a>
      <a href="#portal" class="d-btn d-btn-p d-btn-sm d-hdr-cta">Book Consultation</a>
    </div>
  </div>
  <nav class="d-strip" id="mobile-sec-nav" aria-label="Section Navigation">
{strip}
    <a href="#portal" data-sec-link="portal">Contact</a>
    <i class="d-strip-sep" aria-hidden="true"></i>
{strip_sheets}
  </nav>
  <nav class="d-strip d-strip-sheet" id="mobile-sheet-nav" aria-label="More Pages" hidden>
    <button type="button" class="d-back" data-sheet-close="1">{dic('chev_l', 'd-ic-xs d-flip')}<span>Back to Site</span></button>
{strip_sheets}
  </nav>
</header>

<a class="skip-link" href="#platform">Skip to content</a>
"""


def _hero(badge):
    tabs = '\n'.join(
        f'            <button type="button" class="d-tab{" d-on" if tid == "all" else ""}" data-hero-ind="{tid}" aria-pressed="{"true" if tid == "all" else "false"}">{dic(icon)}<span>{lbl}</span></button>'
        for tid, icon, lbl in HERO_TABS)
    bars = '\n'.join(
        f'                <button type="button" class="d-bar-row" data-hero-ind="{bid}"><span class="d-bar-name">{name}</span><span class="d-bar-track"><i style="width:{pct}%;background:{color}"></i></span><span class="d-bar-amt num">{amt}</span></button>'
        for bid, name, amt, pct, color in HERO_BARS)
    facts = '\n'.join(
        f'        <div class="d-fact">{tile(icon, tone, "d-tile-40")}<div><div class="d-fact-a">{a}</div><div class="d-fact-b">{b}</div></div></div>'
        for icon, tone, a, b in HERO_FACTS)
    return f"""
  <section class="d-page d-hero" id="hero" aria-label="Introduction">
    <div class="d-wrap">
      <div class="d-chip">{dic('clock', 'd-ic-xs')}<span>Tailored enterprise ERP · Live in 1 to 2 weeks</span></div>
      <h1 class="d-hd d-h1">The ERP Your Group <span class="d-brass">Actually Runs On</span>.</h1>
      <p class="d-hero-lead">Daily operations, double-entry accounting, dashboards, field kiosks and cited AI in one system, tailored to how your business runs.</p>
      <div class="d-cta-row">
        <a class="d-btn d-btn-p" href="#sandbox" data-sheet-open="sandbox">{dic('monitor')}<span>Explore Live Demo</span></a>
        <a class="d-btn d-btn-s" href="#industries" data-sheet-open="industries">{dic('layers')}<span>Industry Blueprints</span></a>
        <a class="d-btn d-btn-t" href="{WA_HELLO}" target="_blank" rel="noopener">{dic('wa')}<span>WhatsApp Direct</span></a>
      </div>

      <div class="d-card d-preview" aria-label="Interactive Command Center Preview">
        <div class="d-prev-top">
          <div class="d-prev-brand">{badge}<span id="hlc-window-title">ISABI Command Center</span></div>
          <span class="d-prev-hint">Demo data · Click a vertical to inspect</span>
        </div>
        <div class="d-prev-body">
          <div class="d-prev-tabs" id="hlc-tabs" role="group" aria-label="Select a vertical">
{tabs}
          </div>
          <div class="d-prev-stage" id="hlc-stage" aria-live="polite">
            <div class="d-prev-head">
              <div class="d-hd d-prev-title">Group overview</div>
              <div class="d-prev-scope">Consolidated · 6 entities</div>
            </div>
            <div class="d-kpis">
              <div class="d-kpi">
                <div class="d-kpi-l">Consolidated revenue, month to date</div>
                <div class="d-kpi-v num" id="hlc-kpi1-val">$1,482,600</div>
                <div class="d-kpi-s">+11.4% vs prior month</div>
              </div>
              <div class="d-kpi">
                <div class="d-kpi-l">Net operating profit</div>
                <div class="d-kpi-v num" id="hlc-kpi2-val">$384,200</div>
                <div class="d-kpi-s">25.9% margin · Books balanced</div>
              </div>
            </div>
            <div class="d-bars">
{bars}
            </div>
            <div class="d-prev-foot">
              <span class="d-prev-var">Statutory vs operational variance: $0.00</span>
              <a href="app/?demo=1&amp;autologin=1" id="hlc-open-portal-link" class="d-textlink"><span>Open the full portal</span>{dic('arrow', 'd-ic-sm d-flip')}</a>
            </div>
          </div>
        </div>
      </div>

      <div class="d-facts" aria-label="Core Guarantees">
{facts}
      </div>
    </div>
  </section>
"""


def _platform(badge):
    inds = '\n'.join(
        f'        <a class="d-ind" href="#industries" data-goto-ind="{iid}">{tile(icon, tone, "d-tile-36")}<span class="d-ind-name">{name}</span>{dic("chev_r", "d-ic-xs d-flip d-ind-go")}</a>'
        for iid, icon, tone, name in INDUSTRIES)
    groups = []
    for gname, count, tone, promo, items in MODULE_GROUPS:
        rows = '\n'.join(
            f'            <div class="d-mod">{tile(icon, tone, "d-tile-36")}<div class="d-mod-txt"><div class="d-mod-name">{name}</div><div class="d-mod-sub">{sub}</div></div></div>'
            for icon, name, sub in items)
        promo_html = ''
        if promo:
            promo_html = f"""
            <a class="d-promo" href="#ask">
              {badge}
              <span class="d-promo-txt"><b>Ask in English, Arabic or French.</b> <span>Every answer cites its vouchers.</span></span>
              {dic('arrow', 'd-ic-sm d-flip')}
            </a>"""
        groups.append(f"""
        <div class="d-card d-group">
          <div class="d-group-head">
            <h3 class="d-hd">{gname}</h3>
            <span>{count}</span>
          </div>
          <div class="d-group-body">
{rows}{promo_html}
          </div>
        </div>""")
    return f"""
  <section class="d-page d-white" id="platform">
    <div class="d-wrap">
      <div class="d-head-split">
        <div>
          <div class="d-eyebrow">The platform</div>
          <h2 class="d-hd d-h2">Every module your group needs. One unified ledger.</h2>
        </div>
        <p class="d-lead d-lead-side">Eighteen tailored modules, proven in six industries. Each one posts to the same double-entry ledger.</p>
      </div>
      <div class="d-inds" aria-label="Industry Blueprints">
{inds}
      </div>
      <div class="d-groups">{''.join(groups)}
      </div>
    </div>
  </section>
"""


def _ask(badge):
    feats = '\n'.join(
        f'          <div class="d-card d-feat">{tile(icon, tone)}<div><div class="d-feat-name">{name}</div><div class="d-feat-sub">{sub}</div></div></div>'
        for icon, tone, name, sub in FEATURES)
    return f"""
  <section class="d-page" id="ask">
    <div class="d-wrap d-two">
      <div>
        <div class="d-eyebrow">Built-in intelligence</div>
        <h2 class="d-hd d-h2">Ask it. Test it. Scan it.</h2>
        <p class="d-lead d-ask-lead">The tools your team reaches for every day are part of the system, in English, Arabic and French.</p>
        <div class="d-feats">
{feats}
        </div>
      </div>

      <div class="ai-console d-console" aria-label="Interactive Ask ISABI Simulator">
        <div class="ai-console-hdr">
          <div class="ai-console-title">
            <span class="d-tile d-t-br">{badge}</span>
            <div>
              <b>Ask ISABI</b>
              <small>Every answer about your books cites its vouchers</small>
            </div>
          </div>
          <div class="d-console-chips">
            <span class="d-chip-live">{dic('mic', 'd-ic-xs')}<span>Live voice</span></span>
            <span class="d-chip-lang" data-no-i18n="1">EN · <span lang="ar">عربي</span> · FR</span>
          </div>
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
          <input type="text" id="ai-inline-input" aria-label="Ask ISABI a question" placeholder="Ask ISABI about entries, balances, industries, or pricing..." autocomplete="off">
          <button type="submit" class="btn btn-brass">Ask</button>
        </form>
      </div>
    </div>
  </section>
"""


def _golive():
    steps = '\n'.join(f"""        <div class="d-step">
          <div class="d-step-top"><span class="d-step-n">{n}</span><span class="d-step-days">{days}</span><span class="d-step-line"></span></div>
          <div class="d-card d-step-card">
            {tile(icon, tone)}
            <h3 class="d-hd">{title}</h3>
            <p>{text}</p>
            <div class="d-step-out">{dic('check', 'd-ic-sm d-ok')}<span>{out}</span></div>
          </div>
        </div>""" for n, days, icon, tone, title, text, out in STEPS)
    return f"""
  <section class="d-page d-white" id="golive">
    <div class="d-wrap">
      <div class="d-eyebrow">Implementation</div>
      <h2 class="d-hd d-h2">Live in 1 to 2 weeks, with balances verified before cutover.</h2>
      <p class="d-lead">A four-stage sprint takes you from the first workshop to a signed-off go-live. You see a working system at every stage.</p>
      <div class="d-steps">
{steps}
      </div>
    </div>
  </section>
"""


def _why(badge):
    rows = '\n'.join(f"""          <div class="d-row" role="row">
            <div class="d-cmp-k" role="rowheader">{tile(icon, tone, "d-tile-36")}<span>{k}</span></div>
            <div class="d-cmp-a" role="cell" data-col-lbl="ISABI Systems">{dic('check', 'd-ic-sm d-ok')}<span>{a}</span></div>
            <div class="d-cmp-b" role="cell" data-col-lbl="Generic SaaS">{dic('warn', 'd-ic-sm d-warn')}<span>{b}</span></div>
            <div class="d-cmp-c" role="cell" data-col-lbl="Traditional ERP consultancies">{dic('cross', 'd-ic-sm d-crit')}<span>{c}</span></div>
          </div>""" for icon, tone, k, a, b, c in COMPARE)
    return f"""
  <section class="d-page" id="why">
    <div class="d-wrap">
      <div class="d-head-split d-head-tight">
        <div>
          <div class="d-eyebrow">Why ISABI</div>
          <h2 class="d-hd d-h2">How ISABI compares.</h2>
        </div>
        <a class="d-btn d-btn-s d-btn-sm" href="#faq" data-sheet-open="faq">{dic('help', 'd-ic-sm')}<span>Owner and CFO FAQ</span>{dic('chev_r', 'd-ic-xs d-flip')}</a>
      </div>
      <div class="d-card d-cmp" role="table" aria-label="Competitive Comparison Matrix">
        <div class="d-row d-rowhead" role="row">
          <div role="columnheader">Criterion</div>
          <div class="d-cmp-a" role="columnheader">{badge}<span>ISABI Systems</span></div>
          <div role="columnheader">Generic SaaS (Odoo, Zoho, off-the-shelf)</div>
          <div role="columnheader">Traditional ERP consultancies</div>
        </div>
{rows}
      </div>
    </div>
  </section>
"""


def _configurator():
    """Custom Scope Builder: markup and ids kept from the earlier site (the script reads them)."""
    return f"""
      <div class="configurator-card d-builder" id="scope-configurator" data-price-panel="builder" data-panel-hidden="1">
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
                    <small>Custom modules, 360° views, interactive page guide &amp; role setup (Included)</small>
                  </div>
                </label>
                <label class="cfg-check active">
                  <input type="checkbox" value="Interactive Executive & Operations Dashboards" data-cost="900" data-wks="1" checked>
                  <div>
                    <b>{ICONS["analytics"]} Interactive Executive Dashboards</b>
                    <small>CEO Cockpit, What-If Scenario Studio, 30-day cash bridge &amp; spoken briefs</small>
                  </div>
                </label>
                <label class="cfg-check active">
                  <input type="checkbox" value="Bilingual Printable Statements & SOA" data-cost="700" data-wks="1" checked>
                  <div>
                    <b>{ICONS["soa"]} Printable Statements &amp; SOA</b>
                    <small>Bilingual A4 statements, automated statement matching &amp; period-close locks</small>
                  </div>
                </label>
                <label class="cfg-check active">
                  <input type="checkbox" value="Ask ISABI AI & Automatic Audit Watchdogs" data-cost="900" data-wks="1" checked>
                  <div>
                    <b>{ICONS["ai"]} Ask ISABI &amp; Audit Watchdogs</b>
                    <small>EN/AR/FR voice AI, Smart Scan, Phone QR, Step-Up 2FA &amp; 28 watchdogs</small>
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
                    <small>Dispatch, weighbridge, live fleet GPS telematics, fuel &amp; face attendance</small>
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
              <div class="cfg-sum-kicker">{ICONS["copy"]} Live Scope Summary</div>
              <h4 class="cfg-sum-title" id="cfg-out-title">Hospitality &amp; Resorts System</h4>
              <div class="cfg-sum-scale" id="cfg-out-scale">Multi-Branch (2 to 4 Entities) · $80/seat/mo</div>

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

              <div class="cfg-sum-weeks">
                <span>Estimated Delivery Window:</span>
                <strong id="cfg-out-weeks">1 to 2 Weeks</strong>
              </div>
              <p class="cfg-sum-note">
                Final pricing is confirmed after a 30-minute call with Hussein Bdeir to review your chart of accounts, entities, and workflows.
              </p>
            </div>

            <div class="cfg-sum-acts">
              <button type="button" class="btn btn-wa" id="cfg-wa-btn">{dic('wa', 'd-ic-sm')} Send This Scope to Hussein on WhatsApp</button>
              <button type="button" class="btn btn-brass" id="cfg-portal-btn">{ICONS["download"]} Load Into the Inquiry Form</button>
            </div>
          </div>
        </div>
      </div>
"""


def _pricing():
    cards = []
    for tid, featured, icon, tone, tag, name, desc, setup, seat, feats, sel, cta in TIERS:
        lis = '\n'.join(f'              <li>{dic("check", "d-ic-sm d-ok")}<span>{f}</span></li>' for f in feats)
        sel_attr = sel.replace('&', '&amp;')
        cards.append(f"""
          <div class="d-card d-tier{' d-tier-on' if featured else ''}" data-tier-card="{tid}">
            <div class="d-tier-head">
              {tile(icon, tone)}
              <div>
                <div class="d-tier-tag">{tag}</div>
                <h3 class="d-hd">{name}</h3>
              </div>
            </div>
            <p class="d-tier-desc">{desc}</p>
            <div class="d-tier-price">
              <div class="d-tier-setup"><span class="num">{setup}</span> <small>custom setup</small></div>
              <div class="d-tier-seat">{seat}</div>
            </div>
            <ul class="d-tier-feats">
{lis}
            </ul>
            <button type="button" class="d-btn {'d-btn-p' if featured else 'd-btn-s'}" data-select-tier="{sel_attr}">{cta}</button>
          </div>""")
    return f"""
  <section class="d-page d-white" id="pricing">
    <div class="d-wrap">
      <div class="d-head-split">
        <div>
          <div class="d-eyebrow">Pricing</div>
          <h2 class="d-hd d-h2">Transparent pricing, scoped to your complexity.</h2>
        </div>
        <div class="d-pills" role="group" aria-label="Pricing View Switcher">
          <button type="button" class="d-pill active" data-price-view="tiers" aria-pressed="true">{dic('tag', 'd-ic-sm')}<span>3 Engagement Tiers</span></button>
          <button type="button" class="d-pill" data-price-view="builder" aria-pressed="false">{dic('sliders', 'd-ic-sm')}<span>Custom Scope Builder</span></button>
        </div>
      </div>

      <div data-price-panel="tiers">
        <div class="d-tiers" id="pricing-tiers-grid">{''.join(cards)}
        </div>
        <div class="d-trust">
          <span>{dic('check', 'd-ic-sm d-ok')}<span>Cloud sync, updates and support included</span></span>
          <span>{dic('check', 'd-ic-sm d-ok')}<span>Balances verified before go-live</span></span>
          <span>{dic('check', 'd-ic-sm d-ok')}<span>Full data ownership</span></span>
        </div>
      </div>
{_configurator()}
    </div>
  </section>
"""


def _proof():
    logos = '\n'.join(
        f'        <img class="d-logo {cls}" src="{src}?v={LOGO_VER}" alt="{alt}" width="{w}" height="{h}" loading="lazy" decoding="async">'
        for src, alt, w, h, cls in LOGOS)
    facts = '\n'.join(
        f'        <div class="d-proof-item">{tile(icon, tone, "d-tile-40")}<div><div class="d-proof-name">{name}</div><div class="d-proof-text">{text}</div></div></div>'
        for icon, tone, name, text in PROOF)
    return f"""
  <section class="d-page" id="proof">
    <div class="d-wrap">
      <div class="d-center">
        <div class="d-eyebrow">In practice</div>
        <h2 class="d-hd d-h2">Used every day in our own companies.</h2>
        <p class="d-lead">ISABI was built inside a family group of companies in Lebanon, and it still follows their sales, purchases, payroll and cash every day.</p>
      </div>
      <div class="d-card d-logos" aria-label="Companies that run on ISABI">
{logos}
      </div>
      <p class="d-logos-note">With sister companies in parts distribution, truck imports, property and the family holding.</p>
      <div class="d-proof">
{facts}
      </div>
    </div>
  </section>
"""


def _contact(badge):
    return f"""
  <section class="d-page d-white" id="portal">
    <div class="d-wrap">
      <div class="d-eyebrow">Direct consultation</div>
      <h2 class="d-hd d-h2">Start building your system with Hussein Bdeir.</h2>
      <p class="d-lead d-contact-lead">Send a short project brief, or reach Hussein directly on WhatsApp or by email.</p>
      <div class="d-contact">
        <div class="d-card d-brief">
          <div class="d-card-head">
            {tile('doc', 'br')}
            <div><h3 class="d-hd">Project brief</h3><div class="d-card-sub" id="portal-tier-note">Your pricing selection attaches automatically</div></div>
          </div>
          <form id="lead-portal-form" novalidate>
            <input type="hidden" id="lead-budget" value="Multi-Entity &amp; AI Operations Suite ($5,600 Setup + $80/seat/mo)">
            <div class="d-fields">
              <label class="d-field" for="lead-name"><span>Your full name</span><input type="text" id="lead-name" placeholder="e.g. Karim Mansour" autocomplete="name" required></label>
              <label class="d-field" for="lead-company"><span>Company or group name</span><input type="text" id="lead-company" placeholder="e.g. Cedar Industrial Group" autocomplete="organization" required></label>
              <label class="d-field" for="lead-contact"><span>Phone or email</span><input type="text" id="lead-contact" placeholder="+961 ... or name@company.com" required></label>
              <label class="d-field" for="lead-industry"><span>Primary industry</span>
                <select id="lead-industry">
                  <option value="Hospitality & Resorts">Hospitality, Resorts &amp; Beach Clubs</option>
                  <option value="Automotive & Heavy Equipment Trading">Automotive &amp; Heavy Equipment Trading</option>
                  <option value="Concrete, Construction & Manufacturing">Concrete, Construction &amp; Manufacturing</option>
                  <option value="Real Estate & Property Portfolio">Real Estate &amp; Property Management</option>
                  <option value="Insurance Brokerage">Insurance Brokerage &amp; Underwriting</option>
                  <option value="Multi-Entity Holding Group">Multi-Entity Holding Group</option>
                  <option value="Retail, Distribution & Other">Retail, Distribution &amp; Custom</option>
                </select>
              </label>
            </div>
            <label class="d-field" for="lead-notes"><span>What do you want solved? (optional)</span><textarea id="lead-notes" rows="2" placeholder="Your entities, your current accounting or Excel setup, and where reporting hurts"></textarea></label>
            <div class="d-send">
              <button type="button" class="d-btn d-btn-p" id="portal-send-wa">{dic('wa')}<span>Send on WhatsApp</span></button>
              <button type="button" class="d-btn d-btn-s" id="portal-send-email">{dic('mail')}<span>Send by Email</span></button>
            </div>
          </form>
        </div>

        <div class="d-card d-direct">
          <div class="d-card-head">
            <span class="d-tile d-t-br">{badge}</span>
            <div><h3 class="d-hd">Hussein Bdeir</h3><div class="d-card-sub">Founder and Principal Systems Architect, ISABI Systems</div></div>
          </div>
          <div class="d-channels">
            <a class="d-channel d-channel-wa" href="{WA_URL}?text=Hello%20Hussein%2C%20I%20would%20like%20to%20schedule%20a%20discovery%20call%20regarding%20an%20ISABI%20Systems%20implementation." target="_blank" rel="noopener">
              {tile('wa', 'gr', 'd-tile-40')}
              <span><span class="d-channel-l">WhatsApp, fastest response</span><span class="d-channel-v num">+961 70 444 955</span></span>
            </a>
            <!--email_off--><a class="d-channel" href="mailto:{EMAIL}?subject=ISABI%20Systems%20-%20Enterprise%20Software%20Inquiry">
              {tile('mail', 'bl', 'd-tile-40')}
              <span><span class="d-channel-l">Email</span><span class="d-channel-v d-channel-mail">{EMAIL}</span></span>
            </a><!--/email_off-->
          </div>
          <div class="d-next">
            <div class="d-eyebrow">What happens after you reach out</div>
            <ol>
              <li><span class="d-next-n">1</span><span><b>30-minute discovery call.</b> <span>We review your entities, your current spreadsheets or software, and where reporting hurts.</span></span></li>
              <li><span class="d-next-n">2</span><span><b>Live walkthrough.</b> <span>See ISABI running across the industries closest to yours.</span></span></li>
              <li><span class="d-next-n">3</span><span><b>Fixed-scope blueprint and timeline.</b> <span>A clear proposal listing the modules, reports, timeline and investment.</span></span></li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  </section>
"""


def _sheets(faq_html):
    return f"""
  <!-- MORE PAGE: INDUSTRY BLUEPRINTS -->
  <section class="sec d-sheet" id="industries" data-sheet="industries" hidden>
    <div class="wrap">
      <div class="sec-head">
        <div class="d-sheet-top"><div class="eyebrow">{dic('layers', 'd-ic-xs')} Proven Industry Blueprints</div></div>
        <h2>Engineered for Complex, Real-World Industries.</h2>
        <p>
          Select an industry below to inspect its custom modules, reports, and daily operational workflow from morning standup to month-end close.
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

  <!-- MORE PAGE: INTERACTIVE LIVE DEMO -->
  <section class="sec d-sheet" id="sandbox" data-sheet="sandbox" hidden>
    <div class="wrap">
      <div class="sec-head sec-head-split">
        <div>
          <div class="d-sheet-top"><div class="eyebrow">{dic('monitor', 'd-ic-xs')} Interactive Live Demo</div></div>
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

  <!-- MORE PAGE: OWNER AND CFO FAQ -->
  <section class="sec d-sheet" id="faq" data-sheet="faq" hidden>
    <div class="wrap">
      <div class="sec-head">
        <div class="d-sheet-top"><div class="eyebrow">{dic('help', 'd-ic-xs')} Owner &amp; CFO FAQ</div></div>
        <h2>Answers for Owners and CFOs.</h2>
        <p>
          Pricing, data ownership, month-end close, migration and what happens when the internet drops.
        </p>
      </div>
{faq_html}
    </div>
  </section>
"""


def _footer(badge):
    links = '\n'.join(f'        <a href="#{sid}">{lbl}</a>' for sid, lbl in NAV)
    more = '\n'.join(
        f'        <a href="#{sid}" data-sheet-open="{sid}">{dic(icon, "d-ic-xs")}<span>{lbl}</span></a>' for sid, icon, lbl in SHEETS)
    return f"""
<footer class="d-foot">
  <div class="d-wrap">
    <div class="d-foot-top">
      <div class="d-foot-brand">
        {badge}
        <div>
          <b>ISABI Systems</b>
          <span>The ERP Your Group Actually Runs On</span>
        </div>
      </div>
      <nav class="d-foot-more" aria-label="More Pages">
{more}
      </nav>
      <div class="d-foot-contact">
        <a href="{WA_URL}" target="_blank" rel="noopener">{dic('wa', 'd-ic-xs')}<span class="num">+961 70 444 955</span></a>
        <!--email_off--><a href="mailto:{EMAIL}">{dic('mail', 'd-ic-xs')}<span>{EMAIL}</span></a><!--/email_off-->
      </div>
    </div>
    <div class="d-foot-bottom">
      <span class="d-foot-copy">© <span id="ftr-year">2026</span> <span>ISABI Systems · Beirut, Lebanon</span></span>
      <nav class="d-foot-links" aria-label="Footer Navigation">
{links}
        <a href="#portal">Contact</a>
        <a href="app/">Sign In</a>
      </nav>
      <span class="d-foot-langs" data-no-i18n="1">English · <span lang="ar">عربي</span> · Français</span>
    </div>
  </div>
</footer>
"""


def _drawer(badge):
    return f"""
<!-- SLIDE-OVER ASK ISABI AI DRAWER -->
<div class="drawer-backdrop" id="ai-drawer-backdrop" hidden>
  <aside class="ai-drawer" role="dialog" aria-modal="true" aria-label="Ask ISABI System Intelligence">
    <div class="ai-drawer-hdr">
      <div class="ai-drawer-title">
        {badge}
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
      <input type="text" id="ai-drawer-input" aria-label="Ask ISABI a question" placeholder="Ask ISABI about your industry, features, kiosks, or pricing..." autocomplete="off">
      <button type="submit" class="btn btn-brass">Ask</button>
    </form>
  </aside>
</div>

<!-- TOAST NOTIFICATION -->
<div class="toast" id="site-toast" role="status" hidden></div>
"""


def render_body(badge_svg, wordmark_svg, faq_html):
    b = badge_svg
    return (
        _header(b('b1'), wordmark_svg)
        + '<main id="top">\n<div id="site-pages">'
        + _hero(b('b2'))
        + _platform(b('b3'))
        + _ask(b('b4'))
        + _golive()
        + _why(b('b5'))
        + _pricing()
        + _proof()
        + _contact(b('b6'))
        + '</div>\n'
        + _sheets(faq_html)
        + '</main>\n'
        + _footer(b('b7'))
        + _drawer(b('b8'))
    )
