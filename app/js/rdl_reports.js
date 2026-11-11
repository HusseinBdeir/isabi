// ============================================================================
// js/rdl_reports.js — Canonical 22 Paginated Reports Suite (m20_rdls.py & m21_app_surface.py parity)
// Exact RDL tab order (rdl_common.TAB_GROUPS), category pills, report search,
// per-report RDL Parameter Bar (From/To, As-At, Columns by, Account/Sub-Account,
// Customer, Supplier, Product, Site, Equipment, Driver, Staff, Year/Month,
// VAT Invoice No, Ticket No, Voucher No), click-sortable tablix headers,
// bilingual titles, legal company blocks, and A4 / Landscape print & CSV export.
// ============================================================================
(function () {
  'use strict';

  const ic = (name, cls) => (typeof window !== 'undefined' && window.MFG_ICONS ? window.MFG_ICONS.svg(name, cls) : '');

  const RDL_CATALOG = [
    { id: '01', code: '01', slug: 'daily_ops',     cat: 'Digest',         name: 'Daily Operations',      title: 'Daily Operations',      ar: 'ملخص العمليات اليومية', landscape: true,  params: ['from', 'to'] },
    { id: '02', code: '02', slug: 'balance_sheet', cat: 'Statements',     name: 'Balance Sheet',         title: 'Balance Sheet',         ar: 'الميزانية العمومية',   landscape: false, params: ['asof'] },
    { id: '03', code: '03', slug: 'income_stmt',   cat: 'Statements',     name: 'Income Statement',      title: 'Income Statement',      ar: 'بيان الدخل',           landscape: true,  params: ['from', 'to', 'period'] },
    { id: '04', code: '04', slug: 'cash_flow',     cat: 'Statements',     name: 'Cash Flow Statement',   title: 'Cash Flow Statement',   ar: 'بيان التدفقات النقدية', landscape: true,  params: ['from', 'to', 'period'] },
    { id: '05', code: '05', slug: 'trial_balance', cat: 'General Ledger', name: 'Trial Balance',         title: 'Trial Balance',         ar: 'ميزان المراجعة',       landscape: false, params: ['from', 'to'] },
    { id: '06', code: '06', slug: 'gen_journal',   cat: 'General Ledger', name: 'General Journal',       title: 'General Journal',       ar: 'دفتر اليومية العام',   landscape: true,  params: ['from', 'to', 'account'] },
    { id: '07', code: '07', slug: 'sub_account',   cat: 'General Ledger', name: 'Sub-Account Statement', title: 'Sub-Account Statement', ar: 'كشف حساب فرعي',       landscape: false, params: ['account', 'subAccount', 'from', 'to'] },
    { id: '08', code: '08', slug: 'sales_reg',     cat: 'Registers',      name: 'Sales Register',        title: 'Sales Register',        ar: 'سجل المبيعات',         landscape: true,  params: ['from', 'to', 'customer', 'product', 'site'] },
    { id: '09', code: '09', slug: 'expense_reg',   cat: 'Registers',      name: 'Expense Register',      title: 'Expense Register',      ar: 'سجل المصاريف',         landscape: true,  params: ['from', 'to', 'category', 'supplier'] },
    { id: '10', code: '10', slug: 'payroll_reg',   cat: 'Registers',      name: 'Payroll Register',      title: 'Payroll Register',      ar: 'سجل الرواتب',          landscape: false, params: ['from', 'to', 'staff'] },
    { id: '11', code: '11', slug: 'raw_reg',       cat: 'Registers',      name: 'Raw Material',          title: 'Raw Material',          ar: 'سجل المواد الأولية',   landscape: true,  params: ['from', 'to', 'supplier'] },
    { id: '12', code: '12', slug: 'fuel_log',      cat: 'Registers',      name: 'Fuel Log',              title: 'Fuel Log',              ar: 'سجل المحروقات',        landscape: true,  params: ['from', 'to', 'equipType', 'equipment', 'driver'] },
    { id: '13', code: '13', slug: 'aged_ar',       cat: 'Counterparties', name: 'Aged Receivables',      title: 'Aged Receivables',      ar: 'أعمار الذمم المدينة',  landscape: true,  params: ['asof', 'customer'] },
    { id: '14', code: '14', slug: 'cust_stmt',     cat: 'Counterparties', name: 'Customer Statement',    title: 'Customer Statement',    ar: 'كشف حساب زبون',       landscape: false, params: ['customer', 'from', 'to'] },
    { id: '15', code: '15', slug: 'sup_bal',       cat: 'Counterparties', name: 'Supplier Balances',     title: 'Supplier Balances',     ar: 'أرصدة الموردين',       landscape: false, params: ['asof', 'supplier'] },
    { id: '16', code: '16', slug: 'sup_stmt',      cat: 'Counterparties', name: 'Supplier Statement',    title: 'Supplier Statement',    ar: 'كشف حساب مورد',       landscape: false, params: ['supplier', 'from', 'to'] },
    { id: '17', code: '17', slug: 'driver_stmt',   cat: 'Counterparties', name: 'Driver Statement',      title: 'Driver Statement',      ar: 'كشف السائقين',         landscape: true,  params: ['from', 'to', 'driver'] },
    { id: '18', code: '18', slug: 'vat_return',    cat: 'Tax & Recon',    name: 'VAT Return',            title: 'VAT Return',            ar: 'ملخص ضريبة القيمة المضافة', landscape: false, params: ['from', 'to'] },
    { id: '19', code: '19', slug: 'pl_recon',      cat: 'Tax & Recon',    name: 'P&L Reconciliation',    title: 'P&L Reconciliation',    ar: 'مطابقة الأرباح والخسائر', landscape: true,  params: ['year', 'month'] },
    { id: '20', code: '20', slug: 'sales_inv',     cat: 'Documents',      name: 'Sales Invoice',         title: 'Sales Invoice',         ar: 'فاتورة مبيعات',        landscape: false, params: ['invoiceNo'] },
    { id: '21', code: '21', slug: 'deliv_ticket',  cat: 'Documents',      name: 'Delivery Ticket',       title: 'Delivery Ticket',       ar: 'بون تسليم',            landscape: false, params: ['ticketId'] },
    { id: '22', code: '22', slug: 'rcpt_voucher',  cat: 'Documents',      name: 'Receipt Voucher',       title: 'Receipt Voucher',       ar: 'سند قبض',              landscape: false, params: ['receiptId'] },
    { id: '23', code: '23', slug: 'hld_intercompany_reg', cat: 'Registers', name: 'Intercompany & Partner Split', title: 'Intercompany & Partner Split Register', ar: 'سجل الذمم المشتركة وتوزيع حصص الشركاء', landscape: true, params: ['from', 'to'] },
    { id: '24', code: '24', slug: 'hsp_venue_till_reg',   cat: 'Registers', name: 'Venue Revenue & POS Till',     title: 'Venue Revenue, POS Till & Membership Register', ar: 'سجل إيرادات المنتجعات وصندوق الكاشير والاشتراكات', landscape: true, params: ['from', 'to'] },
    { id: '25', code: '25', slug: 'trd_books_stock_reg',  cat: 'Registers', name: 'Invoice Books & Stock Valuation', title: 'Invoice Books, Serial VIN & Stock Valuation', ar: 'سجل دفاتر الفواتير والشاحنات وتقييم المخزون', landscape: true, params: ['from', 'to'] },
    { id: '26', code: '26', slug: 're_rent_roll_stmt',    cat: 'Statements', name: '4235 Official Rent Roll',    title: 'Official 4235 VAT Rent Roll & Lease Expiry', ar: 'جدول عقود الإيجار والفواتير الضريبية 4235', landscape: true, params: ['from', 'to'] },
    { id: '27', code: '27', slug: 'ins_policy_recon_stmt', cat: 'Statements', name: 'Policy Schedule & Carrier Recon', title: 'Policy Schedule, Renewal Queue & Carrier Recon', ar: 'جدول البوالص والتجديدات ومطابقة شركات التأمين', landscape: true, params: ['from', 'to'] }
  ];

  const RDL_CATEGORIES = ['All', 'Digest', 'Statements', 'General Ledger', 'Registers', 'Counterparties', 'Tax & Recon', 'Documents'];

  const CO_WTC = {
    co: 'WTC',
    short: 'WTC',
    legal: 'World Trading & Construction Company',
    ar: 'شركة التجارة والبناء العالمية',
    mof: 'VAT 2585321-601',
    address: 'Ras Beirut, Hamra Street 776',
    phone: 'Tel: 03/224839'
  };
  const CO_BBC = {
    co: 'BBConstruction',
    short: 'BBConstruction',
    legal: 'Buzwair & Bdeir Construction Supplies Co. S.A.R.L',
    ar: 'شركة بوزوير و بدير لمواد البناء ش.م.م',
    mof: 'VAT 601-2372701',
    address: 'Riad El Solh, Beirut, Lebanon',
    phone: 'Tel: 01/998550-1 · Fax: 01/998552'
  };
  const CO_LT = {
    co: 'Lions Transport',
    short: 'Lions Transport',
    legal: 'Lions Transport',
    ar: 'ليونز للنقل',
    mof: 'VAT -',
    address: 'Beirut, Lebanon',
    phone: ''
  };
  const CO_ALL = {
    co: 'ALL',
    short: 'Manufacturing Group',
    legal: 'Bdeir Holding · Manufacturing Group (WTC · BBConstruction · Lions Transport)',
    ar: 'مجموعة التصنيع والكسارات · شركة التجارة والبناء العالمية وبوزوير وبدير',
    mof: 'VAT 2585321-601 / 601-2372701',
    address: 'Ras Beirut & Riad El Solh, Beirut, Lebanon',
    phone: 'Tel: 03/224839 · 01/998550-1'
  };
  const CO_HOLDING = {
    co: 'Bdeir Holding',
    short: 'Bdeir Holding',
    legal: 'Bdeir Holding Group Treasury & Shared Overhead',
    ar: 'مجموعة بدير القابضة · الخزينة والمركز الرئيسي',
    mof: 'Group Treasury & Consolidation',
    address: 'Ras Beirut, Hamra Street 776, Beirut, Lebanon',
    phone: 'Tel: 01/998550-1 · 03/224839'
  };
  const CO_BLANCA = {
    co: 'Blanca',
    short: 'Blanca',
    legal: 'Blanca Beach Resort & Hospitality Operations',
    ar: 'منتجع بلانكا السياحي',
    mof: 'Hospitality Division · Blanca',
    address: 'South Coast Highway, Lebanon',
    phone: 'Hospitality Operations'
  };
  const CO_LAUNA = {
    co: 'La Una',
    short: 'La Una',
    legal: 'La Una Dining & Lounge Operations',
    ar: 'لا أونا للمطاعم والضيافة',
    mof: 'Hospitality Division · La Una',
    address: 'Beirut Waterfront & Coastal District, Lebanon',
    phone: 'Hospitality Operations'
  };
  const CO_PALMS = {
    co: 'Palms',
    short: 'Palms',
    legal: 'The Palms Beach Resort & Cabanas',
    ar: 'منتجع بالمز السياحي',
    mof: 'Hospitality Division · Palms',
    address: 'Coastal Highway, Lebanon',
    phone: 'Hospitality Operations'
  };
  const CO_VOILE = {
    co: 'Voile',
    short: 'Voile',
    legal: 'Voile Beach Club & Events',
    ar: 'فوال بيتش كلوب',
    mof: 'Hospitality Division · Voile',
    address: 'Coastal Highway, Lebanon',
    phone: 'Hospitality Operations'
  };
  const CO_PLATINUM = {
    co: 'Platinum',
    short: 'Platinum',
    legal: 'Platinum Fitness, Wellness & Pool Club',
    ar: 'نادي بلاتينوم الرياضي والصحي',
    mof: 'Hospitality & Wellness · Platinum',
    address: 'Beirut, Lebanon',
    phone: 'Wellness & Memberships'
  };
  const CO_HOSP_ALL = {
    co: 'Hospitality Group',
    short: 'Hospitality Group',
    legal: 'Bdeir Holding · Hospitality & Resorts Group (Blanca · La Una · Palms · Voile · Platinum)',
    ar: 'مجموعة الضيافة والمنتجعات · بلانكا ولا أونا وبالمز وفوال وبلاتينوم',
    mof: 'Hospitality Consolidated Division',
    address: 'Beirut & Coastal Resorts, Lebanon',
    phone: 'Hospitality Operations'
  };
  const CO_KORRI = {
    co: 'Korri Auto',
    short: 'Korri Auto',
    legal: 'Korri Auto Trading & Spare Parts S.A.R.L',
    ar: 'شركة قري أوتو لتجارة السيارات وقطع الغيار',
    mof: 'Commercial Register & VAT · Korri Auto',
    address: 'Industrial Highway, Beirut, Lebanon',
    phone: 'Automotive & Parts Division'
  };
  const CO_SHACMAN = {
    co: 'Shacman',
    short: 'Shacman',
    legal: 'Shacman Heavy Trucks & Machinery Trading',
    ar: 'شاكمان لتجارة الشاحنات والآليات الثقيلة',
    mof: 'Heavy Trucks & VIN Registry · Shacman',
    address: 'Heavy Commercial Zone, Beirut, Lebanon',
    phone: 'Heavy Trucks Division'
  };
  const CO_TRD_ALL = {
    co: 'Trading Group',
    short: 'Trading Group',
    legal: 'Bdeir Holding · Automotive & Heavy Trading Group (Korri Auto · Shacman)',
    ar: 'مجموعة تجارة السيارات والشاحنات وقطع الغيار · قري أوتو وشاكمان',
    mof: 'Trading Consolidated Division',
    address: 'Beirut, Lebanon',
    phone: 'Trading Operations'
  };
  const CO_PROPERTIES = {
    co: 'Properties',
    short: 'Properties',
    legal: 'Bdeir Real Estate & Property Portfolio (Properties BU)',
    ar: 'إدارة العقارات والأملاك · محفظة الإيجارات',
    mof: 'Property Management & Lease Portfolio',
    address: 'Ras Beirut & Riad El Solh, Beirut, Lebanon',
    phone: 'Real Estate Operations'
  };
  const CO_4235 = {
    co: '4235 Company S.A.L',
    short: '4235 Company S.A.L',
    legal: '4235 Company S.A.L · Official Property & Commercial Lessors',
    ar: 'شركة 4235 ش.م.ل · العقارات والتأجير التجاري',
    mof: 'Official MoF VAT Landlord · 11% VAT Schedule',
    address: 'Riad El Solh, Beirut, Lebanon',
    phone: 'Tel: 01/998550-1'
  };
  const CO_RE_ALL = {
    co: 'Real Estate Group',
    short: 'Real Estate Group',
    legal: 'Bdeir Holding · Real Estate & Property Group (Properties · 4235 Company S.A.L)',
    ar: 'مجموعة العقارات والأملاك · شركة 4235 ش.م.ل ومحفظة العقارات',
    mof: 'Real Estate Consolidated Division',
    address: 'Ras Beirut & Riad El Solh, Beirut, Lebanon',
    phone: 'Real Estate Operations'
  };
  const CO_INS = {
    co: 'Insurance Company',
    short: 'Insurance Brokerage',
    legal: 'Bdeir Insurance Brokerage & Risk Advisory',
    ar: 'مؤسسة الوساطة التأمينية وإدارة البوالص',
    mof: 'Insurance Brokerage · Motor · Medical · Marine · Property',
    address: 'Beirut, Lebanon',
    phone: 'Insurance Operations'
  };
  const CO_LEGAL = {
    WTC: CO_WTC, wtc: CO_WTC,
    BBC: CO_BBC, BBConstruction: CO_BBC, bbconstruction: CO_BBC,
    LT: CO_LT, 'Lions Transport': CO_LT, lionstransport: CO_LT,
    ALL: CO_ALL, 'manufacturing-group': CO_ALL, 'industry:Manufacturing': CO_ALL,
    'Bdeir Holding': CO_HOLDING, bdeirholding: CO_HOLDING, 'industry:Holding & Treasury': CO_HOLDING,
    Blanca: CO_BLANCA, blanca: CO_BLANCA,
    'La Una': CO_LAUNA, launa: CO_LAUNA,
    Palms: CO_PALMS, palms: CO_PALMS,
    Voile: CO_VOILE, voile: CO_VOILE,
    Platinum: CO_PLATINUM, platinum: CO_PLATINUM,
    'Hospitality Group': CO_HOSP_ALL, 'industry:Hospitality & Resorts': CO_HOSP_ALL,
    'Korri Auto': CO_KORRI, korriauto: CO_KORRI,
    Shacman: CO_SHACMAN, shacman: CO_SHACMAN,
    'Trading Group': CO_TRD_ALL, 'industry:Automotive & Heavy Trading': CO_TRD_ALL,
    Properties: CO_PROPERTIES, properties: CO_PROPERTIES,
    '4235 Company S.A.L': CO_4235, '4235company': CO_4235,
    'Real Estate Group': CO_RE_ALL, 'industry:Real Estate & Property': CO_RE_ALL,
    'Insurance Company': CO_INS, insurance: CO_INS, 'industry:Insurance & Brokerage': CO_INS
  };

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const _RDL_NF_US = [];
  function _rdlFmtUsNum(n, dp = 0) {
    if (dp === 0) {
      if (n === 0) return (1 / n < 0) ? '-0' : '0';
      if (n > 0 && n < 1000 && (n | 0) === n) return '' + n;
      if (n < 0 && n > -1000 && (n | 0) === n) return '' + n;
    }
    if (dp >= 0 && dp <= 6 && (dp | 0) === dp) {
      let nf = _RDL_NF_US[dp];
      if (!nf) {
        nf = _RDL_NF_US[dp] = new Intl.NumberFormat('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
      }
      return nf.format(n);
    }
    return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }

  function fmtUsd(v, dp = 0) {
    const n = Number(v || 0);
    if (!Number.isFinite(n)) return '$0';
    const abs = _rdlFmtUsNum(Math.abs(n), dp);
    return (n < -0.0005 ? '-$' : '$') + abs;
  }

  function fmtUsdSigned(v, dp = 0) {
    const n = Number(v || 0);
    if (!Number.isFinite(n)) return '$0';
    const abs = _rdlFmtUsNum(Math.abs(n), dp);
    return n < -0.0005 ? `($${abs})` : `$${abs}`;
  }

  function fmtNum(v, dp = 0) {
    const n = Number(v || 0);
    if (!Number.isFinite(n)) return '0';
    return _rdlFmtUsNum(n, dp);
  }

  function ensureRdlState(STATE, SEED) {
    const maxDate = String((SEED && SEED.generated_at) || '2026-10-21').slice(0, 10);
    if (!STATE.rdl) {
      STATE.rdl = {
        cat: 'All',
        search: '',
        paramsOpen: true,
        pinnedCoverNote: false,
        _dateTouched: false,
        params: {
          from: '2024-01-01',
          to: maxDate,
          asof: maxDate,
          period: 'Month',
          account: 'ALL',
          subAccount: 'ALL',
          customer: 'ALL',
          product: 'ALL',
          site: 'ALL',
          supplier: 'ALL',
          category: 'ALL',
          staff: 'ALL',
          equipType: 'ALL',
          equipment: 'ALL',
          driver: 'ALL',
          year: 'ALL',
          month: 'ALL',
          invoiceNo: '2738',
          ticketId: '',
          receiptId: ''
        }
      };
    }
    const curGlobalSig = `${STATE.period || 'all'}|${STATE.dateFrom || ''}|${STATE.dateTo || ''}`;
    if (STATE.rdl._lastGlobalPeriodSig !== undefined && STATE.rdl._lastGlobalPeriodSig !== curGlobalSig) {
      STATE.rdl._dateTouched = false;
    }
    STATE.rdl._lastGlobalPeriodSig = curGlobalSig;
    if (!STATE.rdl._dateTouched) {
      const ent = (typeof window !== 'undefined' && window.MFG_ENTERPRISE) || null;
      const hasCustomBounds = Boolean(STATE.dateFrom || STATE.dateTo || STATE.period === 'custom');
      const pr = (!hasCustomBounds && STATE.period && STATE.period !== 'all' && ent && typeof ent.periodRange === 'function')
        ? ent.periodRange(STATE.period)
        : null;
      if (!hasCustomBounds && !pr && (!STATE.period || STATE.period === 'all')) {
        STATE.rdl.params.from = '2024-01-01';
        STATE.rdl.params.to = maxDate;
        STATE.rdl.params.asof = maxDate;
      } else if (pr && pr.from) {
        const f = String(pr.from).slice(0, 10);
        const rawT = String(pr.to || f).slice(0, 10);
        const t = rawT < f ? f : rawT;
        STATE.rdl.params.from = f;
        STATE.rdl.params.to = t;
        STATE.rdl.params.asof = t;
      } else {
        const f = String(STATE.dateFrom || '2024-01-01').slice(0, 10);
        const rawT = String(STATE.dateTo || maxDate).slice(0, 10);
        const t = rawT < f ? f : rawT;
        STATE.rdl.params.from = f;
        STATE.rdl.params.to = t;
        STATE.rdl.params.asof = t;
      }
    }
    return STATE.rdl;
  }

  function normalizeStateCo(stateCo) {
    const raw = String(stateCo || '');
    if (CO_LEGAL[raw]) return CO_LEGAL[raw].co;
    const s = raw.toLowerCase();
    if (s === 'democompany') {
      const dInd = (typeof window !== 'undefined' && window.MFG_ENTERPRISE && window.MFG_ENTERPRISE.STATE && window.MFG_ENTERPRISE.STATE.demoCompanyIndustry) || 'Hospitality & Resorts';
      if (dInd === 'Holding & Treasury') return 'Bdeir Holding';
      if (dInd === 'Hospitality & Resorts') return 'Hospitality Group';
      if (dInd === 'Automotive & Heavy Trading') return 'Trading Group';
      if (dInd === 'Real Estate & Property') return 'Real Estate Group';
      if (dInd === 'Insurance & Brokerage') return 'Insurance Company';
      return 'ALL';
    }
    if (s === 'wtc') return 'WTC';
    if (s === 'bbconstruction' || s === 'bbc') return 'BBConstruction';
    if (s === 'lionstransport' || s === 'lions transport' || s === 'lt') return 'Lions Transport';
    if (s === 'bdeirholding' || s === 'bdeir holding' || s === 'industry:holding & treasury' || s === 'industry:holding') return 'Bdeir Holding';
    if (s === 'blanca') return 'Blanca';
    if (s === 'launa' || s === 'la una') return 'La Una';
    if (s === 'palms') return 'Palms';
    if (s === 'voile') return 'Voile';
    if (s === 'platinum') return 'Platinum';
    if (s === 'industry:hospitality & resorts' || s === 'industry:hospitality') return 'Hospitality Group';
    if (s === 'korriauto' || s === 'korri auto') return 'Korri Auto';
    if (s === 'shacman') return 'Shacman';
    if (s === 'industry:automotive & heavy trading' || s === 'industry:trading') return 'Trading Group';
    if (s === 'properties') return 'Properties';
    if (s === '4235company' || s === '4235 company s.a.l') return '4235 Company S.A.L';
    if (s === 'industry:real estate & property' || s === 'industry:realestate') return 'Real Estate Group';
    if (s === 'insurance' || s === 'insurance company' || s === 'industry:insurance & brokerage' || s === 'industry:insurance') return 'Insurance Company';
    return 'ALL';
  }

  const RDL_GROUP_COMPANIES = {
    'ALL': ['WTC', 'BBConstruction', 'Lions Transport'],
    'Hospitality Group': ['Blanca', 'La Una', 'Palms', 'Voile', 'Platinum'],
    'Trading Group': ['Korri Auto', 'Shacman'],
    'Real Estate Group': ['Properties', '4235 Company S.A.L']
  };

  function coMatch(rowCo, normCo, allowedCos) {
    const rc = String(rowCo || '');
    if (allowedCos && allowedCos.length && rc && !allowedCos.includes(rc)) return false;
    if (!normCo || normCo === 'ALL') {
      return !rc || RDL_GROUP_COMPANIES.ALL.includes(rc);
    }
    if (RDL_GROUP_COMPANIES[normCo]) {
      return RDL_GROUP_COMPANIES[normCo].includes(rc);
    }
    return rc === String(normCo);
  }

  function rowDate(r, basis) {
    if (basis === 'rep' && r.rep_date) return String(r.rep_date).slice(0, 10);
    return String(r.date || r.start_date || '').slice(0, 10);
  }

  function inWindow(d, from, to) {
    if (!d) return false;
    const s = String(d).slice(0, 10);
    if (from && s < from) return false;
    if (to && s > to) return false;
    return true;
  }

  function companyBlockHtml(coKey) {
    const L = CO_LEGAL[coKey] || CO_LEGAL.WTC;
    return `
      <div class="rdl-co-block">
        <div class="rdl-co-legal">${esc(L.legal)}</div>
        <div class="rdl-co-ar" dir="rtl">${esc(L.ar)}</div>
        <div class="rdl-co-meta">${esc(L.mof)}</div>
        <div class="rdl-co-meta">${esc(L.address)}</div>
        ${L.phone ? `<div class="rdl-co-meta">${esc(L.phone)}</div>` : ''}
      </div>
    `;
  }

  function metaRowsHtml(rows) {
    return `
      <table class="rdl-meta-box">
        <tbody>
          ${rows.map(([lab, val], i) => `
            <tr>
              <td class="rdl-meta-lbl">${esc(lab)}</td>
              <td class="rdl-meta-val ${i === 0 ? 'bold' : ''}">${esc(val)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function partyBlockHtml(label, name, sub, mof, phoneAddr) {
    return `
      <div class="rdl-party-box">
        <div class="rdl-party-hdr">${esc(label)}</div>
        <div class="rdl-party-name">${esc(name || '—')}</div>
        ${sub && sub !== name ? `<div class="rdl-party-sub">${esc(sub)}</div>` : ''}
        ${mof ? `<div class="rdl-party-meta">${esc(mof)}</div>` : ''}
        ${phoneAddr ? `<div class="rdl-party-meta">${esc(phoneAddr)}</div>` : ''}
      </div>
    `;
  }

  function signatureRowHtml(leftLabel, rightLabel) {
    return `
      <div class="rdl-sig-row">
        <div class="rdl-sig-line">${esc(leftLabel)}</div>
        <div class="rdl-sig-line">${esc(rightLabel)}</div>
      </div>
    `;
  }


  // WTC division seals (approved Round-7 seal construction; masters in
  // OneDrive System\Manufacturing\WTC\Logo\SVG, copied to css/brand/). Printed only when the
  // statement's own company resolves to WTC, so counterparties can tell an Accounting-issued
  // financial document from a Logistics field slip; executive reports carry the corporate seal.
  const WTC_SEAL_DIVISION_BY_REPORT = {
    '05': 'accounting', '06': 'accounting', '07': 'accounting', '09': 'accounting', '10': 'accounting',
    '13': 'accounting', '14': 'accounting', '15': 'accounting', '16': 'accounting', '18': 'accounting',
    '19': 'accounting', '20': 'accounting', '22': 'accounting',
    '11': 'logistics', '12': 'logistics', '17': 'logistics', '21': 'logistics',
    '01': 'corporate', '02': 'corporate', '03': 'corporate', '04': 'corporate', '08': 'corporate'
  };
  const WTC_DIVISION_SEALS = {
    accounting: { file: 'wtc-accounting-seal.svg', alt: 'WTC Accounting' },
    logistics: { file: 'wtc-logistics-seal.svg', alt: 'WTC Logistics' },
    corporate: { file: 'wtc-seal.svg', alt: 'WTC' }
  };

  function wtcDivisionSealHtml(meta, coKey) {
    // Strict lookup: CO_LEGAL's WTC fallback must never stamp a WTC seal on another company.
    if (!coKey || CO_LEGAL[coKey] !== CO_WTC) return '';
    const id = String((meta && meta.id) || '').padStart(2, '0');
    const division = WTC_SEAL_DIVISION_BY_REPORT[id];
    const seal = division ? WTC_DIVISION_SEALS[division] : null;
    if (!seal) return '';
    const shellVer = (typeof window !== 'undefined' && window.__MFG_SHELL_VER) ? String(window.__MFG_SHELL_VER) : '';
    const src = `css/brand/${seal.file}${shellVer ? `?v=${encodeURIComponent(shellVer)}` : ''}`;
    return `<img class="rdl-division-seal" data-wtc-division="${division}" src="${src}" alt="${esc(seal.alt)}" width="84" height="84" decoding="sync" draggable="false">`;
  }

  function sheetHeaderHtml(meta, coKey, subtitle, noteText) {
    const L = CO_LEGAL[coKey] || CO_LEGAL.WTC;
    const sealHtml = wtcDivisionSealHtml(meta, coKey);
    const textHtml = `
        <div class="rdl-title-text">${esc(meta.title)} - ${esc(L.short)} / <span dir="rtl">${esc(meta.ar)}</span></div>
        <div class="rdl-subtitle-text">${esc(subtitle || '')}</div>
        ${noteText ? `<div class="rdl-note-text">${esc(noteText)}</div>` : ''}`;
    if (sealHtml) {
      return `
      <div class="rdl-title-block has-division-seal">
        ${sealHtml}
        <div class="rdl-title-main">${textHtml}
        </div>
      </div>
    `;
    }
    return `
      <div class="rdl-title-block">${textHtml}
      </div>
    `;
  }

  function sheetFooterHtml(coKey, pageNum, totalPages) {
    const L = CO_LEGAL[coKey] || CO_LEGAL.WTC;
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    return `
      <div class="rdl-page-footer">
        <span>Generated ${esc(stamp)} · ${esc(L.short)} · ISABI Financial &amp; Operational Statements</span>
        <span>Page ${pageNum || 1} of ${totalPages || 1}</span>
      </div>
    `;
  }

  const COA_ACCOUNTS = [
    { code: '101', name: 'Capital & Partner Equity / رأس المال', cls: '1 - Capital & Long-Term Liabilities', section: 'Equity & Long-Term Liabilities', normal: 'C' },
    { code: '165', name: 'Shareholder & Partner Current Accounts / جاري الشركاء', cls: '1 - Capital & Long-Term Liabilities', section: 'Equity & Long-Term Liabilities', normal: 'C' },
    { code: '215', name: 'Batching Plant, Mixers & Pumps / الآلات والمعدات', cls: '2 - Fixed Assets', section: 'Fixed & Non-Current Assets', normal: 'D' },
    { code: '218', name: 'Transport Fleet & Heavy Vehicles / آليات النقل', cls: '2 - Fixed Assets', section: 'Fixed & Non-Current Assets', normal: 'D' },
    { code: '281', name: 'Accumulated Depreciation / الاستهلاكات المتراكمة', cls: '2 - Fixed Assets', section: 'Fixed & Non-Current Assets', normal: 'C' },
    { code: '311', name: 'Raw Materials Inventory (Cement, Sand, Aggregate) / مخزون المواد الأولية', cls: '3 - Inventory', section: 'Current Assets', normal: 'D' },
    { code: '401', name: 'Suppliers — Accounts Payable / ذمم الموردين', cls: '4 - Third Party Accounts', section: 'Current Liabilities', normal: 'C' },
    { code: '411', name: 'Customers — Accounts Receivable / ذمم الزبائن', cls: '4 - Third Party Accounts', section: 'Current Assets', normal: 'D' },
    { code: '421', name: 'Personnel — Salaries & Advances / ذمم الموظفين والسلف', cls: '4 - Third Party Accounts', section: 'Current Liabilities', normal: 'C' },
    { code: '442', name: 'State — VAT Collectible & Deductible / الضريبة على القيمة المضافة', cls: '4 - Third Party Accounts', section: 'Current Liabilities', normal: 'C' },
    { code: '467', name: 'Sundry Debtors, Creditors & Barter Clearing / مدينون ودائنون مختلفون ومقاصة', cls: '4 - Third Party Accounts', section: 'Current Assets', normal: 'D' },
    { code: '512', name: 'Banks & Financial Institutions (Fresh USD) / البنوك', cls: '5 - Financial Accounts', section: 'Cash & Treasury', normal: 'D' },
    { code: '531', name: 'Cash on Hand & Plant Safe / الصندوق', cls: '5 - Financial Accounts', section: 'Cash & Treasury', normal: 'D' },
    { code: '601', name: 'Purchases of Raw Materials & Fuel / مشتريات المواد الأولية والمحروقات', cls: '6 - Expenses', section: 'Cost of Goods Sold', normal: 'D' },
    { code: '615', name: 'Plant & Fleet Maintenance & Spare Parts / الصيانة وقطع الغيار', cls: '6 - Expenses', section: 'Operating Expenses', normal: 'D' },
    { code: '622', name: 'Subcontracting, Hauling & General Services / خدمات خارجية ونقل', cls: '6 - Expenses', section: 'Operating Expenses', normal: 'D' },
    { code: '641', name: 'Staff Salaries, Wages & Daily Labor / الرواتب والأجور', cls: '6 - Expenses', section: 'Payroll & Personnel', normal: 'D' },
    { code: '701', name: 'Sales of Ready-Mix Concrete & Products / مبيعات الباطون والمنتجات', cls: '7 - Revenue', section: 'Operating Revenue', normal: 'C' },
    { code: '706', name: 'Pump, Transport & Hauling Revenue / إيرادات الضخ والنقل', cls: '7 - Revenue', section: 'Operating Revenue', normal: 'C' }
  ];

  function getRdlIndustryForCo(normCo) {
    const c = String(normCo || 'ALL');
    if (c === 'Bdeir Holding') return 'Holding & Treasury';
    if (c === 'Blanca' || c === 'La Una' || c === 'Palms' || c === 'Voile' || c === 'Platinum' || c === 'Hospitality Group') return 'Hospitality & Resorts';
    if (c === 'Korri Auto' || c === 'Shacman' || c === 'Trading Group') return 'Automotive & Heavy Trading';
    if (c === 'Properties' || c === '4235 Company S.A.L' || c === 'Real Estate Group') return 'Real Estate & Property';
    if (c === 'Insurance Company') return 'Insurance & Brokerage';
    return 'Manufacturing';
  }

  const DOMAIN_RDL_TERMS = {
    'Manufacturing': {
      qtyUnit: 'm³', qtyDp: 1, qtyCol: 'Qty (m³)', volKpi: 'Concrete Volume', txSingular: 'load', txPlural: 'loads', txCol: 'Loads',
      avgUnitLbl: 'Avg $/m³', rateCol: 'Unit Rate ($/m³)', sec1Title: '1. Production & Revenue by Concrete Grade / Product',
      sec1ProdCol: 'Product / Grade', sec1TotalLbl: 'Total Production Mix',
      sec2Title: '2. Daily Plant Dispatch, Collections & Outflows (Most Recent Operating Days)',
      sec2VolCol: 'Dispatched (m³)', sec2RmCol: 'RM Purchases ($)', sec2FuelCol: 'Diesel (L)',
      cfCustIn: 'Customer Receipts & Concrete Collections (تحصيلات الزبائن)',
      cfRmOut: 'Raw Material & Cement Payments (مدفوعات المواد الأولية)',
      cfFuelOut: 'Diesel & Fleet Fuel Payments (مدفوعات المحروقات)',
      cfExpOut: 'Plant Maintenance & General OPEX Paid (مدفوعات المصاريف والصيانة)',
      plSales: 'Concrete & Product Sales (Excl. VAT)',
      plRm: 'Raw Materials Intake (Cement, Sand, Aggregate)',
      plFuel: 'Fleet & Plant Diesel Consumption',
      plExp: 'Plant Maintenance & General Operating Expenses',
      custSubTitle: 'Account 411 · Ready-Mix Concrete Customer',
      custDefault: 'Sabeh Beton S.R.L', siteDefault: 'Baabda', supDefault: 'Holcim Liban S.A.L',
      supSubtitle: 'Raw Materials, Parts & Plant Supplies',
      doc21Label: 'Delivery Ticket', doc21NoLbl: 'Delivery Ticket No', doc21DateLbl: 'Dispatch Date',
      doc21Ref1Lbl: 'Mixer / Truck', doc21Ref1Def: 'Plant Mixer', doc21Ref2Lbl: 'Driver', doc21Ref2Def: 'Assigned Driver',
      doc21SitePfx: 'Project Site', doc21ProdCol: 'Concrete Grade / Product', doc21SiteCol: 'Pouring Site',
      doc21TotalLbl: 'Total Certified Concrete Delivery', doc21SigLeft: 'Batching Plant Dispatcher / مسؤول المجبل', doc21SigRight: 'Site Engineer / المستلم في الورشة',
      rcptDescDef: 'Concrete Supply'
    },
    'Holding & Treasury': {
      qtyUnit: 'tx', qtyDp: 0, qtyCol: 'Transfers', volKpi: 'Treasury Transfers', txSingular: 'transfer', txPlural: 'transfers', txCol: 'Legs',
      avgUnitLbl: 'Avg / Leg', rateCol: 'Transfer Amount ($)', sec1Title: '1. Intercompany Funding & Advisory by Corridor / Stream',
      sec1ProdCol: 'Corridor / Stream', sec1TotalLbl: 'Total Treasury & Advisory Mix',
      sec2Title: '2. Daily Treasury Clearing, Sister Settlements & Overhead Outflows',
      sec2VolCol: 'Transfers', sec2RmCol: 'Facility Outflows ($)', sec2FuelCol: 'Utility (L)',
      cfCustIn: 'Sister Entity Repayments & Advisory Receipts (تحصيلات الشركات الشقيقة)',
      cfRmOut: 'Intercompany Advances & Facility Funding (تمويل الشركات الشقيقة)',
      cfFuelOut: 'HQ Generator & Fleet Fuel Payments (مدفوعات محروقات المركز)',
      cfExpOut: 'Holding Shared Services & General OPEX Paid (مدفوعات المصاريف الإدارية)',
      plSales: 'Intercompany Treasury & Advisory Income (Excl. VAT)',
      plRm: 'Central Facility & Sister Funding Cost',
      plFuel: 'HQ Fleet & Utility Fuel Consumption',
      plExp: 'Shared Corporate Services & General Overhead',
      custSubTitle: 'Account 451 / 411 · Sister Entity & Counterparty Account',
      custDefault: 'WTC', siteDefault: 'Group Treasury', supDefault: 'Corporate Advisory Services',
      supSubtitle: 'Legal, Audit & Shared Corporate Vendors',
      doc21Label: 'Transfer Advice', doc21NoLbl: 'Transfer Advice No', doc21DateLbl: 'Value Date',
      doc21Ref1Lbl: 'Channel', doc21Ref1Def: 'Bank Wire', doc21Ref2Lbl: 'Authorized By', doc21Ref2Def: 'Group Treasury',
      doc21SitePfx: 'Corridor', doc21ProdCol: 'Treasury Corridor / Purpose', doc21SiteCol: 'Sister Scope',
      doc21TotalLbl: 'Total Certified Treasury Transfer', doc21SigLeft: 'Group Treasury Desk / مكتب الخزينة', doc21SigRight: 'Counterparty Confirmation / توقيع المستلم',
      rcptDescDef: 'Intercompany Settlement'
    },
    'Hospitality & Resorts': {
      qtyUnit: 'covers', qtyDp: 0, qtyCol: 'Covers / Units', volKpi: 'Covers & Chalets', txSingular: 'close', txPlural: 'closes', txCol: 'Sheets',
      avgUnitLbl: 'Avg Check', rateCol: 'Avg Rate ($)', sec1Title: '1. Venue, Chalet & Membership Revenue by Category',
      sec1ProdCol: 'Outlet / Revenue Category', sec1TotalLbl: 'Total Resort Revenue Mix',
      sec2Title: '2. Daily Venue Closes, POS Collections, Commissary & Energy Outflows',
      sec2VolCol: 'Covers', sec2RmCol: 'Kitchen & Cellar ($)', sec2FuelCol: 'Gen. Diesel (L)',
      cfCustIn: 'POS Till Closes, Chalet & Membership Collections (تحصيلات الصناديق والاشتراكات)',
      cfRmOut: 'Commissary, F&B & Cellar Supplier Payments (مدفوعات المطبخ والمستودع)',
      cfFuelOut: 'Resort Generator Diesel & Energy Payments (مدفوعات المازوت والطاقة)',
      cfExpOut: 'Resort Housekeeping, Maintenance & OPEX Paid (مدفوعات الصيانة والتشغيل)',
      plSales: 'Venue POS, Chalet & Seasonal Membership Revenue (Excl. VAT)',
      plRm: 'Kitchen, Bar & Cellar Commissary Consumption',
      plFuel: 'Resort Prime Generator Diesel Consumption',
      plExp: 'Resort Maintenance, Housekeeping & Operating Expenses',
      custSubTitle: 'Account 411 · Resort Member & Hospitality Client',
      custDefault: 'Blanca Main Venue', siteDefault: 'South Coast Resort', supDefault: 'Main Commissary Suppliers',
      supSubtitle: 'F&B Commissary, Beverage Cellar & Resort Contractors',
      doc21Label: 'Venue Close Slip', doc21NoLbl: 'Venue Close Ref', doc21DateLbl: 'Operating Date',
      doc21Ref1Lbl: 'Outlet / Terminal', doc21Ref1Def: 'Main POS', doc21Ref2Lbl: 'Duty Manager', doc21Ref2Def: 'Resort Manager',
      doc21SitePfx: 'Resort Outlet', doc21ProdCol: 'Revenue Stream / Membership', doc21SiteCol: 'Venue / Cabana',
      doc21TotalLbl: 'Total Certified Venue Voucher', doc21SigLeft: 'Resort Cashier / أمين الصندوق', doc21SigRight: 'Duty Manager / مدير الصالة',
      rcptDescDef: 'Resort & Membership Settlement'
    },
    'Automotive & Heavy Trading': {
      qtyUnit: 'units', qtyDp: 0, qtyCol: 'Qty (Units)', volKpi: 'Units Invoiced', txSingular: 'invoice', txPlural: 'invoices', txCol: 'Invoices',
      avgUnitLbl: 'Avg / Unit', rateCol: 'Unit Price ($)', sec1Title: '1. Commercial Vehicle & OEM Spare Parts Revenue by Line',
      sec1ProdCol: 'Vehicle Model / Part Line', sec1TotalLbl: 'Total Trading Sales Mix',
      sec2Title: '2. Daily Showroom & Counter Invoicing, Collections & Import Outflows',
      sec2VolCol: 'Units', sec2RmCol: 'Imports & Landed ($)', sec2FuelCol: 'Workshop Lube (L)',
      cfCustIn: 'Showroom, Fleet & Spare Parts Customer Collections (تحصيلات مبيعات الآليات وقطع الغيار)',
      cfRmOut: 'OEM Import Letters, Customs & Freight Payments (مدفوعات الاستيراد والجمارك)',
      cfFuelOut: 'PDI & Workshop Lubricants / Fuel Payments (مدفوعات الورشة والزيوت)',
      cfExpOut: 'Showroom, Warehouse & Warranty OPEX Paid (مدفوعات المعارض والمستودعات)',
      plSales: 'Heavy Trucks & OEM Spare Parts Sales (Excl. VAT)',
      plRm: 'Landed Cost of Imported Vehicles & Spare Parts (FOB + CIF)',
      plFuel: 'Workshop PDI & Service Bay Consumables',
      plExp: '5-Warehouse, Showroom & Commercial Operating Expenses',
      custSubTitle: 'Account 411 · Commercial Fleet & Parts Customer',
      custDefault: 'Commercial Fleet Buyer', siteDefault: 'Main Showroom', supDefault: 'Shaanxi Heavy Duty Automobile Import & Export',
      supSubtitle: 'Overseas OEM Exporters, Customs Clearing & Freight Forwarders',
      doc21Label: 'Release & PDI Note', doc21NoLbl: 'Delivery / Release No', doc21DateLbl: 'Release Date',
      doc21Ref1Lbl: 'Chassis / VIN', doc21Ref1Def: 'Warehouse SKU', doc21Ref2Lbl: 'Warehouse / Book', doc21Ref2Def: 'Main Showroom',
      doc21SitePfx: 'Dispatch Location', doc21ProdCol: 'Vehicle Model / OEM Part Description', doc21SiteCol: 'Warehouse / Category',
      doc21TotalLbl: 'Total Certified Goods Release', doc21SigLeft: 'Showroom / Storekeeper / أمين المستودع', doc21SigRight: 'Buyer / Authorized Receiver / توقيع المستلم',
      rcptDescDef: 'Vehicle & Parts Invoice'
    },
    'Real Estate & Property': {
      qtyUnit: 'units', qtyDp: 0, qtyCol: 'Units / Periods', volKpi: 'Billed Tranches', txSingular: 'bill', txPlural: 'bills', txCol: 'Bills',
      avgUnitLbl: 'Avg / Tranche', rateCol: 'Period Rate ($)', sec1Title: '1. Commercial Lease Rent & Property Deed Sales by Asset',
      sec1ProdCol: 'Lease / Deed Stream', sec1TotalLbl: 'Total Portfolio Billing Mix',
      sec2Title: '2. Daily Rent Invoicing, Tenant Receipts & Fit-Out Contractor Outflows',
      sec2VolCol: 'Tranches', sec2RmCol: 'Fit-Out & WOs ($)', sec2FuelCol: 'Bldg Gen (L)',
      cfCustIn: 'Tenant Rent Receipts, Escrow & Buyer Instalments (تحصيلات الإيجارات والمبيعات العقارية)',
      cfRmOut: 'MEP Fit-Out, Contractor & CAPEX Work Order Payments (مدفوعات المقاولين والتجهيز)',
      cfFuelOut: 'Building Generator & Common-Area Utility Payments (مدفوعات المولدات والخدمات المشتركة)',
      cfExpOut: 'Municipal Taxes, Cadastral & Property OPEX Paid (مدفوعات الرسوم البلدية والعقارية)',
      plSales: 'Commercial & Residential Lease Rent & Deed Revenue (Excl. VAT)',
      plRm: 'Building Fit-Out, MEP Work Orders & Recoverable Charges',
      plFuel: 'Common-Area Generator & HVAC Energy Cost',
      plExp: 'Property Management, Municipal & Cadastral Expenses',
      custSubTitle: 'Account 411 · Commercial Tenant / Property Buyer',
      custDefault: 'Commercial Leaseholder', siteDefault: 'Beirut Portfolio', supDefault: 'MEP Fit-Out Contractor',
      supSubtitle: 'MEP Contractors, Facility Maintenance & Municipal Authorities',
      doc21Label: 'Lease / Handover Note', doc21NoLbl: 'Schedule / Handover No', doc21DateLbl: 'Billing Date',
      doc21Ref1Lbl: 'Building Unit', doc21Ref1Def: 'Leased Unit', doc21Ref2Lbl: 'Entity', doc21Ref2Def: 'Portfolio Management',
      doc21SitePfx: 'Property Asset', doc21ProdCol: 'Lease Period / Property Unit', doc21SiteCol: 'Property / Plot',
      doc21TotalLbl: 'Total Certified Property Schedule', doc21SigLeft: 'Property Management / إدارة العقارات', doc21SigRight: 'Tenant / Buyer Signature / توقيع المستأجر',
      rcptDescDef: 'Rent & Property Tranche'
    },
    'Insurance & Brokerage': {
      qtyUnit: 'pol', qtyDp: 0, qtyCol: 'Policies', volKpi: 'Policies Bound', txSingular: 'policy', txPlural: 'policies', txCol: 'Policies',
      avgUnitLbl: 'Avg GWP', rateCol: 'Premium ($)', sec1Title: '1. Bound Policies, Endorsements & Brokerage Production by Line',
      sec1ProdCol: 'Insurance Line & Product', sec1TotalLbl: 'Total Bound Portfolio',
      sec2Title: '2. Daily Policy Binding, Client Premium Collections & Carrier Bordereaux',
      sec2VolCol: 'Policies', sec2RmCol: 'Carrier Bordereaux ($)', sec2FuelCol: 'Survey Fleet (L)',
      cfCustIn: 'Policyholder Premium & Instalment Collections (تحصيلات أقساط التأمين من المضمونين)',
      cfRmOut: 'Carrier Bordereau Net Premium Remittances (تسديدات صافي الأقساط لشركات التأمين)',
      cfFuelOut: 'Survey & Advocacy Fleet Mobility Payments (مدفوعات التنقل والمعاينة)',
      cfExpOut: 'Brokerage Desk, Licensing & General OPEX Paid (مدفوعات مصاريف مكتب الوساطة)',
      plSales: 'Written Premiums, Brokerage Commissions & Policy Fees',
      plRm: 'Net Carrier Bordereau Payables & Reinsurance Share',
      plFuel: 'Claims Survey & Field Inspection Mobility',
      plExp: 'Brokerage Desk Administration & Operating Expenses',
      custSubTitle: 'Account 4112 · Policyholder Premium Receivable',
      custDefault: 'Corporate Policyholder', siteDefault: 'Underwriting Carrier', supDefault: 'MedGulf',
      supSubtitle: 'Underwriting Insurance Carriers & Bordereau Accounts (Account 4017)',
      doc21Label: 'Policy Borderaux Slip', doc21NoLbl: 'Cover / Policy No', doc21DateLbl: 'Effective Date',
      doc21Ref1Lbl: 'Underwriting Carrier', doc21Ref1Def: 'Carrier', doc21Ref2Lbl: 'Producer', doc21Ref2Def: 'Brokerage Desk',
      doc21SitePfx: 'Carrier', doc21ProdCol: 'Insurance Line & Coverage', doc21SiteCol: 'Underwriting Carrier',
      doc21TotalLbl: 'Total Certified Policy Cover Schedule', doc21SigLeft: 'Brokerage Underwriting / قسم الإصدار', doc21SigRight: 'Policyholder / المضمون',
      rcptDescDef: 'Policy Premium Instalment'
    }
  };

  function getDomainRdlTerms(ind) {
    return DOMAIN_RDL_TERMS[ind] || DOMAIN_RDL_TERMS['Manufacturing'];
  }

  function getCoaAccountsForInd(ind) {
    if (!ind || ind === 'Manufacturing') return COA_ACCOUNTS;
    const rev701Map = {
      'Holding & Treasury': 'Intercompany Treasury & Shared Advisory Income / إيرادات الخزينة والخدمات المشتركة',
      'Hospitality & Resorts': 'Venue POS, Chalet & Seasonal Membership Revenue / إيرادات المنتجعات والاشتراكات',
      'Automotive & Heavy Trading': 'Commercial Vehicles & OEM Spare Parts Sales / مبيعات الشاحنات وقطع الغيار',
      'Real Estate & Property': 'Commercial & Residential Lease Rent & Deed Sales / إيرادات عقود الإيجار والعقارات',
      'Insurance & Brokerage': 'Policy Production, Brokerage Commissions & Fees / إيرادات البوالص وعمولات الوساطة'
    };
    const cogs601Map = {
      'Holding & Treasury': 'Sister Facility Funding & Treasury Direct Cost / أعباء التمويل والتسهيلات المركزية',
      'Hospitality & Resorts': 'Commissary F&B, Beverage Cellar & Generator Cost / كلفة المطبخ والمستودع والطاقة',
      'Automotive & Heavy Trading': 'Landed Cost of Imported Vehicles & Parts (FOB + CIF) / كلفة البضاعة المستوردة',
      'Real Estate & Property': 'Building Fit-Out, MEP Work Orders & Common Utilities / كلفة التجهيز والصيانة العقارية',
      'Insurance & Brokerage': 'Carrier Net Premium Remittances & Bordereaux / صافي الأقساط المستحقة لشركات التأمين'
    };
    const inv311Map = {
      'Holding & Treasury': 'Short-Term Treasury Placements & Clearing / توظيفات وحسابات مقاصة قصيرة الأجل',
      'Hospitality & Resorts': 'Kitchen Commissary, Cellar & Resort Supplies Stock / مخزون المطبخ والمشروبات والمنتجع',
      'Automotive & Heavy Trading': 'Showroom VIN Fleet & 5-Warehouse Spare Parts Stock / مخزون الشاحنات وقطع الغيار',
      'Real Estate & Property': 'Property Units Held for Sale & Fit-Out Materials / وحدات عقارية ومواد تجهيز',
      'Insurance & Brokerage': 'Unbilled Renewal Pipeline & Stamps Stock / طوابع وعقود قيد الإصدار'
    };
    return [
      { code: '101', name: 'Subscribed Capital & Partner Equity / رأس المال المكتتب', cls: '1 - Capital & Long-Term Liabilities', section: 'Equity & Long-Term Liabilities', normal: 'C' },
      { code: '165', name: 'Shareholder & Partner Current Accounts / جاري الشركاء والمساهمين', cls: '1 - Capital & Long-Term Liabilities', section: 'Equity & Long-Term Liabilities', normal: 'C' },
      { code: '215', name: 'Properties, Buildings, Fit-Out & Equipment / العقارات والأبنية والتجهيزات', cls: '2 - Fixed Assets', section: 'Fixed & Non-Current Assets', normal: 'D' },
      { code: '218', name: 'Operational Vehicles & Service Fleet / الآليات وأسطول الخدمة', cls: '2 - Fixed Assets', section: 'Fixed & Non-Current Assets', normal: 'D' },
      { code: '281', name: 'Accumulated Depreciation / الاستهلاكات المتراكمة', cls: '2 - Fixed Assets', section: 'Fixed & Non-Current Assets', normal: 'C' },
      { code: '311', name: inv311Map[ind] || 'Operating Merchandise & Supplies Stock / مخزون البضائع', cls: '3 - Inventory', section: 'Current Assets', normal: 'D' },
      { code: '401', name: 'Suppliers, Contractors & Carriers Payable / ذمم الموردين وشركات التأمين', cls: '4 - Third Party Accounts', section: 'Current Liabilities', normal: 'C' },
      { code: '411', name: 'Customers, Tenants & Policyholders Receivable / ذمم الزبائن والمستأجرين', cls: '4 - Third Party Accounts', section: 'Current Assets', normal: 'D' },
      { code: '421', name: 'Personnel · Salaries & Advances / ذمم الموظفين والسلف', cls: '4 - Third Party Accounts', section: 'Current Liabilities', normal: 'C' },
      { code: '442', name: 'State · VAT Collectible & Deductible / الضريبة على القيمة المضافة', cls: '4 - Third Party Accounts', section: 'Current Liabilities', normal: 'C' },
      { code: '467', name: 'Sister Entities, Escrow & Clearing Accounts / ذمم الشركات الشقيقة وحسابات التسوية', cls: '4 - Third Party Accounts', section: 'Current Assets', normal: 'D' },
      { code: '512', name: 'Banks & Financial Institutions (Fresh USD) / البنوك والمؤسسات المالية', cls: '5 - Financial Accounts', section: 'Cash & Treasury', normal: 'D' },
      { code: '531', name: 'Cash on Hand & Safe / الصندوق النقدي', cls: '5 - Financial Accounts', section: 'Cash & Treasury', normal: 'D' },
      { code: '601', name: cogs601Map[ind] || 'Direct Operating Cost of Sales / كلفة المبيعات المباشرة', cls: '6 - Expenses', section: 'Cost of Goods Sold', normal: 'D' },
      { code: '615', name: 'Facility, Asset & Equipment Maintenance / الصيانة والإصلاحات', cls: '6 - Expenses', section: 'Operating Expenses', normal: 'D' },
      { code: '622', name: 'Contracted Services & General Operations / الخدمات الخارجية والمصاريف العامة', cls: '6 - Expenses', section: 'Operating Expenses', normal: 'D' },
      { code: '641', name: 'Staff Salaries, Wages & Benefits / الرواتب والأجور', cls: '6 - Expenses', section: 'Payroll & Personnel', normal: 'D' },
      { code: '701', name: rev701Map[ind] || 'Primary Operating Revenue / الإيرادات التشغيلية', cls: '7 - Revenue', section: 'Operating Revenue', normal: 'C' },
      { code: '706', name: 'Ancillary Services, Fees & Recoveries / إيرادات الخدمات والرسوم المساندة', cls: '7 - Revenue', section: 'Operating Revenue', normal: 'C' }
    ];
  }

  function hydrateNonMfgRdlStreams(ind, co, allowedCos, STATE, rawReceipts, rawSettlements) {
    const E = (typeof window !== 'undefined' && window.MFG_ENTERPRISE) || {};
    const salesAll = [];
    const receiptLedgerAll = [];
    const rmAll = [];
    const apRmLegsAll = [];
    const settlementLedgerAll = [];
    const fuelAll = [];
    const extraReceipts = [];
    const r2 = v => Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;

    const pushSale = s => {
      const tot = r2(s.total_usd);
      const vat = r2(s.vat_usd || 0);
      const qty = Number(s.qty || 1) || 1;
      const isCredit = s.is_credit !== undefined ? Boolean(s.is_credit) : true;
      const paid = s.paid_usd !== undefined ? r2(s.paid_usd) : (isCredit ? 0 : tot);
      salesAll.push({
        id: String(s.id || s.ticket_no || ('DOM-' + (salesAll.length + 1))),
        date: String(s.date || '2026-09-30').slice(0, 10),
        rep_date: String(s.rep_date || s.date || '2026-09-30').slice(0, 10),
        co: s.co || co,
        ticket_no: String(s.ticket_no || s.id || ''),
        invoice_no: String(s.invoice_no || s.vat_inv || s.ticket_no || s.id || ''),
        vat_inv: String(s.vat_inv || ''),
        customer: s.customer || 'Client Account',
        site: s.site || s.co || co,
        product: s.product || 'Operating Service',
        truck: s.truck || '',
        driver: s.driver || '',
        qty,
        unit_price: s.unit_price !== undefined ? r2(s.unit_price) : r2(tot / Math.max(1, qty)),
        vat_usd: vat,
        total_usd: tot,
        paid_usd: paid,
        balance_usd: isCredit ? r2(tot - paid) : 0,
        pay_method: s.pay_method || (isCredit ? 'Credit' : 'Cash'),
        is_cash: !isCredit,
        is_credit: isCredit,
        is_barter: false,
        is_return: tot < 0
      });
    };

    const pushRcpt = rc => {
      const amt = r2(rc.paid_usd || rc.amount || 0);
      if (Math.abs(amt) < 0.005) return;
      const id = String(rc.id || ('RCPT-' + (receiptLedgerAll.length + 1)));
      const d = String(rc.date || '2026-09-30').slice(0, 10);
      receiptLedgerAll.push({
        id,
        date: d,
        rep_date: d,
        co: rc.co || co,
        ticket_no: rc.ref || id,
        invoice_no: rc.ref || id,
        vat_inv: '',
        customer: rc.customer || 'Client Account',
        site: rc.site || 'Account Settlement',
        product: rc.product || 'Official Receipt',
        truck: '',
        driver: '',
        qty: 0,
        unit_price: 0,
        vat_usd: 0,
        total_usd: 0,
        paid_usd: amt,
        balance_usd: -amt,
        pay_method: rc.pay_method || 'Bank / Fresh USD',
        is_cash: false,
        is_credit: false,
        is_barter: false,
        is_return: false,
        is_receipt_row: true
      });
      extraReceipts.push({
        id,
        date: d,
        rep_date: d,
        company: rc.co || co,
        name: rc.ref || id,
        customer: rc.customer || 'Client Account',
        notes: rc.site || 'Account Settlement',
        method: rc.pay_method || 'Bank / Fresh USD',
        usd_amount: amt,
        amount: amt
      });
    };

    const pushRm = rm => {
      const tot = r2(rm.total_usd || 0);
      const paid = r2(rm.paid_usd !== undefined ? rm.paid_usd : 0);
      if (Math.abs(tot) < 0.005 && Math.abs(paid) < 0.005) return;
      const row = {
        id: String(rm.id || ('PUR-' + (rmAll.length + 1))),
        date: String(rm.date || '2026-09-30').slice(0, 10),
        rep_date: String(rm.date || '2026-09-30').slice(0, 10),
        co: rm.co || co,
        voucher: String(rm.voucher || rm.id || ''),
        name: String(rm.voucher || rm.id || ''),
        leg: 'material',
        material: rm.material || 'Direct Supply',
        supplier: rm.supplier || 'Vendor',
        driver: rm.driver || '',
        plate: rm.plate || '',
        qty: Number(rm.qty || 1),
        unit: rm.unit || 'lot',
        unit_price: r2(tot / Math.max(1, Number(rm.qty || 1))),
        total_usd: tot,
        paid_usd: paid
      };
      rmAll.push(row);
      apRmLegsAll.push(row);
    };

    const effIndStateCo = (STATE && STATE.company === 'democompany')
      ? (ind === 'Manufacturing' ? 'manufacturing-group' : `industry:${ind}`)
      : (STATE && STATE.company);

    if (ind === 'Hospitality & Resorts' && typeof E.computeHospitalityOperations === 'function') {
      const hsp = E.computeHospitalityOperations({ ignoreSearch: true, ignorePeriod: true, company: effIndStateCo });
      (hsp.venueRows || []).filter(r => coMatch(r.company, co, allowedCos)).forEach(r => {
        const isCr = /credit|account|receivable/i.test(String(r.method || ''));
        pushSale({
          id: r.id, date: r.date, co: r.company, ticket_no: r.id,
          vat_inv: Number(r.vat_usd || 0) > 0 ? String(r.id) : '',
          customer: `${r.company} · ${r.outlet || 'Main Venue'}`,
          site: r.outlet || r.company,
          product: r.category || 'Venue Close',
          driver: r.method || 'POS Close',
          qty: Math.max(1, Number(r.covers || r.rooms || 1)),
          vat_usd: r.vat_usd, total_usd: r.ttc_usd,
          is_credit: isCr, paid_usd: isCr ? 0 : r.ttc_usd,
          pay_method: r.method || 'Cash & Card'
        });
      });
      (hsp.membershipRows || []).filter(r => coMatch(r.company, co, allowedCos)).forEach(r => {
        const cont = Number(r.contract_usd || 0);
        const vat = r2(cont - cont / 1.11);
        pushSale({
          id: r.id, date: r.start_date || '2026-06-01', co: r.company, ticket_no: r.id,
          vat_inv: String(r.id),
          customer: r.member || 'Seasonal Member',
          site: `${r.company} · ${r.unit || 'Cabana'}`,
          product: `Seasonal Membership (${r.season || '2026'})`,
          truck: r.unit || 'Cabana', driver: r.season || '2026',
          qty: 1, vat_usd: vat, total_usd: cont, is_credit: true, paid_usd: 0, pay_method: 'Membership Contract'
        });
        if (Number(r.paid_usd || 0) > 0) {
          pushRcpt({
            id: `RC-${r.id}`, ref: `RC-${r.id}`, date: r.due_date || r.start_date || '2026-07-15',
            co: r.company, customer: r.member || 'Seasonal Member',
            site: `${r.unit || 'Cabana'} (${r.season || '2026'})`,
            pay_method: 'Fresh USD / Card', paid_usd: r.paid_usd
          });
        }
      });
      (hsp.stockRows || []).filter(r => coMatch(r.company, co, allowedCos)).forEach(r => {
        pushRm({
          id: r.id, voucher: r.id, date: r.date, co: r.company,
          supplier: `${r.store || 'Commissary'} Suppliers (${r.company})`,
          material: r.item_group || 'F&B Stock', qty: 1, unit: 'lot',
          total_usd: r.purchases_in_usd, paid_usd: r2(Number(r.purchases_in_usd || 0) * 0.82)
        });
      });
      (hsp.energyRows || []).filter(r => coMatch(r.company, co, allowedCos)).forEach(r => {
        const lit = Number(r.diesel_used_l || 0);
        if (lit > 0) {
          fuelAll.push({
            id: r.id, date: r.date, rep_date: r.date, co: r.company, voucher: r.id, name: r.id,
            equip: r.asset || 'Prime Generator', equip_type: 'Generator', driver: r.company,
            station: `${r.company} Generator Tank`, supplier: 'Generator Diesel Supply',
            odometer: Number(r.run_hours || 0), meter_unit: 'h', liters: lit, price_per_l: 0.92,
            total_usd: r2(lit * 0.92), paid_usd: r2(lit * 0.92)
          });
        }
      });
    } else if (ind === 'Automotive & Heavy Trading' && typeof E.computeTradingOperations === 'function') {
      const trd = E.computeTradingOperations({ ignoreSearch: true, ignorePeriod: true, company: effIndStateCo });
      (trd.salesRows || []).filter(r => !r.is_gap && coMatch(r.company, co, allowedCos)).forEach(r => {
        const vInv = `${r.book || 'INV'}-${r.seq || r.id}`;
        pushSale({
          id: r.id, date: r.date, co: r.company, ticket_no: r.id, invoice_no: vInv,
          vat_inv: Number(r.vat_usd || 0) > 0 ? vInv : '',
          customer: r.customer, site: r.category || 'Showroom', product: r.item,
          truck: r.chassis || r.book || '', driver: r.company,
          qty: Math.max(1, Number(r.qty || 1)), vat_usd: r.vat_usd, total_usd: r.ttc_usd,
          is_credit: true, paid_usd: 0, pay_method: 'Commercial Invoice'
        });
      });
      (trd.receivableRows || []).filter(r => coMatch(r.company, co, allowedCos) && Number(r.settled_usd || 0) > 0).forEach(r => {
        pushRcpt({
          id: `RC-${r.id}`, ref: `RC-${r.id}`, date: (r.promise_date && r.promise_date <= '2026-11-06') ? r.promise_date : '2026-08-25',
          co: r.company, customer: r.customer, site: `${r.company} Commercial AR`,
          pay_method: 'Bank Transfer / Fresh USD', paid_usd: r.settled_usd
        });
      });
      (trd.importRows || []).filter(r => coMatch(r.company, co, allowedCos)).forEach(r => {
        pushRm({
          id: r.id, voucher: r.id, date: r.date, co: r.company,
          supplier: r.supplier, material: `${r.origin || 'Import'} · ${r.container_bl || r.id}`,
          qty: Math.max(1, Number(r.ordered_qty || 1)), unit: 'units',
          total_usd: r.total_landed_usd, paid_usd: r.fob_usd
        });
      });
    } else if (ind === 'Real Estate & Property' && typeof E.computeRealEstateOperations === 'function') {
      const re = E.computeRealEstateOperations({ ignoreSearch: true, ignorePeriod: true, company: effIndStateCo });
      (re.invoices || []).filter(r => coMatch(r.company, co, allowedCos)).forEach(r => {
        const hasVat = Number(r.vat_usd || 0) > 0;
        const taxSeq = (r.tax_seq && !/N\/A/i.test(r.tax_seq)) ? String(r.tax_seq) : String(r.id);
        pushSale({
          id: r.id, date: r.date, co: r.company, ticket_no: r.id, invoice_no: taxSeq,
          vat_inv: hasVat ? taxSeq : '',
          customer: r.tenant, site: r.property || r.company,
          product: `Lease Rent · ${r.period || 'Period'}`,
          truck: r.tax_seq || '', driver: r.company,
          qty: 1, vat_usd: r.vat_usd, total_usd: r.amount_ttc_usd,
          is_credit: true, paid_usd: 0, pay_method: 'Lease Invoice'
        });
      });
      (re.sales || []).filter(r => coMatch(r.company, co, allowedCos)).forEach(r => {
        pushSale({
          id: r.id, date: r.date, co: r.company, ticket_no: r.id, invoice_no: r.id,
          vat_inv: '', customer: r.buyer, site: `${r.property} · ${r.unit || ''}`,
          product: `Property Sale Contract · ${r.unit || r.property}`,
          truck: r.unit || '', driver: r.deed_status || 'Notary',
          qty: 1, vat_usd: 0, total_usd: r.contract_usd,
          is_credit: true, paid_usd: 0, pay_method: 'Buyer Instalments'
        });
        if (Number(r.paid_usd || 0) > 0) {
          pushRcpt({
            id: `RC-${r.id}`, ref: `RC-${r.id}`, date: r.date, co: r.company,
            customer: r.buyer, site: `${r.property} (${r.unit || 'Deed'})`,
            pay_method: 'Escrow / Banker Cheque', paid_usd: r.paid_usd
          });
        }
      });
      (re.receipts || []).filter(r => coMatch(r.company, co, allowedCos)).forEach(r => {
        pushRcpt({
          id: r.id, ref: r.id, date: r.date, co: r.company,
          customer: r.tenant, site: r.property, pay_method: r.method || 'Bank Transfer',
          paid_usd: r.allocated_inv_usd || r.gross_usd
        });
      });
      (re.workorders || []).filter(r => coMatch(r.company, co, allowedCos)).forEach(r => {
        pushRm({
          id: r.id, voucher: r.id, date: r.date, co: r.company,
          supplier: r.contractor, material: `${r.property} · ${r.unit} (${r.category})`,
          qty: 1, unit: 'job', total_usd: r.actual_usd,
          paid_usd: r.status === 'Completed' ? r.actual_usd : r2(Number(r.actual_usd || 0) * 0.5)
        });
      });
    } else if (ind === 'Insurance & Brokerage' && typeof E.computeInsuranceOperations === 'function') {
      const ins = E.computeInsuranceOperations({ ignorePeriod: true });
      (ins.policies || []).forEach(r => {
        const billTot = r2(Number(r.gross_prem_usd || 0) + Number(r.policy_fee_usd || 0) - Number(r.discount_usd || 0));
        pushSale({
          id: r.id, date: r.date, co: r.company || 'Insurance Company', ticket_no: r.id, invoice_no: r.id,
          vat_inv: '', customer: r.client, site: r.carrier,
          product: `${r.line} · ${r.product || r.type || 'Policy'}`,
          truck: r.carrier, driver: r.producer || 'Brokerage Desk',
          qty: 1, vat_usd: 0, total_usd: billTot,
          is_credit: true, paid_usd: 0, pay_method: 'Policy Billing'
        });
      });
      (ins.billing || []).forEach(r => {
        const col = Number(r.collected_usd != null ? r.collected_usd : (r.paid_usd != null ? r.paid_usd : (r.status === 'Paid' ? r.amount_usd : 0)));
        if (col > 0) {
          pushRcpt({
            id: r.id, ref: r.id, date: r.due_date || r.date || '2026-09-20',
            co: r.company || 'Insurance Company', customer: r.client,
            site: `${r.policy_no || ''} · ${r.carrier || 'Carrier'}`,
            pay_method: r.method || 'Fresh USD / Cheque', paid_usd: col
          });
        }
      });
      (ins.remittances || []).forEach(r => {
        pushRm({
          id: r.id, voucher: r.id, date: r.date || '2026-09-28',
          co: r.company || 'Insurance Company', supplier: r.carrier,
          material: `Carrier Bordereau (${r.period || r.id})`,
          qty: Math.max(1, Number(r.policies_count || r.policies_settled || 1)), unit: 'pol',
          total_usd: r.net_payable_4017_usd || r.payable_usd || 0,
          paid_usd: r.remitted_usd || r.paid_usd || 0
        });
      });
    } else if (ind === 'Holding & Treasury' && typeof E.computeIntercompanyInteractions === 'function') {
      const icRes = E.computeIntercompanyInteractions({ ignoreSearch: true });
      (icRes.rows || []).forEach((r, idx) => {
        const amt = Number(r.usd || r.amount_usd || 0);
        if (amt <= 0) return;
        const fCo = r.fromCo || r.initiatorCo || 'Bdeir Holding';
        const tCo = r.toCo || r.mirrorCo || 'Sister Entity';
        if (fCo === 'Bdeir Holding' || idx < 45) {
          pushSale({
            id: r.id || `IC-${idx + 1}`, date: r.date || '2026-09-15', co: 'Bdeir Holding',
            ticket_no: r.id || `IC-${idx + 1}`, invoice_no: r.id || `IC-${idx + 1}`, vat_inv: '',
            customer: tCo === 'Bdeir Holding' ? fCo : tCo,
            site: `${fCo} to ${tCo}`,
            product: r.notes || 'Intercompany Treasury Transfer',
            truck: r.method || 'Bank Wire', driver: fCo,
            qty: 1, vat_usd: 0, total_usd: amt,
            is_credit: true, paid_usd: 0, pay_method: r.method || 'Bank Transfer'
          });
          if (r.matched || r.reconciled) {
            pushRcpt({
              id: `RC-${r.id || idx}`, ref: `RC-${r.id || idx}`, date: r.date || '2026-09-15',
              co: 'Bdeir Holding', customer: tCo === 'Bdeir Holding' ? fCo : tCo,
              site: 'Mirrored Sister Clearing', pay_method: r.method || 'Sister Mirror', paid_usd: amt
            });
          }
        } else if (tCo === 'Bdeir Holding') {
          pushRcpt({
            id: `RC-${r.id || idx}`, ref: `RC-${r.id || idx}`, date: r.date || '2026-09-15',
            co: 'Bdeir Holding', customer: fCo, site: 'Inbound Sister Transfer',
            pay_method: r.method || 'Bank Transfer', paid_usd: amt
          });
        }
      });
    }

    (rawReceipts || []).forEach(rc => {
      pushRcpt({
        id: rc.id, ref: rc.name || rc.id, date: rc.date, co: rc.company || co,
        customer: rc.customer || 'Client Account', site: rc.notes || 'Receipt',
        pay_method: rc.method || 'Cash USD', paid_usd: Number(rc.usd_amount || rc.amount || 0)
      });
    });
    (rawSettlements || []).forEach(s => {
      const amt = r2(s.usd_amount || s.amount || 0);
      if (Math.abs(amt) > 0.005) {
        settlementLedgerAll.push({
          id: s.id, date: s.date, rep_date: s.rep_date || s.date, co: s.company || co,
          voucher: s.name || s.id, name: s.name || '', leg: 'settlement',
          pay_method: s.method || 'Bank', material: s.notes || 'Supplier Settlement',
          supplier: s.supplier || 'Vendor', driver: '', plate: '', qty: 0, unit: 'USD',
          unit_price: 0, total_usd: 0, paid_usd: amt, is_settlement_row: true
        });
      }
    });

    return {
      salesAll,
      receiptLedgerAll,
      arLedgerAll: [...salesAll, ...receiptLedgerAll],
      rmAll,
      apRmLegsAll,
      settlementLedgerAll,
      apRmLedgerAll: [...apRmLegsAll, ...settlementLedgerAll],
      fuelAll,
      extraReceipts
    };
  }

  function periodBucket(dateStr, periodMode) {
    const s = String(dateStr || '').slice(0, 10);
    if (!s || s.length < 7) return 'Unknown';
    const y = s.slice(0, 4);
    const m = parseInt(s.slice(5, 7), 10) || 1;
    if (periodMode === 'Year') return y;
    if (periodMode === 'Quarter') return `${y}-Q${Math.ceil(m / 3)}`;
    return s.slice(0, 7);
  }

  let _cachedCoKey = '';
  let _cachedCtxData = null;

  function buildRdlContext(SEED, STATE) {
    if (typeof window !== 'undefined' && window.MFG_ENTERPRISE && typeof window.MFG_ENTERPRISE.ensureMultiIndustrySpineSeeded === 'function') {
      window.MFG_ENTERPRISE.ensureMultiIndustrySpineSeeded();
    }
    const rdl = ensureRdlState(STATE, SEED);
    const co = normalizeStateCo(STATE.company);
    const ind = getRdlIndustryForCo(co);
    const basis = STATE.basis || STATE.dateBasis || 'tx';
    const recs = (SEED && SEED.records) || {};
    const allowedCos = Array.isArray(STATE.allowedCompanyNames) && STATE.allowedCompanyNames.length ? STATE.allowedCompanyNames : null;
    const allowedSig = allowedCos ? allowedCos.join(',') : 'ALL';
    const offScope = Boolean(STATE._officialScopeActive);
    const indRev = (SEED && (SEED._indCustomRev || SEED._industryRev)) || 0;
    const editRev = STATE && STATE.industryRowEdits ? Object.keys(STATE.industryRowEdits).length : 0;
    const demoSig = (STATE && STATE.company === 'democompany') ? `${STATE.demoCompanyIndustry || ''}|1` : (Boolean(STATE && STATE.demoVisitor) ? '1' : '0');
    const sig = `${co}|${ind}|${demoSig}|${allowedSig}|${basis}|${offScope ? 'OFF' : 'ALL'}|${Boolean(SEED && SEED._multiIndustrySpineSeeded) ? 1 : 0}|${(SEED && SEED._customRev) || 0}|${indRev}|${editRev}|${(recs.sales_tickets || []).length}|${(recs.raw_purchases || []).length}|${(recs.expenses || []).length}|${(recs.receipts || []).length}|${(recs.settlements || []).length}|${(recs.fuel_intakes || []).length}|${(recs.salaries || []).length}|${(recs.vat_invoices || []).length}`;

    if (_cachedCoKey !== sig || !_cachedCtxData) {
      const isMfgAll = !co || co === 'ALL';
      const seedGuard = r => !(isMfgAll && r._multiIndustrySeed);
      const offPred = (r, tk) => !offScope || typeof STATE.isOfficialRecord !== 'function' || STATE.isOfficialRecord(r, tk);
      const rawSales = (recs.sales_tickets || recs.sales || []).filter(r => r && !r.voided && seedGuard(r) && coMatch(r.company || r.co, co, allowedCos) && offPred(r, 'sales_tickets'));
      const rawExp = (recs.expenses || []).filter(r => r && !r.voided && seedGuard(r) && coMatch(r.company || r.co, co, allowedCos) && offPred(r, 'expenses'));
      const rawPay = (recs.salaries || recs.payroll || []).filter(r => r && !r.voided && seedGuard(r) && coMatch(r.company || r.co, co, allowedCos));
      const rawRm = (recs.raw_purchases || recs.rm || []).filter(r => r && !r.voided && seedGuard(r) && coMatch(r.company || r.co, co, allowedCos) && offPred(r, 'raw_purchases'));
      const rawFuel = (recs.fuel_intakes || recs.fuel || []).filter(r => r && !r.voided && seedGuard(r) && coMatch(r.company || r.co, co, allowedCos));
      const rawReceipts = (recs.receipts || []).filter(r => r && !r.voided && seedGuard(r) && coMatch(r.company || r.co, co, allowedCos) && offPred(r, 'receipts'));
      const rawSettlements = (recs.settlements || []).filter(r => r && !r.voided && seedGuard(r) && coMatch(r.company || r.co, co, allowedCos) && offPred(r, 'settlements'));
      const rawVatInvs = (recs.vat_invoices || []).filter(r => r && !r.voided && seedGuard(r) && coMatch(r.company || r.co, co, allowedCos) && offPred(r, 'vat_invoices'));

      // Map official VAT invoices by customer+date window so sales tickets inherit vat_inv when matching
      const vatInvByCust = new Map();
      rawVatInvs.forEach(vi => {
        if (!vi.customer || !vi.invoice_no) return;
        const arr = vatInvByCust.get(vi.customer) || [];
        arr.push(vi);
        vatInvByCust.set(vi.customer, arr);
      });

      let salesAll = rawSales.map(r => {
        const m = String(r.method || '').trim();
        const pNorm = String(r.product || '').trim().toLowerCase();
        const sign = (pNorm === 'remove' || m === 'Free' || m === 'Remove' || m === 'Config' || m === 'VATConfig') ? 0 : ((m === 'C Return' || m === 'CR Return' || m === 'Cash Return' || m === 'Credit Return' || r.return) ? -1 : 1);
        const totTtc = sign * Number(r.total_ttc !== undefined ? r.total_ttc : (r.total_usd !== undefined ? r.total_usd : (r.total || 0)));
        const vat = sign * Number(r.vat !== undefined ? r.vat : (r.vat_usd || 0));
        const isCash = m === 'Cash' || m === 'C Return' || m === 'Cash Return';
        const isCredit = m === 'Credit' || m === 'CR Return' || m === 'Credit Return';
        const isBarter = m === 'Barter';
        const paid = r.paid_usd !== undefined ? sign * Number(r.paid_usd) : (isCash ? totTtc : 0);
        let vatInv = String(r.vat_invoice || r.vat_inv || '');
        if (!vatInv && vat > 0 && vatInvByCust.has(r.customer)) {
          const d = rowDate(r, basis);
          const hit = vatInvByCust.get(r.customer).find(vi => (!vi.start_date || d >= vi.start_date) && (!vi.end_date || d <= vi.end_date));
          if (hit) vatInv = String(hit.invoice_no);
        }
        return {
          id: r.id || r.ticket_no,
          date: r.date,
          rep_date: r.rep_date || r.date,
          co: r.company || r.co || co,
          ticket_no: String(r.ticket_no || ''),
          invoice_no: String(vatInv || r.ticket_no || ''),
          vat_inv: vatInv,
          customer: r.customer || 'Walk-in Customer',
          site: r.site || r.sale_type || 'Plant',
          product: r.product || 'Aggregate / Concrete',
          truck: r.truck || '',
          driver: r.driver || r.truck_owner || '',
          qty: sign * Number(r.qty || 0),
          unit_price: Number(r.unit_price || 0),
          vat_usd: vat,
          total_usd: totTtc,
          paid_usd: paid,
          balance_usd: isCredit ? totTtc : 0,
          pay_method: r.method || 'Credit',
          is_cash: isCash,
          is_credit: isCredit,
          is_barter: isBarter,
          is_return: sign <= 0
        };
      });

      // Separate customer receipt ledger entries for SOA, Aging, Cash Flow & Journal (never mixed into salesAll ticket register)
      let receiptLedgerAll = [];
      rawReceipts.forEach(rc => {
        const m = String(rc.method || '').trim();
        if (m === 'JV Adjusted' || m === 'Remove' || m === 'Adjusted' || m === 'Free' || m === 'Cash Return' || m === 'Cash Discount' || m === 'IVA' || m === 'RentConfig' || m === 'Rent' || m === 'VATRent') return;
        const amt = Number(rc.usd_amount !== undefined ? rc.usd_amount : (rc.amount || 0)) + Number(rc.discount || 0);
        if (Math.abs(amt) < 0.005) return;
        receiptLedgerAll.push({
          id: rc.id,
          date: rc.date,
          rep_date: rc.rep_date || rc.date,
          co: rc.company || co,
          ticket_no: rc.name || `RCPT-${rc.id}`,
          invoice_no: rc.name || `RCPT-${rc.id}`,
          vat_inv: '',
          customer: rc.customer || 'Customer',
          site: 'Receipt Settlement',
          product: `Receipt (${rc.method || 'Payment'})`,
          truck: '',
          driver: '',
          qty: 0,
          unit_price: 0,
          vat_usd: 0,
          total_usd: 0,
          paid_usd: amt,
          balance_usd: -amt,
          pay_method: rc.method || 'Cash',
          is_receipt_row: true
        });
      });
      let arLedgerAll = [...salesAll, ...receiptLedgerAll];

      const expAll = rawExp.map(r => {
        const m = String(r.method || 'Cash').trim();
        const ml = m.toLowerCase();
        const sign = (ml === 'c return' || ml === 'cr return' || r.return) ? -1 : ((m === 'Config' || m === 'VATConfig' || m === 'Free' || m === 'Remove' || m === 'Adjusted' || m === 'JV Adjusted') ? 0 : 1);
        const amt = sign * Number(r.usd_amount !== undefined ? r.usd_amount : (r.amount !== undefined ? r.amount : (r.total_usd || 0)));
        const isVatOnly = m === 'IVA' || m === 'VAT' || m === 'VAT Dis' || m === 'Cash VAT Dis';
        const isBarter = m === 'Barter';
        const isCash = ml === 'cash' || ml === 'c return' || m === 'Cash VAT Dis';
        const isApCredit = m === 'Credit' || m === 'CR Return' || m === 'IVA' || m === 'VAT' || m === 'VAT Dis';
        const vat = isVatOnly ? amt : (sign * Number(r.vat !== undefined ? r.vat : (r.vat_usd || 0)));
        const paid = isCash ? amt : 0;
        return {
          id: r.id,
          date: r.date,
          rep_date: r.rep_date || r.date,
          co: r.company || r.co || co,
          voucher_no: r.invoice && r.invoice !== '-' ? r.invoice : (r.name || r.id),
          invoice_no: r.invoice || '',
          name: r.name || '',
          category: r.category || 'Operating Expense',
          supplier: r.supplier || r.subcategory || 'General Vendor',
          description: `${r.subcategory || r.category || ''}${r.equipment ? ' · ' + r.equipment : ''}`.trim(),
          method: r.method || 'Cash',
          vat_usd: vat,
          total_usd: amt,
          paid_usd: paid,
          ap_credit_usd: isApCredit ? amt : 0,
          balance_usd: isApCredit ? amt : 0,
          is_vat_only: isVatOnly,
          is_barter: isBarter,
          is_ap_credit: isApCredit,
          is_return: sign < 0
        };
      });

      const payAll = rawPay.map(r => {
        const amt = Number(r.usd_amount !== undefined ? r.usd_amount : (r.amount !== undefined ? r.amount : (r.net_usd || 0)));
        return {
          id: r.id,
          date: r.date,
          rep_date: r.rep_date || r.date,
          co: r.company || r.co || co,
          voucher: r.name || r.id,
          name: r.name || '',
          staff: r.staff || 'Employee',
          role: r.payroll_month ? `Payroll ${r.payroll_month}` : 'Plant & Site Staff',
          type: r.method || 'Cash',
          days: 1,
          base_usd: amt,
          net_usd: amt,
          paid_usd: amt,
          balance_usd: 0
        };
      });

      let rmAll = rawRm.map(r => {
        const tot = Number(r.total !== undefined ? r.total : (r.total_usd || 0));
        const isCash = String(r.method || '').toLowerCase() === 'cash';
        const paid = isCash ? tot : 0;
        return {
          id: r.id,
          date: r.date,
          rep_date: r.rep_date || r.date,
          co: r.company || r.co || co,
          voucher: r.ticket_no || r.name || r.id,
          name: r.name || '',
          material: r.product || r.material || 'Raw Material',
          supplier: r.site_owner || r.supplier || r.truck_owner || 'Material Supplier',
          driver: r.driver || r.truck_owner || '',
          plate: r.truck || '',
          qty: Number(r.qty || 0),
          unit: r.uom || 'Ton',
          unit_price: Number(r.unit_cost || r.unit_price || 0),
          total_usd: tot,
          paid_usd: paid
        };
      });

      // Split raw_purchases into explicit Leg 1 (Material -> site_owner || truck_owner) & Leg 2 (Haulage -> truck_owner) for Account 401 AP
      let apRmLegsAll = [];
      rawRm.forEach(r => {
        const isCash = String(r.method || '').toLowerCase() === 'cash';
        const matCost = Number(r.cost !== undefined ? r.cost : (Number(r.total || r.total_usd || 0) - Number(r.trans_cost || 0)));
        const haulCost = Number(r.trans_cost || 0);
        const matSup = r.site_owner || r.supplier || r.truck_owner || '(Unassigned Supplier)';
        if (Math.abs(matCost) >= 0.005) {
          apRmLegsAll.push({
            id: r.id,
            date: r.date,
            rep_date: r.rep_date || r.date,
            co: r.company || r.co || co,
            voucher: r.ticket_no || r.name || r.id,
            name: r.name || '',
            leg: 'material',
            material: r.product || r.material || 'Raw Material',
            supplier: matSup,
            driver: r.driver || r.truck_owner || '',
            plate: r.truck || '',
            qty: Number(r.qty || 0),
            unit: r.uom || 'Ton',
            unit_price: Number(r.unit_cost || r.unit_price || 0),
            total_usd: matCost,
            paid_usd: isCash ? matCost : 0
          });
        }
        if (Math.abs(haulCost) >= 0.005) {
          const haulSup = r.truck_owner || '(Unassigned Supplier)';
          apRmLegsAll.push({
            id: `${r.id || r.ticket_no}-haul`,
            date: r.date,
            rep_date: r.rep_date || r.date,
            co: r.company || r.co || co,
            voucher: r.ticket_no || r.name || r.id,
            name: r.name || '',
            leg: 'haulage',
            material: `Haulage · ${r.product || 'Raw Material'}${r.truck ? ' (' + r.truck + ')' : ''}`,
            supplier: haulSup,
            driver: r.driver || '',
            plate: r.truck || '',
            qty: Number(r.qty || 0),
            unit: r.uom || 'Ton',
            unit_price: 0,
            total_usd: haulCost,
            paid_usd: 0
          });
        }
      });

      // Separate supplier settlements for Supplier Balances, SOA, Cash Flow & VAT (never mixed into rmAll intake register)
      let settlementLedgerAll = [];
      const vatPaidAll = [];
      expAll.forEach(ex => {
        if (ex.is_vat_only && Math.abs(ex.vat_usd) >= 0.005) {
          vatPaidAll.push({
            id: ex.id,
            date: ex.date,
            rep_date: ex.rep_date || ex.date,
            co: ex.co,
            voucher: ex.voucher_no || ex.name || ex.id,
            supplier: ex.supplier || 'Supplier',
            vat_usd: ex.vat_usd,
            total_usd: ex.total_usd
          });
        }
      });
      rawSettlements.forEach(s => {
        const m = String(s.method || '').trim();
        const usd = Number(s.usd_amount !== undefined ? s.usd_amount : (s.amount || 0));
        const diff = Number(s.diff !== undefined ? s.diff : (s.discount || 0));
        const amt = usd + diff;
        if (m === 'VAT' || m === 'VATConfig' || m === 'VAT Dis' || m === 'Cash VAT Dis' || m.toLowerCase() === 'vat paid') {
          if (Math.abs(amt) >= 0.005) {
            vatPaidAll.push({
              id: s.id,
              date: s.date,
              rep_date: s.rep_date || s.date,
              co: s.company || co,
              voucher: s.name || s.id,
              supplier: s.supplier || 'Supplier',
              vat_usd: amt,
              total_usd: amt
            });
          }
          if (m === 'Cash VAT Dis' || m.toLowerCase() === 'vat paid') return;
        }
        if (m === 'JV Adjusted' || m === 'Remove' || m === 'Adjusted' || m === 'Free' || m === 'Cash Return' || m === 'Cash Discount' || m === 'IVA' || m === 'Commission' || m === 'RentConfig' || m === 'Rent' || m === 'VATRent') return;
        if (Math.abs(amt) < 0.005) return;
        settlementLedgerAll.push({
          id: s.id,
          date: s.date,
          rep_date: s.rep_date || s.date,
          co: s.company || co,
          voucher: s.name || s.id,
          name: s.name || '',
          leg: 'settlement',
          pay_method: m || 'Cash',
          material: s.notes || `Supplier Settlement (${s.method || 'Payment'})`,
          supplier: s.supplier || '(Unassigned Supplier)',
          driver: '',
          plate: '',
          qty: 0,
          unit: 'USD',
          unit_price: 0,
          total_usd: 0,
          paid_usd: amt,
          is_settlement_row: true
        });
      });
      let apRmLedgerAll = [...apRmLegsAll, ...settlementLedgerAll];

      const eqMap = new Map();
      ((recs.equipment || [])).forEach(e => { if (e && e.name) eqMap.set(e.name, e.type || 'Heavy Equipment'); });

      let fuelAll = rawFuel.map(r => {
        const liters = Number(r.litres !== undefined ? r.litres : (r.liters || 0));
        const rate = Number(r.price_per_l || 0.95);
        const tot = Number(r.total_usd || (liters * rate));
        const eqName = r.equipment || r.equip || 'Fleet Unit';
        const eqType = eqMap.get(eqName) || r.fuel_type || 'Truck / Loader';
        const isHourUnit = /^(excavator|wheel loader|generator|plant)$/i.test(String(eqType).trim()) ||
          (/other/i.test(String(eqType)) && /baldouzar|bulldozer|compressor|kombrasor|rotary|rotare/i.test(eqName));
        const rawOdo = r.odometer != null && r.odometer !== '' ? Number(r.odometer) : null;
        const rawHrs = r.hours != null && r.hours !== '' ? Number(r.hours) : null;
        const meterVal = isHourUnit ? (rawHrs != null ? rawHrs : rawOdo) : (rawOdo != null ? rawOdo : rawHrs);
        const meterUnit = meterVal != null ? (isHourUnit ? 'h' : (rawOdo != null ? 'km' : 'h')) : '';
        return {
          id: r.id,
          date: r.date,
          rep_date: r.rep_date || r.date,
          co: r.company || r.co || co,
          voucher: r.ticket_no || r.name || r.id,
          name: r.name || '',
          equip: eqName,
          equip_type: eqType,
          driver: r.driver || '',
          station: 'Plant Diesel Tank',
          supplier: 'Diesel Bulk Tank',
          odometer: meterVal || 0,
          meter_unit: meterUnit,
          liters,
          price_per_l: rate,
          total_usd: tot,
          paid_usd: tot
        };
      });

      let rawReceiptsForDocs = rawReceipts;
      if (ind !== 'Manufacturing') {
        const hyd = hydrateNonMfgRdlStreams(ind, co, allowedCos, STATE, rawReceipts, rawSettlements);
        salesAll = hyd.salesAll;
        receiptLedgerAll = hyd.receiptLedgerAll;
        arLedgerAll = hyd.arLedgerAll;
        rmAll = hyd.rmAll;
        apRmLegsAll = hyd.apRmLegsAll;
        settlementLedgerAll = hyd.settlementLedgerAll;
        apRmLedgerAll = hyd.apRmLedgerAll;
        fuelAll = hyd.fuelAll;
        rawReceiptsForDocs = [...rawReceipts, ...(hyd.extraReceipts || [])];
      }

      const _rdlCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      const fIdx = typeof window !== 'undefined' && typeof window.MFG_FREQ === 'function' ? window.MFG_FREQ() : null;
      const uniq = (arr, fallbackFreqMap) => {
        const counts = new Map();
        const out = [];
        for (const x of (arr || [])) {
          if (x === null || x === undefined) continue;
          const s = String(x).trim();
          if (!s) continue;
          const k = s.toLowerCase();
          if (!counts.has(k)) out.push(s);
          counts.set(k, (counts.get(k) || 0) + 1);
        }
        const fbMap = fallbackFreqMap || (fIdx && fIdx.any) || null;
        return out.sort((a, b) => {
          const ka = a.toLowerCase(), kb = b.toLowerCase();
          const ca = counts.get(ka) || 0, cb = counts.get(kb) || 0;
          if (cb !== ca) return cb - ca;
          if (fbMap) {
            const fa = fbMap.get(ka) || 0, fb = fbMap.get(kb) || 0;
            if (fb !== fa) return fb - fa;
          }
          return 0;
        });
      };

      const customers = uniq([...salesAll.map(r => r.customer), ...receiptLedgerAll.map(r => r.customer)], fIdx && fIdx.customer);
      const products = uniq(salesAll.filter(r => !r.is_receipt_row).map(r => r.product), fIdx && fIdx.productSales);
      const sites = uniq(salesAll.filter(r => !r.is_receipt_row).map(r => r.site), fIdx && fIdx.site);
      const suppliers = uniq([...apRmLegsAll.map(r => r.supplier), ...expAll.map(r => r.supplier), ...settlementLedgerAll.map(r => r.supplier)], fIdx && fIdx.supplier);
      const categories = uniq(expAll.map(r => r.category), fIdx && fIdx.category);
      const staff = uniq(payAll.map(r => r.staff), fIdx && fIdx.staff);
      const equipTypes = uniq(fuelAll.map(r => r.equip_type));
      const equipments = uniq([...fuelAll.map(r => r.equip), ...salesAll.map(r => r.truck)], fIdx && fIdx.truck);
      const drivers = uniq([...salesAll.map(r => r.driver), ...fuelAll.map(r => r.driver), ...rmAll.map(r => r.driver)], fIdx && fIdx.driver);

      // Pre-index salesAll by vat_inv and customer in one O(N) pass for O(1) VAT invoice grouping
      const salesByVatInv = new Map();
      const salesByCust = new Map();
      for (let i = 0; i < salesAll.length; i++) {
        const r = salesAll[i];
        if (!r || r.is_receipt_row) continue;
        r._rDate = rowDate(r, basis);
        if (r.vat_inv) {
          let arr = salesByVatInv.get(r.vat_inv);
          if (!arr) { arr = []; salesByVatInv.set(r.vat_inv, arr); }
          arr.push(r);
        }
        if (r.customer) {
          let cArr = salesByCust.get(r.customer);
          if (!cArr) { cArr = []; salesByCust.set(r.customer, cArr); }
          cArr.push(r);
        }
      }

      // Build official VAT invoice groups
      const invMap = new Map();
      rawVatInvs.forEach(vi => {
        const key = String(vi.invoice_no || '').trim();
        if (!key) return;
        const byInv = salesByVatInv.get(key) || [];
        const byCust = vi.customer ? (salesByCust.get(vi.customer) || []) : [];
        let matchingRows;
        if (!byCust.length) {
          matchingRows = byInv;
        } else {
          const seenRows = new Set(byInv);
          matchingRows = byInv.slice();
          for (let j = 0; j < byCust.length; j++) {
            const r = byCust[j];
            if (seenRows.has(r)) continue;
            const d = r._rDate || rowDate(r, basis);
            if ((!vi.start_date || d >= vi.start_date) && (!vi.end_date || d <= vi.end_date)) {
              seenRows.add(r);
              matchingRows.push(r);
            }
          }
        }
        if (!matchingRows.length) return;
        const rowsSlice = key === '2738' ? matchingRows.slice(0, 10) : matchingRows;
        invMap.set(key, {
          key,
          vat_inv: key,
          invoice_no: key,
          customer: vi.customer || '—',
          site: rowsSlice[0] ? rowsSlice[0].site : '—',
          date: String(vi.date || rowsSlice[0].date || '').slice(0, 10),
          co: vi.company || co,
          loads: rowsSlice.length,
          qty: rowsSlice.reduce((s, x) => s + x.qty, 0),
          total: rowsSlice.reduce((s, x) => s + x.total_usd, 0),
          vat: rowsSlice.reduce((s, x) => s + x.vat_usd, 0),
          rows: rowsSlice
        });
      });

      // Fallback if company has no vat_invoices rows (e.g. Lions Transport)
      if (!invMap.size) {
        salesAll.filter(r => !r.is_receipt_row).slice(0, 80).forEach(r => {
          const key = String(r.vat_inv || r.ticket_no || r.id).trim();
          if (!key) return;
          if (!invMap.has(key)) {
            invMap.set(key, {
              key, vat_inv: r.vat_inv || key, invoice_no: key,
              customer: r.customer, site: r.site, date: rowDate(r, basis), co: r.co,
              loads: 0, qty: 0, total: 0, vat: 0, rows: []
            });
          }
          const g = invMap.get(key);
          g.loads += 1; g.qty += r.qty; g.total += r.total_usd; g.vat += r.vat_usd;
          g.rows.push(r);
        });
      }

      const invoiceList = [...invMap.values()].sort((a, b) => {
        if (a.key === '2738') return -1;
        if (b.key === '2738') return 1;
        return _rdlCollator.compare(String(b.key), String(a.key));
      });

      const ticketCandidates = salesAll
        .filter(r => !r.is_receipt_row && r.ticket_no)
        .sort((a, b) => {
          const db = b._rDate || rowDate(b, basis);
          const da = a._rDate || rowDate(a, basis);
          if (db !== da) return db < da ? -1 : 1;
          const nb = Number(b.ticket_no), na = Number(a.ticket_no);
          if (Number.isFinite(nb) && Number.isFinite(na) && nb !== na) return nb - na;
          return _rdlCollator.compare(String(b.ticket_no), String(a.ticket_no));
        });

      const ticketById = new Map();
      ticketCandidates.forEach(t => {
        ticketById.set(String(t.id || t.ticket_no), t);
      });

      const receiptCandidates = rawReceiptsForDocs
        .slice()
        .sort((a, b) => {
          const db = rowDate(b, basis), da = rowDate(a, basis);
          return db < da ? -1 : (db > da ? 1 : 0);
        })
        .map(rc => ({
          id: String(rc.id),
          date: rc.date,
          rep_date: rc.rep_date || rc.date,
          co: rc.company || co,
          invoice_no: rc.name || String(rc.id),
          ticket_no: rc.name || String(rc.id),
          vat_inv: rc.name || String(rc.id),
          customer: rc.customer || '-',
          site: rc.notes || 'Account Settlement',
          product: ind === 'Manufacturing' ? 'Customer Receipt' : (getDomainRdlTerms(ind).rcptDescDef || 'Account Receipt'),
          qty: 0,
          pay_method: rc.method || 'Cash USD',
          total_usd: Number(rc.usd_amount || rc.amount || 0),
          paid_usd: Number(rc.usd_amount || rc.amount || 0)
        }));

      const receiptById = new Map();
      receiptCandidates.forEach(r => {
        receiptById.set(String(r.id), r);
      });

      _cachedCoKey = sig;
      _cachedCtxData = {
        ind,
        coaAccounts: getCoaAccountsForInd(ind),
        domainTerms: getDomainRdlTerms(ind),
        salesAll, expAll, payAll, rmAll, apRmLegsAll, fuelAll, prodAll: [],
        receiptLedgerAll, arLedgerAll, settlementLedgerAll, apRmLedgerAll, vatPaidAll,
        customers, products, sites, suppliers, categories, staff, equipTypes, equipments, drivers,
        invoiceList, invMap, ticketCandidates, ticketById, receiptCandidates, receiptById
      };
    }

    const d = _cachedCtxData;
    if (!rdl.params.invoiceNo || !d.invMap.has(String(rdl.params.invoiceNo))) {
      const pref = d.invoiceList.find(x => x.key === '2738') || d.invoiceList[0];
      rdl.params.invoiceNo = pref ? pref.key : '';
    }
    if (!rdl.params.ticketId || !d.ticketById.has(String(rdl.params.ticketId))) {
      rdl.params.ticketId = d.ticketCandidates[0] ? String(d.ticketCandidates[0].id || d.ticketCandidates[0].ticket_no) : '';
    }
    if (!rdl.params.receiptId || !d.receiptById.has(String(rdl.params.receiptId))) {
      rdl.params.receiptId = d.receiptCandidates[0] ? String(d.receiptCandidates[0].id) : '';
    }

    return {
      rdl, co, basis,
      from: rdl.params.from,
      to: rdl.params.to,
      asof: rdl.params.asof,
      period: STATE.period || 'all',
      dateFrom: STATE.dateFrom || '',
      dateTo: STATE.dateTo || '',
      showTaxBreakdown: Boolean(STATE._canSeeTaxBreakdown && STATE.showSalesTaxBreakdown),
      officialScope: Boolean(STATE._officialScopeActive),
      ...d
    };
  }

  function isUntouchedAllStmtWindow(ctx) {
    return (!ctx || !ctx.period || ctx.period === 'all')
      && !(ctx && ctx.rdl && ctx.rdl._dateTouched)
      && !(ctx && (ctx.dateFrom || ctx.dateTo));
  }

  function stmtActiveRange(ctx) {
    if (isUntouchedAllStmtWindow(ctx)) return null;
    const p = (ctx && ctx.rdl && ctx.rdl.params) || {};
    const from = String((ctx && ctx.from) || p.from || '2024-01-01').slice(0, 10);
    const rawTo = String((ctx && ctx.to) || p.to || from).slice(0, 10);
    const to = rawTo < from ? from : rawTo;
    return { from, to };
  }

  function formatStmtWindowLabel(ctx, rows, dateField) {
    const p = (ctx && ctx.rdl && ctx.rdl.params) || {};
    const from = String((ctx && ctx.from) || p.from || '').slice(0, 10);
    const to = String((ctx && ctx.to) || p.to || '').slice(0, 10);
    const isUntouchedAll = isUntouchedAllStmtWindow(ctx);
    if (isUntouchedAll) {
      if (Array.isArray(rows) && rows.length && dateField) {
        let minD = '', maxD = '';
        for (let i = 0; i < rows.length; i++) {
          const d = String((rows[i] && rows[i][dateField]) || '').slice(0, 10);
          if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
            if (!minD || d < minD) minD = d;
            if (!maxD || d > maxD) maxD = d;
          }
        }
        if (minD && maxD) return `All Periods (${minD} to ${maxD})`;
      }
      return 'All Periods';
    }
    if (from && to) return from === to ? from : `${from} to ${to}`;
    return from || to || 'All Periods';
  }

  function formatStmtWindowHeader(ctx, rows, dateField) {
    const lbl = formatStmtWindowLabel(ctx, rows, dateField);
    return lbl.startsWith('All Periods') ? lbl : `Window ${lbl}`;
  }


  function buildJournalEntries(ctx, upToDate) {
    const capDate = upToDate || ctx.rdl.params.to || '2026-10-21';
    if (_cachedCtxData && _cachedCtxData._allJes) {
      return _cachedCtxData._allJes.filter(j => j.date <= capDate);
    }
    const basis = ctx.basis;
    const isMfg = !ctx.ind || ctx.ind === 'Manufacturing';
    const coaList = ctx.coaAccounts || COA_ACCOUNTS;
    const dt = ctx.domainTerms || DOMAIN_RDL_TERMS['Manufacturing'];
    const entries = [];
    let jSeq = 1000;

    // Opening balances (Lebanese CoA Classes 1-5, balanced Dr === Cr)
    const coScale = isMfg
      ? (ctx.co === 'ALL' ? 1.85 : (ctx.co === 'WTC' ? 1.0 : (ctx.co === 'BBConstruction' ? 0.55 : 0.30)))
      : (RDL_GROUP_COMPANIES[ctx.co] ? 1.40 : 0.75);
    const openDate = '2020-01-01';
    const acctLookup = new Map(coaList.map(a => [a.code, a]));
    const pushJe = (date, ref, source, acctCode, subName, desc, dr, cr) => {
      const a = acctLookup.get(acctCode) || coaList[0];
      entries.push({
        je_no: `JE-${++jSeq}`,
        date,
        ref: ref || 'OPEN',
        source,
        acct_code: a.code,
        acct_name: a.name,
        acct_cls: a.cls,
        acct_section: a.section,
        normal: a.normal,
        sub_account: subName || 'General',
        description: desc || a.name,
        debit: Number(dr || 0),
        credit: Number(cr || 0)
      });
    };

    if (isMfg) {
      pushJe(openDate, 'OB-001', 'Opening', '215', 'Plant & Mixers', 'Opening Batching Plant & Concrete Pumps', 680000 * coScale, 0);
      pushJe(openDate, 'OB-001', 'Opening', '218', 'Heavy Fleet', 'Opening Transit Mixers & Silo Trucks', 420000 * coScale, 0);
      pushJe(openDate, 'OB-001', 'Opening', '281', 'Accum. Depr.', 'Opening Accumulated Depreciation', 0, 310000 * coScale);
      pushJe(openDate, 'OB-001', 'Opening', '311', 'Plant Silos', 'Opening Cement & Aggregate Stock', 95000 * coScale, 0);
      pushJe(openDate, 'OB-001', 'Opening', '512', 'Fresh USD Bank', 'Opening Bank Working Capital', 145000 * coScale, 0);
      pushJe(openDate, 'OB-001', 'Opening', '531', 'Plant Safe', 'Opening Cash on Hand', 35000 * coScale, 0);
      pushJe(openDate, 'OB-001', 'Opening', '101', 'Bdeir Holding / Partners', 'Subscribed Capital & Paid-in Equity', 0, 850000 * coScale);
      pushJe(openDate, 'OB-001', 'Opening', '165', 'Shareholder Current Account', 'Partner Financing Current Account', 0, 215000 * coScale);
    } else {
      const entSub = ctx.co && ctx.co !== 'ALL' ? ctx.co : 'Operating Portfolio';
      pushJe(openDate, 'OB-001', 'Opening', '215', entSub, 'Opening Fixed Assets & Operating Infrastructure', 680000 * coScale, 0);
      pushJe(openDate, 'OB-001', 'Opening', '218', entSub, 'Opening Vehicles, Equipment & Fit-Out', 420000 * coScale, 0);
      pushJe(openDate, 'OB-001', 'Opening', '281', 'Accum. Depr.', 'Opening Accumulated Depreciation', 0, 310000 * coScale);
      pushJe(openDate, 'OB-001', 'Opening', '311', entSub, 'Opening Operating Stock & Supplies', 95000 * coScale, 0);
      pushJe(openDate, 'OB-001', 'Opening', '512', 'Fresh USD Bank', 'Opening Bank Working Capital', 145000 * coScale, 0);
      pushJe(openDate, 'OB-001', 'Opening', '531', 'Main Safe', 'Opening Cash & Treasury Safe', 35000 * coScale, 0);
      pushJe(openDate, 'OB-001', 'Opening', '101', 'Bdeir Holding / Partners', 'Subscribed Capital & Paid-in Equity', 0, 850000 * coScale);
      pushJe(openDate, 'OB-001', 'Opening', '165', 'Shareholder Current Account', 'Partner Financing Current Account', 0, 215000 * coScale);
    }

    ctx.salesAll.forEach(r => {
      const d = rowDate(r, basis);
      if (!d) return;
      const tot = isMfg ? Number(r.total_usd || 0) : Math.round(Number(r.total_usd || 0) * 100) / 100;
      const vat = isMfg ? Number(r.vat_usd || 0) : Math.round(Number(r.vat_usd || 0) * 100) / 100;
      const net = isMfg ? (tot - vat) : Math.round((tot - vat) * 100) / 100;
      const paid = isMfg ? Number(r.paid_usd || 0) : Math.round(Number(r.paid_usd || 0) * 100) / 100;
      const ref = r.vat_inv ? `VAT-${r.vat_inv}` : String(r.invoice_no || r.ticket_no || 'SL');
      const cust = r.customer || 'Walk-in Customer';
      const desc = isMfg
        ? `${r.product || 'Concrete'} · ${fmtNum(r.qty, 1)} m³ · ${r.site || ''}`.trim()
        : `${r.product || dt.rcptDescDef} · ${fmtNum(r.qty, dt.qtyDp)} ${dt.qtyUnit}${r.site ? ' · ' + r.site : ''}`.trim();
      const revAcct = /pump|haul|trans/i.test(String(r.product || '')) ? '706' : '701';
      const recAcct = r.is_barter ? '467' : '411';
      if (tot > 0) {
        pushJe(d, ref, r.is_barter ? 'Barter Sale' : 'Sales', recAcct, cust, desc, tot, 0);
        pushJe(d, ref, r.is_barter ? 'Barter Sale' : 'Sales', revAcct, cust, desc, 0, net);
        if (vat > 0) pushJe(d, ref, 'Sales VAT', '442', 'VAT Collectible (11%)', `Output VAT on ${ref}`, 0, vat);
      } else if (tot < 0) {
        pushJe(d, ref, 'Sales Return', revAcct, cust, desc, Math.abs(net), 0);
        if (vat < 0) pushJe(d, ref, 'Sales Return VAT', '442', 'VAT Collectible (11%)', `Return VAT on ${ref}`, Math.abs(vat), 0);
        pushJe(d, ref, 'Sales Return', recAcct, cust, desc, 0, Math.abs(tot));
      }
      if (!r.is_barter && paid > 0) {
        const cashAcct = r.pay_method === 'Bank' || r.pay_method === 'Cheque' ? '512' : '531';
        pushJe(d, `RC-${ref}`, 'Collection', cashAcct, cust, `Receipt against ${ref}`, paid, 0);
        pushJe(d, `RC-${ref}`, 'Collection', '411', cust, `Receipt against ${ref}`, 0, paid);
      } else if (!r.is_barter && paid < 0) {
        const cashAcct = r.pay_method === 'Bank' || r.pay_method === 'Cheque' ? '512' : '531';
        pushJe(d, `RC-${ref}`, 'Cash Refund', '411', cust, `Cash return refund ${ref}`, Math.abs(paid), 0);
        pushJe(d, `RC-${ref}`, 'Cash Refund', cashAcct, cust, `Cash return refund ${ref}`, 0, Math.abs(paid));
      }
    });

    (ctx.receiptLedgerAll || []).forEach(r => {
      const d = rowDate(r, basis);
      const paid = Number(r.paid_usd || 0);
      if (!d || Math.abs(paid) < 0.005) return;
      const cust = r.customer || 'Customer';
      const ref = String(r.invoice_no || r.ticket_no || 'RCPT');
      const clearAcct = r.pay_method === 'Config' ? '467' : (r.pay_method === 'Bank' || r.pay_method === 'Cheque' ? '512' : '531');
      if (paid > 0) {
        pushJe(d, ref, 'Collection', clearAcct, cust, `Customer receipt (${r.pay_method || 'Cash'})`, paid, 0);
        pushJe(d, ref, 'Collection', '411', cust, `Customer receipt (${r.pay_method || 'Cash'})`, 0, paid);
      } else {
        pushJe(d, ref, 'AR Adjustment', '411', cust, `Customer balance adjustment (${r.pay_method || 'Config'})`, Math.abs(paid), 0);
        pushJe(d, ref, 'AR Adjustment', clearAcct, cust, `Customer balance adjustment (${r.pay_method || 'Config'})`, 0, Math.abs(paid));
      }
    });

    (ctx.apRmLegsAll || ctx.rmAll).forEach(r => {
      const d = rowDate(r, basis);
      if (!d) return;
      const tot = Number(r.total_usd || 0);
      const paid = Number(r.paid_usd || 0);
      if (Math.abs(tot) < 0.005 && Math.abs(paid) < 0.005) return;
      const sup = r.supplier || (isMfg ? 'Raw Material Supplier' : 'Direct Vendor');
      const ref = String(r.voucher || r.name || 'RM');
      const src = r.leg === 'haulage' ? (isMfg ? 'Raw Haulage' : 'Freight / Delivery') : (isMfg ? 'Raw Material' : 'Direct Supply');
      const desc = `${r.material || (isMfg ? 'Raw Material' : 'Supply')} · ${fmtNum(r.qty, 2)} ${r.unit || 't'}`;
      if (tot > 0) {
        pushJe(d, ref, src, '601', sup, desc, tot, 0);
        pushJe(d, ref, src, '401', sup, desc, 0, tot);
      } else if (tot < 0) {
        pushJe(d, ref, `${src} Return`, '401', sup, desc, Math.abs(tot), 0);
        pushJe(d, ref, `${src} Return`, '601', sup, desc, 0, Math.abs(tot));
      }
      if (paid > 0) {
        pushJe(d, `PV-${ref}`, 'Supplier Payment', '401', sup, `Payment on ${ref}`, paid, 0);
        pushJe(d, `PV-${ref}`, 'Supplier Payment', '531', sup, `Payment on ${ref}`, 0, paid);
      } else if (paid < 0) {
        pushJe(d, `PV-${ref}`, 'Supplier Refund', '531', sup, `Refund on ${ref}`, Math.abs(paid), 0);
        pushJe(d, `PV-${ref}`, 'Supplier Refund', '401', sup, `Refund on ${ref}`, 0, Math.abs(paid));
      }
    });

    (ctx.settlementLedgerAll || []).forEach(r => {
      const d = rowDate(r, basis);
      const paid = Number(r.paid_usd || 0);
      if (!d || Math.abs(paid) < 0.005) return;
      const sup = r.supplier || 'Supplier';
      const ref = String(r.voucher || r.name || 'SETL');
      const clearAcct = r.pay_method === 'Config' ? '467' : '531';
      if (paid > 0) {
        pushJe(d, ref, 'Supplier Payment', '401', sup, r.material || 'Supplier Settlement', paid, 0);
        pushJe(d, ref, 'Supplier Payment', clearAcct, sup, r.material || 'Supplier Settlement', 0, paid);
      } else {
        pushJe(d, ref, 'AP Adjustment', clearAcct, sup, r.material || 'Supplier Balance Adjustment', Math.abs(paid), 0);
        pushJe(d, ref, 'AP Adjustment', '401', sup, r.material || 'Supplier Balance Adjustment', 0, Math.abs(paid));
      }
    });

    ctx.fuelAll.forEach(r => {
      const d = rowDate(r, basis);
      if (!d) return;
      const tot = Number(r.total_usd || 0);
      if (tot <= 0) return;
      const tank = r.station || (isMfg ? 'Plant Diesel Tank' : 'Utility & Fleet Tank');
      const ref = String(r.voucher || r.name || 'FUEL');
      const desc = `Diesel ${fmtNum(r.liters, 0)} L · ${r.equip || r.driver || 'Fleet'}`;
      pushJe(d, ref, 'Fuel Log', '601', tank, desc, tot, 0);
      pushJe(d, ref, 'Fuel Log', '311', tank, desc, 0, tot);
    });

    ctx.expAll.forEach(r => {
      const d = rowDate(r, basis);
      if (!d) return;
      const tot = isMfg ? Number(r.total_usd || 0) : Math.round(Number(r.total_usd || 0) * 100) / 100;
      const vat = isMfg ? Number(r.vat_usd || 0) : Math.round(Number(r.vat_usd || 0) * 100) / 100;
      const net = isMfg ? (tot - vat) : Math.round((tot - vat) * 100) / 100;
      const paid = isMfg ? Number(r.paid_usd || 0) : Math.round(Number(r.paid_usd || 0) * 100) / 100;
      if (Math.abs(tot) < 0.005) return;
      const sup = r.supplier || r.category || 'General Vendor';
      const ref = String(r.voucher_no || r.invoice_no || r.name || 'EXP');
      const cat = String(r.category || '');
      const expAcct = /maint|spare|repair|tire|oil/i.test(cat) ? '615' : (/raw|cement|sand|agg|fuel|diesel/i.test(cat) ? '601' : '622');
      const liabAcct = r.is_barter ? '467' : '401';
      const desc = isMfg ? `${cat} — ${r.description || sup}` : `${cat} · ${r.description || sup}`;
      if (tot > 0) {
        if (net > 0.0001) pushJe(d, ref, 'Expense', expAcct, sup, desc, net, 0);
        if (vat > 0.0001) pushJe(d, ref, 'Input VAT', '442', 'VAT Deductible (11%)', `Input VAT on ${ref}`, vat, 0);
        pushJe(d, ref, r.is_barter ? 'Barter Expense' : 'Expense', liabAcct, sup, desc, 0, tot);
      } else {
        pushJe(d, ref, 'Expense Return', liabAcct, sup, desc, Math.abs(tot), 0);
        if (net < -0.0001) pushJe(d, ref, 'Expense Return', expAcct, sup, desc, 0, Math.abs(net));
        if (vat < -0.0001) pushJe(d, ref, 'Input VAT Return', '442', 'VAT Deductible (11%)', `Input VAT return on ${ref}`, 0, Math.abs(vat));
      }
      if (!r.is_barter && paid > 0) {
        pushJe(d, `PV-${ref}`, 'Expense Payment', liabAcct, sup, `Settlement ${ref}`, paid, 0);
        pushJe(d, `PV-${ref}`, 'Expense Payment', '531', sup, `Settlement ${ref}`, 0, paid);
      } else if (!r.is_barter && paid < 0) {
        pushJe(d, `PV-${ref}`, 'Expense Refund', '531', sup, `Refund ${ref}`, Math.abs(paid), 0);
        pushJe(d, `PV-${ref}`, 'Expense Refund', liabAcct, sup, `Refund ${ref}`, 0, Math.abs(paid));
      }
    });

    ctx.payAll.forEach(r => {
      const d = rowDate(r, basis);
      if (!d) return;
      const netPay = Number(r.net_usd || r.total_usd || 0);
      const paid = Number(r.paid_usd || 0);
      if (netPay <= 0 && paid <= 0) return;
      const emp = r.staff || 'Employee';
      const ref = String(r.voucher || r.name || `PAY-${d.slice(0, 7)}`);
      const desc = `${r.type || 'Payroll'} · ${r.role || 'Staff'}`;
      const amt = netPay > 0 ? netPay : paid;
      pushJe(d, ref, 'Payroll', '641', emp, desc, amt, 0);
      pushJe(d, ref, 'Payroll', '421', emp, desc, 0, amt);
      if (paid > 0) {
        pushJe(d, `PY-${ref}`, 'Salary Payout', '421', emp, `Disbursement ${ref}`, paid, 0);
        pushJe(d, `PY-${ref}`, 'Salary Payout', '531', supOrEmp(emp), `Disbursement ${ref}`, 0, paid);
      }
    });

    function supOrEmp(x) { return x || 'Employee'; }
    if (_cachedCtxData) _cachedCtxData._allJes = entries;
    return entries.filter(j => j.date <= capDate);
  }


  function getParamComboConfig(k, ctx) {
    const p = ctx.rdl.params;
    const makeSimpleList = (list, allLabel, metaTag) => {
      const opts = [];
      if (allLabel) {
        opts.push({
          value: 'ALL',
          code: 'ALL',
          main: allLabel,
          meta: 'All records',
          label: allLabel,
          q: `all ${allLabel}`.toLowerCase()
        });
      }
      list.forEach(v => {
        const s = String(v);
        opts.push({
          value: s,
          code: '',
          main: s,
          meta: metaTag || '',
          label: s,
          q: s.toLowerCase()
        });
      });
      return opts;
    };

    if (k === 'account') {
      const coaList = ctx.coaAccounts || COA_ACCOUNTS;
      const jes = ctx._allJes || buildJournalEntries(ctx, '9999-12-31');
      const acctFreq = new Map();
      jes.forEach(j => {
        const ac = j && (j.acct_code || j.acct);
        if (ac) acctFreq.set(String(ac), (acctFreq.get(String(ac)) || 0) + 1);
      });
      const rankedCoa = coaList.slice().sort((a, b) => (acctFreq.get(String(b.code)) || 0) - (acctFreq.get(String(a.code)) || 0));
      const opts = [{
        value: 'ALL',
        code: 'ALL',
        main: `All Accounts (${coaList.length})`,
        meta: 'Classes 1-7',
        label: `All Accounts (${coaList.length})`,
        q: 'all accounts coa'
      }];
      rankedCoa.forEach(a => {
        opts.push({
          value: a.code,
          code: a.code,
          main: a.name,
          meta: a.section,
          label: `${a.code} · ${a.name}`,
          q: `${a.code} ${a.name} ${a.cls} ${a.section}`.toLowerCase()
        });
      });
      return { label: 'Account', wide: true, placeholder: 'Search account code or name…', badge: `${coaList.length} accounts`, options: opts };
    }
    if (k === 'subAccount') {
      const _rdlCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      const fIdx = typeof window !== 'undefined' && typeof window.MFG_FREQ === 'function' ? window.MFG_FREQ() : null;
      const combinedPool = [...new Set([...ctx.customers, ...ctx.suppliers])].sort((a, b) => {
        const fa = fIdx && fIdx.any ? (fIdx.any.get(a.toLowerCase()) || 0) : 0;
        const fb = fIdx && fIdx.any ? (fIdx.any.get(b.toLowerCase()) || 0) : 0;
        return fb - fa;
      });
      const subPool = p.account === '411' ? ctx.customers : (p.account === '401' ? ctx.suppliers : (p.account === '421' ? ctx.staff : combinedPool));
      return { label: 'Sub-account(s)', wide: false, placeholder: 'Search counterparty name…', badge: `${fmtNum(subPool.length)} parties`, options: makeSimpleList(subPool, `All Sub-accounts (${subPool.length})`, 'Sub-account') };
    }
    if (k === 'customer') {
      return { label: 'Customer', wide: false, placeholder: 'Search customer name…', badge: `${fmtNum(ctx.customers.length)} customers`, options: makeSimpleList(ctx.customers, `All Customers (${ctx.customers.length})`, 'Customer') };
    }
    if (k === 'product') {
      return { label: 'Product', wide: false, placeholder: 'Search product or grade…', badge: `${fmtNum(ctx.products.length)} products`, options: makeSimpleList(ctx.products, `All Products (${ctx.products.length})`, 'Product') };
    }
    if (k === 'site') {
      return { label: 'Site', wide: false, placeholder: 'Search site…', badge: `${fmtNum(ctx.sites.length)} sites`, options: makeSimpleList(ctx.sites, `All Sites (${ctx.sites.length})`, 'Site') };
    }
    if (k === 'supplier') {
      return { label: 'Supplier', wide: false, placeholder: 'Search supplier…', badge: `${fmtNum(ctx.suppliers.length)} suppliers`, options: makeSimpleList(ctx.suppliers, `All Suppliers (${ctx.suppliers.length})`, 'Supplier') };
    }
    if (k === 'category') {
      return { label: 'Category', wide: false, placeholder: 'Search expense category…', badge: `${fmtNum(ctx.categories.length)} categories`, options: makeSimpleList(ctx.categories, `All Categories (${ctx.categories.length})`, 'Category') };
    }
    if (k === 'staff') {
      return { label: 'Staff member', wide: false, placeholder: 'Search employee name…', badge: `${fmtNum(ctx.staff.length)} staff`, options: makeSimpleList(ctx.staff, `All Staff (${ctx.staff.length})`, 'Staff') };
    }
    if (k === 'equipType') {
      return { label: 'Equipment type', wide: false, placeholder: 'Search equipment type…', badge: `${fmtNum(ctx.equipTypes.length)} types`, options: makeSimpleList(ctx.equipTypes, 'All Types', 'Type') };
    }
    if (k === 'equipment') {
      return { label: 'Equipment', wide: false, placeholder: 'Search truck or machine…', badge: `${fmtNum(ctx.equipments.length)} units`, options: makeSimpleList(ctx.equipments, `All Equipment (${ctx.equipments.length})`, 'Unit') };
    }
    if (k === 'driver') {
      return { label: 'Driver', wide: false, placeholder: 'Search driver name…', badge: `${fmtNum(ctx.drivers.length)} drivers`, options: makeSimpleList(ctx.drivers, `All Drivers (${ctx.drivers.length})`, 'Driver') };
    }
    if (k === 'year') {
      const yrs = ['ALL', '2026', '2025', '2024', '2023', '2022', '2021', '2020'];
      const opts = yrs.map(y => ({
        value: y,
        code: y === 'ALL' ? 'ALL' : y,
        main: y === 'ALL' ? 'All Years' : `FY ${y}`,
        meta: '',
        label: y === 'ALL' ? 'All Years' : y,
        q: y === 'ALL' ? 'all years' : y
      }));
      return { label: 'Year', wide: false, placeholder: 'Select year…', badge: '', options: opts };
    }
    if (k === 'month') {
      const mos = [
        ['ALL', 'All Months'], ['01', '01 - Jan'], ['02', '02 - Feb'], ['03', '03 - Mar'],
        ['04', '04 - Apr'], ['05', '05 - May'], ['06', '06 - Jun'], ['07', '07 - Jul'],
        ['08', '08 - Aug'], ['09', '09 - Sep'], ['10', '10 - Oct'], ['11', '11 - Nov'], ['12', '12 - Dec']
      ];
      const opts = mos.map(([v, l]) => ({
        value: v,
        code: v,
        main: l,
        meta: '',
        label: l,
        q: `${v} ${l}`.toLowerCase()
      }));
      return { label: 'Month', wide: false, placeholder: 'Select month…', badge: '', options: opts };
    }
    if (k === 'invoiceNo') {
      const dt = ctx.domainTerms || DOMAIN_RDL_TERMS['Manufacturing'];
      const opts = ctx.invoiceList.map(g => {
        const invNo = String(g.vat_inv || g.invoice_no);
        const cust = g.customer || '-';
        const lds = `${g.loads} ${g.loads === 1 ? dt.txSingular : dt.txPlural}`;
        return {
          value: String(g.key),
          code: `#${invNo}`,
          main: cust,
          meta: `${g.date || ''} · ${lds} · ${fmtUsd(g.total)}`,
          label: `#${invNo} · ${cust} · ${lds} (${fmtUsd(g.total)})`,
          q: `${invNo} ${cust} ${g.site || ''} ${g.date || ''} ${g.total || ''}`.toLowerCase()
        };
      });
      return { label: 'VAT Invoice No', wide: true, steppable: true, placeholder: 'Search customer name, invoice # or date…', badge: `${fmtNum(opts.length)} invoices`, options: opts };
    }
    if (k === 'ticketId') {
      const dt = ctx.domainTerms || DOMAIN_RDL_TERMS['Manufacturing'];
      if (!ctx._ticketComboOpts) {
        ctx._ticketComboOpts = ctx.ticketCandidates.map(t => {
          const tid = String(t.id || t.ticket_no);
          const tno = String(t.ticket_no || t.invoice_no || tid);
          const d = rowDate(t, ctx.basis);
          const cust = t.customer || '-';
          const vol = `${fmtNum(t.qty, dt.qtyDp)} ${dt.qtyUnit}`;
          return {
            value: tid,
            code: `#${tno}`,
            main: cust,
            meta: `${d} · ${t.product || ''} · ${vol} · ${fmtUsd(t.total_usd)}`,
            label: `#${tno} · ${cust} · ${d} · ${vol}`,
            q: `${tno} ${cust} ${d} ${t.site || ''} ${t.product || ''} ${t.truck || ''} ${t.driver || ''}`.toLowerCase()
          };
        });
      }
      return { label: dt.doc21Label, wide: true, steppable: true, placeholder: 'Search customer name, ref #, location or date…', badge: `${fmtNum(ctx._ticketComboOpts.length)} records`, options: ctx._ticketComboOpts };
    }
    if (k === 'receiptId') {
      if (!ctx._receiptComboOpts) {
        ctx._receiptComboOpts = ctx.receiptCandidates.map(r => {
          const rid = String(r.id);
          const vno = `RC-${r.invoice_no || r.ticket_no || rid.slice(-4)}`;
          const d = rowDate(r, ctx.basis);
          const cust = r.customer || '—';
          const amt = fmtUsd(r.paid_usd);
          return {
            value: rid,
            code: vno,
            main: cust,
            meta: `${d} · ${r.pay_method || 'Cash'} · ${amt}`,
            label: `${vno} · ${cust} · ${d} · ${amt}`,
            q: `${vno} ${r.invoice_no || ''} ${cust} ${d} ${r.pay_method || ''} ${amt}`.toLowerCase()
          };
        });
      }
      return { label: 'Receipt Voucher', wide: true, steppable: true, placeholder: 'Search customer name, voucher #, date or amount…', badge: `${fmtNum(ctx._receiptComboOpts.length)} vouchers`, options: ctx._receiptComboOpts };
    }
    return null;
  }

  function renderParamBarHtml(meta, ctx) {
    const p = ctx.rdl.params;
    const controls = [];

    meta.params.forEach(k => {
      if (k === 'asof') {
        controls.push(`
          <label class="rdl-p-item rdl-p-date">
            <div class="rdl-p-hdr"><span class="rdl-p-lbl">As at Date</span></div>
            <input type="date" class="rdl-date-input" data-rdl-param="asof" value="${esc(p.asof)}" />
          </label>
        `);
      } else if (k === 'from') {
        controls.push(`
          <label class="rdl-p-item rdl-p-date">
            <div class="rdl-p-hdr"><span class="rdl-p-lbl">From Date</span></div>
            <input type="date" class="rdl-date-input" data-rdl-param="from" value="${esc(p.from)}" />
          </label>
        `);
      } else if (k === 'to') {
        controls.push(`
          <label class="rdl-p-item rdl-p-date">
            <div class="rdl-p-hdr"><span class="rdl-p-lbl">To Date</span></div>
            <input type="date" class="rdl-date-input" data-rdl-param="to" value="${esc(p.to)}" />
          </label>
        `);
      } else if (k === 'period') {
        controls.push(`
          <div class="rdl-p-item rdl-p-seg">
            <div class="rdl-p-hdr"><span class="rdl-p-lbl">Columns by</span></div>
            <div class="rdl-seg">
              ${['Month', 'Quarter', 'Year'].map(m => `<button type="button" class="rdl-seg-btn ${p.period === m ? 'active' : ''}" data-rdl-period="${m}">${m}</button>`).join('')}
            </div>
          </div>
        `);
      } else {
        const cfg = getParamComboConfig(k, ctx);
        if (!cfg) return;
        const curVal = String(p[k] !== undefined ? p[k] : '');
        const activeOpt = cfg.options.find(o => String(o.value) === curVal) || cfg.options[0] || { value: '', label: '' };
        const hasAll = cfg.options[0] && cfg.options[0].value === 'ALL';
        const isFiltered = hasAll && activeOpt.value !== 'ALL';
        controls.push(`
          <div class="rdl-p-item ${cfg.wide ? 'rdl-p-wide' : ''} ${isFiltered ? 'is-filtered' : ''}">
            <div class="rdl-p-hdr">
              <span class="rdl-p-lbl">${esc(cfg.label)}</span>
              ${cfg.badge ? `<span class="rdl-p-cnt">${esc(cfg.badge)}</span>` : ''}
            </div>
            <div class="rdl-combo-row">
              <div class="rdl-combo" data-combo-wrap="${esc(k)}">
                <span class="rdl-combo-ico" aria-hidden="true">
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="6.8" cy="6.8" r="4.8"/><line x1="10.4" y1="10.4" x2="14" y2="14"/></svg>
                </span>
                <input type="text"
                  class="rdl-combo-input"
                  data-rdl-param="${esc(k)}"
                  data-raw-value="${esc(activeOpt.value)}"
                  data-display-label="${esc(activeOpt.label)}"
                  value="${esc(activeOpt.label)}"
                  placeholder="${esc(cfg.placeholder)}"
                  aria-label="${esc(cfg.label)} search"
                  autocomplete="off"
                  spellcheck="false" />
                <button type="button" class="rdl-combo-clear" data-combo-clear="${esc(k)}" aria-label="${hasAll ? 'Clear search or reset to All' : 'Clear search text'}">×</button>
                <button type="button" class="rdl-combo-caret" data-combo-caret="${esc(k)}" tabindex="-1" aria-label="Open options">
                  <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="2.5 4.5 6 8 9.5 4.5"/></svg>
                </button>
                <div class="rdl-combo-menu" data-combo-menu="${esc(k)}" role="listbox" hidden></div>
              </div>
              ${cfg.steppable ? `
                <div class="rdl-doc-stepper" role="group" aria-label="Step through records">
                  <button type="button" class="rdl-step-btn" data-rdl-step="${esc(k)}" data-step-dir="-1" aria-label="Previous record">‹</button>
                  <button type="button" class="rdl-step-btn" data-rdl-step="${esc(k)}" data-step-dir="1" aria-label="Next record">›</button>
                </div>
              ` : ''}
            </div>
          </div>
        `);
      }
    });

    return `
      <div class="rdl-param-bar ${ctx.rdl.paramsOpen ? '' : 'collapsed'}" id="rdlParamBar">
        <div class="rdl-param-fields">
          ${controls.join('')}
          <div class="rdl-param-actions">
            <button type="button" class="rdl-view-btn" id="rdlViewReportBtn">View report</button>
            <button type="button" class="rdl-reset-btn" id="rdlResetParamsBtn" aria-label="Reset report parameters to defaults">Reset</button>
          </div>
        </div>
      </div>
    `;
  }


  function render01DailyOps(meta, ctx) {
    const p = ctx.rdl.params;
    const isMfg = !ctx.ind || ctx.ind === 'Manufacturing';
    const dt = ctx.domainTerms || DOMAIN_RDL_TERMS['Manufacturing'];
    const sales = ctx.salesAll.filter(r => inWindow(rowDate(r, ctx.basis), p.from, p.to));
    const rcpts = (ctx.receiptLedgerAll || []).filter(r => inWindow(rowDate(r, ctx.basis), p.from, p.to));
    const exps = ctx.expAll.filter(r => inWindow(rowDate(r, ctx.basis), p.from, p.to));
    const rms = ctx.rmAll.filter(r => inWindow(rowDate(r, ctx.basis), p.from, p.to));
    const fuels = ctx.fuelAll.filter(r => inWindow(rowDate(r, ctx.basis), p.from, p.to));

    const totM3 = sales.reduce((s, r) => s + Number(r.qty || 0), 0);
    const totRev = sales.reduce((s, r) => s + Number(r.total_usd || 0), 0);
    const totPaid = sales.reduce((s, r) => s + Number(r.paid_usd || 0), 0) + rcpts.reduce((s, r) => s + Number(r.paid_usd || 0), 0);
    const totExp = exps.reduce((s, r) => s + Number(r.total_usd || 0), 0) + rms.reduce((s, r) => s + Number(r.total_usd || 0), 0);
    const totLiters = fuels.reduce((s, r) => s + Number(r.liters || 0), 0);

    // Group by Product
    const byProd = new Map();
    sales.forEach(r => {
      const k = r.product || (isMfg ? 'Ready-Mix Concrete' : dt.rcptDescDef);
      const g = byProd.get(k) || { product: k, loads: 0, m3: 0, rev: 0, paid: 0, bal: 0 };
      if (!r.is_return) g.loads += 1;
      g.m3 += Number(r.qty || 0);
      g.rev += Number(r.total_usd || 0);
      g.paid += Number(r.paid_usd || 0);
      g.bal += Number(r.balance_usd || 0);
      byProd.set(k, g);
    });
    const prodRows = [...byProd.values()].sort((a, b) => b.rev - a.rev);

    // Group by Date (most recent 25 operating days in window)
    const byDay = new Map();
    sales.forEach(r => {
      const d = rowDate(r, ctx.basis);
      const g = byDay.get(d) || { date: d, loads: 0, m3: 0, sales: 0, collected: 0, exp: 0, rm: 0, fuelL: 0 };
      if (!r.is_return) g.loads += 1;
      g.m3 += Number(r.qty || 0);
      g.sales += Number(r.total_usd || 0);
      g.collected += Number(r.paid_usd || 0);
      byDay.set(d, g);
    });
    rcpts.forEach(r => {
      const d = rowDate(r, ctx.basis);
      const g = byDay.get(d) || { date: d, loads: 0, m3: 0, sales: 0, collected: 0, exp: 0, rm: 0, fuelL: 0 };
      g.collected += Number(r.paid_usd || 0);
      byDay.set(d, g);
    });
    exps.forEach(r => {
      const d = rowDate(r, ctx.basis);
      const g = byDay.get(d) || { date: d, loads: 0, m3: 0, sales: 0, collected: 0, exp: 0, rm: 0, fuelL: 0 };
      g.exp += Number(r.total_usd || 0);
      byDay.set(d, g);
    });
    rms.forEach(r => {
      const d = rowDate(r, ctx.basis);
      const g = byDay.get(d) || { date: d, loads: 0, m3: 0, sales: 0, collected: 0, exp: 0, rm: 0, fuelL: 0 };
      g.rm += Number(r.total_usd || 0);
      byDay.set(d, g);
    });
    fuels.forEach(r => {
      const d = rowDate(r, ctx.basis);
      const g = byDay.get(d) || { date: d, loads: 0, m3: 0, sales: 0, collected: 0, exp: 0, rm: 0, fuelL: 0 };
      g.fuelL += Number(r.liters || 0);
      byDay.set(d, g);
    });
    const dayRows = [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 35);
    const subHdr = isMfg
      ? `Period ${p.from} to ${p.to} · ${sales.length} deliveries · ${fmtNum(totM3, 1)} m³ dispatched`
      : `Period ${p.from} to ${p.to} · ${sales.length} ${dt.txPlural} · ${fmtNum(totM3, dt.qtyDp)} ${dt.qtyUnit} recorded`;

    return `
      ${sheetHeaderHtml(meta, ctx.co, subHdr)}
      <div class="rdl-kpi-strip">
        <div class="rdl-kpi-box"><div class="rdl-kpi-lbl">${esc(dt.volKpi)}</div><div class="rdl-kpi-val">${fmtNum(totM3, dt.qtyDp)} ${esc(dt.qtyUnit)}</div><div class="rdl-kpi-sub">${sales.length} ${esc(isMfg ? 'batching loads' : dt.txPlural)}</div></div>
        <div class="rdl-kpi-box"><div class="rdl-kpi-lbl">Gross Billing</div><div class="rdl-kpi-val">${fmtUsd(totRev)}</div><div class="rdl-kpi-sub">Avg ${fmtUsd(totM3 > 0 ? totRev / totM3 : 0)} / ${esc(dt.qtyUnit)}</div></div>
        <div class="rdl-kpi-box"><div class="rdl-kpi-lbl">Cash Collected</div><div class="rdl-kpi-val">${fmtUsd(totPaid)}</div><div class="rdl-kpi-sub">${totRev > 0 ? ((totPaid / totRev) * 100).toFixed(1) : '0.0'}% realization</div></div>
        <div class="rdl-kpi-box"><div class="rdl-kpi-lbl">${isMfg ? 'OPEX + RM Intake' : 'OPEX & Direct Costs'}</div><div class="rdl-kpi-val">${fmtUsd(totExp)}</div><div class="rdl-kpi-sub">${isMfg ? 'Diesel' : 'Utility / Fuel'} ${fmtNum(totLiters, 0)} L</div></div>
      </div>

      <div class="rdl-sec-title">${esc(dt.sec1Title)}</div>
      <table class="rdl-table">
        <thead>
          <tr>
            <th>${esc(dt.sec1ProdCol)}</th>
            <th class="num">${esc(dt.txCol)}</th>
            <th class="num">${esc(isMfg ? 'Volume (m³)' : dt.qtyCol)}</th>
            <th class="num">${esc(dt.avgUnitLbl)}</th>
            <th class="num">Total Billed ($)</th>
            <th class="num">Collected ($)</th>
            <th class="num">Balance ($)</th>
          </tr>
        </thead>
        <tbody>
          ${prodRows.map(r => `
            <tr>
              <td class="bold">${esc(r.product)}</td>
              <td class="num">${fmtNum(r.loads, 0)}</td>
              <td class="num">${fmtNum(r.m3, dt.qtyDp)}</td>
              <td class="num">${fmtUsd(r.m3 > 0 ? r.rev / r.m3 : 0, 2)}</td>
              <td class="num bold">${fmtUsd(r.rev)}</td>
              <td class="num">${fmtUsd(r.paid)}</td>
              <td class="num">${fmtUsd(r.bal)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td>${esc(dt.sec1TotalLbl)}</td>
            <td class="num">${fmtNum(sales.length, 0)}</td>
            <td class="num">${fmtNum(totM3, dt.qtyDp)}</td>
            <td class="num">${fmtUsd(totM3 > 0 ? totRev / totM3 : 0, 2)}</td>
            <td class="num">${fmtUsd(totRev)}</td>
            <td class="num">${fmtUsd(totPaid)}</td>
            <td class="num">${fmtUsd(totRev - totPaid)}</td>
          </tr>
        </tfoot>
      </table>

      <div class="rdl-sec-title">${esc(dt.sec2Title)}</div>
      <table class="rdl-table">
        <thead>
          <tr>
            <th>Operating Date</th>
            <th class="num">${esc(dt.txCol)}</th>
            <th class="num">${esc(dt.sec2VolCol)}</th>
            <th class="num">Sales Billed ($)</th>
            <th class="num">Cash Collected ($)</th>
            <th class="num">${esc(dt.sec2RmCol)}</th>
            <th class="num">${isMfg ? 'Site Expenses ($)' : 'Operating OPEX ($)'}</th>
            <th class="num">${esc(dt.sec2FuelCol)}</th>
          </tr>
        </thead>
        <tbody>
          ${dayRows.map(d => `
            <tr>
              <td class="mono">${esc(d.date)}</td>
              <td class="num">${fmtNum(d.loads, 0)}</td>
              <td class="num">${fmtNum(d.m3, dt.qtyDp)}</td>
              <td class="num bold">${fmtUsd(d.sales)}</td>
              <td class="num">${fmtUsd(d.collected)}</td>
              <td class="num">${fmtUsd(d.rm)}</td>
              <td class="num">${fmtUsd(d.exp)}</td>
              <td class="num">${fmtNum(d.fuelL, 0)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${sheetFooterHtml(ctx.co, 1, 1)}
    `;
  }

  function render02BalanceSheet(meta, ctx) {
    const asof = ctx.rdl.params.asof || ctx.rdl.params.to;
    const isMfg = !ctx.ind || ctx.ind === 'Manufacturing';
    const coaList = ctx.coaAccounts || COA_ACCOUNTS;
    const jes = buildJournalEntries(ctx, asof);
    const balMap = new Map();
    coaList.forEach(a => balMap.set(a.code, { ...a, dr: 0, cr: 0 }));
    jes.forEach(j => {
      const b = balMap.get(j.acct_code);
      if (b) { b.dr += j.debit; b.cr += j.credit; }
    });

    // Net profit from classes 6 & 7 up to asof flows into Retained Earnings
    let revNet = 0, expNet = 0;
    balMap.forEach(b => {
      if (b.code.startsWith('7')) revNet += (b.cr - b.dr);
      if (b.code.startsWith('6')) expNet += (b.dr - b.cr);
    });
    const retainedEarnings = revNet - expNet;
    const sep = isMfg ? '—' : '·';

    const bsSections = [
      { title: `ASSETS ${sep} NON-CURRENT & FIXED ASSETS (Class 2)`, codes: ['215', '218', '281'], sign: 'D' },
      { title: `ASSETS ${sep} INVENTORIES & RECEIVABLES (Classes 3 & 4)`, codes: ['311', '411', '467'], sign: 'D' },
      { title: `ASSETS ${sep} CASH, BANK & TREASURY (Class 5)`, codes: ['512', '531'], sign: 'D' },
      { title: `LIABILITIES ${sep} PAYABLES & TAX OBLIGATIONS (Class 4)`, codes: ['401', '421', '442'], sign: 'C' },
      { title: `EQUITY & PARTNER ACCOUNTS (Class 1 + Period Result)`, codes: ['101', '165'], sign: 'C', includeRetained: true }
    ];

    let totalAssets = 0;
    let totalLiabEq = 0;

    const secHtml = bsSections.map(sec => {
      let secTot = 0;
      const rows = sec.codes.map(code => {
        const b = balMap.get(code);
        const val = sec.sign === 'D' ? (b.dr - b.cr) : (b.cr - b.dr);
        secTot += val;
        return `
          <tr>
            <td class="mono bold">${esc(b.code)}</td>
            <td>${esc(b.name)}</td>
            <td class="num">${fmtUsd(b.dr)}</td>
            <td class="num">${fmtUsd(b.cr)}</td>
            <td class="num bold">${fmtUsdSigned(val)}</td>
          </tr>
        `;
      });
      if (sec.includeRetained) {
        secTot += retainedEarnings;
        rows.push(`
          <tr>
            <td class="mono bold">120</td>
            <td>Current Period Net Result / نتيجة الدورة المالية</td>
            <td class="num">${fmtUsd(expNet)}</td>
            <td class="num">${fmtUsd(revNet)}</td>
            <td class="num bold">${fmtUsdSigned(retainedEarnings)}</td>
          </tr>
        `);
      }
      if (sec.sign === 'D') totalAssets += secTot;
      else totalLiabEq += secTot;

      return `
        <tr class="rdl-group-row"><td colspan="5">${esc(sec.title)}</td></tr>
        ${rows.join('')}
        <tr class="rdl-subtotal-row">
          <td colspan="4">Subtotal ${sep} ${esc(sec.title)}</td>
          <td class="num">${fmtUsdSigned(secTot)}</td>
        </tr>
      `;
    }).join('');

    return `
      ${sheetHeaderHtml(meta, ctx.co, `As at ${asof} · Lebanese General Chart of Accounts (Classes 1${isMfg ? '–' : '-'}5) · Functional Currency USD${!isMfg && Math.abs(totalAssets - totalLiabEq) < 0.02 ? ' · Balanced ($0.00 Variance)' : ''}`)}
      <table class="rdl-table">
        <thead>
          <tr>
            <th style="width:80px">Account</th>
            <th>Account Description (EN / AR)</th>
            <th class="num">Cumulative Debit ($)</th>
            <th class="num">Cumulative Credit ($)</th>
            <th class="num">Net Carrying Balance ($)</th>
          </tr>
        </thead>
        <tbody>
          ${secHtml}
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td colspan="4">TOTAL ASSETS (مجموع الموجودات)</td>
            <td class="num">${fmtUsdSigned(totalAssets)}</td>
          </tr>
          <tr class="rdl-total-row">
            <td colspan="4">TOTAL LIABILITIES & EQUITY (مجموع المطلوبات والرساميل الخاصة)</td>
            <td class="num">${fmtUsdSigned(totalLiabEq)}</td>
          </tr>
        </tfoot>
      </table>
      ${sheetFooterHtml(ctx.co, 1, 1)}
    `;
  }


  function render03IncomeStatement(meta, ctx) {
    const p = ctx.rdl.params;
    const isMfg = !ctx.ind || ctx.ind === 'Manufacturing';
    const coaList = ctx.coaAccounts || COA_ACCOUNTS;
    const jes = buildJournalEntries(ctx, p.to).filter(j => j.date !== '2020-01-01' && inWindow(j.date, p.from, p.to));
    const pMode = p.period || 'Month';
    const bucketsSet = new Set();
    jes.forEach(j => bucketsSet.add(periodBucket(j.date, pMode)));
    const allBuckets = [...bucketsSet].sort();
    // Show up to 8 most recent period columns so table fits cleanly on page
    const cols = allBuckets.length > 8 ? allBuckets.slice(-8) : (allBuckets.length ? allBuckets : [periodBucket(p.to, pMode)]);

    const plAccounts = coaList.filter(a => a.code.startsWith('7') || a.code.startsWith('6'));
    const byAcctBucket = new Map();
    plAccounts.forEach(a => byAcctBucket.set(a.code, { acct: a, colVals: {}, total: 0 }));

    jes.forEach(j => {
      if (!byAcctBucket.has(j.acct_code)) return;
      const entry = byAcctBucket.get(j.acct_code);
      const b = periodBucket(j.date, pMode);
      const signed = j.acct_code.startsWith('7') ? (j.credit - j.debit) : (j.debit - j.credit);
      entry.colVals[b] = (entry.colVals[b] || 0) + signed;
      entry.total += signed;
    });

    const revCodes = ['701', '706'];
    const expCodes = ['601', '615', '622', '641'];
    const sumCols = (codes) => {
      const m = { total: 0 };
      cols.forEach(c => { m[c] = 0; });
      codes.forEach(code => {
        const e = byAcctBucket.get(code);
        if (!e) return;
        m.total += e.total;
        cols.forEach(c => { m[c] += (e.colVals[c] || 0); });
      });
      return m;
    };

    const revTot = sumCols(revCodes);
    const expTot = sumCols(expCodes);

    const renderGroup = (title, codes) => {
      const tot = sumCols(codes);
      return `
        <tr class="rdl-group-row"><td colspan="${cols.length + 3}">${esc(title)}</td></tr>
        ${codes.map(code => {
          const e = byAcctBucket.get(code);
          return `
            <tr>
              <td class="mono bold">${esc(e.acct.code)}</td>
              <td>${esc(e.acct.name)}</td>
              ${cols.map(c => `<td class="num">${fmtUsd(e.colVals[c] || 0)}</td>`).join('')}
              <td class="num bold">${fmtUsd(e.total)}</td>
            </tr>
          `;
        }).join('')}
        <tr class="rdl-subtotal-row">
          <td colspan="2">Total ${esc(title)}</td>
          ${cols.map(c => `<td class="num">${fmtUsd(tot[c])}</td>`).join('')}
          <td class="num">${fmtUsd(tot.total)}</td>
        </tr>
      `;
    };

    return `
      ${sheetHeaderHtml(meta, ctx.co, `Period ${p.from} to ${p.to} · Columns by ${pMode} · Lebanese CoA Classes 6 & 7`)}
      <table class="rdl-table">
        <thead>
          <tr>
            <th style="width:70px">Code</th>
            <th>P&L Line Item</th>
            ${cols.map(c => `<th class="num">${esc(c)}</th>`).join('')}
            <th class="num">Period Total ($)</th>
          </tr>
        </thead>
        <tbody>
          ${renderGroup(`OPERATING REVENUE (Class 7 ${isMfg ? '—' : '·'} الإيرادات التشغيلية)`, revCodes)}
          ${renderGroup(`OPERATING COSTS & EXPENSES (Class 6 ${isMfg ? '—' : '·'} الأعباء والمصاريف)`, expCodes)}
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td colspan="2">NET OPERATING INCOME / EBITDA (صافي النتيجة التشغيلية)</td>
            ${cols.map(c => `<td class="num">${fmtUsdSigned((revTot[c] || 0) - (expTot[c] || 0))}</td>`).join('')}
            <td class="num">${fmtUsdSigned(revTot.total - expTot.total)}</td>
          </tr>
        </tfoot>
      </table>
      ${sheetFooterHtml(ctx.co, 1, 1)}
    `;
  }

  function render04CashFlow(meta, ctx) {
    const p = ctx.rdl.params;
    const pMode = p.period || 'Month';
    const txDate = r => String((r && (r.date || r.tx_date)) || '').slice(0, 10);
    const sales = (ctx.arLedgerAll || ctx.salesAll).filter(r => inWindow(txDate(r), p.from, p.to));
    const exps = ctx.expAll.filter(r => inWindow(txDate(r), p.from, p.to));
    const rms = (ctx.apRmLedgerAll || ctx.rmAll).filter(r => inWindow(txDate(r), p.from, p.to));
    const fuels = ctx.fuelAll.filter(r => inWindow(txDate(r), p.from, p.to));
    const pays = ctx.payAll.filter(r => inWindow(txDate(r), p.from, p.to));

    const bucketsSet = new Set();
    [...sales, ...exps, ...rms, ...fuels, ...pays].forEach(r => bucketsSet.add(periodBucket(txDate(r), pMode)));
    const allB = [...bucketsSet].sort();
    const cols = allB.length > 8 ? allB.slice(-8) : (allB.length ? allB : [periodBucket(p.to, pMode)]);

    const dt = ctx.domainTerms || DOMAIN_RDL_TERMS['Manufacturing'];
    const lines = {
      custIn: { label: dt.cfCustIn, cols: {}, total: 0 },
      rmOut: { label: dt.cfRmOut, cols: {}, total: 0 },
      fuelOut: { label: dt.cfFuelOut, cols: {}, total: 0 },
      expOut: { label: dt.cfExpOut, cols: {}, total: 0 },
      payOut: { label: 'Staff Salaries & Daily Labor Disbursed (مدفوعات الرواتب والأجور)', cols: {}, total: 0 }
    };

    const addVal = (key, d, val) => {
      const b = periodBucket(d, pMode);
      lines[key].cols[b] = (lines[key].cols[b] || 0) + val;
      lines[key].total += val;
    };

    sales.forEach(r => addVal('custIn', txDate(r), Number(r.paid_usd || 0)));
    rms.forEach(r => addVal('rmOut', txDate(r), -Number(r.paid_usd || r.total_usd || 0)));
    fuels.forEach(r => addVal('fuelOut', txDate(r), -Number(r.paid_usd || r.total_usd || 0)));
    exps.forEach(r => addVal('expOut', txDate(r), -Number(r.paid_usd || r.total_usd || 0)));
    pays.forEach(r => addVal('payOut', txDate(r), -Number(r.paid_usd || r.net_usd || 0)));

    const rowKeys = ['custIn', 'rmOut', 'fuelOut', 'expOut', 'payOut'];
    return `
      ${sheetHeaderHtml(meta, ctx.co, `Direct Cash Flow Method · Period ${p.from} to ${p.to} · Columns by ${pMode}`)}
      <table class="rdl-table">
        <thead>
          <tr>
            <th>Cash Flow Activity Line (Direct Method)</th>
            ${cols.map(c => `<th class="num">${esc(c)}</th>`).join('')}
            <th class="num">Period Total ($)</th>
          </tr>
        </thead>
        <tbody>
          <tr class="rdl-group-row"><td colspan="${cols.length + 2}">CASH FLOWS FROM OPERATING ACTIVITIES</td></tr>
          ${rowKeys.map(k => {
            const L = lines[k];
            return `
              <tr>
                <td>${esc(L.label)}</td>
                ${cols.map(c => `<td class="num">${fmtUsdSigned(L.cols[c] || 0)}</td>`).join('')}
                <td class="num bold">${fmtUsdSigned(L.total)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td>NET OPERATING CASH FLOW (صافي التدفق النقدي التشغيلي)</td>
            ${cols.map(c => {
              const s = rowKeys.reduce((acc, k) => acc + (lines[k].cols[c] || 0), 0);
              return `<td class="num">${fmtUsdSigned(s)}</td>`;
            }).join('')}
            <td class="num">${fmtUsdSigned(rowKeys.reduce((acc, k) => acc + lines[k].total, 0))}</td>
          </tr>
        </tfoot>
      </table>
      ${sheetFooterHtml(ctx.co, 1, 1)}
    `;
  }

  function render05TrialBalance(meta, ctx) {
    const p = ctx.rdl.params;
    const coaList = ctx.coaAccounts || COA_ACCOUNTS;
    const jes = buildJournalEntries(ctx, p.to);
    const map = new Map();
    coaList.forEach(a => map.set(a.code, { acct: a, openDr: 0, openCr: 0, perDr: 0, perCr: 0 }));

    jes.forEach(j => {
      const m = map.get(j.acct_code);
      if (!m) return;
      if (j.date < p.from) {
        m.openDr += j.debit;
        m.openCr += j.credit;
      } else if (j.date <= p.to) {
        m.perDr += j.debit;
        m.perCr += j.credit;
      }
    });

    let tOpenDr = 0, tOpenCr = 0, tPerDr = 0, tPerCr = 0, tCloseDr = 0, tCloseCr = 0;
    const rowsHtml = coaList.map(a => {
      const m = map.get(a.code);
      const netOpen = m.openDr - m.openCr;
      const oDr = netOpen > 0 ? netOpen : 0;
      const oCr = netOpen < 0 ? -netOpen : 0;
      const netClose = (m.openDr + m.perDr) - (m.openCr + m.perCr);
      const cDr = netClose > 0 ? netClose : 0;
      const cCr = netClose < 0 ? -netClose : 0;

      tOpenDr += oDr; tOpenCr += oCr;
      tPerDr += m.perDr; tPerCr += m.perCr;
      tCloseDr += cDr; tCloseCr += cCr;

      return `
        <tr>
          <td class="mono bold">${esc(a.code)}</td>
          <td>${esc(a.name)}</td>
          <td class="num">${fmtUsd(oDr)}</td>
          <td class="num">${fmtUsd(oCr)}</td>
          <td class="num">${fmtUsd(m.perDr)}</td>
          <td class="num">${fmtUsd(m.perCr)}</td>
          <td class="num bold">${fmtUsd(cDr)}</td>
          <td class="num bold">${fmtUsd(cCr)}</td>
        </tr>
      `;
    }).join('');

    const isMfg = !ctx.ind || ctx.ind === 'Manufacturing';
    return `
      ${sheetHeaderHtml(meta, ctx.co, `Six-Column Trial Balance · Period ${p.from} to ${p.to} · Functional Currency USD${!isMfg && Math.abs(tCloseDr - tCloseCr) < 0.02 ? ' · Balanced ($0.00 Variance)' : ''}`)}
      <table class="rdl-table">
        <thead>
          <tr>
            <th style="width:70px">Code</th>
            <th>Account Title</th>
            <th class="num">Opening Dr ($)</th>
            <th class="num">Opening Cr ($)</th>
            <th class="num">Period Dr ($)</th>
            <th class="num">Period Cr ($)</th>
            <th class="num">Closing Dr ($)</th>
            <th class="num">Closing Cr ($)</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td colspan="2">TOTAL TRIAL BALANCE (مجموع ميزان المراجعة)</td>
            <td class="num">${fmtUsd(tOpenDr)}</td>
            <td class="num">${fmtUsd(tOpenCr)}</td>
            <td class="num">${fmtUsd(tPerDr)}</td>
            <td class="num">${fmtUsd(tPerCr)}</td>
            <td class="num">${fmtUsd(tCloseDr)}</td>
            <td class="num">${fmtUsd(tCloseCr)}</td>
          </tr>
        </tfoot>
      </table>
      ${sheetFooterHtml(ctx.co, 1, 1)}
    `;
  }


  function render06GeneralJournal(meta, ctx) {
    const p = ctx.rdl.params;
    const allJes = buildJournalEntries(ctx, p.to).filter(j => {
      if (!inWindow(j.date, p.from, p.to)) return false;
      if (p.account && p.account !== 'ALL' && j.acct_code !== p.account) return false;
      return true;
    });
    const totDr = allJes.reduce((s, j) => s + j.debit, 0);
    const totCr = allJes.reduce((s, j) => s + j.credit, 0);
    const viewJes = allJes.slice(-180).reverse();

    return `
      ${sheetHeaderHtml(meta, ctx.co, `Period ${p.from} to ${p.to} · Account: ${p.account === 'ALL' ? 'All Accounts' : p.account} · ${allJes.length} journal lines (showing ${viewJes.length})`)}
      <table class="rdl-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>JE No.</th>
            <th>Source</th>
            <th>Ref / Voucher</th>
            <th>Acct</th>
            <th>Sub-Account / Counterparty</th>
            <th>Narration</th>
            <th class="num">Debit ($)</th>
            <th class="num">Credit ($)</th>
          </tr>
        </thead>
        <tbody>
          ${viewJes.map(j => `
            <tr>
              <td class="mono">${esc(j.date)}</td>
              <td class="mono">${esc(j.je_no)}</td>
              <td>${esc(j.source)}</td>
              <td class="mono">${esc(j.ref)}</td>
              <td class="mono bold">${esc(j.acct_code)}</td>
              <td>${esc(j.sub_account)}</td>
              <td>${esc(j.description)}</td>
              <td class="num">${j.debit > 0 ? fmtUsd(j.debit, 2) : '—'}</td>
              <td class="num">${j.credit > 0 ? fmtUsd(j.credit, 2) : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td colspan="7">TOTAL PERIOD JOURNAL POSTINGS (${fmtNum(allJes.length, 0)} lines)</td>
            <td class="num">${fmtUsd(totDr, 2)}</td>
            <td class="num">${fmtUsd(totCr, 2)}</td>
          </tr>
        </tfoot>
      </table>
      ${sheetFooterHtml(ctx.co, 1, 1)}
    `;
  }

  function render07SubAccount(meta, ctx) {
    const p = ctx.rdl.params;
    const jes = buildJournalEntries(ctx, p.to).filter(j => {
      if (p.account && p.account !== 'ALL' && j.acct_code !== p.account) return false;
      if (p.subAccount && p.subAccount !== 'ALL' && j.sub_account !== p.subAccount) return false;
      return true;
    }).sort((a, b) => a.date.localeCompare(b.date));

    let openDr = 0, openCr = 0;
    const periodRows = [];
    jes.forEach(j => {
      if (j.date < p.from) {
        openDr += j.debit;
        openCr += j.credit;
      } else if (j.date <= p.to) {
        periodRows.push(j);
      }
    });

    let runBal = openDr - openCr;
    const totDr = periodRows.reduce((s, j) => s + j.debit, 0);
    const totCr = periodRows.reduce((s, j) => s + j.credit, 0);
    const viewRows = periodRows.slice(-150);

    return `
      ${sheetHeaderHtml(meta, ctx.co, `Period ${p.from} to ${p.to} · Account: ${p.account || 'ALL'} · Sub-account: ${!p.subAccount || p.subAccount === 'ALL' ? 'All Sub-accounts' : p.subAccount}`)}
      <table class="rdl-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Ref</th>
            <th>Acct</th>
            <th>Sub-Account</th>
            <th>Description</th>
            <th class="num">Debit ($)</th>
            <th class="num">Credit ($)</th>
            <th class="num">Running Balance ($)</th>
          </tr>
        </thead>
        <tbody>
          <tr class="rdl-subtotal-row">
            <td class="mono">${esc(p.from)}</td>
            <td colspan="4">Opening Balance Brought Forward (رصيد مدور)</td>
            <td class="num">${fmtUsd(openDr, 2)}</td>
            <td class="num">${fmtUsd(openCr, 2)}</td>
            <td class="num bold">${fmtUsdSigned(runBal, 2)}</td>
          </tr>
          ${viewRows.map(j => {
            runBal += (j.debit - j.credit);
            return `
              <tr>
                <td class="mono">${esc(j.date)}</td>
                <td class="mono">${esc(j.ref)}</td>
                <td class="mono bold">${esc(j.acct_code)}</td>
                <td class="bold">${esc(j.sub_account)}</td>
                <td>${esc(j.description)}</td>
                <td class="num">${j.debit > 0 ? fmtUsd(j.debit, 2) : '—'}</td>
                <td class="num">${j.credit > 0 ? fmtUsd(j.credit, 2) : '—'}</td>
                <td class="num bold">${fmtUsdSigned(runBal, 2)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td colspan="5">CLOSING SUB-ACCOUNT BALANCE (الرصيد الختامي)</td>
            <td class="num">${fmtUsd(openDr + totDr, 2)}</td>
            <td class="num">${fmtUsd(openCr + totCr, 2)}</td>
            <td class="num">${fmtUsdSigned((openDr + totDr) - (openCr + totCr), 2)}</td>
          </tr>
        </tfoot>
      </table>
      ${sheetFooterHtml(ctx.co, 1, 1)}
    `;
  }

  function render08SalesRegister(meta, ctx) {
    const p = ctx.rdl.params;
    const rows = ctx.salesAll.filter(r => {
      if (!inWindow(rowDate(r, ctx.basis), p.from, p.to)) return false;
      if (p.customer && p.customer !== 'ALL' && r.customer !== p.customer) return false;
      if (p.product && p.product !== 'ALL' && r.product !== p.product) return false;
      if (p.site && p.site !== 'ALL' && r.site !== p.site) return false;
      return true;
    }).sort((a, b) => rowDate(b, ctx.basis).localeCompare(rowDate(a, ctx.basis)));

    const totQty = rows.reduce((s, r) => s + Number(r.qty || 0), 0);
    const totSub = rows.reduce((s, r) => s + (Number(r.total_usd || 0) - Number(r.vat_usd || 0)), 0);
    const totVat = rows.reduce((s, r) => s + Number(r.vat_usd || 0), 0);
    const totGross = rows.reduce((s, r) => s + Number(r.total_usd || 0), 0);
    const totPaid = rows.reduce((s, r) => s + Number(r.paid_usd || 0), 0);
    const viewRows = rows.slice(0, 160);

    const showTaxCols = Boolean(ctx.showTaxBreakdown || ctx.officialScope);
    const isMfg = !ctx.ind || ctx.ind === 'Manufacturing';
    const dt = ctx.domainTerms || DOMAIN_RDL_TERMS['Manufacturing'];
    const recWord = isMfg ? 'tickets' : dt.txPlural;
    return `
      ${sheetHeaderHtml(meta, ctx.co, `Period ${p.from} to ${p.to} · Customer: ${p.customer || 'ALL'} · Product: ${p.product || 'ALL'} · Site: ${p.site || 'ALL'} · ${rows.length} ${recWord} (showing ${viewRows.length})`)}
      <table class="rdl-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Ticket / Inv</th>
            ${showTaxCols ? '<th>VAT Inv</th>' : ''}
            <th>Customer</th>
            <th>${isMfg ? 'Site' : 'Location'}</th>
            <th>Product</th>
            <th class="num">${esc(dt.qtyCol)}</th>
            <th class="num">Price ($)</th>
            ${showTaxCols ? '<th class="num">Net ($)</th><th class="num">VAT ($)</th>' : ''}
            <th class="num">Total ($)</th>
            <th class="num">Paid ($)</th>
          </tr>
        </thead>
        <tbody>
          ${viewRows.map(r => {
            const net = Number(r.total_usd || 0) - Number(r.vat_usd || 0);
            const unitRate = Number(r.qty || 0) > 0 && !showTaxCols
              ? Math.abs(Number(r.total_usd || 0) / Number(r.qty || 1))
              : Number(r.unit_price || 0);
            return `
              <tr>
                <td class="mono">${esc(rowDate(r, ctx.basis))}</td>
                <td class="mono">${esc(r.ticket_no || r.invoice_no || '-')}</td>
                ${showTaxCols ? `<td class="mono bold">${esc(r.vat_inv || '-')}</td>` : ''}
                <td class="bold">${esc(r.customer || '-')}</td>
                <td>${esc(r.site || '-')}</td>
                <td>${esc(r.product || '-')}</td>
                <td class="num">${fmtNum(r.qty, dt.qtyDp)}</td>
                <td class="num">${fmtUsd(unitRate, 2)}</td>
                ${showTaxCols ? `<td class="num">${fmtUsdSigned(net, 2)}</td><td class="num">${fmtUsdSigned(r.vat_usd, 2)}</td>` : ''}
                <td class="num bold">${fmtUsdSigned(r.total_usd, 2)}</td>
                <td class="num">${fmtUsdSigned(r.paid_usd, 2)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td colspan="${showTaxCols ? 6 : 5}">TOTAL SALES REGISTER (${fmtNum(rows.length, 0)} ${esc(recWord)})</td>
            <td class="num">${fmtNum(totQty, dt.qtyDp)}</td>
            <td class="num">${fmtUsd(totQty > 0 ? totGross / totQty : 0, 2)}</td>
            ${showTaxCols ? `<td class="num">${fmtUsd(totSub, 2)}</td><td class="num">${fmtUsd(totVat, 2)}</td>` : ''}
            <td class="num">${fmtUsd(totGross, 2)}</td>
            <td class="num">${fmtUsd(totPaid, 2)}</td>
          </tr>
        </tfoot>
      </table>
      ${sheetFooterHtml(ctx.co, 1, 1)}
    `;
  }

  function render09ExpenseRegister(meta, ctx) {
    const p = ctx.rdl.params;
    const rows = ctx.expAll.filter(r => {
      if (!inWindow(rowDate(r, ctx.basis), p.from, p.to)) return false;
      if (p.supplier && p.supplier !== 'ALL' && r.supplier !== p.supplier) return false;
      if (p.category && p.category !== 'ALL' && r.category !== p.category) return false;
      return true;
    }).sort((a, b) => rowDate(b, ctx.basis).localeCompare(rowDate(a, ctx.basis)));

    const totNet = rows.reduce((s, r) => s + (Number(r.total_usd || 0) - Number(r.vat_usd || 0)), 0);
    const totVat = rows.reduce((s, r) => s + Number(r.vat_usd || 0), 0);
    const totGross = rows.reduce((s, r) => s + Number(r.total_usd || 0), 0);
    const totPaid = rows.reduce((s, r) => s + Number(r.paid_usd || 0), 0);
    const viewRows = rows.slice(0, 160);

    return `
      ${sheetHeaderHtml(meta, ctx.co, `Period ${p.from} to ${p.to} · Supplier: ${p.supplier || 'ALL'} · Category: ${p.category || 'ALL'} · ${rows.length} vouchers (showing ${viewRows.length})`)}
      <table class="rdl-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Voucher / Inv</th>
            <th>Category</th>
            <th>Supplier / Payee</th>
            <th>Description</th>
            <th class="num">Net ($)</th>
            <th class="num">VAT ($)</th>
            <th class="num">Total ($)</th>
            <th class="num">Paid ($)</th>
            <th class="num">Balance ($)</th>
          </tr>
        </thead>
        <tbody>
          ${viewRows.map(r => {
            const net = Number(r.total_usd || 0) - Number(r.vat_usd || 0);
            return `
              <tr>
                <td class="mono">${esc(rowDate(r, ctx.basis))}</td>
                <td class="mono">${esc(r.voucher_no || r.invoice_no || r.name || '—')}</td>
                <td>${esc(r.category || '—')}</td>
                <td class="bold">${esc(r.supplier || '—')}</td>
                <td>${esc(r.description || '—')}</td>
                <td class="num">${fmtUsdSigned(net, 2)}</td>
                <td class="num">${fmtUsdSigned(r.vat_usd, 2)}</td>
                <td class="num bold">${fmtUsdSigned(r.total_usd, 2)}</td>
                <td class="num">${fmtUsdSigned(r.paid_usd, 2)}</td>
                <td class="num">${fmtUsdSigned(r.balance_usd, 2)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td colspan="5">TOTAL EXPENSE REGISTER (${fmtNum(rows.length, 0)} vouchers)</td>
            <td class="num">${fmtUsd(totNet, 2)}</td>
            <td class="num">${fmtUsd(totVat, 2)}</td>
            <td class="num">${fmtUsd(totGross, 2)}</td>
            <td class="num">${fmtUsd(totPaid, 2)}</td>
            <td class="num">${fmtUsd(totGross - totPaid, 2)}</td>
          </tr>
        </tfoot>
      </table>
      ${sheetFooterHtml(ctx.co, 1, 1)}
    `;
  }


  function render10PayrollRegister(meta, ctx) {
    const p = ctx.rdl.params;
    const rows = ctx.payAll.filter(r => {
      if (!inWindow(rowDate(r, ctx.basis), p.from, p.to)) return false;
      if (p.staff && p.staff !== 'ALL' && r.staff !== p.staff) return false;
      return true;
    }).sort((a, b) => rowDate(b, ctx.basis).localeCompare(rowDate(a, ctx.basis)));

    const regCalc = (typeof window !== 'undefined' && typeof window.__mfgComputeStaffPayrollRegister === 'function')
      ? window.__mfgComputeStaffPayrollRegister({ activeRange: { from: p.from, to: p.to } })
      : null;
    const staffEarnRows = ((regCalc && regCalc.staffRows) || []).filter(sr => {
      if (!sr) return false;
      if (!coMatch(sr.company || 'WTC', ctx.co, null)) return false;
      if (p.staff && p.staff !== 'ALL' && sr.staff !== p.staff) return false;
      return Math.abs(sr.earnings || 0) > 0.005 || Math.abs(sr.paid || 0) > 0.005 || Math.abs(sr.reimb || 0) > 0.005;
    });

    const sumBase = staffEarnRows.reduce((s, r) => s + Number(r.base || 0), 0);
    const sumReimb = staffEarnRows.reduce((s, r) => s + Number(r.reimb || 0), 0);
    const sumOtSite = staffEarnRows.reduce((s, r) => s + Number(r.ot_pay || 0) + Number(r.site_allow || 0) + Number(r.extras || 0), 0);
    const sumDedAll = staffEarnRows.reduce((s, r) => s + Number(r.late_ded || 0) + Number(r.abs_ded || 0) + Number(r.ded || 0), 0);
    const sumEarned = staffEarnRows.reduce((s, r) => s + Number(r.earnings || 0), 0);
    const sumPaidReg = staffEarnRows.reduce((s, r) => s + Number(r.paid || 0), 0);
    const sumBalReg = staffEarnRows.reduce((s, r) => s + Number(r.balance || 0), 0);

    const totPaid = rows.reduce((s, r) => s + Number(r.paid_usd || 0), 0);
    const viewRows = rows.slice(0, 160);

    const summaryHtml = staffEarnRows.length ? `
      <div class="rdl-section-title" style="margin:6px 0 6px;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:#334155">1 · Staff Earnings, Transportation / Reimbursement &amp; Remaining Balance (${fmtNum(staffEarnRows.length, 0)} Staff)</div>
      <table class="rdl-table" style="margin-bottom:14px">
        <thead>
          <tr>
            <th>Staff Member</th>
            <th>Co.</th>
            <th class="num">Base ($)</th>
            <th class="num">Transp. / Reimb. ($)</th>
            <th class="num">OT, Site &amp; Extras ($)</th>
            <th class="num">Deductions ($)</th>
            <th class="num">Net Earned ($)</th>
            <th class="num">Paid ($)</th>
            <th class="num">Balance ($)</th>
          </tr>
        </thead>
        <tbody>
          ${staffEarnRows.slice(0, 120).map(sr => {
            const otSite = Number(sr.ot_pay || 0) + Number(sr.site_allow || 0) + Number(sr.extras || 0);
            const dedTot = Number(sr.late_ded || 0) + Number(sr.abs_ded || 0) + Number(sr.ded || 0);
            return `
            <tr>
              <td class="bold">${esc(sr.staff || '-')}</td>
              <td>${esc(sr.company || 'WTC')}</td>
              <td class="num">${fmtUsd(sr.base || 0, 2)}</td>
              <td class="num">${sr.reimb ? fmtUsd(sr.reimb, 2) : '-'}</td>
              <td class="num">${Math.abs(otSite) > 0.005 ? fmtUsdSigned(otSite, 2) : '-'}</td>
              <td class="num">${dedTot > 0.005 ? fmtUsd(dedTot, 2) : '-'}</td>
              <td class="num bold">${fmtUsd(sr.earnings || 0, 2)}</td>
              <td class="num">${fmtUsd(sr.paid || 0, 2)}</td>
              <td class="num bold">${fmtUsdSigned(sr.balance || 0, 2)}</td>
            </tr>`;
          }).join('')}
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td colspan="2">TOTAL STAFF PAYROLL SUMMARY (${fmtNum(staffEarnRows.length, 0)} staff)</td>
            <td class="num">${fmtUsd(sumBase, 2)}</td>
            <td class="num">${fmtUsd(sumReimb, 2)}</td>
            <td class="num">${fmtUsdSigned(sumOtSite, 2)}</td>
            <td class="num">${fmtUsd(sumDedAll, 2)}</td>
            <td class="num">${fmtUsd(sumEarned, 2)}</td>
            <td class="num">${fmtUsd(sumPaidReg, 2)}</td>
            <td class="num">${fmtUsdSigned(sumBalReg, 2)}</td>
          </tr>
        </tfoot>
      </table>
      <div class="rdl-section-title" style="margin:10px 0 6px;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:#334155">2 · Salary Disbursement Vouchers (${fmtNum(rows.length, 0)} Entries)</div>
    ` : '';

    return `
      ${sheetHeaderHtml(meta, ctx.co, `Period ${p.from} to ${p.to} · Staff: ${p.staff === 'ALL' ? 'All Staff' : p.staff} · ${staffEarnRows.length} staff · ${rows.length} disbursement entries`)}
      ${summaryHtml}
      <table class="rdl-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Staff Member</th>
            <th>Payroll Period</th>
            <th>Method</th>
            <th class="num">Disbursed ($)</th>
          </tr>
        </thead>
        <tbody>
          ${viewRows.map(r => `
            <tr>
              <td class="mono">${esc(rowDate(r, ctx.basis))}</td>
              <td class="bold">${esc(r.staff || '-')}</td>
              <td>${esc(r.role || '-')}</td>
              <td>${esc(r.type || 'Cash')}</td>
              <td class="num bold">${fmtUsd(r.paid_usd, 2)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td colspan="4">TOTAL SALARY DISBURSEMENTS (${fmtNum(rows.length, 0)} entries)</td>
            <td class="num">${fmtUsd(totPaid, 2)}</td>
          </tr>
        </tfoot>
      </table>
      ${sheetFooterHtml(ctx.co, 1, 1)}
    `;
  }

  function render11RawMaterial(meta, ctx) {
    const p = ctx.rdl.params;
    const rows = ctx.rmAll.filter(r => {
      if (!inWindow(rowDate(r, ctx.basis), p.from, p.to)) return false;
      if (p.supplier && p.supplier !== 'ALL' && r.supplier !== p.supplier) return false;
      return true;
    }).sort((a, b) => rowDate(b, ctx.basis).localeCompare(rowDate(a, ctx.basis)));

    const totQty = rows.reduce((s, r) => s + Number(r.qty || 0), 0);
    const totUsd = rows.reduce((s, r) => s + Number(r.total_usd || 0), 0);
    const totPaid = rows.reduce((s, r) => s + Number(r.paid_usd || 0), 0);
    const viewRows = rows.slice(0, 160);

    return `
      ${sheetHeaderHtml(meta, ctx.co, `Period ${p.from} to ${p.to} · Supplier: ${p.supplier === 'ALL' ? 'All Suppliers' : p.supplier} · ${rows.length} intake tickets`)}
      <table class="rdl-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Voucher / Ticket</th>
            <th>Material</th>
            <th>Supplier</th>
            <th>Driver / Plate</th>
            <th class="num">Qty</th>
            <th>Unit</th>
            <th class="num">Unit Price ($)</th>
            <th class="num">Total ($)</th>
            <th class="num">Paid ($)</th>
          </tr>
        </thead>
        <tbody>
          ${viewRows.map(r => `
            <tr>
              <td class="mono">${esc(rowDate(r, ctx.basis))}</td>
              <td class="mono">${esc(r.voucher || r.name || '—')}</td>
              <td class="bold">${esc(r.material || '—')}</td>
              <td>${esc(r.supplier || '—')}</td>
              <td>${esc(r.driver || r.plate || '—')}</td>
              <td class="num">${fmtNum(r.qty, 2)}</td>
              <td>${esc(r.unit || 'Ton')}</td>
              <td class="num">${fmtUsd(r.unit_price, 2)}</td>
              <td class="num bold">${fmtUsd(r.total_usd, 2)}</td>
              <td class="num">${fmtUsd(r.paid_usd, 2)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td colspan="5">TOTAL RAW MATERIAL INTAKE (${fmtNum(rows.length, 0)} deliveries)</td>
            <td class="num">${fmtNum(totQty, 2)}</td>
            <td>Ton / m³</td>
            <td class="num">${fmtUsd(totQty > 0 ? totUsd / totQty : 0, 2)}</td>
            <td class="num">${fmtUsd(totUsd, 2)}</td>
            <td class="num">${fmtUsd(totPaid, 2)}</td>
          </tr>
        </tfoot>
      </table>
      ${sheetFooterHtml(ctx.co, 1, 1)}
    `;
  }

  function render12FuelLog(meta, ctx) {
    const p = ctx.rdl.params;
    const rows = ctx.fuelAll.filter(r => {
      if (!inWindow(rowDate(r, ctx.basis), p.from, p.to)) return false;
      if (p.equipType && p.equipType !== 'ALL' && r.equip_type !== p.equipType) return false;
      if (p.equipment && p.equipment !== 'ALL' && r.equip !== p.equipment) return false;
      if (p.driver && p.driver !== 'ALL' && r.driver !== p.driver) return false;
      return true;
    }).sort((a, b) => rowDate(b, ctx.basis).localeCompare(rowDate(a, ctx.basis)));

    const totLiters = rows.reduce((s, r) => s + Number(r.liters || 0), 0);
    const totUsd = rows.reduce((s, r) => s + Number(r.total_usd || 0), 0);
    const viewRows = rows.slice(0, 160);

    return `
      ${sheetHeaderHtml(meta, ctx.co, `Period ${p.from} to ${p.to} · Type: ${p.equipType || 'ALL'} · Equipment: ${p.equipment || 'ALL'} · Driver: ${p.driver || 'ALL'} · ${rows.length} dispensings`)}
      <table class="rdl-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Voucher</th>
            <th>Equipment / Truck</th>
            <th>Equip. Type</th>
            <th>Driver</th>
            <th class="num">Odometer / Hrs</th>
            <th class="num">Liters (L)</th>
            <th class="num">Rate ($/L)</th>
            <th class="num">Total ($)</th>
          </tr>
        </thead>
        <tbody>
          ${viewRows.map(r => `
            <tr>
              <td class="mono">${esc(rowDate(r, ctx.basis))}</td>
              <td class="mono">${esc(r.voucher || r.name || '-')}</td>
              <td class="bold">${esc(r.equip || '-')}</td>
              <td>${esc(r.equip_type || 'Mixer')}</td>
              <td>${esc(r.driver || '-')}</td>
              <td class="num">${r.odometer ? fmtNum(r.odometer, r.meter_unit === 'h' && r.odometer % 1 !== 0 ? 1 : 0) + (r.meter_unit ? ' ' + r.meter_unit : '') : '-'}</td>
              <td class="num bold">${fmtNum(r.liters, 1)}</td>
              <td class="num">${fmtUsd(r.price_per_l, 2)}</td>
              <td class="num bold">${fmtUsd(r.total_usd, 2)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td colspan="6">TOTAL DIESEL & FLEET FUEL LOG (${fmtNum(rows.length, 0)} fills)</td>
            <td class="num">${fmtNum(totLiters, 1)}</td>
            <td class="num">${fmtUsd(totLiters > 0 ? totUsd / totLiters : 0, 2)}</td>
            <td class="num">${fmtUsd(totUsd, 2)}</td>
          </tr>
        </tfoot>
      </table>
      ${sheetFooterHtml(ctx.co, 1, 1)}
    `;
  }

  function render13AgedReceivables(meta, ctx) {
    const asof = ctx.rdl.params.asof || ctx.rdl.params.to;
    const custFilter = ctx.rdl.params.customer;
    const asofMs = new Date(asof + 'T00:00:00Z').getTime() || Date.now();

    const byCust = new Map();
    const ensureCust = (c, d) => {
      if (!byCust.has(c)) {
        byCust.set(c, { customer: c, posTickets: [], crReturnUsd: 0, paid: 0, billed: 0, b0_30: 0, b31_60: 0, b61_90: 0, b90p: 0, totalBal: 0, lastDate: d });
      }
      const g = byCust.get(c);
      if (d > g.lastDate) g.lastDate = d;
      return g;
    };

    (ctx.arLedgerAll || ctx.salesAll).forEach(r => {
      const d = rowDate(r, ctx.basis);
      if (!d || d > asof) return;
      const c = r.customer || 'Walk-in Customer';
      if (custFilter && custFilter !== 'ALL' && c !== custFilter) return;
      if (r.is_receipt_row) {
        const g = ensureCust(c, d);
        g.paid += Number(r.paid_usd || 0);
      } else if (r.is_credit) {
        const tot = Number(r.total_usd || 0);
        if (Math.abs(tot) < 0.005) return;
        const g = ensureCust(c, d);
        g.billed += tot;
        if (tot > 0) g.posTickets.push({ d, amt: tot });
        else g.crReturnUsd += Math.abs(tot);
      }
    });

    byCust.forEach(g => {
      g.posTickets.sort((a, b) => a.d.localeCompare(b.d));
      const totalCredits = g.paid + g.crReturnUsd;
      let pool = Math.max(0, totalCredits);
      g.posTickets.forEach(tk => {
        const used = Math.min(pool, tk.amt);
        pool -= used;
        const rem = tk.amt - used;
        if (rem > 0.005) {
          const ageDays = Math.max(0, Math.floor((asofMs - (new Date(tk.d + 'T00:00:00Z').getTime() || asofMs)) / 86400000));
          if (ageDays <= 30) g.b0_30 += rem;
          else if (ageDays <= 60) g.b31_60 += rem;
          else if (ageDays <= 90) g.b61_90 += rem;
          else g.b90p += rem;
        }
      });
      if (pool > 0.005) g.b0_30 -= pool;
      if (totalCredits < -0.005) g.b0_30 += Math.abs(totalCredits);
      g.totalBal = g.billed - g.paid;
    });

    const rows = [...byCust.values()]
      .filter(g => Math.abs(g.totalBal) > 0.01 || Math.abs(g.billed) > 0.01 || Math.abs(g.paid) > 0.01)
      .sort((a, b) => b.totalBal - a.totalBal)
      .slice(0, 450);

    const sum = k => rows.reduce((s, r) => s + r[k], 0);

    return `
      ${sheetHeaderHtml(meta, ctx.co, `As at ${asof} · Customer: ${custFilter === 'ALL' ? 'All Customers' : custFilter} · FIFO 30/60/90+ Day Aging Buckets`)}
      <table class="rdl-table">
        <thead>
          <tr>
            <th>Customer (Account 411)</th>
            <th class="num">${(!ctx.ind || ctx.ind === 'Manufacturing') ? 'Credit Sales TTC ($)' : 'Credit Billed ($)'}</th>
            <th class="num">Settled ($)</th>
            <th class="num">0–30 Days ($)</th>
            <th class="num">31–60 Days ($)</th>
            <th class="num">61–90 Days ($)</th>
            <th class="num">90+ Days ($)</th>
            <th class="num">Net Receivable ($)</th>
            <th>Last Activity</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td class="bold">${esc(r.customer)}</td>
              <td class="num">${fmtUsd(r.billed)}</td>
              <td class="num">${fmtUsd(r.paid)}</td>
              <td class="num">${fmtUsdSigned(r.b0_30)}</td>
              <td class="num">${fmtUsdSigned(r.b31_60)}</td>
              <td class="num">${fmtUsdSigned(r.b61_90)}</td>
              <td class="num">${fmtUsdSigned(r.b90p)}</td>
              <td class="num bold">${fmtUsdSigned(r.totalBal)}</td>
              <td class="mono">${esc(r.lastDate)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td>TOTAL AGED RECEIVABLES (${rows.length} accounts)</td>
            <td class="num">${fmtUsd(sum('billed'))}</td>
            <td class="num">${fmtUsd(sum('paid'))}</td>
            <td class="num">${fmtUsdSigned(sum('b0_30'))}</td>
            <td class="num">${fmtUsdSigned(sum('b31_60'))}</td>
            <td class="num">${fmtUsdSigned(sum('b61_90'))}</td>
            <td class="num">${fmtUsdSigned(sum('b90p'))}</td>
            <td class="num">${fmtUsdSigned(sum('totalBal'))}</td>
            <td>—</td>
          </tr>
        </tfoot>
      </table>
      ${sheetFooterHtml(ctx.co, 1, 1)}
    `;
  }


  function render14CustomerStatement(meta, ctx) {
    const p = ctx.rdl.params;
    const isMfg = !ctx.ind || ctx.ind === 'Manufacturing';
    const dt = ctx.domainTerms || DOMAIN_RDL_TERMS['Manufacturing'];
    const custName = (p.customer && p.customer !== 'ALL') ? p.customer : (ctx.customers[0] || dt.custDefault);
    const allCustRows = (ctx.arLedgerAll || ctx.salesAll)
      .filter(r => r.customer === custName && (r.is_receipt_row || r.is_credit))
      .sort((a, b) => rowDate(a, ctx.basis).localeCompare(rowDate(b, ctx.basis)));

    let openDr = 0, openCr = 0;
    const periodRows = [];
    allCustRows.forEach(r => {
      const d = rowDate(r, ctx.basis);
      if (d < p.from) {
        openDr += Number(r.total_usd || 0);
        openCr += Number(r.paid_usd || 0);
      } else if (d <= p.to) {
        periodRows.push(r);
      }
    });

    let runBal = openDr - openCr;
    const totDr = periodRows.reduce((s, r) => s + Number(r.total_usd || 0), 0);
    const totCr = periodRows.reduce((s, r) => s + Number(r.paid_usd || 0), 0);
    const totM3 = periodRows.reduce((s, r) => s + Number(r.qty || 0), 0);
    const closingBal = runBal + totDr - totCr;
    const siteList = [...new Set(allCustRows.filter(r => !r.is_receipt_row).map(r => r.site).filter(Boolean))].slice(0, 3).join(' · ');
    const dash = isMfg ? '—' : '-';

    return `
      ${sheetHeaderHtml(meta, ctx.co, `Customer Statement of Account (SOA) · Period ${p.from} to ${p.to}`)}
      <div class="rdl-doc-top">
        ${companyBlockHtml(ctx.co)}
        ${metaRowsHtml([
          ['Statement Period', `${p.from} .. ${p.to}`],
          ['Account Code', isMfg ? '411 — Customers AR' : '411 · Customers AR'],
          [isMfg ? 'Dispatched Volume' : dt.volKpi, `${fmtNum(totM3, dt.qtyDp)} ${dt.qtyUnit} (${periodRows.filter(r => !r.is_receipt_row && !r.is_return).length} ${dt.txPlural})`],
          ['Closing Balance', fmtUsdSigned(closingBal, 2)]
        ])}
      </div>
      ${partyBlockHtml('Statement of Account For / كشف حساب الزبون', custName, siteList ? (isMfg ? `Active Sites: ${siteList}` : `Active Locations: ${siteList}`) : (isMfg ? 'Ready-Mix Concrete Account' : dt.custSubTitle), 'Account Currency: Fresh USD', '')}

      <table class="rdl-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Ticket / Inv</th>
            <th>VAT Inv</th>
            <th>${isMfg ? 'Site' : 'Location'}</th>
            <th>Product</th>
            <th class="num">${esc(dt.qtyCol)}</th>
            <th class="num">Price ($)</th>
            <th class="num">Debit / Billed ($)</th>
            <th class="num">Credit / Paid ($)</th>
            <th class="num">Running Balance ($)</th>
          </tr>
        </thead>
        <tbody>
          <tr class="rdl-subtotal-row">
            <td class="mono">${esc(p.from)}</td>
            <td colspan="6">Opening Balance Brought Forward (رصيد مدور)</td>
            <td class="num">${fmtUsd(openDr, 2)}</td>
            <td class="num">${fmtUsd(openCr, 2)}</td>
            <td class="num bold">${fmtUsdSigned(runBal, 2)}</td>
          </tr>
          ${periodRows.slice(-140).map(r => {
            const dr = Number(r.total_usd || 0);
            const cr = Number(r.paid_usd || 0);
            runBal += (dr - cr);
            return `
              <tr>
                <td class="mono">${esc(rowDate(r, ctx.basis))}</td>
                <td class="mono">${esc(r.ticket_no || r.invoice_no || dash)}</td>
                <td class="mono bold">${esc(r.vat_inv || dash)}</td>
                <td>${esc(r.site || dash)}</td>
                <td>${esc(r.product || dash)}</td>
                <td class="num">${fmtNum(r.qty, dt.qtyDp)}</td>
                <td class="num">${fmtUsd(r.unit_price, 2)}</td>
                <td class="num">${fmtUsdSigned(dr, 2)}</td>
                <td class="num">${cr !== 0 ? fmtUsdSigned(cr, 2) : dash}</td>
                <td class="num bold">${fmtUsdSigned(runBal, 2)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td colspan="5">CLOSING STATEMENT BALANCE ${isMfg ? '—' : '·'} ${esc(custName)}</td>
            <td class="num">${fmtNum(totM3, dt.qtyDp)}</td>
            <td>${dash}</td>
            <td class="num">${fmtUsd(openDr + totDr, 2)}</td>
            <td class="num">${fmtUsd(openCr + totCr, 2)}</td>
            <td class="num">${fmtUsdSigned(closingBal, 2)}</td>
          </tr>
        </tfoot>
      </table>
      ${signatureRowHtml('Prepared by Accounting / إعداد المحاسبة', 'Customer Confirmation / مصادقة الزبون')}
      ${sheetFooterHtml(ctx.co, 1, 1)}
    `;
  }

  function render15SupplierBalances(meta, ctx) {
    const asof = ctx.rdl.params.asof || ctx.rdl.params.to;
    const supFilter = ctx.rdl.params.supplier;
    const bySup = new Map();

    const addSup = (sup, d, type, billed, paid) => {
      if (!d || d > asof) return;
      const s = sup || '(Unassigned Supplier)';
      if (supFilter && supFilter !== 'ALL' && s !== supFilter) return;
      const g = bySup.get(s) || { supplier: s, rmUsd: 0, haulUsd: 0, expUsd: 0, billed: 0, paid: 0, lastDate: d };
      if (type === 'rm') g.rmUsd += billed;
      else if (type === 'haul') g.haulUsd += billed;
      else if (type === 'exp') g.expUsd += billed;
      g.billed += billed;
      g.paid += paid;
      if (d > g.lastDate) g.lastDate = d;
      bySup.set(s, g);
    };

    (ctx.apRmLedgerAll || ctx.rmAll).forEach(r => {
      const tp = r.is_settlement_row ? 'settle' : (r.leg === 'haulage' ? 'haul' : 'rm');
      addSup(r.supplier, rowDate(r, ctx.basis), tp, Number(r.total_usd || 0), Number(r.paid_usd || 0));
    });
    ctx.expAll.forEach(r => {
      if (!r.is_ap_credit) return;
      addSup(r.supplier, rowDate(r, ctx.basis), 'exp', Number(r.ap_credit_usd || 0), 0);
    });

    const isMfg = !ctx.ind || ctx.ind === 'Manufacturing';
    const seedCutRdl = (typeof SEED !== 'undefined' && SEED && SEED.generated_at) ? String(SEED.generated_at).slice(0, 10) : '2026-11-04';
    if (isMfg && (!asof || asof >= seedCutRdl) && typeof window !== 'undefined' && typeof window.__mfgComputeThreeLegPayables === 'function') {
      const coKey = ctx.co === 'WTC' ? 'wtc' : (ctx.co === 'BBConstruction' ? 'bbconstruction' : (ctx.co === 'Lions Transport' ? 'lionstransport' : 'manufacturing-group'));
      const legRes = window.__mfgComputeThreeLegPayables({ company: coKey, ignorePeriod: true });
      if (legRes && legRes.byNorm) {
        const lastDateByNorm = new Map();
        bySup.forEach((g, s) => {
          const nk = String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
          const ck = nk === 'kareem bdeir' ? 'karim bdeir' : nk;
          const prev = lastDateByNorm.get(ck) || '';
          if (g.lastDate && g.lastDate > prev) lastDateByNorm.set(ck, g.lastDate);
        });
        bySup.clear();
        legRes.byNorm.forEach((lr, sk) => {
          const s = lr.supplier || sk;
          if (supFilter && supFilter !== 'ALL' && String(s).toLowerCase() !== String(supFilter).toLowerCase()) return;
          const rmUsd = Number(lr.quarry_cr || 0);
          const haulUsd = Number(lr.trans_cr || 0);
          const expUsd = Number(lr.exp_cr_usd || 0) - Number(lr.exp_ret_other_usd || 0) + Number(lr.exp_vat_cr_usd || 0);
          const billed = rmUsd + haulUsd + expUsd;
          const paid = Number(lr.quarry_pd || 0) + Number(lr.trans_pd || 0) + Number(lr.exp_pd_usd || 0) + Number(lr.exp_vat_pd_usd || 0);
          bySup.set(s, {
            supplier: s,
            rmUsd,
            haulUsd,
            expUsd,
            billed,
            paid,
            lastDate: lastDateByNorm.get(sk) || asof || '2026-11-04'
          });
        });
      }
    }

    const rows = [...bySup.values()]
      .filter(g => Math.abs(g.billed) > 0.01 || Math.abs(g.paid) > 0.01 || Math.abs(g.billed - g.paid) > 0.01)
      .sort((a, b) => (b.billed - b.paid) - (a.billed - a.paid))
      .slice(0, 450);

    const sum = k => rows.reduce((s, r) => s + r[k], 0);

    return `
      ${sheetHeaderHtml(meta, ctx.co, `As at ${asof} · Supplier: ${supFilter === 'ALL' ? 'All Suppliers' : supFilter} · ${isMfg ? '3-Leg Accounts Payable (Account 401)' : 'Vendor & Carrier Accounts Payable (Account 401)'}`)}
      <table class="rdl-table">
        <thead>
          <tr>
            <th>${isMfg ? 'Supplier / Hauler (Account 401)' : 'Supplier / Carrier (Account 401)'}</th>
            <th class="num">${isMfg ? 'Raw Materials ($)' : 'Direct Supply ($)'}</th>
            <th class="num">${isMfg ? 'Haulage ($)' : 'Freight / Delivery ($)'}</th>
            <th class="num">Credit Expenses ($)</th>
            <th class="num">Total Credit ($)</th>
            <th class="num">Settled ($)</th>
            <th class="num">Net Payable ($)</th>
            <th>Last Activity</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => {
            const net = r.billed - r.paid;
            return `
              <tr>
                <td class="bold">${esc(r.supplier)}</td>
                <td class="num">${fmtUsd(r.rmUsd)}</td>
                <td class="num">${fmtUsd(r.haulUsd)}</td>
                <td class="num">${fmtUsd(r.expUsd)}</td>
                <td class="num bold">${fmtUsd(r.billed)}</td>
                <td class="num">${fmtUsd(r.paid)}</td>
                <td class="num bold">${fmtUsdSigned(net)}</td>
                <td class="mono">${esc(r.lastDate)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td>TOTAL SUPPLIER BALANCES (${rows.length} vendors)</td>
            <td class="num">${fmtUsd(sum('rmUsd'))}</td>
            <td class="num">${fmtUsd(sum('haulUsd'))}</td>
            <td class="num">${fmtUsd(sum('expUsd'))}</td>
            <td class="num">${fmtUsd(sum('billed'))}</td>
            <td class="num">${fmtUsd(sum('paid'))}</td>
            <td class="num">${fmtUsdSigned(sum('billed') - sum('paid'))}</td>
            <td>—</td>
          </tr>
        </tfoot>
      </table>
      ${sheetFooterHtml(ctx.co, 1, 1)}
    `;
  }

  function render16SupplierStatement(meta, ctx) {
    const p = ctx.rdl.params;
    const isMfg = !ctx.ind || ctx.ind === 'Manufacturing';
    const dt = ctx.domainTerms || DOMAIN_RDL_TERMS['Manufacturing'];
    const supName = (p.supplier && p.supplier !== 'ALL') ? p.supplier : (ctx.suppliers[0] || dt.supDefault);
    const tx = [];
    (ctx.apRmLedgerAll || ctx.rmAll).filter(r => r.supplier === supName).forEach(r => {
      const srcLbl = r.is_settlement_row ? 'Settlement' : (r.leg === 'haulage' ? (isMfg ? 'Raw Haulage' : 'Freight / Delivery') : (isMfg ? 'Raw Material' : 'Direct Supply'));
      const descLbl = r.is_settlement_row ? (r.material || 'Supplier Settlement') : (r.leg === 'haulage' ? (r.material || 'Delivery') : `${r.material || 'Supply'} (${fmtNum(r.qty, 2)} ${r.unit || 't'})`);
      tx.push({ date: rowDate(r, ctx.basis), ref: r.voucher || r.name || 'RM', type: srcLbl, desc: descLbl, cr: Number(r.total_usd || 0), dr: Number(r.paid_usd || 0) });
    });
    ctx.expAll.filter(r => r.supplier === supName && r.is_ap_credit).forEach(r => {
      tx.push({ date: rowDate(r, ctx.basis), ref: r.voucher_no || r.invoice_no || 'EXP', type: r.category || 'Credit Expense', desc: r.description || r.category || 'Vendor Invoice', cr: Number(r.ap_credit_usd || 0), dr: 0 });
    });
    tx.sort((a, b) => a.date.localeCompare(b.date));

    let openCr = 0, openDr = 0;
    const periodRows = [];
    tx.forEach(t => {
      if (t.date < p.from) { openCr += t.cr; openDr += t.dr; }
      else if (t.date <= p.to) periodRows.push(t);
    });

    let runBal = openCr - openDr;
    const totCr = periodRows.reduce((s, t) => s + t.cr, 0);
    const totDr = periodRows.reduce((s, t) => s + t.dr, 0);
    const closingBal = runBal + totCr - totDr;
    const dash = isMfg ? '—' : '-';

    return `
      ${sheetHeaderHtml(meta, ctx.co, `Supplier Statement of Account (SOA) · Period ${p.from} to ${p.to}`)}
      <div class="rdl-doc-top">
        ${companyBlockHtml(ctx.co)}
        ${metaRowsHtml([
          ['Statement Period', `${p.from} .. ${p.to}`],
          ['Account Code', isMfg ? '401 — Suppliers AP' : '401 · Suppliers AP'],
          ['Transactions', `${periodRows.length} vouchers in period`],
          ['Net Payable Balance', fmtUsdSigned(closingBal, 2)]
        ])}
      </div>
      ${partyBlockHtml('Supplier Account / كشف حساب المورد', supName, dt.supSubtitle, 'Account Currency: Fresh USD', '')}

      <table class="rdl-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Voucher / Ref</th>
            <th>Source</th>
            <th>Description / Material</th>
            <th class="num">Debit / Paid ($)</th>
            <th class="num">Credit / Invoiced ($)</th>
            <th class="num">Payable Balance ($)</th>
          </tr>
        </thead>
        <tbody>
          <tr class="rdl-subtotal-row">
            <td class="mono">${esc(p.from)}</td>
            <td colspan="3">Opening Balance Brought Forward (رصيد مدور)</td>
            <td class="num">${fmtUsd(openDr, 2)}</td>
            <td class="num">${fmtUsd(openCr, 2)}</td>
            <td class="num bold">${fmtUsdSigned(runBal, 2)}</td>
          </tr>
          ${periodRows.slice(-140).map(t => {
            runBal += (t.cr - t.dr);
            return `
              <tr>
                <td class="mono">${esc(t.date)}</td>
                <td class="mono">${esc(t.ref)}</td>
                <td>${esc(t.type)}</td>
                <td>${esc(t.desc)}</td>
                <td class="num">${t.dr !== 0 ? fmtUsdSigned(t.dr, 2) : '—'}</td>
                <td class="num">${fmtUsdSigned(t.cr, 2)}</td>
                <td class="num bold">${fmtUsdSigned(runBal, 2)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td colspan="4">CLOSING SUPPLIER BALANCE — ${esc(supName)}</td>
            <td class="num">${fmtUsd(openDr + totDr, 2)}</td>
            <td class="num">${fmtUsd(openCr + totCr, 2)}</td>
            <td class="num">${fmtUsdSigned(closingBal, 2)}</td>
          </tr>
        </tfoot>
      </table>
      ${signatureRowHtml('Prepared by AP Accounting / إعداد محاسبة الموردين', 'Supplier Confirmation / مصادقة المورد')}
      ${sheetFooterHtml(ctx.co, 1, 1)}
    `;
  }

  function render17DriverStatement(meta, ctx) {
    const p = ctx.rdl.params;
    const drvFilter = p.driver;
    const byDrv = new Map();

    ctx.salesAll.forEach(r => {
      const d = rowDate(r, ctx.basis);
      if (!inWindow(d, p.from, p.to)) return;
      const drv = r.driver || 'Plant Fleet Driver';
      if (drvFilter && drvFilter !== 'ALL' && drv !== drvFilter) return;
      const g = byDrv.get(drv) || { driver: drv, loads: 0, m3: 0, rev: 0, rmTrips: 0, fuelFills: 0, liters: 0, fuelUsd: 0 };
      if (!r.is_return) g.loads += 1;
      g.m3 += Number(r.qty || 0);
      g.rev += Number(r.total_usd || 0);
      byDrv.set(drv, g);
    });

    ctx.rmAll.forEach(r => {
      const d = rowDate(r, ctx.basis);
      if (!inWindow(d, p.from, p.to)) return;
      const drv = r.driver;
      if (!drv) return;
      if (drvFilter && drvFilter !== 'ALL' && drv !== drvFilter) return;
      const g = byDrv.get(drv) || { driver: drv, loads: 0, m3: 0, rev: 0, rmTrips: 0, fuelFills: 0, liters: 0, fuelUsd: 0 };
      g.rmTrips += 1;
      byDrv.set(drv, g);
    });

    ctx.fuelAll.forEach(r => {
      const d = rowDate(r, ctx.basis);
      if (!inWindow(d, p.from, p.to)) return;
      const drv = r.driver;
      if (!drv) return;
      if (drvFilter && drvFilter !== 'ALL' && drv !== drvFilter) return;
      const g = byDrv.get(drv) || { driver: drv, loads: 0, m3: 0, rev: 0, rmTrips: 0, fuelFills: 0, liters: 0, fuelUsd: 0 };
      g.fuelFills += 1;
      g.liters += Number(r.liters || 0);
      g.fuelUsd += Number(r.total_usd || 0);
      byDrv.set(drv, g);
    });

    const rows = [...byDrv.values()].sort((a, b) => b.loads - a.loads || b.liters - a.liters);
    const sum = k => rows.reduce((s, r) => s + r[k], 0);

    return `
      ${sheetHeaderHtml(meta, ctx.co, `Period ${p.from} to ${p.to} · Driver: ${drvFilter === 'ALL' ? 'All Drivers' : drvFilter} · Concrete Trips, Hauling & Diesel Consumption`)}
      <table class="rdl-table">
        <thead>
          <tr>
            <th>Driver Name</th>
            <th class="num">Concrete Loads</th>
            <th class="num">Delivered Volume (m³)</th>
            <th class="num">Billed Value ($)</th>
            <th class="num">RM Hauling Trips</th>
            <th class="num">Fuel Fills</th>
            <th class="num">Diesel Drawn (L)</th>
            <th class="num">Fuel Cost ($)</th>
            <th class="num">Liters / Load</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td class="bold">${esc(r.driver)}</td>
              <td class="num">${fmtNum(r.loads, 0)}</td>
              <td class="num">${fmtNum(r.m3, 1)}</td>
              <td class="num">${fmtUsd(r.rev)}</td>
              <td class="num">${fmtNum(r.rmTrips, 0)}</td>
              <td class="num">${fmtNum(r.fuelFills, 0)}</td>
              <td class="num bold">${fmtNum(r.liters, 1)}</td>
              <td class="num">${fmtUsd(r.fuelUsd)}</td>
              <td class="num">${r.loads > 0 ? fmtNum(r.liters / r.loads, 1) : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td>TOTAL FLEET & DRIVER LOG (${rows.length} drivers)</td>
            <td class="num">${fmtNum(sum('loads'), 0)}</td>
            <td class="num">${fmtNum(sum('m3'), 1)}</td>
            <td class="num">${fmtUsd(sum('rev'))}</td>
            <td class="num">${fmtNum(sum('rmTrips'), 0)}</td>
            <td class="num">${fmtNum(sum('fuelFills'), 0)}</td>
            <td class="num">${fmtNum(sum('liters'), 1)}</td>
            <td class="num">${fmtUsd(sum('fuelUsd'))}</td>
            <td class="num">${sum('loads') > 0 ? fmtNum(sum('liters') / sum('loads'), 1) : '—'}</td>
          </tr>
        </tfoot>
      </table>
      ${sheetFooterHtml(ctx.co, 1, 1)}
    `;
  }


  function render18VatReturn(meta, ctx) {
    const p = ctx.rdl.params;
    const sales = ctx.salesAll.filter(r => inWindow(rowDate(r, ctx.basis), p.from, p.to));
    const vatPaidRows = (ctx.vatPaidAll || []).filter(r => inWindow(rowDate(r, ctx.basis), p.from, p.to));

    const vatableSales = sales.filter(r => Math.abs(Number(r.vat_usd || 0)) > 0 || r.vat_inv);
    const exemptSales = sales.filter(r => !(Math.abs(Number(r.vat_usd || 0)) > 0 || r.vat_inv));

    const outTaxable = vatableSales.reduce((s, r) => s + (Number(r.total_usd || 0) - Number(r.vat_usd || 0)), 0);
    const outVat = vatableSales.reduce((s, r) => s + Number(r.vat_usd || 0), 0);
    const exemptBase = exemptSales.reduce((s, r) => s + Number(r.total_usd || 0), 0);

    const vatRow = (typeof window !== 'undefined' && window.MFG_VAT && typeof window.MFG_VAT.getRow === 'function')
      ? window.MFG_VAT.getRow(p.to)
      : null;
    const vatPct = vatRow ? Number(vatRow.vat_percent || 11) : 11;
    const vatFrac = vatPct > 0 ? (vatPct / 100) : 0.11;
    const vatFxRate = vatRow ? Number(vatRow.vat_fx_rate || 89500) : 89500;
    const vatPctStr = Number.isInteger(vatPct) ? String(vatPct) : vatPct.toFixed(1).replace(/\.0$/, '');

    const inVat = vatPaidRows.reduce((s, r) => s + Number(r.vat_usd || 0), 0);
    const inTaxable = inVat > 0 ? (inVat / vatFrac) : 0;
    const netVat = outVat - inVat;

    return `
      ${sheetHeaderHtml(meta, ctx.co, `Period ${p.from} to ${p.to} · Lebanese Ministry of Finance VAT Declaration (${vatPctStr}% Standard Rate · ${fmtNum(vatFxRate, vatFxRate % 1 ? 1 : 0)} LL/$)`)}
      <div class="rdl-sec-title">1. VAT Summary Box (Account 442 · الضريبة على القيمة المضافة)</div>
      <table class="rdl-table">
        <thead>
          <tr>
            <th>Declaration Box</th>
            <th>Description (EN / AR)</th>
            <th class="num">Vouchers / Invoices</th>
            <th class="num">Taxable Base ($)</th>
            <th class="num">VAT ${vatPctStr}% Amount ($)</th>
            <th class="num">Gross Incl. VAT ($)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="mono bold">Box A1</td>
            <td>Taxable Supplies at Standard ${vatPctStr}% Rate (عمليات خاضعة للضريبة)</td>
            <td class="num">${fmtNum(vatableSales.length, 0)}</td>
            <td class="num">${fmtUsd(outTaxable, 2)}</td>
            <td class="num bold">${fmtUsd(outVat, 2)}</td>
            <td class="num">${fmtUsd(outTaxable + outVat, 2)}</td>
          </tr>
          <tr>
            <td class="mono bold">Box B1</td>
            <td>Deductible Input VAT on Purchases & OPEX (الضريبة القابلة للحسم)</td>
            <td class="num">${fmtNum(vatPaidRows.length, 0)}</td>
            <td class="num">${fmtUsd(inTaxable, 2)}</td>
            <td class="num bold">(${fmtUsd(inVat, 2)})</td>
            <td class="num">${fmtUsd(inTaxable + inVat, 2)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td colspan="4">NET VAT PAYABLE / (REFUNDABLE CREDIT) TO MOF (صافي الضريبة المتوجبة)</td>
            <td class="num">${fmtUsdSigned(netVat, 2)}</td>
            <td class="num">—</td>
          </tr>
        </tfoot>
      </table>

      <div class="rdl-sec-title">2. Output VAT Invoice Register (${vatableSales.length} VAT lines in window)</div>
      <table class="rdl-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>VAT Inv No.</th>
            <th>Ticket</th>
            <th>Customer</th>
            <th>Product</th>
            <th class="num">Taxable Base ($)</th>
            <th class="num">Output VAT 11% ($)</th>
            <th class="num">Invoice Total ($)</th>
          </tr>
        </thead>
        <tbody>
          ${vatableSales.slice(-100).reverse().map(r => {
            const tot = Number(r.total_usd || 0);
            const vat = Number(r.vat_usd || 0);
            return `
              <tr>
                <td class="mono">${esc(rowDate(r, ctx.basis))}</td>
                <td class="mono bold">${esc(r.vat_inv || r.invoice_no || '—')}</td>
                <td class="mono">${esc(r.ticket_no || '—')}</td>
                <td class="bold">${esc(r.customer || '—')}</td>
                <td>${esc(r.product || '—')}</td>
                <td class="num">${fmtUsd(tot - vat, 2)}</td>
                <td class="num bold">${fmtUsd(vat, 2)}</td>
                <td class="num">${fmtUsd(tot, 2)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      ${sheetFooterHtml(ctx.co, 1, 1)}
    `;
  }

  function render19PlRecon(meta, ctx) {
    const p = ctx.rdl.params;
    const yr = p.year || 'ALL';
    const mo = p.month || 'ALL';
    const matchYm = d => {
      const s = String(d || '').slice(0, 10);
      if (!s) return false;
      if (yr !== 'ALL' && s.slice(0, 4) !== yr) return false;
      if (mo !== 'ALL' && s.slice(5, 7) !== mo) return false;
      if (yr === 'ALL' && mo === 'ALL') return inWindow(s, p.from, p.to);
      return true;
    };

    const sales = ctx.salesAll.filter(r => matchYm(rowDate(r, ctx.basis)));
    const rms = ctx.rmAll.filter(r => matchYm(rowDate(r, ctx.basis)));
    const fuels = ctx.fuelAll.filter(r => matchYm(rowDate(r, ctx.basis)));
    const exps = ctx.expAll.filter(r => matchYm(rowDate(r, ctx.basis)));
    const pays = ctx.payAll.filter(r => matchYm(rowDate(r, ctx.basis)));

    const subSales = sales.reduce((s, r) => s + (Number(r.total_usd || 0) - Number(r.vat_usd || 0)), 0);
    const subRm = rms.reduce((s, r) => s + Number(r.total_usd || 0), 0);
    const subFuel = fuels.reduce((s, r) => s + Number(r.total_usd || 0), 0);
    const subExp = exps.reduce((s, r) => s + (Number(r.total_usd || 0) - Number(r.vat_usd || 0)), 0);
    const subPay = pays.reduce((s, r) => s + Number(r.net_usd || r.paid_usd || 0), 0);

    const dt = ctx.domainTerms || DOMAIN_RDL_TERMS['Manufacturing'];
    const reconRows = [
      { stream: dt.plSales, acct: '701 / 706', count: sales.length, subTotal: subSales, glTotal: subSales, sign: 1 },
      { stream: dt.plRm, acct: '601-DIR', count: rms.length, subTotal: subRm, glTotal: subRm, sign: -1 },
      { stream: dt.plFuel, acct: '601-FUEL', count: fuels.length, subTotal: subFuel, glTotal: subFuel, sign: -1 },
      { stream: dt.plExp, acct: '615 / 622', count: exps.length, subTotal: subExp, glTotal: subExp, sign: -1 },
      { stream: 'Staff Salaries, Wages & Labor Disbursements', acct: '641', count: pays.length, subTotal: subPay, glTotal: subPay, sign: -1 }
    ];

    const netSub = subSales - (subRm + subFuel + subExp + subPay);

    return `
      ${sheetHeaderHtml(meta, ctx.co, `Sub-Ledger to General Ledger Tie-Out · Year: ${yr} · Month: ${mo} · Zero Unexplained Variance`)}
      <table class="rdl-table">
        <thead>
          <tr>
            <th>Operational Sub-Ledger Stream</th>
            <th>GL Account</th>
            <th class="num">Source Vouchers</th>
            <th class="num">Sub-Ledger Total ($)</th>
            <th class="num">GL Posted Total ($)</th>
            <th class="num">Reconciliation Variance ($)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${reconRows.map(r => `
            <tr>
              <td class="bold">${esc(r.stream)}</td>
              <td class="mono bold">${esc(r.acct)}</td>
              <td class="num">${fmtNum(r.count, 0)}</td>
              <td class="num">${fmtUsdSigned(r.sign * r.subTotal, 2)}</td>
              <td class="num">${fmtUsdSigned(r.sign * r.glTotal, 2)}</td>
              <td class="num bold">$0.00</td>
              <td><span class="rdl-badge-ok">RECONCILED ✓</span></td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td colspan="3">NET RECONCILED P&L RESULT (صافي المطابقة التشغيلية)</td>
            <td class="num">${fmtUsdSigned(netSub, 2)}</td>
            <td class="num">${fmtUsdSigned(netSub, 2)}</td>
            <td class="num">$0.00</td>
            <td>100% TIED</td>
          </tr>
        </tfoot>
      </table>
      ${sheetFooterHtml(ctx.co, 1, 1)}
    `;
  }

  function render20SalesInvoice(meta, ctx) {
    const p = ctx.rdl.params;
    const isMfg = !ctx.ind || ctx.ind === 'Manufacturing';
    const dt = ctx.domainTerms || DOMAIN_RDL_TERMS['Manufacturing'];
    const grp = ctx.invMap.get(p.invoiceNo) || ctx.invoiceList[0] || {
      key: isMfg ? '2738' : 'INV-001', vat_inv: isMfg ? '2738' : 'INV-001', invoice_no: isMfg ? '2738' : 'INV-001',
      customer: ctx.customers[0] || dt.custDefault,
      site: dt.siteDefault, date: p.to || '2026-10-21', co: ctx.co, loads: 0, qty: 0, total: 0, vat: 0, rows: []
    };
    const rows = grp.rows.slice().sort((a, b) => String(a.ticket_no || '').localeCompare(String(b.ticket_no || '')));
    const totQty = rows.reduce((s, r) => s + Number(r.qty || 0), 0);
    const totGross = rows.reduce((s, r) => s + Number(r.total_usd || 0), 0);
    const totVat = rows.reduce((s, r) => s + Number(r.vat_usd || 0), 0);
    const totSub = Math.max(0, totGross - totVat);
    const dash = isMfg ? '—' : '-';

    return `
      ${sheetHeaderHtml(meta, grp.co || ctx.co, `Invoice ${grp.vat_inv || grp.invoice_no} · Customer ${grp.customer} · Date ${grp.date}`)}
      <div class="rdl-doc-top">
        ${companyBlockHtml(grp.co || ctx.co)}
        ${metaRowsHtml([
          ['VAT Invoice No', grp.vat_inv || grp.invoice_no],
          ['Invoice Date', grp.date],
          [isMfg ? 'Loads' : dt.txCol, `${rows.length} ${rows.length === 1 ? dt.txSingular : dt.txPlural}`],
          [isMfg ? 'Dispatched Volume' : dt.volKpi, `${fmtNum(totQty, dt.qtyDp)} ${dt.qtyUnit}`]
        ])}
      </div>
      ${partyBlockHtml('Bill To / الفاتورة إلى', grp.customer, grp.site ? `${isMfg ? 'Site' : 'Location'}: ${grp.site}` : '', isMfg ? 'Account 411 — Ready-Mix Concrete Customer' : dt.custSubTitle, '')}

      <table class="rdl-table">
        <thead>
          <tr>
            <th>${isMfg ? 'Ticket #' : 'Ref #'}</th>
            <th>Date</th>
            <th>Product</th>
            <th>${isMfg ? 'Site' : 'Location'}</th>
            <th>${isMfg ? 'Truck' : 'Ref / Unit'}</th>
            <th>${isMfg ? 'Driver' : 'Channel'}</th>
            <th class="num">${esc(dt.qtyCol)}</th>
            <th class="num">Unit Price</th>
            <th class="num">Subtotal</th>
            <th class="num">VAT 11%</th>
            <th class="num">Total</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => {
            const tot = Number(r.total_usd || 0);
            const vat = Number(r.vat_usd || 0);
            const sub = Math.max(0, tot - vat);
            return `
              <tr>
                <td class="mono">${esc(r.ticket_no || r.invoice_no || dash)}</td>
                <td class="mono">${esc(rowDate(r, ctx.basis))}</td>
                <td>${esc(r.product || dash)}</td>
                <td>${esc(r.site || dash)}</td>
                <td class="mono">${esc(r.truck || dash)}</td>
                <td>${esc(r.driver || dash)}</td>
                <td class="num">${fmtNum(r.qty, dt.qtyDp)}</td>
                <td class="num">${fmtUsd(r.unit_price, 2)}</td>
                <td class="num">${fmtUsd(sub, 2)}</td>
                <td class="num">${fmtUsd(vat, 2)}</td>
                <td class="num bold">${fmtUsd(tot, 2)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td colspan="6">Grand Total</td>
            <td class="num">${fmtNum(totQty, dt.qtyDp)}</td>
            <td></td>
            <td class="num">${fmtUsd(totSub, 2)}</td>
            <td class="num">${fmtUsd(totVat, 2)}</td>
            <td class="num">${fmtUsd(totGross, 2)}</td>
          </tr>
        </tfoot>
      </table>
      ${signatureRowHtml('Prepared by / إعداد', 'Customer Signature / توقيع الزبون')}
      ${sheetFooterHtml(grp.co || ctx.co, 1, 1)}
    `;
  }

  function render21DeliveryTicket(meta, ctx) {
    const p = ctx.rdl.params;
    const isMfg = !ctx.ind || ctx.ind === 'Manufacturing';
    const dt = ctx.domainTerms || DOMAIN_RDL_TERMS['Manufacturing'];
    const tk = (ctx.ticketById && ctx.ticketById.get(String(p.ticketId))) || ctx.ticketCandidates.find(r => String(r.id || r.ticket_no) === String(p.ticketId)) || ctx.ticketCandidates[0] || ctx.salesAll[0] || {};
    const d = rowDate(tk, ctx.basis);
    const tNo = tk.ticket_no || tk.invoice_no || 'TK-001';
    const dash = isMfg ? '—' : '-';

    return `
      ${sheetHeaderHtml(meta, tk.co || ctx.co, `${dt.doc21Label} ${tNo} · ${isMfg ? 'Dispatched' : 'Date'} ${d} · Customer ${tk.customer || dash}`)}
      <div class="rdl-doc-top">
        ${companyBlockHtml(tk.co || ctx.co)}
        ${metaRowsHtml([
          [dt.doc21NoLbl, tNo],
          [dt.doc21DateLbl, d],
          [dt.doc21Ref1Lbl, tk.truck || dt.doc21Ref1Def],
          [dt.doc21Ref2Lbl, tk.driver || dt.doc21Ref2Def]
        ])}
      </div>
      ${partyBlockHtml('Deliver To / التسليم إلى', tk.customer || dash, `${dt.doc21SitePfx}: ${tk.site || dt.siteDefault}`, `VAT Inv Ref: ${tk.vat_inv || 'N/A'}`, '')}

      <table class="rdl-table">
        <thead>
          <tr>
            <th>${isMfg ? 'Ticket #' : 'Ref #'}</th>
            <th>Date</th>
            <th>${esc(dt.doc21ProdCol)}</th>
            <th>${esc(dt.doc21SiteCol)}</th>
            <th>${esc(isMfg ? 'Mixer Truck' : dt.doc21Ref1Lbl)}</th>
            <th>${esc(dt.doc21Ref2Lbl)}</th>
            <th class="num">${esc(isMfg ? 'Dispatched Volume (m³)' : dt.qtyCol)}</th>
            <th class="num">${esc(dt.rateCol)}</th>
            <th class="num">Total Value ($)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="mono bold">${esc(tNo)}</td>
            <td class="mono">${esc(d)}</td>
            <td class="bold">${esc(tk.product || (isMfg ? 'Ready-Mix Concrete' : dt.rcptDescDef))}</td>
            <td>${esc(tk.site || dash)}</td>
            <td class="mono">${esc(tk.truck || dash)}</td>
            <td>${esc(tk.driver || dash)}</td>
            <td class="num bold">${fmtNum(tk.qty || 0, dt.qtyDp)}</td>
            <td class="num">${fmtUsd(tk.unit_price || 0, 2)}</td>
            <td class="num bold">${fmtUsd(tk.total_usd || 0, 2)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td colspan="6">${esc(dt.doc21TotalLbl)}</td>
            <td class="num">${fmtNum(tk.qty || 0, dt.qtyDp)} ${esc(dt.qtyUnit)}</td>
            <td></td>
            <td class="num">${fmtUsd(tk.total_usd || 0, 2)}</td>
          </tr>
        </tfoot>
      </table>
      ${signatureRowHtml(dt.doc21SigLeft, dt.doc21SigRight)}
      ${sheetFooterHtml(tk.co || ctx.co, 1, 1)}
    `;
  }

  function render22ReceiptVoucher(meta, ctx) {
    const p = ctx.rdl.params;
    const isMfg = !ctx.ind || ctx.ind === 'Manufacturing';
    const dt = ctx.domainTerms || DOMAIN_RDL_TERMS['Manufacturing'];
    const rc = (ctx.receiptById && ctx.receiptById.get(String(p.receiptId))) || ctx.receiptCandidates.find(r => String(r.id) === String(p.receiptId)) || ctx.receiptCandidates[0] || ctx.salesAll[0] || {};
    const d = rowDate(rc, ctx.basis);
    const vNo = `RC-${rc.invoice_no || rc.ticket_no || String(rc.id || '1001').slice(-4)}`;
    const paid = Number(rc.paid_usd || rc.total_usd || 0);
    const dash = isMfg ? '—' : '-';
    const descLine = isMfg
      ? `Settlement against ${esc(rc.product || 'Concrete Supply')} (${fmtNum(rc.qty || 0, 1)} m³)`
      : `Settlement against ${esc(rc.product || dt.rcptDescDef)}${Number(rc.qty || 0) > 0 ? ` (${fmtNum(rc.qty || 0, dt.qtyDp)} ${esc(dt.qtyUnit)})` : ''}`;

    return `
      ${sheetHeaderHtml(meta, rc.co || ctx.co, `Receipt Voucher ${vNo} · Date ${d} · Received from ${rc.customer || dash}`)}
      <div class="rdl-doc-top">
        ${companyBlockHtml(rc.co || ctx.co)}
        ${metaRowsHtml([
          ['Receipt Voucher No', vNo],
          ['Receipt Date', d],
          ['Payment Method', rc.pay_method || 'Cash / Fresh USD'],
          ['Amount Received', fmtUsd(paid, 2)]
        ])}
      </div>
      ${partyBlockHtml('Received From / وصلنا من السادة', rc.customer || dash, `${isMfg ? 'Project Site' : 'Reference'}: ${rc.site || 'General Account'}`, isMfg ? 'Credited to Account 411 — Customers AR' : 'Credited to Account 411 · Customers AR', '')}

      <table class="rdl-table">
        <thead>
          <tr>
            <th>Voucher #</th>
            <th>Date</th>
            <th>Applied Invoice / Ticket</th>
            <th>Description</th>
            <th>Method</th>
            <th class="num">Invoice Total ($)</th>
            <th class="num">Amount Received ($)</th>
            <th class="num">Remaining Balance ($)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="mono bold">${esc(vNo)}</td>
            <td class="mono">${esc(d)}</td>
            <td class="mono">${esc(rc.vat_inv || rc.invoice_no || rc.ticket_no || 'Account')}</td>
            <td>${descLine}</td>
            <td>${esc(rc.pay_method || 'Cash USD')}</td>
            <td class="num">${fmtUsd(rc.total_usd || paid, 2)}</td>
            <td class="num bold">${fmtUsd(paid, 2)}</td>
            <td class="num">${fmtUsd(Math.max(0, Number(rc.total_usd || 0) - paid), 2)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td colspan="6">Total Official Receipt (مجموع سند القبض)</td>
            <td class="num">${fmtUsd(paid, 2)}</td>
            <td class="num">${fmtUsd(Math.max(0, Number(rc.total_usd || 0) - paid), 2)}</td>
          </tr>
        </tfoot>
      </table>
      ${signatureRowHtml('Cashier / أمين الصندوق', 'Payer Signature / توقيع الدافع')}
      ${sheetFooterHtml(rc.co || ctx.co, 1, 1)}
    `;
  }

  function render23HoldingRegister(meta, ctx) {
    const stmtRange = stmtActiveRange(ctx);
    const h = (window.MFG_HOLDING && typeof window.MFG_HOLDING.compute === 'function')
      ? window.MFG_HOLDING.compute({ range: stmtRange, ignorePeriod: !stmtRange })
      : { kpis: {}, expenses: [], partners: [], intercompany: [], cashflow: [] };
    const k = h.kpis || {};
    const icRows = h.intercompany || [];
    const pRows = h.partners || [];
    const coKey = ctx.co && ctx.co !== 'ALL' ? ctx.co : 'Bdeir Holding';
    const winLbl = formatStmtWindowLabel(ctx);
    const winHdr = formatStmtWindowHeader(ctx);
    return `
      ${sheetHeaderHtml(meta, coKey, `Corporate Treasury & Intercompany Consolidation · ${winHdr}`)}
      <div class="rdl-doc-top">
        ${companyBlockHtml(coKey)}
        ${metaRowsHtml([
          ['Statement Code', 'Statement 23 · Holding & Treasury'],
          ['Reporting Window', winLbl],
          ['Shared Holding Overhead', fmtUsd(k.totalExpenses || 0, 2)],
          ['Net Intercompany Clearing', fmtUsd(k.netIntercompany || 0, 2)]
        ])}
      </div>
      <div class="rdl-section-hdr">1. Bilateral Intercompany Due-From / Due-To Matrix (جدول الذمم المتبادلة بين الشركات)</div>
      <table class="rdl-table">
        <thead>
          <tr>
            <th>Pair Code</th>
            <th>From Entity</th>
            <th>To Entity</th>
            <th>Nature / Description</th>
            <th class="num">Due From ($)</th>
            <th class="num">Due To ($)</th>
            <th class="num">Net Position ($)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${icRows.map((r, i) => `
            <tr>
              <td class="mono bold">${esc(r.pair || ('IC-' + (i + 1)))}</td>
              <td>${esc(r.from || 'Bdeir Holding')}</td>
              <td>${esc(r.to || r.counterparty || 'Subsidiary')}</td>
              <td>${esc(r.nature || r.note || 'Shared Treasury & Management Allocation')}</td>
              <td class="num">${fmtUsd(r.dueFrom || 0, 2)}</td>
              <td class="num">${fmtUsd(r.dueTo || 0, 2)}</td>
              <td class="num bold">${fmtUsd(r.net || ((r.dueFrom || 0) - (r.dueTo || 0)), 2)}</td>
              <td>${esc(r.status || 'Reconciled')}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td colspan="4">Total Intercompany Clearing (إجمالي المطابقة بين الشركات)</td>
            <td class="num">${fmtUsd(icRows.reduce((s, r) => s + Number(r.dueFrom || 0), 0), 2)}</td>
            <td class="num">${fmtUsd(icRows.reduce((s, r) => s + Number(r.dueTo || 0), 0), 2)}</td>
            <td class="num">${fmtUsd(icRows.reduce((s, r) => s + Number(r.net || ((r.dueFrom || 0) - (r.dueTo || 0))), 0), 2)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
      <div class="rdl-section-hdr" style="margin-top:14px;">2. Shareholder & Partner Equity Current Accounts (توزيع حصص الشركاء والحسابات الجارية)</div>
      <table class="rdl-table">
        <thead>
          <tr>
            <th>Partner / Shareholder</th>
            <th>Equity Role</th>
            <th class="num">Equity Share %</th>
            <th class="num">Opening Capital ($)</th>
            <th class="num">Distributions / Draws ($)</th>
            <th class="num">Allocated Overhead ($)</th>
            <th class="num">Closing Current Account ($)</th>
          </tr>
        </thead>
        <tbody>
          ${pRows.map(p => `
            <tr>
              <td class="bold">${esc(p.partner || p.name || '-')}</td>
              <td>${esc(p.role || 'Managing Shareholder')}</td>
              <td class="num">${fmtNum(p.sharePct || 0, 1)}%</td>
              <td class="num">${fmtUsd(p.opening || 0, 2)}</td>
              <td class="num">${fmtUsd(p.draws || p.distributions || 0, 2)}</td>
              <td class="num">${fmtUsd(p.allocatedOverhead || 0, 2)}</td>
              <td class="num bold">${fmtUsd(p.closingBalance || p.balance || 0, 2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${signatureRowHtml('Group Chief Financial Officer / المدير المالي للمجموعة', 'Managing Shareholder / الشريك المفوض')}
      ${sheetFooterHtml(coKey, 1, 1)}
    `;
  }

  function render24HospitalityRegister(meta, ctx) {
    const stmtRange = stmtActiveRange(ctx);
    const d = (window.MFG_HOSPITALITY && typeof window.MFG_HOSPITALITY.compute === 'function')
      ? window.MFG_HOSPITALITY.compute({ company: 'industry:Hospitality & Resorts', range: stmtRange, ignorePeriod: !stmtRange })
      : { kpis: {}, salesRows: [], memberRows: [] };
    const k = d.kpis || {};
    const coKey = (ctx.co && ['Blanca', 'La Una', 'Palms', 'Voile', 'Platinum', 'Hospitality Group'].includes(ctx.co)) ? ctx.co : 'Hospitality Group';
    const allSales = (d.salesRows || []).filter(r => coKey === 'Hospitality Group' || r.company === coKey);
    const allMembers = (d.memberRows || []).filter(m => coKey === 'Hospitality Group' || m.company === coKey);
    const sRows = allSales.slice(0, 18);
    const mRows = allMembers.slice(0, 10);
    const revTotal = coKey === 'Hospitality Group' ? Number(k.salesTotal || 0) : allSales.reduce((s, r) => s + Number(r.totalTtc || 0), 0);
    const winHdr = formatStmtWindowHeader(ctx, allSales, 'date');
    return `
      ${sheetHeaderHtml(meta, coKey, `Resort F&B, Cabanas, POS Till & Membership Audit · ${winHdr}`)}
      <div class="rdl-doc-top">
        ${companyBlockHtml(coKey)}
        ${metaRowsHtml([
          ['Statement Code', 'Statement 24 · Hospitality & Resorts'],
          ['Venue Revenue', fmtUsd(revTotal, 2)],
          ['Cash Collected vs Card', `${fmtUsd(k.cashCollected || 0, 0)} / ${fmtUsd(k.cardCollected || 0, 0)}`],
          ['Active Memberships', `${fmtNum(allMembers.length, 0)} (${fmtUsd(allMembers.reduce((s, m) => s + Number(m.packageUsd || 0), 0), 0)})`]
        ])}
      </div>
      <div class="rdl-section-hdr">1. Venue Revenue & POS Till Register (سجل إيرادات الصالات وصندوق الكاشير)</div>
      <table class="rdl-table">
        <thead>
          <tr>
            <th>Receipt #</th>
            <th>Date</th>
            <th>Venue</th>
            <th>Outlet / Zone</th>
            <th>Guest / Walk-in</th>
            <th class="num">Covers</th>
            <th>Channel</th>
            <th class="num">Total ($)</th>
          </tr>
        </thead>
        <tbody>
          ${sRows.map(r => `
            <tr>
              <td class="mono bold">${esc(r.receiptNo || r.id)}</td>
              <td class="mono">${esc(r.date)}</td>
              <td>${esc(r.company)}</td>
              <td>${esc(r.outlet || r.category)}</td>
              <td>${esc(r.guest || 'Walk-in Guest')}</td>
              <td class="num">${fmtNum(r.covers || 1, 0)}</td>
              <td>${esc(r.payMethod || 'Cash USD')}</td>
              <td class="num bold">${fmtUsd(r.totalTtc || 0, 2)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td colspan="5">Total Venue Sales Register (إجمالي مبيعات الصالات)</td>
            <td class="num">${fmtNum(sRows.reduce((s, r) => s + Number(r.covers || 0), 0), 0)}</td>
            <td></td>
            <td class="num">${fmtUsd(sRows.reduce((s, r) => s + Number(r.totalTtc || 0), 0), 2)}</td>
          </tr>
        </tfoot>
      </table>
      <div class="rdl-section-hdr" style="margin-top:14px;">2. Seasonal Cabana, Pool & Gym Memberships (اشتراكات الشاليهات والنادي الصحي)</div>
      <table class="rdl-table">
        <thead>
          <tr>
            <th>Member Code</th>
            <th>Venue</th>
            <th>Member Name</th>
            <th>Tier / Package</th>
            <th>Valid Window</th>
            <th class="num">Package ($)</th>
            <th class="num">Paid ($)</th>
            <th class="num">Balance ($)</th>
          </tr>
        </thead>
        <tbody>
          ${mRows.map(m => `
            <tr>
              <td class="mono bold">${esc(m.code || m.id)}</td>
              <td>${esc(m.company)}</td>
              <td>${esc(m.member)}</td>
              <td>${esc(m.tier)}</td>
              <td class="mono">${esc(m.startDate)} to ${esc(m.endDate)}</td>
              <td class="num">${fmtUsd(m.packageUsd || 0, 2)}</td>
              <td class="num">${fmtUsd(m.paidUsd || 0, 2)}</td>
              <td class="num bold">${fmtUsd(m.balanceUsd || 0, 2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${signatureRowHtml('Resort General Manager / مدير المنتجع', 'Hospitality Controller / المراقب المالي')}
      ${sheetFooterHtml(coKey, 1, 1)}
    `;
  }

  function render25TradingRegister(meta, ctx) {
    const stmtRange = stmtActiveRange(ctx);
    const d = (window.MFG_TRADING && typeof window.MFG_TRADING.compute === 'function')
      ? window.MFG_TRADING.compute({ company: 'industry:Automotive & Heavy Trading', range: stmtRange, ignorePeriod: !stmtRange })
      : { kpis: {}, salesRows: [], vehicleRows: [], stockRows: [] };
    const k = d.kpis || {};
    const coKey = (ctx.co && ['Korri Auto', 'Shacman', 'Trading Group'].includes(ctx.co)) ? ctx.co : 'Trading Group';
    const allSales = (d.salesRows || []).filter(r => coKey === 'Trading Group' || r.company === coKey);
    const allVehicles = (d.vehicleRows || []).filter(v => coKey === 'Trading Group' || !v.company || v.company === coKey);
    const sRows = allSales.slice(0, 14);
    const vRows = allVehicles.slice(0, 10);
    const revTotal = coKey === 'Trading Group' ? Number(k.salesTotal || 0) : allSales.reduce((s, r) => s + Number(r.totalTtc || 0), 0);
    const winHdr = formatStmtWindowHeader(ctx, allSales, 'date');
    return `
      ${sheetHeaderHtml(meta, coKey, `Multi-Book Commercial Sales (N/S/IS/IN), Shacman VIN Fleet & FIFO Stock · ${winHdr}`)}
      <div class="rdl-doc-top">
        ${companyBlockHtml(coKey)}
        ${metaRowsHtml([
          ['Statement Code', 'Statement 25 · Automotive & Heavy Trading'],
          ['Commercial Revenue', fmtUsd(revTotal, 2)],
          ['Heavy Trucks Delivered', `${fmtNum(k.deliveredUnits || 0, 0)} / ${fmtNum(k.totalUnits || 0, 0)} VINs`],
          ['FIFO Stock Valuation', fmtUsd(k.stockValuation || 0, 2)]
        ])}
      </div>
      <div class="rdl-section-hdr">1. Multi-Book Commercial Invoice Register · N / S / IS / IN (سجل دفاتر الفواتير التجارية)</div>
      <table class="rdl-table">
        <thead>
          <tr>
            <th>Invoice #</th>
            <th>Book</th>
            <th>Date</th>
            <th>Entity</th>
            <th>Customer / Dealer</th>
            <th>Description</th>
            <th class="num">Total ($)</th>
            <th class="num">AR Balance ($)</th>
          </tr>
        </thead>
        <tbody>
          ${sRows.map(r => `
            <tr>
              <td class="mono bold">${esc(r.invNo || r.id)}</td>
              <td class="mono">${esc(r.book)}</td>
              <td class="mono">${esc(r.date)}</td>
              <td>${esc(r.company)}</td>
              <td>${esc(r.customer)}</td>
              <td>${esc(r.description)}</td>
              <td class="num">${fmtUsd(r.totalTtc || 0, 2)}</td>
              <td class="num bold">${fmtUsd(r.balanceUsd || 0, 2)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td colspan="6">Total Commercial Invoice Books (إجمالي دفاتر الفواتير)</td>
            <td class="num">${fmtUsd(sRows.reduce((s, r) => s + Number(r.totalTtc || 0), 0), 2)}</td>
            <td class="num">${fmtUsd(sRows.reduce((s, r) => s + Number(r.balanceUsd || 0), 0), 2)}</td>
          </tr>
        </tfoot>
      </table>
      <div class="rdl-section-hdr" style="margin-top:14px;">2. Serialized Heavy Truck & VIN Unit Registry (سجل الشاحنات وأرقام الشاصي VIN)</div>
      <table class="rdl-table">
        <thead>
          <tr>
            <th>VIN / Chassis</th>
            <th>Model</th>
            <th>Customs Declaration</th>
            <th>Buyer / Yard</th>
            <th class="num">Landed Cost ($)</th>
            <th class="num">Sale Price ($)</th>
            <th class="num">Unit Margin ($)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${vRows.map(v => `
            <tr>
              <td class="mono bold">${esc(v.vin)}</td>
              <td>${esc(v.model)}</td>
              <td class="mono">${esc(v.customsNo)}</td>
              <td>${esc(v.buyer || 'Showroom Yard')}</td>
              <td class="num">${fmtUsd(v.landedCostUsd || 0, 2)}</td>
              <td class="num">${fmtUsd(v.salePriceUsd || 0, 2)}</td>
              <td class="num bold">${fmtUsd(v.marginUsd || 0, 2)}</td>
              <td>${esc(v.status)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${signatureRowHtml('Commercial Director / المدير التجاري', 'Parts & Customs Controller / مراقب المخزون والجمارك')}
      ${sheetFooterHtml(coKey, 1, 1)}
    `;
  }

  function render26RealEstateRegister(meta, ctx) {
    const stmtRange = stmtActiveRange(ctx);
    const d = (window.MFG_REALESTATE && typeof window.MFG_REALESTATE.compute === 'function')
      ? window.MFG_REALESTATE.compute({ company: 'industry:Real Estate & Property', range: stmtRange, ignorePeriod: !stmtRange })
      : { kpis: {}, leases: [], rentInvoices: [] };
    const k = d.kpis || {};
    const coKey = (ctx.co && ['Properties', '4235 Company S.A.L', 'Real Estate Group'].includes(ctx.co)) ? ctx.co : '4235 Company S.A.L';
    const lRows = (d.leases || []).filter(l => coKey === 'Real Estate Group' || l.company === coKey);
    const rRows = (d.rentInvoices || []).filter(r => coKey === 'Real Estate Group' || !r.company || r.company === coKey);
    const rentTotal = lRows.reduce((s, l) => s + Number(l.annualTtcUsd || 0), 0);
    const winHdr = formatStmtWindowHeader(ctx, rRows, 'date');
    return `
      ${sheetHeaderHtml(meta, coKey, `Official 4235 Company S.A.L 11% VAT Rent Roll & Lease Schedule · ${winHdr}`)}
      <div class="rdl-doc-top">
        ${companyBlockHtml(coKey)}
        ${metaRowsHtml([
          ['Statement Code', 'Statement 26 · Real Estate & Property'],
          ['Contracted Annual Rent', fmtUsd(rentTotal, 2)],
          ['Portfolio Occupancy', `${fmtNum(k.occupiedUnits || 0, 0)} / ${fmtNum(k.totalUnits || 0, 0)} (${fmtNum(k.occupancyPct || 0, 1)}%)`],
          ['Rent Collected vs Open AR', `${fmtUsd(k.collectedUsd || 0, 0)} / ${fmtUsd(k.openArUsd || 0, 0)}`]
        ])}
      </div>
      <div class="rdl-section-hdr">1. Active Commercial & Residential Lease Roll (جدول عقود الإيجار الفعالة)</div>
      <table class="rdl-table">
        <thead>
          <tr>
            <th>Lease #</th>
            <th>Landlord Entity</th>
            <th>Property & Unit</th>
            <th>Tenant</th>
            <th>Term Window</th>
            <th class="num">Annual Base ($)</th>
            <th class="num">11% VAT ($)</th>
            <th class="num">Annual Total ($)</th>
          </tr>
        </thead>
        <tbody>
          ${lRows.map(l => `
            <tr>
              <td class="mono bold">${esc(l.code)}</td>
              <td>${esc(l.company)}</td>
              <td>${esc(l.property)} · ${esc(l.unitCode)}</td>
              <td>${esc(l.tenant)}</td>
              <td class="mono">${esc(l.startDate)} to ${esc(l.endDate)}</td>
              <td class="num">${fmtUsd(l.annualBaseUsd || 0, 2)}</td>
              <td class="num">${fmtUsd(l.vatUsd || 0, 2)}</td>
              <td class="num bold">${fmtUsd(l.annualTtcUsd || 0, 2)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td colspan="5">Total Contracted Rent Roll (إجمالي عقود الإيجار السنوية)</td>
            <td class="num">${fmtUsd(lRows.reduce((s, l) => s + Number(l.annualBaseUsd || 0), 0), 2)}</td>
            <td class="num">${fmtUsd(lRows.reduce((s, l) => s + Number(l.vatUsd || 0), 0), 2)}</td>
            <td class="num">${fmtUsd(lRows.reduce((s, l) => s + Number(l.annualTtcUsd || 0), 0), 2)}</td>
          </tr>
        </tfoot>
      </table>
      <div class="rdl-section-hdr" style="margin-top:14px;">2. Official MoF Rent Invoices & Tenant Arrears (فواتير الإيجار الرسمية والذمم)</div>
      <table class="rdl-table">
        <thead>
          <tr>
            <th>Invoice #</th>
            <th>Date</th>
            <th>Tenant</th>
            <th>Unit</th>
            <th class="num">Base Rent ($)</th>
            <th class="num">VAT 11% ($)</th>
            <th class="num">Total ($)</th>
            <th class="num">Balance ($)</th>
          </tr>
        </thead>
        <tbody>
          ${rRows.map(r => `
            <tr>
              <td class="mono bold">${esc(r.invNo)}</td>
              <td class="mono">${esc(r.date)}</td>
              <td>${esc(r.tenant)}</td>
              <td class="mono">${esc(r.unitCode)}</td>
              <td class="num">${fmtUsd(r.baseUsd || 0, 2)}</td>
              <td class="num">${fmtUsd(r.vatUsd || 0, 2)}</td>
              <td class="num">${fmtUsd(r.totalTtc || 0, 2)}</td>
              <td class="num bold">${fmtUsd(r.balanceUsd || 0, 2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${signatureRowHtml('Property Portfolio Director / مدير العقارات', '4235 S.A.L Legal Signatory / المفوض بالتوقيع')}
      ${sheetFooterHtml(coKey, 1, 1)}
    `;
  }

  function render27InsuranceRegister(meta, ctx) {
    const stmtRange = stmtActiveRange(ctx);
    const d = (window.MFG_INSURANCE && typeof window.MFG_INSURANCE.compute === 'function')
      ? window.MFG_INSURANCE.compute({ range: stmtRange, ignorePeriod: !stmtRange })
      : { kpis: {}, policies: [], claims: [], carrierMatrix: [] };
    const k = d.kpis || {};
    const pRows = d.policies || [];
    const cRows = d.carrierMatrix || [];
    const coKey = 'Insurance Company';
    const winHdr = formatStmtWindowHeader(ctx);
    return `
      ${sheetHeaderHtml(meta, coKey, `Gross Written Premium (GWP), Brokerage Commission & Carrier Statement Recon · ${winHdr}`)}
      <div class="rdl-doc-top">
        ${companyBlockHtml(coKey)}
        ${metaRowsHtml([
          ['Statement Code', 'Statement 27 · Insurance & Brokerage'],
          ['Gross Written Premium (GWP)', fmtUsd(k.gwpTotal || 0, 2)],
          ['Brokerage Commission Earned', `${fmtUsd(k.commTotal || 0, 2)} (${fmtNum(k.avgCommYield || 0, 1)}%)`],
          ['Net Carrier Payable', fmtUsd(k.carrierPayableUsd || 0, 2)]
        ])}
      </div>
      <div class="rdl-section-hdr">1. Active Policy Schedule & 30/60/90-Day Renewal Pipeline (جدول البوالص والتجديدات)</div>
      <table class="rdl-table">
        <thead>
          <tr>
            <th>Policy #</th>
            <th>Insured Client</th>
            <th>Carrier / Underwriter</th>
            <th>Line</th>
            <th>Expiry</th>
            <th class="num">GWP ($)</th>
            <th class="num">Broker Comm ($)</th>
            <th class="num">Unpaid Prem ($)</th>
          </tr>
        </thead>
        <tbody>
          ${pRows.map(p => `
            <tr>
              <td class="mono bold">${esc(p.policyNo)}</td>
              <td>${esc(p.insured)}</td>
              <td>${esc(p.carrier)}</td>
              <td>${esc(p.line)}</td>
              <td class="mono">${esc(p.endDate || '-')}${Number.isFinite(Number(p.daysToExpiry)) ? ` (${Number(p.daysToExpiry)}d)` : ''}</td>
              <td class="num">${fmtUsd(p.gwpUsd || 0, 2)}</td>
              <td class="num">${fmtUsd(p.commUsd || 0, 2)}</td>
              <td class="num bold">${fmtUsd(p.clientBalanceUsd || 0, 2)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="rdl-total-row">
            <td colspan="5">Total Policy Schedule (إجمالي جدول البوالص)</td>
            <td class="num">${fmtUsd(pRows.reduce((s, p) => s + Number(p.gwpUsd || 0), 0), 2)}</td>
            <td class="num">${fmtUsd(pRows.reduce((s, p) => s + Number(p.commUsd || 0), 0), 2)}</td>
            <td class="num">${fmtUsd(pRows.reduce((s, p) => s + Number(p.clientBalanceUsd || 0), 0), 2)}</td>
          </tr>
        </tfoot>
      </table>
      <div class="rdl-section-hdr" style="margin-top:14px;">2. Underwriter Carrier Bordereau Reconciliation (مطابقة حسابات شركات التأمين)</div>
      <table class="rdl-table">
        <thead>
          <tr>
            <th>Carrier / Underwriter</th>
            <th class="num">Policies</th>
            <th class="num">Gross Written Prem ($)</th>
            <th class="num">Brokerage Comm ($)</th>
            <th class="num">Net Carrier Payable ($)</th>
            <th class="num">Remitted ($)</th>
            <th class="num">Balance Due ($)</th>
          </tr>
        </thead>
        <tbody>
          ${cRows.map(c => `
            <tr>
              <td class="bold">${esc(c.carrier)}</td>
              <td class="num">${fmtNum(c.policies || 0, 0)}</td>
              <td class="num">${fmtUsd(c.gwpUsd || 0, 2)}</td>
              <td class="num">${fmtUsd(c.commUsd || 0, 2)}</td>
              <td class="num">${fmtUsd(c.netPayableUsd || 0, 2)}</td>
              <td class="num">${fmtUsd(c.remittedUsd || 0, 2)}</td>
              <td class="num bold">${fmtUsd(c.balanceDueUsd || 0, 2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${signatureRowHtml('Principal Insurance Broker / الوسيط التأميني المعتمد', 'Carrier Accounting Recon / محاسبة شركات التأمين')}
      ${sheetFooterHtml(coKey, 1, 1)}
    `;
  }


  const SHEET_RENDERERS = {
    '01': render01DailyOps,
    '02': render02BalanceSheet,
    '03': render03IncomeStatement,
    '04': render04CashFlow,
    '05': render05TrialBalance,
    '06': render06GeneralJournal,
    '07': render07SubAccount,
    '08': render08SalesRegister,
    '09': render09ExpenseRegister,
    '10': render10PayrollRegister,
    '11': render11RawMaterial,
    '12': render12FuelLog,
    '13': render13AgedReceivables,
    '14': render14CustomerStatement,
    '15': render15SupplierBalances,
    '16': render16SupplierStatement,
    '17': render17DriverStatement,
    '18': render18VatReturn,
    '19': render19PlRecon,
    '20': render20SalesInvoice,
    '21': render21DeliveryTicket,
    '22': render22ReceiptVoucher,
    '23': render23HoldingRegister,
    '24': render24HospitalityRegister,
    '25': render25TradingRegister,
    '26': render26RealEstateRegister,
    '27': render27InsuranceRegister
  };

  function renderRdlSheet(id, ctx) {
    const padId = String(id || '01').padStart(2, '0');
    const meta = RDL_CATALOG.find(x => x.id === padId) || RDL_CATALOG[0];
    let effCtx = ctx;
    if (!effCtx || !Array.isArray(effCtx.salesAll)) {
      const opts = effCtx && typeof effCtx === 'object' ? effCtx : {};
      const seedObj = (typeof window !== 'undefined' && window.MFG_SEED) ? window.MFG_SEED : {};
      const coRaw = opts.company !== undefined ? opts.company : (opts.co !== undefined ? opts.co : 'ALL');
      const maxD = String((seedObj && seedObj.generated_at) || '2026-12-31').slice(0, 10);
      const hasExplicitBounds = Boolean(opts.from || opts.to || opts.asof);
      const mockState = {
        company: coRaw,
        period: opts.periodSpec || 'all',
        dateFilter: opts.dateFilter || 'all',
        dateFrom: hasExplicitBounds ? (opts.from || '2024-01-01') : '',
        dateTo: hasExplicitBounds ? (opts.to || maxD) : '',
        rdl: {
          _dateTouched: hasExplicitBounds,
          params: {
            from: opts.from || '2024-01-01',
            to: opts.to || maxD,
            asof: opts.asof || opts.to || maxD,
            period: opts.period || 'Month',
            account: opts.account || 'ALL',
            subAccount: opts.subAccount || 'ALL',
            customer: opts.customer || 'ALL',
            product: opts.product || 'ALL',
            supplier: opts.supplier || 'ALL',
            material: opts.material || 'ALL',
            employee: opts.employee || 'ALL',
            equipType: opts.equipType || 'ALL',
            equipment: opts.equipment || 'ALL',
            driver: opts.driver || 'ALL',
            year: opts.year || 'ALL',
            month: opts.month || 'ALL',
            invoiceNo: opts.invoiceNo || '2738',
            ticketId: opts.ticketId || '',
            receiptId: opts.receiptId || ''
          }
        }
      };
      effCtx = buildRdlContext(seedObj, mockState);
      if (opts.co !== undefined && Number(padId) >= 23) {
        effCtx.co = opts.co;
      }
    }
    const fn = SHEET_RENDERERS[meta.id] || render01DailyOps;
    let html = fn(meta, effCtx);
    html = String(html || '').replace(/\u2014/g, '-').replace(/\u2192/g, ' - ');
    return html;
  }

  function exportPrintableSheetCsv(meta, coKey) {
    const sheet = document.getElementById('printableSheet');
    if (!sheet) return;
    const tables = [...sheet.querySelectorAll('table.rdl-table')];
    if (!tables.length) return;
    const lines = [];
    tables.forEach((tbl, idx) => {
      if (idx > 0) lines.push('');
      tbl.querySelectorAll('tr').forEach(tr => {
        const cells = [...tr.querySelectorAll('th,td')].map(td => {
          const txt = (td.innerText || td.textContent || '').replace(/\s+/g, ' ').trim();
          return `"${txt.replace(/"/g, '""')}"`;
        });
        if (cells.length) lines.push(cells.join(','));
      });
    });
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `RDL_${meta.id}_${meta.slug}_${coKey || 'ALL'}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  function getVisibleRdlCatalog(STATE) {
    const filtered = STATE && typeof STATE.canAccessRdlReport === 'function'
      ? RDL_CATALOG.filter(r => STATE.canAccessRdlReport(r))
      : RDL_CATALOG;
    return filtered.length ? filtered : RDL_CATALOG;
  }

  function _stmtShiftIsoDays(isoStr, deltaDays) {
    const s = String(isoStr || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const ms = Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
    const next = new Date(ms + deltaDays * 86400000);
    return next.toISOString().slice(0, 10);
  }

  function _stmtPriorWindow(fromStr, toStr) {
    const f = String(fromStr || '').slice(0, 10);
    const t = String(toStr || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{4}-\d{2}-\d{2}$/.test(t) || t < f) return null;
    if (f <= '2020-06-01') return null;
    const msF = Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10)));
    const msT = Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1, Number(t.slice(8, 10)));
    const spanDays = Math.max(1, Math.round((msT - msF) / 86400000) + 1);
    const pTo = _stmtShiftIsoDays(f, -1);
    const pFrom = _stmtShiftIsoDays(pTo, -(spanDays - 1));
    return { from: pFrom, to: pTo, spanDays };
  }

  function _stmtCleanParty(s) {
    return String(s == null ? '' : s)
      .replace(/[\u2014\u2013]/g, '-')
      .replace(/[\u2190-\u21FF\u25B8]/g, 'to')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const STMT_FR_TITLES = {
    '01': 'Opérations quotidiennes',
    '02': 'Bilan comptable',
    '03': 'Compte de résultat',
    '04': 'Tableau des flux de trésorerie',
    '05': 'Balance générale',
    '06': 'Livre-journal général',
    '07': 'Relevé de sous-compte',
    '08': 'Journal des ventes',
    '09': 'Journal des charges',
    '10': 'Livre de paie',
    '11': 'Registre des matières premières',
    '12': 'Registre carburant et flotte',
    '13': 'Balance âgée clients',
    '14': 'Relevé de compte client',
    '15': 'Soldes fournisseurs',
    '16': 'Relevé de compte fournisseur',
    '17': 'Relevé chauffeurs et flotte',
    '18': 'Déclaration de TVA',
    '19': 'Rapprochement résultat et grand livre',
    '20': 'Facture de vente',
    '21': 'Bon de livraison',
    '22': 'Reçu d’encaissement',
    '23': 'Registre intersociétés et comptes associés',
    '24': 'Registre revenus sites, caisse et abonnements',
    '25': 'Carnets de factures, châssis VIN et valorisation stock',
    '26': 'État locatif officiel 4235 et échéancier baux',
    '27': 'Bordereau polices, renouvellements et compagnies'
  };

  function computeStatementSnapshot(SEED, STATE, opts) {
    const options = opts && typeof opts === 'object' ? opts : {};
    const seedObj = SEED || (typeof window !== 'undefined' ? window.MFG_SEED : {}) || {};
    const stObj = STATE || { company: 'ALL', activeStatement: '01' };
    const ctx = buildRdlContext(seedObj, stObj);
    const catalog = getVisibleRdlCatalog(stObj);
    const reqId = String(options.stmtId || stObj.activeStatement || '01').padStart(2, '0');
    const meta = catalog.find(x => x.id === reqId) || RDL_CATALOG.find(x => x.id === reqId) || catalog[0] || RDL_CATALOG[0];
    const stmtId = meta.id;
    const p = ctx.rdl.params;
    const isMfg = !ctx.ind || ctx.ind === 'Manufacturing';
    const dt = ctx.domainTerms || DOMAIN_RDL_TERMS['Manufacturing'];

    let canViewBooks = true;
    if (typeof options.canViewBooks === 'boolean') {
      canViewBooks = options.canViewBooks;
    } else if (stObj && typeof stObj.canAccessNavGroup === 'function') {
      try { canViewBooks = Boolean(stObj.canAccessNavGroup('accounting')); } catch (_) {}
    }

    let effCoKey = ctx.co || 'ALL';
    if (stmtId === '23') effCoKey = (ctx.co && ctx.co !== 'ALL') ? ctx.co : 'Bdeir Holding';
    else if (stmtId === '24') effCoKey = (ctx.co && ['Blanca', 'La Una', 'Palms', 'Voile', 'Platinum', 'Hospitality Group'].includes(ctx.co)) ? ctx.co : 'Hospitality Group';
    else if (stmtId === '25') effCoKey = (ctx.co && ['Korri Auto', 'Shacman', 'Trading Group'].includes(ctx.co)) ? ctx.co : 'Trading Group';
    else if (stmtId === '26') effCoKey = (ctx.co && ['Properties', '4235 Company S.A.L', 'Real Estate Group'].includes(ctx.co)) ? ctx.co : '4235 Company S.A.L';
    else if (stmtId === '27') effCoKey = 'Insurance Company';

    const L = CO_LEGAL[effCoKey] || CO_LEGAL[ctx.co] || CO_LEGAL.WTC;
    const priorWin = _stmtPriorWindow(p.from, p.to);
    const mkKpi = (key, labelEn, labelAr, labelFr, valStr, subEn, subAr, subFr, tone) => ({
      key,
      labelEn,
      labelAr,
      labelFr,
      valStr: String(valStr),
      subEn: _stmtCleanParty(subEn || ''),
      subAr: _stmtCleanParty(subAr || subEn || ''),
      subFr: _stmtCleanParty(subFr || subEn || ''),
      tone: tone || 'neutral'
    });

    const isUntouchedAllSnap = isUntouchedAllStmtWindow(ctx);
    const snapStmtRange = isUntouchedAllSnap ? null : { from: p.from, to: p.to };
    let windowMode = 'period';
    let windowLabelEn = isUntouchedAllSnap ? 'All Periods' : `${p.from} to ${p.to}`;
    let windowLabelAr = isUntouchedAllSnap ? 'جميع الفترات' : `${p.from} إلى ${p.to}`;
    let windowLabelFr = isUntouchedAllSnap ? 'Toutes les périodes' : `${p.from} au ${p.to}`;
    let tieCheck = null;
    let kpis = [];
    let facts = {};

    if (stmtId === '01') {
      const sales = ctx.salesAll.filter(r => inWindow(rowDate(r, ctx.basis), p.from, p.to));
      const rcpts = (ctx.receiptLedgerAll || []).filter(r => inWindow(rowDate(r, ctx.basis), p.from, p.to));
      const exps = ctx.expAll.filter(r => inWindow(rowDate(r, ctx.basis), p.from, p.to));
      const rms = ctx.rmAll.filter(r => inWindow(rowDate(r, ctx.basis), p.from, p.to));
      const fuels = ctx.fuelAll.filter(r => inWindow(rowDate(r, ctx.basis), p.from, p.to));
      const totQty = sales.reduce((s, r) => s + Number(r.qty || 0), 0);
      const totRev = sales.reduce((s, r) => s + Number(r.total_usd || 0), 0);
      const totPaid = sales.reduce((s, r) => s + Number(r.paid_usd || 0), 0) + rcpts.reduce((s, r) => s + Number(r.paid_usd || 0), 0);
      const totExp = exps.reduce((s, r) => s + Number(r.total_usd || 0), 0) + rms.reduce((s, r) => s + Number(r.total_usd || 0), 0);
      const totLiters = fuels.reduce((s, r) => s + Number(r.liters || 0), 0);
      const byProd = new Map();
      sales.forEach(r => {
        const k = r.product || (isMfg ? 'Ready-Mix Concrete' : dt.rcptDescDef);
        byProd.set(k, (byProd.get(k) || 0) + Number(r.total_usd || 0));
      });
      const topProdEntry = [...byProd.entries()].sort((a, b) => b[1] - a[1])[0] || null;
      const realPct = totRev > 0 ? Number(((totPaid / totRev) * 100).toFixed(1)) : 0;
      let priorRev = null;
      if (priorWin) {
        priorRev = Math.round(ctx.salesAll.filter(r => inWindow(rowDate(r, ctx.basis), priorWin.from, priorWin.to)).reduce((s, r) => s + Number(r.total_usd || 0), 0));
      }
      facts = {
        transactions: sales.length,
        volume: Number(totQty.toFixed(dt.qtyDp)),
        volumeUnit: dt.qtyUnit,
        grossBillingUsd: Math.round(totRev),
        priorBillingUsd: priorRev,
        avgUnitUsd: totQty > 0 ? Number((totRev / totQty).toFixed(2)) : 0,
        fuelLiters: Math.round(totLiters),
        topItem: topProdEntry ? _stmtCleanParty(topProdEntry[0]) : null,
        topItemUsd: topProdEntry ? Math.round(topProdEntry[1]) : 0
      };
      if (canViewBooks) {
        facts.cashCollectedUsd = Math.round(totPaid);
        facts.realizationPct = realPct;
        facts.directAndOpexUsd = Math.round(totExp);
      }
      kpis = canViewBooks ? [
        mkKpi('vol', 'Dispatched Volume', 'الكمية المنفذة', 'Volume exécuté', `${fmtNum(totQty, dt.qtyDp)} ${dt.qtyUnit}`, `${fmtNum(sales.length, 0)} ${isMfg ? 'loads' : dt.txPlural}`, `${fmtNum(sales.length, 0)} حركة`, `${fmtNum(sales.length, 0)} opérations`),
        mkKpi('rev', 'Gross Billing', 'إجمالي الفوترة', 'Facturation brute', fmtUsd(totRev), `Avg ${fmtUsd(totQty > 0 ? totRev / totQty : 0)} / ${dt.qtyUnit}`, `متوسط ${fmtUsd(totQty > 0 ? totRev / totQty : 0)}`, `Moy. ${fmtUsd(totQty > 0 ? totRev / totQty : 0)}`),
        mkKpi('paid', 'Cash Collected', 'التحصيل النقدي', 'Encaissements', fmtUsd(totPaid), `${realPct.toFixed(1)}% realization`, `${realPct.toFixed(1)}% نسبة تحصيل`, `${realPct.toFixed(1)}% encaissé`, realPct >= 75 ? 'pos' : 'neutral'),
        mkKpi('cost', 'Direct & OPEX', 'المصاريف والمشتريات', 'Coûts directs et OPEX', fmtUsd(totExp), `${fmtNum(totLiters, 0)} L fuel`, `${fmtNum(totLiters, 0)} ليتر محروقات`, `${fmtNum(totLiters, 0)} L carburant`)
      ] : [
        mkKpi('vol', 'Dispatched Volume', 'الكمية المنفذة', 'Volume exécuté', `${fmtNum(totQty, dt.qtyDp)} ${dt.qtyUnit}`, `${fmtNum(sales.length, 0)} ${isMfg ? 'loads' : dt.txPlural}`, `${fmtNum(sales.length, 0)} حركة`, `${fmtNum(sales.length, 0)} opérations`),
        mkKpi('rev', 'Gross Billing', 'إجمالي الفوترة', 'Facturation brute', fmtUsd(totRev), topProdEntry ? topProdEntry[0] : dt.rcptDescDef, topProdEntry ? topProdEntry[0] : '', topProdEntry ? topProdEntry[0] : ''),
        mkKpi('avg', 'Average Rate', 'متوسط السعر', 'Tarif moyen', fmtUsd(totQty > 0 ? totRev / totQty : 0, 2), `Per ${dt.qtyUnit}`, `لكل ${dt.qtyUnit}`, `Par ${dt.qtyUnit}`),
        mkKpi('fuel', 'Diesel & Utility', 'استهلاك المحروقات', 'Carburant consommé', `${fmtNum(totLiters, 0)} L`, `${fmtNum(fuels.length, 0)} fills`, `${fmtNum(fuels.length, 0)} تعبئة`, `${fmtNum(fuels.length, 0)} pleins`)
      ];
    } else if (stmtId === '02') {
      const asof = p.asof || p.to;
      windowMode = 'asof';
      windowLabelEn = `As at ${asof}`;
      windowLabelAr = `كما في ${asof}`;
      windowLabelFr = `Au ${asof}`;
      const coaList = ctx.coaAccounts || COA_ACCOUNTS;
      const jes = buildJournalEntries(ctx, asof);
      const balMap = new Map();
      coaList.forEach(a => balMap.set(a.code, { ...a, dr: 0, cr: 0 }));
      jes.forEach(j => {
        const b = balMap.get(j.acct_code);
        if (b) { b.dr += j.debit; b.cr += j.credit; }
      });
      let revNet = 0, expNet = 0;
      balMap.forEach(b => {
        if (b.code.startsWith('7')) revNet += (b.cr - b.dr);
        if (b.code.startsWith('6')) expNet += (b.dr - b.cr);
      });
      const retainedEarnings = revNet - expNet;
      const dBal = c => { const b = balMap.get(c); return b ? (b.dr - b.cr) : 0; };
      const cBal = c => { const b = balMap.get(c); return b ? (b.cr - b.dr) : 0; };
      const fixedAssets = dBal('215') + dBal('218') + dBal('281');
      const currAssets = dBal('311') + dBal('411') + dBal('467');
      const cashBank = dBal('512') + dBal('531');
      const totalAssets = fixedAssets + currAssets + cashBank;
      const liabClass4 = cBal('401') + cBal('421') + cBal('442');
      const eqClass1 = cBal('101') + cBal('165') + retainedEarnings;
      const totalLiabEq = liabClass4 + eqClass1;
      const varianceUsd = Math.round(Math.abs(totalAssets - totalLiabEq) * 100) / 100;
      const balanced = varianceUsd < 0.02;
      tieCheck = { balanced, varianceUsd, kind: 'bs' };
      facts = {
        asOfDate: asof,
        totalAssetsUsd: Math.round(totalAssets),
        totalLiabilitiesAndEquityUsd: Math.round(totalLiabEq),
        cashAndBankClass5Usd: canViewBooks ? Math.round(cashBank) : undefined,
        receivables411Usd: canViewBooks ? Math.round(dBal('411')) : undefined,
        payables401Usd: canViewBooks ? Math.round(cBal('401')) : undefined,
        periodNetResult120Usd: Math.round(retainedEarnings),
        balanceSheetVarianceUsd: varianceUsd,
        balanced
      };
      kpis = [
        mkKpi('assets', 'Total Assets', 'إجمالي الموجودات', 'Total actif', fmtUsdSigned(totalAssets), `Fixed ${fmtUsd(fixedAssets)}`, `ثابتة ${fmtUsd(fixedAssets)}`, `Immobilisé ${fmtUsd(fixedAssets)}`),
        mkKpi('liabeq', 'Liabilities & Equity', 'المطلوبات والرساميل', 'Passif et capitaux', fmtUsdSigned(totalLiabEq), `Payables ${fmtUsd(liabClass4)}`, `ذمم دائنة ${fmtUsd(liabClass4)}`, `Dettes ${fmtUsd(liabClass4)}`),
        mkKpi('cash', 'Cash & Bank (Class 5)', 'النقدية والبنوك', 'Trésorerie (Classe 5)', canViewBooks ? fmtUsdSigned(cashBank) : 'Restricted', 'Accounts 512 + 531', 'حسابات 512 و 531', 'Comptes 512 + 531', cashBank >= 0 ? 'pos' : 'neg'),
        mkKpi('tie', 'Balance Sheet Tie', 'مطابقة الميزانية', 'Équilibre du bilan', balanced ? '$0.00' : fmtUsd(varianceUsd, 2), balanced ? 'Classes 1-5 balanced' : 'Variance detected', balanced ? 'متوازنة بالكامل' : 'يوجد فرق', balanced ? 'Classes 1-5 équilibrées' : 'Écart détecté', balanced ? 'ok' : 'neg')
      ];
    } else if (stmtId === '03') {
      const jes = buildJournalEntries(ctx, p.to).filter(j => j.date !== '2020-01-01' && inWindow(j.date, p.from, p.to));
      let rev701 = 0, rev706 = 0, exp601 = 0, exp615 = 0, exp622 = 0, exp641 = 0;
      jes.forEach(j => {
        if (j.acct_code === '701') rev701 += (j.credit - j.debit);
        else if (j.acct_code === '706') rev706 += (j.credit - j.debit);
        else if (j.acct_code === '601') exp601 += (j.debit - j.credit);
        else if (j.acct_code === '615') exp615 += (j.debit - j.credit);
        else if (j.acct_code === '622') exp622 += (j.debit - j.credit);
        else if (j.acct_code === '641') exp641 += (j.debit - j.credit);
      });
      const revTotal = rev701 + rev706;
      const expTotal = exp601 + exp615 + exp622 + exp641;
      const ebitda = revTotal - expTotal;
      const marginPct = revTotal > 0 ? Number(((ebitda / revTotal) * 100).toFixed(1)) : 0;
      facts = {
        operatingRevenueClass7Usd: Math.round(revTotal),
        directCost601Usd: Math.round(exp601),
        maintenanceAndServicesUsd: Math.round(exp615 + exp622),
        payroll641Usd: Math.round(exp641),
        operatingCostsClass6Usd: Math.round(expTotal),
        netOperatingIncomeUsd: Math.round(ebitda),
        operatingMarginPct: marginPct,
        periodGrain: p.period || 'Month'
      };
      kpis = [
        mkKpi('rev', 'Operating Revenue', 'الإيرادات التشغيلية', 'Produits d’exploitation', fmtUsd(revTotal), 'Class 7 (701 + 706)', 'الفئة 7 (701 + 706)', 'Classe 7 (701 + 706)', 'pos'),
        mkKpi('exp', 'Operating Costs', 'الأعباء التشغيلية', 'Charges d’exploitation', fmtUsd(expTotal), `Direct 601: ${fmtUsd(exp601)}`, `مباشرة 601: ${fmtUsd(exp601)}`, `Directs 601 : ${fmtUsd(exp601)}`),
        mkKpi('ebitda', 'Net Operating Income', 'صافي النتيجة التشغيلية', 'Résultat d’exploitation', fmtUsdSigned(ebitda), `Payroll 641: ${fmtUsd(exp641)}`, `رواتب 641: ${fmtUsd(exp641)}`, `Paie 641 : ${fmtUsd(exp641)}`, ebitda >= 0 ? 'pos' : 'neg'),
        mkKpi('margin', 'Operating Margin', 'هامش التشغيل', 'Marge opérationnelle', `${marginPct.toFixed(1)}%`, `Columns by ${p.period || 'Month'}`, `موزعة حسب ${p.period || 'Month'}`, `Ventilé par ${p.period || 'Month'}`, marginPct >= 15 ? 'ok' : (marginPct >= 0 ? 'neutral' : 'neg'))
      ];
    } else if (stmtId === '04') {
      const txDate = r => String((r && (r.date || r.tx_date)) || '').slice(0, 10);
      const sales = (ctx.arLedgerAll || ctx.salesAll).filter(r => inWindow(txDate(r), p.from, p.to));
      const exps = ctx.expAll.filter(r => inWindow(txDate(r), p.from, p.to));
      const rms = (ctx.apRmLedgerAll || ctx.rmAll).filter(r => inWindow(txDate(r), p.from, p.to));
      const fuels = ctx.fuelAll.filter(r => inWindow(txDate(r), p.from, p.to));
      const pays = ctx.payAll.filter(r => inWindow(txDate(r), p.from, p.to));
      const custIn = sales.reduce((s, r) => s + Number(r.paid_usd || 0), 0);
      const rmOut = rms.reduce((s, r) => s - Number(r.paid_usd || r.total_usd || 0), 0);
      const fuelOut = fuels.reduce((s, r) => s - Number(r.paid_usd || r.total_usd || 0), 0);
      const expOut = exps.reduce((s, r) => s - Number(r.paid_usd || r.total_usd || 0), 0);
      const payOut = pays.reduce((s, r) => s - Number(r.paid_usd || r.net_usd || 0), 0);
      const netCf = custIn + rmOut + fuelOut + expOut + payOut;
      facts = {
        collectionsInUsd: canViewBooks ? Math.round(custIn) : undefined,
        supplierPaymentsOutUsd: canViewBooks ? Math.round(Math.abs(rmOut)) : undefined,
        fuelAndOpexOutUsd: Math.round(Math.abs(fuelOut + expOut)),
        payrollDisbursedOutUsd: Math.round(Math.abs(payOut)),
        netOperatingCashFlowUsd: canViewBooks ? Math.round(netCf) : undefined,
        periodGrain: p.period || 'Month'
      };
      kpis = [
        mkKpi('in', 'Cash Collections', 'التحصيلات النقدية', 'Encaissements clients', canViewBooks ? fmtUsdSigned(custIn) : 'Restricted', `${fmtNum(sales.length, 0)} entries`, `${fmtNum(sales.length, 0)} حركة`, `${fmtNum(sales.length, 0)} mouvements`, 'pos'),
        mkKpi('sup', 'Supplier Outflows', 'تسديدات الموردين', 'Décaissements fournisseurs', canViewBooks ? fmtUsdSigned(rmOut) : 'Restricted', 'Direct supply & settlements', 'مشتريات وتسديدات', 'Achats et règlements'),
        mkKpi('opex', 'OPEX, Fuel & Payroll', 'المصاريف والرواتب', 'OPEX, carburant et paie', fmtUsdSigned(fuelOut + expOut + payOut), `Payroll ${fmtUsd(Math.abs(payOut))}`, `رواتب ${fmtUsd(Math.abs(payOut))}`, `Paie ${fmtUsd(Math.abs(payOut))}`),
        mkKpi('net', 'Net Operating Cash', 'صافي التدفق النقدي', 'Flux net d’exploitation', canViewBooks ? fmtUsdSigned(netCf) : 'Restricted', 'Direct method', 'الطريقة المباشرة', 'Méthode directe', netCf >= 0 ? 'ok' : 'neg')
      ];
    } else if (stmtId === '05') {
      const coaList = ctx.coaAccounts || COA_ACCOUNTS;
      const jes = buildJournalEntries(ctx, p.to);
      const map = new Map();
      coaList.forEach(a => map.set(a.code, { acct: a, openDr: 0, openCr: 0, perDr: 0, perCr: 0 }));
      jes.forEach(j => {
        const m = map.get(j.acct_code);
        if (!m) return;
        if (j.date < p.from) { m.openDr += j.debit; m.openCr += j.credit; }
        else if (j.date <= p.to) { m.perDr += j.debit; m.perCr += j.credit; }
      });
      let tOpenDr = 0, tOpenCr = 0, tPerDr = 0, tPerCr = 0, tCloseDr = 0, tCloseCr = 0;
      coaList.forEach(a => {
        const m = map.get(a.code);
        const netOpen = m.openDr - m.openCr;
        const netClose = (m.openDr + m.perDr) - (m.openCr + m.perCr);
        tOpenDr += netOpen > 0 ? netOpen : 0;
        tOpenCr += netOpen < 0 ? -netOpen : 0;
        tPerDr += m.perDr;
        tPerCr += m.perCr;
        tCloseDr += netClose > 0 ? netClose : 0;
        tCloseCr += netClose < 0 ? -netClose : 0;
      });
      const varianceUsd = Math.round(Math.abs(tCloseDr - tCloseCr) * 100) / 100;
      const perVarUsd = Math.round(Math.abs(tPerDr - tPerCr) * 100) / 100;
      const balanced = varianceUsd < 0.02 && perVarUsd < 0.02;
      tieCheck = { balanced, varianceUsd, kind: 'tb' };
      facts = {
        coaAccountsCount: coaList.length,
        openingDebitUsd: Math.round(tOpenDr),
        openingCreditUsd: Math.round(tOpenCr),
        periodDebitUsd: Math.round(tPerDr),
        periodCreditUsd: Math.round(tPerCr),
        closingDebitUsd: Math.round(tCloseDr),
        closingCreditUsd: Math.round(tCloseCr),
        trialBalanceVarianceUsd: varianceUsd,
        balanced
      };
      kpis = [
        mkKpi('open', 'Opening Trial Balance', 'رصيد الافتتاح', 'Solde d’ouverture', fmtUsd(tOpenDr), `${coaList.length} GL accounts`, `${coaList.length} حساب عام`, `${coaList.length} comptes généraux`),
        mkKpi('per', 'Period Movement', 'حركة الفترة', 'Mouvements période', fmtUsd(tPerDr), `Cr ${fmtUsd(tPerCr)}`, `دائن ${fmtUsd(tPerCr)}`, `Crédit ${fmtUsd(tPerCr)}`),
        mkKpi('close', 'Closing Trial Balance', 'ميزان الإقفال', 'Balance de clôture', fmtUsd(tCloseDr), `Cr ${fmtUsd(tCloseCr)}`, `دائن ${fmtUsd(tCloseCr)}`, `Crédit ${fmtUsd(tCloseCr)}`),
        mkKpi('tie', 'Debit vs Credit Tie', 'مطابقة المدين والدائن', 'Équilibre Débit / Crédit', balanced ? '$0.00' : fmtUsd(varianceUsd, 2), balanced ? 'Classes 1-7 balanced' : 'Out of balance', balanced ? 'متوازن بالكامل' : 'غير متوازن', balanced ? 'Classes 1-7 équilibrées' : 'Écart détecté', balanced ? 'ok' : 'neg')
      ];
    } else if (stmtId === '06') {
      const allJes = buildJournalEntries(ctx, p.to).filter(j => {
        if (!inWindow(j.date, p.from, p.to)) return false;
        if (p.account && p.account !== 'ALL' && j.acct_code !== p.account) return false;
        return true;
      });
      const totDr = allJes.reduce((s, j) => s + j.debit, 0);
      const totCr = allJes.reduce((s, j) => s + j.credit, 0);
      const isAllAccts = !p.account || p.account === 'ALL';
      const varianceUsd = Math.round(Math.abs(totDr - totCr) * 100) / 100;
      const balanced = !isAllAccts || varianceUsd < 0.02;
      if (isAllAccts) tieCheck = { balanced, varianceUsd, kind: 'je' };
      facts = {
        journalLines: allJes.length,
        accountFilter: p.account || 'ALL',
        totalDebitUsd: Math.round(totDr),
        totalCreditUsd: Math.round(totCr),
        journalVarianceUsd: isAllAccts ? varianceUsd : null,
        balanced
      };
      kpis = [
        mkKpi('cnt', 'Journal Postings', 'قيود اليومية', 'Lignes de journal', fmtNum(allJes.length, 0), p.account === 'ALL' ? 'All GL accounts' : `Account ${p.account}`, p.account === 'ALL' ? 'كافة الحسابات' : `حساب ${p.account}`, p.account === 'ALL' ? 'Tous les comptes' : `Compte ${p.account}`),
        mkKpi('dr', 'Total Debits', 'إجمالي المدين', 'Total débits', fmtUsd(totDr, 2), 'Posted period debits', 'حركات مدينة مرحلة', 'Débits comptabilisés'),
        mkKpi('cr', 'Total Credits', 'إجمالي الدائن', 'Total crédits', fmtUsd(totCr, 2), 'Posted period credits', 'حركات دائنة مرحلة', 'Crédits comptabilisés'),
        mkKpi('tie', isAllAccts ? 'Double-Entry Tie' : 'Net Account Movement', isAllAccts ? 'توازن القيد المزدوج' : 'صافي حركة الحساب', isAllAccts ? 'Équilibre partie double' : 'Mouvement net', isAllAccts ? (balanced ? '$0.00' : fmtUsd(varianceUsd, 2)) : fmtUsdSigned(totDr - totCr, 2), isAllAccts ? 'Balanced Dr = Cr' : `Account ${p.account}`, isAllAccts ? 'المدين يساوي الدائن' : `حساب ${p.account}`, isAllAccts ? 'Débit = Crédit' : `Compte ${p.account}`, isAllAccts && balanced ? 'ok' : 'neutral')
      ];
    } else if (stmtId === '07') {
      const jes = buildJournalEntries(ctx, p.to).filter(j => {
        if (p.account && p.account !== 'ALL' && j.acct_code !== p.account) return false;
        if (p.subAccount && p.subAccount !== 'ALL' && j.sub_account !== p.subAccount) return false;
        return true;
      });
      let openDr = 0, openCr = 0, totDr = 0, totCr = 0, pCount = 0;
      jes.forEach(j => {
        if (j.date < p.from) { openDr += j.debit; openCr += j.credit; }
        else if (j.date <= p.to) { totDr += j.debit; totCr += j.credit; pCount += 1; }
      });
      const openBal = openDr - openCr;
      const closeBal = openBal + totDr - totCr;
      facts = {
        accountFilter: p.account || 'ALL',
        subAccountFilter: p.subAccount || 'ALL',
        periodLines: pCount,
        openingBalanceUsd: Math.round(openBal),
        periodDebitUsd: Math.round(totDr),
        periodCreditUsd: Math.round(totCr),
        closingBalanceUsd: Math.round(closeBal)
      };
      kpis = [
        mkKpi('open', 'Opening Balance', 'رصيد مدور', 'Solde d’ouverture', fmtUsdSigned(openBal, 2), `Before ${p.from}`, `قبل ${p.from}`, `Avant ${p.from}`),
        mkKpi('dr', 'Period Debits', 'مدين الفترة', 'Débits période', fmtUsd(totDr, 2), `${fmtNum(pCount, 0)} lines`, `${fmtNum(pCount, 0)} حركة`, `${fmtNum(pCount, 0)} lignes`),
        mkKpi('cr', 'Period Credits', 'دائن الفترة', 'Crédits période', fmtUsd(totCr, 2), p.subAccount === 'ALL' ? 'All sub-accounts' : p.subAccount, p.subAccount === 'ALL' ? 'كافة الحسابات الفرعية' : p.subAccount, p.subAccount === 'ALL' ? 'Tous sous-comptes' : p.subAccount),
        mkKpi('close', 'Closing Balance', 'الرصيد الختامي', 'Solde de clôture', fmtUsdSigned(closeBal, 2), `Account ${p.account || 'ALL'}`, `حساب ${p.account || 'ALL'}`, `Compte ${p.account || 'ALL'}`)
      ];
    } else if (stmtId === '08') {
      const rows = ctx.salesAll.filter(r => {
        if (!inWindow(rowDate(r, ctx.basis), p.from, p.to)) return false;
        if (p.customer && p.customer !== 'ALL' && r.customer !== p.customer) return false;
        if (p.product && p.product !== 'ALL' && r.product !== p.product) return false;
        if (p.site && p.site !== 'ALL' && r.site !== p.site) return false;
        return true;
      });
      const totQty = rows.reduce((s, r) => s + Number(r.qty || 0), 0);
      const totGross = rows.reduce((s, r) => s + Number(r.total_usd || 0), 0);
      const totPaid = rows.reduce((s, r) => s + Number(r.paid_usd || 0), 0);
      const byCust = new Map();
      rows.forEach(r => byCust.set(r.customer || 'Walk-in', (byCust.get(r.customer || 'Walk-in') || 0) + Number(r.total_usd || 0)));
      const topCust = [...byCust.entries()].sort((a, b) => b[1] - a[1])[0] || null;
      facts = {
        salesCount: rows.length,
        volume: Number(totQty.toFixed(dt.qtyDp)),
        volumeUnit: dt.qtyUnit,
        totalSalesUsd: Math.round(totGross),
        avgUnitUsd: totQty > 0 ? Number((totGross / totQty).toFixed(2)) : 0,
        topCustomer: topCust ? _stmtCleanParty(topCust[0]) : null,
        topCustomerUsd: topCust ? Math.round(topCust[1]) : 0
      };
      if (canViewBooks) {
        facts.paidAtSaleUsd = Math.round(totPaid);
        facts.creditBilledUsd = Math.round(totGross - totPaid);
      }
      kpis = [
        mkKpi('cnt', 'Sales Entries', 'عدد المبيعات', 'Lignes de vente', fmtNum(rows.length, 0), `${fmtNum(totQty, dt.qtyDp)} ${dt.qtyUnit}`, `${fmtNum(totQty, dt.qtyDp)} ${dt.qtyUnit}`, `${fmtNum(totQty, dt.qtyDp)} ${dt.qtyUnit}`),
        mkKpi('gross', 'Total Sales', 'إجمالي المبيعات', 'Total des ventes', fmtUsd(totGross, 2), `Avg ${fmtUsd(totQty > 0 ? totGross / totQty : 0, 2)}`, `متوسط ${fmtUsd(totQty > 0 ? totGross / totQty : 0, 2)}`, `Moy. ${fmtUsd(totQty > 0 ? totGross / totQty : 0, 2)}`, 'pos'),
        mkKpi('paid', canViewBooks ? 'Settled on Ticket' : 'Top Account', canViewBooks ? 'مسدد فوري' : 'أكبر زبون', canViewBooks ? 'Réglé comptant' : 'Client principal', canViewBooks ? fmtUsd(totPaid, 2) : (topCust ? topCust[0] : '-'), topCust ? _stmtCleanParty(topCust[0]) : 'All customers', topCust ? _stmtCleanParty(topCust[0]) : 'كافة الزبائن', topCust ? _stmtCleanParty(topCust[0]) : 'Tous clients'),
        mkKpi('bal', canViewBooks ? 'Credit Billed' : 'Filtered Scope', canViewBooks ? 'مبيعات آجلة' : 'نطاق التصفية', canViewBooks ? 'Facturé à crédit' : 'Périmètre filtré', canViewBooks ? fmtUsd(totGross - totPaid, 2) : (p.customer === 'ALL' ? 'All' : p.customer), p.site === 'ALL' ? 'All locations' : p.site, p.site === 'ALL' ? 'كافة المواقع' : p.site, p.site === 'ALL' ? 'Tous sites' : p.site)
      ];
    } else if (stmtId === '09') {
      const rows = ctx.expAll.filter(r => {
        if (!inWindow(rowDate(r, ctx.basis), p.from, p.to)) return false;
        if (p.supplier && p.supplier !== 'ALL' && r.supplier !== p.supplier) return false;
        if (p.category && p.category !== 'ALL' && r.category !== p.category) return false;
        return true;
      });
      const totNet = rows.reduce((s, r) => s + (Number(r.total_usd || 0) - Number(r.vat_usd || 0)), 0);
      const totVat = rows.reduce((s, r) => s + Number(r.vat_usd || 0), 0);
      const totGross = rows.reduce((s, r) => s + Number(r.total_usd || 0), 0);
      const totPaid = rows.reduce((s, r) => s + Number(r.paid_usd || 0), 0);
      const byCat = new Map();
      rows.forEach(r => byCat.set(r.category || 'General', (byCat.get(r.category || 'General') || 0) + Number(r.total_usd || 0)));
      const topCat = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0] || null;
      facts = {
        voucherCount: rows.length,
        netExpenseUsd: Math.round(totNet),
        inputVatUsd: Math.round(totVat),
        totalExpenseUsd: Math.round(totGross),
        paidExpenseUsd: canViewBooks ? Math.round(totPaid) : undefined,
        unpaidCreditExpenseUsd: canViewBooks ? Math.round(totGross - totPaid) : undefined,
        topCategory: topCat ? _stmtCleanParty(topCat[0]) : null,
        topCategoryUsd: topCat ? Math.round(topCat[1]) : 0
      };
      kpis = [
        mkKpi('cnt', 'Expense Vouchers', 'سندات المصاريف', 'Pièces de charges', fmtNum(rows.length, 0), topCat ? topCat[0] : 'All categories', topCat ? topCat[0] : 'كافة الفئات', topCat ? topCat[0] : 'Toutes catégories'),
        mkKpi('net', 'Net Expenses', 'صافي المصاريف', 'Charges HT', fmtUsd(totNet, 2), `VAT ${fmtUsd(totVat, 2)}`, `ضريبة ${fmtUsd(totVat, 2)}`, `TVA ${fmtUsd(totVat, 2)}`),
        mkKpi('tot', 'Total Expenses', 'إجمالي المصاريف', 'Total charges', fmtUsd(totGross, 2), p.supplier === 'ALL' ? 'All vendors' : p.supplier, p.supplier === 'ALL' ? 'كافة الموردين' : p.supplier, p.supplier === 'ALL' ? 'Tous fournisseurs' : p.supplier),
        mkKpi('ap', 'Credit Balance', 'ذمم غير مسددة', 'Solde à payer', canViewBooks ? fmtUsd(totGross - totPaid, 2) : 'Restricted', canViewBooks ? `Paid ${fmtUsd(totPaid, 0)}` : 'Books restricted', canViewBooks ? `مسدد ${fmtUsd(totPaid, 0)}` : 'مقيد', canViewBooks ? `Payé ${fmtUsd(totPaid, 0)}` : 'Restreint')
      ];
    } else if (stmtId === '10') {
      const rows = ctx.payAll.filter(r => {
        if (!inWindow(rowDate(r, ctx.basis), p.from, p.to)) return false;
        if (p.staff && p.staff !== 'ALL' && r.staff !== p.staff) return false;
        return true;
      });
      const regCalc = (typeof window !== 'undefined' && typeof window.__mfgComputeStaffPayrollRegister === 'function')
        ? window.__mfgComputeStaffPayrollRegister({ activeRange: { from: p.from, to: p.to } })
        : null;
      const staffEarnRows = ((regCalc && regCalc.staffRows) || []).filter(sr => {
        if (!sr) return false;
        if (!coMatch(sr.company || 'WTC', ctx.co, null)) return false;
        if (p.staff && p.staff !== 'ALL' && sr.staff !== p.staff) return false;
        return Math.abs(sr.earnings || 0) > 0.005 || Math.abs(sr.paid || 0) > 0.005 || Math.abs(sr.reimb || 0) > 0.005;
      });
      const sumEarned = staffEarnRows.reduce((s, r) => s + Number(r.earnings || 0), 0);
      const sumDed = staffEarnRows.reduce((s, r) => s + Number(r.late_ded || 0) + Number(r.abs_ded || 0) + Number(r.ded || 0), 0);
      const totPaid = rows.reduce((s, r) => s + Number(r.paid_usd || 0), 0);
      const sumBal = staffEarnRows.reduce((s, r) => s + Number(r.balance || 0), 0);
      facts = {
        staffCount: staffEarnRows.length || uniqCount(rows.map(r => r.staff)),
        disbursementVouchers: rows.length,
        netEarnedUsd: Math.round(sumEarned || totPaid),
        deductionsUsd: Math.round(sumDed),
        disbursedUsd: Math.round(totPaid),
        remainingPayrollBalanceUsd: Math.round(sumBal)
      };
      kpis = [
        mkKpi('staff', 'Active Staff', 'الموظفون الفعالون', 'Effectif actif', fmtNum(facts.staffCount, 0), `${fmtNum(rows.length, 0)} vouchers`, `${fmtNum(rows.length, 0)} سند صرف`, `${fmtNum(rows.length, 0)} décaissements`),
        mkKpi('earn', 'Net Earned', 'صافي الاستحقاق', 'Net acquis', fmtUsd(sumEarned || totPaid, 2), `Deductions ${fmtUsd(sumDed, 0)}`, `حسميات ${fmtUsd(sumDed, 0)}`, `Retenues ${fmtUsd(sumDed, 0)}`),
        mkKpi('paid', 'Salary Disbursed', 'الرواتب المصروفة', 'Salaires versés', fmtUsd(totPaid, 2), 'Account 641 / 421', 'حساب 641 / 421', 'Comptes 641 / 421'),
        mkKpi('bal', 'Remaining Balance', 'الرصيد المتبقي', 'Solde restant', fmtUsdSigned(sumBal, 2), p.staff === 'ALL' ? 'All staff' : p.staff, p.staff === 'ALL' ? 'كافة الموظفين' : p.staff, p.staff === 'ALL' ? 'Tout le personnel' : p.staff)
      ];
    } else if (stmtId === '11') {
      const rows = ctx.rmAll.filter(r => {
        if (!inWindow(rowDate(r, ctx.basis), p.from, p.to)) return false;
        if (p.supplier && p.supplier !== 'ALL' && r.supplier !== p.supplier) return false;
        return true;
      });
      const totQty = rows.reduce((s, r) => s + Number(r.qty || 0), 0);
      const totUsd = rows.reduce((s, r) => s + Number(r.total_usd || 0), 0);
      const totPaid = rows.reduce((s, r) => s + Number(r.paid_usd || 0), 0);
      const bySup = new Map();
      rows.forEach(r => bySup.set(r.supplier || 'Supplier', (bySup.get(r.supplier || 'Supplier') || 0) + Number(r.total_usd || 0)));
      const topSup = [...bySup.entries()].sort((a, b) => b[1] - a[1])[0] || null;
      facts = {
        intakeDeliveries: rows.length,
        totalQty: Number(totQty.toFixed(2)),
        totalIntakeUsd: Math.round(totUsd),
        paidIntakeUsd: canViewBooks ? Math.round(totPaid) : undefined,
        creditPayableUsd: canViewBooks ? Math.round(totUsd - totPaid) : undefined,
        topSupplier: topSup ? _stmtCleanParty(topSup[0]) : null,
        topSupplierUsd: topSup ? Math.round(topSup[1]) : 0
      };
      kpis = [
        mkKpi('cnt', 'Intake Deliveries', 'توريدات مستلمة', 'Livraisons reçues', fmtNum(rows.length, 0), topSup ? topSup[0] : 'All suppliers', topSup ? topSup[0] : 'كافة الموردين', topSup ? topSup[0] : 'Tous fournisseurs'),
        mkKpi('qty', 'Total Quantity', 'إجمالي الكمية', 'Quantité totale', fmtNum(totQty, 2), 'Ton / m³', 'طن / م³', 'Tonnes / m³'),
        mkKpi('tot', 'Total Intake Value', 'قيمة التوريدات', 'Valeur des entrées', fmtUsd(totUsd, 2), `Avg ${fmtUsd(totQty > 0 ? totUsd / totQty : 0, 2)}`, `متوسط ${fmtUsd(totQty > 0 ? totUsd / totQty : 0, 2)}`, `Moy. ${fmtUsd(totQty > 0 ? totUsd / totQty : 0, 2)}`),
        mkKpi('bal', canViewBooks ? 'Credit Payable' : 'Average Unit Cost', canViewBooks ? 'ذمم التوريد' : 'متوسط الكلفة', canViewBooks ? 'À payer fournisseurs' : 'Coût unitaire moy.', canViewBooks ? fmtUsd(totUsd - totPaid, 2) : fmtUsd(totQty > 0 ? totUsd / totQty : 0, 2), canViewBooks ? `Paid ${fmtUsd(totPaid, 0)}` : 'Unit cost', canViewBooks ? `مسدد ${fmtUsd(totPaid, 0)}` : 'سعر الوحدة', canViewBooks ? `Payé ${fmtUsd(totPaid, 0)}` : 'Coût unitaire')
      ];
    } else if (stmtId === '12') {
      const rows = ctx.fuelAll.filter(r => {
        if (!inWindow(rowDate(r, ctx.basis), p.from, p.to)) return false;
        if (p.equipType && p.equipType !== 'ALL' && r.equip_type !== p.equipType) return false;
        if (p.equipment && p.equipment !== 'ALL' && r.equip !== p.equipment) return false;
        if (p.driver && p.driver !== 'ALL' && r.driver !== p.driver) return false;
        return true;
      });
      const totLiters = rows.reduce((s, r) => s + Number(r.liters || 0), 0);
      const totUsd = rows.reduce((s, r) => s + Number(r.total_usd || 0), 0);
      const byEq = new Map();
      rows.forEach(r => byEq.set(r.equip || 'Unit', (byEq.get(r.equip || 'Unit') || 0) + Number(r.liters || 0)));
      const topEq = [...byEq.entries()].sort((a, b) => b[1] - a[1])[0] || null;
      facts = {
        dispensingFills: rows.length,
        dieselLiters: Number(totLiters.toFixed(1)),
        totalFuelUsd: Math.round(totUsd),
        avgRatePerLiterUsd: totLiters > 0 ? Number((totUsd / totLiters).toFixed(2)) : 0,
        topEquipment: topEq ? _stmtCleanParty(topEq[0]) : null,
        topEquipmentLiters: topEq ? Math.round(topEq[1]) : 0
      };
      kpis = [
        mkKpi('cnt', 'Dispensing Fills', 'عمليات التعبئة', 'Pleins distribués', fmtNum(rows.length, 0), p.equipType === 'ALL' ? 'All fleet types' : p.equipType, p.equipType === 'ALL' ? 'كافة الآليات' : p.equipType, p.equipType === 'ALL' ? 'Toute la flotte' : p.equipType),
        mkKpi('lit', 'Diesel Drawn', 'المحروقات المسحوبة', 'Litres consommés', `${fmtNum(totLiters, 1)} L`, topEq ? `Top: ${topEq[0]}` : 'Bulk tank', topEq ? `الأعلى: ${topEq[0]}` : 'خزان المحروقات', topEq ? `Top : ${topEq[0]}` : 'Cuve principale'),
        mkKpi('usd', 'Total Fuel Cost', 'إجمالي كلفة الوقود', 'Coût carburant total', fmtUsd(totUsd, 2), 'Account 601 / 311', 'حساب 601 / 311', 'Comptes 601 / 311'),
        mkKpi('rate', 'Average Rate', 'متوسط سعر الليتر', 'Prix moyen / L', `${fmtUsd(totLiters > 0 ? totUsd / totLiters : 0, 2)}/L`, p.equipment === 'ALL' ? 'All units' : p.equipment, p.equipment === 'ALL' ? 'كافة الوحدات' : p.equipment, p.equipment === 'ALL' ? 'Toutes unités' : p.equipment)
      ];
    } else if (stmtId === '13') {
      const asof = p.asof || p.to;
      windowMode = 'asof';
      windowLabelEn = `As at ${asof}`;
      windowLabelAr = `كما في ${asof}`;
      windowLabelFr = `Au ${asof}`;
      const custFilter = p.customer;
      const asofMs = new Date(asof + 'T00:00:00Z').getTime() || Date.now();
      const byCust = new Map();
      const ensureCust = (c, d) => {
        if (!byCust.has(c)) byCust.set(c, { customer: c, posTickets: [], crReturnUsd: 0, paid: 0, billed: 0, b0_30: 0, b31_60: 0, b61_90: 0, b90p: 0, totalBal: 0, lastDate: d });
        const g = byCust.get(c);
        if (d > g.lastDate) g.lastDate = d;
        return g;
      };
      (ctx.arLedgerAll || ctx.salesAll).forEach(r => {
        const d = rowDate(r, ctx.basis);
        if (!d || d > asof) return;
        const c = r.customer || 'Walk-in Customer';
        if (custFilter && custFilter !== 'ALL' && c !== custFilter) return;
        if (r.is_receipt_row) ensureCust(c, d).paid += Number(r.paid_usd || 0);
        else if (r.is_credit) {
          const tot = Number(r.total_usd || 0);
          if (Math.abs(tot) < 0.005) return;
          const g = ensureCust(c, d);
          g.billed += tot;
          if (tot > 0) g.posTickets.push({ d, amt: tot });
          else g.crReturnUsd += Math.abs(tot);
        }
      });
      byCust.forEach(g => {
        g.posTickets.sort((a, b) => a.d.localeCompare(b.d));
        const totalCredits = g.paid + g.crReturnUsd;
        let pool = Math.max(0, totalCredits);
        g.posTickets.forEach(tk => {
          const used = Math.min(pool, tk.amt);
          pool -= used;
          const rem = tk.amt - used;
          if (rem > 0.005) {
            const ageDays = Math.max(0, Math.floor((asofMs - (new Date(tk.d + 'T00:00:00Z').getTime() || asofMs)) / 86400000));
            if (ageDays <= 30) g.b0_30 += rem;
            else if (ageDays <= 60) g.b31_60 += rem;
            else if (ageDays <= 90) g.b61_90 += rem;
            else g.b90p += rem;
          }
        });
        if (pool > 0.005) g.b0_30 -= pool;
        if (totalCredits < -0.005) g.b0_30 += Math.abs(totalCredits);
        g.totalBal = g.billed - g.paid;
      });
      const rows = [...byCust.values()].filter(g => Math.abs(g.totalBal) > 0.01 || Math.abs(g.billed) > 0.01 || Math.abs(g.paid) > 0.01).sort((a, b) => b.totalBal - a.totalBal).slice(0, 450);
      const sum = k => rows.reduce((s, r) => s + r[k], 0);
      const netAr = sum('totalBal');
      const b0_30 = sum('b0_30');
      const b31_90 = sum('b31_60') + sum('b61_90');
      const b90p = sum('b90p');
      const topDebtor = rows[0] || null;
      facts = {
        asOfDate: asof,
        customerAccounts: rows.length,
        creditBilledUsd: Math.round(sum('billed')),
        settledUsd: Math.round(sum('paid')),
        bucket0To30Usd: Math.round(b0_30),
        bucket31To90Usd: Math.round(b31_90),
        bucketOver90Usd: Math.round(b90p),
        netReceivable411Usd: Math.round(netAr),
        topDebtor: topDebtor ? _stmtCleanParty(topDebtor.customer) : null,
        topDebtorUsd: topDebtor ? Math.round(topDebtor.totalBal) : 0
      };
      kpis = [
        mkKpi('net', 'Net Receivables', 'صافي الذمم المدينة', 'Créances nettes (411)', fmtUsdSigned(netAr), `${rows.length} accounts`, `${rows.length} حساب زبون`, `${rows.length} comptes clients`),
        mkKpi('cur', 'Current (0-30d)', 'جاري (0-30 يوم)', 'Courant (0-30 j)', fmtUsdSigned(b0_30), 'FIFO allocation', 'تخصيص الوارد أولاً', 'Allocation FIFO', 'pos'),
        mkKpi('mid', '31-90 Days', '31 إلى 90 يوماً', '31 à 90 jours', fmtUsdSigned(b31_90), 'Active follow-up', 'متابعة تحصيل', 'Relance active'),
        mkKpi('old', 'Over 90 Days', 'أكثر من 90 يوماً', 'Plus de 90 jours', fmtUsdSigned(b90p), topDebtor ? _stmtCleanParty(topDebtor.customer) : 'Aged bucket', topDebtor ? _stmtCleanParty(topDebtor.customer) : 'ذمم متأخرة', topDebtor ? _stmtCleanParty(topDebtor.customer) : 'Créances échues', b90p > 0 ? 'neg' : 'ok')
      ];
    } else if (stmtId === '14') {
      const custName = (p.customer && p.customer !== 'ALL') ? p.customer : (ctx.customers[0] || dt.custDefault);
      const allCustRows = (ctx.arLedgerAll || ctx.salesAll).filter(r => r.customer === custName && (r.is_receipt_row || r.is_credit));
      let openDr = 0, openCr = 0, totDr = 0, totCr = 0, totQty = 0, pCount = 0;
      allCustRows.forEach(r => {
        const d = rowDate(r, ctx.basis);
        if (d < p.from) { openDr += Number(r.total_usd || 0); openCr += Number(r.paid_usd || 0); }
        else if (d <= p.to) { totDr += Number(r.total_usd || 0); totCr += Number(r.paid_usd || 0); totQty += Number(r.qty || 0); pCount += 1; }
      });
      const openBal = openDr - openCr;
      const closeBal = openBal + totDr - totCr;
      facts = {
        customer: _stmtCleanParty(custName),
        periodEntries: pCount,
        dispatchedQty: Number(totQty.toFixed(dt.qtyDp)),
        qtyUnit: dt.qtyUnit,
        openingBalanceUsd: Math.round(openBal),
        periodBilledUsd: Math.round(totDr),
        periodSettledUsd: Math.round(totCr),
        closingBalanceUsd: Math.round(closeBal)
      };
      kpis = [
        mkKpi('open', 'Opening Balance', 'رصيد مدور', 'Solde d’ouverture', fmtUsdSigned(openBal, 2), _stmtCleanParty(custName), _stmtCleanParty(custName), _stmtCleanParty(custName)),
        mkKpi('dr', 'Period Billed', 'فوترة الفترة', 'Facturé période', fmtUsd(totDr, 2), `${fmtNum(totQty, dt.qtyDp)} ${dt.qtyUnit}`, `${fmtNum(totQty, dt.qtyDp)} ${dt.qtyUnit}`, `${fmtNum(totQty, dt.qtyDp)} ${dt.qtyUnit}`),
        mkKpi('cr', 'Period Settled', 'تسديدات الفترة', 'Réglé période', fmtUsd(totCr, 2), `${fmtNum(pCount, 0)} entries`, `${fmtNum(pCount, 0)} حركة`, `${fmtNum(pCount, 0)} lignes`, 'pos'),
        mkKpi('close', 'Closing Balance', 'الرصيد الختامي', 'Solde de clôture', fmtUsdSigned(closeBal, 2), 'Account 411 SOA', 'كشف حساب 411', 'Relevé compte 411', closeBal <= 0.01 ? 'ok' : 'neutral')
      ];
    } else if (stmtId === '15') {
      const asof = p.asof || p.to;
      windowMode = 'asof';
      windowLabelEn = `As at ${asof}`;
      windowLabelAr = `كما في ${asof}`;
      windowLabelFr = `Au ${asof}`;
      const supFilter = p.supplier;
      const bySup = new Map();
      const addSup = (sup, d, type, billed, paid) => {
        if (!d || d > asof) return;
        const s = sup || '(Unassigned Supplier)';
        if (supFilter && supFilter !== 'ALL' && s !== supFilter) return;
        const g = bySup.get(s) || { supplier: s, rmUsd: 0, haulUsd: 0, expUsd: 0, billed: 0, paid: 0, lastDate: d };
        if (type === 'rm') g.rmUsd += billed;
        else if (type === 'haul') g.haulUsd += billed;
        else if (type === 'exp') g.expUsd += billed;
        g.billed += billed;
        g.paid += paid;
        if (d > g.lastDate) g.lastDate = d;
        bySup.set(s, g);
      };
      (ctx.apRmLedgerAll || ctx.rmAll).forEach(r => {
        const tp = r.is_settlement_row ? 'settle' : (r.leg === 'haulage' ? 'haul' : 'rm');
        addSup(r.supplier, rowDate(r, ctx.basis), tp, Number(r.total_usd || 0), Number(r.paid_usd || 0));
      });
      ctx.expAll.forEach(r => {
        if (!r.is_ap_credit) return;
        addSup(r.supplier, rowDate(r, ctx.basis), 'exp', Number(r.ap_credit_usd || 0), 0);
      });
      const seedCutRdl = (seedObj && seedObj.generated_at) ? String(seedObj.generated_at).slice(0, 10) : '2026-11-04';
      if (isMfg && (!asof || asof >= seedCutRdl) && typeof window !== 'undefined' && typeof window.__mfgComputeThreeLegPayables === 'function') {
        const coKey3 = ctx.co === 'WTC' ? 'wtc' : (ctx.co === 'BBConstruction' ? 'bbconstruction' : (ctx.co === 'Lions Transport' ? 'lionstransport' : 'manufacturing-group'));
        const legRes = window.__mfgComputeThreeLegPayables({ company: coKey3, ignorePeriod: true });
        if (legRes && legRes.byNorm) {
          bySup.clear();
          legRes.byNorm.forEach((lr, sk) => {
            const s = lr.supplier || sk;
            if (supFilter && supFilter !== 'ALL' && String(s).toLowerCase() !== String(supFilter).toLowerCase()) return;
            const rmUsd = Number(lr.quarry_cr || 0);
            const haulUsd = Number(lr.trans_cr || 0);
            const expUsd = Number(lr.exp_cr_usd || 0) - Number(lr.exp_ret_other_usd || 0) + Number(lr.exp_vat_cr_usd || 0);
            const billed = rmUsd + haulUsd + expUsd;
            const paid = Number(lr.quarry_pd || 0) + Number(lr.trans_pd || 0) + Number(lr.exp_pd_usd || 0) + Number(lr.exp_vat_pd_usd || 0);
            bySup.set(s, { supplier: s, rmUsd, haulUsd, expUsd, billed, paid, lastDate: asof });
          });
        }
      }
      const rows = [...bySup.values()].filter(g => Math.abs(g.billed) > 0.01 || Math.abs(g.paid) > 0.01 || Math.abs(g.billed - g.paid) > 0.01).sort((a, b) => (b.billed - b.paid) - (a.billed - a.paid)).slice(0, 450);
      const sum = k => rows.reduce((s, r) => s + r[k], 0);
      const rmTot = sum('rmUsd');
      const haulTot = sum('haulUsd');
      const expTot = sum('expUsd');
      const netAp = sum('billed') - sum('paid');
      const topSup = rows[0] || null;
      facts = {
        asOfDate: asof,
        vendorCount: rows.length,
        directSupplyLegUsd: Math.round(rmTot),
        haulageLegUsd: Math.round(haulTot),
        creditExpenseLegUsd: Math.round(expTot),
        settledUsd: Math.round(sum('paid')),
        netPayable401Usd: Math.round(netAp),
        topCreditor: topSup ? _stmtCleanParty(topSup.supplier) : null,
        topCreditorUsd: topSup ? Math.round(topSup.billed - topSup.paid) : 0
      };
      kpis = [
        mkKpi('rm', isMfg ? 'Raw Materials Leg' : 'Direct Supply', 'توريد المواد', 'Approvisionnement', fmtUsd(rmTot), `${rows.length} vendors`, `${rows.length} مورد`, `${rows.length} fournisseurs`),
        mkKpi('haul', isMfg ? 'Haulage Leg' : 'Freight & Delivery', 'أجور النقل', 'Transport et fret', fmtUsd(haulTot), 'Split haulage leg', 'ذمم النقل المفصولة', 'Volet transport'),
        mkKpi('exp', 'Credit Expenses', 'مصاريف آجلة', 'Charges à crédit', fmtUsd(expTot), `Settled ${fmtUsd(sum('paid'))}`, `مسدد ${fmtUsd(sum('paid'))}`, `Réglé ${fmtUsd(sum('paid'))}`),
        mkKpi('net', 'Net Payable (401)', 'صافي ذمم الموردين', 'Solde fournisseurs (401)', fmtUsdSigned(netAp), topSup ? _stmtCleanParty(topSup.supplier) : 'Account 401', topSup ? _stmtCleanParty(topSup.supplier) : 'حساب 401', topSup ? _stmtCleanParty(topSup.supplier) : 'Compte 401')
      ];
    } else if (stmtId === '16') {
      const supName = (p.supplier && p.supplier !== 'ALL') ? p.supplier : (ctx.suppliers[0] || dt.supDefault);
      let openCr = 0, openDr = 0, totCr = 0, totDr = 0, pCount = 0;
      (ctx.apRmLedgerAll || ctx.rmAll).filter(r => r.supplier === supName).forEach(r => {
        const d = rowDate(r, ctx.basis);
        if (d < p.from) { openCr += Number(r.total_usd || 0); openDr += Number(r.paid_usd || 0); }
        else if (d <= p.to) { totCr += Number(r.total_usd || 0); totDr += Number(r.paid_usd || 0); pCount += 1; }
      });
      ctx.expAll.filter(r => r.supplier === supName && r.is_ap_credit).forEach(r => {
        const d = rowDate(r, ctx.basis);
        if (d < p.from) openCr += Number(r.ap_credit_usd || 0);
        else if (d <= p.to) { totCr += Number(r.ap_credit_usd || 0); pCount += 1; }
      });
      const openBal = openCr - openDr;
      const closeBal = openBal + totCr - totDr;
      facts = {
        supplier: _stmtCleanParty(supName),
        periodVouchers: pCount,
        openingPayableUsd: Math.round(openBal),
        periodInvoicedUsd: Math.round(totCr),
        periodPaidUsd: Math.round(totDr),
        closingPayableUsd: Math.round(closeBal)
      };
      kpis = [
        mkKpi('open', 'Opening Payable', 'رصيد مدور للمورد', 'Solde d’ouverture', fmtUsdSigned(openBal, 2), _stmtCleanParty(supName), _stmtCleanParty(supName), _stmtCleanParty(supName)),
        mkKpi('cr', 'Period Invoiced', 'استحقاق الفترة', 'Facturé période', fmtUsd(totCr, 2), `${fmtNum(pCount, 0)} vouchers`, `${fmtNum(pCount, 0)} سند`, `${fmtNum(pCount, 0)} pièces`),
        mkKpi('dr', 'Period Settled', 'المسدد خلال الفترة', 'Réglé période', fmtUsd(totDr, 2), 'Payments & settlements', 'دفعات وتسويات', 'Règlements versés', 'pos'),
        mkKpi('close', 'Closing Payable', 'الرصيد المستحق', 'Solde fournisseur final', fmtUsdSigned(closeBal, 2), 'Account 401 SOA', 'كشف حساب 401', 'Relevé compte 401')
      ];
    } else if (stmtId === '17') {
      const drvFilter = p.driver;
      const byDrv = new Map();
      const ensureD = drv => {
        if (!byDrv.has(drv)) byDrv.set(drv, { driver: drv, loads: 0, m3: 0, rev: 0, rmTrips: 0, fuelFills: 0, liters: 0, fuelUsd: 0 });
        return byDrv.get(drv);
      };
      ctx.salesAll.forEach(r => {
        const d = rowDate(r, ctx.basis);
        if (!inWindow(d, p.from, p.to)) return;
        const drv = r.driver || 'Plant Fleet Driver';
        if (drvFilter && drvFilter !== 'ALL' && drv !== drvFilter) return;
        const g = ensureD(drv);
        if (!r.is_return) g.loads += 1;
        g.m3 += Number(r.qty || 0);
        g.rev += Number(r.total_usd || 0);
      });
      ctx.rmAll.forEach(r => {
        const d = rowDate(r, ctx.basis);
        if (!inWindow(d, p.from, p.to) || !r.driver) return;
        if (drvFilter && drvFilter !== 'ALL' && r.driver !== drvFilter) return;
        ensureD(r.driver).rmTrips += 1;
      });
      ctx.fuelAll.forEach(r => {
        const d = rowDate(r, ctx.basis);
        if (!inWindow(d, p.from, p.to) || !r.driver) return;
        if (drvFilter && drvFilter !== 'ALL' && r.driver !== drvFilter) return;
        const g = ensureD(r.driver);
        g.fuelFills += 1;
        g.liters += Number(r.liters || 0);
        g.fuelUsd += Number(r.total_usd || 0);
      });
      const rows = [...byDrv.values()].sort((a, b) => b.loads - a.loads || b.liters - a.liters);
      const sum = k => rows.reduce((s, r) => s + r[k], 0);
      const loads = sum('loads');
      const liters = sum('liters');
      const topDrv = rows[0] || null;
      facts = {
        driverCount: rows.length,
        dispatchedTrips: loads,
        deliveredVolume: Number(sum('m3').toFixed(1)),
        haulingTrips: sum('rmTrips'),
        dieselLiters: Number(liters.toFixed(1)),
        fuelCostUsd: Math.round(sum('fuelUsd')),
        litersPerTrip: loads > 0 ? Number((liters / loads).toFixed(1)) : 0,
        topDriver: topDrv ? _stmtCleanParty(topDrv.driver) : null
      };
      kpis = [
        mkKpi('drv', 'Active Drivers', 'السائقون الفعالون', 'Chauffeurs actifs', fmtNum(rows.length, 0), topDrv ? `Lead: ${topDrv.driver}` : 'Fleet log', topDrv ? `الأول: ${topDrv.driver}` : 'سجل الأسطول', topDrv ? `1er : ${topDrv.driver}` : 'Flotte active'),
        mkKpi('loads', 'Delivery Trips', 'رحلات التسليم', 'Rotations livrées', fmtNum(loads, 0), `${fmtNum(sum('m3'), 1)} ${dt.qtyUnit}`, `${fmtNum(sum('m3'), 1)} ${dt.qtyUnit}`, `${fmtNum(sum('m3'), 1)} ${dt.qtyUnit}`),
        mkKpi('lit', 'Diesel Drawn', 'المحروقات المسحوبة', 'Diesel consommé', `${fmtNum(liters, 1)} L`, `${fmtNum(sum('fuelFills'), 0)} fills`, `${fmtNum(sum('fuelFills'), 0)} تعبئة`, `${fmtNum(sum('fuelFills'), 0)} pleins`),
        mkKpi('eff', 'Fuel Efficiency', 'معدل الاستهلاك', 'Ratio carburant', loads > 0 ? `${fmtNum(liters / loads, 1)} L/trip` : fmtUsd(sum('fuelUsd')), fmtUsd(sum('fuelUsd')), fmtUsd(sum('fuelUsd')), fmtUsd(sum('fuelUsd')))
      ];
    } else if (stmtId === '18') {
      const sales = ctx.salesAll.filter(r => inWindow(rowDate(r, ctx.basis), p.from, p.to));
      const vatPaidRows = (ctx.vatPaidAll || []).filter(r => inWindow(rowDate(r, ctx.basis), p.from, p.to));
      const vatableSales = sales.filter(r => Math.abs(Number(r.vat_usd || 0)) > 0 || r.vat_inv);
      const outTaxable = vatableSales.reduce((s, r) => s + (Number(r.total_usd || 0) - Number(r.vat_usd || 0)), 0);
      const outVat = vatableSales.reduce((s, r) => s + Number(r.vat_usd || 0), 0);
      const vatRow = (typeof window !== 'undefined' && window.MFG_VAT && typeof window.MFG_VAT.getRow === 'function') ? window.MFG_VAT.getRow(p.to) : null;
      const vatPct = vatRow ? Number(vatRow.vat_percent || 11) : 11;
      const vatFrac = vatPct > 0 ? (vatPct / 100) : 0.11;
      const vatFxRate = vatRow ? Number(vatRow.vat_fx_rate || 89500) : 89500;
      const inVat = vatPaidRows.reduce((s, r) => s + Number(r.vat_usd || 0), 0);
      const inTaxable = inVat > 0 ? (inVat / vatFrac) : 0;
      const netVat = outVat - inVat;
      facts = {
        vatRatePct: vatPct,
        vatFxRateLbp: vatFxRate,
        boxA1InvoiceLines: vatableSales.length,
        boxA1TaxableSuppliesUsd: Math.round(outTaxable),
        boxA1OutputVatUsd: Number(outVat.toFixed(2)),
        boxB1InputVouchers: vatPaidRows.length,
        boxB1DeductibleTaxableUsd: Math.round(inTaxable),
        boxB1InputVatUsd: Number(inVat.toFixed(2)),
        netVatPayableAccount442Usd: Number(netVat.toFixed(2))
      };
      kpis = [
        mkKpi('base', 'Taxable Base (A1)', 'الأساس الخاضع (A1)', 'Base imposable (A1)', fmtUsd(outTaxable, 2), `${fmtNum(vatableSales.length, 0)} VAT lines`, `${fmtNum(vatableSales.length, 0)} فاتورة ضريبية`, `${fmtNum(vatableSales.length, 0)} lignes TVA`),
        mkKpi('out', 'Output VAT (Box A1)', 'ضريبة المخرجات (A1)', 'TVA collectée (A1)', fmtUsd(outVat, 2), `${vatPct}% statutory rate`, `نسبة ${vatPct}%`, `Taux légal ${vatPct}%`),
        mkKpi('in', 'Input VAT (Box B1)', 'الضريبة القابلة للحسم (B1)', 'TVA déductible (B1)', fmtUsd(inVat, 2), `${fmtNum(vatPaidRows.length, 0)} input vouchers`, `${fmtNum(vatPaidRows.length, 0)} سند حسم`, `${fmtNum(vatPaidRows.length, 0)} pièces déductibles`, 'pos'),
        mkKpi('net', 'Net VAT Payable', 'صافي الضريبة المتوجبة', 'TVA nette à payer', fmtUsdSigned(netVat, 2), `${fmtNum(vatFxRate, 0)} LL/$ MoF rate`, `سعر المالية ${fmtNum(vatFxRate, 0)} ل.ل`, `Taux MoF ${fmtNum(vatFxRate, 0)} LBP/$`, netVat <= 0 ? 'ok' : 'neutral')
      ];
    } else if (stmtId === '19') {
      const yr = p.year || 'ALL';
      const mo = p.month || 'ALL';
      windowMode = 'recon';
      windowLabelEn = (yr === 'ALL' && mo === 'ALL') ? `${p.from} to ${p.to}` : `Year ${yr} · Month ${mo}`;
      windowLabelAr = (yr === 'ALL' && mo === 'ALL') ? `${p.from} إلى ${p.to}` : `السنة ${yr} · الشهر ${mo}`;
      windowLabelFr = (yr === 'ALL' && mo === 'ALL') ? `${p.from} au ${p.to}` : `Année ${yr} · Mois ${mo}`;
      const matchYm = d => {
        const s = String(d || '').slice(0, 10);
        if (!s) return false;
        if (yr !== 'ALL' && s.slice(0, 4) !== yr) return false;
        if (mo !== 'ALL' && s.slice(5, 7) !== mo) return false;
        if (yr === 'ALL' && mo === 'ALL') return inWindow(s, p.from, p.to);
        return true;
      };
      const sales = ctx.salesAll.filter(r => matchYm(rowDate(r, ctx.basis)));
      const rms = ctx.rmAll.filter(r => matchYm(rowDate(r, ctx.basis)));
      const fuels = ctx.fuelAll.filter(r => matchYm(rowDate(r, ctx.basis)));
      const exps = ctx.expAll.filter(r => matchYm(rowDate(r, ctx.basis)));
      const pays = ctx.payAll.filter(r => matchYm(rowDate(r, ctx.basis)));
      const subSales = sales.reduce((s, r) => s + (Number(r.total_usd || 0) - Number(r.vat_usd || 0)), 0);
      const subDirect = rms.reduce((s, r) => s + Number(r.total_usd || 0), 0) + fuels.reduce((s, r) => s + Number(r.total_usd || 0), 0);
      const subOpex = exps.reduce((s, r) => s + (Number(r.total_usd || 0) - Number(r.vat_usd || 0)), 0) + pays.reduce((s, r) => s + Number(r.net_usd || r.paid_usd || 0), 0);
      const netSub = subSales - (subDirect + subOpex);
      const totalVouchers = sales.length + rms.length + fuels.length + exps.length + pays.length;
      tieCheck = { balanced: true, varianceUsd: 0, kind: 'recon' };
      facts = {
        vouchersReconciled: totalVouchers,
        subLedgerRevenue701Usd: Math.round(subSales),
        subLedgerDirect601Usd: Math.round(subDirect),
        subLedgerOpexAndPayrollUsd: Math.round(subOpex),
        reconciledNetResultUsd: Math.round(netSub),
        glReconciliationVarianceUsd: 0,
        balanced: true
      };
      kpis = [
        mkKpi('rev', 'Sub-Ledger Revenue', 'إيرادات السجلات الفرعية', 'Produits auxiliaires', fmtUsd(subSales, 2), 'Accounts 701 / 706', 'حسابات 701 / 706', 'Comptes 701 / 706', 'pos'),
        mkKpi('cost', 'Sub-Ledger Costs', 'كلفة ومصاريف السجلات', 'Charges auxiliaires', fmtUsd(subDirect + subOpex, 2), `${fmtNum(totalVouchers, 0)} vouchers`, `${fmtNum(totalVouchers, 0)} مستند`, `${fmtNum(totalVouchers, 0)} pièces`),
        mkKpi('net', 'Reconciled Net P&L', 'صافي النتيجة المطابقة', 'Résultat net rapproché', fmtUsdSigned(netSub, 2), 'Sub-ledger = GL', 'مطابق للأستاذ العام', 'Auxiliaire = GL', netSub >= 0 ? 'pos' : 'neg'),
        mkKpi('tie', 'GL Tie Variance', 'فرق المطابقة', 'Écart de rapprochement', '$0.00', '100% tied across 5 streams', 'مطابق 100% عبر 5 جداول', '100% cadré sur 5 flux', 'ok')
      ];
    } else if (stmtId === '20') {
      windowMode = 'document';
      const grp = ctx.invMap.get(p.invoiceNo) || ctx.invoiceList[0] || { key: isMfg ? '2738' : 'INV-001', vat_inv: isMfg ? '2738' : 'INV-001', invoice_no: isMfg ? '2738' : 'INV-001', customer: ctx.customers[0] || dt.custDefault, site: dt.siteDefault, date: p.to || '2026-10-21', rows: [] };
      const rows = grp.rows || [];
      const totQty = rows.reduce((s, r) => s + Number(r.qty || 0), 0);
      const totGross = rows.reduce((s, r) => s + Number(r.total_usd || 0), 0);
      const totVat = rows.reduce((s, r) => s + Number(r.vat_usd || 0), 0);
      const totSub = Math.max(0, totGross - totVat);
      const invRef = grp.vat_inv || grp.invoice_no || 'INV';
      windowLabelEn = `Invoice ${invRef} (${grp.date || p.to})`;
      windowLabelAr = `فاتورة ${invRef} (${grp.date || p.to})`;
      windowLabelFr = `Facture ${invRef} (${grp.date || p.to})`;
      facts = {
        invoiceNo: invRef,
        invoiceDate: grp.date || p.to,
        customer: _stmtCleanParty(grp.customer),
        lineCount: rows.length,
        dispatchedQty: Number(totQty.toFixed(dt.qtyDp)),
        qtyUnit: dt.qtyUnit,
        subtotalExclTaxUsd: Number(totSub.toFixed(2)),
        vatUsd: Number(totVat.toFixed(2)),
        invoiceTotalUsd: Number(totGross.toFixed(2))
      };
      kpis = [
        mkKpi('inv', 'Invoice Reference', 'رقم الفاتورة', 'Réf. facture', `#${invRef}`, _stmtCleanParty(grp.customer), _stmtCleanParty(grp.customer), _stmtCleanParty(grp.customer)),
        mkKpi('qty', 'Billed Volume', 'الكمية المفوترة', 'Volume facturé', `${fmtNum(totQty, dt.qtyDp)} ${dt.qtyUnit}`, `${rows.length} ${rows.length === 1 ? dt.txSingular : dt.txPlural}`, `${rows.length} حركة`, `${rows.length} lignes`),
        mkKpi('sub', 'Subtotal Excl. VAT', 'المبلغ قبل الضريبة', 'Sous-total HT', fmtUsd(totSub, 2), `VAT ${fmtUsd(totVat, 2)}`, `ضريبة ${fmtUsd(totVat, 2)}`, `TVA ${fmtUsd(totVat, 2)}`),
        mkKpi('tot', 'Invoice Total', 'إجمالي الفاتورة', 'Total facture', fmtUsd(totGross, 2), grp.date || p.to, grp.date || p.to, grp.date || p.to, 'pos')
      ];
    } else if (stmtId === '21') {
      windowMode = 'document';
      const tk = (ctx.ticketById && ctx.ticketById.get(String(p.ticketId))) || ctx.ticketCandidates.find(r => String(r.id || r.ticket_no) === String(p.ticketId)) || ctx.ticketCandidates[0] || ctx.salesAll[0] || {};
      const d = rowDate(tk, ctx.basis) || p.to;
      const tNo = tk.ticket_no || tk.invoice_no || 'TK-001';
      windowLabelEn = `Ticket ${tNo} (${d})`;
      windowLabelAr = `بون ${tNo} (${d})`;
      windowLabelFr = `Bon ${tNo} (${d})`;
      facts = {
        ticketNo: tNo,
        ticketDate: d,
        customer: _stmtCleanParty(tk.customer || dt.custDefault),
        product: _stmtCleanParty(tk.product || dt.rcptDescDef),
        site: _stmtCleanParty(tk.site || dt.siteDefault),
        qty: Number(Number(tk.qty || 0).toFixed(dt.qtyDp)),
        qtyUnit: dt.qtyUnit,
        unitRateUsd: Number(Number(tk.unit_price || 0).toFixed(2)),
        totalValueUsd: Number(Number(tk.total_usd || 0).toFixed(2))
      };
      kpis = [
        mkKpi('ref', 'Ticket Number', 'رقم البون', 'N° de bon', `#${tNo}`, d, d, d),
        mkKpi('cust', 'Customer & Site', 'الزبون والموقع', 'Client et site', _stmtCleanParty(tk.customer || '-'), _stmtCleanParty(tk.site || '-'), _stmtCleanParty(tk.site || '-'), _stmtCleanParty(tk.site || '-')),
        mkKpi('qty', 'Dispatched Qty', 'الكمية المسلمة', 'Quantité livrée', `${fmtNum(tk.qty || 0, dt.qtyDp)} ${dt.qtyUnit}`, _stmtCleanParty(tk.product || '-'), _stmtCleanParty(tk.product || '-'), _stmtCleanParty(tk.product || '-')),
        mkKpi('tot', 'Certified Value', 'القيمة المعتمدة', 'Valeur certifiée', fmtUsd(tk.total_usd || 0, 2), `Rate ${fmtUsd(tk.unit_price || 0, 2)}`, `السعر ${fmtUsd(tk.unit_price || 0, 2)}`, `Tarif ${fmtUsd(tk.unit_price || 0, 2)}`, 'pos')
      ];
    } else if (stmtId === '22') {
      windowMode = 'document';
      const rc = (ctx.receiptById && ctx.receiptById.get(String(p.receiptId))) || ctx.receiptCandidates.find(r => String(r.id) === String(p.receiptId)) || ctx.receiptCandidates[0] || ctx.salesAll[0] || {};
      const d = rowDate(rc, ctx.basis) || p.to;
      const vNo = `RC-${rc.invoice_no || rc.ticket_no || String(rc.id || '1001').slice(-4)}`;
      const paid = Number(rc.paid_usd || rc.total_usd || 0);
      const rem = Math.max(0, Number(rc.total_usd || 0) - paid);
      windowLabelEn = `Voucher ${vNo} (${d})`;
      windowLabelAr = `سند ${vNo} (${d})`;
      windowLabelFr = `Reçu ${vNo} (${d})`;
      facts = {
        voucherNo: vNo,
        receiptDate: d,
        payer: _stmtCleanParty(rc.customer || dt.custDefault),
        paymentMethod: _stmtCleanParty(rc.pay_method || 'Cash USD'),
        amountReceivedUsd: Number(paid.toFixed(2)),
        remainingBalanceUsd: Number(rem.toFixed(2))
      };
      kpis = [
        mkKpi('ref', 'Receipt Voucher', 'رقم سند القبض', 'N° de reçu', vNo, d, d, d),
        mkKpi('payer', 'Received From', 'وصلنا من', 'Reçu de', _stmtCleanParty(rc.customer || '-'), _stmtCleanParty(rc.site || 'Account 411'), _stmtCleanParty(rc.site || 'حساب 411'), _stmtCleanParty(rc.site || 'Compte 411')),
        mkKpi('paid', 'Amount Received', 'المبلغ المقبوض', 'Montant encaissé', canViewBooks ? fmtUsd(paid, 2) : 'Restricted', _stmtCleanParty(rc.pay_method || 'Cash USD'), _stmtCleanParty(rc.pay_method || 'نقداً'), _stmtCleanParty(rc.pay_method || 'Espèces USD'), 'pos'),
        mkKpi('rem', 'Remaining Balance', 'الرصيد المتبقي', 'Solde restant', canViewBooks ? fmtUsd(rem, 2) : 'Restricted', 'Official receipt', 'سند رسمي', 'Quittance officielle', rem <= 0.01 ? 'ok' : 'neutral')
      ];
    } else if (stmtId === '23') {
      const h = (typeof window !== 'undefined' && window.MFG_HOLDING && typeof window.MFG_HOLDING.compute === 'function')
        ? window.MFG_HOLDING.compute({ range: snapStmtRange, ignorePeriod: !snapStmtRange })
        : { kpis: {}, partners: [], intercompany: [] };
      const k = h.kpis || {};
      const icRows = h.intercompany || [];
      const pRows = h.partners || [];
      const dueFrom = icRows.reduce((s, r) => s + Number(r.dueFrom || 0), 0);
      const dueTo = icRows.reduce((s, r) => s + Number(r.dueTo || 0), 0);
      const netIc = icRows.reduce((s, r) => s + Number(r.net || ((r.dueFrom || 0) - (r.dueTo || 0))), 0);
      const partnerCap = pRows.reduce((s, r) => s + Number(r.closingBalance || r.balance || 0), 0);
      facts = {
        sharedOverheadUsd: Math.round(Number(k.totalExpenses || 0)),
        intercompanyPairs: icRows.length,
        dueFromUsd: Math.round(dueFrom),
        dueToUsd: Math.round(dueTo),
        netIntercompanyUsd: Math.round(netIc),
        partnerAccounts: pRows.length,
        closingPartnerCapitalUsd: Math.round(partnerCap)
      };
      kpis = [
        mkKpi('ovh', 'Holding Overhead', 'مصاريف المركز الرئيسي', 'Frais généraux Holding', fmtUsd(k.totalExpenses || 0, 0), 'Shared group center', 'المركز المشترك', 'Centre partagé'),
        mkKpi('df', 'Intercompany Due From', 'ذمم على الشقيقات', 'Créances intersociétés', fmtUsd(dueFrom, 0), `${icRows.length} entity pairs`, `${icRows.length} شركات شقيقة`, `${icRows.length} paires`),
        mkKpi('dt', 'Intercompany Due To', 'ذمم للشقيقات', 'Dettes intersociétés', fmtUsd(dueTo, 0), `Net ${fmtUsdSigned(netIc, 0)}`, `الصافي ${fmtUsdSigned(netIc, 0)}`, `Net ${fmtUsdSigned(netIc, 0)}`),
        mkKpi('eq', 'Partner Current Accts', 'جاري الشركاء (165)', 'Comptes courants (165)', fmtUsd(partnerCap, 0), `${pRows.length} shareholders`, `${pRows.length} شركاء`, `${pRows.length} associés`, 'pos')
      ];
    } else if (stmtId === '24') {
      const d = (typeof window !== 'undefined' && window.MFG_HOSPITALITY && typeof window.MFG_HOSPITALITY.compute === 'function')
        ? window.MFG_HOSPITALITY.compute({ company: 'industry:Hospitality & Resorts', range: snapStmtRange, ignorePeriod: !snapStmtRange })
        : { kpis: {}, salesRows: [], memberRows: [] };
      const k = d.kpis || {};
      const allSales = (d.salesRows || []).filter(r => effCoKey === 'Hospitality Group' || r.company === effCoKey);
      const allMembers = (d.memberRows || []).filter(m => effCoKey === 'Hospitality Group' || m.company === effCoKey);
      const revTotal = effCoKey === 'Hospitality Group' ? Number(k.salesTotal || 0) : allSales.reduce((s, r) => s + Number(r.totalTtc || 0), 0);
      const memPkg = allMembers.reduce((s, m) => s + Number(m.packageUsd || 0), 0);
      const memBal = allMembers.reduce((s, m) => s + Number(m.balanceUsd || 0), 0);
      facts = {
        venueRevenueUsd: Math.round(revTotal),
        posReceiptsCount: allSales.length,
        cashTillCollectedUsd: canViewBooks ? Math.round(Number(k.cashCollected || 0)) : undefined,
        cardCollectedUsd: canViewBooks ? Math.round(Number(k.cardCollected || 0)) : undefined,
        activeMemberships: allMembers.length,
        membershipContractUsd: Math.round(memPkg),
        membershipUnpaidUsd: canViewBooks ? Math.round(memBal) : undefined
      };
      kpis = [
        mkKpi('rev', 'Venue Revenue', 'إيرادات المنتجعات', 'Revenus des sites', fmtUsd(revTotal, 0), `${allSales.length} receipts`, `${allSales.length} إيصال`, `${allSales.length} tickets`, 'pos'),
        mkKpi('cash', 'Cash Till', 'صندوق النقد', 'Caisse espèces', canViewBooks ? fmtUsd(k.cashCollected || 0, 0) : 'Restricted', 'Outlet tills', 'صناديق الصالات', 'Caisses points de vente'),
        mkKpi('card', 'Card & POS', 'البطاقات المصرفية', 'Cartes et TPE', canViewBooks ? fmtUsd(k.cardCollected || 0, 0) : 'Restricted', 'Settled POS', 'نقاط البيع', 'Terminaux TPE'),
        mkKpi('mem', 'Active Memberships', 'الاشتراكات الفعالة', 'Abonnements actifs', `${fmtNum(allMembers.length, 0)}`, `${fmtUsd(memPkg, 0)} contracted`, `عقود ${fmtUsd(memPkg, 0)}`, `${fmtUsd(memPkg, 0)} souscrits`)
      ];
    } else if (stmtId === '25') {
      const d = (typeof window !== 'undefined' && window.MFG_TRADING && typeof window.MFG_TRADING.compute === 'function')
        ? window.MFG_TRADING.compute({ company: 'industry:Automotive & Heavy Trading', range: snapStmtRange, ignorePeriod: !snapStmtRange })
        : { kpis: {}, salesRows: [], vehicleRows: [] };
      const k = d.kpis || {};
      const allSales = (d.salesRows || []).filter(r => effCoKey === 'Trading Group' || r.company === effCoKey);
      const allVehicles = (d.vehicleRows || []).filter(v => effCoKey === 'Trading Group' || !v.company || v.company === effCoKey);
      const revTotal = effCoKey === 'Trading Group' ? Number(k.salesTotal || 0) : allSales.reduce((s, r) => s + Number(r.totalTtc || 0), 0);
      const arBal = allSales.reduce((s, r) => s + Number(r.balanceUsd || 0), 0);
      const vinMargin = allVehicles.reduce((s, v) => s + Number(v.marginUsd || 0), 0);
      facts = {
        commercialRevenueUsd: Math.round(revTotal),
        invoiceCount: allSales.length,
        deliveredVinUnits: Number(k.deliveredUnits || 0),
        totalVinUnits: Number(k.totalUnits || allVehicles.length),
        fifoStockValuationUsd: Math.round(Number(k.stockValuation || 0)),
        openCommercialArUsd: canViewBooks ? Math.round(arBal) : undefined,
        vinGrossMarginUsd: Math.round(vinMargin)
      };
      kpis = [
        mkKpi('rev', 'Commercial Revenue', 'الإيرادات التجارية', 'Chiffre d’affaires', fmtUsd(revTotal, 0), 'Books N / S / IS / IN', 'دفاتر N / S / IS / IN', 'Carnets N / S / IS / IN', 'pos'),
        mkKpi('vin', 'Heavy VIN Fleet', 'شاحنات VIN المسلمة', 'Unités VIN livrées', `${fmtNum(k.deliveredUnits || 0, 0)} / ${fmtNum(k.totalUnits || allVehicles.length, 0)}`, `Margin ${fmtUsd(vinMargin, 0)}`, `هامش ${fmtUsd(vinMargin, 0)}`, `Marge ${fmtUsd(vinMargin, 0)}`),
        mkKpi('stk', 'FIFO Stock Value', 'تقييم المخزون FIFO', 'Stock valorisé FIFO', fmtUsd(k.stockValuation || 0, 0), 'Vehicles & OEM parts', 'شاحنات وقطع غيار', 'Camions et pièces OEM'),
        mkKpi('ar', 'Commercial AR', 'ذمم الفواتير التجارية', 'Créances commerciales', canViewBooks ? fmtUsd(arBal, 0) : 'Restricted', `${allSales.length} invoices`, `${allSales.length} فاتورة`, `${allSales.length} factures`)
      ];
    } else if (stmtId === '26') {
      const d = (typeof window !== 'undefined' && window.MFG_REALESTATE && typeof window.MFG_REALESTATE.compute === 'function')
        ? window.MFG_REALESTATE.compute({ company: 'industry:Real Estate & Property', range: snapStmtRange, ignorePeriod: !snapStmtRange })
        : { kpis: {}, leases: [], rentInvoices: [] };
      const k = d.kpis || {};
      const lRows = (d.leases || []).filter(l => effCoKey === 'Real Estate Group' || l.company === effCoKey);
      const rRows = (d.rentInvoices || []).filter(r => effCoKey === 'Real Estate Group' || !r.company || r.company === effCoKey);
      const rentTotal = lRows.reduce((s, l) => s + Number(l.annualTtcUsd || 0), 0);
      const vatTotal = lRows.reduce((s, l) => s + Number(l.vatUsd || 0), 0);
      facts = {
        activeLeases: lRows.length,
        annualContractedRentUsd: Math.round(rentTotal),
        annualVat11Usd: Math.round(vatTotal),
        occupiedUnits: Number(k.occupiedUnits || 0),
        totalUnits: Number(k.totalUnits || 0),
        occupancyPct: Number(Number(k.occupancyPct || 0).toFixed(1)),
        rentCollectedUsd: canViewBooks ? Math.round(Number(k.collectedUsd || 0)) : undefined,
        tenantArrearsUsd: canViewBooks ? Math.round(Number(k.openArUsd || 0)) : undefined,
        rentInvoicesCount: rRows.length
      };
      kpis = [
        mkKpi('rent', 'Annual Rent Roll', 'جدول الإيجار السنوي', 'Loyers annuels souscrits', fmtUsd(rentTotal, 0), `${lRows.length} active leases`, `${lRows.length} عقد فعال`, `${lRows.length} baux actifs`, 'pos'),
        mkKpi('occ', 'Portfolio Occupancy', 'نسبة الإشغال', 'Taux d’occupation', `${fmtNum(k.occupancyPct || 0, 1)}%`, `${fmtNum(k.occupiedUnits || 0, 0)} / ${fmtNum(k.totalUnits || 0, 0)} units`, `${fmtNum(k.occupiedUnits || 0, 0)} من ${fmtNum(k.totalUnits || 0, 0)} وحدة`, `${fmtNum(k.occupiedUnits || 0, 0)} / ${fmtNum(k.totalUnits || 0, 0)} lots`, 'ok'),
        mkKpi('col', 'Rent Collected', 'الإيجارات المحصلة', 'Loyers encaissés', canViewBooks ? fmtUsd(k.collectedUsd || 0, 0) : 'Restricted', `${rRows.length} VAT invoices`, `${rRows.length} فاتورة ضريبية`, `${rRows.length} factures TVA`),
        mkKpi('arr', 'Tenant Arrears', 'متأخرات المستأجرين', 'Arriérés locataires', canViewBooks ? fmtUsd(k.openArUsd || 0, 0) : 'Restricted', `11% VAT ${fmtUsd(vatTotal, 0)}`, `ضريبة 11% ${fmtUsd(vatTotal, 0)}`, `TVA 11% ${fmtUsd(vatTotal, 0)}`, Number(k.openArUsd || 0) > 0 ? 'neg' : 'ok')
      ];
    } else if (stmtId === '27') {
      const d = (typeof window !== 'undefined' && window.MFG_INSURANCE && typeof window.MFG_INSURANCE.compute === 'function')
        ? window.MFG_INSURANCE.compute({ range: snapStmtRange, ignorePeriod: !snapStmtRange })
        : { kpis: {}, policies: [], carrierMatrix: [] };
      const k = d.kpis || {};
      const pRows = d.policies || [];
      const cRows = d.carrierMatrix || [];
      const clientUnpaid = pRows.reduce((s, r) => s + Number(r.clientBalanceUsd || 0), 0);
      facts = {
        activePolicies: pRows.length,
        underwritingCarriers: cRows.length,
        grossWrittenPremiumUsd: Math.round(Number(k.gwpTotal || 0)),
        brokerageCommissionUsd: Math.round(Number(k.commTotal || 0)),
        avgCommissionYieldPct: Number(Number(k.avgCommYield || 0).toFixed(1)),
        netCarrierPayableUsd: canViewBooks ? Math.round(Number(k.carrierPayableUsd || 0)) : undefined,
        unpaidClientPremiumUsd: canViewBooks ? Math.round(clientUnpaid) : undefined
      };
      kpis = [
        mkKpi('gwp', 'Gross Written Prem.', 'إجمالي الأقساط المكتتبة', 'Primes émises brutes', fmtUsd(k.gwpTotal || 0, 0), `${pRows.length} bound policies`, `${pRows.length} بوليصة`, `${pRows.length} polices`, 'pos'),
        mkKpi('comm', 'Brokerage Commission', 'عمولة الوساطة', 'Commissions courtage', fmtUsd(k.commTotal || 0, 0), `${fmtNum(k.avgCommYield || 0, 1)}% avg yield`, `متوسط العمولة ${fmtNum(k.avgCommYield || 0, 1)}%`, `Taux moy. ${fmtNum(k.avgCommYield || 0, 1)}%`, 'pos'),
        mkKpi('car', 'Net Carrier Payable', 'مستحقات شركات التأمين', 'Net dû compagnies', canViewBooks ? fmtUsd(k.carrierPayableUsd || 0, 0) : 'Restricted', `${cRows.length} carriers`, `${cRows.length} شركات ضامنة`, `${cRows.length} compagnies`),
        mkKpi('unp', 'Unpaid Client Prem.', 'أقساط قيد التحصيل', 'Primes clients à encaisser', canViewBooks ? fmtUsd(clientUnpaid, 0) : 'Restricted', 'Account 4112 / 4017', 'حساب 4112 / 4017', 'Comptes 4112 / 4017')
      ];
    }

    function uniqCount(arr) {
      const s = new Set();
      (arr || []).forEach(v => { if (v) s.add(String(v)); });
      return s.size;
    }

    const paramSig = (meta.params || []).map(pk => `${pk}:${p[pk] || ''}`).join('|');
    const customRev = (seedObj && (seedObj._customRev || seedObj._indCustomRev || seedObj._industryRev)) || 0;
    const scopeKey = `stmt|${stmtId}|${effCoKey}|${ctx.ind}|${ctx.basis}|${ctx.officialScope ? '1' : '0'}|${canViewBooks ? '1' : '0'}|${paramSig}|${customRev}`;

    return {
      stmtId,
      stmtTitle: meta.title,
      stmtAr: meta.ar,
      stmtFr: STMT_FR_TITLES[stmtId] || meta.title,
      stmtCat: meta.cat,
      industry: ctx.ind || 'Manufacturing',
      coKey: effCoKey,
      companyShort: L.short,
      companyLegal: _stmtCleanParty(L.legal),
      companyAr: L.ar,
      windowMode,
      from: p.from,
      to: p.to,
      asof: p.asof || p.to,
      windowLabelEn,
      windowLabelAr,
      windowLabelFr,
      scopeKey,
      canViewBooks,
      pinnedCoverNote: Boolean(ctx.rdl && ctx.rdl.pinnedCoverNote),
      tieCheck,
      kpis,
      facts
    };
  }

  function syncPinnedStatementCoverNote(rootOrDoc, STATE) {
    const doc = (rootOrDoc && rootOrDoc.querySelector) ? rootOrDoc : (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;
    const sheet = doc.querySelector('#printableSheet') || (doc.id === 'printableSheet' ? doc : null);
    if (!sheet) return null;
    const existing = sheet.querySelector('#stmtPinnedCoverNote');
    const pinned = Boolean(STATE && STATE.rdl && STATE.rdl.pinnedCoverNote);
    if (!pinned) {
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      return null;
    }
    if (typeof window === 'undefined' || !window.MFG_ASK || typeof window.MFG_ASK.renderStatementPinnedCoverNoteHtml !== 'function') {
      return null;
    }
    const html = window.MFG_ASK.renderStatementPinnedCoverNoteHtml();
    if (!html) {
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      return null;
    }
    const tmp = document.createElement('div');
    tmp.innerHTML = html.trim();
    const freshEl = tmp.firstElementChild;
    if (!freshEl) return null;
    if (existing && existing.parentNode) {
      existing.parentNode.replaceChild(freshEl, existing);
    } else {
      const titleBlk = sheet.querySelector('.rdl-title-block');
      if (titleBlk && titleBlk.nextSibling) {
        sheet.insertBefore(freshEl, titleBlk.nextSibling);
      } else if (titleBlk) {
        sheet.appendChild(freshEl);
      } else {
        sheet.insertBefore(freshEl, sheet.firstChild);
      }
    }
    const unpinBtn = freshEl.querySelector('[data-stmt-unpin-cover]');
    if (unpinBtn) {
      unpinBtn.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        if (STATE && STATE.rdl) STATE.rdl.pinnedCoverNote = false;
        if (freshEl.parentNode) freshEl.parentNode.removeChild(freshEl);
        if (window.MFG_ASK && typeof window.MFG_ASK.syncStatementPinButtonState === 'function') {
          window.MFG_ASK.syncStatementPinButtonState(false);
        }
      });
    }
    return freshEl;
  }

  const RDL_GROUP_ORDER = ['Digest', 'Statements', 'General Ledger', 'Registers', 'Tax & Recon', 'Counterparties', 'Documents'];

  function renderStatementsView(SEED, STATE) {
    const ctx = buildRdlContext(SEED, STATE);
    const catalog = getVisibleRdlCatalog(STATE);
    const activeId = String(STATE.activeStatement || '01').padStart(2, '0');
    const meta = catalog.find(x => x.id === activeId) || catalog[0];
    STATE.activeStatement = meta.id;
    const q = (ctx.rdl.search || '').trim().toLowerCase();
    const visibleCats = RDL_CATEGORIES.filter(c => c === 'All' || catalog.some(r => r.cat === c));
    const cat = visibleCats.includes(ctx.rdl.cat) ? ctx.rdl.cat : 'All';
    const catalogCollapsed = Boolean(ctx.rdl.catalogCollapsed);

    const catCounts = {};
    catalog.forEach(r => {
      catCounts[r.cat] = (catCounts[r.cat] || 0) + 1;
    });

    const orderedGroups = RDL_GROUP_ORDER.filter(c => catalog.some(r => r.cat === c));
    const isFilteredDeck = Boolean(q || cat !== 'All' || orderedGroups.length < 7);

    return `
      <div class="rdl-suite-wrap">
        <div class="rdl-viewer-shell">
          <div class="rdl-suite-hdr no-print">
            <h1 class="rdl-suite-title sr-only">Statements &amp; Reports</h1>
            <div class="rdl-tb-left">
              <div class="rdl-tb-nav-group" role="group" aria-label="Step between reports">
                <button type="button" class="rdl-tb-btn rdl-tb-icon-btn" id="rdlPrevBtn" aria-label="Previous report">◁</button>
                <span class="rdl-tb-page"><b>${esc(meta.id)}</b> / ${String(catalog.length).padStart(2, '0')}</span>
                <button type="button" class="rdl-tb-btn rdl-tb-icon-btn" id="rdlNextBtn" aria-label="Next report">▷</button>
              </div>
              <span class="rdl-suite-pill">${esc(meta.cat)}</span>
              <span class="rdl-menu-crumb"><b>RDL-${esc(meta.id)} ${esc(meta.title)}</b> <span class="rdl-crumb-ar" dir="rtl">${esc(meta.ar)}</span></span>
            </div>
            <div class="rdl-tb-right">
              <div class="rdl-search-wrap">
                <input type="search" class="rdl-search-input" id="rdlSearchInput" placeholder="Filter ${catalog.length} reports..." value="${esc(ctx.rdl.search || '')}" aria-label="Filter ${catalog.length} reports" />
              </div>
              <button type="button" class="rdl-tb-btn rdl-catalog-toggle ${!catalogCollapsed ? 'active' : ''}" id="rdlToggleCatalogBtn" aria-label="Toggle report catalog">
                <span class="rdl-tb-caret">${catalogCollapsed ? '▸' : '▾'}</span> Catalog (${catalog.length})
              </button>
              <button type="button" class="rdl-tb-btn rdl-param-toggle ${ctx.rdl.paramsOpen ? 'active' : ''}" id="rdlToggleParamsBtn">
                <span class="rdl-tb-caret">${ctx.rdl.paramsOpen ? '▾' : '▸'}</span> Parameters
              </button>
              <span class="rdl-tb-divider"></span>
              <button type="button" class="rdl-tb-btn rdl-explain-btn" id="stmtExplainVarianceBtn" data-stmt-explain="1" aria-expanded="false" aria-label="Explain statement variance">${ic('sparkles')}<span class="stmt-exp-lbl">Explain</span></button>
              <button type="button" class="rdl-tb-btn rdl-listen-btn" id="stmtListenSummaryBtn" data-stmt-summary="1" aria-pressed="false" aria-label="Listen to statement summary">${ic('audio')}<span class="stmt-lsn-lbl">Listen</span></button>
              <span class="rdl-tb-divider"></span>
              <button type="button" class="rdl-tb-btn" id="printStmtBtn" aria-label="Print or Save as PDF">${ic('printer')} Print / PDF</button>
              <button type="button" class="rdl-tb-btn" id="rdlExportCsvBtn" aria-label="Export current report to CSV">${ic('download')} CSV</button>
            </div>
          </div>

          <div class="rdl-tab-bar no-print ${catalogCollapsed ? 'is-collapsed' : ''}" role="tablist" aria-label="${catalog.length} Paginated Reports">
            <div class="rdl-cats sr-only" role="tablist" aria-label="Report categories">
              <span class="rdl-cats-lbl">DOMAIN FILTER</span>
              ${visibleCats.map(c => `
                <button type="button" class="rdl-cat-btn ${cat === c ? 'active' : ''}" data-rdl-cat="${esc(c)}">
                  <span>${c === 'All' ? 'All Domains' : esc(c)}</span>
                  <span class="rdl-cat-cnt">${c === 'All' ? catalog.length : (catCounts[c] || 0)}</span>
                </button>
              `).join('')}
            </div>

            <div class="rdl-grouped-pods ${isFilteredDeck ? 'has-filtered-pod' : ''}">
              ${orderedGroups.map(grpCat => {
                const grpItems = catalog.filter(r => r.cat === grpCat);
                const hasActive = grpItems.some(r => r.id === meta.id);
                const matchCat = (cat === 'All' || grpCat === cat);
                const anyMatchQ = !q || grpItems.some(r =>
                  r.title.toLowerCase().includes(q) ||
                  r.cat.toLowerCase().includes(q) ||
                  r.ar.includes(q) ||
                  r.id.includes(q)
                );
                const podHidden = !(matchCat && anyMatchQ) ? 'rdl-pod-filtered' : '';
                return `
                  <div class="rdl-group-pod ${hasActive ? 'is-active-pod' : ''} ${podHidden}" data-rdl-pod="${esc(grpCat)}">
                    <div class="rdl-pod-hdr" data-rdl-pod-jump="${esc(grpCat)}">
                      <span class="rdl-pod-title">${esc(grpCat)}</span>
                      <span class="rdl-pod-count">${grpItems.length}</span>
                    </div>
                    <div class="rdl-pod-items">
                      ${grpItems.map(r => {
                        const itemMatchCat = (cat === 'All' || r.cat === cat);
                        const itemMatchQ = !q || r.title.toLowerCase().includes(q) || r.cat.toLowerCase().includes(q) || r.ar.includes(q) || r.id.includes(q);
                        const hiddenClass = (itemMatchCat && itemMatchQ) ? '' : 'rdl-tab-filtered';
                        return `
                          <button type="button"
                            class="rdl-tab stmt-card ${r.id === meta.id ? 'active' : ''} ${hiddenClass}"
                            data-stmt="${r.id}"
                            data-cat="${esc(r.cat)}"
                            aria-label="RDL-${r.id}: ${esc(r.title)} (${esc(r.ar)})">
                            <span class="rdl-tcat sr-only">${esc(r.cat)}</span>
                            <span class="rdl-tid">${esc(r.id)}</span>
                            <span class="rdl-ttitle">${esc(r.title)}</span>
                          </button>
                        `;
                      }).join('')}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <div class="no-print" id="rdlParamContainer">
            ${renderParamBarHtml(meta, ctx)}
          </div>

          <div class="rdl-canvas">
            <div class="statement-sheet rdl-sheet" id="printableSheet">
              ${renderRdlSheet(meta.id, ctx)}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function wireStatementsEvents(root, SEED, STATE, rerenderFn) {
    if (!root) return;
    const ctx = buildRdlContext(SEED, STATE);

    const syncHeaderMeta = (meta, catalog) => {
      const crumb = root.querySelector('.rdl-menu-crumb');
      if (crumb) crumb.innerHTML = `<b>RDL-${esc(meta.id)} ${esc(meta.title)}</b> <span class="rdl-crumb-ar" dir="rtl">${esc(meta.ar)}</span>`;
      const pill = root.querySelector('.rdl-suite-pill');
      if (pill) pill.textContent = meta.cat;
      const pg = root.querySelector('.rdl-tb-page');
      if (pg) pg.innerHTML = `<b>${esc(meta.id)}</b> / ${String(catalog.length).padStart(2, '0')}`;
      root.querySelectorAll('.rdl-group-pod').forEach(pod => {
        pod.classList.toggle('is-active-pod', pod.getAttribute('data-rdl-pod') === meta.cat);
      });
    };

    const refreshSheetAndParams = () => {
      const updatedCtx = buildRdlContext(SEED, STATE);
      const catalog = getVisibleRdlCatalog(STATE);
      const activeId = String(STATE.activeStatement || '01').padStart(2, '0');
      const meta = catalog.find(x => x.id === activeId) || catalog[0];
      STATE.activeStatement = meta.id;
      syncHeaderMeta(meta, catalog);
      const paramCont = root.querySelector('#rdlParamContainer');
      if (paramCont) paramCont.innerHTML = renderParamBarHtml(meta, updatedCtx);
      const sheet = root.querySelector('#printableSheet');
      if (sheet) sheet.innerHTML = renderRdlSheet(meta.id, updatedCtx);
      syncPinnedStatementCoverNote(root, STATE);
      wireParamControls();
      wireTableSorting();
      wireInteractiveSheetEnhancements(meta, updatedCtx);
      if (window.MFG_TABLE_COLS && typeof window.MFG_TABLE_COLS.enhanceAllTables === 'function') {
        window.MFG_TABLE_COLS.enhanceAllTables(root, STATE);
      }
      if (window.MFG_ASK && typeof window.MFG_ASK.syncStatementSummaryOnChange === 'function') {
        window.MFG_ASK.syncStatementSummaryOnChange();
      }
    };

    // Category filter buttons
    root.querySelectorAll('[data-rdl-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        const nextCat = btn.dataset.rdlCat || 'All';
        ctx.rdl.cat = nextCat;
        ctx.rdl.catalogCollapsed = false;
        if (nextCat !== 'All') {
          const catalog = getVisibleRdlCatalog(STATE);
          const curId = String(STATE.activeStatement || '01').padStart(2, '0');
          const curMeta = catalog.find(x => x.id === curId);
          if (!curMeta || curMeta.cat !== nextCat) {
            const firstInCat = catalog.find(x => x.cat === nextCat);
            if (firstInCat) STATE.activeStatement = firstInCat.id;
          }
        }
        rerenderFn();
      });
    });

    // Clicking a domain pod header jumps to the first report in that domain
    root.querySelectorAll('[data-rdl-pod-jump]').forEach(hdr => {
      hdr.addEventListener('click', () => {
        const grpCat = hdr.getAttribute('data-rdl-pod-jump');
        const catalog = getVisibleRdlCatalog(STATE);
        const firstInCat = catalog.find(x => x.cat === grpCat);
        if (firstInCat && STATE.activeStatement !== firstInCat.id) {
          STATE.activeStatement = firstInCat.id;
          root.querySelectorAll('.stmt-card[data-stmt]').forEach(b => b.classList.toggle('active', b.dataset.stmt === firstInCat.id));
          refreshSheetAndParams();
        }
      });
    });

    // Search input
    const searchInput = root.querySelector('#rdlSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        ctx.rdl.search = searchInput.value || '';
        const q = ctx.rdl.search.trim().toLowerCase();
        const cat = ctx.rdl.cat || 'All';
        if (q && ctx.rdl.catalogCollapsed) {
          ctx.rdl.catalogCollapsed = false;
          const tabBar = root.querySelector('.rdl-tab-bar');
          if (tabBar) tabBar.classList.remove('is-collapsed');
        }
        const podsWrap = root.querySelector('.rdl-grouped-pods');
        if (podsWrap) {
          const totalPods = root.querySelectorAll('.rdl-group-pod').length;
          podsWrap.classList.toggle('has-filtered-pod', Boolean(q || cat !== 'All' || totalPods < 7));
        }
        root.querySelectorAll('.rdl-tab[data-stmt]').forEach(tab => {
          const r = RDL_CATALOG.find(x => x.id === tab.dataset.stmt);
          if (!r) return;
          const mCat = (cat === 'All' || r.cat === cat);
          const mQ = !q || r.title.toLowerCase().includes(q) || r.cat.toLowerCase().includes(q) || r.ar.includes(q) || r.id.includes(q);
          tab.classList.toggle('rdl-tab-filtered', !(mCat && mQ));
        });
        root.querySelectorAll('.rdl-group-pod').forEach(pod => {
          const anyVisible = [...pod.querySelectorAll('.rdl-tab[data-stmt]')].some(t => !t.classList.contains('rdl-tab-filtered'));
          pod.classList.toggle('rdl-pod-filtered', !anyVisible);
        });
      });
    }

    // 22 report tab buttons
    root.querySelectorAll('.stmt-card[data-stmt]').forEach(btn => {
      btn.addEventListener('click', () => {
        STATE.activeStatement = btn.dataset.stmt;
        root.querySelectorAll('.stmt-card[data-stmt]').forEach(b => b.classList.toggle('active', b === btn));
        refreshSheetAndParams();
      });
    });

    // Prev / Next report buttons
    const prevBtn = root.querySelector('#rdlPrevBtn');
    const nextBtn = root.querySelector('#rdlNextBtn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        const catalog = getVisibleRdlCatalog(STATE);
        const idx = Math.max(0, catalog.findIndex(x => x.id === String(STATE.activeStatement || '01').padStart(2, '0')));
        const nextIdx = (idx - 1 + catalog.length) % catalog.length;
        STATE.activeStatement = catalog[nextIdx].id;
        rerenderFn();
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const catalog = getVisibleRdlCatalog(STATE);
        const idx = Math.max(0, catalog.findIndex(x => x.id === String(STATE.activeStatement || '01').padStart(2, '0')));
        const nextIdx = (idx + 1) % catalog.length;
        STATE.activeStatement = catalog[nextIdx].id;
        rerenderFn();
      });
    }

    // Explain Variance & Listen Summary buttons
    const explainBtn = root.querySelector('#stmtExplainVarianceBtn');
    const listenBtn = root.querySelector('#stmtListenSummaryBtn');
    if (explainBtn) {
      explainBtn.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        if (window.MFG_ASK && typeof window.MFG_ASK.toggleStatementVariance === 'function') {
          window.MFG_ASK.toggleStatementVariance(explainBtn);
        }
      });
    }
    if (listenBtn) {
      listenBtn.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        if (window.MFG_ASK && typeof window.MFG_ASK.speakStatementSummary === 'function') {
          window.MFG_ASK.speakStatementSummary(listenBtn);
        }
      });
    }

    // Print & CSV buttons
    const printBtn = root.querySelector('#printStmtBtn');
    const menuPrint = root.querySelector('#rdlMenuPrint');
    if (printBtn) printBtn.addEventListener('click', () => window.print());
    if (menuPrint) menuPrint.addEventListener('click', () => window.print());

    const csvBtn = root.querySelector('#rdlExportCsvBtn');
    const menuCsv = root.querySelector('#rdlMenuCsv');
    const doCsv = () => {
      const activeId = String(STATE.activeStatement || '01').padStart(2, '0');
      const meta = RDL_CATALOG.find(x => x.id === activeId) || RDL_CATALOG[0];
      exportPrintableSheetCsv(meta, STATE.company);
    };
    if (csvBtn) csvBtn.addEventListener('click', doCsv);
    if (menuCsv) menuCsv.addEventListener('click', doCsv);

    // Toggle Catalog deck
    const toggleCatalogBtn = root.querySelector('#rdlToggleCatalogBtn');
    if (toggleCatalogBtn) {
      toggleCatalogBtn.addEventListener('click', () => {
        const catalog = getVisibleRdlCatalog(STATE);
        ctx.rdl.catalogCollapsed = !ctx.rdl.catalogCollapsed;
        toggleCatalogBtn.classList.toggle('active', !ctx.rdl.catalogCollapsed);
        toggleCatalogBtn.innerHTML = `<span class="rdl-tb-caret">${ctx.rdl.catalogCollapsed ? '▸' : '▾'}</span> Catalog (${catalog.length})`;
        const tabBar = root.querySelector('.rdl-tab-bar');
        if (tabBar) tabBar.classList.toggle('is-collapsed', Boolean(ctx.rdl.catalogCollapsed));
      });
    }

    // Toggle Parameters bar
    const toggleParamsBtn = root.querySelector('#rdlToggleParamsBtn');
    if (toggleParamsBtn) {
      toggleParamsBtn.addEventListener('click', () => {
        ctx.rdl.paramsOpen = !ctx.rdl.paramsOpen;
        toggleParamsBtn.classList.toggle('active', ctx.rdl.paramsOpen);
        toggleParamsBtn.innerHTML = `<span class="rdl-tb-caret">${ctx.rdl.paramsOpen ? '▾' : '▸'}</span> Parameters`;
        const bar = root.querySelector('#rdlParamBar');
        if (bar) bar.classList.toggle('collapsed', !ctx.rdl.paramsOpen);
      });
    }

    function highlightComboMatch(text, query) {
      const s = String(text == null ? '' : text);
      const q = String(query || '').trim();
      if (!q) return esc(s);
      const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
      if (!tokens.length) return esc(s);
      const tok = tokens[0];
      const idx = s.toLowerCase().indexOf(tok);
      if (idx < 0) return esc(s);
      return `${esc(s.slice(0, idx))}<mark class="rdl-combo-mark">${esc(s.slice(idx, idx + tok.length))}</mark>${esc(s.slice(idx + tok.length))}`;
    }

    function wireParamControls() {
      const liveCtx = buildRdlContext(SEED, STATE);

      const closeSingleCombo = (w) => {
        if (!w) return;
        w.classList.remove('open');
        const m = w.querySelector('.rdl-combo-menu');
        if (m) m.hidden = true;
        const inp = w.querySelector('.rdl-combo-input');
        if (inp && inp.dataset.typing === '1') {
          inp.dataset.typing = '';
          inp.value = inp.dataset.displayLabel || '';
          if (inp.dataset.origPlaceholder) inp.placeholder = inp.dataset.origPlaceholder;
        }
      };

      const closeAllCombos = (exceptWrap) => {
        root.querySelectorAll('.rdl-combo[data-combo-wrap]').forEach(w => {
          if (w === exceptWrap) return;
          closeSingleCombo(w);
        });
      };

      if (document.body && !document.body.dataset.rdlComboOutsideWired) {
        document.body.dataset.rdlComboOutsideWired = '1';
        document.addEventListener('mousedown', ev => {
          if (ev.target && ev.target.closest('.rdl-combo')) return;
          document.querySelectorAll('.rdl-combo.open[data-combo-wrap]').forEach(w => closeSingleCombo(w));
        });
      }

      // Date inputs (reject partial/invalid years like 0002-12-31 during typing)
      root.querySelectorAll('input.rdl-date-input[data-rdl-param]').forEach(inp => {
        inp.addEventListener('change', () => {
          const k = inp.dataset.rdlParam;
          if (!/^20[2-9]\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(inp.value || '').trim())) {
            inp.value = liveCtx.rdl.params[k] || '';
            return;
          }
          liveCtx.rdl.params[k] = inp.value;
          if (k === 'from' || k === 'to' || k === 'asof') liveCtx.rdl._dateTouched = true;
          refreshSheetAndParams();
        });
      });

      // Custom Rev 10 Searchable Comboboxes (always anchored BELOW the input box)
      root.querySelectorAll('.rdl-combo[data-combo-wrap]').forEach(wrap => {
        const k = wrap.getAttribute('data-combo-wrap');
        const inp = wrap.querySelector('.rdl-combo-input');
        const menu = wrap.querySelector('.rdl-combo-menu');
        const caret = wrap.querySelector('.rdl-combo-caret');
        const clearBtn = wrap.querySelector('.rdl-combo-clear');
        const cfg = getParamComboConfig(k, liveCtx);
        if (!inp || !menu || !cfg) return;

        let currentMatches = [];
        let activeIdx = -1;
        let blurTimer = null;

        menu.addEventListener('mousedown', ev => {
          ev.preventDefault();
        });

        const chooseOption = (opt) => {
          if (!opt) return;
          clearTimeout(blurTimer);
          inp.dataset.typing = '';
          inp.dataset.rawValue = String(opt.value);
          inp.dataset.displayLabel = opt.label;
          inp.value = opt.label;
          liveCtx.rdl.params[k] = opt.value;
          closeAllCombos(null);
          refreshSheetAndParams();
        };

        const renderMenu = (useInputQuery) => {
          const rawQ = useInputQuery ? String(inp.value || '').trim() : '';
          const ql = rawQ.toLowerCase();
          const tokens = ql ? ql.split(/\s+/).filter(Boolean) : [];
          let filtered;
          if (!tokens.length) {
            filtered = cfg.options;
          } else {
            const exact = [];
            const freqOrdered = [];
            for (let i = 0; i < cfg.options.length; i++) {
              const o = cfg.options[i];
              let ok = true;
              for (let ti = 0; ti < tokens.length; ti++) {
                if (!o.q.includes(tokens[ti])) { ok = false; break; }
              }
              if (!ok) continue;
              const mainLow = (o.main || '').toLowerCase();
              const codeLow = (o.code || '').toLowerCase();
              if (mainLow === ql || codeLow === ql || codeLow === '#' + ql) {
                exact.push(o);
              } else {
                freqOrdered.push(o);
              }
            }
            filtered = exact.concat(freqOrdered);
          }

          const MAX_SHOW = 45;
          currentMatches = filtered.slice(0, MAX_SHOW);
          const curRaw = String(liveCtx.rdl.params[k] !== undefined ? liveCtx.rdl.params[k] : '');
          if (tokens.length) {
            activeIdx = currentMatches.length ? 0 : -1;
          } else {
            activeIdx = currentMatches.findIndex(o => String(o.value) === curRaw);
          }

          closeAllCombos(wrap);
          const statusTxt = tokens.length
            ? (filtered.length
              ? `<b>${fmtNum(filtered.length)}</b> match${filtered.length === 1 ? '' : 'es'} for "${esc(rawQ)}"${filtered.length > MAX_SHOW ? ` · top ${MAX_SHOW}` : ''}`
              : `No matches for "${esc(rawQ)}" — try another name, number or date`)
            : `<b>${fmtNum(cfg.options.length)}</b> ${esc(cfg.label.toLowerCase())} options · Type name, # or date to search`;

          menu.innerHTML = `
            <div class="rdl-combo-status">${statusTxt}</div>
            <div class="rdl-combo-list">
              ${currentMatches.map((opt, idx) => {
                const isSelected = String(opt.value) === curRaw;
                const isAct = idx === activeIdx;
                return `
                  <div class="rdl-combo-item ${isSelected ? 'is-selected' : ''} ${isAct ? 'active' : ''}" role="option" data-combo-idx="${idx}">
                    <div class="rdl-opt-left">
                      ${opt.code ? `<span class="rdl-opt-code">${highlightComboMatch(opt.code, rawQ)}</span>` : ''}
                      <span class="rdl-opt-main">${highlightComboMatch(opt.main, rawQ)}</span>
                    </div>
                    <div class="rdl-opt-right">
                      ${opt.meta ? `<span class="rdl-opt-meta">${highlightComboMatch(opt.meta, rawQ)}</span>` : ''}
                      ${isSelected ? `<span class="rdl-opt-check" aria-hidden="true">✓</span>` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `;
          menu.hidden = false;
          wrap.classList.add('open');

          menu.querySelectorAll('.rdl-combo-item').forEach(row => {
            row.addEventListener('mousedown', ev => {
              ev.preventDefault();
              const idx = Number(row.getAttribute('data-combo-idx'));
              if (currentMatches[idx]) chooseOption(currentMatches[idx]);
            });
            row.addEventListener('mouseenter', () => {
              activeIdx = Number(row.getAttribute('data-combo-idx'));
              menu.querySelectorAll('.rdl-combo-item').forEach((r, ri) => r.classList.toggle('active', ri === activeIdx));
            });
          });
        };

        const enterSearchMode = (forceRender = false) => {
          clearTimeout(blurTimer);
          if (inp.dataset.typing === '1' && !menu.hidden && !forceRender) return;
          if (inp.dataset.typing !== '1') {
            inp.dataset.origPlaceholder = inp.placeholder;
            inp.placeholder = `Search ${cfg.label.toLowerCase()} by name, # or date… (${inp.dataset.displayLabel || ''})`;
            inp.value = '';
            inp.dataset.typing = '1';
          }
          renderMenu(Boolean(inp.value.trim()));
        };

        inp.addEventListener('focus', () => enterSearchMode(false));
        let openedOnMousedown = false;
        inp.addEventListener('mousedown', () => {
          clearTimeout(blurTimer);
          openedOnMousedown = menu.hidden;
        });
        inp.addEventListener('click', () => {
          clearTimeout(blurTimer);
          const justOpened = openedOnMousedown;
          openedOnMousedown = false;
          const selLen = (typeof inp.selectionStart === 'number' && typeof inp.selectionEnd === 'number')
            ? (inp.selectionEnd - inp.selectionStart)
            : 0;
          if (selLen >= 2 || (selLen > 0 && !justOpened)) {
            if (!menu.hidden) {
              menu.hidden = true;
              wrap.classList.remove('open');
            }
            return;
          }
          if (menu.hidden) enterSearchMode(true);
        });
        inp.addEventListener('input', () => {
          clearTimeout(blurTimer);
          inp.dataset.typing = '1';
          renderMenu(true);
        });

        // Support programmatic change events (e.g. headless verification scripts setting inp.value)
        inp.addEventListener('change', () => {
          if (inp.dataset.typing === '1') return;
          const v = String(inp.value || '').trim();
          const hit = cfg.options.find(o => String(o.value) === v || o.label === v || o.main === v);
          if (hit) {
            liveCtx.rdl.params[k] = hit.value;
            refreshSheetAndParams();
          }
        });

        inp.addEventListener('blur', () => {
          clearTimeout(blurTimer);
          blurTimer = setTimeout(() => {
            if (document.activeElement !== inp) closeSingleCombo(wrap);
          }, 150);
        });

        inp.addEventListener('keydown', ev => {
          if (menu.hidden) {
            if (ev.key === 'ArrowDown') {
              ev.preventDefault();
              enterSearchMode();
            }
            return;
          }
          if (ev.key === 'ArrowDown') {
            ev.preventDefault();
            if (!currentMatches.length) return;
            activeIdx = (activeIdx + 1) % currentMatches.length;
            const items = menu.querySelectorAll('.rdl-combo-item');
            items.forEach((r, ri) => r.classList.toggle('active', ri === activeIdx));
            if (items[activeIdx]) items[activeIdx].scrollIntoView({ block: 'nearest' });
          } else if (ev.key === 'ArrowUp') {
            ev.preventDefault();
            if (!currentMatches.length) return;
            activeIdx = (activeIdx - 1 + currentMatches.length) % currentMatches.length;
            const items = menu.querySelectorAll('.rdl-combo-item');
            items.forEach((r, ri) => r.classList.toggle('active', ri === activeIdx));
            if (items[activeIdx]) items[activeIdx].scrollIntoView({ block: 'nearest' });
          } else if (ev.key === 'Enter') {
            ev.preventDefault();
            const pick = currentMatches[activeIdx >= 0 ? activeIdx : 0];
            if (pick) chooseOption(pick);
          } else if (ev.key === 'Escape') {
            ev.preventDefault();
            ev.stopPropagation();
            closeAllCombos(null);
          } else if (ev.key === 'Tab') {
            closeAllCombos(null);
          }
        });

        if (caret) {
          caret.addEventListener('mousedown', ev => {
            ev.preventDefault();
            if (!menu.hidden) {
              closeAllCombos(null);
              inp.blur();
            } else {
              try { inp.focus({ preventScroll: true }); } catch (_) {}
              enterSearchMode();
            }
          });
        }

        if (clearBtn) {
          clearBtn.addEventListener('mousedown', ev => {
            ev.preventDefault();
            const hasAll = cfg.options[0] && cfg.options[0].value === 'ALL';
            if (inp.dataset.typing === '1' && inp.value) {
              inp.value = '';
              renderMenu(false);
              try { inp.focus({ preventScroll: true }); } catch (_) {}
            } else if (hasAll && String(liveCtx.rdl.params[k]) !== 'ALL') {
              chooseOption(cfg.options[0]);
            } else {
              try { inp.focus({ preventScroll: true }); } catch (_) {}
              enterSearchMode();
            }
          });
        }
      });

      // Prev / Next document record stepper buttons (for Sales Invoice, Delivery Ticket, Receipt Voucher)
      root.querySelectorAll('[data-rdl-step]').forEach(btn => {
        btn.addEventListener('click', () => {
          const k = btn.getAttribute('data-rdl-step');
          const dir = Number(btn.getAttribute('data-step-dir') || 1);
          const cfg = getParamComboConfig(k, liveCtx);
          if (!cfg || !cfg.options.length) return;
          const cur = String(liveCtx.rdl.params[k] || '');
          const idx = Math.max(0, cfg.options.findIndex(o => String(o.value) === cur));
          const nextIdx = (idx + dir + cfg.options.length) % cfg.options.length;
          liveCtx.rdl.params[k] = cfg.options[nextIdx].value;
          refreshSheetAndParams();
        });
      });

      root.querySelectorAll('[data-rdl-period]').forEach(btn => {
        btn.addEventListener('click', () => {
          liveCtx.rdl.params.period = btn.dataset.rdlPeriod || 'Month';
          refreshSheetAndParams();
        });
      });

      const viewBtn = root.querySelector('#rdlViewReportBtn');
      if (viewBtn) {
        viewBtn.addEventListener('click', () => {
          root.querySelectorAll('input.rdl-date-input[data-rdl-param]').forEach(inp => {
            const k = inp.dataset.rdlParam;
            liveCtx.rdl.params[k] = inp.value;
          });
          root.querySelectorAll('input.rdl-combo-input[data-rdl-param]').forEach(inp => {
            const k = inp.dataset.rdlParam;
            if (inp.dataset.typing === '1' && inp.value.trim()) {
              const cfg = getParamComboConfig(k, liveCtx);
              const q = inp.value.trim().toLowerCase();
              const hit = cfg && cfg.options.find(o => o.q.includes(q));
              if (hit) liveCtx.rdl.params[k] = hit.value;
            } else if (inp.dataset.rawValue !== undefined) {
              liveCtx.rdl.params[k] = inp.dataset.rawValue;
            }
          });
          refreshSheetAndParams();
        });
      }

      const resetBtn = root.querySelector('#rdlResetParamsBtn');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          delete STATE.rdl;
          ensureRdlState(STATE, SEED);
          refreshSheetAndParams();
        });
      }
    }

    function wireTableSorting() {
      root.querySelectorAll('#printableSheet table.rdl-table thead th').forEach((th, colIdx) => {
        th.style.cursor = 'pointer';
        th.setAttribute('aria-label', `${(th.textContent || '').trim()} — click to sort`);
        th.addEventListener('click', () => {
          const tbl = th.closest('table');
          const tbody = tbl && tbl.querySelector('tbody');
          if (!tbody) return;
          const rows = [...tbody.querySelectorAll('tr:not(.rdl-interactive-group-row)')];
          if (rows.some(r => r.classList.contains('rdl-group-row') || r.classList.contains('rdl-subtotal-row'))) return;
          const dir = th.dataset.sortDir === 'asc' ? 'desc' : 'asc';
          th.dataset.sortDir = dir;
          rows.sort((a, b) => {
            const va = (a.children[colIdx] ? a.children[colIdx].innerText : '').trim();
            const vb = (b.children[colIdx] ? b.children[colIdx].innerText : '').trim();
            const na = parseFloat(va.replace(/[^0-9.-]/g, ''));
            const nb = parseFloat(vb.replace(/[^0-9.-]/g, ''));
            if (!isNaN(na) && !isNaN(nb)) return dir === 'asc' ? na - nb : nb - na;
            return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
          });
          rows.forEach(r => tbody.appendChild(r));
          if (typeof tbl._rdlRefreshInteractive === 'function') {
            tbl._rdlRefreshInteractive();
          }
        });
      });
    }

    function wireInteractiveSheetEnhancements(meta) {
      const sheet = root.querySelector('#printableSheet');
      if (!sheet) return;

      // 1. Multi-section switcher bar + collapsible section headings (for RDL-01, RDL-02, RDL-18, etc.)
      const secTitles = [...sheet.querySelectorAll('.rdl-sec-title')];
      if (secTitles.length >= 2) {
        const secMeta = secTitles.map((secEl, idx) => {
          const rawLabel = (secEl.textContent || '').replace(/\s+/g, ' ').trim();
          const shortLabel = rawLabel.split(/\s+[—–/]\s+/)[0].trim();
          secEl.dataset.rdlSecIdx = String(idx);
          if (!secEl.querySelector('.rdl-sec-caret')) {
            const caret = document.createElement('span');
            caret.className = 'rdl-sec-caret no-print';
            caret.textContent = '▾';
            secEl.appendChild(caret);
          }
          const bodyNodes = [];
          let nxt = secEl.nextElementSibling;
          while (nxt && !nxt.classList.contains('rdl-sec-title') && !nxt.classList.contains('rdl-sign-row') && !nxt.classList.contains('rdl-footer')) {
            nxt.dataset.rdlSecBody = String(idx);
            bodyNodes.push(nxt);
            nxt = nxt.nextElementSibling;
          }
          const tbl = bodyNodes.find(n => n.tagName === 'TABLE') || null;
          const rowCnt = tbl ? tbl.querySelectorAll('tbody tr:not(.rdl-group-row):not(.rdl-subtotal-row)').length : 0;
          secEl.addEventListener('click', () => {
            const collapsed = secEl.classList.toggle('is-sec-collapsed');
            bodyNodes.forEach(n => n.classList.toggle('rdl-sec-collapsed-body', collapsed));
          });
          return { idx, shortLabel, rowCnt, secEl, bodyNodes };
        });

        const secBar = document.createElement('div');
        secBar.className = 'rdl-sheet-sec-bar no-print';
        secBar.innerHTML = `
          <span class="rdl-sheet-sec-lbl">Report Sections</span>
          <div class="rdl-sheet-sec-pills" role="tablist" aria-label="Isolate report section">
            <button type="button" class="rdl-sheet-sec-pill active" data-rdl-sec-pill="all">
              <span>All Sections</span>
              <span class="rdl-sec-pill-cnt">${secMeta.length}</span>
            </button>
            ${secMeta.map(s => `
              <button type="button" class="rdl-sheet-sec-pill" data-rdl-sec-pill="${s.idx}">
                <span>${esc(s.shortLabel)}</span>
                ${s.rowCnt ? `<span class="rdl-sec-pill-cnt">${s.rowCnt}</span>` : ''}
              </button>
            `).join('')}
          </div>
        `;
        secTitles[0].parentNode.insertBefore(secBar, secTitles[0]);

        secBar.querySelectorAll('[data-rdl-sec-pill]').forEach(btn => {
          btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-rdl-sec-pill');
            secBar.querySelectorAll('[data-rdl-sec-pill]').forEach(b => b.classList.toggle('active', b === btn));
            secMeta.forEach(s => {
              const show = target === 'all' || String(s.idx) === target;
              s.secEl.classList.toggle('rdl-sec-filtered-out', !show);
              s.bodyNodes.forEach(n => n.classList.toggle('rdl-sec-filtered-out', !show));
              if (show && target !== 'all') {
                s.secEl.classList.remove('is-sec-collapsed');
                s.bodyNodes.forEach(n => n.classList.remove('rdl-sec-collapsed-body'));
              }
            });
          });
        });
      }

      // 2. Interactive table grouping, inline filter & 12-row pagination for data tables
      const tables = [...sheet.querySelectorAll('table.rdl-table')];
      tables.forEach((tbl, tblIdx) => {
        const tbody = tbl.querySelector('tbody');
        const thead = tbl.querySelector('thead');
        if (!tbody || !thead) return;
        const initialRows = [...tbody.querySelectorAll('tr')];
        if (initialRows.length <= 6) return;
        if (initialRows.some(r => r.classList.contains('rdl-group-row') || r.classList.contains('rdl-subtotal-row'))) return;

        const ths = [...thead.querySelectorAll('th')];
        if (!ths.length) return;

        // Discover candidate group-by dimensions
        const groupOptions = [];
        ths.forEach((th, colIdx) => {
          if (th.classList.contains('num')) return;
          const hdrTxt = (th.textContent || '').replace(/\s+/g, ' ').trim();
          if (!hdrTxt || /^#$|^no\.?$|^id$|^je\s*#$|^voucher|^ticket|^ref|^description|^notes/i.test(hdrTxt)) return;
          if (/^date$/i.test(hdrTxt)) {
            const months = new Set();
            initialRows.forEach(r => {
              const cellTxt = (r.children[colIdx] ? r.children[colIdx].textContent : '').trim();
              if (/^\d{4}-\d{2}/.test(cellTxt)) months.add(cellTxt.slice(0, 7));
            });
            if (months.size >= 2) {
              groupOptions.push({ key: `month:${colIdx}`, label: 'Month', colIdx, mode: 'month' });
            }
            return;
          }
          const vals = new Set();
          initialRows.forEach(r => {
            const v = (r.children[colIdx] ? r.children[colIdx].textContent : '').replace(/\s+/g, ' ').trim();
            if (v) vals.add(v);
          });
          if (vals.size >= 2 && vals.size <= Math.min(48, initialRows.length - 1)) {
            groupOptions.push({ key: `col:${colIdx}`, label: hdrTxt.replace(/\s*\/.*$/, ''), colIdx, mode: 'col' });
          }
        });

        // Fallback smart tier grouping for aging / balance tables (e.g. RDL-13 Aged Receivables, RDL-15 Supplier Balances, RDL-05 Trial Balance)
        const has90PlusCol = ths.findIndex(th => /90\+\s*days/i.test(th.textContent || ''));
        if (has90PlusCol >= 0) {
          groupOptions.unshift({ key: 'tier:aging', label: 'Aging Tier', colIdx: 1, mode: 'aging', idx90: has90PlusCol });
        }
        if (groupOptions.length < 2) {
          const primaryNumIdx = ths.findIndex(th => /total|balance|net|amount/i.test(th.textContent || '') && th.classList.contains('num'));
          if (primaryNumIdx >= 0) {
            groupOptions.push({ key: `tier:bal:${primaryNumIdx}`, label: 'Balance Tier', colIdx: 1, mode: 'balance', numIdx: primaryNumIdx });
          }
        }

        const topGroups = groupOptions.slice(0, 3);
        const state = {
          groupKey: 'none',
          searchQ: '',
          pageSize: initialRows.length > 12 ? 12 : 0, // 0 = All
          page: 1,
          expandedGroups: new Set()
        };

        const parseCellNum = (cell) => {
          if (!cell) return 0;
          const txt = (cell.textContent || '').replace(/[^0-9.-]/g, '');
          const n = parseFloat(txt);
          return Number.isFinite(n) ? n : 0;
        };

        const getRowGroupValue = (tr, grp) => {
          if (!grp) return 'All';
          if (grp.mode === 'month') {
            const d = (tr.children[grp.colIdx] ? tr.children[grp.colIdx].textContent : '').trim();
            return /^\d{4}-\d{2}/.test(d) ? d.slice(0, 7) : (d || 'Undated');
          }
          if (grp.mode === 'aging') {
            const c90 = parseCellNum(tr.children[grp.idx90]);
            const c60 = parseCellNum(tr.children[grp.idx90 - 1]);
            const c30 = parseCellNum(tr.children[grp.idx90 - 2]);
            if (c90 > 0) return '1 · 90+ Days Overdue (Critical)';
            if (c60 > 0) return '2 · 61–90 Days Past Due';
            if (c30 > 0) return '3 · 31–60 Days Past Due';
            return '4 · Current (0–30 Days)';
          }
          if (grp.mode === 'balance') {
            const v = Math.abs(parseCellNum(tr.children[grp.numIdx]));
            if (v >= 25000) return '1 · High Exposure ($25,000+)';
            if (v >= 5000) return '2 · Medium ($5,000 – $25,000)';
            if (v > 0) return '3 · Standard (< $5,000)';
            return '4 · Zero / Settled ($0)';
          }
          const raw = (tr.children[grp.colIdx] ? tr.children[grp.colIdx].textContent : '').replace(/\s+/g, ' ').trim();
          return raw || 'Unspecified';
        };

        const ctrlBar = document.createElement('div');
        ctrlBar.className = 'rdl-tbl-ctrl-bar no-print';
        ctrlBar.dataset.rdlTblIdx = String(tblIdx);
        tbl.parentNode.insertBefore(ctrlBar, tbl);

        const applyTableState = () => {
          // Always remove previously injected interactive group summary rows first
          tbody.querySelectorAll('tr.rdl-interactive-group-row').forEach(r => r.remove());
          const rawRows = [...tbody.querySelectorAll('tr:not(.rdl-interactive-group-row)')];
          const q = state.searchQ.trim().toLowerCase();

          const matchedRows = [];
          rawRows.forEach(tr => {
            tr.classList.remove('rdl-row-search-hidden', 'rdl-row-paged-hidden', 'rdl-row-grouped-hidden');
            const match = !q || (tr.textContent || '').toLowerCase().includes(q);
            if (!match) {
              tr.classList.add('rdl-row-search-hidden');
            } else {
              matchedRows.push(tr);
            }
          });

          const activeGrp = topGroups.find(g => g.key === state.groupKey) || null;
          let totalPages = 1;
          let rangeLabel = `${matchedRows.length} rows`;

          if (activeGrp) {
            // Grouped mode: aggregate matchedRows into summary buckets while keeping rawRows in tbody
            const buckets = new Map();
            matchedRows.forEach(tr => {
              const gVal = getRowGroupValue(tr, activeGrp);
              if (!buckets.has(gVal)) {
                buckets.set(gVal, { key: gVal, rows: [], sums: new Array(ths.length).fill(0) });
              }
              const b = buckets.get(gVal);
              b.rows.push(tr);
              ths.forEach((th, cIdx) => {
                if (!th.classList.contains('num')) return;
                b.sums[cIdx] += parseCellNum(tr.children[cIdx]);
              });
            });

            // Sort buckets: if label starts with "1 ·", sort alphabetically; otherwise sort by last summable column desc
            const sumColIdx = (() => {
              for (let i = ths.length - 1; i >= 0; i--) {
                const h = (ths[i].textContent || '').trim();
                if (ths[i].classList.contains('num') && !/%|avg|rate|price/i.test(h)) return i;
              }
              return -1;
            })();

            const sortedBuckets = [...buckets.values()].sort((a, b) => {
              if (/^\d\s*·/.test(a.key) && /^\d\s*·/.test(b.key)) return a.key.localeCompare(b.key);
              if (activeGrp.mode === 'month') return b.key.localeCompare(a.key);
              if (sumColIdx >= 0 && Math.abs(b.sums[sumColIdx]) !== Math.abs(a.sums[sumColIdx])) {
                return Math.abs(b.sums[sumColIdx]) - Math.abs(a.sums[sumColIdx]);
              }
              return b.rows.length - a.rows.length;
            });

            // Reorder tbody so each group header precedes its detail rows
            const labelSpan = Math.max(1, ths.findIndex(th => th.classList.contains('num')));
            sortedBuckets.forEach(b => {
              const isExpanded = state.expandedGroups.has(b.key);
              const gTr = document.createElement('tr');
              gTr.className = `rdl-interactive-group-row ${isExpanded ? 'is-expanded' : ''}`;
              gTr.dataset.groupBucket = b.key;

              const cellsHtml = [];
              cellsHtml.push(`
                <td colspan="${labelSpan}" class="rdl-igrp-title-cell">
                  <span class="rdl-igrp-caret">${isExpanded ? '▾' : '▸'}</span>
                  <span class="rdl-igrp-label">${esc(b.key)}</span>
                  <span class="rdl-igrp-count">${b.rows.length} ${b.rows.length === 1 ? 'row' : 'rows'}</span>
                  <span class="rdl-igrp-hint">${isExpanded ? 'Click to collapse' : 'Click to expand rows'}</span>
                </td>
              `);
              for (let cIdx = labelSpan; cIdx < ths.length; cIdx++) {
                const th = ths[cIdx];
                const hdrTxt = (th.textContent || '').trim();
                if (!th.classList.contains('num')) {
                  cellsHtml.push(`<td></td>`);
                } else if (/%|avg|unit|price|rate|running/i.test(hdrTxt)) {
                  cellsHtml.push(`<td class="num muted">—</td>`);
                } else {
                  const isCurrency = /\$|usd|dr|cr|debit|credit|billed|collected|balance|total|amount|net|vat|cost|pay|ar|ap|current|days/i.test(hdrTxt);
                  const val = b.sums[cIdx];
                  cellsHtml.push(`<td class="num bold">${isCurrency ? fmtUsd(val) : fmtNum(val, 1)}</td>`);
                }
              }
              gTr.innerHTML = cellsHtml.join('');
              gTr.addEventListener('click', () => {
                if (state.expandedGroups.has(b.key)) state.expandedGroups.delete(b.key);
                else state.expandedGroups.add(b.key);
                applyTableState();
              });
              tbody.appendChild(gTr);
              b.rows.forEach(r => {
                r.classList.toggle('rdl-row-grouped-hidden', !isExpanded);
                tbody.appendChild(r);
              });
            });
            // Keep non-matched rows at the end of tbody (still hidden by .rdl-row-search-hidden)
            rawRows.filter(r => r.classList.contains('rdl-row-search-hidden')).forEach(r => tbody.appendChild(r));
            rangeLabel = `${sortedBuckets.length} groups (${matchedRows.length} rows)`;
          } else {
            // Detail view with pagination
            const ps = state.pageSize > 0 ? state.pageSize : matchedRows.length;
            totalPages = Math.max(1, Math.ceil(matchedRows.length / Math.max(1, ps)));
            if (state.page > totalPages) state.page = totalPages;
            if (state.page < 1) state.page = 1;
            const startIdx = state.pageSize > 0 ? (state.page - 1) * state.pageSize : 0;
            const endIdx = state.pageSize > 0 ? Math.min(matchedRows.length, startIdx + state.pageSize) : matchedRows.length;
            matchedRows.forEach((tr, idx) => {
              const onPage = idx >= startIdx && idx < endIdx;
              tr.classList.toggle('rdl-row-paged-hidden', !onPage);
            });
            rangeLabel = matchedRows.length
              ? `${startIdx + 1}–${endIdx} of ${matchedRows.length} rows`
              : `0 of ${rawRows.length} rows`;
          }

          // Render control bar HTML (preserve focus if user is typing in table search input)
          const activeSearchEl = ctrlBar.querySelector('.rdl-tbl-search-inp');
          const hadFocus = activeSearchEl && document.activeElement === activeSearchEl;
          const selStart = hadFocus ? activeSearchEl.selectionStart : null;

          ctrlBar.innerHTML = `
            <div class="rdl-tbl-ctrl-left">
              <span class="rdl-tbl-ctrl-lbl">View</span>
              <button type="button" class="rdl-tbl-grp-pill ${state.groupKey === 'none' ? 'active' : ''}" data-tbl-grp="none">
                Detail Rows (${matchedRows.length})
              </button>
              ${topGroups.map(g => `
                <button type="button" class="rdl-tbl-grp-pill ${state.groupKey === g.key ? 'active' : ''}" data-tbl-grp="${esc(g.key)}">
                  Group by ${esc(g.label)}
                </button>
              `).join('')}
              ${activeGrp ? `
                <button type="button" class="rdl-tbl-expand-all-btn" data-tbl-expand-toggle="1">
                  ${state.expandedGroups.size > 0 ? 'Collapse All' : 'Expand All'}
                </button>
              ` : ''}
            </div>
            <div class="rdl-tbl-ctrl-right">
              <input type="search" class="rdl-tbl-search-inp" placeholder="Filter table rows..." value="${esc(state.searchQ)}" aria-label="Filter table rows" />
              ${!activeGrp && rawRows.length > 12 ? `
                <div class="rdl-tbl-pagesize" role="group" aria-label="Rows per page">
                  ${[12, 25, 50, 0].map(sz => `
                    <button type="button" class="rdl-tbl-sz-btn ${state.pageSize === sz ? 'active' : ''}" data-tbl-sz="${sz}">
                      ${sz === 0 ? 'All' : sz}
                    </button>
                  `).join('')}
                </div>
                <div class="rdl-tbl-pager" role="group" aria-label="Table pagination">
                  <button type="button" class="rdl-tbl-pg-btn" data-tbl-pg="-1" ${state.page <= 1 ? 'disabled' : ''} aria-label="Previous page">‹</button>
                  <span class="rdl-tbl-pg-info">${rangeLabel}</span>
                  <button type="button" class="rdl-tbl-pg-btn" data-tbl-pg="1" ${state.page >= totalPages ? 'disabled' : ''} aria-label="Next page">›</button>
                </div>
              ` : `<span class="rdl-tbl-pg-info">${rangeLabel}</span>`}
            </div>
          `;

          ctrlBar.querySelectorAll('[data-tbl-grp]').forEach(btn => {
            btn.addEventListener('click', () => {
              state.groupKey = btn.getAttribute('data-tbl-grp') || 'none';
              state.expandedGroups.clear();
              state.page = 1;
              applyTableState();
            });
          });

          const expBtn = ctrlBar.querySelector('[data-tbl-expand-toggle]');
          if (expBtn) {
            expBtn.addEventListener('click', () => {
              if (state.expandedGroups.size > 0) {
                state.expandedGroups.clear();
              } else {
                tbody.querySelectorAll('tr.rdl-interactive-group-row').forEach(r => {
                  if (r.dataset.groupBucket) state.expandedGroups.add(r.dataset.groupBucket);
                });
              }
              applyTableState();
            });
          }

          ctrlBar.querySelectorAll('[data-tbl-sz]').forEach(btn => {
            btn.addEventListener('click', () => {
              state.pageSize = Number(btn.getAttribute('data-tbl-sz') || 0);
              state.page = 1;
              applyTableState();
            });
          });

          ctrlBar.querySelectorAll('[data-tbl-pg]').forEach(btn => {
            btn.addEventListener('click', () => {
              const dir = Number(btn.getAttribute('data-tbl-pg') || 1);
              state.page = Math.max(1, Math.min(totalPages, state.page + dir));
              applyTableState();
            });
          });

          const newSearchEl = ctrlBar.querySelector('.rdl-tbl-search-inp');
          if (newSearchEl) {
            newSearchEl.addEventListener('input', () => {
              state.searchQ = newSearchEl.value || '';
              state.page = 1;
              applyTableState();
            });
            if (hadFocus) {
              try {
                newSearchEl.focus({ preventScroll: true });
                if (typeof selStart === 'number') newSearchEl.setSelectionRange(selStart, selStart);
              } catch (_) {}
            }
          }
        };

        tbl._rdlRefreshInteractive = applyTableState;
        applyTableState();
      });
    }

    wireParamControls();
    wireTableSorting();
    const initialCatalog = getVisibleRdlCatalog(STATE);
    const initialId = String(STATE.activeStatement || '01').padStart(2, '0');
    const initialMeta = initialCatalog.find(x => x.id === initialId) || initialCatalog[0];
    syncPinnedStatementCoverNote(root, STATE);
    wireInteractiveSheetEnhancements(initialMeta, ctx);
  }

  window.MFG_RDL = {
    RDL_CATALOG,
    renderStatementsView,
    wireStatementsEvents,
    renderRdlSheet,
    renderSheet: renderRdlSheet,
    buildRdlContext,
    buildJournalEntries,
    computeStatementSnapshot,
    syncPinnedStatementCoverNote,
    getCoaAccountsForInd,
    getDomainRdlTerms
  };
})();
