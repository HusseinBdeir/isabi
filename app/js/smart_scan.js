/* ============================================================================
   ISABI Systems - AI Smart Scan & Auto-Fill Engine (js/smart_scan.js)
   Standalone Multi-Format Document / Receipt / Invoice Classifier & Form Filler
   - Multi-format client reader: PDF (FlateDecode + pdf.js fallback), Images
     (TextDetector + Tesseract OCR), SVG, Excel (.xlsx), Word (.docx), CSV/TXT
   - Cloud AI JSON extraction (MFG_ASK_CFG / server /api/smart-scan) merged with
     deterministic multilingual (EN / AR / FR) ERP parser
   - Frequency-first registry grounding via window.MFG_FREQ (strict usage rank)
   - Cross-industry routing across all 6 ISABI industries + Hospitality TTC rule
   - Multi-line Expense & Repair builders, Price Pending ($0.00), LBP FX,
     locked Tx Date -> Reporting Date + Notes, Document Vault sync & Split Preview
   ============================================================================ */
(function () {
  'use strict';

  let D = null;

  const MAX_SLIP_QUEUE = 20;

  const SCAN_STATE = {
    busy: false,
    domBusy: false,
    entryScanGen: 0,
    domScanGen: 0,
    progressMsg: '',
    lastScan: null,       // { fileMeta, attObj, attObjs, stitchedDataUrl, activePageIdx, extractedText, parsed, matched, appliedForm, appliedIndTpl, filledFields, warnFields, warnings, altForms, engineLabel }
    pendingPrecheckBundle: null,
    pendingDomainPrecheck: null,
    splitOpen: false,
    imgRotateDeg: 0,
    sampleMenuOpen: false,
    suppressResetOnModalSwitch: false,
    suppressDomResetOnSwitch: false,
    blobPreviewUrl: '',
    slipQueue: null,
    advancingQueueOnPost: false,
    activatingSlip: false,
    lastMultiUnits: null,
    slipQueueCounter: 0
  };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function sanitizeOutwardText(s) {
    return String(s == null ? '' : s)
      .replace(/\u2014/g, ' - ')
      .replace(/\u2192/g, ' to ')
      .replace(/\bTHEO\b/gi, 'ISABI');
  }

  function norm(s) {
    return normalizeDigits(String(s == null ? '' : s))
      .normalize('NFD')
      .replace(/[\u0300-\u036f\u064B-\u065F]/g, '')
      .toLowerCase()
      .replace(/[\u2014\u2013\u2192]/g, ' ')
      .replace(/[^\p{L}\p{N}\s.#/-]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeDigits(str) {
    return String(str == null ? '' : str)
      .replace(/[\u0660-\u0669]/g, ch => String(ch.charCodeAt(0) - 0x0660))
      .replace(/[\u06F0-\u06F9]/g, ch => String(ch.charCodeAt(0) - 0x06F0));
  }

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function ic(name, cls) {
    if (window.MFG_ICONS && typeof window.MFG_ICONS.svg === 'function') {
      return window.MFG_ICONS.svg(name, cls);
    }
    return '';
  }

  function isHeadlessEnv() {
    return Boolean(
      (typeof navigator !== 'undefined' && (navigator.webdriver || /HeadlessChrome|HeadlessEdg/i.test(navigator.userAgent || ''))) ||
      window.__MFG_HEADLESS_TEST
    );
  }

  function revokeScanPreviewBlob() {
    if (SCAN_STATE.blobPreviewUrl) {
      try { URL.revokeObjectURL(SCAN_STATE.blobPreviewUrl); } catch (_) {}
      SCAN_STATE.blobPreviewUrl = '';
    }
  }

  // ==================== SAMPLE DOCUMENTS ACROSS ALL 6 INDUSTRIES ====================
  function buildSampleInvoiceSvg(spec) {
    const lines = Array.isArray(spec.lines) ? spec.lines : [];
    const lineRowsSvg = lines.map((ln, idx) => {
      const y = 248 + idx * 24;
      return `<text x="32" y="${y}" font-family="sans-serif" font-size="11.5" fill="#281D15">${esc(ln.desc)}</text>` +
        `<text x="345" y="${y}" font-family="monospace" font-size="11.5" fill="#281D15">${esc(ln.qty)}</text>` +
        `<text x="425" y="${y}" font-family="monospace" font-size="11.5" fill="#281D15">${esc(ln.price)}</text>` +
        `<text x="515" y="${y}" font-family="monospace" font-size="11.5" font-weight="700" fill="#281D15">${esc(ln.total)}</text>`;
    }).join('');
    const footY = 264 + lines.length * 24;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="620" height="${footY + 115}" viewBox="0 0 620 ${footY + 115}">
      <rect width="100%" height="100%" fill="#FCFBF8"/>
      <rect x="14" y="14" width="592" height="${footY + 87}" rx="8" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.2"/>
      <rect x="14" y="14" width="592" height="6" rx="3" fill="#B88228"/>
      <text x="32" y="48" font-family="sans-serif" font-size="16" font-weight="800" fill="#281D15">${esc(spec.docHeader)}</text>
      <text x="32" y="68" font-family="sans-serif" font-size="11.5" fill="#64748B">${esc(spec.issuerLine)}</text>
      <text x="395" y="46" font-family="monospace" font-size="12" font-weight="700" fill="#9A6817">Ref: ${esc(spec.refNo)}</text>
      <text x="395" y="66" font-family="monospace" font-size="11.5" fill="#281D15">Date: ${esc(spec.date)}</text>
      <line x1="32" y1="84" x2="588" y2="84" stroke="#E2E8F0"/>
      <text x="32" y="106" font-family="sans-serif" font-size="11.5" font-weight="700" fill="#281D15">Company: ${esc(spec.company)}</text>
      <text x="32" y="125" font-family="sans-serif" font-size="11.5" fill="#281D15">${esc(spec.partyRole)}: ${esc(spec.counterparty)}</text>
      <text x="32" y="144" font-family="sans-serif" font-size="11.5" fill="#475569">${esc(spec.metaLine1 || '')}</text>
      <text x="32" y="162" font-family="sans-serif" font-size="11.5" fill="#475569">${esc(spec.metaLine2 || '')}</text>
      <rect x="28" y="196" width="564" height="24" rx="4" fill="#F4F2EE"/>
      <text x="34" y="212" font-family="sans-serif" font-size="10.5" font-weight="700" fill="#475569">DESCRIPTION / ITEM</text>
      <text x="345" y="212" font-family="sans-serif" font-size="10.5" font-weight="700" fill="#475569">QTY</text>
      <text x="425" y="212" font-family="sans-serif" font-size="10.5" font-weight="700" fill="#475569">UNIT PRICE</text>
      <text x="515" y="212" font-family="sans-serif" font-size="10.5" font-weight="700" fill="#475569">AMOUNT</text>
      ${lineRowsSvg}
      <line x1="32" y1="${footY - 8}" x2="588" y2="${footY - 8}" stroke="#E2E8F0"/>
      <text x="370" y="${footY + 14}" font-family="monospace" font-size="11.5" fill="#475569">Subtotal: ${esc(spec.subtotal)}</text>
      <text x="370" y="${footY + 32}" font-family="monospace" font-size="11.5" fill="#475569">VAT (11%): ${esc(spec.vat)}</text>
      <text x="370" y="${footY + 54}" font-family="monospace" font-size="13.5" font-weight="800" fill="#166534">Total: ${esc(spec.total)}</text>
      <text x="32" y="${footY + 20}" font-family="sans-serif" font-size="11" fill="#475569">Payment Terms: ${esc(spec.paymentTerms)}</text>
      <text x="32" y="${footY + 40}" font-family="sans-serif" font-size="11" fill="#64748B">Notes: ${esc(spec.notes || '')}</text>
    </svg>`;
  }

  const SAMPLE_SCANS = [
    {
      id: 'mfg_wtc_exp',
      label: 'Manufacturing · Multi-Line Spare Parts Tax Invoice',
      sub: 'WTC · Supplier invoice with 2 parts, Equipment 357925, 11% VAT & prior date',
      fileName: 'WTC_Spare_Parts_Invoice_8841.svg',
      spec: {
        docHeader: 'SUPPLIER TAX INVOICE (MoF VAT)',
        issuerLine: 'Vendor: Amtrac · MoF #109442-601 · Heavy Fleet Parts & Hydraulics',
        refNo: 'INV-WTC-8841',
        date: '2026-10-15',
        company: 'WTC',
        partyRole: 'Supplier',
        counterparty: 'Amtrac',
        metaLine1: 'Category: Spare Parts · Subcategory: Hydraulics',
        metaLine2: 'Target Equipment: 357925 · Allocation: Equipment Maintenance',
        lines: [
          { desc: 'High-Pressure Hydraulic Hose', qty: '2 Piece', price: '$95.00', total: '$190.00' },
          { desc: 'Parker 4SH Telemetry Valve Manifold', qty: '4 Piece', price: '$32.50', total: '$130.00' }
        ],
        subtotal: '$320.00 USD',
        vat: '$35.20 USD',
        total: '$355.20 USD',
        paymentTerms: 'Credit (On Account)',
        notes: 'Workshop replacement on unit 357925'
      }
    },
    {
      id: 'mfg_unpriced_raw',
      label: 'Manufacturing · Unpriced Material Weighbridge Slip',
      sub: 'WTC · Weighbridge slip in Tons with truck 353387 & $0.00 Price Pending',
      fileName: 'Material_Weighbridge_Slip_99204.svg',
      spec: {
        docHeader: 'MATERIAL WEIGHBRIDGE DELIVERY SLIP (UNPRICED)',
        issuerLine: 'Source Site: Sibline · Raw Material Intake Ticket',
        refNo: '99204',
        date: '2026-10-20',
        company: 'WTC',
        partyRole: 'Site Owner',
        counterparty: 'Walid Azar',
        metaLine1: 'Site: Sibline · Material Product: Raml Bab Thani',
        metaLine2: 'Truck: 353387 · Transported By: Company fleet',
        lines: [
          { desc: 'Raml Bab Thani (Raw Material Intake)', qty: '34.80 Ton', price: '$0.00', total: '$0.00' }
        ],
        subtotal: '$0.00 USD',
        vat: '$0.00 USD',
        total: '$0.00 USD (Price Pending)',
        paymentTerms: 'Credit · Unpriced Delivery Slip',
        notes: 'Physical weighbridge slip received at gate; supplier rate pending month-end'
      }
    },
    {
      id: 'hld_ic_wire',
      label: 'Holding & Treasury · Intercompany Bank Wire Advice',
      sub: 'Bdeir Holding · Central treasury incoming wire voucher ($25,000)',
      fileName: 'Holding_Treasury_Wire_4410.svg',
      spec: {
        docHeader: 'BANK WIRE TRANSFER & TREASURY CREDIT ADVICE',
        issuerLine: 'Central Treasury Desk · Beirut CBD Clearing',
        refNo: 'WIRE-HLD-4410',
        date: '2026-10-18',
        company: 'Bdeir Holding',
        partyRole: 'Counterparty',
        counterparty: 'Bdeir Family Holding Trust',
        metaLine1: 'Entry Type: External Treasury Cash Inflow · Direction: Cash In',
        metaLine2: 'Channel: Bank Wire Transfer · Currency: USD',
        lines: [
          { desc: 'Intercompany Sister Liquidity & Capital Call Transfer', qty: '1 Unit', price: '$25,000.00', total: '$25,000.00' }
        ],
        subtotal: '$25,000.00 USD',
        vat: '$0.00 USD',
        total: '$25,000.00 USD',
        paymentTerms: 'Bank Transfer',
        notes: 'Intercompany transfer voucher match WIRE-HLD-4410'
      }
    },
    {
      id: 'hsp_blanca_bill',
      label: 'Hospitality & Resorts · Cellar Commissary Bill (TTC)',
      sub: 'Blanca · Chateau Ksara bill applying Hospitality inclusive TTC rule',
      fileName: 'Blanca_Cellar_Invoice_3109.svg',
      spec: {
        docHeader: 'SUPPLIER DELIVERY & TAX BILL',
        issuerLine: 'Vendor: Chateau Ksara Cellars S.A.L. · MoF #118204-601',
        refNo: 'INV-KSA-3109',
        date: '2026-10-22',
        company: 'Blanca',
        partyRole: 'Supplier',
        counterparty: 'Château Ksara Cellars S.A.L.',
        metaLine1: 'Category: Beverage Supplies · Subcategory: Cellar & Fine Wine',
        metaLine2: 'Destination: Blanca Central Commissary & Cellar',
        lines: [
          { desc: 'Reserve du Couvent & Sunset Blanc Cellar Replenishment', qty: '10 Set', price: '$100.00', total: '$1,000.00' }
        ],
        subtotal: '$1,000.00 USD',
        vat: '$110.00 USD',
        total: '$1,110.00 USD',
        paymentTerms: 'Credit (On Account)',
        notes: 'Resort beverage cellar restock for weekend banquet'
      }
    },
    {
      id: 'trd_shacman_sale',
      label: 'Automotive & Trading · Heavy Truck VIN Sales Invoice',
      sub: 'Shacman · X3000 6x4 Tipper Truck sale to Mount Lebanon Excavation',
      fileName: 'Shacman_Commercial_Sale_7042.svg',
      spec: {
        docHeader: 'COMMERCIAL VEHICLE SALES INVOICE',
        issuerLine: 'Seller: Shacman Levant Heavy Trucks · Zahle PDI Yard',
        refNo: '7042',
        date: '2026-10-24',
        company: 'Shacman',
        partyRole: 'Customer',
        counterparty: 'Mount Lebanon Excavation & Roads S.A.L.',
        metaLine1: 'Product: Shacman X3000 6x4 Tipper Truck (430HP VIN)',
        metaLine2: 'Sale Type: Pickup · Delivery Yard: Shacman Heavy Truck Assembly & PDI Yard',
        lines: [
          { desc: 'Shacman X3000 6x4 Tipper Truck (430HP VIN)', qty: '1 Unit', price: '$98,500.00', total: '$98,500.00' }
        ],
        subtotal: '$98,500.00 USD',
        vat: '$0.00 USD',
        total: '$98,500.00 USD',
        paymentTerms: 'Credit',
        notes: 'Pre-delivery inspection passed; commercial fleet sale #7042'
      }
    },
    {
      id: 're_4235_lease',
      label: 'Real Estate & Property · 4235 Tower Lease Rent Invoice',
      sub: '4235 Company S.A.L · Scheduled commercial floor lease billing',
      fileName: '4235_Tower_Lease_Invoice_118.svg',
      spec: {
        docHeader: 'COMMERCIAL LEASE RENT TAX INVOICE',
        issuerLine: 'Landlord: 4235 Company S.A.L · Beirut Central Corporate Plaza',
        refNo: '4235118',
        date: '2026-10-25',
        company: '4235 Company S.A.L',
        partyRole: 'Tenant / Customer',
        counterparty: 'Anchor Corporate Tenant - Levant Bank HQ',
        metaLine1: 'Product: Corporate Tower Floor Plate Lease (11% VAT)',
        metaLine2: 'Property Site: 4235 Tower Corporate & Medical Plaza',
        lines: [
          { desc: 'Corporate Tower Floor Plate Lease (11% VAT)', qty: '1 Unit', price: '$95,000.00', total: '$95,000.00' }
        ],
        subtotal: '$95,000.00 USD',
        vat: '$10,450.00 USD',
        total: '$105,450.00 USD',
        paymentTerms: 'Credit',
        notes: 'Annual scheduled commercial tower lease rent billing'
      }
    },
    {
      id: 'ins_policy_sched',
      label: 'Insurance & Brokerage · Cargo & CAR Policy Schedule',
      sub: 'Insurance Company · Policy issuance for Phoenicia Maritime Cargo',
      fileName: 'Brokerage_Policy_Schedule_5521.svg',
      spec: {
        docHeader: 'INSURANCE BROKERAGE POLICY SCHEDULE & DEBIT NOTE',
        issuerLine: 'Broker: Insurance Company · Sin El Fil Underwriting Floor',
        refNo: '5521',
        date: '2026-10-26',
        company: 'Insurance Company',
        partyRole: 'Insured / Customer',
        counterparty: 'Phoenicia Maritime Cargo Syndicate',
        metaLine1: 'Policy Line / Product: Contractors All-Risk (CAR) & Marine Cargo',
        metaLine2: 'Underwriting Carrier: Bankers Assurance S.A.L.',
        lines: [
          { desc: 'Contractors All-Risk (CAR) & Marine Cargo', qty: '1 Unit', price: '$6,400.00', total: '$6,400.00' }
        ],
        subtotal: '$6,400.00 USD',
        vat: '$0.00 USD',
        total: '$6,400.00 USD',
        paymentTerms: 'Credit',
        notes: 'Policy schedule #5521 issued with carrier bordereau link'
      }
    }
  ];

  // ==================== MULTI-FORMAT CLIENT EXTRACTION ====================
  function arrayBufferToLatin1(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let out = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return out;
  }

  function extractSvgReadableText(svgMarkup) {
    const safeXml = String(svgMarkup || '').replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
    try {
      const doc = new DOMParser().parseFromString(safeXml, 'image/svg+xml');
      if (!doc.querySelector('parsererror')) {
        const nodes = Array.from(doc.querySelectorAll('text, title, desc'));
        if (nodes.length) {
          return nodes.map(n => (n.textContent || '').trim()).filter(Boolean).join('\n');
        }
      }
    } catch (_) {}
    return safeXml
      .replace(/<\/(?:text|tspan|title|desc)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .split('\n')
      .map(s => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
  }

  async function inflateBytes(compBytes, format) {
    if (typeof DecompressionStream === 'undefined') return null;
    try {
      const ds = new DecompressionStream(format);
      const writer = ds.writable.getWriter();
      writer.write(compBytes);
      writer.close();
      const resp = new Response(ds.readable);
      const ab = await resp.arrayBuffer();
      return new Uint8Array(ab);
    } catch (_) {
      return null;
    }
  }

  function decodePdfLiteralString(raw) {
    let out = '';
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === '\\') {
        const nx = raw[++i] || '';
        if (nx === 'n') out += '\n';
        else if (nx === 'r') out += '\r';
        else if (nx === 't') out += '\t';
        else if (/[0-7]/.test(nx)) {
          let oct = nx;
          if (/[0-7]/.test(raw[i + 1] || '')) oct += raw[++i];
          if (/[0-7]/.test(raw[i + 1] || '')) oct += raw[++i];
          out += String.fromCharCode(parseInt(oct, 8));
        } else {
          out += nx;
        }
      } else {
        out += ch;
      }
    }
    return out;
  }

  function decodePdfHexString(hexRaw) {
    const clean = hexRaw.replace(/\s+/g, '');
    if (/^feff/i.test(clean) && clean.length >= 8) {
      let out = '';
      for (let i = 4; i + 3 < clean.length; i += 4) {
        out += String.fromCharCode(parseInt(clean.slice(i, i + 4), 16));
      }
      return out;
    }
    let out = '';
    for (let i = 0; i + 1 < clean.length; i += 2) {
      const code = parseInt(clean.slice(i, i + 2), 16);
      if (code >= 32 || code === 10 || code === 9) out += String.fromCharCode(code);
    }
    return out;
  }

  function parsePdfContentStreamText(streamStr) {
    const chunks = [];
    const btBlocks = streamStr.match(/\bBT\b[\s\S]*?\bET\b/g) || [streamStr];
    for (const blk of btBlocks) {
      const lineParts = [];
      const tokenRx = /\((?:\\.|[^\\)])*\)\s*Tj|\[(?:\\.|[^\]]|\[)*?\]\s*TJ|<([0-9A-Fa-f\s]+)>\s*Tj|\bT\*|\bTd\b|\bTD\b/g;
      let m;
      while ((m = tokenRx.exec(blk)) !== null) {
        const tok = m[0];
        if (/^(T\*|Td|TD)$/.test(tok.trim())) {
          if (lineParts.length) {
            chunks.push(lineParts.join(''));
            lineParts.length = 0;
          }
          continue;
        }
        if (m[1]) {
          lineParts.push(decodePdfHexString(m[1]));
          continue;
        }
        if (tok.startsWith('(')) {
          const inner = tok.replace(/^\(/, '').replace(/\)\s*Tj$/, '');
          lineParts.push(decodePdfLiteralString(inner));
        } else if (tok.startsWith('[')) {
          const subRx = /\((?:\\.|[^\\)])*\)|<([0-9A-Fa-f\s]+)>|(-?\d+(?:\.\d+)?)/g;
          let sm;
          while ((sm = subRx.exec(tok)) !== null) {
            if (sm[1]) lineParts.push(decodePdfHexString(sm[1]));
            else if (sm[2] !== undefined) {
              if (Number(sm[2]) < -120) lineParts.push(' ');
            } else {
              lineParts.push(decodePdfLiteralString(sm[0].slice(1, -1)));
            }
          }
        }
      }
      if (lineParts.length) chunks.push(lineParts.join(''));
    }
    return chunks
      .map(s => s.replace(/\x00/g, '').trim())
      .filter(Boolean)
      .join('\n');
  }

  async function extractPdfPagesTextClient(arrayBuf) {
    const bytes = new Uint8Array(arrayBuf);
    const rawStr = arrayBufferToLatin1(bytes);
    const pageTexts = [];
    const streamRx = /<<([\s\S]*?)>>\s*stream\r?\n/g;
    let m;
    let count = 0;
    while ((m = streamRx.exec(rawStr)) !== null && count < 120) {
      count++;
      const dict = m[1] || '';
      if (/\/Subtype\s*\/(Image|Form|XML)|\/Type\s*\/Metadata/i.test(dict)) continue;
      const startOffset = m.index + m[0].length;
      const endOffset = rawStr.indexOf('endstream', startOffset);
      if (endOffset <= startOffset) continue;
      let sliceEnd = endOffset;
      if (rawStr[sliceEnd - 1] === '\n') sliceEnd--;
      if (rawStr[sliceEnd - 1] === '\r') sliceEnd--;
      const subBytes = bytes.subarray(startOffset, sliceEnd);
      let decodedStr = '';
      if (/\/FlateDecode/i.test(dict)) {
        const inf = (await inflateBytes(subBytes, 'deflate')) || (await inflateBytes(subBytes, 'deflate-raw'));
        if (inf) decodedStr = arrayBufferToLatin1(inf);
      } else if (!/\/DCTDecode|\/JPXDecode|\/JBIG2Decode/i.test(dict)) {
        decodedStr = arrayBufferToLatin1(subBytes);
      }
      if (decodedStr && /\bBT\b[\s\S]*\bET\b/.test(decodedStr)) {
        const txt = parsePdfContentStreamText(decodedStr);
        if (txt) pageTexts.push(txt);
      }
    }
    if (!pageTexts.length && /\bBT\b[\s\S]*\bET\b/.test(rawStr)) {
      const direct = parsePdfContentStreamText(rawStr);
      if (direct) pageTexts.push(direct);
    }
    return pageTexts;
  }

  async function extractPdfTextClient(arrayBuf) {
    const pages = await extractPdfPagesTextClient(arrayBuf);
    if (pages.length <= 1) return (pages[0] || '').trim();
    return pages.map((p, i) => `=== PAGE ${i + 1} OF ${pages.length} ===\n${p}`).join('\n').trim();
  }

  // ==================== ISO 3779 17-CHAR VIN CHECK-DIGIT & STAMPED-METAL DISAMBIGUATION ====================
  const ISO3779_TRANSLIT = {
    '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
    J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
    S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9
  };
  const ISO3779_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  const STAMPED_METAL_PAIRS = {
    '0': ['D'], D: ['0'],
    '8': ['B'], B: ['8'],
    '5': ['S'], S: ['5'],
    '2': ['Z'], Z: ['2'],
    '6': ['G'], G: ['6'],
    '1': ['7'], '7': ['1']
  };
  const NUMERIC_ONLY_SUB = { D: '0', B: '8', S: '5', Z: '2', G: '6', O: '0', Q: '0', I: '1' };

  function computeIso3779CheckDigit(vin17) {
    const s = String(vin17 || '').toUpperCase();
    if (s.length !== 17) return null;
    let sum = 0;
    for (let i = 0; i < 17; i++) {
      if (i === 8) continue;
      const tv = ISO3779_TRANSLIT[s[i]];
      if (tv === undefined) return null;
      sum += tv * ISO3779_WEIGHTS[i];
    }
    const rem = sum % 11;
    return rem === 10 ? 'X' : String(rem);
  }

  function collectKnownFleetVins() {
    const out = new Set();
    try {
      if (D && typeof D.computeTradingOperations === 'function') {
        const ops = D.computeTradingOperations() || {};
        (ops.serialUnits || []).forEach(u => {
          const v = String((u && (u.chassis_vin || u.vin)) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (v.length === 17 && !/[IOQ]/.test(v)) out.add(v);
        });
        (ops.warrantyRows || []).forEach(w => {
          const v = String((w && (w.vin || w.chassis_vin)) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (v.length === 17 && !/[IOQ]/.test(v)) out.add(v);
        });
      }
      if (D && D.SEED && D.SEED.records) {
        (D.SEED.records.equipment || []).concat(D.SEED.records.company_equipment || []).forEach(eq => {
          const v = String((eq && (eq.vin || eq.chassis_vin)) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (v.length === 17 && !/[IOQ]/.test(v)) out.add(v);
        });
      }
    } catch (_) {}
    return Array.from(out);
  }

  function isStampedConfusionPair(a, b) {
    if (a === b) return true;
    const normA = a === 'O' || a === 'Q' ? '0' : (a === 'I' ? '1' : a);
    const normB = b === 'O' || b === 'Q' ? '0' : (b === 'I' ? '1' : b);
    if (normA === normB) return true;
    return Boolean((STAMPED_METAL_PAIRS[normA] || []).includes(normB));
  }

  function extractVin17CandidateFromText(rawText) {
    const src = String(rawText || '').toUpperCase();
    // 1. Explicit labeled VIN / Chassis line (allows hyphens/spaces inside stamped serial)
    const lblMatch = src.match(/(?:CHASSIS\s*(?:VIN|NO|#)?|VIN(?:\s*(?:NO|#|PLATE|SERIAL))?|FRAME\s*NO)\s*[:#-]?\s*([A-Z0-9][A-Z0-9 -]{15,22}[A-Z0-9])/i);
    if (lblMatch) {
      const compact = lblMatch[1].replace(/[^A-Z0-9]/g, '');
      if (compact.length === 17) return compact;
    }
    // 2. Standalone 17-char alphanumeric token with at least 2 letters and 4 digits (avoids trailer/part codes like TRL60TLB2026KA009 if non-VIN, though still inspects WMI-style tokens)
    const tokens = src.match(/\b[A-Z0-9]{17}\b/g) || [];
    for (const tok of tokens) {
      if (/^TRL\d/i.test(tok)) continue;
      const letters = (tok.match(/[A-Z]/g) || []).length;
      const digits = (tok.match(/[0-9]/g) || []).length;
      if (letters >= 3 && digits >= 5) return tok;
    }
    return '';
  }

  function validateAndDisambiguateVin17(rawInput, opts = {}) {
    const rawStr = String(rawInput == null ? '' : rawInput).trim();
    const compact = rawStr.toUpperCase().replace(/[\s\-./_]+/g, '');
    if (!compact || /^(WH-|PARTS|N\/A|NONE|OPEN)/i.test(compact) || /^TRL\d/i.test(compact)) {
      return {
        isVin17: false,
        isPlaceholder: Boolean(compact),
        raw: rawStr,
        clean: rawStr,
        ioqSanitized: rawStr,
        hasBannedIOQ: false,
        bannedFixed: false,
        disambiguated: false,
        edits: [],
        expectedCheck: null,
        actualCheck: null,
        checkDigitValid: false,
        enforcesMod11Wmi: false,
        statusTone: 'neutral',
        badgeLabel: '',
        summaryText: ''
      };
    }

    if (!/^[A-Z0-9]{17}$/.test(compact)) {
      const hasIOQ = /[IOQ]/.test(compact);
      const sanitizedAny = compact.replace(/I/g, '1').replace(/[OQ]/g, '0');
      return {
        isVin17: false,
        isPlaceholder: false,
        raw: rawStr,
        clean: hasIOQ && opts.sanitizeBanned !== false ? sanitizedAny : compact,
        ioqSanitized: sanitizedAny,
        hasBannedIOQ: hasIOQ,
        bannedFixed: hasIOQ && opts.sanitizeBanned !== false,
        disambiguated: false,
        edits: [],
        expectedCheck: null,
        actualCheck: null,
        checkDigitValid: false,
        enforcesMod11Wmi: false,
        statusTone: compact.length >= 6 ? 'warn' : 'neutral',
        badgeLabel: compact.length >= 6 ? `VIN Length ${compact.length}/17` : '',
        summaryText: compact.length >= 6 ? `ISO 3779 expects 17 characters (currently ${compact.length}).` : ''
      };
    }

    const edits = [];
    const chars = compact.split('');
    let hasBannedIOQ = false;

    // Step 1: Deterministic ISO 3779 I / O / Q Character-Ban Enforcement (O -> 0, I -> 1, Q -> 0)
    for (let i = 0; i < 17; i++) {
      if (chars[i] === 'I' || chars[i] === 'O' || chars[i] === 'Q') {
        hasBannedIOQ = true;
        const rep = chars[i] === 'I' ? '1' : '0';
        edits.push({ pos: i + 1, from: chars[i], to: rep, reason: 'ISO 3779 banned I/O/Q' });
        chars[i] = rep;
      }
    }
    const ioqSanitized = chars.join('');
    let working = ioqSanitized;
    let disambiguated = false;

    const allowStampedFix = Boolean(opts.fromScan || opts.disambiguate);
    if (allowStampedFix) {
      // Step 2a: Disambiguate against known Showroom / Fleet VIN Registry (1-2 stamped-metal confusion edits)
      const knownVins = collectKnownFleetVins();
      let bestFleet = '';
      let bestFleetDist = 99;
      for (const kv of knownVins) {
        if (kv === working) { bestFleet = kv; bestFleetDist = 0; break; }
        let dist = 0;
        let allConfusable = true;
        for (let i = 0; i < 17; i++) {
          if (working[i] !== kv[i]) {
            dist++;
            if (dist > 2 || !isStampedConfusionPair(working[i], kv[i])) {
              allConfusable = false;
              break;
            }
          }
        }
        if (allConfusable && dist > 0 && dist < bestFleetDist) {
          bestFleet = kv;
          bestFleetDist = dist;
        }
      }

      if (bestFleet && bestFleetDist > 0) {
        for (let i = 0; i < 17; i++) {
          if (working[i] !== bestFleet[i]) {
            edits.push({ pos: i + 1, from: working[i], to: bestFleet[i], reason: 'Stamped-metal fleet match' });
          }
        }
        working = bestFleet;
        disambiguated = true;
      } else if (!bestFleet) {
        // Step 2b: Deterministic ISO 3779 § 5.3 VIS numeric tail (positions 14-17 must be digits 0-9) & Pos 9 check digit alphabet (0-9 or X)
        const wChars = working.split('');
        for (let i = 13; i < 17; i++) {
          if (!/[0-9]/.test(wChars[i]) && NUMERIC_ONLY_SUB[wChars[i]]) {
            const toCh = NUMERIC_ONLY_SUB[wChars[i]];
            edits.push({ pos: i + 1, from: wChars[i], to: toCh, reason: 'ISO 3779 VIS numeric serial' });
            wChars[i] = toCh;
            disambiguated = true;
          }
        }
        const enforcesMod11 = /^[1-57L]/.test(wChars[0]);
        if (enforcesMod11 && !/[0-9X]/.test(wChars[8]) && NUMERIC_ONLY_SUB[wChars[8]]) {
          const toCh9 = NUMERIC_ONLY_SUB[wChars[8]];
          edits.push({ pos: 9, from: wChars[8], to: toCh9, reason: 'ISO 3779 Pos-9 check digit' });
          wChars[8] = toCh9;
          disambiguated = true;
        }
        working = wChars.join('');

        // Step 2c: Single-character stamped-metal confusion lattice (0<->D, 8<->B, 5<->S, 2<->Z, 6<->G) verified by Pos-9 Mod-11 Check Digit
        const curExp = computeIso3779CheckDigit(working);
        if (curExp !== null && working[8] !== curExp && enforcesMod11) {
          const validCandidates = [];
          for (let i = 0; i < 17; i++) {
            if (i >= 13 && /[0-9]/.test(working[i])) {
              // In numeric tail, only digit<->digit confusion (1<->7) applies
              const dAlts = working[i] === '1' ? ['7'] : (working[i] === '7' ? ['1'] : []);
              for (const alt of dAlts) {
                const cand = working.slice(0, i) + alt + working.slice(i + 1);
                if (computeIso3779CheckDigit(cand) === cand[8]) {
                  validCandidates.push({ cand, pos: i + 1, from: working[i], to: alt });
                }
              }
              continue;
            }
            const alts = STAMPED_METAL_PAIRS[working[i]] || [];
            for (const alt of alts) {
              if (i === 8 && !/[0-9X]/.test(alt)) continue;
              const cand = working.slice(0, i) + alt + working.slice(i + 1);
              if (computeIso3779CheckDigit(cand) === cand[8]) {
                validCandidates.push({ cand, pos: i + 1, from: working[i], to: alt });
              }
            }
          }
          if (validCandidates.length === 1) {
            const win = validCandidates[0];
            edits.push({ pos: win.pos, from: win.from, to: win.to, reason: 'ISO 3779 mod-11 stamped-metal disambiguation' });
            working = win.cand;
            disambiguated = true;
          }
        }
      }
    }

    const expectedCheck = computeIso3779CheckDigit(working);
    const actualCheck = working[8];
    const checkDigitValid = Boolean(expectedCheck !== null && actualCheck === expectedCheck);
    // North America (1,2,3,4,5,7) and China GB16735 (L, e.g. Shacman LZG) enforce Pos-9 Mod-11 check digit
    const enforcesMod11Wmi = /^[1-57L]/.test(working[0]);

    let statusTone = 'ok';
    let badgeLabel = `ISO 3779 Verified (Pos 9 = ${actualCheck})`;
    let summaryText = `ISO 3779 17-char VIN verified (Position-9 check digit ${actualCheck}).`;

    if (hasBannedIOQ || disambiguated) {
      statusTone = checkDigitValid || !enforcesMod11Wmi ? 'fixed' : 'warn';
      badgeLabel = checkDigitValid
        ? `ISO 3779 Auto-Disambiguated (${working})`
        : `ISO 3779 Sanitized (${working})`;
      summaryText = `Stamped VIN auto-corrected from ${compact} to ${working}` +
        (checkDigitValid ? ` (Pos-9 check digit ${actualCheck} verified).` : `.`);
    } else if (!checkDigitValid && enforcesMod11Wmi) {
      statusTone = 'warn';
      badgeLabel = `Pos-9 Check Advisory (expected ${expectedCheck})`;
      summaryText = `ISO 3779 check-digit advisory: Position 9 is ${actualCheck}, mod-11 formula expects ${expectedCheck}.`;
    } else if (!checkDigitValid && !enforcesMod11Wmi) {
      statusTone = 'ok';
      badgeLabel = 'ISO 3779 17-Char Format Valid';
      summaryText = 'ISO 3779 17-char format valid (no I/O/Q; EU/RoW WMI model position 9).';
    }

    return {
      isVin17: true,
      isPlaceholder: false,
      raw: rawStr,
      clean: working,
      ioqSanitized,
      hasBannedIOQ,
      bannedFixed: hasBannedIOQ,
      disambiguated,
      edits,
      expectedCheck,
      actualCheck,
      checkDigitValid,
      enforcesMod11Wmi,
      statusTone,
      badgeLabel,
      summaryText
    };
  }

  // ==================== MULTI-PAGE BUNDLE COMPOSITE VISION SHEET ====================
  function loadImageElementFromDataUrl(dataUrl) {
    return new Promise(resolve => {
      if (!dataUrl || typeof Image === 'undefined') { resolve(null); return; }
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  async function stitchMultiPageVisionSheet(attObjs) {
    if (!Array.isArray(attObjs) || attObjs.length <= 1 || typeof document === 'undefined') return null;
    const renderable = [];
    for (let i = 0; i < Math.min(attObjs.length, 8); i++) {
      const a = attObjs[i];
      const dUrl = String((a && a.data_url) || '');
      if (!/^data:image\//i.test(dUrl)) continue;
      const img = await loadImageElementFromDataUrl(dUrl);
      if (img && (img.naturalWidth || img.width) > 0) {
        renderable.push({ idx: i + 1, name: a.file_name || `Page_${i + 1}`, img });
      }
    }
    if (renderable.length <= 1) return null;

    const targetW = 1120;
    const pad = 16;
    const hdrH = 30;
    const scaledPages = renderable.map(p => {
      const iw = p.img.naturalWidth || p.img.width || 800;
      const ih = p.img.naturalHeight || p.img.height || 1000;
      const drawW = targetW - pad * 2;
      const drawH = Math.min(1380, Math.max(160, Math.round((ih / iw) * drawW)));
      return Object.assign({}, p, { drawW, drawH });
    });

    let totalH = pad + scaledPages.reduce((s, p) => s + hdrH + p.drawH + pad, 0);
    let yScale = 1;
    if (totalH > 4000) {
      yScale = 4000 / totalH;
      totalH = 4000;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(targetW * yScale);
    canvas.height = Math.round(totalH);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.scale(yScale, yScale);
    ctx.fillStyle = '#F3EFE6';
    ctx.fillRect(0, 0, targetW, totalH / yScale);

    let curY = pad;
    for (const p of scaledPages) {
      ctx.fillStyle = '#EDE6D6';
      ctx.fillRect(pad, curY, p.drawW, hdrH);
      ctx.strokeStyle = '#C8B99B';
      ctx.lineWidth = 1;
      ctx.strokeRect(pad, curY, p.drawW, hdrH + p.drawH);
      ctx.fillStyle = '#181512';
      ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
      ctx.fillText(`PAGE ${p.idx} OF ${attObjs.length} - ${sanitizeOutwardText(p.name)}`, pad + 10, curY + 20);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(pad, curY + hdrH, p.drawW, p.drawH);
      ctx.drawImage(p.img, pad, curY + hdrH, p.drawW, p.drawH);
      curY += hdrH + p.drawH + pad;
    }

    const stitchedDataUrl = canvas.toDataURL('image/jpeg', 0.86);
    return {
      file_name: `Stitched_${attObjs.length}_Pages.jpg`,
      mime_type: 'image/jpeg',
      data_url: stitchedDataUrl,
      pageCount: attObjs.length
    };
  }

  async function extractZipXmlEntries(arrayBuf, wantedPathsRx) {
    const view = new DataView(arrayBuf);
    const bytes = new Uint8Array(arrayBuf);
    const decoder = new TextDecoder('utf-8');
    const results = {};
    let pos = 0;
    while (pos + 30 <= bytes.length) {
      const sig = view.getUint32(pos, true);
      if (sig !== 0x04034b50) break;
      const flags = view.getUint16(pos + 6, true);
      const method = view.getUint16(pos + 8, true);
      const compSize = view.getUint32(pos + 18, true);
      const nameLen = view.getUint16(pos + 26, true);
      const extraLen = view.getUint16(pos + 28, true);
      const nameStr = decoder.decode(bytes.subarray(pos + 30, pos + 30 + nameLen));
      const dataStart = pos + 30 + nameLen + extraLen;
      if ((flags & 0x08) !== 0 && compSize === 0) break;
      const dataEnd = Math.min(bytes.length, dataStart + compSize);
      if (wantedPathsRx.test(nameStr)) {
        const slice = bytes.subarray(dataStart, dataEnd);
        if (method === 0) {
          results[nameStr] = decoder.decode(slice);
        } else if (method === 8) {
          const inf = await inflateBytes(slice, 'deflate-raw');
          if (inf) results[nameStr] = decoder.decode(inf);
        }
      }
      pos = dataEnd;
    }
    return results;
  }

  async function extractOfficeOpenXmlText(arrayBuf, fileName) {
    const isDocx = /\.docx$/i.test(fileName);
    const entries = await extractZipXmlEntries(
      arrayBuf,
      isDocx ? /^word\/document\.xml$/i : /^xl\/(sharedStrings\.xml|worksheets\/sheet1\.xml)$/i
    );
    if (isDocx) {
      const xml = entries['word/document.xml'] || '';
      if (!xml) return '';
      return xml
        .replace(/<\/w:p>/g, '\n')
        .replace(/<\/w:tr>/g, '\n')
        .replace(/<\/w:tc>/g, '\t')
        .replace(/<[^>]+>/g, '')
        .replace(/[ \t]+/g, ' ')
        .trim();
    }
    const sharedXml = entries['xl/sharedStrings.xml'] || '';
    const shared = [];
    if (sharedXml) {
      const siMatches = sharedXml.match(/<si[\s\S]*?<\/si>/g) || [];
      siMatches.forEach(si => {
        shared.push(si.replace(/<[^>]+>/g, '').trim());
      });
    }
    const sheetXml = entries['xl/worksheets/sheet1.xml'] || '';
    if (!sheetXml) return shared.join('\n');
    const rows = [];
    const rowMatches = sheetXml.match(/<row[\s\S]*?<\/row>/g) || [];
    rowMatches.forEach(rXml => {
      const cells = [];
      const cMatches = rXml.match(/<c\b[\s\S]*?(?:\/>|<\/c>)/g) || [];
      cMatches.forEach(cXml => {
        const isShared = /\bt="s"/.test(cXml);
        const vMatch = cXml.match(/<v>([\s\S]*?)<\/v>/) || cXml.match(/<t[^>]*>([\s\S]*?)<\/t>/);
        if (!vMatch) return;
        const rawV = vMatch[1].trim();
        cells.push(isShared ? (shared[Number(rawV)] || rawV) : rawV);
      });
      if (cells.length) rows.push(cells.join(' | '));
    });
    return rows.join('\n').trim();
  }

  function extractPngTextChunks(arrayBuf) {
    const bytes = new Uint8Array(arrayBuf);
    if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return '';
    const view = new DataView(arrayBuf);
    const dec = new TextDecoder('utf-8');
    const chunks = [];
    let pos = 8;
    while (pos + 12 <= bytes.length) {
      const len = view.getUint32(pos, false);
      const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
      const start = pos + 8;
      const end = start + len;
      if (end > bytes.length) break;
      if (type === 'tEXt' || type === 'iTXt') {
        const txt = dec.decode(bytes.subarray(start, end)).replace(/\x00+/g, ': ').trim();
        if (txt && !/^software:/i.test(txt)) chunks.push(txt);
      }
      if (type === 'IEND') break;
      pos = end + 4;
    }
    return chunks.join('\n');
  }

  function loadScriptOnce(src, globalName) {
    if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-ss-lib="${src}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve(globalName ? window[globalName] : true), { once: true });
        existing.addEventListener('error', () => reject(new Error('Script load failed')), { once: true });
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.dataset.ssLib = src;
      s.onload = () => resolve(globalName ? window[globalName] : true);
      s.onerror = () => reject(new Error('Could not load OCR helper'));
      document.head.appendChild(s);
    });
  }

  async function buildPreprocessedOcrCanvas(imgSourceUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const maxSide = 1800;
        const minSide = 900;
        let w = img.naturalWidth || img.width || 800;
        let h = img.naturalHeight || img.height || 600;
        const maxCur = Math.max(w, h);
        if (maxCur > maxSide) {
          const sc = maxSide / maxCur;
          w = Math.round(w * sc);
          h = Math.round(h * sc);
        } else if (maxCur < minSide && maxCur > 0) {
          const sc = Math.min(2.2, minSide / maxCur);
          w = Math.round(w * sc);
          h = Math.round(h * sc);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        try {
          const imd = ctx.getImageData(0, 0, w, h);
          const d = imd.data;
          for (let i = 0; i < d.length; i += 4) {
            const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            const stretched = Math.max(0, Math.min(255, (lum - 128) * 1.32 + 132));
            d[i] = d[i + 1] = d[i + 2] = stretched;
          }
          ctx.putImageData(imd, 0, 0);
        } catch (_) {}
        resolve(canvas);
      };
      img.onerror = () => reject(new Error('Image decode error'));
      img.src = imgSourceUrl;
    });
  }

  async function extractImageTextOcr(dataUrl, updateStatus) {
    if (!dataUrl) return '';
    try {
      const canvas = await buildPreprocessedOcrCanvas(dataUrl);
      if (typeof window.TextDetector === 'function') {
        try {
          const detector = new window.TextDetector();
          const blocks = await detector.detect(canvas);
          if (Array.isArray(blocks) && blocks.length) {
            blocks.sort((a, b) => {
              const ay = (a.boundingBox && a.boundingBox.top) || 0;
              const by = (b.boundingBox && b.boundingBox.top) || 0;
              if (Math.abs(ay - by) > 12) return ay - by;
              return ((a.boundingBox && a.boundingBox.left) || 0) - ((b.boundingBox && b.boundingBox.left) || 0);
            });
            const joined = blocks.map(b => String(b.rawValue || '').trim()).filter(Boolean).join('\n');
            if (joined.length >= 12) return joined;
          }
        } catch (_) {}
      }
      if (isHeadlessEnv() && !window.__MFG_ALLOW_REMOTE_OCR) return '';
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return '';
      if (updateStatus) updateStatus('Running optical character recognition on image...');
      const Tesseract = await Promise.race([
        loadScriptOnce('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js', 'Tesseract'),
        new Promise((_, rej) => setTimeout(() => rej(new Error('OCR timeout')), 9000))
      ]);
      if (Tesseract && typeof Tesseract.recognize === 'function') {
        const res = await Promise.race([
          Tesseract.recognize(canvas, 'eng', {}),
          new Promise((_, rej) => setTimeout(() => rej(new Error('OCR recognition timeout')), 14000))
        ]);
        return String((res && res.data && res.data.text) || '').trim();
      }
    } catch (_) {}
    return '';
  }

  async function rasterizeScannedPdfPage1(arrayBuf, updateStatus) {
    if (isHeadlessEnv() && !window.__MFG_ALLOW_REMOTE_OCR) return '';
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return '';
    try {
      if (updateStatus) updateStatus('Rendering scanned PDF page for OCR...');
      const pdfjsLib = await Promise.race([
        loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdfjsLib'),
        new Promise((_, rej) => setTimeout(() => rej(new Error('pdf.js timeout')), 7000))
      ]);
      if (!pdfjsLib || !pdfjsLib.getDocument) return '';
      if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuf) }).promise;
      const page = await pdf.getPage(1);
      const vp = page.getViewport({ scale: 1.8 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      return await extractImageTextOcr(canvas.toDataURL('image/png'), updateStatus);
    } catch (_) {
      return '';
    }
  }

  async function extractAnyDocumentText(fileOrBlob, attObj, updateStatus) {
    const fileName = String((fileOrBlob && fileOrBlob.name) || (attObj && attObj.file_name) || 'document').trim();
    const mime = String((fileOrBlob && fileOrBlob.type) || (attObj && attObj.mime_type) || '').toLowerCase();
    const dataUrl = String((attObj && attObj.data_url) || '');

    // 1. SVG vector documents / sample scans
    if (mime.includes('svg') || /\.svg$/i.test(fileName) || /^data:image\/svg\+xml/i.test(dataUrl)) {
      if (fileOrBlob && typeof fileOrBlob.text === 'function') {
        const rawSvg = await fileOrBlob.text();
        return extractSvgReadableText(rawSvg);
      }
      if (/^data:image\/svg\+xml;base64,/i.test(dataUrl)) {
        const b64 = dataUrl.split(',')[1] || '';
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return extractSvgReadableText(new TextDecoder('utf-8').decode(bytes));
      }
      if (/^data:image\/svg\+xml[,;]/i.test(dataUrl)) {
        return extractSvgReadableText(decodeURIComponent(dataUrl.split(',').slice(1).join(',')));
      }
    }

    // 2. Plain text / CSV / TSV / JSON / XML / HTML
    if (/^(text\/|application\/(json|xml|csv))/.test(mime) || /\.(txt|csv|tsv|json|xml|html?|eml|md)$/i.test(fileName)) {
      if (fileOrBlob && typeof fileOrBlob.text === 'function') {
        const rawTxt = await fileOrBlob.text();
        if (/\.html?$/i.test(fileName) || mime.includes('html')) {
          return rawTxt.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
        return rawTxt.trim();
      }
    }

    // Obtain ArrayBuffer if available
    let arrayBuf = null;
    if (fileOrBlob && typeof fileOrBlob.arrayBuffer === 'function') {
      try { arrayBuf = await fileOrBlob.arrayBuffer(); } catch (_) {}
    } else if (/^data:[^;]+;base64,/i.test(dataUrl)) {
      try {
        const b64 = dataUrl.split(',')[1] || '';
        const bin = atob(b64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        arrayBuf = u8.buffer;
      } catch (_) {}
    }

    // 3. Excel (.xlsx) & Word (.docx)
    if (arrayBuf && (/\.(xlsx|docx)$/i.test(fileName) || /spreadsheetml|wordprocessingml/.test(mime))) {
      if (updateStatus) updateStatus('Reading structured Office document...');
      const officeTxt = await extractOfficeOpenXmlText(arrayBuf, fileName);
      if (officeTxt) return officeTxt;
    }

    // 4. PDF Documents
    if (arrayBuf && (mime.includes('pdf') || /\.pdf$/i.test(fileName) || /^data:application\/pdf/i.test(dataUrl))) {
      if (updateStatus) updateStatus('Extracting text & tables from PDF...');
      const pdfTxt = await extractPdfTextClient(arrayBuf);
      if (pdfTxt && pdfTxt.replace(/\s+/g, '').length >= 20) return pdfTxt;
      const ocrPdfTxt = await rasterizeScannedPdfPage1(arrayBuf, updateStatus);
      if (ocrPdfTxt) return ocrPdfTxt;
      return pdfTxt || '';
    }

    // 5. Images (PNG / JPEG / WebP / Camera Photo)
    let imgMetaTxt = '';
    if (arrayBuf && (mime.includes('png') || /\.png$/i.test(fileName))) {
      imgMetaTxt = extractPngTextChunks(arrayBuf);
    }
    const imgSrc = dataUrl || (fileOrBlob ? URL.createObjectURL(fileOrBlob) : '');
    let ocrTxt = '';
    if (imgSrc) {
      try {
        ocrTxt = await extractImageTextOcr(imgSrc, updateStatus);
      } finally {
        if (!dataUrl && imgSrc.startsWith('blob:')) {
          try { URL.revokeObjectURL(imgSrc); } catch (_) {}
        }
      }
    }
    const combined = [imgMetaTxt, ocrTxt].filter(Boolean).join('\n').trim();
    if (combined) return combined;

    // Fallback metadata from Document Vault object if present
    if (attObj) {
      return [
        attObj.title ? `Title: ${attObj.title}` : '',
        attObj.company ? `Company: ${attObj.company}` : '',
        attObj.doc_type ? `Type: ${attObj.doc_type}` : '',
        attObj.counterparty ? `Counterparty: ${attObj.counterparty}` : '',
        attObj.reference ? `Reference: ${attObj.reference}` : '',
        attObj.date ? `Date: ${attObj.date}` : '',
        attObj.amount ? `Total: $${attObj.amount}` : '',
        attObj.notes ? `Notes: ${attObj.notes}` : '',
        fileName ? `File: ${fileName}` : ''
      ].filter(Boolean).join('\n');
    }
    return fileName;
  }

  // ==================== FREQUENCY-FIRST REGISTRY GROUNDING ====================
  function getFreqMapForCol(colKey) {
    try {
      const fIdx = D && typeof D.getFreqIndex === 'function' ? D.getFreqIndex() : null;
      if (fIdx && typeof fIdx.forCol === 'function') {
        const m = fIdx.forCol(colKey);
        if (m) return m;
      }
      if (fIdx && fIdx[colKey]) return fIdx[colKey];
    } catch (_) {}
    return null;
  }

  function lookupFreqCount(freqMap, name) {
    if (!freqMap || !name) return 0;
    const k = norm(name);
    if (typeof freqMap.get === 'function') return Number(freqMap.get(k) || freqMap.get(name) || 0);
    return Number(freqMap[k] || freqMap[name] || 0);
  }

  function rankNamesByFrequency(names, colKey) {
    const fMap = getFreqMapForCol(colKey);
    const seen = new Set();
    const items = [];
    (names || []).forEach((raw, idx) => {
      const nm = String(raw || '').trim();
      if (!nm) return;
      const k = norm(nm);
      if (!k || seen.has(k)) return;
      seen.add(k);
      items.push({ name: nm, freq: lookupFreqCount(fMap, nm), origIdx: idx });
    });
    // Strict operational frequency descending; tie-break by original seed order (never alphabetical)
    items.sort((a, b) => (b.freq - a.freq) || (a.origIdx - b.origIdx));
    return items.map(x => x.name);
  }

  const GENERIC_NOISE_WORDS = new Set([
    'unknown', 'delivery', 'general', 'cash', 'other', 'supplier', 'customer',
    'vendor', 'client', 'item', 'part', 'parts', 'filter', 'hydraulic', 'hydraulics',
    'invoice', 'receipt', 'bill', 'ticket', 'company', 'service', 'services', 'misc',
    'total', 'subtotal', 'amount', 'tax', 'vat'
  ]);

  function isMfgCompanyTarget(coName) {
    const n = norm(coName || '');
    if (!n) return false;
    return n === 'wtc' || n === 'bbconstruction' || n === 'bbc' || n === 'lions transport' || n === 'lionstransport' || n === 'manufacturing-group';
  }

  function collectRegistryCandidates(targetCompany) {
    const isMfg = isMfgCompanyTarget(targetCompany);
    if (!isMfg && D && typeof D.ensureMultiIndustrySpineSeeded === 'function') {
      try { D.ensureMultiIndustrySpineSeeded(); } catch (_) {}
    }
    const recs = (D && D.SEED && D.SEED.records) || (window.MFG_SEED && window.MFG_SEED.records) || {};
    const custom = (D && D.STATE && D.STATE.customRecords) || {};
    const mergedArr = key => {
      const a = Array.isArray(custom[key]) ? custom[key] : [];
      const b = Array.isArray(recs[key]) ? recs[key] : [];
      return a.concat(b).filter(r => r && !r.voided && (!isMfg || !r._multiIndustrySeed));
    };

    const allowedCos = (D && typeof D.allowedCompanyNames === 'function') ? D.allowedCompanyNames() : ['WTC'];
    const coNorm = norm(targetCompany || '');
    const prioritizeCo = (rows, nameField = 'name') => {
      const coRows = [];
      const otherRows = [];
      rows.forEach(r => {
        const val = String(r[nameField] || r.name || '').trim();
        if (!val) return;
        if (coNorm && r.company && norm(r.company) === coNorm) coRows.push(val);
        else otherRows.push(val);
      });
      return coRows.concat(otherRows);
    };

    const customers = rankNamesByFrequency(prioritizeCo(mergedArr('customers')), 'customer');
    const suppliers = rankNamesByFrequency(prioritizeCo(mergedArr('suppliers')), 'supplier');
    const products = rankNamesByFrequency(prioritizeCo(mergedArr('products')), 'product');
    const items = rankNamesByFrequency(prioritizeCo(mergedArr('items')), 'item');
    const sites = rankNamesByFrequency(prioritizeCo(mergedArr('sites')), 'site');
    const drivers = rankNamesByFrequency(prioritizeCo(mergedArr('drivers')), 'driver');
    const staff = rankNamesByFrequency(prioritizeCo(mergedArr('staff_members')), 'staff');
    const equipmentRows = mergedArr('equipment');
    const equipment = rankNamesByFrequency(prioritizeCo(equipmentRows), 'equipment');
    const expCats = rankNamesByFrequency(
      mergedArr('expense_categories').map(c => c.name || c.category),
      'category'
    );
    const expSubcats = rankNamesByFrequency(
      mergedArr('expense_subcategories').map(s => s.name || s.subcategory),
      'subcategory'
    );

    return {
      companies: allowedCos,
      customers,
      suppliers,
      products,
      items,
      sites,
      drivers,
      staff,
      equipment,
      equipmentRows,
      expCats,
      expSubcats
    };
  }

  function scoreNameMatch(queryRaw, candidateRaw, freqBoost = 0) {
    const q = norm(queryRaw);
    const c = norm(candidateRaw);
    if (!q || !c) return 0;
    if (q === c) return 1.0;
    const stripLegal = s => s.replace(/\b(s\.?a\.?l\.?|s\.?a\.?r\.?l\.?|co\.?|company|ltd|llc|inc|est|ets)\b/g, '').replace(/\s+/g, ' ').trim();
    const qs = stripLegal(q);
    const cs = stripLegal(c);
    if (!qs || !cs) return 0;
    if (qs === cs) return 0.97 + freqBoost;
    if (GENERIC_NOISE_WORDS.has(cs)) return 0;

    if (qs.length >= Math.max(5, Math.floor(cs.length * 0.68)) && cs.includes(qs)) {
      return Math.min(0.94, 0.84 + (qs.length / Math.max(cs.length, 1)) * 0.1 + freqBoost);
    }
    if (cs.length >= Math.max(6, Math.floor(qs.length * 0.68)) && qs.includes(cs)) {
      return Math.min(0.93, 0.82 + (cs.length / Math.max(qs.length, 1)) * 0.1 + freqBoost);
    }

    const qTokens = qs.split(' ').filter(t => t.length >= 2);
    const cTokens = cs.split(' ').filter(t => t.length >= 2);
    if (!qTokens.length || !cTokens.length) return 0;
    if (cTokens.length === 1 && qTokens.length >= 2 && cTokens[0].length < 7) return 0;
    let hits = 0;
    for (const qt of qTokens) {
      if (GENERIC_NOISE_WORDS.has(qt)) continue;
      if (cTokens.some(ct => ct === qt || (qt.length >= 5 && ct.length >= 5 && (ct.startsWith(qt) || qt.startsWith(ct))))) {
        hits += 1;
      }
    }
    if (!hits) return 0;
    const denom = Math.max(qTokens.length, cTokens.length);
    const jacc = hits / denom;
    return jacc >= 0.62 ? Math.min(0.91, jacc * 0.88 + freqBoost) : 0;
  }

  function bestRegistryMatch(query, candidates, colKey, minScore = 0.66) {
    if (!query || !Array.isArray(candidates) || !candidates.length) return null;
    const fMap = getFreqMapForCol(colKey);
    let best = null;
    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      const freq = lookupFreqCount(fMap, cand);
      const boost = Math.min(0.035, Math.log10(freq + 1) * 0.009);
      const sc = scoreNameMatch(query, cand, boost);
      if (sc >= minScore && (!best || sc > best.score)) {
        best = { value: cand, score: sc, exact: sc >= 0.95 };
        if (sc >= 0.999) break;
      }
    }
    return best;
  }

  function scanFullTextForKnownEntity(fullText, candidates, colKey, minLen = 5) {
    if (!fullText || !Array.isArray(candidates)) return null;
    const normTxt = ' ' + norm(fullText) + ' ';
    const fMap = getFreqMapForCol(colKey);
    let best = null;
    const limit = Math.min(candidates.length, 450);
    for (let i = 0; i < limit; i++) {
      const cand = String(candidates[i] || '').trim();
      const cn = norm(cand);
      if (cn.length < minLen) continue;
      if (colKey !== 'company' && GENERIC_NOISE_WORDS.has(cn)) continue;
      if (normTxt.includes(' ' + cn + ' ') || (cn.length >= 8 && normTxt.includes(cn))) {
        const freq = lookupFreqCount(fMap, cand);
        const sc = 0.92 + Math.min(0.05, cn.length * 0.0015) + Math.min(0.025, Math.log10(freq + 1) * 0.006);
        if (!best || sc > best.score) best = { value: cand, score: sc, exact: true };
      }
    }
    return best;
  }

  // ==================== DETERMINISTIC MULTILINGUAL (EN/AR/FR) ERP PARSER ====================
  const MONTH_MAP = {
    jan: '01', january: '01', janv: '01', janvier: '01',
    feb: '02', february: '02', fevr: '02', fevrier: '02', 'février': '02',
    mar: '03', march: '03', mars: '03',
    apr: '04', april: '04', avr: '04', avril: '04',
    may: '05', mai: '05',
    jun: '06', june: '06', juin: '06',
    jul: '07', july: '07', juil: '07', juillet: '07',
    aug: '08', august: '08', aout: '08', 'août': '08',
    sep: '09', sept: '09', september: '09', septembre: '09',
    oct: '10', october: '10', octobre: '10',
    nov: '11', november: '11', novembre: '11',
    dec: '12', december: '12', 'déc': '12', decembre: '12', 'décembre': '12'
  };

  function parseDocumentDateISO(rawText) {
    const txt = normalizeDigits(rawText);
    const isoMatch = txt.match(/\b(202[4-9]|2030)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

    const dmyTextMatch = txt.match(/\b(0?[1-9]|[12]\d|3[01])[\s./-]+([A-Za-zéûô]+)\.?,?[\s./-]+(202[4-9]|2030)\b/i);
    if (dmyTextMatch) {
      const mm = MONTH_MAP[dmyTextMatch[2].toLowerCase()];
      if (mm) return `${dmyTextMatch[3]}-${mm}-${String(dmyTextMatch[1]).padStart(2, '0')}`;
    }

    const slashMatch = txt.match(/\b(0?[1-9]|[12]\d|3[01])[\/.-](0?[1-9]|1[0-2])[\/.-](202[4-9]|2030)\b/);
    if (slashMatch) {
      return `${slashMatch[3]}-${String(slashMatch[2]).padStart(2, '0')}-${String(slashMatch[1]).padStart(2, '0')}`;
    }
    return '';
  }

  function parseMoneyValue(str) {
    if (str == null) return 0;
    let s = normalizeDigits(String(str)).replace(/[$€£]|USD|LBP|L\.L\.|LL|\u0644\.\u0644/gi, '').trim();
    if (!s) return 0;
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
    const m = s.match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : 0;
  }

  function normalizeUomToken(rawUom) {
    const u = norm(rawUom);
    if (!u) return '';
    if (/^(m3|m³|cbm|cubic|meter|meters|metre|\u0645\u062a\u0631)/.test(u)) return 'm³';
    if (/^(ton|tons|tonne|mt|\u0637\u0646)/.test(u)) return 'Ton';
    if (/^(l|ltr|litre|litres|liter|liters|\u0644\u064a\u062a\u0631|\u0644\u062a\u0631)/.test(u)) return 'Litre';
    if (/^(pc|pcs|piece|pieces|unit|units|ea|\u0642\u0637\u0639\u0629|\u0639\u062f\u062f)/.test(u)) return /^unit/.test(u) ? 'Unit' : 'Piece';
    if (/^(set|sets|kit|\u0637\u0642\u0645)/.test(u)) return 'Set';
    if (/^(bag|bags|sack|\u0643\u064a\u0633)/.test(u)) return 'Bag';
    if (/^(kg|kilo|kilogram)/.test(u)) return 'kg';
    if (/^(truck|load|trip|\u0646\u0642\u0644\u0629)/.test(u)) return 'Truck';
    if (/^(hr|hrs|hour|hours|\u0633\u0627\u0639\u0629)/.test(u)) return 'Hour';
    return '';
  }

  function parseDiscountLine(rawLine) {
    const s0 = normalizeDigits(String(rawLine || '')).replace(/[\u200f\u200e]/g, '').replace(/\u066a/g, '%').trim();
    if (!s0) return null;
    if (/^(?:payment\s*terms|terms|conditions\s+de\s+paiement|\u0634\u0631\u0648\u0637\s*\u0627\u0644\u062f\u0641\u0639)\b/i.test(s0)) return null;
    const hasLbp = /(?:LBP|L\.L\.|\bLL\b|\u0644\.\u0644)/i.test(s0);
    const hasUsd = /\$|\bUSD\b/i.test(s0);
    if (/\b\d+\/\d+\s*net\s*\d+\b/i.test(s0) && !hasUsd && !hasLbp) return null;
    const lblReEnFr = /^(?:(?:less|minus|total)\s+)?(?:(?:trade|commercial|cash|special|settlement|early)?\s*(?:discount|rebate|remise|rabais|ristourne)|less(?=\s*[:#(-]*\s*\d+(?:[.,]\d+)?\s*%))(?=$|[\s:#(-]|\d)/i;
    const lblReAr = /^(?:(?:\u0625\u062c\u0645\u0627\u0644\u064a|\u0645\u062c\u0645\u0648\u0639)\s+)?(?:\u062e\u0635\u0645|\u062d\u0633\u0645)(?:\s+(?:\u062a\u062c\u0627\u0631\u064a|\u062e\u0627\u0635|\u0646\u0642\u062f\u064a|\u0625\u0636\u0627\u0641\u064a))?(?=$|[\s:#(\-\d%])/u;
    const mLbl = s0.match(lblReEnFr) || s0.match(lblReAr);
    if (!mLbl) return null;

    let pct = 0;
    const pctM = s0.match(/(\d{1,3}(?:[.,]\d+)?)\s*(?:%|percent|pct\b)/i);
    if (pctM) {
      const pv = Number(pctM[1].replace(',', '.'));
      if (Number.isFinite(pv) && pv > 0 && pv <= 100) pct = pv;
    }

    const rest = s0
      .slice(mLbl[0].length)
      .replace(/-?\d+(?:[.,]\d+)?\s*(?:%|percent|pct\b)/gi, ' ')
      .replace(/\(\s*\)/g, ' ')
      .trim();

    let usd = 0;
    let lbp = 0;
    if (/-?\d+(?:[.,]\d+)?/.test(rest)) {
      const amt = Math.abs(parseMoneyValue(rest));
      if (Number.isFinite(amt) && amt > 0) {
        if (hasLbp && !hasUsd) lbp = amt;
        else usd = amt;
      }
    }
    return { pct, usd, lbp };
  }

  function extractLabeledValue(lines, labelRegex) {
    for (const line of lines) {
      const parts = line.split(/\s*[·|]\s*/);
      for (const seg of parts) {
        const m = seg.match(labelRegex);
        if (m && m[1]) {
          const val = m[1].trim().replace(/^[:#-]+\s*/, '').trim();
          if (val) return val;
        }
      }
    }
    return '';
  }

  function deterministicParseDocument(rawText, fileName) {
    const cleanText = normalizeDigits(String(rawText || '')).replace(/\r/g, '');
    const lines = cleanText.split('\n').map(l => l.trim()).filter(Boolean);
    const fullLower = cleanText.toLowerCase();

    const date = parseDocumentDateISO(cleanText);
    const refRaw = extractLabeledValue(lines, /^(?:(?:ref(?:erence)?|invoice|bill|ticket|receipt|voucher|policy|slip|facture)\s*(?:(?:no|n°|#)\s*[:#-]?\s*|:\s*)|(?:\u0631\u0642\u0645\s*\u0627\u0644\u0641\u0627\u062a\u0648\u0631\u0629|\u0627\u064a\u0635\u0627\u0644\s*\u0631\u0642\u0645)\s*[:#-]?\s*)([A-Za-z0-9/_-]{2,32})/i)
      || ((cleanText.match(/\b(?:INV|TKT|WB|WIRE|LSE|POL|RCPT|VCH)-[A-Z0-9-]{2,20}\b/i) || [])[0] || '')
      || ((cleanText.match(/\b(?:ticket|slip|invoice|voucher|receipt)\s*(?:#|no\.?\s*[:#-]\s*)([A-Za-z0-9/_-]{2,28})/i) || [])[1] || '');

    const companyHint = extractLabeledValue(lines, /^(?:company|entity|business\s*unit|subsidiary|seller|landlord|broker|\u0627\u0644\u0634\u0631\u0643\u0629)\s*:\s*(.+)$/i);
    const supplierHint = extractLabeledValue(lines, /^(?:supplier|vendor|from\s*vendor|site\s*owner|carrier|underwriting\s*carrier|fournisseur|\u0627\u0644\u0645\u0648\u0631\u062f)\s*:\s*(.+)$/i);
    const customerHint = extractLabeledValue(lines, /^(?:customer|client|bill\s*to|sold\s*to|tenant(?:\s*\/\s*customer)?|insured(?:\s*\/\s*customer)?|acheteur|\u0627\u0644\u0632\u0628\u0648\u0646|\u0627\u0644\u0639\u0645\u064a\u0644)\s*:\s*(.+)$/i);
    const genericPartyHint = extractLabeledValue(lines, /^(?:counterparty|party|beneficiary|paid\s*to|received\s*from)\s*:\s*(.+)$/i);
    const categoryHint = extractLabeledValue(lines, /^(?:category|expense\s*category|\u0627\u0644\u0641\u0626\u0629)\s*:\s*(.+)$/i);
    const subcategoryHint = extractLabeledValue(lines, /^(?:subcategory|sub-category)\s*:\s*(.+)$/i);
    const productHint = extractLabeledValue(lines, /^(?:product|material\s*product|policy\s*line(?:\s*\/\s*product)?|material)\s*:\s*(.+)$/i);
    const siteHint = extractLabeledValue(lines, /^(?:site|origin\s*quarry\s*site|property\s*site|destination|delivery\s*yard|\u0627\u0644\u0645\u0648\u0642\u0639|\u0627\u0644\u0643\u0633\u0627\u0631\u0629)\s*:\s*(.+)$/i);
    const equipHint = extractLabeledValue(lines, /^(?:target\s*equipment|equipment|truck|vehicle|fleet\s*unit|machine|plate|\u0627\u0644\u0622\u0644\u064a\u0629|\u0627\u0644\u0634\u0627\u062d\u0646\u0629)\s*:\s*([A-Za-z0-9() -]{2,45})/i);
    const driverHint = extractLabeledValue(lines, /^(?:driver|chauffeur|\u0627\u0644\u0633\u0627\u0626\u0642)\s*:\s*(.+)$/i);
    const staffHint = extractLabeledValue(lines, /^(?:employee|staff|worker|salarié|\u0627\u0644\u0645\u0648\u0638\u0641)\s*:\s*(.+)$/i);
    const notesHint = extractLabeledValue(lines, /^(?:notes?|remarks?|memo|description|\u0645\u0644\u0627\u062d\u0638\u0627\u062a)\s*:\s*(.+)$/i);
    const incoRawLine = extractLabeledValue(lines, /^(?:incoterm|incoterms|freight\s*terms|delivery\s*terms|terms\s*of\s*delivery|shipping\s*terms)\s*[:#-]?\s*(.+)$/i);
    const incoMatch = ((incoRawLine || '') + ' ' + cleanText).match(/\b(DDP|CIF|CFR|C\s*&\s*F|EXW|FCA|FOB)\b/i);
    const incotermHint = incoMatch ? incoMatch[1].toUpperCase().replace(/\s+/g, '').replace('C&F', 'CFR') : '';

    // Totals, Subtotal, Discount, VAT & LBP detection
    let subtotalUsd = 0;
    let discountUsd = 0;
    let discountPct = 0;
    let discountLbp = 0;
    let vatUsd = 0;
    let totalUsd = 0;
    let lbpAmount = 0;
    let explicitTotalLbp = 0;
    const hasVatKeyword = /(?:\b(?:vat|tva|11%|mof\s*#|tax\s*invoice)\b|\u0636\u0631\u064a\u0628\u0629\s*\u0627\u0644\u0642\u064a\u0645\u0629\s*\u0627\u0644\u0645\u0636\u0627\u0641\u0629)/i.test(cleanText);

    for (const line of lines) {
      const lbpM = line.match(/([\d,]{5,}(?:\.\d+)?)\s*(?:LBP|L\.L\.|LL|\u0644\.\u0644)/i)
        || line.match(/(?:LBP|L\.L\.|\u0644\.\u0644)\s*[:#-]?\s*([\d,]{5,}(?:\.\d+)?)/i);
      const discParsed = parseDiscountLine(line);
      if (lbpM && !discParsed) {
        const v = parseMoneyValue(lbpM[1]);
        if (v > lbpAmount) lbpAmount = v;
      }
      if (/^(?:sub\s*-?\s*total|net\s*ex-?vat|montant\s*ht|total\s*ht|\u0627\u0644\u0645\u062c\u0645\u0648\u0639\s*\u0627\u0644\u0641\u0631\u0639\u064a|\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a\s*\u0627\u0644\u0641\u0631\u0639\u064a)/i.test(line)) {
        if (!/LBP|L\.L\.|\u0644\.\u0644/i.test(line)) {
          subtotalUsd = parseMoneyValue(line);
        }
      } else if (discParsed) {
        if (discParsed.pct > 0) discountPct = discParsed.pct;
        if (discParsed.usd > 0) discountUsd = discParsed.usd;
        if (discParsed.lbp > 0) discountLbp = discParsed.lbp;
      } else if (/^(?:vat|tva|tax\s*\(?\s*11%|\u0636\u0631\u064a\u0628\u0629)/i.test(line)) {
        vatUsd = parseMoneyValue(line);
      } else if (/^(?:(?:\b(?:grand\s*total|total(?:\s+(?:ttc|due|amount|usd))?|amount(?:\s+(?:due|paid|received))?|net\s*payable|montant\s*ttc)\b)|\u0627\u0644\u0645\u062c\u0645\u0648\u0639|\u0627\u0644\u0627\u062c\u0645\u0627\u0644\u064a|\u0635\u0627\u0641\u064a\s*\u0627\u0644\u062f\u0641\u0639|\u0627\u0644\u0635\u0627\u0641\u064a)/i.test(line)) {
        if (/LBP|L\.L\.|\u0644\.\u0644/i.test(line)) {
          if (lbpM) {
            const tvLbp = parseMoneyValue(lbpM[1]);
            if (tvLbp > 0) explicitTotalLbp = tvLbp;
          }
        } else {
          const tv = parseMoneyValue(line);
          if (tv >= 0) totalUsd = tv;
        }
      }
    }
    if (explicitTotalLbp > 0) lbpAmount = explicitTotalLbp;

    // Parse line items: supports "Desc | 2 Piece | $95.00 | $190.00" or consecutive SVG/PDF rows or "2 pcs x $95 = $190"
    const lineItems = [];
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (/^(subtotal|sub\s*-?\s*total|vat|tva|total|discount|rebate|remise|rabais|less\s+|payment\s*terms|notes|company|supplier|customer|ref:|date:|description\s*\/?\s*item|\u062e\u0635\u0645|\u062d\u0633\u0645|\u0627\u0644\u0645\u062c\u0645\u0648\u0639)/i.test(ln)) continue;

      const pipeMatch = ln.match(/^([^|$]{3,90}?)\s*(?:\||\t|\s{2,})\s*(\d+(?:\.\d+)?)\s*([A-Za-z³²\u0600-\u06FF]{1,12})?\s*(?:\||\t|\s{1,})\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(?:\||\t|\s{1,})\s*\$?\s*([\d,]+(?:\.\d+)?)$/);
      if (pipeMatch) {
        const q = Number(pipeMatch[2]) || 1;
        const uom = normalizeUomToken(pipeMatch[3] || '') || 'Piece';
        const up = parseMoneyValue(pipeMatch[4]);
        const tot = parseMoneyValue(pipeMatch[5]);
        lineItems.push({ description: pipeMatch[1].trim(), qty: q, uom, unitCost: up, lineTotal: tot || round2(q * up) });
        continue;
      }

      // 4-line SVG / PDF table block: [desc, "2 Piece", "$95.00", "$190.00"]
      if (i + 3 < lines.length) {
        const l1 = lines[i];
        const l2 = lines[i + 1];
        const l3 = lines[i + 2];
        const l4 = lines[i + 3];
        const qm = l2.match(/^(\d+(?:\.\d+)?)\s*([A-Za-z0-9³²]+)?$/);
        const pm = l3.match(/^\$?\s*([\d,]+(?:\.\d+)?)$/);
        const tm = l4.match(/^\$?\s*([\d,]+(?:\.\d+)?)$/);
        if (qm && pm && tm && l1.length >= 3 && !/^(qty|unit\s*price|amount|total)/i.test(l1)) {
          const q = Number(qm[1]) || 1;
          const uom = normalizeUomToken(qm[2] || '') || (/\bm3\b/i.test(qm[2] || '') ? 'm³' : 'Piece');
          const up = parseMoneyValue(pm[1]);
          const tot = parseMoneyValue(tm[1]);
          lineItems.push({ description: l1, qty: q, uom, unitCost: up, lineTotal: tot });
          i += 3;
          continue;
        }
      }
    }

    if (!subtotalUsd && lineItems.length) {
      subtotalUsd = round2(lineItems.reduce((s, it) => s + Number(it.lineTotal || 0), 0));
    }
    const explicitDiscountUsd = discountUsd;
    const explicitDiscountLbp = discountLbp;
    if (discountUsd <= 0 && discountPct > 0 && discountPct <= 100) {
      if (subtotalUsd > 0) {
        discountUsd = round2(subtotalUsd * (discountPct / 100));
      } else if (totalUsd > 0 && discountPct < 100) {
        const netExVat = (vatUsd > 0 && totalUsd > vatUsd) ? round2(totalUsd - vatUsd) : totalUsd;
        const inferredGross = round2(netExVat / (1 - (discountPct / 100)));
        if (subtotalUsd <= 0) subtotalUsd = inferredGross;
        discountUsd = round2(Math.max(0, inferredGross - netExVat));
      } else if (totalUsd <= 0 && lbpAmount > 0 && discountLbp <= 0 && discountPct < 100) {
        discountLbp = Math.round((lbpAmount / (1 - (discountPct / 100))) - lbpAmount);
      }
    }
    if (!totalUsd && (subtotalUsd > 0 || vatUsd > 0)) {
      totalUsd = round2(Math.max(0, subtotalUsd + vatUsd - discountUsd));
    }
    if (!totalUsd) {
      const anyUsd = cleanText.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/g) || [];
      let maxUsd = 0;
      anyUsd.forEach(tok => {
        const v = parseMoneyValue(tok);
        if (v > maxUsd) maxUsd = v;
      });
      totalUsd = maxUsd;
    }

    // Payment method
    let paymentMethod = '';
    const payLine = extractLabeledValue(lines, /^(?:payment\s*(?:terms|method)|terms|mode\s*de\s*paiement|\u0637\u0631\u064a\u0642\u0629\s*\u0627\u0644\u062f\u0641\u0639)\s*[:#-]?\s*(.+)$/i) || cleanText;
    if (/(?:\b(?:wire|bank\s*transfer|iban|swift|virement)\b|\u062a\u062d\u0648\u064a\u0644\s*\u0645\u0635\u0631\u0641\u064a)/i.test(payLine)) paymentMethod = 'Bank Transfer';
    else if (/(?:\b(?:cheque|check)\b|chèque|\u0634\u064a\u0643)/i.test(payLine)) paymentMethod = 'Check';
    else if (/(?:\b(?:credit|on\s*account|net\s*30|payable)\b|\u0622\u062c\u0644|\u0630\u0645\u0645)/i.test(payLine)) paymentMethod = 'Credit';
    else if (/(?:\b(?:cash|paid\s*in\s*cash)\b|espèces|\u0646\u0642\u062f\u0627|\u0646\u0642\u062f\u064a)/i.test(payLine)) paymentMethod = 'Cash';

    const pricePending = Boolean(
      /(?:\b(?:price\s*pending|unpriced|rate\s*pending|bon\s*de\s*livraison\s*sans\s*prix)\b|\u0628\u062f\u0648\u0646\s*\u0633\u0639\u0631)/i.test(cleanText) ||
      (totalUsd === 0 && lbpAmount === 0 && lineItems.length > 0 && lineItems.every(x => Number(x.unitCost || 0) === 0))
    );

    // Document intent / form classification
    let formType = 'expense';
    let indQuickTpl = '';
    const altForms = [];

    // Extract 17-Char ISO 3779 Chassis VIN (from text or Vin_Scan filename) and disambiguate stamped-metal OCR confusions
    const rawVinToken = extractVin17CandidateFromText(cleanText) || extractVin17CandidateFromText(String(fileName || ''));
    const vinAudit = rawVinToken ? validateAndDisambiguateVin17(rawVinToken, { fromScan: true }) : null;
    const vinClean = vinAudit && vinAudit.isVin17 ? vinAudit.clean : '';
    const modelHint = extractLabeledValue(lines, /^(?:vehicle\s*model|model|make\s*(?:&|\/)\s*model)\s*:\s*(.+)$/i);
    const plateHint = extractLabeledValue(lines, /^(?:plate\s*(?:no|number|#)|registration\s*plate)\s*:\s*([A-Za-z0-9 -]{2,24})/i);

    const isPureVinOrEquipCard = Boolean(
      (vinClean && !totalUsd && !lineItems.length) ||
      /^vin_scan_/i.test(String(fileName || '')) ||
      /\b(chassis\s*identification\s*plate|equipment\s*registration\s*card|fleet\s*unit\s*registration)\b/i.test(cleanText)
    );

    if (/(?:\b(?:weighbridge|quarry\s*weighbridge|raw\s*material\s*intake|aggregate\s*intake|raml|gravier)\b|\u0642\u0628\u0627\u0646|\u0645\u0648\u0627\u062f\s*\u0627\u0648\u0644\u064a\u0629)/i.test(cleanText)) {
      formType = 'raw';
      altForms.push('sales', 'expense', 'document');
    } else if (isPureVinOrEquipCard) {
      const curMForm = String((D && D.STATE && D.STATE.modalForm) || '');
      formType = curMForm === 'equipment' ? 'equipment' : 'companyequipment';
      altForms.push(formType === 'equipment' ? 'companyequipment' : 'equipment', 'repair', 'document');
    } else if (/\b(intercompany|sister\s*liquidity|central\s*treasury|capital\s*call|external\s*treasury)\b/i.test(cleanText)) {
      formType = 'external';
      indQuickTpl = 'hld_ic';
      altForms.push('treasury', 'receipt', 'document');
    } else if (/(?:\b(?:fx\s*conversion|currency\s*exchange|usd\s*to\s*lbp|lbp\s*to\s*usd)\b|\u0635\u0631\u0627\u0641\u0629)/i.test(cleanText)) {
      formType = 'conversion';
      altForms.push('external', 'document');
    } else if (/(?:\b(?:loan\s*agreement|loan\s*facility|promissory\s*note)\b|\u0642\u0631\u0636)/i.test(cleanText)) {
      formType = 'treasury';
      altForms.push('external', 'document');
    } else if (/(?:\b(?:salary\s*slip|payslip|payroll\s*voucher|monthly\s*salary)\b|\u0642\u0633\u064a\u0645\u0629\s*\u0631\u0627\u062a\u0628|\u0631\u0627\u062a\u0628)/i.test(cleanText)) {
      formType = 'salary';
      altForms.push('expense', 'document');
    } else if (/(?:\b(?:diesel\s*intake|fuel\s*intake|mazout\s*delivery|fuel\s*dispense|tank\s*refill)\b|\u0645\u0627\u0632\u0648\u062a)/i.test(cleanText) && !/\b(supplier\s*tax\s*invoice)\b/i.test(cleanText)) {
      formType = 'fuel';
      altForms.push('expense', 'document');
    } else if (/(?:\b(?:bordereau\s*remittance|supplier\s*payment\s*voucher|paid\s*to\s*supplier|supplier\s*settlement|carrier\s*net\s*remittance)\b|\u0633\u0646\u062f\s*\u0635\u0631\u0641\s*\u0644\u0644\u0645\u0648\u0631\u062f)/i.test(cleanText)) {
      formType = 'settlement';
      altForms.push('expense', 'document');
    } else if (/(?:\b(?:customer\s*receipt|received\s*from\s*customer|payment\s*received|tenant\s*rent\s*receipt|premium\s*instalment\s*collection)\b|reçu\s*de\s*paiement|\u0633\u0646\u062f\s*\u0642\u0628\u0636|\u0627\u064a\u0635\u0627\u0644\s*\u0642\u0628\u0636)/i.test(cleanText)) {
      formType = 'receipt';
      altForms.push('external', 'sales', 'document');
    } else if (/\b(commercial\s*vehicle\s*sales\s*invoice|commercial\s*lease\s*rent|policy\s*schedule\s*&\s*debit\s*note|sales\s*ticket|bill\s*to|sold\s*to|tenant\s*\/\s*customer|insured\s*\/\s*customer)\b/i.test(cleanText)) {
      formType = 'sales';
      if (/commercial\s*lease|floor\s*plate\s*lease|4235/i.test(cleanText)) indQuickTpl = 're_rent';
      else if (/policy\s*schedule|marine\s*cargo|all-risk/i.test(cleanText)) indQuickTpl = 'ins_pol';
      else if (/tipper\s*truck|shacman|korri|vin\b/i.test(cleanText)) indQuickTpl = 'trd_inv';
      altForms.push('vatinvoice', 'receipt', 'document');
    } else if (/\b(equipment\s*repair\s*order|workshop\s*job\s*card|mechanic\s*labor)\b/i.test(cleanText)) {
      formType = 'repair';
      altForms.push('expense', 'partlog', 'document');
    } else {
      formType = 'expense';
      if (equipHint) altForms.push('repair');
      if (vinClean) altForms.push('companyequipment', 'equipment');
      altForms.push('settlement', 'raw', 'document');
    }

    const firstItem = lineItems[0] || null;
    let qty = firstItem ? Number(firstItem.qty || 1) : 0;
    let uom = firstItem ? firstItem.uom : '';
    if (!qty) {
      const qm = cleanText.match(/\b(\d+(?:\.\d+)?)\s*(m3|m³|tons?|litres?|liters?|pcs|pieces?|units?|sets?|bags?)\b/i);
      if (qm) {
        qty = Number(qm[1]) || 0;
        uom = normalizeUomToken(qm[2]);
      }
    }
    if (vinClean && formType === 'sales' && indQuickTpl === 'trd_inv') {
      qty = 1;
    }

    return {
      formType,
      indQuickTpl,
      altForms,
      company: companyHint,
      date,
      reference: refRaw,
      supplier: supplierHint,
      customer: customerHint,
      counterparty: supplierHint || customerHint || genericPartyHint,
      category: categoryHint,
      subcategory: subcategoryHint,
      product: productHint || (firstItem ? firstItem.description : ''),
      site: siteHint,
      equipment: equipHint,
      plateNo: plateHint,
      model: modelHint,
      vin: vinClean,
      vinAudit,
      driver: driverHint,
      staff: staffHint,
      paymentMethod,
      subtotalExVat: subtotalUsd,
      discountPct: discountPct || 0,
      discountAmount: discountUsd,
      discountLbp: discountLbp || 0,
      hasExplicitDiscount: Boolean(explicitDiscountUsd > 0 || explicitDiscountLbp > 0),
      vatAmount: vatUsd,
      totalAmount: totalUsd,
      lbpAmount,
      hasVat: Boolean(vatUsd > 0 || hasVatKeyword),
      pricePending,
      qty: qty || 1,
      uom,
      unitPrice: firstItem ? Number(firstItem.unitCost || 0) : 0,
      lineItems,
      incoterm: incotermHint,
      notes: notesHint,
      direction: /\b(cash\s*out|outgoing\s*wire|withdrawal|paid\s*out)\b/i.test(cleanText) ? 'Out' : 'In'
    };
  }

  function synthesizeMultiPageDeterministic(pageEntries, combinedText, primaryFileName) {
    if (!Array.isArray(pageEntries) || pageEntries.length <= 1) {
      const single = deterministicParseDocument(combinedText, primaryFileName);
      single.pageCount = 1;
      single.multiPageSynthesized = false;
      return single;
    }

    const perPage = pageEntries.map(pe => deterministicParseDocument(pe.text || '', pe.fileName || primaryFileName));
    const full = deterministicParseDocument(combinedText, primaryFileName);
    const p1 = perPage[0];
    const firstNonEmpty = getter => {
      for (const p of perPage) {
        const v = getter(p);
        if (v !== undefined && v !== null && String(v).trim() !== '') return v;
      }
      return getter(full);
    };

    // Concatenate line items across Pages 1..N in page order, skipping carried-forward/subtotal lines
    const mergedLines = [];
    for (const p of perPage) {
      for (const it of (p.lineItems || [])) {
        if (!it || !it.description) continue;
        if (/\b(carried\s*forward|brought\s*forward|subtotal\s*page|page\s*\d+\s*subtotal|continued\s*on\s*page)\b/i.test(it.description)) continue;
        mergedLines.push(it);
      }
    }

    // Final-page totals override Page 1 "Carried Forward / Page 1 Subtotal"
    let finalSubtotal = 0;
    let finalDiscount = 0;
    let finalDiscountPct = 0;
    let finalDiscountLbp = 0;
    let finalVat = 0;
    let finalTotal = 0;
    let finalLbp = 0;
    for (let idx = perPage.length - 1; idx >= 0; idx--) {
      const p = perPage[idx];
      if (!finalTotal && p.totalAmount > 0) finalTotal = p.totalAmount;
      if (!finalDiscount && p.hasExplicitDiscount && p.discountAmount > 0) finalDiscount = p.discountAmount;
      if (!finalDiscountPct && p.discountPct > 0) finalDiscountPct = p.discountPct;
      if (!finalDiscountLbp && p.hasExplicitDiscount && p.discountLbp > 0) finalDiscountLbp = p.discountLbp;
      if (!finalVat && p.vatAmount > 0) finalVat = p.vatAmount;
      if (!finalSubtotal && p.subtotalExVat > 0) finalSubtotal = p.subtotalExVat;
      if (!finalLbp && p.lbpAmount > 0) finalLbp = p.lbpAmount;
    }
    if (!finalDiscount && !finalDiscountPct) {
      for (let idx = perPage.length - 1; idx >= 0; idx--) {
        if (perPage[idx].discountAmount > 0) { finalDiscount = perPage[idx].discountAmount; break; }
      }
    }
    const linesSum = round2(mergedLines.reduce((s, it) => s + Number(it.lineTotal || 0), 0));
    if (mergedLines.length > 1 && linesSum > finalSubtotal) {
      finalSubtotal = linesSum;
    }
    if (finalDiscount <= 0 && finalDiscountPct > 0 && finalDiscountPct <= 100) {
      if (finalSubtotal > 0) {
        finalDiscount = round2(finalSubtotal * (finalDiscountPct / 100));
      } else if (finalTotal > 0 && finalDiscountPct < 100) {
        const netExVat = (finalVat > 0 && finalTotal > finalVat) ? round2(finalTotal - finalVat) : finalTotal;
        const inferredGross = round2(netExVat / (1 - (finalDiscountPct / 100)));
        if (finalSubtotal <= 0) finalSubtotal = inferredGross;
        finalDiscount = round2(Math.max(0, inferredGross - netExVat));
      } else if (finalTotal <= 0 && finalLbp > 0 && finalDiscountLbp <= 0 && finalDiscountPct < 100) {
        finalDiscountLbp = Math.round((finalLbp / (1 - (finalDiscountPct / 100))) - finalLbp);
      }
    }
    const expectedNetFromParts = round2(Math.max(0, finalSubtotal + finalVat - finalDiscount));
    if ((finalSubtotal > 0 || finalVat > 0) && (finalTotal <= 0 || finalTotal < expectedNetFromParts - 0.05)) {
      finalTotal = expectedNetFromParts;
    }

    // Prefer first valid 17-char VIN audit across any page
    let bestVinAudit = null;
    for (const p of perPage) {
      if (p.vinAudit && p.vinAudit.isVin17) { bestVinAudit = p.vinAudit; break; }
    }
    if (!bestVinAudit && full.vinAudit && full.vinAudit.isVin17) bestVinAudit = full.vinAudit;

    const mergedNotes = Array.from(new Set(perPage.map(p => p.notes).filter(Boolean))).join(' · ');

    return Object.assign({}, full, {
      formType: p1.formType !== 'expense' ? p1.formType : full.formType,
      indQuickTpl: firstNonEmpty(p => p.indQuickTpl),
      company: firstNonEmpty(p => p.company),
      date: firstNonEmpty(p => p.date),
      reference: firstNonEmpty(p => p.reference),
      supplier: firstNonEmpty(p => p.supplier),
      customer: firstNonEmpty(p => p.customer),
      counterparty: firstNonEmpty(p => p.counterparty),
      category: firstNonEmpty(p => p.category),
      subcategory: firstNonEmpty(p => p.subcategory),
      product: firstNonEmpty(p => p.product),
      site: firstNonEmpty(p => p.site),
      equipment: firstNonEmpty(p => p.equipment),
      plateNo: firstNonEmpty(p => p.plateNo),
      model: firstNonEmpty(p => p.model),
      vin: bestVinAudit ? bestVinAudit.clean : firstNonEmpty(p => p.vin),
      vinAudit: bestVinAudit || full.vinAudit,
      driver: firstNonEmpty(p => p.driver),
      staff: firstNonEmpty(p => p.staff),
      paymentMethod: firstNonEmpty(p => p.paymentMethod),
      incoterm: firstNonEmpty(p => p.incoterm),
      subtotalExVat: finalSubtotal || full.subtotalExVat,
      discountPct: finalDiscountPct || full.discountPct || 0,
      discountAmount: finalDiscount || full.discountAmount || 0,
      discountLbp: finalDiscountLbp || full.discountLbp || 0,
      vatAmount: finalVat || full.vatAmount,
      totalAmount: finalTotal || full.totalAmount,
      lbpAmount: finalLbp || full.lbpAmount,
      hasVat: perPage.some(p => p.hasVat) || full.hasVat,
      pricePending: perPage.every(p => p.pricePending) && finalTotal === 0,
      lineItems: mergedLines.length ? mergedLines : full.lineItems,
      notes: mergedNotes || full.notes,
      pageCount: pageEntries.length,
      multiPageSynthesized: true
    });
  }

  // ==================== OPTIONAL SERVER VISION & CLOUD AI RELAY ====================
  function extractJsonBlock(rawStr) {
    const s = String(rawStr || '').trim();
    if (!s) return null;
    const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : s;
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
      } catch (_) {}
    }
    return null;
  }

  function resolveAskRelayEndpoint() {
    return { url: '', key: '' };
  }

  function extractVisionInlinePart(attObj) {
    if (!attObj || !attObj.data_url) return null;
    const dataUrl = String(attObj.data_url || '');
    const mimeRaw = String(attObj.mime_type || '').toLowerCase().trim();
    if (!dataUrl.includes(';base64,')) return null;
    if (!/^(image\/(jpeg|jpg|png|webp|heic|heif)|application\/pdf)$/i.test(mimeRaw)) return null;
    const b64Part = dataUrl.split(';base64,')[1] || '';
    if (!b64Part || b64Part.length > 4200000) return null;
    const normMime = mimeRaw === 'image/jpg' ? 'image/jpeg' : mimeRaw;
    return { mimeType: normMime, data: b64Part };
  }

  async function tryLocalServerVisionScan(payload) {
    if (isHeadlessEnv() && !window.__MFG_TEST_LIVE_AI) return null;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
    const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(location.hostname || '');
    if (!isLocalHost && !window.ISABI_LOCAL_API && !window.ISABI_HAS_EDGE_API) return null;
    const hasBin = payload && payload.dataUrl && /^(image\/(jpeg|jpg|png|webp|heic|heif)|application\/pdf)$/i.test(String(payload.mimeType || ''));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), hasBin ? 14000 : 4800);
    try {
      const base = String(window.ISABI_LOCAL_API || '.').replace(/\/$/, '');
      const edgeFetch = window.ISABI_EDGE_FETCH || fetch;
      const res = await edgeFetch(`${base}/api/smart-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({
          tier: hasBin ? 'vision' : 'fast',
          thinkingLevel: hasBin ? 'LOW' : undefined
        }, payload)),
        signal: ctrl.signal
      });
      if (!res.ok) return null;
      const j = await res.json();
      if (j && j.ok && j.parsed && typeof j.parsed === 'object') {
        return { parsed: j.parsed, engine: 'ISABI Vision Engine' };
      }
    } catch (_) {
    } finally {
      clearTimeout(timer);
    }
    return null;
  }

  async function tryCloudAiStructuredParse(extractedText, regScope, attObj, pageCount = 1) {
    const inlinePart = extractVisionInlinePart(attObj);
    const cleanTxt = String(extractedText || '').trim();
    if (cleanTxt.length < 18 && !inlinePart) return null;
    if (isHeadlessEnv() && !window.__MFG_TEST_LIVE_AI) return null;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;

    const sysPrompt = [
      'You are ISABI Smart Scan, an enterprise multi-page accounting & fleet document parser.',
      'Return ONLY valid JSON (no markdown commentary) with these keys:',
      '{"formType":"expense|sales|raw|receipt|settlement|fuel|repair|salary|external|treasury|conversion|companyequipment|equipment|document",',
      '"company":"","date":"YYYY-MM-DD","reference":"","supplier":"","customer":"","counterparty":"",',
      '"category":"","subcategory":"","product":"","site":"","equipment":"","plateNo":"","model":"","vin":"","driver":"","staff":"",',
      '"paymentMethod":"Credit|Cash|Bank Transfer|Check","subtotalExVat":0,"discountPct":0,"discountAmount":0,"vatAmount":0,"totalAmount":0,"lbpAmount":0,',
      '"hasVat":false,"pricePending":false,"qty":1,"uom":"","unitPrice":0,"notes":"",',
      '"lineItems":[{"description":"","qty":1,"uom":"Piece","unitCost":0,"lineTotal":0}]}',
      'Trade-discount rule: put any printed percentage discount (Less X% / Remise / خصم) in discountPct (0-100) and the printed currency discount amount in discountAmount; keep subtotalExVat as pre-discount ex-VAT subtotal and totalAmount as final net payable.',
      'ISO 3779 VIN rule: 17-character chassis VINs NEVER contain I, O, or Q; carefully disambiguate stamped metal 0 vs D, 8 vs B, and 5 vs S.',
      pageCount > 1
        ? `Multi-Page Synthesis (${pageCount} pages): merge Page 1 identity headers (company, counterparty, reference, VIN) with Page 2+ schedules, continuation lineItems, and final-page Grand Total / VAT (ignore Page 1 Carried Forward subtotals).`
        : 'Extract all line items and final payable totals accurately.',
      'Prefer exact matches from these active registries when clearly corresponding:',
      'Companies: ' + (regScope.companies || []).slice(0, 16).join(', '),
      'Top Suppliers: ' + (regScope.suppliers || []).slice(0, 28).join(', '),
      'Top Customers: ' + (regScope.customers || []).slice(0, 28).join(', '),
      'Products: ' + (regScope.products || []).slice(0, 20).join(', '),
      'Expense Categories: ' + (regScope.expCats || []).slice(0, 18).join(', ')
    ].join('\n');

    const userMsg = cleanTxt
      ? ('DOCUMENT TEXT:\n' + cleanTxt.slice(0, 8500))
      : 'Extract all accounting fields, counterparty, 17-character VIN if present, date, currency/VAT, and line items directly from this document image.';

    // 0. Same-origin Cloudflare Edge / Local API Server (./api/smart-scan)
    const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(location.hostname || '');
    if (isLocalHost || window.ISABI_LOCAL_API || window.ISABI_HAS_EDGE_API) {
      const useVisionProEdge = Boolean(inlinePart || cleanTxt.length < 160);
      const ctrlEdge = new AbortController();
      const timerEdge = setTimeout(() => ctrlEdge.abort(), inlinePart ? 14500 : 8500);
      try {
        const base = String(window.ISABI_LOCAL_API || '.').replace(/\/$/, '');
        const resEdge = await (window.ISABI_EDGE_FETCH || fetch)(`${base}/api/smart-scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customPrompt: sysPrompt + '\n\n' + userMsg,
            dataUrl: (attObj && attObj.data_url) || '',
            mimeType: (attObj && attObj.mime_type) || '',
            extractedText: cleanTxt,
            companies: regScope.companies || [],
            tier: useVisionProEdge ? 'vision' : 'fast',
            thinkingLevel: useVisionProEdge ? 'LOW' : undefined
          }),
          signal: ctrlEdge.signal
        });
        if (resEdge.ok) {
          const jEdge = await resEdge.json();
          const parsedEdge = (jEdge && jEdge.parsed && typeof jEdge.parsed === 'object')
            ? jEdge.parsed
            : extractJsonBlock(jEdge && (jEdge.rawReply || jEdge.reply || jEdge.answer));
          if (parsedEdge && typeof parsedEdge === 'object') {
            return { parsed: parsedEdge, engine: inlinePart ? 'ISABI Vision Engine + Ledger Grounding' : 'ISABI Cloud AI + Ledger Grounding' };
          }
        }
      } catch (_) {
      } finally {
        clearTimeout(timerEdge);
      }
    }

    return null;
  }

  function mergeParsedResults(det, ai) {
    if (!ai) return det;
    const pickStr = (a, b) => (String(a || '').trim() || String(b || '').trim());
    const pickNum = (a, b) => (Number(a) > 0 ? Number(a) : (Number(b) || 0));
    const validForms = ['sales', 'raw', 'receipt', 'vatinvoice', 'fuel', 'expense', 'recurringexpense', 'settlement', 'repair', 'oillog', 'partlog', 'defect', 'salary', 'attendance', 'external', 'treasury', 'conversion', 'jv', 'warehousestock', 'equipment', 'companyequipment', 'document'];
    const aiForm = String(ai.formType || '').toLowerCase().trim();
    const detIsCategorizedExpense = det.formType === 'expense' && Boolean(String(det.category || '').trim() || String(det.subcategory || '').trim());
    const finalForm = (detIsCategorizedExpense && (aiForm === 'raw' || aiForm === 'sales' || aiForm === 'fuel'))
      ? 'expense'
      : (validForms.includes(aiForm) ? aiForm : det.formType);
    const aiLines = Array.isArray(ai.lineItems) ? ai.lineItems.filter(x => x && x.description) : [];
    const mergedLines = det.lineItems && det.lineItems.length >= aiLines.length ? det.lineItems : aiLines;

    let finalVinAudit = det.vinAudit || null;
    if ((!finalVinAudit || !finalVinAudit.isVin17) && ai.vin) {
      const candAudit = validateAndDisambiguateVin17(ai.vin, { fromScan: true });
      if (candAudit && candAudit.isVin17) finalVinAudit = candAudit;
    }

    const mergedSubExVat = pickNum(det.subtotalExVat, ai.subtotalExVat);
    const mergedVatAmt = pickNum(det.vatAmount, ai.vatAmount);
    const mergedTotalAmt = pickNum(det.totalAmount, ai.totalAmount);
    const mergedLbpAmt = pickNum(det.lbpAmount, ai.lbpAmount);
    const mergedDiscPct = pickNum(det.discountPct, ai.discountPct || ai.discount_pct);
    let mergedDiscLbp = pickNum(det.discountLbp, ai.discountLbp || ai.discount_lbp);
    let mergedDiscAmt = Math.abs(pickNum(det.discountAmount, ai.discountAmount || ai.discount));
    if (mergedDiscAmt <= 0 && mergedDiscPct > 0 && mergedDiscPct <= 100) {
      if (mergedSubExVat > 0) {
        mergedDiscAmt = round2(mergedSubExVat * (mergedDiscPct / 100));
      } else if (mergedTotalAmt > 0 && mergedDiscPct < 100) {
        const netExVat = (mergedVatAmt > 0 && mergedTotalAmt > mergedVatAmt) ? round2(mergedTotalAmt - mergedVatAmt) : mergedTotalAmt;
        const inferredGross = round2(netExVat / (1 - (mergedDiscPct / 100)));
        mergedDiscAmt = round2(Math.max(0, inferredGross - netExVat));
      } else if (mergedTotalAmt <= 0 && mergedLbpAmt > 0 && mergedDiscLbp <= 0 && mergedDiscPct < 100) {
        mergedDiscLbp = Math.round((mergedLbpAmt / (1 - (mergedDiscPct / 100))) - mergedLbpAmt);
      }
    }

    return Object.assign({}, det, {
      formType: finalForm,
      company: pickStr(det.company, ai.company),
      date: pickStr(det.date, parseDocumentDateISO(String(ai.date || ''))),
      reference: pickStr(det.reference, ai.reference),
      supplier: pickStr(det.supplier, ai.supplier),
      customer: pickStr(det.customer, ai.customer),
      counterparty: pickStr(det.counterparty, ai.counterparty || ai.supplier || ai.customer),
      category: pickStr(det.category, ai.category),
      subcategory: pickStr(det.subcategory, ai.subcategory),
      product: pickStr(det.product, ai.product),
      site: pickStr(det.site, ai.site),
      equipment: pickStr(det.equipment, ai.equipment),
      plateNo: pickStr(det.plateNo, ai.plateNo),
      model: pickStr(det.model, ai.model),
      vin: finalVinAudit && finalVinAudit.isVin17 ? finalVinAudit.clean : pickStr(det.vin, ai.vin),
      vinAudit: finalVinAudit,
      driver: pickStr(det.driver, ai.driver),
      staff: pickStr(det.staff, ai.staff),
      paymentMethod: pickStr(det.paymentMethod, ai.paymentMethod),
      subtotalExVat: mergedSubExVat,
      discountPct: mergedDiscPct,
      discountAmount: mergedDiscAmt,
      discountLbp: mergedDiscLbp,
      vatAmount: mergedVatAmt,
      totalAmount: mergedTotalAmt,
      lbpAmount: mergedLbpAmt,
      hasVat: Boolean(det.hasVat || ai.hasVat || Number(ai.vatAmount) > 0),
      pricePending: Boolean(det.pricePending || ai.pricePending),
      qty: pickNum(det.qty, ai.qty) || 1,
      uom: pickStr(det.uom, normalizeUomToken(ai.uom || '')),
      unitPrice: pickNum(det.unitPrice, ai.unitPrice),
      lineItems: mergedLines,
      notes: pickStr(det.notes, ai.notes)
    });
  }

  // ==================== GROUNDING & APPLYING TO #entryModal ====================
  function groundExtractedEntities(parsed, fullText) {
    const allowedCos = (D && typeof D.allowedCompanyNames === 'function') ? D.allowedCompanyNames() : ['WTC'];
    let matchedCompany = null;
    if (parsed.company) {
      matchedCompany = bestRegistryMatch(parsed.company, allowedCos, 'company', 0.65);
    }
    if (!matchedCompany) {
      matchedCompany = scanFullTextForKnownEntity(fullText, allowedCos, 'company', 3);
    }
    const targetCompany = (matchedCompany && matchedCompany.value) ||
      (($('f_company') && $('f_company').value) || (D && D.defaultEntryCompany ? D.defaultEntryCompany() : allowedCos[0] || 'WTC'));

    const reg = collectRegistryCandidates(targetCompany);
    const warnings = [];

    // Supplier / Customer matching (only scan unlabelled full text when no explicit counterparty label was found)
    let supMatch = parsed.supplier ? bestRegistryMatch(parsed.supplier, reg.suppliers, 'supplier', 0.68) : null;
    if (!supMatch && parsed.counterparty && ['expense', 'raw', 'settlement', 'fuel', 'repair'].includes(parsed.formType)) {
      supMatch = bestRegistryMatch(parsed.counterparty, reg.suppliers, 'supplier', 0.68);
    }
    if (!supMatch && !parsed.supplier && !parsed.counterparty && ['expense', 'raw', 'settlement', 'fuel'].includes(parsed.formType)) {
      supMatch = scanFullTextForKnownEntity(fullText, reg.suppliers, 'supplier', 4);
    }

    let custMatch = parsed.customer ? bestRegistryMatch(parsed.customer, reg.customers, 'customer', 0.68) : null;
    if (!custMatch && parsed.counterparty && ['sales', 'receipt', 'vatinvoice'].includes(parsed.formType)) {
      custMatch = bestRegistryMatch(parsed.counterparty, reg.customers, 'customer', 0.68);
    }
    if (!custMatch && !parsed.customer && !parsed.counterparty && ['sales', 'receipt', 'vatinvoice'].includes(parsed.formType)) {
      custMatch = scanFullTextForKnownEntity(fullText, reg.customers, 'customer', 4);
    }

    // Product / Site / Equipment / Driver / Staff / Category
    let prodMatch = parsed.product ? bestRegistryMatch(parsed.product, reg.products, 'product', 0.66) : null;
    if (!prodMatch && !parsed.product && ['sales', 'raw'].includes(parsed.formType)) {
      prodMatch = scanFullTextForKnownEntity(fullText, reg.products, 'product', 4);
    }

    let siteMatch = parsed.site ? bestRegistryMatch(parsed.site, reg.sites, 'site', 0.66) : null;
    if (!siteMatch && !parsed.site && ['sales', 'raw'].includes(parsed.formType)) {
      siteMatch = scanFullTextForKnownEntity(fullText, reg.sites, 'site', 5);
    }

    let eqResolved = '';
    let eqMatchedExact = false;
    if (parsed.equipment) {
      if (D && typeof D.resolveCanonicalEquipmentName === 'function') {
        const canon = D.resolveCanonicalEquipmentName(parsed.equipment, targetCompany, false, null, true);
        if (canon) {
          eqResolved = canon;
          eqMatchedExact = reg.equipment.some(e => norm(e) === norm(canon));
        }
      }
      if (!eqResolved) {
        const eqM = bestRegistryMatch(parsed.equipment, reg.equipment, 'equipment', 0.7);
        if (eqM) {
          eqResolved = eqM.value;
          eqMatchedExact = eqM.exact;
        } else {
          eqResolved = parsed.equipment;
        }
      }
    }

    const drvMatch = parsed.driver ? bestRegistryMatch(parsed.driver, reg.drivers, 'driver', 0.7) : null;
    const stfMatch = parsed.staff ? bestRegistryMatch(parsed.staff, reg.staff, 'staff', 0.7) : null;
    const catMatch = parsed.category ? bestRegistryMatch(parsed.category, reg.expCats, 'category', 0.64) : null;
    const subMatch = parsed.subcategory ? bestRegistryMatch(parsed.subcategory, reg.expSubcats, 'subcategory', 0.64) : null;

    // Ground multi-line items against Universal Catalog
    const groundedLines = (parsed.lineItems || []).map((ln, idx) => {
      const rawDesc = String(ln.description || '').trim();
      const directCat = (D && typeof D.resolveCatalogItem === 'function') ? D.resolveCatalogItem(rawDesc) : null;
      const fuzzyItm = !directCat ? bestRegistryMatch(rawDesc, reg.items, 'item', 0.72) : null;
      const finalName = directCat ? directCat.name : (fuzzyItm ? fuzzyItm.value : rawDesc);
      const isKnownCatalog = Boolean(directCat || fuzzyItm);
      if (!isKnownCatalog && parsed.formType === 'expense' && rawDesc) {
        warnings.push({
          kind: 'register_item',
          rowIdx: idx,
          itemName: rawDesc,
          text: `Item "${rawDesc}" is not in the Shared Catalog yet. Review or click + Register Item.`
        });
      }
      return {
        item_name: finalName,
        raw_name: rawDesc,
        known: isKnownCatalog,
        qty: Number(ln.qty) > 0 ? Number(ln.qty) : 1,
        uom: (directCat && directCat.uom) || ln.uom || 'Piece',
        unit_cost: Number(ln.unitCost) >= 0 ? round2(Number(ln.unitCost)) : 0,
        line_total: Number(ln.lineTotal) >= 0 ? round2(Number(ln.lineTotal)) : 0
      };
    });

    const rawSup = parsed.supplier || (['expense', 'settlement'].includes(parsed.formType) ? parsed.counterparty : '');
    if (rawSup && !supMatch && ['expense', 'settlement', 'raw'].includes(parsed.formType)) {
      warnings.push({
        kind: 'unknown_supplier',
        partyName: rawSup,
        text: `Vendor "${rawSup}" was not found in Suppliers Registry. Verify spelling or register vendor first.`
      });
    }
    const rawCust = parsed.customer || (['sales', 'receipt'].includes(parsed.formType) ? parsed.counterparty : '');
    if (rawCust && !custMatch && ['sales', 'receipt'].includes(parsed.formType)) {
      warnings.push({
        kind: 'unknown_customer',
        partyName: rawCust,
        text: `Customer "${rawCust}" was not found in Customers Registry. Verify spelling before posting.`
      });
    }

    return {
      targetCompany,
      companyExact: Boolean(matchedCompany),
      supplier: supMatch ? supMatch.value : rawSup,
      supplierKnown: Boolean(supMatch),
      customer: custMatch ? custMatch.value : rawCust,
      customerKnown: Boolean(custMatch),
      counterparty: (supMatch && supMatch.value) || (custMatch && custMatch.value) || parsed.counterparty || rawSup || rawCust,
      product: prodMatch ? prodMatch.value : parsed.product,
      productKnown: Boolean(prodMatch),
      site: siteMatch ? siteMatch.value : parsed.site,
      siteKnown: Boolean(siteMatch),
      equipment: eqResolved,
      equipmentKnown: eqMatchedExact,
      driver: drvMatch ? drvMatch.value : parsed.driver,
      driverKnown: Boolean(drvMatch),
      staff: stfMatch ? stfMatch.value : parsed.staff,
      staffKnown: Boolean(stfMatch),
      category: catMatch ? catMatch.value : parsed.category,
      categoryKnown: Boolean(catMatch),
      subcategory: subMatch ? subMatch.value : parsed.subcategory,
      groundedLines,
      warnings
    };
  }

  function setInputValueAndFire(id, value, filledSet, warnSet, isWarn = false) {
    const el = $(id);
    if (!el || value == null || value === '') return false;
    if (el.disabled || el.readOnly) return false;
    if (el.tagName === 'SELECT') {
      const targetNorm = norm(value);
      const opt = Array.from(el.options || []).find(o => norm(o.value) === targetNorm || norm(o.textContent) === targetNorm);
      if (!opt) return false;
      el.value = opt.value;
    } else {
      el.value = String(value);
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (filledSet) filledSet.add(id);
    if (isWarn && warnSet) warnSet.add(id);
    return true;
  }

  function decorateFilledFieldsDom(filledSet, warnSet) {
    const body = $('modalBody');
    if (!body) return;
    body.querySelectorAll('.ss-ai-badge').forEach(b => b.remove());
    body.querySelectorAll('.ss-field-filled, .ss-field-check').forEach(w => {
      w.classList.remove('ss-field-filled', 'ss-field-check');
    });
    filledSet.forEach(fid => {
      const el = $(fid);
      if (!el) return;
      const wrap = el.closest('.form-field, .exp-qc-fld');
      if (!wrap) return;
      const needsCheck = warnSet.has(fid);
      wrap.classList.add('ss-field-filled');
      if (needsCheck) wrap.classList.add('ss-field-check');
      const lbl = wrap.querySelector('label');
      if (lbl && !lbl.querySelector('.ss-ai-badge')) {
        const b = document.createElement('span');
        b.className = 'ss-ai-badge ' + (needsCheck ? 'is-warn' : 'is-ok');
        b.textContent = needsCheck ? 'Verify' : 'AI Filled';
        // Append outside .pa-fld-lbl so .pa-fld-lbl.textContent stays untouched
        lbl.appendChild(b);
      }
    });
  }

  function isBlockedFormForInd(f, ind) {
    if (!f || !ind || ind === 'Manufacturing') return false;
    if (D && (typeof D.isMfgOnlyModalForm === 'function' ? D.isMfgOnlyModalForm(f) : Boolean(D.MFG_ONLY_MODAL_FORMS && D.MFG_ONLY_MODAL_FORMS.has(f)))) return true;
    if (D && typeof D.isFleetUniversalIndustry === 'function' && !D.isFleetUniversalIndustry(ind) && (f === 'equipment' || f === 'driver')) return true;
    return false;
  }

  function notifyScanApplyOutcome(bundle, totalPages = 1) {
    if (!bundle || bundle.blockedByRbac) return false;
    if (D && D.toast) {
      const domSpec = (bundle.routedDomainModal && typeof D.resolveDomainFormSpec === 'function')
        ? D.resolveDomainFormSpec(bundle.appliedForm)
        : null;
      const fTitle = (domSpec && domSpec.spec && domSpec.spec.label)
        || (window.MFG_FORMS && window.MFG_FORMS.FORM_TITLES && window.MFG_FORMS.FORM_TITLES[bundle.appliedForm])
        || bundle.appliedForm;
      const n = Array.isArray(bundle.filledFields) ? bundle.filledFields.length : 0;
      const pagePrefix = totalPages > 1 ? `${totalPages}-page scan synthesized: ` : 'Smart Scan ';
      D.toast(`${pagePrefix}filled ${n} field${n === 1 ? '' : 's'} on ${sanitizeOutwardText(fTitle)}. Review & Post.`, 'ok');
    }
    return true;
  }

  function isSeatOwner() {
    if (!D || typeof D.isOwner !== 'function') return true;
    const u = typeof D.activeUser === 'function' ? D.activeUser() : null;
    return Boolean(D.isOwner(u));
  }

  function isCompanyAllowedForSeat(coName) {
    if (!coName || isSeatOwner()) return true;
    if (!D || typeof D.allowedCompanyNames !== 'function') return true;
    const allowed = D.allowedCompanyNames();
    if (!Array.isArray(allowed) || !allowed.length) return false;
    return allowed.some(a => String(a || '').toLowerCase() === String(coName || '').toLowerCase());
  }

  function seatHasCompanyInIndustry(indName) {
    if (!indName || isSeatOwner()) return true;
    if (!D || typeof D.allowedCompanyNames !== 'function' || !D.COMPANY_KEY_BY_NAME || !D.getActiveIndustry) return true;
    const allowed = D.allowedCompanyNames();
    if (!Array.isArray(allowed) || !allowed.length) return false;
    return allowed.some(a => {
      const ck = D.COMPANY_KEY_BY_NAME[a];
      return ck && D.getActiveIndustry(ck) === indName;
    });
  }

  function resolvePrecheckEntryTarget(scanBundle) {
    if (!D || !scanBundle || !scanBundle.parsed) {
      return { ok: false, blocked: true, reason: 'Your seat has no entry rights for this form' };
    }
    const { parsed, matched } = scanBundle;
    const canEnter = D.canEnterForm || (() => true);
    const requestedForm = parsed.formType || 'expense';
    const targetCo = matched && matched.targetCompany;
    let resolvedNextInd = D.getActiveIndustry ? D.getActiveIndustry(D.STATE && D.STATE.company) : 'Manufacturing';
    let coSwitchKey = '';
    if (targetCo && D.COMPANY_KEY_BY_NAME && isCompanyAllowedForSeat(targetCo)) {
      const coKey = D.COMPANY_KEY_BY_NAME[targetCo];
      const curInd = resolvedNextInd;
      const nextInd = D.getActiveIndustry && coKey ? D.getActiveIndustry(coKey) : curInd;
      resolvedNextInd = nextInd || curInd;
      if (coKey && curInd !== nextInd) coSwitchKey = coKey;
    }
    let targetForm = requestedForm;
    if (!canEnter(targetForm) || isBlockedFormForInd(targetForm, resolvedNextInd)) {
      const fallbackOrder = (parsed.altForms || []).concat(['expense', 'document', 'external', 'sales']);
      const permitted = fallbackOrder.find(f => !isBlockedFormForInd(f, resolvedNextInd) && canEnter(f));
      if (!permitted) {
        return {
          ok: false,
          blocked: true,
          resolvedNextInd,
          reason: resolvedNextInd && resolvedNextInd !== 'Manufacturing'
            ? 'Your seat cannot create new domain records'
            : 'Your seat has no entry rights for this form'
        };
      }
      targetForm = permitted;
    }
    return { ok: true, blocked: false, targetForm, coSwitchKey, resolvedNextInd };
  }

  async function applyScanToModal(scanBundle, overrideFormType, applyOpts = {}) {
    if (!D || !scanBundle) return;
    const { parsed, matched, attObj } = scanBundle;
    const requestedForm = overrideFormType || parsed.formType || 'expense';
    const canEnter = D.canEnterForm || (() => true);

    const rawTargetCo = matched.targetCompany;
    const targetCo = (rawTargetCo && isCompanyAllowedForSeat(rawTargetCo))
      ? rawTargetCo
      : ((rawTargetCo && !isSeatOwner() && D.defaultEntryCompany) ? D.defaultEntryCompany() : rawTargetCo);
    let resolvedNextInd = D.getActiveIndustry ? D.getActiveIndustry(D.STATE.company) : 'Manufacturing';
    let coSwitchKey = '';
    if (rawTargetCo && D.COMPANY_KEY_BY_NAME && isCompanyAllowedForSeat(rawTargetCo)) {
      const coKey = D.COMPANY_KEY_BY_NAME[rawTargetCo];
      const curInd = resolvedNextInd;
      const nextInd = D.getActiveIndustry && coKey ? D.getActiveIndustry(coKey) : curInd;
      resolvedNextInd = nextInd || curInd;
      if (coKey && curInd !== nextInd) coSwitchKey = coKey;
    }

    // 0. Domain Register bridge (RBAC checked BEFORE mutating STATE.company)
    const rawDetText = String(scanBundle.extractedText || '').trim();
    const rawDetPages = rawDetText ? [{ pageNum: 1, fileName: (attObj && attObj.file_name) || '', text: rawDetText }] : [];
    const domCandidate = (!overrideFormType && rawDetPages.length)
      ? deterministicParseDomainBundle(rawDetPages, rawDetText, null, (attObj && attObj.file_name) || '')
      : null;
    const isExplicitSharedSpine = Boolean(
      parsed.formType === 'external'
      || ((parsed.formType === 'salary' || parsed.formType === 'conversion' || parsed.formType === 'settlement') && !(domCandidate && domCandidate.formKey && hasStrongDomainRegisterSignals(rawDetText, domCandidate.formKey)))
      || (parsed.formType === 'expense' && !(domCandidate && domCandidate.formKey && hasStrongDomainRegisterSignals(rawDetText, domCandidate.formKey)))
      || (parsed.formType === 'equipment' && !(domCandidate && ['trd_sales', 'trd_trucks', 'trd_purchases'].includes(domCandidate.formKey) && /showroom|fob|list\s*price|stock\s*intake|bill\s*of\s*lading|sold\s*to|customer:/i.test(rawDetText)))
    );
    if (!overrideFormType && domCandidate && domCandidate.formKey && !isExplicitSharedSpine) {
      const domSpecObj = (D.resolveDomainFormSpec && D.resolveDomainFormSpec(domCandidate.formKey)) || null;
      const domInd = (domSpecObj && domSpecObj.ind) || resolvedNextInd;
      const domScopeBlocked = !seatHasCompanyInIndustry(domInd);
      const domCo = resolveRlsSafeDomainCompany(domCandidate.company || rawTargetCo || parsed.company, domInd);
      const chronoBlocked = Boolean(D.canManageSiblingChronoSchedule && !D.canManageSiblingChronoSchedule(domCandidate.formKey));
      const domFormBlocked = Boolean(D.canEnterDomainForm && !D.canEnterDomainForm(domCandidate.formKey));
      if (domFormBlocked || chronoBlocked || domScopeBlocked) {
        scanBundle.blockedByRbac = true;
        SCAN_STATE.lastScan = null;
        if (D.toast) {
          D.toast(domFormBlocked
            ? 'Your seat cannot create new domain records'
            : (chronoBlocked
              ? 'Supervisor permission required to manage chronological rate schedules'
              : 'Your seat has no assigned companies in this industry'), 'err');
        }
        return;
      }
      if (coSwitchKey && D.selectCompanyScope) {
        try { D.selectCompanyScope(coSwitchKey); } catch (_) {}
      }
      SCAN_STATE.suppressResetOnModalSwitch = true;
      try {
        if (typeof D.closeEntryModal === 'function') D.closeEntryModal(true);
      } finally {
        SCAN_STATE.suppressResetOnModalSwitch = false;
      }
      const domFields = Object.assign({}, domCandidate.fields || {});
      const domTot = parsed.totalAmount || parsed.subtotalExVat || 0;
      const domNet = parsed.subtotalExVat > 0 ? parsed.subtotalExVat : domTot;
      const domProd = matched.product || parsed.product || (Array.isArray(parsed.lines) && parsed.lines[0] && (parsed.lines[0].desc || parsed.lines[0].item_name)) || '';
      if (!domFields.ide_date && parsed.date && parsed.date >= '2024-01-01' && parsed.date <= '2030-12-31') domFields.ide_date = parsed.date;
      if (!domFields.ide_ref && parsed.reference) domFields.ide_ref = parsed.reference;
      if (!domFields.ide_notes && parsed.notes) domFields.ide_notes = sanitizeOutwardText(parsed.notes);
      if (domCandidate.formKey === 'ins_policies') {
        if (!domFields.ide_client) domFields.ide_client = matched.customer || parsed.customer || '';
        if (!domFields.ide_carrier) domFields.ide_carrier = matched.supplier || parsed.supplier || '';
        if (!domFields.ide_product) domFields.ide_product = domProd;
        if (!domFields.ide_gwp && domTot > 0) domFields.ide_gwp = String(domTot);
      } else if (domCandidate.formKey === 'ins_billing') {
        if (!domFields.ide_client) domFields.ide_client = matched.customer || parsed.customer || '';
        if (!domFields.ide_carrier) domFields.ide_carrier = matched.supplier || parsed.supplier || '';
        if (!domFields.ide_collected && domTot > 0) domFields.ide_collected = String(domTot);
      } else if (domCandidate.formKey === 're_invoicing' || domCandidate.formKey === 're_leases') {
        if (!domFields.ide_property) domFields.ide_property = matched.site || parsed.site || '';
        if (!domFields.ide_tenant) domFields.ide_tenant = matched.customer || parsed.customer || '';
        if (!domFields.ide_net && domNet > 0) domFields.ide_net = String(domNet);
      } else if (domCandidate.formKey === 'trd_sales') {
        if (!domFields.ide_customer) domFields.ide_customer = matched.customer || parsed.customer || '';
        if (!domFields.ide_item) domFields.ide_item = domProd;
        if (!domFields.ide_chassis && parsed.vin) domFields.ide_chassis = parsed.vin;
        if (!domFields.ide_net && domNet > 0) domFields.ide_net = String(domNet);
      }
      const domRes = applyDomainExtractionToModal({
        ind: domInd,
        formKey: domCandidate.formKey,
        company: domCo,
        label: (domFields.ide_product || domFields.ide_property || domFields.ide_item || parsed.reference || (attObj && attObj.file_name) || 'Scanned Document'),
        fileName: (attObj && attObj.file_name) || 'SmartScan_Domain.svg',
        rawFiles: Array.isArray(scanBundle._rawFiles) ? scanBundle._rawFiles : [],
        attObjs: Array.isArray(scanBundle.attObjs) ? scanBundle.attObjs : (attObj ? [attObj] : []),
        captureMethod: (attObj && attObj.capture_method) || 'AI Smart Scan',
        vinAudit: domCandidate.vinAudit || parsed.vinAudit || null,
        pageCount: Math.max(1, Number(parsed.pageCount || (scanBundle.attObjs && scanBundle.attObjs.length) || 1)),
        fields: domFields
      });
      if (!domRes || !domRes.ok) {
        scanBundle.blockedByRbac = true;
        SCAN_STATE.lastScan = null;
        return;
      }
      scanBundle.routedDomainModal = true;
      scanBundle.appliedForm = (domRes && domRes.formKey) || domCandidate.formKey;
      scanBundle.filledFields = Object.keys(domFields).filter(k => domFields[k] !== '' && domFields[k] != null);
      scanBundle.warnFields = [];
      SCAN_STATE.lastScan = scanBundle;
      return;
    }

    let targetForm = requestedForm;
    let sharedRbacDenied = false;
    if (!canEnter(targetForm) || isBlockedFormForInd(targetForm, resolvedNextInd)) {
      const fallbackOrder = (parsed.altForms || []).concat(['expense', 'document', 'external', 'sales']);
      const permitted = fallbackOrder.find(f => !isBlockedFormForInd(f, resolvedNextInd) && canEnter(f));
      if (permitted) {
        targetForm = permitted;
        if (!canEnter(requestedForm)) {
          matched.warnings = (matched.warnings || []).concat([{
            kind: 'role_fallback',
            text: `Your seat does not have entry permission for "${requestedForm}"; routed to "${targetForm}" instead.`
          }]);
        }
      } else {
        sharedRbacDenied = true;
      }
    }

    // Never route non-Manufacturing scans into quarry/manufacturing-only modal forms; route domain sales/VAT/receipts to #indDomainEntryModal
    if (resolvedNextInd && resolvedNextInd !== 'Manufacturing') {
      const domainSourceForm = !overrideFormType ? requestedForm : '';
      if (domainSourceForm === 'sales' && parsed.supplier && !parsed.customer && !parsed.indQuickTpl && canEnter('expense')) {
        targetForm = 'expense';
      } else if (['sales', 'vatinvoice', 'receipt'].includes(domainSourceForm)) {
        const domToday = D.todayISO ? D.todayISO() : new Date().toISOString().slice(0, 10);
        const domFx = (D.getLbpFxRate ? Number(D.getLbpFxRate(parsed.date || domToday)) : 89500) || 89500;
        const domConvUsd = (parsed.totalAmount <= 0 && parsed.lbpAmount > 0) ? round2(parsed.lbpAmount / domFx) : 0;
        const domConvDiscUsd = (parsed.discountAmount <= 0 && Number(parsed.discountLbp || 0) > 0) ? round2(Number(parsed.discountLbp) / domFx) : 0;
        const domDiscUsd = (!parsed.pricePending && (Number(parsed.discountAmount || 0) > 0 || domConvDiscUsd > 0))
          ? round2(Number(parsed.discountAmount || 0) || domConvDiscUsd)
          : 0;
        const amt = parsed.totalAmount || domConvUsd || parsed.subtotalExVat || 0;
        const netAmt = parsed.subtotalExVat > 0 ? parsed.subtotalExVat : amt;
        const prodDesc = matched.product || parsed.product || (Array.isArray(parsed.lines) && parsed.lines[0] && (parsed.lines[0].desc || parsed.lines[0].item_name)) || '';
        const coName = targetCo || parsed.company || (D.defaultEntryCompany ? D.defaultEntryCompany() : '') || '';
        const domFields = {};
        if (parsed.date && parsed.date >= '2024-01-01' && parsed.date <= '2030-12-31') domFields.ide_date = parsed.date;
        if (parsed.reference) domFields.ide_ref = parsed.reference;
        if (parsed.notes) domFields.ide_notes = sanitizeOutwardText(parsed.notes);
        let domKey = '';
        if (resolvedNextInd === 'Automotive & Heavy Trading') {
          domKey = domainSourceForm === 'receipt' ? 'trd_receipts' : 'trd_sales';
          if (domKey === 'trd_receipts') {
            Object.assign(domFields, { ide_customer: matched.customer || parsed.customer || '', ide_amount: amt });
            if (domDiscUsd > 0) domFields.ide_discount = domDiscUsd;
          } else {
            Object.assign(domFields, {
              ide_customer: matched.customer || parsed.customer || '',
              ide_item: prodDesc,
              ide_chassis: parsed.vin || '',
              ide_qty: parsed.qty || 1,
              ide_net: netAmt
            });
          }
        } else if (resolvedNextInd === 'Real Estate & Property') {
          domKey = domainSourceForm === 'receipt' ? 're_receipts' : 're_invoicing';
          if (domKey === 're_receipts') {
            Object.assign(domFields, {
              ide_property: matched.site || parsed.site || '',
              ide_tenant: matched.customer || parsed.customer || '',
              ide_gross: amt
            });
            if (domDiscUsd > 0) domFields.ide_discount = domDiscUsd;
          } else {
            Object.assign(domFields, {
              ide_property: matched.site || parsed.site || '',
              ide_tenant: matched.customer || parsed.customer || '',
              ide_net: netAmt
            });
          }
        } else if (resolvedNextInd === 'Insurance & Brokerage') {
          domKey = domainSourceForm === 'receipt' ? 'ins_billing' : 'ins_policies';
          if (domKey === 'ins_billing') {
            Object.assign(domFields, {
              ide_client: matched.customer || parsed.customer || '',
              ide_carrier: matched.supplier || parsed.supplier || '',
              ide_collected: amt
            });
          } else {
            Object.assign(domFields, {
              ide_client: matched.customer || parsed.customer || '',
              ide_carrier: matched.supplier || parsed.supplier || '',
              ide_product: prodDesc,
              ide_gwp: amt
            });
          }
        } else if (resolvedNextInd === 'Hospitality & Resorts') {
          domKey = domainSourceForm === 'receipt' ? 'hsp_memberships' : 'hsp_revenue';
          if (domKey === 'hsp_memberships') {
            Object.assign(domFields, { ide_member: matched.customer || parsed.customer || '', ide_contract: amt });
          } else {
            Object.assign(domFields, { ide_tot: amt });
          }
        } else {
          domKey = 'hld_interactions';
          Object.assign(domFields, { ide_usd: amt });
        }
        const canDom = seatHasCompanyInIndustry(resolvedNextInd)
          && (!D.canEnterDomainForm || D.canEnterDomainForm(domKey))
          && (!D.canManageSiblingChronoSchedule || D.canManageSiblingChronoSchedule(domKey));
        if (canDom) {
          if (coSwitchKey && D.selectCompanyScope) {
            try { D.selectCompanyScope(coSwitchKey); } catch (_) {}
          }
          SCAN_STATE.suppressResetOnModalSwitch = true;
          try {
            if (typeof D.closeEntryModal === 'function') D.closeEntryModal(true);
          } finally {
            SCAN_STATE.suppressResetOnModalSwitch = false;
          }
          const domRes = applyDomainExtractionToModal({
            ind: resolvedNextInd,
            formKey: domKey,
            company: coName,
            label: prodDesc || parsed.reference || (attObj && attObj.file_name) || 'Scanned Document',
            fileName: (attObj && attObj.file_name) || 'SmartScan_Domain.svg',
            rawFiles: Array.isArray(scanBundle._rawFiles) ? scanBundle._rawFiles : [],
            attObjs: Array.isArray(scanBundle.attObjs) ? scanBundle.attObjs : (attObj ? [attObj] : []),
            captureMethod: (attObj && attObj.capture_method) || 'AI Smart Scan',
            vinAudit: parsed.vinAudit || null,
            pageCount: Math.max(1, Number(parsed.pageCount || (scanBundle.attObjs && scanBundle.attObjs.length) || 1)),
            fields: domFields
          });
          if (!domRes || !domRes.ok) {
            scanBundle.blockedByRbac = true;
            SCAN_STATE.lastScan = null;
            return;
          }
          scanBundle.routedDomainModal = true;
          scanBundle.appliedForm = (domRes && domRes.formKey) || domKey;
          scanBundle.filledFields = Object.keys(domFields).filter(k => domFields[k] !== '' && domFields[k] != null);
          scanBundle.warnFields = [];
          SCAN_STATE.lastScan = scanBundle;
          return;
        }
        const safeSharedFallback = ['expense', 'document', 'external'].find(f => !isBlockedFormForInd(f, resolvedNextInd) && canEnter(f));
        if (!safeSharedFallback) {
          scanBundle.blockedByRbac = true;
          SCAN_STATE.lastScan = null;
          if (D.toast) D.toast('Your seat cannot create new domain records', 'err');
          return;
        }
        matched.warnings = (matched.warnings || []).concat([{
          kind: 'role_fallback',
          text: `Your seat does not have entry permission for "${domKey}"; routed to "${safeSharedFallback}" instead.`
        }]);
        targetForm = safeSharedFallback;
        sharedRbacDenied = false;
      } else if (isBlockedFormForInd(targetForm, resolvedNextInd)) {
        const altShared = ['expense', 'document', 'external'].find(f => !isBlockedFormForInd(f, resolvedNextInd) && canEnter(f));
        if (altShared) {
          targetForm = altShared;
          sharedRbacDenied = false;
        } else {
          sharedRbacDenied = true;
        }
      }
    }

    if (sharedRbacDenied) {
      scanBundle.blockedByRbac = true;
      SCAN_STATE.lastScan = null;
      if (D.toast) {
        D.toast(resolvedNextInd && resolvedNextInd !== 'Manufacturing'
          ? 'Your seat cannot create new domain records'
          : 'Your seat has no entry rights for this form', 'err');
      }
      return;
    }

    if (coSwitchKey && D.selectCompanyScope) {
      try { D.selectCompanyScope(coSwitchKey); } catch (_) {}
    }

    if ($('indDomainEntryModal') && !$('indDomainEntryModal').hidden && typeof D.closeIndustryDomainEntryModal === 'function') {
      SCAN_STATE.suppressDomResetOnSwitch = true;
      try {
        D.closeIndustryDomainEntryModal(true);
      } finally {
        SCAN_STATE.suppressDomResetOnSwitch = false;
      }
    }

    // Open or switch #entryModal cleanly without wiping SCAN_STATE
    SCAN_STATE.suppressResetOnModalSwitch = true;
    try {
      D.openEntryModal(targetForm, null, {
        forceSwitch: true
      });
    } finally {
      SCAN_STATE.suppressResetOnModalSwitch = false;
    }

    const FORM_UI = D.getFormUi ? D.getFormUi() : null;
    const filledSet = new Set();
    const warnSet = new Set();
    const extraNotes = [];

    // 1. Company
    if (targetCo && $('f_company')) {
      setInputValueAndFire('f_company', targetCo, filledSet, warnSet, !matched.companyExact);
    }

    const activeCo = ($('f_company') && $('f_company').value) || targetCo || 'WTC';
    const coKeyForInd = (D.COMPANY_KEY_BY_NAME && D.COMPANY_KEY_BY_NAME[activeCo]) || D.STATE.company;
    const activeInd = D.getActiveIndustry ? D.getActiveIndustry(coKeyForInd) : 'Manufacturing';
    const isHospitality = activeInd === 'Hospitality & Resorts';

    // 2. Date & Reporting Date handling (respecting locked f_date)
    const today = D.todayISO ? D.todayISO() : new Date().toISOString().slice(0, 10);
    if (parsed.date && parsed.date >= '2024-01-01' && parsed.date <= '2030-12-31') {
      const dEl = $('f_date');
      if (dEl && !dEl.readOnly && !dEl.disabled) {
        setInputValueAndFire('f_date', parsed.date, filledSet, warnSet, false);
      } else if (parsed.date !== today && $('f_repdate')) {
        if (FORM_UI) {
          FORM_UI.showRepDate = true;
          FORM_UI.repDateManual = true;
        }
        const repWrap = $('wrap_f_repdate') || $('repDateFieldWrap');
        if (repWrap) repWrap.hidden = false;
        setInputValueAndFire('f_repdate', parsed.date, filledSet, warnSet, true);
        extraNotes.push(`Doc Date: ${parsed.date}`);
      }
    }

    // 3. Reference / Ticket / Invoice No
    if (parsed.reference) {
      const numericTicket = String(parsed.reference).replace(/[^0-9]/g, '');
      if (['sales', 'raw', 'fuel'].includes(targetForm) && $('f_ticketno')) {
        const cleanTkt = numericTicket || parsed.reference;
        setInputValueAndFire('f_ticketno', cleanTkt, filledSet, warnSet, false);
      } else if ($('f_reference')) {
        setInputValueAndFire('f_reference', parsed.reference, filledSet, warnSet, false);
      } else {
        extraNotes.push(`Ref: ${parsed.reference}`);
      }
    }

    // 4. Form-specific fields & line items
    const fxRate = (D.getLbpFxRate ? Number(D.getLbpFxRate(parsed.date || today)) : 89500) || 89500;
    const convertedLbpUsd = (parsed.totalAmount <= 0 && parsed.lbpAmount > 0) ? round2(parsed.lbpAmount / fxRate) : 0;
    const convertedLbpDiscUsd = (parsed.discountAmount <= 0 && Number(parsed.discountLbp || 0) > 0) ? round2(Number(parsed.discountLbp) / fxRate) : 0;
    const rawScanDiscUsd = (!parsed.pricePending && (Number(parsed.discountAmount || 0) > 0 || convertedLbpDiscUsd > 0))
      ? round2(Number(parsed.discountAmount || 0) || convertedLbpDiscUsd)
      : 0;
    if (convertedLbpUsd > 0 && !['salary', 'external', 'treasury', 'conversion'].includes(targetForm)) {
      extraNotes.push(`Converted from ${Number(parsed.lbpAmount).toLocaleString('en-US')} LBP @ ${fxRate.toLocaleString('en-US')}`);
    }

    if (targetForm === 'expense') {
      if (matched.category && $('f_category')) {
        if (FORM_UI) FORM_UI.lastCategory = '';
        setInputValueAndFire('f_category', matched.category, filledSet, warnSet, !matched.categoryKnown);
        if (D.recalcForm) D.recalcForm();
      }
      if (matched.subcategory && $('f_subcategory')) {
        setInputValueAndFire('f_subcategory', matched.subcategory, filledSet, warnSet, false);
      }
      if (matched.supplier && $('f_supplier')) {
        setInputValueAndFire('f_supplier', matched.supplier, filledSet, warnSet, !matched.supplierKnown);
      }
      if (parsed.paymentMethod && $('f_method')) {
        const expMeth = /cash/i.test(parsed.paymentMethod) ? 'Cash' : 'Credit';
        setInputValueAndFire('f_method', expMeth, filledSet, warnSet, false);
      }
      if (matched.equipment && $('f_truck')) {
        if ($('f_for_equipment')) $('f_for_equipment').value = '1';
        if ($('f_store_warehouse')) $('f_store_warehouse').value = '0';
        setInputValueAndFire('f_truck', matched.equipment, filledSet, warnSet, !matched.equipmentKnown);
      }

      // Hospitality Never-VAT TTC warning + supplier IVA VAT multiplier alignment
      if (isHospitality && parsed.vatAmount > 0 && parsed.totalAmount > 0) {
        matched.warnings = (matched.warnings || []).concat([{
          kind: 'hospitality_ttc',
          text: `Hospitality TTC rule applied: full inclusive total ($${parsed.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) entered without separate VAT split.`
        }]);
      }
      const supValNow = ($('f_supplier') && $('f_supplier').value) || matched.supplier || '';
      const supIsIva = Boolean(D.isSupplierIvaForCompany && D.isSupplierIvaForCompany(supValNow, activeCo));

      if (parsed.pricePending && $('f_price_pending')) {
        $('f_price_pending').value = '1';
      }

      // Populate multi-line FORM_UI.expItems (recalcExpense multiplies sumPreVat by 1.11 when supIsIva is true)
      if (FORM_UI && Array.isArray(FORM_UI.expItems)) {
        const defWhLoc = D.defaultWarehouseLocationForCompany ? D.defaultWarehouseLocationForCompany(activeCo) : '';
        const fullTotal = parsed.totalAmount || convertedLbpUsd || parsed.subtotalExVat || 0;
        const preVatDiscBeforeTax = Boolean(
          rawScanDiscUsd > 0 && fullTotal > 0 && parsed.subtotalExVat > 0 && parsed.vatAmount > 0
          && Math.abs(round2((parsed.subtotalExVat - rawScanDiscUsd) * 1.11) - fullTotal) <= 0.06
        );
        const effModalDisc = (!parsed.pricePending && rawScanDiscUsd > 0)
          ? (preVatDiscBeforeTax ? round2(Math.max(0, round2(parsed.subtotalExVat * 1.11) - fullTotal)) : rawScanDiscUsd)
          : 0;
        const subIsInclGross = parsed.subtotalExVat > fullTotal && !(supIsIva && parsed.vatAmount > 0) && !preVatDiscBeforeTax;
        const grossTotalForLine = preVatDiscBeforeTax
          ? round2(parsed.subtotalExVat * 1.11)
          : (effModalDisc > 0 && fullTotal > 0 ? (subIsInclGross ? parsed.subtotalExVat : round2(fullTotal + effModalDisc)) : fullTotal);
        let targetPreDiscSum = 0;
        if (!parsed.pricePending) {
          if (supIsIva) {
            const subFitsDiscNet = preVatDiscBeforeTax || (parsed.subtotalExVat > 0 && !subIsInclGross && (!(effModalDisc > 0 && fullTotal > 0) || Math.abs(round2(parsed.subtotalExVat * 1.11) - effModalDisc - fullTotal) <= 0.06));
            targetPreDiscSum = subFitsDiscNet ? parsed.subtotalExVat : round2(grossTotalForLine / 1.11);
          } else {
            targetPreDiscSum = (parsed.subtotalExVat > 0 && parsed.subtotalExVat >= fullTotal && effModalDisc > 0 && !preVatDiscBeforeTax) ? parsed.subtotalExVat : grossTotalForLine;
          }
        }
        if (matched.groundedLines && matched.groundedLines.length > 0) {
          const linesSum = matched.groundedLines.reduce((s, x) => s + Number(x.line_total || 0), 0);
          let scaleFactor = 1;
          if (!parsed.pricePending && linesSum > 0) {
            if (effModalDisc > 0 && targetPreDiscSum > 0) {
              if (Math.abs(linesSum - targetPreDiscSum) > 0.1) {
                scaleFactor = targetPreDiscSum / linesSum;
              }
            } else if (parsed.subtotalExVat > 0 && parsed.totalAmount > parsed.subtotalExVat) {
              if (supIsIva) {
                if (Math.abs(linesSum - parsed.totalAmount) < 0.1) {
                  scaleFactor = parsed.subtotalExVat / parsed.totalAmount;
                }
              } else if (Math.abs(linesSum - parsed.subtotalExVat) < 0.1 && (isHospitality || parsed.hasVat)) {
                scaleFactor = parsed.totalAmount / parsed.subtotalExVat;
              }
            }
          }

          FORM_UI.expItems = matched.groundedLines.map(gl => ({
            item_name: gl.item_name || matched.subcategory || matched.category || 'Invoice Item',
            allocation_mode: matched.equipment ? 'equipment' : 'general',
            target_equipment: matched.equipment || '',
            warehouse_location: defWhLoc,
            qty: gl.qty || 1,
            uom: gl.uom || 'Piece',
            unit_cost: parsed.pricePending ? '' : round2((gl.unit_cost || (gl.line_total / Math.max(gl.qty || 1, 1))) * scaleFactor)
          }));
          FORM_UI.expItem0Manual = true;
        } else {
          const effQty = parsed.qty > 0 ? parsed.qty : 1;
          FORM_UI.expItems = [{
            item_name: matched.product || matched.subcategory || matched.category || 'Scanned Expense Item',
            allocation_mode: matched.equipment ? 'equipment' : 'general',
            target_equipment: matched.equipment || '',
            warehouse_location: defWhLoc,
            qty: effQty,
            uom: parsed.uom || 'Piece',
            unit_cost: parsed.pricePending ? '' : round2(targetPreDiscSum / effQty)
          }];
          FORM_UI.expItem0Manual = true;
        }
        if (D.renderExpenseItemsBuilderRows) D.renderExpenseItemsBuilderRows();
        if (!parsed.pricePending && effModalDisc > 0 && $('f_discount')) {
          if (FORM_UI) FORM_UI.discInputUnit = 'usd';
          setInputValueAndFire('f_discount', effModalDisc, filledSet, warnSet, false);
        }
        filledSet.add('f_exi_name_0');
        filledSet.add('f_exi_cost_0');
        if (convertedLbpUsd > 0) warnSet.add('f_exi_cost_0');
      }
    } else if (targetForm === 'sales') {
      if (matched.site && $('f_saletype')) {
        setInputValueAndFire('f_saletype', 'Delivery', filledSet, warnSet, false);
      }
      if (matched.product && $('f_product')) {
        if (FORM_UI) FORM_UI.lastProduct = '';
        setInputValueAndFire('f_product', matched.product, filledSet, warnSet, !matched.productKnown);
      }
      if (matched.customer && $('f_customer')) {
        setInputValueAndFire('f_customer', matched.customer, filledSet, warnSet, !matched.customerKnown);
      }
      if (matched.site && $('f_site')) {
        setInputValueAndFire('f_site', matched.site, filledSet, warnSet, !matched.siteKnown);
      }
      if (matched.equipment && $('f_truck')) {
        setInputValueAndFire('f_truck', matched.equipment, filledSet, warnSet, !matched.equipmentKnown);
      }
      if (matched.driver && $('f_driver')) {
        setInputValueAndFire('f_driver', matched.driver, filledSet, warnSet, !matched.driverKnown);
      }
      if (parsed.paymentMethod && $('f_method')) {
        setInputValueAndFire('f_method', /cash/i.test(parsed.paymentMethod) ? 'Cash' : 'Credit', filledSet, warnSet, false);
      }
      if (parsed.uom && $('f_uom')) {
        if (FORM_UI) FORM_UI.uomManual = true;
        setInputValueAndFire('f_uom', parsed.uom, filledSet, warnSet, false);
      }
      if (parsed.qty > 0 && $('f_qty')) {
        if (FORM_UI) FORM_UI.qtyManual = true;
        setInputValueAndFire('f_qty', parsed.qty, filledSet, warnSet, false);
        if (FORM_UI) FORM_UI.qtyManual = true;
      }
      const docUnitPrice = parsed.unitPrice > 0
        ? parsed.unitPrice
        : ((parsed.subtotalExVat || parsed.totalAmount || convertedLbpUsd) > 0 && parsed.qty > 0
          ? round2((parsed.subtotalExVat || parsed.totalAmount || convertedLbpUsd) / parsed.qty)
          : 0);
      if (docUnitPrice > 0 && $('f_unitprice') && !$('f_unitprice').readOnly) {
        if (FORM_UI) FORM_UI.priceManual = true;
        setInputValueAndFire('f_unitprice', docUnitPrice, filledSet, warnSet, convertedLbpUsd > 0);
      }
    } else if (targetForm === 'raw') {
      if (matched.site && $('f_site')) {
        setInputValueAndFire('f_site', matched.site, filledSet, warnSet, !matched.siteKnown);
      }
      if (matched.supplier && $('f_siteowner')) {
        setInputValueAndFire('f_siteowner', matched.supplier, filledSet, warnSet, !matched.supplierKnown);
      }
      if (matched.product && $('f_product')) {
        if (FORM_UI) FORM_UI.lastProduct = '';
        setInputValueAndFire('f_product', matched.product, filledSet, warnSet, !matched.productKnown);
      }
      if (matched.equipment && $('f_truck')) {
        setInputValueAndFire('f_truck', matched.equipment, filledSet, warnSet, !matched.equipmentKnown);
      }
      if (matched.driver && $('f_driver')) {
        setInputValueAndFire('f_driver', matched.driver, filledSet, warnSet, !matched.driverKnown);
      }
      if (parsed.uom && $('f_uom')) {
        if (FORM_UI) FORM_UI.uomManual = true;
        setInputValueAndFire('f_uom', parsed.uom, filledSet, warnSet, false);
      }
      if (parsed.qty > 0 && $('f_qty')) {
        if (FORM_UI) FORM_UI.qtyManual = true;
        setInputValueAndFire('f_qty', parsed.qty, filledSet, warnSet, false);
        if (FORM_UI) FORM_UI.qtyManual = true;
      }
      if (parsed.pricePending && $('f_raw_price_pending')) {
        $('f_raw_price_pending').value = '1';
      } else if (parsed.unitPrice > 0 && $('f_unitprice') && !$('f_unitprice').readOnly) {
        if (FORM_UI) FORM_UI.priceManual = true;
        setInputValueAndFire('f_unitprice', parsed.unitPrice, filledSet, warnSet, false);
      }
    } else if (targetForm === 'receipt' || targetForm === 'settlement') {
      if (targetForm === 'receipt' && matched.customer && $('f_customer')) {
        setInputValueAndFire('f_customer', matched.customer, filledSet, warnSet, !matched.customerKnown);
      }
      if (targetForm === 'settlement' && matched.supplier && $('f_supplier')) {
        setInputValueAndFire('f_supplier', matched.supplier, filledSet, warnSet, !matched.supplierKnown);
      }
      if (parsed.paymentMethod && $('f_method')) {
        const methEl = $('f_method');
        const hasExactMeth = methEl.tagName === 'SELECT'
          ? Array.from(methEl.options || []).some(o => norm(o.value) === norm(parsed.paymentMethod))
          : true;
        if (hasExactMeth) {
          setInputValueAndFire('f_method', parsed.paymentMethod, filledSet, warnSet, false);
        } else {
          setInputValueAndFire('f_method', 'Payment', filledSet, warnSet, false);
          extraNotes.push(`Method: ${parsed.paymentMethod}`);
        }
      }
      const rcptUsd = parsed.totalAmount > 0 ? parsed.totalAmount : convertedLbpUsd;
      if (rcptUsd > 0 && $('f_amount')) {
        setInputValueAndFire('f_amount', rcptUsd, filledSet, warnSet, convertedLbpUsd > 0);
      } else if (rcptUsd > 0 && $('f_usd')) {
        setInputValueAndFire('f_usd', rcptUsd, filledSet, warnSet, convertedLbpUsd > 0);
      }
      if (!parsed.pricePending && rawScanDiscUsd > 0 && $('f_discount')) {
        if (FORM_UI) FORM_UI.discInputUnit = 'usd';
        setInputValueAndFire('f_discount', rawScanDiscUsd, filledSet, warnSet, false);
      }
      if (parsed.lbpAmount > 0 && $('f_lbp')) {
        setInputValueAndFire('f_lbp', parsed.lbpAmount, filledSet, warnSet, false);
      }
    } else if (targetForm === 'fuel') {
      if (matched.supplier && $('f_supplier')) {
        setInputValueAndFire('f_supplier', matched.supplier, filledSet, warnSet, !matched.supplierKnown);
      }
      if (matched.equipment && $('f_truck')) {
        setInputValueAndFire('f_truck', matched.equipment, filledSet, warnSet, !matched.equipmentKnown);
      }
      if (matched.driver && $('f_driver')) {
        setInputValueAndFire('f_driver', matched.driver, filledSet, warnSet, !matched.driverKnown);
      }
      if (parsed.qty > 0 && $('f_qty')) {
        setInputValueAndFire('f_qty', parsed.qty, filledSet, warnSet, false);
      }
      if (parsed.unitPrice > 0 && $('f_unitprice')) {
        setInputValueAndFire('f_unitprice', parsed.unitPrice, filledSet, warnSet, false);
      }
    } else if (targetForm === 'repair') {
      if (matched.equipment && $('f_truck')) {
        setInputValueAndFire('f_truck', matched.equipment, filledSet, warnSet, !matched.equipmentKnown);
      }
      if (matched.supplier && $('f_supplier')) {
        setInputValueAndFire('f_supplier', matched.supplier, filledSet, warnSet, !matched.supplierKnown);
      }
      if (FORM_UI && Array.isArray(FORM_UI.repairItems) && matched.groundedLines.length) {
        FORM_UI.repairItems = matched.groundedLines.map(gl => ({
          item_name: gl.item_name,
          qty: gl.qty || 1,
          uom: gl.uom || 'Piece',
          unit_cost: gl.unit_cost || 0
        }));
        if (D.renderRepairItemsBuilderRows) D.renderRepairItemsBuilderRows();
        filledSet.add('f_repi_name_0');
      }
    } else if (targetForm === 'salary') {
      if (matched.staff && $('f_staff')) {
        setInputValueAndFire('f_staff', matched.staff, filledSet, warnSet, !matched.staffKnown);
      }
      if (parsed.totalAmount > 0 && $('f_usd')) {
        setInputValueAndFire('f_usd', parsed.totalAmount, filledSet, warnSet, false);
      }
      if (parsed.lbpAmount > 0 && $('f_lbp')) {
        setInputValueAndFire('f_lbp', parsed.lbpAmount, filledSet, warnSet, false);
      }
      if ((parsed.totalAmount || convertedLbpUsd) > 0 && $('f_amount') && !$('f_amount').readOnly) {
        setInputValueAndFire('f_amount', parsed.totalAmount || convertedLbpUsd, filledSet, warnSet, convertedLbpUsd > 0);
      }
    } else if (targetForm === 'external' || targetForm === 'treasury' || targetForm === 'conversion') {
      const extParty = matched.counterparty || matched.customer || parsed.customer || parsed.counterparty || matched.supplier || parsed.supplier;
      if (extParty && $('f_counterparty')) {
        setInputValueAndFire('f_counterparty', extParty, filledSet, warnSet, false);
      }
      if (parsed.direction && $('f_direction')) {
        setInputValueAndFire('f_direction', parsed.direction === 'Out' ? 'Outflow' : 'Inflow', filledSet, warnSet, false);
      }
      const extUsd = parsed.totalAmount > 0 ? parsed.totalAmount : convertedLbpUsd;
      if (extUsd > 0 && $('f_usd')) {
        setInputValueAndFire('f_usd', extUsd, filledSet, warnSet, convertedLbpUsd > 0 && !(parsed.totalAmount > 0));
      }
      if (parsed.lbpAmount > 0 && $('f_lbp')) {
        setInputValueAndFire('f_lbp', parsed.lbpAmount, filledSet, warnSet, false);
      }
    } else if (targetForm === 'document') {
      if (attObj && $('f_doc_title')) {
        setInputValueAndFire('f_doc_title', parsed.reference ? `${matched.counterparty || 'Document'} · ${parsed.reference}` : (attObj.file_name || 'Scanned Document'), filledSet, warnSet, false);
      }
      if (matched.counterparty && $('f_counterparty')) {
        setInputValueAndFire('f_counterparty', matched.counterparty, filledSet, warnSet, false);
      }
      if ((parsed.totalAmount || convertedLbpUsd) > 0 && $('f_amount')) {
        setInputValueAndFire('f_amount', parsed.totalAmount || convertedLbpUsd, filledSet, warnSet, convertedLbpUsd > 0);
      } else if ((parsed.totalAmount || convertedLbpUsd) > 0 && $('f_usd')) {
        setInputValueAndFire('f_usd', parsed.totalAmount || convertedLbpUsd, filledSet, warnSet, convertedLbpUsd > 0);
      }
    } else if (targetForm === 'equipment' || targetForm === 'companyequipment') {
      const unitCode = matched.equipment || parsed.equipment || parsed.plateNo || (parsed.vin ? parsed.vin.slice(-6) : '');
      if (unitCode && $('f_truck')) {
        setInputValueAndFire('f_truck', unitCode, filledSet, warnSet, !matched.equipmentKnown);
      }
      if ((parsed.plateNo || matched.equipment) && $('f_plateno')) {
        setInputValueAndFire('f_plateno', parsed.plateNo || matched.equipment, filledSet, warnSet, false);
      }
      if ((parsed.model || parsed.product) && $('f_model')) {
        setInputValueAndFire('f_model', parsed.model || parsed.product, filledSet, warnSet, false);
      }
      if (parsed.vin && $('f_vin')) {
        const isWarnVin = Boolean(parsed.vinAudit && parsed.vinAudit.statusTone === 'warn');
        setInputValueAndFire('f_vin', parsed.vin, filledSet, warnSet, isWarnVin);
      }
      if (matched.supplier && $('f_supplier')) {
        setInputValueAndFire('f_supplier', matched.supplier, filledSet, warnSet, !matched.supplierKnown);
      }
      if (matched.driver && $('f_driver')) {
        setInputValueAndFire('f_driver', matched.driver, filledSet, warnSet, !matched.driverKnown);
      }
      if (parsed.date && $('f_effdate')) {
        setInputValueAndFire('f_effdate', parsed.date, filledSet, warnSet, false);
      }
    }

    if (parsed.vin && targetForm !== 'equipment' && targetForm !== 'companyequipment') {
      if ($('f_vin')) {
        setInputValueAndFire('f_vin', parsed.vin, filledSet, warnSet, Boolean(parsed.vinAudit && parsed.vinAudit.statusTone === 'warn'));
      } else {
        extraNotes.push(`VIN: ${parsed.vin}`);
      }
    }

    // 5. Notes
    const combinedNotes = sanitizeOutwardText(
      [parsed.notes, ...extraNotes].filter(Boolean).join(' · ')
    );
    if (combinedNotes && $('f_notes')) {
      setInputValueAndFire('f_notes', combinedNotes, filledSet, warnSet, false);
    }

    // 6. Attach all scanned pages (1..N) into FORM_UI.attachments without duplication or cross-slip bleed
    const bundleAtts = Array.isArray(scanBundle.attObjs) && scanBundle.attObjs.length
      ? scanBundle.attObjs
      : (attObj ? [attObj] : []);
    const hasQueueManualList = Boolean(applyOpts && Array.isArray(applyOpts.queueManualAttachments));
    if (FORM_UI && (bundleAtts.length || hasQueueManualList)) {
      FORM_UI.attachments = hasQueueManualList
        ? applyOpts.queueManualAttachments.filter(a => a && !a._fromSmartScan).map(a => Object.assign({}, a))
        : (Array.isArray(FORM_UI.attachments) ? FORM_UI.attachments.filter(a => !(a && a._fromSmartScan)) : []);
      bundleAtts.forEach(aItem => {
        if (!aItem) return;
        const dup = FORM_UI.attachments.some(a =>
          a &&
          a.file_name === aItem.file_name &&
          Number(a.file_size || 0) === Number(aItem.file_size || 0) &&
          String(a.data_url || '').slice(0, 120) === String(aItem.data_url || '').slice(0, 120)
        );
        if (!dup) {
          FORM_UI.attachments.push(Object.assign({}, aItem, { _fromSmartScan: true }));
        }
      });
      if (D.renderEntryAttachmentsListUI) D.renderEntryAttachmentsListUI();
    }

    // 7. Recalculate totals, price rules, VAT, locks & mark modal dirty so Unsaved Guard protects user work
    if (D.recalcForm) D.recalcForm(false);
    if (FORM_UI) FORM_UI.userInteracted = true;

    scanBundle.appliedForm = targetForm;
    scanBundle.filledFields = Array.from(filledSet);
    scanBundle.warnFields = Array.from(warnSet);
    SCAN_STATE.lastScan = scanBundle;

    // Auto-open Side-by-Side preview on wide desktop unless user closed it
    if (typeof window !== 'undefined' && window.innerWidth >= 1120 && SCAN_STATE.splitOpen !== false) {
      SCAN_STATE.splitOpen = true;
    }

    mountOnEntryModal();
    decorateFilledFieldsDom(filledSet, warnSet);
    syncSplitPreviewDom();
  }

  async function normalizeSingleScanItem(item, captureMethod, idx) {
    let fileObj = null;
    let attObj = null;
    if (typeof Blob !== 'undefined' && item instanceof Blob) {
      fileObj = item;
      if (item._ssCachedAtt && item._ssCachedAtt.data_url) {
        attObj = Object.assign({}, item._ssCachedAtt, {
          capture_method: captureMethod || item._ssCachedAtt.capture_method || 'AI Smart Scan'
        });
        return { fileObj, attObj };
      }
      if (D && D.readAndCompressAttachmentFile) {
        attObj = await D.readAndCompressAttachmentFile(fileObj, captureMethod);
      }
      if (!attObj) {
        const dataUrl = await new Promise(res => {
          const r = new FileReader();
          r.onload = () => res(String(r.result || ''));
          r.onerror = () => res('');
          r.readAsDataURL(fileObj);
        });
        attObj = {
          id: 'att-ss-' + Date.now() + '-' + idx,
          file_name: fileObj.name || `Scanned_Page_${idx + 1}`,
          mime_type: fileObj.type || 'application/octet-stream',
          file_size: fileObj.size || 0,
          capture_method: captureMethod,
          uploaded_at: new Date().toISOString(),
          data_url: dataUrl
        };
      }
      if (attObj && attObj.data_url) {
        try { item._ssCachedAtt = attObj; } catch (_) {}
      }
    } else if (item && typeof item === 'object') {
      const resolvedDataUrl = (D && D.resolveDocDataUrl && D.resolveDocDataUrl(item)) || item.data_url || '';
      attObj = Object.assign({}, item, {
        file_name: item.file_name || item.name || `Vault_Document_${idx + 1}.svg`,
        mime_type: item.mime_type || item.type || 'image/svg+xml',
        file_size: item.file_size || item.size || (resolvedDataUrl ? Math.round(resolvedDataUrl.length * 0.72) : 1024),
        capture_method: item.capture_method || captureMethod,
        data_url: resolvedDataUrl
      });
    }
    return { fileObj, attObj };
  }

  function expandInputToScanBatch(inputFilesOrAtt) {
    if (!inputFilesOrAtt) return [];
    if (Array.isArray(inputFilesOrAtt)) return inputFilesOrAtt.filter(Boolean);
    if (typeof FileList !== 'undefined' && inputFilesOrAtt instanceof FileList) return Array.from(inputFilesOrAtt).filter(Boolean);
    if (typeof inputFilesOrAtt === 'object' && typeof inputFilesOrAtt.length === 'number' && !(typeof Blob !== 'undefined' && inputFilesOrAtt instanceof Blob) && !inputFilesOrAtt.data_url && !inputFilesOrAtt.file_name) {
      return Array.from(inputFilesOrAtt).filter(Boolean);
    }
    return [inputFilesOrAtt];
  }

  // ==================== REC 5: CAMERA & SMART SCAN PRE-CHECK ENGINE ====================
  const PRECHECK_FORM_TO_CR = {
    sales: 'sales_tickets',
    raw: 'raw_purchases',
    expense: 'expenses',
    settlement: 'settlements',
    receipt: 'receipts',
    salary: 'salaries'
  };

  const DOM_PRECHECK_PARTY_FIELDS = {
    ide_client: 'customer',
    ide_tenant: 'customer',
    ide_buyer: 'customer',
    ide_customer: 'customer',
    ide_member: 'customer',
    ide_supplier: 'supplier',
    ide_contractor: 'supplier',
    ide_carrier: 'supplier',
    ide_party: 'counterparty',
    ide_partner: 'counterparty',
    ide_lender: 'counterparty',
    ide_property: 'site',
    ide_outlet: 'site',
    ide_cashier: 'staff',
    ide_producer: 'staff'
  };

  function computePrecheckWarnSig(pre) {
    if (!pre || !pre.hasWarning) return '';
    const pwPart = (pre.partyWarnings || [])
      .map(w => `${w.targetKey || ''}:${norm(w.raw || '')}->${norm(w.suggested || '')}`)
      .sort()
      .join(';');
    let ncPart = '';
    if (pre.nearCopyHit) {
      const h = pre.nearCopyHit;
      const rows = Array.isArray(h.rows) ? h.rows : (Array.isArray(h.matches) ? h.matches : (h.row ? [h.row] : []));
      const ids = rows.map(r => String((r && (r._srcId || r.id || r.code)) || '')).filter(Boolean).sort().join(',');
      ncPart = `${h.reason || ''}:${h.day || ''}:${ids || Number(h.sumUsd || 0).toFixed(2)}`;
    }
    return [pwPart, ncPart].filter(Boolean).join('||');
  }

  function collectCarriedPrecheckFlags(items) {
    const overrides = {};
    let ack = false;
    let ackSig = '';
    (items || []).forEach(it => {
      if (!it || typeof it !== 'object') return;
      if (it._ssPrecheckAck) ack = true;
      if (it._ssPrecheckAckSig && !ackSig) ackSig = String(it._ssPrecheckAckSig);
      if (it._ssPrecheckOverrides && typeof it._ssPrecheckOverrides === 'object') {
        Object.assign(overrides, it._ssPrecheckOverrides);
      }
    });
    return { overrides, ack, ackSig };
  }

  function precheckKindLabel(kind) {
    const k = String(kind || '').trim().toLowerCase();
    if (k === 'staff') return 'staff member';
    if (k === 'customer' || k === 'supplier' || k === 'site' || k === 'counterparty') return k;
    return 'counterparty';
  }

  function precheckFormLabelKey(tf) {
    return {
      sales: 'Sales Ticket',
      raw: 'Raw Material Ticket',
      receipt: 'Customer Receipt',
      expense: 'Expense',
      settlement: 'Supplier Payment',
      salary: 'Salary Payment',
      external: 'External Movement'
    }[String(tf || '')] || 'Entry';
  }

  function buildPrecheckNearCopySpec(hit, labelKey) {
    if (!hit) return null;
    const rMap = {
      sum: 'Split match: existing rows on the same day add up to this amount',
      sum_gap: 'Split match: existing rows one day apart add up to this amount',
      sum_typo: 'Split typo match: rows under a similar name add up to this amount',
      sum_gap_typo: 'Split typo match: rows one day apart under a similar name add up to this amount',
      ticket: 'Duplicate slip warning: same day, amount and 1-digit-apart ticket',
      ticket_typo: 'Duplicate slip + typo warning: similar name and 1-digit-apart ticket',
      vat: '11% VAT duplicate warning: same day, party and VAT-related amount',
      vat_typo: '11% VAT + typo warning: similar name and VAT-related amount',
      same_amt: 'Duplicate warning: same day, party and amount already logged',
      same_amt_typo: 'Duplicate + typo warning: same day and amount under a similar name'
    };
    const reasonKey = rMap[hit.reason] || 'Possible duplicate or split match detected';
    const dayStr = hit.day ? ((D && D.fmtDateDMY) ? D.fmtDateDMY(hit.day) : hit.day) : '';
    const rowSample = hit.row || hit.match || (Array.isArray(hit.rows) && hit.rows[0]) || (Array.isArray(hit.matches) && hit.matches[0]) || null;
    const sumVal = hit.sumUsd != null ? Number(hit.sumUsd) : (rowSample && D && D.nearCopySumUsd ? D.nearCopySumUsd(rowSample) : 0);
    const amtStr = sumVal > 0 && D && D.fmtUSD ? D.fmtUSD(sumVal, 2) : '';
    const partyStr = hit.typoParty || (rowSample && (rowSample.customer || rowSample.supplier || rowSample.site || rowSample.staff || rowSample.tenant || rowSample.client || rowSample.buyer || rowSample.counterparty)) || '';
    const lblKey = labelKey || 'Entry';
    const metaStr = [dayStr, partyStr, amtStr].filter(Boolean).join(' · ');
    const bits = [lblKey, dayStr, partyStr, amtStr].filter(Boolean).join(' · ');
    return {
      type: 'near_copy',
      reasonKey,
      labelKey: lblKey,
      metaStr,
      text: bits ? `${reasonKey} (${bits})` : reasonKey
    };
  }

  function formatPrecheckNearCopyLine(hit, labelPrefix) {
    const spec = buildPrecheckNearCopySpec(hit, labelPrefix);
    return spec ? spec.text : '';
  }

  function renderPrecheckItemHtml(it) {
    if (!it) return '';
    if (typeof it === 'string') {
      const clean = sanitizeOutwardText(it);
      return clean ? `<span data-no-i18n="1">${esc(clean)}</span>` : '';
    }
    if (it.type === 'party') {
      return `<span>${esc(it.prefixKey)}</span> <b data-no-i18n="1">&quot;${esc(sanitizeOutwardText(it.raw))}&quot;</b> <span>${esc(it.connectorKey)}</span> <b data-no-i18n="1">&quot;${esc(sanitizeOutwardText(it.suggested))}&quot;</b>`;
    }
    if (it.type === 'near_copy') {
      const meta = sanitizeOutwardText(it.metaStr || '');
      const lbl = it.labelKey ? `<span>${esc(it.labelKey)}</span>` : '';
      const sep = (it.labelKey && meta) ? '<span data-no-i18n="1"> · </span>' : '';
      const tail = meta ? `<span data-no-i18n="1">${esc(meta)}</span>` : '';
      return `<span>${esc(it.reasonKey)}</span><span data-no-i18n="1"> (</span>${lbl}${sep}${tail}<span data-no-i18n="1">)</span>`;
    }
    return `<span data-no-i18n="1">${esc(sanitizeOutwardText(it.text || ''))}</span>`;
  }

  function inspectPartyPrecheck(kind, rawVal, co, ind, targetKey, fieldLabel) {
    const rawStr = String(rawVal || '').trim();
    if (!rawStr || !D) return null;
    const kindLbl = precheckKindLabel(kind);
    const aliasResolved = (typeof D.canonicalizePartyByHygiene === 'function')
      ? D.canonicalizePartyByHygiene(kind, rawStr, co, ind)
      : ((typeof D.resolveConfirmedPartyAlias === 'function') ? D.resolveConfirmedPartyAlias(kind, rawStr, co, ind) : '');
    const aliasCanon = (aliasResolved && norm(aliasResolved) !== norm(rawStr)) ? aliasResolved : '';
    if (aliasCanon && norm(aliasCanon) !== norm(rawStr)) {
      const prefixKey = `Known alias of existing ${kindLbl}:`;
      return {
        type: 'party',
        kind,
        targetKey,
        fieldLabel,
        raw: rawStr,
        suggested: aliasCanon,
        isAlias: true,
        prefixKey,
        connectorKey: 'maps to',
        text: `${prefixKey} "${rawStr}" maps to "${aliasCanon}"`
      };
    }
    const candidates = (typeof D.getScopedPartyCandidates === 'function')
      ? D.getScopedPartyCandidates(kind, co, null, { ind })
      : [];
    const nearMatch = (typeof D.findNearPartyMatch === 'function')
      ? D.findNearPartyMatch(rawStr, candidates, { kind, company: co, ind })
      : null;
    if (nearMatch && norm(nearMatch) !== norm(rawStr)) {
      const prefixKey = `One letter off existing ${kindLbl}:`;
      return {
        type: 'party',
        kind,
        targetKey,
        fieldLabel,
        raw: rawStr,
        suggested: nearMatch,
        isAlias: false,
        prefixKey,
        connectorKey: 'matches',
        text: `${prefixKey} "${rawStr}", matches "${nearMatch}"`
      };
    }
    return null;
  }

  function applyPrecheckOverrideToBundle(scanBundle, overrideKey, canonical) {
    if (!scanBundle || !overrideKey || !canonical) return;
    const p = scanBundle.parsed || {};
    const m = scanBundle.matched || {};
    const tf = p.formType || 'expense';
    if (overrideKey === 'customer') {
      p.customer = canonical;
      m.customer = canonical;
      m.customerKnown = true;
      if (Array.isArray(m.warnings)) {
        m.warnings = m.warnings.filter(w => !w || w.kind !== 'unknown_customer');
      }
      if (['sales', 'receipt'].includes(tf)) {
        m.counterparty = canonical;
        if (p.counterparty) p.counterparty = canonical;
      }
    } else if (overrideKey === 'supplier') {
      p.supplier = canonical;
      m.supplier = canonical;
      m.supplierKnown = true;
      if (Array.isArray(m.warnings)) {
        m.warnings = m.warnings.filter(w => !w || w.kind !== 'unknown_supplier');
      }
      if (['expense', 'settlement', 'raw'].includes(tf)) {
        m.counterparty = canonical;
        if (p.counterparty) p.counterparty = canonical;
      }
    } else if (overrideKey === 'site') {
      p.site = canonical;
      m.site = canonical;
      m.siteKnown = true;
    } else if (overrideKey === 'staff') {
      p.staff = canonical;
      m.staff = canonical;
      m.staffKnown = true;
    }
  }

  function restoreRawParsedForUnoverriddenWarnings(scanBundle, partyWarnings, overridesMap) {
    if (!scanBundle || !Array.isArray(partyWarnings) || !partyWarnings.length) return;
    const p = scanBundle.parsed || {};
    const m = scanBundle.matched || {};
    const tf = p.formType || 'expense';
    partyWarnings.forEach(pw => {
      const tk = pw && pw.targetKey;
      if (!tk) return;
      if (overridesMap && overridesMap[tk]) return;
      const rawVal = String((pw && pw.raw) || p[tk] || '').trim();
      if (!rawVal) return;
      p[tk] = rawVal;
      m[tk] = rawVal;
      m[tk + 'Known'] = false;
      if ((tk === 'supplier' && ['expense', 'settlement', 'raw'].includes(tf)) || (tk === 'customer' && ['sales', 'receipt'].includes(tf))) {
        m.counterparty = rawVal;
        if (p.counterparty) p.counterparty = rawVal;
      }
    });
  }

  function findScanExactDuplicate(crKey, candRec) {
    if (!D || !crKey || !candRec) return null;
    const day = String(candRec.date || '').slice(0, 10);
    const co = norm(candRec.company || '');
    const amt = Number(candRec.total_ttc || candRec.total || candRec.amount || 0);
    if (!day || !co || !(amt > 0.005)) return null;
    const pk = crKey === 'sales_tickets' || crKey === 'receipts'
      ? 'customer'
      : (crKey === 'raw_purchases' ? 'site' : (crKey === 'salaries' ? 'staff' : 'supplier'));
    const rawParty = String(candRec[pk] || (pk === 'site' ? candRec.supplier : '') || '').trim();
    const canonFn = typeof D.canonicalizePartyByHygiene === 'function' ? D.canonicalizePartyByHygiene : null;
    const canonParty = canonFn ? (canonFn(pk, rawParty, candRec.company) || rawParty) : rawParty;
    const partyKey = canonParty.toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9\u0600-\u06ff]/g, '');
    if (!partyKey) return null;
    const pool = [].concat(
      (D.SEED && D.SEED.records && Array.isArray(D.SEED.records[crKey])) ? D.SEED.records[crKey] : [],
      (D.STATE && D.STATE.customRecords && Array.isArray(D.STATE.customRecords[crKey])) ? D.STATE.customRecords[crKey] : []
    );
    const seen = new Set();
    let typoMatch = null;
    for (let i = 0; i < pool.length; i++) {
      const r = pool[i];
      if (!r || r.voided || r.voided_at || r.price_pending || r._absorbedSeedTwin) continue;
      if (String(r.date || '').slice(0, 10) !== day) continue;
      if (norm(r.company || '') !== co) continue;
      if (r.id) {
        const rid = String(r.id);
        if (seen.has(rid)) continue;
        seen.add(rid);
      }
      const rAmt = Number(r.total_ttc != null ? r.total_ttc : (r.total != null ? r.total : (r.amount != null ? r.amount : 0)));
      if (!(Math.abs(rAmt - amt) <= 0.02)) continue;
      const rRawParty = String(r[pk] || (pk === 'site' ? (r.site_owner || r.supplier) : '') || '').trim();
      const rCanonParty = canonFn ? (canonFn(pk, rRawParty, r.company || candRec.company) || rRawParty) : rRawParty;
      const rKey = rCanonParty.toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9\u0600-\u06ff]/g, '');
      if (!rKey) continue;
      if (rKey === partyKey) {
        return { reason: 'same_amt', row: r, match: r, matches: [r], matchCount: 1, sumUsd: rAmt, day };
      }
      if (!typoMatch && typeof D.findNearPartyMatch === 'function') {
        const matched = D.findNearPartyMatch(rawParty, [rRawParty], { kind: pk === 'site' ? 'site' : (pk === 'staff' ? 'staff' : pk), company: candRec.company });
        if (matched) {
          typoMatch = { reason: 'same_amt_typo', row: r, match: r, matches: [r], matchCount: 1, sumUsd: rAmt, day, typoParty: rRawParty };
        }
      }
    }
    return typoMatch;
  }

  function evaluateScanPrecheck(scanBundle) {
    const empty = { hasWarning: false, nearCopyHit: null, crKey: '', partyWarnings: [], summaryItems: [], summaryLines: [] };
    if (!D || !scanBundle || !scanBundle.parsed) return empty;
    const p = scanBundle.parsed;
    const m = scanBundle.matched || {};
    const tf = p.formType || 'expense';
    const co = (m.targetCompany || p.company || (D.defaultEntryCompany ? D.defaultEntryCompany() : 'WTC'));
    const coKey = (D.COMPANY_KEY_BY_NAME && D.COMPANY_KEY_BY_NAME[co]) || '';
    const ind = (D.getActiveIndustry ? D.getActiveIndustry(coKey || co) : 'Manufacturing') || 'Manufacturing';

    const partyWarnings = [];
    const seenWarn = new Set();
    const checkField = (kind, rawVal, targetKey, lbl) => {
      const hit = inspectPartyPrecheck(kind, rawVal, co, ind, targetKey, lbl);
      if (hit && !seenWarn.has(`${targetKey}|${norm(hit.suggested)}`)) {
        seenWarn.add(`${targetKey}|${norm(hit.suggested)}`);
        partyWarnings.push(hit);
      }
    };

    const rawCust = p.customer || (['sales', 'receipt'].includes(tf) ? p.counterparty : '');
    const rawSup = p.supplier || (['expense', 'settlement', 'raw'].includes(tf) ? p.counterparty : '');
    if (rawCust) checkField('customer', rawCust, 'customer', 'customer');
    if (rawSup) checkField('supplier', rawSup, 'supplier', 'supplier');
    if (p.site) checkField('site', p.site, 'site', 'site');
    if (p.staff) checkField('staff', p.staff, 'staff', 'staff');

    const crKey = PRECHECK_FORM_TO_CR[tf] || '';
    let nearCopyHit = null;
    if (crKey && typeof D.findNearCopyEntry === 'function') {
      const todayStr = (D.todayISO && D.todayISO()) || new Date().toISOString().slice(0, 10);
      const tktDigits = String(p.reference || '').replace(/[^0-9]/g, '');
      const candRec = {
        date: p.date || todayStr,
        company: co,
        method: p.paymentMethod || (tf === 'settlement' ? 'Payment' : (tf === 'receipt' ? 'Payment' : 'Cash')),
        ticket_no: tktDigits || p.reference || '',
        reference: p.reference || '',
        invoice: p.reference || '',
        truck: m.equipment || p.equipment || '',
        customer: rawCust || m.customer || '',
        supplier: rawSup || m.supplier || '',
        site: p.site || m.site || '',
        staff: p.staff || m.staff || '',
        total_ttc: Number(p.totalAmount || 0),
        total: Number(p.netAmount || p.totalAmount || 0),
        amount: Number(p.totalAmount || 0),
        lbp_amount: Number(p.lbpAmount || 0)
      };
      nearCopyHit = D.findNearCopyEntry(crKey, candRec);
      if (!nearCopyHit) {
        nearCopyHit = findScanExactDuplicate(crKey, candRec);
      }
    }

    const summaryItems = partyWarnings.slice();
    const ncSpec = nearCopyHit ? buildPrecheckNearCopySpec(nearCopyHit, precheckFormLabelKey(tf)) : null;
    if (ncSpec) summaryItems.push(ncSpec);
    const summaryLines = summaryItems.map(it => it.text);
    const nearCopyLine = ncSpec ? ncSpec.text : '';
    const hasWarn = Boolean(nearCopyHit || partyWarnings.length);
    return {
      hasWarning: hasWarn,
      nearCopyHit,
      nearCopyLine,
      crKey,
      partyWarnings,
      summaryItems,
      summaryLines,
      warnSig: computePrecheckWarnSig({ hasWarning: hasWarn, partyWarnings, nearCopyHit })
    };
  }

  function evaluateDomainScanPrecheck(extraction) {
    const empty = { hasWarning: false, nearCopyHit: null, nearCopyLine: '', formKey: '', partyWarnings: [], summaryItems: [], summaryLines: [] };
    if (!D || !extraction || !extraction.fields) return empty;
    const f = extraction.fields || {};
    const formKey = String(extraction.formKey || '');
    const co = String(extraction.company || (D.defaultEntryCompany ? D.defaultEntryCompany() : '') || '');
    const ind = String(extraction.ind || (D.getActiveIndustry ? D.getActiveIndustry() : 'Manufacturing') || 'Manufacturing');

    const partyWarnings = [];
    const seen = new Set();
    Object.entries(DOM_PRECHECK_PARTY_FIELDS).forEach(([fid, kind]) => {
      const rawVal = f[fid];
      if (!rawVal) return;
      const lbl = kind === 'site' ? 'site' : (kind === 'staff' ? 'staff' : (kind === 'customer' ? 'customer' : (kind === 'counterparty' ? 'counterparty' : 'supplier')));
      const hit = inspectPartyPrecheck(kind, rawVal, co, ind, fid, lbl);
      if (hit && !seen.has(`${fid}|${norm(hit.suggested)}`)) {
        seen.add(`${fid}|${norm(hit.suggested)}`);
        partyWarnings.push(hit);
      }
    });

    let nearCopyHit = null;
    if (formKey && typeof D.findDomainNearCopyEntry === 'function') {
      const todayStr = (D.todayISO && D.todayISO()) || new Date().toISOString().slice(0, 10);
      const netVal = Number(f.ide_net || 0);
      const ttcFromNet = netVal > 0 ? (/4235/i.test(co) || formKey === 'trd_sales' ? round2(netVal * 1.11) : netVal) : 0;
      const hldCp = f.ide_party || f.ide_partner || f.ide_lender || '';
      const hasVal = v => v != null && String(v).trim() !== '';
      const candDom = {
        id: f.ide_id || '',
        company: co,
        date: f.ide_date || todayStr,
        due_date: f.ide_due || f.ide_date || todayStr,
        promise_date: f.ide_due || f.ide_date || todayStr,
        start_date: f.ide_start_date || f.ide_date || todayStr,
        loss_date: f.ide_date || todayStr,
        next_due: f.ide_due || f.ide_date || todayStr,
        tax_seq: f.ide_tax_seq || '',
        reference: f.ide_ref || f.ide_id || '',
        policy_no: f.ide_policy_no || '',
        book: f.ide_book || '',
        chassis: f.ide_chassis || '',
        tenant: f.ide_tenant || '',
        buyer: f.ide_buyer || '',
        customer: f.ide_customer || '',
        client: f.ide_client || '',
        member: f.ide_member || '',
        supplier: f.ide_supplier || '',
        contractor: f.ide_contractor || '',
        carrier: f.ide_carrier || '',
        property: f.ide_property || '',
        outlet: f.ide_outlet || '',
        cashier: f.ide_cashier || '',
        terminal: f.ide_terminal || '',
        party: hldCp,
        counterparty: hldCp,
        partner: f.ide_partner || hldCp,
        lender: f.ide_lender || hldCp,
        toCo: f.ide_to || '',
        fromCo: f.ide_from || '',
        net_usd: netVal,
        ttc_usd: Number(f.ide_tot || ttcFromNet || 0),
        amount_ttc_usd: Number(f.ide_tot || ttcFromNet || 0),
        pos_billed_ttc: Number(f.ide_billed || 0),
        gross_prem_usd: Number(f.ide_gwp != null ? f.ide_gwp : (f.ide_billed || 0)),
        client_billed_4112_usd: Number(f.ide_billed != null ? f.ide_billed : (f.ide_gwp || f.ide_tot || 0)),
        ...((hasVal(f.ide_collected) || hasVal(f.ide_paid) || hasVal(f.ide_tot)) ? { collected_usd: Number(hasVal(f.ide_collected) ? f.ide_collected : (hasVal(f.ide_paid) ? f.ide_paid : f.ide_tot)) } : {}),
        settled_usd: Number(f.ide_amount || f.ide_tot || f.ide_paid || 0),
        gross_usd: Number(f.ide_gross || f.ide_tot || f.ide_paid || 0),
        contract_usd: Number(f.ide_contract || 0),
        ...((hasVal(f.ide_paid) || hasVal(f.ide_collected)) ? { paid_usd: Number(hasVal(f.ide_paid) ? f.ide_paid : f.ide_collected) } : {}),
        actual_usd: Number(f.ide_actual || 0),
        budget_usd: Number(f.ide_budget || 0),
        fob_usd: Number(f.ide_fob || 0),
        total_landed_usd: Number(f.ide_fob || 0) + Number(f.ide_landed_add || 0),
        claimed_usd: Number(f.ide_claimed || 0),
        usd: Number(f.ide_usd || 0),
        usd_amount: Number(f.ide_usd || f.ide_amount || f.ide_gross || 0),
        lbp_amount: Number(f.ide_lbp || 0),
        amount: Number(f.ide_usd || f.ide_amount || f.ide_gross || 0),
        flow: f.ide_direction || 'Outflow'
      };
      nearCopyHit = D.findDomainNearCopyEntry(formKey, candDom, { fromScan: true });
    }

    const domLabels = (D && D.DOMAIN_NEAR_COPY_LABELS) || {};
    const summaryItems = partyWarnings.slice();
    const ncSpec = nearCopyHit ? buildPrecheckNearCopySpec(nearCopyHit, domLabels[formKey] || 'Entry') : null;
    if (ncSpec) summaryItems.push(ncSpec);
    const summaryLines = summaryItems.map(it => it.text);
    const nearCopyLine = ncSpec ? ncSpec.text : '';
    const hasDomWarn = Boolean(nearCopyHit || partyWarnings.length);
    return {
      hasWarning: hasDomWarn,
      nearCopyHit,
      nearCopyLine,
      formKey,
      partyWarnings,
      summaryItems,
      summaryLines,
      warnSig: computePrecheckWarnSig({ hasWarning: hasDomWarn, partyWarnings, nearCopyHit })
    };
  }

  async function precheckCapturedPages(inputFilesOrAtt, opts = {}) {
    const empty = { hasWarning: false, mode: 'entry', nearCopyHit: null, partyWarnings: [], summaryItems: [], summaryLines: [] };
    if (!D) return empty;
    const rawItems = expandInputToScanBatch(inputFilesOrAtt);
    if (!rawItems.length) return empty;
    try {
      const pageEntries = [];
      let primaryFileName = '';
      for (let i = 0; i < rawItems.length; i++) {
        const pair = await normalizeSingleScanItem(rawItems[i], 'Camera Pre-Check', i);
        if (!pair.attObj) continue;
        const pName = pair.attObj.file_name || `Page_${i + 1}`;
        if (!primaryFileName) primaryFileName = pName;
        if (pair.fileObj && typeof pair.fileObj._extractedText === 'string') {
          pageEntries.push({ pageNum: pageEntries.length + 1, fileName: pName, text: pair.fileObj._extractedText });
          continue;
        }
        const isPdfPair = /\.pdf$/i.test(pName) || /application\/pdf/i.test(pair.attObj.mime_type || '');
        if (isPdfPair && pair.fileObj) {
          const ab = await pair.fileObj.arrayBuffer();
          const pdfPages = await extractPdfPagesTextClient(ab);
          if (pdfPages.length > 1) {
            pdfPages.forEach((pt, pIdx) => pageEntries.push({ pageNum: pageEntries.length + 1, fileName: `${pName} (p.${pIdx + 1})`, text: pt }));
            continue;
          }
        }
        const isTextBearing = /\.(svg|pdf|txt|csv|tsv|json|xml|docx|xlsx)$/i.test(pName) ||
          /svg|pdf|text|json|xml|word|sheet/i.test(pair.attObj.mime_type || '');
        const txt = (!isHeadlessEnv() || isTextBearing)
          ? await extractAnyDocumentText(pair.fileObj, pair.attObj, () => {})
          : '';
        pageEntries.push({ pageNum: pageEntries.length + 1, fileName: pName, text: txt });
      }
      const totalPages = Math.max(1, pageEntries.length);
      const meaningfulPrecheckLen = pageEntries.reduce((s, pe) => s + String((pe && pe.text) || '').trim().length, 0);
      if (meaningfulPrecheckLen < 10) return empty;
      const combinedText = totalPages > 1
        ? pageEntries.map((pe, idx) => `=== PAGE ${idx + 1} OF ${totalPages} (${pe.fileName}) ===\n${pe.text || ''}`).join('\n\n')
        : String((pageEntries[0] && pageEntries[0].text) || '');

      const indModal = $('indDomainEntryModal');
      const isDomOpen = opts.mode === 'domain' || Boolean(indModal && !indModal.hidden && indModal._currentDomainSpec);
      if (isDomOpen) {
        const curSpec = indModal && indModal._currentDomainSpec ? indModal._currentDomainSpec : null;
        const detBundle = deterministicParseDomainBundle(pageEntries, combinedText, curSpec, primaryFileName);
        if (!detBundle || !Object.keys(detBundle.fields || {}).length) return Object.assign({}, empty, { mode: 'domain' });
        if (opts && opts.partyOverrides && typeof opts.partyOverrides === 'object') {
          Object.entries(opts.partyOverrides).forEach(([k, v]) => {
            if (v) detBundle.fields[k] = v;
          });
        }
        const extObj = {
          ind: (curSpec && curSpec.ind) || '',
          formKey: (curSpec && curSpec.key) || detBundle.formKey || '',
          company: detBundle.company || (($('ide_company') && $('ide_company').value) || ''),
          fields: detBundle.fields
        };
        return Object.assign({ mode: 'domain' }, evaluateDomainScanPrecheck(extObj));
      }

      const detParsed = synthesizeMultiPageDeterministic(pageEntries, combinedText, primaryFileName);
      const matched = groundExtractedEntities(detParsed, combinedText);
      const entryBundle = { parsed: detParsed, matched, extractedText: combinedText };
      if (opts && opts.partyOverrides && typeof opts.partyOverrides === 'object') {
        Object.entries(opts.partyOverrides).forEach(([k, v]) => {
          if (v) applyPrecheckOverrideToBundle(entryBundle, k, v);
        });
      }
      return Object.assign({ mode: 'entry' }, evaluateScanPrecheck(entryBundle));
    } catch (_) {
      return empty;
    }
  }

  function renderIndPrecheckBanner(extraction, precheck) {
    const bar = $('indEntrySmartScanBar');
    const oldBanner = $('indEntryPrecheckBanner');
    if (oldBanner) oldBanner.remove();
    if (!bar || !extraction || !precheck || !precheck.hasWarning) {
      SCAN_STATE.pendingDomainPrecheck = null;
      return null;
    }
    SCAN_STATE.pendingDomainPrecheck = { extraction, precheck };
    const banner = document.createElement('div');
    banner.id = 'indEntryPrecheckBanner';
    banner.className = 'ss-precheck-banner';
    const pwButtonsHtml = (precheck.partyWarnings || []).map((pw, idx) => `
      <button type="button" class="btn btn-primary btn-sm" data-ind-precheck-use="${idx}"><span>Use</span> <b data-no-i18n="1">${esc(pw.suggested)}</b></button>
    `).join('');
    banner.innerHTML = `
      <div class="ss-precheck-head">
        <span>${ic('warn')} Pre-Check Hold: Review Before Filling Domain Form</span>
      </div>
      <div class="ss-precheck-lines">
        ${((precheck.summaryItems && precheck.summaryItems.length) ? precheck.summaryItems : (precheck.summaryLines || [])).map(it => `<div class="ss-precheck-line">${renderPrecheckItemHtml(it)}</div>`).join('')}
      </div>
      <div class="ss-precheck-actions">
        ${pwButtonsHtml}
        <button type="button" class="btn btn-outline-bar btn-sm" id="indPrecheckApplyBtn">Fill Form Anyway</button>
        ${hasActiveSlipQueue() ? `<button type="button" class="btn btn-ghost-bar btn-sm" id="indPrecheckSkipBtn">Skip Slip</button>` : ''}
        <button type="button" class="btn btn-ghost-bar btn-sm" id="indPrecheckDiscardBtn">Discard Scan</button>
      </div>
    `;
    bar.insertAdjacentElement('afterend', banner);
    banner.querySelectorAll('[data-ind-precheck-use]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-ind-precheck-use'));
        const pw = (precheck.partyWarnings || [])[idx];
        if (!pw || !extraction.fields) return;
        extraction.fields[pw.targetKey] = pw.suggested;
        const nextPre = evaluateDomainScanPrecheck(extraction);
        if (hasActiveSlipQueue()) {
          const curIt = getActiveQueueItem();
          if (curIt) {
            curIt.precheck = nextPre;
            curIt.precheckOverrides = curIt.precheckOverrides || {};
            curIt.precheckOverrides[pw.targetKey] = pw.suggested;
          }
        }
        if (nextPre.hasWarning) {
          renderIndPrecheckBanner(extraction, nextPre);
        } else {
          banner.remove();
          SCAN_STATE.pendingDomainPrecheck = null;
          applyDomainExtractionToModal(extraction);
        }
      });
    });
    const appBtn = bar ? banner.querySelector('#indPrecheckApplyBtn') : null;
    if (appBtn) {
      appBtn.addEventListener('click', () => {
        banner.remove();
        SCAN_STATE.pendingDomainPrecheck = null;
        if (hasActiveSlipQueue()) {
          const curIt = getActiveQueueItem();
          if (curIt && precheck && precheck.warnSig) {
            curIt.precheckAck = true;
            curIt.precheckAckSig = precheck.warnSig;
          }
        }
        applyDomainExtractionToModal(extraction);
      });
    }
    const skipPreBtn = banner.querySelector('#indPrecheckSkipBtn');
    if (skipPreBtn) {
      skipPreBtn.addEventListener('click', async e => {
        e.stopPropagation();
        banner.remove();
        SCAN_STATE.pendingDomainPrecheck = null;
        await skipCurrentQueueSlip();
      });
    }
    const disBtn = banner.querySelector('#indPrecheckDiscardBtn');
    if (disBtn) {
      disBtn.addEventListener('click', () => {
        banner.remove();
        SCAN_STATE.pendingDomainPrecheck = null;
        const badge = $('indEntryScanStatusBadge');
        if (badge) {
          badge.innerHTML = '<span>Scan discarded during pre-check; form fields unchanged.</span>';
          if (typeof window !== 'undefined' && window.MFG_I18N && window.MFG_I18N.getLang && window.MFG_I18N.getLang() !== 'en' && window.MFG_I18N.translateDom) {
            window.MFG_I18N.translateDom(badge);
          }
        }
      });
    }
    if (typeof window !== 'undefined' && window.MFG_I18N && window.MFG_I18N.getLang && window.MFG_I18N.getLang() !== 'en' && window.MFG_I18N.translateDom) {
      window.MFG_I18N.translateDom(banner);
    }
    return banner;
  }

  // ==================== 6-VERTICAL CLASSIFIER & MULTI-SLIP (1 OF N) STEPPER QUEUE ====================
  function hasActiveSlipQueue() {
    return Boolean(
      SCAN_STATE.slipQueue
      && SCAN_STATE.slipQueue.mode === 'queue'
      && Array.isArray(SCAN_STATE.slipQueue.items)
      && SCAN_STATE.slipQueue.items.length > 0
    );
  }

  function getActiveQueueItem() {
    if (!hasActiveSlipQueue()) return null;
    const q = SCAN_STATE.slipQueue;
    return q.items[q.currentIndex] || q.items[0] || null;
  }

  function hasStrongDomainRegisterSignals(rawText, domFormKey) {
    const txt = normalizeDigits(String(rawText || '')).replace(/\r/g, '');
    if (!txt.trim() || !domFormKey) return false;
    if (/\b(?:WTC|BBConstruction|Lions\s*Transport)\b/i.test(txt)) return false;
    if (/^\s*Entry\s*Type\s*:\s*External\s*Treasury/im.test(txt) && !/From\s*(?:Sister\s*)?Entity\s*:/i.test(txt)) return false;
    if (/^\s*Vendor\s*:/im.test(txt) && /SUPPLIER\s+DELIVERY\s*&\s*TAX\s*BILL/i.test(txt)) return false;
    const mapRx = {
      ins_policies: /(?:policy\s*(?:no|#|schedule)|policyholder|insured|gross\s*(?:written\s*)?premium|\bgwp\b|sum\s*insured|endorsement)/i,
      ins_billing: /(?:instalment|collection\s*receipt|billing\s*allocation|unallocated|open\s*ar|prm-\d+|col-\d+)/i,
      ins_claims: /(?:loss\s*adjuster|claim\s*(?:no|#)|cause\s*of\s*loss|peril|claimed\s*amount|deductible|adjuster\s*approved|clm-)/i,
      ins_agreements: /(?:carrier\s*agreement|brokerage\s*agreement|commission\s*agreement|new\s*business\s*%|volume\s*bonus|agr-)/i,
      ins_remittances: /(?:carrier\s*remittance|bordereau\s*remittance|settled\s*to\s*carrier|balance\s*due\s*to\s*carrier|rem-)/i,
      re_leases: /(?:lease\s*agreement|commercial\s*lease|lse-|security\s*deposit|escalation\s*clause|lessee)/i,
      re_invoicing: /(?:commercial\s*lease\s*rent\s*tax\s*invoice|rent\s*tax\s*invoice|\brent\s*invoice\b|tax\s*sequence|billing\s*period|inv-4235|inv-prop)/i,
      re_receipts: /(?:rent\s*receipt|tenant\s*receipt|receipt\s*allocation|rct-4235|rct-prop)/i,
      re_sales: /(?:unit\s*sale|contract\s*value|buyer\s*:|purchaser\s*:)/i,
      re_workorders: /(?:work\s*order|contractor\s*:|maintenance\s*budget|actual\s*cost|rechargeable|wo-\d+)/i,
      trd_purchases: /(?:bill\s*of\s*lading|ocean\s*b\/?l|import\s*file|customs\s*duty|port\s*clearance|incoterm|foreign\s*oem|imp-trd|imp-sh)/i,
      trd_receipts: /(?:trade\s*receipt|allocated\s*to\s*open\s*invoices|rct-trd)/i,
      trd_trucks: /(?:truck\s*stock\s*intake|unit\s*intake|vehicle\s*inventory|warehouse\s*bay|showroom\s*list\s*price|engine\s*serial)/i,
      trd_stock: /(?:spare\s*parts\s*inventory|parts\s*sku|part\s*code|reorder\s*point|wac\s*unit\s*cost|on-hand\s*qty)/i,
      trd_targets: /(?:monthly\s*sales\s*target|target\s*ttc|fob\s*\/\s*unit|landed\s*%)/i,
      trd_sales: /(?:commercial\s*vehicle\s*invoice|spare\s*parts\s*tax\s*invoice|inv-trd|showroom|sold\s*to)/i,
      hsp_tariffs: /(?:seasonal\s*tariff|rack\s*rate|seasonal\s*rate|nightly\s*rate)/i,
      hsp_pos: /(?:pos\s*z-?close|pos\s*shift|cashier\s*:|bills\s*count|card\s*settlement|register\s*variance|pos-cl)/i,
      hsp_memberships: /(?:seasonal\s*membership|member\s*name|cabana|chalet\s*number|mem-2026)/i,
      hsp_stock: /(?:f&b\s*stock|beverage\s*inventory|bar\s*store|opening\s*qty|closing\s*qty)/i,
      hsp_energy: /(?:generator\s*&\s*solar|diesel\s*tank|operating\s*hours|solar\s*yield|rated\s*capacity)/i,
      hsp_revenue: /(?:daily\s*venue\s*revenue|venue\s*\/\s*outlet|guest\s*covers|rev-hsp)/i,
      hld_interactions: /(?:from\s*(?:sister\s*)?entity|to\s*(?:sister\s*)?entity|intercompany|sister\s*wire|ic-hld|ic-2026)/i,
      hld_loans: /(?:lender\s*:|borrowing\s*facility|loan\s*facility|interest\s*rate|apr\s*:|ln-hld)/i,
      hld_partners: /(?:partner\s*draw|equity\s*share|capital\s*call|distribution\s*pool|dividend\s*entitlement)/i,
      hld_extended: /(?:extended\s*register|direction\s*:\s*(?:receivable|payable))/i
    };
    const rx = mapRx[domFormKey];
    return rx ? rx.test(txt) : false;
  }

  function buildPdfPageSlipFile(baseName, pageNum, totalPages, pageText, captureMethod) {
    const stem = String(baseName || 'Batch').replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9_.-]+/g, '_');
    const safeLines = String(pageText || '').split('\n').slice(0, 14).map((ln, idx) =>
      `<text x="24" y="${90 + idx * 20}" font-family="monospace" font-size="13" fill="#281D15">${esc(sanitizeOutwardText(ln.slice(0, 82)))}</text>`
    ).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="680" height="400"><rect width="100%" height="100%" fill="#FAF9F6"/><rect x="12" y="12" width="656" height="44" rx="6" fill="#EFECE6"/><text x="24" y="40" font-family="system-ui, sans-serif" font-size="15" font-weight="bold" fill="#281D15">${esc(sanitizeOutwardText(`${stem} · Slip ${pageNum} of ${totalPages}`))}</text>${safeLines}</svg>`;
    const fileName = `${stem}_Slip_${pageNum}.svg`;
    let fileObj = null;
    if (typeof File !== 'undefined' && typeof Blob !== 'undefined') {
      fileObj = new File([new Blob([svg], { type: 'image/svg+xml' })], fileName, { type: 'image/svg+xml' });
      fileObj._extractedText = String(pageText || '');
      fileObj._fromSmartScan = true;
      fileObj._captureMethod = captureMethod;
    }
    const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    const attObj = {
      id: 'att-ss-slip-' + Date.now() + '-' + pageNum,
      file_name: fileName,
      mime_type: 'image/svg+xml',
      file_size: svg.length,
      capture_method: captureMethod,
      data_url: dataUrl,
      _fromSmartScan: true
    };
    return { fileObj, attObj };
  }

  async function extractSlipUnitsFromInput(rawItems, captureMethod, isCurrentFn) {
    const units = [];
    for (let i = 0; i < rawItems.length; i++) {
      if (isCurrentFn && !isCurrentFn()) return { units: [], aborted: true, truncatedCount: 0 };
      const pair = await normalizeSingleScanItem(rawItems[i], captureMethod, i);
      if (isCurrentFn && !isCurrentFn()) return { units: [], aborted: true, truncatedCount: 0 };
      if (!pair.attObj) continue;
      const fName = pair.attObj.file_name || `Slip_${i + 1}`;
      if (pair.fileObj && typeof pair.fileObj._extractedText === 'string') {
        units.push({
          rawInput: rawItems[i],
          fileObj: pair.fileObj,
          attObj: pair.attObj,
          origPair: pair,
          fileName: fName,
          origFileName: fName,
          isPdfPage: false,
          pageNum: 1,
          text: pair.fileObj._extractedText
        });
        continue;
      }
      const isPdfPair = /\.pdf$/i.test(fName) || /application\/pdf/i.test(pair.attObj.mime_type || '');
      if (isPdfPair && pair.fileObj) {
        const ab = await pair.fileObj.arrayBuffer();
        if (isCurrentFn && !isCurrentFn()) return { units: [], aborted: true, truncatedCount: 0 };
        const pdfPages = await extractPdfPagesTextClient(ab);
        if (isCurrentFn && !isCurrentFn()) return { units: [], aborted: true, truncatedCount: 0 };
        if (pdfPages.length > 1) {
          pdfPages.forEach((pt, pIdx) => {
            const built = buildPdfPageSlipFile(fName, pIdx + 1, pdfPages.length, pt, captureMethod);
            units.push({
              rawInput: built.fileObj || rawItems[i],
              fileObj: built.fileObj || pair.fileObj,
              attObj: built.attObj,
              origPair: pair,
              fileName: built.attObj.file_name,
              origFileName: fName,
              isPdfPage: true,
              pageNum: pIdx + 1,
              totalPdfPages: pdfPages.length,
              text: String(pt || '')
            });
          });
          continue;
        }
      }
      const isTextBearing = /\.(svg|pdf|txt|csv|tsv|json|xml|docx|xlsx)$/i.test(fName) ||
        /svg|pdf|text|json|xml|word|sheet/i.test(pair.attObj.mime_type || '');
      const pageTxt = (!isHeadlessEnv() || isTextBearing || window.__MFG_TEST_LIVE_AI)
        ? await extractAnyDocumentText(pair.fileObj, pair.attObj, () => {})
        : '';
      if (isCurrentFn && !isCurrentFn()) return { units: [], aborted: true, truncatedCount: 0 };
      units.push({
        rawInput: rawItems[i],
        fileObj: pair.fileObj,
        attObj: pair.attObj,
        origPair: pair,
        fileName: fName,
        origFileName: fName,
        isPdfPage: false,
        pageNum: 1,
        text: String(pageTxt || '')
      });
    }
    let truncatedCount = 0;
    if (units.length > MAX_SLIP_QUEUE) {
      truncatedCount = units.length - MAX_SLIP_QUEUE;
      units.length = MAX_SLIP_QUEUE;
    }
    return { units, aborted: false, truncatedCount };
  }

  function shouldDefaultToSlipQueue(units) {
    if (!Array.isArray(units) || units.length < 2) return false;
    const readableUnits = units.filter(u => String((u && u.text) || '').trim().length >= 10);
    if (readableUnits.length < 2) return false;
    const hasContinuationFilename = units.some(u => {
      const nm = String((u && (u.origFileName || u.fileName)) || '');
      return /(?:^|[_.\s-])(?:p|pg|page)[_-]?\d{1,2}(?:[_.\s-]|\.[a-z0-9]+$|$)/i.test(nm)
        || /\b(?:front|back|recto|verso|face|dos)\b/i.test(nm);
    });
    if (hasContinuationFilename) return false;
    const joinedText = units.map(u => String((u && u.text) || '')).join('\n');
    if (/(?:PAGE\s+\d+\s+OF\s+\d+|CONTINUED\s+ON\s+PAGE|CARRIED\s+FORWARD|BROUGHT\s+FORWARD)/i.test(joinedText)) {
      return false;
    }
    if (units.length === 2 && /\b(?:IDENTITY\s*CARD|NATIONAL\s*ID|RESIDENCY|WORK\s*PERMIT|NSSF\s*CARD|CARTE\s*D'IDENTIT)/i.test(joinedText)) {
      return false;
    }
    const hasBlUnit = units.some(u => /(?:BILL\s*OF\s*LADING|OCEAN\s*B\/?L)/i.test(u.text || ''));
    const hasCustomsUnit = units.some(u => /(?:CUSTOMS\s*DUTY|PORT\s*(?:&|AND)?\s*CLEARANCE)/i.test(u.text || ''));
    if (hasBlUnit && hasCustomsUnit && units.length <= 3) {
      return false;
    }
    return true;
  }

  function inferSlipRoutingTarget(detParsed, detDom, combinedText) {
    const txt = String(combinedText || '');
    const explicitShared = Boolean(
      detParsed
      && (
        detParsed.formType === 'external'
        || ((detParsed.formType === 'salary' || detParsed.formType === 'conversion' || detParsed.formType === 'settlement') && !(detDom && detDom.formKey && hasStrongDomainRegisterSignals(txt, detDom.formKey)))
        || (detParsed.formType === 'expense' && !(detDom && detDom.formKey && hasStrongDomainRegisterSignals(txt, detDom.formKey)))
        || (detParsed.formType === 'equipment' && !(detDom && ['trd_sales', 'trd_trucks', 'trd_purchases'].includes(detDom.formKey) && /showroom|fob|list\s*price|stock\s*intake|bill\s*of\s*lading|sold\s*to|customer:/i.test(txt)))
      )
    );
    if (detDom && detDom.formKey && !explicitShared && hasStrongDomainRegisterSignals(txt, detDom.formKey)) {
      const domSpec = (D && typeof D.resolveDomainFormSpec === 'function') ? D.resolveDomainFormSpec(detDom.formKey) : null;
      return {
        kind: 'domain',
        formKey: detDom.formKey,
        ind: (domSpec && domSpec.ind) || ''
      };
    }
    const mfgCoRx = /\b(?:WTC|BBConstruction|Lions\s*Transport)\b/i;
    if (detParsed && detParsed.formType && !explicitShared && !mfgCoRx.test(txt)) {
      if (detDom && detDom.formKey) {
        const domSpec = (D && typeof D.resolveDomainFormSpec === 'function') ? D.resolveDomainFormSpec(detDom.formKey) : null;
        return { kind: 'domain', formKey: detDom.formKey, ind: (domSpec && domSpec.ind) || '' };
      }
    }
    return {
      kind: 'shared',
      formKey: (detParsed && detParsed.formType) || 'expense'
    };
  }

  function syncMobAiStepPills() {
    const hasQ = hasActiveSlipQueue();
    const q = SCAN_STATE.slipQueue;
    let txt = '';
    if (hasQ) {
      if (q.summaryOpen) {
        const postedCnt = q.items.filter(it => it && it.status === 'posted').length;
        txt = `${postedCnt} / ${q.total}`;
      } else {
        txt = `${q.currentIndex + 1} / ${q.total}`;
      }
    }
    ['entryMobAiStepPill', 'indMobAiStepPill'].forEach(pid => {
      const el = $(pid);
      if (!el) return;
      if (hasQ) {
        el.textContent = txt;
        el.hidden = false;
      } else {
        el.textContent = '';
        el.hidden = true;
      }
    });
  }

  const NON_MONEY_QUEUE_KEYS = new Set([
    'customers', 'suppliers', 'sites', 'regions', 'products', 'items', 'categories',
    'fx_rates', 'vat_rates', 'equipment', 'drivers', 'staff_members', 'roles',
    'price_rules', 'raw_pricing', 'overtime_rates', 'work_shifts', 'employments',
    'staff_assignments', 'documents', 'hsp_tariffs', 'trd_targets', 'ins_agreements',
    'ins_catalogue', 'hld_partners', 'trd_trucks', 'trd_stock', 'hsp_stock', 'hsp_energy'
  ]);

  function formatBatchUsd(num) {
    const n = Math.round((Number(num) || 0) * 100) / 100;
    const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n < 0 ? '-$' + abs : '$' + abs;
  }

  function summarizeQueueTotals(q) {
    const items = (q && Array.isArray(q.items)) ? q.items : [];
    const postedItems = items.filter(it => it && it.status === 'posted');
    const skippedItems = items.filter(it => it && it.status === 'skipped');
    const moneyItems = postedItems.filter(it => Boolean(it.hasMoneyTotal));
    const anyRedacted = moneyItems.some(it => Boolean(it.usdRedacted));
    const showUsd = moneyItems.length > 0 && !anyRedacted;
    const totalUsd = Math.round(moneyItems.reduce((s, it) => s + (Number(it.postedUsd) || 0), 0) * 100) / 100;
    return {
      postedCnt: postedItems.length,
      skippedCnt: skippedItems.length,
      skippedItems,
      showUsd,
      totalUsd,
      totalUsdFmt: showUsd ? formatBatchUsd(totalUsd) : ''
    };
  }

  function renderQueueDoneSummaryHtml(q, isDomain) {
    if (!q) return '';
    const stats = summarizeQueueTotals(q);
    const wrapId = isDomain ? 'indSsQueueDoneSummary' : 'ssQueueDoneSummary';
    const reopenFirstId = isDomain ? 'indSsQueueReopenFirstBtn' : 'ssQueueReopenFirstBtn';
    const dismissId = isDomain ? 'indSsQueueFinishDismissBtn' : 'ssQueueFinishDismissBtn';
    const firstSk = stats.skippedItems[0];
    const reopenChips = stats.skippedItems.map(sk => `
      <button type="button" class="ss-alt-form-chip ss-reopen-chip" data-ss-reopen-idx="${sk.idx}">
        ${ic('rotate')} <span>Reopen</span> <b data-no-i18n="1">#${sk.idx + 1} · ${esc(sk.fileName)}</b>
      </button>
    `).join('');
    return `
      <div class="ss-queue-bar ss-queue-done-summary" id="${wrapId}" role="region" aria-label="Batch Queue Summary">
        <div class="ss-queue-hdr">
          <div class="ss-queue-title">
            <span class="ss-stat-pill is-form">${ic('check_circle')} <span>Batch Summary</span></span>
            <span class="ss-stat-pill is-ok"><b data-no-i18n="1">${stats.postedCnt}</b> <span>posted</span></span>
            <span class="ss-stat-pill is-warn"><b data-no-i18n="1">${stats.skippedCnt}</b> <span>skipped</span></span>
            ${stats.showUsd ? `<span class="ss-stat-pill is-ok"><b data-no-i18n="1">${esc(stats.totalUsdFmt)}</b> <span>entered</span></span>` : ''}
          </div>
          <div class="ss-queue-actions">
            ${firstSk ? `<button type="button" class="btn btn-primary btn-sm" id="${reopenFirstId}" data-ss-reopen-idx="${firstSk.idx}"><span>Reopen First Skipped</span></button>` : ''}
            <button type="button" class="btn btn-outline-bar btn-sm" id="${dismissId}" data-ss-q-act="finish-dismiss"><span>Finish &amp; Dismiss</span></button>
          </div>
        </div>
        <div class="ss-queue-pills" role="group" aria-label="Skipped slips">
          ${reopenChips}
        </div>
      </div>
    `;
  }

  function resolveQueueItemDisplayLabel(it) {
    if (!it) return 'Slip';
    if (it.kind === 'domain' && it.targetForm && D && typeof D.resolveDomainFormSpec === 'function') {
      const sp = D.resolveDomainFormSpec(it.targetForm);
      if (sp && sp.spec && sp.spec.label) return sanitizeOutwardText(sp.spec.label);
    }
    if (it.targetForm) return buildFormDisplayLabel(it.targetForm);
    return sanitizeOutwardText(it.fileName || 'Slip');
  }

  function renderSlipQueueBarHtml() {
    if (!hasActiveSlipQueue()) return '';
    const q = SCAN_STATE.slipQueue;
    if (q.summaryOpen) return renderQueueDoneSummaryHtml(q, false);
    const cur = q.items[q.currentIndex] || q.items[0];
    const postedCnt = q.items.filter(it => it.status === 'posted').length;
    const skippedCnt = q.items.filter(it => it.status === 'skipped').length;
    const pillsHtml = q.items.map((it, idx) => {
      const isActive = idx === q.currentIndex;
      const cls = [
        'ss-queue-pill',
        isActive ? 'is-active' : '',
        it.status === 'posted' ? 'is-posted' : (it.status === 'skipped' ? 'is-skipped' : (it.status === 'ready' ? 'is-ready' : (it.status === 'extracting' ? 'is-extracting' : 'is-pending')))
      ].filter(Boolean).join(' ');
      const stateIcon = it.status === 'posted' ? '✓' : (it.status === 'skipped' ? '-' : (it.status === 'extracting' ? '...' : ''));
      const ariaLbl = `Slip ${idx + 1} of ${q.total} (${it.status})`;
      const disAttr = it.status === 'posted' ? ' disabled' : '';
      return `<button type="button" class="${cls}" data-ss-queue-idx="${idx}" aria-label="${esc(ariaLbl)}" aria-current="${isActive ? 'step' : 'false'}"${disAttr}><span data-no-i18n="1">${idx + 1}${stateIcon ? ' ' + stateIcon : ''}</span></button>`;
    }).join('');
    const curFormLbl = resolveQueueItemDisplayLabel(cur);
    const curCo = cur && cur.targetCompany ? cur.targetCompany : '';
    const bgCnt = q.items.filter((it, idx) => idx !== q.currentIndex && (it.status === 'pending' || it.status === 'extracting')).length;
    const mergeDisabled = postedCnt > 0;
    return `
      <div class="ss-queue-bar" id="ssSlipQueueBar" role="region" aria-label="Multi-Slip Batch Queue">
        <div class="ss-queue-hdr">
          <div class="ss-queue-title">
            <span class="ss-stat-pill is-form">${ic('layers')} <span>Slip</span> <b data-no-i18n="1">${q.currentIndex + 1}</b> <span>of</span> <b data-no-i18n="1">${q.total}</b></span>
            <span class="ss-queue-target" data-no-i18n="1">${esc([cur.fileName, curFormLbl, curCo].filter(Boolean).join(' · '))}</span>
            ${postedCnt > 0 ? `<span class="ss-stat-pill is-ok"><b data-no-i18n="1">${postedCnt}</b> <span>posted</span></span>` : ''}
            ${skippedCnt > 0 ? `<span class="ss-stat-pill is-warn"><b data-no-i18n="1">${skippedCnt}</b> <span>skipped</span></span>` : ''}
            ${bgCnt > 0 ? `<span class="ss-queue-bg-note"><span>Pre-reading</span> <b data-no-i18n="1">${bgCnt}</b></span>` : ''}
          </div>
          <div class="ss-queue-actions">
            <button type="button" class="ss-alt-form-chip" data-ss-q-act="prev" ${q.currentIndex <= 0 ? 'disabled' : ''}><span>Prev</span></button>
            <button type="button" class="ss-alt-form-chip" data-ss-q-act="next" ${q.currentIndex >= q.total - 1 ? 'disabled' : ''}><span>Next</span></button>
            <button type="button" class="ss-alt-form-chip" data-ss-q-act="skip"><span>Skip Slip</span></button>
            ${!mergeDisabled ? `<button type="button" class="ss-alt-form-chip" id="ssMergeQueueToBundleBtn" data-ss-q-act="merge">${ic('layers')} <span>Merge as 1 Document</span></button>` : ''}
            <button type="button" class="ss-alt-form-chip" data-ss-q-act="dismiss"><span>Clear Batch</span></button>
          </div>
        </div>
        <div class="ss-queue-pills" role="tablist" aria-label="Queued slips">
          ${pillsHtml}
        </div>
      </div>
    `;
  }

  function wireSlipQueueEvents(rootEl) {
    if (!rootEl) return;
    rootEl.querySelectorAll('[data-ss-queue-idx]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        if (SCAN_STATE.activatingSlip || SCAN_STATE.advancingQueueOnPost) return;
        const idx = Number(btn.getAttribute('data-ss-queue-idx'));
        if (!Number.isNaN(idx)) await activateQueueSlip(idx);
      });
    });
    rootEl.querySelectorAll('[data-ss-reopen-idx]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        if (!hasActiveSlipQueue() || SCAN_STATE.activatingSlip || SCAN_STATE.advancingQueueOnPost) return;
        const q = SCAN_STATE.slipQueue;
        const idx = Number(btn.getAttribute('data-ss-reopen-idx'));
        if (Number.isNaN(idx) || !q.items[idx]) return;
        const wasSummary = Boolean(q.summaryOpen);
        const it = q.items[idx];
        const prevStatus = it.status;
        q.summaryOpen = false;
        if (it.status === 'skipped') {
          it.status = (it.scanBundle || it.domExt) ? 'ready' : 'pending';
        }
        const res = await activateQueueSlip(idx, { fromPostAdvance: false, fromSummaryReopen: true });
        if (!res && SCAN_STATE.slipQueue && SCAN_STATE.slipQueue.id === q.id && wasSummary) {
          it.status = prevStatus;
          q.summaryOpen = true;
          refreshQueueBarsOnly();
        }
      });
    });
    rootEl.querySelectorAll('[data-ss-q-act]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const act = btn.getAttribute('data-ss-q-act');
        if (act === 'prev' && hasActiveSlipQueue()) {
          if (SCAN_STATE.activatingSlip || SCAN_STATE.advancingQueueOnPost) return;
          const nextIdx = Math.max(0, SCAN_STATE.slipQueue.currentIndex - 1);
          await activateQueueSlip(nextIdx);
        } else if (act === 'next' && hasActiveSlipQueue()) {
          if (SCAN_STATE.activatingSlip || SCAN_STATE.advancingQueueOnPost) return;
          const nextIdx = Math.min(SCAN_STATE.slipQueue.total - 1, SCAN_STATE.slipQueue.currentIndex + 1);
          await activateQueueSlip(nextIdx);
        } else if (act === 'skip') {
          if (SCAN_STATE.activatingSlip || SCAN_STATE.advancingQueueOnPost) return;
          await skipCurrentQueueSlip();
        } else if (act === 'merge') {
          await mergeQueueToBundle();
        } else if (act === 'dismiss') {
          clearSlipQueue({ refreshUi: true });
        } else if (act === 'finish-dismiss') {
          const q = SCAN_STATE.slipQueue;
          const stats = summarizeQueueTotals(q);
          clearSlipQueue({ refreshUi: false });
          if ($('entryModal') && !$('entryModal').hidden && typeof D.closeEntryModal === 'function') D.closeEntryModal(true);
          if ($('indDomainEntryModal') && !$('indDomainEntryModal').hidden && typeof D.closeIndustryDomainEntryModal === 'function') D.closeIndustryDomainEntryModal(true);
          if (D && D.toast) {
            D.toast(stats.showUsd
              ? `Batch queue closed: ${stats.postedCnt} posted, ${stats.skippedCnt} skipped · ${stats.totalUsdFmt} entered.`
              : `Batch queue closed: ${stats.postedCnt} posted, ${stats.skippedCnt} skipped.`, 'ok');
          }
        }
      });
    });
    const splitBtn = rootEl.querySelector('#ssSplitToSlipQueueBtn, #indSsSplitToSlipQueueBtn');
    if (splitBtn) {
      splitBtn.addEventListener('click', async e => {
        e.stopPropagation();
        await splitLastBundleToQueue();
      });
    }
  }

  function mountOnDomainModal() {
    const modal = $('indDomainEntryModal');
    const bar = $('indEntrySmartScanBar');
    if (!modal || modal.hidden || !bar) {
      syncMobAiStepPills();
      return;
    }
    const existingQ = bar.querySelector('.ss-queue-bar');
    if (existingQ) existingQ.remove();
    const existingSplit = bar.querySelector('#indSsSplitToSlipQueueBtn');
    if (existingSplit) existingSplit.remove();

    if (hasActiveSlipQueue()) {
      const q = SCAN_STATE.slipQueue;
      modal.classList.add('mob-ai-scan-open');
      modal.classList.remove('mob-ai-voice-open');
      const wrap = document.createElement('div');
      wrap.innerHTML = q.summaryOpen
        ? renderQueueDoneSummaryHtml(q, true)
        : renderSlipQueueBarHtml().replace('id="ssSlipQueueBar"', 'id="indSsSlipQueueBar"').replace('id="ssMergeQueueToBundleBtn"', 'id="indSsMergeQueueToBundleBtn"');
      const qEl = wrap.firstElementChild;
      if (qEl) {
        qEl.style.flexBasis = '100%';
        qEl.style.width = '100%';
        bar.appendChild(qEl);
        wireSlipQueueEvents(qEl);
        if (typeof window !== 'undefined' && window.MFG_I18N && window.MFG_I18N.getLang && window.MFG_I18N.getLang() !== 'en' && window.MFG_I18N.translateDom) {
          window.MFG_I18N.translateDom(qEl);
        }
      }
    } else if (SCAN_STATE.lastMultiUnits && Array.isArray(SCAN_STATE.lastMultiUnits.units) && SCAN_STATE.lastMultiUnits.units.length >= 2 && shouldSplitActionBeOffered(SCAN_STATE.lastMultiUnits.units)) {
      const sBtn = document.createElement('button');
      sBtn.type = 'button';
      sBtn.className = 'ss-alt-form-chip';
      sBtn.id = 'indSsSplitToSlipQueueBtn';
      sBtn.innerHTML = `${ic('layers')} <span>Split into Slips</span> <b data-no-i18n="1">(${SCAN_STATE.lastMultiUnits.units.length})</b>`;
      bar.appendChild(sBtn);
      wireSlipQueueEvents(bar);
      if (typeof window !== 'undefined' && window.MFG_I18N && window.MFG_I18N.getLang && window.MFG_I18N.getLang() !== 'en' && window.MFG_I18N.translateDom) {
        window.MFG_I18N.translateDom(sBtn);
      }
    }
    syncMobAiStepPills();
  }

  function shouldSplitActionBeOffered(units) {
    if (!Array.isArray(units) || units.length < 2) return false;
    const readable = units.filter(u => String((u && u.text) || '').trim().length >= 10);
    if (readable.length >= 2) return true;
    const imageUnits = units.filter(u => u && u.attObj && /^image\/(?:jpeg|png|webp)/i.test(u.attObj.mime_type || ''));
    return imageUnits.length >= 2;
  }

  function refreshQueueBarsOnly() {
    if (!hasActiveSlipQueue()) {
      syncMobAiStepPills();
      return;
    }
    const entryModal = $('entryModal');
    if (entryModal && !entryModal.hidden) {
      const existing = $('ssSlipQueueBar') || $('ssQueueDoneSummary');
      if (existing) {
        const tmp = document.createElement('div');
        tmp.innerHTML = renderSlipQueueBarHtml();
        const nextEl = tmp.firstElementChild;
        if (nextEl) {
          existing.replaceWith(nextEl);
          wireSlipQueueEvents(nextEl);
          if (typeof window !== 'undefined' && window.MFG_I18N && window.MFG_I18N.getLang && window.MFG_I18N.getLang() !== 'en' && window.MFG_I18N.translateDom) {
            window.MFG_I18N.translateDom(nextEl);
          }
        }
      } else {
        renderSmartScanBarDom();
      }
    }
    const domModal = $('indDomainEntryModal');
    if (domModal && !domModal.hidden) {
      mountOnDomainModal();
    }
    syncMobAiStepPills();
  }

  function captureActiveSlipDraftValues(item) {
    if (!item || item.status === 'posted') return;
    const domModal = $('indDomainEntryModal');
    const entryModal = $('entryModal');
    const container = (domModal && !domModal.hidden)
      ? $('indEntryModalBody')
      : ((entryModal && !entryModal.hidden) ? $('modalBody') : null);
    if (!container) return;
    const drafts = {};
    container.querySelectorAll('input[id], select[id], textarea[id]').forEach(el => {
      if (!el.id || el.type === 'file') return;
      if (!/^(?:f_|ide_)/.test(el.id)) return;
      drafts[el.id] = el.type === 'checkbox' ? Boolean(el.checked) : el.value;
    });
    if (Object.keys(drafts).length) item.draftValues = drafts;
    if (domModal && !domModal.hidden && typeof domModal._getPendingDomainFiles === 'function') {
      item.manualDomainFiles = (domModal._getPendingDomainFiles() || []).filter(f => f && !f._fromSmartScan);
    } else if (entryModal && !entryModal.hidden && typeof D.getFormUi === 'function') {
      const fui = D.getFormUi();
      if (fui) {
        item.manualEntryAttachments = Array.isArray(fui.attachments)
          ? fui.attachments.filter(a => a && !a._fromSmartScan).map(a => Object.assign({}, a))
          : [];
        item.draftExpItems = Array.isArray(fui.expItems)
          ? fui.expItems.map(r => Object.assign({}, r))
          : null;
        item.draftRepairItems = Array.isArray(fui.repairItems)
          ? fui.repairItems.map(r => Object.assign({}, r))
          : null;
      }
    }
  }

  function restoreSlipDraftValues(item) {
    if (!item || (!item.draftValues && !item.draftExpItems && !item.draftRepairItems)) return;
    if (typeof D.getFormUi === 'function') {
      const fui = D.getFormUi();
      if (fui && Array.isArray(item.draftExpItems)) {
        fui.expItems = item.draftExpItems.map(r => Object.assign({}, r));
        if (D.renderExpenseItemsBuilderRows) D.renderExpenseItemsBuilderRows();
      }
      if (fui && Array.isArray(item.draftRepairItems)) {
        fui.repairItems = item.draftRepairItems.map(r => Object.assign({}, r));
        if (D.renderRepairItemsBuilderRows) D.renderRepairItemsBuilderRows();
      }
    }
    Object.entries(item.draftValues || {}).forEach(([id, val]) => {
      const el = $(id);
      if (!el || el.disabled || el.readOnly) return;
      if (el.type === 'checkbox') {
        const nextChk = Boolean(val);
        if (el.checked === nextChk) return;
        el.checked = nextChk;
      } else {
        const nextStr = String(val == null ? '' : val);
        if (String(el.value ?? '') === nextStr) return;
        el.value = nextStr;
      }
      if (el.type !== 'hidden') {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    if (typeof D.recalcForm === 'function') {
      try { D.recalcForm(); } catch (_) {}
    }
  }

  async function extractQueueItem(item, queueId) {
    if (!item || !item.unit) return item;
    if (item.status === 'ready' && (item.scanBundle || item.domExt)) return item;
    item.status = 'extracting';
    const unit = item.unit;
    const captureMethod = item.captureMethod || 'AI Smart Scan';
    const pageEntries = [{ pageNum: 1, fileName: unit.fileName, text: unit.text || '' }];
    const combinedText = String(unit.text || '');

    try {
      const detParsed = synthesizeMultiPageDeterministic(pageEntries, combinedText, unit.fileName);
      const prelimScope = collectRegistryCandidates(detParsed.company);
      const detDom = deterministicParseDomainBundle(pageEntries, combinedText, null, unit.fileName);

      const isBuiltInSample = captureMethod === 'Sample Smart Scan' && !window.__MFG_TEST_LIVE_AI;
      let aiResult = null;
      if (!isBuiltInSample && (!isHeadlessEnv() || window.__MFG_TEST_LIVE_AI)) {
        aiResult = await tryLocalServerVisionScan({
          fileName: unit.fileName,
          mimeType: (unit.attObj && unit.attObj.mime_type) || '',
          dataUrl: (unit.attObj && unit.attObj.data_url) || '',
          extractedText: combinedText.slice(0, 8000),
          pageCount: 1,
          companies: prelimScope.companies.slice(0, 16)
        });
        if (!SCAN_STATE.slipQueue || SCAN_STATE.slipQueue.id !== queueId) return item;
        if (!aiResult) {
          aiResult = await tryCloudAiStructuredParse(combinedText, prelimScope, unit.attObj, 1);
          if (!SCAN_STATE.slipQueue || SCAN_STATE.slipQueue.id !== queueId) return item;
        }
      }

      const mergedParsed = mergeParsedResults(detParsed, aiResult && aiResult.parsed);
      mergedParsed.pageCount = 1;
      mergedParsed.multiPageSynthesized = false;
      const matched = groundExtractedEntities(mergedParsed, combinedText);
      const routing = inferSlipRoutingTarget(mergedParsed, detDom, combinedText);

      const carried = collectCarriedPrecheckFlags([unit.rawInput]);
      Object.assign(carried.overrides || {}, item.precheckOverrides || {});

      if (routing.kind === 'domain' && detDom && detDom.formKey) {
        const safeCo = resolveRlsSafeDomainCompany(detDom.company || matched.targetCompany || mergedParsed.company, routing.ind);
        const domExt = {
          ind: routing.ind,
          formKey: detDom.formKey,
          company: safeCo,
          label: unit.fileName,
          fileName: unit.fileName,
          rawFiles: unit.fileObj ? [unit.fileObj] : [],
          attObjs: unit.attObj ? [Object.assign({}, unit.attObj, { _fromSmartScan: true })] : [],
          captureMethod,
          vinAudit: detDom.vinAudit || null,
          pageCount: 1,
          fields: Object.assign({}, detDom.fields || {})
        };
        if (item.precheckOverrides) {
          Object.entries(item.precheckOverrides).forEach(([k, v]) => {
            if (v && k in domExt.fields) domExt.fields[k] = v;
          });
        }
        const pre = captureMethod !== 'Sample Smart Scan' || Boolean(window.__MFG_FORCE_SAMPLE_PRECHECK)
          ? evaluateDomainScanPrecheck(domExt)
          : { hasWarning: false, warnSig: '' };
        item.kind = 'domain';
        item.targetForm = domExt.formKey;
        item.targetInd = routing.ind;
        item.targetCompany = safeCo;
        item.domExt = domExt;
        item.scanBundle = null;
        item.precheck = pre;
        item.status = 'ready';
      } else {
        const scanBundle = {
          attObj: unit.attObj ? Object.assign({}, unit.attObj, { _fromSmartScan: true }) : null,
          attObjs: unit.attObj ? [Object.assign({}, unit.attObj, { _fromSmartScan: true })] : [],
          _rawFiles: unit.fileObj ? [unit.fileObj] : [],
          _singleQueueUnit: true,
          stitchedDataUrl: '',
          activePageIdx: 0,
          extractedText: combinedText.trim(),
          parsed: mergedParsed,
          matched,
          engineLabel: (aiResult && aiResult.engine) || 'ISABI Smart Parser + Frequency Grounding',
          appliedForm: mergedParsed.formType,
          filledFields: [],
          warnFields: []
        };
        Object.entries(carried.overrides || {}).forEach(([okKey, okVal]) => {
          applyPrecheckOverrideToBundle(scanBundle, okKey, okVal);
        });
        const pre = captureMethod !== 'Sample Smart Scan' || Boolean(window.__MFG_FORCE_SAMPLE_PRECHECK)
          ? evaluateScanPrecheck(scanBundle)
          : { hasWarning: false, warnSig: '' };
        item.kind = 'shared';
        item.targetForm = mergedParsed.formType || 'expense';
        item.targetCompany = matched.targetCompany || mergedParsed.company || '';
        item.scanBundle = scanBundle;
        item.domExt = null;
        item.precheck = pre;
        item.status = 'ready';
      }
    } catch (err) {
      item.status = 'error';
      item.errorMsg = sanitizeOutwardText((err && err.message) || 'Extraction failed');
    }
    return item;
  }

  async function runBackgroundQueuePreExtraction(queue) {
    if (!queue || queue.bgRunning) return;
    queue.bgRunning = true;
    const qId = queue.id;
    try {
      for (let i = 1; i < queue.items.length; i++) {
        if (!SCAN_STATE.slipQueue || SCAN_STATE.slipQueue.id !== qId || SCAN_STATE.slipQueue.mode !== 'queue') break;
        const it = queue.items[i];
        if (!it || it.status === 'posted' || it.status === 'skipped' || it.status === 'ready') continue;
        await extractQueueItem(it, qId);
        if (!SCAN_STATE.slipQueue || SCAN_STATE.slipQueue.id !== qId || SCAN_STATE.slipQueue.mode !== 'queue') break;
        refreshQueueBarsOnly();
        await new Promise(r => setTimeout(r, 15));
      }
    } finally {
      queue.bgRunning = false;
    }
  }

  async function activateQueueSlip(idx, opts = {}) {
    if (!hasActiveSlipQueue()) return null;
    if (SCAN_STATE.activatingSlip && !(opts && opts.nestedFallback)) return null;
    SCAN_STATE.activatingSlip = true;
    try {
      return await activateQueueSlipBody(idx, opts);
    } finally {
      if (!(opts && opts.nestedFallback)) SCAN_STATE.activatingSlip = false;
    }
  }

  async function activateQueueSlipBody(idx, opts = {}) {
    if (!hasActiveSlipQueue()) return null;
    const q = SCAN_STATE.slipQueue;
    const targetIdx = Math.max(0, Math.min(q.total - 1, Number(idx || 0)));
    const prevIdx = q.currentIndex;
    const prevWasSummary = Boolean(q.summaryOpen);
    const item = q.items[targetIdx];
    if (!item) return null;
    if (item.status === 'posted') {
      if (D && D.toast) D.toast('Slip already posted in this batch.', 'ok');
      return null;
    }
    if (!opts.fromPostAdvance && !prevWasSummary && prevIdx !== targetIdx && q.items[prevIdx]) {
      captureActiveSlipDraftValues(q.items[prevIdx]);
    }
    const wasSkippedBeforeActivate = item.status === 'skipped';
    if (item.status === 'skipped' && !opts.fromPostAdvance) {
      item.status = (item.scanBundle || item.domExt) ? 'ready' : 'pending';
      q.summaryOpen = false;
    }

    if (item.status === 'pending' || item.status === 'extracting' || (!item.scanBundle && !item.domExt && item.status !== 'error')) {
      await extractQueueItem(item, q.id);
    }
    if (!SCAN_STATE.slipQueue || SCAN_STATE.slipQueue.id !== q.id) return null;

    const handleBlockedOrError = errMsg => {
      if (errMsg && D && D.toast) D.toast(errMsg, 'err');
      if (opts.fromPostAdvance) {
        item.status = 'skipped';
        const fbIdx = findNextUnpostedQueueIdx(q, targetIdx);
        if (fbIdx !== -1 && fbIdx !== targetIdx) {
          return activateQueueSlip(fbIdx, { fromPostAdvance: true, nestedFallback: true });
        }
        finishQueueAfterAllDecided(q, { closeOpenModals: true });
        return null;
      }
      if (wasSkippedBeforeActivate) item.status = 'skipped';
      if (prevWasSummary) q.summaryOpen = true;
      q.currentIndex = prevIdx;
      refreshQueueBarsOnly();
      return null;
    };

    if (item.status === 'error' || (!item.domExt && !item.scanBundle)) {
      return handleBlockedOrError(item.errorMsg || 'Could not extract this slip.');
    }

    const pre = item.precheck;
    const ackOk = Boolean(item.precheckAck && (!pre || !pre.warnSig || item.precheckAckSig === pre.warnSig));

    if (item.kind === 'domain' && item.domExt) {
      const domTargetInd = item.targetInd || item.domExt.ind;
      const domScopeOk = seatHasCompanyInIndustry(domTargetInd);
      const canDom = domScopeOk
        && (!D.canEnterDomainForm || D.canEnterDomainForm(item.domExt.formKey))
        && (!D.canManageSiblingChronoSchedule || D.canManageSiblingChronoSchedule(item.domExt.formKey));
      if (!canDom) {
        return handleBlockedOrError(
          !domScopeOk
            ? 'Your seat has no assigned companies in this industry'
            : (D.canManageSiblingChronoSchedule && !D.canManageSiblingChronoSchedule(item.domExt.formKey)
              ? 'Supervisor permission required to manage chronological rate schedules'
              : 'Your seat has no entry rights for this form')
        );
      }
      const prevWasEntry = Boolean($('entryModal') && !$('entryModal').hidden);
      SCAN_STATE.suppressResetOnModalSwitch = true;
      SCAN_STATE.suppressDomResetOnSwitch = true;
      let domOpened = false;
      try {
        if (prevWasEntry && typeof D.closeEntryModal === 'function') {
          D.closeEntryModal(true);
        }
        if (typeof D.openIndustryDomainEntryModal === 'function') {
          domOpened = D.openIndustryDomainEntryModal(item.domExt.formKey, {
            company: item.domExt.company,
            _pendingFiles: Array.isArray(item.manualDomainFiles) ? item.manualDomainFiles.slice() : []
          }) !== false;
        }
      } finally {
        SCAN_STATE.suppressResetOnModalSwitch = false;
        SCAN_STATE.suppressDomResetOnSwitch = false;
      }
      const domM = $('indDomainEntryModal');
      if (!domOpened || !domM || domM.hidden) {
        if (prevWasEntry && typeof D.openEntryModal === 'function') {
          SCAN_STATE.suppressResetOnModalSwitch = true;
          try { D.openEntryModal((D.STATE && D.STATE.modalForm) || 'expense', null, { forceSwitch: true }); } finally { SCAN_STATE.suppressResetOnModalSwitch = false; }
        }
        return handleBlockedOrError('');
      }
      q.currentIndex = targetIdx;
      domM.classList.add('mob-ai-scan-open');
      domM.classList.remove('mob-ai-voice-open');
      if (pre && pre.hasWarning && !ackOk) {
        renderIndPrecheckBanner(item.domExt, pre);
        mountOnDomainModal();
        return { heldPrecheck: true, item };
      }
      const oldBanner = $('indEntryPrecheckBanner');
      if (oldBanner) oldBanner.remove();
      const res = applyDomainExtractionToModal(item.domExt);
      if (item.draftValues && !opts.fromPostAdvance) restoreSlipDraftValues(item);
      mountOnDomainModal();
      return res;
    }

    // Shared Spine / Manufacturing modal (#entryModal)
    const sb = item.scanBundle;
    if (!sb) return handleBlockedOrError('Could not extract this slip.');
    if (pre && pre.hasWarning && !ackOk) {
      const preTarget = resolvePrecheckEntryTarget(sb);
      if (!preTarget.ok) {
        return handleBlockedOrError(preTarget.reason);
      }
      SCAN_STATE.suppressResetOnModalSwitch = true;
      SCAN_STATE.suppressDomResetOnSwitch = true;
      try {
        if ($('indDomainEntryModal') && !$('indDomainEntryModal').hidden && typeof D.closeIndustryDomainEntryModal === 'function') {
          D.closeIndustryDomainEntryModal(true);
        }
        if (preTarget.coSwitchKey && D.selectCompanyScope) {
          try { D.selectCompanyScope(preTarget.coSwitchKey); } catch (_) {}
        }
        if (typeof D.openEntryModal === 'function') {
          D.openEntryModal(preTarget.targetForm || 'expense', null, { forceSwitch: true });
        }
      } finally {
        SCAN_STATE.suppressResetOnModalSwitch = false;
        SCAN_STATE.suppressDomResetOnSwitch = false;
      }
      const entryM = $('entryModal');
      if (!entryM || entryM.hidden) {
        return handleBlockedOrError(preTarget.reason);
      }
      q.currentIndex = targetIdx;
      entryM.classList.add('mob-ai-scan-open');
      entryM.classList.remove('mob-ai-voice-open');
      const fuiHold = D.getFormUi ? D.getFormUi() : null;
      if (fuiHold) {
        fuiHold.attachments = Array.isArray(item.manualEntryAttachments)
          ? item.manualEntryAttachments.filter(a => a && !a._fromSmartScan).map(a => Object.assign({}, a))
          : [];
        if (D.renderEntryAttachmentsListUI) D.renderEntryAttachmentsListUI();
      }
      sb.precheck = pre;
      SCAN_STATE.pendingPrecheckBundle = sb;
      SCAN_STATE.lastScan = sb;
      renderSmartScanBarDom();
      return { heldPrecheck: true, item };
    }
    q.currentIndex = targetIdx;
    SCAN_STATE.pendingPrecheckBundle = null;
    await applyScanToModal(sb, null, {
      queueManualAttachments: Array.isArray(item.manualEntryAttachments) ? item.manualEntryAttachments : []
    });
    if (sb.blockedByRbac) {
      return handleBlockedOrError('');
    }
    if (!sb.routedDomainModal) {
      SCAN_STATE.suppressResetOnModalSwitch = true;
      SCAN_STATE.suppressDomResetOnSwitch = true;
      try {
        if ($('indDomainEntryModal') && !$('indDomainEntryModal').hidden && typeof D.closeIndustryDomainEntryModal === 'function') {
          D.closeIndustryDomainEntryModal(true);
        }
      } finally {
        SCAN_STATE.suppressResetOnModalSwitch = false;
        SCAN_STATE.suppressDomResetOnSwitch = false;
      }
    }
    if (item.draftValues && !opts.fromPostAdvance) restoreSlipDraftValues(item);
    renderSmartScanBarDom();
    return sb;
  }

  async function startSlipQueue(units, captureMethod = 'AI Smart Scan', sourceOrigin = 'entry', truncatedCount = 0) {
    if (!D || !Array.isArray(units) || !units.length) return null;
    if (sourceOrigin === 'entry' && D.canEnterForm && !['expense', 'document', 'external', 'sales', 'receipt', 'vatinvoice', 'salary'].some(f => D.canEnterForm(f))) {
      if (D.toast) D.toast('Your seat has no entry rights for this form', 'err');
      return null;
    }
    const allDomKeys = D.INDUSTRY_DOMAIN_FORMS_BY_IND
      ? Object.values(D.INDUSTRY_DOMAIN_FORMS_BY_IND).flatMap(arr => (Array.isArray(arr) ? arr : []).map(sp => sp && sp.key).filter(Boolean))
      : ['ins_policies', 're_leases', 'trd_sales', 'hsp_revenue', 'hld_interactions'];
    if (sourceOrigin === 'domain' && D.canEnterDomainForm && !allDomKeys.some(k => D.canEnterDomainForm(k))) {
      if (!D.canEnterForm || !D.canEnterForm('expense')) {
        if (D.toast) D.toast('Your seat cannot create new domain records', 'err');
        return null;
      }
    }
    const qId = 'sq-' + (++SCAN_STATE.slipQueueCounter);
    const items = units.map((u, idx) => ({
      idx,
      title: u.fileName,
      fileName: u.fileName,
      unit: u,
      captureMethod,
      status: 'pending',
      kind: sourceOrigin === 'domain' ? 'domain' : 'shared',
      targetForm: '',
      targetInd: '',
      targetCompany: '',
      scanBundle: null,
      domExt: null,
      precheck: null,
      precheckAck: false,
      precheckAckSig: '',
      precheckOverrides: {},
      draftValues: null,
      postedUsd: 0,
      hasMoneyTotal: false,
      usdRedacted: false,
      postedRecordId: '',
      errorMsg: ''
    }));
    const queue = {
      id: qId,
      mode: 'queue',
      sourceOrigin,
      captureMethod,
      total: items.length,
      currentIndex: 0,
      summaryOpen: false,
      bgRunning: false,
      sourceItems: units.map(u => u.rawInput).filter(Boolean),
      lastUnitsSnapshot: units,
      items
    };
    SCAN_STATE.slipQueue = queue;
    SCAN_STATE.lastMultiUnits = { units, captureMethod, sourceOrigin };
    SCAN_STATE.pendingPrecheckBundle = null;
    SCAN_STATE.pendingDomainPrecheck = null;
    SCAN_STATE.progressMsg = '';
    if (truncatedCount > 0 && D.toast) {
      D.toast(`Queued first ${MAX_SLIP_QUEUE} slips (${truncatedCount} extra excluded from this batch).`, 'warn');
    }
    await activateQueueSlip(0, { fromPostAdvance: true });
    if (SCAN_STATE.slipQueue && SCAN_STATE.slipQueue.id === qId) {
      refreshQueueBarsOnly();
      void runBackgroundQueuePreExtraction(queue);
    }
    return queue;
  }

  function beginQueuePostTransition(postMeta) {
    if (!hasActiveSlipQueue() || SCAN_STATE.slipQueue.summaryOpen) return null;
    const q = SCAN_STATE.slipQueue;
    const idx = q.currentIndex;
    const it = q.items[idx];
    if (it) {
      captureActiveSlipDraftValues(it);
      it.status = 'posted';
      const meta = (postMeta && typeof postMeta === 'object') ? postMeta : {};
      const crKey = String(meta.crKey || '');
      const hasMoney = meta.hasMoneyTotal !== undefined
        ? Boolean(meta.hasMoneyTotal)
        : Boolean(crKey && !NON_MONEY_QUEUE_KEYS.has(crKey));
      it.hasMoneyTotal = hasMoney;
      it.postedUsd = hasMoney ? (Math.round((Number(meta.postedUsd) || 0) * 100) / 100) : 0;
      it.usdRedacted = Boolean(meta.usdRedacted);
      it.postedRecordId = String(meta.recordId || '');
    }
    SCAN_STATE.advancingQueueOnPost = true;
    return { queueId: q.id, postedIdx: idx };
  }

  function revertQueuePostTransition(token, opts) {
    SCAN_STATE.advancingQueueOnPost = false;
    if (!token || !SCAN_STATE.slipQueue || SCAN_STATE.slipQueue.id !== token.queueId) return Promise.resolve(null);
    const q = SCAN_STATE.slipQueue;
    if (q.items[token.postedIdx]) {
      const it = q.items[token.postedIdx];
      it.status = 'ready';
      it.postedUsd = 0;
      it.hasMoneyTotal = false;
      it.usdRedacted = false;
      it.postedRecordId = '';
    }
    q.currentIndex = token.postedIdx;
    if (opts && opts.reopen) {
      return activateQueueSlip(token.postedIdx, { fromPostAdvance: false });
    }
    setTimeout(() => refreshQueueBarsOnly(), 0);
    return Promise.resolve(null);
  }

  function findNextUnpostedQueueIdx(q, fromIdx) {
    if (!q || !Array.isArray(q.items)) return -1;
    for (let i = fromIdx + 1; i < q.items.length; i++) {
      const st = q.items[i] && q.items[i].status;
      if (st !== 'posted' && st !== 'skipped') return i;
    }
    for (let i = 0; i < fromIdx; i++) {
      const st = q.items[i] && q.items[i].status;
      if (st !== 'posted' && st !== 'skipped') return i;
    }
    return -1;
  }

  function showQueueDoneSummary(q) {
    if (!q || !SCAN_STATE.slipQueue || SCAN_STATE.slipQueue.id !== q.id) return;
    q.summaryOpen = true;
    SCAN_STATE.lastScan = null;
    SCAN_STATE.pendingPrecheckBundle = null;
    SCAN_STATE.pendingDomainPrecheck = null;
    SCAN_STATE.splitOpen = false;
    unwrapSplitPreviewDom();
    const skippedItems = q.items.filter(it => it && it.status === 'skipped');
    const domOpen = Boolean($('indDomainEntryModal') && !$('indDomainEntryModal').hidden);
    const entryOpen = Boolean($('entryModal') && !$('entryModal').hidden);
    if (domOpen) {
      mountOnDomainModal();
      syncMobAiStepPills();
      return;
    }
    if (entryOpen) {
      renderSmartScanBarDom();
      syncMobAiStepPills();
      return;
    }
    const firstSkipped = skippedItems[0];
    const canOpenDom = Boolean(
      firstSkipped && firstSkipped.kind === 'domain' && firstSkipped.domExt
      && seatHasCompanyInIndustry(firstSkipped.targetInd || firstSkipped.domExt.ind)
      && (!D.canEnterDomainForm || D.canEnterDomainForm(firstSkipped.domExt.formKey))
      && (!D.canManageSiblingChronoSchedule || D.canManageSiblingChronoSchedule(firstSkipped.domExt.formKey))
      && typeof D.openIndustryDomainEntryModal === 'function'
    );
    SCAN_STATE.suppressResetOnModalSwitch = true;
    SCAN_STATE.suppressDomResetOnSwitch = true;
    try {
      if (canOpenDom) {
        D.openIndustryDomainEntryModal(firstSkipped.domExt.formKey, {
          company: firstSkipped.domExt.company || undefined
        });
      } else if (typeof D.openEntryModal === 'function') {
        const curInd = D.getActiveIndustry ? D.getActiveIndustry(D.STATE && D.STATE.company) : 'Manufacturing';
        const candForm = (firstSkipped && firstSkipped.kind === 'shared' && firstSkipped.targetForm) || 'expense';
        const safeForm = (!isBlockedFormForInd(candForm, curInd) && (!D.canEnterForm || D.canEnterForm(candForm)))
          ? candForm
          : (['expense', 'document', 'external', 'sales'].find(f => !isBlockedFormForInd(f, curInd) && (!D.canEnterForm || D.canEnterForm(f))) || 'expense');
        D.openEntryModal(safeForm, null, { forceSwitch: true });
      }
    } finally {
      SCAN_STATE.suppressResetOnModalSwitch = false;
      SCAN_STATE.suppressDomResetOnSwitch = false;
    }
    if ($('indDomainEntryModal') && !$('indDomainEntryModal').hidden) {
      mountOnDomainModal();
      syncMobAiStepPills();
      return;
    }
    if ($('entryModal') && !$('entryModal').hidden) {
      const entryM = $('entryModal');
      entryM.classList.add('mob-ai-scan-open');
      entryM.classList.remove('mob-ai-voice-open');
      renderSmartScanBarDom();
      syncMobAiStepPills();
      return;
    }
    const stats = summarizeQueueTotals(q);
    clearSlipQueue({ refreshUi: false });
    if (D && D.toast) {
      D.toast(stats.showUsd
        ? `Batch queue closed: ${stats.postedCnt} posted, ${stats.skippedCnt} skipped · ${stats.totalUsdFmt} entered.`
        : `Batch queue closed: ${stats.postedCnt} posted, ${stats.skippedCnt} skipped.`, 'ok');
    }
  }

  function finishQueueAfterAllDecided(q, opts = {}) {
    const stats = summarizeQueueTotals(q);
    if (stats.skippedCnt === 0) {
      SCAN_STATE.slipQueue = null;
      SCAN_STATE.lastMultiUnits = null;
      if (opts && opts.closeOpenModals) {
        if ($('entryModal') && !$('entryModal').hidden && typeof D.closeEntryModal === 'function') D.closeEntryModal(true);
        if ($('indDomainEntryModal') && !$('indDomainEntryModal').hidden && typeof D.closeIndustryDomainEntryModal === 'function') D.closeIndustryDomainEntryModal(true);
      }
      syncMobAiStepPills();
      if (D && D.toast) {
        const slipWord = stats.postedCnt === 1 ? '1 slip' : `all ${stats.postedCnt} slips`;
        D.toast(stats.showUsd
          ? `Batch queue complete: ${slipWord} posted · ${stats.totalUsdFmt} total.`
          : `Batch queue complete: ${slipWord} posted.`, 'ok');
      }
      return true;
    }
    showQueueDoneSummary(q);
    return true;
  }

  async function completeQueuePostTransition(token) {
    SCAN_STATE.advancingQueueOnPost = false;
    if (!token || !SCAN_STATE.slipQueue || SCAN_STATE.slipQueue.id !== token.queueId) return false;
    const q = SCAN_STATE.slipQueue;
    const nextIdx = findNextUnpostedQueueIdx(q, token.postedIdx);
    if (nextIdx === -1) {
      return finishQueueAfterAllDecided(q);
    }
    await activateQueueSlip(nextIdx, { fromPostAdvance: true });
    return true;
  }

  async function skipCurrentQueueSlip() {
    if (!hasActiveSlipQueue() || SCAN_STATE.activatingSlip || SCAN_STATE.advancingQueueOnPost) return false;
    const q = SCAN_STATE.slipQueue;
    const idx = q.currentIndex;
    if (q.items[idx]) {
      captureActiveSlipDraftValues(q.items[idx]);
      q.items[idx].status = 'skipped';
    }
    const nextIdx = findNextUnpostedQueueIdx(q, idx);
    if (nextIdx === -1) {
      return finishQueueAfterAllDecided(q, { closeOpenModals: true });
    }
    await activateQueueSlip(nextIdx, { fromPostAdvance: true });
    return true;
  }

  async function mergeQueueToBundle() {
    if (!hasActiveSlipQueue()) return null;
    const q = SCAN_STATE.slipQueue;
    const postedCnt = q.items.filter(it => it.status === 'posted').length;
    if (postedCnt > 0) {
      if (D && D.toast) D.toast('Cannot merge after posting one or more slips in this batch.', 'warn');
      return null;
    }
    const rawInputs = q.sourceItems ? q.sourceItems.slice() : [];
    const cap = q.captureMethod || 'AI Smart Scan';
    const origin = q.sourceOrigin === 'domain' && $('indDomainEntryModal') && !$('indDomainEntryModal').hidden ? 'domain' : 'entry';
    const savedUnits = q.lastUnitsSnapshot;
    SCAN_STATE.slipQueue = null;
    SCAN_STATE.lastMultiUnits = { units: savedUnits, captureMethod: cap, sourceOrigin: origin };
    syncMobAiStepPills();
    if (origin === 'domain') {
      return scanIntoDomainModal(rawInputs, { captureMethod: cap, batchMode: 'bundle' });
    }
    return scanFileOrAttachment(rawInputs, cap, { batchMode: 'bundle' });
  }

  async function splitLastBundleToQueue() {
    if (!D || SCAN_STATE.busy || SCAN_STATE.domBusy) return null;
    const snap = SCAN_STATE.lastMultiUnits;
    if (!snap || !Array.isArray(snap.units) || snap.units.length < 2) return null;
    const origin = ($('indDomainEntryModal') && !$('indDomainEntryModal').hidden) ? 'domain' : (snap.sourceOrigin || 'entry');
    SCAN_STATE.busy = true;
    try {
      return await startSlipQueue(snap.units, snap.captureMethod || 'AI Smart Scan', origin);
    } finally {
      SCAN_STATE.busy = false;
      SCAN_STATE.domBusy = false;
      if (hasActiveSlipQueue()) refreshQueueBarsOnly();
    }
  }

  function clearSlipQueue(opts = {}) {
    SCAN_STATE.slipQueue = null;
    SCAN_STATE.advancingQueueOnPost = false;
    SCAN_STATE.lastMultiUnits = null;
    syncMobAiStepPills();
    if (opts && opts.refreshUi) {
      renderSmartScanBarDom();
      mountOnDomainModal();
    }
  }

  // ==================== MAIN SCAN ORCHESTRATOR (SINGLE & MULTI-PAGE 1..N) ====================
  async function scanFileOrAttachment(inputFileOrAtt, captureMethod = 'AI Smart Scan', scanOpts = {}) {
    if (!D || SCAN_STATE.busy || SCAN_STATE.domBusy) return null;
    const rawItems = expandInputToScanBatch(inputFileOrAtt);
    if (!rawItems.length) return null;
    const wasEntryOpenStart = Boolean($('entryModal') && !$('entryModal').hidden);
    const preScanGen = (SCAN_STATE.entryScanGen = (SCAN_STATE.entryScanGen || 0) + 1);
    const isPreScanCurrent = () => {
      if (SCAN_STATE.entryScanGen !== preScanGen) return false;
      if (wasEntryOpenStart && (!$('entryModal') || $('entryModal').hidden)) return false;
      return true;
    };
    let preExtractedUnits = null;
    const forceQueueMode = Boolean(
      (scanOpts && scanOpts.batchMode === 'queue')
      || rawItems.some(it => it && typeof it === 'object' && (it._ssBatchMode === 'queue' || it._stackSlip))
    );
    const preserveQueueSingle = Boolean(
      !forceQueueMode
      && (!scanOpts || scanOpts.batchMode !== 'bundle')
      && hasActiveSlipQueue()
      && !(SCAN_STATE.slipQueue && SCAN_STATE.slipQueue.summaryOpen)
    );
    if (scanOpts && scanOpts.batchMode !== 'bundle' && !scanOpts._singleQueueUnit) {
      SCAN_STATE.busy = true;
      try {
        const unitRes = await extractSlipUnitsFromInput(rawItems, captureMethod, isPreScanCurrent);
        if (unitRes.aborted || !isPreScanCurrent()) return null;
        preExtractedUnits = unitRes.units;
        if (unitRes.units.length >= 2 || (forceQueueMode && unitRes.units.length >= 1)) {
          SCAN_STATE.lastMultiUnits = unitRes.units.length >= 2 ? { units: unitRes.units, captureMethod, sourceOrigin: 'entry' } : null;
          if (forceQueueMode || shouldDefaultToSlipQueue(unitRes.units)) {
            return await startSlipQueue(unitRes.units, captureMethod, 'entry', unitRes.truncatedCount);
          }
        } else {
          SCAN_STATE.lastMultiUnits = null;
        }
        if (!(preserveQueueSingle && unitRes.units.length <= 1)) {
          SCAN_STATE.slipQueue = null;
          syncMobAiStepPills();
        }
      } finally {
        if (SCAN_STATE.entryScanGen === preScanGen) {
          SCAN_STATE.busy = false;
          if (hasActiveSlipQueue()) refreshQueueBarsOnly();
        }
      }
    }
    const modalCheckPre = $('entryModal');
    if ((!modalCheckPre || modalCheckPre.hidden) && D.canEnterForm && !['expense', 'document', 'external', 'sales', 'receipt', 'vatinvoice', 'salary'].some(f => D.canEnterForm(f))) {
      if (D.toast) {
        const curIndCheck = D.getActiveIndustry ? D.getActiveIndustry(D.STATE && D.STATE.company) : 'Manufacturing';
        D.toast(curIndCheck !== 'Manufacturing' ? 'Your seat cannot create new domain records' : 'Your seat has no entry rights for this form', 'err');
      }
      return null;
    }
    const carriedPrecheck = collectCarriedPrecheckFlags(rawItems);

    const scanGen = (SCAN_STATE.entryScanGen = (SCAN_STATE.entryScanGen || 0) + 1);
    SCAN_STATE.busy = true;
    SCAN_STATE.pendingPrecheckBundle = null;
    SCAN_STATE.sampleMenuOpen = false;
    SCAN_STATE.imgRotateDeg = 0;
    SCAN_STATE.progressMsg = rawItems.length > 1
      ? `Reading ${rawItems.length}-page bundle and preparing stitched preview...`
      : 'Reading document and preparing preview...';

    // Ensure #entryModal is open so user immediately sees live progress
    const modal = $('entryModal');
    if (!modal || modal.hidden) {
      SCAN_STATE.suppressResetOnModalSwitch = true;
      try {
        const curIndInit = D.getActiveIndustry ? D.getActiveIndustry(D.STATE.company) : 'Manufacturing';
        let initForm = (D.contextFormForView && D.contextFormForView(D.STATE.view)) || 'expense';
        if (isBlockedFormForInd(initForm, curIndInit) || (D.canEnterForm && !D.canEnterForm(initForm))) {
          initForm = ['expense', 'document', 'external', 'sales'].find(f => !isBlockedFormForInd(f, curIndInit) && (!D.canEnterForm || D.canEnterForm(f))) || 'expense';
        }
        D.openEntryModal(initForm);
      } finally {
        SCAN_STATE.suppressResetOnModalSwitch = false;
      }
    } else {
      renderSmartScanBarDom();
    }
    const liveScanModal = $('entryModal');
    if (liveScanModal) {
      liveScanModal.classList.add('mob-ai-scan-open');
      liveScanModal.classList.remove('mob-ai-voice-open');
      liveScanModal._mobScanAutoExpanded = true;
      syncEntryMobAiQuickBarUi(liveScanModal);
    }

    const isEntryScanCurrent = () => SCAN_STATE.entryScanGen === scanGen && Boolean($('entryModal') && !$('entryModal').hidden);

    const updateStatus = msg => {
      if (!isEntryScanCurrent()) return;
      SCAN_STATE.progressMsg = sanitizeOutwardText(msg);
      renderSmartScanBarDom();
    };

    try {
      // Wait up to 2s if full seed records are still unpacking after cold reload
      if (D.SEED && !D.SEED._recordsReady) {
        for (let w = 0; w < 40 && !D.SEED._recordsReady; w++) {
          await new Promise(r => setTimeout(r, 50));
          if (!isEntryScanCurrent()) return null;
        }
      }

      const normPairs = [];
      const pageEntries = [];
      if (Array.isArray(preExtractedUnits) && preExtractedUnits.length) {
        const seenPairs = new Set();
        preExtractedUnits.forEach((u, idx) => {
          const p = u.origPair || { fileObj: u.fileObj, attObj: u.attObj };
          if (p && p.attObj && !seenPairs.has(p)) {
            seenPairs.add(p);
            normPairs.push(p);
          }
          const lblName = u.isPdfPage ? `${u.origFileName || u.fileName} (p.${u.pageNum})` : (u.fileName || `Page_${idx + 1}`);
          pageEntries.push({ pageNum: pageEntries.length + 1, fileName: lblName, text: String(u.text || '') });
        });
      } else {
        for (let i = 0; i < rawItems.length; i++) {
          if (!isEntryScanCurrent()) return null;
          if (rawItems.length > 1) {
            updateStatus(`Extracting page ${i + 1} of ${rawItems.length}...`);
          }
          const pair = await normalizeSingleScanItem(rawItems[i], captureMethod, i);
          if (!isEntryScanCurrent()) return null;
          if (!pair.attObj) continue;
          normPairs.push(pair);

          const fName = pair.attObj.file_name || `Page_${i + 1}`;
          if (pair.fileObj && typeof pair.fileObj._extractedText === 'string') {
            pageEntries.push({ pageNum: pageEntries.length + 1, fileName: fName, text: pair.fileObj._extractedText });
            continue;
          }
          const isPdfPair = /\.pdf$/i.test(fName) || /application\/pdf/i.test(pair.attObj.mime_type || '');
          if (isPdfPair && pair.fileObj) {
            const ab = await pair.fileObj.arrayBuffer();
            if (!isEntryScanCurrent()) return null;
            const pdfPages = await extractPdfPagesTextClient(ab);
            if (!isEntryScanCurrent()) return null;
            if (pdfPages.length > 1) {
              pdfPages.forEach((pt, pIdx) => {
                pageEntries.push({ pageNum: pageEntries.length + 1, fileName: `${fName} (p.${pIdx + 1})`, text: pt });
              });
              continue;
            }
          }
          const pageTxt = await extractAnyDocumentText(pair.fileObj, pair.attObj, rawItems.length === 1 ? updateStatus : () => {});
          if (!isEntryScanCurrent()) return null;
          pageEntries.push({ pageNum: pageEntries.length + 1, fileName: fName, text: pageTxt });
        }
      }

      const attObjs = normPairs.map(p => p.attObj);
      const attObj = attObjs[0] || null;
      const totalPages = Math.max(1, pageEntries.length);
      const combinedText = totalPages > 1
        ? pageEntries.map((pe, idx) => `=== PAGE ${idx + 1} OF ${totalPages} (${pe.fileName}) ===\n${pe.text || ''}`).join('\n\n')
        : String((pageEntries[0] && pageEntries[0].text) || '');

      let stitchedVisionAtt = null;
      if (attObjs.length > 1) {
        updateStatus(`Stitching ${attObjs.length} pages & synthesizing cross-page entries...`);
        stitchedVisionAtt = await stitchMultiPageVisionSheet(attObjs);
        if (!isEntryScanCurrent()) return null;
      } else {
        updateStatus('Classifying entry tab & matching ISABI registries...');
      }

      const primaryFileName = (attObj && attObj.file_name) || '';
      const detParsed = synthesizeMultiPageDeterministic(pageEntries, combinedText, primaryFileName);
      const prelimScope = collectRegistryCandidates(detParsed.company);
      const visionTargetAtt = stitchedVisionAtt || attObj;

      const isBuiltInSample = captureMethod === 'Sample Smart Scan' && !window.__MFG_TEST_LIVE_AI;
      let aiResult = isBuiltInSample ? null : await tryLocalServerVisionScan({
        fileName: (visionTargetAtt && visionTargetAtt.file_name) || primaryFileName,
        mimeType: (visionTargetAtt && visionTargetAtt.mime_type) || '',
        dataUrl: (visionTargetAtt && visionTargetAtt.data_url) || '',
        extractedText: String(combinedText || '').slice(0, 8000),
        pageCount: totalPages,
        companies: prelimScope.companies.slice(0, 16)
      });
      if (!isEntryScanCurrent()) return null;
      if (!aiResult && !isBuiltInSample) {
        aiResult = await tryCloudAiStructuredParse(combinedText, prelimScope, visionTargetAtt, totalPages);
        if (!isEntryScanCurrent()) return null;
      }

      const mergedParsed = mergeParsedResults(detParsed, aiResult && aiResult.parsed);
      mergedParsed.pageCount = totalPages;
      mergedParsed.multiPageSynthesized = totalPages > 1;
      const matched = groundExtractedEntities(mergedParsed, combinedText);

      const scanBundle = {
        attObj,
        attObjs,
        _rawFiles: rawItems.filter(it => typeof Blob !== 'undefined' && it instanceof Blob),
        stitchedDataUrl: stitchedVisionAtt ? stitchedVisionAtt.data_url : '',
        activePageIdx: stitchedVisionAtt ? 'all' : 0,
        extractedText: String(combinedText || '').trim(),
        parsed: mergedParsed,
        matched,
        engineLabel: (aiResult && aiResult.engine) || (totalPages > 1 ? `ISABI ${totalPages}-Page Bundle Synthesizer` : 'ISABI Smart Parser + Frequency Grounding'),
        appliedForm: mergedParsed.formType,
        filledFields: [],
        warnFields: []
      };

      Object.entries(carriedPrecheck.overrides || {}).forEach(([okKey, okVal]) => {
        applyPrecheckOverrideToBundle(scanBundle, okKey, okVal);
      });

      const runPrecheckGate = captureMethod !== 'Sample Smart Scan' || Boolean(window.__MFG_FORCE_SAMPLE_PRECHECK);
      const precheck = runPrecheckGate ? evaluateScanPrecheck(scanBundle) : { hasWarning: false, partyWarnings: [], summaryLines: [], warnSig: '' };
      if (!isEntryScanCurrent()) return null;
      SCAN_STATE.busy = false;
      SCAN_STATE.progressMsg = '';
      const ackMatches = Boolean(carriedPrecheck.ack && carriedPrecheck.ackSig && precheck.warnSig && carriedPrecheck.ackSig === precheck.warnSig);
      if (precheck.hasWarning && !ackMatches) {
        const preTarget = resolvePrecheckEntryTarget(scanBundle);
        if (!preTarget.ok) {
          SCAN_STATE.pendingPrecheckBundle = null;
          SCAN_STATE.lastScan = null;
          if (D.toast) D.toast(preTarget.reason, 'err');
          return null;
        }
        if (preTarget.coSwitchKey || (D.STATE && D.STATE.modalForm !== preTarget.targetForm)) {
          SCAN_STATE.suppressResetOnModalSwitch = true;
          try {
            if (preTarget.coSwitchKey && D.selectCompanyScope) {
              try { D.selectCompanyScope(preTarget.coSwitchKey); } catch (_) {}
            }
            if (typeof D.openEntryModal === 'function') {
              D.openEntryModal(preTarget.targetForm || 'expense', null, { forceSwitch: true });
            }
          } finally {
            SCAN_STATE.suppressResetOnModalSwitch = false;
          }
          if (!$('entryModal') || $('entryModal').hidden) {
            SCAN_STATE.pendingPrecheckBundle = null;
            SCAN_STATE.lastScan = null;
            if (D.toast) D.toast(preTarget.reason, 'err');
            return null;
          }
        }
        scanBundle.precheck = precheck;
        SCAN_STATE.pendingPrecheckBundle = scanBundle;
        SCAN_STATE.lastScan = scanBundle;
        renderSmartScanBarDom();
        return scanBundle;
      }

      if (precheck.hasWarning && ackMatches) {
        restoreRawParsedForUnoverriddenWarnings(scanBundle, precheck.partyWarnings, carriedPrecheck.overrides);
      }
      SCAN_STATE.pendingPrecheckBundle = null;
      await applyScanToModal(scanBundle);
      if (scanBundle.blockedByRbac) return null;
      if (!scanBundle.routedDomainModal && !isEntryScanCurrent()) return null;

      if (preserveQueueSingle && hasActiveSlipQueue() && SCAN_STATE.slipQueue && !SCAN_STATE.slipQueue.summaryOpen) {
        const curIt = SCAN_STATE.slipQueue.items && SCAN_STATE.slipQueue.items[SCAN_STATE.slipQueue.currentIndex];
        if (curIt) {
          curIt.scanBundle = scanBundle;
          if (scanBundle.fileName) curIt.fileName = scanBundle.fileName;
          const p = scanBundle.parsed || {};
          const nextTitle = p.ticket_no || p.invoice_no || p.supplier || p.customer || scanBundle.fileName;
          if (nextTitle) curIt.title = String(nextTitle);
        }
        refreshQueueBarsOnly();
      }
      notifyScanApplyOutcome(scanBundle, totalPages);
      return scanBundle;
    } catch (err) {
      if (SCAN_STATE.entryScanGen === scanGen) {
        SCAN_STATE.busy = false;
        SCAN_STATE.pendingPrecheckBundle = null;
        SCAN_STATE.progressMsg = '';
        renderSmartScanBarDom();
        if (D.toast) D.toast('Could not scan file: ' + sanitizeOutwardText((err && err.message) || 'Unknown error'), 'err');
      }
      return null;
    } finally {
      if (SCAN_STATE.entryScanGen === scanGen) {
        SCAN_STATE.busy = false;
        SCAN_STATE.progressMsg = '';
      }
    }
  }

  async function runSampleScanById(sampleId) {
    const sample = SAMPLE_SCANS.find(s => s.id === sampleId) || SAMPLE_SCANS[0];
    if (!sample) return null;
    if (D && D.SEED && !D.SEED._recordsReady) {
      for (let w = 0; w < 40 && !D.SEED._recordsReady; w++) {
        await new Promise(r => setTimeout(r, 50));
      }
    }
    const spec = JSON.parse(JSON.stringify(sample.spec));
    // Adapt sample supplier/site cleanly if public-demo sanitization pseudonymized WTC names
    if (D && D.SEED && D.SEED.records) {
      const sups = D.SEED.records.suppliers || [];
      const sites = D.SEED.records.sites || [];
      if (sample.id === 'mfg_wtc_exp' && !sups.some(s => s && !s.voided && norm(s.name) === norm('Amtrac'))) {
        const altSup = sups.find(s => s && !s.voided && !s._multiIndustrySeed && (s.vat_wtc || s.iva) && s.name);
        if (altSup) {
          spec.metaLeft = spec.metaLeft.map(l => /^Supplier:/i.test(l) ? `Supplier: ${altSup.name}` : l);
        }
      }
      if (sample.id === 'mfg_unpriced_raw' && !sites.some(s => s && !s.voided && norm(s.name) === norm('Sibline'))) {
        const altSite = sites.find(s => s && !s.voided && !s._multiIndustrySeed && s.name);
        if (altSite) {
          spec.metaLeft = spec.metaLeft.map(l => /^Site:/i.test(l) ? `Site: ${altSite.name}` : l);
        }
      }
    }
    const svgText = buildSampleInvoiceSvg(spec);
    const file = new File([svgText], sample.fileName, { type: 'image/svg+xml' });
    return await scanFileOrAttachment(file, 'Sample Smart Scan');
  }

  // ==================== SIDE-BY-SIDE SPLIT PREVIEW & BAR UI ====================
  function unwrapSplitPreviewDom() {
    const body = $('modalBody');
    if (!body) return;
    body.classList.remove('ss-split-open');
    const pane = body.querySelector(':scope > .ss-split-preview-pane');
    if (pane) pane.remove();
    const formCol = body.querySelector(':scope > .ss-split-form-col');
    if (formCol) {
      const foot = body.querySelector(':scope > .modal-foot');
      while (formCol.firstChild) {
        if (foot) body.insertBefore(formCol.firstChild, foot);
        else body.appendChild(formCol.firstChild);
      }
      formCol.remove();
    }
    revokeScanPreviewBlob();
  }

  function syncSplitPreviewDom() {
    const body = $('modalBody');
    if (!body) return;
    if (!SCAN_STATE.splitOpen || !SCAN_STATE.lastScan || !SCAN_STATE.lastScan.attObj) {
      unwrapSplitPreviewDom();
      return;
    }
    unwrapSplitPreviewDom();
    const scan = SCAN_STATE.lastScan;
    const allAtts = Array.isArray(scan.attObjs) && scan.attObjs.length ? scan.attObjs : [scan.attObj];
    const hasMulti = allAtts.length > 1;
    const activeIdx = hasMulti ? (scan.activePageIdx != null ? scan.activePageIdx : (scan.stitchedDataUrl ? 'all' : 0)) : 0;

    let att = scan.attObj;
    if (hasMulti && activeIdx === 'all' && scan.stitchedDataUrl) {
      att = {
        file_name: `All ${allAtts.length} Pages (Stitched View)`,
        mime_type: 'image/jpeg',
        data_url: scan.stitchedDataUrl
      };
    } else if (hasMulti && typeof activeIdx === 'number' && allAtts[activeIdx]) {
      att = allAtts[activeIdx];
    }

    const dataUrl = String(att.data_url || '');
    const mime = String(att.mime_type || '').toLowerCase();
    const fileName = String(att.file_name || 'Document');
    const isPdf = mime.includes('pdf') || /\.pdf$/i.test(fileName) || /^data:application\/pdf/i.test(dataUrl);
    const isImg = !isPdf && (mime.startsWith('image/') || /^data:image\//i.test(dataUrl) || /\.(svg|png|jpe?g|webp|gif|bmp)$/i.test(fileName));

    let previewSrc = dataUrl;
    if (isPdf && /^data:application\/pdf;base64,/i.test(dataUrl)) {
      try {
        const b64 = dataUrl.split(',')[1] || '';
        const bin = atob(b64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        SCAN_STATE.blobPreviewUrl = URL.createObjectURL(new Blob([u8], { type: 'application/pdf' }));
        previewSrc = SCAN_STATE.blobPreviewUrl;
      } catch (_) {}
    }

    const switcherHtml = hasMulti ? `
      <div class="ss-page-switcher" id="ssPageSwitcher" role="tablist" aria-label="Scanned document pages">
        ${scan.stitchedDataUrl ? `<button type="button" class="ss-page-pill ${activeIdx === 'all' ? 'active' : ''}" data-ss-page-idx="all">All Pages (${allAtts.length})</button>` : ''}
        ${allAtts.map((aItem, pIdx) => `<button type="button" class="ss-page-pill ${activeIdx === pIdx ? 'active' : ''}" data-ss-page-idx="${pIdx}">Page ${pIdx + 1}</button>`).join('')}
      </div>
    ` : '';

    const pane = document.createElement('aside');
    pane.className = 'ss-split-preview-pane';
    pane.id = 'ssSplitPreviewPane';
    pane.innerHTML = `
      <div class="ss-prev-hdr" style="flex-wrap:wrap">
        <span>${ic('eye')} ${esc(fileName)}</span>
        <div style="display:flex;gap:4px;align-items:center">
          ${isImg ? `<button type="button" class="ss-alt-form-chip" id="ssRotateImgBtn" aria-label="Rotate image 90 degrees">${ic('rotate')} Rotate</button>` : ''}
          <button type="button" class="ss-alt-form-chip" id="ssCloseSplitBtn" aria-label="Hide side-by-side preview">Hide</button>
        </div>
        ${switcherHtml}
      </div>
      <div class="ss-prev-stage">
        ${isImg && previewSrc
          ? `<img src="${esc(previewSrc)}" alt="${esc(fileName)}" id="ssSplitPreviewImg" style="transform:rotate(${SCAN_STATE.imgRotateDeg}deg)">`
          : (isPdf && previewSrc
            ? `<iframe src="${esc(previewSrc)}" aria-label="${esc(fileName)}"></iframe>`
            : `<pre class="ss-prev-text-box">${esc(scan.extractedText || fileName)}</pre>`)}
      </div>
      ${scan.extractedText && (isImg || isPdf) ? `<details style="font-size:11px;color:var(--muted)"><summary style="cursor:pointer;font-weight:600">Extracted OCR / Text (${scan.extractedText.length} chars)</summary><pre class="ss-prev-text-box" style="max-height:140px;margin-top:4px">${esc(scan.extractedText)}</pre></details>` : ''}
    `;

    const formCol = document.createElement('div');
    formCol.className = 'ss-split-form-col';

    const children = Array.from(body.children);
    children.forEach(ch => {
      if (ch.id === 'entrySmartScanBar' || ch.classList.contains('modal-foot')) return;
      formCol.appendChild(ch);
    });

    const foot = body.querySelector(':scope > .modal-foot');
    if (foot) {
      body.insertBefore(pane, foot);
      body.insertBefore(formCol, foot);
    } else {
      body.appendChild(pane);
      body.appendChild(formCol);
    }
    body.classList.add('ss-split-open');

    pane.querySelectorAll('[data-ss-page-idx]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const raw = btn.getAttribute('data-ss-page-idx');
        scan.activePageIdx = raw === 'all' ? 'all' : Number(raw || 0);
        SCAN_STATE.imgRotateDeg = 0;
        syncSplitPreviewDom();
      });
    });

    const rotBtn = $('ssRotateImgBtn');
    if (rotBtn) {
      rotBtn.addEventListener('click', e => {
        e.stopPropagation();
        SCAN_STATE.imgRotateDeg = (SCAN_STATE.imgRotateDeg + 90) % 360;
        const imgEl = $('ssSplitPreviewImg');
        if (imgEl) imgEl.style.transform = `rotate(${SCAN_STATE.imgRotateDeg}deg)`;
      });
    }
    const closeBtn = $('ssCloseSplitBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', e => {
        e.stopPropagation();
        SCAN_STATE.splitOpen = false;
        syncSplitPreviewDom();
        renderSmartScanBarDom();
      });
    }
  }

  function ensureGlobalFileInputs() {
    let fInp = $('ssGlobalFileInput');
    if (!fInp) {
      fInp = document.createElement('input');
      fInp.type = 'file';
      fInp.id = 'ssGlobalFileInput';
      fInp.multiple = true;
      fInp.hidden = true;
      fInp.accept = 'image/*,application/pdf,.pdf,.svg,.jpg,.jpeg,.png,.webp,.xlsx,.docx,.csv,.tsv,.txt,.json,.xml';
      fInp.addEventListener('change', async () => {
        const picked = fInp.files ? Array.from(fInp.files) : [];
        fInp.value = '';
        if (picked.length) await scanFileOrAttachment(picked, 'AI Smart Scan Upload');
      });
      document.body.appendChild(fInp);
    } else {
      fInp.multiple = true;
    }
    let cInp = $('ssGlobalCamInput');
    if (!cInp) {
      cInp = document.createElement('input');
      cInp.type = 'file';
      cInp.id = 'ssGlobalCamInput';
      cInp.hidden = true;
      cInp.accept = 'image/*';
      cInp.setAttribute('capture', 'environment');
      cInp.addEventListener('change', async () => {
        const f = cInp.files && cInp.files[0];
        cInp.value = '';
        if (f) await scanFileOrAttachment(f, 'Camera Smart Scan');
      });
      document.body.appendChild(cInp);
    }
    return { fInp, cInp };
  }

  function buildFormDisplayLabel(formId) {
    const map = (window.MFG_FORMS && window.MFG_FORMS.FORM_MAP && window.MFG_FORMS.FORM_MAP[formId]) || null;
    if (map && map.label) return sanitizeOutwardText(map.label);
    return sanitizeOutwardText(formId);
  }

  function renderSmartScanBarHtml() {
    const pendingBundle = SCAN_STATE.pendingPrecheckBundle;
    const scan = pendingBundle ? null : SCAN_STATE.lastScan;
    const hasResult = Boolean(scan && !SCAN_STATE.busy);

    const sampleMenuHtml = SCAN_STATE.sampleMenuOpen ? `
      <div class="ss-sample-menu" id="ssSampleMenu" role="menu">
        <div class="ss-sample-hdr">Instant Industry Sample Scans (6 Verticals)</div>
        ${SAMPLE_SCANS.map(s => `
          <button type="button" class="ss-sample-item" data-ss-sample="${esc(s.id)}" role="menuitem">
            <b>${esc(s.label)}</b>
            <small>${esc(s.sub)}</small>
          </button>
        `).join('')}
      </div>
    ` : '';

    const queueBarHtml = renderSlipQueueBarHtml();
    const canSplitBundle = Boolean(
      !hasActiveSlipQueue()
      && SCAN_STATE.lastMultiUnits
      && Array.isArray(SCAN_STATE.lastMultiUnits.units)
      && SCAN_STATE.lastMultiUnits.units.length >= 2
      && shouldSplitActionBeOffered(SCAN_STATE.lastMultiUnits.units)
    );

    let reviewHtml = '';
    if (SCAN_STATE.busy) {
      reviewHtml = `
        <div class="ss-progress-row" id="ssProgressRow">
          <span class="ss-pulse-dot" aria-hidden="true"></span>
          <span>${esc(SCAN_STATE.progressMsg || 'Analyzing document and filling fields...')}</span>
        </div>
      `;
    } else if (pendingBundle && pendingBundle.precheck && pendingBundle.precheck.hasWarning) {
      const pre = pendingBundle.precheck;
      const pwBtns = (pre.partyWarnings || []).map((pw, idx) => `
        <button type="button" class="btn btn-primary btn-sm" data-ss-precheck-use="${idx}"><span>Use</span> <b data-no-i18n="1">${esc(pw.suggested)}</b></button>
      `).join('');
      reviewHtml = `
        ${queueBarHtml}
        <div class="ss-precheck-banner" id="ssPrecheckBanner">
          <div class="ss-precheck-head">
            <span>${ic('warn')} Pre-Check Hold: Review Before Filling Form</span>
            <span class="ss-stat-pill is-form">${esc(buildFormDisplayLabel((pendingBundle.parsed && pendingBundle.parsed.formType) || 'expense'))}</span>
          </div>
          <div class="ss-precheck-lines">
            ${((pre.summaryItems && pre.summaryItems.length) ? pre.summaryItems : (pre.summaryLines || [])).map(it => `<div class="ss-precheck-line">${renderPrecheckItemHtml(it)}</div>`).join('')}
          </div>
          <div class="ss-precheck-actions">
            ${pwBtns}
            <button type="button" class="btn btn-outline-bar btn-sm" id="ssPrecheckApplyBtn">Fill Form Anyway</button>
            ${hasActiveSlipQueue() ? `<button type="button" class="btn btn-ghost-bar btn-sm" id="ssPrecheckSkipBtn">Skip Slip</button>` : ''}
            <button type="button" class="btn btn-ghost-bar btn-sm" id="ssPrecheckDiscardBtn">Discard Scan</button>
          </div>
        </div>
      `;
    } else if (hasResult) {
      const filledCnt = (scan.filledFields || []).length;
      const warnCnt = (scan.warnFields || []).length + ((scan.matched && scan.matched.warnings) ? scan.matched.warnings.length : 0);
      const isPending = Boolean(scan.parsed && scan.parsed.pricePending);
      const pageCnt = Math.max(1, Number((scan.parsed && scan.parsed.pageCount) || (scan.attObjs && scan.attObjs.length) || 1));
      const vinAudit = scan.parsed && scan.parsed.vinAudit && scan.parsed.vinAudit.isVin17 ? scan.parsed.vinAudit : null;
      const canEnter = D && D.canEnterForm ? D.canEnterForm : (() => true);
      const curIndNow = (D && D.getActiveIndustry && D.STATE) ? D.getActiveIndustry(D.STATE.company) : 'Manufacturing';
      const alts = Array.from(new Set([scan.parsed.formType].concat(scan.parsed.altForms || [])))
        .filter(f => f && f !== scan.appliedForm && !isBlockedFormForInd(f, curIndNow) && canEnter(f))
        .slice(0, 4);

      const warningsList = ((scan.matched && scan.matched.warnings) || []);
      let resolvedSsCo = '';
      const resolvedSsInd = (() => {
        const curCo = $('f_company') ? $('f_company').value : ((scan.matched && scan.matched.targetCompany) || (D && D.STATE && D.STATE.company));
        resolvedSsCo = curCo || '';
        const coKey = (D && D.COMPANY_KEY_BY_NAME && D.COMPANY_KEY_BY_NAME[curCo]) || curCo;
        return (D && typeof D.getActiveIndustry === 'function') ? D.getActiveIndustry(coKey) : '';
      })();
      const ssLinesCount = Array.isArray(scan.parsed && scan.parsed.lineItems) ? scan.parsed.lineItems.length : 0;
      const matchedSupForSplit = (scan.matched && scan.matched.supplier) || (scan.parsed && scan.parsed.supplier) || '';
      const hasSavedSplit = Boolean(
        matchedSupForSplit
        && window.MFG_AI_EDGE
        && typeof window.MFG_AI_EDGE.hasVendorSplitTemplate === 'function'
        && window.MFG_AI_EDGE.hasVendorSplitTemplate(resolvedSsInd, matchedSupForSplit, resolvedSsCo)
      );
      const isSplitInd = resolvedSsInd === 'Hospitality & Resorts' || resolvedSsInd === 'Manufacturing';
      const isExpenseScanContext = scan.appliedForm === 'expense' || (scan.parsed && scan.parsed.formType === 'expense');
      const canSplitMultiDept = Boolean(
        isSplitInd
        && isExpenseScanContext
        && (ssLinesCount >= 2 || (hasSavedSplit && Number((scan.parsed && scan.parsed.totalAmount) || 0) > 0))
        && !(D && D.STATE && D.STATE.kioskLocked)
        && canEnter('expense')
        && typeof window !== 'undefined'
        && window.MFG_AI_EDGE
        && typeof window.MFG_AI_EDGE.openBatchIntakeModal === 'function'
      );
      const splitBtnLabel = resolvedSsInd === 'Hospitality & Resorts'
        ? (ssLinesCount >= 2 ? `Split Multi-Dept (${ssLinesCount} Lines)` : 'Split Multi-Dept (Last Split)')
        : (ssLinesCount >= 2 ? `Split Multi-Category (${ssLinesCount} Lines)` : 'Split Multi-Category (Last Split)');
      reviewHtml = `
        ${queueBarHtml}
        <div class="ss-review-strip" id="ssReviewStrip">
          <div class="ss-review-top">
            <div class="ss-review-pills">
              <span class="ss-stat-pill is-form">${ic('bolt')} Routed: ${esc(buildFormDisplayLabel(scan.appliedForm))}</span>
              <span class="ss-stat-pill is-ok">${ic('check')} ${filledCnt} Field${filledCnt === 1 ? '' : 's'} Auto-Filled</span>
              ${pageCnt > 1 ? `<span class="ss-multipage-pill">${pageCnt} Pages Synthesized</span>` : ''}
              ${vinAudit ? `<span class="ss-vin-pill is-${esc(vinAudit.statusTone)}">${esc(vinAudit.badgeLabel)}</span>` : ''}
              ${isPending ? `<span class="ss-stat-pill is-warn">Price Pending ($0.00)</span>` : ''}
              ${warnCnt > 0 ? `<span class="ss-stat-pill is-warn">${ic('warn')} ${warnCnt} Item${warnCnt === 1 ? '' : 's'} to Verify</span>` : ''}
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              ${canSplitBundle ? `<button type="button" class="ss-alt-form-chip" id="ssSplitToSlipQueueBtn">${ic('layers')} <span>Split into Slips</span> <b data-no-i18n="1">(${SCAN_STATE.lastMultiUnits.units.length})</b></button>` : ''}
              ${canSplitMultiDept ? `<button type="button" class="ss-alt-form-chip" id="ssSplitMultiDeptBtn">${ic('layers')} ${esc(splitBtnLabel)}</button>` : ''}
              <button type="button" class="ss-alt-form-chip" id="ssToggleSplitBtn">${ic('eye')} ${SCAN_STATE.splitOpen ? 'Hide Document Preview' : 'Side-by-Side Preview'}</button>
              <button type="button" class="ss-alt-form-chip" id="ssClearScanBtn">${ic('trash')} Clear Scan</button>
            </div>
          </div>
          ${alts.length ? `
            <div class="ss-alt-forms-row">
              <span>Need a different entry tab?</span>
              ${alts.map(f => `<button type="button" class="ss-alt-form-chip" data-ss-switch-form="${esc(f)}">${ic('swap')} ${esc(buildFormDisplayLabel(f))}</button>`).join('')}
            </div>
          ` : ''}
          ${warningsList.length ? `
            <div class="ss-warnings-list">
              ${warningsList.map((w, idx) => `
                <div class="ss-warn-item">
                  <span>${esc(sanitizeOutwardText(w.text))}</span>
                  ${w.kind === 'register_item' ? `<button type="button" class="ss-warn-act-btn" data-ss-reg-item="${esc(w.itemName)}" data-ss-reg-row="${Number(w.rowIdx || 0)}">+ Register Item</button>` : ''}
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    } else if (queueBarHtml) {
      reviewHtml = queueBarHtml;
    }

    return `
      <div class="ss-bar-main">
        <div class="ss-bar-left">
          <span class="ss-bar-icon" aria-hidden="true">${ic('bolt')}</span>
          <div class="ss-bar-copy">
            <strong>Smart Scan &amp; Auto-Fill (Drop Invoice, Slip, PDF, Photo or Excel)</strong>
            <small>${hasResult
              ? `Attached ${(scan.attObjs && scan.attObjs.length > 1) ? `${scan.attObjs.length} pages starting with ` : ''}"${esc((scan.attObj && scan.attObj.file_name) || 'Document')}" (${esc(scan.engineLabel)}). Review highlighted fields below, adjust anything, then click Post.`
              : 'Not sure which tab to pick? Upload or snap single or multi-page receipts, bills, weighbridge slips, VIN plates, or leases and ISABI fills the form for your review.'}</small>
          </div>
        </div>
        <div class="ss-bar-actions">
          <button type="button" class="ss-btn is-primary" id="ssUploadBtn">${ic('upload')} Upload File / PDF</button>
          <button type="button" class="ss-btn" id="ssCameraBtn">${ic('camera')} Snap Photo</button>
          <div class="ss-sample-wrap">
            <button type="button" class="ss-btn" id="ssSampleBtn" aria-expanded="${SCAN_STATE.sampleMenuOpen ? 'true' : 'false'}">Try Sample ▾</button>
            ${sampleMenuHtml}
          </div>
        </div>
      </div>
      ${reviewHtml}
    `;
  }

  function renderSmartScanBarDom() {
    const bar = $('entrySmartScanBar');
    if (!bar) return;
    bar.classList.toggle('has-result', Boolean((SCAN_STATE.lastScan || hasActiveSlipQueue()) && !SCAN_STATE.busy));
    bar.innerHTML = renderSmartScanBarHtml();
    wireSmartScanBarEvents(bar);
    wireSlipQueueEvents(bar);
    if (typeof window !== 'undefined' && window.MFG_I18N && typeof window.MFG_I18N.getLang === 'function' && window.MFG_I18N.getLang() !== 'en' && typeof window.MFG_I18N.translateDom === 'function') {
      window.MFG_I18N.translateDom(bar);
    }
    const modal = $('entryModal');
    if (modal) {
      const scanActive = Boolean(SCAN_STATE.busy || SCAN_STATE.lastScan || SCAN_STATE.pendingPrecheckBundle || SCAN_STATE.sampleMenuOpen || hasActiveSlipQueue());
      const prevAuto = Boolean(modal._mobScanAutoExpanded);
      modal._mobScanAutoExpanded = scanActive;
      if (scanActive && !prevAuto) {
        modal.classList.add('mob-ai-scan-open');
        modal.classList.remove('mob-ai-voice-open');
      } else if (!scanActive && prevAuto) {
        modal.classList.remove('mob-ai-scan-open');
      }
      syncEntryMobAiQuickBarUi(modal);
    }
    syncMobAiStepPills();
  }

  function syncEntryMobAiQuickBarUi(modal) {
    const qBar = $('entryMobAiQuickBar');
    if (!qBar || !modal) return;
    const scanOpen = modal.classList.contains('mob-ai-scan-open');
    const voiceOpen = modal.classList.contains('mob-ai-voice-open');
    const sBtn = qBar.querySelector('[data-mob-ai="scan"]');
    const vBtn = qBar.querySelector('[data-mob-ai="voice"]');
    if (sBtn) {
      sBtn.classList.toggle('is-open', scanOpen);
      sBtn.setAttribute('aria-expanded', scanOpen ? 'true' : 'false');
    }
    if (vBtn) {
      vBtn.classList.toggle('is-open', voiceOpen);
      vBtn.setAttribute('aria-expanded', voiceOpen ? 'true' : 'false');
    }
    syncMobAiStepPills();
  }

  function wireSmartScanBarEvents(bar) {
    const { fInp, cInp } = ensureGlobalFileInputs();
    const upBtn = bar.querySelector('#ssUploadBtn');
    if (upBtn) upBtn.addEventListener('click', e => { e.stopPropagation(); fInp.click(); });
    const camBtn = bar.querySelector('#ssCameraBtn');
    if (camBtn) {
      camBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (D && typeof D.openDocumentCameraCapture === 'function') {
          D.openDocumentCameraCapture(async (captured, method, camOpts) => {
            const list = Array.isArray(captured) ? captured : (captured && captured.length ? Array.from(captured) : (captured ? [captured] : []));
            if (!list.length) return;
            await scanFileOrAttachment(list, method || 'Live Camera Smart Scan', camOpts || {});
          }, { enablePrecheck: true });
        } else {
          cInp.click();
        }
      });
    }

    const smpBtn = bar.querySelector('#ssSampleBtn');
    if (smpBtn) {
      smpBtn.addEventListener('click', e => {
        e.stopPropagation();
        SCAN_STATE.sampleMenuOpen = !SCAN_STATE.sampleMenuOpen;
        renderSmartScanBarDom();
      });
    }

    bar.querySelectorAll('[data-ss-sample]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const sid = btn.getAttribute('data-ss-sample');
        await runSampleScanById(sid);
      });
    });

    const splitDeptBtn = bar.querySelector('#ssSplitMultiDeptBtn');
    if (splitDeptBtn) {
      splitDeptBtn.addEventListener('click', e => {
        e.stopPropagation();
        const sc = SCAN_STATE.lastScan;
        if (!sc || !sc.parsed || !window.MFG_AI_EDGE || typeof window.MFG_AI_EDGE.openBatchIntakeModal !== 'function') return;
        const items = Array.isArray(sc.parsed.lineItems) ? sc.parsed.lineItems : [];
        const supName = (sc.matched && sc.matched.supplier) || sc.parsed.supplier || 'General Vendor';
        const rowDt = sc.parsed.date || ((D && typeof D.todayISO === 'function') ? D.todayISO() : '2026-11-06');
        const effectiveItems = items.length ? items : [{
          description: sc.parsed.summary || sc.parsed.description || 'Monthly Supplier Invoice',
          qty: 1,
          unitCost: Number(sc.parsed.subtotalExVat > 0 ? sc.parsed.subtotalExVat : (sc.parsed.totalAmount || 0)),
          lineTotal: Number(sc.parsed.subtotalExVat > 0 ? sc.parsed.subtotalExVat : (sc.parsed.totalAmount || 0))
        }];
        const sumLines = effectiveItems.reduce((s, it) => s + Number(it.lineTotal || (Number(it.qty || 1) * Number(it.unitCost || 0))), 0);
        const hasTaxedExtra = Boolean(sc.parsed.vatAmount > 0 && sc.parsed.totalAmount > 0 && (sc.parsed.subtotalExVat > 0 ? Math.abs(sumLines - sc.parsed.subtotalExVat) <= 1 : (sc.parsed.totalAmount - sumLines) > 0.5));
        const preparsedRows = effectiveItems.map(it => {
          const q = Number(it.qty || 1) || 1;
          const up = Number(it.unitCost || 0) || (q > 0 ? Number(it.lineTotal || 0) / q : 0);
          return {
            date: rowDt,
            description: it.description || 'Invoice Item',
            counterparty: supName,
            qty: q,
            unitPrice: up
          };
        });
        window.MFG_AI_EDGE.openBatchIntakeModal('', {
          preparsedRows,
          applyVat11: hasTaxedExtra,
          invoiceTotal: Number(sc.parsed.totalAmount || 0),
          supplier: supName,
          date: rowDt,
          ref: sc.parsed.reference || '',
          attObj: sc.attObj || null
        });
      });
    }

    const splitBtn = bar.querySelector('#ssToggleSplitBtn');
    if (splitBtn) {
      splitBtn.addEventListener('click', e => {
        e.stopPropagation();
        SCAN_STATE.splitOpen = !SCAN_STATE.splitOpen;
        syncSplitPreviewDom();
        renderSmartScanBarDom();
      });
    }

    const clrBtn = bar.querySelector('#ssClearScanBtn');
    if (clrBtn) {
      clrBtn.addEventListener('click', e => {
        e.stopPropagation();
        resetModalState();
        renderSmartScanBarDom();
      });
    }

    bar.querySelectorAll('[data-ss-switch-form]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const nextForm = btn.getAttribute('data-ss-switch-form');
        if (nextForm && SCAN_STATE.lastScan) {
          await applyScanToModal(SCAN_STATE.lastScan, nextForm);
        }
      });
    });

    bar.querySelectorAll('[data-ss-reg-item]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const itemName = btn.getAttribute('data-ss-reg-item') || '';
        const rowIdx = Number(btn.getAttribute('data-ss-reg-row') || 0);
        if (D && typeof D.openQuickExpenseCatalogDrawer === 'function') {
          D.openQuickExpenseCatalogDrawer(itemName, rowIdx);
        }
      });
    });

    const preApplyBtn = bar.querySelector('#ssPrecheckApplyBtn');
    if (preApplyBtn) {
      preApplyBtn.addEventListener('click', async e => {
        e.stopPropagation();
        const b = SCAN_STATE.pendingPrecheckBundle;
        SCAN_STATE.pendingPrecheckBundle = null;
        if (b) {
          if (hasActiveSlipQueue()) {
            const curIt = getActiveQueueItem();
            if (curIt && b.precheck && b.precheck.warnSig) {
              curIt.precheckAck = true;
              curIt.precheckAckSig = b.precheck.warnSig;
            }
          }
          restoreRawParsedForUnoverriddenWarnings(b, b.precheck && b.precheck.partyWarnings, null);
          const qOptsPre = hasActiveSlipQueue()
            ? { queueManualAttachments: (getActiveQueueItem() && Array.isArray(getActiveQueueItem().manualEntryAttachments)) ? getActiveQueueItem().manualEntryAttachments : [] }
            : {};
          await applyScanToModal(b, null, qOptsPre);
          if (b.blockedByRbac) return;
          notifyScanApplyOutcome(b, Number((b.parsed && b.parsed.pageCount) || 1));
        }
      });
    }
    const preSkipBtn = bar.querySelector('#ssPrecheckSkipBtn');
    if (preSkipBtn) {
      preSkipBtn.addEventListener('click', async e => {
        e.stopPropagation();
        SCAN_STATE.pendingPrecheckBundle = null;
        await skipCurrentQueueSlip();
      });
    }
    const preDisBtn = bar.querySelector('#ssPrecheckDiscardBtn');
    if (preDisBtn) {
      preDisBtn.addEventListener('click', e => {
        e.stopPropagation();
        SCAN_STATE.pendingPrecheckBundle = null;
        SCAN_STATE.lastScan = null;
        renderSmartScanBarDom();
        if (D && D.toast) D.toast('Scan discarded during pre-check; form fields unchanged.', 'ok');
      });
    }
    bar.querySelectorAll('[data-ss-precheck-use]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const b = SCAN_STATE.pendingPrecheckBundle;
        const idx = Number(btn.getAttribute('data-ss-precheck-use'));
        const pw = b && b.precheck && (b.precheck.partyWarnings || [])[idx];
        if (!b || !pw) return;
        applyPrecheckOverrideToBundle(b, pw.targetKey, pw.suggested);
        const nextPre = evaluateScanPrecheck(b);
        if (hasActiveSlipQueue()) {
          const curIt = getActiveQueueItem();
          if (curIt) {
            curIt.precheck = nextPre;
            curIt.precheckOverrides = curIt.precheckOverrides || {};
            curIt.precheckOverrides[pw.targetKey] = pw.suggested;
          }
        }
        if (nextPre.hasWarning) {
          b.precheck = nextPre;
          renderSmartScanBarDom();
        } else {
          SCAN_STATE.pendingPrecheckBundle = null;
          const qOptsPreUse = hasActiveSlipQueue()
            ? { queueManualAttachments: (getActiveQueueItem() && Array.isArray(getActiveQueueItem().manualEntryAttachments)) ? getActiveQueueItem().manualEntryAttachments : [] }
            : {};
          await applyScanToModal(b, null, qOptsPreUse);
          if (b.blockedByRbac) return;
          notifyScanApplyOutcome(b, Number((b.parsed && b.parsed.pageCount) || 1));
        }
      });
    });
  }

  function mountOnEntryModal() {
    if (!D) return;
    const body = $('modalBody');
    const modal = $('entryModal');
    if (!body || !modal) return;

    const isEditing = Boolean(
      D.STATE.editingRecord ||
      D.STATE.editingPendingExpenseId ||
      D.STATE.editingPendingRawId ||
      D.STATE.editingPendingSalaryId
    );
    const form = D.STATE.modalForm || 'sales';
    const isUniv = ['customer', 'supplier', 'product', 'item', 'expensecategory', 'site', 'region', 'equipment', 'driver', 'staff', 'staffrole', 'fxrate', 'vatrate', 'currency'].includes(form);

    // Header button in #entryModal .modal-header-actions
    const hdrActs = modal.querySelector('.modal-header-actions');
    if (hdrActs) {
      let hdrBtn = $('modalHdrSmartScanBtn');
      if (!hdrBtn) {
        hdrBtn = document.createElement('button');
        hdrBtn.type = 'button';
        hdrBtn.id = 'modalHdrSmartScanBtn';
        hdrBtn.className = 'btn-ghost-bar modal-hdr-act-btn modal-hdr-scan-btn';
        hdrBtn.innerHTML = `${ic('camera')} <span>Smart Scan</span>`;
        hdrBtn.addEventListener('click', () => {
          const { fInp } = ensureGlobalFileInputs();
          fInp.click();
        });
        hdrActs.insertBefore(hdrBtn, hdrActs.firstChild);
      }
      hdrBtn.hidden = isEditing || isUniv;
    }

    if (isEditing || isUniv) {
      const oldBar = $('entrySmartScanBar');
      if (oldBar) oldBar.remove();
      const oldQuick = $('entryMobAiQuickBar');
      if (oldQuick) oldQuick.remove();
      modal.classList.remove('mob-ai-scan-open', 'mob-ai-voice-open');
      modal._mobScanAutoExpanded = false;
      if (window.MFG_AI_EDGE) {
        if (typeof window.MFG_AI_EDGE.stopVoiceCapture === 'function') window.MFG_AI_EDGE.stopVoiceCapture();
        if (typeof window.MFG_AI_EDGE.clearVoicePrompt === 'function') window.MFG_AI_EDGE.clearVoicePrompt(false);
      }
      unwrapSplitPreviewDom();
      return;
    }

    if (!SCAN_STATE.suppressResetOnModalSwitch && !SCAN_STATE.lastScan && !SCAN_STATE.busy && !SCAN_STATE.sampleMenuOpen) {
      modal.classList.remove('mob-ai-scan-open');
      modal._mobScanAutoExpanded = false;
    }

    let quickBar = $('entryMobAiQuickBar');
    if (!quickBar) {
      quickBar = document.createElement('div');
      quickBar.id = 'entryMobAiQuickBar';
      quickBar.className = 'mob-ai-quick-bar no-print';
      quickBar.innerHTML = `
        <span class="mob-ai-qhint">${ic('sparkles')} <span>AI Auto-Fill · Drop or paste a slip or PDF anywhere</span></span>
        <button type="button" class="mob-ai-qbtn" data-mob-ai="scan" aria-expanded="false">${ic('camera')} <span>Scan Slip / PDF</span><span class="ss-qbar-step-pill" id="entryMobAiStepPill" hidden></span></button>
        <button type="button" class="mob-ai-qbtn" data-mob-ai="voice" aria-expanded="false">${ic('mic')} <span>Voice Fill</span></button>
        <button type="button" class="mob-ai-qbtn" data-mob-ai="batch">${ic('bolt')} <span>Batch Table</span></button>
      `;
      quickBar.querySelectorAll('[data-mob-ai]').forEach(btn => btn.addEventListener('click', e => {
        e.stopPropagation();
        const mode = btn.getAttribute('data-mob-ai');
        if (mode === 'scan') {
          const next = !modal.classList.contains('mob-ai-scan-open');
          modal.classList.toggle('mob-ai-scan-open', next);
          if (next) modal.classList.remove('mob-ai-voice-open');
          syncEntryMobAiQuickBarUi(modal);
        } else if (mode === 'voice') {
          const next = !modal.classList.contains('mob-ai-voice-open');
          modal.classList.toggle('mob-ai-voice-open', next);
          if (next) {
            modal.classList.remove('mob-ai-scan-open');
            const vInp = $('aieMfgVoicePromptInput');
            if (vInp) setTimeout(() => { try { vInp.focus(); } catch (_) {} }, 30);
          }
          syncEntryMobAiQuickBarUi(modal);
        } else if (mode === 'batch') {
          const batchBtn = $('aieMfgOpenBatchBtn');
          if (batchBtn) batchBtn.click();
        }
      }));
      body.insertBefore(quickBar, body.firstChild);
    } else if (quickBar.parentElement !== body || body.firstElementChild !== quickBar) {
      body.insertBefore(quickBar, body.firstChild);
    }
    syncEntryMobAiQuickBarUi(modal);

    let bar = $('entrySmartScanBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'entrySmartScanBar';
      bar.className = 'entry-smart-scan-bar';
      body.insertBefore(bar, quickBar.nextSibling);
    } else if (bar.parentElement !== body || bar.previousElementSibling !== quickBar) {
      body.insertBefore(bar, quickBar.nextSibling);
    }

    renderSmartScanBarDom();
    if (window.MFG_I18N && typeof window.MFG_I18N.translateDom === 'function' && window.MFG_I18N.getLang && window.MFG_I18N.getLang() !== 'en') {
      try { window.MFG_I18N.translateDom(quickBar); } catch (_) {}
    }

    // Drag & Drop on #entryModal (wired once; no-op in edit/universal modes where #entrySmartScanBar is absent)
    if (modal.dataset.ssDropWired !== '1') {
      modal.dataset.ssDropWired = '1';
      modal.addEventListener('dragover', e => {
        const b = $('entrySmartScanBar');
        if (modal.hidden || !b) return;
        if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
          e.preventDefault();
          b.classList.add('is-dragover');
        }
      });
      modal.addEventListener('dragleave', e => {
        const b = $('entrySmartScanBar');
        if (b && (e.target === modal || e.target === b)) {
          b.classList.remove('is-dragover');
        }
      });
      modal.addEventListener('drop', async e => {
        const b = $('entrySmartScanBar');
        if (b) b.classList.remove('is-dragover');
        if (modal.hidden || !b) return;
        if (e.target && e.target.closest && e.target.closest('#entryAttachmentsBox')) return;
        const files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length) {
          e.preventDefault();
          e.stopPropagation();
          await scanFileOrAttachment(Array.from(files), 'Drag & Drop Smart Scan');
        }
      });
    }

    // Keep scrollTop at 0px on open
    body.scrollTop = 0;
  }

  function resetModalState(opts) {
    if (SCAN_STATE.suppressResetOnModalSwitch) return;
    const preserveVoice = Boolean(opts && opts.preserveVoice);
    SCAN_STATE.entryScanGen = (SCAN_STATE.entryScanGen || 0) + 1;
    SCAN_STATE.busy = false;
    SCAN_STATE.progressMsg = '';
    SCAN_STATE.lastScan = null;
    SCAN_STATE.pendingPrecheckBundle = null;
    SCAN_STATE.pendingDomainPrecheck = null;
    SCAN_STATE.splitOpen = false;
    SCAN_STATE.sampleMenuOpen = false;
    SCAN_STATE.imgRotateDeg = 0;
    if (!SCAN_STATE.advancingQueueOnPost && !preserveVoice) {
      SCAN_STATE.slipQueue = null;
      SCAN_STATE.lastMultiUnits = null;
      syncMobAiStepPills();
    }
    const modalEl = $('entryModal');
    if (modalEl) {
      modalEl._mobScanAutoExpanded = false;
      modalEl.classList.remove('mob-ai-scan-open');
      if (!preserveVoice) modalEl.classList.remove('mob-ai-voice-open');
      syncEntryMobAiQuickBarUi(modalEl);
    }
    unwrapSplitPreviewDom();
    const body = $('modalBody');
    if (body) {
      body.querySelectorAll('.ss-ai-badge').forEach(b => b.remove());
      body.querySelectorAll('.ss-field-filled, .ss-field-check').forEach(w => {
        w.classList.remove('ss-field-filled', 'ss-field-check');
      });
    }
  }

  function resetDomainScanState(opts) {
    if (SCAN_STATE.suppressDomResetOnSwitch) return;
    SCAN_STATE.domScanGen = (SCAN_STATE.domScanGen || 0) + 1;
    SCAN_STATE.domBusy = false;
    SCAN_STATE.pendingDomainPrecheck = null;
    const oldBanner = $('indEntryPrecheckBanner');
    if (oldBanner) oldBanner.remove();
    if (opts && opts.fromClose && !SCAN_STATE.advancingQueueOnPost) {
      SCAN_STATE.slipQueue = null;
      SCAN_STATE.lastMultiUnits = null;
      syncMobAiStepPills();
    }
  }

  // ==================== TOPBAR & DOCUMENT VAULT BUTTONS ====================
  function openSmartScanEntryDesk(triggerPicker = false) {
    if (!D) return;
    const modal = $('entryModal');
    const domModal = $('indDomainEntryModal');
    if (triggerPicker && (!modal || modal.hidden) && domModal && !domModal.hidden) {
      const domInp = $('indEntryScanFileInput');
      if (domInp) {
        domInp.click();
        return;
      }
    }
    if (!modal || modal.hidden) {
      const curIndDesk = D.getActiveIndustry ? D.getActiveIndustry(D.STATE.company) : 'Manufacturing';
      const form = (D.contextFormForView && D.contextFormForView(D.STATE.view)) || 'expense';
      const safeForm = (!isBlockedFormForInd(form, curIndDesk) && (!D.canEnterForm || D.canEnterForm(form)))
        ? form
        : (['expense', 'document', 'external', 'sales'].find(f => !isBlockedFormForInd(f, curIndDesk) && (!D.canEnterForm || D.canEnterForm(f))) || 'expense');
      D.openEntryModal(safeForm);
    }
    if (triggerPicker) {
      const { fInp } = ensureGlobalFileInputs();
      fInp.click();
    }
  }

  function mountTopbarButtons() {
    const newBtn = $('newEntryBtn');
    if (newBtn && newBtn.parentElement && !$('topbarSmartScanBtn')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'topbarSmartScanBtn';
      btn.className = 'topbar-smart-scan-btn desktop-tool-btn';
      btn.setAttribute('aria-label', 'Smart Scan Document to New Entry');
      btn.setAttribute('data-ui-tip', 'Smart Scan any invoice, receipt, PDF, photo, or slip to auto-select the right entry tab and fill fields');
      btn.innerHTML = `${ic('camera')}<span class="ss-top-lbl">Smart Scan</span>`;
      btn.addEventListener('click', e => {
        openSmartScanEntryDesk(Boolean(e && e.isTrusted));
      });
      newBtn.parentElement.insertBefore(btn, newBtn);
    }

    const mobNewBtn = $('mobileNewEntryBtn');
    if (mobNewBtn && mobNewBtn.parentElement && !$('mobileSmartScanBtn')) {
      const mBtn = document.createElement('button');
      mBtn.type = 'button';
      mBtn.id = 'mobileSmartScanBtn';
      mBtn.className = 'topbar-smart-scan-btn';
      mBtn.setAttribute('aria-label', 'Smart Scan');
      mBtn.innerHTML = ic('camera');
      mBtn.addEventListener('click', e => {
        openSmartScanEntryDesk(Boolean(e && e.isTrusted));
      });
      mobNewBtn.parentElement.insertBefore(mBtn, mobNewBtn);
    }
  }

  function syncWorkspaceButtons() {
    mountTopbarButtons();
    const canAnyEntry = D && D.canEnterForm
      ? ['expense', 'sales', 'raw', 'receipt', 'settlement', 'fuel', 'document'].some(f => D.canEnterForm(f))
      : true;
    const topBtn = $('topbarSmartScanBtn');
    if (topBtn) topBtn.hidden = !canAnyEntry;
    const mobBtn = $('mobileSmartScanBtn');
    if (mobBtn) mobBtn.hidden = !canAnyEntry;

    // Document Vault quick dropzone button
    const dzActs = document.querySelector('#docVaultQuickDropzone .doc-vault-dz-actions');
    if (dzActs && canAnyEntry && !$('docVaultSmartScanBtn')) {
      const vBtn = document.createElement('button');
      vBtn.type = 'button';
      vBtn.id = 'docVaultSmartScanBtn';
      vBtn.className = 'btn btn-outline-bar';
      vBtn.style.borderColor = 'rgba(192,137,47,0.55)';
      vBtn.innerHTML = `${ic('bolt')} Scan &amp; Auto-Fill Entry`;
      vBtn.addEventListener('click', () => {
        const { fInp } = ensureGlobalFileInputs();
        fInp.click();
      });
      dzActs.insertBefore(vBtn, dzActs.firstChild);
    }
  }

  function mountOnDocumentPreviewModal(docOrAtt, contextMeta) {
    const modal = $('docPreviewModal');
    if (!modal || !docOrAtt) return;
    const hdrActs = modal.querySelector('.modal-header-actions');
    if (!hdrActs) return;
    let btn = $('docPrevSmartScanBtn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'docPrevSmartScanBtn';
      btn.className = 'btn btn-outline-bar btn-sm';
      btn.style.borderColor = 'rgba(192,137,47,0.55)';
      btn.innerHTML = `${ic('bolt')} Auto-Fill Entry from Scan`;
      hdrActs.insertBefore(btn, hdrActs.firstChild);
    }
    const mergedDoc = Object.assign({}, contextMeta || {}, docOrAtt);
    btn.onclick = async () => {
      modal.hidden = true;
      await scanFileOrAttachment(mergedDoc, 'Document Vault Smart Scan');
    };
  }


  const DOMAIN_SAMPLE_SCANS = [
    {
      id: 'dom_ins_policy',
      ind: 'Insurance & Brokerage',
      formKey: 'ins_policies',
      company: 'Insurance Company',
      label: 'Insurance · Commercial Fleet Policy Schedule (MedGulf)',
      fileName: 'MedGulf_Fleet_Policy_POL_2026_991.svg',
      fields: {
        ide_id: 'POL-2026-991',
        ide_type: 'Policy (New)',
        ide_date: '2026-10-30',
        ide_expiry: '2027-10-29',
        ide_client: 'Holdal Abou Adal Group',
        ide_carrier: 'MedGulf',
        ide_line: 'MOT · Motor',
        ide_product: 'Comprehensive Fleet All-Risk Cover',
        ide_sum_insured: '650000',
        ide_gwp: '18500',
        ide_rate: '15',
        ide_discount: '250',
        ide_fee: '45',
        ide_producer: 'Joseph Khalil'
      }
    },
    {
      id: 'dom_re_lease',
      ind: 'Real Estate & Property',
      formKey: 're_leases',
      company: '4235 Company S.A.L',
      label: 'Real Estate · Commercial Lease Contract 4235 (11% VAT)',
      fileName: '4235_Commercial_Lease_LSE_2026_992.svg',
      fields: {
        ide_id: 'LSE-4235-992',
        ide_property: '4235 Msaytbeh Commercial Center',
        ide_unit: 'Floor 4 Medical Suite (260 m2)',
        ide_tenant: 'Cedar Pharmacy',
        ide_start_date: '2026-11-01',
        ide_end_date: '2029-10-31',
        ide_freq: 'Quarterly',
        ide_net: '14000',
        ide_deposit: '14000',
        ide_escalation: '3-Yr Commercial (+8% Yr 4)'
      }
    },
    {
      id: 'dom_trd_vin',
      ind: 'Automotive & Heavy Trading',
      formKey: 'trd_sales',
      company: 'Shacman',
      label: 'Automotive & Trading · Shacman X3000 17-Char VIN Dossier',
      fileName: 'Shacman_X3000_VIN_Dossier_993.svg',
      fields: {
        ide_id: 'INV-TRD-993',
        ide_date: '2026-10-30',
        ide_stream: 'Serial Unit (VIN)',
        ide_customer: 'Bekaa Heavy Haulage Co.',
        ide_item: 'Shacman X3000 6x4 Tractor Head',
        ide_model: 'Shacman X3000 6x4 Tractor Head',
        ide_chassis: 'LZGJLDR45PX019288',
        ide_vin: 'LZGJLDR45PX019288',
        ide_qty: '1',
        ide_net: '82000',
        ide_price: '82000',
        ide_cost: '67500'
      }
    },
    {
      id: 'dom_hsp_closing',
      ind: 'Hospitality & Resorts',
      formKey: 'hsp_revenue',
      company: 'Blanca',
      label: 'Hospitality · Blanca Beach Deck Daily Venue Closing',
      fileName: 'Blanca_Beach_Deck_Closing_994.svg',
      fields: {
        ide_id: 'REV-HSP-994',
        ide_date: '2026-10-30',
        ide_outlet: 'Beach Deck & Cabanas',
        ide_category: 'Chalet Rental',
        ide_rooms: '6',
        ide_covers: '28',
        ide_tot: '5550',
        ide_method: 'Cash & Card',
        ide_notes: 'AI Smart Scan verified Z-close'
      }
    },
    {
      id: 'dom_hld_ic',
      ind: 'Holding & Treasury',
      formKey: 'hld_interactions',
      company: 'Bdeir Holding',
      label: 'Holding & Treasury · Intercompany Sister Wire Advice',
      fileName: 'Holding_Intercompany_Wire_995.svg',
      fields: {
        ide_id: 'IC-HLD-995',
        ide_date: '2026-10-30',
        ide_from: 'Bdeir Holding',
        ide_to: 'WTC',
        ide_usd: '45000',
        ide_method: 'Bank Transfer',
        ide_notes: 'Bilateral sister treasury clearing advice'
      }
    }
  ];

  function resolveRlsSafeDomainCompany(requestedCo, ind) {
    if (!D || typeof D.allowedCompanyNames !== 'function') return requestedCo || 'Bdeir Holding';
    const allowed = D.allowedCompanyNames() || [];
    if (!allowed.length) return requestedCo || 'Bdeir Holding';
    const reqHit = requestedCo
      ? allowed.find(a => String(a || '').toLowerCase() === String(requestedCo || '').toLowerCase())
      : '';
    if (reqHit) {
      if (!ind || !D.getActiveIndustry || !D.COMPANY_KEY_BY_NAME) return reqHit;
      const reqKey = D.COMPANY_KEY_BY_NAME[reqHit];
      const reqInd = reqKey ? D.getActiveIndustry(reqKey) : '';
      if (!reqInd || reqInd === ind) return reqHit;
    }
    if (ind && D.getActiveIndustry && D.COMPANY_KEY_BY_NAME) {
      const indHit = allowed.find(a => {
        const ak = D.COMPANY_KEY_BY_NAME[a];
        return ak && D.getActiveIndustry(ak) === ind;
      });
      if (indHit) return indHit;
    }
    return reqHit || allowed[0] || requestedCo || 'Bdeir Holding';
  }

  // Deterministic Cross-Page Domain Bundle Parser across all 5 Domain-Modal Industries & 26 Forms (1..N Pages)
  function deterministicParseDomainBundle(pageEntries, combinedText, curSpec, primaryFileName) {
    const cleanAll = normalizeDigits(String(combinedText || '')).replace(/\r/g, '');
    if (cleanAll.trim().length < 10 && !extractVin17CandidateFromText(primaryFileName || '')) return null;

    // Never classify explicit Manufacturing quarry/concrete/weighbridge/crusher operational slips as domain-modal forms
    if (/\b(?:WTC|BBConstruction|Lions\s*Transport)\b/i.test(cleanAll) && !/from\s*(?:sister\s*)?entity\s*:/i.test(cleanAll)) {
      return null;
    }
    if (/\b(?:Ready\s*Mix\s*Concrete|Weighbridge\s*Ticket|Crusher\s*Run|Quarrying|Mixer\s*Truck|M3\b)/i.test(cleanAll)
      && !/(?:policy\s*(?:no|#)|lease\s*agreement|commercial\s*lease|ocean\s*b\/?l|bill\s*of\s*lading|pos\s*z-?close)/i.test(cleanAll)) {
      return null;
    }

    const perPageLines = (pageEntries || []).map(pe =>
      normalizeDigits(String((pe && pe.text) || '')).replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean)
    );
    const allLines = cleanAll.split('\n').map(l => l.trim()).filter(Boolean);

    const findFirstLabel = rx => {
      for (const pLines of perPageLines) {
        const v = extractLabeledValue(pLines, rx);
        if (v) return v;
      }
      return extractLabeledValue(allLines, rx);
    };
    const findLastMoneyLabel = rx => {
      for (let pIdx = perPageLines.length - 1; pIdx >= 0; pIdx--) {
        const pLines = perPageLines[pIdx];
        for (let i = pLines.length - 1; i >= 0; i--) {
          const m = pLines[i].match(rx);
          if (m) {
            const mv = parseMoneyValue(m[1] != null ? m[1] : pLines[i]);
            if (mv >= 0 && /\d/.test(String(m[1] != null ? m[1] : pLines[i]))) return mv;
          }
        }
      }
      for (let i = allLines.length - 1; i >= 0; i--) {
        const m = allLines[i].match(rx);
        if (m) {
          const mv = parseMoneyValue(m[1] != null ? m[1] : allLines[i]);
          if (mv >= 0 && /\d/.test(String(m[1] != null ? m[1] : allLines[i]))) return mv;
        }
      }
      return null;
    };
    const findIsoDateByLabel = rx => {
      const raw = findFirstLabel(rx);
      return raw ? parseDocumentDateISO(raw) : '';
    };

    const companyRaw = findFirstLabel(/^(?:company|entity|subsidiary)\s*:\s*(.+)$/i)
      || findFirstLabel(/^(?:landlord|lessor|broker|seller|resort(?:\s*property)?|trading\s*entity)\s*:\s*(.+)$/i)
      || (/4235\s*company/i.test(cleanAll) ? '4235 Company S.A.L'
        : (/\bproperties\b/i.test(cleanAll) && /lease|rent|tenant|work\s*order/i.test(cleanAll) ? 'Properties'
          : (/insurance\s*company|\b(?:pol|clm|rem|agr)-\d/i.test(cleanAll) ? 'Insurance Company'
            : (/\bshacman\b|\bimp-sh\b|\bsu-sh\b/i.test(cleanAll) ? 'Shacman'
              : (/\bkorri\s*auto\b|\bsu-ka\b/i.test(cleanAll) ? 'Korri Auto'
                : (/\bblanca\b/i.test(cleanAll) ? 'Blanca'
                  : (/\bla\s*una\b/i.test(cleanAll) ? 'La Una'
                    : (/\bpalms\b/i.test(cleanAll) && /resort|chalet|cabana|pos|membership|venue/i.test(cleanAll) ? 'Palms'
                      : (/\bvoile\b/i.test(cleanAll) && /resort|chalet|cabana|pos|membership|venue/i.test(cleanAll) ? 'Voile'
                        : (/\bplatinum\b/i.test(cleanAll) && /resort|chalet|cabana|pos|membership|venue/i.test(cleanAll) ? 'Platinum'
                          : (/bdeir\s*holding|holding\s*&\s*treasury|\b(?:ic-hld|ln-hld)\b/i.test(cleanAll) ? 'Bdeir Holding' : '')))))))))));

    const fields = {};
    const docId = findFirstLabel(/^(?:(?:lease|policy|endorsement|claim|remittance|agreement|invoice|import\s*file|unit\s*stock|voucher|transfer|contract|slip|work\s*order|facility|instalment)\s*(?:no|#|id)?|ref(?:erence)?)\s*[:#-]?\s*([A-Za-z0-9/_-]{3,36})/i)
      || ((cleanAll.match(/\b(?:POL|END|ALZ|MGF|BNK|AXA|CLM|REM|AGR|LSE|WO|INV-4235|INV-PROP|INV-TRD|RCT-4235|RCT-PROP|RCT-TRD|IMP-TRD|IMP-SH|SU-SH|SU-KA|STK-TRD|REV-HSP|POS-CL|MEM-2026|IC-HLD|IC-2026|LN-HLD)-[A-Z0-9-]{2,24}\b/i) || [])[0] || '');
    if (docId) fields.ide_id = docId;
    if (/^(?:RCT|INV|COL|PRM|TRN|REF|4235)/i.test(docId || '')) fields.ide_ref = docId;

    const issueDate = findIsoDateByLabel(/^(?:(?:invoice|issue|policy|effective|loss|arrival|operating|close|transfer|agreement|order|receipt|settlement)\s*date|date)\s*:\s*(.+)$/i) || parseDocumentDateISO(cleanAll);
    if (issueDate) fields.ide_date = issueDate;

    const startDate = findIsoDateByLabel(/^(?:(?:lease\s*)?start\s*date|commencement(?:\s*date)?|effective\s*from(?:\s*date)?|valid\s*from)\s*:\s*(.+)$/i);
    if (startDate) fields.ide_start_date = startDate;

    const endDate = findIsoDateByLabel(/^(?:(?:lease\s*)?end\s*date|termination(?:\s*date)?|expiry(?:\s*date)?|expiration(?:\s*date)?|valid\s*(?:to|until)|maturity(?:\s*date)?)\s*:\s*(.+)$/i);
    if (endDate) {
      fields.ide_end_date = endDate;
      fields.ide_expiry = endDate;
    }

    // ISO 3779 17-Char VIN extraction + stamped-metal disambiguation
    const rawVin = extractVin17CandidateFromText(cleanAll) || extractVin17CandidateFromText(primaryFileName || '');
    const vinAudit = rawVin ? validateAndDisambiguateVin17(rawVin, { fromScan: true }) : null;
    if (vinAudit && vinAudit.isVin17) {
      fields.ide_vin = vinAudit.clean;
      fields.ide_chassis = vinAudit.clean;
      fields.ide_qty = '1';
    }

    const specKey = String((curSpec && curSpec.key) || '');

    // 1. Real Estate & Property (re_leases, re_invoicing, re_receipts, re_sales, re_workorders)
    const propVal = findFirstLabel(/^(?:property|building|tower|center|plaza)\s*:\s*(.+)$/i);
    if (propVal) fields.ide_property = propVal;
    const unitVal = findFirstLabel(/^(?:unit|suite|leased\s*unit|floor(?:\s*\/?\s*suite)?|cabana|chalet)\s*:\s*(.+)$/i);
    if (unitVal) fields.ide_unit = unitVal;
    const tenantVal = findFirstLabel(/^(?:tenant(?:\s*\/\s*customer)?|lessee|occupant|rented\s*to)\s*:\s*(.+)$/i);
    if (tenantVal) fields.ide_tenant = tenantVal;
    const taxSeqVal = findFirstLabel(/^(?:tax\s*seq(?:uence)?|fiscal\s*seq(?:uence)?|vat\s*seq(?:uence)?)\s*[:#-]?\s*(.+)$/i);
    if (taxSeqVal) fields.ide_tax_seq = taxSeqVal;
    const periodVal = findFirstLabel(/^(?:billing\s*period|rent\s*period|period)\s*:\s*(.+)$/i);
    if (periodVal) fields.ide_period = periodVal;
    const freqVal = findFirstLabel(/^(?:billing\s*frequency|payment\s*frequency|rent\s*frequency|frequency)\s*:\s*(.+)$/i);
    if (freqVal) {
      if (/month/i.test(freqVal)) fields.ide_freq = 'Monthly';
      else if (/annual|year/i.test(freqVal)) fields.ide_freq = 'Annual';
      else if (/quarter/i.test(freqVal)) fields.ide_freq = 'Quarterly';
    }
    const netRent = findLastMoneyLabel(/^(?:period\s*net\s*rent|net\s*rent(?:\s*ex-?vat)?|base\s*rent|net\s*sale\s*amount|net\s*amount(?:\s*ex-?vat)?|subtotal(?:\s*ex-?vat)?)\s*[:$-]*\s*(.+)$/i);
    if (netRent !== null && netRent > 0) fields.ide_net = String(netRent);
    const vatVal = findLastMoneyLabel(/^(?:vat\s*(?:11%|amount)?|tva)\s*[:$-]*\s*(.+)$/i);
    if (vatVal !== null && vatVal >= 0) fields.ide_vat = String(vatVal);
    const depVal = findLastMoneyLabel(/^(?:security\s*deposit|deposit(?:\s*held)?)\s*[:$-]*\s*(.+)$/i);
    if (depVal !== null) fields.ide_deposit = String(depVal);
    const escVal = findFirstLabel(/^(?:escalation(?:\s*clause)?|rent\s*escalation|indexation)\s*:\s*(.+)$/i);
    if (escVal) fields.ide_escalation = escVal;
    const buyerVal = findFirstLabel(/^(?:buyer|purchaser)\s*:\s*(.+)$/i);
    if (buyerVal) fields.ide_buyer = buyerVal;
    const contractVal = findLastMoneyLabel(/^(?:contract\s*(?:value|price)|seasonal\s*contract)\s*[:$-]*\s*(.+)$/i);
    if (contractVal !== null && contractVal > 0) fields.ide_contract = String(contractVal);
    const paidVal = findLastMoneyLabel(/^(?:amount\s*(?:collected|paid)|paid\s*to\s*date)\s*[:$-]*\s*(.+)$/i);
    if (paidVal !== null) fields.ide_paid = String(paidVal);
    const contractorVal = findFirstLabel(/^(?:contractor|maintenance\s*vendor)\s*:\s*(.+)$/i);
    if (contractorVal) fields.ide_contractor = contractorVal;
    const budgetVal = findLastMoneyLabel(/^(?:estimated\s*budget|maintenance\s*budget|budget)\s*[:$-]*\s*(.+)$/i);
    if (budgetVal !== null && budgetVal >= 0) fields.ide_budget = String(budgetVal);
    const actualVal = findLastMoneyLabel(/^(?:actual\s*cost|final\s*cost)\s*[:$-]*\s*(.+)$/i);
    if (actualVal !== null && actualVal >= 0) fields.ide_actual = String(actualVal);
    const rechVal = findFirstLabel(/^(?:rechargeable(?:\s*to\s*tenant)?)\s*:\s*(.+)$/i);
    if (rechVal) fields.ide_rechargeable = /yes|true|1/i.test(rechVal) ? 'YES' : 'NO';
    const grossRecVal = findLastMoneyLabel(/^(?:gross\s*(?:receipt|collected|amount)|total\s*(?:collected|received))\s*[:$-]*\s*(.+)$/i);
    if (grossRecVal !== null && grossRecVal > 0) {
      fields.ide_gross = String(grossRecVal);
      fields.ide_collected = String(grossRecVal);
    }
    const allocRecVal = findLastMoneyLabel(/^(?:allocated\s*(?:amount|to\s*invoices?)|rent\s*allocated)\s*[:$-]*\s*(.+)$/i);
    if (allocRecVal !== null && allocRecVal >= 0) {
      fields.ide_allocated = String(allocRecVal);
      fields.ide_ins_allocated = String(allocRecVal);
      fields.ide_trd_allocated = String(allocRecVal);
    }

    // 2. Insurance & Brokerage (ins_policies, ins_billing, ins_claims, ins_agreements, ins_remittances)
    const clientVal = findFirstLabel(/^(?:policyholder|insured(?:\s*\/\s*customer)?|assured|client(?:\s*name)?)\s*:\s*(.+)$/i);
    if (clientVal) fields.ide_client = clientVal;
    const carrierVal = findFirstLabel(/^(?:carrier|insurer|underwriter|underwriting\s*carrier)\s*:\s*(.+)$/i);
    if (carrierVal) {
      if (/allianz/i.test(carrierVal)) fields.ide_carrier = 'Allianz SNA';
      else if (/medgulf/i.test(carrierVal)) fields.ide_carrier = 'MedGulf';
      else if (/bankers/i.test(carrierVal)) fields.ide_carrier = 'Bankers Assurance';
      else if (/axa/i.test(carrierVal)) fields.ide_carrier = 'AXA Middle East';
      else if (/libano/i.test(carrierVal)) fields.ide_carrier = 'Libano-Suisse';
      else if (/arope/i.test(carrierVal)) fields.ide_carrier = 'Arope Insurance';
      else fields.ide_carrier = carrierVal;
    }
    const lineVal = findFirstLabel(/^(?:line(?:\s*of\s*business)?|class\s*of\s*insurance|lob|branch)\s*:\s*(.+)$/i);
    if (lineVal) {
      if (/motor|fleet|auto|mot\b/i.test(lineVal)) fields.ide_line = 'MOT · Motor';
      else if (/med|health|hospital/i.test(lineVal)) fields.ide_line = 'MED · Medical';
      else if (/fire|property|prop\b|fir\b/i.test(lineVal)) fields.ide_line = 'PROP · Property';
      else if (/marine|cargo|mar\b/i.test(lineVal)) fields.ide_line = 'MAR · Marine';
      else if (/eng|car\b|all-?risk/i.test(lineVal)) fields.ide_line = 'ENG · Engineering';
      else if (/liab|lia\b/i.test(lineVal)) fields.ide_line = 'LIAB · Liability';
      else if (/workmen|wc\b/i.test(lineVal)) fields.ide_line = 'WC · Workmen Comp';
      else if (/life|lif\b/i.test(lineVal)) fields.ide_line = 'LIFE · Life';
      else fields.ide_line = lineVal;
    }
    const prodVal = findFirstLabel(/^(?:(?:policy\s*line\s*\/\s*)?product|cover(?:age)?|plan)\s*:\s*(.+)$/i);
    if (prodVal) fields.ide_product = prodVal;
    const producerVal = findFirstLabel(/^(?:producer|account\s*exec(?:utive)?|broker\s*rep)\s*:\s*(.+)$/i);
    if (producerVal) fields.ide_producer = producerVal;
    const polTypeVal = findFirstLabel(/^(?:transaction\s*type|policy\s*type|endorsement\s*type)\s*:\s*(.+)$/i);
    if (polTypeVal) {
      if (/endorse/i.test(polTypeVal)) fields.ide_type = 'Endorsement';
      else if (/renew/i.test(polTypeVal)) fields.ide_type = 'Renewal';
      else fields.ide_type = 'Policy (New)';
    }
    const sumIns = findLastMoneyLabel(/^(?:sum\s*insured|insured\s*value|limit\s*of\s*liability)\s*[:$-]*\s*(.+)$/i);
    if (sumIns !== null && sumIns > 0) fields.ide_sum_insured = String(sumIns);
    const gwpVal = findLastMoneyLabel(/^(?:gross\s*(?:written\s*)?premium|gwp|total\s*gross\s*premium|bordereau\s*gwp)\s*[:$-]*\s*(.+)$/i);
    if (gwpVal !== null && gwpVal > 0) fields.ide_gwp = String(gwpVal);
    const rateMatch = cleanAll.match(/(?:commission\s*rate|brokerage\s*rate|agreed\s*rate)\s*[:#-]?\s*(\d+(?:\.\d+)?)\s*%/i);
    if (rateMatch) fields.ide_rate = String(Number(rateMatch[1]));
    const newPctM = cleanAll.match(/(?:new\s*business\s*%)\s*[:#-]?\s*(\d+(?:\.\d+)?)/i);
    if (newPctM) fields.ide_new_pct = String(Number(newPctM[1]));
    const renPctM = cleanAll.match(/(?:renewal\s*%)\s*[:#-]?\s*(\d+(?:\.\d+)?)/i);
    if (renPctM) fields.ide_ren_pct = String(Number(renPctM[1]));
    const bonPctM = cleanAll.match(/(?:volume\s*bonus\s*%|bonus\s*%)\s*[:#-]?\s*(\d+(?:\.\d+)?)/i);
    if (bonPctM) fields.ide_bonus_pct = String(Number(bonPctM[1]));
    const discVal = findLastMoneyLabel(/^(?:client\s*(?:discount|rebate)|discount)\s*[:$-]*\s*(.+)$/i);
    if (discVal !== null) fields.ide_discount = String(discVal);
    const feeVal = findLastMoneyLabel(/^(?:policy\s*fee|admin(?:istration)?\s*fee|issuance\s*fee)\s*[:$-]*\s*(.+)$/i);
    if (feeVal !== null) fields.ide_fee = String(feeVal);
    const instVal = findFirstLabel(/^(?:instalment(?:\s*no)?|billing\s*phase)\s*:\s*(.+)$/i);
    if (instVal) fields.ide_instalment = instVal;
    const billedVal = findLastMoneyLabel(/^(?:billed\s*(?:amount|premium)|amount\s*billed)\s*[:$-]*\s*(.+)$/i);
    if (billedVal !== null && billedVal > 0) fields.ide_billed = String(billedVal);
    const remSettledVal = findLastMoneyLabel(/^(?:settled\s*(?:to\s*carrier|amount)|remitted\s*amount)\s*[:$-]*\s*(.+)$/i);
    if (remSettledVal !== null && remSettledVal >= 0) fields.ide_settled = String(remSettledVal);
    const commVal = findLastMoneyLabel(/^(?:brokerage\s*commission|net\s*commission|commission\s*deducted)\s*[:$-]*\s*(.+)$/i);
    if (commVal !== null && commVal >= 0) fields.ide_comm = String(commVal);
    const payableVal = findLastMoneyLabel(/^(?:net\s*payable(?:\s*to\s*carrier)?|carrier\s*payable)\s*[:$-]*\s*(.+)$/i);
    if (payableVal !== null && payableVal >= 0) fields.ide_payable = String(payableVal);

    // Claims fields
    const polRef = findFirstLabel(/^(?:policy\s*(?:no|#|number))\s*[:#-]?\s*([A-Za-z0-9_-]{4,32})/i);
    if (polRef) fields.ide_policy_no = polRef;
    const perilVal = findFirstLabel(/^(?:peril|cause\s*of\s*loss|incident)\s*:\s*(.+)$/i);
    if (perilVal) fields.ide_peril = perilVal;
    const adjVal = findFirstLabel(/^(?:adjuster|loss\s*adjuster|surveyor|expert)\s*:\s*(.+)$/i);
    if (adjVal) fields.ide_adjuster = adjVal;
    const claimedVal = findLastMoneyLabel(/^(?:claimed\s*amount|reserve\s*claimed|initial\s*claim)\s*[:$-]*\s*(.+)$/i);
    if (claimedVal !== null && claimedVal > 0) fields.ide_claimed = String(claimedVal);
    const dedVal = findLastMoneyLabel(/^(?:deductible|policy\s*excess|excess)\s*[:$-]*\s*(.+)$/i);
    if (dedVal !== null) fields.ide_deductible = String(dedVal);
    const apprVal = findLastMoneyLabel(/^(?:adjuster\s*approved|approved\s*(?:settlement|amount)|net\s*approved)\s*[:$-]*\s*(.+)$/i);
    if (apprVal !== null) fields.ide_approved = String(apprVal);

    // 3. Automotive & Heavy Trading (trd_targets, trd_sales, trd_receipts, trd_purchases, trd_trucks, trd_stock)
    const custVal = findFirstLabel(/^(?:customer|sold\s*to|bill\s*to)\s*:\s*(.+)$/i);
    if (custVal) fields.ide_customer = custVal;
    const modelVal = findFirstLabel(/^(?:vehicle\s*model|model|item\s*description|truck\s*model)\s*:\s*(.+)$/i);
    if (modelVal) {
      fields.ide_model = modelVal;
      fields.ide_item = modelVal;
      fields.ide_name = modelVal;
    }
    const famVal = findFirstLabel(/^(?:series|family)\s*:\s*(.+)$/i);
    if (famVal) fields.ide_family = famVal;
    const engVal = findFirstLabel(/^(?:engine\s*(?:serial|no|#))\s*[:#-]?\s*([A-Za-z0-9._-]{4,32})/i);
    if (engVal) fields.ide_engine = engVal;
    const supVal = findFirstLabel(/^(?:foreign\s*oem\s*supplier|oem\s*supplier|supplier|exporter)\s*:\s*(.+)$/i);
    if (supVal) fields.ide_supplier = supVal;
    const origVal = findFirstLabel(/^(?:port\s*of\s*origin|origin\s*port|port\s*of\s*loading)\s*:\s*(.+)$/i);
    if (origVal) fields.ide_origin = origVal;
    const whVal = findFirstLabel(/^(?:warehouse(?:\s*bay)?|yard|depot)\s*:\s*(.+)$/i);
    if (whVal) fields.ide_wh = whVal;
    const blVal = findFirstLabel(/^(?:bill\s*of\s*lading|ocean\s*b\/?l|container\s*\/?\s*b\/?l|b\/?l\s*(?:no|#))\s*[:#-]?\s*(.+)$/i);
    if (blVal) fields.ide_bl = blVal;
    const ordQtyM = cleanAll.match(/(?:ordered\s*qty|quantity\s*ordered)\s*[:#-]?\s*(\d+)/i);
    if (ordQtyM) fields.ide_ord_qty = ordQtyM[1];
    const recQtyM = cleanAll.match(/(?:received\s*qty|quantity\s*received|units\s*received)\s*[:#-]?\s*(\d+)/i);
    if (recQtyM) fields.ide_rec_qty = recQtyM[1];
    const incoDomM = findFirstLabel(/^(?:incoterm|incoterms|freight\s*terms|delivery\s*terms|shipping\s*terms)\s*[:#-]?\s*(.+)$/i)
      || cleanAll;
    const incoTokM = String(incoDomM || '').match(/\b(DDP|CIF|CFR|C\s*&\s*F|EXW|FCA|FOB)\b/i);
    if (incoTokM) {
      fields.ide_incoterm = incoTokM[1].toUpperCase().replace(/\s+/g, '').replace('C&F', 'CFR');
    }
    const fobVal = findLastMoneyLabel(/^(?:(?:supplier\s*)?(?:fob|cif|cfr|ddp|exw|fca|contract)\s*(?:cost|value|amount|price)|commercial\s*invoice\s*(?:fob|cif|cfr|total))\s*[:$-]*\s*(.+)$/i);
    if (fobVal !== null && fobVal > 0) fields.ide_fob = String(fobVal);
    const explicitAdd = findLastMoneyLabel(/^(?:allocated\s*landed\s*add|freight,?\s*customs\s*(?:&|and)\s*clearance|total\s*landed\s*add-?ons?)\s*[:$-]*\s*(.+)$/i);
    if (fields.ide_incoterm === 'DDP') {
      fields.ide_landed_add = '0';
    } else if (explicitAdd !== null) {
      fields.ide_landed_add = String(explicitAdd);
    } else {
      const freightV = (fields.ide_incoterm === 'CIF' || fields.ide_incoterm === 'CFR')
        ? 0
        : (findLastMoneyLabel(/^(?:ocean\s*freight|freight\s*charges?)\s*[:$-]*\s*(.+)$/i) || 0);
      const customsDutyV = findLastMoneyLabel(/^(?:customs\s*duty|import\s*duty|duties)\s*[:$-]*\s*(.+)$/i) || 0;
      const portClearV = findLastMoneyLabel(/^(?:port\s*(?:&|and)?\s*clearance|clearance(?:\s*(?:fee|fees|charges?))?|port\s*(?:fees?|charges?))\s*[:$-]*\s*(.+)$/i) || 0;
      const combinedCustomsV = (customsDutyV > 0 || portClearV > 0)
        ? round2(customsDutyV + portClearV)
        : (findLastMoneyLabel(/^(?:customs\s*(?:&|and)\s*clearance)\s*[:$-]*\s*(.+)$/i) || 0);
      if (freightV + combinedCustomsV > 0) {
        fields.ide_landed_add = String(round2(freightV + combinedCustomsV));
      } else if (fields.ide_incoterm === 'CIF' || fields.ide_incoterm === 'CFR') {
        fields.ide_landed_add = '0';
      }
    }
    const listVal = findLastMoneyLabel(/^(?:showroom\s*list\s*price|list\s*price|retail\s*price)\s*[:$-]*\s*(.+)$/i);
    if (listVal !== null && listVal > 0) {
      fields.ide_list = String(listVal);
      fields.ide_retail = String(listVal);
    }
    const costVal = findLastMoneyLabel(/^(?:capitalized\s*landed\s*cost|unit\s*landed\s*cost|cost\s*of\s*sale|wac\s*unit\s*cost)\s*[:$-]*\s*(.+)$/i);
    if (costVal !== null && costVal > 0) {
      fields.ide_cost = String(costVal);
      fields.ide_wac = String(costVal);
    }
    const skuCodeVal = findFirstLabel(/^(?:part\s*code|sku(?:\s*code)?|item\s*code)\s*[:#-]?\s*([A-Za-z0-9._-]{3,32})/i);
    if (skuCodeVal) fields.ide_code = skuCodeVal;
    const onHandM = cleanAll.match(/(?:on-?hand\s*qty|stock\s*on\s*hand)\s*[:#-]?\s*(\d+)/i);
    if (onHandM) fields.ide_on_hand = onHandM[1];
    const reorderM = cleanAll.match(/(?:reorder\s*point|min\s*stock)\s*[:#-]?\s*(\d+)/i);
    if (reorderM) fields.ide_reorder = reorderM[1];
    const trdAmtVal = findLastMoneyLabel(/^(?:receipt\s*amount|payment\s*amount|amount\s*received)\s*[:$-]*\s*(.+)$/i);
    if (trdAmtVal !== null && trdAmtVal > 0) fields.ide_amount = String(trdAmtVal);

    // 4. Hospitality & Resorts (hsp_tariffs, hsp_revenue, hsp_pos, hsp_memberships, hsp_stock, hsp_energy)
    const outletVal = findFirstLabel(/^(?:venue|outlet|venue\s*\/\s*outlet)\s*:\s*(.+)$/i);
    if (outletVal) fields.ide_outlet = outletVal;
    const revCat = findFirstLabel(/^(?:revenue\s*stream|stream|category)\s*:\s*(.+)$/i);
    if (revCat) {
      if (/diesel/i.test(revCat)) fields.ide_category = 'Generator Diesel Recharge';
      else if (/tip|gratuit/i.test(revCat)) fields.ide_category = 'Staff Tips & Gratuities';
      else if (/wedding|event/i.test(revCat)) fields.ide_category = 'Events & Weddings';
      else if (/f&b|restaurant/i.test(revCat)) fields.ide_category = 'Restaurant F&B';
      else if (/beach/i.test(revCat)) fields.ide_category = 'Beach Entrance';
      else if (/chalet|cabana/i.test(revCat)) fields.ide_category = 'Chalet Rental';
      else fields.ide_category = revCat;
    }
    const coversM = cleanAll.match(/(?:guest\s*covers|covers)\s*[:#-]?\s*(\d+)/i);
    if (coversM) fields.ide_covers = coversM[1];
    const roomsM = cleanAll.match(/(?:occupied\s*(?:chalets|rooms|suites)|rooms)\s*[:#-]?\s*(\d+)/i);
    if (roomsM) fields.ide_rooms = roomsM[1];
    const totRev = findLastMoneyLabel(/^(?:total\s*billed(?:\s*revenue)?|closing\s*total(?:\s*ttc)?|grand\s*total(?:\s*ttc)?)\s*[:$-]*\s*(.+)$/i);
    if (totRev !== null && totRev > 0) fields.ide_tot = String(totRev);
    const termVal = findFirstLabel(/^(?:pos\s*terminal|terminal)\s*:\s*(.+)$/i);
    if (termVal) fields.ide_terminal = termVal;
    const shiftVal = findFirstLabel(/^(?:pos\s*shift|shift)\s*:\s*(.+)$/i);
    if (shiftVal) fields.ide_shift = shiftVal;
    const cashierVal = findFirstLabel(/^(?:cashier|operator)\s*:\s*(.+)$/i);
    if (cashierVal) fields.ide_cashier = cashierVal;
    const billsM = cleanAll.match(/(?:bills\s*count|checks\s*count)\s*[:#-]?\s*(\d+)/i);
    if (billsM) fields.ide_bills = billsM[1];
    const cashPosVal = findLastMoneyLabel(/^(?:cash\s*collected|cash\s*sales)\s*[:$-]*\s*(.+)$/i);
    if (cashPosVal !== null && cashPosVal >= 0) fields.ide_cash = String(cashPosVal);
    const cardPosVal = findLastMoneyLabel(/^(?:card\s*(?:settlement|collected|sales))\s*[:$-]*\s*(.+)$/i);
    if (cardPosVal !== null && cardPosVal >= 0) fields.ide_card = String(cardPosVal);
    const memberVal = findFirstLabel(/^(?:member\s*(?:name)?|seasonal\s*member)\s*:\s*(.+)$/i);
    if (memberVal) fields.ide_member = memberVal;
    const seasonVal = findFirstLabel(/^(?:season|term)\s*:\s*(.+)$/i);
    if (seasonVal) fields.ide_season = seasonVal;
    const tierVal = findFirstLabel(/^(?:cabana\s*tier|rack\s*rate\s*tier|tariff\s*tier)\s*:\s*(.+)$/i);
    if (tierVal) fields.ide_tier = tierVal;
    const storeVal = findFirstLabel(/^(?:bar\s*store|store|pantry)\s*:\s*(.+)$/i);
    if (storeVal) fields.ide_store = storeVal;
    const assetVal = findFirstLabel(/^(?:generator(?:\s*asset)?|power\s*asset)\s*:\s*(.+)$/i);
    if (assetVal) fields.ide_asset = assetVal;
    const hoursM = cleanAll.match(/(?:operating\s*hours|run\s*hours)\s*[:#-]?\s*(\d+(?:\.\d+)?)/i);
    if (hoursM) fields.ide_hours = hoursM[1];
    const dieselAddM = cleanAll.match(/(?:diesel\s*added|fuel\s*added)\s*[:#-]?\s*(\d+(?:\.\d+)?)/i);
    if (dieselAddM) fields.ide_diesel = dieselAddM[1];

    // 5. Holding & Treasury (hld_partners, hld_loans, hld_extended, hld_interactions)
    const fromCo = findFirstLabel(/^(?:from\s*(?:sister\s*)?entity|sender(?:\s*entity)?|remitter)\s*:\s*(.+)$/i);
    if (fromCo) fields.ide_from = fromCo;
    const toCo = findFirstLabel(/^(?:to\s*(?:sister\s*)?entity|receiver(?:\s*entity)?|beneficiary\s*sister)\s*:\s*(.+)$/i);
    if (toCo) fields.ide_to = toCo;
    const wireUsd = findLastMoneyLabel(/^(?:transfer\s*amount|wire\s*amount|advance\s*amount|facility\s*principal|principal\s*drawn|repayment\s*amount)\s*[:$-]*\s*(.+)$/i);
    if (wireUsd !== null && wireUsd > 0) fields.ide_usd = String(wireUsd);
    const lenderVal = findFirstLabel(/^(?:lender|bank\s*lender|credit\s*provider)\s*:\s*(.+)$/i);
    if (lenderVal) fields.ide_lender = lenderVal;
    const aprM = cleanAll.match(/(?:apr|interest\s*rate)\s*[:#-]?\s*(\d+(?:\.\d+)?)\s*%?/i);
    if (aprM) fields.ide_apr = String(Number(aprM[1]));
    const prinVal = findLastMoneyLabel(/^(?:principal(?:\s*amount)?|facility\s*limit)\s*[:$-]*\s*(.+)$/i);
    if (prinVal !== null && prinVal > 0) fields.ide_prin = String(prinVal);
    const repVal = findLastMoneyLabel(/^(?:principal\s*repaid|repayment)\s*[:$-]*\s*(.+)$/i);
    if (repVal !== null && repVal >= 0) fields.ide_rep = String(repVal);
    const partnerVal = findFirstLabel(/^(?:partner(?:\s*name)?|shareholder)\s*:\s*(.+)$/i);
    if (partnerVal) fields.ide_partner = partnerVal;
    const eqPctM = cleanAll.match(/(?:equity\s*share|share\s*%)\s*[:#-]?\s*(\d+(?:\.\d+)?)\s*%?/i);
    if (eqPctM) fields.ide_pct = String(Number(eqPctM[1]));
    const drawnVal = findLastMoneyLabel(/^(?:amount\s*drawn|partner\s*draw)\s*[:$-]*\s*(.+)$/i);
    if (drawnVal !== null && drawnVal >= 0) fields.ide_drawn = String(drawnVal);
    const payMethVal = findFirstLabel(/^(?:payment\s*method|settlement\s*channel|method)\s*:\s*(.+)$/i);
    if (payMethVal) {
      if (/bank|wire|transfer/i.test(payMethVal)) fields.ide_method = 'Bank Transfer';
      else if (/check|cheque/i.test(payMethVal)) fields.ide_method = 'Check';
      else if (/card/i.test(payMethVal)) fields.ide_method = 'Card';
      else if (/cash/i.test(payMethVal)) fields.ide_method = 'Cash';
    }
    const notesVal = Array.from(new Set((pageEntries || []).map(pe => {
      const ls = String((pe && pe.text) || '').split('\n').map(x => x.trim()).filter(Boolean);
      return extractLabeledValue(ls, /^(?:notes?|purpose|remarks?|treasury\s*purpose)\s*:\s*(.+)$/i);
    }).filter(Boolean))).join(' · ');
    if (notesVal) fields.ide_notes = notesVal;

    // Infer formKey content-first across all 26 domain forms (do NOT lock to curSpec.key!)
    let inferredFormKey = '';
    if (fields.ide_from && fields.ide_to) inferredFormKey = 'hld_interactions';
    else if (fields.ide_lender || fields.ide_prin || /\b(?:loan\s*facility|borrowing\s*facility|ln-hld)\b/i.test(cleanAll)) inferredFormKey = 'hld_loans';
    else if (fields.ide_partner || fields.ide_pct || /\b(?:partner\s*draw|capital\s*call|distribution\s*pool)\b/i.test(cleanAll)) inferredFormKey = 'hld_partners';
    else if (fields.ide_party || /\bextended\s*register\b/i.test(cleanAll)) inferredFormKey = 'hld_extended';
    else if (fields.ide_claimed || fields.ide_adjuster || fields.ide_peril || /\b(?:loss\s*adjuster|clm-)\b/i.test(cleanAll)) inferredFormKey = 'ins_claims';
    else if (fields.ide_settled || (fields.ide_payable && !fields.ide_client) || /\b(?:carrier\s*remittance|bordereau\s*remittance|rem-)\b/i.test(cleanAll)) inferredFormKey = 'ins_remittances';
    else if (fields.ide_instalment || (fields.ide_billed && fields.ide_client) || /\b(?:collection\s*receipt|billing\s*allocation|prm-\d+|col-\d+)\b/i.test(cleanAll)) inferredFormKey = 'ins_billing';
    else if (fields.ide_new_pct || fields.ide_ren_pct || fields.ide_bonus_pct || /\b(?:carrier\s*agreement|brokerage\s*agreement|commission\s*agreement|agr-)\b/i.test(cleanAll)) inferredFormKey = 'ins_agreements';
    else if (fields.ide_gwp || fields.ide_sum_insured || (fields.ide_client && fields.ide_carrier) || /\b(?:policy\s*schedule|gross\s*written\s*premium|pol-)\b/i.test(cleanAll)) inferredFormKey = 'ins_policies';
    else if (fields.ide_contractor || fields.ide_budget || fields.ide_actual || /\b(?:work\s*order|wo-\d+)\b/i.test(cleanAll)) inferredFormKey = 're_workorders';
    else if (fields.ide_buyer || (fields.ide_contract && fields.ide_property && !fields.ide_tenant && !fields.ide_member)) inferredFormKey = 're_sales';
    else if ((fields.ide_allocated || /\b(?:rent\s*receipt|tenant\s*receipt|rct-4235|rct-prop)\b/i.test(cleanAll)) && (fields.ide_tenant || fields.ide_property)) inferredFormKey = 're_receipts';
    else if (fields.ide_tax_seq || fields.ide_period || (/\b(?:rent\s*tax\s*invoice|rent\s*invoice|commercial\s*lease\s*rent\s*tax\s*invoice|inv-4235|inv-prop)\b/i.test(cleanAll) && !fields.ide_start_date && !fields.ide_end_date && !fields.ide_deposit && !fields.ide_escalation && !/\blease\s*agreement\b/i.test(cleanAll))) inferredFormKey = 're_invoicing';
    else if (fields.ide_tenant || fields.ide_deposit || fields.ide_escalation || /\b(?:commercial\s*lease|lease\s*agreement|lse-)\b/i.test(cleanAll)) inferredFormKey = 're_leases';
    else if (fields.ide_bl || ((fields.ide_incoterm || fields.ide_fob || fields.ide_landed_add != null) && !fields.ide_list && !fields.ide_wh && !fields.ide_engine) || /\b(?:bill\s*of\s*lading|ocean\s*b\/?l|import\s*file|imp-trd|imp-sh|customs\s*duty|ocean\s*freight)\b/i.test(cleanAll)) inferredFormKey = 'trd_purchases';
    else if ((fields.ide_amount || /\b(?:trade\s*receipt|rct-trd)\b/i.test(cleanAll)) && fields.ide_customer && !fields.ide_item && !fields.ide_chassis) inferredFormKey = 'trd_receipts';
    else if (fields.ide_code || fields.ide_on_hand || fields.ide_reorder || /\b(?:spare\s*parts\s*inventory|parts\s*sku|wac\s*unit\s*cost)\b/i.test(cleanAll)) inferredFormKey = 'trd_stock';
    else if (fields.ide_list || fields.ide_wh || fields.ide_engine || /\b(?:truck\s*stock\s*intake|unit\s*intake|stk-trd)\b/i.test(cleanAll) || (vinAudit && vinAudit.isVin17 && !fields.ide_customer && /showroom|fob|list\s*price|engine/i.test(cleanAll))) inferredFormKey = 'trd_trucks';
    else if (/\b(?:monthly\s*sales\s*target|target\s*ttc)\b/i.test(cleanAll)) inferredFormKey = 'trd_targets';
    else if ((vinAudit && vinAudit.isVin17 && fields.ide_customer) || (fields.ide_customer && /\b(?:shacman|korri\s*auto|inv-trd)\b/i.test(cleanAll))) inferredFormKey = 'trd_sales';
    else if (fields.ide_terminal || fields.ide_shift || fields.ide_cashier || /\b(?:pos\s*z-?close|pos\s*shift|pos-cl)\b/i.test(cleanAll)) inferredFormKey = 'hsp_pos';
    else if (fields.ide_member || /\b(?:seasonal\s*membership|mem-2026)\b/i.test(cleanAll)) inferredFormKey = 'hsp_memberships';
    else if (fields.ide_tier || /\b(?:seasonal\s*tariff|rack\s*rate|nightly\s*rate)\b/i.test(cleanAll)) inferredFormKey = 'hsp_tariffs';
    else if (fields.ide_store || /\b(?:f&b\s*stock|beverage\s*inventory|bar\s*store)\b/i.test(cleanAll)) inferredFormKey = 'hsp_stock';
    else if (fields.ide_asset || fields.ide_hours || fields.ide_diesel || /\b(?:generator\s*&\s*solar|solar\s*yield)\b/i.test(cleanAll)) inferredFormKey = 'hsp_energy';
    else if (fields.ide_outlet || fields.ide_covers || fields.ide_rooms || /\b(?:daily\s*venue\s*revenue|rev-hsp)\b/i.test(cleanAll)) inferredFormKey = 'hsp_revenue';

    if (!inferredFormKey) inferredFormKey = specKey;
    if (inferredFormKey === 'ins_policies' && !fields.ide_gwp) {
      const totPolFallback = findLastMoneyLabel(/^(?:total(?:\s*amount)?|subtotal)\s*[:$-]*\s*(.+)$/i);
      if (totPolFallback !== null && totPolFallback > 0) fields.ide_gwp = String(totPolFallback);
    }
    if (!Object.keys(fields).length) return null;
    return {
      company: companyRaw,
      formKey: inferredFormKey,
      fields,
      vinAudit,
      pageCount: Math.max(1, (pageEntries && pageEntries.length) || 1)
    };
  }

  function applyDomainExtractionToModal(sampleOrExt) {
    if (!D || !sampleOrExt) return { ok: false };
    const targetFk = String(sampleOrExt.formKey || '');
    const specResolved = (targetFk && typeof D.resolveDomainFormSpec === 'function')
      ? D.resolveDomainFormSpec(targetFk)
      : null;
    const resolvedInd = (specResolved && specResolved.ind) || sampleOrExt.ind || '';
    if (targetFk && D.canEnterDomainForm && !D.canEnterDomainForm(targetFk)) {
      if (D.toast) D.toast('Your seat has no entry rights for this form', 'err');
      return { ok: false, blocked: true };
    }
    if (targetFk && D.canManageSiblingChronoSchedule && !D.canManageSiblingChronoSchedule(targetFk)) {
      if (D.toast) D.toast('Supervisor permission required to manage chronological rate schedules', 'err');
      return { ok: false, blocked: true };
    }
    const safeCo = resolveRlsSafeDomainCompany(sampleOrExt.company, resolvedInd);
    const modal = $('indDomainEntryModal');
    const curSpecKey = modal && modal._currentDomainSpec ? modal._currentDomainSpec.key : '';
    if (!modal || modal.hidden || (targetFk && curSpecKey !== targetFk)) {
      if (typeof D.openIndustryDomainEntryModal === 'function') {
        SCAN_STATE.suppressDomResetOnSwitch = true;
        let openedOk = true;
        try {
          openedOk = D.openIndustryDomainEntryModal(targetFk || curSpecKey, { company: safeCo });
        } finally {
          SCAN_STATE.suppressDomResetOnSwitch = false;
        }
        const liveCheck = $('indDomainEntryModal');
        if (openedOk === false || !liveCheck || liveCheck.hidden || (targetFk && (!liveCheck._currentDomainSpec || liveCheck._currentDomainSpec.key !== targetFk))) {
          return { ok: false, blocked: true };
        }
      }
    }
    const domBody = $('indEntryModalBody');
    if (domBody) {
      domBody.querySelectorAll('.ss-ai-badge').forEach(b => b.remove());
      domBody.querySelectorAll('.ss-field-filled, .ss-field-check').forEach(w => w.classList.remove('ss-field-filled', 'ss-field-check'));
      domBody.scrollTop = 0;
    }
    const coSel = $('ide_company');
    if (coSel && sampleOrExt.company) {
      const optMatch = Array.from(coSel.options || []).find(o => String(o.value || '').toLowerCase() === String(safeCo || '').toLowerCase());
      if (optMatch) coSel.value = optMatch.value;
      coSel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const fields = Object.assign({}, sampleOrExt.fields || {});

    // Run deterministic ISO 3779 check-digit & stamped-metal disambiguation on any incoming VIN field
    let vinAudit = sampleOrExt.vinAudit || null;
    ['ide_vin', 'ide_chassis'].forEach(vk => {
      if (fields[vk]) {
        const va = validateAndDisambiguateVin17(fields[vk], { fromScan: true });
        if (va && va.isVin17) {
          fields[vk] = va.clean;
          if (!vinAudit) vinAudit = va;
        }
      }
    });

    // Apply company, incoterm, supplier, property, tenant, category, qty, carrier & line BEFORE contract cost / rate / landed_add so live tariff listeners never overwrite explicit scanned figures!
    const orderedEntries = Object.entries(fields).sort(([a], [b]) => {
      const prio = k => (/^(?:ide_carrier|ide_line|ide_date|ide_type|ide_supplier|ide_property|ide_tenant|ide_category|ide_qty|ide_ord_qty|ide_incoterm)$/.test(k)) ? 0 : 1;
      return prio(a) - prio(b);
    });

    const fIdx = (D && typeof D.getFreqIndex === 'function') ? D.getFreqIndex() : null;
    let appliedCount = 0;
    orderedEntries.forEach(([fId, rawVal]) => {
      let el = $(fId);
      if (!el) {
        const fbMap = {
          ide_tot: ['ide_gross', 'ide_amount', 'ide_collected'],
          ide_paid: ['ide_collected', 'ide_amount'],
          ide_gwp: ['ide_billed']
        };
        const fb = fbMap[fId] || [];
        for (let fi = 0; fi < fb.length; fi++) {
          if ($(fb[fi])) { el = $(fb[fi]); break; }
        }
      }
      if (!el) return;
      let valToSet = String(rawVal ?? '');
      if (fIdx && typeof fIdx.forCol === 'function' && (fId === 'ide_client' || fId === 'ide_tenant' || fId === 'ide_customer')) {
        const listId = el.getAttribute('list');
        const dl = listId ? $(listId) : null;
        if (dl) {
          const opts = Array.from(dl.querySelectorAll('option')).map(o => o.value).filter(Boolean);
          const exact = opts.find(o => o.toLowerCase() === valToSet.toLowerCase());
          if (exact) valToSet = exact;
        }
      }
      if (el.tagName === 'SELECT') {
        const opt = Array.from(el.options || []).find(o =>
          String(o.value || '').toLowerCase() === valToSet.toLowerCase() ||
          String(o.textContent || '').toLowerCase().includes(valToSet.toLowerCase())
        );
        if (opt) valToSet = opt.value;
      }
      if (fId === 'ide_discount') {
        const domUi = D.getFormUi ? D.getFormUi() : null;
        if (domUi) { domUi.ideDiscUnit = 'usd'; domUi.ideSettleBase = null; }
      }
      el.value = valToSet;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (el.dataset) delete el.dataset.userEdited;
      appliedCount++;
      const lbl = el.closest('label');
      if (lbl) {
        lbl.classList.add('ss-field-filled');
        const span = lbl.querySelector('span');
        if (span && !span.querySelector('.ss-ai-badge')) {
          const b = document.createElement('span');
          b.className = 'ss-ai-badge is-ok';
          b.style.cssText = 'margin-left:6px;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:800;background:rgba(22,163,74,0.14);color:#15803D';
          b.textContent = 'AI Filled';
          span.appendChild(b);
        }
      }
    });

    // Enforce 17-char VIN -> Qty = 1 on Trading sales & trucks
    const vinEl = $('ide_vin') || $('ide_chassis');
    const qtyEl = $('ide_qty');
    if (vinEl && qtyEl && String(vinEl.value || '').trim().length === 17) {
      qtyEl.value = '1';
      qtyEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Deterministic Insurance Discount <= Gross Commission cap check when scanned
    if ($('ide_gwp') && $('ide_rate') && $('ide_discount')) {
      const gwpN = Number($('ide_gwp').value || 0);
      const rateN = Number($('ide_rate').value || 0);
      const gCommN = round2(gwpN * (rateN / 100));
      const discN = Number($('ide_discount').value || 0);
      if (gCommN > 0 && discN > gCommN && sampleOrExt.capDiscountToGrossComm) {
        $('ide_discount').value = String(gCommN);
        $('ide_discount').dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    const pageCnt = Math.max(1, Number(sampleOrExt.pageCount || 1));
    const statusBadge = $('indEntryScanStatusBadge');
    if (statusBadge) {
      const multiTag = pageCnt > 1 ? ` · <span class="ss-multipage-pill">${pageCnt} Pages Synthesized</span>` : '';
      const vinTag = vinAudit && vinAudit.isVin17 ? ` · <span class="ss-vin-pill is-${esc(vinAudit.statusTone)}">${esc(vinAudit.badgeLabel)}</span>` : '';
      statusBadge.innerHTML = `<b style="color:#15803D">✓ AI Smart Scan Extracted:</b> ${esc(sanitizeOutwardText(sampleOrExt.label || sampleOrExt.fileName || 'Document'))} (${esc(safeCo)})${multiTag}${vinTag}`;
    }

    const liveModal = $('indDomainEntryModal');
    if (liveModal) {
      liveModal.classList.add('mob-ai-scan-open');
      liveModal.classList.remove('mob-ai-voice-open');
      const indQ = $('indMobAiQuickBar');
      if (indQ) {
        const sB = indQ.querySelector('[data-mob-ai="scan"]');
        const vB = indQ.querySelector('[data-mob-ai="voice"]');
        if (sB) { sB.classList.add('is-open'); sB.setAttribute('aria-expanded', 'true'); }
        if (vB) { vB.classList.remove('is-open'); vB.setAttribute('aria-expanded', 'false'); }
      }
    }
    if (liveModal && typeof liveModal._addPendingDomainFile === 'function') {
      if (typeof liveModal._clearScanPendingDomainFiles === 'function') {
        liveModal._clearScanPendingDomainFiles();
      }
      const existingPending = typeof liveModal._getPendingDomainFiles === 'function' ? (liveModal._getPendingDomainFiles() || []) : [];
      const rawFiles = Array.isArray(sampleOrExt.rawFiles) && sampleOrExt.rawFiles.length
        ? sampleOrExt.rawFiles
        : (sampleOrExt.rawFile ? [sampleOrExt.rawFile] : []);
      const rawAttFallback = !rawFiles.length && Array.isArray(sampleOrExt.attObjs) ? sampleOrExt.attObjs : [];

      if (rawFiles.length) {
        rawFiles.forEach(rf => {
          if (typeof Blob !== 'undefined' && rf instanceof Blob) {
            if (!existingPending.includes(rf)) {
              rf._captureMethod = sampleOrExt.captureMethod || 'AI Smart Scan';
              rf._fromSmartScan = true;
              liveModal._addPendingDomainFile(rf);
            }
          }
        });
      } else if (rawAttFallback.some(a => a && a.data_url)) {
        rawAttFallback.forEach(aObj => {
          if (!aObj || !aObj.data_url) return;
          try {
            const mB64 = String(aObj.data_url).match(/^data:([^;,]+)(?:;[^,]*)*?;base64,(.+)$/i);
            let fBytes = null;
            let fMime = aObj.mime_type || 'application/octet-stream';
            if (mB64) {
              const bin = atob(mB64[2]);
              fBytes = new Uint8Array(bin.length);
              for (let bi = 0; bi < bin.length; bi++) fBytes[bi] = bin.charCodeAt(bi);
              if (!aObj.mime_type && mB64[1]) fMime = mB64[1];
            } else {
              const mTxt = String(aObj.data_url).match(/^data:([^;,]+)(?:;[^,]*)?,(.*)$/i);
              if (mTxt) {
                const decoded = decodeURIComponent(mTxt[2] || '');
                fBytes = typeof TextEncoder !== 'undefined'
                  ? new TextEncoder().encode(decoded)
                  : Uint8Array.from(decoded, ch => ch.charCodeAt(0) & 0xff);
                if (!aObj.mime_type && mTxt[1]) fMime = mTxt[1];
              }
            }
            if (fBytes) {
              const fFromAtt = new File([fBytes], aObj.file_name || 'SmartScan_Domain_File', { type: fMime });
              fFromAtt._captureMethod = aObj.capture_method || sampleOrExt.captureMethod || 'AI Smart Scan';
              fFromAtt._fromSmartScan = true;
              liveModal._addPendingDomainFile(fFromAtt);
            }
          } catch (_) {}
        });
      } else if (!sampleOrExt.skipSyntheticFile) {
        const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360"><rect width="100%" height="100%" fill="#FAF8F4"/><text x="28" y="48" font-family="monospace" font-size="18" font-weight="bold" fill="#181512">${esc(sanitizeOutwardText(sampleOrExt.label || 'AI Smart Scan Document'))}</text><text x="28" y="84" font-family="monospace" font-size="14" fill="#4A443C">Entity: ${esc(safeCo)} · Ref: ${esc(fields.ide_id || 'SCAN-01')}</text></svg>`;
        const blob = new Blob([svgStr], { type: 'image/svg+xml' });
        const fakeFile = new File([blob], sampleOrExt.fileName || 'SmartScan_Domain_Voucher.svg', { type: 'image/svg+xml' });
        fakeFile._captureMethod = 'AI Smart Scan';
        fakeFile._fromSmartScan = true;
        liveModal._addPendingDomainFile(fakeFile);
      }
    }
    mountOnDomainModal();
    return {
      ok: true,
      company: safeCo,
      formKey: (liveModal && liveModal._currentDomainSpec && liveModal._currentDomainSpec.key) || sampleOrExt.formKey,
      fields,
      appliedCount,
      pageCount: pageCnt,
      vinAudit
    };
  }

  function runDomainSampleScan(sampleId) {
    const hit = DOMAIN_SAMPLE_SCANS.find(s => s.id === sampleId) || DOMAIN_SAMPLE_SCANS[0];
    return applyDomainExtractionToModal(hit);
  }

  async function scanIntoDomainModal(filesOrAtt, opts = {}) {
    if (!D || SCAN_STATE.domBusy || SCAN_STATE.busy) return null;
    const batch = expandInputToScanBatch(filesOrAtt);
    if (!batch.length) return null;
    const liveModal = $('indDomainEntryModal');
    const wasOpenAtStart = Boolean(liveModal && !liveModal.hidden);
    const domGen = (SCAN_STATE.domScanGen = (SCAN_STATE.domScanGen || 0) + 1);
    const isDomScanCurrent = () => {
      if (SCAN_STATE.domScanGen !== domGen) return false;
      const m = $('indDomainEntryModal');
      if (wasOpenAtStart && (!m || m.hidden)) return false;
      return true;
    };
    SCAN_STATE.domBusy = true;
    try {
      let preExtractedUnits = null;
      const forceQueueDom = Boolean(
        (opts && opts.batchMode === 'queue')
        || batch.some(it => it && typeof it === 'object' && (it._ssBatchMode === 'queue' || it._stackSlip))
      );
      const preserveQueueDomSingle = Boolean(
        !forceQueueDom
        && (!opts || opts.batchMode !== 'bundle')
        && hasActiveSlipQueue()
        && !(SCAN_STATE.slipQueue && SCAN_STATE.slipQueue.summaryOpen)
      );
      if (opts && opts.batchMode !== 'bundle' && !opts._singleQueueUnit) {
        const unitRes = await extractSlipUnitsFromInput(batch, opts.captureMethod || 'AI Smart Scan', isDomScanCurrent);
        if (unitRes.aborted || !isDomScanCurrent()) return null;
        preExtractedUnits = unitRes.units;
        if (unitRes.units.length >= 2 || (forceQueueDom && unitRes.units.length >= 1)) {
          SCAN_STATE.lastMultiUnits = unitRes.units.length >= 2 ? { units: unitRes.units, captureMethod: opts.captureMethod || 'AI Smart Scan', sourceOrigin: 'domain' } : null;
          if (forceQueueDom || shouldDefaultToSlipQueue(unitRes.units)) {
            return await startSlipQueue(unitRes.units, opts.captureMethod || 'AI Smart Scan', 'domain', unitRes.truncatedCount);
          }
        } else {
          SCAN_STATE.lastMultiUnits = null;
        }
        if (!(preserveQueueDomSingle && unitRes.units.length <= 1)) {
          SCAN_STATE.slipQueue = null;
          syncMobAiStepPills();
        }
      }
      const carriedPrecheck = collectCarriedPrecheckFlags(batch);
      const firstItem = batch[0] || null;
      const fName = String((firstItem && (firstItem.name || firstItem.file_name)) || '').toLowerCase();
      const curSpec = liveModal && !liveModal.hidden && liveModal._currentDomainSpec ? liveModal._currentDomainSpec : null;
      let sample = DOMAIN_SAMPLE_SCANS[0];
      if (/lease|4235|rent|prop/i.test(fName)) sample = DOMAIN_SAMPLE_SCANS[1];
      else if (/vin|shacman|korri|truck|bl/i.test(fName)) sample = DOMAIN_SAMPLE_SCANS[2];
      else if (/blanca|launa|palms|voile|platinum|resort|cabana|pos/i.test(fName)) sample = DOMAIN_SAMPLE_SCANS[3];
      else if (/holding|wire|ic|intercompany/i.test(fName)) sample = DOMAIN_SAMPLE_SCANS[4];
      else if (curSpec && curSpec.key) {
        sample = DOMAIN_SAMPLE_SCANS.find(s => s.formKey === curSpec.key)
          || DOMAIN_SAMPLE_SCANS.find(s => s.ind === curSpec.ind)
          || DOMAIN_SAMPLE_SCANS[0];
      } else if (D && typeof D.getActiveIndustry === 'function') {
        const curInd = D.getActiveIndustry(D.STATE && D.STATE.company);
        sample = DOMAIN_SAMPLE_SCANS.find(s => s.ind === curInd) || DOMAIN_SAMPLE_SCANS[0];
      }

      const rawFiles = batch.filter(it => typeof Blob !== 'undefined' && it instanceof Blob);

    // Extract text & normalized attachments across all 1..N pages (works online, offline & headlessly)
    const normPairs = [];
    const pageEntries = [];
    if (Array.isArray(preExtractedUnits) && preExtractedUnits.length) {
      const seenDomPairs = new Set();
      preExtractedUnits.forEach((u, idx) => {
        const p = u.origPair || { fileObj: u.fileObj, attObj: u.attObj };
        if (p && p.attObj && !seenDomPairs.has(p)) {
          seenDomPairs.add(p);
          normPairs.push(p);
        }
        const lblName = u.isPdfPage ? `${u.origFileName || u.fileName} (p.${u.pageNum})` : (u.fileName || `Page_${idx + 1}`);
        pageEntries.push({ pageNum: pageEntries.length + 1, fileName: lblName, text: String(u.text || '') });
      });
    } else {
      for (let i = 0; i < batch.length; i++) {
        if (!isDomScanCurrent()) return null;
        const pair = await normalizeSingleScanItem(batch[i], opts.captureMethod || 'AI Smart Scan', i);
        if (!isDomScanCurrent()) return null;
        if (!pair.attObj) continue;
        normPairs.push(pair);
        const pName = pair.attObj.file_name || `Page_${i + 1}`;
        if (pair.fileObj && typeof pair.fileObj._extractedText === 'string') {
          pageEntries.push({ pageNum: pageEntries.length + 1, fileName: pName, text: pair.fileObj._extractedText });
          continue;
        }
        const isPdfPair = /\.pdf$/i.test(pName) || /application\/pdf/i.test(pair.attObj.mime_type || '');
        if (isPdfPair && pair.fileObj) {
          const ab = await pair.fileObj.arrayBuffer();
          if (!isDomScanCurrent()) return null;
          const pdfPages = await extractPdfPagesTextClient(ab);
          if (!isDomScanCurrent()) return null;
          if (pdfPages.length > 1) {
            pdfPages.forEach((pt, pIdx) => pageEntries.push({ pageNum: pageEntries.length + 1, fileName: `${pName} (p.${pIdx + 1})`, text: pt }));
            continue;
          }
        }
        // Skip heavy raster OCR in headless mode unless text-bearing (SVG / PDF / TXT / DOCX / XLSX)
        const isTextBearing = /\.(svg|pdf|txt|csv|tsv|json|xml|docx|xlsx)$/i.test(pName) ||
          /svg|pdf|text|json|xml|word|sheet/i.test(pair.attObj.mime_type || '');
        const txt = (!isHeadlessEnv() || isTextBearing || window.__MFG_TEST_LIVE_AI)
          ? await extractAnyDocumentText(pair.fileObj, pair.attObj, () => {})
          : '';
        if (!isDomScanCurrent()) return null;
        pageEntries.push({ pageNum: pageEntries.length + 1, fileName: pName, text: txt });
      }
    }

    const totalPages = Math.max(1, pageEntries.length);
    const meaningfulTextLen = pageEntries.reduce((s, pe) => s + String((pe && pe.text) || '').trim().length, 0);
    const combinedText = meaningfulTextLen > 0
      ? (totalPages > 1
        ? pageEntries.map((pe, idx) => `=== PAGE ${idx + 1} OF ${totalPages} (${pe.fileName}) ===\n${pe.text || ''}`).join('\n\n')
        : String((pageEntries[0] && pageEntries[0].text) || ''))
      : '';

    const primaryFileName = (normPairs[0] && normPairs[0].attObj && normPairs[0].attObj.file_name) || fName || sample.fileName;
    // Pass null curSpec so content determines the right domain form across all 26 forms (no curSpec lock)
    const detBundle = meaningfulTextLen >= 10
      ? deterministicParseDomainBundle(pageEntries, combinedText, null, primaryFileName)
      : null;
    const detShared = meaningfulTextLen >= 10
      ? synthesizeMultiPageDeterministic(pageEntries, combinedText, primaryFileName)
      : null;
    const hasStrongDomMatch = Boolean(detBundle && detBundle.formKey && hasStrongDomainRegisterSignals(combinedText, detBundle.formKey));
    const hasExplicitSharedCue = Boolean(
      !hasStrongDomMatch && detShared && (
        ['salary', 'conversion', 'settlement', 'external', 'raw', 'production', 'fuel', 'transport', 'equipment'].includes(detShared.formType)
        || (detShared.formType === 'expense'
          && !/\b(?:z-?close|pos\s*shift|venue\s*closing|cabana|lease\s*agreement|policy\s*schedule|bordereau|bill\s*of\s*lading|ocean\s*b\/?l)\b/i.test(combinedText)
          && Boolean(
            detShared.supplier
            || (Array.isArray(detShared.lines) && detShared.lines.length > 0)
            || /\b(?:supplier|vendor|merchant|utility|electricity|edl|diesel|lubricant|spare\s*parts|payroll|salary\s*advance|tax\s*bill|supplier\s*invoice)\b/i.test(combinedText)
          ))
      )
    );
    if (detShared && meaningfulTextLen >= 10 && !hasStrongDomMatch && (!curSpec || hasExplicitSharedCue)) {
      const routing = inferSlipRoutingTarget(detShared, detBundle, combinedText);
      if (routing.kind === 'shared') {
        const matchedShared = groundExtractedEntities(detShared, combinedText);
        const attObjs = normPairs.map(p => p.attObj);
        const sharedBundle = {
          attObj: attObjs[0] || null,
          attObjs,
          _rawFiles: rawFiles,
          stitchedDataUrl: '',
          activePageIdx: attObjs.length > 1 ? 'all' : 0,
          extractedText: String(combinedText || '').trim(),
          parsed: detShared,
          matched: matchedShared,
          engineLabel: totalPages > 1 ? `ISABI ${totalPages}-Page Bundle Synthesizer` : 'ISABI Smart Parser + Frequency Grounding',
          appliedForm: detShared.formType,
          filledFields: [],
          warnFields: []
        };
        Object.entries(carriedPrecheck.overrides || {}).forEach(([okKey, okVal]) => {
          applyPrecheckOverrideToBundle(sharedBundle, okKey, okVal);
        });
        const runPrecheckGate = opts.captureMethod !== 'Sample Smart Scan' || Boolean(window.__MFG_FORCE_SAMPLE_PRECHECK);
        const precheck = runPrecheckGate ? evaluateScanPrecheck(sharedBundle) : { hasWarning: false, partyWarnings: [], summaryLines: [], warnSig: '' };
        if (!isDomScanCurrent()) return null;
        if (precheck.hasWarning && !(carriedPrecheck.ack && carriedPrecheck.ackSig === precheck.warnSig)) {
          const preTarget = resolvePrecheckEntryTarget(sharedBundle);
          if (!preTarget.ok) {
            if (D.toast) D.toast(preTarget.reason, 'err');
            return { ok: false, blocked: true };
          }
          SCAN_STATE.suppressDomResetOnSwitch = true;
          try {
            if (typeof D.closeIndustryDomainEntryModal === 'function') D.closeIndustryDomainEntryModal(true);
            SCAN_STATE.suppressResetOnModalSwitch = true;
            if (preTarget.coSwitchKey && D.selectCompanyScope) {
              try { D.selectCompanyScope(preTarget.coSwitchKey); } catch (_) {}
            }
            if (typeof D.openEntryModal === 'function') D.openEntryModal(preTarget.targetForm || 'expense', null, { forceSwitch: true });
          } finally {
            SCAN_STATE.suppressDomResetOnSwitch = false;
            SCAN_STATE.suppressResetOnModalSwitch = false;
          }
          if (!$('entryModal') || $('entryModal').hidden) {
            if (D.toast) D.toast(preTarget.reason, 'err');
            return { ok: false, blocked: true };
          }
          sharedBundle.precheck = precheck;
          SCAN_STATE.pendingPrecheckBundle = sharedBundle;
          SCAN_STATE.lastScan = sharedBundle;
          renderSmartScanBarDom();
          return { ok: true, heldPrecheck: true, precheck, formKey: preTarget.targetForm };
        }
        await applyScanToModal(sharedBundle);
        if (sharedBundle.blockedByRbac) return { ok: false, blocked: true };
        notifyScanApplyOutcome(sharedBundle, totalPages);
        return { ok: true, formKey: sharedBundle.appliedForm, company: matchedShared.targetCompany };
      }
    }
    let finalExt = null;
    const domAttObjs = normPairs.map(p => p && p.attObj).filter(Boolean);

    const canRunLiveVision = (!isHeadlessEnv() || window.__MFG_TEST_LIVE_AI) &&
      (typeof navigator === 'undefined' || navigator.onLine !== false) &&
      normPairs.length > 0;

    if (canRunLiveVision) {
      const statusBadge = $('indEntryScanStatusBadge');
      if (statusBadge) {
        statusBadge.textContent = totalPages > 1
          ? `Synthesizing ${totalPages} pages with ISABI Vision...`
          : 'Scanning document with ISABI Vision...';
      }
      try {
        const attObjs = normPairs.map(p => p.attObj);
        const stitchedAtt = attObjs.length > 1 ? await stitchMultiPageVisionSheet(attObjs) : attObjs[0];
        if (!isDomScanCurrent()) return null;
        const inlinePart = extractVisionInlinePart(stitchedAtt);

        const fieldSchema = [];
        if (liveModal && !liveModal.hidden) {
          liveModal.querySelectorAll('input[id^="ide_"], select[id^="ide_"], textarea[id^="ide_"]').forEach(el => {
            if (el.id === 'ide_company') return;
            const lbl = el.closest('label');
            const span = lbl ? lbl.querySelector('span') : null;
            const lblTxt = span ? span.textContent.replace(/AI Filled/g, '').trim() : el.id;
            fieldSchema.push(`${el.id} (${lblTxt})`);
          });
        }
        if (!fieldSchema.length) {
          Object.keys(sample.fields || {}).forEach(k => fieldSchema.push(k));
        }
        const allowedCos = (D && typeof D.allowedCompanyNames === 'function') ? D.allowedCompanyNames() : [sample.company];
        const domPrompt = [
          'You are ISABI Smart Scan extracting structured domain fields across 1..N document pages.',
          'Return ONLY valid JSON: {"company":"","label":"Short document title","fields":{...}}',
          'Allowed companies: ' + allowedCos.slice(0, 16).join(', '),
          'Target field keys inside "fields": ' + fieldSchema.join(', '),
          'ISO 3779 VIN rule: 17-character VINs never contain I, O, or Q; disambiguate stamped metal 0 vs D, 8 vs B, and 5 vs S.',
          totalPages > 1
            ? `Multi-Page Synthesis (${totalPages} pages): combine Page 1 identity headers (company, tenant/client/buyer/carrier, unit, policy/BL/VIN) with Page 2+ rent/premium/freight schedules, effective dates, and final net/gross figures.`
            : 'Format dates as YYYY-MM-DD and numeric amounts without currency symbols or commas.'
        ].join('\n');
        const userText = combinedText
          ? ('DOCUMENT TEXT:\n' + String(combinedText).slice(0, 8000))
          : 'Extract all matching fields directly from this document image.';

        let aiDom = null;
        const isLocalHost = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/i.test(location.hostname || '');
        const hasEdgeHost = Boolean(isLocalHost || window.ISABI_LOCAL_API || window.ISABI_HAS_EDGE_API);
        if (hasEdgeHost && (inlinePart || String(combinedText || '').trim().length >= 12)) {
          const useVisionTier = Boolean(inlinePart || String(combinedText || '').trim().length < 160);
          const intentTier = useVisionTier ? 'vision' : 'fast';
          const inlineMime = (inlinePart && inlinePart.mimeType) ? String(inlinePart.mimeType) : '';
          const inlineDataUrl = (inlinePart && inlinePart.data) ? `data:${inlineMime || 'image/jpeg'};base64,${inlinePart.data}` : '';
          const reqBody = {
            task: 'domain_smart_scan',
            prompt: domPrompt + '\n\n' + userText,
            dataUrl: inlineDataUrl,
            mimeType: inlineMime,
            tier: intentTier,
            thinkingLevel: useVisionTier ? 'LOW' : undefined
          };
          const base = String(window.ISABI_LOCAL_API || '.').replace(/\/$/, '');
          const edgeFetch = window.ISABI_EDGE_FETCH || fetch;
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), inlinePart ? 14500 : 8500);
          try {
            const res = await edgeFetch(`${base}/api/ai-edge`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(reqBody),
              signal: ctrl.signal
            });
            if (!isDomScanCurrent()) return null;
            if (res.ok) {
              const j = await res.json();
              if (!isDomScanCurrent()) return null;
              aiDom = (j && j.result && typeof j.result === 'object')
                ? j.result
                : extractJsonBlock(j && (j.rawReply || j.reply || j.answer));
            }
          } catch (_) {
          } finally {
            clearTimeout(timer);
          }
        }
        if (aiDom && aiDom.fields && typeof aiDom.fields === 'object' && Object.keys(aiDom.fields).length > 0) {
          const resolvedFk = (detBundle && detBundle.formKey) || (aiDom && aiDom.formKey) || (curSpec && curSpec.key) || sample.formKey;
          const resolvedSp = (D && typeof D.resolveDomainFormSpec === 'function') ? D.resolveDomainFormSpec(resolvedFk) : null;
          finalExt = {
            ind: (resolvedSp && resolvedSp.ind) || (curSpec && curSpec.ind) || sample.ind,
            formKey: resolvedFk,
            company: aiDom.company || (detBundle && detBundle.company) || (($('ide_company') && $('ide_company').value) || sample.company),
            label: aiDom.label || (totalPages > 1 ? `${totalPages}-Page Bundle (${primaryFileName})` : primaryFileName),
            fileName: primaryFileName,
            rawFiles,
            attObjs: domAttObjs,
            pageCount: totalPages,
            vinAudit: detBundle && detBundle.vinAudit,
            captureMethod: opts.captureMethod || 'AI Smart Scan',
            fields: Object.assign({}, (detBundle && detBundle.fields) || {}, aiDom.fields)
          };
        }
      } catch (_) {}
    }

    if (!finalExt && detBundle && Object.keys(detBundle.fields).length > 0) {
      const resolvedFk = detBundle.formKey || (curSpec && curSpec.key) || sample.formKey;
      const resolvedSp = (D && typeof D.resolveDomainFormSpec === 'function') ? D.resolveDomainFormSpec(resolvedFk) : null;
      finalExt = {
        ind: (resolvedSp && resolvedSp.ind) || (curSpec && curSpec.ind) || sample.ind,
        formKey: resolvedFk,
        company: detBundle.company || (($('ide_company') && $('ide_company').value) || sample.company),
        label: totalPages > 1 ? `${totalPages}-Page Synthesized Pack (${primaryFileName})` : primaryFileName,
        fileName: primaryFileName,
        rawFiles,
        attObjs: domAttObjs,
        pageCount: totalPages,
        vinAudit: detBundle.vinAudit,
        captureMethod: opts.captureMethod || 'AI Smart Scan',
        fields: Object.assign({}, detBundle.fields)
      };
    }

    let usedSyntheticSampleFallback = false;
    if (!finalExt) {
      usedSyntheticSampleFallback = true;
      const fallbackFk = (curSpec && curSpec.key) || sample.formKey;
      const fallbackSp = (D && typeof D.resolveDomainFormSpec === 'function') ? D.resolveDomainFormSpec(fallbackFk) : null;
      finalExt = Object.assign({}, sample, {
        ind: (fallbackSp && fallbackSp.ind) || (curSpec && curSpec.ind) || sample.ind,
        formKey: fallbackFk,
        fileName: primaryFileName,
        rawFiles,
        attObjs: domAttObjs,
        pageCount: totalPages,
        captureMethod: opts.captureMethod || 'AI Smart Scan',
        fields: Object.assign({}, sample.fields || {})
      });
    }

    if (finalExt.fields && carriedPrecheck.overrides) {
      Object.entries(carriedPrecheck.overrides).forEach(([okKey, okVal]) => {
        if (!okVal) return;
        if (okKey in finalExt.fields) {
          finalExt.fields[okKey] = okVal;
        } else {
          Object.entries(DOM_PRECHECK_PARTY_FIELDS).forEach(([fid, pKind]) => {
            if (pKind === okKey && fid in finalExt.fields) finalExt.fields[fid] = okVal;
          });
        }
      });
    }

    if (!isDomScanCurrent()) return null;
    const runDomPre = (!usedSyntheticSampleFallback && opts.captureMethod !== 'Sample Smart Scan') || Boolean(window.__MFG_FORCE_SAMPLE_PRECHECK);
    const domPrecheck = runDomPre ? evaluateDomainScanPrecheck(finalExt) : { hasWarning: false, warnSig: '' };
    const domAckMatches = Boolean(carriedPrecheck.ack && carriedPrecheck.ackSig && domPrecheck.warnSig && carriedPrecheck.ackSig === domPrecheck.warnSig);
    if (domPrecheck.hasWarning && !domAckMatches) {
      renderIndPrecheckBanner(finalExt, domPrecheck);
      return { ok: true, heldPrecheck: true, precheck: domPrecheck, formKey: finalExt.formKey };
    }
      const oldBanner = $('indEntryPrecheckBanner');
      if (oldBanner) oldBanner.remove();
      const applyDomRes = applyDomainExtractionToModal(finalExt);
      if (applyDomRes && applyDomRes.ok && !applyDomRes.blocked && preserveQueueDomSingle && hasActiveSlipQueue() && SCAN_STATE.slipQueue && !SCAN_STATE.slipQueue.summaryOpen) {
        const curDomIt = SCAN_STATE.slipQueue.items && SCAN_STATE.slipQueue.items[SCAN_STATE.slipQueue.currentIndex];
        if (curDomIt) {
          curDomIt.scanBundle = finalExt;
          if (finalExt.fileName) curDomIt.fileName = finalExt.fileName;
          const nextDomTitle = finalExt.label || finalExt.fileName;
          if (nextDomTitle) curDomIt.title = String(nextDomTitle);
        }
        refreshQueueBarsOnly();
      }
      return applyDomRes;
    } finally {
      if (SCAN_STATE.domScanGen === domGen) {
        SCAN_STATE.domBusy = false;
        if (hasActiveSlipQueue()) refreshQueueBarsOnly();
      }
    }
  }

  // ==================== BILINGUAL IDENTITY SCAN & FATHER'S NAME BACKFILL ====================
  const BASE_AR_TO_LATIN_WORDS = {
    'علي': 'Ali', 'حسين': 'Hussein', 'حسن': 'Hassan', 'عباس': 'Abbas', 'محمود': 'Mahmoud',
    'ابراهيم': 'Ibrahim', 'إبراهيم': 'Ibrahim', 'خليل': 'Khalil', 'بلال': 'Bilal', 'خزعل': 'Khazaal',
    'يوسف': 'Youssef', 'جورج': 'Georges', 'مارك': 'Mark', 'فادي': 'Fadi', 'شادي': 'Chadi',
    'رامي': 'Rami', 'ربيع': 'Rabea', 'كريم': 'Karim', 'طارق': 'Tarek', 'زياد': 'Ziad',
    'وليد': 'Walid', 'سمير': 'Samir', 'غسان': 'Ghassan', 'منصور': 'Mansour', 'سعيد': 'Said',
    'نبيل': 'Nabil', 'فيصل': 'Faisal', 'ياسين': 'Yassin', 'سهيب': 'Soheib',
    'منال': 'Manal', 'زينب': 'Zeinab', 'فاطمة': 'Fatima', 'مريم': 'Mariam', 'نور': 'Nour',
    'سارة': 'Sara', 'ايه': 'Aya', 'آية': 'Aya', 'صباح': 'Sabah',
    'حرب': 'Harb', 'كرم': 'Karam', 'حداد': 'Hadad', 'قسيس': 'Kassis', 'خميس': 'Khames',
    'ال': 'Al', 'ابو': 'Abou', 'أبو': 'Abou', 'علاء': 'Ala', 'الدين': 'Eddine', 'تيه': 'Tayeh'
  };

  let _nbCacheSrc = null;
  let _nbCacheArToLat = null;
  let _nbCacheLatToAr = null;
  let _nbCachePatSet = null;
  const _EMPTY_NB_OBJ = Object.freeze({});
  function _refreshNameBookTables() {
    const book = (typeof window !== 'undefined' && window.MFG_NAMEBOOK && typeof window.MFG_NAMEBOOK.get === 'function')
      ? (window.MFG_NAMEBOOK.get() || _EMPTY_NB_OBJ)
      : _EMPTY_NB_OBJ;
    if (book === _nbCacheSrc && _nbCacheArToLat && _nbCacheLatToAr && _nbCachePatSet) return;
    _nbCacheSrc = book;
    const arMap = Object.assign({}, BASE_AR_TO_LATIN_WORDS);
    const privAr = book && typeof book.ar_latin_words === 'object' && book.ar_latin_words ? book.ar_latin_words : null;
    if (privAr) Object.assign(arMap, privAr);
    const latMap = Object.create(null);
    Object.keys(arMap).forEach(arW => {
      const k = String(arMap[arW] || '').toLowerCase();
      if (k && !latMap[k]) latMap[k] = arW;
    });
    const patSet = new Set(BASE_COMPOUND_PATRONYMIC_BLOCK);
    const privPat = Array.isArray(book && book.patronymic_tokens) ? book.patronymic_tokens : null;
    if (privPat) privPat.forEach(t => { if (t) patSet.add(String(t).toLowerCase()); });
    _nbCacheArToLat = arMap;
    _nbCacheLatToAr = latMap;
    _nbCachePatSet = patSet;
  }
  function getArToLatinWords() { _refreshNameBookTables(); return _nbCacheArToLat; }
  function getLatinToArWords() { _refreshNameBookTables(); return _nbCacheLatToAr; }
  function isCompoundPatronymicToken(tok) { _refreshNameBookTables(); return _nbCachePatSet.has(tok); }

  const AR_CHAR_MAP = {
    'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'aa', 'ب': 'b', 'ت': 't', 'ث': 'th',
    'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z',
    'س': 's', 'ش': 'ch', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a',
    'غ': 'gh', 'ف': 'f', 'ق': 'k', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
    'ه': 'h', 'ة': 'a', 'و': 'ou', 'ي': 'i', 'ى': 'a', 'ئ': 'e', 'ؤ': 'o', 'ء': ''
  };

  const LATIN_CONSONANT_AR = {
    kh: 'خ', gh: 'غ', sh: 'ش', ch: 'ش', th: 'ث', dh: 'ذ', ph: 'ف', ou: 'و', oo: 'و', ee: 'ي', aa: 'ا', ai: 'ي', ei: 'ي',
    a: 'ا', b: 'ب', c: 'ك', d: 'د', e: 'ي', f: 'ف', g: 'غ', h: 'ه', i: 'ي', j: 'ج', k: 'ك', l: 'ل',
    m: 'م', n: 'ن', o: 'و', p: 'ب', q: 'ق', r: 'ر', s: 'س', t: 'ت', u: 'و', v: 'ف', w: 'و', x: 'كس', y: 'ي', z: 'ز'
  };

  const NATIONALITY_CATALOG = [
    { latin: 'Lebanese', ar: 'لبناني', rx: /(لبنان(?:ي|يه|ية)?|الجمهورية\s*اللبنانية|lebanese|lebanon|liban(?:ais|aise|e)?)/i },
    { latin: 'Syrian', ar: 'سوري', rx: /(سور(?:ي|يه|ية)|الجمهورية\s*العربية\s*السورية|syrian|syria|syrien(?:ne)?)/i },
    { latin: 'Palestinian', ar: 'فلسطيني', rx: /(فلسطين(?:ي|يه|ية)?|palestin(?:ian|e|ien|ienne))/i },
    { latin: 'Egyptian', ar: 'مصري', rx: /(مصر(?:ي|يه|ية)?|egypt(?:ian|e|ien|ienne)?)/i },
    { latin: 'Jordanian', ar: 'أردني', rx: /(اردن(?:ي|يه|ية)?|أردن(?:ي|يه|ية)?|jordan(?:ian|ien|ienne)?)/i },
    { latin: 'Iraqi', ar: 'عراقي', rx: /(عراق(?:ي|يه|ية)?|iraq(?:i|ien|ienne)?)/i },
    { latin: 'Sudanese', ar: 'سوداني', rx: /(سودان(?:ي|يه|ية)?|sudan(?:ese)?|soudan(?:ais|aise)?)/i },
    { latin: 'Ethiopian', ar: 'إثيوبي', rx: /(اثيوبي(?:ة|ه)?|إثيوبي(?:ة|ه)?|حبشي|ethiop(?:ian|ien|ienne)?)/i },
    { latin: 'Bangladeshi', ar: 'بنغلاديشي', rx: /(بنغلاديش(?:ي|ية)?|بنجلاديش|bangladesh(?:i)?)/i },
    { latin: 'Indian', ar: 'هندي', rx: /(هند(?:ي|يه|ية)|india(?:n)?|indien(?:ne)?)/i },
    { latin: 'Filipino', ar: 'فلبيني', rx: /(فلبين(?:ي|يه|ية)?|filipin(?:o|a)|philippin(?:e|es)?)/i },
    { latin: 'Sri Lankan', ar: 'سريلانكي', rx: /(سريلانك(?:ي|ية)|sri\s*lank(?:an|a))/i },
    { latin: 'Pakistani', ar: 'باكستاني', rx: /(باكستان(?:ي|ية)?|pakistan(?:i)?)/i },
    { latin: 'Nepalese', ar: 'نيبالي', rx: /(نيبال(?:ي|ية)?|nepal(?:ese|i)?)/i },
    { latin: 'French', ar: 'فرنسي', rx: /(فرنس(?:ي|يه|ية)|french|fran[cç]ais(?:e)?)/i }
  ];

  const BASE_COMPOUND_PATRONYMIC_BLOCK = new Set([
    'al', 'el', 'ul', 'il', 'abou', 'abu', 'abo', 'abi', 'abd', 'abdel', 'abdul',
    'ben', 'bin', 'bint', 'ibn', 'oum', 'um', 'umm', 'ala', 'eddine', 'eldine', 'aldin', 'eldin',
    'din', 'deen', 'allah', 'oulah', 'st', 'saint', 'de', 'la', 'del', 'da', 'di', 'van', 'von',
    'driver', 'worker', 'staff', 'chef', 'eng', 'dr', 'mr', 'mrs', 'ms',
    'ال', 'ابو', 'أبو', 'ابي', 'أبي', 'ام', 'أم', 'عبد', 'بن', 'بنت', 'ابن', 'علاء', 'الدين', 'الله'
  ]);

  function cleanArabicRaw(s) {
    return normalizeDigits(String(s || ''))
      .replace(/[\u0640\u064B-\u065F\u0670]/g, '')
      .replace(/[أإآ]/g, m => (m === 'آ' ? 'آ' : (m === 'إ' ? 'إ' : 'أ')))
      .replace(/\s+/g, ' ')
      .trim();
  }

  function hasArabicScript(s) {
    return /[\u0600-\u06FF]/.test(String(s || ''));
  }

  function hasLatinScript(s) {
    return /[A-Za-z]/.test(String(s || ''));
  }

  function titleCaseLatin(s) {
    return String(s || '').trim().replace(/\s+/g, ' ').split(' ').map(w => {
      if (!w) return '';
      if (/^\(\d+\)$/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).join(' ');
  }

  function transliterateArabicNameToLatin(arStr) {
    const clean = cleanArabicRaw(arStr);
    if (!clean) return '';
    if (!hasArabicScript(clean)) return titleCaseLatin(clean);
    const words = clean.split(/\s+/).filter(Boolean);
    const arToLatin = getArToLatinWords();
    const out = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const noDiac = w.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ة');
      if (arToLatin[w]) { out.push(arToLatin[w]); continue; }
      if (arToLatin[noDiac]) { out.push(arToLatin[noDiac]); continue; }
      if (w.startsWith('ال') && w.length > 3) {
        const tail = w.slice(2);
        const mappedTail = arToLatin[tail] || transliterateArabicNameToLatin(tail);
        if (mappedTail) { out.push('Al ' + mappedTail); continue; }
      }
      let buf = '';
      for (let ci = 0; ci < w.length; ci++) {
        const ch = w[ci];
        if (AR_CHAR_MAP[ch] !== undefined) buf += AR_CHAR_MAP[ch];
        else if (/[A-Za-z0-9-]/.test(ch)) buf += ch;
      }
      buf = buf.replace(/(.)\1{2,}/g, '$1$1').replace(/^ou/, 'W');
      if (buf) out.push(buf.charAt(0).toUpperCase() + buf.slice(1));
    }
    return out.join(' ').replace(/\s+/g, ' ').trim();
  }

  function transliterateLatinNameToArabic(latStr) {
    const clean = String(latStr || '').trim().replace(/\s+/g, ' ');
    if (!clean) return '';
    if (hasArabicScript(clean)) return cleanArabicRaw(clean);
    const words = clean.split(/\s+/).filter(Boolean);
    const latinToAr = getLatinToArWords();
    const out = [];
    for (const w of words) {
      const cleanW = w.replace(/[^A-Za-z'-]/g, '');
      if (!cleanW) continue;
      const lw = cleanW.toLowerCase();
      if (latinToAr[lw]) { out.push(latinToAr[lw]); continue; }
      let idx = 0;
      let arBuf = '';
      while (idx < lw.length) {
        const pair = lw.slice(idx, idx + 2);
        if (LATIN_CONSONANT_AR[pair]) {
          arBuf += LATIN_CONSONANT_AR[pair];
          idx += 2;
          continue;
        }
        const ch = lw[idx];
        if (ch === '-' || ch === "'") { idx++; continue; }
        if (idx > 0 && idx < lw.length - 1 && (ch === 'e' || ch === 'o') && !/[aeiou]/.test(lw[idx - 1])) {
          idx++;
          continue;
        }
        arBuf += LATIN_CONSONANT_AR[ch] || '';
        idx++;
      }
      if (arBuf) out.push(arBuf);
    }
    return out.join(' ').replace(/\s+/g, ' ').trim();
  }

  function canonicalizeNationality(raw) {
    const clean = normalizeDigits(String(raw || '')).trim();
    if (!clean) return { latin: '', ar: '' };
    for (const entry of NATIONALITY_CATALOG) {
      if (entry.rx.test(clean)) return { latin: entry.latin, ar: entry.ar };
    }
    if (hasArabicScript(clean)) {
      return { latin: transliterateArabicNameToLatin(clean), ar: cleanArabicRaw(clean) };
    }
    const tit = titleCaseLatin(clean);
    return { latin: tit, ar: transliterateLatinNameToArabic(tit) };
  }

  function normalizeIdentityDate(raw) {
    const s = normalizeDigits(String(raw || '')).trim();
    if (!s) return { dob: '', birthYear: '' };
    const isoM = s.match(/\b((?:19|20)\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
    if (isoM) {
      const y = Number(isoM[1]), mo = Number(isoM[2]), d = Number(isoM[3]);
      if (y >= 1930 && y <= new Date().getFullYear() && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        return { dob: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`, birthYear: String(y) };
      }
    }
    const dmyM = s.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.]((?:19|20)\d{2})\b/);
    if (dmyM) {
      let d = Number(dmyM[1]), mo = Number(dmyM[2]), y = Number(dmyM[3]);
      if (mo > 12 && d <= 12) { const tmp = d; d = mo; mo = tmp; }
      if (y >= 1930 && y <= new Date().getFullYear() && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        return { dob: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`, birthYear: String(y) };
      }
    }
    const yrM = s.match(/\b((?:19|20)\d{2})\b/);
    if (yrM) {
      const y = Number(yrM[1]);
      if (y >= 1930 && y <= new Date().getFullYear()) return { dob: '', birthYear: String(y) };
    }
    return { dob: '', birthYear: '' };
  }

  function normalizeIdentityExpiryDate(raw) {
    const s = normalizeDigits(String(raw || '')).trim();
    if (!s) return '';
    const isExactCalendar = (y, mo, d) => {
      if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return false;
      const chk = new Date(Date.UTC(y, mo - 1, d));
      return chk.getUTCFullYear() === y && chk.getUTCMonth() === mo - 1 && chk.getUTCDate() === d;
    };
    const isoM = s.match(/\b((?:199\d|20\d{2}|2100))[-/.](\d{1,2})[-/.](\d{1,2})\b/);
    if (isoM) {
      const y = Number(isoM[1]), mo = Number(isoM[2]), d = Number(isoM[3]);
      if (isExactCalendar(y, mo, d)) {
        return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
      return '';
    }
    const dmyM = s.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.]((?:199\d|20\d{2}|2100))\b/);
    if (dmyM) {
      let d = Number(dmyM[1]), mo = Number(dmyM[2]), y = Number(dmyM[3]);
      if (mo > 12 && d <= 12) { const tmp = d; d = mo; mo = tmp; }
      if (isExactCalendar(y, mo, d)) {
        return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
    return '';
  }

  function stripMiddleFatherToken(fullName, fatherName, useArabic) {
    const fn = String(fullName || '').trim().replace(/\s+/g, ' ');
    const fa = String(fatherName || '').trim().replace(/\s+/g, ' ');
    if (!fn || !fa) return fn;
    const parts = fn.split(/\s+/);
    if (parts.length < 3) return fn;
    const faKey = useArabic
      ? cleanArabicRaw(fa).replace(/[أإآ]/g, 'ا')
      : norm(fa);
    const midKey = useArabic
      ? cleanArabicRaw(parts[1]).replace(/[أإآ]/g, 'ا')
      : norm(parts[1]);
    if (faKey && midKey === faKey) {
      return [parts[0]].concat(parts.slice(2)).join(' ');
    }
    return fn;
  }

  function extractIdSegmentAfter(text, labelPatterns, stopPatterns) {
    const src = normalizeDigits(String(text || ''));
    for (const lRx of labelPatterns) {
      const m = src.match(lRx);
      if (!m || m.index == null) continue;
      let rest = src.slice(m.index + m[0].length);
      rest = rest.replace(/^[ \t:=\-\u2013\u2014\u00b7\u2022/|]+/, '');
      let cutIdx = rest.length;
      const nlIdx = rest.search(/[\r\n]+/);
      if (nlIdx >= 0 && nlIdx < cutIdx) cutIdx = nlIdx;
      for (const sRx of stopPatterns) {
        const sm = rest.match(sRx);
        if (sm && sm.index != null && sm.index >= 0 && sm.index < cutIdx) {
          cutIdx = sm.index;
        }
      }
      const valOut = rest.slice(0, cutIdx).replace(/^[\s:|\-/]+|[\s:|\-/]+$/g, '').trim();
      if (valOut) return valOut;
    }
    return '';
  }

  function parseIdentityCardDeterministic(rawText, fileName = '') {
    const normTxt = normalizeDigits(String(rawText || '').replace(/\u200f|\u200e/g, ' '));
    const fname = String(fileName || '');
    const combined = `${normTxt}\n${fname}`;
    let docKind = 'id_card';
    if (/(الضمان\s*الاجتماعي|الصندوق\s*الوطني\s*للضمان|بطاقة\s*المضمون|\bnssf\b|\bcnss\b)/i.test(combined)) {
      docKind = 'nssf_card';
    } else if (/(إخراج\s*قيد|اخراج\s*قيد|civil\s*extract)/i.test(combined)) {
      docKind = 'civil_extract';
    } else if (/(إجازة\s*عمل|اجازة\s*عمل|وزارة\s*العمل|ministry\s*of\s*labo(?:ur|r)|work[\s_-]*permit)/i.test(combined)) {
      docKind = 'work_permit';
    } else if (/(بطاقة\s*إقامة|بطاقة\s*اقامة|اقامة|إقامة|الأمن\s*العام|general\s*security|s[ûu]ret[ée]\s*g[ée]n[ée]rale|residen(?:cy|ce)[\s_-]*(?:permit|card))/i.test(combined)) {
      docKind = 'residency_permit';
    } else if (/(بطاقة\s*هوية|الجمهورية\s*اللبنانية|lebanese\s*id|\bidentity\s*card\b)/i.test(combined)) {
      docKind = 'lebanese_id';
    } else if (/(passport|جواز\s*سفر)/i.test(combined)) {
      docKind = 'passport';
    }

    const AR_STOPS = [
      /[ \t]+(?:الاسم|الإسم|الشهرة|اسم\s*الأب|إسم\s*الأب|اسم\s*الاب|الأب|اسم\s*الأم|الأم|تاريخ\s*الولادة|تاريخ\s*الميلاد|تاريخ\s*الإصدار|تاريخ\s*الاصدار|تاريخ\s*الانتهاء|صلاحية|صالحة\s*لغاية|تمديد|تجديد|محل\s*الولادة|محل\s*القيد|الوضع\s*العائلي|الجنس|الجنسية|رقم\s*الهوية|رقم\s*السجل|رقم\s*التسجيل|رقم\s*المضمون|رقم\s*الضمان|رقم\s*(?:إجازة|اجازة)\s*العمل|رقم\s*(?:الإقامة|الاقامة)|الرقم)\s*[:=\-\u2013\u2014]?/,
      /[ \t]+(?:Full\s*Name|First\s*Name|Last\s*Name|Surname|Father(?:'s)?\s*Name|Mother(?:'s)?\s*Name|Date\s*of\s*Birth|Birth\s*Date|Date\s*de\s*naissance|Issue\s*Date|Issued|Expiry\s*Date|Expires|Valid\s*(?:Until|Thru)|Renewed\s*(?:Until|Thru|To)|Extension|Date\s*d['’][ée]mission|Date\s*d['’]expiration|DOB|Nationality|Civil\s*Registry(?:\s*(?:No|Number|#))?|Register\s*(?:No|Number|#)|Place\s*of\s*Reg(?:istration)?|Marital\s*Status|ID\s*(?:No|Number|#)|NSSF\s*(?:No|Number|#)|CNSS\s*(?:No|Number|#)|Work\s*Permit\s*(?:No|Number|#|Expiry)|Residen(?:cy|ce)\s*(?:Permit\s*)?(?:No|Number|#|Expiry))\s*[:=\-\u2013\u2014]?/i
    ];

    const firstArRaw = extractIdSegmentAfter(normTxt, [
      /(?:^|[\n\r|])[ \t]*(?:الاسم|الإسم)[ \t]*[:=\-\u2013\u2014][ \t]*/m,
      /(?:^|[ \t])(?:الاسم|الإسم)(?![ \t]*(?:الأب|الاب|الأم|الشهرة|والشهرة|الكامل|المضمون))[ \t]*[:=\-\u2013\u2014]?[ \t]+(?=[\u0600-\u06FF])/
    ], AR_STOPS);
    const lastArRaw = extractIdSegmentAfter(normTxt, [
      /(?:^|[\n\r|]|[ \t])الشهرة[ \t]*[:=\-\u2013\u2014]?[ \t]*/m
    ], AR_STOPS);
    const fullArLabeled = extractIdSegmentAfter(normTxt, [
      /(?:اسم\s*المضمون\s*وشهرته|اسم\s*المضمون|الاسم\s*وشهرته|الاسم\s*والشهرة|الاسم\s*الكامل)[ \t]*[:=\-\u2013\u2014]?[ \t]*/
    ], AR_STOPS);
    const fatherArRaw = extractIdSegmentAfter(normTxt, [
      /(?:اسم\s*الأب|إسم\s*الأب|اسم\s*الاب|إسم\s*الاب)[ \t]*[:=\-\u2013\u2014]?[ \t]*/
    ], AR_STOPS);
    const motherArRaw = extractIdSegmentAfter(normTxt, [
      /(?:اسم\s*الأم\s*وشهرتها|اسم\s*الأم|إسم\s*الأم)[ \t]*[:=\-\u2013\u2014]?[ \t]*/
    ], AR_STOPS);
    const dobArRaw = extractIdSegmentAfter(normTxt, [
      /(?:تاريخ\s*الولادة|تاريخ\s*الميلاد|مواليد)[ \t]*[:=\-\u2013\u2014]?[ \t]*/
    ], AR_STOPS);
    const natArRaw = extractIdSegmentAfter(normTxt, [
      /(?:الجنسية)[ \t]*[:=\-\u2013\u2014]?[ \t]*/
    ], AR_STOPS);
    const idArRaw = extractIdSegmentAfter(normTxt, [
      /(?:رقم\s*الهوية|رقم\s*البطاقة|الرقم\s*الوطني)[ \t]*[:=\-\u2013\u2014]?[ \t]*/
    ], AR_STOPS);
    const civilRegNoArRaw = extractIdSegmentAfter(normTxt, [
      /(?:رقم\s*السجل|السجل)[ \t]*[:=\-\u2013\u2014]?[ \t]*/
    ], AR_STOPS);
    const civilRegPlaceArRaw = extractIdSegmentAfter(normTxt, [
      /(?:محل\s*القيد|القيد)[ \t]*[:=\-\u2013\u2014]?[ \t]*/
    ], AR_STOPS);
    const maritalArRaw = extractIdSegmentAfter(normTxt, [
      /(?:الوضع\s*العائلي|الحالة\s*الاجتماعية)[ \t]*[:=\-\u2013\u2014]?[ \t]*/
    ], AR_STOPS);
    const nssfArRaw = extractIdSegmentAfter(normTxt, [
      /(?:رقم\s*المضمون|رقم\s*التسجيل\s*في\s*الضمان|رقم\s*التسجيل|رقم\s*الضمان)[ \t]*[:=\-\u2013\u2014]?[ \t]*/
    ], AR_STOPS);
    const wpNoArRaw = extractIdSegmentAfter(normTxt, [
      /(?:رقم\s*(?:إجازة|اجازة)\s*العمل)[ \t]*[:=\-\u2013\u2014]?[ \t]*/
    ], AR_STOPS);
    const resNoArRaw = extractIdSegmentAfter(normTxt, [
      /(?:رقم\s*(?:بطاقة\s*)?(?:الإقامة|الاقامة))[ \t]*[:=\-\u2013\u2014]?[ \t]*/
    ], AR_STOPS);
    const issueArRaw = extractIdSegmentAfter(normTxt, [
      /(?:تاريخ\s*الإصدار|تاريخ\s*الاصدار)[ \t]*[:=\-\u2013\u2014]?[ \t]*/
    ], AR_STOPS);
    const wpExpArRaw = extractIdSegmentAfter(normTxt, [
      /(?:(?:تاريخ\s*)?(?:انتهاء|صلاحية)\s*(?:إجازة|اجازة)\s*العمل)[ \t]*[:=\-\u2013\u2014]?[ \t]*/
    ], AR_STOPS);
    const resExpArRaw = extractIdSegmentAfter(normTxt, [
      /(?:(?:تاريخ\s*)?(?:انتهاء|صلاحية)\s*(?:الإقامة|الاقامة))[ \t]*[:=\-\u2013\u2014]?[ \t]*/
    ], AR_STOPS);
    const renewArRaw = extractIdSegmentAfter(normTxt, [
      /(?:آخر\s*تجديد|تجديد\s*لغاية|تجديد|تمديد\s*لغاية|تمديد)[ \t]*[:=\-\u2013\u2014]?[ \t]*/
    ], AR_STOPS);
    const expArRaw = extractIdSegmentAfter(normTxt, [
      /(?:تاريخ\s*الانتهاء|صلاحية\s*البطاقة|صالحة\s*لغاية|تنتهي\s*(?:في|بتاريخ))[ \t]*[:=\-\u2013\u2014]?[ \t]*/
    ], AR_STOPS);

    const fullLatLabeled = extractIdSegmentAfter(normTxt, [
      /(?:Full\s*Name|Nom\s*et\s*Pr[ée]nom|Worker\s*Name|Employee\s*Name)[ \t]*[:=\-\u2013\u2014]?[ \t]*/i
    ], AR_STOPS);
    const firstLatRaw = extractIdSegmentAfter(normTxt, [
      /(?:First\s*Name|Given\s*Name|Pr[ée]nom)[ \t]*[:=\-\u2013\u2014]?[ \t]*/i
    ], AR_STOPS);
    const lastLatRaw = extractIdSegmentAfter(normTxt, [
      /(?:Last\s*Name|Family\s*Name|Surname|Nom\s*de\s*famille)[ \t]*[:=\-\u2013\u2014]?[ \t]*/i
    ], AR_STOPS);
    const fatherLatRaw = extractIdSegmentAfter(normTxt, [
      /(?:Father(?:'s)?\s*Name|Nom\s*du\s*p[èe]re|Father)[ \t]*[:=\-\u2013\u2014]?[ \t]*/i
    ], AR_STOPS);
    const dobLatRaw = extractIdSegmentAfter(normTxt, [
      /(?:Date\s*of\s*Birth|Birth\s*Date|Date\s*de\s*naissance|N[ée]e?\s*le|D\.?O\.?B\.?|DOB)[ \t]*[:=\-\u2013\u2014]?[ \t]*/i
    ], AR_STOPS);
    const natLatRaw = extractIdSegmentAfter(normTxt, [
      /(?:Nationality|Nationalit[ée]|Citizenship)[ \t]*[:=\-\u2013\u2014]?[ \t]*/i
    ], AR_STOPS);
    const idLatRaw = extractIdSegmentAfter(normTxt, [
      /(?:ID\s*(?:No|Number|#)|Civil\s*ID|Matricule)[ \t]*[:=\-\u2013\u2014]?[ \t]*/i
    ], AR_STOPS);
    const civilRegNoLatRaw = extractIdSegmentAfter(normTxt, [
      /(?:Civil\s*Registry(?:\s*(?:No|Number|#))?|Register\s*(?:No|Number|#)|N°?\s*de\s*registre)[ \t]*[:=\-\u2013\u2014]?[ \t]*/i
    ], AR_STOPS);
    const civilRegPlaceLatRaw = extractIdSegmentAfter(normTxt, [
      /(?:Place\s*of\s*Reg(?:istration)?|Lieu\s*d['’]inscription|Registry\s*Place)[ \t]*[:=\-\u2013\u2014]?[ \t]*/i
    ], AR_STOPS);
    const maritalLatRaw = extractIdSegmentAfter(normTxt, [
      /(?:Marital\s*Status|[ÉE]tat\s*civil)[ \t]*[:=\-\u2013\u2014]?[ \t]*/i
    ], AR_STOPS);
    const nssfLatRaw = extractIdSegmentAfter(normTxt, [
      /(?:NSSF\s*(?:No|Number|#)|CNSS\s*(?:No|Number|#))[ \t]*[:=\-\u2013\u2014]?[ \t]*/i
    ], AR_STOPS);
    const wpNoLatRaw = extractIdSegmentAfter(normTxt, [
      /(?:Work\s*Permit\s*(?:No|Number|#)|Permis\s*de\s*travail\s*(?:N°|No)?)[ \t]*[:=\-\u2013\u2014]?[ \t]*/i
    ], AR_STOPS);
    const resNoLatRaw = extractIdSegmentAfter(normTxt, [
      /(?:Residen(?:cy|ce)\s*(?:Permit\s*)?(?:No|Number|#)|Carte\s*de\s*s[ée]jour\s*(?:N°|No)?)[ \t]*[:=\-\u2013\u2014]?[ \t]*/i
    ], AR_STOPS);
    const issueLatRaw = extractIdSegmentAfter(normTxt, [
      /(?:Issue\s*Date|Date\s*Issued|Date\s*d['’]?[ée]mission)[ \t]*[:=\-\u2013\u2014]?[ \t]*/i
    ], AR_STOPS);
    const wpExpLatRaw = extractIdSegmentAfter(normTxt, [
      /(?:Work\s*Permit\s*Expiry(?:\s*Date)?)[ \t]*[:=\-\u2013\u2014]?[ \t]*/i
    ], AR_STOPS);
    const resExpLatRaw = extractIdSegmentAfter(normTxt, [
      /(?:Residen(?:cy|ce)\s*(?:Permit\s*)?Expiry(?:\s*Date)?)[ \t]*[:=\-\u2013\u2014]?[ \t]*/i
    ], AR_STOPS);
    const renewLatRaw = extractIdSegmentAfter(normTxt, [
      /(?:Renewed\s*(?:Until|Thru|To)|Latest\s*Renewal|Extension\s*(?:Until|Thru))[ \t]*[:=\-\u2013\u2014]?[ \t]*/i
    ], AR_STOPS);
    const expLatRaw = extractIdSegmentAfter(normTxt, [
      /(?:Expiry\s*Date|Exp\.?\s*Date|Valid\s*(?:Until|Thru|To)|Expires\s*(?:on)?|Date\s*d['’]?expiration)[ \t]*[:=\-\u2013\u2014]?[ \t]*/i
    ], AR_STOPS);

    const keepArOnly = s => cleanArabicRaw(String(s || '').replace(/[A-Za-z0-9.,/\\|()[\]]+/g, ' ').trim());
    const keepLatOnly = s => String(s || '').replace(/[\u0600-\u06FF]+/g, ' ').replace(/\s+/g, ' ').trim();

    let firstNameArabic = keepArOnly(firstArRaw);
    let lastNameArabic = keepArOnly(lastArRaw);
    let fullNameArabic = keepArOnly(fullArLabeled);
    if (!fullNameArabic && (firstNameArabic || lastNameArabic)) {
      fullNameArabic = [firstNameArabic, lastNameArabic].filter(Boolean).join(' ').trim();
    }
    let fatherNameArabic = keepArOnly(fatherArRaw);
    const motherNameArabic = keepArOnly(motherArRaw);
    if (fullNameArabic && fatherNameArabic) {
      fullNameArabic = stripMiddleFatherToken(fullNameArabic, fatherNameArabic, true);
    }

    let firstNameLatin = keepLatOnly(firstLatRaw);
    let lastNameLatin = keepLatOnly(lastLatRaw);
    let fullNameLatin = keepLatOnly(fullLatLabeled);
    if (!fullNameLatin && (firstNameLatin || lastNameLatin)) {
      fullNameLatin = [firstNameLatin, lastNameLatin].filter(Boolean).join(' ').trim();
    }
    let fatherNameLatin = keepLatOnly(fatherLatRaw);
    if (fullNameLatin && fatherNameLatin) {
      fullNameLatin = stripMiddleFatherToken(fullNameLatin, fatherNameLatin, false);
    }

    if (!fatherNameArabic && !fatherNameLatin) {
      const arToks = fullNameArabic ? fullNameArabic.split(/\s+/).filter(Boolean) : [];
      const latForSplit = fullNameLatin || (fullNameArabic ? transliterateArabicNameToLatin(fullNameArabic) : '');
      const latToks = latForSplit ? latForSplit.split(/\s+/).filter(Boolean) : [];
      if (latToks.length === 3) {
        const splitHit = matchStaffAgainstThreePartName([latToks[0], latToks[2]], latForSplit);
        if (splitHit && splitHit.father) {
          fatherNameLatin = splitHit.father;
          fatherNameArabic = arToks.length === 3 ? arToks[1] : transliterateLatinNameToArabic(splitHit.father);
          if (arToks.length === 3) {
            fullNameArabic = `${arToks[0]} ${arToks[2]}`;
          }
          if (fullNameLatin) {
            fullNameLatin = stripMiddleFatherToken(fullNameLatin, fatherNameLatin, false);
          }
        }
      }
    }

    const dobCandidate = dobArRaw || dobLatRaw || '';
    const dateInfo = dobCandidate ? normalizeIdentityDate(dobCandidate) : { dob: '', birthYear: '' };
    let natInfo = canonicalizeNationality(natArRaw || natLatRaw);
    if (!natInfo.latin && (docKind === 'lebanese_id' || docKind === 'civil_extract' || /(الجمهورية\s*اللبنانية|r[ée]publique\s*libanaise)/i.test(normTxt))) {
      natInfo = { latin: 'Lebanese', ar: 'لبناني' };
    } else if (!natInfo.latin) {
      const catHit = NATIONALITY_CATALOG.find(entry => entry.rx.test(normTxt));
      if (catHit) natInfo = { latin: catHit.latin, ar: catHit.ar };
    }

    const idCand = idArRaw || idLatRaw || '';
    const idDigits = (idCand.match(/[A-Z0-9-]{4,24}/i) || [])[0] || '';
    const civilRegCand = civilRegNoLatRaw || civilRegNoArRaw || '';
    const civilRegNo = (civilRegCand.match(/[A-Z0-9/\-]{1,28}/i) || [])[0] || '';
    const civilRegistryPlace = String(civilRegPlaceLatRaw || civilRegPlaceArRaw || '').trim().slice(0, 80);
    const maritalStatus = String(maritalLatRaw || maritalArRaw || '').trim().slice(0, 48);
    const nssfCand = nssfArRaw || nssfLatRaw || '';
    const nssfDigits = (nssfCand.match(/[A-Z0-9/-]{4,28}/i) || [])[0] || '';
    const wpCand = wpNoArRaw || wpNoLatRaw || '';
    const wpDigits = (wpCand.match(/[A-Z0-9/-]{4,28}/i) || [])[0] || '';
    const resCand = resNoArRaw || resNoLatRaw || '';
    const resDigits = (resCand.match(/[A-Z0-9/-]{4,28}/i) || [])[0] || '';

    const pickLaterIso = (a, b) => {
      if (a && b) return a >= b ? a : b;
      return a || b || '';
    };
    const issueDate = normalizeIdentityExpiryDate(issueArRaw || issueLatRaw || '');
    const wpExpNorm = normalizeIdentityExpiryDate(wpExpArRaw || wpExpLatRaw || '');
    const resExpNorm = normalizeIdentityExpiryDate(resExpArRaw || resExpLatRaw || '');
    const renewExpNorm = normalizeIdentityExpiryDate(renewArRaw || renewLatRaw || '');
    const genExpRawNorm = normalizeIdentityExpiryDate(expArRaw || expLatRaw || '');
    const genExpNorm = pickLaterIso(renewExpNorm, genExpRawNorm);

    const workPermitNumber = wpDigits || (docKind === 'work_permit' ? idDigits : '');
    const workPermitExpiryDate = wpExpNorm || (docKind === 'work_permit' ? genExpNorm : '');
    const residencyNumber = resDigits || (docKind === 'residency_permit' ? idDigits : '');
    const residencyExpiryDate = resExpNorm || (docKind === 'residency_permit' ? genExpNorm : '');
    const idExpiryDate = (docKind !== 'work_permit' && docKind !== 'residency_permit') ? genExpNorm : '';
    const nssfNumber = nssfDigits || (docKind === 'nssf_card' ? idDigits : '');

    if (!fullNameLatin && fullNameArabic) fullNameLatin = transliterateArabicNameToLatin(fullNameArabic);
    if (!fullNameArabic && fullNameLatin) fullNameArabic = transliterateLatinNameToArabic(fullNameLatin);
    if (!fatherNameLatin && fatherNameArabic) fatherNameLatin = transliterateArabicNameToLatin(fatherNameArabic);
    if (!fatherNameArabic && fatherNameLatin) fatherNameArabic = transliterateLatinNameToArabic(fatherNameLatin);

    return normalizeIdentityScanResult({
      docKind,
      fullNameLatin,
      fullNameArabic,
      firstNameLatin,
      lastNameLatin,
      firstNameArabic,
      lastNameArabic,
      fatherNameLatin,
      fatherNameArabic,
      motherNameLatin: '',
      motherNameArabic,
      dob: dateInfo.dob,
      birthYear: dateInfo.birthYear,
      nationalityLatin: natInfo.latin,
      nationalityArabic: natInfo.ar,
      idNumber: idDigits || workPermitNumber || residencyNumber || nssfNumber || civilRegNo,
      nssfNumber,
      issueDate,
      idExpiryDate,
      workPermitNumber,
      workPermitExpiryDate,
      residencyNumber,
      residencyExpiryDate,
      civilRegistryNumber: civilRegNo,
      civilRegistryPlace,
      maritalStatus,
      gender: ''
    });
  }

  function normalizeIdentityScanResult(raw = {}) {
    const r = (raw && typeof raw === 'object') ? raw : {};
    let fullLat = String(r.fullNameLatin || r.fullName || r.name || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    let fullAr = cleanArabicRaw(String(r.fullNameArabic || r.fullNameAr || '').slice(0, 120));
    let fatherLat = String(r.fatherNameLatin || r.fatherName || r.father_name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    let fatherAr = cleanArabicRaw(String(r.fatherNameArabic || r.fatherNameAr || '').slice(0, 80));

    if (!fullLat && (r.firstNameLatin || r.lastNameLatin)) {
      fullLat = [r.firstNameLatin, r.lastNameLatin].filter(Boolean).join(' ').trim();
    }
    if (!fullAr && (r.firstNameArabic || r.lastNameArabic)) {
      fullAr = cleanArabicRaw([r.firstNameArabic, r.lastNameArabic].filter(Boolean).join(' ').trim());
    }
    if (fullLat && hasArabicScript(fullLat) && !hasLatinScript(fullLat)) {
      if (!fullAr) fullAr = cleanArabicRaw(fullLat);
      fullLat = transliterateArabicNameToLatin(fullAr);
    }
    if (fatherLat && hasArabicScript(fatherLat) && !hasLatinScript(fatherLat)) {
      if (!fatherAr) fatherAr = cleanArabicRaw(fatherLat);
      fatherLat = transliterateArabicNameToLatin(fatherAr);
    }
    if (!fullLat && fullAr) fullLat = transliterateArabicNameToLatin(fullAr);
    if (!fullAr && fullLat) fullAr = transliterateLatinNameToArabic(fullLat);
    if (!fatherLat && fatherAr) fatherLat = transliterateArabicNameToLatin(fatherAr);
    if (!fatherAr && fatherLat) fatherAr = transliterateLatinNameToArabic(fatherLat);

    if (fatherLat) fullLat = stripMiddleFatherToken(fullLat, fatherLat, false);
    if (fatherAr) fullAr = stripMiddleFatherToken(fullAr, fatherAr, true);

    fullLat = fullLat ? titleCaseLatin(fullLat) : '';
    fatherLat = fatherLat ? titleCaseLatin(fatherLat) : '';

    const dateNorm = normalizeIdentityDate(r.dob || r.dateOfBirth || r.birthDate || r.birthYear || '');
    const natNorm = canonicalizeNationality(r.nationalityLatin || r.nationality || r.nationalityArabic || '');
    const docKind = String(r.docKind || 'id_card').trim().toLowerCase();
    const wpNo = normalizeDigits(String(r.workPermitNumber || r.work_permit_no || '').trim()).slice(0, 48);
    const resNo = normalizeDigits(String(r.residencyNumber || r.residency_no || '').trim()).slice(0, 48);
    const nssfRaw = normalizeDigits(String(r.nssfNumber || r.nssf_no || '').trim()).slice(0, 48);
    const rawIdNo = normalizeDigits(String(r.idNumber || '').trim()).slice(0, 48);
    const civilRegistryNumber = normalizeDigits(String(r.civilRegistryNumber || r.civil_registry_no || '').trim()).slice(0, 48);
    const civilRegistryPlace = String(r.civilRegistryPlace || r.civil_registry_place || '').trim().slice(0, 80);
    const maritalStatus = String(r.maritalStatus || r.marital_status || '').trim().slice(0, 48);
    const idNumber = rawIdNo || wpNo || resNo || nssfRaw || normalizeDigits(String(r.reference || '').trim()).slice(0, 48);
    const nssfNumber = nssfRaw || (docKind === 'nssf_card' ? idNumber : '');
    const issueDate = normalizeIdentityExpiryDate(r.issueDate || r.issue_date || '');
    const idExpiryDate = normalizeIdentityExpiryDate(r.idExpiryDate || r.id_expiry_date || '');
    const workPermitExpiryDate = normalizeIdentityExpiryDate(r.workPermitExpiryDate || r.work_permit_expiry || '');
    const residencyExpiryDate = normalizeIdentityExpiryDate(r.residencyExpiryDate || r.residency_expiry || '');
    const sidesNum = Number(r.sidesCaptured || 0);

    return {
      docKind,
      fullNameLatin: fullLat,
      fullNameArabic: fullAr,
      fatherNameLatin: fatherLat,
      fatherNameArabic: fatherAr,
      motherNameLatin: String(r.motherNameLatin || '').trim().slice(0, 80),
      motherNameArabic: cleanArabicRaw(String(r.motherNameArabic || '').slice(0, 80)),
      dob: dateNorm.dob,
      birthYear: dateNorm.birthYear,
      nationalityLatin: natNorm.latin,
      nationalityArabic: natNorm.ar,
      idNumber,
      nssfNumber,
      issueDate,
      idExpiryDate,
      workPermitNumber: wpNo || (docKind === 'work_permit' ? idNumber : ''),
      workPermitExpiryDate,
      residencyNumber: resNo || (docKind === 'residency_permit' ? idNumber : ''),
      residencyExpiryDate,
      civilRegistryNumber,
      civilRegistryPlace,
      maritalStatus,
      sidesCaptured: sidesNum >= 2 ? 2 : (sidesNum === 1 ? 1 : 0),
      gender: String(r.gender || '').trim().slice(0, 16)
    };
  }

  function mergeTwoSidedIdentityScans(frontRaw, backRaw) {
    const hasFront = Boolean(frontRaw && typeof frontRaw === 'object' && Object.keys(frontRaw).some(k => String(frontRaw[k] || '').trim()));
    const hasBack = Boolean(backRaw && typeof backRaw === 'object' && Object.keys(backRaw).some(k => String(backRaw[k] || '').trim()));
    const f = hasFront ? normalizeIdentityScanResult(frontRaw) : normalizeIdentityScanResult({});
    const b = hasBack ? normalizeIdentityScanResult(backRaw) : normalizeIdentityScanResult({});
    const prefFront = k => (f[k] && String(f[k]).trim()) ? String(f[k]).trim() : (b[k] && String(b[k]).trim() ? String(b[k]).trim() : '');
    const prefBack = k => (b[k] && String(b[k]).trim()) ? String(b[k]).trim() : (f[k] && String(f[k]).trim() ? String(f[k]).trim() : '');
    const pickLaterIso = (d1, d2) => {
      const s1 = /^\d{4}-\d{2}-\d{2}$/.test(String(d1 || '').trim()) ? String(d1).trim() : '';
      const s2 = /^\d{4}-\d{2}-\d{2}$/.test(String(d2 || '').trim()) ? String(d2).trim() : '';
      if (s1 && s2) return s1 >= s2 ? s1 : s2;
      return s1 || s2;
    };
    const collectAtts = raw => {
      if (!raw || typeof raw !== 'object') return [];
      const arr = Array.isArray(raw.attObjs) && raw.attObjs.length ? raw.attObjs : (raw.attObj ? [raw.attObj] : []);
      return arr.filter(a => a && typeof a === 'object' && a.name).map(a => Object.assign({}, a));
    };
    const mergedAtts = collectAtts(frontRaw).concat(collectAtts(backRaw));
    const mergedDocKind = (f.docKind && f.docKind !== 'id_card') ? f.docKind : ((b.docKind && b.docKind !== 'id_card') ? b.docKind : 'id_card');
    const foldBackGenericExpToWp = mergedDocKind === 'work_permit' && b.idExpiryDate && !b.workPermitExpiryDate && (!b.docKind || b.docKind === 'id_card' || b.docKind === 'work_permit');
    const foldBackGenericExpToRes = mergedDocKind === 'residency_permit' && b.idExpiryDate && !b.residencyExpiryDate && (!b.docKind || b.docKind === 'id_card' || b.docKind === 'residency_permit');
    const normRes = normalizeIdentityScanResult({
      docKind: mergedDocKind,
      fullNameLatin: prefFront('fullNameLatin'),
      fullNameArabic: prefFront('fullNameArabic'),
      fatherNameLatin: prefFront('fatherNameLatin'),
      fatherNameArabic: prefFront('fatherNameArabic'),
      motherNameLatin: prefFront('motherNameLatin'),
      motherNameArabic: prefFront('motherNameArabic'),
      dob: f.dob || b.dob || f.birthYear || b.birthYear || '',
      birthYear: f.birthYear || b.birthYear || '',
      nationalityLatin: prefFront('nationalityLatin'),
      nationalityArabic: prefFront('nationalityArabic'),
      idNumber: prefFront('idNumber'),
      nssfNumber: f.nssfNumber || b.nssfNumber || '',
      issueDate: f.issueDate || b.issueDate || '',
      idExpiryDate: (foldBackGenericExpToWp || foldBackGenericExpToRes) ? (f.idExpiryDate || '') : pickLaterIso(f.idExpiryDate, b.idExpiryDate),
      workPermitNumber: f.workPermitNumber || b.workPermitNumber || '',
      workPermitExpiryDate: pickLaterIso(f.workPermitExpiryDate, b.workPermitExpiryDate || (foldBackGenericExpToWp ? b.idExpiryDate : '')),
      residencyNumber: f.residencyNumber || b.residencyNumber || '',
      residencyExpiryDate: pickLaterIso(f.residencyExpiryDate, b.residencyExpiryDate || (foldBackGenericExpToRes ? b.idExpiryDate : '')),
      civilRegistryNumber: prefBack('civilRegistryNumber'),
      civilRegistryPlace: prefBack('civilRegistryPlace'),
      maritalStatus: prefBack('maritalStatus'),
      sidesCaptured: (hasFront && hasBack) ? 2 : ((hasFront || hasBack) ? 1 : 0),
      gender: prefFront('gender')
    });
    return Object.assign({}, normRes, {
      ok: true,
      attObj: mergedAtts[0] || null,
      attObjs: mergedAtts,
      previewDataUrl: String((mergedAtts[0] && (mergedAtts[0].data_url || mergedAtts[0].data)) || (frontRaw && frontRaw.previewDataUrl) || (backRaw && backRaw.previewDataUrl) || '')
    });
  }

  function buildSampleIdentityCardFile(kind = 'lebanese_id') {
    const kNorm = String(kind || 'lebanese_id').trim().toLowerCase();
    const isBack = kNorm === 'lebanese_id_back' || kNorm === 'id_back';
    const isNssf = kNorm === 'nssf_card' || kNorm === 'nssf';
    const isWorkPermit = kNorm === 'work_permit' || kNorm === 'permit';
    const isResidency = kNorm === 'residency_permit' || kNorm === 'residency';
    let svgStr = '';
    let fname = 'Sample_Lebanese_ID_Card.svg';
    if (isBack) {
      fname = 'Sample_Lebanese_ID_Back.svg';
      svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
          <rect width="100%" height="100%" rx="16" fill="#FBF9F4" stroke="#8C5E14" stroke-width="2.5"/>
          <rect x="0" y="0" width="640" height="58" rx="14" fill="#8C5E14"/>
          <text x="320" y="26" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="700" fill="#FFFFFF">الجمهورية اللبنانية - ظهر بطاقة الهوية</text>
          <text x="320" y="46" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#FEF3C7">République Libanaise - Reverse Side</text>
          <text x="606" y="100" text-anchor="end" font-family="sans-serif" font-size="15" font-weight="700" fill="#1F1914">رقم السجل: 114</text>
          <text x="606" y="130" text-anchor="end" font-family="sans-serif" font-size="14" fill="#3B3128">محل القيد: المزرعة - بيروت</text>
          <text x="606" y="160" text-anchor="end" font-family="sans-serif" font-size="14" fill="#3B3128">الوضع العائلي: متأهل</text>
          <text x="606" y="190" text-anchor="end" font-family="monospace" font-size="13.5" font-weight="700" fill="#1E40AF">رقم الضمان: 882419-03</text>
          <text x="606" y="220" text-anchor="end" font-family="monospace" font-size="13" fill="#B91C1C">تجديد لغاية: 2032-08-15</text>
          <line x1="32" y1="248" x2="606" y2="248" stroke="#DED6C8"/>
          <text x="32" y="280" font-family="monospace" font-size="13" font-weight="700" fill="#1F1914">Civil Registry No: 114</text>
          <text x="32" y="306" font-family="sans-serif" font-size="13" fill="#3B3128">Place of Registration: Mazraa - Beirut</text>
          <text x="32" y="332" font-family="sans-serif" font-size="13" fill="#3B3128">Marital Status: Married</text>
          <text x="32" y="358" font-family="monospace" font-size="12.5" fill="#1E40AF">NSSF No: 882419-03</text>
          <text x="32" y="382" font-family="monospace" font-size="12.5" fill="#B91C1C">Renewed Until: 2032-08-15</text>
        </svg>`;
    } else if (isWorkPermit) {
      fname = 'Sample_Lebanese_Work_Permit.svg';
      svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
          <rect width="100%" height="100%" rx="16" fill="#FFFDF7" stroke="#B45309" stroke-width="2.5"/>
          <rect x="0" y="0" width="640" height="62" rx="14" fill="#92400E"/>
          <text x="320" y="28" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="700" fill="#FFFFFF">الجمهورية اللبنانية - وزارة العمل - بطاقة إجازة عمل</text>
          <text x="320" y="49" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#FEF3C7">Ministry of Labour - Work Permit Card</text>
          <text x="604" y="98" text-anchor="end" font-family="sans-serif" font-size="15" font-weight="700" fill="#1F2937">الاسم الكامل: طارق منصور</text>
          <text x="604" y="126" text-anchor="end" font-family="sans-serif" font-size="14" fill="#374151">اسم الأب: سليم</text>
          <text x="604" y="154" text-anchor="end" font-family="sans-serif" font-size="14" fill="#374151">تاريخ الولادة: 1991-05-18</text>
          <text x="604" y="182" text-anchor="end" font-family="sans-serif" font-size="14" fill="#374151">الجنسية: سوري</text>
          <text x="604" y="210" text-anchor="end" font-family="monospace" font-size="13.5" font-weight="700" fill="#92400E">رقم إجازة العمل: WP-2026-4418</text>
          <text x="604" y="236" text-anchor="end" font-family="monospace" font-size="13" fill="#B91C1C">تاريخ الانتهاء: 2026-12-05</text>
          <line x1="36" y1="254" x2="604" y2="254" stroke="#E5E7EB"/>
          <text x="36" y="284" font-family="sans-serif" font-size="13.5" font-weight="700" fill="#0F172A">Full Name: Tariq Mansour</text>
          <text x="36" y="308" font-family="sans-serif" font-size="13" fill="#334155">Father's Name: Salim</text>
          <text x="36" y="332" font-family="sans-serif" font-size="13" fill="#334155">Nationality: Syrian</text>
          <text x="36" y="356" font-family="monospace" font-size="12.5" fill="#92400E">Work Permit No: WP-2026-4418</text>
          <text x="36" y="380" font-family="monospace" font-size="12.5" fill="#B91C1C">Work Permit Expiry: 2026-12-05</text>
        </svg>`;
    } else if (isResidency) {
      fname = 'Sample_Lebanese_Residency_Permit.svg';
      svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
          <rect width="100%" height="100%" rx="16" fill="#F7FAFC" stroke="#0F766E" stroke-width="2.5"/>
          <rect x="0" y="0" width="640" height="62" rx="14" fill="#115E59"/>
          <text x="320" y="28" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="700" fill="#FFFFFF">المديرية العامة للأمن العام - بطاقة إقامة</text>
          <text x="320" y="49" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#CCFBF1">General Security - Residency Permit</text>
          <text x="604" y="102" text-anchor="end" font-family="sans-serif" font-size="15" font-weight="700" fill="#1E293B">الاسم الكامل: زياد خليل</text>
          <text x="604" y="132" text-anchor="end" font-family="sans-serif" font-size="14" fill="#334155">اسم الأب: كريم</text>
          <text x="604" y="162" text-anchor="end" font-family="sans-serif" font-size="14" fill="#334155">الجنسية: مصري</text>
          <text x="604" y="194" text-anchor="end" font-family="monospace" font-size="13.5" font-weight="700" fill="#0F766E">رقم الإقامة: RP-2026-9912</text>
          <text x="604" y="222" text-anchor="end" font-family="monospace" font-size="13" fill="#B91C1C">انتهاء الإقامة: 2026-12-12</text>
          <line x1="36" y1="248" x2="604" y2="248" stroke="#CBD5E1"/>
          <text x="36" y="280" font-family="sans-serif" font-size="13.5" font-weight="700" fill="#0F172A">Full Name: Ziad Khalil</text>
          <text x="36" y="306" font-family="sans-serif" font-size="13" fill="#334155">Father's Name: Karim</text>
          <text x="36" y="332" font-family="sans-serif" font-size="13" fill="#334155">Nationality: Egyptian</text>
          <text x="36" y="358" font-family="monospace" font-size="12.5" fill="#0F766E">Residency Permit No: RP-2026-9912</text>
          <text x="36" y="382" font-family="monospace" font-size="12.5" fill="#B91C1C">Residency Expiry: 2026-12-12</text>
        </svg>`;
    } else if (isNssf) {
      fname = 'Sample_Lebanese_NSSF_Card.svg';
      svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
          <rect width="100%" height="100%" rx="16" fill="#F8FAFC" stroke="#1E40AF" stroke-width="2.5"/>
          <rect x="0" y="0" width="640" height="62" rx="14" fill="#1E3A8A"/>
          <text x="320" y="28" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="700" fill="#FFFFFF">الصندوق الوطني للضمان الاجتماعي - بطاقة المضمون</text>
          <text x="320" y="49" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#DBEAFE">National Social Security Fund (NSSF) - Lebanon</text>
          <text x="604" y="102" text-anchor="end" font-family="sans-serif" font-size="15" font-weight="700" fill="#1E293B">اسم المضمون وشهرته: بلال كرم</text>
          <text x="604" y="132" text-anchor="end" font-family="sans-serif" font-size="14" fill="#334155">اسم الأب: نبيل</text>
          <text x="604" y="162" text-anchor="end" font-family="sans-serif" font-size="14" fill="#334155">تاريخ الولادة: ١٤/٠٣/١٩٨٩</text>
          <text x="604" y="192" text-anchor="end" font-family="sans-serif" font-size="14" fill="#334155">الجنسية: لبناني</text>
          <text x="604" y="222" text-anchor="end" font-family="monospace" font-size="13.5" font-weight="700" fill="#1E40AF">رقم التسجيل: 882419-03</text>
          <line x1="36" y1="248" x2="604" y2="248" stroke="#CBD5E1"/>
          <text x="36" y="280" font-family="sans-serif" font-size="13.5" font-weight="700" fill="#0F172A">Full Name: Bilal Karam</text>
          <text x="36" y="306" font-family="sans-serif" font-size="13" fill="#334155">Father's Name: Nabil</text>
          <text x="36" y="332" font-family="sans-serif" font-size="13" fill="#334155">DOB: 14/03/1989</text>
          <text x="36" y="358" font-family="sans-serif" font-size="13" fill="#334155">Nationality: Lebanese</text>
          <text x="36" y="382" font-family="monospace" font-size="12.5" fill="#475569">NSSF No: 882419-03</text>
        </svg>`;
    } else {
      svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
          <rect width="100%" height="100%" rx="16" fill="#FBF9F4" stroke="#A67C2E" stroke-width="2.5"/>
          <rect x="0" y="0" width="640" height="60" rx="14" fill="#8C5E14"/>
          <text x="320" y="26" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="700" fill="#FFFFFF">الجمهورية اللبنانية - بطاقة هوية</text>
          <text x="320" y="47" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#FEF3C7">République Libanaise - Lebanese National ID Card</text>
          <rect x="32" y="82" width="112" height="136" rx="8" fill="#E7E0D3" stroke="#C6B8A2"/>
          <circle cx="88" cy="128" r="24" fill="#B8AA96"/>
          <path d="M52 198 C52 168 124 168 124 198" fill="#B8AA96"/>
          <text x="606" y="102" text-anchor="end" font-family="sans-serif" font-size="15.5" font-weight="700" fill="#1F1914">الاسم: رامي</text>
          <text x="606" y="130" text-anchor="end" font-family="sans-serif" font-size="15.5" font-weight="700" fill="#1F1914">الشهرة: قسيس</text>
          <text x="606" y="158" text-anchor="end" font-family="sans-serif" font-size="14" fill="#3B3128">اسم الأب: نبيل</text>
          <text x="606" y="186" text-anchor="end" font-family="sans-serif" font-size="14" fill="#3B3128">اسم الأم وشهرتها: مريم منصور</text>
          <text x="606" y="214" text-anchor="end" font-family="sans-serif" font-size="14" fill="#3B3128">تاريخ الولادة: ٢٢/٠٧/١٩٩٢</text>
          <text x="606" y="242" text-anchor="end" font-family="sans-serif" font-size="14" fill="#3B3128">الجنسية: لبناني</text>
          <text x="606" y="268" text-anchor="end" font-family="monospace" font-size="13" font-weight="700" fill="#8C5E14">رقم الهوية: 0004918275</text>
          <line x1="32" y1="286" x2="606" y2="286" stroke="#DED6C8"/>
          <text x="32" y="314" font-family="sans-serif" font-size="13.5" font-weight="700" fill="#1F1914">Full Name: Rami Kassis</text>
          <text x="32" y="338" font-family="sans-serif" font-size="13" fill="#3B3128">Father's Name: Nabil</text>
          <text x="32" y="362" font-family="sans-serif" font-size="13" fill="#3B3128">DOB: 22/07/1992</text>
          <text x="270" y="362" font-family="sans-serif" font-size="13" fill="#3B3128">Nationality: Lebanese</text>
        </svg>`;
    }
    return new File([new Blob([svgStr], { type: 'image/svg+xml' })], fname, { type: 'image/svg+xml' });
  }

  async function scanIdentityCard(fileOrSpec, opts = {}) {
    let fileItem = fileOrSpec;
    if (typeof fileOrSpec === 'string') {
      fileItem = buildSampleIdentityCardFile(fileOrSpec);
    }
    const isBlobLike = typeof Blob !== 'undefined' && fileItem instanceof Blob;
    let attObj = null;
    let extractedText = String((opts && opts.extractedText) || (fileOrSpec && !isBlobLike && fileOrSpec.extractedText) || '');
    let rawDataUrl = (!isBlobLike && fileOrSpec && fileOrSpec.dataUrl) ? String(fileOrSpec.dataUrl) : '';
    let rawMime = (!isBlobLike && fileOrSpec && fileOrSpec.mimeType) ? String(fileOrSpec.mimeType) : '';
    let fileName = (isBlobLike ? (fileItem.name || 'ID_Card.jpg') : String((fileOrSpec && fileOrSpec.fileName) || 'ID_Card.jpg'));

    if (isBlobLike) {
      const pair = await normalizeSingleScanItem(fileItem, opts.captureMethod || 'ID Card Scan', 0);
      attObj = pair && pair.attObj;
      if (attObj) {
        if (!rawDataUrl) rawDataUrl = String(attObj.data_url || '');
        if (!rawMime) rawMime = String(attObj.mime_type || fileItem.type || 'image/jpeg');
        fileName = attObj.file_name || fileName;
      }
      const isTextBearing = /\.(svg|pdf|txt|csv|tsv|json|xml|docx|xlsx)$/i.test(fileName) || /svg|pdf|text|json|xml/i.test(rawMime);
      if (!extractedText && (!isHeadlessEnv() || isTextBearing || window.__MFG_TEST_LIVE_AI)) {
        try {
          extractedText = await extractAnyDocumentText(fileItem, attObj, () => {});
        } catch (_) {
          extractedText = '';
        }
      }
    }

    const detParsed = parseIdentityCardDeterministic(extractedText, fileName);
    let aiParsed = null;
    let mode = 'deterministic';
    let engineLabel = 'Deterministic Bilingual Parser';

    const inlinePart = attObj ? extractVisionInlinePart(attObj) : (
      rawDataUrl.includes(';base64,') && /^(image\/(jpeg|jpg|png|webp|heic|heif)|application\/pdf)$/i.test(rawMime)
        ? { mimeType: rawMime === 'image/jpg' ? 'image/jpeg' : rawMime, data: rawDataUrl.split(';base64,')[1] || '' }
        : null
    );
    const isDemo = Boolean(D && typeof D.isDemoScopeActive === 'function' && D.isDemoScopeActive());
    const maxApiB64 = isDemo ? 1150000 : 4200000;
    const sendDataUrl = (inlinePart && inlinePart.data && inlinePart.data.length < maxApiB64)
      ? `data:${inlinePart.mimeType};base64,${inlinePart.data}`
      : '';
    const hasEndpoint = Boolean(
      (typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/i.test(location.hostname || '')) ||
      window.ISABI_LOCAL_API ||
      window.ISABI_HAS_EDGE_API
    );
    const allowApi = Boolean(
      (opts && opts.forceApi) ||
      window.__MFG_TEST_LIVE_AI ||
      window.__MFG_TEST_ID_API ||
      (!isHeadlessEnv() && hasEndpoint)
    );

    if (allowApi && hasEndpoint && (typeof navigator === 'undefined' || navigator.onLine !== false) && (sendDataUrl || extractedText.trim().length >= 6)) {
      const base = String(window.ISABI_LOCAL_API || '.').replace(/\/$/, '');
      const edgeFetch = (D && D.edgeApiFetch) || window.ISABI_EDGE_FETCH || fetch;
      const companies = (D && typeof D.allowedCompanyNames === 'function') ? D.allowedCompanyNames() : [];
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), sendDataUrl ? 14000 : 6000);
      try {
        const res = await edgeFetch(`${base}/api/smart-scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scanMode: 'id_card',
            tier: sendDataUrl ? 'vision' : 'fast',
            thinkingLevel: sendDataUrl ? 'LOW' : undefined,
            dataUrl: sendDataUrl,
            mimeType: sendDataUrl ? (inlinePart && inlinePart.mimeType) : '',
            extractedText: String(extractedText || '').slice(0, isDemo ? 2400 : 5200),
            companies: companies.slice(0, 12)
          }),
          signal: ctrl.signal
        });
        if (res && res.ok) {
          const j = await res.json();
          if (j && j.ok && j.parsed && typeof j.parsed === 'object') {
            aiParsed = normalizeIdentityScanResult(j.parsed);
            mode = j.mode || 'gemini_vision';
            engineLabel = sendDataUrl ? 'ISABI Vision (Arabic + Latin)' : 'ISABI AI + Bilingual Parser';
          }
        }
      } catch (_) {
      } finally {
        clearTimeout(timer);
      }
    }

    const pickVal = (a, b) => (a && String(a).trim()) ? String(a).trim() : (b && String(b).trim() ? String(b).trim() : '');
    const merged = normalizeIdentityScanResult({
      docKind: pickVal(aiParsed && aiParsed.docKind !== 'id_card' ? aiParsed.docKind : '', detParsed.docKind),
      fullNameLatin: pickVal(aiParsed && aiParsed.fullNameLatin, detParsed.fullNameLatin),
      fullNameArabic: pickVal(aiParsed && aiParsed.fullNameArabic, detParsed.fullNameArabic),
      fatherNameLatin: pickVal(aiParsed && aiParsed.fatherNameLatin, detParsed.fatherNameLatin),
      fatherNameArabic: pickVal(aiParsed && aiParsed.fatherNameArabic, detParsed.fatherNameArabic),
      motherNameLatin: pickVal(aiParsed && aiParsed.motherNameLatin, detParsed.motherNameLatin),
      motherNameArabic: pickVal(aiParsed && aiParsed.motherNameArabic, detParsed.motherNameArabic),
      dob: pickVal(aiParsed && aiParsed.dob, detParsed.dob),
      birthYear: pickVal(aiParsed && aiParsed.birthYear, detParsed.birthYear),
      nationalityLatin: pickVal(aiParsed && aiParsed.nationalityLatin, detParsed.nationalityLatin),
      nationalityArabic: pickVal(aiParsed && aiParsed.nationalityArabic, detParsed.nationalityArabic),
      idNumber: pickVal(aiParsed && aiParsed.idNumber, detParsed.idNumber),
      nssfNumber: pickVal(aiParsed && aiParsed.nssfNumber, detParsed.nssfNumber),
      issueDate: pickVal(aiParsed && aiParsed.issueDate, detParsed.issueDate),
      idExpiryDate: pickVal(aiParsed && aiParsed.idExpiryDate, detParsed.idExpiryDate),
      workPermitNumber: pickVal(aiParsed && aiParsed.workPermitNumber, detParsed.workPermitNumber),
      workPermitExpiryDate: pickVal(aiParsed && aiParsed.workPermitExpiryDate, detParsed.workPermitExpiryDate),
      residencyNumber: pickVal(aiParsed && aiParsed.residencyNumber, detParsed.residencyNumber),
      residencyExpiryDate: pickVal(aiParsed && aiParsed.residencyExpiryDate, detParsed.residencyExpiryDate),
      civilRegistryNumber: pickVal(aiParsed && aiParsed.civilRegistryNumber, detParsed.civilRegistryNumber),
      civilRegistryPlace: pickVal(aiParsed && aiParsed.civilRegistryPlace, detParsed.civilRegistryPlace),
      maritalStatus: pickVal(aiParsed && aiParsed.maritalStatus, detParsed.maritalStatus),
      sidesCaptured: 1,
      gender: pickVal(aiParsed && aiParsed.gender, detParsed.gender)
    });

    return Object.assign({}, merged, {
      ok: true,
      mode,
      engineLabel,
      fileName,
      attObj,
      attObjs: attObj ? [attObj] : [],
      previewDataUrl: (attObj && attObj.data_url) || rawDataUrl || ''
    });
  }

  function jaroWinklerSim(aRaw, bRaw) {
    const a = norm(aRaw);
    const b = norm(bRaw);
    if (!a || !b) return 0;
    if (a === b) return 1;
    const matchWin = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
    const aMat = new Array(a.length).fill(false);
    const bMat = new Array(b.length).fill(false);
    let matches = 0;
    for (let i = 0; i < a.length; i++) {
      const start = Math.max(0, i - matchWin);
      const end = Math.min(i + matchWin + 1, b.length);
      for (let j = start; j < end; j++) {
        if (!bMat[j] && a[i] === b[j]) {
          aMat[i] = true;
          bMat[j] = true;
          matches++;
          break;
        }
      }
    }
    if (!matches) return 0;
    let t = 0, k = 0;
    for (let i = 0; i < a.length; i++) {
      if (!aMat[i]) continue;
      while (!bMat[k]) k++;
      if (a[i] !== b[k]) t++;
      k++;
    }
    const m = matches;
    const jaro = (m / a.length + m / b.length + (m - t / 2) / m) / 3;
    let prefix = 0;
    for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
      if (a[i] === b[i]) prefix++;
      else break;
    }
    return jaro + prefix * 0.1 * (1 - jaro);
  }

  function cleanBackfillFatherCandidate(rawVal) {
    let s = String(rawVal || '').trim().replace(/\s+/g, ' ');
    if (!s || /^\d+$/.test(s)) return '';
    if (hasArabicScript(s) && !hasLatinScript(s)) {
      s = transliterateArabicNameToLatin(s);
    }
    const lowTokens = norm(s).split(/\s+/).filter(Boolean);
    if (!lowTokens.length || lowTokens.length > 3) return '';
    if (lowTokens.every(t => isCompoundPatronymicToken(t))) return '';
    if (/^(wtc|bbco|bbconstruction|lions|lions transport|la una|blanca|palms|voile|platinum|korri|korri auto|shacman|properties|bdeir holding|driver|staff|pending|open|current|ended|active|monthly|daily|male|female)$/i.test(s)) {
      return '';
    }
    return titleCaseLatin(s);
  }

  function matchStaffAgainstThreePartName(baseTokens, candRaw) {
    const clean = String(candRaw || '').replace(/\(\d+\)$/, '').trim().replace(/\s+/g, ' ');
    if (!clean) return null;
    const lat = (hasArabicScript(clean) && !hasLatinScript(clean)) ? transliterateArabicNameToLatin(clean) : clean;
    const tokens = lat.split(/\s+/).filter(Boolean);
    if (tokens.length < 3 || baseTokens.length < 2) return null;
    const normToks = tokens.map(t => norm(t));
    if (normToks.some(t => isCompoundPatronymicToken(t))) return null;
    const firstSim = jaroWinklerSim(baseTokens[0], tokens[0]);
    const lastSim = jaroWinklerSim(baseTokens[baseTokens.length - 1], tokens[tokens.length - 1]);
    if (firstSim < 0.86 || lastSim < 0.86) return null;
    const mid = cleanBackfillFatherCandidate(tokens.slice(1, -1).join(' '));
    if (!mid || norm(mid) === norm(baseTokens[0]) || norm(mid) === norm(baseTokens[baseTokens.length - 1])) return null;
    return { father: mid, score: round2((firstSim + lastSim) * 0.5) };
  }

  function extractFatherFromTextNote(noteRaw, staffBaseName) {
    const raw = normalizeDigits(String(noteRaw || '').trim());
    if (!raw || raw.length < 3) return '';
    const explicitPatterns = [
      /(?:father(?:'s)?(?:\s+name)?|p[èe]re|patronym(?:e|ic)?)\s*[:=\-–]\s*([A-Za-zÀ-ÿ\u0600-\u06FF][A-Za-zÀ-ÿ\u0600-\u06FF\s'-]{1,34})/i,
      /(?:son|daughter|fils|fille)\s+(?:of|de)\s+([A-Za-zÀ-ÿ'][A-Za-zÀ-ÿ'-]{1,28})/i,
      /(?:اسم\s*الأب|إسم\s*الأب|اسم\s*الاب|والده|والدها)\s*[:=\-–]?\s*([\u0600-\u06FF][\u0600-\u06FF\s]{1,28})/,
      /[\u0600-\u06FF]{2,20}\s+(?:بن|بنت)\s+([\u0600-\u06FF]{2,20})/
    ];
    for (const rx of explicitPatterns) {
      const m = raw.match(rx);
      if (m && m[1]) {
        const stopped = m[1].split(/[\r\n,;()|.]+/)[0].trim();
        const cand = cleanBackfillFatherCandidate(stopped);
        if (cand) return cand;
      }
    }
    const baseKey = norm(staffBaseName);
    if (baseKey) {
      const parenRx = /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'-]{2,42})\(\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'-]{1,28})\s*\)/g;
      let pm;
      while ((pm = parenRx.exec(raw)) !== null) {
        if (jaroWinklerSim(pm[1], baseKey) >= 0.88) {
          const cand = cleanBackfillFatherCandidate(pm[2]);
          if (cand) return cand;
        }
      }
    }
    return '';
  }

  function computeFatherNameBackfillReview(ctx = {}) {
    if (D && typeof D.ensureStaffMembersSeeded === 'function') {
      try { D.ensureStaffMembersSeeded(); } catch (_) {}
    }
    const rec = (D && D.SEED && D.SEED.records) || (window.MFG_SEED && window.MFG_SEED.records) || {};
    const cust = (D && D.STATE && D.STATE.customRecords) || {};
    const user = (ctx && ctx.user) || (D && typeof D.activeUser === 'function' ? D.activeUser() : null);
    const isDemo = Boolean(D && typeof D.isDemoScopeActive === 'function' && D.isDemoScopeActive());
    const allowedCosRaw = (D && typeof D.allowedCompanyNames === 'function')
      ? D.allowedCompanyNames(user)
      : [];
    const allowedCoSet = new Set(allowedCosRaw.map(c => norm(c)));
    const companyFilter = ctx && ctx.companyFilter ? norm(ctx.companyFilter) : '';

    const isDemoRow = r => Boolean(r && (
      r._demo
      || /^demo(?:_|\s|$)/i.test(String(r.company || '').trim())
      || (D && D.DEMO_COMPANY_KEY && norm(r.company) === norm(D.DEMO_COMPANY_KEY))
      || String(r.id || '').startsWith('demo_')
    ));
    const coOf = r => {
      const raw = String((r && r.company) || '').trim();
      if (!raw) return '';
      if (D && typeof D.canonCompany === 'function') return D.canonCompany(raw);
      return raw;
    };
    const canSeeScope = r => {
      if (!r || r.voided) return false;
      if (!isDemo && isDemoRow(r)) return false;
      if (isDemo && !isDemoRow(r)) return false;
      const co = coOf(r);
      if (allowedCoSet.size && co && !allowedCoSet.has(norm(co))) return false;
      if (allowedCoSet.size && !co && user && D && typeof D.isOwner === 'function' && !D.isOwner(user)) return false;
      return true;
    };
    const matchesCompanyFilter = r => {
      if (!companyFilter || companyFilter === 'all') return true;
      const co = coOf(r);
      return Boolean(co && norm(co) === companyFilter);
    };

    const mergePool = key => {
      const a = Array.isArray(rec[key]) ? rec[key] : [];
      const b = Array.isArray(cust[key]) ? cust[key] : [];
      const seen = new Set();
      const out = [];
      for (const list of [b, a]) {
        for (const r of list) {
          if (!r || r.voided) continue;
          const idKey = r.id != null ? String(r.id) : '';
          if (idKey && seen.has(idKey)) continue;
          if (idKey) seen.add(idKey);
          if (canSeeScope(r)) out.push(r);
        }
      }
      return out;
    };

    const staffAll = mergePool('staff_members');
    const empAll = mergePool('employments');
    const flAll = mergePool('freelance_entries');
    const saAll = mergePool('staff_assignments');
    const cdAll = mergePool('company_drivers');
    const salAll = mergePool('salaries');
    const drvAll = mergePool('drivers');
    const docAll = mergePool('documents');

    const baseCounts = new Map();
    const todayStr = new Date().toISOString().slice(0, 10);
    const isInactiveSm = r => Boolean(r && (r.archived || /^(ended|closed|terminated|inactive|cancelled)$/i.test(String(r.status || '').trim())));
    const isEmpRowActiveToday = e => Boolean(
      e && !e.voided && !e.archived &&
      !/^(ended|closed|terminated|inactive|cancelled)$/i.test(String(e.status || '').trim()) &&
      (!e.end_date || String(e.end_date).slice(0, 10) >= todayStr)
    );
    const matchesStaffIdentity = (staffNameK, staffCoK, rowNameRaw, rowCoRaw) => {
      if (!staffNameK || norm(rowNameRaw) !== staffNameK) return false;
      const rCoK = rowCoRaw ? norm(coOf({ company: rowCoRaw })) : '';
      if (staffCoK && rCoK && staffCoK !== rCoK) return false;
      return true;
    };
    const isStaffCurrentlyActive = sm => {
      if (!sm || sm.voided || isInactiveSm(sm)) return false;
      const smK = norm(sm.name || sm.staff);
      if (!smK) return false;
      const smCoK = sm.company ? norm(coOf(sm)) : '';
      const matchedEmpFl = [];
      for (const e of empAll) {
        if (matchesStaffIdentity(smK, smCoK, e.staff || e.name, e.company || 'WTC')) matchedEmpFl.push(e);
      }
      for (const fl of flAll) {
        if (matchesStaffIdentity(smK, smCoK, fl.staff || fl.name, fl.company || 'WTC')) matchedEmpFl.push(fl);
      }
      if (matchedEmpFl.length > 0) {
        return matchedEmpFl.some(isEmpRowActiveToday);
      }
      const smId = String(sm.id || '').trim();
      const isSeeded = smId.startsWith('stf_seed_') || sm.source === 'seed';
      if (!isSeeded) return true;
      if (saAll.some(sa => matchesStaffIdentity(smK, smCoK, sa.staff, sa.company) && (!sa.end_date || String(sa.end_date).slice(0, 10) >= todayStr))) {
        return true;
      }
      if (cdAll.some(cd => matchesStaffIdentity(smK, smCoK, cd.staff || cd.driver, cd.company || 'WTC') && !cd.archived && !/^(ended|closed|terminated|inactive|cancelled)$/i.test(String(cd.status || '').trim()))) {
        return true;
      }
      return false;
    };

    staffAll.forEach(s => {
      const nm = String(s.name || s.staff || '').trim();
      const base = nm.replace(/\s*\(\d+\)$/, '').replace(/\s*\([^)]+\)$/, '').trim();
      const k = norm(base);
      if (k) baseCounts.set(k, (baseCounts.get(k) || 0) + 1);
    });

    const activeStaff = ctx && ctx.includeHistorical
      ? staffAll.filter(s => !s.voided)
      : staffAll.filter(isStaffCurrentlyActive);
    const missingStaff = activeStaff.filter(s => {
      if (!matchesCompanyFilter(s)) return false;
      const fNow = String(s.father_name || '').trim();
      return Boolean(ctx.includeFilled) || !fNow;
    });

    // Build scoped ID-scan corpus from uploaded HR docs, staff attachments, and session batch scans
    const idEvidencePool = [];
    const pushScanEvidence = (scanObj, sourceLabel, coHint, docRef, linkedStaff) => {
      if (!scanObj || (!scanObj.fullNameLatin && !scanObj.fullNameArabic)) return;
      idEvidencePool.push({
        kind: scanObj.docKind === 'nssf_card' ? 'nssf_card' : 'hr_scan',
        sourceLabel,
        company: coHint || '',
        linkedStaff: String(linkedStaff || ''),
        fullNameLatin: scanObj.fullNameLatin || '',
        fullNameArabic: scanObj.fullNameArabic || '',
        fatherNameLatin: scanObj.fatherNameLatin || '',
        fatherNameArabic: scanObj.fatherNameArabic || '',
        dob: scanObj.dob || '',
        nationality: scanObj.nationalityLatin || '',
        nationalityAr: scanObj.nationalityArabic || '',
        motherNameLatin: scanObj.motherNameLatin || '',
        motherNameArabic: scanObj.motherNameArabic || '',
        nssfNumber: scanObj.nssfNumber || '',
        idExpiryDate: scanObj.idExpiryDate || '',
        workPermitNumber: scanObj.workPermitNumber || '',
        workPermitExpiryDate: scanObj.workPermitExpiryDate || '',
        residencyNumber: scanObj.residencyNumber || '',
        residencyExpiryDate: scanObj.residencyExpiryDate || '',
        reference: scanObj.idNumber || scanObj.nssfNumber || scanObj.workPermitNumber || scanObj.residencyNumber || '',
        idDocKind: scanObj.docKind || '',
        attObj: scanObj.attObj || null,
        attObjs: Array.isArray(scanObj.attObjs) && scanObj.attObjs.length ? scanObj.attObjs : (scanObj.attObj ? [scanObj.attObj] : []),
        snippet: docRef || [scanObj.fullNameLatin, scanObj.fatherNameLatin ? `Father: ${scanObj.fatherNameLatin}` : '', scanObj.dob || ''].filter(Boolean).join(' · ')
      });
    };

    const batchCards = Array.isArray(ctx && ctx.scannedCards) ? ctx.scannedCards : [];
    batchCards.forEach(sc => pushScanEvidence(sc, sc.docKind === 'nssf_card' ? 'NSSF Card Scan' : 'HR ID Scan', sc.company || '', sc.fileName || '', sc.linkedStaff || ''));

    docAll.forEach(d => {
      const blobTxt = [d.title, d.name, d.notes, d.reference, d.ocr_text, d.extracted_text].filter(Boolean).join('\n');
      const isIdDoc = /(id|passport|nssf|civil|permit|هوية|ضمان|إخراج|اقامة|جواز)/i.test(`${d.doc_type || ''} ${d.title || ''} ${d.name || ''} ${blobTxt}`);
      if (!isIdDoc && !/(father|اسم الأب|بن\s)/i.test(blobTxt)) return;
      const parsedDoc = parseIdentityCardDeterministic(blobTxt, d.title || d.name || '');
      if (parsedDoc.fatherNameLatin && (parsedDoc.fullNameLatin || d.parent_label)) {
        if (!parsedDoc.fullNameLatin && d.parent_label) parsedDoc.fullNameLatin = String(d.parent_label).trim();
        pushScanEvidence(parsedDoc, 'Document Vault ID', coOf(d), d.title || d.name || d.reference || 'Document Vault', d.parent_label || d.staff || '');
      }
    });

    const scanAttText = (attachments, ownerName, coHint) => {
      if (!Array.isArray(attachments)) return;
      attachments.forEach(att => {
        if (!att) return;
        const txtParts = [att.ocr_text, att.extracted_text, att.note, att.notes, att.file_name].filter(Boolean).join('\n');
        if (!txtParts) return;
        const p = parseIdentityCardDeterministic(txtParts, att.file_name || '');
        if (p.fatherNameLatin) {
          if (!p.fullNameLatin && ownerName) p.fullNameLatin = ownerName;
          pushScanEvidence(p, 'Staff Attachment ID', coHint, att.file_name || 'Attachment', ownerName);
        }
      });
    };
    staffAll.forEach(s => scanAttText(s.attachments, s.name || s.staff, coOf(s)));
    empAll.forEach(e => scanAttText(e.attachments, e.staff || e.name, coOf(e)));

    const multiNameCorpus = [];
    const seenCorpus = new Set();
    const pushMultiName = (rawName, co, srcLbl) => {
      const nm = String(rawName || '').replace(/\(\d+\)$/, '').trim().replace(/\s+/g, ' ');
      if (!nm) return;
      const lat = (hasArabicScript(nm) && !hasLatinScript(nm)) ? transliterateArabicNameToLatin(nm) : nm;
      const toks = lat.split(/\s+/).filter(Boolean);
      if (toks.length < 3) return;
      const key = `${norm(co)}|${norm(lat)}`;
      if (seenCorpus.has(key)) return;
      seenCorpus.add(key);
      multiNameCorpus.push({ name: lat, company: co, srcLbl });
    };
    empAll.forEach(e => pushMultiName(e.staff || e.name, coOf(e), 'Historical Contract'));
    flAll.forEach(f => pushMultiName(f.staff || f.name, coOf(f), 'Freelance Log'));
    saAll.forEach(a => pushMultiName(a.staff, coOf(a), 'Role Assignment Log'));
    salAll.forEach(s => pushMultiName(s.staff, coOf(s), 'Payroll Voucher'));
    drvAll.forEach(d => pushMultiName(d.name || d.driver, coOf(d), 'Driver Registry'));

    const matchNameScore = (aName, candList) => {
      const aBase = String(aName || '').replace(/\s*\(\d+\)$/, '').trim();
      const aToks = norm(aBase).split(/\s+/).filter(Boolean);
      let bestSim = 0;
      for (const cn of candList) {
        if (!cn) continue;
        const sim = jaroWinklerSim(aBase, cn);
        const cnToks = norm(cn).split(/\s+/).filter(Boolean);
        const tokHit = (aToks.length >= 2 && cnToks.length >= 2)
          ? (jaroWinklerSim(aToks[0], cnToks[0]) * 0.55 + jaroWinklerSim(aToks[aToks.length - 1], cnToks[cnToks.length - 1]) * 0.45)
          : sim;
        bestSim = Math.max(bestSim, sim, tokHit);
      }
      return bestSim;
    };
    const isEvAmbiguousAcrossBus = ev => {
      if (!ev || ev.company) return false;
      const candNames = [ev.linkedStaff, ev.fullNameLatin, ev.fullNameArabic ? transliterateArabicNameToLatin(ev.fullNameArabic) : ''].filter(Boolean);
      if (!candNames.length) return false;
      const matchedBus = new Set();
      let matchedCount = 0;
      for (const otherSm of activeStaff) {
        if (!otherSm) continue;
        const oScore = matchNameScore(otherSm.name || otherSm.staff, candNames);
        if (oScore >= 0.85) {
          matchedCount += 1;
          matchedBus.add(norm(coOf(otherSm)) || String(otherSm.id || matchedCount));
          if (matchedCount > 1 || matchedBus.size > 1) return true;
        }
      }
      return false;
    };

    const opClueRows = [];
    const pushOpClueRow = (row, rowStaff, srcTitle) => {
      if (!row) return;
      const explicitFather = cleanBackfillFatherCandidate(row.father_name);
      const noteText = (row.notes || row.note || row.reference)
        ? [row.notes, row.note, row.reference].filter(Boolean).join(' · ')
        : '';
      let noteHasFather = false;
      if (noteText) {
        const rawNote = normalizeDigits(String(noteText).trim());
        noteHasFather = Boolean(
          extractFatherFromTextNote(noteText, '')
          || /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'-]{2,42}\(\s*[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'-]{1,28}\s*\)/.test(rawNote)
        );
      }
      if (!explicitFather && !noteHasFather) return;
      const rCo = coOf(row);
      opClueRows.push({
        row,
        rowStaff,
        srcTitle,
        rCo,
        rCoNorm: rCo ? norm(rCo) : '',
        rowStaffClean: String(rowStaff || '').replace(/\s*\(\d+\)$/, ''),
        explicitFather,
        noteText,
        noteHasFather
      });
    };
    empAll.forEach(e => pushOpClueRow(e, e.staff || e.name, 'Contract'));
    flAll.forEach(f => pushOpClueRow(f, f.staff || f.name, 'Freelance'));
    salAll.forEach(s => pushOpClueRow(s, s.staff, 'Payroll'));
    drvAll.forEach(d => pushOpClueRow(d, d.name || d.driver, 'Driver'));

    const rows = missingStaff.map(sm => {
      const rawName = String(sm.name || sm.staff || '').trim();
      const isNumFallback = /\(\d+\)$/.test(rawName);
      const baseName = rawName.replace(/\s*\(\d+\)$/, '').trim();
      const baseKey = norm(baseName);
      const smCo = coOf(sm);
      const baseTokens = baseName.split(/\s+/).filter(Boolean);
      const hasHomonym = (baseCounts.get(baseKey) || 0) > 1;
      const candidates = [];

      // 1. HR ID / NSSF Scan Evidence (highest precision, supports cross-script matching)
      for (const ev of idEvidencePool) {
        if (ev.company && smCo && norm(ev.company) !== norm(smCo)) continue;
        const refExactMatch = Boolean(
          ev.reference && sm.reference
          && String(ev.reference).trim()
          && norm(ev.reference) === norm(sm.reference)
        );
        if (!ev.company && !refExactMatch && (hasHomonym || isEvAmbiguousAcrossBus(ev))) continue;
        if (!ev.fatherNameLatin) continue;
        const candNames = [ev.linkedStaff, ev.fullNameLatin, ev.fullNameArabic ? transliterateArabicNameToLatin(ev.fullNameArabic) : ''].filter(Boolean);
        const bestSim = matchNameScore(baseName, candNames);
        if (bestSim >= 0.85) {
          const confPct = Math.min(99, Math.max(88, Math.round(bestSim * 100)));
          candidates.push({
            father_name: ev.fatherNameLatin,
            father_name_ar: ev.fatherNameArabic || '',
            full_name_ar: ev.fullNameArabic || '',
            mother_name: ev.motherNameLatin || '',
            mother_name_ar: ev.motherNameArabic || '',
            dob: ev.dob || '',
            nationality: ev.nationality || '',
            nationality_ar: ev.nationalityAr || '',
            nssf_no: ev.nssfNumber || '',
            id_expiry_date: ev.idExpiryDate || '',
            work_permit_no: ev.workPermitNumber || '',
            work_permit_expiry: ev.workPermitExpiryDate || '',
            residency_no: ev.residencyNumber || '',
            residency_expiry: ev.residencyExpiryDate || '',
            reference: ev.reference || '',
            id_doc_kind: ev.idDocKind || '',
            attObj: ev.attObj || null,
            attObjs: Array.isArray(ev.attObjs) ? ev.attObjs : (ev.attObj ? [ev.attObj] : []),
            sourceType: ev.kind,
            sourceLabel: ev.sourceLabel,
            confidenceTier: confPct >= 90 ? 'high' : 'medium',
            confidencePct: confPct,
            snippet: ev.snippet
          });
        }
      }

      // 2. Explicit father_name or workbook notes on operational records for this staff member
      const smCoNorm = smCo ? norm(smCo) : '';
      const smRefNorm = (sm.reference && String(sm.reference).trim()) ? norm(sm.reference) : '';
      const inspectOperationalRow = (row, rowStaff, srcTitle, meta) => {
        if (!row) return;
        const rCo = meta ? meta.rCo : coOf(row);
        const rCoNorm = meta ? meta.rCoNorm : (rCo ? norm(rCo) : '');
        if (rCo && smCo && rCoNorm !== smCoNorm) return;
        const refExactOp = Boolean(smRefNorm && row.reference && String(row.reference).trim() && norm(row.reference) === smRefNorm);
        if ((!rCo || !smCo) && !refExactOp && hasHomonym) return;
        const cleanRowStaff = meta ? meta.rowStaffClean : String(rowStaff || '').replace(/\s*\(\d+\)$/, '');
        const sim = jaroWinklerSim(baseName, cleanRowStaff);
        if (sim < 0.88) return;
        const explicitFather = meta ? meta.explicitFather : cleanBackfillFatherCandidate(row.father_name);
        if (explicitFather) {
          candidates.push({
            father_name: explicitFather,
            sourceType: 'operational_record',
            sourceLabel: srcTitle,
            confidenceTier: 'high',
            confidencePct: 96,
            snippet: `${rowStaff || baseName} (${srcTitle})`
          });
        }
        const noteText = meta ? meta.noteText : [row.notes, row.note, row.reference].filter(Boolean).join(' · ');
        if (noteText && (!meta || meta.noteHasFather)) {
          const noteFather = extractFatherFromTextNote(noteText, baseName);
          if (noteFather) {
            const pct = sim >= 0.97 ? 91 : 80;
            candidates.push({
              father_name: noteFather,
              sourceType: 'workbook_note',
              sourceLabel: `${srcTitle} Note`,
              confidenceTier: pct >= 90 ? 'high' : 'medium',
              confidencePct: pct,
              snippet: noteText.slice(0, 96)
            });
          }
        }
      };
      for (let ci = 0; ci < opClueRows.length; ci++) {
        const clue = opClueRows[ci];
        inspectOperationalRow(clue.row, clue.rowStaff, clue.srcTitle, clue);
      }
      if (sm.notes || sm.reference) inspectOperationalRow(sm, rawName, 'Staff Profile');

      // 3. Historical / cross-record 3-part name match (e.g. Bilal Karam -> Bilal Nabil Karam)
      if (baseTokens.length === 2) {
        for (const mc of multiNameCorpus) {
          if (mc.company && smCo && norm(mc.company) !== norm(smCo)) continue;
          if ((!mc.company || !smCo) && hasHomonym) continue;
          const hit = matchStaffAgainstThreePartName(baseTokens, mc.name);
          if (hit) {
            const pct = Math.min(96, Math.max(88, Math.round(hit.score * 96)));
            candidates.push({
              father_name: hit.father,
              sourceType: 'historical_contract',
              sourceLabel: mc.srcLbl,
              confidenceTier: pct >= 90 ? 'high' : 'medium',
              confidencePct: pct,
              snippet: `Matched "${mc.name}"`
            });
          }
        }
      }

      // 4. Active 3-part name decomposition (only when non-compound Arabic/Latin patronymic)
      if (!candidates.length && baseTokens.length === 3) {
        const hit = matchStaffAgainstThreePartName([baseTokens[0], baseTokens[2]], baseName);
        if (hit) {
          candidates.push({
            father_name: hit.father,
            sourceType: 'roster_3part',
            sourceLabel: '3-Part Roster Name',
            confidenceTier: 'medium',
            confidencePct: 78,
            snippet: `Middle name of "${baseName}"`
          });
        }
      }

      candidates.sort((a, b) => (b.confidencePct || 0) - (a.confidencePct || 0));
      const best = candidates[0] || null;
      const renewalPreview = best && best.father_name
        ? (isNumFallback
          ? `${baseName} (${best.father_name})`
          : (hasHomonym ? `${baseName} (${best.father_name})` : `${baseName} (Father: ${best.father_name})`))
        : '';

      return {
        staffId: String(sm.id || ''),
        name: rawName,
        baseName,
        company: smCo,
        role: String(sm.role || ''),
        existingFather: String(sm.father_name || '').trim(),
        existingDob: String(sm.dob || '').trim(),
        existingNat: String(sm.nationality || '').trim(),
        isNumericFallback: isNumFallback,
        hasHomonym,
        renewalRisk: Boolean(isNumFallback || hasHomonym),
        best,
        proposedFather: best ? best.father_name : '',
        proposedFatherAr: best ? (best.father_name_ar || transliterateLatinNameToArabic(best.father_name)) : '',
        proposedFullAr: best ? (best.full_name_ar || '') : '',
        proposedMother: best ? (best.mother_name || '') : '',
        proposedMotherAr: best ? (best.mother_name_ar || '') : '',
        proposedDob: best ? (best.dob || '') : '',
        proposedNat: best ? (best.nationality || '') : '',
        proposedNatAr: best ? (best.nationality_ar || '') : '',
        proposedNssfNo: best ? (best.nssf_no || '') : '',
        proposedIdExpiry: best ? (best.id_expiry_date || '') : '',
        proposedWorkPermitNo: best ? (best.work_permit_no || '') : '',
        proposedWorkPermitExpiry: best ? (best.work_permit_expiry || '') : '',
        proposedResidencyNo: best ? (best.residency_no || '') : '',
        proposedResidencyExpiry: best ? (best.residency_expiry || '') : '',
        proposedRef: best ? (best.reference || '') : '',
        proposedDocKind: best ? (best.id_doc_kind || '') : '',
        proposedAttObj: best ? (best.attObj || null) : null,
        proposedAttObjs: best ? (Array.isArray(best.attObjs) && best.attObjs.length ? best.attObjs : (best.attObj ? [best.attObj] : [])) : [],
        sourceType: best ? best.sourceType : 'manual',
        sourceLabel: best ? best.sourceLabel : 'Manual Review',
        confidenceTier: best ? best.confidenceTier : 'manual',
        confidencePct: best ? best.confidencePct : 0,
        snippet: best ? best.snippet : '',
        renewalPreview
      };
    });

    const fIdx = (D && typeof D.getFreqIndex === 'function') ? D.getFreqIndex().staff : null;
    const tierOrder = { high: 0, medium: 1, manual: 2 };
    rows.sort((a, b) => {
      const td = (tierOrder[a.confidenceTier] ?? 2) - (tierOrder[b.confidenceTier] ?? 2);
      if (td) return td;
      if (b.confidencePct !== a.confidencePct) return b.confidencePct - a.confidencePct;
      if (a.renewalRisk !== b.renewalRisk) return a.renewalRisk ? -1 : 1;
      const fa = fIdx ? (fIdx.get(norm(a.name)) || 0) : 0;
      const fb = fIdx ? (fIdx.get(norm(b.name)) || 0) : 0;
      return fb - fa;
    });

    const matchedRows = rows.filter(r => Boolean(r.proposedFather));
    return {
      totalMissing: rows.length,
      renewalRiskCount: rows.filter(r => r.renewalRisk).length,
      matchedCount: matchedRows.length,
      highCount: rows.filter(r => r.confidenceTier === 'high').length,
      mediumCount: rows.filter(r => r.confidenceTier === 'medium').length,
      manualCount: rows.filter(r => r.confidenceTier === 'manual').length,
      rows
    };
  }

  function init(deps) {
    D = deps || {};
    ensureGlobalFileInputs();
    mountTopbarButtons();
    syncWorkspaceButtons();
    if (typeof document !== 'undefined' && !window.__mfgGlobalScanPasteWired) {
      window.__mfgGlobalScanPasteWired = true;
      document.addEventListener('paste', async e => {
        const indM = $('indDomainEntryModal');
        const mfgM = $('entryModal');
        const indReady = Boolean(indM && !indM.hidden && $('indEntrySmartScanBar'));
        const mfgReady = Boolean(mfgM && !mfgM.hidden && $('entrySmartScanBar'));
        if (!indReady && !mfgReady) return;
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (const it of Array.from(items)) {
          if (it.kind === 'file') {
            const f = it.getAsFile();
            if (f) {
              e.preventDefault();
              if (indReady) {
                indM.classList.add('mob-ai-scan-open');
                indM.classList.remove('mob-ai-voice-open');
                if (typeof indM._syncIndMobAiUi === 'function') indM._syncIndMobAiUi();
                await scanIntoDomainModal([f], { captureMethod: 'Clipboard Paste Smart Scan' });
                if (typeof indM._syncIndMobAiUi === 'function') indM._syncIndMobAiUi();
              } else {
                await scanFileOrAttachment(f, 'Clipboard Paste Smart Scan');
              }
              break;
            }
          }
        }
      });
    }
    document.addEventListener('click', e => {
      if (SCAN_STATE.sampleMenuOpen && (!e.target || !e.target.closest || !e.target.closest('.ss-sample-wrap'))) {
        SCAN_STATE.sampleMenuOpen = false;
        renderSmartScanBarDom();
      }
    });
  }

  window.MFG_SMART_SCAN = {
    init,
    mountOnEntryModal,
    mountOnDomainModal,
    mountOnDocumentPreviewModal,
    syncWorkspaceButtons,
    syncIndMobAiStepPill: syncMobAiStepPills,
    resetModalState,
    resetDomainScanState,
    openSmartScanEntryDesk,
    scanFileOrAttachment,
    evaluateScanPrecheck,
    evaluateDomainScanPrecheck,
    precheckCapturedPages,
    renderPrecheckItemHtml,
    runSampleScanById,
    runDomainSampleScan,
    scanIntoDomainModal,
    hasActiveSlipQueue,
    getActiveQueueItem,
    beginQueuePostTransition,
    revertQueuePostTransition,
    completeQueuePostTransition,
    skipCurrentQueueSlip,
    clearSlipQueue,
    splitLastBundleToQueue,
    mergeQueueToBundle,
    validateAndDisambiguateVin17,
    computeIso3779CheckDigit,
    scanIdentityCard,
    parseIdentityCardDeterministic,
    normalizeIdentityScanResult,
    mergeTwoSidedIdentityScans,
    normalizeIdentityExpiryDate,
    buildSampleIdentityCardFile,
    transliterateArabicNameToLatin,
    transliterateLatinNameToArabic,
    canonicalizeNationality,
    computeFatherNameBackfillReview,
    SAMPLE_SCANS,
    DOMAIN_SAMPLE_SCANS,
    parseDiscountLine,
    deterministicParseDocument,
    synthesizeMultiPageDeterministic,
    mergeParsedResults,
    _state: () => SCAN_STATE
  };
})();
