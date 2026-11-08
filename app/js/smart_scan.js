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

  const SCAN_STATE = {
    busy: false,
    progressMsg: '',
    lastScan: null,       // { fileMeta, attObj, attObjs, stitchedDataUrl, activePageIdx, extractedText, parsed, matched, appliedForm, appliedIndTpl, filledFields, warnFields, warnings, altForms, engineLabel }
    splitOpen: false,
    imgRotateDeg: 0,
    sampleMenuOpen: false,
    suppressResetOnModalSwitch: false,
    blobPreviewUrl: ''
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
      label: 'Manufacturing · Unpriced Quarry Weighbridge Slip',
      sub: 'WTC · Weighbridge slip in Tons with truck 353387 & $0.00 Price Pending',
      fileName: 'Quarry_Weighbridge_Slip_99204.svg',
      spec: {
        docHeader: 'QUARRY WEIGHBRIDGE DELIVERY SLIP (UNPRICED)',
        issuerLine: 'Origin Quarry Site: Sibline · Raw Material Intake Ticket',
        refNo: '99204',
        date: '2026-10-20',
        company: 'WTC',
        partyRole: 'Site Owner',
        counterparty: 'Awad',
        metaLine1: 'Site: Sibline · Material Product: Raml Bab Thani',
        metaLine2: 'Truck: 353387 · Transported By: Company fleet',
        lines: [
          { desc: 'Raml Bab Thani (Quarry Aggregate Intake)', qty: '34.80 Ton', price: '$0.00', total: '$0.00' }
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
    const btBlocks = streamStr.match(/BT[\s\S]*?ET/g) || [streamStr];
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
      if (decodedStr && /BT[\s\S]*ET/.test(decodedStr)) {
        const txt = parsePdfContentStreamText(decodedStr);
        if (txt) pageTexts.push(txt);
      }
    }
    if (!pageTexts.length && /BT[\s\S]*ET/.test(rawStr)) {
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
      || ((cleanText.match(/\b(?:INV|TKT|WB|WIRE|LSE|POL|RCPT|VCH)-[A-Z0-9-]{2,20}\b/i) || [])[0] || '');

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

    // Totals, Subtotal, VAT & LBP detection
    let subtotalUsd = 0;
    let vatUsd = 0;
    let totalUsd = 0;
    let lbpAmount = 0;
    const hasVatKeyword = /(?:\b(?:vat|tva|11%|mof\s*#|tax\s*invoice)\b|\u0636\u0631\u064a\u0628\u0629\s*\u0627\u0644\u0642\u064a\u0645\u0629\s*\u0627\u0644\u0645\u0636\u0627\u0641\u0629)/i.test(cleanText);

    for (const line of lines) {
      const lbpM = line.match(/([\d,]{5,}(?:\.\d+)?)\s*(?:LBP|L\.L\.|LL|\u0644\.\u0644)/i)
        || line.match(/(?:LBP|L\.L\.|\u0644\.\u0644)\s*[:#-]?\s*([\d,]{5,}(?:\.\d+)?)/i);
      if (lbpM) {
        const v = parseMoneyValue(lbpM[1]);
        if (v > lbpAmount) lbpAmount = v;
      }
      if (/^(?:sub\s*-?\s*total|net\s*ex-?vat|montant\s*ht|total\s*ht)/i.test(line)) {
        subtotalUsd = parseMoneyValue(line);
      } else if (/^(?:vat|tva|tax\s*\(?\s*11%|\u0636\u0631\u064a\u0628\u0629)/i.test(line)) {
        vatUsd = parseMoneyValue(line);
      } else if (/^(?:(?:\b(?:grand\s*total|total(?:\s+(?:ttc|due|amount|usd))?|amount(?:\s+(?:due|paid|received))?|net\s*payable|montant\s*ttc)\b)|\u0627\u0644\u0645\u062c\u0645\u0648\u0639|\u0627\u0644\u0627\u062c\u0645\u0627\u0644\u064a)/i.test(line)) {
        if (!/LBP|L\.L\.|\u0644\.\u0644/i.test(line)) {
          const tv = parseMoneyValue(line);
          if (tv >= 0) totalUsd = tv;
        }
      }
    }

    // Parse line items: supports "Desc | 2 Piece | $95.00 | $190.00" or consecutive SVG/PDF rows or "2 pcs x $95 = $190"
    const lineItems = [];
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (/^(subtotal|vat|tva|total|payment\s*terms|notes|company|supplier|customer|ref:|date:|description\s*\/?\s*item)/i.test(ln)) continue;

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
    if (!totalUsd && (subtotalUsd > 0 || vatUsd > 0)) {
      totalUsd = round2(subtotalUsd + vatUsd);
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
      vatAmount: vatUsd,
      totalAmount: totalUsd,
      lbpAmount,
      hasVat: Boolean(vatUsd > 0 || hasVatKeyword),
      pricePending,
      qty: qty || 1,
      uom,
      unitPrice: firstItem ? Number(firstItem.unitCost || 0) : 0,
      lineItems,
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
    let finalVat = 0;
    let finalTotal = 0;
    let finalLbp = 0;
    for (let idx = perPage.length - 1; idx >= 0; idx--) {
      const p = perPage[idx];
      if (!finalTotal && p.totalAmount > 0) finalTotal = p.totalAmount;
      if (!finalVat && p.vatAmount > 0) finalVat = p.vatAmount;
      if (!finalSubtotal && p.subtotalExVat > 0) finalSubtotal = p.subtotalExVat;
      if (!finalLbp && p.lbpAmount > 0) finalLbp = p.lbpAmount;
    }
    const linesSum = round2(mergedLines.reduce((s, it) => s + Number(it.lineTotal || 0), 0));
    if (mergedLines.length > 1 && linesSum > finalSubtotal) {
      finalSubtotal = linesSum;
    }
    if ((finalSubtotal > 0 || finalVat > 0) && finalTotal < finalSubtotal) {
      finalTotal = round2(finalSubtotal + finalVat);
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
      subtotalExVat: finalSubtotal || full.subtotalExVat,
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
    const askCfg = window.MFG_ASK_CFG || {};
    if (askCfg.endpointUrl && askCfg.enabled) {
      return { url: String(askCfg.endpointUrl), key: String(askCfg.key || '') };
    }
    try {
      if (askCfg.u && askCfg.k) {
        return { url: atob(askCfg.u), key: atob(askCfg.k) };
      }
    } catch (_) {}
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
    const timer = setTimeout(() => ctrl.abort(), hasBin ? 12000 : 4800);
    try {
      const base = String(window.ISABI_LOCAL_API || '.').replace(/\/$/, '');
      const edgeFetch = window.ISABI_EDGE_FETCH || fetch;
      const res = await edgeFetch(`${base}/api/smart-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({
          model: hasBin ? 'gemini-3.8-flash' : 'gemini-3.5-flash-lite',
          thinkingBudget: 0
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
      '"paymentMethod":"Credit|Cash|Bank Transfer|Check","subtotalExVat":0,"vatAmount":0,"totalAmount":0,"lbpAmount":0,',
      '"hasVat":false,"pricePending":false,"qty":1,"uom":"","unitPrice":0,"notes":"",',
      '"lineItems":[{"description":"","qty":1,"uom":"Piece","unitCost":0,"lineTotal":0}]}',
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
      const timerEdge = setTimeout(() => ctrlEdge.abort(), inlinePart ? 13000 : 8500);
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
            model: useVisionProEdge ? 'gemini-3.8-flash' : 'gemini-3.5-flash-lite',
            thinkingBudget: 0
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

    // 1. Primary Cloud AI Relay (tiered: gemini-3.8-flash w/ thinkingBudget=0 for vision, gemini-3.5-flash-lite for clean text)
    const relay = resolveAskRelayEndpoint();
    if (relay.url && relay.url.startsWith('http')) {
      const useVisionPro = Boolean(inlinePart || cleanTxt.length < 160);
      const targetModel = useVisionPro ? 'gemini-3.8-flash' : 'gemini-3.5-flash-lite';
      const parts = [{ text: userMsg }];
      if (inlinePart) parts.push({ inlineData: inlinePart });
      const reqBody = {
        key: relay.key,
        op: 'ask',
        surface: 'smart_scan',
        q: 'Smart Scan Document Parse',
        companyScope: 'Smart Scan',
        model: targetModel,
        systemPrompt: sysPrompt,
        userPrompt: userMsg,
        geminiContents: [{ role: 'user', parts }]
      };
      if (useVisionPro) reqBody.thinkingBudget = 0;

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), inlinePart ? 13000 : 8500);
      try {
        const res = await fetch(relay.url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify(reqBody),
          signal: ctrl.signal
        });
        if (res.ok) {
          const j = await res.json();
          const parsed = extractJsonBlock(j && (j.rawReply || j.reply || j.answer));
          if (parsed && typeof parsed === 'object') {
            return { parsed, engine: inlinePart ? 'ISABI Vision Engine + Ledger Grounding' : 'ISABI Cloud AI + Ledger Grounding' };
          }
        }
      } catch (_) {
      } finally {
        clearTimeout(timer);
      }
    }

    // 2. Fallback Cloud JSON LLM
    const ctrl2 = new AbortController();
    const timer2 = setTimeout(() => ctrl2.abort(), 4500);
    try {
      const res2 = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai-fast',
          temperature: 0.1,
          messages: [
            { role: 'system', content: sysPrompt },
            { role: 'user', content: userMsg }
          ]
        }),
        signal: ctrl2.signal
      });
      if (res2.ok) {
        const j2 = await res2.json();
        const content = j2 && j2.choices && j2.choices[0] && j2.choices[0].message && j2.choices[0].message.content;
        const parsed2 = extractJsonBlock(content);
        if (parsed2 && typeof parsed2 === 'object') {
          return { parsed: parsed2, engine: 'ISABI Cloud AI + Ledger Grounding' };
        }
      }
    } catch (_) {
    } finally {
      clearTimeout(timer2);
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
      subtotalExVat: pickNum(det.subtotalExVat, ai.subtotalExVat),
      vatAmount: pickNum(det.vatAmount, ai.vatAmount),
      totalAmount: pickNum(det.totalAmount, ai.totalAmount),
      lbpAmount: pickNum(det.lbpAmount, ai.lbpAmount),
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

  async function applyScanToModal(scanBundle, overrideFormType) {
    if (!D || !scanBundle) return;
    const { parsed, matched, attObj } = scanBundle;
    const requestedForm = overrideFormType || parsed.formType || 'expense';
    const canEnter = D.canEnterForm || (() => true);

    let targetForm = requestedForm;
    if (!canEnter(targetForm)) {
      const fallbackOrder = (parsed.altForms || []).concat(['expense', 'sales', 'document']);
      const permitted = fallbackOrder.find(f => canEnter(f));
      if (permitted) {
        targetForm = permitted;
        matched.warnings = (matched.warnings || []).concat([{
          kind: 'role_fallback',
          text: `Your seat does not have entry permission for "${requestedForm}"; routed to "${targetForm}" instead.`
        }]);
      } else {
        targetForm = D.STATE.modalForm || 'sales';
      }
    }

    // Switch industry/company scope if the document explicitly identifies a permitted company in another industry
    const targetCo = matched.targetCompany;
    let resolvedNextInd = D.getActiveIndustry ? D.getActiveIndustry(D.STATE.company) : 'Manufacturing';
    if (targetCo && D.COMPANY_KEY_BY_NAME && D.selectCompanyScope) {
      const coKey = D.COMPANY_KEY_BY_NAME[targetCo];
      const curInd = resolvedNextInd;
      const nextInd = D.getActiveIndustry && coKey ? D.getActiveIndustry(coKey) : curInd;
      resolvedNextInd = nextInd || curInd;
      if (coKey && curInd !== nextInd) {
        try { D.selectCompanyScope(coKey); } catch (_) {}
      }
    }

    // Never route non-Manufacturing vendor/delivery bills into quarry-only forms ('raw'/'fuel'/'malfunction')
    let resolvedIndQuickTpl = overrideFormType ? '' : (parsed.indQuickTpl || '');
    if (resolvedNextInd && resolvedNextInd !== 'Manufacturing') {
      if (['raw', 'fuel', 'malfunction', 'pricerule', 'triprate'].includes(targetForm)) {
        targetForm = canEnter('expense') ? 'expense' : (canEnter('document') ? 'document' : targetForm);
      } else if (targetForm === 'sales' && !resolvedIndQuickTpl) {
        if (parsed.supplier && !parsed.customer && canEnter('expense')) {
          targetForm = 'expense';
        } else {
          resolvedIndQuickTpl = 'ss_ind_sales';
        }
      }
    }

    // Open or switch #entryModal cleanly without wiping SCAN_STATE
    SCAN_STATE.suppressResetOnModalSwitch = true;
    try {
      D.openEntryModal(targetForm, null, {
        forceSwitch: true,
        indQuickTpl: resolvedIndQuickTpl
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
        if (matched.groundedLines && matched.groundedLines.length > 0) {
          const linesSum = matched.groundedLines.reduce((s, x) => s + Number(x.line_total || 0), 0);
          let scaleFactor = 1;
          if (parsed.subtotalExVat > 0 && parsed.totalAmount > parsed.subtotalExVat) {
            if (supIsIva) {
              // recalcExpense multiplies by 1.11, so lines must be pre-VAT
              if (Math.abs(linesSum - parsed.totalAmount) < 0.1) {
                scaleFactor = parsed.subtotalExVat / parsed.totalAmount;
              }
            } else {
              // recalcExpense multiplies by 1.0, so scale ex-VAT lines up to full TTC payable when VAT is on the bill
              if (Math.abs(linesSum - parsed.subtotalExVat) < 0.1 && (isHospitality || parsed.hasVat)) {
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
          let baseAmt = 0;
          if (!parsed.pricePending) {
            const fullTotal = parsed.totalAmount || convertedLbpUsd || parsed.subtotalExVat || 0;
            if (supIsIva) {
              baseAmt = parsed.subtotalExVat > 0 ? parsed.subtotalExVat : round2(fullTotal / 1.11);
            } else {
              baseAmt = fullTotal;
            }
          }
          const effQty = parsed.qty > 0 ? parsed.qty : 1;
          FORM_UI.expItems = [{
            item_name: matched.product || matched.subcategory || matched.category || 'Scanned Expense Item',
            allocation_mode: matched.equipment ? 'equipment' : 'general',
            target_equipment: matched.equipment || '',
            warehouse_location: defWhLoc,
            qty: effQty,
            uom: parsed.uom || 'Piece',
            unit_cost: parsed.pricePending ? '' : round2(baseAmt / effQty)
          }];
          FORM_UI.expItem0Manual = true;
        }
        if (D.renderExpenseItemsBuilderRows) D.renderExpenseItemsBuilderRows();
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
      if (matched.counterparty && $('f_counterparty')) {
        setInputValueAndFire('f_counterparty', matched.counterparty, filledSet, warnSet, false);
      }
      if (parsed.direction && $('f_direction')) {
        setInputValueAndFire('f_direction', parsed.direction === 'Out' ? 'Outflow' : 'Inflow', filledSet, warnSet, false);
      }
      if (parsed.totalAmount > 0 && $('f_usd')) {
        setInputValueAndFire('f_usd', parsed.totalAmount, filledSet, warnSet, false);
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

    // 6. Attach all scanned pages (1..N) into FORM_UI.attachments without duplication
    const bundleAtts = Array.isArray(scanBundle.attObjs) && scanBundle.attObjs.length
      ? scanBundle.attObjs
      : (attObj ? [attObj] : []);
    if (FORM_UI && bundleAtts.length) {
      if (!Array.isArray(FORM_UI.attachments)) FORM_UI.attachments = [];
      let addedAny = false;
      bundleAtts.forEach(aItem => {
        if (!aItem) return;
        const dup = FORM_UI.attachments.some(a =>
          a &&
          a.file_name === aItem.file_name &&
          Number(a.file_size || 0) === Number(aItem.file_size || 0) &&
          String(a.data_url || '').slice(0, 120) === String(aItem.data_url || '').slice(0, 120)
        );
        if (!dup) {
          FORM_UI.attachments.push(Object.assign({}, aItem));
          addedAny = true;
        }
      });
      if (addedAny && D.renderEntryAttachmentsListUI) D.renderEntryAttachmentsListUI();
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

  // ==================== MAIN SCAN ORCHESTRATOR (SINGLE & MULTI-PAGE 1..N) ====================
  async function scanFileOrAttachment(inputFileOrAtt, captureMethod = 'AI Smart Scan') {
    if (!D || SCAN_STATE.busy) return null;
    const rawItems = expandInputToScanBatch(inputFileOrAtt);
    if (!rawItems.length) return null;

    SCAN_STATE.busy = true;
    SCAN_STATE.sampleMenuOpen = false;
    SCAN_STATE.imgRotateDeg = 0;
    SCAN_STATE.progressMsg = rawItems.length > 1
      ? `Reading ${rawItems.length}-page bundle and preparing stitched preview...`
      : 'Reading document and preparing preview...';

    // Ensure #entryModal is open so user immediately sees live progress
    const modal = $('entryModal');
    if (!modal || modal.hidden) {
      const initForm = (D.contextFormForView && D.contextFormForView(D.STATE.view)) || 'expense';
      D.openEntryModal(D.canEnterForm && !D.canEnterForm(initForm) ? 'sales' : initForm);
    } else {
      renderSmartScanBarDom();
    }

    const updateStatus = msg => {
      SCAN_STATE.progressMsg = sanitizeOutwardText(msg);
      renderSmartScanBarDom();
    };

    try {
      // Wait up to 2s if full seed records are still unpacking after cold reload
      if (D.SEED && !D.SEED._recordsReady) {
        for (let w = 0; w < 40 && !D.SEED._recordsReady; w++) {
          await new Promise(r => setTimeout(r, 50));
        }
      }

      const normPairs = [];
      const pageEntries = [];
      for (let i = 0; i < rawItems.length; i++) {
        if (rawItems.length > 1) {
          updateStatus(`Extracting page ${i + 1} of ${rawItems.length}...`);
        }
        const pair = await normalizeSingleScanItem(rawItems[i], captureMethod, i);
        if (!pair.attObj) continue;
        normPairs.push(pair);

        const fName = pair.attObj.file_name || `Page_${i + 1}`;
        const isPdfPair = /\.pdf$/i.test(fName) || /application\/pdf/i.test(pair.attObj.mime_type || '');
        if (isPdfPair && pair.fileObj) {
          const ab = await pair.fileObj.arrayBuffer();
          const pdfPages = await extractPdfPagesTextClient(ab);
          if (pdfPages.length > 1) {
            pdfPages.forEach((pt, pIdx) => {
              pageEntries.push({ pageNum: pageEntries.length + 1, fileName: `${fName} (p.${pIdx + 1})`, text: pt });
            });
            continue;
          }
        }
        const pageTxt = await extractAnyDocumentText(pair.fileObj, pair.attObj, rawItems.length === 1 ? updateStatus : () => {});
        pageEntries.push({ pageNum: pageEntries.length + 1, fileName: fName, text: pageTxt });
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
      if (!aiResult && !isBuiltInSample) {
        aiResult = await tryCloudAiStructuredParse(combinedText, prelimScope, visionTargetAtt, totalPages);
      }

      const mergedParsed = mergeParsedResults(detParsed, aiResult && aiResult.parsed);
      mergedParsed.pageCount = totalPages;
      mergedParsed.multiPageSynthesized = totalPages > 1;
      const matched = groundExtractedEntities(mergedParsed, combinedText);

      const scanBundle = {
        attObj,
        attObjs,
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

      SCAN_STATE.busy = false;
      SCAN_STATE.progressMsg = '';
      await applyScanToModal(scanBundle);

      if (D.toast) {
        const fTitle = (window.MFG_FORMS && window.MFG_FORMS.FORM_TITLES && window.MFG_FORMS.FORM_TITLES[scanBundle.appliedForm]) || scanBundle.appliedForm;
        const pagePrefix = totalPages > 1 ? `${totalPages}-page scan synthesized: ` : 'Smart Scan ';
        D.toast(`${pagePrefix}filled ${scanBundle.filledFields.length} field${scanBundle.filledFields.length === 1 ? '' : 's'} on ${sanitizeOutwardText(fTitle)}. Review & Post.`, 'ok');
      }
      return scanBundle;
    } catch (err) {
      SCAN_STATE.busy = false;
      SCAN_STATE.progressMsg = '';
      renderSmartScanBarDom();
      if (D.toast) D.toast('Could not scan file: ' + sanitizeOutwardText((err && err.message) || 'Unknown error'), 'err');
      return null;
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
    const scan = SCAN_STATE.lastScan;
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

    let reviewHtml = '';
    if (SCAN_STATE.busy) {
      reviewHtml = `
        <div class="ss-progress-row" id="ssProgressRow">
          <span class="ss-pulse-dot" aria-hidden="true"></span>
          <span>${esc(SCAN_STATE.progressMsg || 'Analyzing document and filling fields...')}</span>
        </div>
      `;
    } else if (hasResult) {
      const filledCnt = (scan.filledFields || []).length;
      const warnCnt = (scan.warnFields || []).length + ((scan.matched && scan.matched.warnings) ? scan.matched.warnings.length : 0);
      const isPending = Boolean(scan.parsed && scan.parsed.pricePending);
      const pageCnt = Math.max(1, Number((scan.parsed && scan.parsed.pageCount) || (scan.attObjs && scan.attObjs.length) || 1));
      const vinAudit = scan.parsed && scan.parsed.vinAudit && scan.parsed.vinAudit.isVin17 ? scan.parsed.vinAudit : null;
      const canEnter = D && D.canEnterForm ? D.canEnterForm : (() => true);
      const alts = Array.from(new Set([scan.parsed.formType].concat(scan.parsed.altForms || [])))
        .filter(f => f && f !== scan.appliedForm && canEnter(f))
        .slice(0, 4);

      const warningsList = ((scan.matched && scan.matched.warnings) || []);
      reviewHtml = `
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
    bar.classList.toggle('has-result', Boolean(SCAN_STATE.lastScan && !SCAN_STATE.busy));
    bar.innerHTML = renderSmartScanBarHtml();
    wireSmartScanBarEvents(bar);
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
          D.openDocumentCameraCapture(async captured => {
            const list = Array.isArray(captured) ? captured : (captured && captured.length ? Array.from(captured) : (captured ? [captured] : []));
            if (!list.length) return;
            await scanFileOrAttachment(list, 'Live Camera Smart Scan');
          });
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
    const isUniv = ['customer', 'supplier', 'product', 'item', 'expensecategory', 'site', 'region', 'driver', 'staff', 'staffrole', 'fxrate', 'vatrate', 'currency'].includes(form);

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
      unwrapSplitPreviewDom();
      return;
    }

    let bar = $('entrySmartScanBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'entrySmartScanBar';
      bar.className = 'entry-smart-scan-bar';
      body.insertBefore(bar, body.firstChild);
    } else if (bar.parentElement !== body || body.firstElementChild !== bar) {
      body.insertBefore(bar, body.firstChild);
    }

    renderSmartScanBarDom();

    // Drag & Drop + Paste on #entryModal (wired once)
    if (modal.dataset.ssDropWired !== '1') {
      modal.dataset.ssDropWired = '1';
      modal.addEventListener('dragover', e => {
        if (modal.hidden) return;
        if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
          e.preventDefault();
          const b = $('entrySmartScanBar');
          if (b) b.classList.add('is-dragover');
        }
      });
      modal.addEventListener('dragleave', e => {
        if (e.target === modal || e.target === $('entrySmartScanBar')) {
          const b = $('entrySmartScanBar');
          if (b) b.classList.remove('is-dragover');
        }
      });
      modal.addEventListener('drop', async e => {
        if (modal.hidden) return;
        const b = $('entrySmartScanBar');
        if (b) b.classList.remove('is-dragover');
        if (e.target && e.target.closest && e.target.closest('#entryAttachmentsBox')) return;
        const files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length) {
          e.preventDefault();
          e.stopPropagation();
          await scanFileOrAttachment(Array.from(files), 'Drag & Drop Smart Scan');
        }
      });
      document.addEventListener('paste', async e => {
        if (modal.hidden) return;
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (const it of Array.from(items)) {
          if (it.kind === 'file') {
            const f = it.getAsFile();
            if (f) {
              e.preventDefault();
              await scanFileOrAttachment(f, 'Clipboard Paste Smart Scan');
              break;
            }
          }
        }
      });
    }

    // Keep scrollTop at 0px on open
    body.scrollTop = 0;
  }

  function resetModalState() {
    if (SCAN_STATE.suppressResetOnModalSwitch) return;
    SCAN_STATE.busy = false;
    SCAN_STATE.progressMsg = '';
    SCAN_STATE.lastScan = null;
    SCAN_STATE.splitOpen = false;
    SCAN_STATE.sampleMenuOpen = false;
    SCAN_STATE.imgRotateDeg = 0;
    unwrapSplitPreviewDom();
    const body = $('modalBody');
    if (body) {
      body.querySelectorAll('.ss-ai-badge').forEach(b => b.remove());
      body.querySelectorAll('.ss-field-filled, .ss-field-check').forEach(w => {
        w.classList.remove('ss-field-filled', 'ss-field-check');
      });
    }
  }

  // ==================== TOPBAR & DOCUMENT VAULT BUTTONS ====================
  function openSmartScanEntryDesk(triggerPicker = false) {
    if (!D) return;
    const modal = $('entryModal');
    if (!modal || modal.hidden) {
      const form = (D.contextFormForView && D.contextFormForView(D.STATE.view)) || 'expense';
      const safeForm = (D.canEnterForm && D.canEnterForm(form)) ? form : 'sales';
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
        ide_tenant: 'Mazen (Unesco Pharmacy)',
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
    const hit = allowed.find(a => String(a || '').toLowerCase() === String(requestedCo || '').toLowerCase());
    if (hit) return hit;
    return allowed[0] || requestedCo || 'Bdeir Holding';
  }

  // Deterministic Cross-Page Domain Bundle Parser across all 5 Domain-Modal Industries (1..N Pages)
  function deterministicParseDomainBundle(pageEntries, combinedText, curSpec, primaryFileName) {
    const cleanAll = normalizeDigits(String(combinedText || '')).replace(/\r/g, '');
    if (cleanAll.trim().length < 10 && !extractVin17CandidateFromText(primaryFileName || '')) return null;

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

    const companyRaw = findFirstLabel(/^(?:company|entity|landlord|lessor|broker|seller|resort(?:\s*property)?|trading\s*entity|subsidiary)\s*:\s*(.+)$/i)
      || (/4235\s*company/i.test(cleanAll) ? '4235 Company S.A.L'
        : (/\bproperties\b/i.test(cleanAll) && /lease|rent|tenant/i.test(cleanAll) ? 'Properties'
          : (/insurance\s*company/i.test(cleanAll) ? 'Insurance Company'
            : (/\bshacman\b/i.test(cleanAll) ? 'Shacman'
              : (/\bkorri\s*auto\b/i.test(cleanAll) ? 'Korri Auto'
                : (/\bblanca\b/i.test(cleanAll) ? 'Blanca'
                  : (/\bla\s*una\b/i.test(cleanAll) ? 'La Una' : '')))))));

    const fields = {};
    const docId = findFirstLabel(/^(?:(?:lease|policy|endorsement|claim|remittance|agreement|invoice|import\s*file|unit\s*stock|voucher|transfer|contract|slip|work\s*order)\s*(?:no|#|id)?|ref(?:erence)?)\s*[:#-]?\s*([A-Za-z0-9/_-]{3,36})/i)
      || ((cleanAll.match(/\b(?:POL|END|ALZ|MGF|BNK|AXA|CLM|REM|AGR|LSE|INV-4235|INV-PROP|INV-TRD|IMP-TRD|IMP-SH|SU-SH|SU-KA|REV-HSP|POS-CL|MEM-2026|IC-HLD|IC-2026|LN-HLD)-[A-Z0-9-]{2,24}\b/i) || [])[0] || '');
    if (docId) fields.ide_id = docId;

    const issueDate = findIsoDateByLabel(/^(?:(?:invoice|issue|policy|effective|loss|arrival|operating|close|transfer|agreement|order)\s*date|date)\s*:\s*(.+)$/i) || parseDocumentDateISO(cleanAll);
    if (issueDate) fields.ide_date = issueDate;

    const startDate = findIsoDateByLabel(/^(?:(?:lease\s*)?start\s*date|commencement(?:\s*date)?|effective\s*from(?:\s*date)?|valid\s*from)\s*:\s*(.+)$/i);
    if (startDate) fields.ide_start_date = startDate;

    const endDate = findIsoDateByLabel(/^(?:(?:lease\s*)?end\s*date|termination(?:\s*date)?|expiry(?:\s*date)?|expiration(?:\s*date)?|valid\s*(?:to|until))\s*:\s*(.+)$/i);
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

    // 1. Real Estate & Property (re_leases, re_invoicing, re_sales, re_workorders, re_units)
    const propVal = findFirstLabel(/^(?:property|building|tower|center|plaza)\s*:\s*(.+)$/i);
    if (propVal) fields.ide_property = propVal;
    const unitVal = findFirstLabel(/^(?:unit|suite|leased\s*unit|floor(?:\s*\/?\s*suite)?|cabana|chalet)\s*:\s*(.+)$/i);
    if (unitVal) fields.ide_unit = unitVal;
    const tenantVal = findFirstLabel(/^(?:tenant|lessee|occupant|rented\s*to)\s*:\s*(.+)$/i);
    if (tenantVal) fields.ide_tenant = tenantVal;
    const freqVal = findFirstLabel(/^(?:billing\s*frequency|payment\s*frequency|rent\s*frequency|frequency)\s*:\s*(.+)$/i);
    if (freqVal) {
      if (/month/i.test(freqVal)) fields.ide_freq = 'Monthly';
      else if (/annual|year/i.test(freqVal)) fields.ide_freq = 'Annual';
      else if (/quarter/i.test(freqVal)) fields.ide_freq = 'Quarterly';
    }
    const netRent = findLastMoneyLabel(/^(?:period\s*net\s*rent|net\s*rent(?:\s*ex-?vat)?|base\s*rent|net\s*sale\s*amount|net\s*amount(?:\s*ex-?vat)?|subtotal(?:\s*ex-?vat)?)\s*[:$-]*\s*(.+)$/i);
    if (netRent !== null && netRent > 0) fields.ide_net = String(netRent);
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

    // 2. Insurance & Brokerage (ins_policies, ins_claims, ins_remittances, ins_agreements)
    const clientVal = findFirstLabel(/^(?:policyholder|insured|assured|client(?:\s*name)?)\s*:\s*(.+)$/i);
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
    const prodVal = findFirstLabel(/^(?:product|cover(?:age)?|plan)\s*:\s*(.+)$/i);
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
    const gwpVal = findLastMoneyLabel(/^(?:gross\s*(?:written\s*)?premium|gwp|total\s*gross\s*premium)\s*[:$-]*\s*(.+)$/i);
    if (gwpVal !== null && gwpVal > 0) fields.ide_gwp = String(gwpVal);
    const rateMatch = cleanAll.match(/(?:commission\s*rate|brokerage\s*rate|agreed\s*rate)\s*[:#-]?\s*(\d+(?:\.\d+)?)\s*%/i);
    if (rateMatch) fields.ide_rate = String(Number(rateMatch[1]));
    const discVal = findLastMoneyLabel(/^(?:client\s*(?:discount|rebate)|discount)\s*[:$-]*\s*(.+)$/i);
    if (discVal !== null) fields.ide_discount = String(discVal);
    const feeVal = findLastMoneyLabel(/^(?:policy\s*fee|admin(?:istration)?\s*fee|issuance\s*fee)\s*[:$-]*\s*(.+)$/i);
    if (feeVal !== null) fields.ide_fee = String(feeVal);

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

    // 3. Automotive & Heavy Trading (trd_trucks, trd_sales, trd_purchases)
    const custVal = findFirstLabel(/^(?:customer|sold\s*to|bill\s*to)\s*:\s*(.+)$/i);
    if (custVal) fields.ide_customer = custVal;
    const modelVal = findFirstLabel(/^(?:vehicle\s*model|model|item\s*description|truck\s*model)\s*:\s*(.+)$/i);
    if (modelVal) {
      fields.ide_model = modelVal;
      fields.ide_item = modelVal;
    }
    const famVal = findFirstLabel(/^(?:series|family)\s*:\s*(.+)$/i);
    if (famVal) fields.ide_family = famVal;
    const engVal = findFirstLabel(/^(?:engine\s*(?:serial|no|#))\s*[:#-]?\s*([A-Za-z0-9._-]{4,32})/i);
    if (engVal) fields.ide_engine = engVal;
    const supVal = findFirstLabel(/^(?:foreign\s*oem\s*supplier|oem\s*supplier|supplier|exporter)\s*:\s*(.+)$/i);
    if (supVal) fields.ide_supplier = supVal;
    const origVal = findFirstLabel(/^(?:port\s*of\s*origin|origin\s*port|port\s*of\s*loading)\s*:\s*(.+)$/i);
    if (origVal) fields.ide_origin = origVal;
    const blVal = findFirstLabel(/^(?:bill\s*of\s*lading|ocean\s*b\/?l|container\s*\/?\s*b\/?l|b\/?l\s*(?:no|#))\s*[:#-]?\s*(.+)$/i);
    if (blVal) fields.ide_bl = blVal;
    const ordQtyM = cleanAll.match(/(?:ordered\s*qty|quantity\s*ordered)\s*[:#-]?\s*(\d+)/i);
    if (ordQtyM) fields.ide_ord_qty = ordQtyM[1];
    const recQtyM = cleanAll.match(/(?:received\s*qty|quantity\s*received|units\s*received)\s*[:#-]?\s*(\d+)/i);
    if (recQtyM) fields.ide_rec_qty = recQtyM[1];
    const fobVal = findLastMoneyLabel(/^(?:(?:supplier\s*)?fob\s*(?:cost|value|amount)|commercial\s*invoice\s*fob)\s*[:$-]*\s*(.+)$/i);
    if (fobVal !== null && fobVal > 0) fields.ide_fob = String(fobVal);
    // Sum freight + customs + clearance if itemized across Page 2, or read explicit landed add
    const explicitAdd = findLastMoneyLabel(/^(?:allocated\s*landed\s*add|freight,?\s*customs\s*(?:&|and)\s*clearance|total\s*landed\s*add-?ons?)\s*[:$-]*\s*(.+)$/i);
    if (explicitAdd !== null) {
      fields.ide_landed_add = String(explicitAdd);
    } else {
      const freightV = findLastMoneyLabel(/^(?:ocean\s*freight|freight\s*charges?)\s*[:$-]*\s*(.+)$/i) || 0;
      const customsV = findLastMoneyLabel(/^(?:customs\s*duty|port\s*(?:&|and)?\s*clearance)\s*[:$-]*\s*(.+)$/i) || 0;
      if (freightV + customsV > 0) fields.ide_landed_add = String(round2(freightV + customsV));
    }
    const listVal = findLastMoneyLabel(/^(?:showroom\s*list\s*price|list\s*price)\s*[:$-]*\s*(.+)$/i);
    if (listVal !== null && listVal > 0) fields.ide_list = String(listVal);
    const costVal = findLastMoneyLabel(/^(?:capitalized\s*landed\s*cost|unit\s*landed\s*cost|cost\s*of\s*sale)\s*[:$-]*\s*(.+)$/i);
    if (costVal !== null && costVal > 0) fields.ide_cost = String(costVal);

    // 4. Hospitality & Resorts (hsp_revenue, hsp_pos, hsp_memberships)
    const outletVal = findFirstLabel(/^(?:venue|outlet|venue\s*\/\s*outlet)\s*:\s*(.+)$/i);
    if (outletVal) fields.ide_outlet = outletVal;
    const revCat = findFirstLabel(/^(?:revenue\s*stream|stream)\s*:\s*(.+)$/i);
    if (revCat) {
      if (/diesel/i.test(revCat)) fields.ide_category = 'Generator Diesel Recharge';
      else if (/tip|gratuit/i.test(revCat)) fields.ide_category = 'Staff Tips & Gratuities';
      else if (/wedding|event/i.test(revCat)) fields.ide_category = 'Events & Weddings';
      else if (/f&b|restaurant/i.test(revCat)) fields.ide_category = 'Restaurant F&B';
      else if (/beach/i.test(revCat)) fields.ide_category = 'Beach Entrance';
      else if (/chalet|cabana/i.test(revCat)) fields.ide_category = 'Chalet Rental';
    }
    const coversM = cleanAll.match(/(?:guest\s*covers|covers)\s*[:#-]?\s*(\d+)/i);
    if (coversM) fields.ide_covers = coversM[1];
    const roomsM = cleanAll.match(/(?:occupied\s*(?:chalets|rooms|suites)|rooms)\s*[:#-]?\s*(\d+)/i);
    if (roomsM) fields.ide_rooms = roomsM[1];
    const totRev = findLastMoneyLabel(/^(?:total\s*billed(?:\s*revenue)?|closing\s*total(?:\s*ttc)?|grand\s*total(?:\s*ttc)?)\s*[:$-]*\s*(.+)$/i);
    if (totRev !== null && totRev > 0) fields.ide_tot = String(totRev);

    // 5. Holding & Treasury (hld_interactions, hld_loans)
    const fromCo = findFirstLabel(/^(?:from\s*(?:sister\s*)?entity|sender(?:\s*entity)?|remitter)\s*:\s*(.+)$/i);
    if (fromCo) fields.ide_from = fromCo;
    const toCo = findFirstLabel(/^(?:to\s*(?:sister\s*)?entity|receiver(?:\s*entity)?|beneficiary\s*sister)\s*:\s*(.+)$/i);
    if (toCo) fields.ide_to = toCo;
    const wireUsd = findLastMoneyLabel(/^(?:transfer\s*amount|wire\s*amount|advance\s*amount)\s*[:$-]*\s*(.+)$/i);
    if (wireUsd !== null && wireUsd > 0) fields.ide_usd = String(wireUsd);
    const notesVal = Array.from(new Set((pageEntries || []).map(pe => {
      const ls = String((pe && pe.text) || '').split('\n').map(x => x.trim()).filter(Boolean);
      return extractLabeledValue(ls, /^(?:notes?|purpose|remarks?|treasury\s*purpose)\s*:\s*(.+)$/i);
    }).filter(Boolean))).join(' · ');
    if (notesVal) fields.ide_notes = notesVal;

    // Infer formKey if modal wasn't already locked to a specific specKey
    let inferredFormKey = specKey;
    if (!inferredFormKey) {
      if (fields.ide_tenant || /commercial\s*lease|lease\s*agreement/i.test(cleanAll)) inferredFormKey = 're_leases';
      else if (fields.ide_claimed || /loss\s*adjuster|claim/i.test(cleanAll)) inferredFormKey = 'ins_claims';
      else if (fields.ide_gwp || /policy\s*schedule|gross\s*written\s*premium/i.test(cleanAll)) inferredFormKey = 'ins_policies';
      else if (fields.ide_bl || /bill\s*of\s*lading|import\s*file/i.test(cleanAll)) inferredFormKey = 'trd_purchases';
      else if (vinAudit && vinAudit.isVin17 && !fields.ide_customer) inferredFormKey = 'trd_trucks';
      else if (vinAudit && vinAudit.isVin17) inferredFormKey = 'trd_sales';
      else if (fields.ide_from && fields.ide_to) inferredFormKey = 'hld_interactions';
      else if (fields.ide_outlet) inferredFormKey = 'hsp_revenue';
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
    const safeCo = resolveRlsSafeDomainCompany(sampleOrExt.company, sampleOrExt.ind);
    const modal = $('indDomainEntryModal');
    const curSpecKey = modal && modal._currentDomainSpec ? modal._currentDomainSpec.key : '';
    if (!modal || modal.hidden || (sampleOrExt.formKey && curSpecKey !== sampleOrExt.formKey)) {
      if (typeof D.openIndustryDomainEntryModal === 'function') {
        D.openIndustryDomainEntryModal(sampleOrExt.formKey || curSpecKey, { company: safeCo });
      }
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

    // Apply carrier & line BEFORE rate/discount so syncPolicyAgreementRate doesn't overwrite explicit scanned commission rate!
    const orderedEntries = Object.entries(fields).sort(([a], [b]) => {
      const prio = k => (k === 'ide_carrier' || k === 'ide_line' || k === 'ide_date' || k === 'ide_type') ? 0 : 1;
      return prio(a) - prio(b);
    });

    const fIdx = (D && typeof D.getFreqIndex === 'function') ? D.getFreqIndex() : null;
    let appliedCount = 0;
    orderedEntries.forEach(([fId, rawVal]) => {
      const el = $(fId);
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
      el.value = valToSet;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
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
    if (liveModal && typeof liveModal._addPendingDomainFile === 'function') {
      const existingPending = typeof liveModal._getPendingDomainFiles === 'function' ? (liveModal._getPendingDomainFiles() || []) : [];
      const rawFiles = Array.isArray(sampleOrExt.rawFiles) && sampleOrExt.rawFiles.length
        ? sampleOrExt.rawFiles
        : (sampleOrExt.rawFile ? [sampleOrExt.rawFile] : []);

      if (rawFiles.length) {
        rawFiles.forEach(rf => {
          if (typeof Blob !== 'undefined' && rf instanceof Blob) {
            if (!existingPending.includes(rf)) {
              rf._captureMethod = sampleOrExt.captureMethod || 'AI Smart Scan';
              liveModal._addPendingDomainFile(rf);
            }
          }
        });
      } else if (!sampleOrExt.skipSyntheticFile) {
        const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360"><rect width="100%" height="100%" fill="#FAF8F4"/><text x="28" y="48" font-family="monospace" font-size="18" font-weight="bold" fill="#181512">${esc(sanitizeOutwardText(sampleOrExt.label || 'AI Smart Scan Document'))}</text><text x="28" y="84" font-family="monospace" font-size="14" fill="#4A443C">Entity: ${esc(safeCo)} · Ref: ${esc(fields.ide_id || 'SCAN-01')}</text></svg>`;
        const blob = new Blob([svgStr], { type: 'image/svg+xml' });
        const fakeFile = new File([blob], sampleOrExt.fileName || 'SmartScan_Domain_Voucher.svg', { type: 'image/svg+xml' });
        fakeFile._captureMethod = 'AI Smart Scan';
        liveModal._addPendingDomainFile(fakeFile);
      }
    }
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
    const batch = expandInputToScanBatch(filesOrAtt);
    const firstItem = batch[0] || null;
    const fName = String((firstItem && (firstItem.name || firstItem.file_name)) || '').toLowerCase();
    let sample = DOMAIN_SAMPLE_SCANS[0];
    if (/lease|4235|rent|prop/i.test(fName)) sample = DOMAIN_SAMPLE_SCANS[1];
    else if (/vin|shacman|korri|truck|bl/i.test(fName)) sample = DOMAIN_SAMPLE_SCANS[2];
    else if (/blanca|launa|palms|voile|platinum|resort|cabana|pos/i.test(fName)) sample = DOMAIN_SAMPLE_SCANS[3];
    else if (/holding|wire|ic|intercompany/i.test(fName)) sample = DOMAIN_SAMPLE_SCANS[4];
    else if (D && typeof D.getActiveIndustry === 'function') {
      const curInd = D.getActiveIndustry(D.STATE && D.STATE.company);
      sample = DOMAIN_SAMPLE_SCANS.find(s => s.ind === curInd) || DOMAIN_SAMPLE_SCANS[0];
    }

    const liveModal = $('indDomainEntryModal');
    const curSpec = liveModal && !liveModal.hidden && liveModal._currentDomainSpec ? liveModal._currentDomainSpec : null;
    const rawFiles = batch.filter(it => typeof Blob !== 'undefined' && it instanceof Blob);

    // Extract text & normalized attachments across all 1..N pages (works online, offline & headlessly)
    const normPairs = [];
    const pageEntries = [];
    for (let i = 0; i < batch.length; i++) {
      const pair = await normalizeSingleScanItem(batch[i], opts.captureMethod || 'AI Smart Scan', i);
      if (!pair.attObj) continue;
      normPairs.push(pair);
      const pName = pair.attObj.file_name || `Page_${i + 1}`;
      const isPdfPair = /\.pdf$/i.test(pName) || /application\/pdf/i.test(pair.attObj.mime_type || '');
      if (isPdfPair && pair.fileObj) {
        const ab = await pair.fileObj.arrayBuffer();
        const pdfPages = await extractPdfPagesTextClient(ab);
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
      pageEntries.push({ pageNum: pageEntries.length + 1, fileName: pName, text: txt });
    }

    const totalPages = Math.max(1, pageEntries.length);
    const combinedText = totalPages > 1
      ? pageEntries.map((pe, idx) => `=== PAGE ${idx + 1} OF ${totalPages} (${pe.fileName}) ===\n${pe.text || ''}`).join('\n\n')
      : String((pageEntries[0] && pageEntries[0].text) || '');

    const primaryFileName = (normPairs[0] && normPairs[0].attObj && normPairs[0].attObj.file_name) || fName || sample.fileName;
    const detBundle = deterministicParseDomainBundle(pageEntries, combinedText, curSpec, primaryFileName);

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
        const inlinePart = extractVisionInlinePart(stitchedAtt);
        const relay = resolveAskRelayEndpoint();

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
        if (relay.url && relay.url.startsWith('http') && (inlinePart || String(combinedText || '').trim().length >= 12)) {
          const usePro = Boolean(inlinePart || String(combinedText || '').trim().length < 160);
          const parts = [{ text: userText }];
          if (inlinePart) parts.push({ inlineData: inlinePart });
          const reqBody = {
            key: relay.key,
            op: 'ask',
            surface: 'domain_smart_scan',
            q: 'Domain Smart Scan Parse',
            model: usePro ? 'gemini-3.8-flash' : 'gemini-3.5-flash-lite',
            systemPrompt: domPrompt,
            userPrompt: userText,
            geminiContents: [{ role: 'user', parts }]
          };
          if (usePro) reqBody.thinkingBudget = 0;
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), inlinePart ? 13000 : 8500);
          try {
            const res = await fetch(relay.url, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
              body: JSON.stringify(reqBody),
              signal: ctrl.signal
            });
            if (res.ok) {
              const j = await res.json();
              aiDom = extractJsonBlock(j && (j.rawReply || j.reply || j.answer));
            }
          } catch (_) {
          } finally {
            clearTimeout(timer);
          }
        }
        if (aiDom && aiDom.fields && typeof aiDom.fields === 'object' && Object.keys(aiDom.fields).length > 0) {
          const mergedFields = Object.assign({}, (detBundle && detBundle.fields) || {}, aiDom.fields);
          return applyDomainExtractionToModal({
            ind: (curSpec && curSpec.ind) || sample.ind,
            formKey: (curSpec && curSpec.key) || (detBundle && detBundle.formKey) || sample.formKey,
            company: aiDom.company || (detBundle && detBundle.company) || (($('ide_company') && $('ide_company').value) || sample.company),
            label: aiDom.label || (totalPages > 1 ? `${totalPages}-Page Bundle (${primaryFileName})` : primaryFileName),
            fileName: primaryFileName,
            rawFiles,
            pageCount: totalPages,
            vinAudit: detBundle && detBundle.vinAudit,
            captureMethod: opts.captureMethod || 'AI Smart Scan',
            fields: mergedFields
          });
        }
      } catch (_) {}
    }

    if (detBundle && Object.keys(detBundle.fields).length > 0) {
      return applyDomainExtractionToModal({
        ind: (curSpec && curSpec.ind) || sample.ind,
        formKey: (curSpec && curSpec.key) || detBundle.formKey || sample.formKey,
        company: detBundle.company || (($('ide_company') && $('ide_company').value) || sample.company),
        label: totalPages > 1 ? `${totalPages}-Page Synthesized Pack (${primaryFileName})` : primaryFileName,
        fileName: primaryFileName,
        rawFiles,
        pageCount: totalPages,
        vinAudit: detBundle.vinAudit,
        captureMethod: opts.captureMethod || 'AI Smart Scan',
        fields: detBundle.fields
      });
    }

    const customExt = Object.assign({}, sample, {
      formKey: (curSpec && curSpec.key) || sample.formKey,
      fileName: primaryFileName,
      rawFiles,
      pageCount: totalPages,
      captureMethod: opts.captureMethod || 'AI Smart Scan'
    });
    return applyDomainExtractionToModal(customExt);
  }

  function init(deps) {
    D = deps || {};
    ensureGlobalFileInputs();
    mountTopbarButtons();
    syncWorkspaceButtons();
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
    mountOnDocumentPreviewModal,
    syncWorkspaceButtons,
    resetModalState,
    openSmartScanEntryDesk,
    scanFileOrAttachment,
    runSampleScanById,
    runDomainSampleScan,
    scanIntoDomainModal,
    validateAndDisambiguateVin17,
    computeIso3779CheckDigit,
    SAMPLE_SCANS,
    DOMAIN_SAMPLE_SCANS,
    _state: () => SCAN_STATE
  };
})();
