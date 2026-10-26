# FAQ copy for ISABI Systems PWA: one list feeds the HTML section and the FAQPage JSON-LD
import html
import json
from part_icons import ICONS

# Tuple format: (question, answer, category_key, icon_key, is_top)
FAQ_ITEMS = [
    ("Are there any per-user fees or monthly charges as our team grows?",
     "No. ISABI has zero per-user fees. Unlimited executives, accountants, dispatchers, cashiers, and field kiosk tablets operate on one flat build without monthly per-seat charges.",
     "ownership", "key", True),
    ("Who owns the system and the data?",
     "You do. Every customer record, ledger entry, dashboard, and printable statement belongs to your company under your administrators, with full export access at any time. "
     "ISABI Systems keeps no lock-in over your records, and your system keeps running if you ever pause ongoing support.",
     "ownership", "lock", True),
    ("How does ISABI compare to Odoo, Zoho, or off-the-shelf software?",
     "Off-the-shelf tools give you generic screens, charge per user and per module, and force awkward workarounds for partner profit splits, vehicle customs costing, concrete batch tickets, or regional charts of accounts. "
     "ISABI builds the exact workspaces, approval rules, executive dashboards, printable statements, and field kiosks around how your business actually operates in 1 to 2 weeks.",
     "ai", "bolt", True),
    ("Does our accountant have to change software?",
     "No. Your statutory books can stay in the software your accountant already uses. ISABI runs as your daily operational and management double-entry ledger and "
     "reconciles against your accountant's trial balance every month, down to the last cent. Many clients move their statutory books over later once they see the exact match.",
     "accounting", "ledger", True),
    ("Can you bring in our history from Excel or an older system?",
     "Yes. Your historical spreadsheets and exports are mapped into your chart of accounts and imported with original document numbers, transaction dates, and reporting dates preserved. "
     "The old and new systems run side by side until the variance between them is zero, and only then do you cut over.",
     "accounting", "sync", False),
    ("How do Ask ISABI and the audit watchdogs protect confidential figures?",
     "Ask ISABI and the built-in audit watchdogs follow the exact same company and role permissions as the signed-in user, so a branch employee can never query another branch or view restricted payroll. "
     "Every answer cites the exact voucher or ticket behind the number, while background watchdogs flag missing ticket numbers, pricing exceptions, fuel anomalies, and overdue balances automatically.",
     "ai", "ai", False),
    ("What happens at our cashier till or plant gate if the internet drops?",
     "Operations continue without interruption. Cashier tills and gate kiosks for dispatch, receiving, fuel, and staff attendance keep working offline on the tablet. "
     "Staff sign in with live face verification and PIN, print priced tax invoices or unpriced gate passes wirelessly, and everything syncs to the main ledger automatically once the connection returns.",
     "ai", "pos", False),
    ("What happens in the first two weeks?",
     "Days 1 to 3 map your companies, chart of accounts, and role permissions. Days 4 to 6 set up your operational workspaces, guided entry forms, 360-degree record views, and field kiosks. "
     "Days 7 to 10 deliver your interactive executive dashboards and bilingual printable statements. Days 11 to 14 import historical records, turn on audit watchdogs and Ask ISABI, train your team, and go live.",
     "ai", "calendar", False),
    ("Can we start with one company and add more later?",
     "Yes. Most clients start with one operating company and add sister companies, new operational modules, field kiosks, or Ask ISABI as they grow, without rebuilding what is already running.",
     "ownership", "apps", False),
    ("Where are you based and who do you work with?",
     "ISABI Systems is based in Lebanon and works directly with owner-led companies and multi-company groups across the Middle East and worldwide. "
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
    '          <p>Filter by topic or ask ISABI directly. Clear answers on zero per-user fees, data ownership, Odoo comparisons, and 2-week delivery.</p>\n'
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
