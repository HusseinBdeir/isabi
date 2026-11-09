/* ============================================================================
 * ISABI — Interactive Fleet Revenue & Operating Cost Studio
 * Live Dynamic Engine:
 *   - 100% driven by the active topbar Period / Date Slicer & Rep/Tx Basis
 *     via window.MFG_ENTERPRISE.filterRecords (zero static cutover lock).
 *   - Valuation Modes:
 *     1. Booked Revenue (Recorded Ledger P&L)
 *     2. + Unbundled Delivery (Strict Adjusted P&L)
 *     3. Full Commercial Value (Full Benchmark P&L)
 *   - Interactive Visual Scorecards, Proportion Bars, Monthly Timeline,
 *     1-Click Drill-Downs, Route/Expense/Driver Interactive Cards, and
 *     360° Inspector Deep Links.
 * ============================================================================ */
(function () {
  'use strict';

  var TRUCK_META = {
    TB1: {
      code: 'TB1', displayCode: 'TB1', plate: '360676', owner: 'Karim Bdeir',
      driver: 'Majed Karam / Ahmad Hamoud', driverShort: 'Majed Karam',
      color: '#1D4ED8', bg: 'rgba(29, 78, 216, 0.08)', border: 'rgba(29, 78, 216, 0.28)'
    },
    Tb7: {
      code: 'Tb7', displayCode: 'Tb7', plate: '364656', owner: 'Hussein Bdeir',
      driver: 'Mohamad Habib', driverShort: 'Mohamad Habib',
      color: '#0F766E', bg: 'rgba(15, 118, 110, 0.08)', border: 'rgba(15, 118, 110, 0.28)'
    },
    Tb9: {
      code: 'Tb9', displayCode: 'Tb9', plate: '364168', owner: 'Jad Bdeir',
      driver: 'Ali Saleh', driverShort: 'Ali Saleh',
      color: '#B45309', bg: 'rgba(180, 83, 9, 0.08)', border: 'rgba(180, 83, 9, 0.28)'
    },
    TB8: {
      code: 'TB8', displayCode: 'TB8', plate: '360678', owner: 'WTC Fleet',
      driver: 'Ibrahim / WTC Pool', driverShort: 'WTC Pool',
      color: '#4338CA', bg: 'rgba(67, 56, 202, 0.08)', border: 'rgba(67, 56, 202, 0.28)'
    },
    Tb4: {
      code: 'Tb4', displayCode: 'Tb4', plate: '360674', owner: 'WTC Fleet',
      driver: 'WTC Pool Driver', driverShort: 'WTC Pool',
      color: '#6D28D9', bg: 'rgba(109, 40, 217, 0.08)', border: 'rgba(109, 40, 217, 0.28)'
    },
    TB3: {
      code: 'TB3', displayCode: 'TB3', plate: '360673', owner: 'WTC Fleet',
      driver: 'WTC Pool Driver', driverShort: 'WTC Pool',
      color: '#0369A1', bg: 'rgba(3, 105, 161, 0.08)', border: 'rgba(3, 105, 161, 0.28)'
    },
    Tb2: {
      code: 'Tb2', displayCode: 'Tb2', plate: '360672', owner: 'WTC Fleet',
      driver: 'WTC Pool Driver', driverShort: 'WTC Pool',
      color: '#BE185D', bg: 'rgba(190, 24, 93, 0.08)', border: 'rgba(190, 24, 93, 0.28)'
    }
  };

  var COHORTS = [
    { id: 'bdeir3', label: 'Bdeir Fleet (3: TB1 · Tb7 · Tb9)', trucks: ['TB1', 'Tb7', 'Tb9'] },
    { id: 'wtc4', label: 'WTC Own Trucks (4: TB8 · Tb4 · TB3 · Tb2)', trucks: ['TB8', 'Tb4', 'TB3', 'Tb2'] },
    { id: 'core7', label: 'Core 7 Trucks', trucks: ['Tb7', 'Tb9', 'TB1', 'TB8', 'Tb4', 'TB3', 'Tb2'] },
    { id: 'afif', label: 'Afif & Ibrahim Bdeir', trucks: ['Afif Bdeir', 'Ibrahim Bdeir'] },
    { id: 'top10', label: 'Top Active Haulers', trucks: [] }
  ];

  var STATE = {
    mode: 'strict',         // 'recorded' | 'strict' | 'full'
    subtab: 'pnl',          // 'pnl' | 'routes' | 'zero' | 'expenses' | 'overtime' | 'recon'
    pnlView: 'visual',      // 'visual' | 'monthly' | 'table'
    cohort: 'bdeir3',
    selectedTrucks: ['TB1', 'Tb7', 'Tb9'],
    focusedTruck: 'ALL',
    companyFilter: 'ALL',   // 'ALL' | 'WTC' | 'BBConstruction' | 'Lions Transport'
    routeSort: 'trips_desc',
    routeCompany: 'ALL',
    routeTruck: 'ALL',
    routeSearch: '',
    zeroStream: 'ALL',
    zeroClass: 'ALL',
    zeroTruck: 'ALL',
    expCategory: 'ALL',
    expCompany: 'ALL',
    expTruck: 'ALL',
    expSearch: '',
    otDriver: 'ALL',
    otTruck: 'ALL',
    truckPickerOpen: false,
    truckPickerQuery: ''
  };

  var LIVE_CACHE = null;
  var LIVE_CACHE_KEY = '';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtMoney(n, decimals) {
    var d = decimals == null ? 2 : decimals;
    var val = Number(n || 0);
    var sign = val < 0 ? '-' : '';
    var abs = Math.abs(val);
    return sign + '$' + abs.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function fmtSignedMoney(n, decimals) {
    var val = Number(n || 0);
    if (val > 0.004) return '+' + fmtMoney(val, decimals);
    if (val < -0.004) return fmtMoney(val, decimals);
    return '$0.00';
  }

  function fmtNum(n, decimals) {
    var d = decimals == null ? 1 : decimals;
    return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function fmtInt(n) {
    return Math.round(Number(n || 0)).toLocaleString('en-US');
  }

  function pct(part, total, d) {
    if (!total) return '0.0%';
    var dec = d == null ? 1 : d;
    return ((Number(part || 0) / Number(total)) * 100).toFixed(dec) + '%';
  }

  function normTruckCode(raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    var up = s.toUpperCase();
    if (up === 'TB1' || s.indexOf('360676') >= 0) return 'TB1';
    if (up === 'TB7' || s.indexOf('364656') >= 0) return 'Tb7';
    if (up === 'TB9' || s.indexOf('364168') >= 0) return 'Tb9';
    if (up === 'TB8' || s.indexOf('360678') >= 0) return 'TB8';
    if (up === 'TB4' || s.indexOf('360674') >= 0) return 'Tb4';
    if (up === 'TB3' || s.indexOf('360673') >= 0) return 'TB3';
    if (up === 'TB2' || s.indexOf('360672') >= 0) return 'Tb2';
    if (up === 'TB6') return 'Tb6';
    if (up === 'TB5') return 'TB5';
    return s;
  }

  function getTruckMeta(code) {
    var c = normTruckCode(code);
    if (TRUCK_META[c]) return TRUCK_META[c];
    var palette = ['#2563EB', '#0D9488', '#D97706', '#7C3AED', '#DB2777', '#0284C7', '#4F46E5'];
    var h = 0;
    for (var i = 0; i < c.length; i++) h = (h * 31 + c.charCodeAt(i)) % palette.length;
    var col = palette[h];
    return {
      code: c, displayCode: c, plate: '', owner: 'Fleet / Hauler',
      driver: 'Assigned Hauler', driverShort: 'Hauler',
      color: col, bg: 'rgba(37, 99, 235, 0.06)', border: 'rgba(37, 99, 235, 0.24)'
    };
  }

  function truckLabel(code) {
    var m = getTruckMeta(code);
    return m.plate ? (m.displayCode + ' · ' + m.plate) : m.displayCode;
  }

  function truckShortLabel(code) {
    var m = getTruckMeta(code);
    return m.displayCode;
  }

  function activeDateSummary() {
    var ent = window.MFG_ENTERPRISE;
    var st = (ent && (ent.STATE || ent.state)) ? (ent.STATE || ent.state) : {};
    var basis = (st.basis === 'tx' || st.dateBasis === 'tx') ? 'Tx Date' : 'Rep Date';
    var pr = (ent && typeof ent.periodRange === 'function') ? ent.periodRange() : null;
    var from = '';
    var to = '';
    if (pr && typeof pr === 'object' && !Array.isArray(pr)) {
      from = pr.from || '';
      to = pr.to || '';
    } else if (Array.isArray(pr)) {
      from = pr[0] || '';
      to = pr[1] || '';
    } else {
      from = st.dateFrom || '';
      to = st.dateTo || '';
    }
    var p = st.period || 'all';
    if ((!from && !to) || p === 'all') {
      return { label: 'All-Time Ledger', range: 'All Recorded Dates', basis: basis, period: 'all', from: '', to: '' };
    }
    var lbl = (pr && pr.label) ? String(pr.label).replace('→', 'to') : ((from || 'Start') + ' to ' + (to || 'Latest'));
    return { label: lbl, range: (from || 'Start') + ' .. ' + (to || 'Latest'), basis: basis, period: p, from: from, to: to };
  }

  function applyQuickPeriod(kind) {
    var ent = window.MFG_ENTERPRISE;
    if (!ent || typeof ent.setDateFilter !== 'function') return;
    if (kind === 'all') { ent.setDateFilter({ reset: true }); return; }
    if (kind === 'year:2026') { ent.setDateFilter({ period: 'year:2026' }); return; }
    if (kind === 'year:2025') { ent.setDateFilter({ period: 'year:2025' }); return; }
    if (kind === 'qtd') { ent.setDateFilter({ period: 'custom', from: '2026-10-01', to: '2026-12-31' }); return; }
    if (kind === 'mtd') { ent.setDateFilter({ period: 'month:2026-10' }); return; }
  }

  function recDate(row, st) {
    if (!row) return '';
    var useTx = st && (st.basis === 'tx' || st.dateBasis === 'tx');
    if (useTx) return String(row.date || row.rep_date || row.reporting_date || '').slice(0, 10);
    return String(row.rep_date || row.reporting_date || row.date || '').slice(0, 10);
  }

  function openTopbarDatePicker(anchorEl) {
    var ent = window.MFG_ENTERPRISE;
    var btn = document.getElementById('dateRangeTriggerBtn') || anchorEl;
    if (ent && typeof ent.openDateFacilitator === 'function' && btn) {
      ent.openDateFacilitator(btn);
      return;
    }
    if (btn && typeof btn.click === 'function') btn.click();
  }

  /* --------------------------------------------------------------------------
   * Live Dynamic Engine (Filtered by Active Topbar Period / Date Slicer & RLS)
   * -------------------------------------------------------------------------- */
  function matchExpTruck(r) {
    var eq = String(r.equipment || '');
    var n = String(r.notes || '') + ' ' + String(r.bill_number || '') + ' ' + String(r.subcategory || '');
    if (eq.indexOf('TB1') >= 0 || eq.indexOf('360676') >= 0 || n.indexOf('360676') >= 0 || /\bTB\s*1\b/i.test(n)) return 'TB1';
    if (eq.indexOf('Tb7') >= 0 || eq.indexOf('TB7') >= 0 || eq.indexOf('364656') >= 0 || n.indexOf('364656') >= 0 || /\bTB\s*7\b/i.test(n)) return 'Tb7';
    if (eq.indexOf('Tb9') >= 0 || eq.indexOf('TB9') >= 0 || eq.indexOf('364168') >= 0 || n.indexOf('364168') >= 0 || /\bTB\s*9\b/i.test(n)) return 'Tb9';
    if (eq.indexOf('TB8') >= 0 || eq.indexOf('360678') >= 0 || n.indexOf('360678') >= 0 || /\bTB\s*8\b/i.test(n)) return 'TB8';
    if (eq.indexOf('Tb4') >= 0 || eq.indexOf('TB4') >= 0 || eq.indexOf('360674') >= 0 || n.indexOf('360674') >= 0 || /\bTB\s*4\b/i.test(n)) return 'Tb4';
    if (eq.indexOf('TB3') >= 0 || eq.indexOf('360673') >= 0 || n.indexOf('360673') >= 0 || /\bTB\s*3\b/i.test(n)) return 'TB3';
    if (eq.indexOf('Tb2') >= 0 || eq.indexOf('TB2') >= 0 || eq.indexOf('360672') >= 0 || n.indexOf('360672') >= 0 || /\bTB\s*2\b/i.test(n)) return 'Tb2';
    return normTruckCode(eq);
  }

  function matchOtDriverToTruck(driverName, equipment) {
    if (equipment) {
      var byEq = normTruckCode(equipment);
      if (byEq) return byEq;
    }
    var d = String(driverName || '').toLowerCase();
    if (d.indexOf('habib') >= 0) return 'Tb7';
    if (d.indexOf('ali saleh') >= 0) return 'Tb9';
    if (d.indexOf('majed') >= 0 || d.indexOf('karam') >= 0 || d.indexOf('hamoud') >= 0 || d.indexOf('hammoud') >= 0) return 'TB1';
    return '';
  }

  function scopedTableRows(tableKey) {
    var seed = window.MFG_SEED || window.SEED || {};
    var rec = seed.records ? seed.records : {};
    var raw = rec[tableKey] || [];
    var ent = window.MFG_ENTERPRISE;
    var rows = raw;
    if (ent && typeof ent.filterRecords === 'function') {
      rows = ent.filterRecords(raw, {
        company: 'manufacturing-group',
        ignoreSearch: true,
        tableKey: tableKey
      });
    }
    if (ent && typeof ent.allowedCompanyNames === 'function') {
      var allowed = ent.allowedCompanyNames();
      if (Array.isArray(allowed) && allowed.length) {
        var allowMap = {};
        for (var i = 0; i < allowed.length; i++) allowMap[allowed[i]] = true;
        rows = rows.filter(function (r) {
          return !r.company || allowMap[r.company];
        });
      }
    }
    return rows;
  }

  function computeLiveDataset() {
    var ent = window.MFG_ENTERPRISE;
    var st = (ent && (ent.STATE || ent.state)) ? (ent.STATE || ent.state) : {};
    var seedRev = (window.MFG_SEED && window.MFG_SEED._customRev) || 0;
    var allowedKey = (ent && typeof ent.allowedCompanyNames === 'function' && ent.allowedCompanyNames())
      ? ent.allowedCompanyNames().join(',') : 'ALL';
    var cacheKey = [
      st.company || '', st.period || '', st.dateGrain || '', st.dateFrom || '', st.dateTo || '',
      st.basis || st.dateBasis || 'rep', st.officialBookScope || '', st._officialScopeActive ? '1' : '0',
      st.userId || '', STATE.companyFilter || 'ALL', allowedKey, seedRev, st._indCustomRev || 0
    ].join('|');

    if (LIVE_CACHE && LIVE_CACHE_KEY === cacheKey) return LIVE_CACHE;

    var sales = scopedTableRows('sales_tickets');
    var raw = scopedTableRows('raw_purchases');
    if (!raw.length) raw = scopedTableRows('raw_materials');
    var diesel = scopedTableRows('fuel_intakes');
    if (!diesel.length) diesel = scopedTableRows('diesel_logs');
    var oils = scopedTableRows('equipment_oil_logs');
    var maint = scopedTableRows('equipment_repairs');
    var exp = scopedTableRows('expenses');
    var ot = scopedTableRows('overtime');
    var compFilter = STATE.companyFilter;

    function passComp(r) {
      if (!compFilter || compFilter === 'ALL') return true;
      var rc = String(r.company || '').toLowerCase();
      var fc = compFilter.toLowerCase();
      if (fc === 'bbconstruction') return rc.indexOf('bbc') >= 0;
      if (fc === 'wtc') return rc === 'wtc' || (rc.indexOf('bbc') < 0 && rc.indexOf('lion') < 0);
      return rc === fc;
    }

    var trucks = {};
    var monthsMap = {};

    function ensureTruck(code) {
      var c = normTruckCode(code);
      if (!c) return null;
      if (!trucks[c]) {
        var m = getTruckMeta(c);
        trucks[c] = {
          code: c, displayCode: m.displayCode, plate: m.plate,
          owner: m.owner, driver: m.driver, driverShort: m.driverShort,
          color: m.color, bg: m.bg, border: m.border,
          salesTrips: 0, salesPaidTrips: 0, salesZeroTrips: 0,
          salesWtcTrips: 0, salesBbcTrips: 0,
          salesQtyM3: 0, salesPaidQtyM3: 0, salesZeroQtyM3: 0,
          salesRev: 0, salesUnbundledCredit: 0, salesBenchmarkCredit: 0,
          rawTrips: 0, rawPaidTrips: 0, rawZeroTrips: 0,
          rawWtcTrips: 0, rawBbcTrips: 0,
          rawQtyM3: 0, rawPaidQtyM3: 0, rawZeroQtyM3: 0,
          rawRev: 0, rawMissingRateCredit: 0, rawBenchmarkCredit: 0,
          dieselEvents: 0, dieselLiters: 0, dieselCost: 0,
          repairs: 0, lubes: 0, insurance: 0, capex: 0, expCount: 0,
          driverBasePay: 0, driverOtHours: 0, driverOtPay: 0, driverTotalPay: 0,
          driverTripsMap: {}, monthsMap: {}
        };
      }
      return trucks[c];
    }

    function ensureMonth(ym) {
      var k = ym || 'Unspecified';
      if (!monthsMap[k]) {
        monthsMap[k] = { ym: k, trips: 0, qtyM3: 0, recordedRev: 0, strictCredit: 0, fullCredit: 0, dieselCost: 0, maintCost: 0, otPay: 0 };
      }
      return monthsMap[k];
    }

    function ensureTruckMonth(tObj, ym) {
      var k = ym || 'Unspecified';
      if (!tObj.monthsMap[k]) {
        tObj.monthsMap[k] = { ym: k, trips: 0, qtyM3: 0, recordedRev: 0, strictCredit: 0, fullCredit: 0, dieselCost: 0, maintCost: 0, otPay: 0 };
      }
      return tObj.monthsMap[k];
    }

    ['TB1', 'Tb7', 'Tb9', 'TB8', 'Tb4', 'TB3', 'Tb2'].forEach(ensureTruck);

    var routeAgg = {};
    var zeroRows = [];
    var overtimeRows = [];
    var driverMap = {};

    function recordTripOvertime(row, tableKey, streamLabel, tObj, dt, comp, drv, qty, deliv) {
      var otFlag = Number(row.overtime) || 0;
      if (otFlag <= 0) return;
      var otAmt = otFlag >= 2 ? 26 : 13;
      var otHrs = otFlag >= 2 ? 4 : 2;
      tObj.driverOtHours += otHrs;
      tObj.driverOtPay += otAmt;
      var ymKey = dt.slice(0, 7);
      ensureMonth(ymKey).otPay += otAmt;
      ensureTruckMonth(tObj, ymKey).otPay += otAmt;
      var dKey = drv || tObj.driverShort || 'Driver';
      if (!driverMap[dKey]) {
        driverMap[dKey] = { driver: dKey, truck: tObj.code, entries: 0, hours: 0, otPay: 0, rate: 6.5 };
      }
      driverMap[dKey].entries += 1;
      driverMap[dKey].hours += otHrs;
      driverMap[dKey].otPay += otAmt;
      overtimeRows.push({
        id: row.id || row.ticket_no || '', table: tableKey,
        date: dt, company: comp, driver: dKey, truck: tObj.code,
        hours: otHrs, rate: 6.5, pay: otAmt,
        notes: streamLabel + ' Bon #' + String(row.ticket_no || row.name || '—') + ' (' + fmtNum(qty, 1) + ' m³)'
      });
    }

    for (var i = 0; i < sales.length; i++) {
      var s = sales[i];
      if (s.voided || !passComp(s)) continue;
      var code = normTruckCode(s.truck || s.truck_code || s.equipment || s.transporter);
      if (!code) continue;
      var t = ensureTruck(code);
      var sSign = (ent && typeof ent.ticketSign === 'function') ? ent.ticketSign(s) : 1;
      if (sSign === 0) continue;
      var qty = Number(s.qty != null ? s.qty : (s.qty_m3 || 0)) * sSign;
      var deliv = Number(s.trans_price != null ? s.trans_price : (s.trans_total_usd != null ? s.trans_total_usd : (s.total_delivery_usd || 0))) * sSign;
      var unitP = Number(s.unit_price != null ? s.unit_price : (s.unit_price_usd || 0));
      var comp = String(s.company || 'WTC');
      var drv = String(s.driver || '').trim();
      var dtStr = recDate(s, st);
      var ym = dtStr.slice(0, 7);
      var siteStr = String(s.site || s.work_site || 'Site');

      t.salesTrips += 1;
      t.salesQtyM3 += qty;
      t.salesRev += deliv;
      if (comp.toLowerCase().indexOf('bbc') >= 0) t.salesBbcTrips += 1;
      else t.salesWtcTrips += 1;
      if (drv) t.driverTripsMap[drv] = (t.driverTripsMap[drv] || 0) + 1;
      recordTripOvertime(s, 'sales_tickets', 'Sales Delivery', t, dtStr, comp, drv, qty, deliv);

      var strictAdd = 0;
      var fullAdd = 0;
      if (Math.abs(deliv) > 0.001) {
        t.salesPaidTrips += 1;
        t.salesPaidQtyM3 += qty;
      } else {
        t.salesZeroTrips += 1;
        t.salesZeroQtyM3 += qty;
        var isUnbundled = unitP >= 55 && qty > 0;
        var shadow = qty > 0 ? (qty * 4.0) : 75.0;
        var bench = Math.max(qty * 5.0, 75.0);
        strictAdd = shadow;
        fullAdd = bench;
        t.salesUnbundledCredit += shadow;
        t.salesBenchmarkCredit += bench;
        zeroRows.push({
          id: s.id || '', table: 'sales_tickets', date: dtStr,
          company: comp, stream: 'Sales Delivery', truck: t.code, driver: drv || t.driverShort,
          counterparty: String(s.customer || 'Customer'), site: siteStr,
          material: String(s.product || 'Concrete'), qty_m3: qty, unit_price: unitP,
          total_product: Number(s.total_usd || s.total_sale_usd || 0) * sSign, recorded_haul: 0,
          classification: isUnbundled ? 'Unbundled C&D Price (>=$55/m³)' : 'Sales Delivery at $0.00 Haul Split',
          shadow_credit: shadow, benchmark_credit: bench
        });
      }

      var mObj = ensureMonth(ym);
      mObj.trips += 1; mObj.qtyM3 += qty; mObj.recordedRev += deliv;
      mObj.strictCredit += strictAdd; mObj.fullCredit += fullAdd;
      var tmObj = ensureTruckMonth(t, ym);
      tmObj.trips += 1; tmObj.qtyM3 += qty; tmObj.recordedRev += deliv;
      tmObj.strictCredit += strictAdd; tmObj.fullCredit += fullAdd;

      var rKey = [comp, 'Sales Delivery', t.code, s.customer || '—', siteStr, s.product || '—'].join('||');
      if (!routeAgg[rKey]) {
        routeAgg[rKey] = {
          company: comp, stream: 'Sales Delivery', truck: t.code,
          counterparty: String(s.customer || '—'), site: siteStr,
          material: String(s.product || '—'), trips: 0, paidTrips: 0, zeroTrips: 0,
          qtyM3: 0, rev: 0, shadowCredit: 0
        };
      }
      var ra = routeAgg[rKey];
      ra.trips += 1; ra.qtyM3 += qty; ra.rev += deliv;
      if (Math.abs(deliv) > 0.001) ra.paidTrips += 1;
      else { ra.zeroTrips += 1; ra.shadowCredit += strictAdd; }
    }

    for (var j = 0; j < raw.length; j++) {
      var r = raw[j];
      if (r.voided || !passComp(r)) continue;
      var rCode = normTruckCode(r.truck || r.truck_code || r.equipment || r.transporter);
      if (!rCode) continue;
      var rt = ensureTruck(rCode);
      var rSign = (ent && typeof ent.rawSign === 'function') ? ent.rawSign(r) : 1;
      if (rSign === 0) continue;
      var rQty = Number(r.qty != null ? r.qty : (r.qty_m3 || 0)) * rSign;
      var rDeliv = Number(r.trans_cost != null ? r.trans_cost : (r.transport_usd != null ? r.transport_usd : (r.total_delivery_usd || 0))) * rSign;
      var rComp = String(r.company || 'WTC');
      var rDrv = String(r.driver || '').trim();
      var rDtStr = recDate(r, st);
      var rYm = rDtStr.slice(0, 7);
      var rParty = String(r.site_owner || r.supplier || 'Quarry');
      var rSite = String(r.site || r.work_site || 'Plant');
      var rMat = String(r.product || r.material || 'Aggregate');

      rt.rawTrips += 1;
      rt.rawQtyM3 += rQty;
      rt.rawRev += rDeliv;
      if (rComp.toLowerCase().indexOf('bbc') >= 0) rt.rawBbcTrips += 1;
      else rt.rawWtcTrips += 1;
      if (rDrv) rt.driverTripsMap[rDrv] = (rt.driverTripsMap[rDrv] || 0) + 1;
      recordTripOvertime(r, 'raw_purchases', 'Raw Material Inbound', rt, rDtStr, rComp, rDrv, rQty, rDeliv);

      var rStrictAdd = 0;
      var rFullAdd = 0;
      if (Math.abs(rDeliv) > 0.001) {
        rt.rawPaidTrips += 1;
        rt.rawPaidQtyM3 += rQty;
      } else {
        rt.rawZeroTrips += 1;
        rt.rawZeroQtyM3 += rQty;
        var isInternalQuarry = /al\s*jawad|wtc/i.test(rSite + ' ' + rParty);
        var rShadow = isInternalQuarry ? 0 : 60.0;
        var rBench = 60.0;
        rStrictAdd = rShadow;
        rFullAdd = rBench;
        rt.rawMissingRateCredit += rShadow;
        rt.rawBenchmarkCredit += rBench;
        zeroRows.push({
          id: r.id || '', table: 'raw_purchases', date: rDtStr,
          company: rComp, stream: 'Raw Material Inbound', truck: rt.code, driver: rDrv || rt.driverShort,
          counterparty: rParty, site: rSite,
          material: rMat, qty_m3: rQty,
          unit_price: Number(r.unit_price || r.material_unit_cost_usd || 0),
          total_product: Number(r.total_usd || r.total_material_usd || 0) * rSign, recorded_haul: 0,
          classification: isInternalQuarry ? 'Internal Quarry / Plant Transfer ($60 Benchmark)' : 'Missing External Raw Haul Rate ($60/trip)',
          shadow_credit: rShadow > 0 ? rShadow : rBench, benchmark_credit: rBench
        });
      }

      var rmObj = ensureMonth(rYm);
      rmObj.trips += 1; rmObj.qtyM3 += rQty; rmObj.recordedRev += rDeliv;
      rmObj.strictCredit += rStrictAdd; rmObj.fullCredit += rFullAdd;
      var rtmObj = ensureTruckMonth(rt, rYm);
      rtmObj.trips += 1; rtmObj.qtyM3 += rQty; rtmObj.recordedRev += rDeliv;
      rtmObj.strictCredit += rStrictAdd; rtmObj.fullCredit += rFullAdd;

      var rrKey = [rComp, 'Raw Material Inbound', rt.code, rParty, rSite, rMat].join('||');
      if (!routeAgg[rrKey]) {
        routeAgg[rrKey] = {
          company: rComp, stream: 'Raw Material Inbound', truck: rt.code,
          counterparty: rParty, site: rSite,
          material: rMat, trips: 0, paidTrips: 0, zeroTrips: 0,
          qtyM3: 0, rev: 0, shadowCredit: 0
        };
      }
      var rra = routeAgg[rrKey];
      rra.trips += 1; rra.qtyM3 += rQty; rra.rev += rDeliv;
      if (Math.abs(rDeliv) > 0.001) rra.paidTrips += 1;
      else { rra.zeroTrips += 1; rra.shadowCredit += (rStrictAdd > 0 ? rStrictAdd : rFullAdd); }
    }

    var seenDieselKeys = {};
    for (var k = 0; k < diesel.length; k++) {
      var dl = diesel[k];
      if (dl.voided || !passComp(dl)) continue;
      if (String(dl.direction || '').toLowerCase() === 'in') continue;
      var dCode = normTruckCode(dl.equipment || dl.truck);
      if (!dCode) continue;
      if (!/diesel|mazout/i.test(String(dl.item || dl.fuel_type || 'Diesel'))) continue;
      var ltrs = Math.abs(Number(dl.litres != null ? dl.litres : (dl.liters || 0)));
      if (ltrs <= 0) continue;
      var dDt = recDate(dl, st);
      var tno = String(dl.ticket_no || '');
      var dedupKey = dCode + '|' + dDt + '|' + tno + '|' + Math.round(ltrs);
      if (tno && seenDieselKeys[dedupKey]) continue;
      if (tno) seenDieselKeys[dedupKey] = true;

      var dt = ensureTruck(dCode);
      var dCost = Math.abs(Number(dl.total_usd || dl.cost_usd || dl.total_cost_usd) || (ltrs * 1.3878));
      dt.dieselEvents += 1;
      dt.dieselLiters += ltrs;
      dt.dieselCost += dCost;
      var dYm = dDt.slice(0, 7);
      ensureMonth(dYm).dieselCost += dCost;
      ensureTruckMonth(dt, dYm).dieselCost += dCost;
    }

    var expenseRows = [];
    var capexExcludedTotal = 0;
    var capexExcludedCount = 0;

    for (var oi = 0; oi < oils.length; oi++) {
      var ol = oils[oi];
      if (ol.voided || !passComp(ol)) continue;
      var oCode = normTruckCode(ol.equipment || ol.truck);
      if (!oCode) continue;
      var ot = ensureTruck(oCode);
      var oQty = Number(ol.qty) || 0;
      var oCost = Math.abs(Number(ol.cost_usd || ol.total_usd) || (oQty * 3.5));
      if (oCost <= 0) continue;
      var oDt = recDate(ol, st);
      ot.lubes += oCost;
      ot.expCount += 1;
      var oYm = oDt.slice(0, 7);
      ensureMonth(oYm).maintCost += oCost;
      ensureTruckMonth(ot, oYm).maintCost += oCost;
      expenseRows.push({
        id: ol.id || '', table: 'equipment_oil_logs', date: oDt,
        company: String(ol.company || 'WTC'), truck: ot.code,
        category: 'Oils & Lubricants', subcategory: String(ol.oil_type || 'Lubricant'),
        bucket: 'Oils & Lubricants', supplier: String(ol.source || 'Plant Lube Bay'),
        bill_number: String(ol.name || '—'), notes: String(ol.notes || ol.service_action || '—'),
        total_usd: oCost
      });
    }

    for (var mi = 0; mi < maint.length; mi++) {
      var mr = maint[mi];
      if (mr.voided || !passComp(mr)) continue;
      var mCode = normTruckCode(mr.equipment || mr.truck);
      if (!mCode) continue;
      var mt = ensureTruck(mCode);
      var mCost = Math.abs(Number(mr.total_cost_usd || mr.cost_usd) || 0);
      if (mCost <= 0) continue;
      var mDt = recDate(mr, st);
      mt.repairs += mCost;
      mt.expCount += 1;
      var mYm = mDt.slice(0, 7);
      ensureMonth(mYm).maintCost += mCost;
      ensureTruckMonth(mt, mYm).maintCost += mCost;
      expenseRows.push({
        id: mr.id || '', table: 'equipment_repairs', date: mDt,
        company: String(mr.company || 'WTC'), truck: mt.code,
        category: 'Repairs & Maintenance', subcategory: String(mr.subsystem || 'Workshop'),
        bucket: 'Repairs & Parts', supplier: String(mr.supplier || mr.repair_source || 'Workshop'),
        bill_number: String(mr.name || '—'), notes: String(mr.items_summary || mr.notes || '—'),
        total_usd: mCost
      });
    }

    for (var m = 0; m < exp.length; m++) {
      var ex = exp[m];
      if (ex.voided || !passComp(ex)) continue;
      var eCode = matchExpTruck(ex);
      if (!eCode) continue;
      var cat = String(ex.category || '');
      var sub = String(ex.subcategory || '');
      if (/diesel|mazout/i.test(cat + ' ' + sub)) continue;
      var eSign = (ent && typeof ent.expenseSign === 'function') ? ent.expenseSign(ex) : 1;
      if (eSign === 0) continue;
      var amt = Number(ex.amount != null ? ex.amount : (ex.total_usd != null ? ex.total_usd : (ex.total || 0))) * eSign;
      if (Math.abs(amt) < 0.001) continue;

      var et = ensureTruck(eCode);
      if (cat === 'Capital Expenditures' || /Machinery\s*&\s*Fleet\s*Acquisition/i.test(sub)) {
        et.capex += amt;
        capexExcludedTotal += amt;
        capexExcludedCount += 1;
        continue;
      }

      et.expCount += 1;
      var bucket = 'Repairs & Parts';
      if (cat.indexOf('Insurance') >= 0 || sub.indexOf('Insurance') >= 0 || sub.indexOf('Mecanique') >= 0) {
        et.insurance += amt;
        bucket = 'Insurance & Permits';
      } else if (cat.indexOf('Lubricants') >= 0 || sub.indexOf('Oil') >= 0 || sub.indexOf('Lubricant') >= 0) {
        et.lubes += amt;
        bucket = 'Oils & Lubricants';
      } else {
        et.repairs += amt;
        bucket = 'Repairs & Parts';
      }

      var eDt = recDate(ex, st);
      var eYm = eDt.slice(0, 7);
      ensureMonth(eYm).maintCost += amt;
      ensureTruckMonth(et, eYm).maintCost += amt;

      expenseRows.push({
        id: ex.id || '', table: 'expenses',
        date: eDt,
        company: String(ex.company || 'WTC'),
        truck: et.code, category: cat || 'Maintenance & Repairs',
        subcategory: sub || 'Truck Expense', bucket: bucket,
        supplier: String(ex.supplier || 'Vendor'),
        bill_number: String(ex.reference || ex.bill_number || ex.name || '—'),
        notes: String(ex.item_summary || ex.notes || '—'),
        total_usd: amt
      });
    }

    for (var n = 0; n < ot.length; n++) {
      var o = ot[n];
      if (!passComp(o)) continue;
      var drvName = String(o.employee || o.driver || '').trim();
      var oTruck = matchOtDriverToTruck(drvName, o.equipment);
      var hrs = Number(o.hours || 0);
      var pay = Number(o.total_pay_usd || o.amount_usd || 0);
      var rate = Number(o.hourly_rate_usd || (hrs > 0 ? pay / hrs : 0));

      var oDt = recDate(o, st);
      var oYm = oDt.slice(0, 7);
      if (oTruck) {
        var otT = ensureTruck(oTruck);
        otT.driverOtHours += hrs;
        otT.driverOtPay += pay;
        ensureMonth(oYm).otPay += pay;
        ensureTruckMonth(otT, oYm).otPay += pay;
      }

      if (drvName) {
        if (!driverMap[drvName]) {
          driverMap[drvName] = { driver: drvName, truck: oTruck || 'Pool / Plant', entries: 0, hours: 0, otPay: 0, rate: rate || 2.0 };
        }
        driverMap[drvName].entries += 1;
        driverMap[drvName].hours += hrs;
        driverMap[drvName].otPay += pay;
      }
      overtimeRows.push({
        id: o.id || '', table: 'overtime',
        date: oDt,
        company: String(o.company || 'WTC'),
        driver: drvName || '—',
        truck: oTruck || String(o.equipment || 'Pool'),
        hours: hrs, rate: rate, pay: pay,
        notes: String(o.notes || o.reason || '—')
      });
    }

    var activeMonthsCount = Math.max(1, Object.keys(monthsMap).filter(function (k) { return k !== 'Unspecified'; }).length);
    var allTruckList = [];
    Object.keys(trucks).forEach(function (c) {
      var t = trucks[c];
      t.totalTrips = t.salesTrips + t.rawTrips;
      t.totalPaidTrips = t.salesPaidTrips + t.rawPaidTrips;
      t.totalZeroTrips = t.salesZeroTrips + t.rawZeroTrips;
      t.totalQtyM3 = t.salesQtyM3 + t.rawQtyM3;
      var tActiveMonths = Object.keys(t.monthsMap).filter(function (k) { return k && k !== 'Unspecified' && t.monthsMap[k].trips > 0; }).length;
      if (['TB1', 'Tb7', 'Tb9'].indexOf(c) >= 0 && t.totalTrips > 0) {
        t.driverBasePay = Math.min(Math.max(1, tActiveMonths || activeMonthsCount), 12) * 800;
      }
      t.driverTotalPay = t.driverBasePay + t.driverOtPay;

      var drvKeys = Object.keys(t.driverTripsMap);
      if (drvKeys.length) {
        drvKeys.sort(function (a, b) { return t.driverTripsMap[b] - t.driverTripsMap[a]; });
        t.driver = drvKeys.slice(0, 3).map(function (d) { return d + ' (' + t.driverTripsMap[d] + ')'; }).join(' / ');
        t.driverShort = drvKeys[0];
      }
      if (t.totalTrips > 0 || t.dieselCost > 0 || t.repairs > 0 || t.lubes > 0 || t.insurance > 0 || ['TB1', 'Tb7', 'Tb9'].indexOf(c) >= 0) {
        allTruckList.push(t);
      }
    });

    allTruckList.sort(function (a, b) {
      return (b.totalTrips - a.totalTrips) || ((b.salesRev + b.rawRev) - (a.salesRev + a.rawRev));
    });

    COHORTS.forEach(function (ch) {
      if (ch.id === 'top10') {
        ch.trucks = allTruckList.slice(0, 10).map(function (t) { return t.code; });
      }
    });

    var routesList = Object.keys(routeAgg).map(function (k) {
      var r = routeAgg[k];
      r.avgRateM3 = r.qtyM3 > 0 ? (r.rev / r.qtyM3) : 0;
      r.adjRev = r.rev + r.shadowCredit;
      return r;
    });

    expenseRows.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    zeroRows.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    overtimeRows.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });

    var monthsList = Object.keys(monthsMap)
      .filter(function (k) { return k && k !== 'Unspecified'; })
      .sort()
      .map(function (k) { return monthsMap[k]; });

    var diagnostics = [
      {
        id: 'capex_guard',
        severity: 'resolved',
        badge: 'CapEx Protected',
        title: 'Capital Expenditures Excluded from Operating P&L',
        summary: capexExcludedCount > 0
          ? (fmtInt(capexExcludedCount) + ' CapEx asset bill(s) totaling ' + fmtMoney(capexExcludedTotal) + ' (including TB1 truck acquisition) are isolated from operating repairs so unit hauling margins stay accurate.')
          : 'Zero Capital Expenditure bills mixed into operating repairs in the active period.',
        impact: fmtMoney(capexExcludedTotal) + ' isolated to Balance Sheet Fixed Assets',
        targetTab: 'expenses'
      },
      {
        id: 'unbundled_sales',
        severity: 'warning',
        badge: 'Unbundled C&D Pricing',
        title: 'Delivered Concrete Tickets Priced All-In (>=$55/m³) with $0.00 Separate Haul Fee',
        summary: 'Sales tickets billed at all-in delivered C&D rates record $0.00 in the separate delivery column. Switching to "+ Unbundled Delivery" credits the fleet $5.00/m³ internal transfer value.',
        impact: fmtInt(zeroRows.filter(function (z) { return z.stream === 'Sales Delivery'; }).length) + ' sales tickets in active range',
        targetTab: 'zero'
      },
      {
        id: 'internal_raw_haul',
        severity: 'warning',
        badge: 'Internal Quarry Haulage',
        title: 'Inbound Quarry & Inter-Plant Raw Material Hauls Logged at $0.00 Freight',
        summary: 'Company trucks hauling aggregates from quarry or between WTC and BBConstruction plants often leave internal freight at $0.00. "+ Unbundled Delivery" credits $1.44/m³ ($40 floor) per load.',
        impact: fmtInt(zeroRows.filter(function (z) { return z.stream === 'Raw Material Inbound'; }).length) + ' inbound raw hauls in active range',
        targetTab: 'zero'
      },
      {
        id: 'diesel_source',
        severity: 'resolved',
        badge: 'Single-Source Fuel',
        title: 'Diesel Cost Driven Strictly from Tank Dispensing Logs (Out)',
        summary: 'Per-truck fuel burn is calculated directly from metered Diesel Logs (direction = Out) to prevent double-counting bulk fuel supplier invoices.',
        impact: fmtInt(diesel.length) + ' metered fuel events verified',
        targetTab: 'expenses'
      }
    ];

    LIVE_CACHE = {
      trucks: trucks,
      allTruckList: allTruckList,
      routes: routesList,
      zeroRows: zeroRows,
      expenses: expenseRows,
      overtimeRows: overtimeRows,
      driverList: Object.keys(driverMap).map(function (k) { return driverMap[k]; }).sort(function (a, b) { return b.hours - a.hours; }),
      months: monthsList,
      diagnostics: diagnostics
    };
    LIVE_CACHE_KEY = cacheKey;
    return LIVE_CACHE;
  }

  function getActiveDataset() {
    return computeLiveDataset();
  }

  function selectedTruckCodes() {
    var ds = getActiveDataset();
    var list = (STATE.selectedTrucks && STATE.selectedTrucks.length) ? STATE.selectedTrucks.slice() : ['TB1', 'Tb7', 'Tb9'];
    var valid = list.filter(function (c) { return !!ds.trucks[c]; });
    if (!valid.length) valid = ds.allTruckList.slice(0, 3).map(function (t) { return t.code; });
    return valid;
  }

  function activeTruckCodes() {
    var sel = selectedTruckCodes();
    if (STATE.focusedTruck && STATE.focusedTruck !== 'ALL' && sel.indexOf(STATE.focusedTruck) >= 0) {
      return [STATE.focusedTruck];
    }
    return sel;
  }

  function searchTruckCatalog(query) {
    var ds = getActiveDataset();
    var all = ds.allTruckList || [];
    var q = String(query || '').trim().toLowerCase();
    if (!q) return all;
    var exact = [];
    var freqOrdered = [];
    for (var i = 0; i < all.length; i++) {
      var t = all[i];
      var codeL = String(t.displayCode || t.code || '').toLowerCase();
      var plateL = String(t.plate || '').toLowerCase();
      var ownerL = String(t.owner || '').toLowerCase();
      var drvL = String(t.driver || '').toLowerCase();
      if (codeL === q || plateL === q) {
        exact.push(t);
      } else if (codeL.indexOf(q) >= 0 || plateL.indexOf(q) >= 0 || ownerL.indexOf(q) >= 0 || drvL.indexOf(q) >= 0) {
        freqOrdered.push(t);
      }
    }
    return exact.concat(freqOrdered);
  }

  function computeTruckMetrics(t, mode) {
    var m = mode || STATE.mode || 'strict';
    var recordedRev = Number(t.salesRev || 0) + Number(t.rawRev || 0);
    var creditRev = 0;
    if (m === 'strict') {
      creditRev = Number(t.salesUnbundledCredit || 0) + Number(t.rawMissingRateCredit || 0);
    } else if (m === 'full') {
      creditRev = Number(t.salesBenchmarkCredit || 0) + Number(t.rawBenchmarkCredit || 0);
    }
    var totalRev = recordedRev + creditRev;
    var dieselCost = Number(t.dieselCost || 0);
    var maintCost = Number(t.repairs || 0) + Number(t.lubes || 0) + Number(t.insurance || 0);
    var driverCost = Number(t.driverTotalPay || 0);
    var totalCost = dieselCost + maintCost + driverCost;
    var netProfit = totalRev - totalCost;
    var marginPct = totalRev > 0 ? ((netProfit / totalRev) * 100) : (totalCost > 0 ? -100 : 0);
    var trips = Number(t.totalTrips || 0);
    var qtyM3 = Number(t.totalQtyM3 || 0);

    return {
      code: t.code,
      displayCode: t.displayCode,
      plate: t.plate,
      owner: t.owner,
      driver: t.driver,
      driverShort: t.driverShort,
      color: t.color,
      bg: t.bg,
      border: t.border,
      salesTrips: t.salesTrips,
      salesPaidTrips: t.salesPaidTrips,
      salesZeroTrips: t.salesZeroTrips,
      salesWtcTrips: t.salesWtcTrips,
      salesBbcTrips: t.salesBbcTrips,
      salesQtyM3: t.salesQtyM3,
      salesRev: t.salesRev,
      rawTrips: t.rawTrips,
      rawPaidTrips: t.rawPaidTrips,
      rawZeroTrips: t.rawZeroTrips,
      rawWtcTrips: t.rawWtcTrips,
      rawBbcTrips: t.rawBbcTrips,
      rawQtyM3: t.rawQtyM3,
      rawRev: t.rawRev,
      totalTrips: trips,
      totalPaidTrips: t.totalPaidTrips,
      totalZeroTrips: t.totalZeroTrips,
      wtcTrips: t.salesWtcTrips + t.rawWtcTrips,
      bbcTrips: t.salesBbcTrips + t.rawBbcTrips,
      totalQtyM3: qtyM3,
      recordedRev: recordedRev,
      creditRev: creditRev,
      totalRev: totalRev,
      dieselEvents: t.dieselEvents,
      dieselLiters: t.dieselLiters,
      dieselCost: dieselCost,
      repairs: t.repairs,
      lubes: t.lubes,
      insurance: t.insurance,
      capex: t.capex,
      maintCost: maintCost,
      expCount: t.expCount,
      driverBasePay: t.driverBasePay,
      driverOtHours: t.driverOtHours,
      driverOtPay: t.driverOtPay,
      driverCost: driverCost,
      totalCost: totalCost,
      netProfit: netProfit,
      marginPct: marginPct,
      revPerTrip: trips > 0 ? (totalRev / trips) : 0,
      costPerTrip: trips > 0 ? (totalCost / trips) : 0,
      netPerTrip: trips > 0 ? (netProfit / trips) : 0,
      costPerM3: qtyM3 > 0 ? (totalCost / qtyM3) : 0,
      litersPerTrip: trips > 0 ? (t.dieselLiters / trips) : 0,
      litersPer100M3: qtyM3 > 0 ? ((t.dieselLiters / qtyM3) * 100) : 0
    };
  }

  function computeModel() {
    var ds = getActiveDataset();
    var selCodes = selectedTruckCodes();
    var actCodes = activeTruckCodes();

    var cohortRows = selCodes.map(function (c) {
      return computeTruckMetrics(ds.trucks[c], STATE.mode);
    });
    var truckRows = actCodes.map(function (c) {
      return computeTruckMetrics(ds.trucks[c], STATE.mode);
    });

    var tot = {
      truckCount: truckRows.length,
      totalTrips: 0, totalPaidTrips: 0, totalZeroTrips: 0,
      wtcTrips: 0, bbcTrips: 0,
      salesTrips: 0, rawTrips: 0,
      salesQtyM3: 0, rawQtyM3: 0, totalQtyM3: 0,
      salesRev: 0, rawRev: 0, recordedRev: 0, creditRev: 0, totalRev: 0,
      dieselEvents: 0, dieselLiters: 0, dieselCost: 0,
      repairs: 0, lubes: 0, insurance: 0, capex: 0, maintCost: 0, expCount: 0,
      driverBasePay: 0, driverOtHours: 0, driverOtPay: 0, driverCost: 0,
      totalCost: 0, netProfit: 0, marginPct: 0
    };

    for (var i = 0; i < truckRows.length; i++) {
      var r = truckRows[i];
      tot.totalTrips += r.totalTrips;
      tot.totalPaidTrips += r.totalPaidTrips;
      tot.totalZeroTrips += r.totalZeroTrips;
      tot.wtcTrips += r.wtcTrips;
      tot.bbcTrips += r.bbcTrips;
      tot.salesTrips += r.salesTrips;
      tot.rawTrips += r.rawTrips;
      tot.salesQtyM3 += r.salesQtyM3;
      tot.rawQtyM3 += r.rawQtyM3;
      tot.totalQtyM3 += r.totalQtyM3;
      tot.salesRev += r.salesRev;
      tot.rawRev += r.rawRev;
      tot.recordedRev += r.recordedRev;
      tot.creditRev += r.creditRev;
      tot.totalRev += r.totalRev;
      tot.dieselEvents += r.dieselEvents;
      tot.dieselLiters += r.dieselLiters;
      tot.dieselCost += r.dieselCost;
      tot.repairs += r.repairs;
      tot.lubes += r.lubes;
      tot.insurance += r.insurance;
      tot.capex += r.capex;
      tot.maintCost += r.maintCost;
      tot.expCount += r.expCount;
      tot.driverBasePay += r.driverBasePay;
      tot.driverOtHours += r.driverOtHours;
      tot.driverOtPay += r.driverOtPay;
      tot.driverCost += r.driverCost;
      tot.totalCost += r.totalCost;
    }

    tot.netProfit = tot.totalRev - tot.totalCost;
    tot.marginPct = tot.totalRev > 0 ? ((tot.netProfit / tot.totalRev) * 100) : (tot.totalCost > 0 ? -100 : 0);
    tot.revPerTrip = tot.totalTrips > 0 ? (tot.totalRev / tot.totalTrips) : 0;
    tot.costPerTrip = tot.totalTrips > 0 ? (tot.totalCost / tot.totalTrips) : 0;
    tot.netPerTrip = tot.totalTrips > 0 ? (tot.netProfit / tot.totalTrips) : 0;
    tot.costPerM3 = tot.totalQtyM3 > 0 ? (tot.totalCost / tot.totalQtyM3) : 0;

    return {
      mode: STATE.mode,
      cohortRows: cohortRows,
      truckRows: truckRows,
      totals: tot,
      dataset: ds
    };
  }

  function renderTruckFilterBar(model, ds) {
    var sel = selectedTruckCodes();
    var cohortHtml = COHORTS.map(function (c) {
      var active = STATE.cohort === c.id ? ' active' : '';
      return '<button type="button" class="fpnl-cohort-pill' + active + '" data-fpnl-cohort="' + esc(c.id) + '"><span>' + esc(c.label) + '</span></button>';
    }).join('');

    var ent = window.MFG_ENTERPRISE;
    var allowedCos = (ent && typeof ent.allowedCompanyNames === 'function' && ent.allowedCompanyNames())
      ? ent.allowedCompanyNames()
      : ['WTC', 'BBConstruction', 'Lions Transport'];
    var compOptions = [{ id: 'ALL', label: 'All Cos.' }].concat(
      allowedCos.map(function (c) { return { id: c, label: c }; })
    );
    var compHtml = compOptions.map(function (co) {
      var active = STATE.companyFilter === co.id ? ' active' : '';
      return '<button type="button" class="fpnl-comp-pill' + active + '" data-fpnl-comp="' + esc(co.id) + '"><span>' + esc(co.label) + '</span></button>';
    }).join('');

    var pickerResults = searchTruckCatalog(STATE.truckPickerQuery);
    var pickerRowsHtml = pickerResults.slice(0, 25).map(function (t) {
      var checked = sel.indexOf(t.code) >= 0;
      return '<button type="button" class="fpnl-picker-item' + (checked ? ' selected' : '') + '" data-fpnl-toggle-truck="' + esc(t.code) + '">' +
        '<span class="fpnl-picker-check">' + (checked ? '✓' : '') + '</span>' +
        '<span class="fpnl-picker-main">' + esc(truckLabel(t.code)) + ' <small>(' + esc(t.owner) + ')</small></span>' +
        '<span class="fpnl-picker-stat">' + fmtInt(t.totalTrips) + ' trips</span>' +
      '</button>';
    }).join('');

    var chipHtml = '<button type="button" class="fpnl-truck-chip' + (STATE.focusedTruck === 'ALL' ? ' active' : '') + '" data-fpnl-focus-truck="ALL">' +
      '<span>All Selected</span> (' + sel.length + ')' +
    '</button>';

    for (var i = 0; i < model.cohortRows.length; i++) {
      var tr = model.cohortRows[i];
      var isFoc = STATE.focusedTruck === tr.code;
      var dotCls = tr.netProfit >= 0 ? 'em' : 'cr';
      chipHtml += '<button type="button" class="fpnl-truck-chip' + (isFoc ? ' active' : '') + '" data-fpnl-focus-truck="' + esc(tr.code) + '" title="Net: ' + esc(fmtSignedMoney(tr.netProfit)) + '">' +
        '<span class="fpnl-dot ' + dotCls + '"></span>' +
        '<span>' + esc(truckLabel(tr.code)) + ' (' + fmtInt(tr.totalTrips) + ')</span>' +
      '</button>';
    }

    var focusReset = STATE.focusedTruck !== 'ALL'
      ? '<button type="button" class="fpnl-focus-badge" data-fpnl-focus-truck="ALL"><span>Reset Filter</span> (' + esc(truckShortLabel(STATE.focusedTruck)) + ')</button>'
      : '<span class="fpnl-focus-badge muted">Comparing ' + sel.length + ' Truck' + (sel.length === 1 ? '' : 's') + '</span>';

    return '<div class="fpnl-filter-row">' +
        '<span class="fpnl-filter-lbl">FLEET COHORT:</span>' +
        '<div class="fpnl-cohort-group">' + cohortHtml + '</div>' +
        '<div class="fpnl-picker-wrap" id="fpnlTruckPickerWrap">' +
          '<button type="button" class="fpnl-picker-trigger" data-fpnl-picker-toggle="1">' +
            'Pick Trucks (' + sel.length + ') ▾' +
          '</button>' +
          (STATE.truckPickerOpen ? (
            '<div class="fpnl-picker-popover">' +
              '<div class="fpnl-picker-head">' +
                '<input type="search" id="fpnlTruckSearchInput" class="fpnl-picker-search" placeholder="Search truck, plate, owner (freq-ranked)..." value="' + esc(STATE.truckPickerQuery) + '" />' +
              '</div>' +
              '<div class="fpnl-picker-list">' + (pickerRowsHtml || '<div class="fpnl-empty-mini">No matching trucks</div>') + '</div>' +
            '</div>'
          ) : '') +
        '</div>' +
        '<span class="fpnl-filter-lbl">COMPANY:</span>' +
        '<div class="fpnl-comp-group">' + compHtml + '</div>' +
      '</div>' +
      '<div class="fpnl-filter-row fpnl-specific-row">' +
        '<span class="fpnl-filter-lbl">FOCUS TRUCK:</span>' +
        '<div class="fpnl-chip-group">' + chipHtml + '</div>' +
        '<div class="fpnl-focus-right">' + focusReset + '</div>' +
      '</div>';
  }

  function renderKpiStrip(model, ds) {
    var t = model.totals;
    var wtcShare = t.totalTrips > 0 ? Math.round((t.wtcTrips / t.totalTrips) * 100) : 50;
    var bbcShare = Math.max(0, 100 - wtcShare);
    var recShare = t.totalRev > 0 ? Math.round((t.recordedRev / t.totalRev) * 100) : 100;
    var credShare = Math.max(0, 100 - recShare);
    var dslShare = t.totalCost > 0 ? Math.round((t.dieselCost / t.totalCost) * 100) : 50;
    var mntShare = t.totalCost > 0 ? Math.round((t.maintCost / t.totalCost) * 100) : 30;
    var drvShare = Math.max(0, 100 - dslShare - mntShare);
    var paidShare = t.totalTrips > 0 ? Math.round((t.totalPaidTrips / t.totalTrips) * 100) : 100;
    var zeroShare = Math.max(0, 100 - paidShare);

    var netTone = t.netProfit >= 0 ? 'fpnl-tone-emerald' : 'fpnl-tone-crimson';
    var netBarTone = t.netProfit >= 0 ? 'fpnl-seg-emerald' : 'fpnl-seg-crimson';
    var marginFill = Math.min(100, Math.max(12, Math.round(Math.abs(t.marginPct))));

    return '<div class="fpnl-kpi-card fpnl-tone-indigo" data-fpnl-kpi-jump="routes" title="Click to explore routes">' +
        '<div class="fpnl-kpi-lbl">ACTIVE TRIPS (' + t.truckCount + ' TRUCK' + (t.truckCount === 1 ? '' : 'S') + ')</div>' +
        '<div class="fpnl-kpi-val">' + fmtInt(t.totalTrips) + '</div>' +
        '<div class="fpnl-kpi-sub">' + fmtInt(t.wtcTrips) + ' WTC (' + pct(t.wtcTrips, t.totalTrips) + ') · ' + fmtInt(t.bbcTrips) + ' BBC (' + pct(t.bbcTrips, t.totalTrips) + ')</div>' +
        '<div class="fpnl-kpi-meter"><span class="fpnl-seg-indigo" style="width:' + wtcShare + '%"></span><span class="fpnl-seg-amber" style="width:' + bbcShare + '%"></span></div>' +
      '</div>' +
      '<div class="fpnl-kpi-card fpnl-tone-teal" data-fpnl-kpi-jump="routes" title="Click to inspect volume by route">' +
        '<div class="fpnl-kpi-lbl">VOLUME HAULED</div>' +
        '<div class="fpnl-kpi-val">' + fmtNum(t.totalQtyM3, 1) + ' m³</div>' +
        '<div class="fpnl-kpi-sub">Sales ' + fmtNum(t.salesQtyM3, 0) + ' m³ · Raw ' + fmtNum(t.rawQtyM3, 0) + ' m³</div>' +
        '<div class="fpnl-kpi-meter"><span class="fpnl-seg-teal" style="width:' + (t.totalQtyM3 > 0 ? Math.round((t.salesQtyM3 / t.totalQtyM3) * 100) : 50) + '%"></span><span class="fpnl-seg-indigo" style="width:' + (t.totalQtyM3 > 0 ? Math.max(0, 100 - Math.round((t.salesQtyM3 / t.totalQtyM3) * 100)) : 50) + '%"></span></div>' +
      '</div>' +
      '<div class="fpnl-kpi-card fpnl-tone-emerald" data-fpnl-kpi-jump="pnl" title="Transportation revenue in selected valuation mode">' +
        '<div class="fpnl-kpi-lbl">HAULAGE REVENUE</div>' +
        '<div class="fpnl-kpi-val">' + fmtMoney(t.totalRev) + '</div>' +
        '<div class="fpnl-kpi-sub">Booked ' + fmtMoney(t.recordedRev, 0) + (t.creditRev > 0 ? (' + ' + fmtMoney(t.creditRev, 0) + ' Unbundled') : '') + '</div>' +
        '<div class="fpnl-kpi-meter"><span class="fpnl-seg-emerald" style="width:' + recShare + '%"></span><span class="fpnl-seg-teal" style="width:' + credShare + '%"></span></div>' +
      '</div>' +
      '<div class="fpnl-kpi-card fpnl-tone-amber" data-fpnl-kpi-jump="expenses" title="Click to inspect operating expenses & fuel">' +
        '<div class="fpnl-kpi-lbl">OPERATING COSTS</div>' +
        '<div class="fpnl-kpi-val">' + fmtMoney(t.totalCost) + '</div>' +
        '<div class="fpnl-kpi-sub">' + fmtMoney(t.costPerTrip) + '/trip · ' + fmtMoney(t.costPerM3) + '/m³ (' + pct(t.dieselCost, t.totalCost, 0) + ' Fuel)</div>' +
        '<div class="fpnl-kpi-meter"><span class="fpnl-seg-amber" style="width:' + dslShare + '%"></span><span class="fpnl-seg-crimson" style="width:' + mntShare + '%"></span><span class="fpnl-seg-violet" style="width:' + drvShare + '%"></span></div>' +
      '</div>' +
      '<div class="fpnl-kpi-card ' + netTone + '" data-fpnl-kpi-jump="pnl" title="Operating net profit (CapEx excluded)">' +
        '<div class="fpnl-kpi-lbl">NET OPERATING MARGIN</div>' +
        '<div class="fpnl-kpi-val ' + (t.netProfit >= 0 ? 'pos' : 'neg') + '">' + fmtSignedMoney(t.netProfit) + '</div>' +
        '<div class="fpnl-kpi-sub">Margin ' + (t.marginPct >= 0 ? '+' : '') + t.marginPct.toFixed(1) + '% · ' + fmtSignedMoney(t.netPerTrip) + '/trip</div>' +
        '<div class="fpnl-kpi-meter"><span class="' + netBarTone + '" style="width:' + marginFill + '%"></span></div>' +
      '</div>' +
      '<div class="fpnl-kpi-card fpnl-tone-crimson" data-fpnl-kpi-jump="zero" title="Click to audit $0.00 haulage trips">' +
        '<div class="fpnl-kpi-lbl">UNPRICED ($0.00) TRIPS</div>' +
        '<div class="fpnl-kpi-val">' + fmtInt(t.totalZeroTrips) + ' / ' + fmtInt(t.totalTrips) + '</div>' +
        '<div class="fpnl-kpi-sub">' + pct(t.totalZeroTrips, t.totalTrips) + ' unpriced on selected trucks (' + fmtInt(ds.zeroRows.length) + ' fleet-wide)</div>' +
        '<div class="fpnl-kpi-meter"><span class="fpnl-seg-emerald" style="width:' + paidShare + '%"></span><span class="fpnl-seg-crimson" style="width:' + zeroShare + '%"></span></div>' +
      '</div>';
  }

  function renderVisualTruckScorecards(model) {
    var rows = model.truckRows;
    if (!rows.length) {
      return '<div class="fpnl-empty">No trucks match the current selection.</div>';
    }
    var maxScale = 1;
    for (var i = 0; i < rows.length; i++) {
      maxScale = Math.max(maxScale, rows[i].totalRev, rows[i].totalCost);
    }

    var cardsHtml = rows.map(function (r) {
      var isPos = r.netProfit >= 0;
      var isFocused = STATE.focusedTruck === r.code;
      var salesPct = maxScale > 0 ? Math.round((r.salesRev / maxScale) * 100) : 0;
      var rawPct = maxScale > 0 ? Math.round((r.rawRev / maxScale) * 100) : 0;
      var credPct = maxScale > 0 ? Math.round((r.creditRev / maxScale) * 100) : 0;

      var dslPct = maxScale > 0 ? Math.round((r.dieselCost / maxScale) * 100) : 0;
      var mntPct = maxScale > 0 ? Math.round((r.maintCost / maxScale) * 100) : 0;
      var drvPct = maxScale > 0 ? Math.round((r.driverCost / maxScale) * 100) : 0;

      return '<div class="fpnl-truck-card" style="border-top: 3px solid ' + esc(r.color) + ';">' +
        '<div class="fpnl-tc-head">' +
          '<div>' +
            '<div class="fpnl-tc-title">' +
              '<button type="button" class="fpnl-entity-link" data-fpnl-inspect-truck="' + esc(r.code) + '" title="Open 360° Truck Inspector">' +
                esc(truckLabel(r.code)) + ' (' + esc(r.owner) + ')' +
              '</button>' +
            '</div>' +
            '<div class="fpnl-tc-sub">Driver: ' +
              '<button type="button" class="fpnl-entity-link" data-fpnl-inspect-driver="' + esc(r.driverShort) + '" title="Open 360° Driver Inspector">' +
                esc(r.driver) +
              '</button>' +
            '</div>' +
          '</div>' +
          '<div class="fpnl-tc-head-right">' +
            '<span class="fpnl-net-pill ' + (isPos ? 'pos' : 'neg') + '">Net ' + fmtSignedMoney(r.netProfit) + ' (' + (r.marginPct >= 0 ? '+' : '') + r.marginPct.toFixed(1) + '%)</span>' +
            '<button type="button" class="fpnl-focus-btn' + (isFocused ? ' active' : '') + '" data-fpnl-focus-truck="' + (isFocused ? 'ALL' : esc(r.code)) + '">' +
              (isFocused ? 'Showing Only ' + esc(r.displayCode) : 'Focus ' + esc(r.displayCode)) +
            '</button>' +
          '</div>' +
        '</div>' +

        '<div class="fpnl-track-block">' +
          '<div class="fpnl-track-hdr">' +
            '<span class="fpnl-track-title">REVENUE MIX · ' + fmtInt(r.totalTrips) + ' TRIPS (' + fmtNum(r.totalQtyM3, 0) + ' m³)</span>' +
            '<span class="fpnl-track-val">' + fmtMoney(r.totalRev) + ' <small>(' + fmtMoney(r.revPerTrip) + '/trip)</small></span>' +
          '</div>' +
          '<div class="fpnl-stack-bar">' +
            '<span class="fpnl-seg-indigo" style="width:' + salesPct + '%" title="Sales Delivery: ' + esc(fmtMoney(r.salesRev)) + '"></span>' +
            '<span class="fpnl-seg-teal" style="width:' + rawPct + '%" title="Raw Material Haulage: ' + esc(fmtMoney(r.rawRev)) + '"></span>' +
            (r.creditRev > 0 ? '<span class="fpnl-seg-emerald" style="width:' + credPct + '%" title="Unbundled / Benchmark Credit: ' + esc(fmtMoney(r.creditRev)) + '"></span>' : '') +
          '</div>' +
          '<div class="fpnl-chip-strip">' +
            '<button type="button" class="fpnl-drill-chip" data-fpnl-drill="routes" data-fpnl-truck="' + esc(r.code) + '" title="Drill into Sales & Raw Routes">' +
              '<span class="fpnl-dot" style="background:#3B82F6"></span>Sales (' + fmtInt(r.salesTrips) + ') <b>' + fmtMoney(r.salesRev, 0) + '</b>' +
            '</button>' +
            '<button type="button" class="fpnl-drill-chip" data-fpnl-drill="routes" data-fpnl-truck="' + esc(r.code) + '" title="Drill into Raw Material Routes">' +
              '<span class="fpnl-dot" style="background:#14B8A6"></span>Raw (' + fmtInt(r.rawTrips) + ') <b>' + fmtMoney(r.rawRev, 0) + '</b>' +
            '</button>' +
            (r.creditRev > 0 ? (
              '<button type="button" class="fpnl-drill-chip" data-fpnl-drill="zero" data-fpnl-truck="' + esc(r.code) + '" title="Audit Unpriced / Unbundled Loads">' +
                '<span class="fpnl-dot em"></span>Unbundled Credit <b class="pos">+' + fmtMoney(r.creditRev, 0) + '</b>' +
              '</button>'
            ) : '') +
            (r.totalZeroTrips > 0 ? (
              '<button type="button" class="fpnl-drill-chip" data-fpnl-drill="zero" data-fpnl-truck="' + esc(r.code) + '" title="Inspect $0.00 Trips">' +
                '<span class="fpnl-dot cr"></span>$0 Trips <b>' + fmtInt(r.totalZeroTrips) + '</b>' +
              '</button>'
            ) : '') +
          '</div>' +
        '</div>' +

        '<div class="fpnl-track-block">' +
          '<div class="fpnl-track-hdr">' +
            '<span class="fpnl-track-title">OPERATING COST MIX · ' + fmtMoney(r.costPerM3) + '/m³</span>' +
            '<span class="fpnl-track-val neg">-' + fmtMoney(r.totalCost) + ' <small>(' + fmtMoney(r.costPerTrip) + '/trip)</small></span>' +
          '</div>' +
          '<div class="fpnl-stack-bar">' +
            '<span class="fpnl-seg-amber" style="width:' + dslPct + '%" title="Diesel Fuel: ' + esc(fmtMoney(r.dieselCost)) + '"></span>' +
            '<span class="fpnl-seg-crimson" style="width:' + mntPct + '%" title="Repairs, Lubes & Insurance: ' + esc(fmtMoney(r.maintCost)) + '"></span>' +
            '<span class="fpnl-seg-violet" style="width:' + drvPct + '%" title="Driver Pay & Overtime: ' + esc(fmtMoney(r.driverCost)) + '"></span>' +
          '</div>' +
          '<div class="fpnl-chip-strip">' +
            '<button type="button" class="fpnl-drill-chip" data-fpnl-drill="expenses" data-fpnl-truck="' + esc(r.code) + '" title="Inspect Diesel & Expense Bills">' +
              '<span class="fpnl-dot" style="background:#F59E0B"></span>Fuel (' + fmtInt(r.dieselLiters) + ' L) <b>-' + fmtMoney(r.dieselCost, 0) + '</b>' +
            '</button>' +
            '<button type="button" class="fpnl-drill-chip" data-fpnl-drill="expenses" data-fpnl-truck="' + esc(r.code) + '" title="Inspect Repairs, Lubes & Insurance">' +
              '<span class="fpnl-dot cr"></span>Repairs &amp; Lubes (' + fmtInt(r.expCount) + ') <b>-' + fmtMoney(r.maintCost, 0) + '</b>' +
            '</button>' +
            '<button type="button" class="fpnl-drill-chip" data-fpnl-drill="overtime" data-fpnl-truck="' + esc(r.code) + '" title="Inspect Driver Overtime & Pay">' +
              '<span class="fpnl-dot" style="background:#8B5CF6"></span>Driver &amp; OT (' + fmtNum(r.driverOtHours, 0) + 'h) <b>-' + fmtMoney(r.driverCost, 0) + '</b>' +
            '</button>' +
          '</div>' +
        '</div>' +

        '<div class="fpnl-unit-strip">' +
          '<div class="fpnl-unit-cell">' +
            '<span class="fpnl-unit-lbl">NET / TRIP</span>' +
            '<span class="fpnl-unit-val ' + (r.netPerTrip >= 0 ? 'pos' : 'neg') + '">' + fmtSignedMoney(r.netPerTrip) + '</span>' +
          '</div>' +
          '<div class="fpnl-unit-cell">' +
            '<span class="fpnl-unit-lbl">FUEL BURN</span>' +
            '<span class="fpnl-unit-val">' + fmtNum(r.litersPerTrip, 1) + ' L/trip · ' + fmtNum(r.litersPer100M3, 0) + ' L/100m³</span>' +
          '</div>' +
          '<div class="fpnl-unit-cell">' +
            '<span class="fpnl-unit-lbl">PLANT SPLIT</span>' +
            '<span class="fpnl-unit-val">' + fmtInt(r.wtcTrips) + ' WTC · ' + fmtInt(r.bbcTrips) + ' BBC</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<div class="fpnl-scorecards-grid">' + cardsHtml + '</div>';
  }

  function renderVisualComparisonStudio(model, ds) {
    var rows = model.truckRows;
    var maxBar = 1;
    for (var i = 0; i < rows.length; i++) {
      maxBar = Math.max(maxBar, rows[i].totalRev, rows[i].totalCost);
    }

    var compRowsHtml = rows.map(function (r) {
      var revW = Math.round((r.totalRev / maxBar) * 100);
      var costW = Math.round((r.totalCost / maxBar) * 100);
      var isFocused = STATE.focusedTruck === r.code;
      return '<div class="fpnl-comp-row' + (isFocused ? ' active' : '') + '" data-fpnl-focus-truck="' + (isFocused ? 'ALL' : esc(r.code)) + '" title="Click to focus ' + esc(r.displayCode) + '">' +
        '<div class="fpnl-comp-head">' +
          '<span>' + esc(truckLabel(r.code)) + ' · <small style="font-weight:500;color:var(--text-muted)">' + fmtInt(r.totalTrips) + ' trips (' + fmtNum(r.totalQtyM3, 0) + ' m³)</small></span>' +
          '<span class="' + (r.netProfit >= 0 ? 'pos' : 'neg') + '">' + fmtSignedMoney(r.netProfit) + ' (' + (r.marginPct >= 0 ? '+' : '') + r.marginPct.toFixed(1) + '%)</span>' +
        '</div>' +
        '<div class="fpnl-comp-bars">' +
          '<div class="fpnl-comp-bar-line">' +
            '<span class="fpnl-comp-bar-lbl">Revenue</span>' +
            '<div class="fpnl-comp-track"><div class="fpnl-comp-fill fpnl-seg-emerald" style="width:' + revW + '%"></div></div>' +
            '<span class="fpnl-comp-num">' + fmtMoney(r.totalRev, 0) + '</span>' +
          '</div>' +
          '<div class="fpnl-comp-bar-line">' +
            '<span class="fpnl-comp-bar-lbl">Op. Cost</span>' +
            '<div class="fpnl-comp-track"><div class="fpnl-comp-fill fpnl-seg-crimson" style="width:' + costW + '%"></div></div>' +
            '<span class="fpnl-comp-num">-' + fmtMoney(r.totalCost, 0) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    var actSet = {};
    model.truckRows.forEach(function (r) { actSet[r.code] = true; });
    var topRoutes = ds.routes.filter(function (rt) { return actSet[rt.truck]; }).slice().sort(function (a, b) {
      return (b.adjRev - a.adjRev) || (b.trips - a.trips);
    }).slice(0, 6);

    var maxRouteRev = 1;
    topRoutes.forEach(function (rt) { maxRouteRev = Math.max(maxRouteRev, rt.adjRev, rt.rev); });

    var topRoutesHtml = topRoutes.map(function (rt) {
      var val = STATE.mode === 'recorded' ? rt.rev : rt.adjRev;
      var w = Math.max(6, Math.round((val / maxRouteRev) * 100));
      return '<div class="fpnl-comp-row" data-fpnl-drill="routes" data-fpnl-truck="' + esc(rt.truck) + '" title="Click to open in Routes Explorer">' +
        '<div class="fpnl-comp-head">' +
          '<span>' + esc(rt.counterparty) + ' <small style="font-weight:500;color:var(--text-muted)">(' + esc(rt.truck) + ' · ' + esc(rt.site) + ')</small></span>' +
          '<span>' + fmtMoney(val, 0) + '</span>' +
        '</div>' +
        '<div class="fpnl-comp-bar-line">' +
          '<span class="fpnl-comp-bar-lbl">' + fmtInt(rt.trips) + ' trips</span>' +
          '<div class="fpnl-comp-track"><div class="fpnl-comp-fill fpnl-seg-indigo" style="width:' + w + '%"></div></div>' +
          '<span class="fpnl-comp-num">' + fmtNum(rt.qtyM3, 0) + ' m³</span>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<div class="fpnl-viz-grid">' +
      '<div class="fpnl-viz-card">' +
        '<div class="fpnl-viz-head">' +
          '<div>' +
            '<div class="fpnl-viz-title">Side-by-Side Revenue vs. Operating Cost</div>' +
            '<div class="fpnl-viz-sub">Click any truck bar to isolate or reset focus across all tabs</div>' +
          '</div>' +
        '</div>' +
        (compRowsHtml || '<div class="fpnl-empty-mini">No truck data in active range</div>') +
      '</div>' +
      '<div class="fpnl-viz-card">' +
        '<div class="fpnl-viz-head">' +
          '<div>' +
            '<div class="fpnl-viz-title">Top Value Hauling Corridors (Selected Trucks)</div>' +
            '<div class="fpnl-viz-sub">Click any corridor to open in Routes &amp; Hauling Explorer</div>' +
          '</div>' +
          '<button type="button" class="fpnl-focus-btn" data-fpnl-kpi-jump="routes"><span>All Routes</span> (' + fmtInt(ds.routes.length) + ')</button>' +
        '</div>' +
        (topRoutesHtml || '<div class="fpnl-empty-mini">No routes in active period</div>') +
      '</div>' +
    '</div>';
  }

  function scopedMonthlyTimeline(model, ds) {
    var agg = {};
    (model.truckRows || []).forEach(function (r) {
      var rawT = ds.trucks[r.code];
      if (!rawT || !rawT.monthsMap) return;
      var isBdeir = r.code === 'TB1' || r.code === 'Tb7' || r.code === 'Tb9';
      Object.keys(rawT.monthsMap).forEach(function (ym) {
        var m = rawT.monthsMap[ym];
        if (!agg[ym]) {
          agg[ym] = {
            ym: ym,
            trips: 0,
            qtyM3: 0,
            recordedRev: 0,
            strictCredit: 0,
            fullCredit: 0,
            dieselCost: 0,
            maintCost: 0,
            otPay: 0,
            basePay: 0
          };
        }
        agg[ym].trips += m.trips || 0;
        agg[ym].qtyM3 += m.qtyM3 || 0;
        agg[ym].recordedRev += m.recordedRev || 0;
        agg[ym].strictCredit += m.strictCredit || 0;
        agg[ym].fullCredit += m.fullCredit || 0;
        agg[ym].dieselCost += m.dieselCost || 0;
        agg[ym].maintCost += m.maintCost || 0;
        agg[ym].otPay += m.otPay || 0;
        if (isBdeir && (m.trips || 0) > 0) {
          agg[ym].basePay += 800;
        }
      });
    });
    return Object.keys(agg).sort().map(function (k) { return agg[k]; });
  }

  function renderMonthlyTimelineStudio(model, ds) {
    var months = scopedMonthlyTimeline(model, ds);
    if (!months.length) {
      return '<div class="fpnl-empty">No monthly activity found in the active period.</div>';
    }
    var maxM = 1;
    months.forEach(function (m) {
      var rev = m.recordedRev + (STATE.mode === 'strict' ? m.strictCredit : STATE.mode === 'full' ? m.fullCredit : 0);
      var cost = m.dieselCost + m.maintCost + m.otPay + (m.basePay || 0);
      maxM = Math.max(maxM, rev, cost);
    });

    var rowsHtml = months.map(function (m) {
      var rev = m.recordedRev + (STATE.mode === 'strict' ? m.strictCredit : STATE.mode === 'full' ? m.fullCredit : 0);
      var cost = m.dieselCost + m.maintCost + m.otPay + (m.basePay || 0);
      var net = rev - cost;
      var revW = Math.round((rev / maxM) * 100);
      var costW = Math.round((cost / maxM) * 100);
      return '<div class="fpnl-comp-row" data-fpnl-filter-month="' + esc(m.ym) + '" title="Click to filter topbar period to ' + esc(m.ym) + '">' +
        '<div class="fpnl-comp-head">' +
          '<span>' + esc(m.ym) + ' · <small style="font-weight:500;color:var(--text-muted)">' + fmtInt(m.trips) + ' trips (' + fmtNum(m.qtyM3, 0) + ' m³)</small></span>' +
          '<span class="' + (net >= 0 ? 'pos' : 'neg') + '">Net ' + fmtSignedMoney(net, 0) + ' (Rev ' + fmtMoney(rev, 0) + ' / Cost -' + fmtMoney(cost, 0) + ')</span>' +
        '</div>' +
        '<div class="fpnl-comp-bars">' +
          '<div class="fpnl-comp-bar-line">' +
            '<span class="fpnl-comp-bar-lbl">Revenue</span>' +
            '<div class="fpnl-comp-track"><div class="fpnl-comp-fill fpnl-seg-emerald" style="width:' + revW + '%"></div></div>' +
            '<span class="fpnl-comp-num">' + fmtMoney(rev, 0) + '</span>' +
          '</div>' +
          '<div class="fpnl-comp-bar-line">' +
            '<span class="fpnl-comp-bar-lbl">Operating Cost</span>' +
            '<div class="fpnl-comp-track"><div class="fpnl-comp-fill fpnl-seg-amber" style="width:' + costW + '%"></div></div>' +
            '<span class="fpnl-comp-num">-' + fmtMoney(cost, 0) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<div class="fpnl-viz-card">' +
      '<div class="fpnl-viz-head">' +
        '<div>' +
          '<div class="fpnl-viz-title">Interactive Monthly Fleet Timeline (' + months.length + ' Months)</div>' +
          '<div class="fpnl-viz-sub">Click any month row to slice the entire Command Center to that month, or click "All-Time" in the header to reset</div>' +
        '</div>' +
      '</div>' +
      rowsHtml +
    '</div>';
  }

  function renderTableComparisonStudio(model) {
    var cols = model.truckRows;
    var tot = model.totals;
    var thTrucks = cols.map(function (c) {
      return '<th class="num"><span>' + esc(truckLabel(c.code)) + '</span></th>';
    }).join('');

    function buildRow(label, getter, fmtFn, cls, isBold) {
      var cells = cols.map(function (c) {
        var v = getter(c);
        return '<td class="num ' + (cls || '') + '">' + fmtFn(v, c) + '</td>';
      }).join('');
      var tv = getter(tot);
      return '<tr class="' + (isBold ? 'fpnl-row-total' : '') + '">' +
        '<td>' + label + '</td>' + cells +
        '<td class="num fpnl-col-tot ' + (cls || '') + '">' + fmtFn(tv, tot) + '</td>' +
      '</tr>';
    }

    return '<div class="fpnl-table-wrap">' +
      '<table class="fpnl-table">' +
        '<thead><tr><th>P&amp;L LINE ITEM</th>' + thTrucks + '<th class="num fpnl-col-tot">SELECTED TOTAL</th></tr></thead>' +
        '<tbody>' +
          buildRow('Total Trips (Paid / $0.00)', function (x) { return x; }, function (x) { return fmtInt(x.totalTrips) + ' (' + fmtInt(x.totalPaidTrips) + ' / ' + fmtInt(x.totalZeroTrips) + ')'; }) +
          buildRow('Volume Hauled (m³)', function (x) { return x.totalQtyM3; }, function (v) { return fmtNum(v, 1) + ' m³'; }) +
          buildRow('Sales Delivery Revenue', function (x) { return x.salesRev; }, function (v) { return fmtMoney(v); }) +
          buildRow('Raw Material Haulage Revenue', function (x) { return x.rawRev; }, function (v) { return fmtMoney(v); }) +
          buildRow('Unbundled / Benchmark Credit', function (x) { return x.creditRev; }, function (v) { return fmtSignedMoney(v); }, 'pos') +
          buildRow('Total Transportation Revenue', function (x) { return x.totalRev; }, function (v) { return fmtMoney(v); }, '', true) +
          buildRow('Diesel Fuel (Tank Out Logs)', function (x) { return -x.dieselCost; }, function (v) { return fmtMoney(v); }, 'neg') +
          buildRow('Repairs & Spare Parts', function (x) { return -x.repairs; }, function (v) { return fmtMoney(v); }, 'neg') +
          buildRow('Oils & Lubricants', function (x) { return -x.lubes; }, function (v) { return fmtMoney(v); }, 'neg') +
          buildRow('Insurance, Permits & Taxes', function (x) { return -x.insurance; }, function (v) { return fmtMoney(v); }, 'neg') +
          buildRow('Driver Base + Overtime Pay', function (x) { return -x.driverCost; }, function (v) { return fmtMoney(v); }, 'neg') +
          buildRow('Total Operating Costs (Excl. CapEx)', function (x) { return -x.totalCost; }, function (v) { return fmtMoney(v); }, 'neg', true) +
          buildRow('Net Operating Profit / (Loss)', function (x) { return x.netProfit; }, function (v) { return fmtSignedMoney(v); }, '', true) +
          buildRow('Operating Margin (%)', function (x) { return x.marginPct; }, function (v) { return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; }, '', true) +
        '</tbody>' +
      '</table>' +
    '</div>';
  }

  function renderSubtabPnl(model, ds) {
    var v = STATE.pnlView || 'visual';
    var scopedMonths = scopedMonthlyTimeline(model, ds);
    var studioBody = '';
    if (v === 'monthly') studioBody = renderMonthlyTimelineStudio(model, ds);
    else if (v === 'table') studioBody = renderTableComparisonStudio(model);
    else studioBody = renderVisualComparisonStudio(model, ds);

    return renderVisualTruckScorecards(model) +
      '<div class="fpnl-section-card">' +
        '<div class="fpnl-section-head">' +
          '<div>' +
            '<h4 class="fpnl-section-title">Interactive Fleet Comparison &amp; Trend Studio</h4>' +
            '<p class="fpnl-section-sub">Switch between visual proportion bars, interactive monthly timeline, and line-item P&amp;L statement</p>' +
          '</div>' +
          '<div class="fpnl-mode-group">' +
            '<button type="button" class="fpnl-mode-btn' + (v === 'visual' ? ' active' : '') + '" data-fpnl-pnl-view="visual">Visual Comparison</button>' +
            '<button type="button" class="fpnl-mode-btn' + (v === 'monthly' ? ' active' : '') + '" data-fpnl-pnl-view="monthly"><span>Monthly Timeline</span> (' + fmtInt(scopedMonths.length) + ')</button>' +
            '<button type="button" class="fpnl-mode-btn' + (v === 'table' ? ' active' : '') + '" data-fpnl-pnl-view="table">Full P&amp;L Statement</button>' +
          '</div>' +
        '</div>' +
        studioBody +
      '</div>';
  }

  function renderSubtabZero(model, ds) {
    var actSet = {};
    model.truckRows.forEach(function (r) { actSet[r.code] = true; });
    var baseZero = ds.zeroRows.filter(function (z) {
      if (STATE.zeroTruck !== 'ALL') return z.truck === STATE.zeroTruck;
      return !!actSet[z.truck];
    });

    var salesZero = baseZero.filter(function (z) { return z.stream === 'Sales Delivery'; });
    var rawZero = baseZero.filter(function (z) { return z.stream === 'Raw Material Inbound'; });
    var salesCred = salesZero.reduce(function (a, b) { return a + b.shadow_credit; }, 0);
    var rawCred = rawZero.reduce(function (a, b) { return a + b.shadow_credit; }, 0);

    var filtered = baseZero.filter(function (z) {
      if (STATE.zeroStream !== 'ALL' && z.stream !== STATE.zeroStream) return false;
      if (STATE.zeroClass !== 'ALL' && z.classification !== STATE.zeroClass) return false;
      return true;
    });

    var truckOpts = '<option value="ALL">Selected Trucks (' + model.truckRows.length + ')</option>' +
      model.cohortRows.map(function (r) {
        return '<option value="' + esc(r.code) + '"' + (STATE.zeroTruck === r.code ? ' selected' : '') + '>' + esc(truckLabel(r.code)) + '</option>';
      }).join('');

    var rowsHtml = filtered.slice(0, 120).map(function (z) {
      return '<tr class="fpnl-clickable-row" data-fpnl-open-rec="' + esc(z.table) + ':' + esc(z.id) + '">' +
        '<td>' + esc(z.date) + '</td>' +
        '<td>' + esc(z.company) + '</td>' +
        '<td>' + esc(z.stream) + '</td>' +
        '<td><b>' + esc(z.truck) + '</b></td>' +
        '<td>' + esc(z.counterparty) + ' · <small>' + esc(z.site) + '</small></td>' +
        '<td>' + esc(z.material) + '</td>' +
        '<td class="num">' + fmtNum(z.qty_m3, 1) + ' m³</td>' +
        '<td class="num">' + fmtMoney(z.unit_price) + '</td>' +
        '<td><span class="fpnl-tag">' + esc(z.classification) + '</span></td>' +
        '<td class="num pos">+' + fmtMoney(z.shadow_credit) + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="fpnl-section-card">' +
      '<div class="fpnl-section-head">' +
        '<div>' +
          '<h4 class="fpnl-section-title">Unpriced ($0.00) Haulage Explorer &amp; Transfer Credit</h4>' +
          '<p class="fpnl-section-sub">Click a category card below to filter unbundled sales deliveries vs. internal quarry raw material hauls</p>' +
        '</div>' +
        '<div class="fpnl-controls-row">' +
          '<select id="fpnlZeroTruck" class="fpnl-select">' + truckOpts + '</select>' +
        '</div>' +
      '</div>' +
      '<div class="fpnl-cat-cards">' +
        '<div class="fpnl-cat-card' + (STATE.zeroStream === 'ALL' ? ' active' : '') + '" data-fpnl-zero-card="ALL">' +
          '<div class="fpnl-cat-lbl">ALL $0.00 TRIPS (SELECTED)</div>' +
          '<div class="fpnl-cat-val">' + fmtInt(baseZero.length) + ' Trips</div>' +
          '<div class="fpnl-cat-sub">Transfer Credit: +' + fmtMoney(salesCred + rawCred) + '</div>' +
        '</div>' +
        '<div class="fpnl-cat-card' + (STATE.zeroStream === 'Sales Delivery' ? ' active' : '') + '" data-fpnl-zero-card="Sales Delivery">' +
          '<div class="fpnl-cat-lbl">UNBUNDLED SALES DELIVERIES</div>' +
          '<div class="fpnl-cat-val">' + fmtInt(salesZero.length) + ' Trips</div>' +
          '<div class="fpnl-cat-sub">All-in C&amp;D ($5.00/m³ credit): +' + fmtMoney(salesCred) + '</div>' +
        '</div>' +
        '<div class="fpnl-cat-card' + (STATE.zeroStream === 'Raw Material Inbound' ? ' active' : '') + '" data-fpnl-zero-card="Raw Material Inbound">' +
          '<div class="fpnl-cat-lbl">INTERNAL QUARRY / PLANT RAW HAULS</div>' +
          '<div class="fpnl-cat-val">' + fmtInt(rawZero.length) + ' Trips</div>' +
          '<div class="fpnl-cat-sub">Internal rate ($1.44/m³ · $40 floor): +' + fmtMoney(rawCred) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="fpnl-table-wrap">' +
        '<table class="fpnl-table">' +
          '<thead><tr><th>DATE</th><th>CO.</th><th>STREAM</th><th>TRUCK</th><th>COUNTERPARTY &amp; SITE</th><th>MATERIAL</th><th class="num">QTY</th><th class="num">UNIT PRICE</th><th>CLASSIFICATION</th><th class="num">SHADOW CREDIT</th></tr></thead>' +
          '<tbody>' + (rowsHtml || '<tr><td colspan="10" class="fpnl-empty-mini">No $0.00 haulage trips match the current filter.</td></tr>') + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
  }

  function renderSubtabRoutes(model, ds) {
    var actSet = {};
    model.truckRows.forEach(function (r) { actSet[r.code] = true; });
    var q = String(STATE.routeSearch || '').trim().toLowerCase();

    var list = ds.routes.filter(function (rt) {
      if (STATE.routeTruck !== 'ALL') {
        if (rt.truck !== STATE.routeTruck) return false;
      } else if (!actSet[rt.truck]) {
        return false;
      }
      if (STATE.routeCompany !== 'ALL' && rt.company !== STATE.routeCompany) return false;
      if (q) {
        var hay = (rt.counterparty + ' ' + rt.site + ' ' + rt.material + ' ' + rt.truck + ' ' + rt.stream).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    }).slice();

    list.sort(function (a, b) {
      if (STATE.routeSort === 'rev_desc') return (b.adjRev - a.adjRev) || (b.trips - a.trips);
      if (STATE.routeSort === 'qty_desc') return (b.qtyM3 - a.qtyM3) || (b.trips - a.trips);
      return (b.trips - a.trips) || (b.adjRev - a.adjRev);
    });

    var maxTrips = 1;
    list.forEach(function (rt) { maxTrips = Math.max(maxTrips, rt.trips); });

    var truckOpts = '<option value="ALL">Selected Trucks (' + model.truckRows.length + ')</option>' +
      model.cohortRows.map(function (r) {
        return '<option value="' + esc(r.code) + '"' + (STATE.routeTruck === r.code ? ' selected' : '') + '>' + esc(truckLabel(r.code)) + '</option>';
      }).join('');

    var rowsHtml = list.slice(0, 120).map(function (rt) {
      var barW = Math.max(4, Math.round((rt.trips / maxTrips) * 100));
      return '<tr>' +
        '<td>' + esc(rt.company) + '</td>' +
        '<td>' + esc(rt.stream) + '</td>' +
        '<td><b>' + esc(rt.truck) + '</b></td>' +
        '<td>' + esc(rt.counterparty) + '</td>' +
        '<td>' + esc(rt.site) + '</td>' +
        '<td>' + esc(rt.material) + '</td>' +
        '<td class="num"><b>' + fmtInt(rt.trips) + '</b> <small>(' + fmtInt(rt.paidTrips) + ' paid / ' + fmtInt(rt.zeroTrips) + ' $0)</small>' +
          '<div class="fpnl-comp-track" style="margin-top:3px"><div class="fpnl-comp-fill fpnl-seg-indigo" style="width:' + barW + '%"></div></div>' +
        '</td>' +
        '<td class="num">' + fmtNum(rt.qtyM3, 1) + ' m³</td>' +
        '<td class="num">' + fmtMoney(rt.rev) + '</td>' +
        '<td class="num pos">' + (rt.shadowCredit > 0 ? ('+' + fmtMoney(rt.shadowCredit)) : '$0.00') + '</td>' +
        '<td class="num"><b>' + fmtMoney(rt.adjRev) + '</b></td>' +
      '</tr>';
    }).join('');

    return '<div class="fpnl-section-card">' +
      '<div class="fpnl-section-head">' +
        '<div>' +
          '<h4 class="fpnl-section-title">Routes &amp; Hauling Corridors (' + fmtInt(list.length) + ' Corridors)</h4>' +
          '<p class="fpnl-section-sub">Ranked by trip frequency, volume hauled, and total commercial value</p>' +
        '</div>' +
        '<div class="fpnl-controls-row">' +
          '<input type="search" id="fpnlRouteSearch" class="fpnl-input" placeholder="Search customer, quarry, site, material..." value="' + esc(STATE.routeSearch) + '" />' +
          '<select id="fpnlRouteTruck" class="fpnl-select">' + truckOpts + '</select>' +
          '<select id="fpnlRouteCompany" class="fpnl-select">' +
            '<option value="ALL"' + (STATE.routeCompany === 'ALL' ? ' selected' : '') + '>All Companies</option>' +
            '<option value="WTC"' + (STATE.routeCompany === 'WTC' ? ' selected' : '') + '>WTC</option>' +
            '<option value="BBConstruction"' + (STATE.routeCompany === 'BBConstruction' ? ' selected' : '') + '>BBConstruction</option>' +
          '</select>' +
          '<select id="fpnlRouteSort" class="fpnl-select">' +
            '<option value="trips_desc"' + (STATE.routeSort === 'trips_desc' ? ' selected' : '') + '>Sort: Most Trips</option>' +
            '<option value="rev_desc"' + (STATE.routeSort === 'rev_desc' ? ' selected' : '') + '>Sort: Highest Value</option>' +
            '<option value="qty_desc"' + (STATE.routeSort === 'qty_desc' ? ' selected' : '') + '>Sort: Highest Volume (m³)</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div class="fpnl-table-wrap">' +
        '<table class="fpnl-table">' +
          '<thead><tr><th>CO.</th><th>STREAM</th><th>TRUCK</th><th>COUNTERPARTY</th><th>WORK SITE</th><th>MATERIAL</th><th class="num">TRIPS &amp; SHARE</th><th class="num">VOLUME</th><th class="num">BOOKED REV</th><th class="num">UNBUNDLED CREDIT</th><th class="num">ADJUSTED REV</th></tr></thead>' +
          '<tbody>' + (rowsHtml || '<tr><td colspan="11" class="fpnl-empty-mini">No routes match the current filter.</td></tr>') + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
  }

  function renderSubtabExpenses(model, ds) {
    var actSet = {};
    model.truckRows.forEach(function (r) { actSet[r.code] = true; });
    var baseExp = ds.expenses.filter(function (e) {
      if (STATE.expTruck !== 'ALL') return e.truck === STATE.expTruck;
      return !!actSet[e.truck];
    });

    var repTotal = baseExp.filter(function (e) { return e.bucket === 'Repairs & Parts'; }).reduce(function (a, b) { return a + b.total_usd; }, 0);
    var lubTotal = baseExp.filter(function (e) { return e.bucket === 'Oils & Lubricants'; }).reduce(function (a, b) { return a + b.total_usd; }, 0);
    var insTotal = baseExp.filter(function (e) { return e.bucket === 'Insurance & Permits'; }).reduce(function (a, b) { return a + b.total_usd; }, 0);
    var allTotal = repTotal + lubTotal + insTotal;

    var q = String(STATE.expSearch || '').trim().toLowerCase();
    var filtered = baseExp.filter(function (e) {
      if (STATE.expCategory !== 'ALL' && e.bucket !== STATE.expCategory) return false;
      if (STATE.expCompany !== 'ALL' && e.company !== STATE.expCompany) return false;
      if (q) {
        var hay = (e.supplier + ' ' + e.subcategory + ' ' + e.notes + ' ' + e.bill_number + ' ' + e.truck).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });

    var truckOpts = '<option value="ALL">Selected Trucks (' + model.truckRows.length + ')</option>' +
      model.cohortRows.map(function (r) {
        return '<option value="' + esc(r.code) + '"' + (STATE.expTruck === r.code ? ' selected' : '') + '>' + esc(truckLabel(r.code)) + '</option>';
      }).join('');

    var rowsHtml = filtered.slice(0, 150).map(function (e) {
      return '<tr class="fpnl-clickable-row" data-fpnl-open-rec="expenses:' + esc(e.id) + '">' +
        '<td>' + esc(e.date) + '</td>' +
        '<td>' + esc(e.company) + '</td>' +
        '<td><b>' + esc(e.truck) + '</b></td>' +
        '<td><span class="fpnl-tag">' + esc(e.bucket) + '</span></td>' +
        '<td>' + esc(e.subcategory) + '</td>' +
        '<td>' + esc(e.supplier) + '</td>' +
        '<td>' + esc(e.bill_number) + '</td>' +
        '<td>' + esc(e.notes) + '</td>' +
        '<td class="num neg">-' + fmtMoney(e.total_usd) + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="fpnl-section-card">' +
      '<div class="fpnl-section-head">' +
        '<div>' +
          '<h4 class="fpnl-section-title">Diesel Fuel, Repairs, Lubricants &amp; Insurance (' + fmtInt(filtered.length) + ' Bills)</h4>' +
          '<p class="fpnl-section-sub">Click any expense bucket card below to filter bills. Capital Expenditures are isolated from operating costs.</p>' +
        '</div>' +
        '<div class="fpnl-controls-row">' +
          '<input type="search" id="fpnlExpSearch" class="fpnl-input" placeholder="Search supplier, part, bill #, note..." value="' + esc(STATE.expSearch) + '" />' +
          '<select id="fpnlExpTruck" class="fpnl-select">' + truckOpts + '</select>' +
          '<select id="fpnlExpCompany" class="fpnl-select">' +
            '<option value="ALL"' + (STATE.expCompany === 'ALL' ? ' selected' : '') + '>All Companies</option>' +
            '<option value="WTC"' + (STATE.expCompany === 'WTC' ? ' selected' : '') + '>WTC</option>' +
            '<option value="BBConstruction"' + (STATE.expCompany === 'BBConstruction' ? ' selected' : '') + '>BBConstruction</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div class="fpnl-cat-cards">' +
        '<div class="fpnl-cat-card' + (STATE.expCategory === 'ALL' ? ' active' : '') + '" data-fpnl-exp-card="ALL">' +
          '<div class="fpnl-cat-lbl">ALL OPERATING BILLS</div>' +
          '<div class="fpnl-cat-val">-' + fmtMoney(allTotal) + '</div>' +
          '<div class="fpnl-cat-sub">' + fmtInt(baseExp.length) + ' bills + ' + fmtMoney(model.totals.dieselCost) + ' metered diesel (' + fmtInt(model.totals.dieselLiters) + ' L)</div>' +
        '</div>' +
        '<div class="fpnl-cat-card' + (STATE.expCategory === 'Repairs & Parts' ? ' active' : '') + '" data-fpnl-exp-card="Repairs & Parts">' +
          '<div class="fpnl-cat-lbl">REPAIRS, TIRES &amp; SPARE PARTS</div>' +
          '<div class="fpnl-cat-val">-' + fmtMoney(repTotal) + '</div>' +
          '<div class="fpnl-cat-sub">' + pct(repTotal, allTotal || 1) + ' of direct maintenance bills</div>' +
        '</div>' +
        '<div class="fpnl-cat-card' + (STATE.expCategory === 'Oils & Lubricants' ? ' active' : '') + '" data-fpnl-exp-card="Oils & Lubricants">' +
          '<div class="fpnl-cat-lbl">OILS &amp; LUBRICANTS</div>' +
          '<div class="fpnl-cat-val">-' + fmtMoney(lubTotal) + '</div>' +
          '<div class="fpnl-cat-sub">' + pct(lubTotal, allTotal || 1) + ' of direct maintenance bills</div>' +
        '</div>' +
        '<div class="fpnl-cat-card' + (STATE.expCategory === 'Insurance & Permits' ? ' active' : '') + '" data-fpnl-exp-card="Insurance & Permits">' +
          '<div class="fpnl-cat-lbl">INSURANCE, PERMITS &amp; TAXES</div>' +
          '<div class="fpnl-cat-val">-' + fmtMoney(insTotal) + '</div>' +
          '<div class="fpnl-cat-sub">' + pct(insTotal, allTotal || 1) + ' of direct maintenance bills</div>' +
        '</div>' +
      '</div>' +
      '<div class="fpnl-table-wrap">' +
        '<table class="fpnl-table">' +
          '<thead><tr><th>DATE</th><th>CO.</th><th>TRUCK</th><th>BUCKET</th><th>SUBCATEGORY</th><th>SUPPLIER</th><th>BILL #</th><th>DESCRIPTION / NOTES</th><th class="num">AMOUNT</th></tr></thead>' +
          '<tbody>' + (rowsHtml || '<tr><td colspan="9" class="fpnl-empty-mini">No operating expense bills match the current filter.</td></tr>') + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
  }

  function renderSubtabOvertime(model, ds) {
    var actSet = {};
    model.truckRows.forEach(function (r) { actSet[r.code] = true; });
    var scopedDrivers = ds.driverList.filter(function (d) {
      if (STATE.otTruck !== 'ALL') return d.truck === STATE.otTruck;
      return !!actSet[d.truck];
    });
    var drvCards = scopedDrivers.slice(0, 6).map(function (d) {
      var active = STATE.otDriver === d.driver ? ' active' : '';
      return '<div class="fpnl-cat-card' + active + '" data-fpnl-drv-card="' + esc(d.driver) + '">' +
        '<div class="fpnl-cat-lbl">' + esc(d.driver.toUpperCase()) + ' (' + esc(d.truck) + ')</div>' +
        '<div class="fpnl-cat-val">' + fmtNum(d.hours, 1) + ' hrs · ' + fmtMoney(d.otPay) + '</div>' +
        '<div class="fpnl-cat-sub">' + fmtInt(d.entries) + ' OT logs @ ' + fmtMoney(d.rate) + '/hr</div>' +
      '</div>';
    }).join('');

    var filtered = ds.overtimeRows.filter(function (o) {
      if (STATE.otDriver !== 'ALL' && o.driver !== STATE.otDriver) return false;
      if (STATE.otTruck !== 'ALL') return o.truck === STATE.otTruck;
      return !!actSet[o.truck];
    });

    var drvOpts = '<option value="ALL">All Drivers (' + scopedDrivers.length + ')</option>' +
      scopedDrivers.map(function (d) {
        return '<option value="' + esc(d.driver) + '"' + (STATE.otDriver === d.driver ? ' selected' : '') + '>' + esc(d.driver) + ' (' + fmtNum(d.hours, 0) + 'h)</option>';
      }).join('');

    var rowsHtml = filtered.slice(0, 120).map(function (o) {
      return '<tr class="fpnl-clickable-row" data-fpnl-open-rec="overtime:' + esc(o.id) + '">' +
        '<td>' + esc(o.date) + '</td>' +
        '<td>' + esc(o.company) + '</td>' +
        '<td><b>' + esc(o.driver) + '</b></td>' +
        '<td>' + esc(o.truck) + '</td>' +
        '<td class="num">' + fmtNum(o.hours, 1) + ' hrs</td>' +
        '<td class="num">' + fmtMoney(o.rate) + '/hr</td>' +
        '<td class="num neg">-' + fmtMoney(o.pay) + '</td>' +
        '<td>' + esc(o.notes) + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="fpnl-section-card">' +
      '<div class="fpnl-section-head">' +
        '<div>' +
          '<h4 class="fpnl-section-title">Driver Overtime &amp; Payroll Allocation (' + fmtInt(filtered.length) + ' Logs)</h4>' +
          '<p class="fpnl-section-sub">Click a driver card to filter overtime entries or click Reset to view all drivers</p>' +
        '</div>' +
        '<div class="fpnl-controls-row">' +
          '<select id="fpnlOtDriver" class="fpnl-select">' + drvOpts + '</select>' +
          (STATE.otDriver !== 'ALL' ? '<button type="button" class="fpnl-focus-btn" data-fpnl-drv-card="ALL">Show All Drivers</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="fpnl-cat-cards">' + drvCards + '</div>' +
      '<div class="fpnl-table-wrap">' +
        '<table class="fpnl-table">' +
          '<thead><tr><th>DATE</th><th>CO.</th><th>DRIVER</th><th>ASSIGNED TRUCK</th><th class="num">OT HOURS</th><th class="num">RATE</th><th class="num">OT PAY</th><th>NOTES</th></tr></thead>' +
          '<tbody>' + (rowsHtml || '<tr><td colspan="8" class="fpnl-empty-mini">No overtime entries match the current filter.</td></tr>') + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
  }

  function renderSubtabRecon(model, ds) {
    var cards = ds.diagnostics.map(function (d) {
      var tone = d.severity === 'resolved' ? 'pos' : 'neg';
      return '<div class="fpnl-viz-card">' +
        '<div class="fpnl-viz-head">' +
          '<div>' +
            '<span class="fpnl-net-pill ' + tone + '">' + esc(d.badge) + '</span>' +
            '<div class="fpnl-viz-title" style="margin-top:6px">' + esc(d.title) + '</div>' +
          '</div>' +
          '<button type="button" class="fpnl-focus-btn" data-fpnl-kpi-jump="' + esc(d.targetTab) + '">Inspect Ledger</button>' +
        '</div>' +
        '<p class="fpnl-section-sub" style="margin:6px 0 10px">' + esc(d.summary) + '</p>' +
        '<div class="fpnl-tc-sub"><b>Active Period Impact:</b> ' + esc(d.impact) + '</div>' +
      '</div>';
    }).join('');

    return '<div class="fpnl-section-card">' +
      '<div class="fpnl-section-head">' +
        '<div>' +
          '<h4 class="fpnl-section-title">Live Cross-Ledger Accounting &amp; Pricing Integrity Checks</h4>' +
          '<p class="fpnl-section-sub">Automated safeguards ensuring CapEx isolation, single-source diesel costing, and unbundled transfer pricing</p>' +
        '</div>' +
      '</div>' +
      '<div class="fpnl-viz-grid">' + cards + '</div>' +
    '</div>';
  }

  function renderActiveSubtab(model, ds) {
    if (STATE.subtab === 'zero') return renderSubtabZero(model, ds);
    if (STATE.subtab === 'routes') return renderSubtabRoutes(model, ds);
    if (STATE.subtab === 'expenses') return renderSubtabExpenses(model, ds);
    if (STATE.subtab === 'overtime') return renderSubtabOvertime(model, ds);
    if (STATE.subtab === 'recon') return renderSubtabRecon(model, ds);
    return renderSubtabPnl(model, ds);
  }

  function renderHeaderTitle(model) {
    var names = model.truckRows.slice(0, 4).map(function (r) { return r.displayCode; }).join(' · ');
    if (model.truckRows.length > 4) names += ' +' + (model.truckRows.length - 4);
    return 'Interactive Truck Revenue & Operating Cost Studio (' + (names || 'All Trucks') + ')';
  }

  function buildCockpitInnerHtml() {
    var model = computeModel();
    var ds = model.dataset;
    var dSum = activeDateSummary();
    var actSet = {};
    model.truckRows.forEach(function (r) { actSet[r.code] = true; });
    var scopedExpCount = ds.expenses.filter(function (e) { return !!actSet[e.truck]; }).length;
    var scopedOtCount = ds.overtimeRows.filter(function (o) { return !!actSet[o.truck]; }).length;

    var isAll = dSum.period === 'all' && !dSum.from && !dSum.to;
    var is2026 = dSum.from === '2026-01-01' && dSum.to === '2026-12-31';
    var is2025 = dSum.from === '2025-01-01' && dSum.to === '2025-12-31';
    var isQtd = dSum.from === '2026-10-01' && dSum.to === '2026-12-31';
    var isMtd = dSum.from === '2026-10-01' && dSum.to === '2026-10-31';

    return '<div class="fpnl-header">' +
        '<div class="fpnl-header-left">' +
          '<div class="fpnl-eyebrow">LIVE FLEET UNIT ECONOMICS · DYNAMIC PERIOD &amp; COHORT STUDIO</div>' +
          '<h3 class="fpnl-title" id="fpnlMainTitle">' + esc(renderHeaderTitle(model)) + '</h3>' +
          '<p class="fpnl-subtitle">Click any truck, KPI card, revenue/cost segment, or monthly bar to drill down. Synced live with the active date range and company filter.</p>' +
        '</div>' +
        '<div class="fpnl-header-right">' +
          '<div class="fpnl-period-strip">' +
            '<button type="button" class="fpnl-period-trigger" data-fpnl-open-date-picker="1" title="Click to open the custom Date Range &amp; Period Slicer">' +
              '<span class="fpnl-period-dot"></span>' +
              '<span>' + esc(dSum.label) + ' (' + esc(dSum.basis) + ')</span>' +
            '</button>' +
            '<button type="button" class="fpnl-qperiod-chip' + (isAll ? ' active' : '') + '" data-fpnl-quick-period="all">All-Time</button>' +
            '<button type="button" class="fpnl-qperiod-chip' + (is2026 ? ' active' : '') + '" data-fpnl-quick-period="year:2026">FY 2026</button>' +
            '<button type="button" class="fpnl-qperiod-chip' + (is2025 ? ' active' : '') + '" data-fpnl-quick-period="year:2025">FY 2025</button>' +
            '<button type="button" class="fpnl-qperiod-chip' + (isQtd ? ' active' : '') + '" data-fpnl-quick-period="qtd">Q4 2026</button>' +
            '<button type="button" class="fpnl-qperiod-chip' + (isMtd ? ' active' : '') + '" data-fpnl-quick-period="mtd">Oct 2026</button>' +
          '</div>' +
          '<div class="fpnl-mode-group" role="tablist" aria-label="Revenue Valuation Mode">' +
            '<button type="button" class="fpnl-mode-btn' + (STATE.mode === 'recorded' ? ' active' : '') + '" data-fpnl-mode="recorded">Booked Revenue</button>' +
            '<button type="button" class="fpnl-mode-btn' + (STATE.mode === 'strict' ? ' active' : '') + '" data-fpnl-mode="strict">+ Unbundled Delivery</button>' +
            '<button type="button" class="fpnl-mode-btn' + (STATE.mode === 'full' ? ' active' : '') + '" data-fpnl-mode="full">Full Commercial Value</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="fpnl-truck-bar" id="fpnlTruckFilterBar">' + renderTruckFilterBar(model, ds) + '</div>' +

      '<div class="fpnl-subtabs" role="tablist">' +
        '<button type="button" class="fpnl-subtab' + (STATE.subtab === 'pnl' ? ' active' : '') + '" data-fpnl-tab="pnl">' +
          '<span>Scorecards &amp; P&amp;L Studio</span><span class="fpnl-subtab-badge" id="fpnlBadgeTrucks">' + model.truckRows.length + ' Trucks</span>' +
        '</button>' +
        '<button type="button" class="fpnl-subtab' + (STATE.subtab === 'routes' ? ' active' : '') + '" data-fpnl-tab="routes">' +
          '<span>Routes &amp; Corridors</span><span class="fpnl-subtab-badge" id="fpnlBadgeRoutes">' + fmtInt(ds.routes.length) + ' Routes</span>' +
        '</button>' +
        '<button type="button" class="fpnl-subtab' + (STATE.subtab === 'zero' ? ' active' : '') + '" data-fpnl-tab="zero">' +
          '<span>Unpriced ($0.00) Loads</span><span class="fpnl-subtab-badge" id="fpnlBadgeZero">' + fmtInt(model.totals.totalZeroTrips) + ' Trips</span>' +
        '</button>' +
        '<button type="button" class="fpnl-subtab' + (STATE.subtab === 'expenses' ? ' active' : '') + '" data-fpnl-tab="expenses">' +
          '<span>Fuel, Repairs &amp; Bills</span><span class="fpnl-subtab-badge" id="fpnlBadgeExp">' + fmtInt(scopedExpCount) + ' Bills</span>' +
        '</button>' +
        '<button type="button" class="fpnl-subtab' + (STATE.subtab === 'overtime' ? ' active' : '') + '" data-fpnl-tab="overtime">' +
          '<span>Drivers &amp; Overtime</span><span class="fpnl-subtab-badge" id="fpnlBadgeOt">' + fmtInt(scopedOtCount) + ' OT</span>' +
        '</button>' +
        '<button type="button" class="fpnl-subtab' + (STATE.subtab === 'recon' ? ' active' : '') + '" data-fpnl-tab="recon">' +
          '<span>Integrity Safeguards</span><span class="fpnl-subtab-badge">' + ds.diagnostics.length + ' Checks</span>' +
        '</button>' +
      '</div>' +

      '<div class="fpnl-kpi-grid" id="fpnlKpiStrip">' + renderKpiStrip(model, ds) + '</div>' +
      '<div class="fpnl-body" id="fpnlBody">' + renderActiveSubtab(model, ds) + '</div>';
  }

  function renderCockpitHtml(opts) {
    var options = opts || {};
    var id = options.containerId || 'fleetRevCostCockpit';
    if (options.slicerEquipment) {
      var eqCode = normTruckCode(options.slicerEquipment);
      if (eqCode) {
        if (STATE.selectedTrucks.indexOf(eqCode) < 0) {
          STATE.selectedTrucks.push(eqCode);
        }
        STATE.focusedTruck = eqCode;
      }
    }
    bindGlobalCockpitEvents();
    return '<section class="fpnl-cockpit" id="' + esc(id) + '" data-fpnl-root="1">' +
      buildCockpitInnerHtml() +
    '</section>';
  }

  function renderFullCockpit(container) {
    if (!container) return;
    container.classList.remove('panel-card');
    container.classList.add('fpnl-cockpit');
    container.setAttribute('data-fpnl-root', '1');
    container.innerHTML = buildCockpitInnerHtml();
    bindGlobalCockpitEvents();
    if (window.MFG_I18N && typeof window.MFG_I18N.applyDom === 'function') {
      window.MFG_I18N.applyDom(container);
    }
  }

  function refreshAllMountedCockpits() {
    LIVE_CACHE = null;
    var c1 = document.getElementById('fleetRevCostCockpit');
    if (c1) renderFullCockpit(c1);
    var c2 = document.getElementById('pbiFleetRevCostCockpit');
    if (c2) renderFullCockpit(c2);
  }

  var GLOBAL_BOUND = false;

  function findCockpitRoot(el) {
    if (!el || typeof el.closest !== 'function') return document.getElementById('fleetRevCostCockpit') || document.getElementById('pbiFleetRevCostCockpit');
    return el.closest('[data-fpnl-root], #fleetRevCostCockpit, #pbiFleetRevCostCockpit') ||
      document.getElementById('fleetRevCostCockpit') ||
      document.getElementById('pbiFleetRevCostCockpit');
  }

  function bindGlobalCockpitEvents() {
    if (GLOBAL_BOUND || typeof document === 'undefined') return;
    GLOBAL_BOUND = true;

    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || typeof t.closest !== 'function') return;

      var extUnit = t.closest('[data-fpnl-focus-unit]');
      if (extUnit) {
        var uCode = normTruckCode(extUnit.getAttribute('data-fpnl-focus-unit'));
        if (uCode) {
          if (STATE.selectedTrucks.indexOf(uCode) < 0) STATE.selectedTrucks.push(uCode);
          STATE.focusedTruck = uCode;
          refreshAllMountedCockpits();
          var cEl = document.getElementById('fleetRevCostCockpit');
          if (cEl && typeof cEl.scrollIntoView === 'function') cEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }

      var extJump = t.closest('[data-fpnl-jump]');
      if (extJump) {
        var jTab = extJump.getAttribute('data-fpnl-jump') || 'overtime';
        STATE.subtab = jTab;
        if (typeof window.__navToView === 'function') {
          window.__navToView('fleet_equip');
        } else if (window.MFG_ENTERPRISE && typeof window.MFG_ENTERPRISE.navigate === 'function') {
          window.MFG_ENTERPRISE.navigate('fleet_equip');
        }
        refreshAllMountedCockpits();
        return;
      }

      var container = findCockpitRoot(t);
      if (!container) return;

      if (STATE.truckPickerOpen && !t.closest('#fpnlTruckPickerWrap')) {
        STATE.truckPickerOpen = false;
        renderFullCockpit(container);
      }

      var openDp = t.closest('[data-fpnl-open-date-picker]');
      if (openDp) {
        ev.preventDefault();
        openTopbarDatePicker(openDp);
        return;
      }

      var qp = t.closest('[data-fpnl-quick-period]');
      if (qp) {
        ev.preventDefault();
        applyQuickPeriod(qp.getAttribute('data-fpnl-quick-period'));
        refreshAllMountedCockpits();
        return;
      }

      var mFilter = t.closest('[data-fpnl-filter-month]');
      if (mFilter) {
        ev.preventDefault();
        var ym = mFilter.getAttribute('data-fpnl-filter-month');
        var ent = window.MFG_ENTERPRISE;
        if (ym && ent && typeof ent.setDateFilter === 'function') {
          ent.setDateFilter({ period: 'month:' + ym });
          refreshAllMountedCockpits();
        }
        return;
      }

      var modeBtn = t.closest('[data-fpnl-mode]');
      if (modeBtn) {
        STATE.mode = modeBtn.getAttribute('data-fpnl-mode') || 'strict';
        renderFullCockpit(container);
        return;
      }

      var tabBtn = t.closest('[data-fpnl-tab]');
      if (tabBtn) {
        STATE.subtab = tabBtn.getAttribute('data-fpnl-tab') || 'pnl';
        renderFullCockpit(container);
        return;
      }

      var kpiJump = t.closest('[data-fpnl-kpi-jump]');
      if (kpiJump) {
        STATE.subtab = kpiJump.getAttribute('data-fpnl-kpi-jump') || 'pnl';
        renderFullCockpit(container);
        return;
      }

      var viewBtn = t.closest('[data-fpnl-pnl-view]');
      if (viewBtn) {
        STATE.pnlView = viewBtn.getAttribute('data-fpnl-pnl-view') || 'visual';
        renderFullCockpit(container);
        return;
      }

      var cohortBtn = t.closest('[data-fpnl-cohort]');
      if (cohortBtn) {
        var cid = cohortBtn.getAttribute('data-fpnl-cohort');
        STATE.cohort = cid;
        STATE.focusedTruck = 'ALL';
        var ds = getActiveDataset();
        var found = COHORTS.filter(function (c) { return c.id === cid; })[0];
        if (found && found.trucks && found.trucks.length) {
          STATE.selectedTrucks = found.trucks.slice();
        } else {
          STATE.selectedTrucks = ds.allTruckList.slice(0, 10).map(function (x) { return x.code; });
        }
        renderFullCockpit(container);
        return;
      }

      var compBtn = t.closest('[data-fpnl-comp]');
      if (compBtn) {
        STATE.companyFilter = compBtn.getAttribute('data-fpnl-comp') || 'ALL';
        LIVE_CACHE = null;
        renderFullCockpit(container);
        return;
      }

      var pickerToggle = t.closest('[data-fpnl-picker-toggle]');
      if (pickerToggle) {
        STATE.truckPickerOpen = !STATE.truckPickerOpen;
        renderFullCockpit(container);
        return;
      }

      var toggleTruck = t.closest('[data-fpnl-toggle-truck]');
      if (toggleTruck) {
        var tc = toggleTruck.getAttribute('data-fpnl-toggle-truck');
        var cur = selectedTruckCodes();
        var idx = cur.indexOf(tc);
        if (idx >= 0) {
          if (cur.length > 1) cur.splice(idx, 1);
        } else {
          cur.push(tc);
        }
        STATE.cohort = 'custom';
        STATE.selectedTrucks = cur;
        STATE.focusedTruck = 'ALL';
        renderFullCockpit(container);
        return;
      }

      var focusBtn = t.closest('[data-fpnl-focus-truck]');
      if (focusBtn) {
        var ft = focusBtn.getAttribute('data-fpnl-focus-truck') || 'ALL';
        STATE.focusedTruck = (STATE.focusedTruck === ft && ft !== 'ALL') ? 'ALL' : ft;
        renderFullCockpit(container);
        return;
      }

      var drillBtn = t.closest('[data-fpnl-drill]');
      if (drillBtn) {
        var targetTab = drillBtn.getAttribute('data-fpnl-drill') || 'routes';
        var drillTruck = drillBtn.getAttribute('data-fpnl-truck') || 'ALL';
        STATE.subtab = targetTab;
        if (targetTab === 'routes') STATE.routeTruck = drillTruck;
        if (targetTab === 'zero') STATE.zeroTruck = drillTruck;
        if (targetTab === 'expenses') STATE.expTruck = drillTruck;
        if (targetTab === 'overtime') STATE.otTruck = drillTruck;
        renderFullCockpit(container);
        return;
      }

      var zCard = t.closest('[data-fpnl-zero-card]');
      if (zCard) {
        STATE.zeroStream = zCard.getAttribute('data-fpnl-zero-card') || 'ALL';
        renderFullCockpit(container);
        return;
      }

      var eCard = t.closest('[data-fpnl-exp-card]');
      if (eCard) {
        STATE.expCategory = eCard.getAttribute('data-fpnl-exp-card') || 'ALL';
        renderFullCockpit(container);
        return;
      }

      var dCard = t.closest('[data-fpnl-drv-card]');
      if (dCard) {
        var drv = dCard.getAttribute('data-fpnl-drv-card') || 'ALL';
        STATE.otDriver = (STATE.otDriver === drv && drv !== 'ALL') ? 'ALL' : drv;
        renderFullCockpit(container);
        return;
      }

      var inspTruck = t.closest('[data-fpnl-inspect-truck]');
      if (inspTruck) {
        var code = inspTruck.getAttribute('data-fpnl-inspect-truck');
        if (window.MFG_ENTERPRISE && typeof window.MFG_ENTERPRISE.openEntityInspector === 'function') {
          window.MFG_ENTERPRISE.openEntityInspector('equipment', code);
        }
        return;
      }

      var inspDrv = t.closest('[data-fpnl-inspect-driver]');
      if (inspDrv) {
        var dName = inspDrv.getAttribute('data-fpnl-inspect-driver');
        if (window.MFG_ENTERPRISE && typeof window.MFG_ENTERPRISE.openEntityInspector === 'function') {
          window.MFG_ENTERPRISE.openEntityInspector('driver', dName);
        }
        return;
      }

      var openRec = t.closest('[data-fpnl-open-rec]');
      if (openRec) {
        var spec = String(openRec.getAttribute('data-fpnl-open-rec') || '').split(':');
        if (spec.length === 2 && spec[1] && window.MFG_ENTERPRISE && typeof window.MFG_ENTERPRISE.openRecordFromTableRow === 'function') {
          window.MFG_ENTERPRISE.openRecordFromTableRow(spec[0], spec[1]);
        }
      }
    });

    document.addEventListener('change', function (ev) {
      var el = ev.target;
      if (!el) return;
      var container = findCockpitRoot(el);
      if (!container) return;
      if (el.id === 'fpnlZeroTruck') { STATE.zeroTruck = el.value; renderFullCockpit(container); }
      else if (el.id === 'fpnlRouteTruck') { STATE.routeTruck = el.value; renderFullCockpit(container); }
      else if (el.id === 'fpnlRouteCompany') { STATE.routeCompany = el.value; renderFullCockpit(container); }
      else if (el.id === 'fpnlRouteSort') { STATE.routeSort = el.value; renderFullCockpit(container); }
      else if (el.id === 'fpnlExpTruck') { STATE.expTruck = el.value; renderFullCockpit(container); }
      else if (el.id === 'fpnlExpCompany') { STATE.expCompany = el.value; renderFullCockpit(container); }
      else if (el.id === 'fpnlOtDriver') { STATE.otDriver = el.value; renderFullCockpit(container); }
    });

    document.addEventListener('input', function (ev) {
      var el = ev.target;
      if (!el) return;
      var container = findCockpitRoot(el);
      if (!container) return;
      if (el.id === 'fpnlTruckSearchInput') {
        STATE.truckPickerQuery = el.value || '';
        renderFullCockpit(container);
        var inp = container.querySelector('#fpnlTruckSearchInput');
        if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
      } else if (el.id === 'fpnlRouteSearch') {
        STATE.routeSearch = el.value || '';
        renderFullCockpit(container);
        var rInp = container.querySelector('#fpnlRouteSearch');
        if (rInp) { rInp.focus(); rInp.setSelectionRange(rInp.value.length, rInp.value.length); }
      } else if (el.id === 'fpnlExpSearch') {
        STATE.expSearch = el.value || '';
        renderFullCockpit(container);
        var eInp = container.querySelector('#fpnlExpSearch');
        if (eInp) { eInp.focus(); eInp.setSelectionRange(eInp.value.length, eInp.value.length); }
      }
    });
  }

  function hookEnterpriseLifecycle() {
    var ent = window.MFG_ENTERPRISE;
    if (!ent || ent._fpnlLifecycleHooked) return;
    ent._fpnlLifecycleHooked = true;

    if (typeof ent.setDateFilter === 'function') {
      var origSetDate = ent.setDateFilter;
      ent.setDateFilter = function () {
        var res = origSetDate.apply(this, arguments);
        refreshAllMountedCockpits();
        return res;
      };
    }
  }

  var api = {
    state: STATE,
    renderCockpitHtml: renderCockpitHtml,
    render: function (containerOrId) {
      var el = typeof containerOrId === 'string' ? document.getElementById(containerOrId) : (containerOrId || document.getElementById('fleetRevCostCockpit'));
      if (el) renderFullCockpit(el);
    },
    refresh: refreshAllMountedCockpits,
    computeModel: computeModel,
    searchTruckCatalog: searchTruckCatalog
  };

  window.MFG_FLEET_PNL = api;
  window.FLEET_PNL = api;

  bindGlobalCockpitEvents();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      hookEnterpriseLifecycle();
      refreshAllMountedCockpits();
    });
  } else {
    hookEnterpriseLifecycle();
    refreshAllMountedCockpits();
  }
})();
