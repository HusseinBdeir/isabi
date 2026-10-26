# FAQ copy for ISABI Systems PWA: one list feeds the HTML section and the FAQPage JSON-LD
import html
import json
from part_icons import ICONS

# Tuple format: (question, answer, category_key, icon_key, is_top)
FAQ_ITEMS = [
    ("Are there any per-user seat fees or monthly SaaS user taxes?",
     "No. ISABI runs on a standalone relational SQL and encrypted cloud architecture with zero per-user seat fees. "
     "Unlimited internal executives, accountants, dispatchers, and field kiosk tablets operate on one flat build without per-seat ERP or analytics user taxes.",
     "ownership", "key", True),
    ("Who owns the system and the data?",
     "You do. The relational SQL database, schemas, 22 printable statement templates, and encrypted cloud sync belong to your company under your administrators. "
     "ISABI Systems keeps no hostage lock-in over your records, and your system keeps running if you ever pause the support retainer.",
     "ownership", "lock", True),
    ("How does ISABI compare to Odoo, Zoho, or off-the-shelf ERP?",
     "Off-the-shelf tools like Odoo give you generic modules and charge per user and per app, then require expensive workarounds for partner profit splits, bonded VIN customs, ready-mix batch tickets, or regional Class 1 to 7 charts of accounts. "
     "ISABI compiles the exact 34-table SQL schema, 9 business-cycle hubs, 20 executive dashboards, 22 printable statements, and 4 field kiosks around your workflow in 1 to 2 weeks.",
     "ai", "bolt", True),
    ("Does our accountant have to change software?",
     "No. Your statutory books can stay in the software your accountant already uses. ISABI runs as the operational and management double-entry ledger and "
     "reconciles against the statutory trial balance every month, down to the last cent. Many clients move the statutory books over later once they trust the match.",
     "accounting", "ledger", True),
    ("Can you migrate our history from Excel or a legacy system?",
     "Yes. Historical workbooks and exports are mapped into the new chart of accounts and loaded into PostgreSQL and SQLite with original document numbers, transaction dates, and reporting dates preserved. "
     "The old and new systems run in parallel until the variance between them is zero, and only then do we cut over.",
     "accounting", "sync", False),
    ("How do Ask ISABI and the AI Sentinels treat confidential figures?",
     "Ask ISABI and the autonomous audit sentinels enforce the exact same 10-Industry by 150-Company Row-Level Security as the signed-in user, so a branch accountant cannot query another branch. "
     "Every answer cites exact ledger entries or ticket serials, while background sentinels continuously audit skipped tickets, fuel meters, and 3-leg AP/AR balances.",
     "ai", "ai", False),
    ("What happens at our POS till or plant kiosk if the internet drops?",
     "Nothing stops. Both the POS Till and the Unified 4-Kiosk Suite (Sales Dispatch, Quarry Receiving, Fuel Metering, and 128-d Face ID Attendance) are offline-first Progressive Web Apps. "
     "They verify liveness locally, toggle between Priced Invoices and Unpriced Gate Passes on 80mm or 58mm Bluetooth thermal printers, and sync automatically to the SQL cloud ledger once online.",
     "ai", "pos", False),
    ("What happens in the first two weeks?",
     "Days 1 to 3 compile your SQL relational schema, chart of accounts, and Row-Level Security. Days 4 to 6 configure the 9 business-cycle hubs, 24 smart entry forms, and 4 field kiosks. "
     "Days 7 to 10 deliver the 20 executive dashboards and 22 bilingual printable statements. Days 11 to 14 load historical data, activate AI sentinels and Ask ISABI, train the team, and go live.",
     "ai", "calendar", False),
    ("Can we start small and add modules later?",
     "Yes. Most clients begin with the Operational Foundation for one company and add subsidiaries, executive analytics hubs, biometric or thermal kiosks, or Ask ISABI as they grow. "
     "Because the clean relational SQL model is yours from day one, nothing has to be rebuilt to add a module.",
     "ownership", "apps", False),
    ("Where are you based and who do you work with?",
     "ISABI Systems is based in Lebanon and works remotely with owner-led companies and holding groups across the Middle East and worldwide. "
     "Discovery calls, live sandbox walkthroughs, and team training run over video call or WhatsApp in the time zone that suits you.",
     "ownership", "globe", False),
]

FAQS = [(q, a) for (q, a, _cat, _ic, _top) in FAQ_ITEMS]


def _item(i, q, a, cat, icon_key, is_top):
    hide_attr = '' if is_top else ' data-faq-hidden="1"'
    icon_svg = ICONS.get(icon_key, ICONS['faq'])
    return (
        '        <details class="faq-item reveal" data-faq-item="' + cat + '" data-faq-top="' + ('1' if is_top else '0') + '"' + (' open' if i == 0 else '') + hide_attr + '>\n'
        '          <summary><span class="faq-n num">' + icon_svg + ' ' + f'{i + 1:02d}' + '</span><span>' + html.escape(q) + '</span><i class="faq-chev" aria-hidden="true"></i></summary>\n'
        '          <div class="faq-a"><p>' + html.escape(a) + '</p></div>\n'
        '        </details>'
    )


FAQ_HTML = (
    '  <section class="sec" id="faq">\n'
    '    <div class="wrap">\n'
    '      <div class="sec-head sec-head-split">\n'
    '        <div>\n'
    f'          <div class="eyebrow">{ICONS["faq"]} 07 · Frequently Asked Questions</div>\n'
    '          <h2>The Questions Owners and CFOs Ask First.</h2>\n'
    '          <p>Filter by topic or ask ISABI directly. Straight answers on zero-seat-fee licensing, data ownership, Odoo comparisons, and 2-week delivery.</p>\n'
    '        </div>\n'
    '        <div class="sec-tabs" role="tablist" aria-label="FAQ Categories">\n'
    f'          <button type="button" class="sec-tab active" data-faq-cat="top">{ICONS["award"]} Top 4</button>\n'
    f'          <button type="button" class="sec-tab" data-faq-cat="ownership">{ICONS["key"]} Zero Seat Fees &amp; Ownership</button>\n'
    f'          <button type="button" class="sec-tab" data-faq-cat="accounting">{ICONS["ledger"]} Books &amp; Migration</button>\n'
    f'          <button type="button" class="sec-tab" data-faq-cat="ai">{ICONS["ai"]} AI, Kiosks &amp; Speed</button>\n'
    f'          <button type="button" class="sec-tab" data-faq-cat="all">{ICONS["copy"]} All (10)</button>\n'
    '        </div>\n'
    '      </div>\n'
    '      <div class="faq-grid" id="faq-grid">\n'
    + '\n'.join(_item(i, q, a, cat, ic, top) for i, (q, a, cat, ic, top) in enumerate(FAQ_ITEMS)) + '\n'
    '      </div>\n'
    '      <div class="faq-foot">\n'
    '        <span>Have a specific question about your chart of accounts, kiosks, or workflow?</span>\n'
    f'        <button type="button" class="btn btn-outline" data-open-ai="What should I know before commissioning an ISABI system?">{ICONS["ai"]} Ask ISABI Live</button>\n'
    f'        <a href="https://wa.me/96170444955?text=Hello%20Hussein%2C%20I%20have%20a%20question%20about%20ISABI%20Systems." target="_blank" rel="noopener" class="btn btn-wa">{ICONS["wa"]} Ask Hussein on WhatsApp</a>\n'
    '      </div>\n'
    '    </div>\n'
    '  </section>'
)

FAQ_JSONLD = json.dumps({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}}
        for q, a in FAQS
    ]
}, ensure_ascii=False)
