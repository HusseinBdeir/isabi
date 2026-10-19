# FAQ copy for ISABI Systems PWA: one list feeds the HTML section and the FAQPage JSON-LD
import html
import json

FAQS = [
    ("Do we need to buy Microsoft licences?",
     "Yes. Microsoft bills the licences directly to your own tenant, typically Power Apps for ERP users and Power BI for report readers. "
     "ISABI Systems adds no mark-up and no per-terminal fee for the companion POS and kiosk apps. The exact licence mix is confirmed on the discovery call."),
    ("Who owns the system and the data?",
     "You do. The database, applications, flows, and reports all live inside your Microsoft 365 tenant under your administrators. "
     "ISABI Systems keeps no copy of your data, and the system keeps running if you ever pause the support retainer."),
    ("Does our accountant have to change software?",
     "No. Your statutory books can stay in the software your accountant already uses. ISABI runs as the operational and management ledger and "
     "reconciles against the statutory trial balance every month, down to the last cent. Many clients move the statutory books over later, once they trust the match."),
    ("Can you migrate our history from Excel or a legacy system?",
     "Yes. Historical workbooks and exports are mapped into the new chart of accounts and loaded with the original document numbers and dates kept intact. "
     "The old and new systems then run in parallel until the variance between them is zero, and only then do we cut over."),
    ("How does Ask ISABI treat confidential figures?",
     "Ask ISABI reads data through the same security roles as the signed-in user, so a branch accountant cannot ask about another branch. "
     "Every answer cites the ledger entries or report measures it used, and the assistant runs inside your tenant rather than on a shared public service."),
    ("What happens in the first six weeks?",
     "Weeks 1 to 2 set up the chart of accounts, tables, and security roles. Weeks 2 to 4 add the workflows, approvals, and any field apps. "
     "Weeks 3 to 5 deliver the Power BI models and printable statements. Weeks 5 to 6 wire in Ask ISABI, train the team, and go live."),
    ("Can we start small and add modules later?",
     "Yes. Most clients begin with the Operational Foundation for one company and add branches, Power BI workspaces, field apps, or Ask ISABI as they grow. "
     "Because the data model is yours from day one, nothing has to be rebuilt to add a module."),
    ("Where are you based and who do you work with?",
     "ISABI Systems is based in Lebanon and works remotely with owner-led companies and holding groups across the Middle East and beyond. "
     "Discovery calls, walkthroughs, and training are run over Teams or WhatsApp in the time zone that suits you."),
]


def _item(i, q, a):
    return (
        '        <details class="faq-item reveal"' + (' open' if i == 0 else '') + '>\n'
        '          <summary><span class="faq-n num">' + f'{i + 1:02d}' + '</span><span>' + html.escape(q) + '</span><i class="faq-chev" aria-hidden="true"></i></summary>\n'
        '          <div class="faq-a"><p>' + html.escape(a) + '</p></div>\n'
        '        </details>'
    )


FAQ_HTML = (
    '  <section class="sec" id="faq">\n'
    '    <div class="wrap">\n'
    '      <div class="sec-head">\n'
    '        <div class="eyebrow">07 · Frequently Asked Questions</div>\n'
    '        <h2>The Questions Owners and CFOs Ask First.</h2>\n'
    '        <p>Straight answers on licensing, ownership, migration, and what the first weeks look like. Anything else, ask Hussein directly or try Ask ISABI.</p>\n'
    '      </div>\n'
    '      <div class="faq-grid">\n'
    + '\n'.join(_item(i, q, a) for i, (q, a) in enumerate(FAQS)) + '\n'
    '      </div>\n'
    '      <div class="faq-foot">\n'
    '        <span>Still have a question?</span>\n'
    '        <button type="button" class="btn btn-outline" data-open-ai="What should I know before commissioning an ISABI system?">Ask ISABI</button>\n'
    '        <a href="https://wa.me/96170444955?text=Hello%20Hussein%2C%20I%20have%20a%20question%20about%20ISABI%20Systems." target="_blank" rel="noopener" class="btn btn-wa">Ask Hussein on WhatsApp</a>\n'
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
