/* ============================================================================
   ISABI Systems — Shareholder Daily Operations Briefing (js/daily_ops.js)
   1. Strictly Transaction-Date driven (ignores Reporting Date & global period).
   2. Bridges Yesterday's After-Hours Sales & Raw tickets logged after close.
   3. Fits cleanly on one single desktop screen for instant shareholder clarity.
   ============================================================================ */
(function () {
  'use strict';

  const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  let _txIndexCacheKey = '';
  let _txIndexCacheVal = null;

  function txDateOf(r) {
    return String((r && r.date) || '').slice(0, 10);
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
    const { STATE, SEED, MIN_DATE, MAX_DATE } = ctx;
    const scopeKey = String(STATE.company || 'manufacturing-group');
    const allowed = (ctx.allowedCompanyNames() || []).join(',');
    const cr = STATE.customRecords || {};
    const crCount = Object.keys(cr).reduce((acc, k) => acc + (Array.isArray(cr[k]) ? cr[k].length : 0), 0);
    const rec = (SEED && SEED.records) || {};
    const salesLen = Array.isArray(rec.sales_tickets) ? rec.sales_tickets.length : 0;
    const rawLen = Array.isArray(rec.raw_purchases) ? rec.raw_purchases.length : 0;
    const expLen = Array.isArray(rec.expenses) ? rec.expenses.length : 0;
    const punchLen = Array.isArray(STATE.kioskPunches) ? STATE.kioskPunches.length : 0;
    const key = `${scopeKey}|${allowed}|${SEED._customRev || 0}|${STATE._customRev || 0}|${crCount}|${salesLen}|${rawLen}|${expLen}|${punchLen}`;
    if (_txIndexCacheVal && _txIndexCacheKey === key) return _txIndexCacheVal;

    const matchCo = buildCompanyMatcher(ctx, scopeKey);
    const opDateSet = new Set();

    const indexTable = (list, markActiveDay) => {
      const byDate = new Map();
      if (!Array.isArray(list)) return byDate;
      for (let i = 0; i < list.length; i++) {
        const row = list[i];
        if (!matchCo(row)) continue;
        const d = txDateOf(row);
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

    const salesByDate = indexTable(rec.sales_tickets, true);
    const rawByDate = indexTable(rec.raw_purchases, true);
    const expByDate = indexTable(rec.expenses, true);
    const rcptByDate = indexTable(rec.receipts, true);
    const setByDate = indexTable(rec.settlements, true);
    const fuelByDate = indexTable(rec.fuel_intakes, true);
    const salByDate = indexTable(rec.salaries, true);
    const attByDate = indexTable(rec.attendance, false);
    const extByDate = indexTable(rec.external_movements, false);
    const loanByDate = indexTable(rec.loan_settlements, false);
    const convByDate = indexTable(rec.conversions, false);
    const malfByDate = indexTable(rec.fuel_malfunctions, false);
    const defByDate = indexTable(rec.equipment_defects, false);
    const partByDate = indexTable(rec.part_movements, false);

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
      rcptByDate,
      setByDate,
      fuelByDate,
      salByDate,
      attByDate,
      extByDate,
      loanByDate,
      convByDate,
      malfByDate,
      defByDate,
      partByDate,
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
    let loads = 0, deliveryLoads = 0, pickupLoads = 0, otLoads = 0, returnsCount = 0;
    let ttc = 0, vat = 0, netMat = 0, grossExVat = 0, transRev = 0, m3 = 0, tons = 0;
    let aggM3 = 0, aggTtc = 0;
    let cashTtc = 0, cashNet = 0, creditTtc = 0, creditNet = 0, commUsd = 0, discUsd = 0;
    for (let i = 0; i < rows.length; i++) {
      const s = rows[i];
      const sgn = ctx.ticketSign(s);
      if (sgn === 0) continue;
      if (sgn < 0) returnsCount += 1;
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
      discUsd: ctx.round2(discUsd)
    };
  }

  function summarizeRawList(ctx, rows) {
    let loads = 0, otLoads = 0, ownLoads = 0, haulerLoads = 0;
    let matCost = 0, haulCost = 0, totalCost = 0, m3 = 0, tons = 0;
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
      m3: ctx.round2(m3),
      tons: ctx.round2(tons)
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
    const { STATE, round2 } = ctx;
    const idx = getDailyTxIndex(ctx);
    const targetDate = resolveTargetDate(ctx, idx);
    const yestDate = shiftIsoDays(targetDate, -1);
    const includeAh = STATE.dailyOpsIncludeAfterHours !== false;

    const daySales = idx.salesByDate.get(targetDate) || [];
    const ahSalesAll = (idx.salesByDate.get(yestDate) || []).filter(isAfterHoursTicket);
    const dayRaw = idx.rawByDate.get(targetDate) || [];
    const ahRawAll = (idx.rawByDate.get(yestDate) || []).filter(isAfterHoursTicket);

    const effSales = includeAh && ahSalesAll.length ? ahSalesAll.concat(daySales) : daySales;
    const effRaw = includeAh && ahRawAll.length ? ahRawAll.concat(dayRaw) : dayRaw;

    const salesSum = summarizeSalesList(ctx, effSales);
    const salesTodayOnly = summarizeSalesList(ctx, daySales);
    const salesAhSum = summarizeSalesList(ctx, ahSalesAll);

    const rawSum = summarizeRawList(ctx, effRaw);
    const rawTodayOnly = summarizeRawList(ctx, dayRaw);
    const rawAhSum = summarizeRawList(ctx, ahRawAll);

    const ahAvailableCount = ahSalesAll.length + ahRawAll.length;
    const ahAvailableUsd = round2(salesAhSum.ttc + rawAhSum.totalCost);

    // Expenses on targetDate (txDate)
    const dayExps = idx.expByDate.get(targetDate) || [];
    let expTotal = 0, expExVat = 0, cashExp = 0, creditExp = 0, expCount = 0;
    const pendingExps = [];
    for (let i = 0; i < dayExps.length; i++) {
      const x = dayExps[i];
      if (ctx.isPendingPriceExpense(x)) pendingExps.push(x);
      const sgn = ctx.expenseSign(x);
      if (sgn === 0) continue;
      expCount += 1;
      const a = Number(x.amount || 0) * sgn;
      expTotal += a;
      if (ctx.expenseKind(x) !== 'VAT') expExVat += a;
      if (ctx.isApCreditExpense(x)) creditExp += a;
      else if (ctx.isCashExpense(x)) cashExp += a;
    }
    expTotal = round2(expTotal);
    expExVat = round2(expExVat);
    cashExp = round2(cashExp);
    creditExp = round2(creditExp);

    // Receipts & Settlements on targetDate (txDate)
    const dayRcpts = idx.rcptByDate.get(targetDate) || [];
    let arCollected = 0, arRcptCount = 0;
    for (let i = 0; i < dayRcpts.length; i++) {
      const r = dayRcpts[i];
      if (ctx.receiptKind(r) === 'Settlement') {
        arCollected += Number(r.amount || 0) + Number(r.discount || 0);
        arRcptCount += 1;
      }
    }
    arCollected = round2(arCollected);

    const daySets = idx.setByDate.get(targetDate) || [];
    let apPaid = 0, apSetCount = 0;
    for (let i = 0; i < daySets.length; i++) {
      const sp = daySets[i];
      if (ctx.settlementKind(sp) === 'Payment') {
        apPaid += Number(sp.amount || 0) + Number(sp.discount || 0);
        apSetCount += 1;
      }
    }
    apPaid = round2(apPaid);

    // Salaries & External Cash on targetDate (txDate)
    const daySals = idx.salByDate.get(targetDate) || [];
    let salariesPaid = 0;
    for (let i = 0; i < daySals.length; i++) salariesPaid += Number(daySals[i].amount || 0);
    salariesPaid = round2(salariesPaid);

    const dayExts = idx.extByDate.get(targetDate) || [];
    let extIn = 0, extOut = 0;
    for (let i = 0; i < dayExts.length; i++) {
      const ex = dayExts[i];
      const a = Number(ex.amount || 0);
      if (/out|expense/i.test(String(ex.direction || ex.flow || ''))) extOut += a;
      else extIn += a;
    }
    extIn = round2(extIn);
    extOut = round2(extOut);

    // Day Profit & Cash Flow
    const grossMargin = round2(salesSum.netMat - rawSum.totalCost);
    const gmPct = salesSum.netMat > 0 ? grossMargin / salesSum.netMat : 0;
    const operatingProfit = round2(salesSum.grossExVat - (rawSum.totalCost + expExVat + salariesPaid + salesSum.commUsd));
    const opMarginPct = salesSum.grossExVat > 0 ? operatingProfit / salesSum.grossExVat : 0;

    const cashInflow = round2(salesSum.cashNet + arCollected + extIn);
    const cashOutflow = round2(cashExp + apPaid + salariesPaid + extOut);
    const netCashFlow = round2(cashInflow - cashOutflow);

    const liveKpi = ctx.getKPI ? ctx.getKPI() : {};
    const liveTillUsd = Number(liveKpi.cash_till_usd != null ? liveKpi.cash_till_usd : (liveKpi.cash_till || 0));
    const liveTillLbp = Number(liveKpi.cash_till_lbp || 0);

    // Fleet, Diesel, Maintenance & Workforce on targetDate
    const dayFuels = idx.fuelByDate.get(targetDate) || [];
    let dieselIssuedL = 0, dieselBoughtL = 0, lubeL = 0, greaseKg = 0;
    const activeTruckSet = new Set();
    const activeStaffSet = new Set();
    let companyFleetTrips = 0, haulerTrips = 0;

    effSales.forEach(s => {
      if (s.truck) activeTruckSet.add(ctx.norm(s.truck));
      if (s.transport_by === 'Company fleet') {
        companyFleetTrips += 1;
        if (s.driver) activeStaffSet.add(ctx.norm(s.driver));
      } else if (s.truck) {
        haulerTrips += 1;
      }
    });
    effRaw.forEach(r => {
      if (r.truck) activeTruckSet.add(ctx.norm(r.truck));
      if (r.transport_by === 'Company fleet') {
        companyFleetTrips += 1;
        if (r.driver) activeStaffSet.add(ctx.norm(r.driver));
      } else if (r.truck) {
        haulerTrips += 1;
      }
    });
    dayExps.forEach(x => {
      if (ctx.isBulkDieselExpense(x)) dieselBoughtL += Number(x.qty || 0) * ctx.expenseSign(x);
    });
    dayFuels.forEach(fl => {
      if (fl.equipment) activeTruckSet.add(ctx.norm(fl.equipment));
      if (fl.driver) activeStaffSet.add(ctx.norm(fl.driver));
      const itemStr = String(fl.item || fl.fuel_type || 'Diesel');
      const q = Number(fl.litres || 0);
      if (ctx.isDieselTankRefillIntake(fl)) dieselBoughtL += q;
      else if (/grease/i.test(itemStr)) greaseKg += q;
      else if (/diesel|mazout/i.test(itemStr)) dieselIssuedL += q;
      else lubeL += q;
    });

    const dayAtt = idx.attByDate.get(targetDate) || [];
    let attOtHours = 0, absentCount = 0;
    dayAtt.forEach(a => {
      const st = String(a.status || a.type || '').toLowerCase();
      if (/absent|leave|off|sick/.test(st) || Number(a.leave_days || 0) > 0) {
        absentCount += 1;
      } else if (a.staff) {
        activeStaffSet.add(ctx.norm(a.staff));
      }
      attOtHours += Number(a.overtime_hours || 0);
    });
    (STATE.kioskPunches || []).forEach(p => {
      if (p && !p.voided && String(p.date || p.timestamp || '').slice(0, 10) === targetDate && p.staff) {
        activeStaffSet.add(ctx.norm(p.staff));
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
    const dayMalfs = idx.malfByDate.get(targetDate) || [];
    const openCritDefects = idx.openDefects.filter(d => /crit|breakdown|down/i.test(String(d.severity || d.priority || '')));
    const dayDefects = idx.defByDate.get(targetDate) || [];

    // Count records on targetDate whose statutory Reporting Date differs from Transaction Date
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

    // 7-Day Transaction Pulse & Benchmark (up to 6 active days prior to targetDate + targetDate)
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
    const ahIdSet = new Set();
    ahSalesAll.forEach(s => { if (s.id) ahIdSet.add(s.id); });
    ahRawAll.forEach(r => { if (r.id) ahIdSet.add(r.id); });

    const bucketIdxForTime = tStr => {
      const m = String(tStr || '12:00').match(/^(\d{1,2})/);
      const hr = m ? Number(m[1]) : 12;
      if (hr < 11) return 1;
      if (hr < 15) return 2;
      if (hr < 18) return 3;
      return 4;
    };
    effSales.forEach(s => {
      const sgn = ctx.ticketSign(s);
      if (sgn <= 0) return;
      const bi = ahIdSet.has(s.id) ? 0 : bucketIdxForTime(s.time);
      hourBuckets[bi].salesLoads += 1;
      hourBuckets[bi].salesTtc = round2(hourBuckets[bi].salesTtc + Number(s.total_ttc != null ? s.total_ttc : s.total || 0));
    });
    effRaw.forEach(r => {
      const bi = ahIdSet.has(r.id) ? 0 : bucketIdxForTime(r.time);
      hourBuckets[bi].rawLoads += 1;
      hourBuckets[bi].rawCost = round2(hourBuckets[bi].rawCost + Number(r.total != null ? r.total : (Number(r.cost || 0) + Number(r.trans_cost || 0))));
    });

    // Breakdown 1: By Entity (BU)
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
      const bProfit = round2(ss.grossExVat - (rs.totalCost + bxExVat + bSalAmt + ss.commUsd));
      const bNetCash = round2((ss.cashNet + bRcptAmt) - (bxCash + bSetAmt + bSalAmt));
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

    // Breakdown 2: Top Customers
    const custMap = new Map();
    effSales.forEach(s => {
      if (!s.customer) return;
      const sgn = ctx.ticketSign(s);
      if (!sgn) return;
      const ck = ctx.norm(s.customer);
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
      const ck = ctx.norm(r.customer);
      let cur = custMap.get(ck);
      if (!cur) {
        cur = { name: r.customer, loads: 0, ahLoads: 0, m3: 0, ttc: 0, cashTtc: 0, creditTtc: 0, collected: 0 };
        custMap.set(ck, cur);
      }
      cur.collected = round2(cur.collected + Number(r.amount || 0) + Number(r.discount || 0));
    });
    const customerRows = Array.from(custMap.values()).sort((a, b) => (b.ttc - a.ttc) || (b.collected - a.collected));

    // Breakdown 3: Materials & Quarry Grades
    const prodMap = new Map();
    effSales.forEach(s => {
      if (!s.product) return;
      const sgn = ctx.ticketSign(s);
      if (!sgn) return;
      const pk = ctx.norm(s.product);
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
      const pk = ctx.norm(r.product);
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

    // Breakdown 4: Expenses & Cash Settlements Summary
    const expCatMap = new Map();
    dayExps.forEach(x => {
      const sgn = ctx.expenseSign(x);
      if (!sgn && !ctx.isPendingPriceExpense(x)) return;
      const catLbl = [x.category, x.subcategory].filter(Boolean).join(' · ') || 'General Expense';
      const ck = ctx.norm(catLbl);
      let cur = expCatMap.get(ck);
      if (!cur) {
        cur = { label: catLbl, kind: 'Expense', count: 0, method: x.method || 'Cash', amount: 0, pending: 0 };
        expCatMap.set(ck, cur);
      }
      cur.count += 1;
      if (ctx.isPendingPriceExpense(x)) cur.pending += 1;
      cur.amount = round2(cur.amount + Number(x.amount || 0) * (sgn || 1));
    });
    dayRcpts.forEach(r => {
      if (ctx.receiptKind(r) !== 'Settlement') return;
      const ck = 'rcpt|' + ctx.norm(r.customer || 'Customer');
      let cur = expCatMap.get(ck);
      if (!cur) {
        cur = { label: r.customer || 'Customer Receipt', kind: 'AR Receipt', count: 0, method: r.method || 'Cash', amount: 0, pending: 0 };
        expCatMap.set(ck, cur);
      }
      cur.count += 1;
      cur.amount = round2(cur.amount + Number(r.amount || 0) + Number(r.discount || 0));
    });
    daySets.forEach(s => {
      if (ctx.settlementKind(s) !== 'Payment') return;
      const ck = 'set|' + ctx.norm(s.supplier || 'Supplier');
      let cur = expCatMap.get(ck);
      if (!cur) {
        cur = { label: s.supplier || 'Supplier Payment', kind: 'AP Paid', count: 0, method: s.method || 'Cash', amount: 0, pending: 0 };
        expCatMap.set(ck, cur);
      }
      cur.count += 1;
      cur.amount = round2(cur.amount + Number(s.amount || 0) + Number(s.discount || 0));
    });
    const expCashRows = Array.from(expCatMap.values()).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

    // Unified Live Operational Stream (every row clickable for 360 Record Inspector)
    const compactRef = (raw, id, prefix) => {
      const s = String(raw || '').trim();
      if (s && s !== '-') {
        const hashMatch = s.match(/#[A-Za-z0-9-]+$/);
        if (hashMatch) return hashMatch[0];
        if (s.length <= 11 && !/\s/.test(s)) return s;
        const numTail = s.match(/(\d{2,8})$/);
        if (numTail) return `#${numTail[1]}`;
      }
      const idStr = String(id || '').trim();
      const idNum = idStr.match(/(\d{2,8})$/);
      if (idNum) return `${prefix}#${idNum[1]}`;
      return idStr ? idStr.slice(0, 8) : prefix;
    };

    const stream = [];
    effSales.forEach(s => {
      const sgn = ctx.ticketSign(s);
      const isAh = ahIdSet.has(s.id);
      const m3 = Number(ctx.ticketMeters(s) || 0) * (sgn || 1);
      const qtyTxt = m3 !== 0 ? `${ctx.fmtNum(m3, m3 % 1 ? 1 : 0)} m³` : `${ctx.fmtNum(Number(s.qty || 0), 0)} ${s.uom || ''}`.trim();
      const amt = round2(Number(s.total_ttc != null ? s.total_ttc : s.total || 0) * (sgn || 1));
      stream.push({
        rkey: 'sales_tickets',
        rid: s.id,
        company: s.company || 'WTC',
        group: 'sales',
        kindCls: 'sales',
        kindLbl: sgn < 0 ? 'Return' : 'Sale',
        isAfterHours: isAh,
        txDate: txDateOf(s),
        time: s.time || '',
        ref: s.ticket_no ? `#${s.ticket_no}` : compactRef(s.name, s.id, 'S'),
        party: s.customer || 'Walk-in',
        detail: [s.product, s.site, s.method].filter(Boolean).join(' · '),
        qtyTxt,
        amount: amt,
        inflow: amt >= 0,
        tier: 1,
        sortKey: String(s.time || '12:00').padStart(5, '0') + '_' + String(s.ticket_no || '').padStart(8, '0')
      });
    });
    effRaw.forEach(r => {
      const isAh = ahIdSet.has(r.id);
      const m3 = Number(ctx.ticketMeters(r) || 0);
      const qtyTxt = m3 !== 0 ? `${ctx.fmtNum(m3, m3 % 1 ? 1 : 0)} m³` : `${ctx.fmtNum(Number(r.qty || 0), 0)} ${r.uom || ''}`.trim();
      const amt = round2(Number(r.total != null ? r.total : (Number(r.cost || 0) + Number(r.trans_cost || 0))));
      stream.push({
        rkey: 'raw_purchases',
        rid: r.id,
        company: r.company || 'WTC',
        group: 'raw',
        kindCls: 'raw',
        kindLbl: 'Raw',
        isAfterHours: isAh,
        txDate: txDateOf(r),
        time: r.time || '',
        ref: r.ticket_no ? `#${r.ticket_no}` : compactRef(r.name, r.id, 'R'),
        party: r.site_owner || r.truck_owner || r.site || 'Quarry',
        detail: [r.product, r.site, r.truck].filter(Boolean).join(' · '),
        qtyTxt,
        amount: amt,
        inflow: false,
        tier: 1,
        sortKey: String(r.time || '12:00').padStart(5, '0') + '_' + String(r.ticket_no || '').padStart(8, '0')
      });
    });
    dayExps.forEach(x => {
      const sgn = ctx.expenseSign(x);
      if (!sgn && !ctx.isPendingPriceExpense(x)) return;
      const amt = round2(Number(x.amount || 0) * (sgn || 1));
      stream.push({
        rkey: 'expenses',
        rid: x.id,
        company: x.company || 'WTC',
        group: 'expenses',
        kindCls: 'exp',
        kindLbl: ctx.isPendingPriceExpense(x) ? 'Pending' : 'Expense',
        isAfterHours: false,
        txDate: txDateOf(x),
        time: '',
        ref: x.invoice ? `#${x.invoice}` : compactRef(x.reference || x.name, x.id, 'EX'),
        party: x.supplier || x.category || 'Expense',
        detail: [x.category, x.subcategory, x.equipment].filter(Boolean).join(' · '),
        qtyTxt: Number(x.qty || 0) > 1 ? `${ctx.fmtNum(Number(x.qty), 0)} qty` : (x.method || 'Cash'),
        amount: amt,
        inflow: false,
        tier: 2,
        sortKey: String(Math.round(Math.abs(amt))).padStart(9, '0') + '_' + String(x.id || '')
      });
    });
    dayRcpts.forEach(r => {
      if (ctx.receiptKind(r) === 'Excluded') return;
      const amt = round2(Number(r.amount || 0) + Number(r.discount || 0));
      stream.push({
        rkey: 'receipts',
        rid: r.id,
        company: r.company || 'WTC',
        group: 'cash_fuel',
        kindCls: 'cash',
        kindLbl: 'AR In',
        isAfterHours: false,
        txDate: txDateOf(r),
        time: '',
        ref: compactRef(r.reference || r.name, r.id, 'RC'),
        party: r.customer || 'Customer',
        detail: `${r.method || 'Cash'} Receipt`,
        qtyTxt: r.method || 'Cash',
        amount: amt,
        inflow: true,
        tier: 3,
        sortKey: String(Math.round(Math.abs(amt))).padStart(9, '0') + '_' + String(r.id || '')
      });
    });
    daySets.forEach(s => {
      if (ctx.settlementKind(s) === 'Excluded') return;
      const amt = round2(Number(s.amount || 0) + Number(s.discount || 0));
      stream.push({
        rkey: 'settlements',
        rid: s.id,
        company: s.company || 'WTC',
        group: 'cash_fuel',
        kindCls: 'pay',
        kindLbl: 'AP Out',
        isAfterHours: false,
        txDate: txDateOf(s),
        time: '',
        ref: compactRef(s.invoice || s.reference || s.name, s.id, 'ST'),
        party: s.supplier || 'Supplier',
        detail: `${s.method || 'Cash'} Settlement`,
        qtyTxt: s.method || 'Cash',
        amount: amt,
        inflow: false,
        tier: 3,
        sortKey: String(Math.round(Math.abs(amt))).padStart(9, '0') + '_' + String(s.id || '')
      });
    });
    dayFuels.forEach(fl => {
      const q = Number(fl.litres || 0);
      const itemStr = String(fl.item || fl.fuel_type || 'Diesel');
      const unitStr = /grease/i.test(itemStr) ? 'kg' : 'L';
      stream.push({
        rkey: 'fuel_intakes',
        rid: fl.id,
        company: fl.company || 'WTC',
        group: 'cash_fuel',
        kindCls: 'fuel',
        kindLbl: 'Fuel',
        isAfterHours: false,
        txDate: txDateOf(fl),
        time: '',
        ref: fl.ticket_no ? `#${fl.ticket_no}` : compactRef(fl.name, fl.id, 'FL'),
        party: fl.equipment || 'Plant Tank',
        detail: [itemStr, fl.driver].filter(Boolean).join(' · '),
        qtyTxt: `${ctx.fmtNum(q, q % 1 ? 1 : 0)} ${unitStr}`,
        amount: null,
        inflow: false,
        tier: 4,
        sortKey: String(Math.round(q)).padStart(7, '0') + '_' + String(fl.id || '')
      });
    });

    // Sort After-Hours items right at the top when included, then Sales & Quarry dispatches (newest first), then Expenses, AR/AP & Fuel
    stream.sort((a, b) => {
      if (a.isAfterHours !== b.isAfterHours) return a.isAfterHours ? -1 : 1;
      if (a.tier !== b.tier) return a.tier - b.tier;
      return b.sortKey.localeCompare(a.sortKey);
    });

    const curIdx = idx.sortedOpDates.indexOf(targetDate);
    const prevCalendarDate = shiftIsoDays(targetDate, -1);
    const nextCalendarDate = shiftIsoDays(targetDate, 1);

    return {
      idx,
      targetDate,
      yestDate,
      prevDate: prevCalendarDate >= ctx.MIN_DATE ? prevCalendarDate : '',
      nextDate: nextCalendarDate <= ctx.MAX_DATE ? nextCalendarDate : '',
      curActiveIdx: curIdx,
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
      expTotal,
      expExVat,
      cashExp,
      creditExp,
      expCount,
      pendingExps,
      arCollected,
      arRcptCount,
      apPaid,
      apSetCount,
      salariesPaid,
      salCount: daySals.length,
      grossMargin,
      gmPct,
      operatingProfit,
      opMarginPct,
      cashInflow,
      cashOutflow,
      netCashFlow,
      liveTillUsd,
      liveTillLbp,
      activeTrucksCount: activeTruckSet.size,
      companyFleetTrips,
      haulerTrips,
      dieselIssuedL: round2(dieselIssuedL),
      dieselBoughtL: round2(dieselBoughtL),
      lubeL: round2(lubeL),
      greaseKg: round2(greaseKg),
      fuelFillsCount: dayFuels.length,
      closingTankL,
      closingTankLbl,
      dayMalfs,
      openCritDefects,
      dayDefects,
      activeStaffCount: activeStaffSet.size,
      absentCount,
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
      expCashRows,
      stream
    };
  }

  function renderPulseSvg(ctx, dm, chartMode) {
    const { esc, fmtUSD, fmtUSDk, fmtNum } = ctx;
    const W = 560, H = 128, padL = 44, padR = 12, padT = 14, padB = 24;
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
      const barW = Math.min(24, Math.max(8, grpW * 0.28));

      const grid = [0, 0.5, 1].map(f => {
        const y = (padT + plotH * (1 - f)).toFixed(1);
        const val = Math.round(maxLoads * f);
        return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(128,138,158,0.18)" stroke-dasharray="3 3"/>
                <text x="${padL - 6}" y="${Number(y) + 3}" text-anchor="end" font-size="9.5" fill="var(--muted)">${val}</text>`;
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
            <text x="${cx.toFixed(1)}" y="${H - 7}" text-anchor="middle" font-size="9.5" font-weight="${isAhSlot ? '700' : '600'}" fill="${isAhSlot ? 'var(--brass-strong, var(--brass))' : 'var(--muted)'}">${esc(b.label)}</text>
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
    const barW = Math.min(18, Math.max(6, grpW * 0.24));

    const grid = [0, 0.5, 1].map(f => {
      const y = (padT + plotH * (1 - f)).toFixed(1);
      const val = maxVal * f;
      return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(128,138,158,0.18)" stroke-dasharray="3 3"/>
              <text x="${padL - 6}" y="${Number(y) + 3}" text-anchor="end" font-size="9.5" fill="var(--muted)">${fmtUSDk(val)}</text>`;
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
          <text x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9.5" font-weight="${isSelected ? '700' : '500'}" fill="${isSelected ? 'var(--ink)' : 'var(--muted)'}">${esc(fmtAxisDay(r.date))}</text>
        </g>
      `;
    }).join('');

    const polyLine = profitPts.length > 1
      ? `<polyline fill="none" stroke="var(--chart-good, #1F7A4C)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${profitPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" pointer-events="none"/>`
      : '';
    const dots = profitPts.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.2" fill="${p.pos ? 'var(--chart-good, #1F7A4C)' : 'var(--chart-crit, #C8333B)'}" stroke="var(--surface)" stroke-width="1.3" pointer-events="none"/>`).join('');

    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="7-day transaction pulse">${grid}${bars}${polyLine}${dots}</svg>`;
  }

  function renderBreakdownTable(ctx, dm, activeTab, isSingleCo) {
    const { esc, fmtUSD, fmtNum, coBadge, relLink } = ctx;

    if (activeTab === 'entities' && !isSingleCo) {
      const rows = dm.entityRows;
      const totSales = rows.reduce((a, r) => a + r.salesTtc, 0);
      const totOut = rows.reduce((a, r) => a + r.outlay, 0);
      const totProf = rows.reduce((a, r) => a + r.opProfit, 0);
      const totCash = rows.reduce((a, r) => a + r.netCash, 0);
      const totSL = rows.reduce((a, r) => a + r.salesLoads, 0);
      const totRL = rows.reduce((a, r) => a + r.rawLoads, 0);
      return `
        <table class="dops-table">
          <thead>
            <tr>
              <th>Operating Entity</th>
              <th class="r">Loads (S / R)</th>
              <th class="r">Sales TTC</th>
              <th class="r">Raw + Exp</th>
              <th class="r">Day Profit</th>
              <th class="r">Net Cash</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr class="dops-click-row" data-jump-co="${esc(r.key)}">
                <td>${coBadge(r.name)} <strong>${esc(r.name)}</strong></td>
                <td class="r">${fmtNum(r.salesLoads)} / ${fmtNum(r.rawLoads)}</td>
                <td class="r"><strong>${fmtUSD(r.salesTtc, 0)}</strong></td>
                <td class="r">${fmtUSD(r.outlay, 0)}</td>
                <td class="r" style="color:${r.opProfit < 0 ? 'var(--crit)' : 'var(--good)'}"><strong>${fmtUSD(r.opProfit, 0)}</strong></td>
                <td class="r">${fmtUSD(r.netCash, 0)}</td>
              </tr>
            `).join('') || `<tr><td colspan="6" class="dops-empty">No entity activity on this date</td></tr>`}
          </tbody>
          <tfoot>
            <tr>
              <td>Total (${rows.length} Entities)</td>
              <td class="r">${fmtNum(totSL)} / ${fmtNum(totRL)}</td>
              <td class="r">${fmtUSD(totSales, 0)}</td>
              <td class="r">${fmtUSD(totOut, 0)}</td>
              <td class="r">${fmtUSD(totProf, 0)}</td>
              <td class="r">${fmtUSD(totCash, 0)}</td>
            </tr>
          </tfoot>
        </table>
      `;
    }

    if (activeTab === 'materials') {
      const rows = dm.productRows;
      if (!rows.length) return `<div class="dops-empty">No material dispatches or quarry loads on this date.</div>`;
      const totSM3 = rows.reduce((a, r) => a + r.salesM3, 0);
      const totSTtc = rows.reduce((a, r) => a + r.salesTtc, 0);
      const totRM3 = rows.reduce((a, r) => a + r.rawM3, 0);
      const totRCost = rows.reduce((a, r) => a + r.rawCost, 0);
      return `
        <table class="dops-table">
          <thead>
            <tr>
              <th>Product / Grade</th>
              <th class="r">Sold Volume</th>
              <th class="r">Sales TTC</th>
              <th class="r">Quarry In</th>
              <th class="r">Raw Cost</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${relLink('products', r.name, r.name, true)}</td>
                <td class="r">${r.salesLoads ? `${fmtNum(r.salesM3, 0)} m³ <small style="color:var(--muted)">(${r.salesLoads})</small>` : '-'}</td>
                <td class="r">${r.salesTtc ? `<strong>${fmtUSD(r.salesTtc, 0)}</strong>` : '-'}</td>
                <td class="r">${r.rawLoads ? `${fmtNum(r.rawM3, 0)} m³ <small style="color:var(--muted)">(${r.rawLoads})</small>` : '-'}</td>
                <td class="r">${r.rawCost ? fmtUSD(r.rawCost, 0) : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td>Total (${rows.length} Grades)</td>
              <td class="r">${fmtNum(totSM3, 0)} m³</td>
              <td class="r">${fmtUSD(totSTtc, 0)}</td>
              <td class="r">${fmtNum(totRM3, 0)} m³</td>
              <td class="r">${fmtUSD(totRCost, 0)}</td>
            </tr>
          </tfoot>
        </table>
      `;
    }

    if (activeTab === 'expenses') {
      const rows = dm.expCashRows;
      if (!rows.length) return `<div class="dops-empty">No expenses, AR receipts, or AP settlements recorded on this date.</div>`;
      return `
        <table class="dops-table">
          <thead>
            <tr>
              <th>Category / Counterparty</th>
              <th>Type</th>
              <th class="r">Items</th>
              <th>Method</th>
              <th class="r">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => {
              const cls = r.kind === 'AR Receipt' ? 'cash' : (r.kind === 'AP Paid' ? 'pay' : 'exp');
              return `
                <tr>
                  <td class="dops-trunc"><strong>${esc(r.label)}</strong></td>
                  <td><span class="dops-kind ${cls}">${esc(r.kind)}</span></td>
                  <td class="r">${fmtNum(r.count)}</td>
                  <td>${esc(r.method)}</td>
                  <td class="r"><strong>${r.pending && r.amount === 0 ? 'Pending ($0)' : fmtUSD(r.amount, 0)}</strong></td>
                </tr>
              `;
            }).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2">Day Summary</td>
              <td class="r">${fmtNum(dm.expCount + dm.arRcptCount + dm.apSetCount)}</td>
              <td>Exp / AR / AP</td>
              <td class="r">Exp ${fmtUSD(dm.expTotal, 0)} · AR ${fmtUSD(dm.arCollected, 0)}</td>
            </tr>
          </tfoot>
        </table>
      `;
    }

    // Default: Top Customers
    const rows = dm.customerRows;
    if (!rows.length) return `<div class="dops-empty">No customer sales or collections on this date.</div>`;
    const maxCustTtc = Math.max(1, ...rows.map(r => Math.abs(r.ttc)));
    return `
      <table class="dops-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th class="r">Loads</th>
            <th class="r">Volume</th>
            <th class="r">Sales TTC</th>
            <th class="r">AR Collected</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => {
            const pct = Math.min(100, Math.max(0, Math.round((Math.abs(r.ttc) / maxCustTtc) * 100)));
            return `
              <tr>
                <td>
                  ${relLink('customers', r.name, r.name, true)}
                  ${r.ahLoads > 0 ? `<span class="dops-ah-badge">${ctx.ic('moon')}+${r.ahLoads}</span>` : ''}
                </td>
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
            <td>Total (${rows.length} Customers)</td>
            <td class="r">${fmtNum(dm.salesSum.loads)}</td>
            <td class="r">${fmtNum(dm.salesSum.m3, 0)} m³</td>
            <td class="r">${fmtUSD(dm.salesSum.ttc, 0)}</td>
            <td class="r">${fmtUSD(dm.arCollected, 0)}</td>
          </tr>
        </tfoot>
      </table>
    `;
  }

  function render(ctx) {
    const { STATE, esc, ic, fmtUSD, fmtUSDk, fmtLBP, fmtNum, coBadge } = ctx;
    const dm = buildDayModel(ctx);
    const today = ctx.todayISO();
    const yestWall = shiftIsoDays(today, -1);

    const allowedCos = ctx.allowedCompanyNames() || [];
    const isSingleCo = STATE.company !== 'manufacturing-group' && !String(STATE.company || '').startsWith('industry:') || allowedCos.length === 1;

    const chartMode = STATE.dailyOpsChartMode === 'hours' ? 'hours' : 'pulse';
    const rawTab = STATE.dailyOpsTab || (isSingleCo ? 'customers' : 'entities');
    const activeTab = (rawTab === 'entities' && isSingleCo) ? 'customers' : rawTab;
    const streamFilter = STATE.dailyOpsStreamFilter || 'all';

    // Benchmark delta badges vs 7-day average
    const salesVs7 = dm.avg7Sales > 0 ? Math.round(((dm.salesSum.ttc - dm.avg7Sales) / dm.avg7Sales) * 100) : null;
    const salesDeltaBadge = salesVs7 != null
      ? `<span class="dops-kpi-delta ${salesVs7 >= 0 ? 'good' : (salesVs7 <= -25 ? 'warn' : 'neutral')}" data-ui-tip="7-day active daily average: ${esc(fmtUSD(dm.avg7Sales, 0))}/day (Transaction Date)">${salesVs7 >= 0 ? '+' : ''}${salesVs7}% vs 7d</span>`
      : `<span class="dops-kpi-delta neutral">Tx Date</span>`;

    const profPctTxt = `${(dm.opMarginPct * 100).toFixed(1)}%`;
    const profDeltaCls = dm.operatingProfit < 0 ? 'crit' : 'good';

    // Filter Stream Rows
    const filteredStream = dm.stream.filter(row => {
      if (streamFilter === 'after_hours') return row.isAfterHours;
      if (streamFilter === 'sales') return row.group === 'sales';
      if (streamFilter === 'raw') return row.group === 'raw';
      if (streamFilter === 'expenses') return row.group === 'expenses';
      if (streamFilter === 'cash_fuel') return row.group === 'cash_fuel';
      return true;
    });

    const ahStreamCount = dm.stream.filter(r => r.isAfterHours).length;
    const salesStreamCount = dm.stream.filter(r => r.group === 'sales').length;
    const rawStreamCount = dm.stream.filter(r => r.group === 'raw').length;
    const expStreamCount = dm.stream.filter(r => r.group === 'expenses').length;
    const cfStreamCount = dm.stream.filter(r => r.group === 'cash_fuel').length;

    // Build Shareholder Attention Pills
    const digestPills = [];
    if (dm.ahAvailableCount > 0) {
      if (dm.includeAh) {
        digestPills.push(`<button type="button" class="dops-dpill ah" data-dops-stream="after_hours">${ic('moon')} +${fmtNum(dm.ahAvailableCount)} Yesterday After-Hours (${fmtUSD(dm.ahAvailableUsd, 0)})</button>`);
      } else {
        digestPills.push(`<button type="button" class="dops-dpill warn" data-dops-toggle-ah="1">${ic('moon')} ${fmtNum(dm.ahAvailableCount)} After-Hours hidden (${fmtUSD(dm.ahAvailableUsd, 0)}) · Click to include</button>`);
      }
    }
    if (dm.pendingExps.length > 0) {
      digestPills.push(`<button type="button" class="dops-dpill warn" data-dops-stream="expenses">${ic('clock')} ${fmtNum(dm.pendingExps.length)} Pending-Price ${dm.pendingExps.length === 1 ? 'Delivery' : 'Deliveries'} ($0)</button>`);
    }
    if (dm.openCritDefects.length > 0) {
      digestPills.push(`<button type="button" class="dops-dpill crit" data-nav-jump="fleet_maint">${ic('wrench')} ${fmtNum(dm.openCritDefects.length)} Critical ${dm.openCritDefects.length === 1 ? 'Defect' : 'Defects'} Open</button>`);
    }
    if (dm.dayMalfs.length > 0) {
      digestPills.push(`<button type="button" class="dops-dpill warn" data-nav-jump="fleet">${ic('fuel')} ${fmtNum(dm.dayMalfs.length)} Tank Variance ${dm.dayMalfs.length === 1 ? 'Event' : 'Events'}</button>`);
    }
    if (dm.salesSum.returnsCount > 0 || dm.salesSum.discUsd > 0) {
      const bits = [];
      if (dm.salesSum.returnsCount > 0) bits.push(`${dm.salesSum.returnsCount} ${dm.salesSum.returnsCount === 1 ? 'Return' : 'Returns'}`);
      if (dm.salesSum.discUsd > 0) bits.push(`Disc ${fmtUSD(dm.salesSum.discUsd, 0)}`);
      digestPills.push(`<button type="button" class="dops-dpill" data-dops-stream="sales">${esc(bits.join(' · '))}</button>`);
    }
    if (dm.otTotalLoads > 0) {
      digestPills.push(`<button type="button" class="dops-dpill" data-dops-stream="all">${ic('clock')} ${fmtNum(dm.otTotalLoads)} Overtime ${dm.otTotalLoads === 1 ? 'Load' : 'Loads'}</button>`);
    }
    if (dm.repShiftedCount > 0) {
      digestPills.push(`<span class="dops-dpill" data-ui-tip="${dm.repShiftedCount} ${dm.repShiftedCount === 1 ? 'entry' : 'entries'} transacted on ${dm.targetDate} ${dm.repShiftedCount === 1 ? 'carries' : 'carry'} a different accounting Reporting Date. Daily Operations always shows physical Transaction Date activity.">${ic('calendar')} ${fmtNum(dm.repShiftedCount)} Rep-Date Shifted Kept Live</span>`);
    }
    if (!digestPills.length) {
      digestPills.push(`<span class="dops-dpill good">${ic('check_circle')} All plant & ledger controls clean on ${esc(fmtShortDay(dm.targetDate))}</span>`);
    }

    const topCust = dm.customerRows[0];
    if (topCust && topCust.ttc > 0 && digestPills.length < 4) {
      digestPills.push(`<button type="button" class="dops-dpill" data-dops-tab="customers">Top Client: ${esc(topCust.name.slice(0, 18))} (${fmtUSD(topCust.ttc, 0)})</button>`);
    }

    const ahBtnTip = dm.ahAvailableCount > 0
      ? `Includes ${dm.ahSalesCount} Sales & ${dm.ahRawCount} Raw tickets from ${fmtShortDay(dm.yestDate)} logged via Yesterday's After-Hours after accountants left`
      : `Includes Sales & Raw tickets from ${fmtShortDay(dm.yestDate)} logged via Yesterday's After-Hours (0 logged for ${fmtShortDay(dm.yestDate)})`;

    return `
      <div class="dops-stage" id="dailyOpsStage" data-target-date="${esc(dm.targetDate)}" data-include-ah="${dm.includeAh ? '1' : '0'}">
        <!-- BAND 1: EXECUTIVE DAY & AFTER-HOURS COMMAND BAR -->
        <div class="dops-bar" id="dopsHeaderBar">
          <div class="dops-bar-left">
            <div class="dops-title-group">
              <h1 class="dops-page-title cockpit-title">Daily Operations</h1>
              <span class="dops-active-date-lbl" id="dopsActiveDateLabel">${esc(fmtHumanDay(dm.targetDate))}</span>
              <span class="dops-basis-tag" id="dopsTxBasisBadge" data-ui-tip="Always anchored to physical Transaction Date regardless of whether the global system filter is set to Reporting Date or Transaction Date.">${ic('lock')} Transaction Date Basis</span>
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
          </div>
        </div>

        <!-- BAND 2: 5-PILLAR SHAREHOLDER SCORECARD -->
        <section class="dops-kpis" id="dopsKpiGrid" aria-label="Daily Shareholder Scorecard">
          <div class="dops-kpi accent-sales" data-dops-stream="sales" role="button" tabindex="0">
            <div class="dops-kpi-top">
              <span class="dops-kpi-lbl">Sales (TTC)</span>
              ${salesDeltaBadge}
            </div>
            <div class="dops-kpi-val-row">
              <span class="dops-kpi-val" id="dopsKpiSalesVal">${fmtUSD(dm.salesSum.ttc, 0)}</span>
              <span class="dops-kpi-unit">${fmtNum(dm.salesSum.loads)} ${dm.salesSum.loads === 1 ? 'load' : 'loads'} · ${fmtNum(dm.salesSum.m3, 0)} m³</span>
            </div>
            <div class="dops-kpi-sub">
              ${dm.includeAh && dm.salesAhSum.count > 0
                ? `<span class="dops-kpi-ah">${ic('moon')} +${fmtUSD(dm.salesAhSum.ttc, 0)} (${dm.salesAhSum.loads}) night before</span> · Today <b>${fmtUSD(dm.salesTodayOnly.ttc, 0)}</b>`
                : `Cash <b>${dm.salesSum.cashTtc >= 1000 ? fmtUSDk(dm.salesSum.cashTtc) : fmtUSD(dm.salesSum.cashTtc, 0)}</b> · Credit <b>${dm.salesSum.creditTtc >= 1000 ? fmtUSDk(dm.salesSum.creditTtc) : fmtUSD(dm.salesSum.creditTtc, 0)}</b> · <b>${fmtUSD(dm.salesSum.avgPriceTtc, 1)}/m³</b>`}
            </div>
          </div>

          <div class="dops-kpi accent-raw" data-dops-stream="raw" role="button" tabindex="0">
            <div class="dops-kpi-top">
              <span class="dops-kpi-lbl">Quarry &amp; Haulage</span>
              <span class="dops-kpi-delta neutral">${fmtNum(dm.rawSum.tons, 0)} t</span>
            </div>
            <div class="dops-kpi-val-row">
              <span class="dops-kpi-val" id="dopsKpiRawVal">${fmtUSD(dm.rawSum.totalCost, 0)}</span>
              <span class="dops-kpi-unit">${fmtNum(dm.rawSum.loads)} ${dm.rawSum.loads === 1 ? 'load' : 'loads'} · ${fmtNum(dm.rawSum.m3, 0)} m³</span>
            </div>
            <div class="dops-kpi-sub">
              ${dm.includeAh && dm.rawAhSum.count > 0
                ? `<span class="dops-kpi-ah">${ic('moon')} +${fmtUSD(dm.rawAhSum.totalCost, 0)} (${dm.rawAhSum.loads}) night before</span> · Today <b>${fmtUSD(dm.rawTodayOnly.totalCost, 0)}</b>`
                : `Material <b>${fmtUSD(dm.rawSum.matCost, 0)}</b> · Haulage <b>${fmtUSD(dm.rawSum.haulCost, 0)}</b>`}
            </div>
          </div>

          <div class="dops-kpi accent-profit${dm.operatingProfit < 0 ? ' is-neg' : ''}" data-dops-tab="expenses" role="button" tabindex="0">
            <div class="dops-kpi-top">
              <span class="dops-kpi-lbl">Operating Profit</span>
              <span class="dops-kpi-delta ${profDeltaCls}">${esc(profPctTxt)}</span>
            </div>
            <div class="dops-kpi-val-row">
              <span class="dops-kpi-val ${dm.operatingProfit < 0 ? 'crit' : ''}" id="dopsKpiProfitVal">${fmtUSD(dm.operatingProfit, 0)}</span>
              <span class="dops-kpi-unit">GM ${fmtUSD(dm.grossMargin, 0)}</span>
            </div>
            <div class="dops-kpi-sub">
              Exp <b>${fmtUSD(dm.expTotal, 0)}</b> (${fmtNum(dm.expCount)})${dm.avg7Profit ? ` · 7d avg <b>${fmtUSD(dm.avg7Profit, 0)}</b>` : ''}
            </div>
          </div>

          <div class="dops-kpi accent-cash" data-dops-stream="cash_fuel" role="button" tabindex="0">
            <div class="dops-kpi-top">
              <span class="dops-kpi-lbl">Net Cash &amp; Till</span>
              <span class="dops-kpi-delta ${dm.netCashFlow > 0 ? 'good' : (dm.netCashFlow < 0 ? 'warn' : 'neutral')}">${dm.netCashFlow > 0 ? 'Net In' : (dm.netCashFlow < 0 ? 'Net Out' : 'Even')}</span>
            </div>
            <div class="dops-kpi-val-row">
              <span class="dops-kpi-val" id="dopsKpiCashVal">${dm.netCashFlow > 0 ? '+' : ''}${fmtUSD(dm.netCashFlow, 0)}</span>
              <span class="dops-kpi-unit">In ${fmtUSDk(dm.cashInflow)} · Out ${fmtUSDk(dm.cashOutflow)}</span>
            </div>
            <div class="dops-kpi-sub">
              Till: <b>${fmtUSD(dm.liveTillUsd, 0)}</b>${dm.liveTillLbp ? ` + <b>${fmtLBP(dm.liveTillLbp)}</b>` : ''}
            </div>
          </div>

          <div class="dops-kpi accent-plant" data-dops-stream="cash_fuel" role="button" tabindex="0">
            <div class="dops-kpi-top">
              <span class="dops-kpi-lbl">Plant, Diesel &amp; Team</span>
              <span class="dops-kpi-delta ${dm.openCritDefects.length > 0 ? 'crit' : 'neutral'}">${dm.openCritDefects.length > 0 ? `${dm.openCritDefects.length} Crit` : `${fmtNum(dm.activeStaffCount)} Staff`}</span>
            </div>
            <div class="dops-kpi-val-row">
              <span class="dops-kpi-val">${fmtNum(dm.activeTrucksCount)} Units</span>
              <span class="dops-kpi-unit">${fmtNum(dm.dieselIssuedL, 0)} L Diesel</span>
            </div>
            <div class="dops-kpi-sub">
              ${dm.closingTankL != null ? `${esc(dm.closingTankLbl)} <b>${fmtNum(dm.closingTankL, 0)} L</b> · ` : ''}Own <b>${fmtNum(dm.companyFleetTrips)}</b> · Haul <b>${fmtNum(dm.haulerTrips)}</b>
            </div>
          </div>
        </section>

        <!-- BAND 3+4: ONE-PAGE DUAL EXECUTIVE WORKSPACE -->
        <div class="dops-main-grid">
          <!-- LEFT COLUMN: 7-DAY PULSE + BREAKDOWN DECK -->
          <div class="dops-col">
            <div class="dops-card" id="dopsPulseCard">
              <div class="dops-card-hd">
                <div class="dops-card-title-wrap">
                  <h2 class="dops-card-title">${chartMode === 'hours' ? 'Dispatch Rhythm Across the Day' : '7-Day Transaction Pulse'}</h2>
                  <div class="dops-legend">
                    <span><i class="dops-sw" style="background:var(--chart-navy, #2356A8)"></i>Sales</span>
                    <span><i class="dops-sw" style="background:var(--chart-brass, #C0892F)"></i>${chartMode === 'hours' ? 'Quarry' : 'Raw + Exp'}</span>
                    ${chartMode === 'pulse' ? `<span><i class="dops-sw" style="background:var(--chart-good, #1F7A4C);border-radius:50%"></i>Profit</span>` : ''}
                  </div>
                </div>
                <div class="dops-seg" role="tablist" aria-label="Chart View">
                  <button type="button" class="dops-seg-btn${chartMode === 'pulse' ? ' active' : ''}" data-dops-chart="pulse">7-Day Trend</button>
                  <button type="button" class="dops-seg-btn${chartMode === 'hours' ? ' active' : ''}" data-dops-chart="hours">By Shift</button>
                </div>
              </div>
              <div class="dops-pulse-body">
                <div class="dops-chart-wrap" id="dopsChartWrap">
                  ${renderPulseSvg(ctx, dm, chartMode)}
                </div>
                <div class="dops-mini-strip">
                  <div class="dops-mini-cell" data-dops-stream="cash_fuel">
                    <small>AR Collected (${fmtNum(dm.arRcptCount)})</small>
                    <b>${fmtUSD(dm.arCollected, 0)}</b>
                  </div>
                  <div class="dops-mini-cell" data-dops-stream="cash_fuel">
                    <small>AP Settled (${fmtNum(dm.apSetCount)})</small>
                    <b>${fmtUSD(dm.apPaid, 0)}</b>
                  </div>
                  <div class="dops-mini-cell" data-dops-stream="sales">
                    <small>Deliv. / Pickup</small>
                    <b>${fmtNum(dm.salesSum.deliveryLoads)} / ${fmtNum(dm.salesSum.pickupLoads)} loads</b>
                  </div>
                  <div class="dops-mini-cell" data-dops-toggle-ah="1">
                    <small>After-Hours (${esc(fmtShortDay(dm.yestDate))})</small>
                    <b>${dm.ahAvailableCount > 0 ? `${dm.includeAh ? 'Incl.' : 'Off'} · ${dm.ahAvailableCount} (${fmtUSDk(dm.ahAvailableUsd)})` : 'None logged'}</b>
                  </div>
                </div>
              </div>
            </div>

            <div class="dops-card is-flex" id="dopsBreakdownCard">
              <div class="dops-card-hd">
                <div class="dops-card-title-wrap">
                  <h2 class="dops-card-title">Operational Breakdown</h2>
                  <span class="dops-card-sub">Click any counterparty or product for 360° view</span>
                </div>
                <div class="dops-seg" role="tablist" aria-label="Operational Breakdown">
                  ${!isSingleCo ? `<button type="button" class="dops-seg-btn${activeTab === 'entities' ? ' active' : ''}" data-dops-tab="entities">By Entity</button>` : ''}
                  <button type="button" class="dops-seg-btn${activeTab === 'customers' ? ' active' : ''}" data-dops-tab="customers">Customers (${fmtNum(dm.customerRows.length)})</button>
                  <button type="button" class="dops-seg-btn${activeTab === 'materials' ? ' active' : ''}" data-dops-tab="materials">Grades (${fmtNum(dm.productRows.length)})</button>
                  <button type="button" class="dops-seg-btn${activeTab === 'expenses' ? ' active' : ''}" data-dops-tab="expenses">Exp &amp; Cash</button>
                </div>
              </div>
              <div class="dops-scroll">
                ${renderBreakdownTable(ctx, dm, activeTab, isSingleCo)}
              </div>
            </div>
          </div>

          <!-- RIGHT COLUMN: SHAREHOLDER DIGEST + UNIFIED TRANSACTION STREAM -->
          <div class="dops-col">
            <div class="dops-digest-card" id="dopsAttentionCard">
              <div class="dops-digest-top">
                <span class="dops-digest-kicker">${ic('sentinels')} Shareholder Digest &amp; Exceptions</span>
                <span class="dops-card-sub">${fmtNum(dm.stream.length)} physical entries</span>
              </div>
              <div class="dops-digest-pills">
                ${digestPills.join('')}
              </div>
            </div>

            <div class="dops-card is-flex" id="dopsStreamCard">
              <div class="dops-card-hd">
                <div class="dops-card-title-wrap">
                  <h2 class="dops-card-title">Day &amp; After-Hours Stream</h2>
                </div>
                <div class="dops-seg" role="tablist" aria-label="Stream Filter">
                  <button type="button" class="dops-seg-btn${streamFilter === 'all' ? ' active' : ''}" data-dops-stream="all">All (${fmtNum(dm.stream.length)})</button>
                  <button type="button" class="dops-seg-btn is-ah-tab${ahStreamCount > 0 ? ' has-ah' : ''}${streamFilter === 'after_hours' ? ' active' : ''}" data-dops-stream="after_hours">After-Hours (${fmtNum(ahStreamCount)})</button>
                  <button type="button" class="dops-seg-btn${streamFilter === 'sales' ? ' active' : ''}" data-dops-stream="sales">Sales (${fmtNum(salesStreamCount)})</button>
                  <button type="button" class="dops-seg-btn${streamFilter === 'raw' ? ' active' : ''}" data-dops-stream="raw">Raw (${fmtNum(rawStreamCount)})</button>
                  <button type="button" class="dops-seg-btn${streamFilter === 'expenses' ? ' active' : ''}" data-dops-stream="expenses">Exp (${fmtNum(expStreamCount)})</button>
                  <button type="button" class="dops-seg-btn${streamFilter === 'cash_fuel' ? ' active' : ''}" data-dops-stream="cash_fuel">Cash &amp; Fuel (${fmtNum(cfStreamCount)})</button>
                </div>
              </div>
              <div class="dops-scroll" id="dopsStreamScroll">
                ${filteredStream.length ? `
                  <table class="dops-table dops-stream-tbl" id="dopsStreamTable">
                    <colgroup>
                      <col style="width:100px">
                      <col style="width:62px">
                      <col>
                      <col style="width:62px">
                      <col style="width:66px">
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Ref</th>
                        <th>Type</th>
                        <th>Counterparty &amp; Item</th>
                        <th class="r">Vol</th>
                        <th class="r">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${filteredStream.slice(0, 120).map(row => `
                        <tr class="rrow${row.isAfterHours ? ' is-afterhours-row' : ''}" data-rkey="${esc(row.rkey)}" data-rid="${esc(String(row.rid || ''))}">
                          <td class="mono dops-ref-cell">
                            <strong>${esc(row.ref)}</strong>${row.time ? `<small class="dops-time-tag">${esc(row.time)}</small>` : ''}
                          </td>
                          <td class="dops-type-cell">
                            <span class="dops-kind ${row.kindCls}">${esc(row.kindLbl)}</span>
                          </td>
                          <td class="dops-trunc">${!isSingleCo ? `${coBadge(row.company)} ` : ''}${row.isAfterHours ? `<span class="dops-ah-badge" data-ui-tip="Occurred on ${esc(fmtShortDay(row.txDate))} after accountants left · logged via Yesterday's After-Hours">${ic('moon')}After-Hours</span>` : ''}<strong>${esc(row.party)}</strong>${row.detail ? ` <span style="color:var(--muted)">· ${esc(row.detail)}</span>` : ''}</td>
                          <td class="r dops-vol-cell">${esc(row.qtyTxt || '-')}</td>
                          <td class="r dops-amt-cell">${row.amount == null ? '-' : `<strong style="color:${row.inflow ? 'var(--good)' : 'var(--ink)'}">${fmtUSD(row.amount, 0)}</strong>`}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colspan="5">
                          <div class="dops-stream-foot-flex">
                            <span>${filteredStream.length > 120 ? `Showing 120 of ${fmtNum(filteredStream.length)} entries` : `Total (${fmtNum(filteredStream.length)} ${filteredStream.length === 1 ? 'entry' : 'entries'})`}</span>
                            <span>${streamFilter === 'all'
                              ? `Sales ${fmtUSD(dm.salesSum.ttc, 0)} · Out ${fmtUSD(dm.rawSum.totalCost + dm.expTotal, 0)}`
                              : fmtUSD(filteredStream.reduce((acc, r) => acc + (r.amount != null ? Number(r.amount) : 0), 0), 0)}</span>
                          </div>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                ` : `<div class="dops-empty">${streamFilter === 'after_hours' ? `No Yesterday's After-Hours tickets were logged for ${esc(fmtShortDay(dm.yestDate))}.` : `No operational entries recorded on ${esc(fmtHumanDay(dm.targetDate))}.`}</div>`}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function wire(container, ctx) {
    if (!container) return;
    const { STATE, renderApp } = ctx;

    const pickBtns = container.querySelectorAll('[data-dops-pick-date]');
    pickBtns.forEach(el => {
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

    container.querySelectorAll('[data-dops-chart]').forEach(btn => {
      btn.addEventListener('click', ev => {
        ev.preventDefault();
        STATE.dailyOpsChartMode = btn.getAttribute('data-dops-chart') || 'pulse';
        renderApp();
      });
    });

    container.querySelectorAll('[data-dops-tab]').forEach(btn => {
      btn.addEventListener('click', ev => {
        ev.preventDefault();
        STATE.dailyOpsTab = btn.getAttribute('data-dops-tab') || 'customers';
        renderApp();
      });
    });

    container.querySelectorAll('[data-dops-stream]').forEach(btn => {
      btn.addEventListener('click', ev => {
        if (ev.target && ev.target.closest && ev.target.closest('a, .rel-link')) return;
        ev.preventDefault();
        const nextF = btn.getAttribute('data-dops-stream') || 'all';
        STATE.dailyOpsStreamFilter = (STATE.dailyOpsStreamFilter === nextF && !btn.classList.contains('dops-seg-btn')) ? 'all' : nextF;
        renderApp();
      });
    });
  }

  window.MFG_DAILY_OPS = {
    isAfterHoursTicket,
    fmtHumanDay,
    buildDayModel,
    render,
    wire
  };
})();
