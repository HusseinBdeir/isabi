# FAQ copy for ISABI Systems PWA: one list feeds the HTML section and the FAQPage JSON-LD
import html
import json

# Tuple format: (question, answer, category_key, emoji, is_top)
FAQ_ITEMS = [
    ("Do we need to buy Microsoft licences?",
     "Yes. Microsoft bills the licences directly to your own tenant, typically Power Apps for ERP users and Power BI for report readers. "
     "ISABI Systems adds no mark-up and no per-terminal fee for the companion POS and kiosk apps. The exact licence mix is confirmed on the discovery call.",
     "ownership", "🪪", True),
    ("Who owns the system and the data?",
     "You do. The database, applications, flows, and reports all live inside your Microsoft 365 tenant under your administrators. "
     "ISABI Systems keeps no copy of your data, and the system keeps running if you ever pause the support retainer.",
     "ownership", "🔐", True),
    ("How does ISABI compare to Odoo, Zoho, or off-the-shelf ERP?",
     "Off-the-shelf tools like Odoo give you generic modules and charge per user and per app, then require expensive workarounds when your business has partner profit splits, bonded VIN customs, ready-mix batch tickets, or regional Class 1 to 7 charts of accounts. "
     "ISABI builds the exact data model, Power BI suite, printable statements, and offline field apps around your workflow inside your own Microsoft tenant in 1 to 2 weeks.",
     "ai", "⚡", True),
    ("Does our accountant have to change software?",
     "No. Your statutory books can stay in the software your accountant already uses. ISABI runs as the operational and management ledger and "
     "reconciles against the statutory trial balance every month, down to the last cent. Many clients move the statutory books over later, once they trust the match.",
     "accounting", "📒", True),
    ("Can you migrate our history from Excel or a legacy system?",
     "Yes. Historical workbooks and exports are mapped into the new chart of accounts and loaded with the original document numbers and dates kept intact. "
     "The old and new systems then run in parallel until the variance between them is zero, and only then do we cut over.",
     "accounting", "🔄", False),
    ("How does Ask ISABI treat confidential figures?",
     "Ask ISABI reads data through the same security roles as the signed-in user, so a branch accountant cannot ask about another branch. "
     "Every answer cites the ledger entries or report measures it used, and the assistant runs inside your tenant rather than on a shared public service.",
     "ai", "🤖", False),
    ("What happens at our POS till or gate kiosk if the internet drops?",
     "Nothing stops. Both the POS Till and the Biometric Attendance Kiosk are offline-first Progressive Web Apps. "
     "They ring sales, print thermal receipts over Bluetooth, and verify faces and PINs locally on the device, then sync automatically to Dataverse the moment connectivity returns.",
     "ai", "🖨️", False),
    ("What happens in the first two weeks?",
     "Days 1 to 3 set up the chart of accounts, tables, and security roles. Days 3 to 6 add the workflows, approvals, and any field apps. "
     "Days 6 to 10 deliver the Power BI models and printable statements. Days 10 to 14 wire in Ask ISABI, train the team, and go live.",
     "ai", "🚀", False),
    ("Can we start small and add modules later?",
     "Yes. Most clients begin with the Operational Foundation for one company and add branches, Power BI workspaces, field apps, or Ask ISABI as they grow. "
     "Because the data model is yours from day one, nothing has to be rebuilt to add a module.",
     "ownership", "🧩", False),
    ("Where are you based and who do you work with?",
     "ISABI Systems is based in Lebanon and works remotely with owner-led companies and holding groups across the Middle East and beyond. "
     "Discovery calls, walkthroughs, and training are run over Teams or WhatsApp in the time zone that suits you.",
     "ownership", "🌍", False),
]

FAQS = [(q, a) for (q, a, _cat, _em, _top) in FAQ_ITEMS]


def _item(i, q, a, cat, emoji, is_top):
    hide_attr = '' if is_top else ' data-faq-hidden="1"'
    return (
        '        <details class="faq-item reveal" data-faq-item="' + cat + '" data-faq-top="' + ('1' if is_top else '0') + '"' + (' open' if i == 0 else '') + hide_attr + '>\n'
        '          <summary><span class="faq-n num">' + emoji + ' ' + f'{i + 1:02d}' + '</span><span>' + html.escape(q) + '</span><i class="faq-chev" aria-hidden="true"></i></summary>\n'
        '          <div class="faq-a"><p>' + html.escape(a) + '</p></div>\n'
        '        </details>'
    )


FAQ_HTML = (
    '  <section class="sec" id="faq">\n'
    '    <div class="wrap">\n'
    '      <div class="sec-head sec-head-split">\n'
    '        <div>\n'
    '          <div class="eyebrow">💬 07 · Frequently Asked Questions</div>\n'
    '          <h2>The Questions Owners and CFOs Ask First.</h2>\n'
    '          <p>Filter by topic or ask ISABI directly. Straight answers on licensing, ownership, Odoo comparisons, and 2-week delivery.</p>\n'
    '        </div>\n'
    '        <div class="sec-tabs" role="tablist" aria-label="FAQ Categories">\n'
    '          <button type="button" class="sec-tab active" data-faq-cat="top">✨ Top 4</button>\n'
    '          <button type="button" class="sec-tab" data-faq-cat="ownership">🔑 Ownership &amp; Licences</button>\n'
    '          <button type="button" class="sec-tab" data-faq-cat="accounting">📒 Books &amp; Migration</button>\n'
    '          <button type="button" class="sec-tab" data-faq-cat="ai">🤖 AI, Odoo &amp; Speed</button>\n'
    '          <button type="button" class="sec-tab" data-faq-cat="all">📚 All (10)</button>\n'
    '        </div>\n'
    '      </div>\n'
    '      <div class="faq-grid" id="faq-grid">\n'
    + '\n'.join(_item(i, q, a, cat, em, top) for i, (q, a, cat, em, top) in enumerate(FAQ_ITEMS)) + '\n'
    '      </div>\n'
    '      <div class="faq-foot">\n'
    '        <span>💡 Have a specific question about your chart of accounts or workflow?</span>\n'
    '        <button type="button" class="btn btn-outline" data-open-ai="What should I know before commissioning an ISABI system?">🤖 Ask ISABI Live</button>\n'
    '        <a href="https://wa.me/96170444955?text=Hello%20Hussein%2C%20I%20have%20a%20question%20about%20ISABI%20Systems." target="_blank" rel="noopener" class="btn btn-wa">💬 Ask Hussein on WhatsApp</a>\n'
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
