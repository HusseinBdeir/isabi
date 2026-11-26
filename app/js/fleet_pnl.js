/* ============================================================================
 * ISABI Command Center — Fleet Revenue & Operating Cost Studio (Rev 10 Ledger)
 *   - 100% driven by active topbar Company, Period / Date, Rep/Tx Basis &
 *     Official Books via window.MFG_ENTERPRISE.filterRecords.
 *   - Unified 4 views:
 *       1. pnl      : Truck P&L & Scorecards (Scorecards | P&L Matrix | Monthly Trend)
 *       2. routes   : Routes & Corridors (click row to inspect tickets inline)
 *       3. zero     : Unpriced ($0.00) Loads ($4.00/m³ Sales / $60 Raw)
 *       4. expenses : Cost Breakdown (ALL | Diesel | Repairs | Lubes & Ins. | Driver & OT)
 *   - 1:1 truck focus sync with #equipPanel & #coFleetAssignPanel.
 *   - Strict seatLens gating on Running Cost, Driver Payroll & Operating Margin.
 *   - Trilingual ready (EN | عربي | FR), zero native title tooltips, DD-MM-YYYY.
 * ============================================================================ */
(function () {
  'use strict';

  var PAGE_SIZE = 25;

  function nbMap(key) {
    var b = window.MFG_NAMEBOOK;
    return (b && typeof b.map === 'function') ? b.map(key) : {};
  }
  function nbList(key) {
    var b = window.MFG_NAMEBOOK;
    return (b && typeof b.list === 'function') ? b.list(key) : [];
  }

  var TRUCK_META = {
    TB1: { code: 'TB1', displayCode: 'TB1', plate: '360676', owner: 'Partner Truck', driver: 'Assigned Driver', driverShort: 'Driver', colorVar: 'var(--chart-navy)' },
    Tb7: { code: 'Tb7', displayCode: 'Tb7', plate: '364656', owner: 'Partner Truck', driver: 'Assigned Driver', driverShort: 'Driver', colorVar: 'var(--chart-steel)' },
    Tb9: { code: 'Tb9', displayCode: 'Tb9', plate: '364168', owner: 'Partner Truck', driver: 'Assigned Driver', driverShort: 'Driver', colorVar: 'var(--chart-brass)' },
    TB8: { code: 'TB8', displayCode: 'TB8', plate: '360678', owner: 'WTC Fleet', driver: 'Pool Driver', driverShort: 'Pool', colorVar: 'var(--chart-plum)' },
    Tb4: { code: 'Tb4', displayCode: 'Tb4', plate: '360674', owner: 'WTC Fleet', driver: 'Pool Driver', driverShort: 'Pool', colorVar: 'var(--chart-slate)' },
    TB3: { code: 'TB3', displayCode: 'TB3', plate: '360673', owner: 'WTC Fleet', driver: 'Pool Driver', driverShort: 'Pool', colorVar: 'var(--chart-good)' },
    Tb2: { code: 'Tb2', displayCode: 'Tb2', plate: '360672', owner: 'WTC Fleet', driver: 'Pool Driver', driverShort: 'Pool', colorVar: 'var(--chart-amber)' }
  };

  var CORE_PARTNER_CODES = ['TB1', 'Tb7', 'Tb9'];
  var CORE_OWN_CODES = ['TB8', 'Tb4', 'TB3', 'Tb2'];
  var CORE_ACCENT_VARS = [
    'var(--chart-navy)', 'var(--chart-steel)', 'var(--chart-brass)',
    'var(--chart-plum)', 'var(--chart-slate)', 'var(--chart-good)', 'var(--chart-amber)'
  ];

  var BASE_COHORTS = [
    { id: 'own_partner', label: 'Own & Partner Fleet', trucks: [] },
    { id: 'partner3', label: 'Partner Fleet (3)', trucks: CORE_PARTNER_CODES.slice() },
    { id: 'wtc4', label: 'WTC Own (4)', trucks: CORE_OWN_CODES.slice() },
    { id: 'top5', label: 'Top Haulers', trucks: [] }
  ];

  function getCohorts() {
    var extra = nbList('truck_cohorts').filter(function (c) {
      return c && c.id && c.label && Array.isArray(c.trucks) && !BASE_COHORTS.some(function (b) { return b.id === c.id; });
    });
    if (!extra.length) return BASE_COHORTS;
    return BASE_COHORTS.slice(0, BASE_COHORTS.length - 1).concat(extra, BASE_COHORTS.slice(BASE_COHORTS.length - 1));
  }

  var STATE = {
    mode: 'strict',         // 'recorded' | 'strict' | 'full'
    subtab: 'pnl',          // 'pnl' | 'routes' | 'zero' | 'expenses'
    pnlView: 'visual',      // 'visual' | 'table' | 'monthly'
    cohort: 'own_partner',  // 'own_partner' | 'partner3' | 'wtc4' | 'top5' | 'custom' | namebook id
    selectedTrucks: [],
    focusedTruck: 'ALL',
    slicerEquipment: '',
    routeSort: 'trips_desc',
    routeColSort: 'trips',
    routeColDir: 'desc',
    routeTruck: 'ALL',
    routeSearch: '',
    routeLimit: PAGE_SIZE,
    expandedRouteKey: '',
    zeroStream: 'ALL',
    zeroClass: 'ALL',
    zeroTruck: 'ALL',
    zeroColSort: 'date',
    zeroColDir: 'desc',
    zeroLimit: PAGE_SIZE,
    expCategory: 'ALL',     // 'ALL' | 'Diesel Fuel' | 'Repairs & Parts' | 'Lubes & Insurance' | 'Driver & OT'
    expTruck: 'ALL',
    expSearch: '',
    expColSort: 'date',
    expColDir: 'desc',
    expLimit: PAGE_SIZE,
    otDriver: 'ALL',
    otTruck: 'ALL',
    truckPickerOpen: false,
    truckPickerQuery: '',
    rulesOpen: false
  };

  var _lastCompanyScope = null;
  function syncCompanyFilterIfChanged() {
    var ent = window.MFG_ENTERPRISE;
    var st = (ent && ent.state) || window.STATE || {};
    var curCo = String(st.company || '');
    if (_lastCompanyScope === null) {
      _lastCompanyScope = curCo;
      return;
    }
    if (_lastCompanyScope !== curCo) {
      _lastCompanyScope = curCo;
      STATE.focusedTruck = 'ALL';
      STATE.slicerEquipment = '';
      STATE.otDriver = 'ALL';
      STATE.routeTruck = 'ALL';
      STATE.zeroTruck = 'ALL';
      STATE.expTruck = 'ALL';
      STATE.expandedRouteKey = '';
      STATE.routeLimit = PAGE_SIZE;
      STATE.zeroLimit = PAGE_SIZE;
      STATE.expLimit = PAGE_SIZE;
    }
  }

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

  function fmtDateDisplay(iso) {
    var s = String(iso || '').slice(0, 10);
    if (!s) return '—';
    var ent = window.MFG_ENTERPRISE;
    if (ent && typeof ent.fmtDateDMY === 'function') return ent.fmtDateDMY(s);
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
  }

  function pct(part, total, d) {
    if (!total) return '0.0%';
    var dec = d == null ? 1 : d;
    return `${((Number(part || 0) / Number(total)) * 100).toFixed(dec)}%`;
  }

  function isCoarsePointer() {
    try {
      return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    } catch (_) {
      return false;
    }
  }

  function isSingleCorpScope() {
    var ent = window.MFG_ENTERPRISE;
    if (ent && typeof ent.isSingleCorporationScope === 'function') return Boolean(ent.isSingleCorporationScope());
    var tc = window.MFG_TABLE_COLS;
    var st = (ent && ent.state) || window.STATE || {};
    return Boolean(tc && typeof tc.isSingleCorporationScope === 'function' && tc.isSingleCorporationScope(st));
  }

  function getSeatPermissions() {
    var ent = window.MFG_ENTERPRISE;
    var sl = (ent && typeof ent.seatLens === 'function') ? ent.seatLens() : null;
    var canPay = (ent && typeof ent.canViewPayrollDollarAmounts === 'function')
      ? Boolean(ent.canViewPayrollDollarAmounts())
      : (sl ? Boolean(sl.payrollDollars) : false);
    var canExp = sl ? Boolean(sl.expenses) : true;
    var canProfit = sl ? Boolean(sl.profit) : true;
    var canBooks = sl ? Boolean(sl.books) : true;
    return {
      canExp: canExp,
      canPay: canPay,
      canAllCost: Boolean(canExp && canPay),
      canProfit: canProfit,
      canBooks: canBooks
    };
  }

  function maskCell() {
    return '<span class="fpnl-muted" data-t="Restricted">Restricted</span>';
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
    if (up === 'TB5') return 'Tb5';
    return s;
  }

  function getEquipmentRec(code) {
    var seed = window.MFG_SEED || window.SEED || {};
    var eqs = (seed.records && seed.records.equipment) || [];
    var normC = String(code || '').trim().toLowerCase();
    for (var i = 0; i < eqs.length; i++) {
      var e = eqs[i];
      if (e && String(e.name || e.equipment || '').trim().toLowerCase() === normC) return e;
    }
    return null;
  }

  function getTruckMeta(code) {
    var c = normTruckCode(code);
    if (TRUCK_META[c]) {
      var ppl = nbMap('truck_people')[c];
      if (!ppl || typeof ppl !== 'object') return TRUCK_META[c];
      var merged = Object.assign({}, TRUCK_META[c]);
      ['owner', 'driver', 'driverShort'].forEach(function (k) { if (ppl[k]) merged[k] = String(ppl[k]); });
      return merged;
    }
    var eq = getEquipmentRec(c);
    var hash = 0;
    for (var i = 0; i < c.length; i++) hash = ((hash << 5) - hash) + c.charCodeAt(i);
    var colorVar = CORE_ACCENT_VARS[Math.abs(hash) % CORE_ACCENT_VARS.length];
    return {
      code: c,
      displayCode: c,
      plate: eq && eq.plate ? String(eq.plate) : 'Fleet Unit',
      owner: eq && /^own/i.test(eq.ownership || '') ? 'Company Fleet' : 'Active Fleet',
      driver: 'Assigned Driver',
      driverShort: 'Driver',
      colorVar: colorVar
    };
  }

  function relLinkHtml(rkey, val, label, bold) {
    var v = String(val || '').trim();
    if (!v || v === '—') return '—';
    var ent = window.MFG_ENTERPRISE;
    if (ent && typeof ent.relLink === 'function') return ent.relLink(rkey, v, label || v, Boolean(bold));
    return `<span class="rel-link" data-rel-key="${esc(rkey)}" data-rel-val="${esc(v)}">${bold ? `<strong>${esc(label || v)}</strong>` : esc(label || v)}<span class="rel-arr">↗</span></span>`;
  }

  function coBadgeHtml(co) {
    var ent = window.MFG_ENTERPRISE;
    if (ent && typeof ent.coBadge === 'function') return ent.coBadge(co);
    return `<span class="badge badge-info">${esc(co || 'WTC')}</span>`;
  }

  function healthBadgeHtml(unitName) {
    var ent = window.MFG_ENTERPRISE;
    if (ent && typeof ent.renderEquipmentHealthBadge === 'function') {
      return ent.renderEquipmentHealthBadge(unitName, null, true) || '';
    }
    return '';
  }

  function matchOtDriverToTruck(driverName, eqRaw) {
    var eqCode = normTruckCode(eqRaw);
    if (eqCode && eqCode !== 'Pool' && eqCode !== 'Plant') return eqCode;
    var d = String(driverName || '').trim().toLowerCase();
    if (!d) return '';
    var hints = nbList('driver_truck_hints');
    for (var i = 0; i < hints.length; i++) {
      var h = hints[i];
      if (h && Array.isArray(h.tokens) && h.truck) {
        var matched = h.tokens.every(function (tk) { return d.indexOf(String(tk).toLowerCase()) >= 0; });
        if (matched) return normTruckCode(h.truck);
      }
    }
    return '';
  }

  function matchExpTruck(ex) {
    var code = normTruckCode(ex.equipment || ex.truck);
    if (code) return code;
    var hay = `${ex.item_summary || ''} ${ex.notes || ''} ${ex.reference || ''} ${ex.supplier || ''}`.toUpperCase();
    if (/\bTB\s*-?\s*1\b|360676/.test(hay)) return 'TB1';
    if (/\bTB\s*-?\s*7\b|364656/.test(hay)) return 'Tb7';
    if (/\bTB\s*-?\s*9\b|364168/.test(hay)) return 'Tb9';
    if (/\bTB\s*-?\s*8\b|360678/.test(hay)) return 'TB8';
    if (/\bTB\s*-?\s*4\b|360674/.test(hay)) return 'Tb4';
    if (/\bTB\s*-?\s*3\b|360673/.test(hay)) return 'TB3';
    if (/\bTB\s*-?\s*2\b|360672/.test(hay)) return 'Tb2';
    if (/\bTB\s*-?\s*6\b/.test(hay)) return 'Tb6';
    if (/\bTB\s*-?\s*5\b/.test(hay)) return 'Tb5';
    return '';
  }

  function recDate(r, st) {
    var basis = String((st && (st.basis || st.dateBasis)) || 'rep');
    var raw = basis === 'tx'
      ? (r.tx_date || r.date || r.rep_date || r.posting_date || '')
      : (r.rep_date || r.set_date || r.reporting_date || r.date || r.tx_date || r.posting_date || '');
    return String(raw).slice(0, 10);
  }

  function creditForMode(item, mode) {
    if (!item) return 0;
    var m = mode || STATE.mode || 'strict';
    if (m === 'recorded') return 0;
    if (m === 'full') {
      var fullVal = item.fullCredit != null ? item.fullCredit : (item.benchmark_credit != null ? item.benchmark_credit : item.shadow_credit);
      return Number(fullVal || 0);
    }
    var strictVal = item.strictCredit != null ? item.strictCredit : (item.shadowCredit != null ? item.shadowCredit : item.shadow_credit);
    return Number(strictVal || 0);
  }

  function scopedTableRows(tableKey, ignorePeriod) {
    var seed = window.MFG_SEED || window.SEED || {};
    var recs = seed.records || {};
    var raw = recs[tableKey] || [];
    var ent = window.MFG_ENTERPRISE;
    if (ent && typeof ent.filterRecords === 'function') {
      return ent.filterRecords(raw, {
        ignorePeriod: Boolean(ignorePeriod),
        ignoreSearch: true,
        tableKey: tableKey
      }) || [];
    }
    return raw.slice();
  }

  function getTopbarScopeSummary() {
    var ent = window.MFG_ENTERPRISE;
    var st = (ent && ent.state) || window.STATE || {};
    var compLabels = {
      'manufacturing-group': 'All Entities',
      wtc: 'WTC',
      bbconstruction: 'BBConstruction',
      lionstransport: 'Lions Transport'
    };
    var coKey = String(st.company || 'manufacturing-group');
    var coLbl = compLabels[coKey] || (coKey === 'manufacturing-group' ? 'All Entities' : coKey.toUpperCase());
    var per = String(st.period || 'all');
    var perLbl = 'All-Time';
    if (per === 'custom' && st.dateFrom && st.dateTo) {
      perLbl = `${fmtDateDisplay(st.dateFrom)} - ${fmtDateDisplay(st.dateTo)}`;
    } else if (per && per !== 'all') {
      perLbl = per;
    }
    var basis = String(st.basis || st.dateBasis || 'rep');
    var basisLbl = basis === 'tx' ? 'Tx Date' : 'Rep Date';
    var offLbl = Boolean(st.officialBookScope) ? ' · Official Books' : '';
    return {
      companyKey: coKey,
      companyLabel: coLbl,
      period: per,
      periodLabel: perLbl,
      basis: basis,
      basisLabel: basisLbl,
      official: Boolean(st.officialBookScope),
      summary: `${coLbl} · ${perLbl} · ${basisLbl}${offLbl}`
    };
  }

  function computeLiveDataset() {
    var seed = window.MFG_SEED || window.SEED || {};
    var ent = window.MFG_ENTERPRISE;
    var st = (ent && ent.state) || window.STATE || {};
    var perm = getSeatPermissions();
    var allowed = (ent && typeof ent.allowedCompanyNames === 'function') ? ent.allowedCompanyNames() : null;
    var allowedKey = Array.isArray(allowed) ? allowed.join(',') : '*';
    var seedRev = (seed && (seed._customRev || (seed.meta && seed.meta.rev))) || 0;
    var otSnapSig = (ent && typeof ent.getOtSnapAllocSig === 'function') ? ent.getOtSnapAllocSig() : '';
    var nbSig = (window.MFG_NAMEBOOK && window.MFG_NAMEBOOK.rev) ? window.MFG_NAMEBOOK.rev : 0;
    var cacheKey = [
      st.company || '', st.period || '', st.dateGrain || '', st.dateFrom || '', st.dateTo || '',
      st.basis || st.dateBasis || 'rep', st.officialBookScope || '', st._officialScopeActive ? '1' : '0',
      st.activeUserId || st.userId || '', st.activeUserIdx != null ? st.activeUserIdx : '',
      perm.canPay ? '1' : '0', perm.canExp ? '1' : '0', perm.canProfit ? '1' : '0', perm.canBooks ? '1' : '0',
      allowedKey, seedRev, st._indCustomRev || 0, otSnapSig, nbSig
    ].join('|');

    if (LIVE_CACHE && LIVE_CACHE_KEY === cacheKey) return LIVE_CACHE;

    var sales = scopedTableRows('sales_tickets', false);
    var raw = scopedTableRows('raw_purchases', false);
    if (!raw.length) raw = scopedTableRows('raw_materials', false);
    var diesel = scopedTableRows('fuel_intakes', false);
    if (!diesel.length) diesel = scopedTableRows('diesel_logs', false);
    var oils = scopedTableRows('equipment_oil_logs', false);
    var maint = scopedTableRows('equipment_repairs', false);
    var exp = scopedTableRows('expenses', false);
    var ot = scopedTableRows('overtime', false);
    var coEquip = scopedTableRows('company_equipment', true);
    var equipMaster = scopedTableRows('equipment', true);

    var trucks = {};
    var monthsMap = {};
    var ownEquipSet = {};

    coEquip.forEach(function (ce) {
      if (!ce || ce.end_date) return;
      if (/^own/i.test(String(ce.ownership || '')) && /active/i.test(String(ce.status || 'Active'))) {
        var c = normTruckCode(ce.equipment || '');
        if (c) ownEquipSet[c] = true;
      }
    });
    equipMaster.forEach(function (eq) {
      if (!eq) return;
      if (/^own/i.test(String(eq.ownership || '')) && /truck/i.test(String(eq.type || ''))) {
        var c = normTruckCode(eq.name || eq.equipment || '');
        if (c) ownEquipSet[c] = true;
      }
    });

    function ensureTruck(code) {
      var c = normTruckCode(code);
      if (!c) return null;
      if (!trucks[c]) {
        var m = getTruckMeta(c);
        trucks[c] = {
          code: c, displayCode: m.displayCode, plate: m.plate,
          owner: ownEquipSet[c] ? (m.owner === 'Partner Truck' ? 'Partner Truck' : 'Company Fleet') : m.owner,
          driver: m.driver, driverShort: m.driverShort,
          colorVar: m.colorVar,
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
          driverOtSnapMin: 0, driverOtSnapUsd: null,
          driverTripsMap: {}, monthsMap: {}
        };
      }
      return trucks[c];
    }

    function ensureMonth(ym) {
      var k = ym || 'Unspecified';
      if (!monthsMap[k]) {
        monthsMap[k] = { ym: k, trips: 0, qtyM3: 0, recordedRev: 0, strictCredit: 0, fullCredit: 0, dieselCost: 0, maintCost: 0, otPay: 0, basePay: 0, hasActivity: false };
      }
      return monthsMap[k];
    }

    function ensureTruckMonth(tObj, ym) {
      var k = ym || 'Unspecified';
      if (!tObj.monthsMap[k]) {
        tObj.monthsMap[k] = { ym: k, trips: 0, qtyM3: 0, recordedRev: 0, strictCredit: 0, fullCredit: 0, dieselCost: 0, maintCost: 0, otPay: 0, basePay: 0, hasActivity: false };
      }
      return tObj.monthsMap[k];
    }

    var routeAgg = {};
    var zeroRows = [];
    var costRows = [];
    var overtimeRows = [];
    var driverBaseRows = [];
    var driverMap = {};

    function recordTripOvertime(row, tableKey, streamLabel, tObj, dt, comp, drv, qty) {
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
        id: row.id || row.ticket_no || '',
        table: tableKey,
        date: dt,
        company: comp,
        driver: dKey,
        truck: tObj.code,
        hours: otHrs,
        rate: 6.5,
        pay: otAmt,
        notes: `${streamLabel} #${String(row.ticket_no || row.name || '—')} (${fmtNum(qty, 1)} m³)`
      });
    }

    for (var i = 0; i < sales.length; i++) {
      var s = sales[i];
      if (!s || s.voided) continue;
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
      recordTripOvertime(s, 'sales_tickets', 'Sales Delivery', t, dtStr, comp, drv, qty);

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
          strictCredit: shadow, fullCredit: bench,
          shadow_credit: shadow, benchmark_credit: bench
        });
      }

      var mObj = ensureMonth(ym);
      mObj.trips += 1; mObj.qtyM3 += qty; mObj.recordedRev += deliv; mObj.hasActivity = true;
      mObj.strictCredit += strictAdd; mObj.fullCredit += fullAdd;
      var tmObj = ensureTruckMonth(t, ym);
      tmObj.trips += 1; tmObj.qtyM3 += qty; tmObj.recordedRev += deliv; tmObj.hasActivity = true;
      tmObj.strictCredit += strictAdd; tmObj.fullCredit += fullAdd;

      var rKey = [comp, 'Sales Delivery', t.code, s.customer || '—', siteStr, s.product || '—'].join('||');
      if (!routeAgg[rKey]) {
        routeAgg[rKey] = {
          key: rKey, company: comp, stream: 'Sales Delivery', truck: t.code,
          counterparty: String(s.customer || '—'), site: siteStr,
          material: String(s.product || '—'), trips: 0, paidTrips: 0, zeroTrips: 0,
          qtyM3: 0, rev: 0, strictCredit: 0, fullCredit: 0, shadowCredit: 0
        };
      }
      var ra = routeAgg[rKey];
      ra.trips += 1; ra.qtyM3 += qty; ra.rev += deliv;
      if (Math.abs(deliv) > 0.001) ra.paidTrips += 1;
      else { ra.zeroTrips += 1; ra.strictCredit += strictAdd; ra.fullCredit += fullAdd; ra.shadowCredit += strictAdd; }
    }

    for (var j = 0; j < raw.length; j++) {
      var r = raw[j];
      if (!r || r.voided) continue;
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
      var rParty = String(r.site_owner || r.supplier || 'Material Source');
      var rSite = String(r.site || r.work_site || 'Plant');
      var rMat = String(r.product || r.material || 'Aggregate');

      rt.rawTrips += 1;
      rt.rawQtyM3 += rQty;
      rt.rawRev += rDeliv;
      if (rComp.toLowerCase().indexOf('bbc') >= 0) rt.rawBbcTrips += 1;
      else rt.rawWtcTrips += 1;
      if (rDrv) rt.driverTripsMap[rDrv] = (rt.driverTripsMap[rDrv] || 0) + 1;
      recordTripOvertime(r, 'raw_purchases', 'Raw Material Inbound', rt, rDtStr, rComp, rDrv, rQty);

      var rStrictAdd = 0;
      var rFullAdd = 0;
      if (Math.abs(rDeliv) > 0.001) {
        rt.rawPaidTrips += 1;
        rt.rawPaidQtyM3 += rQty;
      } else {
        rt.rawZeroTrips += 1;
        rt.rawZeroQtyM3 += rQty;
        var isInternalQuarry = /al\s*jawad|wtc/i.test(`${rSite} ${rParty}`);
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
          classification: isInternalQuarry ? 'Internal Quarry / Plant Transfer ($0 Strict / $60 Bench)' : 'Missing External Raw Transport Rate ($60/trip)',
          strictCredit: rStrictAdd, fullCredit: rFullAdd,
          shadow_credit: rStrictAdd, benchmark_credit: rFullAdd
        });
      }

      var rmObj = ensureMonth(rYm);
      rmObj.trips += 1; rmObj.qtyM3 += rQty; rmObj.recordedRev += rDeliv; rmObj.hasActivity = true;
      rmObj.strictCredit += rStrictAdd; rmObj.fullCredit += rFullAdd;
      var rtmObj = ensureTruckMonth(rt, rYm);
      rtmObj.trips += 1; rtmObj.qtyM3 += rQty; rtmObj.recordedRev += rDeliv; rtmObj.hasActivity = true;
      rtmObj.strictCredit += rStrictAdd; rtmObj.fullCredit += rFullAdd;

      var rrKey = [rComp, 'Raw Material Inbound', rt.code, rParty, rSite, rMat].join('||');
      if (!routeAgg[rrKey]) {
        routeAgg[rrKey] = {
          key: rrKey, company: rComp, stream: 'Raw Material Inbound', truck: rt.code,
          counterparty: rParty, site: rSite,
          material: rMat, trips: 0, paidTrips: 0, zeroTrips: 0,
          qtyM3: 0, rev: 0, strictCredit: 0, fullCredit: 0, shadowCredit: 0
        };
      }
      var rra = routeAgg[rrKey];
      rra.trips += 1; rra.qtyM3 += rQty; rra.rev += rDeliv;
      if (Math.abs(rDeliv) > 0.001) rra.paidTrips += 1;
      else { rra.zeroTrips += 1; rra.strictCredit += rStrictAdd; rra.fullCredit += rFullAdd; rra.shadowCredit += rStrictAdd; }
    }

    var seenDieselKeys = {};
    var latestDieselPriceObj = (ent && typeof ent.getLatestDieselPrice === 'function') ? ent.getLatestDieselPrice(st.company || 'WTC') : null;
    var activeDieselCount = 0;
    for (var k = 0; k < diesel.length; k++) {
      var dl = diesel[k];
      if (!dl || dl.voided) continue;
      if (String(dl.direction || '').toLowerCase() === 'in') continue;
      activeDieselCount += 1;
      var dCode = normTruckCode(dl.equipment || dl.truck);
      if (!dCode) continue;
      if (!/diesel|mazout/i.test(String(dl.item || dl.fuel_type || 'Diesel'))) continue;
      var ltrs = Math.abs(Number(dl.litres != null ? dl.litres : (dl.liters || 0)));
      if (ltrs <= 0) continue;
      var dDt = recDate(dl, st);
      var tno = String(dl.ticket_no || '');
      var dedupKey = `${dCode}|${dDt}|${tno}|${Math.round(ltrs)}`;
      if (tno && seenDieselKeys[dedupKey]) continue;
      if (tno) seenDieselKeys[dedupKey] = true;

      var dt = ensureTruck(dCode);
      var explicitFuelUsd = Math.abs(Number(dl.total_usd || dl.cost_usd || dl.total_cost_usd || 0));
      var unitFuelPrice = 0;
      var dCost = 0;
      if (explicitFuelUsd > 0) {
        dCost = explicitFuelUsd;
        unitFuelPrice = ltrs > 0 ? (explicitFuelUsd / ltrs) : 0;
      } else {
        var priceOnDate = (ent && typeof ent.getDieselPriceOn === 'function')
          ? ent.getDieselPriceOn(dl.company || 'WTC', dDt)
          : latestDieselPriceObj;
        unitFuelPrice = priceOnDate && Number(priceOnDate.usdPerL || 0) > 0
          ? Number(priceOnDate.usdPerL)
          : (latestDieselPriceObj && Number(latestDieselPriceObj.usdPerL || 0) > 0 ? Number(latestDieselPriceObj.usdPerL) : 0);
        dCost = unitFuelPrice > 0 ? (ltrs * unitFuelPrice) : 0;
      }

      dt.dieselEvents += 1;
      dt.dieselLiters += ltrs;
      dt.dieselCost += dCost;
      var dYm = dDt.slice(0, 7);
      var dmObj = ensureMonth(dYm);
      dmObj.dieselCost += dCost;
      dmObj.hasActivity = true;
      var dtmObj = ensureTruckMonth(dt, dYm);
      dtmObj.dieselCost += dCost;
      dtmObj.hasActivity = true;

      costRows.push({
        id: dl.id || '',
        table: 'fuel_intakes',
        date: dDt,
        company: String(dl.company || 'WTC'),
        truck: dt.code,
        category: 'Diesel Fuel',
        subcategory: `${fmtNum(ltrs, 0)} L${unitFuelPrice > 0 ? ` @ ${fmtMoney(unitFuelPrice, 2)}/L` : ''}`,
        bucket: 'Diesel Fuel',
        supplier: String(dl.station || dl.source || dl.tank || 'Plant Diesel Tank'),
        bill_number: tno || String(dl.name || '—'),
        notes: dl.driver ? `Driver: ${dl.driver}` : String(dl.notes || 'Metered tank dispensing (Out)'),
        litres: ltrs,
        total_usd: dCost
      });
    }

    var capexExcludedTotal = 0;
    var capexExcludedCount = 0;

    for (var oi = 0; oi < oils.length; oi++) {
      var ol = oils[oi];
      if (!ol || ol.voided) continue;
      var oCode = normTruckCode(ol.equipment || ol.truck);
      if (!oCode) continue;
      var otT = ensureTruck(oCode);
      var oQty = Number(ol.qty) || 0;
      var oCost = Math.abs(Number(ol.cost_usd || ol.total_usd) || (oQty * 3.5));
      if (oCost <= 0) continue;
      var oDt = recDate(ol, st);
      otT.lubes += oCost;
      otT.expCount += 1;
      var oYm = oDt.slice(0, 7);
      var omObj = ensureMonth(oYm);
      omObj.maintCost += oCost;
      omObj.hasActivity = true;
      var otmObj = ensureTruckMonth(otT, oYm);
      otmObj.maintCost += oCost;
      otmObj.hasActivity = true;
      costRows.push({
        id: ol.id || '', table: 'equipment_oil_logs', date: oDt,
        company: String(ol.company || 'WTC'), truck: otT.code,
        category: 'Oils & Lubricants', subcategory: String(ol.oil_type || 'Lubricant'),
        bucket: 'Lubes & Insurance', subTag: 'Oils & Lubricants',
        supplier: String(ol.source || 'Plant Lube Bay'),
        bill_number: String(ol.name || '—'), notes: String(ol.notes || ol.service_action || '—'),
        total_usd: oCost
      });
    }

    for (var mi = 0; mi < maint.length; mi++) {
      var mr = maint[mi];
      if (!mr || mr.voided) continue;
      var mCode = normTruckCode(mr.equipment || mr.truck);
      if (!mCode) continue;
      var mt = ensureTruck(mCode);
      var mCost = Math.abs(Number(mr.total_cost_usd || mr.cost_usd) || 0);
      if (mCost <= 0) continue;
      var mDt = recDate(mr, st);
      mt.repairs += mCost;
      mt.expCount += 1;
      var mYm = mDt.slice(0, 7);
      var mmObj = ensureMonth(mYm);
      mmObj.maintCost += mCost;
      mmObj.hasActivity = true;
      var mtmObj = ensureTruckMonth(mt, mYm);
      mtmObj.maintCost += mCost;
      mtmObj.hasActivity = true;
      costRows.push({
        id: mr.id || '', table: 'equipment_repairs', date: mDt,
        company: String(mr.company || 'WTC'), truck: mt.code,
        category: 'Repairs & Parts', subcategory: String(mr.subsystem || 'Workshop'),
        bucket: 'Repairs & Parts', supplier: String(mr.supplier || mr.repair_source || 'Workshop'),
        bill_number: String(mr.name || '—'), notes: String(mr.items_summary || mr.notes || '—'),
        total_usd: mCost
      });
    }

    for (var m = 0; m < exp.length; m++) {
      var ex = exp[m];
      if (!ex || ex.voided) continue;
      var eCode = matchExpTruck(ex);
      if (!eCode) continue;
      var cat = String(ex.category || '');
      var sub = String(ex.subcategory || '');
      if (/diesel|mazout/i.test(`${cat} ${sub}`)) continue;
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
      var subTag = 'Repairs & Parts';
      var bucket = 'Repairs & Parts';
      if (cat.indexOf('Insurance') >= 0 || sub.indexOf('Insurance') >= 0 || sub.indexOf('Mecanique') >= 0) {
        et.insurance += amt;
        subTag = 'Insurance & Permits';
        bucket = 'Lubes & Insurance';
      } else if (cat.indexOf('Lubricants') >= 0 || sub.indexOf('Oil') >= 0 || sub.indexOf('Lubricant') >= 0) {
        et.lubes += amt;
        subTag = 'Oils & Lubricants';
        bucket = 'Lubes & Insurance';
      } else {
        et.repairs += amt;
      }

      var eDt = recDate(ex, st);
      var eYm = eDt.slice(0, 7);
      var emObj = ensureMonth(eYm);
      emObj.maintCost += amt;
      emObj.hasActivity = true;
      var etmObj = ensureTruckMonth(et, eYm);
      etmObj.maintCost += amt;
      etmObj.hasActivity = true;

      costRows.push({
        id: ex.id || '', table: 'expenses',
        date: eDt,
        company: String(ex.company || 'WTC'),
        truck: et.code, category: cat || 'Maintenance & Repairs',
        subcategory: sub || subTag, bucket: bucket, subTag: subTag,
        supplier: String(ex.supplier || 'Vendor'),
        bill_number: String(ex.reference || ex.bill_number || ex.name || '—'),
        notes: String(ex.item_summary || ex.notes || '—'),
        total_usd: amt
      });
    }

    for (var n = 0; n < ot.length; n++) {
      var o = ot[n];
      if (!o) continue;
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
        var otxObj = ensureMonth(oYm);
        otxObj.otPay += pay;
        otxObj.hasActivity = true;
        var otmRow = ensureTruckMonth(otT, oYm);
        otmRow.otPay += pay;
        otmRow.hasActivity = true;
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

    var otSnapAlloc = (ent && typeof ent.computeJobOtSnapAllocation === 'function')
      ? ent.computeJobOtSnapAllocation({
        industry: 'Manufacturing',
        company: st.company || 'ALL',
        period: st.period || 'all',
        dateFrom: st.dateFrom || '',
        dateTo: st.dateTo || ''
      })
      : null;
    if (otSnapAlloc && Array.isArray(otSnapAlloc.jobs)) {
      otSnapAlloc.jobs.forEach(function (j) {
        var jCode = normTruckCode(j && j.truck);
        var jTruck = jCode ? trucks[jCode] : null;
        if (!jTruck) return;
        jTruck.driverOtSnapMin = Math.round(((jTruck.driverOtSnapMin || 0) + Number(j.snapDeltaMin || 0)) * 10) / 10;
        if (perm.canPay && otSnapAlloc.authorizedDollar && j.allocatedUsd != null) {
          jTruck.driverOtSnapUsd = Math.round((((jTruck.driverOtSnapUsd || 0) + Number(j.allocatedUsd || 0)) + Number.EPSILON) * 100) / 100;
        }
      });
    }

    var pr = (ent && typeof ent.periodRange === 'function') ? ent.periodRange(st.period || 'all') : null;
    var hasSubPeriodClip = Boolean(st.period && st.period !== 'all' && pr && pr.from && pr.to && (pr.from > '1900-01-01' || pr.to < '2099-12-31'));

    function monthOverlapInfo(ymKey) {
      if (!ymKey || ymKey === 'Unspecified' || !/^\d{4}-\d{2}$/.test(ymKey)) {
        return { factor: 1, dateIso: hasSubPeriodClip ? pr.to : '' };
      }
      var y = Number(ymKey.slice(0, 4));
      var mo = Number(ymKey.slice(5, 7));
      var daysInMo = new Date(y, mo, 0).getDate();
      var moStart = `${ymKey}-01`;
      var moEnd = `${ymKey}-${String(daysInMo).padStart(2, '0')}`;
      if (!hasSubPeriodClip) return { factor: 1, dateIso: moEnd };
      var ovFrom = pr.from > moStart ? pr.from : moStart;
      var ovTo = pr.to < moEnd ? pr.to : moEnd;
      if (ovFrom > ovTo) return { factor: 0, dateIso: ovTo };
      var t1 = Date.UTC(Number(ovFrom.slice(0, 4)), Number(ovFrom.slice(5, 7)) - 1, Number(ovFrom.slice(8, 10)));
      var t2 = Date.UTC(Number(ovTo.slice(0, 4)), Number(ovTo.slice(5, 7)) - 1, Number(ovTo.slice(8, 10)));
      var daysOv = Math.max(0, Math.round((t2 - t1) / 86400000) + 1);
      return { factor: Math.min(1, daysOv / Math.max(1, daysInMo)), dateIso: ovTo };
    }

    var allTruckList = [];
    Object.keys(trucks).forEach(function (c) {
      var t = trucks[c];
      t.totalTrips = t.salesTrips + t.rawTrips;
      t.totalPaidTrips = t.salesPaidTrips + t.rawPaidTrips;
      t.totalZeroTrips = t.salesZeroTrips + t.rawZeroTrips;
      t.totalQtyM3 = t.salesQtyM3 + t.rawQtyM3;

      var drvKeys = Object.keys(t.driverTripsMap);
      if (drvKeys.length) {
        drvKeys.sort(function (a, b) { return t.driverTripsMap[b] - t.driverTripsMap[a]; });
        t.driver = drvKeys.slice(0, 3).map(function (d) { return `${d} (${t.driverTripsMap[d]})`; }).join(' · ');
        t.driverShort = drvKeys[0];
      }

      if (CORE_PARTNER_CODES.indexOf(c) >= 0 && t.totalTrips > 0) {
        var tActiveMonthKeys = Object.keys(t.monthsMap).filter(function (mk) {
          return mk && mk !== 'Unspecified' && t.monthsMap[mk].trips > 0;
        }).sort();
        var baseMonths = tActiveMonthKeys.length > 12
          ? tActiveMonthKeys.slice(tActiveMonthKeys.length - 12)
          : tActiveMonthKeys.slice();
        var baseCo = (t.salesBbcTrips + t.rawBbcTrips) > (t.salesWtcTrips + t.rawWtcTrips) ? 'BBConstruction' : 'WTC';
        baseMonths.forEach(function (mk) {
          var ov = monthOverlapInfo(mk);
          var moPay = Math.round(((800 * ov.factor) + Number.EPSILON) * 100) / 100;
          if (moPay <= 0) return;
          t.driverBasePay = Math.round(((t.driverBasePay + moPay) + Number.EPSILON) * 100) / 100;
          var mBaseObj = ensureMonth(mk);
          mBaseObj.basePay = Math.round(((mBaseObj.basePay + moPay) + Number.EPSILON) * 100) / 100;
          mBaseObj.hasActivity = true;
          var tmBaseObj = ensureTruckMonth(t, mk);
          tmBaseObj.basePay = Math.round(((tmBaseObj.basePay + moPay) + Number.EPSILON) * 100) / 100;
          tmBaseObj.hasActivity = true;
          driverBaseRows.push({
            id: '',
            table: 'payroll',
            date: ov.dateIso || (mk !== 'Unspecified' ? `${mk}-01` : ''),
            company: baseCo,
            truck: t.code,
            category: 'Driver & OT',
            subcategory: 'Monthly Base Salary',
            subTag: 'Base Pay',
            bucket: 'Driver & OT',
            supplier: t.driverShort && t.driverShort !== 'Driver' ? t.driverShort : 'Assigned Driver',
            bill_number: mk,
            notes: 'Base Pay',
            hours: 0,
            total_usd: moPay,
            isOtRow: true,
            isBasePay: true
          });
        });
      }
      t.driverTotalPay = Math.round(((t.driverBasePay + t.driverOtPay) + Number.EPSILON) * 100) / 100;

      if (t.totalTrips > 0 || t.dieselCost > 0 || t.repairs > 0 || t.lubes > 0 || t.insurance > 0 || t.driverOtPay > 0) {
        allTruckList.push(t);
      }
    });

    allTruckList.sort(function (a, b) {
      return (b.totalTrips - a.totalTrips) || ((b.salesRev + b.rawRev) - (a.salesRev + a.rawRev));
    });

    var ownPartnerSet = {};
    var ownPartnerList = [];
    allTruckList.forEach(function (t) {
      var isCore = CORE_PARTNER_CODES.indexOf(t.code) >= 0 || CORE_OWN_CODES.indexOf(t.code) >= 0;
      if (isCore || (ownEquipSet[t.code] && t.totalTrips > 0)) {
        if (!ownPartnerSet[t.code]) {
          ownPartnerSet[t.code] = true;
          ownPartnerList.push(t.code);
        }
      }
    });
    if (!ownPartnerList.length) ownPartnerList = allTruckList.slice(0, 7).map(function (t) { return t.code; });
    if (ownPartnerList.length > 10) ownPartnerList = ownPartnerList.slice(0, 10);

    BASE_COHORTS.forEach(function (ch) {
      if (ch.id === 'own_partner') ch.trucks = ownPartnerList.slice();
      else if (ch.id === 'top5') ch.trucks = allTruckList.slice(0, 5).map(function (t) { return t.code; });
    });

    var routesList = Object.keys(routeAgg).map(function (rk) {
      var r = routeAgg[rk];
      r.avgRateM3 = r.qtyM3 > 0 ? (r.rev / r.qtyM3) : 0;
      r.adjRev = r.rev + r.strictCredit;
      return r;
    });

    costRows.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    zeroRows.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    overtimeRows.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    driverBaseRows.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });

    var monthsList = Object.keys(monthsMap)
      .filter(function (mk) { return mk && mk !== 'Unspecified'; })
      .sort()
      .map(function (mk) { return monthsMap[mk]; });

    var salesZeroCnt = zeroRows.filter(function (z) { return z.stream === 'Sales Delivery'; }).length;
    var rawZeroCnt = zeroRows.filter(function (z) { return z.stream === 'Raw Material Inbound'; }).length;

    var rulesList = [
      {
        id: 'capex_guard',
        badge: 'CapEx Protected',
        tone: 'good',
        title: 'Capital Expenditures Excluded from Operating P&L',
        summaryPrefix: capexExcludedCount > 0 ? `${fmtInt(capexExcludedCount)} CapEx bill(s)` : '',
        summaryAmt: capexExcludedCount > 0 ? fmtMoney(capexExcludedTotal) : '',
        summaryText: capexExcludedCount > 0
          ? 'CapEx asset bills are isolated from operating repairs so unit hauling margins stay accurate.'
          : 'Zero Capital Expenditure bills mixed into operating repairs in the active period.',
        impactCount: fmtMoney(capexExcludedTotal),
        impactLabel: 'isolated to Fixed Assets',
        targetTab: 'expenses',
        targetCat: 'ALL'
      },
      {
        id: 'unbundled_sales',
        badge: 'Sales Unbundled',
        tone: 'warn',
        title: 'Delivered Concrete Tickets (>=$55/m³) with $0.00 Separate Delivery',
        summaryPrefix: '',
        summaryAmt: '',
        summaryText: 'All-in C&D concrete sales show $0.00 in the delivery column. + Unbundled Delivery credits $4.00/m³ ($75 if 0 qty); Full Commercial Value credits $5.00/m³ ($75 min).',
        impactCount: fmtInt(salesZeroCnt),
        impactLabel: 'unbundled sales tickets in scope',
        targetTab: 'zero',
        targetCat: ''
      },
      {
        id: 'internal_raw_haul',
        badge: 'Raw Inbound',
        tone: 'warn',
        title: 'Inbound Quarry & Inter-Plant Raw Material Hauls at $0.00 Freight',
        summaryPrefix: '',
        summaryAmt: '',
        summaryText: '+ Unbundled Delivery credits $60/trip on external source trips lacking a separate transport rate and keeps $0/trip on internal quarry/plant transfers; Full Commercial Value prices all at $60/trip.',
        impactCount: fmtInt(rawZeroCnt),
        impactLabel: 'zero-freight raw trips in scope',
        targetTab: 'zero',
        targetCat: ''
      },
      {
        id: 'diesel_source',
        badge: 'Single-Source Fuel',
        tone: 'good',
        title: 'Metered Tank Dispensing (Out) at Historical Tank Unit Price',
        summaryPrefix: '',
        summaryAmt: '',
        summaryText: 'Truck fuel burn reads strictly from metered Fuel Intake (Out) logs valued by date-matched bulk diesel purchases, preventing double-counting against supplier bulk invoices.',
        impactCount: fmtInt(activeDieselCount),
        impactLabel: 'metered dispensing events',
        targetTab: 'expenses',
        targetCat: 'Diesel Fuel'
      }
    ];

    LIVE_CACHE = {
      trucks: trucks,
      allTruckList: allTruckList,
      routes: routesList,
      zeroRows: zeroRows,
      costRows: costRows,
      overtimeRows: overtimeRows,
      driverBaseRows: driverBaseRows,
      otSnapAlloc: otSnapAlloc,
      driverList: Object.keys(driverMap).map(function (dk) { return driverMap[dk]; }).sort(function (a, b) { return b.hours - a.hours; }),
      months: monthsList,
      rulesList: rulesList,
      dieselCount: activeDieselCount
    };
    LIVE_CACHE_KEY = cacheKey;
    return LIVE_CACHE;
  }

  function getActiveDataset() {
    return computeLiveDataset();
  }

  function getCohortById(id) {
    var mappedId = id === 'bdeir3' ? 'partner3' : id;
    var cohorts = getCohorts();
    for (var i = 0; i < cohorts.length; i++) {
      if (cohorts[i].id === mappedId) return cohorts[i];
    }
    return cohorts[0];
  }

  function selectedTruckCodes() {
    var ds = getActiveDataset();
    var ch = getCohortById(STATE.cohort);
    var baseList = (STATE.cohort === 'custom' && STATE.selectedTrucks && STATE.selectedTrucks.length)
      ? STATE.selectedTrucks.slice()
      : (ch && ch.trucks && ch.trucks.length ? ch.trucks.slice() : ds.allTruckList.slice(0, 7).map(function (t) { return t.code; }));

    var valid = baseList.filter(function (c, idx) { return Boolean(ds.trucks[c]) && baseList.indexOf(c) === idx; });
    if (STATE.focusedTruck && STATE.focusedTruck !== 'ALL' && ds.trucks[STATE.focusedTruck] && valid.indexOf(STATE.focusedTruck) < 0) {
      valid.unshift(STATE.focusedTruck);
    }
    if (!valid.length) valid = ds.allTruckList.slice(0, 5).map(function (t) { return t.code; });
    valid.sort(function (a, b) {
      var ta = ds.trucks[a];
      var tb = ds.trucks[b];
      return ((tb ? tb.totalTrips : 0) - (ta ? ta.totalTrips : 0));
    });
    return valid;
  }

  function activeTruckCodes() {
    var sel = selectedTruckCodes();
    if (STATE.focusedTruck && STATE.focusedTruck !== 'ALL' && sel.indexOf(STATE.focusedTruck) >= 0) {
      return [STATE.focusedTruck];
    }
    return sel;
  }

  function getEquipmentSyncFilter() {
    syncCompanyFilterIfChanged();
    var foc = (STATE.focusedTruck && STATE.focusedTruck !== 'ALL') ? STATE.focusedTruck : '';
    var ch = getCohortById(STATE.cohort);
    return {
      focusTruck: foc,
      trucks: activeTruckCodes(),
      cohortId: STATE.cohort,
      cohortLabel: ch ? ch.label : ''
    };
  }

  function searchTruckCatalog(query) {
    syncCompanyFilterIfChanged();
    var ds = getActiveDataset();
    var safeDs = redactDatasetForPerm(ds, getSeatPermissions());
    var all = safeDs.allTruckList || [];
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
      if (codeL === q || plateL === q) exact.push(t);
      else if (codeL.indexOf(q) >= 0 || plateL.indexOf(q) >= 0 || ownerL.indexOf(q) >= 0 || drvL.indexOf(q) >= 0) freqOrdered.push(t);
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
      code: t.code, displayCode: t.displayCode, plate: t.plate,
      owner: t.owner, driver: t.driver, driverShort: t.driverShort,
      colorVar: t.colorVar || 'var(--chart-navy)',
      salesTrips: t.salesTrips, salesPaidTrips: t.salesPaidTrips, salesZeroTrips: t.salesZeroTrips,
      salesWtcTrips: t.salesWtcTrips, salesBbcTrips: t.salesBbcTrips,
      salesQtyM3: t.salesQtyM3, salesRev: t.salesRev,
      rawTrips: t.rawTrips, rawPaidTrips: t.rawPaidTrips, rawZeroTrips: t.rawZeroTrips,
      rawWtcTrips: t.rawWtcTrips, rawBbcTrips: t.rawBbcTrips,
      rawQtyM3: t.rawQtyM3, rawRev: t.rawRev,
      totalTrips: trips, totalPaidTrips: t.totalPaidTrips, totalZeroTrips: t.totalZeroTrips,
      wtcTrips: t.salesWtcTrips + t.rawWtcTrips, bbcTrips: t.salesBbcTrips + t.rawBbcTrips,
      totalQtyM3: qtyM3, recordedRev: recordedRev, creditRev: creditRev, totalRev: totalRev,
      dieselEvents: t.dieselEvents, dieselLiters: t.dieselLiters, dieselCost: dieselCost,
      repairs: Number(t.repairs || 0), lubes: Number(t.lubes || 0),
      insurance: Number(t.insurance || 0), maintCost: maintCost, expCount: t.expCount,
      capex: Number(t.capex || 0),
      driverBasePay: t.driverBasePay, driverOtHours: t.driverOtHours, driverOtPay: t.driverOtPay, driverCost: driverCost,
      driverOtSnapMin: Number(t.driverOtSnapMin || 0),
      driverOtSnapUsd: t.driverOtSnapUsd != null ? Number(t.driverOtSnapUsd) : null,
      totalCost: totalCost, netProfit: netProfit, marginPct: marginPct,
      revPerTrip: trips > 0 ? (totalRev / trips) : 0,
      costPerTrip: trips > 0 ? (totalCost / trips) : 0,
      netPerTrip: trips > 0 ? (netProfit / trips) : 0,
      costPerM3: qtyM3 > 0 ? (totalCost / qtyM3) : 0,
      revPerM3: qtyM3 > 0 ? (totalRev / qtyM3) : 0,
      litersPerTrip: trips > 0 ? (t.dieselLiters / trips) : 0,
      litersPer100M3: qtyM3 > 0 ? ((t.dieselLiters / qtyM3) * 100) : 0
    };
  }

  function sumFleetMetrics(list, mode) {
    var tot = {
      truckCount: list.length,
      salesTrips: 0, salesPaidTrips: 0, salesZeroTrips: 0, salesQtyM3: 0, salesRev: 0,
      rawTrips: 0, rawPaidTrips: 0, rawZeroTrips: 0, rawQtyM3: 0, rawRev: 0,
      totalTrips: 0, totalPaidTrips: 0, totalZeroTrips: 0, totalQtyM3: 0,
      wtcTrips: 0, bbcTrips: 0, recordedRev: 0, creditRev: 0, totalRev: 0,
      dieselEvents: 0, dieselLiters: 0, dieselCost: 0,
      repairs: 0, lubes: 0, insurance: 0, maintCost: 0, expCount: 0, capex: 0,
      driverBasePay: 0, driverOtHours: 0, driverOtPay: 0, driverCost: 0,
      driverOtSnapMin: 0, driverOtSnapUsd: null,
      totalCost: 0, netProfit: 0
    };
    var hasSnapUsd = false;
    var snapUsdSum = 0;
    list.forEach(function (t) {
      var m = computeTruckMetrics(t, mode);
      tot.salesTrips += m.salesTrips; tot.salesPaidTrips += m.salesPaidTrips; tot.salesZeroTrips += m.salesZeroTrips;
      tot.salesQtyM3 += m.salesQtyM3; tot.salesRev += m.salesRev;
      tot.rawTrips += m.rawTrips; tot.rawPaidTrips += m.rawPaidTrips; tot.rawZeroTrips += m.rawZeroTrips;
      tot.rawQtyM3 += m.rawQtyM3; tot.rawRev += m.rawRev;
      tot.totalTrips += m.totalTrips; tot.totalPaidTrips += m.totalPaidTrips; tot.totalZeroTrips += m.totalZeroTrips;
      tot.totalQtyM3 += m.totalQtyM3; tot.wtcTrips += m.wtcTrips; tot.bbcTrips += m.bbcTrips;
      tot.recordedRev += m.recordedRev; tot.creditRev += m.creditRev; tot.totalRev += m.totalRev;
      tot.dieselEvents += m.dieselEvents; tot.dieselLiters += m.dieselLiters; tot.dieselCost += m.dieselCost;
      tot.repairs += m.repairs; tot.lubes += m.lubes; tot.insurance += m.insurance;
      tot.maintCost += m.maintCost; tot.expCount += m.expCount; tot.capex += m.capex;
      tot.driverBasePay += m.driverBasePay; tot.driverOtHours += m.driverOtHours;
      tot.driverOtPay += m.driverOtPay; tot.driverCost += m.driverCost;
      tot.driverOtSnapMin += m.driverOtSnapMin;
      if (m.driverOtSnapUsd != null) { hasSnapUsd = true; snapUsdSum += m.driverOtSnapUsd; }
      tot.totalCost += m.totalCost; tot.netProfit += m.netProfit;
    });
    tot.driverOtSnapUsd = hasSnapUsd ? Math.round((snapUsdSum + Number.EPSILON) * 100) / 100 : null;
    tot.marginPct = tot.totalRev > 0 ? ((tot.netProfit / tot.totalRev) * 100) : 0;
    tot.revPerTrip = tot.totalTrips > 0 ? (tot.totalRev / tot.totalTrips) : 0;
    tot.costPerTrip = tot.totalTrips > 0 ? (tot.totalCost / tot.totalTrips) : 0;
    tot.netPerTrip = tot.totalTrips > 0 ? (tot.netProfit / tot.totalTrips) : 0;
    tot.costPerM3 = tot.totalQtyM3 > 0 ? (tot.totalCost / tot.totalQtyM3) : 0;
    tot.revPerM3 = tot.totalQtyM3 > 0 ? (tot.totalRev / tot.totalQtyM3) : 0;
    return tot;
  }

  function redactMetricsForPerm(m, perm) {
    if (!m || !perm) return m;
    var allowRev = Boolean(perm.canBooks || perm.canProfit);
    var allowExp = Boolean(perm.canExp);
    var allowPay = Boolean(perm.canPay);
    var allowAllCost = Boolean(perm.canAllCost);
    var allowProfit = Boolean(perm.canProfit && perm.canAllCost);
    if (allowRev && allowExp && allowPay && allowAllCost && allowProfit) return m;
    var out = Object.assign({}, m);
    if (!allowRev) {
      out.salesRev = null;
      out.rawRev = null;
      out.recordedRev = null;
      out.creditRev = null;
      out.totalRev = null;
      out.revPerTrip = null;
      out.revPerM3 = null;
    }
    if (!allowExp) {
      out.dieselCost = null;
      out.repairs = null;
      out.lubes = null;
      out.insurance = null;
      out.maintCost = null;
      out.capex = null;
    }
    if (!allowPay) {
      out.driverBasePay = null;
      out.driverOtPay = null;
      out.driverCost = null;
      out.driverOtSnapUsd = null;
    }
    if (!allowAllCost) {
      out.totalCost = null;
      out.costPerTrip = null;
      out.costPerM3 = null;
    }
    if (!allowProfit) {
      out.netProfit = null;
      out.netPerTrip = null;
      out.marginPct = null;
    }
    return out;
  }

  function redactDatasetForPerm(ds, perm) {
    if (!ds || !perm) return ds;
    var allowRev = Boolean(perm.canBooks || perm.canProfit);
    var allowExp = Boolean(perm.canExp);
    var allowPay = Boolean(perm.canPay);
    var allowAllCost = Boolean(perm.canAllCost);
    if (allowRev && allowExp && allowPay && allowAllCost && perm.canProfit) return ds;

    var redactTruckObj = function (t) {
      if (!t) return t;
      var nt = Object.assign({}, t);
      if (!allowRev) {
        nt.salesRev = null; nt.rawRev = null;
        nt.salesUnbundledCredit = null; nt.salesBenchmarkCredit = null;
        nt.rawMissingRateCredit = null; nt.rawBenchmarkCredit = null;
      }
      if (!allowExp) {
        nt.dieselCost = null; nt.repairs = null; nt.lubes = null;
        nt.insurance = null; nt.capex = null;
      }
      if (!allowPay) {
        nt.driverBasePay = null; nt.driverOtPay = null;
        nt.driverTotalPay = null; nt.driverOtSnapUsd = null;
      }
      var mm = {};
      Object.keys(t.monthsMap || {}).forEach(function (mk) {
        var tm = Object.assign({}, t.monthsMap[mk]);
        if (!allowRev) { tm.recordedRev = null; tm.strictCredit = null; tm.fullCredit = null; }
        if (!allowExp) { tm.dieselCost = null; tm.maintCost = null; }
        if (!allowPay) { tm.otPay = null; tm.basePay = null; }
        mm[mk] = tm;
      });
      nt.monthsMap = mm;
      return nt;
    };

    var safeTrucks = {};
    Object.keys(ds.trucks || {}).forEach(function (k) {
      safeTrucks[k] = redactTruckObj(ds.trucks[k]);
    });
    var safeAllTruckList = (ds.allTruckList || []).map(function (t) { return safeTrucks[t.code] || redactTruckObj(t); });
    var safeRoutes = (ds.routes || []).map(function (r) {
      if (allowRev) return r;
      return Object.assign({}, r, { rev: null, strictCredit: null, fullCredit: null, shadowCredit: null, avgRateM3: null, adjRev: null });
    });
    var safeZeroRows = (ds.zeroRows || []).map(function (z) {
      if (allowRev) return z;
      return Object.assign({}, z, { unit_price: null, total_product: null, recorded_haul: null, strictCredit: null, fullCredit: null, shadow_credit: null, benchmark_credit: null });
    });
    var safeCostRows = (ds.costRows || []).map(function (c) {
      var allowRow = c.isOtRow ? allowPay : allowExp;
      if (allowRow) return c;
      var sc = String(c.subcategory || '');
      if (c.bucket === 'Diesel Fuel') sc = c.litres != null ? `${fmtNum(c.litres, 0)} L` : sc.replace(/\s*@.*$/, '');
      else if (c.isOtRow) sc = sc.replace(/\s*@.*$/, '');
      return Object.assign({}, c, { total_usd: null, subcategory: sc });
    });
    var safeOtRows = (ds.overtimeRows || []).map(function (o) {
      if (allowPay) return o;
      return Object.assign({}, o, { rate: null, pay: null });
    });
    var safeBaseRows = (ds.driverBaseRows || []).map(function (b) {
      if (allowPay) return b;
      return Object.assign({}, b, { total_usd: null });
    });
    var safeDrivers = (ds.driverList || []).map(function (d) {
      if (allowPay) return d;
      return Object.assign({}, d, { otPay: null, rate: null });
    });
    var safeMonths = (ds.months || []).map(function (m) {
      var nm = Object.assign({}, m);
      if (!allowRev) { nm.recordedRev = null; nm.strictCredit = null; nm.fullCredit = null; }
      if (!allowExp) { nm.dieselCost = null; nm.maintCost = null; }
      if (!allowPay) { nm.otPay = null; nm.basePay = null; }
      return nm;
    });
    var safeSnap = ds.otSnapAlloc ? Object.assign({}, ds.otSnapAlloc, !allowPay ? {
      authorizedDollar: false,
      snapPremiumUsd: null,
      jobs: Array.isArray(ds.otSnapAlloc.jobs)
        ? ds.otSnapAlloc.jobs.map(function (j) { return Object.assign({}, j, { allocatedUsd: null }); })
        : ds.otSnapAlloc.jobs
    } : {}) : null;
    var safeRules = (ds.rulesList || []).map(function (r) {
      if (r.id === 'capex_guard' && !allowExp) {
        return Object.assign({}, r, { summaryAmt: r.summaryAmt ? 'Restricted' : '', impactCount: 'Restricted' });
      }
      return r;
    });

    return {
      trucks: safeTrucks,
      allTruckList: safeAllTruckList,
      routes: safeRoutes,
      zeroRows: safeZeroRows,
      costRows: safeCostRows,
      overtimeRows: safeOtRows,
      driverBaseRows: safeBaseRows,
      otSnapAlloc: safeSnap,
      driverList: safeDrivers,
      months: safeMonths,
      rulesList: safeRules,
      dieselCount: ds.dieselCount
    };
  }

  function computeModel() {
    syncCompanyFilterIfChanged();
    var ds = getActiveDataset();
    var perm = getSeatPermissions();
    var selCodes = selectedTruckCodes();
    var cohortRows = selCodes.map(function (c) { return ds.trucks[c]; }).filter(Boolean).map(function (t) { return redactMetricsForPerm(computeTruckMetrics(t, STATE.mode), perm); });
    var actCodes = activeTruckCodes();
    var activeTruckList = actCodes.map(function (c) { return ds.trucks[c]; }).filter(Boolean);
    var activeMetrics = activeTruckList.map(function (t) { return redactMetricsForPerm(computeTruckMetrics(t, STATE.mode), perm); });
    var activeTotal = redactMetricsForPerm(sumFleetMetrics(activeTruckList, STATE.mode), perm);
    var fleetTotal = redactMetricsForPerm(sumFleetMetrics(ds.allTruckList, STATE.mode), perm);
    var safeDs = redactDatasetForPerm(ds, perm);
    return {
      mode: STATE.mode,
      dataset: safeDs,
      trucks: safeDs.trucks,
      cohortRows: cohortRows,
      truckRows: activeMetrics,
      totals: activeTotal,
      activeTrucks: actCodes.map(function (c) { return safeDs.trucks[c]; }).filter(Boolean),
      activeMetrics: activeMetrics,
      fleetTotal: fleetTotal,
      activeTotal: activeTotal,
      perm: perm,
      scope: getTopbarScopeSummary()
    };
  }

  function filterCostByCategory(cat, list) {
    if (!cat || cat === 'ALL') return list;
    return list.filter(function (e) { return e.bucket === cat; });
  }

  function sortIndicator(activeCol, activeDir, colKey) {
    if (activeCol !== colKey) return '<span class="sort-ind"></span>';
    return `<span class="sort-ind">${activeDir === 'asc' ? ' ▲' : ' ▼'}</span>`;
  }

  function renderHeader(model) {
    var ds = model.dataset;
    var actCodes = activeTruckCodes();
    var titleList = actCodes.length > 5
      ? `${actCodes.slice(0, 4).join(' · ')} +${actCodes.length - 4}`
      : actCodes.join(' · ');

    var modes = [
      { id: 'recorded', label: 'Booked Revenue', tip: 'Only delivery fees explicitly recorded on sales and raw tickets' },
      { id: 'strict', label: '+ Unbundled Delivery', tip: 'Booked + $4.00/m³ ($75 if 0 qty) on unpriced concrete sales + $60/trip external raw hauls ($0 internal)' },
      { id: 'full', label: 'Full Commercial Value', tip: 'Booked + $5.00/m³ ($75 min) sales + $60/trip across all inbound and internal raw hauls' }
    ];

    var rulesPopover = STATE.rulesOpen ? `
      <div class="fpnl-rules-popover" role="dialog" aria-label="Accounting Rules &amp; Safeguards">
        <div class="fpnl-rules-pop-head">
          <div><strong>Accounting Rules &amp; Safeguards</strong><div class="fpnl-sub-note"><span>Synced to active topbar filter</span> · ${esc(model.scope.summary)}</div></div>
          <button type="button" class="fpnl-icon-close" data-fpnl-rules-toggle="1" aria-label="Close">×</button>
        </div>
        <div class="fpnl-rules-list">
          ${ds.rulesList.map(function (r) {
            var amtBadge = r.summaryAmt === 'Restricted' ? '<span data-t="Restricted">Restricted</span>' : esc(r.summaryAmt);
            var impactHtml = r.impactCount === 'Restricted' ? '<span data-t="Restricted">Restricted</span>' : esc(r.impactCount);
            return `<div class="fpnl-rule-item">
              <div class="fpnl-rule-top">
                <span class="badge ${r.tone === 'good' ? 'badge-ok' : 'badge-warn'}">${esc(r.badge)}</span>
                <button type="button" class="fpnl-link-btn" data-fpnl-jump-rule="${esc(r.targetTab)}" data-fpnl-jump-cat="${esc(r.targetCat)}">Inspect</button>
              </div>
              <div class="fpnl-rule-title">${esc(r.title)}</div>
              <div class="fpnl-rule-desc">${r.summaryPrefix ? `<b>${esc(r.summaryPrefix)}</b> (${amtBadge}) · ` : ''}${esc(r.summaryText)}</div>
              <div class="fpnl-rule-impact"><b>${impactHtml}</b> <span>${esc(r.impactLabel)}</span></div>
            </div>`;
          }).join('')}
        </div>
      </div>` : '';

    return `
      <div class="fpnl-header">
        <div class="fpnl-header-main">
          <div class="fpnl-eyebrow"><span>LIVE FLEET UNIT ECONOMICS</span></div>
          <div class="fpnl-title-row">
            <h2 class="fpnl-title"><span>Truck Fleet Revenue &amp; Cost Studio</span> <span class="fpnl-title-units" data-no-i18n="1">(${esc(titleList)})</span></h2>
            <span class="fpnl-scope-pill">${esc(model.scope.summary)}</span>
          </div>
          <div class="fpnl-subtitle">Click any KPI, scorecard, driver link, or ledger ticket row to drill in. Syncs directly with equipment and assignment tables below.</div>
        </div>
        <div class="fpnl-header-controls">
          <div class="seg fpnl-mode-bar" role="group" aria-label="Valuation mode">
            ${modes.map(function (m) {
              var on = STATE.mode === m.id;
              return `<button type="button" class="seg-btn fpnl-mode-btn${on ? ' active' : ''}" data-fpnl-mode="${esc(m.id)}" data-ui-tip="${esc(m.tip)}">${esc(m.label)}</button>`;
            }).join('')}
          </div>
          <div class="fpnl-rules-wrap">
            <button type="button" class="btn btn-ghost-bar fpnl-rules-btn${STATE.rulesOpen ? ' active' : ''}" data-fpnl-rules-toggle="1" aria-expanded="${STATE.rulesOpen ? 'true' : 'false'}" data-ui-tip="View CapEx exclusion, unbundled pricing and fuel audit rules"><span>Accounting Rules</span> (${fmtInt(ds.rulesList.length)})</button>
            ${rulesPopover}
          </div>
        </div>
      </div>`;
  }

  function renderFormulaBar(model) {
    var k = model.activeTotal;
    var p = model.perm;
    var modeLabel = STATE.mode === 'recorded'
      ? 'Booked Only'
      : (STATE.mode === 'strict' ? '+ Unbundled ($4/m³ · $60 Ext.)' : 'Full Commercial ($5/m³ · $60 All)');
    if (!p.canBooks && !p.canProfit) {
      return `<div class="fpnl-formula-bar" id="fpnlFormulaBar">
        <span class="fpnl-formula-tag">${esc(modeLabel)}</span>
        <span class="fpnl-formula-eq">${fmtInt(k.totalTrips)} <span>trips</span> · ${fmtNum(k.totalQtyM3, 1)} m³ · ${maskCell()}</span>
      </div>`;
    }
    var addPart = STATE.mode === 'recorded'
      ? '<span class="fpnl-formula-op">+</span><button type="button" class="fpnl-formula-link" data-fpnl-drill="zero"><span>$0.00 Unbundled</span></button>'
      : `<span class="fpnl-formula-op">+</span><button type="button" class="fpnl-formula-link" data-fpnl-drill="zero" data-ui-tip="Inspect unpriced trips making up this credit"><span>Unbundled</span> ${esc(fmtMoney(k.creditRev, 0))}</button>`;
    var netPart = (p.canProfit && p.canAllCost)
      ? `<span class="fpnl-formula-sep">·</span><span class="fpnl-formula-net"><span>Cost</span> ${esc(fmtMoney(k.totalCost, 0))} = <span>Net</span> <strong class="${k.netProfit >= 0 ? 'fpnl-pos' : 'fpnl-neg'}">${esc(fmtSignedMoney(k.netProfit, 2))}</strong></span>`
      : '';
    return `<div class="fpnl-formula-bar" id="fpnlFormulaBar">
      <span class="fpnl-formula-tag">${esc(modeLabel)}</span>
      <span class="fpnl-formula-eq">
        <span><span>Booked</span> <b>${esc(fmtMoney(k.recordedRev, 0))}</b></span>
        ${addPart}
        <span class="fpnl-formula-op">=</span>
        <span><span>Total Haulage</span> <b>${esc(fmtMoney(k.totalRev, 2))}</b></span>
        ${netPart}
      </span>
    </div>`;
  }

  function renderFilterDeck(model) {
    var ds = model.dataset;
    var cohorts = getCohorts();
    var selCodes = selectedTruckCodes();

    var cohortsHtml = cohorts.filter(function (c) {
      if (c.id === 'own_partner' || c.id === 'top5' || STATE.cohort === c.id) return true;
      return Array.isArray(c.trucks) && c.trucks.some(function (code) { return Boolean(ds.trucks[code]); });
    }).map(function (c) {
      var active = STATE.cohort === c.id;
      return `<button type="button" class="fpnl-cohort-pill${active ? ' active' : ''}" data-fpnl-cohort="${esc(c.id)}"><span>${esc(c.label)}</span></button>`;
    }).join('');

    var pickerHtml = '';
    if (STATE.truckPickerOpen) {
      var catalog = searchTruckCatalog(STATE.truckPickerQuery);
      var listHtml = catalog.slice(0, 60).map(function (t) {
        var isSel = selCodes.indexOf(t.code) >= 0;
        var hasOt = Number(t.driverOtHours || 0) > 0 ? ` · OT ${fmtNum(t.driverOtHours, 0)}h` : '';
        return `<label class="fpnl-picker-item${isSel ? ' is-sel' : ''}">
          <input type="checkbox" data-fpnl-toggle-truck="${esc(t.code)}"${isSel ? ' checked' : ''} />
          <span class="fpnl-picker-dot" style="background:${esc(t.colorVar)}"></span>
          <span class="fpnl-picker-code">${esc(t.displayCode)}</span>
          <span class="fpnl-picker-sub">${esc(t.plate)} · ${esc(t.owner)}${esc(hasOt)}</span>
          <span class="fpnl-picker-trips">${fmtInt(t.totalTrips)} <span>trips</span></span>
        </label>`;
      }).join('') || '<div class="fpnl-picker-empty">No matching trucks found in active period</div>';

      pickerHtml = `<div class="fpnl-picker-pop" role="dialog" aria-label="Pick Trucks">
        <div class="fpnl-picker-head">
          <input type="text" id="fpnlTruckSearchInput" class="fpnl-picker-search" placeholder="Search truck code, plate, or driver..." value="${esc(STATE.truckPickerQuery)}" />
          <button type="button" class="fpnl-icon-close" data-fpnl-picker-toggle="1" aria-label="Close">×</button>
        </div>
        <div class="fpnl-picker-list">${listHtml}</div>
      </div>`;
    }

    var focusChips = `<button type="button" class="fpnl-focus-chip${STATE.focusedTruck === 'ALL' ? ' active' : ''}" data-fpnl-focus="ALL"><span>All Selected</span> (${selCodes.length})</button>` +
      selCodes.map(function (code) {
        var t = ds.trucks[code];
        if (!t) return '';
        var isOn = STATE.focusedTruck === code;
        return `<button type="button" class="fpnl-focus-chip${isOn ? ' active' : ''}" data-fpnl-focus="${esc(code)}"><span class="fpnl-dot" style="background:${esc(t.colorVar)}"></span><strong>${esc(t.displayCode)}</strong><span class="fpnl-focus-cnt">(${fmtInt(t.totalTrips)})</span></button>`;
      }).join('');

    var clearFocusBtn = (STATE.focusedTruck && STATE.focusedTruck !== 'ALL')
      ? `<button type="button" class="fpnl-sync-reset-pill" data-fpnl-clear-focus="1" data-ui-tip="Clear single-truck focus across cockpit and tables"><span>Focused</span>: ${esc(STATE.focusedTruck)} ×</button>`
      : '';

    var actCount = activeTruckCodes().length;

    return `
      <div class="fpnl-filter-deck">
        <div class="fpnl-cohort-row">
          <span class="fpnl-deck-label">Cohort</span>
          ${cohortsHtml}
          <div class="fpnl-picker-wrap">
            <button type="button" class="fpnl-cohort-pill${STATE.cohort === 'custom' || STATE.truckPickerOpen ? ' active' : ''}" data-fpnl-picker-toggle="1"><span>Pick Trucks</span> (${selCodes.length}) ▾</button>
            ${pickerHtml}
          </div>
        </div>
        <div class="fpnl-focus-row">
          <span class="fpnl-deck-label">Focus</span>
          ${focusChips}
          ${clearFocusBtn}
          <span class="fpnl-compare-note"><span>Comparing</span> ${actCount} <span>${actCount === 1 ? 'truck' : 'trucks'}</span></span>
        </div>
      </div>`;
  }

  function renderTabs(model) {
    var ds = model.dataset;
    var selCodes = activeTruckCodes();
    var filtRoutes = ds.routes.filter(function (r) { return selCodes.indexOf(r.truck) >= 0; });
    var filtZero = ds.zeroRows.filter(function (z) { return selCodes.indexOf(z.truck) >= 0; });
    var filtCost = ds.costRows.filter(function (c) { return selCodes.indexOf(c.truck) >= 0; });
    var filtOt = ds.overtimeRows.filter(function (o) { return selCodes.indexOf(o.truck) >= 0; });
    var filtBase = (ds.driverBaseRows || []).filter(function (b) { return selCodes.indexOf(b.truck) >= 0; });

    var tabs = [
      { id: 'pnl', label: 'Truck P&L & Scorecards', n: selCodes.length, unit: 'Trucks' },
      { id: 'routes', label: 'Routes & Corridors', n: fmtInt(filtRoutes.length), unit: 'Routes' },
      { id: 'zero', label: 'Unpriced ($0.00) Loads', n: fmtInt(filtZero.length), unit: 'Trips' },
      { id: 'expenses', label: 'Cost Breakdown', n: fmtInt(filtCost.length + filtOt.length + filtBase.length), unit: 'Logs' }
    ];

    return `<div class="subtabs fpnl-tabs" role="tablist">
      ${tabs.map(function (tb) {
        var on = STATE.subtab === tb.id;
        return `<button type="button" role="tab" aria-selected="${on ? 'true' : 'false'}" class="subtab fpnl-tab${on ? ' active' : ''}" data-fpnl-tab="${esc(tb.id)}"><span>${esc(tb.label)}</span><span class="fpnl-tab-badge">${esc(String(tb.n))} <span>${esc(tb.unit)}</span></span></button>`;
      }).join('')}
    </div>`;
  }

  function renderKpiCards(model) {
    var k = model.activeTotal;
    var f = model.fleetTotal;
    var p = model.perm;
    var hideCo = isSingleCorpScope();
    var unpricedShare = k.totalTrips > 0 ? `${((k.totalZeroTrips / k.totalTrips) * 100).toFixed(1)}%` : '0.0%';

    var salesShare = k.totalQtyM3 > 0 ? Math.min(100, (k.salesQtyM3 / k.totalQtyM3) * 100) : 50;
    var wtcShare = k.totalTrips > 0 ? Math.min(100, (k.wtcTrips / k.totalTrips) * 100) : 100;
    var bookedShare = (!p.canBooks && !p.canProfit) ? 50 : (k.totalRev > 0 ? Math.min(100, (k.recordedRev / k.totalRev) * 100) : 50);
    var fuelShare = !p.canAllCost ? 50 : (k.totalCost > 0 ? Math.min(100, (k.dieselCost / k.totalCost) * 100) : 50);
    var paidShare = k.totalTrips > 0 ? Math.min(100, (k.totalPaidTrips / k.totalTrips) * 100) : 50;

    var revValHtml = (!p.canBooks && !p.canProfit) ? maskCell() : esc(fmtMoney(k.totalRev, 2));
    var revSubHtml = (!p.canBooks && !p.canProfit)
      ? maskCell()
      : `<span>Booked</span> ${esc(fmtMoney(k.recordedRev, 0))} + <span>Add-on</span> ${esc(fmtMoney(k.creditRev, 0))}`;

    var costValHtml = !p.canAllCost ? maskCell() : esc(fmtMoney(k.totalCost, 2));
    var costSubHtml = !p.canExp
      ? maskCell()
      : (!p.canAllCost
        ? `<span>Fuel &amp; Maint</span> ${esc(fmtMoney(k.dieselCost + k.maintCost, 0))}`
        : `${esc(fmtMoney(k.costPerTrip, 2))}<span>/trip</span> · ${esc(fmtMoney(k.costPerM3, 2))}/m³ · ${pct(k.dieselCost, k.totalCost, 0)} <span>Fuel</span>`);

    var netValHtml = (!p.canProfit || !p.canAllCost)
      ? maskCell()
      : `<span class="${k.netProfit >= 0 ? 'fpnl-pos' : 'fpnl-neg'}">${esc(fmtSignedMoney(k.netProfit, 2))}</span>`;
    var netSubHtml = (!p.canProfit || !p.canAllCost)
      ? maskCell()
      : `<span>Margin</span> ${k.marginPct.toFixed(1)}% · ${esc(fmtSignedMoney(k.netPerTrip, 2))}<span>/trip</span>`;

    var plantSub = hideCo
      ? `${fmtInt(k.salesTrips)} <span>Sales</span> · ${fmtInt(k.rawTrips)} <span>Raw</span>`
      : `${fmtInt(k.wtcTrips)} WTC (${pct(k.wtcTrips, k.totalTrips, 1)}) · ${fmtInt(k.bbcTrips)} BBC`;

    return `<div class="fpnl-kpi-grid">
      <button type="button" class="fpnl-kpi-card is-navy" data-fpnl-drill="routes" data-ui-tip="Inspect active trips by customer, site and corridor">
        <div class="fpnl-kpi-lbl"><span>Active Trips</span> (${k.truckCount})</div>
        <div class="fpnl-kpi-val">${fmtInt(k.totalTrips)}</div>
        <div class="fpnl-kpi-sub">${plantSub}</div>
        <div class="fpnl-kpi-bar"><span style="width:${wtcShare.toFixed(1)}%;background:var(--chart-navy)"></span></div>
      </button>

      <button type="button" class="fpnl-kpi-card is-steel" data-fpnl-drill="routes" data-ui-tip="Inspect concrete &amp; aggregate volume hauled across routes">
        <div class="fpnl-kpi-lbl"><span>Volume Hauled</span></div>
        <div class="fpnl-kpi-val">${fmtNum(k.totalQtyM3, 1)} m³</div>
        <div class="fpnl-kpi-sub"><span>Sales</span> ${fmtNum(k.salesQtyM3, 0)} m³ · <span>Raw</span> ${fmtNum(k.rawQtyM3, 0)} m³</div>
        <div class="fpnl-kpi-bar"><span style="width:${salesShare.toFixed(1)}%;background:var(--chart-steel)"></span></div>
      </button>

      <button type="button" class="fpnl-kpi-card is-good" data-fpnl-drill="pnl" data-ui-tip="Haulage revenue under the selected valuation mode">
        <div class="fpnl-kpi-lbl"><span>Haulage Revenue</span></div>
        <div class="fpnl-kpi-val">${revValHtml}</div>
        <div class="fpnl-kpi-sub">${revSubHtml}</div>
        <div class="fpnl-kpi-bar"><span style="width:${bookedShare.toFixed(1)}%;background:var(--chart-good)"></span></div>
      </button>

      <button type="button" class="fpnl-kpi-card is-brass" data-fpnl-drill="expenses" data-ui-tip="Inspect diesel, repairs, lubricants, insurance and driver costs">
        <div class="fpnl-kpi-lbl"><span>Operating Costs</span></div>
        <div class="fpnl-kpi-val">${costValHtml}</div>
        <div class="fpnl-kpi-sub">${costSubHtml}</div>
        <div class="fpnl-kpi-bar"><span style="width:${fuelShare.toFixed(1)}%;background:var(--chart-brass)"></span></div>
      </button>

      <button type="button" class="fpnl-kpi-card ${(k.netProfit >= 0 || !p.canProfit || !p.canAllCost) ? 'is-good' : 'is-crit'}" data-fpnl-drill="pnl" data-ui-tip="Net operating margin before corporate financing/CapEx">
        <div class="fpnl-kpi-lbl"><span>Net Operating Margin</span></div>
        <div class="fpnl-kpi-val">${netValHtml}</div>
        <div class="fpnl-kpi-sub">${netSubHtml}</div>
        <div class="fpnl-kpi-bar"><span style="width:${Math.min(100, Math.max(0, Math.abs(k.marginPct))).toFixed(1)}%;background:${(k.netProfit >= 0 || !p.canProfit || !p.canAllCost) ? 'var(--chart-good)' : 'var(--chart-crit)'}"></span></div>
      </button>

      <button type="button" class="fpnl-kpi-card is-warn" data-fpnl-drill="zero" data-ui-tip="Audit tickets with $0.00 recorded freight fee">
        <div class="fpnl-kpi-lbl"><span>Unpriced ($0.00) Trips</span></div>
        <div class="fpnl-kpi-val">${fmtInt(k.totalZeroTrips)} <small>/ ${fmtInt(k.totalTrips)}</small></div>
        <div class="fpnl-kpi-sub">${unpricedShare} <span>unpriced</span> · ${fmtInt(f.totalZeroTrips)} <span>fleet-wide</span></div>
        <div class="fpnl-kpi-bar"><span style="width:${paidShare.toFixed(1)}%;background:var(--chart-amber)"></span></div>
      </button>
    </div>`;
  }

  function renderTruckScorecard(m, perm, hideCo) {
    var canSeeRev = Boolean(perm.canBooks || perm.canProfit);
    var salesCreditVal = (canSeeRev && (STATE.mode === 'strict' || STATE.mode === 'full')) ? Number(m.creditRev || 0) : 0;
    var revBase = canSeeRev ? Math.max(1, Number(m.totalRev || 0)) : 1;
    var costBase = perm.canAllCost ? Math.max(1, Number(m.totalCost || 0)) : 1;

    var wSales = canSeeRev ? ((Number(m.salesRev || 0) / revBase) * 100).toFixed(2) : '0.00';
    var wRaw = canSeeRev ? ((Number(m.rawRev || 0) / revBase) * 100).toFixed(2) : '0.00';
    var wCred = canSeeRev ? ((salesCreditVal / revBase) * 100).toFixed(2) : '0.00';

    var wDiesel = perm.canAllCost ? ((Number(m.dieselCost || 0) / costBase) * 100).toFixed(2) : '0.00';
    var wMaint = perm.canAllCost ? ((Number(m.maintCost || 0) / costBase) * 100).toFixed(2) : '0.00';
    var wDrv = perm.canAllCost ? ((Number(m.driverCost || 0) / costBase) * 100).toFixed(2) : '0.00';

    var netCls = (perm.canProfit && perm.canAllCost && Number(m.netProfit || 0) >= 0) ? 'fpnl-badge-good' : 'fpnl-badge-crit';
    var isFocused = STATE.focusedTruck === m.code;
    var drvHtml = m.driverShort && m.driverShort !== 'Driver'
      ? relLinkHtml('drivers', m.driverShort, m.driver, false)
      : `<span>${esc(m.driver || 'Assigned Driver')}</span>`;

    var marginBadgeHtml = (perm.canProfit && perm.canAllCost)
      ? `<span class="fpnl-net-badge ${netCls}"><span>Net</span> ${esc(fmtSignedMoney(m.netProfit, 2))} (${m.marginPct.toFixed(1)}%)</span>`
      : `<span class="fpnl-net-badge">${maskCell()}</span>`;

    var revMixTotal = (!perm.canBooks && !perm.canProfit)
      ? maskCell()
      : `${esc(fmtMoney(m.totalRev, 2))} <span>(${esc(fmtMoney(m.revPerTrip, 2))}/trip)</span>`;
    var revSalesAmt = (!perm.canBooks && !perm.canProfit) ? maskCell() : `<b>${esc(fmtMoney(m.salesRev, 0))}</b>`;
    var revRawAmt = (!perm.canBooks && !perm.canProfit) ? maskCell() : `<b>${esc(fmtMoney(m.rawRev, 0))}</b>`;
    var revCredAmt = (!perm.canBooks && !perm.canProfit) ? maskCell() : `<b>+${esc(fmtMoney(m.creditRev, 0))}</b>`;

    var costMixTotal = !perm.canAllCost
      ? maskCell()
      : `-${esc(fmtMoney(m.totalCost, 2))} <span>(${esc(fmtMoney(m.costPerTrip, 2))}/trip)</span>`;
    var fuelCostHtml = perm.canExp ? `<b>-${esc(fmtMoney(m.dieselCost, 0))}</b>` : maskCell();
    var maintCostHtml = perm.canExp ? `<b>-${esc(fmtMoney(m.maintCost, 0))}</b>` : maskCell();
    var drvCostHtml = perm.canPay ? `<b>-${esc(fmtMoney(m.driverCost, 0))}</b>` : maskCell();

    var otSnapChip = Math.abs(Number(m.driverOtSnapMin || 0)) >= 0.1
      ? ` <span class="job-otsnap-pill ${m.driverOtSnapMin < 0 ? 'is-trim' : 'is-snap'}" data-ui-tip="Attendance punch overtime delta allocated to driver hauls">${esc((m.driverOtSnapMin > 0 ? '+' : '') + fmtNum(Math.round(m.driverOtSnapMin), 0) + 'm OT ' + (m.driverOtSnapMin < 0 ? 'Trim' : 'Snap'))}</span>${(perm.canPay && m.driverOtSnapUsd != null) ? ` <span class="mono">${esc((m.driverOtSnapUsd >= 0 ? '+' : '-') + fmtMoney(Math.abs(m.driverOtSnapUsd)))}</span>` : ''}`
      : '';

    var unitPlantCol = hideCo
      ? ''
      : `<div><div class="fpnl-mini-k">Plant Split</div><div class="fpnl-mini-v">${fmtInt(m.wtcTrips)} WTC · ${fmtInt(m.bbcTrips)} BBC</div></div>`;

    return `
      <article class="fpnl-card${isFocused ? ' is-focused' : ''}" style="border-top-color:${esc(m.colorVar)}">
        <div class="fpnl-card-head">
          <div class="fpnl-card-title-grp">
            <div class="fpnl-card-unit-line">
              ${relLinkHtml('equipment', m.displayCode, m.displayCode, true)}
              <span class="fpnl-plate-tag">· ${esc(m.plate)}</span>
              ${healthBadgeHtml(m.displayCode)}
            </div>
            <div class="fpnl-card-driver"><span>Driver</span><span data-no-i18n="1"> · </span>${drvHtml}</div>
          </div>
          <div class="fpnl-card-actions">
            ${marginBadgeHtml}
            <button type="button" class="fpnl-only-btn${isFocused ? ' is-active' : ''}" data-fpnl-focus="${esc(m.code)}" data-ui-tip="Toggle focus between selected truck and active cohort"><span>${isFocused ? 'Focused' : 'Focus'}</span></button>
          </div>
        </div>

        <div class="fpnl-mix-section">
          <div class="fpnl-mix-head">
            <span><span>Revenue Mix</span> · ${fmtInt(m.totalTrips)} <span>trips</span> (${fmtNum(m.totalQtyM3, 0)} m³)</span>
            <strong class="fpnl-pos">${revMixTotal}</strong>
          </div>
          <div class="fpnl-stack-track" role="img" aria-label="Revenue composition">
            <span class="fpnl-seg-indigo" style="width:${wSales}%"></span>
            <span class="fpnl-seg-steel" style="width:${wRaw}%"></span>
            <span class="fpnl-seg-good" style="width:${wCred}%"></span>
          </div>
          <div class="fpnl-mix-legend">
            <button type="button" class="fpnl-drill-chip" data-fpnl-drill="routes" data-fpnl-drill-truck="${esc(m.code)}"><i style="background:var(--chart-navy)"></i><span>Sales</span> (${fmtInt(m.salesTrips)}) ${revSalesAmt}</button>
            <button type="button" class="fpnl-drill-chip" data-fpnl-drill="routes" data-fpnl-drill-truck="${esc(m.code)}"><i style="background:var(--chart-steel)"></i><span>Raw</span> (${fmtInt(m.rawTrips)}) ${revRawAmt}</button>
            <button type="button" class="fpnl-drill-chip" data-fpnl-drill="zero" data-fpnl-drill-truck="${esc(m.code)}"><i style="background:var(--chart-good)"></i><span>Unbundled</span> ${revCredAmt}</button>
            <button type="button" class="fpnl-drill-chip" data-fpnl-drill="zero" data-fpnl-drill-truck="${esc(m.code)}"><span>$0 Trips</span> <b>${fmtInt(m.totalZeroTrips)}</b></button>
          </div>
        </div>

        <div class="fpnl-mix-section">
          <div class="fpnl-mix-head">
            <span><span>Operating Cost Mix</span> · ${perm.canAllCost ? `${esc(fmtMoney(m.costPerM3, 2))}/m³` : maskCell()}</span>
            <strong class="fpnl-neg">${costMixTotal}</strong>
          </div>
          <div class="fpnl-stack-track" role="img" aria-label="Operating cost composition">
            <span class="fpnl-seg-amber" style="width:${wDiesel}%"></span>
            <span class="fpnl-seg-crimson" style="width:${wMaint}%"></span>
            <span class="fpnl-seg-violet" style="width:${wDrv}%"></span>
          </div>
          <div class="fpnl-mix-legend">
            <button type="button" class="fpnl-drill-chip" data-fpnl-drill="expenses" data-fpnl-drill-cat="Diesel Fuel" data-fpnl-drill-truck="${esc(m.code)}"><i style="background:var(--chart-brass)"></i><span>Fuel</span> (${fmtNum(m.dieselLiters, 0)} L) ${fuelCostHtml}</button>
            <button type="button" class="fpnl-drill-chip" data-fpnl-drill="expenses" data-fpnl-drill-cat="Repairs &amp; Parts" data-fpnl-drill-truck="${esc(m.code)}"><i style="background:var(--chart-crit)"></i><span>Repairs &amp; Lubes</span> (${fmtInt(m.expCount)}) ${maintCostHtml}</button>
            <button type="button" class="fpnl-drill-chip" data-fpnl-drill="overtime" data-fpnl-drill-truck="${esc(m.code)}"><i style="background:var(--chart-plum)"></i><span>Driver &amp; OT</span> (${fmtNum(m.driverOtHours, 0)}h) ${drvCostHtml}${otSnapChip}</button>
          </div>
        </div>

        <div class="fpnl-card-footer${hideCo ? ' cols-2' : ''}">
          <div><div class="fpnl-mini-k">Net / Trip</div><div class="fpnl-mini-v ${(perm.canProfit && perm.canAllCost) ? (m.netPerTrip >= 0 ? 'fpnl-pos' : 'fpnl-neg') : ''}">${(perm.canProfit && perm.canAllCost) ? esc(fmtSignedMoney(m.netPerTrip, 2)) : maskCell()}</div></div>
          <div><div class="fpnl-mini-k">Fuel Burn</div><div class="fpnl-mini-v">${fmtNum(m.litersPerTrip, 1)} L/trip · ${fmtNum(m.litersPer100M3, 0)} L/100m³</div></div>
          ${unitPlantCol}
        </div>
      </article>`;
  }

  function renderPnlTab(model) {
    var metrics = model.activeMetrics;
    var k = model.activeTotal;
    var p = model.perm;
    var hideCo = isSingleCorpScope();
    var ds = model.dataset;

    var subToolbar = `<div class="fpnl-sub-head">
      <div class="seg" role="group" aria-label="P&amp;L View">
        <button type="button" class="seg-btn${STATE.pnlView === 'visual' ? ' active' : ''}" data-fpnl-pnl-view="visual">Scorecards</button>
        <button type="button" class="seg-btn${STATE.pnlView === 'table' ? ' active' : ''}" data-fpnl-pnl-view="table">P&amp;L Matrix</button>
        <button type="button" class="seg-btn${STATE.pnlView === 'monthly' ? ' active' : ''}" data-fpnl-pnl-view="monthly">Monthly Trend</button>
      </div>
      <div class="fpnl-sub-meta">
        <span><span>Active</span>: <b>${metrics.length}</b> <span>${metrics.length === 1 ? 'truck' : 'trucks'}</span> · <b>${fmtInt(k.totalTrips)}</b> <span>trips</span> · <b>${fmtNum(k.totalQtyM3, 1)}</b> m³</span>
        ${model.scope.period !== 'all' ? '<button type="button" class="fpnl-link-btn" data-fpnl-reset-period="1">Reset Period</button>' : ''}
      </div>
    </div>`;

    if (STATE.pnlView === 'monthly') {
      var selSet = {};
      activeTruckCodes().forEach(function (c) { selSet[c] = true; });
      var canSeeRev = Boolean(p.canBooks || p.canProfit);
      var monthlyRows = ds.months.map(function (baseM) {
        var acc = {
          ym: baseM.ym, trips: 0, qtyM3: 0, hasActivity: false,
          recordedRev: 0, creditRev: 0, totalRev: 0,
          dieselCost: 0, maintCost: 0, otPay: 0, basePay: 0, driverCost: 0,
          totalCost: 0, netProfit: 0
        };
        Object.keys(selSet).forEach(function (code) {
          var tm = ds.trucks[code] && ds.trucks[code].monthsMap[baseM.ym];
          if (!tm) return;
          if (tm.trips > 0 || tm.hasActivity) acc.hasActivity = true;
          acc.trips += Number(tm.trips || 0);
          acc.qtyM3 += Number(tm.qtyM3 || 0);
          if (canSeeRev) {
            var recR = Number(tm.recordedRev || 0);
            var cr = creditForMode(tm, STATE.mode);
            acc.recordedRev += recR;
            acc.creditRev += cr;
            acc.totalRev += recR + cr;
          }
          if (p.canExp) {
            acc.dieselCost += Number(tm.dieselCost || 0);
            acc.maintCost += Number(tm.maintCost || 0);
          }
          if (p.canPay) {
            var otP = Number(tm.otPay || 0);
            var baP = Number(tm.basePay || 0);
            acc.otPay += otP;
            acc.basePay += baP;
            acc.driverCost += otP + baP;
          }
        });
        if (p.canAllCost) {
          acc.totalCost = acc.dieselCost + acc.maintCost + acc.driverCost;
        }
        if (p.canProfit && p.canAllCost) {
          acc.netProfit = acc.totalRev - acc.totalCost;
        }
        return acc;
      }).filter(function (mr) { return mr.hasActivity || mr.trips > 0 || mr.totalCost > 0 || mr.dieselCost > 0 || mr.maintCost > 0 || mr.driverCost > 0; });

      var maxBar = Math.max(1, Math.max.apply(null, monthlyRows.map(function (r) { return Math.max(r.totalRev, r.totalCost); }).concat([1])));
      var mTot = { trips: 0, qtyM3: 0, recordedRev: 0, creditRev: 0, totalRev: 0, dieselCost: 0, maintCost: 0, driverCost: 0, totalCost: 0, netProfit: 0 };
      monthlyRows.forEach(function (mr) {
        mTot.trips += mr.trips; mTot.qtyM3 += mr.qtyM3;
        mTot.recordedRev += mr.recordedRev; mTot.creditRev += mr.creditRev; mTot.totalRev += mr.totalRev;
        mTot.dieselCost += mr.dieselCost; mTot.maintCost += mr.maintCost; mTot.driverCost += mr.driverCost;
        mTot.totalCost += mr.totalCost; mTot.netProfit += mr.netProfit;
      });

      var monthlyBody = monthlyRows.map(function (r) {
        var rPct = ((r.totalRev / maxBar) * 100).toFixed(1);
        var cPct = ((r.totalCost / maxBar) * 100).toFixed(1);
        var revCell = !canSeeRev ? maskCell() : esc(fmtMoney(r.totalRev, 2));
        var recCell = !canSeeRev ? maskCell() : esc(fmtMoney(r.recordedRev, 0));
        var credCell = !canSeeRev ? maskCell() : esc(fmtMoney(r.creditRev, 0));
        var fuelCell = p.canExp ? esc(fmtMoney(r.dieselCost, 0)) : maskCell();
        var maintCell = p.canExp ? esc(fmtMoney(r.maintCost, 0)) : maskCell();
        var drvCell = p.canPay ? esc(fmtMoney(r.driverCost, 0)) : maskCell();
        var costCell = p.canAllCost ? esc(fmtMoney(r.totalCost, 2)) : maskCell();
        var netCell = (p.canProfit && p.canAllCost)
          ? `<span class="${r.netProfit >= 0 ? 'fpnl-pos' : 'fpnl-neg'}">${esc(fmtSignedMoney(r.netProfit, 2))}</span>`
          : maskCell();
        var visualCell = (!p.canProfit || !p.canAllCost)
          ? maskCell()
          : `<div class="fpnl-month-bars"><div class="fpnl-mbar"><span style="width:${rPct}%;background:var(--chart-good)"></span></div><div class="fpnl-mbar"><span style="width:${cPct}%;background:var(--chart-crit)"></span></div></div>`;

        return `<tr class="rrow fpnl-month-row" data-fpnl-filter-month="${esc(r.ym)}" data-ui-tip="Click a month row to filter the entire Command Center to that month">
          <td class="mono"><strong>${esc(r.ym)}</strong></td>
          <td class="r">${fmtInt(r.trips)}</td>
          <td class="r">${fmtNum(r.qtyM3, 1)}</td>
          <td class="r">${recCell}</td>
          <td class="r">${credCell}</td>
          <td class="r"><strong>${revCell}</strong></td>
          <td class="r">${fuelCell}</td>
          <td class="r">${maintCell}</td>
          <td class="r">${drvCell}</td>
          <td class="r"><strong>${costCell}</strong></td>
          <td class="r"><strong>${netCell}</strong></td>
          <td class="fpnl-month-vis-col">${visualCell}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="12" class="fpnl-empty">No monthly truck activity in this period.</td></tr>';

      return `${subToolbar}
        <div class="table-wrap fpnl-table-wrap">
          <table class="ledger-table">
            <thead><tr>
              <th>Month</th><th class="r">Trips</th><th class="r">Qty (m³)</th>
              <th class="r">Booked ($)</th><th class="r">Add-on ($)</th><th class="r">Total Rev ($)</th>
              <th class="r">Fuel ($)</th><th class="r">Maint ($)</th><th class="r">Driver &amp; OT ($)</th>
              <th class="r">Total Cost ($)</th><th class="r">Net Margin ($)</th><th>Rev vs Cost</th>
            </tr></thead>
            <tbody>${monthlyBody}</tbody>
            <tfoot><tr>
              <td><b><span>TOTAL</span> (${monthlyRows.length})</b></td>
              <td class="r"><b>${fmtInt(mTot.trips)}</b></td>
              <td class="r"><b>${fmtNum(mTot.qtyM3, 1)}</b></td>
              <td class="r"><b>${!canSeeRev ? maskCell() : esc(fmtMoney(mTot.recordedRev, 0))}</b></td>
              <td class="r"><b>${!canSeeRev ? maskCell() : esc(fmtMoney(mTot.creditRev, 0))}</b></td>
              <td class="r"><b>${!canSeeRev ? maskCell() : esc(fmtMoney(mTot.totalRev, 2))}</b></td>
              <td class="r"><b>${p.canExp ? esc(fmtMoney(mTot.dieselCost, 0)) : maskCell()}</b></td>
              <td class="r"><b>${p.canExp ? esc(fmtMoney(mTot.maintCost, 0)) : maskCell()}</b></td>
              <td class="r"><b>${p.canPay ? esc(fmtMoney(mTot.driverCost, 0)) : maskCell()}</b></td>
              <td class="r"><b>${p.canAllCost ? esc(fmtMoney(mTot.totalCost, 2)) : maskCell()}</b></td>
              <td class="r"><b>${(p.canProfit && p.canAllCost) ? esc(fmtSignedMoney(mTot.netProfit, 2)) : maskCell()}</b></td>
              <td></td>
            </tr></tfoot>
          </table>
        </div>
        <div class="fpnl-table-foot-note">Click any month row to filter the entire Command Center to that month.</div>`;
    }

    if (STATE.pnlView === 'table') {
      var matrixRows = metrics.map(function (m) {
        return `<tr class="rrow" data-fpnl-focus="${esc(m.code)}" data-ui-tip="Toggle focus between selected truck and active cohort">
          <td class="mono">${relLinkHtml('equipment', m.displayCode, m.displayCode, true)} ${healthBadgeHtml(m.displayCode)}<div class="fpnl-sub-note">${esc(m.plate)} · ${esc(m.driverShort)}</div></td>
          <td class="r"><strong>${fmtInt(m.totalTrips)}</strong></td>
          <td class="r">${fmtNum(m.totalQtyM3, 1)}</td>
          <td class="r">${(!p.canBooks && !p.canProfit) ? maskCell() : esc(fmtMoney(m.recordedRev, 2))}</td>
          <td class="r">${(!p.canBooks && !p.canProfit) ? maskCell() : esc(fmtMoney(m.creditRev, 2))}</td>
          <td class="r"><strong>${(!p.canBooks && !p.canProfit) ? maskCell() : esc(fmtMoney(m.totalRev, 2))}</strong></td>
          <td class="r">${p.canExp ? esc(fmtMoney(m.dieselCost, 2)) : maskCell()}</td>
          <td class="r">${p.canExp ? esc(fmtMoney(m.maintCost, 2)) : maskCell()}</td>
          <td class="r">${p.canPay ? esc(fmtMoney(m.driverCost, 2)) : maskCell()}</td>
          <td class="r"><strong>${p.canAllCost ? esc(fmtMoney(m.totalCost, 2)) : maskCell()}</strong></td>
          <td class="r"><strong>${(p.canProfit && p.canAllCost) ? `<span class="${m.netProfit >= 0 ? 'fpnl-pos' : 'fpnl-neg'}">${esc(fmtSignedMoney(m.netProfit, 2))}</span>` : maskCell()}</strong></td>
          <td class="r">${(p.canProfit && p.canAllCost) ? `${m.marginPct.toFixed(1)}%` : maskCell()}</td>
          <td class="r">${(p.canProfit && p.canAllCost) ? esc(fmtSignedMoney(m.netPerTrip, 2)) : maskCell()}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="13" class="fpnl-empty">No truck P&amp;L rows match the active scope.</td></tr>';

      return `${subToolbar}
        <div class="table-toolbar fpnl-inline-toolbar">
          <span>Click a row to focus truck · click unit code to inspect asset card</span>
          <button type="button" class="btn" data-fpnl-csv="matrix">CSV</button>
        </div>
        <div class="table-wrap fpnl-table-wrap">
          <table class="ledger-table">
            <thead><tr>
              <th>Truck</th><th class="r">Trips</th><th class="r">Vol (m³)</th>
              <th class="r">Booked ($)</th><th class="r">Unbundled ($)</th><th class="r">Total Rev ($)</th>
              <th class="r">Fuel ($)</th><th class="r">Repairs &amp; Lubes ($)</th><th class="r">Driver &amp; OT ($)</th>
              <th class="r">Total Cost ($)</th><th class="r">Net Margin ($)</th><th class="r">Margin %</th><th class="r">Net/Trip ($)</th>
            </tr></thead>
            <tbody>${matrixRows}</tbody>
            <tfoot><tr>
              <td><b><span>TOTAL</span> (${metrics.length})</b></td>
              <td class="r"><b>${fmtInt(k.totalTrips)}</b></td>
              <td class="r"><b>${fmtNum(k.totalQtyM3, 1)}</b></td>
              <td class="r"><b>${(!p.canBooks && !p.canProfit) ? maskCell() : esc(fmtMoney(k.recordedRev, 2))}</b></td>
              <td class="r"><b>${(!p.canBooks && !p.canProfit) ? maskCell() : esc(fmtMoney(k.creditRev, 2))}</b></td>
              <td class="r"><b>${(!p.canBooks && !p.canProfit) ? maskCell() : esc(fmtMoney(k.totalRev, 2))}</b></td>
              <td class="r"><b>${p.canExp ? esc(fmtMoney(k.dieselCost, 2)) : maskCell()}</b></td>
              <td class="r"><b>${p.canExp ? esc(fmtMoney(k.maintCost, 2)) : maskCell()}</b></td>
              <td class="r"><b>${p.canPay ? esc(fmtMoney(k.driverCost, 2)) : maskCell()}</b></td>
              <td class="r"><b>${p.canAllCost ? esc(fmtMoney(k.totalCost, 2)) : maskCell()}</b></td>
              <td class="r"><b>${(p.canProfit && p.canAllCost) ? esc(fmtSignedMoney(k.netProfit, 2)) : maskCell()}</b></td>
              <td class="r"><b>${(p.canProfit && p.canAllCost) ? `${k.marginPct.toFixed(1)}%` : maskCell()}</b></td>
              <td class="r"><b>${(p.canProfit && p.canAllCost) ? esc(fmtSignedMoney(k.netPerTrip, 2)) : maskCell()}</b></td>
            </tr></tfoot>
          </table>
        </div>`;
    }

    return `${subToolbar}<div class="fpnl-cards-grid">${metrics.map(function (m) { return renderTruckScorecard(m, p, hideCo); }).join('')}</div>`;
  }

  function getFilteredRoutes(model) {
    var selCodes = activeTruckCodes();
    var p = model.perm || getSeatPermissions();
    var canSeeRev = Boolean(p.canBooks || p.canProfit);
    var q = String(STATE.routeSearch || '').trim().toLowerCase();
    var rows = model.dataset.routes.filter(function (r) {
      if (selCodes.indexOf(r.truck) < 0) return false;
      if (STATE.routeTruck !== 'ALL' && r.truck !== STATE.routeTruck) return false;
      if (q) {
        var hay = `${r.truck} ${r.counterparty} ${r.site} ${r.material} ${r.stream} ${r.company}`.toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });

    var sortKey = STATE.routeColSort || 'trips';
    if (!canSeeRev && (sortKey === 'rev' || sortKey === 'shadowCredit')) sortKey = 'trips';
    var dirMul = STATE.routeColDir === 'asc' ? 1 : -1;
    if (STATE.routeSort && STATE.routeColSort === 'trips' && STATE.routeColDir === 'desc') {
      rows.sort(function (a, b) {
        if (STATE.routeSort === 'qty_desc') return b.qtyM3 - a.qtyM3;
        if (STATE.routeSort === 'rev_desc' && canSeeRev) {
          return (Number(b.rev || 0) + creditForMode(b, STATE.mode)) - (Number(a.rev || 0) + creditForMode(a, STATE.mode));
        }
        if (STATE.routeSort === 'zero_desc') return b.zeroTrips - a.zeroTrips;
        return b.trips - a.trips;
      });
    } else {
      rows.sort(function (a, b) {
        if (sortKey === 'shadowCredit') {
          return (creditForMode(a, STATE.mode) - creditForMode(b, STATE.mode)) * dirMul;
        }
        var va = a[sortKey];
        var vb = b[sortKey];
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dirMul;
        return String(va || '').localeCompare(String(vb || '')) * dirMul;
      });
    }
    return rows;
  }

  function getCorridorTickets(route) {
    if (!route) return [];
    var isSales = route.stream === 'Sales Delivery';
    var rows = scopedTableRows(isSales ? 'sales_tickets' : 'raw_purchases', false);
    var ent = window.MFG_ENTERPRISE;
    var st = (ent && ent.state) || window.STATE || {};
    var p = getSeatPermissions();
    var canSeeRev = Boolean(p.canBooks || p.canProfit);
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r || r.voided) continue;
      var sign = isSales
        ? ((ent && typeof ent.ticketSign === 'function') ? ent.ticketSign(r) : 1)
        : ((ent && typeof ent.rawSign === 'function') ? ent.rawSign(r) : 1);
      if (sign === 0) continue;
      if (normTruckCode(r.truck || r.truck_code || r.equipment || r.transporter) !== route.truck) continue;
      if (String(r.company || 'WTC') !== route.company) continue;
      var cp = isSales ? String(r.customer || '—') : String(r.site_owner || r.supplier || 'Material Source');
      var site = String(r.site || r.work_site || (isSales ? 'Site' : 'Plant'));
      var mat = isSales ? String(r.product || '—') : String(r.product || r.material || 'Aggregate');
      if (cp !== route.counterparty || site !== route.site || mat !== route.material) continue;
      var deliv = isSales
        ? Number(r.trans_price != null ? r.trans_price : (r.trans_total_usd != null ? r.trans_total_usd : (r.total_delivery_usd || 0))) * sign
        : Number(r.trans_cost != null ? r.trans_cost : (r.transport_usd != null ? r.transport_usd : (r.total_delivery_usd || 0))) * sign;
      out.push({
        id: r.id || r.ticket_no || '',
        table: isSales ? 'sales_tickets' : 'raw_purchases',
        ticketNo: r.ticket_no || r.name || r.id || '—',
        date: recDate(r, st),
        driver: String(r.driver || '—'),
        qty: Number(r.qty != null ? r.qty : (r.qty_m3 || 0)) * sign,
        deliv: canSeeRev ? deliv : null,
        ot: Number(r.overtime || 0)
      });
    }
    out.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    return out;
  }

  function renderRoutesTab(model) {
    var p = model.perm;
    var canSeeRev = Boolean(p.canBooks || p.canProfit);
    var hideCo = isSingleCorpScope();
    var actCodes = activeTruckCodes();
    var rows = getFilteredRoutes(model);
    var shown = rows.slice(0, STATE.routeLimit);

    var totTrips = 0, totQty = 0, totRev = 0, totShad = 0, totZero = 0;
    rows.forEach(function (r) {
      totTrips += r.trips;
      totQty += r.qtyM3;
      if (canSeeRev) {
        totRev += Number(r.rev || 0);
        totShad += creditForMode(r, STATE.mode);
      }
      totZero += r.zeroTrips;
    });

    var truckOpts = `<option value="ALL"${STATE.routeTruck === 'ALL' ? ' selected' : ''}>All Active Trucks</option>` +
      actCodes.map(function (c) {
        return `<option value="${esc(c)}"${STATE.routeTruck === c ? ' selected' : ''}>${esc(c)}</option>`;
      }).join('');

    var colCount = hideCo ? 10 : 11;

    var bodyHtml = shown.map(function (r) {
      var isExp = STATE.expandedRouteKey === r.key;
      var cpType = r.stream === 'Sales Delivery' ? 'customers' : 'suppliers';
      var addonVal = canSeeRev ? creditForMode(r, STATE.mode) : null;
      var rowHtml = `<tr class="rrow fpnl-corridor-row${isExp ? ' is-expanded' : ''}" data-fpnl-corridor-expand="${esc(r.key)}">
        ${hideCo ? '' : `<td>${coBadgeHtml(r.company)}</td>`}
        <td><span class="badge ${r.stream === 'Sales Delivery' ? 'badge-info' : 'badge-ok'}">${esc(r.stream === 'Sales Delivery' ? 'Sales' : 'Raw')}</span></td>
        <td class="mono">${relLinkHtml('equipment', r.truck, r.truck, true)}</td>
        <td>${relLinkHtml(cpType, r.counterparty, r.counterparty, false)}</td>
        <td>${relLinkHtml('sites', r.site, r.site, false)}</td>
        <td>${esc(r.material)}</td>
        <td class="r"><strong>${fmtInt(r.trips)}</strong></td>
        <td class="r">${fmtNum(r.qtyM3, 1)}</td>
        <td class="r">${!canSeeRev ? maskCell() : esc(fmtMoney(r.rev, 2))}</td>
        <td class="r">${!canSeeRev ? maskCell() : (addonVal > 0 ? `<span class="fpnl-pos">+${esc(fmtMoney(addonVal, 0))}</span>` : '—')}</td>
        <td class="r"><button type="button" class="fpnl-only-btn${isExp ? ' is-active' : ''}" data-fpnl-corridor-expand="${esc(r.key)}"><span>${isExp ? 'Hide' : 'Tickets'}</span> (${fmtInt(r.trips)})</button></td>
      </tr>`;

      if (isExp) {
        var cTix = getCorridorTickets(r);
        var sliceTix = cTix.slice(0, 25);
        var innerRows = sliceTix.map(function (t) {
          return `<tr class="rrow" data-rkey="${esc(t.table)}" data-rid="${esc(t.id)}">
            <td class="mono">${esc(fmtDateDisplay(t.date))}</td>
            <td class="mono"><strong>${esc(t.ticketNo)}</strong></td>
            <td>${(t.driver && t.driver !== '—') ? relLinkHtml('drivers', t.driver, t.driver, false) : '—'}</td>
            <td class="r">${fmtNum(t.qty, 1)}</td>
            <td class="r">${!canSeeRev ? maskCell() : (Math.abs(Number(t.deliv || 0)) > 0.001 ? esc(fmtMoney(t.deliv, 2)) : '<span class="fpnl-neg">$0.00</span>')}</td>
            <td>${t.ot > 0 ? `<span class="badge badge-warn"><span>OT</span> <span data-no-i18n="1">${t.ot >= 2 ? '4h' : '2h'}</span></span>` : '—'}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="6" class="fpnl-empty">No matching ticket records.</td></tr>';

        rowHtml += `<tr class="fpnl-corridor-drawer">
          <td colspan="${colCount}">
            <div class="fpnl-drawer-head">
              <strong><span>Corridor Tickets</span>: ${esc(r.truck)} · ${esc(r.counterparty)} · ${esc(r.site)} (${fmtInt(cTix.length)} <span>tickets</span>)</strong>
              <span class="fpnl-sub-note">Click any ticket row below to inspect or edit record</span>
            </div>
            <table class="ledger-table fpnl-drawer-table">
              <thead><tr><th>Date</th><th>Ref #</th><th>Driver</th><th class="r">Qty (m³)</th><th class="r">Haul Fee ($)</th><th>OT</th></tr></thead>
              <tbody>${innerRows}</tbody>
            </table>
          </td>
        </tr>`;
      }
      return rowHtml;
    }).join('') || `<tr><td colspan="${colCount}" class="fpnl-empty">No routes match your filter.</td></tr>`;

    var moreBtn = rows.length > shown.length
      ? `<div class="fpnl-pagination"><span><span>Showing</span> ${shown.length} / ${fmtInt(rows.length)}</span> <button type="button" class="btn btn-ghost-bar" data-fpnl-more="routes"><span>Show 25 More</span> (${fmtInt(rows.length - shown.length)})</button></div>`
      : '';

    return `
      <div class="table-toolbar fpnl-sub-toolbar">
        <div class="fpnl-toolbar-left">
          <input type="text" id="fpnlRouteSearch" class="fpnl-search-input" placeholder="Search customer, quarry, site, material, truck..." value="${esc(STATE.routeSearch)}" />
          <select id="fpnlRouteTruck" class="fpnl-select">${truckOpts}</select>
          <select id="fpnlRouteSort" class="fpnl-select">
            <option value="trips_desc"${STATE.routeSort === 'trips_desc' ? ' selected' : ''}>Sort: Trips Desc</option>
            <option value="qty_desc"${STATE.routeSort === 'qty_desc' ? ' selected' : ''}>Sort: Volume Desc</option>
            <option value="rev_desc"${STATE.routeSort === 'rev_desc' ? ' selected' : ''}>Sort: Est. Revenue Desc</option>
            <option value="zero_desc"${STATE.routeSort === 'zero_desc' ? ' selected' : ''}>Sort: Zero-Priced Trips</option>
          </select>
        </div>
        <div class="fpnl-toolbar-right">
          <span class="fpnl-count-pill">${fmtInt(rows.length)} <span>corridors</span></span>
          <button type="button" class="btn" data-fpnl-csv="routes">CSV</button>
        </div>
      </div>
      <div class="table-wrap fpnl-table-wrap">
        <table class="ledger-table">
          <thead><tr>
            ${hideCo ? '' : `<th class="sortable" data-fpnl-sort="routes:company"><span>Co.</span>${sortIndicator(STATE.routeColSort, STATE.routeColDir, 'company')}</th>`}
            <th class="sortable" data-fpnl-sort="routes:stream"><span>Stream</span>${sortIndicator(STATE.routeColSort, STATE.routeColDir, 'stream')}</th>
            <th class="sortable" data-fpnl-sort="routes:truck"><span>Truck</span>${sortIndicator(STATE.routeColSort, STATE.routeColDir, 'truck')}</th>
            <th class="sortable" data-fpnl-sort="routes:counterparty"><span>Counterparty</span>${sortIndicator(STATE.routeColSort, STATE.routeColDir, 'counterparty')}</th>
            <th class="sortable" data-fpnl-sort="routes:site"><span>Destination / Site</span>${sortIndicator(STATE.routeColSort, STATE.routeColDir, 'site')}</th>
            <th class="sortable" data-fpnl-sort="routes:material"><span>Material</span>${sortIndicator(STATE.routeColSort, STATE.routeColDir, 'material')}</th>
            <th class="r sortable" data-fpnl-sort="routes:trips"><span>Trips</span>${sortIndicator(STATE.routeColSort, STATE.routeColDir, 'trips')}</th>
            <th class="r sortable" data-fpnl-sort="routes:qtyM3"><span>Vol (m³)</span>${sortIndicator(STATE.routeColSort, STATE.routeColDir, 'qtyM3')}</th>
            <th class="r sortable" data-fpnl-sort="routes:rev"><span>Booked ($)</span>${sortIndicator(STATE.routeColSort, STATE.routeColDir, 'rev')}</th>
            <th class="r sortable" data-fpnl-sort="routes:shadowCredit"><span>Add-on ($)</span>${sortIndicator(STATE.routeColSort, STATE.routeColDir, 'shadowCredit')}</th>
            <th class="r">Inspect</th>
          </tr></thead>
          <tbody>${bodyHtml}</tbody>
          <tfoot><tr>
            <td colspan="${hideCo ? 5 : 6}"><b><span>TOTAL</span> (${fmtInt(rows.length)})</b></td>
            <td class="r"><b>${fmtInt(totTrips)}</b></td>
            <td class="r"><b>${fmtNum(totQty, 1)}</b></td>
            <td class="r"><b>${!canSeeRev ? maskCell() : esc(fmtMoney(totRev, 2))}</b></td>
            <td class="r"><b>${!canSeeRev ? maskCell() : esc(fmtMoney(totShad, 0))}</b></td>
            <td class="r">${totZero > 0 ? `<b>${fmtInt(totZero)}</b> <span data-t="unpriced">unpriced</span>` : '—'}</td>
          </tr></tfoot>
        </table>
      </div>
      ${moreBtn}`;
  }

  function getFilteredZeroRows(model) {
    var selCodes = activeTruckCodes();
    var p = model.perm || getSeatPermissions();
    var canSeeRev = Boolean(p.canBooks || p.canProfit);
    var rows = model.dataset.zeroRows.filter(function (z) {
      if (selCodes.indexOf(z.truck) < 0) return false;
      if (STATE.zeroTruck !== 'ALL' && z.truck !== STATE.zeroTruck) return false;
      if (STATE.zeroStream !== 'ALL' && z.stream !== STATE.zeroStream) return false;
      if (STATE.zeroClass !== 'ALL' && z.classification.indexOf(STATE.zeroClass) < 0) return false;
      return true;
    });
    var sortKey = STATE.zeroColSort || 'date';
    if (!canSeeRev && sortKey === 'shadow_credit') sortKey = 'date';
    var dirMul = STATE.zeroColDir === 'asc' ? 1 : -1;
    rows.sort(function (a, b) {
      if (sortKey === 'shadow_credit') {
        return (creditForMode(a, STATE.mode) - creditForMode(b, STATE.mode)) * dirMul;
      }
      var va = a[sortKey];
      var vb = b[sortKey];
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dirMul;
      return String(va || '').localeCompare(String(vb || '')) * dirMul;
    });
    return rows;
  }

  function renderZeroTab(model) {
    var p = model.perm;
    var canSeeRev = Boolean(p.canBooks || p.canProfit);
    var hideCo = isSingleCorpScope();
    var actCodes = activeTruckCodes();
    var rows = getFilteredZeroRows(model);
    var shown = rows.slice(0, STATE.zeroLimit);

    var totQty = 0, totCred = 0;
    rows.forEach(function (z) {
      totQty += Number(z.qty_m3 || 0);
      if (canSeeRev) totCred += creditForMode(z, STATE.mode);
    });

    var colCount = hideCo ? 9 : 10;
    var bodyHtml = shown.map(function (z) {
      var cpType = z.table === 'sales_tickets' ? 'customers' : 'suppliers';
      var creditVal = canSeeRev ? creditForMode(z, STATE.mode) : null;
      var creditHtml = !canSeeRev
        ? maskCell()
        : (creditVal > 0 ? `+${esc(fmtMoney(creditVal, 2))}` : '<span class="fpnl-muted">$0.00</span>');
      return `<tr class="rrow" data-rkey="${esc(z.table)}" data-rid="${esc(z.id)}">
        <td class="mono">${esc(fmtDateDisplay(z.date))}</td>
        ${hideCo ? '' : `<td>${coBadgeHtml(z.company)}</td>`}
        <td><span class="badge ${z.stream === 'Sales Delivery' ? 'badge-info' : 'badge-warn'}">${esc(z.stream === 'Sales Delivery' ? 'Sales' : 'Raw')}</span></td>
        <td class="mono">${relLinkHtml('equipment', z.truck, z.truck, true)}</td>
        <td>${relLinkHtml(cpType, z.counterparty, z.counterparty, false)}</td>
        <td>${relLinkHtml('sites', z.site, z.site, false)}</td>
        <td class="r">${fmtNum(z.qty_m3, 1)}</td>
        <td><span class="fpnl-class-note">${esc(z.classification)}</span></td>
        <td class="r fpnl-neg">$0.00</td>
        <td class="r ${creditVal > 0 ? 'fpnl-pos' : ''}"><strong>${creditHtml}</strong></td>
      </tr>`;
    }).join('') || `<tr><td colspan="${colCount}" class="fpnl-empty">Zero unpriced trips in the active filter.</td></tr>`;

    var moreBtn = rows.length > shown.length
      ? `<div class="fpnl-pagination"><span><span>Showing</span> ${shown.length} / ${fmtInt(rows.length)}</span> <button type="button" class="btn btn-ghost-bar" data-fpnl-more="zero"><span>Show 25 More</span> (${fmtInt(rows.length - shown.length)})</button></div>`
      : '';

    return `
      <div class="table-toolbar fpnl-sub-toolbar">
        <div class="fpnl-toolbar-left">
          <button type="button" class="filter-chip${STATE.zeroStream === 'ALL' ? ' active' : ''}" data-fpnl-zero-stream="ALL">All ($0.00)</button>
          <button type="button" class="filter-chip${STATE.zeroStream === 'Sales Delivery' ? ' active' : ''}" data-fpnl-zero-stream="Sales Delivery">Sales Delivery ($4/m³ · $75 if 0 qty)</button>
          <button type="button" class="filter-chip${STATE.zeroStream === 'Raw Material Inbound' ? ' active' : ''}" data-fpnl-zero-stream="Raw Material Inbound">Raw Inbound ($60 Ext. / $0 Int.)</button>
          <select id="fpnlZeroTruck" class="fpnl-select">
            <option value="ALL"${STATE.zeroTruck === 'ALL' ? ' selected' : ''}>All Active Trucks</option>
            ${actCodes.map(function (c) { return `<option value="${esc(c)}"${STATE.zeroTruck === c ? ' selected' : ''}>${esc(c)}</option>`; }).join('')}
          </select>
        </div>
        <div class="fpnl-toolbar-right">
          <span class="fpnl-count-pill">${fmtInt(rows.length)} <span>tickets</span></span>
          <button type="button" class="btn" data-fpnl-csv="zero">CSV</button>
        </div>
      </div>
      <div class="table-wrap fpnl-table-wrap">
        <table class="ledger-table">
          <thead><tr>
            <th class="sortable" data-fpnl-sort="zero:date"><span>Date</span>${sortIndicator(STATE.zeroColSort, STATE.zeroColDir, 'date')}</th>
            ${hideCo ? '' : `<th class="sortable" data-fpnl-sort="zero:company"><span>Co.</span>${sortIndicator(STATE.zeroColSort, STATE.zeroColDir, 'company')}</th>`}
            <th class="sortable" data-fpnl-sort="zero:stream"><span>Stream</span>${sortIndicator(STATE.zeroColSort, STATE.zeroColDir, 'stream')}</th>
            <th class="sortable" data-fpnl-sort="zero:truck"><span>Truck</span>${sortIndicator(STATE.zeroColSort, STATE.zeroColDir, 'truck')}</th>
            <th class="sortable" data-fpnl-sort="zero:counterparty"><span>Counterparty</span>${sortIndicator(STATE.zeroColSort, STATE.zeroColDir, 'counterparty')}</th>
            <th class="sortable" data-fpnl-sort="zero:site"><span>Site</span>${sortIndicator(STATE.zeroColSort, STATE.zeroColDir, 'site')}</th>
            <th class="r sortable" data-fpnl-sort="zero:qty_m3"><span>Qty (m³)</span>${sortIndicator(STATE.zeroColSort, STATE.zeroColDir, 'qty_m3')}</th>
            <th>Classification</th>
            <th class="r">Recorded Fee</th>
            <th class="r sortable" data-fpnl-sort="zero:shadow_credit"><span>Est. Credit ($)</span>${sortIndicator(STATE.zeroColSort, STATE.zeroColDir, 'shadow_credit')}</th>
          </tr></thead>
          <tbody>${bodyHtml}</tbody>
          <tfoot><tr>
            <td colspan="${hideCo ? 5 : 6}"><b><span>TOTAL</span> (${fmtInt(rows.length)})</b></td>
            <td class="r"><b>${fmtNum(totQty, 1)}</b></td>
            <td></td><td class="r"><b>$0.00</b></td>
            <td class="r"><b>${!canSeeRev ? maskCell() : esc(fmtMoney(totCred, 2))}</b></td>
          </tr></tfoot>
        </table>
      </div>
      ${moreBtn}`;
  }

  function mapDriverOtLedgerRows(ds, allowPay, compactSub) {
    var otMapped = (ds.overtimeRows || []).map(function (o) {
      var subTxt = compactSub
        ? `${fmtNum(o.hours, 1)} hrs OT`
        : (allowPay && o.rate != null ? `${fmtNum(o.hours, 1)} hrs @ ${fmtMoney(o.rate, 2)}/h` : `${fmtNum(o.hours, 1)} hrs`);
      return {
        id: o.id, table: o.table, date: o.date, company: o.company,
        truck: o.truck, category: 'Driver & OT',
        subcategory: subTxt,
        bucket: 'Driver & OT', supplier: o.driver,
        bill_number: compactSub ? 'OT' : o.driver, notes: o.notes,
        hours: Number(o.hours || 0),
        total_usd: o.pay, isOtRow: true, isBasePay: false
      };
    });
    return otMapped.concat(ds.driverBaseRows || []);
  }

  function getFilteredExpenses(model, catOverride) {
    var selCodes = activeTruckCodes();
    var p = model.perm || getSeatPermissions();
    var cat = catOverride != null ? catOverride : STATE.expCategory;
    var q = String(STATE.expSearch || '').trim().toLowerCase();

    var sourceRows = cat === 'Driver & OT'
      ? mapDriverOtLedgerRows(model.dataset, p.canPay, false)
      : (cat === 'ALL'
          ? model.dataset.costRows.concat(mapDriverOtLedgerRows(model.dataset, p.canPay, true))
          : filterCostByCategory(cat, model.dataset.costRows));

    var rows = sourceRows.filter(function (e) {
      if (!e.truck || selCodes.indexOf(e.truck) < 0) return false;
      if (STATE.expTruck !== 'ALL' && e.truck !== STATE.expTruck) return false;
      if (cat === 'Driver & OT' && STATE.otDriver !== 'ALL' && e.supplier !== STATE.otDriver) return false;
      if (q) {
        var hay = `${e.truck} ${e.supplier} ${e.bill_number} ${e.notes} ${e.subcategory} ${e.bucket}`.toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });

    var sortKey = STATE.expColSort || 'date';
    var allowSortUsd = cat === 'ALL' ? p.canAllCost : (cat === 'Driver & OT' ? p.canPay : p.canExp);
    if (!allowSortUsd && sortKey === 'total_usd') sortKey = 'date';
    var dirMul = STATE.expColDir === 'asc' ? 1 : -1;
    rows.sort(function (a, b) {
      var va = a[sortKey];
      var vb = b[sortKey];
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dirMul;
      return String(va || '').localeCompare(String(vb || '')) * dirMul;
    });
    return rows;
  }

  function renderOtSnapStrip(model) {
    var ds = model.dataset;
    var os = ds.otSnapAlloc || { snappedLogs: 0, snapDeltaMin: 0, impactedJobCount: 0, snapPremiumUsd: 0, authorizedDollar: false };
    if (!(os.snappedLogs > 0) && STATE.expCategory !== 'Driver & OT') return '';
    var p = model.perm;
    var osMin = Math.round(Number(os.snapDeltaMin || 0));
    var osMinTxt = osMin > 0
      ? `+${fmtNum(osMin, 0)}m OT Snap`
      : (osMin < 0 ? `${fmtNum(osMin, 0)}m OT Trim` : '0m OT Exact');
    var osShowUsd = Boolean(os.authorizedDollar && p.canPay);
    var osUsdSpan = p.canPay
      ? (osShowUsd ? `<span> · </span><span>Snap Premium</span> <strong class="mono">${esc((os.snapPremiumUsd >= 0 ? '+' : '-') + fmtMoney(Math.abs(os.snapPremiumUsd || 0)))}</strong><span> · </span><span>Payroll Driver OT GL $0.00 Delta</span>` : '')
      : '<span> · </span><span>Dollar Amounts Restricted</span>';
    return `<div id="fpnlOtSnapStrip" class="fpnl-otsnap-strip"><span class="job-otsnap-pill ${osMin < 0 ? 'is-trim' : 'is-snap'}" data-no-i18n="1">${esc(osMinTxt)}</span> <span>${fmtInt(os.snappedLogs)}</span> <span>snapped logs</span> · <span>${fmtInt(os.impactedJobCount)}</span> <span>fleet trips</span>${osUsdSpan}</div>`;
  }

  function renderExpensesTab(model) {
    var ds = model.dataset;
    var p = model.perm;
    var hideCo = isSingleCorpScope();
    var actCodes = activeTruckCodes();
    var selSet = {};
    actCodes.forEach(function (c) { selSet[c] = true; });

    var allPhys = ds.costRows.filter(function (c) { return selSet[c.truck]; });
    var fuelSum = 0, fuelCnt = 0, repSum = 0, repCnt = 0, lubInsSum = 0, lubInsCnt = 0;
    allPhys.forEach(function (c) {
      var val = p.canExp ? Number(c.total_usd || 0) : 0;
      if (c.bucket === 'Diesel Fuel') { fuelSum += val; fuelCnt++; }
      else if (c.bucket === 'Repairs & Parts') { repSum += val; repCnt++; }
      else if (c.bucket === 'Lubes & Insurance') { lubInsSum += val; lubInsCnt++; }
    });
    var otRowsAct = ds.overtimeRows.filter(function (o) { return selSet[o.truck]; });
    var baseRowsAct = (ds.driverBaseRows || []).filter(function (b) { return selSet[b.truck]; });
    var drvOtSum = p.canPay ? Number(model.activeTotal.driverCost || 0) : 0;

    var scopedDriverMap = {};
    otRowsAct.forEach(function (o) {
      var nm = String(o.driver || '').trim();
      if (!nm) return;
      if (!scopedDriverMap[nm]) scopedDriverMap[nm] = { driver: nm, entries: 0, hours: 0, totalPay: 0 };
      scopedDriverMap[nm].entries += 1;
      scopedDriverMap[nm].hours += Number(o.hours || 0);
      if (p.canPay) scopedDriverMap[nm].totalPay += Number(o.pay || 0);
    });
    baseRowsAct.forEach(function (b) {
      var nm = String(b.supplier || '').trim();
      if (!nm) return;
      if (!scopedDriverMap[nm]) scopedDriverMap[nm] = { driver: nm, entries: 0, hours: 0, totalPay: 0 };
      scopedDriverMap[nm].entries += 1;
      if (p.canPay) scopedDriverMap[nm].totalPay += Number(b.total_usd || 0);
    });
    if (STATE.otDriver !== 'ALL' && !scopedDriverMap[STATE.otDriver]) {
      STATE.otDriver = 'ALL';
    }
    var scopedDrivers = Object.keys(scopedDriverMap).map(function (dk) { return scopedDriverMap[dk]; })
      .sort(function (a, b) { return (b.hours - a.hours) || (b.totalPay - a.totalPay) || (b.entries - a.entries); });

    var catDefs = [
      { id: 'ALL', label: 'All Operating Costs', val: p.canAllCost ? fmtMoney(fuelSum + repSum + lubInsSum + drvOtSum, 2) : null, n: fmtInt(allPhys.length + otRowsAct.length + baseRowsAct.length), unit: 'logs' },
      { id: 'Diesel Fuel', label: 'Diesel Fuel (Out)', val: p.canExp ? fmtMoney(fuelSum, 2) : null, n: fmtInt(fuelCnt), unit: 'fills' },
      { id: 'Repairs & Parts', label: 'Repairs & Parts', val: p.canExp ? fmtMoney(repSum, 2) : null, n: fmtInt(repCnt), unit: 'bills' },
      { id: 'Lubes & Insurance', label: 'Lubes & Insurance', val: p.canExp ? fmtMoney(lubInsSum, 2) : null, n: fmtInt(lubInsCnt), unit: 'entries' },
      { id: 'Driver & OT', label: 'Driver & OT', val: p.canPay ? fmtMoney(drvOtSum, 2) : null, n: fmtNum(model.activeTotal.driverOtHours, 0), unit: 'hrs' }
    ];

    var catGrid = `<div class="fpnl-cat-grid">
      ${catDefs.map(function (c) {
        var on = STATE.expCategory === c.id;
        return `<button type="button" class="fpnl-cat-card${on ? ' active' : ''}" data-fpnl-exp-card="${esc(c.id)}">
          <div class="fpnl-cat-lbl">${esc(c.label)}</div>
          <div class="fpnl-cat-val">${c.val != null ? esc(c.val) : maskCell()}</div>
          <div class="fpnl-cat-sub">${c.n} <span>${esc(c.unit)}</span></div>
        </button>`;
      }).join('')}
    </div>`;

    var otStrip = (STATE.expCategory === 'Driver & OT' || STATE.expCategory === 'ALL') ? renderOtSnapStrip(model) : '';

    var driverPills = '';
    if (STATE.expCategory === 'Driver & OT' && scopedDrivers.length) {
      driverPills = `<div class="fpnl-driver-pills">
        <button type="button" class="filter-chip${STATE.otDriver === 'ALL' ? ' active' : ''}" data-fpnl-ot-driver="ALL"><span>All Drivers</span> (${scopedDrivers.length})</button>
        ${scopedDrivers.slice(0, 12).map(function (d) {
          var on = STATE.otDriver === d.driver;
          return `<button type="button" class="filter-chip${on ? ' active' : ''}" data-fpnl-ot-driver="${esc(d.driver)}">${esc(d.driver)} · ${fmtNum(d.hours, 0)}h${p.canPay ? ` (${esc(fmtMoney(d.totalPay, 0))})` : ''}</button>`;
        }).join('')}
      </div>`;
    }

    var rows = getFilteredExpenses(model);
    var shown = rows.slice(0, STATE.expLimit);

    var totalAuthorized = STATE.expCategory === 'ALL' ? p.canAllCost : (STATE.expCategory === 'Driver & OT' ? p.canPay : p.canExp);
    var totUsd = 0;
    if (totalAuthorized) {
      rows.forEach(function (e) { totUsd += Number(e.total_usd || 0); });
    }

    var colCount = hideCo ? 8 : 9;
    var bodyHtml = shown.map(function (e) {
      var canSeeThisCost = e.isOtRow ? p.canPay : p.canExp;
      var rowAttrs = e.id ? `class="rrow" data-rkey="${esc(e.table)}" data-rid="${esc(e.id)}"` : 'class="fpnl-static-row"';
      var partyHtml = e.isOtRow
        ? (e.supplier && e.supplier !== 'Assigned Driver' ? relLinkHtml('drivers', e.supplier, e.supplier, false) : esc(e.supplier))
        : (e.table === 'expenses' ? relLinkHtml('suppliers', e.supplier, e.supplier, false) : esc(e.supplier));
      var subHtml = e.subTag ? `<span class="badge badge-info">${esc(e.subTag)}</span> ${esc(e.subcategory)}` : esc(e.subcategory);

      return `<tr ${rowAttrs}>
        <td class="mono">${esc(fmtDateDisplay(e.date))}</td>
        ${hideCo ? '' : `<td>${coBadgeHtml(e.company)}</td>`}
        <td><span class="badge ${e.bucket === 'Diesel Fuel' ? 'badge-warn' : (e.bucket === 'Driver & OT' ? 'badge-info' : 'badge-ok')}">${esc(e.bucket)}</span></td>
        <td class="mono">${e.truck && e.truck !== 'Pool' ? relLinkHtml('equipment', e.truck, e.truck, true) : esc(e.truck || '—')}</td>
        <td>${partyHtml}</td>
        <td>${subHtml}</td>
        <td class="mono">${esc(e.bill_number)}</td>
        <td>${esc(e.notes)}</td>
        <td class="r"><strong>${canSeeThisCost ? esc(fmtMoney(e.total_usd, 2)) : maskCell()}</strong></td>
      </tr>`;
    }).join('') || `<tr><td colspan="${colCount}" class="fpnl-empty">No cost logs match the active filter.</td></tr>`;

    var moreBtn = rows.length > shown.length
      ? `<div class="fpnl-pagination"><span><span>Showing</span> ${shown.length} / ${fmtInt(rows.length)}</span> <button type="button" class="btn btn-ghost-bar" data-fpnl-more="expenses"><span>Show 25 More</span> (${fmtInt(rows.length - shown.length)})</button></div>`
      : '';

    return `${catGrid}${otStrip}${driverPills}
      <div class="table-toolbar fpnl-sub-toolbar">
        <div class="fpnl-toolbar-left">
          <input type="text" id="fpnlExpSearch" class="fpnl-search-input" placeholder="Search supplier, driver, oil, part, or bill #..." value="${esc(STATE.expSearch)}" />
          <select id="fpnlExpTruck" class="fpnl-select">
            <option value="ALL"${STATE.expTruck === 'ALL' ? ' selected' : ''}>All Active Trucks</option>
            ${actCodes.map(function (c) { return `<option value="${esc(c)}"${STATE.expTruck === c ? ' selected' : ''}>${esc(c)}</option>`; }).join('')}
          </select>
        </div>
        <div class="fpnl-toolbar-right">
          <span class="fpnl-count-pill">${fmtInt(rows.length)} <span>logs</span></span>
          <button type="button" class="btn" data-fpnl-csv="expenses">CSV</button>
        </div>
      </div>
      <div class="table-wrap fpnl-table-wrap">
        <table class="ledger-table">
          <thead><tr>
            <th class="sortable" data-fpnl-sort="expenses:date"><span>Date</span>${sortIndicator(STATE.expColSort, STATE.expColDir, 'date')}</th>
            ${hideCo ? '' : `<th class="sortable" data-fpnl-sort="expenses:company"><span>Co.</span>${sortIndicator(STATE.expColSort, STATE.expColDir, 'company')}</th>`}
            <th class="sortable" data-fpnl-sort="expenses:bucket"><span>Bucket</span>${sortIndicator(STATE.expColSort, STATE.expColDir, 'bucket')}</th>
            <th class="sortable" data-fpnl-sort="expenses:truck"><span>Truck</span>${sortIndicator(STATE.expColSort, STATE.expColDir, 'truck')}</th>
            <th class="sortable" data-fpnl-sort="expenses:supplier"><span>Vendor / Driver</span>${sortIndicator(STATE.expColSort, STATE.expColDir, 'supplier')}</th>
            <th>Detail / Category</th>
            <th>Ref #</th>
            <th>Notes</th>
            <th class="r sortable" data-fpnl-sort="expenses:total_usd"><span>Cost ($)</span>${sortIndicator(STATE.expColSort, STATE.expColDir, 'total_usd')}</th>
          </tr></thead>
          <tbody>${bodyHtml}</tbody>
          <tfoot><tr>
            <td colspan="${hideCo ? 7 : 8}"><b><span>TOTAL</span> (${fmtInt(rows.length)})</b></td>
            <td class="r"><b>${totalAuthorized ? esc(fmtMoney(totUsd, 2)) : maskCell()}</b></td>
          </tr></tfoot>
        </table>
      </div>
      ${moreBtn}`;
  }

  function renderBody(model) {
    if (STATE.subtab === 'routes') return renderRoutesTab(model);
    if (STATE.subtab === 'zero') return renderZeroTab(model);
    if (STATE.subtab === 'expenses') return renderExpensesTab(model);
    return renderPnlTab(model);
  }

  function buildInnerHtml(containerId, slicerEquipment) {
    syncCompanyFilterIfChanged();
    if (slicerEquipment !== undefined) {
      var slCode = slicerEquipment ? normTruckCode(slicerEquipment) : '';
      if (slCode && STATE.slicerEquipment !== slCode) {
        STATE.slicerEquipment = slCode;
        STATE.focusedTruck = slCode;
      } else if (!slCode && STATE.slicerEquipment) {
        STATE.slicerEquipment = '';
        STATE.focusedTruck = 'ALL';
      }
    }
    if (STATE.subtab === 'overtime') {
      STATE.subtab = 'expenses';
      STATE.expCategory = 'Driver & OT';
    }
    var model = computeModel();
    return renderHeader(model) +
      renderFormulaBar(model) +
      renderFilterDeck(model) +
      renderTabs(model) +
      renderKpiCards(model) +
      `<div class="fpnl-body">${renderBody(model)}</div>`;
  }

  function renderCockpitHtml(opts) {
    opts = opts || {};
    var cid = opts.containerId || 'fleetRevCostCockpit';
    return `<section class="fpnl-cockpit" id="${esc(cid)}" data-fpnl-root="1">${buildInnerHtml(cid, opts.slicerEquipment)}</section>`;
  }

  function enhanceContainerDom(el) {
    if (!el) return;
    var i18n = window.MFG_I18N;
    if (i18n && typeof i18n.getLang === 'function' && i18n.getLang() !== 'en' && typeof i18n.translateDom === 'function') {
      try { i18n.translateDom(el); } catch (_) {}
    }
    var tc = window.MFG_TABLE_COLS;
    var ent = window.MFG_ENTERPRISE;
    if (tc && typeof tc.enhanceAllTables === 'function') {
      try { tc.enhanceAllTables(el, (ent && ent.state) || window.STATE); } catch (_) {}
    }
  }

  function renderFullCockpit(el) {
    if (!el) return;
    el.innerHTML = buildInnerHtml(el.id || 'fleetRevCostCockpit');
    enhanceContainerDom(el);
  }

  function refreshAllMountedCockpits() {
    ['fleetRevCostCockpit', 'pbiFleetRevCostCockpit'].forEach(function (cid) {
      var el = document.getElementById(cid);
      if (el) renderFullCockpit(el);
    });
  }

  function syncAppOnFocusChange(scrollToStudio) {
    var ent = window.MFG_ENTERPRISE;
    var st = (ent && ent.state) || window.STATE || {};
    if (ent && typeof ent.renderApp === 'function' && st.view === 'fleet_equip') {
      var ma = document.querySelector('.main-area');
      var prevTop = ma ? ma.scrollTop : window.scrollY;
      ent.renderApp();
      requestAnimationFrame(function () {
        if (scrollToStudio) {
          var ck = document.getElementById('fleetRevCostCockpit');
          if (ck && ck.scrollIntoView) ck.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (ma) {
          ma.scrollTop = prevTop;
        }
      });
    } else {
      refreshAllMountedCockpits();
    }
  }

  function csvCell(v) {
    var s = String(v == null ? '' : v).replace(/\r?\n/g, ' ');
    return `"${s.replace(/"/g, '""')}"`;
  }

  function downloadCsvFile(kind) {
    var model = computeModel();
    var p = model.perm;
    var lines = [];
    var filename = `Fleet_Studio_${kind}.csv`;
    if (kind === 'matrix') {
      lines.push(['Truck', 'Plate', 'Trips', 'Qty_m3', 'Booked_USD', 'Unbundled_USD', 'TotalRev_USD', 'Diesel_USD', 'Maint_USD', 'DriverOT_USD', 'TotalCost_USD', 'NetMargin_USD'].join(','));
      model.activeMetrics.forEach(function (m) {
        lines.push([
          m.displayCode, m.plate, m.totalTrips, m.totalQtyM3.toFixed(2),
          (p.canBooks || p.canProfit) ? m.recordedRev.toFixed(2) : 'Restricted',
          (p.canBooks || p.canProfit) ? m.creditRev.toFixed(2) : 'Restricted',
          (p.canBooks || p.canProfit) ? m.totalRev.toFixed(2) : 'Restricted',
          p.canExp ? m.dieselCost.toFixed(2) : 'Restricted',
          p.canExp ? m.maintCost.toFixed(2) : 'Restricted',
          p.canPay ? m.driverCost.toFixed(2) : 'Restricted',
          p.canAllCost ? m.totalCost.toFixed(2) : 'Restricted',
          (p.canProfit && p.canAllCost) ? m.netProfit.toFixed(2) : 'Restricted'
        ].map(csvCell).join(','));
      });
    } else if (kind === 'routes') {
      filename = 'Fleet_Corridors.csv';
      var canSeeRouteRev = Boolean(p.canBooks || p.canProfit);
      lines.push(['Company', 'Stream', 'Truck', 'Counterparty', 'Site', 'Material', 'Trips', 'ZeroTrips', 'Qty_m3', 'Booked_USD', 'Addon_USD'].join(','));
      getFilteredRoutes(model).forEach(function (r) {
        lines.push([
          r.company, r.stream, r.truck, r.counterparty, r.site, r.material,
          r.trips, r.zeroTrips, r.qtyM3.toFixed(2),
          canSeeRouteRev ? Number(r.rev || 0).toFixed(2) : 'Restricted',
          canSeeRouteRev ? creditForMode(r, STATE.mode).toFixed(2) : 'Restricted'
        ].map(csvCell).join(','));
      });
    } else if (kind === 'zero') {
      filename = 'Fleet_Unpriced_Loads.csv';
      var canSeeZeroRev = Boolean(p.canBooks || p.canProfit);
      lines.push(['Date', 'Company', 'Stream', 'Truck', 'Counterparty', 'Site', 'Qty_m3', 'Classification', 'Recorded_USD', 'EstCredit_USD'].join(','));
      getFilteredZeroRows(model).forEach(function (z) {
        var cv = creditForMode(z, STATE.mode);
        lines.push([
          fmtDateDisplay(z.date), z.company, z.stream, z.truck, z.counterparty, z.site,
          Number(z.qty_m3 || 0).toFixed(2), z.classification, '0.00',
          canSeeZeroRev ? Number(cv || 0).toFixed(2) : 'Restricted'
        ].map(csvCell).join(','));
      });
    } else if (kind === 'expenses') {
      filename = 'Fleet_Operating_Costs.csv';
      lines.push(['Date', 'Company', 'Bucket', 'Truck', 'Vendor_or_Driver', 'Detail', 'Ref', 'Notes', 'Cost_USD'].join(','));
      getFilteredExpenses(model).forEach(function (e) {
        var allow = e.isOtRow ? p.canPay : p.canExp;
        lines.push([
          fmtDateDisplay(e.date), e.company, e.bucket, e.truck, e.supplier, e.subcategory,
          e.bill_number, e.notes, allow ? Number(e.total_usd || 0).toFixed(2) : 'Restricted'
        ].map(csvCell).join(','));
      });
    }
    if (!lines.length) return;
    var blob = new Blob([`\ufeff${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 250);
  }

  function findCockpitRoot(el) {
    return el && el.closest ? el.closest('[data-fpnl-root="1"]') : null;
  }

  function bindGlobalCockpitEvents() {
    if (window.__fpnlEventsBound) return;
    window.__fpnlEventsBound = true;

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && (STATE.rulesOpen || STATE.truckPickerOpen)) {
        STATE.rulesOpen = false;
        STATE.truckPickerOpen = false;
        refreshAllMountedCockpits();
      }
    });

    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;

      var extUnitBtn = t.closest('[data-fpnl-focus-unit]');
      if (extUnitBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        var unitCode = normTruckCode(extUnitBtn.getAttribute('data-fpnl-focus-unit') || '');
        if (unitCode) {
          STATE.focusedTruck = STATE.focusedTruck === unitCode ? 'ALL' : unitCode;
          STATE.subtab = 'pnl';
          STATE.pnlView = 'visual';
          syncAppOnFocusChange(true);
        }
        return;
      }

      var clrFocusBtn = t.closest('[data-fpnl-clear-focus]');
      if (clrFocusBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        STATE.focusedTruck = 'ALL';
        syncAppOnFocusChange(false);
        return;
      }

      var jumpBtn = t.closest('[data-fpnl-jump]');
      if (jumpBtn) {
        var jTab = jumpBtn.getAttribute('data-fpnl-jump');
        STATE.focusedTruck = 'ALL';
        if (jTab === 'overtime') {
          STATE.subtab = 'expenses';
          STATE.expCategory = 'Driver & OT';
        } else {
          STATE.subtab = jTab || 'pnl';
        }
        var ent = window.MFG_ENTERPRISE;
        if (ent && typeof ent.setView === 'function') ent.setView('fleet_equip');
        requestAnimationFrame(function () {
          var ck = document.getElementById('fleetRevCostCockpit');
          if (ck && ck.scrollIntoView) ck.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        return;
      }

      if ((STATE.rulesOpen || STATE.truckPickerOpen) && !t.closest('.fpnl-rules-wrap, .fpnl-picker-wrap')) {
        STATE.rulesOpen = false;
        STATE.truckPickerOpen = false;
        refreshAllMountedCockpits();
      }

      var container = findCockpitRoot(t);
      if (!container) return;

      if (t.closest('[data-rel-key]')) return;

      var rulesBtn = t.closest('[data-fpnl-rules-toggle]');
      if (rulesBtn) {
        STATE.rulesOpen = !STATE.rulesOpen;
        STATE.truckPickerOpen = false;
        renderFullCockpit(container);
        return;
      }

      var jumpRuleBtn = t.closest('[data-fpnl-jump-rule]');
      if (jumpRuleBtn) {
        STATE.rulesOpen = false;
        STATE.subtab = jumpRuleBtn.getAttribute('data-fpnl-jump-rule') || 'expenses';
        var cat = jumpRuleBtn.getAttribute('data-fpnl-jump-cat');
        if (cat) STATE.expCategory = cat;
        renderFullCockpit(container);
        return;
      }

      var pickerBtn = t.closest('[data-fpnl-picker-toggle]');
      if (pickerBtn) {
        STATE.truckPickerOpen = !STATE.truckPickerOpen;
        STATE.rulesOpen = false;
        renderFullCockpit(container);
        if (STATE.truckPickerOpen && !isCoarsePointer()) {
          var pInp = container.querySelector('#fpnlTruckSearchInput');
          if (pInp) pInp.focus();
        }
        return;
      }

      var tglCb = t.closest('[data-fpnl-toggle-truck]');
      if (tglCb) {
        var code = tglCb.getAttribute('data-fpnl-toggle-truck');
        var cur = selectedTruckCodes();
        var next;
        if (cur.indexOf(code) >= 0) {
          next = cur.filter(function (c) { return c !== code; });
          if (!next.length) next = [code];
        } else {
          next = cur.concat([code]);
        }
        STATE.cohort = 'custom';
        STATE.selectedTrucks = next;
        STATE.focusedTruck = 'ALL';
        renderFullCockpit(container);
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
        var tb = tabBtn.getAttribute('data-fpnl-tab') || 'pnl';
        STATE.subtab = tb === 'overtime' ? 'expenses' : tb;
        if (tb === 'overtime') STATE.expCategory = 'Driver & OT';
        renderFullCockpit(container);
        return;
      }

      var pnlViewBtn = t.closest('[data-fpnl-pnl-view]');
      if (pnlViewBtn) {
        STATE.pnlView = pnlViewBtn.getAttribute('data-fpnl-pnl-view') || 'visual';
        renderFullCockpit(container);
        return;
      }

      var cohBtn = t.closest('[data-fpnl-cohort]');
      if (cohBtn) {
        STATE.cohort = cohBtn.getAttribute('data-fpnl-cohort') || 'own_partner';
        STATE.selectedTrucks = [];
        STATE.focusedTruck = 'ALL';
        STATE.routeTruck = 'ALL';
        STATE.zeroTruck = 'ALL';
        STATE.expTruck = 'ALL';
        syncAppOnFocusChange(false);
        return;
      }

      var focBtn = t.closest('[data-fpnl-focus]');
      if (focBtn) {
        var fCode = focBtn.getAttribute('data-fpnl-focus') || 'ALL';
        STATE.focusedTruck = (fCode !== 'ALL' && STATE.focusedTruck === fCode) ? 'ALL' : fCode;
        syncAppOnFocusChange(false);
        return;
      }

      var resetPerBtn = t.closest('[data-fpnl-reset-period]');
      if (resetPerBtn) {
        var entReset = window.MFG_ENTERPRISE;
        if (entReset && typeof entReset.setDateFilter === 'function') entReset.setDateFilter({ reset: true });
        return;
      }

      var filterMonth = t.closest('[data-fpnl-filter-month]');
      if (filterMonth) {
        var ym = filterMonth.getAttribute('data-fpnl-filter-month') || '';
        if (ym && /^\d{4}-\d{2}$/.test(ym) && window.MFG_ENTERPRISE && typeof window.MFG_ENTERPRISE.setDateFilter === 'function') {
          window.MFG_ENTERPRISE.setDateFilter({ period: `month:${ym}` });
        }
        return;
      }

      var drillBtn = t.closest('[data-fpnl-drill]');
      if (drillBtn) {
        var dtTab = drillBtn.getAttribute('data-fpnl-drill') || 'pnl';
        var dtTruck = drillBtn.getAttribute('data-fpnl-drill-truck');
        var dtCat = drillBtn.getAttribute('data-fpnl-drill-cat');
        if (dtTruck) {
          STATE.routeTruck = dtTruck;
          STATE.zeroTruck = dtTruck;
          STATE.expTruck = dtTruck;
        }
        if (dtTab === 'overtime') {
          STATE.subtab = 'expenses';
          STATE.expCategory = 'Driver & OT';
        } else {
          STATE.subtab = dtTab;
          if (dtCat) STATE.expCategory = dtCat;
        }
        renderFullCockpit(container);
        return;
      }

      var zeroStreamBtn = t.closest('[data-fpnl-zero-stream]');
      if (zeroStreamBtn) {
        STATE.zeroStream = zeroStreamBtn.getAttribute('data-fpnl-zero-stream') || 'ALL';
        STATE.zeroLimit = PAGE_SIZE;
        renderFullCockpit(container);
        return;
      }

      var expCardBtn = t.closest('[data-fpnl-exp-card]');
      if (expCardBtn) {
        STATE.expCategory = expCardBtn.getAttribute('data-fpnl-exp-card') || 'ALL';
        STATE.expLimit = PAGE_SIZE;
        renderFullCockpit(container);
        return;
      }

      var otDrvBtn = t.closest('[data-fpnl-ot-driver]');
      if (otDrvBtn) {
        STATE.otDriver = otDrvBtn.getAttribute('data-fpnl-ot-driver') || 'ALL';
        STATE.expLimit = PAGE_SIZE;
        renderFullCockpit(container);
        return;
      }

      var corrExpBtn = t.closest('[data-fpnl-corridor-expand]');
      if (corrExpBtn && !t.closest('.fpnl-corridor-drawer')) {
        var cKey = corrExpBtn.getAttribute('data-fpnl-corridor-expand') || '';
        STATE.expandedRouteKey = STATE.expandedRouteKey === cKey ? '' : cKey;
        renderFullCockpit(container);
        return;
      }

      var sortBtn = t.closest('[data-fpnl-sort]');
      if (sortBtn) {
        var sp = String(sortBtn.getAttribute('data-fpnl-sort') || '').split(':');
        if (sp.length === 2) {
          var tblKind = sp[0], col = sp[1];
          if (tblKind === 'routes') {
            STATE.routeSort = '';
            STATE.routeColDir = STATE.routeColSort === col && STATE.routeColDir === 'desc' ? 'asc' : 'desc';
            STATE.routeColSort = col;
          } else if (tblKind === 'zero') {
            STATE.zeroColDir = STATE.zeroColSort === col && STATE.zeroColDir === 'desc' ? 'asc' : 'desc';
            STATE.zeroColSort = col;
          } else if (tblKind === 'expenses') {
            STATE.expColDir = STATE.expColSort === col && STATE.expColDir === 'desc' ? 'asc' : 'desc';
            STATE.expColSort = col;
          }
          renderFullCockpit(container);
        }
        return;
      }

      var moreBtn = t.closest('[data-fpnl-more]');
      if (moreBtn) {
        var mk = moreBtn.getAttribute('data-fpnl-more');
        if (mk === 'routes') STATE.routeLimit += PAGE_SIZE;
        else if (mk === 'zero') STATE.zeroLimit += PAGE_SIZE;
        else if (mk === 'expenses') STATE.expLimit += PAGE_SIZE;
        renderFullCockpit(container);
        return;
      }

      var csvBtn = t.closest('[data-fpnl-csv]');
      if (csvBtn) {
        downloadCsvFile(csvBtn.getAttribute('data-fpnl-csv'));
      }
    });

    document.addEventListener('change', function (ev) {
      var el = ev.target;
      var container = findCockpitRoot(el);
      if (!el || !container) return;
      if (el.id === 'fpnlZeroTruck') { STATE.zeroTruck = el.value; STATE.zeroLimit = PAGE_SIZE; renderFullCockpit(container); }
      else if (el.id === 'fpnlRouteTruck') { STATE.routeTruck = el.value; STATE.routeLimit = PAGE_SIZE; renderFullCockpit(container); }
      else if (el.id === 'fpnlRouteSort') {
        STATE.routeSort = el.value;
        STATE.routeColSort = 'trips';
        STATE.routeColDir = 'desc';
        renderFullCockpit(container);
      }
      else if (el.id === 'fpnlExpTruck') { STATE.expTruck = el.value; STATE.expLimit = PAGE_SIZE; renderFullCockpit(container); }
    });

    document.addEventListener('input', function (ev) {
      var el = ev.target;
      var container = findCockpitRoot(el);
      if (!el || !container) return;
      var selStart = typeof el.selectionStart === 'number' ? el.selectionStart : (el.value || '').length;
      var targetId = el.id;
      if (targetId === 'fpnlTruckSearchInput') STATE.truckPickerQuery = el.value || '';
      else if (targetId === 'fpnlRouteSearch') { STATE.routeSearch = el.value || ''; STATE.routeLimit = PAGE_SIZE; }
      else if (targetId === 'fpnlExpSearch') { STATE.expSearch = el.value || ''; STATE.expLimit = PAGE_SIZE; }
      else return;
      renderFullCockpit(container);
      var nextInp = container.querySelector(`#${targetId}`);
      if (nextInp) {
        nextInp.focus();
        try { nextInp.setSelectionRange(selStart, selStart); } catch (_) {}
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
    getEquipmentSyncFilter: getEquipmentSyncFilter,
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
