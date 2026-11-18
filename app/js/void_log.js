/* ============================================================================
   ISABI Systems - Void Log Audit & Restore Center (js/void_log.js)
   - View `void_log` (Sentinels & Alerts hub): strict Supervisor & Owner access only.
   - Aggregates soft tombstones across Manufacturing/Shared SQL tables, the 5 sibling
     industries (custom rows + edit tombstones), and Hospitality POS gate-till voids.
   - Enforces company, industry, table, and payroll dollar confidentiality RLS.
   window.MFG_VOID_LOG = { init, reset, renderView, collectScopedVoidEntries, refreshPosVoids, openInspectModal, exportCsv }
   ============================================================================ */
(function () {
  'use strict';

  const MODULE_LABELS = {
    sales_tickets: 'Sales & Deliveries',
    raw_purchases: 'Quarry & Haulage',
    expenses: 'Expenses & Overhead',
    expense_items: 'Expense Line Items',
    customer_receipts: 'Customer Receipts',
    receipts: 'Customer Receipts',
    supplier_payments: 'Supplier Payments',
    settlements: 'Settlements',
    vat_invoices: 'VAT Invoices',
    fuel_intakes: 'Diesel & Fuel',
    fuel_malfunctions: 'Fuel Tank Warnings',
    equipment_defects: 'Defect Reports',
    equipment_repairs: 'Fleet Repairs',
    repair_items: 'Repair Line Items',
    equipment_oil_logs: 'Oil & Filter Logs',
    part_movements: 'Part Movements',
    warehouse_movements: 'Warehouse Moves',
    recurring_expenses: 'Recurring Schedules',
    documents: 'Document Vault',
    salaries: 'Salary Payments',
    employments: 'Staff Contracts',
    freelance_entries: 'Freelance Entries',
    logistics_allowances: 'Site Transport',
    attendance: 'Biometric Attendance',
    work_shifts: 'Work Shifts',
    overtime_rates: 'Overtime Rates',
    price_rules: 'Commercial Price Rules',
    credit_terms: 'Credit Terms',
    jv_partnerships: 'JV Partnerships',
    jv_distributions: 'JV Distributions',
    external_movements: 'External Treasury',
    loans: 'Loans & Facilities',
    loan_settlements: 'Loan Settlements',
    conversions: 'FX Conversions',
    customers: 'Customers',
    suppliers: 'Suppliers',
    sites: 'Sites',
    regions: 'Regions',
    products: 'Products',
    items: 'Spare Parts & Items',
    equipment: 'Equipment & Trucks',
    company_equipment: 'Company Fleet',
    drivers: 'Drivers',
    staff_members: 'Staff Directory',
    staff_roles: 'Staff Roles',
    staff_assignments: 'Staff Assignments',
    fx_rates: 'FX Rates',
    currencies: 'Currencies',
    vat_rates: 'VAT Rates',
    expense_categories: 'Expense Categories',
    product_types: 'Product Types',
    uoms: 'Units of Measure',
    gl_accounts: 'Chart of Accounts',
    hld_interactions: 'Sister Transfers',
    hld_extended: 'Extended Ledger',
    hld_partners: 'Partner Splits',
    hld_loans: 'Central Facilities',
    hsp_revenue: 'Venue & Chalet Close',
    hsp_pos: 'POS Till Close',
    hsp_memberships: 'Seasonal Memberships',
    hsp_tariffs: 'Resort Tariffs',
    hsp_stock: 'Kitchen & Cellar Stock',
    hsp_energy: 'Generators & Solar',
    trd_sales: 'Trading Sales Invoices',
    trd_targets: 'Targets & Price Lists',
    trd_purchases: 'Import & Landed Files',
    trd_trucks: 'Showroom VIN Units',
    trd_stock: 'Spare Parts SKUs',
    re_leases: 'Lease Contracts',
    re_invoicing: 'Rent Invoices',
    re_sales: 'Property Sales',
    re_workorders: 'Fit-Out Work Orders',
    ins_policies: 'Policies & Endorsements',
    ins_claims: 'Claims (FNOL)',
    ins_agreements: 'Carrier Agreements',
    ins_remittances: 'Carrier Remittances',
    pos_till: 'POS Gate Till'
  };

  const MODULE_ICONS = {
    sales_tickets: 'sales',
    raw_purchases: 'raw',
    expenses: 'expenses',
    expense_items: 'expenses',
    customer_receipts: 'customers',
    receipts: 'customers',
    supplier_payments: 'suppliers',
    settlements: 'suppliers',
    vat_invoices: 'sales_vat',
    fuel_intakes: 'fuel',
    fuel_malfunctions: 'warn',
    equipment_defects: 'warn',
    equipment_repairs: 'repair',
    repair_items: 'repair',
    equipment_oil_logs: 'droplet',
    part_movements: 'warehouse_parts',
    warehouse_movements: 'warehouse',
    recurring_expenses: 'recurring_expenses',
    documents: 'documents',
    salaries: 'payroll',
    employments: 'payroll_contracts',
    freelance_entries: 'staff',
    logistics_allowances: 'payroll_allowances',
    attendance: 'payroll_attendance',
    work_shifts: 'clock',
    overtime_rates: 'overtime',
    price_rules: 'pricing',
    credit_terms: 'pricing',
    jv_partnerships: 'raw_jv',
    jv_distributions: 'raw_jv',
    external_movements: 'external',
    loans: 'ledger_treasury',
    loan_settlements: 'ledger_treasury',
    conversions: 'conversions',
    customers: 'reg_customers',
    suppliers: 'reg_suppliers',
    sites: 'reg_sites',
    regions: 'reg_regions',
    products: 'reg_products',
    items: 'reg_items',
    equipment: 'reg_equipment',
    company_equipment: 'reg_equipment',
    drivers: 'reg_drivers',
    staff_members: 'reg_staff',
    staff_roles: 'reg_roles',
    staff_assignments: 'staffassignment',
    fx_rates: 'reg_fx_rates',
    currencies: 'reg_currencies',
    vat_rates: 'reg_vat_rates',
    expense_categories: 'reg_categories',
    product_types: 'box',
    uoms: 'box',
    gl_accounts: 'ledger',
    hld_interactions: 'hld_interactions',
    hld_extended: 'external',
    hld_partners: 'hld_partners',
    hld_loans: 'hld_loans',
    hsp_revenue: 'hsp_revenue',
    hsp_pos: 'hsp_pos',
    hsp_memberships: 'hsp_memberships',
    hsp_tariffs: 'pricing',
    hsp_stock: 'hsp_stock',
    hsp_energy: 'hsp_energy',
    trd_sales: 'trd_sales',
    trd_targets: 'trd_targets',
    trd_purchases: 'trd_purchases',
    trd_trucks: 'trd_trucks',
    trd_stock: 'trd_stock',
    re_leases: 're_leases',
    re_invoicing: 'trd_sales',
    re_sales: 're_sales',
    re_workorders: 're_workorders',
    ins_policies: 'ins_policies',
    ins_claims: 'ins_claims',
    ins_agreements: 'ins_agreements',
    ins_remittances: 'ins_remittances',
    pos_till: 'hsp_pos'
  };

  const PAYROLL_CONFIDENTIAL_TABLES = new Set([
    'salaries', 'employments', 'freelance_entries', 'logistics_allowances', 'overtime_rates', 'salary_payments'
  ]);

  const MFG_COMPANIES = ['WTC', 'BBConstruction', 'Lions Transport'];
  const HOSPITALITY_COMPANIES = ['Blanca', 'La Una', 'Palms', 'Voile', 'Platinum'];
  const CHRONO_BUCKETS = new Set([
    'ins_agreements', 're_leases', 'trd_targets', 'hsp_tariffs', 'hld_partners', 'hld_loans'
  ]);

  const PAGE_STEP = 100;
  const DEFAULT_FILTERS = {
    origin: 'user',
    days: 'all',
    module: 'all',
    actor: 'all',
    lens: 'all',
    drillDay: '',
    q: '',
    sortKey: 'voided_at',
    sortDir: 'desc',
    showPulse: true,
    visibleLimit: PAGE_STEP
  };

  let D = null;
  let wired = false;
  let armedRestoreKey = '';
  let editingNoteKey = '';
  let inspectKey = '';
  let openCombo = '';
  let comboQuery = '';
  let lastMatchedKeys = [];
  const inFlightKeys = new Set();

  const filterState = Object.assign({}, DEFAULT_FILTERS);

  const posVoidsState = {
    scopeKey: '',
    items: [],
    loaded: false,
    loading: false,
    error: false,
    gen: 0
  };

  function tr(s) {
    try { return (window.MFG_I18N && typeof window.MFG_I18N.t === 'function' && window.MFG_I18N.t(s)) || s; } catch (_) { return s; }
  }
  function lang() {
    try { return (window.MFG_I18N && window.MFG_I18N.getLang()) || 'en'; } catch (_) { return 'en'; }
  }
  function L(en, ar, fr) {
    const lc = lang();
    return lc === 'ar' ? ar : (lc === 'fr' ? fr : en);
  }
  const esc = s => (D && D.esc ? D.esc(s) : String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const ic = n => (D && D.ic ? D.ic(n) : '');
  const fmtNum = n => (D && D.fmtNum ? D.fmtNum(n) : String(n));
  const norm = s => (D && D.norm ? D.norm(s) : String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '));

  function humanizeModule(rawKey, fallbackTitle) {
    const k = String(rawKey || '').trim();
    if (k && Object.prototype.hasOwnProperty.call(MODULE_LABELS, k)) return MODULE_LABELS[k];
    const fb = String(fallbackTitle || '').replace(/\(\d+[^)]*\)/g, '').trim();
    if (fb && !/^[a-z0-9_]+$/.test(fb)) return fb;
    if (!k) return 'Ledger Record';
    return k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function iconForModule(crKey) {
    const k = String(crKey || '').trim();
    return MODULE_ICONS[k] || 'info';
  }

  function parseTimestampMs(raw) {
    if (!raw) return 0;
    const s = String(raw).trim();
    if (!s) return 0;
    const normIso = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(s)
      ? s.replace(' ', 'T')
      : s;
    const ms = Date.parse(normIso);
    return Number.isFinite(ms) ? ms : 0;
  }

  function localTodayIso() {
    const dt = new Date();
    const pad2 = n => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  }

  function formatDateDMY(raw) {
    const s = String(raw || '').trim();
    if (!s || s === '-' || s === '—') return '-';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    if (D && typeof D.fmtDateDMY === 'function') {
      const out = D.fmtDateDMY(s);
      if (out && out !== '—') return out;
    }
    return s;
  }

  function extractVoidedDayIso(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const hasTz = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(s);
    if (!hasTz) {
      const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
      if (m) return m[1];
    }
    const ms = parseTimestampMs(s);
    if (!ms) {
      const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
      return m ? m[1] : '';
    }
    const dt = new Date(ms);
    const pad2 = n => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  }

  function formatStampShort(raw) {
    const s = String(raw || '').trim();
    if (!s) return 'N/A';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return formatDateDMY(s);
    const hasTz = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(s);
    if (!hasTz) {
      const m = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}:\d{2})/.exec(s);
      if (m) return `${m[3]}-${m[2]}-${m[1]} ${m[4]}`;
    }
    const ms = parseTimestampMs(s);
    if (!ms) {
      const m = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}:\d{2})/.exec(s);
      return m ? `${m[3]}-${m[2]}-${m[1]} ${m[4]}` : s.slice(0, 20);
    }
    const dt = new Date(ms);
    const pad2 = n => String(n).padStart(2, '0');
    return `${pad2(dt.getDate())}-${pad2(dt.getMonth() + 1)}-${dt.getFullYear()} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
  }

  function formatCompactDay(iso) {
    const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? `${m[2]}-${m[1]}` : String(iso || '');
  }

  function relativeAgeLabel(dayIso) {
    if (!dayIso || !/^\d{4}-\d{2}-\d{2}$/.test(dayIso)) return '';
    const todayIso = localTodayIso();
    const d1 = Date.parse(`${dayIso}T00:00:00Z`);
    const d0 = Date.parse(`${todayIso}T00:00:00Z`);
    if (!Number.isFinite(d1) || !Number.isFinite(d0)) return '';
    const diffDays = Math.round((d0 - d1) / 86400000);
    if (diffDays === 0) return L('Today', 'اليوم', "Aujourd'hui");
    if (diffDays === 1) return L('Yesterday', 'أمس', 'Hier');
    if (diffDays > 1 && diffDays <= 30) return L(`${diffDays}d ago`, `منذ ${diffDays}ي`, `il y a ${diffDays}j`);
    return '';
  }

  function formatSignedUsd(val) {
    const n = Number(val || 0);
    if (!Number.isFinite(n)) return '$0';
    const r = Math.round(n * 100) / 100;
    return `${r < 0 ? '-$' : '$'}${fmtNum(Math.abs(r))}`;
  }

  function isAfterHoursStamp(raw) {
    const s = String(raw || '').trim();
    if (!s) return false;
    const isoUtc = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);
    let hr = NaN;
    if (isoUtc) {
      const ms = Date.parse(s);
      if (Number.isFinite(ms)) hr = new Date(ms).getHours();
    } else {
      const m = /(?:^|\s|T)(\d{2}):(\d{2})/.exec(s);
      if (m) hr = Number(m[1]);
    }
    return Number.isFinite(hr) && (hr >= 22 || hr < 6);
  }

  function parseMoneyNumber(val) {
    if (typeof val === 'number') return Number.isFinite(val) ? val : null;
    if (typeof val !== 'string') return null;
    let s = val.trim();
    if (!s || /^confidential$/i.test(s)) return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/[^0-9.\-]/g, '');
    if (!s || s === '-' || s === '.') return null;
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return neg ? -Math.abs(n) : n;
  }

  function extractRecordAmountUsd(rec, crKey) {
    if (!rec || typeof rec !== 'object') return null;
    const usdKeys = [
      'ttc_usd', 'total_usd', 'amount_usd', 'net_usd', 'paid_usd', 'price_usd', 'cost_usd',
      'salary_usd', 'premium_usd', 'rent_usd', 'commission_usd', 'claim_usd', 'billed_usd', 'cash_usd'
    ];
    for (const k of usdKeys) {
      if (rec[k] !== undefined && rec[k] !== null && rec[k] !== '') {
        const n = parseMoneyNumber(rec[k]);
        if (n !== null) return Math.round(n * 100) / 100;
      }
    }
    const genKeys = ['amount', 'total', 'net_salary', 'gross_salary', 'salary', 'value', 'premium', 'rent_amount'];
    const curStr = String(rec.currency || rec.cur || 'USD').trim().toUpperCase();
    const fx = Number(rec.fx_rate || rec.rate || (D && D.getLbpFxRate ? D.getLbpFxRate() : 89500)) || 89500;
    for (const k of genKeys) {
      if (rec[k] !== undefined && rec[k] !== null && rec[k] !== '') {
        const raw = String(rec[k]);
        const n = parseMoneyNumber(rec[k]);
        if (n !== null) {
          const isLbp = curStr === 'LBP' || /lbp|l\.l/i.test(raw);
          const usd = isLbp ? (fx > 0 ? n / fx : 0) : n;
          return Math.round(usd * 100) / 100;
        }
      }
    }
    if (rec.amount_lbp !== undefined && rec.amount_lbp !== null && rec.amount_lbp !== '') {
      const n = parseMoneyNumber(rec.amount_lbp);
      if (n !== null && fx > 0) return Math.round((n / fx) * 100) / 100;
    }
    if (crKey === 'sales_tickets' || crKey === 'raw_purchases') {
      const mTotal = parseMoneyNumber(rec.mat_total);
      const tTotal = parseMoneyNumber(rec.trans_total);
      if (mTotal !== null || tTotal !== null) {
        return Math.round(((mTotal || 0) + (tTotal || 0)) * 100) / 100;
      }
    }
    return null;
  }

  function extractDomainAmountUsd(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const direct = extractRecordAmountUsd(obj, '');
    if (direct !== null) return direct;
    const snap = obj.void_snapshot && typeof obj.void_snapshot === 'object' ? obj.void_snapshot : null;
    if (snap) {
      const fromSnap = extractRecordAmountUsd(snap, '');
      if (fromSnap !== null) return fromSnap;
    }
    const hdrs = Array.isArray(obj.headers) ? obj.headers : (snap && Array.isArray(snap.headers) ? snap.headers : null);
    const cls = Array.isArray(obj.cells) ? obj.cells : (snap && Array.isArray(snap.cells) ? snap.cells : null);
    if (Array.isArray(hdrs) && Array.isArray(cls)) {
      const fx = Number(obj.fx_rate || obj.rate || (D && D.getLbpFxRate ? D.getLbpFxRate() : 89500)) || 89500;
      for (let i = 0; i < hdrs.length; i++) {
        const h = String(hdrs[i] || '');
        if (!/total|amount|usd|value|balance|net|gross|premium|rent|cost|revenue|billed|cash/i.test(h)) continue;
        if (/qty|km|m3|%|rate|share/i.test(h)) continue;
        const c = String(cls[i] || '').trim();
        const n = parseMoneyNumber(c);
        if (n !== null) {
          const isLbp = /lbp/i.test(h) || /lbp|l\.l/i.test(c);
          const usd = isLbp ? (fx > 0 ? n / fx : 0) : n;
          return Math.round(usd * 100) / 100;
        }
      }
    }
    return null;
  }

  function effectiveRecordDate(rec, fallbackSnap) {
    const s = fallbackSnap && typeof fallbackSnap === 'object' ? fallbackSnap : {};
    const useRep = Boolean(D && D.STATE && D.STATE.basis === 'rep');
    const raw = useRep
      ? (rec.rep_date || rec.set_date || rec.date || rec.start_date || rec.day || s.rep_date || s.date || '')
      : (rec.date || rec.start_date || rec.rep_date || rec.set_date || rec.day || s.date || '');
    return String(raw || '').slice(0, 10);
  }

  function buildRecordSummary(rec, crKey) {
    if (!rec || typeof rec !== 'object') return String(crKey || 'Record');
    const parts = [];
    const primaryRef = rec.name || rec.ticket_no || rec.invoice_no || rec.voucher_no || rec.plate || rec.code || '';
    if (primaryRef) parts.push(String(primaryRef).trim());
    const party = rec.customer || rec.supplier || rec.staff || rec.driver || rec.equipment || rec.party || rec.counterparty || '';
    if (party && String(party).trim() !== String(primaryRef).trim()) parts.push(String(party).trim());
    const detail = rec.product || rec.category || rec.item || rec.role || rec.region || rec.subject || rec.description || rec.notes || '';
    if (detail && parts.length < 2) parts.push(String(detail).trim());
    if (!parts.length && rec.id) parts.push(String(rec.id).trim());
    return parts.join(' · ').slice(0, 140) || 'Voided record';
  }

  function isPartyInRegistry(relKey, partyName) {
    if (!D || !relKey || !partyName) return false;
    if (relKey === 'customers' || relKey === 'suppliers') return true;
    const nq = norm(partyName);
    if (!nq) return false;
    const seedArr = (D.SEED && D.SEED.records && Array.isArray(D.SEED.records[relKey])) ? D.SEED.records[relKey] : [];
    const custArr = (D.STATE && D.STATE.customRecords && Array.isArray(D.STATE.customRecords[relKey])) ? D.STATE.customRecords[relKey] : [];
    return seedArr.concat(custArr).some(r => r && (norm(r.name) === nq || norm(r.full_name) === nq || norm(r.plate) === nq || norm(r.code) === nq));
  }

  function extractStructuredDisplay(rec, crKey, masked, snap) {
    const s = snap && typeof snap === 'object' ? snap : {};
    let partyName = '';
    let partyRelKey = '';
    const partyCandidates = [
      ['customers', rec.customer],
      ['suppliers', rec.supplier],
      ['staff_members', rec.staff],
      ['drivers', rec.driver],
      ['equipment', rec.equipment],
      ['', rec.counterparty || s.counterparty],
      ['', rec.member || rec.tenant || rec.buyer || rec.carrier || rec.client || rec.party || rec.outlet]
    ];
    for (const [rk, val] of partyCandidates) {
      const sv = String(val || '').trim();
      if (sv) {
        partyName = sv;
        partyRelKey = rk;
        break;
      }
    }
    if (!partyName && rec.site) {
      partyName = String(rec.site).trim();
      partyRelKey = 'sites';
    }

    const tktNo = String(rec.ticket_no || rec.invoice_no || rec.voucher_no || '').trim();
    const rawName = String(rec.name || rec.plate || rec.code || '').trim();
    let refCode = '';
    if (tktNo) {
      const cleanTkt = tktNo.startsWith('#') ? tktNo : `#${tktNo}`;
      const prefix = crKey === 'sales_tickets' ? 'TKT' : (crKey === 'raw_purchases' ? 'RAW' : '');
      refCode = prefix ? `${prefix} ${cleanTkt}` : cleanTkt;
    } else if (rawName) {
      let cleaned = rawName.replace(/\s*\b\d{4}-\d{2}-\d{2}\b\s*/g, ' ').replace(/\s+/g, ' ').trim();
      if (partyName) {
        const pnEsc = partyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        cleaned = cleaned.replace(new RegExp(`\\s*[·\\-]?\\s*${pnEsc}$`, 'i'), '').trim();
      }
      refCode = cleaned || rawName;
    } else {
      refCode = String(rec.id || '').trim();
    }

    let detailLine = '';
    if (masked) {
      detailLine = tr('Payroll details restricted');
    } else {
      const qtyVal = rec.qty != null && rec.qty !== '' ? `${rec.qty}${rec.uom ? ' ' + rec.uom : ''}` : '';
      const bits = [
        rec.product,
        qtyVal,
        rec.site && norm(rec.site) !== norm(partyName) ? rec.site : '',
        rec.category,
        rec.item,
        rec.method,
        rec.role,
        rec.unit,
        rec.season,
        rec.subject,
        rec.description,
        rec.notes
      ].map(x => String(x || '').trim()).filter(Boolean);
      const deduped = [];
      const seenB = new Set([norm(partyName), norm(refCode)]);
      for (const b of bits) {
        const nb = norm(b);
        if (!nb || seenB.has(nb)) continue;
        seenB.add(nb);
        deduped.push(b);
        if (deduped.length >= 3) break;
      }
      detailLine = deduped.join(' · ').slice(0, 110);
    }

    return {
      refCode: refCode.slice(0, 56) || String(rec.id || '-'),
      partyName: partyName.slice(0, 80),
      partyRelKey,
      partyInRegistry: Boolean(partyRelKey && isPartyInRegistry(partyRelKey, partyName)),
      detailLine
    };
  }

  function classifyVoidOrigin(rec, byRaw, reasonRaw, isTillAutoRow) {
    const byL = String(byRaw || '').trim().toLowerCase();
    const reasonL = String(reasonRaw || '').trim().toLowerCase();
    const originL = String((rec && rec.origin) || '').trim().toLowerCase();

    const isSyncTwin = Boolean(
      isTillAutoRow
      || byL.startsWith('system-topup')
      || byL.startsWith('sharepoint top-up')
      || byL === 'system-parent-void'
      || byL === 'sharepoint recon'
      || byL === 'door tablet'
      || byL === 'gate till sync'
      || reasonL.startsWith('sharepoint_recon')
      || reasonL === 'door_tablet'
      || originL === 'door_tablet_void'
    );

    const rawTwins = rec && rec.twin_of;
    const twinIds = Array.isArray(rawTwins)
      ? rawTwins.map(x => String(x || '').trim()).filter(Boolean)
      : (typeof rawTwins === 'string' && rawTwins.trim() ? [rawTwins.trim()] : []);
    const twinDiff = String((rec && rec.twin_difference) || '').trim();

    const isWorkbookMatch = Boolean(
      !isSyncTwin && (
        byL.startsWith('workbook match')
        || byL.startsWith('workbook reconciliation')
        || twinIds.length > 0
        || twinDiff
      )
    );

    const systemKind = isSyncTwin ? 'sync_twin' : (isWorkbookMatch ? 'workbook_match' : 'manual');
    const originGroup = (isSyncTwin || isWorkbookMatch) ? 'system' : 'user';

    let actorDisplay = String(byRaw || '').trim();
    let actorKey = actorDisplay;
    const topupM = /^system-topup-(\d{4})(\d{2})(\d{2})$/i.exec(actorDisplay);
    if (topupM) {
      const dmy = `${topupM[3]}-${topupM[2]}-${topupM[1]}`;
      actorDisplay = L(`Workbook Sync (${dmy})`, `مزامنة الدفتر (${dmy})`, `Synchro classeur (${dmy})`);
      actorKey = `sync::${topupM[1]}-${topupM[2]}-${topupM[3]}`;
    } else if (byL.startsWith('system-topup') || /^sharepoint\s+(?:top-up|recon)/i.test(actorDisplay)) {
      actorDisplay = L('Workbook Sync', 'مزامنة الدفتر', 'Synchro classeur');
      actorKey = 'sync::workbook';
    } else if (byL === 'system-parent-void') {
      actorDisplay = L('Linked Parent Void', 'إلغاء القيد الأب', 'Annulation liée');
      actorKey = 'sync::parent';
    } else if (byL.startsWith('workbook match')) {
      actorDisplay = L('Workbook Match', 'مطابقة الدفتر', 'Correspondance classeur');
      actorKey = 'wb::match';
    } else if (byL.startsWith('workbook reconciliation')) {
      actorDisplay = L('Workbook Recon', 'تسوية الدفتر', 'Rapprochement classeur');
      actorKey = 'wb::recon';
    } else if (!actorDisplay) {
      actorDisplay = originGroup === 'system'
        ? L('System Sync', 'مزامنة النظام', 'Synchro système')
        : L('Supervisor', 'المشرف', 'Superviseur');
      actorKey = originGroup === 'system' ? 'sync::generic' : 'Supervisor';
    }

    return { systemKind, originGroup, actorDisplay, actorKey, twinIds, twinDiff };
  }

  function inferCompanyAndIndustry(rec, bucket) {
    const coRaw = String((rec && (rec.company || rec.resort || rec.entity || rec.fromCo)) || '').trim();
    let ind = String((rec && (rec.ind || rec._industry || rec.industry)) || '').trim();
    if (!ind && coRaw && D && D.getActiveIndustry) {
      const normCo = coRaw.toLowerCase();
      if (normCo !== 'all' && normCo !== 'all bus' && normCo !== 'all companies' && normCo !== 'shared') {
        ind = D.getActiveIndustry(coRaw) || '';
      }
    }
    if (!ind && bucket) {
      const b = String(bucket).toLowerCase();
      if (b.startsWith('hld_')) ind = 'Holding & Treasury';
      else if (b.startsWith('hsp_') || b === 'pos_till') ind = 'Hospitality & Resorts';
      else if (b.startsWith('trd_')) ind = 'Automotive & Heavy Trading';
      else if (b.startsWith('re_')) ind = 'Real Estate & Property';
      else if (b.startsWith('ins_')) ind = 'Insurance & Brokerage';
    }
    if (!ind) ind = 'Manufacturing';
    return { company: coRaw, industry: ind };
  }

  function activeScopeCompanies(u) {
    if (!D) return [];
    const allowed = D.allowedCompanyNames ? D.allowedCompanyNames(u) : [];
    const sc = String((D.STATE && D.STATE.company) || '').trim();
    if (!sc) return allowed;
    if (sc === 'manufacturing-group') {
      return allowed.filter(n => MFG_COMPANIES.some(m => m.toLowerCase() === n.toLowerCase()));
    }
    if (sc.startsWith('industry:')) {
      const indTarget = sc.slice(9).trim();
      return allowed.filter(n => D.getActiveIndustry(n) === indTarget);
    }
    const labelName = (D.COMPANY_LABELS && D.COMPANY_LABELS[sc]) || sc;
    const hit = allowed.filter(n => n.toLowerCase() === labelName.toLowerCase() || (D.COMPANY_KEY_BY_NAME && D.COMPANY_KEY_BY_NAME[n] === sc));
    return hit.length ? hit : [labelName].filter(n => allowed.some(a => a.toLowerCase() === n.toLowerCase()));
  }

  function isCompanyInActiveScope(coRaw, indRaw, scopeSet, scopeStr, activeInd, u) {
    const co = String(coRaw || '').trim();
    const normCo = co.toLowerCase().replace(/\s+/g, ' ');
    const isShared = !normCo || normCo === 'all' || normCo === 'all bus' || normCo === 'all companies' || normCo === 'shared';
    if (!isShared) {
      if (D.canAccessGeoCompany && !D.canAccessGeoCompany(co, u)) return false;
      if (!scopeSet.has(normCo)) return false;
    } else if (scopeStr !== 'manufacturing-group' && !scopeStr.startsWith('industry:') && scopeSet.size === 1) {
      if (indRaw && activeInd && indRaw !== activeInd) return false;
    }
    if (indRaw && D.canAccessGeoIndustry && !D.canAccessGeoIndustry(indRaw, u)) return false;
    if (activeInd && indRaw && scopeStr.startsWith('industry:') && indRaw !== activeInd) return false;
    return true;
  }

  function resolveActiveScopeCtx(u) {
    const scopeStr = String((D && D.STATE && D.STATE.company) || '');
    const activeInd = (D && D.getActiveIndustry) ? D.getActiveIndustry(scopeStr) : 'Manufacturing';
    const scopeCos = activeScopeCompanies(u);
    const scopeSet = new Set(scopeCos.map(c => String(c || '').toLowerCase().replace(/\s+/g, ' ').trim()).filter(Boolean));
    return { scopeStr, activeInd, scopeCos, scopeSet };
  }

  function getSyntheticDemoVoids(u) {
    if (!D || !D.isDemoScopeActive()) return [];
    const scopeCos = activeScopeCompanies(u);
    const activeInd = D.getActiveIndustry ? D.getActiveIndustry(D.STATE.company) : 'Manufacturing';
    const firstCo = scopeCos[0] || (activeInd === 'Hospitality & Resorts' ? 'La Una' : 'WTC');
    const secondCo = scopeCos[1] || firstCo;
    const todayIso = localTodayIso();
    const yd = new Date(Date.now() - 86400000);
    const yesterdayIso = `${yd.getFullYear()}-${String(yd.getMonth() + 1).padStart(2, '0')}-${String(yd.getDate()).padStart(2, '0')}`;
    const out = [
      {
        key: 'demo::user-1',
        sourceKind: 'demo',
        systemKind: 'manual',
        originGroup: 'user',
        id: 'DEMO-VOID-1042',
        crKey: 'sales_tickets',
        moduleLabel: activeInd === 'Hospitality & Resorts' ? 'Venue & Chalet Close' : 'Sales & Deliveries',
        company: firstCo,
        industry: activeInd,
        date: todayIso,
        summary: activeInd === 'Hospitality & Resorts' ? 'Cabana C-04 Duplicate Billing' : 'Ticket #1042 · Duplicate dispatch entry',
        refCode: activeInd === 'Hospitality & Resorts' ? 'Cabana C-04' : 'TKT #1042',
        partyName: activeInd === 'Hospitality & Resorts' ? 'Cabana C-04' : 'Cedar Coast Developers',
        partyRelKey: activeInd === 'Hospitality & Resorts' ? '' : 'customers',
        partyInRegistry: activeInd !== 'Hospitality & Resorts',
        detailLine: activeInd === 'Hospitality & Resorts' ? 'Duplicate close settlement' : 'Duplicate dispatch entry',
        amountUsd: 1280,
        amountMasked: false,
        voidedBy: 'Supervisor Demo',
        actorDisplay: 'Supervisor Demo',
        actorKey: 'Supervisor Demo',
        voidedAt: `${todayIso} 14:22`,
        voidedDayIso: todayIso,
        voidedAtMs: parseTimestampMs(`${todayIso}T14:22:00`),
        voidReason: 'Duplicate entry entered under wrong shift',
        noteUpdatedBy: '',
        noteUpdatedAt: '',
        twinIds: [],
        twinDiff: '',
        isCascadedChild: false,
        hasVoidedParent: false,
        isPosTill: false,
        canRestore: false,
        canEditNote: false,
        afterHours: false,
        raw: { id: 'DEMO-VOID-1042', company: firstCo, date: todayIso, void_reason: 'Duplicate entry entered under wrong shift', demo: true }
      },
      {
        key: 'demo::user-2',
        sourceKind: 'demo',
        systemKind: activeInd === 'Hospitality & Resorts' ? 'pos_till' : 'manual',
        originGroup: activeInd === 'Hospitality & Resorts' ? 'pos' : 'user',
        id: 'DEMO-VOID-1039',
        crKey: activeInd === 'Hospitality & Resorts' ? 'pos_till' : 'expenses',
        moduleLabel: activeInd === 'Hospitality & Resorts' ? 'POS Gate Till' : 'Expenses & Overhead',
        company: secondCo,
        industry: activeInd,
        date: yesterdayIso,
        summary: activeInd === 'Hospitality & Resorts' ? '#409 · 2x Adult Ticket, 1x Sunbed' : 'EXP-409 · Cancelled fuel filter invoice',
        refCode: activeInd === 'Hospitality & Resorts' ? '#409' : 'EXP-409',
        partyName: activeInd === 'Hospitality & Resorts' ? 'Gate Cashier Demo' : 'IPT Diesel Supply',
        partyRelKey: activeInd === 'Hospitality & Resorts' ? '' : 'suppliers',
        partyInRegistry: activeInd !== 'Hospitality & Resorts',
        detailLine: activeInd === 'Hospitality & Resorts' ? '2x Adult Ticket, 1x Sunbed' : 'Cancelled fuel filter invoice',
        amountUsd: 95,
        amountMasked: false,
        voidedBy: activeInd === 'Hospitality & Resorts' ? 'Gate Cashier Demo' : 'Supervisor Demo',
        actorDisplay: activeInd === 'Hospitality & Resorts' ? 'Gate Cashier Demo' : 'Supervisor Demo',
        actorKey: activeInd === 'Hospitality & Resorts' ? 'Gate Cashier Demo' : 'Supervisor Demo',
        voidedAt: `${yesterdayIso} 22:48`,
        voidedDayIso: yesterdayIso,
        voidedAtMs: parseTimestampMs(`${yesterdayIso}T22:48:00`),
        voidReason: activeInd === 'Hospitality & Resorts' ? 'Guest changed ticket count at gate' : 'Supplier re-issued corrected VAT invoice',
        noteUpdatedBy: '',
        noteUpdatedAt: '',
        twinIds: [],
        twinDiff: '',
        isCascadedChild: false,
        hasVoidedParent: false,
        isPosTill: activeInd === 'Hospitality & Resorts',
        canRestore: false,
        canEditNote: false,
        afterHours: true,
        raw: { id: 'DEMO-VOID-1039', company: secondCo, date: yesterdayIso, demo: true }
      }
    ];
    if (activeInd === 'Manufacturing') {
      out.push({
        key: 'demo::sys-1',
        sourceKind: 'demo',
        systemKind: 'sync_twin',
        originGroup: 'system',
        id: 'DEMO-RECON-771',
        crKey: 'sales_tickets',
        moduleLabel: 'Sales & Deliveries',
        company: firstCo,
        industry: activeInd,
        date: yesterdayIso,
        summary: 'SP-771 · Workbook Reconciliation Match',
        refCode: 'SP-771',
        partyName: 'Mega Beton',
        partyRelKey: 'customers',
        partyInRegistry: true,
        detailLine: 'Matched against updated workbook row',
        amountUsd: 420,
        amountMasked: false,
        voidedBy: 'SharePoint Recon',
        actorDisplay: L('Workbook Sync', 'مزامنة الدفتر', 'Synchro classeur'),
        actorKey: 'sync::workbook',
        voidedAt: `${yesterdayIso} 08:10`,
        voidedDayIso: yesterdayIso,
        voidedAtMs: parseTimestampMs(`${yesterdayIso}T08:10:00`),
        voidReason: 'Superseded by updated parallel-run ledger row',
        noteUpdatedBy: '',
        noteUpdatedAt: '',
        twinIds: [],
        twinDiff: '',
        isCascadedChild: false,
        hasVoidedParent: false,
        isPosTill: false,
        canRestore: false,
        canEditNote: false,
        afterHours: false,
        raw: { id: 'DEMO-RECON-771', company: firstCo, date: yesterdayIso, voided_by: 'SharePoint Recon', demo: true }
      });
    }
    return out;
  }

  function currentPosScopeKey(u) {
    const uid = (u && (u.id || u.email)) || '';
    const co = (D && D.STATE && D.STATE.company) || '';
    return `${uid}::${co}`;
  }

  function needsHospitalityPosFeed(u) {
    if (!D || !D.STATE || !D.STATE.authed || !D.hasServerApi || !D.hasServerApi() || D.isDemoScopeActive()) return false;
    if (!D.canViewVoidLog || !D.canViewVoidLog(u)) return false;
    const scopeCos = activeScopeCompanies(u);
    return scopeCos.some(c => HOSPITALITY_COMPANIES.some(h => h.toLowerCase() === String(c || '').toLowerCase()));
  }

  async function refreshPosVoids(opts = {}) {
    if (!D) return;
    const u = D.activeUser();
    if (!needsHospitalityPosFeed(u)) {
      posVoidsState.items = [];
      posVoidsState.loaded = false;
      posVoidsState.loading = false;
      posVoidsState.error = false;
      posVoidsState.scopeKey = '';
      return;
    }
    const sk = currentPosScopeKey(u);
    if (posVoidsState.loading && posVoidsState.scopeKey === sk && !opts.force) return;
    const myGen = ++posVoidsState.gen;
    posVoidsState.scopeKey = sk;
    posVoidsState.loading = true;
    posVoidsState.error = false;
    try {
      const res = await D.edgeApiFetch('./api/kiosk/pos-voids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 200 })
      });
      if (myGen !== posVoidsState.gen || sk !== currentPosScopeKey(D.activeUser())) return;
      if (res && res.ok) {
        const j = await res.json().catch(() => null);
        posVoidsState.items = (j && Array.isArray(j.voids)) ? j.voids : [];
        posVoidsState.loaded = true;
        posVoidsState.error = false;
      } else {
        posVoidsState.loaded = true;
        posVoidsState.error = true;
      }
    } catch (_) {
      if (myGen !== posVoidsState.gen) return;
      posVoidsState.loaded = true;
      posVoidsState.error = true;
    } finally {
      if (myGen === posVoidsState.gen) posVoidsState.loading = false;
    }
    if (D.STATE && D.STATE.view === 'void_log') patchResultsInPlace();
  }

  function collectScopedVoidEntries() {
    if (!D) return [];
    const u = D.activeUser();
    if (!D.canViewVoidLog || !D.canViewVoidLog(u)) return [];

    if (!needsHospitalityPosFeed(u)) {
      posVoidsState.items = [];
      posVoidsState.loaded = false;
      posVoidsState.loading = false;
      posVoidsState.error = false;
      posVoidsState.scopeKey = '';
    }

    if (D.isDemoScopeActive()) {
      return getSyntheticDemoVoids(u);
    }

    const canModifyDollars = D.canViewPayrollDollarAmounts ? D.canViewPayrollDollarAmounts(u) : false;
    const canRestoreChrono = Boolean(D.canModifyData && D.canModifyData(u));
    const userCanVoid = D.canVoid ? D.canVoid(u) : false;
    const { scopeStr, activeInd, scopeSet } = resolveActiveScopeCtx(u);
    const entries = [];
    const seenKeys = new Set();

    const customRecs = (D.STATE && D.STATE.customRecords) || {};
    const seedRecs = (D.SEED && D.SEED.records) || {};
    const archRecs = D.SEED_VOIDED_ARCHIVE || {};
    const indCustomStore = D.getIndustryCustomRowsStore ? D.getIndustryCustomRowsStore() : {};
    const indEditsStore = D.getIndustryRowEditStore ? D.getIndustryRowEditStore() : {};

    const mfgKeys = new Set([
      ...Object.keys(customRecs),
      ...Object.keys(seedRecs),
      ...Object.keys(archRecs)
    ]);

    const voidedParentIds = new Set();
    const voidedRawParentIds = new Set();
    mfgKeys.forEach(pk => {
      if (pk === 'documents') return;
      const comb = (Array.isArray(customRecs[pk]) ? customRecs[pk] : []).concat(Array.isArray(seedRecs[pk]) ? seedRecs[pk] : []);
      comb.forEach(r => {
        if (r && r.voided) {
          const pid = String(r.id || r.name || '').trim();
          if (pid) {
            voidedParentIds.add(`${pk}::${pid}`);
            voidedRawParentIds.add(pid);
          }
        }
      });
      if (archRecs[pk] && typeof archRecs[pk].forEach === 'function') {
        archRecs[pk].forEach((ao, aid) => {
          const pid = String((ao && ao.id) || aid || '').trim();
          if (pid) {
            voidedParentIds.add(`${pk}::${pid}`);
            voidedRawParentIds.add(pid);
          }
        });
      }
    });
    Object.keys(indCustomStore || {}).forEach(bk => {
      const arr = indCustomStore[bk];
      if (!Array.isArray(arr)) return;
      arr.forEach(r => {
        if (r && r.voided) {
          const pid = String(r.id || r.code || '').trim();
          if (pid) {
            voidedParentIds.add(`${bk}::${pid}`);
            voidedRawParentIds.add(pid);
          }
        }
      });
    });
    Object.keys(indEditsStore || {}).forEach(ek => {
      const ed = indEditsStore[ek];
      if (ed && ed.voided) {
        const pid = String(ed.primaryId || ek.split('::').pop() || '').trim();
        const dKey = String((ed.void_snapshot && ed.void_snapshot.domainTblKey) || ed.domainTblKey || '').trim();
        if (pid) {
          voidedRawParentIds.add(pid);
          if (dKey) voidedParentIds.add(`${dKey}::${pid}`);
        }
      }
    });

    // 1. Manufacturing & Shared Registries
    mfgKeys.forEach(crKey => {
      const checkTbl = crKey === 'company_equipment' ? 'equipment' : crKey;
      if (D.canAccessTable && !D.canAccessTable(checkTbl, u)) return;

      const activeIds = new Set();
      const voidedMap = new Map();
      const addIfVoided = rec => {
        if (!rec || typeof rec !== 'object') return;
        const rid = String(rec.id || rec.name || '').trim();
        if (!rid) return;
        if (!rec.voided) {
          activeIds.add(rid);
          return;
        }
        if (!voidedMap.has(rid)) voidedMap.set(rid, rec);
      };

      (Array.isArray(customRecs[crKey]) ? customRecs[crKey] : []).forEach(addIfVoided);
      (Array.isArray(seedRecs[crKey]) ? seedRecs[crKey] : []).forEach(addIfVoided);
      if (archRecs[crKey] && typeof archRecs[crKey].forEach === 'function') {
        archRecs[crKey].forEach((archObj, archId) => {
          const idStr = String((archObj && archObj.id) || archId || '').trim();
          if (!idStr || activeIds.has(idStr) || voidedMap.has(idStr)) return;
          const inLiveSeed = (Array.isArray(seedRecs[crKey]) ? seedRecs[crKey] : []).some(sr => sr && !sr.voided && String(sr.id || sr.name || '').trim() === idStr);
          if (!inLiveSeed) {
            voidedMap.set(idStr, Object.assign({}, archObj, { voided: true }));
          }
        });
      }

      const isPayrollTable = PAYROLL_CONFIDENTIAL_TABLES.has(crKey);
      voidedMap.forEach((rec, rid) => {
        const meta = inferCompanyAndIndustry(rec, crKey);
        if (!isCompanyInActiveScope(meta.company, meta.industry, scopeSet, scopeStr, activeInd, u)) return;

        const uniqKey = `cr::${crKey}::${rid}`;
        if (seenKeys.has(uniqKey)) return;
        seenKeys.add(uniqKey);

        let hasVoidedParent = false;
        let isCascadedChild = Boolean(rec.voided_with_parent || rec.voided_with_voucher);
        if (rec.voided_with_parent && voidedRawParentIds.has(String(rec.voided_with_parent).trim())) {
          hasVoidedParent = true;
          isCascadedChild = true;
        }
        if (crKey === 'expense_items' && rec.expense_id && voidedParentIds.has(`expenses::${String(rec.expense_id).trim()}`)) {
          isCascadedChild = true;
          hasVoidedParent = true;
        } else if (crKey === 'repair_items' && rec.repair_id && voidedParentIds.has(`equipment_repairs::${String(rec.repair_id).trim()}`)) {
          isCascadedChild = true;
          hasVoidedParent = true;
        } else if (crKey === 'documents' && rec.parent_id) {
          const docPid = String(rec.parent_id).trim();
          const pMatch = rec.parent_table
            ? (voidedParentIds.has(`${rec.parent_table}::${docPid}`) || voidedRawParentIds.has(docPid))
            : voidedRawParentIds.has(docPid);
          if (pMatch) {
            isCascadedChild = true;
            hasVoidedParent = true;
          }
        }

        const reasonRaw = String(rec.void_reason || rec.voidReason || '').trim();
        const byRaw = String(rec.voided_by || rec.voidedBy || rec.modified_by || '').trim();
        const originMeta = classifyVoidOrigin(rec, byRaw, reasonRaw, false);
        const voidedAtRaw = String(rec.voided_at || rec.voidedAt || rec.modified_at || rec.updated_at || '').trim();
        const masked = isPayrollTable && !canModifyDollars;
        const amtUsd = masked ? null : extractRecordAmountUsd(rec, crKey);
        const disp = extractStructuredDisplay(rec, crKey, masked, null);
        const canRestoreRow = Boolean(
          userCanVoid && !hasVoidedParent && originMeta.systemKind !== 'sync_twin'
        );
        const canEditNoteRow = Boolean(userCanVoid && originMeta.systemKind !== 'sync_twin');

        const defaultReason = reasonRaw
          || (originMeta.twinIds.length ? `Matched ${originMeta.twinIds.length} workbook ${originMeta.twinIds.length === 1 ? 'row' : 'rows'}${originMeta.twinDiff ? ` (${originMeta.twinDiff})` : ''}` : '');

        entries.push({
          key: uniqKey,
          sourceKind: 'custom_record',
          systemKind: originMeta.systemKind,
          originGroup: originMeta.originGroup,
          crKey,
          id: rid,
          moduleLabel: humanizeModule(crKey, ''),
          company: meta.company || 'Shared',
          industry: meta.industry,
          date: effectiveRecordDate(rec, null),
          summary: buildRecordSummary(rec, crKey),
          refCode: disp.refCode,
          partyName: disp.partyName,
          partyRelKey: disp.partyRelKey,
          partyInRegistry: disp.partyInRegistry,
          detailLine: disp.detailLine,
          amountUsd: amtUsd,
          amountMasked: masked,
          voidedBy: byRaw || (originMeta.originGroup === 'system' ? 'System' : 'Supervisor'),
          actorDisplay: originMeta.actorDisplay,
          actorKey: originMeta.actorKey,
          voidedAt: voidedAtRaw,
          voidedDayIso: extractVoidedDayIso(voidedAtRaw),
          voidedAtMs: parseTimestampMs(voidedAtRaw),
          voidReason: defaultReason,
          noteUpdatedBy: String(rec.void_note_updated_by || ''),
          noteUpdatedAt: String(rec.void_note_updated_at || ''),
          twinIds: originMeta.twinIds,
          twinDiff: originMeta.twinDiff,
          isCascadedChild,
          hasVoidedParent,
          isPosTill: false,
          canRestore: canRestoreRow,
          canEditNote: canEditNoteRow,
          afterHours: isAfterHoursStamp(voidedAtRaw),
          raw: rec
        });
      });
    });

    // 2. Sibling Industries (Custom Rows + Edit Tombstones deduplicated by (industry, primaryId))
    const pairedIndEdits = new Map();
    Object.keys(indEditsStore || {}).forEach(ek => {
      const ed = indEditsStore[ek];
      if (!ed || !ed.voided) return;
      const pid = String(ed.primaryId || ek.split('::').pop() || '').trim();
      const eInd = String(ed.ind || ek.split('::')[0] || '').trim();
      if (pid) pairedIndEdits.set(`${eInd}::${pid}`, { editKey: ek, ed });
    });

    const consumedEditKeys = new Set();
    Object.keys(indCustomStore || {}).forEach(bucket => {
      const arr = indCustomStore[bucket];
      if (!Array.isArray(arr)) return;
      arr.forEach(r => {
        if (!r || !r.voided) return;
        const pid = String(r.id || r.code || '').trim();
        if (!pid) return;
        const meta = inferCompanyAndIndustry(r, bucket);
        const paired = pairedIndEdits.get(`${meta.industry}::${pid}`);
        const ed = paired ? paired.ed : null;
        const editKey = paired ? paired.editKey : '';
        if (editKey) consumedEditKeys.add(editKey);

        const coEff = meta.company || (ed && ed.company) || '';
        if (!isCompanyInActiveScope(coEff, meta.industry, scopeSet, scopeStr, activeInd, u)) return;

        const uniqKey = `ind::${bucket}::${pid}`;
        if (seenKeys.has(uniqKey)) return;
        seenKeys.add(uniqKey);

        const rSnap = (r.void_snapshot && typeof r.void_snapshot === 'object') ? r.void_snapshot : {};
        const edSnap = (ed && ed.void_snapshot && typeof ed.void_snapshot === 'object') ? ed.void_snapshot : {};
        const snap = Object.keys(rSnap).length ? rSnap : edSnap;
        const isTillAutoRow = /^POS-|^HSP-REV-POS-/i.test(pid) || String(r.source || '') === 'pos_till';
        const voidedAtRaw = String(r.voided_at || (ed && ed.voided_at) || r.updated_at || r.updatedAt || '').trim();
        const voidByRaw = String(r.voided_by || (ed && ed.voided_by) || (isTillAutoRow ? 'Gate Till Sync' : 'Supervisor')).trim();
        const reasonRaw = String(r.void_reason || (ed && ed.void_reason) || '').trim();
        const originMeta = classifyVoidOrigin(r, voidByRaw, reasonRaw, isTillAutoRow);
        const amtUsd = extractDomainAmountUsd(r) ?? (ed ? extractDomainAmountUsd(ed) : null) ?? extractDomainAmountUsd(snap);
        const isChronoBucket = CHRONO_BUCKETS.has(bucket);
        const mergedForDisp = Object.assign({}, snap, ed || {}, r);
        const disp = extractStructuredDisplay(mergedForDisp, bucket, false, snap);

        entries.push({
          key: uniqKey,
          sourceKind: 'ind_custom',
          systemKind: originMeta.systemKind,
          originGroup: originMeta.originGroup,
          crKey: bucket,
          bucket,
          editKey,
          primaryId: pid,
          id: pid,
          moduleLabel: humanizeModule(bucket, snap.tableTitle || (ed && ed.tableTitle) || r.tableTitle),
          company: coEff || 'Shared',
          industry: meta.industry,
          date: effectiveRecordDate(r, snap) || String((ed && ed.date) || '').slice(0, 10),
          summary: String([pid, r.counterparty || snap.counterparty || (ed && ed.counterparty) || r.customer || r.supplier || r.tenant || r.entity || r.outlet || r.notes || ''].filter(Boolean).join(' · ')).slice(0, 140),
          refCode: disp.refCode || pid,
          partyName: disp.partyName,
          partyRelKey: disp.partyRelKey,
          partyInRegistry: disp.partyInRegistry,
          detailLine: disp.detailLine,
          amountUsd: amtUsd,
          amountMasked: false,
          voidedBy: voidByRaw,
          actorDisplay: originMeta.actorDisplay,
          actorKey: originMeta.actorKey,
          voidedAt: voidedAtRaw,
          voidedDayIso: extractVoidedDayIso(voidedAtRaw),
          voidedAtMs: parseTimestampMs(voidedAtRaw),
          voidReason: reasonRaw,
          noteUpdatedBy: String(r.void_note_updated_by || (ed && ed.void_note_updated_by) || ''),
          noteUpdatedAt: String(r.void_note_updated_at || (ed && ed.void_note_updated_at) || ''),
          twinIds: originMeta.twinIds,
          twinDiff: originMeta.twinDiff,
          isCascadedChild: false,
          hasVoidedParent: false,
          isPosTill: false,
          canRestore: Boolean(userCanVoid && originMeta.systemKind !== 'sync_twin' && (!isChronoBucket || canRestoreChrono)),
          canEditNote: Boolean(userCanVoid && originMeta.systemKind !== 'sync_twin'),
          afterHours: isAfterHoursStamp(voidedAtRaw),
          raw: ed ? Object.assign({}, ed, r, { void_snapshot: snap }) : r
        });
      });
    });

    Object.keys(indEditsStore || {}).forEach(ek => {
      if (consumedEditKeys.has(ek)) return;
      const ed = indEditsStore[ek];
      if (!ed || !ed.voided) return;
      const pid = String(ed.primaryId || ek.split('::').pop() || '').trim();
      if (!pid) return;
      const snap = (ed.void_snapshot && typeof ed.void_snapshot === 'object') ? ed.void_snapshot : {};
      const tblKeyEff = String(snap.domainTblKey || ed.domainTblKey || '').trim();
      const tblTitleEff = String(snap.tableTitle || ed.tableTitle || ek.split('::')[1] || '').trim();
      const meta = inferCompanyAndIndustry(ed, tblKeyEff);
      if (!isCompanyInActiveScope(meta.company, meta.industry, scopeSet, scopeStr, activeInd, u)) return;

      const uniqKey = `ind_edit::${ek}`;
      if (seenKeys.has(uniqKey)) return;
      seenKeys.add(uniqKey);

      const isTillAutoRow = /^POS-|^HSP-REV-POS-/i.test(pid);
      const voidedAtRaw = String(ed.voided_at || ed.updated_at || ed.updatedAt || '').trim();
      const voidByRaw = String(ed.voided_by || (isTillAutoRow ? 'Gate Till Sync' : 'Supervisor')).trim();
      const reasonRaw = String(ed.void_reason || '').trim();
      const originMeta = classifyVoidOrigin(ed, voidByRaw, reasonRaw, isTillAutoRow);
      const amtUsd = extractDomainAmountUsd(ed);
      const mergedForDisp = Object.assign({}, snap, ed);
      const disp = extractStructuredDisplay(mergedForDisp, tblKeyEff, false, snap);

      entries.push({
        key: uniqKey,
        sourceKind: 'ind_edit',
        systemKind: originMeta.systemKind,
        originGroup: originMeta.originGroup,
        crKey: tblKeyEff,
        bucket: '',
        editKey: ek,
        primaryId: pid,
        id: pid,
        moduleLabel: humanizeModule(tblKeyEff, tblTitleEff),
        company: meta.company || 'Shared',
        industry: meta.industry,
        date: effectiveRecordDate(ed, snap),
        summary: String([pid, snap.counterparty || ed.counterparty || ''].filter(Boolean).join(' · ')).slice(0, 140),
        refCode: disp.refCode || pid,
        partyName: disp.partyName,
        partyRelKey: disp.partyRelKey,
        partyInRegistry: disp.partyInRegistry,
        detailLine: disp.detailLine,
        amountUsd: amtUsd,
        amountMasked: false,
        voidedBy: voidByRaw,
        actorDisplay: originMeta.actorDisplay,
        actorKey: originMeta.actorKey,
        voidedAt: voidedAtRaw,
        voidedDayIso: extractVoidedDayIso(voidedAtRaw),
        voidedAtMs: parseTimestampMs(voidedAtRaw),
        voidReason: reasonRaw,
        noteUpdatedBy: String(ed.void_note_updated_by || ''),
        noteUpdatedAt: String(ed.void_note_updated_at || ''),
        twinIds: originMeta.twinIds,
        twinDiff: originMeta.twinDiff,
        isCascadedChild: false,
        hasVoidedParent: false,
        isPosTill: false,
        canRestore: Boolean(userCanVoid && originMeta.systemKind !== 'sync_twin'),
        canEditNote: Boolean(userCanVoid && originMeta.systemKind !== 'sync_twin'),
        afterHours: isAfterHoursStamp(voidedAtRaw),
        raw: ed
      });
    });

    // 3. POS Gate-Till Voids (live Hospitality sessions)
    if (needsHospitalityPosFeed(u) && Array.isArray(posVoidsState.items)) {
      posVoidsState.items.forEach(pv => {
        if (!pv || !pv.id) return;
        const co = String(pv.company || '').trim();
        if (!isCompanyInActiveScope(co, 'Hospitality & Resorts', scopeSet, scopeStr, activeInd, u)) return;
        const uniqKey = `pos::${pv.site || 'POS'}::${pv.id}`;
        if (seenKeys.has(uniqKey)) return;
        seenKeys.add(uniqKey);

        const voidedAtRaw = String(pv.voided_at || pv.day || '').trim();
        const ticketLabel = pv.num ? `#${pv.num}` : String(pv.id).slice(0, 14);
        const byRaw = String(pv.voided_by || pv.user_name || 'Till Cashier');

        entries.push({
          key: uniqKey,
          sourceKind: 'pos_till',
          systemKind: 'pos_till',
          originGroup: 'pos',
          crKey: 'pos_till',
          id: String(pv.id),
          moduleLabel: 'POS Gate Till',
          company: co || 'La Una',
          industry: 'Hospitality & Resorts',
          date: String(pv.day || '').slice(0, 10),
          summary: `${ticketLabel} · ${pv.summary || 'Gate Till Sale'}`,
          refCode: ticketLabel,
          partyName: String(pv.user_name || co || 'Gate Till'),
          partyRelKey: '',
          partyInRegistry: false,
          detailLine: String(pv.summary || 'Gate Till Sale').slice(0, 110),
          amountUsd: Number.isFinite(Number(pv.total_usd)) ? Math.round(Number(pv.total_usd) * 100) / 100 : null,
          amountMasked: false,
          voidedBy: byRaw,
          actorDisplay: byRaw,
          actorKey: byRaw,
          voidedAt: voidedAtRaw,
          voidedDayIso: extractVoidedDayIso(voidedAtRaw),
          voidedAtMs: parseTimestampMs(voidedAtRaw),
          voidReason: String(pv.void_reason || ''),
          noteUpdatedBy: '',
          noteUpdatedAt: '',
          twinIds: [],
          twinDiff: '',
          isCascadedChild: false,
          hasVoidedParent: false,
          isPosTill: true,
          canRestore: false,
          canEditNote: false,
          afterHours: isAfterHoursStamp(voidedAtRaw),
          raw: pv
        });
      });
    }

    return entries;
  }

  function getTopBarPeriodRange() {
    if (!D || !D.STATE || !D.STATE.period || D.STATE.period === 'all' || typeof D.periodRange !== 'function') return null;
    try {
      const r = D.periodRange(D.STATE.period);
      if (r && r.from && r.to) return r;
    } catch (_) {}
    return null;
  }

  function applyFiltersAndSort(allEntries) {
    const nowMs = Date.now();
    const todayIso = localTodayIso();
    const tbRange = getTopBarPeriodRange();

    const topbarScoped = tbRange
      ? allEntries.filter(e => {
        const recD = e.date || '';
        const voidD = e.voidedDayIso || '';
        const recIn = Boolean(recD && recD >= tbRange.from && recD <= tbRange.to);
        const voidIn = Boolean(voidD && voidD >= tbRange.from && voidD <= tbRange.to);
        return recIn || voidIn;
      })
      : allEntries;

    const origin = filterState.origin || 'user';
    const daysWin = filterState.days || 'all';
    const modF = filterState.module || 'all';
    const actorF = filterState.actor || 'all';
    const lensF = filterState.lens || 'all';
    const drillDay = String(filterState.drillDay || '').trim();
    const q = String(filterState.q || '').trim().toLowerCase();

    const originCounts = { user: 0, system: 0, all: topbarScoped.length };
    topbarScoped.forEach(e => {
      if (e.originGroup === 'system') originCounts.system++;
      else originCounts.user++;
    });

    const originFiltered = topbarScoped.filter(e => {
      if (origin === 'user') return e.originGroup === 'user' || e.originGroup === 'pos';
      if (origin === 'system') return e.originGroup === 'system';
      return true;
    });

    const dateFiltered = originFiltered.filter(e => {
      if (daysWin === 'all') return true;
      if (daysWin === 'today') {
        return e.voidedDayIso === todayIso || String(e.date || '').slice(0, 10) === todayIso;
      }
      const d = Number(daysWin);
      if (!Number.isFinite(d) || d <= 0) return true;
      const ms = e.voidedAtMs || parseTimestampMs(e.date);
      if (!ms) return false;
      return (nowMs - ms) <= d * 86400000;
    });

    // Hard Rule 11: frequency-first option ranking (count DESC)
    const modCounts = new Map();
    const actorMap = new Map();
    const dayMap = new Map();
    const lensCounts = { all: dateFiltered.length, after_hours: 0, missing_reason: 0, high_value: 0, restorable: 0, pos_only: 0 };

    dateFiltered.forEach(e => {
      modCounts.set(e.moduleLabel, (modCounts.get(e.moduleLabel) || 0) + 1);
      const ak = e.actorKey || e.voidedBy;
      const prevA = actorMap.get(ak) || { key: ak, label: e.actorDisplay, count: 0, usd: 0 };
      prevA.count += 1;
      if (!e.amountMasked && !e.isCascadedChild && e.amountUsd != null) prevA.usd += Math.abs(e.amountUsd);
      actorMap.set(ak, prevA);

      const dBucket = e.voidedDayIso || e.date;
      if (dBucket) {
        const prevD = dayMap.get(dBucket) || { day: dBucket, count: 0, afterHours: 0, usd: 0 };
        prevD.count += 1;
        if (e.afterHours) prevD.afterHours += 1;
        if (!e.amountMasked && !e.isCascadedChild && e.amountUsd != null) prevD.usd += Math.abs(e.amountUsd);
        dayMap.set(dBucket, prevD);
      }

      if (e.afterHours) lensCounts.after_hours++;
      if (!String(e.voidReason || '').trim()) lensCounts.missing_reason++;
      if (!e.amountMasked && e.amountUsd != null && Math.abs(e.amountUsd) >= 500) lensCounts.high_value++;
      if (e.canRestore) lensCounts.restorable++;
      if (e.isPosTill) lensCounts.pos_only++;
    });

    const moduleOptions = Array.from(modCounts.entries()).sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1));
    const actorOptions = Array.from(actorMap.values())
      .sort((a, b) => (b.count - a.count) || (a.label < b.label ? -1 : 1))
      .map(x => [x.key, x.count, x.label, x.usd]);

    // Module breakdown with USD
    const modBreakdownMap = new Map();
    dateFiltered.forEach(e => {
      const prevM = modBreakdownMap.get(e.moduleLabel) || { label: e.moduleLabel, count: 0, usd: 0 };
      prevM.count += 1;
      if (!e.amountMasked && !e.isCascadedChild && e.amountUsd != null) prevM.usd += Math.abs(e.amountUsd);
      modBreakdownMap.set(e.moduleLabel, prevM);
    });
    const topModules = Array.from(modBreakdownMap.values()).sort((a, b) => (b.count - a.count) || (b.usd - a.usd)).slice(0, 4);
    const topActors = Array.from(actorMap.values()).sort((a, b) => (b.count - a.count) || (b.usd - a.usd)).slice(0, 4);
    const timelineDays = Array.from(dayMap.values())
      .sort((a, b) => (a.day < b.day ? -1 : 1))
      .slice(-14);

    const matched = dateFiltered.filter(e => {
      if (modF !== 'all' && e.moduleLabel !== modF) return false;
      if (actorF !== 'all' && e.actorKey !== actorF && e.voidedBy !== actorF && e.actorDisplay !== actorF) return false;
      if (drillDay && (e.voidedDayIso || e.date) !== drillDay) return false;
      if (lensF === 'after_hours' && !e.afterHours) return false;
      if (lensF === 'missing_reason' && String(e.voidReason || '').trim()) return false;
      if (lensF === 'high_value' && (e.amountMasked || e.amountUsd == null || Math.abs(e.amountUsd) < 500)) return false;
      if (lensF === 'restorable' && !e.canRestore) return false;
      if (lensF === 'pos_only' && !e.isPosTill) return false;
      if (q) {
        const hay = `${e.id} ${e.company} ${e.moduleLabel} ${e.summary} ${e.refCode} ${e.partyName} ${e.detailLine} ${e.voidedBy} ${e.actorDisplay} ${e.voidReason} ${e.date} ${e.voidedAt}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const sk = filterState.sortKey || 'voided_at';
    const dir = filterState.sortDir === 'asc' ? 1 : -1;
    matched.sort((a, b) => {
      if (sk === 'voided_at') {
        const av = a.voidedAtMs || 0;
        const bv = b.voidedAtMs || 0;
        if (!av && !bv) return (a.id < b.id ? -1 : 1);
        if (!av) return 1;
        if (!bv) return -1;
        return (av - bv) * dir;
      }
      if (sk === 'amount') {
        const av = a.amountUsd == null ? (dir > 0 ? Infinity : -Infinity) : a.amountUsd;
        const bv = b.amountUsd == null ? (dir > 0 ? Infinity : -Infinity) : b.amountUsd;
        if (av === bv) return 0;
        return (av - bv) * dir;
      }
      const getStr = x => {
        if (sk === 'record_date') return String(x.date || '');
        if (sk === 'entity') return String(x.company || '');
        if (sk === 'module') return String(x.moduleLabel || '');
        if (sk === 'summary') return String(x.summary || '');
        if (sk === 'actor') return String(x.actorDisplay || x.voidedBy || '');
        return String(x.voidedAt || '');
      };
      const sa = getStr(a).toLowerCase();
      const sb = getStr(b).toLowerCase();
      if (sa === sb) return 0;
      return (sa < sb ? -1 : 1) * dir;
    });

    return {
      matched,
      topbarScoped,
      tbRange,
      originCounts,
      moduleOptions,
      actorOptions,
      lensCounts,
      topModules,
      topActors,
      timelineDays,
      totalInOrigin: originFiltered.length
    };
  }

  function applyFiltersWithPrune(allEntries) {
    let stats = applyFiltersAndSort(allEntries);
    let pruned = false;
    if (filterState.module !== 'all' && !stats.moduleOptions.some(([l]) => l === filterState.module)) {
      filterState.module = 'all';
      pruned = true;
    }
    if (filterState.actor !== 'all' && !stats.actorOptions.some(([k]) => k === filterState.actor)) {
      filterState.actor = 'all';
      pruned = true;
    }
    if (pruned) stats = applyFiltersAndSort(allEntries);
    return stats;
  }

  function hasAnyActiveFilter() {
    return Boolean(
      filterState.days !== 'all'
      || filterState.module !== 'all'
      || filterState.actor !== 'all'
      || filterState.lens !== 'all'
      || filterState.drillDay
      || String(filterState.q || '').trim()
      || getTopBarPeriodRange()
    );
  }

  function renderKpiStripHtml(scopedEntries, filteredEntries) {
    const userTillRows = scopedEntries.filter(e => e.originGroup === 'user' || e.originGroup === 'pos');
    const systemRows = scopedEntries.filter(e => e.originGroup === 'system');
    const weekCutoff = Date.now() - 7 * 86400000;
    const recentRows = userTillRows.filter(e => (e.voidedAtMs || parseTimestampMs(e.date)) >= weekCutoff);
    const afterHoursCount = userTillRows.filter(e => e.afterHours).length;
    const reopenableSysCount = systemRows.filter(e => e.canRestore).length;

    let totalUsd = 0;
    let maskedCount = 0;
    let childSkipped = 0;
    filteredEntries.forEach(e => {
      if (e.amountMasked) { maskedCount++; return; }
      if (e.isCascadedChild) { childSkipped++; return; }
      if (e.amountUsd !== null && Number.isFinite(e.amountUsd)) totalUsd += e.amountUsd;
    });

    const subUsd = childSkipped
      ? L(`${fmtNum(childSkipped)} linked child lines excluded`, `تم استبعاد ${fmtNum(childSkipped)} بنود تابعة`, `${fmtNum(childSkipped)} lignes liées exclues`)
      : (maskedCount
        ? L(`${fmtNum(maskedCount)} payroll rows masked`, `تم إخفاء ${fmtNum(maskedCount)} رواتب`, `${fmtNum(maskedCount)} paies masquées`)
        : L('Deduplicated parent vouchers', 'صافي الإلغاءات بدون تكرار', 'Hors doublons des lignes liées'));
    const scopedPosCount = userTillRows.filter(e => e.isPosTill).length;

    const userCardOn = filterState.origin === 'user' && filterState.lens === 'all' && filterState.days === 'all';
    const valCardOn = filterState.lens === 'high_value';
    const weekCardOn = filterState.days === '7';
    const sysCardOn = filterState.origin === 'system';

    const sysSub = reopenableSysCount > 0
      ? L(`${fmtNum(reopenableSysCount)} reopenable · ${fmtNum(scopedEntries.length)} total`, `${fmtNum(reopenableSysCount)} قابل للاسترجاع · ${fmtNum(scopedEntries.length)} الإجمالي`, `${fmtNum(reopenableSysCount)} réouvrables · ${fmtNum(scopedEntries.length)} total`)
      : `${fmtNum(scopedEntries.length)} ${L('total in scope', 'الإجمالي ضمن النطاق', 'au total')}`;

    return `
      <div class="vlog-kpi-grid" id="vlogKpiStrip">
        <button type="button" class="vlog-kpi-card${userCardOn ? ' is-active' : ''}" data-vlog-kpi="user" aria-pressed="${userCardOn ? 'true' : 'false'}">
          <span class="vlog-kpi-lbl">User &amp; Till Voids</span>
          <strong class="vlog-kpi-val" data-no-i18n="1">${fmtNum(userTillRows.length)}</strong>
          <span class="vlog-kpi-sub" data-no-i18n="1">${fmtNum(scopedPosCount)} ${esc(L('POS till', 'صندوق التذاكر', 'caisse PDV'))}</span>
        </button>
        <button type="button" class="vlog-kpi-card${valCardOn ? ' is-active' : ''}" data-vlog-kpi="value" aria-pressed="${valCardOn ? 'true' : 'false'}">
          <span class="vlog-kpi-lbl">Voided Value</span>
          <strong class="vlog-kpi-val mono" data-no-i18n="1">${esc(formatSignedUsd(totalUsd))}</strong>
          <span class="vlog-kpi-sub" data-no-i18n="1">${esc(subUsd)}</span>
        </button>
        <button type="button" class="vlog-kpi-card${weekCardOn ? ' is-active' : ''}" data-vlog-kpi="recent" aria-pressed="${weekCardOn ? 'true' : 'false'}">
          <span class="vlog-kpi-lbl">Last 7 Days</span>
          <strong class="vlog-kpi-val" data-no-i18n="1">${fmtNum(recentRows.length)}</strong>
          <span class="vlog-kpi-sub" data-no-i18n="1">${fmtNum(afterHoursCount)} ${esc(L('after-hours', 'خارج الدوام', 'hors horaires'))}</span>
        </button>
        <button type="button" class="vlog-kpi-card${sysCardOn ? ' is-active' : ''}" data-vlog-kpi="system" aria-pressed="${sysCardOn ? 'true' : 'false'}">
          <span class="vlog-kpi-lbl">Workbook / System Matches</span>
          <strong class="vlog-kpi-val" data-no-i18n="1">${fmtNum(systemRows.length)}</strong>
          <span class="vlog-kpi-sub" data-no-i18n="1">${esc(sysSub)}</span>
        </button>
      </div>`;
  }

  function renderPulsePanelHtml(stats) {
    if (!filterState.showPulse || stats.totalInOrigin === 0) return '';
    const days = stats.timelineDays || [];
    const maxDayCnt = Math.max(1, ...days.map(d => d.count));
    const maxModCnt = Math.max(1, ...(stats.topModules || []).map(m => m.count));
    const maxActCnt = Math.max(1, ...(stats.topActors || []).map(a => a.count));

    const timelineHtml = days.length
      ? `<div class="vlog-bars-wrap" role="group" aria-label="Activity Timeline">
          ${days.map(d => {
            const hPct = Math.max(12, Math.round((d.count / maxDayCnt) * 100));
            const ahPct = d.count ? Math.round((d.afterHours / d.count) * 100) : 0;
            const isActive = filterState.drillDay === d.day;
            const tip = L(
              `${formatDateDMY(d.day)} · ${fmtNum(d.count)} ${d.count === 1 ? 'void' : 'voids'} (${formatSignedUsd(d.usd)})${d.afterHours ? ` · ${fmtNum(d.afterHours)} after-hours` : ''}`,
              `${formatDateDMY(d.day)} · ${fmtNum(d.count)} إلغاء (${formatSignedUsd(d.usd)})${d.afterHours ? ` · ${fmtNum(d.afterHours)} خارج الدوام` : ''}`,
              `${formatDateDMY(d.day)} · ${fmtNum(d.count)} ${d.count === 1 ? 'annulation' : 'annulations'} (${formatSignedUsd(d.usd)})${d.afterHours ? ` · ${fmtNum(d.afterHours)} hors horaires` : ''}`
            );
            return `
              <button type="button" class="vlog-bar-col${isActive ? ' is-active' : ''}" data-vlog-drill-day="${esc(d.day)}" data-ui-tip="${esc(tip)}" data-no-i18n="1" aria-pressed="${isActive ? 'true' : 'false'}">
                <span class="vlog-bar-track">
                  <span class="vlog-bar-fill${ahPct >= 50 ? ' is-warn' : ''}" style="height:${hPct}%"></span>
                </span>
                <span class="vlog-bar-lbl mono" data-no-i18n="1">${esc(formatCompactDay(d.day))}</span>
              </button>`;
          }).join('')}
        </div>`
      : `<div class="vlog-pulse-empty">No dated activity in this view.</div>`;

    const modHtml = (stats.topModules || []).length
      ? (stats.topModules || []).map(m => {
        const pct = Math.max(8, Math.round((m.count / maxModCnt) * 100));
        const active = filterState.module === m.label;
        return `
          <button type="button" class="vlog-meter-row${active ? ' is-active' : ''}" data-vlog-pick-module="${esc(m.label)}" aria-pressed="${active ? 'true' : 'false'}">
            <span class="vlog-meter-top">
              <span class="vlog-meter-name">${esc(m.label)}</span>
              <span class="vlog-meter-meta mono" data-no-i18n="1">${fmtNum(m.count)} · ${esc(formatSignedUsd(m.usd))}</span>
            </span>
            <span class="vlog-meter-track"><span class="vlog-meter-fill is-cobalt" style="width:${pct}%"></span></span>
          </button>`;
      }).join('')
      : `<div class="vlog-pulse-empty">No module activity.</div>`;

    const actorHtml = (stats.topActors || []).length
      ? (stats.topActors || []).map(a => {
        const pct = Math.max(8, Math.round((a.count / maxActCnt) * 100));
        const active = filterState.actor === a.key;
        return `
          <button type="button" class="vlog-meter-row${active ? ' is-active' : ''}" data-vlog-pick-actor="${esc(a.key)}" aria-pressed="${active ? 'true' : 'false'}">
            <span class="vlog-meter-top">
              <span class="vlog-meter-name" data-no-i18n="1">${esc(a.label)}</span>
              <span class="vlog-meter-meta mono" data-no-i18n="1">${fmtNum(a.count)} · ${esc(formatSignedUsd(a.usd))}</span>
            </span>
            <span class="vlog-meter-track"><span class="vlog-meter-fill is-brass" style="width:${pct}%"></span></span>
          </button>`;
      }).join('')
      : `<div class="vlog-pulse-empty">No actor activity.</div>`;

    return `
      <div class="vlog-pulse-panel panel-card" id="vlogPulsePanel">
        <div class="vlog-pulse-grid">
          <div class="vlog-pulse-col">
            <div class="vlog-pulse-hd">
              <span class="vlog-pulse-title">Activity Timeline</span>
              ${filterState.drillDay
                ? `<button type="button" class="vlog-chip-clear" data-vlog-drill-day="${esc(filterState.drillDay)}" data-no-i18n="1">${esc(formatDateDMY(filterState.drillDay))} ×</button>`
                : `<span class="vlog-pulse-sub">Click bar to isolate day</span>`}
            </div>
            ${timelineHtml}
          </div>
          <div class="vlog-pulse-col">
            <div class="vlog-pulse-hd">
              <span class="vlog-pulse-title">Top Modules</span>
              <span class="vlog-pulse-sub">By void count</span>
            </div>
            <div class="vlog-meter-list">${modHtml}</div>
          </div>
          <div class="vlog-pulse-col">
            <div class="vlog-pulse-hd">
              <span class="vlog-pulse-title">Top Actors</span>
              <span class="vlog-pulse-sub">Click to filter</span>
            </div>
            <div class="vlog-meter-list">${actorHtml}</div>
          </div>
        </div>
      </div>`;
  }

  function formatAmountCell(e) {
    if (e.amountMasked) return `<span class="vlog-badge vlog-badge-mu">Confidential</span>`;
    if (e.amountUsd === null || !Number.isFinite(e.amountUsd)) return '<span class="vlog-muted" data-no-i18n="1">-</span>';
    const prefix = e.amountUsd < 0 ? '-$' : '$';
    return `<span class="mono" data-no-i18n="1">${prefix}${fmtNum(Math.round(Math.abs(e.amountUsd) * 100) / 100)}</span>`;
  }

  function buildModuleSelectOptionsHtml(moduleOptions) {
    return [`<option value="all" data-no-i18n="1">${esc(tr('All Modules'))}</option>`]
      .concat(moduleOptions.map(([lbl, cnt]) => `<option value="${esc(lbl)}"${filterState.module === lbl ? ' selected' : ''} data-no-i18n="1">${esc(tr(lbl))} (${fmtNum(cnt)})</option>`))
      .join('');
  }

  function buildActorSelectOptionsHtml(actorOptions) {
    return [`<option value="all" data-no-i18n="1">${esc(tr('All Actors'))}</option>`]
      .concat(actorOptions.map(([akey, cnt, lbl]) => `<option value="${esc(akey)}"${filterState.actor === akey ? ' selected' : ''} data-no-i18n="1">${esc(lbl)} (${fmtNum(cnt)})</option>`))
      .join('');
  }

  function rankComboItems(items, queryText) {
    const q = norm(queryText || '');
    if (!q) return items;
    const exact = [];
    const rest = [];
    items.forEach(item => {
      const nl = norm(item.label);
      if (nl === q) exact.push(item);
      else if (nl.includes(q)) rest.push(item);
    });
    return exact.concat(rest);
  }

  function renderComboControlHtml(kind, items, activeVal, allLabel) {
    const isOpen = openCombo === kind;
    const btnId = kind === 'module' ? 'vlogModComboBtn' : 'vlogActorComboBtn';
    const wrapId = kind === 'module' ? 'vlogModComboWrap' : 'vlogActorComboWrap';
    const menuId = kind === 'module' ? 'vlogModComboMenu' : 'vlogActorComboMenu';
    const activeItem = activeVal === 'all' ? null : items.find(x => x.val === activeVal);
    const btnLabel = activeItem ? `${activeItem.label} (${fmtNum(activeItem.count)})` : allLabel;
    const ranked = isOpen ? rankComboItems(items, comboQuery) : items;

    const menuHtml = isOpen
      ? `<div class="vlog-combo-menu" id="${menuId}" role="listbox">
          <div class="vlog-combo-search-box">
            <input type="search" class="vlog-combo-search" data-vlog-combo-search="${kind}" value="${esc(comboQuery)}" placeholder="Filter options" aria-label="Filter options">
          </div>
          <div class="vlog-combo-list">
            <button type="button" class="vlog-combo-opt${activeVal === 'all' ? ' is-selected' : ''}" data-vlog-combo-pick="${kind}" data-val="all" data-no-i18n="1">
              <span>${esc(allLabel)}</span>
            </button>
            ${ranked.length
              ? ranked.map(it => `
                <button type="button" class="vlog-combo-opt${activeVal === it.val ? ' is-selected' : ''}" data-vlog-combo-pick="${kind}" data-val="${esc(it.val)}" data-no-i18n="1">
                  <span class="vlog-combo-opt-lbl">${esc(it.label)}</span>
                  <span class="vlog-combo-opt-cnt mono">${fmtNum(it.count)}</span>
                </button>`).join('')
              : `<div class="vlog-combo-empty" data-no-i18n="1">${esc(tr('No matching options'))}</div>`}
          </div>
        </div>`
      : '';

    return `
      <div class="vlog-combo-wrap${isOpen ? ' is-open' : ''}" id="${wrapId}">
        <button type="button" class="vlog-combo-btn${activeVal !== 'all' ? ' has-filter' : ''}" id="${btnId}" data-vlog-combo-toggle="${kind}" aria-haspopup="listbox" aria-expanded="${isOpen ? 'true' : 'false'}">
          <span class="vlog-combo-btn-txt" data-no-i18n="1">${esc(btnLabel)}</span>
          ${ic('chevron_down')}
        </button>
        ${menuHtml}
      </div>`;
  }

  function syncToolbarSelectOptions(moduleOptions, actorOptions, stats) {
    const modSelEl = document.getElementById('vlogModuleSelect');
    if (modSelEl) {
      const optsHtml = buildModuleSelectOptionsHtml(moduleOptions);
      if (modSelEl.innerHTML !== optsHtml) modSelEl.innerHTML = optsHtml;
      if (filterState.module !== 'all' && !moduleOptions.some(([l]) => l === filterState.module)) {
        filterState.module = 'all';
      }
      modSelEl.value = filterState.module;
    }
    const actorSelEl = document.getElementById('vlogActorSelect');
    if (actorSelEl) {
      const optsHtml = buildActorSelectOptionsHtml(actorOptions);
      if (actorSelEl.innerHTML !== optsHtml) actorSelEl.innerHTML = optsHtml;
      if (filterState.actor !== 'all' && !actorOptions.some(([k]) => k === filterState.actor)) {
        filterState.actor = 'all';
      }
      actorSelEl.value = filterState.actor;
    }

    const modMount = document.getElementById('vlogModComboMount');
    if (modMount) {
      const modItems = moduleOptions.map(([lbl, cnt]) => ({ val: lbl, label: tr(lbl), count: cnt }));
      modMount.innerHTML = renderComboControlHtml('module', modItems, filterState.module, tr('All Modules'));
    }
    const actorMount = document.getElementById('vlogActorComboMount');
    if (actorMount) {
      const actorItems = actorOptions.map(([akey, cnt, lbl]) => ({ val: akey, label: lbl, count: cnt }));
      actorMount.innerHTML = renderComboControlHtml('actor', actorItems, filterState.actor, tr('All Actors'));
    }

    const origCounts = (stats && stats.originCounts) || { user: 0, system: 0, all: 0 };
    const origMap = {
      user: L(`User & Till Voids (${fmtNum(origCounts.user)})`, `إلغاءات المستخدمين والصندوق (${fmtNum(origCounts.user)})`, `Utilisateurs & Caisse (${fmtNum(origCounts.user)})`),
      system: L(`Workbook & System (${fmtNum(origCounts.system)})`, `مطابقات الدفتر والنظام (${fmtNum(origCounts.system)})`, `Classeur & Système (${fmtNum(origCounts.system)})`),
      all: L(`All Voids (${fmtNum(origCounts.all)})`, `كل الإلغاءات (${fmtNum(origCounts.all)})`, `Tout (${fmtNum(origCounts.all)})`)
    };
    document.querySelectorAll('#vlogToolbar [data-vlog-origin]').forEach(btn => {
      const val = btn.getAttribute('data-vlog-origin') || 'user';
      btn.classList.toggle('active', filterState.origin === val);
      if (origMap[val]) {
        btn.setAttribute('data-no-i18n', '1');
        btn.textContent = origMap[val];
      }
    });
    document.querySelectorAll('#vlogToolbar [data-vlog-days]').forEach(btn => {
      btn.classList.toggle('active', filterState.days === (btn.getAttribute('data-vlog-days') || 'all'));
    });

    const lensMount = document.getElementById('vlogToolbarChipsMount');
    if (lensMount && stats) {
      lensMount.innerHTML = renderToolbarChipsRowHtml(stats);
    }

    const clrMount = document.getElementById('vlogSearchClearMount');
    if (clrMount) {
      clrMount.innerHTML = String(filterState.q || '').trim()
        ? `<button type="button" class="vlog-search-clear" id="vlogSearchClearBtn" aria-label="${esc(tr('Clear search'))}">×</button>`
        : '';
    }
  }

  function renderToolbarChipsRowHtml(stats) {
    const lc = stats.lensCounts || { all: 0, after_hours: 0, missing_reason: 0, high_value: 0, restorable: 0, pos_only: 0 };
    const tb = stats.tbRange;
    const lensChip = (val, label, count) => {
      const on = filterState.lens === val;
      const txt = val === 'all' ? label : `${label} (${fmtNum(count)})`;
      return `<button type="button" class="vlog-lens-chip${on ? ' active' : ''}" data-vlog-lens="${val}" aria-pressed="${on ? 'true' : 'false'}" data-no-i18n="1">${esc(txt)}</button>`;
    };
    const showPosChip = lc.pos_only > 0;
    const activeFilters = hasAnyActiveFilter();
    const tbChipHtml = tb
      ? `<button type="button" class="vlog-period-chip" data-vlog-clear-topbar-period="1" data-no-i18n="1">${esc(L(`Period: ${formatDateDMY(tb.from)} - ${formatDateDMY(tb.to)}`, `الفترة: ${formatDateDMY(tb.from)} - ${formatDateDMY(tb.to)}`, `Période : ${formatDateDMY(tb.from)} - ${formatDateDMY(tb.to)}`))} ×</button>`
      : '';
    const clearBtnHtml = activeFilters
      ? `<button type="button" class="btn btn-ghost-bar vlog-btn-xs" id="vlogClearFiltersBtn" data-vlog-clear-all="1">${ic('rotate')} Clear Filters</button>`
      : '';
    const pulseToggleHtml = `
      <button type="button" class="btn btn-ghost-bar vlog-btn-xs${filterState.showPulse ? ' is-on' : ''}" id="vlogTogglePulseBtn" aria-pressed="${filterState.showPulse ? 'true' : 'false'}">
        ${ic('pbi')} ${filterState.showPulse ? 'Hide Insights' : 'Show Insights'}
      </button>`;

    return `
      <div class="vlog-toolbar-chips">
        <div class="vlog-lens-list" role="group" aria-label="Audit lens filters">
          ${lensChip('all', L('All Matching', 'كل المطابق', 'Tout afficher'), lc.all)}
          ${lensChip('after_hours', tr('After-Hours'), lc.after_hours)}
          ${lensChip('missing_reason', tr('Missing Reason'), lc.missing_reason)}
          ${lensChip('high_value', L('High Value ($500+)', 'قيمة عالية ($500+)', 'Montant élevé (500 $+)'), lc.high_value)}
          ${lensChip('restorable', tr('Restorable'), lc.restorable)}
          ${showPosChip ? lensChip('pos_only', tr('POS Gate Till'), lc.pos_only) : ''}
          ${tbChipHtml}
        </div>
        <div class="vlog-chips-right">
          ${clearBtnHtml}
          ${pulseToggleHtml}
        </div>
      </div>`;
  }

  function renderResultsTableHtml(entries, u) {
    lastMatchedKeys = entries.map(e => e.key);
    const scopeCos = activeScopeCompanies(u);
    const hideCo = scopeCos.length <= 1;
    const sk = filterState.sortKey || 'voided_at';
    const dirArrow = filterState.sortDir === 'asc' ? ' ▲' : ' ▼';
    const sortHeader = (key, label, extraCls = '') => {
      const active = sk === key;
      return `<th class="${extraCls} vlog-th-sort${active ? ' is-sorted' : ''}" data-vlog-sort="${esc(key)}"><span>${esc(label)}</span>${active ? `<span class="vlog-sort-ind" data-no-i18n="1">${dirArrow}</span>` : ''}</th>`;
    };

    let sumUsd = 0;
    let unmaskedCount = 0;
    entries.forEach(e => {
      if (!e.amountMasked && !e.isCascadedChild && e.amountUsd !== null && Number.isFinite(e.amountUsd)) {
        sumUsd += e.amountUsd;
        unmaskedCount++;
      }
    });

    const limitN = Number.isFinite(filterState.visibleLimit) ? filterState.visibleLimit : PAGE_STEP;
    const visibleEntries = entries.slice(0, limitN);
    const remainingCount = Math.max(0, entries.length - visibleEntries.length);

    const colSpanTotal = hideCo ? 8 : 9;
    const bodyHtml = visibleEntries.length
      ? visibleEntries.map(e => {
        const originBadges = [];
        if (e.isPosTill) originBadges.push('<span class="vlog-badge vlog-badge-brass">From the till</span>');
        else if (e.systemKind === 'workbook_match') {
          originBadges.push('<span class="vlog-badge vlog-badge-mu">Workbook Match</span>');
          if (e.canRestore) originBadges.push('<span class="vlog-badge vlog-badge-good">Reopenable</span>');
        } else if (e.systemKind === 'sync_twin') {
          originBadges.push('<span class="vlog-badge vlog-badge-mu">Workbook Sync</span>');
        }
        if (e.isCascadedChild) originBadges.push('<span class="vlog-badge vlog-badge-warn">Auto-voided child line</span>');
        if (e.afterHours) originBadges.push('<span class="vlog-badge vlog-badge-crit">After-Hours</span>');

        const isEditingNote = editingNoteKey === e.key;
        const noteBlock = isEditingNote
          ? `<div class="vlog-note-edit">
              <input type="text" class="vlog-note-inp" data-vlog-note-input="${esc(e.key)}" value="${esc(e.voidReason)}" placeholder="Enter reason for void" maxlength="500">
              <button type="button" class="btn btn-primary vlog-btn-xs" data-vlog-note-save="${esc(e.key)}">Save Note</button>
              <button type="button" class="btn btn-ghost-bar vlog-btn-xs" data-vlog-note-cancel="1">Cancel</button>
            </div>`
          : (e.voidReason
            ? `<div class="vlog-reason-txt" data-no-i18n="1">${esc(e.voidReason)}</div>`
            : `<span class="vlog-missing-reason">No reason recorded</span>`);

        const restoreBtn = e.canRestore
          ? (armedRestoreKey === e.key
            ? `<button type="button" class="btn btn-primary vlog-btn-xs" data-vlog-restore="${esc(e.key)}">Confirm?</button>`
            : `<button type="button" class="btn btn-outline-bar vlog-btn-xs" data-vlog-restore="${esc(e.key)}">Restore</button>`)
          : '';
        const noteBtn = (e.canEditNote && !isEditingNote)
          ? `<button type="button" class="btn btn-ghost-bar vlog-btn-xs" data-vlog-note-edit="${esc(e.key)}">${e.voidReason ? 'Edit Note' : 'Add Note'}</button>`
          : '';

        const partyHtml = e.partyName
          ? (e.partyInRegistry && D && D.relLink
            ? D.relLink(e.partyRelKey, e.partyName, e.partyName, true)
            : `<button type="button" class="vlog-party-btn" data-vlog-party="${esc(e.partyName)}" data-no-i18n="1">${esc(e.partyName)}</button>`)
          : '';

        const ageLbl = relativeAgeLabel(e.voidedDayIso);
        const modIcon = iconForModule(e.crKey);
        const coCellHtml = hideCo ? '' : `<td>${D && D.coBadge ? D.coBadge(e.company) : `<span data-no-i18n="1">${esc(e.company)}</span>`}</td>`;

        return `
          <tr class="vlog-row${inspectKey === e.key ? ' is-inspecting' : ''}" data-vlog-row="${esc(e.key)}" data-no-ind-inspect="1">
            <td class="vlog-stamp-td">
              <div class="vlog-stamp-main mono" data-no-i18n="1">${esc(formatStampShort(e.voidedAt))}</div>
              ${ageLbl ? `<div class="vlog-stamp-sub" data-no-i18n="1">${esc(ageLbl)}</div>` : ''}
            </td>
            <td class="mono vlog-nowrap" data-no-i18n="1">${esc(formatDateDMY(e.date))}</td>
            ${coCellHtml}
            <td class="vlog-mod-td">
              <button type="button" class="vlog-mod-pill" data-vlog-pick-module="${esc(e.moduleLabel)}">
                ${ic(modIcon)}
                <span>${esc(e.moduleLabel)}</span>
              </button>
            </td>
            <td class="vlog-summary-cell">
              <div class="vlog-sum-top">
                <span class="vlog-ref-code mono" data-no-i18n="1">${esc(e.refCode)}</span>
                ${partyHtml ? `<span class="vlog-sum-party">${partyHtml}</span>` : ''}
              </div>
              ${e.detailLine ? `<div class="vlog-detail-line" data-no-i18n="1">${esc(e.detailLine)}</div>` : ''}
            </td>
            <td class="num vlog-nowrap">${formatAmountCell(e)}</td>
            <td class="vlog-actor-td">
              <button type="button" class="vlog-actor-btn" data-vlog-pick-actor="${esc(e.actorKey)}" data-no-i18n="1">${esc(e.actorDisplay)}</button>
            </td>
            <td class="vlog-reason-td">
              <div class="vlog-reason-cell">
                ${originBadges.length ? `<div class="vlog-badges">${originBadges.join('')}</div>` : ''}
                ${noteBlock}
              </div>
            </td>
            <td class="vlog-acts-cell">
              <div class="vlog-acts-wrap">
                <button type="button" class="btn btn-ghost-bar vlog-btn-xs" data-vlog-inspect="${esc(e.key)}">Inspect</button>
                ${noteBtn}
                ${restoreBtn}
              </div>
            </td>
          </tr>`;
      }).join('')
      : `<tr><td colspan="${colSpanTotal}" class="vlog-empty">No voided entries match these filters.</td></tr>`;

    const footUsd = unmaskedCount > 0 ? formatSignedUsd(sumUsd) : '-';
    const totalColSpan = hideCo ? 4 : 5;
    const afterAmtCols = 3;

    const paginationHtml = entries.length > 0 && remainingCount > 0
      ? `<div class="vlog-pagination-bar" id="vlogPaginationBar">
          <span class="vlog-page-info" data-no-i18n="1">${esc(L(`Showing ${fmtNum(visibleEntries.length)} of ${fmtNum(entries.length)} entries`, `عرض ${fmtNum(visibleEntries.length)} من أصل ${fmtNum(entries.length)} سجل`, `Affichage de ${fmtNum(visibleEntries.length)} sur ${fmtNum(entries.length)} lignes`))}</span>
          <div class="vlog-page-acts">
            ${remainingCount > 200 ? `<button type="button" class="btn btn-outline-bar vlog-btn-xs" id="vlogShowMoreBtn" data-vlog-more="200">Show 200 More</button>` : ''}
            <button type="button" class="btn btn-ghost-bar vlog-btn-xs" id="vlogShowAllBtn" data-vlog-more="all" data-no-i18n="1">${esc(L(`Show All (${fmtNum(entries.length)})`, `عرض الكل (${fmtNum(entries.length)})`, `Tout afficher (${fmtNum(entries.length)})`))}</button>
          </div>
        </div>`
      : '';

    return `
      <div class="panel-card vlog-table-panel">
        <div class="vlog-table-scroll">
          <table class="data-table vlog-table" id="vlogTable">
            <thead>
              <tr>
                ${sortHeader('voided_at', 'Voided At')}
                ${sortHeader('record_date', 'Record Date')}
                ${hideCo ? '' : sortHeader('entity', 'Entity')}
                ${sortHeader('module', 'Module')}
                ${sortHeader('summary', 'Summary & Reference')}
                ${sortHeader('amount', 'Amount', 'num')}
                ${sortHeader('actor', 'Voided By')}
                <th>Reason &amp; Origin</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>${bodyHtml}</tbody>
            <tfoot>
              <tr class="total-row">
                <td colspan="${totalColSpan}" class="vlog-tfoot-lbl"><span class="vlog-tfoot-txt">Total</span> <span class="mono" data-no-i18n="1">(${fmtNum(entries.length)})</span></td>
                <td class="num mono vlog-nowrap" data-no-i18n="1">${esc(footUsd)}</td>
                <td colspan="${afterAmtCols}"></td>
              </tr>
            </tfoot>
          </table>
        </div>
        ${paginationHtml}
      </div>`;
  }

  function renderPosNoticeHtml(u) {
    if (!needsHospitalityPosFeed(u)) return '';
    if (posVoidsState.loading) return `<div class="vlog-sync-note">Loading POS gate-till voids...</div>`;
    if (posVoidsState.error) {
      return `<div class="vlog-sync-note is-error" id="vlogPosErrorNote"><span>Could not load gate-till voids.</span> <button type="button" class="btn btn-ghost-bar vlog-btn-xs" data-vlog-pos-retry="1">Retry</button></div>`;
    }
    return '';
  }

  function renderView() {
    if (!D || !D.canViewVoidLog || !D.canViewVoidLog(D.activeUser())) return '';
    const u = D.activeUser();
    if (!needsHospitalityPosFeed(u)) {
      posVoidsState.items = [];
      posVoidsState.loaded = false;
      posVoidsState.loading = false;
      posVoidsState.error = false;
      posVoidsState.scopeKey = '';
    } else if (!posVoidsState.loaded || posVoidsState.scopeKey !== currentPosScopeKey(u)) {
      setTimeout(() => refreshPosVoids(), 0);
    }

    const allEntries = collectScopedVoidEntries();
    const stats = applyFiltersWithPrune(allEntries);
    const { matched, topbarScoped, moduleOptions, actorOptions, originCounts } = stats;

    const modOptsHtml = buildModuleSelectOptionsHtml(moduleOptions);
    const actorOptsHtml = buildActorSelectOptionsHtml(actorOptions);
    const modItems = moduleOptions.map(([lbl, cnt]) => ({ val: lbl, label: tr(lbl), count: cnt }));
    const actorItems = actorOptions.map(([akey, cnt, lbl]) => ({ val: akey, label: lbl, count: cnt }));

    const originLabels = {
      user: L(`User & Till Voids (${fmtNum(originCounts.user)})`, `إلغاءات المستخدمين والصندوق (${fmtNum(originCounts.user)})`, `Utilisateurs & Caisse (${fmtNum(originCounts.user)})`),
      system: L(`Workbook & System (${fmtNum(originCounts.system)})`, `مطابقات الدفتر والنظام (${fmtNum(originCounts.system)})`, `Classeur & Système (${fmtNum(originCounts.system)})`),
      all: L(`All Voids (${fmtNum(originCounts.all)})`, `كل الإلغاءات (${fmtNum(originCounts.all)})`, `Tout (${fmtNum(originCounts.all)})`)
    };
    const originBtn = val => `<button type="button" class="vlog-seg-btn${filterState.origin === val ? ' active' : ''}" data-vlog-origin="${val}" data-no-i18n="1">${esc(originLabels[val])}</button>`;
    const dayBtn = (val, label) => `<button type="button" class="vlog-seg-btn${filterState.days === val ? ' active' : ''}" data-vlog-days="${val}">${label}</button>`;

    const askAvailable = Boolean(window.MFG_ASK && typeof window.MFG_ASK.ask === 'function');

    return `
      <div class="vlog-root" id="vlogRoot">
        <div class="vlog-head panel-card">
          <div class="vlog-head-title">
            ${ic('void_log')}
            <div>
              <h2>Void Log</h2>
              <p>Soft-deleted records across journals, master registries, sibling industries, and gate tills. Reversing a user void restores linked lines cleanly; gate-till voids remain final.</p>
            </div>
          </div>
          <div class="vlog-head-acts">
            ${askAvailable ? `<button type="button" class="btn btn-outline-bar" id="vlogAuditBriefBtn">${ic('sparkles')} Audit Brief</button>` : ''}
            <button type="button" class="btn btn-ghost-bar" id="vlogRefreshBtn">${ic('rotate')} Refresh</button>
            <button type="button" class="btn btn-outline-bar" id="vlogExportCsvBtn">${ic('download')} Export CSV</button>
          </div>
        </div>
        <div id="vlogPosNoticeMount">${renderPosNoticeHtml(u)}</div>
        <div id="vlogKpiMount">${renderKpiStripHtml(topbarScoped, matched)}</div>
        <div id="vlogPulseMount">${renderPulsePanelHtml(stats)}</div>
        <div class="vlog-toolbar panel-card" id="vlogToolbar">
          <div class="vlog-toolbar-main">
            <div class="vlog-seg-group" id="vlogOriginSegGroup" role="group" aria-label="Filter void source">
              ${originBtn('user')}
              ${originBtn('system')}
              ${originBtn('all')}
            </div>
            <div class="vlog-seg-group" role="group" aria-label="Filter void date range">
              ${dayBtn('all', 'All Dates')}
              ${dayBtn('today', 'Today')}
              ${dayBtn('7', '7 Days')}
              ${dayBtn('30', '30 Days')}
              ${dayBtn('90', '90 Days')}
            </div>
            <div class="vlog-select-row">
              <div id="vlogModComboMount">${renderComboControlHtml('module', modItems, filterState.module, tr('All Modules'))}</div>
              <div id="vlogActorComboMount">${renderComboControlHtml('actor', actorItems, filterState.actor, tr('All Actors'))}</div>
              <select id="vlogModuleSelect" class="vlog-select sr-only" tabindex="-1" aria-hidden="true" aria-label="Filter by module">${modOptsHtml}</select>
              <select id="vlogActorSelect" class="vlog-select sr-only" tabindex="-1" aria-hidden="true" aria-label="Filter by actor">${actorOptsHtml}</select>
              <div class="vlog-search-wrap">
                <span class="vlog-search-ico">${ic('search')}</span>
                <input type="search" id="vlogSearchInput" class="vlog-search" value="${esc(filterState.q)}" placeholder="Search reference, actor, entity, or reason" aria-label="Search voided entries">
                <span id="vlogSearchClearMount">${String(filterState.q || '').trim() ? `<button type="button" class="vlog-search-clear" id="vlogSearchClearBtn" aria-label="${esc(tr('Clear search'))}">×</button>` : ''}</span>
              </div>
            </div>
          </div>
          <div id="vlogToolbarChipsMount">${renderToolbarChipsRowHtml(stats)}</div>
        </div>
        <div id="vlogResultsRegion">${renderResultsTableHtml(matched, u)}</div>
      </div>`;
  }

  function patchResultsInPlace() {
    if (!D || !D.canViewVoidLog || !D.canViewVoidLog(D.activeUser())) return;
    const root = document.getElementById('vlogRoot');
    if (!root) return;
    const u = D.activeUser();
    const posMount = document.getElementById('vlogPosNoticeMount');
    if (posMount) posMount.innerHTML = renderPosNoticeHtml(u);

    const allEntries = collectScopedVoidEntries();
    const stats = applyFiltersWithPrune(allEntries);
    syncToolbarSelectOptions(stats.moduleOptions, stats.actorOptions, stats);

    const kpiMount = document.getElementById('vlogKpiMount');
    if (kpiMount) kpiMount.innerHTML = renderKpiStripHtml(stats.topbarScoped, stats.matched);
    const pulseMount = document.getElementById('vlogPulseMount');
    if (pulseMount) pulseMount.innerHTML = renderPulsePanelHtml(stats);
    const resMount = document.getElementById('vlogResultsRegion');
    if (resMount) resMount.innerHTML = renderResultsTableHtml(stats.matched, u);

    try {
      const lc = lang();
      if (lc !== 'en' && window.MFG_I18N && typeof window.MFG_I18N.translateDom === 'function') {
        window.MFG_I18N.translateDom(root, lc);
      }
    } catch (_) {}
  }

  function findEntryByKey(k) {
    if (!k) return null;
    return collectScopedVoidEntries().find(e => e.key === k) || null;
  }

  function resolveLiveTwinRows(entry, u, showPayroll) {
    if (!entry || !entry.twinIds || !entry.twinIds.length || !D || !D.SEED || !D.SEED.records) return [];
    const recs = D.SEED.records;
    const idSet = new Set(entry.twinIds.map(String));
    const hits = [];
    const { scopeSet, scopeStr, activeInd } = resolveActiveScopeCtx(u);
    const checkOrder = [entry.crKey];
    if (entry.crKey === 'receipts' || entry.crKey === 'customer_receipts') checkOrder.push('sales_tickets');
    Object.keys(recs).forEach(k => { if (!checkOrder.includes(k)) checkOrder.push(k); });

    for (const tbl of checkOrder) {
      const checkTbl = tbl === 'company_equipment' ? 'equipment' : tbl;
      if (D.canAccessTable && !D.canAccessTable(checkTbl, u)) continue;
      const arr = recs[tbl];
      if (!Array.isArray(arr)) continue;
      const isPayrollTbl = PAYROLL_CONFIDENTIAL_TABLES.has(tbl);
      for (const row of arr) {
        if (!row || !row.id || row.voided) continue;
        const rid = String(row.id);
        if (!idSet.has(rid)) continue;
        const meta = inferCompanyAndIndustry(row, tbl);
        if (!isCompanyInActiveScope(meta.company, meta.industry, scopeSet, scopeStr, activeInd, u)) continue;
        idSet.delete(rid);
        const amtMasked = isPayrollTbl && !showPayroll;
        const amt = amtMasked ? null : extractRecordAmountUsd(row, tbl);
        hits.push({
          tbl,
          id: rid,
          label: row.name || row.ticket_no || row.invoice_no || row.staff || rid,
          date: formatDateDMY(row.date || row.start_date || ''),
          party: row.customer || row.supplier || row.staff || row.party || '',
          amtUsd: amt,
          amtMasked
        });
        if (!idSet.size) return hits;
      }
    }
    return hits;
  }

  function resolveLinkedChildren(entry, allEntries) {
    if (!entry || !entry.id) return [];
    const pid = String(entry.id);
    const list = allEntries || collectScopedVoidEntries();
    return list.filter(e => {
      if (!e || e.key === entry.key) return false;
      const r = e.raw || {};
      if (String(r.voided_with_parent || '') === pid) return true;
      if (String(r.voided_with_voucher || '') === pid) return true;
      if (entry.crKey === 'expenses' && e.crKey === 'expense_items' && String(r.expense_id || '') === pid) return true;
      if (entry.crKey === 'equipment_repairs' && e.crKey === 'repair_items' && String(r.repair_id || '') === pid) return true;
      if (e.crKey === 'documents' && String(r.parent_id || '') === pid) return true;
      return false;
    });
  }

  function closeInspectModal() {
    inspectKey = '';
    const existing = document.getElementById('vlogInspectModal');
    if (existing) existing.remove();
    document.querySelectorAll('#vlogTable tbody tr.is-inspecting').forEach(trEl => trEl.classList.remove('is-inspecting'));
  }

  function openInspectModal(entry) {
    if (!entry) return;
    closeInspectModal();
    inspectKey = entry.key;
    const rowEl = document.querySelector(`[data-vlog-row="${CSS.escape(entry.key)}"]`);
    if (rowEl) rowEl.classList.add('is-inspecting');

    const u = D.activeUser();
    const showPayroll = D.canViewPayrollDollarAmounts ? D.canViewPayrollDollarAmounts(u) : false;
    const hidePayField = PAYROLL_CONFIDENTIAL_TABLES.has(entry.crKey) && !showPayroll;
    const raw = entry.raw && typeof entry.raw === 'object' ? entry.raw : {};
    const snap = (raw.void_snapshot && typeof raw.void_snapshot === 'object') ? raw.void_snapshot : {};
    const skipMeta = new Set([
      '_seed_orig', 'payload_json', 'face_samples', 'pin_code', 'headers', 'cells', 'lines',
      'void_snapshot', 'twin_of', 'voided', 'voided_by', 'voidedBy', 'voided_at', 'voidedAt',
      'void_reason', 'voidReason', 'voided_by_email', 'voidedByEmail', 'void_note_updated_by', 'void_note_updated_at'
    ]);
    const moneyFieldRe = /amount|salary|wage|allowance|rate|usd|lbp|total|net|gross|paid|price|cost|bonus|deduct|reimbursement|advance|nssf|stipend|commission|pay|fee|tax|vat|balance/i;
    const detailRows = [];

    detailRows.push(['Record ID', entry.id]);
    detailRows.push(['Entity', entry.company]);
    detailRows.push(['Industry', entry.industry]);
    detailRows.push(['Module', entry.moduleLabel]);
    detailRows.push(['Record Date', formatDateDMY(entry.date)]);
    detailRows.push(['Voided By', entry.voidedBy]);
    detailRows.push(['Voided At', formatStampShort(entry.voidedAt)]);
    if (entry.noteUpdatedBy) detailRows.push(['Note Updated By', `${entry.noteUpdatedBy} (${formatStampShort(entry.noteUpdatedAt)})`]);

    const snapHeaders = Array.isArray(snap.headers) ? snap.headers : (Array.isArray(raw.headers) ? raw.headers : null);
    const snapCells = Array.isArray(snap.cells) ? snap.cells : (Array.isArray(raw.cells) ? raw.cells : null);
    if (Array.isArray(snapHeaders) && Array.isArray(snapCells)) {
      snapHeaders.forEach((h, i) => {
        const val = snapCells[i];
        if (val !== undefined && val !== '') {
          const hStr = String(h || `Field ${i + 1}`);
          const disp = (hidePayField && moneyFieldRe.test(hStr)) ? tr('Confidential') : String(val);
          detailRows.push([hStr, disp]);
        }
      });
    } else {
      Object.keys(raw).forEach(k => {
        if (k.startsWith('_') || skipMeta.has(k)) return;
        const v = raw[k];
        if (v === undefined || v === null || v === '' || typeof v === 'object') return;
        const lbl = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const isDateField = /^(date|rep_date|set_date|start_date|end_date|due_date|day)$/i.test(k);
        const disp = (hidePayField && moneyFieldRe.test(k))
          ? tr('Confidential')
          : (isDateField ? formatDateDMY(v) : String(v));
        detailRows.push([lbl, disp]);
      });
    }

    if (Array.isArray(raw.lines) && raw.lines.length) {
      const linesSummary = raw.lines.map(l => `${l.qty || 1}x ${l.name || l.category || l.sku || 'Item'} (${l.cur || 'USD'} ${l.price || 0})`).join('; ');
      detailRows.push(['Till Lines', linesSummary]);
    }

    const allScoped = collectScopedVoidEntries();
    const linkedChildren = resolveLinkedChildren(entry, allScoped);
    const liveTwins = resolveLiveTwinRows(entry, u, showPayroll);
    const curIdx = lastMatchedKeys.indexOf(entry.key);
    const hasNav = curIdx >= 0 && lastMatchedKeys.length > 1;
    const prevDisabled = !hasNav || curIdx <= 0;
    const nextDisabled = !hasNav || curIdx >= lastMatchedKeys.length - 1;

    const statusPills = [];
    if (entry.isPosTill) statusPills.push('<span class="vlog-badge vlog-badge-brass">POS Gate Till</span>');
    else if (entry.systemKind === 'workbook_match') {
      statusPills.push('<span class="vlog-badge vlog-badge-mu">Workbook Match</span>');
      if (entry.canRestore) statusPills.push('<span class="vlog-badge vlog-badge-good">Reopenable</span>');
    } else if (entry.systemKind === 'sync_twin') {
      statusPills.push('<span class="vlog-badge vlog-badge-mu">Workbook Sync</span>');
    } else {
      statusPills.push('<span class="vlog-badge vlog-badge-brass">Manual Void</span>');
    }
    if (entry.afterHours) statusPills.push('<span class="vlog-badge vlog-badge-crit">After-Hours</span>');
    if (entry.isCascadedChild) statusPills.push('<span class="vlog-badge vlog-badge-warn">Auto-voided child line</span>');

    const heroAmtHtml = entry.amountMasked
      ? `<span class="vlog-badge vlog-badge-mu">${esc(tr('Confidential'))}</span>`
      : (entry.amountUsd == null ? '-' : esc(formatSignedUsd(entry.amountUsd)));

    const partyActionHtml = entry.partyName && entry.partyInRegistry
      ? `<button type="button" class="btn btn-outline-bar vlog-btn-xs" data-vlog-open-party="1">${ic('user')} Open Counterparty 360°</button>`
      : '';

    const noteEditorHtml = entry.canEditNote
      ? `<div class="vlog-drawer-sec">
          <div class="vlog-drawer-sec-hd">
            <span>Void Reason &amp; Audit Note</span>
            ${entry.noteUpdatedBy ? `<span class="vlog-drawer-meta" data-no-i18n="1">${esc(entry.noteUpdatedBy)} · ${esc(formatStampShort(entry.noteUpdatedAt))}</span>` : ''}
          </div>
          <textarea id="vlogDrawerNoteInput" class="vlog-drawer-textarea" rows="2" maxlength="500" placeholder="Enter reason for void">${esc(entry.voidReason || '')}</textarea>
          <div class="vlog-drawer-note-acts">
            <button type="button" class="btn btn-primary vlog-btn-xs" data-vlog-drawer-note-save="${esc(entry.key)}">Save Note</button>
            ${entry.voidReason ? `<button type="button" class="btn btn-ghost-bar vlog-btn-xs" data-vlog-drawer-note-clear="${esc(entry.key)}">Clear Note</button>` : ''}
          </div>
        </div>`
      : `<div class="vlog-drawer-sec">
          <div class="vlog-drawer-sec-hd"><span>Void Reason</span></div>
          <div class="vlog-drawer-readonly-note" data-no-i18n="1">${esc(entry.voidReason || tr('No reason recorded'))}</div>
        </div>`;

    const twinsSecHtml = liveTwins.length
      ? `<div class="vlog-drawer-sec">
          <div class="vlog-drawer-sec-hd">
            <span>Matched Workbook Rows</span>
            <span class="vlog-drawer-meta mono" data-no-i18n="1">${fmtNum(liveTwins.length)}</span>
          </div>
          <div class="vlog-drawer-links">
            ${liveTwins.map(tw => `
              <div class="vlog-drawer-link-card">
                <div class="vlog-drawer-link-main" data-no-i18n="1">
                  <strong>${esc(tw.label)}</strong>
                  <span>${esc([tw.date, tw.party, tw.amtMasked ? tr('Confidential') : (tw.amtUsd != null ? formatSignedUsd(tw.amtUsd) : '')].filter(Boolean).join(' · '))}</span>
                </div>
                <button type="button" class="btn btn-outline-bar vlog-btn-xs" data-vlog-open-live-twin="${esc(`${tw.tbl}|${tw.id}`)}">Inspect Live Record</button>
              </div>`).join('')}
          </div>
        </div>`
      : '';

    const childrenSecHtml = linkedChildren.length
      ? `<div class="vlog-drawer-sec">
          <div class="vlog-drawer-sec-hd">
            <span>Linked Child Lines</span>
            <span class="vlog-drawer-meta mono" data-no-i18n="1">${fmtNum(linkedChildren.length)}</span>
          </div>
          <div class="vlog-drawer-links">
            ${linkedChildren.slice(0, 8).map(ch => `
              <div class="vlog-drawer-link-card">
                <div class="vlog-drawer-link-main" data-no-i18n="1">
                  <strong>${esc(ch.moduleLabel)} · ${esc(ch.refCode)}</strong>
                  <span>${esc([formatDateDMY(ch.date), ch.amountMasked ? tr('Confidential') : (ch.amountUsd != null ? formatSignedUsd(ch.amountUsd) : '')].filter(Boolean).join(' · '))}</span>
                </div>
              </div>`).join('')}
          </div>
        </div>`
      : '';

    let readinessTone = 'mu';
    let readinessMsg = '';
    let readinessNoI18n = false;
    if (entry.isPosTill) {
      readinessMsg = 'Gate-till voids are final and cannot be reversed here.';
    } else if (entry.systemKind === 'sync_twin') {
      readinessMsg = 'Matched 1-to-1 with an active workbook row; controlled by the workbook ledger.';
    } else if (entry.hasVoidedParent) {
      readinessTone = 'warn';
      readinessMsg = 'Restore the parent voucher first; linked lines restore automatically.';
    } else if (entry.canRestore) {
      readinessTone = 'good';
      if (entry.systemKind === 'workbook_match') {
        readinessMsg = 'Reopening this workbook match restores it to active books and keeps it active across future top-ups.';
      } else if (linkedChildren.length) {
        readinessNoI18n = true;
        readinessMsg = L(
          `Restoring brings this record and ${fmtNum(linkedChildren.length)} linked child line(s) back to active books.`,
          `الاسترجاع يعيد هذا القيد مع ${fmtNum(linkedChildren.length)} بنود تابعة إلى السجلات النشطة.`,
          `La restauration rétablit cette écriture et ${fmtNum(linkedChildren.length)} ligne(s) liée(s).`
        );
      } else {
        readinessMsg = 'Restoring returns this record to active books immediately.';
      }
      if (window.MFG_AI_EDGE && typeof window.MFG_AI_EDGE.checkPeriodCloseGuard === 'function') {
        try {
          const pGuard = window.MFG_AI_EDGE.checkPeriodCloseGuard(entry.company, entry.date, raw.rep_date || '', { industry: entry.industry });
          if (pGuard && pGuard.blocked) {
            readinessTone = 'warn';
            readinessNoI18n = true;
            readinessMsg = pGuard.message || readinessMsg;
          }
        } catch (_) {}
      }
    }

    const drawerRestoreBtn = entry.canRestore
      ? (armedRestoreKey === entry.key
        ? `<button type="button" class="btn btn-primary" data-vlog-drawer-restore="${esc(entry.key)}">Confirm?</button>`
        : `<button type="button" class="btn btn-outline-bar" data-vlog-drawer-restore="${esc(entry.key)}">Restore</button>`)
      : '';

    const modal = document.createElement('div');
    modal.id = 'vlogInspectModal';
    modal.className = 'vlog-modal-backdrop is-drawer';
    modal.innerHTML = `
      <div class="vlog-modal vlog-drawer" role="dialog" aria-modal="true" aria-labelledby="vlogInspectTitle">
        <div class="vlog-modal-hd">
          <div class="vlog-drawer-hd-main">
            <h3 id="vlogInspectTitle">Voided Record Snapshot</h3>
            <span class="vlog-inspect-sub" data-no-i18n="1">${esc(tr(entry.moduleLabel))} · ${esc(entry.company)} · ${esc(entry.id)}</span>
          </div>
          <div class="vlog-drawer-hd-acts">
            ${hasNav ? `
              <div class="vlog-drawer-pager">
                <button type="button" class="btn btn-ghost-bar vlog-btn-xs" data-vlog-insp-nav="-1"${prevDisabled ? ' disabled' : ''}>Prev</button>
                <span class="mono vlog-pager-pos" data-no-i18n="1">${curIdx + 1}/${lastMatchedKeys.length}</span>
                <button type="button" class="btn btn-ghost-bar vlog-btn-xs" data-vlog-insp-nav="1"${nextDisabled ? ' disabled' : ''}>Next</button>
              </div>` : ''}
            <button type="button" class="vlog-modal-x" id="vlogInspectCloseBtn" aria-label="Close modal">×</button>
          </div>
        </div>
        <div class="vlog-modal-body">
          <div class="vlog-drawer-hero">
            <div class="vlog-drawer-hero-top">
              <div class="vlog-badges">${statusPills.join('')}</div>
              <strong class="vlog-drawer-amt mono" data-no-i18n="1">${heroAmtHtml}</strong>
            </div>
            <div class="vlog-drawer-hero-ref" data-no-i18n="1">${esc(entry.refCode)}${entry.partyName ? ` · ${esc(entry.partyName)}` : ''}</div>
            ${entry.detailLine ? `<div class="vlog-drawer-hero-det" data-no-i18n="1">${esc(entry.detailLine)}</div>` : ''}
            ${partyActionHtml ? `<div class="vlog-drawer-hero-acts">${partyActionHtml}</div>` : ''}
          </div>
          ${readinessMsg ? `<div class="vlog-readiness is-${readinessTone}"${readinessNoI18n ? ' data-no-i18n="1"' : ''}>${esc(readinessMsg)}</div>` : ''}
          ${noteEditorHtml}
          ${twinsSecHtml}
          ${childrenSecHtml}
          <div class="vlog-drawer-sec">
            <div class="vlog-drawer-sec-hd"><span>Captured Fields</span></div>
            <div class="vlog-inspect-grid">
              ${detailRows.map(([k, v]) => `
                <div class="vlog-inspect-item">
                  <span class="vlog-inspect-k" data-no-i18n="1">${esc(tr(k))}</span>
                  <span class="vlog-inspect-v" data-no-i18n="1">${esc(v)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
        <div class="vlog-modal-ft">
          <button type="button" class="btn btn-ghost-bar" id="vlogInspectDoneBtn">Close</button>
          ${drawerRestoreBtn}
        </div>
      </div>`;
    document.body.appendChild(modal);
    const lc = lang();
    if (lc !== 'en' && window.MFG_I18N && typeof window.MFG_I18N.translateDom === 'function') {
      try { window.MFG_I18N.translateDom(modal, lc); } catch (_) {}
    }
    const closeBtn = document.getElementById('vlogInspectCloseBtn');
    if (closeBtn) closeBtn.focus();
  }

  function csvSafeCell(v) {
    let s = String(v == null ? '' : v).replace(/\r?\n/g, ' ');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function exportCsv(opts = {}) {
    if (!D || !D.canViewVoidLog || !D.canViewVoidLog(D.activeUser())) return '';
    const all = collectScopedVoidEntries();
    const { matched } = applyFiltersAndSort(all);
    const headers = ['Voided At', 'Record Date', 'Entity', 'Industry', 'Module', 'Record ID', 'Summary', 'Amount (USD)', 'Voided By', 'Origin', 'Reason'];
    const lines = [headers.map(csvSafeCell).join(',')];
    matched.forEach(e => {
      const amtStr = e.amountMasked ? 'Confidential' : (e.amountUsd == null ? '' : String(e.amountUsd));
      const originLbl = e.isPosTill
        ? 'Gate Till'
        : (e.systemKind === 'workbook_match' ? 'Workbook Match' : (e.originGroup === 'system' ? 'Workbook Sync' : 'Manual Void'));
      lines.push([
        formatStampShort(e.voidedAt),
        formatDateDMY(e.date),
        e.company || '',
        e.industry || '',
        e.moduleLabel || '',
        e.id || '',
        e.summary || '',
        amtStr,
        e.voidedBy || '',
        originLbl,
        e.voidReason || ''
      ].map(csvSafeCell).join(','));
    });
    const csvText = lines.join('\r\n');
    if (!opts || !opts.skipDownload) {
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `isabi_void_log_${localTodayIso()}.csv`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 250);
      if (D.toast) D.toast('Exported Void Log CSV', 'ok');
    }
    return csvText;
  }

  async function handleRestore(entry) {
    if (!entry || !entry.canRestore || !D) return;
    if (inFlightKeys.has(entry.key)) return;
    inFlightKeys.add(entry.key);
    armedRestoreKey = '';
    const wasInspectOpen = inspectKey === entry.key;
    try {
      if (entry.sourceKind === 'custom_record') {
        if (D.restoreVoidedRecord) await D.restoreVoidedRecord(entry.crKey, entry.id);
      } else if (entry.sourceKind === 'ind_custom' || entry.sourceKind === 'ind_edit') {
        if (D.restoreVoidedIndustryDomainRow) await D.restoreVoidedIndustryDomainRow(entry);
      }
    } finally {
      inFlightKeys.delete(entry.key);
    }
    if (wasInspectOpen && !findEntryByKey(entry.key)) {
      closeInspectModal();
    }
    patchResultsInPlace();
  }

  async function handleSaveNote(entryKey, explicitText) {
    const k = String(entryKey || '');
    if (!k || inFlightKeys.has(k)) return;
    const entry = findEntryByKey(k);
    if (!entry || !entry.canEditNote || !D || !D.saveVoidNote) return;
    inFlightKeys.add(k);
    let txt = explicitText;
    if (txt === undefined) {
      const inp = document.querySelector(`[data-vlog-note-input="${CSS.escape(k)}"]`);
      txt = inp ? inp.value : '';
    }
    editingNoteKey = '';
    try {
      await D.saveVoidNote(entry, txt);
    } finally {
      inFlightKeys.delete(k);
    }
    patchResultsInPlace();
    if (inspectKey === k) {
      const refreshed = findEntryByKey(k);
      if (refreshed) openInspectModal(refreshed);
    }
  }

  function resetAllFilters() {
    filterState.days = 'all';
    filterState.module = 'all';
    filterState.actor = 'all';
    filterState.lens = 'all';
    filterState.drillDay = '';
    filterState.q = '';
    filterState.visibleLimit = PAGE_STEP;
    openCombo = '';
    comboQuery = '';
    armedRestoreKey = '';
    editingNoteKey = '';
    const srch = document.getElementById('vlogSearchInput');
    if (srch) srch.value = '';
    if (getTopBarPeriodRange() && D && D.STATE) {
      D.STATE.period = 'all';
      D.STATE.dateGrain = 'all';
      D.STATE.dateFrom = '';
      D.STATE.dateTo = '';
      if (typeof D.render === 'function') { D.render(); return; }
    }
    patchResultsInPlace();
  }

  function launchAuditBrief() {
    if (!D || !window.MFG_ASK || typeof window.MFG_ASK.ask !== 'function') return;
    const all = collectScopedVoidEntries();
    const stats = applyFiltersAndSort(all);
    const activeCo = (D.COMPANY_LABELS && D.STATE && D.COMPANY_LABELS[D.STATE.company]) || (D.STATE && D.STATE.company) || 'Current Scope';
    const userCnt = stats.originCounts.user;
    const sysCnt = stats.originCounts.system;
    const lc = stats.lensCounts || {};
    const topModStr = (stats.topModules || []).slice(0, 3).map(m => `${m.label} (${m.count}, ${formatSignedUsd(m.usd)})`).join('; ');
    const topActStr = (stats.topActors || []).slice(0, 3).map(a => `${a.label} (${a.count})`).join('; ');
    const prompt = `Audit the Void Log for ${activeCo}: ${userCnt} user/till voids (${lc.after_hours || 0} after-hours, ${lc.missing_reason || 0} missing reason, ${lc.high_value || 0} >= $500) and ${sysCnt} workbook/system matches. Top modules: ${topModStr || 'none'}. Top actors: ${topActStr || 'none'}. Highlight suspicious patterns, control gaps, and what a supervisor should inspect next.`;
    if (typeof window.MFG_ASK.open === 'function') window.MFG_ASK.open();
    window.MFG_ASK.ask(prompt);
  }

  function wireDelegationOnce() {
    if (wired) return;
    wired = true;

    window.addEventListener('mfg:lang-changed', () => {
      if (document.getElementById('vlogRoot')) patchResultsInPlace();
      if (inspectKey && document.getElementById('vlogInspectModal')) {
        const cur = findEntryByKey(inspectKey);
        if (cur) openInspectModal(cur);
      }
    });

    document.addEventListener('click', async e => {
      const inspModal = document.getElementById('vlogInspectModal');
      if (inspModal && (e.target === inspModal || inspModal.contains(e.target))) {
        if (e.target === inspModal || e.target.closest('#vlogInspectCloseBtn') || e.target.closest('#vlogInspectDoneBtn')) {
          closeInspectModal();
          return;
        }
        const navBtn = e.target.closest('[data-vlog-insp-nav]');
        if (navBtn) {
          const delta = Number(navBtn.getAttribute('data-vlog-insp-nav') || 0);
          const idx = lastMatchedKeys.indexOf(inspectKey);
          const targetKey = (idx >= 0) ? lastMatchedKeys[idx + delta] : '';
          const nextEntry = findEntryByKey(targetKey);
          if (nextEntry) openInspectModal(nextEntry);
          return;
        }
        if (e.target.closest('[data-vlog-open-party]')) {
          const cur = findEntryByKey(inspectKey);
          if (cur && cur.partyRelKey && cur.partyName && D && D.showRecordInspector) {
            closeInspectModal();
            D.showRecordInspector(cur.partyRelKey, cur.partyName, { company: cur.company });
          }
          return;
        }
        const twinBtn = e.target.closest('[data-vlog-open-live-twin]');
        if (twinBtn) {
          const rawPair = twinBtn.getAttribute('data-vlog-open-live-twin') || '';
          const sep = rawPair.indexOf('|');
          if (sep > 0 && D && D.showRecordInspector) {
            const tbl = rawPair.slice(0, sep);
            const tid = rawPair.slice(sep + 1);
            const checkTbl = tbl === 'company_equipment' ? 'equipment' : tbl;
            if (D.canAccessTable && !D.canAccessTable(checkTbl, D.activeUser())) return;
            closeInspectModal();
            D.showRecordInspector(tbl, tid);
          }
          return;
        }
        const dNoteSave = e.target.closest('[data-vlog-drawer-note-save]');
        if (dNoteSave) {
          const inp = document.getElementById('vlogDrawerNoteInput');
          await handleSaveNote(dNoteSave.getAttribute('data-vlog-drawer-note-save'), inp ? inp.value : '');
          return;
        }
        const dNoteClr = e.target.closest('[data-vlog-drawer-note-clear]');
        if (dNoteClr) {
          await handleSaveNote(dNoteClr.getAttribute('data-vlog-drawer-note-clear'), '');
          return;
        }
        const dRest = e.target.closest('[data-vlog-drawer-restore]');
        if (dRest) {
          const key = dRest.getAttribute('data-vlog-drawer-restore') || '';
          if (inFlightKeys.has(key)) return;
          if (armedRestoreKey !== key) {
            armedRestoreKey = key;
            dRest.setAttribute('data-no-i18n', '1');
            dRest.textContent = tr('Confirm?');
            dRest.classList.remove('btn-outline-bar');
            dRest.classList.add('btn-primary');
            patchResultsInPlace();
            return;
          }
          const cur = findEntryByKey(key);
          if (cur) await handleRestore(cur);
          return;
        }
        return;
      }

      if (openCombo && !e.target.closest('.vlog-combo-wrap')) {
        openCombo = '';
        comboQuery = '';
        patchResultsInPlace();
      }

      const root = e.target.closest('#vlogRoot');
      if (!root) return;

      if (e.target.closest('[data-vlog-pos-retry]')) {
        posVoidsState.loaded = false;
        posVoidsState.error = false;
        await refreshPosVoids({ force: true });
        patchResultsInPlace();
        return;
      }

      const comboTog = e.target.closest('[data-vlog-combo-toggle]');
      if (comboTog) {
        const kind = comboTog.getAttribute('data-vlog-combo-toggle') || '';
        openCombo = openCombo === kind ? '' : kind;
        comboQuery = '';
        patchResultsInPlace();
        if (openCombo) {
          const isTouch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
          const menuEl = document.getElementById(openCombo === 'module' ? 'vlogModComboMenu' : 'vlogActorComboMenu');
          if (menuEl) {
            const r = menuEl.getBoundingClientRect();
            if (r.bottom > window.innerHeight - 16) menuEl.classList.add('is-drop-up');
            if (!isTouch) {
              const sInp = menuEl.querySelector('.vlog-combo-search');
              if (sInp) { try { sInp.focus({ preventScroll: true }); } catch (_) {} }
            }
          }
        }
        return;
      }

      const comboPick = e.target.closest('[data-vlog-combo-pick]');
      if (comboPick) {
        const kind = comboPick.getAttribute('data-vlog-combo-pick');
        const val = comboPick.getAttribute('data-val') || 'all';
        if (kind === 'module') filterState.module = val;
        else if (kind === 'actor') filterState.actor = val;
        openCombo = '';
        comboQuery = '';
        filterState.visibleLimit = PAGE_STEP;
        armedRestoreKey = '';
        patchResultsInPlace();
        return;
      }

      const kpiBtn = e.target.closest('[data-vlog-kpi]');
      if (kpiBtn) {
        const which = kpiBtn.getAttribute('data-vlog-kpi');
        if (which === 'user') {
          filterState.origin = 'user';
          filterState.lens = 'all';
          filterState.days = 'all';
          filterState.drillDay = '';
        } else if (which === 'value') {
          if (filterState.lens === 'high_value') {
            filterState.lens = 'all';
          } else {
            filterState.lens = 'high_value';
            filterState.sortKey = 'amount';
            filterState.sortDir = 'desc';
          }
        } else if (which === 'recent') {
          filterState.days = filterState.days === '7' ? 'all' : '7';
        } else if (which === 'system') {
          filterState.origin = filterState.origin === 'system' ? 'user' : 'system';
          filterState.lens = 'all';
          filterState.days = 'all';
          filterState.drillDay = '';
        }
        filterState.visibleLimit = PAGE_STEP;
        armedRestoreKey = '';
        editingNoteKey = '';
        patchResultsInPlace();
        return;
      }

      const origBtn = e.target.closest('[data-vlog-origin]');
      if (origBtn) {
        filterState.origin = origBtn.getAttribute('data-vlog-origin') || 'user';
        filterState.visibleLimit = PAGE_STEP;
        armedRestoreKey = '';
        editingNoteKey = '';
        patchResultsInPlace();
        return;
      }

      const dayBtn = e.target.closest('[data-vlog-days]');
      if (dayBtn) {
        filterState.days = dayBtn.getAttribute('data-vlog-days') || 'all';
        filterState.drillDay = '';
        filterState.visibleLimit = PAGE_STEP;
        armedRestoreKey = '';
        editingNoteKey = '';
        patchResultsInPlace();
        return;
      }

      const lensBtn = e.target.closest('[data-vlog-lens]');
      if (lensBtn) {
        const nextL = lensBtn.getAttribute('data-vlog-lens') || 'all';
        filterState.lens = (filterState.lens === nextL && nextL !== 'all') ? 'all' : nextL;
        filterState.visibleLimit = PAGE_STEP;
        armedRestoreKey = '';
        patchResultsInPlace();
        return;
      }

      const drillDayBtn = e.target.closest('[data-vlog-drill-day]');
      if (drillDayBtn) {
        const dd = drillDayBtn.getAttribute('data-vlog-drill-day') || '';
        filterState.drillDay = filterState.drillDay === dd ? '' : dd;
        filterState.visibleLimit = PAGE_STEP;
        patchResultsInPlace();
        return;
      }

      const pickModBtn = e.target.closest('[data-vlog-pick-module]');
      if (pickModBtn) {
        const ml = pickModBtn.getAttribute('data-vlog-pick-module') || 'all';
        filterState.module = filterState.module === ml ? 'all' : ml;
        filterState.visibleLimit = PAGE_STEP;
        patchResultsInPlace();
        return;
      }

      const pickActBtn = e.target.closest('[data-vlog-pick-actor]');
      if (pickActBtn) {
        const ak = pickActBtn.getAttribute('data-vlog-pick-actor') || 'all';
        filterState.actor = filterState.actor === ak ? 'all' : ak;
        filterState.visibleLimit = PAGE_STEP;
        patchResultsInPlace();
        return;
      }

      const partyBtn = e.target.closest('[data-vlog-party]');
      if (partyBtn) {
        const pn = partyBtn.getAttribute('data-vlog-party') || '';
        filterState.q = norm(filterState.q) === norm(pn) ? '' : pn;
        const srch = document.getElementById('vlogSearchInput');
        if (srch) srch.value = filterState.q;
        filterState.visibleLimit = PAGE_STEP;
        patchResultsInPlace();
        return;
      }

      if (e.target.closest('#vlogSearchClearBtn')) {
        filterState.q = '';
        const srch = document.getElementById('vlogSearchInput');
        if (srch) { srch.value = ''; srch.focus(); }
        filterState.visibleLimit = PAGE_STEP;
        patchResultsInPlace();
        return;
      }

      if (e.target.closest('[data-vlog-clear-topbar-period]')) {
        if (D && D.STATE) {
          D.STATE.period = 'all';
          D.STATE.dateGrain = 'all';
          D.STATE.dateFrom = '';
          D.STATE.dateTo = '';
          if (typeof D.render === 'function') { D.render(); return; }
        }
        patchResultsInPlace();
        return;
      }

      if (e.target.closest('[data-vlog-clear-all]')) {
        resetAllFilters();
        return;
      }

      if (e.target.closest('#vlogTogglePulseBtn')) {
        filterState.showPulse = !filterState.showPulse;
        patchResultsInPlace();
        return;
      }

      const moreBtn = e.target.closest('[data-vlog-more]');
      if (moreBtn) {
        const mv = moreBtn.getAttribute('data-vlog-more');
        filterState.visibleLimit = mv === 'all' ? Infinity : (filterState.visibleLimit + (Number(mv) || 200));
        patchResultsInPlace();
        return;
      }

      const sortTh = e.target.closest('[data-vlog-sort]');
      if (sortTh) {
        const nextSk = sortTh.getAttribute('data-vlog-sort') || 'voided_at';
        if (filterState.sortKey === nextSk) {
          filterState.sortDir = filterState.sortDir === 'desc' ? 'asc' : 'desc';
        } else {
          filterState.sortKey = nextSk;
          filterState.sortDir = (nextSk === 'voided_at' || nextSk === 'record_date' || nextSk === 'amount') ? 'desc' : 'asc';
        }
        patchResultsInPlace();
        return;
      }

      if (e.target.closest('#vlogAuditBriefBtn')) {
        launchAuditBrief();
        return;
      }

      if (e.target.closest('#vlogRefreshBtn')) {
        armedRestoreKey = '';
        editingNoteKey = '';
        posVoidsState.loaded = false;
        await refreshPosVoids({ force: true });
        patchResultsInPlace();
        if (D && D.toast) D.toast('Void Log refreshed');
        return;
      }

      if (e.target.closest('#vlogExportCsvBtn')) {
        exportCsv();
        return;
      }

      const inspBtn = e.target.closest('[data-vlog-inspect]');
      if (inspBtn) {
        const entry = findEntryByKey(inspBtn.getAttribute('data-vlog-inspect'));
        if (entry) openInspectModal(entry);
        return;
      }

      const noteEditBtn = e.target.closest('[data-vlog-note-edit]');
      if (noteEditBtn) {
        editingNoteKey = noteEditBtn.getAttribute('data-vlog-note-edit') || '';
        armedRestoreKey = '';
        patchResultsInPlace();
        const inp = document.querySelector(`[data-vlog-note-input="${CSS.escape(editingNoteKey)}"]`);
        if (inp) { try { inp.focus(); inp.select(); } catch (_) {} }
        return;
      }

      const noteSaveBtn = e.target.closest('[data-vlog-note-save]');
      if (noteSaveBtn) {
        await handleSaveNote(noteSaveBtn.getAttribute('data-vlog-note-save'));
        return;
      }

      if (e.target.closest('[data-vlog-note-cancel]')) {
        editingNoteKey = '';
        patchResultsInPlace();
        return;
      }

      const restBtn = e.target.closest('[data-vlog-restore]');
      if (restBtn) {
        const key = restBtn.getAttribute('data-vlog-restore') || '';
        if (inFlightKeys.has(key)) return;
        if (armedRestoreKey !== key) {
          armedRestoreKey = key;
          patchResultsInPlace();
          return;
        }
        const entry = findEntryByKey(key);
        if (entry) await handleRestore(entry);
        return;
      }

      const rowTr = e.target.closest('tr[data-vlog-row]');
      if (rowTr && !e.target.closest('[data-rel-key], button, a, input, select, textarea, label')) {
        const selObj = window.getSelection ? window.getSelection() : null;
        const sel = (selObj && selObj.anchorNode && rowTr.contains(selObj.anchorNode)) ? String(selObj) : '';
        if (sel.length > 1) return;
        const entry = findEntryByKey(rowTr.getAttribute('data-vlog-row'));
        if (entry) openInspectModal(entry);
      }
    });

    document.addEventListener('change', e => {
      const root = e.target.closest('#vlogRoot');
      if (!root) return;
      if (e.target.id === 'vlogModuleSelect') {
        filterState.module = e.target.value || 'all';
        filterState.visibleLimit = PAGE_STEP;
        armedRestoreKey = '';
        patchResultsInPlace();
      } else if (e.target.id === 'vlogActorSelect') {
        filterState.actor = e.target.value || 'all';
        filterState.visibleLimit = PAGE_STEP;
        armedRestoreKey = '';
        patchResultsInPlace();
      }
    });

    document.addEventListener('input', e => {
      if (e.target && e.target.id === 'vlogSearchInput') {
        filterState.q = e.target.value || '';
        filterState.visibleLimit = PAGE_STEP;
        armedRestoreKey = '';
        patchResultsInPlace();
      } else if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-vlog-combo-search')) {
        comboQuery = e.target.value || '';
        const kind = e.target.getAttribute('data-vlog-combo-search');
        const allEntries = collectScopedVoidEntries();
        const stats = applyFiltersAndSort(allEntries);
        const items = kind === 'module'
          ? stats.moduleOptions.map(([lbl, cnt]) => ({ val: lbl, label: tr(lbl), count: cnt }))
          : stats.actorOptions.map(([akey, cnt, lbl]) => ({ val: akey, label: lbl, count: cnt }));
        const listEl = e.target.closest('.vlog-combo-menu') && e.target.closest('.vlog-combo-menu').querySelector('.vlog-combo-list');
        if (listEl) {
          const activeVal = kind === 'module' ? filterState.module : filterState.actor;
          const allLabel = kind === 'module' ? tr('All Modules') : tr('All Actors');
          const ranked = rankComboItems(items, comboQuery);
          listEl.innerHTML = `<button type="button" class="vlog-combo-opt${activeVal === 'all' ? ' is-selected' : ''}" data-vlog-combo-pick="${kind}" data-val="all"><span>${esc(allLabel)}</span></button>`
            + (ranked.length
              ? ranked.map(it => `<button type="button" class="vlog-combo-opt${activeVal === it.val ? ' is-selected' : ''}" data-vlog-combo-pick="${kind}" data-val="${esc(it.val)}" data-no-i18n="1"><span class="vlog-combo-opt-lbl">${esc(it.label)}</span><span class="vlog-combo-opt-cnt mono">${fmtNum(it.count)}</span></button>`).join('')
              : `<div class="vlog-combo-empty">${esc(tr('No matching options'))}</div>`);
        }
      }
    });

    document.addEventListener('keydown', async e => {
      if (e.key === 'Escape') {
        if (document.getElementById('vlogInspectModal')) {
          e.preventDefault();
          closeInspectModal();
          return;
        }
        if (openCombo) {
          e.preventDefault();
          openCombo = '';
          comboQuery = '';
          patchResultsInPlace();
          return;
        }
      }
      if (e.key === 'Enter' && e.target && e.target.hasAttribute && e.target.hasAttribute('data-vlog-note-input')) {
        e.preventDefault();
        await handleSaveNote(e.target.getAttribute('data-vlog-note-input'));
      }
    });
  }

  function reset() {
    armedRestoreKey = '';
    editingNoteKey = '';
    openCombo = '';
    comboQuery = '';
    lastMatchedKeys = [];
    inFlightKeys.clear();
    Object.assign(filterState, DEFAULT_FILTERS);
    closeInspectModal();
    posVoidsState.gen += 1;
    posVoidsState.scopeKey = '';
    posVoidsState.items = [];
    posVoidsState.loaded = false;
    posVoidsState.loading = false;
    posVoidsState.error = false;
  }

  function init(deps) {
    D = deps;
    wireDelegationOnce();
  }

  window.MFG_VOID_LOG = {
    init, reset, renderView, collectScopedVoidEntries, refreshPosVoids, openInspectModal, exportCsv
  };
})();
