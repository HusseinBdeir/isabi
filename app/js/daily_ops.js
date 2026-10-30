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
    return String(raw || '').replace(/[\u2014\u2013]/g, '-').replace(/[\u2190-\u21FF\u25B8]/g, 'to').replace(/\s+/g, ' ').trim();
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

    // Universal Registry additions logged via app (entered_at / created_at)
    const regAdditionsByDate = new Map();
    const regSpecs = [
      ['customers', 'New Customer'],
      ['suppliers', 'New Supplier'],
      ['sites', 'New Site'],
      ['products', 'New Product'],
      ['equipment', 'New Equipment'],
      ['drivers', 'New Driver']
    ];
    for (let sIdx = 0; sIdx < regSpecs.length; sIdx++) {
      const [rk, lbl] = regSpecs[sIdx];
      const list = Array.isArray(rec[rk]) ? rec[rk] : [];
      for (let i = 0; i < list.length; i++) {
        const row = list[i];
        if (!row || row.voided) continue;
        const d = enteredDateOf(row);
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
    if (up > 0) rateBits.push(`${ctx.fmtUSD(up, 2)}/${uom}`);
    if (tp > 0) rateBits.push(`Haul ${ctx.fmtUSD(tp, 2)}/${uom}`);
    if (!rateBits.length && ind > 0) rateBits.push(`Flat ${ctx.fmtUSD(ind, 0)}/Truck`);
    return {
      badge,
      party,
      sub: subBits.join(' · '),
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
    let expTotal = 0, expExVat = 0, cashExp = 0, creditExp = 0, cashExpLbp = 0, expCount = 0;
    const pendingExps = [];
    const expCatMap = new Map();
    for (let i = 0; i < dayExps.length; i++) {
      const x = dayExps[i];
      if (ctx.isPendingPriceExpense(x)) pendingExps.push(x);
      const sgn = ctx.expenseSign(x);
      if (sgn === 0 && !ctx.isPendingPriceExpense(x)) continue;
      if (sgn !== 0) expCount += 1;
      const a = Number(x.amount || 0) * (sgn || 1);
      expTotal += a;
      if (ctx.expenseKind(x) !== 'VAT') expExVat += a;
      if (ctx.isApCreditExpense(x)) creditExp += a;
      else if (ctx.isCashExpense(x)) {
        cashExp += a;
        cashExpLbp += Number(x.lbp_amount || 0) * (sgn || 1);
      }
      const catLbl = [x.category, x.subcategory].filter(Boolean).join(' · ') || 'General Expense';
      const ck = norm(catLbl);
      let cur = expCatMap.get(ck);
      if (!cur) {
        cur = { label: catLbl, category: x.category || 'General', count: 0, method: x.method || 'Cash', amount: 0, pending: 0, sampleId: x.id };
        expCatMap.set(ck, cur);
      }
      cur.count += 1;
      if (ctx.isPendingPriceExpense(x)) cur.pending += 1;
      cur.amount = round2(cur.amount + a);
    }
    expTotal = round2(expTotal);
    expExVat = round2(expExVat);
    cashExp = round2(cashExp);
    creditExp = round2(creditExp);
    const expCategoryRows = Array.from(expCatMap.values()).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

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
    const dayRegAdds = idx.regAdditionsByDate.get(targetDate) || [];

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
    let attOtHours = 0, absentCount = 0, presentAttCount = 0;
    dayAtt.forEach(a => {
      const st = String(a.status || a.type || '').toLowerCase();
      if (/absent|leave|off|sick/.test(st) || Number(a.leave_days || 0) > 0) {
        absentCount += 1;
      } else {
        presentAttCount += 1;
        if (a.staff) activeStaffSet.add(norm(a.staff));
      }
      attOtHours += Number(a.overtime_hours || 0);
    });
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
        const r = list[i];
        if (r.rep_date && String(r.rep_date).slice(0, 10) !== txDateOf(r)) repShiftedCount += 1;
      }
    };
    countRepDiff(daySales);
    countRepDiff(dayRaw);
    countRepDiff(dayExps);
    countRepDiff(dayRcpts);
    countRepDiff(daySets);
    countRepDiff(dayFuels);

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
        cur = { name: s.customer, loads: 0, ahLoads: 0, m3: 0, ttc: 0, cashTtc: 0, creditTtc: 0, collected: 0 };
        custMap.set(ck, cur);
      }
      if (sgn === 1) {
        cur.loads += 1;
        if (ahIdSet.has(s.id)) cur.ahLoads += 1;
      }
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
        cur = { name: r.customer, loads: 0, ahLoads: 0, m3: 0, ttc: 0, cashTtc: 0, creditTtc: 0, collected: 0 };
        custMap.set(ck, cur);
      }
      cur.collected = round2(cur.collected + Number(r.amount || 0) + Number(r.discount || 0));
    });
    const customerRows = Array.from(custMap.values()).sort((a, b) => (b.ttc - a.ttc) || (b.collected - a.collected));

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
        isAfterHours: false, txDate: targetDate, time: '',
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
        isAfterHours: false, txDate: targetDate, time: '',
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
        isAfterHours: false, txDate: targetDate, time: '',
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
        isAfterHours: false, txDate: targetDate, time: '',
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
        isAfterHours: isAh, txDate: txDateOf(s), time: String(s.time || '').slice(0, 5),
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
        isAfterHours: isAh, txDate: txDateOf(r), time: String(r.time || '').slice(0, 5),
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
        isAfterHours: false, txDate: targetDate, time: '',
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
        isAfterHours: false, txDate: targetDate, time: '',
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
        isAfterHours: false, txDate: targetDate, time: '',
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
        isAfterHours: false, txDate: txDateOf(r), time: '',
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
        isAfterHours: false, txDate: txDateOf(s), time: '',
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
        isAfterHours: false, txDate: txDateOf(x), time: '',
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
        isAfterHours: false, txDate: targetDate, time: '',
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
        isAfterHours: false, txDate: txDateOf(fl), time: '',
        ref: fl.ticket_no ? `#${fl.ticket_no}` : compactRef(fl.name, fl.id, 'FL'),
        party: fl.equipment || 'Plant Tank', detail: [itemStr, fl.driver].filter(Boolean).join(' · '),
        qtyTxt: `${ctx.fmtNum(q, q % 1 ? 1 : 0)} ${unitStr}`, amount: null, inflow: false, tier: 5,
        sortKey: String(Math.round(q)).padStart(7, '0') + '_' + String(fl.id || '')
      });
    });
    dayMalfs.forEach(mf => {
      stream.push({
        rkey: 'fuel_malfunctions', rid: mf.id, company: mf.company || 'WTC',
        group: 'fuel_maint', kindCls: 'maint', kindLbl: 'Tank Var',
        isAfterHours: false, txDate: targetDate, time: '',
        ref: mf.ticket_no ? `#${mf.ticket_no}` : compactRef(mf.name, mf.id, 'MF'),
        party: mf.discrepancy_type || 'Malfunction', detail: safeNotes(ctx, mf.notes) || mf.equipment || 'Diesel Tank',
        qtyTxt: `${ctx.fmtNum(Number(mf.litres || 0), 0)} L`, amount: null, inflow: false, tier: 5,
        sortKey: '90_' + String(mf.id || '')
      });
    });
    dayOilLogs.forEach(ol => {
      stream.push({
        rkey: 'equipment_oil_logs', rid: ol.id, company: ol.company || 'WTC',
        group: 'fuel_maint', kindCls: 'maint', kindLbl: 'Oil Log',
        isAfterHours: false, txDate: targetDate, time: '',
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
        isAfterHours: false, txDate: targetDate, time: '',
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
        isAfterHours: false, txDate: targetDate, time: '',
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
        isAfterHours: false, txDate: targetDate, time: '',
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
        isAfterHours: false, txDate: targetDate, time: '',
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
        isAfterHours: false, txDate: targetDate, time: '',
        ref: compactRef(em.name, em.id, 'EMP'),
        party: em.staff || 'Employee', detail: `${em.type || 'Staff'} Contract Started`,
        qtyTxt: `${em.working_days || 30}d/mo`, amount: Number(em.salary_usd || 0) || null, inflow: false, tier: 6,
        sortKey: '75_' + String(em.id || '')
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
      dayEmps,
      dayLogAllows,
      dayFlEntries,
      dayFlPays,
      dayRegAdds,
      otTotalLoads: salesSum.otLoads + rawSum.otLoads,
      attOtHours: round2(attOtHours),
      repShiftedCount,
      avg7Sales,
      avg7Profit,
      pulseRows,
      hourBuckets,
      entityRows,
      customerRows,
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

  function renderQuadrant1(ctx, dm, lens, isSingleCo) {
    const { esc, ic, fmtUSD, fmtUSDk, fmtNum, coBadge, relLink } = ctx;

    if (lens === 'customers') {
      const rows = dm.customerRows;
      if (!rows.length) {
        return `<div class="dops-card-body"><div class="dops-empty">No customer sales or AR collections recorded on ${esc(fmtShortDay(dm.targetDate))}.</div></div>`;
      }
      const maxTtc = Math.max(1, ...rows.map(r => Math.abs(r.ttc)));
      return `
        <div class="dops-card-body no-pad">
          <table class="dops-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th class="r">Loads</th>
                <th class="r">Volume</th>
                <th class="r">Sales TTC</th>
                <th class="r">AR Paid</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => {
                const pct = Math.min(100, Math.max(0, Math.round((Math.abs(r.ttc) / maxTtc) * 100)));
                return `
                  <tr>
                    <td>${relLink('customers', r.name, r.name, true)}${r.ahLoads > 0 ? ` <span class="dops-ah-badge">${ic('moon')}+${r.ahLoads}</span>` : ''}</td>
                    <td class="r">${r.loads ? fmtNum(r.loads) : '-'}</td>
                    <td class="r">${r.m3 ? `${fmtNum(r.m3, 0)} m³` : '-'}</td>
                    <td class="r">
                      <div class="dops-bar-inline" style="justify-content:flex-end">
                        <div class="dops-bar-track"><div class="dops-bar-fill" style="width:${pct}%"></div></div>
                        <strong>${fmtUSD(r.ttc, 0)}</strong>
                      </div>
                    </td>
                    <td class="r" style="color:${r.collected > 0 ? 'var(--good)' : 'var(--muted)'}">${r.collected > 0 ? fmtUSD(r.collected, 0) : '-'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td>Total (${rows.length} Clients)</td>
                <td class="r">${fmtNum(dm.salesSum.loads)}</td>
                <td class="r">${fmtNum(dm.salesSum.m3, 0)} m³</td>
                <td class="r">${fmtUSD(dm.salesSum.ttc, 0)}</td>
                <td class="r">${fmtUSD(dm.arCollected, 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      `;
    }

    if (lens === 'grades') {
      const pRows = dm.productRows;
      const eRows = !isSingleCo ? dm.entityRows : [];
      if (!pRows.length && !eRows.length) {
        return `<div class="dops-card-body"><div class="dops-empty">No material grades or entity dispatches on ${esc(fmtShortDay(dm.targetDate))}.</div></div>`;
      }
      return `
        <div class="dops-card-body no-pad">
          ${eRows.length ? `
            <table class="dops-table">
              <thead>
                <tr>
                  <th>Entity (BU)</th>
                  <th class="r">S / R</th>
                  <th class="r">Sales TTC</th>
                  <th class="r">Profit</th>
                  <th class="r">Net Cash</th>
                </tr>
              </thead>
              <tbody>
                ${eRows.map(r => `
                  <tr class="dops-click-row" data-jump-co="${esc(r.key)}">
                    <td>${coBadge(r.name)} <strong>${esc(r.name)}</strong></td>
                    <td class="r">${fmtNum(r.salesLoads)} / ${fmtNum(r.rawLoads)}</td>
                    <td class="r"><strong>${fmtUSD(r.salesTtc, 0)}</strong></td>
                    <td class="r" style="color:${r.opProfit < 0 ? 'var(--crit)' : 'var(--good)'}"><strong>${fmtUSD(r.opProfit, 0)}</strong></td>
                    <td class="r">${fmtUSD(r.netCash, 0)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : ''}
          ${pRows.length ? `
            <table class="dops-table">
              <thead>
                <tr>
                  <th>Material Grade</th>
                  <th class="r">Sold Vol</th>
                  <th class="r">Sales TTC</th>
                  <th class="r">Quarry In</th>
                  <th class="r">Raw Cost</th>
                </tr>
              </thead>
              <tbody>
                ${pRows.map(r => `
                  <tr>
                    <td>${relLink('products', r.name, r.name, true)}</td>
                    <td class="r">${r.salesLoads ? `${fmtNum(r.salesM3, 0)} m³ (${r.salesLoads})` : '-'}</td>
                    <td class="r">${r.salesTtc ? `<strong>${fmtUSD(r.salesTtc, 0)}</strong>` : '-'}</td>
                    <td class="r">${r.rawLoads ? `${fmtNum(r.rawM3, 0)} m³ (${r.rawLoads})` : '-'}</td>
                    <td class="r">${r.rawCost ? fmtUSD(r.rawCost, 0) : '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : ''}
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
          <div class="dops-stat-strip-4">
            <div class="dops-stat-box" data-dops-open-drawer="sales">
              <small>Peak Window</small>
              <b>${peak && (peak.salesLoads + peak.rawLoads) > 0 ? `${esc(peak.label)} (${peak.salesLoads + peak.rawLoads})` : 'Quiet Day'}</b>
            </div>
            <div class="dops-stat-box" data-dops-open-drawer="sales">
              <small>Deliv. / Pickup</small>
              <b>${fmtNum(dm.salesSum.deliveryLoads)} / ${fmtNum(dm.salesSum.pickupLoads)} loads</b>
            </div>
            <div class="dops-stat-box" data-dops-open-drawer="all">
              <small>Overtime Loads</small>
              <b>${fmtNum(dm.otTotalLoads)} (${fmtNum(dm.salesSum.otLoads)}S · ${fmtNum(dm.rawSum.otLoads)}R)</b>
            </div>
            <div class="dops-stat-box${dm.ahAvailableCount > 0 ? ' tone-brass' : ''}" data-dops-toggle-ah="1">
              <small>After-Hours (${esc(fmtShortDay(dm.yestDate))})</small>
              <b>${dm.ahAvailableCount > 0 ? `${dm.includeAh ? 'Incl.' : 'Off'} · ${dm.ahAvailableCount} (${fmtUSDk(dm.ahAvailableUsd)})` : '0 logged'}</b>
            </div>
          </div>
        </div>
      `;
    }

    // Default: 'pulse' - 7-Day Transaction Pulse + Top 3 Customers & Dispatch Mix Strip
    const topCusts = dm.customerRows.filter(c => c.ttc > 0).slice(0, 3);
    const maxCust = topCusts.length ? Math.max(1, topCusts[0].ttc) : 1;
    const topGrade = dm.productRows[0];
    return `
      <div class="dops-card-body">
        <div class="dops-pulse-wrap" id="dopsChartWrap">
          ${renderPulseSvg(ctx, dm, 'pulse')}
        </div>
        <div class="dops-q1-bottom">
          <div class="dops-top-bars">
            ${topCusts.length ? topCusts.map(c => {
              const pct = Math.min(100, Math.max(4, Math.round((c.ttc / maxCust) * 100)));
              return `
                <div class="dops-hbar-row" data-dops-lens="comm:customers">
                  <div class="dops-hbar-name">${c.ahLoads > 0 ? `<span class="dops-ah-badge">${ic('moon')}+${c.ahLoads}</span>` : ''}${esc(c.name)}</div>
                  <div class="dops-hbar-meta">${fmtNum(c.loads)} ${c.loads === 1 ? 'load' : 'loads'} · ${fmtNum(c.m3, 0)} m³</div>
                  <div class="dops-hbar-val">
                    <div class="dops-bar-track"><div class="dops-bar-fill" style="width:${pct}%"></div></div>
                    <strong>${fmtUSD(c.ttc, 0)}</strong>
                  </div>
                </div>
              `;
            }).join('') : `<div class="dops-hbar-row" data-dops-open-drawer="raw"><div class="dops-hbar-name" style="color:var(--muted)">No sales dispatches on ${esc(fmtShortDay(dm.targetDate))}</div><div class="dops-hbar-meta">${fmtNum(dm.rawSum.loads)} quarry loads</div><div class="dops-hbar-val"><strong>${fmtUSD(dm.rawSum.totalCost, 0)}</strong></div></div>`}
          </div>
          <div class="dops-chip-row">
            <span class="dops-micro-pill" data-dops-open-drawer="sales">Deliv <b>${fmtNum(dm.salesSum.deliveryLoads)}</b> · Pickup <b>${fmtNum(dm.salesSum.pickupLoads)}</b></span>
            ${topGrade ? `<span class="dops-micro-pill" data-dops-lens="comm:grades">Top Grade: <b>${esc(topGrade.name)}</b> (${fmtNum(topGrade.salesM3 || topGrade.rawM3, 0)} m³)</span>` : ''}
            ${dm.salesSum.chainedLoads > 0 ? `<span class="dops-micro-pill" data-dops-open-drawer="sales">${ic('link')} <b>${fmtNum(dm.salesSum.chainedLoads)}</b> Chained</span>` : ''}
            ${dm.customerRows.length > 3 ? `<span class="dops-micro-pill" data-dops-lens="comm:customers">+${fmtNum(dm.customerRows.length - 3)} more clients</span>` : (!isSingleCo ? `<span class="dops-micro-pill" data-dops-lens="comm:grades"><b>${dm.entityRows.filter(e => e.salesLoads + e.rawLoads > 0).length}</b> Active BUs</span>` : '')}
          </div>
        </div>
      </div>
    `;
  }

  function renderQuadrant2(ctx, dm, lens, isSingleCo) {
    const { esc, fmtUSD, fmtNum, coBadge } = ctx;
    const totalDispatched = Math.max(0, dm.salesSum.loads);
    const agreedPct = totalDispatched > 0 ? Math.round((dm.agreedSalesLoads / totalDispatched) * 100) : 100;
    const totDiscAll = ctx.round2(dm.salesSum.discUsd + dm.rawSum.discUsd + dm.arDiscUsd + dm.apDiscUsd);

    if (lens === 'rules') {
      const todayRules = dm.dayPriceRules;
      const showRules = todayRules.length ? todayRules : dm.recentWeekRules;
      return `
        <div class="dops-card-body no-pad">
          <table class="dops-table">
            <thead>
              <tr>
                <th>${todayRules.length ? 'New Rule Today' : 'Recent 7-Day Rule'}</th>
                <th>Counterparty / Site</th>
                <th>Grade</th>
                <th class="r">Agreed Rate</th>
              </tr>
            </thead>
            <tbody>
              ${showRules.map(pr => {
                const info = describePriceRule(ctx, pr);
                const dLbl = String(pr.start_date || pr.date || '').slice(5, 10);
                return `
                  <tr class="rrow" data-rkey="price_rules" data-rid="${esc(String(pr.id || ''))}">
                    <td><span class="dops-kind rule">${esc(info.badge)}</span>${!todayRules.length && dLbl ? ` <small style="color:var(--muted)">${esc(dLbl)}</small>` : ''}</td>
                    <td class="dops-trunc">${!isSingleCo ? `${coBadge(pr.company)} ` : ''}<strong>${esc(info.party)}</strong></td>
                    <td class="dops-trunc">${esc(pr.product || pr.site || '-')}</td>
                    <td class="r"><strong>${esc(info.rateTxt)}</strong></td>
                  </tr>
                `;
              }).join('') || `<tr><td colspan="4" class="dops-empty">No price agreements created on this date or trailing 7 days.</td></tr>`}
              ${dm.dayCreditTerms.map(ct => `
                <tr class="rrow" data-rkey="credit_terms" data-rid="${esc(String(ct.id || ''))}">
                  <td><span class="dops-kind rule">Credit Policy</span></td>
                  <td class="dops-trunc"><strong>${esc(ct.customer || '-')}</strong></td>
                  <td>Net Terms</td>
                  <td class="r"><strong>${fmtNum(ct.credit_days || 0)} Days</strong></td>
                </tr>
              `).join('')}
              ${dm.dayOtRates.map(ot => `
                <tr class="rrow" data-rkey="overtime_rates" data-rid="${esc(String(ot.id || ''))}">
                  <td><span class="dops-kind rule">OT Trip Rate</span></td>
                  <td class="dops-trunc"><strong>${esc(ot.region || 'Zone')}</strong></td>
                  <td>Driver Trip</td>
                  <td class="r"><strong>${fmtUSD(Number(ot.amount || 0), 2)}</strong></td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2">${todayRules.length ? `${fmtNum(dm.newPoliciesCount)} New Policies on ${esc(fmtShortDay(dm.targetDate))}` : `0 New on ${esc(fmtShortDay(dm.targetDate))} (Showing trailing 7d)`}</td>
                <td colspan="2" class="r">${fmtNum(dm.activeRulesUsed.length)} Active Rules Used Today</td>
              </tr>
            </tfoot>
          </table>
        </div>
      `;
    }

    if (lens === 'audit') {
      const rows = dm.rateAuditRows;
      if (!rows.length) {
        return `<div class="dops-card-body"><div class="dops-empty">No customer sales dispatches to audit on ${esc(fmtShortDay(dm.targetDate))}.</div></div>`;
      }
      return `
        <div class="dops-card-body no-pad">
          <table class="dops-table">
            <thead>
              <tr>
                <th>Customer &amp; Grade</th>
                <th class="r">Loads</th>
                <th class="r">Agreed</th>
                <th class="r">Billed</th>
                <th class="r">Status</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => {
                const stCls = r.status === 'Below Rate' ? 'crit' : (r.status === 'Lapsed' ? 'maint' : (r.status === 'Agreed' ? 'cash' : 'pay'));
                return `
                  <tr class="rrow" data-rkey="${r.ruleId && r.status === 'Agreed' ? 'price_rules' : 'sales_tickets'}" data-rid="${esc(String((r.ruleId && r.status === 'Agreed' ? r.ruleId : r.sampleTicketId) || ''))}">
                    <td class="dops-trunc"><strong>${esc(r.customer)}</strong> <span style="color:var(--muted)">· ${esc(r.product)}</span></td>
                    <td class="r">${fmtNum(r.loads)}</td>
                    <td class="r">${r.agreedRate != null ? fmtUSD(r.agreedRate, 2) : '-'}</td>
                    <td class="r"><strong>${fmtUSD(r.billedAvg, 2)}</strong></td>
                    <td class="r"><span class="dops-kind ${stCls}">${r.status === 'Below Rate' ? `-${fmtUSD(r.shortfall, 0)}` : esc(r.status)}</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2">Agreed ${fmtNum(dm.agreedSalesLoads)} · Spot ${fmtNum(dm.spotSalesLoads)}</td>
                <td colspan="3" class="r">${dm.belowAgreedLoads > 0 ? `Below Agreed: ${dm.belowAgreedLoads} (-${fmtUSD(dm.belowShortfallUsd, 0)})` : '0 Below-Agreed Shortfalls'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      `;
    }

    if (lens === 'vat_jv') {
      const hasRows = dm.dayVatInvoices.length || dm.dayJvDists.length || dm.salesSum.vat > 0 || dm.salesSum.commUsd > 0 || totDiscAll > 0;
      if (!hasRows) {
        return `<div class="dops-card-body"><div class="dops-empty">No VAT invoices, commissions, discounts, or JV distributions on ${esc(fmtShortDay(dm.targetDate))}.</div></div>`;
      }
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
            ${!dm.dayVatInvoices.length && !dm.dayJvDists.length ? `
              <div class="dops-event-item" data-dops-open-drawer="sales">
                <div class="dops-event-left">
                  <span class="dops-kind sales">Commercial</span>
                  <div class="dops-event-txt"><strong>Ticket VAT ${fmtUSD(dm.salesSum.vat, 0)}</strong> <span>· Comm ${fmtUSD(dm.salesSum.commUsd, 0)} · Total Disc ${fmtUSD(totDiscAll, 0)}</span></div>
                </div>
                <span class="dops-event-right">${fmtUSD(dm.salesSum.grossExVat, 0)} Ex-VAT</span>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    // Default: 'highlights' - 4-Stat Commercial Governance Strip + Priority Interactive Feed
    const items = [];
    dm.dayPriceRules.forEach(pr => {
      const info = describePriceRule(ctx, pr);
      items.push({
        cls: 'is-new-rule',
        rkey: 'price_rules',
        rid: pr.id,
        badgeCls: 'rule',
        badgeTxt: `New · ${info.badge}`,
        title: info.party,
        sub: info.sub || pr.company || '',
        rightTxt: info.rateTxt,
        rightCls: 'brass'
      });
    });
    dm.dayCreditTerms.forEach(ct => {
      items.push({
        cls: 'is-new-rule',
        rkey: 'credit_terms',
        rid: ct.id,
        badgeCls: 'rule',
        badgeTxt: 'New Credit',
        title: ct.customer || 'Customer',
        sub: ct.company || '',
        rightTxt: `${ct.credit_days || 0} Days`,
        rightCls: 'brass'
      });
    });
    dm.dayVatInvoices.forEach(vi => {
      items.push({
        cls: 'is-new-rule',
        rkey: 'vat_invoices',
        rid: vi.id,
        badgeCls: 'rule',
        badgeTxt: `VAT #${vi.invoice_no || ''}`,
        title: vi.customer || 'Customer',
        sub: `${vi.tickets_count || 0} tickets billed`,
        rightTxt: fmtUSD(vi.total_ttc || 0, 0),
        rightCls: 'good'
      });
    });
    dm.belowTicketEvents.forEach(ev => {
      items.push({
        cls: 'is-alert-item',
        rkey: 'sales_tickets',
        rid: ev.ticket.id,
        badgeCls: 'crit',
        badgeTxt: 'Below Rate',
        title: ev.ticket.customer || 'Customer',
        sub: `${ev.ticket.product || ''} · ${fmtUSD(ev.soldPrice, 2)} vs ${fmtUSD(ev.agreedPrice, 2)}`,
        rightTxt: `-${fmtUSD(ev.shortfall, 0)}`,
        rightCls: 'crit'
      });
    });
    if (items.length < 3) {
      dm.activeRulesUsed.slice(0, 3 - items.length).forEach(ru => {
        const info = describePriceRule(ctx, ru.rule);
        items.push({
          cls: '',
          rkey: 'price_rules',
          rid: ru.rule.id,
          badgeCls: 'cash',
          badgeTxt: 'Agreed Used',
          title: info.party,
          sub: `${info.sub ? info.sub + ' · ' : ''}${ru.loads} ${ru.loads === 1 ? 'load' : 'loads'}`,
          rightTxt: info.rateTxt,
          rightCls: ''
        });
      });
    }
    if (!items.length && dm.recentWeekRules.length) {
      dm.recentWeekRules.slice(0, 2).forEach(pr => {
        const info = describePriceRule(ctx, pr);
        items.push({
          cls: '',
          rkey: 'price_rules',
          rid: pr.id,
          badgeCls: 'rule',
          badgeTxt: fmtShortDay(String(pr.start_date || '').slice(0, 10)),
          title: info.party,
          sub: info.sub || pr.rule_type || '',
          rightTxt: info.rateTxt,
          rightCls: ''
        });
      });
    }

    return `
      <div class="dops-card-body">
        <div class="dops-stat-strip-4">
          <div class="dops-stat-box${dm.newPoliciesCount > 0 ? ' tone-brass' : ''}" data-dops-lens="deals:rules">
            <small>New Agreements</small>
            <b>${dm.newPoliciesCount > 0 ? `+${fmtNum(dm.newPoliciesCount)} Today` : `0 Today · ${fmtNum(dm.activeRulesUsed.length)} Used`}</b>
          </div>
          <div class="dops-stat-box${dm.belowAgreedLoads > 0 ? ' tone-crit' : (dm.agreedSalesLoads > 0 ? ' tone-good' : '')}" data-dops-lens="deals:audit">
            <small>Rate Compliance</small>
            <b>${dm.belowAgreedLoads > 0 ? `${dm.belowAgreedLoads} Below (-${fmtUSD(dm.belowShortfallUsd, 0)})` : (totalDispatched > 0 ? `${agreedPct}% Agreed (${dm.agreedSalesLoads}/${totalDispatched})` : 'No Sales')}</b>
          </div>
          <div class="dops-stat-box" data-dops-lens="deals:vat_jv">
            <small>Disc. &amp; Comm.</small>
            <b>${fmtUSD(totDiscAll, 0)} · ${fmtUSD(dm.salesSum.commUsd, 0)}</b>
          </div>
          <div class="dops-stat-box" data-dops-lens="deals:vat_jv">
            <small>VAT (${fmtNum(dm.dayVatInvoices.length)} Inv)</small>
            <b>${dm.dayVatInvoices.length > 0 ? fmtUSD(dm.vatBilledTodayTtc, 0) : fmtUSD(dm.salesSum.vat, 0)}</b>
          </div>
        </div>
        <div class="dops-event-list">
          ${items.slice(0, 3).map(it => `
            <div class="dops-event-item ${it.cls}" data-dops-inspect-rkey="${esc(it.rkey)}" data-dops-inspect-rid="${esc(String(it.rid || ''))}">
              <div class="dops-event-left">
                <span class="dops-kind ${it.badgeCls}">${esc(it.badgeTxt)}</span>
                <div class="dops-event-txt"><strong>${esc(it.title)}</strong>${it.sub ? ` <span>· ${esc(it.sub)}</span>` : ''}</div>
              </div>
              <span class="dops-event-right ${it.rightCls}">${esc(it.rightTxt)}</span>
            </div>
          `).join('') || `<div class="dops-empty" style="padding:10px">All dispatches priced on standard terms · 0 commercial exceptions.</div>`}
        </div>
      </div>
    `;
  }

  function renderQuadrant3(ctx, dm, lens, isSingleCo) {
    const { esc, ic, fmtUSD, fmtLBP, fmtNum, coBadge } = ctx;

    if (lens === 'external') {
      if (!dm.extItems.length) {
        return `<div class="dops-card-body"><div class="dops-empty">No external treasury inflows or outflows recorded on ${esc(fmtShortDay(dm.targetDate))}.</div></div>`;
      }
      return `
        <div class="dops-card-body no-pad">
          <table class="dops-table">
            <thead>
              <tr>
                <th>Dir</th>
                <th>Counterparty</th>
                <th>Notes / Purpose</th>
                <th class="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${dm.extItems.map(ex => `
                <tr class="rrow" data-rkey="external_movements" data-rid="${esc(String(ex.id || ''))}">
                  <td><span class="dops-kind ${ex.isOut ? 'exp' : 'cash'}">${ex.isOut ? 'Outflow' : 'Inflow'}</span></td>
                  <td class="dops-trunc">${!isSingleCo ? `${coBadge(ex.company)} ` : ''}<strong>${esc(ex.counterparty)}</strong></td>
                  <td class="dops-trunc" style="color:var(--muted)">${esc(ex.notes || ex.kind)}</td>
                  <td class="r"><strong style="color:${ex.isOut ? 'var(--ink)' : 'var(--good)'}">${ex.isOut ? '-' : '+'}${ex.lbp && !ex.usd ? fmtCompactLbp(ex.lbp) : fmtUSD(ex.eqAmt, 0)}</strong></td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2">In +${fmtUSD(dm.extInEq, 0)} (${dm.extInCount}) · Out -${fmtUSD(dm.extOutEq, 0)} (${dm.extOutCount})</td>
                <td colspan="2" class="r">Net Ext: ${dm.extInEq - dm.extOutEq >= 0 ? '+' : ''}${fmtUSD(dm.extInEq - dm.extOutEq, 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      `;
    }

    if (lens === 'fx_loans') {
      if (!dm.convItems.length && !dm.loanEvents.length && !dm.dayFxRates.length) {
        return `<div class="dops-card-body"><div class="dops-empty">No FX currency conversions or loan movements on ${esc(fmtShortDay(dm.targetDate))} · Active FX ${fmtNum(dm.fxRate, 0)} LBP/$.</div></div>`;
      }
      return `
        <div class="dops-card-body no-pad">
          <table class="dops-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Counterparty / Pair</th>
                <th>Rate / Currency</th>
                <th class="r">USD Eq.</th>
              </tr>
            </thead>
            <tbody>
              ${dm.convItems.map(cv => `
                <tr class="rrow" data-rkey="conversions" data-rid="${esc(String(cv.id || ''))}">
                  <td><span class="dops-kind fx">FX Conv</span></td>
                  <td class="dops-trunc">${!isSingleCo ? `${coBadge(cv.company)} ` : ''}<strong>${esc(cv.dirLabel)}</strong>${cv.notes ? ` <span style="color:var(--muted)">· ${esc(cv.notes)}</span>` : ''}</td>
                  <td>${fmtCompactLbp(cv.lbpMag)} @ <strong>${fmtNum(cv.rate, 0)}</strong></td>
                  <td class="r"><strong>${fmtUSD(cv.usdMag, 0)}</strong></td>
                </tr>
              `).join('')}
              ${dm.loanEvents.map(ln => `
                <tr class="rrow" data-rkey="${esc(ln.rkey)}" data-rid="${esc(String(ln.id || ''))}">
                  <td><span class="dops-kind loan">${esc(ln.badge)}</span></td>
                  <td class="dops-trunc">${!isSingleCo ? `${coBadge(ln.company)} ` : ''}<strong>${esc(ln.party)}</strong>${ln.notes ? ` <span style="color:var(--muted)">· ${esc(ln.notes)}</span>` : ''}</td>
                  <td>${ln.lbp ? fmtCompactLbp(ln.lbp) : 'USD Principal'}</td>
                  <td class="r"><strong style="color:${ln.isInflow ? 'var(--good)' : 'var(--ink)'}">${ln.isInflow ? '+' : '-'}${fmtUSD(ln.eqAmt, 0)}</strong></td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2">FX Converted: ${fmtUSD(dm.totConvUsd, 0)} (${dm.convItems.length})</td>
                <td colspan="2" class="r">Loans In +${fmtUSD(dm.loanInEq, 0)} · Out -${fmtUSD(dm.loanOutEq, 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      `;
    }

    if (lens === 'ar_ap') {
      if (!dm.dayRcpts.length && !dm.daySets.length) {
        return `<div class="dops-card-body"><div class="dops-empty">No customer AR receipts or supplier AP settlements on ${esc(fmtShortDay(dm.targetDate))}.</div></div>`;
      }
      return `
        <div class="dops-card-body no-pad">
          <table class="dops-table">
            <thead>
              <tr>
                <th>Flow</th>
                <th>Counterparty</th>
                <th>Method</th>
                <th class="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${dm.dayRcpts.filter(r => ctx.receiptKind(r) !== 'Excluded').map(r => `
                <tr class="rrow" data-rkey="receipts" data-rid="${esc(String(r.id || ''))}">
                  <td><span class="dops-kind cash">AR In</span></td>
                  <td class="dops-trunc"><strong>${esc(r.customer || '-')}</strong></td>
                  <td>${esc(r.method || 'Cash')}</td>
                  <td class="r"><strong style="color:var(--good)">+${fmtUSD(Number(r.amount || 0) + Number(r.discount || 0), 0)}</strong></td>
                </tr>
              `).join('')}
              ${dm.daySets.filter(s => ctx.settlementKind(s) !== 'Excluded').map(s => `
                <tr class="rrow" data-rkey="settlements" data-rid="${esc(String(s.id || ''))}">
                  <td><span class="dops-kind pay">AP Out</span></td>
                  <td class="dops-trunc"><strong>${esc(s.supplier || '-')}</strong></td>
                  <td>${esc(s.method || 'Cash')}</td>
                  <td class="r"><strong>-${fmtUSD(Number(s.amount || 0) + Number(s.discount || 0), 0)}</strong></td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2">AR In +${fmtUSD(dm.arCollected, 0)} (${dm.arRcptCount})</td>
                <td colspan="2" class="r">AP Out -${fmtUSD(dm.apPaid, 0)} (${dm.apSetCount})</td>
              </tr>
            </tfoot>
          </table>
        </div>
      `;
    }

    // Default: 'bridge' - Visual Inflow vs Outflow Balance Bar + 6-Lane Waterfall + FX & Loans Spotlight
    const totFlow = Math.max(1, dm.cashInflow + dm.cashOutflow);
    const inPct = (dm.cashInflow + dm.cashOutflow) > 0 ? Math.round((dm.cashInflow / totFlow) * 100) : 0;
    const outPct = (dm.cashInflow + dm.cashOutflow) > 0 ? (100 - inPct) : 0;

    const topExtIn = dm.extItems.find(e => !e.isOut);
    const topExtOut = dm.extItems.find(e => e.isOut);
    const topRcpt = dm.dayRcpts[0];
    const topSet = dm.daySets[0];

    const fxSpotCopy = dm.convItems.length > 0
      ? (dm.convItems.length === 1
          ? `${dm.convItems[0].dirLabel}: ${fmtUSD(dm.convItems[0].usdMag, 0)} @ ${fmtNum(dm.convItems[0].rate, 0)}`
          : `${dm.convItems.length} FX (${fmtUSD(dm.totConvUsd, 0)} @ avg ${fmtNum(dm.avgConvRate, 0)})`)
      : `0 Conversions · Rate ${fmtNum(dm.fxRate, 0)} LBP/$`;

    const loanSpotCopy = dm.loanEvents.length > 0
      ? `${dm.loanEvents.length} ${dm.loanEvents.length === 1 ? 'Move' : 'Moves'} · In +${fmtUSD(dm.loanInEq, 0)} / Out -${fmtUSD(dm.loanOutEq, 0)}`
      : '0 Loan Draws or Repayments';

    return `
      <div class="dops-card-body">
        <div class="dops-cash-bar-box">
          <div class="dops-cash-bar-top">
            <span><strong style="color:var(--good)">In +${fmtUSD(dm.cashInflow, 0)}</strong> · <strong>Out -${fmtUSD(dm.cashOutflow, 0)}</strong></span>
            <span>Till: <strong>${fmtUSD(dm.liveTillUsd, 0)}</strong>${dm.liveTillLbp ? ` + <strong>${fmtCompactLbp(dm.liveTillLbp)}</strong>` : ''}</span>
          </div>
          <div class="dops-dual-track" role="img" aria-label="Day cash inflow versus outflow">
            <div class="dops-dual-seg inflow" style="width:${inPct}%"></div>
            <div class="dops-dual-seg outflow" style="width:${outPct}%"></div>
          </div>
        </div>

        <div class="dops-lanes-grid">
          <div class="dops-lane-col">
            <div class="dops-lane-hdr"><span>Inflows</span><span>+${fmtUSD(dm.cashInflow, 0)}</span></div>
            <div class="dops-lane-item" data-dops-open-drawer="sales">
              <div class="dops-lane-lbl"><strong>Cash Sales</strong><small>${fmtUSD(dm.salesSum.cashTtc, 0)} TTC cash tickets</small></div>
              <span class="dops-lane-amt ${dm.salesSum.cashNet > 0 ? 'in' : 'zero'}">${dm.salesSum.cashNet > 0 ? `+${fmtUSD(dm.salesSum.cashNet, 0)}` : '$0'}</span>
            </div>
            <div class="dops-lane-item" data-dops-lens="treasury:ar_ap">
              <div class="dops-lane-lbl"><strong>AR Collected (${fmtNum(dm.arRcptCount)})</strong><small>${topRcpt ? esc(topRcpt.customer || 'Client receipt') : 'Customer collections'}</small></div>
              <span class="dops-lane-amt ${dm.arCollected > 0 ? 'in' : 'zero'}">${dm.arCollected > 0 ? `+${fmtUSD(dm.arCollected, 0)}` : '$0'}</span>
            </div>
            <div class="dops-lane-item${dm.extInCount > 0 ? ' is-ext-active' : ''}" data-dops-lens="treasury:external">
              <div class="dops-lane-lbl"><strong>External In (${fmtNum(dm.extInCount)})</strong><small>${topExtIn ? esc(`${topExtIn.counterparty}${topExtIn.notes ? ' · ' + topExtIn.notes : ''}`) : 'Owner & intercompany in'}</small></div>
              <span class="dops-lane-amt ${dm.extInEq > 0 ? 'in' : 'zero'}">${dm.extInEq > 0 ? `+${fmtUSD(dm.extInEq, 0)}` : '$0'}</span>
            </div>
          </div>

          <div class="dops-lane-col">
            <div class="dops-lane-hdr"><span>Outflows</span><span>-${fmtUSD(dm.cashOutflow, 0)}</span></div>
            <div class="dops-lane-item" data-dops-lens="treasury:ar_ap">
              <div class="dops-lane-lbl"><strong>AP Settled (${fmtNum(dm.apSetCount)})</strong><small>${topSet ? esc(topSet.supplier || 'Supplier payment') : 'Supplier payments'}</small></div>
              <span class="dops-lane-amt ${dm.apPaid > 0 ? 'out' : 'zero'}">${dm.apPaid > 0 ? `-${fmtUSD(dm.apPaid, 0)}` : '$0'}</span>
            </div>
            <div class="dops-lane-item${dm.extOutCount > 0 ? ' is-ext-active' : ''}" data-dops-lens="treasury:external">
              <div class="dops-lane-lbl"><strong>External Out (${fmtNum(dm.extOutCount)})</strong><small>${topExtOut ? esc(`${topExtOut.counterparty}${topExtOut.notes ? ' · ' + topExtOut.notes : ''}`) : 'External disbursements'}</small></div>
              <span class="dops-lane-amt ${dm.extOutEq > 0 ? 'out' : 'zero'}">${dm.extOutEq > 0 ? `-${fmtUSD(dm.extOutEq, 0)}` : '$0'}</span>
            </div>
            <div class="dops-lane-item" data-dops-open-drawer="expenses">
              <div class="dops-lane-lbl"><strong>Cash Exp &amp; Payroll</strong><small>Exp ${fmtUSD(dm.cashExp, 0)} · Sal ${fmtUSD(dm.salariesPaid, 0)}</small></div>
              <span class="dops-lane-amt ${(dm.cashExp + dm.salariesPaid) > 0 ? 'out' : 'zero'}">${(dm.cashExp + dm.salariesPaid) > 0 ? `-${fmtUSD(dm.cashExp + dm.salariesPaid, 0)}` : '$0'}</span>
            </div>
          </div>
        </div>

        <div class="dops-fx-loan-strip">
          <div class="dops-spot-pill${dm.convItems.length > 0 ? ' active-fx' : ''}" ${dm.convItems.length === 1 ? `data-dops-inspect-rkey="conversions" data-dops-inspect-rid="${esc(String(dm.convItems[0].id || ''))}"` : `data-dops-lens="treasury:fx_loans"`}>
            <div class="dops-spot-left">
              ${ic('conversions')}
              <div class="dops-spot-copy">
                <small>FX Conversions (${fmtNum(dm.convItems.length)})</small>
                <b>${esc(fxSpotCopy)}</b>
              </div>
            </div>
          </div>
          <div class="dops-spot-pill${dm.loanEvents.length > 0 ? ' active-loan' : ''}" ${dm.loanEvents.length === 1 ? `data-dops-inspect-rkey="${esc(dm.loanEvents[0].rkey)}" data-dops-inspect-rid="${esc(String(dm.loanEvents[0].id || ''))}"` : `data-dops-lens="treasury:fx_loans"`}>
            <div class="dops-spot-left">
              ${ic('ledger_treasury')}
              <div class="dops-spot-copy">
                <small>Loans &amp; Advances (${fmtNum(dm.loanEvents.length)})</small>
                <b>${esc(loanSpotCopy)}</b>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderQuadrant4(ctx, dm, lens, isSingleCo) {
    const { esc, ic, fmtUSD, fmtNum, coBadge } = ctx;

    if (lens === 'exp_stock') {
      const hasAny = dm.expCategoryRows.length || dm.dayExpItems.length || dm.dayWhMoves.length;
      if (!hasAny) {
        return `<div class="dops-card-body"><div class="dops-empty">No operational expenses, spare parts, or warehouse movements on ${esc(fmtShortDay(dm.targetDate))}.</div></div>`;
      }
      return `
        <div class="dops-card-body no-pad">
          <table class="dops-table">
            <thead>
              <tr>
                <th>Category / Item</th>
                <th>Type</th>
                <th class="r">Count</th>
                <th class="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${dm.expCategoryRows.map(r => `
                <tr class="rrow" data-rkey="expenses" data-rid="${esc(String(r.sampleId || ''))}">
                  <td class="dops-trunc"><strong>${esc(r.label)}</strong></td>
                  <td><span class="dops-kind ${r.pending ? 'maint' : 'exp'}">${r.pending ? 'Pending' : esc(r.method)}</span></td>
                  <td class="r">${fmtNum(r.count)}</td>
                  <td class="r"><strong>${r.pending && r.amount === 0 ? 'Pending ($0)' : fmtUSD(r.amount, 0)}</strong></td>
                </tr>
              `).join('')}
              ${dm.dayExpItems.slice(0, 6).map(it => `
                <tr class="rrow" data-rkey="expenses" data-rid="${esc(String(it.expense_id || ''))}">
                  <td class="dops-trunc"><strong>${esc(it.item_name || it.subcategory || 'Part')}</strong> <span style="color:var(--muted)">· ${esc(it.target_equipment || it.warehouse_location || '')}</span></td>
                  <td><span class="dops-kind fuel">${it.warehouse_location ? 'Stock In' : 'Allocated'}</span></td>
                  <td class="r">${fmtNum(it.qty || 1, 0)}</td>
                  <td class="r">${fmtUSD(it.line_total || 0, 0)}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2">Cash ${fmtUSD(dm.cashExp, 0)} · Credit ${fmtUSD(dm.creditExp, 0)}</td>
                <td colspan="2" class="r">Total Spend: ${fmtUSD(dm.expTotal, 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      `;
    }

    if (lens === 'fuel_maint') {
      const hasAny = dm.dayFuels.length || dm.dayMalfs.length || dm.dayOilLogs.length || dm.dayRepairs.length || dm.dayDefects.length || dm.dayCoEquip.length;
      if (!hasAny) {
        return `<div class="dops-card-body"><div class="dops-empty">No fuel intakes, oil changes, repairs, or fleet assignments on ${esc(fmtShortDay(dm.targetDate))}.</div></div>`;
      }
      return `
        <div class="dops-card-body no-pad">
          <table class="dops-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Equipment / Unit</th>
                <th>Detail</th>
                <th class="r">Qty / Cost</th>
              </tr>
            </thead>
            <tbody>
              ${dm.dayMalfs.map(mf => `
                <tr class="rrow" data-rkey="fuel_malfunctions" data-rid="${esc(String(mf.id || ''))}">
                  <td><span class="dops-kind crit">Tank Var</span></td>
                  <td><strong>${esc(mf.discrepancy_type || 'Tank')}</strong></td>
                  <td class="dops-trunc">${esc(safeNotes(ctx, mf.notes) || mf.equipment || '-')}</td>
                  <td class="r"><strong style="color:var(--crit)">${fmtNum(mf.litres || 0, 0)} L</strong></td>
                </tr>
              `).join('')}
              ${dm.dayOilLogs.map(ol => `
                <tr class="rrow" data-rkey="equipment_oil_logs" data-rid="${esc(String(ol.id || ''))}">
                  <td><span class="dops-kind maint">Oil Log</span></td>
                  <td><strong>${esc(ol.equipment || '-')}</strong></td>
                  <td class="dops-trunc">${esc([ol.oil_type, ol.service_action].filter(Boolean).join(' · '))}</td>
                  <td class="r"><strong>${fmtNum(ol.qty || 0, 0)} L</strong></td>
                </tr>
              `).join('')}
              ${dm.dayRepairs.map(rp => `
                <tr class="rrow" data-rkey="equipment_repairs" data-rid="${esc(String(rp.id || ''))}">
                  <td><span class="dops-kind maint">Repair</span></td>
                  <td><strong>${esc(rp.equipment || '-')}</strong></td>
                  <td class="dops-trunc">${esc(safeNotes(ctx, rp.notes) || rp.repair_source || '-')}</td>
                  <td class="r"><strong>${fmtUSD(rp.total_cost || rp.cost || 0, 0)}</strong></td>
                </tr>
              `).join('')}
              ${dm.dayDefects.map(df => `
                <tr class="rrow" data-rkey="equipment_defects" data-rid="${esc(String(df.id || ''))}">
                  <td><span class="dops-kind crit">Defect</span></td>
                  <td><strong>${esc(df.equipment || '-')}</strong></td>
                  <td class="dops-trunc">${esc([df.severity, df.part_name].filter(Boolean).join(' · '))}</td>
                  <td class="r">${esc(df.status || 'Open')}</td>
                </tr>
              `).join('')}
              ${dm.dayCoEquip.map(ce => `
                <tr class="rrow" data-rkey="company_equipment" data-rid="${esc(String(ce.id || ''))}">
                  <td><span class="dops-kind fuel">New Unit</span></td>
                  <td>${!isSingleCo ? `${coBadge(ce.company)} ` : ''}<strong>${esc(ce.equipment || '-')}</strong></td>
                  <td class="dops-trunc">${esc([ce.ownership, ce.supplier].filter(Boolean).join(' · '))}</td>
                  <td class="r">Active</td>
                </tr>
              `).join('')}
              ${dm.dayFuels.slice(0, 12).map(fl => `
                <tr class="rrow" data-rkey="fuel_intakes" data-rid="${esc(String(fl.id || ''))}">
                  <td><span class="dops-kind fuel">Fuel</span></td>
                  <td><strong>${esc(fl.equipment || 'Tank')}</strong></td>
                  <td class="dops-trunc">${esc([fl.item || fl.fuel_type, fl.driver].filter(Boolean).join(' · '))}</td>
                  <td class="r"><strong>${fmtNum(fl.litres || 0, 0)} ${/grease/i.test(String(fl.item || '')) ? 'kg' : 'L'}</strong></td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2">Diesel Issued ${fmtNum(dm.dieselIssuedL, 0)} L · Bought ${fmtNum(dm.dieselBoughtL, 0)} L</td>
                <td colspan="2" class="r">${dm.closingTankL != null ? `${esc(dm.closingTankLbl)}: ${fmtNum(dm.closingTankL, 0)} L` : `${fmtNum(dm.fuelFillsCount)} Fills`}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      `;
    }

    if (lens === 'team') {
      const hasAny = dm.dayEmps.length || dm.daySals.length || dm.dayAtt.length || dm.dayLogAllows.length;
      if (!hasAny) {
        return `<div class="dops-card-body"><div class="dops-empty">No attendance logs, salary payouts, or new contracts on ${esc(fmtShortDay(dm.targetDate))} (${fmtNum(dm.activeStaffCount)} active dispatch drivers).</div></div>`;
      }
      return `
        <div class="dops-card-body no-pad">
          <table class="dops-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Staff Member</th>
                <th>Detail</th>
                <th class="r">Hours / USD</th>
              </tr>
            </thead>
            <tbody>
              ${dm.dayEmps.map(em => `
                <tr class="rrow" data-rkey="employments" data-rid="${esc(String(em.id || ''))}">
                  <td><span class="dops-kind team">New Contract</span></td>
                  <td>${!isSingleCo ? `${coBadge(em.company)} ` : ''}<strong>${esc(em.staff || '-')}</strong></td>
                  <td>${esc(em.type || 'Staff')} · ${fmtNum(em.working_days || 30)}d</td>
                  <td class="r"><strong>${fmtUSD(em.salary_usd || 0, 0)}/mo</strong></td>
                </tr>
              `).join('')}
              ${dm.daySals.map(sa => `
                <tr class="rrow" data-rkey="salaries" data-rid="${esc(String(sa.id || ''))}">
                  <td><span class="dops-kind pay">Salary Paid</span></td>
                  <td>${!isSingleCo ? `${coBadge(sa.company)} ` : ''}<strong>${esc(sa.staff || '-')}</strong></td>
                  <td>${esc(sa.payroll_month || '')} · ${esc(sa.method || 'Cash')}</td>
                  <td class="r"><strong>${sa.lbp_amount ? fmtCompactLbp(sa.lbp_amount) : fmtUSD(sa.amount || 0, 0)}</strong></td>
                </tr>
              `).join('')}
              ${dm.dayAtt.slice(0, 12).map(at => {
                const isAbs = /absent|leave|off|sick/i.test(String(at.status || at.type || '')) || Number(at.leave_days || 0) > 0;
                return `
                  <tr class="rrow" data-rkey="attendance" data-rid="${esc(String(at.id || ''))}">
                    <td><span class="dops-kind ${isAbs ? 'maint' : 'team'}">${isAbs ? 'Absent/Off' : 'Present'}</span></td>
                    <td><strong>${esc(at.staff || '-')}</strong></td>
                    <td>${esc([at.in_time && at.out_time ? `${at.in_time}-${at.out_time}` : (at.status || at.type || 'Shift'), at.overtime_hours ? `+${at.overtime_hours}h OT` : ''].filter(Boolean).join(' · '))}</td>
                    <td class="r">${at.worked_hours ? `${fmtNum(at.worked_hours, 1)} h` : '-'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2">Active ${fmtNum(dm.activeStaffCount)} · Absent ${fmtNum(dm.absentCount)}</td>
                <td colspan="2" class="r">Salaries ${fmtUSD(dm.salariesPaid, 0)} · OT ${fmtNum(dm.otTotalLoads)} loads / ${fmtNum(dm.attOtHours, 1)}h</td>
              </tr>
            </tfoot>
          </table>
        </div>
      `;
    }

    // Default: 'overview' - 2x2 Operational Mini-Tiles + Governance & Exceptions Strip
    const topExpCat = dm.expCategoryRows[0];
    const maintCount = dm.dayOilLogs.length + dm.dayRepairs.length + dm.dayDefects.length + dm.dayPartMoves.length;
    const stockPartsNote = dm.dayExpItems.length > 0 || dm.dayWhMoves.length > 0
      ? `${fmtNum(dm.dayExpItems.length)} parts/items${dm.dayWhMoves.length ? ` · ${dm.dayWhMoves.length} stock moves` : ''}`
      : (topExpCat ? `${topExpCat.category}: ${fmtUSD(topExpCat.amount, 0)}` : '0 bills posted');

    const digestPills = [];
    if (dm.ahAvailableCount > 0) {
      if (dm.includeAh) {
        digestPills.push(`<button type="button" class="dops-dpill ah" data-dops-open-drawer="after_hours">${ic('moon')} +${fmtNum(dm.ahAvailableCount)} After-Hours (${fmtUSD(dm.ahAvailableUsd, 0)})</button>`);
      } else {
        digestPills.push(`<button type="button" class="dops-dpill warn" data-dops-toggle-ah="1">${ic('moon')} ${fmtNum(dm.ahAvailableCount)} After-Hours Off · Include</button>`);
      }
    }
    if (dm.pendingExps.length > 0) {
      digestPills.push(`<button type="button" class="dops-dpill warn" data-dops-lens="plant:exp_stock">${ic('clock')} ${fmtNum(dm.pendingExps.length)} Pending Price ($0)</button>`);
    }
    if (dm.openCritDefects.length > 0) {
      digestPills.push(`<button type="button" class="dops-dpill crit" data-nav-jump="fleet_maint">${ic('wrench')} ${fmtNum(dm.openCritDefects.length)} Crit Defects</button>`);
    }
    if (dm.dayMalfs.length > 0) {
      digestPills.push(`<button type="button" class="dops-dpill warn" data-dops-lens="plant:fuel_maint">${ic('fuel')} Tank Var ${fmtNum(dm.malfNetL, 0)} L</button>`);
    }
    if (dm.salesSum.returnsCount > 0) {
      digestPills.push(`<button type="button" class="dops-dpill crit" data-dops-open-drawer="sales">${fmtNum(dm.salesSum.returnsCount)} Rejected/Return</button>`);
    }
    if (dm.repShiftedCount > 0) {
      digestPills.push(`<span class="dops-dpill" data-ui-tip="${dm.repShiftedCount} entries transacted on ${dm.targetDate} carry a shifted statutory Reporting Date. Daily Operations always reflects physical Transaction Date activity.">${ic('calendar')} ${fmtNum(dm.repShiftedCount)} Rep-Date Shifted</span>`);
    }
    if (dm.dayRegAdds.length > 0) {
      digestPills.push(`<span class="dops-dpill">${ic('plus')} ${fmtNum(dm.dayRegAdds.length)} New Master ${dm.dayRegAdds.length === 1 ? 'Record' : 'Records'}</span>`);
    }
    if (!digestPills.length) {
      digestPills.push(`<span class="dops-dpill good">${ic('check_circle')} All plant, fuel &amp; ledger controls clean</span>`);
    }

    return `
      <div class="dops-card-body">
        <div class="dops-plant-grid">
          <div class="dops-plant-tile" data-dops-lens="plant:exp_stock">
            <div class="dops-pt-top">
              <span class="dops-pt-lbl">${ic('warehouse')} Expenses &amp; Stock</span>
              <span class="dops-kpi-delta ${dm.pendingExps.length > 0 ? 'warn' : 'neutral'}">${dm.pendingExps.length > 0 ? `${dm.pendingExps.length} Pending` : `${fmtNum(dm.expCount)} Bills`}</span>
            </div>
            <div class="dops-pt-main">${fmtUSD(dm.expTotal, 0)} <span style="font-size:10.5px;font-weight:600;color:var(--muted)">Cash ${fmtUSD(dm.cashExp, 0)} · Cr ${fmtUSD(dm.creditExp, 0)}</span></div>
            <div class="dops-pt-sub">${esc(stockPartsNote)}</div>
          </div>

          <div class="dops-plant-tile" data-dops-lens="plant:fuel_maint">
            <div class="dops-pt-top">
              <span class="dops-pt-lbl">${ic('fuel')} Diesel, Tank &amp; Lube</span>
              <span class="dops-kpi-delta ${dm.dayMalfs.length > 0 ? 'warn' : 'neutral'}">${dm.dayMalfs.length > 0 ? `${fmtNum(dm.malfNetL, 0)} L Var` : `${fmtNum(dm.fuelFillsCount)} Fills`}</span>
            </div>
            <div class="dops-pt-main">${fmtNum(dm.dieselIssuedL, 0)} L <span style="font-size:10.5px;font-weight:600;color:var(--muted)">${dm.dieselBoughtL > 0 ? `+${fmtNum(dm.dieselBoughtL, 0)} L refill` : 'issued'}</span></div>
            <div class="dops-pt-sub">${dm.closingTankL != null ? `${esc(dm.closingTankLbl)} <b>${fmtNum(dm.closingTankL, 0)} L</b> · ` : ''}Lube <b>${fmtNum(dm.lubeL, 0)} L</b> · Grease <b>${fmtNum(dm.greaseKg, 1)} kg</b></div>
          </div>

          <div class="dops-plant-tile" data-dops-lens="plant:fuel_maint">
            <div class="dops-pt-top">
              <span class="dops-pt-lbl">${ic('wrench')} Fleet &amp; Maintenance</span>
              <span class="dops-kpi-delta ${dm.dayCoEquip.length > 0 ? 'brass' : (maintCount > 0 ? 'good' : 'neutral')}">${dm.dayCoEquip.length > 0 ? `+${dm.dayCoEquip.length} New Units` : `${fmtNum(maintCount)} Maint`}</span>
            </div>
            <div class="dops-pt-main">${fmtNum(dm.activeTrucksCount)} Units <span style="font-size:10.5px;font-weight:600;color:var(--muted)">Own ${fmtNum(dm.companyFleetTrips)} · Haul ${fmtNum(dm.haulerTrips)}</span></div>
            <div class="dops-pt-sub">Oil <b>${fmtNum(dm.dayOilLogs.length)}</b> · Repairs <b>${fmtNum(dm.dayRepairs.length)}</b> · Defects <b>${fmtNum(dm.dayDefects.length)}</b>${dm.dayAdjWins.length ? ` · <b>${dm.dayAdjWins.length}</b> Cap Win` : ''}</div>
          </div>

          <div class="dops-plant-tile" data-dops-lens="plant:team">
            <div class="dops-pt-top">
              <span class="dops-pt-lbl">${ic('payroll')} Team, OT &amp; HR</span>
              <span class="dops-kpi-delta ${dm.dayEmps.length > 0 ? 'brass' : (dm.absentCount > 0 ? 'warn' : 'neutral')}">${dm.dayEmps.length > 0 ? `+${dm.dayEmps.length} Contracts` : (dm.absentCount > 0 ? `${dm.absentCount} Absent` : 'On Shift')}</span>
            </div>
            <div class="dops-pt-main">${fmtNum(dm.activeStaffCount)} Staff <span style="font-size:10.5px;font-weight:600;color:var(--muted)">OT ${fmtNum(dm.otTotalLoads)} loads${dm.attOtHours > 0 ? ` · ${fmtNum(dm.attOtHours, 1)}h` : ''}</span></div>
            <div class="dops-pt-sub">Paid <b>${fmtUSD(dm.salariesPaid, 0)}</b> (${fmtNum(dm.salCount)})${dm.dayEmps.length > 0 ? ` · <b>${dm.dayEmps.length}</b> new hired` : ''}${dm.dayLogAllows.length > 0 ? ` · <b>${dm.dayLogAllows.length}</b> site allow.` : ''}</div>
          </div>
        </div>

        <div class="dops-digest-bar">
          ${digestPills.slice(0, 4).join('')}
        </div>
      </div>
    `;
  }

  function filterDrawerRows(dm, streamFilter, searchStr) {
    const q = String(searchStr || '').trim().toLowerCase();
    return dm.stream.filter(row => {
      if (streamFilter === 'after_hours' && !row.isAfterHours) return false;
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
        const hay = `${row.ref} ${row.kindLbl} ${row.party} ${row.detail} ${row.company} ${row.qtyTxt}`.toLowerCase();
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
        : `No matching records on ${esc(fmtHumanDay(dm.targetDate))}.`}</div>`;
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
              <td class="dops-trunc">${!isSingleCo ? `${coBadge(row.company)} ` : ''}${row.isAfterHours ? `<span class="dops-ah-badge" data-ui-tip="Occurred on ${esc(fmtShortDay(row.txDate))} after accountants left · logged via Yesterday's After-Hours">${ic('moon')}After-Hours</span>` : ''}<strong>${esc(row.party)}</strong>${row.detail ? ` <span style="color:var(--muted)">· ${esc(row.detail)}</span>` : ''}</td>
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
                <span>Click any row for 360° Record Inspector</span>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    `;
  }

  function render(ctx) {
    const { STATE, esc, ic, fmtUSD, fmtUSDk, fmtNum } = ctx;
    const dm = buildDayModel(ctx);
    _lastDayModel = { ctx, dm };
    const today = ctx.todayISO();
    const yestWall = shiftIsoDays(today, -1);

    const allowedCos = ctx.allowedCompanyNames() || [];
    const isSingleCo = STATE.company !== 'manufacturing-group' && !String(STATE.company || '').startsWith('industry:') || allowedCos.length === 1;

    const commLens = STATE.dailyOpsCommLens || 'pulse';
    const dealsLens = STATE.dailyOpsDealsLens || 'highlights';
    const treasuryLens = STATE.dailyOpsTreasuryLens || 'bridge';
    const plantLens = STATE.dailyOpsPlantLens || 'overview';
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

    // KPI 3: Profit %
    const profPctTxt = `${(dm.opMarginPct * 100).toFixed(1)}%`;
    const profDeltaCls = dm.operatingProfit < 0 ? 'crit' : 'good';

    // KPI 5: Commercial Agreements, FX & Deals
    const dealsCountToday = dm.newPoliciesCount + dm.convItems.length + dm.loanEvents.length + dm.dayVatInvoices.length;
    const dealsBadge = dm.belowAgreedLoads > 0
      ? `<span class="dops-kpi-delta crit">${dm.belowAgreedLoads} Below</span>`
      : (dm.newPoliciesCount > 0
          ? `<span class="dops-kpi-delta brass">+${dm.newPoliciesCount} ${dm.newPoliciesCount === 1 ? 'Rule' : 'Rules'}</span>`
          : `<span class="dops-kpi-delta good">On Rate</span>`);
    const dealsValTxt = dealsCountToday > 0
      ? `${dm.newPoliciesCount} ${dm.newPoliciesCount === 1 ? 'Rule' : 'Rules'} · ${dm.convItems.length} FX`
      : `${dm.activeRulesUsed.length} ${dm.activeRulesUsed.length === 1 ? 'Rule' : 'Rules'} Used`;
    const dealsSubBits = [];
    if (dm.convItems.length > 0) dealsSubBits.push(`FX <b>${fmtUSD(dm.totConvUsd, 0)}</b>`);
    if (dm.loanEvents.length > 0) dealsSubBits.push(`Loans <b>${dm.loanEvents.length}</b>`);
    if (dm.dayVatInvoices.length > 0) dealsSubBits.push(`VAT Inv <b>${dm.dayVatInvoices.length}</b>`);
    if (!dealsSubBits.length) {
      dealsSubBits.push(`Agreed <b>${dm.agreedSalesLoads}/${dm.salesSum.loads}</b>`);
      if (dm.salesSum.discUsd + dm.salesSum.commUsd > 0) dealsSubBits.push(`Disc/Comm <b>${fmtUSD(dm.salesSum.discUsd + dm.salesSum.commUsd, 0)}</b>`);
      else dealsSubBits.push(`FX <b>${fmtNum(dm.fxRate, 0)}</b>`);
    }

    // Hover Popovers for all 6 KPI Cards
    const salesPop = JSON.stringify({
      title: `Sales & Dispatch · ${fmtHumanDay(dm.targetDate)}`,
      badge: `${fmtNum(dm.salesSum.loads)} loads`,
      rows: [
        { label: 'Sales Revenue (TTC)', value: fmtUSD(dm.salesSum.ttc, 0), color: '#2356A8', isTotal: true },
        { label: 'Net Ex-VAT + 11% VAT', value: `${fmtUSD(dm.salesSum.grossExVat, 0)} + ${fmtUSD(dm.salesSum.vat, 0)}`, color: '#4A90D9' },
        { label: 'Cash vs Credit (TTC)', value: `${fmtUSD(dm.salesSum.cashTtc, 0)} / ${fmtUSD(dm.salesSum.creditTtc, 0)}`, color: '#1F7A4C' },
        { label: 'Delivery vs Pickup', value: `${dm.salesSum.deliveryLoads} Deliv · ${dm.salesSum.pickupLoads} Pickup`, color: '#C0892F' }
      ],
      footer: dm.ahSalesCount > 0 ? `Includes ${dm.ahSalesCount} Yesterday After-Hours sales · Click to inspect` : 'Click to inspect sales dispatches'
    });

    const rawPop = JSON.stringify({
      title: `Quarry & Haulage · ${fmtHumanDay(dm.targetDate)}`,
      badge: `${fmtNum(dm.rawSum.loads)} loads`,
      rows: [
        { label: 'Total Quarry & Haulage', value: fmtUSD(dm.rawSum.totalCost, 0), color: '#C0892F', isTotal: true },
        { label: 'Quarry Material Cost', value: fmtUSD(dm.rawSum.matCost, 0), color: '#2356A8' },
        { label: 'Third-Party Haulage', value: fmtUSD(dm.rawSum.haulCost, 0), color: '#4A90D9' },
        { label: 'Fleet Split', value: `${dm.rawSum.ownLoads} Own · ${dm.rawSum.haulerLoads} Hauler`, color: '#1F7A4C' }
      ],
      footer: 'Click to inspect quarry & haulage tickets'
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

    const dealsPop = JSON.stringify({
      title: `Agreements, FX & Deals · ${fmtHumanDay(dm.targetDate)}`,
      badge: `${dm.newPoliciesCount} New Rules`,
      rows: [
        { label: 'New Agreements & Credit', value: `${dm.dayPriceRules.length} Price · ${dm.dayCreditTerms.length} Credit · ${dm.dayOtRates.length} OT`, color: '#6B5CE7' },
        { label: 'Rate Compliance', value: `${dm.agreedSalesLoads} Agreed · ${dm.spotSalesLoads} Spot · ${dm.belowAgreedLoads} Below`, color: dm.belowAgreedLoads > 0 ? '#C8333B' : '#1F7A4C' },
        { label: 'FX Conversions', value: `${dm.convItems.length} (${fmtUSD(dm.totConvUsd, 0)})`, color: '#4A90D9' },
        { label: 'Loans & VAT Invoices', value: `${dm.loanEvents.length} Loans · ${dm.dayVatInvoices.length} VAT Inv`, color: '#C0892F' }
      ],
      footer: 'Click to inspect commercial agreements & FX'
    });

    const ahBtnTip = dm.ahAvailableCount > 0
      ? `Includes ${dm.ahSalesCount} Sales & ${dm.ahRawCount} Raw tickets from ${fmtShortDay(dm.yestDate)} logged via Yesterday's After-Hours after accountants left`
      : `Includes Sales & Raw tickets from ${fmtShortDay(dm.yestDate)} logged via Yesterday's After-Hours (0 logged for ${fmtShortDay(dm.yestDate)})`;

    // Domain counts for Discrete Drawer chips
    const cntByGroup = g => dm.stream.filter(r => r.group === g).length;
    const ahCnt = dm.stream.filter(r => r.isAfterHours).length;
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
      <div class="dops-stage" id="dailyOpsStage" data-target-date="${esc(dm.targetDate)}" data-include-ah="${dm.includeAh ? '1' : '0'}">
        <!-- BAND 1: EXECUTIVE DAY, AFTER-HOURS & DISCRETE RECORDS BAR -->
        <div class="dops-bar" id="dopsHeaderBar">
          <div class="dops-bar-left">
            <div class="dops-title-group">
              <h1 class="dops-page-title cockpit-title">Daily Operations</h1>
              <span class="dops-active-date-lbl" id="dopsActiveDateLabel">${esc(fmtHumanDay(dm.targetDate))}</span>
              <span class="dops-basis-tag" id="dopsTxBasisBadge" data-ui-tip="Always anchored to physical Transaction Date regardless of whether the global system filter is set to Reporting Date or Transaction Date.">${ic('lock')} <span>Tx Date<span class="dops-basis-long"> Basis</span></span></span>
            </div>
          </div>

          <div class="dops-bar-controls">
            <button type="button" class="dops-afterhours-btn${dm.includeAh ? ' active' : ''}" id="dopsAfterHoursBtn" aria-pressed="${dm.includeAh ? 'true' : 'false'}" data-ui-tip="${esc(ahBtnTip)}">
              ${ic('moon')}
              <span>Yesterday's After-Hours</span>
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

            <button type="button" class="dops-records-trigger" id="dopsOpenRecordsBtn" data-dops-open-drawer="all" data-ui-tip="Open discrete Day Records Drawer to search and inspect individual entries across all tables without cluttering the overview.">
              ${ic('ledger')}
              <span>Records</span>
              <span class="dops-records-trigger-cnt" id="dopsTotalRecordsCount">${fmtNum(dm.stream.length)}</span>
            </button>
          </div>
        </div>

        <!-- BAND 2: 6-PILLAR EXECUTIVE SCORECARD -->
        <section class="dops-kpis" id="dopsKpiGrid" aria-label="Daily Shareholder Scorecard">
          <div class="dops-kpi accent-sales" data-dops-open-drawer="sales" data-chart-pop="${esc(salesPop)}" role="button" tabindex="0">
            <div class="dops-kpi-top">
              <span class="dops-kpi-lbl">Sales (TTC)</span>
              ${salesDeltaBadge}
            </div>
            <div class="dops-kpi-val-row">
              <span class="dops-kpi-val" id="dopsKpiSalesVal">${fmtUSD(dm.salesSum.ttc, 0)}</span>
              <span class="dops-kpi-unit">${fmtNum(dm.salesSum.loads)} loads · ${fmtNum(dm.salesSum.m3, 0)} m³</span>
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
              <span class="dops-kpi-delta neutral">${fmtNum(dm.rawSum.tons, 0)} t</span>
            </div>
            <div class="dops-kpi-val-row">
              <span class="dops-kpi-val" id="dopsKpiRawVal">${fmtUSD(dm.rawSum.totalCost, 0)}</span>
              <span class="dops-kpi-unit">${fmtNum(dm.rawSum.loads)} loads · ${fmtNum(dm.rawSum.m3, 0)} m³</span>
            </div>
            <div class="dops-kpi-sub">
              ${dm.includeAh && dm.rawAhSum.count > 0
                ? `<span class="dops-kpi-ah">${ic('moon')} +${fmtUSD(dm.rawAhSum.totalCost, 0)} (${dm.rawAhSum.loads})</span> · Today <b>${fmtUSD(dm.rawTodayOnly.totalCost, 0)}</b>`
                : `Mat <b>${fmtUSD(dm.rawSum.matCost, 0)}</b> · Haul <b>${fmtUSD(dm.rawSum.haulCost, 0)}</b>`}
            </div>
          </div>

          <div class="dops-kpi accent-profit${dm.operatingProfit < 0 ? ' is-neg' : ''}" data-dops-lens="plant:exp_stock" data-chart-pop="${esc(profPop)}" role="button" tabindex="0">
            <div class="dops-kpi-top">
              <span class="dops-kpi-lbl">Operating Profit</span>
              <span class="dops-kpi-delta ${profDeltaCls}">${esc(profPctTxt)}</span>
            </div>
            <div class="dops-kpi-val-row">
              <span class="dops-kpi-val ${dm.operatingProfit < 0 ? 'crit' : ''}" id="dopsKpiProfitVal">${fmtUSD(dm.operatingProfit, 0)}</span>
              <span class="dops-kpi-unit">GM ${fmtUSD(dm.grossMargin, 0)}</span>
            </div>
            <div class="dops-kpi-sub">
              Exp <b>${fmtUSD(dm.expTotal, 0)}</b> (${fmtNum(dm.expCount)})${dm.avg7Profit ? ` · 7d <b>${fmtUSD(dm.avg7Profit, 0)}</b>` : ''}
            </div>
          </div>

          <div class="dops-kpi accent-cash" data-dops-lens="treasury:bridge" data-chart-pop="${esc(cashPop)}" role="button" tabindex="0">
            <div class="dops-kpi-top">
              <span class="dops-kpi-lbl">Treasury &amp; Ext.</span>
              <span class="dops-kpi-delta ${dm.netCashFlow > 0 ? 'good' : (dm.netCashFlow < 0 ? 'warn' : 'neutral')}">${dm.netCashFlow > 0 ? 'Net In' : (dm.netCashFlow < 0 ? 'Net Out' : 'Even')}</span>
            </div>
            <div class="dops-kpi-val-row">
              <span class="dops-kpi-val" id="dopsKpiCashVal">${dm.netCashFlow > 0 ? '+' : ''}${fmtUSD(dm.netCashFlow, 0)}</span>
              <span class="dops-kpi-unit">In ${fmtUSDk(dm.cashInflow)} · Out ${fmtUSDk(dm.cashOutflow)}</span>
            </div>
            <div class="dops-kpi-sub">
              ${(dm.extInCount + dm.extOutCount) > 0
                ? `Ext <b>+${fmtUSDk(dm.extInEq)}/-${fmtUSDk(dm.extOutEq)}</b> · Till <b>${fmtUSD(dm.liveTillUsd, 0)}</b>`
                : `AR <b>${fmtUSDk(dm.arCollected)}</b> · AP <b>${fmtUSDk(dm.apPaid)}</b> · Till <b>${fmtUSD(dm.liveTillUsd, 0)}</b>`}
            </div>
          </div>

          <div class="dops-kpi accent-deals" data-dops-lens="deals:rules" data-chart-pop="${esc(dealsPop)}" role="button" tabindex="0">
            <div class="dops-kpi-top">
              <span class="dops-kpi-lbl">Agreements &amp; FX</span>
              ${dealsBadge}
            </div>
            <div class="dops-kpi-val-row">
              <span class="dops-kpi-val" id="dopsKpiDealsVal">${esc(dealsValTxt)}</span>
            </div>
            <div class="dops-kpi-sub">
              ${dealsSubBits.join(' · ')}
            </div>
          </div>

          <div class="dops-kpi accent-plant" data-dops-lens="plant:fuel_maint" role="button" tabindex="0">
            <div class="dops-kpi-top">
              <span class="dops-kpi-lbl">Plant &amp; Team</span>
              <span class="dops-kpi-delta ${dm.openCritDefects.length > 0 ? 'crit' : (dm.dayMalfs.length > 0 ? 'warn' : 'neutral')}">${dm.openCritDefects.length > 0 ? `${dm.openCritDefects.length} Crit` : `${fmtNum(dm.activeStaffCount)} Staff`}</span>
            </div>
            <div class="dops-kpi-val-row">
              <span class="dops-kpi-val" id="dopsKpiPlantVal">${fmtNum(dm.activeTrucksCount)} Units</span>
              <span class="dops-kpi-unit">${fmtNum(dm.dieselIssuedL, 0)} L</span>
            </div>
            <div class="dops-kpi-sub">
              ${dm.closingTankL != null ? `Tank <b>${fmtNum(dm.closingTankL, 0)} L</b> · ` : ''}Own <b>${fmtNum(dm.companyFleetTrips)}</b> · Haul <b>${fmtNum(dm.haulerTrips)}</b>
            </div>
          </div>
        </section>

        <!-- BAND 3: INTERACTIVE 2x2 EXECUTIVE STORY MATRIX (ZERO RAW RECORD CLUTTER) -->
        <div class="dops-bento-grid">
          <!-- QUADRANT 1: COMMERCIAL PULSE, SHIFT RHYTHM & CUSTOMERS -->
          <div class="dops-card" id="dopsPulseMixCard">
            <div class="dops-card-hd">
              <div class="dops-card-title-wrap">
                <span class="dops-card-ico navy">${ic('sales')}</span>
                <h2 class="dops-card-title">Sales Pulse &amp; Dispatch</h2>
              </div>
              <div class="dops-card-actions">
                <div class="dops-seg" role="tablist" aria-label="Commercial Lens">
                  <button type="button" class="dops-seg-btn${commLens === 'pulse' ? ' active' : ''}" data-dops-lens="comm:pulse">Pulse</button>
                  <button type="button" class="dops-seg-btn${commLens === 'hours' ? ' active' : ''}" data-dops-lens="comm:hours">By Shift</button>
                  <button type="button" class="dops-seg-btn${commLens === 'customers' ? ' active' : ''}" data-dops-lens="comm:customers">Clients (${fmtNum(dm.customerRows.length)})</button>
                  <button type="button" class="dops-seg-btn${commLens === 'grades' ? ' active' : ''}" data-dops-lens="comm:grades">${isSingleCo ? 'Grades' : 'BUs &amp; Grades'}</button>
                </div>
                <button type="button" class="dops-disc-link" data-dops-open-drawer="sales" data-ui-tip="Inspect individual Sales & Quarry tickets">${fmtNum(salesCnt + rawCnt)}</button>
              </div>
            </div>
            ${renderQuadrant1(ctx, dm, commLens, isSingleCo)}
          </div>

          <!-- QUADRANT 2: PRICE AGREEMENTS, COMPLIANCE, VAT & DEALS -->
          <div class="dops-card" id="dopsAgreementsCard">
            <div class="dops-card-hd">
              <div class="dops-card-title-wrap">
                <span class="dops-card-ico deals">${ic('pricing')}</span>
                <h2 class="dops-card-title">Price Agreements &amp; Rates</h2>
              </div>
              <div class="dops-card-actions">
                <div class="dops-seg" role="tablist" aria-label="Agreements Lens">
                  <button type="button" class="dops-seg-btn${dealsLens === 'highlights' ? ' active' : ''}" data-dops-lens="deals:highlights">Summary</button>
                  <button type="button" class="dops-seg-btn${dm.newPoliciesCount > 0 ? ' has-alert' : ''}${dealsLens === 'rules' ? ' active' : ''}" data-dops-lens="deals:rules">Rules (${fmtNum(dm.newPoliciesCount)})</button>
                  <button type="button" class="dops-seg-btn${dm.belowAgreedLoads > 0 ? ' has-alert' : ''}${dealsLens === 'audit' ? ' active' : ''}" data-dops-lens="deals:audit">Rate Audit</button>
                  <button type="button" class="dops-seg-btn${dealsLens === 'vat_jv' ? ' active' : ''}" data-dops-lens="deals:vat_jv">VAT &amp; Comm</button>
                </div>
                <button type="button" class="dops-disc-link" data-dops-open-drawer="agreements" data-ui-tip="Inspect agreement, VAT & JV records">${fmtNum(agrCnt)}</button>
              </div>
            </div>
            ${renderQuadrant2(ctx, dm, dealsLens, isSingleCo)}
          </div>

          <!-- QUADRANT 3: TREASURY, EXTERNAL TRANSACTIONS, FX CONVERSIONS & LOANS -->
          <div class="dops-card" id="dopsTreasuryCard">
            <div class="dops-card-hd">
              <div class="dops-card-title-wrap">
                <span class="dops-card-ico teal">${ic('cashflow')}</span>
                <h2 class="dops-card-title">Treasury, External &amp; FX</h2>
              </div>
              <div class="dops-card-actions">
                <div class="dops-seg" role="tablist" aria-label="Treasury Lens">
                  <button type="button" class="dops-seg-btn${treasuryLens === 'bridge' ? ' active' : ''}" data-dops-lens="treasury:bridge">Cash Bridge</button>
                  <button type="button" class="dops-seg-btn${dm.extItems.length > 0 ? ' has-alert' : ''}${treasuryLens === 'external' ? ' active' : ''}" data-dops-lens="treasury:external">External (${fmtNum(dm.extItems.length)})</button>
                  <button type="button" class="dops-seg-btn${(dm.convItems.length + dm.loanEvents.length) > 0 ? ' has-alert' : ''}${treasuryLens === 'fx_loans' ? ' active' : ''}" data-dops-lens="treasury:fx_loans">FX &amp; Loans (${fmtNum(dm.convItems.length + dm.loanEvents.length)})</button>
                  <button type="button" class="dops-seg-btn${treasuryLens === 'ar_ap' ? ' active' : ''}" data-dops-lens="treasury:ar_ap">AR / AP (${fmtNum(dm.arRcptCount + dm.apSetCount)})</button>
                </div>
                <button type="button" class="dops-disc-link" data-dops-open-drawer="treasury" data-ui-tip="Inspect treasury, external, FX & loan records">${fmtNum(extCnt + fxlCnt + arapCnt)}</button>
              </div>
            </div>
            ${renderQuadrant3(ctx, dm, treasuryLens, isSingleCo)}
          </div>

          <!-- QUADRANT 4: PLANT, EXPENSES, WAREHOUSE, FLEET & WORKFORCE -->
          <div class="dops-card" id="dopsPlantCard">
            <div class="dops-card-hd">
              <div class="dops-card-title-wrap">
                <span class="dops-card-ico steel">${ic('plant')}</span>
                <h2 class="dops-card-title">Plant, Stock &amp; Workforce</h2>
              </div>
              <div class="dops-card-actions">
                <div class="dops-seg" role="tablist" aria-label="Plant Lens">
                  <button type="button" class="dops-seg-btn${plantLens === 'overview' ? ' active' : ''}" data-dops-lens="plant:overview">Overview</button>
                  <button type="button" class="dops-seg-btn${plantLens === 'exp_stock' ? ' active' : ''}" data-dops-lens="plant:exp_stock">Exp &amp; Stock (${fmtNum(dm.expCount)})</button>
                  <button type="button" class="dops-seg-btn${plantLens === 'fuel_maint' ? ' active' : ''}" data-dops-lens="plant:fuel_maint">Fuel &amp; Maint</button>
                  <button type="button" class="dops-seg-btn${plantLens === 'team' ? ' active' : ''}" data-dops-lens="plant:team">Team (${fmtNum(dm.activeStaffCount)})</button>
                </div>
                <button type="button" class="dops-disc-link" data-dops-open-drawer="plant" data-ui-tip="Inspect expenses, stock, fuel, maintenance & HR records">${fmtNum(expCnt + fmCnt + teamCnt)}</button>
              </div>
            </div>
            ${renderQuadrant4(ctx, dm, plantLens, isSingleCo)}
          </div>
        </div>

        <!-- DISCRETE SLIDE-OVER DAY RECORDS DRAWER (0px ON MAIN CANVAS WHEN CLOSED) -->
        <div class="dops-drawer-layer${drawerOpen ? ' is-open' : ''}" id="dopsRecordsDrawer" aria-hidden="${drawerOpen ? 'false' : 'true'}">
          <div class="dops-drawer-backdrop" id="dopsDrawerBackdrop"></div>
          <aside class="dops-drawer-panel" id="dopsStreamCard" role="dialog" aria-modal="true" aria-labelledby="dopsDrawerTitle">
            <div class="dops-drawer-hd">
              <div>
                <h2 class="dops-drawer-title" id="dopsDrawerTitle">Day Records Ledger · ${esc(fmtHumanDay(dm.targetDate))}</h2>
                <div class="dops-drawer-sub">Strict Transaction Date Basis${dm.includeAh && ahCnt > 0 ? ` · Includes ${ahCnt} Yesterday After-Hours` : ''} · Click any row for 360° Inspector</div>
              </div>
              <button type="button" class="dops-drawer-close" id="dopsCloseDrawerBtn" aria-label="Close Day Records Drawer">&times;</button>
            </div>
            <div class="dops-drawer-tools">
              <input type="search" id="dopsDrawerSearchInput" class="dops-drawer-search" placeholder="Search ticket #, counterparty, agreement, note, item..." value="${esc(drawerSearch)}" autocomplete="off" aria-label="Filter day records">
              <div class="dops-drawer-chips" id="dopsDrawerChips" role="tablist" aria-label="Record Domain Filter">
                <button type="button" class="dops-dchip${streamFilter === 'all' ? ' active' : ''}" data-dops-stream="all">All (${fmtNum(dm.stream.length)})</button>
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

    // Date navigation
    container.querySelectorAll('[data-dops-pick-date]').forEach(el => {
      el.addEventListener('click', ev => {
        ev.preventDefault();
        const dt = el.getAttribute('data-dops-pick-date');
        if (dt && /^\d{4}-\d{2}-\d{2}$/.test(dt)) {
          STATE.dailyOpsDate = dt;
          renderApp();
        }
      });
    });

    const dateInp = container.querySelector('#dopsDateInput');
    if (dateInp) {
      dateInp.addEventListener('change', () => {
        const v = String(dateInp.value || '').slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v >= ctx.MIN_DATE && v <= ctx.MAX_DATE) {
          STATE.dailyOpsDate = v;
          renderApp();
        }
      });
    }

    // Yesterday's After-Hours toggle
    const toggleAh = () => {
      STATE.dailyOpsIncludeAfterHours = STATE.dailyOpsIncludeAfterHours === false;
      renderApp();
    };
    const ahBtn = container.querySelector('#dopsAfterHoursBtn');
    if (ahBtn) {
      ahBtn.addEventListener('click', ev => {
        ev.preventDefault();
        toggleAh();
      });
    }
    container.querySelectorAll('[data-dops-toggle-ah]').forEach(el => {
      el.addEventListener('click', ev => {
        ev.preventDefault();
        toggleAh();
      });
    });

    // Interactive Sub-Lens switchers across all 4 Quadrants
    container.querySelectorAll('[data-dops-lens]').forEach(el => {
      el.addEventListener('click', ev => {
        if (ev.target && ev.target.closest && ev.target.closest('a, .rel-link')) return;
        ev.preventDefault();
        const spec = String(el.getAttribute('data-dops-lens') || '');
        const [quad, tab] = spec.split(':');
        if (!quad || !tab) return;
        if (quad === 'comm') STATE.dailyOpsCommLens = tab;
        else if (quad === 'deals') STATE.dailyOpsDealsLens = tab;
        else if (quad === 'treasury') STATE.dailyOpsTreasuryLens = tab;
        else if (quad === 'plant') STATE.dailyOpsPlantLens = tab;
        renderApp();
      });
    });

    // Non-table interactive cards/chips opening 360 Record Inspector directly
    if (typeof showRecordInspector === 'function') {
      container.querySelectorAll('[data-dops-inspect-rkey]').forEach(el => {
        el.addEventListener('click', ev => {
          if (ev.target && ev.target.closest && ev.target.closest('a, button, .rel-link')) return;
          ev.preventDefault();
          const rk = el.getAttribute('data-dops-inspect-rkey');
          const rid = el.getAttribute('data-dops-inspect-rid');
          if (rk && rid) showRecordInspector(rk, rid);
        });
      });
    }

    // Open & Close Discrete Day Records Drawer
    container.querySelectorAll('[data-dops-open-drawer]').forEach(el => {
      el.addEventListener('click', ev => {
        if (ev.target && ev.target.closest && ev.target.closest('a, .rel-link')) return;
        ev.preventDefault();
        const filt = el.getAttribute('data-dops-open-drawer') || 'all';
        STATE.dailyOpsStreamFilter = filt;
        STATE.dailyOpsDrawerOpen = true;
        renderApp();
      });
    });

    const closeDrawer = () => {
      if (!STATE.dailyOpsDrawerOpen) return;
      STATE.dailyOpsDrawerOpen = false;
      renderApp();
    };
    const closeBtn = container.querySelector('#dopsCloseDrawerBtn');
    const backdrop = container.querySelector('#dopsDrawerBackdrop');
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
    if (backdrop) backdrop.addEventListener('click', closeDrawer);

    if (!window.__dopsEscBound) {
      window.__dopsEscBound = true;
      document.addEventListener('keydown', ev => {
        if (ev.key === 'Escape' && STATE.view === 'daily_ops' && STATE.dailyOpsDrawerOpen) {
          const insp = document.getElementById('recordInspector');
          if (insp && insp.classList.contains('open')) return;
          STATE.dailyOpsDrawerOpen = false;
          renderApp();
        }
      });
    }

    // Domain Filter Chips inside Discrete Drawer
    container.querySelectorAll('[data-dops-stream]').forEach(btn => {
      btn.addEventListener('click', ev => {
        ev.preventDefault();
        STATE.dailyOpsStreamFilter = btn.getAttribute('data-dops-stream') || 'all';
        STATE.dailyOpsDrawerOpen = true;
        renderApp();
      });
    });

    // Live Search inside Discrete Drawer (patches #dopsStreamScroll only so input focus never drops!)
    const searchInp = container.querySelector('#dopsDrawerSearchInput');
    const scrollBox = container.querySelector('#dopsStreamScroll');
    if (searchInp && scrollBox) {
      searchInp.addEventListener('input', () => {
        STATE.dailyOpsDrawerSearch = searchInp.value || '';
        if (!_lastDayModel) return;
        const { ctx: lCtx, dm: lDm } = _lastDayModel;
        const allowedCos = lCtx.allowedCompanyNames() || [];
        const isSingleCo = STATE.company !== 'manufacturing-group' && !String(STATE.company || '').startsWith('industry:') || allowedCos.length === 1;
        scrollBox.innerHTML = renderDrawerTableHtml(lCtx, lDm, STATE.dailyOpsStreamFilter || 'all', STATE.dailyOpsDrawerSearch, isSingleCo);
        if (typeof stripNativeTitles === 'function') stripNativeTitles(scrollBox);
        if (typeof showRecordInspector === 'function') {
          scrollBox.querySelectorAll('tr.rrow[data-rid]').forEach(tr => {
            tr.addEventListener('click', e => {
              if (e.target && e.target.closest && e.target.closest('[data-rel-key], button, a, input, select')) return;
              showRecordInspector(tr.getAttribute('data-rkey'), tr.getAttribute('data-rid'));
            });
          });
        }
      });
    }
  }

  window.MFG_DAILY_OPS = {
    isAfterHoursTicket,
    fmtHumanDay,
    buildDayModel,
    render,
    wire
  };
})();
