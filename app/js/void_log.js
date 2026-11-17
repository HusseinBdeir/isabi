/* ============================================================================
   ISABI Systems - Void Log Audit & Restore Center (js/void_log.js)
   - View `void_log` (Sentinels & Alerts hub): strict Supervisor & Owner access only.
   - Aggregates soft tombstones across Manufacturing/Shared SQL tables, the 5 sibling
     industries (custom rows + edit tombstones), and Hospitality POS gate-till voids.
   - Enforces company, industry, table, and payroll dollar confidentiality RLS.
   window.MFG_VOID_LOG = { init, reset, renderView, collectScopedVoidEntries, refreshPosVoids }
   ============================================================================ */
(function () {
  'use strict';

  const MODULE_LABELS = {
    sales_tickets: 'Sales & Deliveries',
    raw_purchases: 'Quarry & Haulage',
    expenses: 'Expenses & Overhead',
    expense_items: 'Expense Line Items',
    customer_receipts: 'Customer Receipts',
    supplier_payments: 'Supplier Payments',
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

  const PAYROLL_CONFIDENTIAL_TABLES = new Set([
    'salaries', 'employments', 'freelance_entries', 'logistics_allowances', 'overtime_rates', 'salary_payments'
  ]);

  const MFG_COMPANIES = ['WTC', 'BBConstruction', 'Lions Transport'];
  const HOSPITALITY_COMPANIES = ['Blanca', 'La Una', 'Palms', 'Voile', 'Platinum'];
  const CHRONO_BUCKETS = new Set([
    'ins_agreements', 're_leases', 'trd_targets', 'hsp_tariffs', 'hld_partners', 'hld_loans'
  ]);
  const DEFAULT_FILTERS = {
    origin: 'user',
    days: 'all',
    module: 'all',
    actor: 'all',
    q: '',
    sortKey: 'voided_at',
    sortDir: 'desc'
  };

  let D = null;
  let wired = false;
  let armedRestoreKey = '';
  let editingNoteKey = '';
  let inspectKey = '';
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

  function humanizeModule(rawKey, fallbackTitle) {
    const k = String(rawKey || '').trim();
    if (k && Object.prototype.hasOwnProperty.call(MODULE_LABELS, k)) return MODULE_LABELS[k];
    const fb = String(fallbackTitle || '').replace(/\(\d+[^)]*\)/g, '').trim();
    if (fb && !/^[a-z0-9_]+$/.test(fb)) return fb;
    if (!k) return 'Ledger Record';
    return k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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

  function formatSignedUsd(val) {
    const n = Number(val || 0);
    if (!Number.isFinite(n)) return '$0';
    const r = Math.round(n * 100) / 100;
    return `${r < 0 ? '-$' : '$'}${fmtNum(Math.abs(r))}`;
  }

  function formatStampShort(raw) {
    const s = String(raw || '').trim();
    if (!s) return 'N/A';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const hasTz = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(s);
    if (!hasTz) {
      const m = /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/.exec(s);
      if (m) return `${m[1]} ${m[2]}`;
    }
    const ms = parseTimestampMs(s);
    if (!ms) {
      const m = /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/.exec(s);
      return m ? `${m[1]} ${m[2]}` : s.slice(0, 20);
    }
    const dt = new Date(ms);
    const pad2 = n => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
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
      // Single-entity selection still shows shared registries (sites, products) when table RLS permits
      if (indRaw && activeInd && indRaw !== activeInd) return false;
    }
    if (indRaw && D.canAccessGeoIndustry && !D.canAccessGeoIndustry(indRaw, u)) return false;
    if (activeInd && indRaw && scopeStr.startsWith('industry:') && indRaw !== activeInd) return false;
    return true;
  }

  function getSyntheticDemoVoids(u) {
    if (!D || !D.isDemoScopeActive()) return [];
    const scopeCos = activeScopeCompanies(u);
    const activeInd = D.getActiveIndustry ? D.getActiveIndustry(D.STATE.company) : 'Manufacturing';
    const firstCo = scopeCos[0] || (activeInd === 'Hospitality & Resorts' ? 'La Una' : 'WTC');
    const secondCo = scopeCos[1] || firstCo;
    const todayIso = new Date().toISOString().slice(0, 10);
    const yesterdayIso = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const out = [
      {
        key: 'demo::user-1',
        sourceKind: 'demo',
        originGroup: 'user',
        id: 'DEMO-VOID-1042',
        crKey: 'sales_tickets',
        moduleLabel: activeInd === 'Hospitality & Resorts' ? 'Venue & Chalet Close' : 'Sales & Deliveries',
        company: firstCo,
        industry: activeInd,
        date: todayIso,
        summary: activeInd === 'Hospitality & Resorts' ? 'Cabana C-04 Duplicate Billing' : 'Ticket #1042 · Duplicate dispatch entry',
        amountUsd: 1280,
        amountMasked: false,
        voidedBy: 'Supervisor Demo',
        voidedAt: `${todayIso} 14:22`,
        voidedAtMs: parseTimestampMs(`${todayIso}T14:22:00`),
        voidReason: 'Duplicate entry entered under wrong shift',
        noteUpdatedBy: '',
        noteUpdatedAt: '',
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
        originGroup: activeInd === 'Hospitality & Resorts' ? 'pos' : 'user',
        id: 'DEMO-VOID-1039',
        crKey: activeInd === 'Hospitality & Resorts' ? 'pos_till' : 'expenses',
        moduleLabel: activeInd === 'Hospitality & Resorts' ? 'POS Gate Till' : 'Expenses & Overhead',
        company: secondCo,
        industry: activeInd,
        date: yesterdayIso,
        summary: activeInd === 'Hospitality & Resorts' ? '#409 · 2x Adult Ticket, 1x Sunbed' : 'EXP-409 · Cancelled fuel filter invoice',
        amountUsd: 95,
        amountMasked: false,
        voidedBy: activeInd === 'Hospitality & Resorts' ? 'Gate Cashier Demo' : 'Supervisor Demo',
        voidedAt: `${yesterdayIso} 22:48`,
        voidedAtMs: parseTimestampMs(`${yesterdayIso}T22:48:00`),
        voidReason: activeInd === 'Hospitality & Resorts' ? 'Guest changed ticket count at gate' : 'Supplier re-issued corrected VAT invoice',
        noteUpdatedBy: '',
        noteUpdatedAt: '',
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
        originGroup: 'system',
        id: 'DEMO-RECON-771',
        crKey: 'sales_tickets',
        moduleLabel: 'Sales & Deliveries',
        company: firstCo,
        industry: activeInd,
        date: yesterdayIso,
        summary: 'SP-771 · Workbook Reconciliation Match',
        amountUsd: 420,
        amountMasked: false,
        voidedBy: 'SharePoint Recon',
        voidedAt: `${yesterdayIso} 08:10`,
        voidedAtMs: parseTimestampMs(`${yesterdayIso}T08:10:00`),
        voidReason: 'Superseded by updated parallel-run ledger row',
        noteUpdatedBy: '',
        noteUpdatedAt: '',
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
    const scopeStr = String((D.STATE && D.STATE.company) || '');
    const activeInd = D.getActiveIndustry ? D.getActiveIndustry(scopeStr) : 'Manufacturing';
    const scopeCos = activeScopeCompanies(u);
    const scopeSet = new Set(scopeCos.map(c => String(c || '').toLowerCase().replace(/\s+/g, ' ').trim()).filter(Boolean));
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

    // Pre-index ALL voided Mfg + sibling domain parents so cascaded line items / docs stay deduplicated & un-orphanable
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
          // Only surface archived rows that still remain absent from live non-voided seed
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

        const reasonRaw = String(rec.void_reason || rec.voidReason || '').trim();
        const reasonL = reasonRaw.toLowerCase();
        const byRaw = String(rec.voided_by || rec.voidedBy || rec.modified_by || '').trim();
        const byL = byRaw.toLowerCase();
        const isSystemRecon = Boolean(
          rec.twin_of ||
          byL === 'sharepoint recon' ||
          byL === 'door tablet' ||
          reasonL.startsWith('sharepoint_recon') ||
          reasonL === 'door_tablet' ||
          String(rec.origin || '').toLowerCase() === 'door_tablet_void'
        );

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

        const voidedAtRaw = String(rec.voided_at || rec.voidedAt || rec.modified_at || rec.updated_at || '').trim();
        const masked = isPayrollTable && !canModifyDollars;
        const amtUsd = masked ? null : extractRecordAmountUsd(rec, crKey);

        entries.push({
          key: uniqKey,
          sourceKind: 'custom_record',
          originGroup: isSystemRecon ? 'system' : 'user',
          crKey,
          id: rid,
          moduleLabel: humanizeModule(crKey, ''),
          company: meta.company || 'Shared',
          industry: meta.industry,
          date: String(rec.date || rec.start_date || rec.rep_date || rec.day || '').slice(0, 10),
          summary: buildRecordSummary(rec, crKey),
          amountUsd: amtUsd,
          amountMasked: masked,
          voidedBy: byRaw || (isSystemRecon ? 'System' : 'Supervisor'),
          voidedAt: voidedAtRaw,
          voidedAtMs: parseTimestampMs(voidedAtRaw),
          voidReason: rec.twin_of ? (reasonRaw || `Matched twin ${rec.twin_of}`) : reasonRaw,
          noteUpdatedBy: String(rec.void_note_updated_by || ''),
          noteUpdatedAt: String(rec.void_note_updated_at || ''),
          isCascadedChild,
          hasVoidedParent,
          isPosTill: false,
          canRestore: Boolean(userCanVoid && !isSystemRecon && !hasVoidedParent),
          canEditNote: Boolean(userCanVoid && !isSystemRecon),
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
        const amtUsd = extractDomainAmountUsd(r) ?? (ed ? extractDomainAmountUsd(ed) : null) ?? extractDomainAmountUsd(snap);
        const isChronoBucket = CHRONO_BUCKETS.has(bucket);

        entries.push({
          key: uniqKey,
          sourceKind: 'ind_custom',
          originGroup: isTillAutoRow ? 'system' : 'user',
          crKey: bucket,
          bucket,
          editKey,
          primaryId: pid,
          id: pid,
          moduleLabel: humanizeModule(bucket, snap.tableTitle || (ed && ed.tableTitle) || r.tableTitle),
          company: coEff || 'Shared',
          industry: meta.industry,
          date: String(r.date || r.start_date || r.day || snap.date || (ed && ed.date) || '').slice(0, 10),
          summary: String([pid, r.counterparty || snap.counterparty || (ed && ed.counterparty) || r.customer || r.supplier || r.tenant || r.entity || r.outlet || r.notes || ''].filter(Boolean).join(' · ')).slice(0, 140),
          amountUsd: amtUsd,
          amountMasked: false,
          voidedBy: voidByRaw,
          voidedAt: voidedAtRaw,
          voidedAtMs: parseTimestampMs(voidedAtRaw),
          voidReason: reasonRaw,
          noteUpdatedBy: String(r.void_note_updated_by || (ed && ed.void_note_updated_by) || ''),
          noteUpdatedAt: String(r.void_note_updated_at || (ed && ed.void_note_updated_at) || ''),
          isCascadedChild: false,
          hasVoidedParent: false,
          isPosTill: false,
          canRestore: Boolean(userCanVoid && !isTillAutoRow && (!isChronoBucket || canRestoreChrono)),
          canEditNote: Boolean(userCanVoid && !isTillAutoRow),
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
      const amtUsd = extractDomainAmountUsd(ed);

      entries.push({
        key: uniqKey,
        sourceKind: 'ind_edit',
        originGroup: isTillAutoRow ? 'system' : 'user',
        crKey: tblKeyEff,
        bucket: '',
        editKey: ek,
        primaryId: pid,
        id: pid,
        moduleLabel: humanizeModule(tblKeyEff, tblTitleEff),
        company: meta.company || 'Shared',
        industry: meta.industry,
        date: String(snap.date || ed.date || '').slice(0, 10),
        summary: String([pid, snap.counterparty || ed.counterparty || ''].filter(Boolean).join(' · ')).slice(0, 140),
        amountUsd: amtUsd,
        amountMasked: false,
        voidedBy: voidByRaw,
        voidedAt: voidedAtRaw,
        voidedAtMs: parseTimestampMs(voidedAtRaw),
        voidReason: reasonRaw,
        noteUpdatedBy: String(ed.void_note_updated_by || ''),
        noteUpdatedAt: String(ed.void_note_updated_at || ''),
        isCascadedChild: false,
        hasVoidedParent: false,
        isPosTill: false,
        canRestore: Boolean(userCanVoid && !isTillAutoRow),
        canEditNote: Boolean(userCanVoid && !isTillAutoRow),
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
        entries.push({
          key: uniqKey,
          sourceKind: 'pos_till',
          originGroup: 'pos',
          crKey: 'pos_till',
          id: String(pv.id),
          moduleLabel: 'POS Gate Till',
          company: co || 'La Una',
          industry: 'Hospitality & Resorts',
          date: String(pv.day || '').slice(0, 10),
          summary: `${ticketLabel} · ${pv.summary || 'Gate Till Sale'}`,
          amountUsd: Number.isFinite(Number(pv.total_usd)) ? Math.round(Number(pv.total_usd) * 100) / 100 : null,
          amountMasked: false,
          voidedBy: String(pv.voided_by || pv.user_name || 'Till Cashier'),
          voidedAt: voidedAtRaw,
          voidedAtMs: parseTimestampMs(voidedAtRaw),
          voidReason: String(pv.void_reason || ''),
          noteUpdatedBy: '',
          noteUpdatedAt: '',
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

  function applyFiltersAndSort(allEntries) {
    const nowMs = Date.now();
    const todayIso = localTodayIso();
    const origin = filterState.origin || 'user';
    const daysWin = filterState.days || 'all';
    const modF = filterState.module || 'all';
    const actorF = filterState.actor || 'all';
    const q = String(filterState.q || '').trim().toLowerCase();

    const originFiltered = allEntries.filter(e => {
      if (origin === 'user') return e.originGroup === 'user' || e.originGroup === 'pos';
      if (origin === 'system') return e.originGroup === 'system';
      return true;
    });

    const dateFiltered = originFiltered.filter(e => {
      if (daysWin === 'all') return true;
      if (daysWin === 'today') {
        return String(e.voidedAt || '').slice(0, 10) === todayIso || String(e.date || '').slice(0, 10) === todayIso;
      }
      const d = Number(daysWin);
      if (!Number.isFinite(d) || d <= 0) return true;
      const ms = e.voidedAtMs || parseTimestampMs(e.date);
      if (!ms) return false;
      return (nowMs - ms) <= d * 86400000;
    });

    // Hard Rule 11: frequency-first option ranking (count DESC)
    const modCounts = new Map();
    const actorCounts = new Map();
    dateFiltered.forEach(e => {
      modCounts.set(e.moduleLabel, (modCounts.get(e.moduleLabel) || 0) + 1);
      actorCounts.set(e.voidedBy, (actorCounts.get(e.voidedBy) || 0) + 1);
    });
    const moduleOptions = Array.from(modCounts.entries()).sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1));
    const actorOptions = Array.from(actorCounts.entries()).sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1));

    const matched = dateFiltered.filter(e => {
      if (modF !== 'all' && e.moduleLabel !== modF) return false;
      if (actorF !== 'all' && e.voidedBy !== actorF) return false;
      if (q) {
        const hay = `${e.id} ${e.company} ${e.moduleLabel} ${e.summary} ${e.voidedBy} ${e.voidReason} ${e.date} ${e.voidedAt}`.toLowerCase();
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
        if (sk === 'actor') return String(x.voidedBy || '');
        return String(x.voidedAt || '');
      };
      const sa = getStr(a).toLowerCase();
      const sb = getStr(b).toLowerCase();
      if (sa === sb) return 0;
      return (sa < sb ? -1 : 1) * dir;
    });

    return { matched, moduleOptions, actorOptions, totalInOrigin: originFiltered.length };
  }

  function renderKpiStripHtml(allEntries, filteredEntries) {
    const userTillRows = allEntries.filter(e => e.originGroup === 'user' || e.originGroup === 'pos');
    const systemRows = allEntries.filter(e => e.originGroup === 'system');
    const weekCutoff = Date.now() - 7 * 86400000;
    const recentRows = userTillRows.filter(e => (e.voidedAtMs || parseTimestampMs(e.date)) >= weekCutoff);
    const afterHoursCount = userTillRows.filter(e => e.afterHours).length;

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

    return `
      <div class="vlog-kpi-grid" id="vlogKpiStrip">
        <div class="vlog-kpi-card">
          <span class="vlog-kpi-lbl">User &amp; Till Voids</span>
          <strong class="vlog-kpi-val" data-no-i18n="1">${fmtNum(userTillRows.length)}</strong>
          <span class="vlog-kpi-sub" data-no-i18n="1">${fmtNum(scopedPosCount)} ${esc(L('POS till', 'صندوق التذاكر', 'caisse PDV'))}</span>
        </div>
        <div class="vlog-kpi-card">
          <span class="vlog-kpi-lbl">Voided Value</span>
          <strong class="vlog-kpi-val mono" data-no-i18n="1">${esc(formatSignedUsd(totalUsd))}</strong>
          <span class="vlog-kpi-sub" data-no-i18n="1">${esc(subUsd)}</span>
        </div>
        <div class="vlog-kpi-card">
          <span class="vlog-kpi-lbl">Last 7 Days</span>
          <strong class="vlog-kpi-val" data-no-i18n="1">${fmtNum(recentRows.length)}</strong>
          <span class="vlog-kpi-sub" data-no-i18n="1">${fmtNum(afterHoursCount)} ${esc(L('after-hours', 'خارج الدوام', 'hors horaires'))}</span>
        </div>
        <div class="vlog-kpi-card">
          <span class="vlog-kpi-lbl">Workbook / System Matches</span>
          <strong class="vlog-kpi-val" data-no-i18n="1">${fmtNum(systemRows.length)}</strong>
          <span class="vlog-kpi-sub" data-no-i18n="1">${fmtNum(allEntries.length)} ${esc(L('total in scope', 'الإجمالي ضمن النطاق', 'au total'))}</span>
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
      .concat(actorOptions.map(([lbl, cnt]) => `<option value="${esc(lbl)}"${filterState.actor === lbl ? ' selected' : ''} data-no-i18n="1">${esc(lbl)} (${fmtNum(cnt)})</option>`))
      .join('');
  }

  function syncToolbarSelectOptions(moduleOptions, actorOptions) {
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
      if (filterState.actor !== 'all' && !actorOptions.some(([l]) => l === filterState.actor)) {
        filterState.actor = 'all';
      }
      actorSelEl.value = filterState.actor;
    }
  }

  function renderResultsTableHtml(entries, u) {
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

    const colSpanTotal = hideCo ? 8 : 9;
    const bodyHtml = entries.length
      ? entries.map(e => {
        const originBadges = [];
        if (e.isPosTill) originBadges.push('<span class="vlog-badge vlog-badge-brass">From the till</span>');
        else if (e.originGroup === 'system') originBadges.push('<span class="vlog-badge vlog-badge-mu">Workbook Match</span>');
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
            : '<span class="vlog-muted" data-no-i18n="1">-</span>');

        const restoreBtn = e.canRestore
          ? (armedRestoreKey === e.key
            ? `<button type="button" class="btn btn-primary vlog-btn-xs" data-vlog-restore="${esc(e.key)}">Confirm?</button>`
            : `<button type="button" class="btn btn-outline-bar vlog-btn-xs" data-vlog-restore="${esc(e.key)}">Restore</button>`)
          : '';
        const noteBtn = (e.canEditNote && !isEditingNote)
          ? `<button type="button" class="btn btn-ghost-bar vlog-btn-xs" data-vlog-note-edit="${esc(e.key)}">${e.voidReason ? 'Edit Note' : 'Add Note'}</button>`
          : '';

        return `
          <tr data-vlog-row="${esc(e.key)}">
            <td class="mono vlog-nowrap" data-no-i18n="1">${esc(formatStampShort(e.voidedAt))}</td>
            <td class="mono vlog-nowrap" data-no-i18n="1">${esc(e.date || '-')}</td>
            ${hideCo ? '' : `<td data-no-i18n="1">${esc(e.company)}</td>`}
            <td><span class="vlog-mod-lbl">${esc(e.moduleLabel)}</span></td>
            <td class="vlog-summary-cell" data-no-i18n="1">${esc(e.summary)}</td>
            <td class="num">${formatAmountCell(e)}</td>
            <td data-no-i18n="1">${esc(e.voidedBy)}</td>
            <td>
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
    let { matched, moduleOptions, actorOptions } = applyFiltersAndSort(allEntries);

    const modOptsHtml = buildModuleSelectOptionsHtml(moduleOptions);
    const actorOptsHtml = buildActorSelectOptionsHtml(actorOptions);

    const originBtn = (val, label) => `<button type="button" class="vlog-seg-btn${filterState.origin === val ? ' active' : ''}" data-vlog-origin="${val}">${label}</button>`;
    const dayBtn = (val, label) => `<button type="button" class="vlog-seg-btn${filterState.days === val ? ' active' : ''}" data-vlog-days="${val}">${label}</button>`;

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
            <button type="button" class="btn btn-ghost-bar" id="vlogRefreshBtn">${ic('rotate')} Refresh</button>
            <button type="button" class="btn btn-outline-bar" id="vlogExportCsvBtn">${ic('download')} Export CSV</button>
          </div>
        </div>
        <div id="vlogPosNoticeMount">${renderPosNoticeHtml(u)}</div>
        <div id="vlogKpiMount">${renderKpiStripHtml(allEntries, matched)}</div>
        <div class="vlog-toolbar panel-card" id="vlogToolbar">
          <div class="vlog-seg-group" role="group" aria-label="Filter void source">
            ${originBtn('user', 'User &amp; Till Voids')}
            ${originBtn('system', 'Workbook &amp; System')}
            ${originBtn('all', 'All Voids')}
          </div>
          <div class="vlog-seg-group" role="group" aria-label="Filter void date range">
            ${dayBtn('all', 'All Dates')}
            ${dayBtn('today', 'Today')}
            ${dayBtn('7', '7 Days')}
            ${dayBtn('30', '30 Days')}
            ${dayBtn('90', '90 Days')}
          </div>
          <div class="vlog-select-row">
            <select id="vlogModuleSelect" class="vlog-select" aria-label="Filter by module">${modOptsHtml}</select>
            <select id="vlogActorSelect" class="vlog-select" aria-label="Filter by actor">${actorOptsHtml}</select>
            <input type="search" id="vlogSearchInput" class="vlog-search" value="${esc(filterState.q)}" placeholder="Search reference, actor, entity, or reason" aria-label="Search voided entries">
          </div>
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
    let { matched, moduleOptions, actorOptions } = applyFiltersAndSort(allEntries);
    syncToolbarSelectOptions(moduleOptions, actorOptions);
    if ((filterState.module === 'all' || filterState.actor === 'all') && matched.length === 0 && allEntries.length > 0) {
      ({ matched, moduleOptions, actorOptions } = applyFiltersAndSort(allEntries));
    }
    const kpiMount = document.getElementById('vlogKpiMount');
    if (kpiMount) kpiMount.innerHTML = renderKpiStripHtml(allEntries, matched);
    const resMount = document.getElementById('vlogResultsRegion');
    if (resMount) resMount.innerHTML = renderResultsTableHtml(matched, u);
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

  function closeInspectModal() {
    inspectKey = '';
    const existing = document.getElementById('vlogInspectModal');
    if (existing) existing.remove();
  }

  function openInspectModal(entry) {
    if (!entry) return;
    closeInspectModal();
    inspectKey = entry.key;
    const u = D.activeUser();
    const showPayroll = D.canViewPayrollDollarAmounts ? D.canViewPayrollDollarAmounts(u) : false;
    const hidePayField = PAYROLL_CONFIDENTIAL_TABLES.has(entry.crKey) && !showPayroll;
    const raw = entry.raw && typeof entry.raw === 'object' ? entry.raw : {};
    const snap = (raw.void_snapshot && typeof raw.void_snapshot === 'object') ? raw.void_snapshot : {};
    const skipMeta = new Set(['_seed_orig', 'payload_json', 'face_samples', 'pin_code', 'headers', 'cells', 'lines', 'void_snapshot']);
    const moneyFieldRe = /amount|salary|wage|allowance|rate|usd|lbp|total|net|gross|paid|price|cost|bonus|deduct|reimbursement|advance|nssf|stipend|commission/i;
    const detailRows = [];

    detailRows.push(['Record ID', entry.id]);
    detailRows.push(['Entity', entry.company]);
    detailRows.push(['Industry', entry.industry]);
    detailRows.push(['Module', entry.moduleLabel]);
    detailRows.push(['Record Date', entry.date || '-']);
    detailRows.push(['Voided By', entry.voidedBy]);
    detailRows.push(['Voided At', formatStampShort(entry.voidedAt)]);
    if (entry.voidReason) detailRows.push(['Void Reason', entry.voidReason]);
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
        const disp = (hidePayField && moneyFieldRe.test(k)) ? tr('Confidential') : String(v);
        detailRows.push([lbl, disp]);
      });
    }

    if (Array.isArray(raw.lines) && raw.lines.length) {
      const linesSummary = raw.lines.map(l => `${l.qty || 1}x ${l.name || l.category || l.sku || 'Item'} (${l.cur || 'USD'} ${l.price || 0})`).join('; ');
      detailRows.push(['Till Lines', linesSummary]);
    }

    const modal = document.createElement('div');
    modal.id = 'vlogInspectModal';
    modal.className = 'vlog-modal-backdrop';
    modal.innerHTML = `
      <div class="vlog-modal" role="dialog" aria-modal="true" aria-labelledby="vlogInspectTitle">
        <div class="vlog-modal-hd">
          <h3 id="vlogInspectTitle">Voided Record Snapshot</h3>
          <button type="button" class="vlog-modal-x" id="vlogInspectCloseBtn" aria-label="Close modal">×</button>
        </div>
        <div class="vlog-modal-body">
          <div class="vlog-inspect-sub" data-no-i18n="1">${esc(entry.moduleLabel)} · ${esc(entry.company)} · ${esc(entry.id)}</div>
          <div class="vlog-inspect-grid">
            ${detailRows.map(([k, v]) => `
              <div class="vlog-inspect-item">
                <span class="vlog-inspect-k" data-no-i18n="1">${esc(tr(k))}</span>
                <span class="vlog-inspect-v" data-no-i18n="1">${esc(v)}</span>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="vlog-modal-ft">
          <button type="button" class="btn btn-ghost-bar" id="vlogInspectDoneBtn">Close</button>
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
      const originLbl = e.isPosTill ? 'Gate Till' : (e.originGroup === 'system' ? 'Workbook Match' : 'Manual Void');
      lines.push([
        formatStampShort(e.voidedAt),
        e.date || '',
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
    try {
      if (entry.sourceKind === 'custom_record') {
        if (D.restoreVoidedRecord) await D.restoreVoidedRecord(entry.crKey, entry.id);
      } else if (entry.sourceKind === 'ind_custom' || entry.sourceKind === 'ind_edit') {
        if (D.restoreVoidedIndustryDomainRow) await D.restoreVoidedIndustryDomainRow(entry);
      }
    } finally {
      inFlightKeys.delete(entry.key);
    }
    patchResultsInPlace();
  }

  async function handleSaveNote(entryKey) {
    const k = String(entryKey || '');
    if (!k || inFlightKeys.has(k)) return;
    const entry = findEntryByKey(k);
    if (!entry || !entry.canEditNote || !D || !D.saveVoidNote) return;
    inFlightKeys.add(k);
    const inp = document.querySelector(`[data-vlog-note-input="${CSS.escape(k)}"]`);
    const txt = inp ? inp.value : '';
    editingNoteKey = '';
    try {
      await D.saveVoidNote(entry, txt);
    } finally {
      inFlightKeys.delete(k);
    }
    patchResultsInPlace();
  }

  function wireDelegationOnce() {
    if (wired) return;
    wired = true;

    window.addEventListener('mfg:lang-changed', () => {
      if (document.getElementById('vlogRoot')) patchResultsInPlace();
    });

    document.addEventListener('click', async e => {
      const inspModal = document.getElementById('vlogInspectModal');
      if (inspModal) {
        if (e.target === inspModal || e.target.closest('#vlogInspectCloseBtn') || e.target.closest('#vlogInspectDoneBtn')) {
          closeInspectModal();
          return;
        }
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

      const origBtn = e.target.closest('[data-vlog-origin]');
      if (origBtn) {
        filterState.origin = origBtn.getAttribute('data-vlog-origin') || 'user';
        armedRestoreKey = '';
        editingNoteKey = '';
        root.querySelectorAll('[data-vlog-origin]').forEach(b => b.classList.toggle('active', b === origBtn));
        patchResultsInPlace();
        return;
      }

      const dayBtn = e.target.closest('[data-vlog-days]');
      if (dayBtn) {
        filterState.days = dayBtn.getAttribute('data-vlog-days') || 'all';
        armedRestoreKey = '';
        editingNoteKey = '';
        root.querySelectorAll('[data-vlog-days]').forEach(b => b.classList.toggle('active', b === dayBtn));
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
      }
    });

    document.addEventListener('change', e => {
      const root = e.target.closest('#vlogRoot');
      if (!root) return;
      if (e.target.id === 'vlogModuleSelect') {
        filterState.module = e.target.value || 'all';
        armedRestoreKey = '';
        patchResultsInPlace();
      } else if (e.target.id === 'vlogActorSelect') {
        filterState.actor = e.target.value || 'all';
        armedRestoreKey = '';
        patchResultsInPlace();
      }
    });

    document.addEventListener('input', e => {
      if (e.target && e.target.id === 'vlogSearchInput') {
        filterState.q = e.target.value || '';
        armedRestoreKey = '';
        patchResultsInPlace();
      }
    });

    document.addEventListener('keydown', async e => {
      if (e.key === 'Escape' && document.getElementById('vlogInspectModal')) {
        e.preventDefault();
        closeInspectModal();
        return;
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
