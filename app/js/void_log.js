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
    re_instalments: 'Buyer Instalment Schedules',
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
    lenses: [],
    drillDay: '',
    cluster: 'all',
    q: '',
    sortKey: 'voided_at',
    sortDir: 'desc',
    showPulse: true,
    visibleLimit: PAGE_STEP
  };

  let D = null;
  let wired = false;
  let armedRestoreKey = '';
  let armedCutoffKey = '';
  let editingNoteKey = '';
  let inspectKey = '';
  let digestRange = '7d';
  let openCombo = '';
  let comboQuery = '';
  let lastMatchedKeys = [];
  let aiPanelOpen = false;
  let aiRequestGen = 0;
  let aiAbortCtrl = null;
  let aiSyncTimer = null;
  let aiCloudState = { loading: false, sig: '', attemptedSig: '', text: '', mode: '', recs: [], error: '' };
  const inFlightKeys = new Set();

  function cancelPendingAiSummary() {
    if (aiSyncTimer) { clearTimeout(aiSyncTimer); aiSyncTimer = null; }
    if (aiAbortCtrl) { try { aiAbortCtrl.abort(); } catch (_) {} aiAbortCtrl = null; }
  }

  function scheduleAiSummarySync(delayMs = 120) {
    if (aiSyncTimer) clearTimeout(aiSyncTimer);
    aiSyncTimer = setTimeout(() => {
      aiSyncTimer = null;
      syncAiSummaryAfterChange();
    }, delayMs);
  }

  function disarmRestoreConfirmations() {
    armedRestoreKey = '';
    armedCutoffKey = '';
  }

  const filterState = Object.assign({}, DEFAULT_FILTERS, { lenses: [] });

  function hasLens(key) {
    return Array.isArray(filterState.lenses) && filterState.lenses.includes(key);
  }
  function toggleLens(key) {
    const k = String(key || 'all').trim();
    if (!k || k === 'all') {
      filterState.lenses = [];
      return;
    }
    const cur = Array.isArray(filterState.lenses) ? filterState.lenses.slice() : [];
    const idx = cur.indexOf(k);
    if (idx >= 0) cur.splice(idx, 1);
    else cur.push(k);
    filterState.lenses = cur;
  }

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
    const cleaned = s.replace(/,/g, '');
    const m = cleaned.match(/[-+]?\d+(?:\.\d+)?/);
    if (!m) return null;
    const n = Number(m[0]);
    if (!Number.isFinite(n)) return null;
    return neg ? -Math.abs(n) : n;
  }

  const VOID_LOG_USD_KEYS = [
    'total_ttc_usd', 'ttc_usd', 'ttc_period_usd', 'annual_ttc_usd', 'total_usd',
    'net_usd', 'amount_usd', 'usd_amount', 'ttc', 'gross_prem_usd', 'gwp_usd',
    'premium_usd', 'net_payable_4017_usd', 'settled_to_carrier_usd', 'gross_comm_usd',
    'net_comm_usd', 'quoted_renewal_usd', 'claimed_usd', 'approved_usd',
    'paid_by_insurer_usd', 'contract_usd', 'season_contract_usd', 'seasonal_rate_usd',
    'nightly_rate_usd', 'gross_pool_usd', 'open_payable_usd', 'pos_billed_ttc',
    'scheduled_usd', 'actual_usd', 'open_usd', 'landed_cost_usd', 'total_landed_add',
    'fob_usd', 'gross_ar_usd', 'unallocated_usd', 'principal_usd', 'total_due_usd',
    'balance_usd', 'paid_usd', 'advance_usd', 'price_usd', 'cost_usd', 'salary_usd',
    'net_pay_usd', 'base_salary_usd', 'rent_usd', 'commission_usd', 'claim_usd',
    'billed_usd', 'cash_usd', 'gross_usd', 'usd', 'total_ttc'
  ];

  function extractRecordAmountUsd(rec, crKey) {
    if (!rec || typeof rec !== 'object') return null;
    for (const k of VOID_LOG_USD_KEYS) {
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

  const MONEY_FIELD_RE = /amount|salary|wage|allowance|rate|usd|lbp|total|net|gross|paid|price|cost|bonus|deduct|reimbursement|advance|nssf|stipend|commission|pay|fee|tax|vat|balance|package|principal/i;
  const NON_USD_SUFFIX_RE = /(?:^|_)(?:lbp|ll|pct|percent|rate_pct|km|m3|qty|fx_rate|exchange_rate|conversion_rate|interest_rate|tax_rate|vat_rate|comm_rate|commission_rate|rate_ll|apr)(?:$|_)/i;
  const USD_ALIAS_ORDER = ['total_ttc', 'ttc_usd', 'total_usd', 'amount_ttc_usd', 'amount_usd', 'usd_amount', 'total', 'amount', 'net_usd', 'net_period_usd', 'ttc_period_usd', 'gross_prem_usd'];
  const USD_ALIAS_SET = new Set(USD_ALIAS_ORDER);
  const PRE_VOID_FIELD_LABELS = {
    amount: 'Amount',
    amount_usd: 'Amount (USD)',
    usd_amount: 'Amount (USD)',
    total: 'Total',
    total_usd: 'Amount (USD)',
    total_ttc: 'Total TTC',
    ttc_usd: 'Total TTC',
    amount_ttc_usd: 'Total TTC',
    net_usd: 'Net (USD)',
    vat_usd: 'VAT (USD)',
    rep_date: 'Report Date',
    set_date: 'Set Date',
    start_date: 'Start Date',
    end_date: 'End Date',
    due_date: 'Due Date',
    ticket_no: 'Ticket No',
    invoice_no: 'Invoice No',
    voucher_no: 'Voucher No',
    package_usd: 'Package (USD)',
    gross_prem_usd: 'Gross Premium'
  };
  const SEED_ORIG_COMPARE_KEYS = [
    'customer', 'supplier', 'counterparty', 'staff', 'company', 'date', 'rep_date', 'method', 'type',
    'amount', 'usd_amount', 'lbp_amount', 'price', 'discount', 'total', 'total_ttc', 'vat', 'principal', 'fx_rate'
  ];

  function extractPreVoidDiffSummary(rec, crKey, finalAmountUsd, masked) {
    const empty = {
      hasPreVoidEdits: false,
      editCount: 0,
      fieldDiffs: [],
      timeline: [],
      origAmountUsd: null,
      peakAbsUsd: (!masked && finalAmountUsd != null && Number.isFinite(finalAmountUsd)) ? Math.abs(finalAmountUsd) : null,
      searchText: ''
    };
    if (!rec || typeof rec !== 'object') return empty;
    const rawEdits = Array.isArray(rec._pre_void_edits)
      ? rec._pre_void_edits.filter(ev => ev && typeof ev === 'object' && ev.changes && typeof ev.changes === 'object')
      : [];
    const origSnap = (rec._pre_void_orig && typeof rec._pre_void_orig === 'object') ? rec._pre_void_orig : null;
    const seedOrig = (!origSnap && rec._seed_orig && typeof rec._seed_orig === 'object') ? rec._seed_orig : null;

    const sameScalarVal = (a, b) => {
      const sa = String(a == null ? '' : a).trim();
      const sb = String(b == null ? '' : b).trim();
      if (sa === sb) return true;
      if (sa && sb) {
        const na = parseMoneyNumber(sa), nb = parseMoneyNumber(sb);
        if (na !== null && nb !== null && Math.abs(na - nb) < 1e-6) return true;
      }
      return false;
    };
    const recCur = String(rec.currency || rec.cur || '').trim().toUpperCase();
    const recFx = Number(rec.fx_rate || rec.rate || (D && D.getLbpFxRate ? D.getLbpFxRate() : 89500)) || 89500;
    const isRateOnlyField = (k, lbl) => {
      const ks = String(k || '').trim();
      const ls = String(lbl || '').trim();
      const combined = `${ks} ${ls}`;
      if (/(?:^|_)(?:rate|interest_rate|apr|fx_rate|exchange_rate|conversion_rate|tax_rate|vat_rate|comm_rate|commission_rate|rate_ll)(?:$|_)/i.test(ks)) {
        return !/usd|\$/i.test(ls) || /ll\s*\/\s*\$|lbp\s*\/\s*\$|ll\s*\/\s*usd/i.test(ls);
      }
      if (/^\s*(?:exchange|conversion|interest|tax|vat|commission)?\s*rate(?:\s*\([^)]*\))?\s*$/i.test(ls)) {
        return !/\/\s*(?:m3|m³|unit|ton|hr|day)\b/i.test(ls);
      }
      return /ll\s*\/\s*\$|lbp\s*\/\s*\$|ll\s*\/\s*usd|\(ll\/\$\)/i.test(combined);
    };
    const isMoneyField = (k, lbl) => (MONEY_FIELD_RE.test(String(k || '')) || MONEY_FIELD_RE.test(String(lbl || ''))) && !/pct|percent|rate_pct|km|m3|qty/i.test(`${k} ${lbl}`) && !isRateOnlyField(k, lbl);
    const isLbpDiffField = (k, lbl, valHint, isCellField = false) => {
      if (isRateOnlyField(k, lbl)) return false;
      if (/\blbp\b|\bl\.l\b|\bll\b|ll\/\$|lbp\/\$/i.test(`${k} ${lbl} ${valHint == null ? '' : valHint}`)) return true;
      return !isCellField && recCur === 'LBP' && isMoneyField(k, lbl) && !/usd/i.test(String(k || '')) && !NON_USD_SUFFIX_RE.test(String(k || ''));
    };
    const isUsdFormatField = (k, lbl, valHint, isCellField = false) => isMoneyField(k, lbl)
      && !isRateOnlyField(k, lbl)
      && !isLbpDiffField(k, lbl, valHint, isCellField)
      && !NON_USD_SUFFIX_RE.test(String(k || ''))
      && !/\blbp\b|\bl\.l\b|\bll\b|%|km|m3|qty/i.test(String(lbl || ''));
    const pushDiffPeakUsd = (k, lbl, val, isCellField = false) => {
      if (masked) return;
      if (isCellField && !/\b(?:usd)\b|\$/i.test(`${lbl} ${val == null ? '' : val}`)) return;
      const n = parseMoneyNumber(val);
      if (n === null) return;
      if (isUsdFormatField(k, lbl, val, false)) {
        peakCandidates.push(Math.abs(n));
      } else if (isLbpDiffField(k, lbl, val, isCellField) && recFx > 0) {
        peakCandidates.push(Math.abs(n / recFx));
      }
    };
    const fmtDiffVal = (k, lbl, val, isCellField = false) => {
      if (masked && (isMoneyField(k, lbl) || isRateOnlyField(k, lbl))) return tr('Confidential');
      if (val === undefined || val === null || val === '') return '';
      const sv = String(val).trim();
      if (!sv) return '';
      if (/^(date|rep_date|set_date|start_date|end_date|due_date|day)$/i.test(k) || /^\d{4}-\d{2}-\d{2}(?:$|[T\s])/.test(sv)) {
        return formatDateDMY(sv);
      }
      if (!isCellField && isLbpDiffField(k, lbl, sv, isCellField)) {
        const n = parseMoneyNumber(sv);
        if (n !== null) return `${n < 0 ? '-' : ''}${fmtNum(Math.round(Math.abs(n)))} LBP`;
      }
      if (!isCellField && isUsdFormatField(k, lbl, sv, isCellField)) {
        const n = parseMoneyNumber(sv);
        if (n !== null) return formatSignedUsd(n);
      }
      if (!isCellField && isRateOnlyField(k, lbl)) {
        const n = parseMoneyNumber(sv);
        if (n !== null) return fmtNum(n);
      }
      return sv;
    };

    const byKeyMap = new Map();
    const timeline = [];
    const peakCandidates = [];
    if (!masked && finalAmountUsd != null && Number.isFinite(finalAmountUsd)) {
      peakCandidates.push(Math.abs(finalAmountUsd));
    }

    if (rawEdits.length > 0) {
      rawEdits.forEach(ev => {
        const stepParts = [];
        Object.entries(ev.changes).forEach(([fk, ch]) => {
          if (!ch || typeof ch !== 'object') return;
          const isCell = /^col_\d+$/i.test(fk) || Boolean(ch.label);
          const lbl = String(ch.label || PRE_VOID_FIELD_LABELS[fk] || fk.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())).trim();
          const initRaw = (origSnap && origSnap[fk] !== undefined) ? origSnap[fk] : ch.from;
          const voidRaw = (rec[fk] !== undefined && rec[fk] !== null && typeof rec[fk] !== 'object') ? rec[fk] : ch.to;
          if (!byKeyMap.has(fk)) {
            byKeyMap.set(fk, { key: fk, label: lbl, rawFrom: initRaw, rawTo: voidRaw, isCell });
          } else {
            byKeyMap.get(fk).rawTo = voidRaw;
          }
          pushDiffPeakUsd(fk, lbl, ch.from, isCell);
          pushDiffPeakUsd(fk, lbl, ch.to, isCell);
          if (stepParts.length < 4) {
            stepParts.push(`${lbl}: ${fmtDiffVal(fk, lbl, ch.from, isCell) || '-'} to ${fmtDiffVal(fk, lbl, ch.to, isCell) || '-'}`);
          }
        });
        if (stepParts.length) {
          timeline.push({ at: String(ev.at || ''), by: String(ev.by || ''), summary: stepParts.join(' · ') });
        }
      });
    } else if (seedOrig) {
      SEED_ORIG_COMPARE_KEYS.forEach(fk => {
        if (!(fk in seedOrig) && !(fk in rec)) return;
        const av = seedOrig[fk];
        const bv = rec[fk];
        if ((av == null || av === '') && (bv == null || bv === '')) return;
        if (sameScalarVal(av, bv)) return;
        const lbl = PRE_VOID_FIELD_LABELS[fk] || fk.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        byKeyMap.set(fk, { key: fk, label: lbl, rawFrom: av, rawTo: bv, isCell: false });
        pushDiffPeakUsd(fk, lbl, av, false);
        pushDiffPeakUsd(fk, lbl, bv, false);
      });
      if (byKeyMap.size > 0 && (rec.modified_by || rec.modified_at)) {
        const parts = Array.from(byKeyMap.values()).slice(0, 4).map(d =>
          `${d.label}: ${fmtDiffVal(d.key, d.label, d.rawFrom, false) || '-'} to ${fmtDiffVal(d.key, d.label, d.rawTo, false) || '-'}`
        );
        timeline.push({ at: String(rec.modified_at || ''), by: String(rec.modified_by || ''), summary: parts.join(' · ') });
      }
    }

    const rawList = Array.from(byKeyMap.values());
    if (!rawList.length && !rawEdits.length) return empty;

    const keptAliases = new Map();
    rawList.sort((a, b) => {
      const ia = USD_ALIAS_ORDER.indexOf(a.key);
      const ib = USD_ALIAS_ORDER.indexOf(b.key);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return 0;
    });
    const deduped = [];
    rawList.forEach(d => {
      if (USD_ALIAS_SET.has(d.key)) {
        const nf = parseMoneyNumber(d.rawFrom);
        const nt = parseMoneyNumber(d.rawTo);
        const sig = `${nf != null ? nf.toFixed(2) : d.rawFrom}|${nt != null ? nt.toFixed(2) : d.rawTo}`;
        if (keptAliases.has(sig)) return;
        keptAliases.set(sig, d.key);
      }
      deduped.push(d);
    });

    const fieldDiffs = deduped.slice(0, 12).map(d => ({
      key: d.key,
      label: d.label,
      from: fmtDiffVal(d.key, d.label, d.rawFrom, d.isCell),
      to: fmtDiffVal(d.key, d.label, d.rawTo, d.isCell),
      masked: Boolean(masked && isMoneyField(d.key, d.label))
    }));

    let origAmountUsd = null;
    if (!masked) {
      const baseSnap = origSnap || seedOrig;
      if (baseSnap) {
        const origRecOnly = Object.assign(
          { currency: rec.currency, cur: rec.cur, fx_rate: rec.fx_rate, rate: rec.rate },
          baseSnap
        );
        origAmountUsd = extractRecordAmountUsd(origRecOnly, crKey);
        if (origAmountUsd === null) {
          for (const d of deduped) {
            if (/total|amount|usd|value|net|gross|premium|rent|cost|revenue|billed|cash/i.test(`${d.key} ${d.label}`) && !isRateOnlyField(d.key, d.label) && !NON_USD_SUFFIX_RE.test(d.key)) {
              const fn = parseMoneyNumber(d.rawFrom);
              if (fn !== null) {
                origAmountUsd = isLbpDiffField(d.key, d.label, d.rawFrom, d.isCell)
                  ? (recFx > 0 ? Math.round((fn / recFx) * 100) / 100 : null)
                  : Math.round(fn * 100) / 100;
                if (origAmountUsd !== null) break;
              }
            }
          }
        }
        if (origAmountUsd === null) {
          const origFallbackObj = Object.assign({}, rec, baseSnap);
          delete origFallbackObj.cells;
          delete origFallbackObj.headers;
          delete origFallbackObj.void_snapshot;
          origAmountUsd = extractDomainAmountUsd(origFallbackObj);
        }
        if (origAmountUsd !== null && Number.isFinite(origAmountUsd)) {
          peakCandidates.push(Math.abs(origAmountUsd));
        }
      }
    }

    const searchText = masked
      ? ''
      : fieldDiffs.map(d => `${d.label} ${d.from} ${d.to}`).join(' ').slice(0, 240);

    return {
      hasPreVoidEdits: rawEdits.length > 0 || fieldDiffs.length > 0,
      editCount: Math.max(rawEdits.length, fieldDiffs.length ? 1 : 0),
      fieldDiffs,
      timeline,
      origAmountUsd,
      peakAbsUsd: masked ? null : (peakCandidates.length ? Math.max(...peakCandidates) : null),
      searchText
    };
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
    const isHspDemo = activeInd === 'Hospitality & Resorts';
    const hspDemoPreVoid = isHspDemo
      ? {
          hasPreVoidEdits: true,
          editCount: 1,
          origAmountUsd: 1650,
          peakAbsUsd: 1650,
          fieldDiffs: [
            { key: 'amount', label: 'Amount', from: '$1,650', to: '$1,280', masked: false },
            { key: 'notes', label: 'Notes', from: 'Full weekend cabana rate', to: 'Adjusted prior to void', masked: false }
          ],
          timeline: [{ at: `${todayIso}T13:55:00`, by: 'Supervisor Demo', summary: 'Amount: $1,650 to $1,280' }],
          preVoidSearchText: 'Amount $1,650 $1,280'
        }
      : { hasPreVoidEdits: false, editCount: 0, origAmountUsd: null, peakAbsUsd: 1280, fieldDiffs: [], timeline: [], preVoidSearchText: '' };
    const mfgDemoPreVoid = !isHspDemo
      ? {
          hasPreVoidEdits: true,
          editCount: 1,
          origAmountUsd: 640,
          peakAbsUsd: 640,
          fieldDiffs: [
            { key: 'amount', label: 'Amount', from: '$640', to: '$95', masked: false },
            { key: 'notes', label: 'Notes', from: 'Full fleet filter crate (16 pcs)', to: 'Single unit credit', masked: false }
          ],
          timeline: [{ at: `${yesterdayIso}T22:18:00`, by: 'Supervisor Demo', summary: 'Amount: $640 to $95' }],
          preVoidSearchText: 'Amount $640 $95'
        }
      : { hasPreVoidEdits: false, editCount: 0, origAmountUsd: null, peakAbsUsd: 95, fieldDiffs: [], timeline: [], preVoidSearchText: '' };

    const out = [
      Object.assign({
        key: 'demo::user-1',
        sourceKind: 'demo',
        systemKind: 'manual',
        originGroup: 'user',
        id: 'DEMO-VOID-1042',
        crKey: 'sales_tickets',
        moduleLabel: isHspDemo ? 'Venue & Chalet Close' : 'Sales & Deliveries',
        company: firstCo,
        industry: activeInd,
        date: todayIso,
        summary: isHspDemo ? 'Cabana C-04 Duplicate Billing' : 'Ticket #1042 · Duplicate dispatch entry',
        refCode: isHspDemo ? 'Cabana C-04' : 'TKT #1042',
        partyName: isHspDemo ? 'Cabana C-04' : 'Cedar Coast Developers',
        partyRelKey: isHspDemo ? '' : 'customers',
        partyInRegistry: !isHspDemo,
        detailLine: isHspDemo ? 'Duplicate close settlement' : 'Duplicate dispatch entry',
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
      }, hspDemoPreVoid),
      Object.assign({
        key: 'demo::user-2',
        sourceKind: 'demo',
        systemKind: isHspDemo ? 'pos_till' : 'manual',
        originGroup: isHspDemo ? 'pos' : 'user',
        id: 'DEMO-VOID-1039',
        crKey: isHspDemo ? 'pos_till' : 'expenses',
        moduleLabel: isHspDemo ? 'POS Gate Till' : 'Expenses & Overhead',
        company: secondCo,
        industry: activeInd,
        date: yesterdayIso,
        summary: isHspDemo ? '#409 · 2x Adult Ticket, 1x Sunbed' : 'EXP-409 · Cancelled fuel filter invoice',
        refCode: isHspDemo ? '#409' : 'EXP-409',
        partyName: isHspDemo ? 'Gate Cashier Demo' : 'IPT Diesel Supply',
        partyRelKey: isHspDemo ? '' : 'suppliers',
        partyInRegistry: !isHspDemo,
        detailLine: isHspDemo ? '2x Adult Ticket, 1x Sunbed' : 'Cancelled fuel filter invoice',
        amountUsd: 95,
        amountMasked: false,
        voidedBy: isHspDemo ? 'Gate Cashier Demo' : 'Supervisor Demo',
        actorDisplay: isHspDemo ? 'Gate Cashier Demo' : 'Supervisor Demo',
        actorKey: isHspDemo ? 'Gate Cashier Demo' : 'Supervisor Demo',
        voidedAt: `${yesterdayIso} 22:48`,
        voidedDayIso: yesterdayIso,
        voidedAtMs: parseTimestampMs(`${yesterdayIso}T22:48:00`),
        voidReason: isHspDemo ? 'Guest changed ticket count at gate' : 'Supplier re-issued corrected VAT invoice',
        noteUpdatedBy: '',
        noteUpdatedAt: '',
        twinIds: [],
        twinDiff: '',
        isCascadedChild: false,
        hasVoidedParent: false,
        isPosTill: isHspDemo,
        canRestore: false,
        canEditNote: false,
        afterHours: true,
        raw: { id: 'DEMO-VOID-1039', company: secondCo, date: yesterdayIso, demo: true }
      }, mfgDemoPreVoid)
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
        partyName: 'Sample Concrete Co',
        partyRelKey: 'customers',
        partyInRegistry: true,
        detailLine: 'Matched against updated workbook row',
        amountUsd: 420,
        origAmountUsd: null,
        peakAbsUsd: 420,
        hasPreVoidEdits: false,
        editCount: 0,
        fieldDiffs: [],
        timeline: [],
        preVoidSearchText: '',
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
    else if (D.STATE && D.STATE.view === 'sentinels' && D.render) {
      if (D.invalidateSentinelCache) D.invalidateSentinelCache();
      D.render();
    }
  }

  function ensurePosVoidsLoaded(force) {
    if (!D) return;
    const u = D.activeUser();
    if (!needsHospitalityPosFeed(u)) return;
    const sk = currentPosScopeKey(u);
    if (!force && posVoidsState.loaded && posVoidsState.scopeKey === sk) return;
    if (posVoidsState.loading && posVoidsState.scopeKey === sk && !force) return;
    refreshPosVoids({ force: Boolean(force) });
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
        const diffMeta = extractPreVoidDiffSummary(rec, crKey, amtUsd, masked);
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
          origAmountUsd: diffMeta.origAmountUsd,
          peakAbsUsd: diffMeta.peakAbsUsd,
          hasPreVoidEdits: diffMeta.hasPreVoidEdits,
          editCount: diffMeta.editCount,
          fieldDiffs: diffMeta.fieldDiffs,
          timeline: diffMeta.timeline,
          preVoidSearchText: diffMeta.searchText,
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
        const indMasked = PAYROLL_CONFIDENTIAL_TABLES.has(bucket) && !canModifyDollars;
        const amtUsd = indMasked ? null : (extractDomainAmountUsd(r) ?? (ed ? extractDomainAmountUsd(ed) : null) ?? extractDomainAmountUsd(snap));
        const rawMergedInd = ed ? Object.assign({}, ed, r, { void_snapshot: snap }) : r;
        const combinedEditsInd = []
          .concat(ed && Array.isArray(ed._pre_void_edits) ? ed._pre_void_edits : [])
          .concat(Array.isArray(r._pre_void_edits) ? r._pre_void_edits : [])
          .filter(ev => ev && typeof ev === 'object' && ev.changes)
          .sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')))
          .slice(-15);
        const combinedOrigInd = (ed && ed._pre_void_orig && typeof ed._pre_void_orig === 'object') || (r._pre_void_orig && typeof r._pre_void_orig === 'object')
          ? Object.assign({}, (r._pre_void_orig && typeof r._pre_void_orig === 'object') ? r._pre_void_orig : {}, (ed && ed._pre_void_orig && typeof ed._pre_void_orig === 'object') ? ed._pre_void_orig : {})
          : null;
        const diffSrcInd = combinedEditsInd.length
          ? Object.assign({}, rawMergedInd, { _pre_void_orig: combinedOrigInd || rawMergedInd._pre_void_orig, _pre_void_edits: combinedEditsInd })
          : rawMergedInd;
        const diffMetaInd = extractPreVoidDiffSummary(diffSrcInd, bucket, amtUsd, indMasked);
        const isChronoBucket = CHRONO_BUCKETS.has(bucket);
        const mergedForDisp = Object.assign({}, snap, ed || {}, r);
        const disp = extractStructuredDisplay(mergedForDisp, bucket, indMasked, snap);

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
          date: effectiveRecordDate(r, snap) || String(r.due_date || (ed && ed.date) || '').slice(0, 10),
          summary: String([pid, r.counterparty || snap.counterparty || (ed && ed.counterparty) || r.customer || r.supplier || r.tenant || r.entity || r.outlet || r.notes || ''].filter(Boolean).join(' · ')).slice(0, 140),
          refCode: disp.refCode || pid,
          partyName: disp.partyName,
          partyRelKey: disp.partyRelKey,
          partyInRegistry: disp.partyInRegistry,
          detailLine: disp.detailLine,
          amountUsd: amtUsd,
          amountMasked: indMasked,
          origAmountUsd: diffMetaInd.origAmountUsd,
          peakAbsUsd: diffMetaInd.peakAbsUsd,
          hasPreVoidEdits: diffMetaInd.hasPreVoidEdits,
          editCount: diffMetaInd.editCount,
          fieldDiffs: diffMetaInd.fieldDiffs,
          timeline: diffMetaInd.timeline,
          preVoidSearchText: diffMetaInd.searchText,
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
          raw: rawMergedInd
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
      const edTblSlug = String(ek.split('::')[1] || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      const edMasked = (PAYROLL_CONFIDENTIAL_TABLES.has(tblKeyEff) || PAYROLL_CONFIDENTIAL_TABLES.has(edTblSlug)) && !canModifyDollars;
      const amtUsd = edMasked ? null : extractDomainAmountUsd(ed);
      const diffMetaEd = extractPreVoidDiffSummary(ed, tblKeyEff, amtUsd, edMasked);
      const mergedForDisp = Object.assign({}, snap, ed);
      const disp = extractStructuredDisplay(mergedForDisp, tblKeyEff, edMasked, snap);

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
        amountMasked: edMasked,
        origAmountUsd: diffMetaEd.origAmountUsd,
        peakAbsUsd: diffMetaEd.peakAbsUsd,
        hasPreVoidEdits: diffMetaEd.hasPreVoidEdits,
        editCount: diffMetaEd.editCount,
        fieldDiffs: diffMetaEd.fieldDiffs,
        timeline: diffMetaEd.timeline,
        preVoidSearchText: diffMetaEd.searchText,
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

        const posAmtUsd = Number.isFinite(Number(pv.total_usd)) ? Math.round(Number(pv.total_usd) * 100) / 100 : null;
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
          amountUsd: posAmtUsd,
          amountMasked: false,
          origAmountUsd: null,
          peakAbsUsd: posAmtUsd != null ? Math.abs(posAmtUsd) : null,
          hasPreVoidEdits: false,
          editCount: 0,
          fieldDiffs: [],
          timeline: [],
          preVoidSearchText: '',
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

  const VOID_CLUSTER_DEFS = [
    { key: 'rekey_print', label: 'Till / Re-Key Alert', rx: /re-?key|after[- ]?print|reprint|till|slip|طباعة|إيصال|صندوق|reimpression|caisse/i },
    { key: 'pricing_rate', label: 'Pricing / Rate', rx: /pric|rate|tariff|discount|rebate|vat|ttc|margin|fee|سعر|تسعير|تعرفة|حسم|ضريبة|tarif|remise|tva|prix/i },
    { key: 'duplicate_typo', label: 'Duplicate / Typo', rx: /duplic|dup\b|double|typo|mistake|twice|wrong num|entry error|مكرر|خطأ|تكرار|إدخال|doublon|erreur|saisie/i },
    { key: 'wrong_entity', label: 'Wrong Party / Vehicle', rx: /wrong cust|wrong truck|wrong driver|wrong co|wrong item|wrong party|wrong entity|entity|plate|vehicle|عميل|شاحنة|سائق|جهة|لوحة|client|camion|chauffeur/i },
    { key: 'cancelled_return', label: 'Cancelled / Returned', rx: /cancel|return|reject|abort|refund|refus|melt|ملغ|ملغي|إلغاء|مرتجع|annul|retour/i },
    { key: 'unexplained', label: 'Unexplained / Blank', rx: /^$/ }
  ];

  function classifyVoidCluster(entry, alertKeysSet) {
    if (!entry) return 'unexplained';
    const raw = entry.raw || {};
    const txt = String(entry.voidReason || '').trim();
    if (txt && txt.length >= 3 && !/^[-.]+$/.test(txt)) {
      for (let i = 0; i < VOID_CLUSTER_DEFS.length - 1; i++) {
        if (VOID_CLUSTER_DEFS[i].rx.test(txt)) return VOID_CLUSTER_DEFS[i].key;
      }
      if (entry.isPosTill && raw.lower_rekey) return 'rekey_print';
      return 'other';
    }
    if ((entry.isPosTill && raw.lower_rekey) || (alertKeysSet && alertKeysSet.has(entry.key))) return 'rekey_print';
    return 'unexplained';
  }

  function sanitizeOutwardText(raw) {
    return String(raw == null ? '' : raw)
      .replace(/\s*\u2014\s*/g, ' - ')
      .replace(/\u2014/g, ' - ')
      .replace(/\s*\u2192\s*/g, ' -> ')
      .replace(/\u2192/g, ' -> ')
      .replace(/\bTHEO\b/gi, 'Audit Assistant')
      .trim();
  }

  function normStr(v) {
    return D && D.norm ? D.norm(v) : String(v == null ? '' : v).toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function indPrefixOf(ind) {
    const s = String(ind || '').toLowerCase();
    if (s.includes('hold')) return 'hld';
    if (s.includes('hospit') || s.includes('resort')) return 'hsp';
    if (s.includes('trad') || s.includes('auto')) return 'trd';
    if (s.includes('real') || s.includes('prop')) return 're';
    if (s.includes('insur') || s.includes('brok')) return 'ins';
    return 'mfg';
  }

  function getVoidSentinelRuleConfig(ind) {
    const pfx = indPrefixOf(ind);
    const ruleId = pfx === 'mfg' ? 'S19' : `ind_${pfx}_10`;
    const enabled = (D && D.isAlertRuleEnabled) ? D.isAlertRuleEnabled(ruleId) : true;
    const p = (D && D.getAlertRuleParamsObj) ? D.getAlertRuleParamsObj(ruleId) : {};
    const maxShift = Math.max(2, Number.isFinite(Number(p.max_shift_voids)) ? Number(p.max_shift_voids) : 3);
    const rekeyWinMin = Math.max(15, Number.isFinite(Number(p.rekey_window_min)) ? Number(p.rekey_window_min) : 180);
    return { ruleId, enabled, maxShiftVoids: maxShift, rekeyWindowMin: rekeyWinMin };
  }

  function _extractActiveRowUsdSimple(r) {
    if (!r || typeof r !== 'object') return 0;
    for (let i = 0; i < VOID_LOG_USD_KEYS.length; i++) {
      const n = parseMoneyNumber(r[VOID_LOG_USD_KEYS[i]]);
      if (n != null && n !== 0) return Math.abs(n);
    }
    const genFallback = ['total', 'amount'];
    for (let i = 0; i < genFallback.length; i++) {
      const n = parseMoneyNumber(r[genFallback[i]]);
      if (n != null && n !== 0) return Math.abs(n);
    }
    return 0;
  }

  function _findErpLowerRekeyReplacement(e, rekeyWindowMin) {
    if (!D || !e || e.isPosTill || e.amountMasked || !(e.amountUsd > 0.01)) return null;
    const tbl = String(e.crKey || '').trim();
    if (!tbl || PAYROLL_CONFIDENTIAL_TABLES.has(tbl)) return null;
    const st = (D.STATE && D.STATE.customRecords) || {};
    const sd = (D.SEED && D.SEED.records) || {};
    const indSt = (D.getIndustryCustomRowsStore && D.getIndustryCustomRowsStore()) || {};
    let pool = [];
    if (e.sourceKind === 'custom_record') {
      pool = (Array.isArray(st[tbl]) ? st[tbl] : []).concat(Array.isArray(sd[tbl]) ? sd[tbl] : []);
    } else if (Array.isArray(indSt[tbl])) {
      pool = indSt[tbl];
    }
    if (!pool.length) return null;
    const rawV = e.raw || {};
    const vParty = normStr(rawV.customer || rawV.supplier || rawV.tenant || rawV.client || rawV.party || rawV.counterparty || rawV.entered_by || '');
    const vCo = normStr(e.company || '');
    const vDay = String(e.voidedAt || e.date || '').slice(0, 10);
    const vMs = e.voidedAtMs || parseTimestampMs(e.date);
    const seen = new Set();
    let best = null;
    for (let i = 0; i < pool.length; i++) {
      const r = pool[i];
      if (!r || r.voided) continue;
      const rid = String(r.id || r.ticket_no || r.invoice_no || '').trim();
      if (!rid || rid === String(e.id || '') || seen.has(rid)) continue;
      seen.add(rid);
      if (vCo && normStr(r.company || '') && normStr(r.company || '') !== vCo) continue;
      const aUsd = _extractActiveRowUsdSimple(r);
      if (!(aUsd > 0 && aUsd < e.amountUsd - 0.01)) continue;
      const aParty = normStr(r.customer || r.supplier || r.tenant || r.client || r.party || r.counterparty || r.entered_by || '');
      if (vParty && aParty && aParty !== vParty) continue;
      const aStamp = r.entered_at || r.created_at || r.updated_at || r.date || '';
      const aDay = String(aStamp || r.date || '').slice(0, 10);
      const aMs = parseTimestampMs(aStamp);
      let deltaMin = null;
      if (vMs && aMs) {
        const dm = Math.round((aMs - vMs) / 60000);
        if (dm >= -5 && dm <= rekeyWindowMin) deltaMin = Math.max(0, dm);
      } else if (vDay && aDay && aDay === vDay) {
        deltaMin = 0;
      }
      if (deltaMin === null) continue;
      const dropUsd = Math.round((e.amountUsd - aUsd) * 100) / 100;
      if (!best || dropUsd > best.drop_usd) {
        best = {
          id: rid,
          num: String(r.ticket_no || r.invoice_no || r.name || rid),
          total_usd: Math.round(aUsd * 100) / 100,
          drop_usd: dropUsd,
          delta_min: deltaMin
        };
      }
    }
    return best;
  }

  function resolveActiveVoidInd(targetInd, targetCompany) {
    if (targetInd && targetInd !== 'all') return targetInd;
    const co = targetCompany || (D && D.STATE && D.STATE.company) || '';
    if (D && typeof D.getActiveIndustry === 'function') return D.getActiveIndustry(co) || 'Manufacturing';
    return 'Manufacturing';
  }

  function computeVoidSentinelDigest(targetInd, targetCompany) {
    const effIndEarly = resolveActiveVoidInd(targetInd, targetCompany);
    const cfgEarly = getVoidSentinelRuleConfig(effIndEarly);
    if (!D || !D.canViewVoidLog || !D.canViewVoidLog(D.activeUser())) {
      return { enabled: true, ruleId: cfgEarly.ruleId, cfg: cfgEarly, findings: [], alertKeys: new Set(), counts: { repeat: 0, afterPrint: 0, lowerRekey: 0 }, maxSeverity: 'ok', scannedCount: 0 };
    }
    const u = D.activeUser();
    const effInd = effIndEarly;
    const cfg = cfgEarly;
    const GROUP_DISPLAY_LABELS = new Set([
      'all', 'all group', 'manufacturing-group', 'wtc & bbconstruction', 'manufacturing',
      'holding & treasury', 'hospitality & resorts', 'automotive & heavy trading',
      'real estate & property', 'insurance & brokerage'
    ]);
    const all = collectScopedVoidEntries().filter(e => {
      if (!e || e.originGroup === 'system' || e.isCascadedChild) return false;
      if (targetInd && targetInd !== 'all' && e.industry !== targetInd) return false;
      if (targetCompany && !String(targetCompany).startsWith('industry:') && !GROUP_DISPLAY_LABELS.has(String(targetCompany).trim().toLowerCase())) {
        const tcLow = String(targetCompany).trim().toLowerCase();
        const buMatch = (D.COMPANY_BU_MATCH && D.COMPANY_BU_MATCH[tcLow]) || (D.COMPANY_BU_MATCH && D.COMPANY_BU_MATCH[targetCompany]) || '';
        const eCoKey = (D.COMPANY_KEY_BY_NAME && D.COMPANY_KEY_BY_NAME[e.company]) || '';
        const matchesKey = eCoKey && String(eCoKey).toLowerCase() === tcLow;
        const matchesBu = buMatch && normStr(e.company) === normStr(buMatch);
        const matchesRaw = normStr(e.company) === normStr(targetCompany);
        if (normStr(e.company) && !matchesKey && !matchesBu && !matchesRaw) return false;
      }
      return true;
    });
    const findings = [];
    const alertKeys = new Set();

    // 1. Shift repeat-void clusters per actor/till & day
    const actorDayMap = new Map();
    all.forEach(e => {
      const dayIso = String(e.voidedAt || e.date || '').slice(0, 10) || 'Undated';
      const actor = String(e.voidedBy || 'Supervisor').trim();
      const key = `${actor.toLowerCase()}::${dayIso}::${e.company || ''}`;
      if (!actorDayMap.has(key)) actorDayMap.set(key, { actor, day: dayIso, company: e.company || '', entries: [] });
      actorDayMap.get(key).entries.push(e);
    });
    actorDayMap.forEach(grp => {
      if (grp.entries.length >= cfg.maxShiftVoids) {
        const sorted = grp.entries.slice().sort((a, b) => (b.voidedAtMs || 0) - (a.voidedAtMs || 0));
        const lead = sorted[0];
        sorted.forEach(x => alertKeys.add(x.key));
        const unmaskedSum = sorted.filter(x => !x.amountMasked && x.amountUsd != null).reduce((s, x) => s + Number(x.amountUsd || 0), 0);
        const allMasked = sorted.every(x => x.amountMasked);
        findings.push({
          kind: 'repeat_shift',
          severity: grp.entries.length >= cfg.maxShiftVoids + 2 ? 'crit' : 'warn',
          actor: grp.actor,
          day: grp.day,
          company: grp.company,
          count: grp.entries.length,
          totalUsd: allMasked ? null : Math.round(unmaskedSum * 100) / 100,
          amountMasked: allMasked,
          leadEntry: lead
        });
      }
    });

    // 2. Void after print (POS gate till or ERP thermal slip) + 3. Lower-amount re-key
    all.forEach(e => {
      const raw = e.raw || {};
      const printedBefore = Boolean(
        raw.printed_before_void === true
        || raw.printed === true
        || raw.printed_at
        || raw.last_printed_at
        || Number(raw.print_count || 0) > 0
      );
      if (printedBefore) {
        alertKeys.add(e.key);
        findings.push({
          kind: 'after_print',
          severity: 'warn',
          actor: e.voidedBy,
          day: String(e.voidedAt || e.date || '').slice(0, 10),
          company: e.company,
          leadEntry: e
        });
      }
      const rawRekey = raw.lower_rekey && Number(raw.lower_rekey.drop_usd) > 0 ? raw.lower_rekey : null;
      const lowerRk = e.isPosTill
        ? (rawRekey && Number(rawRekey.delta_min || 0) <= cfg.rekeyWindowMin ? rawRekey : null)
        : _findErpLowerRekeyReplacement(e, cfg.rekeyWindowMin);
      if (lowerRk) {
        alertKeys.add(e.key);
        findings.push({
          kind: 'lower_rekey',
          severity: 'crit',
          actor: e.voidedBy,
          day: String(e.voidedAt || e.date || '').slice(0, 10),
          company: e.company,
          rekey: lowerRk,
          leadEntry: e
        });
      }
    });

    const sevRank = { crit: 2, warn: 1, ok: 0 };
    findings.sort((a, b) => (sevRank[b.severity] - sevRank[a.severity]) || ((b.leadEntry.voidedAtMs || 0) - (a.leadEntry.voidedAtMs || 0)));
    const repeat = findings.filter(f => f.kind === 'repeat_shift').length;
    const afterPrint = findings.filter(f => f.kind === 'after_print').length;
    const lowerRekey = findings.filter(f => f.kind === 'lower_rekey').length;
    const maxSeverity = findings.some(f => f.severity === 'crit') ? 'crit' : (findings.length ? 'warn' : 'ok');
    return { enabled: cfg.enabled, ruleId: cfg.ruleId, cfg, findings, alertKeys, counts: { repeat, afterPrint, lowerRekey }, maxSeverity, u, scannedCount: all.length };
  }

  function buildVoidSentinelItem(ind, opts = {}) {
    const isMfg = !ind || ind === 'Manufacturing';
    const scopeCo = opts.scopeCompany !== undefined ? opts.scopeCompany : ((D && D.STATE && D.STATE.company) || '');
    const d = computeVoidSentinelDigest(ind, scopeCo);
    const cfg = d.cfg || getVoidSentinelRuleConfig(resolveActiveVoidInd(ind, scopeCo));
    const total = d.findings.length;
    const badge = total
      ? `${fmtNum(total)} FLAG${total === 1 ? '' : 'S'}`
      : 'CLEAR';
    const detail = total
      ? `${fmtNum(d.counts.repeat)} repeat-shift, ${fmtNum(d.counts.afterPrint)} after-print, and ${fmtNum(d.counts.lowerRekey)} lower-rekey anomalies across ${fmtNum(d.scannedCount)} scoped voids (shift >= ${fmtNum(cfg.maxShiftVoids)}, re-key <= ${fmtNum(cfg.rekeyWindowMin)}m).`
      : `No repeat-shift (>= ${fmtNum(cfg.maxShiftVoids)}), after-print, or lower-rekey (<= ${fmtNum(cfg.rekeyWindowMin)}m) anomalies across ${fmtNum(d.scannedCount)} scoped voids.`;
    return {
      id: opts.id || (isMfg ? 'S19' : 'VOID_AUDIT'),
      ruleId: opts.ruleId || d.ruleId,
      code: isMfg ? 'Rule #31 · Void & Audit Controls' : 'Rule #10 · Void & Audit Controls',
      industry: ind || 'Manufacturing',
      company: opts.company || (isMfg ? 'All Group' : ind),
      title: 'Repeat-Void, After-Print & Lower-Rekey Sentinel',
      badge,
      severity: d.maxSeverity,
      rawMetric: total,
      detail,
      summary: detail,
      scrollPanel: 'snVoidPatternsPanel',
      navView: 'void_log',
      navLabel: 'Open Void Log'
    };
  }

  function renderSentinelVoidPanelHtml(targetInd, targetCompany) {
    if (!D || !D.canViewVoidLog || (!D.canViewVoidLog(D.activeUser()) && !D.isDemoScopeActive())) return '';
    const d = computeVoidSentinelDigest(targetInd, targetCompany);
    if (!d.enabled) return '';
    const u = d.u || D.activeUser();
    const hideCo = activeScopeCompanies(u).length <= 1;
    const statusBadge = d.maxSeverity === 'crit'
      ? `<span class="badge badge-crit" data-no-i18n="1">${esc(L(`${d.findings.length} High-Risk Flags`, `${d.findings.length} تنبيهات حرجة`, `${d.findings.length} alertes critiques`))}</span>`
      : (d.findings.length
        ? `<span class="badge badge-warn" data-no-i18n="1">${esc(L(`${d.findings.length} Watch Flags`, `${d.findings.length} تنبيهات`, `${d.findings.length} alertes`))}</span>`
        : `<span class="badge badge-good">Clear</span>`);

    const rowsHtml = d.findings.length
      ? d.findings.slice(0, 12).map(f => {
        const e = f.leadEntry;
        const coTxt = (!hideCo && f.company) ? ` · ${f.company}` : '';
        const amtTxt = e.amountMasked ? tr('Confidential') : (e.amountUsd != null ? formatSignedUsd(e.amountUsd) : '-');
        let tagHtml = '';
        let descTxt = '';
        if (f.kind === 'repeat_shift') {
          tagHtml = `<span class="vlog-badge vlog-badge-warn">Shift Repeat (${fmtNum(f.count)})</span>`;
          const grpAmt = f.amountMasked ? tr('Confidential') : (f.totalUsd != null ? formatSignedUsd(f.totalUsd) : '-');
          descTxt = L(`${f.actor}${coTxt} voided ${f.count} times on ${f.day} (${grpAmt})`, `${f.actor}${coTxt} ألغى ${f.count} مرات بتاريخ ${f.day} (${grpAmt})`, `${f.actor}${coTxt} a annulé ${f.count} fois le ${f.day} (${grpAmt})`);
        } else if (f.kind === 'after_print') {
          tagHtml = `<span class="vlog-badge vlog-badge-warn">After-Print Void</span>`;
          descTxt = `${e.id}${coTxt} · ${e.summary} (${amtTxt}) · ${f.actor}`;
        } else {
          tagHtml = `<span class="vlog-badge vlog-badge-crit">Lower Re-Key</span>`;
          const rkAmt = e.amountMasked ? tr('Confidential') : formatSignedUsd(f.rekey.total_usd);
          const rkDrop = e.amountMasked ? tr('Confidential') : formatSignedUsd(f.rekey.drop_usd);
          descTxt = L(
            `${e.id}${coTxt} (${amtTxt}) replaced by #${f.rekey.num} (${rkAmt}, -${rkDrop} in ${f.rekey.delta_min}m) · ${f.actor}`,
            `${e.id}${coTxt} (${amtTxt}) استبدل بالتذكرة #${f.rekey.num} (${rkAmt}, -${rkDrop} خلال ${f.rekey.delta_min}د) · ${f.actor}`,
            `${e.id}${coTxt} (${amtTxt}) remplacé par #${f.rekey.num} (${rkAmt}, -${rkDrop} en ${f.rekey.delta_min}m) · ${f.actor}`
          );
        }
        return `
          <div class="sn-void-row">
            <div class="sn-void-row-main">
              <div class="sn-void-row-title">${tagHtml} <span data-no-i18n="1">${esc(e.moduleLabel)} · ${esc(f.day || e.date || '')}</span></div>
              <div class="sn-void-row-sub" data-no-i18n="1">${esc(descTxt)}</div>
            </div>
            <button type="button" class="btn btn-outline-bar vlog-btn-xs" data-vlog-jump-key="${esc(e.key)}">Inspect Void</button>
          </div>`;
      }).join('')
      : `<div class="mu" style="font-size:12.5px;padding:6px 0">No repeat-void, after-print, or lower-amount re-key anomalies under current thresholds.</div>`;

    return `
      <section class="panel-card sn-void-panel" id="snVoidPatternsPanel" data-vlog-sn-ind="${esc(targetInd || 'Manufacturing')}">
        <div class="panel-hd" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
          <div>
            <h3>Repeat-Void, After-Print &amp; Lower-Rekey Sentinel</h3>
            <div class="mu" style="font-size:12px" data-no-i18n="1">${esc(L(`Shift cluster >= ${d.cfg.maxShiftVoids} · After-print voids · Lower re-key <= ${d.cfg.rekeyWindowMin}m`, `تكرار الوردية >= ${d.cfg.maxShiftVoids} · إلغاء بعد الطباعة · إعادة إدخال أقل خلال ${d.cfg.rekeyWindowMin} دقيقة`, `Répétition >= ${d.cfg.maxShiftVoids} · Après impression · Re-saisie inférieure <= ${d.cfg.rekeyWindowMin}m`))}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            ${statusBadge}
            <button type="button" class="btn btn-ghost-bar vlog-btn-xs" data-vlog-open-view="1">Open Void Log</button>
          </div>
        </div>
        <div class="sn-void-grid">${rowsHtml}</div>
      </section>`;
  }

  function jumpToVoidEntry(entryKey) {
    if (!D || !D.setView) return;
    D.setView('void_log');
    setTimeout(() => {
      const e = findEntryByKey(entryKey);
      if (e) openInspectModal(e);
    }, 35);
  }

  function wireSentinelContainer(container) {
    if (!container || container.dataset.vlogSnDelegated === '1') return;
    container.dataset.vlogSnDelegated = '1';
    container.addEventListener('click', ev => {
      const jumpBtn = ev.target && ev.target.closest ? ev.target.closest('[data-vlog-jump-key]') : null;
      if (jumpBtn && container.contains(jumpBtn)) {
        ev.preventDefault();
        jumpToVoidEntry(jumpBtn.getAttribute('data-vlog-jump-key') || '');
        return;
      }
      const openBtn = ev.target && ev.target.closest ? ev.target.closest('[data-vlog-open-view]') : null;
      if (openBtn && container.contains(openBtn) && D && D.setView) {
        ev.preventDefault();
        D.setView('void_log');
      }
    });
  }

  function _datesOverlapIso(aStart, aEnd, bStart, bEnd) {
    const as = String(aStart || '').slice(0, 10) || '1900-01-01';
    const ae = (!aEnd || /open/i.test(String(aEnd))) ? '9999-12-31' : String(aEnd).slice(0, 10);
    const bs = String(bStart || '').slice(0, 10) || '1900-01-01';
    const be = (!bEnd || /open/i.test(String(bEnd))) ? '9999-12-31' : String(bEnd).slice(0, 10);
    return as <= be && bs <= ae;
  }

  function computeVoidCascadePreview(entry) {
    const res = { banners: [], rows: [], isInsuranceCutoffBlocked: false, cutoffReason: '' };
    if (!entry || !D) return res;
    const raw = entry.raw || {};
    const cr = String(entry.crKey || '').trim();
    const ind = String(entry.industry || '');
    const idU = String(entry.id || '').trim().toUpperCase();
    const u = D.activeUser();
    const showPayroll = D.canViewPayrollDollarAmounts ? D.canViewPayrollDollarAmounts(u) : false;
    const maskPay = PAYROLL_CONFIDENTIAL_TABLES.has(cr) && !showPayroll;

    // 1. Insurance Bordereau Cutoff + Invoice / Remittance Linkage
    if (ind.includes('Insurance') || /^ins_/i.test(cr)) {
      let ins = null;
      try { ins = D.computeInsuranceOperations ? D.computeInsuranceOperations({ ignorePeriod: true, ignoreRls: true }) : null; } catch (_) {}
      const indStoreIns = (D.getIndustryCustomRowsStore && D.getIndustryCustomRowsStore()) || {};
      const allBill = ((ins && ins.billing) || []).concat(Array.isArray(indStoreIns.ins_billing) ? indStoreIns.ins_billing : []);
      const allRem = ((ins && ins.remittances) || []).concat(Array.isArray(indStoreIns.ins_remittances) ? indStoreIns.ins_remittances : []);
      const allStmt = ((ins && ins.statements) || []).concat(Array.isArray(indStoreIns.ins_statements) ? indStoreIns.ins_statements : []);
      if (ins || allStmt.length || allRem.length || allBill.length) {
        const polNo = String(raw.policy_no || raw.id || entry.id || '').trim();
        const carrierN = normStr(raw.carrier || '');
        const eYm = String(entry.date || raw.date || raw.effective_from || '').slice(0, 7);
        const billingHits = allBill.filter(b => b && !b.voided && (
          (polNo && String(b.policy_no || '').toUpperCase() === polNo.toUpperCase())
          || String(b.id || '').toUpperCase() === idU
        ));
        const remHits = allRem.filter(rm => {
          if (!rm || rm.voided) return false;
          const rmIdU = String(rm.id || '').toUpperCase();
          if (rmIdU === idU) return true;
          if (polNo && rmIdU === `REM-${polNo.toUpperCase()}`) return true;
          const rmPol = String(rm.policy_no || rm.policy_id || rm.reference || '').trim().toUpperCase();
          const polNoU = polNo.toUpperCase();
          const rmPolTokens = rmPol ? rmPol.split(/[\s,;|/]+/).filter(Boolean) : [];
          if (polNoU && (rmPol === polNoU || rmPolTokens.includes(polNoU))) return true;
          if (carrierN && normStr(rm.carrier || '') === carrierN) {
            const rmYm = String(rm.period || rm.remittance_date || rm.date || '').slice(0, 7);
            return Boolean(eYm && rmYm && rmYm === eYm);
          }
          return false;
        });
        billingHits.slice(0, 4).forEach(b => {
          res.rows.push({
            label: L(`Invoice ${b.id}`, `فاتورة ${b.id}`, `Facture ${b.id}`),
            value: L(
              `${b.status || 'Open'} · Billed $${fmtNum(Number(b.client_billed_4112_usd || 0))} · Open $${fmtNum(Number(b.open_ar_4112_usd || 0))}`,
              `${b.status || 'مفتوحة'} · مفوتر $${fmtNum(Number(b.client_billed_4112_usd || 0))} · رصيد $${fmtNum(Number(b.open_ar_4112_usd || 0))}`,
              `${b.status || 'Ouvert'} · Facturé $${fmtNum(Number(b.client_billed_4112_usd || 0))} · Ouvert $${fmtNum(Number(b.open_ar_4112_usd || 0))}`
            )
          });
        });
        remHits.slice(0, 3).forEach(rm => {
          res.rows.push({
            label: L(`Remittance ${rm.id}`, `حوالة ${rm.id}`, `Versement ${rm.id}`),
            value: L(
              `${rm.carrier || ''} · ${rm.status || ''} · Net $${fmtNum(Number(rm.net_payable_4017_usd || 0))}`,
              `${rm.carrier || ''} · ${rm.status || ''} · صافي $${fmtNum(Number(rm.net_payable_4017_usd || 0))}`,
              `${rm.carrier || ''} · ${rm.status || ''} · Net $${fmtNum(Number(rm.net_payable_4017_usd || 0))}`
            )
          });
        });
        const settledStmt = allStmt.find(st => {
          if (!st || st.voided) return false;
          const stStatus = String(st.status || '');
          if (!/settled|matched|reconciled/i.test(stStatus)) return false;
          if (carrierN && normStr(st.carrier || '') !== carrierN) return false;
          const pYm = String(st.period || '').slice(0, 7);
          return !pYm || !eYm || eYm <= pYm;
        });
        const settledRem = remHits.find(rm => !rm.voided && /settled|paid/i.test(String(rm.status || '')));
        if (settledStmt || settledRem) {
          res.isInsuranceCutoffBlocked = true;
          const ref = settledStmt ? `${settledStmt.id} (${settledStmt.period || ''} · ${settledStmt.status})` : `${settledRem.id} (${settledRem.status})`;
          res.cutoffReason = L(
            `Carrier bordereau ${ref} is already locked; restoring ${entry.id} requires 2-step cutoff override confirmation.`,
            `جدول شركة التأمين ${ref} مقفل بالفعل؛ تتطلب استعادة ${entry.id} تأكيدا من خطوتين لتجاوز القطع.`,
            `Le bordereau assureur ${ref} est déjà clôturé ; la restauration de ${entry.id} requiert une confirmation en 2 étapes.`
          );
          res.banners.push({
            id: 'vlogBordereauCutoffBanner',
            tone: 'crit',
            html: `<strong>${esc(tr('Bordereau Cutoff Lock'))}:</strong> ${esc(res.cutoffReason)}`
          });
        }
      }
    }

    // 2. Holding Intercompany Mirror Pair & Partner Pool
    if (ind.includes('Holding') || cr === 'external_movements' || /^hld_/i.test(cr)) {
      let ic = null;
      try { ic = D.computeIntercompanyInteractions ? D.computeIntercompanyInteractions({ ignorePeriod: true }) : null; } catch (_) {}
      const fromN = normStr(raw.fromCo || raw.from_entity || raw.company || entry.company || '');
      const toN = normStr(raw.toCo || raw.to_entity || raw.counterparty || raw.party || '');
      const amtAbs = entry.amountUsd != null ? Math.abs(entry.amountUsd) : 0;
      const stRec = (D.STATE && D.STATE.customRecords && D.STATE.customRecords.external_movements) || [];
      const sdRec = (D.SEED && D.SEED.records && D.SEED.records.external_movements) || [];
      const indHld = ((D.getIndustryCustomRowsStore && D.getIndustryCustomRowsStore()) || {}).hld_interactions || [];
      const allLegs = stRec.concat(sdRec, indHld);
      const isIc = Boolean(toN || raw.flow === 'Intercompany' || /transfer|mirror/i.test(String(raw.kind || raw.type || '')) || cr === 'hld_interactions');
      let matchedPair = null;
      if (ic && Array.isArray(ic.interactions)) {
        matchedPair = ic.interactions.find(p => {
          const p1 = p && p.primaryRow && String(p.primaryRow.id || '').toUpperCase();
          const p2 = p && p.mirrorRow && String(p.mirrorRow.id || '').toUpperCase();
          return p1 === idU || p2 === idU;
        }) || null;
      }
      const mirrorLeg = (matchedPair && ((String((matchedPair.primaryRow || {}).id || '').toUpperCase() === idU) ? matchedPair.mirrorRow : matchedPair.primaryRow))
        || (isIc && toN ? allLegs.find(l => {
          if (!l || String(l.id || '').toUpperCase() === idU) return false;
          const lFrom = normStr(l.fromCo || l.company || '');
          const lTo = normStr(l.toCo || l.party || l.counterparty || '');
          const revMatch = (lFrom === toN && (!fromN || lTo === fromN));
          const sameAmt = amtAbs > 0 ? Math.abs(_extractActiveRowUsdSimple(l) - amtAbs) <= 0.1 : true;
          return revMatch && sameAmt && (!entry.date || !l.date || String(l.date).slice(0, 10) === String(entry.date).slice(0, 10));
        }) : null);

      if (mirrorLeg) {
        const legVoided = Boolean(mirrorLeg.voided);
        res.banners.push({
          id: 'vlogMirrorPairBanner',
          tone: legVoided ? 'ok' : 'warn',
          html: legVoided
            ? `<strong>${esc(tr('Mirror Leg Also Voided'))}:</strong> ${esc(L(`Counterpart ${mirrorLeg.id || ''} (${mirrorLeg.company || mirrorLeg.fromCo || ''}) is also voided.`, `القيد المقابل ${mirrorLeg.id || ''} (${mirrorLeg.company || mirrorLeg.fromCo || ''}) ملغي أيضا.`, `La contrepartie ${mirrorLeg.id || ''} (${mirrorLeg.company || mirrorLeg.fromCo || ''}) est également annulée.`))}`
            : `<strong>${esc(tr('Intercompany Mirror Active'))}:</strong> ${esc(L(`Counterpart ${mirrorLeg.id || ''} (${mirrorLeg.company || mirrorLeg.fromCo || ''}) is still active ($${fmtNum(_extractActiveRowUsdSimple(mirrorLeg))}). Restoring restores bilateral balance.`, `القيد المقابل ${mirrorLeg.id || ''} (${mirrorLeg.company || mirrorLeg.fromCo || ''}) لا يزال نشطا ($${fmtNum(_extractActiveRowUsdSimple(mirrorLeg))}). الاستعادة تعيد التوازن المتقابل.`, `La contrepartie ${mirrorLeg.id || ''} (${mirrorLeg.company || mirrorLeg.fromCo || ''}) est encore active ($${fmtNum(_extractActiveRowUsdSimple(mirrorLeg))}). La restauration rétablit l'équilibre bilatéral.`))}`
        });
      } else if (isIc && (cr === 'hld_interactions' || cr === 'external_movements')) {
        res.banners.push({
          id: 'vlogMirrorPairBanner',
          tone: 'warn',
          html: `<strong>${esc(tr('Unmatched Sister Leg'))}:</strong> ${esc(L(`No active or voided counterparty mirror leg matched for ${entry.id}.`, `لم يتم العثور على قيد مقابل نشط أو ملغي لـ ${entry.id}.`, `Aucune jambe miroir active ou annulée trouvée pour ${entry.id}.`))}`
        });
      }
      if (/^hld_(distributions|partners|extended)$/i.test(cr)) {
        res.rows.push({
          label: tr('Holding Pool Link'),
          value: `${raw.partner || raw.party || raw.counterparty || entry.company} · ${raw.entity || entry.company}`
        });
      }
    }

    // 3. Real Estate Chronological Unit Overlap & Reopened Accrual Window
    if (ind.includes('Real Estate') || /^re_/i.test(cr)) {
      let re = null;
      try { re = D.computeRealEstateOperations ? D.computeRealEstateOperations({ ignorePeriod: true }) : null; } catch (_) {}
      if (re) {
        if (cr === 're_leases' || /lease/i.test(entry.moduleLabel)) {
          const sDt = String(raw.start_date || entry.date || '').slice(0, 10);
          const eDt = String(raw.end_date || 'Open');
          const unitN = normStr(raw.unit || raw.unit_id || '');
          const overlap = unitN ? (re.leases || []).filter(l => !l.voided && String(l.id || '').toUpperCase() !== idU && normStr(l.unit || '') === unitN && _datesOverlapIso(sDt, eDt, l.start_date, l.end_date)) : [];
          res.banners.push({
            id: 'vlogReWindowBanner',
            tone: overlap.length ? 'warn' : 'ok',
            html: overlap.length
              ? `<strong>${esc(tr('Unit Overlap Conflict'))}:</strong> ${esc(L(`${raw.unit || ''} already has ${overlap.length} active lease(s) (${overlap.map(x => x.id).join(', ')}) overlapping ${sDt} to ${eDt}.`, `الوحدة ${raw.unit || ''} لديها بالفعل ${overlap.length} عقد إيجار نشط (${overlap.map(x => x.id).join(', ')}) يتداخل من ${sDt} إلى ${eDt}.`, `${raw.unit || ''} possède déjà ${overlap.length} bail(aux) actif(s) (${overlap.map(x => x.id).join(', ')}) chevauchant ${sDt} à ${eDt}.`))}`
              : `<strong>${esc(tr('Reopened Rent Accrual Window'))}:</strong> ${esc(L(`${sDt || '-'} to ${eDt} · ${raw.frequency || 'Quarterly'} · $${fmtNum(Number(raw.ttc_period_usd || raw.net_period_usd || entry.amountUsd || 0))}/period (0 unit overlaps).`, `من ${sDt || '-'} إلى ${eDt} · ${raw.frequency || 'ربع سنوي'} · $${fmtNum(Number(raw.ttc_period_usd || raw.net_period_usd || entry.amountUsd || 0))}/فترة (بدون تداخل وحدات).`, `${sDt || '-'} au ${eDt} · ${raw.frequency || 'Trimestriel'} · $${fmtNum(Number(raw.ttc_period_usd || raw.net_period_usd || entry.amountUsd || 0))}/période (0 chevauchement).`))}`
          });
          const tenN = normStr(raw.tenant || '');
          const invHits = (re.invoices || []).filter(iv => {
            if (String(iv.lease_id || '').toUpperCase() === idU) return true;
            return Boolean(tenN) && normStr(iv.tenant || '') === tenN && (!unitN || !iv.unit || normStr(iv.unit) === unitN);
          });
          if (invHits.length) {
            res.rows.push({
              label: tr('Linked Rent Invoices'),
              value: L(
                `${invHits.length} invoice(s): ${invHits.slice(0, 3).map(x => x.id).join(', ')}`,
                `${invHits.length} فاتورة: ${invHits.slice(0, 3).map(x => x.id).join(', ')}`,
                `${invHits.length} facture(s) : ${invHits.slice(0, 3).map(x => x.id).join(', ')}`
              )
            });
          }
        } else if (cr === 're_invoicing') {
          const tenN = normStr(raw.tenant || '');
          const unitN = normStr(raw.unit || raw.unit_id || '');
          const rctHits = tenN ? (re.receipts || []).filter(rc => normStr(rc.tenant || '') === tenN && (!unitN || !rc.unit || normStr(rc.unit) === unitN)) : [];
          if (rctHits.length) {
            res.rows.push({
              label: tr('Tenant Receipts'),
              value: L(
                `${rctHits.length} receipt(s): ${rctHits.slice(0, 3).map(x => x.id).join(', ')}`,
                `${rctHits.length} إيصال: ${rctHits.slice(0, 3).map(x => x.id).join(', ')}`,
                `${rctHits.length} reçu(s) : ${rctHits.slice(0, 3).map(x => x.id).join(', ')}`
              )
            });
          }
        } else if (cr === 're_sales') {
          const instHits = (re.instalments || []).filter(it => String(it.sale_ref || '').toUpperCase() === idU);
          if (instHits.length) {
            res.rows.push({
              label: tr('Linked Deed Instalments'),
              value: L(
                `${instHits.length} milestone(s): ${instHits.map(x => x.id).join(', ')}`,
                `${instHits.length} قسط: ${instHits.map(x => x.id).join(', ')}`,
                `${instHits.length} échéance(s) : ${instHits.map(x => x.id).join(', ')}`
              )
            });
          }
        }
      }
    }

    // 4. Trading Linked Receivables, VIN Units & Landed Allocations
    if (ind.includes('Trading') || /^trd_/i.test(cr)) {
      let trd = null;
      try { trd = D.computeTradingOperations ? D.computeTradingOperations({ ignorePeriod: true }) : null; } catch (_) {}
      if (trd) {
        if (cr === 'trd_sales') {
          const custN = normStr(raw.customer || '');
          const arHits = (trd.receivableRows || []).filter(r => custN && normStr(r.customer || '') === custN && normStr(r.company || '') === normStr(entry.company || ''));
          const vinHits = (trd.serialUnits || []).filter(uRow => String(uRow.sale_id || '').toUpperCase() === idU || (raw.chassis && String(uRow.chassis_vin || '').toUpperCase() === String(raw.chassis || '').toUpperCase()));
          if (raw.book || raw.seq) res.rows.push({ label: tr('Book / VAT Sequence'), value: `${raw.book || '-'} ${raw.seq ? '#' + raw.seq : ''}` });
          arHits.slice(0, 2).forEach(ar => res.rows.push({
            label: L(`Customer AR (${ar.customer})`, `ذمم العميل (${ar.customer})`, `Créances client (${ar.customer})`),
            value: L(
              `Open $${fmtNum(Number(ar.gross_ar_usd || 0))} · Adv $${fmtNum(Number(ar.advance_usd || 0))}`,
              `مفتوح $${fmtNum(Number(ar.gross_ar_usd || 0))} · سلفة $${fmtNum(Number(ar.advance_usd || 0))}`,
              `Ouvert $${fmtNum(Number(ar.gross_ar_usd || 0))} · Avance $${fmtNum(Number(ar.advance_usd || 0))}`
            )
          }));
          if (vinHits.length) res.rows.push({ label: tr('Showroom VIN Link'), value: vinHits.map(v => `${v.id} (${v.chassis_vin || v.model || ''})`).join(', ') });
        } else if (cr === 'trd_purchases' || cr === 'trd_landed') {
          const ldHits = (trd.landedRows || []).filter(l => String(l.import_file || '').toUpperCase() === idU || String(l.id || '').toUpperCase() === idU);
          const grnHits = (trd.grnRows || []).filter(g => String(g.import_file || '').toUpperCase() === idU);
          ldHits.slice(0, 2).forEach(l => res.rows.push({
            label: L(`Landed File ${l.id}`, `ملف الشحن ${l.id}`, `Dossier arrivage ${l.id}`),
            value: `$${fmtNum(Number(l.total_landed_add || 0))} · ${l.status || ''}`
          }));
          if (grnHits.length) {
            res.rows.push({
              label: tr('Warehouse GRN Receipts'),
              value: L(
                `${grnHits.length} GRN(s): ${grnHits.map(g => g.id).join(', ')}`,
                `${grnHits.length} سند استلام: ${grnHits.map(g => g.id).join(', ')}`,
                `${grnHits.length} bon(s) réception : ${grnHits.map(g => g.id).join(', ')}`
              )
            });
          }
        }
      }
    }

    // 5. Manufacturing & Hospitality Group Transfers, Salary Back-Pay, Child Lines & POS
    if (entry.sourceKind === 'custom_record') {
      if (D.findGroupTransferCounterpart) {
        const peer = D.findGroupTransferCounterpart(cr, raw, true);
        if (peer && peer.row) {
          const peerMod = tr(humanizeModule(peer.crKey));
          res.rows.push({
            label: L(`Group Transfer Counterpart (${peerMod})`, `الطرف المقابل للتحويل (${peerMod})`, `Contrepartie transfert groupe (${peerMod})`),
            value: `${peer.row.id || ''} · ${peer.row.company || ''} · ${peer.row.voided ? tr('Also Voided') : tr('Active')}`
          });
        }
      }
      if (D.salaryVoucherPeers) {
        const bp = D.salaryVoucherPeers(cr, raw, true);
        if (Array.isArray(bp) && bp.length) {
          const listStr = maskPay ? tr('Confidential') : bp.map(p => p.id).slice(0, 3).join(', ');
          res.rows.push({
            label: tr('Back-Pay Voucher Peers'),
            value: L(
              `${bp.length} peer row(s) (${listStr})`,
              `${bp.length} سجل مقابل (${listStr})`,
              `${bp.length} ligne(s) liées (${listStr})`
            )
          });
        }
      }
      const st = (D.STATE && D.STATE.customRecords) || {};
      const childKeys = cr === 'expenses' ? ['expense_items', 'documents'] : (cr === 'equipment_repairs' ? ['repair_items', 'documents'] : ['documents']);
      childKeys.forEach(ck => {
        const kids = (Array.isArray(st[ck]) ? st[ck] : []).filter(ch => ch && ch.voided && String(ch.voided_with_parent || '') === String(entry.id || ''));
        if (kids.length) {
          const modTr = tr(humanizeModule(ck));
          res.rows.push({
            label: L(`Linked ${modTr}`, `مرتبط (${modTr})`, `Lié (${modTr})`),
            value: L(
              `${kids.length} auto-voided child record(s) (restores together)`,
              `${kids.length} سجل فرعي ملغي تلقائيا (يستعاد معا)`,
              `${kids.length} sous-enregistrement(s) annulé(s) (restaurés ensemble)`
            )
          });
        }
      });
    }
    if (entry.isPosTill) {
      const posPrinted = Boolean(
        raw.printed_before_void === true
        || raw.printed === true
        || raw.printed_at
        || raw.last_printed_at
        || Number(raw.print_count || 0) > 0
      );
      res.rows.push({ label: tr('Thermal Print Check'), value: posPrinted ? tr('Printed at gate till before void') : tr('Unprinted cancellation') });
      if (raw.lower_rekey) {
        res.banners.push({
          id: 'vlogPosRekeyBanner',
          tone: 'crit',
          html: `<strong>${esc(tr('Lower Re-Key Match'))}:</strong> ${esc(L(`Replacement ticket #${raw.lower_rekey.num || ''} for $${fmtNum(raw.lower_rekey.total_usd)} (-$${fmtNum(raw.lower_rekey.drop_usd)}) posted ${raw.lower_rekey.delta_min || 0}m later.`, `التذكرة البديلة #${raw.lower_rekey.num || ''} بمبلغ $${fmtNum(raw.lower_rekey.total_usd)} (-$${fmtNum(raw.lower_rekey.drop_usd)}) سجلت بعد ${raw.lower_rekey.delta_min || 0} دقيقة.`, `Ticket de remplacement #${raw.lower_rekey.num || ''} de $${fmtNum(raw.lower_rekey.total_usd)} (-$${fmtNum(raw.lower_rekey.drop_usd)}) saisi ${raw.lower_rekey.delta_min || 0}m plus tard.`))}`
        });
      }
    }
    return res;
  }

  function buildLocalVoidPatternSummary(filteredEntries, targetInd) {
    const scopeRows = filteredEntries.filter(e => e.originGroup !== 'system' && !e.isCascadedChild);
    const actCo = (D && D.STATE && D.STATE.company) || '';
    const actInd = resolveActiveVoidInd(targetInd, actCo);
    const dig = computeVoidSentinelDigest(actInd, actCo);
    const counts = new Map();
    const usdSums = new Map();
    const actorCounts = new Map();
    let afterHours = 0;
    let unmaskedTotalUsd = 0;
    let maskedPayrollCount = 0;

    scopeRows.forEach(e => {
      const ck = classifyVoidCluster(e, dig.alertKeys);
      counts.set(ck, (counts.get(ck) || 0) + 1);
      if (e.amountMasked) maskedPayrollCount++;
      else if (e.amountUsd != null && Number.isFinite(e.amountUsd)) {
        usdSums.set(ck, (usdSums.get(ck) || 0) + Number(e.amountUsd || 0));
        unmaskedTotalUsd += Number(e.amountUsd || 0);
      }
      actorCounts.set(e.voidedBy || 'Supervisor', (actorCounts.get(e.voidedBy || 'Supervisor') || 0) + 1);
      if (e.afterHours) afterHours++;
    });

    const clusters = VOID_CLUSTER_DEFS.map(def => ({
      key: def.key,
      label: def.label,
      count: counts.get(def.key) || 0,
      usd: Math.round((usdSums.get(def.key) || 0) * 100) / 100
    })).concat([{
      key: 'other',
      label: 'Other Operational',
      count: counts.get('other') || 0,
      usd: Math.round((usdSums.get('other') || 0) * 100) / 100
    }]).filter(c => c.count > 0).sort((a, b) => (b.count - a.count) || (b.usd - a.usd));

    const topActors = Array.from(actorCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const coSig = String((D && D.STATE && D.STATE.company) || '');
    const lcNow = lang();
    const tbPeriod = (D && D.STATE)
      ? `${D.STATE.period || 'all'}:${D.STATE.dateGrain || 'all'}:${D.STATE.dateFrom || ''}:${D.STATE.dateTo || ''}`
      : 'all';
    const lensSig = Array.isArray(filterState.lenses) && filterState.lenses.length ? filterState.lenses.slice().sort().join('+') : 'all';
    const filtSig = `${filterState.origin || 'user'}:${filterState.days || 'all'}:${filterState.module || 'all'}:${filterState.actor || 'all'}:${lensSig}:${filterState.cluster || 'all'}:${filterState.drillDay || ''}:${String(filterState.q || '').trim()}`;
    const uNow = (D && D.activeUser) ? D.activeUser() : null;
    const paySig = (D && D.canViewPayrollDollarAmounts && D.canViewPayrollDollarAmounts(uNow)) ? 'pay1' : 'pay0';
    const reasonDigest = scopeRows.slice(0, 25).map(e => `${e.key}:${e.voidReason || ''}`).join('~');
    const sig = `${coSig}|${lcNow}|${tbPeriod}|${filtSig}|${paySig}|${scopeRows.length}|${clusters.map(c => c.key + ':' + c.count).join(',')}|${dig.findings.length}|${reasonDigest}`;
    return {
      sig,
      totalCount: scopeRows.length,
      unmaskedTotalUsd: Math.round(unmaskedTotalUsd * 100) / 100,
      maskedPayrollCount,
      afterHours,
      clusters,
      topActors,
      sentinelCounts: dig.counts,
      sentinelTotal: dig.findings.length
    };
  }

  async function requestCloudVoidSummary(localStats, filteredEntries) {
    if (!D || !D.edgeApiFetch || !D.hasServerApi || !D.hasServerApi() || D.isDemoScopeActive()) return;
    if (!D.STATE || !D.STATE.authed) return;
    if (aiCloudState.loading && aiCloudState.sig === localStats.sig) return;
    if (aiCloudState.attemptedSig === localStats.sig && (aiCloudState.text || aiCloudState.mode === 'local_hybrid')) return;
    cancelPendingAiSummary();
    const myGen = ++aiRequestGen;
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    aiAbortCtrl = ctrl;
    const lcNow = lang();
    const outLangName = lcNow === 'ar' ? 'Arabic' : (lcNow === 'fr' ? 'French' : 'English');
    const sampleReasons = filteredEntries
      .filter(e => e.originGroup !== 'system' && !e.isCascadedChild && e.voidReason)
      .slice(0, 18)
      .map(e => `- [${e.moduleLabel}${e.amountMasked ? ', Payroll Confidential' : ''}] ${sanitizeOutwardText(e.voidReason)} (${e.amountMasked ? 'Confidential' : formatSignedUsd(e.amountUsd || 0)})`)
      .join('\n');
    const prompt = sanitizeOutwardText(
      `Summarize these ERP Void Log audit patterns concisely in JSON {"headline": string, "recommendations": string[]} without any em-dash characters or mentioning any assistant name. Write "headline" and every string in "recommendations" strictly in ${outLangName}. Strict rule: never reveal confidential payroll figures.\n`
      + `Total user/till voids: ${localStats.totalCount}, non-confidential value: $${localStats.unmaskedTotalUsd}, confidential payroll count: ${localStats.maskedPayrollCount}, after-hours voids: ${localStats.afterHours}.\n`
      + `Clusters: ${localStats.clusters.map(c => `${c.label}: ${c.count}`).join('; ')}.\n`
      + `Sentinel alerts: ${localStats.sentinelCounts.repeat} shift-repeat, ${localStats.sentinelCounts.afterPrint} after-print, ${localStats.sentinelCounts.lowerRekey} lower-rekey.\n`
      + `Sample notes:\n${sampleReasons || '(no typed notes yet)'}`
    );
    aiCloudState = { loading: true, sig: localStats.sig, attemptedSig: localStats.sig, text: '', mode: '', recs: [], error: '' };
    patchAiSummaryInPlace();
    try {
      const resp = await D.edgeApiFetch('./api/ai-edge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'void_pattern_summary', tier: 'fast', prompt }),
        signal: ctrl ? ctrl.signal : undefined
      });
      if (myGen !== aiRequestGen || !aiPanelOpen) return;
      if (resp && resp.ok) {
        const j = await resp.json().catch(() => null);
        if (myGen !== aiRequestGen || !aiPanelOpen) return;
        const r = j && j.result;
        if (r && typeof r === 'object') {
          aiCloudState = {
            loading: false,
            sig: localStats.sig,
            attemptedSig: localStats.sig,
            mode: String(j.mode || 'gemini_ai_edge'),
            text: sanitizeOutwardText(r.headline || r.summary || ''),
            recs: Array.isArray(r.recommendations) ? r.recommendations.slice(0, 3).map(sanitizeOutwardText).filter(Boolean) : [],
            error: ''
          };
          patchAiSummaryInPlace();
          return;
        }
      }
      aiCloudState = { loading: false, sig: localStats.sig, attemptedSig: localStats.sig, mode: 'local_hybrid', text: '', recs: [], error: '' };
    } catch (_) {
      if (myGen !== aiRequestGen || !aiPanelOpen || (ctrl && ctrl.signal && ctrl.signal.aborted)) return;
      aiCloudState = { loading: false, sig: localStats.sig, attemptedSig: localStats.sig, mode: 'local_hybrid', text: '', recs: [], error: '' };
    } finally {
      if (aiAbortCtrl === ctrl) aiAbortCtrl = null;
    }
    if (myGen === aiRequestGen && aiPanelOpen) patchAiSummaryInPlace();
  }

  function syncAiSummaryAfterChange() {
    if (!aiPanelOpen || !document.getElementById('vlogAiSummaryPanel')) return;
    const allE = collectScopedVoidEntries();
    const { preClusterMatched } = applyFiltersAndSort(allE);
    const activeInd = resolveActiveVoidInd('', (D && D.STATE && D.STATE.company) || '');
    const localSt = buildLocalVoidPatternSummary(preClusterMatched, activeInd);
    if (aiCloudState.attemptedSig !== localSt.sig) {
      cancelPendingAiSummary();
      aiRequestGen += 1;
      aiCloudState = { loading: false, sig: '', attemptedSig: '', text: '', mode: '', recs: [], error: '' };
      patchAiSummaryInPlace();
      requestCloudVoidSummary(localSt, preClusterMatched);
    }
  }

  function renderAiSummaryPanelHtml(allEntries, matchedBeforeCluster) {
    if (!aiPanelOpen) return '';
    const activeInd = resolveActiveVoidInd('', (D && D.STATE && D.STATE.company) || '');
    const st = buildLocalVoidPatternSummary(matchedBeforeCluster, activeInd);
    const chipsHtml = [
      `<button type="button" class="vlog-ai-chip${filterState.cluster === 'all' ? ' active' : ''}" data-vlog-cluster="all" data-no-i18n="1">${esc(L(`All Clusters (${fmtNum(st.totalCount)})`, `جميع التصنيفات (${fmtNum(st.totalCount)})`, `Tous les groupes (${fmtNum(st.totalCount)})`))}</button>`
    ].concat(st.clusters.map(c =>
      `<button type="button" class="vlog-ai-chip${filterState.cluster === c.key ? ' active' : ''}" data-vlog-cluster="${esc(c.key)}" data-no-i18n="1">${esc(tr(c.label))} (${fmtNum(c.count)})</button>`
    )).join('');
    const actorsTxt = st.topActors.length ? st.topActors.map(([a, n]) => `${a} (${fmtNum(n)})`).join(', ') : '-';
    const cloudMatch = aiCloudState.sig === st.sig;
    const cloudHtml = !cloudMatch
      ? ''
      : (aiCloudState.loading
        ? `<div class="vlog-ai-cloud mu">Analyzing free-text void notes...</div>`
        : (aiCloudState.text
          ? `<div class="vlog-ai-cloud" data-no-i18n="1"><strong>${esc(aiCloudState.text)}</strong>${aiCloudState.recs.length ? `<ul style="margin:6px 0 0 18px;padding:0">${aiCloudState.recs.map(rc => `<li>${esc(rc)}</li>`).join('')}</ul>` : ''}</div>`
          : ''));

    return `
      <section class="vlog-ai-panel" id="vlogAiSummaryPanel" aria-label="AI Void Pattern Summary">
        <div class="vlog-ai-hd">
          <div>
            <strong>AI Void Pattern Summary</strong>
            <div class="mu" style="font-size:11.5px" data-no-i18n="1">${esc(L(`Deterministic EN/AR/FR clustering across ${fmtNum(st.totalCount)} voids · Payroll details protected`, `تصنيف ذكي لـ ${fmtNum(st.totalCount)} إلغاء مع حماية سرية الرواتب`, `Regroupement sur ${fmtNum(st.totalCount)} annulations · Paie protégée`))}</div>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <button type="button" class="btn btn-ghost-bar vlog-btn-xs" id="vlogAiCloseBtn">Close Summary</button>
          </div>
        </div>
        <div class="vlog-ai-chips">${chipsHtml}</div>
        <div class="vlog-ai-meta">
          <div class="vlog-ai-card"><span class="vlog-inspect-k">Top Actors &amp; Tills</span><div class="vlog-inspect-v" data-no-i18n="1">${esc(actorsTxt)}</div></div>
          <div class="vlog-ai-card"><span class="vlog-inspect-k">After-Hours (22:00-06:00)</span><div class="vlog-inspect-v" data-no-i18n="1">${fmtNum(st.afterHours)}</div></div>
          <div class="vlog-ai-card"><span class="vlog-inspect-k">Sentinel Pattern Alerts</span><div class="vlog-inspect-v" data-no-i18n="1">${esc(L(`${fmtNum(st.sentinelCounts.repeat)} repeat · ${fmtNum(st.sentinelCounts.afterPrint)} after-print · ${fmtNum(st.sentinelCounts.lowerRekey)} re-key`, `${fmtNum(st.sentinelCounts.repeat)} تكرار · ${fmtNum(st.sentinelCounts.afterPrint)} بعد الطباعة · ${fmtNum(st.sentinelCounts.lowerRekey)} إعادة إدخال`, `${fmtNum(st.sentinelCounts.repeat)} répétition · ${fmtNum(st.sentinelCounts.afterPrint)} après impr. · ${fmtNum(st.sentinelCounts.lowerRekey)} re-saisie`))}</div></div>
        </div>
        ${cloudHtml}
      </section>`;
  }

  function patchAiSummaryInPlace() {
    const mount = document.getElementById('vlogAiMount');
    if (!mount) return;
    const allEntries = collectScopedVoidEntries();
    const { preClusterMatched } = applyFiltersAndSort(allEntries);
    mount.innerHTML = renderAiSummaryPanelHtml(allEntries, preClusterMatched);
    try {
      const lc = lang();
      if (lc !== 'en' && window.MFG_I18N && typeof window.MFG_I18N.translateDom === 'function') {
        window.MFG_I18N.translateDom(mount, lc);
      }
    } catch (_) {}
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
    const activeLenses = Array.isArray(filterState.lenses) ? filterState.lenses : [];
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
    const lensCounts = { all: dateFiltered.length, after_hours: 0, missing_reason: 0, high_value: 0, edited_before_void: 0, restorable: 0, pos_only: 0 };

    dateFiltered.forEach(e => {
      modCounts.set(e.moduleLabel, (modCounts.get(e.moduleLabel) || 0) + 1);
      const hasUsdVal = !e.amountMasked && !e.isCascadedChild && e.amountUsd !== null && Number.isFinite(e.amountUsd);
      const ak = e.actorKey || e.voidedBy;
      const prevA = actorMap.get(ak) || { key: ak, label: e.actorDisplay, count: 0, usd: 0, unmasked: 0, masked: 0 };
      prevA.count += 1;
      if (e.amountMasked) prevA.masked += 1;
      else if (hasUsdVal) { prevA.usd += Math.abs(e.amountUsd); prevA.unmasked += 1; }
      actorMap.set(ak, prevA);

      const dBucket = e.voidedDayIso || e.date;
      if (dBucket) {
        const prevD = dayMap.get(dBucket) || { day: dBucket, count: 0, afterHours: 0, usd: 0, unmasked: 0, masked: 0 };
        prevD.count += 1;
        if (e.afterHours) prevD.afterHours += 1;
        if (e.amountMasked) prevD.masked += 1;
        else if (hasUsdVal) { prevD.usd += Math.abs(e.amountUsd); prevD.unmasked += 1; }
        dayMap.set(dBucket, prevD);
      }

      if (e.afterHours) lensCounts.after_hours++;
      if (!String(e.voidReason || '').trim()) lensCounts.missing_reason++;
      const peakVal = e.peakAbsUsd != null ? e.peakAbsUsd : (e.amountUsd != null ? Math.abs(e.amountUsd) : null);
      if (!e.amountMasked && peakVal != null && peakVal >= 500) lensCounts.high_value++;
      if (e.hasPreVoidEdits) lensCounts.edited_before_void++;
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
      const hasUsdVal = !e.amountMasked && !e.isCascadedChild && e.amountUsd !== null && Number.isFinite(e.amountUsd);
      const prevM = modBreakdownMap.get(e.moduleLabel) || { label: e.moduleLabel, count: 0, usd: 0, unmasked: 0, masked: 0 };
      prevM.count += 1;
      if (e.amountMasked) prevM.masked += 1;
      else if (hasUsdVal) { prevM.usd += Math.abs(e.amountUsd); prevM.unmasked += 1; }
      modBreakdownMap.set(e.moduleLabel, prevM);
    });
    const topModules = Array.from(modBreakdownMap.values()).sort((a, b) => (b.count - a.count) || (b.usd - a.usd)).slice(0, 4);
    const topActors = Array.from(actorMap.values()).sort((a, b) => (b.count - a.count) || (b.usd - a.usd)).slice(0, 4);
    const timelineDays = Array.from(dayMap.values())
      .sort((a, b) => (a.day < b.day ? -1 : 1))
      .slice(-14);

    const preClusterMatched = dateFiltered.filter(e => {
      if (modF !== 'all' && e.moduleLabel !== modF) return false;
      if (actorF !== 'all' && e.actorKey !== actorF && e.voidedBy !== actorF && e.actorDisplay !== actorF) return false;
      if (drillDay && (e.voidedDayIso || e.date) !== drillDay) return false;
      if (activeLenses.includes('after_hours') && !e.afterHours) return false;
      if (activeLenses.includes('missing_reason') && String(e.voidReason || '').trim()) return false;
      if (activeLenses.includes('high_value')) {
        const peakVal = e.peakAbsUsd != null ? e.peakAbsUsd : (e.amountUsd != null ? Math.abs(e.amountUsd) : null);
        if (e.amountMasked || peakVal == null || peakVal < 500) return false;
      }
      if (activeLenses.includes('edited_before_void') && !e.hasPreVoidEdits) return false;
      if (activeLenses.includes('restorable') && !e.canRestore) return false;
      if (activeLenses.includes('pos_only') && !e.isPosTill) return false;
      if (q) {
        const hay = `${e.id} ${e.company} ${e.moduleLabel} ${e.summary} ${e.refCode} ${e.partyName} ${e.detailLine} ${e.voidedBy} ${e.actorDisplay} ${e.voidReason} ${e.date} ${e.voidedAt} ${e.preVoidSearchText || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const clusterF = filterState.cluster || 'all';
    let matched = preClusterMatched;
    if (clusterF !== 'all') {
      const actCo = (D && D.STATE && D.STATE.company) || '';
      const dig = computeVoidSentinelDigest(resolveActiveVoidInd('', actCo), actCo);
      matched = preClusterMatched.filter(e => classifyVoidCluster(e, dig.alertKeys) === clusterF);
    }

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
      preClusterMatched,
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
    if (hasLens('pos_only') && (!stats.lensCounts || stats.lensCounts.pos_only === 0)) {
      filterState.lenses = filterState.lenses.filter(x => x !== 'pos_only');
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
      || (Array.isArray(filterState.lenses) && filterState.lenses.length > 0)
      || (filterState.cluster && filterState.cluster !== 'all')
      || filterState.drillDay
      || String(filterState.q || '').trim()
      || getTopBarPeriodRange()
    );
  }

  function formatMaskedBucketUsd(usd, unmaskedCnt, maskedCnt, emptyFallback, withMixedNote) {
    if (unmaskedCnt > 0) {
      return (withMixedNote && maskedCnt > 0)
        ? `${formatSignedUsd(usd)} (+${fmtNum(maskedCnt)} ${tr('Confidential')})`
        : formatSignedUsd(usd);
    }
    if (maskedCnt > 0) return tr('Confidential');
    return emptyFallback !== undefined ? emptyFallback : formatSignedUsd(0);
  }

  function renderKpiStripHtml(scopedEntries, filteredEntries) {
    const userTillRows = scopedEntries.filter(e => e.originGroup === 'user' || e.originGroup === 'pos');
    const systemRows = scopedEntries.filter(e => e.originGroup === 'system');
    const weekCutoff = Date.now() - 7 * 86400000;
    const recentRows = userTillRows.filter(e => (e.voidedAtMs || parseTimestampMs(e.date)) >= weekCutoff);
    const afterHoursCount = userTillRows.filter(e => e.afterHours).length;
    const reopenableSysCount = systemRows.filter(e => e.canRestore).length;

    let totalUsd = 0;
    let unmaskedCount = 0;
    let maskedCount = 0;
    let childSkipped = 0;
    filteredEntries.forEach(e => {
      if (e.amountMasked) { maskedCount++; return; }
      if (e.isCascadedChild) { childSkipped++; return; }
      if (e.amountUsd !== null && Number.isFinite(e.amountUsd)) {
        totalUsd += e.amountUsd;
        unmaskedCount++;
      }
    });
    const kpiUsdDisplay = formatMaskedBucketUsd(totalUsd, unmaskedCount, maskedCount, formatSignedUsd(0), false);

    const subUsd = childSkipped
      ? L(`${fmtNum(childSkipped)} linked child lines excluded`, `تم استبعاد ${fmtNum(childSkipped)} بنود تابعة`, `${fmtNum(childSkipped)} lignes liées exclues`)
      : (maskedCount
        ? L(`${fmtNum(maskedCount)} payroll rows masked`, `تم إخفاء ${fmtNum(maskedCount)} رواتب`, `${fmtNum(maskedCount)} paies masquées`)
        : L('Deduplicated parent vouchers', 'صافي الإلغاءات بدون تكرار', 'Hors doublons des lignes liées'));
    const scopedPosCount = userTillRows.filter(e => e.isPosTill).length;

    const noLenses = !Array.isArray(filterState.lenses) || filterState.lenses.length === 0;
    const userCardOn = filterState.origin === 'user' && noLenses && filterState.days === 'all';
    const valCardOn = hasLens('high_value');
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
          <strong class="vlog-kpi-val mono" data-no-i18n="1">${esc(kpiUsdDisplay)}</strong>
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
            const dUsd = formatMaskedBucketUsd(d.usd, d.unmasked, d.masked, '-', false);
            const tip = L(
              `${formatDateDMY(d.day)} · ${fmtNum(d.count)} ${d.count === 1 ? 'void' : 'voids'} (${dUsd})${d.afterHours ? ` · ${fmtNum(d.afterHours)} after-hours` : ''}`,
              `${formatDateDMY(d.day)} · ${fmtNum(d.count)} إلغاء (${dUsd})${d.afterHours ? ` · ${fmtNum(d.afterHours)} خارج الدوام` : ''}`,
              `${formatDateDMY(d.day)} · ${fmtNum(d.count)} ${d.count === 1 ? 'annulation' : 'annulations'} (${dUsd})${d.afterHours ? ` · ${fmtNum(d.afterHours)} hors horaires` : ''}`
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
              <span class="vlog-meter-meta mono" data-no-i18n="1">${fmtNum(m.count)} · ${esc(formatMaskedBucketUsd(m.usd, m.unmasked, m.masked, '-', false))}</span>
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
              <span class="vlog-meter-meta mono" data-no-i18n="1">${fmtNum(a.count)} · ${esc(formatMaskedBucketUsd(a.usd, a.unmasked, a.masked, '-', false))}</span>
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
    if (e.amountMasked) return `<span class="vlog-badge vlog-badge-mu">${esc(tr('Confidential'))}</span>`;
    const mainHtml = (e.amountUsd === null || !Number.isFinite(e.amountUsd))
      ? '<span class="vlog-muted" data-no-i18n="1">-</span>'
      : `<span class="mono" data-no-i18n="1">${esc(formatSignedUsd(e.amountUsd))}</span>`;
    if (e.hasPreVoidEdits && e.origAmountUsd != null && Number.isFinite(e.origAmountUsd) && (e.amountUsd == null || Math.abs(e.origAmountUsd - e.amountUsd) >= 0.01)) {
      return `${mainHtml}<div class="vlog-amt-orig mono" data-no-i18n="1">${esc(tr('Orig:'))} ${esc(formatSignedUsd(e.origAmountUsd))}</div>`;
    }
    return mainHtml;
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
    const lc = stats.lensCounts || { all: 0, after_hours: 0, missing_reason: 0, high_value: 0, edited_before_void: 0, restorable: 0, pos_only: 0 };
    const tb = stats.tbRange;
    const lensChip = (val, label, count) => {
      const on = val === 'all' ? (!Array.isArray(filterState.lenses) || filterState.lenses.length === 0) : hasLens(val);
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
          ${lensChip('edited_before_void', tr('Edited Before Void'), lc.edited_before_void || 0)}
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
    let tableMaskedCount = 0;
    entries.forEach(e => {
      if (e.amountMasked) { tableMaskedCount++; return; }
      if (!e.isCascadedChild && e.amountUsd !== null && Number.isFinite(e.amountUsd)) {
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
        if (e.hasPreVoidEdits) originBadges.push(`<span class="vlog-badge vlog-badge-warn" data-no-i18n="1">${esc(tr('Edited Before Void'))}${e.editCount > 1 ? ` (${fmtNum(e.editCount)})` : ''}</span>`);

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
            ? `<button type="button" class="btn btn-primary vlog-btn-xs" data-vlog-restore="${esc(e.key)}">${armedCutoffKey === e.key ? 'Confirm Cutoff?' : 'Confirm?'}</button>`
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

    const footUsd = formatMaskedBucketUsd(sumUsd, unmaskedCount, tableMaskedCount, '-', false);
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
    const { matched, preClusterMatched, topbarScoped, moduleOptions, actorOptions, originCounts } = stats;

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

    if (aiPanelOpen) scheduleAiSummarySync(120);
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
            <button type="button" class="btn btn-outline-bar${aiPanelOpen ? ' active' : ''}" id="vlogAiPatternBtn">${ic('sparkles')} AI Void Pattern Summary</button>
            ${askAvailable ? `<button type="button" class="btn btn-outline-bar" id="vlogAuditBriefBtn">${ic('sparkles')} Audit Brief</button>` : ''}
            <button type="button" class="btn btn-outline-bar" id="vlogDigestBtn">${ic('printer')} Void Digest</button>
            <button type="button" class="btn btn-ghost-bar" id="vlogRefreshBtn">${ic('rotate')} Refresh</button>
            <button type="button" class="btn btn-outline-bar" id="vlogExportCsvBtn">${ic('download')} Export CSV</button>
          </div>
        </div>
        <div id="vlogPosNoticeMount">${renderPosNoticeHtml(u)}</div>
        <div id="vlogKpiMount">${renderKpiStripHtml(topbarScoped, matched)}</div>
        <div id="vlogPulseMount">${renderPulsePanelHtml(stats)}</div>
        <div id="vlogAiMount">${renderAiSummaryPanelHtml(allEntries, preClusterMatched)}</div>
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

    const aiBtn = document.getElementById('vlogAiPatternBtn');
    if (aiBtn) aiBtn.classList.toggle('active', Boolean(aiPanelOpen));
    const kpiMount = document.getElementById('vlogKpiMount');
    if (kpiMount) kpiMount.innerHTML = renderKpiStripHtml(stats.topbarScoped, stats.matched);
    const pulseMount = document.getElementById('vlogPulseMount');
    if (pulseMount) pulseMount.innerHTML = renderPulsePanelHtml(stats);
    const aiMount = document.getElementById('vlogAiMount');
    if (aiMount) aiMount.innerHTML = renderAiSummaryPanelHtml(allEntries, stats.preClusterMatched);
    if (aiPanelOpen) {
      const actIndSync = resolveActiveVoidInd('', (D && D.STATE && D.STATE.company) || '');
      const stSync = buildLocalVoidPatternSummary(stats.preClusterMatched, actIndSync);
      if (aiCloudState.attemptedSig !== stSync.sig) {
        scheduleAiSummarySync(120);
      }
    }
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
    disarmRestoreConfirmations();
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
      '_seed_orig', '_pre_void_orig', '_pre_void_edits', 'payload_json', 'face_samples', 'pin_code', 'headers', 'cells', 'lines',
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

    const cascade = computeVoidCascadePreview(entry);
    const hasCascade = cascade.banners.length > 0 || cascade.rows.length > 0;
    const cascadeHtml = hasCascade ? `
      <div class="vlog-cascade-box" id="vlogCascadePreviewBox">
        <div class="vlog-cascade-hd">
          <span>Cascade &amp; Accounting Impact</span>
          <span class="mu" data-no-i18n="1">${esc(tr(entry.industry))}</span>
        </div>
        ${cascade.banners.map(b => `<div class="vlog-cascade-banner ${esc(b.tone || 'warn')}"${b.id ? ` id="${esc(b.id)}"` : ''} data-no-i18n="1">${b.html}</div>`).join('')}
        ${cascade.rows.length ? `<ul class="vlog-cascade-list">${cascade.rows.map(rw => `<li><span class="vlog-cascade-k" data-no-i18n="1">${esc(rw.label)}</span><span class="vlog-cascade-v" data-no-i18n="1">${esc(rw.value)}</span></li>`).join('')}</ul>` : ''}
      </div>` : '';

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
    if (entry.hasPreVoidEdits) statusPills.push(`<span class="vlog-badge vlog-badge-warn" data-no-i18n="1">${esc(tr('Edited Before Void'))}${entry.editCount > 1 ? ` (${fmtNum(entry.editCount)})` : ''}</span>`);

    const heroOrigSubHtml = (!entry.amountMasked && !hidePayField && entry.hasPreVoidEdits && entry.origAmountUsd != null && Number.isFinite(entry.origAmountUsd) && (entry.amountUsd == null || Math.abs(entry.origAmountUsd - entry.amountUsd) >= 0.01))
      ? `<span class="vlog-amt-orig mono" data-no-i18n="1">${esc(tr('Orig:'))} ${esc(formatSignedUsd(entry.origAmountUsd))}</span>`
      : '';
    const heroAmtHtml = (entry.amountMasked || hidePayField)
      ? `<span class="vlog-badge vlog-badge-mu">${esc(tr('Confidential'))}</span>`
      : `${entry.amountUsd == null ? '-' : esc(formatSignedUsd(entry.amountUsd))}${heroOrigSubHtml}`;

    const preVoidDiffsList = Array.isArray(entry.fieldDiffs) ? entry.fieldDiffs : [];
    const preVoidTimeline = Array.isArray(entry.timeline) ? entry.timeline : [];
    const preVoidSecHtml = entry.hasPreVoidEdits
      ? `<div class="vlog-drawer-sec" id="vlogPreVoidDiffSec">
          <div class="vlog-drawer-sec-hd">
            <span>Pre-Void Edit History</span>
            <span class="vlog-drawer-meta mono" data-no-i18n="1">${fmtNum(entry.editCount || 1)} ${esc((entry.editCount || 1) === 1 ? tr('revision') : tr('revisions'))}</span>
          </div>
          ${preVoidDiffsList.length ? `
            <div class="vlog-diff-table-wrap">
              <table class="vlog-diff-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Original</th>
                    <th>At Void</th>
                  </tr>
                </thead>
                <tbody>
                  ${preVoidDiffsList.map(d => {
                    const isPriv = hidePayField && (d.masked || MONEY_FIELD_RE.test(String(d.key || '') + ' ' + String(d.label || '')));
                    const fStr = isPriv ? tr('Confidential') : (d.from === '' ? '-' : String(d.from));
                    const tStr = isPriv ? tr('Confidential') : (d.to === '' ? '-' : String(d.to));
                    return `
                      <tr>
                        <td class="vlog-diff-field" data-no-i18n="1">${esc(tr(d.label))}</td>
                        <td class="vlog-diff-orig" data-no-i18n="1">${esc(fStr)}</td>
                        <td class="vlog-diff-void" data-no-i18n="1">${esc(tStr)}</td>
                      </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>` : ''}
          ${preVoidTimeline.length ? `
            <div class="vlog-diff-timeline">
              ${preVoidTimeline.map(ev => `
                <div class="vlog-diff-ev" data-no-i18n="1">
                  <span class="vlog-diff-ev-meta">${esc(ev.by || tr('User'))} · ${esc(formatStampShort(ev.at))}</span>
                  <span class="vlog-diff-ev-chg">${esc(ev.summary)}</span>
                </div>`).join('')}
            </div>` : ''}
        </div>`
      : '';

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
        ? `<button type="button" class="btn ${armedCutoffKey === entry.key ? 'btn-danger' : 'btn-primary'}" id="vlogInspectRestoreBtn" data-vlog-drawer-restore="${esc(entry.key)}" data-vlog-insp-restore="${esc(entry.key)}" data-cutoff-blocked="${cascade.isInsuranceCutoffBlocked ? '1' : '0'}">${armedCutoffKey === entry.key ? 'Confirm Bordereau Cutoff Bypass?' : 'Confirm?'}</button>`
        : `<button type="button" class="btn btn-outline-bar" id="vlogInspectRestoreBtn" data-vlog-drawer-restore="${esc(entry.key)}" data-vlog-insp-restore="${esc(entry.key)}" data-cutoff-blocked="${cascade.isInsuranceCutoffBlocked ? '1' : '0'}">${cascade.isInsuranceCutoffBlocked ? 'Restore (Cutoff Warning)' : 'Restore'}</button>`)
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
          ${cascadeHtml}
          ${noteEditorHtml}
          ${twinsSecHtml}
          ${childrenSecHtml}
          ${preVoidSecHtml}
          <div class="vlog-drawer-sec">
            <div class="vlog-drawer-sec-hd"><span>Captured Fields</span></div>
            <div class="vlog-inspect-grid" id="vlogFieldsGrid">
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
    const headers = ['Voided At', 'Record Date', 'Entity', 'Industry', 'Module', 'Record ID', 'Summary', 'Amount (USD)', 'Voided By', 'Origin', 'Reason', 'Pre-Void Edits'];
    const lines = [headers.map(csvSafeCell).join(',')];
    matched.forEach(e => {
      const amtStr = e.amountMasked ? 'Confidential' : (e.amountUsd == null ? '' : String(e.amountUsd));
      const originLbl = e.isPosTill
        ? 'Gate Till'
        : (e.systemKind === 'workbook_match' ? 'Workbook Match' : (e.originGroup === 'system' ? 'Workbook Sync' : 'Manual Void'));
      const preVoidCol = e.hasPreVoidEdits
        ? ((e.fieldDiffs && e.fieldDiffs.length)
          ? e.fieldDiffs.map(d => `${d.label}: ${d.from || '-'} to ${d.to || '-'}`).join('; ')
          : `${e.editCount || 1} revision(s)`)
        : '';
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
        e.voidReason || '',
        preVoidCol
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
    disarmRestoreConfirmations();
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
    filterState.lenses = [];
    filterState.cluster = 'all';
    filterState.drillDay = '';
    filterState.q = '';
    filterState.visibleLimit = PAGE_STEP;
    openCombo = '';
    comboQuery = '';
    disarmRestoreConfirmations();
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
    const topModStr = (stats.topModules || []).slice(0, 3).map(m => `${m.label} (${m.count}, ${formatMaskedBucketUsd(m.usd, m.unmasked, m.masked, '-', false)})`).join('; ');
    const topActStr = (stats.topActors || []).slice(0, 3).map(a => `${a.label} (${a.count})`).join('; ');
    const prompt = `Audit the Void Log for ${activeCo}: ${userCnt} user/till voids (${lc.after_hours || 0} after-hours, ${lc.missing_reason || 0} missing reason, ${lc.high_value || 0} >= $500, ${lc.edited_before_void || 0} edited before void) and ${sysCnt} workbook/system matches. Top modules: ${topModStr || 'none'}. Top actors: ${topActStr || 'none'}. Highlight suspicious patterns, control gaps, and what a supervisor should inspect next.`;
    if (typeof window.MFG_ASK.open === 'function') window.MFG_ASK.open();
    window.MFG_ASK.ask(prompt);
  }

  function closeDigestModal() {
    document.body.classList.remove('is-printing-vlog-digest');
    const existing = document.getElementById('vlogDigestModal');
    if (existing) existing.remove();
  }

  function buildDigestDataset(rangeMode) {
    const u = D && D.activeUser ? D.activeUser() : null;
    const all = collectScopedVoidEntries();
    const stats = applyFiltersAndSort(all);
    const scopeCos = activeScopeCompanies(u);
    const hideCo = scopeCos.length <= 1;
    const nowMs = Date.now();

    let rows = [];
    if (rangeMode === 'current') {
      rows = stats.matched.slice();
    } else {
      const daysBack = rangeMode === '30d' ? 30 : 7;
      const cutoffMs = nowMs - daysBack * 86400000;
      rows = (stats.topbarScoped || []).filter(e => {
        if (e.originGroup === 'system') return false;
        const ms = e.voidedAtMs || parseTimestampMs(e.date);
        return Boolean(ms && ms >= cutoffMs);
      });
    }

    let totalUsd = 0;
    let unmaskedCount = 0;
    let maskedCount = 0;
    let childSkipped = 0;
    let editedCount = 0;
    let afterHoursCount = 0;
    let missingReasonCount = 0;
    let highValueCount = 0;

    const emMap = new Map();
    const actorMap = new Map();
    const flagged = [];

    rows.forEach(e => {
      const hasMissingReason = !String(e.voidReason || '').trim();
      const peakVal = e.peakAbsUsd != null ? e.peakAbsUsd : (e.amountUsd != null ? Math.abs(e.amountUsd) : null);
      const isHighVal = Boolean(!e.amountMasked && peakVal != null && peakVal >= 500);
      if (e.hasPreVoidEdits) editedCount++;
      if (e.afterHours) afterHoursCount++;
      if (hasMissingReason) missingReasonCount++;
      if (isHighVal) highValueCount++;

      const hasUsdVal = !e.amountMasked && !e.isCascadedChild && e.amountUsd !== null && Number.isFinite(e.amountUsd);
      if (e.amountMasked) maskedCount++;
      else if (e.isCascadedChild) childSkipped++;
      else if (hasUsdVal) {
        totalUsd += e.amountUsd;
        unmaskedCount++;
      }

      const emKey = hideCo ? e.moduleLabel : `${e.company || 'Shared'}::${e.moduleLabel}`;
      const curEm = emMap.get(emKey) || { company: e.company || 'Shared', moduleLabel: e.moduleLabel, count: 0, usd: 0, unmasked: 0, masked: 0, edited: 0 };
      curEm.count++;
      if (e.amountMasked) curEm.masked++;
      else if (hasUsdVal) { curEm.usd += Math.abs(e.amountUsd); curEm.unmasked++; }
      if (e.hasPreVoidEdits) curEm.edited++;
      emMap.set(emKey, curEm);

      const ak = e.actorKey || e.voidedBy;
      const curAct = actorMap.get(ak) || { key: ak, label: e.actorDisplay || e.voidedBy, count: 0, usd: 0, unmasked: 0, masked: 0, afterHours: 0, edited: 0 };
      curAct.count++;
      if (e.amountMasked) curAct.masked++;
      else if (hasUsdVal) { curAct.usd += Math.abs(e.amountUsd); curAct.unmasked++; }
      if (e.afterHours) curAct.afterHours++;
      if (e.hasPreVoidEdits) curAct.edited++;
      actorMap.set(ak, curAct);

      if (e.afterHours || e.hasPreVoidEdits || hasMissingReason || isHighVal) {
        const score = (e.hasPreVoidEdits ? 4 : 0) + (isHighVal ? 3 : 0) + (e.afterHours ? 2 : 0) + (hasMissingReason ? 1 : 0);
        flagged.push({ entry: e, isHighVal, hasMissingReason, score });
      }
    });

    const emRows = Array.from(emMap.values()).sort((a, b) => (b.count - a.count) || (b.usd - a.usd));
    const actorRows = Array.from(actorMap.values()).sort((a, b) => (b.count - a.count) || (b.usd - a.usd));
    flagged.sort((a, b) => (b.score - a.score) || ((b.entry.voidedAtMs || 0) - (a.entry.voidedAtMs || 0)));

    return {
      u,
      hideCo,
      rangeMode,
      tbRange: stats.tbRange,
      voidCount: rows.length,
      totalUsd,
      unmaskedCount,
      maskedCount,
      childSkipped,
      editedCount,
      afterHoursCount,
      missingReasonCount,
      highValueCount,
      emRows,
      actorRows,
      flagged: flagged.slice(0, 35),
      flaggedTotal: flagged.length
    };
  }

  function openDigestModal(overrideRange) {
    if (!D || !D.canViewVoidLog || !D.canViewVoidLog(D.activeUser())) return;
    if (overrideRange) digestRange = String(overrideRange);
    closeDigestModal();

    const ds = buildDigestDataset(digestRange);
    const u = ds.u || {};
    const scopeStr = String((D.STATE && D.STATE.company) || '');
    const rawCoLbl = (D.COMPANY_LABELS && D.COMPANY_LABELS[scopeStr]) || (D.getActiveIndustry ? D.getActiveIndustry(scopeStr) : '') || scopeStr || 'All Entities';
    const activeCoLbl = tr(rawCoLbl);
    const activeIndLbl = tr((D.getActiveIndustry && D.getActiveIndustry(scopeStr)) || 'All Industries');
    const actorWho = String(u.full_name || u.name || u.email || 'Supervisor').trim();
    const genAtStr = formatStampShort(new Date().toISOString());

    const rangeLabelMap = {
      '7d': tr('Weekly Digest (Last 7 Days)'),
      '30d': tr('Last 30 Days'),
      'current': tr('Current Filter View')
    };
    const rangePill = (rKey, label) => `<button type="button" class="vlog-seg-btn${digestRange === rKey ? ' active' : ''}" data-vlog-digest-range="${rKey}">${esc(label)}</button>`;

    const emHtml = ds.emRows.length
      ? ds.emRows.map(m => `
          <tr>
            ${ds.hideCo ? '' : `<td data-no-i18n="1">${esc(m.company)}</td>`}
            <td data-no-i18n="1">${esc(tr(m.moduleLabel))}</td>
            <td class="num mono" data-no-i18n="1">${fmtNum(m.count)}</td>
            <td class="num mono" data-no-i18n="1">${fmtNum(m.edited)}</td>
            <td class="num mono" data-no-i18n="1">${esc(formatMaskedBucketUsd(m.usd, m.unmasked, m.masked, '-', true))}</td>
          </tr>`).join('')
      : `<tr><td colspan="${ds.hideCo ? 4 : 5}" class="vlog-digest-empty">${esc(tr('No voided activity in this reporting window.'))}</td></tr>`;

    const actorHtml = ds.actorRows.length
      ? ds.actorRows.map(a => `
          <tr>
            <td data-no-i18n="1">${esc(a.label)}</td>
            <td class="num mono" data-no-i18n="1">${fmtNum(a.count)}</td>
            <td class="num mono" data-no-i18n="1">${fmtNum(a.afterHours)}</td>
            <td class="num mono" data-no-i18n="1">${fmtNum(a.edited)}</td>
            <td class="num mono" data-no-i18n="1">${esc(formatMaskedBucketUsd(a.usd, a.unmasked, a.masked, '-', true))}</td>
          </tr>`).join('')
      : `<tr><td colspan="5" class="vlog-digest-empty">${esc(tr('No actor activity recorded.'))}</td></tr>`;

    const flaggedHtml = ds.flagged.length
      ? ds.flagged.map(({ entry: e, isHighVal, hasMissingReason }) => {
        const flags = [];
        if (e.hasPreVoidEdits) flags.push(tr('Edited Before Void'));
        if (isHighVal) flags.push(L('High Value ($500+)', 'قيمة عالية ($500+)', 'Montant élevé (500 $+)'));
        if (e.afterHours) flags.push(tr('After-Hours'));
        if (hasMissingReason) flags.push(tr('Missing Reason'));
        const amtDisp = e.amountMasked
          ? tr('Confidential')
          : `${e.amountUsd == null ? '-' : formatSignedUsd(e.amountUsd)}${e.hasPreVoidEdits && e.origAmountUsd != null && (e.amountUsd == null || Math.abs(e.origAmountUsd - e.amountUsd) >= 0.01) ? ` (${tr('Orig:')} ${formatSignedUsd(e.origAmountUsd)})` : ''}`;
        return `
          <tr>
            <td class="mono vlog-nowrap" data-no-i18n="1">${esc(formatStampShort(e.voidedAt))}</td>
            ${ds.hideCo ? '' : `<td data-no-i18n="1">${esc(e.company)}</td>`}
            <td data-no-i18n="1"><strong>${esc(e.refCode)}</strong> · ${esc(tr(e.moduleLabel))}${e.partyName ? ` (${esc(e.partyName)})` : ''}</td>
            <td class="num mono vlog-nowrap" data-no-i18n="1">${esc(amtDisp)}</td>
            <td data-no-i18n="1">${esc(flags.join(', '))}</td>
            <td data-no-i18n="1">${esc(e.actorDisplay)} · ${esc(e.voidReason || tr('No reason recorded'))}</td>
          </tr>`;
      }).join('')
      : `<tr><td colspan="${ds.hideCo ? 5 : 6}" class="vlog-digest-empty">${esc(tr('No flagged exceptions in this window.'))}</td></tr>`;

    const modal = document.createElement('div');
    modal.id = 'vlogDigestModal';
    modal.className = 'vlog-modal-backdrop is-digest-modal';
    modal.innerHTML = `
      <div class="vlog-modal vlog-digest-modal" role="dialog" aria-modal="true" aria-labelledby="vlogDigestTitle">
        <div class="vlog-modal-hd vlog-digest-noprint">
          <div class="vlog-drawer-hd-main">
            <h3 id="vlogDigestTitle">Weekly Void Digest</h3>
            <span class="vlog-inspect-sub" data-no-i18n="1">${esc(activeCoLbl)} · ${esc(rangeLabelMap[digestRange] || '')}</span>
          </div>
          <div class="vlog-digest-hd-acts">
            <div class="vlog-seg-group" role="group" aria-label="Digest window">
              ${rangePill('7d', 'Last 7 Days')}
              ${rangePill('30d', 'Last 30 Days')}
              ${rangePill('current', 'Current Filter View')}
            </div>
            <button type="button" class="btn btn-primary vlog-btn-xs" id="vlogDigestPrintBtn">${ic('printer')} Print / Save PDF</button>
            <button type="button" class="vlog-modal-x" id="vlogDigestCloseBtn" aria-label="Close modal">×</button>
          </div>
        </div>
        <div class="vlog-modal-body vlog-digest-sheet" id="vlogDigestSheet">
          <div class="vlog-digest-brand">
            <div>
              <div class="vlog-digest-kicker">ISABI Command Center · Void Audit Digest</div>
              <h2 class="vlog-digest-h2" data-no-i18n="1">${esc(activeCoLbl)}</h2>
              <div class="vlog-digest-meta-row" data-no-i18n="1">
                <span>${esc(tr('Industry'))}: <strong>${esc(activeIndLbl)}</strong></span>
                <span>${esc(tr('Window'))}: <strong>${esc(rangeLabelMap[digestRange] || '')}</strong></span>
                <span>${esc(tr('Prepared By'))}: <strong>${esc(actorWho)}</strong></span>
                <span>${esc(tr('Generated'))}: <strong class="mono">${esc(genAtStr)}</strong></span>
              </div>
            </div>
          </div>
          <div class="vlog-digest-kpis">
            <div class="vlog-digest-kpi">
              <span class="vlog-digest-kpi-lbl">Total Voids</span>
              <strong class="vlog-digest-kpi-val mono" data-no-i18n="1">${fmtNum(ds.voidCount)}</strong>
            </div>
            <div class="vlog-digest-kpi">
              <span class="vlog-digest-kpi-lbl">Voided Value</span>
              <strong class="vlog-digest-kpi-val mono" data-no-i18n="1">${esc(formatMaskedBucketUsd(ds.totalUsd, ds.unmaskedCount, ds.maskedCount, '-', true))}</strong>
            </div>
            <div class="vlog-digest-kpi">
              <span class="vlog-digest-kpi-lbl">Edited Before Void</span>
              <strong class="vlog-digest-kpi-val mono" data-no-i18n="1">${fmtNum(ds.editedCount)}</strong>
            </div>
            <div class="vlog-digest-kpi">
              <span class="vlog-digest-kpi-lbl">After-Hours / No Reason</span>
              <strong class="vlog-digest-kpi-val mono" data-no-i18n="1">${fmtNum(ds.afterHoursCount)} / ${fmtNum(ds.missingReasonCount)}</strong>
            </div>
          </div>
          <div class="vlog-digest-split">
            <div class="vlog-digest-sec">
              <div class="vlog-digest-sec-hd">By Entity &amp; Module</div>
              <table class="data-table vlog-digest-tbl">
                <thead>
                  <tr>
                    ${ds.hideCo ? '' : '<th>Entity</th>'}
                    <th>Module</th>
                    <th class="num">Count</th>
                    <th class="num">Edited</th>
                    <th class="num">Amount</th>
                  </tr>
                </thead>
                <tbody>${emHtml}</tbody>
              </table>
            </div>
            <div class="vlog-digest-sec">
              <div class="vlog-digest-sec-hd">By Void Actor</div>
              <table class="data-table vlog-digest-tbl">
                <thead>
                  <tr>
                    <th>Voided By</th>
                    <th class="num">Count</th>
                    <th class="num">After-Hours</th>
                    <th class="num">Edited</th>
                    <th class="num">Amount</th>
                  </tr>
                </thead>
                <tbody>${actorHtml}</tbody>
              </table>
            </div>
          </div>
          <div class="vlog-digest-sec">
            <div class="vlog-digest-sec-hd">
              <span>Flagged Exception Register</span>
              <span class="mono" data-no-i18n="1">${esc(ds.flaggedTotal > 35 ? L(`Top 35 of ${fmtNum(ds.flaggedTotal)}`, `أعلى 35 من ${fmtNum(ds.flaggedTotal)}`, `Top 35 sur ${fmtNum(ds.flaggedTotal)}`) : fmtNum(ds.flaggedTotal))}</span>
            </div>
            <table class="data-table vlog-digest-tbl">
              <thead>
                <tr>
                  <th>Voided At</th>
                  ${ds.hideCo ? '' : '<th>Entity</th>'}
                  <th>Reference &amp; Module</th>
                  <th class="num">Amount</th>
                  <th>Flags</th>
                  <th>Actor &amp; Reason</th>
                </tr>
              </thead>
              <tbody>${flaggedHtml}</tbody>
            </table>
          </div>
          <div class="vlog-digest-signoff">
            <div class="vlog-digest-sign-box"><span>Prepared By</span><div class="vlog-sign-line"></div></div>
            <div class="vlog-digest-sign-box"><span>Operations / Finance Review</span><div class="vlog-sign-line"></div></div>
            <div class="vlog-digest-sign-box"><span>Owner / External Audit Sign-Off</span><div class="vlog-sign-line"></div></div>
          </div>
        </div>
        <div class="vlog-modal-ft vlog-digest-noprint">
          <button type="button" class="btn btn-ghost-bar" id="vlogDigestDoneBtn">Close</button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    const lc = lang();
    if (lc !== 'en' && window.MFG_I18N && typeof window.MFG_I18N.translateDom === 'function') {
      try { window.MFG_I18N.translateDom(modal, lc); } catch (_) {}
    }
    const closeBtn = document.getElementById('vlogDigestCloseBtn');
    if (closeBtn) closeBtn.focus();
  }

  function wireDelegationOnce() {
    if (wired) return;
    wired = true;

    window.addEventListener('mfg:lang-changed', () => {
      if (aiPanelOpen) {
        cancelPendingAiSummary();
        aiRequestGen += 1;
        aiCloudState = { loading: false, sig: '', attemptedSig: '', text: '', mode: '', recs: [], error: '' };
      }
      if (document.getElementById('vlogRoot')) patchResultsInPlace();
      if (inspectKey && document.getElementById('vlogInspectModal')) {
        const cur = findEntryByKey(inspectKey);
        if (cur) openInspectModal(cur);
      }
      if (document.getElementById('vlogDigestModal')) openDigestModal();
    });

    window.addEventListener('beforeprint', () => {
      if (document.getElementById('vlogDigestModal')) {
        document.body.classList.add('is-printing-vlog-digest');
      }
    });

    window.addEventListener('afterprint', () => {
      document.body.classList.remove('is-printing-vlog-digest');
    });

    document.addEventListener('click', async e => {
      const digestModal = document.getElementById('vlogDigestModal');
      if (digestModal && (e.target === digestModal || digestModal.contains(e.target))) {
        if (e.target === digestModal || e.target.closest('#vlogDigestCloseBtn') || e.target.closest('#vlogDigestDoneBtn')) {
          closeDigestModal();
          return;
        }
        const rangeBtn = e.target.closest('[data-vlog-digest-range]');
        if (rangeBtn) {
          digestRange = rangeBtn.getAttribute('data-vlog-digest-range') || '7d';
          openDigestModal(digestRange);
          return;
        }
        if (e.target.closest('#vlogDigestPrintBtn')) {
          document.body.classList.add('is-printing-vlog-digest');
          const isHeadless = Boolean(navigator.webdriver || window.__MFG_HEADLESS_TEST);
          if (!isHeadless && typeof window.print === 'function') {
            try { window.print(); } catch (_) {}
            setTimeout(() => document.body.classList.remove('is-printing-vlog-digest'), 1200);
          }
          return;
        }
        return;
      }

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
          const cur = findEntryByKey(key);
          if (!cur || inFlightKeys.has(key)) return;
          const isCutoff = dRest.getAttribute('data-cutoff-blocked') === '1';
          if (isCutoff && armedCutoffKey !== key) {
            armedCutoffKey = key;
            armedRestoreKey = key;
            dRest.setAttribute('data-no-i18n', '1');
            dRest.classList.remove('btn-outline-bar', 'btn-primary');
            dRest.classList.add('btn-danger');
            dRest.textContent = tr('Confirm Bordereau Cutoff Bypass?');
            const c = computeVoidCascadePreview(cur);
            if (D && D.toast && c.cutoffReason) D.toast(c.cutoffReason, 'warn');
            patchResultsInPlace();
            return;
          }
          if (!isCutoff && armedRestoreKey !== key) {
            armedRestoreKey = key;
            dRest.setAttribute('data-no-i18n', '1');
            dRest.classList.remove('btn-outline-bar', 'btn-danger');
            dRest.classList.add('btn-primary');
            dRest.textContent = tr('Confirm?');
            patchResultsInPlace();
            return;
          }
          await handleRestore(cur);
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

      if (e.target.closest('#vlogAiPatternBtn')) {
        aiPanelOpen = !aiPanelOpen;
        if (!aiPanelOpen) {
          cancelPendingAiSummary();
          filterState.cluster = 'all';
          aiRequestGen += 1;
          aiCloudState = { loading: false, sig: '', attemptedSig: '', text: '', mode: '', recs: [], error: '' };
        }
        disarmRestoreConfirmations();
        patchResultsInPlace();
        if (aiPanelOpen) {
          const allE = collectScopedVoidEntries();
          const { preClusterMatched } = applyFiltersAndSort(allE);
          const activeInd = resolveActiveVoidInd('', (D && D.STATE && D.STATE.company) || '');
          const localSt = buildLocalVoidPatternSummary(preClusterMatched, activeInd);
          requestCloudVoidSummary(localSt, preClusterMatched);
        }
        return;
      }

      if (e.target.closest('#vlogAiCloseBtn')) {
        cancelPendingAiSummary();
        aiPanelOpen = false;
        aiRequestGen += 1;
        aiCloudState = { loading: false, sig: '', attemptedSig: '', text: '', mode: '', recs: [], error: '' };
        filterState.cluster = 'all';
        disarmRestoreConfirmations();
        patchResultsInPlace();
        return;
      }

      const clBtn = e.target.closest('[data-vlog-cluster]');
      if (clBtn) {
        const ck = clBtn.getAttribute('data-vlog-cluster') || 'all';
        filterState.cluster = (filterState.cluster === ck && ck !== 'all') ? 'all' : ck;
        disarmRestoreConfirmations();
        patchResultsInPlace();
        return;
      }

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
        disarmRestoreConfirmations();
        patchResultsInPlace();
        return;
      }

      const kpiBtn = e.target.closest('[data-vlog-kpi]');
      if (kpiBtn) {
        const which = kpiBtn.getAttribute('data-vlog-kpi');
        if (which === 'user') {
          filterState.origin = 'user';
          filterState.lenses = [];
          filterState.days = 'all';
          filterState.drillDay = '';
        } else if (which === 'value') {
          if (hasLens('high_value')) {
            toggleLens('high_value');
          } else {
            toggleLens('high_value');
            filterState.sortKey = 'amount';
            filterState.sortDir = 'desc';
          }
        } else if (which === 'recent') {
          filterState.days = filterState.days === '7' ? 'all' : '7';
        } else if (which === 'system') {
          filterState.origin = filterState.origin === 'system' ? 'user' : 'system';
          filterState.lenses = [];
          filterState.days = 'all';
          filterState.drillDay = '';
        }
        filterState.visibleLimit = PAGE_STEP;
        disarmRestoreConfirmations();
        editingNoteKey = '';
        patchResultsInPlace();
        return;
      }

      const origBtn = e.target.closest('[data-vlog-origin]');
      if (origBtn) {
        filterState.origin = origBtn.getAttribute('data-vlog-origin') || 'user';
        filterState.visibleLimit = PAGE_STEP;
        disarmRestoreConfirmations();
        editingNoteKey = '';
        patchResultsInPlace();
        return;
      }

      const dayBtn = e.target.closest('[data-vlog-days]');
      if (dayBtn) {
        filterState.days = dayBtn.getAttribute('data-vlog-days') || 'all';
        filterState.drillDay = '';
        filterState.visibleLimit = PAGE_STEP;
        disarmRestoreConfirmations();
        editingNoteKey = '';
        patchResultsInPlace();
        return;
      }

      const lensBtn = e.target.closest('[data-vlog-lens]');
      if (lensBtn) {
        const nextL = lensBtn.getAttribute('data-vlog-lens') || 'all';
        toggleLens(nextL);
        filterState.visibleLimit = PAGE_STEP;
        disarmRestoreConfirmations();
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

      if (e.target.closest('#vlogDigestBtn')) {
        openDigestModal();
        return;
      }

      if (e.target.closest('#vlogRefreshBtn')) {
        disarmRestoreConfirmations();
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
        disarmRestoreConfirmations();
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
        const entry = findEntryByKey(key);
        const cascade = entry ? computeVoidCascadePreview(entry) : { isInsuranceCutoffBlocked: false };
        if (cascade.isInsuranceCutoffBlocked && armedCutoffKey !== key) {
          armedCutoffKey = key;
          armedRestoreKey = key;
          if (D && D.toast && cascade.cutoffReason) D.toast(cascade.cutoffReason, 'warn');
          patchResultsInPlace();
          return;
        }
        if (armedRestoreKey !== key) {
          armedRestoreKey = key;
          patchResultsInPlace();
          return;
        }
        disarmRestoreConfirmations();
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
        disarmRestoreConfirmations();
        patchResultsInPlace();
      } else if (e.target.id === 'vlogActorSelect') {
        filterState.actor = e.target.value || 'all';
        filterState.visibleLimit = PAGE_STEP;
        disarmRestoreConfirmations();
        patchResultsInPlace();
      }
    });

    document.addEventListener('input', e => {
      if (e.target && e.target.id === 'vlogSearchInput') {
        filterState.q = e.target.value || '';
        filterState.visibleLimit = PAGE_STEP;
        disarmRestoreConfirmations();
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
        if (document.getElementById('vlogDigestModal')) {
          e.preventDefault();
          closeDigestModal();
          return;
        }
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
    disarmRestoreConfirmations();
    editingNoteKey = '';
    openCombo = '';
    comboQuery = '';
    lastMatchedKeys = [];
    cancelPendingAiSummary();
    aiPanelOpen = false;
    aiRequestGen += 1;
    aiCloudState = { loading: false, sig: '', attemptedSig: '', text: '', mode: '', recs: [], error: '' };
    inFlightKeys.clear();
    Object.assign(filterState, DEFAULT_FILTERS, { lenses: [] });
    closeInspectModal();
    closeDigestModal();
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
    init,
    reset,
    renderView,
    collectScopedVoidEntries,
    refreshPosVoids,
    ensurePosVoidsLoaded,
    wireSentinelContainer,
    buildVoidSentinelItem,
    renderSentinelVoidPanelHtml,
    computeVoidSentinelDigest,
    computeVoidCascadePreview,
    openInspectModal,
    openDigestModal,
    jumpToVoidEntry,
    exportCsv
  };
})();
