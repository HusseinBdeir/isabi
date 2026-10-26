# FAQ copy for ISABI Systems PWA: one concise 6-question list feeds the Why ISABI FAQ tab and the FAQPage JSON-LD
import html
import json
from part_icons import ICONS

# Tuple format: (question, answer, icon_key)
FAQ_ITEMS = [
    ("How do the initial custom setup fee and monthly per-seat pricing work?",
     "Every engagement combines a one-time custom setup fee (starting at $1,500 to build and tailor your workflows, chart of accounts, dashboards, and historical Excel import) with a simple monthly per-seat fee ($15 to $35 per active user) covering cloud sync, backups, updates, and ongoing support.",
     "key"),
    ("Who owns the system and the data?",
     "You do. Every customer record, ledger entry, dashboard, and printable statement belongs to your company under your administrators, with full export access at any time and zero lock-in.",
     "lock"),
    ("Does our accountant have to change software?",
     "No. Your statutory books can stay in the software your accountant already uses. ISABI runs as your daily operational and management double-entry ledger and reconciles against your accountant's trial balance every month down to $0.00 variance.",
     "ledger"),
    ("Can you bring in our history from Excel or an older system?",
     "Yes. Your historical spreadsheets and exports are mapped into your chart of accounts with original document numbers and dates preserved. Old and new systems run side by side until variance is zero before cutover.",
     "sync"),
    ("What happens at our cashier till or plant gate if the internet drops?",
     "Operations continue without interruption. Cashier tills and gate kiosks for dispatch, receiving, fuel, and staff attendance work offline, print priced tax invoices or unpriced gate passes wirelessly, and sync automatically once online.",
     "pos"),
    ("Can we start with one company and keep confidential figures isolated as we grow?",
     "Yes. Most groups launch one operating company first and add sister entities, kiosks, or Ask ISABI later. Strict per-company and per-role permissions ensure staff and Ask ISABI only access their authorized scope.",
     "apps"),
]

FAQS = [(q, a) for (q, a, _ic) in FAQ_ITEMS]


def _item(i, q, a, icon_key):
    icon_svg = ICONS.get(icon_key, ICONS['faq'])
    return (
        '        <details class="faq-item" data-faq-item="1"' + (' open' if i == 0 else '') + '>\n'
        '          <summary><span class="faq-n num">' + icon_svg + ' ' + f'{i + 1:02d}' + '</span><span>' + html.escape(q) + '</span><i class="faq-chev" aria-hidden="true"></i></summary>\n'
        '          <div class="faq-a"><p>' + html.escape(a) + '</p></div>\n'
        '        </details>'
    )


FAQ_HTML = (
    '      <div class="faq-panel" data-ing-panel="faq" data-panel-hidden="1" data-mob-hide="1">\n'
    '        <div class="faq-grid" id="faq-grid">\n'
    + '\n'.join(_item(i, q, a, ic) for i, (q, a, ic) in enumerate(FAQ_ITEMS)) + '\n'
    '        </div>\n'
    '        <div class="faq-foot">\n'
    '          <span>Have a specific question about your chart of accounts, kiosks, or workflow?</span>\n'
    f'          <a href="https://wa.me/96170444955?text=Hello%20Hussein%2C%20I%20have%20a%20question%20about%20ISABI%20Systems." target="_blank" rel="noopener" class="btn btn-wa">{ICONS["wa"]} Ask Hussein on WhatsApp</a>\n'
    '        </div>\n'
    '      </div>'
)

FAQ_JSONLD = json.dumps({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}}
        for q, a in FAQS
    ]
}, ensure_ascii=False)
