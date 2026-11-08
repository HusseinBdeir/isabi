/* ============================================================================
   ISABI Systems - Shareholder Daily Operations Cockpit (js/daily_ops.js)
   1. Strictly Transaction-Date driven across all 46 ERP tables (never Rep Date).
   2. Bridges Yesterday's After-Hours Sales & Raw tickets logged after close.
   3. Interactive 4-Domain Executive Board + Discrete Slide-Over Records Drawer.
   ============================================================================ */
(function () {
  'use strict';

  const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  let _txIndexCacheKey = '';
  let _txIndexCacheVal = null;
  let _lastDayModel = null;

  function txDateOf(r) {
    return String((r && r.date) || '').slice(0, 10);
  }

  function repDateOf(r) {
    if (!r) return '';
    const rp = String(r.rep_date || r.set_date || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(rp) ? rp : '';
  }

  function hasRepShift(r) {
    const txD = txDateOf(r);
    const rpD = repDateOf(r);
    return Boolean(txD && rpD && txD !== rpD);
  }

  function fmtDmy(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '-';
    return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
  }

  function renderRepBadge(ctx, txIso, repIso, extraCls) {
    const txD = String(txIso || '').slice(0, 10);
    const rpD = String(repIso || '').slice(0, 10);
    if (!txD || !rpD || txD === rpD || !/^\d{4}-\d{2}-\d{2}$/.test(rpD)) return '';
    const tip = `Reporting Date differs · Tx Date ${fmtDmy(txD)} · Reporting Date ${fmtDmy(rpD)}`;
    return `<span class="dops-rep-badge${extraCls ? ' ' + extraCls : ''}" data-ui-tip="${ctx.esc(tip)}">${ctx.ic('rep_shift')}<span>${ctx.esc(fmtShortDay(rpD))}</span></span>`;
  }

  function renderGroupRepBadge(ctx, shiftedCount, totalCount, repDates, txIso) {
    const cnt = Number(shiftedCount || 0);
    if (cnt <= 0) return '';
    const uniq = Array.isArray(repDates) ? repDates.filter(Boolean) : [];
    const datesLbl = uniq.map(fmtShortDay).join(', ');
    const badgeLbl = (uniq.length === 1 && cnt === Number(totalCount || 0))
      ? fmtShortDay(uniq[0])
      : `${ctx.fmtNum(cnt)}${uniq.length === 1 ? ' · ' + fmtShortDay(uniq[0]) : ' shifted'}`;
    const tip = `Reporting Date differs · ${cnt} of ${totalCount || cnt} ${(totalCount || cnt) === 1 ? 'entry' : 'entries'}${datesLbl ? ' (' + datesLbl + ')' : ''} · Tx Date ${fmtDmy(txIso)}`;
    return `<span class="dops-rep-badge is-group" data-ui-tip="${ctx.esc(tip)}">${ctx.ic('rep_shift')}<span>${ctx.esc(badgeLbl)}</span></span>`;
  }

  function describeRegAddition(ad) {
    const r = (ad && ad.row) || {};
    const rk = String((ad && ad.rkey) || '');
    if (rk === 'staff_assignments') {
      const cleanName = r.staff || r.driver || (r.name && !/^ASGN-/i.test(String(r.name)) ? r.name : '') || r.id || '-';
      const detail = [r.role || 'Staff Role', r.equipment ? `Unit ${r.equipment}` : '', r.site || ''].filter(Boolean).join(' · ');
      return { name: cleanName, sub: detail || 'Role Assignment', label: ad.label || 'Staff Role' };
    }
    if (rk === 'staff_members') {
      const cleanName = r.name || r.staff || r.id || '-';
      const detail = [r.role || r.default_role || 'Staff Member', r.default_equipment ? `Unit ${r.default_equipment}` : ''].filter(Boolean).join(' · ');
      return { name: cleanName, sub: detail || 'New Staff', label: ad.label || 'New Staff' };
    }
    const cleanName = r.equipment || r.driver || r.customer || r.supplier || r.name || r.site || r.product || r.id || '-';
    const detail = [r.role, r.category, r.ownership, r.region, r.type, r.company].filter(Boolean).join(' · ') || 'Master Registry';
    return { name: cleanName, sub: detail, label: (ad && ad.label) || 'New Record' };
  }

  function matchesQuickSearch(qNorm, parts) {
    if (!qNorm) return true;
    const hay = parts.filter(Boolean).join(' ').toLowerCase();
    return hay.includes(qNorm);
  }

  function startOrEnteredDateOf(r) {
    if (!r) return '';
    const sd = String(r.start_date || r.date || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(sd)) return sd;
    const ed = String(r.entered_at || r.created_at || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(ed) ? ed : '';
  }

  function enteredDateOf(r) {
    if (!r) return '';
    const ed = String(r.entered_at || r.created_at || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(ed) ? ed : '';
  }

  function shiftIsoDays(iso, delta) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
    const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
    d.setDate(d.getDate() + delta);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function fmtHumanDay(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '-';
    const y = Number(iso.slice(0, 4));
    const m = Number(iso.slice(5, 7));
    const d = Number(iso.slice(8, 10));
    const dt = new Date(y, m - 1, d);
    return `${DOW_SHORT[dt.getDay()]}, ${String(d).padStart(2, '0')} ${MONTH_SHORT[m - 1]} ${y}`;
  }

  function fmtShortDay(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '-';
    const m = Number(iso.slice(5, 7));
    const d = Number(iso.slice(8, 10));
    return `${String(d).padStart(2, '0')} ${MONTH_SHORT[m - 1]}`;
  }

  function fmtAxisDay(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '-';
    const y = Number(iso.slice(0, 4));
    const m = Number(iso.slice(5, 7));
    const d = Number(iso.slice(8, 10));
    const dt = new Date(y, m - 1, d);
    return `${DOW_SHORT[dt.getDay()]} ${d}`;
  }

  function fmtCompactLbp(v) {
    const abs = Math.abs(Number(v || 0));
    const sign = Number(v || 0) < 0 ? '-' : '';
    if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B LBP`;
    if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(abs >= 1e8 ? 0 : 1)}M LBP`;
    if (abs >= 1e3) return `${sign}${Math.round(abs / 1e3)}k LBP`;
    return `${sign}${Math.round(abs)} LBP`;
  }

  function safeNotes(ctx, s) {
    const raw = ctx.cleanNotesText ? ctx.cleanNotesText(s) : String(s || '');
    return String(raw || '')
      .replace(/\s*\[LEGACY_PARITY[\s\S]*$/i, '')
      .replace(/\s*\[Items:[^\]]*\]/gi, '')
      .replace(/[\u2014\u2013]/g, '-')
      .replace(/[\u2190-\u21FF\u25B8]/g, 'to')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Identifies Sales or Raw tickets logged via the "Yesterday's After-Hours" toggle
  function isAfterHoursTicket(r) {
    if (!r || r.voided) return false;
    if (r.after_hours === true || r.after_hours === 1 || r.after_hours === '1' || r.after_hours === 'true') {
      return true;
    }
    if (r.source === 'app' && r.entered_at && r.date) {
      const txD = String(r.date).slice(0, 10);
      const entD = String(r.entered_at).slice(0, 10);
      const overrides = Array.isArray(r.admin_overrides) ? r.admin_overrides : [];
      if (entD.length === 10 && txD.length === 10 && txD === shiftIsoDays(entD, -1) && !overrides.includes('f_date')) {
        return true;
      }
    }
    return false;
  }

  function buildCompanyMatcher(ctx, scopeOverride) {
    const scopeKey = String(scopeOverride || ctx.STATE.company || 'manufacturing-group');
    const allowed = ctx.allowedCompanyNames() || [];
    const isInd = scopeKey.startsWith('industry:');
    const indName = isInd ? scopeKey.slice(9) : '';
    const indSet = isInd
      ? new Set((ctx.getCompanyCatalog() || []).filter(c => (c.industry || 'Manufacturing') === indName).map(c => c.name))
      : null;
    const bu = isInd ? null : (ctx.COMPANY_BU_MATCH ? ctx.COMPANY_BU_MATCH[scopeKey] : null);
    return function matchCo(r) {
      if (!r || r.voided) return false;
      const co = String(r.company || '');
      if (bu && co && co !== bu) return false;
      if (indSet && co && !indSet.has(co)) return false;
      if (allowed.length && co && !allowed.includes(co)) return false;
      return true;
    };
  }

  function getDailyTxIndex(ctx) {
    const { STATE, SEED, MIN_DATE, MAX_DATE, norm } = ctx;
    const scopeKey = String(STATE.company || 'manufacturing-group');
    const allowed = (ctx.allowedCompanyNames() || []).join(',');
    const cr = STATE.customRecords || {};
    const crCount = Object.keys(cr).reduce((acc, k) => acc + (Array.isArray(cr[k]) ? cr[k].length : 0), 0);
    const rec = (SEED && SEED.records) || {};
    const salesLen = Array.isArray(rec.sales_tickets) ? rec.sales_tickets.length : 0;
    const rawLen = Array.isArray(rec.raw_purchases) ? rec.raw_purchases.length : 0;
    const expLen = Array.isArray(rec.expenses) ? rec.expenses.length : 0;
    const prLen = Array.isArray(rec.price_rules) ? rec.price_rules.length : 0;
    const extLen = Array.isArray(rec.external_movements) ? rec.external_movements.length : 0;
    const convLen = Array.isArray(rec.conversions) ? rec.conversions.length : 0;
    const punchLen = Array.isArray(STATE.kioskPunches) ? STATE.kioskPunches.length : 0;
    const key = `${scopeKey}|${allowed}|${SEED._customRev || 0}|${STATE._customRev || 0}|${crCount}|${salesLen}|${rawLen}|${expLen}|${prLen}|${extLen}|${convLen}|${punchLen}`;
    if (_txIndexCacheVal && _txIndexCacheKey === key) return _txIndexCacheVal;

    const matchCo = buildCompanyMatcher(ctx, scopeKey);
    const opDateSet = new Set();

    const indexTable = (list, markActiveDay, dateExtractor) => {
      const byDate = new Map();
      const getD = dateExtractor || txDateOf;
      if (!Array.isArray(list)) return byDate;
      for (let i = 0; i < list.length; i++) {
        const row = list[i];
        if (!matchCo(row)) continue;
        const d = getD(row);
        if (d.length !== 10 || d < MIN_DATE || d > MAX_DATE) continue;
        let arr = byDate.get(d);
        if (!arr) {
          arr = [];
          byDate.set(d, arr);
        }
        arr.push(row);
        if (markActiveDay) opDateSet.add(d);
      }
      return byDate;
    };

    // Index universal tables that carry start_date or entered_at without BU column
    const indexUniversalByDate = (list, dateExtractor) => {
      const byDate = new Map();
      const getD = dateExtractor || startOrEnteredDateOf;
      if (!Array.isArray(list)) return byDate;
      for (let i = 0; i < list.length; i++) {
        const row = list[i];
        if (!row || row.voided) continue;
        const d = getD(row);
        if (d.length !== 10 || d < MIN_DATE || d > MAX_DATE) continue;
        let arr = byDate.get(d);
        if (!arr) {
          arr = [];
          byDate.set(d, arr);
        }
        arr.push(row);
      }
      return byDate;
    };

    const salesByDate = indexTable(rec.sales_tickets, true, txDateOf);
    const rawByDate = indexTable(rec.raw_purchases, true, txDateOf);
    const expByDate = indexTable(rec.expenses, true, txDateOf);
    const expItemsByDate = indexTable(rec.expense_items, false, txDateOf);
    const whByDate = indexTable(rec.warehouse_movements, true, txDateOf);
    const rcptByDate = indexTable(rec.receipts, true, txDateOf);
    const setByDate = indexTable(rec.settlements, true, txDateOf);
    const salByDate = indexTable(rec.salaries, true, txDateOf);
    const extByDate = indexTable(rec.external_movements, true, txDateOf);
    const convByDate = indexTable(rec.conversions, true, txDateOf);
    const loanByDate = indexTable(rec.loans, true, startOrEnteredDateOf);
    const loanSetByDate = indexTable(rec.loan_settlements, true, txDateOf);
    const vatInvByDate = indexTable(rec.vat_invoices, true, txDateOf);
    const jvDistByDate = indexTable(rec.jv_distributions, true, txDateOf);
    const creditTermsByDate = indexTable(rec.credit_terms, false, startOrEnteredDateOf);
    const otRatesByDate = indexTable(rec.overtime_rates, false, startOrEnteredDateOf);
    const fuelByDate = indexTable(rec.fuel_intakes, true, txDateOf);
    const malfByDate = indexTable(rec.fuel_malfunctions, true, txDateOf);
    const defByDate = indexTable(rec.equipment_defects, true, txDateOf);
    const repByDate = indexTable(rec.equipment_repairs, true, txDateOf);
    const oilByDate = indexTable(rec.equipment_oil_logs, true, txDateOf);
    const partByDate = indexTable(rec.part_movements, true, txDateOf);
    const coEqByDate = indexTable(rec.company_equipment, false, startOrEnteredDateOf);
    const attByDate = indexTable(rec.attendance, false, txDateOf);
    const empByDate = indexTable(rec.employments, false, startOrEnteredDateOf);
    const logAllowByDate = indexTable(rec.logistics_allowances, false, startOrEnteredDateOf);
    const flEntryByDate = indexTable(rec.freelance_entries, true, txDateOf);
    const flPayByDate = indexTable(rec.freelance_payments, true, txDateOf);

    const fxRateByDate = indexUniversalByDate(rec.fx_rates, startOrEnteredDateOf);
    const vatRateByDate = indexUniversalByDate(rec.vat_rates, startOrEnteredDateOf);

    // Price Rules: index both by start_date/entered_at AND build fast lookup maps for rate auditing
    const priceRulesByDate = new Map();
    const custProdRules = new Map();
    const quarryPurchRules = new Map();
    const quarryTransRules = new Map();
    const scopedRulesAll = [];
    const prList = Array.isArray(rec.price_rules) ? rec.price_rules : [];
    const checkIndiff = r => (ctx.isMatIndiffRule ? ctx.isMatIndiffRule(r) : (/^truck$/i.test(String(r.unit || r.rate_per || '')) && !(Number(r.unit_price ?? r.price ?? 0) > 0)));

    for (let i = 0; i < prList.length; i++) {
      const r = prList[i];
      if (!matchCo(r)) continue;
      scopedRulesAll.push(r);
      const dStart = String(r.start_date || r.date || '').slice(0, 10);
      const dEnt = enteredDateOf(r);
      const addRuleOnDate = dt => {
        if (dt.length !== 10 || dt < MIN_DATE || dt > MAX_DATE) return;
        let arr = priceRulesByDate.get(dt);
        if (!arr) { arr = []; priceRulesByDate.set(dt, arr); }
        if (!arr.includes(r)) arr.push(r);
      };
      if (dStart) addRuleOnDate(dStart);
      if (dEnt && dEnt !== dStart) addRuleOnDate(dEnt);

      const rt = String(r.rule_type || '').trim();
      if (r.customer && r.product && !/^commission$/i.test(rt) && !checkIndiff(r)) {
        const up = Number(r.unit_price ?? r.price ?? 0);
        if (up > 0) {
          const pk = `${norm(r.company)}|${norm(r.customer)}|${norm(r.product)}`;
          let arr = custProdRules.get(pk);
          if (!arr) { arr = []; custProdRules.set(pk, arr); }
          arr.push(r);
        }
      } else if (rt === 'Purchase Price (Site)' && r.site && r.product) {
        const pk = `${norm(r.company)}|${norm(r.site)}|${norm(r.product)}`;
        let arr = quarryPurchRules.get(pk);
        if (!arr) { arr = []; quarryPurchRules.set(pk, arr); }
        arr.push(r);
      } else if (rt === 'Transport Price (Site)' && r.site) {
        const pk = `${norm(r.company)}|${norm(r.site)}`;
        let arr = quarryTransRules.get(pk);
        if (!arr) { arr = []; quarryTransRules.set(pk, arr); }
        arr.push(r);
      }
    }

    // Universal Registry additions logged via app (entered_at / created_at / start_date)
    const regAdditionsByDate = new Map();
    const regSpecs = [
      ['customers', 'New Customer'],
      ['suppliers', 'New Supplier'],
      ['sites', 'New Site'],
      ['products', 'New Product'],
      ['equipment', 'New Equipment'],
      ['drivers', 'New Driver'],
      ['staff_members', 'New Staff'],
      ['staff_assignments', 'Staff Role']
    ];
    for (let sIdx = 0; sIdx < regSpecs.length; sIdx++) {
      const [rk, lbl] = regSpecs[sIdx];
      const list = Array.isArray(rec[rk]) ? rec[rk] : [];
      for (let i = 0; i < list.length; i++) {
        const row = list[i];
        if (!row || row.voided) continue;
        if (row.company && !matchCo(row)) continue;
        const d = enteredDateOf(row) || (rk === 'staff_assignments' ? String(row.start_date || '').slice(0, 10) : '');
        if (d.length === 10 && d >= MIN_DATE && d <= MAX_DATE) {
          let arr = regAdditionsByDate.get(d);
          if (!arr) { arr = []; regAdditionsByDate.set(d, arr); }
          arr.push({ rkey: rk, label: lbl, row });
        }
      }
    }

    // Truck Adjustment Windows starting on date
    const adjWinByDate = new Map();
    const eqList = Array.isArray(rec.equipment) ? rec.equipment : [];
    for (let i = 0; i < eqList.length; i++) {
      const eq = eqList[i];
      if (!eq || eq.voided || !Array.isArray(eq.adj_windows)) continue;
      for (let j = 0; j < eq.adj_windows.length; j++) {
        const w = eq.adj_windows[j];
        const sd = String((w && w.start_date) || '').slice(0, 10);
        if (sd.length === 10 && sd >= MIN_DATE && sd <= MAX_DATE) {
          let arr = adjWinByDate.get(sd);
          if (!arr) { arr = []; adjWinByDate.set(sd, arr); }
          arr.push({ eq, win: w });
        }
      }
    }

    const openDefects = (Array.isArray(rec.equipment_defects) ? rec.equipment_defects : []).filter(d => {
      if (!matchCo(d)) return false;
      const st = String(d.status || 'Open').toLowerCase();
      return !/resolved|closed|repaired|fixed/.test(st);
    });

    const sortedOpDates = Array.from(opDateSet).sort();
    const latestOpDate = sortedOpDates.length ? sortedOpDates[sortedOpDates.length - 1] : (ctx.SEED_DATE || ctx.todayISO());

    _txIndexCacheKey = key;
    _txIndexCacheVal = {
      salesByDate,
      rawByDate,
      expByDate,
      expItemsByDate,
      whByDate,
      rcptByDate,
      setByDate,
      salByDate,
      extByDate,
      convByDate,
      loanByDate,
      loanSetByDate,
      vatInvByDate,
      jvDistByDate,
      creditTermsByDate,
      otRatesByDate,
      fuelByDate,
      malfByDate,
      defByDate,
      repByDate,
      oilByDate,
      partByDate,
      coEqByDate,
      attByDate,
      empByDate,
      logAllowByDate,
      flEntryByDate,
      flPayByDate,
      fxRateByDate,
      vatRateByDate,
      priceRulesByDate,
      scopedRulesAll,
      custProdRules,
      quarryPurchRules,
      quarryTransRules,
      regAdditionsByDate,
      adjWinByDate,
      openDefects,
      opDateSet,
      sortedOpDates,
      latestOpDate
    };
    return _txIndexCacheVal;
  }

  function resolveTargetDate(ctx, idx) {
    const { STATE } = ctx;
    if (STATE.dailyOpsDate && /^\d{4}-\d{2}-\d{2}$/.test(STATE.dailyOpsDate)) {
      return STATE.dailyOpsDate;
    }
    const today = ctx.todayISO();
    const yest = shiftIsoDays(today, -1);
    const hasToday = idx.opDateSet.has(today);
    const yestSalesAh = (idx.salesByDate.get(yest) || []).some(isAfterHoursTicket);
    const yestRawAh = (idx.rawByDate.get(yest) || []).some(isAfterHoursTicket);
    if (hasToday || yestSalesAh || yestRawAh) {
      return today;
    }
    return idx.latestOpDate || today;
  }

  function summarizeSalesList(ctx, rows) {
    let loads = 0, deliveryLoads = 0, pickupLoads = 0, otLoads = 0, returnsCount = 0, chainedLoads = 0;
    let ttc = 0, vat = 0, netMat = 0, grossExVat = 0, transRev = 0, m3 = 0, tons = 0;
    let aggM3 = 0, aggTtc = 0;
    let cashTtc = 0, cashNet = 0, creditTtc = 0, creditNet = 0, commUsd = 0, discUsd = 0, tipUsd = 0;
    for (let i = 0; i < rows.length; i++) {
      const s = rows[i];
      const sgn = ctx.ticketSign(s);
      if (sgn === 0) continue;
      if (sgn < 0) returnsCount += 1;
      if (s.origin_ticket || s.origin_id || (s.origin_mode && s.origin_mode !== 'none')) chainedLoads += 1;
      if (sgn === 1) {
        loads += 1;
        if (s.sale_type === 'Delivery') deliveryLoads += 1;
        else if (s.sale_type === 'Pickup') pickupLoads += 1;
        if (s.overtime) otLoads += 1;
        commUsd += Number(ctx.ticketCommissionUsd(s) || 0);
      }
      const rowTtc = Number(s.total_ttc != null ? s.total_ttc : s.total || 0) * sgn;
      const rowVat = Number(s.vat || 0) * sgn;
      const rowGross = Number(s.total != null ? s.total : (Number(s.total_ttc || 0) - Number(s.vat || 0))) * sgn;
      const rowTr = Number(s.trans_price || 0) * sgn;
      const rowMat = Number(s.price != null ? s.price : (Number(s.total || 0) - Number(s.trans_price || 0))) * sgn;
      const rowM3 = Number(ctx.ticketMeters(s) || 0) * sgn;
      const rowTons = Number(ctx.ticketTons(s) || 0) * sgn;
      ttc += rowTtc;
      vat += rowVat;
      netMat += rowMat;
      grossExVat += rowGross;
      transRev += rowTr;
      m3 += rowM3;
      tons += rowTons;
      discUsd += Math.max(0, Number(s.discount || 0));
      tipUsd += Math.max(0, Number(s.tip || 0));
      if (rowM3 !== 0 && ctx.isAggregateMaterialProduct(s.product, s.uom)) {
        aggM3 += rowM3;
        aggTtc += rowTtc;
      }
      if (ctx.isCashSaleTicket(s)) {
        cashTtc += rowTtc;
        cashNet += rowGross;
      } else if (ctx.isCreditSaleTicket(s)) {
        creditTtc += rowTtc;
        creditNet += rowGross;
      }
    }
    const avgPriceTtc = aggM3 > 0 ? ctx.round2(aggTtc / aggM3) : (m3 > 0 ? ctx.round2(ttc / m3) : 0);
    return {
      count: rows.length,
      loads,
      deliveryLoads,
      pickupLoads,
      otLoads,
      returnsCount,
      chainedLoads,
      ttc: ctx.round2(ttc),
      vat: ctx.round2(vat),
      netMat: ctx.round2(netMat),
      grossExVat: ctx.round2(grossExVat),
      transRev: ctx.round2(transRev),
      m3: ctx.round2(m3),
      tons: ctx.round2(tons),
      avgPriceTtc,
      cashTtc: ctx.round2(cashTtc),
      cashNet: ctx.round2(cashNet),
      creditTtc: ctx.round2(creditTtc),
      creditNet: ctx.round2(creditNet),
      commUsd: ctx.round2(commUsd),
      discUsd: ctx.round2(discUsd),
      tipUsd: ctx.round2(tipUsd)
    };
  }

  function summarizeRawList(ctx, rows) {
    let loads = 0, otLoads = 0, ownLoads = 0, haulerLoads = 0;
    let matCost = 0, haulCost = 0, totalCost = 0, m3 = 0, tons = 0, discUsd = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      loads += 1;
      if (r.overtime) otLoads += 1;
      if (r.transport_by === 'Company fleet') ownLoads += 1;
      else haulerLoads += 1;
      const mat = Number(r.cost || 0);
      const haul = Number(r.trans_cost || 0);
      const tot = Number(r.total != null ? r.total : (mat + haul));
      matCost += mat;
      haulCost += haul;
      totalCost += tot;
      discUsd += Math.max(0, Number(r.discount || 0));
      m3 += Number(ctx.ticketMeters(r) || 0);
      tons += Number(ctx.ticketTons(r) || 0);
    }
    return {
      count: rows.length,
      loads,
      otLoads,
      ownLoads,
      haulerLoads,
      matCost: ctx.round2(matCost),
      haulCost: ctx.round2(haulCost),
      totalCost: ctx.round2(totalCost),
      discUsd: ctx.round2(discUsd),
      m3: ctx.round2(m3),
      tons: ctx.round2(tons)
    };
  }

  function evalConversion(ctx, cv, fallbackRate) {
    if (ctx.convSignedDeltas) return ctx.convSignedDeltas(cv, fallbackRate);
    const dirStr = String((cv && (cv.type || cv.from_currency)) || '').toUpperCase();
    const u2l = dirStr.includes('USD TO LBP') || dirStr === 'USD';
    const usdMag = Math.abs(Number((cv && (cv.usd_amount != null ? cv.usd_amount : cv.usd_delta)) || 0));
    const lbpMag = Math.round(Math.abs(Number((cv && (cv.lbp_amount != null ? cv.lbp_amount : cv.lbp_delta)) || 0)));
    const explicitRate = Number((cv && (cv.exchange_rate || cv.fx_rate)) || 0);
    const rate = explicitRate > 0 ? explicitRate : (usdMag > 0 && lbpMag > 0 ? lbpMag / usdMag : fallbackRate);
    return {
      u2l,
      usdMag: ctx.round2(usdMag),
      lbpMag,
      usd: ctx.round2(usdMag * (u2l ? -1 : 1)),
      lbp: lbpMag * (u2l ? 1 : -1),
      rate
    };
  }

  function describePriceRule(ctx, r) {
    const rt = String(r.rule_type || 'Price Agreement').trim();
    const up = Number(r.unit_price ?? r.price ?? 0);
    const tp = Number(r.trans_unit_price ?? r.trans_price ?? 0);
    const ind = Number(r.indiff_price ?? r.trans_indiff_price ?? 0);
    const uom = r.unit || r.rate_per || 'm³';
    let badge = 'Rule';
    if (rt === 'Sales (Delivery)') badge = 'Sales Deliv.';
    else if (rt === 'Sales (Pickup)') badge = 'Sales Pickup';
    else if (rt === 'List Price') badge = 'List Price';
    else if (rt === 'Purchase Price (Site)') badge = 'Quarry Buy';
    else if (rt === 'Transport Price (Site)') badge = 'Quarry Haul';
    else if (/^commission$/i.test(rt)) badge = 'Commission';

    const party = r.customer || r.supplier || r.site || r.product || 'General';
    const subBits = [];
    if (r.product && r.product !== party) subBits.push(r.product);
    if (r.site && r.site !== party) subBits.push(r.site);
    const rateBits = [];
    if (up > 0) rateBits.push(`${ctx.fmtUSD(up, Number.isInteger(up) ? 0 : 2)}/${uom}`);
    if (tp > 0) rateBits.push(`Haul ${ctx.fmtUSD(tp, Number.isInteger(tp) ? 0 : 2)}/${uom}`);
    if (!rateBits.length && ind > 0) rateBits.push(`Flat ${ctx.fmtUSD(ind, 0)}/Truck`);
    return {
      badge,
      party,
      sub: subBits.join(' · '),
      primaryRate: rateBits[0] || 'Custom Rate',
      haulRate: rateBits.length > 1 ? `+${rateBits.slice(1).join(' ')}` : '',
      rateTxt: rateBits.join(' + ') || 'Custom Rate'
    };
  }

  function computeQuickDayTotals(ctx, idx, d, includeAh) {
    const yest = shiftIsoDays(d, -1);
    const daySales = idx.salesByDate.get(d) || [];
    const ahSales = includeAh ? (idx.salesByDate.get(yest) || []).filter(isAfterHoursTicket) : [];
    const dayRaw = idx.rawByDate.get(d) || [];
    const ahRaw = includeAh ? (idx.rawByDate.get(yest) || []).filter(isAfterHoursTicket) : [];
    const sSum = summarizeSalesList(ctx, ahSales.length ? daySales.concat(ahSales) : daySales);
    const rSum = summarizeRawList(ctx, ahRaw.length ? dayRaw.concat(ahRaw) : dayRaw);
    const exps = idx.expByDate.get(d) || [];
    let expTotal = 0, expExVat = 0;
    for (let i = 0; i < exps.length; i++) {
      const x = exps[i];
      const sgn = ctx.expenseSign(x);
      if (sgn === 0) continue;
      const a = Number(x.amount || 0) * sgn;
      expTotal += a;
      if (ctx.expenseKind(x) !== 'VAT') expExVat += a;
    }
    const sals = idx.salByDate.get(d) || [];
    let salPaid = 0;
    for (let i = 0; i < sals.length; i++) salPaid += Number(sals[i].amount || 0);
    const opProfit = ctx.round2(sSum.grossExVat - (rSum.totalCost + expExVat + salPaid + sSum.commUsd));
    return {
      date: d,
      salesTtc: sSum.ttc,
      salesLoads: sSum.loads,
      rawCost: rSum.totalCost,
      rawLoads: rSum.loads,
      expTotal: ctx.round2(expTotal),
      outlay: ctx.round2(rSum.totalCost + expExVat + salPaid),
      opProfit,
      ahLoads: ahSales.length + ahRaw.length
    };
  }

  function buildDayModel(ctx) {
    const { STATE, round2, norm } = ctx;
    const idx = getDailyTxIndex(ctx);
    const targetDate = resolveTargetDate(ctx, idx);
    const yestDate = shiftIsoDays(targetDate, -1);
    const includeAh = STATE.dailyOpsIncludeAfterHours !== false;
    const fxRate = Number((ctx.getLbpFxRate ? ctx.getLbpFxRate(targetDate) : 89500) || 89500);

    const daySales = idx.salesByDate.get(targetDate) || [];
    const ahSalesAll = (idx.salesByDate.get(yestDate) || []).filter(isAfterHoursTicket);
    const dayRaw = idx.rawByDate.get(targetDate) || [];
    const ahRawAll = (idx.rawByDate.get(yestDate) || []).filter(isAfterHoursTicket);

    const effSales = includeAh && ahSalesAll.length ? ahSalesAll.concat(daySales) : daySales;
    const effRaw = includeAh && ahRawAll.length ? ahRawAll.concat(dayRaw) : dayRaw;

    const ahIdSet = new Set();
    ahSalesAll.forEach(s => { if (s.id) ahIdSet.add(s.id); });
    ahRawAll.forEach(r => { if (r.id) ahIdSet.add(r.id); });

    const salesSum = summarizeSalesList(ctx, effSales);
    const salesTodayOnly = summarizeSalesList(ctx, daySales);
    const salesAhSum = summarizeSalesList(ctx, ahSalesAll);

    const rawSum = summarizeRawList(ctx, effRaw);
    const rawTodayOnly = summarizeRawList(ctx, dayRaw);
    const rawAhSum = summarizeRawList(ctx, ahRawAll);

    const ahAvailableCount = ahSalesAll.length + ahRawAll.length;
    const ahAvailableUsd = round2(salesAhSum.ttc + rawAhSum.totalCost);

    // ---- 1. PRICE AGREEMENTS, RATE COMPLIANCE, VAT INVOICES, CREDIT TERMS & JV ----
    const dayPriceRules = idx.priceRulesByDate.get(targetDate) || [];
    const dayCreditTerms = idx.creditTermsByDate.get(targetDate) || [];
    const dayOtRates = idx.otRatesByDate.get(targetDate) || [];
    const dayVatInvoices = idx.vatInvByDate.get(targetDate) || [];
    const dayJvDists = idx.jvDistByDate.get(targetDate) || [];
    const dayFxRates = idx.fxRateByDate.get(targetDate) || [];
    const dayVatRates = idx.vatRateByDate.get(targetDate) || [];

    // Trailing 7-day agreements (for context when 0 new rules today)
    const weekAgoIso = shiftIsoDays(targetDate, -7);
    const recentWeekRules = [];
    for (let dStep = 1; dStep <= 7; dStep++) {
      const pd = shiftIsoDays(targetDate, -dStep);
      const rArr = idx.priceRulesByDate.get(pd) || [];
      for (let k = 0; k < rArr.length; k++) {
        if (recentWeekRules.length < 6 && !dayPriceRules.includes(rArr[k])) recentWeekRules.push(rArr[k]);
      }
    }

    // Audit every effective Sales Ticket against customer+product price_rules
    let agreedSalesLoads = 0, spotSalesLoads = 0, belowAgreedLoads = 0, lapsedSalesLoads = 0, belowShortfallUsd = 0;
    const auditPairMap = new Map();
    const activeRulesUsedMap = new Map();
    const belowTicketEvents = [];

    for (let i = 0; i < effSales.length; i++) {
      const t = effSales[i];
      if (!t || ctx.ticketSign(t) !== 1) continue;
      const qty = Number(t.qty || ctx.ticketMeters(t) || 0);
      const up = Number(t.unit_price || 0);
      const txD = txDateOf(t) || targetDate;
      const pk = `${norm(t.company)}|${norm(t.customer)}|${norm(t.product)}`;
      const allCand = (t.customer && t.product) ? idx.custProdRules.get(pk) : null;

      let status = 'Spot';
      let agreedRate = null;
      let matchedRule = null;
      let shortfall = 0;

      if (allCand && allCand.length && up > 0 && qty > 0) {
        const isPickup = /pickup/i.test(String(t.sale_type || ''));
        const typeCand = allCand.filter(r => {
          const rt = String(r.rule_type || '').toLowerCase();
          return isPickup ? !rt.includes('delivery') : !rt.includes('pickup');
        });
        const pool1 = typeCand.length ? typeCand : allCand;
        const tSite = norm(t.site);
        const exactSite = tSite ? pool1.filter(r => norm(r.site) === tSite) : [];
        const blankSite = pool1.filter(r => !norm(r.site));
        const cand = exactSite.length ? exactSite : (blankSite.length ? blankSite : pool1);

        const actOnDate = cand.filter(r => {
          const s0 = r.start_date ? String(r.start_date).slice(0, 10) : '1900-01-01';
          const e0 = r.end_date ? String(r.end_date).slice(0, 10) : '9999-12-31';
          return s0 <= txD && txD <= e0;
        });

        if (actOnDate.length) {
          let minRule = actOnDate[0];
          let minAg = Number(minRule.unit_price ?? minRule.price ?? 0);
          for (let j = 1; j < actOnDate.length; j++) {
            const rp = Number(actOnDate[j].unit_price ?? actOnDate[j].price ?? 0);
            if (rp > 0 && rp < minAg) { minAg = rp; minRule = actOnDate[j]; }
          }
          agreedRate = minAg;
          matchedRule = minRule;
          if (up + 0.01 < minAg) {
            status = 'Below Rate';
            shortfall = round2((minAg - up) * qty);
            belowAgreedLoads += 1;
            belowShortfallUsd = round2(belowShortfallUsd + shortfall);
            belowTicketEvents.push({
              ticket: t,
              rule: minRule,
              soldPrice: up,
              agreedPrice: minAg,
              shortfall
            });
          } else {
            status = 'Agreed';
            agreedSalesLoads += 1;
          }
          if (minRule && minRule.id) {
            let ru = activeRulesUsedMap.get(minRule.id);
            if (!ru) {
              ru = { rule: minRule, loads: 0, revTtc: 0 };
              activeRulesUsedMap.set(minRule.id, ru);
            }
            ru.loads += 1;
            ru.revTtc = round2(ru.revTtc + Number(t.total_ttc != null ? t.total_ttc : t.total || 0));
          }
        } else {
          const endedBefore = cand.filter(r => r.end_date && String(r.end_date).slice(0, 10) < txD);
          if (endedBefore.length) {
            status = 'Lapsed';
            lapsedSalesLoads += 1;
            agreedRate = Number(endedBefore[endedBefore.length - 1].unit_price ?? endedBefore[endedBefore.length - 1].price ?? 0);
            matchedRule = endedBefore[endedBefore.length - 1];
          } else {
            spotSalesLoads += 1;
          }
        }
      } else {
        spotSalesLoads += 1;
      }

      const pairKey = `${pk}|${status}`;
      let ap = auditPairMap.get(pairKey);
      if (!ap) {
        ap = {
          company: t.company || 'WTC',
          customer: t.customer || 'Walk-in',
          product: t.product || '-',
          uom: t.uom || 'm³',
          loads: 0,
          qty: 0,
          billedAvg: 0,
          billedSum: 0,
          agreedRate,
          status,
          shortfall: 0,
          sampleTicketId: t.id,
          ruleId: matchedRule ? matchedRule.id : ''
        };
        auditPairMap.set(pairKey, ap);
      }
      ap.loads += 1;
      ap.qty = round2(ap.qty + qty);
      ap.billedSum += up * (qty || 1);
      ap.billedAvg = ap.qty > 0 ? round2(ap.billedSum / ap.qty) : up;
      ap.shortfall = round2(ap.shortfall + shortfall);
    }

    // Track Quarry rate agreements used today as well
    let agreedRawLoads = 0;
    for (let i = 0; i < effRaw.length; i++) {
      const r = effRaw[i];
      const txD = txDateOf(r) || targetDate;
      const qk = `${norm(r.company)}|${norm(r.site)}|${norm(r.product)}`;
      const pRules = (idx.quarryPurchRules.get(qk) || []).filter(pr => {
        const s0 = pr.start_date ? String(pr.start_date).slice(0, 10) : '1900-01-01';
        const e0 = pr.end_date ? String(pr.end_date).slice(0, 10) : '9999-12-31';
        return s0 <= txD && txD <= e0;
      });
      if (pRules.length) {
        agreedRawLoads += 1;
        const mr = pRules[0];
        if (mr && mr.id) {
          let ru = activeRulesUsedMap.get(mr.id);
          if (!ru) {
            ru = { rule: mr, loads: 0, revTtc: 0 };
            activeRulesUsedMap.set(mr.id, ru);
          }
          ru.loads += 1;
          ru.revTtc = round2(ru.revTtc + Number(r.total != null ? r.total : (Number(r.cost || 0) + Number(r.trans_cost || 0))));
        }
      }
    }

    const activeRulesUsed = Array.from(activeRulesUsedMap.values()).sort((a, b) => b.loads - a.loads || b.revTtc - a.revTtc);
    const rateAuditRows = Array.from(auditPairMap.values()).sort((a, b) => {
      const rank = s => (s === 'Below Rate' ? 0 : s === 'Lapsed' ? 1 : s === 'Agreed' ? 2 : 3);
      return rank(a.status) - rank(b.status) || b.loads - a.loads;
    });

    let vatBilledTodayTtc = 0, vatBilledTodayTax = 0;
    dayVatInvoices.forEach(vi => {
      vatBilledTodayTtc += Number(vi.total_ttc || 0);
      vatBilledTodayTax += Number(vi.vat_amount || 0);
    });
    vatBilledTodayTtc = round2(vatBilledTodayTtc);
    vatBilledTodayTax = round2(vatBilledTodayTax);

    let jvDistTodayUsd = 0;
    dayJvDists.forEach(jv => { jvDistTodayUsd += Number(jv.amount || jv.total || 0); });
    jvDistTodayUsd = round2(jvDistTodayUsd);

    const newPoliciesCount = dayPriceRules.length + dayCreditTerms.length + dayOtRates.length;

    // ---- 2. EXPENSES, SPARE PARTS & WAREHOUSE MOVEMENTS ----
    const dayExps = idx.expByDate.get(targetDate) || [];
    const dayExpItems = idx.expItemsByDate.get(targetDate) || [];
    const dayWhMoves = idx.whByDate.get(targetDate) || [];
    const expItemsByBill = new Map();
    for (let i = 0; i < dayExpItems.length; i++) {
      const it = dayExpItems[i];
      const eid = String(it.expense_id || '');
      if (!eid) continue;
      let arr = expItemsByBill.get(eid);
      if (!arr) { arr = []; expItemsByBill.set(eid, arr); }
      arr.push(it);
    }
    let expTotal = 0, expExVat = 0, cashExp = 0, creditExp = 0, cashExpLbp = 0, expCount = 0;
    const pendingExps = [];
    const expCatMap = new Map();
    const expenseBillRows = [];
    for (let i = 0; i < dayExps.length; i++) {
      const x = dayExps[i];
      const isPend = Boolean(ctx.isPendingPriceExpense(x));
      if (isPend) pendingExps.push(x);
      const sgn = ctx.expenseSign(x);
      if (sgn === 0 && !isPend) continue;
      if (sgn !== 0) expCount += 1;
      const a = round2(Number(x.amount || 0) * (sgn || 1));
      expTotal += a;
      if (ctx.expenseKind(x) !== 'VAT') expExVat += a;
      const isCred = Boolean(ctx.isApCreditExpense(x));
      const isCash = !isCred && Boolean(ctx.isCashExpense(x));
      if (isCred) creditExp += a;
      else if (isCash) {
        cashExp += a;
        cashExpLbp += Number(x.lbp_amount || 0) * (sgn || 1);
      }
      const catLbl = [x.category, x.subcategory].filter(Boolean).join(' · ') || 'General Expense';
      const ck = norm(catLbl);
      let cur = expCatMap.get(ck);
      if (!cur) {
        cur = { key: ck, label: catLbl, category: x.category || 'General', count: 0, method: x.method || 'Cash', amount: 0, pending: 0, repShiftCount: 0, repShiftDates: [], bills: [], sampleId: x.id };
        expCatMap.set(ck, cur);
      }
      cur.count += 1;
      if (isPend) cur.pending += 1;
      cur.amount = round2(cur.amount + a);
      const xTxDate = txDateOf(x) || targetDate;
      const xRepDate = repDateOf(x);
      const xShifted = Boolean(xRepDate && xRepDate !== xTxDate);
      if (xShifted) {
        cur.repShiftCount += 1;
        if (!cur.repShiftDates.includes(xRepDate)) cur.repShiftDates.push(xRepDate);
      }

      const linkedItems = expItemsByBill.get(String(x.id || '')) || [];
      const cleanDesc = safeNotes(ctx, x.notes || x.description);
      const itemNames = linkedItems.map(li => li.item_name || li.subcategory).filter(Boolean);
      const eqTarget = x.equipment || (linkedItems[0] && (linkedItems[0].target_equipment || linkedItems[0].warehouse_location)) || '';
      const billItem = {
        id: x.id,
        invoice: x.invoice || x.reference || '',
        company: x.company || 'WTC',
        supplier: x.supplier || x.category || 'Expense',
        category: x.category || 'General',
        subcategory: x.subcategory || '',
        catLabel: catLbl,
        equipment: eqTarget,
        notes: cleanDesc,
        itemsCount: linkedItems.length || Number(x.qty || 1),
        itemNames,
        method: isPend ? 'Pending' : (isCred ? 'Credit' : (x.method || 'Cash')),
        isCredit: isCred,
        isCash,
        isPending: isPend,
        txDate: xTxDate,
        repDate: xRepDate,
        isRepShifted: xShifted,
        amount: a,
        lbpAmount: Math.round(Number(x.lbp_amount || 0) * (sgn || 1))
      };
      cur.bills.push(billItem);
      expenseBillRows.push(billItem);
    }
    expTotal = round2(expTotal);
    expExVat = round2(expExVat);
    cashExp = round2(cashExp);
    creditExp = round2(creditExp);
    const expCategoryRows = Array.from(expCatMap.values()).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    expenseBillRows.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

    let whStockedItems = 0, whAllocatedItems = 0;
    dayExpItems.forEach(it => {
      if (/warehouse|stock/i.test(String(it.allocation_mode || '')) || it.warehouse_location) whStockedItems += 1;
      else whAllocatedItems += 1;
    });
    let whMoveInCount = 0, whMoveOutCount = 0;
    dayWhMoves.forEach(wm => {
      const q = Number(wm.qty_delta != null ? wm.qty_delta : wm.qty || 0);
      if (/out|issue|consume/i.test(String(wm.movement_type || wm.direction || '')) || q < 0) whMoveOutCount += 1;
      else whMoveInCount += 1;
    });

    // ---- 3. TREASURY: AR, AP, SALARIES, EXTERNAL TRANSACTIONS, FX CONVERSIONS & LOANS ----
    const dayRcpts = idx.rcptByDate.get(targetDate) || [];
    let arCollected = 0, arDiscUsd = 0, arRcptCount = 0;
    for (let i = 0; i < dayRcpts.length; i++) {
      const r = dayRcpts[i];
      if (ctx.receiptKind(r) === 'Settlement') {
        arCollected += Number(r.amount || 0) + Number(r.discount || 0);
        arDiscUsd += Math.max(0, Number(r.discount || 0));
        arRcptCount += 1;
      }
    }
    arCollected = round2(arCollected);
    arDiscUsd = round2(arDiscUsd);

    const daySets = idx.setByDate.get(targetDate) || [];
    let apPaid = 0, apDiscUsd = 0, apSetCount = 0;
    for (let i = 0; i < daySets.length; i++) {
      const sp = daySets[i];
      if (ctx.settlementKind(sp) === 'Payment') {
        apPaid += Number(sp.amount || 0) + Number(sp.discount || 0);
        apDiscUsd += Math.max(0, Number(sp.discount || 0));
        apSetCount += 1;
      }
    }
    apPaid = round2(apPaid);
    apDiscUsd = round2(apDiscUsd);

    const daySals = idx.salByDate.get(targetDate) || [];
    let salariesPaid = 0, salariesLbp = 0;
    for (let i = 0; i < daySals.length; i++) {
      const s = daySals[i];
      const lbp = Number(s.lbp_amount || 0);
      const usd = lbp ? Number(s.usd_amount || 0) : Number(s.amount || 0);
      salariesPaid += usd + (lbp ? lbp / fxRate : 0);
      salariesLbp += lbp;
    }
    salariesPaid = round2(salariesPaid);

    // External Movements (Inflow vs Outflow, USD + LBP, Counterparties & Notes)
    const dayExts = idx.extByDate.get(targetDate) || [];
    let extInUsd = 0, extInLbp = 0, extInEq = 0, extInCount = 0;
    let extOutUsd = 0, extOutLbp = 0, extOutEq = 0, extOutCount = 0;
    const extItems = [];
    for (let i = 0; i < dayExts.length; i++) {
      const ex = dayExts[i];
      const isOut = /out|expense/i.test(String(ex.direction || ex.flow || ''));
      const lbp = Number(ex.lbp_amount || 0);
      const usd = lbp ? Number(ex.usd_amount || 0) : Number(ex.usd_amount != null ? ex.usd_amount : ex.amount || 0);
      const eqAmt = round2(usd + (lbp ? lbp / fxRate : 0));
      if (isOut) {
        extOutUsd += usd;
        extOutLbp += lbp;
        extOutEq += eqAmt;
        extOutCount += 1;
      } else {
        extInUsd += usd;
        extInLbp += lbp;
        extInEq += eqAmt;
        extInCount += 1;
      }
      extItems.push({
        row: ex,
        id: ex.id,
        company: ex.company || 'WTC',
        isOut,
        counterparty: ex.counterparty || (isOut ? 'External Outflow' : 'External Inflow'),
        kind: ex.kind || 'External',
        usd: round2(usd),
        lbp: Math.round(lbp),
        eqAmt,
        notes: safeNotes(ctx, ex.notes)
      });
    }
    extInUsd = round2(extInUsd);
    extOutUsd = round2(extOutUsd);
    extInEq = round2(extInEq);
    extOutEq = round2(extOutEq);
    extItems.sort((a, b) => b.eqAmt - a.eqAmt);

    // FX Conversions (USD to LBP & LBP to USD)
    const dayConvs = idx.convByDate.get(targetDate) || [];
    let u2lCount = 0, u2lUsd = 0, u2lLbp = 0;
    let l2uCount = 0, l2uUsd = 0, l2uLbp = 0;
    const convItems = [];
    for (let i = 0; i < dayConvs.length; i++) {
      const cv = dayConvs[i];
      const d = evalConversion(ctx, cv, fxRate);
      if (d.u2l) {
        u2lCount += 1;
        u2lUsd = round2(u2lUsd + d.usdMag);
        u2lLbp += d.lbpMag;
      } else {
        l2uCount += 1;
        l2uUsd = round2(l2uUsd + d.usdMag);
        l2uLbp += d.lbpMag;
      }
      convItems.push({
        row: cv,
        id: cv.id,
        company: cv.company || 'WTC',
        u2l: d.u2l,
        dirLabel: d.u2l ? 'USD to LBP' : 'LBP to USD',
        usdMag: d.usdMag,
        lbpMag: d.lbpMag,
        rate: Math.round(d.rate || fxRate),
        spreadPct: fxRate > 0 ? round2(((d.rate - fxRate) / fxRate) * 100) : 0,
        notes: safeNotes(ctx, cv.notes)
      });
    }
    const totConvUsd = round2(u2lUsd + l2uUsd);
    const totConvLbp = u2lLbp + l2uLbp;
    const avgConvRate = totConvUsd > 0 && totConvLbp > 0 ? Math.round(totConvLbp / totConvUsd) : Math.round(fxRate);

    // Loans Opened Today & Loan Settlements Today
    const dayLoans = idx.loanByDate.get(targetDate) || [];
    const dayLoanSets = idx.loanSetByDate.get(targetDate) || [];
    let loanInEq = 0, loanOutEq = 0;
    const loanEvents = [];
    dayLoans.forEach(ln => {
      const isBorrow = /borrow/i.test(String(ln.direction || ''));
      const lbp = Number(ln.lbp_amount || 0);
      const usd = Number(ln.usd_amount != null ? ln.usd_amount : (lbp ? 0 : ln.principal || 0));
      const eq = round2(usd + (lbp ? lbp / fxRate : (usd ? 0 : Number(ln.principal || 0))));
      if (isBorrow) loanInEq = round2(loanInEq + eq);
      else loanOutEq = round2(loanOutEq + eq);
      loanEvents.push({
        rkey: 'loans',
        id: ln.id,
        company: ln.company || 'WTC',
        badge: isBorrow ? 'Loan Borrowed' : 'Loan Lent',
        isInflow: isBorrow,
        party: ln.counterparty || ln.lender || 'Partner',
        usd: round2(usd || (!lbp ? eq : 0)),
        lbp: Math.round(lbp),
        eqAmt: eq,
        notes: safeNotes(ctx, ln.notes)
      });
    });
    dayLoanSets.forEach(ls => {
      const isIn = /inflow|drawdown/i.test(String(ls.method || ls.type || ''));
      const lbp = Number(ls.lbp_amount || 0);
      const usd = lbp ? Number(ls.usd_amount || 0) : Number(ls.amount || 0);
      const eq = round2(usd + (lbp ? lbp / fxRate : 0));
      if (isIn) loanInEq = round2(loanInEq + eq);
      else loanOutEq = round2(loanOutEq + eq);
      loanEvents.push({
        rkey: 'loan_settlements',
        id: ls.id,
        company: ls.company || 'WTC',
        badge: isIn ? 'Repay In' : 'Repay Out',
        isInflow: isIn,
        party: ls.counterparty || ls.borrower || 'Partner',
        usd: round2(usd),
        lbp: Math.round(lbp),
        eqAmt: eq,
        notes: safeNotes(ctx, ls.notes)
      });
    });

    // Day Profit & Complete Cash Waterfall (USD-equivalent across USD + LBP)
    const grossMargin = round2(salesSum.netMat - rawSum.totalCost);
    const gmPct = salesSum.netMat > 0 ? grossMargin / salesSum.netMat : 0;
    const operatingProfit = round2(salesSum.grossExVat - (rawSum.totalCost + expExVat + salariesPaid + salesSum.commUsd));
    const opMarginPct = salesSum.grossExVat > 0 ? operatingProfit / salesSum.grossExVat : 0;

    const cashInflow = round2(salesSum.cashNet + arCollected + extInEq + loanInEq);
    const cashOutflow = round2(cashExp + apPaid + salariesPaid + extOutEq + loanOutEq);
    const netCashFlow = round2(cashInflow - cashOutflow);

    const liveKpi = ctx.getKPI ? ctx.getKPI() : {};
    const liveTillUsd = Number(liveKpi.cash_till_usd != null ? liveKpi.cash_till_usd : (liveKpi.cash_till || 0));
    const liveTillLbp = Number(liveKpi.cash_till_lbp || 0);

    // ---- 4. PLANT, DIESEL, MAINTENANCE, ONBOARDING & WORKFORCE ----
    const dayFuels = idx.fuelByDate.get(targetDate) || [];
    const dayMalfs = idx.malfByDate.get(targetDate) || [];
    const dayDefects = idx.defByDate.get(targetDate) || [];
    const dayRepairs = idx.repByDate.get(targetDate) || [];
    const dayOilLogs = idx.oilByDate.get(targetDate) || [];
    const dayPartMoves = idx.partByDate.get(targetDate) || [];
    const dayCoEquip = idx.coEqByDate.get(targetDate) || [];
    const dayAdjWins = idx.adjWinByDate.get(targetDate) || [];
    const dayEmps = idx.empByDate.get(targetDate) || [];
    const dayLogAllows = idx.logAllowByDate.get(targetDate) || [];
    const dayFlEntries = idx.flEntryByDate.get(targetDate) || [];
    const dayFlPays = idx.flPayByDate.get(targetDate) || [];
    const rawRegAdds = idx.regAdditionsByDate.get(targetDate) || [];
    const seenStaffOnboard = new Map();
    const dayRegAdds = [];
    for (let i = 0; i < rawRegAdds.length; i++) {
      const ad = rawRegAdds[i];
      const desc = describeRegAddition(ad);
      const enriched = Object.assign({}, ad, {
        cleanName: desc.name,
        cleanSub: desc.sub,
        cleanLabel: desc.label
      });
      if (ad.rkey === 'staff_members' || ad.rkey === 'staff_assignments') {
        const sk = norm(desc.name);
        if (sk && seenStaffOnboard.has(sk)) {
          const prev = seenStaffOnboard.get(sk);
          if (ad.rkey === 'staff_assignments' && desc.sub && desc.sub !== 'Staff Member' && !prev.cleanSub.includes(desc.sub)) {
            prev.cleanSub = desc.sub;
          }
          if (ad.rkey === 'staff_members') {
            prev.label = 'New Staff';
            prev.cleanLabel = 'New Staff';
            prev.rkey = 'staff_members';
            prev.row = ad.row;
          }
          continue;
        }
        if (sk) seenStaffOnboard.set(sk, enriched);
      }
      dayRegAdds.push(enriched);
    }

    let dieselIssuedL = 0, dieselBoughtL = 0, lubeL = 0, greaseKg = 0;
    const activeTruckSet = new Set();
    const activeStaffSet = new Set();
    let companyFleetTrips = 0, haulerTrips = 0;

    effSales.forEach(s => {
      if (s.truck) activeTruckSet.add(norm(s.truck));
      if (s.transport_by === 'Company fleet') {
        companyFleetTrips += 1;
        if (s.driver) activeStaffSet.add(norm(s.driver));
      } else if (s.truck) {
        haulerTrips += 1;
      }
    });
    effRaw.forEach(r => {
      if (r.truck) activeTruckSet.add(norm(r.truck));
      if (r.transport_by === 'Company fleet') {
        companyFleetTrips += 1;
        if (r.driver) activeStaffSet.add(norm(r.driver));
      } else if (r.truck) {
        haulerTrips += 1;
      }
    });
    dayExps.forEach(x => {
      if (ctx.isBulkDieselExpense(x)) dieselBoughtL += Number(x.qty || 0) * ctx.expenseSign(x);
    });
    dayFuels.forEach(fl => {
      if (fl.equipment) activeTruckSet.add(norm(fl.equipment));
      if (fl.driver) activeStaffSet.add(norm(fl.driver));
      const itemStr = String(fl.item || fl.fuel_type || 'Diesel');
      const q = Number(fl.litres || 0);
      if (ctx.isDieselTankRefillIntake(fl)) dieselBoughtL += q;
      else if (/grease/i.test(itemStr)) greaseKg += q;
      else if (/diesel|mazout/i.test(itemStr)) dieselIssuedL += q;
      else lubeL += q;
    });

    let malfNetL = 0;
    dayMalfs.forEach(m => { malfNetL += Number(m.litres || 0); });
    malfNetL = round2(malfNetL);

    const dayAtt = idx.attByDate.get(targetDate) || [];
    let attOtHours = 0, attOtPayUsd = 0, attOtStaffCount = 0, absentCount = 0, presentAttCount = 0;
    dayAtt.forEach(a => {
      const st = String(a.status || a.type || '').toLowerCase();
      if (/absent|leave|off|sick/.test(st) || Number(a.leave_days || 0) > 0) {
        absentCount += 1;
      } else {
        presentAttCount += 1;
        if (a.staff) activeStaffSet.add(norm(a.staff));
      }
      const oth = Number(a.overtime_hours || 0);
      if (oth > 0) {
        attOtHours += oth;
        attOtStaffCount += 1;
        attOtPayUsd += Number(a.payroll_impact_usd || 0);
      }
    });
    attOtPayUsd = round2(attOtPayUsd);
    const attSortedRows = dayAtt.slice().sort((a, b) => {
      const aAbs = /absent|leave|off|sick/i.test(String(a.status || a.type || '')) || Number(a.leave_days || 0) > 0 ? 1 : 0;
      const bAbs = /absent|leave|off|sick/i.test(String(b.status || b.type || '')) || Number(b.leave_days || 0) > 0 ? 1 : 0;
      if (aAbs !== bAbs) return bAbs - aAbs;
      return Number(b.overtime_hours || 0) - Number(a.overtime_hours || 0) || Number(b.payroll_impact_usd || 0) - Number(a.payroll_impact_usd || 0);
    });
    const fuelSortedRows = dayFuels.slice().sort((a, b) => Number(b.litres || 0) - Number(a.litres || 0));
    const fuelUnitMap = new Map();
    fuelSortedRows.forEach(fl => {
      const unitNm = fl.equipment || 'Plant Tank';
      const uk = norm(unitNm);
      let fu = fuelUnitMap.get(uk);
      if (!fu) {
        fu = {
          key: uk,
          equipment: unitNm,
          company: fl.company || 'WTC',
          category: fl.equipment_category || '',
          uom: /grease/i.test(String(fl.item || '')) ? 'kg' : 'L',
          isRefill: Boolean(ctx.isDieselTankRefillIntake && ctx.isDieselTankRefillIntake(fl)),
          fillsCount: 0,
          litres: 0,
          drivers: [],
          maxOdo: 0,
          odoDelta: 0,
          repShiftCount: 0,
          repShiftDates: [],
          fills: []
        };
        fuelUnitMap.set(uk, fu);
      }
      fu.fillsCount += 1;
      fu.litres = round2(fu.litres + Number(fl.litres || 0));
      if (fl.driver && !fu.drivers.includes(fl.driver)) fu.drivers.push(fl.driver);
      const prevOdo = Number(fl.prev_odometer || 0);
      const curOdo = Number(fl.odometer || 0);
      if (curOdo > fu.maxOdo) fu.maxOdo = curOdo;
      if (curOdo > prevOdo && prevOdo > 0) fu.odoDelta += (curOdo - prevOdo);
      if (hasRepShift(fl)) {
        const rpD = repDateOf(fl);
        fu.repShiftCount += 1;
        if (rpD && !fu.repShiftDates.includes(rpD)) fu.repShiftDates.push(rpD);
      }
      fu.fills.push(fl);
    });
    const fuelUnitRows = Array.from(fuelUnitMap.values()).sort((a, b) => b.litres - a.litres);
    let kioskPunchTodayCount = 0;
    (STATE.kioskPunches || []).forEach(p => {
      if (p && !p.voided && String(p.date || p.timestamp || '').slice(0, 10) === targetDate) {
        kioskPunchTodayCount += 1;
        if (p.staff) activeStaffSet.add(norm(p.staff));
      }
    });

    const dtSnap = ctx.getDieselTankLedger ? ctx.getDieselTankLedger(STATE.company, { from: ctx.MIN_DATE, to: targetDate }) : null;
    let closingTankL = null;
    let closingTankLbl = 'Tank';
    if (dtSnap) {
      if ((STATE.company === 'manufacturing-group' || String(STATE.company || '').startsWith('industry:')) && dtSnap.perCo && dtSnap.perCo.WTC && dtSnap.perCo.WTC.closingL != null) {
        closingTankL = round2(dtSnap.perCo.WTC.closingL);
        closingTankLbl = 'WTC Tank';
      } else if (dtSnap.closingTankL != null && dtSnap.closingTankL >= 0) {
        closingTankL = round2(dtSnap.closingTankL);
        closingTankLbl = 'Tank';
      }
    }
    const openCritDefects = idx.openDefects.filter(d => /crit|grave|breakdown|down/i.test(String(d.severity || d.priority || '')));

    // Statutory Reporting-Date Shifted Entries Kept Live on Transaction Date
    let repShiftedCount = 0;
    const countRepDiff = list => {
      for (let i = 0; i < list.length; i++) {
        if (hasRepShift(list[i])) repShiftedCount += 1;
      }
    };
    countRepDiff(effSales);
    countRepDiff(effRaw);
    countRepDiff(dayExps);
    countRepDiff(dayRcpts);
    countRepDiff(daySets);
    countRepDiff(dayFuels);
    countRepDiff(dayAtt);
    countRepDiff(daySals);
    countRepDiff(dayExts);
    const exceptionCount = belowAgreedLoads + pendingExps.length + absentCount + dayMalfs.length + openCritDefects.length;

    // 7-Day Transaction Pulse & Benchmark
    const priorActive = idx.sortedOpDates.filter(d => d < targetDate).slice(-6);
    const pulseDates = priorActive.concat([targetDate]);
    const pulseRows = pulseDates.map(d => computeQuickDayTotals(ctx, idx, d, d === targetDate ? includeAh : false));
    const benchRows = priorActive.slice(-7).map(d => computeQuickDayTotals(ctx, idx, d, false));
    const avg7Sales = benchRows.length ? round2(benchRows.reduce((a, r) => a + r.salesTtc, 0) / benchRows.length) : 0;
    const avg7Profit = benchRows.length ? round2(benchRows.reduce((a, r) => a + r.opProfit, 0) / benchRows.length) : 0;

    // Shift / Hourly Rhythm Buckets
    const hourBuckets = [
      { key: 'ah', label: 'Last Night', sub: `After-Hours (${fmtShortDay(yestDate)})`, salesLoads: 0, rawLoads: 0, salesTtc: 0, rawCost: 0 },
      { key: 'am', label: '06:00-11:00', sub: 'Morning Dispatch', salesLoads: 0, rawLoads: 0, salesTtc: 0, rawCost: 0 },
      { key: 'mid', label: '11:00-15:00', sub: 'Midday Peak', salesLoads: 0, rawLoads: 0, salesTtc: 0, rawCost: 0 },
      { key: 'pm', label: '15:00-18:00', sub: 'Afternoon Run', salesLoads: 0, rawLoads: 0, salesTtc: 0, rawCost: 0 },
      { key: 'eve', label: '18:00+', sub: 'Evening Shift', salesLoads: 0, rawLoads: 0, salesTtc: 0, rawCost: 0 }
    ];
    const bucketIdxForTime = tStr => {
      const m = String(tStr || '12:00').match(/^(\d{1,2})/);
      const hr = m ? Number(m[1]) : 12;
      if (hr < 11) return 1;
      if (hr < 15) return 2;
      if (hr < 18) return 3;
      return 4;
    };
    effSales.forEach(s => {
      if (ctx.ticketSign(s) <= 0) return;
      const bi = ahIdSet.has(s.id) ? 0 : bucketIdxForTime(s.time);
      hourBuckets[bi].salesLoads += 1;
      hourBuckets[bi].salesTtc = round2(hourBuckets[bi].salesTtc + Number(s.total_ttc != null ? s.total_ttc : s.total || 0));
    });
    effRaw.forEach(r => {
      const bi = ahIdSet.has(r.id) ? 0 : bucketIdxForTime(r.time);
      hourBuckets[bi].rawLoads += 1;
      hourBuckets[bi].rawCost = round2(hourBuckets[bi].rawCost + Number(r.total != null ? r.total : (Number(r.cost || 0) + Number(r.trans_cost || 0))));
    });

    // Breakdowns: Entities, Customers, Products
    const allowedNames = ctx.allowedCompanyNames() || [];
    const buDefs = [
      { key: 'wtc', name: 'WTC' },
      { key: 'bbconstruction', name: 'BBConstruction' },
      { key: 'lionstransport', name: 'Lions Transport' }
    ].filter(b => !allowedNames.length || allowedNames.includes(b.name));

    const entityRows = buDefs.map(b => {
      const bSales = effSales.filter(r => r.company === b.name);
      const bRaw = effRaw.filter(r => r.company === b.name);
      const bExp = dayExps.filter(r => r.company === b.name);
      const bRcpt = dayRcpts.filter(r => r.company === b.name);
      const bSet = daySets.filter(r => r.company === b.name);
      const bSal = daySals.filter(r => r.company === b.name);
      const bExt = extItems.filter(r => r.company === b.name);
      const ss = summarizeSalesList(ctx, bSales);
      const rs = summarizeRawList(ctx, bRaw);
      let bxExVat = 0, bxCash = 0, bxTotal = 0;
      bExp.forEach(x => {
        const sgn = ctx.expenseSign(x);
        if (!sgn) return;
        const a = Number(x.amount || 0) * sgn;
        bxTotal += a;
        if (ctx.expenseKind(x) !== 'VAT') bxExVat += a;
        if (ctx.isCashExpense(x)) bxCash += a;
      });
      let bRcptAmt = 0;
      bRcpt.forEach(r => { if (ctx.receiptKind(r) === 'Settlement') bRcptAmt += Number(r.amount || 0) + Number(r.discount || 0); });
      let bSetAmt = 0;
      bSet.forEach(s => { if (ctx.settlementKind(s) === 'Payment') bSetAmt += Number(s.amount || 0) + Number(s.discount || 0); });
      let bSalAmt = 0;
      bSal.forEach(s => { bSalAmt += Number(s.amount || 0); });
      let bExtNet = 0;
      bExt.forEach(e => { bExtNet += e.isOut ? -e.eqAmt : e.eqAmt; });
      const bProfit = round2(ss.grossExVat - (rs.totalCost + bxExVat + bSalAmt + ss.commUsd));
      const bNetCash = round2((ss.cashNet + bRcptAmt) - (bxCash + bSetAmt + bSalAmt) + bExtNet);
      return {
        key: b.key,
        name: b.name,
        salesLoads: ss.loads,
        rawLoads: rs.loads,
        salesTtc: ss.ttc,
        outlay: round2(rs.totalCost + bxTotal),
        opProfit: bProfit,
        netCash: bNetCash
      };
    });

    const custMap = new Map();
    effSales.forEach(s => {
      if (!s.customer) return;
      const sgn = ctx.ticketSign(s);
      if (!sgn) return;
      const ck = norm(s.customer);
      let cur = custMap.get(ck);
      if (!cur) {
        cur = {
          key: ck,
          name: s.customer,
          company: s.company || 'WTC',
          loads: 0,
          ahLoads: 0,
          delivLoads: 0,
          pickupLoads: 0,
          otLoads: 0,
          repShiftCount: 0,
          repShiftDates: [],
          m3: 0,
          ttc: 0,
          cashTtc: 0,
          creditTtc: 0,
          collected: 0,
          sites: [],
          products: [],
          unitPrices: [],
          tickets: [],
          rcpts: [],
          sampleId: s.id,
          sampleRkey: 'sales_tickets'
        };
        custMap.set(ck, cur);
      }
      cur.tickets.push(s);
      if (hasRepShift(s)) {
        const rpD = repDateOf(s);
        cur.repShiftCount += 1;
        if (rpD && !cur.repShiftDates.includes(rpD)) cur.repShiftDates.push(rpD);
      }
      if (sgn === 1) {
        cur.loads += 1;
        if (ahIdSet.has(s.id)) cur.ahLoads += 1;
        if (s.sale_type === 'Delivery') cur.delivLoads += 1;
        else if (s.sale_type === 'Pickup') cur.pickupLoads += 1;
        if (s.overtime) cur.otLoads += 1;
      }
      if (s.site && !cur.sites.includes(s.site)) cur.sites.push(s.site);
      if (s.product && !cur.products.includes(s.product)) cur.products.push(s.product);
      const up = Number(s.unit_price || 0);
      if (up > 0 && !cur.unitPrices.includes(up)) cur.unitPrices.push(up);
      const rowTtc = Number(s.total_ttc != null ? s.total_ttc : s.total || 0) * sgn;
      cur.m3 = round2(cur.m3 + Number(ctx.ticketMeters(s) || 0) * sgn);
      cur.ttc = round2(cur.ttc + rowTtc);
      if (ctx.isCashSaleTicket(s)) cur.cashTtc = round2(cur.cashTtc + rowTtc);
      else cur.creditTtc = round2(cur.creditTtc + rowTtc);
    });
    dayRcpts.forEach(r => {
      if (!r.customer || ctx.receiptKind(r) !== 'Settlement') return;
      const ck = norm(r.customer);
      let cur = custMap.get(ck);
      if (!cur) {
        cur = {
          key: ck,
          name: r.customer,
          company: r.company || 'WTC',
          loads: 0,
          ahLoads: 0,
          delivLoads: 0,
          pickupLoads: 0,
          otLoads: 0,
          repShiftCount: 0,
          repShiftDates: [],
          m3: 0,
          ttc: 0,
          cashTtc: 0,
          creditTtc: 0,
          collected: 0,
          sites: [],
          products: [],
          unitPrices: [],
          tickets: [],
          rcpts: [],
          sampleId: r.id,
          sampleRkey: 'receipts'
        };
        custMap.set(ck, cur);
      }
      cur.rcpts.push(r);
      if (hasRepShift(r)) {
        const rpD = repDateOf(r);
        cur.repShiftCount += 1;
        if (rpD && !cur.repShiftDates.includes(rpD)) cur.repShiftDates.push(rpD);
      }
      cur.collected = round2(cur.collected + Number(r.amount || 0) + Number(r.discount || 0));
    });
    const customerRows = Array.from(custMap.values()).sort((a, b) => (b.ttc - a.ttc) || (b.collected - a.collected));

    // Quarry Sites, Suppliers & 3rd-Party Haulers Breakdown
    const quarryMap = new Map();
    effRaw.forEach(r => {
      const site = r.site || 'Quarry Site';
      const supplier = r.site_owner || r.supplier || 'Quarry Supplier';
      const product = r.product || 'Raw Material';
      const qk = `${norm(site)}|${norm(supplier)}|${norm(product)}`;
      let cur = quarryMap.get(qk);
      if (!cur) {
        cur = {
          key: qk,
          site,
          supplier,
          product,
          company: r.company || 'WTC',
          loads: 0,
          ahLoads: 0,
          otLoads: 0,
          repShiftCount: 0,
          repShiftDates: [],
          ownLoads: 0,
          haulerLoads: 0,
          haulersMap: new Map(),
          m3: 0,
          tons: 0,
          matCost: 0,
          haulCost: 0,
          totalCost: 0,
          tickets: [],
          sampleId: r.id
        };
        quarryMap.set(qk, cur);
      }
      cur.tickets.push(r);
      cur.loads += 1;
      if (ahIdSet.has(r.id)) cur.ahLoads += 1;
      if (r.overtime) cur.otLoads += 1;
      if (hasRepShift(r)) {
        const rpD = repDateOf(r);
        cur.repShiftCount += 1;
        if (rpD && !cur.repShiftDates.includes(rpD)) cur.repShiftDates.push(rpD);
      }
      if (r.transport_by === 'Company fleet') {
        cur.ownLoads += 1;
      } else {
        cur.haulerLoads += 1;
        const hName = r.truck_owner || r.driver || '3P Hauler';
        cur.haulersMap.set(hName, (cur.haulersMap.get(hName) || 0) + 1);
      }
      const mat = Number(r.cost || 0);
      const haul = Number(r.trans_cost || 0);
      const tot = Number(r.total != null ? r.total : (mat + haul));
      cur.m3 = round2(cur.m3 + Number(ctx.ticketMeters(r) || 0));
      cur.tons = round2(cur.tons + Number(ctx.ticketTons(r) || 0));
      cur.matCost = round2(cur.matCost + mat);
      cur.haulCost = round2(cur.haulCost + haul);
      cur.totalCost = round2(cur.totalCost + tot);
    });
    const quarryGroupRows = Array.from(quarryMap.values()).map(q => {
      const hList = Array.from(q.haulersMap.entries()).sort((a, b) => b[1] - a[1]).map(([nm, cnt]) => cnt > 1 ? `${nm} (${cnt})` : nm);
      return Object.assign({}, q, { haulersTxt: hList.join(', ') });
    }).sort((a, b) => (b.totalCost - a.totalCost) || (b.loads - a.loads));

    const prodMap = new Map();
    effSales.forEach(s => {
      if (!s.product) return;
      const sgn = ctx.ticketSign(s);
      if (!sgn) return;
      const pk = norm(s.product);
      let cur = prodMap.get(pk);
      if (!cur) {
        cur = { name: s.product, salesLoads: 0, salesM3: 0, salesTtc: 0, rawLoads: 0, rawM3: 0, rawCost: 0 };
        prodMap.set(pk, cur);
      }
      if (sgn === 1) cur.salesLoads += 1;
      cur.salesM3 = round2(cur.salesM3 + Number(ctx.ticketMeters(s) || 0) * sgn);
      cur.salesTtc = round2(cur.salesTtc + Number(s.total_ttc != null ? s.total_ttc : s.total || 0) * sgn);
    });
    effRaw.forEach(r => {
      if (!r.product) return;
      const pk = norm(r.product);
      let cur = prodMap.get(pk);
      if (!cur) {
        cur = { name: r.product, salesLoads: 0, salesM3: 0, salesTtc: 0, rawLoads: 0, rawM3: 0, rawCost: 0 };
        prodMap.set(pk, cur);
      }
      cur.rawLoads += 1;
      cur.rawM3 = round2(cur.rawM3 + Number(ctx.ticketMeters(r) || 0));
      cur.rawCost = round2(cur.rawCost + Number(r.total != null ? r.total : (Number(r.cost || 0) + Number(r.trans_cost || 0))));
    });
    const productRows = Array.from(prodMap.values()).sort((a, b) => (b.salesTtc - a.salesTtc) || (b.rawCost - a.rawCost));

    // Unified Cash & Treasury Movements for Panel 4 (Cash Sales, AR, AP, Ext In/Out, Loans, Cash Expenses, Payroll, FX)
    const cashMoveRows = [];
    dayRcpts.forEach(r => {
      if (ctx.receiptKind(r) === 'Excluded') return;
      const amt = round2(Number(r.amount || 0) + Number(r.discount || 0));
      cashMoveRows.push({
        rkey: 'receipts',
        rid: r.id,
        company: r.company || 'WTC',
        badgeCls: 'cash',
        badgeTxt: 'AR In',
        party: r.customer || 'Customer',
        detail: [r.reference ? `#${r.reference}` : '', `${r.method || 'Cash'} Receipt`, Number(r.discount || 0) > 0 ? `Disc ${ctx.fmtUSD(r.discount, 0)}` : ''].filter(Boolean).join(' · '),
        txDate: txDateOf(r) || targetDate,
        repDate: repDateOf(r),
        isRepShifted: hasRepShift(r),
        amount: amt,
        isInflow: true,
        mag: Math.abs(amt),
        orderGroup: 1
      });
    });
    effSales.forEach(s => {
      const sgn = ctx.ticketSign(s);
      if (!sgn || !ctx.isCashSaleTicket(s)) return;
      const rowTtc = round2(Number(s.total_ttc != null ? s.total_ttc : s.total || 0) * sgn);
      const rowNet = round2(Number(s.total != null ? s.total : (Number(s.total_ttc || 0) - Number(s.vat || 0))) * sgn);
      const m3 = round2(Number(ctx.ticketMeters(s) || 0) * sgn);
      cashMoveRows.push({
        rkey: 'sales_tickets',
        rid: s.id,
        company: s.company || 'WTC',
        badgeCls: 'sales',
        badgeTxt: 'Cash Sale',
        party: s.customer || 'Walk-in',
        detail: [s.ticket_no ? `#${s.ticket_no}` : '', s.product || '', m3 ? `${ctx.fmtNum(m3, 0)} m³` : ''].filter(Boolean).join(' · '),
        txDate: txDateOf(s) || targetDate,
        repDate: repDateOf(s),
        isRepShifted: hasRepShift(s),
        amount: rowNet,
        ttcAmt: rowTtc,
        isInflow: rowNet >= 0,
        mag: Math.abs(rowNet),
        orderGroup: 2
      });
    });
    extItems.forEach(ex => {
      const refStr = ex.row && ex.row.reference ? `#${ex.row.reference}` : '';
      cashMoveRows.push({
        rkey: 'external_movements',
        rid: ex.id,
        company: ex.company || 'WTC',
        badgeCls: ex.isOut ? 'exp' : 'ext',
        badgeTxt: ex.isOut ? 'Ext Out' : 'Ext In',
        party: ex.counterparty,
        detail: [ex.notes || ex.kind, refStr && !(ex.notes || '').includes(refStr) ? refStr : '', ex.lbp && !ex.usd ? fmtCompactLbp(ex.lbp) : ''].filter(Boolean).join(' · '),
        txDate: txDateOf(ex.row) || targetDate,
        repDate: repDateOf(ex.row),
        isRepShifted: hasRepShift(ex.row),
        amount: ex.isOut ? -ex.eqAmt : ex.eqAmt,
        isInflow: !ex.isOut,
        mag: Math.abs(ex.eqAmt),
        orderGroup: ex.isOut ? 4 : 3
      });
    });
    loanEvents.forEach(ln => {
      cashMoveRows.push({
        rkey: ln.rkey,
        rid: ln.id,
        company: ln.company || 'WTC',
        badgeCls: 'loan',
        badgeTxt: ln.isInflow ? 'Loan In' : 'Loan Out',
        party: ln.party,
        detail: [ln.badge, ln.notes || '', ln.lbp ? fmtCompactLbp(ln.lbp) : ''].filter(Boolean).join(' · '),
        txDate: targetDate,
        repDate: '',
        isRepShifted: false,
        amount: ln.isInflow ? ln.eqAmt : -ln.eqAmt,
        isInflow: ln.isInflow,
        mag: Math.abs(ln.eqAmt),
        orderGroup: ln.isInflow ? 3 : 4
      });
    });
    daySets.forEach(s => {
      if (ctx.settlementKind(s) === 'Excluded') return;
      const amt = round2(Number(s.amount || 0) + Number(s.discount || 0));
      cashMoveRows.push({
        rkey: 'settlements',
        rid: s.id,
        company: s.company || 'WTC',
        badgeCls: 'pay',
        badgeTxt: 'AP Out',
        party: s.supplier || 'Supplier',
        detail: [s.invoice || s.reference || '', `${s.method || 'Cash'} Settlement`].filter(Boolean).join(' · '),
        txDate: txDateOf(s) || targetDate,
        repDate: repDateOf(s),
        isRepShifted: hasRepShift(s),
        amount: -amt,
        isInflow: false,
        mag: Math.abs(amt),
        orderGroup: 5
      });
    });
    daySals.forEach(sa => {
      const lbp = Number(sa.lbp_amount || 0);
      const usd = lbp ? Number(sa.usd_amount || 0) : Number(sa.amount || 0);
      const eq = round2(usd + (lbp ? lbp / fxRate : 0));
      cashMoveRows.push({
        rkey: 'salaries',
        rid: sa.id,
        company: sa.company || 'WTC',
        badgeCls: 'team',
        badgeTxt: 'Salary Out',
        party: sa.staff || 'Staff',
        detail: [sa.payroll_month, sa.method || 'Cash', lbp ? fmtCompactLbp(lbp) : ''].filter(Boolean).join(' · '),
        txDate: txDateOf(sa) || targetDate,
        repDate: repDateOf(sa),
        isRepShifted: hasRepShift(sa),
        amount: -eq,
        isInflow: false,
        mag: Math.abs(eq),
        orderGroup: 6
      });
    });
    expenseBillRows.filter(b => b.isCash && b.amount !== 0).forEach(b => {
      cashMoveRows.push({
        rkey: 'expenses',
        rid: b.id,
        company: b.company || 'WTC',
        badgeCls: 'exp',
        badgeTxt: 'Cash Exp',
        party: b.supplier,
        detail: [b.equipment, b.subcategory || b.category, b.notes].filter(Boolean).join(' · '),
        txDate: b.txDate || targetDate,
        repDate: b.repDate || '',
        isRepShifted: Boolean(b.isRepShifted),
        amount: -b.amount,
        isInflow: false,
        mag: Math.abs(b.amount),
        orderGroup: 7
      });
    });
    convItems.forEach(cv => {
      cashMoveRows.push({
        rkey: 'conversions',
        rid: cv.id,
        company: cv.company || 'WTC',
        badgeCls: 'fx',
        badgeTxt: 'FX Conv',
        party: cv.dirLabel,
        detail: `${fmtCompactLbp(cv.lbpMag)} @ ${ctx.fmtNum(cv.rate, 0)}${cv.notes ? ' · ' + cv.notes : ''}`,
        txDate: txDateOf(cv.row) || targetDate,
        repDate: repDateOf(cv.row),
        isRepShifted: hasRepShift(cv.row),
        amount: cv.usdMag,
        isInflow: !cv.u2l,
        isFx: true,
        mag: Math.abs(cv.usdMag),
        orderGroup: 8
      });
    });
    cashMoveRows.sort((a, b) => (b.mag - a.mag) || (a.orderGroup - b.orderGroup));

    // ---- 5. UNIFIED DISCRETE RECORDS STREAM ACROSS ALL DOMAINS ----
    const compactRef = (raw, id, prefix, seq) => {
      const s = String(raw || '').trim();
      if (s && s !== '-') {
        const hashMatch = s.match(/#[A-Za-z0-9-]+$/);
        if (hashMatch) return hashMatch[0];
        if (s.length <= 10 && !/\s/.test(s) && !/^[0-9a-f]{8,}$/i.test(s)) return s;
        const numTail = s.match(/(\d{2,8})$/);
        if (numTail && prefix !== 'PR') return `#${numTail[1]}`;
      }
      const idStr = String(id || '').trim();
      if (!/^[0-9a-f-]{20,}$/i.test(idStr)) {
        const idNum = idStr.match(/(\d{1,8})$/);
        if (idNum) return `${prefix}-${idNum[1]}`;
      }
      return seq != null ? `${prefix}-${seq}` : prefix;
    };

    const stream = [];
    dayPriceRules.forEach((pr, idxSeq) => {
      const info = describePriceRule(ctx, pr);
      stream.push({
        rkey: 'price_rules', rid: pr.id, company: pr.company || 'WTC',
        group: 'agreements', kindCls: 'rule', kindLbl: info.badge,
        isAfterHours: false, isRepShifted: false, repDate: '', txDate: targetDate, time: '',
        ref: compactRef('', pr.id, 'PR', idxSeq + 1),
        party: info.party, detail: info.sub || pr.rule_type || 'Agreement',
        qtyTxt: info.rateTxt, amount: null,
        inflow: false, tier: 1, sortKey: '99_' + String(pr.id || '')
      });
    });
    dayVatInvoices.forEach(vi => {
      stream.push({
        rkey: 'vat_invoices', rid: vi.id, company: vi.company || 'WTC',
        group: 'agreements', kindCls: 'rule', kindLbl: 'VAT Inv',
        isAfterHours: false, isRepShifted: hasRepShift(vi), repDate: repDateOf(vi), txDate: targetDate, time: '',
        ref: vi.invoice_no ? `#${vi.invoice_no}` : compactRef(vi.name, vi.id, 'VAT'),
        party: vi.customer || 'Customer', detail: `${vi.tickets_count || 0} tickets · VAT ${ctx.fmtUSD(Number(vi.vat_amount || 0), 0)}`,
        qtyTxt: '11% VAT', amount: round2(Number(vi.total_ttc || 0)),
        inflow: true, tier: 1, sortKey: '98_' + String(vi.invoice_no || '')
      });
    });
    dayCreditTerms.forEach(ct => {
      stream.push({
        rkey: 'credit_terms', rid: ct.id, company: ct.company || 'WTC',
        group: 'agreements', kindCls: 'rule', kindLbl: 'Credit',
        isAfterHours: false, isRepShifted: false, repDate: '', txDate: targetDate, time: '',
        ref: compactRef(ct.name, ct.id, 'CR'),
        party: ct.customer || 'Customer', detail: 'Credit Policy',
        qtyTxt: `${ct.credit_days || 0} days`, amount: null,
        inflow: false, tier: 1, sortKey: '97_' + String(ct.id || '')
      });
    });
    dayJvDists.forEach(jv => {
      const amt = round2(Number(jv.amount || jv.total || 0));
      stream.push({
        rkey: 'jv_distributions', rid: jv.id, company: jv.company || 'WTC',
        group: 'agreements', kindCls: 'rule', kindLbl: 'JV Dist',
        isAfterHours: false, isRepShifted: hasRepShift(jv), repDate: repDateOf(jv), txDate: targetDate, time: '',
        ref: compactRef(jv.name, jv.id, 'JV'),
        party: jv.partner || 'JV Partner', detail: [jv.site, jv.basis].filter(Boolean).join(' · '),
        qtyTxt: 'JV Share', amount: amt,
        inflow: false, tier: 1, sortKey: '96_' + String(jv.id || '')
      });
    });
    effSales.forEach(s => {
      const sgn = ctx.ticketSign(s);
      const isAh = ahIdSet.has(s.id);
      const m3 = Number(ctx.ticketMeters(s) || 0) * (sgn || 1);
      const qtyTxt = m3 !== 0 ? `${ctx.fmtNum(m3, m3 % 1 ? 1 : 0)} m³` : `${ctx.fmtNum(Number(s.qty || 0), 0)} ${s.uom || ''}`.trim();
      const amt = round2(Number(s.total_ttc != null ? s.total_ttc : s.total || 0) * (sgn || 1));
      stream.push({
        rkey: 'sales_tickets', rid: s.id, company: s.company || 'WTC',
        group: 'sales', kindCls: sgn < 0 ? 'crit' : 'sales', kindLbl: sgn < 0 ? 'Return' : 'Sale',
        isAfterHours: isAh, isOvertime: Boolean(s.overtime), isRepShifted: hasRepShift(s), repDate: repDateOf(s), txDate: txDateOf(s), time: String(s.time || '').slice(0, 5),
        ref: s.ticket_no ? `#${s.ticket_no}` : compactRef(s.name, s.id, 'S'),
        party: s.customer || 'Walk-in', detail: [s.product, s.site, s.method].filter(Boolean).join(' · '),
        qtyTxt, amount: amt, inflow: amt >= 0, tier: 2,
        sortKey: String(s.time || '12:00').padStart(5, '0') + '_' + String(s.ticket_no || '').padStart(8, '0')
      });
    });
    effRaw.forEach(r => {
      const isAh = ahIdSet.has(r.id);
      const m3 = Number(ctx.ticketMeters(r) || 0);
      const qtyTxt = m3 !== 0 ? `${ctx.fmtNum(m3, m3 % 1 ? 1 : 0)} m³` : `${ctx.fmtNum(Number(r.qty || 0), 0)} ${r.uom || ''}`.trim();
      const amt = round2(Number(r.total != null ? r.total : (Number(r.cost || 0) + Number(r.trans_cost || 0))));
      stream.push({
        rkey: 'raw_purchases', rid: r.id, company: r.company || 'WTC',
        group: 'raw', kindCls: 'raw', kindLbl: 'Quarry',
        isAfterHours: isAh, isOvertime: Boolean(r.overtime), isPendingPrice: Boolean(r.price_pending), isRepShifted: hasRepShift(r), repDate: repDateOf(r), txDate: txDateOf(r), time: String(r.time || '').slice(0, 5),
        ref: r.ticket_no ? `#${r.ticket_no}` : compactRef(r.name, r.id, 'R'),
        party: r.site_owner || r.truck_owner || r.site || 'Quarry', detail: [r.product, r.site, r.truck].filter(Boolean).join(' · '),
        qtyTxt, amount: amt, inflow: false, tier: 2,
        sortKey: String(r.time || '12:00').padStart(5, '0') + '_' + String(r.ticket_no || '').padStart(8, '0')
      });
    });
    extItems.forEach(ex => {
      stream.push({
        rkey: 'external_movements', rid: ex.id, company: ex.company,
        group: 'external', kindCls: 'ext', kindLbl: ex.isOut ? 'Ext Out' : 'Ext In',
        isAfterHours: false, isRepShifted: hasRepShift(ex.row), repDate: repDateOf(ex.row), txDate: txDateOf(ex.row) || targetDate, time: '',
        ref: compactRef(ex.row.name, ex.id, 'EXT'),
        party: ex.counterparty, detail: ex.notes || ex.kind,
        qtyTxt: ex.lbp ? fmtCompactLbp(ex.lbp) : 'USD', amount: ex.isOut ? -ex.eqAmt : ex.eqAmt,
        inflow: !ex.isOut, tier: 3,
        sortKey: String(Math.round(ex.eqAmt)).padStart(9, '0') + '_' + String(ex.id || '')
      });
    });
    convItems.forEach(cv => {
      stream.push({
        rkey: 'conversions', rid: cv.id, company: cv.company,
        group: 'fx_loans', kindCls: 'fx', kindLbl: 'FX Conv',
        isAfterHours: false, isRepShifted: hasRepShift(cv.row), repDate: repDateOf(cv.row), txDate: txDateOf(cv.row) || targetDate, time: '',
        ref: compactRef(cv.row.name, cv.id, 'FX'),
        party: cv.dirLabel, detail: `${fmtCompactLbp(cv.lbpMag)} @ ${ctx.fmtNum(cv.rate, 0)}${cv.notes ? ' · ' + cv.notes : ''}`,
        qtyTxt: `@ ${ctx.fmtNum(cv.rate, 0)}`, amount: cv.usdMag,
        inflow: !cv.u2l, tier: 3,
        sortKey: String(Math.round(cv.usdMag)).padStart(9, '0') + '_' + String(cv.id || '')
      });
    });
    loanEvents.forEach(ln => {
      stream.push({
        rkey: ln.rkey, rid: ln.id, company: ln.company,
        group: 'fx_loans', kindCls: 'loan', kindLbl: ln.badge,
        isAfterHours: false, isRepShifted: false, repDate: '', txDate: targetDate, time: '',
        ref: compactRef('', ln.id, 'LN'),
        party: ln.party, detail: ln.notes || (ln.lbp ? fmtCompactLbp(ln.lbp) : 'Treasury Loan'),
        qtyTxt: ln.lbp ? fmtCompactLbp(ln.lbp) : 'USD', amount: ln.isInflow ? ln.eqAmt : -ln.eqAmt,
        inflow: ln.isInflow, tier: 3,
        sortKey: String(Math.round(ln.eqAmt)).padStart(9, '0') + '_' + String(ln.id || '')
      });
    });
    dayRcpts.forEach(r => {
      if (ctx.receiptKind(r) === 'Excluded') return;
      const amt = round2(Number(r.amount || 0) + Number(r.discount || 0));
      stream.push({
        rkey: 'receipts', rid: r.id, company: r.company || 'WTC',
        group: 'ar_ap', kindCls: 'cash', kindLbl: 'AR In',
        isAfterHours: false, isRepShifted: hasRepShift(r), repDate: repDateOf(r), txDate: txDateOf(r), time: '',
        ref: compactRef(r.reference || r.name, r.id, 'RC'),
        party: r.customer || 'Customer', detail: `${r.method || 'Cash'} Receipt${Number(r.discount || 0) > 0 ? ' · Disc ' + ctx.fmtUSD(r.discount, 0) : ''}`,
        qtyTxt: r.method || 'Cash', amount: amt, inflow: true, tier: 3,
        sortKey: String(Math.round(Math.abs(amt))).padStart(9, '0') + '_' + String(r.id || '')
      });
    });
    daySets.forEach(s => {
      if (ctx.settlementKind(s) === 'Excluded') return;
      const amt = round2(Number(s.amount || 0) + Number(s.discount || 0));
      stream.push({
        rkey: 'settlements', rid: s.id, company: s.company || 'WTC',
        group: 'ar_ap', kindCls: 'pay', kindLbl: 'AP Out',
        isAfterHours: false, isRepShifted: hasRepShift(s), repDate: repDateOf(s), txDate: txDateOf(s), time: '',
        ref: compactRef(s.invoice || s.reference || s.name, s.id, 'ST'),
        party: s.supplier || 'Supplier', detail: `${s.method || 'Cash'} Settlement`,
        qtyTxt: s.method || 'Cash', amount: amt, inflow: false, tier: 3,
        sortKey: String(Math.round(Math.abs(amt))).padStart(9, '0') + '_' + String(s.id || '')
      });
    });
    dayExps.forEach(x => {
      const sgn = ctx.expenseSign(x);
      if (!sgn && !ctx.isPendingPriceExpense(x)) return;
      const amt = round2(Number(x.amount || 0) * (sgn || 1));
      stream.push({
        rkey: 'expenses', rid: x.id, company: x.company || 'WTC',
        group: 'expenses', kindCls: 'exp', kindLbl: ctx.isPendingPriceExpense(x) ? 'Pending' : 'Expense',
        isAfterHours: false, isPendingPrice: Boolean(ctx.isPendingPriceExpense(x)), isRepShifted: hasRepShift(x), repDate: repDateOf(x), txDate: txDateOf(x), time: '',
        ref: x.invoice ? `#${x.invoice}` : compactRef(x.reference || x.name, x.id, 'EX'),
        party: x.supplier || x.category || 'Expense', detail: [x.category, x.subcategory, x.equipment].filter(Boolean).join(' · '),
        qtyTxt: Number(x.qty || 0) > 1 ? `${ctx.fmtNum(Number(x.qty), 0)} qty` : (x.method || 'Cash'),
        amount: amt, inflow: false, tier: 4,
        sortKey: String(Math.round(Math.abs(amt))).padStart(9, '0') + '_' + String(x.id || '')
      });
    });
    dayWhMoves.forEach(wm => {
      stream.push({
        rkey: 'warehouse_movements', rid: wm.id, company: wm.company || 'WTC',
        group: 'expenses', kindCls: 'exp', kindLbl: 'Stock',
        isAfterHours: false, isRepShifted: false, repDate: '', txDate: targetDate, time: '',
        ref: compactRef(wm.name, wm.id, 'WH'),
        party: wm.item_name || 'Warehouse Item', detail: [wm.warehouse_location, wm.target_equipment].filter(Boolean).join(' · '),
        qtyTxt: `${wm.qty_delta || wm.qty || 0} ${wm.uom || ''}`.trim(), amount: null, inflow: false, tier: 4,
        sortKey: '50_' + String(wm.id || '')
      });
    });
    dayFuels.forEach(fl => {
      const q = Number(fl.litres || 0);
      const itemStr = String(fl.item || fl.fuel_type || 'Diesel');
      const unitStr = /grease/i.test(itemStr) ? 'kg' : 'L';
      stream.push({
        rkey: 'fuel_intakes', rid: fl.id, company: fl.company || 'WTC',
        group: 'fuel_maint', kindCls: 'fuel', kindLbl: 'Fuel',
        isAfterHours: false, isRepShifted: hasRepShift(fl), repDate: repDateOf(fl), txDate: txDateOf(fl), time: '',
        ref: fl.ticket_no ? `#${fl.ticket_no}` : compactRef(fl.name, fl.id, 'FL'),
        party: fl.equipment || 'Plant Tank', detail: [itemStr, fl.driver].filter(Boolean).join(' · '),
        qtyTxt: `${ctx.fmtNum(q, q % 1 ? 1 : 0)} ${unitStr}`, amount: null, inflow: false, tier: 5,
        sortKey: String(Math.round(q)).padStart(7, '0') + '_' + String(fl.id || '')
      });
    });
    dayMalfs.forEach(mf => {
      const mfItem = String(mf.item || 'Diesel').trim() || 'Diesel';
      const mfUom = String(mf.uom || (/grease|تشحيم|مشحمة/i.test(mfItem) ? 'kg' : 'L')).trim() || 'L';
      const mfQty = Number(mf.litres != null ? mf.litres : (mf.qty || 0));
      const isDieselMf = /diesel|mazout/i.test(mfItem);
      stream.push({
        rkey: 'fuel_malfunctions', rid: mf.id, company: mf.company || 'WTC',
        group: 'fuel_maint', kindCls: 'maint', kindLbl: isDieselMf ? 'Tank Var' : 'Stock Var',
        isAfterHours: false, isException: true, isRepShifted: hasRepShift(mf), repDate: repDateOf(mf), txDate: targetDate, time: '',
        ref: mf.ticket_no ? `#${mf.ticket_no}` : compactRef(mf.name, mf.id, 'MF'),
        party: `${mfItem} · ${mf.discrepancy_type || 'Malfunction'}`, detail: safeNotes(ctx, mf.notes) || mf.equipment || (isDieselMf ? 'Diesel Tank' : (mf.category || 'Inventory')),
        qtyTxt: `${ctx.fmtNum(mfQty, mfQty % 1 ? 1 : 0)} ${mfUom}`, amount: null, inflow: false, tier: 5,
        sortKey: '90_' + String(mf.id || '')
      });
    });
    dayOilLogs.forEach(ol => {
      stream.push({
        rkey: 'equipment_oil_logs', rid: ol.id, company: ol.company || 'WTC',
        group: 'fuel_maint', kindCls: 'maint', kindLbl: 'Oil Log',
        isAfterHours: false, isRepShifted: false, repDate: '', txDate: targetDate, time: '',
        ref: compactRef(ol.name, ol.id, 'OIL'),
        party: ol.equipment || 'Equipment', detail: [ol.oil_type, ol.service_action].filter(Boolean).join(' · '),
        qtyTxt: `${ctx.fmtNum(Number(ol.qty || 0), 0)} L`, amount: Number(ol.cost_usd || 0) || null, inflow: false, tier: 5,
        sortKey: '85_' + String(ol.id || '')
      });
    });
    dayRepairs.forEach(rp => {
      stream.push({
        rkey: 'equipment_repairs', rid: rp.id, company: rp.company || 'WTC',
        group: 'fuel_maint', kindCls: 'maint', kindLbl: 'Repair',
        isAfterHours: false, isRepShifted: false, repDate: '', txDate: targetDate, time: '',
        ref: compactRef(rp.name, rp.id, 'RP'),
        party: rp.equipment || 'Equipment', detail: [rp.repair_source, safeNotes(ctx, rp.notes)].filter(Boolean).join(' · '),
        qtyTxt: 'Maint', amount: Number(rp.total_cost || rp.cost || 0) || null, inflow: false, tier: 5,
        sortKey: '84_' + String(rp.id || '')
      });
    });
    dayDefects.forEach(df => {
      stream.push({
        rkey: 'equipment_defects', rid: df.id, company: df.company || 'WTC',
        group: 'fuel_maint', kindCls: /grave|crit/i.test(String(df.severity || '')) ? 'crit' : 'maint', kindLbl: 'Defect',
        isAfterHours: false, isException: true, isRepShifted: false, repDate: '', txDate: targetDate, time: '',
        ref: compactRef(df.name, df.id, 'DF'),
        party: df.equipment || 'Equipment', detail: [df.severity, df.part_name, safeNotes(ctx, df.description || df.notes)].filter(Boolean).join(' · '),
        qtyTxt: df.status || 'Open', amount: null, inflow: false, tier: 5,
        sortKey: '83_' + String(df.id || '')
      });
    });
    dayCoEquip.forEach(ce => {
      stream.push({
        rkey: 'company_equipment', rid: ce.id, company: ce.company || 'WTC',
        group: 'fuel_maint', kindCls: 'fuel', kindLbl: 'New Unit',
        isAfterHours: false, isRepShifted: false, repDate: '', txDate: targetDate, time: '',
        ref: compactRef(ce.equipment, ce.id, 'EQ'),
        party: ce.equipment || 'Truck', detail: [ce.ownership, ce.supplier].filter(Boolean).join(' · '),
        qtyTxt: ce.status || 'Active', amount: null, inflow: false, tier: 5,
        sortKey: '80_' + String(ce.id || '')
      });
    });
    daySals.forEach(sa => {
      const lbp = Number(sa.lbp_amount || 0);
      const usd = lbp ? Number(sa.usd_amount || 0) : Number(sa.amount || 0);
      const eq = round2(usd + (lbp ? lbp / fxRate : 0));
      stream.push({
        rkey: 'salaries', rid: sa.id, company: sa.company || 'WTC',
        group: 'team', kindCls: 'team', kindLbl: 'Payroll',
        isAfterHours: false, isRepShifted: hasRepShift(sa), repDate: repDateOf(sa), txDate: txDateOf(sa) || targetDate, time: '',
        ref: compactRef(sa.name, sa.id, 'SAL'),
        party: sa.staff || 'Staff', detail: [sa.payroll_month, sa.method].filter(Boolean).join(' · '),
        qtyTxt: lbp ? fmtCompactLbp(lbp) : 'USD', amount: eq, inflow: false, tier: 6,
        sortKey: String(Math.round(eq)).padStart(9, '0') + '_' + String(sa.id || '')
      });
    });
    dayEmps.forEach(em => {
      stream.push({
        rkey: 'employments', rid: em.id, company: em.company || 'WTC',
        group: 'team', kindCls: 'team', kindLbl: 'Contract',
        isAfterHours: false, isRepShifted: false, repDate: '', txDate: targetDate, time: '',
        ref: compactRef(em.name, em.id, 'EMP'),
        party: em.staff || 'Employee', detail: `${em.type || 'Staff'} Contract Started`,
        qtyTxt: `${em.working_days || 30}d/mo`, amount: Number(em.salary_usd || 0) || null, inflow: false, tier: 6,
        sortKey: '75_' + String(em.id || '')
      });
    });
    dayAtt.forEach((at, atIdx) => {
      const isAbs = /absent|leave|off|sick/i.test(String(at.status || at.type || '')) || Number(at.leave_days || 0) > 0;
      const oth = Number(at.overtime_hours || 0);
      const payUsd = round2(Number(at.payroll_impact_usd || 0));
      const shiftTxt = at.in_time && at.out_time ? `${at.in_time}-${at.out_time}` : (at.status || 'Shift');
      stream.push({
        rkey: 'attendance', rid: at.id, company: at.company || 'WTC',
        group: 'team', kindCls: isAbs ? 'crit' : (oth > 0 ? 'loan' : 'team'),
        kindLbl: isAbs ? 'Absent' : (oth > 0 ? `+${ctx.fmtNum(oth, 0)}h OT` : 'Shift'),
        isAfterHours: false, isOvertime: oth > 0, isException: isAbs,
        isRepShifted: hasRepShift(at), repDate: repDateOf(at), txDate: txDateOf(at) || targetDate,
        time: String(at.in_time || '').slice(0, 5),
        ref: compactRef(at.name, at.id, 'ATT', atIdx + 1),
        party: at.staff || 'Staff', detail: `${shiftTxt}${at.worked_hours ? ` · ${ctx.fmtNum(at.worked_hours, 0)}h` : ''}`,
        qtyTxt: isAbs ? 'Absent' : (oth > 0 ? `+${ctx.fmtNum(oth, 1)}h OT` : `${ctx.fmtNum(at.worked_hours || 0, 0)}h`),
        amount: payUsd > 0 ? payUsd : null, inflow: false, tier: 6,
        sortKey: String(Math.round(oth * 10 + (isAbs ? 500 : 0))).padStart(6, '0') + '_' + String(at.id || '')
      });
    });
    dayRegAdds.forEach((ad, adIdx) => {
      const r = ad.row || {};
      stream.push({
        rkey: ad.rkey, rid: r.id, company: r.company || 'WTC',
        group: 'team', kindCls: 'rule', kindLbl: ad.cleanLabel || ad.label || 'Master',
        isAfterHours: false, isRepShifted: false, repDate: '', txDate: targetDate, time: '',
        ref: compactRef('', r.id, 'MST', adIdx + 1),
        party: ad.cleanName || r.name || '-', detail: ad.cleanSub || 'Master Registry',
        qtyTxt: 'New', amount: null, inflow: false, tier: 6,
        sortKey: '70_' + String(r.id || '')
      });
    });

    stream.sort((a, b) => {
      if (a.isAfterHours !== b.isAfterHours) return a.isAfterHours ? -1 : 1;
      if (a.tier !== b.tier) return a.tier - b.tier;
      return b.sortKey.localeCompare(a.sortKey);
    });

    const prevCalendarDate = shiftIsoDays(targetDate, -1);
    const nextCalendarDate = shiftIsoDays(targetDate, 1);

    return {
      idx,
      targetDate,
      yestDate,
      fxRate,
      prevDate: prevCalendarDate >= ctx.MIN_DATE ? prevCalendarDate : '',
      nextDate: nextCalendarDate <= ctx.MAX_DATE ? nextCalendarDate : '',
      includeAh,
      ahAvailableCount,
      ahAvailableUsd,
      ahSalesCount: ahSalesAll.length,
      ahRawCount: ahRawAll.length,
      salesSum,
      salesTodayOnly,
      salesAhSum,
      rawSum,
      rawTodayOnly,
      rawAhSum,
      // Commercial & Agreements
      dayPriceRules,
      recentWeekRules,
      dayCreditTerms,
      dayOtRates,
      dayVatInvoices,
      dayJvDists,
      dayFxRates,
      dayVatRates,
      newPoliciesCount,
      agreedSalesLoads,
      spotSalesLoads,
      belowAgreedLoads,
      lapsedSalesLoads,
      belowShortfallUsd,
      agreedRawLoads,
      activeRulesUsed,
      rateAuditRows,
      belowTicketEvents,
      vatBilledTodayTtc,
      vatBilledTodayTax,
      jvDistTodayUsd,
      // Expenses & Warehouse
      expTotal,
      expExVat,
      cashExp,
      cashExpLbp,
      creditExp,
      expCount,
      pendingExps,
      expCategoryRows,
      expenseBillRows,
      dayExpItems,
      dayWhMoves,
      whStockedItems,
      whAllocatedItems,
      whMoveInCount,
      whMoveOutCount,
      // Treasury, External, FX & Loans
      arCollected,
      arDiscUsd,
      arRcptCount,
      dayRcpts,
      apPaid,
      apDiscUsd,
      apSetCount,
      daySets,
      salariesPaid,
      salariesLbp,
      salCount: daySals.length,
      daySals,
      extInUsd,
      extInLbp,
      extInEq,
      extInCount,
      extOutUsd,
      extOutLbp,
      extOutEq,
      extOutCount,
      extItems,
      u2lCount,
      u2lUsd,
      u2lLbp,
      l2uCount,
      l2uUsd,
      l2uLbp,
      totConvUsd,
      totConvLbp,
      avgConvRate,
      convItems,
      loanInEq,
      loanOutEq,
      loanEvents,
      cashMoveRows,
      grossMargin,
      gmPct,
      operatingProfit,
      opMarginPct,
      cashInflow,
      cashOutflow,
      netCashFlow,
      liveTillUsd,
      liveTillLbp,
      // Plant, Fleet, Maintenance & Team
      activeTrucksCount: activeTruckSet.size,
      companyFleetTrips,
      haulerTrips,
      dieselIssuedL: round2(dieselIssuedL),
      dieselBoughtL: round2(dieselBoughtL),
      lubeL: round2(lubeL),
      greaseKg: round2(greaseKg),
      fuelFillsCount: dayFuels.length,
      dayFuels,
      fuelSortedRows,
      fuelUnitRows,
      closingTankL,
      closingTankLbl,
      dayMalfs,
      malfNetL,
      openCritDefects,
      dayDefects,
      dayRepairs,
      dayOilLogs,
      dayPartMoves,
      dayCoEquip,
      dayAdjWins,
      activeStaffCount: activeStaffSet.size,
      presentAttCount,
      kioskPunchTodayCount,
      absentCount,
      dayAtt,
      attSortedRows,
      dayEmps,
      dayLogAllows,
      dayFlEntries,
      dayFlPays,
      dayRegAdds,
      otTotalLoads: salesSum.otLoads + rawSum.otLoads,
      attOtHours: round2(attOtHours),
      attOtStaffCount,
      attOtPayUsd,
      repShiftedCount,
      exceptionCount,
      avg7Sales,
      avg7Profit,
      pulseRows,
      hourBuckets,
      entityRows,
      customerRows,
      quarryGroupRows,
      productRows,
      stream
    };
  }

  function renderPulseSvg(ctx, dm, chartMode) {
    const { esc, fmtUSD, fmtUSDk, fmtNum } = ctx;
    const W = 540, H = 108, padL = 42, padR = 10, padT = 10, padB = 20;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    if (chartMode === 'hours') {
      const buckets = dm.includeAh ? dm.hourBuckets : dm.hourBuckets.slice(1);
      let maxLoads = 2;
      buckets.forEach(b => {
        if (b.salesLoads > maxLoads) maxLoads = b.salesLoads;
        if (b.rawLoads > maxLoads) maxLoads = b.rawLoads;
      });
      maxLoads = Math.ceil(maxLoads * 1.15);
      const grpW = plotW / buckets.length;
      const barW = Math.min(22, Math.max(8, grpW * 0.28));

      const grid = [0, 0.5, 1].map(f => {
        const y = (padT + plotH * (1 - f)).toFixed(1);
        const val = Math.round(maxLoads * f);
        return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(128,138,158,0.18)" stroke-dasharray="3 3"/>
                <text x="${padL - 5}" y="${Number(y) + 3}" text-anchor="end" font-size="9" fill="var(--muted)">${val}</text>`;
      }).join('');

      const bars = buckets.map((b, i) => {
        const cx = padL + grpW * (i + 0.5);
        const hSales = Math.max(b.salesLoads > 0 ? 3 : 0, (b.salesLoads / maxLoads) * plotH);
        const hRaw = Math.max(b.rawLoads > 0 ? 3 : 0, (b.rawLoads / maxLoads) * plotH);
        const ySales = padT + plotH - hSales;
        const yRaw = padT + plotH - hRaw;
        const isAhSlot = b.key === 'ah';
        const popSpec = JSON.stringify({
          title: `${b.label} · ${b.sub}`,
          badge: `${b.salesLoads + b.rawLoads} loads`,
          rows: [
            { label: 'Sales Dispatches', value: `${fmtNum(b.salesLoads)} loads (${fmtUSD(b.salesTtc, 0)})`, color: '#2356A8' },
            { label: 'Quarry & Haulage', value: `${fmtNum(b.rawLoads)} loads (${fmtUSD(b.rawCost, 0)})`, color: '#C0892F' }
          ],
          footer: isAhSlot ? 'Logged via Yesterday After-Hours button' : `Transaction Date ${dm.targetDate}`
        });
        return `
          <g class="dops-bar-group" data-chart-pop="${esc(popSpec)}">
            <rect class="dops-hover-bg" x="${(padL + grpW * i + 2).toFixed(1)}" y="${padT}" width="${(grpW - 4).toFixed(1)}" height="${plotH}" rx="4" fill="${isAhSlot ? 'rgba(192,137,47,0.10)' : 'rgba(35,86,168,0.06)'}" opacity="${isAhSlot ? '0.85' : '0'}"/>
            <rect x="${(cx - barW - 1.5).toFixed(1)}" y="${ySales.toFixed(1)}" width="${barW.toFixed(1)}" height="${hSales.toFixed(1)}" rx="2.5" fill="var(--chart-navy, #2356A8)"/>
            <rect x="${(cx + 1.5).toFixed(1)}" y="${yRaw.toFixed(1)}" width="${barW.toFixed(1)}" height="${hRaw.toFixed(1)}" rx="2.5" fill="var(--chart-brass, #C0892F)"/>
            <text x="${cx.toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="9" font-weight="${isAhSlot ? '700' : '600'}" fill="${isAhSlot ? 'var(--brass-strong, var(--brass))' : 'var(--muted)'}">${esc(b.label)}</text>
          </g>
        `;
      }).join('');

      return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Hourly dispatch rhythm">${grid}${bars}</svg>`;
    }

    const rows = dm.pulseRows;
    let maxVal = 100;
    rows.forEach(r => {
      if (r.salesTtc > maxVal) maxVal = r.salesTtc;
      if (r.outlay > maxVal) maxVal = r.outlay;
      if (Math.abs(r.opProfit) > maxVal) maxVal = Math.abs(r.opProfit);
    });
    maxVal *= 1.14;

    const grpW = plotW / Math.max(1, rows.length);
    const barW = Math.min(17, Math.max(6, grpW * 0.24));

    const grid = [0, 0.5, 1].map(f => {
      const y = (padT + plotH * (1 - f)).toFixed(1);
      const val = maxVal * f;
      return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(128,138,158,0.18)" stroke-dasharray="3 3"/>
              <text x="${padL - 5}" y="${Number(y) + 3}" text-anchor="end" font-size="9" fill="var(--muted)">${fmtUSDk(val)}</text>`;
    }).join('');

    const profitPts = [];
    const bars = rows.map((r, i) => {
      const cx = padL + grpW * (i + 0.5);
      const isSelected = r.date === dm.targetDate;
      const hSales = Math.max(r.salesTtc > 0 ? 2.5 : 0, (Math.max(0, r.salesTtc) / maxVal) * plotH);
      const hOut = Math.max(r.outlay > 0 ? 2.5 : 0, (Math.max(0, r.outlay) / maxVal) * plotH);
      const ySales = padT + plotH - hSales;
      const yOut = padT + plotH - hOut;
      const profClamped = Math.max(0, r.opProfit);
      const yProf = padT + plotH - (profClamped / maxVal) * plotH;
      profitPts.push({ x: cx, y: yProf, pos: r.opProfit >= 0 });

      const popSpec = JSON.stringify({
        title: fmtHumanDay(r.date),
        badge: isSelected ? 'Selected Day' : 'Click to inspect',
        badgeTone: r.opProfit >= 0 ? 'good' : 'crit',
        rows: [
          { label: 'Sales Revenue (TTC)', value: `${fmtUSD(r.salesTtc, 0)} (${fmtNum(r.salesLoads)} loads)`, color: '#2356A8' },
          { label: 'Quarry + Expenses', value: `${fmtUSD(r.outlay, 0)} (${fmtNum(r.rawLoads)} raw)`, color: '#C0892F' },
          { label: 'Day Operating Profit', value: fmtUSD(r.opProfit, 0), color: r.opProfit >= 0 ? '#1F7A4C' : '#C8333B', tone: r.opProfit >= 0 ? 'good' : 'crit', isTotal: true }
        ],
        footer: r.ahLoads > 0 ? `Includes ${r.ahLoads} Yesterday After-Hours tickets · Tx Date Basis` : 'Transaction Date Basis (click bar to open day)'
      });

      return `
        <g class="dops-bar-group" data-dops-pick-date="${esc(r.date)}" data-chart-pop="${esc(popSpec)}">
          <rect class="dops-hover-bg" x="${(padL + grpW * i + 2).toFixed(1)}" y="${padT - 2}" width="${(grpW - 4).toFixed(1)}" height="${plotH + 4}" rx="5" fill="${isSelected ? 'rgba(192,137,47,0.12)' : 'rgba(35,86,168,0.06)'}" stroke="${isSelected ? 'rgba(192,137,47,0.45)' : 'none'}" stroke-width="1" opacity="${isSelected ? '1' : '0'}"/>
          <rect x="${(cx - barW - 1.5).toFixed(1)}" y="${ySales.toFixed(1)}" width="${barW.toFixed(1)}" height="${hSales.toFixed(1)}" rx="2.2" fill="var(--chart-navy, #2356A8)"/>
          <rect x="${(cx + 1.5).toFixed(1)}" y="${yOut.toFixed(1)}" width="${barW.toFixed(1)}" height="${hOut.toFixed(1)}" rx="2.2" fill="var(--chart-brass, #C0892F)"/>
          <text x="${cx.toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="9" font-weight="${isSelected ? '700' : '500'}" fill="${isSelected ? 'var(--ink)' : 'var(--muted)'}">${esc(fmtAxisDay(r.date))}</text>
        </g>
      `;
    }).join('');

    const polyLine = profitPts.length > 1
      ? `<polyline fill="none" stroke="var(--chart-good, #1F7A4C)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${profitPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" pointer-events="none"/>`
      : '';
    const dots = profitPts.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${p.pos ? 'var(--chart-good, #1F7A4C)' : 'var(--chart-crit, #C8333B)'}" stroke="var(--surface)" stroke-width="1.2" pointer-events="none"/>`).join('');

    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="7-day transaction pulse">${grid}${bars}${polyLine}${dots}</svg>`;
  }

  function renderMiniSparkBars(ctx, dm) {
    const { esc, fmtUSD, fmtNum } = ctx;
    const rows = dm.pulseRows || [];
    if (!rows.length) return '';
    let maxVal = 100;
    rows.forEach(r => {
      if (r.salesTtc > maxVal) maxVal = r.salesTtc;
      if (r.outlay > maxVal) maxVal = r.outlay;
    });
    return `
      <div class="dops-mini-spark" role="group" aria-label="7-day operating pulse">
        ${rows.map(r => {
          const isSel = r.date === dm.targetDate;
          const hSalesPx = Math.max(r.salesTtc > 0 ? 4 : 2, Math.min(20, Math.round((r.salesTtc / maxVal) * 20)));
          const hRawPx = Math.max(r.outlay > 0 ? 3 : 2, Math.min(20, Math.round((r.outlay / maxVal) * 20)));
          const popSpec = JSON.stringify({
            title: fmtHumanDay(r.date),
            badge: isSel ? 'Selected Day' : 'Click to open',
            badgeTone: r.opProfit >= 0 ? 'good' : 'crit',
            rows: [
              { label: 'Sales Revenue (TTC)', value: `${fmtUSD(r.salesTtc, 0)} (${fmtNum(r.salesLoads)} loads)`, color: '#2356A8' },
              { label: 'Quarry + Expenses', value: `${fmtUSD(r.outlay, 0)} (${fmtNum(r.rawLoads)} raw)`, color: '#C0892F' },
              { label: 'Operating Profit', value: fmtUSD(r.opProfit, 0), color: r.opProfit >= 0 ? '#1F7A4C' : '#C8333B', isTotal: true }
            ]
          });
          return `
            <button type="button" class="dops-spark-col${isSel ? ' is-sel' : ''}" data-dops-pick-date="${esc(r.date)}" data-chart-pop="${esc(popSpec)}">
              <span class="dops-spark-track"><span class="dops-spark-bar sales" style="height:${hSalesPx}px"></span><span class="dops-spark-bar raw" style="height:${hRawPx}px"></span></span>
              <span class="dops-spark-lbl">${esc(fmtAxisDay(r.date).split(' ')[0])}</span>
            </button>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderPanel1Sales(ctx, dm, lens, isSingleCo) {
    const { esc, ic, fmtUSD, fmtUSDk, fmtNum, coBadge, relLink, norm } = ctx;
    const qFilter = String(ctx.STATE.dailyOpsQuickFilter || 'all');
    const qNorm = String(ctx.STATE.dailyOpsQuickSearch || '').trim().toLowerCase();
    const expMap = ctx.STATE.dailyOpsExpanded || {};

    if (lens === 'chart') {
      const topCusts = dm.customerRows.filter(c => c.ttc > 0).slice(0, 3);
      const maxCust = topCusts.length ? Math.max(1, topCusts[0].ttc) : 1;
      return `
        <div class="dops-card-body">
          <div class="dops-pulse-wrap is-tall" id="dopsChartWrap">
            ${renderPulseSvg(ctx, dm, 'pulse')}
          </div>
          <div class="dops-top-bars">
            ${topCusts.map(c => {
              const pct = Math.min(100, Math.max(4, Math.round((c.ttc / maxCust) * 100)));
              return `
                <div class="dops-hbar-row" data-dops-lens="comm:pulse">
                  <div class="dops-hbar-name">${esc(c.name)}</div>
                  <div class="dops-hbar-meta">${fmtNum(c.loads)} loads · ${fmtNum(c.m3, 0)} m³</div>
                  <div class="dops-hbar-val">
                    <div class="dops-bar-track"><div class="dops-bar-fill" style="width:${pct}%"></div></div>
                    <strong>${fmtUSD(c.ttc, 0)}</strong>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    if (lens === 'grades') {
      const pRows = dm.productRows.filter(r => matchesQuickSearch(qNorm, [r.name]));
      const eRows = !isSingleCo ? dm.entityRows.filter(r => matchesQuickSearch(qNorm, [r.name])) : [];
      if (!pRows.length && !eRows.length) {
        return `<div class="dops-card-body"><div class="dops-empty">No material grades or entity dispatches on ${esc(fmtShortDay(dm.targetDate))}.</div></div>`;
      }
      return `
        <div class="dops-card-body no-pad dops-flex-col">
          <div class="dops-tbl-scroll">
            ${eRows.length ? `
              <table class="dops-table dops-fixed-3">
                <colgroup><col style="width:38%"><col style="width:34%"><col style="width:28%"></colgroup>
                <thead>
                  <tr>
                    <th>Entity (BU)</th>
                    <th class="r">Sales TTC (Loads)</th>
                    <th class="r">Profit · Cash</th>
                  </tr>
                </thead>
                <tbody>
                  ${eRows.map(r => `
                    <tr class="dops-click-row" data-jump-co="${esc(r.key)}">
                      <td class="dops-trunc">${coBadge(r.name)} <strong>${esc(r.name)}</strong></td>
                      <td class="r"><strong>${fmtUSD(r.salesTtc, 0)}</strong> <small style="color:var(--muted)">(${r.salesLoads}S/${r.rawLoads}R)</small></td>
                      <td class="r"><strong style="color:${r.opProfit < 0 ? 'var(--crit)' : 'var(--good)'}">${fmtUSD(r.opProfit, 0)}</strong> <small style="color:var(--muted)">(${fmtUSD(r.netCash, 0)})</small></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : ''}
            ${pRows.length ? `
              <table class="dops-table dops-fixed-3">
                <colgroup><col style="width:40%"><col style="width:32%"><col style="width:28%"></colgroup>
                <thead>
                  <tr>
                    <th>Material Grade</th>
                    <th class="r">Sold · Sales TTC</th>
                    <th class="r">Quarry · Cost</th>
                  </tr>
                </thead>
                <tbody>
                  ${pRows.map(r => `
                    <tr>
                      <td class="dops-trunc">${relLink('products', r.name, r.name, true)}</td>
                      <td class="r">${r.salesLoads ? `<strong>${fmtUSD(r.salesTtc, 0)}</strong> <small style="color:var(--muted)">(${fmtNum(r.salesM3, 0)}m³)</small>` : '-'}</td>
                      <td class="r">${r.rawLoads ? `${fmtUSD(r.rawCost, 0)} <small style="color:var(--muted)">(${fmtNum(r.rawM3, 0)}m³)</small>` : '-'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : ''}
          </div>
        </div>
      `;
    }

    if (lens === 'hours') {
      const peak = dm.hourBuckets.slice().sort((a, b) => (b.salesLoads + b.rawLoads) - (a.salesLoads + a.rawLoads))[0];
      return `
        <div class="dops-card-body">
          <div class="dops-pulse-wrap is-tall" id="dopsChartWrap">
            ${renderPulseSvg(ctx, dm, 'hours')}
          </div>
          <div class="dops-stat-strip-3">
            <div class="dops-stat-box" data-dops-open-drawer="sales">
              <small>Peak Window</small>
              <b>${peak && (peak.salesLoads + peak.rawLoads) > 0 ? `${esc(peak.label)} (${peak.salesLoads + peak.rawLoads})` : 'Quiet Day'}</b>
            </div>
            <div class="dops-stat-box" data-dops-open-drawer="sales">
              <small>Deliv · Pick · OT</small>
              <b>${fmtNum(dm.salesSum.deliveryLoads)}D · ${fmtNum(dm.salesSum.pickupLoads)}P · ${fmtNum(dm.otTotalLoads)} OT</b>
            </div>
            <div class="dops-stat-box${dm.ahAvailableCount > 0 ? ' tone-brass' : ''}" data-dops-toggle-ah="1">
              <small>After-Hours (${esc(fmtShortDay(dm.yestDate))})</small>
              <b>${dm.ahAvailableCount > 0 ? `${dm.includeAh ? 'Incl.' : 'Off'} · ${dm.ahAvailableCount} (${fmtUSDk(dm.ahAvailableUsd)})` : '0 logged'}</b>
            </div>
          </div>
        </div>
      `;
    }

    // Default ('pulse' or 'customers'): Compact 7d Spark + Grades Mix Strip + Expandable Client Dispatch Accordion Table
    const belowCustSet = new Set((dm.belowTicketEvents || []).map(ev => norm(ev.ticket && ev.ticket.customer)));
    const allRows = dm.customerRows;
    const rows = allRows.filter(r => {
      if (qFilter === 'rep_shifted' && !(r.repShiftCount > 0)) return false;
      if (qFilter === 'overtime' && !(r.otLoads > 0)) return false;
      if (qFilter === 'exceptions' && !belowCustSet.has(r.key)) return false;
      if (qNorm) {
        const groupHit = matchesQuickSearch(qNorm, [r.name, r.company, (r.sites || []).join(' '), (r.products || []).join(' ')]);
        const tktHit = (r.tickets || []).some(t => matchesQuickSearch(qNorm, [t.ticket_no, t.truck, t.driver, t.site, t.product, t.notes]));
        if (!groupHit && !tktHit) return false;
      }
      return true;
    });
    const maxTtc = allRows.length ? Math.max(1, ...allRows.map(r => Math.abs(r.ttc))) : 1;
    const soldGrades = dm.productRows.filter(p => p.salesLoads > 0 || p.salesM3 > 0);

    return `
      <div class="dops-card-body no-pad dops-flex-col">
        <div class="dops-substrip dops-sales-top-strip">
          ${renderMiniSparkBars(ctx, dm)}
          <div class="dops-mix-pills">
            ${soldGrades.slice(0, 2).map(g => `<span class="dops-micro-pill" data-dops-lens="comm:grades"><b>${esc(g.name)}</b> ${fmtNum(g.salesM3, 0)}m³ · ${fmtUSD(g.salesTtc, 0)}</span>`).join('')}
            ${soldGrades.length > 2 ? `<span class="dops-micro-pill" data-dops-lens="comm:grades">+${soldGrades.length - 2} grade${soldGrades.length - 2 === 1 ? '' : 's'}</span>` : ''}
            <span class="dops-micro-pill" data-dops-open-drawer="sales">Deliv <b>${fmtNum(dm.salesSum.deliveryLoads)}</b> · Pick <b>${fmtNum(dm.salesSum.pickupLoads)}</b>${dm.salesSum.otLoads > 0 ? ` · <b>${dm.salesSum.otLoads}</b> OT` : ''}</span>
          </div>
        </div>
        ${rows.length ? `
          <div class="dops-tbl-scroll">
            <table class="dops-table dops-fixed-3">
              <colgroup><col style="width:43%"><col style="width:33%"><col style="width:24%"></colgroup>
              <thead>
                <tr>
                  <th>Client &amp; Site</th>
                  <th>Grade · Loads &amp; Vol</th>
                  <th class="r">Sales TTC</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(r => {
                  const pct = Math.min(100, Math.max(0, Math.round((Math.abs(r.ttc) / maxTtc) * 100)));
                  const siteTxt = r.sites && r.sites.length ? r.sites.slice(0, 2).join(', ') : '';
                  const prodTxt = r.products && r.products.length ? r.products.join(', ') : (r.collected > 0 ? 'AR Collection' : '-');
                  const isCash = r.cashTtc > 0 && r.creditTtc === 0;
                  const rateTxt = r.unitPrices && r.unitPrices.length ? `@${fmtUSD(r.unitPrices[0], 1)}` : '';
                  const expKey = `cust:${r.key}`;
                  const innerTktHit = Boolean(qNorm && !matchesQuickSearch(qNorm, [r.name]) && (r.tickets || []).some(t => matchesQuickSearch(qNorm, [t.ticket_no, t.truck, t.driver])));
                  const isExp = Boolean(expMap[expKey] || innerTktHit);
                  const totalEntries = (r.tickets ? r.tickets.length : 0) + (r.rcpts ? r.rcpts.length : 0);
                  const repBadge = renderGroupRepBadge(ctx, r.repShiftCount, totalEntries, r.repShiftDates, dm.targetDate);
                  const subTkts = isExp ? (r.tickets || []).filter(t => {
                    if (qFilter === 'rep_shifted' && !hasRepShift(t)) return false;
                    if (qFilter === 'overtime' && !t.overtime) return false;
                    if (innerTktHit && !matchesQuickSearch(qNorm, [t.ticket_no, t.truck, t.driver, t.site, t.product])) return false;
                    return true;
                  }) : [];
                  const subRcpts = isExp ? (r.rcpts || []).filter(rc => qFilter !== 'rep_shifted' || hasRepShift(rc)) : [];
                  return `
                    <tr class="dops-group-row${isExp ? ' is-expanded' : ''}" data-dops-expand="${esc(expKey)}" tabindex="0" data-ui-tip="Click to ${isExp ? 'collapse' : 'expand'} ${fmtNum(totalEntries)} individual ${totalEntries === 1 ? 'entry' : 'entries'} for ${esc(r.name)}">
                      <td class="dops-trunc">
                        <div class="dops-grp-head">
                          <span class="dops-exp-chev">${ic(isExp ? 'chevron_down' : 'chevron_right')}</span>
                          ${relLink('customers', r.name, r.name, true)}
                          ${repBadge}
                          ${r.ahLoads > 0 ? `<span class="dops-ah-badge">${ic('moon')}+${r.ahLoads}</span>` : ''}
                          ${r.otLoads > 0 ? `<span class="dops-ot-badge" data-ui-tip="${r.otLoads} overtime dispatch">${ic('overtime')}${r.otLoads}</span>` : ''}
                        </div>
                        ${siteTxt ? `<small class="dops-cell-sub dops-sub-pad">${esc(siteTxt)}</small>` : ''}
                      </td>
                      <td class="dops-trunc">
                        <span class="dops-kind ${isCash ? 'cash' : (r.loads > 0 ? 'sales' : 'pay')}">${isCash ? 'Cash' : (r.loads > 0 ? 'Cr' : 'AR')}</span>
                        <span class="dops-cell-inline">${esc(prodTxt)}${rateTxt ? ` <small>${esc(rateTxt)}</small>` : ''}</span>
                        ${r.loads ? `<small class="dops-cell-sub"><b>${fmtNum(r.loads)}</b> ${r.loads === 1 ? 'load' : 'loads'} · <b>${fmtNum(r.m3, 0)} m³</b></small>` : ''}
                      </td>
                      <td class="r">
                        ${r.ttc > 0 ? `
                          <div class="dops-bar-inline" style="justify-content:flex-end">
                            <div class="dops-bar-track"><div class="dops-bar-fill" style="width:${pct}%"></div></div>
                            <strong>${fmtUSD(r.ttc, 0)}</strong>
                          </div>
                        ` : ''}
                        ${r.collected > 0 ? `<small class="dops-ar-tag">AR +${fmtUSD(r.collected, 0)}</small>` : ''}
                      </td>
                    </tr>
                    ${subTkts.map(t => {
                      const sgn = ctx.ticketSign(t) || 1;
                      const m3 = ctx.round2(Number(ctx.ticketMeters(t) || 0) * sgn);
                      const rowTtc = ctx.round2(Number(t.total_ttc != null ? t.total_ttc : t.total || 0) * sgn);
                      return `
                        <tr class="rrow dops-subrow" data-rkey="sales_tickets" data-rid="${esc(String(t.id || ''))}">
                          <td class="dops-trunc">
                            <div class="dops-sub-cell">
                              <span class="dops-sub-indent"></span>
                              <strong class="mono">#${esc(String(t.ticket_no || t.id))}</strong>
                              ${t.time ? `<small class="dops-time-tag">${esc(String(t.time).slice(0, 5))}</small>` : ''}
                              <button type="button" class="tkt-print-mini dops-print-mini" data-print-ticket="sales" data-print-id="${esc(String(t.id || ''))}" data-ui-tip="Print Sales Slip #${esc(String(t.ticket_no || ''))}">${ic('printer')}</button>
                              ${renderRepBadge(ctx, txDateOf(t), repDateOf(t))}
                              ${t.overtime ? `<span class="dops-ot-badge" data-ui-tip="Overtime dispatch">${ic('overtime')}</span>` : ''}
                            </div>
                          </td>
                          <td class="dops-trunc">${esc(t.product || '-')} · <b>${fmtNum(m3, m3 % 1 ? 1 : 0)}m³</b>${t.truck ? ` · ${esc(t.truck)}` : ''}${t.driver ? ` <small style="color:var(--muted)">(${esc(t.driver)})</small>` : ''}</td>
                          <td class="r"><strong>${fmtUSD(rowTtc, 0)}</strong> <small style="color:var(--muted)">${ctx.isCashSaleTicket(t) ? 'Cash' : 'Cr'}</small></td>
                        </tr>
                      `;
                    }).join('')}
                    ${subRcpts.map(rc => `
                      <tr class="rrow dops-subrow" data-rkey="receipts" data-rid="${esc(String(rc.id || ''))}">
                        <td class="dops-trunc"><div class="dops-sub-cell"><span class="dops-sub-indent"></span><span class="dops-kind cash">AR</span> <strong>${esc(rc.reference ? '#' + rc.reference : 'Receipt')}</strong> ${renderRepBadge(ctx, txDateOf(rc), repDateOf(rc))}</div></td>
                        <td class="dops-trunc">${esc(rc.method || 'Cash')} Collection</td>
                        <td class="r"><strong style="color:var(--good)">+${fmtUSD(Number(rc.amount || 0) + Number(rc.discount || 0), 0)}</strong></td>
                      </tr>
                    `).join('')}
                  `;
                }).join('')}
              </tbody>
              <tfoot>
                <tr>
                  <td>${fmtNum(rows.length)} ${rows.length === 1 ? 'Client' : 'Clients'} (${fmtNum(dm.salesSum.loads)} loads · ${fmtNum(dm.salesSum.m3, 0)} m³)</td>
                  <td>Cash ${fmtUSD(dm.salesSum.cashTtc, 0)} · Cr ${fmtUSD(dm.salesSum.creditTtc, 0)}</td>
                  <td class="r">${fmtUSD(dm.salesSum.ttc, 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ` : `<div class="dops-empty">${qFilter !== 'all' || qNorm ? `No client sales match the active spotlight filter on ${esc(fmtShortDay(dm.targetDate))}.` : `No customer sales or AR collections recorded on ${esc(fmtShortDay(dm.targetDate))}.`}</div>`}
      </div>
    `;
  }

  function renderPanel2QuarryPricing(ctx, dm, lens, isSingleCo) {
    const { esc, ic, fmtUSD, fmtNum, coBadge, relLink } = ctx;
    const qFilter = String(ctx.STATE.dailyOpsQuickFilter || 'all');
    const qNorm = String(ctx.STATE.dailyOpsQuickSearch || '').trim().toLowerCase();
    const expMap = ctx.STATE.dailyOpsExpanded || {};
    const totalDispatched = Math.max(0, dm.salesSum.loads);
    const agreedPct = totalDispatched > 0 ? Math.round((dm.agreedSalesLoads / totalDispatched) * 100) : 100;
    const totDiscAll = ctx.round2(dm.salesSum.discUsd + dm.rawSum.discUsd + dm.arDiscUsd + dm.apDiscUsd);

    const topStripHtml = `
      <div class="dops-stat-strip-3 dops-substrip">
        <div class="dops-stat-box" data-dops-open-drawer="raw">
          <small>Quarry Material (${fmtNum(dm.rawSum.loads)} loads)</small>
          <b>${fmtUSD(dm.rawSum.matCost, 0)} <span class="dops-stat-muted">· ${fmtNum(dm.rawSum.m3, 0)} m³ (${fmtNum(dm.rawSum.tons, 0)} t)</span></b>
        </div>
        <div class="dops-stat-box" data-dops-open-drawer="raw">
          <small>Haulage Split (Own vs 3P)</small>
          <b>${fmtUSD(dm.rawSum.haulCost, 0)} <span class="dops-stat-muted">· Own ${fmtNum(dm.rawSum.ownLoads)} / 3P ${fmtNum(dm.rawSum.haulerLoads)}</span></b>
        </div>
        <div class="dops-stat-box${dm.belowAgreedLoads > 0 ? ' tone-crit' : (dm.agreedSalesLoads > 0 ? ' tone-good' : '')}" data-dops-lens="deals:audit">
          <small>Rate Compliance &amp; VAT</small>
          <b>${dm.belowAgreedLoads > 0 ? `${dm.belowAgreedLoads} Below (-${fmtUSD(dm.belowShortfallUsd, 0)})` : `${agreedPct}% Agreed (${dm.agreedSalesLoads}/${totalDispatched})`} <span class="dops-stat-muted">· VAT ${fmtUSD(dm.salesSum.vat, 0)}</span></b>
        </div>
      </div>
    `;

    if (lens === 'rules') {
      const todayRules = dm.dayPriceRules;
      const showRules = (todayRules.length ? todayRules : dm.recentWeekRules).filter(pr => {
        const info = describePriceRule(ctx, pr);
        return matchesQuickSearch(qNorm, [info.party, info.sub, info.rateTxt, pr.product, pr.site]);
      });
      return `
        <div class="dops-card-body no-pad dops-flex-col">
          ${topStripHtml}
          <div class="dops-tbl-scroll">
            <table class="dops-table dops-fixed-3">
              <colgroup><col style="width:42%"><col style="width:32%"><col style="width:26%"></colgroup>
              <thead>
                <tr>
                  <th>${todayRules.length ? 'New Rule Today' : 'Recent 7-Day Rule'}</th>
                  <th>Grade / Site</th>
                  <th class="r">Agreed Rate</th>
                </tr>
              </thead>
              <tbody>
                ${showRules.map(pr => {
                  const info = describePriceRule(ctx, pr);
                  const dLbl = String(pr.start_date || pr.date || '').slice(5, 10);
                  return `
                    <tr class="rrow" data-rkey="price_rules" data-rid="${esc(String(pr.id || ''))}">
                      <td class="dops-trunc"><span class="dops-kind rule">${esc(info.badge)}</span> <strong>${esc(info.party)}</strong>${!todayRules.length && dLbl ? ` <small style="color:var(--muted)">${esc(dLbl)}</small>` : ''}</td>
                      <td class="dops-trunc">${esc(pr.product || pr.site || '-')}</td>
                      <td class="r"><strong>${esc(info.rateTxt)}</strong></td>
                    </tr>
                  `;
                }).join('') || `<tr><td colspan="3" class="dops-empty">No price agreements created on this date or trailing 7 days.</td></tr>`}
                ${dm.dayCreditTerms.map(ct => `
                  <tr class="rrow" data-rkey="credit_terms" data-rid="${esc(String(ct.id || ''))}">
                    <td class="dops-trunc"><span class="dops-kind rule">Credit</span> <strong>${esc(ct.customer || '-')}</strong></td>
                    <td>Net Terms</td>
                    <td class="r"><strong>${fmtNum(ct.credit_days || 0)} Days</strong></td>
                  </tr>
                `).join('')}
                ${dm.dayOtRates.map(ot => `
                  <tr class="rrow" data-rkey="overtime_rates" data-rid="${esc(String(ot.id || ''))}">
                    <td class="dops-trunc"><span class="dops-kind rule">OT Rate</span> <strong>${esc(ot.region || 'Zone')}</strong></td>
                    <td>Driver Trip</td>
                    <td class="r"><strong>${fmtUSD(Number(ot.amount || 0), 2)}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2">${todayRules.length ? `${fmtNum(dm.newPoliciesCount)} New Policies on ${esc(fmtShortDay(dm.targetDate))}` : `0 New on ${esc(fmtShortDay(dm.targetDate))} (Trailing 7d)`}</td>
                  <td class="r">${fmtNum(dm.activeRulesUsed.length)} Rules Active</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      `;
    }

    if (lens === 'audit') {
      const rows = dm.rateAuditRows.filter(r => matchesQuickSearch(qNorm, [r.customer, r.product, r.status]));
      if (!rows.length) {
        return `<div class="dops-card-body no-pad dops-flex-col">${topStripHtml}<div class="dops-empty">No customer sales dispatches to audit on ${esc(fmtShortDay(dm.targetDate))}.</div></div>`;
      }
      return `
        <div class="dops-card-body no-pad dops-flex-col">
          ${topStripHtml}
          <div class="dops-tbl-scroll">
            <table class="dops-table dops-fixed-3">
              <colgroup><col style="width:44%"><col style="width:32%"><col style="width:24%"></colgroup>
              <thead>
                <tr>
                  <th>Customer &amp; Grade</th>
                  <th class="r">Agreed vs Billed</th>
                  <th class="r">Status</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(r => {
                  const stCls = r.status === 'Below Rate' ? 'crit' : (r.status === 'Lapsed' ? 'maint' : (r.status === 'Agreed' ? 'cash' : 'pay'));
                  return `
                    <tr class="rrow" data-rkey="${r.ruleId && r.status === 'Agreed' ? 'price_rules' : 'sales_tickets'}" data-rid="${esc(String((r.ruleId && r.status === 'Agreed' ? r.ruleId : r.sampleTicketId) || ''))}">
                      <td class="dops-trunc"><strong>${esc(r.customer)}</strong> <small class="dops-cell-sub">${esc(r.product)} (${r.loads} loads)</small></td>
                      <td class="r">${r.agreedRate != null ? fmtUSD(r.agreedRate, 1) : 'Spot'} / <strong>${fmtUSD(r.billedAvg, 1)}</strong></td>
                      <td class="r"><span class="dops-kind ${stCls}">${r.status === 'Below Rate' ? `-${fmtUSD(r.shortfall, 0)}` : esc(r.status)}</span></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2">Agreed ${fmtNum(dm.agreedSalesLoads)} · Spot ${fmtNum(dm.spotSalesLoads)}</td>
                  <td class="r">${dm.belowAgreedLoads > 0 ? `Short: -${fmtUSD(dm.belowShortfallUsd, 0)}` : '100% On Rate'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      `;
    }

    if (lens === 'vat_jv') {
      return `
        <div class="dops-card-body">
          <div class="dops-stat-strip-4">
            <div class="dops-stat-box">
              <small>Ticket 11% VAT</small>
              <b>${fmtUSD(dm.salesSum.vat, 0)}</b>
            </div>
            <div class="dops-stat-box${dm.dayVatInvoices.length ? ' tone-brass' : ''}">
              <small>VAT Invoices (${fmtNum(dm.dayVatInvoices.length)})</small>
              <b>${fmtUSD(dm.vatBilledTodayTtc, 0)}</b>
            </div>
            <div class="dops-stat-box">
              <small>Commissions</small>
              <b>${fmtUSD(dm.salesSum.commUsd, 0)}</b>
            </div>
            <div class="dops-stat-box">
              <small>Discounts / JV</small>
              <b>${fmtUSD(totDiscAll, 0)} / ${fmtUSD(dm.jvDistTodayUsd, 0)}</b>
            </div>
          </div>
          <div class="dops-event-list">
            ${dm.dayVatInvoices.map(vi => `
              <div class="dops-event-item is-new-rule" data-dops-inspect-rkey="vat_invoices" data-dops-inspect-rid="${esc(String(vi.id || ''))}">
                <div class="dops-event-left">
                  <span class="dops-kind rule">VAT #${esc(String(vi.invoice_no || ''))}</span>
                  <div class="dops-event-txt"><strong>${esc(vi.customer || '-')}</strong> <span>· ${fmtNum(vi.tickets_count || 0)} tickets · Tax ${fmtUSD(vi.vat_amount || 0, 0)}</span></div>
                </div>
                <span class="dops-event-right">${fmtUSD(vi.total_ttc || 0, 0)}</span>
              </div>
            `).join('')}
            ${dm.dayJvDists.map(jv => `
              <div class="dops-event-item" data-dops-inspect-rkey="jv_distributions" data-dops-inspect-rid="${esc(String(jv.id || ''))}">
                <div class="dops-event-left">
                  <span class="dops-kind raw">JV Dist</span>
                  <div class="dops-event-txt"><strong>${esc(jv.partner || '-')}</strong> <span>· ${esc(jv.site || '')}</span></div>
                </div>
                <span class="dops-event-right">${fmtUSD(jv.amount || jv.total || 0, 0)}</span>
              </div>
            `).join('')}
            <div class="dops-event-item" data-dops-open-drawer="sales">
              <div class="dops-event-left">
                <span class="dops-kind sales">Commercial</span>
                <div class="dops-event-txt"><strong>Transport Rev ${fmtUSD(dm.salesSum.transRev, 0)}</strong> <span>· Comm ${fmtUSD(dm.salesSum.commUsd, 0)} · Disc ${fmtUSD(totDiscAll, 0)}</span></div>
              </div>
              <span class="dops-event-right">${fmtUSD(dm.salesSum.ttc, 0)} TTC</span>
            </div>
          </div>
        </div>
      `;
    }

    // Default ('highlights'): 3-Stat Quarry/Haulage/Compliance Strip + Expandable Quarry Sites & Active Agreements
    const qRows = (dm.quarryGroupRows || []).filter(q => {
      if (qFilter === 'rep_shifted' && !(q.repShiftCount > 0)) return false;
      if (qFilter === 'overtime' && !(q.otLoads > 0)) return false;
      if (qFilter === 'exceptions') return false;
      if (qNorm) {
        const gHit = matchesQuickSearch(qNorm, [q.site, q.supplier, q.product, q.haulersTxt, q.company]);
        const tHit = (q.tickets || []).some(t => matchesQuickSearch(qNorm, [t.ticket_no, t.truck, t.driver, t.truck_owner]));
        if (!gHit && !tHit) return false;
      }
      return true;
    });
    const showBelow = qFilter === 'all' || qFilter === 'exceptions' || (qFilter === 'rep_shifted' ? dm.belowTicketEvents.filter(ev => hasRepShift(ev.ticket)) : []);
    const effBelow = Array.isArray(showBelow) ? showBelow : (showBelow ? dm.belowTicketEvents : []);
    const showRulesUsed = (qFilter === 'all' ? dm.activeRulesUsed.slice(0, 5) : []).filter(ru => {
      if (!qNorm) return true;
      const info = describePriceRule(ctx, ru.rule);
      return matchesQuickSearch(qNorm, [info.party, info.sub, info.primaryRate]);
    });

    return `
      <div class="dops-card-body no-pad dops-flex-col">
        ${topStripHtml}
        <div class="dops-tbl-scroll">
          <table class="dops-table dops-fixed-3">
            <colgroup><col style="width:43%"><col style="width:33%"><col style="width:24%"></colgroup>
            <thead>
              <tr>
                <th>Quarry Site / Agreement</th>
                <th>Grade · Loads &amp; Haul</th>
                <th class="r">Cost / Rate</th>
              </tr>
            </thead>
            <tbody>
              ${effBelow.filter(ev => matchesQuickSearch(qNorm, [ev.ticket && ev.ticket.customer, ev.ticket && ev.ticket.product])).map(ev => `
                <tr class="rrow" data-rkey="sales_tickets" data-rid="${esc(String(ev.ticket.id || ''))}">
                  <td class="dops-trunc"><span class="dops-kind crit">Below Rate</span> <strong>${esc(ev.ticket.customer || '-')}</strong> ${renderRepBadge(ctx, txDateOf(ev.ticket), repDateOf(ev.ticket))}</td>
                  <td class="dops-trunc">${esc(ev.ticket.product || '')} · ${fmtUSD(ev.soldPrice, 1)} vs ${fmtUSD(ev.agreedPrice, 1)}</td>
                  <td class="r"><strong style="color:var(--crit)">-${fmtUSD(ev.shortfall, 0)}</strong></td>
                </tr>
              `).join('')}
              ${(qFilter === 'all' ? dm.dayPriceRules : []).filter(pr => matchesQuickSearch(qNorm, [pr.customer, pr.supplier, pr.product, pr.site])).map(pr => {
                const info = describePriceRule(ctx, pr);
                return `
                  <tr class="rrow" data-rkey="price_rules" data-rid="${esc(String(pr.id || ''))}">
                    <td class="dops-trunc"><span class="dops-kind rule">New</span> <strong>${esc(info.party)}</strong></td>
                    <td class="dops-trunc">${esc(info.sub || pr.rule_type || 'Agreement')}</td>
                    <td class="r"><strong>${esc(info.primaryRate)}</strong>${info.haulRate ? `<small class="dops-cell-sub">${esc(info.haulRate)}</small>` : ''}</td>
                  </tr>
                `;
              }).join('')}
              ${qRows.map(q => {
                const expKey = `quarry:${q.key}`;
                const innerHit = Boolean(qNorm && !matchesQuickSearch(qNorm, [q.site, q.supplier, q.product]) && (q.tickets || []).some(t => matchesQuickSearch(qNorm, [t.ticket_no, t.truck, t.driver, t.truck_owner])));
                const isExp = Boolean(expMap[expKey] || innerHit);
                const repBadge = renderGroupRepBadge(ctx, q.repShiftCount, q.loads, q.repShiftDates, dm.targetDate);
                const subTkts = isExp ? (q.tickets || []).filter(t => {
                  if (qFilter === 'rep_shifted' && !hasRepShift(t)) return false;
                  if (qFilter === 'overtime' && !t.overtime) return false;
                  if (innerHit && !matchesQuickSearch(qNorm, [t.ticket_no, t.truck, t.driver, t.truck_owner])) return false;
                  return true;
                }) : [];
                return `
                  <tr class="dops-group-row${isExp ? ' is-expanded' : ''}" data-dops-expand="${esc(expKey)}" tabindex="0" data-ui-tip="Click to ${isExp ? 'collapse' : 'expand'} ${fmtNum(q.loads)} quarry ${q.loads === 1 ? 'ticket' : 'tickets'} from ${esc(q.site)}">
                    <td class="dops-trunc">
                      <div class="dops-grp-head">
                        <span class="dops-exp-chev">${ic(isExp ? 'chevron_down' : 'chevron_right')}</span>
                        <strong>${esc(q.site)}</strong>
                        ${repBadge}
                      </div>
                      <small class="dops-cell-sub dops-sub-pad">Quarry · ${relLink('suppliers', q.supplier, q.supplier, true)}</small>
                    </td>
                    <td class="dops-trunc">
                      <strong>${esc(q.product)}</strong> · ${fmtNum(q.loads)} loads (${fmtNum(q.m3, 0)}m³)
                      <small class="dops-cell-sub">Own ${fmtNum(q.ownLoads)} · 3P ${fmtNum(q.haulerLoads)}${q.haulersTxt ? ` (${esc(q.haulersTxt)})` : ''}</small>
                    </td>
                    <td class="r">
                      <strong>${fmtUSD(q.totalCost, 0)}</strong>
                      <small class="dops-cell-sub">M ${fmtUSD(q.matCost, 0)} · H ${fmtUSD(q.haulCost, 0)}</small>
                    </td>
                  </tr>
                  ${subTkts.map(t => {
                    const mat = Number(t.cost || 0);
                    const haul = Number(t.trans_cost || 0);
                    const tot = ctx.round2(Number(t.total != null ? t.total : (mat + haul)));
                    const m3 = Number(ctx.ticketMeters(t) || 0);
                    const haulerTag = t.transport_by === 'Company fleet' ? `Own ${t.truck || ''}` : `${t.truck || ''} (${t.truck_owner || t.driver || '3P'})`;
                    return `
                      <tr class="rrow dops-subrow" data-rkey="raw_purchases" data-rid="${esc(String(t.id || ''))}">
                        <td class="dops-trunc">
                          <div class="dops-sub-cell">
                            <span class="dops-sub-indent"></span>
                            <strong class="mono">#${esc(String(t.ticket_no || t.id))}</strong>
                            ${t.time ? `<small class="dops-time-tag">${esc(String(t.time).slice(0, 5))}</small>` : ''}
                            <button type="button" class="tkt-print-mini dops-print-mini" data-print-ticket="raw" data-print-id="${esc(String(t.id || ''))}" data-ui-tip="Print Quarry Slip #${esc(String(t.ticket_no || ''))}">${ic('printer')}</button>
                            ${renderRepBadge(ctx, txDateOf(t), repDateOf(t))}
                            ${t.overtime ? `<span class="dops-ot-badge" data-ui-tip="Overtime trip">${ic('overtime')}</span>` : ''}
                          </div>
                        </td>
                        <td class="dops-trunc"><b>${fmtNum(m3, m3 % 1 ? 1 : 0)}m³</b> · ${esc(haulerTag.trim())}</td>
                        <td class="r"><strong>${fmtUSD(tot, 0)}</strong> <small style="color:var(--muted)">M${fmtUSD(mat, 0)}/H${fmtUSD(haul, 0)}</small></td>
                      </tr>
                    `;
                  }).join('')}
                `;
              }).join('')}
              ${showRulesUsed.map(ru => {
                const info = describePriceRule(ctx, ru.rule);
                return `
                  <tr class="rrow" data-rkey="price_rules" data-rid="${esc(String(ru.rule.id || ''))}">
                    <td class="dops-trunc"><span class="dops-kind cash">Agreed</span> <strong>${esc(info.party)}</strong></td>
                    <td class="dops-trunc">${esc(info.sub || info.badge)} (${fmtNum(ru.loads)}L)</td>
                    <td class="r"><strong>${esc(info.primaryRate)}</strong>${info.haulRate ? `<small class="dops-cell-sub">${esc(info.haulRate)}</small>` : ''}</td>
                  </tr>
                `;
              }).join('')}
              ${!qRows.length && !showRulesUsed.length && !effBelow.length ? `<tr><td colspan="3" class="dops-empty">${qFilter !== 'all' || qNorm ? `No quarry entries match the active spotlight filter on ${esc(fmtShortDay(dm.targetDate))}.` : `No quarry purchases or rate agreements active on ${esc(fmtShortDay(dm.targetDate))}.`}</td></tr>` : ''}
            </tbody>
            <tfoot>
              <tr>
                <td>${fmtNum(qRows.length)} Quarry ${qRows.length === 1 ? 'Site' : 'Sites'} (${fmtNum(dm.rawSum.loads)} loads · ${fmtNum(dm.rawSum.m3, 0)} m³)</td>
                <td>${fmtNum(dm.activeRulesUsed.length)} Active Rules Used</td>
                <td class="r">${fmtUSD(dm.rawSum.totalCost, 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  function renderPanel3ExpensesPnl(ctx, dm, lens, isSingleCo) {
    const { esc, ic, fmtUSD, fmtNum, coBadge, relLink } = ctx;
    const qFilter = String(ctx.STATE.dailyOpsQuickFilter || 'all');
    const qNorm = String(ctx.STATE.dailyOpsQuickSearch || '').trim().toLowerCase();
    const expMap = ctx.STATE.dailyOpsExpanded || {};
    const profPctTxt = `${(dm.opMarginPct * 100).toFixed(1)}%`;
    const payAndComm = ctx.round2(dm.salariesPaid + dm.salesSum.commUsd);

    const pnlStripHtml = `
      <div class="dops-pnl-bridge dops-substrip" data-dops-open-drawer="expenses">
        <div class="dops-pnl-step">
          <small>Sales Ex-VAT</small>
          <b>${fmtUSD(dm.salesSum.grossExVat, 0)}</b>
        </div>
        <span class="dops-pnl-op">-</span>
        <div class="dops-pnl-step">
          <small>Quarry &amp; Haul</small>
          <b>${fmtUSD(dm.rawSum.totalCost, 0)}</b>
        </div>
        <span class="dops-pnl-op">-</span>
        <div class="dops-pnl-step">
          <small>Expenses (${fmtNum(dm.expCount)})</small>
          <b>${fmtUSD(dm.expExVat, 0)}</b>
        </div>
        ${payAndComm > 0 ? `
          <span class="dops-pnl-op">-</span>
          <div class="dops-pnl-step">
            <small>Pay &amp; Comm</small>
            <b>${fmtUSD(payAndComm, 0)}</b>
          </div>
        ` : ''}
        <span class="dops-pnl-op">=</span>
        <div class="dops-pnl-step is-profit ${dm.operatingProfit < 0 ? 'crit' : 'good'}">
          <small>Op. Profit (${esc(profPctTxt)})</small>
          <b>${fmtUSD(dm.operatingProfit, 0)}</b>
        </div>
      </div>
    `;

    if (lens === 'cats' || lens === 'categories') {
      const rows = (dm.expCategoryRows || []).filter(r => {
        if (qFilter === 'rep_shifted' && !(r.repShiftCount > 0)) return false;
        if (qFilter === 'exceptions' && !(r.pending > 0)) return false;
        if (qFilter === 'overtime') return false;
        if (qNorm) {
          const cHit = matchesQuickSearch(qNorm, [r.label, r.category, r.method]);
          const bHit = (r.bills || []).some(b => matchesQuickSearch(qNorm, [b.supplier, b.equipment, b.notes, b.invoice]));
          if (!cHit && !bHit) return false;
        }
        return true;
      });
      return `
        <div class="dops-card-body no-pad dops-flex-col">
          ${pnlStripHtml}
          <div class="dops-tbl-scroll">
            <table class="dops-table dops-fixed-3">
              <colgroup><col style="width:48%"><col style="width:28%"><col style="width:24%"></colgroup>
              <thead>
                <tr>
                  <th>Expense Category &amp; Subcategory</th>
                  <th>Terms · Bills</th>
                  <th class="r">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(r => {
                  const expKey = `expcat:${r.key}`;
                  const isExp = Boolean(expMap[expKey]);
                  const repBadge = renderGroupRepBadge(ctx, r.repShiftCount, r.count, r.repShiftDates, dm.targetDate);
                  const subBills = isExp ? (r.bills || []).filter(b => qFilter !== 'rep_shifted' || b.isRepShifted) : [];
                  return `
                    <tr class="dops-group-row${isExp ? ' is-expanded' : ''}" data-dops-expand="${esc(expKey)}" tabindex="0" data-ui-tip="Click to ${isExp ? 'collapse' : 'expand'} ${fmtNum(r.count)} expense ${r.count === 1 ? 'bill' : 'bills'}">
                      <td class="dops-trunc">
                        <div class="dops-grp-head">
                          <span class="dops-exp-chev">${ic(isExp ? 'chevron_down' : 'chevron_right')}</span>
                          <strong>${esc(r.label)}</strong>
                          ${repBadge}
                        </div>
                      </td>
                      <td><span class="dops-kind ${r.pending ? 'maint' : (r.method === 'Credit' ? 'pay' : 'exp')}">${r.pending ? 'Pending' : esc(r.method)}</span> · ${fmtNum(r.count)}</td>
                      <td class="r"><strong>${fmtUSD(r.amount, 0)}</strong></td>
                    </tr>
                    ${subBills.map(b => `
                      <tr class="rrow dops-subrow" data-rkey="expenses" data-rid="${esc(String(b.id || ''))}">
                        <td class="dops-trunc"><div class="dops-sub-cell"><span class="dops-sub-indent"></span><strong>${esc(b.supplier)}</strong>${b.equipment ? ` <small style="color:var(--muted)">· ${esc(b.equipment)}</small>` : ''} ${renderRepBadge(ctx, b.txDate, b.repDate)}</div></td>
                        <td class="dops-trunc">${esc(b.notes || b.method)}</td>
                        <td class="r"><strong>${b.isPending && b.amount === 0 ? 'Pending' : fmtUSD(b.amount, 0)}</strong></td>
                      </tr>
                    `).join('')}
                  `;
                }).join('') || `<tr><td colspan="3" class="dops-empty">No expense categories match on ${esc(fmtShortDay(dm.targetDate))}.</td></tr>`}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2">Cash ${fmtUSD(dm.cashExp, 0)} · Credit ${fmtUSD(dm.creditExp, 0)}</td>
                  <td class="r">${fmtUSD(dm.expTotal, 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      `;
    }

    if (lens === 'stock') {
      const items = dm.dayExpItems.filter(it => matchesQuickSearch(qNorm, [it.item_name, it.subcategory, it.category, it.target_equipment, it.warehouse_location]));
      const wh = dm.dayWhMoves.filter(wm => matchesQuickSearch(qNorm, [wm.item_name, wm.warehouse_location, wm.target_equipment]));
      return `
        <div class="dops-card-body no-pad dops-flex-col">
          ${pnlStripHtml}
          <div class="dops-tbl-scroll">
            <table class="dops-table dops-fixed-3">
              <colgroup><col style="width:44%"><col style="width:32%"><col style="width:24%"></colgroup>
              <thead>
                <tr>
                  <th>Part / Expense Line Item</th>
                  <th>Target Asset · Qty</th>
                  <th class="r">Line Total</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(it => `
                  <tr class="rrow" data-rkey="expenses" data-rid="${esc(String(it.expense_id || ''))}">
                    <td class="dops-trunc"><strong>${esc(it.item_name || it.subcategory || 'Item')}</strong> <small class="dops-cell-sub">${esc(it.category || '')}</small></td>
                    <td class="dops-trunc">${esc(it.target_equipment || it.warehouse_location || 'Plant')} · ×${fmtNum(it.qty || 1, 0)}</td>
                    <td class="r"><strong>${fmtUSD(it.line_total || 0, 0)}</strong></td>
                  </tr>
                `).join('')}
                ${wh.map(wm => `
                  <tr class="rrow" data-rkey="warehouse_movements" data-rid="${esc(String(wm.id || ''))}">
                    <td class="dops-trunc"><span class="dops-kind fuel">Stock</span> <strong>${esc(wm.item_name || 'Warehouse Item')}</strong></td>
                    <td class="dops-trunc">${esc([wm.warehouse_location, wm.target_equipment].filter(Boolean).join(' · '))}</td>
                    <td class="r">${fmtNum(wm.qty_delta || wm.qty || 0, 0)} ${esc(wm.uom || '')}</td>
                  </tr>
                `).join('')}
                ${!items.length && !wh.length ? `<tr><td colspan="3" class="dops-empty">No part items or warehouse stock movements on ${esc(fmtShortDay(dm.targetDate))}.</td></tr>` : ''}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2">${fmtNum(items.length)} Line Items · ${fmtNum(wh.length)} Stock Moves</td>
                  <td class="r">${fmtUSD(dm.expTotal, 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      `;
    }

    // Default ('bills'): Visual Day P&L Bridge + Itemized Expense Bills & Parts Table
    const bills = (dm.expenseBillRows || []).filter(b => {
      if (qFilter === 'rep_shifted' && !b.isRepShifted) return false;
      if (qFilter === 'exceptions' && !b.isPending) return false;
      if (qFilter === 'overtime') return false;
      if (qNorm && !matchesQuickSearch(qNorm, [b.supplier, b.category, b.subcategory, b.equipment, b.notes, b.invoice, (b.itemNames || []).join(' ')])) return false;
      return true;
    });
    const whBills = (qFilter === 'all' ? dm.dayWhMoves : []).filter(wm => matchesQuickSearch(qNorm, [wm.item_name, wm.warehouse_location, wm.target_equipment]));
    return `
      <div class="dops-card-body no-pad dops-flex-col">
        ${pnlStripHtml}
        <div class="dops-tbl-scroll">
          <table class="dops-table dops-fixed-3">
            <colgroup><col style="width:41%"><col style="width:37%"><col style="width:22%"></colgroup>
            <thead>
              <tr>
                <th>Supplier &amp; Asset</th>
                <th>Category, Terms &amp; Note</th>
                <th class="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${bills.map(b => {
                const badgeCls = b.isPending ? 'maint' : (b.isCredit ? 'rule' : 'exp');
                const noteOrItem = b.notes || (b.itemNames && b.itemNames.length ? b.itemNames.join(', ') : '');
                return `
                  <tr class="rrow" data-rkey="expenses" data-rid="${esc(String(b.id || ''))}">
                    <td class="dops-trunc">
                      <div class="dops-grp-head">${!isSingleCo ? `${coBadge(b.company)} ` : ''}${relLink('suppliers', b.supplier, b.supplier, true)}${renderRepBadge(ctx, b.txDate, b.repDate)}</div>
                      ${b.equipment ? `<small class="dops-cell-sub">Unit: <b>${esc(b.equipment)}</b></small>` : ''}
                    </td>
                    <td class="dops-trunc">
                      <span class="dops-kind ${badgeCls}">${esc(b.method)}</span> <strong>${esc(b.subcategory || b.category)}</strong>
                      ${noteOrItem ? `<small class="dops-cell-sub">${esc(noteOrItem)}</small>` : ''}
                    </td>
                    <td class="r"><strong>${b.isPending && b.amount === 0 ? 'Pending' : fmtUSD(b.amount, 0)}</strong></td>
                  </tr>
                `;
              }).join('')}
              ${whBills.map(wm => `
                <tr class="rrow" data-rkey="warehouse_movements" data-rid="${esc(String(wm.id || ''))}">
                  <td class="dops-trunc"><strong>${esc(wm.item_name || 'Stock Move')}</strong></td>
                  <td class="dops-trunc"><span class="dops-kind fuel">Stock</span> ${esc([wm.warehouse_location, wm.target_equipment].filter(Boolean).join(' · '))}</td>
                  <td class="r">${fmtNum(wm.qty_delta || wm.qty || 0, 0)} ${esc(wm.uom || '')}</td>
                </tr>
              `).join('')}
              ${!bills.length && !whBills.length ? `<tr><td colspan="3" class="dops-empty">${qFilter !== 'all' || qNorm ? `No expense bills match the active spotlight filter on ${esc(fmtShortDay(dm.targetDate))}.` : `No operational expenses or stock bills recorded on ${esc(fmtShortDay(dm.targetDate))}.`}</td></tr>` : ''}
            </tbody>
            <tfoot>
              <tr>
                <td>${fmtNum(dm.expCount)} ${dm.expCount === 1 ? 'Bill' : 'Bills'} · ${fmtNum(dm.dayExpItems.length)} ${dm.dayExpItems.length === 1 ? 'Item' : 'Items'}</td>
                <td>Cash ${fmtUSD(dm.cashExp, 0)} · Cr ${fmtUSD(dm.creditExp, 0)}</td>
                <td class="r">${fmtUSD(dm.expTotal, 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  function renderPanel4Treasury(ctx, dm, lens, isSingleCo) {
    const { esc, fmtUSD, fmtNum, coBadge } = ctx;
    const qFilter = String(ctx.STATE.dailyOpsQuickFilter || 'all');
    const qNorm = String(ctx.STATE.dailyOpsQuickSearch || '').trim().toLowerCase();
    const totFlow = Math.max(1, dm.cashInflow + dm.cashOutflow);
    const inPct = (dm.cashInflow + dm.cashOutflow) > 0 ? Math.round((dm.cashInflow / totFlow) * 100) : 0;
    const outPct = (dm.cashInflow + dm.cashOutflow) > 0 ? (100 - inPct) : 0;

    const cashTopBarHtml = `
      <div class="dops-cash-bar-box dops-substrip">
        <div class="dops-cash-bar-top">
          <span><strong style="color:var(--good)">In +${fmtUSD(dm.cashInflow, 0)}</strong> · <strong>Out -${fmtUSD(dm.cashOutflow, 0)}</strong> · <strong style="color:${dm.netCashFlow < 0 ? 'var(--warn)' : 'var(--good)'}">Net ${dm.netCashFlow > 0 ? '+' : ''}${fmtUSD(dm.netCashFlow, 0)}</strong></span>
          <span>Till: <strong>${fmtUSD(dm.liveTillUsd, 0)}</strong>${dm.liveTillLbp ? ` + <strong>${fmtCompactLbp(dm.liveTillLbp)}</strong>` : ''}</span>
        </div>
        <div class="dops-dual-track" role="img" aria-label="Day cash inflow versus outflow">
          <div class="dops-dual-seg inflow" style="width:${inPct}%"></div>
          <div class="dops-dual-seg outflow" style="width:${outPct}%"></div>
        </div>
      </div>
    `;

    if (lens === 'external') {
      const extRows = dm.extItems.filter(ex => {
        if (qFilter === 'rep_shifted' && !ex.isRepShifted) return false;
        if (qFilter === 'overtime' || qFilter === 'exceptions') return false;
        return matchesQuickSearch(qNorm, [ex.counterparty, ex.notes, ex.kind, ex.company]);
      });
      if (!extRows.length) {
        return `<div class="dops-card-body no-pad dops-flex-col">${cashTopBarHtml}<div class="dops-empty">No matching external treasury movements on ${esc(fmtShortDay(dm.targetDate))}.</div></div>`;
      }
      return `
        <div class="dops-card-body no-pad dops-flex-col">
          ${cashTopBarHtml}
          <div class="dops-tbl-scroll">
            <table class="dops-table dops-fixed-3">
              <colgroup><col style="width:44%"><col style="width:34%"><col style="width:22%"></colgroup>
              <thead>
                <tr>
                  <th>Dir &amp; Counterparty</th>
                  <th>Notes / Purpose</th>
                  <th class="r">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${extRows.map(ex => `
                  <tr class="rrow" data-rkey="external_movements" data-rid="${esc(String(ex.id || ''))}">
                    <td class="dops-trunc"><span class="dops-kind ${ex.isOut ? 'exp' : 'cash'}">${ex.isOut ? 'Out' : 'In'}</span> ${!isSingleCo ? `${coBadge(ex.company)} ` : ''}<strong>${esc(ex.counterparty)}</strong> ${renderRepBadge(ctx, ex.txDate, ex.repDate)}</td>
                    <td class="dops-trunc" style="color:var(--muted)">${esc(ex.notes || ex.kind)}</td>
                    <td class="r"><strong style="color:${ex.isOut ? 'var(--ink)' : 'var(--good)'}">${ex.isOut ? '-' : '+'}${ex.lbp && !ex.usd ? fmtCompactLbp(ex.lbp) : fmtUSD(ex.eqAmt, 0)}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2">In +${fmtUSD(dm.extInEq, 0)} (${dm.extInCount}) · Out -${fmtUSD(dm.extOutEq, 0)} (${dm.extOutCount})</td>
                  <td class="r">Net: ${dm.extInEq - dm.extOutEq >= 0 ? '+' : ''}${fmtUSD(dm.extInEq - dm.extOutEq, 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      `;
    }

    if (lens === 'fx_loans') {
      const convRows = (qFilter === 'rep_shifted' || qFilter === 'overtime' || qFilter === 'exceptions')
        ? []
        : dm.convItems.filter(cv => matchesQuickSearch(qNorm, [cv.dirLabel, cv.notes, cv.company]));
      const lnRows = (qFilter === 'rep_shifted' || qFilter === 'overtime' || qFilter === 'exceptions')
        ? []
        : dm.loanEvents.filter(ln => matchesQuickSearch(qNorm, [ln.party, ln.badge, ln.notes, ln.company]));
      if (!convRows.length && !lnRows.length && (!dm.dayFxRates.length || qFilter !== 'all')) {
        return `<div class="dops-card-body no-pad dops-flex-col">${cashTopBarHtml}<div class="dops-empty">No matching FX currency conversions or loan movements on ${esc(fmtShortDay(dm.targetDate))} · Active FX ${fmtNum(dm.fxRate, 0)} LBP/$.</div></div>`;
      }
      return `
        <div class="dops-card-body no-pad dops-flex-col">
          ${cashTopBarHtml}
          <div class="dops-tbl-scroll">
            <table class="dops-table dops-fixed-3">
              <colgroup><col style="width:44%"><col style="width:32%"><col style="width:24%"></colgroup>
              <thead>
                <tr>
                  <th>Type &amp; Counterparty</th>
                  <th>Rate / Currency</th>
                  <th class="r">USD Eq.</th>
                </tr>
              </thead>
              <tbody>
                ${convRows.map(cv => `
                  <tr class="rrow" data-rkey="conversions" data-rid="${esc(String(cv.id || ''))}">
                    <td class="dops-trunc"><span class="dops-kind fx">FX</span> <strong>${esc(cv.dirLabel)}</strong>${cv.notes ? ` <small class="dops-cell-sub">${esc(cv.notes)}</small>` : ''}</td>
                    <td>${fmtCompactLbp(cv.lbpMag)} @ <strong>${fmtNum(cv.rate, 0)}</strong></td>
                    <td class="r"><strong>${fmtUSD(cv.usdMag, 0)}</strong></td>
                  </tr>
                `).join('')}
                ${lnRows.map(ln => `
                  <tr class="rrow" data-rkey="${esc(ln.rkey)}" data-rid="${esc(String(ln.id || ''))}">
                    <td class="dops-trunc"><span class="dops-kind loan">${esc(ln.badge)}</span> <strong>${esc(ln.party)}</strong>${ln.notes ? ` <small class="dops-cell-sub">${esc(ln.notes)}</small>` : ''}</td>
                    <td>${ln.lbp ? fmtCompactLbp(ln.lbp) : 'USD Principal'}</td>
                    <td class="r"><strong style="color:${ln.isInflow ? 'var(--good)' : 'var(--ink)'}">${ln.isInflow ? '+' : '-'}${fmtUSD(ln.eqAmt, 0)}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2">FX Converted: ${fmtUSD(dm.totConvUsd, 0)} (${dm.convItems.length})</td>
                  <td class="r">Loans: ${dm.loanInEq - dm.loanOutEq >= 0 ? '+' : ''}${fmtUSD(dm.loanInEq - dm.loanOutEq, 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      `;
    }

    if (lens === 'ar_ap') {
      const rcptRows = dm.dayRcpts.filter(r => {
        if (ctx.receiptKind(r) === 'Excluded') return false;
        if (qFilter === 'rep_shifted' && !hasRepShift(r)) return false;
        if (qFilter === 'overtime' || qFilter === 'exceptions') return false;
        return matchesQuickSearch(qNorm, [r.customer, r.method, r.reference, r.notes, r.company]);
      });
      const setRows = dm.daySets.filter(s => {
        if (ctx.settlementKind(s) === 'Excluded') return false;
        if (qFilter === 'rep_shifted' && !hasRepShift(s)) return false;
        if (qFilter === 'overtime' || qFilter === 'exceptions') return false;
        return matchesQuickSearch(qNorm, [s.supplier, s.method, s.reference, s.notes, s.company]);
      });
      if (!rcptRows.length && !setRows.length) {
        return `<div class="dops-card-body no-pad dops-flex-col">${cashTopBarHtml}<div class="dops-empty">No matching customer AR receipts or supplier AP settlements on ${esc(fmtShortDay(dm.targetDate))}.</div></div>`;
      }
      return `
        <div class="dops-card-body no-pad dops-flex-col">
          ${cashTopBarHtml}
          <div class="dops-tbl-scroll">
            <table class="dops-table dops-fixed-3">
              <colgroup><col style="width:46%"><col style="width:30%"><col style="width:24%"></colgroup>
              <thead>
                <tr>
                  <th>Flow &amp; Counterparty</th>
                  <th>Method &amp; Ref</th>
                  <th class="r">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${rcptRows.map(r => `
                  <tr class="rrow" data-rkey="receipts" data-rid="${esc(String(r.id || ''))}">
                    <td class="dops-trunc"><span class="dops-kind cash">AR In</span> <strong>${esc(r.customer || '-')}</strong> ${renderRepBadge(ctx, txDateOf(r), repDateOf(r))}</td>
                    <td>${esc(r.method || 'Cash')}${r.reference ? ` · #${esc(r.reference)}` : ''}</td>
                    <td class="r"><strong style="color:var(--good)">+${fmtUSD(Number(r.amount || 0) + Number(r.discount || 0), 0)}</strong></td>
                  </tr>
                `).join('')}
                ${setRows.map(s => `
                  <tr class="rrow" data-rkey="settlements" data-rid="${esc(String(s.id || ''))}">
                    <td class="dops-trunc"><span class="dops-kind pay">AP Out</span> <strong>${esc(s.supplier || '-')}</strong> ${renderRepBadge(ctx, txDateOf(s), repDateOf(s))}</td>
                    <td>${esc(s.method || 'Cash')}${s.reference ? ` · #${esc(s.reference)}` : ''}</td>
                    <td class="r"><strong>-${fmtUSD(Number(s.amount || 0) + Number(s.discount || 0), 0)}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2">AR In +${fmtUSD(dm.arCollected, 0)} (${dm.arRcptCount})</td>
                  <td class="r">AP Out -${fmtUSD(dm.apPaid, 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      `;
    }

    // Default ('bridge'): Cash Inflow/Outflow Balance Bar + Complete Named Cash, External, AR/AP & Loans Table
    const moves = (dm.cashMoveRows || []).filter(m => {
      if (qFilter === 'rep_shifted' && !m.isRepShifted) return false;
      if (qFilter === 'overtime' || qFilter === 'exceptions') return false;
      return matchesQuickSearch(qNorm, [m.party, m.badgeTxt, m.detail, m.company]);
    });
    return `
      <div class="dops-card-body no-pad dops-flex-col">
        ${cashTopBarHtml}
        <div class="dops-tbl-scroll">
          <table class="dops-table dops-fixed-3">
            <colgroup><col style="width:44%"><col style="width:34%"><col style="width:22%"></colgroup>
            <thead>
              <tr>
                <th>Flow &amp; Counterparty</th>
                <th>Reference / Purpose</th>
                <th class="r">Cash Impact</th>
              </tr>
            </thead>
            <tbody>
              ${moves.map(m => `
                <tr class="rrow" data-rkey="${esc(m.rkey)}" data-rid="${esc(String(m.rid || ''))}">
                  <td class="dops-trunc"><div class="dops-grp-head"><span class="dops-kind ${m.badgeCls}">${esc(m.badgeTxt)}</span>${!isSingleCo ? `${coBadge(m.company)}` : ''}<strong>${esc(m.party)}</strong>${renderRepBadge(ctx, m.txDate, m.repDate)}</div></td>
                  <td class="dops-trunc"><span style="color:var(--muted)">${esc(m.detail || '-')}</span></td>
                  <td class="r"><strong style="color:${m.isFx ? 'var(--chart-navy)' : (m.isInflow ? 'var(--good)' : 'var(--ink)')}">${m.isFx ? fmtUSD(m.amount, 0) : `${m.amount >= 0 ? '+' : '-'}${fmtUSD(Math.abs(m.amount), 0)}`}</strong></td>
                </tr>
              `).join('') || `<tr><td colspan="3" class="dops-empty">No matching cash, AR/AP, external, or loan movements on ${esc(fmtShortDay(dm.targetDate))}.</td></tr>`}
            </tbody>
            <tfoot>
              <tr>
                <td>AR +${fmtUSD(dm.arCollected, 0)} · Cash Sales +${fmtUSD(dm.salesSum.cashNet, 0)}</td>
                <td>Ext/Ln ${dm.extInEq + dm.loanInEq - dm.extOutEq - dm.loanOutEq >= 0 ? '+' : ''}${fmtUSD(dm.extInEq + dm.loanInEq - dm.extOutEq - dm.loanOutEq, 0)} · FX ${fmtNum(dm.fxRate, 0)}</td>
                <td class="r">${dm.netCashFlow > 0 ? '+' : ''}${fmtUSD(dm.netCashFlow, 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  function renderPanel5FleetFuel(ctx, dm, lens, isSingleCo) {
    const { esc, ic, fmtUSD, fmtNum, coBadge, relLink } = ctx;
    const qFilter = String(ctx.STATE.dailyOpsQuickFilter || 'all');
    const qNorm = String(ctx.STATE.dailyOpsQuickSearch || '').trim().toLowerCase();
    const expMap = ctx.STATE.dailyOpsExpanded || {};
    const maintCount = dm.dayOilLogs.length + dm.dayRepairs.length + dm.dayDefects.length + dm.dayPartMoves.length;

    const topStripHtml = `
      <div class="dops-stat-strip-3 dops-substrip">
        <div class="dops-stat-box" data-dops-lens="fuel:fuel_maint">
          <small>${esc(dm.closingTankLbl)} Closing</small>
          <b>${dm.closingTankL != null ? `${fmtNum(dm.closingTankL, 0)} L` : 'N/A'} <span class="dops-stat-muted">· ${fmtNum(dm.dieselIssuedL, 0)} L issued</span></b>
        </div>
        <div class="dops-stat-box" data-dops-lens="fuel:units">
          <small>Active Fleet (${fmtNum(dm.activeTrucksCount)} Units)</small>
          <b>Own ${fmtNum(dm.companyFleetTrips)} <span class="dops-stat-muted">· 3P Haul ${fmtNum(dm.haulerTrips)} trips</span></b>
        </div>
        <div class="dops-stat-box${dm.openCritDefects.length > 0 ? ' tone-crit' : (dm.dayMalfs.length > 0 ? ' tone-brass' : '')}" data-dops-lens="fuel:maint_only">
          <small>Maint, Lube &amp; Var</small>
          <b>${dm.dayMalfs.length > 0 ? `${fmtNum(dm.malfNetL, 0)} L Var` : `${fmtNum(maintCount)} Maint`} <span class="dops-stat-muted">· Lube ${fmtNum(dm.lubeL, 0)}L · Gr ${fmtNum(dm.greaseKg, 0)}kg</span></b>
        </div>
      </div>
    `;

    const malfFiltered = dm.dayMalfs.filter(mf => {
      if (qFilter === 'rep_shifted' && !hasRepShift(mf)) return false;
      if (qFilter === 'overtime') return false;
      return matchesQuickSearch(qNorm, [mf.item, mf.notes, mf.discrepancy_type, mf.company]);
    });
    const repFiltered = dm.dayRepairs.filter(rp => {
      if (qFilter === 'rep_shifted' && !hasRepShift(rp)) return false;
      if (qFilter === 'overtime' || qFilter === 'exceptions') return false;
      return matchesQuickSearch(qNorm, [rp.equipment, rp.notes, rp.repair_source, rp.company]);
    });

    if (lens === 'maint' || lens === 'maint_only') {
      const oilFiltered = (qFilter === 'rep_shifted' || qFilter === 'overtime' || qFilter === 'exceptions')
        ? []
        : dm.dayOilLogs.filter(ol => matchesQuickSearch(qNorm, [ol.equipment, ol.oil_type, ol.service_action]));
      const defAll = dm.dayDefects.concat(dm.openCritDefects.filter(d => !dm.dayDefects.includes(d)));
      const defFiltered = defAll.filter(df => {
        if (qFilter === 'rep_shifted' && !hasRepShift(df)) return false;
        if (qFilter === 'overtime') return false;
        return matchesQuickSearch(qNorm, [df.equipment, df.severity, df.part_name, df.description, df.notes]);
      });
      const hasMaint = malfFiltered.length || oilFiltered.length || repFiltered.length || defFiltered.length;
      return `
        <div class="dops-card-body no-pad dops-flex-col">
          ${topStripHtml}
          <div class="dops-tbl-scroll">
            <table class="dops-table dops-fixed-3">
              <colgroup><col style="width:42%"><col style="width:36%"><col style="width:22%"></colgroup>
              <thead>
                <tr>
                  <th>Type &amp; Asset</th>
                  <th>Maintenance / Variance Detail</th>
                  <th class="r">Impact</th>
                </tr>
              </thead>
              <tbody>
                ${malfFiltered.map(mf => {
                  const mfItem = String(mf.item || 'Diesel').trim() || 'Diesel';
                  const mfUom = String(mf.uom || (/grease/i.test(mfItem) ? 'kg' : 'L')).trim() || 'L';
                  const mfQty = Number(mf.litres != null ? mf.litres : (mf.qty || 0));
                  return `
                    <tr class="rrow" data-rkey="fuel_malfunctions" data-rid="${esc(String(mf.id || ''))}">
                      <td class="dops-trunc"><span class="dops-kind crit">Var</span> <strong>${esc(mfItem)}</strong> ${renderRepBadge(ctx, txDateOf(mf), repDateOf(mf))}</td>
                      <td class="dops-trunc">${esc(safeNotes(ctx, mf.notes) || mf.discrepancy_type || '-')}</td>
                      <td class="r"><strong>${fmtNum(mfQty, 0)} ${esc(mfUom)}</strong></td>
                    </tr>
                  `;
                }).join('')}
                ${repFiltered.map(rp => `
                  <tr class="rrow" data-rkey="equipment_repairs" data-rid="${esc(String(rp.id || ''))}">
                    <td class="dops-trunc"><span class="dops-kind maint">Repair</span> <strong>${esc(rp.equipment || '-')}</strong> ${renderRepBadge(ctx, txDateOf(rp), repDateOf(rp))}</td>
                    <td class="dops-trunc">${esc(safeNotes(ctx, rp.notes) || rp.repair_source || '-')}</td>
                    <td class="r"><strong>${fmtUSD(rp.total_cost || rp.cost || 0, 0)}</strong></td>
                  </tr>
                `).join('')}
                ${oilFiltered.map(ol => `
                  <tr class="rrow" data-rkey="equipment_oil_logs" data-rid="${esc(String(ol.id || ''))}">
                    <td class="dops-trunc"><span class="dops-kind maint">Oil</span> <strong>${esc(ol.equipment || '-')}</strong></td>
                    <td class="dops-trunc">${esc([ol.oil_type, ol.service_action].filter(Boolean).join(' · '))}</td>
                    <td class="r"><strong>${fmtNum(ol.qty || 0, 0)} L</strong></td>
                  </tr>
                `).join('')}
                ${defFiltered.map(df => `
                  <tr class="rrow" data-rkey="equipment_defects" data-rid="${esc(String(df.id || ''))}">
                    <td class="dops-trunc"><span class="dops-kind crit">Defect</span> <strong>${esc(df.equipment || '-')}</strong></td>
                    <td class="dops-trunc">${esc([df.severity, df.part_name, safeNotes(ctx, df.description || df.notes)].filter(Boolean).join(' · '))}</td>
                    <td class="r">${esc(df.status || 'Open')}</td>
                  </tr>
                `).join('')}
                ${!hasMaint ? `<tr><td colspan="3" class="dops-empty">0 matching tank variances, breakdowns, oil logs, or defects on ${esc(fmtShortDay(dm.targetDate))}.</td></tr>` : ''}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2">Oil ${fmtNum(dm.dayOilLogs.length)} · Repairs ${fmtNum(dm.dayRepairs.length)} · Defects ${fmtNum(dm.dayDefects.length)}</td>
                  <td class="r">Var: ${fmtNum(dm.malfNetL, 0)} L</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      `;
    }

    if (lens === 'units') {
      const allUnits = dm.fuelUnitRows || [];
      const unitRows = allUnits.filter(fu => {
        if (qFilter === 'rep_shifted' && !(fu.repShiftCount > 0)) return false;
        if (qFilter === 'overtime' || qFilter === 'exceptions') return false;
        if (qNorm) {
          const uHit = matchesQuickSearch(qNorm, [fu.equipment, fu.category, fu.drivers.join(' '), fu.company]);
          const fHit = (fu.fills || []).some(fl => matchesQuickSearch(qNorm, [fl.ticket_no, fl.driver, fl.item, fl.notes]));
          if (!uHit && !fHit) return false;
        }
        return true;
      });
      const maxL = allUnits.length ? Math.max(1, ...allUnits.map(u => Math.abs(u.litres))) : 1;
      return `
        <div class="dops-card-body no-pad dops-flex-col">
          ${topStripHtml}
          <div class="dops-tbl-scroll">
            <table class="dops-table dops-fixed-3">
              <colgroup><col style="width:41%"><col style="width:36%"><col style="width:23%"></colgroup>
              <thead>
                <tr>
                  <th>Equipment / Unit</th>
                  <th>Drivers, Fills &amp; Odo</th>
                  <th class="r">Issued</th>
                </tr>
              </thead>
              <tbody>
                ${malfFiltered.map(mf => {
                  const mfItem = String(mf.item || 'Diesel').trim() || 'Diesel';
                  const mfUom = String(mf.uom || (/grease/i.test(mfItem) ? 'kg' : 'L')).trim() || 'L';
                  const mfQty = Number(mf.litres != null ? mf.litres : (mf.qty || 0));
                  return `
                    <tr class="rrow" data-rkey="fuel_malfunctions" data-rid="${esc(String(mf.id || ''))}">
                      <td class="dops-trunc"><span class="dops-kind crit">Tank Var</span> <strong>${esc(mfItem)}</strong> ${renderRepBadge(ctx, txDateOf(mf), repDateOf(mf))}</td>
                      <td class="dops-trunc">${esc(safeNotes(ctx, mf.notes) || mf.discrepancy_type || '-')}</td>
                      <td class="r"><strong style="color:${mfQty < 0 ? 'var(--good)' : 'var(--crit)'}">${fmtNum(mfQty, 0)} ${esc(mfUom)}</strong></td>
                    </tr>
                  `;
                }).join('')}
                ${unitRows.map(fu => {
                  const pct = Math.min(100, Math.max(4, Math.round((Math.abs(fu.litres) / maxL) * 100)));
                  const expKey = `fuel:${fu.key}`;
                  const innerHit = Boolean(qNorm && !matchesQuickSearch(qNorm, [fu.equipment, fu.drivers.join(' ')]) && (fu.fills || []).some(fl => matchesQuickSearch(qNorm, [fl.ticket_no, fl.notes])));
                  const isExp = Boolean(expMap[expKey] || innerHit);
                  const repBadge = renderGroupRepBadge(ctx, fu.repShiftCount, fu.fillsCount, fu.repShiftDates, dm.targetDate);
                  const odoTag = fu.odoDelta > 0 ? ` <span class="dops-odo-tag">+${fmtNum(fu.odoDelta, 0)} km</span>` : (fu.maxOdo > 0 ? ` <span class="dops-odo-tag">${fmtNum(fu.maxOdo, 0)}</span>` : '');
                  const subFills = isExp ? (fu.fills || []).filter(fl => qFilter !== 'rep_shifted' || hasRepShift(fl)) : [];
                  return `
                    <tr class="dops-group-row${isExp ? ' is-expanded' : ''}" data-dops-expand="${esc(expKey)}" tabindex="0" data-ui-tip="Click to ${isExp ? 'collapse' : 'expand'} ${fmtNum(fu.fillsCount)} fuel ${fu.fillsCount === 1 ? 'entry' : 'entries'} for ${esc(fu.equipment)}">
                      <td class="dops-trunc">
                        <div class="dops-grp-head">
                          <span class="dops-exp-chev">${ic(isExp ? 'chevron_down' : 'chevron_right')}</span>
                          ${!isSingleCo ? `${coBadge(fu.company)} ` : ''}${fu.equipment !== 'Plant Tank' ? relLink('equipment', fu.equipment, fu.equipment, true) : `<strong>Plant Tank</strong>`}
                          ${repBadge}
                        </div>
                        ${fu.category ? `<small class="dops-cell-sub dops-sub-pad">${esc(fu.category)}</small>` : ''}
                      </td>
                      <td class="dops-trunc">
                        ${fu.drivers.length ? `<strong>${esc(fu.drivers.slice(0, 2).join(', '))}</strong>` : `<span style="color:var(--muted)">Plant Issue</span>`}${odoTag}
                        <small class="dops-cell-sub"><b>${fmtNum(fu.fillsCount)}</b> ${fu.fillsCount === 1 ? 'fill' : 'fills'}</small>
                      </td>
                      <td class="r">
                        <div class="dops-bar-inline" style="justify-content:flex-end">
                          <div class="dops-bar-track"><div class="dops-bar-fill teal" style="width:${pct}%"></div></div>
                          <strong style="color:${fu.isRefill ? 'var(--good)' : 'var(--ink)'}">${fu.isRefill ? '+' : ''}${fmtNum(fu.litres, 0)} ${fu.uom}</strong>
                        </div>
                      </td>
                    </tr>
                    ${subFills.map(fl => {
                      const prevOdo = Number(fl.prev_odometer || 0);
                      const curOdo = Number(fl.odometer || 0);
                      const dlt = (curOdo > prevOdo && prevOdo > 0) ? (curOdo - prevOdo) : 0;
                      const uom = /grease/i.test(String(fl.item || '')) ? 'kg' : 'L';
                      const isRef = ctx.isDieselTankRefillIntake && ctx.isDieselTankRefillIntake(fl);
                      return `
                        <tr class="rrow dops-subrow" data-rkey="fuel_intakes" data-rid="${esc(String(fl.id || ''))}">
                          <td class="dops-trunc">
                            <div class="dops-sub-cell">
                              <span class="dops-sub-indent"></span>
                              <strong class="mono">${fl.ticket_no ? `#${esc(String(fl.ticket_no))}` : esc(fl.item || 'Diesel')}</strong>
                              ${fl.time ? `<small class="dops-time-tag">${esc(String(fl.time).slice(0, 5))}</small>` : ''}
                              <button type="button" class="tkt-print-mini dops-print-mini" data-print-ticket="fuel" data-print-id="${esc(String(fl.id || ''))}" data-ui-tip="Print Fuel Slip">${ic('printer')}</button>
                              ${renderRepBadge(ctx, txDateOf(fl), repDateOf(fl))}
                            </div>
                          </td>
                          <td class="dops-trunc">${esc(fl.driver || fl.item || 'Diesel')}${dlt > 0 ? ` · +${fmtNum(dlt, 0)}km` : (curOdo > 0 ? ` · ${fmtNum(curOdo, 0)}` : '')}</td>
                          <td class="r"><strong>${isRef ? '+' : ''}${fmtNum(fl.litres || 0, 0)} ${uom}</strong></td>
                        </tr>
                      `;
                    }).join('')}
                  `;
                }).join('')}
                ${!unitRows.length && !malfFiltered.length ? `<tr><td colspan="3" class="dops-empty">No matching equipment diesel or lube issues on ${esc(fmtShortDay(dm.targetDate))}.</td></tr>` : ''}
              </tbody>
              <tfoot>
                <tr>
                  <td>${fmtNum(allUnits.length)} Units · ${fmtNum(dm.fuelFillsCount)} Fills</td>
                  <td>Issued ${fmtNum(dm.dieselIssuedL, 0)} L · Bought ${fmtNum(dm.dieselBoughtL, 0)} L</td>
                  <td class="r">${dm.closingTankL != null ? `Tank ${fmtNum(dm.closingTankL, 0)} L` : ''}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      `;
    }

    // Individual Fills ('fuel_maint'): 3-Stat Tank/Fleet Strip + All Equipment Fuel Intakes, Odometer Deltas & Maintenance Table
    const fuels = (dm.fuelSortedRows || []).filter(fl => {
      if (qFilter === 'rep_shifted' && !hasRepShift(fl)) return false;
      if (qFilter === 'overtime' || qFilter === 'exceptions') return false;
      return matchesQuickSearch(qNorm, [fl.equipment, fl.driver, fl.item, fl.ticket_no, fl.equipment_category, fl.notes, fl.company]);
    });
    return `
      <div class="dops-card-body no-pad dops-flex-col">
        ${topStripHtml}
        <div class="dops-tbl-scroll">
          <table class="dops-table dops-fixed-3">
            <colgroup><col style="width:41%"><col style="width:36%"><col style="width:23%"></colgroup>
            <thead>
              <tr>
                <th>Equipment / Unit</th>
                <th>Driver, Category &amp; Odo</th>
                <th class="r">Issued</th>
              </tr>
            </thead>
            <tbody>
              ${malfFiltered.map(mf => {
                const mfItem = String(mf.item || 'Diesel').trim() || 'Diesel';
                const mfUom = String(mf.uom || (/grease/i.test(mfItem) ? 'kg' : 'L')).trim() || 'L';
                const mfQty = Number(mf.litres != null ? mf.litres : (mf.qty || 0));
                return `
                  <tr class="rrow" data-rkey="fuel_malfunctions" data-rid="${esc(String(mf.id || ''))}">
                    <td class="dops-trunc"><span class="dops-kind crit">Tank Var</span> <strong>${esc(mfItem)}</strong> ${renderRepBadge(ctx, txDateOf(mf), repDateOf(mf))}</td>
                    <td class="dops-trunc">${esc(safeNotes(ctx, mf.notes) || mf.discrepancy_type || '-')}</td>
                    <td class="r"><strong style="color:${mfQty < 0 ? 'var(--good)' : 'var(--crit)'}">${fmtNum(mfQty, 0)} ${esc(mfUom)}</strong></td>
                  </tr>
                `;
              }).join('')}
              ${repFiltered.map(rp => `
                <tr class="rrow" data-rkey="equipment_repairs" data-rid="${esc(String(rp.id || ''))}">
                  <td class="dops-trunc"><span class="dops-kind maint">Repair</span> <strong>${esc(rp.equipment || '-')}</strong> ${renderRepBadge(ctx, txDateOf(rp), repDateOf(rp))}</td>
                  <td class="dops-trunc">${esc(safeNotes(ctx, rp.notes) || rp.repair_source || '-')}</td>
                  <td class="r"><strong>${fmtUSD(rp.total_cost || rp.cost || 0, 0)}</strong></td>
                </tr>
              `).join('')}
              ${fuels.map(fl => {
                const prevOdo = Number(fl.prev_odometer || 0);
                const curOdo = Number(fl.odometer || 0);
                const odoDelta = (curOdo > prevOdo && prevOdo > 0) ? (curOdo - prevOdo) : 0;
                const uom = /grease/i.test(String(fl.item || '')) ? 'kg' : 'L';
                const isRefill = ctx.isDieselTankRefillIntake && ctx.isDieselTankRefillIntake(fl);
                const odoTag = odoDelta > 0 ? ` <span class="dops-odo-tag">+${fmtNum(odoDelta, 0)} km</span>` : (curOdo > 0 ? ` <span class="dops-odo-tag">${fmtNum(curOdo, 0)}</span>` : '');
                return `
                  <tr class="rrow" data-rkey="fuel_intakes" data-rid="${esc(String(fl.id || ''))}">
                    <td class="dops-trunc">
                      <div class="dops-grp-head">
                        ${!isSingleCo ? `${coBadge(fl.company)} ` : ''}<strong>${esc(fl.equipment || 'Plant Tank')}</strong>
                        <button type="button" class="tkt-print-mini dops-print-mini" data-print-ticket="fuel" data-print-id="${esc(String(fl.id || ''))}" data-ui-tip="Print Fuel Slip">${ic('printer')}</button>
                        ${renderRepBadge(ctx, txDateOf(fl), repDateOf(fl))}
                      </div>
                      ${fl.equipment_category ? `<small class="dops-cell-sub">${esc(fl.equipment_category)}</small>` : ''}
                    </td>
                    <td class="dops-trunc">
                      ${fl.driver ? `<strong>${esc(fl.driver)}</strong>` : `<span style="color:var(--muted)">${esc(fl.item || 'Diesel')}</span>`}${odoTag}
                    </td>
                    <td class="r"><strong style="color:${isRefill ? 'var(--good)' : 'var(--ink)'}">${isRefill ? '+' : ''}${fmtNum(fl.litres || 0, 0)} ${uom}</strong></td>
                  </tr>
                `;
              }).join('')}
              ${!fuels.length && !malfFiltered.length && !repFiltered.length ? `<tr><td colspan="3" class="dops-empty">No matching diesel fills, lube issues, or fleet repairs on ${esc(fmtShortDay(dm.targetDate))}.</td></tr>` : ''}
            </tbody>
            <tfoot>
              <tr>
                <td>${fmtNum(dm.fuelFillsCount)} Fills · Bought ${fmtNum(dm.dieselBoughtL, 0)} L</td>
                <td>Issued ${fmtNum(dm.dieselIssuedL, 0)} L</td>
                <td class="r">${dm.closingTankL != null ? `Tank ${fmtNum(dm.closingTankL, 0)} L` : ''}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  function renderPanel6Workforce(ctx, dm, lens, isSingleCo) {
    const { esc, ic, fmtUSD, fmtNum } = ctx;
    const qFilter = String(ctx.STATE.dailyOpsQuickFilter || 'all');
    const qNorm = String(ctx.STATE.dailyOpsQuickSearch || '').trim().toLowerCase();

    const topStripHtml = `
      <div class="dops-stat-strip-3 dops-substrip">
        <div class="dops-stat-box" data-dops-lens="plant:overview">
          <small>Active Workforce</small>
          <b>${fmtNum(dm.activeStaffCount)} Staff <span class="dops-stat-muted">· ${fmtNum(dm.presentAttCount)} Shift · ${fmtNum(dm.absentCount)} Abs</span></b>
        </div>
        <div class="dops-stat-box${qFilter === 'overtime' ? ' tone-brass' : (dm.attOtHours > 0 || dm.otTotalLoads > 0 ? ' tone-brass' : '')}" data-dops-qfilter="overtime" data-ui-tip="Click to filter Daily Operations to Overtime dispatches and shifts">
          <small>Overtime (${fmtNum(dm.attOtStaffCount)} staff)</small>
          <b>+${fmtNum(dm.attOtHours, 1)}h <span class="dops-stat-muted">${dm.attOtPayUsd > 0 ? `(${fmtUSD(dm.attOtPayUsd, 0)})` : ''} · ${fmtNum(dm.otTotalLoads)} OT loads</span></b>
        </div>
        <div class="dops-stat-box${dm.dayRegAdds.length > 0 ? ' tone-good' : ''}" data-dops-lens="plant:master_gov">
          <small>Master &amp; Governance</small>
          <b>+${fmtNum(dm.dayRegAdds.length)} Master <span class="dops-stat-muted">· ${fmtNum(dm.repShiftedCount)} Rep-Shifted</span></b>
        </div>
      </div>
    `;

    const digestPills = [];
    if (dm.ahAvailableCount > 0) {
      if (dm.includeAh) {
        digestPills.push(`<button type="button" class="dops-dpill ah" data-dops-open-drawer="after_hours">${ic('moon')} +${fmtNum(dm.ahAvailableCount)} After-Hours (${fmtUSD(dm.ahAvailableUsd, 0)})</button>`);
      } else {
        digestPills.push(`<button type="button" class="dops-dpill warn" data-dops-toggle-ah="1">${ic('moon')} ${fmtNum(dm.ahAvailableCount)} After-Hours Off · Include</button>`);
      }
    }
    if (dm.pendingExps.length > 0) {
      digestPills.push(`<button type="button" class="dops-dpill warn" data-dops-lens="exp:bills">${ic('clock')} ${fmtNum(dm.pendingExps.length)} Pending Price ($0)</button>`);
    }
    if (dm.repShiftedCount > 0) {
      digestPills.push(`<button type="button" class="dops-dpill rep-shift${qFilter === 'rep_shifted' ? ' active' : ''}" data-dops-qfilter="rep_shifted" data-ui-tip="${dm.repShiftedCount} entries transacted on ${fmtDmy(dm.targetDate)} carry a different Reporting Date. Click to spotlight shifted entries across all 6 panels.">${ic('rep_shift')} ${fmtNum(dm.repShiftedCount)} Rep-Date Shifted</button>`);
    }
    if (dm.dayRegAdds.length > 0) {
      digestPills.push(`<button type="button" class="dops-dpill" data-dops-lens="plant:master_gov">${ic('plus')} ${fmtNum(dm.dayRegAdds.length)} New Master ${dm.dayRegAdds.length === 1 ? 'Record' : 'Records'}</button>`);
    }
    if (!digestPills.length) {
      digestPills.push(`<span class="dops-dpill good">${ic('check_circle')} All plant, fuel &amp; ledger controls clean</span>`);
    }

    if (lens === 'master' || lens === 'master_gov') {
      const adds = (dm.dayRegAdds || []).filter(ad => {
        if (qFilter === 'rep_shifted' || qFilter === 'overtime' || qFilter === 'exceptions') return false;
        return matchesQuickSearch(qNorm, [ad.cleanName, ad.cleanSub, ad.cleanLabel]);
      });
      return `
        <div class="dops-card-body no-pad dops-flex-col">
          ${topStripHtml}
          <div class="dops-tbl-scroll">
            <table class="dops-table dops-fixed-3">
              <colgroup><col style="width:48%"><col style="width:32%"><col style="width:20%"></colgroup>
              <thead>
                <tr>
                  <th>Registry &amp; Record</th>
                  <th>Details / Role</th>
                  <th class="r">Status</th>
                </tr>
              </thead>
              <tbody>
                ${adds.map(ad => {
                  const r = ad.row || {};
                  const nm = ad.cleanName || r.name || r.staff || r.equipment || r.site || r.product || r.id || '-';
                  const sub = ad.cleanSub || r.role || r.category || r.type || r.company || 'Master Registry';
                  return `
                    <tr class="rrow" data-rkey="${esc(ad.rkey)}" data-rid="${esc(String(r.id || ''))}">
                      <td class="dops-trunc"><span class="dops-kind rule">${esc(ad.cleanLabel || ad.label)}</span> <strong>${esc(nm)}</strong></td>
                      <td class="dops-trunc">${esc(sub)}</td>
                      <td class="r"><span class="dops-kind cash">Active</span></td>
                    </tr>
                  `;
                }).join('') || `<tr><td colspan="3" class="dops-empty">No matching master counterparties, staff, or equipment created on ${esc(fmtShortDay(dm.targetDate))}.</td></tr>`}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2">${fmtNum((dm.dayRegAdds || []).length)} New Master Additions</td>
                  <td class="r">${fmtNum(dm.repShiftedCount)} Shifted</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div class="dops-digest-bar dops-workforce-foot">${digestPills.slice(0, 3).join('')}</div>
        </div>
      `;
    }

    // Default ('overview' or 'team'): 3-Stat Strip + Exceptions, Salaries, New Master & Overtime Attendance Table + Governance Bar
    const empRows = dm.dayEmps.filter(em => {
      if (qFilter === 'rep_shifted' && !hasRepShift(em)) return false;
      if (qFilter === 'overtime' || qFilter === 'exceptions') return false;
      return matchesQuickSearch(qNorm, [em.staff, em.type, em.company]);
    });
    const salRows = dm.daySals.filter(sa => {
      if (qFilter === 'rep_shifted' && !hasRepShift(sa)) return false;
      if (qFilter === 'overtime' || qFilter === 'exceptions') return false;
      return matchesQuickSearch(qNorm, [sa.staff, sa.payroll_month, sa.method, sa.notes, sa.company]);
    });
    const adds = (dm.dayRegAdds || []).filter(ad => {
      if (qFilter === 'rep_shifted' || qFilter === 'overtime' || qFilter === 'exceptions') return false;
      return matchesQuickSearch(qNorm, [ad.cleanName, ad.cleanSub, ad.cleanLabel]);
    });
    const attRows = (dm.attSortedRows || []).filter(at => {
      const isAbs = /absent|leave|off|sick/i.test(String(at.status || at.type || '')) || Number(at.leave_days || 0) > 0;
      const oth = Number(at.overtime_hours || 0);
      if (qFilter === 'rep_shifted' && !hasRepShift(at)) return false;
      if (qFilter === 'overtime' && !(oth > 0)) return false;
      if (qFilter === 'exceptions' && !isAbs) return false;
      return matchesQuickSearch(qNorm, [at.staff, at.status, at.type, at.in_time, at.out_time, at.notes, at.company]);
    });
    return `
      <div class="dops-card-body no-pad dops-flex-col">
        ${topStripHtml}
        <div class="dops-tbl-scroll">
          <table class="dops-table dops-fixed-3">
            <colgroup><col style="width:46%"><col style="width:32%"><col style="width:22%"></colgroup>
            <thead>
              <tr>
                <th>Status &amp; Staff</th>
                <th>Shift / Role / Detail</th>
                <th class="r">OT / Impact</th>
              </tr>
            </thead>
            <tbody>
              ${empRows.map(em => `
                <tr class="rrow" data-rkey="employments" data-rid="${esc(String(em.id || ''))}">
                  <td class="dops-trunc"><span class="dops-kind team">Contract</span> <strong>${esc(em.staff || '-')}</strong></td>
                  <td class="dops-trunc">${esc(em.type || 'Staff')} · ${fmtNum(em.working_days || 30)}d/mo</td>
                  <td class="r"><strong>${fmtUSD(em.salary_usd || 0, 0)}/mo</strong></td>
                </tr>
              `).join('')}
              ${salRows.map(sa => `
                <tr class="rrow" data-rkey="salaries" data-rid="${esc(String(sa.id || ''))}">
                  <td class="dops-trunc"><div class="dops-grp-head"><span class="dops-kind pay">Salary</span><strong>${esc(sa.staff || '-')}</strong>${renderRepBadge(ctx, txDateOf(sa), repDateOf(sa))}</div></td>
                  <td class="dops-trunc">${esc(sa.payroll_month || '')} · ${esc(sa.method || 'Cash')}</td>
                  <td class="r"><strong>${sa.lbp_amount ? fmtCompactLbp(sa.lbp_amount) : fmtUSD(sa.amount || 0, 0)}</strong></td>
                </tr>
              `).join('')}
              ${adds.map(ad => {
                const r = ad.row || {};
                const nm = ad.cleanName || r.name || r.staff || r.equipment || r.site || r.product || r.id || '-';
                const sub = ad.cleanSub || r.role || r.category || r.type || r.company || 'Added Today';
                return `
                  <tr class="rrow" data-rkey="${esc(ad.rkey)}" data-rid="${esc(String(r.id || ''))}">
                    <td class="dops-trunc"><div class="dops-grp-head"><span class="dops-kind rule">${esc(ad.cleanLabel || ad.label)}</span><strong>${esc(nm)}</strong></div></td>
                    <td class="dops-trunc"><span style="color:var(--muted)">${esc(sub)}</span></td>
                    <td class="r"><span class="dops-kind cash">New</span></td>
                  </tr>
                `;
              }).join('')}
              ${attRows.map(at => {
                const isAbs = /absent|leave|off|sick/i.test(String(at.status || at.type || '')) || Number(at.leave_days || 0) > 0;
                const oth = Number(at.overtime_hours || 0);
                const payUsd = Number(at.payroll_impact_usd || 0);
                const shiftTxt = at.in_time && at.out_time ? `${at.in_time}-${at.out_time}` : (at.status || 'Shift');
                return `
                  <tr class="rrow" data-rkey="attendance" data-rid="${esc(String(at.id || ''))}">
                    <td class="dops-trunc"><div class="dops-grp-head"><span class="dops-kind ${isAbs ? 'crit' : (oth > 0 ? 'loan' : 'team')}">${isAbs ? 'Absent' : (oth > 0 ? `+${fmtNum(oth, 0)}h OT` : 'Shift')}</span><strong>${esc(at.staff || '-')}</strong>${renderRepBadge(ctx, txDateOf(at), repDateOf(at))}</div></td>
                    <td class="dops-trunc"><span style="color:var(--muted)">${esc(shiftTxt)}${at.worked_hours ? ` · ${fmtNum(at.worked_hours, 0)}h` : ''}</span></td>
                    <td class="r">${isAbs ? '<strong style="color:var(--crit)">Absent</strong>' : (payUsd > 0 ? `<strong>+${fmtUSD(payUsd, 0)}</strong>` : (oth > 0 ? `<strong>+${fmtNum(oth, 1)}h</strong>` : `${fmtNum(at.worked_hours || 0, 0)}h`))}</td>
                  </tr>
                `;
              }).join('')}
              ${!attRows.length && !adds.length && !salRows.length && !empRows.length ? `<tr><td colspan="3" class="dops-empty">No matching attendance logs, salaries, or master additions on ${esc(fmtShortDay(dm.targetDate))} (${fmtNum(dm.activeStaffCount)} active dispatch drivers).</td></tr>` : ''}
            </tbody>
            <tfoot>
              <tr>
                <td>Active ${fmtNum(dm.activeStaffCount)} · Absent ${fmtNum(dm.absentCount)}</td>
                <td>OT +${fmtNum(dm.attOtHours, 1)}h · ${fmtNum(dm.otTotalLoads)} OT Loads</td>
                <td class="r">${fmtUSD(dm.attOtPayUsd, 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div class="dops-digest-bar dops-workforce-foot">
          ${digestPills.slice(0, 3).join('')}
        </div>
      </div>
    `;
  }

  function filterDrawerRows(dm, streamFilter, searchStr) {
    const q = String(searchStr || '').trim().toLowerCase();
    return dm.stream.filter(row => {
      if (streamFilter === 'after_hours' && !row.isAfterHours) return false;
      else if (streamFilter === 'rep_shifted' && !row.isRepShifted) return false;
      else if (streamFilter === 'sales' && row.group !== 'sales') return false;
      else if (streamFilter === 'raw' && row.group !== 'raw') return false;
      else if (streamFilter === 'agreements' && row.group !== 'agreements') return false;
      else if (streamFilter === 'external' && row.group !== 'external') return false;
      else if (streamFilter === 'fx_loans' && row.group !== 'fx_loans') return false;
      else if (streamFilter === 'ar_ap' && row.group !== 'ar_ap') return false;
      else if (streamFilter === 'treasury' && !['external', 'fx_loans', 'ar_ap'].includes(row.group)) return false;
      else if (streamFilter === 'expenses' && row.group !== 'expenses') return false;
      else if (streamFilter === 'fuel_maint' && row.group !== 'fuel_maint') return false;
      else if (streamFilter === 'team' && row.group !== 'team') return false;
      else if (streamFilter === 'plant' && !['expenses', 'fuel_maint', 'team'].includes(row.group)) return false;

      if (q) {
        const hay = `${row.ref} ${row.kindLbl} ${row.party} ${row.detail} ${row.company} ${row.qtyTxt} ${row.repDate || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderDrawerTableHtml(ctx, dm, streamFilter, searchStr, isSingleCo) {
    const { esc, ic, fmtUSD, fmtNum, coBadge } = ctx;
    const filtered = filterDrawerRows(dm, streamFilter, searchStr);
    if (!filtered.length) {
      return `<div class="dops-empty">${streamFilter === 'after_hours'
        ? `No Yesterday's After-Hours tickets were logged for ${esc(fmtShortDay(dm.yestDate))}.`
        : (streamFilter === 'rep_shifted'
          ? `No entries on ${esc(fmtHumanDay(dm.targetDate))} carry a shifted Reporting Date.`
          : `No matching records on ${esc(fmtHumanDay(dm.targetDate))}.`)}</div>`;
    }
    return `
      <table class="dops-table dops-stream-tbl" id="dopsStreamTable">
        <colgroup>
          <col style="width:108px">
          <col style="width:86px">
          <col>
          <col style="width:102px">
          <col style="width:72px">
        </colgroup>
        <thead>
          <tr>
            <th>Ref</th>
            <th>Domain</th>
            <th>Counterparty, Rule or Item</th>
            <th class="r">Qty / Rate</th>
            <th class="r">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.slice(0, 160).map(row => `
            <tr class="rrow${row.isAfterHours ? ' is-afterhours-row' : ''}" data-rkey="${esc(row.rkey)}" data-rid="${esc(String(row.rid || ''))}">
              <td class="mono dops-ref-cell">
                <strong>${esc(row.ref)}</strong>${row.time ? `<small class="dops-time-tag">${esc(row.time)}</small>` : ''}
              </td>
              <td class="dops-type-cell">
                <span class="dops-kind ${row.kindCls}">${esc(row.kindLbl)}</span>
              </td>
              <td class="dops-trunc">${!isSingleCo ? `${coBadge(row.company)} ` : ''}${row.isRepShifted ? renderRepBadge(ctx, row.txDate, row.repDate) : ''}${row.isAfterHours ? `<span class="dops-ah-badge" data-ui-tip="Occurred on ${esc(fmtShortDay(row.txDate))} after accountants left · logged via Yesterday's After-Hours">${ic('moon')}After-Hours</span>` : ''}${row.isOvertime ? `<span class="dops-ot-badge" data-ui-tip="Overtime shift load">${ic('overtime')}OT</span>` : ''}${row.isPendingPrice ? `<span class="dops-pend-badge" data-ui-tip="Pending supplier invoice price">${ic('clock')}Pending $</span>` : ''}<strong>${esc(row.party)}</strong>${row.detail ? ` <span style="color:var(--muted)">· ${esc(row.detail)}</span>` : ''}</td>
              <td class="r dops-vol-cell">${esc(row.qtyTxt || '-')}</td>
              <td class="r dops-amt-cell">${row.amount == null ? '-' : `<strong style="color:${row.inflow ? 'var(--good)' : (row.amount < 0 ? 'var(--crit)' : 'var(--ink)')}">${fmtUSD(row.amount, 0)}</strong>`}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="5">
              <div class="dops-stream-foot-flex">
                <span>${filtered.length > 160 ? `Showing 160 of ${fmtNum(filtered.length)} entries` : `Total (${fmtNum(filtered.length)} ${filtered.length === 1 ? 'record' : 'records'})`}</span>
                <span>Click any row to edit or inspect 360° Details</span>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    `;
  }

  function renderBentoGridHtml(ctx, dm, isSingleCo) {
    const { STATE, esc, ic, fmtNum } = ctx;
    const commLens = STATE.dailyOpsCommLens || 'pulse';
    const dealsLens = STATE.dailyOpsDealsLens || 'highlights';
    const expLens = STATE.dailyOpsExpLens || 'bills';
    const treasuryLens = STATE.dailyOpsTreasuryLens || 'bridge';
    const fuelLens = STATE.dailyOpsFuelLens || 'units';
    const plantLens = STATE.dailyOpsPlantLens || 'overview';

    const cntByGroup = g => dm.stream.filter(r => r.group === g).length;
    const salesCnt = cntByGroup('sales');
    const rawCnt = cntByGroup('raw');
    const agrCnt = cntByGroup('agreements');
    const extCnt = cntByGroup('external');
    const fxlCnt = cntByGroup('fx_loans');
    const arapCnt = cntByGroup('ar_ap');
    const expCnt = cntByGroup('expenses');
    const fmCnt = cntByGroup('fuel_maint');
    const teamCnt = cntByGroup('team');

    return `
      <!-- PANEL 1: SALES & CLIENT DISPATCH -->
      <div class="dops-card" id="dopsPulseMixCard">
        <div class="dops-card-hd">
          <div class="dops-card-title-wrap">
            <span class="dops-card-ico navy">${ic('sales')}</span>
            <h2 class="dops-card-title">1 · Sales &amp; Dispatch</h2>
          </div>
          <div class="dops-card-actions">
            <div class="dops-seg" role="tablist" aria-label="Commercial Lens">
              <button type="button" class="dops-seg-btn${commLens === 'pulse' || commLens === 'customers' ? ' active' : ''}" data-dops-lens="comm:pulse">Clients (${fmtNum(dm.customerRows.length)})</button>
              <button type="button" class="dops-seg-btn${commLens === 'hours' ? ' active' : ''}" data-dops-lens="comm:hours">Shift</button>
              <button type="button" class="dops-seg-btn${commLens === 'grades' ? ' active' : ''}" data-dops-lens="comm:grades">Grades</button>
            </div>
            <button type="button" class="dops-disc-link" data-dops-open-drawer="sales" data-ui-tip="Inspect all ${salesCnt} sales dispatch tickets">${fmtNum(salesCnt)}</button>
            <button type="button" class="dops-add-btn" data-open-modal="sales" data-ui-tip="New Sales Dispatch Ticket" aria-label="New Sales Dispatch Ticket">${ic('plus')}</button>
          </div>
        </div>
        ${renderPanel1Sales(ctx, dm, commLens, isSingleCo)}
      </div>

      <!-- PANEL 2: QUARRY SUPPLY, HAULAGE & PRICING -->
      <div class="dops-card" id="dopsAgreementsCard">
        <div class="dops-card-hd">
          <div class="dops-card-title-wrap">
            <span class="dops-card-ico brass">${ic('quarry')}</span>
            <h2 class="dops-card-title">2 · Quarry &amp; Pricing</h2>
          </div>
          <div class="dops-card-actions">
            <div class="dops-seg" role="tablist" aria-label="Quarry & Pricing Lens">
              <button type="button" class="dops-seg-btn${dealsLens === 'highlights' ? ' active' : ''}" data-dops-lens="deals:highlights">Quarry</button>
              <button type="button" class="dops-seg-btn${dm.newPoliciesCount > 0 ? ' has-alert' : ''}${dealsLens === 'rules' ? ' active' : ''}" data-dops-lens="deals:rules">Rules (${fmtNum(dm.newPoliciesCount || dm.activeRulesUsed.length)})</button>
              <button type="button" class="dops-seg-btn${dm.belowAgreedLoads > 0 ? ' has-alert' : ''}${dealsLens === 'audit' ? ' active' : ''}" data-dops-lens="deals:audit">Audit</button>
              <button type="button" class="dops-seg-btn${dealsLens === 'vat_jv' ? ' active' : ''}" data-dops-lens="deals:vat_jv">VAT</button>
            </div>
            <button type="button" class="dops-disc-link" data-dops-open-drawer="raw" data-ui-tip="Inspect quarry & agreement records">${fmtNum(rawCnt + agrCnt)}</button>
            <button type="button" class="dops-add-btn" data-open-modal="raw" data-ui-tip="New Raw Material Ticket" aria-label="New Raw Material Ticket">${ic('plus')}</button>
          </div>
        </div>
        ${renderPanel2QuarryPricing(ctx, dm, dealsLens, isSingleCo)}
      </div>

      <!-- PANEL 3: DAY P&L BRIDGE, EXPENSES & BILLS -->
      <div class="dops-card" id="dopsExpensesCard">
        <div class="dops-card-hd">
          <div class="dops-card-title-wrap">
            <span class="dops-card-ico amber">${ic('expenses')}</span>
            <h2 class="dops-card-title">3 · P&amp;L &amp; Expenses</h2>
          </div>
          <div class="dops-card-actions">
            <div class="dops-seg" role="tablist" aria-label="Expenses Lens">
              <button type="button" class="dops-seg-btn${expLens === 'bills' ? ' active' : ''}" data-dops-lens="exp:bills">Bills (${fmtNum(dm.expCount)})</button>
              <button type="button" class="dops-seg-btn${expLens === 'cats' || expLens === 'categories' ? ' active' : ''}" data-dops-lens="exp:cats">Categories</button>
              <button type="button" class="dops-seg-btn${expLens === 'stock' || expLens === 'items' ? ' active' : ''}" data-dops-lens="exp:stock">Items (${fmtNum(dm.dayExpItems.length)})</button>
            </div>
            <button type="button" class="dops-disc-link" data-dops-open-drawer="expenses" data-ui-tip="Inspect expense bills & stock purchases">${fmtNum(expCnt)}</button>
            <button type="button" class="dops-add-btn" data-open-modal="expense" data-ui-tip="New Expense / Stock Bill" aria-label="New Expense Bill">${ic('plus')}</button>
          </div>
        </div>
        ${renderPanel3ExpensesPnl(ctx, dm, expLens, isSingleCo)}
      </div>

      <!-- PANEL 4: CASH FLOW, EXTERNAL, AR/AP & LOANS -->
      <div class="dops-card" id="dopsTreasuryCard">
        <div class="dops-card-hd">
          <div class="dops-card-title-wrap">
            <span class="dops-card-ico teal">${ic('cashflow')}</span>
            <h2 class="dops-card-title">4 · Treasury</h2>
          </div>
          <div class="dops-card-actions">
            <div class="dops-seg" role="tablist" aria-label="Treasury Lens">
              <button type="button" class="dops-seg-btn${treasuryLens === 'bridge' ? ' active' : ''}" data-dops-lens="treasury:bridge">All (${fmtNum(dm.cashMoveRows.length)})</button>
              <button type="button" class="dops-seg-btn${dm.extItems.length > 0 ? ' has-alert' : ''}${treasuryLens === 'external' ? ' active' : ''}" data-dops-lens="treasury:external">Ext (${fmtNum(dm.extItems.length)})</button>
              <button type="button" class="dops-seg-btn${(dm.convItems.length + dm.loanEvents.length) > 0 ? ' has-alert' : ''}${treasuryLens === 'fx_loans' ? ' active' : ''}" data-dops-lens="treasury:fx_loans">FX/Ln (${fmtNum(dm.convItems.length + dm.loanEvents.length)})</button>
              <button type="button" class="dops-seg-btn${treasuryLens === 'ar_ap' ? ' active' : ''}" data-dops-lens="treasury:ar_ap">AR/AP (${fmtNum(dm.arRcptCount + dm.apSetCount)})</button>
            </div>
            <button type="button" class="dops-disc-link" data-dops-open-drawer="treasury" data-ui-tip="Inspect treasury, external, FX & loan records">${fmtNum(extCnt + fxlCnt + arapCnt)}</button>
            <button type="button" class="dops-add-btn" data-open-modal="external" data-ui-tip="New Treasury / External Movement" aria-label="New Treasury Movement">${ic('plus')}</button>
          </div>
        </div>
        ${renderPanel4Treasury(ctx, dm, treasuryLens, isSingleCo)}
      </div>

      <!-- PANEL 5: DIESEL TANK, FUEL CONSUMERS & FLEET -->
      <div class="dops-card" id="dopsFleetFuelCard">
        <div class="dops-card-hd">
          <div class="dops-card-title-wrap">
            <span class="dops-card-ico steel">${ic('fleet')}</span>
            <h2 class="dops-card-title">5 · Diesel, Fuel &amp; Fleet</h2>
          </div>
          <div class="dops-card-actions">
            <div class="dops-seg" role="tablist" aria-label="Fleet & Fuel Lens">
              <button type="button" class="dops-seg-btn${fuelLens === 'units' ? ' active' : ''}" data-dops-lens="fuel:units">Units (${fmtNum((dm.fuelUnitRows || []).length)})</button>
              <button type="button" class="dops-seg-btn${fuelLens === 'fuel_maint' ? ' active' : ''}" data-dops-lens="fuel:fuel_maint">Fills (${fmtNum(dm.dayFuels.length)})</button>
              <button type="button" class="dops-seg-btn${(dm.dayMalfs.length + dm.openCritDefects.length) > 0 ? ' has-alert' : ''}${fuelLens === 'maint_only' || fuelLens === 'maint' ? ' active' : ''}" data-dops-lens="fuel:maint_only">Maint (${fmtNum(dm.dayMalfs.length + dm.dayRepairs.length + dm.dayOilLogs.length)})</button>
            </div>
            <button type="button" class="dops-disc-link" data-dops-open-drawer="fuel_maint" data-ui-tip="Inspect diesel, lubricant & maintenance logs">${fmtNum(fmCnt)}</button>
            <button type="button" class="dops-add-btn" data-open-modal="fuel" data-ui-tip="New Diesel / Lube Issue" aria-label="New Fuel Intake">${ic('plus')}</button>
          </div>
        </div>
        ${renderPanel5FleetFuel(ctx, dm, fuelLens, isSingleCo)}
      </div>

      <!-- PANEL 6: WORKFORCE, OVERTIME & GOVERNANCE -->
      <div class="dops-card" id="dopsPlantCard">
        <div class="dops-card-hd">
          <div class="dops-card-title-wrap">
            <span class="dops-card-ico deals">${ic('payroll')}</span>
            <h2 class="dops-card-title">6 · Workforce &amp; Audit</h2>
          </div>
          <div class="dops-card-actions">
            <div class="dops-seg" role="tablist" aria-label="Workforce Lens">
              <button type="button" class="dops-seg-btn${plantLens === 'overview' || plantLens === 'team' ? ' active' : ''}" data-dops-lens="plant:overview">Team (${fmtNum(dm.activeStaffCount)})</button>
              <button type="button" class="dops-seg-btn${dm.dayRegAdds.length > 0 ? ' has-alert' : ''}${plantLens === 'master_gov' || plantLens === 'master' ? ' active' : ''}" data-dops-lens="plant:master_gov">Audit (+${fmtNum(dm.dayRegAdds.length)})</button>
            </div>
            <button type="button" class="dops-disc-link" data-dops-open-drawer="team" data-ui-tip="Inspect attendance, salaries & master records">${fmtNum(teamCnt)}</button>
            <button type="button" class="dops-add-btn" data-open-modal="attendance" data-ui-tip="New Attendance / Shift Entry" aria-label="New Attendance Entry">${ic('plus')}</button>
          </div>
        </div>
        ${renderPanel6Workforce(ctx, dm, plantLens, isSingleCo)}
      </div>
    `;
  }

  function render(ctx) {
    const { STATE, esc, ic, fmtUSD, fmtUSDk, fmtNum, coBadge } = ctx;
    const dm = buildDayModel(ctx);
    _lastDayModel = { ctx, dm, coKey: STATE.company };
    const today = ctx.todayISO();
    const yestWall = shiftIsoDays(today, -1);

    const allowedCos = ctx.allowedCompanyNames() || [];
    const isSingleCo = STATE.company !== 'manufacturing-group' && !String(STATE.company || '').startsWith('industry:') || allowedCos.length === 1;

    const qFilter = String(STATE.dailyOpsQuickFilter || 'all');
    const qSearch = String(STATE.dailyOpsQuickSearch || '');
    const drawerOpen = Boolean(STATE.dailyOpsDrawerOpen);
    const streamFilter = STATE.dailyOpsStreamFilter || 'all';
    const drawerSearch = STATE.dailyOpsDrawerSearch || '';

    // KPI 1: Sales Delta
    const salesVs7 = (dm.avg7Sales > 0 && (dm.salesSum.ttc > 0 || dm.salesSum.loads > 0))
      ? Math.round(((dm.salesSum.ttc - dm.avg7Sales) / dm.avg7Sales) * 100)
      : null;
    const salesDeltaBadge = salesVs7 != null
      ? `<span class="dops-kpi-delta ${salesVs7 >= 0 ? 'good' : (salesVs7 <= -25 ? 'warn' : 'neutral')}">${salesVs7 >= 0 ? '+' : ''}${salesVs7}% vs 7d</span>`
      : `<span class="dops-kpi-delta neutral">${dm.salesSum.loads === 0 ? '0 Dispatches' : 'Tx Date'}</span>`;

    // KPI 3: Expenses & Bills
    const topExpBill = dm.expenseBillRows[0] || null;
    const expDeltaBadge = dm.pendingExps.length > 0
      ? `<span class="dops-kpi-delta warn">${dm.pendingExps.length} Pending</span>`
      : `<span class="dops-kpi-delta ${dm.expCount > 0 ? 'neutral' : 'good'}">${fmtNum(dm.expCount)} ${dm.expCount === 1 ? 'bill' : 'bills'}</span>`;

    // KPI 4: Operating Profit %
    const profPctTxt = `${(dm.opMarginPct * 100).toFixed(1)}%`;
    const profDeltaCls = dm.operatingProfit < 0 ? 'crit' : 'good';

    // Legacy Deals value kept hidden for backward compatibility
    const dealsCountToday = dm.newPoliciesCount + dm.convItems.length + dm.loanEvents.length + dm.dayVatInvoices.length;
    const dealsValTxt = dealsCountToday > 0
      ? `${dm.newPoliciesCount} ${dm.newPoliciesCount === 1 ? 'Rule' : 'Rules'} · ${dm.convItems.length} FX`
      : `${dm.activeRulesUsed.length} ${dm.activeRulesUsed.length === 1 ? 'Rule' : 'Rules'} Used`;

    // Hover Popovers for all 6 KPI Cards
    const salesMatDisplay = ctx.round2(Number(dm.salesSum.ttc || 0) - Number(dm.salesSum.transRev || 0));
    const salesPop = JSON.stringify({
      title: `Sales & Dispatch · ${fmtHumanDay(dm.targetDate)}`,
      badge: `${fmtNum(dm.salesSum.loads)} loads`,
      rows: [
        { label: 'Total Sales Revenue', value: fmtUSD(dm.salesSum.ttc, 0), color: '#2356A8', isTotal: true },
        { label: 'Material vs Transport', value: `${fmtUSD(salesMatDisplay, 0)} + ${fmtUSD(dm.salesSum.transRev, 0)}`, color: '#4A90D9' },
        { label: 'Cash vs Credit', value: `${fmtUSD(dm.salesSum.cashTtc, 0)} / ${fmtUSD(dm.salesSum.creditTtc, 0)}`, color: '#1F7A4C' },
        { label: 'Delivery vs Pickup', value: `${dm.salesSum.deliveryLoads} Deliv · ${dm.salesSum.pickupLoads} Pickup`, color: '#C0892F' }
      ],
      footer: dm.ahSalesCount > 0 ? `Includes ${dm.ahSalesCount} Yesterday After-Hours sales · Click to inspect` : 'Click to inspect sales dispatches'
    });

    const rawPop = JSON.stringify({
      title: `Quarry, Haulage & Pricing · ${fmtHumanDay(dm.targetDate)}`,
      badge: `${fmtNum(dm.rawSum.loads)} loads`,
      rows: [
        { label: 'Total Quarry & Haulage', value: fmtUSD(dm.rawSum.totalCost, 0), color: '#C0892F', isTotal: true },
        { label: 'Quarry Material Cost', value: fmtUSD(dm.rawSum.matCost, 0), color: '#2356A8' },
        { label: 'Third-Party Haulage', value: fmtUSD(dm.rawSum.haulCost, 0), color: '#4A90D9' },
        { label: 'Rate Compliance', value: `${dm.agreedSalesLoads}/${dm.salesSum.loads} Agreed · ${dm.belowAgreedLoads} Below`, color: dm.belowAgreedLoads > 0 ? '#C8333B' : '#1F7A4C' }
      ],
      footer: 'Click to inspect quarry & haulage tickets'
    });

    const expPop = JSON.stringify({
      title: `Expenses & Stock Bills · ${fmtHumanDay(dm.targetDate)}`,
      badge: `${fmtNum(dm.expCount)} bills`,
      rows: [
        { label: 'Total Expenses', value: fmtUSD(dm.expTotal, 0), color: '#C96A22', isTotal: true },
        { label: 'Cash vs Credit Bills', value: `${fmtUSD(dm.cashExp, 0)} Cash · ${fmtUSD(dm.creditExp, 0)} Credit`, color: '#2356A8' },
        { label: 'Largest Expense Today', value: topExpBill ? `${topExpBill.supplier}: ${fmtUSD(topExpBill.amount != null ? topExpBill.amount : topExpBill.total, 0)}` : 'None', color: '#C8333B' },
        { label: 'Warehouse & Stock Items', value: `${fmtNum(dm.dayExpItems.length)} item lines`, color: '#1F7A4C' }
      ],
      footer: 'Click to inspect expense bills & stock purchases'
    });

    const profPop = JSON.stringify({
      title: `Day Operating P&L · ${fmtHumanDay(dm.targetDate)}`,
      badge: profPctTxt,
      badgeTone: dm.operatingProfit >= 0 ? 'good' : 'crit',
      rows: [
        { label: 'Sales Revenue (Ex-VAT)', value: fmtUSD(dm.salesSum.grossExVat, 0), color: '#2356A8' },
        { label: 'Less Quarry & Haulage', value: `-${fmtUSD(dm.rawSum.totalCost, 0)}`, color: '#C0892F' },
        { label: 'Less Expenses & Payroll', value: `-${fmtUSD(dm.expExVat + dm.salariesPaid + dm.salesSum.commUsd, 0)}`, color: '#C96A22' },
        { label: 'Day Operating Profit', value: fmtUSD(dm.operatingProfit, 0), color: dm.operatingProfit >= 0 ? '#1F7A4C' : '#C8333B', isTotal: true }
      ],
      footer: `7-day active average: ${fmtUSD(dm.avg7Profit, 0)}/day`
    });

    const cashPop = JSON.stringify({
      title: `Treasury & External Cash · ${fmtHumanDay(dm.targetDate)}`,
      badge: dm.netCashFlow >= 0 ? 'Net Inflow' : 'Net Outflow',
      badgeTone: dm.netCashFlow >= 0 ? 'good' : 'warn',
      rows: [
        { label: 'Cash Sales + AR Collected', value: `+${fmtUSD(dm.salesSum.cashNet + dm.arCollected, 0)}`, color: '#1F7A4C' },
        { label: 'External In / Out', value: `+${fmtUSD(dm.extInEq, 0)} / -${fmtUSD(dm.extOutEq, 0)}`, color: '#1E9E8A' },
        { label: 'AP + Cash Exp + Salaries', value: `-${fmtUSD(dm.apPaid + dm.cashExp + dm.salariesPaid, 0)}`, color: '#C96A22' },
        { label: 'Net Day Cash Flow', value: `${dm.netCashFlow >= 0 ? '+' : ''}${fmtUSD(dm.netCashFlow, 0)}`, color: '#2356A8', isTotal: true }
      ],
      footer: `Closing Till: ${fmtUSD(dm.liveTillUsd, 0)}${dm.liveTillLbp ? ' + ' + fmtCompactLbp(dm.liveTillLbp) : ''}`
    });

    const plantPop = JSON.stringify({
      title: `Plant, Diesel & Workforce · ${fmtHumanDay(dm.targetDate)}`,
      badge: `${fmtNum(dm.activeTrucksCount)} units · ${fmtNum(dm.activeStaffCount)} staff`,
      rows: [
        { label: 'Diesel Issued Today', value: `${fmtNum(dm.dieselIssuedL, 0)} L (${fmtNum(dm.dayFuels.length)} fills)`, color: '#2356A8', isTotal: true },
        { label: 'WTC Closing Diesel Tank', value: dm.closingTankL != null ? `${fmtNum(dm.closingTankL, 0)} L` : 'N/A', color: '#1F7A4C' },
        { label: 'Overtime Logged', value: `+${dm.attOtHours.toFixed(1)}h (${fmtNum(dm.attOtStaffCount)} staff · ${fmtNum(dm.salesSum.otLoads)} OT loads)`, color: '#C0892F' },
        { label: 'Fleet Dispatch Split', value: `${fmtNum(dm.companyFleetTrips)} Own · ${fmtNum(dm.haulerTrips)} 3P Hauler`, color: '#4A90D9' }
      ],
      footer: 'Click to inspect diesel, fleet & attendance'
    });

    const ahBtnTip = dm.ahAvailableCount > 0
      ? `Includes ${dm.ahSalesCount} Sales & ${dm.ahRawCount} Raw tickets from ${fmtShortDay(dm.yestDate)} logged via Yesterday's After-Hours after accountants left`
      : `Includes Sales & Raw tickets from ${fmtShortDay(dm.yestDate)} logged via Yesterday's After-Hours (0 logged for ${fmtShortDay(dm.yestDate)})`;

    const repBtnTip = dm.repShiftedCount > 0
      ? `${dm.repShiftedCount} entries transacted on ${fmtDmy(dm.targetDate)} carry a different Reporting Date. Click to filter all 6 panels to shifted entries.`
      : `0 entries on ${fmtDmy(dm.targetDate)} have a shifted Reporting Date.`;

    // Domain counts for Discrete Drawer chips
    const cntByGroup = g => dm.stream.filter(r => r.group === g).length;
    const ahCnt = dm.stream.filter(r => r.isAfterHours).length;
    const repShiftStreamCnt = dm.stream.filter(r => r.isRepShifted).length;
    const salesCnt = cntByGroup('sales');
    const rawCnt = cntByGroup('raw');
    const agrCnt = cntByGroup('agreements');
    const extCnt = cntByGroup('external');
    const fxlCnt = cntByGroup('fx_loans');
    const arapCnt = cntByGroup('ar_ap');
    const expCnt = cntByGroup('expenses');
    const fmCnt = cntByGroup('fuel_maint');
    const teamCnt = cntByGroup('team');

    // Multi-Entity BU Attribution Strip when viewing All Group
    const buStripHtml = (!isSingleCo && dm.entityRows && dm.entityRows.length > 1)
      ? `<div class="dops-bu-strip" id="dopsBuStrip" aria-label="Business Unit Attribution">
          ${dm.entityRows.map(r => {
            const active = r.salesTtc > 0 || r.outlay > 0 || r.salesLoads > 0 || r.rawLoads > 0 || r.netCash !== 0;
            return `<button type="button" class="dops-bu-pill${active ? ' is-active' : ' is-idle'}" data-jump-co="${esc(r.key)}" data-ui-tip="Filter Daily Operations to ${esc(r.name)}: Sales ${fmtUSD(r.salesTtc, 0)} · Outlay ${fmtUSD(r.outlay, 0)} · Op Profit ${fmtUSD(r.opProfit, 0)}">
              ${coBadge(r.name)}
              <span class="dops-bu-val">${fmtUSD(r.salesTtc, 0)}</span>
              ${active ? `<span class="dops-bu-prof ${r.opProfit >= 0 ? 'pos' : 'neg'}">${r.opProfit >= 0 ? '+' : ''}${fmtUSD(r.opProfit, 0)}</span>` : ''}
            </button>`;
          }).join('')}
        </div>`
      : '';

    return `
      <div class="dops-stage" id="dailyOpsStage" data-target-date="${esc(dm.targetDate)}" data-include-ah="${dm.includeAh ? '1' : '0'}">
        <!-- BAND 1: EXECUTIVE DAY, BU ATTRIBUTION, SPOTLIGHT FILTER, REP-DATE SHIFT & DISCRETE RECORDS BAR -->
        <div class="dops-bar" id="dopsHeaderBar">
          <div class="dops-bar-left">
            <div class="dops-title-group">
              <h1 class="dops-page-title cockpit-title">Daily Operations</h1>
              <span class="dops-active-date-lbl" id="dopsActiveDateLabel">${esc(fmtHumanDay(dm.targetDate))}</span>
              <span class="dops-basis-tag" id="dopsTxBasisBadge" data-ui-tip="Always anchored to physical Transaction Date regardless of whether the global system filter is set to Reporting Date or Transaction Date.">${ic('lock')} <span>Tx Date<span class="dops-basis-long"> Basis</span></span></span>
              ${buStripHtml}
            </div>
          </div>

          <div class="dops-bar-controls">
            <div class="dops-qsearch-wrap${qSearch ? ' has-val' : ''}" id="dopsQuickSearchWrap">
              <span class="dops-qsearch-ico" aria-hidden="true">${ic('search')}</span>
              <input type="search" id="dopsQuickSearchInput" class="dops-qsearch-input" placeholder="Filter day..." value="${esc(qSearch)}" autocomplete="off" aria-label="Spotlight filter across all 6 panels">
              <button type="button" class="dops-qsearch-clear" id="dopsQuickSearchClear" aria-label="Clear filter"${qSearch ? '' : ' hidden'}>&times;</button>
            </div>

            <button type="button" class="dops-filter-pill rep-shift${qFilter === 'rep_shifted' ? ' active' : ''}${dm.repShiftedCount > 0 ? ' has-items' : ''}" id="dopsRepShiftBtn" data-dops-qfilter="rep_shifted" aria-pressed="${qFilter === 'rep_shifted' ? 'true' : 'false'}" data-ui-tip="${esc(repBtnTip)}">
              ${ic('rep_shift')}
              <span class="dops-fp-lbl">Rep Diff</span>
              <span class="dops-fp-cnt">${fmtNum(dm.repShiftedCount)}</span>
            </button>

            ${dm.exceptionCount > 0 || qFilter === 'exceptions' ? `
              <button type="button" class="dops-filter-pill exc${qFilter === 'exceptions' ? ' active' : ''}" id="dopsExcFilterBtn" data-dops-qfilter="exceptions" aria-pressed="${qFilter === 'exceptions' ? 'true' : 'false'}" data-ui-tip="Filter all 6 panels to actionable exceptions (${dm.exceptionCount}: below-rate dispatches, pending prices, tank variances, critical defects, or absences)">
                ${ic('warn')}
                <span class="dops-fp-cnt">${fmtNum(dm.exceptionCount)}</span>
              </button>
            ` : ''}

            <button type="button" class="dops-afterhours-btn${dm.includeAh ? ' active' : ''}" id="dopsAfterHoursBtn" aria-pressed="${dm.includeAh ? 'true' : 'false'}" data-ui-tip="${esc(ahBtnTip)}">
              ${ic('moon')}
              <span><span class="dops-ah-prefix">Yesterday's </span>After-Hours</span>
              <span class="dops-ah-count${dm.ahAvailableCount > 0 ? ' has-items' : ''}" id="dopsAfterHoursCount">${dm.ahAvailableCount > 0 ? `+${fmtNum(dm.ahAvailableCount)} · ${fmtUSDk(dm.ahAvailableUsd)}` : '0'}</span>
            </button>

            <div class="dops-quick-pills" role="group" aria-label="Quick Day Presets">
              <button type="button" class="dops-qpill${dm.targetDate === today ? ' active' : ''}" data-dops-pick-date="${esc(today)}">Today</button>
              <button type="button" class="dops-qpill${dm.targetDate === yestWall ? ' active' : ''}" data-dops-pick-date="${esc(yestWall)}">Yesterday</button>
              ${dm.idx.latestOpDate && dm.idx.latestOpDate !== today && dm.idx.latestOpDate !== yestWall ? `<button type="button" class="dops-qpill${dm.targetDate === dm.idx.latestOpDate ? ' active' : ''}" data-dops-pick-date="${esc(dm.idx.latestOpDate)}">Latest (${esc(fmtShortDay(dm.idx.latestOpDate))})</button>` : ''}
            </div>

            <div class="dops-day-nav" role="group" aria-label="Step Operating Day">
              <button type="button" class="dops-step-btn" id="dopsPrevDayBtn" ${dm.prevDate ? `data-dops-pick-date="${esc(dm.prevDate)}"` : 'disabled'} aria-label="Previous Day">&lsaquo;</button>
              <input type="date" id="dopsDateInput" class="dops-date-input" min="${esc(ctx.MIN_DATE)}" max="${esc(ctx.MAX_DATE)}" value="${esc(dm.targetDate)}" aria-label="Operating Transaction Date">
              <button type="button" class="dops-step-btn" id="dopsNextDayBtn" ${dm.nextDate ? `data-dops-pick-date="${esc(dm.nextDate)}"` : 'disabled'} aria-label="Next Day">&rsaquo;</button>
            </div>

            <button type="button" class="dops-briefing-btn" id="dopsBriefingBtn" data-dops-briefing="1" aria-pressed="false" aria-label="Listen to Daily Briefing" data-ui-tip="Play a 20-second spoken summary of the selected day's revenue, cash till, and active Sentinel flags">
              ${ic('audio')}
              <span class="dops-brief-lbl">Listen to Daily Briefing</span>
            </button>

            <button type="button" class="dops-records-trigger" id="dopsOpenRecordsBtn" data-dops-open-drawer="all" data-ui-tip="Open discrete Day Records Drawer to search and inspect individual entries across all tables.">
              ${ic('ledger')}
              <span class="dops-rec-lbl">Records</span>
              <span class="dops-records-trigger-cnt" id="dopsTotalRecordsCount">${fmtNum(dm.stream.length)}</span>
            </button>
          </div>
        </div>

        <!-- BAND 2: 6-PILLAR CEO EXECUTIVE SCORECARD -->
        <section class="dops-kpis" id="dopsKpiGrid" aria-label="Daily Shareholder Scorecard">
          <div class="dops-kpi accent-sales" data-dops-open-drawer="sales" data-chart-pop="${esc(salesPop)}" role="button" tabindex="0">
            <div class="dops-kpi-top">
              <span class="dops-kpi-lbl">Sales (TTC)</span>
              ${salesDeltaBadge}
            </div>
            <div class="dops-kpi-val-row">
              <span class="dops-kpi-val" id="dopsKpiSalesVal">${fmtUSD(dm.salesSum.ttc, 0)}</span>
              <span class="dops-kpi-unit">${fmtNum(dm.salesSum.loads)} loads · ${fmtNum(dm.salesSum.m3, 0)} m³ · ${fmtNum(dm.customerRows.length)} clients</span>
            </div>
            <div class="dops-kpi-sub">
              ${dm.includeAh && dm.salesAhSum.count > 0
                ? `<span class="dops-kpi-ah">${ic('moon')} +${fmtUSD(dm.salesAhSum.ttc, 0)} (${dm.salesAhSum.loads})</span> · Today <b>${fmtUSD(dm.salesTodayOnly.ttc, 0)}</b>`
                : `Cash <b>${dm.salesSum.cashTtc >= 1000 ? fmtUSDk(dm.salesSum.cashTtc) : fmtUSD(dm.salesSum.cashTtc, 0)}</b> · Cr <b>${dm.salesSum.creditTtc >= 1000 ? fmtUSDk(dm.salesSum.creditTtc) : fmtUSD(dm.salesSum.creditTtc, 0)}</b> · <b>${fmtUSD(dm.salesSum.avgPriceTtc, 1)}/m³</b>`}
            </div>
          </div>

          <div class="dops-kpi accent-raw" data-dops-open-drawer="raw" data-chart-pop="${esc(rawPop)}" role="button" tabindex="0">
            <div class="dops-kpi-top">
              <span class="dops-kpi-lbl">Quarry &amp; Haul</span>
              <span class="dops-kpi-delta ${dm.belowAgreedLoads > 0 ? 'crit' : 'neutral'}">${dm.belowAgreedLoads > 0 ? `${dm.belowAgreedLoads} Below Rate` : `${fmtNum(dm.rawSum.tons, 0)} t`}</span>
            </div>
            <div class="dops-kpi-val-row">
              <span class="dops-kpi-val" id="dopsKpiRawVal">${fmtUSD(dm.rawSum.totalCost, 0)}</span>
              <span class="dops-kpi-unit">${fmtNum(dm.rawSum.loads)} loads · ${fmtNum(dm.rawSum.m3, 0)} m³</span>
            </div>
            <div class="dops-kpi-sub">
              Mat <b>${fmtUSD(dm.rawSum.matCost, 0)}</b> · Haul <b>${fmtUSD(dm.rawSum.haulCost, 0)}</b> · Agreed <b>${dm.agreedSalesLoads}/${dm.salesSum.loads}</b>
            </div>
          </div>

          <div class="dops-kpi accent-exp" data-dops-open-drawer="expenses" data-chart-pop="${esc(expPop)}" role="button" tabindex="0">
            <div class="dops-kpi-top">
              <span class="dops-kpi-lbl">Expenses &amp; Bills</span>
              ${expDeltaBadge}
            </div>
            <div class="dops-kpi-val-row">
              <span class="dops-kpi-val" id="dopsKpiExpVal">${fmtUSD(dm.expTotal, 0)}</span>
              <span class="dops-kpi-unit">${fmtNum(dm.expCount)} bills · ${fmtNum(dm.dayExpItems.length)} items</span>
              <span id="dopsKpiDealsVal" hidden>${esc(dealsValTxt)}</span>
            </div>
            <div class="dops-kpi-sub">
              Cash <b>${fmtUSD(dm.cashExp, 0)}</b> · Cr <b>${fmtUSD(dm.creditExp, 0)}</b>${topExpBill ? ` · Top <b>${esc(topExpBill.supplier)}</b>` : ''}
            </div>
          </div>

          <div class="dops-kpi accent-profit${dm.operatingProfit < 0 ? ' is-neg' : ''}" data-dops-lens="exp:bills" data-chart-pop="${esc(profPop)}" role="button" tabindex="0">
            <div class="dops-kpi-top">
              <span class="dops-kpi-lbl">Operating Profit</span>
              <span class="dops-kpi-delta ${profDeltaCls}">${esc(profPctTxt)}</span>
            </div>
            <div class="dops-kpi-val-row">
              <span class="dops-kpi-val ${dm.operatingProfit < 0 ? 'crit' : ''}" id="dopsKpiProfitVal">${fmtUSD(dm.operatingProfit, 0)}</span>
              <span class="dops-kpi-unit">GM ${fmtUSD(dm.grossMargin, 0)}</span>
            </div>
            <div class="dops-kpi-sub">
              Ex-VAT <b>${fmtUSD(dm.salesSum.grossExVat, 0)}</b> · VAT <b>${fmtUSD(dm.salesSum.vat, 0)}</b>${dm.avg7Profit ? ` · 7d <b>${fmtUSD(dm.avg7Profit, 0)}</b>` : ''}
            </div>
          </div>

          <div class="dops-kpi accent-cash" data-dops-lens="treasury:bridge" data-chart-pop="${esc(cashPop)}" role="button" tabindex="0">
            <div class="dops-kpi-top">
              <span class="dops-kpi-lbl">Treasury &amp; Cash</span>
              <span class="dops-kpi-delta ${dm.netCashFlow > 0 ? 'good' : (dm.netCashFlow < 0 ? 'warn' : 'neutral')}">${dm.netCashFlow > 0 ? 'Net In' : (dm.netCashFlow < 0 ? 'Net Out' : 'Even')}</span>
            </div>
            <div class="dops-kpi-val-row">
              <span class="dops-kpi-val" id="dopsKpiCashVal">${dm.netCashFlow > 0 ? '+' : ''}${fmtUSD(dm.netCashFlow, 0)}</span>
              <span class="dops-kpi-unit">In ${fmtUSDk(dm.cashInflow)} · Out ${fmtUSDk(dm.cashOutflow)}</span>
            </div>
            <div class="dops-kpi-sub">
              AR <b>+${fmtUSDk(dm.arCollected)}</b> · Ext <b>+${fmtUSDk(dm.extInEq)}/-${fmtUSDk(dm.extOutEq)}</b> · Till <b>${fmtUSD(dm.liveTillUsd, 0)}</b>
            </div>
          </div>

          <div class="dops-kpi accent-plant" data-dops-lens="fuel:units" data-chart-pop="${esc(plantPop)}" role="button" tabindex="0">
            <div class="dops-kpi-top">
              <span class="dops-kpi-lbl">Plant, Fuel &amp; Team</span>
              <span class="dops-kpi-delta ${dm.openCritDefects.length > 0 ? 'crit' : (dm.absentCount > 0 ? 'warn' : 'neutral')}">${dm.openCritDefects.length > 0 ? `${dm.openCritDefects.length} Crit` : (dm.absentCount > 0 ? `${dm.absentCount} Absent` : `${fmtNum(dm.activeStaffCount)} Staff`)}</span>
            </div>
            <div class="dops-kpi-val-row">
              <span class="dops-kpi-val" id="dopsKpiPlantVal">${fmtNum(dm.activeTrucksCount)} Units</span>
              <span class="dops-kpi-unit">${fmtNum(dm.dieselIssuedL, 0)} L · +${dm.attOtHours.toFixed(0)}h OT</span>
            </div>
            <div class="dops-kpi-sub">
              ${dm.closingTankL != null ? `Tank <b>${fmtNum(dm.closingTankL, 0)} L</b> · ` : ''}Own <b>${fmtNum(dm.companyFleetTrips)}</b> · 3P <b>${fmtNum(dm.haulerTrips)}</b> · <b>${fmtNum(dm.activeStaffCount)}</b> Staff
            </div>
          </div>
        </section>

        <!-- BAND 3: 6-PANEL CEO INSIGHT BOARD (3x2 ON DESKTOP, FULL ITEMIZED BREAKDOWN) -->
        <div class="dops-bento-grid" id="dopsBentoGrid">
          ${renderBentoGridHtml(ctx, dm, isSingleCo)}
        </div>

        <!-- DISCRETE SLIDE-OVER DAY RECORDS DRAWER (0px ON MAIN CANVAS WHEN CLOSED) -->
        <div class="dops-drawer-layer${drawerOpen ? ' is-open' : ''}" id="dopsRecordsDrawer" aria-hidden="${drawerOpen ? 'false' : 'true'}">
          <div class="dops-drawer-backdrop" id="dopsDrawerBackdrop"></div>
          <aside class="dops-drawer-panel" id="dopsStreamCard" role="dialog" aria-modal="true" aria-labelledby="dopsDrawerTitle">
            <div class="dops-drawer-hd">
              <div>
                <h2 class="dops-drawer-title" id="dopsDrawerTitle">Day Records Ledger · ${esc(fmtHumanDay(dm.targetDate))}</h2>
                <div class="dops-drawer-sub">Strict Transaction Date Basis${dm.includeAh && ahCnt > 0 ? ` · Includes ${ahCnt} Yesterday After-Hours` : ''}${repShiftStreamCnt > 0 ? ` · ${repShiftStreamCnt} Rep-Shifted` : ''} · Click any row to edit</div>
              </div>
              <button type="button" class="dops-drawer-close" id="dopsCloseDrawerBtn" aria-label="Close Day Records Drawer">&times;</button>
            </div>
            <div class="dops-drawer-tools">
              <input type="search" id="dopsDrawerSearchInput" class="dops-drawer-search" placeholder="Search ticket #, counterparty, agreement, note, item..." value="${esc(drawerSearch)}" autocomplete="off" aria-label="Filter day records">
              <div class="dops-drawer-chips" id="dopsDrawerChips" role="tablist" aria-label="Record Domain Filter">
                <button type="button" class="dops-dchip${streamFilter === 'all' ? ' active' : ''}" data-dops-stream="all">All (${fmtNum(dm.stream.length)})</button>
                <button type="button" class="dops-dchip is-rep-tab${repShiftStreamCnt > 0 ? ' has-rep' : ''}${streamFilter === 'rep_shifted' ? ' active' : ''}" data-dops-stream="rep_shifted">${ic('rep_shift')} Rep-Shifted (${fmtNum(repShiftStreamCnt)})</button>
                <button type="button" class="dops-dchip is-ah-tab${ahCnt > 0 ? ' has-ah' : ''}${streamFilter === 'after_hours' ? ' active' : ''}" data-dops-stream="after_hours">After-Hours (${fmtNum(ahCnt)})</button>
                <button type="button" class="dops-dchip${streamFilter === 'sales' ? ' active' : ''}" data-dops-stream="sales">Sales (${fmtNum(salesCnt)})</button>
                <button type="button" class="dops-dchip${streamFilter === 'raw' ? ' active' : ''}" data-dops-stream="raw">Quarry (${fmtNum(rawCnt)})</button>
                <button type="button" class="dops-dchip${streamFilter === 'agreements' ? ' active' : ''}" data-dops-stream="agreements">Agreements (${fmtNum(agrCnt)})</button>
                <button type="button" class="dops-dchip${streamFilter === 'external' ? ' active' : ''}" data-dops-stream="external">External (${fmtNum(extCnt)})</button>
                <button type="button" class="dops-dchip${streamFilter === 'fx_loans' ? ' active' : ''}" data-dops-stream="fx_loans">FX &amp; Loans (${fmtNum(fxlCnt)})</button>
                <button type="button" class="dops-dchip${streamFilter === 'ar_ap' ? ' active' : ''}" data-dops-stream="ar_ap">AR / AP (${fmtNum(arapCnt)})</button>
                <button type="button" class="dops-dchip${streamFilter === 'expenses' ? ' active' : ''}" data-dops-stream="expenses">Exp &amp; Stock (${fmtNum(expCnt)})</button>
                <button type="button" class="dops-dchip${streamFilter === 'fuel_maint' ? ' active' : ''}" data-dops-stream="fuel_maint">Fuel &amp; Maint (${fmtNum(fmCnt)})</button>
                <button type="button" class="dops-dchip${streamFilter === 'team' ? ' active' : ''}" data-dops-stream="team">Team (${fmtNum(teamCnt)})</button>
              </div>
            </div>
            <div class="dops-drawer-scroll" id="dopsStreamScroll">
              ${renderDrawerTableHtml(ctx, dm, streamFilter, drawerSearch, isSingleCo)}
            </div>
          </aside>
        </div>
      </div>
    `;
  }

  function wire(container, ctx) {
    if (!container) return;
    const { STATE, renderApp, showRecordInspector, stripNativeTitles } = ctx;
    const stage = container.querySelector('#dailyOpsStage');
    if (!stage) return;

    if (window.MFG_ASK && typeof window.MFG_ASK.rebindBriefingButton === 'function') {
      window.MFG_ASK.rebindBriefingButton(stage.querySelector('#dopsBriefingBtn'), stage.getAttribute('data-target-date') || '');
    }

    const refreshBentoInPlace = () => {
      if (!_lastDayModel) {
        renderApp();
        return;
      }
      const { ctx: lCtx, dm: lDm } = _lastDayModel;
      const bentoEl = stage.querySelector('#dopsBentoGrid');
      if (!bentoEl) {
        renderApp();
        return;
      }
      const allowedCos = lCtx.allowedCompanyNames() || [];
      const isSingleCo = STATE.company !== 'manufacturing-group' && !String(STATE.company || '').startsWith('industry:') || allowedCos.length === 1;
      bentoEl.innerHTML = renderBentoGridHtml(lCtx, lDm, isSingleCo);
      if (typeof stripNativeTitles === 'function') stripNativeTitles(bentoEl);
      if (window.MFG_I18N && typeof window.MFG_I18N.apply === 'function' && STATE.lang && STATE.lang !== 'en') {
        try { window.MFG_I18N.apply(bentoEl); } catch (_) {}
      }
      // Sync header filter button states without touching focused input
      const qf = String(STATE.dailyOpsQuickFilter || 'all');
      const repBtn = stage.querySelector('#dopsRepShiftBtn');
      if (repBtn) {
        repBtn.classList.toggle('active', qf === 'rep_shifted');
        repBtn.setAttribute('aria-pressed', qf === 'rep_shifted' ? 'true' : 'false');
      }
      const excBtn = stage.querySelector('#dopsExcFilterBtn');
      if (excBtn) {
        excBtn.classList.toggle('active', qf === 'exceptions');
        excBtn.setAttribute('aria-pressed', qf === 'exceptions' ? 'true' : 'false');
      }
    };

    const toggleAh = () => {
      STATE.dailyOpsIncludeAfterHours = STATE.dailyOpsIncludeAfterHours === false;
      renderApp();
    };

    // Single clean delegated listener on #dailyOpsStage (handles dynamic in-place bento patches too)
    stage.addEventListener('click', ev => {
      const t = ev.target;
      if (!t || typeof t.closest !== 'function') return;

      // Let global workspace delegation handle lookup links, thermal print slips, + modals, and BU jumps
      if (t.closest('[data-rel-key], [data-print-ticket], [data-open-modal], [data-jump-co], a')) return;

      // 0. 1-Tap Spoken Executive Daily Briefing ([data-dops-briefing])
      const briefBtn = t.closest('[data-dops-briefing]');
      if (briefBtn && stage.contains(briefBtn)) {
        ev.preventDefault();
        if (window.MFG_ASK && typeof window.MFG_ASK.speakDailyBriefing === 'function') {
          window.MFG_ASK.speakDailyBriefing(briefBtn);
        }
        return;
      }

      // 1. Inline Accordion Group Row Expand/Collapse ([data-dops-expand])
      const expEl = t.closest('[data-dops-expand]');
      if (expEl && stage.contains(expEl)) {
        ev.preventDefault();
        const k = expEl.getAttribute('data-dops-expand');
        if (k) {
          if (!STATE.dailyOpsExpanded) STATE.dailyOpsExpanded = {};
          STATE.dailyOpsExpanded[k] = !STATE.dailyOpsExpanded[k];
          refreshBentoInPlace();
        }
        return;
      }

      // 2. Cross-Panel Quick Filter Toggle ([data-dops-qfilter])
      const qfEl = t.closest('[data-dops-qfilter]');
      if (qfEl && stage.contains(qfEl)) {
        ev.preventDefault();
        const val = qfEl.getAttribute('data-dops-qfilter') || 'all';
        STATE.dailyOpsQuickFilter = (STATE.dailyOpsQuickFilter === val) ? 'all' : val;
        refreshBentoInPlace();
        return;
      }

      // 3. Date navigation ([data-dops-pick-date])
      const pickEl = t.closest('[data-dops-pick-date]');
      if (pickEl && stage.contains(pickEl)) {
        ev.preventDefault();
        const dt = pickEl.getAttribute('data-dops-pick-date');
        if (dt && /^\d{4}-\d{2}-\d{2}$/.test(dt)) {
          STATE.dailyOpsDate = dt;
          renderApp();
        }
        return;
      }

      // 4. Yesterday's After-Hours toggle
      if (t.closest('#dopsAfterHoursBtn, [data-dops-toggle-ah]')) {
        ev.preventDefault();
        toggleAh();
        return;
      }

      // 5. Interactive Sub-Lens switchers across all 6 Panels ([data-dops-lens])
      const lensEl = t.closest('[data-dops-lens]');
      if (lensEl && stage.contains(lensEl)) {
        ev.preventDefault();
        const spec = String(lensEl.getAttribute('data-dops-lens') || '');
        const [quad, tab] = spec.split(':');
        if (!quad || !tab) return;
        if (quad === 'comm') STATE.dailyOpsCommLens = tab;
        else if (quad === 'deals') STATE.dailyOpsDealsLens = tab;
        else if (quad === 'exp') STATE.dailyOpsExpLens = tab;
        else if (quad === 'treasury') STATE.dailyOpsTreasuryLens = tab;
        else if (quad === 'fuel') STATE.dailyOpsFuelLens = tab;
        else if (quad === 'plant') {
          if (tab === 'exp_stock') STATE.dailyOpsExpLens = 'bills';
          else if (tab === 'fuel_maint') STATE.dailyOpsFuelLens = 'fuel_maint';
          else STATE.dailyOpsPlantLens = tab;
        }
        refreshBentoInPlace();
        return;
      }

      // 6. Non-table interactive cards/chips opening 360 Record Inspector directly
      const inspEl = t.closest('[data-dops-inspect-rkey]');
      if (inspEl && stage.contains(inspEl) && typeof showRecordInspector === 'function') {
        if (t.closest('button')) return;
        ev.preventDefault();
        const rk = inspEl.getAttribute('data-dops-inspect-rkey');
        const rid = inspEl.getAttribute('data-dops-inspect-rid');
        if (rk && rid) showRecordInspector(rk, rid);
        return;
      }

      // 7. Open Discrete Day Records Drawer ([data-dops-open-drawer])
      const openDrEl = t.closest('[data-dops-open-drawer]');
      if (openDrEl && stage.contains(openDrEl)) {
        ev.preventDefault();
        STATE.dailyOpsStreamFilter = openDrEl.getAttribute('data-dops-open-drawer') || 'all';
        STATE.dailyOpsDrawerOpen = true;
        renderApp();
        return;
      }

      // 8. Domain Filter Chips inside Discrete Drawer ([data-dops-stream])
      const streamEl = t.closest('[data-dops-stream]');
      if (streamEl && stage.contains(streamEl)) {
        ev.preventDefault();
        STATE.dailyOpsStreamFilter = streamEl.getAttribute('data-dops-stream') || 'all';
        STATE.dailyOpsDrawerOpen = true;
        renderApp();
      }
    });

    // Keyboard accessibility (Enter / Space) on accordion group rows
    stage.addEventListener('keydown', ev => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const t = ev.target;
      if (!t || typeof t.closest !== 'function') return;
      if (t.matches && t.matches('input, select, textarea, button, a')) return;
      const expEl = t.closest('[data-dops-expand]');
      if (expEl && stage.contains(expEl)) {
        ev.preventDefault();
        const k = expEl.getAttribute('data-dops-expand');
        if (k) {
          if (!STATE.dailyOpsExpanded) STATE.dailyOpsExpanded = {};
          STATE.dailyOpsExpanded[k] = !STATE.dailyOpsExpanded[k];
          refreshBentoInPlace();
        }
      }
    });

    const dateInp = stage.querySelector('#dopsDateInput');
    if (dateInp) {
      dateInp.addEventListener('change', () => {
        const v = String(dateInp.value || '').slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v >= ctx.MIN_DATE && v <= ctx.MAX_DATE) {
          STATE.dailyOpsDate = v;
          renderApp();
        }
      });
    }

    // Focus-Preserving Cross-Panel Spotlight Search (#dopsQuickSearchInput)
    const qInp = stage.querySelector('#dopsQuickSearchInput');
    const qWrap = stage.querySelector('#dopsQuickSearchWrap');
    const qClr = stage.querySelector('#dopsQuickSearchClear');
    if (qInp) {
      qInp.addEventListener('input', () => {
        STATE.dailyOpsQuickSearch = qInp.value || '';
        if (qWrap) qWrap.classList.toggle('has-val', Boolean(STATE.dailyOpsQuickSearch));
        if (qClr) qClr.hidden = !STATE.dailyOpsQuickSearch;
        refreshBentoInPlace();
      });
      qInp.addEventListener('keydown', ev => {
        if (ev.key === 'Escape' && qInp.value) {
          ev.stopPropagation();
          qInp.value = '';
          STATE.dailyOpsQuickSearch = '';
          if (qWrap) qWrap.classList.remove('has-val');
          if (qClr) qClr.hidden = true;
          refreshBentoInPlace();
        }
      });
    }
    if (qClr && qInp) {
      qClr.addEventListener('click', ev => {
        ev.preventDefault();
        qInp.value = '';
        STATE.dailyOpsQuickSearch = '';
        if (qWrap) qWrap.classList.remove('has-val');
        qClr.hidden = true;
        refreshBentoInPlace();
        qInp.focus({ preventScroll: true });
      });
    }

    const closeDrawer = () => {
      if (!STATE.dailyOpsDrawerOpen) return;
      STATE.dailyOpsDrawerOpen = false;
      renderApp();
    };
    const closeBtn = stage.querySelector('#dopsCloseDrawerBtn');
    const backdrop = stage.querySelector('#dopsDrawerBackdrop');
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
    if (backdrop) backdrop.addEventListener('click', closeDrawer);

    if (!window.__dopsEscBound) {
      window.__dopsEscBound = true;
      document.addEventListener('keydown', ev => {
        if (ev.key !== 'Escape' || STATE.view !== 'daily_ops') return;
        const insp = document.getElementById('recordInspector');
        if (insp && (insp.classList.contains('open') || !insp.hidden)) return;
        const em = document.getElementById('entryModal');
        if (em && !em.hidden) return;
        if (STATE.dailyOpsDrawerOpen) {
          STATE.dailyOpsDrawerOpen = false;
          renderApp();
          return;
        }
        if (window.MFG_ASK && typeof window.MFG_ASK.stopBriefingIfActive === 'function') {
          window.MFG_ASK.stopBriefingIfActive();
        }
      });
    }

    // Live Search inside Discrete Drawer (patches #dopsStreamScroll only so input focus never drops!)
    const searchInp = stage.querySelector('#dopsDrawerSearchInput');
    const scrollBox = stage.querySelector('#dopsStreamScroll');
    if (searchInp && scrollBox) {
      searchInp.addEventListener('input', () => {
        STATE.dailyOpsDrawerSearch = searchInp.value || '';
        if (!_lastDayModel) return;
        const { ctx: lCtx, dm: lDm } = _lastDayModel;
        const allowedCos = lCtx.allowedCompanyNames() || [];
        const isSingleCo = STATE.company !== 'manufacturing-group' && !String(STATE.company || '').startsWith('industry:') || allowedCos.length === 1;
        scrollBox.innerHTML = renderDrawerTableHtml(lCtx, lDm, STATE.dailyOpsStreamFilter || 'all', STATE.dailyOpsDrawerSearch, isSingleCo);
        if (typeof stripNativeTitles === 'function') stripNativeTitles(scrollBox);
      });
    }
  }

  window.MFG_DAILY_OPS = {
    isAfterHoursTicket,
    fmtHumanDay,
    buildDayModel,
    getLastDayModel: () => _lastDayModel,
    buildBriefing: lang => (window.MFG_ASK && typeof window.MFG_ASK.buildDailyBriefing === 'function' ? window.MFG_ASK.buildDailyBriefing(lang) : null),
    render,
    wire
  };
})();
