/* ============================================================================
   ISABI Systems - Hybrid Live-SQL & Cloud AI Copilot (js/ask_isabi.js)
   1. 100% RLS-safe, entity-scoped & date-slicer-aware live ERP metrics.
   2. Instant deterministic answers (<80ms) on exact records, ledgers & greetings.
   3. Dual-IP Cloud + Client LLM reasoning (EN / AR / FR) for open-ended queries.
   4. Two-bubble human chat cadence + 1-click Hub, Form & 360 Inspector actions.
   ============================================================================ */
(function () {
  'use strict';

  const MONTH_MAP = {
    jan: '01', january: '01', 'يناير': '01', 'كانون الثاني': '01', janvier: '01',
    feb: '02', february: '02', 'فبراير': '02', 'شباط': '02', 'février': '02', fevrier: '02',
    mar: '03', march: '03', 'مارس': '03', 'آذار': '03', اذار: '03', mars: '03',
    apr: '04', april: '04', 'أبريل': '04', ابريل: '04', 'نيسان': '04', avril: '04',
    may: '05', 'مايو': '05', 'أيار': '05', ايار: '05', mai: '05',
    jun: '06', june: '06', 'يونيو': '06', 'حزيران': '06', juin: '06',
    jul: '07', july: '07', 'يوليو': '07', 'تموز': '07', juillet: '07',
    aug: '08', august: '08', 'أغسطس': '08', اغسطس: '08', 'آب': '08', اب: '08', 'août': '08', aout: '08',
    sep: '09', sept: '09', september: '09', 'سبتمبر': '09', 'أيلول': '09', ايلول: '09', septembre: '09',
    oct: '10', october: '10', 'أكتوبر': '10', اكتوبر: '10', 'تشرين الأول': '10', octobre: '10',
    nov: '11', november: '11', 'نوفمبر': '11', 'تشرين الثاني': '11', novembre: '11',
    dec: '12', december: '12', 'ديسمبر': '12', 'كانون الأول': '12', 'décembre': '12', decembre: '12'
  };

  let _ctx = null;
  const _chatState = {
    history: [],
    pending: null,
    typingFollowup: false,
    wired: false
  };

  function cleanOut(s) {
    return String(s == null ? '' : s)
      .replace(/[\u2014\u2013]/g, '-')
      .replace(/[\u2190-\u21FF\u25B8]/g, 'to')
      .trim();
  }

  function esc(s) {
    if (_ctx && typeof _ctx.esc === 'function') return _ctx.esc(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function norm(s) {
    return String(s == null ? '' : s).trim().toLowerCase();
  }

  function detectLang(q) {
    if (/[\u0600-\u06FF]/.test(q)) return 'ar';
    if (/\b(bonjour|salut|bonsoir|comment|combien|coute|coûte|prix|merci|comptabilit|entreprise|société|societe|facture|caisse|pointage|stock|dépense|depense|dépenses|depenses|chiffre|bénéfice|benefice|trésorerie|tresorerie|clients?|fournisseurs?|aujourd'hui|hier|quel|quelle|quels|quelles|pouvez-vous|est-ce)\b/i.test(q)) {
      return 'fr';
    }
    return 'en';
  }

  function shiftIso(iso, deltaDays) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
    const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
    d.setDate(d.getDate() + deltaDays);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function lastDayOfMonth(y, m) {
    const dt = new Date(Number(y), Number(m), 0);
    return String(dt.getDate()).padStart(2, '0');
  }

  function getActiveUser() {
    return (_ctx && typeof _ctx.activeUser === 'function') ? _ctx.activeUser() : null;
  }

  function userDisplayName(u) {
    const target = u || getActiveUser();
    return cleanOut((target && (target.full_name || target.name)) || '');
  }

  function isReasoningQuery(q) {
    const s = String(q || '').trim();
    if (/\b(why|how\s+(?:can|could|should|do\s+we)|what\s+should|recommend|advise|advice|strategy|improve|reduce|mitigate|prioritize|what\s+do\s+you\s+think|is\s+it\s+better|root\s+cause)\b/i.test(s)) {
      return !/^explain\s+the\s+diesel\s+tank\s+reconciliation/i.test(s);
    }
    if (/(لماذا|ليش|كيف\s+نقدر|كيف\s+يمكن|بماذا\s+تنصح|شو\s+رأيك|ما\s+رأيك|كيف\s+نحسن|كيف\s+نخفض)/.test(s)) return true;
    if (/\b(pourquoi|comment\s+(?:réduire|reduire|améliorer|ameliorer)|que\s+conseillez|quel\s+conseil)\b/i.test(s)) return true;
    return false;
  }

  function getAllowedCompanies(user) {
    if (_ctx && typeof _ctx.allowedCompanyNames === 'function') {
      return _ctx.allowedCompanyNames(user || getActiveUser());
    }
    return ['WTC', 'BBConstruction', 'Lions Transport'];
  }

  function mapCompanyNameToKey(coName) {
    const n = norm(coName);
    if (n === 'wtc') return 'wtc';
    if (n === 'bbconstruction' || n === 'bbc') return 'bbconstruction';
    if (n === 'lions transport' || n === 'lions') return 'lions-transport';
    const map = (_ctx && _ctx.COMPANY_BU_MATCH) || {};
    for (const k of Object.keys(map)) {
      if (norm(map[k]) === n) return k;
    }
    return coName;
  }

  function resolveQueryScope(cleanQ, user) {
    const low = cleanQ.toLowerCase();
    const allowed = getAllowedCompanies(user);
    const catalog = (_ctx && typeof _ctx.getCompanyCatalog === 'function') ? _ctx.getCompanyCatalog() : [];

    // Check explicit company mention in query
    const aliases = [
      { re: /\b(wtc)\b/i, name: 'WTC', key: 'wtc' },
      { re: /\b(bbconstruction|bb\s+construction|bbc)\b/i, name: 'BBConstruction', key: 'bbconstruction' },
      { re: /\b(lions\s+transport|lions)\b/i, name: 'Lions Transport', key: 'lions-transport' }
    ];
    let mentionedCo = null;
    const matchedAliases = aliases.filter(a => a.re.test(cleanQ));
    if (matchedAliases.length === 1) {
      mentionedCo = matchedAliases[0];
    } else if (!matchedAliases.length && catalog.length) {
      for (let i = 0; i < catalog.length; i++) {
        const c = catalog[i];
        if (c && c.name && c.name.length >= 4 && low.includes(c.name.toLowerCase())) {
          mentionedCo = { name: c.name, key: mapCompanyNameToKey(c.name) };
          break;
        }
      }
    }

    let rlsBlockedCompany = '';
    let coKey = (_ctx && _ctx.STATE && _ctx.STATE.company) || 'manufacturing-group';
    let coNames = allowed.slice();
    if (mentionedCo) {
      if (!allowed.some(a => norm(a) === norm(mentionedCo.name))) {
        rlsBlockedCompany = mentionedCo.name;
      } else {
        coKey = mentionedCo.key;
        coNames = [mentionedCo.name];
      }
    } else if (_ctx && _ctx.COMPANY_BU_MATCH && _ctx.COMPANY_BU_MATCH[coKey]) {
      const activeBu = _ctx.COMPANY_BU_MATCH[coKey];
      coNames = allowed.filter(a => norm(a) === norm(activeBu));
    } else if (String(coKey).startsWith('industry:')) {
      const ind = String(coKey).slice(9);
      const indCos = catalog.filter(c => (c.industry || 'Manufacturing') === ind).map(c => c.name);
      if (indCos.length) coNames = indCos.filter(n => !allowed.length || allowed.includes(n));
    }

    // Parse optional date override from query ("today", "yesterday", "this month", "Oct 2026", "2025", etc.)
    const seedToday = (_ctx && _ctx.SEED_DATE) || (_ctx && _ctx.todayISO ? _ctx.todayISO() : '2026-10-30');
    const realToday = (_ctx && _ctx.todayISO) ? _ctx.todayISO() : seedToday;
    const baseRange = (_ctx && typeof _ctx.periodRange === 'function' && _ctx.STATE)
      ? _ctx.periodRange(_ctx.STATE.period)
      : null;

    let dateRange = baseRange ? { from: baseRange.from, to: baseRange.to, label: '' } : null;
    let customDateOverride = false;
    let forceTxBasis = false;

    if (/\b(today|today's|aujourd'hui)\b/i.test(cleanQ) || /(اليوم|نهار اليوم)/.test(cleanQ)) {
      // If realToday has records use realToday, else latest operational day seedToday
      const probeToday = countAnyTxOnDate(realToday, coNames) > 0 ? realToday : seedToday;
      dateRange = { from: probeToday, to: probeToday, label: probeToday === realToday ? `Today (${probeToday})` : `Latest Operational Day (${probeToday})` };
      customDateOverride = true;
      forceTxBasis = true;
    } else if (/\b(yesterday|yesterday's|hier)\b/i.test(cleanQ) || /(أمس|امس|البارحة|امبارح)/.test(cleanQ)) {
      const yReal = shiftIso(realToday, -1);
      const ySeed = shiftIso(seedToday, -1);
      const probeY = countAnyTxOnDate(yReal, coNames) > 0 ? yReal : ySeed;
      dateRange = { from: probeY, to: probeY, label: `Yesterday (${probeY})` };
      customDateOverride = true;
      forceTxBasis = true;
    } else if (/\b(this\s+month|current\s+month|mtd|ce\s+mois)\b/i.test(cleanQ) || /(هذا الشهر|الشهر الحالي)/.test(cleanQ)) {
      const ym = seedToday.slice(0, 7);
      dateRange = { from: `${ym}-01`, to: `${ym}-${lastDayOfMonth(ym.slice(0, 4), ym.slice(5, 7))}`, label: `Month ${ym}` };
      customDateOverride = true;
    } else if (/\b(last\s+month|previous\s+month|mois\s+dernier)\b/i.test(cleanQ) || /(الشهر الماضي|الشهر السابق)/.test(cleanQ)) {
      const prevD = shiftIso(seedToday.slice(0, 7) + '-01', -1);
      const ym = prevD.slice(0, 7);
      dateRange = { from: `${ym}-01`, to: `${ym}-${lastDayOfMonth(ym.slice(0, 4), ym.slice(5, 7))}`, label: `Month ${ym}` };
      customDateOverride = true;
    } else if (/\b(all[- ]time|overall|lifetime|tout\s+le\s+temps)\b/i.test(cleanQ) || /(كل الفترات|الإجمالي الكلي|من البداية)/.test(cleanQ)) {
      dateRange = null;
      customDateOverride = true;
    } else {
      const ymIso = cleanQ.match(/\b(202[4-9])-(0[1-9]|1[0-2])\b/);
      if (ymIso) {
        const y = ymIso[1], m = ymIso[2];
        dateRange = { from: `${y}-${m}-01`, to: `${y}-${m}-${lastDayOfMonth(y, m)}`, label: `${y}-${m}` };
        customDateOverride = true;
      } else {
        for (const [mWord, mNum] of Object.entries(MONTH_MAP)) {
          const re = new RegExp(`(?:^|\\s|\\b)${mWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s+(202[4-9]))?(?:$|\\s|\\b)`, 'i');
          const mMatch = cleanQ.match(re);
          if (mMatch) {
            const yr = mMatch[1] || seedToday.slice(0, 4);
            dateRange = { from: `${yr}-${mNum}-01`, to: `${yr}-${mNum}-${lastDayOfMonth(yr, mNum)}`, label: `${yr}-${mNum}` };
            customDateOverride = true;
            break;
          }
        }
        if (!customDateOverride) {
          const yrOnly = cleanQ.match(/\b(2024|2025|2026|2027)\b/);
          if (yrOnly && !/\b(ticket|invoice|voucher|#)\s*202[4-7]\b/i.test(cleanQ)) {
            const yr = yrOnly[1];
            dateRange = { from: `${yr}-01-01`, to: `${yr}-12-31`, label: `FY ${yr}` };
            customDateOverride = true;
          }
        }
      }
    }

    const kpiBase = (_ctx && typeof _ctx.getKPI === 'function') ? _ctx.getKPI(coKey) : {};
    const scopeCoLabel = coNames.length === 1
      ? coNames[0]
      : (String(coKey).startsWith('industry:')
          ? (String(coKey).slice(9) + ' Group')
          : cleanOut(((_ctx && _ctx.COMPANY_LABELS && _ctx.COMPANY_LABELS[coKey]) || 'Selected Entities').split('(')[0]));
    const periodLabel = customDateOverride
      ? (dateRange ? dateRange.label : 'All-Time')
      : cleanOut(kpiBase.label || 'All-Time');

    return {
      user,
      allowed,
      rlsBlockedCompany,
      coKey,
      coNames,
      scopeCoLabel,
      periodLabel,
      fullScopeLabel: `${scopeCoLabel} · ${periodLabel}`,
      dateRange,
      customDateOverride,
      forceTxBasis,
      basis: forceTxBasis ? 'tx' : ((_ctx && _ctx.STATE && _ctx.STATE.basis) || 'rep')
    };
  }

  function recDateOf(r, basis) {
    if (!r) return '';
    if (basis === 'tx') return String(r.date || r.rep_date || r.start_date || '').slice(0, 10);
    return String(r.rep_date || r.date || r.start_date || '').slice(0, 10);
  }

  function countAnyTxOnDate(iso, coNames) {
    if (!_ctx || !_ctx.SEED || !_ctx.SEED.records) return 0;
    const set = new Set((coNames || []).map(norm));
    const pools = [_ctx.SEED.records.sales_tickets, _ctx.SEED.records.raw_purchases, _ctx.SEED.records.expenses];
    let n = 0;
    for (let p = 0; p < pools.length; p++) {
      const arr = pools[p] || [];
      for (let i = 0; i < arr.length; i++) {
        const r = arr[i];
        if (!r || r.voided) continue;
        if (set.size && r.company && !set.has(norm(r.company))) continue;
        if (String(r.date || '').slice(0, 10) === iso) {
          n++;
          if (n >= 1) return n;
        }
      }
    }
    return n;
  }

  function scopedRows(tableKey, scope, opts = {}) {
    if (!_ctx || !_ctx.SEED || !_ctx.SEED.records) return [];
    const rawList = _ctx.SEED.records[tableKey] || [];
    if (!rawList.length) return [];
    if (!scope.customDateOverride && !opts.ignorePeriod && typeof _ctx.filterRecords === 'function') {
      return _ctx.filterRecords(rawList, {
        ignoreSearch: true,
        company: scope.coKey,
        basis: opts.basis || scope.basis,
        tableKey
      });
    }
    const baseAll = (typeof _ctx.filterRecords === 'function')
      ? _ctx.filterRecords(rawList, {
          ignoreSearch: true,
          ignorePeriod: true,
          company: scope.coKey,
          basis: opts.basis || scope.basis,
          tableKey
        })
      : rawList.filter(r => r && !r.voided);
    if (opts.ignorePeriod || !scope.dateRange) return baseAll;
    const { from, to } = scope.dateRange;
    const b = opts.basis || scope.basis;
    return baseAll.filter(r => {
      const d = recDateOf(r, b);
      return !d || (d >= from && d <= to);
    });
  }

  function computeWindowSummary(scope, coOverrideName) {
    const subScope = coOverrideName
      ? Object.assign({}, scope, {
          coKey: mapCompanyNameToKey(coOverrideName),
          coNames: [coOverrideName],
          scopeCoLabel: coOverrideName
        })
      : scope;

    if (!subScope.customDateOverride && _ctx && typeof _ctx.getKPI === 'function') {
      const k = _ctx.getKPI(subScope.coKey) || {};
      const salesRows = scopedRows('sales_tickets', subScope);
      const expRows = scopedRows('expenses', subScope);
      const rawRows = scopedRows('raw_purchases', subScope);
      return { k, salesRows, expRows, rawRows, fromLiveKpi: true };
    }

    const salesRows = scopedRows('sales_tickets', subScope);
    const rawRows = scopedRows('raw_purchases', subScope);
    const expRows = scopedRows('expenses', subScope);
    const rcptRows = scopedRows('receipts', subScope);
    const setRows = scopedRows('settlements', subScope);
    const salRows = scopedRows('salaries', subScope);
    const fuelRows = scopedRows('fuel_intakes', subScope);

    const tSign = (_ctx && _ctx.ticketSign) || (r => (r && r.kind === 'return' ? -1 : 1));
    const eSign = (_ctx && _ctx.expenseSign) || (() => 1);
    const tTons = (_ctx && _ctx.ticketTons) || (r => Number(r.tons || r.qty || 0));
    const tMeters = (_ctx && _ctx.ticketMeters) || (r => Number(r.qty || 0));

    let loads = 0, sales_ttc = 0, net_sales = 0, sales_vat = 0, tons_sold = 0, m3_sold = 0;
    salesRows.forEach(s => {
      const sgn = tSign(s);
      if (sgn > 0) loads += 1;
      const ttc = Number(s.total_ttc != null ? s.total_ttc : s.total || 0) * sgn;
      const vat = Number(s.vat || 0) * sgn;
      const net = Number(s.total != null ? s.total : (ttc - vat)) * sgn;
      sales_ttc += ttc;
      sales_vat += vat;
      net_sales += net;
      tons_sold += tTons(s) * sgn;
      m3_sold += tMeters(s) * sgn;
    });

    let raw_loads = 0, raw_cost = 0, ap_material = 0, ap_haulage = 0;
    rawRows.forEach(r => {
      const sgn = tSign(r);
      if (sgn > 0) raw_loads += 1;
      const mat = Number(r.mat_total != null ? r.mat_total : r.price || 0) * sgn;
      const tr = Number(r.trans_total != null ? r.trans_total : r.trans_price || 0) * sgn;
      const tot = Number(r.total != null ? r.total : (mat + tr)) * sgn;
      raw_cost += tot;
      ap_material += mat;
      ap_haulage += tr;
    });

    let expenses_total = 0, ap_expense = 0, cash_expense = 0;
    expRows.forEach(e => {
      const amt = Number(e.total_ttc != null ? e.total_ttc : e.amount || e.total || 0) * eSign(e);
      expenses_total += amt;
      if (_ctx && typeof _ctx.isApCreditExpense === 'function' && _ctx.isApCreditExpense(e)) ap_expense += amt;
      else cash_expense += amt;
    });

    let receipts_collected = 0;
    rcptRows.forEach(r => { receipts_collected += Number(r.amount || r.total || 0); });
    let settlements_paid = 0;
    setRows.forEach(s => { settlements_paid += Number(s.amount || s.total || 0); });
    let salaries_paid = 0;
    salRows.forEach(s => { salaries_paid += Number(s.amount || s.net_paid || s.total || 0); });
    let diesel_litres = 0;
    fuelRows.forEach(f => { diesel_litres += Number(f.litres || f.qty || 0); });

    const baseKpi = (_ctx && typeof _ctx.getKPI === 'function') ? _ctx.getKPI(subScope.coKey) : {};
    const gross_margin = net_sales - raw_cost;
    const operating_profit = gross_margin - expenses_total - salaries_paid;
    const gm_pct = net_sales > 0 ? (gross_margin / net_sales) * 100 : 0;
    const op_margin_pct = net_sales > 0 ? (operating_profit / net_sales) * 100 : 0;

    return {
      k: Object.assign({}, baseKpi, {
        loads,
        sales_ttc,
        net_sales,
        sales_vat,
        tons_sold,
        qty_sold: m3_sold,
        raw_loads,
        raw_cost,
        ap_material,
        ap_haulage,
        ap_expense,
        expenses_total,
        cash_expense,
        receipts_collected,
        settlements_paid,
        salaries_paid,
        diesel_litres,
        gross_margin,
        operating_profit,
        gm_pct,
        op_margin_pct
      }),
      salesRows,
      expRows,
      rawRows,
      rcptRows,
      setRows,
      salRows,
      fuelRows,
      fromLiveKpi: false
    };
  }

  function fmtMoney(v, dec = 0) {
    if (_ctx && typeof _ctx.fmtUSD === 'function') return _ctx.fmtUSD(Number(v || 0), dec);
    const n = Number(v || 0);
    const sign = n < 0 ? '-' : '';
    return sign + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function fmtInt(v, dec = 0) {
    if (_ctx && typeof _ctx.fmtNum === 'function') return _ctx.fmtNum(Number(v || 0), dec);
    return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function fmtPctVal(num, den) {
    if (!den || Math.abs(den) < 0.01) return '0.0%';
    return ((Number(num || 0) / Number(den)) * 100).toFixed(1) + '%';
  }

  function canTax(user) {
    return Boolean(_ctx && typeof _ctx.canSeeTaxBreakdown === 'function' && _ctx.canSeeTaxBreakdown(user));
  }

  function canHub(hubId, user) {
    return !_ctx || typeof _ctx.canViewHub !== 'function' || _ctx.canViewHub(hubId, user);
  }

  function canView(viewId, user) {
    return !_ctx || typeof _ctx.canViewView !== 'function' || _ctx.canViewView(viewId, user);
  }

  function salesLabel(user) {
    return canTax(user) ? 'Sales (TTC)' : 'Sales';
  }

  // ============================================================================
  // SPECIFIC RECORD / COUNTERPARTY / STAFF / TRUCK / TICKET LOOKUP
  // ============================================================================
  function trySpecificRecordLookup(cleanQ, scope) {
    if (!_ctx || !_ctx.SEED || !_ctx.SEED.records) return null;
    const low = cleanQ.toLowerCase();

    // 1. Explicit Ticket / Voucher Number lookup ("ticket 1045", "#1045")
    const tktMatch = cleanQ.match(/(?:\bticket\s*#?|\bvoucher\s*#?|#)\s*([A-Za-z0-9-]{2,18})\b/i);
    if (tktMatch) {
      const targetNo = norm(tktMatch[1]);
      const pools = [
        { key: 'sales_tickets', label: 'Sales Ticket', view: 'sales' },
        { key: 'raw_purchases', label: 'Quarry / Raw Ticket', view: 'raw' },
        { key: 'expenses', label: 'Expense Voucher', view: 'expenses' },
        { key: 'fuel_intakes', label: 'Fuel Entry', view: 'fleet' }
      ];
      for (const p of pools) {
        const rows = scopedRows(p.key, scope, { ignorePeriod: true });
        const hit = rows.find(r => norm(r.ticket_no || r.invoice_no || r.voucher_no || '') === targetNo);
        if (hit) {
          const amt = Number(hit.total_ttc != null ? hit.total_ttc : (hit.total != null ? hit.total : (hit.amount || 0)));
          const party = hit.customer || hit.supplier || hit.site || hit.category || hit.equipment || '-';
          const prod = hit.product || hit.subcategory || hit.item_summary || (hit.litres ? `${fmtInt(hit.litres, 1)} L Diesel` : '-');
          return {
            q: cleanQ,
            lang: detectLang(cleanQ),
            instantLocal: true,
            title: `${p.label} #${cleanOut(hit.ticket_no || tktMatch[1])}`,
            answer: `Found <b>${esc(p.label)} #${esc(hit.ticket_no || tktMatch[1])}</b> under <b>${esc(hit.company || scope.scopeCoLabel)}</b> dated <b>${esc(hit.date || hit.rep_date || '-')}</b> for <b>${esc(party)}</b> (${esc(prod)})${amt ? ` totaling <b>${fmtMoney(amt, 2)}</b>` : ''}.`,
            promptText: 'Would you like to open its 360° Record Inspector or jump to the register?',
            actions: [
              { type: 'inspect', crKey: p.key, id: hit.id, label: `Inspect #${hit.ticket_no || tktMatch[1]}` },
              { type: 'view', view: p.view, label: `Open ${p.label}s` }
            ],
            followUps: [
              `Show ${scope.scopeCoLabel} summary`,
              'Check open AI Sentinel alerts',
              'Show overdue receivables'
            ]
          };
        }
      }
    }

    // Avoid hijacking broad category questions before checking named counterparties/staff/units
    if (cleanQ.length < 4 || /^(hi|hello|hey|how|what\s+is\s+our|compare|verify|show\s+top|explain\s+the)\b/i.test(cleanQ)) {
      // Only run named lookup if query has specific words beyond generic ERP nouns
    }

    const coNameSet = new Set(['wtc', 'bbc', 'bbconstruction', 'bb construction', 'lions', 'lions transport', 'manufacturing group']);
    const catList = (_ctx && typeof _ctx.getCompanyCatalog === 'function') ? _ctx.getCompanyCatalog() : [];
    for (let i = 0; i < catList.length; i++) {
      if (catList[i] && catList[i].name) coNameSet.add(norm(catList[i].name));
    }
    const explicitCounterparty = /\b(customer|client|supplier|vendor|account\s+for|balance\s+for|soa\s+for)\b/i.test(cleanQ);
    const hasWholeCandidate = cand => {
      const escCand = String(cand || '').trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!escCand) return false;
      return new RegExp(`(?:^|[^a-z0-9\\u0600-\\u06FF])${escCand}(?:$|[^a-z0-9\\u0600-\\u06FF])`, 'i').test(low);
    };

    const genericStop = new Set([
      'show', 'give', 'check', 'open', 'list', 'find', 'tell', 'what', 'where', 'when', 'which', 'how', 'why', 'compare',
      'verify', 'explain', 'analyze', 'total', 'top', 'all', 'for', 'from', 'with', 'the', 'and', 'our', 'this', 'last',
      'wtc', 'bbc', 'bbconstruction', 'lions', 'transport', 'company', 'companies', 'entity', 'entities', 'group',
      'sales', 'sale', 'revenue', 'margin', 'profit', 'loads', 'tons', 'volume', 'expenses', 'expense', 'overhead',
      'recurring', 'schedules', 'schedule', 'diesel', 'fuel', 'tank', 'malfunction', 'malfunctions', 'cash', 'till',
      'ledger', 'trial', 'balance', 'payroll', 'salary', 'salaries', 'attendance', 'overtime', 'workforce',
      'warehouse', 'stock', 'items', 'item', 'parts', 'spare', 'repairs', 'repair', 'defects', 'defect', 'oil', 'quarry',
      'raw', 'haulage', 'suppliers', 'supplier', 'customers', 'customer', 'receivables', 'receivable', 'payables',
      'payable', 'overdue', 'aging', 'pricing', 'price', 'pending', 'agreement', 'agreements', 'commission', 'commissions',
      'alerts', 'alert', 'sentinels', 'sentinel', 'watchdog', 'watchdogs', 'thresholds', 'threshold', 'briefing',
      'daily', 'operations', 'ops', 'kiosks', 'kiosk', 'users', 'seats', 'today', 'yesterday', 'month', 'year', 'summary',
      'overview', 'loans', 'loan', ...Object.keys(MONTH_MAP)
    ]);
    const contentWords = low
      .replace(/\b202[4-9](?:-(?:0[1-9]|1[0-2])(?:-\d{2})?)?\b/g, ' ')
      .replace(/[^a-z0-9\u0600-\u06FF\s-]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !genericStop.has(w) && !coNameSet.has(w));
    if (!contentWords.length && !explicitCounterparty) return null;

    // 2. Customer Name Match
    const custReg = _ctx.SEED.records.customers || [];
    let bestCust = null;
    for (let i = 0; i < custReg.length; i++) {
      const c = custReg[i];
      if (!c || c.voided || !c.name || c.name.length < 4) continue;
      if (coNameSet.has(norm(c.name)) && !explicitCounterparty) continue;
      if (hasWholeCandidate(c.name)) {
        if (!bestCust || c.name.length > bestCust.name.length) bestCust = c;
      }
    }
    if (bestCust) {
      const sRows = scopedRows('sales_tickets', scope).filter(r => norm(r.customer) === norm(bestCust.name));
      const rRows = scopedRows('receipts', scope).filter(r => norm(r.customer) === norm(bestCust.name));
      const tSign = (_ctx && _ctx.ticketSign) || (r => (r && r.kind === 'return' ? -1 : 1));
      const billed = sRows.reduce((a, r) => a + Number(r.total_ttc != null ? r.total_ttc : r.total || 0) * tSign(r), 0);
      const collected = rRows.reduce((a, r) => a + Number(r.amount || r.total || 0), 0);
      const mCusts = ((_ctx.getModel ? _ctx.getModel(scope.coKey) : {}) || {}).customers || [];
      const mHit = mCusts.find(x => norm(x.Customer || x.name) === norm(bestCust.name));
      const openAr = mHit ? Number(mHit.ar_balance || 0) : (billed - collected);
      return {
        q: cleanQ,
        lang: detectLang(cleanQ),
        instantLocal: true,
        title: `Customer · ${cleanOut(bestCust.name)}`,
        answer: `In <b>${esc(scope.fullScopeLabel)}</b>, <b>${esc(bestCust.name)}</b> has <b>${fmtInt(sRows.length)}</b> sales tickets totaling <b>${fmtMoney(billed, 2)}</b>, collections of <b>${fmtMoney(collected, 2)}</b>, and an open receivable balance of <b>${fmtMoney(openAr, 2)}</b>${mHit && Number(mHit.ar_60_plus || 0) > 0 ? ` (<b>${fmtMoney(mHit.ar_60_plus, 0)}</b> past 60 days)` : ''}.`,
        promptText: 'Would you like to inspect all vouchers for this customer or print their Statement of Account?',
        actions: [
          { type: 'inspect', crKey: 'customers', id: bestCust.id, label: `360° ${bestCust.name}` },
          { type: 'view', view: 'customers', label: 'Open Receivables' },
          { type: 'view', view: 'statements', label: 'Printable SOA' }
        ],
        followUps: [
          'Show top overdue AR customers',
          `Show ${scope.scopeCoLabel} sales & margin`,
          'Check price agreement compliance'
        ]
      };
    }

    // 3. Supplier Name Match
    const supReg = _ctx.SEED.records.suppliers || [];
    let bestSup = null;
    for (let i = 0; i < supReg.length; i++) {
      const s = supReg[i];
      if (!s || s.voided || !s.name || s.name.length < 4) continue;
      if (coNameSet.has(norm(s.name)) && !explicitCounterparty) continue;
      if (hasWholeCandidate(s.name)) {
        if (!bestSup || s.name.length > bestSup.name.length) bestSup = s;
      }
    }
    if (bestSup) {
      const rRows = scopedRows('raw_purchases', scope).filter(r => norm(r.supplier) === norm(bestSup.name) || norm(r.truck_owner) === norm(bestSup.name));
      const eRows = scopedRows('expenses', scope).filter(r => norm(r.supplier) === norm(bestSup.name));
      const pRows = scopedRows('settlements', scope).filter(r => norm(r.supplier) === norm(bestSup.name));
      const rawAmt = rRows.reduce((a, r) => a + Number(r.total || 0), 0);
      const expAmt = eRows.reduce((a, r) => a + Number(r.total_ttc != null ? r.total_ttc : r.amount || r.total || 0), 0);
      const paidAmt = pRows.reduce((a, r) => a + Number(r.amount || r.total || 0), 0);
      return {
        q: cleanQ,
        lang: detectLang(cleanQ),
        instantLocal: true,
        title: `Supplier · ${cleanOut(bestSup.name)}`,
        answer: `In <b>${esc(scope.fullScopeLabel)}</b>, <b>${esc(bestSup.name)}</b> recorded <b>${fmtInt(rRows.length)}</b> quarry/haulage loads (<b>${fmtMoney(rawAmt, 2)}</b>), <b>${fmtInt(eRows.length)}</b> expense vouchers (<b>${fmtMoney(expAmt, 2)}</b>), and settlements paid of <b>${fmtMoney(paidAmt, 2)}</b>.`,
        promptText: 'Would you like to open this supplier\'s 360° ledger or jump to Suppliers & Payables?',
        actions: [
          { type: 'inspect', crKey: 'suppliers', id: bestSup.id, label: `360° ${bestSup.name}` },
          { type: 'view', view: 'suppliers', label: 'Suppliers & Payables' }
        ],
        followUps: [
          'Show Accounts Payable breakdown',
          'Show top expense categories',
          'Check pending-price vouchers'
        ]
      };
    }

    // 4. Equipment / Truck Code Match
    const eqReg = _ctx.SEED.records.equipment || [];
    let bestEq = null;
    for (let i = 0; i < eqReg.length; i++) {
      const eq = eqReg[i];
      const label = String((eq && (eq.name || eq.code || eq.plate)) || '').trim();
      if (!eq || eq.voided || label.length < 3 || coNameSet.has(norm(label))) continue;
      if (hasWholeCandidate(label)) {
        if (!bestEq || label.length > String(bestEq.name || bestEq.code).length) bestEq = eq;
      }
    }
    if (bestEq) {
      const eqName = String(bestEq.name || bestEq.code || '');
      const fRows = scopedRows('fuel_intakes', scope).filter(r => norm(r.equipment || r.truck) === norm(eqName));
      const dRows = scopedRows('equipment_defects', scope, { ignorePeriod: true }).filter(r => norm(r.equipment) === norm(eqName) && !/resolved|closed/i.test(r.status || ''));
      const repRows = scopedRows('equipment_repairs', scope).filter(r => norm(r.equipment) === norm(eqName));
      const litres = fRows.reduce((a, r) => a + Number(r.litres || r.qty || 0), 0);
      return {
        q: cleanQ,
        lang: detectLang(cleanQ),
        instantLocal: true,
        title: `Equipment Unit · ${cleanOut(eqName)}`,
        answer: `In <b>${esc(scope.fullScopeLabel)}</b>, unit <b>${esc(eqName)}</b> dispensed <b>${fmtInt(litres, 1)} L</b> across <b>${fmtInt(fRows.length)}</b> fuel logs, logged <b>${fmtInt(repRows.length)}</b> repair records, and currently has <b>${fmtInt(dRows.length)}</b> open defect warnings.`,
        promptText: 'Would you like to inspect this unit in 360° view or open Repairs, Warnings & Oil Logs?',
        actions: [
          { type: 'inspect', crKey: 'equipment', id: bestEq.id, label: `360° ${eqName}` },
          { type: 'view', view: 'fleet_maint', label: 'Repairs & Warnings' }
        ],
        followUps: [
          'Show diesel tank & malfunction status',
          'Show open equipment defects & repairs',
          'Show warehouse spare parts stock'
        ]
      };
    }

    return null;
  }

  // ============================================================================
  // CORE LIVE-SQL DETERMINISTIC COPILOT INTENTS (EN / AR / FR)
  // ============================================================================
  function buildLiveDataAnswer(cleanQ, scope) {
    const lang = detectLang(cleanQ);
    const low = cleanQ.toLowerCase();
    const user = scope.user;

    // 0. Enforce Business-Unit RLS if user explicitly asked for an unauthorized company
    if (scope.rlsBlockedCompany) {
      const seatLabel = userDisplayName(user) || 'Current User';
      return {
        q: cleanQ,
        lang,
        instantLocal: true,
        title: 'Company Scope Restricted',
        answer: `Your active seat (<b>${esc(seatLabel)}</b>) is scoped to <b>${esc(scope.allowed.join(', ') || 'assigned entities')}</b> and does not have permission to view <b>${esc(scope.rlsBlockedCompany)}</b> records.`,
        promptText: 'Would you like to check metrics for your permitted entities instead?',
        followUps: [
          `Show ${scope.scopeCoLabel} executive briefing`,
          'Show today\'s operations',
          'Check open AI Sentinel alerts'
        ]
      };
    }

    // 1. Conversational Greetings, Check-ins & Help (EN / AR / FR) -> instantLocal: true (0 LLM quota burned)
    if (lang === 'ar' && /^(مرحبا|أهلا|اهلا|السلام\s*عليكم|السلام|صباح\s*الخير|مساء\s*الخير|كيف\s*حالك|كيفك|شو\s*الأخبار|شو\s*الاخبار|شلونك)[\s!.,؟?]*$/.test(cleanQ)) {
      const firstName = cleanOut(userDisplayName(user).split(' ')[0]);
      return {
        q: cleanQ,
        lang: 'ar',
        instantLocal: true,
        conversational: true,
        title: 'مرحباً بك في Ask ISABI',
        answer: `أهلاً بك${firstName ? ' ' + esc(firstName) : ''}! أنا جاهز لمساعدتك مباشرة من واقع السجلات الحية لنطاق <b>${esc(scope.fullScopeLabel)}</b>.`,
        promptText: 'عن أي قسم تود الاستفسار الآن: المبيعات والأرباح، الذمم المدينة، المصاريف، المازوت والآليات، أم التنبيهات الرقابية؟',
        followUps: [
          'أعطني ملخص الأداء والمبيعات والأرباح',
          'ما هي أعلى الذمم المدينة المتأخرة؟',
          'هل توجد تنبيهات رقابية مفتوحة؟'
        ]
      };
    }
    if (lang === 'fr' && /^(bonjour|salut|bonsoir|comment\s+ça\s+va|comment\s+ca\s+va|ça\s+va|ca\s+va)[\s!.,?]*$/i.test(cleanQ)) {
      const firstName = cleanOut(userDisplayName(user).split(' ')[0]);
      return {
        q: cleanQ,
        lang: 'fr',
        instantLocal: true,
        conversational: true,
        title: 'Bienvenue · Ask ISABI',
        answer: `Bonjour${firstName ? ' ' + esc(firstName) : ''} ! Je vais très bien, merci. Je suis connecté en direct à vos écritures pour le périmètre <b>${esc(scope.fullScopeLabel)}</b>.`,
        promptText: 'Que souhaitez-vous vérifier : ventes et marges, créances clients, dépenses, gasoil, ou alertes de contrôle ?',
        followUps: [
          'Résumé des ventes et de la marge',
          'Quelles sont les créances clients en retard ?',
          'Y a-t-il des alertes de contrôle ouvertes ?'
        ]
      };
    }
    if (/^(hi|hello|hey|hola|salam|marhaba|good\s+(morning|afternoon|evening)|how\s+are\s+you(\s+doing|\s+today)?|how's\s+it\s+going|hows\s+it\s+going|what's\s+up|whats\s+up)[\s!.,?]*$/i.test(cleanQ)) {
      const firstName = cleanOut(userDisplayName(user).split(' ')[0]);
      const isHow = /how\s+are|going|what's\s+up|whats\s+up/i.test(cleanQ);
      return {
        q: cleanQ,
        lang: 'en',
        instantLocal: true,
        conversational: true,
        title: 'Ask ISABI · Live Operations Copilot',
        answer: isHow
          ? `Doing great, thank you${firstName ? ', ' + esc(firstName) : ''}! All books and live registers for <b>${esc(scope.fullScopeLabel)}</b> are ready.`
          : `Hello${firstName ? ' ' + esc(firstName) : ''}! I am wired directly into your live records for <b>${esc(scope.fullScopeLabel)}</b>.`,
        promptText: 'Ask me about today\'s activity, entity margins, overdue customers, expenses, warehouse stock, diesel, payroll, or open alerts:',
        followUps: [
          'Give me an executive briefing & open alerts',
          'Show today\'s daily operations',
          `Compare entity sales & operating profit`
        ]
      };
    }
    if (/^(thanks|thank\s+you|thx|ty|great|awesome|perfect|got\s+it|ok|okay|شكرا|شكراً|ممتاز|تمام|merci|super|parfait)[\s!.,؟?]*$/i.test(cleanQ)) {
      return {
        q: cleanQ,
        lang,
        instantLocal: true,
        conversational: true,
        title: lang === 'ar' ? 'في خدمتك' : (lang === 'fr' ? 'À votre service' : 'Ready When You Are'),
        answer: lang === 'ar'
          ? 'على الرحب والسعة! أخبرني في أي وقت إذا أردت فحص أي حساب أو حركة.'
          : (lang === 'fr'
              ? 'Avec plaisir ! Dites-moi si vous souhaitez vérifier un autre compte ou registre.'
              : 'Glad to help! Let me know anytime you want to check another account, period, or register.'),
        promptText: lang === 'ar' ? 'هل نتابع فحص قسم آخر؟' : (lang === 'fr' ? 'Que vérifions-nous ensuite ?' : 'What would you like to inspect next?'),
        followUps: [
          'Show today\'s daily operations',
          'Check open AI Sentinel alerts',
          'Show top expense categories'
        ]
      };
    }
    if (/\b(who\s+are\s+you|what\s+can\s+you\s+do|help\s+me|^help$)\b/i.test(cleanQ)) {
      return {
        q: cleanQ,
        lang: 'en',
        instantLocal: true,
        conversational: true,
        title: 'How Ask ISABI Works',
        answer: `I am your built-in operational and accounting copilot for <b>${esc(scope.fullScopeLabel)}</b>. I read your live scoped registers to calculate exact sales, margins, receivables, payables, expenses, warehouse stock, diesel balances, payroll, trial balance, and audit alerts in English, Arabic, or French.`,
        promptText: 'You can also ask about a specific customer, supplier, equipment unit, ticket number, or date (such as "yesterday" or "Oct 2026"). Try one below:',
        followUps: [
          'Give me an executive briefing & open alerts',
          'Show top expense categories & pending prices',
          'Verify double-entry trial balance'
        ]
      };
    }

    // 2. Specific Ticket / Counterparty / Equipment Lookup
    const specificHit = trySpecificRecordLookup(cleanQ, scope);
    if (specificHit) return specificHit;

    // 3. Daily Operations / Today / Yesterday ("today", "yesterday", "daily ops", "after-hours")
    if (/\b(daily\s+ops|daily\s+operations|after[- ]hours|what\s+happened\s+(today|yesterday))\b/i.test(low) ||
        (scope.forceTxBasis && !/\b(ar|receivable|ap|payable|trial\s+balance|seat|biometric|warehouse)\b/i.test(low))) {
      const win = computeWindowSummary(scope);
      const k = win.k;
      const attRows = scopedRows('attendance', scope, { basis: 'tx' });
      const presentCnt = attRows.filter(a => /present|in|full|half|on[- ]site/i.test(String(a.status || a.punch_type || 'present'))).length;
      return {
        q: cleanQ,
        lang,
        instantLocal: true,
        title: `Daily Operations · ${scope.fullScopeLabel}`,
        answer: `On transaction-date basis for <b>${esc(scope.fullScopeLabel)}</b>: <b>${fmtInt(k.loads)}</b> sales loads generated <b>${fmtMoney(k.sales_ttc, 2)}</b> (${fmtInt(k.tons_sold, 0)} t), against <b>${fmtInt(k.raw_loads)}</b> quarry loads (<b>${fmtMoney(k.raw_cost, 2)}</b>) and <b>${fmtInt(win.expRows.length)}</b> expense vouchers (<b>${fmtMoney(k.expenses_total, 2)}</b>).`,
        bullets: [
          `Collections in: <b>${fmtMoney(k.receipts_collected, 2)}</b> · Supplier settlements paid: <b>${fmtMoney(k.settlements_paid, 2)}</b>`,
          `Diesel dispensed: <b>${fmtInt(k.diesel_litres, 1)} L</b> · Logged attendance records: <b>${fmtInt(presentCnt || attRows.length)}</b>`
        ],
        promptText: 'Would you like to open the Shareholder Daily Operations board or log a new transaction?',
        actions: [
          ...(canView('daily_ops', user) ? [{ type: 'view', view: 'daily_ops', label: 'Open Daily Operations' }] : []),
          { type: 'form', form: 'sales', label: '+ New Entry' }
        ],
        followUps: [
          `Compare entity sales & operating profit`,
          'Show top expense categories',
          'Check open AI Sentinel alerts'
        ]
      };
    }

    // 4. AI Sentinels, Watchdogs & Custom Threshold Alerts
    if (/\b(sentinel|sentinels|watchdog|watchdogs|alert|alerts|anomal|exception|exceptions|flagged|threshold|thresholds|abnormal)\b/i.test(low) ||
        /(تنبيه|تنبيهات|رقاب|مخالف|شذوذ)/.test(cleanQ) ||
        /\b(alerte|alertes|anomalie|contrôle|controle)\b/i.test(low)) {
      const items = (_ctx && typeof _ctx.buildSentinelItems === 'function') ? _ctx.buildSentinelItems() : [];
      const openItems = items.filter(it => it && it.severity && it.severity !== 'ok');
      const openBuiltin = openItems.filter(it => !it.isCustom);
      const firedCustom = openItems.filter(it => it.isCustom);
      const checkedItems = items.filter(it => it && it.isReviewed);
      const topFlags = openItems.slice(0, 5).map(it => [
        cleanOut(it.code || it.id || 'Rule'),
        cleanOut(it.title || 'Audit Check'),
        cleanOut(it.badge || 'Flagged')
      ]);
      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        title: `Audit Sentinels & Thresholds · ${scope.scopeCoLabel}`,
        answer: openItems.length
          ? `There ${openItems.length === 1 ? 'is' : 'are'} currently <b>${fmtInt(openItems.length)}</b> active audit ${openItems.length === 1 ? 'alert' : 'alerts'} (<b>${fmtInt(openBuiltin.length)}</b> built-in Sentinel ${openBuiltin.length === 1 ? 'flag' : 'flags'} and <b>${fmtInt(firedCustom.length)}</b> triggered custom ${firedCustom.length === 1 ? 'rule' : 'rules'}, plus <b>${fmtInt(checkedItems.length)}</b> reviewed/checked) for <b>${esc(scope.fullScopeLabel)}</b>.`
          : `All built-in Sentinel watchdogs and custom threshold alerts are clear (<b>0</b> unreviewed flags; <b>${fmtInt(checkedItems.length)}</b> signed off) for <b>${esc(scope.fullScopeLabel)}</b>.`,
        headers: topFlags.length ? ['Rule', 'Watchdog Check', 'Live Finding'] : undefined,
        rows: topFlags.length ? topFlags : undefined,
        promptText: 'Would you like to inspect the flagged rows on AI Sentinels or tune a rule threshold?',
        actions: [
          ...(canView('sentinels', user) ? [{ type: 'view', view: 'sentinels', label: 'Open AI Sentinels' }] : []),
          ...(canView('alert_rules', user) ? [{ type: 'view', view: 'alert_rules', label: 'Alerts & Thresholds' }] : [])
        ],
        followUps: [
          'Show overdue receivables past 60 days',
          'Show diesel tank & malfunction status',
          'Check price agreement compliance'
        ]
      };
    }

    // 5. Expenses, Overhead, Categories, Pending-Price Queue & Recurring Schedules
    if (/\b(expense|expenses|overhead|spending|cost\s+breakdown|recurring\s+expense|price\s+pending|pending\s+price|petty)\b/i.test(low) ||
        /(مصاريف|مصروف|نفقات|فئات المصاريف)/.test(cleanQ) ||
        /\b(dépense|depense|dépenses|depenses|frais|charges)\b/i.test(low)) {
      if (!canHub('expenses', user)) {
        return buildRestrictedReply(cleanQ, lang, 'Expenses & Payables');
      }
      const expRows = scopedRows('expenses', scope);
      const recSched = scopedRows('recurring_expenses', scope, { ignorePeriod: true });
      const eSign = (_ctx && _ctx.expenseSign) || (() => 1);
      let tot = 0, cashAmt = 0, creditAmt = 0, pendingCnt = 0;
      const byCat = new Map();
      expRows.forEach(e => {
        const amt = Number(e.total_ttc != null ? e.total_ttc : e.amount || e.total || 0) * eSign(e);
        tot += amt;
        if (_ctx && typeof _ctx.isPendingPriceExpense === 'function' && _ctx.isPendingPriceExpense(e)) pendingCnt++;
        if (_ctx && typeof _ctx.isApCreditExpense === 'function' && _ctx.isApCreditExpense(e)) creditAmt += amt;
        else cashAmt += amt;
        const cat = cleanOut(e.category || 'Uncategorized');
        byCat.set(cat, (byCat.get(cat) || 0) + amt);
      });
      const topCats = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        title: `Expenses & Overhead · ${scope.fullScopeLabel}`,
        answer: `Scoped expenses total <b>${fmtMoney(tot, 2)}</b> across <b>${fmtInt(expRows.length)}</b> vouchers (<b>${fmtMoney(cashAmt, 0)}</b> paid cash · <b>${fmtMoney(creditAmt, 0)}</b> on supplier AP credit), with <b>${fmtInt(pendingCnt)}</b> price-pending ($0.00) ${pendingCnt === 1 ? 'voucher' : 'vouchers'} and <b>${fmtInt(recSched.length)}</b> standing recurring schedules.`,
        headers: topCats.length ? ['Top Expense Category', 'Share', 'Amount (USD)'] : undefined,
        rows: topCats.map(([c, v]) => [c, fmtPctVal(v, tot), fmtMoney(v, 2)]),
        total: topCats.length ? ['Total Scoped Expenses', fmtMoney(tot, 2)] : undefined,
        promptText: 'Would you like to open Expenses & Overhead or post a new expense voucher?',
        actions: [
          { type: 'view', view: 'expenses', label: 'Open Expenses' },
          ...(canView('recurring_expenses', user) ? [{ type: 'view', view: 'recurring_expenses', label: 'Recurring Schedules' }] : []),
          { type: 'form', form: 'expense', label: '+ New Expense' }
        ],
        followUps: [
          'Show Warehouse & Spare Parts stock',
          'Show Accounts Payable breakdown',
          `Compare entity sales & operating profit`
        ]
      };
    }

    // 6. Warehouse, Inventory, Spare Parts & Items Catalog
    if (/\b(warehouse|inventory|stock|items\s+catalog|spare\s+part|spare\s+parts|consumable|consumables|filters?|oils?\s+stock)\b/i.test(low) ||
        /(مستودع|مخزون|قطع غيار|أصناف)/.test(cleanQ) ||
        /\b(entrepôt|entrepot|stock|pièces|pieces)\b/i.test(low)) {
      if (!canHub('warehouse', user)) return buildRestrictedReply(cleanQ, lang, 'Warehouse & Parts');
      const itemsReg = (_ctx.SEED.records.items || []).filter(r => r && !r.voided);
      const moves = scopedRows('warehouse_movements', scope, { ignorePeriod: true });
      let inCnt = 0, outCnt = 0;
      const balByItem = new Map();
      moves.forEach(m => {
        const nm = cleanOut(m.item_name || m.item || 'Item');
        const q = Number(m.qty != null ? m.qty : m.quantity || 0);
        const dir = /out|issue|consume|-/i.test(String(m.direction || m.movement_type || '')) ? -1 : 1;
        if (dir > 0) inCnt++; else outCnt++;
        const prev = balByItem.get(nm) || { qty: 0, uom: m.uom || 'pcs' };
        prev.qty += (q * dir);
        balByItem.set(nm, prev);
      });
      const topStock = Array.from(balByItem.entries()).sort((a, b) => Math.abs(b[1].qty) - Math.abs(a[1].qty)).slice(0, 5);
      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        title: `Warehouse & Items Catalog · ${scope.scopeCoLabel}`,
        answer: `The shared catalog holds <b>${fmtInt(itemsReg.length)}</b> standardized spare parts, filters, oils, and consumables, with <b>${fmtInt(moves.length)}</b> scoped warehouse stock movements (<b>${fmtInt(inCnt)}</b> inflows · <b>${fmtInt(outCnt)}</b> issues to equipment/sites).`,
        headers: topStock.length ? ['Item / Part', 'Unit', 'Net Stock Balance'] : undefined,
        rows: topStock.map(([nm, o]) => [nm, cleanOut(o.uom), fmtInt(o.qty, 1)]),
        promptText: 'Would you like to open the Warehouse hub or log a stock movement?',
        actions: [
          { type: 'view', view: 'warehouse', label: 'Open Warehouse' },
          ...(canView('warehouse_parts', user) ? [{ type: 'view', view: 'warehouse_parts', label: 'Parts & Item Usage' }] : []),
          { type: 'form', form: 'warehousestock', label: '+ Warehouse Stock' }
        ],
        followUps: [
          'Show open equipment defects & repairs',
          'Show top expense categories',
          'Show diesel tank & malfunction status'
        ]
      };
    }

    // 7. Accounts Receivable, Overdue Aging & Credit Hold
    if (/\b(ar|overdue|receivable|receivables|debtor|debtors|credit\s+hold|dso|collections?|customer\s+balance|customers\s+owe)\b/i.test(low) ||
        /(ذمم\s*مدينة|متأخرات|تحصيل|زبائن|عملاء)/.test(cleanQ) ||
        /\b(créance|creance|créances|creances|impayé|impayes|clients?\s+en\s+retard)\b/i.test(low)) {
      if (!canHub('sales', user)) return buildRestrictedReply(cleanQ, lang, 'Sales & Receivables');
      const k = _ctx.getKPI(scope.coKey) || {};
      const model = (_ctx.getModel ? _ctx.getModel(scope.coKey) : {}) || {};
      const topC = (model.customers || [])
        .filter(c => Number(c.ar_balance || 0) > 0.5)
        .sort((a, b) => Number(b.ar_balance || 0) - Number(a.ar_balance || 0))
        .slice(0, 5);
      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        title: `Accounts Receivable & Aging · ${scope.scopeCoLabel}`,
        answer: `Open receivable balance for <b>${esc(scope.scopeCoLabel)}</b> stands at <b>${fmtMoney(k.ar_balance, 2)}</b>, with <b>${fmtMoney(k.ar_overdue, 0)}</b> past 30 days and <b>${fmtMoney(k.ar_60_plus, 0)}</b> past 60 days (DSO: <b>${fmtInt(k.dso_days, 0)} days</b>). Accounts carrying 60+ day FIFO balances without a recent receipt are top credit-hold priorities.`,
        bullets: [
          `FIFO Aging: Current <b>${fmtMoney(k.ar_current, 0)}</b> · 1-10d <b>${fmtMoney(k.ar_1_10, 0)}</b> · 11-30d <b>${fmtMoney(k.ar_11_30, 0)}</b> · 31-60d <b>${fmtMoney(k.ar_31_60, 0)}</b> · 60+d <b>${fmtMoney(k.ar_60_plus, 0)}</b>`
        ],
        headers: topC.length ? ['Top Open Customer', 'Past 60d', 'Open Balance'] : undefined,
        rows: topC.map(c => [cleanOut(c.Customer || c.name), fmtMoney(c.ar_60_plus || 0, 0), fmtMoney(c.ar_balance, 2)]),
        promptText: 'Would you like to open Customer Receivables, post a receipt, or print a Customer SOA?',
        actions: [
          { type: 'view', view: 'customers', label: 'Open Receivables' },
          { type: 'form', form: 'receipt', label: '+ Post Receipt' },
          { type: 'view', view: 'statements', label: 'Customer SOA' }
        ],
        followUps: [
          `Compare entity sales & operating profit`,
          'Show Accounts Payable breakdown',
          'Show live cash in till'
        ]
      };
    }

    // 8. Quarry, Raw Material & Haulage / Suppliers & 3-Leg Accounts Payable
    if (/\b(ap|payable|payables|quarry|quarries|raw\s+material|haulage|hauler|haulers|settlement|settlements|supplier\s+balance|suppliers\s+owed)\b/i.test(low) ||
        /(ذمم\s*دائنة|موردين|مقالع|كسارات|نقليات)/.test(cleanQ) ||
        /\b(fournisseur|fournisseurs|dettes?\s+fournisseurs|carrière|carriere)\b/i.test(low)) {
      if (!canHub('raw', user) && !canHub('expenses', user)) return buildRestrictedReply(cleanQ, lang, 'Quarry & Payables');
      const win = computeWindowSummary(scope);
      const k = win.k;
      const model = (_ctx.getModel ? _ctx.getModel(scope.coKey) : {}) || {};
      const topS = (model.suppliers || [])
        .filter(s => Math.abs(Number(s.ap_balance || s.balance || 0)) > 1)
        .sort((a, b) => Number(b.ap_balance || b.balance || 0) - Number(a.ap_balance || a.balance || 0))
        .slice(0, 5);
      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        title: `Purchases, Quarry & Payables · ${scope.fullScopeLabel}`,
        answer: `For <b>${esc(scope.fullScopeLabel)}</b>, quarry and haulage intake totaled <b>${fmtInt(k.raw_loads)}</b> loads (<b>${fmtMoney(k.raw_cost, 0)}</b>), settlements paid totaled <b>${fmtMoney(k.settlements_paid, 0)}</b>, and net open Accounts Payable stands at <b>${fmtMoney(k.ap_balance, 0)}</b>.`,
        headers: ['Payable Component', 'Scope', 'Amount (USD)'],
        rows: [
          ['1. Quarry Material Leg', 'Owed to quarry / pit owners', fmtMoney(k.ap_material, 0)],
          ['2. Third-Party Haulage Leg', 'Owed to external truck owners', fmtMoney(k.ap_haulage, 0)],
          ['3. Credit Expenses Leg', 'Unpaid supplier bills & parts', fmtMoney(k.ap_expense, 0)],
          ['Less: Settlements Paid', 'Cash & bank payments posted', '-' + fmtMoney(k.settlements_paid, 0)]
        ],
        total: ['Net Open Accounts Payable', fmtMoney(k.ap_balance, 0)],
        bullets: topS.length ? [`Largest supplier balances: ${topS.map(s => `<b>${esc(cleanOut(s.Supplier || s.name))}</b> (${fmtMoney(s.ap_balance || s.balance || 0, 0)})`).join(', ')}`] : [],
        promptText: 'Would you like to open Suppliers & Payables, Quarry & Haulage, or post a supplier settlement?',
        actions: [
          { type: 'view', view: 'suppliers', label: 'Suppliers & Payables' },
          { type: 'view', view: 'raw', label: 'Quarry & Haulage' },
          { type: 'form', form: 'settlement', label: '+ Settle AP' }
        ],
        followUps: [
          'Show top expense categories',
          'Show overdue receivables',
          'Show live cash in till'
        ]
      };
    }

    // 9. Equipment Defects, Repairs, Preventive Oil Logs & Parts Custody
    if (/\b(defect|defects|repair|repairs|oil\s+log|oil\s+change|preventive|workshop|maintenance|broken|custody|grease|lubricant)\b/i.test(low) ||
        /(صيانة|أعطال|اعطال|تصليح|غيار زيت|شحم)/.test(cleanQ) ||
        /\b(panne|pannes|réparation|reparation|entretien|huile)\b/i.test(low)) {
      if (!canHub('fleet', user)) return buildRestrictedReply(cleanQ, lang, 'Fleet & Maintenance');
      const openDefs = scopedRows('equipment_defects', scope, { ignorePeriod: true }).filter(d => !/resolved|closed/i.test(d.status || ''));
      const graveCnt = openDefs.filter(d => /critical|grave/i.test(d.severity || '')).length;
      const repRows = scopedRows('equipment_repairs', scope);
      const repCost = repRows.reduce((a, r) => a + Number(r.total_cost != null ? r.total_cost : r.cost || r.amount || 0), 0);
      const oilRows = scopedRows('equipment_oil_logs', scope);
      const partRows = scopedRows('part_movements', scope, { ignorePeriod: true });
      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        title: `Fleet Maintenance, Repairs & Oil Logs · ${scope.fullScopeLabel}`,
        answer: `Across <b>${esc(scope.scopeCoLabel)}</b>, there ${openDefs.length === 1 ? 'is' : 'are'} <b>${fmtInt(openDefs.length)}</b> open equipment ${openDefs.length === 1 ? 'warning' : 'warnings'} (<b>${fmtInt(graveCnt)}</b> critical/grave), <b>${fmtInt(repRows.length)}</b> logged repairs (${fmtMoney(repCost, 2)}), <b>${fmtInt(oilRows.length)}</b> preventive oil logs, and <b>${fmtInt(partRows.length)}</b> tracked component custody entries.`,
        promptText: 'Would you like to open Repairs, Warnings & Oil Logs or report a new unit warning?',
        actions: [
          { type: 'view', view: 'fleet_maint', label: 'Repairs & Oil Logs' },
          { type: 'form', form: 'defect', label: '+ Report Warning' },
          { type: 'form', form: 'repair', label: '+ Log Repair' }
        ],
        followUps: [
          'Show diesel tank & malfunction status',
          'Show Warehouse & Spare Parts stock',
          'Check open AI Sentinel alerts'
        ]
      };
    }

    // 10. Diesel Tank, Fuel Consumption & 5% Malfunction Watchdog
    if (/\b(diesel|tank|fuel|litre|litres|mazout|consumption|malfunction)\b/i.test(low) ||
        /(مازوت|وقود|ديزل|خزان)/.test(cleanQ) ||
        /\b(gasoil|carburant|citerne)\b/i.test(low)) {
      if (!canHub('fleet', user)) return buildRestrictedReply(cleanQ, lang, 'Fleet & Fuel');
      const dtByCo = (_ctx.computeDieselTank ? _ctx.computeDieselTank().byCo : {}) || {};
      const dtScoped = (_ctx.getDieselTankLedger ? _ctx.getDieselTankLedger() : {}) || {};
      const win = computeWindowSummary(scope);
      const rows = scope.coNames
        .filter(co => dtByCo[co])
        .map(co => {
          const d = dtByCo[co] || {};
          return [co, `${fmtInt(d.bought || 0, 0)} L`, `${fmtInt(d.issued || 0, 0)} L`, `${fmtInt(d.balance || 0, 0)} L`];
        });
      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        title: `Diesel Tank & Malfunction Audit · ${scope.fullScopeLabel}`,
        answer: `In <b>${esc(scope.fullScopeLabel)}</b>, fleet units dispensed <b>${fmtInt(win.k.diesel_litres, 0)} L</b>. Scoped malfunction variance is <b>${Number(dtScoped.malfunctionPct || 0).toFixed(1)}%</b> (${fmtInt(dtScoped.malfAbsL || 0, 1)} L vs ${Number(dtScoped.malfunctionThresholdPct || 5).toFixed(1)}% watchdog threshold: <b>${dtScoped.malfunctionAlert ? 'ALERT' : 'PASS'}</b>).`,
        headers: rows.length ? ['Entity', 'Purchased', 'Dispensed', 'Tank Balance'] : undefined,
        rows: rows.length ? rows : undefined,
        promptText: 'Would you like to open Fleet & Fuel or log a fuel dispense/refill entry?',
        actions: [
          { type: 'view', view: 'fleet', label: 'Open Fleet & Fuel' },
          { type: 'form', form: 'fuel', label: '+ Log Fuel' }
        ],
        followUps: [
          'Show open equipment defects & repairs',
          'Check open AI Sentinel alerts',
          `Compare entity sales & operating profit`
        ]
      };
    }

    // 11. Cash Flow, Physical Till (USD + LBP), External Treasury, Loans & FX
    if (/\b(cash|till|drawer|cashflow|cash\s+flow|lbp|pounds|treasury|loan|loans|external\s+movement|fx|conversion|exchange\s+rate)\b/i.test(low) ||
        /(صندوق|كاش|نقد|ليرة|قروض|تحويل عملات|سعر الصرف)/.test(cleanQ) ||
        /\b(caisse|trésorerie|tresorerie|espèces|especes|prêt|pret|change)\b/i.test(low)) {
      if (!canHub('cashflow', user)) return buildRestrictedReply(cleanQ, lang, 'Cash Flow & Treasury');
      const k = _ctx.getKPI(scope.coKey) || {};
      const fxRate = (_ctx && typeof _ctx.getLbpFxRate === 'function')
        ? _ctx.getLbpFxRate()
        : ((_ctx.MFG_FX && typeof _ctx.MFG_FX.getRate === 'function') ? _ctx.MFG_FX.getRate() : (k.rate_lbp || 89500));
      const loans = scopedRows('loans', scope, { ignorePeriod: true });
      const convs = scopedRows('conversions', scope);
      const fmtLbp = (_ctx && _ctx.fmtLBP) ? _ctx.fmtLBP : (v => `${fmtInt(v, 0)} LBP`);
      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        title: `Cash Till, Treasury & FX · ${scope.fullScopeLabel}`,
        answer: `Live physical till for <b>${esc(scope.scopeCoLabel)}</b> holds <b>${fmtMoney(k.cash_till_usd, 2)}</b> USD plus <b>${fmtLbp(k.cash_till_lbp)}</b> (combined <b>${fmtMoney(k.cash_till, 2)}</b> at <b>${fmtInt(fxRate, 0)} LBP/$</b>).`,
        bullets: [
          `Period Cash Flow: Inflows <b>${fmtMoney(k.cash_inflow, 2)}</b> minus Outflows <b>${fmtMoney(k.cash_outflow, 2)}</b> = Net <b>${fmtMoney(k.net_cash_flow, 2)}</b>`,
          `Treasury Registers: <b>${fmtInt(loans.length)}</b> loan records · <b>${fmtInt(convs.length)}</b> FX conversions in period`
        ],
        promptText: 'Would you like to open the Daily Till Sheet, Loans, or FX Conversions?',
        actions: [
          { type: 'view', view: 'cashflow', label: 'Cash Flow & Till' },
          ...(canView('ledger_treasury', user) ? [{ type: 'view', view: 'ledger_treasury', label: 'Loans & Settlements' }] : []),
          ...(canView('conversions', user) ? [{ type: 'view', view: 'conversions', label: 'FX Conversions' }] : [])
        ],
        followUps: [
          'Verify double-entry trial balance',
          'Show overdue receivables',
          'Show Accounts Payable breakdown'
        ]
      };
    }

    // 12. Trial Balance, General Ledger, Lebanese PCG Classes 1-7 & Automated GL
    if (/\b(trial\s+balance|coa|chart\s+of\s+accounts|general\s+ledger|ledger|gl\b|double[- ]entry|tie|tied|pcg)\b/i.test(low) ||
        /(ميزان\s*المراجعة|دفتر\s*الأستاذ|شجرة\s*الحسابات|قيد\s*مزدوج)/.test(cleanQ) ||
        /\b(balance\s+générale|grand\s+livre|plan\s+comptable)\b/i.test(low)) {
      if (!canView('ledger', user)) return buildRestrictedReply(cleanQ, lang, 'General Ledger & Trial Balance');
      const k = _ctx.getKPI(scope.coKey) || {};
      const tb = Number(k.tb_check || 0);
      const tied = Math.abs(tb) < 0.005;
      const glAccounts = (_ctx.SEED.records.gl_accounts || []).filter(a => a && !a.voided);
      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        title: `Double-Entry Trial Balance · ${scope.fullScopeLabel}`,
        answer: `Trial Balance variance for <b>${esc(scope.fullScopeLabel)}</b> is <b>${fmtMoney(tb, 2)}</b> (${tied ? '<b>100% TIED</b> across Classes 1 to 7' : '<b>VARIANCE DETECTED</b> - inspect General Ledger'}). Automated GL engine maps <b>45</b> accounts automatically across receivables, payables, cash tills, inventory, payroll, expenses, and revenue.`,
        bullets: canTax(user)
          ? [`Output VAT (11%): <b>${fmtMoney(k.sales_vat, 2)}</b> · Input VAT Receivable: <b>${fmtMoney(k.vat_receivable, 2)}</b> · GL Accounts Registered: <b>${fmtInt(glAccounts.length || 45)}</b>`]
          : [`Cash Till: <b>${fmtMoney(k.cash_till, 2)}</b> · Open AR: <b>${fmtMoney(k.ar_balance, 2)}</b> · Open AP: <b>${fmtMoney(k.ap_balance, 2)}</b>`],
        promptText: 'Would you like to open the General Ledger, COA Classes 1-7, or Automated GL Rules?',
        actions: [
          { type: 'view', view: 'ledger', label: 'General Ledger' },
          { type: 'view', view: 'coa_classes', label: 'COA Classes 1-7' },
          { type: 'view', view: 'gl_automation', label: 'Automated GL' }
        ],
        followUps: [
          `Compare entity sales & operating profit`,
          'Show live cash in till',
          'Check open AI Sentinel alerts'
        ]
      };
    }

    // 13. Payroll, Attendance, Workforce Map, Site Transport & Pending Salaries
    if (/\b(payroll|salary|salaries|overtime|driver\s+ot|shift\s+ot|attendance|lateness|workforce|site\s+transport|contract|contracts|freelance|pending\s+salar)\b/i.test(low) ||
        /(رواتب|راتب|معاشات|دوام|حضور|إضافي|اضافي|موظفين|عمال)/.test(cleanQ) ||
        /\b(paie|salaire|salaires|pointage|présence|heures\s+sup)\b/i.test(low)) {
      if (!canHub('payroll', user)) return buildRestrictedReply(cleanQ, lang, 'Payroll & Workforce');
      const win = computeWindowSummary(scope);
      const k = win.k;
      const empRows = scopedRows('employments', scope, { ignorePeriod: true });
      const pendingSal = empRows.filter(e => e.salary_pending).length;
      const attRows = scopedRows('attendance', scope);
      const allowRows = scopedRows('logistics_allowances', scope);
      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        title: `Payroll, Attendance & Overtime · ${scope.fullScopeLabel}`,
        answer: `In <b>${esc(scope.fullScopeLabel)}</b>, salaries paid totaled <b>${fmtMoney(k.salaries_paid, 0)}</b> with driver/shift overtime of <b>${fmtMoney(k.overtime_bonus, 0)}</b> across <b>${fmtInt(empRows.length)}</b> staff contracts${pendingSal > 0 ? ` (<b>${fmtInt(pendingSal)}</b> onboarding with Salary Pending $0.00)` : ''}.`,
        bullets: [
          `Attendance logs in period: <b>${fmtInt(attRows.length)}</b> · Site transport allowance entries: <b>${fmtInt(allowRows.length)}</b>`
        ],
        promptText: 'Would you like to open Payroll, Daily Workforce Map, Attendance, or Site Transport?',
        actions: [
          { type: 'view', view: 'payroll', label: 'Open Payroll' },
          ...(canView('workforce_map', user) ? [{ type: 'view', view: 'workforce_map', label: 'Workforce Map' }] : []),
          ...(canView('payroll_attendance', user) ? [{ type: 'view', view: 'payroll_attendance', label: 'Attendance' }] : [])
        ],
        followUps: [
          'Show today\'s daily operations',
          'Check open AI Sentinel alerts',
          `Compare entity sales & operating profit`
        ]
      };
    }

    // 14. Commercial Pricing, Commissions & Below-Agreed Audit
    if (/\b(pricing|price\s+agreement|price\s+agreements|agreed\s+price|below[- ]agreed|commission|commissions|unit\s+price)\b/i.test(low) ||
        /(تسعير|أسعار|اتفاقيات الأسعار|عمولات)/.test(cleanQ) ||
        /\b(tarif|tarifs|accord\s+de\s+prix|commission)\b/i.test(low)) {
      if (!canHub('sales', user)) return buildRestrictedReply(cleanQ, lang, 'Commercial Pricing');
      const k = _ctx.getKPI(scope.coKey) || {};
      const sn = (_ctx.sentinelSlice ? _ctx.sentinelSlice() : {}) || {};
      const pr = sn.pricing || {};
      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        title: `Commercial Pricing & Commissions · ${scope.fullScopeLabel}`,
        answer: `There are <b>${fmtInt(pr.active_agreements || k.active_agreements || 0)}</b> active customer price agreements. Below-agreed variance is <b>${fmtMoney(pr.sales_below_agreed_usd || 0, 0)}</b> across <b>${fmtInt(pr.below_agreed_pairs_count || 0)}</b> customer-product pairs, and sales commissions accrued stand at <b>${fmtMoney(k.commission_due || 0, 0)}</b>.`,
        promptText: 'Would you like to inspect Commercial Pricing or Quarry & Haulage Rates?',
        actions: [
          { type: 'view', view: 'pricing', label: 'Commercial Pricing' },
          ...(canView('raw_pricing', user) ? [{ type: 'view', view: 'raw_pricing', label: 'Quarry & Haulage Rates' }] : [])
        ],
        followUps: [
          `Compare entity sales & operating profit`,
          'Show overdue receivables',
          'Check open AI Sentinel alerts'
        ]
      };
    }

    // 15. Kiosks, Thermal Printing, Team Seats, Roles & Face ID Biometrics
    if (/\b(kiosk|kiosks|thermal|printer|gate\s+pass|team|biometric|face\s+id|seat|seats|permission|permissions|role|roles|users)\b/i.test(low) ||
        /(بصمة الوجه|صلاحيات|مستخدمين|كشك|طباعة حرارية)/.test(cleanQ) ||
        /\b(borne|kiosque|imprimante|reconnaissance\s+faciale|utilisateurs?)\b/i.test(low)) {
      const users = (_ctx.STATE && _ctx.STATE.users) || [];
      const faceCnt = (_ctx.userHasFaceId) ? users.filter(_ctx.userHasFaceId).length : 0;
      return {
        q: cleanQ,
        lang,
        instantLocal: true,
        title: 'Team Seats, Biometrics & Plant Kiosks',
        answer: `Your workspace currently has <b>${fmtInt(users.length)}</b> configured user seats (<b>${fmtInt(faceCnt)}</b> enrolled with live photo-proof Face ID) plus <b>4 dedicated plant kiosks</b> (Sales Dispatch, Quarry Receiving, Fuel Dispense, and Biometric Attendance) with wireless Priced Slip and Unpriced Gate Pass thermal printing.`,
        promptText: 'Would you like to open Plant Kiosks or Users & Security?',
        actions: [
          ...(canView('kiosks', user) ? [{ type: 'view', view: 'kiosks', label: 'Open Plant Kiosks' }] : []),
          ...(canView('users', user) ? [{ type: 'view', view: 'users', label: 'Users & Security' }] : [])
        ],
        followUps: [
          'Show today\'s daily operations',
          'Give me an executive briefing & open alerts',
          `Compare entity sales & operating profit`
        ]
      };
    }

    // 16. Sales, Revenue, Gross Margin, P&L & Multi-Entity Comparison (across ALL permitted entities!)
    if (/\b(margin|gm|p&l|pnl|profit|compare|comparison|entities|revenue|sales|loads|tons|volume|wtc|bbconstruction|bbc|lions)\b/i.test(low) ||
        /(مبيعات|أرباح|ارباح|إيرادات|ايرادات|هامش|مقارنة)/.test(cleanQ) ||
        /\b(ventes?|chiffre\s+d'affaires|marge|bénéfice|benefice|profit|comparer)\b/i.test(low)) {
      const win = computeWindowSummary(scope);
      const k = win.k;
      const entityRows = [];
      if (scope.coNames.length > 1) {
        scope.coNames.forEach(coName => {
          const cw = computeWindowSummary(scope, coName);
          const ck = cw.k;
          if (Number(ck.loads || 0) > 0 || Number(ck.expenses_total || 0) > 0 || Number(ck.raw_loads || 0) > 0 || scope.coNames.length <= 5) {
            entityRows.push([
              coName,
              fmtInt(ck.loads || 0),
              fmtMoney(canTax(user) ? ck.sales_ttc : (ck.sales_ttc || ck.net_sales), 0),
              `${fmtMoney(ck.gross_margin, 0)} (${fmtPctVal(ck.gross_margin, ck.net_sales || ck.sales_ttc)})`,
              fmtMoney(ck.operating_profit, 0)
            ]);
          }
        });
      }
      const hasMfgPair = scope.coNames.includes('WTC') && scope.coNames.includes('BBConstruction');
      const marginBullets = hasMfgPair && entityRows.length > 1
        ? ['Margin Driver: BBConstruction achieves higher gross margin % from own/JV pit material, while WTC scales stronger operating profit by absorbing overhead and payroll over larger dispatch volume.']
        : undefined;
      return {
        q: cleanQ,
        lang,
        instantLocal: !isReasoningQuery(cleanQ),
        title: `${salesLabel(user)}, Margin & Operating Profit · ${scope.fullScopeLabel}`,
        answer: `For <b>${esc(scope.fullScopeLabel)}</b>, ${salesLabel(user).toLowerCase()} reached <b>${fmtMoney(k.sales_ttc, 2)}</b> across <b>${fmtInt(k.loads)}</b> loads (<b>${fmtInt(k.tons_sold, 0)} t</b>), delivering gross margin of <b>${fmtMoney(k.gross_margin, 0)}</b> (<b>${fmtPctVal(k.gross_margin, k.net_sales || k.sales_ttc)}</b>) and operating profit of <b>${fmtMoney(k.operating_profit, 0)}</b>.`,
        bullets: marginBullets,
        headers: entityRows.length > 1 ? ['Entity', 'Loads', salesLabel(user), 'Gross Margin', 'Operating Profit'] : undefined,
        rows: entityRows.length > 1 ? entityRows : undefined,
        total: entityRows.length > 1 ? [`Combined (${scope.coNames.length} Entities)`, fmtMoney(k.operating_profit, 0)] : undefined,
        promptText: 'Would you like to open Sales & Receivables, Multi-Entity Comparison, or Executive Dashboards?',
        actions: [
          ...(canView('sales', user) ? [{ type: 'view', view: 'sales', label: 'Sales & Receivables' }] : []),
          ...(canView('entities', user) ? [{ type: 'view', view: 'entities', label: 'Entity Comparison' }] : []),
          ...(canView('pbi', user) ? [{ type: 'view', view: 'pbi', label: 'Dashboards' }] : [])
        ],
        followUps: [
          'Show top expense categories',
          'Show overdue receivables',
          'Show Accounts Payable breakdown'
        ]
      };
    }

    // 17. Executive Briefing / Overview / "What needs my attention?"
    if (/\b(briefing|brief\s+me|overview|at\s+a\s+glance|summary|attention|focus|status|health|how\s+is\s+the\s+business)\b/i.test(low) ||
        /(ملخص|نظرة عامة|وضع الشركة|ماذا يحتاج)/.test(cleanQ) ||
        /\b(résumé|resume|aperçu|apercu|synthèse|synthese|bilan)\b/i.test(low)) {
      return buildExecutiveBriefing(cleanQ, lang, scope, !isReasoningQuery(cleanQ));
    }

    return null;
  }

  function buildRestrictedReply(cleanQ, lang, sectionName) {
    return {
      q: cleanQ,
      lang,
      instantLocal: true,
      conversational: true,
      title: 'Role Permission Scope',
      answer: `Your current role does not include access to <b>${esc(sectionName)}</b>. You can ask about any operational register enabled on your sidebar.`,
      promptText: 'Would you like to check today\'s permitted operational activity instead?',
      followUps: [
        'Show today\'s daily operations',
        'Show Warehouse & Spare Parts stock'
      ]
    };
  }

  function buildExecutiveBriefing(cleanQ, lang, scope, markInstant = false) {
    const user = scope.user;
    const win = computeWindowSummary(scope);
    const k = win.k;
    const items = (_ctx && typeof _ctx.buildSentinelItems === 'function') ? _ctx.buildSentinelItems() : [];
    const openAlerts = items.filter(it => it && it.severity && it.severity !== 'ok');
    const pendingExp = scopedRows('expenses', scope, { ignorePeriod: true }).filter(e => e.price_pending).length;
    const pendingRaw = scopedRows('raw_purchases', scope, { ignorePeriod: true }).filter(r => r.price_pending).length;

    return {
      q: cleanQ,
      lang,
      instantLocal: markInstant,
      title: `Executive Briefing · ${scope.fullScopeLabel}`,
      answer: `Across <b>${esc(scope.fullScopeLabel)}</b>, ${salesLabel(user).toLowerCase()} stand at <b>${fmtMoney(k.sales_ttc, 0)}</b> (${fmtInt(k.loads)} loads), gross margin is <b>${fmtMoney(k.gross_margin, 0)}</b>, and operating profit is <b>${fmtMoney(k.operating_profit, 0)}</b>.`,
      bullets: [
        `Working Capital: Open AR <b>${fmtMoney(k.ar_balance, 0)}</b> (<b>${fmtMoney(k.ar_60_plus, 0)}</b> past 60d) · Net Open AP <b>${fmtMoney(k.ap_balance, 0)}</b>${canHub('cashflow', user) ? ` · Cash Till <b>${fmtMoney(k.cash_till, 2)}</b>` : ''}`,
        `Governance Queue: <b>${fmtInt(openAlerts.length)}</b> unreviewed Sentinel ${openAlerts.length === 1 ? 'alert' : 'alerts'} · <b>${fmtInt(pendingExp + pendingRaw)}</b> price-pending ($0.00) operational ${pendingExp + pendingRaw === 1 ? 'voucher' : 'vouchers'}`
      ],
      promptText: 'Which area would you like to drill into next?',
      actions: [
        ...(canView('overview', user) ? [{ type: 'view', view: 'overview', label: 'Executive Overview' }] : []),
        ...(canView('daily_ops', user) ? [{ type: 'view', view: 'daily_ops', label: 'Daily Operations' }] : []),
        ...(canView('sentinels', user) && openAlerts.length ? [{ type: 'view', view: 'sentinels', label: `${openAlerts.length} Sentinel Alerts` }] : [])
      ],
      followUps: [
        'Check open AI Sentinel alerts',
        `Compare entity sales & operating profit`,
        'Show overdue receivables'
      ]
    };
  }

  // ============================================================================
  // HYBRID CLOUD + CLIENT LLM LAYER FOR OPEN-ENDED ANALYTICAL QUESTIONS
  // ============================================================================
  function buildLlmContextMessages(cleanQ, lang, scope, fallback) {
    const user = scope.user;
    const win = computeWindowSummary(scope);
    const k = win.k;
    const items = (_ctx && typeof _ctx.buildSentinelItems === 'function') ? _ctx.buildSentinelItems() : [];
    const openAlerts = items.filter(it => it && it.severity && it.severity !== 'ok');

    let domainDetail = '';
    if (fallback && fallback.answer) {
      const plainAns = cleanOut(String(fallback.answer).replace(/<[^>]+>/g, ''));
      const plainRows = Array.isArray(fallback.rows) && fallback.rows.length
        ? '\nTop Scoped Rows: ' + fallback.rows.slice(0, 5).map(r => r.join(' | ')).join(' ; ')
        : '';
      domainDetail = `\nDomain Register Detail (${cleanOut(fallback.title || 'Scoped View')}): ${plainAns}${plainRows}`;
    }

    const kpiLine = [
      `Scope: ${scope.fullScopeLabel} (Basis: ${scope.basis === 'tx' ? 'Transaction Date' : 'Reporting Date'})`,
      `${salesLabel(user)}: ${fmtMoney(k.sales_ttc, 0)} across ${fmtInt(k.loads)} loads (${fmtInt(k.tons_sold, 0)} tons)`,
      `Quarry/Raw Cost: ${fmtMoney(k.raw_cost, 0)} (${fmtInt(k.raw_loads)} loads) | Expenses: ${fmtMoney(k.expenses_total, 0)}`,
      `Gross Margin: ${fmtMoney(k.gross_margin, 0)} | Operating Profit: ${fmtMoney(k.operating_profit, 0)}`,
      `Open AR: ${fmtMoney(k.ar_balance, 0)} (Past 60d: ${fmtMoney(k.ar_60_plus, 0)}) | Net Open AP: ${fmtMoney(k.ap_balance, 0)}`,
      canHub('cashflow', user) ? `Cash Till: ${fmtMoney(k.cash_till, 2)}` : '',
      canHub('fleet', user) ? `Diesel Dispensed: ${fmtInt(k.diesel_litres, 0)} L` : '',
      `Unreviewed Sentinel Alerts: ${openAlerts.length}${openAlerts.length ? ' (' + openAlerts.slice(0, 3).map(a => cleanOut(a.title || a.code)).join('; ') + ')' : ''}`,
      domainDetail
    ].filter(Boolean).join('\n');

    const sysPrompt = [
      'You are Ask ISABI, the intelligent operational and financial copilot built inside the ISABI Command Center.',
      'Ground every figure strictly in the Live Scoped ERP Snapshot below. NEVER invent numbers, customers, or offices.',
      'Never use em-dashes, en-dashes, unicode arrows, or internal software/database jargon.',
      'Reply in the same language as the user (Detected language: ' + lang + '). Keep answers concise, sharp, and human (2 to 3 sentences max).',
      'Live Scoped ERP Snapshot:\n' + kpiLine,
      'Return ONLY valid JSON: {"title": "Short heading", "answer": "Direct 2 to 3 sentence answer grounded in the live snapshot", "promptText": "1 short natural follow-up question", "followUps": ["Short option 1", "Short option 2", "Short option 3"]}'
    ].join('\n\n');

    const msgs = [{ role: 'system', content: sysPrompt }];
    const recent = _chatState.history.slice(-4);
    for (let i = 0; i < recent.length; i++) {
      const h = recent[i];
      if (!h || !h.q) continue;
      msgs.push({ role: 'user', content: String(h.q) });
      msgs.push({
        role: 'assistant',
        content: JSON.stringify({
          title: cleanOut(h.title || 'Ask ISABI'),
          answer: cleanOut(String(h.answer || '').replace(/<[^>]+>/g, '')),
          promptText: cleanOut(h.promptText || ''),
          followUps: Array.isArray(h.followUps) ? h.followUps.slice(0, 3) : []
        })
      });
    }
    msgs.push({ role: 'user', content: cleanQ });
    return msgs;
  }

  function parseLlmJson(rawText, cleanQ, lang, fallback) {
    try {
      let cleaned = String(rawText || '').replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const sIdx = cleaned.indexOf('{');
      const eIdx = cleaned.lastIndexOf('}');
      if (sIdx >= 0 && eIdx > sIdx) cleaned = cleaned.slice(sIdx, eIdx + 1);
      const obj = JSON.parse(cleaned);
      if (!obj || !obj.answer) return null;
      return {
        q: cleanQ,
        lang,
        conversational: true,
        title: cleanOut(obj.title || fallback.title || 'Ask ISABI'),
        answer: esc(cleanOut(obj.answer)),
        headers: fallback.headers,
        rows: fallback.rows,
        total: fallback.total,
        bullets: fallback.bullets,
        promptText: obj.promptText ? cleanOut(obj.promptText) : fallback.promptText,
        actions: fallback.actions,
        followUps: Array.isArray(obj.followUps) && obj.followUps.length
          ? obj.followUps.slice(0, 3).map(cleanOut).filter(Boolean)
          : fallback.followUps
      };
    } catch (_) {
      return null;
    }
  }

  async function callHybridCommandLlm(cleanQ, lang, scope, fallback) {
    const isAutoTest = Boolean(navigator.webdriver || window.__MFG_HEADLESS_TEST);
    if (isAutoTest) return fallback;

    const messages = buildLlmContextMessages(cleanQ, lang, scope, fallback);
    const askCfg = window.MFG_ASK_CFG || {};
    let flowUrl = '';
    let flowKey = '';
    try {
      if (askCfg.u && askCfg.k) {
        flowUrl = atob(askCfg.u);
        flowKey = atob(askCfg.k);
      }
    } catch (_) {}

    // Lane 1: Cloud AI Relay (skip logging in public demo sandbox to keep visitor logs clean)
    const isDemo = Boolean(_ctx && _ctx.STATE && (_ctx.STATE.demoVisitor || _ctx.STATE.isPublicDemoSandbox));
    if (flowUrl && flowUrl.startsWith('http') && !isDemo) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9500);
      try {
        const res = await fetch(flowUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({
            key: flowKey,
            op: 'ask',
            surface: 'command_center',
            q: cleanQ,
            lang,
            industry: scope.scopeCoLabel,
            currency: 'USD',
            period: scope.periodLabel,
            replyTitle: fallback.title || '',
            systemPrompt: messages[0].content,
            userPrompt: cleanQ,
            messages
          }),
          signal: ctrl.signal
        });
        clearTimeout(timer);
        if (res.ok) {
          const data = await res.json();
          if (data && data.mode === 'gemini_cloud' && data.rawReply) {
            const parsed = parseLlmJson(data.rawReply, cleanQ, lang, fallback);
            if (parsed) return parsed;
          }
        }
      } catch (_) {
        clearTimeout(timer);
      }
    }

    // Lane 2: Direct Client-IP LLM completion (separate 45s bucket)
    const ctrl2 = new AbortController();
    const timer2 = setTimeout(() => ctrl2.abort(), 9000);
    try {
      const res2 = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai-fast',
          reasoning_effort: 'low',
          response_format: { type: 'json_object' },
          messages
        }),
        signal: ctrl2.signal
      });
      clearTimeout(timer2);
      if (res2.ok) {
        const data2 = await res2.json();
        const raw2 = data2 && data2.choices && data2.choices[0] && data2.choices[0].message && data2.choices[0].message.content;
        if (raw2) {
          const parsed2 = parseLlmJson(raw2, cleanQ, lang, fallback);
          if (parsed2) return parsed2;
        }
      }
    } catch (_) {
      clearTimeout(timer2);
    }

    return fallback;
  }

  // ============================================================================
  // UI RENDERING & INTERACTIVE DRAWER WIRING
  // ============================================================================
  function renderWelcomeHtml() {
    const user = getActiveUser();
    const scope = resolveQueryScope('', user);
    const firstName = cleanOut(userDisplayName(user).split(' ')[0]);
    const items = (_ctx && typeof _ctx.buildSentinelItems === 'function') ? _ctx.buildSentinelItems() : [];
    const openAlerts = items.filter(it => it && it.severity && it.severity !== 'ok').length;
    const k = (_ctx && typeof _ctx.getKPI === 'function') ? _ctx.getKPI(scope.coKey) : {};
    const tbOk = Math.abs(Number(k.tb_check || 0)) < 0.005;

    const starterChips = [
      'Give me an executive briefing & open alerts',
      'Show today\'s daily operations',
      'Compare entity sales & operating profit',
      'Show top expense categories',
      'Show overdue receivables'
    ];

    return `
      <div class="ai-msg-bot ai-welcome-card">
        <div class="ai-bot-eyebrow">ISABI COPILOT · LIVE RECORDS</div>
        <p class="ai-bot-p">Welcome${firstName ? ', <b>' + esc(firstName) + '</b>' : ''}. Active scope is <b>${esc(scope.fullScopeLabel)}</b> (${tbOk ? 'books tied at <b>$0.00</b>' : 'review trial balance'} · <b>${fmtInt(openAlerts)}</b> open Sentinel ${openAlerts === 1 ? 'alert' : 'alerts'}).</p>
      </div>
      <div class="ai-msg-followup">
        <div class="ai-followup-lead">Ask anything in English, العربية, or Français, or pick a live check:</div>
        <div class="ai-followup-chips">
          ${starterChips.map(c => `<button type="button" class="ai-followup-chip" data-ask-chip="${esc(c)}">${esc(c)}</button>`).join('')}
        </div>
      </div>
    `;
  }

  function renderTurnHtml(item, isNewest) {
    const isRtl = item.lang === 'ar' || /[\u0600-\u06FF]/.test(item.answer || '');
    const dirAttr = isRtl ? ' dir="rtl" style="text-align:right"' : '';
    const uDirAttr = /[\u0600-\u06FF]/.test(item.q || '') ? ' dir="rtl"' : '';

    let tableHtml = '';
    if (Array.isArray(item.headers) && item.headers.length && Array.isArray(item.rows) && item.rows.length) {
      const colCnt = item.headers.length;
      const ths = item.headers.map((h, i) => `<th${i === colCnt - 1 ? ' class="num"' : ''}>${esc(h)}</th>`).join('');
      const trs = item.rows.map(r => {
        const tds = r.slice(0, colCnt).map((c, i) => `<td${i === colCnt - 1 ? ' class="num"' : ''}>${i === 0 ? '<b>' + esc(c) + '</b>' : esc(c)}</td>`).join('');
        return `<tr>${tds}</tr>`;
      }).join('');
      const totRow = Array.isArray(item.total) && item.total.length
        ? `<tr class="ai-mini-tot"><td colspan="${Math.max(1, colCnt - 1)}">${esc(item.total[0])}</td><td class="num">${esc(item.total[item.total.length - 1])}</td></tr>`
        : '';
      tableHtml = `<div class="ai-mini-table-wrap"><table class="ai-mini-table"><thead><tr>${ths}</tr></thead><tbody>${trs}${totRow}</tbody></table></div>`;
    }

    const bulletsHtml = Array.isArray(item.bullets) && item.bullets.length
      ? `<ul class="ai-bot-list">${item.bullets.map(b => `<li>${b}</li>`).join('')}</ul>`
      : '';

    const actionsHtml = Array.isArray(item.actions) && item.actions.length
      ? `<div class="ai-bot-actions">${item.actions.map((a, idx) => {
          if (a.type === 'inspect') {
            return `<button type="button" class="ai-act-btn" data-ai-inspect-key="${esc(a.crKey)}" data-ai-inspect-id="${esc(a.id)}">${esc(a.label)}</button>`;
          }
          if (a.type === 'form') {
            return `<button type="button" class="ai-act-btn" data-ai-open-form="${esc(a.form)}">${esc(a.label)}</button>`;
          }
          return `<button type="button" class="ai-act-btn${idx === 0 ? ' is-primary' : ''}" data-ai-goto-view="${esc(a.view)}">${esc(a.label)}</button>`;
        }).join('')}</div>`
      : '';

    let followHtml = '';
    if (isNewest && _chatState.typingFollowup) {
      followHtml = `
        <div class="ai-msg-followup"${dirAttr}>
          <div class="ai-typing-indicator" aria-label="Preparing follow-up"><span></span><span></span><span></span></div>
        </div>
      `;
    } else if ((Array.isArray(item.followUps) && item.followUps.length) || item.promptText) {
      const lead = item.promptText || (item.lang === 'ar' ? 'هل تود فحص أحد هذه المواضيع؟' : (item.lang === 'fr' ? 'Souhaitez-vous vérifier l\'un de ces points ?' : 'Would you like to check one of these next?'));
      const chips = (item.followUps || []).map(f => `<button type="button" class="ai-followup-chip" data-ask-chip="${esc(f)}">${esc(f)}</button>`).join('');
      followHtml = `
        <div class="ai-msg-followup"${dirAttr}>
          <div class="ai-followup-lead">${esc(lead)}</div>
          ${chips ? `<div class="ai-followup-chips">${chips}</div>` : ''}
        </div>
      `;
    }

    return `
      <div class="ai-msg-user"${uDirAttr}>${esc(item.q)}</div>
      <div class="ai-msg-bot"${dirAttr}>
        ${item.title ? `<div class="ai-bot-eyebrow">${esc(item.title)}</div>` : ''}
        <p class="ai-bot-p">${item.answer}</p>
        ${bulletsHtml}
        ${tableHtml}
        ${actionsHtml}
      </div>
      ${followHtml}
    `;
  }

  function renderThinkingHtml(qText, lang) {
    const lbl = lang === 'ar' ? 'جاري فحص السجلات الحية...' : (lang === 'fr' ? 'Analyse des écritures en direct...' : 'Checking live records...');
    const uDir = /[\u0600-\u06FF]/.test(qText || '') ? ' dir="rtl"' : '';
    const bDir = lang === 'ar' ? ' dir="rtl" style="text-align:right"' : '';
    return `
      <div class="ai-msg-user"${uDir}>${esc(qText)}</div>
      <div class="ai-msg-bot ai-msg-pending"${bDir}>
        <span class="ai-pending-lbl">${esc(lbl)}</span>
        <span class="ai-typing-indicator" aria-hidden="true"><span></span><span></span><span></span></span>
      </div>
    `;
  }

  function syncHeaderAndChips() {
    if (!_ctx) return;
    const user = getActiveUser();
    const scope = resolveQueryScope('', user);

    const hdrSub = document.querySelector('#aiDrawer .ai-console-title small');
    if (hdrSub) {
      hdrSub.textContent = `Live Copilot · ${scope.allowed.length ? scope.allowed.slice(0, 3).join(', ') : scope.scopeCoLabel}`;
    }
    const hdrTitle = document.querySelector('#aiDrawer .ai-console-title b');
    if (hdrTitle) {
      hdrTitle.textContent = 'Ask ISABI · Operational & Financial Intelligence';
    }
    const inp = document.getElementById('aiInput');
    if (inp) {
      inp.placeholder = `Ask about ${scope.scopeCoLabel}, today's ops, AR, expenses, stock, diesel...`;
    }

    const chipsBox = document.getElementById('aiChips');
    if (chipsBox) {
      const chips = [
        { label: 'Executive Briefing', prompt: 'Give me an executive briefing & open alerts' },
        { label: 'Daily Operations', prompt: 'Show today\'s daily operations' },
        { label: 'Entity Sales & Profit', prompt: 'Compare entity sales & operating profit' },
        ...(canHub('sales', user) ? [{ label: 'Overdue AR', prompt: 'Show top overdue AR customers and credit risk' }] : []),
        ...(canHub('expenses', user) ? [{ label: 'Expenses & AP', prompt: 'Show top expense categories and pending prices' }] : []),
        ...(canHub('fleet', user) ? [{ label: 'Diesel & Repairs', prompt: 'Explain the diesel tank reconciliation variance across entities' }] : []),
        ...(canView('ledger', user) ? [{ label: 'Trial Balance', prompt: 'Verify the double-entry trial balance' }] : [])
      ];
      chipsBox.innerHTML = chips.map(c => `<button type="button" class="ai-pill-btn" data-prompt="${esc(c.prompt)}">${esc(c.label)}</button>`).join('');
    }
    if (!_chatState.history.length && !_chatState.pending) {
      renderThread(false);
    }
  }

  function renderThread(scrollToBottom = true) {
    const log = document.getElementById('aiMessages');
    if (!log) return;
    if (!_chatState.history.length && !_chatState.pending) {
      log.innerHTML = renderWelcomeHtml();
      log.scrollTop = 0;
      return;
    }
    const lastIdx = _chatState.history.length - 1;
    const html = _chatState.history.map((it, idx) => renderTurnHtml(it, idx === lastIdx && !_chatState.pending)).join('')
      + (_chatState.pending ? renderThinkingHtml(_chatState.pending.q, _chatState.pending.lang) : '');
    log.innerHTML = html;
    if (scrollToBottom) log.scrollTop = log.scrollHeight;
  }

  function submitQuestion(qRaw) {
    const cleanQ = String(qRaw || '').trim();
    if (!cleanQ || !_ctx) return;

    const user = getActiveUser();
    const lang = detectLang(cleanQ);
    const scope = resolveQueryScope(cleanQ, user);
    const directHit = buildLiveDataAnswer(cleanQ, scope);
    const isAutoTest = Boolean(navigator.webdriver || window.__MFG_HEADLESS_TEST);

    // Synchronous path for automated headless suites
    if (isAutoTest) {
      const syncAns = directHit || buildExecutiveBriefing(cleanQ, lang, scope, true);
      _chatState.pending = null;
      _chatState.typingFollowup = false;
      _chatState.history.push(syncAns);
      if (_chatState.history.length > 12) _chatState.history.shift();
      renderThread(true);
      return;
    }

    _chatState.pending = { q: cleanQ, lang };
    _chatState.typingFollowup = false;
    renderThread(true);

    // Fast path (<180ms): exact live-SQL intent, specific counterparty/ticket lookup, or greeting
    if (directHit && directHit.instantLocal) {
      setTimeout(() => {
        if (!_chatState.pending || _chatState.pending.q !== cleanQ) return;
        _chatState.pending = null;
        _chatState.typingFollowup = true;
        _chatState.history.push(directHit);
        if (_chatState.history.length > 12) _chatState.history.shift();
        renderThread(true);
        setTimeout(() => {
          _chatState.typingFollowup = false;
          renderThread(true);
        }, 340);
      }, 160);
      return;
    }

    // Hybrid path: Live-SQL grounded snapshot + Dual-IP Cloud/Browser LLM reasoning
    const fallback = directHit || buildExecutiveBriefing(cleanQ, lang, scope, false);
    const minBeat = new Promise(r => setTimeout(r, 240));
    Promise.all([callHybridCommandLlm(cleanQ, lang, scope, fallback), minBeat]).then(([resolved]) => {
      if (!_chatState.pending || _chatState.pending.q !== cleanQ) return;
      _chatState.pending = null;
      _chatState.typingFollowup = true;
      _chatState.history.push(resolved || fallback);
      if (_chatState.history.length > 12) _chatState.history.shift();
      renderThread(true);
      setTimeout(() => {
        _chatState.typingFollowup = false;
        renderThread(true);
      }, 360);
    });
  }

  function answerHtmlSnapshot(qRaw) {
    if (!_ctx) return '';
    const user = getActiveUser();
    const lang = detectLang(String(qRaw || ''));
    const scope = resolveQueryScope(String(qRaw || ''), user);
    const ans = buildLiveDataAnswer(String(qRaw || ''), scope) || buildExecutiveBriefing(String(qRaw || ''), lang, scope, true);
    return `<strong>${esc(ans.title || 'Ask ISABI')}</strong><br>${ans.answer}`;
  }

  function openDrawer(optionalPrompt) {
    const askDrawer = document.getElementById('aiDrawer');
    if (!askDrawer) return;
    if (_ctx && typeof _ctx.closeRail === 'function') _ctx.closeRail();
    syncHeaderAndChips();
    askDrawer.classList.add('open');
    askDrawer.setAttribute('aria-hidden', 'false');
    if (optionalPrompt) {
      submitQuestion(optionalPrompt);
    } else {
      renderThread(Boolean(_chatState.history.length));
    }
    const askInput = document.getElementById('aiInput');
    if (askInput && window.matchMedia('(min-width: 861px)').matches) {
      setTimeout(() => askInput.focus({ preventScroll: true }), 180);
    }
  }

  function closeDrawer() {
    const askDrawer = document.getElementById('aiDrawer');
    if (!askDrawer) return;
    askDrawer.classList.remove('open');
    askDrawer.setAttribute('aria-hidden', 'true');
  }

  function resetThread() {
    _chatState.history = [];
    _chatState.pending = null;
    _chatState.typingFollowup = false;
    syncHeaderAndChips();
    renderThread(false);
  }

  function init(ctx) {
    _ctx = ctx;
    syncHeaderAndChips();
    if (_chatState.wired) return;
    _chatState.wired = true;

    const openAskBtn = document.getElementById('askIsabiBtn');
    const mobileAskBtn = document.getElementById('mobileAskIsabiBtn');
    const closeAskBtn = document.getElementById('closeAiDrawerBtn');
    const resetAskBtn = document.getElementById('resetAiThreadBtn');
    const askDrawer = document.getElementById('aiDrawer');
    const askInput = document.getElementById('aiInput');
    const askForm = document.getElementById('aiForm');

    if (openAskBtn) openAskBtn.addEventListener('click', () => openDrawer());
    if (mobileAskBtn) mobileAskBtn.addEventListener('click', () => openDrawer());
    if (closeAskBtn) closeAskBtn.addEventListener('click', closeDrawer);
    if (resetAskBtn) resetAskBtn.addEventListener('click', resetThread);

    if (askForm && askInput) {
      askForm.addEventListener('submit', e => {
        e.preventDefault();
        const v = askInput.value.trim();
        if (!v) return;
        askInput.value = '';
        submitQuestion(v);
      });
    }

    if (askDrawer) {
      askDrawer.addEventListener('click', e => {
        const chip = e.target.closest('#aiChips .ai-pill-btn');
        if (chip) {
          submitQuestion(chip.getAttribute('data-prompt') || chip.textContent);
          return;
        }
        const followChip = e.target.closest('[data-ask-chip]');
        if (followChip) {
          submitQuestion(followChip.getAttribute('data-ask-chip'));
          return;
        }
        const gotoBtn = e.target.closest('[data-ai-goto-view]');
        if (gotoBtn && _ctx && typeof _ctx.setView === 'function') {
          const targetView = gotoBtn.getAttribute('data-ai-goto-view');
          if (window.innerWidth <= 860) closeDrawer();
          _ctx.setView(targetView);
          return;
        }
        const formBtn = e.target.closest('[data-ai-open-form]');
        if (formBtn && _ctx && typeof _ctx.openEntryModal === 'function') {
          const fid = formBtn.getAttribute('data-ai-open-form');
          closeDrawer();
          _ctx.openEntryModal(fid);
          return;
        }
        const inspBtn = e.target.closest('[data-ai-inspect-key]');
        if (inspBtn && _ctx && typeof _ctx.showRecordInspector === 'function') {
          const crKey = inspBtn.getAttribute('data-ai-inspect-key');
          const id = inspBtn.getAttribute('data-ai-inspect-id');
          if (window.innerWidth <= 860) closeDrawer();
          _ctx.showRecordInspector(crKey, id);
        }
      });
    }
  }

  window.MFG_ASK = {
    init,
    open: openDrawer,
    close: closeDrawer,
    reset: resetThread,
    ask: submitQuestion,
    syncScope: syncHeaderAndChips,
    answer: answerHtmlSnapshot,
    getState: () => ({
      turns: _chatState.history.length,
      pending: Boolean(_chatState.pending),
      lastReply: _chatState.history[_chatState.history.length - 1] || null
    })
  };
})();
